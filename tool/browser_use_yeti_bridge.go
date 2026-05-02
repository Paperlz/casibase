// Copyright 2026 The OpenAgent Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package tool

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const yetiBridgeDefaultAddress = "127.0.0.1:9010"

type yetiBridgeManager struct {
	mu       sync.Mutex
	sessions map[string]*yetiBridgeSession
}

type yetiBridgeSession struct {
	mu       sync.Mutex
	writeMu  sync.Mutex
	address  string
	clientID string
	server   *http.Server
	socket   *websocket.Conn
	hello    *yetiBridgeHello
	pending  map[string]*yetiBridgePending
}

type yetiBridgePending struct {
	command string
	done    chan yetiBridgeCallResult
}

type yetiBridgeCallResult struct {
	raw json.RawMessage
	err error
}

type yetiBridgeHello struct {
	Client  string `json:"client"`
	Version string `json:"version"`
}

var globalYetiBridgeManager = &yetiBridgeManager{sessions: map[string]*yetiBridgeSession{}}

var yetiBridgeUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func parseYetiBridgeAddress(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return yetiBridgeDefaultAddress, nil
	}

	if isPortOnly(value) {
		return net.JoinHostPort("127.0.0.1", value), nil
	}

	if strings.Contains(value, "://") {
		parsed, err := url.Parse(value)
		if err != nil {
			return "", fmt.Errorf("invalid YetiBrowser bridge address %q: %w", raw, err)
		}
		if parsed.Scheme != "ws" && parsed.Scheme != "http" {
			return "", fmt.Errorf("YetiBrowser bridge address must use ws:// or http:// for local demo mode")
		}
		value = parsed.Host
	}

	host, port, err := splitYetiBridgeHostPort(value)
	if err != nil {
		return "", err
	}
	if host == "" {
		host = "127.0.0.1"
	}
	if !isYetiBridgeLoopbackHost(host) {
		return "", fmt.Errorf("YetiBrowser bridge address must bind to localhost or 127.0.0.1, got %q", host)
	}
	if err = validateYetiBridgePort(port); err != nil {
		return "", err
	}
	return net.JoinHostPort("127.0.0.1", port), nil
}

func splitYetiBridgeHostPort(value string) (string, string, error) {
	host, port, err := net.SplitHostPort(value)
	if err == nil {
		return host, port, nil
	}

	if strings.Count(value, ":") == 1 {
		parts := strings.SplitN(value, ":", 2)
		return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]), nil
	}
	return "", "", fmt.Errorf("invalid YetiBrowser bridge address %q; use 9010, 127.0.0.1:9010, or ws://127.0.0.1:9010", value)
}

func validateYetiBridgePort(port string) error {
	if !isPortOnly(port) {
		return fmt.Errorf("invalid YetiBrowser bridge port %q", port)
	}
	value, err := strconv.Atoi(port)
	if err != nil || value <= 0 || value > 65535 {
		return fmt.Errorf("invalid YetiBrowser bridge port %q", port)
	}
	return nil
}

func isPortOnly(value string) bool {
	if value == "" {
		return false
	}
	for _, ch := range value {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}

func isYetiBridgeLoopbackHost(host string) bool {
	host = strings.Trim(strings.ToLower(strings.TrimSpace(host)), "[]")
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (m *yetiBridgeManager) get(address string, clientID string) (*yetiBridgeSession, error) {
	m.mu.Lock()
	session, ok := m.sessions[address]
	if !ok {
		session = &yetiBridgeSession{
			address:  address,
			clientID: clientID,
			pending:  map[string]*yetiBridgePending{},
		}
		m.sessions[address] = session
	}
	m.mu.Unlock()

	if err := session.start(); err != nil {
		return nil, err
	}
	return session, nil
}

func (m *yetiBridgeManager) close(address string) {
	m.mu.Lock()
	session, ok := m.sessions[address]
	if ok {
		delete(m.sessions, address)
	}
	m.mu.Unlock()

	if ok {
		session.close()
	}
}

func (s *yetiBridgeSession) start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.server != nil {
		return nil
	}

	listener, err := net.Listen("tcp", s.address)
	if err != nil {
		return fmt.Errorf("failed to start YetiBrowser bridge at %s: %w. Close other bridge servers or set Provider URL to another local port", s.publicURL(), err)
	}
	s.address = listener.Addr().String()

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleHTTP)
	server := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	s.server = server

	go func() {
		if serveErr := server.Serve(listener); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			s.rejectAll(fmt.Errorf("YetiBrowser bridge server stopped: %w", serveErr))
		}
	}()
	return nil
}

func (s *yetiBridgeSession) handleHTTP(w http.ResponseWriter, r *http.Request) {
	if !isYetiBridgeLoopbackRemote(r.RemoteAddr) {
		http.Error(w, "YetiBrowser bridge only accepts localhost connections", http.StatusForbidden)
		return
	}
	if !websocket.IsWebSocketUpgrade(r) {
		_, _ = fmt.Fprintf(w, "Casibase YetiBrowser bridge is listening at %s\n", s.publicURL())
		return
	}

	socket, err := yetiBridgeUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.accept(socket)
}

func isYetiBridgeLoopbackRemote(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return false
	}
	return isYetiBridgeLoopbackHost(host)
}

func (s *yetiBridgeSession) accept(socket *websocket.Conn) {
	s.mu.Lock()
	oldSocket := s.socket
	s.socket = socket
	s.hello = nil
	s.rejectAllPendingLocked(errors.New("YetiBrowser extension connection was replaced"))
	s.mu.Unlock()

	if oldSocket != nil {
		_ = oldSocket.Close()
	}
	go s.readLoop(socket)
}

func (s *yetiBridgeSession) readLoop(socket *websocket.Conn) {
	for {
		_, data, err := socket.ReadMessage()
		if err != nil {
			s.mu.Lock()
			if s.socket == socket {
				s.socket = nil
				s.hello = nil
				s.rejectAllPendingLocked(errors.New("YetiBrowser extension disconnected"))
			}
			s.mu.Unlock()
			return
		}
		s.handleMessage(data)
	}
}

func (s *yetiBridgeSession) handleMessage(data []byte) {
	var envelope struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return
	}

	switch envelope.Type {
	case "hello":
		var message struct {
			Type    string `json:"type"`
			Client  string `json:"client"`
			Version string `json:"version"`
		}
		if err := json.Unmarshal(data, &message); err != nil {
			return
		}
		s.mu.Lock()
		s.hello = &yetiBridgeHello{Client: message.Client, Version: message.Version}
		s.mu.Unlock()
	case "event":
		return
	case "result":
		var message struct {
			Type   string          `json:"type"`
			ID     string          `json:"id"`
			OK     bool            `json:"ok"`
			Result json.RawMessage `json:"result"`
			Error  string          `json:"error"`
		}
		if err := json.Unmarshal(data, &message); err != nil {
			return
		}
		s.mu.Lock()
		pending := s.pending[message.ID]
		if pending != nil {
			delete(s.pending, message.ID)
		}
		s.mu.Unlock()
		if pending == nil {
			return
		}
		if !message.OK {
			errText := strings.TrimSpace(message.Error)
			if errText == "" {
				errText = fmt.Sprintf("YetiBrowser command %q failed", pending.command)
			}
			pending.done <- yetiBridgeCallResult{err: errors.New(errText)}
			return
		}
		if len(message.Result) == 0 {
			message.Result = json.RawMessage("null")
		}
		pending.done <- yetiBridgeCallResult{raw: message.Result}
	}
}

func (s *yetiBridgeSession) call(ctx context.Context, command string, payload interface{}) (json.RawMessage, error) {
	if err := s.start(); err != nil {
		return nil, err
	}
	if ctx == nil {
		ctx = context.Background()
	}

	id := uuid.NewString()
	message := map[string]interface{}{
		"type":    "call",
		"id":      id,
		"command": command,
		"payload": payload,
	}
	if payload == nil {
		message["payload"] = map[string]interface{}{}
	}
	raw, err := json.Marshal(message)
	if err != nil {
		return nil, err
	}

	pending := &yetiBridgePending{
		command: command,
		done:    make(chan yetiBridgeCallResult, 1),
	}

	s.mu.Lock()
	socket := s.socket
	if socket == nil {
		s.mu.Unlock()
		return nil, s.notConnectedError()
	}
	s.pending[id] = pending
	s.mu.Unlock()

	s.writeMu.Lock()
	err = socket.WriteMessage(websocket.TextMessage, raw)
	s.writeMu.Unlock()
	if err != nil {
		s.removePending(id)
		return nil, fmt.Errorf("failed to send YetiBrowser command %q: %w", command, err)
	}

	timer := time.NewTimer(browserUseDefaultTimeout)
	defer timer.Stop()

	select {
	case result := <-pending.done:
		return result.raw, result.err
	case <-ctx.Done():
		s.removePending(id)
		return nil, ctx.Err()
	case <-timer.C:
		s.removePending(id)
		return nil, fmt.Errorf("YetiBrowser command %q timed out after %s", command, browserUseDefaultTimeout)
	}
}

func (s *yetiBridgeSession) removePending(id string) {
	s.mu.Lock()
	delete(s.pending, id)
	s.mu.Unlock()
}

func (s *yetiBridgeSession) rejectAll(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rejectAllPendingLocked(err)
}

func (s *yetiBridgeSession) rejectAllPendingLocked(err error) {
	for id, pending := range s.pending {
		delete(s.pending, id)
		pending.done <- yetiBridgeCallResult{err: err}
	}
}

func (s *yetiBridgeSession) close() {
	s.mu.Lock()
	socket := s.socket
	server := s.server
	s.socket = nil
	s.server = nil
	s.hello = nil
	s.rejectAllPendingLocked(errors.New("YetiBrowser bridge closed"))
	s.mu.Unlock()

	if socket != nil {
		_ = socket.Close()
	}
	if server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}
}

func (s *yetiBridgeSession) publicURL() string {
	host, port, err := net.SplitHostPort(s.address)
	if err != nil {
		return "ws://localhost:9010"
	}
	if host == "" || host == "127.0.0.1" || host == "::1" {
		host = "localhost"
	}
	return fmt.Sprintf("ws://%s:%s", host, port)
}

func (s *yetiBridgeSession) notConnectedError() error {
	return fmt.Errorf("YetiBrowser extension not connected. Bridge is listening at %s. Install YetiBrowser MCP Bridge, set its port to %s, click Connect on the target Chrome tab, then retry", s.publicURL(), s.port())
}

func (s *yetiBridgeSession) port() string {
	_, port, err := net.SplitHostPort(s.address)
	if err != nil {
		return "9010"
	}
	return port
}

func browserUseYetiBridge(provider *BrowserUseTool) (*yetiBridgeSession, error) {
	return globalYetiBridgeManager.get(provider.bridgeAddress, provider.bridgeClientID)
}

func browserUseYetiCall(ctx context.Context, provider *BrowserUseTool, command string, payload interface{}, out interface{}) error {
	bridge, err := browserUseYetiBridge(provider)
	if err != nil {
		return err
	}
	raw, err := bridge.call(ctx, command, payload)
	if err != nil {
		return err
	}
	if out == nil || len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	if err = json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("failed to decode YetiBrowser command %q result: %w", command, err)
	}
	return nil
}

func browserUseYetiOpen(ctx context.Context, provider *BrowserUseTool, rawURL string) error {
	return browserUseYetiCall(ctx, provider, "navigate", map[string]interface{}{"url": rawURL}, nil)
}

func browserUseYetiSnapshot(provider *BrowserUseTool) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), browserUseDefaultTimeout)
	defer cancel()

	var urlResult struct {
		URL string `json:"url"`
	}
	var titleResult struct {
		Title string `json:"title"`
	}
	var visibleText string
	var elements []browserUseElement

	if err := browserUseYetiCall(ctx, provider, "getUrl", nil, &urlResult); err != nil {
		return "", err
	}
	if err := browserUseYetiCall(ctx, provider, "getTitle", nil, &titleResult); err != nil {
		return "", err
	}
	if err := browserUseYetiEvaluate(ctx, provider, browserUseVisibleTextScript(), &visibleText); err != nil {
		return "", err
	}
	if err := browserUseYetiEvaluate(ctx, provider, browserUseSnapshotScript(), &elements); err != nil {
		return "", err
	}
	return browserUseFormatSnapshot(urlResult.URL, titleResult.Title, visibleText, elements), nil
}

func browserUseYetiCurrentState(provider *BrowserUseTool) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), browserUseDefaultTimeout)
	defer cancel()

	bridge, err := browserUseYetiBridge(provider)
	if err != nil {
		return "", err
	}

	var urlResult struct {
		URL string `json:"url"`
	}
	var titleResult struct {
		Title string `json:"title"`
	}
	var mediaState string
	if err = browserUseYetiCall(ctx, provider, "getUrl", nil, &urlResult); err != nil {
		return "", err
	}
	if err = browserUseYetiCall(ctx, provider, "getTitle", nil, &titleResult); err != nil {
		return "", err
	}
	if err = browserUseYetiEvaluate(ctx, provider, browserUseMediaStateScript(), &mediaState); err != nil {
		mediaState = fmt.Sprintf("unavailable: %s", err.Error())
	}
	if strings.TrimSpace(mediaState) == "" {
		mediaState = "none"
	}

	bridge.mu.Lock()
	hello := bridge.hello
	bridge.mu.Unlock()

	var builder strings.Builder
	builder.WriteString("Current browser state:\n")
	builder.WriteString("- Mode: YetiBrowser Bridge (connected tab only)\n")
	builder.WriteString("- Active tab: connected/1\n")
	builder.WriteString(fmt.Sprintf("- Title: %s\n", strings.TrimSpace(titleResult.Title)))
	builder.WriteString(fmt.Sprintf("- URL: %s\n", strings.TrimSpace(urlResult.URL)))
	if hello != nil {
		builder.WriteString(fmt.Sprintf("- Extension: %s %s\n", strings.TrimSpace(hello.Client), strings.TrimSpace(hello.Version)))
	}
	builder.WriteString("- Media:\n")
	for _, line := range strings.Split(strings.TrimSpace(mediaState), "\n") {
		builder.WriteString(fmt.Sprintf("  %s\n", strings.TrimSpace(line)))
	}
	return builder.String(), nil
}

func browserUseYetiClick(ctx context.Context, provider *BrowserUseTool, selector string) error {
	return browserUseYetiCall(ctx, provider, "click", map[string]interface{}{
		"selector":    selector,
		"description": selector,
	}, nil)
}

func browserUseYetiType(ctx context.Context, provider *BrowserUseTool, selector string, text string, clear bool) error {
	var tag string
	if err := browserUseYetiEvaluate(ctx, provider, browserUseElementTagScript(selector), &tag); err != nil {
		return err
	}
	if tag == "select" {
		var result string
		if err := browserUseYetiEvaluate(ctx, provider, browserUseSelectOptionScript(selector, text), &result); err != nil {
			return err
		}
		if strings.HasPrefix(result, "select option not found") {
			return fmt.Errorf("%s", result)
		}
		return nil
	}

	var result string
	script := browserUseSetTextValueScript(selector, text, clear)
	if !clear {
		script = browserUseAppendTextValueScript(selector, text)
	}
	if err := browserUseYetiEvaluate(ctx, provider, script, &result); err != nil {
		return err
	}
	if result != "fallback" {
		if strings.HasPrefix(result, "element not found") {
			return fmt.Errorf("%s", result)
		}
		return nil
	}
	return browserUseYetiCall(ctx, provider, "type", map[string]interface{}{
		"selector":    selector,
		"text":        text,
		"submit":      false,
		"description": selector,
	}, nil)
}

func browserUseYetiPress(ctx context.Context, provider *BrowserUseTool, key string) error {
	return browserUseYetiCall(ctx, provider, "pressKey", map[string]interface{}{"key": key}, nil)
}

func browserUseYetiTabs(ctx context.Context, provider *BrowserUseTool) (string, error) {
	var urlResult struct {
		URL string `json:"url"`
	}
	var titleResult struct {
		Title string `json:"title"`
	}
	if err := browserUseYetiCall(ctx, provider, "getUrl", nil, &urlResult); err != nil {
		return "", err
	}
	if err := browserUseYetiCall(ctx, provider, "getTitle", nil, &titleResult); err != nil {
		return "", err
	}
	var builder strings.Builder
	builder.WriteString("Browser tabs:\n")
	builder.WriteString(fmt.Sprintf("[1] active connected tab %s\n", strings.TrimSpace(titleResult.Title)))
	if strings.TrimSpace(urlResult.URL) != "" {
		builder.WriteString(fmt.Sprintf("    %s\n", strings.TrimSpace(urlResult.URL)))
	}
	builder.WriteString("YetiBrowser Bridge mode controls only the tab connected from the extension. To switch tabs, open the target tab in Chrome and click Connect in the YetiBrowser extension again.\n")
	return builder.String(), nil
}

func browserUseYetiEvaluate(ctx context.Context, provider *BrowserUseTool, script string, out interface{}) error {
	var response struct {
		Value json.RawMessage `json:"value"`
	}
	err := browserUseYetiCall(ctx, provider, "evaluate", map[string]interface{}{
		"script":    browserUseYetiFunctionScript(script),
		"args":      []interface{}{},
		"timeoutMs": int(browserUseDefaultTimeout / time.Millisecond),
	}, &response)
	if err != nil {
		return err
	}
	if out == nil {
		return nil
	}
	if len(response.Value) == 0 || string(response.Value) == "null" {
		return nil
	}
	return json.Unmarshal(response.Value, out)
}

func browserUseYetiEvaluateString(ctx context.Context, provider *BrowserUseTool, script string) (string, error) {
	var result string
	if err := browserUseYetiEvaluate(ctx, provider, script, &result); err != nil {
		return "", err
	}
	return result, nil
}

func browserUseYetiFunctionScript(script string) string {
	return fmt.Sprintf("() => (%s)", script)
}

func browserUseYetiKey(key string) string {
	switch strings.ToLower(strings.TrimSpace(key)) {
	case "enter", "return":
		return "Enter"
	case "tab":
		return "Tab"
	case "escape", "esc":
		return "Escape"
	case "space", "spacebar":
		return " "
	case "backspace":
		return "Backspace"
	case "delete", "del":
		return "Delete"
	case "arrowup", "up":
		return "ArrowUp"
	case "arrowdown", "down":
		return "ArrowDown"
	case "arrowleft", "left":
		return "ArrowLeft"
	case "arrowright", "right":
		return "ArrowRight"
	case "home":
		return "Home"
	case "end":
		return "End"
	case "pageup":
		return "PageUp"
	case "pagedown":
		return "PageDown"
	default:
		return key
	}
}

func browserUseAppendTextValueScript(selector string, text string) string {
	return fmt.Sprintf(`(() => {
  const el = document.querySelector(%s);
  if (!el) {
    return 'element not found';
  }
  const value = %s;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (tag === 'input' && ['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type)) {
      return 'fallback';
    }
    el.value = (el.value || '') + value;
    try {
      el.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: value}));
    } catch (e) {
      el.dispatchEvent(new Event('input', {bubbles: true}));
    }
    el.dispatchEvent(new Event('change', {bubbles: true}));
    return 'appended text value';
  }
  if (el.isContentEditable) {
    el.textContent = (el.textContent || '') + value;
    el.dispatchEvent(new Event('input', {bubbles: true}));
    return 'appended text value';
  }
  return 'fallback';
})()`, browserUseJSONLiteral(selector), browserUseJSONLiteral(text))
}

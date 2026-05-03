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
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/chromedp/cdproto/target"
	"github.com/gorilla/websocket"
)

const (
	browserUseModeChromeExt       = "OpenAgent Chrome Extension"
	browserUseChromeExtBridgePath = "/api/chrome-connect"
	browserUseChromeExtTimeout    = 45 * time.Second
)

type browserUseChromeExtBridge struct {
	mu         sync.Mutex
	writeMu    sync.Mutex
	conn       *websocket.Conn
	name       string
	version    string
	pending    map[string]chan browserUseChromeExtResponse
	requestSeq uint64
}

type browserUseChromeExtMessage struct {
	Type    string          `json:"type"`
	ID      string          `json:"id,omitempty"`
	Command string          `json:"command,omitempty"`
	Name    string          `json:"name,omitempty"`
	Version string          `json:"version,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	OK      *bool           `json:"ok,omitempty"`
	Error   string          `json:"error,omitempty"`
}

type browserUseChromeExtCallMessage struct {
	Type    string      `json:"type"`
	ID      string      `json:"id"`
	Command string      `json:"command"`
	Payload interface{} `json:"payload,omitempty"`
}

type browserUseChromeExtResponse struct {
	result json.RawMessage
	err    error
}

type browserUseChromeExtTab struct {
	ID         int    `json:"id"`
	WindowID   int    `json:"windowId"`
	Index      int    `json:"index"`
	Title      string `json:"title"`
	URL        string `json:"url"`
	Active     bool   `json:"active"`
	Controlled bool   `json:"controlled"`
	Protected  bool   `json:"protected"`
}

type browserUseChromeExtTabsResult struct {
	Tabs []browserUseChromeExtTab `json:"tabs"`
}

type browserUseChromeExtSnapshotResult struct {
	Tab         browserUseChromeExtTab `json:"tab"`
	URL         string                 `json:"url"`
	Title       string                 `json:"title"`
	VisibleText string                 `json:"visibleText"`
	MediaState  string                 `json:"mediaState"`
	Elements    []browserUseElement    `json:"elements"`
}

type browserUseChromeExtState struct {
	Mode            string                 `json:"mode"`
	Connected       bool                   `json:"connected"`
	Name            string                 `json:"name"`
	Version         string                 `json:"version"`
	Tab             browserUseChromeExtTab `json:"tab"`
	TabCount        int                    `json:"tabCount"`
	ControlledIndex int                    `json:"controlledIndex"`
	MediaState      string                 `json:"mediaState"`
}

var globalBrowserUseChromeExtBridge = &browserUseChromeExtBridge{
	pending: map[string]chan browserUseChromeExtResponse{},
}

func (p *BrowserUseTool) isChromeExtMode() bool {
	return p.mode == browserUseModeChromeExt
}

func HandleBrowserUseChromeExtWebSocket(w http.ResponseWriter, r *http.Request) {
	globalBrowserUseChromeExtBridge.handleWebSocket(w, r)
}

func (b *browserUseChromeExtBridge) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	if !browserUseIsLocalRequest(r) {
		http.Error(w, "browser extension bridge only accepts localhost connections", http.StatusForbidden)
		return
	}
	if expectedToken := strings.TrimSpace(os.Getenv("OPENAGENT_CHROME_EXTENSION_TOKEN")); expectedToken != "" {
		if r.URL.Query().Get("token") != expectedToken {
			http.Error(w, "invalid browser extension bridge token", http.StatusUnauthorized)
			return
		}
	}

	upgrader := websocket.Upgrader{
		ReadBufferSize:  8192,
		WriteBufferSize: 8192,
		CheckOrigin: func(r *http.Request) bool {
			return browserUseIsChromeExtensionOrigin(r.Header.Get("Origin"))
		},
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	b.attach(conn)
	defer b.detach(conn, fmt.Errorf("OpenAgent Chrome extension disconnected"))

	_ = b.writeJSON(conn, map[string]interface{}{
		"type":        "server_hello",
		"name":        "openagent",
		"version":     "2",
		"heartbeatMs": 20000,
	})

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		var message browserUseChromeExtMessage
		if err = json.Unmarshal(data, &message); err != nil {
			continue
		}
		b.handleMessage(message)
	}
}

func (b *browserUseChromeExtBridge) attach(conn *websocket.Conn) {
	b.mu.Lock()
	oldConn := b.conn
	pending := b.pending
	if oldConn != nil && oldConn != conn {
		b.pending = map[string]chan browserUseChromeExtResponse{}
	}
	b.conn = conn
	b.name = ""
	b.version = ""
	defer b.mu.Unlock()

	if oldConn != nil && oldConn != conn {
		_ = oldConn.Close()
		for _, ch := range pending {
			ch <- browserUseChromeExtResponse{err: fmt.Errorf("OpenAgent Chrome extension reconnected before the command completed")}
		}
	}
}

func (b *browserUseChromeExtBridge) detach(conn *websocket.Conn, err error) {
	b.mu.Lock()
	if b.conn != conn {
		b.mu.Unlock()
		return
	}
	_ = conn.Close()
	b.conn = nil
	b.name = ""
	b.version = ""
	pending := b.pending
	b.pending = map[string]chan browserUseChromeExtResponse{}
	b.mu.Unlock()

	for _, ch := range pending {
		ch <- browserUseChromeExtResponse{err: err}
	}
}

func (b *browserUseChromeExtBridge) handleMessage(message browserUseChromeExtMessage) {
	switch message.Type {
	case "hello":
		b.mu.Lock()
		b.name = message.Name
		b.version = message.Version
		b.mu.Unlock()
	case "ping":
		b.mu.Lock()
		conn := b.conn
		b.mu.Unlock()
		if conn != nil {
			_ = b.writeJSON(conn, map[string]interface{}{
				"type": "pong",
				"ts":   time.Now().UnixMilli(),
			})
		}
	case "result":
		b.resolve(message.ID, message.Result, message.Error, message.OK)
	case "error":
		errText := message.Error
		if errText == "" {
			errText = "browser extension returned an error"
		}
		b.resolve(message.ID, nil, errText, nil)
	}
}

func (b *browserUseChromeExtBridge) resolve(id string, result json.RawMessage, errorText string, ok *bool) {
	if id == "" {
		return
	}
	b.mu.Lock()
	ch, okPending := b.pending[id]
	if okPending {
		delete(b.pending, id)
	}
	b.mu.Unlock()
	if !okPending {
		return
	}
	if ok != nil && !*ok && errorText == "" {
		errorText = "browser extension command failed"
	}
	if errorText != "" {
		ch <- browserUseChromeExtResponse{err: fmt.Errorf("%s", errorText)}
		return
	}
	ch <- browserUseChromeExtResponse{result: result}
}

func (b *browserUseChromeExtBridge) call(ctx context.Context, command string, payload interface{}) (json.RawMessage, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	timeoutCtx, cancel := context.WithTimeout(ctx, browserUseChromeExtTimeout)
	defer cancel()

	id := strconv.FormatUint(atomic.AddUint64(&b.requestSeq, 1), 10)
	ch := make(chan browserUseChromeExtResponse, 1)

	b.mu.Lock()
	conn := b.conn
	if conn == nil {
		b.mu.Unlock()
		return nil, fmt.Errorf("OpenAgent Chrome extension is not connected. Install the OpenAgent Chrome extension, open the popup, enter http://127.0.0.1:14000, and click Connect")
	}
	b.pending[id] = ch
	b.mu.Unlock()

	if err := b.writeJSON(conn, browserUseChromeExtCallMessage{
		Type:    "call",
		ID:      id,
		Command: command,
		Payload: payload,
	}); err != nil {
		b.mu.Lock()
		delete(b.pending, id)
		b.mu.Unlock()
		return nil, err
	}

	select {
	case response := <-ch:
		return response.result, response.err
	case <-timeoutCtx.Done():
		b.mu.Lock()
		delete(b.pending, id)
		b.mu.Unlock()
		return nil, fmt.Errorf("browser extension command %q timed out", command)
	}
}

func (b *browserUseChromeExtBridge) writeJSON(conn *websocket.Conn, value interface{}) error {
	b.writeMu.Lock()
	defer b.writeMu.Unlock()
	return conn.WriteJSON(value)
}

func (b *browserUseChromeExtBridge) disconnect() {
	b.mu.Lock()
	conn := b.conn
	pending := b.pending
	b.conn = nil
	b.name = ""
	b.version = ""
	b.pending = map[string]chan browserUseChromeExtResponse{}
	b.mu.Unlock()

	if conn != nil {
		_ = conn.Close()
	}
	for _, ch := range pending {
		ch <- browserUseChromeExtResponse{err: fmt.Errorf("OpenAgent Chrome extension bridge closed")}
	}
}

func (b *browserUseChromeExtBridge) requestDisconnect(ctx context.Context) error {
	_, err := b.call(ctx, "disconnect", map[string]interface{}{})
	return err
}

func (b *browserUseChromeExtBridge) connectionInfo() (bool, string, string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.conn != nil, b.name, b.version
}

func browserUseIsLocalRequest(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return host == "localhost"
	}
	return ip.IsLoopback()
}

func browserUseIsChromeExtensionOrigin(origin string) bool {
	if strings.TrimSpace(origin) == "" {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return u.Scheme == "chrome-extension" && u.Host != "" && u.Path == "" && u.RawQuery == "" && u.Fragment == ""
}

func browserUseChromeExtCall(ctx context.Context, command string, payload interface{}, out interface{}) error {
	raw, err := globalBrowserUseChromeExtBridge.call(ctx, command, payload)
	if err != nil {
		return err
	}
	if out == nil {
		return nil
	}
	if len(raw) == 0 {
		return fmt.Errorf("browser extension returned an empty response for %s", command)
	}
	return json.Unmarshal(raw, out)
}

func browserUseChromeExtOpen(ctx context.Context, rawURL string) error {
	return browserUseChromeExtCall(ctx, "open", map[string]interface{}{"url": rawURL}, nil)
}

func browserUseChromeExtSnapshot(ctx context.Context) (string, error) {
	var snapshot browserUseChromeExtSnapshotResult
	if err := browserUseChromeExtCall(ctx, "snapshot", map[string]interface{}{}, &snapshot); err != nil {
		return "", err
	}
	if snapshot.URL == "" {
		snapshot.URL = snapshot.Tab.URL
	}
	if snapshot.Title == "" {
		snapshot.Title = snapshot.Tab.Title
	}
	return browserUseFormatSnapshot(snapshot.URL, snapshot.Title, snapshot.VisibleText, snapshot.Elements), nil
}

func browserUseChromeExtCurrentState(ctx context.Context) (string, error) {
	var state browserUseChromeExtState
	err := browserUseChromeExtCall(ctx, "state", map[string]interface{}{}, &state)
	if err != nil {
		connected, name, version := globalBrowserUseChromeExtBridge.connectionInfo()
		if !connected {
			return "", err
		}
		state = browserUseChromeExtState{
			Mode:      browserUseModeChromeExt,
			Connected: true,
			Name:      name,
			Version:   version,
		}
	}

	if strings.TrimSpace(state.Mode) == "" {
		state.Mode = browserUseModeChromeExt
	}
	if strings.TrimSpace(state.MediaState) == "" {
		state.MediaState = "none"
	}
	activeText := "unknown"
	if state.TabCount > 0 && state.ControlledIndex > 0 {
		activeText = fmt.Sprintf("%d/%d", state.ControlledIndex, state.TabCount)
	} else if state.TabCount > 0 {
		activeText = fmt.Sprintf("unknown/%d", state.TabCount)
	}

	var builder strings.Builder
	builder.WriteString("Current browser state:\n")
	builder.WriteString(fmt.Sprintf("- Mode: %s\n", state.Mode))
	builder.WriteString(fmt.Sprintf("- Controlled tab: %s\n", activeText))
	builder.WriteString(fmt.Sprintf("- Title: %s\n", strings.TrimSpace(state.Tab.Title)))
	builder.WriteString(fmt.Sprintf("- URL: %s\n", strings.TrimSpace(state.Tab.URL)))
	if state.Name != "" || state.Version != "" {
		builder.WriteString(fmt.Sprintf("- Extension: %s %s\n", strings.TrimSpace(state.Name), strings.TrimSpace(state.Version)))
	}
	builder.WriteString("- Media:\n")
	for _, line := range strings.Split(strings.TrimSpace(state.MediaState), "\n") {
		if strings.TrimSpace(line) != "" {
			builder.WriteString(fmt.Sprintf("  %s\n", strings.TrimSpace(line)))
		}
	}
	return builder.String(), nil
}

func browserUseChromeExtClick(ctx context.Context, arguments map[string]interface{}) error {
	payload, err := browserUseChromeExtTargetPayload(arguments)
	if err != nil {
		return err
	}
	return browserUseChromeExtCall(ctx, "click", payload, nil)
}

func browserUseChromeExtType(ctx context.Context, arguments map[string]interface{}) error {
	payload, err := browserUseChromeExtTargetPayload(arguments)
	if err != nil {
		return err
	}
	text, ok := arguments["text"].(string)
	if !ok {
		return fmt.Errorf("missing required parameter: text")
	}
	payload["text"] = text
	clear := true
	if value, ok := arguments["clear"].(bool); ok {
		clear = value
	}
	payload["clear"] = clear
	return browserUseChromeExtCall(ctx, "type", payload, nil)
}

func browserUseChromeExtPress(ctx context.Context, key string) error {
	return browserUseChromeExtCall(ctx, "press", map[string]interface{}{"key": key}, nil)
}

func browserUseChromeExtPlayMedia(ctx context.Context) (string, error) {
	var result struct {
		Text string `json:"text"`
	}
	if err := browserUseChromeExtCall(ctx, "playMedia", map[string]interface{}{}, &result); err != nil {
		return "", err
	}
	return result.Text, nil
}

func browserUseChromeExtTabs(ctx context.Context) ([]browserUseTab, error) {
	var result browserUseChromeExtTabsResult
	if err := browserUseChromeExtCall(ctx, "tabs", map[string]interface{}{}, &result); err != nil {
		return nil, err
	}
	return browserUseChromeExtTabsToBrowserUseTabs(result.Tabs), nil
}

func browserUseChromeExtSwitchTab(ctx context.Context, index int) error {
	var result browserUseChromeExtTabsResult
	if err := browserUseChromeExtCall(ctx, "tabs", map[string]interface{}{}, &result); err != nil {
		return err
	}
	if index > len(result.Tabs) {
		return fmt.Errorf("tab index %d is out of range; there are %d tabs", index, len(result.Tabs))
	}
	return browserUseChromeExtCall(ctx, "switchTab", map[string]interface{}{"tabId": result.Tabs[index-1].ID}, nil)
}

func browserUseChromeExtCloseTab(ctx context.Context, index int) error {
	var result browserUseChromeExtTabsResult
	if err := browserUseChromeExtCall(ctx, "tabs", map[string]interface{}{}, &result); err != nil {
		return err
	}
	if index > len(result.Tabs) {
		return fmt.Errorf("tab index %d is out of range; there are %d tabs", index, len(result.Tabs))
	}
	return browserUseChromeExtCall(ctx, "closeTab", map[string]interface{}{"tabId": result.Tabs[index-1].ID}, nil)
}

func browserUseChromeExtTargetPayload(arguments map[string]interface{}) (map[string]interface{}, error) {
	payload := map[string]interface{}{}
	if rawIndex, ok := arguments["index"]; ok {
		index, err := browserUsePositiveInt(rawIndex, "index")
		if err != nil {
			return nil, err
		}
		payload["index"] = index
		return payload, nil
	}
	if selector, ok := arguments["selector"].(string); ok && strings.TrimSpace(selector) != "" {
		payload["selector"] = strings.TrimSpace(selector)
		return payload, nil
	}
	return nil, fmt.Errorf("missing required parameter: index or selector")
}

func browserUseChromeExtTabsToBrowserUseTabs(tabs []browserUseChromeExtTab) []browserUseTab {
	res := make([]browserUseTab, 0, len(tabs))
	for index, tab := range tabs {
		res = append(res, browserUseTab{
			Index:      index + 1,
			ID:         target.ID(strconv.Itoa(tab.ID)),
			Title:      tab.Title,
			URL:        tab.URL,
			Active:     tab.Active,
			Controlled: tab.Controlled,
			Protected:  tab.Protected,
		})
	}
	return res
}

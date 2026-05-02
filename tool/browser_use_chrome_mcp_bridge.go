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
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	browserUseModeChromeMCPBridge = "MCP Chrome Bridge (Experimental)"
	chromeMCPBridgePath           = "/api/browser-use/chrome-mcp/native-host"
	chromeMCPCallTimeout          = 45 * time.Second
)

var chromeMCPUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return isChromeMCPLocalRequest(r)
	},
}

type chromeMCPBridgeManager struct {
	mu          sync.Mutex
	writeMu     sync.Mutex
	conn        *websocket.Conn
	connectedAt time.Time
	pending     map[string]chan chromeMCPResponsePayload
	elementRefs map[int]chromeMCPElementRef
	tabRefs     map[int]chromeMCPTabRef
}

type chromeMCPResponsePayload struct {
	Payload json.RawMessage
	Error   string
}

type chromeMCPExtensionMessage struct {
	Type                string          `json:"type"`
	RequestID           string          `json:"requestId,omitempty"`
	ResponseToRequestID string          `json:"responseToRequestId,omitempty"`
	Payload             json.RawMessage `json:"payload,omitempty"`
	Error               interface{}     `json:"error,omitempty"`
}

type chromeMCPCallResponse struct {
	Status  string          `json:"status"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

type chromeMCPToolResult struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	IsError bool `json:"isError"`
}

type chromeMCPTabsPayload struct {
	WindowCount int `json:"windowCount"`
	TabCount    int `json:"tabCount"`
	Windows     []struct {
		WindowID int `json:"windowId"`
		Tabs     []struct {
			TabID  int    `json:"tabId"`
			URL    string `json:"url"`
			Title  string `json:"title"`
			Active bool   `json:"active"`
		} `json:"tabs"`
	} `json:"windows"`
}

type chromeMCPReadPagePayload struct {
	Success     bool                   `json:"success"`
	PageContent string                 `json:"pageContent"`
	Elements    []chromeMCPPageElement `json:"elements"`
	Fallback    bool                   `json:"fallbackUsed"`
	Reason      string                 `json:"reason"`
}

type chromeMCPPageElement struct {
	Type         string                `json:"type"`
	Text         string                `json:"text"`
	Selector     string                `json:"selector"`
	SelectorType string                `json:"selectorType"`
	Coordinates  *chromeMCPCoordinates `json:"coordinates"`
}

type chromeMCPCoordinates struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type chromeMCPElementRef struct {
	Ref         string
	Selector    string
	Coordinates *chromeMCPCoordinates
	TabID       int
	WindowID    int
}

type chromeMCPTabRef struct {
	Index    int
	TabID    int
	WindowID int
	Title    string
	URL      string
	Active   bool
}

var globalChromeMCPBridge = &chromeMCPBridgeManager{
	pending:     map[string]chan chromeMCPResponsePayload{},
	elementRefs: map[int]chromeMCPElementRef{},
	tabRefs:     map[int]chromeMCPTabRef{},
}

func (p *BrowserUseTool) isChromeMCPBridge() bool {
	return p != nil && p.mode == browserUseModeChromeMCPBridge
}

func HandleChromeMCPNativeHostWebSocket(w http.ResponseWriter, r *http.Request) {
	if !isChromeMCPLocalRequest(r) {
		http.Error(w, "Chrome MCP native host bridge only accepts localhost connections", http.StatusForbidden)
		return
	}
	expectedToken := chromeMCPExpectedToken()
	if expectedToken != "" && r.URL.Query().Get("token") != expectedToken {
		http.Error(w, "invalid Chrome MCP bridge token", http.StatusForbidden)
		return
	}

	conn, err := chromeMCPUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	globalChromeMCPBridge.attach(conn)
	defer globalChromeMCPBridge.detach(conn)

	for {
		var message chromeMCPNativeWSMessage
		if err = conn.ReadJSON(&message); err != nil {
			return
		}
		if message.Type == "extension_message" {
			globalChromeMCPBridge.handleExtensionMessage(message.Message)
		}
	}
}

func isChromeMCPLocalRequest(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (m *chromeMCPBridgeManager) attach(conn *websocket.Conn) {
	m.mu.Lock()
	if m.conn != nil && m.conn != conn {
		_ = m.conn.Close()
	}
	m.conn = conn
	m.connectedAt = time.Now()
	m.mu.Unlock()
}

func (m *chromeMCPBridgeManager) detach(conn *websocket.Conn) {
	m.mu.Lock()
	if m.conn == conn {
		m.conn = nil
		for id, ch := range m.pending {
			delete(m.pending, id)
			ch <- chromeMCPResponsePayload{Error: "Chrome MCP native host disconnected"}
		}
	}
	m.mu.Unlock()
	_ = conn.Close()
}

func (m *chromeMCPBridgeManager) handleExtensionMessage(raw json.RawMessage) {
	var message chromeMCPExtensionMessage
	if err := json.Unmarshal(raw, &message); err != nil {
		return
	}
	if message.ResponseToRequestID != "" {
		m.deliverResponse(message.ResponseToRequestID, message)
		return
	}

	switch message.Type {
	case "start":
		port := 0
		var payload struct {
			Port int `json:"port"`
		}
		_ = json.Unmarshal(message.Payload, &payload)
		if payload.Port > 0 {
			port = payload.Port
		}
		_ = m.sendRawToExtension(map[string]interface{}{
			"type":    "server_started",
			"payload": map[string]interface{}{"port": port},
		})
	case "stop":
		_ = m.sendRawToExtension(map[string]interface{}{"type": "server_stopped"})
	case "ping_from_extension":
		_ = m.sendRawToExtension(map[string]interface{}{"type": "pong_to_extension"})
	default:
		if message.RequestID != "" {
			_ = m.sendRawToExtension(map[string]interface{}{
				"type":                "error_from_native_host",
				"responseToRequestId": message.RequestID,
				"error":               fmt.Sprintf("unsupported native host message type: %s", message.Type),
			})
		}
	}
}

func (m *chromeMCPBridgeManager) deliverResponse(requestID string, message chromeMCPExtensionMessage) {
	var errText string
	if message.Error != nil {
		switch value := message.Error.(type) {
		case string:
			errText = value
		default:
			data, _ := json.Marshal(value)
			errText = string(data)
		}
	}
	m.mu.Lock()
	ch := m.pending[requestID]
	if ch != nil {
		delete(m.pending, requestID)
	}
	m.mu.Unlock()
	if ch != nil {
		ch <- chromeMCPResponsePayload{Payload: message.Payload, Error: errText}
	}
}

func (m *chromeMCPBridgeManager) callTool(ctx context.Context, name string, args map[string]interface{}) (string, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, chromeMCPCallTimeout)
	defer cancel()

	requestID := uuid.NewString()
	ch := make(chan chromeMCPResponsePayload, 1)

	m.mu.Lock()
	if m.conn == nil {
		m.mu.Unlock()
		return "", fmt.Errorf("Chrome MCP extension is not connected. Install/enable the mcp-chrome extension, run chrome-mcp-register, then connect the extension to Casibase")
	}
	m.pending[requestID] = ch
	m.mu.Unlock()

	err := m.sendRawToExtension(map[string]interface{}{
		"type":      "call_tool",
		"requestId": requestID,
		"payload": map[string]interface{}{
			"name": name,
			"args": args,
		},
	})
	if err != nil {
		m.mu.Lock()
		delete(m.pending, requestID)
		m.mu.Unlock()
		return "", err
	}

	select {
	case response := <-ch:
		if response.Error != "" {
			return "", fmt.Errorf("%s", response.Error)
		}
		return parseChromeMCPToolText(response.Payload)
	case <-ctx.Done():
		m.mu.Lock()
		delete(m.pending, requestID)
		m.mu.Unlock()
		return "", fmt.Errorf("Chrome MCP tool %s timed out: %w", name, ctx.Err())
	}
}

func (m *chromeMCPBridgeManager) sendRawToExtension(message interface{}) error {
	data, err := json.Marshal(message)
	if err != nil {
		return err
	}
	m.mu.Lock()
	conn := m.conn
	m.mu.Unlock()
	if conn == nil {
		return fmt.Errorf("Chrome MCP native host is not connected")
	}
	m.writeMu.Lock()
	defer m.writeMu.Unlock()
	return conn.WriteJSON(chromeMCPNativeWSMessage{Type: "send_to_extension", Message: data})
}

func parseChromeMCPToolText(raw json.RawMessage) (string, error) {
	var response chromeMCPCallResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return "", fmt.Errorf("failed to parse Chrome MCP call response: %w", err)
	}
	if strings.EqualFold(response.Status, "error") {
		if response.Message != "" {
			return "", fmt.Errorf("%s", response.Message)
		}
		return "", fmt.Errorf("Chrome MCP tool returned an error")
	}
	if len(response.Data) == 0 || string(response.Data) == "null" {
		if response.Message != "" {
			return response.Message, nil
		}
		return "", nil
	}

	var toolResult chromeMCPToolResult
	if err := json.Unmarshal(response.Data, &toolResult); err == nil && len(toolResult.Content) > 0 {
		var texts []string
		for _, item := range toolResult.Content {
			if item.Type == "text" {
				texts = append(texts, item.Text)
			}
		}
		text := strings.Join(texts, "\n")
		if toolResult.IsError {
			return "", fmt.Errorf("%s", text)
		}
		return text, nil
	}

	var text string
	if err := json.Unmarshal(response.Data, &text); err == nil {
		return text, nil
	}
	return string(response.Data), nil
}

func chromeMCPCallTool(ctx context.Context, name string, args map[string]interface{}) (string, error) {
	if args == nil {
		args = map[string]interface{}{}
	}
	return globalChromeMCPBridge.callTool(ctx, name, args)
}

func chromeMCPTabs(ctx context.Context) ([]chromeMCPTabRef, error) {
	text, err := chromeMCPCallTool(ctx, "get_windows_and_tabs", nil)
	if err != nil {
		return nil, err
	}
	var payload chromeMCPTabsPayload
	if err = json.Unmarshal([]byte(text), &payload); err != nil {
		return nil, fmt.Errorf("failed to parse Chrome MCP tabs payload: %w: %s", err, text)
	}
	var tabs []chromeMCPTabRef
	index := 1
	for _, window := range payload.Windows {
		for _, tab := range window.Tabs {
			tabs = append(tabs, chromeMCPTabRef{
				Index:    index,
				TabID:    tab.TabID,
				WindowID: window.WindowID,
				Title:    tab.Title,
				URL:      tab.URL,
				Active:   tab.Active,
			})
			index++
		}
	}
	globalChromeMCPBridge.setTabs(tabs)
	return tabs, nil
}

func (m *chromeMCPBridgeManager) setTabs(tabs []chromeMCPTabRef) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tabRefs = map[int]chromeMCPTabRef{}
	for _, tab := range tabs {
		m.tabRefs[tab.Index] = tab
	}
}

func (m *chromeMCPBridgeManager) tabByIndex(index int) (chromeMCPTabRef, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	tab, ok := m.tabRefs[index]
	return tab, ok
}

func (m *chromeMCPBridgeManager) setElementRefs(refs map[int]chromeMCPElementRef) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.elementRefs = refs
}

func (m *chromeMCPBridgeManager) elementByIndex(index int) (chromeMCPElementRef, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ref, ok := m.elementRefs[index]
	return ref, ok
}

func chromeMCPActiveTab(tabs []chromeMCPTabRef) chromeMCPTabRef {
	for _, tab := range tabs {
		if tab.Active {
			return tab
		}
	}
	if len(tabs) > 0 {
		return tabs[0]
	}
	return chromeMCPTabRef{}
}

func chromeMCPFormatTabs(tabs []chromeMCPTabRef) string {
	if len(tabs) == 0 {
		return "No Chrome tabs found through MCP Chrome Bridge."
	}
	var builder strings.Builder
	builder.WriteString("Chrome MCP tabs:\n")
	for _, tab := range tabs {
		active := ""
		if tab.Active {
			active = " active"
		}
		builder.WriteString(fmt.Sprintf("[%d]%s window=%d tab=%d %s\n", tab.Index, active, tab.WindowID, tab.TabID, strings.TrimSpace(tab.Title)))
		if strings.TrimSpace(tab.URL) != "" {
			builder.WriteString(fmt.Sprintf("    %s\n", tab.URL))
		}
	}
	return builder.String()
}

func chromeMCPSnapshot(ctx context.Context) (string, error) {
	tabs, err := chromeMCPTabs(ctx)
	if err != nil {
		return "", err
	}
	activeTab := chromeMCPActiveTab(tabs)
	args := map[string]interface{}{}
	if activeTab.TabID > 0 {
		args["tabId"] = activeTab.TabID
	}
	text, err := chromeMCPCallTool(ctx, "chrome_read_page", args)
	if err != nil {
		return "", err
	}

	var payload chromeMCPReadPagePayload
	if err = json.Unmarshal([]byte(text), &payload); err != nil {
		return "", fmt.Errorf("failed to parse Chrome MCP page payload: %w: %s", err, text)
	}
	return chromeMCPFormatSnapshot(activeTab, payload), nil
}

func chromeMCPFormatSnapshot(activeTab chromeMCPTabRef, payload chromeMCPReadPagePayload) string {
	refs := map[int]chromeMCPElementRef{}
	var interactive []string
	nextIndex := 1

	for _, line := range strings.Split(payload.PageContent, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if !chromeMCPLineLooksInteractive(line) {
			continue
		}
		ref := chromeMCPRefFromLine(line)
		if ref == "" {
			continue
		}
		coords := chromeMCPCoordinatesFromLine(line)
		refs[nextIndex] = chromeMCPElementRef{Ref: ref, Coordinates: coords, TabID: activeTab.TabID, WindowID: activeTab.WindowID}
		interactive = append(interactive, fmt.Sprintf("[%d] %s", nextIndex, line))
		nextIndex++
		if nextIndex > browserUseMaxElements {
			break
		}
	}

	if len(interactive) == 0 && len(payload.Elements) > 0 {
		for _, element := range payload.Elements {
			if strings.TrimSpace(element.Selector) == "" && element.Coordinates == nil {
				continue
			}
			role := strings.TrimSpace(element.Type)
			if role == "" {
				role = "element"
			}
			label := strings.TrimSpace(element.Text)
			refs[nextIndex] = chromeMCPElementRef{Selector: element.Selector, Coordinates: element.Coordinates, TabID: activeTab.TabID, WindowID: activeTab.WindowID}
			interactive = append(interactive, fmt.Sprintf("[%d] %s %s selector=%q", nextIndex, role, label, element.Selector))
			nextIndex++
			if nextIndex > browserUseMaxElements {
				break
			}
		}
	}

	globalChromeMCPBridge.setElementRefs(refs)

	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("URL: %s\n", strings.TrimSpace(activeTab.URL)))
	builder.WriteString(fmt.Sprintf("Title: %s\n\n", strings.TrimSpace(activeTab.Title)))
	builder.WriteString("Visible page content:\n")
	if strings.TrimSpace(payload.PageContent) != "" {
		builder.WriteString(strings.TrimSpace(payload.PageContent))
		builder.WriteString("\n\n")
	} else {
		builder.WriteString("(empty)\n\n")
	}
	builder.WriteString("Interactive elements:\n")
	if len(interactive) == 0 {
		builder.WriteString("No indexed interactive elements found.\n")
	} else {
		builder.WriteString(strings.Join(interactive, "\n"))
		builder.WriteString("\n")
	}
	if payload.Fallback {
		builder.WriteString(fmt.Sprintf("\nFallback used: %s\n", payload.Reason))
	}
	return builder.String()
}

var (
	chromeMCPRefPattern   = regexp.MustCompile(`\[ref=([^\]]+)\]`)
	chromeMCPCoordPattern = regexp.MustCompile(`\(x=(-?\d+(?:\.\d+)?),y=(-?\d+(?:\.\d+)?)\)`)
)

func chromeMCPRefFromLine(line string) string {
	match := chromeMCPRefPattern.FindStringSubmatch(line)
	if len(match) == 2 {
		return strings.TrimSpace(match[1])
	}
	return ""
}

func chromeMCPLineLooksInteractive(line string) bool {
	lower := strings.ToLower(strings.TrimSpace(line))
	lower = strings.TrimLeft(lower, "- ")
	roles := []string{
		"button", "link", "textbox", "searchbox", "checkbox", "radio", "combobox",
		"listbox", "option", "menuitem", "tab", "switch", "slider", "spinbutton",
		"input", "select", "textarea",
	}
	for _, role := range roles {
		if lower == role || strings.HasPrefix(lower, role+" ") {
			return true
		}
	}
	return false
}

func chromeMCPCoordinatesFromLine(line string) *chromeMCPCoordinates {
	match := chromeMCPCoordPattern.FindStringSubmatch(line)
	if len(match) != 3 {
		return nil
	}
	x, errX := strconv.ParseFloat(match[1], 64)
	y, errY := strconv.ParseFloat(match[2], 64)
	if errX != nil || errY != nil {
		return nil
	}
	return &chromeMCPCoordinates{X: x, Y: y}
}

func chromeMCPCurrentState(ctx context.Context) (string, error) {
	tabs, err := chromeMCPTabs(ctx)
	if err != nil {
		return "", err
	}
	active := chromeMCPActiveTab(tabs)
	media := "unavailable"
	if active.TabID > 0 {
		if text, mediaErr := chromeMCPCallTool(ctx, "chrome_javascript", map[string]interface{}{
			"tabId":          active.TabID,
			"code":           "return " + browserUseMediaStateScript(),
			"timeoutMs":      5000,
			"maxOutputBytes": 8192,
		}); mediaErr == nil {
			var payload struct {
				Success bool   `json:"success"`
				Result  string `json:"result"`
			}
			if json.Unmarshal([]byte(text), &payload) == nil && payload.Success {
				media = payload.Result
			}
		}
	}
	activeIndex := 0
	for _, tab := range tabs {
		if tab.TabID == active.TabID && tab.WindowID == active.WindowID {
			activeIndex = tab.Index
			break
		}
	}
	if strings.TrimSpace(media) == "" {
		media = "none"
	}
	var builder strings.Builder
	builder.WriteString("Current browser state:\n")
	builder.WriteString("- Mode: MCP Chrome Bridge (all tabs)\n")
	if activeIndex > 0 {
		builder.WriteString(fmt.Sprintf("- Active tab: %d/%d\n", activeIndex, len(tabs)))
	} else {
		builder.WriteString(fmt.Sprintf("- Active tab: unknown/%d\n", len(tabs)))
	}
	builder.WriteString(fmt.Sprintf("- Title: %s\n", strings.TrimSpace(active.Title)))
	builder.WriteString(fmt.Sprintf("- URL: %s\n", strings.TrimSpace(active.URL)))
	builder.WriteString("- Media:\n")
	for _, line := range strings.Split(strings.TrimSpace(media), "\n") {
		builder.WriteString(fmt.Sprintf("  %s\n", strings.TrimSpace(line)))
	}
	return builder.String(), nil
}

func chromeMCPSortedElementIndexes() []int {
	globalChromeMCPBridge.mu.Lock()
	defer globalChromeMCPBridge.mu.Unlock()
	indexes := make([]int, 0, len(globalChromeMCPBridge.elementRefs))
	for index := range globalChromeMCPBridge.elementRefs {
		indexes = append(indexes, index)
	}
	sort.Ints(indexes)
	return indexes
}

func chromeMCPElementArgs(arguments map[string]interface{}, allowCoordinates bool) (map[string]interface{}, string, error) {
	if rawIndex, ok := arguments["index"]; ok {
		index, err := browserUsePositiveInt(rawIndex, "index")
		if err != nil {
			return nil, "", err
		}
		ref, ok := globalChromeMCPBridge.elementByIndex(index)
		if !ok {
			return nil, "", fmt.Errorf("element index %d was not found; call browser_use_snapshot before using indexed actions", index)
		}
		args := map[string]interface{}{}
		if ref.TabID > 0 {
			args["tabId"] = ref.TabID
		}
		if ref.WindowID > 0 {
			args["windowId"] = ref.WindowID
		}
		if ref.Ref != "" {
			args["ref"] = ref.Ref
			return args, fmt.Sprintf("index %d (ref %s)", index, ref.Ref), nil
		}
		if ref.Selector != "" {
			args["selector"] = ref.Selector
			return args, fmt.Sprintf("index %d (selector %s)", index, ref.Selector), nil
		}
		if allowCoordinates && ref.Coordinates != nil {
			args["coordinates"] = map[string]interface{}{"x": ref.Coordinates.X, "y": ref.Coordinates.Y}
			return args, fmt.Sprintf("index %d (coordinates %.0f,%.0f)", index, ref.Coordinates.X, ref.Coordinates.Y), nil
		}
		return nil, "", fmt.Errorf("element index %d does not have a usable ref or selector", index)
	}
	if selector, ok := arguments["selector"].(string); ok && strings.TrimSpace(selector) != "" {
		selector = strings.TrimSpace(selector)
		return map[string]interface{}{"selector": selector}, selector, nil
	}
	return nil, "", fmt.Errorf("missing required parameter: index or selector")
}

func chromeMCPJavaScriptResult(text string) string {
	var payload struct {
		Success bool   `json:"success"`
		Result  string `json:"result"`
		Error   struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal([]byte(text), &payload); err == nil {
		if payload.Success {
			return payload.Result
		}
		if payload.Error.Message != "" {
			return payload.Error.Message
		}
	}
	return text
}

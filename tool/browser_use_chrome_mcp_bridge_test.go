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
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestChromeMCPNativeMessageRoundTrip(t *testing.T) {
	var buffer bytes.Buffer
	message := map[string]interface{}{"type": "ping", "payload": map[string]interface{}{"ok": true}}
	if err := writeNativeMessage(&buffer, message); err != nil {
		t.Fatalf("writeNativeMessage() error = %v", err)
	}
	if buffer.Len() < 5 {
		t.Fatalf("encoded message too short: %d", buffer.Len())
	}
	size := binary.LittleEndian.Uint32(buffer.Bytes()[:4])
	if int(size) != buffer.Len()-4 {
		t.Fatalf("header size = %d, want %d", size, buffer.Len()-4)
	}
	raw, err := readNativeMessage(&buffer)
	if err != nil {
		t.Fatalf("readNativeMessage() error = %v", err)
	}
	if !strings.Contains(string(raw), `"type":"ping"`) {
		t.Fatalf("decoded message = %s", raw)
	}
}

func TestChromeMCPWebSocketURL(t *testing.T) {
	got, err := chromeMCPWebSocketURL("http://127.0.0.1:14000", "token-1")
	if err != nil {
		t.Fatalf("chromeMCPWebSocketURL() error = %v", err)
	}
	want := "ws://127.0.0.1:14000/api/browser-use/chrome-mcp/native-host?token=token-1"
	if got != want {
		t.Fatalf("chromeMCPWebSocketURL() = %q, want %q", got, want)
	}
}

func TestChromeMCPBridgeCallRoundTrip(t *testing.T) {
	manager := &chromeMCPBridgeManager{
		pending:     map[string]chan chromeMCPResponsePayload{},
		elementRefs: map[int]chromeMCPElementRef{},
		tabRefs:     map[int]chromeMCPTabRef{},
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := chromeMCPUpgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("Upgrade() error = %v", err)
			return
		}
		manager.attach(conn)
		defer manager.detach(conn)
		for {
			var message chromeMCPNativeWSMessage
			if err := conn.ReadJSON(&message); err != nil {
				return
			}
			if message.Type == "extension_message" {
				manager.handleExtensionMessage(message.Message)
			}
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	socket, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Dial() error = %v", err)
	}
	defer socket.Close()

	done := make(chan struct{})
	go func() {
		defer close(done)
		var outbound chromeMCPNativeWSMessage
		if err := socket.ReadJSON(&outbound); err != nil {
			t.Errorf("ReadJSON() error = %v", err)
			return
		}
		var call struct {
			Type      string `json:"type"`
			RequestID string `json:"requestId"`
			Payload   struct {
				Name string                 `json:"name"`
				Args map[string]interface{} `json:"args"`
			} `json:"payload"`
		}
		if err := json.Unmarshal(outbound.Message, &call); err != nil {
			t.Errorf("Unmarshal call error = %v", err)
			return
		}
		if call.Type != "call_tool" || call.Payload.Name != "chrome_navigate" {
			t.Errorf("unexpected call = %+v", call)
			return
		}
		resultData, _ := json.Marshal(map[string]interface{}{
			"content": []map[string]string{{"type": "text", "text": `{"success":true}`}},
			"isError": false,
		})
		responsePayload, _ := json.Marshal(map[string]interface{}{
			"status": "success",
			"data":   json.RawMessage(resultData),
		})
		response, _ := json.Marshal(map[string]interface{}{
			"type":                "call_tool_response",
			"responseToRequestId": call.RequestID,
			"payload":             json.RawMessage(responsePayload),
		})
		if err := socket.WriteJSON(chromeMCPNativeWSMessage{Type: "extension_message", Message: response}); err != nil {
			t.Errorf("WriteJSON() error = %v", err)
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	text, err := manager.callTool(ctx, "chrome_navigate", map[string]interface{}{"url": "https://example.com"})
	if err != nil {
		t.Fatalf("callTool() error = %v", err)
	}
	if text != `{"success":true}` {
		t.Fatalf("callTool() text = %q", text)
	}
	<-done
}

func TestChromeMCPFormatSnapshotIndexesRefs(t *testing.T) {
	oldRefs := globalChromeMCPBridge.elementRefs
	defer func() {
		globalChromeMCPBridge.mu.Lock()
		globalChromeMCPBridge.elementRefs = oldRefs
		globalChromeMCPBridge.mu.Unlock()
	}()

	snapshot := chromeMCPFormatSnapshot(chromeMCPTabRef{
		TabID:    12,
		WindowID: 2,
		Title:    "Example",
		URL:      "https://example.com",
	}, chromeMCPReadPagePayload{
		Success:     true,
		PageContent: "- button \"Send\" [ref=ref_7] (x=10,y=20)\n- text \"Hello\" [ref=ref_8] (x=30,y=40)",
	})
	if !strings.Contains(snapshot, `[1] - button "Send" [ref=ref_7]`) {
		t.Fatalf("snapshot missing indexed ref: %s", snapshot)
	}
	ref, ok := globalChromeMCPBridge.elementByIndex(1)
	if !ok || ref.Ref != "ref_7" || ref.TabID != 12 || ref.WindowID != 2 {
		t.Fatalf("elementByIndex(1) = %+v, %t", ref, ok)
	}
}

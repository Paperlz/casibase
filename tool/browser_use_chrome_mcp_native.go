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
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	chromeMCPNativeHostName       = "com.chromemcp.nativehost"
	chromeMCPDefaultExtensionID   = "hbdgbgagpkpjffpklnamcljpakneikee"
	chromeMCPDefaultServerURL     = "http://127.0.0.1:14000"
	chromeMCPNativeHostConfigName = "native-host.json"
	chromeMCPWrapperWindowsName   = "run_chrome_mcp_native_host.bat"
	chromeMCPWrapperUnixName      = "run_chrome_mcp_native_host.sh"
)

type ChromeMCPRegisterOptions struct {
	ServerURL   string
	ExtensionID string
}

type chromeMCPNativeHostConfig struct {
	ServerURL   string `json:"serverUrl"`
	ExtensionID string `json:"extensionId"`
	Token       string `json:"token"`
}

type chromeMCPNativeManifest struct {
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Path           string   `json:"path"`
	Type           string   `json:"type"`
	AllowedOrigins []string `json:"allowed_origins"`
}

type chromeMCPNativeWSMessage struct {
	Type    string          `json:"type"`
	Message json.RawMessage `json:"message,omitempty"`
	Error   string          `json:"error,omitempty"`
}

func RegisterChromeMCPNativeHost(options ChromeMCPRegisterOptions) error {
	serverURL := strings.TrimSpace(options.ServerURL)
	if serverURL == "" {
		serverURL = chromeMCPDefaultServerURL
	}
	parsedServerURL, err := url.Parse(serverURL)
	if err != nil || parsedServerURL.Scheme == "" || parsedServerURL.Host == "" {
		return fmt.Errorf("invalid Casibase server URL %q; expected something like %s", serverURL, chromeMCPDefaultServerURL)
	}
	if parsedServerURL.Scheme != "http" && parsedServerURL.Scheme != "https" {
		return fmt.Errorf("invalid Casibase server URL scheme %q; expected http or https", parsedServerURL.Scheme)
	}

	extensionID := strings.TrimSpace(options.ExtensionID)
	if extensionID == "" {
		extensionID = chromeMCPDefaultExtensionID
	}

	configDir, err := chromeMCPBridgeConfigDir()
	if err != nil {
		return err
	}
	if err = os.MkdirAll(configDir, 0o755); err != nil {
		return fmt.Errorf("failed to create Chrome MCP bridge config directory: %w", err)
	}

	config := chromeMCPNativeHostConfig{
		ServerURL:   strings.TrimRight(serverURL, "/"),
		ExtensionID: extensionID,
		Token:       uuid.NewString(),
	}
	configPath := filepath.Join(configDir, chromeMCPNativeHostConfigName)
	configData, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to encode Chrome MCP bridge config: %w", err)
	}
	if err = os.WriteFile(configPath, configData, 0o600); err != nil {
		return fmt.Errorf("failed to write Chrome MCP bridge config %s: %w", configPath, err)
	}

	executablePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to locate current executable: %w", err)
	}
	wrapperPath := filepath.Join(configDir, chromeMCPWrapperUnixName)
	if runtime.GOOS == "windows" {
		wrapperPath = filepath.Join(configDir, chromeMCPWrapperWindowsName)
	}
	if err = writeChromeMCPNativeWrapper(wrapperPath, executablePath, configPath); err != nil {
		return err
	}

	manifest := chromeMCPNativeManifest{
		Name:           chromeMCPNativeHostName,
		Description:    "Casibase Chrome MCP native host bridge",
		Path:           wrapperPath,
		Type:           "stdio",
		AllowedOrigins: []string{fmt.Sprintf("chrome-extension://%s/", extensionID)},
	}
	manifestData, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to encode native messaging manifest: %w", err)
	}

	manifestPath, err := chromeMCPUserManifestPath()
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(manifestPath), 0o755); err != nil {
		return fmt.Errorf("failed to create native messaging manifest directory: %w", err)
	}
	if err = os.WriteFile(manifestPath, manifestData, 0o644); err != nil {
		return fmt.Errorf("failed to write native messaging manifest %s: %w", manifestPath, err)
	}
	if runtime.GOOS == "windows" {
		if err = registerChromeMCPWindowsRegistry(manifestPath); err != nil {
			return err
		}
	}

	fmt.Printf("Chrome MCP native host registered.\n")
	fmt.Printf("Manifest: %s\n", manifestPath)
	fmt.Printf("Wrapper:  %s\n", wrapperPath)
	fmt.Printf("Config:   %s\n", configPath)
	fmt.Printf("Server:   %s\n", config.ServerURL)
	fmt.Printf("Extension allowed origin: chrome-extension://%s/\n", extensionID)
	return nil
}

func RunChromeMCPNativeHost(configPath string) error {
	config, err := loadChromeMCPNativeHostConfig(configPath)
	if err != nil {
		_ = writeNativeMessage(os.Stdout, map[string]interface{}{
			"type":    "error_from_native_host",
			"payload": map[string]interface{}{"message": err.Error()},
		})
		return err
	}

	wsURL, err := chromeMCPWebSocketURL(config.ServerURL, config.Token)
	if err != nil {
		_ = writeNativeMessage(os.Stdout, map[string]interface{}{
			"type":    "error_from_native_host",
			"payload": map[string]interface{}{"message": err.Error()},
		})
		return err
	}

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		_ = writeNativeMessage(os.Stdout, map[string]interface{}{
			"type":    "error_from_native_host",
			"payload": map[string]interface{}{"message": fmt.Sprintf("failed to connect Casibase Chrome MCP bridge: %v", err)},
		})
		return err
	}
	defer conn.Close()

	done := make(chan error, 2)
	go func() {
		for {
			var msg chromeMCPNativeWSMessage
			if err := conn.ReadJSON(&msg); err != nil {
				done <- err
				return
			}
			if msg.Type == "send_to_extension" {
				if err := writeRawNativeMessage(os.Stdout, msg.Message); err != nil {
					done <- err
					return
				}
			}
		}
	}()

	go func() {
		for {
			raw, err := readNativeMessage(os.Stdin)
			if err != nil {
				done <- err
				return
			}
			if err := conn.WriteJSON(chromeMCPNativeWSMessage{Type: "extension_message", Message: raw}); err != nil {
				done <- err
				return
			}
		}
	}()

	err = <-done
	if errors.Is(err, io.EOF) || websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
		return nil
	}
	return err
}

func loadChromeMCPNativeHostConfig(configPath string) (*chromeMCPNativeHostConfig, error) {
	if strings.TrimSpace(configPath) == "" {
		dir, err := chromeMCPBridgeConfigDir()
		if err != nil {
			return nil, err
		}
		configPath = filepath.Join(dir, chromeMCPNativeHostConfigName)
	}
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read Chrome MCP native host config %s: %w", configPath, err)
	}
	var config chromeMCPNativeHostConfig
	if err = json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse Chrome MCP native host config %s: %w", configPath, err)
	}
	if strings.TrimSpace(config.ServerURL) == "" {
		config.ServerURL = chromeMCPDefaultServerURL
	}
	return &config, nil
}

func chromeMCPExpectedToken() string {
	dir, err := chromeMCPBridgeConfigDir()
	if err != nil {
		return ""
	}
	config, err := loadChromeMCPNativeHostConfig(filepath.Join(dir, chromeMCPNativeHostConfigName))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(config.Token)
}

func chromeMCPBridgeConfigDir() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("failed to locate user config directory: %w", err)
	}
	if configDir == "" {
		return "", fmt.Errorf("failed to locate user config directory")
	}
	return filepath.Join(configDir, "openagent", "chrome-mcp-bridge"), nil
}

func chromeMCPUserManifestPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to locate user home directory: %w", err)
	}
	if home == "" {
		return "", fmt.Errorf("failed to locate user home directory")
	}
	switch runtime.GOOS {
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData == "" {
			appData = filepath.Join(home, "AppData", "Roaming")
		}
		return filepath.Join(appData, "Google", "Chrome", "NativeMessagingHosts", chromeMCPNativeHostName+".json"), nil
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts", chromeMCPNativeHostName+".json"), nil
	default:
		return filepath.Join(home, ".config", "google-chrome", "NativeMessagingHosts", chromeMCPNativeHostName+".json"), nil
	}
}

func writeChromeMCPNativeWrapper(wrapperPath, executablePath, configPath string) error {
	var content string
	mode := os.FileMode(0o755)
	if runtime.GOOS == "windows" {
		content = fmt.Sprintf("@echo off\r\n\"%s\" chrome-mcp-native-host --config \"%s\"\r\n", executablePath, configPath)
		mode = 0o644
	} else {
		content = fmt.Sprintf("#!/bin/sh\nexec %s chrome-mcp-native-host --config %s\n", shellQuote(executablePath), shellQuote(configPath))
	}
	if err := os.WriteFile(wrapperPath, []byte(content), mode); err != nil {
		return fmt.Errorf("failed to write Chrome MCP native host wrapper %s: %w", wrapperPath, err)
	}
	if runtime.GOOS != "windows" {
		if err := os.Chmod(wrapperPath, 0o755); err != nil {
			return fmt.Errorf("failed to mark Chrome MCP native host wrapper executable: %w", err)
		}
	}
	return nil
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func registerChromeMCPWindowsRegistry(manifestPath string) error {
	key := `HKCU\Software\Google\Chrome\NativeMessagingHosts\` + chromeMCPNativeHostName
	cmd := exec.Command("reg", "add", key, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to create Chrome native messaging registry entry: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}

func chromeMCPWebSocketURL(serverURL, token string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(serverURL))
	if err != nil {
		return "", err
	}
	switch parsed.Scheme {
	case "http":
		parsed.Scheme = "ws"
	case "https":
		parsed.Scheme = "wss"
	default:
		return "", fmt.Errorf("invalid server URL scheme %q", parsed.Scheme)
	}
	parsed.Path = chromeMCPBridgePath
	query := parsed.Query()
	if strings.TrimSpace(token) != "" {
		query.Set("token", token)
	}
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func readNativeMessage(reader io.Reader) (json.RawMessage, error) {
	var header [4]byte
	if _, err := io.ReadFull(reader, header[:]); err != nil {
		return nil, err
	}
	size := binary.LittleEndian.Uint32(header[:])
	if size == 0 || size > 16*1024*1024 {
		return nil, fmt.Errorf("invalid native message size: %d", size)
	}
	payload := make([]byte, size)
	if _, err := io.ReadFull(reader, payload); err != nil {
		return nil, err
	}
	if !json.Valid(payload) {
		return nil, fmt.Errorf("native message is not valid JSON")
	}
	return json.RawMessage(payload), nil
}

func writeNativeMessage(writer io.Writer, message interface{}) error {
	payload, err := json.Marshal(message)
	if err != nil {
		return err
	}
	return writeRawNativeMessage(writer, payload)
}

func writeRawNativeMessage(writer io.Writer, payload json.RawMessage) error {
	if !json.Valid(payload) {
		return fmt.Errorf("native response is not valid JSON")
	}
	if len(payload) > 16*1024*1024 {
		return fmt.Errorf("native response is too large: %d bytes", len(payload))
	}
	var header [4]byte
	binary.LittleEndian.PutUint32(header[:], uint32(len(payload)))
	if _, err := writer.Write(header[:]); err != nil {
		return err
	}
	_, err := writer.Write(payload)
	return err
}

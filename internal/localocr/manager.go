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

package localocr

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/beego/beego/logs"
	"github.com/the-open-agent/openagent/embedsupport"
)

const (
	DefaultEndpoint = "http://127.0.0.1:8001/ocr/pdf"

	defaultHealthURL      = "http://127.0.0.1:8001/health"
	installMarkerFile     = "requirements.sha256"
	managedServiceTimeout = 2 * time.Minute
)

type Manager struct {
	rootDir       string
	serviceDir    string
	requirements  string
	stateDir      string
	venvDir       string
	installMarker string
	endpoint      string
	healthURL     string
	httpClient    *http.Client

	mu  sync.Mutex
	cmd *exec.Cmd
}

func NewManager(rootDir string) *Manager {
	stateDir := filepath.Join(rootDir, "tmp", "ocr-service")
	serviceDir := filepath.Join(rootDir, "deploy", "ocr-service")
	return &Manager{
		rootDir:       rootDir,
		serviceDir:    serviceDir,
		requirements:  filepath.Join(serviceDir, "requirements.txt"),
		stateDir:      stateDir,
		venvDir:       filepath.Join(stateDir, ".venv"),
		installMarker: filepath.Join(stateDir, installMarkerFile),
		endpoint:      DefaultEndpoint,
		healthURL:     defaultHealthURL,
		httpClient:    &http.Client{Timeout: 2 * time.Second},
	}
}

func Start(ctx context.Context) (*Manager, error) {
	rootDir, err := os.Getwd()
	if err != nil {
		return nil, err
	}

	manager := NewManager(rootDir)
	if err = manager.Start(ctx); err != nil {
		return manager, err
	}
	return manager, nil
}

func (m *Manager) Start(ctx context.Context) error {
	if m.isHealthy() {
		logs.Info("Local OCR service is already running at %s", m.endpoint)
		return nil
	}

	if err := m.ensureServiceFiles(); err != nil {
		return err
	}
	python, err := m.findPython()
	if err != nil {
		return err
	}
	if err = m.ensureInstalled(ctx, python); err != nil {
		return err
	}
	return m.startService(ctx)
}

func (m *Manager) ensureServiceFiles() error {
	if _, err := os.Stat(m.requirements); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}

	embeddedService := embedsupport.OcrServiceFS()
	if embeddedService == nil {
		return fmt.Errorf("OCR service files not found at %s", m.serviceDir)
	}

	serviceDir := filepath.Join(m.stateDir, "service")
	if err := copyEmbeddedService(embeddedService, serviceDir); err != nil {
		return err
	}
	m.serviceDir = serviceDir
	m.requirements = filepath.Join(serviceDir, "requirements.txt")
	return nil
}

func (m *Manager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.cmd == nil || m.cmd.Process == nil {
		return
	}
	if err := m.cmd.Process.Kill(); err != nil {
		logs.Warning("Failed to stop local OCR service: %v", err)
	}
	m.cmd = nil
}

func (m *Manager) findPython() (string, error) {
	var candidates []string
	if runtime.GOOS == "windows" {
		candidates = []string{"python"}
	} else {
		candidates = []string{"python3", "python"}
	}

	for _, candidate := range candidates {
		path, err := exec.LookPath(candidate)
		if err == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf("Python was not found; install Python 3.10+ to enable local OCR")
}

func (m *Manager) ensureInstalled(ctx context.Context, python string) error {
	if m.isInstalled() {
		return nil
	}
	if err := os.MkdirAll(m.stateDir, 0o755); err != nil {
		return err
	}

	logs.Info("Preparing local OCR Python environment at %s", m.venvDir)
	if err := m.run(ctx, m.rootDir, python, "-m", "venv", m.venvDir); err != nil {
		return fmt.Errorf("failed to create OCR virtual environment: %w", err)
	}

	venvPython := venvPythonPath(m.venvDir)
	if err := m.run(ctx, m.rootDir, venvPython, "-m", "pip", "install", "--upgrade", "pip"); err != nil {
		return fmt.Errorf("failed to upgrade pip for OCR service: %w", err)
	}
	if err := m.run(ctx, m.rootDir, venvPython, "-m", "pip", "install", "-r", m.requirements); err != nil {
		return fmt.Errorf("failed to install OCR dependencies: %w", err)
	}

	hash, err := m.requirementsHash()
	if err != nil {
		return err
	}
	if err = os.WriteFile(m.installMarker, []byte(hash), 0o644); err != nil {
		return err
	}
	return nil
}

func (m *Manager) startService(ctx context.Context) error {
	m.mu.Lock()
	venvPython := venvPythonPath(m.venvDir)
	cmd := exec.CommandContext(ctx, venvPython, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8001")
	cmd.Dir = m.serviceDir
	cmd.Stdout = localOcrLogWriter{}
	cmd.Stderr = localOcrLogWriter{}
	if err := cmd.Start(); err != nil {
		m.mu.Unlock()
		return fmt.Errorf("failed to start local OCR service: %w", err)
	}
	m.cmd = cmd
	m.mu.Unlock()

	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	deadline := time.Now().Add(managedServiceTimeout)
	for time.Now().Before(deadline) {
		if m.isHealthy() {
			logs.Info("Local OCR service is ready at %s", m.endpoint)
			go func() {
				if err := <-done; err != nil {
					logs.Warning("Local OCR service stopped: %v", err)
				}
			}()
			return nil
		}
		select {
		case err := <-done:
			m.mu.Lock()
			m.cmd = nil
			m.mu.Unlock()
			return fmt.Errorf("local OCR service stopped before ready: %w", err)
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second):
		}
	}

	_ = cmd.Process.Kill()
	m.mu.Lock()
	m.cmd = nil
	m.mu.Unlock()
	return fmt.Errorf("local OCR service did not become ready before timeout")
}

func (m *Manager) isInstalled() bool {
	hash, err := m.requirementsHash()
	if err != nil {
		return false
	}
	marker, err := os.ReadFile(m.installMarker)
	if err != nil || strings.TrimSpace(string(marker)) != hash {
		return false
	}
	_, err = os.Stat(venvPythonPath(m.venvDir))
	return err == nil
}

func (m *Manager) requirementsHash() (string, error) {
	content, err := os.ReadFile(m.requirements)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:]), nil
}

func (m *Manager) isHealthy() bool {
	resp, err := m.httpClient.Get(m.healthURL)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false
	}

	var body struct {
		Status string `json:"status"`
	}
	if err = json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return false
	}
	return body.Status == "ok"
}

func (m *Manager) run(ctx context.Context, dir string, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	cmd.Stdout = localOcrLogWriter{}
	cmd.Stderr = localOcrLogWriter{}
	return cmd.Run()
}

func venvPythonPath(venvDir string) string {
	if runtime.GOOS == "windows" {
		return filepath.Join(venvDir, "Scripts", "python.exe")
	}
	return filepath.Join(venvDir, "bin", "python")
}

func copyEmbeddedService(source fs.FS, targetDir string) error {
	return fs.WalkDir(source, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		targetPath := filepath.Join(targetDir, filepath.FromSlash(path))
		if d.IsDir() {
			return os.MkdirAll(targetPath, 0o755)
		}

		data, err := fs.ReadFile(source, path)
		if err != nil {
			return err
		}
		return os.WriteFile(targetPath, data, 0o644)
	})
}

type localOcrLogWriter struct{}

func (w localOcrLogWriter) Write(p []byte) (int, error) {
	text := strings.TrimSpace(string(p))
	if text != "" {
		logs.Info("[local_ocr] %s", text)
	}
	return len(p), nil
}

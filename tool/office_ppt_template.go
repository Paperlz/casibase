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
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/ThinkInAIXYZ/go-mcp/protocol"
	"github.com/the-open-agent/openagent/embedsupport"
)

const (
	pptxTemplateDownloadLimit = 100 << 20
	pptxTemplateWorkerTimeout = 5 * time.Minute
)

type pptxTemplateAnalyzeBuiltin struct{}
type pptxTemplateFillBuiltin struct{}

type pptxTemplateAnalyzeArgs struct {
	Template string `json:"template"`
}

type pptxTemplateFillArgs struct {
	Template           string          `json:"template"`
	Path               string          `json:"path"`
	Plan               json.RawMessage `json:"plan"`
	Transition         string          `json:"transition,omitempty"`
	TransitionDuration float64         `json:"transition_duration,omitempty"`
}

type pptxTemplateWorkerSpec struct {
	Action             string          `json:"action"`
	Template           string          `json:"template"`
	Output             string          `json:"output,omitempty"`
	Plan               json.RawMessage `json:"plan,omitempty"`
	Transition         string          `json:"transition,omitempty"`
	TransitionDuration float64         `json:"transition_duration,omitempty"`
}

type pptxTemplateWorkerResult struct {
	OK          bool            `json:"ok"`
	Error       string          `json:"error"`
	Path        string          `json:"path"`
	SlideCount  int             `json:"slide_count"`
	Library     json.RawMessage `json:"library"`
	CheckReport json.RawMessage `json:"check_report"`
}

type pythonCommand struct {
	path string
	args []string
}

func (t *pptxTemplateAnalyzeBuiltin) GetName() string { return "pptx_template_analyze" }

func (t *pptxTemplateAnalyzeBuiltin) GetDescription() string {
	return `Analyze a user-provided PowerPoint template before filling it.
- template (required): local .pptx path or an HTTP(S) URL from a chat attachment.
Returns template_fill_pptx_library.v1 JSON with slide types, text slot IDs, geometry, capacity metrics, tables, charts, and a plan contract. Use the returned IDs to build a template_fill_pptx_plan.v1 plan, then call pptx_template_fill.`
}

func (t *pptxTemplateAnalyzeBuiltin) GetInputSchema() interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"template": map[string]interface{}{
				"type":        "string",
				"description": "Local .pptx path or HTTP(S) chat attachment URL.",
			},
		},
		"required": []string{"template"},
	}
}

func (t *pptxTemplateAnalyzeBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	var args pptxTemplateAnalyzeArgs
	if result := decodePptxTemplateArguments(arguments, &args); result != nil {
		return result, nil
	}
	args.Template = strings.TrimSpace(args.Template)
	if args.Template == "" {
		return officeToolError("Missing required parameter: template"), nil
	}

	templatePath, cleanup, err := resolvePptxTemplate(ctx, args.Template)
	if err != nil {
		return officeToolError(fmt.Sprintf("Failed to open PowerPoint template: %s", err.Error())), nil
	}
	defer cleanup()

	result, err := runPptxTemplateWorker(ctx, pptxTemplateWorkerSpec{
		Action:   "analyze",
		Template: templatePath,
	})
	if err != nil {
		return officeToolError(fmt.Sprintf("Failed to analyze PowerPoint template: %s", err.Error())), nil
	}
	if len(result.Library) == 0 {
		return officeToolError("Failed to analyze PowerPoint template: worker returned no slide library"), nil
	}

	var pretty bytes.Buffer
	if err := json.Indent(&pretty, result.Library, "", "  "); err != nil {
		return officeToolError(fmt.Sprintf("Failed to parse template analysis: %s", err.Error())), nil
	}
	return officeToolText(pretty.String()), nil
}

func (t *pptxTemplateFillBuiltin) GetName() string { return "pptx_template_fill" }

func (t *pptxTemplateFillBuiltin) GetDescription() string {
	return `Create a new PowerPoint file by deterministically filling and reusing slides from an existing template.
- Call pptx_template_analyze first and use its exact slide, slot, table, and chart IDs.
- template: local .pptx path or HTTP(S) chat attachment URL.
- path: exact output .pptx path; relative paths resolve to the user's Documents folder.
- plan: template_fill_pptx_plan.v1 object. Slides may be selected, repeated, and reordered. Each slide supports replacements, table_edits, chart_edits, and notes.
- Do not insert manual line breaks into titles unless they are intentional; single-line template titles are auto-fitted by default.
- Keep replacement text concise and respect capacity warnings. New text/image or text/text collisions are validation errors: shorten the content or choose another template slide.
- transition defaults to "keep", preserving source transitions and object animations.
The plan is checked before writing. Missing targets, invalid chart data, and new object collisions stop generation; capacity warnings are returned with the successful result.`
}

func (t *pptxTemplateFillBuiltin) GetInputSchema() interface{} {
	stringProperty := func(description string) map[string]interface{} {
		return map[string]interface{}{"type": "string", "description": description}
	}
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"template": stringProperty("Local .pptx path or HTTP(S) chat attachment URL."),
			"path":     stringProperty("Exact output path for the generated .pptx file."),
			"plan": map[string]interface{}{
				"type":        "object",
				"description": "A template_fill_pptx_plan.v1 plan built from pptx_template_analyze output.",
				"properties": map[string]interface{}{
					"schema":      map[string]interface{}{"type": "string", "const": "template_fill_pptx_plan.v1"},
					"source_pptx": stringProperty("Ignored for security; the template argument is always used."),
					"slides": map[string]interface{}{
						"type":     "array",
						"minItems": 1,
						"items": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"source_slide": map[string]interface{}{"type": "integer", "minimum": 1},
								"purpose":      stringProperty("Optional semantic purpose."),
								"replacements": map[string]interface{}{
									"type": "array",
									"items": map[string]interface{}{
										"type": "object",
										"properties": map[string]interface{}{
											"slot_id": stringProperty("Text slot ID from analysis."),
											"text":    stringProperty("Replacement text."),
											"preserve_line_breaks": map[string]interface{}{
												"type":        "boolean",
												"description": "Preserve explicit line breaks in a title. Defaults to false for single-line title slots.",
												"default":     false,
											},
										},
										"required": []string{"slot_id", "text"},
									},
								},
								"table_edits": map[string]interface{}{
									"type": "array",
									"items": map[string]interface{}{
										"type": "object",
										"properties": map[string]interface{}{
											"table_id": stringProperty("Table ID from analysis."),
											"cells": map[string]interface{}{
												"type": "array",
												"items": map[string]interface{}{
													"type": "object",
													"properties": map[string]interface{}{
														"row":  map[string]interface{}{"type": "integer", "minimum": 0},
														"col":  map[string]interface{}{"type": "integer", "minimum": 0},
														"text": stringProperty("Replacement cell text."),
													},
													"required": []string{"row", "col", "text"},
												},
											},
										},
										"required": []string{"table_id", "cells"},
									},
								},
								"chart_edits": map[string]interface{}{
									"type": "array",
									"items": map[string]interface{}{
										"type": "object",
										"properties": map[string]interface{}{
											"chart_id":   stringProperty("Chart ID from analysis."),
											"categories": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "string"}},
											"series": map[string]interface{}{
												"type": "array",
												"items": map[string]interface{}{
													"type": "object",
													"properties": map[string]interface{}{
														"name":   stringProperty("Series name."),
														"values": map[string]interface{}{"type": "array", "items": map[string]interface{}{"type": "number"}},
													},
													"required": []string{"name", "values"},
												},
											},
										},
										"required": []string{"chart_id", "categories", "series"},
									},
								},
								"notes":      stringProperty("Speaker notes for the generated slide."),
								"transition": stringProperty("Optional per-slide transition; keep preserves the source."),
								"transition_duration": map[string]interface{}{
									"type":        "number",
									"description": "Optional per-slide transition duration in seconds.",
									"minimum":     0,
								},
								"advance_after": map[string]interface{}{
									"type":        "number",
									"description": "Optional automatic slide advance delay in seconds.",
									"minimum":     0,
								},
							},
							"required": []string{"source_slide"},
						},
					},
				},
				"required": []string{"schema", "slides"},
			},
			"transition": map[string]interface{}{
				"type":        "string",
				"description": "Default slide transition. Use keep to preserve the source transition.",
				"default":     "keep",
			},
			"transition_duration": map[string]interface{}{
				"type":        "number",
				"description": "Default transition duration in seconds when setting a transition.",
				"minimum":     0,
				"default":     0.5,
			},
		},
		"required": []string{"template", "path", "plan"},
	}
}

func (t *pptxTemplateFillBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	var args pptxTemplateFillArgs
	if result := decodePptxTemplateArguments(arguments, &args); result != nil {
		return result, nil
	}
	args.Template = strings.TrimSpace(args.Template)
	args.Path = strings.TrimSpace(args.Path)
	if args.Template == "" {
		return officeToolError("Missing required parameter: template"), nil
	}
	if args.Path == "" {
		return officeToolError("Missing required parameter: path"), nil
	}
	if strings.ToLower(filepath.Ext(args.Path)) != ".pptx" {
		return officeToolError("Invalid path: output must use the .pptx extension"), nil
	}
	if len(bytes.TrimSpace(args.Plan)) == 0 || bytes.Equal(bytes.TrimSpace(args.Plan), []byte("null")) {
		return officeToolError("Missing required parameter: plan"), nil
	}
	var plan map[string]interface{}
	if err := json.Unmarshal(args.Plan, &plan); err != nil {
		return officeToolError(fmt.Sprintf("Invalid plan: %s", err.Error())), nil
	}
	if plan["schema"] != "template_fill_pptx_plan.v1" {
		return officeToolError("Invalid plan: schema must be template_fill_pptx_plan.v1"), nil
	}

	templatePath, cleanup, err := resolvePptxTemplate(ctx, args.Template)
	if err != nil {
		return officeToolError(fmt.Sprintf("Failed to open PowerPoint template: %s", err.Error())), nil
	}
	defer cleanup()

	transition := strings.TrimSpace(args.Transition)
	if transition == "" {
		transition = "keep"
	}
	duration := args.TransitionDuration
	if duration == 0 {
		duration = 0.5
	}
	outputPath := ResolveOutputPath(args.Path)
	result, err := runPptxTemplateWorker(ctx, pptxTemplateWorkerSpec{
		Action:             "fill",
		Template:           templatePath,
		Output:             outputPath,
		Plan:               args.Plan,
		Transition:         transition,
		TransitionDuration: duration,
	})
	if err != nil {
		return officeToolError(fmt.Sprintf("Failed to fill PowerPoint template: %s", err.Error())), nil
	}

	report := "none"
	if len(result.CheckReport) != 0 {
		var pretty bytes.Buffer
		if json.Indent(&pretty, result.CheckReport, "", "  ") == nil {
			report = pretty.String()
		}
	}
	return officeToolText(fmt.Sprintf(
		"Successfully filled PowerPoint template: %s\n%d slide(s) written\nValidation report:\n%s",
		result.Path, result.SlideCount, report,
	)), nil
}

func decodePptxTemplateArguments(arguments map[string]interface{}, target interface{}) *protocol.CallToolResult {
	data, err := json.Marshal(arguments)
	if err != nil {
		return officeToolError(fmt.Sprintf("Failed to parse parameters: %s", err.Error()))
	}
	if err := json.Unmarshal(data, target); err != nil {
		return officeToolError(fmt.Sprintf("Failed to parse parameters: %s", err.Error()))
	}
	return nil
}

func resolvePptxTemplate(ctx context.Context, value string) (string, func(), error) {
	parsed, err := url.Parse(value)
	if err != nil {
		return "", func() {}, fmt.Errorf("invalid template location: %w", err)
	}
	if parsed.Scheme == "http" || parsed.Scheme == "https" {
		return downloadPptxTemplate(ctx, parsed)
	}
	if parsed.Scheme != "" && strings.Contains(value, "://") {
		return "", func() {}, fmt.Errorf("unsupported URL scheme %q; only HTTP(S) is allowed", parsed.Scheme)
	}

	path, err := filepath.Abs(value)
	if err != nil {
		return "", func() {}, err
	}
	if err := validatePptxPackage(path); err != nil {
		return "", func() {}, err
	}
	return path, func() {}, nil
}

func downloadPptxTemplate(ctx context.Context, location *url.URL) (string, func(), error) {
	client := &http.Client{
		Timeout: 90 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("too many redirects")
			}
			if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
				return errors.New("redirected to a non-HTTP(S) URL")
			}
			return nil
		},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, location.String(), nil)
	if err != nil {
		return "", func() {}, err
	}
	response, err := client.Do(request)
	if err != nil {
		return "", func() {}, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", func() {}, fmt.Errorf("download returned HTTP %d", response.StatusCode)
	}
	if response.ContentLength > pptxTemplateDownloadLimit {
		return "", func() {}, fmt.Errorf("template exceeds the 100 MB download limit")
	}

	file, err := os.CreateTemp("", "openagent-pptx-template-*.pptx")
	if err != nil {
		return "", func() {}, err
	}
	path := file.Name()
	cleanup := func() { _ = os.Remove(path) }
	limited := io.LimitReader(response.Body, pptxTemplateDownloadLimit+1)
	written, copyErr := io.Copy(file, limited)
	closeErr := file.Close()
	if copyErr != nil {
		cleanup()
		return "", func() {}, copyErr
	}
	if closeErr != nil {
		cleanup()
		return "", func() {}, closeErr
	}
	if written > pptxTemplateDownloadLimit {
		cleanup()
		return "", func() {}, fmt.Errorf("template exceeds the 100 MB download limit")
	}
	if err := validatePptxPackage(path); err != nil {
		cleanup()
		return "", func() {}, err
	}
	return path, cleanup, nil
}

func validatePptxPackage(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return fmt.Errorf("template path is a directory")
	}
	if strings.ToLower(filepath.Ext(path)) != ".pptx" {
		return fmt.Errorf("template must use the .pptx extension")
	}
	reader, err := zip.OpenReader(path)
	if err != nil {
		return fmt.Errorf("template is not a valid ZIP/PPTX package: %w", err)
	}
	defer reader.Close()
	required := map[string]bool{
		"[Content_Types].xml":  false,
		"ppt/presentation.xml": false,
	}
	for _, entry := range reader.File {
		if _, ok := required[entry.Name]; ok {
			required[entry.Name] = true
		}
	}
	for name, found := range required {
		if !found {
			return fmt.Errorf("invalid PPTX package: missing %s", name)
		}
	}
	return nil
}

func runPptxTemplateWorker(ctx context.Context, spec pptxTemplateWorkerSpec) (*pptxTemplateWorkerResult, error) {
	python, err := findPptxTemplatePython()
	if err != nil {
		return nil, err
	}
	workerPath, cleanup, err := findPptxTemplateWorkerPath()
	if err != nil {
		return nil, err
	}
	defer cleanup()

	specFile, err := os.CreateTemp("", "openagent-pptx-template-*.json")
	if err != nil {
		return nil, err
	}
	specPath := specFile.Name()
	defer os.Remove(specPath)
	if err := json.NewEncoder(specFile).Encode(spec); err != nil {
		specFile.Close()
		return nil, err
	}
	if err := specFile.Close(); err != nil {
		return nil, err
	}

	workerCtx, cancel := context.WithTimeout(ctx, pptxTemplateWorkerTimeout)
	defer cancel()
	commandArgs := append(append([]string{}, python.args...), workerPath, specPath)
	cmd := exec.CommandContext(workerCtx, python.path, commandArgs...)
	cmd.Dir = filepath.Dir(workerPath)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	runErr := cmd.Run()

	var result pptxTemplateWorkerResult
	parseErr := json.Unmarshal(bytes.TrimSpace(stdout.Bytes()), &result)
	if runErr != nil {
		if errors.Is(workerCtx.Err(), context.DeadlineExceeded) {
			return nil, fmt.Errorf("Python worker timed out after %s", pptxTemplateWorkerTimeout)
		}
		if parseErr == nil && result.Error != "" {
			if len(result.CheckReport) > 0 {
				var pretty bytes.Buffer
				if json.Indent(&pretty, result.CheckReport, "", "  ") == nil {
					return nil, fmt.Errorf("%s\nValidation report:\n%s", result.Error, pretty.String())
				}
			}
			return nil, errors.New(result.Error)
		}
		detail := strings.TrimSpace(stderr.String())
		if detail == "" {
			detail = runErr.Error()
		}
		return nil, fmt.Errorf("Python worker failed: %s", detail)
	}
	if parseErr != nil {
		return nil, fmt.Errorf("invalid Python worker output: %w", parseErr)
	}
	if !result.OK {
		return nil, errors.New(result.Error)
	}
	return &result, nil
}

func findPptxTemplatePython() (pythonCommand, error) {
	if configured := strings.TrimSpace(os.Getenv("OPENAGENT_PYTHON")); configured != "" {
		path, err := exec.LookPath(configured)
		if err != nil {
			return pythonCommand{}, fmt.Errorf("OPENAGENT_PYTHON was not found: %s", configured)
		}
		return pythonCommand{path: path}, nil
	}
	for _, name := range []string{"python3", "python"} {
		if path, err := exec.LookPath(name); err == nil {
			return pythonCommand{path: path}, nil
		}
	}
	if runtime.GOOS == "windows" {
		if path, err := exec.LookPath("py"); err == nil {
			return pythonCommand{path: path, args: []string{"-3"}}, nil
		}
	}
	return pythonCommand{}, errors.New("Python was not found; install Python 3.10 or newer or set OPENAGENT_PYTHON")
}

func findPptxTemplateWorkerPath() (string, func(), error) {
	var candidates []string
	if exeDir, err := pptxExecutableDir(); err == nil {
		candidates = append(candidates, filepath.Join(exeDir, "pptx-template-worker", "worker.py"))
	}
	candidates = append(candidates,
		filepath.Join("tool", "pptx-template-worker", "worker.py"),
		filepath.Join("pptx-template-worker", "worker.py"),
	)
	for _, candidate := range candidates {
		info, err := os.Stat(candidate)
		if err != nil || info.IsDir() {
			continue
		}
		absolute, absErr := filepath.Abs(candidate)
		if absErr == nil {
			candidate = absolute
		}
		return candidate, func() {}, nil
	}

	embedded := embedsupport.PptxTemplateWorkerFS()
	if embedded == nil {
		return "", func() {}, errors.New("PPTX template worker not found; build with -tags embed or place it in pptx-template-worker")
	}
	root, err := os.MkdirTemp("", "openagent-pptx-template-worker-*")
	if err != nil {
		return "", func() {}, err
	}
	cleanup := func() { _ = os.RemoveAll(root) }
	err = fs.WalkDir(embedded, ".", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		target := filepath.Join(root, filepath.FromSlash(path))
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		data, readErr := fs.ReadFile(embedded, path)
		if readErr != nil {
			return readErr
		}
		return os.WriteFile(target, data, 0o644)
	})
	if err != nil {
		cleanup()
		return "", func() {}, fmt.Errorf("failed to extract embedded PPTX template worker: %w", err)
	}
	return filepath.Join(root, "worker.py"), cleanup, nil
}

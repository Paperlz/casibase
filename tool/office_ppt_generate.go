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
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/ThinkInAIXYZ/go-mcp/protocol"
)

type pptxGenerateBuiltin struct{}

type pptxGenerateArgs struct {
	Path       string      `json:"path"`
	ScriptPath string      `json:"script_path"`
	AssetsDir  string      `json:"assets_dir,omitempty"`
	Data       interface{} `json:"data,omitempty"`
}

type pptxGenerateWorkerResult struct {
	OK         bool   `json:"ok"`
	Path       string `json:"path"`
	SlideCount int    `json:"slideCount"`
	Mode       string `json:"mode"`
	Error      string `json:"error"`
}

func (t *pptxGenerateBuiltin) GetName() string { return "pptx_generate" }

func (t *pptxGenerateBuiltin) GetDescription() string {
	return `Generate a PowerPoint (.pptx) deck by running a trusted local PptxGenJS module.
- path (required): output .pptx path. Absolute paths are used as-is. Relative paths are resolved inside the current user's Documents folder.
- script_path (required): local .mjs file that exports default async function build(pptx, ctx) or a named build function. The script adds slides to the provided PptxGenJS instance; the worker writes the file.
- data (optional): JSON value passed to ctx.data for content or configuration.
- assets_dir (optional): base directory for ctx.resolveAsset() and relative ctx.imageData() paths. Defaults to the script directory.
Use this for designed, editable decks. The script should call PptxGenJS APIs directly instead of generating HTML.`
}

func (t *pptxGenerateBuiltin) GetInputSchema() interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"path": map[string]interface{}{
				"type":        "string",
				"description": "Output path for the .pptx file.",
			},
			"script_path": map[string]interface{}{
				"type":        "string",
				"description": "Local .mjs file exporting default build(pptx, ctx) or named build(pptx, ctx).",
			},
			"data": map[string]interface{}{
				"type":        "object",
				"description": "Optional JSON value passed through to the PptxGenJS script as ctx.data.",
			},
			"assets_dir": map[string]interface{}{
				"type":        "string",
				"description": "Optional asset base directory for ctx.resolveAsset() and ctx.imageData(). Defaults to the script directory.",
			},
		},
		"required": []string{"path", "script_path"},
	}
}

func (t *pptxGenerateBuiltin) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	argBytes, err := json.Marshal(arguments)
	if err != nil {
		return officeToolError(fmt.Sprintf("Failed to parse parameters: %s", err.Error())), nil
	}

	var args pptxGenerateArgs
	if err := json.Unmarshal(argBytes, &args); err != nil {
		return officeToolError(fmt.Sprintf("Failed to parse parameters: %s", err.Error())), nil
	}

	args.Path = strings.TrimSpace(args.Path)
	if args.Path == "" {
		return officeToolError("Missing required parameter: path"), nil
	}

	args.ScriptPath = strings.TrimSpace(args.ScriptPath)
	if args.ScriptPath == "" {
		return officeToolError("Missing required parameter: script_path"), nil
	}
	if !filepath.IsAbs(args.ScriptPath) {
		args.ScriptPath, err = filepath.Abs(args.ScriptPath)
		if err != nil {
			return officeToolError(fmt.Sprintf("Invalid script_path: %s", err.Error())), nil
		}
	}
	scriptInfo, err := os.Stat(args.ScriptPath)
	if err != nil {
		return officeToolError(fmt.Sprintf("Invalid script_path: %s", err.Error())), nil
	}
	if scriptInfo.IsDir() {
		return officeToolError("Invalid script_path: must be a file"), nil
	}

	args.AssetsDir = strings.TrimSpace(args.AssetsDir)
	if args.AssetsDir == "" {
		args.AssetsDir = filepath.Dir(args.ScriptPath)
	} else {
		if !filepath.IsAbs(args.AssetsDir) {
			args.AssetsDir, err = filepath.Abs(args.AssetsDir)
			if err != nil {
				return officeToolError(fmt.Sprintf("Invalid assets_dir: %s", err.Error())), nil
			}
		}
		assetsInfo, err := os.Stat(args.AssetsDir)
		if err != nil {
			return officeToolError(fmt.Sprintf("Invalid assets_dir: %s", err.Error())), nil
		}
		if !assetsInfo.IsDir() {
			return officeToolError("Invalid assets_dir: must be a directory"), nil
		}
	}

	workerPath := strings.TrimSpace(os.Getenv("OPENAGENT_PPTX_WORKER"))
	if workerPath != "" {
		if !filepath.IsAbs(workerPath) {
			workerPath, err = filepath.Abs(workerPath)
			if err != nil {
				return officeToolError(fmt.Sprintf("Invalid OPENAGENT_PPTX_WORKER: %s", err.Error())), nil
			}
		}
		workerInfo, err := os.Stat(workerPath)
		if err != nil {
			return officeToolError(fmt.Sprintf("Invalid OPENAGENT_PPTX_WORKER: %s", err.Error())), nil
		}
		if workerInfo.IsDir() {
			return officeToolError("Invalid OPENAGENT_PPTX_WORKER: must be a file"), nil
		}
	} else {
		for _, candidate := range []string{
			filepath.Join("tool", "pptx-worker", "worker.mjs"),
			filepath.Join("pptx-worker", "worker.mjs"),
		} {
			if _, err := os.Stat(candidate); err == nil {
				workerPath, err = filepath.Abs(candidate)
				if err != nil {
					workerPath = candidate
				}
				break
			}
		}
		if workerPath == "" {
			return officeToolError("PowerPoint worker not found: tool/pptx-worker/worker.mjs"), nil
		}
	}

	args.Path = resolveOutputPath(args.Path)

	specFile, err := os.CreateTemp("", "openagent-pptxgenjs-*.json")
	if err != nil {
		return officeToolError(fmt.Sprintf("Failed to create worker spec: %s", err.Error())), nil
	}
	defer os.Remove(specFile.Name())

	if err := json.NewEncoder(specFile).Encode(args); err != nil {
		specFile.Close()
		return officeToolError(fmt.Sprintf("Failed to write worker spec: %s", err.Error())), nil
	}
	if err := specFile.Close(); err != nil {
		return officeToolError(fmt.Sprintf("Failed to close worker spec: %s", err.Error())), nil
	}

	var stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, "node", workerPath, specFile.Name())
	cmd.Dir = filepath.Dir(workerPath)
	cmd.Stderr = &stderr
	output, err := cmd.Output()
	if err != nil {
		var workerResult pptxGenerateWorkerResult
		if len(bytes.TrimSpace(output)) > 0 && json.Unmarshal(bytes.TrimSpace(output), &workerResult) == nil && workerResult.Error != "" {
			return officeToolError(fmt.Sprintf("Failed to generate PowerPoint file: %s", workerResult.Error)), nil
		}

		detail := strings.TrimSpace(stderr.String())
		if detail == "" {
			detail = err.Error()
		}
		return officeToolError(fmt.Sprintf("Failed to run PowerPoint worker: %s", detail)), nil
	}

	var workerResult pptxGenerateWorkerResult
	if err := json.Unmarshal(bytes.TrimSpace(output), &workerResult); err != nil {
		return officeToolError(fmt.Sprintf("Failed to parse PowerPoint worker output: %s", err.Error())), nil
	}
	if !workerResult.OK {
		return officeToolError(fmt.Sprintf("Failed to generate PowerPoint file: %s", workerResult.Error)), nil
	}

	mode := workerResult.Mode
	if mode == "" {
		mode = "pptxgenjs"
	}
	return officeToolText(fmt.Sprintf(
		"Successfully generated PowerPoint file: %s\n%d slide(s) written\nmode: %s",
		workerResult.Path, workerResult.SlideCount, mode,
	)), nil
}

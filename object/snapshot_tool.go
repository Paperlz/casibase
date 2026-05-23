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

package object

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/ThinkInAIXYZ/go-mcp/protocol"
	"github.com/the-open-agent/openagent/tool"
)

type snapshotBuiltinTool struct {
	owner string
	inner tool.BuiltinTool
}

func wrapSnapshotBuiltin(owner string, builtin tool.BuiltinTool) tool.BuiltinTool {
	switch builtin.GetName() {
	case "local_file_write", "local_file_move":
		return &snapshotBuiltinTool{owner: owner, inner: builtin}
	default:
		return builtin
	}
}

func (t *snapshotBuiltinTool) GetName() string {
	return t.inner.GetName()
}

func (t *snapshotBuiltinTool) GetDescription() string {
	return t.inner.GetDescription()
}

func (t *snapshotBuiltinTool) GetInputSchema() interface{} {
	return t.inner.GetInputSchema()
}

func (t *snapshotBuiltinTool) Execute(ctx context.Context, arguments map[string]interface{}) (*protocol.CallToolResult, error) {
	action, path, source, target, paths := getSnapshotToolPaths(t.GetName(), arguments)
	if len(paths) == 0 {
		return t.inner.Execute(ctx, arguments)
	}

	beforeStates, err := captureSnapshotFiles(paths)
	if err != nil {
		return nil, err
	}

	result, err := t.inner.Execute(ctx, arguments)
	if err != nil || result == nil || result.IsError {
		return result, err
	}

	afterStates, err := captureSnapshotFiles(paths)
	if err != nil {
		fmt.Printf("snapshot capture failed after %s: %s\n", t.GetName(), err.Error())
		return result, nil
	}

	files := make([]SnapshotFile, 0, len(paths))
	for _, p := range paths {
		before := beforeStates[p]
		after := afterStates[p]
		if !snapshotFileChanged(before, after) {
			continue
		}
		files = append(files, makeSnapshotFile(before, after))
	}
	if len(files) == 0 {
		return result, nil
	}

	snapshot := newSnapshot(t.owner, action, path, source, target, files, buildSnapshotDiff(files, beforeStates, afterStates))
	if _, err = AddSnapshot(snapshot); err != nil {
		fmt.Printf("snapshot save failed after %s: %s\n", t.GetName(), err.Error())
	}
	return result, nil
}

func getSnapshotToolPaths(toolName string, arguments map[string]interface{}) (string, string, string, string, []string) {
	switch toolName {
	case "local_file_write":
		path := snapshotStringArg(arguments, "path")
		if path == "" {
			return "", "", "", "", nil
		}
		path = filepath.Clean(path)
		return "write", path, "", "", []string{path}
	case "local_file_move":
		source := snapshotStringArg(arguments, "source")
		target := snapshotStringArg(arguments, "target")
		if source == "" || target == "" {
			return "", "", "", "", nil
		}
		source = filepath.Clean(source)
		target = filepath.Clean(target)
		return "move", "", source, target, uniqueSnapshotPaths(source, target)
	default:
		return "", "", "", "", nil
	}
}

func snapshotStringArg(arguments map[string]interface{}, key string) string {
	value, _ := arguments[key].(string)
	return strings.TrimSpace(value)
}

func uniqueSnapshotPaths(paths ...string) []string {
	res := []string{}
	seen := map[string]bool{}
	for _, p := range paths {
		if p == "" || seen[p] {
			continue
		}
		seen[p] = true
		res = append(res, p)
	}
	return res
}

func captureSnapshotFiles(paths []string) (map[string]snapshotFileState, error) {
	res := map[string]snapshotFileState{}
	for _, p := range paths {
		state, err := captureSnapshotFile(p)
		if err != nil {
			return nil, err
		}
		res[p] = state
	}
	return res, nil
}

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
	"fmt"
	"strings"

	"github.com/ThinkInAIXYZ/go-mcp/protocol"
	"github.com/the-open-agent/openagent/agent"
	"github.com/the-open-agent/openagent/agent/builtin_tool"
	"github.com/the-open-agent/openagent/tool"
	"github.com/the-open-agent/openagent/util"
)

func MergeToolProviderNames(existing []string, extra string) []string {
	res := []string{}
	seen := map[string]bool{}

	add := func(name string) {
		name = strings.TrimSpace(name)
		if name == "" || seen[name] {
			return
		}
		seen[name] = true
		res = append(res, name)
	}

	for _, name := range existing {
		add(name)
	}
	add(extra)

	return res
}

func buildMergedBuiltinRegistry(store *Store, lang string) *builtin_tool.ToolRegistry {
	reg := builtin_tool.NewToolRegistry()

	if store == nil {
		fmt.Printf("[ToolDebug] buildMergedBuiltinRegistry: store is nil\n")
		return reg
	}

	fmt.Printf("[ToolDebug] buildMergedBuiltinRegistry: owner=%s toolProviders=%v\n", store.Owner, store.ToolProviders)
	for _, pname := range store.ToolProviders {
		p, err := getToolProviderForStoreOwner(store.Owner, pname)
		if err != nil {
			fmt.Printf("[ToolDebug] tool provider %q lookup error: %v\n", pname, err)
			continue
		}
		if p == nil {
			fmt.Printf("[ToolDebug] tool provider %q not found for owner=%s or admin\n", pname, store.Owner)
			continue
		}
		if p.Category != "Tool" {
			fmt.Printf("[ToolDebug] provider %s skipped: category=%s type=%s\n", p.GetId(), p.Category, p.Type)
			continue
		}
		tp, err := tool.NewProvider(getToolProviderConfig(p), lang)
		if err != nil {
			fmt.Printf("[ToolDebug] provider %s type=%s init error: %v\n", p.GetId(), p.Type, err)
			continue
		}
		toolNames := []string{}
		for _, t := range tp.BuiltinTools() {
			reg.RegisterTool(t)
			toolNames = append(toolNames, t.GetName())
		}
		fmt.Printf("[ToolDebug] provider %s type=%s registered tools=%v\n", p.GetId(), p.Type, toolNames)
	}

	return reg
}

func getToolProviderForStoreOwner(owner string, name string) (*Provider, error) {
	if strings.TrimSpace(name) == "" {
		return nil, nil
	}

	if strings.TrimSpace(owner) != "" {
		id := util.GetIdFromOwnerAndName(owner, name)
		p, err := GetProvider(id)
		if err != nil {
			return nil, err
		}
		if p != nil {
			return p, nil
		}
	}

	if owner != "admin" {
		id := util.GetIdFromOwnerAndName("admin", name)
		p, err := GetProvider(id)
		if err != nil {
			return nil, err
		}
		if p != nil {
			return p, nil
		}
	}

	return nil, nil
}

func HasCallableAgentTools(agentClients *agent.AgentClients) bool {
	return agentClients != nil && (len(agentClients.Tools) > 0 || agentClients.WebSearchEnabled)
}

func GetAgentToolNames(agentClients *agent.AgentClients) []string {
	if agentClients == nil {
		return nil
	}

	res := []string{}
	for _, tool := range agentClients.Tools {
		if tool == nil {
			continue
		}
		res = append(res, tool.Name)
	}
	if agentClients.WebSearchEnabled {
		res = append(res, "web_search_preview")
	}
	return res
}

// MergeAgentToolClients merges MCP agent tools with tools from configured Tool providers, plus web-search flag.
func MergeAgentToolClients(agentClients *agent.AgentClients, store *Store, webSearchEnabled bool, lang string) *agent.AgentClients {
	if webSearchEnabled {
		if agentClients == nil {
			agentClients = &agent.AgentClients{}
		}
		agentClients.WebSearchEnabled = true
	}

	reg := buildMergedBuiltinRegistry(store, lang)
	allTools := reg.GetToolsAsProtocolTools()
	fmt.Printf("[ToolDebug] MergeAgentToolClients: builtinTools=%d names=%v webSearchEnabled=%v\n", len(allTools), protocolToolNames(allTools), webSearchEnabled)
	if len(allTools) == 0 {
		fmt.Printf("[ToolDebug] MergeAgentToolClients: finalTools=%d names=%v\n", len(GetAgentToolNames(agentClients)), GetAgentToolNames(agentClients))
		return agentClients
	}

	if agentClients == nil {
		agentClients = &agent.AgentClients{
			Tools:          allTools,
			BuiltinToolReg: reg,
		}
		fmt.Printf("[ToolDebug] MergeAgentToolClients: finalTools=%d names=%v\n", len(GetAgentToolNames(agentClients)), GetAgentToolNames(agentClients))
		return agentClients
	}

	agentClients.Tools = append(agentClients.Tools, allTools...)
	agentClients.BuiltinToolReg = reg
	fmt.Printf("[ToolDebug] MergeAgentToolClients: finalTools=%d names=%v\n", len(GetAgentToolNames(agentClients)), GetAgentToolNames(agentClients))
	return agentClients
}

func protocolToolNames(tools []*protocol.Tool) []string {
	res := []string{}
	for _, tool := range tools {
		if tool == nil {
			continue
		}
		res = append(res, tool.Name)
	}
	return res
}

// Copyright 2026 The Casibase Authors. All Rights Reserved.
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
	"github.com/casibase/casibase/agent"
	"github.com/casibase/casibase/agent/builtin_tool"
	"github.com/casibase/casibase/tool"
	"github.com/casibase/casibase/util"
)

func buildMergedBuiltinRegistry(store *Store, lang string) *builtin_tool.ToolRegistry {
	reg := builtin_tool.NewToolRegistry()

	if store == nil {
		return reg
	}

	for _, pname := range store.ToolProviders {
		id := util.GetIdFromOwnerAndName(store.Owner, pname)
		p, err := GetProvider(id)
		if err != nil || p == nil || p.Category != "Tool" {
			continue
		}
		tp, err := tool.NewProvider(getToolProviderConfig(p), lang)
		if err != nil {
			continue
		}
		for _, t := range tp.BuiltinTools() {
			reg.RegisterTool(t)
		}
	}

	return reg
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
	if len(allTools) == 0 {
		return agentClients
	}

	if agentClients == nil {
		return &agent.AgentClients{
			Tools:          allTools,
			BuiltinToolReg: reg,
		}
	}

	agentClients.Tools = append(agentClients.Tools, allTools...)
	agentClients.BuiltinToolReg = reg
	return agentClients
}

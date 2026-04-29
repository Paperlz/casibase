// Copyright 2025 The OpenAgent Authors. All Rights Reserved.
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

package model

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/ThinkInAIXYZ/go-mcp/protocol"
	"github.com/openai/openai-go/v2/responses"
	"github.com/sashabaranov/go-openai"
	"github.com/the-open-agent/openagent/agent"
	"github.com/the-open-agent/openagent/i18n"
)

type AgentMessages struct {
	Messages  []*RawMessage
	ToolCalls any
}

type AgentInfo struct {
	AgentClients    *agent.AgentClients
	AgentMessages   *AgentMessages
	RequireToolCall bool
}

type ToolCallResponse struct {
	Success  bool        `json:"success"`
	Data     interface{} `json:"data"`
	Error    string      `json:"error,omitempty"`
	ToolName string      `json:"toolName"`
}

type ToolCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
	Content   string `json:"content"`
}

func reverseToolsToOpenAi(tools []*protocol.Tool) ([]openai.Tool, error) {
	var openaiTools []openai.Tool
	for _, tool := range tools {
		schemaBytes, err := json.Marshal(tool.InputSchema)
		if err != nil {
			return nil, err
		}

		var parameters map[string]interface{}
		if err := json.Unmarshal(schemaBytes, &parameters); err != nil {
			return nil, err
		}
		openaiTools = append(openaiTools, openai.Tool{
			Type: "function",
			Function: &openai.FunctionDefinition{
				Name:        tool.Name,
				Description: tool.Description,
				Parameters:  parameters,
			},
		})
	}
	return openaiTools, nil
}

func handleToolCallsParameters(toolCall openai.ToolCall, toolCalls []openai.ToolCall, toolCallsMap map[int]int) ([]openai.ToolCall, map[int]int) {
	if toolCallsMap == nil {
		toolCallsMap = make(map[int]int)
	}

	idx := *toolCall.Index
	if existingIdx, exists := toolCallsMap[idx]; exists {
		if toolCall.Function.Name != "" {
			toolCalls[existingIdx].Function.Name = toolCall.Function.Name
		}
		if toolCall.Function.Arguments != "" {
			toolCalls[existingIdx].Function.Arguments += toolCall.Function.Arguments
		}
	} else {
		newIdx := len(toolCalls)
		toolCallsMap[idx] = newIdx
		toolCalls = append(toolCalls, toolCall)
	}
	return toolCalls, toolCallsMap
}

func QueryTextWithTools(p ModelProvider, question string, writer io.Writer, history []*RawMessage, prompt string, knowledgeMessages []*RawMessage, agentInfo *AgentInfo, lang string) (*ModelResult, error) {
	var messages []*RawMessage
	modelResult, err := queryTextWithToolChoiceFallback(p, question, writer, history, prompt, knowledgeMessages, agentInfo, lang)
	if err != nil {
		return nil, err
	}

	if agentInfo.AgentMessages.ToolCalls == nil {
		fmt.Printf("Tool Call: [None]\n")
		return modelResult, nil
	}

	toolCalls, ok := agentInfo.AgentMessages.ToolCalls.([]openai.ToolCall)
	if !ok {
		responseFunctionToolCalls := agentInfo.AgentMessages.ToolCalls.([]responses.ResponseFunctionToolCall)
		for _, responseFunctionToolCall := range responseFunctionToolCalls {
			toolCalls = append(toolCalls, openai.ToolCall{
				ID:       responseFunctionToolCall.ID,
				Type:     "function",
				Function: openai.FunctionCall{Name: responseFunctionToolCall.Name, Arguments: responseFunctionToolCall.Arguments},
			})
		}
	}

	for len(toolCalls) > 0 {
		for _, toolCall := range toolCalls {
			serverName, toolName := agent.GetServerNameAndToolNameFromId(toolCall.Function.Name)

			messages = append(messages, &RawMessage{
				Text:     "Call result from " + toolCall.Function.Name,
				Author:   "AI",
				ToolCall: toolCall,
			})

			messages, err = callTools(toolCall, serverName, toolName, agentInfo.AgentClients, messages, writer, lang)
			if err != nil {
				return nil, err
			}
		}
		agentInfo.AgentMessages.Messages = messages
		agentInfo.RequireToolCall = false
		modelResult, err = p.QueryText(question, writer, history, prompt, knowledgeMessages, agentInfo, lang)
		if err != nil {
			return nil, err
		}
		toolCalls, ok = agentInfo.AgentMessages.ToolCalls.([]openai.ToolCall)
		if !ok {
			toolCalls = []openai.ToolCall{}
			responseFunctionToolCalls := agentInfo.AgentMessages.ToolCalls.([]responses.ResponseFunctionToolCall)
			for _, responseFunctionToolCall := range responseFunctionToolCalls {
				toolCalls = append(toolCalls, openai.ToolCall{
					ID:       responseFunctionToolCall.ID,
					Type:     "function",
					Function: openai.FunctionCall{Name: responseFunctionToolCall.Name, Arguments: responseFunctionToolCall.Arguments},
				})
			}
		}
	}

	for _, mcpClient := range agentInfo.AgentClients.Clients {
		mcpClient.Close()
	}
	return modelResult, nil
}

func queryTextWithToolChoiceFallback(p ModelProvider, question string, writer io.Writer, history []*RawMessage, prompt string, knowledgeMessages []*RawMessage, agentInfo *AgentInfo, lang string) (*ModelResult, error) {
	if agentInfo != nil {
		fmt.Printf("[ToolDebug] QueryTextWithTools: requireToolCall=%v toolChoice=%s toolCount=%d toolNames=%v\n", agentInfo.RequireToolCall, getToolChoiceMode(agentInfo), len(getAgentToolDebugNames(agentInfo)), getAgentToolDebugNames(agentInfo))
	}
	modelResult, err := p.QueryText(question, writer, history, prompt, knowledgeMessages, agentInfo, lang)
	if err == nil || agentInfo == nil || !agentInfo.RequireToolCall || !isRequiredToolChoiceUnsupported(err) {
		if agentInfo != nil {
			agentInfo.RequireToolCall = false
		}
		return modelResult, err
	}

	fmt.Printf("[ToolDebug] QueryTextWithTools: tool_choice=required unsupported, fallback to auto: %v\n", err)
	agentInfo.RequireToolCall = false
	return p.QueryText(question, writer, history, prompt, knowledgeMessages, agentInfo, lang)
}

func isRequiredToolChoiceUnsupported(err error) bool {
	if err == nil {
		return false
	}
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "required") && (strings.Contains(text, "tool_choice") || strings.Contains(text, "tool choice"))
}

func getToolChoiceMode(agentInfo *AgentInfo) string {
	if agentInfo != nil && agentInfo.RequireToolCall {
		return "required"
	}
	return "auto"
}

func getAgentToolDebugNames(agentInfo *AgentInfo) []string {
	if agentInfo == nil || agentInfo.AgentClients == nil {
		return nil
	}

	res := []string{}
	for _, tool := range agentInfo.AgentClients.Tools {
		if tool == nil {
			continue
		}
		res = append(res, tool.Name)
	}
	if agentInfo.AgentClients.WebSearchEnabled {
		res = append(res, "web_search_preview")
	}
	return res
}

func ShouldRequireToolCall(question string) bool {
	text := strings.ToLower(strings.TrimSpace(question))
	if text == "" {
		return false
	}

	if strings.Contains(text, "http://") || strings.Contains(text, "https://") || strings.Contains(text, "www.") {
		return true
	}

	keywords := []string{
		"下载", "搜索", "搜一下", "查找", "查询", "最新", "联网", "访问", "打开网页", "读取网页", "抓取",
		"执行", "运行", "安装", "命令", "终端", "shell", "视频", "课程", "网盘", "百度网盘", "b站", "哔哩", "youtube",
		"download", "search", "find", "latest", "recent", "browse", "open url", "fetch", "crawl", "scrape",
		"execute", "run", "install", "command", "terminal", "shell", "yt-dlp", "youtube", "bilibili", "curl", "wget",
	}

	for _, keyword := range keywords {
		if strings.Contains(text, keyword) {
			return true
		}
	}
	return false
}

func createToolMessage(toolCall openai.ToolCall, text string) *RawMessage {
	return &RawMessage{
		Text:       text,
		Author:     "Tool",
		ToolCallID: toolCall.ID,
	}
}

func callTools(toolCall openai.ToolCall, serverName, toolName string, agentClients *agent.AgentClients, messages []*RawMessage, writer io.Writer, lang string) ([]*RawMessage, error) {
	var arguments map[string]interface{}
	ctx := context.Background()

	if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &arguments); err != nil {
		return nil, fmt.Errorf(i18n.Translate(lang, "model:failed to parse tool arguments: %v"), err)
	}

	fmt.Printf("Tool Call: [%s]\n", toolCall.Function.Name)
	fmt.Printf("Arguments: [%s]\n", toolCall.Function.Arguments)

	var result *protocol.CallToolResult
	var err error

	if serverName == "" {
		// builtin tools
		if agentClients.BuiltinToolReg == nil {
			return messages, nil
		}
		result, err = agentClients.BuiltinToolReg.ExecuteTool(ctx, toolName, arguments)
	} else {
		// MCP tools
		mcpClient, ok := agentClients.Clients[serverName]
		if !ok {
			return messages, nil
		}
		req := &protocol.CallToolRequest{
			Name:      toolName,
			Arguments: arguments,
		}
		result, err = mcpClient.CallTool(ctx, req)
	}

	response := &ToolCallResponse{
		ToolName: toolCall.Function.Name,
	}

	if err != nil {
		response.Success = false
		response.Error = err.Error()
	} else if result.IsError {
		response.Success = false
		contentBytes, err := json.Marshal(result.Content)
		if err != nil {
			response.Error = fmt.Sprintf(i18n.Translate(lang, "model:failed to marshal error content: %v"), err)
		} else {
			response.Error = string(contentBytes)
		}
	} else {
		response.Success = true
		contentBytes, err := json.Marshal(result.Content)
		if err != nil {
			response.Data = fmt.Sprintf(i18n.Translate(lang, "model:failed to marshal content: %v"), err)
		} else {
			response.Data = string(contentBytes)
		}
	}

	responseJson, err := json.Marshal(response)
	if err != nil {
		return nil, fmt.Errorf(i18n.Translate(lang, "model:failed to marshal tool response: %v"), err)
	}

	var contentStr string
	if !response.Success {
		contentStr = response.Error
	} else {
		contentStr = response.Data.(string)
	}

	fmt.Printf("Tool Result: [%s]\n", contentStr)

	toolData := ToolCall{
		Name:      toolCall.Function.Name,
		Arguments: toolCall.Function.Arguments,
		Content:   contentStr,
	}
	toolJSON, err := json.Marshal(toolData)
	if err == nil {
		if err := flushDataThink(string(toolJSON), "tool", writer, lang); err == nil {
		}
	}

	messages = append(messages, createToolMessage(toolCall, string(responseJson)))
	return messages, nil
}

func GetToolCallsFromWriter(toolMessage string) []ToolCall {
	if toolMessage == "" {
		return nil
	}
	var toolCalls []ToolCall
	toolCallLines := strings.Split(toolMessage, "\n")
	for _, line := range toolCallLines {
		if line == "" {
			continue
		}
		var toolCall ToolCall
		if err := json.Unmarshal([]byte(line), &toolCall); err == nil {
			toolCalls = append(toolCalls, toolCall)
		}
	}
	return toolCalls
}

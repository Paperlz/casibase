// Copyright 2023 The OpenAgent Authors. All Rights Reserved.
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
	"github.com/sashabaranov/go-openai"
)

func IsVisionModel(subType string) bool {
	visionModels := []string{
		// GPT-5.4 series (latest)
		"gpt-5.4", "gpt-5.4-pro", "gpt-5.4-mini", "gpt-5.4-nano",
		// GPT-5.3 series
		"gpt-5.3-codex", "gpt-5.3-chat",
		// GPT-5.2 series
		"gpt-5.2", "gpt-5.2-chat", "gpt-5.2-codex",
		// GPT-5.1 series
		"gpt-5.1", "gpt-5.1-chat", "gpt-5.1-codex", "gpt-5.1-codex-mini", "gpt-5.1-codex-max",
		// GPT-5 series
		"gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5-codex", "gpt-5-pro",
		// o-series (latest first)
		"o4-mini", "codex-mini", "o3-pro", "o3", "o1-pro", "o1",
		// GPT-4.1 series
		"gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano",
		// GPT-4.5 / GPT-4o series
		"gpt-4.5", "gpt-4.5-preview", "gpt-4.5-preview-2025-02-27",
		"gpt-4o", "gpt-4o-2024-08-06", "gpt-4o-mini", "gpt-4o-mini-2024-07-18",
		// Specialized
		"computer-use-preview",
	}

	for _, visionModel := range visionModels {
		if subType == visionModel {
			return true
		}
	}

	return false
}

func OpenaiRawMessagesToGptVisionMessages(messages []*RawMessage) ([]openai.ChatCompletionMessage, error) {
	res := []openai.ChatCompletionMessage{}
	for _, message := range messages {
		var role string
		if message.Author == "AI" {
			role = openai.ChatMessageRoleAssistant
		} else if message.Author == "System" {
			role = openai.ChatMessageRoleSystem
		} else if message.Author == "Tool" {
			role = openai.ChatMessageRoleTool
		} else {
			role = openai.ChatMessageRoleUser
		}

		imageRefs, messageText, err := extractImageRefsFromMessage(message.Text)
		if err != nil {
			return []openai.ChatCompletionMessage{}, err
		}

		item := openai.ChatCompletionMessage{
			Role:             role,
			ReasoningContent: message.ReasoningContent,
		}

		if role == openai.ChatMessageRoleTool {
			item.ToolCallID = message.ToolCallID
		} else if role == openai.ChatMessageRoleAssistant {
			if message.ToolCall.ID != "" {
				item.ToolCalls = []openai.ToolCall{message.ToolCall}
			} else {
				item.ToolCalls = nil
			}
		}

		if len(messageText) > 0 {
			item.MultiContent = []openai.ChatMessagePart{
				{
					Type: openai.ChatMessagePartTypeText,
					Text: messageText,
				},
			}
		}

		for _, imageRef := range imageRefs {
			item.MultiContent = append(item.MultiContent, openai.ChatMessagePart{
				Type: openai.ChatMessagePartTypeImageURL,
				ImageURL: &openai.ChatMessageImageURL{
					URL:    imageRef,
					Detail: openai.ImageURLDetailAuto,
				},
			})
		}

		res = append(res, item)
	}
	return res, nil
}

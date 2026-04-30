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

package model

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"runtime"
	"strings"

	"github.com/openai/openai-go/v2"
	"github.com/openai/openai-go/v2/option"
	"github.com/openai/openai-go/v2/packages/param"
	"github.com/openai/openai-go/v2/responses"
	"github.com/openai/openai-go/v2/shared"
	"github.com/the-open-agent/openagent/i18n"
	"github.com/the-open-agent/openagent/proxy"
)

const (
	OpenAICodexBaseURL   = "https://chatgpt.com/backend-api/codex"
	openAICodexClaimPath = "https://api.openai.com/auth"
)

type OpenAICodexModelProvider struct {
	subType     string
	accessToken string
	accountId   string
	temperature float32
	topP        float32
}

func NewOpenAICodexModelProvider(subType string, accessToken string, accountId string, temperature float32, topP float32) (*OpenAICodexModelProvider, error) {
	accessToken = strings.TrimSpace(accessToken)
	if accessToken == "" {
		return nil, fmt.Errorf("OpenAI Codex requires ChatGPT OAuth credentials")
	}
	if strings.TrimSpace(subType) == "" {
		subType = "gpt-5.4"
	}
	if strings.TrimSpace(accountId) == "" {
		accountId = ExtractOpenAICodexAccountID(accessToken)
	}
	return &OpenAICodexModelProvider{
		subType:     subType,
		accessToken: accessToken,
		accountId:   accountId,
		temperature: temperature,
		topP:        topP,
	}, nil
}

func (p *OpenAICodexModelProvider) GetPricing() string {
	return `OpenAI Codex uses the signed-in user's ChatGPT/Codex subscription. Casibase does not calculate per-token API billing for this provider.`
}

func ExtractOpenAICodexAccountID(accessToken string) string {
	parts := strings.Split(accessToken, ".")
	if len(parts) < 2 {
		return ""
	}

	payload := parts[1]
	payloadBytes, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		payloadBytes, err = base64.URLEncoding.DecodeString(payload)
		if err != nil {
			return ""
		}
	}

	claims := map[string]interface{}{}
	if err = json.Unmarshal(payloadBytes, &claims); err != nil {
		return ""
	}

	authClaims, ok := claims[openAICodexClaimPath].(map[string]interface{})
	if !ok {
		return ""
	}
	accountId, ok := authClaims["chatgpt_account_id"].(string)
	if !ok {
		return ""
	}
	return accountId
}

func getOpenAICodexClient(accessToken string, accountId string) openai.Client {
	httpClient := proxy.ProxyHttpClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	httpClient = getOpenAICodexHTTPClient(httpClient, accountId)

	opts := []option.RequestOption{
		option.WithHTTPClient(httpClient),
		option.WithAPIKey(accessToken),
		option.WithBaseURL(OpenAICodexBaseURL),
		option.WithHeader("OpenAI-Beta", "responses=experimental"),
		option.WithHeader("originator", "pi"),
		option.WithHeader("User-Agent", getOpenAICodexUserAgent()),
	}
	return openai.NewClient(opts...)
}

type openAICodexRoundTripper struct {
	base      http.RoundTripper
	accountId string
}

func getOpenAICodexHTTPClient(baseClient *http.Client, accountId string) *http.Client {
	if baseClient == nil {
		baseClient = http.DefaultClient
	}
	httpClient := *baseClient
	baseTransport := baseClient.Transport
	if baseTransport == nil {
		baseTransport = http.DefaultTransport
	}
	httpClient.Transport = &openAICodexRoundTripper{base: baseTransport, accountId: accountId}
	return &httpClient
}

func getOpenAICodexUserAgent() string {
	return fmt.Sprintf("pi (%s; %s)", runtime.GOOS, runtime.GOARCH)
}

func (t *openAICodexRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	req.Header["originator"] = []string{"pi"}
	req.Header["OpenAI-Beta"] = []string{"responses=experimental"}
	req.Header["User-Agent"] = []string{getOpenAICodexUserAgent()}
	req.Header["Accept"] = []string{"text/event-stream"}
	req.Header["Content-Type"] = []string{"application/json"}
	if t.accountId != "" {
		req.Header["chatgpt-account-id"] = []string{t.accountId}
	}
	return t.base.RoundTrip(req)
}

func (p *OpenAICodexModelProvider) QueryText(question string, writer io.Writer, history []*RawMessage, prompt string, knowledgeMessages []*RawMessage, agentInfo *AgentInfo, lang string) (*ModelResult, error) {
	if strings.HasPrefix(question, DryRunPrefix) {
		return &ModelResult{Currency: "USD"}, nil
	}

	flusher, ok := writer.(http.Flusher)
	if !ok {
		return nil, fmt.Errorf("%s", i18n.Translate(lang, "model:writer does not implement http.Flusher"))
	}
	_ = flusher

	model := p.subType
	if getOpenAiModelType(model) != "Chat" {
		return nil, fmt.Errorf(i18n.Translate(lang, "model:QueryText() error: unknown model type: %s"), model)
	}

	rawMessages, err := OpenaiGenerateMessages(prompt, question, history, knowledgeMessages, model, getContextLength(model), lang)
	if err != nil {
		return nil, err
	}
	if agentInfo != nil && agentInfo.AgentMessages != nil && agentInfo.AgentMessages.Messages != nil {
		rawMessages = append(rawMessages, agentInfo.AgentMessages.Messages...)
	}

	var messages responses.ResponseInputParam
	if IsVisionModel(model) {
		messages, err = openaiRawMessagesToGptVisionMessages(rawMessages)
		if err != nil {
			return nil, err
		}
	} else {
		messages = openaiRawMessagesToMessages(rawMessages)
	}

	req := responses.ResponseNewParams{
		Instructions:      param.NewOpt[string](prompt),
		Input:             responses.ResponseNewParamsInputUnion{OfInputItemList: messages},
		Model:             model,
		Store:             param.NewOpt[bool](false),
		ParallelToolCalls: param.NewOpt[bool](true),
		Include:           []responses.ResponseIncludable{responses.ResponseIncludableReasoningEncryptedContent},
		Reasoning:         shared.ReasoningParam{Summary: "auto"},
		Text:              responses.ResponseTextConfigParam{Verbosity: responses.ResponseTextConfigVerbosityMedium},
		ToolChoice: responses.ResponseNewParamsToolChoiceUnion{
			OfToolChoiceMode: param.NewOpt(responses.ToolChoiceOptionsAuto),
		},
	}
	if p.temperature > 0 {
		req.Temperature = param.NewOpt[float64](float64(p.temperature))
	}
	if p.topP > 0 {
		req.TopP = param.NewOpt[float64](float64(p.topP))
	}

	if agentInfo != nil && agentInfo.AgentClients != nil {
		agentTools, err := reverseMcpToolsToOpenAi(agentInfo.AgentClients.Tools)
		if err != nil {
			return nil, err
		}
		if agentInfo.AgentClients.WebSearchEnabled {
			agentTools = append(agentTools, responses.ToolParamOfWebSearchPreview(responses.WebSearchToolTypeWebSearchPreview))
		}
		req.Tools = agentTools
	}

	client := getOpenAICodexClient(p.accessToken, p.accountId)
	respStream := client.Responses.NewStreaming(context.Background(), req)
	defer respStream.Close()

	modelResult := &ModelResult{Currency: "USD"}
	var toolCalls []responses.ResponseFunctionToolCall
	isLeadingReturn := true
	for respStream.Next() {
		response := respStream.Current()
		switch variant := response.AsAny().(type) {
		case responses.ResponseReasoningSummaryTextDeltaEvent:
			err = flushDataThink(variant.Delta, "reason", writer, lang)
			if err != nil {
				return nil, err
			}
		case responses.ResponseTextDeltaEvent:
			data := variant.Delta
			if isLeadingReturn && len(data) != 0 {
				if strings.Count(data, "\n") == len(data) {
					continue
				}
				isLeadingReturn = false
			}

			err = flushDataThink(data, "message", writer, lang)
			if err != nil {
				return nil, err
			}
		case responses.ResponseOutputItemDoneEvent:
			switch v := variant.Item.AsAny().(type) {
			case responses.ResponseFunctionToolCall:
				toolCalls = append(toolCalls, v)
			case responses.ResponseOutputMessage:
				if v.Status == "completed" {
					for _, contentItem := range v.Content {
						if contentItem.Type != "output_text" || len(contentItem.Annotations) == 0 {
							continue
						}
						var searchResults []SearchResult
						for idx, annotation := range contentItem.Annotations {
							searchResults = append(searchResults, SearchResult{
								Index: idx + 1,
								URL:   annotation.URL,
								Title: annotation.Title,
							})
						}
						searchResultsJSON, _ := json.Marshal(searchResults)
						flushDataThink(string(searchResultsJSON), "search", writer, lang)
					}
				}
			}
		case responses.ResponseCompletedEvent:
			modelResult.ResponseTokenCount = int(variant.Response.Usage.OutputTokens)
			modelResult.PromptTokenCount = int(variant.Response.Usage.InputTokens)
			modelResult.TotalTokenCount = int(variant.Response.Usage.TotalTokens)
		}
	}
	if respStream.Err() != nil {
		return nil, respStream.Err()
	}

	if agentInfo != nil && agentInfo.AgentMessages != nil {
		agentInfo.AgentMessages.ToolCalls = toolCalls
	}
	modelResult.TotalPrice = 0
	return modelResult, nil
}

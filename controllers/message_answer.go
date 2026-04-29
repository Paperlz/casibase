// Copyright 2024 The OpenAgent Authors. All Rights Reserved.
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

package controllers

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/the-open-agent/openagent/conf"
	"github.com/the-open-agent/openagent/embedding"
	"github.com/the-open-agent/openagent/model"
	"github.com/the-open-agent/openagent/object"
	"github.com/the-open-agent/openagent/util"
)

const hermesToolExecutionPrompt = `
You are an intelligent AI assistant with access to tools. You are helpful, knowledgeable, and direct. You assist users with answering questions, analyzing information, writing and editing code, and executing actions via your tools. Be targeted and efficient in your exploration and investigations.

# Tool-use enforcement
You MUST use your tools to take action when tools can make progress. Do not describe what you would do or plan to do without actually doing it. When you say you will perform an action, immediately make the corresponding tool call in the same response. Never end your turn with only a promise of future action.

Keep working until the task is actually complete. If you have tools available that can accomplish the task, use them instead of telling the user what you would do. Every response should either contain tool calls that make progress or deliver a final result to the user.

<mandatory_tool_use>
NEVER answer these from memory or mental computation when a suitable tool is available:
- Current facts, latest information, web pages, URLs, videos, courses, and downloadable resources: use web_search, web_fetch, or browser tools.
- Command-line tasks, downloads from a clear legal URL, curl, wget, checking installed programs, local files, directories, and system state: use shell.
- If shell is available, do not claim you cannot access the local filesystem, terminal, or command-line tools. Use shell when it is the right tool.
</mandatory_tool_use>

<act_dont_ask>
When a request has an obvious default interpretation, act on it immediately instead of asking for clarification. Ask a clarifying question only when the missing information genuinely blocks the next tool call or changes which action should be taken.
</act_dont_ask>

<prerequisite_checks>
Before taking an action, check whether prerequisite discovery, lookup, or context-gathering steps are needed. Do not skip prerequisite steps just because the final action seems obvious. If a task depends on output from a prior step, resolve that dependency first.
</prerequisite_checks>

<missing_context>
If required context is missing, do not guess or hallucinate an answer. Use the appropriate lookup tool when missing information is retrievable. Ask a clarifying question only when the information cannot be retrieved by tools.
</missing_context>`

// GetMessageAnswer
// @Title GetMessageAnswer
// @Tag Message API
// @Description get message answer
// @Param id query string true "The id of message"
// @Success 200 {stream} string "An event stream of message answers in JSON format"
// @router /get-message-answer [get]
func (c *ApiController) GetMessageAnswer() {
	id := c.Input().Get("id")

	c.Ctx.ResponseWriter.Header().Set("Content-Type", "text/event-stream")
	c.Ctx.ResponseWriter.Header().Set("Cache-Control", "no-cache")
	c.Ctx.ResponseWriter.Header().Set("Connection", "keep-alive")

	message, err := object.GetMessage(id)
	if err != nil {
		c.ResponseErrorStream(message, err.Error())
		return
	}

	if message == nil {
		c.ResponseErrorStream(message, fmt.Sprintf("The message: %s is not found", id))
		return
	}

	if message.Author != "AI" {
		c.ResponseErrorStream(message, fmt.Sprintf("The message is invalid, message author should be \"AI\", but got \"%s\"", message.Author))
		return
	}
	if message.ReplyTo == "" {
		c.ResponseErrorStream(message, "The message is invalid, message replyTo should not be empty")
		return
	}
	if message.Text != "" {
		c.ResponseErrorStream(message, fmt.Sprintf("The message is invalid, message text should be empty, but got \"%s\"", message.Text))
		return
	}

	if strings.HasPrefix(message.ErrorText, "error, status code: 400, message: The response was filtered due to the prompt triggering") {
		c.ResponseErrorStream(message, message.ErrorText)
		return
	}

	chatId := util.GetIdFromOwnerAndName(message.Owner, message.Chat)
	chat, err := object.GetChat(chatId)
	if err != nil {
		c.ResponseErrorStream(message, err.Error())
		return
	}

	//if chat == nil || chat.Organization != message.Organization {
	//	c.ResponseErrorStream(message, fmt.Sprintf("The chat: %s is not found", chatId))
	//	return
	//}

	if chat.Type != "AI" {
		c.ResponseErrorStream(message, "The chat type must be \"AI\"")
		return
	}

	store, err := object.ResolveStoreForChat(chat)
	if err != nil {
		c.ResponseErrorStream(message, err.Error())
		return
	}
	if store == nil {
		if chat.ToolProvider != "" || chat.ModelProvider != "" {
			store = &object.Store{
				Owner:          "admin",
				ModelProvider:  chat.ModelProvider,
				KnowledgeCount: 10,
			}
		} else {
			c.ResponseErrorStream(message, fmt.Sprintf(c.T("account:The store: %s is not found"), chat.Store))
			return
		}
	}

	store.ToolProviders = object.MergeToolProviderNames(store.ToolProviders, chat.ToolProvider)
	fmt.Printf("[ToolDebug] GetMessageAnswer: chat=%s store=%s owner=%s chatToolProvider=%q mergedToolProviders=%v\n", chat.Name, chat.Store, store.Owner, chat.ToolProvider, store.ToolProviders)

	question := store.Welcome
	var questionMessage *object.Message
	if message.ReplyTo != "Welcome" {
		questionMessage, err = object.GetMessage(util.GetId("admin", message.ReplyTo))
		if err != nil {
			c.ResponseErrorStream(message, err.Error())
			return
		}
		if questionMessage == nil {
			c.ResponseErrorStream(message, fmt.Sprintf("The message: %s is not found", id))
			return
		}

		question = questionMessage.Text

		question, err = refineQuestionTextViaParsingUrlContent(question, c.GetAcceptLanguage())
		if err != nil {
			c.ResponseErrorStream(message, err.Error())
			return
		}
	}

	if question == "" {
		c.ResponseErrorStream(message, fmt.Sprintf("The question should not be empty"))
		return
	}

	_, ok := c.CheckSignedIn()
	if !ok {
		var count int
		count, err = object.GetNearMessageCount(message.User, store.LimitMinutes)
		if err != nil {
			c.ResponseErrorStream(message, err.Error())
			return
		}
		if count > store.Frequency {
			c.ResponseErrorStream(message, "You have queried too many times, please wait for a while")
			return
		}
	}

	modelProviderName := store.ModelProvider
	if chat.ModelProvider != "" {
		modelProviderName = chat.ModelProvider
	}

	modelProvider, modelProviderObj, err := object.GetModelProviderFromContext(store.Owner, modelProviderName, c.GetAcceptLanguage())
	if err != nil {
		c.ResponseErrorStream(message, err.Error())
		return
	}

	// Perform dry run to validate user has sufficient balance before expensive operations
	err = validateTransactionBeforeAIGeneration(message, chat, store, question, modelProvider, modelProviderObj, c.GetAcceptLanguage(), c.ResponseErrorStream)
	if err != nil {
		return
	}

	embeddingProvider, embeddingProviderObj, err := object.GetEmbeddingProviderFromContext(store.Owner, chat.User2, c.GetAcceptLanguage())
	if err != nil {
		c.ResponseErrorStream(message, err.Error())
		return
	}

	_, agentProviderObj, err := object.GetAgentProviderFromContext(store.Owner, store.AgentProvider, c.GetAcceptLanguage())
	if err != nil {
		c.ResponseErrorStream(message, err.Error())
		return
	}

	agentClients, err := object.GetAgentClients(agentProviderObj)
	if err != nil {
		c.ResponseErrorStream(message, err.Error())
		return
	}

	webSearchEnabled := false
	if questionMessage != nil {
		webSearchEnabled = questionMessage.WebSearchEnabled
	}
	agentClients = object.MergeAgentToolClients(agentClients, store, webSearchEnabled, c.GetAcceptLanguage())
	hasCallableTools := object.HasCallableAgentTools(agentClients)
	fmt.Printf("[ToolDebug] GetMessageAnswer: hasCallableTools=%v toolCount=%d toolNames=%v webSearchEnabled=%v\n", hasCallableTools, len(object.GetAgentToolNames(agentClients)), object.GetAgentToolNames(agentClients), webSearchEnabled)
	if hasCallableTools {
		store.Prompt += "\n\n" + hermesToolExecutionPrompt
	}

	var knowledge []*model.RawMessage
	var vectorScores []object.VectorScore
	embeddingResult := &embedding.EmbeddingResult{}

	if chat.ToolProvider == "" {
		knowledgeCount := store.KnowledgeCount
		if knowledgeCount <= 0 {
			knowledgeCount = 10
		}

		knowledge, vectorScores, embeddingResult, err = object.GetNearestKnowledge(store.Name, store.VectorStores, store.SearchProvider, embeddingProvider, embeddingProviderObj, modelProvider, store.Owner, question, knowledgeCount, c.GetAcceptLanguage())
		if err != nil && err.Error() != "no knowledge vectors found" {
			err = fmt.Errorf(c.T("message_answer:object.GetNearestKnowledge() error, %s"), err.Error())
			c.ResponseErrorStream(message, err.Error())
			return
		}
		if embeddingResult == nil {
			embeddingResult = &embedding.EmbeddingResult{}
		}
	}

	writer := &RefinedWriter{*c.Ctx.ResponseWriter, *NewCleaner(6), []byte{}, []byte{}, []byte{}, []byte{}, []byte{}}

	if questionMessage != nil {
		questionMessage.TokenCount = embeddingResult.TokenCount
		questionMessage.Price = embeddingResult.Price
		questionMessage.Currency = embeddingResult.Currency

		_, err = object.UpdateMessage(questionMessage.GetId(), questionMessage, false)
		if err != nil {
			c.ResponseErrorStream(message, err.Error())
			return
		}
	}

	history, err := object.GetRecentRawMessages(chat.Name, message.CreatedTime, store.MemoryLimit)
	if err != nil {
		c.ResponseErrorStream(message, err.Error())
		return
	}

	fmt.Printf("Question: [%s]\n", question)
	fmt.Printf("Knowledge: [\n")
	for i, k := range knowledge {
		fmt.Printf("Knowledge %d: [%s]\n", i, k.Text)
	}
	fmt.Printf("]\n")
	// fmt.Printf("Refined Question: [%s]\n", realQuestion)
	fmt.Printf("Answer: [")

	prompt := store.Prompt
	if modelProvider.Type != "Dummy" && !isReasonModel(modelProvider.SubType) {
		if modelProvider.Type == "Alibaba Cloud" && webSearchEnabled {
			prompt, err = getPromptWithCarrier(prompt, store.SuggestionCount, chat.NeedTitle)
		} else {
			question, err = getQuestionWithCarriers(question, store.SuggestionCount, chat.NeedTitle)
		}
		if err != nil {
			c.ResponseErrorStream(message, err.Error())
			return
		}
	}

	var modelResult *model.ModelResult
	if hasCallableTools {
		messages := &model.AgentMessages{
			Messages:  []*model.RawMessage{},
			ToolCalls: nil,
		}
		agentInfo := &model.AgentInfo{
			AgentClients:    agentClients,
			AgentMessages:   messages,
			RequireToolCall: model.ShouldRequireToolCall(question),
		}
		fmt.Printf("[ToolDebug] GetMessageAnswer: requireToolCall=%v question=%q\n", agentInfo.RequireToolCall, question)
		modelResult, err = model.QueryTextWithTools(modelProviderObj, question, writer, history, prompt, knowledge, agentInfo, c.GetAcceptLanguage())
	} else {
		if isReasonModel(modelProvider.SubType) {
			modelResult, err = QueryCarrierText(question, writer, history, prompt, knowledge, modelProviderObj, chat.NeedTitle, store.SuggestionCount, c.GetAcceptLanguage())
		} else {
			modelResult, err = modelProviderObj.QueryText(question, writer, history, prompt, knowledge, nil, c.GetAcceptLanguage())
		}
	}
	if err != nil {
		if strings.Contains(err.Error(), "write tcp") {
			c.ResponseError(err.Error())
			return
		}
		c.ResponseErrorStream(message, err.Error())
		return
	}

	if len(vectorScores) > 0 {
		bytes, err := json.Marshal(vectorScores)
		if err == nil {
			_, _ = c.Ctx.ResponseWriter.Write([]byte(fmt.Sprintf("event: vector\ndata: %s\n\n", string(bytes))))
		}
	}

	if writer.writerCleaner.cleaned == false {
		cleanedData := writer.writerCleaner.GetCleanedData()
		writer.buf = append(writer.buf, []byte(cleanedData)...)
		jsonData, err := ConvertMessageDataToJSON(cleanedData)
		if err != nil {
			c.ResponseErrorStream(message, err.Error())
			return
		}

		_, err = writer.ResponseWriter.Write([]byte(fmt.Sprintf("event: message\ndata: %s\n\n", jsonData)))
		if err != nil {
			c.ResponseErrorStream(message, err.Error())
			return
		}

		writer.Flush()
		fmt.Print(cleanedData)
	}

	fmt.Printf("]\n")

	event := fmt.Sprintf("event: end\ndata: %s\n\n", "end")
	_, err = c.Ctx.ResponseWriter.Write([]byte(event))
	if err != nil {
		c.ResponseErrorStream(message, err.Error())
		return
	}

	answer := writer.MessageString()
	message.ReasonText = writer.ReasonString()
	message.ToolCalls = model.GetToolCallsFromWriter(writer.ToolString())
	searchString := writer.SearchString()
	if searchString != "" {
		var searchResults []model.SearchResult
		err := json.Unmarshal([]byte(searchString), &searchResults)
		if err == nil {
			message.SearchResults = searchResults
		}
	}

	message.TokenCount = modelResult.TotalTokenCount
	message.Price = modelResult.TotalPrice
	message.Currency = modelResult.Currency

	textAnswer := answer
	textSuggestions := []object.Suggestion{}
	textTitle := ""
	textAnswer, textSuggestions, textTitle, err = parseAnswerWithCarriers(answer, store.SuggestionCount, chat.NeedTitle)
	if err != nil {
		c.ResponseErrorStream(message, err.Error())
		return
	}

	message.Text = textAnswer
	if message.Text != "" {
		message.ErrorText = ""
		message.IsAlerted = false
	}

	tryStoreRemoteImage(message, c.Ctx.Request.Host, c.GetAcceptLanguage())

	message.Suggestions = textSuggestions

	message.VectorScores = vectorScores

	// Normalize price precision before persisting or creating transactions
	message.Price = model.AddPrices(message.Price, 0)

	// Add transaction for message with price
	if message.Price > 0 && !isCasdoorAvailable() {
		c.ResponseErrorStream(message, c.T("auth:This feature is unavailable in this sign-in mode"))
		return
	}
	err = object.AddTransactionForMessage(message)
	if err != nil {
		c.ResponseErrorStream(message, err.Error())
		return
	}

	_, err = object.UpdateMessage(message.GetId(), message, false)
	if err != nil {
		c.ResponseErrorStream(message, err.Error())
		return
	}

	chat.TokenCount += message.TokenCount
	chat.Price += message.Price
	if chat.Currency == "" {
		chat.Currency = message.Currency
	}

	// Update chat's ModelProvider if not set
	if chat.ModelProvider == "" {
		chat.ModelProvider = modelProvider.Name
	}

	if chat.NeedTitle && textTitle != "" {
		chat.DisplayName = textTitle
		chat.NeedTitle = false
	}

	if questionMessage != nil {
		if chat.Currency == questionMessage.Currency {
			chat.TokenCount += questionMessage.TokenCount
			chat.Price += questionMessage.Price
		}
	}

	_, err = object.UpdateChat(chat.GetId(), chat)
	if err != nil {
		c.ResponseErrorStream(message, err.Error())
		return
	}
}

// GetAnswer
// @Title GetAnswer
// @Tag Message API
// @Description get answer
// @Param provider query string true "The provider"
// @Param question query string true "The question of message"
// @Param framework query string true "The framework"
// @Param video query string true "The video"
// @Success 200 {string} string "answer message"
// @router /get-answer [get]
func (c *ApiController) GetAnswer() {
	userName, ok := c.RequireSignedIn()
	if !ok {
		return
	}

	provider := c.Input().Get("provider")
	question := c.Input().Get("question")
	framework := c.Input().Get("framework")
	video := c.Input().Get("video")
	toolProvider := c.Input().Get("toolProvider")

	if question == "" {
		c.ResponseError(fmt.Sprintf("The question should not be empty"))
		return
	}

	category := "Custom"
	chatName := fmt.Sprintf("chat_%s", util.GetRandomName())
	if framework != "" {
		if video == "" {
			category = "FrameworkTest"
			chatName = framework
		} else {
			category = "FrameworkVideoRun"
			chatName = fmt.Sprintf("%s - %s", video, framework)
		}
	}

	var answer string
	var modelResult *model.ModelResult
	var err error
	if toolProvider != "" {
		answer, modelResult, err = object.GetAnswerWithTool(provider, toolProvider, question, c.GetAcceptLanguage())
	} else {
		answer, modelResult, err = object.GetAnswer(provider, question, c.GetAcceptLanguage())
	}
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	chat, err := object.GetChat(util.GetId("admin", chatName))
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if chat == nil {
		casdoorOrganization := conf.GetConfigString("casdoorOrganization")
		currentTime := util.GetCurrentTime()
		chat = &object.Chat{
			Owner:         "admin",
			Name:          chatName,
			CreatedTime:   currentTime,
			UpdatedTime:   currentTime,
			Organization:  casdoorOrganization,
			DisplayName:   chatName,
			Store:         "",
			ModelProvider: provider,
			Category:      category,
			Type:          "AI",
			User:          userName,
			User1:         "",
			User2:         "",
			Users:         []string{},
			ClientIp:      c.getClientIp(),
			UserAgent:     c.getUserAgent(),
			MessageCount:  0,
			IsHidden:      strings.HasPrefix(chatName, "chat_provider_"),
		}

		chat.ClientIpDesc = util.GetDescFromIP(chat.ClientIp)
		chat.UserAgentDesc = util.GetDescFromUserAgent(chat.UserAgent)

		_, err = object.AddChat(chat)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
	}

	if toolProvider != "" {
		answer, modelResult, err = object.GetAnswerWithTool(provider, toolProvider, question, c.GetAcceptLanguage())
	} else {
		answer, modelResult, err = object.GetAnswer(provider, question, c.GetAcceptLanguage())
	}
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	questionMessage := &object.Message{
		Owner:        "admin",
		Name:         fmt.Sprintf("message_%s", util.GetRandomName()),
		CreatedTime:  util.GetCurrentTimeEx(chat.CreatedTime),
		Organization: chat.Organization,
		Store:        chat.Store,
		User:         userName,
		Chat:         chat.Name,
		ReplyTo:      "",
		Author:       userName,
		Text:         question,
	}

	questionMessage.Currency = modelResult.Currency

	_, err = object.AddMessage(questionMessage)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	answerMessage := &object.Message{
		Owner:         "admin",
		Name:          fmt.Sprintf("message_%s", util.GetRandomName()),
		CreatedTime:   util.GetCurrentTimeEx(chat.CreatedTime),
		Organization:  chat.Organization,
		Store:         chat.Store,
		User:          userName,
		Chat:          chat.Name,
		ReplyTo:       questionMessage.Name,
		Author:        "AI",
		Text:          answer,
		ModelProvider: provider,
	}

	answerMessage.TokenCount = modelResult.TotalTokenCount
	answerMessage.Price = modelResult.TotalPrice
	answerMessage.Currency = modelResult.Currency

	_, err = object.AddMessage(answerMessage)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}

	tryStoreRemoteImage(answerMessage, c.Ctx.Request.Host, c.GetAcceptLanguage())
	answer = answerMessage.Text

	chat.TokenCount += answerMessage.TokenCount
	chat.Price += answerMessage.Price
	if chat.Currency == "" {
		chat.Currency = answerMessage.Currency
	}

	chat.UpdatedTime = util.GetCurrentTime()
	chat.MessageCount += 2

	_, err = object.UpdateChat(chat.GetId(), chat)
	if err != nil {
		c.ResponseOk(err.Error())
		return
	}

	c.ResponseOk(answer)
}

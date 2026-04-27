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
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/the-open-agent/openagent/agent"
	"github.com/the-open-agent/openagent/chat"
	"github.com/the-open-agent/openagent/embedding"
	"github.com/the-open-agent/openagent/model"
	"github.com/the-open-agent/openagent/util"
)

func AnswerWeChatIlinkMessage(provider *Provider, weChatMessage *chat.WeChatIlinkMessage, question string, lang string) (string, error) {
	if provider == nil {
		return "", fmt.Errorf("WeChat iLink provider is nil")
	}
	if weChatMessage == nil {
		return "", fmt.Errorf("WeChat iLink message is nil")
	}
	if strings.TrimSpace(weChatMessage.FromUserId) == "" {
		return "", fmt.Errorf("WeChat iLink from_user_id should not be empty")
	}
	question = strings.TrimSpace(question)
	if question == "" {
		return "", fmt.Errorf("WeChat iLink question should not be empty")
	}

	store, err := resolveWeChatIlinkStore(provider)
	if err != nil {
		return "", err
	}
	if store == nil {
		return "", fmt.Errorf("WeChat iLink store is not found")
	}

	chatObj, err := getOrCreateWeChatIlinkChat(provider, store, weChatMessage.FromUserId)
	if err != nil {
		return "", err
	}

	questionMessage := newWeChatIlinkQuestionMessage(provider, chatObj, store, weChatMessage, question)
	if _, err = AddMessage(questionMessage); err != nil {
		return "", err
	}

	answerMessage := newWeChatIlinkAnswerMessage(provider, chatObj, store, weChatMessage, questionMessage.Name)
	if _, err = AddMessage(answerMessage); err != nil {
		return "", err
	}

	answer, modelResult, vectorScores, embeddingResult, err := answerWithStoreContext(chatObj, store, questionMessage, lang)
	if embeddingResult != nil {
		questionMessage.TokenCount = embeddingResult.TokenCount
		questionMessage.Price = embeddingResult.Price
		questionMessage.Currency = embeddingResult.Currency
		_, _ = UpdateMessage(questionMessage.GetId(), questionMessage, false)
	}
	if err != nil {
		answerMessage.ErrorText = err.Error()
		_, _ = UpdateMessage(answerMessage.GetId(), answerMessage, false)
		return "", err
	}

	answerMessage.Text = answer
	answerMessage.VectorScores = vectorScores
	if modelResult != nil {
		answerMessage.TokenCount = modelResult.TotalTokenCount
		answerMessage.Price = modelResult.TotalPrice
		answerMessage.Currency = modelResult.Currency
	}
	answerMessage.Price = model.AddPrices(answerMessage.Price, 0)
	if err = AddTransactionForMessage(answerMessage); err != nil {
		_, _ = UpdateMessage(answerMessage.GetId(), answerMessage, false)
		return "", err
	}
	if _, err = UpdateMessage(answerMessage.GetId(), answerMessage, false); err != nil {
		return "", err
	}

	chatObj.TokenCount += answerMessage.TokenCount
	chatObj.Price += answerMessage.Price
	if chatObj.Currency == "" {
		chatObj.Currency = answerMessage.Currency
	}
	if questionMessage.Currency != "" && chatObj.Currency == questionMessage.Currency {
		chatObj.TokenCount += questionMessage.TokenCount
		chatObj.Price += questionMessage.Price
	}
	if chatObj.ModelProvider == "" {
		chatObj.ModelProvider = store.ModelProvider
	}
	chatObj.UpdatedTime = util.GetCurrentTime()
	if _, err = UpdateChat(chatObj.GetId(), chatObj); err != nil {
		return "", err
	}

	return answer, nil
}

func newWeChatIlinkQuestionMessage(provider *Provider, chatObj *Chat, store *Store, weChatMessage *chat.WeChatIlinkMessage, question string) *Message {
	return &Message{
		Owner:         chatObj.Owner,
		Name:          fmt.Sprintf("message_%s", util.GetRandomName()),
		CreatedTime:   util.GetCurrentTimeEx(chatObj.CreatedTime),
		Organization:  chatObj.Organization,
		Store:         store.Name,
		User:          provider.Owner,
		Chat:          chatObj.Name,
		ReplyTo:       "",
		Author:        weChatMessage.FromUserId,
		Text:          question,
		ModelProvider: store.ModelProvider,
	}
}

func newWeChatIlinkAnswerMessage(provider *Provider, chatObj *Chat, store *Store, weChatMessage *chat.WeChatIlinkMessage, replyTo string) *Message {
	return &Message{
		Owner:         chatObj.Owner,
		Name:          fmt.Sprintf("message_%s", util.GetRandomName()),
		CreatedTime:   util.GetCurrentTimeEx(chatObj.CreatedTime),
		Organization:  chatObj.Organization,
		Store:         store.Name,
		User:          provider.Owner,
		Chat:          chatObj.Name,
		ReplyTo:       replyTo,
		Author:        "AI",
		ModelProvider: store.ModelProvider,
	}
}

func resolveWeChatIlinkStore(provider *Provider) (*Store, error) {
	stores, err := GetGlobalStores()
	if err != nil {
		return nil, err
	}

	var matchedStore *Store
	for _, store := range stores {
		if store == nil {
			continue
		}
		for _, providerName := range store.ChatProviders {
			if providerName != provider.Name {
				continue
			}
			if matchedStore != nil {
				return nil, fmt.Errorf("WeChat iLink provider: %s is bound to multiple stores", provider.GetId())
			}
			matchedStore = store
			break
		}
	}
	if matchedStore == nil {
		return nil, fmt.Errorf("WeChat iLink provider: %s is not bound to a store", provider.GetId())
	}
	return matchedStore, nil
}

func getOrCreateWeChatIlinkChat(provider *Provider, store *Store, fromUserId string) (*Chat, error) {
	chatName := getWeChatIlinkChatName(provider.Name, fromUserId)
	chatObj, err := getChat(provider.Owner, chatName)
	if err != nil {
		return nil, err
	}
	if chatObj != nil {
		return chatObj, nil
	}

	now := util.GetCurrentTime()
	chatObj = &Chat{
		Owner:         provider.Owner,
		Name:          chatName,
		CreatedTime:   now,
		UpdatedTime:   now,
		Organization:  "",
		DisplayName:   getWeChatIlinkChatDisplayName(fromUserId),
		Store:         store.Name,
		ModelProvider: store.ModelProvider,
		Category:      "WeChat iLink",
		Type:          "AI",
		User:          fromUserId,
		User1:         provider.Name,
		User2:         store.EmbeddingProvider,
		Users:         []string{},
		IsHidden:      false,
	}
	if _, err = AddChat(chatObj); err != nil {
		return nil, err
	}
	return chatObj, nil
}

func getWeChatIlinkChatName(providerName string, fromUserId string) string {
	if len(providerName) > 40 {
		providerName = providerName[:40]
	}
	hash := sha1.Sum([]byte(fromUserId))
	return fmt.Sprintf("chat_wechat_ilink_%s_%s", providerName, hex.EncodeToString(hash[:]))
}

func getWeChatIlinkChatDisplayName(fromUserId string) string {
	userId := strings.TrimSpace(fromUserId)
	if len(userId) > 16 {
		userId = userId[:16]
	}
	return fmt.Sprintf("WeChat iLink - %s", userId)
}

func answerWithStoreContext(chatObj *Chat, store *Store, questionMessage *Message, lang string) (string, *model.ModelResult, []VectorScore, *embedding.EmbeddingResult, error) {
	modelProvider, modelProviderObj, err := GetModelProviderFromContext(store.Owner, store.ModelProvider, lang)
	if err != nil {
		return "", nil, nil, nil, err
	}

	embeddingProvider, embeddingProviderObj, err := GetEmbeddingProviderFromContext(store.Owner, store.EmbeddingProvider, lang)
	if err != nil {
		return "", nil, nil, nil, err
	}

	knowledgeCount := store.KnowledgeCount
	if knowledgeCount <= 0 {
		knowledgeCount = 10
	}
	knowledge, vectorScores, embeddingResult, err := GetNearestKnowledge(store.Name, store.VectorStores, store.SearchProvider, embeddingProvider, embeddingProviderObj, modelProvider, store.Owner, questionMessage.Text, knowledgeCount, lang)
	if err != nil && err.Error() != "no knowledge vectors found" {
		return "", nil, nil, embeddingResult, err
	}
	if embeddingResult == nil {
		embeddingResult = &embedding.EmbeddingResult{}
	}

	history, err := GetRecentRawMessages(chatObj.Name, questionMessage.CreatedTime, store.MemoryLimit)
	if err != nil {
		return "", nil, nil, embeddingResult, err
	}

	prompt := store.Prompt
	if prompt == "" {
		prompt = "You are an expert in your field and you specialize in using your knowledge to answer or solve people's problems."
	}

	agentClients, err := buildWeChatIlinkAgentClients(store, lang)
	if err != nil {
		return "", nil, nil, embeddingResult, err
	}

	var writer MyWriter
	var modelResult *model.ModelResult
	if agentClients != nil {
		agentInfo := &model.AgentInfo{
			AgentClients: agentClients,
			AgentMessages: &model.AgentMessages{
				Messages:  []*model.RawMessage{},
				ToolCalls: nil,
			},
		}
		modelResult, err = model.QueryTextWithTools(modelProviderObj, questionMessage.Text, &writer, history, prompt, knowledge, agentInfo, lang)
	} else {
		modelResult, err = modelProviderObj.QueryText(questionMessage.Text, &writer, history, prompt, knowledge, nil, lang)
	}
	if err != nil {
		return "", nil, nil, embeddingResult, err
	}

	answer := strings.Trim(writer.String(), "\"")
	return answer, modelResult, vectorScores, embeddingResult, nil
}

func buildWeChatIlinkAgentClients(store *Store, lang string) (*agent.AgentClients, error) {
	_, agentProviderObj, err := GetAgentProviderFromContext(store.Owner, store.AgentProvider, lang)
	if err != nil {
		return nil, err
	}

	agentClients, err := GetAgentClients(agentProviderObj)
	if err != nil {
		return nil, err
	}

	agentClients = MergeAgentToolClients(agentClients, store, false, lang)
	if agentClients == nil {
		return nil, nil
	}
	return agentClients, nil
}

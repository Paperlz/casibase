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
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/beego/beego/logs"
	"github.com/the-open-agent/openagent/chat"
	"github.com/the-open-agent/openagent/util"
	"xorm.io/core"
)

const (
	weChatIlinkLoginSessionTtl = 5 * time.Minute
	weChatIlinkTestSessionTtl  = 10 * time.Minute
	weChatIlinkRetryDelay      = 2 * time.Second
	weChatIlinkErrorDelay      = 30 * time.Second
	weChatIlinkDefaultTimeout  = 35_000
)

type WeChatIlinkRuntime struct {
	GetUpdatesBuf        string `json:"get_updates_buf"`
	LongPollingTimeoutMs int    `json:"longpolling_timeout_ms"`
}

type WeChatIlinkLoginStartResult struct {
	SessionKey string `json:"sessionKey"`
	QrcodeUrl  string `json:"qrcodeUrl"`
}

type WeChatIlinkLoginWaitResult struct {
	Connected bool   `json:"connected"`
	Message   string `json:"message"`
}

type WeChatIlinkTestStartResult struct {
	SessionKey string `json:"sessionKey"`
}

type WeChatIlinkTestWaitResult struct {
	HasMessage   bool   `json:"hasMessage"`
	FromUserId   string `json:"fromUserId"`
	Text         string `json:"text"`
	MessageId    int64  `json:"messageId"`
	CreateTimeMs int64  `json:"createTimeMs"`
}

type WeChatIlinkTestReplyRequest struct {
	Text      string `json:"text"`
	MessageId int64  `json:"messageId"`
}

type weChatIlinkLoginSession struct {
	ProviderId     string
	Qrcode         string
	CurrentBaseUrl string
	StartedAt      time.Time
}

type weChatIlinkTestMessage struct {
	FromUserId   string
	ContextToken string
	Text         string
	MessageId    int64
	CreateTimeMs int64
}

type weChatIlinkTestSession struct {
	ProviderId  string
	StartedAt   time.Time
	ExpiresAt   time.Time
	LastMessage *weChatIlinkTestMessage
}

type weChatIlinkPoller struct {
	providerId string
	stopCh     chan struct{}
	doneCh     chan struct{}
	mutex      sync.Mutex
	cancel     context.CancelFunc
}

type WeChatIlinkPollerManager struct {
	mutex   sync.Mutex
	pollers map[string]*weChatIlinkPoller
	lang    string
}

var (
	weChatIlinkLoginMutex    sync.Mutex
	weChatIlinkLoginSessions = map[string]*weChatIlinkLoginSession{}

	weChatIlinkTestMutex    sync.Mutex
	weChatIlinkTestSessions = map[string]*weChatIlinkTestSession{}

	defaultWeChatIlinkPollerManager = &WeChatIlinkPollerManager{
		pollers: map[string]*weChatIlinkPoller{},
		lang:    "en",
	}

	weChatIlinkAnswerFunc = func(provider *Provider, message *chat.WeChatIlinkMessage, question string, lang string) (string, error) {
		return AnswerWeChatIlinkMessage(provider, message, question, lang)
	}

	weChatIlinkSendTextMessageFunc = func(baseUrl string, token string, toUserId string, contextToken string, text string) error {
		client := chat.NewWeChatIlinkClient(baseUrl, token, nil)
		return client.SendTextMessage(toUserId, contextToken, text)
	}
)

func IsWeChatIlinkProvider(provider *Provider) bool {
	return provider != nil &&
		provider.Category == "Chat" &&
		provider.Type == chat.WeChatTypeIlinkBot
}

func InitWeChatIlinkPollers() {
	if err := defaultWeChatIlinkPollerManager.StartActiveProviders(); err != nil {
		logs.Error("InitWeChatIlinkPollers() error: %s", err.Error())
	}
}

func SyncWeChatIlinkProviderById(id string) {
	if err := defaultWeChatIlinkPollerManager.SyncProviderById(id); err != nil {
		logs.Error("SyncWeChatIlinkProviderById(%s) error: %s", id, err.Error())
	}
}

func StopWeChatIlinkProviderById(id string) {
	defaultWeChatIlinkPollerManager.Stop(id)
}

func StartWeChatIlinkLogin(id string) (*WeChatIlinkLoginStartResult, error) {
	provider, err := GetProvider(id)
	if err != nil {
		return nil, err
	}
	if !IsWeChatIlinkProvider(provider) {
		return nil, fmt.Errorf("provider is not a WeChat iLink Bot Chat provider")
	}

	client := chat.NewWeChatIlinkClient(chat.WeChatIlinkDefaultBaseUrl, "", nil)
	qrcode, err := client.StartQRCodeLogin()
	if err != nil {
		return nil, err
	}

	sessionKey := util.GenerateId()
	now := time.Now()
	weChatIlinkLoginMutex.Lock()
	defer weChatIlinkLoginMutex.Unlock()
	cleanupExpiredWeChatIlinkLoginSessionsLocked(now)
	deleteWeChatIlinkLoginSessionsByProviderLocked(id)
	weChatIlinkLoginSessions[sessionKey] = &weChatIlinkLoginSession{
		ProviderId:     id,
		Qrcode:         qrcode.Qrcode,
		CurrentBaseUrl: chat.WeChatIlinkDefaultBaseUrl,
		StartedAt:      now,
	}

	return &WeChatIlinkLoginStartResult{
		SessionKey: sessionKey,
		QrcodeUrl:  qrcode.QrcodeImageContent,
	}, nil
}

func WaitWeChatIlinkLogin(id string, sessionKey string) (*WeChatIlinkLoginWaitResult, error) {
	provider, err := GetProvider(id)
	if err != nil {
		return nil, err
	}
	if !IsWeChatIlinkProvider(provider) {
		return nil, fmt.Errorf("provider is not a WeChat iLink Bot Chat provider")
	}

	session, err := getWeChatIlinkLoginSession(id, sessionKey)
	if err != nil {
		return nil, err
	}

	client := chat.NewWeChatIlinkClient(session.CurrentBaseUrl, "", nil)
	status, err := client.PollQRCodeStatus(session.Qrcode)
	if err != nil {
		return nil, err
	}

	if status.Status == "scaned_but_redirect" {
		if status.RedirectHost != "" {
			setWeChatIlinkLoginSessionBaseUrl(sessionKey, fmt.Sprintf("https://%s", status.RedirectHost))
		}
		return &WeChatIlinkLoginWaitResult{Connected: false, Message: "scaned_but_redirect"}, nil
	}
	if status.Status != "confirmed" {
		return &WeChatIlinkLoginWaitResult{Connected: false, Message: status.Status}, nil
	}
	if status.BotToken == "" || status.IlinkBotId == "" {
		return nil, fmt.Errorf("WeChat iLink login confirmed but token or bot id is missing")
	}

	baseUrl := strings.TrimSpace(status.BaseUrl)
	if baseUrl == "" {
		baseUrl = session.CurrentBaseUrl
	}

	provider.ClientId = status.IlinkBotId
	provider.ClientSecret = status.BotToken
	provider.ProviderUrl = baseUrl
	provider.UserKey = status.IlinkUserId
	provider.ConfigText = ""
	provider.ErrorText = ""

	if _, err = UpdateProvider(id, provider); err != nil {
		return nil, err
	}

	deleteWeChatIlinkLoginSession(sessionKey)
	return &WeChatIlinkLoginWaitResult{
		Connected: true,
		Message:   "connected",
	}, nil
}

func StartWeChatIlinkTest(id string) (*WeChatIlinkTestStartResult, error) {
	provider, err := GetProvider(id)
	if err != nil {
		return nil, err
	}
	if !IsWeChatIlinkProvider(provider) {
		return nil, fmt.Errorf("provider is not a WeChat iLink Bot Chat provider")
	}
	if provider.State != "Active" {
		return nil, fmt.Errorf("WeChat iLink Bot provider should be active before testing")
	}
	if strings.TrimSpace(provider.ClientSecret) == "" || strings.TrimSpace(provider.ProviderUrl) == "" {
		return nil, fmt.Errorf("WeChat iLink Bot is not logged in")
	}

	if !defaultWeChatIlinkPollerManager.IsRunning(id) {
		defaultWeChatIlinkPollerManager.Start(id)
	}

	sessionKey := util.GenerateId()
	now := time.Now()
	weChatIlinkTestMutex.Lock()
	defer weChatIlinkTestMutex.Unlock()
	cleanupExpiredWeChatIlinkTestSessionsLocked(now)
	deleteWeChatIlinkTestSessionsByProviderLocked(id)
	weChatIlinkTestSessions[sessionKey] = &weChatIlinkTestSession{
		ProviderId: id,
		StartedAt:  now,
		ExpiresAt:  now.Add(weChatIlinkTestSessionTtl),
	}

	return &WeChatIlinkTestStartResult{SessionKey: sessionKey}, nil
}

func WaitWeChatIlinkTest(id string, sessionKey string) (*WeChatIlinkTestWaitResult, error) {
	message, err := getWeChatIlinkTestMessage(id, sessionKey)
	if err != nil {
		return nil, err
	}
	if message == nil {
		return &WeChatIlinkTestWaitResult{HasMessage: false}, nil
	}

	return &WeChatIlinkTestWaitResult{
		HasMessage:   true,
		FromUserId:   message.FromUserId,
		Text:         message.Text,
		MessageId:    message.MessageId,
		CreateTimeMs: message.CreateTimeMs,
	}, nil
}

func ReplyWeChatIlinkTest(id string, sessionKey string, text string, messageId int64) (bool, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return false, fmt.Errorf("WeChat iLink test reply text should not be empty")
	}

	message, err := getWeChatIlinkTestReplyMessage(id, sessionKey, messageId)
	if err != nil {
		return false, err
	}

	provider, err := GetProvider(id)
	if err != nil {
		return false, err
	}
	if !IsWeChatIlinkProvider(provider) {
		return false, fmt.Errorf("provider is not a WeChat iLink Bot Chat provider")
	}
	if strings.TrimSpace(provider.ClientSecret) == "" || strings.TrimSpace(provider.ProviderUrl) == "" {
		return false, fmt.Errorf("WeChat iLink Bot is not logged in")
	}

	err = weChatIlinkSendTextMessageFunc(provider.ProviderUrl, provider.ClientSecret, message.FromUserId, message.ContextToken, text)
	if err != nil {
		return false, err
	}

	return true, nil
}

func StopWeChatIlinkTest(id string, sessionKey string) (bool, error) {
	weChatIlinkTestMutex.Lock()
	defer weChatIlinkTestMutex.Unlock()

	session := weChatIlinkTestSessions[sessionKey]
	if session == nil || session.ProviderId != id {
		return false, fmt.Errorf("WeChat iLink test session not found")
	}
	delete(weChatIlinkTestSessions, sessionKey)
	return true, nil
}

func getWeChatIlinkLoginSession(id string, sessionKey string) (*weChatIlinkLoginSession, error) {
	weChatIlinkLoginMutex.Lock()
	defer weChatIlinkLoginMutex.Unlock()

	session := weChatIlinkLoginSessions[sessionKey]
	if session == nil || session.ProviderId != id {
		return nil, fmt.Errorf("WeChat iLink login session not found")
	}
	if time.Since(session.StartedAt) > weChatIlinkLoginSessionTtl {
		delete(weChatIlinkLoginSessions, sessionKey)
		return nil, fmt.Errorf("WeChat iLink login session expired")
	}
	return session, nil
}

func setWeChatIlinkLoginSessionBaseUrl(sessionKey string, baseUrl string) {
	weChatIlinkLoginMutex.Lock()
	defer weChatIlinkLoginMutex.Unlock()

	session := weChatIlinkLoginSessions[sessionKey]
	if session != nil && strings.TrimSpace(baseUrl) != "" {
		session.CurrentBaseUrl = strings.TrimRight(strings.TrimSpace(baseUrl), "/")
	}
}

func deleteWeChatIlinkLoginSession(sessionKey string) {
	weChatIlinkLoginMutex.Lock()
	defer weChatIlinkLoginMutex.Unlock()
	delete(weChatIlinkLoginSessions, sessionKey)
}

func cleanupExpiredWeChatIlinkLoginSessionsLocked(now time.Time) {
	for sessionKey, session := range weChatIlinkLoginSessions {
		if session == nil || now.Sub(session.StartedAt) > weChatIlinkLoginSessionTtl {
			delete(weChatIlinkLoginSessions, sessionKey)
		}
	}
}

func deleteWeChatIlinkLoginSessionsByProviderLocked(providerId string) {
	for sessionKey, session := range weChatIlinkLoginSessions {
		if session != nil && session.ProviderId == providerId {
			delete(weChatIlinkLoginSessions, sessionKey)
		}
	}
}

func getWeChatIlinkTestMessage(id string, sessionKey string) (*weChatIlinkTestMessage, error) {
	weChatIlinkTestMutex.Lock()
	defer weChatIlinkTestMutex.Unlock()

	now := time.Now()
	cleanupExpiredWeChatIlinkTestSessionsLocked(now)
	session := weChatIlinkTestSessions[sessionKey]
	if session == nil || session.ProviderId != id {
		return nil, fmt.Errorf("WeChat iLink test session not found")
	}
	return cloneWeChatIlinkTestMessage(session.LastMessage), nil
}

func getWeChatIlinkTestReplyMessage(id string, sessionKey string, messageId int64) (*weChatIlinkTestMessage, error) {
	if messageId == 0 {
		return nil, fmt.Errorf("WeChat iLink test message id should not be empty")
	}

	weChatIlinkTestMutex.Lock()
	defer weChatIlinkTestMutex.Unlock()

	now := time.Now()
	cleanupExpiredWeChatIlinkTestSessionsLocked(now)
	session := weChatIlinkTestSessions[sessionKey]
	if session == nil || session.ProviderId != id {
		return nil, fmt.Errorf("WeChat iLink test session not found")
	}
	if session.LastMessage == nil {
		return nil, fmt.Errorf("WeChat iLink test has not received a user message")
	}
	if session.LastMessage.MessageId != messageId {
		return nil, fmt.Errorf("WeChat iLink test message has changed, please reply to the latest message")
	}
	return cloneWeChatIlinkTestMessage(session.LastMessage), nil
}

func cloneWeChatIlinkTestMessage(message *weChatIlinkTestMessage) *weChatIlinkTestMessage {
	if message == nil {
		return nil
	}
	return &weChatIlinkTestMessage{
		FromUserId:   message.FromUserId,
		ContextToken: message.ContextToken,
		Text:         message.Text,
		MessageId:    message.MessageId,
		CreateTimeMs: message.CreateTimeMs,
	}
}

func captureWeChatIlinkTestMessage(providerId string, message *chat.WeChatIlinkMessage, text string) bool {
	weChatIlinkTestMutex.Lock()
	defer weChatIlinkTestMutex.Unlock()

	now := time.Now()
	cleanupExpiredWeChatIlinkTestSessionsLocked(now)
	for _, session := range weChatIlinkTestSessions {
		if session != nil && session.ProviderId == providerId {
			session.LastMessage = &weChatIlinkTestMessage{
				FromUserId:   message.FromUserId,
				ContextToken: message.ContextToken,
				Text:         text,
				MessageId:    message.MessageId,
				CreateTimeMs: message.CreateTimeMs,
			}
			return true
		}
	}
	return false
}

func cleanupExpiredWeChatIlinkTestSessionsLocked(now time.Time) {
	for sessionKey, session := range weChatIlinkTestSessions {
		if session == nil || now.After(session.ExpiresAt) {
			delete(weChatIlinkTestSessions, sessionKey)
		}
	}
}

func deleteWeChatIlinkTestSessionsByProvider(providerId string) {
	weChatIlinkTestMutex.Lock()
	defer weChatIlinkTestMutex.Unlock()
	deleteWeChatIlinkTestSessionsByProviderLocked(providerId)
}

func deleteWeChatIlinkTestSessionsByProviderLocked(providerId string) {
	for sessionKey, session := range weChatIlinkTestSessions {
		if session != nil && session.ProviderId == providerId {
			delete(weChatIlinkTestSessions, sessionKey)
		}
	}
}

func (m *WeChatIlinkPollerManager) StartActiveProviders() error {
	providers, err := GetProviders("admin")
	if err != nil {
		return err
	}

	for _, provider := range providers {
		if IsWeChatIlinkProvider(provider) && provider.State == "Active" {
			m.Start(provider.GetId())
		}
	}
	return nil
}

func (m *WeChatIlinkPollerManager) SyncProviderById(id string) error {
	provider, err := GetProvider(id)
	if err != nil {
		return err
	}
	if !IsWeChatIlinkProvider(provider) || provider.State != "Active" {
		m.Stop(id)
		return nil
	}

	m.Start(id)
	return nil
}

func (m *WeChatIlinkPollerManager) Start(id string) {
	m.Stop(id)

	poller := &weChatIlinkPoller{
		providerId: id,
		stopCh:     make(chan struct{}),
		doneCh:     make(chan struct{}),
	}

	m.mutex.Lock()
	m.pollers[id] = poller
	m.mutex.Unlock()

	go poller.run(m.lang)
}

func (m *WeChatIlinkPollerManager) Stop(id string) {
	m.mutex.Lock()
	poller := m.pollers[id]
	if poller != nil {
		delete(m.pollers, id)
		close(poller.stopCh)
		poller.cancelRequest()
	}
	m.mutex.Unlock()

	if poller != nil {
		<-poller.doneCh
	}
	deleteWeChatIlinkTestSessionsByProvider(id)
}

func (m *WeChatIlinkPollerManager) IsRunning(id string) bool {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	return m.pollers[id] != nil
}

func (p *weChatIlinkPoller) run(lang string) {
	defer close(p.doneCh)

	for {
		select {
		case <-p.stopCh:
			return
		default:
		}

		if !p.runOnce(lang) {
			return
		}
	}
}

func (p *weChatIlinkPoller) runOnce(lang string) bool {
	provider, err := GetProvider(p.providerId)
	if err != nil {
		p.sleepOrStop(weChatIlinkErrorDelay)
		return true
	}
	if !IsWeChatIlinkProvider(provider) || provider.State != "Active" {
		return false
	}
	if strings.TrimSpace(provider.ClientSecret) == "" || strings.TrimSpace(provider.ProviderUrl) == "" {
		_ = updateWeChatIlinkProviderRuntime(provider, nil, "WeChat iLink Bot is not logged in")
		p.sleepOrStop(weChatIlinkErrorDelay)
		return true
	}

	runtimeConfig, err := parseWeChatIlinkRuntime(provider.ConfigText)
	if err != nil {
		_ = updateWeChatIlinkProviderRuntime(provider, nil, err.Error())
		p.sleepOrStop(weChatIlinkErrorDelay)
		return true
	}
	timeoutMs := runtimeConfig.LongPollingTimeoutMs
	if timeoutMs <= 0 {
		timeoutMs = weChatIlinkDefaultTimeout
	}

	client := chat.NewWeChatIlinkClient(provider.ProviderUrl, provider.ClientSecret, nil)
	ctx, cancel := context.WithCancel(context.Background())
	p.setCancel(cancel)
	select {
	case <-p.stopCh:
		p.clearCancel()
		cancel()
		return false
	default:
	}
	updates, err := client.GetUpdatesWithContext(ctx, runtimeConfig.GetUpdatesBuf, timeoutMs)
	p.clearCancel()
	cancel()
	if err != nil {
		select {
		case <-p.stopCh:
			return false
		default:
		}
		_ = updateWeChatIlinkProviderRuntime(provider, nil, err.Error())
		p.sleepOrStop(weChatIlinkRetryDelay)
		return true
	}
	if updates.Ret != 0 || updates.ErrCode != 0 {
		_ = updateWeChatIlinkProviderRuntime(provider, nil, fmt.Sprintf("WeChat iLink getupdates error: ret=%d errcode=%d errmsg=%s", updates.Ret, updates.ErrCode, updates.ErrMsg))
		p.sleepOrStop(weChatIlinkErrorDelay)
		return true
	}

	if updates.GetUpdatesBuf != "" {
		runtimeConfig.GetUpdatesBuf = updates.GetUpdatesBuf
	}
	if updates.LongPollingTimeoutMs > 0 {
		runtimeConfig.LongPollingTimeoutMs = updates.LongPollingTimeoutMs
	}
	_ = updateWeChatIlinkProviderRuntime(provider, runtimeConfig, "")

	for _, message := range updates.Messages {
		if err = handleWeChatIlinkMessage(provider, message, lang, client.SendTextMessage); err != nil {
			_ = updateWeChatIlinkProviderRuntime(provider, nil, err.Error())
		}
	}

	return true
}

type weChatIlinkSendTextFunc func(toUserId string, contextToken string, text string) error

func handleWeChatIlinkMessage(provider *Provider, message *chat.WeChatIlinkMessage, lang string, sendText weChatIlinkSendTextFunc) error {
	if !message.IsFinishedUserMessage() {
		return nil
	}

	text, ok := message.Text()
	if !ok {
		return nil
	}
	if captureWeChatIlinkTestMessage(provider.GetId(), message, text) {
		return nil
	}

	answer, err := weChatIlinkAnswerFunc(provider, message, text, lang)
	if err != nil {
		answer = fmt.Sprintf("Error: %v", err)
	}
	return sendText(message.FromUserId, message.ContextToken, answer)
}

func (p *weChatIlinkPoller) sleepOrStop(duration time.Duration) bool {
	select {
	case <-time.After(duration):
		return true
	case <-p.stopCh:
		return false
	}
}

func (p *weChatIlinkPoller) setCancel(cancel context.CancelFunc) {
	p.mutex.Lock()
	defer p.mutex.Unlock()
	p.cancel = cancel
}

func (p *weChatIlinkPoller) clearCancel() {
	p.mutex.Lock()
	defer p.mutex.Unlock()
	p.cancel = nil
}

func (p *weChatIlinkPoller) cancelRequest() {
	p.mutex.Lock()
	cancel := p.cancel
	p.cancel = nil
	p.mutex.Unlock()

	if cancel != nil {
		cancel()
	}
}

func parseWeChatIlinkRuntime(configText string) (*WeChatIlinkRuntime, error) {
	if strings.TrimSpace(configText) == "" {
		return &WeChatIlinkRuntime{}, nil
	}

	var runtimeConfig WeChatIlinkRuntime
	if err := json.Unmarshal([]byte(configText), &runtimeConfig); err != nil {
		return nil, fmt.Errorf("invalid WeChat iLink runtime config: %w", err)
	}
	return &runtimeConfig, nil
}

func updateWeChatIlinkProviderRuntime(provider *Provider, runtimeConfig *WeChatIlinkRuntime, errorText string) error {
	update := &Provider{
		ErrorText: errorText,
	}
	cols := []string{"error_text"}
	if runtimeConfig != nil {
		data, err := json.Marshal(runtimeConfig)
		if err != nil {
			return err
		}
		update.ConfigText = string(data)
		cols = append(cols, "config_text")
	}

	engine := adapter.engine
	if providerAdapter != nil && provider.IsRemote {
		engine = providerAdapter.engine
	}
	_, err := engine.ID(core.PK{provider.Owner, provider.Name}).Cols(cols...).Update(update)
	return err
}

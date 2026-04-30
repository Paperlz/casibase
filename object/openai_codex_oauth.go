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
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/the-open-agent/openagent/proxy"
	"github.com/the-open-agent/openagent/util"
	"xorm.io/core"
)

const (
	OpenAICodexOAuthClientID    = "app_EMoamEEZ73f0CkXaXp7hrann"
	OpenAICodexAuthorizeURL     = "https://auth.openai.com/oauth/authorize"
	OpenAICodexTokenURL         = "https://auth.openai.com/oauth/token"
	OpenAICodexRedirectURI      = "http://localhost:1455/auth/callback"
	OpenAICodexScope            = "openid profile email offline_access"
	OpenAICodexOAuthOriginator  = "pi"
	openAICodexOAuthPending     = "pending"
	openAICodexOAuthSuccess     = "success"
	openAICodexOAuthError       = "error"
	openAICodexOAuthExpired     = "expired"
	openAICodexRefreshSkewSecs  = int64(300)
	openAICodexOAuthStateMaxAge = int64(15 * 60)
)

var (
	openAICodexCallbackMutex   sync.Mutex
	openAICodexCallbackStarted bool
	openAICodexRefreshMutex    sync.Mutex
	openAICodexTokenURL        = OpenAICodexTokenURL
	openAICodexHTTPClient      = func() *http.Client {
		if proxy.ProxyHttpClient != nil {
			return proxy.ProxyHttpClient
		}
		return http.DefaultClient
	}
)

type OpenAICodexCredential struct {
	UserId       string `xorm:"varchar(200) notnull pk" json:"userId"`
	ProviderName string `xorm:"varchar(100) notnull pk" json:"providerName"`
	AccessToken  string `xorm:"mediumtext" json:"-"`
	RefreshToken string `xorm:"mediumtext" json:"-"`
	ExpiresAt    int64  `xorm:"bigint" json:"expiresAt"`
	AccountId    string `xorm:"varchar(200)" json:"accountId"`
	CreatedTime  string `xorm:"varchar(100)" json:"createdTime"`
	UpdatedTime  string `xorm:"varchar(100)" json:"updatedTime"`
}

type OpenAICodexOAuthState struct {
	State        string `xorm:"varchar(100) notnull pk" json:"state"`
	UserId       string `xorm:"varchar(200) index" json:"userId"`
	ProviderName string `xorm:"varchar(100) index" json:"providerName"`
	CodeVerifier string `xorm:"varchar(200)" json:"-"`
	Status       string `xorm:"varchar(100)" json:"status"`
	ErrorText    string `xorm:"mediumtext" json:"errorText"`
	ExpiresAt    int64  `xorm:"bigint" json:"expiresAt"`
	CreatedTime  string `xorm:"varchar(100)" json:"createdTime"`
	UpdatedTime  string `xorm:"varchar(100)" json:"updatedTime"`
}

type OpenAICodexAuthStart struct {
	AuthUrl               string `json:"authUrl"`
	State                 string `json:"state"`
	CallbackServerStarted bool   `json:"callbackServerStarted"`
	CallbackServerError   string `json:"callbackServerError"`
}

type OpenAICodexAuthStatus struct {
	Connected    bool   `json:"connected"`
	Status       string `json:"status"`
	ErrorText    string `json:"errorText"`
	ProviderName string `json:"providerName"`
	AccountId    string `json:"accountId"`
	ExpiresAt    int64  `json:"expiresAt"`
	UpdatedTime  string `json:"updatedTime"`
}

type openAICodexTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
	Error        any    `json:"error"`
	ErrorDesc    string `json:"error_description"`
}

func IsOpenAICodexProviderType(providerType string) bool {
	return providerType == "OpenAI Codex"
}

func StartOpenAICodexAuth(userId string, providerName string) (*OpenAICodexAuthStart, error) {
	userId = strings.TrimSpace(userId)
	providerName = strings.TrimSpace(providerName)
	if userId == "" {
		return nil, fmt.Errorf("please sign in before connecting ChatGPT")
	}
	if err := ensureOpenAICodexProvider(providerName); err != nil {
		return nil, err
	}

	codeVerifier, codeChallenge, err := generateOpenAICodexPKCE()
	if err != nil {
		return nil, err
	}
	stateValue, err := randomOpenAICodexHex(16)
	if err != nil {
		return nil, err
	}

	now := util.GetCurrentTime()
	state := &OpenAICodexOAuthState{
		State:        stateValue,
		UserId:       userId,
		ProviderName: providerName,
		CodeVerifier: codeVerifier,
		Status:       openAICodexOAuthPending,
		ExpiresAt:    time.Now().Unix() + openAICodexOAuthStateMaxAge,
		CreatedTime:  now,
		UpdatedTime:  now,
	}

	_, err = adapter.engine.Insert(state)
	if err != nil {
		return nil, err
	}

	callbackStarted, callbackErr := startOpenAICodexCallbackServer()
	res := &OpenAICodexAuthStart{
		AuthUrl:               buildOpenAICodexAuthorizeURL(stateValue, codeChallenge),
		State:                 stateValue,
		CallbackServerStarted: callbackStarted,
	}
	if callbackErr != nil {
		res.CallbackServerError = callbackErr.Error()
	}
	return res, nil
}

func GetOpenAICodexAuth(userId string, providerName string) (*OpenAICodexAuthStatus, error) {
	userId = strings.TrimSpace(userId)
	providerName = strings.TrimSpace(providerName)
	if userId == "" {
		return nil, fmt.Errorf("please sign in first")
	}
	if providerName == "" {
		return nil, fmt.Errorf("provider is required")
	}

	credential, err := getOpenAICodexCredential(userId, providerName)
	if err != nil {
		return nil, err
	}
	if credential == nil {
		return &OpenAICodexAuthStatus{Connected: false, Status: "disconnected", ProviderName: providerName}, nil
	}
	return &OpenAICodexAuthStatus{
		Connected:    true,
		Status:       "connected",
		ProviderName: providerName,
		AccountId:    credential.AccountId,
		ExpiresAt:    credential.ExpiresAt,
		UpdatedTime:  credential.UpdatedTime,
	}, nil
}

func GetOpenAICodexAuthStatus(userId string, stateValue string) (*OpenAICodexAuthStatus, error) {
	state, err := getOpenAICodexOAuthState(stateValue)
	if err != nil {
		return nil, err
	}
	if state == nil {
		return nil, fmt.Errorf("OpenAI Codex OAuth state not found")
	}
	if strings.TrimSpace(userId) != "" && state.UserId != userId {
		return nil, fmt.Errorf("OpenAI Codex OAuth state belongs to another user")
	}
	if state.Status == openAICodexOAuthPending && state.ExpiresAt <= time.Now().Unix() {
		state.Status = openAICodexOAuthExpired
		state.ErrorText = "OpenAI Codex OAuth state expired"
		state.UpdatedTime = util.GetCurrentTime()
		_, _ = adapter.engine.ID(state.State).Cols("status", "error_text", "updated_time").Update(state)
	}

	status := &OpenAICodexAuthStatus{
		Connected:    state.Status == openAICodexOAuthSuccess,
		Status:       state.Status,
		ErrorText:    state.ErrorText,
		ProviderName: state.ProviderName,
	}
	if status.Connected {
		credential, err := getOpenAICodexCredential(state.UserId, state.ProviderName)
		if err != nil {
			return nil, err
		}
		if credential != nil {
			status.AccountId = credential.AccountId
			status.ExpiresAt = credential.ExpiresAt
			status.UpdatedTime = credential.UpdatedTime
		}
	}
	return status, nil
}

func CompleteOpenAICodexAuth(userId string, stateValue string, input string) (*OpenAICodexCredential, error) {
	code, inputState, err := ParseOpenAICodexAuthorizationInput(input)
	if err != nil {
		return nil, err
	}
	if stateValue == "" {
		stateValue = inputState
	}
	if inputState != "" && stateValue != inputState {
		return nil, fmt.Errorf("OpenAI Codex OAuth state mismatch")
	}
	if code == "" {
		return nil, fmt.Errorf("OpenAI Codex OAuth authorization code is required")
	}
	return completeOpenAICodexAuthCode(userId, stateValue, code)
}

func DeleteOpenAICodexAuth(userId string, providerName string) (bool, error) {
	userId = strings.TrimSpace(userId)
	providerName = strings.TrimSpace(providerName)
	if userId == "" {
		return false, fmt.Errorf("please sign in first")
	}
	if providerName == "" {
		return false, fmt.Errorf("provider is required")
	}

	affected, err := adapter.engine.ID(core.PK{userId, providerName}).Delete(&OpenAICodexCredential{})
	if err != nil {
		return false, err
	}
	return affected != 0, nil
}

func ResolveOpenAICodexCredential(userId string, providerName string) (*OpenAICodexCredential, error) {
	userId = strings.TrimSpace(userId)
	providerName = strings.TrimSpace(providerName)
	if userId == "" {
		return nil, fmt.Errorf("OpenAI Codex requires a signed-in Casibase user")
	}
	if providerName == "" {
		return nil, fmt.Errorf("provider is required")
	}

	credential, err := getOpenAICodexCredential(userId, providerName)
	if err != nil {
		return nil, err
	}
	if credential == nil || credential.AccessToken == "" || credential.RefreshToken == "" {
		return nil, fmt.Errorf("please connect ChatGPT for provider: %s", providerName)
	}
	if credential.ExpiresAt > time.Now().Unix()+openAICodexRefreshSkewSecs {
		return credential, nil
	}

	openAICodexRefreshMutex.Lock()
	defer openAICodexRefreshMutex.Unlock()

	credential, err = getOpenAICodexCredential(userId, providerName)
	if err != nil {
		return nil, err
	}
	if credential == nil || credential.AccessToken == "" || credential.RefreshToken == "" {
		return nil, fmt.Errorf("please connect ChatGPT for provider: %s", providerName)
	}
	if credential.ExpiresAt > time.Now().Unix()+openAICodexRefreshSkewSecs {
		return credential, nil
	}

	refreshed, err := refreshOpenAICodexToken(credential.RefreshToken)
	if err != nil {
		return nil, fmt.Errorf("failed to refresh ChatGPT OAuth token, please reconnect ChatGPT: %s", err.Error())
	}
	credential.AccessToken = refreshed.AccessToken
	credential.RefreshToken = refreshed.RefreshToken
	credential.ExpiresAt = refreshed.ExpiresAt
	credential.AccountId = refreshed.AccountId
	credential.UpdatedTime = util.GetCurrentTime()

	_, err = adapter.engine.ID(core.PK{credential.UserId, credential.ProviderName}).Cols("access_token", "refresh_token", "expires_at", "account_id", "updated_time").Update(credential)
	if err != nil {
		return nil, err
	}
	return credential, nil
}

func ParseOpenAICodexAuthorizationInput(input string) (string, string, error) {
	value := strings.TrimSpace(input)
	if value == "" {
		return "", "", fmt.Errorf("authorization code or redirect URL is required")
	}

	if parsed, err := url.Parse(value); err == nil && parsed.Scheme != "" {
		query := parsed.Query()
		code := query.Get("code")
		state := query.Get("state")
		if code == "" && parsed.Fragment != "" {
			fragmentQuery, err := url.ParseQuery(parsed.Fragment)
			if err != nil {
				return "", "", err
			}
			code = fragmentQuery.Get("code")
			state = fragmentQuery.Get("state")
		}
		return code, state, nil
	}
	if strings.Contains(value, "#") {
		parts := strings.SplitN(value, "#", 2)
		return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]), nil
	}
	if strings.Contains(value, "code=") || strings.Contains(value, "state=") {
		params, err := url.ParseQuery(value)
		if err != nil {
			return "", "", err
		}
		return params.Get("code"), params.Get("state"), nil
	}
	return value, "", nil
}

func buildOpenAICodexAuthorizeURL(stateValue string, codeChallenge string) string {
	authURL, _ := url.Parse(OpenAICodexAuthorizeURL)
	query := authURL.Query()
	query.Set("response_type", "code")
	query.Set("client_id", OpenAICodexOAuthClientID)
	query.Set("redirect_uri", OpenAICodexRedirectURI)
	query.Set("scope", OpenAICodexScope)
	query.Set("code_challenge", codeChallenge)
	query.Set("code_challenge_method", "S256")
	query.Set("state", stateValue)
	query.Set("id_token_add_organizations", "true")
	query.Set("codex_cli_simplified_flow", "true")
	query.Set("originator", OpenAICodexOAuthOriginator)
	authURL.RawQuery = query.Encode()
	return authURL.String()
}

func completeOpenAICodexAuthCode(userId string, stateValue string, code string) (*OpenAICodexCredential, error) {
	state, err := getOpenAICodexOAuthState(stateValue)
	if err != nil {
		return nil, err
	}
	if state == nil {
		return nil, fmt.Errorf("OpenAI Codex OAuth state not found")
	}
	if strings.TrimSpace(userId) != "" && state.UserId != userId {
		return nil, fmt.Errorf("OpenAI Codex OAuth state belongs to another user")
	}
	if state.Status == openAICodexOAuthSuccess {
		return getOpenAICodexCredential(state.UserId, state.ProviderName)
	}
	if state.ExpiresAt <= time.Now().Unix() {
		err = markOpenAICodexOAuthStateError(state, openAICodexOAuthExpired, "OpenAI Codex OAuth state expired")
		if err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("OpenAI Codex OAuth state expired")
	}

	token, err := exchangeOpenAICodexCode(code, state.CodeVerifier)
	if err != nil {
		_ = markOpenAICodexOAuthStateError(state, openAICodexOAuthError, err.Error())
		return nil, err
	}

	now := util.GetCurrentTime()
	credential := &OpenAICodexCredential{
		UserId:       state.UserId,
		ProviderName: state.ProviderName,
		AccessToken:  token.AccessToken,
		RefreshToken: token.RefreshToken,
		ExpiresAt:    token.ExpiresAt,
		AccountId:    token.AccountId,
		CreatedTime:  now,
		UpdatedTime:  now,
	}
	existing, err := getOpenAICodexCredential(state.UserId, state.ProviderName)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		_, err = adapter.engine.Insert(credential)
	} else {
		credential.CreatedTime = existing.CreatedTime
		_, err = adapter.engine.ID(core.PK{state.UserId, state.ProviderName}).AllCols().Update(credential)
	}
	if err != nil {
		_ = markOpenAICodexOAuthStateError(state, openAICodexOAuthError, err.Error())
		return nil, err
	}

	state.Status = openAICodexOAuthSuccess
	state.ErrorText = ""
	state.UpdatedTime = util.GetCurrentTime()
	_, err = adapter.engine.ID(state.State).Cols("status", "error_text", "updated_time").Update(state)
	if err != nil {
		return nil, err
	}
	return credential, nil
}

func ensureOpenAICodexProvider(providerName string) error {
	if providerName == "" {
		return fmt.Errorf("provider is required")
	}
	provider, err := GetProviderByOwnerAndName("admin", providerName)
	if err != nil {
		return err
	}
	if provider == nil {
		return fmt.Errorf("provider not found: %s", providerName)
	}
	if provider.Category != "Model" || !IsOpenAICodexProviderType(provider.Type) {
		return fmt.Errorf("provider must be a Model / OpenAI Codex provider")
	}
	return nil
}

func getOpenAICodexCredential(userId string, providerName string) (*OpenAICodexCredential, error) {
	credential := OpenAICodexCredential{UserId: userId, ProviderName: providerName}
	existed, err := adapter.engine.Get(&credential)
	if err != nil {
		return nil, err
	}
	if !existed {
		return nil, nil
	}
	return &credential, nil
}

func getOpenAICodexOAuthState(stateValue string) (*OpenAICodexOAuthState, error) {
	if strings.TrimSpace(stateValue) == "" {
		return nil, fmt.Errorf("OpenAI Codex OAuth state is required")
	}
	state := OpenAICodexOAuthState{State: stateValue}
	existed, err := adapter.engine.Get(&state)
	if err != nil {
		return nil, err
	}
	if !existed {
		return nil, nil
	}
	return &state, nil
}

func markOpenAICodexOAuthStateError(state *OpenAICodexOAuthState, status string, errorText string) error {
	state.Status = status
	state.ErrorText = errorText
	state.UpdatedTime = util.GetCurrentTime()
	_, err := adapter.engine.ID(state.State).Cols("status", "error_text", "updated_time").Update(state)
	return err
}

func generateOpenAICodexPKCE() (string, string, error) {
	verifierBytes := make([]byte, 32)
	if _, err := rand.Read(verifierBytes); err != nil {
		return "", "", err
	}
	verifier := base64.RawURLEncoding.EncodeToString(verifierBytes)
	hash := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(hash[:])
	return verifier, challenge, nil
}

func randomOpenAICodexHex(size int) (string, error) {
	bytes := make([]byte, size)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

type openAICodexToken struct {
	AccessToken  string
	RefreshToken string
	ExpiresAt    int64
	AccountId    string
}

func exchangeOpenAICodexCode(code string, codeVerifier string) (*openAICodexToken, error) {
	return requestOpenAICodexToken(url.Values{
		"grant_type":    {"authorization_code"},
		"client_id":     {OpenAICodexOAuthClientID},
		"code":          {code},
		"code_verifier": {codeVerifier},
		"redirect_uri":  {OpenAICodexRedirectURI},
	}, true)
}

func refreshOpenAICodexToken(refreshToken string) (*openAICodexToken, error) {
	return requestOpenAICodexToken(url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
		"client_id":     {OpenAICodexOAuthClientID},
	}, false)
}

func requestOpenAICodexToken(values url.Values, requireRefreshToken bool) (*openAICodexToken, error) {
	req, err := http.NewRequest(http.MethodPost, openAICodexTokenURL, strings.NewReader(values.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	client := openAICodexHTTPClient()
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OpenAI Codex token endpoint returned status %d: %s", resp.StatusCode, parseOpenAICodexTokenError(body))
	}

	payload := openAICodexTokenResponse{}
	if err = json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("OpenAI Codex token endpoint returned invalid JSON: %s", err.Error())
	}
	payload.AccessToken = strings.TrimSpace(payload.AccessToken)
	payload.RefreshToken = strings.TrimSpace(payload.RefreshToken)
	if payload.AccessToken == "" {
		return nil, fmt.Errorf("OpenAI Codex token response missing access_token")
	}
	if requireRefreshToken && payload.RefreshToken == "" {
		return nil, fmt.Errorf("OpenAI Codex token response missing refresh_token")
	}
	if payload.RefreshToken == "" {
		payload.RefreshToken = values.Get("refresh_token")
	}
	if payload.ExpiresIn <= 0 {
		payload.ExpiresIn = 3600
	}

	return &openAICodexToken{
		AccessToken:  payload.AccessToken,
		RefreshToken: payload.RefreshToken,
		ExpiresAt:    time.Now().Unix() + payload.ExpiresIn,
		AccountId:    extractOpenAICodexAccountID(payload.AccessToken),
	}, nil
}

func parseOpenAICodexTokenError(body []byte) string {
	payload := map[string]interface{}{}
	if err := json.Unmarshal(body, &payload); err != nil {
		return strings.TrimSpace(string(body))
	}
	if errObj, ok := payload["error"].(map[string]interface{}); ok {
		if msg, ok := errObj["message"].(string); ok && msg != "" {
			return msg
		}
		if code, ok := errObj["code"].(string); ok && code != "" {
			return code
		}
	}
	if errStr, ok := payload["error"].(string); ok && errStr != "" {
		if desc, ok := payload["error_description"].(string); ok && desc != "" {
			return fmt.Sprintf("%s: %s", errStr, desc)
		}
		return errStr
	}
	if msg, ok := payload["message"].(string); ok && msg != "" {
		return msg
	}
	return strings.TrimSpace(string(body))
}

func extractOpenAICodexAccountID(accessToken string) string {
	parts := strings.Split(accessToken, ".")
	if len(parts) < 2 {
		return ""
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		payloadBytes, err = base64.URLEncoding.DecodeString(parts[1])
		if err != nil {
			return ""
		}
	}
	claims := map[string]interface{}{}
	if err = json.Unmarshal(payloadBytes, &claims); err != nil {
		return ""
	}
	authClaims, ok := claims["https://api.openai.com/auth"].(map[string]interface{})
	if !ok {
		return ""
	}
	accountId, _ := authClaims["chatgpt_account_id"].(string)
	return accountId
}

func startOpenAICodexCallbackServer() (bool, error) {
	openAICodexCallbackMutex.Lock()
	defer openAICodexCallbackMutex.Unlock()
	if openAICodexCallbackStarted {
		return true, nil
	}

	listener, err := net.Listen("tcp", "127.0.0.1:1455")
	if err != nil {
		return false, err
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/auth/callback", handleOpenAICodexCallback)
	server := &http.Server{Handler: mux}
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			openAICodexCallbackMutex.Lock()
			openAICodexCallbackStarted = false
			openAICodexCallbackMutex.Unlock()
		}
	}()
	openAICodexCallbackStarted = true
	return true, nil
}

func handleOpenAICodexCallback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	if state == "" || code == "" {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, openAICodexCallbackHTML("OpenAI authentication failed", "Missing state or code."))
		return
	}

	_, err := completeOpenAICodexAuthCode("", state, code)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, openAICodexCallbackHTML("OpenAI authentication failed", err.Error()))
		return
	}

	_, _ = io.WriteString(w, openAICodexCallbackHTML("OpenAI authentication completed", "You can close this window and return to Casibase."))
}

func openAICodexCallbackHTML(title string, message string) string {
	return fmt.Sprintf(`<!doctype html><html><head><meta charset="utf-8"><title>%s</title></head><body><h2>%s</h2><p>%s</p></body></html>`, html.EscapeString(title), html.EscapeString(title), html.EscapeString(message))
}

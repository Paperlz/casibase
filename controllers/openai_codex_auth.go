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

package controllers

import (
	"encoding/json"

	"github.com/the-open-agent/openagent/object"
)

type openAICodexAuthForm struct {
	Provider string `json:"provider"`
	State    string `json:"state"`
	Code     string `json:"code"`
}

// StartOpenAICodexAuth
// @Title StartOpenAICodexAuth
// @Tag Provider API
// @Description start OpenAI Codex ChatGPT OAuth login
// @Param body body openAICodexAuthForm true "Provider name"
// @Success 200 {object} controllers.Response The Response object
// @router /start-openai-codex-auth [post]
func (c *ApiController) StartOpenAICodexAuth() {
	userId, ok := c.RequireSignedIn()
	if !ok {
		return
	}

	form := openAICodexAuthForm{}
	if len(c.Ctx.Input.RequestBody) > 0 {
		if err := json.Unmarshal(c.Ctx.Input.RequestBody, &form); err != nil {
			c.ResponseError(err.Error())
			return
		}
	}
	if form.Provider == "" {
		form.Provider = c.Input().Get("provider")
	}

	res, err := object.StartOpenAICodexAuth(userId, form.Provider)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(res)
}

// GetOpenAICodexAuthStatus
// @Title GetOpenAICodexAuthStatus
// @Tag Provider API
// @Description get OpenAI Codex OAuth state status
// @Param state query string true "OAuth state"
// @Success 200 {object} controllers.Response The Response object
// @router /get-openai-codex-auth-status [get]
func (c *ApiController) GetOpenAICodexAuthStatus() {
	userId, ok := c.RequireSignedIn()
	if !ok {
		return
	}

	status, err := object.GetOpenAICodexAuthStatus(userId, c.Input().Get("state"))
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(status)
}

// CompleteOpenAICodexAuth
// @Title CompleteOpenAICodexAuth
// @Tag Provider API
// @Description complete OpenAI Codex OAuth login with pasted redirect URL or code
// @Param body body openAICodexAuthForm true "State and code"
// @Success 200 {object} controllers.Response The Response object
// @router /complete-openai-codex-auth [post]
func (c *ApiController) CompleteOpenAICodexAuth() {
	userId, ok := c.RequireSignedIn()
	if !ok {
		return
	}

	form := openAICodexAuthForm{}
	body := c.Ctx.Input.RequestBody
	if len(body) > 0 {
		c.Ctx.Input.RequestBody = []byte(`{"code":"***"}`)
		if err := json.Unmarshal(body, &form); err != nil {
			c.ResponseError(err.Error())
			return
		}
	}
	// Prevent the pasted authorization code or redirect URL from being recorded by
	// the request recorder after the handler returns.
	if sanitizedBody, err := json.Marshal(openAICodexAuthForm{Provider: form.Provider, State: form.State, Code: "***"}); err == nil {
		c.Ctx.Input.RequestBody = sanitizedBody
	}
	if form.State == "" {
		form.State = c.Input().Get("state")
	}

	_, err := object.CompleteOpenAICodexAuth(userId, form.State, form.Code)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	status, err := object.GetOpenAICodexAuthStatus(userId, form.State)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(status)
}

// GetOpenAICodexAuth
// @Title GetOpenAICodexAuth
// @Tag Provider API
// @Description get current user's OpenAI Codex auth status for provider
// @Param provider query string true "Provider name"
// @Success 200 {object} controllers.Response The Response object
// @router /get-openai-codex-auth [get]
func (c *ApiController) GetOpenAICodexAuth() {
	userId, ok := c.RequireSignedIn()
	if !ok {
		return
	}

	status, err := object.GetOpenAICodexAuth(userId, c.Input().Get("provider"))
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(status)
}

// DeleteOpenAICodexAuth
// @Title DeleteOpenAICodexAuth
// @Tag Provider API
// @Description disconnect current user's OpenAI Codex auth for provider
// @Param body body openAICodexAuthForm true "Provider name"
// @Success 200 {object} controllers.Response The Response object
// @router /delete-openai-codex-auth [post]
func (c *ApiController) DeleteOpenAICodexAuth() {
	userId, ok := c.RequireSignedIn()
	if !ok {
		return
	}

	form := openAICodexAuthForm{}
	if len(c.Ctx.Input.RequestBody) > 0 {
		if err := json.Unmarshal(c.Ctx.Input.RequestBody, &form); err != nil {
			c.ResponseError(err.Error())
			return
		}
	}
	if form.Provider == "" {
		form.Provider = c.Input().Get("provider")
	}

	success, err := object.DeleteOpenAICodexAuth(userId, form.Provider)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	c.ResponseOk(success)
}

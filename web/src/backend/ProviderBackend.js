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

import * as Setting from "../Setting";

export function getGlobalProviders() {
  return fetch(`${Setting.ServerUrl}/api/get-global-providers`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Accept-Language": Setting.getAcceptLanguage(),
    },
  }).then(res => Setting.handleFetchResponse(res));
}

export function getProviders(owner, storeName = "", page = "", pageSize = "", field = "", value = "", sortField = "", sortOrder = "") {
  return fetch(`${Setting.ServerUrl}/api/get-providers?owner=${owner}&store=${storeName}&p=${page}&pageSize=${pageSize}&field=${field}&value=${value}&sortField=${sortField}&sortOrder=${sortOrder}`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Accept-Language": Setting.getAcceptLanguage(),
    },
  }).then(res => Setting.handleFetchResponse(res));
}

export function getProvider(owner, name) {
  return fetch(`${Setting.ServerUrl}/api/get-provider?id=${owner}/${encodeURIComponent(name)}`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Accept-Language": Setting.getAcceptLanguage(),
    },
  }).then(res => Setting.handleFetchResponse(res));
}

export function updateProvider(owner, name, provider) {
  const newProvider = Setting.deepCopy(provider);
  return fetch(`${Setting.ServerUrl}/api/update-provider?id=${owner}/${encodeURIComponent(name)}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept-Language": Setting.getAcceptLanguage(),
    },
    body: JSON.stringify(newProvider),
  }).then(res => Setting.handleFetchResponse(res));
}

export function addProvider(provider) {
  const newProvider = Setting.deepCopy(provider);
  return fetch(`${Setting.ServerUrl}/api/add-provider`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept-Language": Setting.getAcceptLanguage(),
    },
    body: JSON.stringify(newProvider),
  }).then(res => Setting.handleFetchResponse(res));
}

export function deleteProvider(provider) {
  const newProvider = Setting.deepCopy(provider);
  return fetch(`${Setting.ServerUrl}/api/delete-provider`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept-Language": Setting.getAcceptLanguage(),
    },
    body: JSON.stringify(newProvider),
  }).then(res => Setting.handleFetchResponse(res));
}

export function refreshMcpTools(provider) {
  const newProvider = Setting.deepCopy(provider);
  return fetch(`${Setting.ServerUrl}/api/refresh-mcp-tools`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept-Language": Setting.getAcceptLanguage(),
    },
    body: JSON.stringify(newProvider),
  }).then(res => Setting.handleFetchResponse(res));
}

export function testToolProvider(provider) {
  const newProvider = Setting.deepCopy(provider);
  return fetch(`${Setting.ServerUrl}/api/test-tool-provider`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept-Language": Setting.getAcceptLanguage(),
    },
    body: JSON.stringify(newProvider),
  }).then(res => Setting.handleFetchResponse(res));
}

export function testMcpProvider(provider) {
  const newProvider = Setting.deepCopy(provider);
  return fetch(`${Setting.ServerUrl}/api/test-mcp-provider`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept-Language": Setting.getAcceptLanguage(),
    },
    body: JSON.stringify(newProvider),
  }).then(res => Setting.handleFetchResponse(res));
}

export function startOpenAICodexAuth(provider) {
  return fetch(`${Setting.ServerUrl}/api/start-openai-codex-auth`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept-Language": Setting.getAcceptLanguage(),
    },
    body: JSON.stringify({provider}),
  }).then(res => Setting.handleFetchResponse(res));
}

export function getOpenAICodexAuthStatus(state) {
  return fetch(`${Setting.ServerUrl}/api/get-openai-codex-auth-status?state=${encodeURIComponent(state)}`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Accept-Language": Setting.getAcceptLanguage(),
    },
  }).then(res => Setting.handleFetchResponse(res));
}

export function completeOpenAICodexAuth(state, code) {
  return fetch(`${Setting.ServerUrl}/api/complete-openai-codex-auth`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept-Language": Setting.getAcceptLanguage(),
    },
    body: JSON.stringify({state, code}),
  }).then(res => Setting.handleFetchResponse(res));
}

export function getOpenAICodexAuth(provider) {
  return fetch(`${Setting.ServerUrl}/api/get-openai-codex-auth?provider=${encodeURIComponent(provider)}`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Accept-Language": Setting.getAcceptLanguage(),
    },
  }).then(res => Setting.handleFetchResponse(res));
}

export function deleteOpenAICodexAuth(provider) {
  return fetch(`${Setting.ServerUrl}/api/delete-openai-codex-auth`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept-Language": Setting.getAcceptLanguage(),
    },
    body: JSON.stringify({provider}),
  }).then(res => Setting.handleFetchResponse(res));
}

export function setTelegramWebhook(id) {
  return fetch(`${Setting.ServerUrl}/api/set-telegram-webhook?id=${encodeURIComponent(id)}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept-Language": Setting.getAcceptLanguage(),
    },
  }).then(res => Setting.handleFetchResponse(res));
}

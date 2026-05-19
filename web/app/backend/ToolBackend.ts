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

import { apiFetch, apiPost } from "~/lib/api"

export type Tool = {
  owner: string
  name: string
  createdTime: string
  displayName?: string
  displayName2?: string
  type: string
  subType: string
  clientId?: string
  clientSecret?: string
  providerUrl?: string
  enableProxy?: boolean
  testContent?: string
  modelProvider?: string
  resultSummary?: string
  mode?: string
  promptExamples?: string[]
  state: string
}

export function getGlobalTools(): Promise<any> {
  return apiFetch("/api/get-global-tools")
}

export function getTools(
  owner: string,
  page = "",
  pageSize = "",
  field = "",
  value = "",
  sortField = "",
  sortOrder = ""
): Promise<any> {
  return apiFetch(
    `/api/get-tools?owner=${encodeURIComponent(owner)}&p=${page}&pageSize=${pageSize}&field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}&sortField=${sortField}&sortOrder=${sortOrder}`
  )
}

export function getTool(owner: string, name: string): Promise<any> {
  return apiFetch(`/api/get-tool?id=${encodeURIComponent(owner)}/${encodeURIComponent(name)}`)
}

export function updateTool(owner: string, name: string, tool: Tool): Promise<any> {
  return apiPost(`/api/update-tool?id=${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, tool)
}

export function addTool(tool: Tool): Promise<any> {
  return apiPost("/api/add-tool", tool)
}

export function deleteTool(tool: Tool): Promise<any> {
  return apiPost("/api/delete-tool", tool)
}

export function testTool(tool: Tool): Promise<any> {
  return apiPost("/api/test-tool", tool)
}

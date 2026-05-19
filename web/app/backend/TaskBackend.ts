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

import { apiFetch, apiPost, ServerUrl, getAcceptLanguage, handleFetchResponse } from "~/lib/api"

export type Task = {
  owner: string
  name: string
  createdTime?: string
  displayName?: string
  provider?: string
  type?: string
  path?: string
  scale?: string
  example?: string
  labels?: string[]
  log?: string
  documentUrl?: string
  documentText?: string
  result?: any
  score?: number
}

export function getTasks(
  owner: string,
  page = "",
  pageSize = "",
  field = "",
  value = "",
  sortField = "",
  sortOrder = ""
): Promise<any> {
  const params = new URLSearchParams({
    owner,
    p: String(page),
    pageSize: String(pageSize),
    field,
    value,
    sortField,
    sortOrder,
  })
  return apiFetch(`/api/get-tasks?${params.toString()}`)
}

export function getTask(owner: string, name: string): Promise<any> {
  return apiFetch(`/api/get-task?id=${owner}/${encodeURIComponent(name)}`)
}

export function updateTask(owner: string, name: string, task: Task): Promise<any> {
  return apiPost(`/api/update-task?id=${owner}/${encodeURIComponent(name)}`, task)
}

export function addTask(task: Task): Promise<any> {
  return apiPost("/api/add-task", task)
}

export function deleteTask(task: Task): Promise<any> {
  return apiPost("/api/delete-task", task)
}

export function uploadTaskDocument(
  taskId: string,
  base64: string,
  filename: string,
  filetype: string
): Promise<any> {
  const formData = new FormData()
  formData.append("file", base64)
  formData.append("name", filename)
  formData.append("type", filetype)
  return fetch(`${ServerUrl}/api/upload-task-document?id=${taskId}`, {
    method: "POST",
    credentials: "include",
    headers: { "Accept-Language": getAcceptLanguage() },
    body: formData,
  }).then(handleFetchResponse)
}

export function analyzeTask(owner: string, name: string): Promise<any> {
  return apiFetch(`/api/analyze-task?id=${owner}/${encodeURIComponent(name)}`, { method: "POST" })
}

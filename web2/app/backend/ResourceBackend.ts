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

import { apiFetch, apiPost, ServerUrl, getAcceptLanguage } from "~/lib/api"

export type Resource = {
  owner: string
  name: string
  createdTime?: string
  user?: string
  category?: string
  fileName?: string
  fileType?: string
  fileFormat?: string
  fileSize?: number
  url?: string
}

export function getGlobalResources(
  owner = "",
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
  return apiFetch(`/api/get-global-resources?${params.toString()}`)
}

export function getResource(owner: string, name: string): Promise<any> {
  return apiFetch(`/api/get-resource?id=${owner}/${encodeURIComponent(name)}`)
}

export function updateResource(owner: string, name: string, resource: Resource): Promise<any> {
  return apiPost(`/api/update-resource?id=${owner}/${encodeURIComponent(name)}`, resource)
}

export function addResource(resource: Resource): Promise<any> {
  return apiPost("/api/add-resource", resource)
}

export function deleteResource(resource: Resource): Promise<any> {
  return apiPost("/api/delete-resource", resource)
}

// uploadResource sends a file as multipart/form-data and creates a Resource record.
// category: "avatar" | "chat" | "document"
export function uploadResource(
  user: string,
  category: string,
  objectType: string,
  objectId: string,
  file: File
): Promise<any> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("category", category)
  formData.append("objectType", objectType || "")
  formData.append("objectId", objectId || "")
  return fetch(`${ServerUrl}/api/upload-resource`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept-Language": getAcceptLanguage(),
    },
    body: formData,
  }).then(async (res) => {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      return { status: "error", msg: text }
    }
  })
}

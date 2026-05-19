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

export type Scale = {
  owner: string
  name: string
  createdTime?: string
  displayName?: string
  text?: string
  state?: string
}

export function getPublicScales(): Promise<any> {
  return apiFetch("/api/get-public-scales")
}

export function getScales(
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
  return apiFetch(`/api/get-scales?${params.toString()}`)
}

export function getScale(owner: string, name: string): Promise<any> {
  return apiFetch(`/api/get-scale?id=${owner}/${encodeURIComponent(name)}`)
}

export function updateScale(owner: string, name: string, scale: Scale): Promise<any> {
  return apiPost(`/api/update-scale?id=${owner}/${encodeURIComponent(name)}`, scale)
}

export function addScale(scale: Scale): Promise<any> {
  return apiPost("/api/add-scale", scale)
}

export function deleteScale(scale: Scale): Promise<any> {
  return apiPost("/api/delete-scale", scale)
}

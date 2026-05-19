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

export type Vector = {
  owner: string
  name: string
  createdTime?: string
  displayName?: string
  store?: string
  provider?: string
  file?: string
  index?: number
  text?: string
  data?: number[]
  size?: number
  dimension?: number
  tokenCount?: number
  score?: number
  price?: number
  currency?: string
}

export function getGlobalVectors(): Promise<any> {
  return apiFetch("/api/get-global-vectors")
}

export function getVectors(
  owner: string,
  storeName = "",
  page = "",
  pageSize = "",
  field = "",
  value = "",
  sortField = "",
  sortOrder = ""
): Promise<any> {
  const params = new URLSearchParams({
    owner,
    store: storeName,
    p: page,
    pageSize,
    field,
    value,
    sortField,
    sortOrder,
  })
  return apiFetch(`/api/get-vectors?${params.toString()}`)
}

export function getVector(owner: string, name: string): Promise<any> {
  return apiFetch(`/api/get-vector?id=${owner}/${encodeURIComponent(name)}`)
}

export function updateVector(owner: string, name: string, vector: Vector): Promise<any> {
  return apiPost(`/api/update-vector?id=${owner}/${encodeURIComponent(name)}`, vector)
}

export function addVector(vector: Vector): Promise<any> {
  return apiPost("/api/add-vector", vector)
}

export function deleteVector(vector: Vector): Promise<any> {
  return apiPost("/api/delete-vector", vector)
}

export function deleteAllVectors(): Promise<any> {
  return apiPost("/api/delete-all-vectors", null)
}

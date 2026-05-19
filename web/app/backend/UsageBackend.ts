// Copyright 2024 The OpenAgent Authors. All Rights Reserved.
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

import { apiFetch } from "~/lib/api"

export type UsageData = {
  date: string
  userCount: number
  chatCount: number
  messageCount: number
  tokenCount: number
  price: number
  currency: string
}

export type UsageMetadata = {
  application: number
}

export type UserTableInfo = {
  user: string
  chats: number
  messageCount: number
  tokenCount: number
  price: number
}

export type ProviderData = {
  category: string
  count: number
}

export type HeatmapEntry = {
  date: string
  count: number
}

export type HeatmapData = {
  data: HeatmapEntry[]
  dateRange: string[]
  maxCount: number
}

export function getUsages(storeName: string, selectedUser: string, days: number): Promise<any> {
  return apiFetch(`/api/get-usages?days=${days}&store=${storeName}&selectedUser=${selectedUser}`)
}

export function getRangeUsages(rangeType: string, count: number, storeName: string, selectedUser: string): Promise<any> {
  return apiFetch(`/api/get-range-usages?rangeType=${rangeType}&count=${count}&store=${storeName}&user=${selectedUser}`)
}

export function getUsers(user: string, storeName = ""): Promise<any> {
  return apiFetch(`/api/get-users?user=${user}&store=${storeName}`)
}

export function getUserTableInfos(storeName: string, user: string): Promise<any> {
  return apiFetch(`/api/get-user-table-infos?user=${user}&store=${storeName}`)
}

export function getUsageProviders(owner: string): Promise<any> {
  return apiFetch(`/api/get-usage-providers?owner=${owner}`)
}

export function getUsageHeatmap(owner: string): Promise<any> {
  return apiFetch(`/api/get-usage-heatmap?owner=${owner}`)
}

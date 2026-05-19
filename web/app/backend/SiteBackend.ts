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

export type Site = {
  owner: string
  name: string
  displayName: string
  createdTime: string
  themeColor?: string
  htmlTitle?: string
  faviconUrl?: string
  logoUrl?: string
  staticBaseUrl?: string
  footerHtml?: string
  navbarHtml?: string
  navItems?: string[]
  issuer?: string
  clientId?: string
  clientSecret?: string
  checkUserBalance?: boolean
  ipParsingMode?: string
  parentDbName?: string
  socks5Proxy?: string
  logConfig?: string
}

export function getGlobalSites(): Promise<any> {
  return apiFetch("/api/get-global-sites")
}

export function getSites(): Promise<any> {
  return apiFetch("/api/get-sites")
}

export function getSite(owner: string, name: string): Promise<any> {
  return apiFetch(`/api/get-site?id=${encodeURIComponent(owner)}/${encodeURIComponent(name)}`)
}

export function getBuiltInSite(): Promise<any> {
  return apiFetch("/api/get-built-in-site")
}

export function addSite(site: Site): Promise<any> {
  return apiPost("/api/add-site", site)
}

export function updateSite(owner: string, name: string, site: Site): Promise<any> {
  return apiPost(`/api/update-site?id=${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, site)
}

export function deleteSite(site: Site): Promise<any> {
  return apiPost("/api/delete-site", site)
}

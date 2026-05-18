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

export type McpTool = {
  name: string
  description?: string
  inputSchema?: string
  isAllowed?: boolean
}

export type Server = {
  owner: string
  name: string
  createdTime: string
  displayName?: string
  url?: string
  token?: string
  tools?: McpTool[]
  isDefault?: boolean
  testContent?: string
}

export type ScanResult = {
  scannedHosts?: number
  onlineHosts?: string[]
  servers?: ScannedServer[]
}

export type ScannedServer = {
  host: string
  port: number
  path: string
  url: string
}

export function getServers(
  owner: string,
  page = "",
  pageSize = "",
  field = "",
  value = "",
  sortField = "",
  sortOrder = ""
): Promise<any> {
  return apiFetch(
    `/api/get-servers?owner=${encodeURIComponent(owner)}&p=${page}&pageSize=${pageSize}&field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}&sortField=${sortField}&sortOrder=${sortOrder}`
  )
}

export function getServer(owner: string, name: string): Promise<any> {
  return apiFetch(`/api/get-server?id=${encodeURIComponent(owner)}/${encodeURIComponent(name)}`)
}

export function addServer(server: Server): Promise<any> {
  return apiPost("/api/add-server", server)
}

export function updateServer(owner: string, name: string, server: Server): Promise<any> {
  return apiPost(`/api/update-server?id=${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, server)
}

export function deleteServer(server: Server): Promise<any> {
  return apiPost("/api/delete-server", server)
}

export function testMcpServer(server: Server): Promise<any> {
  return apiPost("/api/test-mcp-server", server)
}

export function syncMcpTool(owner: string, name: string, server: Server, isCleared = false): Promise<any> {
  return apiPost(
    `/api/sync-mcp-tool?id=${encodeURIComponent(owner)}/${encodeURIComponent(name)}&isCleared=${isCleared ? "1" : "0"}`,
    server
  )
}

export function getOnlineServers(): Promise<any> {
  return apiFetch("/api/get-online-servers")
}

export function syncIntranetServers(cidr: string[], ports: number[] = [], paths: string[] = []): Promise<any> {
  return apiPost("/api/sync-intranet-servers", { cidr, ports, paths })
}

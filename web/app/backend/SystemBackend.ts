// Copyright 2025 The OpenAgent Authors. All Rights Reserved.
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

export type SystemInfo = {
  cpuUsage: number[]
  memoryUsed: number
  memoryTotal: number
  diskUsed: number
  diskTotal: number
  networkSent: number
  networkRecv: number
  networkTotal: number
}

export type VersionInfo = {
  version: string
  commitOffset: number
}

export type PrometheusLatencyItem = {
  name: string
  method: string
  count: number
  latency: number
}

export type PrometheusThroughputItem = {
  name: string
  method: string
  throughput: number
}

export type PrometheusInfo = {
  apiLatency: PrometheusLatencyItem[]
  apiThroughput: PrometheusThroughputItem[]
  totalThroughput: number
}

export function getSystemInfo(): Promise<any> {
  return apiFetch("/api/get-system-info")
}

export function getVersionInfo(): Promise<any> {
  return apiFetch("/api/get-version-info")
}

export function getPrometheusInfo(): Promise<any> {
  return apiFetch("/api/get-prometheus-info")
}

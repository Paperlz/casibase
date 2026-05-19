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

import i18next from "i18next"
import { ScrollArea } from "~/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import type { PrometheusInfo } from "~/backend/SystemBackend"

type Props = {
  prometheusInfo: PrometheusInfo
  table: "latency" | "throughput"
}

export function PrometheusInfoTable({ prometheusInfo, table }: Props) {
  if (table === "latency") {
    return (
      <ScrollArea className="h-[300px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{i18next.t("general:Name")}</TableHead>
              <TableHead>{i18next.t("general:Method")}</TableHead>
              <TableHead>{i18next.t("general:Count")}</TableHead>
              <TableHead>{i18next.t("scan:Latency")}(ms)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prometheusInfo.apiLatency.map((item, idx) => (
              <TableRow key={idx}>
                <TableCell className="text-sm">{item.name}</TableCell>
                <TableCell className="text-sm">{item.method}</TableCell>
                <TableCell className="text-sm">{item.count}</TableCell>
                <TableCell className="text-sm">{item.latency}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    )
  }

  return (
    <ScrollArea className="h-[300px]">
      <div className="mb-2 text-sm text-muted-foreground">
        {i18next.t("system:Total Throughput")}: {prometheusInfo.totalThroughput}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{i18next.t("general:Name")}</TableHead>
            <TableHead>{i18next.t("general:Method")}</TableHead>
            <TableHead>{i18next.t("system:Throughput")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prometheusInfo.apiThroughput.map((item, idx) => (
            <TableRow key={idx}>
              <TableCell className="text-sm">{item.name}</TableCell>
              <TableCell className="text-sm">{item.method}</TableCell>
              <TableCell className="text-sm">{item.throughput}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}

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

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import i18next from "i18next"
import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowLeftRightIcon,
  CodeIcon,
  DatabaseIcon,
  GlobeIcon,
  HardDriveIcon,
  LinkIcon,
  MonitorIcon,
  WifiIcon,
  ZapIcon,
} from "lucide-react"
import "~/i18n"

import {
  getSystemInfo,
  getVersionInfo,
  getPrometheusInfo,
  type SystemInfo,
  type VersionInfo,
  type PrometheusInfo,
} from "~/backend/SystemBackend"
import { PrometheusInfoTable } from "~/components/table/PrometheusInfoTable"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"

export function meta() {
  return [{ title: "System Info - OpenAgent" }]
}

// ─── helpers ────────────────────────────────────────────────────────────────

function getFriendlyFileSize(size: number): string {
  if (size < 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let s = size
  while (s >= 1024 && i < units.length - 1) {
    s /= 1024
    i++
  }
  return `${s.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function getUsageColor(percent: number): string {
  if (percent >= 85) return "#ef4444"
  if (percent >= 60) return "#f97316"
  return "#22c55e"
}

// ─── sub-components ──────────────────────────────────────────────────────────

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1 ml-1">
      <span
        className="inline-block h-[7px] w-[7px] rounded-full bg-green-500"
        style={{ animation: "pulse-dot 1.8s ease-in-out infinite" }}
      />
    </span>
  )
}

function StatTitle({
  icon,
  text,
  live,
}: {
  icon: React.ReactNode
  text: string
  live?: boolean
}) {
  return (
    <span className="flex items-center gap-2">
      {icon}
      <span className="font-semibold text-sm">{text}</span>
      {live && <LiveDot />}
    </span>
  )
}

/** SVG-based circular progress (replaces Ant Design Progress type="circle"/"dashboard") */
function CircleProgress({
  percent,
  color,
  size = 120,
  strokeWidth = 8,
}: {
  percent: number
  color: string
  size?: number
  strokeWidth?: number
}) {
  const r = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference - (percent / 100) * circumference
  const cx = size / 2
  const cy = size / 2

  return (
    <svg width={size} height={size} className="block">
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted"
        opacity={0.2}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-lg font-bold"
        style={{ fontSize: 20, fontWeight: 700 }}
      >
        {percent}
        <tspan style={{ fontSize: 12, fontWeight: 400 }}>%</tspan>
      </text>
    </svg>
  )
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex h-24 items-center justify-center text-muted-foreground">
      <ActivityIcon className="h-5 w-5 animate-pulse" />
    </div>
  )
}

// ─── section cards ────────────────────────────────────────────────────────────

function CpuCard({ systemInfo, loading }: { systemInfo: SystemInfo; loading: boolean }) {
  const cpuUsages = systemInfo.cpuUsage ?? []
  const avgCpu =
    cpuUsages.length > 0
      ? Number((cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length).toFixed(1))
      : 0

  const content =
    loading ? (
      <LoadingSpinner />
    ) : cpuUsages.length === 0 ? (
      <p className="text-sm text-muted-foreground">{i18next.t("system:Failed to get CPU usage")}</p>
    ) : (
      <div>
        <div className="mb-4 flex justify-center">
          <div className="text-center">
            <CircleProgress percent={avgCpu} color={getUsageColor(avgCpu)} size={100} />
            <div className="mt-1 text-xs text-muted-foreground">
              {i18next.t("general:Average")} · {cpuUsages.length} {i18next.t("system:cores")}
            </div>
          </div>
        </div>
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${Math.min(cpuUsages.length, 4)}, 1fr)` }}
        >
          {cpuUsages.map((usage, i) => {
            const pct = Number(usage.toFixed(1))
            const color = getUsageColor(pct)
            return (
              <Tooltip key={i}>
                <TooltipTrigger>
                  <div className="text-center">
                    <div className="mb-0.5 text-[10px] text-muted-foreground">C{i}</div>
                    <div className="relative h-12 overflow-hidden rounded bg-muted/30">
                      <div
                        className="absolute bottom-0 left-0 right-0 rounded-b transition-[height] duration-500"
                        style={{ height: `${pct}%`, background: color, opacity: 0.85 }}
                      />
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{pct}%</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Core {i}: {pct}%</TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </div>
    )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <StatTitle icon={<MonitorIcon className="h-4 w-4 text-muted-foreground" />} text={i18next.t("system:CPU Usage")} live />
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}

function MemoryCard({ systemInfo, loading }: { systemInfo: SystemInfo; loading: boolean }) {
  const memPct =
    systemInfo.memoryTotal > 0
      ? Number(((systemInfo.memoryUsed / systemInfo.memoryTotal) * 100).toFixed(1))
      : 0

  const content =
    loading ? (
      <LoadingSpinner />
    ) : systemInfo.memoryTotal <= 0 ? (
      <p className="text-sm text-muted-foreground">{i18next.t("system:Failed to get memory usage")}</p>
    ) : (
      <div className="text-center">
        <div className="flex justify-center">
          <CircleProgress percent={memPct} color={getUsageColor(memPct)} />
        </div>
        <div className="mt-4 flex justify-around">
          <div>
            <div className="mb-0.5 text-[11px] text-muted-foreground">{i18next.t("system:Used")}</div>
            <div className="text-sm font-semibold">{getFriendlyFileSize(systemInfo.memoryUsed)}</div>
          </div>
          <div className="w-px bg-border" />
          <div>
            <div className="mb-0.5 text-[11px] text-muted-foreground">{i18next.t("system:Total")}</div>
            <div className="text-sm font-semibold">{getFriendlyFileSize(systemInfo.memoryTotal)}</div>
          </div>
        </div>
      </div>
    )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <StatTitle icon={<DatabaseIcon className="h-4 w-4 text-muted-foreground" />} text={i18next.t("system:Memory Usage")} live />
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}

function DiskCard({ systemInfo, loading }: { systemInfo: SystemInfo; loading: boolean }) {
  const diskPct =
    systemInfo.diskTotal > 0
      ? Number(((systemInfo.diskUsed / systemInfo.diskTotal) * 100).toFixed(1))
      : 0

  const content =
    loading ? (
      <LoadingSpinner />
    ) : systemInfo.diskTotal <= 0 ? (
      <p className="text-sm text-muted-foreground">{i18next.t("system:Failed to get disk usage")}</p>
    ) : (
      <div className="text-center">
        <div className="flex justify-center">
          <CircleProgress percent={diskPct} color={getUsageColor(diskPct)} />
        </div>
        <div className="mt-4 flex justify-around">
          <div>
            <div className="mb-0.5 text-[11px] text-muted-foreground">{i18next.t("system:Used")}</div>
            <div className="text-sm font-semibold">{getFriendlyFileSize(systemInfo.diskUsed)}</div>
          </div>
          <div className="w-px bg-border" />
          <div>
            <div className="mb-0.5 text-[11px] text-muted-foreground">{i18next.t("system:Total")}</div>
            <div className="text-sm font-semibold">{getFriendlyFileSize(systemInfo.diskTotal)}</div>
          </div>
        </div>
      </div>
    )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <StatTitle icon={<HardDriveIcon className="h-4 w-4 text-muted-foreground" />} text={i18next.t("system:Disk Usage")} live />
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}

function NetworkCard({ systemInfo, loading }: { systemInfo: SystemInfo; loading: boolean }) {
  const content =
    loading ? (
      <LoadingSpinner />
    ) : systemInfo.networkTotal === undefined || systemInfo.networkTotal === null ? (
      <p className="text-sm text-muted-foreground">{i18next.t("system:Failed to get network usage")}</p>
    ) : (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-lg border border-green-500/20 bg-green-500/[0.06] px-3.5 py-2.5">
          <span className="flex items-center gap-1.5 text-[13px] text-green-500">
            <ArrowUpIcon className="h-3.5 w-3.5" />
            <span>{i18next.t("system:Sent")}</span>
          </span>
          <span className="text-sm font-semibold">{getFriendlyFileSize(systemInfo.networkSent)}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-blue-500/20 bg-blue-500/[0.06] px-3.5 py-2.5">
          <span className="flex items-center gap-1.5 text-[13px] text-blue-500">
            <ArrowDownIcon className="h-3.5 w-3.5" />
            <span>{i18next.t("system:Received")}</span>
          </span>
          <span className="text-sm font-semibold">{getFriendlyFileSize(systemInfo.networkRecv)}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <ArrowLeftRightIcon className="h-3.5 w-3.5" />
            <span>{i18next.t("system:Total Throughput")}</span>
          </span>
          <span className="text-base font-bold">{getFriendlyFileSize(systemInfo.networkTotal)}</span>
        </div>
      </div>
    )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <StatTitle icon={<WifiIcon className="h-4 w-4 text-muted-foreground" />} text={i18next.t("system:Network Usage")} live />
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}

function LatencyCard({
  prometheusInfo,
  loading,
}: {
  prometheusInfo: PrometheusInfo
  loading: boolean
}) {
  const content =
    loading || !prometheusInfo.apiLatency || prometheusInfo.apiLatency.length === 0 ? (
      <LoadingSpinner />
    ) : (
      <PrometheusInfoTable prometheusInfo={prometheusInfo} table="latency" />
    )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <StatTitle icon={<ZapIcon className="h-4 w-4 text-muted-foreground" />} text={i18next.t("system:API Latency")} />
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}

function ThroughputCard({
  prometheusInfo,
  loading,
}: {
  prometheusInfo: PrometheusInfo
  loading: boolean
}) {
  const content =
    loading || !prometheusInfo.apiThroughput || prometheusInfo.apiThroughput.length === 0 ? (
      <LoadingSpinner />
    ) : (
      <PrometheusInfoTable prometheusInfo={prometheusInfo} table="throughput" />
    )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <StatTitle icon={<ArrowLeftRightIcon className="h-4 w-4 text-muted-foreground" />} text={i18next.t("system:API Throughput")} />
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}

function AboutCard({ versionInfo }: { versionInfo: VersionInfo }) {
  const link = versionInfo?.version
    ? `https://github.com/the-open-agent/openagent/releases/tag/${versionInfo.version}`
    : ""
  let versionText = versionInfo?.version || i18next.t("system:Unknown version")
  if (versionInfo?.commitOffset > 0) {
    versionText += ` (ahead+${versionInfo.commitOffset})`
  }

  return (
    <Card className="bg-gradient-to-br from-background to-muted/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <StatTitle icon={<CodeIcon className="h-4 w-4 text-muted-foreground" />} text={i18next.t("system:About OpenAgent")} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-[260px] flex-1">
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              {i18next.t(
                "system:🚀⚡️Next-generation personal AI assistant powered by LLM, RAG and agent loops,\nsupporting computer-use, browser-use and coding agent"
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href="https://github.com/the-open-agent/openagent"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border bg-muted px-3 py-1 text-sm hover:bg-muted/80 transition-colors"
              >
                <GithubIcon className="h-3.5 w-3.5" />
                GitHub
              </a>
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm text-blue-600 hover:bg-blue-500/20 dark:text-blue-400 transition-colors"
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  {versionText}
                </a>
              )}
              <a
                href="https://openagentai.org"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-1 text-sm text-green-600 hover:bg-green-500/20 dark:text-green-400 transition-colors"
              >
                <GlobeIcon className="h-3.5 w-3.5" />
                {i18next.t("system:Official website")}
              </a>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

const defaultSystemInfo: SystemInfo = {
  cpuUsage: [],
  memoryUsed: 0,
  memoryTotal: 0,
  diskUsed: 0,
  diskTotal: 0,
  networkSent: 0,
  networkRecv: 0,
  networkTotal: 0,
}

const defaultPrometheusInfo: PrometheusInfo = {
  apiLatency: [],
  apiThroughput: [],
  totalThroughput: 0,
}

export default function SystemInfoPage() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo>(defaultSystemInfo)
  const [versionInfo, setVersionInfo] = useState<VersionInfo>({ version: "", commitOffset: 0 })
  const [prometheusInfo, setPrometheusInfo] = useState<PrometheusInfo>(defaultPrometheusInfo)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopTimer() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  useEffect(() => {
    getSystemInfo()
      .then((res) => {
        setLoading(false)
        if (res.status === "ok") {
          setSystemInfo(res.data)
        } else {
          toast.error(res.msg)
          stopTimer()
          return
        }

        intervalRef.current = setInterval(() => {
          getSystemInfo()
            .then((res2) => {
              if (res2.status === "ok") {
                setSystemInfo(res2.data)
              } else {
                toast.error(res2.msg)
                stopTimer()
              }
            })
            .catch((err: Error) => {
              toast.error(`${i18next.t("general:Failed to get")}: ${err.message}`)
              stopTimer()
            })

          getPrometheusInfo().then((res2) => {
            if (res2?.data) setPrometheusInfo(res2.data)
          })
        }, 2000)
      })
      .catch((err: Error) => {
        toast.error(`${i18next.t("general:Failed to get")}: ${err.message}`)
        setLoading(false)
      })

    getVersionInfo()
      .then((res) => {
        if (res.status === "ok") setVersionInfo(res.data)
        else toast.error(res.msg)
      })
      .catch((err: Error) => {
        toast.error(`${i18next.t("general:Failed to get")}: ${err.message}`)
      })

    return () => stopTimer()
  }, [])

  return (
    <>
      <style>{`
        @keyframes pulse-dot {
          0%   { box-shadow: 0 0 0 0   rgba(34,197,94,0.6); }
          70%  { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0   rgba(34,197,94,0); }
        }
      `}</style>

      <div className="flex flex-col gap-4 p-6">
        {/* 3-column metrics grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CpuCard systemInfo={systemInfo} loading={loading} />
          <MemoryCard systemInfo={systemInfo} loading={loading} />
          <DiskCard systemInfo={systemInfo} loading={loading} />
          <NetworkCard systemInfo={systemInfo} loading={loading} />
          <LatencyCard prometheusInfo={prometheusInfo} loading={loading} />
          <ThroughputCard prometheusInfo={prometheusInfo} loading={loading} />
        </div>

        {/* About */}
        <AboutCard versionInfo={versionInfo} />
      </div>
    </>
  )
}

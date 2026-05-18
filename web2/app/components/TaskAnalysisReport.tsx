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

import { useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { MaximizeIcon } from "lucide-react"
import i18next from "i18next"
import "~/i18n"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { Button } from "~/components/ui/button"

// ── Score band logic ──────────────────────────────────────────────────────────

const TASK_SCORE_BAND_COLORS = ["#f5222d", "#fa8c16", "#faad14", "#52c41a", "#1677ff"]
const NUM_BANDS = 5

function collectScores(categories: any[]): number[] {
  const scores: number[] = []
  ;(categories || []).forEach((cat: any) => {
    ;(cat.items || []).forEach((item: any) => {
      scores.push(Number(item.score) || 0)
    })
  })
  return scores
}

function buildBands(scores: number[]) {
  if (scores.length === 0) return []
  const dataMin = Math.min(...scores)
  const dataMax = Math.max(...scores)
  const low = Math.max(0, dataMin <= 10 ? 0 : Math.floor(dataMin / 10) * 10)
  let high = Math.min(100, dataMax >= 90 ? 100 : Math.ceil((dataMax + 5) / 10) * 10)
  if (high <= low) high = Math.min(100, low + 20)
  const step = (high - low) / NUM_BANDS
  const bands = []
  for (let i = 0; i < NUM_BANDS; i++) {
    const bMin = Math.round(low + i * step)
    const bMax = i === NUM_BANDS - 1 ? high : Math.round(low + (i + 1) * step)
    if (bMax > bMin) bands.push({ min: bMin, max: bMax, label: `${bMin}-${bMax}` })
  }
  return bands
}

function getScoreBandColor(score: number, categories: any[]): string {
  const scores = collectScores(categories)
  const bands = buildBands(scores)
  if (bands.length === 0) return "#8c8c8c"
  const s = Number(score) || 0
  const idx = bands.findIndex((b, i) =>
    i < bands.length - 1 ? s >= b.min && s < b.max : s >= b.min && s <= b.max
  )
  if (idx < 0) return TASK_SCORE_BAND_COLORS[TASK_SCORE_BAND_COLORS.length - 1]
  return TASK_SCORE_BAND_COLORS[idx % TASK_SCORE_BAND_COLORS.length]
}

function formatCategoryHeading(cat: any, index: number): string {
  const name = (cat?.name ?? "").trim()
  if (!name) return `${index + 1}.`
  if (/^\d+[.)、]/.test(name)) return name
  return `${index + 1}. ${name}`
}

// ── Radar Chart ───────────────────────────────────────────────────────────────

function buildRadarData(categories: any[]) {
  const rows: { subject: string; score: number; fullName: string }[] = []
  ;(categories || []).forEach((cat: any) => {
    const items = cat.items || []
    if (items.length > 0) {
      items.forEach((item: any) => {
        const name = (item.name ?? "").trim() || (cat.name ?? "")
        rows.push({ subject: name.length > 10 ? name.slice(0, 10) + "…" : name, score: Number(item.score) || 0, fullName: name })
      })
    } else {
      const name = (cat.name ?? "").trim()
      rows.push({ subject: name.length > 10 ? name.slice(0, 10) + "…" : name, score: Number(cat.score) || 0, fullName: name })
    }
  })
  return rows
}

function getRadarAxisRange(categories: any[]): { min: number; max: number } {
  const scores: number[] = []
  ;(categories || []).forEach((cat: any) => {
    ;(cat.items || []).forEach((item: any) => scores.push(Number(item.score) || 0))
  })
  if (scores.length === 0) {
    ;(categories || []).forEach((cat: any) => scores.push(Number(cat.score) || 0))
  }
  if (scores.length === 0) return { min: 0, max: 5 }
  const maxScore = Math.max(...scores)
  if (maxScore <= 5) return { min: 0, max: 5 }
  if (maxScore <= 10) return { min: 0, max: 10 }
  return { min: 50, max: 100 }
}

function TaskRadarChart({ categories }: { categories: any[] }) {
  const data = buildRadarData(categories)
  if (data.length === 0) return null
  const { min: radarMin, max: radarMax } = getRadarAxisRange(categories)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
        <PolarGrid />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
        <PolarRadiusAxis angle={90} domain={[radarMin, radarMax]} tick={{ fontSize: 9 }} />
        <Radar
          name={i18next.t("task:Score")}
          dataKey="score"
          stroke="#1677ff"
          fill="#1677ff"
          fillOpacity={0.3}
          dot={{ r: 3 }}
        />
        <Tooltip
          formatter={(value: any, _name: any, props: any) => [
            `${value}${i18next.t("task:Score Unit")}`,
            props.payload?.fullName || props.payload?.subject,
          ]}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}

// ── Bar Chart (horizontal ranked) ─────────────────────────────────────────────

function flattenItems(categories: any[], maxScoreExclusive?: number) {
  const list: { name: string; score: number; categoryName: string; shortName: string }[] = []
  ;(categories || []).forEach((cat: any) => {
    ;(cat.items || []).forEach((item: any) => {
      list.push({
        name: item.name,
        score: Number(item.score) || 0,
        categoryName: cat.name,
        shortName: (item.name ?? "").length > 18 ? (item.name ?? "").slice(0, 18) + "…" : item.name ?? "",
      })
    })
  })
  const sorted = list.sort((a, b) => b.score - a.score)
  if (maxScoreExclusive !== undefined) return sorted.filter((it) => it.score < maxScoreExclusive)
  return sorted
}

function getScoreRange(categories: any[]) {
  let min = 100
  let max = 0
  ;(categories || []).forEach((cat: any) => {
    ;(cat.items || []).forEach((item: any) => {
      const s = Number(item.score) || 0
      if (s < min) min = s
      if (s > max) max = s
    })
  })
  if (min > max) return { min: 0, max: 100 }
  const padding = Math.max(10, Math.ceil((max - min) * 0.1))
  const axisMin = Math.max(0, min <= 10 ? 0 : Math.floor(min / 10) * 10 - 10)
  const axisMax = Math.min(100, max >= 90 ? 100 : Math.ceil((max + padding) / 10) * 10)
  return { min: axisMin, max: Math.max(axisMax, axisMin + 10) }
}

function TaskBarChartHorizontal({ categories }: { categories: any[] }) {
  const items = flattenItems(categories)
  if (items.length === 0) return null
  const { min: xMin, max: xMax } = getScoreRange(categories)
  const data = [...items].reverse().map((it) => ({ name: it.shortName, score: it.score, fullName: it.name, category: it.categoryName }))
  const barHeight = Math.max(24, Math.min(36, 400 / Math.max(data.length, 1)))
  const chartHeight = Math.max(200, data.length * (barHeight + 4) + 40)
  return (
    <div style={{ width: "100%", height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.1)" />
          <XAxis type="number" domain={[xMin, xMax]} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
          <Tooltip
            formatter={(value: any, _name: any, props: any) => [
              `${value}${i18next.t("task:Score Unit")}`,
              props.payload?.fullName || props.payload?.name,
            ]}
            labelFormatter={(label: any, payload: any) => payload?.[0]?.payload?.category || label}
          />
          <Bar dataKey="score" fill="#1677ff" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 10, fill: "#333" }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Bar Chart (vertical, priority = low score) ────────────────────────────────

function getLowScoreVerticalBounds(items: { score: number }[]) {
  const minScore = Math.min(...items.map((it) => it.score))
  const yMax = 80
  if (minScore >= 50) return { yMin: 50, yMax }
  const yMin = Math.max(0, Math.floor(minScore / 10) * 10 - 10)
  return { yMin, yMax }
}

function TaskBarChartVertical({ categories }: { categories: any[] }) {
  const items = flattenItems(categories, 70)
  if (items.length === 0) return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {i18next.t("general:No data")}
    </div>
  )
  const { yMin, yMax } = getLowScoreVerticalBounds(items)
  const data = items.map((it) => ({ name: it.shortName, score: it.score, fullName: it.name, category: it.categoryName }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 16, right: 10, bottom: 60, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.1)" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
        <YAxis domain={[yMin, yMax]} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: any, _name: any, props: any) => [
            `${value}${i18next.t("task:Score Unit")}`,
            props.payload?.fullName || props.payload?.name,
          ]}
          labelFormatter={(label: any, payload: any) => payload?.[0]?.payload?.category || label}
        />
        <Bar dataKey="score" fill="#1677ff" radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 10, fill: "#333" }} barSize={26} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Pie Chart (score band distribution) ──────────────────────────────────────

function TaskPieChart({ categories }: { categories: any[] }) {
  const scores = collectScores(categories)
  const bands = buildBands(scores)
  if (bands.length === 0) return null
  const counts = bands.map(() => 0)
  scores.forEach((s) => {
    const idx = bands.findIndex((b, i) =>
      i < bands.length - 1 ? s >= b.min && s < b.max : s >= b.min && s <= b.max
    )
    if (idx >= 0) counts[idx] += 1
  })
  const scoreUnit = i18next.t("task:Score Unit")
  const itemUnit = i18next.t("task:Item count unit")
  const data = bands
    .map((b, i) => ({
      name: `${b.label}${scoreUnit} (${counts[i]}${itemUnit})`,
      value: counts[i],
      color: TASK_SCORE_BAND_COLORS[i % TASK_SCORE_BAND_COLORS.length],
    }))
    .filter((d) => d.value > 0)
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="40%"
          cy="52%"
          innerRadius="40%"
          outerRadius="70%"
          dataKey="value"
          label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} stroke="#fff" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip formatter={(value: any, name: any) => [value, name]} />
        <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={12} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ── Chart Card ────────────────────────────────────────────────────────────────

type ChartKey = "radar" | "bar" | "pie" | "lowscore"

function ChartCard({
  title,
  chartKey,
  onFullscreen,
  children,
}: {
  title: string
  chartKey: ChartKey
  onFullscreen: (key: ChartKey) => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm" style={{ minHeight: 400 }}>
      <div className="relative flex items-center justify-center border-b border-border px-4 py-2.5">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => onFullscreen(chartKey)}
          title={i18next.t("general:Fullscreen")}
        >
          <MaximizeIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 p-3">{children}</div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TaskAnalysisReport({
  result,
}: {
  result: any
  downloadFileName?: string
}) {
  const [fullscreenChart, setFullscreenChart] = useState<ChartKey | null>(null)

  if (!result) return null

  const categories: any[] = result.categories || []

  const metaItems = [
    { label: i18next.t("task:Unit Name"), value: result.title },
    { label: i18next.t("task:Designer"), value: result.designer },
    { label: i18next.t("video:Stage"), value: result.stage },
    { label: i18next.t("task:Participants"), value: result.participants },
    { label: i18next.t("video:Grade"), value: result.grade },
    { label: i18next.t("task:Instructor"), value: result.instructor },
    { label: i18next.t("store:Subject"), value: result.subject },
    { label: i18next.t("video:School"), value: result.school },
    { label: i18next.t("task:Other Subjects"), value: result.otherSubjects },
    { label: i18next.t("task:Textbook"), value: result.textbook },
  ]

  const hasCharts = categories.length > 0

  function renderChart(key: ChartKey) {
    if (key === "radar") return <TaskRadarChart categories={categories} />
    if (key === "bar") return <TaskBarChartHorizontal categories={categories} />
    if (key === "pie") return <TaskPieChart categories={categories} />
    if (key === "lowscore") return <TaskBarChartVertical categories={categories} />
    return null
  }

  function getChartTitle(key: ChartKey | null): string {
    if (key === "radar") return i18next.t("task:Chart caption radar")
    if (key === "bar") return i18next.t("task:Chart caption bar ranked")
    if (key === "pie") return i18next.t("task:Chart caption pie")
    if (key === "lowscore") return i18next.t("task:Chart caption priority dimensions")
    return ""
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Meta info */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md border border-border bg-muted/40 p-3 text-sm">
        {metaItems.map((item, idx) => (
          <div key={idx} className="flex gap-2">
            <span className="shrink-0 font-semibold">{item.label}：</span>
            <span className="text-muted-foreground">{item.value || "-"}</span>
          </div>
        ))}
      </div>

      {/* Overall score */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="text-base font-semibold">
          {i18next.t("task:Overall Score")}：
          <span className="ml-1 text-xl font-bold text-primary">{result.score}</span>
        </div>
      </div>

      {/* Charts 2×2 grid */}
      {hasCharts && (
        <div className="grid grid-cols-2 gap-6">
          <ChartCard title={i18next.t("task:Chart caption radar")} chartKey="radar" onFullscreen={setFullscreenChart}>
            <div style={{ height: 360 }}>
              <TaskRadarChart categories={categories} />
            </div>
          </ChartCard>
          <ChartCard title={i18next.t("task:Chart caption bar ranked")} chartKey="bar" onFullscreen={setFullscreenChart}>
            <TaskBarChartHorizontal categories={categories} />
          </ChartCard>
          <ChartCard title={i18next.t("task:Chart caption pie")} chartKey="pie" onFullscreen={setFullscreenChart}>
            <div style={{ height: 360 }}>
              <TaskPieChart categories={categories} />
            </div>
          </ChartCard>
          <ChartCard title={i18next.t("task:Chart caption priority dimensions")} chartKey="lowscore" onFullscreen={setFullscreenChart}>
            <div style={{ height: 360 }}>
              <TaskBarChartVertical categories={categories} />
            </div>
          </ChartCard>
        </div>
      )}

      {/* Fullscreen chart dialog */}
      <Dialog open={fullscreenChart !== null} onOpenChange={(open) => !open && setFullscreenChart(null)}>
        <DialogContent className="max-w-[95vw] h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{getChartTitle(fullscreenChart)}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {fullscreenChart && renderChart(fullscreenChart)}
          </div>
        </DialogContent>
      </Dialog>

      {/* Per-category detail tables */}
      {categories.map((cat: any, idx: number) => (
        <div key={idx}>
          <div className="mb-2 text-sm font-semibold">
            {formatCategoryHeading(cat, idx)}（{i18next.t("task:Score")}：{cat.score}{i18next.t("task:Score Unit")}）
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[12%]">{i18next.t("task:Sub-criteria")}</TableHead>
                  <TableHead className="w-[8%]">{i18next.t("task:Score")}</TableHead>
                  <TableHead className="w-[27%]">{i18next.t("task:Advantages")}</TableHead>
                  <TableHead className="w-[27%]">{i18next.t("task:Disadvantages")}</TableHead>
                  <TableHead className="w-[26%]">{i18next.t("task:Suggestion")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(cat.items || []).map((item: any, i: number) => {
                  const color = getScoreBandColor(item.score, categories)
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{item.name}</TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold text-white"
                          style={{ backgroundColor: color }}
                        >
                          {item.score}{i18next.t("task:Score Unit")}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{item.advantage}</TableCell>
                      <TableCell className="text-sm">{item.disadvantage}</TableCell>
                      <TableCell className="text-sm">{item.suggestion}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  )
}

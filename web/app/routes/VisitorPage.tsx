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

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { toast } from "sonner"
import { ChevronDownIcon, CheckIcon } from "lucide-react"
import i18next from "i18next"
import "~/i18n"

import { isAdminUser } from "~/backend/AccountBackend"
import { getVisitors, type VisitorEntry } from "~/backend/VisitorBackend"
import { getUsers } from "~/backend/UsageBackend"
import { useAccount } from "~/context/AccountContext"
import { Skeleton } from "~/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover"
import { Checkbox } from "~/components/ui/checkbox"

export function meta() {
  return [{ title: "Visitors - OpenAgent" }]
}

const SUB_PIE_FIELDS = ["region", "city", "unit", "section"] as const
type SubPieField = typeof SUB_PIE_FIELDS[number]

const CHART_COLORS = [
  "#1677ff", "#0ea5e9", "#06b6d4", "#14b8a6", "#6366f1",
  "#8b5cf6", "#0958d9", "#0284c7", "#0891b2", "#0f766e",
  "#5734d3", "#7c3aed", "#38bdf8", "#5eead4",
]

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ title, value, loading }: {
  title: string
  value: number | undefined
  loading: boolean
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      {loading ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <span className="text-2xl font-semibold tabular-nums">
          {value?.toLocaleString() ?? 0}
        </span>
      )}
    </div>
  )
}

// ── Visitor Pie Chart ──────────────────────────────────────────────────────────

function VisitorPieChart({ data, loading }: { data: VisitorEntry[] | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Skeleton className="h-48 w-48 rounded-full" />
      </div>
    )
  }

  const lastEntry = data && data.length > 0 ? data[data.length - 1] : null
  const fieldCount = lastEntry?.FieldCount ?? {}
  const chartData = Object.entries(fieldCount).map(([name, value]) => ({ name, value }))

  if (chartData.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
        {i18next.t("general:No data")}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <PieChart>
        <Pie
          data={chartData}
          cx="35%"
          cy="50%"
          outerRadius="60%"
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value, name) => [value, name]} />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, right: 0, width: "44%" }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ── Visitor Line Chart ─────────────────────────────────────────────────────────

function VisitorLineChart({ data, selectedOps, loading }: {
  data: VisitorEntry[] | null
  selectedOps: string[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!data || data.length === 0 || selectedOps.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
        {i18next.t("general:No data")}
      </div>
    )
  }

  const chartData = data.map(entry => ({
    date: entry.date,
    ...selectedOps.reduce<Record<string, number>>((acc, op) => {
      acc[op] = entry.FieldCount[op] ?? 0
      return acc
    }, {}),
  }))

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        {selectedOps.map((op, i) => (
          <Line
            key={op}
            type="monotone"
            dataKey={op}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Sub Pie Chart ──────────────────────────────────────────────────────────────

function SubPieChart({ fieldName, data, loading }: {
  fieldName: string
  data: VisitorEntry[] | null
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Skeleton className="h-48 w-48 rounded-full" />
      </div>
    )
  }

  const lastEntry = data && data.length > 0 ? data[data.length - 1] : null
  const fieldCount = lastEntry?.FieldCount ?? {}
  const chartData = Object.entries(fieldCount).map(([name, value]) => ({ name, value }))

  if (chartData.length === 0) return null

  return (
    <div>
      <h3 className="mb-2 text-center text-sm font-medium capitalize text-muted-foreground">
        {fieldName}
      </h3>
      <ResponsiveContainer width="100%" height={400}>
        <PieChart>
          <Pie
            data={chartData}
            cx="35%"
            cy="50%"
            outerRadius="60%"
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value, name) => [value, name]} />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, right: 0, width: "44%" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Operations Multi-Select ────────────────────────────────────────────────────

function OpsMultiSelect({ allOps, selectedOps, onChange }: {
  allOps: string[]
  selectedOps: string[]
  onChange: (ops: string[]) => void
}) {
  const [open, setOpen] = useState(false)

  function toggleOp(op: string) {
    if (selectedOps.includes(op)) {
      onChange(selectedOps.filter(o => o !== op))
    } else {
      onChange([...selectedOps, op])
    }
  }

  const label =
    selectedOps.length === 0
      ? i18next.t("general:Select operations")
      : selectedOps.length === allOps.length
        ? i18next.t("general:All operations")
        : `${selectedOps.length} ${i18next.t("general:selected")}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex h-8 w-60 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground ring-offset-background hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <span className="truncate">{label}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" align="end">
        <div className="max-h-60 overflow-auto">
          {allOps.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              {i18next.t("general:No data")}
            </div>
          ) : (
            allOps.map(op => (
              <label
                key={op}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
              >
                <Checkbox
                  checked={selectedOps.includes(op)}
                  onCheckedChange={() => toggleOp(op)}
                />
                <span className="text-sm">{op}</span>
                {selectedOps.includes(op) && (
                  <CheckIcon className="ml-auto size-3 text-primary" />
                )}
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function VisitorPage() {
  const { account } = useAccount()
  const isAdmin = isAdminUser(account ?? undefined)

  const [users, setUsers] = useState<string[]>([])
  const [selectedUser, setSelectedUser] = useState<string>("All")

  const [visitorsAction, setVisitorsAction] = useState<VisitorEntry[] | null | undefined>(undefined)
  const [visitorsResponse, setVisitorsResponse] = useState<VisitorEntry[] | null | undefined>(undefined)
  const [subPieData, setSubPieData] = useState<Record<SubPieField, VisitorEntry[] | null | undefined>>({
    region: undefined,
    city: undefined,
    unit: undefined,
    section: undefined,
  })

  const [allOps, setAllOps] = useState<string[]>([])
  const [selectedOps, setSelectedOps] = useState<string[]>([])

  const initialized = useRef(false)

  function extractAllOperations(data: VisitorEntry[]): string[] {
    const opsSet = new Set<string>()
    data.forEach(item => {
      Object.keys(item.FieldCount).forEach(op => opsSet.add(op))
    })
    return Array.from(opsSet)
  }

  const fetchVisitorsForFields = useCallback((user: string, fields: string[]) => {
    getVisitors(user, 30, fields).then((res) => {
      if (res.status === "ok") {
        const fieldData: Record<string, VisitorEntry[]> = res.data ?? {}
        Object.entries(fieldData).forEach(([fieldName, data]) => {
          if (fieldName === "action") {
            setVisitorsAction(data)
            const ops = extractAllOperations(data)
            setAllOps(ops)
            setSelectedOps(ops)
          } else if (fieldName === "response") {
            setVisitorsResponse(data)
          } else if (SUB_PIE_FIELDS.includes(fieldName as SubPieField)) {
            setSubPieData(prev => ({ ...prev, [fieldName]: data }))
          }
        })
      } else {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      }
    })
  }, [])

  const fetchAllVisitors = useCallback((user: string) => {
    setVisitorsAction(undefined)
    setVisitorsResponse(undefined)
    setSubPieData({ region: undefined, city: undefined, unit: undefined, section: undefined })
    setAllOps([])
    setSelectedOps([])

    fetchVisitorsForFields(user, [...SUB_PIE_FIELDS])
    fetchVisitorsForFields(user, ["action"])
    fetchVisitorsForFields(user, ["response"])
  }, [fetchVisitorsForFields])

  useEffect(() => {
    if (!account || initialized.current) return
    initialized.current = true

    getUsers(account.name, "").then((res) => {
      if (res.status === "ok") {
        const userList: string[] = res.data ?? []
        setUsers(userList)
        const initUser = isAdmin ? "All" : (userList[0] ?? "All")
        setSelectedUser(initUser)
        fetchAllVisitors(initUser)
      } else {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      }
    })
  }, [account, isAdmin, fetchAllVisitors])

  function handleUserChange(value: string) {
    setSelectedUser(value)
    fetchAllVisitors(value)
  }

  const lastResponse = visitorsResponse && visitorsResponse.length > 0
    ? visitorsResponse[visitorsResponse.length - 1].FieldCount
    : { ok: 0, error: 0 }
  const statsLoading = visitorsResponse === undefined

  const visibleSubPieFields = SUB_PIE_FIELDS.filter(field => {
    const data = subPieData[field]
    if (data === undefined) return true
    if (!data || data.length === 0) return false
    const lastEntry = data[data.length - 1]
    return Object.keys(lastEntry?.FieldCount ?? {}).length > 0
  })

  return (
    <div className="flex flex-col gap-0 pb-10">
      {/* Header: stats + controls */}
      <div className="flex flex-wrap items-start justify-between gap-4 p-6 pb-4">
        {/* Stat cards */}
        <div className="flex flex-wrap gap-3">
          <StatCard
            title={i18next.t("general:Success")}
            value={lastResponse.ok}
            loading={statsLoading}
          />
          <StatCard
            title={i18next.t("general:Error")}
            value={lastResponse.error}
            loading={statsLoading}
          />
        </div>

        {/* Controls */}
        <div className="flex flex-col items-end gap-2">
          {/* User selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{i18next.t("general:User")}:</span>
            <Select value={selectedUser} onValueChange={(v) => handleUserChange(v ?? "All")}>
              <SelectTrigger className="h-8 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All" disabled={!isAdmin}>
                  All
                </SelectItem>
                {users.map((user) => (
                  <SelectItem key={user} value={user}>
                    {user}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Operations multi-select */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{i18next.t("general:Operations")}:</span>
            <OpsMultiSelect
              allOps={allOps}
              selectedOps={selectedOps}
              onChange={setSelectedOps}
            />
          </div>
        </div>
      </div>

      {/* Main charts: Pie + Line */}
      <div className="grid grid-cols-1 gap-4 px-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            {i18next.t("general:Operation Type")}
          </h3>
          <VisitorPieChart data={visitorsAction ?? null} loading={visitorsAction === undefined} />
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            {i18next.t("general:Trends")}
          </h3>
          <VisitorLineChart
            data={visitorsAction ?? null}
            selectedOps={selectedOps}
            loading={visitorsAction === undefined}
          />
        </div>
      </div>

      {/* Sub-pie charts: region, city, unit, section */}
      {visibleSubPieFields.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 px-6 lg:grid-cols-2">
          {visibleSubPieFields.map(field => (
            <div key={field} className="rounded-xl border border-border bg-card p-4">
              <SubPieChart
                fieldName={field}
                data={subPieData[field] ?? null}
                loading={subPieData[field] === undefined}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

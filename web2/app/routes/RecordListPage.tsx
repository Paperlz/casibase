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

import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router"
import {
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  EyeIcon,
  Loader2Icon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { isAdminUser } from "~/backend/AccountBackend"
import { deleteRecord, getRecords, type RecordEntry } from "~/backend/RecordBackend"
import { useAccount } from "~/context/AccountContext"
import { getAuthConfig } from "~/lib/AuthConfig"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "~/components/ui/hover-card"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Switch } from "~/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"

export function meta() {
  return [{ title: "Records - OpenAgent" }]
}

type SortOrder = "ascend" | "descend" | ""
type Pagination = { current: number; pageSize: number; total: number }

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 1000, 10000, 100000]

const SEARCH_FIELDS = [
  "organization", "id", "name", "clientIp", "provider", "user",
  "requestUri", "language", "query", "region", "city", "unit",
  "section", "count", "response", "object", "errorText", "action",
]

function getFormattedDate(date?: string | null): string {
  if (!date) return ""
  return date.replace("T", " ").replace("+08:00", " ").trim()
}

function getShortText(text: string | undefined | null, max = 50): string {
  if (!text) return ""
  return text.length > max ? text.substring(0, max) + "..." : text
}

function getUserProfileUrl(owner: string, name: string): string {
  const { issuer } = getAuthConfig()
  if (!issuer) return ""
  return `${issuer}/users/${owner}/${name}`
}

function getOrganizationUrl(org: string): string {
  const { issuer } = getAuthConfig()
  if (!issuer) return ""
  return `${issuer}/organizations/${org}`
}

function tryFormatJson(text: string): { formatted: string; isValid: boolean; error?: string } {
  try {
    const parsed = JSON.parse(text)
    return { formatted: JSON.stringify(parsed, null, 2), isValid: true }
  } catch (e: any) {
    return { formatted: text, isValid: false, error: e?.message }
  }
}

function SortableHead({
  label,
  field,
  currentField,
  currentOrder,
  onSort,
  className,
}: {
  label: string
  field: string
  currentField: string
  currentOrder: SortOrder
  onSort: (field: string, order: SortOrder) => void
  className?: string
}) {
  function handleClick() {
    if (currentField !== field) {
      onSort(field, "ascend")
    } else if (currentOrder === "ascend") {
      onSort(field, "descend")
    } else {
      onSort("", "")
    }
  }

  return (
    <TableHead
      className={`cursor-pointer select-none whitespace-nowrap hover:bg-muted/50 ${className ?? ""}`}
      onClick={handleClick}
    >
      <div className="flex items-center gap-1">
        {label}
        {currentField === field ? (
          currentOrder === "ascend" ? (
            <ChevronUpIcon className="h-3.5 w-3.5 shrink-0 text-foreground" />
          ) : (
            <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-foreground" />
          )
        ) : (
          <ChevronsUpDownIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        )}
      </div>
    </TableHead>
  )
}

export default function RecordListPage() {
  const { account } = useAccount()
  const navigate = useNavigate()

  const [records, setRecords] = useState<RecordEntry[]>([])
  const [pagination, setPagination] = useState<Pagination>({ current: 1, pageSize: 10, total: 0 })
  const [loading, setLoading] = useState(false)
  const [sortField, setSortField] = useState("")
  const [sortOrder, setSortOrder] = useState<SortOrder>("")
  const [searchField, setSearchField] = useState("name")
  const [searchValue, setSearchValue] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [enableDecoding, setEnableDecoding] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("enableDecoding")
      return saved !== null ? JSON.parse(saved) === true : false
    } catch {
      return false
    }
  })

  const isAdmin = isAdminUser(account)

  function toggleDecoding() {
    const next = !enableDecoding
    setEnableDecoding(next)
    localStorage.setItem("enableDecoding", JSON.stringify(next))
  }

  const fetchRecords = useCallback(
    (params: {
      current?: number
      pageSize?: number
      sortField?: string
      sortOrder?: SortOrder
      field?: string
      value?: string
    } = {}) => {
      if (!account) return
      const current = params.current ?? pagination.current
      const pageSize = params.pageSize ?? pagination.pageSize
      const sf = params.sortField !== undefined ? params.sortField : sortField
      const so = params.sortOrder !== undefined ? params.sortOrder : sortOrder
      const field = params.field ?? searchField
      const value = params.value ?? searchValue
      const owner = account.owner ?? "admin"
      setLoading(true)
      getRecords(owner, current, pageSize, field, value, sf, so)
        .then((res) => {
          setLoading(false)
          if (res.status === "ok") {
            setRecords(res.data ?? [])
            setPagination((p) => ({ ...p, current, pageSize, total: res.data2 ?? 0 }))
            setSortField(sf)
            setSortOrder(so)
            setSearchField(field)
            setSearchValue(value)
            setSelected([])
          } else {
            toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
          }
        })
        .catch((err: Error) => {
          setLoading(false)
          toast.error(err.message)
        })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pagination.current, pagination.pageSize, sortField, sortOrder, searchField, searchValue, account?.owner]
  )

  useEffect(() => {
    if (account === undefined) return
    fetchRecords({ current: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.name])

  async function handleBulkDelete() {
    const targets = records.filter((r) => selected.includes(`${r.owner}/${r.name}`))
    for (const record of targets) {
      const res = await deleteRecord(record)
      if (res.status !== "ok") {
        toast.error(`${i18next.t("general:Failed to delete")}: ${record.name}: ${res.msg}`)
        setBulkDeleteOpen(false)
        return
      }
    }
    toast.success(i18next.t("general:Successfully deleted"))
    setRecords((prev) => prev.filter((r) => !targets.some((t) => t.name === r.name && t.owner === r.owner)))
    setPagination((p) => ({ ...p, total: Math.max(0, p.total - targets.length) }))
    setSelected([])
    setBulkDeleteOpen(false)
  }

  function applySearch() {
    fetchRecords({ current: 1, field: searchField, value: searchValue })
  }

  function handleSort(field: string, order: SortOrder) {
    fetchRecords({ current: 1, sortField: field, sortOrder: order })
  }

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))

  const sortProps = { currentField: sortField, currentOrder: sortOrder, onSort: handleSort }

  const TRIGGERED_ACTIONS = ["signup", "login", "logout", "update-user"]

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:Logs")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <div className="flex items-center gap-1.5">
              <Switch
                id="decode-toggle"
                checked={enableDecoding}
                onCheckedChange={toggleDecoding}
              />
              <Label htmlFor="decode-toggle" className="cursor-pointer text-sm">
                {i18next.t("record:Enable decoding")}
              </Label>
            </div>
          )}
          <Select value={searchField} onValueChange={(v) => setSearchField(v ?? "name")}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEARCH_FIELDS.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="h-8 w-52"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applySearch() }}
          />
          <Button variant="outline" size="sm" onClick={applySearch}>
            {i18next.t("general:Search")}
          </Button>
          {selected.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2Icon className="h-4 w-4" />
              {i18next.t("general:Delete")} ({selected.length})
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={records.length > 0 && selected.length === records.length}
                  onCheckedChange={(checked) =>
                    setSelected(checked ? records.map((r) => `${r.owner}/${r.name}`) : [])
                  }
                />
              </TableHead>
              <SortableHead label={i18next.t("general:Organization")} field="organization" {...sortProps} className="w-28" />
              <SortableHead label={i18next.t("general:ID")} field="id" {...sortProps} className="w-24" />
              <SortableHead label={i18next.t("general:Name")} field="name" {...sortProps} className="w-72" />
              <SortableHead label={i18next.t("general:Client IP")} field="clientIp" {...sortProps} className="w-36" />
              <SortableHead label={i18next.t("general:Created time")} field="createdTime" {...sortProps} className="w-40" />
              <SortableHead label={i18next.t("general:Provider")} field="provider" {...sortProps} className="w-36" />
              <SortableHead label={i18next.t("general:User")} field="user" {...sortProps} className="w-28" />
              <SortableHead label={i18next.t("general:Method")} field="method" {...sortProps} className="w-24" />
              <SortableHead label={i18next.t("general:Request URI")} field="requestUri" {...sortProps} className="w-48" />
              <SortableHead label={i18next.t("general:Language")} field="language" {...sortProps} className="w-24" />
              <SortableHead label={i18next.t("general:Query")} field="query" {...sortProps} className="w-24" />
              <SortableHead label={i18next.t("general:Region")} field="region" {...sortProps} className="w-24" />
              <SortableHead label={i18next.t("general:City")} field="city" {...sortProps} className="w-24" />
              <SortableHead label={i18next.t("general:Unit")} field="unit" {...sortProps} className="w-24" />
              <SortableHead label={i18next.t("general:Section")} field="section" {...sortProps} className="w-24" />
              <SortableHead label={i18next.t("general:Count")} field="count" {...sortProps} className="w-24" />
              <SortableHead label={i18next.t("general:Response")} field="response" {...sortProps} className="w-24" />
              <SortableHead label={i18next.t("general:Object")} field="object" {...sortProps} className="w-48" />
              <SortableHead label={i18next.t("message:Error text")} field="errorText" {...sortProps} className="w-36" />
              <SortableHead label={i18next.t("general:Is triggered")} field="isTriggered" {...sortProps} className="w-32" />
              <SortableHead label={i18next.t("general:Action")} field="action" {...sortProps} className="w-36" />
              <TableHead className="sticky right-0 w-24 bg-card text-right">{i18next.t("general:Action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={23} className="py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    {i18next.t("general:Loading")}
                  </div>
                </TableCell>
              </TableRow>
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={23} className="py-16 text-center text-muted-foreground">
                  {i18next.t("general:No data")}
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => {
                const rowKey = `${record.owner}/${record.name}`
                const objResult = record.object ? tryFormatJson(record.object) : null

                return (
                  <TableRow key={rowKey}>
                    {/* Checkbox */}
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(rowKey)}
                        onCheckedChange={(checked) =>
                          setSelected((prev) =>
                            checked ? [...prev, rowKey] : prev.filter((k) => k !== rowKey)
                          )
                        }
                      />
                    </TableCell>

                    {/* Organization */}
                    <TableCell className="text-sm">
                      <a
                        href={getOrganizationUrl(record.organization ?? "")}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {record.organization}
                      </a>
                    </TableCell>

                    {/* ID */}
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {record.id}
                    </TableCell>

                    {/* Name */}
                    <TableCell className="text-sm">
                      <Link
                        to={`/records/${record.organization}/${record.id}`}
                        className="text-primary hover:underline"
                      >
                        {record.name}
                      </Link>
                    </TableCell>

                    {/* Client IP */}
                    <TableCell className="text-sm">
                      <a
                        href={`https://db-ip.com/${record.clientIp}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {record.clientIp}
                      </a>
                    </TableCell>

                    {/* Created time */}
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {getFormattedDate(record.createdTime)}
                    </TableCell>

                    {/* Provider */}
                    <TableCell className="text-sm">
                      {record.provider ? (
                        <Link
                          to={`/providers/${record.provider}`}
                          className="text-primary hover:underline"
                        >
                          {getShortText(record.provider, 25)}
                        </Link>
                      ) : null}
                    </TableCell>

                    {/* User */}
                    <TableCell className="text-sm">
                      <a
                        href={getUserProfileUrl(record.organization ?? "", record.user ?? "")}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {record.user}
                      </a>
                    </TableCell>

                    {/* Method */}
                    <TableCell className="font-mono text-sm">
                      {record.method}
                    </TableCell>

                    {/* Request URI */}
                    <TableCell className="max-w-[192px] truncate font-mono text-sm text-muted-foreground">
                      {record.requestUri}
                    </TableCell>

                    {/* Language */}
                    <TableCell className="text-sm">{record.language}</TableCell>

                    {/* Query */}
                    <TableCell className="text-sm">{record.query}</TableCell>

                    {/* Region */}
                    <TableCell className="text-sm">{record.region}</TableCell>

                    {/* City */}
                    <TableCell className="text-sm">{record.city}</TableCell>

                    {/* Unit */}
                    <TableCell className="text-sm">{record.unit}</TableCell>

                    {/* Section */}
                    <TableCell className="text-sm">{record.section}</TableCell>

                    {/* Count */}
                    <TableCell className="text-sm">
                      {record.count === 0 || !record.count ? 1 : record.count}
                    </TableCell>

                    {/* Response */}
                    <TableCell className="text-sm">{record.response}</TableCell>

                    {/* Object */}
                    <TableCell className="max-w-[200px]">
                      {!record.object || record.object === "" ? (
                        <span className="text-sm text-muted-foreground">{getShortText(record.object, 50)}</span>
                      ) : !enableDecoding ? (
                        <span className="text-sm text-muted-foreground">***</span>
                      ) : (
                        <HoverCard>
                          <HoverCardTrigger asChild>
                            <span className="cursor-pointer text-sm text-primary hover:underline">
                              {getShortText(record.object, 50)}
                            </span>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-[580px] p-0" side="right" align="start">
                            <div className="flex flex-col gap-2 p-3">
                              {objResult && !objResult.isValid && (
                                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                                  <XCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  {objResult.error}
                                </div>
                              )}
                              <pre className="h-[380px] overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
                                {objResult?.formatted ?? record.object}
                              </pre>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      )}
                    </TableCell>

                    {/* Error text */}
                    <TableCell>
                      {record.errorText && record.errorText !== "" && (
                        <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                          <XCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="line-clamp-2">{record.errorText}</span>
                        </div>
                      )}
                    </TableCell>

                    {/* Is triggered */}
                    <TableCell>
                      {TRIGGERED_ACTIONS.includes(record.action ?? "") && (
                        <Switch checked={record.isTriggered ?? false} disabled />
                      )}
                    </TableCell>

                    {/* Action value */}
                    <TableCell className="text-sm">{record.action}</TableCell>

                    {/* Action buttons */}
                    <TableCell className="sticky right-0 bg-card text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => navigate(`/records/${record.owner}/${record.id}`)}
                            >
                              <EyeIcon className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{i18next.t("general:View")}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              disabled
                            >
                              <Trash2Icon className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{i18next.t("general:Delete")}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}
          </span>
          <div className="flex items-center gap-2">
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(v) => fetchRecords({ current: 1, pageSize: Number(v) })}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.current <= 1}
              onClick={() => fetchRecords({ current: pagination.current - 1 })}
            >
              {i18next.t("general:Previous")}
            </Button>
            <span className="px-2">
              {pagination.current} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.current >= totalPages}
              onClick={() => fetchRecords({ current: pagination.current + 1 })}
            >
              {i18next.t("general:Next")}
            </Button>
          </div>
        </div>
      )}

      {/* Bulk delete dialog */}
      <AlertDialog open={bulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18next.t("general:Sure to delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {selected.length} {i18next.t("general:items")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkDeleteOpen(false)}>
              {i18next.t("general:Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleBulkDelete}>
              {i18next.t("general:OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

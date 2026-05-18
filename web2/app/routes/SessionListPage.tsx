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

import { useCallback, useEffect, useState } from "react"
import { Loader2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { isAdminUser } from "~/backend/AccountBackend"
import { getSessions, deleteSession, type Session } from "~/backend/SessionBackend"
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
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
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
  return [{ title: "Sessions - OpenAgent" }]
}

type SortOrder = "ascend" | "descend" | ""
type Pagination = { current: number; pageSize: number; total: number }

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 1000, 10000, 100000]

function getFormattedDate(date?: string | null): string {
  if (!date) return ""
  return date.replace("T", " ").replace("+08:00", " ").trim()
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

export default function SessionListPage() {
  const { account } = useAccount()

  const [sessions, setSessions] = useState<Session[]>([])
  const [pagination, setPagination] = useState<Pagination>({ current: 1, pageSize: 10, total: 0 })
  const [loading, setLoading] = useState(false)
  const [sortField, setSortField] = useState("")
  const [sortOrder, setSortOrder] = useState<SortOrder>("")
  const [searchField, setSearchField] = useState("name")
  const [searchValue, setSearchValue] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const isAdmin = isAdminUser(account)

  const fetchSessions = useCallback(
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
      const sf = params.sortField ?? sortField
      const so = params.sortOrder ?? sortOrder
      const field = params.field ?? searchField
      const value = params.value ?? searchValue
      const owner = account.owner ?? "admin"
      setLoading(true)
      getSessions(owner, current, pageSize, field, value, sf, so)
        .then((res) => {
          setLoading(false)
          if (res.status === "ok") {
            setSessions(res.data ?? [])
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
    fetchSessions({ current: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.name])

  function handleDelete(session: Session) {
    deleteSession(session)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully deleted"))
          setSessions((prev) => prev.filter((s) => s.name !== session.name || s.owner !== session.owner))
          setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }))
        } else {
          toast.error(`${i18next.t("general:Failed to delete")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
    setDeleteTarget(null)
  }

  async function handleBulkDelete() {
    const targets = sessions.filter((s) => selected.includes(`${s.owner}/${s.name}`))
    for (const session of targets) {
      const res = await deleteSession(session)
      if (res.status !== "ok") {
        toast.error(`${i18next.t("general:Failed to delete")}: ${session.name}: ${res.msg}`)
        setBulkDeleteOpen(false)
        return
      }
    }
    toast.success(i18next.t("general:Successfully deleted"))
    setSessions((prev) => prev.filter((s) => !targets.some((t) => t.name === s.name && t.owner === s.owner)))
    setPagination((p) => ({ ...p, total: Math.max(0, p.total - targets.length) }))
    setSelected([])
    setBulkDeleteOpen(false)
  }

  function applySearch() {
    fetchSessions({ current: 1, field: searchField, value: searchValue })
  }

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:Sessions")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={searchField} onValueChange={(v) => setSearchField(v ?? "name")}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">{i18next.t("general:Name")}</SelectItem>
              <SelectItem value="owner">{i18next.t("general:Organization")}</SelectItem>
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
          {selected.length > 0 && isAdmin && (
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
                  checked={sessions.length > 0 && selected.length === sessions.length}
                  onCheckedChange={(checked) =>
                    setSelected(checked ? sessions.map((s) => `${s.owner}/${s.name}`) : [])
                  }
                />
              </TableHead>
              <TableHead className="w-36">{i18next.t("general:Name")}</TableHead>
              <TableHead className="w-28">{i18next.t("general:Organization")}</TableHead>
              <TableHead className="w-44">{i18next.t("general:Created time")}</TableHead>
              <TableHead>{i18next.t("general:ID")}</TableHead>
              <TableHead className="w-24 text-right">{i18next.t("general:Action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    {i18next.t("general:Loading")}
                  </div>
                </TableCell>
              </TableRow>
            ) : sessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center text-muted-foreground">
                  {i18next.t("general:No data")}
                </TableCell>
              </TableRow>
            ) : (
              sessions.map((session) => {
                const key = `${session.owner}/${session.name}`
                return (
                  <TableRow key={key}>
                    {/* Checkbox */}
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(key)}
                        onCheckedChange={(checked) =>
                          setSelected((prev) =>
                            checked
                              ? [...prev, key]
                              : prev.filter((k) => k !== key)
                          )
                        }
                      />
                    </TableCell>

                    {/* Name */}
                    <TableCell className="text-sm">
                      <a
                        href={getUserProfileUrl(session.owner, session.name)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {session.name}
                      </a>
                    </TableCell>

                    {/* Organization */}
                    <TableCell className="text-sm">
                      <a
                        href={getOrganizationUrl(session.owner)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {session.owner}
                      </a>
                    </TableCell>

                    {/* Created time */}
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {getFormattedDate(session.createdTime)}
                    </TableCell>

                    {/* Session IDs */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(session.sessionId ?? []).map((id) => (
                          <Badge key={id} variant="secondary" className="font-mono text-xs">
                            {id}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>

                    {/* Action */}
                    <TableCell className="text-right">
                      {isAdmin && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(session)}
                            >
                              <Trash2Icon className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{i18next.t("general:Delete")}</TooltipContent>
                        </Tooltip>
                      )}
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
              onValueChange={(v) => fetchSessions({ current: 1, pageSize: Number(v) })}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.current <= 1}
              onClick={() => fetchSessions({ current: pagination.current - 1 })}
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
              onClick={() => fetchSessions({ current: pagination.current + 1 })}
            >
              {i18next.t("general:Next")}
            </Button>
          </div>
        </div>
      )}

      {/* Single delete dialog */}
      <AlertDialog open={!!deleteTarget}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18next.t("general:Sure to delete")}</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.name}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>
              {i18next.t("general:Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              {i18next.t("general:OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

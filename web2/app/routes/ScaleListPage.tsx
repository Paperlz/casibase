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

import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router"
import {
  EditIcon,
  Loader2Icon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { type Scale, getScales, addScale, deleteScale } from "~/backend/ScaleBackend"
import { useAccount } from "~/context/AccountContext"
import { Button } from "~/components/ui/button"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"

export function meta() {
  return [{ title: "Scales — OpenAgent" }]
}

type Pagination = { current: number; pageSize: number; total: number }
type SearchField = "owner" | "name" | "displayName" | "createdTime" | "state" | "text"
type SortOrder = "asc" | "desc" | ""

function formatDate(dateStr?: string): string {
  if (!dateStr) return "-"
  try {
    return new Date(dateStr).toLocaleString()
  } catch {
    return dateStr
  }
}

function getRandomName(): string {
  return Math.random().toString(36).slice(2, 8)
}

function truncateText(text: string, maxLen: number): string {
  if (!text) return ""
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text
}

export default function ScaleListPage() {
  const navigate = useNavigate()
  const { account } = useAccount()

  const [scales, setScales] = useState<Scale[]>([])
  const [pagination, setPagination] = useState<Pagination>({ current: 1, pageSize: 100, total: 0 })
  const [loading, setLoading] = useState(false)
  const [searchField, setSearchField] = useState<SearchField>("name")
  const [searchValue, setSearchValue] = useState("")
  const [sortField, setSortField] = useState("")
  const [sortOrder, setSortOrder] = useState<SortOrder>("")
  const [deleteTarget, setDeleteTarget] = useState<Scale | null>(null)
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  useEffect(() => {
    fetchScales(1, pagination.pageSize, "", "", "", "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function fetchScales(
    page: number,
    pageSize: number,
    field: string,
    value: string,
    sf: string,
    so: string
  ) {
    if (!account) return
    setLoading(true)
    getScales(account.name, String(page), String(pageSize), field, value, sf, so)
      .then((res) => {
        if (res.status === "ok") {
          setScales(res.data ?? [])
          setPagination((p) => ({ ...p, current: page, pageSize, total: res.data2 ?? (res.data ?? []).length }))
          setSelectedNames(new Set())
        } else {
          toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setLoading(false))
  }

  function handleSearch() {
    fetchScales(1, pagination.pageSize, searchField, searchValue, sortField, sortOrder)
  }

  function handleSort(field: string) {
    const newOrder: SortOrder =
      sortField === field ? (sortOrder === "asc" ? "desc" : sortOrder === "desc" ? "" : "asc") : "asc"
    const newField = newOrder === "" ? "" : field
    setSortField(newField)
    setSortOrder(newOrder)
    fetchScales(1, pagination.pageSize, searchField, searchValue, newField, newOrder)
  }

  function handleAdd() {
    if (!account) return
    const randomName = getRandomName()
    const scaleName = `scale_${randomName}`
    const newScale: Scale = {
      owner: account.name,
      name: scaleName,
      createdTime: new Date().toISOString(),
      displayName: `New Scale - ${scaleName}`,
      text: "",
      state: "Public",
    }
    addScale(newScale)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully added"))
          navigate(`/scales/${newScale.owner}/${newScale.name}`, { state: { isNewScale: true } })
        } else {
          toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
  }

  function handleDelete(scale: Scale) {
    deleteScale(scale)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully deleted"))
          setScales((prev) => prev.filter((s) => s.name !== scale.name))
          setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }))
          setSelectedNames((prev) => {
            const next = new Set(prev)
            next.delete(scale.name)
            return next
          })
        } else {
          toast.error(`${i18next.t("general:Failed to delete")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
    setDeleteTarget(null)
  }

  function handleBulkDelete() {
    const toDelete = scales.filter((s) => selectedNames.has(s.name))
    Promise.all(toDelete.map((s) => deleteScale(s)))
      .then(() => {
        toast.success(i18next.t("general:Successfully deleted"))
        const deletedNames = new Set(toDelete.map((s) => s.name))
        setScales((prev) => prev.filter((s) => !deletedNames.has(s.name)))
        setPagination((p) => ({ ...p, total: Math.max(0, p.total - toDelete.length) }))
        setSelectedNames(new Set())
      })
      .catch((err: Error) => toast.error(err.message))
    setBulkDeleteOpen(false)
  }

  function toggleSelect(name: string) {
    setSelectedNames((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function toggleSelectAll() {
    if (scales.every((s) => selectedNames.has(s.name)) && scales.length > 0) {
      setSelectedNames((prev) => {
        const next = new Set(prev)
        scales.forEach((s) => next.delete(s.name))
        return next
      })
    } else {
      setSelectedNames((prev) => {
        const next = new Set(prev)
        scales.forEach((s) => next.add(s.name))
        return next
      })
    }
  }

  const allSelected = scales.length > 0 && scales.every((s) => selectedNames.has(s.name))
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:Scales")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={searchField} onValueChange={(v) => setSearchField((v ?? "name") as SearchField)}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">{i18next.t("general:User")}</SelectItem>
              <SelectItem value="name">{i18next.t("general:Name")}</SelectItem>
              <SelectItem value="displayName">{i18next.t("general:Display name")}</SelectItem>
              <SelectItem value="createdTime">{i18next.t("general:Created time")}</SelectItem>
              <SelectItem value="state">{i18next.t("general:State")}</SelectItem>
              <SelectItem value="text">{i18next.t("general:Text")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-52 pl-8"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch() }}
            />
          </div>
          <Button size="sm" onClick={handleAdd}>
            {i18next.t("general:Add")}
          </Button>
          {selectedNames.size > 0 && (
            <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2Icon className="h-4 w-4" />
              {i18next.t("general:Delete")} ({selectedNames.size})
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
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 cursor-pointer accent-primary"
                />
              </TableHead>
              <TableHead
                className="w-24 cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort("owner")}
              >
                {i18next.t("general:User")}
                {sortField === "owner" && (sortOrder === "asc" ? " ↑" : sortOrder === "desc" ? " ↓" : "")}
              </TableHead>
              <TableHead
                className="w-44 cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort("name")}
              >
                {i18next.t("general:Name")}
                {sortField === "name" && (sortOrder === "asc" ? " ↑" : sortOrder === "desc" ? " ↓" : "")}
              </TableHead>
              <TableHead
                className="w-52 cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort("displayName")}
              >
                {i18next.t("general:Display name")}
                {sortField === "displayName" && (sortOrder === "asc" ? " ↑" : sortOrder === "desc" ? " ↓" : "")}
              </TableHead>
              <TableHead
                className="w-44 cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort("createdTime")}
              >
                {i18next.t("general:Created time")}
                {sortField === "createdTime" && (sortOrder === "asc" ? " ↑" : sortOrder === "desc" ? " ↓" : "")}
              </TableHead>
              <TableHead
                className="w-28 cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort("state")}
              >
                {i18next.t("general:State")}
                {sortField === "state" && (sortOrder === "asc" ? " ↑" : sortOrder === "desc" ? " ↓" : "")}
              </TableHead>
              <TableHead className="w-60">{i18next.t("general:Text")}</TableHead>
              <TableHead className="w-28 text-right">{i18next.t("general:Action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    {i18next.t("general:Loading")}
                  </div>
                </TableCell>
              </TableRow>
            ) : scales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-16 text-center text-muted-foreground">
                  {i18next.t("general:No data")}
                </TableCell>
              </TableRow>
            ) : (
              scales.map((scale) => {
                const isHidden = scale.state === "Hidden"
                return (
                  <TableRow key={`${scale.owner}/${scale.name}`}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedNames.has(scale.name)}
                        onChange={() => toggleSelect(scale.name)}
                        className="h-4 w-4 cursor-pointer accent-primary"
                      />
                    </TableCell>

                    {/* Owner */}
                    <TableCell className="text-sm">{scale.owner}</TableCell>

                    {/* Name */}
                    <TableCell>
                      <Link
                        to={`/scales/${scale.owner}/${scale.name}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {scale.name}
                      </Link>
                    </TableCell>

                    {/* Display name */}
                    <TableCell className="text-sm">{scale.displayName || "-"}</TableCell>

                    {/* Created time */}
                    <TableCell className="text-sm text-muted-foreground">{formatDate(scale.createdTime)}</TableCell>

                    {/* State */}
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          isHidden
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        }`}
                      >
                        {isHidden ? i18next.t("video:Hidden") : i18next.t("video:Public")}
                      </span>
                    </TableCell>

                    {/* Text (truncated) */}
                    <TableCell className="max-w-xs text-sm text-muted-foreground">
                      {scale.text ? truncateText(scale.text, 80) : "-"}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={i18next.t("general:Edit")}
                          onClick={() => navigate(`/scales/${scale.owner}/${scale.name}`)}
                        >
                          <EditIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title={i18next.t("general:Delete")}
                          onClick={() => setDeleteTarget(scale)}
                        >
                          <Trash2Icon className="h-3.5 w-3.5" />
                        </Button>
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
          <span>{i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}</span>
          <div className="flex items-center gap-2">
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(v) => {
                const size = Number(v ?? "100")
                setPagination((p) => ({ ...p, current: 1, pageSize: size }))
                fetchScales(1, size, searchField, searchValue, sortField, sortOrder)
              }}
            >
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["10", "20", "50", "100", "1000", "10000"].map((n) => (
                  <SelectItem key={n} value={n}>{n} / {i18next.t("general:Page")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.current <= 1}
              onClick={() => {
                const page = pagination.current - 1
                fetchScales(page, pagination.pageSize, searchField, searchValue, sortField, sortOrder)
              }}
            >
              {i18next.t("general:Previous")}
            </Button>
            <span className="px-2 text-sm">{pagination.current} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.current >= totalPages}
              onClick={() => {
                const page = pagination.current + 1
                fetchScales(page, pagination.pageSize, searchField, searchValue, sortField, sortOrder)
              }}
            >
              {i18next.t("general:Next")}
            </Button>
          </div>
        </div>
      )}

      {/* Delete single */}
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

      {/* Bulk delete */}
      <AlertDialog open={bulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {i18next.t("general:Sure to delete")}: {selectedNames.size} {i18next.t("general:items")}
            </AlertDialogTitle>
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

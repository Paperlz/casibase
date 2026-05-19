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

import { useEffect, useRef, useState } from "react"
import {
  ClipboardCopyIcon,
  Loader2Icon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import {
  type Resource,
  getGlobalResources,
  deleteResource,
  uploadResource,
} from "~/backend/ResourceBackend"
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
  return [{ title: "Resources — OpenAgent" }]
}

type Pagination = { current: number; pageSize: number; total: number }
type SearchField = "name" | "user" | "category" | "fileName" | "fileType" | "fileFormat"
type SortOrder = "asc" | "desc" | ""

const errorImageBase64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAABsUlEQVR4nO2YMU7DQBBF3yZBpEiBkCiRuAMHoOICHICSE3ABTkBJSZMTUFBRIlFR0iSioCQoSiQKJCQkJASkhIQEJCT+j2UlG8c7u97xrmTpSaPxzp+Z3Z21QBAEQRCEf4MxZhmoBXjvR+5+BVSAp5ltABVg58/qwIl374CXQH2wAXqgAXqAlS3qAXqAlS3qAXqABbqKxQbHp63z+yCO2c6AFdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBKkDHdBVbDc4Pm2dT7LLBH8Bvr4rqP5qiGIAAAAASUVORK5CYII="

function getCategoryBadgeClass(category?: string): string {
  if (category === "avatar") return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
  if (category === "chat") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
  if (category === "document") return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
  return "bg-muted text-muted-foreground"
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "-"
  try {
    return new Date(dateStr).toLocaleString()
  } catch {
    return dateStr
  }
}

function getFriendlyFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return "-"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export default function ResourceListPage() {
  const { account } = useAccount()

  const [resources, setResources] = useState<Resource[]>([])
  const [pagination, setPagination] = useState<Pagination>({ current: 1, pageSize: 100, total: 0 })
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [searchField, setSearchField] = useState<SearchField>("name")
  const [searchValue, setSearchValue] = useState("")
  const [sortField, setSortField] = useState("")
  const [sortOrder, setSortOrder] = useState<SortOrder>("")
  const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null)
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const fetchParamsRef = useRef({ current: 1, pageSize: 100, field: "", value: "", sortField: "", sortOrder: "" })

  useEffect(() => {
    fetchResources(1, pagination.pageSize, "", "", "", "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function fetchResources(
    page: number,
    pageSize: number,
    field: string,
    value: string,
    sf: string,
    so: string
  ) {
    setLoading(true)
    fetchParamsRef.current = { current: page, pageSize, field, value, sortField: sf, sortOrder: so }
    getGlobalResources("", String(page), String(pageSize), field, value, sf, so)
      .then((res) => {
        if (res.status === "ok") {
          setResources(res.data ?? [])
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
    fetchResources(1, pagination.pageSize, searchField, searchValue, sortField, sortOrder)
  }

  function handleSort(field: string) {
    const newOrder: SortOrder =
      sortField === field ? (sortOrder === "asc" ? "desc" : sortOrder === "desc" ? "" : "asc") : "asc"
    const newField = newOrder === "" ? "" : field
    setSortField(newField)
    setSortOrder(newOrder)
    fetchResources(1, pagination.pageSize, searchField, searchValue, newField, newOrder)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !account) return
    e.target.value = ""
    setUploading(true)
    uploadResource(account.name, "avatar", "", "", file)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully uploaded"))
          const { current, pageSize } = fetchParamsRef.current
          fetchResources(current, pageSize, fetchParamsRef.current.field, fetchParamsRef.current.value, fetchParamsRef.current.sortField, fetchParamsRef.current.sortOrder)
        } else {
          toast.error(res.msg)
        }
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setUploading(false))
  }

  function handleDelete(resource: Resource) {
    deleteResource(resource)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully deleted"))
          const newTotal = Math.max(0, pagination.total - 1)
          const newPage =
            pagination.current > 1 && resources.length === 1
              ? pagination.current - 1
              : pagination.current
          fetchResources(newPage, pagination.pageSize, fetchParamsRef.current.field, fetchParamsRef.current.value, fetchParamsRef.current.sortField, fetchParamsRef.current.sortOrder)
          setPagination((p) => ({ ...p, total: newTotal }))
          setSelectedNames((prev) => {
            const next = new Set(prev)
            next.delete(resource.name)
            return next
          })
        } else {
          toast.error(`${i18next.t("general:Failed to delete")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(`${i18next.t("general:Failed to connect to server")}: ${err.message}`))
    setDeleteTarget(null)
  }

  function handleBulkDelete() {
    const toDelete = resources.filter((r) => selectedNames.has(r.name))
    Promise.all(toDelete.map((r) => deleteResource(r)))
      .then(() => {
        toast.success(i18next.t("general:Successfully deleted"))
        const { current, pageSize, field, value, sortField: sf, sortOrder: so } = fetchParamsRef.current
        fetchResources(current, pageSize, field, value, sf, so)
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
    if (resources.every((r) => selectedNames.has(r.name)) && resources.length > 0) {
      setSelectedNames((prev) => {
        const next = new Set(prev)
        resources.forEach((r) => next.delete(r.name))
        return next
      })
    } else {
      setSelectedNames((prev) => {
        const next = new Set(prev)
        resources.forEach((r) => next.add(r.name))
        return next
      })
    }
  }

  const allSelected = resources.length > 0 && resources.every((r) => selectedNames.has(r.name))
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))

  const colCount = 11

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:Resources")}</h1>
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
              <SelectItem value="name">{i18next.t("general:Name")}</SelectItem>
              <SelectItem value="user">{i18next.t("general:User")}</SelectItem>
              <SelectItem value="category">{i18next.t("general:Category")}</SelectItem>
              <SelectItem value="fileName">{i18next.t("store:File name")}</SelectItem>
              <SelectItem value="fileType">{i18next.t("general:Type")}</SelectItem>
              <SelectItem value="fileFormat">{i18next.t("resource:Format")}</SelectItem>
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
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <UploadIcon className="h-4 w-4" />
            )}
            {i18next.t("resource:Upload a file...")}
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
                className="w-44 cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort("name")}
              >
                {i18next.t("general:Name")}
                {sortField === "name" && (sortOrder === "asc" ? " ↑" : sortOrder === "desc" ? " ↓" : "")}
              </TableHead>
              <TableHead
                className="w-40 cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort("createdTime")}
              >
                {i18next.t("general:Created time")}
                {sortField === "createdTime" && (sortOrder === "asc" ? " ↑" : sortOrder === "desc" ? " ↓" : "")}
              </TableHead>
              <TableHead
                className="w-28 cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort("user")}
              >
                {i18next.t("general:User")}
                {sortField === "user" && (sortOrder === "asc" ? " ↑" : sortOrder === "desc" ? " ↓" : "")}
              </TableHead>
              <TableHead
                className="w-28 cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort("category")}
              >
                {i18next.t("general:Category")}
                {sortField === "category" && (sortOrder === "asc" ? " ↑" : sortOrder === "desc" ? " ↓" : "")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort("fileName")}
              >
                {i18next.t("store:File name")}
                {sortField === "fileName" && (sortOrder === "asc" ? " ↑" : sortOrder === "desc" ? " ↓" : "")}
              </TableHead>
              <TableHead
                className="w-24 cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort("fileType")}
              >
                {i18next.t("general:Type")}
                {sortField === "fileType" && (sortOrder === "asc" ? " ↑" : sortOrder === "desc" ? " ↓" : "")}
              </TableHead>
              <TableHead
                className="w-20 cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort("fileFormat")}
              >
                {i18next.t("resource:Format")}
                {sortField === "fileFormat" && (sortOrder === "asc" ? " ↑" : sortOrder === "desc" ? " ↓" : "")}
              </TableHead>
              <TableHead
                className="w-24 cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort("fileSize")}
              >
                {i18next.t("store:File size")}
                {sortField === "fileSize" && (sortOrder === "asc" ? " ↑" : sortOrder === "desc" ? " ↓" : "")}
              </TableHead>
              <TableHead className="w-28">{i18next.t("general:Preview")}</TableHead>
              <TableHead className="w-28">{i18next.t("general:URL")}</TableHead>
              <TableHead className="w-20 text-right">{i18next.t("general:Action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={colCount + 1} className="py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    {i18next.t("general:Loading")}
                  </div>
                </TableCell>
              </TableRow>
            ) : resources.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount + 1} className="py-16 text-center text-muted-foreground">
                  {i18next.t("general:No data")}
                </TableCell>
              </TableRow>
            ) : (
              resources.map((resource) => (
                <TableRow key={resource.name}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedNames.has(resource.name)}
                      onChange={() => toggleSelect(resource.name)}
                      className="h-4 w-4 cursor-pointer accent-primary"
                    />
                  </TableCell>

                  {/* Name */}
                  <TableCell className="text-sm font-medium">{resource.name}</TableCell>

                  {/* Created time */}
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(resource.createdTime)}
                  </TableCell>

                  {/* User */}
                  <TableCell className="text-sm">{resource.user || "-"}</TableCell>

                  {/* Category */}
                  <TableCell>
                    {resource.category ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getCategoryBadgeClass(resource.category)}`}
                      >
                        {resource.category}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* File name */}
                  <TableCell className="max-w-[200px] truncate text-sm" title={resource.fileName}>
                    {resource.fileName || "-"}
                  </TableCell>

                  {/* File type */}
                  <TableCell className="text-sm">{resource.fileType || "-"}</TableCell>

                  {/* File format */}
                  <TableCell className="text-sm">{resource.fileFormat || "-"}</TableCell>

                  {/* File size */}
                  <TableCell className="text-sm text-muted-foreground">
                    {getFriendlyFileSize(resource.fileSize)}
                  </TableCell>

                  {/* Preview */}
                  <TableCell>
                    {resource.url ? (
                      resource.fileType === "image" ? (
                        <img
                          src={resource.url}
                          alt={resource.fileName}
                          className="h-12 w-16 rounded object-cover"
                          onError={(e) => {
                            ;(e.target as HTMLImageElement).src = errorImageBase64
                          }}
                        />
                      ) : resource.fileType === "video" ? (
                        <video className="h-12 w-16 rounded" controls>
                          <source src={resource.url} type="video/mp4" />
                        </video>
                      ) : null
                    ) : null}
                  </TableCell>

                  {/* URL — copy link button */}
                  <TableCell>
                    {resource.url ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(resource.url!)
                            .then(() => toast.success(i18next.t("general:Copied to clipboard successfully")))
                            .catch(() => toast.error(i18next.t("general:Failed to save")))
                        }}
                      >
                        <ClipboardCopyIcon className="h-3.5 w-3.5" />
                        {i18next.t("general:Copy Link")}
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* Action */}
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title={i18next.t("general:Delete")}
                      onClick={() => setDeleteTarget(resource)}
                    >
                      <Trash2Icon className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
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
                fetchResources(1, size, searchField, searchValue, sortField, sortOrder)
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
                fetchResources(page, pagination.pageSize, searchField, searchValue, sortField, sortOrder)
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
                fetchResources(page, pagination.pageSize, searchField, searchValue, sortField, sortOrder)
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

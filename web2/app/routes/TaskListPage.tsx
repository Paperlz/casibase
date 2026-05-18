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
import { Link, useNavigate } from "react-router"
import {
  EditIcon,
  FileTextIcon,
  FileCodeIcon,
  Loader2Icon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { type Task, getTasks, addTask, deleteTask } from "~/backend/TaskBackend"
import { getPublicScales, type Scale } from "~/backend/ScaleBackend"
import { getProviders, getProviderDisplayName, getProviderLogoUrl, type Provider } from "~/backend/ProviderBackend"
import { isAdminUser } from "~/backend/AccountBackend"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import TaskAnalysisReport from "~/components/TaskAnalysisReport"

export function meta() {
  return [{ title: "Tasks — OpenAgent" }]
}

type Pagination = { current: number; pageSize: number; total: number }
type SearchField = "owner" | "name" | "displayName" | "provider" | "type" | "scale" | "documentUrl" | "example"
type SortOrder = "asc" | "desc" | ""

function formatDate(dateStr?: string): string {
  if (!dateStr) return "-"
  try {
    return new Date(dateStr).toLocaleString()
  } catch {
    return dateStr
  }
}

function formatScoreNumber(score: any): string {
  const n = Number(score)
  if (!Number.isFinite(n)) return ""
  if (Number.isInteger(n)) return String(n)
  return String(Math.round(n * 100) / 100)
}

function getScoreColorClass(score: any): string {
  const n = Number(score)
  if (!Number.isFinite(n)) return "bg-muted text-muted-foreground"
  if (n >= 80) return "bg-green-500 text-white"
  if (n >= 60) return "bg-yellow-500 text-white"
  return "bg-red-500 text-white"
}

function parseResult(result: any): any | null {
  if (!result) return null
  if (typeof result === "object") return result
  try {
    return JSON.parse(result)
  } catch {
    return null
  }
}

function getNextTaskIndex(tasks: Task[], username: string): number {
  const prefix = `task_${username}_`
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{3})$`)
  let maxNum = 0
  tasks.forEach((task) => {
    if (task.owner !== username || !task.name?.startsWith(prefix)) return
    const m = task.name.match(re)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > maxNum) maxNum = n
    }
  })
  return Math.min(999, maxNum + 1)
}

export default function TaskListPage() {
  const navigate = useNavigate()
  const { account } = useAccount()
  const isAdmin = isAdminUser(account)

  const [tasks, setTasks] = useState<Task[]>([])
  const [pagination, setPagination] = useState<Pagination>({ current: 1, pageSize: 100, total: 0 })
  const [loading, setLoading] = useState(false)
  const [searchField, setSearchField] = useState<SearchField>("name")
  const [searchValue, setSearchValue] = useState("")
  const [sortField, setSortField] = useState("")
  const [sortOrder, setSortOrder] = useState<SortOrder>("")
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [modelProviders, setModelProviders] = useState<Provider[]>([])
  const [publicScales, setPublicScales] = useState<Scale[]>([])

  const fetchParamsRef = useRef({ current: 1, pageSize: 100, field: "", value: "", sortField: "", sortOrder: "" })

  useEffect(() => {
    fetchTasks(1, pagination.pageSize, "", "", "", "")
    getPublicScales().then((res) => {
      if (res.status === "ok" && res.data) setPublicScales(res.data)
    })
    if (isAdmin && account) {
      getProviders(account.name).then((res) => {
        if (res.status === "ok" && res.data) {
          setModelProviders((res.data as Provider[]).filter((p) => p.category === "Model"))
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function fetchTasks(
    page: number,
    pageSize: number,
    field: string,
    value: string,
    sf: string,
    so: string
  ) {
    if (!account) return
    setLoading(true)
    fetchParamsRef.current = { current: page, pageSize, field, value, sortField: sf, sortOrder: so }
    getTasks(account.name, String(page), String(pageSize), field, value, sf, so)
      .then((res) => {
        if (res.status === "ok") {
          setTasks(res.data ?? [])
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
    fetchTasks(1, pagination.pageSize, searchField, searchValue, sortField, sortOrder)
  }

  function handleSort(field: string) {
    const newOrder: SortOrder =
      sortField === field ? (sortOrder === "asc" ? "desc" : sortOrder === "desc" ? "" : "asc") : "asc"
    const newField = newOrder === "" ? "" : field
    setSortField(newField)
    setSortOrder(newOrder)
    fetchTasks(1, pagination.pageSize, searchField, searchValue, newField, newOrder)
  }

  function handleAdd() {
    if (!account) return
    const username = account.name
    const nextIndex = String(getNextTaskIndex(tasks, username)).padStart(3, "0")
    const taskName = `task_${username}_${nextIndex}`
    const newTask: Task = {
      owner: username,
      name: taskName,
      createdTime: new Date().toISOString(),
      displayName: `New Task - ${taskName}`,
      provider: "provider_model_azure_gpt4",
      type: "PBL",
      path: "F:/github_repos/casdoor-website",
      scale: "",
      example: "",
      labels: [],
      log: "",
    }
    addTask(newTask)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully added"))
          navigate(`/tasks/${newTask.owner}/${newTask.name}`, { state: { isNewTask: true } })
        } else {
          toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
  }

  function handleDelete(task: Task) {
    deleteTask(task)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully deleted"))
          setTasks((prev) => prev.filter((t) => t.name !== task.name))
          setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }))
          setSelectedNames((prev) => {
            const next = new Set(prev)
            next.delete(task.name)
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
    const toDelete = tasks.filter((t) => selectedNames.has(t.name))
    Promise.all(toDelete.map((t) => deleteTask(t)))
      .then(() => {
        toast.success(i18next.t("general:Successfully deleted"))
        const deletedNames = new Set(toDelete.map((t) => t.name))
        setTasks((prev) => prev.filter((t) => !deletedNames.has(t.name)))
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
    if (tasks.every((t) => selectedNames.has(t.name)) && tasks.length > 0) {
      setSelectedNames((prev) => {
        const next = new Set(prev)
        tasks.forEach((t) => next.delete(t.name))
        return next
      })
    } else {
      setSelectedNames((prev) => {
        const next = new Set(prev)
        tasks.forEach((t) => next.add(t.name))
        return next
      })
    }
  }

  function getScalePreviewText(scale?: string): string {
    if (!scale || !publicScales.length) return ""
    const s = publicScales.find((x) => `${x.owner}/${x.name}` === scale)
    return s?.text || ""
  }

  function getProviderInfo(name?: string): Provider | undefined {
    return modelProviders.find((p) => p.name === name)
  }

  const allSelected = tasks.length > 0 && tasks.every((t) => selectedNames.has(t.name))
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:Tasks")}</h1>
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
              {isAdmin && <SelectItem value="displayName">{i18next.t("general:Display name")}</SelectItem>}
              {isAdmin && <SelectItem value="provider">{i18next.t("provider:Model provider")}</SelectItem>}
              {isAdmin && <SelectItem value="type">{i18next.t("general:Type")}</SelectItem>}
              {isAdmin && <SelectItem value="scale">{i18next.t("task:Scale")}</SelectItem>}
              <SelectItem value="documentUrl">{i18next.t("store:File")}</SelectItem>
              <SelectItem value="example">{i18next.t("task:Example")}</SelectItem>
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
                className="w-44 cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort("createdTime")}
              >
                {i18next.t("general:Created time")}
                {sortField === "createdTime" && (sortOrder === "asc" ? " ↑" : sortOrder === "desc" ? " ↓" : "")}
              </TableHead>
              {isAdmin && <TableHead className="w-48">{i18next.t("provider:Model provider")}</TableHead>}
              {isAdmin && <TableHead className="w-24">{i18next.t("general:Type")}</TableHead>}
              {isAdmin && <TableHead className="w-44">{i18next.t("task:Scale")}</TableHead>}
              <TableHead className="w-40">{i18next.t("store:File")}</TableHead>
              <TableHead className="w-24">{i18next.t("task:Report")}</TableHead>
              <TableHead className="w-28 text-right">{i18next.t("general:Action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 10 : 7} className="py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    {i18next.t("general:Loading")}
                  </div>
                </TableCell>
              </TableRow>
            ) : tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 10 : 7} className="py-16 text-center text-muted-foreground">
                  {i18next.t("general:No data")}
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => {
                const provider = getProviderInfo(task.provider)
                const scalePreview = getScalePreviewText(task.scale)
                const parsed = parseResult(task.result)
                const scoreLabel = formatScoreNumber(task.score)
                const isPdf = task.documentUrl?.endsWith(".pdf")
                const fileName = task.documentUrl
                  ? task.documentUrl.split("/").filter(Boolean).pop() || task.documentUrl
                  : null

                return (
                  <TableRow key={task.name}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedNames.has(task.name)}
                        onChange={() => toggleSelect(task.name)}
                        className="h-4 w-4 cursor-pointer accent-primary"
                      />
                    </TableCell>

                    {/* Owner */}
                    <TableCell className="text-sm">{task.owner}</TableCell>

                    {/* Name */}
                    <TableCell>
                      <Link
                        to={`/tasks/${task.owner}/${task.name}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {task.name}
                      </Link>
                    </TableCell>

                    {/* Created time */}
                    <TableCell className="text-sm text-muted-foreground">{formatDate(task.createdTime)}</TableCell>

                    {/* Provider (admin only) */}
                    {isAdmin && (
                      <TableCell>
                        {task.provider ? (
                          <div className="flex items-center gap-2">
                            {provider && (
                              <img
                                src={getProviderLogoUrl(provider)}
                                alt=""
                                className="h-5 w-5 shrink-0 rounded object-contain"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                              />
                            )}
                            <Link
                              to={`/providers/${task.provider}`}
                              className="text-sm text-primary hover:underline"
                            >
                              {provider ? getProviderDisplayName(provider) : task.provider}
                            </Link>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}

                    {/* Type (admin only) */}
                    {isAdmin && (
                      <TableCell className="text-sm">{task.type || "-"}</TableCell>
                    )}

                    {/* Scale (admin only) */}
                    {isAdmin && (
                      <TableCell>
                        {task.scale ? (
                          scalePreview ? (
                            <Popover>
                              <PopoverTrigger className="cursor-pointer text-left">
                                <Link
                                  to={`/scales/${task.scale}`}
                                  className="text-sm text-primary hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {task.scale}
                                </Link>
                              </PopoverTrigger>
                              <PopoverContent side="left" className="w-[50vw] max-h-[50vh] overflow-auto p-3">
                                <textarea
                                  readOnly
                                  value={scalePreview}
                                  className="w-full min-h-[40vh] resize-none border-none bg-transparent font-mono text-xs text-foreground outline-none whitespace-pre-wrap"
                                />
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <Link
                              to={`/scales/${task.scale}`}
                              className="text-sm text-primary hover:underline"
                            >
                              {task.scale}
                            </Link>
                          )
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}

                    {/* Document file */}
                    <TableCell>
                      {task.documentUrl ? (
                        <a
                          href={task.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                        >
                          {isPdf ? (
                            <FileTextIcon className="h-4 w-4 shrink-0 text-red-600" />
                          ) : (
                            <FileCodeIcon className="h-4 w-4 shrink-0 text-blue-600" />
                          )}
                          <Tooltip>
                            <TooltipTrigger className="max-w-[120px] truncate">
                              {fileName}
                            </TooltipTrigger>
                            <TooltipContent>{fileName}</TooltipContent>
                          </Tooltip>
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    {/* Report / Score */}
                    <TableCell>
                      {parsed ? (
                        <Popover>
                          <PopoverTrigger className="cursor-pointer">
                            {scoreLabel ? (
                              <span
                                className={`inline-flex min-w-[40px] items-center justify-center rounded px-2 py-1 text-sm font-semibold ${getScoreColorClass(task.score)}`}
                              >
                                {scoreLabel}
                              </span>
                            ) : (
                              <span className="text-sm font-semibold text-primary hover:underline">
                                {parsed.score != null
                                  ? `${parsed.score}${i18next.t("task:Score Unit")}`
                                  : i18next.t("task:Report")}
                              </span>
                            )}
                          </PopoverTrigger>
                          <PopoverContent side="left" className="w-[50vw] max-h-[50vh] overflow-auto p-3">
                            <TaskAnalysisReport result={parsed} />
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={i18next.t("general:Edit")}
                          onClick={() => navigate(`/tasks/${task.owner}/${task.name}`)}
                        >
                          <EditIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title={i18next.t("general:Delete")}
                          onClick={() => setDeleteTarget(task)}
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
                fetchTasks(1, size, searchField, searchValue, sortField, sortOrder)
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
                fetchTasks(page, pagination.pageSize, searchField, searchValue, sortField, sortOrder)
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
                fetchTasks(page, pagination.pageSize, searchField, searchValue, sortField, sortOrder)
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

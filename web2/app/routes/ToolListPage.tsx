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
import { EditIcon, Loader2Icon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { addTool, deleteTool, getTools, type Tool } from "~/backend/ToolBackend"
import { getProviderLogoURL, getProviderTypeOptions, getToolFunctions } from "~/lib/ProviderSetting"
import { Badge } from "~/components/ui/badge"
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
import { Switch } from "~/components/ui/switch"

export function meta() {
  return [{ title: "Tools - OpenAgent" }]
}

type SortOrder = "ascend" | "descend" | ""
type Pagination = { current: number; pageSize: number; total: number }

function randomName() {
  return Math.random().toString(36).slice(2, 8)
}

function newTool(): Tool {
  const rand = randomName()
  return {
    owner: "admin",
    name: `tool_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: "",
    type: "time",
    subType: "Default",
    clientId: "",
    clientSecret: "",
    providerUrl: "",
    enableProxy: false,
    testContent: "",
    modelProvider: "",
    resultSummary: "",
    state: "Active",
  }
}

const TOOL_TYPES = getProviderTypeOptions("Tool") as Array<{ id: string; name: string }>

function getToolLogoUrl(type: string): string {
  return getProviderLogoURL({ category: "Tool", type }) || ""
}

export default function ToolListPage() {
  const navigate = useNavigate()
  const [tools, setTools] = useState<Tool[]>([])
  const [pagination, setPagination] = useState<Pagination>({ current: 1, pageSize: 10, total: 0 })
  const [loading, setLoading] = useState(false)
  const [sortField, setSortField] = useState("")
  const [sortOrder, setSortOrder] = useState<SortOrder>("")
  const [searchField, setSearchField] = useState("name")
  const [searchValue, setSearchValue] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [deleteTarget, setDeleteTarget] = useState<Tool | null>(null)

  const fetchTools = useCallback(
    (params: {
      current?: number
      pageSize?: number
      sortField?: string
      sortOrder?: SortOrder
      field?: string
      value?: string
    } = {}) => {
      const current = params.current ?? pagination.current
      const pageSize = params.pageSize ?? pagination.pageSize
      const sf = params.sortField ?? sortField
      const so = params.sortOrder ?? sortOrder
      const field = params.field ?? searchField
      const value = params.value ?? searchValue
      setLoading(true)
      getTools("admin", String(current), String(pageSize), field, value, sf, so)
        .then((res) => {
          if (res.status === "ok") {
            setTools(res.data ?? [])
            setPagination((p) => ({ ...p, current, pageSize, total: res.data2 ?? 0 }))
            setSortField(sf)
            setSortOrder(so)
            setSearchField(field)
            setSearchValue(value)
          } else {
            toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
          }
        })
        .catch((err: Error) => toast.error(err.message))
        .finally(() => setLoading(false))
    },
    [pagination, searchField, searchValue, sortField, sortOrder]
  )

  useEffect(() => {
    fetchTools({ current: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleAdd() {
    const tool = newTool()
    addTool(tool)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully added"))
          navigate(`/tools/${tool.name}`, { state: { isNewTool: true } })
        } else {
          toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
  }

  function handleDelete(tool: Tool) {
    deleteTool(tool)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully deleted"))
          setTools((prev) => prev.filter((t) => t.name !== tool.name))
          setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }))
        } else {
          toast.error(`${i18next.t("general:Failed to delete")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
    setDeleteTarget(null)
  }

  function handleSearch() {
    fetchTools({ current: 1, field: searchField, value: searchValue })
  }

  const filteredTools = typeFilter === "all"
    ? tools
    : tools.filter((t) => t.type === typeFilter)

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:Tools")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={searchField} onValueChange={(value) => setSearchField(value ?? "name")}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">{i18next.t("general:Name")}</SelectItem>
              <SelectItem value="subType">{i18next.t("provider:Sub type")}</SelectItem>
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
          <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value ?? "all")}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{i18next.t("store:All")}</SelectItem>
              {TOOL_TYPES.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAdd}>
            <PlusIcon className="h-4 w-4" />
            {i18next.t("general:Add")}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">{i18next.t("general:Name")}</TableHead>
              <TableHead className="w-44">{i18next.t("general:Type")}</TableHead>
              <TableHead className="w-36">{i18next.t("provider:Sub type")}</TableHead>
              <TableHead>{i18next.t("tool:Functions")}</TableHead>
              <TableHead className="w-32">{i18next.t("provider:Enable proxy")}</TableHead>
              <TableHead className="w-24">{i18next.t("general:State")}</TableHead>
              <TableHead className="w-28 text-right">{i18next.t("general:Action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    {i18next.t("general:Loading")}
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredTools.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                  {i18next.t("general:No data")}
                </TableCell>
              </TableRow>
            ) : (
              filteredTools.map((tool) => {
                const functions = getToolFunctions(tool)
                const showProxy = ["web_search", "web_fetch", "web_browser", "browser_use"].includes(tool.type)
                return (
                  <TableRow key={tool.name}>
                    <TableCell>
                      <Link
                        to={`/tools/${tool.name}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {tool.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {getToolLogoUrl(tool.type) && (
                          <img
                            src={getToolLogoUrl(tool.type)}
                            alt={tool.type}
                            className="h-5 w-5 object-contain"
                          />
                        )}
                        <span className="text-sm">{tool.type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{tool.subType}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {functions.map((f) => (
                          <Badge key={f.name} variant="outline" className="font-mono text-xs">
                            {f.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {showProxy ? (
                        <Switch checked={!!tool.enableProxy} disabled />
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tool.state === "Active" ? "default" : "destructive"}>
                        {tool.state === "Active" ? i18next.t("general:Active") : i18next.t("general:Inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={i18next.t("general:Edit")}
                          onClick={() => navigate(`/tools/${tool.name}`)}
                        >
                          <EditIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title={i18next.t("general:Delete")}
                          onClick={() => setDeleteTarget(tool)}
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

      {pagination.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}</span>
          <div className="flex items-center gap-2">
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(value) => fetchTools({ current: 1, pageSize: Number(value ?? "10") })}
            >
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["10", "20", "50", "100"].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={pagination.current <= 1} onClick={() => fetchTools({ current: pagination.current - 1 })}>
              {i18next.t("general:Previous")}
            </Button>
            <span className="px-2 text-sm">{pagination.current} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={pagination.current >= totalPages} onClick={() => fetchTools({ current: pagination.current + 1 })}>
              {i18next.t("general:Next")}
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18next.t("general:Sure to delete")}</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.name}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>{i18next.t("general:Cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              {i18next.t("general:OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

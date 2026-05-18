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
  EditIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PlusIcon,
  RadarIcon,
  SearchIcon,
  ShoppingBagIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import {
  addServer,
  deleteServer,
  getServers,
  syncIntranetServers,
  type ScannedServer,
  type ScanResult,
  type Server,
} from "~/backend/ServerBackend"
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"

export function meta() {
  return [{ title: "MCP Servers - OpenAgent" }]
}

type SortOrder = "ascend" | "descend" | ""
type Pagination = { current: number; pageSize: number; total: number }

function randomName() {
  return Math.random().toString(36).slice(2, 8)
}

function newServer(): Server {
  const rand = randomName()
  return {
    owner: "admin",
    name: `server_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: `New MCP Server - ${rand}`,
    testContent: "",
    isDefault: false,
  }
}

export default function ServerListPage() {
  const navigate = useNavigate()
  const [servers, setServers] = useState<Server[]>([])
  const [pagination, setPagination] = useState<Pagination>({ current: 1, pageSize: 10, total: 0 })
  const [loading, setLoading] = useState(false)
  const [sortField] = useState("")
  const [sortOrder] = useState<SortOrder>("")
  const [searchField, setSearchField] = useState("name")
  const [searchValue, setSearchValue] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null)

  // Scan server modal state
  const [showScanModal, setShowScanModal] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanCidr, setScanCidr] = useState("")
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanServers, setScanServers] = useState<ScannedServer[]>([])

  const fetchServers = useCallback(
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
      getServers("admin", String(current), String(pageSize), field, value, sf, so)
        .then((res) => {
          if (res.status === "ok") {
            setServers(res.data ?? [])
            setPagination((p) => ({ ...p, current, pageSize, total: res.data2 ?? 0 }))
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
    fetchServers({ current: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleAdd() {
    const server = newServer()
    addServer(server)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully added"))
          navigate(`/servers/${server.name}`, { state: { isNewServer: true } })
        } else {
          toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
  }

  function handleDelete(server: Server) {
    deleteServer(server)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully deleted"))
          setServers((prev) => prev.filter((s) => s.name !== server.name))
          setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }))
        } else {
          toast.error(`${i18next.t("general:Failed to delete")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
    setDeleteTarget(null)
  }

  function handleSearch() {
    fetchServers({ current: 1, field: searchField, value: searchValue })
  }

  function openScanModal() {
    setScanCidr("")
    setScanResult(null)
    setScanServers([])
    setShowScanModal(true)
  }

  function closeScanModal() {
    if (scanLoading) return
    setShowScanModal(false)
  }

  function submitScan() {
    const cidr = scanCidr.trim()
    if (!cidr) {
      toast.error(i18next.t("server:Please enter a CIDR"))
      return
    }
    setScanLoading(true)
    syncIntranetServers([cidr])
      .then((res) => {
        if (res.status === "ok") {
          const result: ScanResult = res.data ?? {}
          const found: ScannedServer[] = result.servers ?? []
          setScanResult(result)
          setScanServers(found)
          toast.success(`${i18next.t("general:Successfully got")}: ${found.length} server(s)`)
        } else {
          toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
        }
      })
      .catch((err: Error) =>
        toast.error(`${i18next.t("general:Failed to connect to server")}: ${err.message}`)
      )
      .finally(() => setScanLoading(false))
  }

  function addScannedServer(scanServer: ScannedServer) {
    const rand = randomName()
    const server: Server = {
      owner: "admin",
      name: `server_${rand}`,
      createdTime: new Date().toISOString(),
      displayName: `Scanned MCP ${scanServer.host}:${scanServer.port}`,
      url: scanServer.url,
      testContent: "",
      isDefault: false,
    }
    addServer(server)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully added"))
          fetchServers({ current: pagination.current })
        } else {
          toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        }
      })
      .catch((err: Error) =>
        toast.error(`${i18next.t("general:Failed to connect to server")}: ${err.message}`)
      )
  }

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:MCP Servers")}</h1>
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
              <SelectItem value="displayName">{i18next.t("general:Display name")}</SelectItem>
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
            <PlusIcon className="h-4 w-4" />
            {i18next.t("general:Add")}
          </Button>
          <Button size="sm" variant="outline" onClick={openScanModal}>
            <RadarIcon className="h-4 w-4" />
            {i18next.t("server:Scan server")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/server-store")}>
            <ShoppingBagIcon className="h-4 w-4" />
            {i18next.t("general:MCP Store")}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">{i18next.t("general:Name")}</TableHead>
              <TableHead>{i18next.t("general:Display name")}</TableHead>
              <TableHead className="w-28">{i18next.t("general:Tool")}</TableHead>
              <TableHead className="w-28 text-right">{i18next.t("general:Action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    {i18next.t("general:Loading")}
                  </div>
                </TableCell>
              </TableRow>
            ) : servers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-16 text-center text-muted-foreground">
                  {i18next.t("general:No data")}
                </TableCell>
              </TableRow>
            ) : (
              servers.map((server) => (
                <TableRow key={server.name}>
                  <TableCell>
                    <Link
                      to={`/servers/${server.name}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {server.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{server.displayName}</TableCell>
                  <TableCell className="text-sm">{server.tools ? server.tools.length : 0}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={i18next.t("general:Edit")}
                        onClick={() => navigate(`/servers/${server.name}`)}
                      >
                        <EditIcon className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title={i18next.t("general:Delete")}
                        onClick={() => setDeleteTarget(server)}
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
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
              onValueChange={(value) => fetchServers({ current: 1, pageSize: Number(value ?? "10") })}
            >
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["10", "20", "50", "100"].map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.current <= 1}
              onClick={() => fetchServers({ current: pagination.current - 1 })}
            >
              {i18next.t("general:Previous")}
            </Button>
            <span className="px-2 text-sm">{pagination.current} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.current >= totalPages}
              onClick={() => fetchServers({ current: pagination.current + 1 })}
            >
              {i18next.t("general:Next")}
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
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

      {/* Scan Server Dialog */}
      <Dialog open={showScanModal} onOpenChange={(open) => { if (!open) closeScanModal() }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{i18next.t("server:Scan server")}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Input
              placeholder={i18next.t("server:CIDR placeholder")}
              value={scanCidr}
              onChange={(e) => {
                setScanCidr(e.target.value)
                setScanResult(null)
                setScanServers([])
              }}
            />

            {scanResult !== null && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  {i18next.t("server:Scanned hosts")}: {scanResult.scannedHosts ?? 0},{" "}
                  {i18next.t("server:Online hosts")}: {scanResult.onlineHosts?.length ?? 0},{" "}
                  {i18next.t("server:Found servers")}: {scanServers.length}
                </p>
                <div className="max-h-80 overflow-y-auto rounded-xl border border-border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-36">{i18next.t("general:Host")}</TableHead>
                        <TableHead className="w-24">{i18next.t("general:Port")}</TableHead>
                        <TableHead className="w-32">{i18next.t("general:Path")}</TableHead>
                        <TableHead>{i18next.t("general:URL")}</TableHead>
                        <TableHead className="w-24 text-right">{i18next.t("general:Action")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scanServers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                            {i18next.t("general:No data")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        scanServers.map((s, idx) => (
                          <TableRow key={`${s.url}-${idx}`}>
                            <TableCell className="text-sm">{s.host}</TableCell>
                            <TableCell className="text-sm">{s.port}</TableCell>
                            <TableCell className="text-sm">{s.path}</TableCell>
                            <TableCell className="text-sm">
                              {s.url ? (
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <span className="max-w-48 truncate">{s.url}</span>
                                  <ExternalLinkIcon className="h-3 w-3 shrink-0" />
                                </a>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                onClick={() => addScannedServer(s)}
                              >
                                {i18next.t("general:Add")}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeScanModal} disabled={scanLoading}>
              {i18next.t("general:Cancel")}
            </Button>
            <Button onClick={submitScan} disabled={scanLoading}>
              {scanLoading && <Loader2Icon className="h-4 w-4 animate-spin" />}
              {i18next.t("general:Sync")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

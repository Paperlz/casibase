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
import { EditIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { isLocalAdminUser } from "~/backend/AccountBackend"
import { type Site, addSite, deleteSite, getGlobalSites } from "~/backend/SiteBackend"
import { useAccount } from "~/context/AccountContext"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"

export function meta() {
  return [{ title: "Sites — OpenAgent" }]
}

function newSite(ownerName: string): Site {
  const rand = Math.random().toString(36).slice(2, 8)
  return {
    owner: ownerName,
    name: `site_${rand}`,
    displayName: `New Site - ${rand}`,
    createdTime: new Date().toISOString(),
    themeColor: "#1890ff",
    htmlTitle: "",
    faviconUrl: "",
    logoUrl: "",
    footerHtml: "",
    navItems: [],
  }
}

function formatDate(iso: string): string {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function SiteListPage() {
  const navigate = useNavigate()
  const { account } = useAccount()
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null)

  const isAdmin = isLocalAdminUser(account)

  useEffect(() => {
    setLoading(true)
    getGlobalSites()
      .then((res) => {
        setLoading(false)
        if (res.status === "ok") {
          setSites(res.data ?? [])
        } else {
          toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => {
        setLoading(false)
        toast.error(err.message)
      })
  }, [])

  function handleAdd() {
    if (!account) return
    const s = newSite(account.name)
    addSite(s)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully added"))
          navigate(`/sites/${s.owner}/${s.name}`)
        } else {
          toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
  }

  function handleDelete(site: Site) {
    deleteSite(site)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully deleted"))
          setSites((prev) => prev.filter((s) => s.name !== site.name))
        } else {
          toast.error(`${i18next.t("general:Failed to delete")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
    setDeleteTarget(null)
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:Sites")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {i18next.t("general:{total} in total").replace("{total}", String(sites.length))}
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" disabled onClick={handleAdd}>
            <PlusIcon className="h-4 w-4" />
            {i18next.t("general:Add")}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">{i18next.t("general:Name")}</TableHead>
              <TableHead>{i18next.t("general:Display name")}</TableHead>
              <TableHead className="w-36">{i18next.t("store:Theme color")}</TableHead>
              <TableHead className="w-44">{i18next.t("general:Created time")}</TableHead>
              <TableHead className="w-24 text-right">{i18next.t("general:Action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    {i18next.t("general:Loading")}
                  </div>
                </TableCell>
              </TableRow>
            ) : sites.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center text-muted-foreground">
                  {i18next.t("general:No data")}
                </TableCell>
              </TableRow>
            ) : (
              sites.map((site) => (
                <TableRow key={site.name}>
                  <TableCell>
                    <Link
                      to={`/sites/${site.owner}/${site.name}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {site.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{site.displayName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm">
                      {site.themeColor && (
                        <span
                          className="inline-block h-4 w-4 shrink-0 rounded border border-border"
                          style={{ backgroundColor: site.themeColor }}
                        />
                      )}
                      {site.themeColor || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(site.createdTime)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isAdmin && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={i18next.t("general:Edit")}
                            onClick={() => navigate(`/sites/${site.owner}/${site.name}`)}
                          >
                            <EditIcon className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title={i18next.t("general:Delete")}
                            disabled={site.name === "site-built-in"}
                            onClick={() => setDeleteTarget(site)}
                          >
                            <Trash2Icon className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { EditIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { isLocalAdminUser } from "~/backend/AccountBackend"
import { addPipe, deletePipe, getPipes, type Pipe } from "~/backend/PipeBackend"
import { useAccount } from "~/context/AccountContext"
import { getPipeTypeOptions, getProviderLogoURL } from "~/lib/ProviderSetting"
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
import { Switch } from "~/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"

export function meta() {
  return [{ title: "Pipes - OpenAgent" }]
}

type Pagination = { current: number; pageSize: number; total: number }

function randomName() {
  return Math.random().toString(36).slice(2, 8)
}

function newPipe(): Pipe {
  const rand = randomName()
  return {
    owner: "admin",
    name: `pipe_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: `New Pipe - ${rand}`,
    type: "Telegram",
    token: "",
    secretKey: "",
    store: "store-built-in",
    domain: "",
    isDefault: false,
    state: "Active",
  }
}

function PipeTypeCell({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img
        src={getProviderLogoURL({ category: "Chat", type })}
        alt={type}
        className="h-5 w-5 object-contain"
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).src = "https://cdn.openagentai.org/img/social_default.png"
        }}
      />
      <span>{type}</span>
    </span>
  )
}

export default function PipeListPage() {
  const navigate = useNavigate()
  const { account } = useAccount()
  const [pipes, setPipes] = useState<Pipe[]>([])
  const [pagination, setPagination] = useState<Pagination>({ current: 1, pageSize: 10, total: 0 })
  const [loading, setLoading] = useState(false)
  const [searchField, setSearchField] = useState("name")
  const [searchValue, setSearchValue] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Pipe | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const isAdmin = isLocalAdminUser(account)
  const typeOptions = getPipeTypeOptions()

  const fetchPipes = useCallback(() => {
    setLoading(true)
    getPipes("admin")
      .then((res) => {
        setLoading(false)
        if (res.status === "ok") {
          const data = res.data ?? []
          setPipes(data)
          setPagination((p) => ({ ...p, current: 1, total: data.length }))
          setSelected([])
        } else {
          toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => {
        setLoading(false)
        toast.error(err.message)
      })
  }, [])

  useEffect(() => {
    fetchPipes()
  }, [fetchPipes])

  const filteredPipes = useMemo(() => {
    const value = searchValue.trim().toLowerCase()
    if (!value) return pipes
    return pipes.filter((pipe) => String((pipe as any)[searchField] ?? "").toLowerCase().includes(value))
  }, [pipes, searchField, searchValue])

  const pagedPipes = useMemo(() => {
    const total = filteredPipes.length
    const maxPage = Math.max(1, Math.ceil(total / pagination.pageSize))
    const current = Math.min(pagination.current, maxPage)
    const start = (current - 1) * pagination.pageSize
    return filteredPipes.slice(start, start + pagination.pageSize)
  }, [filteredPipes, pagination.current, pagination.pageSize])

  useEffect(() => {
    setPagination((p) => ({ ...p, total: filteredPipes.length }))
  }, [filteredPipes.length])

  function handleAdd() {
    const pipe = newPipe()
    addPipe(pipe)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully added"))
          navigate(`/pipes/${pipe.name}`, { state: { isNewPipe: true } })
        } else {
          toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
  }

  function handleDelete(pipe: Pipe) {
    deletePipe(pipe)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully deleted"))
          setPipes((prev) => prev.filter((p) => p.name !== pipe.name))
        } else {
          toast.error(`${i18next.t("general:Failed to delete")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
    setDeleteTarget(null)
  }

  async function handleBulkDelete() {
    const targets = pipes.filter((p) => selected.includes(p.name))
    for (const pipe of targets) {
      const res = await deletePipe(pipe)
      if (res.status !== "ok") {
        toast.error(`${i18next.t("general:Failed to delete")}: ${pipe.name}: ${res.msg}`)
        setBulkDeleteOpen(false)
        return
      }
    }
    toast.success(i18next.t("general:Successfully deleted"))
    setPipes((prev) => prev.filter((p) => !targets.some((t) => t.name === p.name)))
    setSelected([])
    setBulkDeleteOpen(false)
  }

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:Pipes")}</h1>
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
              <SelectItem value="displayName">{i18next.t("general:Display name")}</SelectItem>
              <SelectItem value="type">{i18next.t("general:Type")}</SelectItem>
              <SelectItem value="domain">{i18next.t("provider:Domain")}</SelectItem>
              <SelectItem value="state">{i18next.t("general:State")}</SelectItem>
            </SelectContent>
          </Select>
          {searchField === "type" ? (
            <Select value={searchValue} onValueChange={(v) => setSearchValue(v ?? "")}>
              <SelectTrigger className="h-8 w-52">
                <SelectValue placeholder={i18next.t("general:Type")} />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="h-8 w-52"
              value={searchValue}
              onChange={(e) => {
                setSearchValue(e.target.value)
                setPagination((p) => ({ ...p, current: 1 }))
              }}
            />
          )}
          {selected.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2Icon className="h-4 w-4" />
              {i18next.t("general:Delete")} ({selected.length})
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" onClick={handleAdd}>
              <PlusIcon className="h-4 w-4" />
              {i18next.t("general:Add")}
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={pagedPipes.length > 0 && selected.length === pagedPipes.length}
                  onCheckedChange={(checked) => setSelected(checked ? pagedPipes.map((p) => p.name) : [])}
                />
              </TableHead>
              <TableHead className="w-44">{i18next.t("general:Name")}</TableHead>
              <TableHead className="w-56">{i18next.t("general:Display name")}</TableHead>
              <TableHead className="w-44 text-center">{i18next.t("general:Type")}</TableHead>
              <TableHead className="w-60">{i18next.t("provider:Domain")}</TableHead>
              <TableHead className="w-28">{i18next.t("store:Is default")}</TableHead>
              <TableHead className="w-24">{i18next.t("general:State")}</TableHead>
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
            ) : pagedPipes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-16 text-center text-muted-foreground">
                  {i18next.t("general:No data")}
                </TableCell>
              </TableRow>
            ) : pagedPipes.map((pipe) => (
              <TableRow key={pipe.name}>
                <TableCell>
                  <Checkbox
                    checked={selected.includes(pipe.name)}
                    onCheckedChange={(checked) =>
                      setSelected((prev) => checked ? [...prev, pipe.name] : prev.filter((n) => n !== pipe.name))
                    }
                  />
                </TableCell>
                <TableCell>
                  <Link to={`/pipes/${pipe.name}`} className="text-sm font-medium text-primary hover:underline">
                    {pipe.name}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{pipe.displayName}</TableCell>
                <TableCell className="text-center text-sm">
                  <PipeTypeCell type={pipe.type} />
                </TableCell>
                <TableCell className="max-w-60 truncate text-sm" title={pipe.domain}>{pipe.domain}</TableCell>
                <TableCell><Switch checked={!!pipe.isDefault} disabled size="sm" /></TableCell>
                <TableCell>
                  <Badge variant={pipe.state === "Active" ? "default" : "destructive"}>
                    {pipe.state === "Active" ? i18next.t("general:Active") : i18next.t("general:Inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={i18next.t("general:Edit")}
                      onClick={() => navigate(`/pipes/${pipe.name}`)}
                    >
                      <EditIcon className="h-3.5 w-3.5" />
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title={i18next.t("general:Delete")}
                        onClick={() => setDeleteTarget(pipe)}
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pagination.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{i18next.t("general:{total} in total").replace("{total}", String(pagination.total))}</span>
          <div className="flex items-center gap-2">
            <Select value={String(pagination.pageSize)} onValueChange={(v) => setPagination((p) => ({ ...p, current: 1, pageSize: Number(v) }))}>
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["10", "20", "50", "100"].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={pagination.current <= 1} onClick={() => setPagination((p) => ({ ...p, current: p.current - 1 }))}>
              {i18next.t("general:Previous")}
            </Button>
            <span className="px-2 text-sm">{pagination.current} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={pagination.current >= totalPages} onClick={() => setPagination((p) => ({ ...p, current: p.current + 1 }))}>
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

      <AlertDialog open={bulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{i18next.t("general:Sure to delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {selected.length} {i18next.t("general:items")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkDeleteOpen(false)}>{i18next.t("general:Cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleBulkDelete}>
              {i18next.t("general:OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { DownloadIcon, EditIcon, Loader2Icon, PlusIcon, SearchIcon, StoreIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { addSkill, deleteSkill, getSkills, type Skill } from "~/backend/SkillBackend"
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
import LoadSkillModal from "./LoadSkillModal"
import SkillMarketplaceModal from "./SkillMarketplaceModal"

export function meta() {
  return [{ title: "Skills - OpenAgent" }]
}

const SKILL_TYPES = ["writing", "coding", "analysis", "translation", "reasoning", "search", "custom"]

type SortOrder = "ascend" | "descend" | ""
type Pagination = { current: number; pageSize: number; total: number }

function randomName() {
  return Math.random().toString(36).slice(2, 8)
}

function newSkill(): Skill {
  const rand = randomName()
  return {
    owner: "admin",
    name: `skill_${rand}`,
    createdTime: new Date().toISOString(),
    displayName: "",
    type: "custom",
    description: "",
    homepage: "",
    emoji: "",
    metadata: "",
    content: "",
    skillMd: "",
    references: [],
    state: "Active",
  }
}

function shortText(text: string, max = 20) {
  if (!text || text.length <= max) return text
  return `${text.slice(0, max)}...`
}

export default function SkillListPage() {
  const navigate = useNavigate()
  const [skills, setSkills] = useState<Skill[]>([])
  const [pagination, setPagination] = useState<Pagination>({ current: 1, pageSize: 10, total: 0 })
  const [loading, setLoading] = useState(false)
  const [sortField, setSortField] = useState("")
  const [sortOrder, setSortOrder] = useState<SortOrder>("")
  const [searchField, setSearchField] = useState("name")
  const [searchValue, setSearchValue] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null)
  const [loadModalVisible, setLoadModalVisible] = useState(false)
  const [marketplaceVisible, setMarketplaceVisible] = useState(false)

  const fetchSkills = useCallback(
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
      getSkills("admin", String(current), String(pageSize), field, value, sf, so)
        .then((res) => {
          if (res.status === "ok") {
            setSkills(res.data ?? [])
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
    fetchSkills({ current: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleAdd() {
    const skill = newSkill()
    addSkill(skill)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully added"))
          navigate(`/skills/${skill.name}`, { state: { isNewSkill: true } })
        } else {
          toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
  }

  function handleDelete(skill: Skill) {
    deleteSkill(skill)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully deleted"))
          setSkills((prev) => prev.filter((s) => s.name !== skill.name))
          setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }))
        } else {
          toast.error(`${i18next.t("general:Failed to delete")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
    setDeleteTarget(null)
  }

  function handleSearch() {
    fetchSkills({ current: 1, field: searchField, value: searchValue })
  }

  const filteredSkills = useMemo(() => {
    if (typeFilter === "all") return skills
    return skills.filter((skill) => skill.type === typeFilter)
  }, [skills, typeFilter])

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{i18next.t("general:Skills")}</h1>
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
              <SelectItem value="description">{i18next.t("general:Description")}</SelectItem>
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
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{i18next.t("store:All")}</SelectItem>
              {SKILL_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setLoadModalVisible(true)}>
            <DownloadIcon className="h-4 w-4" />
            {i18next.t("skill:Load Existing Skill")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMarketplaceVisible(true)}>
            <StoreIcon className="h-4 w-4" />
            {i18next.t("skill:Marketplace")}
          </Button>
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
              <TableHead className="w-56">{i18next.t("general:Name")}</TableHead>
              <TableHead className="w-48">{i18next.t("general:Display name")}</TableHead>
              <TableHead className="w-32">{i18next.t("general:Type")}</TableHead>
              <TableHead className="w-64">{i18next.t("general:Description")}</TableHead>
              <TableHead className="w-48">{i18next.t("skill:References")}</TableHead>
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
            ) : filteredSkills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                  {i18next.t("general:No data")}
                </TableCell>
              </TableRow>
            ) : (
              filteredSkills.map((skill) => (
                <TableRow key={skill.name}>
                  <TableCell>
                    <Link to={`/skills/${skill.name}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                      {skill.emoji && <span>{skill.emoji}</span>}
                      {skill.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{skill.displayName}</TableCell>
                  <TableCell><Badge variant="secondary">{skill.type}</Badge></TableCell>
                  <TableCell className="max-w-64 text-sm" title={skill.description}>
                    {shortText(skill.description, 20)}
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-48 flex-wrap gap-1">
                      {(skill.references ?? []).map((ref) => (
                        <Badge key={ref.name} variant="outline" className="font-mono">{ref.name}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={skill.state === "Active" ? "default" : "destructive"}>
                      {skill.state === "Active" ? i18next.t("general:Active") : i18next.t("general:Inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={i18next.t("general:Edit")}
                        onClick={() => navigate(`/skills/${skill.name}`)}
                      >
                        <EditIcon className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title={i18next.t("general:Delete")}
                        onClick={() => setDeleteTarget(skill)}
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
              onValueChange={(value) => fetchSkills({ current: 1, pageSize: Number(value) })}
            >
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["10", "20", "50", "100"].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={pagination.current <= 1} onClick={() => fetchSkills({ current: pagination.current - 1 })}>
              {i18next.t("general:Previous")}
            </Button>
            <span className="px-2 text-sm">{pagination.current} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={pagination.current >= totalPages} onClick={() => fetchSkills({ current: pagination.current + 1 })}>
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

      <LoadSkillModal
        open={loadModalVisible}
        onClose={() => setLoadModalVisible(false)}
        onImported={(skillName) => navigate(`/skills/${skillName}`)}
      />
      <SkillMarketplaceModal
        open={marketplaceVisible}
        onClose={() => setMarketplaceVisible(false)}
        onInstalled={(skillName) => {
          setMarketplaceVisible(false)
          navigate(`/skills/${skillName}`)
        }}
        installedNames={skills.map((skill) => skill.name)}
      />
    </div>
  )
}

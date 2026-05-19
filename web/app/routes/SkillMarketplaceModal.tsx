import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircleIcon, CloudDownloadIcon, Loader2Icon, RefreshCwIcon, SearchIcon, StoreIcon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import {
  getMarketplaceSkills,
  getMarketplaceSources,
  installMarketplaceSkill,
  type MarketplaceSkill,
  type MarketplaceSource,
} from "~/backend/SkillBackend"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"

type Props = {
  open: boolean
  onClose: () => void
  onInstalled: (skillName: string) => void
  installedNames?: string[]
}

export default function SkillMarketplaceModal({
  open,
  onClose,
  onInstalled,
  installedNames = [],
}: Props) {
  const [sources, setSources] = useState<MarketplaceSource[]>([])
  const [selectedSource, setSelectedSource] = useState("")
  const [keyword, setKeyword] = useState("")
  const [skills, setSkills] = useState<MarketplaceSkill[]>([])
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState<Record<string, boolean>>({})
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback((source: string, kw: string) => {
    if (!source) return
    setLoading(true)
    setSkills([])
    getMarketplaceSkills(source, kw)
      .then((res) => {
        if (res.status === "ok") {
          setSkills(res.data ?? [])
        } else {
          toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!open) return
    getMarketplaceSources().then((res) => {
      if (res.status === "ok" && res.data) {
        setSources(res.data)
        if (res.data.length > 0 && !selectedSource) {
          setSelectedSource(res.data[0].id)
        }
      }
    })
  }, [open, selectedSource])

  useEffect(() => {
    if (!open || !selectedSource) return
    doSearch(selectedSource, keyword)
  }, [doSearch, open, selectedSource])

  function handleKeywordChange(value: string) {
    setKeyword(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => doSearch(selectedSource, value), 500)
  }

  function handleInstall(item: MarketplaceSkill) {
    setInstalling((prev) => ({ ...prev, [item.name]: true }))
    installMarketplaceSkill(item)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully added"))
          onInstalled(res.data.name)
        } else {
          toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setInstalling((prev) => ({ ...prev, [item.name]: false })))
  }

  function handleClose() {
    setKeyword("")
    setSkills([])
    onClose()
  }

  const installedSet = new Set(installedNames)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudDownloadIcon className="h-4 w-4" />
            {i18next.t("skill:Skill Marketplace")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedSource} onValueChange={(value) => setSelectedSource(value ?? "")}>
              <SelectTrigger className="h-9 w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative min-w-64 flex-1">
              <SearchIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder={i18next.t("skill:Search marketplace placeholder")}
                value={keyword}
                onChange={(e) => handleKeywordChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
                    doSearch(selectedSource, keyword)
                  }
                }}
              />
            </div>
            <Button variant="outline" onClick={() => doSearch(selectedSource, keyword)} disabled={loading}>
              {loading ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <RefreshCwIcon className="h-4 w-4" />}
              {i18next.t("general:Refresh")}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2Icon className="h-5 w-5 animate-spin" />
              {i18next.t("general:Loading")}
            </div>
          ) : skills.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <StoreIcon className="h-8 w-8" />
              {i18next.t("skill:No skills found")}
            </div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {skills.map((item) => {
                  const isInstalled = installedSet.has(item.name)
                  return (
                    <Card key={`${item.source}-${item.name}`} className="relative overflow-hidden">
                      {isInstalled && (
                        <div className="absolute right-0 top-0 rounded-bl-md bg-green-600 px-2 py-0.5 text-xs font-medium text-white">
                          {i18next.t("skill:Installed")}
                        </div>
                      )}
                      <CardContent className="flex h-full flex-col gap-3 p-4">
                        <div className="flex min-w-0 items-start gap-2 pr-16">
                          {item.emoji && <span className="text-xl leading-none">{item.emoji}</span>}
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{item.displayName || item.name}</div>
                            {item.type && <Badge variant="secondary" className="mt-1">{item.type}</Badge>}
                          </div>
                        </div>
                        <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                          {item.description || "-"}
                        </p>
                        {item.tags && item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.tags.slice(0, 4).map((tag) => (
                              <Badge key={tag} variant="outline">{tag}</Badge>
                            ))}
                          </div>
                        )}
                        <div className="mt-auto flex items-center justify-between gap-2">
                          {item.homepage ? (
                            <a
                              href={item.homepage}
                              target="_blank"
                              rel="noreferrer"
                              title={item.homepage}
                              className="max-w-36 truncate text-xs text-primary hover:underline"
                            >
                              {item.homepage.replace(/^https?:\/\//, "")}
                            </a>
                          ) : <span />}
                          <Button size="sm" variant={isInstalled ? "outline" : "default"} onClick={() => handleInstall(item)} disabled={installing[item.name]}>
                            {installing[item.name] ? (
                              <Loader2Icon className="h-4 w-4 animate-spin" />
                            ) : isInstalled ? (
                              <CheckCircleIcon className="h-4 w-4" />
                            ) : (
                              <CloudDownloadIcon className="h-4 w-4" />
                            )}
                            {isInstalled ? i18next.t("skill:Reinstall") : i18next.t("skill:Install")}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {!loading && skills.length > 0 && (
            <div className="text-right text-xs text-muted-foreground">
              {i18next.t("general:{total} in total").replace("{total}", String(skills.length))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>{i18next.t("general:Close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useState } from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { addSkill, loadSkill, type Skill } from "~/backend/SkillBackend"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"

type Props = {
  open: boolean
  onClose: () => void
  onImported: (skillName: string) => void
}

export default function LoadSkillModal({ open, onClose, onImported }: Props) {
  const [path, setPath] = useState("")
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Skill | null>(null)

  function handleClose() {
    setPath("")
    setPreview(null)
    setLoading(false)
    onClose()
  }

  function handleLoad() {
    const trimmed = path.trim()
    if (!trimmed) {
      toast.error(i18next.t("skill:Please enter a path"))
      return
    }

    setLoading(true)
    setPreview(null)
    loadSkill(trimmed)
      .then((res) => {
        if (res.status === "ok") {
          setPreview(res.data)
        } else {
          toast.error(`${i18next.t("general:Failed to load")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setLoading(false))
  }

  function handleImport() {
    if (!preview) return
    const toSave = {
      ...preview,
      owner: "admin",
      createdTime: new Date().toISOString(),
    }
    addSkill(toSave)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully added"))
          handleClose()
          onImported(toSave.name)
        } else {
          toast.error(`${i18next.t("general:Failed to add")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(err.message))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{i18next.t("skill:Load Existing Skill")}</DialogTitle>
          <DialogDescription>{i18next.t("skill:Skill folder path hint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-muted-foreground">
              {i18next.t("skill:Skill folder path")}
            </div>
            <Input
              className="font-mono"
              placeholder={i18next.t("skill:Skill folder path placeholder")}
              value={path}
              onChange={(e) => {
                setPath(e.target.value)
                setPreview(null)
              }}
              onKeyDown={(e) => { if (e.key === "Enter") handleLoad() }}
            />
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2Icon className="h-4 w-4 animate-spin" />
              {i18next.t("general:Loading")}
            </div>
          )}

          {preview && !loading && (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="border-b bg-muted/40 px-3 py-2 font-medium">
                {preview.emoji && <span className="mr-2">{preview.emoji}</span>}
                {preview.name}
              </div>
              <dl className="divide-y text-sm">
                <div className="grid grid-cols-[140px_1fr] gap-3 px-3 py-2">
                  <dt className="text-muted-foreground">{i18next.t("general:Description")}</dt>
                  <dd className="whitespace-pre-wrap">{preview.description || "-"}</dd>
                </div>
                {preview.homepage && (
                  <div className="grid grid-cols-[140px_1fr] gap-3 px-3 py-2">
                    <dt className="text-muted-foreground">{i18next.t("skill:Homepage")}</dt>
                    <dd>
                      <a className="text-primary hover:underline" href={preview.homepage} target="_blank" rel="noreferrer">
                        {preview.homepage}
                      </a>
                    </dd>
                  </div>
                )}
                <div className="grid grid-cols-[140px_1fr] gap-3 px-3 py-2">
                  <dt className="text-muted-foreground">{i18next.t("skill:References")}</dt>
                  <dd className="flex flex-wrap gap-1">
                    {preview.references?.length
                      ? preview.references.map((ref) => <Badge key={ref.name} variant="secondary" className="font-mono">{ref.name}</Badge>)
                      : "-"}
                  </dd>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-3 px-3 py-2">
                  <dt className="text-muted-foreground">{i18next.t("skill:Content preview")}</dt>
                  <dd>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs">
                      {(preview.content || "").slice(0, 600)}
                      {preview.content && preview.content.length > 600 ? "\n..." : ""}
                    </pre>
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>{i18next.t("general:Cancel")}</Button>
          <Button variant="outline" onClick={handleLoad} disabled={!path.trim() || loading}>
            {loading && <Loader2Icon className="h-4 w-4 animate-spin" />}
            {i18next.t("skill:Load")}
          </Button>
          <Button onClick={handleImport} disabled={!preview}>{i18next.t("skill:Import to Database")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

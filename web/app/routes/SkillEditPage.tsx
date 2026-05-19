import { useEffect, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router"
import { ChevronDownIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { deleteSkill, getSkill, updateSkill, type Skill } from "~/backend/SkillBackend"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Textarea } from "~/components/ui/textarea"
import { FormField, SectionCard } from "~/lib/Setting"

export function meta() {
  return [{ title: "Edit Skill - OpenAgent" }]
}

const SKILL_TYPES = ["writing", "coding", "analysis", "translation", "reasoning", "search", "custom"]

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export default function SkillEditPage() {
  const { skillName } = useParams<{ skillName: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [skill, setSkill] = useState<Skill | null>(null)
  const [currentName, setCurrentName] = useState(skillName || "")
  const [isNewSkill, setIsNewSkill] = useState(!!location.state?.isNewSkill)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!skillName) return
    getSkill("admin", skillName).then((res) => {
      if (res.status === "ok") {
        setSkill(res.data)
        setCurrentName(skillName)
      } else {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      }
    })
  }, [skillName])

  function update<K extends keyof Skill>(key: K, value: Skill[K]) {
    setSkill((prev) => (prev ? { ...prev, [key]: value } : null))
  }

  async function save(exit: boolean) {
    if (!skill) return
    setSaving(true)
    try {
      const payload = clone(skill)
      const res = await updateSkill(skill.owner, currentName, payload)
      if (res.status === "ok") {
        toast.success(i18next.t("general:Successfully saved"))
        setCurrentName(skill.name)
        setIsNewSkill(false)
        if (exit) {
          navigate("/skills")
        } else {
          navigate(`/skills/${skill.name}`, { replace: true })
        }
      } else {
        toast.error(`${i18next.t("general:Failed to save")}: ${res.msg}`)
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    if (isNewSkill && skill) {
      deleteSkill(skill)
        .then((res) => {
          if (res.status === "ok") {
            toast.success(i18next.t("general:Cancelled successfully"))
            navigate("/skills")
          } else {
            toast.error(`${i18next.t("general:Failed to cancel")}: ${res.msg}`)
          }
        })
        .catch((err: Error) => toast.error(err.message))
    } else {
      navigate("/skills")
    }
  }

  if (!skill) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-5 py-4 pb-16">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{i18next.t("skill:Edit Skill")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving}>
            {saving && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
            {i18next.t("general:Save")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => save(true)} disabled={saving}>
            {i18next.t("general:Save & Exit")}
          </Button>
          {isNewSkill && (
            <Button variant="outline" size="sm" onClick={cancel}>{i18next.t("general:Cancel")}</Button>
          )}
        </div>
      </div>

      <SectionCard
        title={i18next.t("general:General Settings")}
        desc={i18next.t("general:General Settings desc")}
      >
        <FormField label={i18next.t("general:Name")} tooltip={i18next.t("general:Name - Tooltip")}>
          <Input value={skill.name} onChange={(e) => update("name", e.target.value)} />
        </FormField>
        <FormField label={i18next.t("general:Display name")} tooltip={i18next.t("general:Display name - Tooltip")}>
          <Input value={skill.displayName ?? ""} onChange={(e) => update("displayName", e.target.value)} />
        </FormField>
        <FormField label={i18next.t("skill:Emoji")} tooltip={i18next.t("skill:Emoji - Tooltip")}>
          <Input value={skill.emoji ?? ""} placeholder="rocket" onChange={(e) => update("emoji", e.target.value)} />
        </FormField>
        <FormField label={i18next.t("general:Type")} tooltip={i18next.t("general:Type - Tooltip")}>
          <Select value={skill.type || "custom"} onValueChange={(value) => update("type", value ?? "custom")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SKILL_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={i18next.t("general:State")} tooltip={i18next.t("general:State - Tooltip")}>
          <Select value={skill.state || "Active"} onValueChange={(value) => update("state", value ?? "Active")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">{i18next.t("general:Active")}</SelectItem>
              <SelectItem value="Inactive">{i18next.t("general:Inactive")}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </SectionCard>

      <SectionCard
        title={i18next.t("general:Content")}
        desc={i18next.t("general:Content desc")}
      >
        <FormField label={i18next.t("general:Description")} tooltip={i18next.t("general:Description - Tooltip")} className="sm:col-span-2 lg:col-span-3">
          <Textarea
            className="min-h-24"
            value={skill.description ?? ""}
            onChange={(e) => update("description", e.target.value)}
          />
        </FormField>
        <FormField label={i18next.t("skill:Homepage")} tooltip={i18next.t("skill:Homepage - Tooltip")} className="sm:col-span-2">
          <Input
            value={skill.homepage ?? ""}
            placeholder="https://..."
            onChange={(e) => update("homepage", e.target.value)}
          />
        </FormField>
        <FormField label={i18next.t("general:Content")} tooltip={i18next.t("skill:Content - Tooltip")} className="sm:col-span-2 lg:col-span-3">
          <Textarea
            className="min-h-[400px] font-mono text-sm"
            value={skill.content ?? ""}
            onChange={(e) => update("content", e.target.value)}
          />
        </FormField>
        {skill.references && skill.references.length > 0 && (
          <FormField label={i18next.t("skill:References")} tooltip={i18next.t("skill:References - Tooltip")} className="sm:col-span-2 lg:col-span-3">
            <div className="space-y-2">
              {skill.references.map((ref, index) => (
                <Collapsible key={`${ref.name}-${index}`} className="rounded-lg border border-border">
                  <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="font-mono">{ref.name}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {ref.content ? `${ref.content.length} chars` : "empty"}
                      </span>
                    </span>
                    <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t p-3">
                    <Textarea
                      className="min-h-48 font-mono text-xs"
                      value={ref.content ?? ""}
                      onChange={(e) => {
                        const refs = clone(skill.references)
                        refs[index].content = e.target.value
                        update("references", refs)
                      }}
                    />
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </FormField>
        )}
        {skill.skillMd && (
          <FormField label={i18next.t("skill:SKILL.md")} tooltip={i18next.t("skill:SKILL.md - Tooltip")} className="sm:col-span-2 lg:col-span-3">
            <Collapsible className="rounded-lg border border-border">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-muted-foreground">
                {i18next.t("skill:SKILL.md view")}
                <ChevronDownIcon className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t p-3">
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
                  {skill.skillMd}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </FormField>
        )}
      </SectionCard>

      <div className="mt-6 flex items-center gap-2">
        <Button onClick={() => save(false)} disabled={saving}>
          {saving && <Loader2Icon className="h-4 w-4 animate-spin" />}
          {i18next.t("general:Save")}
        </Button>
        <Button variant="outline" onClick={() => save(true)} disabled={saving}>
          {i18next.t("general:Save & Exit")}
        </Button>
        {isNewSkill && <Button variant="outline" onClick={cancel}>{i18next.t("general:Cancel")}</Button>}
      </div>
    </div>
  )
}

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
import { useNavigate, useParams, useLocation } from "react-router"
import {
  BarChart2Icon,
  DownloadIcon,
  FileCodeIcon,
  FileTextIcon,
  Loader2Icon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { type Task, getTask, updateTask, deleteTask, uploadTaskDocument, analyzeTask } from "~/backend/TaskBackend"
import { getPublicScales, type Scale } from "~/backend/ScaleBackend"
import { getProviders, getProviderDisplayName, getProviderLogoUrl, type Provider } from "~/backend/ProviderBackend"
import { isAdminUser } from "~/backend/AccountBackend"
import { useAccount } from "~/context/AccountContext"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import { Progress } from "~/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { FormField, SectionCard } from "~/lib/Setting"
import TaskAnalysisReport from "~/components/TaskAnalysisReport"

export function meta() {
  return [{ title: "Edit Task — OpenAgent" }]
}

const ANALYZE_DURATION_SEC = 300
const ANALYZE_TICK_MS = 500
const ANALYZE_MAX_PCT = 99

function normalizeTask(task: Task): Task {
  let t: Task = task.scale === undefined || task.scale === null ? { ...task, scale: "" } : task
  if (!t.result) return t
  if (typeof t.result === "string") {
    try {
      t = { ...t, result: JSON.parse(t.result) }
    } catch {
      t = { ...t, result: null }
    }
  }
  return t
}

function getDocumentFileName(url?: string): string {
  if (!url) return ""
  try {
    const path = new URL(url).pathname || url
    const encoded = path.split("/").filter(Boolean).pop() || url
    try {
      return decodeURIComponent(encoded)
    } catch {
      return encoded
    }
  } catch {
    return url.split("/").filter(Boolean).pop() || url
  }
}

export default function TaskEditPage() {
  const params = useParams<{ owner: string; taskName: string }>()
  // Coerce to string; routes.ts guarantees these are always present
  const owner = params.owner ?? ""
  const taskName = params.taskName ?? ""

  const navigate = useNavigate()
  const location = useLocation()

  const { account } = useAccount()
  const isAdmin = isAdminUser(account)

  const [task, setTask] = useState<Task | null>(null)
  const [originalName, setOriginalName] = useState("")
  const [isNewTask, setIsNewTask] = useState(
    (location.state as { isNewTask?: boolean } | null)?.isNewTask ?? false
  )
  const [modelProviders, setModelProviders] = useState<Provider[]>([])
  const [publicScales, setPublicScales] = useState<Scale[]>([])
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeProgress, setAnalyzeProgress] = useState(0)
  const [uploadingDocument, setUploadingDocument] = useState(false)

  const analyzeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analyzeStartRef = useRef<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (analyzeIntervalRef.current !== null) clearInterval(analyzeIntervalRef.current)
    }
  }, [])

  useEffect(() => {
    if (!owner || !taskName) return
    loadTask()
    loadProviders()
    getPublicScales().then((res) => {
      if (res.status === "ok" && res.data) setPublicScales(res.data)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, taskName])

  function loadTask() {
    if (!owner || !taskName) return
    getTask(owner, taskName).then((res) => {
      if (res.status === "ok") {
        const normalized = normalizeTask(res.data)
        setTask(normalized)
        setOriginalName(normalized.name)
      } else {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      }
    })
  }

  function loadProviders() {
    if (!account) return
    getProviders(account.name).then((res) => {
      if (res.status === "ok" && res.data) {
        setModelProviders((res.data as Provider[]).filter((p) => p.category === "Model"))
      }
    })
  }

  function update<K extends keyof Task>(key: K, value: Task[K]) {
    setTask((t) => (t ? { ...t, [key]: value } : null))
  }

  function getEffectiveScale(): string {
    if (!task?.scale || !publicScales.length) return ""
    const s = publicScales.find((x) => `${x.owner}/${x.name}` === task.scale)
    return s?.text || ""
  }

  async function save(exit: boolean) {
    if (!task || !owner) return
    setSaving(true)
    const payload = { ...task }
    if (payload.result && typeof payload.result === "object") {
      payload.result = JSON.stringify(payload.result)
    }
    try {
      const res = await updateTask(owner, originalName, payload)
      if (res.status === "ok") {
        toast.success(i18next.t("general:Successfully saved"))
        setIsNewTask(false)
        setOriginalName(task.name)
        if (exit) {
          navigate("/tasks")
        } else {
          navigate(`/tasks/${task.owner}/${task.name}`, { replace: true })
          loadTask()
        }
      } else {
        toast.error(`${i18next.t("general:Failed to save")}: ${res.msg}`)
      }
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    if (isNewTask && task) {
      deleteTask(task).then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Cancelled successfully"))
          navigate("/tasks")
        } else {
          toast.error(`${i18next.t("general:Failed to cancel")}: ${res.msg}`)
        }
      })
    } else {
      navigate("/tasks")
    }
  }

  function handleAnalyze() {
    if (!task || !task.scale?.trim() || !owner || !task.name) return
    analyzeStartRef.current = Date.now()
    setAnalyzing(true)
    setAnalyzeProgress(0)
    const durationMs = ANALYZE_DURATION_SEC * 1000
    analyzeIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - analyzeStartRef.current
      const pct = Math.min(ANALYZE_MAX_PCT, (ANALYZE_MAX_PCT * elapsed) / durationMs)
      setAnalyzeProgress(Math.round(pct))
    }, ANALYZE_TICK_MS)

    analyzeTask(owner, task.name)
      .then((res) => {
        if (res.status === "ok") {
          setTask((t) => t ? { ...t, result: res.data, score: res.data.score } : null)
          toast.success(i18next.t("general:Successfully saved"))
        } else {
          toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
        }
      })
      .catch((err: Error) => toast.error(`${i18next.t("general:Failed to get")}: ${err.message}`))
      .finally(() => {
        if (analyzeIntervalRef.current !== null) {
          clearInterval(analyzeIntervalRef.current)
          analyzeIntervalRef.current = null
        }
        setAnalyzeProgress(100)
        setTimeout(() => {
          setAnalyzing(false)
          setAnalyzeProgress(0)
        }, 400)
      })
  }

  function clearReport() {
    setTask((t) => t ? { ...t, result: null, score: 0 } : null)
  }

  function clearDocument() {
    setTask((t) => t ? { ...t, documentUrl: "", documentText: "" } : null)
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = (err) => reject(err)
    })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !task) return
    setUploadingDocument(true)
    try {
      const base64 = await fileToBase64(file)
      const taskId = `${task.owner}/${task.name}`
      const res = await uploadTaskDocument(taskId, base64, file.name, file.type)
      if (res.status === "ok") {
        setTask((t) => t ? { ...t, documentUrl: res.data.url, documentText: res.data.text } : null)
        toast.success(i18next.t("general:Successfully uploaded"))
      } else {
        toast.error(`${i18next.t("general:Failed to upload")}: ${res.msg}`)
      }
    } catch (err: any) {
      toast.error(`${i18next.t("general:Failed to upload")}: ${err?.message ?? String(err)}`)
    } finally {
      setUploadingDocument(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  if (!task) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const effectiveScale = getEffectiveScale()
  const isPdf = task.documentUrl?.endsWith(".pdf")
  const docFileName = getDocumentFileName(task.documentUrl)
  const canAnalyze = !analyzing && !!task.documentText && !task.result && !!String(task.scale || "").trim()

  return (
    <div className="min-h-screen bg-background px-5 py-4 pb-16">
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{i18next.t("task:Edit Task")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving}>
            {saving && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
            {i18next.t("general:Save")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => save(true)} disabled={saving}>
            {i18next.t("general:Save & Exit")}
          </Button>
          {isNewTask && (
            <Button variant="outline" size="sm" onClick={handleCancel}>
              {i18next.t("general:Cancel")}
            </Button>
          )}
        </div>
      </div>

      {/* General Settings */}
      <SectionCard
        title={i18next.t("general:General Settings")}
        desc={i18next.t("general:General Settings desc")}
      >
        <FormField label={i18next.t("general:Name")} tooltip={i18next.t("general:Name - Tooltip")}>
          <Input value={task.name} onChange={(e) => update("name", e.target.value)} />
        </FormField>

        {isAdmin && (
          <FormField
            label={i18next.t("provider:Model provider")}
            tooltip={i18next.t("provider:Model provider - Tooltip")}
          >
            <Select value={task.provider ?? ""} onValueChange={(v) => update("provider", v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder={i18next.t("general:None")} />
              </SelectTrigger>
              <SelectContent>
                {modelProviders.map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    <div className="flex items-center gap-2">
                      <img
                        src={getProviderLogoUrl(p)}
                        alt=""
                        className="h-4 w-4 shrink-0 rounded object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                      />
                      <span>{getProviderDisplayName(p)} ({p.name})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}

        {isAdmin && (
          <FormField label={i18next.t("general:Type")} tooltip={i18next.t("general:Type - Tooltip")}>
            <Select value={task.type ?? ""} onValueChange={(v) => update("type", v ?? "")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Labeling">Labeling</SelectItem>
                <SelectItem value="PBL">PBL</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        )}

        {(task.type === "Labeling" || isAdmin) && (
          <FormField
            label={i18next.t("general:Display name")}
            tooltip={i18next.t("general:Display name - Tooltip")}
          >
            <Input value={task.displayName ?? ""} onChange={(e) => update("displayName", e.target.value)} />
          </FormField>
        )}
      </SectionCard>

      {/* Options */}
      <SectionCard title={i18next.t("general:Options")}>
        {/* Scale selector */}
        <FormField
          label={i18next.t("task:Scale")}
          tooltip={i18next.t("task:Scale - Tooltip")}
          className="sm:col-span-2"
        >
          <Select
            value={task.scale ?? ""}
            onValueChange={(v) => update("scale", v === "__none__" ? "" : (v ?? ""))}
          >
            <SelectTrigger>
              <SelectValue placeholder={i18next.t("general:None")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{i18next.t("general:None")}</SelectItem>
              {publicScales.map((s) => (
                <SelectItem key={`${s.owner}/${s.name}`} value={`${s.owner}/${s.name}`}>
                  {s.displayName ? `${s.displayName} (${s.owner}/${s.name})` : `${s.owner}/${s.name}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {/* Scale text preview */}
        {effectiveScale && (
          <FormField
            label={i18next.t("general:Text")}
            tooltip={i18next.t("task:Scale - Tooltip")}
            className="sm:col-span-2 lg:col-span-3"
          >
            <Textarea
              readOnly
              value={effectiveScale}
              rows={5}
              className="max-h-32 overflow-auto font-mono text-xs"
            />
          </FormField>
        )}

        {/* File upload */}
        <FormField
          label={i18next.t("store:File")}
          tooltip={i18next.t("store:File - Tooltip")}
          className="sm:col-span-2 lg:col-span-3"
        >
          {task.documentUrl ? (
            <div className="inline-flex max-w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
              <span className={`shrink-0 ${isPdf ? "text-red-600" : "text-blue-600"}`}>
                {isPdf ? <FileTextIcon className="h-7 w-7" /> : <FileCodeIcon className="h-7 w-7" />}
              </span>
              <span className="min-w-0 max-w-sm truncate text-sm font-medium" title={docFileName}>
                {docFileName}
              </span>
              <a
                href={task.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="shrink-0"
              >
                <Button type="button" variant="link" size="sm" className="gap-1 px-0">
                  <DownloadIcon className="h-3.5 w-3.5" />
                  {i18next.t("general:Download")}
                </Button>
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                onClick={clearDocument}
                aria-label={i18next.t("general:Delete")}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingDocument}
                className="gap-2"
              >
                {uploadingDocument ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadIcon className="h-4 w-4" />
                )}
                {i18next.t("store:Upload file")} (.docx, .pdf)
              </Button>
            </>
          )}
        </FormField>

        {/* Labeling-specific fields */}
        {task.type === "Labeling" && (
          <>
            <FormField
              label={i18next.t("task:Example")}
              tooltip={i18next.t("task:Example - Tooltip")}
            >
              <Input value={task.example ?? ""} onChange={(e) => update("example", e.target.value)} />
            </FormField>

            <FormField
              label={i18next.t("task:Labels")}
              tooltip={i18next.t("task:Labels - Tooltip")}
            >
              <LabelsInput
                value={task.labels ?? []}
                onChange={(v) => update("labels", v)}
              />
            </FormField>
          </>
        )}

        {/* PBL: analyze + report */}
        {task.type !== "Labeling" && task.documentUrl && (
          <FormField
            label={i18next.t("task:Report")}
            tooltip={i18next.t("task:Report - Tooltip")}
            className="sm:col-span-2 lg:col-span-3"
          >
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  disabled={!canAnalyze}
                  onClick={handleAnalyze}
                  className="w-52 gap-2"
                >
                  {analyzing ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : (
                    <BarChart2Icon className="h-4 w-4" />
                  )}
                  {i18next.t("task:Analyze")}
                </Button>
                {task.result && (
                  <Button type="button" variant="outline" onClick={clearReport} className="w-52 gap-2">
                    <Trash2Icon className="h-4 w-4" />
                    {i18next.t("general:Clear")}
                  </Button>
                )}
              </div>
              {analyzing && (
                <div className="mt-3 space-y-1.5">
                  <Progress value={analyzeProgress} className="h-2 max-w-md" />
                  <p className="text-sm text-muted-foreground">{i18next.t("task:Analyzing")}…</p>
                </div>
              )}
              {task.result && (
                <TaskAnalysisReport
                  result={task.result}
                  downloadFileName={`${task.owner}_${task.name}_report.docx`}
                />
              )}
            </div>
          </FormField>
        )}

        {/* Labeling: log */}
        {task.type === "Labeling" && (
          <FormField
            label={i18next.t("task:Log")}
            tooltip={i18next.t("task:Log - Tooltip")}
            className="sm:col-span-2 lg:col-span-3"
          >
            <Textarea
              value={task.log ?? ""}
              onChange={(e) => update("log", e.target.value)}
              rows={8}
              className="font-mono text-xs"
            />
          </FormField>
        )}
      </SectionCard>

      {/* Bottom action bar */}
      <div className="mt-6 flex items-center gap-2">
        <Button onClick={() => save(false)} disabled={saving}>
          {saving && <Loader2Icon className="h-4 w-4 animate-spin" />}
          {i18next.t("general:Save")}
        </Button>
        <Button variant="outline" onClick={() => save(true)} disabled={saving}>
          {i18next.t("general:Save & Exit")}
        </Button>
        {isNewTask && (
          <Button variant="outline" onClick={handleCancel}>
            {i18next.t("general:Cancel")}
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Labels tag-input ───────────────────────────────────────────────────────────

function LabelsInput({
  value,
  onChange,
}: {
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [inputValue, setInputValue] = useState("")

  function addLabel(label: string) {
    const trimmed = label.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setInputValue("")
  }

  function removeLabel(label: string) {
    onChange(value.filter((l) => l !== label))
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background p-2 focus-within:ring-1 focus-within:ring-ring">
      {value.map((label) => (
        <span
          key={label}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
        >
          {label}
          <button
            type="button"
            className="ml-0.5 rounded-full hover:bg-primary/20"
            onClick={() => removeLabel(label)}
          >
            <XIcon className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        placeholder={i18next.t("general:Add label…")}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            addLabel(inputValue)
          } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
            removeLabel(value[value.length - 1])
          }
        }}
        onBlur={() => { if (inputValue.trim()) addLabel(inputValue) }}
      />
    </div>
  )
}

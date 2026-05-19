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
import { useLocation, useNavigate, useParams } from "react-router"
import { Loader2Icon, PlayIcon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { deleteTool, getTool, testTool, updateTool, type Tool } from "~/backend/ToolBackend"
import { getProviders } from "~/backend/ProviderBackend"
import {
  getProviderLogoURL,
  getProviderSubTypeOptions,
  getProviderTypeOptions,
  getToolFunctions,
} from "~/lib/ProviderSetting"
import { FormField, PasswordInput, SectionCard } from "~/lib/Setting"
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
import { Switch } from "~/components/ui/switch"
import { Textarea } from "~/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { TagInput } from "~/lib/Setting"

export function meta() {
  return [{ title: "Edit Tool - OpenAgent" }]
}

const TOOL_TYPES = getProviderTypeOptions("Tool") as Array<{ id: string; name: string }>

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function tryFormatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
  }
}

function isValidToolTestJson(content: string): boolean {
  try {
    const parsed = JSON.parse(content)
    return parsed && typeof parsed.tool === "string" && parsed.tool.trim() !== ""
  } catch {
    return false
  }
}

function buildDefaultToolTestJson(tool: Tool): string {
  const fns = getToolFunctions(tool)
  if (fns.length > 0) {
    return fns[0].testContent
  }
  return JSON.stringify({ tool: "", arguments: {} }, null, 2)
}

function getDefaultSubType(type: string): string {
  if (type === "time") return "Default"
  if (type === "web_search") return "DuckDuckGo"
  if (type === "shell") return "Default"
  if (type === "local_file") return "Default"
  if (type === "office") return "All"
  if (type === "web_fetch") return "Default"
  if (type === "web_browser") return "Default"
  if (type === "gui") return "Windows UIA"
  if (type === "video_download") return "Default"
  if (type === "browser_use") return "Default"
  return "Default"
}

type ModelProvider = { name: string; displayName?: string; type: string; category: string }

export default function ToolEditPage() {
  const { toolName } = useParams<{ toolName: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [tool, setTool] = useState<Tool | null>(null)
  const [currentName, setCurrentName] = useState(toolName || "")
  const [isNewTool, setIsNewTool] = useState(!!location.state?.isNewTool)
  const [saving, setSaving] = useState(false)

  // Test widget state
  const [testContent, setTestContent] = useState("")
  const [testResult, setTestResult] = useState("")
  const [testLoading, setTestLoading] = useState(false)
  const [modelProviders, setModelProviders] = useState<ModelProvider[]>([])
  const [selectedModelProvider, setSelectedModelProvider] = useState("")
  const [promptExamples, setPromptExamples] = useState<string[]>([])
  const lastSyncedTypeRef = useRef<string | null>(null)
  const lastSyncedSubTypeRef = useRef<string | null>(null)

  useEffect(() => {
    if (!toolName) return
    getTool("admin", toolName).then((res) => {
      if (res.status === "ok") {
        const t: Tool = res.data
        setTool(t)
        setCurrentName(toolName)
        setSelectedModelProvider(t.modelProvider || "")
        setPromptExamples(t.promptExamples || [])
        // Initialize test content
        const needsDefault =
          !t.testContent || t.testContent.trim() === "" || !isValidToolTestJson(t.testContent)
        if (needsDefault) {
          setTestContent(buildDefaultToolTestJson(t))
        } else {
          setTestContent(tryFormatJson(t.testContent || ""))
        }
        if (t.resultSummary) {
          setTestResult(t.resultSummary)
        }
        lastSyncedTypeRef.current = t.type || null
        lastSyncedSubTypeRef.current = t.subType || null
      } else {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      }
    })
    // Load model providers for chat test
    getProviders("admin").then((res) => {
      if (res.status === "ok") {
        setModelProviders((res.data as ModelProvider[]).filter((p) => p.category === "Model"))
      }
    })
  }, [toolName])

  function update<K extends keyof Tool>(key: K, value: Tool[K]) {
    setTool((prev) => {
      if (!prev) return null
      const next = { ...prev, [key]: value }
      // Sync test content when type changes
      if (key === "type" && value !== lastSyncedTypeRef.current) {
        lastSyncedTypeRef.current = value as string
        lastSyncedSubTypeRef.current = next.subType || null
        setTestContent(buildDefaultToolTestJson(next))
        setTestResult("")
      }
      // Sync test content when office subType changes
      if (key === "subType" && prev.type === "office" && value !== lastSyncedSubTypeRef.current) {
        lastSyncedSubTypeRef.current = value as string
        setTestContent(buildDefaultToolTestJson(next))
      }
      return next
    })
  }

  async function save(exit: boolean) {
    if (!tool) return
    setSaving(true)
    try {
      const payload = clone({ ...tool, modelProvider: selectedModelProvider, promptExamples })
      const res = await updateTool(tool.owner, currentName, payload)
      if (res.status === "ok") {
        toast.success(i18next.t("general:Successfully saved"))
        setCurrentName(tool.name)
        setIsNewTool(false)
        if (exit) {
          navigate("/tools")
        } else {
          navigate(`/tools/${tool.name}`, { replace: true })
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
    if (isNewTool && tool) {
      deleteTool(tool)
        .then((res) => {
          if (res.status === "ok") {
            toast.success(i18next.t("general:Cancelled successfully"))
            navigate("/tools")
          } else {
            toast.error(`${i18next.t("general:Failed to cancel")}: ${res.msg}`)
          }
        })
        .catch((err: Error) => toast.error(err.message))
    } else {
      navigate("/tools")
    }
  }

  async function handleTestTool() {
    if (!tool) return
    let parsed: any
    try {
      parsed = JSON.parse(testContent)
    } catch (e) {
      toast.error(`${i18next.t("provider:Invalid tool test JSON")}: ${(e as Error).message}`)
      return
    }
    if (!parsed || typeof parsed.tool !== "string" || parsed.tool.trim() === "") {
      toast.error(i18next.t("provider:Tool test JSON must include tool"))
      return
    }
    setTestLoading(true)
    setTestResult("")
    try {
      const toolToTest = clone({ ...tool, testContent, modelProvider: selectedModelProvider, promptExamples })
      const res = await testTool(toolToTest)
      if (res.status === "ok") {
        let out: string
        if (typeof res.data === "string") {
          try {
            out = JSON.stringify(JSON.parse(res.data), null, 2)
          } catch {
            out = res.data
          }
        } else {
          out = JSON.stringify(res.data, null, 2)
        }
        setTestResult(out)
        toast.success(i18next.t("general:Success"))
        // Persist result
        await updateTool(tool.owner, tool.name, clone({ ...tool, resultSummary: out, testContent, modelProvider: selectedModelProvider, promptExamples }))
      } else {
        toast.error(res.msg || i18next.t("general:Failed to save"))
      }
    } catch (err) {
      toast.error(`${i18next.t("general:Failed to connect to server")}: ${(err as Error).message}`)
    } finally {
      setTestLoading(false)
    }
  }

  if (!tool) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const shouldShowClientId = tool.type === "web_search" && tool.subType === "Google"
  const shouldShowClientSecret =
    tool.type === "web_search" && ["Google", "Baidu"].includes(tool.subType)
  const shouldShowProviderUrl = ["web_search", "web_fetch", "web_browser"].includes(tool.type)
  const shouldShowProxy = ["web_search", "web_fetch", "web_browser", "browser_use"].includes(tool.type)
  const shouldShowChromeMode = tool.type === "browser_use"
  const shouldShowChromeExtAlert =
    tool.type === "browser_use" && tool.mode === "OpenAgent Chrome Extension"

  const clientIdLabel =
    tool.type === "web_search" && tool.subType === "Google"
      ? i18next.t("provider:Search engine ID (cx)")
      : i18next.t("provider:Client ID")
  const clientIdTooltip =
    tool.type === "web_search" && tool.subType === "Google"
      ? i18next.t("provider:Search engine ID (cx) - Tooltip")
      : i18next.t("provider:Client ID - Tooltip")
  const clientSecretLabel =
    tool.type === "web_search"
      ? i18next.t("provider:API key")
      : i18next.t("provider:Client secret")
  const clientSecretTooltip =
    tool.type === "web_search"
      ? i18next.t("provider:API key - Tooltip")
      : i18next.t("provider:Client secret - Tooltip")

  const subTypeOptions = getProviderSubTypeOptions("Tool", tool.type) as Array<{ id: string; name: string }>
  const toolFunctions = getToolFunctions(tool)
  const guiFunctions = getToolFunctions({ type: "gui" })
  const videoFunctions = getToolFunctions({ type: "video_download" })

  return (
    <div className="min-h-screen bg-background px-5 py-4 pb-16">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{i18next.t("tool:Edit Tool")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving}>
            {saving && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
            {i18next.t("general:Save")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => save(true)} disabled={saving}>
            {i18next.t("general:Save & Exit")}
          </Button>
          {isNewTool && (
            <Button variant="outline" size="sm" onClick={cancel}>
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
          <Input value={tool.name} onChange={(e) => update("name", e.target.value)} />
        </FormField>

        <FormField label={i18next.t("general:Type")} tooltip={i18next.t("general:Type - Tooltip")}>
          <Select
            value={tool.type}
            onValueChange={(value) => {
              const v = value ?? "time"
              update("type", v)
              update("subType", getDefaultSubType(v))
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOOL_TYPES.map((item) => {
                const logoUrl = getProviderLogoURL({ category: "Tool", type: item.id })
                return (
                  <SelectItem key={item.id} value={item.id}>
                    <div className="flex items-center gap-2">
                      {logoUrl && (
                        <img src={logoUrl} alt={item.name} className="h-5 w-5 object-contain" />
                      )}
                      {item.name}
                    </div>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={i18next.t("provider:Sub type")} tooltip={i18next.t("provider:Sub type - Tooltip")}>
          <Select
            value={tool.subType}
            onValueChange={(value) => update("subType", value ?? "Default")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {subTypeOptions.map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {shouldShowClientId && (
          <FormField label={clientIdLabel} tooltip={clientIdTooltip}>
            <Input
              value={tool.clientId ?? ""}
              onChange={(e) => update("clientId", e.target.value)}
            />
          </FormField>
        )}

        {shouldShowClientSecret && (
          <FormField label={clientSecretLabel} tooltip={clientSecretTooltip}>
            <PasswordInput
              value={tool.clientSecret ?? ""}
              onChange={(v) => update("clientSecret", v)}
            />
          </FormField>
        )}

        {shouldShowProviderUrl && (
          <FormField
            label={i18next.t("general:Provider URL")}
            tooltip={i18next.t("general:Provider URL - Tooltip")}
          >
            <Input
              value={tool.providerUrl ?? ""}
              onChange={(e) => update("providerUrl", e.target.value)}
            />
          </FormField>
        )}

        {shouldShowProxy && (
          <FormField
            label={i18next.t("provider:Enable proxy")}
            tooltip={i18next.t("provider:Enable proxy - Tooltip")}
          >
            <div className="flex items-center pt-1">
              <Switch
                checked={!!tool.enableProxy}
                onCheckedChange={(checked) => update("enableProxy", checked)}
              />
            </div>
          </FormField>
        )}

        {shouldShowChromeMode && (
          <FormField
            label={i18next.t("tool:Chrome mode")}
            tooltip={i18next.t("tool:Chrome mode - Tooltip")}
          >
            <Select
              value={tool.mode || "User Chrome"}
              onValueChange={(value) => update("mode", value ?? "User Chrome")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="User Chrome">{i18next.t("tool:User Chrome")}</SelectItem>
                <SelectItem value="Chrome for Testing">{i18next.t("tool:Chrome for Testing")}</SelectItem>
                <SelectItem value="OpenAgent Chrome Extension">{i18next.t("tool:OpenAgent Chrome Extension")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        )}

        {shouldShowChromeExtAlert && (
          <div className="sm:col-span-2 lg:col-span-3">
            <Alert>
              <AlertTitle>{i18next.t("tool:OpenAgent Chrome Extension - Setup title")}</AlertTitle>
              <AlertDescription>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                  <li>
                    {i18next.t("tool:OpenAgent Chrome Extension - Step 1 prefix")}
                    {" "}
                    <a
                      href="https://github.com/the-open-agent/openagent-chrome"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      {i18next.t("tool:OpenAgent Chrome Extension - Step 1 link")}
                    </a>
                  </li>
                  <li>{i18next.t("tool:OpenAgent Chrome Extension - Step 2")}</li>
                  <li>{i18next.t("tool:OpenAgent Chrome Extension - Step 3")}</li>
                  <li>{i18next.t("tool:OpenAgent Chrome Extension - Step 4")}</li>
                </ol>
              </AlertDescription>
            </Alert>
          </div>
        )}

        <FormField label={i18next.t("general:State")} tooltip={i18next.t("general:State - Tooltip")}>
          <Select
            value={tool.state || "Active"}
            onValueChange={(value) => update("state", value ?? "Active")}
          >
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

      {/* Functions */}
      {toolFunctions.length > 0 && (
        <SectionCard
          title={i18next.t("tool:Functions")}
          desc={i18next.t("tool:Functions desc")}
        >
          <div className="sm:col-span-2 lg:col-span-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-72">{i18next.t("tool:Function name")}</TableHead>
                  <TableHead>{i18next.t("general:Description")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {toolFunctions.map((fn) => (
                  <TableRow key={fn.name}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{fn.name}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fn.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      )}

      {/* Test */}
      <SectionCard
        title={i18next.t("general:Test")}
        desc={i18next.t("general:Test desc")}
      >
        <div className="sm:col-span-2 lg:col-span-3 space-y-4">
          {/* Tool function selector for gui / video_download */}
          {tool.type === "gui" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                {i18next.t("provider:Tool function")}
              </label>
              <Select
                onValueChange={(value) => {
                  const fn = guiFunctions.find((f) => f.name === (value ?? ""))
                  if (fn) setTestContent(fn.testContent)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={i18next.t("provider:Tool function")} />
                </SelectTrigger>
                <SelectContent>
                  {guiFunctions.map((f) => (
                    <SelectItem key={f.name} value={f.name}>
                      {f.name} — {f.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {tool.type === "video_download" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                {i18next.t("provider:Tool function")}
              </label>
              <Select
                onValueChange={(value) => {
                  const fn = videoFunctions.find((f) => f.name === (value ?? ""))
                  if (fn) setTestContent(fn.testContent)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={i18next.t("provider:Tool function")} />
                </SelectTrigger>
                <SelectContent>
                  {videoFunctions.map((f) => (
                    <SelectItem key={f.name} value={f.name}>
                      {f.name} — {f.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Tool test JSON */}
          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                {i18next.t("provider:Tool test")}
              </label>
              <Textarea
                className="min-h-36 font-mono text-sm"
                value={testContent}
                onChange={(e) => setTestContent(e.target.value)}
                placeholder={JSON.stringify({ tool: "", arguments: {} }, null, 2)}
              />
            </div>
            <div className="flex flex-col justify-end gap-2 pb-0.5">
              <Button
                onClick={handleTestTool}
                disabled={testLoading || !testContent || testContent.trim() === ""}
                size="sm"
              >
                {testLoading ? (
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlayIcon className="h-3.5 w-3.5" />
                )}
                {i18next.t("provider:Invoke tool")}
              </Button>
            </div>
          </div>

          {/* Tool result */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              {i18next.t("provider:Tool result")}
            </label>
            <Textarea
              className="min-h-36 font-mono text-sm"
              value={testResult}
              readOnly
              placeholder={i18next.t("general:No data")}
            />
          </div>

          {/* Chat test */}
          <div className="border-t pt-4">
            <div className="mb-3 text-sm font-medium text-muted-foreground">
              {i18next.t("provider:Chat test")}
            </div>
            <div className="flex flex-col gap-3">
              <Select
                value={selectedModelProvider || undefined}
                onValueChange={(value) => setSelectedModelProvider(value ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={i18next.t("provider:Select model provider")} />
                </SelectTrigger>
                <SelectContent>
                  {modelProviders.map((mp) => {
                    const logoUrl = getProviderLogoURL({ category: mp.category, type: mp.type })
                    return (
                      <SelectItem key={mp.name} value={mp.name}>
                        <div className="flex items-center gap-2">
                          {logoUrl && (
                            <img src={logoUrl} alt={mp.name} className="h-5 w-5 object-contain" />
                          )}
                          {mp.displayName || mp.name}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  {i18next.t("tool:Prompt examples")}
                </label>
                <TagInput
                  value={promptExamples}
                  onChange={setPromptExamples}
                  placeholder={i18next.t("tool:Prompt examples")}
                />
              </div>

              {selectedModelProvider ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  {i18next.t("provider:Chat test")}: {tool.name} + {selectedModelProvider}
                </div>
              ) : (
                <div className="flex h-24 items-center justify-center rounded-lg border border-border text-sm text-muted-foreground">
                  {i18next.t("provider:Please select a model provider first")}
                </div>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="mt-6 flex items-center gap-2">
        <Button onClick={() => save(false)} disabled={saving}>
          {saving && <Loader2Icon className="h-4 w-4 animate-spin" />}
          {i18next.t("general:Save")}
        </Button>
        <Button variant="outline" onClick={() => save(true)} disabled={saving}>
          {i18next.t("general:Save & Exit")}
        </Button>
        {isNewTool && (
          <Button variant="outline" onClick={cancel}>
            {i18next.t("general:Cancel")}
          </Button>
        )}
      </div>
    </div>
  )
}

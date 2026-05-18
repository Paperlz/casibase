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
import { useLocation, useNavigate, useParams } from "react-router"
import { LinkIcon, Loader2Icon, PlayIcon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import {
  deleteServer,
  getServer,
  syncMcpTool,
  testMcpServer,
  updateServer,
  type McpTool,
  type Server,
} from "~/backend/ServerBackend"
import { FormField, PasswordInput, SectionCard } from "~/lib/Setting"
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
import { ServerUrl } from "~/lib/api"

export function meta() {
  return [{ title: "Edit MCP Server - OpenAgent" }]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

// ── ToolTable (inline) ────────────────────────────────────────────────────────

function ToolTable({
  tools,
  onUpdate,
}: {
  tools: McpTool[]
  onUpdate: (tools: McpTool[]) => void
}) {
  function toggleAllowed(index: number, checked: boolean) {
    const next = [...tools]
    next[index] = { ...next[index], isAllowed: checked }
    onUpdate(next)
  }

  if (tools.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        {i18next.t("general:No data")}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-64">{i18next.t("general:Name")}</TableHead>
            <TableHead>{i18next.t("general:Description")}</TableHead>
            <TableHead className="w-28">{i18next.t("server:Is allowed")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tools.map((tool, index) => (
            <TableRow key={tool.name || `tool-${index}`}>
              <TableCell className="text-sm font-medium">{tool.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{tool.description}</TableCell>
              <TableCell>
                <Switch
                  checked={!!tool.isAllowed}
                  onCheckedChange={(checked) => toggleAllowed(index, checked)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ── TestMcpWidget (inline) ────────────────────────────────────────────────────

type ArgValues = Record<string, string | number | boolean>

function TestMcpWidget({ server }: { server: Server }) {
  const [testToolName, setTestToolName] = useState("")
  const [testArgValues, setTestArgValues] = useState<ArgValues>({})
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState("")

  const tools = server.tools ?? []

  if (tools.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground">
        {i18next.t("server:Sync tools first using the Sync button above")}
      </p>
    )
  }

  const toolOptions = tools.map((t) => {
    let inputSchema: Record<string, any> = {}
    if (t.inputSchema) {
      try {
        inputSchema = JSON.parse(t.inputSchema)
      } catch {
        // ignore
      }
    }
    return { label: t.name, value: t.name, description: t.description, inputSchema }
  })

  const selectedOpt = toolOptions.find((t) => t.value === testToolName)
  const schema = selectedOpt?.inputSchema ?? {}
  const properties = schema.properties ?? {}
  const requiredArgs: string[] = schema.required ?? []

  async function sendTest() {
    if (!testToolName) {
      toast.error(i18next.t("server:Please select a tool first"))
      return
    }

    const args: Record<string, any> = {}
    for (const [k, v] of Object.entries(testArgValues)) {
      if (v === "" || v === undefined || v === null) continue
      const prop = properties[k]
      if (!prop) {
        args[k] = v
        continue
      }
      if (prop.type === "object" || prop.type === "array") {
        try {
          args[k] = JSON.parse(String(v))
        } catch {
          args[k] = v
        }
      } else if (prop.type === "number" || prop.type === "integer") {
        args[k] = Number(v)
      } else {
        args[k] = v
      }
    }

    const serverCopy = clone(server)
    serverCopy.testContent = JSON.stringify({ tool: testToolName, arguments: args })

    setTestLoading(true)
    setTestResult("")
    try {
      const res = await testMcpServer(serverCopy)
      if (res.status === "ok") {
        const out = typeof res.data === "string" ? res.data : JSON.stringify(res.data, null, 2)
        setTestResult(out)
        toast.success(i18next.t("general:Success"))
      } else {
        toast.error(res.msg || i18next.t("general:Failed to save"))
      }
    } catch (err) {
      toast.error(`${i18next.t("general:Failed to connect to server")}: ${(err as Error).message}`)
    } finally {
      setTestLoading(false)
    }
  }

  function setArgValue(key: string, value: string | number | boolean) {
    setTestArgValues((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tool selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-muted-foreground">
          {i18next.t("general:Tool")}
        </label>
        <Select
          value={testToolName || undefined}
          onValueChange={(v) => {
            setTestToolName(v ?? "")
            setTestArgValues({})
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={i18next.t("server:Select tool...")} />
          </SelectTrigger>
          <SelectContent>
            {toolOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex flex-col">
                  <span className="font-medium">{opt.value}</span>
                  {opt.description && (
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Argument fields */}
      {testToolName && Object.keys(properties).length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="mb-3 text-sm font-medium text-muted-foreground">
            {i18next.t("chat:Arguments")}:
          </p>
          <div className="flex flex-col gap-3">
            {Object.entries(properties).map(([argName, argSchema]: [string, any]) => {
              const isRequired = requiredArgs.includes(argName)
              const type: string = argSchema.type || "string"
              return (
                <div key={argName} className="flex items-start gap-3">
                  <div className="w-40 shrink-0 pt-2 text-right text-sm">
                    <span className={isRequired ? "font-semibold text-destructive" : ""}>
                      {isRequired && "* "}{argName}
                    </span>
                    {argSchema.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{argSchema.description}</p>
                    )}
                  </div>
                  <div className="flex-1">
                    {type === "boolean" ? (
                      <div className="pt-2">
                        <Switch
                          checked={!!testArgValues[argName]}
                          onCheckedChange={(v) => setArgValue(argName, v)}
                        />
                      </div>
                    ) : type === "number" || type === "integer" ? (
                      <Input
                        type="number"
                        value={testArgValues[argName] !== undefined ? String(testArgValues[argName]) : ""}
                        onChange={(e) => setArgValue(argName, e.target.value)}
                      />
                    ) : type === "array" || type === "object" ? (
                      <Textarea
                        rows={3}
                        placeholder="JSON..."
                        value={String(testArgValues[argName] ?? "")}
                        onChange={(e) => setArgValue(argName, e.target.value)}
                        className="font-mono text-sm"
                      />
                    ) : (
                      <Input
                        value={String(testArgValues[argName] ?? "")}
                        onChange={(e) => setArgValue(argName, e.target.value)}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {testToolName && Object.keys(properties).length === 0 && (
        <p className="text-sm italic text-muted-foreground">
          {i18next.t("server:This tool takes no arguments")}
        </p>
      )}

      {/* Invoke button */}
      <div>
        <Button onClick={sendTest} disabled={testLoading || !testToolName}>
          {testLoading ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <PlayIcon className="h-4 w-4" />
          )}
          {i18next.t("provider:Invoke MCP tool")}
        </Button>
      </div>

      {/* Result */}
      {testResult && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-muted-foreground">
            {i18next.t("provider:MCP tool result")}:
          </label>
          <Textarea
            className="min-h-32 font-mono text-sm"
            value={testResult}
            readOnly
          />
        </div>
      )}
    </div>
  )
}

// ── ServerEditPage ────────────────────────────────────────────────────────────

export default function ServerEditPage() {
  const { serverName } = useParams<{ serverName: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [server, setServer] = useState<Server | null>(null)
  const [originalName, setOriginalName] = useState(serverName || "")
  const [originalOwner, setOriginalOwner] = useState("admin")
  const [isNewServer, setIsNewServer] = useState(!!location.state?.isNewServer)
  const [saving, setSaving] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)

  useEffect(() => {
    if (!serverName) return
    getServer("admin", serverName).then((res) => {
      if (res.status === "ok") {
        const s: Server = res.data
        setServer(s)
        setOriginalName(s.name)
        setOriginalOwner(s.owner)
      } else {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      }
    })
  }, [serverName])

  function update<K extends keyof Server>(key: K, value: Server[K]) {
    setServer((prev) => (prev ? { ...prev, [key]: value } : null))
  }

  async function save(exit: boolean) {
    if (!server) return
    setSaving(true)
    try {
      const res = await updateServer(originalOwner, originalName, clone(server))
      if (res.status === "ok") {
        toast.success(i18next.t("general:Successfully saved"))
        setOriginalName(server.name)
        setIsNewServer(false)
        if (exit) {
          navigate("/servers")
        } else {
          navigate(`/servers/${server.name}`, { replace: true })
        }
      } else {
        toast.error(`${i18next.t("general:Failed to save")}: ${res.msg}`)
      }
    } catch (err) {
      toast.error(`${i18next.t("general:Failed to connect to server")}: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    if (isNewServer && server) {
      deleteServer(server)
        .then(() => navigate("/servers"))
        .catch(() => navigate("/servers"))
    } else {
      navigate("/servers")
    }
  }

  function syncTools(isCleared: boolean) {
    if (!server) return
    setSyncLoading(true)
    syncMcpTool(originalOwner, originalName, clone(server), isCleared)
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully saved"))
          // Reload server to get updated tools
          getServer(originalOwner, originalName).then((r) => {
            if (r.status === "ok") setServer(r.data)
          })
        } else {
          toast.error(`${i18next.t("general:Failed to save")}: ${res.msg}`)
        }
      })
      .catch((err: Error) =>
        toast.error(`${i18next.t("general:Failed to connect to server")}: ${err.message}`)
      )
      .finally(() => setSyncLoading(false))
  }

  if (!server) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const baseUrl = `${ServerUrl}/api/get-server?id=${server.owner}/${server.name}`

  return (
    <div className="min-h-screen bg-background px-5 py-4 pb-16">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          {i18next.t("server:Edit MCP Server")}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving}>
            {saving && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
            {i18next.t("general:Save")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => save(true)} disabled={saving}>
            {i18next.t("general:Save & Exit")}
          </Button>
          {isNewServer && (
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
          <Input value={server.name} onChange={(e) => update("name", e.target.value)} />
        </FormField>

        <FormField
          label={i18next.t("general:Display name")}
          tooltip={i18next.t("general:Display name - Tooltip")}
        >
          <Input value={server.displayName ?? ""} onChange={(e) => update("displayName", e.target.value)} />
        </FormField>

        <FormField
          label={i18next.t("general:URL")}
          tooltip={i18next.t("general:URL - Tooltip")}
          className="sm:col-span-2"
        >
          <div className="relative">
            <LinkIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              value={server.url ?? ""}
              onChange={(e) => update("url", e.target.value)}
            />
          </div>
        </FormField>

        <FormField
          label={i18next.t("server:Access token")}
          tooltip={i18next.t("server:Access token - Tooltip")}
          className="sm:col-span-2"
        >
          <PasswordInput
            value={server.token ?? ""}
            onChange={(v) => update("token", v)}
          />
        </FormField>
      </SectionCard>

      {/* Tools */}
      <SectionCard
        title={i18next.t("general:Tools")}
        desc={i18next.t("general:Tools desc")}
      >
        <div className="sm:col-span-2 lg:col-span-3 flex flex-col gap-3">
          {!isNewServer && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => syncTools(false)}
                disabled={syncLoading}
              >
                {syncLoading && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
                {i18next.t("general:Sync")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => syncTools(true)}
                disabled={syncLoading}
              >
                {i18next.t("general:Clear")}
              </Button>
            </div>
          )}
          <ToolTable
            tools={server.tools ?? []}
            onUpdate={(tools) => update("tools", tools)}
          />
        </div>
      </SectionCard>

      {/* Test */}
      <SectionCard
        title={i18next.t("general:Test")}
        desc={i18next.t("general:Test desc")}
      >
        <div className="sm:col-span-2 lg:col-span-3 flex flex-col gap-4">
          <TestMcpWidget server={server} />

          <FormField
            label={i18next.t("server:Base URL")}
            tooltip={i18next.t("server:Base URL - Tooltip")}
          >
            <div className="relative">
              <LinkIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                readOnly
                value={baseUrl}
              />
            </div>
          </FormField>
        </div>
      </SectionCard>

      {/* Bottom save buttons */}
      <div className="mt-6 flex items-center gap-2">
        <Button onClick={() => save(false)} disabled={saving}>
          {saving && <Loader2Icon className="h-4 w-4 animate-spin" />}
          {i18next.t("general:Save")}
        </Button>
        <Button variant="outline" onClick={() => save(true)} disabled={saving}>
          {i18next.t("general:Save & Exit")}
        </Button>
        {isNewServer && (
          <Button variant="outline" onClick={cancel}>
            {i18next.t("general:Cancel")}
          </Button>
        )}
      </div>
    </div>
  )
}

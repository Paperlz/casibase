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
import { useNavigate, useParams, useLocation } from "react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { type RecordEntry, deleteRecord, getRecord, updateRecord } from "~/backend/RecordBackend"
import { useAccount } from "~/context/AccountContext"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Switch } from "~/components/ui/switch"
import { FormField, SectionCard } from "~/lib/Setting"

export function meta() {
  return [{ title: "View Record — OpenAgent" }]
}

const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "CONNECT", "OPTIONS", "TRACE", "PATCH"]

function tryFormatJson(text: string | undefined | null): string {
  if (!text) return ""
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

export default function RecordEditPage() {
  const { organizationName, recordName } = useParams<{
    organizationName: string
    recordName: string
  }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { account } = useAccount()

  const [record, setRecord] = useState<RecordEntry | null>(null)
  const [originalName, setOriginalName] = useState("")
  const [isNew, setIsNew] = useState(
    (location.state as { mode?: string } | null)?.mode === "add"
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!recordName || !account) return
    loadRecord(recordName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordName, account?.owner])

  function loadRecord(name: string) {
    const owner = account?.owner ?? "admin"
    getRecord(owner, name).then((res) => {
      if (res.status === "ok") {
        setRecord(res.data as RecordEntry)
        setOriginalName(res.data.name)
      } else {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      }
    })
  }

  function update<K extends keyof RecordEntry>(key: K, value: RecordEntry[K]) {
    setRecord((r) => (r ? { ...r, [key]: value } : null))
  }

  async function save(exit: boolean) {
    if (!record || !originalName) return
    setSaving(true)
    try {
      const owner = record.owner
      const res = await updateRecord(owner, originalName, record)
      if (res.status === "ok") {
        toast.success(i18next.t("general:Successfully saved"))
        setIsNew(false)
        setOriginalName(record.name)
        if (exit) {
          navigate("/records")
        } else {
          navigate(`/records/${record.owner}/${encodeURIComponent(record.id ?? record.name)}`, { replace: true })
          loadRecord(record.id ?? record.name)
        }
      } else {
        toast.error(`${i18next.t("general:Failed to save")}: ${res.msg}`)
      }
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    if (isNew && record) {
      deleteRecord(record).then((res) => {
        if (res.status === "ok") {
          navigate("/records")
        } else {
          toast.error(`${i18next.t("general:Failed to delete")}: ${res.msg}`)
        }
      })
    } else {
      navigate("/records")
    }
  }

  if (!record) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const pageTitle = isNew
    ? i18next.t("record:New Record")
    : i18next.t("record:View Record")

  return (
    <div className="min-h-screen bg-background px-5 py-4 pb-16">
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{pageTitle}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving}>
            {saving && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
            {i18next.t("general:Save")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => save(true)} disabled={saving}>
            {i18next.t("general:Save & Exit")}
          </Button>
          {isNew && (
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
        <FormField
          label={i18next.t("general:Organization")}
          tooltip={i18next.t("general:Organization - Tooltip")}
        >
          <Input value={record.owner} disabled className="bg-muted" />
        </FormField>

        <FormField
          label={i18next.t("general:Name")}
          tooltip={i18next.t("general:Name - Tooltip")}
        >
          <Input value={record.name} disabled className="bg-muted" />
        </FormField>

        <FormField
          label={i18next.t("general:Client IP")}
          tooltip={i18next.t("general:Client IP - Tooltip")}
        >
          <Input value={record.clientIp ?? ""} disabled className="bg-muted" />
        </FormField>

        <FormField
          label={i18next.t("general:User")}
          tooltip={i18next.t("general:User - Tooltip")}
        >
          <Input value={record.user ?? ""} disabled className="bg-muted" />
        </FormField>

        <FormField
          label={i18next.t("general:Method")}
          tooltip={i18next.t("general:Method - Tooltip")}
        >
          <Select value={record.method ?? ""}>
            <SelectTrigger className="bg-muted" disabled>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HTTP_METHODS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label={i18next.t("general:Request URI")}
          tooltip={i18next.t("general:Request URI - Tooltip")}
          className="sm:col-span-2"
        >
          <Input value={record.requestUri ?? ""} disabled className="bg-muted" />
        </FormField>

        <FormField
          label={i18next.t("general:Action")}
          tooltip={i18next.t("general:Action - Tooltip")}
        >
          <Input value={record.action ?? ""} disabled className="bg-muted" />
        </FormField>

        <FormField
          label={i18next.t("general:Language")}
          tooltip={i18next.t("general:Language - Tooltip")}
        >
          <Input value={record.language ?? ""} disabled className="bg-muted" />
        </FormField>

        <FormField
          label={i18next.t("general:Region")}
          tooltip={i18next.t("general:Region - Tooltip")}
        >
          <Input value={record.region ?? ""} disabled className="bg-muted" />
        </FormField>

        <FormField
          label={i18next.t("general:City")}
          tooltip={i18next.t("general:City - Tooltip")}
        >
          <Input value={record.city ?? ""} disabled className="bg-muted" />
        </FormField>

        <FormField
          label={i18next.t("general:Unit")}
          tooltip={i18next.t("general:Unit - Tooltip")}
        >
          <Input value={record.unit ?? ""} disabled className="bg-muted" />
        </FormField>

        <FormField
          label={i18next.t("general:Section")}
          tooltip={i18next.t("general:Section - Tooltip")}
        >
          <Input value={record.section ?? ""} disabled className="bg-muted" />
        </FormField>

        <FormField
          label={i18next.t("general:Count")}
          tooltip={i18next.t("general:Count - Tooltip")}
        >
          <Input
            type="number"
            value={record.count === 0 || !record.count ? 1 : record.count}
            onChange={(e) => update("count", parseInt(e.target.value, 10) || 0)}
          />
        </FormField>
      </SectionCard>

      {/* Content */}
      <SectionCard title={i18next.t("general:Content")}>
        <FormField
          label={i18next.t("general:Object")}
          tooltip={i18next.t("general:Object - Tooltip")}
          className="sm:col-span-2 lg:col-span-3"
        >
          <pre className="h-[300px] overflow-auto rounded-md border border-input bg-muted p-3 font-mono text-sm">
            {tryFormatJson(record.object)}
          </pre>
        </FormField>

        <FormField
          label={i18next.t("general:Response")}
          tooltip={i18next.t("general:Response - Tooltip")}
          className="sm:col-span-2 lg:col-span-3"
        >
          <pre className="h-[300px] overflow-auto rounded-md border border-input bg-muted p-3 font-mono text-sm">
            {tryFormatJson(record.response)}
          </pre>
        </FormField>

        <FormField
          label={i18next.t("general:Is triggered")}
          tooltip={i18next.t("general:Is triggered - Tooltip")}
        >
          <div className="flex h-9 items-center">
            <Switch checked={record.isTriggered ?? false} disabled />
          </div>
        </FormField>
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
        {isNew && (
          <Button variant="outline" onClick={handleCancel}>
            {i18next.t("general:Cancel")}
          </Button>
        )}
      </div>
    </div>
  )
}

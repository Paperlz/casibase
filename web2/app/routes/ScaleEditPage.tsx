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

import { type Scale, getScale, updateScale } from "~/backend/ScaleBackend"
import { isAdminUser } from "~/backend/AccountBackend"
import { useAccount } from "~/context/AccountContext"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { FormField, SectionCard } from "~/lib/Setting"

export function meta() {
  return [{ title: "Edit Scale — OpenAgent" }]
}

export default function ScaleEditPage() {
  const params = useParams<{ owner: string; scaleName: string }>()
  const owner = params.owner ?? ""
  const scaleName = params.scaleName ?? ""

  const navigate = useNavigate()
  const location = useLocation()

  const { account } = useAccount()
  const isAdmin = isAdminUser(account)

  const [scale, setScale] = useState<Scale | null>(null)
  const [originalName, setOriginalName] = useState("")
  const [isNewScale] = useState(
    (location.state as { isNewScale?: boolean } | null)?.isNewScale ?? false
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!owner || !scaleName) return
    loadScale()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, scaleName])

  function loadScale() {
    getScale(owner, scaleName).then((res) => {
      if (res.status === "ok") {
        setScale(res.data)
        setOriginalName(res.data.name)
      } else {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      }
    })
  }

  function update<K extends keyof Scale>(key: K, value: Scale[K]) {
    setScale((s) => (s ? { ...s, [key]: value } : null))
  }

  async function save(exit: boolean) {
    if (!scale || !owner) return
    setSaving(true)
    try {
      const res = await updateScale(owner, originalName, scale)
      if (res.status === "ok" && res.data) {
        toast.success(i18next.t("general:Successfully saved"))
        setOriginalName(scale.name)
        if (exit) {
          navigate("/scales")
        } else {
          navigate(`/scales/${scale.owner}/${scale.name}`, { replace: true })
          loadScale()
        }
      } else {
        toast.error(`${i18next.t("general:Failed to save")}: ${res.msg}`)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!scale) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-5 py-4 pb-16">
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{i18next.t("task:Edit Scale")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving}>
            {saving && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
            {i18next.t("general:Save")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => save(true)} disabled={saving}>
            {i18next.t("general:Save & Exit")}
          </Button>
          {isNewScale && (
            <Button variant="outline" size="sm" onClick={() => navigate("/scales")}>
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
          <Input value={scale.name} onChange={(e) => update("name", e.target.value)} />
        </FormField>

        <FormField
          label={i18next.t("general:Display name")}
          tooltip={i18next.t("general:Display name - Tooltip")}
        >
          <Input value={scale.displayName ?? ""} onChange={(e) => update("displayName", e.target.value)} />
        </FormField>

        {isAdmin && (
          <FormField label={i18next.t("general:State")} tooltip={i18next.t("general:State - Tooltip")}>
            <Select
              value={scale.state ?? "Public"}
              onValueChange={(v) => update("state", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Public">{i18next.t("video:Public")}</SelectItem>
                <SelectItem value="Hidden">{i18next.t("video:Hidden")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        )}
      </SectionCard>

      {/* Content */}
      <SectionCard title={i18next.t("general:Content")}>
        <FormField
          label={i18next.t("general:Text")}
          tooltip={i18next.t("task:Scale - Tooltip")}
          className="sm:col-span-2 lg:col-span-3"
        >
          <Textarea
            rows={12}
            value={scale.text ?? ""}
            onChange={(e) => update("text", e.target.value)}
            className="font-mono text-sm"
          />
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
        {isNewScale && (
          <Button variant="outline" onClick={() => navigate("/scales")}>
            {i18next.t("general:Cancel")}
          </Button>
        )}
      </div>
    </div>
  )
}

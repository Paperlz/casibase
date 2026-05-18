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

import { type Vector, deleteVector, getVector, updateVector } from "~/backend/VectorBackend"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Textarea } from "~/components/ui/textarea"
import { FormField, SectionCard } from "~/lib/Setting"

export function meta() {
  return [{ title: "Edit Vector — OpenAgent" }]
}

export default function VectorEditPage() {
  const { vectorName } = useParams<{ vectorName: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const [vector, setVector] = useState<Vector | null>(null)
  const [originalName, setOriginalName] = useState("")
  const [isNewVector, setIsNewVector] = useState(
    (location.state as { isNewVector?: boolean } | null)?.isNewVector ?? false
  )
  const [saving, setSaving] = useState(false)

  const isViewMode = new URLSearchParams(location.search).get("mode") === "view"

  useEffect(() => {
    if (!vectorName) return
    loadVector(vectorName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vectorName])

  function loadVector(name: string) {
    getVector("admin", name).then((res) => {
      if (res.data === null) {
        navigate("/404")
        return
      }
      if (res.status === "ok") {
        setVector(res.data as Vector)
        setOriginalName(res.data.name)
      } else {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      }
    })
  }

  function update<K extends keyof Vector>(key: K, value: Vector[K]) {
    setVector((v) => (v ? { ...v, [key]: value } : null))
  }

  async function save(exit: boolean) {
    if (!vector || !vectorName) return
    setSaving(true)
    try {
      const res = await updateVector(vector.owner, originalName, vector)
      if (res.status === "ok") {
        toast.success(i18next.t("general:Successfully saved"))
        setIsNewVector(false)
        setOriginalName(vector.name)
        if (exit) {
          navigate("/vectors")
        } else {
          navigate(`/vectors/${vector.name}`, { replace: true })
          loadVector(vector.name)
        }
      } else {
        toast.error(`${i18next.t("general:Failed to save")}: ${res.msg}`)
      }
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    if (isNewVector && vector) {
      deleteVector(vector).then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Cancelled successfully"))
          navigate("/vectors")
        } else {
          toast.error(`${i18next.t("general:Failed to cancel")}: ${res.msg}`)
        }
      })
    } else {
      navigate("/vectors")
    }
  }

  if (!vector) {
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
        <h1 className="text-xl font-semibold tracking-tight">
          {isViewMode ? i18next.t("vector:View Vector") : i18next.t("vector:Edit Vector")}
        </h1>
        {!isViewMode && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving}>
              {saving && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
              {i18next.t("general:Save")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => save(true)} disabled={saving}>
              {i18next.t("general:Save & Exit")}
            </Button>
            {isNewVector && (
              <Button variant="outline" size="sm" onClick={handleCancel}>
                {i18next.t("general:Cancel")}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* General Settings */}
      <SectionCard
        title={i18next.t("general:General Settings")}
        desc={i18next.t("general:General Settings desc")}
      >
        <FormField label={i18next.t("general:Name")} tooltip={i18next.t("general:Name - Tooltip")}>
          <Input
            value={vector.name}
            disabled={isViewMode}
            onChange={(e) => update("name", e.target.value)}
          />
        </FormField>
        <FormField label={i18next.t("general:Display name")} tooltip={i18next.t("general:Display name - Tooltip")}>
          <Input
            value={vector.displayName ?? ""}
            disabled={isViewMode}
            onChange={(e) => update("displayName", e.target.value)}
          />
        </FormField>
        <FormField label={i18next.t("general:Store")} tooltip={i18next.t("general:Store - Tooltip")}>
          <Input
            value={vector.store ?? ""}
            disabled={isViewMode}
            onChange={(e) => update("store", e.target.value)}
          />
        </FormField>
        <FormField label={i18next.t("general:Provider")} tooltip={i18next.t("general:Provider - Tooltip")}>
          <Input
            value={vector.provider ?? ""}
            disabled={isViewMode}
            onChange={(e) => update("provider", e.target.value)}
          />
        </FormField>
        <FormField label={i18next.t("store:File")} tooltip={i18next.t("store:File - Tooltip")}>
          <Input
            value={vector.file ?? ""}
            disabled={isViewMode}
            onChange={(e) => update("file", e.target.value)}
          />
        </FormField>
        <FormField label={i18next.t("general:Size")} tooltip={i18next.t("general:Size - Tooltip")}>
          <Input
            type="number"
            value={vector.size ?? ""}
            disabled
            className="bg-muted"
          />
        </FormField>
        <FormField label={i18next.t("vector:Dimension")} tooltip={i18next.t("vector:Dimension - Tooltip")}>
          <Input
            type="number"
            value={vector.dimension ?? ""}
            disabled
            className="bg-muted"
          />
        </FormField>
      </SectionCard>

      {/* Content */}
      <SectionCard title={i18next.t("general:Content")}>
        <FormField
          label={i18next.t("general:Text")}
          tooltip={i18next.t("general:Text - Tooltip")}
          className="sm:col-span-2 lg:col-span-3"
        >
          <Textarea
            value={vector.text ?? ""}
            disabled={isViewMode}
            onChange={(e) => update("text", e.target.value)}
            className="min-h-40 font-mono text-sm"
          />
        </FormField>
        <FormField
          label={i18next.t("general:Data")}
          tooltip={i18next.t("general:Data - Tooltip")}
          className="sm:col-span-2 lg:col-span-3"
        >
          <Textarea
            value={Array.isArray(vector.data) ? vector.data.join(", ") : (vector.data ?? "")}
            disabled={isViewMode}
            onChange={(e) => {
              const parsed = e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n))
              update("data", parsed)
            }}
            className="min-h-16 font-mono text-sm"
          />
        </FormField>
      </SectionCard>

      {/* Bottom action bar */}
      {!isViewMode && (
        <div className="mt-6 flex items-center gap-2">
          <Button onClick={() => save(false)} disabled={saving}>
            {saving && <Loader2Icon className="h-4 w-4 animate-spin" />}
            {i18next.t("general:Save")}
          </Button>
          <Button variant="outline" onClick={() => save(true)} disabled={saving}>
            {i18next.t("general:Save & Exit")}
          </Button>
          {isNewVector && (
            <Button variant="outline" onClick={handleCancel}>
              {i18next.t("general:Cancel")}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

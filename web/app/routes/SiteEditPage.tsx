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
import { useNavigate, useParams } from "react-router"
import { LinkIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { type Site, getSite, updateSite } from "~/backend/SiteBackend"
import { getSigninOptions, isAdminUser } from "~/backend/AccountBackend"
import { useAccount } from "~/context/AccountContext"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Switch } from "~/components/ui/switch"
import { Textarea } from "~/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  FormField,
  ImageUploadField,
  PasswordInput,
  SectionCard,
} from "~/lib/Setting"
import { NavItemTree } from "~/lib/NavItemTree"

export function meta() {
  return [{ title: "Edit Site — OpenAgent" }]
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SiteEditPage() {
  const { owner, siteName } = useParams<{ owner: string; siteName: string }>()
  const navigate = useNavigate()
  const { account } = useAccount()

  const [site, setSite] = useState<Site | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingFavicon, setUploadingFavicon] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [casdoorAvailable, setCasdoorAvailable] = useState(false)

  useEffect(() => {
    if (!owner || !siteName) return
    getSite(owner, siteName).then((res) => {
      if (res.status === "ok") {
        setSite(res.data)
      } else {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      }
    })
    getSigninOptions().then((res) => {
      if (res.status === "ok") {
        setCasdoorAvailable(res.data?.casdoorAvailable ?? false)
      }
    })
  }, [owner, siteName])

  function update<K extends keyof Site>(key: K, value: Site[K]) {
    setSite((s) => (s ? { ...s, [key]: value } : null))
  }

  async function save(exit: boolean) {
    if (!site || !owner || !siteName) return
    setSaving(true)
    try {
      const res = await updateSite(owner, siteName, site)
      if (res.status === "ok") {
        toast.success(i18next.t("general:Successfully saved"))
        if (site.name === "site-built-in") {
          window.dispatchEvent(new Event("openagent:site-updated"))
        }
        if (exit) {
          navigate("/sites")
        } else {
          navigate(`/sites/${site.owner}/${site.name}`, { replace: true })
        }
      } else {
        toast.error(`${i18next.t("general:Failed to save")}: ${res.msg}`)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!site) {
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
        <h1 className="text-xl font-semibold tracking-tight">{i18next.t("site:Edit Site")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving}>
            {saving && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
            {i18next.t("general:Save")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => save(true)} disabled={saving}>
            {i18next.t("general:Save & Exit")}
          </Button>
        </div>
      </div>

      {/* General Settings */}
      <SectionCard
        title={i18next.t("general:General Settings")}
        desc={i18next.t("general:General Settings desc")}
      >
        <FormField label={i18next.t("general:Name")} tooltip={i18next.t("general:Name - Tooltip")}>
          <Input
            value={site.name}
            disabled={site.name === "site-built-in"}
            onChange={(e) => update("name", e.target.value)}
          />
        </FormField>
        <FormField label={i18next.t("general:Display name")} tooltip={i18next.t("general:Display name - Tooltip")}>
          <Input
            value={site.displayName}
            onChange={(e) => update("displayName", e.target.value)}
          />
        </FormField>
        <FormField label={i18next.t("general:HTML title")} tooltip={i18next.t("general:HTML title - Tooltip")}>
          <Input
            value={site.htmlTitle ?? ""}
            onChange={(e) => update("htmlTitle", e.target.value)}
          />
        </FormField>
        <FormField label={i18next.t("store:Theme color")} tooltip={i18next.t("store:Theme color - Tooltip")}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={site.themeColor || "#1890ff"}
              className="h-9 w-16 cursor-pointer rounded-md border border-input p-0.5"
              onChange={(e) => update("themeColor", e.target.value)}
            />
            <span className="text-sm text-muted-foreground">{site.themeColor || ""}</span>
          </div>
        </FormField>
      </SectionCard>

      {/* Branding */}
      <Card className="mt-4">
        <CardHeader className="border-b pb-4">
          <CardTitle>{i18next.t("general:Branding")}</CardTitle>
          <CardDescription>{i18next.t("general:Branding desc")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ImageUploadField
              label={i18next.t("general:Favicon URL")}
              tooltip={i18next.t("general:Favicon URL - Tooltip")}
              value={site.faviconUrl ?? ""}
              onChange={(url) => update("faviconUrl", url)}
              siteName={site.name}
              uploading={uploadingFavicon}
              onUploading={setUploadingFavicon}
            />
            <ImageUploadField
              label={i18next.t("general:Logo URL")}
              tooltip={i18next.t("general:Logo URL - Tooltip")}
              value={site.logoUrl ?? ""}
              onChange={(url) => update("logoUrl", url)}
              siteName={site.name}
              uploading={uploadingLogo}
              onUploading={setUploadingLogo}
            />
            <FormField label={i18next.t("general:Static base URL")} tooltip={i18next.t("general:Static base URL - Tooltip")}>
              <div className="relative">
                <LinkIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={site.staticBaseUrl ?? ""}
                  onChange={(e) => update("staticBaseUrl", e.target.value)}
                  className="pl-8"
                />
              </div>
            </FormField>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      <Card className="mt-4">
        <CardHeader className="border-b pb-4">
          <CardTitle>{i18next.t("general:Content")}</CardTitle>
          <CardDescription>{i18next.t("general:Content desc")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={i18next.t("general:Navbar HTML")} tooltip={i18next.t("general:Navbar HTML - Tooltip")}>
              <Textarea
                value={site.navbarHtml ?? ""}
                onChange={(e) => update("navbarHtml", e.target.value)}
                className="min-h-24 font-mono text-xs"
              />
            </FormField>
            <FormField label={i18next.t("general:Footer HTML")} tooltip={i18next.t("general:Footer HTML - Tooltip")}>
              <Textarea
                value={site.footerHtml ?? ""}
                onChange={(e) => update("footerHtml", e.target.value)}
                className="min-h-24 font-mono text-xs"
              />
            </FormField>
            <FormField label={i18next.t("store:Navbar items")} tooltip={i18next.t("store:Navbar items - Tooltip")} className="sm:col-span-2">
              <NavItemTree
                value={site.navItems ?? []}
                onChange={(v) => update("navItems", v)}
                disabled={!isAdminUser(account)}
                casdoorAvailable={casdoorAvailable}
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      {/* Authentication */}
      <SectionCard
        title={i18next.t("site:Authentication")}
        desc={i18next.t("site:Authentication desc")}
      >
        <FormField label={i18next.t("site:OIDC issuer")} tooltip={i18next.t("site:OIDC issuer - Tooltip")} className="sm:col-span-2 lg:col-span-3">
          <div className="relative">
            <LinkIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={site.issuer ?? ""}
              onChange={(e) => update("issuer", e.target.value)}
              className="pl-8"
            />
          </div>
        </FormField>
        <FormField label={i18next.t("provider:Client ID")} tooltip={i18next.t("provider:Client ID - Tooltip")}>
          <Input
            value={site.clientId ?? ""}
            onChange={(e) => update("clientId", e.target.value)}
          />
        </FormField>
        <FormField label={i18next.t("provider:Client secret")} tooltip={i18next.t("provider:Client secret - Tooltip")}>
          <PasswordInput
            value={site.clientSecret ?? ""}
            onChange={(v) => update("clientSecret", v)}
          />
        </FormField>
        <FormField label={i18next.t("site:Check user balance")} tooltip={i18next.t("site:Check user balance - Tooltip")}>
          <div className="flex h-9 items-center">
            <Switch
              checked={site.checkUserBalance ?? false}
              onCheckedChange={(v) => update("checkUserBalance", v)}
            />
          </div>
        </FormField>
      </SectionCard>

      {/* Advanced */}
      <SectionCard
        title={i18next.t("site:Advanced")}
        desc={i18next.t("site:Advanced desc")}
      >
        <FormField label={i18next.t("site:IP parsing mode")} tooltip={i18next.t("site:IP parsing mode - Tooltip")}>
          <Input
            value={site.ipParsingMode ?? ""}
            onChange={(e) => update("ipParsingMode", e.target.value)}
          />
        </FormField>
        <FormField label={i18next.t("site:Parent DB name")} tooltip={i18next.t("site:Parent DB name - Tooltip")}>
          <Input
            value={site.parentDbName ?? ""}
            onChange={(e) => update("parentDbName", e.target.value)}
          />
        </FormField>
        <FormField label={i18next.t("site:Socks5 proxy")} tooltip={i18next.t("site:Socks5 proxy - Tooltip")}>
          <Input
            value={site.socks5Proxy ?? ""}
            onChange={(e) => update("socks5Proxy", e.target.value)}
          />
        </FormField>
        <FormField label={i18next.t("site:Log config")} tooltip={i18next.t("site:Log config - Tooltip")} className="sm:col-span-2 lg:col-span-3">
          <Input
            value={site.logConfig ?? ""}
            onChange={(e) => update("logConfig", e.target.value)}
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
      </div>
    </div>
  )
}

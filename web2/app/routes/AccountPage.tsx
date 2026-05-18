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

import { useState } from "react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { getShortName, updateAccount } from "~/backend/AccountBackend"
import { useAccount } from "~/context/AccountContext"
import { FormField, PasswordInput, SectionCard } from "~/lib/Setting"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"

export function meta() {
  return [{ title: "My Account - OpenAgent" }]
}

function getAvatarColor(s: string): string {
  const colorList = ["#f56a00", "#7265e6", "#ffbf00", "#00a2ae"]
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  const idx = Math.abs(hash) % 4
  return colorList[idx]
}

function AvatarPreview({ avatarUrl, name }: { avatarUrl: string; name: string }) {
  const isUrl =
    avatarUrl.startsWith("http://") ||
    avatarUrl.startsWith("https://") ||
    avatarUrl.startsWith("data:image/")

  if (isUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="h-16 w-16 rounded-full object-cover"
      />
    )
  }

  return (
    <div
      className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-semibold text-white"
      style={{ backgroundColor: getAvatarColor(name) }}
    >
      {getShortName(name).charAt(0).toUpperCase()}
    </div>
  )
}

export default function AccountPage() {
  const { account, reload } = useAccount()

  const [displayName, setDisplayName] = useState(account?.displayName ?? "")
  const [avatar, setAvatar] = useState(account?.avatar ?? "")
  const [saving, setSaving] = useState(false)

  const [passwordOpen, setPasswordOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [settingPassword, setSettingPassword] = useState(false)

  if (!account) return null

  function handleSave() {
    setSaving(true)
    updateAccount({ displayName, avatar })
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully saved"))
          reload()
        } else {
          toast.error(res.msg)
        }
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setSaving(false))
  }

  function closePasswordModal() {
    setPasswordOpen(false)
    setCurrentPassword("")
    setNewPassword("")
  }

  function handleSetPassword() {
    setSettingPassword(true)
    updateAccount({ displayName, avatar, currentPassword, newPassword } as unknown as Parameters<typeof updateAccount>[0])
      .then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Successfully saved"))
          closePasswordModal()
        } else {
          toast.error(res.msg)
        }
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setSettingPassword(false))
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xl font-semibold">{i18next.t("account:My Account")}</span>
        <Button variant="outline" onClick={handleSave} disabled={saving}>
          {i18next.t("general:Save")}
        </Button>
      </div>

      <SectionCard
        title={i18next.t("account:Profile")}
        desc={i18next.t("account:Profile desc")}
      >
        <FormField
          label={i18next.t("general:Name")}
          tooltip={i18next.t("general:Name - Tooltip")}
        >
          <Input value={account.name} disabled placeholder={i18next.t("account:Account ID")} />
        </FormField>

        <FormField
          label={i18next.t("general:Display name")}
          tooltip={i18next.t("general:Display name - Tooltip")}
        >
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={i18next.t("account:Name shown in OpenAgent")}
          />
        </FormField>

        <FormField
          label={i18next.t("general:Avatar")}
          tooltip={i18next.t("general:Avatar - Tooltip")}
          className="sm:col-span-2 lg:col-span-3"
        >
          <div className="flex items-center gap-4">
            <AvatarPreview avatarUrl={avatar} name={account.name} />
            <Input
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder={i18next.t("account:Avatar image URL, optional")}
              className="flex-1"
            />
          </div>
        </FormField>
      </SectionCard>

      <SectionCard
        title={i18next.t("general:Password")}
        desc={i18next.t("account:Password desc")}
      >
        <FormField
          label={i18next.t("general:Password")}
          tooltip={i18next.t("general:Password - Tooltip")}
        >
          <Button variant="outline" onClick={() => setPasswordOpen(true)}>
            {i18next.t("account:Modify password...")}
          </Button>
        </FormField>
      </SectionCard>

      <Dialog open={passwordOpen} onOpenChange={(open) => { if (!open) closePasswordModal() }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{i18next.t("account:Modify password")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5 py-2">
            <FormField label={i18next.t("account:Old Password")}>
              <PasswordInput
                value={currentPassword}
                onChange={setCurrentPassword}
              />
            </FormField>
            <FormField label={i18next.t("account:New password")}>
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePasswordModal}>
              {i18next.t("general:Cancel")}
            </Button>
            <Button onClick={handleSetPassword} disabled={settingPassword}>
              {i18next.t("account:Set Password")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

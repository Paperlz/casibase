import { useEffect, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { deleteMessage, getMessage, getMessages, updateMessage, type Message } from "~/backend/MessageBackend"
import { getChat, type Chat } from "~/backend/ChatBackend"
import { getProviders, type Provider } from "~/backend/ProviderBackend"
import { getProviderLogoURL } from "~/lib/ProviderSetting"
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
import { Textarea } from "~/components/ui/textarea"
import { FormField, SectionCard } from "~/lib/Setting"

export function meta() {
  return [{ title: "Edit Message - OpenAgent" }]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export default function MessageEditPage() {
  const { messageName } = useParams<{ messageName: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { account } = useAccount()

  const [message, setMessage] = useState<Message | null>(null)
  const [currentName, setCurrentName] = useState(messageName || "")
  const [isNewMessage, setIsNewMessage] = useState(!!location.state?.isNewMessage)
  const [saving, setSaving] = useState(false)
  const [allMessages, setAllMessages] = useState<Message[]>([])
  const [chat, setChat] = useState<Chat | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])

  useEffect(() => {
    if (!messageName) return
    getMessage("admin", messageName).then((res) => {
      if (res.status === "ok") {
        setMessage(res.data)
        setCurrentName(messageName)
        if (res.data.chat) {
          loadChat(res.data.chat)
        }
        if (res.data.modelProvider) {
          // provider is already in the list fetched below
        }
      } else {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      }
    })
  }, [messageName])

  useEffect(() => {
    if (!account) return
    getMessages(account.name).then((res) => {
      if (res.status === "ok") {
        setAllMessages(res.data ?? [])
      }
    })
    getProviders("admin", "", "", "10000", "", "", "", "").then((res) => {
      if (res.status === "ok") {
        setProviders((res.data ?? []).filter((p: Provider) => p.category === "Model"))
      }
    })
  }, [account?.name])

  function loadChat(chatName: string) {
    getChat("admin", chatName).then((res) => {
      if (res.status === "ok") {
        setChat(res.data)
      }
    })
  }

  function update<K extends keyof Message>(key: K, value: Message[K]) {
    setMessage((prev) => (prev ? { ...prev, [key]: value } : null))
  }

  async function save(exit: boolean) {
    if (!message) return
    setSaving(true)
    try {
      const payload = clone(message)
      const res = await updateMessage(message.owner, currentName, payload)
      if (res.status === "ok") {
        toast.success(i18next.t("general:Successfully saved"))
        setCurrentName(message.name)
        setIsNewMessage(false)
        if (exit) {
          navigate("/messages")
        } else {
          navigate(`/messages/${message.name}`, { replace: true })
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
    if (isNewMessage && message) {
      deleteMessage(message)
        .then((res) => {
          if (res.status === "ok") {
            toast.success(i18next.t("general:Cancelled successfully"))
            navigate("/messages")
          } else {
            toast.error(`${i18next.t("general:Failed to cancel")}: ${res.msg}`)
          }
        })
        .catch((err: Error) => toast.error(err.message))
    } else {
      navigate("/messages")
    }
  }

  if (!message) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const chatUsers: string[] = (chat as any)?.users ?? []

  return (
    <div className="min-h-screen bg-background px-5 py-4 pb-16">
      {/* Page header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          {i18next.t("message:Edit Message")}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving}>
            {saving && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
            {i18next.t("general:Save")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => save(true)} disabled={saving}>
            {i18next.t("general:Save & Exit")}
          </Button>
          {isNewMessage && (
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
        <FormField
          label={i18next.t("general:Name")}
          tooltip={i18next.t("general:Name - Tooltip")}
        >
          <Input
            value={message.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </FormField>

        <FormField
          label={i18next.t("general:User")}
          tooltip={i18next.t("general:User - Tooltip")}
        >
          <Input
            value={message.user ?? ""}
            onChange={(e) => update("user", e.target.value)}
          />
        </FormField>

        <FormField
          label={i18next.t("general:Chat")}
          tooltip={i18next.t("general:Chat - Tooltip")}
        >
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => message.chat && navigate(`/chats/${message.chat}`)}
          >
            {message.chat || "—"}
          </Button>
        </FormField>

        <FormField
          label={i18next.t("message:Author")}
          tooltip={i18next.t("message:Author - Tooltip")}
        >
          <Select
            value={message.author ?? ""}
            onValueChange={(v) => update("author", v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {chatUsers.map((user) => (
                <SelectItem key={user} value={user}>
                  {user}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label={i18next.t("provider:Model provider")}
          tooltip={i18next.t("provider:Model provider - Tooltip")}
          className="sm:col-span-2"
        >
          <Select
            value={message.modelProvider ?? ""}
            onValueChange={(v) => update("modelProvider", v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  <span className="flex items-center gap-2">
                    <img
                      src={getProviderLogoURL({ category: p.category, type: p.type })}
                      alt={p.type}
                      className="h-5 w-5 object-contain"
                      onError={(e) => {
                        ;(e.currentTarget as HTMLImageElement).style.display = "none"
                      }}
                    />
                    {p.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label={i18next.t("message:Reply to")}
          tooltip={i18next.t("message:Reply to - Tooltip")}
          className="sm:col-span-2"
        >
          <Select
            value={message.replyTo ?? ""}
            onValueChange={(v) => update("replyTo", v ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {allMessages.map((m) => (
                <SelectItem key={m.name} value={m.name}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </SectionCard>

      {/* Content */}
      <SectionCard title={i18next.t("general:Content")}>
        <FormField
          label={i18next.t("general:Reasoning text")}
          tooltip={i18next.t("general:Reasoning text - Tooltip")}
          className="sm:col-span-2 lg:col-span-3"
        >
          <Textarea
            className="min-h-16 resize-y"
            value={message.reasonText ?? ""}
            onChange={(e) => update("reasonText", e.target.value)}
          />
        </FormField>

        <FormField
          label={i18next.t("general:Text")}
          tooltip={i18next.t("general:Text - Tooltip")}
          className="sm:col-span-2 lg:col-span-3"
        >
          <Textarea
            className="min-h-24 resize-y"
            value={message.text ?? ""}
            onChange={(e) => update("text", e.target.value)}
          />
        </FormField>

        <FormField
          label={i18next.t("message:Error text")}
          tooltip={i18next.t("message:Error text - Tooltip")}
          className="sm:col-span-2 lg:col-span-3"
        >
          <Textarea
            className="min-h-16 resize-y"
            value={message.errorText ?? ""}
            onChange={(e) => update("errorText", e.target.value)}
          />
        </FormField>

        <FormField
          label={i18next.t("message:Comment")}
          tooltip={i18next.t("message:Comment - Tooltip")}
          className="sm:col-span-2 lg:col-span-3"
        >
          <Textarea
            className="min-h-16 resize-y"
            value={message.comment ?? ""}
            onChange={(e) => {
              const val = e.target.value
              update("needNotify", val !== "")
              update("comment", val)
            }}
          />
        </FormField>
      </SectionCard>

      {/* Options */}
      <SectionCard title={i18next.t("general:Options")}>
        <FormField
          label={i18next.t("message:Need notify")}
          tooltip={i18next.t("message:Need notify - Tooltip")}
        >
          <Switch
            checked={!!message.needNotify}
            onCheckedChange={(checked) => update("needNotify", checked)}
          />
        </FormField>

        <FormField
          label={i18next.t("general:Is deleted")}
          tooltip={i18next.t("general:Is deleted - Tooltip")}
        >
          <Switch
            checked={!!message.isDeleted}
            onCheckedChange={(checked) => update("isDeleted", checked)}
          />
        </FormField>

        <FormField
          label={i18next.t("general:Is alerted")}
          tooltip={i18next.t("general:Is alerted - Tooltip")}
        >
          <Switch
            checked={!!message.isAlerted}
            onCheckedChange={(checked) => update("isAlerted", checked)}
          />
        </FormField>
      </SectionCard>

      {/* Bottom action buttons */}
      <div className="mt-6 flex items-center gap-2">
        <Button onClick={() => save(false)} disabled={saving}>
          {saving && <Loader2Icon className="h-4 w-4 animate-spin" />}
          {i18next.t("general:Save")}
        </Button>
        <Button variant="outline" onClick={() => save(true)} disabled={saving}>
          {i18next.t("general:Save & Exit")}
        </Button>
        {isNewMessage && (
          <Button variant="outline" onClick={cancel}>
            {i18next.t("general:Cancel")}
          </Button>
        )}
      </div>
    </div>
  )
}

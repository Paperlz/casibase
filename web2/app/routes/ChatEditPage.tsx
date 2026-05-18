import { useEffect, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import {
  getChat,
  updateChat,
  deleteChat,
  type Chat,
} from "~/backend/ChatBackend"
import { getChatMessages, type Message } from "~/backend/MessageBackend"
import { getProviders, getProviderLogoUrl, type Provider } from "~/backend/ProviderBackend"
import { useAccount } from "~/context/AccountContext"
import { FormField, SectionCard } from "~/lib/Setting"
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

export function meta() {
  return [{ title: "Edit Chat - OpenAgent" }]
}

function getFormattedDate(date?: string | null): string {
  if (!date) return ""
  return date.replace("T", " ").replace("+08:00", " ").trim()
}

function ChatMessagesViewer({ messages }: { messages: Message[] | null }) {
  if (!messages) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2Icon className="h-5 w-5 animate-spin" />
      </div>
    )
  }
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {i18next.t("general:No data")}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-4 h-full">
      {messages.map((msg, i) => {
        const isAI = msg.author === "AI"
        return (
          <div
            key={msg.name || i}
            className={`flex ${isAI ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${
                isAI
                  ? "bg-muted text-foreground"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              <div className="mb-0.5 text-xs font-semibold opacity-60">
                {isAI ? "AI" : msg.author}
                {msg.createdTime && (
                  <span className="ml-2 font-normal">{getFormattedDate(msg.createdTime)}</span>
                )}
              </div>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {msg.text}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ChatEditPage() {
  const { chatName } = useParams<{ chatName: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { account } = useAccount()

  const [chat, setChat] = useState<Chat | null>(null)
  const [currentName, setCurrentName] = useState(chatName || "")
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [saving, setSaving] = useState(false)
  const [isNewChat] = useState(!!location.state?.isNewChat)

  useEffect(() => {
    if (!chatName) return
    getChat("admin", chatName).then((res) => {
      if (res.status === "ok") {
        setChat(res.data)
        setCurrentName(chatName)
      } else {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      }
    })
    getChatMessages("admin", chatName).then((res) => {
      if (res.status === "ok") {
        setMessages(res.data ?? [])
      } else {
        setMessages([])
      }
    })
  }, [chatName])

  useEffect(() => {
    getProviders("admin", "", "", "10000", "", "", "", "").then((res) => {
      if (res.status === "ok") {
        setProviders((res.data ?? []).filter((p: Provider) => p.category === "Model"))
      }
    })
  }, [])

  function update<K extends keyof Chat>(key: K, value: Chat[K]) {
    setChat((c) => (c ? { ...c, [key]: value } : null))
  }

  async function save(exit: boolean) {
    if (!chat) return
    setSaving(true)
    try {
      const res = await updateChat(chat.owner, currentName, chat)
      if (res.status === "ok") {
        toast.success(i18next.t("general:Successfully saved"))
        setCurrentName(chat.name)
        if (exit) {
          navigate("/chats")
        } else {
          navigate(`/chats/${chat.name}`, { replace: true })
        }
      } else {
        toast.error(`${i18next.t("general:Failed to save")}: ${res.msg}`)
      }
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    if (isNewChat && chat) {
      deleteChat(chat).then((res) => {
        if (res.status === "ok") {
          toast.success(i18next.t("general:Cancelled successfully"))
          navigate("/chats")
        } else {
          toast.error(`${i18next.t("general:Failed to cancel")}: ${res.msg}`)
        }
      })
    } else {
      navigate("/chats")
    }
  }

  if (!chat) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-5 py-4 pb-16">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          {i18next.t("chat:Edit Chat")}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving}>
            {saving && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
            {i18next.t("general:Save")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => save(true)} disabled={saving}>
            {i18next.t("general:Save & Exit")}
          </Button>
          {isNewChat && (
            <Button variant="outline" size="sm" onClick={cancel}>
              {i18next.t("general:Cancel")}
            </Button>
          )}
        </div>
      </div>

      {/* General Settings */}
      <SectionCard title={i18next.t("general:General Settings")} desc={i18next.t("general:General Settings desc")}>
        <FormField label={i18next.t("general:Name")} tooltip={i18next.t("general:Name - Tooltip")}>
          <Input value={chat.name} onChange={(e) => update("name", e.target.value)} />
        </FormField>
        <FormField label={i18next.t("general:Display name")} tooltip={i18next.t("general:Display name - Tooltip")}>
          <Input value={chat.displayName} onChange={(e) => update("displayName", e.target.value)} />
        </FormField>
        <FormField label={i18next.t("general:Store")} tooltip={i18next.t("general:Store - Tooltip")}>
          <Input value={chat.store} onChange={(e) => update("store", e.target.value)} />
        </FormField>
        <FormField label={i18next.t("provider:Model provider")} tooltip={i18next.t("provider:Model provider - Tooltip")}>
          <Select
            value={chat.modelProvider || ""}
            onValueChange={(v) => update("modelProvider", v || undefined)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={i18next.t("general:Please select")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{i18next.t("general:None")}</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  <span className="flex items-center gap-2">
                    <img
                      src={getProviderLogoUrl(p)}
                      alt={p.type}
                      className="h-4 w-4 object-contain"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                    />
                    {p.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={i18next.t("general:Category")} tooltip={i18next.t("provider:Category - Tooltip")}>
          <Input value={chat.category || ""} onChange={(e) => update("category", e.target.value)} />
        </FormField>
      </SectionCard>

      {/* Users */}
      <SectionCard title={i18next.t("general:Users")} desc={i18next.t("general:Users desc")}>
        <FormField label={i18next.t("general:User")} tooltip={i18next.t("general:User - Tooltip")}>
          <Input value={chat.user} onChange={(e) => update("user", e.target.value)} />
        </FormField>
        <FormField label={i18next.t("general:Is deleted")} tooltip={i18next.t("general:Is deleted - Tooltip")}>
          <div className="flex h-9 items-center">
            <Switch
              checked={!!chat.isDeleted}
              onCheckedChange={(v) => update("isDeleted", v)}
            />
          </div>
        </FormField>
      </SectionCard>

      {/* Messages */}
      <SectionCard title={i18next.t("general:Messages")} desc={i18next.t("general:Messages desc")}>
        <div className="col-span-full" style={{ height: "800px" }}>
          <div className="h-full rounded-lg border border-border bg-background">
            <ChatMessagesViewer messages={messages} />
          </div>
        </div>
      </SectionCard>

      {/* Bottom actions */}
      <div className="mt-6 flex items-center gap-2">
        <Button onClick={() => save(false)} disabled={saving}>
          {saving && <Loader2Icon className="h-4 w-4 animate-spin" />}
          {i18next.t("general:Save")}
        </Button>
        <Button variant="outline" onClick={() => save(true)} disabled={saving}>
          {i18next.t("general:Save & Exit")}
        </Button>
        {isNewChat && (
          <Button variant="outline" onClick={cancel}>
            {i18next.t("general:Cancel")}
          </Button>
        )}
      </div>
    </div>
  )
}

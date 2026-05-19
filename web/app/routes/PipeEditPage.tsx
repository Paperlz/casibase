import { useEffect, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router"
import { LinkIcon, Loader2Icon, SendIcon } from "lucide-react"
import { toast } from "sonner"
import i18next from "i18next"
import "~/i18n"

import { isAdminUser } from "~/backend/AccountBackend"
import {
  chatTest,
  deletePipe,
  getPipe,
  setPipeWebhook,
  updatePipe,
  type Pipe,
} from "~/backend/PipeBackend"
import { getStoreNames, type Store } from "~/backend/StoreBackend"
import { useAccount } from "~/context/AccountContext"
import { FormField, SectionCard } from "~/lib/Setting"
import { getPipeTypeOptions, getProviderLogoURL } from "~/lib/ProviderSetting"
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

export function meta() {
  return [{ title: "Edit Pipe - OpenAgent" }]
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

function FieldInput({
  value,
  onChange,
  disabled,
  password,
  link,
  placeholder,
  onEnter,
}: {
  value?: string
  onChange: (v: string) => void
  disabled?: boolean
  password?: boolean
  link?: boolean
  placeholder?: string
  onEnter?: () => void
}) {
  return (
    <div className="relative">
      {link && <LinkIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
      <Input
        type={password ? "password" : "text"}
        className={link ? "pl-8" : ""}
        value={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter?.()
        }}
      />
    </div>
  )
}

function SelectField({
  value,
  options,
  onChange,
  disabled,
  withLogo,
}: {
  value?: string
  options: Array<{ id: string; name: string }>
  onChange: (v: string) => void
  disabled?: boolean
  withLogo?: boolean
}) {
  return (
    <Select value={value ?? ""} onValueChange={(v) => onChange(v ?? "")} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {withLogo && (
              <img
                src={getProviderLogoURL({ category: "Chat", type: item.name })}
                alt={item.name}
                className="h-4 w-4 object-contain"
                onError={(e) => { ;(e.currentTarget as HTMLImageElement).style.display = "none" }}
              />
            )}
            {item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
      {children}
    </div>
  )
}

function webhookUrl(pipe: Pipe, suffix: string) {
  const domain = pipe.domain || "https://<your-domain>"
  return `${domain}/api/chat-webhook/${suffix}/${pipe.name}`
}

function getSecretKeyLabel(pipeType: string) {
  if (pipeType === "WhatsApp") return i18next.t("pipe:Phone Number ID")
  if (pipeType === "Slack") return i18next.t("pipe:Signing Secret")
  if (["Facebook Messenger", "Threads", "WeChat", "Snapchat"].includes(pipeType)) return i18next.t("pipe:App Secret")
  if (pipeType === "X Direct Messages") return i18next.t("pipe:Consumer Secret")
  return i18next.t("provider:Public key")
}

function getSecretKeyTooltip(pipeType: string) {
  if (pipeType === "WhatsApp") return i18next.t("pipe:Phone Number ID - Tooltip")
  if (pipeType === "Slack") return i18next.t("pipe:Signing Secret - Tooltip")
  if (pipeType === "Facebook Messenger") return i18next.t("pipe:App Secret - Tooltip")
  if (pipeType === "Threads") return i18next.t("pipe:Threads App Secret - Tooltip")
  if (pipeType === "WeChat") return i18next.t("pipe:WeChat App Secret - Tooltip")
  if (pipeType === "Snapchat") return i18next.t("pipe:Snapchat App Secret - Tooltip")
  if (pipeType === "X Direct Messages") return i18next.t("pipe:X Direct Messages Consumer Secret - Tooltip")
  return i18next.t("provider:Public key - Tooltip")
}

function PipeHints({ pipe }: { pipe: Pipe }) {
  if (pipe.type === "WhatsApp") {
    return <Hint>{i18next.t("pipe:WhatsApp verify token hint")} <strong>{pipe.name}</strong></Hint>
  }
  if (pipe.type === "Slack") {
    return <Hint>{i18next.t("pipe:Slack webhook hint")} <strong>{webhookUrl(pipe, "slack")}</strong></Hint>
  }
  if (pipe.type === "Facebook Messenger") {
    return (
      <Hint>
        {i18next.t("pipe:Facebook Messenger verify token hint")} <strong>{pipe.name}</strong>
        <br />
        {i18next.t("pipe:Facebook Messenger webhook hint")} <strong>{webhookUrl(pipe, "facebook-messenger")}</strong>
      </Hint>
    )
  }
  if (pipe.type === "Threads") {
    return (
      <Hint>
        {i18next.t("pipe:Threads token hint")}
        <br />
        {i18next.t("pipe:Threads verify token hint")} <strong>{pipe.name}</strong>
        <br />
        {i18next.t("pipe:Threads webhook hint")} <strong>{webhookUrl(pipe, "threads")}</strong>
      </Hint>
    )
  }
  if (pipe.type === "WeChat") {
    return (
      <Hint>
        {i18next.t("pipe:WeChat token hint")}
        <br />
        {i18next.t("pipe:WeChat verify token hint")} <strong>{pipe.name}</strong>
        <br />
        {i18next.t("pipe:WeChat webhook hint")} <strong>{webhookUrl(pipe, "wechat")}</strong>
      </Hint>
    )
  }
  if (pipe.type === "Snapchat") {
    return (
      <Hint>
        {i18next.t("pipe:Snapchat token hint")}
        <br />
        {i18next.t("pipe:Snapchat webhook hint")} <strong>{webhookUrl(pipe, "snapchat")}</strong>
      </Hint>
    )
  }
  if (pipe.type === "X Direct Messages") {
    return (
      <Hint>
        {i18next.t("pipe:X Direct Messages token hint")}
        <br />
        {i18next.t("pipe:X Direct Messages webhook hint")} <strong>{webhookUrl(pipe, "x-dm")}</strong>
      </Hint>
    )
  }
  return null
}

export default function PipeEditPage() {
  const { pipeName } = useParams<{ pipeName: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { account } = useAccount()
  const [pipe, setPipe] = useState<Pipe | null>(null)
  const [originalPipe, setOriginalPipe] = useState<Pipe | null>(null)
  const [currentName, setCurrentName] = useState(pipeName || "")
  const [storeNames, setStoreNames] = useState<Store[]>([])
  const [isNewPipe, setIsNewPipe] = useState(!!location.state?.isNewPipe)
  const [saving, setSaving] = useState(false)
  const [sendingWebhook, setSendingWebhook] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState("")

  useEffect(() => {
    getStoreNames("admin")
      .then((res) => {
        if (res.status === "ok") setStoreNames(res.data ?? [])
        else toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      })
      .catch((err: Error) => toast.error(err.message))
  }, [])

  useEffect(() => {
    if (!pipeName) return
    getPipe("admin", pipeName).then((res) => {
      if (res.status === "ok") {
        const next = { ...res.data, store: res.data?.store || "store-built-in" }
        setPipe(next)
        setOriginalPipe(clone(next))
        setCurrentName(pipeName)
      } else {
        toast.error(`${i18next.t("general:Failed to get")}: ${res.msg}`)
      }
    })
  }, [pipeName])

  function update<K extends keyof Pipe>(key: K, value: Pipe[K]) {
    setPipe((p) => (p ? { ...p, [key]: value } : null))
  }

  async function save(exit: boolean) {
    if (!pipe) return
    setSaving(true)
    try {
      const res = await updatePipe(pipe.owner, currentName, pipe)
      if (res.status === "ok") {
        toast.success(i18next.t("general:Successfully saved"))
        setCurrentName(pipe.name)
        setOriginalPipe(clone(pipe))
        setIsNewPipe(false)
        if (exit) navigate("/pipes")
        else navigate(`/pipes/${pipe.name}`, { replace: true })
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
    if (isNewPipe && pipe) {
      deletePipe(pipe)
        .then((res) => {
          if (res.status === "ok") {
            toast.success(i18next.t("general:Cancelled successfully"))
            navigate("/pipes")
          } else {
            toast.error(`${i18next.t("general:Failed to cancel")}: ${res.msg}`)
          }
        })
        .catch((err: Error) => toast.error(err.message))
    } else {
      navigate("/pipes")
    }
  }

  async function saveIfChanged() {
    if (!pipe || !originalPipe) return
    if (JSON.stringify(pipe) !== JSON.stringify(originalPipe)) {
      const res = await updatePipe(pipe.owner, currentName, pipe)
      if (res.status !== "ok") throw new Error(res.msg || i18next.t("general:Failed to save"))
      setOriginalPipe(clone(pipe))
    }
  }

  async function handleSetWebhook() {
    if (!pipe) return
    setSendingWebhook(true)
    try {
      await saveIfChanged()
      const res = await setPipeWebhook(`${pipe.owner}/${pipe.name}`)
      if (res.status === "ok") {
        toast.success(`${i18next.t("provider:Webhook set successfully")}: ${res.data}`)
      } else {
        toast.error(`${i18next.t("general:Failed to save")}: ${res.msg}`)
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSendingWebhook(false)
    }
  }

  async function handleChatTest() {
    if (!pipe) return
    if (!pipe.chatId) {
      toast.error("Please enter a Chat ID")
      return
    }
    if (!pipe.chatTestMessage) {
      toast.error("Please enter a test message")
      return
    }
    setTesting(true)
    setTestResult("")
    try {
      await saveIfChanged()
      const res = await chatTest(`${pipe.owner}/${pipe.name}`, pipe.chatId, pipe.chatTestMessage)
      if (res.status === "ok") {
        setTestResult(i18next.t("general:Success"))
        toast.success(i18next.t("general:Success"))
      } else {
        setTestResult(res.msg)
        toast.error(res.msg)
      }
    } catch (err) {
      setTestResult((err as Error).message)
      toast.error((err as Error).message)
    } finally {
      setTesting(false)
    }
  }

  if (!pipe) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const storeOptions = storeNames.map((store: any) => ({
    id: store.name,
    name: store.displayName ? `${store.displayName} (${store.name})` : store.name,
  }))
  if (pipe.store && !storeOptions.some((store) => store.id === pipe.store)) {
    storeOptions.unshift({ id: pipe.store, name: pipe.store })
  }
  const showSecretKey = ["Discord", "WhatsApp", "Slack", "Facebook Messenger", "Threads", "WeChat", "Snapchat", "X Direct Messages"].includes(pipe.type)

  return (
    <div className="min-h-screen bg-background px-5 py-4 pb-16">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{i18next.t("pipe:Edit Pipe")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => save(false)} disabled={saving}>
            {saving && <Loader2Icon className="h-3.5 w-3.5 animate-spin" />}
            {i18next.t("general:Save")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => save(true)} disabled={saving}>
            {i18next.t("general:Save & Exit")}
          </Button>
          {isNewPipe && <Button variant="outline" size="sm" onClick={cancel}>{i18next.t("general:Cancel")}</Button>}
        </div>
      </div>

      <SectionCard title={i18next.t("general:General Settings")}>
        <FormField label={i18next.t("general:ID")} tooltip={i18next.t("general:Name - Tooltip")}>
          <FieldInput value={pipe.name} onChange={(v) => update("name", v)} />
        </FormField>
        <FormField label={i18next.t("general:Display name")} tooltip={i18next.t("general:Display name - Tooltip")}>
          <FieldInput value={pipe.displayName} onChange={(v) => update("displayName", v)} />
        </FormField>
        <FormField label={i18next.t("general:Type")} tooltip={i18next.t("general:Type - Tooltip")}>
          <SelectField value={pipe.type} options={getPipeTypeOptions()} onChange={(v) => update("type", v)} withLogo />
        </FormField>
        <FormField label={i18next.t("general:Store")} tooltip={i18next.t("general:Store - Tooltip")} className="sm:col-span-2">
          <SelectField value={pipe.store || "store-built-in"} options={storeOptions} onChange={(v) => update("store", v)} />
        </FormField>
        <FormField label={i18next.t("general:Token")} tooltip={i18next.t("general:Token - Tooltip")} className="sm:col-span-2 lg:col-span-3">
          <FieldInput value={pipe.token} onChange={(v) => update("token", v)} password />
        </FormField>
        {showSecretKey && (
          <FormField label={getSecretKeyLabel(pipe.type)} tooltip={getSecretKeyTooltip(pipe.type)} className="sm:col-span-2 lg:col-span-3">
            <FieldInput value={pipe.secretKey} onChange={(v) => update("secretKey", v)} disabled={!isAdminUser(account)} password />
          </FormField>
        )}
        <PipeHints pipe={pipe} />
        <FormField label={i18next.t("provider:Domain")} tooltip={i18next.t("provider:Domain - Tooltip")} className="sm:col-span-2 lg:col-span-3">
          <FieldInput value={pipe.domain} onChange={(v) => update("domain", v)} link />
        </FormField>
        <FormField label={i18next.t("store:Is default")} tooltip={i18next.t("store:Is default - Tooltip")}>
          <div className="flex h-9 items-center"><Switch checked={!!pipe.isDefault} onCheckedChange={(v) => update("isDefault", v)} /></div>
        </FormField>
        <FormField label={i18next.t("general:State")} tooltip={i18next.t("general:State - Tooltip")}>
          <SelectField
            value={pipe.state}
            options={[{ id: "Active", name: i18next.t("general:Active") }, { id: "Inactive", name: i18next.t("general:Inactive") }]}
            onChange={(v) => update("state", v)}
          />
        </FormField>
      </SectionCard>

      <SectionCard title={i18next.t("pipe:Pipe Test")}>
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSetWebhook} disabled={sendingWebhook}>
              {sendingWebhook && <Loader2Icon className="h-4 w-4 animate-spin" />}
              {i18next.t("provider:Set Webhook")}
            </Button>
            <span className="text-sm text-muted-foreground">{i18next.t("provider:Webhook - Tooltip")}</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={i18next.t("pipe:Chat Test")}>
        <FormField label={i18next.t("pipe:Chat ID")}>
          <FieldInput
            value={pipe.chatId}
            placeholder={i18next.t("pipe:Chat ID placeholder")}
            onChange={(v) => update("chatId", v)}
          />
        </FormField>
        <FormField label={i18next.t("pipe:Test message")} className="sm:col-span-2">
          <FieldInput
            value={pipe.chatTestMessage}
            placeholder={i18next.t("pipe:Test message placeholder")}
            onChange={(v) => update("chatTestMessage", v)}
            onEnter={handleChatTest}
          />
        </FormField>
        <div className="flex items-end">
          <Button onClick={handleChatTest} disabled={testing}>
            {testing ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <SendIcon className="h-4 w-4" />}
            {i18next.t("pipe:Send")}
          </Button>
        </div>
        {testResult && (
          <FormField label={i18next.t("general:Data")} className="sm:col-span-2 lg:col-span-3">
            <Textarea readOnly className="min-h-20" value={testResult} />
          </FormField>
        )}
      </SectionCard>

      <div className="mt-6 flex items-center gap-2">
        <Button onClick={() => save(false)} disabled={saving}>
          {saving && <Loader2Icon className="h-4 w-4 animate-spin" />}
          {i18next.t("general:Save")}
        </Button>
        <Button variant="outline" onClick={() => save(true)} disabled={saving}>{i18next.t("general:Save & Exit")}</Button>
        {isNewPipe && <Button variant="outline" onClick={cancel}>{i18next.t("general:Cancel")}</Button>}
      </div>
    </div>
  )
}

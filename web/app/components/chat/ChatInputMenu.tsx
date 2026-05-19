import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { PlusIcon, PaperclipIcon, GlobeIcon, CheckIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { getProvider, isProviderSupportWebSearch } from "~/backend/ProviderBackend"
import type { Store } from "~/backend/StoreBackend"
import type { Chat } from "~/backend/ChatBackend"

type Props = {
  disabled?: boolean
  webSearchEnabled: boolean
  onWebSearchChange: (enabled: boolean) => void
  onFileUpload: () => void
  disableFileUpload?: boolean
  store?: Store
  chat?: Chat
}

export default function ChatInputMenu({
  disabled,
  webSearchEnabled,
  onWebSearchChange,
  onFileUpload,
  disableFileUpload,
  store,
  chat,
}: Props) {
  const { t } = useTranslation()
  const [webSearchSupported, setWebSearchSupported] = useState(false)
  const prevModelProviderRef = useRef<string | null>(null)

  useEffect(() => {
    const modelProvider = chat?.modelProvider || store?.modelProvider

    if (prevModelProviderRef.current !== null && prevModelProviderRef.current !== modelProvider) {
      if (webSearchEnabled) onWebSearchChange(false)
    }
    prevModelProviderRef.current = modelProvider ?? null

    if (!modelProvider) {
      setWebSearchSupported(false)
      return
    }

    getProvider("admin", modelProvider)
      .then((res) => {
        if (res.status === "ok" && res.data) {
          setWebSearchSupported(isProviderSupportWebSearch(res.data))
        } else {
          setWebSearchSupported(false)
        }
      })
      .catch(() => setWebSearchSupported(false))
  }, [chat?.modelProvider, store?.modelProvider])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        disabled={disabled}
      >
        <PlusIcon className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-44">
        {!disableFileUpload && (
          <DropdownMenuItem onClick={onFileUpload}>
            <PaperclipIcon className="h-4 w-4 mr-2" />
            {t("chat:Add attachment")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => onWebSearchChange(!webSearchEnabled)}
          disabled={!webSearchSupported}
          className="justify-between"
        >
          <div className="flex items-center gap-2">
            <GlobeIcon className="h-4 w-4" />
            {t("chat:Web search")}
          </div>
          {webSearchEnabled && <CheckIcon className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

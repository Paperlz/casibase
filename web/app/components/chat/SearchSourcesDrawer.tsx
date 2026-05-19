import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet"
import { getThemeColor } from "~/lib/chatUtils"
import type { SearchResult } from "~/backend/MessageBackend"

function SearchResultItem({ result, idx }: { result: SearchResult; idx: number }) {
  const [iconError, setIconError] = useState(false)
  const themeColor = getThemeColor()

  return (
    <div
      role="button"
      tabIndex={0}
      className="cursor-pointer rounded-lg border p-3 transition-all hover:shadow-md"
      onClick={() => result.url && window.open(result.url, "_blank")}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && result.url) {
          e.preventDefault()
          window.open(result.url, "_blank")
        }
      }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        {result.icon && !iconError ? (
          <img
            src={result.icon}
            alt="icon"
            className="h-5 w-5 rounded-full object-cover"
            onError={() => setIconError(true)}
          />
        ) : (
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: themeColor }}
          >
            {result.index ?? idx + 1}
          </span>
        )}
        <span className="text-xs font-medium" style={{ color: themeColor }}>
          {result.site_name || (result.url ? (() => { try { return new URL(result.url).hostname } catch { return "" } })() : "")}
        </span>
      </div>
      <div className="mb-1 text-sm font-medium leading-snug">{result.title}</div>
      <div className="truncate text-xs text-muted-foreground">{result.url}</div>
    </div>
  )
}

type Props = {
  visible: boolean
  onClose: () => void
  searchResults: SearchResult[]
}

export default function SearchSourcesDrawer({ visible, onClose, searchResults }: Props) {
  const { t } = useTranslation()

  return (
    <Sheet open={visible} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-80 sm:w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("chat:Web sources")}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-3">
          {searchResults.map((result, idx) => (
            <SearchResultItem key={idx} result={result} idx={idx} />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2Icon } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet"
import { toast } from "sonner"
import { apiFetch } from "~/lib/api"
import { getThemeColor } from "~/lib/chatUtils"
import type { VectorScore } from "~/backend/MessageBackend"
import type { Account } from "~/backend/AccountBackend"

type VectorData = {
  owner: string
  name: string
  file: string
  store: string
  text: string
}

function KnowledgeSourceItem({
  vectorScore,
  vectorData,
  idx,
}: {
  vectorScore: VectorScore
  vectorData: VectorData | undefined
  idx: number
}) {
  const { t } = useTranslation()
  const themeColor = getThemeColor()

  if (!vectorData) return null

  return (
    <div className="rounded-lg border p-3 transition-all hover:shadow-md">
      <div className="mb-2 flex items-center gap-2">
        <span
          className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: themeColor }}
        >
          {idx + 1}
        </span>
        <span className="flex-1 truncate text-sm font-medium" style={{ color: themeColor }}>
          {vectorData.file || t("chat:Knowledge Fragment")}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {t("chat:Relevance")}: {(vectorScore.score * 100).toFixed(1)}%
        </span>
      </div>
      <div className="max-h-48 overflow-auto whitespace-pre-line break-words text-xs text-muted-foreground">
        {vectorData.text}
      </div>
    </div>
  )
}

type Props = {
  visible: boolean
  onClose: () => void
  vectorScores: VectorScore[] | undefined
  account: Account | null | undefined
}

export default function KnowledgeSourcesDrawer({ visible, onClose, vectorScores }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [vectorsData, setVectorsData] = useState<Record<string, VectorData>>({})

  useEffect(() => {
    if (!visible || !vectorScores?.length) return

    async function load() {
      setLoading(true)
      const data: Record<string, VectorData> = {}
      try {
        for (const vs of vectorScores!) {
          if (!vs.vector || typeof vs.vector !== "string") continue
          const res = await apiFetch(`/api/get-vector?id=admin/${encodeURIComponent(vs.vector)}`)
          if (res.status === "ok" && res.data) {
            data[vs.vector] = res.data
          }
        }
        setVectorsData(data)
      } catch {
        toast.error(t("chat:Unable to load knowledge base sources. Please try again."))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [visible, vectorScores])

  return (
    <Sheet open={visible} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-80 sm:w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("chat:Knowledge sources")}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {vectorScores?.map((vs, idx) => (
                <KnowledgeSourceItem
                  key={vs.vector}
                  vectorScore={vs}
                  vectorData={vectorsData[vs.vector]}
                  idx={idx}
                />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

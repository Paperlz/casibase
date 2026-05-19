import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  DatabaseIcon,
  FileTextIcon,
  Loader2Icon,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"
import { Badge } from "~/components/ui/badge"
import { Separator } from "~/components/ui/separator"
import { Skeleton } from "~/components/ui/skeleton"
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

function RelevanceBar({ score }: { score: number }) {
  const pct = score * 100
  const colorClass =
    pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-rose-400"
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct.toFixed(1)}%</span>
    </div>
  )
}

function KnowledgeSourceItemSkeleton({ idx }: { idx: number }) {
  const themeColor = getThemeColor()
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-start gap-3 p-4">
        <div
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
          style={{ background: themeColor }}
        >
          {idx + 1}
        </div>
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-1.5 w-24" />
        </div>
      </div>
      <Separator />
      <div className="space-y-1.5 px-4 pb-3 pt-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
    </div>
  )
}

function KnowledgeSourceItem({
  vectorScore,
  vectorData,
  idx,
  loading,
}: {
  vectorScore: VectorScore
  vectorData: VectorData | undefined
  idx: number
  loading: boolean
}) {
  const { t } = useTranslation()
  const themeColor = getThemeColor()
  if (loading) return <KnowledgeSourceItemSkeleton idx={idx} />

  const filename = vectorData?.file || t("chat:Knowledge Fragment")
  const text = vectorData?.text ?? ""

  return (
    <div className="group rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3 p-4">
        <div
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
          style={{ background: themeColor }}
        >
          {idx + 1}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium leading-none" title={filename}>
              {filename}
            </span>
          </div>

          {vectorData?.store && (
            <div className="flex items-center gap-1.5">
              <DatabaseIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate text-xs text-muted-foreground">{vectorData.store}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-0.5">
            <Badge variant="secondary" className="h-5 px-1.5 text-xs font-normal">
              {t("chat:Relevance")}
            </Badge>
            <RelevanceBar score={vectorScore.score} />
          </div>
        </div>
      </div>

      <Separator />
      <div className="px-4 pb-3 pt-2">
        <p className="max-h-[400px] overflow-y-auto whitespace-pre-line break-words text-xs leading-relaxed text-muted-foreground">
          {text || t("chat:Knowledge Fragment")}
        </p>
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

  // Stable key derived from vector IDs to avoid spurious effect re-runs when
  // the parent creates a new array reference with the same content.
  const vectorKey = vectorScores?.map((v) => v.vector).join(",") ?? ""

  useEffect(() => {
    if (!visible || !vectorKey) return

    async function load() {
      setLoading(true)
      setVectorsData({})
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
      } catch (e) {
        console.error("[KnowledgeSources] load error:", e)
        toast.error(t("chat:Unable to load knowledge base sources. Please try again."))
      } finally {
        setLoading(false)
      }
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, vectorKey])

  const count = vectorScores?.length ?? 0

  return (
    <Sheet open={visible} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-80 overflow-y-auto sm:w-[460px]"
      >
        <SheetHeader className="border-b pb-4 pr-8">
          <div className="flex items-center gap-2">
            <DatabaseIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <SheetTitle className="text-base">{t("chat:Knowledge sources")}</SheetTitle>
            {count > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs font-medium">
                {count}
              </Badge>
            )}
          </div>
          {count > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("chat:Sources referenced to generate this response")}
            </p>
          )}
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4 py-4">
          {vectorScores?.map((vs, idx) => (
            <KnowledgeSourceItem
              key={vs.vector}
              vectorScore={vs}
              vectorData={vectorsData[vs.vector]}
              idx={idx}
              loading={loading}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

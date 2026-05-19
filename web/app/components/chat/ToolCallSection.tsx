import { useState } from "react"
import { ChevronDownIcon, CodeIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { ToolCall } from "~/backend/MessageBackend"

function renderJsonContent(raw: string) {
  let text = raw
  try {
    text = JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    /* not JSON */
  }
  return (
    <pre className="max-h-60 overflow-auto rounded bg-muted p-2 font-mono text-xs leading-relaxed">
      {text}
    </pre>
  )
}

function ToolCallCard({ toolCall, isLast }: { toolCall: ToolCall; isLast: boolean }) {
  const { t } = useTranslation()
  const isExecuting = !toolCall.content
  const [expanded, setExpanded] = useState(isExecuting)

  return (
    <div className={`overflow-hidden rounded-lg border bg-muted/30 ${isLast ? "" : "mb-2"}`}>
      <div
        className="flex cursor-pointer select-none items-center gap-2 px-3 py-2"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="bg-primary/10 flex h-6 w-6 shrink-0 items-center justify-center rounded">
          <CodeIcon className="text-primary h-3.5 w-3.5" />
        </div>

        <span className="flex-1 truncate font-mono text-sm font-semibold">
          {toolCall.name}
        </span>

        {isExecuting ? (
          <div className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <Loader2Icon className="text-primary h-3 w-3 animate-spin" />
            {t("chat:Executing...")}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-950 dark:text-green-400">
            <CheckCircle2Icon className="h-3 w-3" />
            {t("chat:Done")}
          </div>
        )}

        <ChevronDownIcon
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </div>

      {expanded && (
        <div className="space-y-2 border-t px-3 py-2">
          {toolCall.arguments && (
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("chat:Arguments")}
              </div>
              {renderJsonContent(toolCall.arguments)}
            </div>
          )}
          {toolCall.content ? (
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("general:Result")}
              </div>
              {renderJsonContent(toolCall.content)}
            </div>
          ) : (
            <div className="text-primary flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2Icon className="text-primary h-3 w-3 animate-spin" />
              {t("chat:Executing...")}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type Props = {
  toolCalls: ToolCall[] | undefined
}

export default function ToolCallSection({ toolCalls }: Props) {
  const { t } = useTranslation()
  if (!toolCalls || toolCalls.length === 0) return null

  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <CodeIcon className="h-3 w-3" />
        {`${toolCalls.length} ${t("chat:Tool calls")}`}
      </div>
      {toolCalls.map((tc, idx) => (
        <ToolCallCard key={idx} toolCall={tc} isLast={idx === toolCalls.length - 1} />
      ))}
    </div>
  )
}

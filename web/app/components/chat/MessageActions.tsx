import { useTranslation } from "react-i18next"
import {
  CopyIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  RotateCcwIcon,
  PlayIcon,
  PauseIcon,
  Loader2Icon,
} from "lucide-react"
import { Button } from "~/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"
import type { Message } from "~/backend/MessageBackend"
import type { Account } from "~/backend/AccountBackend"

type ActionButtonProps = {
  tooltip: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}

function ActionButton({ tooltip, onClick, disabled, children }: ActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

export function CopyButton({ message, onCopy }: { message: Message; onCopy: (m: Message) => void }) {
  const { t } = useTranslation()
  return (
    <ActionButton tooltip={t("general:Copy")} onClick={() => onCopy(message)}>
      <CopyIcon className="h-3.5 w-3.5" />
    </ActionButton>
  )
}

type Props = {
  message: Message
  isLastMessage: boolean
  index: number
  onCopy: (m: Message) => void
  onRegenerate: (index: number) => void
  onLike: (m: Message, type: "like" | "dislike") => void
  onToggleRead: (m: Message) => void
  isReading: boolean
  isLoadingTTS: boolean
  readingMessage: string | undefined
  account: Account | null | undefined
  setIsRegenerating: (v: boolean) => void
  isRegenerating: boolean
  hideInput?: boolean
}

export default function MessageActions({
  message,
  isLastMessage,
  index,
  onCopy,
  onRegenerate,
  onLike,
  onToggleRead,
  isReading,
  isLoadingTTS,
  readingMessage,
  account,
  setIsRegenerating,
  isRegenerating,
  hideInput,
}: Props) {
  const { t } = useTranslation()
  const isCurrentBeingRead = readingMessage === message.name
  const isCurrentLoading = isLoadingTTS && isCurrentBeingRead

  const liked = message.likeUsers?.includes(account?.name ?? "") ?? false
  const disliked = message.dislikeUsers?.includes(account?.name ?? "") ?? false

  const ttsTooltip = isCurrentLoading
    ? t("general:Loading...")
    : isCurrentBeingRead && isReading
      ? t("general:Pause")
      : isCurrentBeingRead
        ? t("general:Resume")
        : t("chat:Read it out")

  return (
    <div className="flex items-center gap-0.5">
      <CopyButton message={message} onCopy={onCopy} />

      {!hideInput && (
        <ActionButton tooltip={t("general:Like")} onClick={() => onLike(message, "like")}>
          <ThumbsUpIcon className={`h-3.5 w-3.5 ${liked ? "fill-current text-primary" : ""}`} />
        </ActionButton>
      )}

      {!hideInput && (
        <ActionButton tooltip={t("general:Dislike")} onClick={() => onLike(message, "dislike")}>
          <ThumbsDownIcon className={`h-3.5 w-3.5 ${disliked ? "fill-current text-primary" : ""}`} />
        </ActionButton>
      )}

      <ActionButton tooltip={ttsTooltip} onClick={() => onToggleRead(message)} disabled={isCurrentLoading}>
        {isCurrentLoading ? (
          <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
        ) : isCurrentBeingRead && isReading ? (
          <PauseIcon className="h-3.5 w-3.5" />
        ) : (
          <PlayIcon className="h-3.5 w-3.5" />
        )}
      </ActionButton>

      {!hideInput && isLastMessage && (
        <ActionButton
          tooltip={t("general:Regenerate")}
          onClick={() => {
            setIsRegenerating(true)
            onRegenerate(index)
          }}
          disabled={isRegenerating}
        >
          {isRegenerating ? (
            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcwIcon className="h-3.5 w-3.5" />
          )}
        </ActionButton>
      )}
    </div>
  )
}

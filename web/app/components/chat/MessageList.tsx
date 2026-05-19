import { forwardRef } from "react"
import MessageItem from "~/components/chat/MessageItem"
import { getDefaultAiAvatar } from "~/lib/chatUtils"
import type { Message } from "~/backend/MessageBackend"
import type { Account } from "~/backend/AccountBackend"
import type { Store } from "~/backend/StoreBackend"

type UploadedFile = {
  uid: number
  file: File
  content: string
  value: string
}

type Props = {
  messages: Message[]
  account: Account | null | undefined
  store: Store | undefined
  onRegenerate: (index: number) => void
  onMessageLike: (m: Message, type: "like" | "dislike") => void
  onCopyMessage: (m: Message) => void
  onToggleRead: (m: Message) => void
  onEditMessage: (m: Message, silent?: boolean) => void
  hideInput?: boolean
  disableInput?: boolean
  isReading: boolean
  isLoadingTTS: boolean
  readingMessage: string | undefined
  sendMessage: (text: string, fileName?: string) => void
  files: UploadedFile[]
  hideThinking?: boolean
}

const MessageList = forwardRef<HTMLDivElement, Props>(function MessageList(
  {
    messages,
    account,
    store,
    onRegenerate,
    onMessageLike,
    onCopyMessage,
    onToggleRead,
    onEditMessage,
    hideInput,
    disableInput,
    isReading,
    isLoadingTTS,
    readingMessage,
    sendMessage,
    hideThinking,
  },
  ref
) {
  const avatarSrc = store?.avatar || getDefaultAiAvatar()
  const filteredMessages = messages.filter((m) => !m.isHidden)

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto px-4 py-4 pb-2 scroll-smooth"
    >
      {filteredMessages.map((message, index) => (
        <MessageItem
          key={message.name || index}
          message={message}
          index={index}
          isLastMessage={index === filteredMessages.length - 1}
          account={account}
          avatar={avatarSrc}
          onCopy={onCopyMessage}
          onRegenerate={onRegenerate}
          onLike={onMessageLike}
          onToggleRead={onToggleRead}
          onEditMessage={onEditMessage}
          disableInput={disableInput}
          hideInput={hideInput}
          isReading={isReading}
          isLoadingTTS={isLoadingTTS}
          readingMessage={readingMessage}
          sendMessage={sendMessage}
          hideThinking={hideThinking}
        />
      ))}
    </div>
  )
})

export default MessageList

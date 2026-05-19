import { useCallback } from "react"
import { toast } from "sonner"
import { MessageCarrier } from "~/components/chat/MessageCarrier"
import { hasTitleDivider } from "~/carrier/titleUtils"
import { getMessageAnswer, type ChatStreamUpdate, type Message } from "~/backend/MessageBackend"
import { renderReason, renderText } from "~/lib/ChatMessageRender"
import type { Chat } from "~/backend/ChatBackend"
import type { Dispatch, SetStateAction } from "react"

type StreamOptions = {
  userTextForTitle?: string
  onTitle?: (title: string, chat: Chat) => void
  onChat?: (update: ChatStreamUpdate, chat: Chat) => void
  onDone?: () => void
}

export function useMessageStream(
  setMessages: Dispatch<SetStateAction<Message[]>>,
  setMessageLoading: Dispatch<SetStateAction<boolean>>,
  setMessageError: Dispatch<SetStateAction<boolean>>,
) {
  const streamAnswer = useCallback(
    (lastMessage: Message, targetChat: Chat, opts?: StreamOptions) => {
      setMessageLoading(true)
      let text = ""
      let reasonText = ""
      const carrier = new MessageCarrier(targetChat.needTitle)
      const userTextForTitle = opts?.userTextForTitle ?? ""

      getMessageAnswer(
        lastMessage.owner,
        lastMessage.name,
        (data) => {
          const json = JSON.parse(data)
          if (json.text === "") json.text = "\n"
          text += json.text
          const parsed = carrier.parseAnswerWithCarriers(text, userTextForTitle)
          if (hasTitleDivider(text) && parsed.title) {
            opts?.onTitle?.(parsed.title, targetChat)
          }
          setMessages((prev) => {
            if (!prev.length) return prev
            const updated = [...prev]
            const last = { ...updated[updated.length - 1] }
            last.text = parsed.finalAnswer
            last.html = renderText(last.text)
            last.isReasoningPhase = false
            updated[updated.length - 1] = last
            return updated
          })
        },
        (data) => {
          const json = JSON.parse(data)
          if (json.text === "") json.text = "\n"
          reasonText += json.text
          setMessages((prev) => {
            if (!prev.length) return prev
            const updated = [...prev]
            const last = { ...updated[updated.length - 1] }
            last.reasonText = reasonText
            if (!last.toolCalls?.length) last.isReasoningPhase = true
            if (text) last.text = text
            updated[updated.length - 1] = last
            return updated
          })
        },
        (data) => {
          const json = JSON.parse(data)
          setMessages((prev) => {
            if (!prev.length) return prev
            const updated = [...prev]
            const last = { ...updated[updated.length - 1] }
            const toolCalls = [...(last.toolCalls || [])]
            if (!json.content) {
              toolCalls.push({ name: json.name, arguments: json.arguments, content: "" })
            } else {
              let found = false
              for (let i = toolCalls.length - 1; i >= 0; i--) {
                if (toolCalls[i].name === json.name && !toolCalls[i].content) {
                  toolCalls[i] = { name: json.name, arguments: json.arguments, content: json.content }
                  found = true
                  break
                }
              }
              if (!found) toolCalls.push({ name: json.name, arguments: json.arguments, content: json.content })
            }
            last.toolCalls = toolCalls
            updated[updated.length - 1] = last
            return updated
          })
        },
        (data) => {
          const searchResults = JSON.parse(data)
          setMessages((prev) => {
            if (!prev.length) return prev
            const updated = [...prev]
            updated[updated.length - 1] = { ...updated[updated.length - 1], searchResults }
            return updated
          })
        },
        (data) => {
          const vectorScores = JSON.parse(data)
          setMessages((prev) => {
            if (!prev.length) return prev
            const updated = [...prev]
            updated[updated.length - 1] = { ...updated[updated.length - 1], vectorScores }
            return updated
          })
        },
        (error) => {
          setMessages((prev) => {
            if (!prev.length) return prev
            const updated = [...prev]
            updated[updated.length - 1] = { ...updated[updated.length - 1], errorText: error }
            return updated
          })
          setMessageLoading(false)
          setMessageError(true)
          toast.error(error)
        },
        () => {
          const parsed = carrier.parseAnswerWithCarriers(text, userTextForTitle)
          opts?.onTitle?.(parsed.title, targetChat)
          setMessages((prev) => {
            if (!prev.length) return prev
            const updated = [...prev]
            const last = { ...updated[updated.length - 1] }
            last.text = parsed.finalAnswer
            last.suggestions = parsed.suggestionArray
            last.html = renderText(last.text)
            if (last.reasonText) last.reasonHtml = renderReason(last.reasonText)
            last.isReasoningPhase = false
            updated[updated.length - 1] = last
            return updated
          })
          setMessageLoading(false)
          setMessageError(false)
          opts?.onDone?.()
        },
        (infoText) => {
          setMessages((prev) => {
            if (!prev.length) return prev
            const updated = [...prev]
            updated[updated.length - 1] = { ...updated[updated.length - 1], hintText: infoText }
            return updated
          })
        },
        (update) => {
          opts?.onChat?.(update, targetChat)
        }
      )
    },
    // setState dispatchers are stable references — empty deps array is correct
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  return streamAnswer
}

import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { updateMessage, type Message } from "~/backend/MessageBackend"
import { useAccount } from "~/context/AccountContext"

export function useChatMessageHandlers(
  setMessages: Dispatch<SetStateAction<Message[]>>,
) {
  const { t } = useTranslation()
  const { account } = useAccount()

  function handleMessageLike(message: Message, type: "like" | "dislike") {
    const opposite = type === "like" ? "dislike" : "like"
    const isCancel = message[`${type}Users`]?.includes(account?.name ?? "") ?? false

    const updated = { ...message }
    if (isCancel) {
      updated[`${type}Users`] = (updated[`${type}Users`] || []).filter((u) => u !== account?.name)
    } else {
      updated[`${type}Users`] = [...(updated[`${type}Users`] || []), account?.name ?? ""]
    }
    updated[`${opposite}Users`] = (updated[`${opposite}Users`] || []).filter((u) => u !== account?.name)

    setMessages((prev) => prev.map((m) => (m.name === message.name ? updated : m)))
    updateMessage(message.owner, message.name, updated).then((res) => {
      if (res.status === "ok") {
        toast.success(
          type === "like"
            ? isCancel ? t("general:Successfully unliked") : t("general:Successfully liked")
            : isCancel ? t("general:Successfully undisliked") : t("general:Successfully disliked")
        )
      } else {
        toast.error(res.msg)
      }
    })
  }

  function copyMessageText(message: Message) {
    const parts: string[] = []
    if (message.toolCalls?.length) {
      message.toolCalls.forEach((tc) => {
        let part = `Tool calls\n${tc.name}`
        try { part += `\nArguments:\n${JSON.stringify(JSON.parse(tc.arguments), null, 2)}` } catch { part += `\nArguments:\n${tc.arguments}` }
        if (tc.content) { try { part += `\nResult:\n${JSON.stringify(JSON.parse(tc.content), null, 2)}` } catch { part += `\nResult:\n${tc.content}` } }
        parts.push(part)
      })
    }
    const div = document.createElement("div")
    div.innerHTML = message.text || ""
    const text = div.innerText
    if (text) parts.push(text)
    navigator.clipboard.writeText(parts.join("\n\n")).then(() => {
      toast.success(t("general:Successfully copied"))
    })
  }

  return { handleMessageLike, copyMessageText }
}

import i18next from "i18next"
import type { Message } from "~/backend/MessageBackend"
import type { Account } from "~/backend/AccountBackend"

export function getRandomName(): string {
  return Math.random().toString(36).slice(-6)
}

export function deepCopy<T>(obj: T): T {
  if (obj === null) return obj
  return Object.assign({}, obj)
}

export function getDefaultAiAvatar(): string {
  return "https://cdn.openagentai.org/img/openagent.png"
}

export function getUserAvatar(message: Message, account: Account | null | undefined): string {
  if (message.author === "AI") return getDefaultAiAvatar()
  if (account?.avatar) {
    return account.avatar
  }
  return getDefaultAiAvatar()
}

export function getRefinedErrorText(errorText: string): string {
  if (errorText.startsWith("error, status code: 400, message: The response was filtered due to the prompt triggering")) {
    return i18next.t("chat:Your chat text involves sensitive content. This chat has been forcibly terminated.")
  }
  if (errorText.startsWith("write tcp ")) {
    return i18next.t("chat:The response has been interrupted. Please do not refresh the page during responding.")
  }
  if (errorText.includes("Please add a model provider first") || errorText.includes("请先添加模型提供商")) {
    return i18next.t("chat:No model configured - notice")
  }
  return errorText
}

export function formatSuggestion(suggestionText: string): string {
  suggestionText = suggestionText.trim().replace(/^</, "").replace(/>$/, "")
  if (!suggestionText.endsWith("?") && !suggestionText.endsWith("？")) {
    suggestionText += "?"
  }
  return suggestionText
}

export function getThemeColor(): string {
  if (typeof window === "undefined") return "#1677ff"
  return (
    localStorage.getItem("themeColor") ||
    getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() ||
    "#1677ff"
  )
}

export function getIsDark(): boolean {
  if (typeof window === "undefined") return false
  try {
    const stored = localStorage.getItem("themeAlgorithm")
    return stored ? JSON.parse(stored).includes("dark") : false
  } catch {
    return false
  }
}

export function isMobile(): boolean {
  if (typeof window === "undefined") return false
  return window.innerWidth < 768
}

export function scrollToBottom(ref: React.RefObject<HTMLElement | null>): void {
  if (ref.current) {
    ref.current.scrollTop = ref.current.scrollHeight
  }
}

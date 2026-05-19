export const FALLBACK_TITLE_MAX_RUNES = 16
export const MAX_CHAT_DISPLAY_NAME_RUNES = 100
export const TITLE_DIVIDER = "====="

// Intentionally simple: user messages rarely include complex HTML. Attributes with
// ">" inside quoted values are a known limitation of this regex stripper.
const HTML_TAG_RE = /<[^>]+>/gi
const WHITESPACE_RE = /\s+/g
const SUGGESTION_LEAK_RE = /\|\|\|/

export function sanitizeUserMessageForTitle(text: string): string {
  let value = text.trim()
  if (!value) return ""

  value = value.replace(HTML_TAG_RE, " ")
  value = value.replace(/\r\n/g, "\n").replace(/\n/g, " ")
  value = value.replace(WHITESPACE_RE, " ").trim()
  return value
}

export function normalizeAITitle(title: string): string {
  let value = title.trim()
  if (!value) return ""

  const lineBreak = value.search(/[\r\n]/)
  if (lineBreak >= 0) {
    value = value.slice(0, lineBreak).trim()
  }
  if (SUGGESTION_LEAK_RE.test(value)) {
    value = value.split(SUGGESTION_LEAK_RE, 1)[0].trim()
  }
  return value.trim()
}

export function truncateRunes(text: string, maxRunes: number, withEllipsis: boolean): string {
  if (maxRunes <= 0 || !text) return ""

  const runes = Array.from(text)
  if (runes.length <= maxRunes) return text
  if (withEllipsis && maxRunes > 1) {
    return `${runes.slice(0, maxRunes - 1).join("")}…`
  }
  return runes.slice(0, maxRunes).join("")
}

export function fallbackTitleFromUserMessage(text: string, maxRunes = FALLBACK_TITLE_MAX_RUNES): string {
  const sanitized = sanitizeUserMessageForTitle(text)
  if (!sanitized) return ""
  return truncateRunes(sanitized, maxRunes, true)
}

export function resolveChatTitle(aiTitle: string, userMessage: string): string {
  const normalized = normalizeAITitle(aiTitle)
  if (normalized) {
    return truncateRunes(normalized, MAX_CHAT_DISPLAY_NAME_RUNES, false)
  }
  return truncateRunes(fallbackTitleFromUserMessage(userMessage), MAX_CHAT_DISPLAY_NAME_RUNES, false)
}

export function hasTitleDivider(answer: string): boolean {
  return (answer || "").includes(TITLE_DIVIDER)
}

export function getFirstUserMessageText(
  messages: Array<{ author?: string; isHidden?: boolean; text?: string; createdTime?: string }>
): string {
  const sorted = [...messages].sort((a, b) => (a.createdTime ?? "").localeCompare(b.createdTime ?? ""))
  const message = sorted.find(
    (item) => item.author !== "AI" && !item.isHidden && (item.text ?? "").trim() !== ""
  )
  return message?.text ?? ""
}

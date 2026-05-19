import { ServerUrl, apiFetch, apiPost } from "~/lib/api"

export type ToolCall = {
  name: string
  arguments: string
  content: string
}

export type SearchResult = {
  url: string
  title: string
  site_name?: string
  icon?: string
  index?: number
}

export type VectorScore = {
  vector: string
  score: number
}

export type Suggestion = {
  text: string
  isHit: boolean
}

export type Message = {
  owner: string
  name: string
  createdTime: string
  organization?: string
  store?: string
  user?: string
  chat?: string
  author: string
  text: string
  html?: React.ReactNode
  reasonText?: string
  reasonHtml?: React.ReactNode
  toolCalls?: ToolCall[]
  searchResults?: SearchResult[]
  vectorScores?: VectorScore[]
  suggestions?: Suggestion[]
  replyTo: string
  isHidden: boolean
  isDeleted: boolean
  isAlerted: boolean
  isRegenerated: boolean
  fileName?: string
  webSearchEnabled?: boolean
  modelProvider?: string
  likeUsers?: string[]
  dislikeUsers?: string[]
  errorText?: string
  hintText?: string
  isReasoningPhase?: boolean
  tokenCount?: number
  textTokenCount?: number
  price?: number
  currency?: string
  comment?: string
  needNotify?: boolean
}

export function getGlobalMessages(
  page: number | string = "",
  pageSize: number | string = "",
  field = "",
  value = "",
  sortField = "",
  sortOrder = "",
  store = ""
): Promise<any> {
  return apiFetch(
    `/api/get-global-messages?p=${page}&pageSize=${pageSize}&field=${field}&value=${value}&sortField=${sortField}&sortOrder=${sortOrder}&store=${encodeURIComponent(store)}`
  )
}

export function getMessages(user: string, selectedUser = ""): Promise<any> {
  return apiFetch(
    `/api/get-messages?user=${encodeURIComponent(user)}&selectedUser=${encodeURIComponent(selectedUser)}`
  )
}

export function getChatMessages(owner: string, chat: string): Promise<any> {
  return apiFetch(`/api/get-messages?owner=${owner}&chat=${chat}`)
}

export function getMessage(owner: string, name: string): Promise<any> {
  return apiFetch(`/api/get-message?id=${owner}/${encodeURIComponent(name)}`)
}

export function addMessage(message: Partial<Message>): Promise<any> {
  return apiPost("/api/add-message", { ...message })
}

export function updateMessage(
  owner: string,
  name: string,
  message: Partial<Message>,
  isHitOnly = false
): Promise<any> {
  return apiPost(
    `/api/update-message?id=${owner}/${encodeURIComponent(name)}&isHitOnly=${isHitOnly}`,
    { ...message }
  )
}

export function deleteMessage(message: Partial<Message>): Promise<any> {
  return apiPost("/api/delete-message", { ...message })
}

const eventSourceMap = new Map<string, EventSource>()

export type ChatStreamUpdate = {
  owner?: string
  name: string
  displayName?: string
  needTitle?: boolean
}

export function getMessageAnswer(
  owner: string,
  name: string,
  onMessage: (data: string) => void,
  onReason: (data: string) => void,
  onTool: (data: string) => void,
  onSearch: (data: string) => void,
  onVector: (data: string) => void,
  onError: (data: string) => void,
  onEnd: (data: string) => void,
  onInfo?: (data: string) => void,
  onChat?: (update: ChatStreamUpdate) => void
): void {
  const key = `${owner}/${name}`
  if (eventSourceMap.has(key)) return

  const eventSource = new EventSource(
    `${ServerUrl}/api/get-message-answer?id=${owner}/${encodeURIComponent(name)}`,
    { withCredentials: true }
  )
  eventSourceMap.set(key, eventSource)

  eventSource.addEventListener("message", (e) => onMessage(e.data))
  eventSource.addEventListener("reason", (e) => onReason(e.data))
  eventSource.addEventListener("tool-start", (e) => onTool(e.data))
  eventSource.addEventListener("tool", (e) => onTool(e.data))
  eventSource.addEventListener("search", (e) => onSearch(e.data))
  eventSource.addEventListener("vector", (e) => onVector(e.data))
  if (onInfo) {
    eventSource.addEventListener("myinfo", (e) => onInfo(e.data))
  }
  if (onChat) {
    eventSource.addEventListener("chat", (e) => {
      try {
        onChat(JSON.parse(e.data) as ChatStreamUpdate)
      } catch {
        // ignore malformed chat events
      }
    })
  }
  eventSource.addEventListener("myerror", (e) => {
    onError(e.data)
    eventSource.close()
    eventSourceMap.delete(key)
  })
  eventSource.addEventListener("error", (e) => {
    const err = (e as MessageEvent).data || "Unknown error"
    onError(err)
    eventSource.close()
    eventSourceMap.delete(key)
  })
  eventSource.addEventListener("end", (e) => {
    onEnd(e.data)
    eventSource.close()
    eventSourceMap.delete(key)
  })
}

export function closeMessageEventSource(owner: string, name: string): boolean {
  const key = `${owner}/${name}`
  if (eventSourceMap.has(key)) {
    eventSourceMap.get(key)!.close()
    eventSourceMap.delete(key)
    return true
  }
  return false
}

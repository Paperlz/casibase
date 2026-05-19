import { apiFetch, apiPost } from "~/lib/api"

export type Store = {
  owner: string
  name: string
  displayName: string
  createdTime: string
  title: string
  avatar: string
  htmlTitle?: string
  faviconUrl?: string
  logoUrl?: string
  footerHtml?: string
  storageProvider: string
  storageSubpath?: string
  imageProvider?: string
  splitProvider?: string
  searchProvider?: string
  modelProvider: string
  embeddingProvider?: string
  textToSpeechProvider?: string
  speechToTextProvider?: string
  mcpServer?: string
  memoryLimit: number
  frequency?: number
  limitMinutes?: number
  welcome?: string
  welcomeTitle?: string
  welcomeText?: string
  prompt?: string
  themeColor?: string
  propertiesMap?: Record<string, string>
  knowledgeCount?: number
  suggestionCount?: number
  skills?: string[]
  tools?: string[]
  vectorStores?: string[]
  childStores?: string[]
  childModelProviders?: string[]
  forbiddenWords?: string[]
  exampleQuestions?: Array<{ title: string; text: string }>
  isDefault: boolean
  state: string
  enableExtraOptions?: boolean
  enableTtsStreaming?: boolean
  showAutoRead?: boolean
  disableFileUpload?: boolean
  hideThinking?: boolean
  sharedBy?: string
  chatCount?: number
  messageCount?: number
  vectorCount?: number
  error?: string
}

export function getGlobalStores(
  name = "",
  page = "",
  pageSize = "",
  field = "",
  value = "",
  sortField = "",
  sortOrder = ""
): Promise<any> {
  return apiFetch(
    `/api/get-global-stores?name=${encodeURIComponent(name)}&p=${page}&pageSize=${pageSize}&field=${field}&value=${encodeURIComponent(value)}&sortField=${sortField}&sortOrder=${sortOrder}`
  )
}

export function getStores(owner: string): Promise<any> {
  return apiFetch(`/api/get-stores?owner=${encodeURIComponent(owner)}`)
}

export function getStoreNames(owner: string): Promise<any> {
  return apiFetch(`/api/get-store-names?owner=${encodeURIComponent(owner)}`)
}

export function getStore(owner: string, name: string): Promise<any> {
  return apiFetch(`/api/get-store?id=${encodeURIComponent(owner)}/${encodeURIComponent(name)}`)
}

export function updateStore(owner: string, name: string, store: Store): Promise<any> {
  return apiPost(`/api/update-store?id=${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, store)
}

export function addStore(store: Store): Promise<any> {
  return apiPost("/api/add-store", store)
}

export function deleteStore(store: Store): Promise<any> {
  return apiPost("/api/delete-store", store)
}

export function refreshStoreVectors(store: Store): Promise<any> {
  return apiPost("/api/refresh-store-vectors", store)
}

export function claimStore(owner: string, name: string): Promise<any> {
  return apiFetch(
    `/api/claim-store?id=${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    { method: "POST" }
  )
}

import { apiFetch, apiPost } from "~/lib/api"

export type Pipe = {
  owner: string
  name: string
  createdTime?: string
  displayName?: string
  type: string
  token?: string
  secretKey?: string
  store?: string
  domain?: string
  isDefault?: boolean
  state?: string
  chatId?: string
  chatTestMessage?: string
}

export function getGlobalPipes(): Promise<any> {
  return apiFetch("/api/get-global-pipes")
}

export function getPipes(owner: string): Promise<any> {
  return apiFetch(`/api/get-pipes?owner=${encodeURIComponent(owner)}`)
}

export function getPipe(owner: string, name: string): Promise<any> {
  return apiFetch(`/api/get-pipe?id=${encodeURIComponent(owner)}/${encodeURIComponent(name)}`)
}

export function updatePipe(owner: string, name: string, pipe: Pipe): Promise<any> {
  return apiPost(`/api/update-pipe?id=${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, pipe)
}

export function addPipe(pipe: Pipe): Promise<any> {
  return apiPost("/api/add-pipe", pipe)
}

export function deletePipe(pipe: Pipe): Promise<any> {
  return apiPost("/api/delete-pipe", pipe)
}

export function setPipeWebhook(id: string): Promise<any> {
  return apiFetch(`/api/set-pipe-webhook?id=${encodeURIComponent(id)}`, { method: "POST" })
}

export function chatTest(id: string, chatId: string, message: string): Promise<any> {
  const params = new URLSearchParams({ id, chatId, message })
  return apiFetch(`/api/chat-test?${params.toString()}`, { method: "POST" })
}

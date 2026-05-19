import { apiFetch, apiPost } from "~/lib/api"

export type Account = {
  owner: string
  name: string
  displayName: string
  avatar: string
  email: string
  type: string
  tag: string
  isAdmin: boolean
  homepage?: string
  language?: string
}

export type ApiResponse<T = unknown> = {
  status: "ok" | "error"
  data?: T
  msg?: string
}

export function getAccount(): Promise<ApiResponse<Account>> {
  const fromPath = typeof window !== "undefined" ? encodeURIComponent(window.location.pathname) : "/"
  return apiFetch(`/api/get-account?fromPath=${fromPath}`)
}

export function getSigninOptions(): Promise<ApiResponse<{ casdoorAvailable: boolean; signinAvailable: boolean }>> {
  return apiFetch("/api/get-signin-options")
}

export function signinWithPassword(username: string, password: string): Promise<ApiResponse> {
  return apiPost("/api/signin", { username, password })
}

export function signin(code: string, state: string): Promise<ApiResponse> {
  return apiFetch(`/api/signin?code=${code}&state=${state}`, { method: "POST" })
}

export function signout(): Promise<ApiResponse> {
  return apiFetch("/api/signout", { method: "POST" })
}

export function updateAccount(account: Partial<Account>): Promise<ApiResponse> {
  return apiPost("/api/update-account", account)
}

// ── Role helpers ──────────────────────────────────────────────────────────────

export function isAdminUser(account?: Account | null): boolean {
  if (!account) return false
  return account.owner === "built-in" || account.isAdmin === true
}

export function isChatAdminUser(account?: Account | null): boolean {
  if (!account) return false
  return account.type === "chat-admin" || account.tag === "教师"
}

export function isBasicLoginMode(account?: Account | null): boolean {
  if (!account) return false
  return account.owner === "basic"
}

export function isLocalAdminUser(account?: Account | null): boolean {
  if (!account) return false
  return isChatAdminUser(account) || isAdminUser(account)
}

export function isAnonymousUser(account?: Account | null): boolean {
  if (!account) return false
  return account.type === "anonymous-user"
}

export function isChatUser(account?: Account | null): boolean {
  if (!account) return false
  return account.type === "chat-user"
}

export function getShortName(s: string): string {
  return s.split("/").slice(-1)[0]
}

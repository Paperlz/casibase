import { getLanguage } from "~/i18n"

export type AuthConfig = {
  issuer: string
  clientId: string
  appName: string
  organizationName: string
  redirectPath?: string
}

type WebConfig = {
  authConfig?: Partial<AuthConfig>
}

const defaultAuthConfig: AuthConfig = {
  issuer: "",
  clientId: "",
  appName: "",
  organizationName: "",
  redirectPath: "/callback",
}

function parseCookie(name: string): string {
  if (typeof document === "undefined") {
    return ""
  }

  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${name}=`))

  return cookie ? cookie.slice(name.length + 1) : ""
}

export function getAuthConfig(): AuthConfig {
  const rawConfig = parseCookie("jsonWebConfig")
  if (!rawConfig || rawConfig === "null") {
    return defaultAuthConfig
  }

  try {
    const decoded = decodeURIComponent(rawConfig.replace(/\+/g, " "))
    const config = JSON.parse(decoded) as WebConfig
    return {
      ...defaultAuthConfig,
      ...(config.authConfig ?? {}),
    }
  } catch {
    return defaultAuthConfig
  }
}

function appendLanguage(url: string): string {
  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}language=${getLanguage()}`
}

function getOrSaveState(): string {
  const existingState = sessionStorage.getItem("casdoor-state")
  if (existingState) {
    return existingState
  }

  const state = Math.random().toString(36).slice(2)
  sessionStorage.setItem("casdoor-state", state)
  return state
}

export function validateAndClearSigninState(state: string): ApiResponse | null {
  const expectedState = getOrSaveState()
  sessionStorage.removeItem("casdoor-state")

  if (state === expectedState) {
    return null
  }

  return {
    status: "error",
    msg: `invalid state parameter, expected: ${expectedState}, got: ${state}`,
  }
}

export function isCasdoorAvailable(): boolean {
  return !!getAuthConfig().issuer
}

type ApiResponse = {
  status: "ok" | "error"
  msg?: string
}

export function getSigninUrl(): string {
  const config = getAuthConfig()
  if (!config.issuer) {
    return ""
  }

  const redirectPath = config.redirectPath || "/callback"
  const redirectUri = redirectPath.includes("://")
    ? redirectPath
    : `${window.location.origin}${redirectPath}`
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "profile",
    state: getOrSaveState(),
  })

  return appendLanguage(
    `${config.issuer.trim()}/login/oauth/authorize?${params.toString()}`
  )
}

export function getSignupUrl(): string {
  const config = getAuthConfig()
  if (!config.issuer || !config.appName) {
    return ""
  }

  sessionStorage.setItem("signinUrl", getSigninUrl())
  return appendLanguage(`${config.issuer.trim()}/signup/${config.appName}`)
}

export function getMyProfileUrl(): string {
  const config = getAuthConfig()
  if (!config.issuer) {
    return ""
  }

  const returnUrl = window.location.href
  return appendLanguage(
    `${config.issuer.trim()}/account?returnUrl=${encodeURIComponent(returnUrl)}`
  )
}

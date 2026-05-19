import { getLanguage } from "~/i18n"

// Server URL — empty string means same-origin (production); localhost gets the backend port
export const ServerUrl =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? `http://${window.location.hostname}:14000`
    : ""

export function getAcceptLanguage(): string {
  const lang = getLanguage()
  // Map to proper Accept-Language values
  if (lang === "zh") return "zh-CN,zh;q=0.9,en;q=0.8"
  return "en-US,en;q=0.9"
}

/**
 * Reads a fetch Response body and returns parsed JSON, or a normalized
 * {status: "error", msg} when HTTP failed or the body is not JSON.
 */
export async function handleFetchResponse(res: Response): Promise<any> {
  const text = await res.text()
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      if (!res.ok) {
        const preview = text.replace(/\s+/g, " ").trim().slice(0, 160)
        return {
          status: "error",
          msg: `HTTP ${res.status} ${res.statusText || ""}`.trim() + (preview ? `: ${preview}` : ""),
        }
      }
      throw new Error("Invalid JSON response")
    }
  }
  if (!res.ok) {
    const msg = (data && (data.msg || data.message)) || `HTTP ${res.status} ${res.statusText || ""}`.trim()
    return { status: "error", msg }
  }
  return data
}

/** Shorthand for GET requests with cookie credentials. */
export function apiFetch(path: string, init?: RequestInit): Promise<any> {
  return fetch(`${ServerUrl}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Accept-Language": getAcceptLanguage(),
      ...init?.headers,
    },
  }).then(handleFetchResponse)
}

/** Shorthand for POST requests with JSON body. */
export function apiPost(path: string, body: unknown): Promise<any> {
  return apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

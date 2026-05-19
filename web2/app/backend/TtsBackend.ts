import { ServerUrl, getAcceptLanguage } from "~/lib/api"

export function generateTextToSpeechAudio(
  storeId: string,
  providerId: string,
  messageId: string,
  text: string,
): Promise<Blob> {
  return fetch(`${ServerUrl}/api/generate-text-to-speech-audio`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept-Language": getAcceptLanguage(),
    },
    body: JSON.stringify({ storeId, providerId, messageId, text }),
  }).then(async (response) => {
    const contentType = response.headers.get("Content-Type") || ""
    if (response.ok && !contentType.includes("application/json")) {
      return response.blob()
    }
    const raw = await response.text()
    let data: any = null
    try { data = JSON.parse(raw) } catch {}
    throw new Error((data && data.msg) || "TTS request failed")
  })
}

export function generateTextToSpeechAudioStream(storeId: string, messageId: string): EventSource {
  const url = `${ServerUrl}/api/generate-text-to-speech-audio-stream?storeId=${encodeURIComponent(storeId)}&messageId=${encodeURIComponent(messageId)}`
  return new EventSource(url, { withCredentials: true })
}

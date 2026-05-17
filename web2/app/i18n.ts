import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import en from "./locales/en/data.json"
import zh from "./locales/zh/data.json"

export const supportedLanguages = ["en", "zh"] as const
export type SupportedLanguage = (typeof supportedLanguages)[number]

const LANGUAGE_KEY = "language"

function toSupportedLanguage(language: string | null | undefined): SupportedLanguage | null {
  if (!language) return null
  const normalized = language.toLowerCase()
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh"
  if (normalized === "en" || normalized.startsWith("en-")) return "en"
  return null
}

export function normalizeLanguage(language: string | null | undefined): SupportedLanguage {
  return toSupportedLanguage(language) ?? "en"
}

function getStoredLanguage(): SupportedLanguage | null {
  if (typeof window === "undefined") return null
  return toSupportedLanguage(window.localStorage.getItem(LANGUAGE_KEY))
}

function getBrowserLanguage(): SupportedLanguage | null {
  if (typeof navigator === "undefined") return null
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of languages) {
    const supportedLanguage = toSupportedLanguage(language)
    if (supportedLanguage) return supportedLanguage
  }
  return null
}

function getInitialLanguage(): SupportedLanguage {
  return getStoredLanguage() ?? getBrowserLanguage() ?? "en"
}

function persistLanguage(language: SupportedLanguage) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LANGUAGE_KEY, language)
  }
}

export function getLanguage(): SupportedLanguage {
  return (
    toSupportedLanguage(i18n.resolvedLanguage) ??
    toSupportedLanguage(i18n.language) ??
    getStoredLanguage() ??
    "en"
  )
}

export function setLanguage(language: string | null | undefined): SupportedLanguage {
  const nextLanguage = normalizeLanguage(language)
  const currentLanguage = toSupportedLanguage(i18n.resolvedLanguage) ?? toSupportedLanguage(i18n.language)
  persistLanguage(nextLanguage)
  if (currentLanguage !== nextLanguage) {
    void i18n.changeLanguage(nextLanguage)
  }
  return nextLanguage
}

i18n.use(initReactI18next).init({
  lng: getInitialLanguage(),
  resources: { en, zh },
  fallbackLng: "en",
  supportedLngs: supportedLanguages,
  keySeparator: false,
  interpolation: { escapeValue: false },
  saveMissing: false,
})

export default i18n
export { i18n }

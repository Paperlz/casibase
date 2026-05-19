import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import en from "./locales/en/data.json"
import zh from "./locales/zh/data.json"

const LANGUAGE_KEY = "language"
const supportedLanguages = ["en", "zh"] as const
type SupportedLanguage = (typeof supportedLanguages)[number]

function toSupportedLanguage(language: string | null | undefined): SupportedLanguage | null {
  if (!language) return null
  const normalized = language.toLowerCase()
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh"
  if (normalized === "en" || normalized.startsWith("en-")) return "en"
  return null
}

function getInitialLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "en"

  const storedLanguage = toSupportedLanguage(window.localStorage.getItem(LANGUAGE_KEY))
  if (storedLanguage) return storedLanguage

  return toSupportedLanguage(window.navigator.language) ?? "en"
}

export function getLanguage(): SupportedLanguage {
  return toSupportedLanguage(i18n.resolvedLanguage) ?? toSupportedLanguage(i18n.language) ?? "en"
}

export function setLanguage(language: string | null | undefined): SupportedLanguage {
  const nextLanguage = toSupportedLanguage(language) ?? "en"
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LANGUAGE_KEY, nextLanguage)
  }
  void i18n.changeLanguage(nextLanguage)
  return nextLanguage
}

const namespaces = Object.keys(en) as string[]

i18n.use(initReactI18next).init({
  lng: getInitialLanguage(),
  resources: { en, zh },
  fallbackLng: "en",
  supportedLngs: supportedLanguages,
  ns: namespaces,
  defaultNS: "general",
  keySeparator: false,
  nsSeparator: ":",
  interpolation: { escapeValue: false },
  saveMissing: false,
})

export default i18n
export { i18n }

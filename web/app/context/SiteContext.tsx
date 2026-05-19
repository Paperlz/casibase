import * as React from "react"
import { useLocation } from "react-router"

import { type Site, getBuiltInSite } from "~/backend/SiteBackend"

const DEFAULT_HTML_TITLE = "OpenAgent"
const DEFAULT_FAVICON_URL = "https://cdn.openagentai.org/img/openagent.png"
const DEFAULT_LOGO_URL = "https://cdn.openagentai.org/img/openagent-logo_1900x450.png"

type SiteContextValue = {
  site?: Site
  refreshSite: () => Promise<void>
  getHtmlTitle: () => string
  getFaviconUrl: (theme: string) => string
  getLogoUrl: (theme: string) => string
  getFooterHtml: (theme: string) => string
}

const SiteContext = React.createContext<SiteContextValue | undefined>(undefined)

function isDark(theme: string) {
  return theme.includes("dark")
}

function withStaticBase(url: string, site?: Site) {
  if (!site?.staticBaseUrl) return url
  return url.replace("https://cdn.openagentai.org", site.staticBaseUrl)
}

function withDarkPng(url: string, theme: string) {
  return isDark(theme) ? url.replace(/\.png$/, "_white.png") : url
}

export function getSiteHtmlTitle(site?: Site) {
  let htmlTitle = DEFAULT_HTML_TITLE
  if (site?.htmlTitle && site.htmlTitle !== DEFAULT_HTML_TITLE) {
    htmlTitle = site.htmlTitle
  }
  return htmlTitle
}

export function getSiteFaviconUrl(theme: string, site?: Site) {
  let faviconUrl = DEFAULT_FAVICON_URL
  if (site?.faviconUrl && site.faviconUrl !== DEFAULT_FAVICON_URL) {
    faviconUrl = site.faviconUrl
  }
  return withDarkPng(faviconUrl, theme)
}

export function getSiteLogoUrl(theme: string, site?: Site) {
  let logoUrl = DEFAULT_LOGO_URL
  if (site?.logoUrl && site.logoUrl !== DEFAULT_LOGO_URL) {
    logoUrl = site.logoUrl
  }
  return withDarkPng(withStaticBase(logoUrl, site), theme)
}

export function getSiteFooterHtml(theme: string, site?: Site) {
  const logoUrl = getSiteLogoUrl("", site)
  const defaultFooterHtml = `<a target="_blank" href="https://github.com/the-open-agent/openagent" rel="noreferrer"><img style="padding-bottom: 3px;" height="30" alt="OpenAgent" src="${logoUrl}" /></a>`
  const isDefaultFooter = !site?.footerHtml || site.footerHtml.includes("/img/openagent-logo_1900x450.png")
  let footerHtml = isDefaultFooter ? defaultFooterHtml : site.footerHtml!
  footerHtml = withStaticBase(footerHtml, site)
  return isDark(theme) ? footerHtml.replace(/(\.png)/g, "_white$1") : footerHtml
}

function getStoredTheme() {
  if (typeof window === "undefined") return "default"
  return localStorage.getItem("themeAlgorithm") ?? "default"
}

function isColorDark(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
}

function applyThemeColor(color: string | undefined | null) {
  if (!color || typeof document === "undefined") return
  const root = document.documentElement
  root.style.setProperty("--primary", color)
  root.style.setProperty("--sidebar-primary", color)
  root.style.setProperty("--ring", color)
  const fg = isColorDark(color) ? "oklch(0.985 0 0)" : "oklch(0.145 0 0)"
  root.style.setProperty("--primary-foreground", fg)
  root.style.setProperty("--sidebar-primary-foreground", fg)
}

function setFavicon(href: string) {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
  if (!link) {
    link = document.createElement("link")
    link.rel = "icon"
    document.head.appendChild(link)
  }
  link.href = href
}

function SiteHeadSync({ site }: { site?: Site }) {
  const location = useLocation()
  const [themeVersion, setThemeVersion] = React.useState(0)

  React.useEffect(() => {
    const onThemeUpdated = () => setThemeVersion((version) => version + 1)
    window.addEventListener("openagent:theme-updated", onThemeUpdated)
    return () => window.removeEventListener("openagent:theme-updated", onThemeUpdated)
  }, [])

  React.useEffect(() => {
    const theme = getStoredTheme()
    document.title = getSiteHtmlTitle(site)
    setFavicon(getSiteFaviconUrl(theme, site))
  }, [location.pathname, site, themeVersion])

  return null
}

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [site, setSite] = React.useState<Site | undefined>()

  const refreshSite = React.useCallback(async () => {
    const res = await getBuiltInSite()
    if (res.status === "ok") {
      setSite(res.data ?? undefined)
    }
  }, [])

  React.useEffect(() => {
    refreshSite()
    const onRefresh = () => {
      refreshSite()
    }
    window.addEventListener("openagent:site-updated", onRefresh)
    return () => window.removeEventListener("openagent:site-updated", onRefresh)
  }, [refreshSite])

  React.useEffect(() => {
    applyThemeColor(site?.themeColor)
  }, [site?.themeColor])

  const value = React.useMemo<SiteContextValue>(() => ({
    site,
    refreshSite,
    getHtmlTitle: () => getSiteHtmlTitle(site),
    getFaviconUrl: (theme) => getSiteFaviconUrl(theme, site),
    getLogoUrl: (theme) => getSiteLogoUrl(theme, site),
    getFooterHtml: (theme) => getSiteFooterHtml(theme, site),
  }), [refreshSite, site])

  return (
    <SiteContext.Provider value={value}>
      <SiteHeadSync site={site} />
      {children}
    </SiteContext.Provider>
  )
}

export function useSite() {
  const value = React.useContext(SiteContext)
  if (!value) {
    throw new Error("useSite must be used within SiteProvider")
  }
  return value
}

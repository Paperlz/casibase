import { useCallback, useEffect, useState } from "react"

type Theme = "light" | "dark"

const THEME_KEY = "themeAlgorithm"

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light"
  const stored = localStorage.getItem(THEME_KEY)
  if (stored?.includes("dark")) return "dark"
  return "light"
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === "dark") {
    root.classList.add("dark")
  } else {
    root.classList.remove("dark")
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(THEME_KEY, theme === "dark" ? "dark" : "default")
    window.dispatchEvent(new Event("openagent:theme-updated"))
  }, [theme])

  useEffect(() => {
    const onThemeUpdated = () => {
      const stored = localStorage.getItem(THEME_KEY)
      setTheme(stored?.includes("dark") ? "dark" : "light")
    }
    window.addEventListener("openagent:theme-updated", onThemeUpdated)
    return () => window.removeEventListener("openagent:theme-updated", onThemeUpdated)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"))
  }, [])

  return { theme, toggleTheme }
}

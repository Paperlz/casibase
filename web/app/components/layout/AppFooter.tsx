import { useSite } from "~/context/SiteContext"
import { useTheme } from "~/hooks/useTheme"

export function AppFooter() {
  const { theme } = useTheme()
  const { getFooterHtml } = useSite()

  return (
    <footer className="flex h-[52px] shrink-0 items-center justify-center overflow-hidden border-t border-border px-4 text-xs text-muted-foreground [&_img]:!h-[30px] [&_img]:w-auto [&_img]:object-contain">
      <div dangerouslySetInnerHTML={{ __html: getFooterHtml(theme) }} />
    </footer>
  )
}

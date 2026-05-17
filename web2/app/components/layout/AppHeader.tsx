import * as React from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { GlobeIcon, LogOutIcon, MoonIcon, SettingsIcon, SunIcon } from "lucide-react"
import { type Account } from "~/backend/AccountBackend"
import { getLanguage, setLanguage } from "~/i18n"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Separator } from "~/components/ui/separator"
import { SidebarTrigger } from "~/components/ui/sidebar"
import { useTheme } from "~/hooks/useTheme"

const RESOURCE_LABELS: Record<string, string> = {
  stores: "Stores",
  files: "Files",
  providers: "Providers",
  vectors: "Vectors",
  chats: "Chats",
  messages: "Messages",
  usages: "Usages",
  visitors: "Visitors",
  sessions: "Sessions",
  records: "Logs",
  tasks: "Tasks",
  scales: "Scales",
  forms: "Forms",
  sysinfo: "System Info",
  sites: "Sites",
  resources: "Resources",
  servers: "MCP Servers",
  pipes: "Pipes",
  skills: "Skills",
  tools: "Tools",
  permissions: "Permissions",
  users: "Users",
}

function useBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean)

  if (segments.length === 0) return null

  const root = segments[0]
  const label = RESOURCE_LABELS[root]
  if (!label) return null

  if (segments.length === 1) {
    return { listLabel: label, listUrl: `/${root}`, detail: null }
  }

  const last = segments[segments.length - 1]
  const detailLabel = RESOURCE_LABELS[last]

  return {
    listLabel: label,
    listUrl: `/${root}`,
    detail: detailLabel ?? last,
    detailIsResource: Boolean(detailLabel),
  }
}

type AppHeaderProps = {
  account?: Account
  onSignOut?: () => void
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  zh: "中文",
}

function useHoverDropdown() {
  const [open, setOpen] = React.useState(false)
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const onMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setOpen(true)
  }
  const onMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 80)
  }

  return { open, setOpen, onMouseEnter, onMouseLeave }
}

export function AppHeader({ account, onSignOut }: AppHeaderProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const breadcrumbs = useBreadcrumbs(location.pathname)
  const language = getLanguage()
  const langDropdown = useHoverDropdown()
  const accountDropdown = useHoverDropdown()

  function getInitials(name: string) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("")
  }

  return (
    <header className="sticky top-0 z-50 flex h-[52px] shrink-0 items-center gap-2 border-b border-border bg-background px-2">
      <SidebarTrigger className="-ml-0.5" />

      <Separator orientation="vertical" className="h-4" />

      {/* Breadcrumb */}
      {breadcrumbs ? (
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/" />}>{t("general:Home")}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            {breadcrumbs.detail ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink render={<Link to={breadcrumbs.listUrl} />}>
                    {t(`general:${breadcrumbs.listLabel}`)}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {breadcrumbs.detailIsResource ? t(`general:${breadcrumbs.detail}`) : breadcrumbs.detail}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbPage>{t(`general:${breadcrumbs.listLabel}`)}</BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      ) : null}

      {/* Right side */}
      <div className="ml-auto flex items-center gap-1">
        {/* Language switcher */}
        <div onMouseEnter={langDropdown.onMouseEnter} onMouseLeave={langDropdown.onMouseLeave}>
          <DropdownMenu open={langDropdown.open} onOpenChange={langDropdown.setOpen}>
            <DropdownMenuTrigger
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="Switch language"
            >
              <GlobeIcon className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              {Object.entries(LANGUAGE_LABELS).map(([key, label]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => {
                    setLanguage(key)
                    langDropdown.setOpen(false)
                  }}
                  className={language === key ? "font-medium text-primary" : ""}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
        </button>

        {/* Account dropdown */}
        {account ? (
          <div onMouseEnter={accountDropdown.onMouseEnter} onMouseLeave={accountDropdown.onMouseLeave}>
            <DropdownMenu open={accountDropdown.open} onOpenChange={accountDropdown.setOpen}>
              <DropdownMenuTrigger
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent"
              >
                <Avatar size="sm">
                  {account.avatar && <AvatarImage src={account.avatar} alt={account.displayName} />}
                  <AvatarFallback className="text-xs">
                    {getInitials(account.displayName || account.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[120px] truncate font-medium sm:block">
                  {account.displayName || account.name}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate("/account")}>
                  <SettingsIcon />
                  {t("account:My Account")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut} variant="destructive">
                  <LogOutIcon />
                  {t("account:Sign Out")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : account === null ? (
          <Link
            to="/signin"
            className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            {t("account:Sign In")}
          </Link>
        ) : null}
      </div>
    </header>
  )
}

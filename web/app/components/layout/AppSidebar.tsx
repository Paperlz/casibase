import * as React from "react"
import { NavLink, useLocation } from "react-router"
import { useTranslation } from "react-i18next"
import { type Account, isAdminUser, isChatAdminUser } from "~/backend/AccountBackend"
import { isCasdoorAvailable, getAuthConfig } from "~/lib/AuthConfig"
import { ServerUrl } from "~/lib/api"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"
import {
  BarChart2Icon,
  BrainCircuitIcon,
  ChevronRightIcon,
  CodeIcon,
  DatabaseIcon,
  FolderOpenIcon,
  HomeIcon,
  InboxIcon,
  LayoutGridIcon,
  LayoutIcon,
  LineChartIcon,
  ListIcon,
  LockIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  MonitorIcon,
  NetworkIcon,
  PlugIcon,
  RocketIcon,
  ScrollTextIcon,
  ServerIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "~/components/ui/sidebar"
import { useTheme } from "~/hooks/useTheme"
import { useSite } from "~/context/SiteContext"

type NavItem = {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  external?: boolean
  /** If set, URL is built from the Casdoor issuer: `${issuer}${casdoorPath}` */
  casdoorPath?: string
  /** NavItemTree key when it differs from url (e.g. "/sites" for the Sites admin page) */
  navKey?: string
}

type NavGroup = {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  key: string
  items: NavItem[]
}

const navTop: NavItem[] = [
  { title: "Home", url: "/", icon: HomeIcon },
  { title: "Chat", url: "/chat", icon: MessageCircleIcon },
  { title: "Quick Setup", url: "/quick-setup", icon: RocketIcon },
]

const navGroups: NavGroup[] = [
  {
    title: "Basic",
    url: "/stores",
    icon: BrainCircuitIcon,
    key: "basic",
    items: [
      { title: "Stores", url: "/stores", icon: LayoutGridIcon },
      { title: "Chats", url: "/chats", icon: ListIcon },
      { title: "Messages", url: "/messages", icon: MessageSquareIcon },
    ],
  },
  {
    title: "Knowledge Base",
    url: "/files",
    icon: DatabaseIcon,
    key: "knowledge-base",
    items: [
      { title: "Files", url: "/files", icon: FolderOpenIcon },
      { title: "Vectors", url: "/vectors", icon: NetworkIcon },
    ],
  },
  {
    title: "Connectors",
    url: "/providers",
    icon: PlugIcon,
    key: "connectors",
    items: [
      { title: "Providers", url: "/providers", icon: ZapIcon },
      { title: "Pipes", url: "/pipes", icon: MessageCircleIcon },
      { title: "Skills", url: "/skills", icon: RocketIcon },
      { title: "Tools", url: "/tools", icon: WrenchIcon },
      { title: "MCP Servers", url: "/servers", icon: ServerIcon },
    ],
  },
  {
    title: "Multimedia",
    url: "/tasks",
    icon: ListIcon,
    key: "multimedia",
    items: [
      { title: "Tasks", url: "/tasks", icon: ListIcon },
      { title: "Scales", url: "/scales", icon: BarChart2Icon },
    ],
  },
  {
    title: "Auditing Logs",
    url: "/records",
    icon: ScrollTextIcon,
    key: "logs",
    items: [
      { title: "Logs", url: "/records", icon: DatabaseIcon },
      { title: "Sessions", url: "/sessions", icon: ListIcon },
    ],
  },
  {
    title: "Identity",
    url: "#",
    icon: LockIcon,
    key: "identity",
    items: [
      { title: "Users", url: "/users", icon: UserIcon, casdoorPath: "/users", external: true },
      { title: "Permissions", url: "/permissions", icon: ShieldIcon, casdoorPath: "/permissions", external: true },
    ],
  },
  {
    title: "Admin",
    url: "/sites/admin/site-built-in",
    icon: SettingsIcon,
    key: "admin",
    items: [
      { title: "Sites", url: "/sites/admin/site-built-in", icon: LayoutIcon, navKey: "/sites" },
      { title: "Resources", url: "/resources", icon: InboxIcon },
      { title: "Usages", url: "/usages", icon: LineChartIcon },
      { title: "Visitors", url: "/visitors", icon: BarChart2Icon },
      { title: "System Info", url: "/sysinfo", icon: MonitorIcon },
      { title: "Swagger", url: `${ServerUrl}/swagger/index.html`, icon: CodeIcon, external: true, navKey: "/swagger" },
    ],
  },
]

function getActiveGroupKey(pathname: string): string | null {
  if (pathname.includes("/chats") || pathname.includes("/messages") || pathname.includes("/stores")) return "basic"
  if (pathname.includes("/providers") || pathname.includes("/pipes") || pathname.includes("/tools") || pathname.includes("/servers")) return "connectors"
  if (pathname.includes("/files") || pathname.includes("/vectors")) return "knowledge-base"
  if (pathname.includes("/tasks") || pathname.includes("/scales")) return "multimedia"
  if (pathname.includes("/sessions") || pathname.includes("/records")) return "logs"
  if (pathname.includes("/users") || pathname.includes("/permissions")) return "identity"
  if (pathname.includes("/sysinfo") || pathname.includes("/visitors") || pathname.includes("/sites") || pathname.includes("/usages") || pathname.includes("/resources")) return "admin"
  return null
}

const SIDEBAR_GROUP_STORAGE_PREFIX = "sidebar-group-"

function NavGroupItem({
  group,
  defaultOpen,
  casdoorAvailable,
  casdoorIssuer,
}: {
  group: NavGroup
  defaultOpen: boolean
  casdoorAvailable: boolean
  casdoorIssuer: string
}) {
  const location = useLocation()
  const { t } = useTranslation("general")
  const Icon = group.icon
  const title = t(group.title)

  const [open, setOpen] = React.useState(() => {
    try {
      const saved = localStorage.getItem(`${SIDEBAR_GROUP_STORAGE_PREFIX}${group.key}`)
      return saved !== null ? saved === "true" : defaultOpen
    } catch {
      return defaultOpen
    }
  })

  const handleOpenChange = React.useCallback((newOpen: boolean) => {
    setOpen(newOpen)
    try {
      localStorage.setItem(`${SIDEBAR_GROUP_STORAGE_PREFIX}${group.key}`, String(newOpen))
    } catch {}
  }, [group.key])

  function renderSubButton(item: NavItem) {
    if (item.casdoorPath) {
      return <a href={`${casdoorIssuer}${item.casdoorPath}`} target="_blank" rel="noreferrer" />
    }
    if (item.external) {
      return <a href={item.url} target="_blank" rel="noreferrer" />
    }
    return <NavLink to={item.url} />
  }

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange} className="group/collapsible">
      <SidebarMenuItem>
        <SidebarMenuButton
          render={<CollapsibleTrigger className="w-full" />}
          tooltip={title}
        >
          <Icon className="shrink-0" />
          <span>{title}</span>
          <ChevronRightIcon className="ml-auto shrink-0 transition-transform duration-200 group-data-open/collapsible:rotate-90" />
        </SidebarMenuButton>
        <CollapsibleContent>
          <SidebarMenuSub>
            {group.items.map((item) => {
              const isCasdoorBlocked = !!item.casdoorPath && !casdoorAvailable
              const isActive = !item.casdoorPath && location.pathname.startsWith(item.url) && item.url !== "/"
              return (
                <SidebarMenuSubItem key={item.title}>
                  {isCasdoorBlocked ? (
                    <Tooltip>
                      {/* div wrapper captures hover even though the inner button has pointer-events-none via aria-disabled */}
                      <TooltipTrigger render={<div />}>
                        <SidebarMenuSubButton render={<span />} aria-disabled>
                          <span>{t(item.title)}</span>
                        </SidebarMenuSubButton>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {t("Requires Casdoor to be installed")}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <SidebarMenuSubButton
                      render={renderSubButton(item)}
                      isActive={isActive}
                    >
                      <span>{t(item.title)}</span>
                    </SidebarMenuSubButton>
                  )}
                </SidebarMenuSubItem>
              )
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

export function AppSidebar({
  account,
  ...props
}: React.ComponentProps<typeof Sidebar> & { account?: Account }) {
  const location = useLocation()
  const { t } = useTranslation("general")
  const { theme } = useTheme()
  const { getLogoUrl, getFaviconUrl } = useSite()
  const { state } = useSidebar()
  const activeGroupKey = getActiveGroupKey(location.pathname)
  const logoUrl = getLogoUrl(theme)
  const faviconUrl = getFaviconUrl(theme)

  const casdoorAvailable = isCasdoorAvailable()
  const casdoorIssuer = getAuthConfig().issuer

  const { site } = useSite()
  const navItems = site?.navItems

  function isNavKeyVisible(key: string): boolean {
    if (!navItems || navItems.length === 0) return true
    if (navItems.includes("all")) return true
    return navItems.includes(key)
  }

  const visibleNavTop = React.useMemo(() =>
    navTop.filter(item => item.url !== "/chat" || isNavKeyVisible("/chat")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navItems]
  )

  const visibleGroups = React.useMemo(() => {
    // Filter items within each group, then filter empty groups
    let groups = navGroups
      .map(group => ({
        ...group,
        items: group.items.filter(item => isNavKeyVisible(item.navKey ?? item.url)),
      }))
      .filter(group => isNavKeyVisible("/" + group.key) || group.items.length > 0)

    // Role-based filtering
    if (account && isChatAdminUser(account) && !isAdminUser(account)) {
      groups = groups.filter(g => !["multimedia", "logs"].includes(g.key))
    }

    return groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, navItems])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="h-[52px] justify-center border-b border-sidebar-border px-4 py-0">
        <NavLink to="/" className="flex items-center gap-2 overflow-hidden">
          <img
            src={state === "collapsed" ? faviconUrl : logoUrl}
            alt="logo"
            className="h-[38px] max-w-40 object-contain transition-[height,width,max-width] group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-7 group-data-[collapsible=icon]:rounded-md"
          />
        </NavLink>
      </SidebarHeader>

      <SidebarContent className="pt-1.5">
        {/* Top-level nav items */}
        <SidebarGroup className="pb-0">
          <SidebarMenu>
            {visibleNavTop.map((item) => {
              const Icon = item.icon
              const isActive = item.url === "/" ? location.pathname === "/" || location.pathname === "/home" : location.pathname.startsWith(item.url)
              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    render={<NavLink to={item.url} />}
                    tooltip={t(item.title)}
                    isActive={isActive}
                  >
                    <Icon className="shrink-0" />
                    <span>{t(item.title)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* Grouped nav items */}
        <SidebarGroup>
          <SidebarMenu>
            {visibleGroups.map((group) => (
              <NavGroupItem
                key={group.key}
                group={group}
                defaultOpen={
                  activeGroupKey === group.key ||
                  ["basic", "knowledge-base", "connectors", "admin"].includes(group.key)
                }
                casdoorAvailable={casdoorAvailable}
                casdoorIssuer={casdoorIssuer}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}

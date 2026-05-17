import * as React from "react"
import { NavLink, useLocation } from "react-router"
import { useTranslation } from "react-i18next"
import { type Account, isAdminUser, isChatAdminUser } from "~/backend/AccountBackend"
import {
  BarChart2Icon,
  BrainCircuitIcon,
  ChevronRightIcon,
  CodeIcon,
  DatabaseIcon,
  FileTextIcon,
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
  UsersIcon,
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
} from "~/components/ui/sidebar"
import { useTheme } from "~/hooks/useTheme"
import { useSite } from "~/context/SiteContext"

type NavItem = {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  external?: boolean
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
      { title: "Forms", url: "/forms", icon: FileTextIcon },
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
      { title: "Users", url: "/users", icon: UserIcon },
      { title: "Casdoor Resources", url: "/casdoor-resources", icon: UsersIcon },
      { title: "Permissions", url: "/permissions", icon: ShieldIcon },
    ],
  },
  {
    title: "Admin",
    url: "/sites/site-built-in",
    icon: SettingsIcon,
    key: "admin",
    items: [
      { title: "Sites", url: "/sites", icon: LayoutIcon },
      { title: "Resources", url: "/resources", icon: InboxIcon },
      { title: "Usages", url: "/usages", icon: LineChartIcon },
      { title: "Visitors", url: "/visitors", icon: BarChart2Icon },
      { title: "System Info", url: "/sysinfo", icon: MonitorIcon },
      { title: "Swagger", url: "/swagger", icon: CodeIcon, external: true },
    ],
  },
]

function getActiveGroupKey(pathname: string): string | null {
  if (pathname.includes("/chats") || pathname.includes("/messages") || pathname.includes("/stores")) return "basic"
  if (pathname.includes("/providers") || pathname.includes("/pipes") || pathname.includes("/tools") || pathname.includes("/servers")) return "connectors"
  if (pathname.includes("/files") || pathname.includes("/vectors")) return "knowledge-base"
  if (pathname.includes("/tasks") || pathname.includes("/scales") || pathname.includes("/forms")) return "multimedia"
  if (pathname.includes("/sessions") || pathname.includes("/records")) return "logs"
  if (pathname.includes("/users") || pathname.includes("/permissions")) return "identity"
  if (pathname.includes("/sysinfo") || pathname.includes("/visitors") || pathname.includes("/sites") || pathname.includes("/usages") || pathname.includes("/resources")) return "admin"
  return null
}

function NavGroupItem({ group, defaultOpen }: { group: NavGroup; defaultOpen: boolean }) {
  const location = useLocation()
  const { t } = useTranslation("general")
  const Icon = group.icon
  const title = t(group.title)

  return (
    <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
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
              const isActive = location.pathname.startsWith(item.url) && item.url !== "/"
              return (
                <SidebarMenuSubItem key={item.url}>
                  <SidebarMenuSubButton
                    render={item.external ? <a href={item.url} target="_blank" rel="noreferrer" /> : <NavLink to={item.url} />}
                    isActive={isActive}
                  >
                    <span>{t(item.title)}</span>
                  </SidebarMenuSubButton>
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
  const { getLogoUrl } = useSite()
  const activeGroupKey = getActiveGroupKey(location.pathname)
  const logoUrl = getLogoUrl(theme)

  // Filter nav groups based on user role
  const visibleGroups = React.useMemo(() => {
    if (!account) return navGroups
    // Chat-admin users only see a subset
    if (isChatAdminUser(account) && !isAdminUser(account)) {
      return navGroups.filter(g => !["multimedia", "logs"].includes(g.key))
    }
    return navGroups
  }, [account])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="h-[52px] justify-center border-b border-sidebar-border px-4 py-0">
        <NavLink to="/" className="flex items-center gap-2 overflow-hidden">
          <img
            src={logoUrl}
            alt="logo"
            className="h-[38px] max-w-40 object-contain transition-[height,width,max-width] group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-7 group-data-[collapsible=icon]:rounded-md"
          />
        </NavLink>
      </SidebarHeader>

      <SidebarContent className="pt-1.5">
        {/* Top-level nav items */}
        <SidebarGroup className="pb-0">
          <SidebarMenu>
            {navTop.map((item) => {
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
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}

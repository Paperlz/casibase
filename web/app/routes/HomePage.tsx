import { useEffect, useState } from "react"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import {
  ArrowRightIcon,
  BotIcon,
  DatabaseIcon,
  FileTextIcon,
  GitBranchIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  MessageCircleIcon,
  NetworkIcon,
  PlugIcon,
  RocketIcon,
  ServerIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react"
import { getBuiltInSite } from "~/backend/SiteBackend"
import { useSite } from "~/context/SiteContext"

interface QuickLink {
  title: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface Section {
  label: string
  items: QuickLink[]
}

export function meta() {
  return [{ title: "OpenAgent" }]
}

export default function HomePage() {
  const { t } = useTranslation()
  const { site } = useSite()
  const [welcomeTitle, setWelcomeTitle] = useState<string>(t("home:Welcome to OpenAgent"))
  const [welcomeText, setWelcomeText] = useState<string>(t("home:Welcome subtitle"))

  useEffect(() => {
    getBuiltInSite().then((res) => {
      if (res.status === "ok" && res.data) {
        if (res.data.welcomeTitle) setWelcomeTitle(res.data.welcomeTitle)
        if (res.data.welcomeText) setWelcomeText(res.data.welcomeText)
      }
    })
  }, [])

  const navItems = site?.navItems
  function isNavKeyVisible(key: string): boolean {
    if (!navItems || navItems.length === 0) return true
    if (navItems.includes("all")) return true
    return navItems.includes(key)
  }

  const allSections: Section[] = [
    {
      label: t("general:Knowledge Base"),
      items: [
        {
          title: t("general:Stores"),
          description: t("home:Manage your AI agent knowledge stores"),
          href: "/stores",
          icon: LayoutGridIcon,
        },
        {
          title: t("general:Files"),
          description: t("home:Upload and manage knowledge files"),
          href: "/files",
          icon: DatabaseIcon,
        },
        {
          title: t("general:Vectors"),
          description: t("home:Manage vector embeddings and semantic search"),
          href: "/vectors",
          icon: NetworkIcon,
        },
      ],
    },
    {
      label: t("general:Connectors"),
      items: [
        {
          title: t("general:Providers"),
          description: t("home:Connect and configure AI model providers"),
          href: "/providers",
          icon: PlugIcon,
        },
        {
          title: t("general:Pipes"),
          description: t("home:Build and manage agent pipelines"),
          href: "/pipes",
          icon: GitBranchIcon,
        },
        {
          title: t("general:Skills"),
          description: t("home:Define reusable AI agent skills"),
          href: "/skills",
          icon: SparklesIcon,
        },
        {
          title: t("general:Tools"),
          description: t("home:Configure tools your agents can use"),
          href: "/tools",
          icon: WrenchIcon,
        },
        {
          title: t("general:MCP Servers"),
          description: t("home:Connect Model Context Protocol servers"),
          href: "/servers",
          icon: ServerIcon,
        },
      ],
    },
    {
      label: t("home:Automation"),
      items: [
        {
          title: t("general:Tasks"),
          description: t("home:Manage and monitor background agent tasks"),
          href: "/tasks",
          icon: BotIcon,
        },
        {
          title: t("general:Scales"),
          description: t("home:Scale your agent workloads efficiently"),
          href: "/scales",
          icon: ZapIcon,
        },
      ],
    },
    {
      label: t("home:Monitoring"),
      items: [
        {
          title: t("home:Audit Logs"),
          description: t("home:Track and review all agent activity"),
          href: "/records",
          icon: FileTextIcon,
        },
        {
          title: t("general:Sessions"),
          description: t("home:View active and historical agent sessions"),
          href: "/sessions",
          icon: ShieldCheckIcon,
        },
        {
          title: t("home:API Keys"),
          description: t("home:Manage access credentials and API keys"),
          href: "/usages",
          icon: KeyRoundIcon,
        },
      ],
    },
  ]

  const sections = allSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => isNavKeyVisible(item.href)),
    }))
    .filter(section => section.items.length > 0)

  return (
    <div className="min-h-full">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-background via-background to-muted/40 px-6 py-12">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <SparklesIcon className="h-3 w-3" />
            OpenAgent Platform
          </div>
          <h1 className="text-4xl font-bold tracking-tight">{welcomeTitle}</h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{welcomeText}</p>
          <div className="mt-6 flex items-center gap-3">
            <Link
              to="/chat"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
            >
              <MessageCircleIcon className="h-4 w-4" />
              {t("general:Chat")}
            </Link>
            <Link
              to="/quick-setup"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-all hover:bg-accent hover:shadow-md"
            >
              <RocketIcon className="h-4 w-4" />
              {t("general:Quick Setup")}
            </Link>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-8 p-6">
        {sections.map((section) => (
          <div key={section.label} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {section.label}
              </h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent/30 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <ArrowRightIcon className="h-4 w-4 translate-x-0 text-transparent transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-muted-foreground/50" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold leading-snug">{item.title}</div>
                      <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {item.description}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import {
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

interface QuickLink {
  title: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}

export function meta() {
  return [{ title: "OpenAgent" }]
}

export default function HomePage() {
  const { t } = useTranslation()

  const sections: { label: string; items: QuickLink[] }[] = [
    {
      label: t("home:Get Started"),
      items: [
        {
          title: t("general:Chat"),
          description: t("home:Start a conversation with your AI assistant"),
          href: "/chat",
          icon: MessageCircleIcon,
          color: "bg-primary/10 text-primary",
        },
        {
          title: t("general:Quick Setup"),
          description: t("home:Configure your AI platform in minutes"),
          href: "/quick-setup",
          icon: RocketIcon,
          color: "bg-primary/10 text-primary",
        },
      ],
    },
    {
      label: t("general:Knowledge Base"),
      items: [
        {
          title: t("general:Stores"),
          description: t("home:Manage your AI agent knowledge stores"),
          href: "/stores",
          icon: LayoutGridIcon,
          color: "bg-primary/10 text-primary",
        },
        {
          title: t("general:Files"),
          description: t("home:Upload and manage knowledge files"),
          href: "/files",
          icon: DatabaseIcon,
          color: "bg-primary/10 text-primary",
        },
        {
          title: t("general:Vectors"),
          description: t("home:Manage vector embeddings and semantic search"),
          href: "/vectors",
          icon: NetworkIcon,
          color: "bg-primary/10 text-primary",
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
          color: "bg-primary/10 text-primary",
        },
        {
          title: t("general:Pipes"),
          description: t("home:Build and manage agent pipelines"),
          href: "/pipes",
          icon: GitBranchIcon,
          color: "bg-primary/10 text-primary",
        },
        {
          title: t("general:Skills"),
          description: t("home:Define reusable AI agent skills"),
          href: "/skills",
          icon: SparklesIcon,
          color: "bg-primary/10 text-primary",
        },
        {
          title: t("general:Tools"),
          description: t("home:Configure tools your agents can use"),
          href: "/tools",
          icon: WrenchIcon,
          color: "bg-primary/10 text-primary",
        },
        {
          title: t("general:MCP Servers"),
          description: t("home:Connect Model Context Protocol servers"),
          href: "/servers",
          icon: ServerIcon,
          color: "bg-primary/10 text-primary",
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
          color: "bg-primary/10 text-primary",
        },
        {
          title: t("general:Scales"),
          description: t("home:Scale your agent workloads efficiently"),
          href: "/scales",
          icon: ZapIcon,
          color: "bg-primary/10 text-primary",
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
          color: "bg-primary/10 text-primary",
        },
        {
          title: t("general:Sessions"),
          description: t("home:View active and historical agent sessions"),
          href: "/sessions",
          icon: ShieldCheckIcon,
          color: "bg-primary/10 text-primary",
        },
        {
          title: t("home:API Keys"),
          description: t("home:Manage access credentials and API keys"),
          href: "/usages",
          icon: KeyRoundIcon,
          color: "bg-primary/10 text-primary",
        },
      ],
    },
  ]

  return (
    <div className="flex flex-col gap-10 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("home:Welcome to OpenAgent")}</h1>
        <p className="mt-2 text-muted-foreground">{t("home:Welcome subtitle")}</p>
      </div>

      {sections.map((section) => (
        <div key={section.label} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {section.label}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {section.items.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-all hover:bg-accent/50 hover:shadow-sm"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold">{item.title}</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">{item.description}</div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

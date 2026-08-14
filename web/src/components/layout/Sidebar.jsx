import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Boxes,
  Cpu,
  History,
  ShieldCheck,
  Settings,
  Activity,
  Network,
  FolderOpen,
  Globe,
  TerminalSquare,
  Cable,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { healthApi } from "@/lib/api";

const navGroups = [
  {
    label: "总览",
    items: [{ to: "/", label: "仪表盘", icon: LayoutDashboard, end: true }],
  },
  {
    label: "服务资源",
    items: [
      { to: "/services", label: "服务管理", icon: Boxes },
      { to: "/runtimes", label: "环境管理", icon: Cpu },
      { to: "/files", label: "文件管理", icon: FolderOpen },
    ],
  },
  {
    label: "网络接入",
    items: [
      { to: "/sites", label: "站点管理", icon: Globe },
      { to: "/tunnels", label: "流量隧道", icon: Cable },
    ],
  },
  {
    label: "节点运维",
    items: [
      { to: "/agents", label: "多节点", icon: Network },
      { to: "/terminal", label: "服务器控制台", icon: TerminalSquare },
    ],
  },
  {
    label: "记录审计",
    items: [
      { to: "/operations", label: "操作记录", icon: History },
      { to: "/audit-logs", label: "审计日志", icon: ShieldCheck },
    ],
  },
  {
    label: "系统",
    items: [{ to: "/settings", label: "设置", icon: Settings }],
  },
];

export function Sidebar() {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: healthApi.check,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const version = health?.version || "";

  return (
    <aside className="flex h-full w-[68px] shrink-0 flex-col border-r bg-card/50 backdrop-blur-sm lg:w-60">
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center justify-center gap-2.5 border-b px-2 lg:justify-start lg:px-5">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm shadow-primary/25">
          <Activity className="h-4.5 w-4.5 text-primary-foreground" />
          {health ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
          ) : null}
        </div>
        <div className="hidden flex-col leading-tight lg:flex">
          <span className="text-sm font-semibold tracking-tight">Aluka Ops</span>
          <span className="text-[10px] text-muted-foreground">服务治理系统</span>
        </div>
      </div>

      {/* 导航（项过多时仅侧栏内滚动，不与主内容抢滚动条） */}
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 lg:px-3">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label} className="pb-1.5">
            {groupIndex > 0 && <div className="mx-2 mb-1.5 border-t border-border/40 lg:hidden" />}
            <div className="hidden h-6 items-center px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 lg:flex">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={item.label}
                  aria-label={item.label}
                  className={({ isActive }) =>
                    cn(
                      "group flex h-8 items-center justify-center gap-3 rounded-md px-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] lg:justify-start lg:px-3",
                      isActive
                        ? "bg-primary/10 text-primary shadow-[inset_3px_0_0_hsl(var(--primary))] font-semibold"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-110" />
                  <span className="hidden truncate lg:block">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* 版本 */}
      <div className="shrink-0 border-t p-3 text-center text-[10px] text-muted-foreground lg:text-left lg:text-[11px]">
        <div className="lg:hidden">{version ? `v${version}` : "v-"}</div>
        <div className="hidden lg:block font-mono">
          {version ? `v${version}` : "v-"} · 服务治理 / 网关
        </div>
        <div className="mt-0.5 hidden lg:block text-[10px] text-muted-foreground/70">
          © Aluka Ops
        </div>
      </div>
    </aside>
  );
}

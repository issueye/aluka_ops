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
    <aside className="flex h-full w-[68px] shrink-0 flex-col border-r bg-card/40 lg:w-60">
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center justify-center gap-2 border-b px-2 lg:justify-start lg:px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Activity className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="hidden flex-col leading-tight lg:flex">
          <span className="text-sm font-semibold">Aluka Ops</span>
          <span className="text-[10px] text-muted-foreground">服务治理系统</span>
        </div>
      </div>

      {/* 导航（项过多时仅侧栏内滚动，不与主内容抢滚动条） */}
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5 lg:px-3">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label} className="pb-1">
            {groupIndex > 0 && <div className="mx-2 mb-1 border-t lg:hidden" />}
            <div className="hidden h-6 items-center px-3 text-[10px] font-medium text-muted-foreground lg:flex">
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
                      "flex h-8 items-center justify-center gap-3 rounded-md px-2 text-sm font-medium transition-colors lg:justify-start lg:px-3",
                      isActive
                        ? "bg-primary/10 text-primary shadow-[inset_2px_0_0_hsl(var(--primary))]"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
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
        <div className="hidden lg:block">
          {version ? `v${version}` : "v-"} · 服务治理 / 网关
        </div>
        <div className="mt-0.5 hidden lg:block">© Aluka Ops</div>
      </div>
    </aside>
  );
}

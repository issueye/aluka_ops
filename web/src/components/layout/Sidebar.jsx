import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  Cpu,
  Package,
  History,
  ShieldCheck,
  Settings,
  Activity,
  FileCode2,
  Network,
  FolderOpen,
  Globe,
  TerminalSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "仪表盘", icon: LayoutDashboard, end: true },
  { to: "/services", label: "服务管理", icon: Boxes },
  { to: "/agents", label: "多节点", icon: Network },
  { to: "/runtimes", label: "环境管理", icon: Cpu },
  { to: "/templates", label: "服务模板", icon: FileCode2 },
  { to: "/sites", label: "站点管理", icon: Globe },
  { to: "/terminal", label: "服务器控制台", icon: TerminalSquare },
  { to: "/files", label: "文件管理", icon: FolderOpen },
  { to: "/artifacts", label: "制品管理", icon: Package },
  { to: "/operations", label: "操作记录", icon: History },
  { to: "/audit-logs", label: "审计日志", icon: ShieldCheck },
  { to: "/settings", label: "设置", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-card/40">
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Activity className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">Aluka Ops</span>
          <span className="text-[10px] text-muted-foreground">服务治理系统</span>
        </div>
      </div>

      {/* 导航（项过多时仅侧栏内滚动，不与主内容抢滚动条） */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* 版本 */}
      <div className="shrink-0 border-t p-3 text-[11px] text-muted-foreground">
        <div>v0.2.0 · 服务治理 / 网关</div>
        <div className="mt-0.5">© Aluka Ops</div>
      </div>
    </aside>
  );
}

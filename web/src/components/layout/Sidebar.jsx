import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Boxes,
  Folder,
  Globe,
  History,
  LayoutGrid,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  Terminal,
  Waypoints,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { healthApi } from "@/lib/api";
import { Icon } from "@/components/ued";
import { IconTooltip } from "@/components/ued/IconTooltip";
import { Button } from "@/components/ui/button";

const SIDEBAR_COLLAPSED_KEY = "aluka_sidebar_collapsed";

const navGroups = [
  {
    label: "总览",
    items: [{ to: "/", label: "仪表盘", icon: LayoutGrid, end: true }],
  },
  {
    label: "服务资源",
    items: [
      { to: "/services", label: "服务管理", icon: Boxes },
      { to: "/runtimes", label: "环境管理", icon: Box },
      { to: "/files", label: "文件管理", icon: Folder },
    ],
  },
  {
    label: "网络接入",
    items: [
      { to: "/sites", label: "站点管理", icon: Globe },
      { to: "/tunnels", label: "流量隧道", icon: Waypoints },
    ],
  },
  {
    label: "节点运维",
    items: [
      { to: "/agents", label: "多节点", icon: Network },
      { to: "/terminal", label: "服务器控制台", icon: Terminal },
    ],
  },
  {
    label: "记录审计",
    items: [
      { to: "/operations", label: "操作记录", icon: History },
      { to: "/audit-logs", label: "审计日志", icon: ScrollText },
    ],
  },
  {
    label: "系统",
    items: [{ to: "/settings", label: "设置", icon: Settings }],
  },
];

export function Sidebar({ collapsed: controlledCollapsed, onCollapsedChange, onNavigate }) {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: healthApi.check,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const version = health?.version || "";
  const collapsed = Boolean(controlledCollapsed);

  const handleToggle = () => {
    const next = !collapsed;
    onCollapsedChange?.(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border1 bg-bg4 transition-all duration-200",
        collapsed ? "w-[60px] min-w-[60px]" : "w-[200px] min-w-[200px]"
      )}
    >
      <div
        className={cn(
          "flex h-10 shrink-0 items-center border-b border-border1/50 px-2",
          collapsed ? "justify-center" : "justify-end"
        )}
      >
        <IconTooltip label={collapsed ? "展开菜单" : "收起菜单"} side="right">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md text-text3 hover:bg-bg5 hover:text-text1"
            aria-label={collapsed ? "展开菜单" : "收起菜单"}
            aria-expanded={!collapsed}
            onClick={handleToggle}
          >
            <Icon icon={collapsed ? PanelLeftOpen : PanelLeftClose} size="sm" />
          </Button>
        </IconTooltip>
      </div>
      <nav className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", collapsed ? "px-2 py-3" : "px-3")}>
        {navGroups.map((group, groupIndex) => (
          <div key={group.label} className={collapsed ? "space-y-1 py-1" : "menu-group-block"}>
            {groupIndex > 0 && (
              <div className={cn(collapsed ? "mx-2 my-2 border-t border-border1/50" : "mx-2 mb-1.5 border-t border-border1/40")} />
            )}
            <div className={cn(collapsed ? "sr-only" : "group-title")}>{group.label}</div>
            {/* 收起态用更松的纵向节奏，避免 11 个图标挤成一列 */}
            <div className={cn("flex flex-col", collapsed ? "items-center gap-1.5" : "gap-[2px]")}>
              {group.items.map((item) => {
                const link = (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    aria-label={item.label}
                    onClick={() => onNavigate?.()}
                    className={({ isActive }) =>
                      cn(
                        collapsed
                          ? cn(
                              "flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-150",
                              isActive
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-text2 hover:bg-bg5 hover:text-text1"
                            )
                          : cn("menu-item", isActive ? "menu-item-active" : "text-text1 hover:bg-bg5")
                      )
                    }
                  >
                    <span className={cn(collapsed ? "flex h-5 w-5 items-center justify-center" : "menu-icon")}>
                      <Icon icon={item.icon} size={collapsed ? "sm" : "md"} />
                    </span>
                    {!collapsed && <span className="menu-text">{item.label}</span>}
                  </NavLink>
                );
                if (!collapsed) return link;
                return (
                  <IconTooltip key={item.to} label={item.label} side="right">
                    <div className="flex w-full justify-center">{link}</div>
                  </IconTooltip>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div
        className={cn(
          "shrink-0 border-t border-border1 py-3 text-xs text-text3",
          collapsed ? "flex flex-col items-center gap-1 px-2 text-center" : "px-5"
        )}
      >
        {collapsed && <span className="h-1 w-6 rounded-full bg-border1" aria-hidden />}
        <span className="font-mono leading-none">{collapsed ? (version ? `v${version.split(".")[0]}` : "v-") : version ? `v${version}` : "v-"}</span>
      </div>
    </aside>
  );
}

export { SIDEBAR_COLLAPSED_KEY };

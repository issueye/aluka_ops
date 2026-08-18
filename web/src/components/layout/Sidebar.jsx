import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { healthApi } from "@/lib/api";
import { Logo } from "./Logo";

const navGroups = [
  {
    label: "总览",
    items: [{ to: "/", label: "仪表盘", end: true }],
  },
  {
    label: "服务资源",
    items: [
      { to: "/services", label: "服务管理" },
      { to: "/runtimes", label: "环境管理" },
      { to: "/files", label: "文件管理" },
    ],
  },
  {
    label: "网络接入",
    items: [
      { to: "/sites", label: "站点管理" },
      { to: "/tunnels", label: "流量隧道" },
    ],
  },
  {
    label: "节点运维",
    items: [
      { to: "/agents", label: "多节点" },
      { to: "/terminal", label: "服务器控制台" },
    ],
  },
  {
    label: "记录审计",
    items: [
      { to: "/operations", label: "操作记录" },
      { to: "/audit-logs", label: "审计日志" },
    ],
  },
  {
    label: "系统",
    items: [{ to: "/settings", label: "设置" }],
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
    <aside className="flex h-full w-[200px] min-w-[200px] shrink-0 flex-col bg-bg4">
      <div className="flex shrink-0 items-center px-[22px] py-5">
        <Logo markOnly markClassName="h-7 w-7" />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label} className="menu-group-block">
            {groupIndex > 0 && <div className="mx-2 mb-1.5 border-t border-border1/40" />}
            <div className="group-title">{group.label}</div>
            <div className="flex flex-col gap-[2px]">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={item.label}
                  aria-label={item.label}
                  className={({ isActive }) =>
                    cn(
                      "menu-item",
                      isActive
                        ? "menu-item-active"
                        : "text-text1 hover:bg-bg5"
                    )
                  }
                >
                  <span className="menu-text">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-border1 px-5 py-3 text-xs text-text3">
        <span className="font-mono">{version ? `v${version}` : "v-"}</span>
      </div>
    </aside>
  );
}

import { Outlet, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const titleMap = {
  "/": { title: "仪表盘", desc: "服务运行概览与异常一览" },
  "/services": { title: "服务管理", desc: "服务的安装、启停、升级与卸载" },
  "/agents": { title: "多节点 Agent", desc: "中心模式下的 Agent 列表与远程启停" },
  "/runtimes": { title: "环境管理", desc: "JDK 等运行环境的登记与默认配置" },
  "/templates": { title: "服务模板", desc: "配置配方与从模板创建服务" },
  "/files": { title: "文件管理", desc: "管理 data 目录内的文件与文件夹" },
  "/sites": { title: "站点管理", desc: "动态端口站点：APP、反代与路由脚本" },
  "/terminal": { title: "服务器控制台", desc: "系统级 Shell（Windows 默认 PowerShell）" },
  "/artifacts": { title: "制品管理", desc: "服务安装包的版本与回滚" },
  "/operations": { title: "操作记录", desc: "所有服务操作的执行历史" },
  "/audit-logs": { title: "审计日志", desc: "写操作的留痕追溯" },
  "/settings": { title: "设置", desc: "系统全局配置" },
};

function resolveMeta(pathname) {
  if (titleMap[pathname]) return titleMap[pathname];
  if (/^\/services\/\d+/.test(pathname)) {
    return { title: "服务详情", desc: "服务运行状态、配置与操作记录" };
  }
  if (/^\/sites\/\d+/.test(pathname)) {
    return { title: "站点详情", desc: "本站点的 APP、反代规则与路由脚本" };
  }
  return { title: "Aluka Ops", desc: "" };
}

export function AppLayout() {
  const { pathname } = useLocation();
  const meta = resolveMeta(pathname);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full min-h-0 w-full overflow-hidden">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar title={meta.title} description={meta.desc} />
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-background p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

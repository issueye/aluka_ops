import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar, SIDEBAR_COLLAPSED_KEY } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppLayout() {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        <Topbar collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)} onOpenMobile={() => setMobileOpen(true)} />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="hidden lg:flex">
            <Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed} />
          </div>
          {mobileOpen && (
            <div className="fixed inset-0 z-40 flex lg:hidden" role="dialog" aria-modal="true">
              <button type="button" aria-label="关闭菜单" className="flex-1 bg-black/40 backdrop-blur-[1px]" onClick={() => setMobileOpen(false)} />
              <div className="h-full shadow-xl">
                <Sidebar collapsed={false} onCollapsedChange={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} />
              </div>
            </div>
          )}
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-bg1">
            <div key={pathname} className="animate-fade-in min-h-full">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

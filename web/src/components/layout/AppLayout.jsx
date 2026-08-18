import { Outlet, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppLayout() {
  const { pathname } = useLocation();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        <Topbar />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar />
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
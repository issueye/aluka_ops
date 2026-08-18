import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { healthApi, authApi } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AgentSwitcher } from "@/components/layout/AgentSwitcher";
import { IconTooltip, StatusBadge } from "@/components/ued";
import { Logo } from "./Logo";

export function Topbar() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: healthApi.check,
    refetchInterval: 15000,
    staleTime: 10000,
  });
  const { data: authStatus } = useQuery({
    queryKey: ["auth-status"],
    queryFn: authApi.status,
    staleTime: 30000,
  });

  const status = isLoading
    ? { text: "检测中", tone: "secondary" }
    : isError
      ? { text: "后端离线", tone: "danger" }
      : { text: `在线 · ${data?.mode || ""}`, tone: "success" };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
    clearToken();
    toast.success("已退出登录");
    navigate("/login", { replace: true });
  };

  return (
    <header className="relative z-[100] flex h-12 shrink-0 items-center justify-between bg-bg1 px-4 shadow-[0_2px_6px_0_rgba(0,0,0,0.05)] lg:px-6">
      <div className="flex min-w-0 items-center">
        <Logo className="text-text1" markClassName="h-6 w-6" />
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <AgentSwitcher />
        <ThemeToggle />
        <StatusBadge
          tone={status.tone}
          label={status.text}
          pulse={status.tone === "success"}
        />
        {authStatus?.auth_enabled && getToken() && (
          <IconTooltip label="退出登录">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              aria-label="退出登录"
            >
              <LogOut className="h-4 w-4" />
              退出
            </Button>
          </IconTooltip>
        )}
      </div>
    </header>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { healthApi, authApi } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconTooltip, StatusBadge } from "@/components/ued";

export function Topbar({ title, description }) {
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
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background/80 px-6 backdrop-blur">
      <div>
        <h1 className="text-base font-semibold">{title}</h1>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {data?.version && (
          <span className="hidden text-xs text-muted-foreground sm:inline">
            后端 v{data.version}
          </span>
        )}
        <ThemeToggle />
        <StatusBadge tone={status.tone} label={status.text} />
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

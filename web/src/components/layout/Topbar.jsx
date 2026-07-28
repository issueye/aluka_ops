import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { healthApi, authApi } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// 顶栏:页面标题 + 后端健康状态 + 退出登录。
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
    ? { text: "检测中", variant: "secondary" }
    : isError
    ? { text: "后端离线", variant: "danger" }
    : { text: `在线 · ${data?.mode || ""}`, variant: "success" };

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
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
      <div>
        <h1 className="text-base font-semibold">{title}</h1>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {data?.version && (
          <span className="text-xs text-muted-foreground">
            后端 v{data.version}
          </span>
        )}
        <Badge variant={status.variant} className="gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {status.text}
        </Badge>
        {authStatus?.auth_enabled && getToken() && (
          <Button variant="ghost" size="sm" onClick={handleLogout} title="退出登录">
            <LogOut className="h-4 w-4" />
            退出
          </Button>
        )}
      </div>
    </header>
  );
}

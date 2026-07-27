import { useQuery } from "@tanstack/react-query";
import { healthApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

// 顶栏:页面标题占位 + 后端健康状态指示。
export function Topbar({ title, description }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: healthApi.check,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const status = isLoading
    ? { text: "检测中", variant: "secondary" }
    : isError
    ? { text: "后端离线", variant: "danger" }
    : { text: `在线 · ${data?.mode || ""}`, variant: "success" };

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
      </div>
    </header>
  );
}

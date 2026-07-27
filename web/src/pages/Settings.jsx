import { useQuery } from "@tanstack/react-query";
import { healthApi } from "@/lib/api";
import { Placeholder } from "@/components/Placeholder";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function Settings() {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: healthApi.check,
    staleTime: 10000,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>系统信息</CardTitle>
          <CardDescription>当前后端运行状态</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Info label="应用" value={health?.app || "-"} />
          <Info label="版本" value={health?.version || "-"} />
          <Info label="运行模式" value={health?.mode || "-"} />
          <Info label="主机" value={health?.host || "-"} />
          <Info label="数据库" value={health?.db || "-"} />
          <Info label="时间" value={health?.timestamp || "-"} />
        </CardContent>
      </Card>

      <Placeholder
        title="全局配置"
        milestone="M6"
        features={["数据目录、端口、运行模式切换", "Agent 上报地址(Agent 模式)"]}
      />
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

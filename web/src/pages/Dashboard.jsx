import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Boxes, Cpu, Package, CheckCircle2, AlertTriangle } from "lucide-react";
import { runtimeApi } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Placeholder } from "@/components/Placeholder";

// 仪表盘:目前可统计的只有 Runtime 数量;
// 服务/制品等数据 M2+ 才有,这里用占位展示规划。
export function Dashboard() {
  const { data: runtimes = [] } = useQuery({
    queryKey: ["runtimes"],
    queryFn: runtimeApi.list,
  });

  const defaultRt = runtimes.filter((r) => r.is_default).length;

  const stats = [
    { label: "运行环境", value: runtimes.length, sub: `默认 ${defaultRt} 个`, icon: Cpu, to: "/runtimes", enabled: true },
    { label: "服务总数", value: "—", sub: "M2 启用", icon: Boxes, to: "/services", enabled: false },
    { label: "运行中服务", value: "—", sub: "M2 启用", icon: CheckCircle2, to: "/services", enabled: false },
    { label: "异常服务", value: "—", sub: "M2 启用", icon: AlertTriangle, to: "/services", enabled: false },
  ];

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Wrapper = s.enabled ? Link : "div";
          return (
            <Wrapper
              key={s.label}
              to={s.enabled ? s.to : undefined}
              className={s.enabled ? "block transition-transform hover:scale-[1.02]" : undefined}
            >
              <Card className="h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {s.label}
                  </CardTitle>
                  <s.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{s.value}</div>
                  <p className="text-xs text-muted-foreground">{s.sub}</p>
                </CardContent>
              </Card>
            </Wrapper>
          );
        })}
      </div>

      {/* 后续能力概览 */}
      <Placeholder
        title="服务治理能力"
        milestone="M2 及以后"
        features={[
          "服务生命周期管理:安装 / 启动 / 停止 / 重启 / 升级 / 卸载",
          "实时日志流(SSE)与操作记录追溯",
          "制品版本管理与一键回滚",
          "健康检查、崩溃自动拉起、CPU/内存监控",
          "Agent 模式:多机纳管与中心 Controller 对接(预留)",
        ]}
      />
    </div>
  );
}

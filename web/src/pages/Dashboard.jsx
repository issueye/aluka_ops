import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Boxes,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  PauseCircle,
  History,
  ExternalLink,
} from "lucide-react";
import { dashboardApi } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ServiceStatusBadge } from "@/components/services/ServiceStatusBadge";
import { formatTime } from "@/lib/utils";

const OP_STATUS_VARIANT = {
  success: "success",
  failed: "danger",
  running: "warning",
  pending: "secondary",
};

const OP_TYPE_LABEL = {
  install: "安装",
  start: "启动",
  stop: "停止",
  restart: "重启",
  upgrade: "升级",
  uninstall: "卸载",
};

export function Dashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: dashboardApi.stats,
    refetchInterval: 5000,
  });

  const stats = [
    {
      label: "服务总数",
      value: data?.services_total ?? "—",
      sub: data
        ? `待启动 ${data.services_created ?? 0} · 已停止 ${data.services_stopped ?? 0}`
        : "加载中",
      icon: Boxes,
      to: "/services",
      enabled: true,
    },
    {
      label: "运行中",
      value: data?.services_running ?? "—",
      sub: "状态为 running",
      icon: CheckCircle2,
      to: "/services",
      enabled: true,
      accent: "text-emerald-400",
    },
    {
      label: "异常服务",
      value: data?.services_crashed ?? "—",
      sub: "状态为 crashed",
      icon: AlertTriangle,
      to: "/services",
      enabled: true,
      accent: "text-red-400",
    },
    {
      label: "运行环境",
      value: data?.runtimes_total ?? "—",
      sub: data ? `默认 ${data.runtimes_default ?? 0} 个` : "加载中",
      icon: Cpu,
      to: "/runtimes",
      enabled: true,
    },
  ];

  const abnormal = data?.abnormal_services || [];
  const recent = data?.recent_operations || [];

  return (
    <div className="space-y-6">
      {isError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
          仪表盘数据加载失败,请确认后端已启动。
        </div>
      )}

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
                  <s.icon className={`h-4 w-4 ${s.accent || "text-muted-foreground"}`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${s.accent || ""}`}>
                    {isLoading ? "…" : s.value}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.sub}</p>
                </CardContent>
              </Card>
            </Wrapper>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 异常服务 */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-400" /> 异常服务
              </CardTitle>
              <CardDescription>状态为 crashed 的服务</CardDescription>
            </div>
            <Link to="/services" className="text-xs text-primary hover:underline">
              全部服务
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">加载中…</p>
            ) : abnormal.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                暂无异常服务
              </div>
            ) : (
              <ul className="space-y-2">
                {abnormal.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
                  >
                    <div>
                      <Link
                        to={`/services/${s.id}`}
                        className="text-sm font-medium hover:text-primary hover:underline"
                      >
                        {s.name}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{s.code}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ServiceStatusBadge status={s.status} />
                      <Link to={`/services/${s.id}`}>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 最近操作 */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4" /> 最近操作
              </CardTitle>
              <CardDescription>最新 10 条操作记录</CardDescription>
            </div>
            <Link to="/operations" className="text-xs text-primary hover:underline">
              全部记录
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">加载中…</p>
            ) : recent.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <PauseCircle className="h-4 w-4" />
                暂无操作记录
              </div>
            ) : (
              <ul className="space-y-2">
                {recent.map((op) => (
                  <li
                    key={op.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium uppercase">
                          {OP_TYPE_LABEL[op.type] || op.type}
                        </span>
                        <Badge variant={OP_STATUS_VARIANT[op.status] || "secondary"}>
                          {op.status}
                        </Badge>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {op.service_name || `服务 #${op.service_id}`}
                        {op.error_msg ? ` · ${op.error_msg}` : op.output_log ? ` · ${op.output_log}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-xs text-muted-foreground">
                      {formatTime(op.started_at || op.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

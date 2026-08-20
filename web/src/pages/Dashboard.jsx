import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes, CheckCircle2, Activity, History, Plus, FileText, BarChart3, PieChart } from "lucide-react";
import { dashboardApi, systemApi } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { PageTemplate, StatCard, UsageBar, InfoHint, StatusBadge } from "@/components/ued";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ServiceStatusDonut, OpsTypeBars, ResourceBars, DiskTable } from "@/components/dashboard/OpsCharts";

const OP_STATUS_META = {
  success: { label: "成功", tone: "success" },
  running: { label: "运行中", tone: "default" },
  pending: { label: "等待中", tone: "secondary" },
  failed: { label: "失败", tone: "danger" },
};

/** 仪表盘 — 源力设计：统计卡片行 + 资源与服务分布 + 最近操作 + 系统健康 */
export function Dashboard() {
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: dashboardApi.stats,
    refetchInterval: 5000,
  });

  const { data: host, refetch: refetchHost } = useQuery({
    queryKey: ["system-host"],
    queryFn: systemApi.host,
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const handleCopyHost = () => {
    if (!host?.hostname) return;
    navigator.clipboard.writeText(host.hostname);
    setCopied(true);
    toast.success("已复制主机名");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefreshAll = () => {
    refetch();
    refetchHost();
    toast.success("已刷新仪表盘实时数据");
  };

  const stats = [
    {
      label: "服务总数",
      value: data?.services_total ?? "—",
      sub: data ? `待启动 ${data.services_created ?? 0} · 已停止 ${data.services_stopped ?? 0}` : "加载中...",
      icon: Boxes,
      color: "primary",
    },
    {
      label: "运行中",
      value: data?.services_running ?? "—",
      sub: data ? `${data.services_crashed ?? 0} 个异常 · ${data.services_stopped ?? 0} 个停止` : "加载中...",
      icon: CheckCircle2,
      color: "success",
    },
    {
      label: "主机负载",
      value: host ? `CPU ${host.cpu_used_pct ?? 0}% · MEM ${host.mem_used_pct ?? 0}%` : "—",
      sub: host ? `${host.num_cpu ?? 0} 核 · ${host.mem_total ? Math.round(host.mem_total / 1024 / 1024 / 1024) : 0} GB` : "加载中...",
      icon: Activity,
      color: "warning",
    },
    {
      label: "最近操作",
      value: data?.recent_operations?.length ?? "—",
      sub: data ? `${data.recent_operations?.filter((o) => o.type === "upgrade").length ?? 0} 次升级 · ${data.recent_operations?.filter((o) => o.type === "install").length ?? 0} 次安装` : "加载中...",
      icon: History,
      color: "default",
    },
  ];

  const diskPct = host?.disks?.[0]?.used_pct ?? 0;

  return (
    <PageTemplate title="仪表盘" description="系统运行概览" showRefresh onRefresh={handleRefreshAll} isRefreshing={isFetching}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <StatCard key={index} label={stat.label} value={stat.value} sub={stat.sub} icon={stat.icon} color={stat.color} />
        ))}
      </div>

      {/* 图表区：服务分布 / 操作类型 / 资源用量 + 磁盘 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="overflow-hidden lg:col-span-4">
          <div className="flex items-center gap-2 border-b border-border1 px-5 py-3.5 text-sm font-medium text-text1">
            <PieChart className="h-4 w-4 text-primary" />
            服务状态分布
          </div>
          <CardContent className="p-5">
            <ServiceStatusDonut
              total={data?.services_total ?? 0}
              running={data?.services_running ?? 0}
              stopped={data?.services_stopped ?? 0}
              crashed={data?.services_crashed ?? 0}
              created={data?.services_created ?? 0}
            />
          </CardContent>
        </Card>
        <Card className="overflow-hidden lg:col-span-4">
          <div className="flex items-center gap-2 border-b border-border1 px-5 py-3.5 text-sm font-medium text-text1">
            <BarChart3 className="h-4 w-4 text-primary" />
            操作类型分布
            <span className="text-xs font-normal text-text3">近 10 条</span>
          </div>
          <CardContent className="p-5">
            <OpsTypeBars operations={data?.recent_operations} />
          </CardContent>
        </Card>
        <Card className="overflow-hidden lg:col-span-4">
          <div className="flex items-center gap-2 border-b border-border1 px-5 py-3.5 text-sm font-medium text-text1">资源用量</div>
          <CardContent className="space-y-4 p-5">
            <ResourceBars cpu={host?.cpu_used_pct} mem={host?.mem_used_pct} disk={diskPct} />
            <div className="rounded-md bg-bg4 px-3 py-2 text-xs text-text3">磁盘分盘使用率</div>
            <DiskTable disks={host?.disks} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <div className="lg:col-span-4">
          <Card className="overflow-hidden">
            <div className="border-b border-border1 px-5 py-3.5">
              <div className="flex items-center gap-1.5 text-sm font-medium text-text1">
                最近操作
                <InfoHint label="服务启停、升级、卸载记录" />
              </div>
            </div>
            <CardContent className="p-0">
              {data?.recent_operations?.length ? (
                <div className="divide-y divide-border1">
                  {data.recent_operations.map((op, idx) => {
                    const meta = OP_STATUS_META[op.status] || { label: op.status || "未知", tone: "secondary" };
                    return (
                      <div key={idx} className="flex items-center justify-between px-5 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <StatusBadge tone={meta.tone} label={meta.label} />
                          <span className="text-text2">{op.type}</span>
                          {op.service_name ? <span className="font-mono text-xs text-text3">{op.service_name}</span> : null}
                        </div>
                        <span className="text-xs text-text3">{op.created_at || op.finished_at || ""}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-sm text-text3">暂无操作记录</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <Card className="overflow-hidden">
            <div className="border-b border-border1 px-5 py-3.5">
              <div className="text-sm font-medium text-text1">系统健康</div>
            </div>
            <CardContent className="p-5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <div className="mb-1 text-xs text-text3">主机名</div>
                  <div className="flex items-center gap-1 text-sm text-text1">
                    <span className="truncate">{host?.hostname || "—"}</span>
                    <button onClick={handleCopyHost} className="shrink-0 text-xs text-primary hover:text-primary-7 transition-colors" aria-label="复制主机名">
                      {copied ? "已复制" : "复制"}
                    </button>
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-text3">运行时长</div>
                  <div className="text-sm text-text1">
                    {host?.uptime_sec ? `${Math.floor(host.uptime_sec / 86400)}天 ${Math.floor((host.uptime_sec % 86400) / 3600)}小时` : "—"}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-text3">版本</div>
                  <div className="text-sm text-text1">{host?.go_version || "—"}</div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-text3">运行模式</div>
                  <div className="text-sm">
                    <span className="inline-flex items-center rounded-sm bg-primary-2 px-2 py-0.5 text-xs font-medium text-primary">单机独立节点</span>
                  </div>
                </div>
              </div>
              <div className="mt-5 space-y-4">
                <UsageBar label="CPU 使用率" pct={host?.cpu_used_pct} />
                <UsageBar label="内存使用率" pct={host?.mem_used_pct} />
                <UsageBar label="磁盘使用率" pct={diskPct} />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border1 px-5 py-3.5">
              <div className="text-sm font-medium text-text1">快捷操作</div>
            </div>
            <CardContent className="p-5">
              <div className="flex flex-wrap gap-3">
                <Button size="sm" asChild>
                  <Link to="/services">
                    <Plus className="h-3.5 w-3.5" />
                    新建服务
                  </Link>
                </Button>
                <Button size="sm" variant="secondary" asChild>
                  <Link to="/runtimes">
                    <Boxes className="h-3.5 w-3.5" />
                    环境管理
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {data?.abnormal_services?.length ? (
            <Card className="overflow-hidden">
              <div className="border-b border-border1 px-5 py-3.5">
                <div className="flex items-center gap-1.5 text-sm font-medium text-danger">异常告警</div>
              </div>
              <CardContent className="p-5">
                <div className="space-y-2">
                  {data.abnormal_services.map((svc, idx) => (
                    <div key={idx} className="text-sm text-text2">
                      {svc.name} · {svc.status}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </PageTemplate>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Boxes,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  PauseCircle,
  History,
  ExternalLink,
  Server,
  MemoryStick,
  HardDrive,
  Activity,
  Copy,
  Check,
  Plus,
  TerminalSquare,
  Globe,
  Radio,
  Clock,
  Zap,
} from "lucide-react";
import { dashboardApi, systemApi } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServiceStatusBadge } from "@/components/services/ServiceStatusBadge";
import { formatTime, formatBytes, formatUptime } from "@/lib/utils";
import {
  InlineAlert,
  PageTemplate,
  StatCard,
  UsageBar,
  IconTooltip,
} from "@/components/ued";

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
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: dashboardApi.stats,
    refetchInterval: 5000,
  });

  // 本机服务器信息: 每 5 秒拉取(后端 3s 缓存)
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
      sub: data
        ? `待启动 ${data.services_created ?? 0} · 已停止 ${data.services_stopped ?? 0}`
        : "加载中...",
      icon: Boxes,
      to: "/services",
      enabled: true,
    },
    {
      label: "运行中服务",
      value: data?.services_running ?? "—",
      sub: "状态为 running · 正常运行",
      icon: CheckCircle2,
      to: "/services",
      enabled: true,
      accent: "text-success",
    },
    {
      label: "异常服务",
      value: data?.services_crashed ?? "—",
      sub: (data?.services_crashed ?? 0) > 0 ? "需尽快排查恢复" : "全量服务状态健康",
      icon: AlertTriangle,
      to: "/services",
      enabled: true,
      accent: (data?.services_crashed ?? 0) > 0 ? "text-destructive" : "text-muted-foreground",
    },
    {
      label: "运行环境",
      value: data?.runtimes_total ?? "—",
      sub: data ? `默认 ${data.runtimes_default ?? 0} 个环境` : "加载中...",
      icon: Cpu,
      to: "/runtimes",
      enabled: true,
    },
  ];

  const abnormal = data?.abnormal_services || [];
  const recent = data?.recent_operations || [];

  return (
    <PageTemplate
      className="space-y-6 sm:space-y-8"
      contentClassName="space-y-6 sm:space-y-8 pb-10"
      title="仪表盘概览"
      description="实时监控本地主机资源、服务进程运行状态与最新运维历史"
      showRefresh
      onRefresh={handleRefreshAll}
      isRefreshing={isFetching}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
            <Link to="/terminal">
              <TerminalSquare className="mr-1.5 h-3.5 w-3.5 text-primary" /> Web 终端
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/services">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> 服务管理
            </Link>
          </Button>
        </div>
      }
      error={isError ? "仪表盘数据加载失败，请确认后端服务已启动。" : null}
    >
      {/* 4 项核心统计指标看板 */}
      <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            sub={s.sub}
            icon={s.icon}
            to={s.to}
            accent={s.accent}
            loading={isLoading}
          />
        ))}
      </div>

      {/* 本机硬件资源与状态监控卡片 */}
      <Card className="overflow-hidden border-border/80 shadow-xs">
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/40 bg-muted/20 px-6 py-4.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base font-semibold tracking-tight">
                  当前服务器节点
                </CardTitle>
                {host?.hostname ? (
                  <button
                    type="button"
                    onClick={handleCopyHost}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/80 px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title="点击复制主机名"
                  >
                    <span>{host.hostname}</span>
                    {copied ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                ) : null}
              </div>
              <CardDescription className="text-xs mt-0.5">
                {host
                  ? `${host.platform || host.os || ""} ${host.platform_version || ""} · 架构 ${host.go_os}/${host.kernel_arch || host.go_arch}`
                  : "加载主机硬件信息…"}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5 bg-background text-[11px] font-normal shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <span>实时采样 (5s)</span>
            </Badge>
            {host?.collected_at && (
              <span className="hidden font-mono text-[11px] text-muted-foreground md:inline">
                {formatTime(host.collected_at)}
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6 sm:p-7 space-y-6">
          <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. CPU 负载 */}
            <div className="group rounded-xl border border-border/60 bg-card/60 p-4 transition-all duration-200 hover:border-primary/40 hover:bg-card hover:shadow-xs">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Cpu className="h-4 w-4 text-sky-500" /> CPU 负载
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {host?.num_cpu ? `${host.num_cpu} 逻辑核心` : ""}
                </span>
              </div>
              <div className="text-2xl font-bold tracking-tight tabular-nums">
                {host ? `${(host.cpu_used_pct ?? 0).toFixed(1)}%` : "—"}
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground" title={host?.cpu_model}>
                {host?.cpu_model || "处理器负载正常"}
              </p>
              {host && (
                <div className="mt-3">
                  <UsageBar pct={host.cpu_used_pct} label="CPU 占用" showValue={false} />
                </div>
              )}
            </div>

            {/* 2. 内存使用 */}
            <div className="group rounded-xl border border-border/60 bg-card/60 p-4 transition-all duration-200 hover:border-primary/40 hover:bg-card hover:shadow-xs">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <MemoryStick className="h-4 w-4 text-indigo-500" /> 内存使用
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {host ? `${(host.mem_used_pct ?? 0).toFixed(1)}%` : ""}
                </span>
              </div>
              <div className="text-2xl font-bold tracking-tight tabular-nums">
                {host ? formatBytes(host.mem_used) : "—"}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {host ? `总量 ${formatBytes(host.mem_total)}` : "—"}
              </p>
              {host && (
                <div className="mt-3">
                  <UsageBar pct={host.mem_used_pct} label="内存占比" showValue={false} />
                </div>
              )}
            </div>

            {/* 3. 主存储空间 */}
            <div className="group rounded-xl border border-border/60 bg-card/60 p-4 transition-all duration-200 hover:border-primary/40 hover:bg-card hover:shadow-xs">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <HardDrive className="h-4 w-4 text-amber-500" /> 主磁盘空间
                </span>
                {host?.disks?.[0] && (
                  <span
                    className="max-w-[100px] truncate font-mono text-xs text-muted-foreground"
                    title={host.disks[0].path}
                  >
                    {host.disks[0].path}
                  </span>
                )}
              </div>
              <div className="text-2xl font-bold tracking-tight tabular-nums">
                {host?.disks?.length ? `${(host.disks[0].used_pct ?? 0).toFixed(1)}%` : "—"}
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {host?.disks?.length
                  ? `${formatBytes(host.disks[0].used)} / ${formatBytes(host.disks[0].total)}`
                  : "暂无磁盘信息"}
              </p>
              {host?.disks?.length ? (
                <div className="mt-3">
                  <UsageBar pct={host.disks[0].used_pct} label="空间占用" showValue={false} />
                </div>
              ) : null}
            </div>

            {/* 4. 运行概况 */}
            <div className="group rounded-xl border border-border/60 bg-card/60 p-4 transition-all duration-200 hover:border-primary/40 hover:bg-card hover:shadow-xs">
              <div className="mb-2.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Activity className="h-4 w-4 text-emerald-500" /> 系统运行状态
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">运行时长</span>
                  <span className="font-mono font-semibold text-foreground">
                    {host ? formatUptime(host.uptime_sec) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">当前进程数</span>
                  <span className="font-mono font-semibold text-foreground">
                    {host?.process_count ?? "—"}
                  </span>
                </div>
                {(host?.load1 > 0 || host?.load5 > 0) && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">平均负载 (1/5m)</span>
                    <span className="font-mono font-medium text-foreground">
                      {host.load1?.toFixed(2)} / {host.load5?.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 挂载的多磁盘列表展示 */}
          {host?.disks?.length > 1 && (
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                其他磁盘挂载点
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {host.disks.slice(1).map((d) => (
                  <div key={d.path} className="rounded-lg border border-border/50 bg-card/60 px-3.5 py-2.5">
                    <UsageBar
                      pct={d.used_pct}
                      label={`${d.path} (${formatBytes(d.used)}/${formatBytes(d.total)})`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 快捷导航入口横条 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Link
          to="/services"
          className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-4 transition-all duration-200 hover:border-primary/50 hover:bg-card hover-lift"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-110">
            <Boxes className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">服务进程治理</div>
            <div className="text-[11px] text-muted-foreground truncate">启停、配置与日志</div>
          </div>
        </Link>

        <Link
          to="/sites"
          className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-4 transition-all duration-200 hover:border-primary/50 hover:bg-card hover-lift"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 transition-transform group-hover:scale-110">
            <Globe className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">网关站点管理</div>
            <div className="text-[11px] text-muted-foreground truncate">静态 APP 与反代</div>
          </div>
        </Link>

        <Link
          to="/tunnels"
          className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-4 transition-all duration-200 hover:border-primary/50 hover:bg-card hover-lift"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500 transition-transform group-hover:scale-110">
            <Radio className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">反向流量隧道</div>
            <div className="text-[11px] text-muted-foreground truncate">TCP 穿透与远程转发</div>
          </div>
        </Link>

        <Link
          to="/terminal"
          className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-4 transition-all duration-200 hover:border-primary/50 hover:bg-card hover-lift"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 transition-transform group-hover:scale-110">
            <TerminalSquare className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Web 控制台</div>
            <div className="text-[11px] text-muted-foreground truncate">系统级交互终端</div>
          </div>
        </Link>
      </div>

      {/* 异常服务监控 & 实时运维操作记录 双分栏 */}
      <div className="grid gap-6 lg:gap-8 lg:grid-cols-2">
        {/* 左栏：异常服务排查 */}
        <Card className="overflow-hidden border-border/80">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/40 pb-3 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">异常服务排查</CardTitle>
                <CardDescription className="text-xs">
                  状态为 crashed 需关注并恢复的服务
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild className="h-8 text-xs text-primary hover:text-primary">
              <Link to="/services">
                全部服务 <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-4">
            {isLoading ? (
              <p className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                加载异常服务列表中…
              </p>
            ) : abnormal.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="mb-2.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 text-success shadow-xs">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-foreground">全量服务运行健康</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  当前无 crashed 或异常退出的服务进程
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {abnormal.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/5 p-3 transition-colors hover:bg-destructive/10"
                  >
                    <div className="min-w-0 pr-3">
                      <Link
                        to={`/services/${s.id}`}
                        className="block truncate text-sm font-semibold text-foreground hover:text-primary hover:underline"
                      >
                        {s.name}
                      </Link>
                      <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                        {s.code}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ServiceStatusBadge status={s.status} />
                      <IconTooltip label="查看详情">
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/20" asChild>
                          <Link to={`/services/${s.id}`}>
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          </Link>
                        </Button>
                      </IconTooltip>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 右栏：最近运维操作记录 */}
        <Card className="overflow-hidden border-border/80">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/40 pb-3 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <History className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">最近运维记录</CardTitle>
                <CardDescription className="text-xs">
                  最新 10 条服务动作与执行历史
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild className="h-8 text-xs text-primary hover:text-primary">
              <Link to="/operations">
                全部记录 <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-4">
            {isLoading ? (
              <p className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                加载操作历史记录…
              </p>
            ) : recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="mb-2.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <PauseCircle className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-foreground">暂无操作记录</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  执行服务部署、启停或升级后会在此展示
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {recent.map((op) => (
                  <li
                    key={op.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/60 p-3 text-sm transition-colors hover:bg-accent/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold uppercase">
                          {OP_TYPE_LABEL[op.type] || op.type}
                        </span>
                        <Badge
                          variant={OP_STATUS_VARIANT[op.status] || "secondary"}
                          className="py-0 text-[11px]"
                        >
                          {op.status}
                        </Badge>
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {op.service_name || `服务 #${op.service_id}`}
                        </span>
                        {op.error_msg
                          ? ` · 错误: ${op.error_msg}`
                          : op.output_log
                          ? ` · ${op.output_log}`
                          : ""}
                      </div>
                    </div>
                    <div className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {formatTime(op.started_at || op.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageTemplate>
  );
}

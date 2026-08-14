import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Link2,
  Link2Off,
  Save,
  Server,
  Network,
  Shield,
  Palette,
  Check,
  Copy,
  Eye,
  EyeOff,
  Cpu,
  HardDrive,
  MemoryStick,
  Activity,
  Clock,
  Database,
  Lock,
  Sun,
  Moon,
  Monitor,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Radio,
  RadioTower,
  Boxes,
} from "lucide-react";
import { healthApi, authApi, systemApi, clusterApi, api } from "@/lib/api";
import { authHeaders } from "@/lib/auth";
import { useTheme } from "@/hooks/useTheme";
import { cn, formatBytes, formatUptime, formatTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormField, InlineAlert, PageTemplate, RefreshButton, UsageBar, IconTooltip } from "@/components/ued";

const MODE_META = {
  standalone: {
    label: "单机独立节点",
    desc: "独立运行与管理本地服务，无需连接中心",
    icon: Boxes,
    tone: "secondary",
  },
  agent: {
    label: "Agent 边缘节点",
    desc: "主动向中心注册心跳，支持反向 TCP 流量隧道与远程调度",
    icon: Radio,
    tone: "success",
  },
  controller: {
    label: "Controller 调度中心",
    desc: "作为多节点集群管控面，接收 Agent 上报并提供统一控制台",
    icon: RadioTower,
    tone: "default",
  },
};

const SETTINGS_SECTIONS = [
  {
    id: "system",
    label: "系统信息",
    description: "版本、主机硬件与运行指标",
    icon: Server,
  },
  {
    id: "cluster",
    label: "节点与集群",
    description: "运行角色、中心连接与心跳配置",
    icon: Network,
  },
  {
    id: "security",
    label: "安全与鉴权",
    description: "登录密码保护与安全环境变量",
    icon: Shield,
  },
  {
    id: "appearance",
    label: "外观与偏好",
    description: "深浅主题与控制台界面偏好",
    icon: Palette,
  },
];

const SETTINGS_SECTION_IDS = new Set(SETTINGS_SECTIONS.map((s) => s.id));

export function Settings() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const activeSection = SETTINGS_SECTION_IDS.has(requestedSection)
    ? requestedSection
    : "system";

  const { theme, resolved, setTheme } = useTheme();

  const [form, setForm] = useState({
    mode: "standalone",
    controller_url: "",
    agent_token: "",
    agent_id: "",
    advertise_url: "",
    heartbeat_sec: 15,
  });
  const [tokenDirty, setTokenDirty] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("已复制到剪贴板");
    setTimeout(() => setCopiedKey(""), 2000);
  };

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: healthApi.check,
    staleTime: 10000,
  });

  const { data: host, isFetching: hostFetching, refetch: refetchHost } = useQuery({
    queryKey: ["system-host"],
    queryFn: systemApi.host,
    refetchInterval: 10000,
    staleTime: 2000,
  });

  const { data: authStatus } = useQuery({
    queryKey: ["auth-status"],
    queryFn: authApi.status,
    staleTime: 10000,
  });

  const {
    data: cluster,
    isFetching: clusterFetching,
    refetch: refetchCluster,
  } = useQuery({
    queryKey: ["cluster-status"],
    queryFn: clusterApi.status,
    refetchInterval: 5000,
  });

  const { data: agentStatus } = useQuery({
    queryKey: ["agent-status"],
    queryFn: () => api.get("/api/agent/status"),
    staleTime: 5000,
    refetchInterval: 15000,
  });

  // 用服务端状态填充表单(不覆盖正在编辑的 token)
  useEffect(() => {
    if (!cluster) return;
    setForm((f) => ({
      mode: cluster.mode || "standalone",
      controller_url: cluster.controller_url || "",
      agent_token: tokenDirty ? f.agent_token : "",
      agent_id: cluster.agent_id || "",
      advertise_url: cluster.advertise_url || "",
      heartbeat_sec: cluster.heartbeat_sec || 15,
    }));
  }, [cluster, tokenDirty]);

  const saveMut = useMutation({
    mutationFn: (body) => clusterApi.update(body),
    onSuccess: (data, vars) => {
      setTokenDirty(false);
      setForm((f) => ({ ...f, agent_token: "" }));
      qc.invalidateQueries({ queryKey: ["cluster-status"] });
      qc.invalidateQueries({ queryKey: ["health"] });
      qc.invalidateQueries({ queryKey: ["agent-status"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      if (data?.connect_ok === false || data?.connect_error) {
        toast.error(data.connect_error || "配置已保存，但连接中心失败");
      } else if (vars?.connect && vars?.mode === "agent") {
        toast.success("配置已保存，并已成功连接中心");
      } else {
        toast.success("集群与节点配置已保存并应用");
      }
    },
    onError: (e) => toast.error(e.message || "保存配置失败"),
  });

  const connectMut = useMutation({
    mutationFn: async () => {
      const resp = await fetch("/api/cluster/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });
      const j = await resp.json();
      if (j?.code !== 0 && j?.code != null) {
        throw new Error(j.message || "连接失败");
      }
      return j;
    },
    onSuccess: (j) => {
      qc.invalidateQueries({ queryKey: ["cluster-status"] });
      qc.invalidateQueries({ queryKey: ["agent-status"] });
      if (j?.data?.connect_ok === false || (j?.message && j.message !== "ok" && j?.data?.connect_ok !== true)) {
        const msg = j?.data?.connect_error || j?.message || "连接失败";
        if (j?.data?.connect_ok === false || /失败|无法|拒绝|超时|refused/i.test(msg)) {
          toast.error(msg);
          return;
        }
      }
      if (j?.data?.connect_ok === true || j?.message === "ok") {
        toast.success("已连接中心（心跳 + 隧道建立成功）");
      } else {
        toast.message(j?.message || "已发送连接请求");
      }
    },
    onError: (e) => toast.error(e.message || "连接失败"),
  });

  const disconnectMut = useMutation({
    mutationFn: () => clusterApi.disconnect(),
    onSuccess: () => {
      toast.message("已断开与中心的心跳及隧道连接");
      qc.invalidateQueries({ queryKey: ["cluster-status"] });
      qc.invalidateQueries({ queryKey: ["agent-status"] });
    },
    onError: (e) => toast.error(e.message || "断开失败"),
  });

  const onSave = (connectAfter = true) => {
    const body = {
      mode: form.mode,
      controller_url: form.controller_url.trim(),
      agent_id: form.agent_id.trim(),
      advertise_url: form.advertise_url.trim(),
      heartbeat_sec: Number(form.heartbeat_sec) || 15,
      connect: connectAfter,
    };
    if (tokenDirty) {
      body.agent_token = form.agent_token;
    }
    saveMut.mutate(body);
  };

  const hb = agentStatus?.heartbeat || {};
  const mode = cluster?.mode || health?.mode || "standalone";
  const sessions = cluster?.tunnel_sessions || [];
  const hbFailed = hb.enabled && hb.last_ok === false;
  const hbMsg = hb.last_msg || "";

  return (
    <PageTemplate className="space-y-6">
      <div className="grid items-start gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        {/* 左侧分类导航 */}
        <nav
          aria-label="设置分类"
          className="flex gap-2 overflow-x-auto border-b border-border/40 pb-3 xl:sticky xl:top-0 xl:block xl:space-y-1.5 xl:overflow-visible xl:border-b-0 xl:border-r xl:pb-0 xl:pr-6"
        >
          <div className="mb-3 hidden px-3 xl:block">
            <div className="text-sm font-semibold tracking-tight">系统设置</div>
            <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
              按配置域查看与维护当前节点
            </div>
          </div>
          {SETTINGS_SECTIONS.map((section) => {
            const active = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() =>
                  setSearchParams({ section: section.id }, { replace: true })
                }
                className={cn(
                  "group flex min-w-fit items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150 active:scale-[0.98] xl:w-full",
                  active
                    ? "bg-primary/10 text-primary shadow-[inset_3px_0_0_hsl(var(--primary))] font-semibold"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
                    active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  <section.icon className="h-4 w-4 shrink-0" />
                </div>
                <div className="min-w-0">
                  <span className="block text-sm">{section.label}</span>
                  <span className="hidden truncate text-[11px] text-muted-foreground/80 xl:block">
                    {section.description}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* 右侧设置主内容 */}
        <div className="min-w-0 space-y-6 animate-fade-in">
          {/* =========================================================================
              1. 系统信息 SECTION
             ========================================================================= */}
          {activeSection === "system" && (
            <div className="space-y-6">
              {/* 系统顶栏概览 */}
              <Card className="overflow-hidden border-border/80">
                <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/40 bg-muted/20 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
                      <Server className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-semibold">Aluka Ops 系统概况</CardTitle>
                        <Badge variant="outline" className="font-mono text-xs">
                          v{health?.version || "0.2.0"}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs">
                        当前后端服务运行状态与硬件资源指标
                      </CardDescription>
                    </div>
                  </div>
                  <RefreshButton onClick={() => refetchHost()} loading={hostFetching} />
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                  {/* 核心基础字段卡片组 */}
                  <div>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      服务属性
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <InfoCard
                        label="应用名称"
                        value={health?.app || "Aluka Ops"}
                        icon={Boxes}
                      />
                      <InfoCard
                        label="当前版本"
                        value={health?.version ? `v${health.version}` : "—"}
                        icon={Activity}
                        copyable
                        onCopy={() => copyToClipboard(health?.version, "version")}
                        copied={copiedKey === "version"}
                      />
                      <InfoCard
                        label="运行模式"
                        value={MODE_META[mode]?.label || mode}
                        icon={Network}
                        badgeTone={MODE_META[mode]?.tone}
                      />
                      <InfoCard
                        label="数据库引擎"
                        value={health?.db || "SQLite 3"}
                        icon={Database}
                      />
                      <InfoCard
                        label="HTTP 服务端口"
                        value={cluster?.http_port ? `:${cluster.http_port}` : "18080"}
                        icon={Server}
                        mono
                      />
                      <InfoCard
                        label="服务器时间"
                        value={health?.timestamp ? formatTime(health.timestamp) : "—"}
                        icon={Clock}
                        mono
                      />
                    </div>
                  </div>

                  {/* 主机硬件与运行负载 */}
                  <div>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      主机与硬件资源
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {/* CPU */}
                      <div className="rounded-xl border border-border/60 bg-card/40 p-4 transition-all hover:border-primary/40 hover:shadow-xs">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Cpu className="h-4 w-4 text-sky-500" /> CPU
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {host?.num_cpu ? `${host.num_cpu} 核` : ""}
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
                            <UsageBar pct={host.cpu_used_pct} label="使用率" showValue={false} />
                          </div>
                        )}
                      </div>

                      {/* 内存 */}
                      <div className="rounded-xl border border-border/60 bg-card/40 p-4 transition-all hover:border-primary/40 hover:shadow-xs">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <MemoryStick className="h-4 w-4 text-indigo-500" /> 内存
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground">
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

                      {/* 磁盘 */}
                      <div className="rounded-xl border border-border/60 bg-card/40 p-4 transition-all hover:border-primary/40 hover:shadow-xs">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <HardDrive className="h-4 w-4 text-amber-500" /> 存储
                          </span>
                          {host?.disks?.[0] && (
                            <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[80px]">
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
                            : "—"}
                        </p>
                        {host?.disks?.length ? (
                          <div className="mt-3">
                            <UsageBar pct={host.disks[0].used_pct} label="主分区" showValue={false} />
                          </div>
                        ) : null}
                      </div>

                      {/* 运行与平台 */}
                      <div className="rounded-xl border border-border/60 bg-card/40 p-4 transition-all hover:border-primary/40 hover:shadow-xs">
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Activity className="h-4 w-4 text-emerald-500" /> 系统与运行时长
                        </div>
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">运行时长</span>
                            <span className="font-mono font-medium">{host ? formatUptime(host.uptime_sec) : "—"}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">主机名</span>
                            <span className="font-mono font-medium truncate max-w-[110px]" title={host?.hostname}>
                              {host?.hostname || "—"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">OS / 架构</span>
                            <span className="font-mono font-medium">{host ? `${host.go_os}/${host.go_arch}` : "—"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* =========================================================================
              2. 节点与集群 SECTION
             ========================================================================= */}
          {activeSection === "cluster" && (
            <div className="space-y-6">
              <Card className="overflow-hidden border-border/80">
                <CardHeader className="flex-row items-start justify-between space-y-0 border-b border-border/40 bg-muted/20 pb-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                      <Network className="h-5 w-5 text-primary" /> 节点角色与中心连接
                    </CardTitle>
                    <CardDescription className="text-xs">
                      配置本机作为独立节点、边缘 Agent 或调度中心 Controller。配置持久化写入数据库，重启后优先加载。
                    </CardDescription>
                  </div>
                  <RefreshButton onClick={() => refetchCluster()} loading={clusterFetching} />
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                  {/* 模式卡片式单选 */}
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-3">
                      选择运行角色（Mode）
                    </label>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {Object.entries(MODE_META).map(([mKey, meta]) => {
                        const isSelected = form.mode === mKey;
                        const Icon = meta.icon;
                        return (
                          <div
                            key={mKey}
                            onClick={() => setForm((f) => ({ ...f, mode: mKey }))}
                            role="button"
                            tabIndex={0}
                            className={cn(
                              "relative flex flex-col justify-between rounded-xl border p-4 cursor-pointer transition-all duration-200 text-left active:scale-[0.98]",
                              isSelected
                                ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/20"
                                : "border-border/70 hover:border-primary/40 hover:bg-accent/40"
                            )}
                          >
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div
                                  className={cn(
                                    "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  <Icon className="h-4 w-4" />
                                </div>
                                {isSelected ? (
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]">
                                    <Check className="h-3 w-3 stroke-[3]" />
                                  </span>
                                ) : null}
                              </div>
                              <div className="font-semibold text-sm">{meta.label}</div>
                              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                                {meta.desc}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 表单参数字段 */}
                  <div className="rounded-xl border border-border/60 bg-muted/10 p-5 space-y-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      参数配置
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        label="Agent 节点唯一标识（Agent ID）"
                        hint="集群中用于唯一定位当前节点的标识，默认使用主机名。"
                        className="sm:col-span-2"
                      >
                        <Input
                          className="font-mono"
                          value={form.agent_id}
                          onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
                          placeholder="例如: agent-node-01 (留空则默认使用主机名)"
                        />
                      </FormField>

                      {form.mode === "agent" && (
                        <>
                          <FormField
                            label="中心 Controller 根地址"
                            hint="调度中心控制台的 HTTP 根地址，如 http://192.168.1.100:18080。"
                            className="sm:col-span-2"
                          >
                            <Input
                              className="font-mono"
                              value={form.controller_url}
                              onChange={(e) =>
                                setForm((f) => ({ ...f, controller_url: e.target.value }))
                              }
                              placeholder="http://192.168.1.10:18080"
                            />
                          </FormField>

                          <FormField
                            label={
                              <div className="flex items-center justify-between w-full">
                                <span>Agent 共享密钥（Token）</span>
                                {cluster?.agent_token_set && !tokenDirty ? (
                                  <span className="text-xs font-normal text-success">
                                    ● 密钥已在后端配置（留空保存则保持原密钥）
                                  </span>
                                ) : null}
                              </div>
                            }
                            hint="与中心 Controller 约定的通信密钥，用于身份鉴权与安全握手。"
                            className="sm:col-span-2"
                          >
                            <div className="relative">
                              <Input
                                type={showToken ? "text" : "password"}
                                className="font-mono pr-10"
                                value={form.agent_token}
                                onChange={(e) => {
                                  setTokenDirty(true);
                                  setForm((f) => ({ ...f, agent_token: e.target.value }));
                                }}
                                placeholder={cluster?.agent_token_set ? "••••••••" : "请输入共享密钥"}
                                autoComplete="new-password"
                              />
                              <button
                                type="button"
                                onClick={() => setShowToken(!showToken)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormField>
                        </>
                      )}

                      <FormField
                        label="本机 Advertise URL（可选广播地址）"
                        hint="供中心直接回连本机的 API 地址，在存在隧道反代时不强制填写。"
                        className="sm:col-span-2"
                      >
                        <Input
                          className="font-mono"
                          value={form.advertise_url}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, advertise_url: e.target.value }))
                          }
                          placeholder="http://本机可达IP:端口"
                        />
                      </FormField>

                      <FormField label="心跳上报间隔（秒）" hint="Agent 向中心上报健康状态的时间间隔。">
                        <Input
                          type="number"
                          min={5}
                          value={form.heartbeat_sec}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, heartbeat_sec: Number(e.target.value) }))
                          }
                        />
                      </FormField>
                    </div>

                    {/* 操作按钮组 */}
                    <div className="pt-2 flex flex-wrap items-center gap-3">
                      <Button onClick={() => onSave(true)} disabled={saveMut.isPending}>
                        {saveMut.isPending ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-1.5 h-4 w-4" />
                        )}
                        保存并应用配置
                      </Button>

                      {form.mode === "agent" && (
                        <>
                          <Button
                            variant="secondary"
                            disabled={connectMut.isPending}
                            onClick={() => {
                              if (
                                form.mode !== cluster?.mode ||
                                form.controller_url.trim() !== (cluster?.controller_url || "") ||
                                form.agent_id.trim() !== (cluster?.agent_id || "") ||
                                tokenDirty
                              ) {
                                onSave(true);
                              } else {
                                connectMut.mutate();
                              }
                            }}
                          >
                            {connectMut.isPending ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                              <Link2 className="mr-1.5 h-4 w-4" />
                            )}
                            连接中心
                          </Button>

                          <Button
                            variant="outline"
                            disabled={disconnectMut.isPending}
                            onClick={() => disconnectMut.mutate()}
                          >
                            {disconnectMut.isPending ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                              <Link2Off className="mr-1.5 h-4 w-4" />
                            )}
                            断开连接
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 实时连接状态卡片 */}
                  <div className="rounded-xl border border-border/70 bg-card/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        当前连接健康状态
                      </span>
                      <div className="flex items-center gap-2">
                        {cluster?.heartbeat_running ? (
                          <Badge variant="success" className="gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                            心跳正常
                          </Badge>
                        ) : mode === "agent" ? (
                          <Badge variant="secondary">心跳未运行</Badge>
                        ) : null}
                        {cluster?.tunnel_client_running ? (
                          <Badge variant="success">隧道客户端运行中</Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 text-xs">
                      <div className="rounded-lg bg-muted/40 p-3">
                        <div className="text-muted-foreground">心跳状态</div>
                        <div className="mt-1 font-semibold text-sm">
                          {hb.enabled
                            ? hb.last_ok
                              ? `在线 (HTTP ${hb.last_http || 200})`
                              : "异常 / 失败"
                            : mode === "agent"
                              ? "未连接"
                              : "无需连接"}
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <div className="text-muted-foreground">最近心跳时间</div>
                        <div className="mt-1 font-mono text-sm">{hb.last_at || "—"}</div>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <div className="text-muted-foreground">中心 Controller</div>
                        <div className="mt-1 font-mono text-sm truncate" title={cluster?.controller_url}>
                          {cluster?.controller_url || "未配置"}
                        </div>
                      </div>
                    </div>

                    {hbFailed && hbMsg && (
                      <InlineAlert variant="error" className="mt-3">
                        <div className="font-semibold text-xs">连接中心发生异常</div>
                        <div className="mt-1 text-xs break-all font-mono opacity-90">{hbMsg}</div>
                        <div className="mt-2 text-[11px] opacity-80 space-y-1">
                          <div>排查建议：</div>
                          <div>1. 确认中心机器已启动且监听端口正确（默认 18080）。</div>
                          <div>2. 检查网络连通性及防火墙/安全组端口是否开放。</div>
                          <div>3. 确认 Agent Token 共享密钥与中心保持完全一致。</div>
                        </div>
                      </InlineAlert>
                    )}

                    {sessions.length > 0 && (
                      <div className="pt-2 border-t border-border/40 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">当前托管隧道会话:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {sessions.map((s) => (
                            <Badge key={s.agent_id} variant="outline" className="font-mono text-[11px] bg-background">
                              {s.agent_id}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* =========================================================================
              3. 安全与鉴权 SECTION
             ========================================================================= */}
          {activeSection === "security" && (
            <div className="space-y-6">
              <Card className="overflow-hidden border-border/80">
                <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/40 bg-muted/20 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
                      <Shield className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">安全策略与访问鉴权</CardTitle>
                      <CardDescription className="text-xs">
                        通过环境变量与密钥配置系统的访问防护机制
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {authStatus?.auth_enabled ? (
                      <Badge variant="success" className="gap-1.5">
                        <Lock className="h-3 w-3" /> 已启用密码保护
                      </Badge>
                    ) : (
                      <Badge variant="warning" className="gap-1.5">
                        <AlertTriangle className="h-3 w-3" /> 未开启鉴权（纯内网模式）
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                  {/* 状态看板 */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="text-xs text-muted-foreground">鉴权状态</div>
                      <div className="mt-1 font-semibold text-base">
                        {authStatus?.auth_enabled ? "已开启安全登录" : "未开启（免密访问）"}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {authStatus?.auth_enabled ? "所有敏感写操作需要 Token 认证" : "适合受控内网直接使用"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="text-xs text-muted-foreground">当前会话身份</div>
                      <div className="mt-1 font-semibold text-base">
                        {authStatus?.authenticated ? "已认证管理员" : "未鉴权 / 匿名"}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        基于 Bearer JWT Token 校验
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="text-xs text-muted-foreground">Token 有效期</div>
                      <div className="mt-1 font-semibold text-base font-mono">24 小时</div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        可通过 ALUKA_TOKEN_TTL_HOURS 调整
                      </p>
                    </div>
                  </div>

                  {/* 环境变量配置参考 */}
                  <div>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      环境变量配置参考（生产推荐）
                    </h3>
                    <div className="space-y-2.5">
                      <EnvSnippet
                        label="启用管理登录密码"
                        cmd="ALUKA_PASSWORD=your-super-strong-password"
                        desc="生产环境必须设置该环境变量或通过命令行参数 -password 启动"
                        onCopy={() => copyToClipboard("ALUKA_PASSWORD=your-super-strong-password", "env_pwd")}
                        copied={copiedKey === "env_pwd"}
                      />
                      <EnvSnippet
                        label="自定义 Token 有效时长"
                        cmd="ALUKA_TOKEN_TTL_HOURS=72"
                        desc="默认 24 小时，可按需延长或缩短"
                        onCopy={() => copyToClipboard("ALUKA_TOKEN_TTL_HOURS=72", "env_ttl")}
                        copied={copiedKey === "env_ttl"}
                      />
                      <EnvSnippet
                        label="允许免密测试模式（仅限本地开发）"
                        cmd="ALUKA_ALLOW_NO_AUTH=true"
                        desc="显式关闭管理密码校验"
                        onCopy={() => copyToClipboard("ALUKA_ALLOW_NO_AUTH=true", "env_noauth")}
                        copied={copiedKey === "env_noauth"}
                      />
                    </div>
                  </div>

                  {/* 安全建议 */}
                  <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                    <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> 生产安全最佳实践
                    </h4>
                    <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground leading-relaxed">
                      <li>公网暴露时务必配置高强度管理密码（推荐 12 位以上字母+数字+特殊符号组合）。</li>
                      <li>在多节点集群通信中，为 Agent 配置专属 <code>agent_token</code>，避免未授权节点接入。</li>
                      <li>可通过前置 Nginx 或 Traefik 配置 HTTPS 证书并设置 IP 白名单进一步增强防护。</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* =========================================================================
              4. 外观与偏好 SECTION
             ========================================================================= */}
          {activeSection === "appearance" && (
            <div className="space-y-6">
              <Card className="overflow-hidden border-border/80">
                <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/40 bg-muted/20 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
                      <Palette className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">外观与界面偏好</CardTitle>
                      <CardDescription className="text-xs">
                        定制控制台主题色彩与显示风格，设置即时保存于本地浏览器
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                  <div>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      界面主题模式
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <ThemeCard
                        active={theme === "light"}
                        icon={Sun}
                        title="明亮模式 (Light)"
                        desc="清爽明朗，适合白天或高亮环境"
                        onClick={() => setTheme("light")}
                      />
                      <ThemeCard
                        active={theme === "dark"}
                        icon={Moon}
                        title="暗色模式 (Dark)"
                        desc="深邃沉浸，减少夜间眩光与视觉疲劳"
                        onClick={() => setTheme("dark")}
                      />
                      <ThemeCard
                        active={theme === "system"}
                        icon={Monitor}
                        title="跟随系统 (System)"
                        desc={`自动跟随操作系统外观（当前: ${resolved === "dark" ? "暗色" : "明亮"}）`}
                        onClick={() => setTheme("system")}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-foreground">关于主题与终端同步</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Aluka Ops 的所有组件、状态点、图表以及 Web 终端（xterm.js）均基于全局 CSS 语义 Token 实时解析。切换主题时无需刷新页面，控制台所有颜色及终端配色将毫秒级平滑热更新。
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </PageTemplate>
  );
}

/** 键值卡片 */
function InfoCard({ label, value, icon: Icon, mono = false, badgeTone, copyable = false, onCopy, copied = false }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card/60 p-3.5 transition-all hover:border-primary/30">
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground truncate">{label}</div>
          <div className={cn("font-medium text-sm text-foreground truncate", mono && "font-mono")}>
            {badgeTone ? (
              <Badge variant={badgeTone} className="mt-0.5 text-xs">
                {value}
              </Badge>
            ) : (
              value
            )}
          </div>
        </div>
      </div>
      {copyable ? (
        <IconTooltip label={copied ? "已复制" : "点击复制"}>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" onClick={onCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </IconTooltip>
      ) : null}
    </div>
  );
}

/** 环境变量代码卡 */
function EnvSnippet({ label, cmd, desc, onCopy, copied }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/30 p-3.5">
      <div className="min-w-0 space-y-0.5">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="font-mono text-xs text-primary">{cmd}</div>
        {desc && <div className="text-[11px] text-muted-foreground">{desc}</div>}
      </div>
      <Button variant="outline" size="sm" className="h-8 shrink-0 text-xs gap-1.5" onClick={onCopy}>
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-success" /> 已复制
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" /> 复制配置
          </>
        )}
      </Button>
    </div>
  );
}

/** 主题切换卡 */
function ThemeCard({ active, icon: Icon, title, desc, onClick }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      className={cn(
        "group relative flex flex-col justify-between rounded-xl border p-4 cursor-pointer transition-all duration-200 text-left active:scale-[0.98]",
        active
          ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/20"
          : "border-border/70 hover:border-primary/40 hover:bg-accent/40"
      )}
    >
      <div>
        <div className="flex items-center justify-between mb-3">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
              active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-foreground"
            )}
          >
            <Icon className="h-4.5 w-4.5" />
          </div>
          {active ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]">
              <Check className="h-3 w-3 stroke-[3]" />
            </span>
          ) : null}
        </div>
        <div className="font-semibold text-sm">{title}</div>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

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
  ShieldOff,
} from "lucide-react";
import { healthApi, authApi, systemApi, clusterApi, api, authGuardApi, panelSettingsApi } from "@/lib/api";
import { authHeaders } from "@/lib/auth";
import { useTheme } from "@/hooks/useTheme";
import { cn, formatBytes, formatUptime, formatTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { InlineAlert, PageTemplate, RefreshButton, TabBar, TabsContent, UsageBar } from "@/components/ued";

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
  { id: "system", label: "通用设置" },
  { id: "cluster", label: "节点与集群" },
  { id: "security", label: "安全设置" },
  { id: "appearance", label: "外观偏好" },
];

const SETTINGS_SECTION_IDS = new Set(SETTINGS_SECTIONS.map((s) => s.id));

/** 设置分区（源力设计：分区标题 + 上分隔线） */
function SettingsSection({ title, action, children }) {
  return (
    <section className="max-w-[760px] border-t border-border1 pt-6 first:border-t-0 first:pt-0">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-text1">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** 设置页专用表单行：FormField 的水平变体（120px 右对齐标签），与通用 FormField 垂直布局互补。 */
function SettingsFormRow({ label, hint, children }) {
  return (
    <div className="mb-5 flex items-start gap-3 last:mb-0">
      <div className="w-[120px] shrink-0 pt-0.5 text-right text-[13px] leading-[30px] text-text2">
        {label}
      </div>
      <div className="min-w-0 flex-1">
        {children}
        {hint ? (
          <p className="mt-1 text-xs leading-[1.5] text-text3">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

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

  // ---- 面板防护（IP 名单 + 登录防爆破） ----
  const [panelForm, setPanelForm] = useState({
    ip_whitelist: "",
    ip_blacklist: "",
    login_max_fails: 5,
    login_window_sec: 600,
    login_ban_sec: 900,
  });
  const { data: panelSettings } = useQuery({
    queryKey: ["panel-settings"],
    queryFn: panelSettingsApi.get,
    staleTime: 10000,
  });
  useEffect(() => {
    if (!panelSettings) return;
    setPanelForm({
      ip_whitelist: panelSettings.ip_whitelist || "",
      ip_blacklist: panelSettings.ip_blacklist || "",
      login_max_fails: panelSettings.login_max_fails || 5,
      login_window_sec: panelSettings.login_window_sec || 600,
      login_ban_sec: panelSettings.login_ban_sec || 900,
    });
  }, [panelSettings]);

  const savePanelMut = useMutation({
    mutationFn: () =>
      panelSettingsApi.update({
        ip_whitelist: panelForm.ip_whitelist,
        ip_blacklist: panelForm.ip_blacklist,
        login_max_fails: Number(panelForm.login_max_fails) || 5,
        login_window_sec: Number(panelForm.login_window_sec) || 600,
        login_ban_sec: Number(panelForm.login_ban_sec) || 900,
      }),
    onSuccess: () => {
      toast.success("面板防护配置已保存并生效");
      qc.invalidateQueries({ queryKey: ["panel-settings"] });
      qc.invalidateQueries({ queryKey: ["auth-guard"] });
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const { data: guardData, refetch: refetchGuard, isFetching: guardFetching } = useQuery({
    queryKey: ["auth-guard"],
    queryFn: authGuardApi.list,
    refetchInterval: 10000,
  });
  const bans = guardData?.bans || [];
  const failures = guardData?.failures || [];
  const unbanMut = useMutation({
    mutationFn: (ip) => authGuardApi.unban(ip),
    onSuccess: () => {
      toast.success("已解封");
      qc.invalidateQueries({ queryKey: ["auth-guard"] });
    },
    onError: (e) => toast.error(e.message),
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
    <PageTemplate title="设置" description="系统配置管理">
      <TabBar
        value={activeSection}
        onValueChange={(v) => setSearchParams({ section: v }, { replace: true })}
        items={SETTINGS_SECTIONS.map((s) => ({ value: s.id, label: s.label }))}
      >
        <TabsContent value="system" className="space-y-8 pt-2">

        {/* =========================================================================
            1. 通用设置（系统信息）
           ========================================================================= */}
        <SettingsSection
              title="服务属性"
              action={
                <RefreshButton
                  label=""
                  className="h-8 w-8 px-0"
                  onClick={() => refetchHost()}
                  loading={hostFetching}
                />
              }
            >
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
            </SettingsSection>

            <SettingsSection title="主机与硬件资源">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* CPU */}
                <div className="rounded-sm border border-border1 bg-bg2 p-4 transition-all hover:border-primary-3 hover:shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-text3">
                      <Cpu className="h-4 w-4 text-sky-500" /> CPU
                    </span>
                    <span className="text-[11px] font-mono text-text3">
                      {host?.num_cpu ? `${host.num_cpu} 核` : ""}
                    </span>
                  </div>
                  <div className="text-2xl font-bold tracking-tight tabular-nums">
                    {host ? `${(host.cpu_used_pct ?? 0).toFixed(1)}%` : "—"}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-text3" title={host?.cpu_model}>
                    {host?.cpu_model || "处理器负载正常"}
                  </p>
                  {host && (
                    <div className="mt-3">
                      <UsageBar pct={host.cpu_used_pct} label="使用率" showValue={false} />
                    </div>
                  )}
                </div>

                {/* 内存 */}
                <div className="rounded-sm border border-border1 bg-bg2 p-4 transition-all hover:border-primary-3 hover:shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-text3">
                      <MemoryStick className="h-4 w-4 text-indigo-500" /> 内存
                    </span>
                    <span className="text-[11px] font-mono text-text3">
                      {host ? `${(host.mem_used_pct ?? 0).toFixed(1)}%` : ""}
                    </span>
                  </div>
                  <div className="text-2xl font-bold tracking-tight tabular-nums">
                    {host ? formatBytes(host.mem_used) : "—"}
                  </div>
                  <p className="mt-1 text-[11px] text-text3">
                    {host ? `总量 ${formatBytes(host.mem_total)}` : "—"}
                  </p>
                  {host && (
                    <div className="mt-3">
                      <UsageBar pct={host.mem_used_pct} label="内存占比" showValue={false} />
                    </div>
                  )}
                </div>

                {/* 磁盘 */}
                <div className="rounded-sm border border-border1 bg-bg2 p-4 transition-all hover:border-primary-3 hover:shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-text3">
                      <HardDrive className="h-4 w-4 text-amber-500" /> 存储
                    </span>
                    {host?.disks?.[0] && (
                      <span className="text-[11px] font-mono text-text3 truncate max-w-[80px]">
                        {host.disks[0].path}
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-bold tracking-tight tabular-nums">
                    {host?.disks?.length ? `${(host.disks[0].used_pct ?? 0).toFixed(1)}%` : "—"}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-text3">
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
                <div className="rounded-sm border border-border1 bg-bg2 p-4 transition-all hover:border-primary-3 hover:shadow-sm">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text3">
                    <Activity className="h-4 w-4 text-emerald-500" /> 系统与运行时长
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-text3">运行时长</span>
                      <span className="font-mono font-medium">{host ? formatUptime(host.uptime_sec) : "—"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-text3">主机名</span>
                      <span className="font-mono font-medium truncate max-w-[110px]" title={host?.hostname}>
                        {host?.hostname || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-text3">OS / 架构</span>
                      <span className="font-mono font-medium">{host ? `${host.go_os}/${host.go_arch}` : "—"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </SettingsSection>
        </TabsContent>
        <TabsContent value="cluster" className="space-y-8 pt-2">
            <SettingsSection
              title="运行角色"
              action={
                <RefreshButton
                  label=""
                  className="h-8 w-8 px-0"
                  onClick={() => refetchCluster()}
                  loading={clusterFetching}
                />
              }
            >
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
                      onKeyDown={(e) => e.key === "Enter" && setForm((f) => ({ ...f, mode: mKey }))}
                      className={cn(
                        "relative flex flex-col justify-between rounded-sm border p-4 cursor-pointer transition-all duration-200 text-left active:scale-[0.98]",
                        isSelected
                          ? "border-primary bg-primary-1 shadow-sm ring-2 ring-primary-3"
                          : "border-border1 hover:border-primary-3 hover:bg-bg4"
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-sm transition-colors",
                              isSelected ? "bg-primary text-primary-foreground" : "bg-bg5 text-text3"
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
                        <p className="mt-1 text-xs text-text3 leading-relaxed">
                          {meta.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SettingsSection>

            <SettingsSection title="连接参数">
              <SettingsFormRow
                label="Agent ID"
                hint="集群中用于唯一定位当前节点的标识，默认使用主机名。"
              >
                <Input
                  className="font-mono"
                  value={form.agent_id}
                  onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
                  placeholder="例如: agent-node-01 (留空则默认使用主机名)"
                />
              </SettingsFormRow>

              {form.mode === "agent" && (
                <>
                  <SettingsFormRow
                    label="中心地址"
                    hint="调度中心控制台的 HTTP 根地址，如 http://192.168.1.100:18080。"
                  >
                    <Input
                      className="font-mono"
                      value={form.controller_url}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, controller_url: e.target.value }))
                      }
                      placeholder="http://192.168.1.10:18080"
                    />
                  </SettingsFormRow>

                  <SettingsFormRow
                    label="共享密钥"
                    hint="与中心 Controller 约定的通信密钥，用于身份鉴权与安全握手。"
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
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text3 hover:text-text1"
                      >
                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {cluster?.agent_token_set && !tokenDirty ? (
                      <p className="mt-1 text-xs text-success">
                        ● 密钥已在后端配置（留空保存则保持原密钥）
                      </p>
                    ) : null}
                  </SettingsFormRow>
                </>
              )}

              <SettingsFormRow
                label="广播地址"
                hint="供中心直接回连本机的 API 地址，在存在隧道反代时不强制填写。"
              >
                <Input
                  className="font-mono"
                  value={form.advertise_url}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, advertise_url: e.target.value }))
                  }
                  placeholder="http://本机可达IP:端口"
                />
              </SettingsFormRow>

              <SettingsFormRow label="心跳间隔" hint="Agent 向中心上报健康状态的时间间隔（秒）。">
                <Input
                  type="number"
                  min={5}
                  className="w-44"
                  value={form.heartbeat_sec}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, heartbeat_sec: Number(e.target.value) }))
                  }
                />
              </SettingsFormRow>

              {/* 操作按钮组（源力设计：表单底部按钮） */}
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border1 pt-4">
                <Button onClick={() => onSave(true)} disabled={saveMut.isPending}>
                  {saveMut.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  保存配置
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
                      variant="secondary"
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
            </SettingsSection>

            <SettingsSection title="连接状态">
              <div className="rounded-sm border border-border1 bg-bg2 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text3">当前连接健康状态</span>
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
                  <div className="rounded-sm bg-bg5 p-3">
                    <div className="text-text3">心跳状态</div>
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
                  <div className="rounded-sm bg-bg5 p-3">
                    <div className="text-text3">最近心跳时间</div>
                    <div className="mt-1 font-mono text-sm">{hb.last_at || "—"}</div>
                  </div>
                  <div className="rounded-sm bg-bg5 p-3">
                    <div className="text-text3">中心 Controller</div>
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
                  <div className="pt-2 border-t border-border1 flex items-center gap-2">
                    <span className="text-xs text-text3">当前托管隧道会话:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {sessions.map((s) => (
                        <Badge key={s.agent_id} variant="outline" className="font-mono text-[11px] bg-bg1">
                          {s.agent_id}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SettingsSection>
        </TabsContent>
        <TabsContent value="security" className="space-y-8 pt-2">
            <SettingsSection title="认证配置">
              <div className="mb-4 flex items-center gap-2">
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

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-sm border border-border1 bg-bg5 p-4">
                  <div className="text-xs text-text3">鉴权状态</div>
                  <div className="mt-1 font-semibold text-base">
                    {authStatus?.auth_enabled ? "已开启安全登录" : "未开启（免密访问）"}
                  </div>
                  <p className="mt-1 text-[11px] text-text3">
                    {authStatus?.auth_enabled ? "所有敏感写操作需要 Token 认证" : "适合受控内网直接使用"}
                  </p>
                </div>

                <div className="rounded-sm border border-border1 bg-bg5 p-4">
                  <div className="text-xs text-text3">当前会话身份</div>
                  <div className="mt-1 font-semibold text-base">
                    {authStatus?.authenticated ? "已认证管理员" : "未鉴权 / 匿名"}
                  </div>
                  <p className="mt-1 text-[11px] text-text3">
                    基于 Bearer JWT Token 校验
                  </p>
                </div>

                <div className="rounded-sm border border-border1 bg-bg5 p-4">
                  <div className="text-xs text-text3">Token 有效期</div>
                  <div className="mt-1 font-semibold text-base font-mono">24 小时</div>
                  <p className="mt-1 text-[11px] text-text3">
                    可通过 ALUKA_TOKEN_TTL_HOURS 调整
                  </p>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection
              title="面板防护（IP 名单 + 登录防爆破）"
              action={
                <RefreshButton
                  label=""
                  className="h-8 w-8 px-0"
                  onClick={refetchGuard}
                  loading={guardFetching}
                />
              }
            >
              <SettingsFormRow
                label="IP 白名单"
                hint="非空时仅允许列表内 IP 访问面板（含登录页）。保存时会校验当前访问 IP 必须包含在新白名单内，防止误锁；机器间 Agent 流量不受影响。"
              >
                <Textarea
                  rows={3}
                  className="font-mono text-xs"
                  placeholder={"留空=不限制\n每行一个 IP 或 CIDR"}
                  value={panelForm.ip_whitelist}
                  onChange={(e) =>
                    setPanelForm((f) => ({ ...f, ip_whitelist: e.target.value }))
                  }
                />
              </SettingsFormRow>
              <SettingsFormRow
                label="IP 黑名单"
                hint="黑名单 IP 一律拒绝访问面板（含登录页）；优先于白名单。"
              >
                <Textarea
                  rows={3}
                  className="font-mono text-xs"
                  placeholder={"例: 1.2.3.4\n203.0.113.0/24"}
                  value={panelForm.ip_blacklist}
                  onChange={(e) =>
                    setPanelForm((f) => ({ ...f, ip_blacklist: e.target.value }))
                  }
                />
              </SettingsFormRow>
              <div className="grid gap-3 sm:grid-cols-3">
                <SettingsFormRow label="失败阈值" hint="窗口内连续登录失败次数达到该值即触发封禁（1-1000）。">
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    className="font-mono"
                    value={panelForm.login_max_fails}
                    onChange={(e) =>
                      setPanelForm((f) => ({
                        ...f,
                        login_max_fails: Number(e.target.value),
                      }))
                    }
                  />
                </SettingsFormRow>
                <SettingsFormRow label="计窗秒数" hint="失败计数的时间窗口（秒），窗口外失败重新计数。">
                  <Input
                    type="number"
                    min={60}
                    max={604800}
                    className="font-mono"
                    value={panelForm.login_window_sec}
                    onChange={(e) =>
                      setPanelForm((f) => ({
                        ...f,
                        login_window_sec: Number(e.target.value),
                      }))
                    }
                  />
                </SettingsFormRow>
                <SettingsFormRow label="封禁秒数" hint="触发封禁后该 IP 被拒绝访问的时长（秒）。">
                  <Input
                    type="number"
                    min={60}
                    max={604800}
                    className="font-mono"
                    value={panelForm.login_ban_sec}
                    onChange={(e) =>
                      setPanelForm((f) => ({ ...f, login_ban_sec: Number(e.target.value) }))
                    }
                  />
                </SettingsFormRow>
              </div>
              <div className="mt-6 flex items-center gap-2 border-t border-border1 pt-4">
                <Button onClick={() => savePanelMut.mutate()} disabled={savePanelMut.isPending}>
                  {savePanelMut.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  保存面板防护配置
                </Button>
                <span className="text-[11px] text-text3">
                  封禁/统计为内存态，进程重启后自动清零（防误封自愈）。
                </span>
              </div>

              <div className="mt-6 rounded-sm border border-border1 bg-bg5 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-text3">
                    当前封禁列表（{bans.length}）
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    失败计数 {failures.length} 个 IP
                  </Badge>
                </div>
                {bans.length === 0 ? (
                  <div className="text-xs text-text3">暂无被封禁的 IP。</div>
                ) : (
                  <div className="space-y-2">
                    {bans.map((b) => (
                      <div
                        key={b.ip}
                        className="flex items-center justify-between gap-3 rounded-sm border border-border1 bg-bg2 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <span className="font-mono text-xs font-medium">{b.ip}</span>
                          <span className="ml-2 text-[11px] text-text3">
                            解封时间 {new Date(b.ban_until).toLocaleString()}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 text-xs"
                          disabled={unbanMut.isPending}
                          onClick={() => unbanMut.mutate(b.ip)}
                        >
                          <ShieldOff className="mr-1 h-3 w-3" /> 解封
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SettingsSection>

            <SettingsSection title="环境变量配置参考（生产推荐）">
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
                <EnvSnippet
                  label="面板访问 IP 白名单（启动兜底）"
                  cmd="ALUKA_PANEL_IP_WHITELIST=192.168.1.0/24,10.0.0.0/8"
                  desc="进程启动即生效，可在本页热改并覆盖；误设白名单时重启进程可逃生"
                  onCopy={() => copyToClipboard("ALUKA_PANEL_IP_WHITELIST=192.168.1.0/24,10.0.0.0/8", "env_panel_wl")}
                  copied={copiedKey === "env_panel_wl"}
                />
                <EnvSnippet
                  label="面板访问 IP 黑名单（启动兜底）"
                  cmd="ALUKA_PANEL_IP_BLACKLIST=1.2.3.4,203.0.113.0/24"
                  desc="黑名单 IP 一律拒绝访问面板（含登录页）"
                  onCopy={() => copyToClipboard("ALUKA_PANEL_IP_BLACKLIST=1.2.3.4,203.0.113.0/24", "env_panel_bl")}
                  copied={copiedKey === "env_panel_bl"}
                />
                <EnvSnippet
                  label="登录防爆破参数（启动兜底）"
                  cmd="ALUKA_LOGIN_MAX_FAILS=5 ALUKA_LOGIN_WINDOW_SEC=600 ALUKA_LOGIN_BAN_SEC=900"
                  desc="窗口内失败 5 次即封禁该 IP 900 秒；可在本页热改并覆盖"
                  onCopy={() => copyToClipboard("ALUKA_LOGIN_MAX_FAILS=5 ALUKA_LOGIN_WINDOW_SEC=600 ALUKA_LOGIN_BAN_SEC=900", "env_login_guard")}
                  copied={copiedKey === "env_login_guard"}
                />
              </div>
            </SettingsSection>

            <SettingsSection title="安全建议">
              <div className="rounded-sm border border-border1 bg-bg2 p-4">
                <h4 className="text-xs font-semibold text-text1 flex items-center gap-1.5 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> 生产安全最佳实践
                </h4>
                <ul className="list-inside list-disc space-y-1 text-xs text-text3 leading-relaxed">
                  <li>公网暴露时务必配置高强度管理密码（推荐 12 位以上字母+数字+特殊符号组合）。</li>
                  <li>在多节点集群通信中，为 Agent 配置专属 <code>agent_token</code>，避免未授权节点接入。</li>
                  <li>可通过前置 Nginx 或 Traefik 配置 HTTPS 证书并设置 IP 白名单进一步增强防护。</li>
                </ul>
              </div>
            </SettingsSection>
        </TabsContent>
        <TabsContent value="appearance" className="space-y-8 pt-2">
            <SettingsSection title="界面主题模式">
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
            </SettingsSection>

            <SettingsSection title="主题与终端同步">
              <div className="rounded-sm border border-border1 bg-bg5 p-4 space-y-2">
                <p className="text-xs text-text3 leading-relaxed">
                  Aluka Ops 的所有组件、状态点、图表以及 Web 终端（xterm.js）均基于全局 CSS 语义 Token 实时解析。切换主题时无需刷新页面，控制台所有颜色及终端配色将毫秒级平滑热更新。
                </p>
              </div>
            </SettingsSection>
        </TabsContent>
      </TabBar>
    </PageTemplate>
  );
}

/** 键值卡片 */
function InfoCard({ label, value, icon: Icon, mono = false, badgeTone, copyable = false, onCopy, copied = false }) {
  return (
    <div className="flex items-center justify-between rounded-sm border border-border1 bg-bg2 p-3.5 transition-all hover:border-primary-3">
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-bg5 text-text3">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        <div className="min-w-0">
          <div className="text-[11px] text-text3 truncate">{label}</div>
          <div className={cn("font-medium text-sm text-text1 truncate", mono && "font-mono")}>
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
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-text3" onClick={onCopy} aria-label="复制">
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      ) : null}
    </div>
  );
}

/** 环境变量代码卡 */
function EnvSnippet({ label, cmd, desc, onCopy, copied }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-sm border border-border1 bg-bg5 p-3.5">
      <div className="min-w-0 space-y-0.5">
        <div className="text-xs font-semibold text-text1">{label}</div>
        <div className="font-mono text-xs text-primary">{cmd}</div>
        {desc && <div className="text-[11px] text-text3">{desc}</div>}
      </div>
      <Button variant="secondary" size="sm" className="h-8 shrink-0 text-xs gap-1.5" onClick={onCopy}>
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
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={cn(
        "group relative flex flex-col justify-between rounded-sm border p-4 cursor-pointer transition-all duration-200 text-left active:scale-[0.98]",
        active
          ? "border-primary bg-primary-1 shadow-sm ring-2 ring-primary-3"
          : "border-border1 hover:border-primary-3 hover:bg-bg4"
      )}
    >
      <div>
        <div className="flex items-center justify-between mb-3">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-sm transition-colors",
              active ? "bg-primary text-primary-foreground" : "bg-bg5 text-text3 group-hover:text-text1"
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          {active ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]">
              <Check className="h-3 w-3 stroke-[3]" />
            </span>
          ) : null}
        </div>
        <div className="font-semibold text-sm">{title}</div>
        <p className="mt-1 text-xs text-text3 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

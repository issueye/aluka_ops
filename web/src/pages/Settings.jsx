import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Link2,
  Link2Off,
  Save,
  RefreshCw,
  Server,
  Network,
  Shield,
} from "lucide-react";
import { healthApi, authApi, systemApi, clusterApi, api } from "@/lib/api";
import { authHeaders } from "@/lib/auth";
import { cn, formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageShell } from "@/components/ued";

const MODE_LABEL = {
  standalone: "独立节点",
  agent: "Agent（连中心）",
  controller: "Controller（中心）",
};

const SETTINGS_SECTIONS = [
  {
    id: "system",
    label: "系统信息",
    description: "版本、主机与资源状态",
    icon: Server,
  },
  {
    id: "cluster",
    label: "节点与集群",
    description: "运行角色、心跳与中心连接",
    icon: Network,
  },
  {
    id: "security",
    label: "安全与鉴权",
    description: "登录保护与 Token 策略",
    icon: Shield,
  },
];

const SETTINGS_SECTION_IDS = new Set(SETTINGS_SECTIONS.map((section) => section.id));

export function Settings() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const activeSection = SETTINGS_SECTION_IDS.has(requestedSection)
    ? requestedSection
    : "system";
  const [form, setForm] = useState({
    mode: "standalone",
    controller_url: "",
    agent_token: "",
    agent_id: "",
    advertise_url: "",
    heartbeat_sec: 15,
  });
  const [tokenDirty, setTokenDirty] = useState(false);

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: healthApi.check,
    staleTime: 10000,
  });
  const { data: host } = useQuery({
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
    onSuccess: (data, vars, ctx) => {
      // request() 只返回 data;连接失败时后端 message 在外壳 — 用 data.connect_ok 判断
      setTokenDirty(false);
      setForm((f) => ({ ...f, agent_token: "" }));
      qc.invalidateQueries({ queryKey: ["cluster-status"] });
      qc.invalidateQueries({ queryKey: ["health"] });
      qc.invalidateQueries({ queryKey: ["agent-status"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      if (data?.connect_ok === false || data?.connect_error) {
        toast.error(data.connect_error || "配置已保存，但连接中心失败");
      } else if (vars?.connect && vars?.mode === "agent") {
        toast.success("配置已保存，并已连接中心");
      } else {
        toast.success("集群配置已保存并应用");
      }
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const connectMut = useMutation({
    mutationFn: async () => {
      // 需要完整 message:直接 fetch
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
        toast.success("已连接中心（心跳 + 隧道）");
      } else {
        toast.message(j?.message || "已发送连接请求");
      }
    },
    onError: (e) => toast.error(e.message || "连接失败"),
  });

  const disconnectMut = useMutation({
    mutationFn: () => clusterApi.disconnect(),
    onSuccess: () => {
      toast.message("已断开与中心的心跳/隧道连接");
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
    <PageShell>
      <div className="grid items-start gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label="设置分类"
          className="flex gap-2 overflow-x-auto border-b pb-3 xl:sticky xl:top-0 xl:block xl:space-y-1 xl:overflow-visible xl:border-b-0 xl:border-r xl:pb-0 xl:pr-5"
        >
          <div className="mb-3 hidden px-3 xl:block">
            <div className="text-sm font-semibold">设置分类</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              按配置域查看和维护当前节点
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
                  "flex min-w-fit items-center gap-3 rounded-md px-3 py-2 text-left transition-colors xl:w-full",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <section.icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{section.label}</span>
                  <span className="hidden truncate text-[11px] text-muted-foreground xl:block">
                    {section.description}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
      {activeSection === "system" && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            系统信息
          </CardTitle>
          <CardDescription>当前后端运行状态（主机资源每 10 秒刷新）</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Info label="应用" value={health?.app || "-"} />
          <Info label="版本" value={health?.version || "-"} />
          <Info label="运行模式" value={MODE_LABEL[mode] || mode} />
          <Info label="主机" value={host?.hostname || health?.host || "-"} />
          <Info
            label="系统"
            value={
              host
                ? `${host.platform || host.os || ""} ${host.platform_version || ""}`.trim()
                : "-"
            }
          />
          <Info
            label="CPU"
            value={
              host
                ? `${(host.cpu_used_pct ?? 0).toFixed(1)}% · ${host.num_cpu || "?"} 核`
                : "-"
            }
          />
          <Info
            label="内存"
            value={
              host
                ? `${formatBytes(host.mem_used)} / ${formatBytes(host.mem_total)} (${(host.mem_used_pct ?? 0).toFixed(1)}%)`
                : "-"
            }
          />
          <Info
            label="磁盘"
            value={
              host?.disks?.[0]
                ? `${host.disks[0].path} ${(host.disks[0].used_pct ?? 0).toFixed(1)}%`
                : "-"
            }
          />
          <Info label="数据库" value={health?.db || "-"} />
          <Info label="HTTP 端口" value={cluster?.http_port || "-"} />
          <Info label="时间" value={health?.timestamp || "-"} />
        </CardContent>
      </Card>
      )}

      {activeSection === "cluster" && (
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              节点角色与中心连接
            </CardTitle>
            <CardDescription>
              在此切换 standalone / agent / controller，配置中心地址后可主动连接。配置写入数据库，重启后仍生效（优先于环境变量）。
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchCluster()}
            disabled={clusterFetching}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${clusterFetching ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">当前:</span>
            <Badge
              variant={
                mode === "controller" ? "default" : mode === "agent" ? "success" : "secondary"
              }
            >
              {MODE_LABEL[mode] || mode}
            </Badge>
            {cluster?.heartbeat_running ? (
              <Badge variant="success">心跳运行中</Badge>
            ) : mode === "agent" ? (
              <Badge variant="secondary">心跳未运行</Badge>
            ) : null}
            {cluster?.tunnel_client_running ? (
              <Badge variant="success">隧道客户端运行中</Badge>
            ) : null}
            {cluster?.agent_token_set ? (
              <Badge variant="outline">Token 已配置</Badge>
            ) : (
              <Badge variant="secondary">Token 未设置</Badge>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>运行模式</Label>
              <Select
                value={form.mode}
                onValueChange={(v) => setForm((f) => ({ ...f, mode: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择模式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standalone">standalone · 独立节点</SelectItem>
                  <SelectItem value="agent">agent · 作为 Agent 连接中心</SelectItem>
                  <SelectItem value="controller">
                    controller · 作为中心纳管多节点
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Agent ID</Label>
              <Input
                className="font-mono"
                value={form.agent_id}
                onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
                placeholder="默认主机名"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>中心 Controller URL</Label>
              <Input
                className="font-mono"
                value={form.controller_url}
                onChange={(e) => setForm((f) => ({ ...f, controller_url: e.target.value }))}
                placeholder="http://192.168.1.10:19090"
              />
              <p className="text-[11px] text-muted-foreground">
                Agent 模式下填写中心地址；Controller 模式可留空。
              </p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>
                Agent Token
                {cluster?.agent_token_set && !tokenDirty ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    （已设置，留空保存则不修改）
                  </span>
                ) : null}
              </Label>
              <Input
                type="password"
                className="font-mono"
                value={form.agent_token}
                onChange={(e) => {
                  setTokenDirty(true);
                  setForm((f) => ({ ...f, agent_token: e.target.value }));
                }}
                placeholder={cluster?.agent_token_set ? "••••••••" : "共享密钥"}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>本机 Advertise URL（可选）</Label>
              <Input
                className="font-mono"
                value={form.advertise_url}
                onChange={(e) => setForm((f) => ({ ...f, advertise_url: e.target.value }))}
                placeholder="http://本机可达IP:端口"
              />
              <p className="text-[11px] text-muted-foreground">
                供中心在无隧道时回连本机 API；有隧道时可不填。
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>心跳间隔（秒）</Label>
              <Input
                type="number"
                min={5}
                value={form.heartbeat_sec}
                onChange={(e) =>
                  setForm((f) => ({ ...f, heartbeat_sec: Number(e.target.value) }))
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onSave(true)} disabled={saveMut.isPending}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              保存并应用
            </Button>
            <Button
              variant="default"
              disabled={connectMut.isPending || form.mode !== "agent"}
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
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              连接中心
            </Button>
            <Button
              variant="outline"
              disabled={disconnectMut.isPending}
              onClick={() => disconnectMut.mutate()}
            >
              <Link2Off className="mr-1.5 h-3.5 w-3.5" />
              断开连接
            </Button>
          </div>

          <div className="rounded-md border bg-muted/20 p-3 text-xs">
            <div className="mb-2 font-medium text-muted-foreground">连接状态</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Info
                label="心跳"
                value={
                  hb.enabled
                    ? hb.last_ok
                      ? `正常 · HTTP ${hb.last_http || "-"}`
                      : "失败"
                    : mode === "agent"
                      ? "未启用/未连接"
                      : "—"
                }
              />
              <Info label="最近心跳" value={hb.last_at || "—"} />
              <Info label="Controller" value={cluster?.controller_url || "—"} />
            </div>
            {hbFailed && hbMsg && (
              <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] leading-relaxed text-destructive">
                <div className="font-medium">连接失败原因</div>
                <div className="mt-1 break-all whitespace-pre-wrap">{hbMsg}</div>
                {/refused|无进程监听|19090/i.test(hbMsg) && (
                  <div className="mt-2 text-muted-foreground">
                    排查：1) 中心机器是否已启动 aluka_ops；2) 中心实际监听端口（默认{" "}
                    <code>18080</code>，命令行 <code>-port</code> 可改）；3) Controller URL 是否写成{" "}
                    <code>http://中心IP:实际端口</code>；4) 防火墙是否放行该端口。
                  </div>
                )}
              </div>
            )}
            {sessions.length > 0 && (
              <div className="mt-2">
                <span className="text-muted-foreground">本机隧道会话（作为中心时）: </span>
                {sessions.map((s) => (
                  <Badge key={s.agent_id} variant="success" className="mr-1 font-mono">
                    {s.agent_id}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <ul className="list-inside list-disc space-y-1 text-[11px] text-muted-foreground">
            <li>
              <strong>controller</strong>：本机作为中心，接收其它 Agent 心跳与隧道；在「多节点」「流量隧道」管理。
            </li>
            <li>
              <strong>agent</strong>：填写中心 URL + Token 后点「连接中心」，立即上报心跳并建立隧道。
            </li>
            <li>
              <strong>standalone</strong>：单机面板；仍可承载隧道规则（本机即中心试玩）。
            </li>
            <li>
              命令行 <code>-mode</code> / 环境变量仅在首次无 DB 配置时生效；之后以本页保存为准。
            </li>
            <li>
              两台机器示例：中心{" "}
              <code>./aluka_ops.exe -mode controller -port 18080 -agent-token secret</code>
              ；Agent 填 <code>http://中心IP:18080</code> 与相同 Token。
            </li>
          </ul>
        </CardContent>
      </Card>
      )}

      {activeSection === "security" && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            安全与鉴权
          </CardTitle>
          <CardDescription>
            通过环境变量 <code className="text-xs">ALUKA_PASSWORD</code> 启用单管理员密码登录
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">鉴权状态:</span>
            {authStatus?.auth_enabled ? (
              <Badge variant="success">已启用</Badge>
            ) : (
              <Badge variant="secondary">未启用(内网模式)</Badge>
            )}
            {authStatus?.auth_enabled && (
              <Badge variant={authStatus.authenticated ? "success" : "danger"}>
                {authStatus.authenticated ? "已登录" : "未登录"}
              </Badge>
            )}
          </div>
          <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
            <li>
              设置密码: <code>ALUKA_PASSWORD=your-secret</code>
            </li>
            <li>
              Token 有效期: <code>ALUKA_TOKEN_TTL_HOURS=24</code>(默认 24 小时)
            </li>
            <li>未设置密码时所有 API 无需登录,适合纯内网部署</li>
          </ul>
        </CardContent>
      </Card>
      )}
        </div>
      </div>
    </PageShell>
  );
}

function Info({ label, value }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="break-all font-mono text-sm">{value}</div>
    </div>
  );
}

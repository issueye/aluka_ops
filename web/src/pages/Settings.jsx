import { useQuery } from "@tanstack/react-query";
import { healthApi, authApi, systemApi, api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatBytes(n) {
  if (n == null || n === 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

export function Settings() {
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
  const { data: agentStatus } = useQuery({
    queryKey: ["agent-status"],
    queryFn: () => api.get("/api/agent/status"),
    staleTime: 5000,
    refetchInterval: 15000,
  });

  const hb = agentStatus?.heartbeat || {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>系统信息</CardTitle>
          <CardDescription>当前后端运行状态（主机资源每 10 秒刷新）</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Info label="应用" value={health?.app || "-"} />
          <Info label="版本" value={health?.version || "-"} />
          <Info label="运行模式" value={health?.mode || agentStatus?.mode || "-"} />
          <Info label="主机" value={host?.hostname || health?.host || agentStatus?.host || "-"} />
          <Info label="系统" value={host ? `${host.platform || host.os || ""} ${host.platform_version || ""}`.trim() : "-"} />
          <Info label="CPU" value={host ? `${(host.cpu_used_pct ?? 0).toFixed(1)}% · ${host.num_cpu || "?"} 核` : "-"} />
          <Info label="内存" value={host ? `${formatBytes(host.mem_used)} / ${formatBytes(host.mem_total)} (${(host.mem_used_pct ?? 0).toFixed(1)}%)` : "-"} />
          <Info label="磁盘" value={host?.disks?.[0] ? `${host.disks[0].path} ${(host.disks[0].used_pct ?? 0).toFixed(1)}%` : "-"} />
          <Info label="数据库" value={health?.db || "-"} />
          <Info label="时间" value={health?.timestamp || "-"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>安全与鉴权</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle>Agent 模式</CardTitle>
          <CardDescription>
            本机可作为可纳管 Agent,向中心 Controller 上报心跳并接收启停指令
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">模式:</span>
            <Badge variant={agentStatus?.enabled ? "default" : "secondary"}>
              {agentStatus?.mode || "standalone"}
            </Badge>
            <span className="text-muted-foreground">Agent ID:</span>
            <code className="text-xs">{agentStatus?.agent_id || "-"}</code>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Info label="Controller" value={agentStatus?.controller || "(未配置)"} />
            <Info
              label="心跳"
              value={
                hb.enabled
                  ? hb.last_ok
                    ? `正常 · HTTP ${hb.last_http || "-"}`
                    : `失败 · ${hb.last_msg || "-"}`
                  : "未启用"
              }
            />
            <Info label="最近心跳" value={hb.last_at || "-"} />
            <Info
              label="服务统计"
              value={
                agentStatus?.services
                  ? `共 ${agentStatus.services.total} · 运行 ${agentStatus.services.running} · 异常 ${agentStatus.services.crashed}`
                  : "-"
              }
            />
          </div>
          <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
            <li>
              启用 Agent: <code>ALUKA_MODE=agent</code>
            </li>
            <li>
              中心地址: <code>ALUKA_CONTROLLER_URL=http://ctrl:19090</code>
            </li>
            <li>
              共享密钥: <code>ALUKA_AGENT_TOKEN=xxx</code>(上报与 /api/agent 鉴权)
            </li>
            <li>
              心跳间隔: <code>ALUKA_HEARTBEAT_SEC=15</code>
            </li>
            <li>
              Controller 应提供 <code>POST /api/agents/heartbeat</code> 接收上报
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
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

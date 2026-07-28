import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Network,
  RefreshCw,
  Play,
  Square,
  RotateCw,
  Server,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationBar } from "@/components/ui/pagination";
import { formatTime } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";

const agentsApi = {
  list: () => api.get("/api/agents"),
  get: (id) => api.get(`/api/agents/${id}`),
  services: (id, refresh = false) =>
    api.get(`/api/agents/${id}/services${refresh ? "?refresh=1" : ""}`),
  start: (id, sid) => api.post(`/api/agents/${id}/services/${sid}/start`),
  stop: (id, sid) => api.post(`/api/agents/${id}/services/${sid}/stop`),
  restart: (id, sid) => api.post(`/api/agents/${id}/services/${sid}/restart`),
};

export function Agents() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState({});

  const { data: agents = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["agents"],
    queryFn: agentsApi.list,
    refetchInterval: 5000,
  });

  const actionMut = useMutation({
    mutationFn: ({ agentId, sid, action }) => {
      if (action === "start") return agentsApi.start(agentId, sid);
      if (action === "stop") return agentsApi.stop(agentId, sid);
      return agentsApi.restart(agentId, sid);
    },
    onSuccess: (_, vars) => {
      toast.success(`${vars.action} 已下发`);
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (e) => toast.error(`操作失败: ${e.message}`),
  });

  const toggle = (id) => setExpanded((m) => ({ ...m, [id]: !m[id] }));

  const pg = usePagination(agents, 10);
  const onlineCount = agents.filter((a) => a.online).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Network className="h-4 w-4" /> 多节点 Agent
            </CardTitle>
            <CardDescription>
              中心模式(ALUKA_MODE=controller)下展示已上报的 Agent。在线 {onlineCount} / 共{" "}
              {agents.length}。
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "animate-spin" : ""} /> 刷新
          </Button>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
              加载失败。请确认以 controller 模式运行,或后端已启动。
            </div>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : agents.length === 0 ? (
            <div className="space-y-2 py-8 text-center text-sm text-muted-foreground">
              <Server className="mx-auto h-8 w-8 opacity-50" />
              <p>暂无 Agent 上报。</p>
              <p className="text-xs">
                中心: <code>ALUKA_MODE=controller ALUKA_AGENT_TOKEN=xxx</code>
                <br />
                Agent:{" "}
                <code>
                  ALUKA_MODE=agent ALUKA_CONTROLLER_URL=http://中心:端口
                  ALUKA_AGENT_TOKEN=xxx ALUKA_ADVERTISE_URL=http://本机:端口
                </code>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pg.pageItems.map((a) => (
                <div key={a.agent_id} className="rounded-lg border border-border/60">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30"
                    onClick={() => toggle(a.agent_id)}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {expanded[a.agent_id] ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{a.agent_id}</span>
                          <Badge variant={a.online ? "success" : "danger"}>
                            {a.online ? "在线" : "离线"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {a.host} · {a.os}/{a.arch} · v{a.version || "-"}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          服务 {a.services_total ?? 0}(运行 {a.services_running ?? 0} / 异常{" "}
                          {a.services_crashed ?? 0}) · 最近心跳 {formatTime(a.last_seen_at)}
                        </div>
                      </div>
                    </div>
                    <code className="hidden max-w-[240px] truncate text-xs text-muted-foreground sm:block">
                      {a.api_base || "-"}
                    </code>
                  </button>

                  {expanded[a.agent_id] && (
                    <div className="border-t border-border/60 px-4 py-3">
                      {(a.services || []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          心跳未携带服务明细,可点刷新从 Agent 实时拉取。
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>服务</TableHead>
                              <TableHead className="w-[80px]">类型</TableHead>
                              <TableHead className="w-[100px]">状态</TableHead>
                              <TableHead className="w-[80px]">PID</TableHead>
                              <TableHead className="w-[140px] text-right">远程操作</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {a.services.map((s) => (
                              <TableRow key={`${a.agent_id}-${s.id}`}>
                                <TableCell>
                                  <div className="text-sm font-medium">{s.name}</div>
                                  <div className="font-mono text-xs text-muted-foreground">
                                    {s.code}
                                  </div>
                                </TableCell>
                                <TableCell className="uppercase text-xs">{s.type}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      s.status === "running"
                                        ? "success"
                                        : s.status === "crashed"
                                        ? "danger"
                                        : "secondary"
                                    }
                                  >
                                    {s.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {s.pid || "—"}
                                </TableCell>
                                <TableCell>
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      title="启动"
                                      disabled={!a.online || actionMut.isPending}
                                      onClick={() =>
                                        actionMut.mutate({
                                          agentId: a.agent_id,
                                          sid: s.id,
                                          action: "start",
                                        })
                                      }
                                    >
                                      <Play className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      title="停止"
                                      disabled={!a.online || actionMut.isPending}
                                      onClick={() =>
                                        actionMut.mutate({
                                          agentId: a.agent_id,
                                          sid: s.id,
                                          action: "stop",
                                        })
                                      }
                                    >
                                      <Square className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      title="重启"
                                      disabled={!a.online || actionMut.isPending}
                                      onClick={() =>
                                        actionMut.mutate({
                                          agentId: a.agent_id,
                                          sid: s.id,
                                          action: "restart",
                                        })
                                      }
                                    >
                                      <RotateCw className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {agents.length > 0 && (
                <PaginationBar
                  page={pg.page}
                  totalPages={pg.totalPages}
                  total={pg.total}
                  from={pg.from}
                  to={pg.to}
                  pageSize={pg.pageSize}
                  onPageChange={pg.setPage}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

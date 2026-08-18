import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Play,
  Square,
  RotateCw,
  Server,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import {
  PageTemplate,
  EmptyState,
  RowActions,
  DataTable,
  IconButton,
  Icon,
} from "@/components/ued";

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
    <PageTemplate
      list
      title="多节点 Agent"
      description={`中心模式（ALUKA_MODE=controller）下展示已上报的 Agent。在线 ${onlineCount} / 共 ${agents.length}。`}
      onRefresh={() => refetch()}
      isRefreshing={isFetching}
      error={isError ? "加载失败。请确认以 controller 模式运行，或后端服务已启动。" : null}
      pagination={
        !isLoading && agents.length > 0
          ? {
              page: pg.page,
              totalPages: pg.totalPages,
              total: pg.total,
              from: pg.from,
              to: pg.to,
              pageSize: pg.pageSize,
              setPage: pg.setPage,
            }
          : null
      }
    >
      {isLoading ? (
        <p className="py-8 text-center text-sm text-text3 animate-pulse">加载中...</p>
      ) : agents.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={Server}
            title="暂无 Agent 上报"
            description={
              <>
                中心: <code>ALUKA_MODE=controller ALUKA_AGENT_TOKEN=xxx</code>
                <br />
                Agent:{" "}
                <code>
                  ALUKA_MODE=agent ALUKA_CONTROLLER_URL=http://中心:端口
                  ALUKA_AGENT_TOKEN=xxx ALUKA_ADVERTISE_URL=http://本机:端口
                </code>
              </>
            }
          />
        </div>
      ) : (
        <div className="space-y-3 p-4">
          {pg.pageItems.map((a) => (
            <div key={a.agent_id} className="overflow-hidden rounded-sm border border-border1">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-bg5"
                onClick={() => toggle(a.agent_id)}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Icon
                    icon={expanded[a.agent_id] ? ChevronDown : ChevronRight}
                    size="md"
                    className="text-text3"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{a.agent_id}</span>
                      <Badge variant={a.online ? "success" : "danger"}>
                        {a.online ? "在线" : "离线"}
                      </Badge>
                      <span className="text-xs text-text3">
                        {a.host} · {a.os}/{a.arch} · v{a.version || "-"}
                      </span>
                    </div>
                    <div className="text-xs text-text3 mt-0.5">
                      服务 {a.services_total ?? 0} (运行 {a.services_running ?? 0} / 异常{" "}
                      {a.services_crashed ?? 0}) · 最近心跳 {formatTime(a.last_seen_at)}
                    </div>
                  </div>
                </div>
                <code className="hidden max-w-[240px] truncate font-mono text-xs text-text3 sm:block">
                  {a.api_base || "-"}
                </code>
              </button>

              {expanded[a.agent_id] && (
                <div className="border-t border-border1 bg-bg4 px-4 py-3">
                  {(a.services || []).length === 0 ? (
                    <p className="text-xs text-text3 py-2">
                      心跳未携带服务明细，可点刷新从 Agent 实时拉取。
                    </p>
                  ) : (
                    <DataTable
                      data={a.services}
                      rowKey={(s) => `${a.agent_id}-${s.id}`}
                      columns={[
                        {
                          key: "name",
                          title: "服务",
                          render: (s) => (
                            <>
                              <div className="text-sm font-medium">{s.name}</div>
                              <div className="font-mono text-xs text-text3">{s.code}</div>
                            </>
                          ),
                        },
                        {
                          key: "type",
                          title: "类型",
                          width: "w-[80px]",
                          className: "uppercase text-xs",
                        },
                        {
                          key: "status",
                          title: "状态",
                          width: "w-[100px]",
                          render: (s) => (
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
                          ),
                        },
                        {
                          key: "pid",
                          title: "PID",
                          width: "w-[80px]",
                          className: "font-mono text-xs",
                          render: (s) => s.pid || "—",
                        },
                        {
                          key: "actions",
                          title: "远程操作",
                          width: "w-[140px]",
                          align: "right",
                          render: (s) => (
                            <RowActions>
                              <IconButton
                                icon={Play}
                                label="启动"
                                disabled={!a.online || actionMut.isPending}
                                onClick={() =>
                                  actionMut.mutate({
                                    agentId: a.agent_id,
                                    sid: s.id,
                                    action: "start",
                                  })
                                }
                              />
                              <IconButton
                                icon={Square}
                                label="停止"
                                disabled={!a.online || actionMut.isPending}
                                onClick={() =>
                                  actionMut.mutate({
                                    agentId: a.agent_id,
                                    sid: s.id,
                                    action: "stop",
                                  })
                                }
                              />
                              <IconButton
                                icon={RotateCw}
                                label="重启"
                                disabled={!a.online || actionMut.isPending}
                                onClick={() =>
                                  actionMut.mutate({
                                    agentId: a.agent_id,
                                    sid: s.id,
                                    action: "restart",
                                  })
                                }
                              />
                            </RowActions>
                          ),
                        },
                      ]}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PageTemplate>
  );
}

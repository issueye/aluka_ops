import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { auditApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import {
  PageTemplate,
  SelectField,
  DataTable,
} from "@/components/ued";

const ACTIONS = [
  { value: "all", label: "全部动作" },
  { value: "create", label: "create" },
  { value: "update", label: "update" },
  { value: "delete", label: "delete" },
  { value: "start", label: "start" },
  { value: "stop", label: "stop" },
  { value: "restart", label: "restart" },
  { value: "install", label: "install" },
  { value: "uninstall", label: "uninstall" },
  { value: "upgrade", label: "upgrade" },
  { value: "rollback", label: "rollback" },
  { value: "upload_artifact", label: "upload_artifact" },
];

const TARGETS = [
  { value: "all", label: "全部对象" },
  { value: "service", label: "service" },
  { value: "runtime", label: "runtime" },
];

export function AuditLog() {
  const [action, setAction] = useState("all");
  const [targetType, setTargetType] = useState("all");

  const params = {
    limit: 100,
    action: action === "all" ? undefined : action,
    target_type: targetType === "all" ? undefined : targetType,
  };

  const { data: logs = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => auditApi.list(params),
    refetchInterval: 10000,
  });

  const pg = usePagination(logs, 10);

  return (
    <PageTemplate
      list
      title="审计日志"
      description={`记录系统写操作（创建/修改/删除/启停/安装升级等）。共 ${logs.length} 条记录（最多 100 条）。`}
      onRefresh={() => refetch()}
      isRefreshing={isFetching}
      error={isError ? "加载审计日志失败，请确认后端服务已启动。" : null}
      filters={
        <>
          <SelectField
            className="w-[150px]"
            value={action}
            onChange={setAction}
            options={ACTIONS}
            placeholder="动作"
          />
          <SelectField
            className="w-[130px]"
            value={targetType}
            onChange={setTargetType}
            options={TARGETS}
            placeholder="对象"
          />
        </>
      }
      pagination={
        !isLoading && logs.length > 0
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
      <DataTable
        loading={isLoading}
        data={pg.pageItems}
        empty="暂无审计记录。执行创建/启停/配置修改等写操作后会在此展示。"
        columns={[
          {
            key: "id",
            title: "#",
            width: "w-[60px]",
            className: "text-text3 font-mono",
          },
          {
            key: "action",
            title: "动作",
            width: "w-[120px]",
            render: (log) => (
              <Badge variant="secondary" className="font-mono text-xs">
                {log.action}
              </Badge>
            ),
          },
          {
            key: "target_type",
            title: "对象",
            width: "w-[100px]",
            className: "text-sm",
            render: (log) => log.target_type || "—",
          },
          {
            key: "target_id",
            title: "对象ID",
            width: "w-[80px]",
            className: "font-mono text-xs text-text3",
            render: (log) => log.target_id || "—",
          },
          {
            key: "operator",
            title: "操作人",
            width: "w-[100px]",
            className: "text-sm",
            render: (log) => log.operator || "system",
          },
          {
            key: "detail",
            title: "详情",
            className: "max-w-[360px]",
            render: (log) => (
              <div className="truncate font-mono text-xs text-text3">
                {log.detail || "—"}
              </div>
            ),
          },
          {
            key: "created_at",
            title: "时间",
            width: "w-[160px]",
            className: "text-xs text-text3",
            render: (log) => formatTime(log.created_at),
          },
        ]}
      />
    </PageTemplate>
  );
}

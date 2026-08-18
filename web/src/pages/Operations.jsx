import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { operationApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import {
  PageTemplate,
  CodeText,
  SelectField,
  DataTable,
} from "@/components/ued";

const OP_STATUS_VARIANT = {
  success: "success",
  failed: "danger",
  running: "warning",
  pending: "secondary",
};

const OP_TYPES = [
  { value: "all", label: "全部类型" },
  { value: "install", label: "install" },
  { value: "start", label: "start" },
  { value: "stop", label: "stop" },
  { value: "restart", label: "restart" },
  { value: "upgrade", label: "upgrade" },
  { value: "uninstall", label: "uninstall" },
];

const OP_STATUSES = [
  { value: "all", label: "全部状态" },
  { value: "success", label: "success" },
  { value: "failed", label: "failed" },
  { value: "running", label: "running" },
  { value: "pending", label: "pending" },
];

export function Operations() {
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");

  const params = {
    limit: 100,
    type: type === "all" ? undefined : type,
    status: status === "all" ? undefined : status,
  };

  const { data: operations = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["operations", params],
    queryFn: () => operationApi.list(params),
    refetchInterval: 5000,
  });

  const pg = usePagination(operations, 10);

  return (
    <PageTemplate
      list
      title="操作记录"
      description={`全部服务的 install / start / stop / restart / upgrade / uninstall 历史。共 ${operations.length} 条（最多 100 条）。`}
      onRefresh={() => refetch()}
      isRefreshing={isFetching}
      error={isError ? "加载操作记录失败，请确认后端服务已启动。" : null}
      filters={
        <>
          <SelectField
            className="w-[130px]"
            value={type}
            onChange={setType}
            options={OP_TYPES}
            placeholder="类型"
          />
          <SelectField
            className="w-[130px]"
            value={status}
            onChange={setStatus}
            options={OP_STATUSES}
            placeholder="状态"
          />
        </>
      }
      pagination={
        !isLoading && operations.length > 0
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
        empty="暂无操作记录。"
        columns={[
          {
            key: "id",
            title: "#",
            width: "w-[60px]",
            className: "text-text3 font-mono",
          },
          {
            key: "type",
            title: "类型",
            width: "w-[100px]",
            className: "font-medium uppercase",
          },
          {
            key: "status",
            title: "状态",
            width: "w-[90px]",
            render: (op) => (
              <Badge variant={OP_STATUS_VARIANT[op.status] || "secondary"}>
                {op.status}
              </Badge>
            ),
          },
          {
            key: "service",
            title: "服务",
            render: (op) =>
              op.service_id ? (
                <Link
                  to={`/services/${op.service_id}`}
                  className="hover:text-primary hover:underline"
                >
                  <div className="text-sm font-medium">
                    {op.service_name || `服务 #${op.service_id}`}
                  </div>
                  {op.service_code && <CodeText>{op.service_code}</CodeText>}
                </Link>
              ) : (
                <span className="text-text3">—</span>
              ),
          },
          {
            key: "detail",
            title: "详情",
            className: "max-w-[360px]",
            render: (op) => (
              <div className="truncate text-xs text-text3">
                {op.error_msg || op.output_log || op.detail || "—"}
              </div>
            ),
          },
          {
            key: "time",
            title: "时间",
            width: "w-[160px]",
            className: "text-xs text-text3",
            render: (op) => formatTime(op.started_at || op.created_at),
          },
        ]}
      />
    </PageTemplate>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { auditApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTime } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import {
  PageTemplate,
  TableStateRow,
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
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="动作" />
            </SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={targetType} onValueChange={setTargetType}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="对象" />
            </SelectTrigger>
            <SelectContent>
              {TARGETS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60px]">#</TableHead>
            <TableHead className="w-[120px]">动作</TableHead>
            <TableHead className="w-[100px]">对象</TableHead>
            <TableHead className="w-[80px]">对象ID</TableHead>
            <TableHead className="w-[100px]">操作人</TableHead>
            <TableHead>详情</TableHead>
            <TableHead className="w-[160px]">时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableStateRow colSpan={7}>加载中...</TableStateRow>
          ) : logs.length === 0 ? (
            <TableStateRow colSpan={7}>
              暂无审计记录。执行创建/启停/配置修改等写操作后会在此展示。
            </TableStateRow>
          ) : (
            pg.pageItems.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-text3 font-mono">{log.id}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {log.action}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{log.target_type || "—"}</TableCell>
                <TableCell className="font-mono text-xs text-text3">
                  {log.target_id || "—"}
                </TableCell>
                <TableCell className="text-sm">{log.operator || "system"}</TableCell>
                <TableCell className="max-w-[360px]">
                  <div className="truncate font-mono text-xs text-text3">
                    {log.detail || "—"}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-text3">
                  {formatTime(log.created_at)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </PageTemplate>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { History, RefreshCw } from "lucide-react";
import { operationApi } from "@/lib/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTime } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";

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
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> 操作记录
            </CardTitle>
            <CardDescription>
              全部服务的 install / start / stop / restart / upgrade / uninstall 历史。共{" "}
              {operations.length} 条(最多 100)。
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="类型" />
              </SelectTrigger>
              <SelectContent>
                {OP_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                {OP_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "animate-spin" : ""} /> 刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <div className="m-6 rounded-md border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
              加载失败,请确认后端服务已启动。
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead className="w-[100px]">类型</TableHead>
                  <TableHead className="w-[90px]">状态</TableHead>
                  <TableHead>服务</TableHead>
                  <TableHead>详情</TableHead>
                  <TableHead className="w-[160px]">时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : operations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      暂无操作记录。
                    </TableCell>
                  </TableRow>
                ) : (
                  pg.pageItems.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell className="text-muted-foreground">{op.id}</TableCell>
                      <TableCell className="font-medium uppercase">{op.type}</TableCell>
                      <TableCell>
                        <Badge variant={OP_STATUS_VARIANT[op.status] || "secondary"}>
                          {op.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {op.service_id ? (
                          <Link
                            to={`/services/${op.service_id}`}
                            className="hover:text-primary hover:underline"
                          >
                            <div className="text-sm font-medium">
                              {op.service_name || `服务 #${op.service_id}`}
                            </div>
                            {op.service_code && (
                              <div className="font-mono text-xs text-muted-foreground">
                                {op.service_code}
                              </div>
                            )}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[360px]">
                        <div
                          className="truncate text-xs text-muted-foreground"
                          title={op.error_msg || op.output_log || op.detail || ""}
                        >
                          {op.error_msg || op.output_log || op.detail || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatTime(op.started_at || op.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
              {!isLoading && operations.length > 0 && (
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { auditApi } from "@/lib/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTime } from "@/lib/utils";

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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> 审计日志
            </CardTitle>
            <CardDescription>
              记录成功的写操作(创建/修改/删除/启停/安装升级等)。共 {logs.length} 条(最多 100)。
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="w-[160px]">
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
              <SelectTrigger className="w-[140px]">
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
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "animate-spin" : ""} /> 刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
              加载失败,请确认后端服务已启动。
            </div>
          ) : (
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
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      暂无审计记录。执行创建/启停/配置修改等写操作后会出现在此。
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground">{log.id}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.target_type || "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.target_id || "—"}
                      </TableCell>
                      <TableCell className="text-sm">{log.operator || "system"}</TableCell>
                      <TableCell className="max-w-[360px]">
                        <div
                          className="truncate font-mono text-xs text-muted-foreground"
                          title={log.detail || ""}
                        >
                          {log.detail || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatTime(log.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Activity, FileText, Terminal, ScrollText, Package, TerminalSquare } from "lucide-react";
import { serviceApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ServiceStatusBadge } from "@/components/services/ServiceStatusBadge";
import { ServiceActions } from "@/components/services/ServiceActions";
import { ServiceConfigForm } from "@/components/services/ServiceConfigForm";
import { LogViewer } from "@/components/services/LogViewer";
import { ServiceConsole } from "@/components/services/ServiceConsole";
import { ArtifactList } from "@/components/services/ArtifactList";
import { formatTime } from "@/lib/utils";

const OP_STATUS_VARIANT = {
  success: "success",
  failed: "danger",
  running: "warning",
  pending: "secondary",
};

export function ServiceDetail() {
  const { id } = useParams();
  const numId = Number(id);
  const [activeTab, setActiveTab] = useState("overview");

  // 详情(含 service / config / runtime / alive)
  const { data: detail, isLoading } = useQuery({
    queryKey: ["service", numId],
    queryFn: () => serviceApi.get(numId),
    refetchInterval: 3000,
  });

  // 该服务的操作历史
  const { data: operations = [] } = useQuery({
    queryKey: ["service-operations", numId],
    queryFn: () => serviceApi.operations(numId, 30),
    refetchInterval: 5000,
  });

  if (isLoading) {
    return <div className="text-muted-foreground">加载中...</div>;
  }

  const svc = detail?.service;
  const cfg = detail?.config || {};
  const rt = detail?.runtime;
  const alive = detail?.alive;
  const health = detail?.health;

  if (!svc) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/services"><ArrowLeft /> 返回列表</Link>
        </Button>
        <Card><CardContent className="p-6 text-muted-foreground">服务不存在或已删除。</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-2">
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link to="/services"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold">{svc.name}</h2>
              <ServiceStatusBadge status={svc.status} />
            </div>
            <p className="truncate font-mono text-xs text-muted-foreground">{svc.code}</p>
          </div>
        </div>
        <div className="shrink-0">
          <ServiceActions service={svc} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          <TabsTrigger value="overview"><Activity className="mr-1.5 h-3.5 w-3.5" />概览</TabsTrigger>
          <TabsTrigger value="config"><FileText className="mr-1.5 h-3.5 w-3.5" />配置</TabsTrigger>
          <TabsTrigger value="version"><Package className="mr-1.5 h-3.5 w-3.5" />版本</TabsTrigger>
          <TabsTrigger value="logs"><ScrollText className="mr-1.5 h-3.5 w-3.5" />日志</TabsTrigger>
          <TabsTrigger value="console"><TerminalSquare className="mr-1.5 h-3.5 w-3.5" />控制台</TabsTrigger>
          <TabsTrigger value="operations"><Terminal className="mr-1.5 h-3.5 w-3.5" />操作记录</TabsTrigger>
        </TabsList>

        {/* 概览 */}
        <TabsContent value="overview">
          <Card>
            <CardHeader><CardTitle className="text-sm">运行信息</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
                <Field label="进程状态" value={alive ? "存活" : "未运行"} />
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">健康检查</div>
                  <div className="flex items-center gap-2 text-sm">
                    {!health?.enabled ? (
                      <span className="text-muted-foreground">未配置</span>
                    ) : health.healthy ? (
                      <Badge variant="success">健康</Badge>
                    ) : (
                      <Badge variant="danger">异常</Badge>
                    )}
                    {health?.enabled && (
                      <span className="truncate text-xs text-muted-foreground" title={health.message}>
                        {health.type?.toUpperCase()}
                        {health.latency_ms != null ? ` · ${health.latency_ms}ms` : ""}
                        {health.message && health.message !== "ok" ? ` · ${health.message}` : ""}
                      </span>
                    )}
                  </div>
                </div>
                <Field label="PID" value={svc.pid ? String(svc.pid) : "—"} mono />
                <Field label="服务类型" value={svc.type} />
                <Field label="当前版本" value={svc.current_version || "—"} />
                <Field label="启动时间" value={formatTime(svc.started_at)} />
                <Field label="创建时间" value={formatTime(svc.created_at)} />
                <Field label="工作目录" value={svc.work_dir || "—"} mono />
                <Field label="运行环境" value={rt ? `${rt.name} ${rt.version || ""}` : "—"} />
                <Field label="节点" value="local (本机)" />
                {svc.description && (
                  <div className="col-span-2 sm:col-span-3">
                    <Field label="描述" value={svc.description} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 配置(可编辑) */}
        <TabsContent value="config">
          <ServiceConfigForm service={svc} config={cfg} />
        </TabsContent>

        {/* 版本(制品) */}
        <TabsContent value="version">
          <ArtifactList service={svc} />
        </TabsContent>

        {/* 日志 */}
        <TabsContent value="logs">
          <LogViewer serviceId={svc.id} active={activeTab === "logs"} />
        </TabsContent>

        {/* 控制台(xterm.js:日志 SSE + stdin 写入) */}
        <TabsContent value="console">
          <ServiceConsole
            serviceId={svc.id}
            active={activeTab === "console"}
            running={svc.status === "running" && !!alive}
          />
        </TabsContent>

        {/* 操作记录 */}
        <TabsContent value="operations">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">#</TableHead>
                    <TableHead className="w-[90px]">类型</TableHead>
                    <TableHead className="w-[90px]">状态</TableHead>
                    <TableHead>详情</TableHead>
                    <TableHead className="w-[160px]">时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                        暂无操作记录
                      </TableCell>
                    </TableRow>
                  ) : (
                    operations.map((op) => (
                      <TableRow key={op.id}>
                        <TableCell className="text-muted-foreground">{op.id}</TableCell>
                        <TableCell className="font-medium uppercase">{op.type}</TableCell>
                        <TableCell>
                          <Badge variant={OP_STATUS_VARIANT[op.status] || "secondary"}>
                            {op.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[420px]">
                          <div className="truncate text-xs text-muted-foreground" title={op.output_log}>
                            {op.output_log || op.error_msg || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatTime(op.started_at)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Field 键值展示。
function Field({ label, value, mono }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono text-sm break-all" : "text-sm break-all"}>{value}</div>
    </div>
  );
}

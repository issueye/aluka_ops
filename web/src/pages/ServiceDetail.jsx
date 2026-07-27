import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Activity, FileText, Terminal, ScrollText, Package } from "lucide-react";
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
import { LogViewer } from "@/components/services/LogViewer";
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
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/services"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{svc.name}</h2>
              <ServiceStatusBadge status={svc.status} />
            </div>
            <p className="font-mono text-xs text-muted-foreground">{svc.code}</p>
          </div>
        </div>
        <ServiceActions service={svc} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview"><Activity className="mr-1.5 h-3.5 w-3.5" />概览</TabsTrigger>
          <TabsTrigger value="config"><FileText className="mr-1.5 h-3.5 w-3.5" />配置</TabsTrigger>
          <TabsTrigger value="version"><Package className="mr-1.5 h-3.5 w-3.5" />版本</TabsTrigger>
          <TabsTrigger value="logs"><ScrollText className="mr-1.5 h-3.5 w-3.5" />日志</TabsTrigger>
          <TabsTrigger value="operations"><Terminal className="mr-1.5 h-3.5 w-3.5" />操作记录</TabsTrigger>
        </TabsList>

        {/* 概览 */}
        <TabsContent value="overview">
          <Card>
            <CardHeader><CardTitle className="text-sm">运行信息</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
                <Field label="进程状态" value={alive ? "存活" : "未运行"} />
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

        {/* 配置 */}
        <TabsContent value="config">
          <Card>
            <CardHeader><CardTitle className="text-sm">启动配置(只读)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
                <Field label="启动命令" value={cfg.command || "—"} mono />
                <Field label="程序参数" value={cfg.args || "—"} mono />
                {svc.type === "jar" && (
                  <Field label="JVM 参数" value={cfg.jvm_args || "—"} mono />
                )}
                <Field label="端口" value={cfg.port ? String(cfg.port) : "—"} />
                <Field label="自动重启" value={cfg.auto_restart ? "是" : "否"} />
                <Field label="停止超时" value={`${cfg.shutdown_timeout || 10} 秒`} />
                {cfg.env_vars && (
                  <div className="col-span-2 sm:col-span-3">
                    <Field label="环境变量" value={cfg.env_vars} mono />
                  </div>
                )}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                配置编辑将在后续阶段(M6)提供。当前如需修改,可删除服务后重建。
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 版本(制品) */}
        <TabsContent value="version">
          <ArtifactList service={svc} />
        </TabsContent>

        {/* 日志 */}
        <TabsContent value="logs">
          <LogViewer serviceId={svc.id} active={activeTab === "logs"} />
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

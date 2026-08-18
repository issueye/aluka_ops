import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import {
  Activity,
  FileText,
  Terminal,
  ScrollText,
  Package,
  TerminalSquare,
} from "lucide-react";
import { serviceApi } from "@/lib/api";
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
import { PageShell, DetailHeader, MetaField, InlineAlert } from "@/components/ued";
import { Skeleton } from "@/components/ui/skeleton";

const OP_STATUS_VARIANT = {
  success: "success",
  failed: "danger",
  running: "warning",
  pending: "secondary",
};

const DETAIL_TABS = [
  { value: "overview", label: "概览", icon: Activity },
  { value: "config", label: "配置", icon: FileText },
  { value: "version", label: "版本", icon: Package },
  { value: "logs", label: "日志", icon: ScrollText },
  { value: "console", label: "控制台", icon: TerminalSquare },
  { value: "operations", label: "操作记录", icon: Terminal },
];

export function ServiceDetail() {
  const { id } = useParams();
  const numId = Number(id);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ["service", numId],
    queryFn: () => serviceApi.get(numId),
    refetchInterval: 3000,
  });

  const { data: operations = [] } = useQuery({
    queryKey: ["service-operations", numId],
    queryFn: () => serviceApi.operations(numId, 30),
    refetchInterval: 5000,
    enabled: !!detail?.service,
  });

  if (isLoading) {
    return (
      <PageShell>
        <div className="space-y-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-9 w-full max-w-xl" />
          <Skeleton className="h-48 w-full" />
        </div>
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell>
        <DetailHeader
          breadcrumb={[
            { label: "服务管理", to: "/services" },
            { label: "详情" },
          ]}
          title="加载失败"
        />
        <InlineAlert variant="error" title="无法加载服务详情">
          请确认后端服务已启动，或返回服务列表重试。
        </InlineAlert>
      </PageShell>
    );
  }

  const svc = detail?.service;
  const cfg = detail?.config || {};
  const rt = detail?.runtime;
  const alive = detail?.alive;
  const health = detail?.health;

  if (!svc) {
    return (
      <PageShell>
        <DetailHeader
          breadcrumb={[
            { label: "服务管理", to: "/services" },
            { label: "未知服务" },
          ]}
          title="服务不存在"
        />
        <Card>
          <CardContent className="p-6 text-sm text-text3">
            服务不存在或已删除。
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <DetailHeader
        breadcrumb={[
          { label: "服务管理", to: "/services" },
          { label: svc.name },
        ]}
        title={svc.name}
        subtitle={svc.code}
        badges={<ServiceStatusBadge status={svc.status} />}
        actions={<ServiceActions service={svc} />}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full overflow-x-auto">
          {DETAIL_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="shrink-0">
              <tab.icon className="mr-1.5 h-3.5 w-3.5" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader className="border-b border-border1 px-5 py-3.5">
              <CardTitle className="text-sm font-medium text-text1">运行信息</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
                <Field label="进程状态" value={alive ? "存活" : "未运行"} />
                <div className="space-y-1">
                  <div className="text-xs text-text3">健康检查</div>
                  <div className="flex items-center gap-2 text-sm">
                    {!health?.enabled ? (
                      <span className="text-text3">未配置</span>
                    ) : health.healthy ? (
                      <Badge variant="success">健康</Badge>
                    ) : (
                      <Badge variant="danger">异常</Badge>
                    )}
                    {health?.enabled && (
                      <span className="truncate text-xs text-text3" title={health.message}>
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

        <TabsContent value="config" className="mt-4">
          <ServiceConfigForm service={svc} config={cfg} />
        </TabsContent>

        <TabsContent value="version" className="mt-4">
          <ArtifactList service={svc} />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <LogViewer serviceId={svc.id} active={activeTab === "logs"} />
        </TabsContent>

        <TabsContent value="console" className="mt-4">
          <ServiceConsole
            serviceId={svc.id}
            active={activeTab === "console"}
            running={svc.status === "running" && !!alive}
          />
        </TabsContent>

        <TabsContent value="operations" className="mt-4">
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
                      <TableCell colSpan={5} className="h-20 text-center text-text3">
                        暂无操作记录
                      </TableCell>
                    </TableRow>
                  ) : (
                    operations.map((op) => (
                      <TableRow key={op.id}>
                        <TableCell className="text-text3">{op.id}</TableCell>
                        <TableCell className="font-medium uppercase">{op.type}</TableCell>
                        <TableCell>
                          <Badge variant={OP_STATUS_VARIANT[op.status] || "secondary"}>
                            {op.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[420px]">
                          <div className="truncate text-xs text-text3" title={op.output_log}>
                            {op.output_log || op.error_msg || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-text3">
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
    </PageShell>
  );
}

function Field({ label, value, mono }) {
  return <MetaField label={label} value={value} mono={mono} />;
}

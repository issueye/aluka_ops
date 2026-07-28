import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Boxes, RefreshCw, ExternalLink, Trash2 } from "lucide-react";
import { serviceApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ServiceStatusBadge } from "@/components/services/ServiceStatusBadge";
import { ServiceActions } from "@/components/services/ServiceActions";
import { ServiceDialog } from "@/components/services/ServiceDialog";
import { formatTime } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";

const TYPE_LABEL = { jar: "JAR", exe: "EXE", bat: "BAT", sh: "SH", ps1: "PS1" };
const PAGE_SIZE = 10;

export function Services() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const { data: services = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["services"],
    queryFn: () => serviceApi.list(),
    // 列表页每 5s 轮询一次,让状态徽章相对实时(状态采集后端按需,前端轮询驱动刷新)
    refetchInterval: 5000,
  });

  const pg = usePagination(services, PAGE_SIZE);

  const deleteMut = useMutation({
    mutationFn: (id) => serviceApi.remove(id),
    onSuccess: () => {
      toast.success("已删除服务");
      queryClient.invalidateQueries({ queryKey: ["services"] });
      setDeleting(null);
    },
    onError: (e) => toast.error(`删除失败: ${e.message}`),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Boxes className="h-4 w-4" /> 服务列表
            </CardTitle>
            <CardDescription>
              管理服务进程的启动、停止与重启。共 {services.length} 个服务。
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "animate-spin" : ""} /> 刷新
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus /> 新建服务
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
                    <TableHead className="w-[110px]">状态</TableHead>
                    <TableHead>名称 / 编码</TableHead>
                    <TableHead className="w-[70px]">类型</TableHead>
                    <TableHead className="w-[90px]">PID</TableHead>
                    <TableHead className="w-[150px]">启动时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        加载中...
                      </TableCell>
                    </TableRow>
                  ) : services.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        暂无服务,点击右上角"新建服务"创建。
                      </TableCell>
                    </TableRow>
                  ) : (
                    pg.pageItems.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <ServiceStatusBadge status={s.status} />
                        </TableCell>
                        <TableCell>
                          <Link to={`/services/${s.id}`} className="font-medium hover:text-primary hover:underline">
                            {s.name}
                          </Link>
                          <div className="font-mono text-xs text-muted-foreground">{s.code}</div>
                        </TableCell>
                        <TableCell>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                            {TYPE_LABEL[s.type] || s.type}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {s.pid ? s.pid : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatTime(s.started_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <ServiceActions service={s} compact />
                            <Button variant="ghost" size="icon" asChild title="详情">
                              <Link to={`/services/${s.id}`}>
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-400 hover:text-red-300"
                              disabled={s.status === "running"}
                              onClick={() => setDeleting(s)}
                              title={s.status === "running" ? "运行中不可删除" : "删除"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {!isLoading && services.length > 0 && (
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

      {/* 新建对话框 */}
      <ServiceDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      {/* 删除确认 */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除服务?</AlertDialogTitle>
            <AlertDialogDescription>
              将删除「<span className="font-medium text-foreground">{deleting?.name}</span>
              」及其配置。该操作不可撤销(日志文件保留在磁盘上)。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteMut.mutate(deleting.id);
              }}
            >
              {deleteMut.isPending ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

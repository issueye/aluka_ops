import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Boxes, ExternalLink, Trash2 } from "lucide-react";
import { serviceApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ServiceStatusBadge } from "@/components/services/ServiceStatusBadge";
import { ServiceActions } from "@/components/services/ServiceActions";
import { ServiceDialog } from "@/components/services/ServiceDialog";
import { formatTime } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import {
  PageTemplate,
  CodeText,
  ConfirmDialog,
  IconTooltip,
  RowActions,
  TableStateRow,
  TypeChip,
} from "@/components/ued";

const TYPE_LABEL = { jar: "JAR", exe: "EXE", bat: "BAT", sh: "SH", ps1: "PS1" };
const PAGE_SIZE = 10;

export function Services() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const { data: services = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["services"],
    queryFn: () => serviceApi.list(),
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
    <PageTemplate
      card
      cardIcon={Boxes}
      cardTitle="服务列表"
      cardDescription={`管理服务进程的启动、停止与重启。共 ${services.length} 个服务。`}
      onRefresh={() => refetch()}
      isRefreshing={isFetching}
      error={isError ? "加载服务列表失败，请确认后端服务已启动。" : null}
      cardActions={
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> 新建服务
        </Button>
      }
      pagination={
        !isLoading && services.length > 0
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
            <TableStateRow colSpan={6}>加载中...</TableStateRow>
          ) : services.length === 0 ? (
            <TableStateRow colSpan={6}>暂无服务，点击右上角「新建服务」创建。</TableStateRow>
          ) : (
            pg.pageItems.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <ServiceStatusBadge status={s.status} />
                </TableCell>
                <TableCell>
                  <Link
                    to={`/services/${s.id}`}
                    className="font-medium hover:text-primary hover:underline"
                  >
                    {s.name}
                  </Link>
                  <div>
                    <CodeText>{s.code}</CodeText>
                  </div>
                </TableCell>
                <TableCell>
                  <TypeChip>{TYPE_LABEL[s.type] || s.type}</TypeChip>
                </TableCell>
                <TableCell>
                  <CodeText>{s.pid ? s.pid : "—"}</CodeText>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatTime(s.started_at)}
                </TableCell>
                <TableCell>
                  <RowActions>
                    <ServiceActions service={s} compact />
                    <IconTooltip label="详情">
                      <Button variant="ghost" size="icon" asChild aria-label="详情">
                        <Link to={`/services/${s.id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    </IconTooltip>
                    <IconTooltip label={s.status === "running" ? "运行中不可删除" : "删除"}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        disabled={s.status === "running"}
                        onClick={() => setDeleting(s)}
                        aria-label="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </IconTooltip>
                  </RowActions>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <ServiceDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="确认删除服务?"
        description={
          deleting ? (
            <>
              将删除「
              <span className="font-medium text-foreground">{deleting.name}</span>
              」及其配置。该操作不可撤销(日志文件保留在磁盘上)。
            </>
          ) : null
        }
        confirmText="删除"
        loading={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate(deleting.id)}
      />
    </PageTemplate>
  );
}

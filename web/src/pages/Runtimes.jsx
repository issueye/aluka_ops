import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Star, Cpu, Search, CheckCircle2 } from "lucide-react";
import { runtimeApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RuntimeDialog } from "@/components/runtimes/RuntimeDialog";
import { formatTime } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import {
  PageShell,
  DataTableCard,
  TableStateRow,
  InlineAlert,
  RefreshButton,
  ConfirmDialog,
  TypeChip,
  RowActions,
  IconTooltip,
  PathText,
} from "@/components/ued";

const TYPE_TONE = { jdk: "jdk", node: "node", python: "python", go: "go" };
const TYPE_LABEL = { jdk: "JDK", node: "Node", python: "Python", go: "Go" };

export function Runtimes() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null=新建, 对象=编辑
  const [deleting, setDeleting] = useState(null);
  const [detectOpen, setDetectOpen] = useState(false);
  const [detected, setDetected] = useState([]);

  const { data: runtimes = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["runtimes"],
    queryFn: runtimeApi.list,
  });

  const pg = usePagination(runtimes, 10);

  const deleteMutation = useMutation({
    mutationFn: (id) => runtimeApi.remove(id),
    onSuccess: () => {
      toast.success("已删除运行环境");
      queryClient.invalidateQueries({ queryKey: ["runtimes"] });
      setDeleting(null);
    },
    onError: (e) => toast.error(`删除失败: ${e.message}`),
  });

  const detectMutation = useMutation({
    mutationFn: () => runtimeApi.detect(),
    onSuccess: (items) => {
      setDetected(items || []);
      setDetectOpen(true);
      if (!items?.length) toast.message("未探测到本机 JDK");
    },
    onError: (e) => toast.error(`探测失败: ${e.message}`),
  });

  const registerMutation = useMutation({
    mutationFn: (item) =>
      runtimeApi.create({
        name: item.name || `JDK ${item.version || ""}`.trim(),
        type: "jdk",
        version: item.version || "",
        install_path: item.install_path,
        is_default: false,
        env_template: JSON.stringify({
          JAVA_HOME: "{{install_path}}",
          PATH: "{{install_path}}\\bin;{{PATH}}",
        }),
        description: `本机探测(${item.source})`,
      }),
    onSuccess: () => {
      toast.success("已登记运行环境");
      queryClient.invalidateQueries({ queryKey: ["runtimes"] });
      // 刷新探测列表中的 registered 状态
      detectMutation.mutate();
    },
    onError: (e) => toast.error(`登记失败: ${e.message}`),
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (rt) => {
    setEditing(rt);
    setDialogOpen(true);
  };

  return (
    <PageShell>
      <DataTableCard
        icon={Cpu}
        title="运行环境列表"
        description="管理服务可绑定的运行环境(如 JDK)。每个类型仅可有一个默认环境。"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => detectMutation.mutate()}
              disabled={detectMutation.isPending}
            >
              <Search className={detectMutation.isPending ? "animate-pulse" : ""} /> 探测本机 JDK
            </Button>
            <RefreshButton onClick={() => refetch()} loading={isFetching} />
            <Button size="sm" onClick={openCreate}>
              <Plus /> 新增环境
            </Button>
          </>
        }
        pagination={
          !isLoading && runtimes.length > 0
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
        {isError ? (
          <div className="m-6">
            <InlineAlert variant="error">加载失败,请确认后端服务已启动。</InlineAlert>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">默认</TableHead>
                <TableHead>名称</TableHead>
                <TableHead className="w-[100px]">类型</TableHead>
                <TableHead className="w-[120px]">版本</TableHead>
                <TableHead>安装路径</TableHead>
                <TableHead className="w-[160px]">创建时间</TableHead>
                <TableHead className="w-[120px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableStateRow colSpan={7}>加载中...</TableStateRow>
              ) : runtimes.length === 0 ? (
                <TableStateRow colSpan={7}>
                  暂无运行环境,点击右上角&quot;新增环境&quot;创建。
                </TableStateRow>
              ) : (
                pg.pageItems.map((rt) => (
                  <TableRow key={rt.id}>
                    <TableCell>
                      {rt.is_default ? (
                        <Star className="h-4 w-4 fill-warning text-warning" />
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {rt.name}
                      {rt.description && (
                        <div className="line-clamp-1 text-xs font-normal text-muted-foreground">
                          {rt.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <TypeChip tone={TYPE_TONE[rt.type] || "muted"}>
                        {TYPE_LABEL[rt.type] || rt.type}
                      </TypeChip>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {rt.version || "—"}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate">
                      <PathText>{rt.install_path || "—"}</PathText>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTime(rt.created_at)}
                    </TableCell>
                    <TableCell>
                      <RowActions>
                        <IconTooltip label="编辑">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(rt)}
                            aria-label="编辑"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </IconTooltip>
                        <IconTooltip label="删除">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleting(rt)}
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
        )}
      </DataTableCard>

      <RuntimeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="确认删除运行环境?"
        description={
          deleting ? (
            <>
              将删除「
              <span className="font-medium text-foreground">{deleting.name}</span>
              」(版本 {deleting.version || "—"})。若该环境正被服务引用,可能影响启动,请谨慎操作。
            </>
          ) : null
        }
        confirmText="删除"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(deleting.id)}
      />

      {/* 本机 JDK 探测结果 */}
      <Dialog open={detectOpen} onOpenChange={setDetectOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>本机 JDK 探测结果</DialogTitle>
            <DialogDescription>
              扫描 JAVA_HOME、PATH 与常见安装目录。可一键登记未注册的环境。
            </DialogDescription>
          </DialogHeader>
          {detected.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">未发现可用 JDK</p>
          ) : (
            <div className="max-h-[400px] space-y-2 overflow-y-auto">
              {detected.map((item, idx) => (
                <div
                  key={`${item.install_path}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {item.source}
                      </Badge>
                      {item.registered && (
                        <Badge variant="success" className="gap-1 text-xs">
                          <CheckCircle2 className="h-3 w-3" /> 已登记
                        </Badge>
                      )}
                    </div>
                    <div className="truncate">
                      <PathText>
                        {item.version ? `v${item.version} · ` : ""}
                        {item.install_path}
                      </PathText>
                    </div>
                  </div>
                  {!item.registered && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={registerMutation.isPending}
                      onClick={() => registerMutation.mutate(item)}
                    >
                      登记
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

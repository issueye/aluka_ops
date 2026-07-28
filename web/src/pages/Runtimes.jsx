import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Star, Cpu, RefreshCw, Search, CheckCircle2 } from "lucide-react";
import { runtimeApi } from "@/lib/api";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RuntimeDialog } from "@/components/runtimes/RuntimeDialog";
import { formatTime } from "@/lib/utils";

// 运行环境类型标签映射。
const TYPE_META = {
  jdk:    { label: "JDK",    color: "bg-orange-500/15 text-orange-400" },
  node:   { label: "Node",   color: "bg-green-500/15 text-green-400" },
  python: { label: "Python", color: "bg-blue-500/15 text-blue-400" },
  go:     { label: "Go",     color: "bg-cyan-500/15 text-cyan-400" },
};

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
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-4 w-4" /> 运行环境列表
            </CardTitle>
            <CardDescription>
              管理服务可绑定的运行环境(如 JDK)。每个类型仅可有一个默认环境。
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => detectMutation.mutate()}
              disabled={detectMutation.isPending}
            >
              <Search className={detectMutation.isPending ? "animate-pulse" : ""} /> 探测本机 JDK
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "animate-spin" : ""} /> 刷新
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus /> 新增环境
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
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : runtimes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      暂无运行环境,点击右上角"新增环境"创建。
                    </TableCell>
                  </TableRow>
                ) : (
                  runtimes.map((rt) => {
                    const tm = TYPE_META[rt.type] || { label: rt.type, color: "bg-muted text-muted-foreground" };
                    return (
                      <TableRow key={rt.id}>
                        <TableCell>
                          {rt.is_default ? (
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {rt.name}
                          {rt.description && (
                            <div className="text-xs font-normal text-muted-foreground line-clamp-1">
                              {rt.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${tm.color}`}>
                            {tm.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {rt.version || "—"}
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate font-mono text-xs text-muted-foreground" title={rt.install_path}>
                          {rt.install_path || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatTime(rt.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(rt)} title="编辑">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-400 hover:text-red-300"
                              onClick={() => setDeleting(rt)}
                              title="删除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 新增/编辑对话框 */}
      <RuntimeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />

      {/* 删除确认 */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除运行环境?</AlertDialogTitle>
            <AlertDialogDescription>
              将删除「<span className="font-medium text-foreground">{deleting?.name}</span>
              」(版本 {deleting?.version || "—"})。若该环境正被服务引用,可能影响启动,请谨慎操作。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate(deleting.id);
              }}
            >
              {deleteMutation.isPending ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                    <div className="truncate font-mono text-xs text-muted-foreground" title={item.install_path}>
                      {item.version ? `v${item.version} · ` : ""}
                      {item.install_path}
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
    </div>
  );
}

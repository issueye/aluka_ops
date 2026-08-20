import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Star,
  Download,
  Trash2,
  PackagePlus,
  PackageX,
  RefreshCw,
  CheckCircle2,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";
import { artifactApi, serviceApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { ArtifactUpload } from "./ArtifactUpload";
import { formatTime } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import { IconTooltip, InfoHint, RowActions } from "@/components/ued";

// ArtifactList 服务制品列表 + 安装/卸载/上传/删除/下载。
export function ArtifactList({ service }) {
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [installing, setInstalling] = useState(null); // 待安装确认
  const [switching, setSwitching] = useState(null); // 待切换版本确认(升级/回滚)
  const [uninstallOpen, setUninstallOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const sid = service.id;

  const { data: artifacts = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["artifacts", sid],
    queryFn: () => artifactApi.list(sid),
  });
  const pg = usePagination(artifacts, 10);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["artifacts", sid] });
    queryClient.invalidateQueries({ queryKey: ["service", sid] });
    queryClient.invalidateQueries({ queryKey: ["services"] });
    queryClient.invalidateQueries({ queryKey: ["operations"] });
  };

  // 安装
  const installMut = useMutation({
    mutationFn: (aid) => serviceApi.install(sid, aid),
    onSuccess: (data) => {
      toast.success(`已安装 v${installing?.version}`);
      invalidateAll();
      setInstalling(null);
      if (data?.operation && data.operation.status !== "success") {
        toast.error(data.operation.error_msg || "安装未成功");
      }
    },
    onError: (e) => toast.error(`安装失败: ${e.message}`),
  });

  // 切换版本(升级/回滚)。动作类型由 switching.action 决定。
  const switchMut = useMutation({
    mutationFn: ({ aid, action }) =>
      action === "upgrade"
        ? serviceApi.upgrade(sid, aid)
        : serviceApi.rollback(sid, aid),
    onSuccess: (data) => {
      const op = data?.operation;
      if (op && op.status === "success") {
        toast.success(`已${switching?.action === "upgrade" ? "升级" : "回滚"}到 v${switching?.version}`);
      } else if (op) {
        toast.error(`部署失败,已自动回滚: ${op.error_msg || "未知错误"}`);
      }
      invalidateAll();
      setSwitching(null);
    },
    onError: (e) => toast.error(`操作失败: ${e.message}`),
  });

  // 判断点击某历史版本时是"升级"还是"回滚":
  // 简单按版本号字符串比较(语义化版本通常可直接比较);无法比较时默认"切换"。
  const classifySwitch = (artifact) => {
    const cur = service.current_version;
    if (!cur) return "upgrade";
    if (artifact.version === cur) return null; // 当前版本,不显示按钮
    // 简单字典序比较(对 x.y.z 形式多数情况成立)
    return artifact.version > cur ? "upgrade" : "rollback";
  };

  // 卸载
  const uninstallMut = useMutation({
    mutationFn: () => serviceApi.uninstall(sid, false),
    onSuccess: () => {
      toast.success("已卸载");
      invalidateAll();
      setUninstallOpen(false);
    },
    onError: (e) => toast.error(`卸载失败: ${e.message}`),
  });

  // 删除制品
  const deleteMut = useMutation({
    mutationFn: (aid) => artifactApi.remove(sid, aid),
    onSuccess: () => {
      toast.success("已删除制品");
      queryClient.invalidateQueries({ queryKey: ["artifacts", sid] });
      setDeleting(null);
    },
    onError: (e) => toast.error(`删除失败: ${e.message}`),
  });

  const hasCurrent = artifacts.some((a) => a.is_current);

  const fmtSize = (n) => {
    if (!n) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <PackagePlus className="h-4 w-4" /> 制品与版本
            <InfoHint
              label={`上传制品并安装到部署目录。当前版本:${service.current_version || "未安装"} · 安装目录:${service.install_dir || "—"}`}
            />
          </CardTitle>
          <div className="flex gap-2">
            {hasCurrent && (
              <Button
                variant="outline"
                size="sm"
                className="text-danger hover:text-danger"
                onClick={() => setUninstallOpen(true)}
              >
                <PackageX /> 卸载
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "animate-spin" : ""} /> 刷新
            </Button>
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Plus /> 上传制品
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <colgroup>
              <col style={{ width: 60 }} />
              <col />
              <col style={{ width: "28%" }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 150 }} />
              <col />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>当前</TableHead>
                <TableHead>版本</TableHead>
                <TableHead>文件名</TableHead>
                <TableHead>大小</TableHead>
                <TableHead>上传时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center text-text3">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : artifacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center text-text3">
                    暂无制品,点击右上角"上传制品"。
                  </TableCell>
                </TableRow>
              ) : (
                pg.pageItems.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      {a.is_current ? (
                        <Star className="h-4 w-4 fill-amber-400 text-warning" />
                      ) : (
                        <span className="text-text3/30">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      v{a.version}
                      {a.description && (
                        <div className="text-xs font-normal text-text3 line-clamp-1">
                          {a.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate font-mono text-xs text-text3" title={a.filename}>
                      {a.filename}
                    </TableCell>
                    <TableCell className="text-xs text-text3">{fmtSize(a.size)}</TableCell>
                    <TableCell className="text-xs text-text3">{formatTime(a.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {a.is_current ? (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> 已安装
                          </Badge>
                        ) : hasCurrent ? (
                          // 已有当前版本:显示升级或回滚
                          (() => {
                            const action = classifySwitch(a);
                            if (!action) return null;
                            const isUpgrade = action === "upgrade";
                            return (
                              <Button
                                variant={isUpgrade ? "default" : "outline"}
                                size="sm"
                                className="gap-1.5"
                                disabled={switchMut.isPending}
                                onClick={() => setSwitching({ ...a, action })}
                                aria-label={isUpgrade ? "升级到此版本" : "回滚到此版本"}
                              >
                                {isUpgrade ? <ArrowUpCircle className="h-3.5 w-3.5" /> : <ArrowDownCircle className="h-3.5 w-3.5" />}
                                {isUpgrade ? "升级" : "回滚"}
                              </Button>
                            );
                          })()
                        ) : (
                          // 无当前版本:首次安装
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={installMut.isPending}
                            onClick={() => setInstalling(a)}
                          >
                            安装
                          </Button>
                        )}
                        <IconTooltip label="下载">
                          <Button variant="ghost" size="icon" asChild aria-label="下载">
                            <a href={artifactApi.downloadURL(sid, a.id)} download>
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        </IconTooltip>
                        {!a.is_current && (
                          <IconTooltip label="删除">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-danger hover:text-danger"
                              onClick={() => setDeleting(a)}
                              aria-label="删除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </IconTooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {!isLoading && artifacts.length > 0 && (
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
        </CardContent>
      </Card>

      {/* 上传对话框 */}
      <ArtifactUpload open={uploadOpen} onOpenChange={setUploadOpen} serviceId={sid} />

      {/* 安装确认 */}
      <AlertDialog open={!!installing} onOpenChange={(o) => !o && setInstalling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认安装 v{installing?.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              将部署「<span className="font-medium text-text1">{installing?.filename}</span>
              」到安装目录。{service.status === "running" && " 服务正在运行,安装前会先停止。"}
              {installing && !installing.is_current && hasCurrent && " 这将替换当前已安装的版本。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={installMut.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={installMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                installMut.mutate(installing.id);
              }}
            >
              {installMut.isPending ? "安装中..." : "确认安装"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 切换版本(升级/回滚)确认 */}
      <AlertDialog open={!!switching} onOpenChange={(o) => !o && setSwitching(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              确认{switching?.action === "upgrade" ? "升级" : "回滚"}到 v{switching?.version}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              将部署「<span className="font-medium text-text1">{switching?.filename}</span>
              」替换当前版本 v{service.current_version}。
              {service.status === "running" && " 服务正在运行,操作前会先停止。"}
              若部署失败,系统会自动回滚到当前版本(当前版本不受影响)。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={switchMut.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={switchMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                switchMut.mutate({ aid: switching.id, action: switching.action });
              }}
            >
              {switchMut.isPending ? "部署中..." : `确认${switching?.action === "upgrade" ? "升级" : "回滚"}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 卸载确认 */}
      <AlertDialog open={uninstallOpen} onOpenChange={setUninstallOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认卸载?</AlertDialogTitle>
            <AlertDialogDescription>
              将停止服务并清理安装目录,重置当前版本。该操作不可撤销(制品记录保留,可重新安装)。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={uninstallMut.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-foreground hover:bg-danger"
              disabled={uninstallMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                uninstallMut.mutate();
              }}
            >
              {uninstallMut.isPending ? "卸载中..." : "确认卸载"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除制品确认 */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除制品?</AlertDialogTitle>
            <AlertDialogDescription>
              将删除「<span className="font-medium text-text1">v{deleting?.version}</span>
              」的制品文件与记录。该操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-foreground hover:bg-danger"
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

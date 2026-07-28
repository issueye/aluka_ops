import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Power,
  PowerOff,
  Globe,
  ExternalLink,
  FolderTree,
  ArrowRightLeft,
  ScrollText,
  ChevronRight,
} from "lucide-react";
import { gatewayApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const EMPTY = {
  port: 18090,
  name: "",
  enabled: true,
  description: "",
  ip_whitelist: "",
  ip_blacklist: "",
};

export function Sites() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["gateway-ports"],
    queryFn: gatewayApi.listPorts,
    refetchInterval: 10000,
  });

  const sites = data?.items || [];
  const runtime = data?.runtime || [];
  const listening = useMemo(
    () => new Set((runtime || []).map((r) => r.port)),
    [runtime]
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["gateway-ports"] });
    qc.invalidateQueries({ queryKey: ["gateway-apps"] });
  };

  const saveMut = useMutation({
    mutationFn: (body) =>
      editing
        ? gatewayApi.updatePort(editing.id, body)
        : gatewayApi.createPort(body),
    onSuccess: () => {
      toast.success(editing ? "站点已更新" : "站点已创建");
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: ({ id, force }) => gatewayApi.removePort(id, force),
    onSuccess: () => {
      toast.success("站点已删除");
      setDeleting(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY, name: `站点 ${EMPTY.port}` });
    setOpen(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({
      port: s.port,
      name: s.name,
      enabled: !!s.enabled,
      description: s.description || "",
      ip_whitelist: s.ip_whitelist || "",
      ip_blacklist: s.ip_blacklist || "",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4" /> 站点管理
              </CardTitle>
              <CardDescription>
                每个站点对应一个动态监听端口；进入站点后管理 APP（静态）、反代规则与路由脚本。
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                刷新
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  gatewayApi
                    .reload()
                    .then(() => {
                      toast.success("已重载监听");
                      invalidate();
                    })
                    .catch((e) => toast.error(e.message))
                }
              >
                重载监听
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                新建站点
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {runtime.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                当前无 LISTEN（启用站点并添加 APP/反代/脚本后生效）
              </span>
            ) : (
              runtime.map((r) => (
                <Badge key={r.port} variant="secondary" className="font-mono">
                  :{r.port} · {r.rule_count || 0} 规则
                  {r.script_count ? ` · ${r.script_count} 脚本` : ""}
                </Badge>
              ))
            )}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>站点</TableHead>
                  <TableHead>端口</TableHead>
                  <TableHead>APP</TableHead>
                  <TableHead>反代</TableHead>
                  <TableHead>脚本</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      加载中…
                    </TableCell>
                  </TableRow>
                ) : sites.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      暂无站点。先新建站点（监听端口），再进入站点配置 APP 与反代。
                    </TableCell>
                  </TableRow>
                ) : (
                  sites.map((s) => {
                    const appN = (s.apps || []).length;
                    const pxN = (s.proxies || []).length;
                    const scN = (s.scripts || []).length;
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <Link
                            to={`/sites/${s.id}`}
                            className="font-medium hover:text-primary hover:underline"
                          >
                            {s.name}
                          </Link>
                          {s.description && (
                            <div className="text-[11px] text-muted-foreground line-clamp-1">
                              {s.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono">
                          :{s.port}
                          {s.enabled && listening.has(s.port) && (
                            <span className="ml-1 text-[10px] text-emerald-400">LISTEN</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-xs">
                            <FolderTree className="h-3 w-3" /> {appN}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-xs">
                            <ArrowRightLeft className="h-3 w-3" /> {pxN}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-xs">
                            <ScrollText className="h-3 w-3" /> {scN}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={s.enabled ? "success" : "secondary"}>
                              {s.enabled ? "启用" : "停用"}
                            </Badge>
                            {s.ip_whitelist?.trim() && (
                              <Badge variant="outline" className="text-[10px]">
                                白名单
                              </Badge>
                            )}
                            {s.ip_blacklist?.trim() && (
                              <Badge variant="outline" className="text-[10px] text-red-400">
                                黑名单
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="进入站点">
                              <Link to={`/sites/${s.id}`}>
                                <ChevronRight className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="打开"
                              asChild
                            >
                              <a
                                href={`http://127.0.0.1:${s.port}/`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={s.enabled ? "停用" : "启用"}
                              onClick={() => {
                                gatewayApi
                                  .updatePort(s.id, { enabled: !s.enabled })
                                  .then(() => {
                                    toast.success(s.enabled ? "已停用" : "已启用");
                                    invalidate();
                                  })
                                  .catch((err) => toast.error(err.message));
                              }}
                            >
                              {s.enabled ? (
                                <PowerOff className="h-3.5 w-3.5" />
                              ) : (
                                <Power className="h-3.5 w-3.5 text-emerald-400" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(s)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-400"
                              onClick={() => setDeleting(s)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑站点" : "新建站点"}</DialogTitle>
            <DialogDescription>
              站点绑定一个监听端口；创建后进入站点配置 APP 与反代。端口号创建后不可改。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>监听端口</Label>
              <Input
                type="number"
                className="font-mono"
                disabled={!!editing}
                value={form.port}
                onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>站点名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例如 官网 / 管理后台"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>启用</Label>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>IP 白名单</Label>
              <Textarea
                rows={3}
                className="font-mono text-xs"
                placeholder={"留空=不限制\n每行一个 IP 或 CIDR\n例: 10.0.0.0/8\n192.168.1.1"}
                value={form.ip_whitelist}
                onChange={(e) => setForm((f) => ({ ...f, ip_whitelist: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">
                非空时仅允许列表内访问；黑名单优先于白名单。
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>IP 黑名单</Label>
              <Textarea
                rows={3}
                className="font-mono text-xs"
                placeholder={"例: 1.2.3.4\n203.0.113.0/24"}
                value={form.ip_blacklist}
                onChange={(e) => setForm((f) => ({ ...f, ip_blacklist: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>备注</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              disabled={saveMut.isPending}
              onClick={() => {
                if (editing) {
                  saveMut.mutate({
                    name: form.name,
                    enabled: form.enabled,
                    description: form.description,
                    ip_whitelist: form.ip_whitelist,
                    ip_blacklist: form.ip_blacklist,
                  });
                } else {
                  saveMut.mutate({
                    port: Number(form.port),
                    name: form.name,
                    enabled: form.enabled,
                    description: form.description,
                    ip_whitelist: form.ip_whitelist,
                    ip_blacklist: form.ip_blacklist,
                  });
                }
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除站点 :{deleting?.port}？</AlertDialogTitle>
            <AlertDialogDescription>
              将级联删除该站点下的 APP、反代与路由脚本（静态文件不会自动删除）。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => delMut.mutate({ id: deleting.id, force: true })}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

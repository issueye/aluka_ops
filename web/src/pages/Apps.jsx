import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  AppWindow,
  ExternalLink,
  FolderOpen,
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
  code: "",
  name: "",
  description: "",
  enabled: true,
  port_id: 0,
  path_prefix: "/",
  strip_prefix: true,
  root_dir: "",
  spa_fallback: true,
};

export function Apps() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState(null);

  const { data: portData } = useQuery({
    queryKey: ["gateway-ports"],
    queryFn: gatewayApi.listPorts,
  });
  const ports = portData?.items || [];
  const runtime = portData?.runtime || [];
  const listening = new Set((runtime || []).map((r) => r.port));

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["gateway-apps"],
    queryFn: gatewayApi.listApps,
    refetchInterval: 10000,
  });
  const apps = data?.items || [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["gateway-apps"] });
    qc.invalidateQueries({ queryKey: ["gateway-ports"] });
  };

  const saveMut = useMutation({
    mutationFn: (body) =>
      editing ? gatewayApi.updateApp(editing.id, body) : gatewayApi.createApp(body),
    onSuccess: () => {
      toast.success(editing ? "APP 已更新" : "APP 已创建");
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id) => gatewayApi.removeApp(id),
    onSuccess: () => {
      toast.success("已删除");
      setDeleting(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY,
      port_id: ports[0]?.id || 0,
      code: "webapp",
      name: "前端应用",
      root_dir: "apps/webapp",
    });
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      description: row.description || "",
      enabled: !!row.enabled,
      port_id: row.port_id,
      path_prefix: row.path_prefix || "/",
      strip_prefix: row.strip_prefix !== false,
      root_dir: row.root_dir || "",
      spa_fallback: row.spa_fallback !== false,
    });
    setOpen(true);
  };

  const accessUrl = (app) => {
    const port = app.port?.port;
    if (!port) return "";
    const prefix = app.path_prefix === "/" ? "" : app.path_prefix || "";
    return `http://127.0.0.1:${port}${prefix}/`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <AppWindow className="h-4 w-4" /> APP 管理
              </CardTitle>
              <CardDescription>
                以应用方式管理前端静态页面：绑定代理端口、访问路径、静态目录（SPA）。反代请到「代理端口」页配置。
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                刷新
              </Button>
              <Button size="sm" onClick={openCreate} disabled={ports.length === 0}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                新建 APP
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {ports.length === 0 && (
            <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
              请先在「代理端口」中创建监听端口，再创建 APP。
            </div>
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>应用</TableHead>
                  <TableHead>端口</TableHead>
                  <TableHead>路径</TableHead>
                  <TableHead>静态目录</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">加载中…</TableCell>
                  </TableRow>
                ) : apps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      暂无 APP。创建后可将构建产物放到 root_dir（默认 data/apps/&lt;code&gt;）。
                    </TableCell>
                  </TableRow>
                ) : (
                  apps.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell>
                        <div className="font-medium">{app.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{app.code}</div>
                      </TableCell>
                      <TableCell className="font-mono">
                        :{app.port?.port ?? "—"}
                        {app.enabled && app.port?.enabled && listening.has(app.port.port) && (
                          <span className="ml-1 text-[10px] text-emerald-400">LISTEN</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{app.path_prefix}</TableCell>
                      <TableCell className="max-w-[200px] truncate font-mono text-xs" title={app.root_dir}>
                        <span className="inline-flex items-center gap-1">
                          <FolderOpen className="h-3 w-3 shrink-0" />
                          {app.root_dir || `apps/${app.code}`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={app.enabled ? "success" : "secondary"}>
                          {app.enabled ? "启用" : "停用"}
                        </Badge>
                        {app.spa_fallback && (
                          <Badge variant="outline" className="ml-1">
                            SPA
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {accessUrl(app) && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                              <a href={accessUrl(app)} target="_blank" rel="noreferrer" title="打开">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(app)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400"
                            onClick={() => setDeleting(app)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            部署静态资源：把前端 build 产物放到 APP 的 root_dir；也可用「文件管理」上传到 data/apps/…
          </p>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑 APP" : "新建 APP"}</DialogTitle>
            <DialogDescription>静态前端应用：端口 + 路径 + 目录</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>编码</Label>
              <Input
                className="font-mono"
                disabled={!!editing}
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>代理端口</Label>
              <select
                className="flex h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.port_id}
                onChange={(e) => setForm((f) => ({ ...f, port_id: Number(e.target.value) }))}
              >
                {ports.map((p) => (
                  <option key={p.id} value={p.id}>
                    :{p.port} {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>访问路径</Label>
              <Input
                className="font-mono"
                value={form.path_prefix}
                onChange={(e) => setForm((f) => ({ ...f, path_prefix: e.target.value }))}
                placeholder="/"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>静态目录 root_dir</Label>
              <Input
                className="font-mono"
                value={form.root_dir}
                onChange={(e) => setForm((f) => ({ ...f, root_dir: e.target.value }))}
                placeholder="apps/webapp 或绝对路径"
              />
              <p className="text-[11px] text-muted-foreground">
                相对路径相对于 data 目录；空则默认 apps/&lt;code&gt;
              </p>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>去掉路径前缀</Label>
              <Switch
                checked={form.strip_prefix}
                onCheckedChange={(v) => setForm((f) => ({ ...f, strip_prefix: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>SPA fallback</Label>
              <Switch
                checked={form.spa_fallback}
                onCheckedChange={(v) => setForm((f) => ({ ...f, spa_fallback: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2 sm:col-span-2">
              <Label>启用</Label>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>备注</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button
              disabled={saveMut.isPending || !form.port_id}
              onClick={() => {
                const body = {
                  name: form.name,
                  description: form.description,
                  enabled: form.enabled,
                  port_id: Number(form.port_id),
                  path_prefix: form.path_prefix,
                  strip_prefix: form.strip_prefix,
                  root_dir: form.root_dir,
                  spa_fallback: form.spa_fallback,
                };
                if (!editing) body.code = form.code;
                saveMut.mutate(body);
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
            <AlertDialogTitle>删除 APP {deleting?.code}？</AlertDialogTitle>
            <AlertDialogDescription>仅删除配置，不会删除磁盘上的静态文件。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => delMut.mutate(deleting.id)}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

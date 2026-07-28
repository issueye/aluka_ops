import { useMemo, useState } from "react";
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
  FolderTree,
  ArrowRightLeft,
  Server,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY = {
  name: "",
  code: "",
  type: "proxy",
  enabled: true,
  listen_port: 18090,
  path_prefix: "/",
  strip_prefix: true,
  root_dir: "",
  spa_fallback: true,
  upstream: "http://127.0.0.1:8080",
  connect_timeout_sec: 10,
  response_header_timeout_sec: 60,
  io_timeout_sec: 0,
  max_body_bytes: 0,
  pass_host: false,
  enable_websocket: true,
  description: "",
  sort: 0,
};

function formatBytes(n) {
  if (!n) return "不限制";
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB"];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < u.length - 1);
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

export function Gateway() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["gateway-rules"],
    queryFn: gatewayApi.list,
    refetchInterval: 10000,
  });

  const items = data?.items || [];
  const runtime = data?.runtime || [];

  const listeningPorts = useMemo(() => {
    const s = new Set((runtime || []).map((r) => r.port));
    return s;
  }, [runtime]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["gateway-rules"] });

  const saveMut = useMutation({
    mutationFn: (payload) =>
      editing ? gatewayApi.update(editing.id, payload) : gatewayApi.create(payload),
    onSuccess: () => {
      toast.success(editing ? "规则已更新" : "规则已创建");
      setOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id) => gatewayApi.remove(id),
    onSuccess: () => {
      toast.success("已删除");
      setDeleting(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }) =>
      enabled ? gatewayApi.disable(id) : gatewayApi.enable(id),
    onSuccess: (_, v) => {
      toast.success(v.enabled ? "已停用" : "已启用");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const reloadMut = useMutation({
    mutationFn: () => gatewayApi.reload(),
    onSuccess: () => {
      toast.success("网关已重载");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = (type = "proxy") => {
    setEditing(null);
    setForm({
      ...EMPTY,
      type,
      code: type === "static" ? "site1" : "proxy1",
      name: type === "static" ? "静态站点" : "反向代理",
      root_dir: type === "static" ? "sites/demo" : "",
      upstream: type === "proxy" ? "http://127.0.0.1:8080" : "",
      // 上传友好默认
      max_body_bytes: 0,
      io_timeout_sec: 0,
      response_header_timeout_sec: 60,
    });
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || "",
      code: row.code || "",
      type: row.type || "proxy",
      enabled: !!row.enabled,
      listen_port: row.listen_port || 18090,
      path_prefix: row.path_prefix || "/",
      strip_prefix: row.strip_prefix !== false,
      root_dir: row.root_dir || "",
      spa_fallback: row.spa_fallback !== false,
      upstream: row.upstream || "",
      connect_timeout_sec: row.connect_timeout_sec ?? 10,
      response_header_timeout_sec: row.response_header_timeout_sec ?? 60,
      io_timeout_sec: row.io_timeout_sec ?? 0,
      max_body_bytes: row.max_body_bytes ?? 0,
      pass_host: !!row.pass_host,
      enable_websocket: row.enable_websocket !== false,
      description: row.description || "",
      sort: row.sort || 0,
    });
    setOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      type: form.type,
      enabled: !!form.enabled,
      listen_port: Number(form.listen_port) || 0,
      path_prefix: form.path_prefix.trim() || "/",
      strip_prefix: !!form.strip_prefix,
      root_dir: form.root_dir.trim(),
      spa_fallback: !!form.spa_fallback,
      upstream: form.upstream.trim(),
      connect_timeout_sec: Number(form.connect_timeout_sec) || 10,
      response_header_timeout_sec: Number(form.response_header_timeout_sec) || 60,
      io_timeout_sec: Number(form.io_timeout_sec) || 0,
      max_body_bytes: Number(form.max_body_bytes) || 0,
      pass_host: !!form.pass_host,
      enable_websocket: !!form.enable_websocket,
      description: form.description,
      sort: Number(form.sort) || 0,
    };
    if (!editing) {
      payload.code = form.code.trim();
    }
    if (form.type === "proxy" && !payload.upstream) {
      toast.error("反代规则需要填写上游 upstream");
      return;
    }
    if (form.type === "static" && !payload.root_dir) {
      toast.error("静态站需要填写 root_dir");
      return;
    }
    saveMut.mutate(payload);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4" /> 网关路由
              </CardTitle>
              <CardDescription>
                动态端口 + 路径前缀：静态站点托管与反向代理（上传流式转发，默认不限制 body）
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                刷新
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => reloadMut.mutate()}
                disabled={reloadMut.isPending}
              >
                <Server className="mr-1.5 h-3.5 w-3.5" />
                重载监听
              </Button>
              <Button variant="outline" size="sm" onClick={() => openCreate("static")}>
                <FolderTree className="mr-1.5 h-3.5 w-3.5" />
                静态站
              </Button>
              <Button size="sm" onClick={() => openCreate("proxy")}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                反代规则
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 运行时端口 */}
          <div className="flex flex-wrap gap-2">
            {runtime.length === 0 ? (
              <span className="text-xs text-muted-foreground">当前无监听端口（启用至少一条规则后自动 Listen）</span>
            ) : (
              runtime.map((r) => (
                <Badge key={r.port} variant="secondary" className="font-mono">
                  :{r.port} · {r.rule_count} 条 · {(r.rules || []).join(", ")}
                </Badge>
              ))
            )}
          </div>

          {isError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
              加载失败
            </div>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>监听</TableHead>
                  <TableHead>路径前缀</TableHead>
                  <TableHead>目标</TableHead>
                  <TableHead>上传限制</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      加载中…
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      暂无规则。可添加静态站（本地目录）或反代（上游 HTTP 服务）。
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{row.code}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.type === "static" ? "secondary" : "outline"}>
                          {row.type === "static" ? (
                            <span className="inline-flex items-center gap-1">
                              <FolderTree className="h-3 w-3" /> static
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <ArrowRightLeft className="h-3 w-3" /> proxy
                            </span>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        :{row.listen_port}
                        {row.enabled && listeningPorts.has(row.listen_port) && (
                          <span className="ml-1 text-[10px] text-emerald-400">LISTEN</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.path_prefix}</TableCell>
                      <TableCell className="max-w-[220px] truncate font-mono text-xs" title={row.type === "static" ? row.root_dir : row.upstream}>
                        {row.type === "static" ? row.root_dir : row.upstream}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.type === "proxy" ? (
                          <>
                            body {formatBytes(row.max_body_bytes)}
                            <br />
                            io {row.io_timeout_sec ? `${row.io_timeout_sec}s` : "不限"}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.enabled ? "success" : "secondary"}>
                          {row.enabled ? "启用" : "停用"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={row.enabled ? "停用" : "启用"}
                            onClick={() =>
                              toggleMut.mutate({ id: row.id, enabled: row.enabled })
                            }
                          >
                            {row.enabled ? (
                              <PowerOff className="h-3.5 w-3.5" />
                            ) : (
                              <Power className="h-3.5 w-3.5 text-emerald-400" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400"
                            onClick={() => setDeleting(row)}
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
          <p className="text-[11px] text-muted-foreground">
            反代上传优化：默认 <code className="text-[10px]">max_body_bytes=0</code>（不限制）、
            <code className="text-[10px]">io_timeout_sec=0</code>（不切长传）、流式转发不整包进内存。
            同端口多规则按路径前缀最长匹配。
          </p>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑规则" : "新建规则"}</DialogTitle>
            <DialogDescription>
              端口 + 路径前缀绑定；反代默认适合大文件上传转发。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>名称</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>编码</Label>
                <Input
                  value={form.code}
                  onChange={(e) => set("code", e.target.value)}
                  disabled={!!editing}
                  className="font-mono"
                  required={!editing}
                  placeholder="proxy1"
                />
              </div>
              <div className="space-y-1.5">
                <Label>类型</Label>
                <Select value={form.type} onValueChange={(v) => set("type", v)} disabled={!!editing}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proxy">反向代理 proxy</SelectItem>
                    <SelectItem value="static">静态站点 static</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>监听端口</Label>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={form.listen_port}
                  onChange={(e) => set("listen_port", e.target.value)}
                  className="font-mono"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>路径前缀</Label>
                <Input
                  value={form.path_prefix}
                  onChange={(e) => set("path_prefix", e.target.value)}
                  className="font-mono"
                  placeholder="/"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <Label>去掉前缀</Label>
                  <p className="text-[11px] text-muted-foreground">转发/取文件前 strip path</p>
                </div>
                <Switch checked={form.strip_prefix} onCheckedChange={(v) => set("strip_prefix", v)} />
              </div>
            </div>

            {form.type === "static" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>静态根目录 root_dir</Label>
                  <Input
                    value={form.root_dir}
                    onChange={(e) => set("root_dir", e.target.value)}
                    className="font-mono"
                    placeholder="绝对路径或相对 data 的路径，如 sites/web"
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2 sm:col-span-2">
                  <div>
                    <Label>SPA fallback</Label>
                    <p className="text-[11px] text-muted-foreground">找不到文件时回退 index.html</p>
                  </div>
                  <Switch checked={form.spa_fallback} onCheckedChange={(v) => set("spa_fallback", v)} />
                </div>
              </div>
            ) : (
              <div className="space-y-3 rounded-md border border-border/60 p-3">
                <div className="space-y-1.5">
                  <Label>上游 upstream</Label>
                  <Input
                    value={form.upstream}
                    onChange={(e) => set("upstream", e.target.value)}
                    className="font-mono"
                    placeholder="http://127.0.0.1:8080"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>连接超时(秒)</Label>
                    <Input
                      type="number"
                      value={form.connect_timeout_sec}
                      onChange={(e) => set("connect_timeout_sec", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>响应头超时(秒)</Label>
                    <Input
                      type="number"
                      value={form.response_header_timeout_sec}
                      onChange={(e) => set("response_header_timeout_sec", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>整体 IO 超时(秒)</Label>
                    <Input
                      type="number"
                      value={form.io_timeout_sec}
                      onChange={(e) => set("io_timeout_sec", e.target.value)}
                      placeholder="0=不限制(推荐上传)"
                    />
                    <p className="text-[11px] text-muted-foreground">大文件上传请保持 0</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Body 上限(字节)</Label>
                    <Input
                      type="number"
                      value={form.max_body_bytes}
                      onChange={(e) => set("max_body_bytes", e.target.value)}
                      placeholder="0=不限制"
                    />
                    <p className="text-[11px] text-muted-foreground">0 表示不限制，流式转发</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <Label>透传 Host</Label>
                    <Switch checked={form.pass_host} onCheckedChange={(v) => set("pass_host", v)} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <Label>WebSocket</Label>
                    <Switch
                      checked={form.enable_websocket}
                      onCheckedChange={(v) => set("enable_websocket", v)}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>创建后启用</Label>
              <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
            </div>

            <div className="space-y-1.5">
              <Label>备注</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={saveMut.isPending}>
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除规则？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除 <span className="font-mono">{deleting?.code}</span>
              {deleting?.enabled ? "，并停止相关监听（若端口无其它启用规则）" : ""}。
            </AlertDialogDescription>
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

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
  Server,
  ArrowRightLeft,
  FolderTree,
  ScrollText,
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

const EMPTY_PORT = { port: 18090, name: "", enabled: true, description: "" };
const EMPTY_PROXY = {
  port_id: 0,
  name: "",
  code: "",
  enabled: true,
  path_prefix: "/api",
  strip_prefix: true,
  upstream: "http://127.0.0.1:8080",
  connect_timeout_sec: 10,
  response_header_timeout_sec: 60,
  io_timeout_sec: 0,
  max_body_bytes: 0,
  pass_host: false,
  enable_websocket: true,
  description: "",
};

const DEFAULT_SCRIPT = `[
  {"when":{"path_regex":"^/old/(.*)$"},"then":{"rewrite":"/new/$1"}},
  {"when":{"path_prefix":"/blocked"},"then":{"deny":403,"body":"forbidden"}},
  {"when":{"path_exact":"/go"},"then":{"redirect":"/home","status":302}}
]`;

const EMPTY_SCRIPT = {
  port_id: 0,
  name: "",
  code: "",
  enabled: true,
  path_prefix: "/",
  priority: 100,
  script: DEFAULT_SCRIPT,
  description: "",
};

export function ProxyPorts() {
  const qc = useQueryClient();
  const [portOpen, setPortOpen] = useState(false);
  const [editingPort, setEditingPort] = useState(null);
  const [portForm, setPortForm] = useState(EMPTY_PORT);
  const [deletingPort, setDeletingPort] = useState(null);

  const [proxyOpen, setProxyOpen] = useState(false);
  const [editingProxy, setEditingProxy] = useState(null);
  const [proxyForm, setProxyForm] = useState(EMPTY_PROXY);
  const [deletingProxy, setDeletingProxy] = useState(null);
  const [filterPortId, setFilterPortId] = useState("");

  const [scriptOpen, setScriptOpen] = useState(false);
  const [editingScript, setEditingScript] = useState(null);
  const [scriptForm, setScriptForm] = useState(EMPTY_SCRIPT);
  const [deletingScript, setDeletingScript] = useState(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["gateway-ports"],
    queryFn: gatewayApi.listPorts,
    refetchInterval: 10000,
  });

  const ports = data?.items || [];
  const runtime = data?.runtime || [];
  const listening = useMemo(
    () => new Set((runtime || []).map((r) => r.port)),
    [runtime]
  );

  const proxies = useMemo(() => {
    const all = [];
    for (const p of ports) {
      for (const px of p.proxies || []) {
        all.push({ ...px, _port: p.port, _portName: p.name });
      }
    }
    if (filterPortId) {
      return all.filter((x) => String(x.port_id) === String(filterPortId));
    }
    return all;
  }, [ports, filterPortId]);

  const scripts = useMemo(() => {
    const all = [];
    for (const p of ports) {
      for (const sc of p.scripts || []) {
        all.push({ ...sc, _port: p.port, _portName: p.name });
      }
    }
    if (filterPortId) {
      return all.filter((x) => String(x.port_id) === String(filterPortId));
    }
    return all;
  }, [ports, filterPortId]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["gateway-ports"] });
    qc.invalidateQueries({ queryKey: ["gateway-apps"] });
  };

  const savePortMut = useMutation({
    mutationFn: (body) =>
      editingPort
        ? gatewayApi.updatePort(editingPort.id, body)
        : gatewayApi.createPort(body),
    onSuccess: () => {
      toast.success(editingPort ? "端口已更新" : "端口已创建");
      setPortOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const delPortMut = useMutation({
    mutationFn: ({ id, force }) => gatewayApi.removePort(id, force),
    onSuccess: () => {
      toast.success("端口已删除");
      setDeletingPort(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const saveProxyMut = useMutation({
    mutationFn: (body) =>
      editingProxy
        ? gatewayApi.updateProxy(editingProxy.id, body)
        : gatewayApi.createProxy(body),
    onSuccess: () => {
      toast.success(editingProxy ? "反代已更新" : "反代已创建");
      setProxyOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const delProxyMut = useMutation({
    mutationFn: (id) => gatewayApi.removeProxy(id),
    onSuccess: () => {
      toast.success("反代已删除");
      setDeletingProxy(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const saveScriptMut = useMutation({
    mutationFn: (body) =>
      editingScript
        ? gatewayApi.updateScript(editingScript.id, body)
        : gatewayApi.createScript(body),
    onSuccess: () => {
      toast.success(editingScript ? "脚本已更新" : "脚本已创建");
      setScriptOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const delScriptMut = useMutation({
    mutationFn: (id) => gatewayApi.removeScript(id),
    onSuccess: () => {
      toast.success("脚本已删除");
      setDeletingScript(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const reloadMut = useMutation({
    mutationFn: gatewayApi.reload,
    onSuccess: () => {
      toast.success("已重载监听");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreatePort = () => {
    setEditingPort(null);
    setPortForm({ ...EMPTY_PORT, name: `代理 ${EMPTY_PORT.port}` });
    setPortOpen(true);
  };

  const openEditPort = (p) => {
    setEditingPort(p);
    setPortForm({
      port: p.port,
      name: p.name,
      enabled: !!p.enabled,
      description: p.description || "",
    });
    setPortOpen(true);
  };

  const openCreateProxy = (portId) => {
    setEditingProxy(null);
    const pid = portId || ports[0]?.id || 0;
    setProxyForm({
      ...EMPTY_PROXY,
      port_id: pid,
      code: `api${pid || ""}`,
      name: "API 反代",
    });
    setProxyOpen(true);
  };

  const openEditProxy = (px) => {
    setEditingProxy(px);
    setProxyForm({
      port_id: px.port_id,
      name: px.name,
      code: px.code,
      enabled: !!px.enabled,
      path_prefix: px.path_prefix || "/api",
      strip_prefix: px.strip_prefix !== false,
      upstream: px.upstream || "",
      connect_timeout_sec: px.connect_timeout_sec ?? 10,
      response_header_timeout_sec: px.response_header_timeout_sec ?? 60,
      io_timeout_sec: px.io_timeout_sec ?? 0,
      max_body_bytes: px.max_body_bytes ?? 0,
      pass_host: !!px.pass_host,
      enable_websocket: px.enable_websocket !== false,
      description: px.description || "",
    });
    setProxyOpen(true);
  };

  const openCreateScript = (portId) => {
    setEditingScript(null);
    const pid = portId || ports[0]?.id || 0;
    setScriptForm({
      ...EMPTY_SCRIPT,
      port_id: pid,
      code: `route${pid || ""}`,
      name: "路由脚本",
    });
    setScriptOpen(true);
  };

  const openEditScript = (sc) => {
    setEditingScript(sc);
    setScriptForm({
      port_id: sc.port_id,
      name: sc.name,
      code: sc.code,
      enabled: !!sc.enabled,
      path_prefix: sc.path_prefix || "/",
      priority: sc.priority ?? 100,
      script: sc.script || DEFAULT_SCRIPT,
      description: sc.description || "",
    });
    setScriptOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* 端口列表 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="h-4 w-4" /> 代理端口
              </CardTitle>
              <CardDescription>
                动态 Listen 端口；其下可挂 APP（静态）与反代规则
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                刷新
              </Button>
              <Button variant="outline" size="sm" onClick={() => reloadMut.mutate()}>
                重载监听
              </Button>
              <Button size="sm" onClick={openCreatePort}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                添加端口
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {runtime.length === 0 ? (
              <span className="text-xs text-muted-foreground">当前无 LISTEN（启用端口并添加 APP/反代后生效）</span>
            ) : (
              runtime.map((r) => (
                <Badge key={r.port} variant="secondary" className="font-mono">
                  :{r.port} · {r.rule_count} 规则
                </Badge>
              ))
            )}
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>端口</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>APP</TableHead>
                  <TableHead>反代</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">加载中…</TableCell>
                  </TableRow>
                ) : ports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      暂无代理端口。先添加端口，再在「APP 管理」挂静态页，或在下方加反代。
                    </TableCell>
                  </TableRow>
                ) : (
                  ports.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono">
                        :{p.port}
                        {p.enabled && listening.has(p.port) && (
                          <span className="ml-1 text-[10px] text-emerald-400">LISTEN</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        {p.description && (
                          <div className="text-[11px] text-muted-foreground">{p.description}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-xs">
                          <FolderTree className="h-3 w-3" />
                          {(p.apps || []).length}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-xs">
                          <ArrowRightLeft className="h-3 w-3" />
                          {(p.proxies || []).length}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.enabled ? "success" : "secondary"}>
                          {p.enabled ? "启用" : "停用"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="添加反代"
                            onClick={() => openCreateProxy(p.id)}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={p.enabled ? "停用" : "启用"}
                            onClick={() => {
                              gatewayApi
                                .updatePort(p.id, { enabled: !p.enabled })
                                .then(() => {
                                  toast.success(p.enabled ? "已停用" : "已启用");
                                  invalidate();
                                })
                                .catch((err) => toast.error(err.message));
                            }}
                          >
                            {p.enabled ? (
                              <PowerOff className="h-3.5 w-3.5" />
                            ) : (
                              <Power className="h-3.5 w-3.5 text-emerald-400" />
                            )}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditPort(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400"
                            onClick={() => setDeletingPort(p)}
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
        </CardContent>
      </Card>

      {/* 端口下反代 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowRightLeft className="h-4 w-4" /> 端口反代规则
              </CardTitle>
              <CardDescription>
                反代挂在端口下（与 APP 平级）；同端口按路径前缀最长匹配。上传默认不限制 body / IO 超时。
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={filterPortId}
                onChange={(e) => setFilterPortId(e.target.value)}
              >
                <option value="">全部端口</option>
                {ports.map((p) => (
                  <option key={p.id} value={p.id}>
                    :{p.port} {p.name}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={() => openCreateProxy()} disabled={ports.length === 0}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                添加反代
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>端口</TableHead>
                  <TableHead>路径</TableHead>
                  <TableHead>上游</TableHead>
                  <TableHead>上传</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proxies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      暂无反代规则
                    </TableCell>
                  </TableRow>
                ) : (
                  proxies.map((px) => (
                    <TableRow key={px.id}>
                      <TableCell>
                        <div className="font-medium">{px.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{px.code}</div>
                      </TableCell>
                      <TableCell className="font-mono">:{px._port}</TableCell>
                      <TableCell className="font-mono text-xs">{px.path_prefix}</TableCell>
                      <TableCell className="max-w-[200px] truncate font-mono text-xs" title={px.upstream}>
                        {px.upstream}
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">
                        body {px.max_body_bytes ? px.max_body_bytes : "不限"}
                        <br />
                        io {px.io_timeout_sec ? `${px.io_timeout_sec}s` : "不限"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={px.enabled ? "success" : "secondary"}>
                          {px.enabled ? "启用" : "停用"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditProxy(px)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400"
                            onClick={() => setDeletingProxy(px)}
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
        </CardContent>
      </Card>

      {/* 路由脚本 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ScrollText className="h-4 w-4" /> 路由脚本
              </CardTitle>
              <CardDescription>
                挂在端口下，优先于 APP/反代执行。支持 rewrite / redirect / deny / proxy / static（JSON 规则数组）。
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => openCreateScript()} disabled={ports.length === 0}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              添加脚本
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>端口</TableHead>
                  <TableHead>作用域</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scripts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      暂无路由脚本。示例：将 /old/* rewrite 到 /new/*，或 deny 某些路径。
                    </TableCell>
                  </TableRow>
                ) : (
                  scripts.map((sc) => (
                    <TableRow key={sc.id}>
                      <TableCell>
                        <div className="font-medium">{sc.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{sc.code}</div>
                      </TableCell>
                      <TableCell className="font-mono">:{sc._port}</TableCell>
                      <TableCell className="font-mono text-xs">{sc.path_prefix || "/"}</TableCell>
                      <TableCell className="font-mono text-xs">{sc.priority ?? 100}</TableCell>
                      <TableCell>
                        <Badge variant={sc.enabled ? "success" : "secondary"}>
                          {sc.enabled ? "启用" : "停用"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditScript(sc)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400"
                            onClick={() => setDeletingScript(sc)}
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
            then 动作：rewrite（改路径后继续）/ redirect / deny / proxy / static / break。
            path_regex 捕获组可用 $1…$9。
          </p>
        </CardContent>
      </Card>

      {/* 端口对话框 */}
      <Dialog open={portOpen} onOpenChange={setPortOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPort ? "编辑端口" : "添加代理端口"}</DialogTitle>
            <DialogDescription>端口号创建后不可改；可启停与改名称。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>端口号</Label>
              <Input
                type="number"
                className="font-mono"
                disabled={!!editingPort}
                value={portForm.port}
                onChange={(e) => setPortForm((f) => ({ ...f, port: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input
                value={portForm.name}
                onChange={(e) => setPortForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>启用</Label>
              <Switch
                checked={portForm.enabled}
                onCheckedChange={(v) => setPortForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>备注</Label>
              <Textarea
                rows={2}
                value={portForm.description}
                onChange={(e) => setPortForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPortOpen(false)}>取消</Button>
            <Button
              disabled={savePortMut.isPending}
              onClick={() => {
                if (editingPort) {
                  savePortMut.mutate({
                    name: portForm.name,
                    enabled: portForm.enabled,
                    description: portForm.description,
                  });
                } else {
                  savePortMut.mutate({
                    port: Number(portForm.port),
                    name: portForm.name,
                    enabled: portForm.enabled,
                    description: portForm.description,
                  });
                }
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 反代对话框 */}
      <Dialog open={proxyOpen} onOpenChange={setProxyOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProxy ? "编辑反代" : "添加反代（挂在端口下）"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>所属端口</Label>
                <select
                  className="flex h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={proxyForm.port_id}
                  onChange={(e) =>
                    setProxyForm((f) => ({ ...f, port_id: Number(e.target.value) }))
                  }
                >
                  {ports.map((p) => (
                    <option key={p.id} value={p.id}>
                      :{p.port} {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>编码</Label>
                <Input
                  className="font-mono"
                  disabled={!!editingProxy}
                  value={proxyForm.code}
                  onChange={(e) => setProxyForm((f) => ({ ...f, code: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>名称</Label>
                <Input
                  value={proxyForm.name}
                  onChange={(e) => setProxyForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>路径前缀</Label>
                <Input
                  className="font-mono"
                  value={proxyForm.path_prefix}
                  onChange={(e) => setProxyForm((f) => ({ ...f, path_prefix: e.target.value }))}
                  placeholder="/api"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label>去掉前缀</Label>
                <Switch
                  checked={proxyForm.strip_prefix}
                  onCheckedChange={(v) => setProxyForm((f) => ({ ...f, strip_prefix: v }))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>上游 upstream</Label>
                <Input
                  className="font-mono"
                  value={proxyForm.upstream}
                  onChange={(e) => setProxyForm((f) => ({ ...f, upstream: e.target.value }))}
                  placeholder="http://127.0.0.1:8080"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Body 上限(0=不限)</Label>
                <Input
                  type="number"
                  value={proxyForm.max_body_bytes}
                  onChange={(e) =>
                    setProxyForm((f) => ({ ...f, max_body_bytes: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>IO 超时秒(0=不限)</Label>
                <Input
                  type="number"
                  value={proxyForm.io_timeout_sec}
                  onChange={(e) =>
                    setProxyForm((f) => ({ ...f, io_timeout_sec: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label>启用</Label>
                <Switch
                  checked={proxyForm.enabled}
                  onCheckedChange={(v) => setProxyForm((f) => ({ ...f, enabled: v }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label>WebSocket</Label>
                <Switch
                  checked={proxyForm.enable_websocket}
                  onCheckedChange={(v) => setProxyForm((f) => ({ ...f, enable_websocket: v }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProxyOpen(false)}>取消</Button>
            <Button
              disabled={saveProxyMut.isPending}
              onClick={() => {
                const body = {
                  port_id: Number(proxyForm.port_id),
                  name: proxyForm.name,
                  enabled: proxyForm.enabled,
                  path_prefix: proxyForm.path_prefix,
                  strip_prefix: proxyForm.strip_prefix,
                  upstream: proxyForm.upstream,
                  connect_timeout_sec: Number(proxyForm.connect_timeout_sec) || 10,
                  response_header_timeout_sec:
                    Number(proxyForm.response_header_timeout_sec) || 60,
                  io_timeout_sec: Number(proxyForm.io_timeout_sec) || 0,
                  max_body_bytes: Number(proxyForm.max_body_bytes) || 0,
                  pass_host: proxyForm.pass_host,
                  enable_websocket: proxyForm.enable_websocket,
                  description: proxyForm.description,
                };
                if (!editingProxy) body.code = proxyForm.code;
                saveProxyMut.mutate(body);
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingPort} onOpenChange={(v) => !v && setDeletingPort(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除端口 :{deletingPort?.port}？</AlertDialogTitle>
            <AlertDialogDescription>
              若端口下仍有 APP/反代/脚本，将级联删除（force）。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => delPortMut.mutate({ id: deletingPort.id, force: true })}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingProxy} onOpenChange={(v) => !v && setDeletingProxy(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除反代 {deletingProxy?.code}？</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => delProxyMut.mutate(deletingProxy.id)}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 脚本对话框 */}
      <Dialog open={scriptOpen} onOpenChange={setScriptOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingScript ? "编辑路由脚本" : "添加路由脚本"}</DialogTitle>
            <DialogDescription>
              JSON 数组规则，按顺序匹配；priority 越小越先执行。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>所属端口</Label>
              <select
                className="flex h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={scriptForm.port_id}
                onChange={(e) =>
                  setScriptForm((f) => ({ ...f, port_id: Number(e.target.value) }))
                }
              >
                {ports.map((p) => (
                  <option key={p.id} value={p.id}>
                    :{p.port} {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>编码</Label>
              <Input
                className="font-mono"
                disabled={!!editingScript}
                value={scriptForm.code}
                onChange={(e) => setScriptForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>名称</Label>
              <Input
                value={scriptForm.name}
                onChange={(e) => setScriptForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>作用域 path_prefix</Label>
              <Input
                className="font-mono"
                value={scriptForm.path_prefix}
                onChange={(e) => setScriptForm((f) => ({ ...f, path_prefix: e.target.value }))}
                placeholder="/"
              />
            </div>
            <div className="space-y-1.5">
              <Label>优先级(越小越先)</Label>
              <Input
                type="number"
                value={scriptForm.priority}
                onChange={(e) =>
                  setScriptForm((f) => ({ ...f, priority: Number(e.target.value) }))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2 sm:col-span-2">
              <Label>启用</Label>
              <Switch
                checked={scriptForm.enabled}
                onCheckedChange={(v) => setScriptForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Script JSON</Label>
              <Textarea
                rows={12}
                className="font-mono text-xs"
                value={scriptForm.script}
                onChange={(e) => setScriptForm((f) => ({ ...f, script: e.target.value }))}
                spellCheck={false}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>备注</Label>
              <Textarea
                rows={2}
                value={scriptForm.description}
                onChange={(e) => setScriptForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScriptOpen(false)}>
              取消
            </Button>
            <Button
              disabled={saveScriptMut.isPending}
              onClick={() => {
                try {
                  JSON.parse(scriptForm.script);
                } catch {
                  toast.error("Script 不是合法 JSON");
                  return;
                }
                const body = {
                  port_id: Number(scriptForm.port_id),
                  name: scriptForm.name,
                  enabled: scriptForm.enabled,
                  path_prefix: scriptForm.path_prefix,
                  priority: Number(scriptForm.priority) || 100,
                  script: scriptForm.script,
                  description: scriptForm.description,
                };
                if (!editingScript) body.code = scriptForm.code;
                saveScriptMut.mutate(body);
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingScript} onOpenChange={(v) => !v && setDeletingScript(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除脚本 {deletingScript?.code}？</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => delScriptMut.mutate(deletingScript.id)}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

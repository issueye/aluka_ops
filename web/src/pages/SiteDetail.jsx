import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  ExternalLink,
  FolderTree,
  ArrowRightLeft,
  ScrollText,
  Globe,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EMPTY_APP = {
  code: "",
  name: "",
  description: "",
  enabled: true,
  path_prefix: "/",
  strip_prefix: true,
  root_dir: "",
  spa_fallback: true,
};

const EMPTY_PROXY = {
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
  {"when":{"path_prefix":"/blocked"},"then":{"deny":403,"body":"forbidden"}}
]`;

const EMPTY_SCRIPT = {
  name: "",
  code: "",
  enabled: true,
  path_prefix: "/",
  priority: 100,
  script: DEFAULT_SCRIPT,
  description: "",
  template_id: "",
};

const CATEGORY_LABEL = {
  rewrite: "重写",
  redirect: "跳转",
  deny: "拦截",
  proxy: "反代",
  static: "静态",
  combo: "组合",
};

export function SiteDetail() {
  const { id } = useParams();
  const siteId = Number(id);
  const qc = useQueryClient();
  const [tab, setTab] = useState("apps");

  const [appOpen, setAppOpen] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [appForm, setAppForm] = useState(EMPTY_APP);
  const [deletingApp, setDeletingApp] = useState(null);

  const [proxyOpen, setProxyOpen] = useState(false);
  const [editingProxy, setEditingProxy] = useState(null);
  const [proxyForm, setProxyForm] = useState(EMPTY_PROXY);
  const [deletingProxy, setDeletingProxy] = useState(null);

  const [scriptOpen, setScriptOpen] = useState(false);
  const [editingScript, setEditingScript] = useState(null);
  const [scriptForm, setScriptForm] = useState(EMPTY_SCRIPT);
  const [deletingScript, setDeletingScript] = useState(null);

  const { data: site, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["gateway-port", siteId],
    queryFn: () => gatewayApi.getPort(siteId),
    enabled: !!siteId,
    refetchInterval: 10000,
  });

  const { data: statusData } = useQuery({
    queryKey: ["gateway-status"],
    queryFn: gatewayApi.status,
    refetchInterval: 10000,
  });
  const listening = useMemo(() => {
    const set = new Set();
    for (const r of statusData?.runtime || []) set.add(r.port);
    return set;
  }, [statusData]);

  const { data: tplData } = useQuery({
    queryKey: ["gateway-script-templates"],
    queryFn: gatewayApi.listScriptTemplates,
    staleTime: 60_000,
  });
  const templates = tplData?.items || [];

  const apps = site?.apps || [];
  const proxies = site?.proxies || [];
  const scripts = site?.scripts || [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["gateway-port", siteId] });
    qc.invalidateQueries({ queryKey: ["gateway-ports"] });
    qc.invalidateQueries({ queryKey: ["gateway-apps"] });
    qc.invalidateQueries({ queryKey: ["gateway-status"] });
  };

  // ----- APP -----
  const saveAppMut = useMutation({
    mutationFn: (body) =>
      editingApp
        ? gatewayApi.updateApp(editingApp.id, body)
        : gatewayApi.createApp(body),
    onSuccess: () => {
      toast.success(editingApp ? "APP 已更新" : "APP 已创建");
      setAppOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const delAppMut = useMutation({
    mutationFn: (aid) => gatewayApi.removeApp(aid),
    onSuccess: () => {
      toast.success("APP 已删除");
      setDeletingApp(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ----- Proxy -----
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
    mutationFn: (pid) => gatewayApi.removeProxy(pid),
    onSuccess: () => {
      toast.success("反代已删除");
      setDeletingProxy(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ----- Script -----
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
    mutationFn: (sid) => gatewayApi.removeScript(sid),
    onSuccess: () => {
      toast.success("脚本已删除");
      setDeletingScript(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreateApp = () => {
    setEditingApp(null);
    setAppForm({
      ...EMPTY_APP,
      code: "webapp",
      name: "前端应用",
      root_dir: "apps/webapp",
    });
    setAppOpen(true);
  };
  const openEditApp = (row) => {
    setEditingApp(row);
    setAppForm({
      code: row.code,
      name: row.name,
      description: row.description || "",
      enabled: !!row.enabled,
      path_prefix: row.path_prefix || "/",
      strip_prefix: row.strip_prefix !== false,
      root_dir: row.root_dir || "",
      spa_fallback: row.spa_fallback !== false,
    });
    setAppOpen(true);
  };

  const openCreateProxy = () => {
    setEditingProxy(null);
    setProxyForm({
      ...EMPTY_PROXY,
      code: `api${siteId || ""}`,
      name: "API 反代",
    });
    setProxyOpen(true);
  };
  const openEditProxy = (row) => {
    setEditingProxy(row);
    setProxyForm({
      name: row.name,
      code: row.code,
      enabled: !!row.enabled,
      path_prefix: row.path_prefix || "/api",
      strip_prefix: row.strip_prefix !== false,
      upstream: row.upstream || "",
      connect_timeout_sec: row.connect_timeout_sec ?? 10,
      response_header_timeout_sec: row.response_header_timeout_sec ?? 60,
      io_timeout_sec: row.io_timeout_sec ?? 0,
      max_body_bytes: row.max_body_bytes ?? 0,
      pass_host: !!row.pass_host,
      enable_websocket: row.enable_websocket !== false,
      description: row.description || "",
    });
    setProxyOpen(true);
  };

  const openCreateScript = (templateId) => {
    setEditingScript(null);
    let form = {
      ...EMPTY_SCRIPT,
      code: `route${siteId || ""}`,
      name: "路由脚本",
    };
    if (templateId) {
      const tpl = templates.find((t) => t.id === templateId);
      if (tpl) {
        form = {
          ...form,
          template_id: tpl.id,
          code: tpl.suggest_code || form.code,
          name: tpl.suggest_name || tpl.name,
          path_prefix: tpl.suggest_path_prefix || "/",
          priority: tpl.suggest_priority ?? 100,
          script: tpl.script || DEFAULT_SCRIPT,
          description: tpl.description || "",
        };
      }
    }
    setScriptForm(form);
    setScriptOpen(true);
  };
  const openEditScript = (row) => {
    setEditingScript(row);
    setScriptForm({
      name: row.name,
      code: row.code,
      enabled: !!row.enabled,
      path_prefix: row.path_prefix || "/",
      priority: row.priority ?? 100,
      script: row.script || DEFAULT_SCRIPT,
      description: row.description || "",
      template_id: "",
    });
    setScriptOpen(true);
  };

  const appUrl = (app) => {
    if (!site?.port) return "";
    const prefix = app.path_prefix === "/" ? "" : app.path_prefix || "";
    return `http://127.0.0.1:${site.port}${prefix}/`;
  };

  if (isLoading) {
    return <div className="text-muted-foreground">加载中…</div>;
  }
  if (isError || !site) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/sites">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> 返回站点列表
          </Link>
        </Button>
        <Card>
          <CardContent className="p-6 text-muted-foreground">站点不存在或已删除。</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/sites">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {site.name}
              </h2>
              <Badge variant={site.enabled ? "success" : "secondary"}>
                {site.enabled ? "启用" : "停用"}
              </Badge>
              {site.enabled && listening.has(site.port) && (
                <Badge variant="outline" className="font-mono text-[10px] text-emerald-400">
                  :{site.port} LISTEN
                </Badge>
              )}
            </div>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              端口 :{site.port}
              {site.description ? ` · ${site.description}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            刷新
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`http://127.0.0.1:${site.port}/`} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              打开站点
            </a>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="apps">
            <FolderTree className="mr-1.5 h-3.5 w-3.5" />
            APP ({apps.length})
          </TabsTrigger>
          <TabsTrigger value="proxies">
            <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
            反代 ({proxies.length})
          </TabsTrigger>
          <TabsTrigger value="scripts">
            <ScrollText className="mr-1.5 h-3.5 w-3.5" />
            路由脚本 ({scripts.length})
          </TabsTrigger>
        </TabsList>

        {/* ===== APP Tab ===== */}
        <TabsContent value="apps" className="space-y-3">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-sm">静态 APP</CardTitle>
                <CardDescription>
                  绑定本站点端口的前端静态资源（路径 + 目录 + SPA）
                </CardDescription>
              </div>
              <Button size="sm" onClick={openCreateApp}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                新建 APP
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>应用</TableHead>
                      <TableHead>路径</TableHead>
                      <TableHead>目录</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apps.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">
                          暂无 APP。可将构建产物放到 data/apps/&lt;code&gt; 后在此挂载。
                        </TableCell>
                      </TableRow>
                    ) : (
                      apps.map((app) => (
                        <TableRow key={app.id}>
                          <TableCell>
                            <div className="font-medium">{app.name}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {app.code}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{app.path_prefix}</TableCell>
                          <TableCell
                            className="max-w-[180px] truncate font-mono text-xs"
                            title={app.root_dir}
                          >
                            {app.root_dir || `apps/${app.code}`}
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
                              {appUrl(app) && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                  <a href={appUrl(app)} target="_blank" rel="noreferrer">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEditApp(app)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-400"
                                onClick={() => setDeletingApp(app)}
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
        </TabsContent>

        {/* ===== Proxy Tab ===== */}
        <TabsContent value="proxies" className="space-y-3">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-sm">反代规则</CardTitle>
                <CardDescription>
                  路径前缀 → 上游；同站点内最长前缀优先。上传建议 body/IO 超时设为 0。
                </CardDescription>
              </div>
              <Button size="sm" onClick={openCreateProxy}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                添加反代
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
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
                        <TableCell colSpan={6} className="text-muted-foreground">
                          暂无反代。例如 path=/api → http://127.0.0.1:8080
                        </TableCell>
                      </TableRow>
                    ) : (
                      proxies.map((px) => (
                        <TableRow key={px.id}>
                          <TableCell>
                            <div className="font-medium">{px.name}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {px.code}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{px.path_prefix}</TableCell>
                          <TableCell
                            className="max-w-[200px] truncate font-mono text-xs"
                            title={px.upstream}
                          >
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
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEditProxy(px)}
                              >
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
        </TabsContent>

        {/* ===== Scripts Tab ===== */}
        <TabsContent value="scripts" className="space-y-3">
          {templates.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => openCreateScript(tpl.id)}
                  className="rounded-md border border-border/60 bg-card/40 p-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{tpl.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {CATEGORY_LABEL[tpl.category] || tpl.category}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                    {tpl.description}
                  </p>
                </button>
              ))}
            </div>
          )}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-sm">路由脚本</CardTitle>
                <CardDescription>
                  优先于 APP/反代执行；支持 rewrite / redirect / deny / proxy / static
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => openCreateScript()}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                自定义脚本
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>作用域</TableHead>
                      <TableHead>优先级</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scripts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">
                          暂无脚本。可点上方模板一键创建。
                        </TableCell>
                      </TableRow>
                    ) : (
                      scripts.map((sc) => (
                        <TableRow key={sc.id}>
                          <TableCell>
                            <div className="font-medium">{sc.name}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {sc.code}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {sc.path_prefix || "/"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {sc.priority ?? 100}
                          </TableCell>
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== APP Dialog ===== */}
      <Dialog open={appOpen} onOpenChange={setAppOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingApp ? "编辑 APP" : "新建 APP"}</DialogTitle>
            <DialogDescription>静态前端：路径 + 目录（相对 data）</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input
                value={appForm.name}
                onChange={(e) => setAppForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>编码</Label>
              <Input
                className="font-mono"
                disabled={!!editingApp}
                value={appForm.code}
                onChange={(e) => setAppForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>访问路径</Label>
              <Input
                className="font-mono"
                value={appForm.path_prefix}
                onChange={(e) => setAppForm((f) => ({ ...f, path_prefix: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>静态目录 root_dir</Label>
              <Input
                className="font-mono"
                value={appForm.root_dir}
                onChange={(e) => setAppForm((f) => ({ ...f, root_dir: e.target.value }))}
                placeholder="apps/webapp"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>去掉路径前缀</Label>
              <Switch
                checked={appForm.strip_prefix}
                onCheckedChange={(v) => setAppForm((f) => ({ ...f, strip_prefix: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label>SPA fallback</Label>
              <Switch
                checked={appForm.spa_fallback}
                onCheckedChange={(v) => setAppForm((f) => ({ ...f, spa_fallback: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2 sm:col-span-2">
              <Label>启用</Label>
              <Switch
                checked={appForm.enabled}
                onCheckedChange={(v) => setAppForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAppOpen(false)}>
              取消
            </Button>
            <Button
              disabled={saveAppMut.isPending}
              onClick={() => {
                const body = {
                  name: appForm.name,
                  description: appForm.description,
                  enabled: appForm.enabled,
                  port_id: siteId,
                  path_prefix: appForm.path_prefix,
                  strip_prefix: appForm.strip_prefix,
                  root_dir: appForm.root_dir,
                  spa_fallback: appForm.spa_fallback,
                };
                if (!editingApp) body.code = appForm.code;
                saveAppMut.mutate(body);
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Proxy Dialog ===== */}
      <Dialog open={proxyOpen} onOpenChange={setProxyOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProxy ? "编辑反代" : "添加反代"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>编码</Label>
              <Input
                className="font-mono"
                disabled={!!editingProxy}
                value={proxyForm.code}
                onChange={(e) => setProxyForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
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
                onCheckedChange={(v) =>
                  setProxyForm((f) => ({ ...f, enable_websocket: v }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProxyOpen(false)}>
              取消
            </Button>
            <Button
              disabled={saveProxyMut.isPending}
              onClick={() => {
                const body = {
                  port_id: siteId,
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

      {/* ===== Script Dialog ===== */}
      <Dialog open={scriptOpen} onOpenChange={setScriptOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingScript ? "编辑路由脚本" : "添加路由脚本"}</DialogTitle>
            <DialogDescription>JSON 规则数组；priority 越小越先执行。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {!editingScript && templates.length > 0 && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>套用模板</Label>
                <select
                  className="flex h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={scriptForm.template_id || ""}
                  onChange={(e) => {
                    const tid = e.target.value;
                    if (!tid) {
                      setScriptForm((f) => ({ ...f, template_id: "" }));
                      return;
                    }
                    const tpl = templates.find((t) => t.id === tid);
                    if (!tpl) return;
                    setScriptForm((f) => ({
                      ...f,
                      template_id: tpl.id,
                      code: editingScript ? f.code : tpl.suggest_code || f.code,
                      name: tpl.suggest_name || tpl.name,
                      path_prefix: tpl.suggest_path_prefix || "/",
                      priority: tpl.suggest_priority ?? 100,
                      script: tpl.script || DEFAULT_SCRIPT,
                      description: tpl.description || "",
                    }));
                  }}
                >
                  <option value="">自定义 / 不套用</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      [{CATEGORY_LABEL[tpl.category] || tpl.category}] {tpl.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>编码</Label>
              <Input
                className="font-mono"
                disabled={!!editingScript}
                value={scriptForm.code}
                onChange={(e) => setScriptForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input
                value={scriptForm.name}
                onChange={(e) => setScriptForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>作用域</Label>
              <Input
                className="font-mono"
                value={scriptForm.path_prefix}
                onChange={(e) => setScriptForm((f) => ({ ...f, path_prefix: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>优先级</Label>
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
                onChange={(e) =>
                  setScriptForm((f) => ({
                    ...f,
                    script: e.target.value,
                    template_id: "",
                  }))
                }
                spellCheck={false}
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
                  port_id: siteId,
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

      {/* Deletes */}
      <AlertDialog open={!!deletingApp} onOpenChange={(v) => !v && setDeletingApp(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 APP {deletingApp?.code}？</AlertDialogTitle>
            <AlertDialogDescription>仅删配置，不删磁盘文件。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => delAppMut.mutate(deletingApp.id)}
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

import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  FolderTree,
  ArrowRightLeft,
  ScrollText,
  Shield,
} from "lucide-react";
import { gatewayApi } from "@/lib/api";
import { siteURL } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ConfirmDialog,
  DataTableCard,
  DetailHeader,
  FormDialog,
  FormField,
  FormGrid,
  IconTooltip,
  PageShell,
  RefreshButton,
  RowActions,
  TableStateRow,
  TabBar,
  TabsContent,
  ActionButton,
  LabeledSwitch,
  SelectField,
} from "@/components/ued";
import { Skeleton } from "@/components/ui/skeleton";

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
  ip_whitelist: "",
  ip_blacklist: "",
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

  const [accessOpen, setAccessOpen] = useState(false);
  const [accessForm, setAccessForm] = useState({
    ip_whitelist: "",
    ip_blacklist: "",
  });

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
  const appsPg = usePagination(apps, 10);
  const proxiesPg = usePagination(proxies, 10);
  const scriptsPg = usePagination(scripts, 10);

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

  const saveAccessMut = useMutation({
    mutationFn: (body) => gatewayApi.updatePort(siteId, body),
    onSuccess: () => {
      toast.success("访问控制已保存");
      setAccessOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ----- 拦截统计 -----
  const { data: blocksData, isLoading: blocksLoading } = useQuery({
    queryKey: ["gateway-blocks", siteId],
    queryFn: () => gatewayApi.listBlocks(siteId),
    enabled: !!siteId,
    refetchInterval: 15000,
  });
  const blocks = blocksData?.items || [];
  const blockTotal = useMemo(
    () => blocks.reduce((sum, b) => sum + b.count403 + b.count429, 0),
    [blocks]
  );
  const blockIPMut = useMutation({
    mutationFn: (ip) => {
      const cur = (site.ip_blacklist || "").trim();
      const lines = cur ? cur.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean) : [];
      if (lines.includes(ip)) throw new Error("该 IP 已在站点黑名单中");
      return gatewayApi.updatePort(siteId, { ip_blacklist: lines.concat(ip).join("\n") });
    },
    onSuccess: () => {
      toast.success("已加入站点黑名单，即刻生效");
      invalidate();
    },
    onError: (e) => toast.error(e.message || "加入黑名单失败"),
  });
  const resetBlocksMut = useMutation({
    mutationFn: () => gatewayApi.resetBlocks(siteId),
    onSuccess: () => {
      toast.success("拦截统计已清零");
      qc.invalidateQueries({ queryKey: ["gateway-blocks", siteId] });
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
      ip_whitelist: row.ip_whitelist || "",
      ip_blacklist: row.ip_blacklist || "",
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
    return siteURL(site.port, app.path_prefix || "/");
  };

  if (isLoading) {
    return (
      <PageShell>
        <div className="space-y-5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-9 w-full max-w-xl" />
          <Skeleton className="h-48 w-full" />
        </div>
      </PageShell>
    );
  }
  if (isError || !site) {
    return (
      <PageShell>
        <DetailHeader
          breadcrumb={[
            { label: "站点管理", to: "/sites" },
            { label: "未知站点" },
          ]}
          title="站点不存在"
        />
        <Card>
          <CardContent className="p-6 text-sm text-text3">站点不存在或已删除。</CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <DetailHeader
        breadcrumb={[
          { label: "站点管理", to: "/sites" },
          { label: site.name },
        ]}
        title={site.name}
        subtitle={`端口 :${site.port}`}
        badges={
          <>
            <Badge variant={site.enabled ? "success" : "secondary"}>
              {site.enabled ? "启用" : "停用"}
            </Badge>
            {site.enabled && listening.has(site.port) && (
              <Badge variant="outline" className="font-mono text-xs text-success">
                LISTEN
              </Badge>
            )}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton onClick={() => refetch()} loading={isFetching} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAccessForm({
                  ip_whitelist: site.ip_whitelist || "",
                  ip_blacklist: site.ip_blacklist || "",
                });
                setAccessOpen(true);
              }}
            >
              <Shield className="mr-1 h-3.5 w-3.5" /> IP 访问控制
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={siteURL(site.port)} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1 h-3.5 w-3.5" /> 打开站点
              </a>
            </Button>
          </div>
        }
      />

      {site.description ? (
        <p className="text-[13px] leading-5 text-text3">{site.description}</p>
      ) : null}

      {(site.ip_whitelist?.trim() || site.ip_blacklist?.trim()) && (
        <Card>
          <CardContent className="grid gap-3 p-4 text-xs sm:grid-cols-2">
            <div>
              <div className="mb-1 font-medium text-text3">白名单</div>
              <pre className="max-h-24 overflow-auto rounded bg-bg5 p-2 font-mono whitespace-pre-wrap">
                {site.ip_whitelist?.trim() || "（空=不限制）"}
              </pre>
            </div>
            <div>
              <div className="mb-1 font-medium text-text3">黑名单</div>
              <pre className="max-h-24 overflow-auto rounded bg-bg5 p-2 font-mono whitespace-pre-wrap">
                {site.ip_blacklist?.trim() || "（空）"}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      <TabBar
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "apps", label: `APP (${apps.length})`, icon: FolderTree },
          { value: "proxies", label: `反代 (${proxies.length})`, icon: ArrowRightLeft },
          { value: "scripts", label: `路由脚本 (${scripts.length})`, icon: ScrollText },
          { value: "blocks", label: `拦截统计 (${blockTotal})`, icon: Shield },
        ]}
      >

        {/* ===== APP Tab ===== */}
        <TabsContent value="apps" className="mt-4 space-y-5">
          <DataTableCard
            title="静态 APP"
            description="绑定本站点端口的前端静态资源（路径 + 目录 + SPA）"
            actions={
              <ActionButton icon={Plus} onClick={openCreateApp}>
                新建 APP
              </ActionButton>
            }
            pagination={
              apps.length > 0
                ? {
                    page: appsPg.page,
                    totalPages: appsPg.totalPages,
                    total: appsPg.total,
                    from: appsPg.from,
                    to: appsPg.to,
                    pageSize: appsPg.pageSize,
                    setPage: appsPg.setPage,
                  }
                : null
            }
          >
            <Table>
              <colgroup><col style={{ width: "28%" }} /><col style={{ width: "18%" }} /><col style={{ width: "24%" }} /><col style={{ width: "14%" }} /><col style={{ width: "16%" }} /></colgroup>
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
                  <TableStateRow colSpan={5}>
                    暂无 APP。可将构建产物放到 data/apps/&lt;code&gt; 后在此挂载。
                  </TableStateRow>
                ) : (
                  appsPg.pageItems.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell>
                        <div className="font-medium">{app.name}</div>
                        <div className="font-mono text-[11px] text-text3">
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
                        <RowActions>
                          {appUrl(app) && (
                            <IconTooltip label="打开 APP">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                asChild
                                aria-label="打开 APP"
                              >
                                <a href={appUrl(app)} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            </IconTooltip>
                          )}
                          <IconTooltip label="编辑">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="编辑 APP"
                              onClick={() => openEditApp(app)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </IconTooltip>
                          <IconTooltip label="删除">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-danger"
                              aria-label="删除 APP"
                              onClick={() => setDeletingApp(app)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </IconTooltip>
                        </RowActions>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </DataTableCard>
        </TabsContent>

        {/* ===== Proxy Tab ===== */}
        <TabsContent value="proxies" className="mt-4 space-y-5">
          <DataTableCard
            title="反代规则"
            description="路径前缀 → 上游；同站点内最长前缀优先。上传建议 body/IO 超时设为 0。"
            actions={
              <ActionButton icon={Plus} onClick={openCreateProxy}>
                添加反代
              </ActionButton>
            }
            pagination={
              proxies.length > 0
                ? {
                    page: proxiesPg.page,
                    totalPages: proxiesPg.totalPages,
                    total: proxiesPg.total,
                    from: proxiesPg.from,
                    to: proxiesPg.to,
                    pageSize: proxiesPg.pageSize,
                    setPage: proxiesPg.setPage,
                  }
                : null
            }
          >
            <Table>
              <colgroup><col style={{ width: "18%" }} /><col style={{ width: "16%" }} /><col style={{ width: "26%" }} /><col style={{ width: "14%" }} /><col style={{ width: "14%" }} /><col style={{ width: "12%" }} /></colgroup>
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
                  <TableStateRow colSpan={6}>
                    暂无反代。例如 path=/api → http://127.0.0.1:8080
                  </TableStateRow>
                ) : (
                  proxiesPg.pageItems.map((px) => (
                    <TableRow key={px.id}>
                      <TableCell>
                        <div className="font-medium">{px.name}</div>
                        <div className="font-mono text-[11px] text-text3">
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
                      <TableCell className="text-[11px] text-text3">
                        body {px.max_body_bytes ? px.max_body_bytes : "不限"}
                        <br />
                        io {px.io_timeout_sec ? `${px.io_timeout_sec}s` : "不限"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={px.enabled ? "success" : "secondary"}>
                          {px.enabled ? "启用" : "停用"}
                        </Badge>
                        {px.ip_whitelist?.trim() && (
                          <Badge variant="outline" className="ml-1 text-[10px]">
                            白名单
                          </Badge>
                        )}
                        {px.ip_blacklist?.trim() && (
                          <Badge variant="outline" className="ml-1 text-[10px] text-danger">
                            黑名单
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions>
                          <IconTooltip label="编辑">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="编辑反代"
                              onClick={() => openEditProxy(px)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </IconTooltip>
                          <IconTooltip label="删除">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-danger"
                              aria-label="删除反代"
                              onClick={() => setDeletingProxy(px)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </IconTooltip>
                        </RowActions>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </DataTableCard>
        </TabsContent>

        {/* ===== Scripts Tab ===== */}
        <TabsContent value="scripts" className="mt-4 space-y-5">
          {templates.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => openCreateScript(tpl.id)}
                  className="rounded-md border border-border1 bg-bg2 p-3 text-left transition hover:border-primary-3 hover:bg-primary-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{tpl.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {CATEGORY_LABEL[tpl.category] || tpl.category}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-text3">
                    {tpl.description}
                  </p>
                </button>
              ))}
            </div>
          )}
          <DataTableCard
            title="路由脚本"
            description="优先于 APP/反代执行；支持 rewrite / redirect / deny / proxy / static"
            actions={
              <ActionButton icon={Plus} onClick={() => openCreateScript()}>
                自定义脚本
              </ActionButton>
            }
            pagination={
              scripts.length > 0
                ? {
                    page: scriptsPg.page,
                    totalPages: scriptsPg.totalPages,
                    total: scriptsPg.total,
                    from: scriptsPg.from,
                    to: scriptsPg.to,
                    pageSize: scriptsPg.pageSize,
                    setPage: scriptsPg.setPage,
                  }
                : null
            }
          >
            <Table>
              <colgroup><col style={{ width: "30%" }} /><col style={{ width: "20%" }} /><col style={{ width: "14%" }} /><col style={{ width: "14%" }} /><col style={{ width: "22%" }} /></colgroup>
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
                  <TableStateRow colSpan={5}>暂无脚本。可点上方模板一键创建。</TableStateRow>
                ) : (
                  scriptsPg.pageItems.map((sc) => (
                    <TableRow key={sc.id}>
                      <TableCell>
                        <div className="font-medium">{sc.name}</div>
                        <div className="font-mono text-[11px] text-text3">
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
                        <RowActions>
                          <IconTooltip label="编辑">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="编辑脚本"
                              onClick={() => openEditScript(sc)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </IconTooltip>
                          <IconTooltip label="删除">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-danger"
                              aria-label="删除脚本"
                              onClick={() => setDeletingScript(sc)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </IconTooltip>
                        </RowActions>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </DataTableCard>
        </TabsContent>

        {/* ===== 拦截统计 Tab ===== */}
        <TabsContent value="blocks" className="mt-4 space-y-5">
          <DataTableCard
            title="拦截统计"
            description="按 端口×IP×原因 记录被站点拒绝/限流的请求（内存态，重启清零）。"
            actions={
              <Button
                variant="outline"
                size="sm"
                disabled={resetBlocksMut.isPending || blocks.length === 0}
                onClick={() => resetBlocksMut.mutate()}
              >
                清空统计
              </Button>
            }
          >
            <Table>
              <colgroup><col style={{ width: "18%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "20%" }} /><col style={{ width: "24%" }} /><col style={{ width: "14%" }} /></colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>来源 IP</TableHead>
                  <TableHead>403 拒绝</TableHead>
                  <TableHead>429 限流</TableHead>
                  <TableHead>最近原因</TableHead>
                  <TableHead>首次 / 最近</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blocks.length === 0 ? (
                  <TableStateRow colSpan={6}>
                    {blocksLoading
                      ? "加载中…"
                      : "暂无拦截记录。站点级 IP 名单、限流或路由脚本 deny 触发后，此处会实时计数。"}
                  </TableStateRow>
                ) : (
                  blocks.map((b) => (
                    <TableRow key={b.ip}>
                      <TableCell className="font-mono text-xs">{b.ip}</TableCell>
                      <TableCell className="font-mono text-xs">{b.count403}</TableCell>
                      <TableCell className="font-mono text-xs">{b.count429}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {b.last_reason}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[11px] text-text3">
                        {new Date(b.first_seen).toLocaleString()}
                        <br />
                        {new Date(b.last_seen).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions>
                          <IconTooltip label="加入站点黑名单">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-danger"
                              aria-label="加入黑名单"
                              disabled={blockIPMut.isPending}
                              onClick={() => blockIPMut.mutate(b.ip)}
                            >
                              <Shield className="h-3.5 w-3.5" />
                            </Button>
                          </IconTooltip>
                        </RowActions>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </DataTableCard>
        </TabsContent>
      </TabBar>

      <FormDialog
        open={appOpen}
        onOpenChange={setAppOpen}
        title={editingApp ? "编辑 APP" : "新建 APP"}
        description="静态前端：路径 + 目录（相对 data）"
        width="max-w-lg"
        onSubmit={() => {
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
        loading={saveAppMut.isPending}
      >
        <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="名称">
              <Input
                value={appForm.name}
                onChange={(e) => setAppForm((f) => ({ ...f, name: e.target.value }))}
              />
            </FormField>
            <FormField label="编码">
              <Input
                className="font-mono"
                disabled={!!editingApp}
                value={appForm.code}
                onChange={(e) => setAppForm((f) => ({ ...f, code: e.target.value }))}
              />
            </FormField>
            <FormField label="访问路径">
              <Input
                className="font-mono"
                value={appForm.path_prefix}
                onChange={(e) => setAppForm((f) => ({ ...f, path_prefix: e.target.value }))}
              />
            </FormField>
            <FormField label="静态目录 root_dir" className="sm:col-span-1">
              <Input
                className="font-mono"
                value={appForm.root_dir}
                onChange={(e) => setAppForm((f) => ({ ...f, root_dir: e.target.value }))}
                placeholder="apps/webapp"
              />
            </FormField>
            <LabeledSwitch
              boxed
              label="去掉路径前缀"
              checked={appForm.strip_prefix}
              onCheckedChange={(v) => setAppForm((f) => ({ ...f, strip_prefix: v }))}
            />
            <LabeledSwitch
              boxed
              label="SPA fallback"
              checked={appForm.spa_fallback}
              onCheckedChange={(v) => setAppForm((f) => ({ ...f, spa_fallback: v }))}
            />
            <LabeledSwitch
              boxed
              label="启用"
              className="sm:col-span-2"
              checked={appForm.enabled}
              onCheckedChange={(v) => setAppForm((f) => ({ ...f, enabled: v }))}
            />
        </div>
      </FormDialog>

      <FormDialog
        open={proxyOpen}
        onOpenChange={setProxyOpen}
        title={editingProxy ? "编辑反代" : "添加反代"}
        description="配置反向代理转发规则"
        width="max-w-lg"
        onSubmit={() => {
          const body = {
            port_id: siteId,
            name: proxyForm.name,
            enabled: proxyForm.enabled,
            path_prefix: proxyForm.path_prefix,
            strip_prefix: proxyForm.strip_prefix,
            upstream: proxyForm.upstream,
            connect_timeout_sec: Number(proxyForm.connect_timeout_sec) || 10,
            response_header_timeout_sec: Number(proxyForm.response_header_timeout_sec) || 60,
            io_timeout_sec: Number(proxyForm.io_timeout_sec) || 0,
            max_body_bytes: Number(proxyForm.max_body_bytes) || 0,
            pass_host: proxyForm.pass_host,
            enable_websocket: proxyForm.enable_websocket,
            description: proxyForm.description,
            ip_whitelist: proxyForm.ip_whitelist,
            ip_blacklist: proxyForm.ip_blacklist,
          };
          if (!editingProxy) body.code = proxyForm.code;
          saveProxyMut.mutate(body);
        }}
        loading={saveProxyMut.isPending}
      >
        <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="编码">
              <Input
                className="font-mono"
                disabled={!!editingProxy}
                value={proxyForm.code}
                onChange={(e) => setProxyForm((f) => ({ ...f, code: e.target.value }))}
              />
            </FormField>
            <FormField label="名称">
              <Input
                value={proxyForm.name}
                onChange={(e) => setProxyForm((f) => ({ ...f, name: e.target.value }))}
              />
            </FormField>
            <FormField label="路径前缀">
              <Input
                className="font-mono"
                value={proxyForm.path_prefix}
                onChange={(e) => setProxyForm((f) => ({ ...f, path_prefix: e.target.value }))}
              />
            </FormField>
            <LabeledSwitch
              boxed
              label="去掉前缀"
              checked={proxyForm.strip_prefix}
              onCheckedChange={(v) => setProxyForm((f) => ({ ...f, strip_prefix: v }))}
            />
            <FormField label="上游 upstream" className="sm:col-span-2">
              <Input
                className="font-mono"
                value={proxyForm.upstream}
                onChange={(e) => setProxyForm((f) => ({ ...f, upstream: e.target.value }))}
              />
            </FormField>
            <FormField label="Body 上限(0=不限)">
              <Input
                type="number"
                value={proxyForm.max_body_bytes}
                onChange={(e) =>
                  setProxyForm((f) => ({ ...f, max_body_bytes: Number(e.target.value) }))
                }
              />
            </FormField>
            <FormField label="IO 超时秒(0=不限)">
              <Input
                type="number"
                value={proxyForm.io_timeout_sec}
                onChange={(e) =>
                  setProxyForm((f) => ({ ...f, io_timeout_sec: Number(e.target.value) }))
                }
              />
            </FormField>
            <LabeledSwitch
              boxed
              label="启用"
              checked={proxyForm.enabled}
              onCheckedChange={(v) => setProxyForm((f) => ({ ...f, enabled: v }))}
            />
            <LabeledSwitch
              boxed
              label="WebSocket"
              checked={proxyForm.enable_websocket}
              onCheckedChange={(v) =>
                setProxyForm((f) => ({ ...f, enable_websocket: v }))
              }
            />
        </div>
          <div className="mt-3 space-y-3">
            <FormField
              label="IP 白名单"
              hint="非空时仅允许列表内 IP 访问该反代规则；格式与站点级相同（IP/CIDR，换行或逗号分隔）。"
            >
              <Textarea
                rows={2}
                className="font-mono text-xs"
                placeholder={"10.0.0.0/8\n192.168.1.1"}
                value={proxyForm.ip_whitelist}
                onChange={(e) => setProxyForm((f) => ({ ...f, ip_whitelist: e.target.value }))}
              />
            </FormField>
            <FormField label="IP 黑名单">
              <Textarea
                rows={2}
                className="font-mono text-xs"
                placeholder={"1.2.3.4\n203.0.113.0/24"}
                value={proxyForm.ip_blacklist}
                onChange={(e) => setProxyForm((f) => ({ ...f, ip_blacklist: e.target.value }))}
              />
            </FormField>
          </div>
      </FormDialog>

      {/* ===== Script Dialog ===== */}
      <FormDialog
        open={scriptOpen}
        onOpenChange={setScriptOpen}
        title={editingScript ? "编辑路由脚本" : "添加路由脚本"}
        description="JSON 规则数组，priority 越小越先执行"
        width="max-w-2xl"
        onSubmit={() => {
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
        loading={saveScriptMut.isPending}
      >
        <div className="grid gap-3 sm:grid-cols-2">
            {!editingScript && templates.length > 0 && (
              <FormField label="套用模板" className="sm:col-span-2">
                <SelectField
                  value={scriptForm.template_id || "__none__"}
                  placeholder="自定义 / 不套用"
                  options={[
                    { value: "__none__", label: "自定义 / 不套用" },
                    ...templates.map((tpl) => ({
                      value: String(tpl.id),
                      label: `[${CATEGORY_LABEL[tpl.category] || tpl.category}] ${tpl.name}`,
                    })),
                  ]}
                  onChange={(tid) => {
                    if (!tid || tid === "__none__") {
                      setScriptForm((f) => ({ ...f, template_id: "" }));
                      return;
                    }
                    const tpl = templates.find((t) => String(t.id) === String(tid));
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
                />
              </FormField>
            )}
            <FormField label="编码">
              <Input
                className="font-mono"
                disabled={!!editingScript}
                value={scriptForm.code}
                onChange={(e) => setScriptForm((f) => ({ ...f, code: e.target.value }))}
              />
            </FormField>
            <FormField label="名称">
              <Input
                value={scriptForm.name}
                onChange={(e) => setScriptForm((f) => ({ ...f, name: e.target.value }))}
              />
            </FormField>
            <FormField label="作用域">
              <Input
                className="font-mono"
                value={scriptForm.path_prefix}
                onChange={(e) => setScriptForm((f) => ({ ...f, path_prefix: e.target.value }))}
              />
            </FormField>
            <FormField label="优先级">
              <Input
                type="number"
                value={scriptForm.priority}
                onChange={(e) =>
                  setScriptForm((f) => ({ ...f, priority: Number(e.target.value) }))
                }
              />
            </FormField>
            <LabeledSwitch
              boxed
              label="启用"
              className="sm:col-span-2"
              checked={scriptForm.enabled}
              onCheckedChange={(v) => setScriptForm((f) => ({ ...f, enabled: v }))}
            />
            <FormField label="Script JSON" className="sm:col-span-2">
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
            </FormField>
        </div>
      </FormDialog>

      {/* Deletes */}
      <ConfirmDialog
        open={!!deletingApp}
        onOpenChange={(v) => !v && setDeletingApp(null)}
        title={`删除 APP ${deletingApp?.code}？`}
        description="仅删配置，不删磁盘文件。"
        confirmText="删除"
        loading={delAppMut.isPending}
        onConfirm={() => delAppMut.mutate(deletingApp.id)}
      />

      <ConfirmDialog
        open={!!deletingProxy}
        onOpenChange={(v) => !v && setDeletingProxy(null)}
        title={`删除反代 ${deletingProxy?.code}？`}
        confirmText="删除"
        loading={delProxyMut.isPending}
        onConfirm={() => delProxyMut.mutate(deletingProxy.id)}
      />

      <ConfirmDialog
        open={!!deletingScript}
        onOpenChange={(v) => !v && setDeletingScript(null)}
        title={`删除脚本 ${deletingScript?.code}？`}
        confirmText="删除"
        loading={delScriptMut.isPending}
        onConfirm={() => delScriptMut.mutate(deletingScript.id)}
      />

      <FormDialog
        open={accessOpen}
        onOpenChange={setAccessOpen}
        title={`IP 访问控制 · :${site.port}`}
        description="黑名单优先拒绝；白名单非空时仅允许列表内 IP，支持单 IP 与 CIDR"
        onSubmit={() => saveAccessMut.mutate({ ip_whitelist: accessForm.ip_whitelist, ip_blacklist: accessForm.ip_blacklist })}
        loading={saveAccessMut.isPending}
      >
            <FormField label="白名单">
              <Textarea
                rows={4}
                className="font-mono text-xs"
                placeholder={"10.0.0.0/8\n192.168.1.1"}
                value={accessForm.ip_whitelist}
                onChange={(e) =>
                  setAccessForm((f) => ({ ...f, ip_whitelist: e.target.value }))
                }
              />
            </FormField>
            <FormField label="黑名单">
              <Textarea
                rows={4}
                className="font-mono text-xs"
                placeholder={"1.2.3.4\n203.0.113.0/24"}
                value={accessForm.ip_blacklist}
                onChange={(e) =>
                  setAccessForm((f) => ({ ...f, ip_blacklist: e.target.value }))
                }
              />
            </FormField>
      </FormDialog>
    </PageShell>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Search,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { gatewayApi } from "@/lib/api";
import { siteURL } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  ConfirmDialog,
  FormField,
  PageTemplate,
  RowActions,
  SegmentedPicker,
  TableStateRow,
  TextActionButton,
  TextActionLink,
} from "@/components/ued";

const EMPTY = {
  port: 18090,
  name: "",
  enabled: true,
  description: "",
  ip_whitelist: "",
  ip_blacklist: "",
};

const PAGE_SIZE = 10;

export function Sites() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState(null);
  const [enabledFilter, setEnabledFilter] = useState("all");
  const [keyword, setKeyword] = useState("");

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
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

  const enabledCount = useMemo(() => {
    const count = { all: sites.length, on: 0, off: 0 };
    for (const s of sites) {
      if (s.enabled) count.on++;
      else count.off++;
    }
    return count;
  }, [sites]);

  const filtered = useMemo(() => {
    let list = sites;
    if (enabledFilter !== "all") {
      list = list.filter((s) => (enabledFilter === "on" ? s.enabled : !s.enabled));
    }
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name?.toLowerCase().includes(kw) ||
          String(s.port)?.includes(kw) ||
          s.description?.toLowerCase().includes(kw)
      );
    }
    return list;
  }, [sites, enabledFilter, keyword]);

  const pg = usePagination(filtered, PAGE_SIZE);

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

  const toggleEnabled = (s) => {
    gatewayApi
      .updatePort(s.id, { enabled: !s.enabled })
      .then(() => {
        toast.success(s.enabled ? "已停用" : "已启用");
        invalidate();
      })
      .catch((err) => toast.error(err.message));
  };

  return (
    <PageTemplate
      list
      title="站点管理"
      description={`每个站点对应一个动态监听端口；进入站点后管理 APP（静态）、反代规则与路由脚本。共 ${sites.length} 个站点。`}
      onRefresh={() => refetch()}
      isRefreshing={isFetching}
      error={isError ? "加载站点列表失败，请确认后端服务已启动。" : null}
      actions={
        <>
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
            <Plus className="h-3.5 w-3.5 mr-1" /> 新建站点
          </Button>
        </>
      }
      filters={
        <>
          <SegmentedPicker
            options={[
              { value: "all", label: `全部(${enabledCount.all})` },
              { value: "on", label: `启用(${enabledCount.on})` },
              { value: "off", label: `停用(${enabledCount.off})` },
            ]}
            value={enabledFilter}
            onChange={setEnabledFilter}
            size="sm"
          />
          <div className="ml-auto flex h-8 items-center gap-1.5 rounded-sm bg-bg1 px-3 shadow-[0_0_0_1px_var(--border-2)]">
            <Search className="h-4 w-4 shrink-0 text-text3" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索站点名称或端口"
              className="h-8 w-44 border-none bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:border-transparent"
            />
          </div>
        </>
      }
      pagination={
        !isLoading && filtered.length > 0
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
      {runtime.length === 0 ? (
        <div className="border-b border-border1 px-4 py-3 text-xs text-text3">
          当前无 LISTEN（启用站点并添加 APP/反代/脚本后生效）
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 border-b border-border1 px-4 py-3">
          {runtime.map((r) => (
            <Badge key={r.port} variant="secondary" className="font-mono">
              :{r.port} · {r.rule_count || 0} 规则
              {r.script_count ? ` · ${r.script_count} 脚本` : ""}
            </Badge>
          ))}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>站点</TableHead>
            <TableHead className="w-[110px]">端口</TableHead>
            <TableHead className="w-[60px]">APP</TableHead>
            <TableHead className="w-[60px]">反代</TableHead>
            <TableHead className="w-[60px]">脚本</TableHead>
            <TableHead className="w-[120px]">状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableStateRow colSpan={7}>加载中…</TableStateRow>
          ) : filtered.length === 0 ? (
            <TableStateRow colSpan={7}>
              暂无站点。先新建站点（监听端口），再进入站点配置 APP 与反代。
            </TableStateRow>
          ) : (
            pg.pageItems.map((s) => {
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
                      <div className="text-[11px] text-text3 line-clamp-1">
                        {s.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono">
                    :{s.port}
                    {s.enabled && listening.has(s.port) && (
                      <span className="ml-1 text-[10px] text-success">LISTEN</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{appN}</TableCell>
                  <TableCell className="text-xs">{pxN}</TableCell>
                  <TableCell className="text-xs">{scN}</TableCell>
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
                        <Badge variant="outline" className="text-[10px] text-danger">
                          黑名单
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <RowActions className="justify-end">
                      <TextActionLink to={`/sites/${s.id}`}>
                        <ChevronRight className="h-3 w-3" /> 进入
                      </TextActionLink>
                      <TextActionLink
                        href={siteURL(s.port)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="h-3 w-3" /> 打开
                      </TextActionLink>
                      <TextActionButton onClick={() => toggleEnabled(s)}>
                        {s.enabled ? (
                          <>
                            <PowerOff className="h-3 w-3" /> 停用
                          </>
                        ) : (
                          <>
                            <Power className="h-3 w-3" /> 启用
                          </>
                        )}
                      </TextActionButton>
                      <TextActionButton onClick={() => openEdit(s)}>
                        <Pencil className="h-3 w-3" /> 编辑
                      </TextActionButton>
                      <TextActionButton tone="danger" onClick={() => setDeleting(s)}>
                        <Trash2 className="h-3 w-3" /> 删除
                      </TextActionButton>
                    </RowActions>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑站点" : "新建站点"}</DialogTitle>
            <DialogDescription>
              站点绑定一个监听端口；创建后进入站点配置 APP 与反代。端口号创建后不可改。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <FormField label="监听端口">
              <Input
                type="number"
                className="font-mono"
                disabled={!!editing}
                value={form.port}
                onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))}
              />
            </FormField>
            <FormField label="站点名称">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例如 官网 / 管理后台"
              />
            </FormField>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm font-medium">启用</span>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
                aria-label="启用站点"
              />
            </div>
            <FormField
              label="IP 白名单"
              hint="非空时仅允许列表内访问；黑名单优先于白名单。"
            >
              <Textarea
                rows={3}
                className="font-mono text-xs"
                placeholder={"留空=不限制\n每行一个 IP 或 CIDR\n例: 10.0.0.0/8\n192.168.1.1"}
                value={form.ip_whitelist}
                onChange={(e) => setForm((f) => ({ ...f, ip_whitelist: e.target.value }))}
              />
            </FormField>
            <FormField label="IP 黑名单">
              <Textarea
                rows={3}
                className="font-mono text-xs"
                placeholder={"例: 1.2.3.4\n203.0.113.0/24"}
                value={form.ip_blacklist}
                onChange={(e) => setForm((f) => ({ ...f, ip_blacklist: e.target.value }))}
              />
            </FormField>
            <FormField label="备注">
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </FormField>
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

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`删除站点 :${deleting?.port}？`}
        description="将级联删除该站点下的 APP、反代与路由脚本（静态文件不会自动删除）。"
        confirmText="删除"
        loading={delMut.isPending}
        onConfirm={() => delMut.mutate({ id: deleting.id, force: true })}
      />
    </PageTemplate>
  );
}

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Cable,
  Network,
} from "lucide-react";
import { tunnelApi, api } from "@/lib/api";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ConfirmDialog,
  FormField,
  FormGrid,
  IconTooltip,
  PageTemplate,
  RowActions,
  TableStateRow,
} from "@/components/ued";

const EMPTY = {
  code: "",
  name: "",
  enabled: true,
  agent_id: "",
  listen_host: "",
  listen_port: 18090,
  remote_host: "127.0.0.1",
  remote_port: 8080,
  max_conns: 64,
  idle_timeout_sec: 0,
  description: "",
};

function statusBadge(rt) {
  if (!rt) return <Badge variant="secondary">未知</Badge>;
  if (rt.listening && rt.agent_online) {
    return <Badge variant="success">转发中</Badge>;
  }
  if (rt.listening && !rt.agent_online) {
    return <Badge variant="warning">等待 Agent</Badge>;
  }
  if (rt.waiting_agent) {
    return <Badge variant="warning">等待 Agent</Badge>;
  }
  if (rt.error) {
    return (
      <Badge variant="danger" title={rt.error}>
        错误
      </Badge>
    );
  }
  return <Badge variant="secondary">未监听</Badge>;
}

export function Tunnels() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [deleting, setDeleting] = useState(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["tunnels"],
    queryFn: tunnelApi.list,
    refetchInterval: 5000,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get("/api/agents"),
    refetchInterval: 10000,
  });

  const items = data?.items || [];
  const sessions = data?.sessions || [];
  const rules = useMemo(
    () => items.map((it) => ({ ...(it.rule || {}), runtime: it.runtime })),
    [items]
  );
  const pg = usePagination(rules, 10);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tunnels"] });

  const saveMut = useMutation({
    mutationFn: (body) =>
      editing ? tunnelApi.update(editing.id, body) : tunnelApi.create(body),
    onSuccess: () => {
      toast.success(editing ? "规则已更新" : "规则已创建");
      setOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const delMut = useMutation({
    mutationFn: (id) => tunnelApi.remove(id),
    onSuccess: () => {
      toast.success("已删除");
      setDeleting(null);
      invalidate();
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const enableMut = useMutation({
    mutationFn: ({ id, enabled }) => tunnelApi.enable(id, enabled),
    onSuccess: (_, v) => {
      toast.success(v.enabled ? "已启用" : "已停用");
      invalidate();
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY,
      agent_id: agents.find((a) => a.online)?.agent_id || agents[0]?.agent_id || "",
    });
    setOpen(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    setForm({
      code: r.code,
      name: r.name,
      enabled: !!r.enabled,
      agent_id: r.agent_id,
      listen_host: r.listen_host || "",
      listen_port: r.listen_port,
      remote_host: r.remote_host || "127.0.0.1",
      remote_port: r.remote_port,
      max_conns: r.max_conns ?? 64,
      idle_timeout_sec: r.idle_timeout_sec ?? 0,
      description: r.description || "",
    });
    setOpen(true);
  };

  const onSave = () => {
    if (!form.name.trim()) {
      toast.error("请填写名称");
      return;
    }
    if (!editing && !form.code.trim()) {
      toast.error("请填写编码");
      return;
    }
    if (!form.agent_id.trim()) {
      toast.error("请填写或选择 Agent ID");
      return;
    }
    const body = {
      name: form.name.trim(),
      enabled: form.enabled,
      agent_id: form.agent_id.trim(),
      listen_host: form.listen_host.trim(),
      listen_port: Number(form.listen_port),
      remote_host: form.remote_host.trim() || "127.0.0.1",
      remote_port: Number(form.remote_port),
      max_conns: Number(form.max_conns) || 0,
      idle_timeout_sec: Number(form.idle_timeout_sec) || 0,
      description: form.description,
    };
    if (!editing) {
      body.code = form.code.trim();
    }
    saveMut.mutate(body);
  };

  // 编辑既有规则时,其 agent 可能已离线被清理,补一项保证回显
  const agentOptions = useMemo(() => {
    const list = agents.map((a) => ({
      id: a.agent_id,
      label: `${a.agent_id}（${a.online ? "在线" : "离线"}${a.host ? ` · ${a.host}` : ""}）`,
    }));
    if (form.agent_id && !list.some((a) => a.id === form.agent_id)) {
      list.push({ id: form.agent_id, label: `${form.agent_id}（未知/未上报）` });
    }
    return list;
  }, [agents, form.agent_id]);

  return (
    <PageTemplate
      card
      cardIcon={Cable}
      cardTitle="流量隧道"
      cardDescription="反向 TCP：中心监听端口 → 经 Agent 隧道转发到内网服务（类似 SSH -R）。Agent 需主动连接中心（mode=agent + controller-url）。"
      onRefresh={() => refetch()}
      isRefreshing={isFetching}
      cardActions={
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1" /> 新建规则
        </Button>
      }
      footer={
        <p className="border-t px-6 py-3 text-[11px] text-muted-foreground">
          示例：中心 -mode controller -port 19090 -agent-token secret；Agent -mode agent
          -controller-url http://中心:19090 -agent-token secret。规则 listen=18090 →
          agent 上 127.0.0.1:8080 后，访问中心:18090 即打到内网服务。
        </p>
      }
      pagination={
        !isLoading && rules.length > 0
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
        {/* 在线会话 */}
        <div className="border-b px-6 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Network className="h-3.5 w-3.5" />
            隧道会话（Agent 已连接）
          </div>
          {sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              暂无会话。请用 agent 模式启动节点并配置 ALUKA_CONTROLLER_URL / ALUKA_AGENT_TOKEN。
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sessions.map((s) => (
                <Badge key={s.agent_id} variant="success" className="font-mono">
                  {s.agent_id}
                  <span className="ml-1 opacity-70">streams {s.active_streams ?? 0}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>中心端口</TableHead>
              <TableHead>远端</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>连接</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableStateRow colSpan={7}>加载中…</TableStateRow>
            ) : rules.length === 0 ? (
              <TableStateRow colSpan={7}>
                暂无隧道规则。创建后中心将在 listen_port 上接受连接并转发到 Agent。
              </TableStateRow>
            ) : (
              pg.pageItems.map((r) => {
                const rt = r.runtime || {};
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {r.code}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.agent_id}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.listen_host || "0.0.0.0"}:{r.listen_port}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.remote_host}:{r.remote_port}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {statusBadge(rt)}
                        {!r.enabled && <Badge variant="secondary">停用</Badge>}
                      </div>
                      {rt.error && (
                        <div
                          className="mt-0.5 max-w-[180px] truncate text-[10px] text-destructive"
                          title={rt.error}
                        >
                          {rt.error}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      活跃 {rt.active_conns ?? 0}
                      <span className="mx-1">·</span>
                      累计 {rt.total_conns ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions>
                        <IconTooltip label={r.enabled ? "停用" : "启用"}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={r.enabled ? "停用规则" : "启用规则"}
                            disabled={enableMut.isPending}
                            onClick={() =>
                              enableMut.mutate({ id: r.id, enabled: !r.enabled })
                            }
                          >
                            {r.enabled ? (
                              <PowerOff className="h-3.5 w-3.5" />
                            ) : (
                              <Power className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </IconTooltip>
                        <IconTooltip label="编辑">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="编辑规则"
                            onClick={() => openEdit(r)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </IconTooltip>
                        <IconTooltip label="删除">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            aria-label="删除规则"
                            onClick={() => setDeleting(r)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </IconTooltip>
                      </RowActions>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑隧道规则" : "新建隧道规则"}</DialogTitle>
            <DialogDescription>
              中心在 listen_port 监听，流量经已连接的 Agent 转发到 remote_host:remote_port。
            </DialogDescription>
          </DialogHeader>
          <FormGrid cols={2} className="gap-3">
            {!editing && (
              <FormField label="编码 code" className="sm:col-span-2">
                <Input
                  className="font-mono"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="office-web"
                />
              </FormField>
            )}
            <FormField label="名称" className="sm:col-span-2">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="办公网 Web"
              />
            </FormField>
            <FormField
              label="目标 Agent ID"
              className="sm:col-span-2"
              hint={agentOptions.length === 0 ? "暂无 Agent 上报，可稍后在 Agents 页确认" : undefined}
            >
              {agentOptions.length > 0 ? (
                <Select
                  value={form.agent_id || undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, agent_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择 Agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agentOptions.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="font-mono"
                  value={form.agent_id}
                  onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
                  placeholder="office-1"
                />
              )}
            </FormField>
            <FormField label="中心监听端口">
              <Input
                type="number"
                value={form.listen_port}
                onChange={(e) =>
                  setForm((f) => ({ ...f, listen_port: Number(e.target.value) }))
                }
              />
            </FormField>
            <FormField label="监听地址(可选)">
              <Input
                className="font-mono"
                value={form.listen_host}
                onChange={(e) => setForm((f) => ({ ...f, listen_host: e.target.value }))}
                placeholder="0.0.0.0"
              />
            </FormField>
            <FormField label="远端 Host">
              <Input
                className="font-mono"
                value={form.remote_host}
                onChange={(e) => setForm((f) => ({ ...f, remote_host: e.target.value }))}
                placeholder="127.0.0.1"
              />
            </FormField>
            <FormField label="远端 Port">
              <Input
                type="number"
                value={form.remote_port}
                onChange={(e) =>
                  setForm((f) => ({ ...f, remote_port: Number(e.target.value) }))
                }
              />
            </FormField>
            <FormField label="最大并发">
              <Input
                type="number"
                value={form.max_conns}
                onChange={(e) =>
                  setForm((f) => ({ ...f, max_conns: Number(e.target.value) }))
                }
              />
            </FormField>
            <FormField label="空闲超时(秒,0=不限)">
              <Input
                type="number"
                value={form.idle_timeout_sec}
                onChange={(e) =>
                  setForm((f) => ({ ...f, idle_timeout_sec: Number(e.target.value) }))
                }
              />
            </FormField>
            <div className="flex items-center justify-between rounded-md border px-3 py-2 sm:col-span-2">
              <span className="text-sm font-medium">启用</span>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
                aria-label="启用规则"
              />
            </div>
            <FormField label="备注" className="sm:col-span-2">
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </FormField>
          </FormGrid>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={onSave} disabled={saveMut.isPending}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="删除隧道规则？"
        description={
          <>
            将删除 <span className="font-mono text-foreground">{deleting?.code}</span>
            ，并停止中心端口 {deleting?.listen_port} 的监听。
          </>
        }
        confirmText="删除"
        loading={delMut.isPending}
        onConfirm={() => delMut.mutate(deleting.id)}
      />
    </PageTemplate>
  );
}

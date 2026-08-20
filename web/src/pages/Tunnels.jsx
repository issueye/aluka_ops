import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Network,
} from "lucide-react";
import { tunnelApi, api } from "@/lib/api";
import { usePagination } from "@/hooks/usePagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/ued/FormDialog";
import {
  ConfirmDialog,
  FormField,
  PageTemplate,
  RowActions,
  ActionButton,
  DataTable,
  IconButton,
  SelectField,
  LabeledSwitch,
  Icon,
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
      list
      title="流量隧道"
      description="反向 TCP：中心监听端口 → 经 Agent 隧道转发到内网服务（类似 SSH -R）。"
      onRefresh={() => refetch()}
      isRefreshing={isFetching}
      actions={
        <ActionButton icon={Plus} onClick={openCreate}>
          新建规则
        </ActionButton>
      }
      footer={
        <p className="border-t border-border1 px-5 py-3 text-xs text-text3">
          示例：中心 -mode controller；Agent -mode agent -controller-url …。规则 listen=18090 →
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
        <DataTable
          loading={isLoading}
          data={pg.pageItems}
          empty="暂无隧道规则。创建后中心将在 listen_port 上接受连接并转发到 Agent。"
          columns={[
            {
              key: "name",
              title: "名称",
              render: (r) => (
                <>
                  <div className="font-medium">{r.name}</div>
                  <div className="font-mono text-[11px] text-text3">{r.code}</div>
                </>
              ),
            },
            {
              key: "agent_id",
              title: "Agent",
              className: "font-mono text-xs",
            },
            {
              key: "listen",
              title: "中心端口",
              className: "font-mono text-xs",
              render: (r) => `${r.listen_host || "0.0.0.0"}:${r.listen_port}`,
            },
            {
              key: "remote",
              title: "远端",
              className: "font-mono text-xs",
              render: (r) => `${r.remote_host}:${r.remote_port}`,
            },
            {
              key: "status",
              title: "状态",
              render: (r) => {
                const rt = r.runtime || {};
                return (
                  <>
                    <div className="flex flex-wrap items-center gap-1">
                      {statusBadge(rt)}
                      {!r.enabled && <Badge variant="secondary">停用</Badge>}
                    </div>
                    {rt.error && (
                      <div
                        className="mt-0.5 max-w-[180px] truncate text-[10px] text-danger"
                        title={rt.error}
                      >
                        {rt.error}
                      </div>
                    )}
                  </>
                );
              },
            },
            {
              key: "conns",
              title: "连接",
              className: "text-xs text-text3",
              render: (r) => {
                const rt = r.runtime || {};
                return (
                  <>
                    活跃 {rt.active_conns ?? 0}
                    <span className="mx-1">·</span>
                    累计 {rt.total_conns ?? 0}
                  </>
                );
              },
            },
            {
              key: "actions",
              title: "操作",
              align: "right",
              render: (r) => (
                <RowActions>
                  <IconButton
                    icon={r.enabled ? PowerOff : Power}
                    label={r.enabled ? "停用" : "启用"}
                    disabled={enableMut.isPending}
                    onClick={() => enableMut.mutate({ id: r.id, enabled: !r.enabled })}
                  />
                  <IconButton icon={Pencil} label="编辑" onClick={() => openEdit(r)} />
                  <IconButton
                    icon={Trash2}
                    label="删除"
                    className="text-danger"
                    onClick={() => setDeleting(r)}
                  />
                </RowActions>
              ),
            },
          ]}
        />

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "编辑隧道规则" : "新建隧道规则"}
        description="中心在 listen_port 监听，流量经已连接的 Agent 转发到 remote_host:remote_port"
        width="max-w-lg"
        onSubmit={onSave}
        loading={saveMut.isPending}
      >
        <div className="grid gap-3 sm:grid-cols-2">
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
                <SelectField
                  value={form.agent_id}
                  onChange={(v) => setForm((f) => ({ ...f, agent_id: v }))}
                  placeholder="选择 Agent"
                  options={agentOptions.map((a) => ({ value: a.id, label: a.label }))}
                />
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
            <LabeledSwitch
              boxed
              className="sm:col-span-2"
              label="启用"
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
            <FormField label="备注" className="sm:col-span-2">
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </FormField>
        </div>

      </FormDialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="删除隧道规则？"
        description={
          <>
            将删除 <span className="font-mono text-text1">{deleting?.code}</span>
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

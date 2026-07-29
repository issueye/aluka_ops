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
  Cable,
  Network,
} from "lucide-react";
import { tunnelApi, api } from "@/lib/api";
import { usePagination } from "@/hooks/usePagination";
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
import { PaginationBar } from "@/components/ui/pagination";
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
import { PageShell } from "@/components/ued";

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

  return (
    <PageShell>
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Cable className="h-4 w-4" />
                流量隧道
              </CardTitle>
              <CardDescription>
                反向 TCP：中心监听端口 → 经 Agent 隧道转发到内网服务（类似 SSH -R）。Agent
                需主动连接中心（mode=agent + controller-url）。
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
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                新建规则
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 在线会话 */}
            <div className="rounded-md border bg-muted/20 p-3">
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

            <div className="rounded-md border">
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
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        加载中…
                      </TableCell>
                    </TableRow>
                  ) : rules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        暂无隧道规则。创建后中心将在 listen_port 上接受连接并转发到 Agent。
                      </TableCell>
                    </TableRow>
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
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title={r.enabled ? "停用" : "启用"}
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
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEdit(r)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => setDeleting(r)}
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
              {!isLoading && rules.length > 0 && (
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
            </div>
            <p className="text-[11px] text-muted-foreground">
              示例：中心 -mode controller -port 19090 -agent-token secret；Agent -mode agent
              -controller-url http://中心:19090 -agent-token secret。规则 listen=18090 →
              agent 上 127.0.0.1:8080 后，访问中心:18090 即打到内网服务。
            </p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑隧道规则" : "新建隧道规则"}</DialogTitle>
            <DialogDescription>
              中心在 listen_port 监听，流量经已连接的 Agent 转发到 remote_host:remote_port。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {!editing && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>编码 code</Label>
                <Input
                  className="font-mono"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="office-web"
                />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="办公网 Web"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>目标 Agent ID</Label>
              <Input
                className="font-mono"
                list="tunnel-agent-list"
                value={form.agent_id}
                onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
                placeholder="office-1"
              />
              <datalist id="tunnel-agent-list">
                {agents.map((a) => (
                  <option key={a.agent_id} value={a.agent_id}>
                    {a.online ? "在线" : "离线"} {a.host || ""}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>中心监听端口</Label>
              <Input
                type="number"
                value={form.listen_port}
                onChange={(e) =>
                  setForm((f) => ({ ...f, listen_port: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>监听地址(可选)</Label>
              <Input
                className="font-mono"
                value={form.listen_host}
                onChange={(e) => setForm((f) => ({ ...f, listen_host: e.target.value }))}
                placeholder="0.0.0.0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>远端 Host</Label>
              <Input
                className="font-mono"
                value={form.remote_host}
                onChange={(e) => setForm((f) => ({ ...f, remote_host: e.target.value }))}
                placeholder="127.0.0.1"
              />
            </div>
            <div className="space-y-1.5">
              <Label>远端 Port</Label>
              <Input
                type="number"
                value={form.remote_port}
                onChange={(e) =>
                  setForm((f) => ({ ...f, remote_port: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>最大并发</Label>
              <Input
                type="number"
                value={form.max_conns}
                onChange={(e) =>
                  setForm((f) => ({ ...f, max_conns: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>空闲超时(秒,0=不限)</Label>
              <Input
                type="number"
                value={form.idle_timeout_sec}
                onChange={(e) =>
                  setForm((f) => ({ ...f, idle_timeout_sec: Number(e.target.value) }))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
              <Label htmlFor="tun-en">启用</Label>
              <Switch
                id="tun-en"
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>备注</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
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

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除隧道规则？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除{" "}
              <span className="font-mono text-foreground">{deleting?.code}</span>
              ，并停止中心端口 {deleting?.listen_port} 的监听。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => delMut.mutate(deleting.id)}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  FileCode2,
  Rocket,
} from "lucide-react";
import { templateApi, runtimeApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTime } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import { PageShell } from "@/components/ued";

const DEFAULT_CONFIG = `{
  "command": "{{jar_path}}",
  "args": "--server.port={{port}}",
  "jvm_args": "-Xms256m -Xmx512m",
  "env_vars": "",
  "port": "{{port}}",
  "auto_restart": true,
  "max_restarts": 3,
  "shutdown_timeout": 30,
  "health_check": "{\\"type\\":\\"tcp\\",\\"target\\":\\"127.0.0.1:{{port}}\\"}"
}`;

const EMPTY_TPL = {
  name: "",
  type: "jar",
  description: "",
  config_template: DEFAULT_CONFIG,
  default_runtime_id: "",
};

export function Templates() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_TPL);
  const [deleting, setDeleting] = useState(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyTpl, setApplyTpl] = useState(null);
  const [applyForm, setApplyForm] = useState({
    code: "",
    name: "",
    description: "",
    work_dir: "",
    runtime_id: "",
    vars: {},
  });

  const { data: templates = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["templates"],
    queryFn: templateApi.list,
  });

  const pg = usePagination(templates, 10);
  const { data: runtimes = [] } = useQuery({
    queryKey: ["runtimes"],
    queryFn: runtimeApi.list,
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: (payload) =>
      editing ? templateApi.update(editing.id, payload) : templateApi.create(payload),
    onSuccess: () => {
      toast.success(editing ? "模板已更新" : "模板已创建");
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setDialogOpen(false);
    },
    onError: (e) => toast.error(`保存失败: ${e.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => templateApi.remove(id),
    onSuccess: () => {
      toast.success("已删除模板");
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setDeleting(null);
    },
    onError: (e) => toast.error(`删除失败: ${e.message}`),
  });

  const applyMut = useMutation({
    mutationFn: ({ id, body }) => templateApi.apply(id, body),
    onSuccess: (svc) => {
      toast.success(`服务「${svc.name}」已从模板创建`);
      queryClient.invalidateQueries({ queryKey: ["services"] });
      setApplyOpen(false);
      navigate(`/services/${svc.id}`);
    },
    onError: (e) => toast.error(`创建失败: ${e.message}`),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_TPL);
    setDialogOpen(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({
      name: t.name || "",
      type: t.type || "jar",
      description: t.description || "",
      config_template: t.config_template || DEFAULT_CONFIG,
      default_runtime_id: t.default_runtime_id ? String(t.default_runtime_id) : "",
    });
    setDialogOpen(true);
  };

  const openApply = (t) => {
    setApplyTpl(t);
    const vars = {};
    (t.vars || []).forEach((k) => {
      vars[k] = "";
    });
    setApplyForm({
      code: "",
      name: "",
      description: "",
      work_dir: "",
      runtime_id: t.default_runtime_id ? String(t.default_runtime_id) : "",
      vars,
    });
    setApplyOpen(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("名称不能为空");
      return;
    }
    const payload = {
      name: form.name.trim(),
      type: form.type,
      description: form.description.trim(),
      config_template: form.config_template,
      default_runtime_id: form.default_runtime_id
        ? Number(form.default_runtime_id)
        : editing
        ? 0
        : undefined,
    };
    saveMut.mutate(payload);
  };

  const handleApply = (e) => {
    e.preventDefault();
    if (!applyForm.code.trim() || !applyForm.name.trim()) {
      toast.error("编码与名称不能为空");
      return;
    }
    applyMut.mutate({
      id: applyTpl.id,
      body: {
        code: applyForm.code.trim(),
        name: applyForm.name.trim(),
        description: applyForm.description.trim(),
        work_dir: applyForm.work_dir.trim(),
        runtime_id: applyForm.runtime_id ? Number(applyForm.runtime_id) : undefined,
        vars: applyForm.vars,
      },
    });
  };

  return (
    <PageShell>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <FileCode2 className="h-4 w-4" /> 服务模板
            </CardTitle>
            <CardDescription>
              预置服务类型与配置配方,支持 <code className="text-xs">{"{{var}}"}</code> 变量。从模板一键创建服务。
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "animate-spin" : ""} /> 刷新
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus /> 新建模板
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <div className="m-6 rounded-md border border-danger/30 bg-danger-muted p-4 text-sm text-destructive">
              加载失败,请确认后端已启动。
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead className="w-[80px]">类型</TableHead>
                  <TableHead>变量</TableHead>
                  <TableHead className="w-[160px]">更新时间</TableHead>
                  <TableHead className="w-[180px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : templates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      暂无模板,点击「新建模板」创建。
                    </TableCell>
                  </TableRow>
                ) : (
                  pg.pageItems.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div className="font-medium">{t.name}</div>
                        {t.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {t.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="uppercase">
                          {t.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(t.vars || []).length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {t.vars.map((v) => (
                              <Badge key={v} variant="outline" className="font-mono text-xs">
                                {`{{${v}}}`}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatTime(t.updated_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="default" onClick={() => openApply(t)}>
                            <Rocket className="h-3.5 w-3.5" /> 创建服务
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => openEdit(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setDeleting(t)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
              {!isLoading && templates.length > 0 && (
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
            </>
          )}
        </CardContent>
      </Card>

      {/* 新建/编辑模板 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑模板" : "新建模板"}</DialogTitle>
            <DialogDescription>
              config_template 为 JSON,可用 {"{{port}}"} {"{{app_home}}"} 等变量,创建服务时填写。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>名称 *</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>类型</Label>
                <Select value={form.type} onValueChange={(v) => set("type", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jar">jar</SelectItem>
                    <SelectItem value="exe">exe</SelectItem>
                    <SelectItem value="bat">bat</SelectItem>
                    <SelectItem value="sh">sh</SelectItem>
                    <SelectItem value="ps1">ps1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>描述</Label>
              <Input value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>默认 Runtime</Label>
              <Select
                value={form.default_runtime_id || "none"}
                onValueChange={(v) => set("default_runtime_id", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="可选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">无</SelectItem>
                  {runtimes.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name} {r.version ? `(${r.version})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>配置模板(JSON)</Label>
              <Textarea
                rows={12}
                className="font-mono text-xs"
                value={form.config_template}
                onChange={(e) => set("config_template", e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={saveMut.isPending}>
                {saveMut.isPending ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 从模板创建服务 */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>从模板创建服务</DialogTitle>
            <DialogDescription>
              模板: {applyTpl?.name} ({applyTpl?.type})
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleApply} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>编码 *</Label>
                <Input
                  value={applyForm.code}
                  onChange={(e) => setApplyForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="my-app"
                />
              </div>
              <div className="space-y-1.5">
                <Label>名称 *</Label>
                <Input
                  value={applyForm.name}
                  onChange={(e) => setApplyForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>工作目录</Label>
              <Input
                value={applyForm.work_dir}
                onChange={(e) => setApplyForm((f) => ({ ...f, work_dir: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Runtime {applyTpl?.type === "jar" ? "*" : ""}</Label>
              <Select
                value={applyForm.runtime_id || "none"}
                onValueChange={(v) =>
                  setApplyForm((f) => ({ ...f, runtime_id: v === "none" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">无</SelectItem>
                  {runtimes.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(applyTpl?.vars || []).map((v) => (
              <div key={v} className="space-y-1.5">
                <Label className="font-mono">{`{{${v}}}`}</Label>
                <Input
                  value={applyForm.vars[v] || ""}
                  onChange={(e) =>
                    setApplyForm((f) => ({
                      ...f,
                      vars: { ...f.vars, [v]: e.target.value },
                    }))
                  }
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>描述</Label>
              <Input
                value={applyForm.description}
                onChange={(e) => setApplyForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setApplyOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={applyMut.isPending}>
                {applyMut.isPending ? "创建中..." : "创建服务"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除模板?</AlertDialogTitle>
            <AlertDialogDescription>
              将删除「{deleting?.name}」。已从该模板创建的服务不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                deleteMut.mutate(deleting.id);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

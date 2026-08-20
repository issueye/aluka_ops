import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { serviceApi, runtimeApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/ued/FormDialog";
import { SelectField } from "@/components/ued";

// 服务类型说明
const TYPE_HINT = {
  jar: "通过 java -jar 启动,需绑定 JDK 运行环境",
  exe: "直接执行可执行程序(命令即程序路径或名称)",
  bat: "通过 cmd /c 执行批处理",
  sh: "通过 bash -c 执行(Windows 需 Git Bash)",
  ps1: "通过 powershell -Command 执行",
};

const EMPTY = {
  code: "",
  name: "",
  type: "exe",
  description: "",
  runtime_id: "",
  work_dir: "",
  command: "",
  args: "",
  jvm_args: "",
  env_vars: "",
  port: "",
  shutdown_timeout: 10,
};

// ServiceDialog 新建服务对话框(M2 仅支持创建)。
export function ServiceDialog({ open, onOpenChange, onCreated }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  // 加载运行环境列表(jar 类型时选择)
  const { data: runtimes = [] } = useQuery({
    queryKey: ["runtimes"],
    queryFn: runtimeApi.list,
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setErrors({});
    }
  }, [open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const createMut = useMutation({
    mutationFn: (data) => serviceApi.create(data),
    onSuccess: (svc) => {
      toast.success(`服务「${svc.name}」已创建`);
      queryClient.invalidateQueries({ queryKey: ["services"] });
      onOpenChange(false);
      onCreated?.(svc);
    },
    onError: (e) => toast.error(`创建失败: ${e.message}`),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.code.trim()) errs.code = "编码不能为空";
    if (!form.name.trim()) errs.name = "名称不能为空";
    if (!form.command.trim()) errs.command = "启动命令不能为空";
    if (form.type === "jar" && !form.runtime_id) errs.runtime_id = "jar 类型必须选择运行环境";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      type: form.type,
      description: form.description.trim(),
      work_dir: form.work_dir.trim(),
      command: form.command.trim(),
      args: form.args.trim(),
      jvm_args: form.jvm_args.trim(),
      env_vars: form.env_vars.trim(),
      shutdown_timeout: Number(form.shutdown_timeout) || 10,
      port: Number(form.port) || 0,
      runtime_id: form.type === "jar" && form.runtime_id ? Number(form.runtime_id) : undefined,
    };
    createMut.mutate(payload);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="新建服务"
      description="创建后服务处于“待启动”状态，可随时启动/停止/重启"
      width="max-w-2xl"
      onSubmit={handleSubmit}
      loading={createMut.isPending}
      submitText="创建"
    >
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="s-code">编码 *</Label>
              <Input
                id="s-code"
                value={form.code}
                onChange={(e) => set("code", e.target.value)}
                placeholder="如:my-app(用于目录与日志命名)"
              />
              {errors.code && <p className="text-xs text-danger">{errors.code}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-name">名称 *</Label>
              <Input
                id="s-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="如:我的应用"
              />
              {errors.name && <p className="text-xs text-danger">{errors.name}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>类型</Label>
              <SelectField
                value={form.type}
                onChange={(v) => set("type", v)}
                options={[
                  { value: "exe", label: "exe · 可执行程序" },
                  { value: "jar", label: "jar · Java 应用" },
                  { value: "bat", label: "bat · 批处理" },
                  { value: "sh", label: "sh · Shell" },
                  { value: "ps1", label: "ps1 · PowerShell" },
                ]}
              />
              <p className="text-xs text-text3">{TYPE_HINT[form.type]}</p>
            </div>
            <div className="space-y-1.5">
              <Label>运行环境 {form.type === "jar" ? "*" : "(可选)"}</Label>
              <SelectField
                value={form.runtime_id}
                onChange={(v) => set("runtime_id", v)}
                disabled={runtimes.length === 0}
                placeholder={runtimes.length === 0 ? "请先在环境管理添加" : "选择 JDK"}
                options={runtimes.map((rt) => ({
                  value: String(rt.id),
                  label: `${rt.name} ${rt.version ? `(${rt.version})` : ""}`.trim(),
                }))}
              />
              {errors.runtime_id && <p className="text-xs text-danger">{errors.runtime_id}</p>}
            </div>
          </div>

          {/* 启动配置 */}
          <div className="space-y-1.5">
            <Label htmlFor="s-cmd">
              启动命令 * {form.type === "jar" && "(jar 文件路径)"}
            </Label>
            <Input
              id="s-cmd"
              value={form.command}
              onChange={(e) => set("command", e.target.value)}
              placeholder={
                form.type === "exe" ? "如:ping 或 C:/app/server.exe" :
                form.type === "jar" ? "如:C:/app/myapp.jar" :
                "脚本路径或命令"
              }
            />
            {errors.command && <p className="text-xs text-danger">{errors.command}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="s-args">程序参数</Label>
              <Input
                id="s-args"
                value={form.args}
                onChange={(e) => set("args", e.target.value)}
                placeholder="如:-t 127.0.0.1"
              />
            </div>
            {form.type === "jar" && (
              <div className="space-y-1.5">
                <Label htmlFor="s-jvm">JVM 参数</Label>
                <Input
                  id="s-jvm"
                  value={form.jvm_args}
                  onChange={(e) => set("jvm_args", e.target.value)}
                  placeholder="-Dloader.path=resources,lib -Xms1024m -Xmx1024m"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="s-workdir">工作目录</Label>
              <Input
                id="s-workdir"
                value={form.work_dir}
                onChange={(e) => set("work_dir", e.target.value)}
                placeholder="应用根目录,如 D:\services\app"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="s-port">端口</Label>
                <Input
                  id="s-port"
                  type="number"
                  value={form.port}
                  onChange={(e) => set("port", e.target.value)}
                  placeholder="可选"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-timeout">停止超时(秒)</Label>
                <Input
                  id="s-timeout"
                  type="number"
                  value={form.shutdown_timeout}
                  onChange={(e) => set("shutdown_timeout", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="s-env">环境变量(JSON)</Label>
            <Textarea
              id="s-env"
              rows={2}
              value={form.env_vars}
              onChange={(e) => set("env_vars", e.target.value)}
              placeholder='可选,如:{"FOO":"bar"}'
            />
          </div>

    </FormDialog>
  );
}

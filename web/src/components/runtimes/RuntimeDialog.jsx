import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { runtimeApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/ued/FormDialog";
import { SelectField, LabeledSwitch } from "@/components/ued";

const DEFAULT_ENV_TEMPLATE =
  '{"JAVA_HOME":"{{install_path}}","PATH":"{{install_path}}\\\\bin;{{PATH}}"}';

const EMPTY = {
  name: "",
  type: "jdk",
  version: "",
  install_path: "",
  is_default: false,
  env_template: DEFAULT_ENV_TEMPLATE,
  description: "",
};

// RuntimeDialog:新增 / 编辑运行环境。
export function RuntimeDialog({ open, onOpenChange, editing }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  // 打开时根据 editing 初始化表单。
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name || "",
        type: editing.type || "jdk",
        version: editing.version || "",
        install_path: editing.install_path || "",
        is_default: !!editing.is_default,
        env_template: editing.env_template || DEFAULT_ENV_TEMPLATE,
        description: editing.description || "",
      });
    } else {
      setForm(EMPTY);
    }
    setErrors({});
  }, [open, editing]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (editing) return runtimeApi.update(editing.id, data);
      return runtimeApi.create(data);
    },
    onSuccess: () => {
      toast.success(editing ? "已更新运行环境" : "已创建运行环境");
      queryClient.invalidateQueries({ queryKey: ["runtimes"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(`保存失败: ${e.message}`),
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = "名称不能为空";
    if (form.type === "jdk" && !form.install_path.trim()) {
      errs.install_path = "JDK 需指定安装路径(JAVA_HOME)";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    mutation.mutate({
      name: form.name.trim(),
      type: form.type,
      version: form.version.trim(),
      install_path: form.install_path.trim(),
      is_default: form.is_default,
      env_template: form.env_template,
      description: form.description.trim(),
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "编辑运行环境" : "新增运行环境"}
      description="配置服务启动时注入的环境变量（如 JAVA_HOME、PATH）"
      width="max-w-xl"
      onSubmit={handleSubmit}
      loading={mutation.isPending}
    >
      <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rt-name">名称 *</Label>
              <Input
                id="rt-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="如:JDK 17"
              />
              {errors.name && <p className="text-xs text-danger">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>类型</Label>
              <SelectField
                value={form.type}
                onChange={(v) => set("type", v)}
                options={[
                  { value: "jdk", label: "JDK" },
                  { value: "node", label: "Node.js" },
                  { value: "python", label: "Python" },
                  { value: "go", label: "Go" },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1 space-y-1.5">
              <Label htmlFor="rt-version">版本</Label>
              <Input
                id="rt-version"
                value={form.version}
                onChange={(e) => set("version", e.target.value)}
                placeholder="如:17.0.9"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="rt-path">安装路径 {form.type === "jdk" ? "*" : ""}</Label>
              <Input
                id="rt-path"
                value={form.install_path}
                onChange={(e) => set("install_path", e.target.value)}
                placeholder="如:C:/Program Files/Java/jdk-17"
              />
              {errors.install_path && (
                <p className="text-xs text-danger">{errors.install_path}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rt-env">环境变量模板(JSON)</Label>
            <Textarea
              id="rt-env"
              rows={3}
              value={form.env_template}
              onChange={(e) => set("env_template", e.target.value)}
              placeholder='{"JAVA_HOME":"{{install_path}}", ...}'
            />
            <p className="text-xs text-text3">
              支持 <code>{"{{install_path}}"}</code>、<code>{"{{PATH}}"}</code> 占位符。
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rt-desc">描述</Label>
            <Input
              id="rt-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="可选"
            />
          </div>

          <LabeledSwitch
            boxed
            className="p-3"
            id="rt-default"
            label="设为默认环境"
            description="同类型仅一个默认;未显式绑定环境的服务将使用默认值。"
            checked={form.is_default}
            onCheckedChange={(v) => set("is_default", v)}
          />
      </div>
    </FormDialog>
  );
}

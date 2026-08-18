import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { runtimeApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑运行环境" : "新增运行环境"}</DialogTitle>
          <DialogDescription>
            配置服务启动时注入的环境变量(如 JAVA_HOME、PATH)。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jdk">JDK</SelectItem>
                  <SelectItem value="node">Node.js</SelectItem>
                  <SelectItem value="python">Python</SelectItem>
                  <SelectItem value="go">Go</SelectItem>
                </SelectContent>
              </Select>
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

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="rt-default" className="cursor-pointer">设为默认环境</Label>
              <p className="text-xs text-text3">
                同类型仅一个默认;未显式绑定环境的服务将使用默认值。
              </p>
            </div>
            <Switch
              id="rt-default"
              checked={form.is_default}
              onCheckedChange={(v) => set("is_default", v)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

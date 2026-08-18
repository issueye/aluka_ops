import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Info } from "lucide-react";
import { serviceApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InfoHint, SelectField, LabeledSwitch } from "@/components/ued";

// ServiceConfigForm 服务运行配置编辑。
// 运行中仅允许改 auto_restart / max_restarts / shutdown_timeout;
// 启动相关字段(command/args/jvm/env/port)需停服后修改。
export function ServiceConfigForm({ service, config }) {
  const queryClient = useQueryClient();
  const running = service?.status === "running";
  const parseHC = (raw) => {
    try {
      const o = raw ? JSON.parse(raw) : {};
      return {
        type: o.type || "none",
        target: o.target || "",
        interval_sec: o.interval_sec || 10,
        timeout_sec: o.timeout_sec || 3,
      };
    } catch {
      return { type: "none", target: "", interval_sec: 10, timeout_sec: 3 };
    }
  };

  const [form, setForm] = useState({
    command: "",
    args: "",
    jvm_args: "",
    env_vars: "",
    work_dir: "",
    port: 0,
    auto_restart: false,
    max_restarts: 3,
    shutdown_timeout: 30,
    hc_type: "none",
    hc_target: "",
    hc_interval: 10,
    hc_timeout: 3,
  });

  useEffect(() => {
    if (!config && !service) return;
    const hc = parseHC(config?.health_check);
    setForm({
      command: config?.command || "",
      args: config?.args || "",
      jvm_args: config?.jvm_args || "",
      env_vars: config?.env_vars || "",
      work_dir: service?.work_dir || "",
      port: config?.port || 0,
      auto_restart: !!config?.auto_restart,
      max_restarts: config?.max_restarts ?? 3,
      shutdown_timeout: config?.shutdown_timeout || 30,
      hc_type: hc.type,
      hc_target: hc.target,
      hc_interval: hc.interval_sec,
      hc_timeout: hc.timeout_sec,
    });
  }, [config, service]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: async ({ svcPatch, cfgBody }) => {
      if (svcPatch) {
        await serviceApi.update(service.id, svcPatch);
      }
      return serviceApi.updateConfig(service.id, cfgBody);
    },
    onSuccess: () => {
      toast.success("配置已保存");
      queryClient.invalidateQueries({ queryKey: ["service", service.id] });
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e) => toast.error(`保存失败: ${e.message}`),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const health_check = JSON.stringify({
      type: form.hc_type || "none",
      target: (form.hc_target || "").trim(),
      interval_sec: Number(form.hc_interval) || 10,
      timeout_sec: Number(form.hc_timeout) || 3,
    });

    // 运行中只提交可改字段(含健康检查)
    if (running) {
      mut.mutate({
        cfgBody: {
          auto_restart: form.auto_restart,
          max_restarts: Number(form.max_restarts) || 0,
          shutdown_timeout: Number(form.shutdown_timeout) || 30,
          health_check,
        },
      });
      return;
    }
    // 校验 env_vars JSON
    const env = (form.env_vars || "").trim();
    if (env) {
      try {
        const obj = JSON.parse(env);
        if (typeof obj !== "object" || Array.isArray(obj) || obj === null) {
          toast.error("环境变量须为 JSON 对象,如 {\"FOO\":\"bar\"}");
          return;
        }
      } catch {
        toast.error("环境变量 JSON 格式错误");
        return;
      }
    }
    const workDir = (form.work_dir || "").trim();
    const svcPatch =
      workDir !== (service?.work_dir || "")
        ? { work_dir: workDir }
        : null;

    mut.mutate({
      svcPatch,
      cfgBody: {
        command: form.command,
        args: form.args,
        jvm_args: form.jvm_args,
        env_vars: env,
        port: Number(form.port) || 0,
        auto_restart: form.auto_restart,
        max_restarts: Number(form.max_restarts) || 0,
        shutdown_timeout: Number(form.shutdown_timeout) || 30,
        health_check,
      },
    });
  };

  if (!config) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-text3">
          暂无配置记录。
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm">
          启动配置
          <InfoHint
            label={
              running
                ? "服务运行中:仅可修改自动重启、停止超时与健康检查;启动命令等需停服后编辑。"
                : "修改后保存即可;下次启动生效。"
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {running && (
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-muted p-3 text-xs text-warning">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                当前服务正在运行。启动命令 / 参数 / JVM / 环境变量 / 端口已锁定;
                如需修改请先停止服务。
              </span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cfg-workdir">工作目录</Label>
              <Input
                id="cfg-workdir"
                value={form.work_dir}
                onChange={(e) => set("work_dir", e.target.value)}
                disabled={running || mut.isPending}
                className="font-mono text-sm"
                placeholder="如 D:\services\outside-prescription（瘦 jar 必填应用根目录）"
              />
              <p className="text-[11px] text-text3">
                进程 cwd。含 lib/resources 的 Spring Boot 瘦 jar / 启动脚本必须指向应用根目录。
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cfg-command">启动命令</Label>
              <Input
                id="cfg-command"
                value={form.command}
                onChange={(e) => set("command", e.target.value)}
                disabled={running || mut.isPending}
                className="font-mono text-sm"
                placeholder={
                  service.type === "jar"
                    ? "outside-prescription.jar"
                    : service.type === "bat"
                      ? "startup.bat"
                      : "可执行文件路径或命令"
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cfg-args">程序参数</Label>
              <Input
                id="cfg-args"
                value={form.args}
                onChange={(e) => set("args", e.target.value)}
                disabled={running || mut.isPending}
                className="font-mono text-sm"
                placeholder='如 -h 0.0.0.0 -p 6380（引号会自动去掉）'
              />
            </div>
            {service.type === "jar" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cfg-jvm">JVM 参数</Label>
                <Input
                  id="cfg-jvm"
                  value={form.jvm_args}
                  onChange={(e) => set("jvm_args", e.target.value)}
                  disabled={running || mut.isPending}
                  className="font-mono text-sm"
                  placeholder="-Dfile.encoding=UTF-8 -Dloader.path=resources,lib -Xms1024m -Xmx1024m"
                />
                <p className="text-[11px] text-text3">
                  瘦 jar 务必带 -Dloader.path=resources,lib，否则会出现 ClassNotFoundException。
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="cfg-port">端口</Label>
              <Input
                id="cfg-port"
                type="number"
                value={form.port}
                onChange={(e) => set("port", e.target.value)}
                disabled={running || mut.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-timeout">停止超时(秒)</Label>
              <Input
                id="cfg-timeout"
                type="number"
                min={1}
                value={form.shutdown_timeout}
                onChange={(e) => set("shutdown_timeout", e.target.value)}
                disabled={mut.isPending}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cfg-env">环境变量(JSON)</Label>
              <Textarea
                id="cfg-env"
                rows={3}
                value={form.env_vars}
                onChange={(e) => set("env_vars", e.target.value)}
                disabled={running || mut.isPending}
                className="font-mono text-xs"
                placeholder='{"JAVA_OPTS":"-Dfile.encoding=UTF-8"}'
              />
            </div>
          </div>

          <LabeledSwitch
            boxed
            className="p-3"
            id="cfg-auto"
            label="崩溃自动拉起"
            description="进程意外退出后,按退避策略自动重启(最多 max_restarts 次)。"
            checked={form.auto_restart}
            onCheckedChange={(v) => set("auto_restart", v)}
            disabled={mut.isPending}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-max">最大自动拉起次数</Label>
              <Input
                id="cfg-max"
                type="number"
                min={0}
                value={form.max_restarts}
                onChange={(e) => set("max_restarts", e.target.value)}
                disabled={mut.isPending}
              />
            </div>
          </div>

          {/* 健康检查 */}
          <div className="space-y-3 rounded-md border p-3">
            <div>
              <Label>健康检查探针</Label>
              <p className="text-xs text-text3">
                进程存活之外,定期探测 HTTP/TCP 判断服务是否真正可用。target 可留空,将用端口推导。
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>探针类型</Label>
                <SelectField
                  value={form.hc_type}
                  onChange={(v) => set("hc_type", v)}
                  disabled={mut.isPending}
                  options={[
                    { value: "none", label: "关闭" },
                    { value: "http", label: "HTTP" },
                    { value: "tcp", label: "TCP" },
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-hc-target">目标</Label>
                <Input
                  id="cfg-hc-target"
                  value={form.hc_target}
                  onChange={(e) => set("hc_target", e.target.value)}
                  disabled={mut.isPending || form.hc_type === "none"}
                  className="font-mono text-sm"
                  placeholder={form.hc_type === "tcp" ? "127.0.0.1:8080" : "http://127.0.0.1:8080/health"}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-hc-interval">间隔(秒)</Label>
                <Input
                  id="cfg-hc-interval"
                  type="number"
                  min={1}
                  value={form.hc_interval}
                  onChange={(e) => set("hc_interval", e.target.value)}
                  disabled={mut.isPending || form.hc_type === "none"}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-hc-timeout">超时(秒)</Label>
                <Input
                  id="cfg-hc-timeout"
                  type="number"
                  min={1}
                  value={form.hc_timeout}
                  onChange={(e) => set("hc_timeout", e.target.value)}
                  disabled={mut.isPending || form.hc_type === "none"}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={mut.isPending}>
              <Save className="h-4 w-4" />
              {mut.isPending ? "保存中..." : "保存配置"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

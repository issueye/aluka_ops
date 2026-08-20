import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, ArrowRight, Loader2, Eye, EyeOff, Shield, Boxes, Activity, Network } from "lucide-react";
import { authApi, healthApi } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/layout/Logo";
import { FormField, InfoHint, StatusBadge } from "@/components/ued";

const MODE_LABEL = {
  standalone: "单机",
  agent: "Agent",
  controller: "中心",
};

const MODE_CHIP = {
  standalone: { label: "独立运行", icon: Boxes },
  agent: { label: "边缘节点", icon: Activity },
  controller: { label: "调度中心", icon: Network },
};

export function Login() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState("");

  const { data: health, isError: healthError, isLoading: healthLoading } = useQuery({
    queryKey: ["health"],
    queryFn: healthApi.check,
    staleTime: 15_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const healthBadge = useMemo(() => {
    if (healthLoading) return { tone: "secondary", label: "检测中", pulse: true };
    if (healthError || !health) return { tone: "danger", label: "后端离线", pulse: false };
    const mode = MODE_LABEL[health.mode] || health.mode || "在线";
    return { tone: "success", label: `在线 · ${mode}`, pulse: true };
  }, [health, healthError, healthLoading]);
  const modeChip = MODE_CHIP[health?.mode] || null;

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!password) {
      setFieldError("请输入管理密码");
      toast.error("请输入管理密码");
      return;
    }
    setFieldError("");
    setLoading(true);
    try {
      const data = await authApi.login(password);
      if (data?.token) {
        setToken(data.token, data.expires_at);
        toast.success("登录成功，欢迎使用 Aluka Ops");
        navigate("/", { replace: true });
      } else if (data?.auth_enabled === false) {
        toast.message("鉴权未启用，直接进入系统");
        navigate("/", { replace: true });
      } else {
        setFieldError("密码不正确");
        toast.error("密码不正确，请重新输入");
      }
    } catch (err) {
      const msg = err.message || "登录失败，请检查网络或后端服务";
      setFieldError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative flex min-h-screen w-full overflow-hidden bg-bg1 text-text1">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-1 via-bg1 to-bg4" aria-hidden />
        <div className="absolute right-0 top-0 hidden h-[60%] w-[55%] rounded-bl-[48px] bg-gradient-to-br from-primary-2/60 to-primary-1/40 lg:block" aria-hidden />
        <div className="absolute right-4 top-4 z-20">
          <ThemeToggle />
        </div>

        <div className="relative z-10 hidden flex-1 flex-col justify-between overflow-hidden px-10 py-8 lg:flex lg:px-12">
          <div className="flex items-center gap-3">
            <Logo className="text-text1" markClassName="h-8 w-8" />
            <span className="hidden h-4 w-px bg-border1 md:block" aria-hidden />
            <span className="hidden text-xs text-text3 md:block">轻量服务治理控制面</span>
          </div>

          <div className="flex flex-1 flex-col justify-center gap-6 py-8">
            <div className="max-w-[520px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-2 bg-primary-1 px-3 py-1 text-xs font-medium text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" aria-hidden />
                {healthBadge.label}
                {health?.version ? <span className="text-text3">· v{health.version}</span> : null}
              </div>
              <h1 className="mt-4 text-[32px] font-bold leading-[1.15] tracking-tight text-text1">
                统一纳管你的
                <br />
                <span className="bg-gradient-to-r from-primary to-primary-7 bg-clip-text text-transparent">服务 · 环境 · 网关</span>
              </h1>
              <p className="mt-3 text-[14px] leading-6 text-text2">
                单机即开箱，多节点可演进。面板自防护与网关访问控制已就绪，运维更省心。
              </p>
              {modeChip ? (
                <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-border1 bg-bg1 px-3 py-2 text-xs text-text2">
                  <modeChip.icon className="h-3.5 w-3.5 text-primary" />
                  {health?.mode === "standalone" ? "单机独立节点" : modeChip.label} · {health?.mode}
                </div>
              ) : null}
            </div>

            <div className="relative grid max-w-[520px] grid-cols-3 gap-3">
              <div className="rounded-md border border-border1 bg-bg1 p-3">
                <div className="text-xs font-medium text-text2">服务治理</div>
                <div className="mt-1 text-[11px] leading-4 text-text3">启停 / 升级 / 日志 / 控制台</div>
              </div>
              <div className="rounded-md border border-border1 bg-bg1 p-3">
                <div className="text-xs font-medium text-text2">网关接入</div>
                <div className="mt-1 text-[11px] leading-4 text-text3">站点 · 反代 · 限流 · IP 名单</div>
              </div>
              <div className="rounded-md border border-border1 bg-bg1 p-3">
                <div className="text-xs font-medium text-text2">节点协同</div>
                <div className="mt-1 text-[11px] leading-4 text-text3">Agent 心跳 · 隧道 · 控制面</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-text3">
            <Shield className="h-3.5 w-3.5" />
            生产建议：设置高强度管理密码，必要时配置 IP 白名单与 HTTPS
          </div>
        </div>

        <div className="relative z-10 flex flex-1 items-center justify-center p-6 sm:p-8 lg:max-w-[560px] lg:bg-bg1/80 lg:backdrop-blur-sm lg:shadow-[-8px_0_24px_rgba(0,0,0,0.06)]">
          <div className="w-full max-w-[400px] rounded-lg border border-border1 bg-bg1 p-8 shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
            <div className="mb-6 flex flex-col items-center gap-3 text-center">
              <Logo className="justify-center text-text1" markClassName="h-8 w-8" />
              <div>
                <h2 className="text-lg font-semibold leading-6">欢迎回来</h2>
                <p className="mt-1 text-xs leading-5 text-text3">使用管理密码登录 Aluka Ops 控制面板</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <FormField
                label="管理密码"
                htmlFor="password"
                required
                error={fieldError}
                hint={capsOn && !fieldError ? "当前已开启 Caps Lock" : undefined}
              >
                <div
                  className={cn(
                    "flex h-10 items-center overflow-hidden rounded-md border bg-bg1 transition-all duration-150",
                    fieldError ? "border-danger focus-within:border-danger focus-within:ring-2 focus-within:ring-danger/20" : "border-border2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center text-text3">
                    <Lock className="h-4 w-4" />
                  </span>
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="h-10 flex-1 !border-0 !border-transparent bg-transparent px-0 pr-3 text-[13px] shadow-none !outline-none !ring-0 focus-visible:border-transparent focus-visible:ring-0 focus:border-transparent focus:ring-0"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldError) setFieldError("");
                    }}
                    onKeyUp={(e) => setCapsOn(Boolean(e.getModifierState?.("CapsLock")))}
                    placeholder="输入管理密码"
                    autoFocus
                    autoComplete="current-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="flex h-10 w-10 shrink-0 items-center justify-center text-text3 transition-colors hover:text-text1"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </FormField>

              <Button type="submit" className="mt-1 h-10 w-full text-[13px] font-semibold shadow-sm" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在验证
                  </>
                ) : (
                  <>
                    登录
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-3">
              <span className="h-px flex-1 bg-border1" />
              <StatusBadge tone={healthBadge.tone} label={healthBadge.label} pulse={healthBadge.pulse} />
              <span className="h-px flex-1 bg-border1" />
            </div>

            <p className="mt-3 flex items-center justify-center gap-1 text-center text-[12px] leading-[20px] text-text3">
              使用启动时配置的管理密码
              <InfoHint
                label={
                  <>
                    对应环境变量 <code className="font-mono">ALUKA_PASSWORD</code>。 仅本地开发可显式设置{" "}
                    <code className="font-mono">ALUKA_ALLOW_NO_AUTH</code> 关闭鉴权，生产环境必须使用管理密码。
                  </>
                }
              />
            </p>

            <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-text3">
              <Shield className="h-3 w-3" />
              已启用面板自防护（IP 名单 · 登录防爆破）
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

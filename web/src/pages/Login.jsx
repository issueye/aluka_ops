import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
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
      <div className="flex min-h-screen w-full overflow-hidden bg-bg1 text-text1">
        {/* 右上角:主题切换 */}
        <div className="absolute right-4 top-4 z-20">
          <ThemeToggle />
        </div>

        {/* 左侧品牌区 */}
        <div className="relative hidden flex-1 flex-col items-center justify-center gap-8 overflow-hidden bg-gradient-to-br from-primary-2 via-primary-1 to-bg4 px-12 lg:flex">
          <div className="absolute -right-[100px] -top-[100px] h-[400px] w-[400px] rounded-full bg-primary opacity-[0.12] blur-[80px]" />
          <div className="absolute -bottom-[50px] -left-[50px] h-[300px] w-[300px] rounded-full bg-teal-6 opacity-[0.12] blur-[80px]" />

          <div className="relative z-[1] w-full max-w-[400px]">
            <svg viewBox="0 0 400 320" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-auto w-full">
              <g stroke="var(--primary-4)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.5">
                <line x1="200" y1="160" x2="80" y2="80" />
                <line x1="200" y1="160" x2="320" y2="80" />
                <line x1="200" y1="160" x2="80" y2="240" />
                <line x1="200" y1="160" x2="320" y2="240" />
                <line x1="200" y1="160" x2="200" y2="40" />
                <line x1="200" y1="160" x2="200" y2="280" />
              </g>
              <circle cx="200" cy="160" r="48" fill="var(--primary-2)" stroke="var(--primary-6)" strokeWidth="2" />
              <rect x="180" y="140" width="40" height="40" rx="6" fill="var(--primary-6)" />
              <g fill="var(--color-bg-1)">
                <rect x="186" y="148" width="28" height="6" rx="2" />
                <rect x="186" y="158" width="28" height="6" rx="2" />
                <rect x="186" y="168" width="28" height="6" rx="2" />
              </g>
              <circle cx="80" cy="80" r="24" fill="var(--color-bg-1)" stroke="var(--primary-5)" strokeWidth="1.5" />
              <circle cx="80" cy="80" r="6" fill="var(--primary-5)" />
              <circle cx="320" cy="80" r="24" fill="var(--color-bg-1)" stroke="var(--teal-5)" strokeWidth="1.5" />
              <circle cx="320" cy="80" r="6" fill="var(--teal-5)" />
              <circle cx="80" cy="240" r="24" fill="var(--color-bg-1)" stroke="var(--success-5)" strokeWidth="1.5" />
              <circle cx="80" cy="240" r="6" fill="var(--success-5)" />
              <circle cx="320" cy="240" r="24" fill="var(--color-bg-1)" stroke="var(--warning-5)" strokeWidth="1.5" />
              <circle cx="320" cy="240" r="6" fill="var(--warning-5)" />
              <circle cx="200" cy="40" r="20" fill="var(--color-bg-1)" stroke="var(--primary-4)" strokeWidth="1.5" />
              <circle cx="200" cy="40" r="5" fill="var(--primary-4)" />
              <circle cx="200" cy="280" r="20" fill="var(--color-bg-1)" stroke="var(--violet-4)" strokeWidth="1.5" />
              <circle cx="200" cy="280" r="5" fill="var(--violet-4)" />
            </svg>
          </div>

          <div className="relative z-[1] text-center">
            <h2 className="mb-2 text-xl font-semibold text-text1">Aluka Ops</h2>
            <p className="text-[13px] leading-[22px] text-text2">轻量级单机服务治理解决方案</p>
          </div>
        </div>

        {/* 右侧表单区 */}
        <div className="flex flex-1 items-center justify-center p-12">
          <div className="relative z-[1] w-[400px] max-w-[90vw] rounded-lg bg-bg1 p-10 shadow-[0_8px_24px_0_rgba(0,0,0,0.08),0_2px_6px_0_rgba(0,0,0,0.04)]">
            {/* Logo */}
            <div className="mb-6 flex justify-center">
              <Logo className="justify-center text-text1" markClassName="h-7 w-7" />
            </div>

            {/* 表单 */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <FormField
                label="管理密码"
                htmlFor="password"
                required
                error={fieldError}
                hint={capsOn && !fieldError ? "当前已开启 Caps Lock" : undefined}
              >
                <div className="flex h-10 items-center overflow-hidden rounded-sm border border-border2 bg-bg1 transition-all duration-150 focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(22,100,255,0.3)]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center text-text3">
                    <Lock className="h-4 w-4" />
                  </span>
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className={cn(
                      "h-10 flex-1 border-none bg-transparent px-0 pr-3 text-[13px] shadow-none focus-visible:ring-0 focus-visible:border-transparent",
                      fieldError && "text-danger"
                    )}                    value={password}
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

              <Button
                type="submit"
                className="mt-2 h-10 w-full text-[13px] font-medium"
                disabled={loading}
              >
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

            {/* 底部信息 */}
            <div className="mt-6 flex items-center justify-center gap-3">
              <span className="h-px flex-1 bg-border2" />
              <StatusBadge
                tone={healthBadge.tone}
                label={healthBadge.label}
                pulse={healthBadge.pulse}
              />
              <span className="h-px flex-1 bg-border2" />
            </div>

            <p className="mt-4 flex items-center justify-center gap-1 text-center text-[12px] leading-[20px] text-text3">
              使用启动时配置的管理密码
              <InfoHint
                label={
                  <>
                    对应环境变量 <code className="font-mono">ALUKA_PASSWORD</code>。
                    仅本地开发可显式设置 <code className="font-mono">ALUKA_ALLOW_NO_AUTH</code> 关闭鉴权,生产环境必须使用管理密码。
                  </>
                }
              />
            </p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

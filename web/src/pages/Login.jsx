import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Activity,
  Lock,
  ArrowRight,
  Loader2,
  Eye,
  EyeOff,
  ShieldCheck,
  Zap,
  TerminalSquare,
  Network,
  CheckCircle2,
} from "lucide-react";
import { authApi } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OpsIllustration } from "@/components/illustrations/OpsIllustration";
import { FormField } from "@/components/ued";

export function Login() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!password) {
      toast.error("请输入管理密码");
      return;
    }
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
        toast.error("密码不正确，请重新输入");
      }
    } catch (err) {
      toast.error(err.message || "登录失败，请检查网络或后端服务");
    } finally {
      setLoading(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="relative min-h-screen w-full overflow-y-auto bg-background text-foreground flex flex-col justify-between">
        {/* 背景轻微光晕装饰 */}
        <div className="pointer-events-none absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />

        {/* 顶栏操作区 */}
        <header className="relative z-10 flex items-center justify-between px-6 py-5 lg:px-12">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
              <Activity className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold tracking-tight">Aluka Ops</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                v0.2.0
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span>服务就绪</span>
            </div>
            <div className="h-4 w-[1px] bg-border/60 hidden sm:block" />
            <ThemeToggle />
          </div>
        </header>

        {/* 核心左右分栏容器 */}
        <main className="relative z-10 mx-auto my-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-6 py-6 lg:flex-row lg:gap-12 lg:px-12">
          {/* 左侧：品牌展示与 SVG 插画 */}
          <div className="flex w-full flex-1 flex-col items-center justify-center text-center lg:items-start lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-4">
              <Zap className="h-3.5 w-3.5" />
              <span>轻量级分布式服务治理与边缘运维平台</span>
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
              构建更稳健的 <br />
              <span className="bg-gradient-to-r from-primary via-cyan-400 to-sky-400 bg-clip-text text-transparent">
                服务进程与反向网络
              </span>
            </h1>

            <p className="mt-3 max-w-lg text-sm text-muted-foreground leading-relaxed sm:text-base">
              统一管理本地与边缘节点进程生命周期、动态网关路由、反向 TCP 流量隧道及 Web 终端。
            </p>

            {/* SVG 拓扑插画 */}
            <div className="my-6 w-full max-w-md lg:max-w-lg">
              <OpsIllustration className="w-full h-auto drop-shadow-sm transition-transform duration-500 hover:scale-[1.02]" />
            </div>

            {/* 3 大特性微标 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-xl text-left">
              <div className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-card/50 p-3 backdrop-blur-xs">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold">生命周期守护</div>
                  <div className="text-[11px] text-muted-foreground truncate">自动重试与崩溃恢复</div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-card/50 p-3 backdrop-blur-xs">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Network className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold">反向流量隧道</div>
                  <div className="text-[11px] text-muted-foreground truncate">跨网穿透与动态代理</div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-card/50 p-3 backdrop-blur-xs">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
                  <TerminalSquare className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold">跨平台 Web 终端</div>
                  <div className="text-[11px] text-muted-foreground truncate">PTY / ConPTY 全按键透传</div>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：登录卡片 */}
          <div className="mt-8 w-full max-w-md lg:mt-0 lg:w-[420px] shrink-0">
            <div className="relative rounded-2xl border border-border/80 bg-card/90 p-8 shadow-xl shadow-background/50 backdrop-blur-md transition-all duration-300">
              {/* 卡片头部 */}
              <div className="mb-6 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                  <ShieldCheck className="h-4 w-4" />
                  <span>管理员身份认证</span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight">登录管理后台</h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  请输入在环境变量 <code className="font-mono text-foreground font-semibold">ALUKA_PASSWORD</code> 中配置的管理密码
                </p>
              </div>

              {/* 登录表单 */}
              <form onSubmit={handleSubmit} className="space-y-5">
                <FormField label="管理访问密码" htmlFor="password">
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      className="pl-10 pr-10 h-11 text-sm bg-background/80 focus-visible:ring-primary/30"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      autoFocus
                      disabled={loading}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </FormField>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-11 text-sm font-semibold shadow-md shadow-primary/20 hover-lift"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      身份验证中...
                    </>
                  ) : (
                    <>
                      进入控制台
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </>
                  )}
                </Button>
              </form>

              {/* 底部内网免密/快速提示 */}
              <div className="mt-6 rounded-xl border border-border/50 bg-muted/30 p-3.5 text-left text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 font-medium text-foreground mb-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span>内网免密模式说明</span>
                </div>
                若未设置 <code className="font-mono text-[11px]">ALUKA_PASSWORD</code>，系统将自动进入纯内网信任模式，点击登录即可直接进入。
              </div>
            </div>
          </div>
        </main>

        {/* 底部版权 */}
        <footer className="relative z-10 px-6 py-4 text-center text-xs text-muted-foreground/70">
          Aluka Ops © {new Date().getFullYear()} · 服务治理与反向代理网关
        </footer>
      </div>
    </TooltipProvider>
  );
}

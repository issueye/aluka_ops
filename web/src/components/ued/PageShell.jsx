import { cn } from "@/lib/utils";
import { useAgent } from "@/lib/agentContext";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight, Monitor } from "lucide-react";

/** 页面根容器：对齐源力 content 区边距（20×32）与纵向节奏 */
export function PageShell({ className, children, ...props }) {
  return (
    <div className={cn("space-y-5 px-6 py-5 sm:px-8", className)} {...props}>
      <AgentScopeBanner />
      {children}
    </div>
  );
}

// 当前管控目标提示条:仅当 controller 模式且选中远程 Agent 时显示。
// 提示用户"当前页面数据来自哪台机器",并提供一键切回本机。
// 放在 PageShell 内,所有业务页面自动获得,无需逐页接入。
function AgentScopeBanner() {
  const { agent, setAgent, isController } = useAgent();
  if (!isController || agent === "local") return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border border-warning-2 bg-warning-1 px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2 text-warning-7">
        <ArrowLeftRight className="h-4 w-4 shrink-0" />
        <span className="truncate">
          正在管控远程节点：
          <span className="font-semibold">{agent}</span>
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 shrink-0 border-warning-3 text-warning-7 hover:bg-warning-2"
        onClick={() => setAgent("local")}
      >
        <Monitor className="h-3.5 w-3.5" />
        切回本机
      </Button>
    </div>
  );
}

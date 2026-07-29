import { useQuery } from "@tanstack/react-query";
import { Monitor, Server } from "lucide-react";
import { useAgent } from "@/lib/agentContext";
import { api } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

// 全局当前 Agent 选择器:controller 模式下可见。
// 选中后 services/sites/files/terminal 等页面整体切到该 Agent 的代理视图。
const agentsListApi = () => api.get("/api/agents");

export function AgentSwitcher() {
  const { agent, setAgent, isController } = useAgent();

  const { data: agents = [] } = useQuery({
    queryKey: ["agents", "switcher"],
    queryFn: agentsListApi,
    refetchInterval: 5000,
    enabled: isController,
  });

  // 非 controller 模式:不渲染(本机无远程节点概念)
  if (!isController) return null;

  const online = agents.filter((a) => a.online);

  return (
    <div className="flex items-center gap-2">
      <Select value={agent} onValueChange={setAgent}>
        <SelectTrigger className="h-8 w-[180px] text-xs" aria-label="选择管控节点">
          <SelectValue placeholder="选择节点" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="local">
            <span className="flex items-center gap-2">
              <Monitor className="h-3.5 w-3.5" />
              本机(中心)
            </span>
          </SelectItem>
          {online.map((a) => (
            <SelectItem key={a.agent_id} value={a.agent_id}>
              <span className="flex items-center gap-2">
                <Server className="h-3.5 w-3.5" />
                {a.agent_id}
                <span className="text-muted-foreground">{a.host}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {agent !== "local" && (
        <Badge variant="warning" className="whitespace-nowrap">
          远程: {agent}
        </Badge>
      )}
    </div>
  );
}

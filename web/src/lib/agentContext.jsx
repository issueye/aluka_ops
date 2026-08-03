import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clusterApi, setScopeAgent } from "@/lib/api";

// 当前管控目标:
//  - "local"  → 本机(standalone/本进程,走 /api/... 直连)
//  - <agent_id> → 远程 Agent(走 /api/agents/:id/proxy/api/...,隧道优先)
//
// 仅在 controller 模式下,选择器可见且可切换;其余模式强制 local。
// 选择会记忆到 localStorage,切换后整站请求前缀随之变化。

const AgentContext = createContext({
  agent: "local",
  setAgent: () => {},
  mode: "standalone",
  isController: false,
});

const STORAGE_KEY = "aluka_ops_current_agent";

export function AgentProvider({ children }) {
  const queryClient = useQueryClient();
  const [agent, setAgentState] = useState(() => {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) || "local";
    }
    return "local";
  });
  const [mode, setMode] = useState("standalone");
  // 跳过首次挂载的刷新:scopeAgent 初始即与 effective 一致,无需重拉
  const firstScopeRef = useRef(true);

  // 拉取集群角色,据此决定是否显示选择器;非 controller 强制 local
  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const st = await clusterApi.status();
        if (!active) return;
        const m = st?.mode || "standalone";
        setMode(m);
        if (m !== "controller") {
          setAgentState("local");
        }
      } catch {
        /* 忽略:拉取失败时保持 local,不阻塞页面 */
      }
    };
    tick();
    const t = setInterval(tick, 10000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const setAgent = (next) => {
    setAgentState(next);
    try {
      if (next === "local") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage 不可用时忽略 */
    }
  };

  // 非 controller 模式强制 local,避免残留远程选择
  const effective = mode === "controller" ? agent : "local";

  // 同步到 api 层作用域,使 serviceApi/gatewayApi/filesApi 等模块自动改写路径。
  // 切换管控目标时,立即失效并重拉所有当前激活的查询(各页面 queryKey 不含
  // agent 维度,靠此处统一刷新避免短暂串数据)。首次挂载跳过(无需重拉)。
  useEffect(() => {
    setScopeAgent(effective);
    if (firstScopeRef.current) {
      firstScopeRef.current = false;
      return;
    }
    queryClient.invalidateQueries({ refetchType: "active" });
  }, [effective, queryClient]);

  const value = useMemo(
    () => ({
      agent: effective,
      setAgent,
      mode,
      isController: mode === "controller",
    }),
    [effective, mode]
  );

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}

export function useAgent() {
  return useContext(AgentContext);
}

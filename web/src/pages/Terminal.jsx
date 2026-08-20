import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { Wifi, WifiOff, RefreshCw, Power } from "lucide-react";
import { toast } from "sonner";
import { api, getScopeAgent } from "@/lib/api";
import { withAuthQuery } from "@/lib/auth";
import { attachTerminalTheme, getTerminalTheme } from "@/lib/terminalTheme";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageTemplate } from "@/components/ued";

export function TerminalPage() {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const wsRef = useRef(null);
  const [conn, setConn] = useState("idle");
  const [shellType, setShellType] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [backend, setBackend] = useState("");

  const { data: info } = useQuery({
    queryKey: ["shell-info"],
    queryFn: () => api.get("/api/shell/info"),
    staleTime: 30_000,
  });

  const shells = info?.shells || [];
  const defaultShell = info?.default || "";
  useEffect(() => {
    if (!shellType && defaultShell) setShellType(defaultShell);
  }, [defaultShell, shellType]);
  useEffect(() => {
    if (info?.backend) setBackend(info.backend);
  }, [info]);

  const sendResize = useCallback(() => {
    const ws = wsRef.current;
    const term = termRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !term) return;
    try {
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    } catch {
      /* ignore */
    }
  }, []);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "close" }));
        ws.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
    setConn("closed");
    setSessionId("");
  }, []);

  useEffect(() => {
    if (!hostRef.current || termRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
      theme: getTerminalTheme(),
      convertEol: false,
      scrollback: 10000,
      allowProposedApi: true,
      windowsMode: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(hostRef.current);
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });
    term.writeln("\x1b[90m# Aluka Ops 服务器控制台 · PTY / ConPTY\x1b[0m");
    term.writeln("\x1b[90m# 原始按键透传 · 支持方向键/Tab/Ctrl+C · 窗口变化自动 resize\x1b[0m");
    term.writeln("\x1b[90m# 点击「连接」开始会话\x1b[0m");
    term.writeln("");
    term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(data));
    });
    term.onResize(() => sendResize());
    termRef.current = term;
    fitRef.current = fit;
    const unsubscribeTheme = attachTerminalTheme(term);
    const onResize = () => {
      try {
        fit.fit();
        sendResize();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("resize", onResize);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => onResize()) : null;
    if (hostRef.current && ro) ro.observe(hostRef.current);
    return () => {
      unsubscribeTheme();
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
      disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [disconnect, sendResize]);

  const connect = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    disconnect();
    try {
      fitRef.current?.fit();
    } catch {
      /* ignore */
    }
    const sh = shellType || defaultShell || "powershell_noprofile";
    const cols = term.cols || 120;
    const rows = term.rows || 30;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ag = getScopeAgent();
    const shellPath = ag && ag !== "local" ? `/api/agents/${ag}/shell/ws` : "/api/shell/ws";
    const url = withAuthQuery(`${proto}//${window.location.host}${shellPath}?shell=${encodeURIComponent(sh)}&cols=${cols}&rows=${rows}`);
    setConn("connecting");
    term.writeln(`\x1b[90m# 正在连接 ${sh} (${cols}x${rows}) …\x1b[0m`);
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    ws.onopen = () => {
      setConn("connected");
      term.writeln("\x1b[32m# 已连接\x1b[0m");
      setTimeout(() => {
        try {
          fitRef.current?.fit();
          sendResize();
        } catch {
          /* ignore */
        }
      }, 100);
    };
    ws.onmessage = (ev) => {
      const t = termRef.current;
      if (!t) return;
      if (typeof ev.data === "string") {
        const text = ev.data;
        if (text.startsWith("\x1eMETA:")) {
          const meta = text.slice(6).trim();
          const m = /session=([^;]+)/.exec(meta);
          if (m) setSessionId(m[1]);
          const b = /backend=([^;]+)/.exec(meta);
          if (b) setBackend(b[1]);
          t.writeln(`\x1b[90m# ${meta}\x1b[0m`);
          return;
        }
        if (text.startsWith("\x1eERROR:")) {
          t.writeln(`\x1b[31m# ${text.slice(7).trim()}\x1b[0m`);
          toast.error(text.slice(7).trim());
          return;
        }
        t.write(text);
        return;
      }
      if (ev.data instanceof ArrayBuffer) {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(ev.data);
        t.write(text);
      }
    };
    ws.onerror = () => {
      setConn("error");
      term.writeln("\x1b[31m# WebSocket 错误\x1b[0m");
    };
    ws.onclose = () => {
      setConn((c) => (c === "connecting" ? "error" : "closed"));
      setSessionId("");
      wsRef.current = null;
      term.writeln("\x1b[90m# 连接已关闭\x1b[0m");
    };
  }, [shellType, defaultShell, disconnect, sendResize]);

  const connBadge = () => {
    switch (conn) {
      case "connected":
        return (
          <Badge variant="success" className="gap-1">
            <Wifi className="h-3 w-3" /> 已连接{backend ? ` · ${backend}` : ""}
          </Badge>
        );
      case "connecting":
        return <Badge variant="secondary">连接中…</Badge>;
      case "error":
        return (
          <Badge variant="danger" className="gap-1">
            <WifiOff className="h-3 w-3" /> 错误
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="gap-1">
            <WifiOff className="h-3 w-3" /> 未连接
          </Badge>
        );
    }
  };

  const shellLabel = shellType || defaultShell || "powershell_noprofile";

  return (
    <PageTemplate
      title="服务器控制台"
      description={sessionId ? `伪终端 · ${backend || info?.backend || "PTY"} · ${sessionId}` : "系统级伪终端（Linux/macOS: PTY · Windows: ConPTY）"}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {connBadge()}
          <Select value={shellLabel} onValueChange={setShellType} disabled={conn === "connected" || conn === "connecting"}>
            <SelectTrigger className="h-8 w-[180px]">
              <SelectValue placeholder="Shell" />
            </SelectTrigger>
            <SelectContent>
              {(shells.length ? shells : [{ id: "powershell_noprofile", name: "PowerShell (无配置)" }, { id: "powershell", name: "PowerShell" }, { id: "cmd", name: "CMD" }]).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {conn === "connected" || conn === "connecting" ? (
            <Button variant="secondary" size="sm" onClick={disconnect}>
              <Power className="mr-1.5 h-3.5 w-3.5" />
              断开
            </Button>
          ) : (
            <Button size="sm" onClick={connect}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              连接
            </Button>
          )}
        </div>
      }
      contentClassName="flex h-[calc(100dvh-3rem)] min-h-0 flex-col space-y-0"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border1 bg-log">
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-border1 bg-bg4 px-3 text-xs text-text3">
          <span className="truncate font-mono text-[11px]">aluka-console ~ {shellLabel}</span>
          <span className="shrink-0 font-mono text-[10px]">{backend || info?.backend || "local"} · xterm.js</span>
        </div>
        <div className="min-h-0 w-full flex-1 p-2">
          <div ref={hostRef} className="h-full w-full" />
        </div>
      </div>
      <p className="shrink-0 pt-2 text-[11px] leading-4 text-text3">原始按键透传 · 支持方向键/Tab/Ctrl+C · 窗口变化自动 resize · 远程 Agent 走隧道代理</p>
    </PageTemplate>
  );
}

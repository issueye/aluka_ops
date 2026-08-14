import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  TerminalSquare,
  Wifi,
  WifiOff,
  RefreshCw,
  Power,
} from "lucide-react";
import { toast } from "sonner";
import { api, getScopeAgent } from "@/lib/api";
import { withAuthQuery } from "@/lib/auth";
import { attachTerminalTheme, getTerminalTheme } from "@/lib/terminalTheme";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageShell } from "@/components/ued";

/**
 * 服务器级 Web 控制台。
 * Linux/macOS: PTY · Windows: ConPTY
 * xterm 原始按键透传,支持 resize。
 */
export function TerminalPage() {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const wsRef = useRef(null);
  const [conn, setConn] = useState("idle"); // idle|connecting|connected|closed|error
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
      ws.send(
        JSON.stringify({
          type: "resize",
          cols: term.cols,
          rows: term.rows,
        })
      );
    } catch {
      /* ignore */
    }
  }, []);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "close" }));
        }
        ws.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
    setConn("closed");
    setSessionId("");
  }, []);

  // 初始化 xterm:按键直通 WebSocket
  useEffect(() => {
    if (!hostRef.current || termRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
      theme: getTerminalTheme(),
      convertEol: false, // PTY 自己处理换行
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
    term.writeln(
      "\x1b[90m# 原始按键透传 · 支持方向键/Tab/Ctrl+C · 窗口变化自动 resize\x1b[0m"
    );
    term.writeln("\x1b[90m# 点击「连接」开始会话\x1b[0m");
    term.writeln("");

    term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        // 二进制发送,避免 JSON 转义破坏控制字符
        ws.send(new TextEncoder().encode(data));
      }
    });

    term.onResize(() => {
      sendResize();
    });

    termRef.current = term;
    fitRef.current = fit;

    // 主题切换时热更新终端配色
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
    return () => {
      unsubscribeTheme();
      window.removeEventListener("resize", onResize);
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
    // 远程 Agent 走专用 WS 代理路由;本机走直连 /api/shell/ws
    const ag = getScopeAgent();
    const shellPath =
      ag && ag !== "local"
        ? `/api/agents/${ag}/shell/ws`
        : "/api/shell/ws";
    const url = withAuthQuery(
      `${proto}//${window.location.host}${shellPath}?shell=${encodeURIComponent(sh)}&cols=${cols}&rows=${rows}`
    );

    setConn("connecting");
    term.writeln(`\x1b[90m# 正在连接 ${sh} (${cols}x${rows}) …\x1b[0m`);

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setConn("connected");
      term.writeln("\x1b[32m# 已连接\x1b[0m");
      // 连上后再发一次尺寸
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
        // 其它文本直接写
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
            <Wifi className="h-3 w-3" /> 已连接
            {backend ? ` · ${backend}` : ""}
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

  return (
    <PageShell>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <TerminalSquare className="h-4 w-4" /> 服务器控制台
              </CardTitle>
              <CardDescription>
                系统级伪终端：Linux/macOS 使用 PTY，Windows 使用 ConPTY。
                {sessionId ? (
                  <span className="ml-2 font-mono text-[11px]">
                    session={sessionId}
                  </span>
                ) : null}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {connBadge()}
              <Select
                value={shellType || defaultShell || "powershell_noprofile"}
                onValueChange={setShellType}
                disabled={conn === "connected" || conn === "connecting"}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Shell" />
                </SelectTrigger>
                <SelectContent>
                  {(shells.length
                    ? shells
                    : [
                        { id: "powershell_noprofile", name: "PowerShell (无配置)" },
                        { id: "powershell", name: "PowerShell" },
                        { id: "cmd", name: "CMD" },
                      ]
                  ).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {conn === "connected" || conn === "connecting" ? (
                <Button variant="outline" size="sm" onClick={disconnect}>
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
          </div>
        </CardHeader>
        <CardContent>
          <div
            ref={hostRef}
            className="h-[min(70vh,640px)] w-full overflow-hidden rounded-md border border-border/60 bg-log p-2"
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            后端：{backend || info?.backend || "…"}。权限与 aluka_ops
            进程相同，请谨慎操作。完整交互终端（方向键、Tab 补全、颜色、resize）已启用。
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}

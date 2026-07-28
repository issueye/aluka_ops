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
import { api } from "@/lib/api";
import { withAuthQuery } from "@/lib/auth";
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

/**
 * 服务器级 Web 控制台(非服务进程控制台)。
 * Windows 默认 PowerShell;行缓冲 + WebSocket 推送输出。
 */
export function TerminalPage() {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const wsRef = useRef(null);
  const lineBufRef = useRef("");
  const [conn, setConn] = useState("idle"); // idle|connecting|connected|closed|error
  const [shellType, setShellType] = useState("");
  const [sessionId, setSessionId] = useState("");

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

  // 初始化 xterm
  useEffect(() => {
    if (!hostRef.current || termRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
      theme: {
        background: "#0b0f17",
        foreground: "#d1d5db",
        cursor: "#38bdf8",
        selectionBackground: "#1e3a5f",
      },
      convertEol: true,
      scrollback: 8000,
      allowProposedApi: true,
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

    term.writeln("\x1b[90m# Aluka Ops 服务器控制台(系统级)\x1b[0m");
    term.writeln(
      "\x1b[90m# Windows 默认 PowerShell · 回车发送一行 · Ctrl+C 发送中断\x1b[0m"
    );
    term.writeln("\x1b[90m# 点击「连接」开始会话\x1b[0m");
    term.writeln("");

    term.onData((data) => {
      const ws = wsRef.current;
      for (let i = 0; i < data.length; i++) {
        const ch = data[i];
        const code = ch.charCodeAt(0);

        // Ctrl+C
        if (code === 3) {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(String.fromCharCode(3));
            term.write("^C\r\n");
            lineBufRef.current = "";
          }
          continue;
        }

        // Enter
        if (ch === "\r" || ch === "\n") {
          const line = lineBufRef.current;
          lineBufRef.current = "";
          term.write("\r\n");
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(line);
          } else {
            term.writeln("\x1b[33m[未连接] 请先点击连接\x1b[0m");
          }
          continue;
        }

        // Backspace
        if (ch === "\x7f" || ch === "\b") {
          if (lineBufRef.current.length > 0) {
            lineBufRef.current = lineBufRef.current.slice(0, -1);
            term.write("\b \b");
          }
          continue;
        }

        if (code < 32) continue;
        lineBufRef.current += ch;
        term.write(ch);
      }
    });

    termRef.current = term;
    fitRef.current = fit;

    const onResize = () => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send("__CLOSE__");
        ws.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
    setConn("closed");
    setSessionId("");
  }, []);

  const connect = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    disconnect();

    const sh = shellType || defaultShell || "powershell";
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = withAuthQuery(
      `${proto}//${window.location.host}/api/shell/ws?shell=${encodeURIComponent(sh)}`
    );

    setConn("connecting");
    term.writeln(`\x1b[90m# 正在连接 ${sh} …\x1b[0m`);

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setConn("connected");
      term.writeln("\x1b[32m# 已连接\x1b[0m");
      try {
        fitRef.current?.fit();
      } catch {
        /* ignore */
      }
    };

    ws.onmessage = (ev) => {
      const t = termRef.current;
      if (!t) return;

      let text = "";
      if (typeof ev.data === "string") {
        text = ev.data;
      } else if (ev.data instanceof ArrayBuffer) {
        text = new TextDecoder("utf-8", { fatal: false }).decode(ev.data);
      } else {
        return;
      }

      // 元信息
      if (text.startsWith("\x1eMETA:")) {
        const meta = text.slice(6).trim();
        const m = /session=([^;]+)/.exec(meta);
        if (m) setSessionId(m[1]);
        t.writeln(`\x1b[90m# ${meta}\x1b[0m`);
        return;
      }
      if (text.startsWith("\x1eERROR:")) {
        t.writeln(`\x1b[31m# ${text.slice(7).trim()}\x1b[0m`);
        toast.error(text.slice(7).trim());
        return;
      }

      // 若有本地输入缓冲,先换行再写输出,再回显输入
      if (lineBufRef.current.length > 0) {
        const pending = lineBufRef.current;
        t.write("\r\n");
        t.write(text.replace(/\r?\n/g, "\r\n"));
        t.write(pending);
      } else {
        t.write(text.replace(/\r?\n/g, "\r\n"));
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
  }, [shellType, defaultShell, disconnect]);

  const connBadge = () => {
    switch (conn) {
      case "connected":
        return (
          <Badge variant="success" className="gap-1">
            <Wifi className="h-3 w-3" /> 已连接
          </Badge>
        );
      case "connecting":
        return (
          <Badge variant="secondary" className="gap-1">
            连接中…
          </Badge>
        );
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
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <TerminalSquare className="h-4 w-4" /> 服务器控制台
              </CardTitle>
              <CardDescription>
                系统级 Shell（非服务进程）。Windows 使用 PowerShell，输入按行发送。
                {sessionId ? (
                  <span className="ml-2 font-mono text-[11px]">session={sessionId}</span>
                ) : null}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {connBadge()}
              <Select
                value={shellType || defaultShell || "powershell"}
                onValueChange={setShellType}
                disabled={conn === "connected" || conn === "connecting"}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Shell" />
                </SelectTrigger>
                <SelectContent>
                  {(shells.length
                    ? shells
                    : [
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
            className="h-[min(70vh,640px)] w-full overflow-hidden rounded-md border border-border/60 bg-[#0b0f17] p-2"
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            说明：通过管道驱动 PowerShell/CMD，适合执行命令与查看输出；非完整 ConPTY
            伪终端，部分交互式 TUI 程序可能表现异常。权限与 aluka_ops 进程相同，请谨慎使用。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

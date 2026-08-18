import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { Eraser, Wifi, WifiOff, TerminalSquare } from "lucide-react";
import { toast } from "sonner";
import { serviceApi, scope } from "@/lib/api";
import { withAuthQuery } from "@/lib/auth";
import { attachTerminalTheme, getTerminalTheme } from "@/lib/terminalTheme";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ued";
import { Badge } from "@/components/ui/badge";

// ServiceConsole 基于 xterm.js 的交互式控制台。
//
// 设计:
//   - 输出:订阅 /logs/stream SSE,把历史/实时日志写入 xterm
//   - 输入:本地行缓冲,回车后 POST /console 写入进程 stdin
//   - 仅当 active=true 时建连;Tab 切走时关闭 SSE,释放资源
//
// props:
//   serviceId: 服务 ID
//   active   : 当前 Tab 是否激活
//   running  : 服务是否运行中(控制输入可用性提示)
export function ServiceConsole({ serviceId, active, running }) {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const esRef = useRef(null);
  const lineBufRef = useRef(""); // 本地行缓冲(回车前不发给后端)
  const sendingRef = useRef(false);
  const sendLineRef = useRef(null); // 避免 onData 闭包拿到过期 running
  const [conn, setConn] = useState("idle"); // idle | connecting | connected | reconnecting | closed

  // 发送一行到后端 stdin
  const sendLine = useCallback(
    async (line) => {
      if (!serviceId || sendingRef.current) return;
      if (!running) {
        termRef.current?.writeln("\x1b[33m[控制台] 服务未运行,无法写入 stdin\x1b[0m");
        return;
      }
      sendingRef.current = true;
      try {
        await serviceApi.consoleInput(serviceId, line);
      } catch (e) {
        const msg = e?.message || String(e);
        termRef.current?.writeln(`\x1b[31m[控制台] 发送失败: ${msg}\x1b[0m`);
        toast.error(`控制台发送失败: ${msg}`);
      } finally {
        sendingRef.current = false;
      }
    },
    [serviceId, running]
  );
  sendLineRef.current = sendLine;

  // 初始化 xterm(只建一次)
  useEffect(() => {
    if (!hostRef.current || termRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      theme: getTerminalTheme(),
      convertEol: true,
      scrollback: 5000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(hostRef.current);
    // 延迟 fit,确保容器已有尺寸
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });

    term.writeln("\x1b[90m# Aluka Ops 控制台 · 输出=服务日志 · 输入=写入进程 stdin\x1b[0m");
    term.writeln("\x1b[90m# 回车发送一行;仅当服务在本实例运行中时可交互\x1b[0m");
    term.writeln("");

    // 行编辑:可打印字符入缓冲,Backspace 删,Enter 发送
    term.onData((data) => {
      // 粘贴可能含多字符
      for (let i = 0; i < data.length; i++) {
        const ch = data[i];
        const code = ch.charCodeAt(0);

        // Enter
        if (ch === "\r" || ch === "\n") {
          const line = lineBufRef.current;
          lineBufRef.current = "";
          term.write("\r\n");
          if (!line.trim()) continue;
          // 通过 ref 调用最新 sendLine,避免 running 状态过期
          sendLineRef.current?.(line);
          continue;
        }

        // Backspace / DEL
        if (ch === "\x7f" || ch === "\b") {
          if (lineBufRef.current.length > 0) {
            lineBufRef.current = lineBufRef.current.slice(0, -1);
            term.write("\b \b");
          }
          continue;
        }

        // 忽略控制字符(含 Ctrl+C 等,首版不做信号转发)
        if (code < 32) continue;

        lineBufRef.current += ch;
        term.write(ch);
      }
    });

    termRef.current = term;
    fitRef.current = fit;

    // 主题切换时热更新终端配色
    const unsubscribeTheme = attachTerminalTheme(term);

    const onResize = () => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      unsubscribeTheme();
      window.removeEventListener("resize", onResize);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [serviceId]);

  // SSE 日志 → xterm
  const connectSSE = useCallback(() => {
    if (!serviceId || !termRef.current) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setConn("connecting");
    const es = new EventSource(withAuthQuery(scope(`/api/services/${serviceId}/logs/stream?lines=200`)));
    esRef.current = es;

    es.onopen = () => setConn("connected");

    const writeLog = (text) => {
      const t = termRef.current;
      if (!t) return;
      // 写入前若有未提交输入,先换行避免交错
      if (lineBufRef.current.length > 0) {
        t.write("\r\n");
        // 不丢本地缓冲,日志后重新回显当前输入行
        const pending = lineBufRef.current;
        t.write(text.replace(/\r?\n/g, "\r\n"));
        if (!text.endsWith("\n") && !text.endsWith("\r")) t.write("\r\n");
        t.write(pending);
        return;
      }
      // 规范化换行
      t.write(text.replace(/\r?\n/g, "\r\n"));
      if (text.length && !text.endsWith("\n") && !text.endsWith("\r")) {
        t.write("\r\n");
      }
    };

    es.addEventListener("history", (e) => writeLog(e.data));
    es.addEventListener("log", (e) => writeLog(e.data));
    es.addEventListener("meta", (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.file) {
          termRef.current?.writeln(`\x1b[90m# 日志文件: ${m.file}\x1b[0m`);
        }
        if (m.note) {
          termRef.current?.writeln(`\x1b[90m# ${m.note}\x1b[0m`);
        }
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("end", (e) => {
      setConn("closed");
      if (e.data) termRef.current?.writeln(`\x1b[90m# ${e.data}\x1b[0m`);
    });
    es.onerror = () => {
      setConn((s) => (s === "connected" ? "reconnecting" : s));
    };
  }, [serviceId]);

  // active 切换时连接/断开 SSE
  useEffect(() => {
    if (active) {
      // fit 一下尺寸
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
        } catch {
          /* ignore */
        }
      });
      connectSSE();
      termRef.current?.focus();
    } else if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
      setConn("idle");
    }
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [active, connectSSE]);

  const handleClear = () => {
    termRef.current?.clear();
    lineBufRef.current = "";
  };

  const handleReconnect = () => {
    lineBufRef.current = "";
    termRef.current?.writeln("\x1b[90m# 重新连接日志流...\x1b[0m");
    connectSSE();
  };

  const statusMeta = {
    idle: { text: "未连接", variant: "secondary", icon: WifiOff },
    connecting: { text: "连接中", variant: "warning", icon: Wifi },
    connected: { text: "已连接", variant: "success", icon: Wifi },
    reconnecting: { text: "重连中", variant: "warning", icon: Wifi },
    closed: { text: "已断开", variant: "danger", icon: WifiOff },
  }[conn] || { text: conn, variant: "secondary", icon: Wifi };
  const StatusIcon = statusMeta.icon;

  return (
    <div className="flex h-[min(70vh,640px)] flex-col overflow-hidden rounded-lg border border-border1 bg-log">
      {/* 工具栏 */}
      <div className="flex shrink-0 items-center justify-between border-b border-border1 px-3 py-2">
        <div className="flex items-center gap-2">
          <TerminalSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">控制台</span>
          <Badge variant={statusMeta.variant} className="gap-1.5">
            <StatusIcon className="h-3 w-3" />
            {statusMeta.text}
          </Badge>
          {!running && (
            <Badge variant="warning">服务未运行 · 输入不可用</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <IconTooltip label="清屏"><Button size="sm" variant="ghost" onClick={handleClear} aria-label="清屏">
            <Eraser className="h-3.5 w-3.5" />
          </Button></IconTooltip>
          {(conn === "closed" || conn === "reconnecting") && (
            <Button size="sm" variant="outline" onClick={handleReconnect}>
              重连
            </Button>
          )}
        </div>
      </div>

      {/* xterm 容器 */}
      <div
        ref={hostRef}
        className="min-h-0 flex-1 p-2"
        onClick={() => termRef.current?.focus()}
      />
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from "react";
import { Eraser, Pause, Play, Wifi, WifiOff, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { withAuthQuery } from "@/lib/auth";
import { scope } from "@/lib/api";
import { IconTooltip } from "@/components/ued";

// 缓冲上限:超过则丢弃头部,防止长时间运行导致内存膨胀。
const MAX_LINES = 5000;

// LogViewer SSE 日志查看器(终端风格)。
//
// props:
//   serviceId: 服务 ID
//   active   : 当前 Tab 是否激活(非激活时不建立连接,节省资源)
export function LogViewer({ serviceId, active }) {
  const [lines, setLines] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | connected | reconnecting | closed
  const [paused, setPaused] = useState(false);
  const [meta, setMeta] = useState(null); // {file, path}

  const containerRef = useRef(null);
  const autoScrollRef = useRef(true); // 是否自动滚动到底部
  const esRef = useRef(null); // EventSource 实例
  const pausedRef = useRef(false); // 暂停期间累积的行
  const pendingRef = useRef([]);

  // 连接/断开 SSE
  const connect = useCallback(() => {
    if (!serviceId) return;
    // 关闭旧连接
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    const url = withAuthQuery(scope(`/api/services/${serviceId}/logs/stream?lines=200`));
    const es = new EventSource(url);
    esRef.current = es;
    setStatus("connecting");

    es.onopen = () => setStatus("connected");

    es.addEventListener("meta", (e) => {
      try {
        setMeta(JSON.parse(e.data));
      } catch {
        setMeta({ note: e.data });
      }
    });

    // 历史与实时日志都追加到缓冲
    const append = (e, kind) => {
      if (pausedRef.current) {
        pendingRef.current.push(e.data);
        return;
      }
      setLines((prev) => {
        const next = [...prev, e.data];
        // 按换行拆分(后端 log 事件可能含多行,合并成单个 data 字段后这里已是单行)
        if (next.length > MAX_LINES) {
          return next.slice(next.length - MAX_LINES);
        }
        return next;
      });
      // 标记来源(用于可选染色,当前不区分)
      void kind;
    };
    es.addEventListener("history", (e) => append(e, "history"));
    es.addEventListener("log", (e) => append(e, "log"));

    es.onerror = () => {
      // EventSource 会自动重连;切换到 reconnecting 状态提示
      setStatus((s) => (s === "connected" ? "reconnecting" : s));
    };

    es.addEventListener("end", (e) => {
      setStatus("closed");
      if (e.data) {
        setLines((prev) => [...prev, `--- ${e.data} ---`]);
      }
    });
  }, [serviceId]);

  // active 变化时连接/断开
  useEffect(() => {
    if (active) {
      connect();
    }
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setStatus("idle");
    };
  }, [active, connect]);

  // 自动滚动:有新行且用户在底部时滚动到底
  useEffect(() => {
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  // 滚动事件:判断用户是否在底部
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    autoScrollRef.current = atBottom;
  };

  // 清屏
  const handleClear = () => {
    setLines([]);
    pendingRef.current = [];
  };

  // 暂停/继续
  const togglePause = () => {
    if (pausedRef.current) {
      // 继续:把暂停期间累积的行 flush
      pausedRef.current = false;
      setPaused(false);
      if (pendingRef.current.length > 0) {
        setLines((prev) => {
          const next = [...prev, ...pendingRef.current];
          return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
        });
        pendingRef.current = [];
      }
    } else {
      pausedRef.current = true;
      setPaused(true);
    }
  };

  // 手动重连
  const handleReconnect = () => {
    setLines([]);
    connect();
  };

  // 下载
  const handleDownload = () => {
    window.open(`/api/services/${serviceId}/logs/file`, "_blank");
  };

  const statusMeta = {
    idle: { text: "未连接", variant: "secondary", icon: WifiOff },
    connecting: { text: "连接中", variant: "warning", icon: Wifi },
    connected: { text: "已连接", variant: "success", icon: Wifi },
    reconnecting: { text: "重连中", variant: "warning", icon: Wifi },
    closed: { text: "已断开", variant: "danger", icon: WifiOff },
  }[status] || { text: status, variant: "secondary", icon: Wifi };

  const StatusIcon = statusMeta.icon;

  return (
    <div className="flex h-[520px] flex-col rounded-lg border border-border bg-log">
      {/* 工具栏 */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <Badge variant={statusMeta.variant} className="gap-1.5">
            <StatusIcon className="h-3 w-3" />
            {statusMeta.text}
          </Badge>
          <span className="text-xs text-muted-foreground">{lines.length} 行</span>
          {meta?.file && (
            <span className="max-w-[300px] truncate font-mono text-xs text-muted-foreground" >
              {meta.file}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <IconTooltip label={paused ? "继续" : "暂停"}>
            <Button size="sm" variant="ghost" onClick={togglePause} aria-label={paused ? "继续" : "暂停"}>
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </Button>
          </IconTooltip>
          <IconTooltip label="清屏">
            <Button size="sm" variant="ghost" onClick={handleClear} aria-label="清屏">
              <Eraser className="h-3.5 w-3.5" />
            </Button>
          </IconTooltip>
          <IconTooltip label="下载日志">
            <Button size="sm" variant="ghost" onClick={handleDownload} aria-label="下载日志">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </IconTooltip>
          {(status === "closed" || status === "reconnecting") && (
            <Button size="sm" variant="outline" onClick={handleReconnect}>
              重连
            </Button>
          )}
        </div>
      </div>

      {/* 日志内容 */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-3 font-mono text-[12.5px] leading-relaxed"
      >
        {lines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground/60">
            {status === "closed"
              ? "日志流已结束"
              : meta?.note
              ? meta.note
              : status === "connected"
              ? "等待日志输出..."
              : "正在连接..."}
          </div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all text-log-foreground">
              {line === "" ? "\u00A0" : line}
            </div>
          ))
        )}
      </div>

      {/* 自动滚动指示 */}
      {!autoScrollRef.current && (
        <div className="shrink-0 border-t border-border/60 px-3 py-1 text-center text-xs text-muted-foreground">
          自动滚动已暂停(滚动到底部恢复)
        </div>
      )}
    </div>
  );
}

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// cn: 合并 className,解决 Tailwind 类冲突(shadcn 标配)。
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// formatTime: 格式化 ISO 时间为本地可读字符串。
export function formatTime(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

/** 字节格式化 */
export function formatBytes(n) {
  if (n == null || n === 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

/** 运行时长 */
export function formatUptime(sec) {
  if (!sec) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}天 ${h}小时`;
  if (h > 0) return `${h}小时 ${m}分`;
  return `${m} 分钟`;
}

/**
 * 站点访问 URL:使用当前浏览器 hostname,避免写死 127.0.0.1。
 * @param {number|string} port 站点端口
 * @param {string} [pathPrefix="/"] 路径前缀
 */
export function siteURL(port, pathPrefix = "/") {
  if (!port) return "";
  const host =
    (typeof window !== "undefined" && window.location?.hostname) || "127.0.0.1";
  let path = pathPrefix || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  if (path !== "/" && path.endsWith("/")) path = path.slice(0, -1);
  const suffix = path === "/" ? "/" : `${path}/`;
  return `http://${host}:${port}${suffix}`;
}

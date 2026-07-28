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

/**
 * 站点访问 URL:使用当前浏览器 hostname,避免写死 127.0.0.1。
 * 网关站点默认 http(独立端口无 TLS 时)。
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

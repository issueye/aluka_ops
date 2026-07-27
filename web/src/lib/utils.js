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

import { cn } from "@/lib/utils";

const PRESET = {
  muted: "bg-muted text-foreground",
  jdk: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  node: "bg-green-500/15 text-green-600 dark:text-green-400",
  python: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  go: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  primary: "bg-primary/15 text-primary",
};

/** 类型小标签（集中管理色板） */
export function TypeChip({ tone = "muted", className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
        PRESET[tone] || PRESET.muted,
        className
      )}
    >
      {children}
    </span>
  );
}

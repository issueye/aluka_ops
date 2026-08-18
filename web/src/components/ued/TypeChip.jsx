import { cn } from "@/lib/utils";

const PRESET = {
  muted: "bg-bg4 text-text2",
  jdk: "bg-warning-2 text-warning-7",
  node: "bg-success-2 text-success-7",
  python: "bg-primary-2 text-primary-7",
  go: "bg-teal-2 text-teal-7",
  primary: "bg-primary-2 text-primary",
};

/** 类型小标签（源力设计：集中管理色板） */
export function TypeChip({ tone = "muted", className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium",
        PRESET[tone] || PRESET.muted,
        className
      )}
    >
      {children}
    </span>
  );
}

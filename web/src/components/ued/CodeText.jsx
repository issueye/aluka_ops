import { cn } from "@/lib/utils";

/** 等宽内联文本（源力设计） */
export function CodeText({ className, children, ...props }) {
  return (
    <span
      className={cn("font-mono text-xs text-text3", className)}
      {...props}
    >
      {children}
    </span>
  );
}

/** 路径文本（源力设计） */
export function PathText({ className, children, ...props }) {
  return (
    <span
      className={cn(
        "break-all font-mono text-xs text-text3",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

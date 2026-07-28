import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 简易进度条（UED）。pct 0–100。
 */
function Progress({ value = 0, className, indicatorClassName, ...props }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full bg-primary transition-all duration-500",
          indicatorClassName
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export { Progress };

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

function usageTone(pct) {
  if (pct >= 90) return "bg-danger";
  if (pct >= 75) return "bg-warning";
  return "bg-success";
}

function usageTextTone(pct) {
  if (pct >= 90) return "text-danger font-semibold";
  if (pct >= 75) return "text-warning font-semibold";
  return "text-foreground";
}

/** 使用率条（含阈值色与平滑过渡） */
export function UsageBar({ pct, label, className, showValue = true }) {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground truncate">{label}</span>
        {showValue ? (
          <span className={cn("font-mono tabular-nums", usageTextTone(p))}>
            {p.toFixed(1)}%
          </span>
        ) : null}
      </div>
      <Progress
        value={p}
        className="h-1.5 bg-muted/60"
        indicatorClassName={cn("transition-all duration-500 ease-out", usageTone(p))}
      />
    </div>
  );
}

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

function usageTone(pct) {
  if (pct >= 90) return "bg-danger";
  if (pct >= 75) return "bg-warning";
  return "bg-success";
}

/** 使用率条（含阈值色） */
export function UsageBar({ pct, label, className }) {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">{p.toFixed(1)}%</span>
      </div>
      <Progress value={p} indicatorClassName={usageTone(p)} />
    </div>
  );
}

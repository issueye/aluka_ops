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
  return "text-text1";
}

/**
 * 使用率条（源力设计：标签 + 数值 + 进度条，含阈值色）
 * 兼容 pct 或 value/max 两种传参方式
 */
export function UsageBar({ pct, value, max = 100, label, className, showValue = true }) {
  const raw = pct ?? (max ? (Number(value) / Number(max)) * 100 : 0);
  const p = Math.min(100, Math.max(0, Number(raw) || 0));
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="truncate text-text3">{label}</span>
        {showValue ? (
          <span className={cn("font-mono tabular-nums", usageTextTone(p))}>
            {p.toFixed(1)}%
          </span>
        ) : null}
      </div>
      <Progress
        value={p}
        className="h-1.5 bg-bg5"
        indicatorClassName={cn("transition-all duration-500 ease-out", usageTone(p))}
      />
    </div>
  );
}

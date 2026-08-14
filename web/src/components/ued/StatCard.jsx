import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** 仪表盘与通用统计卡 */
export function StatCard(props) {
  // 兼容直接传 stat={...} 或单项 props
  const stat = props.stat || {};
  const label = props.label ?? stat.label;
  const value = props.value ?? stat.value;
  const sub = props.sub ?? stat.sub;
  const Icon = props.icon ?? stat.icon;
  const to = props.to ?? stat.to;
  const accent = props.accent ?? stat.accent;
  const loading = props.loading ?? props.isLoading ?? false;
  const className = props.className;

  const cardContent = (
    <Card
      className={cn(
        "group relative h-full overflow-hidden transition-all duration-200 hover:border-primary/40 hover:shadow-md",
        to && "cursor-pointer hover:-translate-y-0.5",
        className
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {Icon ? (
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 transition-transform duration-200 group-hover:scale-110",
              accent ? "bg-primary/10" : ""
            )}
          >
            <Icon
              className={cn("h-4 w-4 shrink-0", accent || "text-muted-foreground")}
            />
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold tracking-tight tabular-nums", accent)}>
          {loading ? (
            <span className="inline-block animate-pulse text-muted-foreground">…</span>
          ) : (
            value ?? "—"
          )}
        </div>
        {sub ? (
          <p className="mt-1 text-xs text-muted-foreground leading-normal">{sub}</p>
        ) : null}
      </CardContent>
    </Card>
  );

  if (to) {
    return (
      <Link to={to} className="block h-full">
        {cardContent}
      </Link>
    );
  }
  return cardContent;
}

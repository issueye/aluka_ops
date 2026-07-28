import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** 仪表盘统计卡 */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  to,
  accent,
  loading,
}) {
  const body = (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {Icon ? (
          <Icon className={cn("h-4 w-4", accent || "text-muted-foreground")} />
        ) : null}
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", accent)}>
          {loading ? "…" : value}
        </div>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );

  if (to) {
    return (
      <Link to={to} className="block transition-transform hover:scale-[1.02]">
        {body}
      </Link>
    );
  }
  return body;
}

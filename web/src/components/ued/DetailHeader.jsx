import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 详情页顶栏：返回 + 标题区 + 操作
 */
export function DetailHeader({
  backTo,
  title,
  subtitle,
  badges,
  actions,
  className,
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {backTo ? (
          <Button variant="ghost" size="icon" asChild className="shrink-0" aria-label="返回">
            <Link to={backTo}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{title}</h2>
            {badges}
          </div>
          {subtitle ? (
            <p className="truncate font-mono text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

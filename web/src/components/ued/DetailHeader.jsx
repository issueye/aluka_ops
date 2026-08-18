import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoHint } from "./InfoHint";

/**
 * 详情页顶栏（源力设计）：面包屑 + 标题行(+徽章) + 右侧操作
 * breadcrumb: [{ label, to? }, ...] 最后一项为当前页（无链接）
 */
export function DetailHeader({
  breadcrumb,
  title,
  subtitle,
  badges,
  actions,
  className,
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {breadcrumb?.length ? (
        <nav className="flex flex-wrap items-center gap-1 text-[13px] leading-5" aria-label="面包屑">
          {breadcrumb.map((item, index) => {
            const isLast = index === breadcrumb.length - 1;
            return (
              <span key={`${item.label}-${index}`} className="flex items-center gap-1">
                {index > 0 ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text3" aria-hidden />
                ) : null}
                {item.to && !isLast ? (
                  <Link
                    to={item.to}
                    className="text-text3 transition-colors hover:text-primary"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className={cn(isLast ? "font-medium text-text2" : "text-text3")}>
                    {item.label}
                  </span>
                )}
              </span>
            );
          })}
        </nav>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h1 className="truncate text-xl font-semibold leading-7 text-text1">{title}</h1>
          {badges}
          {subtitle ? (
            <InfoHint label={subtitle} contentClassName="font-mono" />
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}

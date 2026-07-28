import { cn } from "@/lib/utils";
import {
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * 列表页 Card 头部：图标 + 标题 + 描述 | 右侧操作
 */
export function ListPageHeader({
  icon: Icon,
  title,
  description,
  actions,
  filters,
  className,
}) {
  return (
    <CardHeader
      className={cn(
        "flex flex-row flex-wrap items-center justify-between gap-3 space-y-0",
        className
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <CardTitle className="flex items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {filters}
        {actions}
      </div>
    </CardHeader>
  );
}

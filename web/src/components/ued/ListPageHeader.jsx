import { cn } from "@/lib/utils";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "./InfoHint";
import { Icon } from "./Icon";

/**
 * 列表页 Card 头部（源力设计）：图标 + 标题 + 描述 | 右侧操作
 */
export function ListPageHeader({
  icon,
  title,
  description,
  actions,
  filters,
  className,
}) {
  return (
    <CardHeader
      className={cn(
        "flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-border1 px-5 py-3.5",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-medium text-text1">
          {icon ? <Icon icon={icon} size="md" className="text-text3" /> : null}
          <span className="truncate">{title}</span>
        </CardTitle>
        {description ? <InfoHint label={description} /> : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {filters}
        {actions}
      </div>
    </CardHeader>
  );
}

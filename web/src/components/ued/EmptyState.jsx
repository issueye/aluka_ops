import { cn } from "@/lib/utils";

/**
 * 空状态：图标 + 标题 + 描述 + 可选操作
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-6" : "py-10",
        className
      )}
    >
      {Icon ? (
        <Icon className="mb-3 h-8 w-8 text-muted-foreground/50" />
      ) : null}
      {title ? (
        <p className="text-sm font-medium text-foreground">{title}</p>
      ) : null}
      {description ? (
        <p className="mt-1 max-w-md text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

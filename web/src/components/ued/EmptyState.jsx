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
        "flex flex-col items-center justify-center text-center animate-fade-in",
        compact ? "py-6 px-4" : "py-12 px-6",
        className
      )}
    >
      {Icon ? (
        <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground ring-8 ring-muted/20">
          <Icon className="h-6 w-6 stroke-[1.5]" />
        </div>
      ) : null}
      {title ? (
        <p className="text-sm font-semibold text-foreground tracking-tight">{title}</p>
      ) : null}
      {description ? (
        <p className="mt-1 max-w-sm text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

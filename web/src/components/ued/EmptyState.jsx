import { cn } from "@/lib/utils";

/**
 * 空状态（源力设计）：图标 + 标题 + 描述 + 可选操作
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
        <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-full bg-bg4 text-text3">
          <Icon className="h-6 w-6 stroke-[1.5]" />
        </div>
      ) : null}
      {title ? (
        <p className="text-sm font-medium text-text1 tracking-tight">{title}</p>
      ) : null}
      {description ? (
        <p className="mt-1 max-w-sm text-xs text-text3 leading-relaxed">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

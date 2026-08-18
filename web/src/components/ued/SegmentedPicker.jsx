import { cn } from "@/lib/utils";

/**
 * 分段选择器（源力设计）：一组互斥选项，激活项高亮为源力蓝。
 */
export function SegmentedPicker({
  options,
  value,
  onChange,
  size = "md",
  className,
}) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex items-center gap-2", className)}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        const disabled = opt.disabled;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled}
            onClick={() => !disabled && onChange?.(opt.value)}
            className={cn(
              "inline-flex items-center justify-center rounded-sm border-none bg-bg1 px-5 shadow-[0_0_0_1px_var(--border-2)] text-text2 transition-all duration-150",
              size === "sm" && "min-h-7 text-xs leading-[18px]",
              size === "md" && "min-h-8 text-[13px] leading-[22px]",
              size === "lg" && "min-h-9 text-sm leading-[22px]",
              !isActive && !disabled && "hover:bg-bg3",
              isActive && "bg-primary-1 font-medium text-primary shadow-[0_0_0_1px_var(--primary-3)]",
              disabled && "cursor-not-allowed text-text3 opacity-50"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

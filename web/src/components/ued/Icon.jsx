import { cn } from "@/lib/utils";

const SIZE = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
  xl: "h-6 w-6",
};

/**
 * Lucide 图标尺寸封装。size: xs 12 / sm 14 / md 16 / lg 20 / xl 24
 * 约束：业务代码应优先使用本组件，避免裸写 className="h-4 w-4" 导致尺寸漂移
 */
export function Icon({
  icon: IconComp,
  size = "md",
  className,
  strokeWidth = 1.75,
  ...props
}) {
  if (!IconComp) return null;
  return (
    <IconComp
      aria-hidden
      className={cn("shrink-0", SIZE[size] || SIZE.md, className)}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

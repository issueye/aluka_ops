import { Badge } from "@/components/ui/badge";

/**
 * @deprecated 请直接使用 Badge variant="jdk|node|python|go|primary|muted"
 * 保留仅为向后兼容，内部已收口至统一 Badge 体系。
 */
export function TypeChip({ tone = "muted", className, children, ...props }) {
  const variant = tone || "muted";
  return (
    <Badge variant={variant} className={className} {...props}>
      {children}
    </Badge>
  );
}

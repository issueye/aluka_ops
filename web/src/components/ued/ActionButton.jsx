import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "./Icon";
import { IconTooltip } from "./IconTooltip";

/**
 * 带图标 / 加载态的按钮。默认 size="sm"，对齐列表页主操作。
 */
export function ActionButton({
  icon,
  loading = false,
  children,
  size = "sm",
  disabled,
  ...props
}) {
  return (
    <Button size={size} disabled={loading || disabled} {...props}>
      {loading ? (
        <Icon icon={Loader2} size="sm" className="animate-spin" />
      ) : icon ? (
        <Icon icon={icon} size="sm" />
      ) : null}
      {children}
    </Button>
  );
}

/** 图标按钮：必须提供 aria-label；label 同时作为 Tooltip */
export function IconButton({
  icon,
  label,
  loading = false,
  size = "icon",
  variant = "ghost",
  disabled,
  className,
  ...props
}) {
  const btn = (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={loading || disabled}
      aria-label={label}
      className={className}
      {...props}
    >
      {loading ? (
        <Icon icon={Loader2} size="sm" className="animate-spin" />
      ) : (
        <Icon icon={icon} size="sm" />
      )}
    </Button>
  );
  return <IconTooltip label={label}>{btn}</IconTooltip>;
}

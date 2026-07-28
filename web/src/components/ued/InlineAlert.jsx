import { cn } from "@/lib/utils";

const VARIANTS = {
  error:
    "border-danger/30 bg-danger-muted text-danger",
  warning:
    "border-warning/30 bg-warning-muted text-warning",
  info:
    "border-primary/30 bg-primary/5 text-foreground",
  success:
    "border-success/30 bg-success-muted text-success",
};

/** 行内提示横幅 */
export function InlineAlert({
  variant = "error",
  className,
  children,
  ...props
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border p-3 text-sm",
        VARIANTS[variant] || VARIANTS.error,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** @deprecated 使用 InlineAlert */
export const ErrorBanner = InlineAlert;

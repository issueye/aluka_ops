import { cn } from "@/lib/utils";

const VARIANTS = {
  error:
    "border-danger-2 bg-danger-1 text-danger-7",
  warning:
    "border-warning-2 bg-warning-1 text-warning-7",
  info:
    "border-primary-2 bg-primary-1 text-text2",
  success:
    "border-success-2 bg-success-1 text-success-7",
};

/** 行内提示横幅（源力设计） */
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
        "rounded-sm border p-3 text-sm",
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

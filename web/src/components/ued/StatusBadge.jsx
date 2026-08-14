import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONE_DOT = {
  success: "bg-success shadow-[0_0_8px_hsl(var(--success)/0.6)]",
  warning: "bg-warning shadow-[0_0_8px_hsl(var(--warning)/0.6)]",
  danger: "bg-danger shadow-[0_0_8px_hsl(var(--danger)/0.6)]",
  default: "bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]",
  secondary: "bg-muted-foreground",
  outline: "bg-muted-foreground",
};

/** 状态点 */
export function StatusDot({ tone = "secondary", pulse = false, className }) {
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-200",
        TONE_DOT[tone] || TONE_DOT.secondary,
        pulse && "animate-pulse",
        className
      )}
    />
  );
}

/**
 * 通用状态徽章
 * @param {"success"|"warning"|"danger"|"default"|"secondary"|"outline"} tone
 */
export function StatusBadge({
  tone = "secondary",
  label,
  pulse = false,
  showDot = true,
  className,
}) {
  const variant =
    tone === "success" || tone === "warning" || tone === "danger"
      ? tone
      : tone === "default"
        ? "default"
        : tone === "outline"
          ? "outline"
          : "secondary";

  return (
    <Badge variant={variant} className={cn("gap-1.5 font-medium transition-all duration-150", className)}>
      {showDot ? <StatusDot tone={tone} pulse={pulse} /> : null}
      {label}
    </Badge>
  );
}

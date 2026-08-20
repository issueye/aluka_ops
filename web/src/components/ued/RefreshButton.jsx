import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

export function RefreshButton({
  onClick,
  loading = false,
  label = "刷新",
  iconOnly = false,
  className,
  ...props
}) {
  const showLabel = !iconOnly && Boolean(label);
  return (
    <Button
      type="button"
      variant="ghost"
      size={showLabel ? "sm" : "icon"}
      onClick={onClick}
      disabled={loading || props.disabled}
      aria-label={label || "刷新"}
      title={label || "刷新"}
      className={cn(
        "shrink-0 text-text3 hover:text-text1 hover:bg-bg4 active:scale-95",
        showLabel ? "gap-1.5 px-2.5" : "h-8 w-8",
        "group",
        className
      )}
      {...props}
    >
      <Icon
        icon={RefreshCw}
        size="sm"
        className={cn(
          "transition-transform duration-300 group-hover:rotate-180",
          loading && "animate-spin"
        )}
      />
      {showLabel ? label : null}
    </Button>
  );
}

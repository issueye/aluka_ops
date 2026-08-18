import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

export function RefreshButton({
  onClick,
  loading = false,
  label = "刷新",
  className,
  ...props
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={loading || props.disabled}
      className={cn("group transition-all duration-150 active:scale-95", className)}
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
      {label}
    </Button>
  );
}

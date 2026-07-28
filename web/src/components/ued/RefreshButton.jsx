import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
      className={className}
      {...props}
    >
      <RefreshCw className={cn(loading && "animate-spin")} />
      {label}
    </Button>
  );
}

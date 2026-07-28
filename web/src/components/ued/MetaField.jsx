import { cn } from "@/lib/utils";

/** 只读键值字段 */
export function MetaField({ label, value, mono = false, className }) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("break-all text-sm", mono && "font-mono text-xs")}>
        {value ?? "—"}
      </div>
    </div>
  );
}

/** 只读键值网格 */
export function KeyValueGrid({ className, cols = 3, children }) {
  return (
    <div
      className={cn(
        "grid gap-x-8 gap-y-3 text-sm",
        cols === 2 && "grid-cols-2",
        cols === 3 && "grid-cols-2 sm:grid-cols-3",
        cols === 4 && "grid-cols-2 sm:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}

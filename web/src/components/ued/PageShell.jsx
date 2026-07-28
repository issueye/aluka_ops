import { cn } from "@/lib/utils";

/** 页面根容器：统一纵向间距 */
export function PageShell({ className, dense = false, children, ...props }) {
  return (
    <div
      className={cn(dense ? "space-y-4" : "space-y-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}

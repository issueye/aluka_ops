import { cn } from "@/lib/utils";

/** 表格行操作按钮组 */
export function RowActions({ className, children }) {
  return (
    <div className={cn("flex items-center justify-end gap-1", className)}>
      {children}
    </div>
  );
}

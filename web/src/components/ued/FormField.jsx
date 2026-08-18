import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** 表单字段（源力设计）：Label + 控件 + hint/error */
export function FormField({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-danger">*</span> : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-text3">{hint}</p>
      ) : null}
    </div>
  );
}

/** 表单网格 */
export function FormGrid({ className, cols = 2, children }) {
  return (
    <div
      className={cn(
        "grid gap-4",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
    >
      {children}
    </div>
  );
}

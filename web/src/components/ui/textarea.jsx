import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm transition-all duration-150 placeholder:text-text3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-3 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 font-mono",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };

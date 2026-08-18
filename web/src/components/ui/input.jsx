import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "flex h-8 w-full rounded-sm border border-input bg-transparent px-3 py-1 text-sm transition-all duration-150 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-text3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-3 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };

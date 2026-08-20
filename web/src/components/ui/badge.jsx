import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-danger text-danger-foreground",
        outline: "border-border1 text-text1",
        success: "border-transparent bg-success-muted text-success",
        warning: "border-transparent bg-warning-muted text-warning",
        danger: "border-transparent bg-danger-muted text-danger",
        muted: "border-transparent bg-bg4 text-text2",
        primary: "border-transparent bg-primary-2 text-primary",
        jdk: "border-transparent bg-warning-2 text-warning-7",
        node: "border-transparent bg-success-2 text-success-7",
        python: "border-transparent bg-primary-2 text-primary-7",
        go: "border-transparent bg-teal-2 text-teal-7",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

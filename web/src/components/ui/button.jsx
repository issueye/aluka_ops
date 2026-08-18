import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_0_0_1px_var(--primary-active),0_2px_1px_0_rgba(0,0,0,0.15)] hover:bg-primary-hover hover:shadow-[0_0_0_1px_var(--primary-hover),0_2px_1px_0_rgba(0,0,0,0.15)]",
        destructive:
          "bg-danger text-danger-foreground shadow-[0_0_0_1px_#D93F3F,0_2px_1px_0_rgba(0,0,0,0.15)] hover:bg-danger hover:shadow-[0_0_0_1px_#EE3F38,0_2px_1px_0_rgba(0,0,0,0.15)]",
        outline:
          "border border-input bg-bg1 text-secondary-foreground shadow-[0_0_0_1px_var(--border-2),0_2px_1px_0_rgba(0,0,0,0.08)] hover:border-primary-4 hover:text-primary",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_0_0_1px_var(--border-2),0_2px_1px_0_rgba(0,0,0,0.08)] hover:shadow-[0_0_0_1px_rgba(22,100,255,0.8),0_2px_1px_0_rgba(0,0,0,0.08)] hover:text-primary",
        ghost: "text-primary hover:bg-primary-1",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-8 px-4 py-2",
        sm: "h-7 rounded-sm px-3 text-xs",
        lg: "h-9 rounded-sm px-6",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

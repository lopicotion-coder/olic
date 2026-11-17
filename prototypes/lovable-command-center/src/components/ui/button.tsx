import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-card hover:bg-primary-ink",
        destructive: "bg-destructive text-destructive-foreground shadow-card hover:bg-danger-ink",
        outline:
          "border border-input bg-surface text-foreground shadow-card hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        soft: "bg-primary-soft text-primary-ink hover:bg-accent",
        success: "bg-success text-primary-foreground shadow-card hover:bg-success-ink",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary-ink underline-offset-4 hover:underline px-0",
        navy: "bg-navy text-navy-foreground hover:bg-navy-2",
        onNavy: "bg-navy-foreground/10 text-navy-foreground hover:bg-navy-foreground/20",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 rounded-md px-3 text-[13px]",
        lg: "h-11 px-6 text-[15px]",
        icon: "h-10 w-10",
        iconSm: "h-8 w-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
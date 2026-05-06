import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_2px_8px_rgba(26,48,98,0.30)] dark:shadow-[0_2px_14px_rgba(77,106,172,0.45)] hover:bg-[var(--palette-primary-light)] hover:shadow-[0_4px_14px_rgba(26,48,98,0.40)] dark:hover:shadow-[0_4px_20px_rgba(77,106,172,0.60)] active:bg-[var(--palette-primary-base)] active:shadow-[0_1px_4px_rgba(26,48,98,0.20)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_2px_8px_rgba(239,68,68,0.25)] hover:bg-destructive/85 hover:shadow-[0_4px_12px_rgba(239,68,68,0.35)] active:bg-destructive/95",
        outline:
          "border border-[var(--ring)] bg-transparent text-foreground shadow-sm hover:border-primary hover:bg-primary hover:text-primary-foreground active:bg-primary/90 active:border-primary",
        secondary:
          "bg-secondary dark:bg-[var(--glass-bg-elevated)] text-secondary-foreground border border-[var(--glass-border)] shadow-sm hover:bg-accent hover:text-foreground hover:border-[var(--palette-secondary-base)] active:bg-accent/70",
        ghost:
          "text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/70",
        link:
          "text-primary underline-offset-4 hover:underline hover:text-[var(--palette-primary-light)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-lg px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

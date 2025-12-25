import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        // Default - Primary brand
        default: "border-transparent bg-primary text-primary-foreground",
        
        // Secondary - Subtle
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        
        // Destructive - Error/Danger
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        
        // Outline - Minimal
        outline: "border-border bg-transparent text-foreground",

        // === STATUS VARIANTS (WCAG AA Compliant) ===
        
        // Success - Approved, Complete
        success: "border-success-border bg-success-soft text-success-text",
        
        // Warning - Pending, Review
        warning: "border-warning-border bg-warning-soft text-warning-text",
        
        // Error - Rejected, Failed
        error: "border-error-border bg-error-soft text-error-text",
        
        // Info - Informational
        info: "border-info-border bg-info-soft text-info-text",

        // === SOFT VARIANTS ===
        
        // Soft Primary
        "soft-primary": "border-primary/20 bg-primary/10 text-primary",
        
        // Soft Accent (Yellow)
        "soft-accent": "border-accent/30 bg-accent-soft text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

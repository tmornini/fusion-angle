import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          // Base styles
          "flex min-h-[80px] w-full rounded-md border bg-background px-3 py-2",
          "text-sm text-foreground",
          "placeholder:text-muted-foreground",
          // Focus states
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          // Disabled state
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Transitions
          "transition-colors duration-150",
          // Hover state
          "hover:border-fusion-gray-300",
          // Resize
          "resize-y",
          // Error vs normal border
          error 
            ? "border-destructive focus-visible:ring-destructive" 
            : "border-input",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };

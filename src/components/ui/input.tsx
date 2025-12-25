import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Base styles
          "flex h-10 w-full rounded-md border bg-background px-3 py-2",
          "text-base text-foreground md:text-sm",
          "placeholder:text-muted-foreground",
          // Focus states
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          // Disabled state
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Transitions
          "transition-colors duration-150",
          // Hover state
          "hover:border-fusion-gray-300",
          // Error vs normal border
          error 
            ? "border-destructive focus-visible:ring-destructive" 
            : "border-input",
          // File input styling
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

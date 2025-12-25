import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormErrorProps {
  message?: string;
  className?: string;
}

export function FormError({ message, className }: FormErrorProps) {
  if (!message) return null;

  return (
    <div className={cn(
      "flex items-start gap-2 mt-1.5 text-sm text-destructive/90 animate-in fade-in-0 slide-in-from-top-1 duration-200",
      className
    )}>
      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ 
  label, 
  error, 
  required, 
  hint, 
  children, 
  className 
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive/70 ml-0.5">*</span>}
      </label>
      
      <div className={cn(
        "transition-all duration-200",
        error && "[&_input]:border-destructive/50 [&_input]:focus:ring-destructive/20 [&_textarea]:border-destructive/50 [&_textarea]:focus:ring-destructive/20"
      )}>
        {children}
      </div>
      
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      
      <FormError message={error} />
    </div>
  );
}

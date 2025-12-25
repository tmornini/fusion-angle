import { AlertTriangle, RefreshCw, ArrowLeft, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SystemErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  onGoBack?: () => void;
  onGetHelp?: () => void;
  isRetrying?: boolean;
  variant?: 'default' | 'inline' | 'card';
  className?: string;
}

export function SystemError({
  title = "Something went wrong",
  message = "We couldn't complete your request. This might be a temporary issue.",
  onRetry,
  onGoBack,
  onGetHelp,
  isRetrying = false,
  variant = 'default',
  className
}: SystemErrorProps) {
  if (variant === 'inline') {
    return (
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20",
        className
      )}>
        <div className="p-1.5 rounded-full bg-destructive/10">
          <AlertTriangle className="w-4 h-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground truncate">{message}</p>
        </div>
        {onRetry && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onRetry}
            disabled={isRetrying}
            className="flex-shrink-0"
          >
            <RefreshCw className={cn("w-4 h-4", isRetrying && "animate-spin")} />
          </Button>
        )}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className={cn(
        "p-6 rounded-xl border border-destructive/20 bg-gradient-to-b from-destructive/5 to-transparent",
        className
      )}>
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-destructive/10">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <h4 className="font-medium text-foreground">{title}</h4>
              <p className="text-sm text-muted-foreground mt-1">{message}</p>
            </div>
            <div className="flex items-center gap-2">
              {onRetry && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onRetry}
                  disabled={isRetrying}
                >
                  <RefreshCw className={cn("w-4 h-4 mr-2", isRetrying && "animate-spin")} />
                  {isRetrying ? 'Retrying...' : 'Try again'}
                </Button>
              )}
              {onGetHelp && (
                <Button variant="ghost" size="sm" onClick={onGetHelp}>
                  <HelpCircle className="w-4 h-4 mr-2" />
                  Get help
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default full-page variant
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto",
      className
    )}>
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-destructive/20 rounded-full blur-xl animate-pulse" />
        <div className="relative p-4 rounded-full bg-gradient-to-b from-destructive/10 to-destructive/5 border border-destructive/20">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
      </div>
      
      <h2 className="text-xl font-display font-semibold text-foreground mb-2">
        {title}
      </h2>
      <p className="text-muted-foreground mb-6 leading-relaxed">
        {message}
      </p>
      
      <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
        {onRetry && (
          <Button 
            onClick={onRetry}
            disabled={isRetrying}
            className="w-full sm:w-auto"
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isRetrying && "animate-spin")} />
            {isRetrying ? 'Retrying...' : 'Try again'}
          </Button>
        )}
        {onGoBack && (
          <Button variant="outline" onClick={onGoBack} className="w-full sm:w-auto">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go back
          </Button>
        )}
      </div>
      
      {onGetHelp && (
        <button 
          onClick={onGetHelp}
          className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Need help? Contact support
        </button>
      )}
    </div>
  );
}

// Specific error variants for common scenarios
interface UploadErrorProps {
  fileName?: string;
  onRetry?: () => void;
  onCancel?: () => void;
  isRetrying?: boolean;
}

export function UploadError({ fileName, onRetry, onCancel, isRetrying }: UploadErrorProps) {
  return (
    <div className="p-4 rounded-xl border border-destructive/20 bg-gradient-to-b from-destructive/5 to-transparent">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-destructive/10">
          <AlertTriangle className="w-4 h-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-foreground text-sm">Upload didn't complete</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {fileName ? `We couldn't upload "${fileName}". ` : ''}
            Please check your connection and try again.
          </p>
          <div className="flex items-center gap-2 mt-3">
            {onRetry && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onRetry}
                disabled={isRetrying}
                className="h-7 text-xs"
              >
                <RefreshCw className={cn("w-3 h-3 mr-1.5", isRetrying && "animate-spin")} />
                {isRetrying ? 'Uploading...' : 'Try again'}
              </Button>
            )}
            {onCancel && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onCancel}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SaveErrorProps {
  onRetry?: () => void;
  onDiscard?: () => void;
  isRetrying?: boolean;
}

export function SaveError({ onRetry, onDiscard, isRetrying }: SaveErrorProps) {
  return (
    <div className="p-4 rounded-xl border border-destructive/20 bg-gradient-to-b from-destructive/5 to-transparent">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-destructive/10">
          <AlertTriangle className="w-4 h-4 text-destructive" />
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-foreground text-sm">Changes couldn't be saved</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your work is still here. Try saving again in a moment.
          </p>
          <div className="flex items-center gap-2 mt-3">
            {onRetry && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onRetry}
                disabled={isRetrying}
                className="h-7 text-xs"
              >
                <RefreshCw className={cn("w-3 h-3 mr-1.5", isRetrying && "animate-spin")} />
                {isRetrying ? 'Saving...' : 'Save again'}
              </Button>
            )}
            {onDiscard && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onDiscard}
                className="h-7 text-xs text-muted-foreground"
              >
                Discard changes
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConnectionErrorProps {
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function ConnectionError({ onRetry, isRetrying }: ConnectionErrorProps) {
  return (
    <SystemError
      title="Connection issue"
      message="We're having trouble reaching our servers. Please check your internet connection."
      onRetry={onRetry}
      isRetrying={isRetrying}
      variant="card"
    />
  );
}

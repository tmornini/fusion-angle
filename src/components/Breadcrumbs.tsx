import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  showHome?: boolean;
}

export function Breadcrumbs({ items, showHome = true }: BreadcrumbsProps) {
  const allItems = showHome 
    ? [{ label: 'Home', href: '/dashboard' }, ...items]
    : items;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm mb-4">
      {allItems.map((item, index) => {
        const isLast = index === allItems.length - 1;
        const isHome = index === 0 && showHome;

        return (
          <div key={index} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )}
            {isLast ? (
              <span className="text-foreground font-medium truncate max-w-[200px]">
                {item.label}
              </span>
            ) : item.href ? (
              <Link
                to={item.href}
                className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                {isHome && <Home className="w-4 h-4" />}
                <span className={isHome ? 'sr-only sm:not-sr-only' : ''}>{item.label}</span>
              </Link>
            ) : (
              <span className="text-muted-foreground">
                {item.label}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}

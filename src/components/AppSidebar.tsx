import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Sparkles, 
  Home, 
  Lightbulb, 
  FolderKanban, 
  Users, 
  User,
  LogOut,
  Database,
  GitBranch,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  Palette,
  Target
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// Navigation reflects the user journey, not features
const navSections = [
  {
    label: 'Journey',
    items: [
      { label: 'Home', icon: Home, href: '/dashboard' },
      { label: 'Ideas', icon: Lightbulb, href: '/ideas' },
      { label: 'Projects', icon: FolderKanban, href: '/projects' },
      { label: 'Teams', icon: Users, href: '/teams' },
    ]
  },
  {
    label: 'Tools',
    items: [
      { label: 'Edge', icon: Target, href: '/edge' },
      { label: 'Crunch', icon: Database, href: '/crunch' },
      { label: 'Flow', icon: GitBranch, href: '/flow' },
    ]
  },
  {
    label: 'Settings',
    items: [
      { label: 'Account', icon: User, href: '/account' },
      { label: 'Design System', icon: Palette, href: '/design-system' },
    ]
  }
];

interface AppSidebarProps {
  userName?: string;
  companyName?: string;
  onNavigate?: () => void;
  isMobile?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AppSidebar({ 
  userName = 'Demo User', 
  companyName = 'Demo Company', 
  onNavigate, 
  isMobile,
  collapsed = false,
  onToggleCollapse
}: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState<string[]>(['Journey', 'Tools', 'Settings']);

  const isActive = (href: string) => {
    if (href === '/account') {
      return location.pathname.startsWith('/account');
    }
    if (href === '/ideas') {
      return location.pathname.startsWith('/ideas') || location.pathname.startsWith('/review');
    }
    if (href === '/projects') {
      return location.pathname.startsWith('/projects') || location.pathname.startsWith('/engineering');
    }
    if (href === '/teams') {
      return location.pathname === '/teams' || location.pathname === '/team';
    }
    return location.pathname === href;
  };

  const toggleSection = (label: string) => {
    setExpandedSections(prev => 
      prev.includes(label) 
        ? prev.filter(s => s !== label) 
        : [...prev, label]
    );
  };

  const handleNavigate = (href: string) => {
    navigate(href);
    onNavigate?.();
  };

  const sidebarWidth = collapsed ? 'w-16' : 'w-64';

  return (
    <aside className={`${isMobile ? 'w-full h-full' : `${sidebarWidth} fixed left-0 top-0 bottom-0`} border-r border-border bg-card/50 backdrop-blur-sm flex flex-col z-40 transition-all duration-300`}>
      {/* Logo */}
      {!isMobile && (
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} p-4 border-b border-border`}>
          <div className={`flex items-center gap-3 ${collapsed ? '' : ''}`}>
            <div className="w-9 h-9 rounded-lg gradient-hero flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            {!collapsed && (
              <span className="text-xl font-display font-bold text-foreground">Fusion AI</span>
            )}
          </div>
          {!collapsed && onToggleCollapse && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onToggleCollapse}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <PanelLeftClose className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {/* Expand button when collapsed */}
      {!isMobile && collapsed && onToggleCollapse && (
        <div className="flex justify-center py-2 border-b border-border">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onToggleCollapse}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Mobile logo header */}
      {isMobile && (
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="w-9 h-9 rounded-lg gradient-hero flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-display font-bold text-foreground">Fusion AI</span>
        </div>
      )}

      {/* Navigation */}
      <nav className={`flex-1 ${collapsed ? 'p-2' : 'p-4'} space-y-4 overflow-y-auto`}>
        {navSections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <button
                onClick={() => toggleSection(section.label)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                {section.label}
                <ChevronDown className={`w-3 h-3 transition-transform ${expandedSections.includes(section.label) ? '' : '-rotate-90'}`} />
              </button>
            )}
            
            {(collapsed || expandedSections.includes(section.label)) && (
              <div className={`${collapsed ? '' : 'mt-1'} space-y-1`}>
                {section.items.map((item) => {
                  const navButton = (
                    <button
                      key={item.label}
                      onClick={() => handleNavigate(item.href)}
                      className={`w-full flex items-center ${collapsed ? 'justify-center' : ''} gap-3 ${collapsed ? 'px-2 py-2.5' : 'px-4 py-2.5'} rounded-lg text-sm font-medium transition-colors ${
                        isActive(item.href)
                          ? 'bg-primary/10 text-primary' 
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {!collapsed && item.label}
                    </button>
                  );

                  if (collapsed) {
                    return (
                      <Tooltip key={item.label} delayDuration={0}>
                        <TooltipTrigger asChild>
                          {navButton}
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={10}>
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return navButton;
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Account Section */}
      <div className={`${collapsed ? 'p-2' : 'p-4'} border-t border-border`}>
        {!collapsed && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{companyName}</p>
            </div>
          </div>
        )}
        
        {collapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => handleNavigate('/')}
                className="w-full text-muted-foreground hover:text-foreground"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              Sign out
            </TooltipContent>
          </Tooltip>
        ) : (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => handleNavigate('/')}
            className="w-full justify-start text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        )}
      </div>
    </aside>
  );
}

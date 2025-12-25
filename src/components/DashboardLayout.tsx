import { ReactNode, useState } from 'react';
import { useTheme } from 'next-themes';
import { AppSidebar } from './AppSidebar';
import { Menu, Search, Bell, X, Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface DashboardLayoutProps {
  children: ReactNode;
  userName?: string;
  companyName?: string;
}

// Mock notifications - in a real app these would come from a backend
const mockNotifications = [
  { id: 1, title: 'New idea submitted', message: 'Marketing team submitted "AI Chatbot Integration"', time: '5 min ago', unread: true },
  { id: 2, title: 'Project approved', message: 'Your project "Mobile App Redesign" was approved', time: '1 hour ago', unread: true },
  { id: 3, title: 'Comment on idea', message: 'John commented on "Customer Portal"', time: '2 hours ago', unread: false },
  { id: 4, title: 'Review requested', message: 'Sarah requested your review on "API Gateway"', time: '1 day ago', unread: false },
];

export function DashboardLayout({ children, userName, companyName }: DashboardLayoutProps) {
  const { theme, setTheme } = useTheme();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const unreadCount = mockNotifications.filter(n => n.unread).length;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <AppSidebar 
          userName={userName} 
          companyName={companyName} 
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
        />
      )}

      {/* Mobile Header & Sidebar */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 h-14 bg-background/95 backdrop-blur-sm border-b border-border z-50 flex items-center justify-between px-4">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <AppSidebar 
                userName={userName} 
                companyName={companyName} 
                onNavigate={() => setSidebarOpen(false)}
                isMobile
              />
            </SheetContent>
          </Sheet>

          <span className="text-lg font-display font-bold text-foreground">Fusion AI</span>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setSearchOpen(!searchOpen)}>
              <Search className="w-5 h-5" />
            </Button>
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <NotificationDropdown notifications={mockNotifications} unreadCount={unreadCount} />
          </div>
        </div>
      )}

      {/* Mobile Search Bar */}
      {isMobile && searchOpen && (
        <div className="fixed top-14 left-0 right-0 bg-background border-b border-border z-40 p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search ideas, projects, teams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
              autoFocus
            />
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col ${isMobile ? 'pt-14' : collapsed ? 'ml-16' : 'ml-64'} transition-all duration-300`}>
        {/* Desktop Header */}
        {!isMobile && (
          <header className="sticky top-0 z-30 h-16 bg-background/95 backdrop-blur-sm border-b border-border flex items-center justify-between px-8">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search ideas, projects, teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-muted/50 border-transparent focus:border-border focus:bg-background"
              />
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle theme={theme} setTheme={setTheme} />
              <NotificationDropdown notifications={mockNotifications} unreadCount={unreadCount} />
            </div>
          </header>
        )}

        {/* Page Content */}
        <main className={`flex-1 ${isMobile ? (searchOpen ? 'pt-16 px-4 pb-6' : 'px-4 pb-6') : 'p-8'}`}>
          {children}
        </main>
      </div>
    </div>
  );
}

interface NotificationDropdownProps {
  notifications: typeof mockNotifications;
  unreadCount: number;
}

function NotificationDropdown({ notifications, unreadCount }: NotificationDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-xs">{unreadCount} new</Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto">
          {notifications.map((notification) => (
            <DropdownMenuItem key={notification.id} className="flex flex-col items-start gap-1 py-3 cursor-pointer">
              <div className="flex items-start gap-2 w-full">
                {notification.unread && (
                  <span className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0" />
                )}
                <div className={`flex-1 ${!notification.unread ? 'ml-4' : ''}`}>
                  <p className={`text-sm ${notification.unread ? 'font-medium' : 'text-muted-foreground'}`}>
                    {notification.title}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{notification.time}</p>
                </div>
              </div>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="justify-center text-primary cursor-pointer">
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ThemeToggleProps {
  theme: string | undefined;
  setTheme: (theme: string) => void;
}

function ThemeToggle({ theme, setTheme }: ThemeToggleProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          {theme === 'dark' ? (
            <Moon className="w-5 h-5" />
          ) : theme === 'light' ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Monitor className="w-5 h-5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')} className="gap-2">
          <Sun className="w-4 h-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} className="gap-2">
          <Moon className="w-4 h-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')} className="gap-2">
          <Monitor className="w-4 h-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

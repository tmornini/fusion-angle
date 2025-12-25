import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Building2,
  Users,
  FolderKanban,
  CreditCard,
  TrendingUp,
  CheckCircle2,
  Crown,
  Lightbulb,
  User,
  Settings,
  ExternalLink,
  Calendar,
  Activity,
  Bell,
  UserPlus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/DashboardLayout';

// Mock account data
const accountData = {
  company: {
    name: 'Acme Corporation',
    plan: 'Business',
    planStatus: 'active',
    billingCycle: 'monthly',
    nextBilling: '2025-01-15',
    seats: 25,
    usedSeats: 18,
  },
  usage: {
    projects: { current: 12, limit: 50 },
    ideas: { current: 47, limit: 200 },
    storage: { current: 2.4, limit: 10 },
    aiCredits: { current: 850, limit: 1000 },
  },
  health: {
    score: 92,
    status: 'excellent',
    lastActivity: '2 hours ago',
    activeUsers: 14,
  },
  recentActivity: [
    { type: 'user_added', description: 'Sarah Chen joined the team', time: '2 hours ago' },
    { type: 'project_created', description: 'New project "Q1 Analytics Dashboard" created', time: '5 hours ago' },
    { type: 'billing', description: 'Invoice #2024-089 paid successfully', time: '2 days ago' },
  ],
};

export default function Account() {
  const navigate = useNavigate();

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-green-600 bg-green-50 border-green-200';
      case 'good': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'warning': return 'text-amber-600 bg-amber-50 border-amber-200';
      default: return 'text-red-600 bg-red-50 border-red-200';
    }
  };

  const getUsageColor = (current: number, limit: number) => {
    const percentage = (current / limit) * 100;
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-amber-500';
    return 'bg-primary';
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        {/* Page Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-1 sm:mb-2">Account Overview</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage your organization, users, and billing settings
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Button 
            variant="outline" 
            className="h-auto p-3 sm:p-4 flex items-center gap-3 sm:gap-4 justify-start"
            onClick={() => navigate('/account/profile')}
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="font-medium text-foreground text-sm sm:text-base">My Profile</p>
              <p className="text-xs text-muted-foreground">Personal settings</p>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="h-auto p-3 sm:p-4 flex items-center gap-3 sm:gap-4 justify-start"
            onClick={() => navigate('/account/company')}
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-foreground text-sm sm:text-base">Company Settings</p>
              <p className="text-xs text-muted-foreground">Organization config</p>
            </div>
          </Button>
          
          <Button 
            variant="outline" 
            className="h-auto p-3 sm:p-4 flex items-center gap-3 sm:gap-4 justify-start"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
            </div>
            <div className="text-left">
              <p className="font-medium text-foreground text-sm sm:text-base">Billing</p>
              <p className="text-xs text-muted-foreground">Plans & invoices</p>
            </div>
          </Button>
        </div>

        {/* Company Overview Card */}
        <div className="fusion-card p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4 sm:mb-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <Building2 className="w-5 h-5 sm:w-7 sm:h-7 text-primary" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-display font-semibold text-foreground">
                  {accountData.company.name}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] sm:text-xs font-medium">
                    <Crown className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    {accountData.company.plan} Plan
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] sm:text-xs font-medium border border-green-200">
                    <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    Active
                  </span>
                </div>
              </div>
            </div>
            <div className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg border self-start ${getHealthColor(accountData.health.status)}`}>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-xs sm:text-sm font-medium capitalize">{accountData.health.status}</span>
              </div>
              <p className="text-[10px] sm:text-xs mt-0.5 sm:mt-1">Health Score: {accountData.health.score}%</p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            <div className="p-3 sm:p-4 rounded-lg bg-muted/30">
              <div className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground mb-1">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-[10px] sm:text-xs">Active Users</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-foreground">
                {accountData.company.usedSeats}
                <span className="text-xs sm:text-sm font-normal text-muted-foreground">/{accountData.company.seats}</span>
              </p>
            </div>
            <div className="p-3 sm:p-4 rounded-lg bg-muted/30">
              <div className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground mb-1">
                <FolderKanban className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-[10px] sm:text-xs">Projects</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-foreground">
                {accountData.usage.projects.current}
              </p>
            </div>
            <div className="p-3 sm:p-4 rounded-lg bg-muted/30">
              <div className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground mb-1">
                <Lightbulb className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-[10px] sm:text-xs">Ideas</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-foreground">
                {accountData.usage.ideas.current}
              </p>
            </div>
            <div className="p-3 sm:p-4 rounded-lg bg-muted/30">
              <div className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground mb-1">
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="text-[10px] sm:text-xs">Next Billing</span>
              </div>
              <p className="text-base sm:text-lg font-bold text-foreground">
                {new Date(accountData.company.nextBilling).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* Usage & Activity Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Usage Meters */}
          <div className="fusion-card p-4 sm:p-6">
            <h3 className="font-display font-semibold text-foreground text-sm sm:text-base mb-3 sm:mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              Usage Overview
            </h3>
            <div className="space-y-3 sm:space-y-4">
              {[
                { label: 'User Seats', ...{ current: accountData.company.usedSeats, limit: accountData.company.seats } },
                { label: 'Projects', ...accountData.usage.projects },
                { label: 'Ideas', ...accountData.usage.ideas },
                { label: 'AI Credits', ...accountData.usage.aiCredits },
                { label: 'Storage (GB)', ...accountData.usage.storage },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-xs sm:text-sm mb-1">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-medium text-foreground">
                      {item.current} / {item.limit}
                    </span>
                  </div>
                  <div className="h-1.5 sm:h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${getUsageColor(item.current, item.limit)}`}
                      style={{ width: `${Math.min(100, (item.current / item.limit) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="fusion-card p-4 sm:p-6">
            <h3 className="font-display font-semibold text-foreground text-sm sm:text-base mb-3 sm:mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              Recent Activity
            </h3>
            <div className="space-y-3 sm:space-y-4">
              {accountData.recentActivity.map((activity, i) => (
                <div key={i} className="flex items-start gap-2 sm:gap-3">
                  <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    activity.type === 'user_added' ? 'bg-blue-100' :
                    activity.type === 'project_created' ? 'bg-purple-100' : 'bg-green-100'
                  }`}>
                    {activity.type === 'user_added' && <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />}
                    {activity.type === 'project_created' && <FolderKanban className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600" />}
                    {activity.type === 'billing' && <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm text-foreground">{activity.description}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full mt-3 sm:mt-4 text-xs sm:text-sm"
              onClick={() => navigate('/account/activity')}
            >
              View All Activity
            </Button>
          </div>
        </div>

        {/* Security & Quick Links */}
        <div className="mt-4 sm:mt-6 fusion-card p-4 sm:p-6">
          <h3 className="font-display font-semibold text-foreground text-sm sm:text-base mb-3 sm:mb-4 flex items-center gap-2">
            Security & Administration
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <button 
              onClick={() => navigate('/account/users')}
              className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors text-left"
            >
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm">Manage Users</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Add, edit, or remove team members</p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
            </button>
            <button 
              onClick={() => navigate('/account/notifications')}
              className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors text-left"
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm">Notifications</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Email & push preferences</p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
            </button>
            <button className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors text-left">
              <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm">Billing History</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">View invoices and payments</p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

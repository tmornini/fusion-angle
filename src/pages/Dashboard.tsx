import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { 
  Lightbulb, 
  FolderKanban, 
  Users,
  TrendingUp,
  DollarSign,
  Clock,
  Zap,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Custom hook for animated counting
function useCountUp(end: number, duration: number = 1500, delay: number = 0) {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const animate = (timestamp: number) => {
        if (!startTimeRef.current) startTimeRef.current = timestamp;
        const progress = Math.min((timestamp - startTimeRef.current) / duration, 1);
        
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        countRef.current = Math.floor(easeOutQuart * end);
        setCount(countRef.current);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setCount(end);
        }
      };
      requestAnimationFrame(animate);
    }, delay);

    return () => clearTimeout(timeout);
  }, [end, duration, delay]);

  return count;
}

interface DualGaugeMetric {
  value: number;
  max: number;
  label: string;
  displayValue: string;
  tooltipDetail?: string;
}

interface DualGaugeCardProps {
  title: string;
  icon: React.ReactNode;
  innerMetric: DualGaugeMetric;
  outerMetric: DualGaugeMetric;
  animationDelay?: number;
  theme: 'blue' | 'green' | 'amber';
}

function DualGaugeCard({ title, icon, innerMetric, outerMetric, animationDelay = 0, theme }: DualGaugeCardProps) {
  const animatedInner = useCountUp(innerMetric.value, 1500, animationDelay);
  const animatedOuter = useCountUp(outerMetric.value, 1500, animationDelay + 200);
  
  const innerPercentage = Math.min((animatedInner / innerMetric.max) * 100, 100);
  const outerPercentage = Math.min((animatedOuter / outerMetric.max) * 100, 100);

  // Card background themes - different for each card
  const cardThemes = {
    blue: {
      bg: 'bg-blue-50/50 dark:bg-blue-950/20',
      iconBg: 'from-primary/20 to-primary/10',
      border: 'border-primary/15 hover:border-primary/30',
    },
    green: {
      bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
      iconBg: 'from-success/20 to-success/10',
      border: 'border-success/15 hover:border-success/30',
    },
    amber: {
      bg: 'bg-amber-50/50 dark:bg-amber-950/20',
      iconBg: 'from-warning/20 to-warning/10',
      border: 'border-warning/15 hover:border-warning/30',
    },
  };

  // Same gauge colors for all cards
  const gaugeColors = {
    outer: 'hsl(var(--primary))',
    inner: 'hsl(var(--success))',
    dotOuter: 'bg-primary',
    dotInner: 'bg-success',
  };

  const cardStyle = cardThemes[theme];

  const formatValue = (value: number, displayValue: string) => {
    if (displayValue.startsWith('$')) {
      if (displayValue.includes('K')) {
        return `$${(value / 1000).toFixed(value >= 1000 ? 1 : 0)}K`;
      }
      return `$${value.toLocaleString()}`;
    }
    if (displayValue.endsWith('%')) return `${value}%`;
    if (displayValue.endsWith('d')) return `${value}d`;
    return value.toLocaleString();
  };

  const uniqueId = title.replace(/\s+/g, '-').toLowerCase();

  return (
    <div className={`relative rounded-xl p-6 hover:shadow-xl transition-all duration-300 group border-2 ${cardStyle.border} ${cardStyle.bg}`}>
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${cardStyle.iconBg} flex items-center justify-center shadow-sm`}>
            {icon}
          </div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        
        {/* Gauge centered */}
        <div className="flex justify-center mb-5">
          <svg width="180" height="95" viewBox="0 0 180 95" className="overflow-visible">
            <defs>
            <linearGradient id={`inner-grad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={gaugeColors.inner} stopOpacity="0.4" />
              <stop offset="100%" stopColor={gaugeColors.inner} stopOpacity="1" />
            </linearGradient>
            <linearGradient id={`outer-grad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={gaugeColors.outer} stopOpacity="0.4" />
              <stop offset="100%" stopColor={gaugeColors.outer} stopOpacity="1" />
            </linearGradient>
              <filter id={`glow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            
            {/* Outer arc background */}
            <path
              d={`M ${90 - 65} ${85} A 65 65 0 0 1 ${90 + 65} ${85}`}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth={14}
              strokeLinecap="round"
              opacity="0.3"
            />
            {/* Outer arc foreground */}
            <path
              d={`M ${90 - 65} ${85} A 65 65 0 0 1 ${90 + 65} ${85}`}
              fill="none"
              stroke={`url(#outer-grad-${uniqueId})`}
              strokeWidth={14}
              strokeLinecap="round"
              strokeDasharray={Math.PI * 65}
              strokeDashoffset={Math.PI * 65 - (outerPercentage / 100) * Math.PI * 65}
              className="transition-all duration-700 ease-out"
              style={{ filter: `url(#glow-${uniqueId})` }}
            />
            
            {/* Inner arc background */}
            <path
              d={`M ${90 - 45} ${85} A 45 45 0 0 1 ${90 + 45} ${85}`}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth={14}
              strokeLinecap="round"
              opacity="0.3"
            />
            {/* Inner arc foreground */}
            <path
              d={`M ${90 - 45} ${85} A 45 45 0 0 1 ${90 + 45} ${85}`}
              fill="none"
              stroke={`url(#inner-grad-${uniqueId})`}
              strokeWidth={14}
              strokeLinecap="round"
              strokeDasharray={Math.PI * 45}
              strokeDashoffset={Math.PI * 45 - (innerPercentage / 100) * Math.PI * 45}
              className="transition-all duration-700 ease-out"
              style={{ filter: `url(#glow-${uniqueId})` }}
            />
          </svg>
        </div>
        
        {/* Metrics - Side by side, full text */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 rounded-lg bg-card/80 border border-border/50">
            <div className="flex items-center justify-center gap-2 mb-1">
              <div className={`w-2.5 h-2.5 rounded-full ${gaugeColors.dotOuter}`} />
              <span className="text-xs text-muted-foreground font-medium">{outerMetric.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {formatValue(animatedOuter, outerMetric.displayValue)}
            </p>
          </div>
          <div className="text-center p-3 rounded-lg bg-card/80 border border-border/50">
            <div className="flex items-center justify-center gap-2 mb-1">
              <div className={`w-2.5 h-2.5 rounded-full ${gaugeColors.dotInner}`} />
              <span className="text-xs text-muted-foreground font-medium">{innerMetric.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {formatValue(animatedInner, innerMetric.displayValue)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const userName = 'Demo User';
  const companyName = 'Demo Company';

  return (
    <DashboardLayout userName={userName} companyName={companyName}>
      {/* Welcome Section - Enhanced Hero Card */}
      <div className="relative overflow-hidden fusion-card p-6 sm:p-8 mb-6 sm:mb-8 border-2 border-primary/10">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-accent/[0.06]" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-primary/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-accent/10 to-transparent rounded-full blur-2xl translate-y-1/2 -translate-x-1/4" />
        
        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* Greeting */}
            <div className="flex items-start gap-4">
              <div className="hidden sm:flex w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 items-center justify-center shadow-lg">
                <Sparkles className="w-7 h-7 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary mb-1">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}</p>
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-2">
                  Welcome back, {userName}
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground max-w-md">
                  Here's an overview of your work in progress at <span className="font-medium text-foreground">{companyName}</span>
                </p>
              </div>
            </div>
            
            {/* Key Stats Summary - Minimal */}
            <div className="flex items-center gap-6 sm:gap-8">
              {[
                { label: 'Ideas', value: 12, trend: '+3' },
                { label: 'Projects', value: 5, trend: '+1' },
                { label: 'Done', value: 8, trend: null },
                { label: 'Review', value: 3, trend: null },
              ].map((stat, index) => (
                <div key={stat.label} className="flex items-center gap-6 sm:gap-8">
                  <div className="text-center">
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-2xl sm:text-3xl font-bold text-foreground">{stat.value}</span>
                      {stat.trend && (
                        <span className="text-xs font-semibold text-success">{stat.trend}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-medium mt-0.5">{stat.label}</p>
                  </div>
                  {index < 3 && (
                    <div className="h-8 w-px bg-border" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Grid - Dual Gauge Style */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <DualGaugeCard
          title="Cost Overview"
          icon={<DollarSign className="w-5 h-5 text-primary" />}
          theme="blue"
          outerMetric={{
            value: 42300,
            max: 50000,
            label: "Budget Spent",
            displayValue: "$42.3K",
            tooltipDetail: "84.6% of total budget utilized"
          }}
          innerMetric={{
            value: 25000,
            max: 50000,
            label: "ROI Generated",
            displayValue: "$25K",
            tooltipDetail: "50% return on investment achieved"
          }}
          animationDelay={0}
        />
        <DualGaugeCard
          title="Time Tracking"
          icon={<Clock className="w-5 h-5 text-success" />}
          theme="green"
          outerMetric={{
            value: 25,
            max: 30,
            label: "Total Duration",
            displayValue: "25d",
            tooltipDetail: "Project timeline: 30 days total"
          }}
          innerMetric={{
            value: 12,
            max: 30,
            label: "Days Elapsed",
            displayValue: "12d",
            tooltipDetail: "40% of timeline completed"
          }}
          animationDelay={150}
        />
        <DualGaugeCard
          title="Project Impact"
          icon={<Zap className="w-5 h-5 text-warning" />}
          theme="amber"
          outerMetric={{
            value: 92,
            max: 100,
            label: "Target Score",
            displayValue: "92%",
            tooltipDetail: "Goal: 92% impact score"
          }}
          innerMetric={{
            value: 85,
            max: 100,
            label: "Current Score",
            displayValue: "85%",
            tooltipDetail: "7 points below target"
          }}
          animationDelay={300}
        />
      </div>

      {/* Quick Actions */}
      <div className="relative overflow-hidden fusion-card p-6 sm:p-8 border-2 border-dashed border-border/60 hover:border-primary/30 transition-colors">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.02] via-transparent to-accent/[0.02]" />
        <div className="relative z-10">
          <h2 className="text-lg sm:text-xl font-display font-semibold text-foreground mb-5 sm:mb-6">Quick Actions</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {[
              { label: 'New Idea', icon: Lightbulb, href: '/ideas/new', color: 'from-yellow-500/20 to-yellow-600/10' },
              { label: 'Create Project', icon: FolderKanban, href: '/projects', color: 'from-primary/20 to-primary/10' },
              { label: 'Invite Team', icon: Users, href: '/teams', color: 'from-success/20 to-success/10' },
              { label: 'View Reports', icon: TrendingUp, href: '/dashboard', color: 'from-info/20 to-info/10' },
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.href)}
                className="relative overflow-hidden flex flex-col items-center gap-3 p-5 sm:p-6 rounded-xl border-2 border-border/50 hover:border-primary/40 bg-card hover:bg-card/80 transition-all duration-300 group hover:shadow-lg hover:-translate-y-0.5"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${action.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                <div className="relative z-10 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center group-hover:from-primary/15 group-hover:to-primary/5 transition-all duration-300 shadow-sm group-hover:shadow-md">
                  <action.icon className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                </div>
                <span className="relative z-10 text-sm sm:text-base font-semibold text-foreground text-center">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

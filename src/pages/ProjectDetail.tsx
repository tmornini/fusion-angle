import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { 
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  Users,
  Calendar,
  Target,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  FileText,
  History,
  MoreVertical,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ListTodo,
  GitBranch,
  Database,
  Code2,
  Lightbulb,
  Shield,
  BarChart3,
  Gauge
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import TaskAssignment from '@/components/TaskAssignment';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';

// Mock project data
const mockProject = {
  id: '1',
  title: 'AI-Powered Customer Segmentation',
  description: 'Implement machine learning model to automatically segment customers based on behavior, purchase history, and engagement patterns.',
  status: 'approved' as const,
  progress: 72,
  startDate: '2024-01-15',
  targetEndDate: '2024-04-15',
  projectLead: 'Sarah Chen',
  
  // Baseline vs Actual
  metrics: {
    time: { baseline: 120, current: 85, unit: 'hours' },
    cost: { baseline: 45000, current: 38000, unit: '$' },
    impact: { baseline: 85, current: 78, unit: 'pts' },
  },

  // Edge Baseline KPIs (from idea conversion)
  edge: {
    outcomes: [
      {
        id: '1',
        description: 'Reduce customer churn rate',
        metrics: [
          { id: '1', name: 'Churn Rate Reduction', target: '15', unit: '%', current: '12' },
          { id: '2', name: 'Customer Retention', target: '85', unit: '%', current: '82' },
        ]
      },
      {
        id: '2',
        description: 'Increase marketing ROI',
        metrics: [
          { id: '3', name: 'Campaign Conversion', target: '25', unit: '%', current: '28' },
          { id: '4', name: 'Cost per Acquisition', target: '45', unit: '$', current: '42' },
        ]
      }
    ],
    impact: {
      shortTerm: 'Automated segmentation reduces manual effort by 80%. Initial customer insights available within 2 weeks.',
      midTerm: 'Expected 15% reduction in churn through targeted campaigns. Marketing ROI improvement of 25%.',
      longTerm: 'Full personalization pipeline enabling real-time customer journey optimization across all channels.'
    },
    confidence: 'high' as const,
    owner: 'Sarah Chen'
  },

  // Team
  team: [
    { id: '1', name: 'Sarah Chen', role: 'Project Lead', avatar: null },
    { id: '2', name: 'Mike Thompson', role: 'ML Engineer', avatar: null },
    { id: '3', name: 'Jessica Park', role: 'Data Scientist', avatar: null },
    { id: '4', name: 'David Martinez', role: 'Backend Developer', avatar: null },
  ],

  // Milestones
  milestones: [
    { id: '1', title: 'Data Pipeline Setup', status: 'completed', date: '2024-01-30' },
    { id: '2', title: 'Model Training Complete', status: 'completed', date: '2024-02-15' },
    { id: '3', title: 'Integration Testing', status: 'in_progress', date: '2024-03-01' },
    { id: '4', title: 'User Acceptance Testing', status: 'pending', date: '2024-03-20' },
    { id: '5', title: 'Production Deployment', status: 'pending', date: '2024-04-01' },
  ],

  // Version history
  versions: [
    { id: '1', version: 'v1.2', date: '2024-02-28', changes: 'Added real-time segmentation capability', author: 'Mike Thompson' },
    { id: '2', version: 'v1.1', date: '2024-02-15', changes: 'Improved model accuracy by 12%', author: 'Jessica Park' },
    { id: '3', version: 'v1.0', date: '2024-01-30', changes: 'Initial model deployment', author: 'Sarah Chen' },
  ],

  // Discussions
  discussions: [
    { id: '1', author: 'Sarah Chen', date: '2024-02-28', message: 'Great progress on the integration testing. We should be ready for UAT next week.' },
    { id: '2', author: 'Mike Thompson', date: '2024-02-25', message: 'Segmentation accuracy is now at 94%. Exceeding our initial target of 90%.' },
    { id: '3', author: 'David Martinez', date: '2024-02-20', message: 'API endpoints are ready for frontend integration.' },
  ],
};

const confidenceConfig = {
  high: { label: 'High Confidence', className: 'bg-success-soft text-success' },
  medium: { label: 'Medium Confidence', className: 'bg-warning-soft text-warning' },
  low: { label: 'Low Confidence', className: 'bg-error-soft text-error' }
};

export default function ProjectDetail() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [newComment, setNewComment] = useState('');

  const getVarianceIcon = (baseline: number, current: number, isLowerBetter: boolean) => {
    const variance = current - baseline;
    if (variance === 0) return <Minus className="w-4 h-4 text-muted-foreground" />;
    
    if (isLowerBetter) {
      return variance < 0 
        ? <ArrowDownRight className="w-4 h-4 text-green-600" />
        : <ArrowUpRight className="w-4 h-4 text-red-500" />;
    }
    return variance > 0 
      ? <ArrowUpRight className="w-4 h-4 text-green-600" />
      : <ArrowDownRight className="w-4 h-4 text-red-500" />;
  };

  const getVarianceColor = (baseline: number, current: number, isLowerBetter: boolean) => {
    const variance = current - baseline;
    if (variance === 0) return 'text-muted-foreground';
    
    if (isLowerBetter) {
      return variance < 0 ? 'text-green-600' : 'text-red-500';
    }
    return variance > 0 ? 'text-green-600' : 'text-red-500';
  };

  const getMilestoneStatus = (status: string) => {
    switch (status) {
      case 'completed':
        return { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-500' };
      case 'in_progress':
        return { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-500' };
      default:
        return { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted' };
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <Breadcrumbs items={[
          { label: 'Projects', href: '/projects' },
          { label: mockProject.title }
        ]} />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
              <h1 className="text-xl sm:text-2xl font-display font-bold text-foreground">{mockProject.title}</h1>
              <div className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-600" />
                <span className="text-emerald-600">Approved</span>
              </div>
            </div>
            <p className="text-sm sm:text-base text-muted-foreground">
              Led by {mockProject.projectLead} • {mockProject.progress}% complete
            </p>
          </div>
          <Button variant="outline" size="icon" className="self-start">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </div>

        {/* Quick Actions - Tool Links */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6 sm:mb-8">
          <Link 
            to={`/projects/${projectId}/engineering`}
            className="fusion-card p-3 sm:p-4 hover:border-primary/30 transition-all group"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
                <Code2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm sm:text-base text-foreground group-hover:text-primary transition-colors truncate">Engineering</p>
                <p className="text-xs text-muted-foreground hidden sm:block">Requirements & clarifications</p>
              </div>
            </div>
          </Link>
          <Link 
            to="/teams"
            className="fusion-card p-3 sm:p-4 hover:border-primary/30 transition-all group"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm sm:text-base text-foreground group-hover:text-primary transition-colors truncate">Team</p>
                <p className="text-xs text-muted-foreground hidden sm:block">Manage assignments</p>
              </div>
            </div>
          </Link>
          <Link 
            to="/flow"
            className="fusion-card p-3 sm:p-4 hover:border-primary/30 transition-all group"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
                <GitBranch className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm sm:text-base text-foreground group-hover:text-primary transition-colors truncate">Flow</p>
                <p className="text-xs text-muted-foreground hidden sm:block">Document processes</p>
              </div>
            </div>
          </Link>
          <Link 
            to="/crunch"
            className="fusion-card p-3 sm:p-4 hover:border-primary/30 transition-all group"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
                <Database className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm sm:text-base text-foreground group-hover:text-primary transition-colors truncate">Crunch</p>
                <p className="text-xs text-muted-foreground hidden sm:block">Data inputs</p>
              </div>
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Summary Card */}
            <div className="fusion-card p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-display font-semibold text-foreground mb-3 sm:mb-4">Project Summary</h2>
              <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6">{mockProject.description}</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Calendar className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">Start Date</p>
                    <p className="text-sm font-medium text-foreground">{mockProject.startDate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Target className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">Target End</p>
                    <p className="text-sm font-medium text-foreground">{mockProject.targetEndDate}</p>
                  </div>
                </div>
              </div>

              {/* Progress */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">Overall Progress</span>
                  <span className="text-sm font-bold text-primary">{mockProject.progress}%</span>
                </div>
                <Progress value={mockProject.progress} className="h-3" />
              </div>
            </div>

            {/* Baseline vs Current Performance */}
            <div className="fusion-card p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 sm:mb-6">
                <h2 className="text-base sm:text-lg font-display font-semibold text-foreground">Baseline vs Current</h2>
                <span className="text-xs text-muted-foreground">Real-time comparison</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {/* Time */}
                <div className="p-4 rounded-xl bg-muted/30 border border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-5 h-5 text-primary" />
                    <span className="font-medium text-foreground">Time</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Baseline</span>
                      <span className="text-sm font-medium text-foreground">{mockProject.metrics.time.baseline}h</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Current</span>
                      <span className="text-sm font-medium text-foreground">{mockProject.metrics.time.current}h</span>
                    </div>
                    <div className="pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Variance</span>
                      <div className={`flex items-center gap-1 ${getVarianceColor(mockProject.metrics.time.baseline, mockProject.metrics.time.current, true)}`}>
                        {getVarianceIcon(mockProject.metrics.time.baseline, mockProject.metrics.time.current, true)}
                        <span className="text-sm font-bold">
                          {Math.abs(mockProject.metrics.time.current - mockProject.metrics.time.baseline)}h
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cost */}
                <div className="p-4 rounded-xl bg-muted/30 border border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="w-5 h-5 text-primary" />
                    <span className="font-medium text-foreground">Cost</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Baseline</span>
                      <span className="text-sm font-medium text-foreground">${(mockProject.metrics.cost.baseline / 1000).toFixed(0)}k</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Current</span>
                      <span className="text-sm font-medium text-foreground">${(mockProject.metrics.cost.current / 1000).toFixed(0)}k</span>
                    </div>
                    <div className="pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Variance</span>
                      <div className={`flex items-center gap-1 ${getVarianceColor(mockProject.metrics.cost.baseline, mockProject.metrics.cost.current, true)}`}>
                        {getVarianceIcon(mockProject.metrics.cost.baseline, mockProject.metrics.cost.current, true)}
                        <span className="text-sm font-bold">
                          ${Math.abs(mockProject.metrics.cost.current - mockProject.metrics.cost.baseline) / 1000}k
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Impact */}
                <div className="p-4 rounded-xl bg-muted/30 border border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    <span className="font-medium text-foreground">Impact</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Baseline</span>
                      <span className="text-sm font-medium text-foreground">{mockProject.metrics.impact.baseline} pts</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Current</span>
                      <span className="text-sm font-medium text-foreground">{mockProject.metrics.impact.current} pts</span>
                    </div>
                    <div className="pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Variance</span>
                      <div className={`flex items-center gap-1 ${getVarianceColor(mockProject.metrics.impact.baseline, mockProject.metrics.impact.current, false)}`}>
                        {getVarianceIcon(mockProject.metrics.impact.baseline, mockProject.metrics.impact.current, false)}
                        <span className="text-sm font-bold">
                          {Math.abs(mockProject.metrics.impact.current - mockProject.metrics.impact.baseline)} pts
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Edge Baseline KPIs */}
            <div className="fusion-card p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Target className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-display font-semibold text-foreground">Edge Baseline KPIs</h2>
                    <p className="text-xs text-muted-foreground">Original success criteria from idea approval</p>
                  </div>
                </div>
                <div className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-medium self-start sm:self-auto ${confidenceConfig[mockProject.edge.confidence].className}`}>
                  <Shield className="w-3 h-3 inline mr-1" />
                  {confidenceConfig[mockProject.edge.confidence].label}
                </div>
              </div>

              {/* Outcomes with Metrics */}
              <div className="space-y-4 mb-6">
                <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Business Outcomes & Metrics
                </h3>
                {mockProject.edge.outcomes.map((outcome, index) => (
                  <div key={outcome.id} className="p-4 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {index + 1}
                      </div>
                      <p className="font-medium text-foreground">{outcome.description}</p>
                    </div>
                    <div className="pl-9 space-y-2">
                      {outcome.metrics.map((metric) => {
                        const target = parseFloat(metric.target);
                        const current = parseFloat(metric.current);
                        const isOnTrack = metric.unit === '$' 
                          ? current <= target 
                          : current >= target * 0.9;
                        
                        return (
                          <div key={metric.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded bg-background border border-border">
                            <div className="flex items-center gap-2">
                              <Gauge className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="text-sm text-foreground">{metric.name}</span>
                            </div>
                            <div className="flex items-center gap-3 sm:gap-4 ml-6 sm:ml-0">
                              <div className="text-left sm:text-right">
                                <p className="text-xs text-muted-foreground">Target</p>
                                <p className="text-sm font-medium text-foreground">
                                  {metric.unit === '$' ? `$${metric.target}` : `${metric.target}${metric.unit}`}
                                </p>
                              </div>
                              <div className="text-left sm:text-right">
                                <p className="text-xs text-muted-foreground">Current</p>
                                <p className={`text-sm font-medium ${isOnTrack ? 'text-success' : 'text-warning'}`}>
                                  {metric.unit === '$' ? `$${metric.current}` : `${metric.current}${metric.unit}`}
                                </p>
                              </div>
                              <div className={`w-2 h-2 rounded-full shrink-0 ${isOnTrack ? 'bg-success' : 'bg-warning'}`} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Expected Impact Timeline */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Expected Impact Timeline
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-success-soft border border-success/20">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Clock className="w-3.5 h-3.5 text-success" />
                      <span className="text-xs font-medium text-success">Short-term (0-3mo)</span>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">{mockProject.edge.impact.shortTerm}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-warning-soft border border-warning/20">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Clock className="w-3.5 h-3.5 text-warning" />
                      <span className="text-xs font-medium text-warning">Mid-term (3-12mo)</span>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">{mockProject.edge.impact.midTerm}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-info-soft border border-primary/20">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-medium text-primary">Long-term (12+mo)</span>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">{mockProject.edge.impact.longTerm}</p>
                  </div>
                </div>
              </div>

              {/* Owner */}
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Edge Owner</span>
                <span className="text-sm font-medium text-foreground">{mockProject.edge.owner}</span>
              </div>
            </div>

            {/* Tabs for Discussion, History, Linked Data */}
            <Tabs defaultValue="tasks" className="fusion-card p-4 sm:p-6">
              <TabsList className="mb-4 sm:mb-6 w-full flex overflow-x-auto">
                <TabsTrigger value="tasks" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none">
                  <ListTodo className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Tasks</span>
                  <span className="sm:hidden">Tasks</span>
                </TabsTrigger>
                <TabsTrigger value="discussion" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none">
                  <MessageSquare className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Discussion</span>
                  <span className="sm:hidden">Chat</span>
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none">
                  <History className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Version History</span>
                  <span className="sm:hidden">History</span>
                </TabsTrigger>
                <TabsTrigger value="linked" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none">
                  <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Linked Data</span>
                  <span className="sm:hidden">Data</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="tasks">
                <TaskAssignment projectId={projectId || ''} />
              </TabsContent>

              <TabsContent value="discussion" className="space-y-4">
                {/* New Comment */}
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary">D</span>
                  </div>
                  <div className="flex-1">
                    <Textarea
                      placeholder="Add a comment or update..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="min-h-[80px] resize-none"
                    />
                    <div className="flex justify-end mt-2">
                      <Button size="sm" disabled={!newComment.trim()}>
                        Post Comment
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-4 space-y-4">
                  {mockProject.discussions.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-muted-foreground">
                          {comment.author.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-foreground">{comment.author}</span>
                          <span className="text-xs text-muted-foreground">{comment.date}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{comment.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="history" className="space-y-3">
                {mockProject.versions.map((version, index) => (
                  <div 
                    key={version.id}
                    className={`flex items-start gap-4 p-4 rounded-lg ${index === 0 ? 'bg-primary/5 border border-primary/20' : 'bg-muted/30'}`}
                  >
                    <div className={`px-2 py-1 rounded text-xs font-bold ${index === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {version.version}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{version.changes}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {version.author} • {version.date}
                      </p>
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="linked" className="text-center py-8">
                <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground mb-4">No linked data yet</p>
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Link Data Source
                </Button>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 sm:space-y-6">
            {/* Team */}
            <div className="fusion-card p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="font-display font-semibold text-foreground text-sm sm:text-base">Team</h3>
                <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs">
                  <Plus className="w-3 h-3" />
                  Add
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-1 gap-3">
                {mockProject.team.map((member) => (
                  <div key={member.id} className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">
                        {member.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-foreground truncate">{member.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Milestones */}
            <div className="fusion-card p-4 sm:p-6">
              <h3 className="font-display font-semibold text-foreground text-sm sm:text-base mb-3 sm:mb-4">Milestones</h3>
              <div className="relative">
                {mockProject.milestones.map((milestone, index) => {
                  const statusInfo = getMilestoneStatus(milestone.status);
                  const StatusIcon = statusInfo.icon;
                  
                  return (
                    <div key={milestone.id} className="flex gap-3 pb-4 last:pb-0">
                      <div className="flex flex-col items-center">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${statusInfo.bg}`}>
                          <StatusIcon className="w-3 h-3 text-white" />
                        </div>
                        {index < mockProject.milestones.length - 1 && (
                          <div className="w-0.5 flex-1 bg-border mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-2">
                        <p className={`text-sm font-medium ${statusInfo.color}`}>{milestone.title}</p>
                        <p className="text-xs text-muted-foreground">{milestone.date}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

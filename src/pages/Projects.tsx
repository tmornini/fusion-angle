import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  GripVertical,
  TrendingUp,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  XCircle,
  LayoutGrid,
  BarChart3,
  Eye,
  Target
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useIsMobile } from '@/hooks/use-mobile';

interface Project {
  id: string;
  title: string;
  status: 'approved' | 'under_review' | 'sent_back';
  priorityScore: number;
  estimatedTime: number;
  actualTime: number;
  estimatedCost: number;
  actualCost: number;
  estimatedImpact: number;
  actualImpact: number;
  progress: number;
  priority: number;
}

const mockProjects: Project[] = [
  { id: '1', title: 'AI-Powered Customer Segmentation', status: 'approved', priorityScore: 92, estimatedTime: 120, actualTime: 85, estimatedCost: 45000, actualCost: 38000, estimatedImpact: 85, actualImpact: 78, progress: 72, priority: 1 },
  { id: '2', title: 'Automated Report Generation', status: 'approved', priorityScore: 87, estimatedTime: 80, actualTime: 60, estimatedCost: 32000, actualCost: 28000, estimatedImpact: 78, actualImpact: 82, progress: 85, priority: 2 },
  { id: '3', title: 'Predictive Maintenance System', status: 'under_review', priorityScore: 84, estimatedTime: 200, actualTime: 45, estimatedCost: 75000, actualCost: 18000, estimatedImpact: 90, actualImpact: 0, progress: 22, priority: 3 },
  { id: '4', title: 'Real-time Analytics Dashboard', status: 'approved', priorityScore: 81, estimatedTime: 60, actualTime: 55, estimatedCost: 28000, actualCost: 26000, estimatedImpact: 72, actualImpact: 70, progress: 95, priority: 4 },
  { id: '5', title: 'Smart Inventory Optimization', status: 'sent_back', priorityScore: 78, estimatedTime: 100, actualTime: 30, estimatedCost: 38000, actualCost: 12000, estimatedImpact: 68, actualImpact: 0, progress: 15, priority: 5 },
  { id: '6', title: 'Employee Training Assistant', status: 'under_review', priorityScore: 74, estimatedTime: 90, actualTime: 20, estimatedCost: 35000, actualCost: 8000, estimatedImpact: 65, actualImpact: 0, progress: 18, priority: 6 },
];

function ProjectCard({ project, view, onView }: { project: Project; view: 'priority' | 'performance'; onView: (id: string) => void }) {
  const isMobile = useIsMobile();
  
  const getStatusConfig = (status: Project['status']) => {
    switch (status) {
      case 'approved':
        return { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 border-green-200', label: 'Approved' };
      case 'under_review':
        return { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: 'Under Review' };
      case 'sent_back':
        return { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 border-red-200', label: 'Sent Back' };
    }
  };

  const statusConfig = getStatusConfig(project.status);
  const StatusIcon = statusConfig.icon;

  return (
    <div className="fusion-card p-4 sm:p-5 hover:shadow-lg transition-all group">
      <div className="flex items-start gap-2 sm:gap-4">
        {/* Hide drag handle on mobile */}
        <div className="hidden sm:block text-muted-foreground/50 group-hover:text-muted-foreground transition-colors mt-1 cursor-grab active:cursor-grabbing">
          <GripVertical className="w-5 h-5" />
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 mb-3 sm:mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
                <h3 className="font-display font-semibold text-foreground text-base sm:text-lg truncate">
                  {project.title}
                </h3>
                <div className={`inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium border ${statusConfig.bg}`}>
                  <StatusIcon className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${statusConfig.color}`} />
                  <span className={statusConfig.color}>{statusConfig.label}</span>
                </div>
              </div>
              {view === 'priority' && (
                <span className="text-xs text-muted-foreground">Priority #{project.priority}</span>
              )}
            </div>
            
            {/* Progress Ring */}
            <div className="flex items-center gap-2">
              <div className="relative w-10 h-10 sm:w-12 sm:h-12">
                <svg className="w-10 h-10 sm:w-12 sm:h-12 -rotate-90">
                  <circle
                    cx={isMobile ? "20" : "24"}
                    cy={isMobile ? "20" : "24"}
                    r={isMobile ? "16" : "20"}
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    className="text-muted"
                  />
                  <circle
                    cx={isMobile ? "20" : "24"}
                    cy={isMobile ? "20" : "24"}
                    r={isMobile ? "16" : "20"}
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    strokeDasharray={`${project.progress * (isMobile ? 1.005 : 1.256)} ${isMobile ? 100.5 : 125.6}`}
                    className="text-primary"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-xs font-bold text-foreground">
                  {project.progress}%
                </span>
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Score</p>
                  <p className="text-xs sm:text-sm font-medium text-foreground">{project.priorityScore}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Impact</p>
                  <p className="text-xs sm:text-sm font-medium text-foreground">
                    {project.actualImpact || project.estimatedImpact}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Time</p>
                  <p className="text-xs sm:text-sm font-medium text-foreground">
                    {project.actualTime}h
                    <span className="text-[10px] sm:text-xs text-muted-foreground ml-1">/ {project.estimatedTime}h</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Cost</p>
                  <p className="text-xs sm:text-sm font-medium text-foreground">
                    ${(project.actualCost / 1000).toFixed(0)}k
                  </p>
                </div>
              </div>
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => onView(project.id)}
              className={`gap-1.5 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 ${isMobile ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
            >
              <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">View Details</span>
              <span className="sm:hidden">View</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Projects() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [view, setView] = useState<'priority' | 'performance'>('priority');
  const [projects] = useState<Project[]>(mockProjects);

  const sortedProjects = [...projects].sort((a, b) => {
    if (view === 'priority') return a.priority - b.priority;
    return b.priorityScore - a.priorityScore;
  });

  const statusCounts = {
    approved: projects.filter(p => p.status === 'approved').length,
    under_review: projects.filter(p => p.status === 'under_review').length,
    sent_back: projects.filter(p => p.status === 'sent_back').length,
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-1 sm:mb-2">Projects</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Track and manage active projects</p>
        </div>
        
        {/* Status Summary - Horizontal scroll on mobile */}
        <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto pb-1">
          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-green-50 border border-green-200 whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" />
            <span className="text-xs sm:text-sm font-medium text-green-600">{statusCounts.approved}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-amber-50 border border-amber-200 whitespace-nowrap">
            <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600" />
            <span className="text-xs sm:text-sm font-medium text-amber-600">{statusCounts.under_review}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-red-50 border border-red-200 whitespace-nowrap">
            <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />
            <span className="text-xs sm:text-sm font-medium text-red-500">{statusCounts.sent_back}</span>
          </div>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="inline-flex rounded-lg border border-border p-1 bg-muted/50 self-start">
          <button
            onClick={() => setView('priority')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              view === 'priority'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Priority
          </button>
          <button
            onClick={() => setView('performance')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              view === 'performance'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Performance
          </button>
        </div>
        <span className="text-xs sm:text-sm text-muted-foreground">
          {sortedProjects.length} projects • {view === 'priority' ? 'by priority' : 'by score'}
        </span>
      </div>

      {/* Projects Grid */}
      <div className="space-y-3 sm:space-y-4">
        {sortedProjects.map((project) => (
          <ProjectCard 
            key={project.id} 
            project={project} 
            view={view}
            onView={(id) => navigate(`/projects/${id}`)}
          />
        ))}
      </div>
    </DashboardLayout>
  );
}

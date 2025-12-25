import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus,
  Wand2,
  GripVertical,
  TrendingUp,
  Clock,
  DollarSign,
  Star,
  LayoutGrid,
  BarChart3,
  Eye,
  ClipboardCheck,
  ChevronRight,
  ArrowRight,
  Lightbulb,
  Target
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';

interface Idea {
  id: string;
  title: string;
  score: number;
  estimatedImpact: number;
  estimatedTime: number;
  estimatedCost: number;
  priority: number;
  status: 'draft' | 'scored' | 'pending_review' | 'approved' | 'rejected';
  submittedBy: string;
  edgeStatus: 'incomplete' | 'draft' | 'complete';
}

const mockIdeas: Idea[] = [
  { id: '1', title: 'AI-Powered Customer Segmentation', score: 92, estimatedImpact: 85, estimatedTime: 120, estimatedCost: 45000, priority: 1, status: 'pending_review', submittedBy: 'Sarah Chen', edgeStatus: 'complete' },
  { id: '2', title: 'Automated Report Generation', score: 87, estimatedImpact: 78, estimatedTime: 80, estimatedCost: 32000, priority: 2, status: 'approved', submittedBy: 'Mike Thompson', edgeStatus: 'complete' },
  { id: '3', title: 'Predictive Maintenance System', score: 84, estimatedImpact: 90, estimatedTime: 200, estimatedCost: 75000, priority: 3, status: 'scored', submittedBy: 'Emily Rodriguez', edgeStatus: 'draft' },
  { id: '4', title: 'Real-time Analytics Dashboard', score: 81, estimatedImpact: 72, estimatedTime: 60, estimatedCost: 28000, priority: 4, status: 'pending_review', submittedBy: 'David Kim', edgeStatus: 'complete' },
  { id: '5', title: 'Smart Inventory Optimization', score: 78, estimatedImpact: 68, estimatedTime: 100, estimatedCost: 38000, priority: 5, status: 'draft', submittedBy: 'Lisa Wang', edgeStatus: 'incomplete' },
  { id: '6', title: 'Employee Training Assistant', score: 74, estimatedImpact: 65, estimatedTime: 90, estimatedCost: 35000, priority: 6, status: 'rejected', submittedBy: 'Jessica Park', edgeStatus: 'incomplete' },
];

const statusConfig = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  scored: { label: 'Scored', className: 'bg-primary/10 text-primary' },
  pending_review: { label: 'Pending Review', className: 'bg-amber-500/10 text-amber-600' },
  approved: { label: 'Approved', className: 'bg-emerald-500/10 text-emerald-600' },
  rejected: { label: 'Sent Back', className: 'bg-destructive/10 text-destructive' },
};

const edgeStatusConfig = {
  incomplete: { label: 'Edge Missing', className: 'bg-error-soft text-error border-error/30', icon: '🔴' },
  draft: { label: 'Edge Draft', className: 'bg-warning-soft text-warning border-warning/30', icon: '🟡' },
  complete: { label: 'Edge Complete', className: 'bg-success-soft text-success border-success/30', icon: '🟢' },
};

function IdeaCard({ idea, view, onScore, onReview, onEdge }: { 
  idea: Idea; 
  view: 'priority' | 'performance'; 
  onScore: (id: string) => void;
  onReview: (id: string) => void;
  onEdge: (id: string) => void;
}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  
  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-600 bg-emerald-50';
    if (score >= 70) return 'text-amber-600 bg-amber-50';
    return 'text-destructive bg-destructive/10';
  };

  const canReview = idea.status === 'pending_review' && idea.edgeStatus === 'complete';
  const canConvert = idea.status === 'approved';
  const needsEdge = idea.edgeStatus !== 'complete' && idea.status !== 'draft';

  return (
    <div 
      className="fusion-card p-4 sm:p-5 hover:shadow-lg transition-all group cursor-pointer"
      onClick={() => onScore(idea.id)}
    >
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
                <h3 className="font-display font-semibold text-foreground text-base sm:text-lg truncate group-hover:text-primary transition-colors">
                  {idea.title}
                </h3>
                <Badge variant="outline" className={`text-xs ${statusConfig[idea.status].className}`}>
                  {statusConfig[idea.status].label}
                </Badge>
                <Badge variant="outline" className={`text-xs ${edgeStatusConfig[idea.edgeStatus].className}`}>
                  <Target className="w-3 h-3 mr-1" />
                  {edgeStatusConfig[idea.edgeStatus].label}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {view === 'priority' && <span>Priority #{idea.priority}</span>}
                <span>•</span>
                <span>by {idea.submittedBy}</span>
              </div>
            </div>
            <div className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-semibold text-xs sm:text-sm ${getScoreColor(idea.score)}`}>
              <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 inline mr-1" />
              {idea.score}
            </div>
          </div>

          {/* Metrics - Stack on mobile */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
            <div className="grid grid-cols-3 gap-2 sm:gap-4 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Impact</p>
                  <p className="text-xs sm:text-sm font-medium text-foreground">{idea.estimatedImpact}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Time</p>
                  <p className="text-xs sm:text-sm font-medium text-foreground">{idea.estimatedTime}h</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Cost</p>
                  <p className="text-xs sm:text-sm font-medium text-foreground">${(idea.estimatedCost / 1000).toFixed(0)}k</p>
                </div>
              </div>
            </div>

            {/* Actions - Always visible on mobile */}
            <div className={`flex items-center gap-2 ${isMobile ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`} onClick={(e) => e.stopPropagation()}>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onScore(idea.id)}
                className="gap-1.5 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9"
              >
                <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">View</span>
              </Button>
              {needsEdge && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => onEdge(idea.id)}
                  className="gap-1.5 sm:gap-2 border-primary/30 text-primary hover:bg-primary/10 text-xs sm:text-sm h-8 sm:h-9"
                >
                  <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Define Edge</span>
                </Button>
              )}
              {canReview && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => onReview(idea.id)}
                  className="gap-1.5 sm:gap-2 border-amber-500/30 text-amber-600 hover:bg-amber-500/10 text-xs sm:text-sm h-8 sm:h-9"
                >
                  <ClipboardCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Review</span>
                </Button>
              )}
              {canConvert && (
                <Button 
                  size="sm" 
                  onClick={() => navigate(`/ideas/${idea.id}/convert`)}
                  className="gap-1.5 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9"
                >
                  <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Convert</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Ideas() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [view, setView] = useState<'priority' | 'performance'>('priority');
  const [ideas] = useState<Idea[]>(mockIdeas);

  const sortedIdeas = [...ideas].sort((a, b) => {
    if (view === 'priority') return a.priority - b.priority;
    return b.score - a.score;
  });

  const pendingReviewCount = ideas.filter(i => i.status === 'pending_review').length;

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-1 sm:mb-2">Ideas</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Explore and prioritize innovation opportunities</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {pendingReviewCount > 0 && (
            <Button 
              variant="outline" 
              size={isMobile ? "sm" : "default"}
              className="gap-2 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
              onClick={() => navigate('/review')}
            >
              <ClipboardCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Review Queue</span> ({pendingReviewCount})
            </Button>
          )}
          <Button variant="hero" size={isMobile ? "sm" : "default"} className="gap-2" onClick={() => navigate('/ideas/new')}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create or Generate Idea</span>
            <span className="sm:hidden">New Idea</span>
            <Wand2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Flow Indicator - Scrollable on mobile */}
      <div className="flex items-center gap-2 mb-4 sm:mb-6 p-3 rounded-lg bg-muted/30 border border-border overflow-x-auto">
        <Lightbulb className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
          <span className="font-medium text-foreground">Idea Flow:</span>
          {' '}Create → Score → <span className="text-primary font-medium">Edge</span> → Review → Convert
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto flex-shrink-0" />
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
          {sortedIdeas.length} ideas • {view === 'priority' ? 'by priority' : 'by score'}
        </span>
      </div>

      {/* Ideas Grid */}
      <div className="space-y-3 sm:space-y-4">
        {sortedIdeas.map((idea) => (
          <IdeaCard 
            key={idea.id} 
            idea={idea} 
            view={view} 
            onScore={(id) => navigate(`/ideas/${id}/score`)}
            onReview={(id) => navigate(`/review/${id}`)}
            onEdge={(id) => navigate(`/ideas/${id}/edge`)}
          />
        ))}
      </div>

      {/* Empty State */}
      {sortedIdeas.length === 0 && (
        <div className="text-center py-12 sm:py-16">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Lightbulb className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2">No ideas yet</h3>
          <p className="text-sm text-muted-foreground mb-6">Start by creating your first idea or generating one with AI</p>
          <Button variant="hero" onClick={() => navigate('/ideas/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Create Your First Idea
          </Button>
        </div>
      )}
    </DashboardLayout>
  );
}

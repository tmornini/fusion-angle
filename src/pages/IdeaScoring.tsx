import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft,
  ArrowRight,
  TrendingUp,
  Clock,
  DollarSign,
  Zap,
  Target,
  BarChart3,
  Info,
  CheckCircle2,
  Loader2,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface ScoreBreakdown {
  label: string;
  score: number;
  maxScore: number;
  reason: string;
}

interface IdeaScore {
  overall: number;
  impact: {
    score: number;
    breakdown: ScoreBreakdown[];
  };
  feasibility: {
    score: number;
    breakdown: ScoreBreakdown[];
  };
  efficiency: {
    score: number;
    breakdown: ScoreBreakdown[];
  };
  estimatedTime: string;
  estimatedCost: string;
  recommendation: string;
}

// Mock data - would come from AI scoring in real implementation
const mockIdea = {
  id: '1',
  title: 'AI-Powered Customer Segmentation',
  problemStatement: 'Marketing team spends 20+ hours weekly manually segmenting customers, leading to delayed campaigns and missed opportunities.',
  proposedSolution: 'Implement machine learning model to automatically segment customers based on behavior, purchase history, and engagement patterns.',
  expectedOutcome: 'Reduce segmentation time by 80%, enable real-time personalization, and increase campaign conversion rates by 25%.',
};

const mockScore: IdeaScore = {
  overall: 82,
  impact: {
    score: 88,
    breakdown: [
      { label: 'Business Value', score: 9, maxScore: 10, reason: 'Direct revenue impact through improved conversions' },
      { label: 'Strategic Alignment', score: 8, maxScore: 10, reason: 'Supports digital transformation goals' },
      { label: 'User Benefit', score: 9, maxScore: 10, reason: 'Saves significant time for marketing team' },
    ]
  },
  feasibility: {
    score: 75,
    breakdown: [
      { label: 'Technical Complexity', score: 7, maxScore: 10, reason: 'Requires ML expertise and data pipeline' },
      { label: 'Resource Availability', score: 8, maxScore: 10, reason: 'Team has relevant skills' },
      { label: 'Integration Effort', score: 8, maxScore: 10, reason: 'Works with existing CRM' },
    ]
  },
  efficiency: {
    score: 85,
    breakdown: [
      { label: 'Time to Value', score: 9, maxScore: 10, reason: 'MVP deliverable in 6-8 weeks' },
      { label: 'Cost Efficiency', score: 8, maxScore: 10, reason: 'Reasonable investment for expected returns' },
      { label: 'Scalability', score: 9, maxScore: 10, reason: 'Can expand to other use cases' },
    ]
  },
  estimatedTime: '6-8 weeks',
  estimatedCost: '$45,000 - $65,000',
  recommendation: 'Strong candidate for immediate prioritization. High impact with manageable complexity. Recommend starting with a focused pilot on top customer segment.'
};

export default function IdeaScoring() {
  const navigate = useNavigate();
  const { ideaId } = useParams();
  const [isScoring, setIsScoring] = useState(true);
  const [score, setScore] = useState<IdeaScore | null>(null);
  const [activeTab, setActiveTab] = useState<'impact' | 'feasibility' | 'efficiency'>('impact');

  useEffect(() => {
    // Simulate AI scoring process
    const timer = setTimeout(() => {
      setScore(mockScore);
      setIsScoring(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const tabs = [
    { id: 'impact', label: 'Impact', icon: TrendingUp, score: score?.impact.score || 0 },
    { id: 'feasibility', label: 'Feasibility', icon: Target, score: score?.feasibility.score || 0 },
    { id: 'efficiency', label: 'Efficiency', icon: Zap, score: score?.efficiency.score || 0 },
  ] as const;

  const currentTabData = score ? score[activeTab] : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/ideas')}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg gradient-hero flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-display font-bold text-foreground">Idea Scoring</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isScoring ? (
          /* Scoring Animation */
          <div className="fusion-card p-6 sm:p-12 text-center">
            <div className="w-20 h-20 mx-auto rounded-2xl gradient-hero flex items-center justify-center mb-6 animate-pulse">
              <Sparkles className="w-10 h-10 text-primary-foreground" />
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground mb-3">
              Analyzing Your Idea
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Our AI is evaluating impact, feasibility, and efficiency based on your inputs and historical data.
            </p>
            <div className="max-w-xs mx-auto space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle2 className="w-3 h-3 text-white" />
                </div>
                <span className="text-foreground">Problem analysis complete</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle2 className="w-3 h-3 text-white" />
                </div>
                <span className="text-foreground">Solution assessment complete</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                <span className="text-muted-foreground">Calculating priority score...</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Idea Summary */}
            <div className="fusion-card p-6">
              <h2 className="text-xl font-display font-bold text-foreground mb-2">
                {mockIdea.title}
              </h2>
              <p className="text-muted-foreground text-sm">
                {mockIdea.problemStatement}
              </p>
            </div>

            {/* Overall Score Card */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <div className="fusion-card p-6 text-center h-full flex flex-col justify-center">
                  <p className="text-sm font-medium text-muted-foreground mb-3">Overall Priority Score</p>
                  <div className={`text-6xl font-display font-bold ${getScoreColor(score?.overall || 0)} mb-2`}>
                    {score?.overall}
                  </div>
                  <p className="text-sm text-muted-foreground">out of 100</p>
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-medium">Recommended</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="fusion-card p-6 h-full">
                  <div className="flex items-start gap-3 mb-4">
                    <Info className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">AI Recommendation</h3>
                      <p className="text-muted-foreground text-sm">{score?.recommendation}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                    <div className="p-4 rounded-xl bg-muted/50">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm font-medium">Estimated Time</span>
                      </div>
                      <p className="text-lg font-semibold text-foreground">{score?.estimatedTime}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-muted/50">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <DollarSign className="w-4 h-4" />
                        <span className="text-sm font-medium">Estimated Cost</span>
                      </div>
                      <p className="text-lg font-semibold text-foreground">{score?.estimatedCost}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Score Breakdown Tabs */}
            <div className="fusion-card p-6">
              <h3 className="text-lg font-display font-semibold text-foreground mb-4">Score Breakdown</h3>
              <p className="text-sm text-muted-foreground mb-6">
                See how your idea scores across different dimensions and why.
              </p>

              {/* Tab Navigation */}
              <div className="flex gap-2 mb-6 border-b border-border pb-3 overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors flex-shrink-0 whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    <span className={`ml-1 px-2 py-0.5 rounded text-xs font-bold ${
                      activeTab === tab.id ? 'bg-white/20' : 'bg-background'
                    }`}>
                      {tab.score}
                    </span>
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {currentTabData && (
                <div className="space-y-4">
                  {currentTabData.breakdown.map((item, index) => (
                    <div key={index} className="p-4 rounded-xl bg-muted/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-foreground">{item.label}</span>
                        <span className={`font-bold ${getScoreColor(item.score * 10)}`}>
                          {item.score}/{item.maxScore}
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 mb-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${getProgressColor(item.score * 10)}`}
                          style={{ width: `${(item.score / item.maxScore) * 100}%` }}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">{item.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/ideas')}
                className="gap-2 w-full sm:w-auto justify-center sm:justify-start"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Ideas
              </Button>

              <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-2 sm:gap-3">
                <Button variant="outline" onClick={() => navigate('/ideas')} className="w-full sm:w-auto">
                  Save as Draft
                </Button>
                <Button
                  variant="hero"
                  onClick={() => navigate(`/ideas/${ideaId || '1'}/convert`)}
                  className="gap-2 w-full sm:w-auto"
                >
                  Convert to Project
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

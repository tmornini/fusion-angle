import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft,
  Target,
  BarChart3,
  TrendingUp,
  Shield,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  ChevronRight,
  Clock,
  DollarSign,
  User,
  Save
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

// Types
interface Outcome {
  id: string;
  description: string;
  metrics: Metric[];
}

interface Metric {
  id: string;
  name: string;
  target: string;
  unit: string;
}

interface Impact {
  shortTerm: string;
  midTerm: string;
  longTerm: string;
}

interface EdgeData {
  outcomes: Outcome[];
  impact: Impact;
  confidence: 'high' | 'medium' | 'low' | '';
  owner: string;
}

// Mock idea data
const mockIdea = {
  id: '1',
  title: 'AI-Powered Customer Segmentation',
  problem: 'Manual customer segmentation is time-consuming and often inaccurate, leading to misaligned marketing efforts.',
  solution: 'Implement ML-based customer clustering that automatically segments users based on behavior patterns.',
  submittedBy: 'Sarah Chen',
  score: 92,
  status: 'scored'
};

const outcomeTemplates = [
  'Reduce operational cost',
  'Increase customer retention',
  'Improve delivery speed',
  'Reduce errors or risk',
  'Increase revenue',
  'Improve customer satisfaction'
];

const confidenceConfig = {
  high: { label: 'High', className: 'bg-success-soft text-success border-success/30' },
  medium: { label: 'Medium', className: 'bg-warning-soft text-warning border-warning/30' },
  low: { label: 'Low', className: 'bg-error-soft text-error border-error/30' }
};

export default function Edge() {
  const navigate = useNavigate();
  const { ideaId } = useParams();
  const [isSaving, setIsSaving] = useState(false);
  
  const [edgeData, setEdgeData] = useState<EdgeData>({
    outcomes: [],
    impact: {
      shortTerm: '',
      midTerm: '',
      longTerm: ''
    },
    confidence: '',
    owner: ''
  });

  // Validation
  const hasOutcomes = edgeData.outcomes.length > 0;
  const allOutcomesHaveMetrics = edgeData.outcomes.every(o => o.metrics.length > 0);
  const hasImpact = edgeData.impact.shortTerm || edgeData.impact.midTerm || edgeData.impact.longTerm;
  const hasOwner = edgeData.owner.trim() !== '';
  const hasConfidence = edgeData.confidence !== '';
  
  const isValid = hasOutcomes && allOutcomesHaveMetrics && hasImpact && hasOwner;
  const completionPercent = [hasOutcomes, allOutcomesHaveMetrics, hasImpact, hasOwner, hasConfidence]
    .filter(Boolean).length * 20;

  // Add outcome
  const addOutcome = (description: string = '') => {
    const newOutcome: Outcome = {
      id: `outcome-${Date.now()}`,
      description,
      metrics: []
    };
    setEdgeData(prev => ({
      ...prev,
      outcomes: [...prev.outcomes, newOutcome]
    }));
  };

  // Remove outcome
  const removeOutcome = (outcomeId: string) => {
    setEdgeData(prev => ({
      ...prev,
      outcomes: prev.outcomes.filter(o => o.id !== outcomeId)
    }));
  };

  // Update outcome description
  const updateOutcome = (outcomeId: string, description: string) => {
    setEdgeData(prev => ({
      ...prev,
      outcomes: prev.outcomes.map(o => 
        o.id === outcomeId ? { ...o, description } : o
      )
    }));
  };

  // Add metric to outcome
  const addMetric = (outcomeId: string) => {
    const newMetric: Metric = {
      id: `metric-${Date.now()}`,
      name: '',
      target: '',
      unit: ''
    };
    setEdgeData(prev => ({
      ...prev,
      outcomes: prev.outcomes.map(o =>
        o.id === outcomeId ? { ...o, metrics: [...o.metrics, newMetric] } : o
      )
    }));
  };

  // Update metric
  const updateMetric = (outcomeId: string, metricId: string, field: keyof Metric, value: string) => {
    setEdgeData(prev => ({
      ...prev,
      outcomes: prev.outcomes.map(o =>
        o.id === outcomeId ? {
          ...o,
          metrics: o.metrics.map(m =>
            m.id === metricId ? { ...m, [field]: value } : m
          )
        } : o
      )
    }));
  };

  // Remove metric
  const removeMetric = (outcomeId: string, metricId: string) => {
    setEdgeData(prev => ({
      ...prev,
      outcomes: prev.outcomes.map(o =>
        o.id === outcomeId ? {
          ...o,
          metrics: o.metrics.filter(m => m.id !== metricId)
        } : o
      )
    }));
  };

  // Update impact
  const updateImpact = (field: keyof Impact, value: string) => {
    setEdgeData(prev => ({
      ...prev,
      impact: { ...prev.impact, [field]: value }
    }));
  };

  // Save Edge data
  const handleSave = async () => {
    if (!isValid) {
      toast.error('Please complete all required fields');
      return;
    }
    
    setIsSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSaving(false);
    toast.success('Edge data saved successfully');
    navigate(`/review/${ideaId}`);
  };

  // Get status indicator
  const getStatusIndicator = () => {
    if (isValid) return { color: 'bg-success', label: 'Complete' };
    if (completionPercent > 0) return { color: 'bg-warning', label: 'In Progress' };
    return { color: 'bg-error', label: 'Incomplete' };
  };

  const status = getStatusIndicator();

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate('/ideas')}
            className="shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-3">
                <Target className="w-4 h-4" />
                Business Case Definition
              </div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">Edge</h1>
                <Badge variant="outline" className={`${status.color === 'bg-success' ? 'bg-success-soft text-success' : status.color === 'bg-warning' ? 'bg-warning-soft text-warning' : 'bg-error-soft text-error'}`}>
                  {status.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">Define outcomes, metrics, and expected impact</p>
            </div>
        </div>
        <Button 
          variant="hero" 
          onClick={handleSave}
          disabled={!isValid || isSaving}
          className="gap-2"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save & Continue'}
        </Button>
      </div>

      {/* Progress Bar */}
      <div className="fusion-card p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Completion</span>
          <span className="text-sm text-muted-foreground">{completionPercent}%</span>
        </div>
        <Progress value={completionPercent} className="h-2" />
        <div className="flex flex-wrap gap-3 mt-3">
          <div className="flex items-center gap-1.5 text-xs">
            {hasOutcomes ? <Check className="w-3.5 h-3.5 text-success" /> : <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className={hasOutcomes ? 'text-success' : 'text-muted-foreground'}>Outcomes</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {allOutcomesHaveMetrics && hasOutcomes ? <Check className="w-3.5 h-3.5 text-success" /> : <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className={allOutcomesHaveMetrics && hasOutcomes ? 'text-success' : 'text-muted-foreground'}>Metrics</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {hasImpact ? <Check className="w-3.5 h-3.5 text-success" /> : <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className={hasImpact ? 'text-success' : 'text-muted-foreground'}>Impact</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {hasOwner ? <Check className="w-3.5 h-3.5 text-success" /> : <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className={hasOwner ? 'text-success' : 'text-muted-foreground'}>Owner</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Idea Summary */}
        <div className="lg:col-span-1">
          <div className="fusion-card p-5 lg:sticky lg:top-6">
            <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Linked Idea
            </h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-foreground mb-1">{mockIdea.title}</h4>
                <p className="text-xs text-muted-foreground">Score: {mockIdea.score}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Problem</p>
                <p className="text-sm text-foreground">{mockIdea.problem}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Solution</p>
                <p className="text-sm text-foreground">{mockIdea.solution}</p>
              </div>
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-1">Submitted by</p>
                <p className="text-sm text-foreground">{mockIdea.submittedBy}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Edge Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Outcomes Section */}
          <div className="fusion-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Business Outcomes
              </h3>
              <Button variant="outline" size="sm" onClick={() => addOutcome()} className="gap-1.5">
                <Plus className="w-4 h-4" />
                Add Outcome
              </Button>
            </div>

            {edgeData.outcomes.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border rounded-lg">
                <Target className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-4">No outcomes defined yet</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {outcomeTemplates.slice(0, 3).map((template) => (
                    <Button 
                      key={template} 
                      variant="outline" 
                      size="sm"
                      onClick={() => addOutcome(template)}
                      className="text-xs"
                    >
                      {template}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {edgeData.outcomes.map((outcome, index) => (
                  <div key={outcome.id} className="p-4 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <Input 
                          value={outcome.description}
                          onChange={(e) => updateOutcome(outcome.id, e.target.value)}
                          placeholder="Describe the business outcome..."
                          className="mb-2"
                        />
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => removeOutcome(outcome.id)}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* Metrics for this outcome */}
                    <div className="pl-9 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Success Metrics</span>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => addMetric(outcome.id)}
                          className="gap-1 h-7 text-xs"
                        >
                          <Plus className="w-3 h-3" />
                          Add Metric
                        </Button>
                      </div>
                      
                      {outcome.metrics.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Add at least one metric to measure this outcome</p>
                      ) : (
                        <div className="space-y-2">
                          {outcome.metrics.map((metric) => (
                            <div key={metric.id} className="p-2 rounded bg-background border border-border">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <Input 
                                  value={metric.name}
                                  onChange={(e) => updateMetric(outcome.id, metric.id, 'name', e.target.value)}
                                  placeholder="Metric name"
                                  className="h-8 text-sm w-full sm:flex-1"
                                />
                                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                  <Input 
                                    value={metric.target}
                                    onChange={(e) => updateMetric(outcome.id, metric.id, 'target', e.target.value)}
                                    placeholder="Target"
                                    className="h-8 text-sm w-full sm:w-24"
                                  />
                                  <Input 
                                    value={metric.unit}
                                    onChange={(e) => updateMetric(outcome.id, metric.id, 'unit', e.target.value)}
                                    placeholder="Unit"
                                    className="h-8 text-sm w-full sm:w-20"
                                  />
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => removeMetric(outcome.id, metric.id)}
                                    className="h-8 w-full sm:w-8 text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Impact Section */}
          <div className="fusion-card p-5">
            <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Expected Impact
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Short-term (0-3 months)
                </Label>
                <Textarea 
                  value={edgeData.impact.shortTerm}
                  onChange={(e) => updateImpact('shortTerm', e.target.value)}
                  placeholder="Expected impact in the first 3 months..."
                  className="min-h-[100px] text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Mid-term (3-12 months)
                </Label>
                <Textarea 
                  value={edgeData.impact.midTerm}
                  onChange={(e) => updateImpact('midTerm', e.target.value)}
                  placeholder="Expected impact over 3-12 months..."
                  className="min-h-[100px] text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Long-term (12+ months)
                </Label>
                <Textarea 
                  value={edgeData.impact.longTerm}
                  onChange={(e) => updateImpact('longTerm', e.target.value)}
                  placeholder="Expected impact after 12 months..."
                  className="min-h-[100px] text-sm"
                />
              </div>
            </div>
          </div>

          {/* Confidence & Owner */}
          <div className="fusion-card p-5">
            <h3 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Confidence & Ownership
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Confidence Level</Label>
                <Select 
                  value={edgeData.confidence} 
                  onValueChange={(value: 'high' | 'medium' | 'low') => setEdgeData(prev => ({ ...prev, confidence: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select confidence level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-success" />
                        High - Strong evidence and clear path
                      </div>
                    </SelectItem>
                    <SelectItem value="medium">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-warning" />
                        Medium - Some uncertainty exists
                      </div>
                    </SelectItem>
                    <SelectItem value="low">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-error" />
                        Low - Significant unknowns
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  Edge Owner
                </Label>
                <Input 
                  value={edgeData.owner}
                  onChange={(e) => setEdgeData(prev => ({ ...prev, owner: e.target.value }))}
                  placeholder="Who owns this Edge definition?"
                />
              </div>
            </div>
          </div>

          {/* Validation Summary */}
          {!isValid && (
            <div className="fusion-card p-4 border-warning/30 bg-warning-soft">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-warning mb-1">Complete all required fields to proceed</p>
                  <ul className="text-sm text-warning/80 space-y-1">
                    {!hasOutcomes && <li>• Add at least one business outcome</li>}
                    {hasOutcomes && !allOutcomesHaveMetrics && <li>• Add at least one metric to each outcome</li>}
                    {!hasImpact && <li>• Describe expected impact (at least one timeframe)</li>}
                    {!hasOwner && <li>• Assign an owner</li>}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

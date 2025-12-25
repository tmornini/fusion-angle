import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sparkles, 
  ArrowLeft,
  ArrowRight,
  Lightbulb,
  Target,
  AlertCircle,
  TrendingUp,
  Wand2,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface IdeaFormData {
  title: string;
  problemStatement: string;
  proposedSolution: string;
  expectedOutcome: string;
  targetUsers: string;
  successMetrics: string;
}

const steps = [
  { 
    id: 1, 
    title: 'The Problem', 
    icon: AlertCircle,
    description: 'What challenge are you trying to solve?'
  },
  { 
    id: 2, 
    title: 'The Solution', 
    icon: Lightbulb,
    description: 'How will you address this problem?'
  },
  { 
    id: 3, 
    title: 'The Impact', 
    icon: TrendingUp,
    description: 'What value will this create?'
  },
];

export default function IdeaCreate() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<IdeaFormData>({
    title: '',
    problemStatement: '',
    proposedSolution: '',
    expectedOutcome: '',
    targetUsers: '',
    successMetrics: '',
  });

  const updateField = (field: keyof IdeaFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.title.trim() && formData.problemStatement.trim();
      case 2:
        return formData.proposedSolution.trim();
      case 3:
        return formData.expectedOutcome.trim();
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    } else {
      // Submit and go to scoring
      console.log('Submitting idea:', formData);
      navigate('/ideas/new/score');
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate('/ideas');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg gradient-hero flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-display font-bold text-foreground">New Idea</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="gap-2 text-primary">
              <Wand2 className="w-4 h-4" />
              <span className="hidden sm:inline">Generate with AI</span>
              <span className="sm:hidden">AI</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-6 sm:gap-0 sm:justify-between mb-8 sm:mb-12 overflow-x-auto pb-2">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-shrink-0 sm:flex-1">
              <div className="flex flex-col items-center">
                <div 
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-colors ${
                    currentStep > step.id 
                      ? 'bg-green-500 text-white'
                      : currentStep === step.id 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {currentStep > step.id ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <step.icon className="w-5 h-5" />
                  )}
                </div>
                <span className={`mt-2 text-xs sm:text-sm font-medium whitespace-nowrap ${
                  currentStep >= step.id ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  {step.title}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className="hidden sm:block flex-1 h-1 mx-4 rounded-full transition-colors">
                  <div className={`h-1 rounded-full transition-colors ${
                    currentStep > step.id ? 'bg-green-500' : 'bg-muted'
                  }`} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="fusion-card p-4 sm:p-8 animate-fade-in">
            <div className="mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground mb-2">
                {steps[currentStep - 1].title}
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                {steps[currentStep - 1].description}
              </p>
            </div>

          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title" className="text-foreground font-medium">
                  Give your idea a clear title
                </Label>
                <Input
                  id="title"
                  placeholder="e.g., AI-Powered Customer Segmentation"
                  value={formData.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  className="text-base sm:text-lg py-4 sm:py-6"
                />
                <p className="text-xs text-muted-foreground">
                  Keep it short and descriptive – think of what you would search for
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="problem" className="text-foreground font-medium">
                  What problem does this solve?
                </Label>
                <Textarea
                  id="problem"
                  placeholder="Describe the current pain point or challenge. Who experiences it? How often? What is the cost of not solving it?"
                  value={formData.problemStatement}
                  onChange={(e) => updateField('problemStatement', e.target.value)}
                  className="min-h-[140px] resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Focus on the impact – why does this matter to the business?
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetUsers" className="text-foreground font-medium">
                  Who will benefit from this? <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="targetUsers"
                  placeholder="e.g., Sales team, customers, operations managers"
                  value={formData.targetUsers}
                  onChange={(e) => updateField('targetUsers', e.target.value)}
                />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="solution" className="text-foreground font-medium">
                  How would you solve this?
                </Label>
                <Textarea
                  id="solution"
                  placeholder="Describe your proposed approach. What would change? What technology or process would you use?"
                  value={formData.proposedSolution}
                  onChange={(e) => updateField('proposedSolution', e.target.value)}
                  className="min-h-[180px] resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  You do not need all the answers – outline your best thinking
                </p>
              </div>

              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                <div className="flex items-start gap-3">
                  <Target className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">Tip: Think scope</p>
                    <p className="text-sm text-muted-foreground">
                      What is the smallest version of this idea that could prove value? Starting small often leads to faster wins.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="outcome" className="text-foreground font-medium">
                  What outcome do you expect?
                </Label>
                <Textarea
                  id="outcome"
                  placeholder="If this works, what changes? Be specific: revenue impact, time saved, errors reduced, satisfaction improved..."
                  value={formData.expectedOutcome}
                  onChange={(e) => updateField('expectedOutcome', e.target.value)}
                  className="min-h-[140px] resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Think about what success looks like in 6-12 months
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="metrics" className="text-foreground font-medium">
                  How would you measure success? <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="metrics"
                  placeholder="e.g., 20% reduction in processing time, 15% increase in conversion rate, NPS improvement of 10 points"
                  value={formData.successMetrics}
                  onChange={(e) => updateField('successMetrics', e.target.value)}
                  className="min-h-[100px] resize-none"
                />
              </div>

              <div className="p-4 rounded-xl bg-green-50 border border-green-100">
                <div className="flex items-start gap-3">
                  <TrendingUp className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">Next: AI Scoring</p>
                    <p className="text-sm text-muted-foreground">
                      After submitting, our AI will estimate impact, time, and cost based on your inputs.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-8 sm:mt-10 pt-6 border-t border-border">
            <Button
              variant="ghost"
              onClick={handleBack}
              className="gap-2 w-full sm:w-auto justify-center sm:justify-start"
            >
              <ArrowLeft className="w-4 h-4" />
              {currentStep === 1 ? 'Cancel' : 'Back'}
            </Button>

            <div className="flex items-center justify-center gap-2">
              <span className="text-sm text-muted-foreground">
                Step {currentStep} of {steps.length}
              </span>
            </div>

            <Button
              variant="hero"
              onClick={handleNext}
              disabled={!canProceed()}
              className="gap-2 w-full sm:w-auto"
            >
              {currentStep === 3 ? (
                <>
                  Score Idea
                  <TrendingUp className="w-4 h-4" />
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

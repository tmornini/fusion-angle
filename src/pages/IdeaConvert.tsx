import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft,
  ArrowRight,
  Rocket,
  Calendar,
  Users,
  Target,
  DollarSign,
  Clock,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderKanban
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Mock idea data - would come from previous scoring step
const mockIdea = {
  id: '1',
  title: 'AI-Powered Customer Segmentation',
  problemStatement: 'Marketing team spends 20+ hours weekly manually segmenting customers, leading to delayed campaigns and missed opportunities.',
  proposedSolution: 'Implement machine learning model to automatically segment customers based on behavior, purchase history, and engagement patterns.',
  expectedOutcome: 'Reduce segmentation time by 80%, enable real-time personalization, and increase campaign conversion rates by 25%.',
  score: 82,
  estimatedTime: '6-8 weeks',
  estimatedCost: '$45,000 - $65,000',
};

interface ProjectDetails {
  projectName: string;
  projectLead: string;
  startDate: string;
  targetEndDate: string;
  budget: string;
  priority: string;
  team: string[];
  firstMilestone: string;
  successCriteria: string;
}

export default function IdeaConvert() {
  const navigate = useNavigate();
  const { ideaId } = useParams();
  const [isConverting, setIsConverting] = useState(false);
  const [projectDetails, setProjectDetails] = useState<ProjectDetails>({
    projectName: mockIdea.title,
    projectLead: '',
    startDate: '',
    targetEndDate: '',
    budget: '',
    priority: '',
    team: [],
    firstMilestone: '',
    successCriteria: '',
  });

  const updateField = (field: keyof ProjectDetails, value: string | string[]) => {
    setProjectDetails(prev => ({ ...prev, [field]: value }));
  };

  const requiredFields = ['projectName', 'projectLead', 'startDate', 'targetEndDate', 'budget', 'priority'];
  const completedFields = requiredFields.filter(field => 
    projectDetails[field as keyof ProjectDetails] && 
    String(projectDetails[field as keyof ProjectDetails]).trim() !== ''
  );
  const completionPercent = (completedFields.length / requiredFields.length) * 100;

  const canConvert = completedFields.length === requiredFields.length;

  const handleConvert = async () => {
    if (!canConvert) return;
    
    setIsConverting(true);
    // Simulate conversion process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Navigate to projects or show success
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(`/ideas/${ideaId || '1'}/score`)}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg gradient-hero flex items-center justify-center">
                  <Rocket className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-display font-bold text-foreground">Convert to Project</span>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{completedFields.length}/{requiredFields.length} required fields</span>
              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left Side - Idea Summary */}
          <div className="lg:col-span-2 space-y-4">
            <div className="fusion-card p-6 lg:sticky lg:top-24">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-4">
                <FolderKanban className="w-4 h-4" />
                Idea Summary
              </div>

              <h2 className="text-xl font-display font-bold text-foreground mb-4">
                {mockIdea.title}
              </h2>

              <div className="space-y-4 mb-6">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Problem</h4>
                  <p className="text-sm text-foreground">{mockIdea.problemStatement}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Solution</h4>
                  <p className="text-sm text-foreground">{mockIdea.proposedSolution}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Expected Outcome</h4>
                  <p className="text-sm text-foreground">{mockIdea.expectedOutcome}</p>
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-sm">Priority Score</span>
                  </div>
                  <span className="font-bold text-green-600">{mockIdea.score}/100</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">Est. Time</span>
                  </div>
                  <span className="font-medium text-foreground">{mockIdea.estimatedTime}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-sm">Est. Cost</span>
                  </div>
                  <span className="font-medium text-foreground">{mockIdea.estimatedCost}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Required Inputs */}
          <div className="lg:col-span-3 space-y-6">
            <div className="fusion-card p-6">
              <div className="flex items-center gap-2 mb-6">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <span className="font-medium text-foreground">Complete these details to create a project</span>
              </div>

              <div className="space-y-6">
                {/* Project Name */}
                <div className="space-y-2">
                  <Label htmlFor="projectName" className="text-foreground font-medium flex items-center gap-2">
                    Project Name
                    {projectDetails.projectName && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  </Label>
                  <Input
                    id="projectName"
                    placeholder="Give your project a clear name"
                    value={projectDetails.projectName}
                    onChange={(e) => updateField('projectName', e.target.value)}
                  />
                </div>

                {/* Project Lead */}
                <div className="space-y-2">
                  <Label htmlFor="projectLead" className="text-foreground font-medium flex items-center gap-2">
                    Project Lead
                    {projectDetails.projectLead && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  </Label>
                  <Select 
                    value={projectDetails.projectLead} 
                    onValueChange={(value) => updateField('projectLead', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Who will own this project?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sarah">Sarah Chen - Product Manager</SelectItem>
                      <SelectItem value="mike">Mike Thompson - Engineering Lead</SelectItem>
                      <SelectItem value="jessica">Jessica Park - Data Science Lead</SelectItem>
                      <SelectItem value="david">David Martinez - Marketing Director</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate" className="text-foreground font-medium flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      Start Date
                      {projectDetails.startDate && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                    </Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={projectDetails.startDate}
                      onChange={(e) => updateField('startDate', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="targetEndDate" className="text-foreground font-medium flex items-center gap-2">
                      <Target className="w-4 h-4 text-muted-foreground" />
                      Target End Date
                      {projectDetails.targetEndDate && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                    </Label>
                    <Input
                      id="targetEndDate"
                      type="date"
                      value={projectDetails.targetEndDate}
                      onChange={(e) => updateField('targetEndDate', e.target.value)}
                    />
                  </div>
                </div>

                {/* Budget */}
                <div className="space-y-2">
                  <Label htmlFor="budget" className="text-foreground font-medium flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    Allocated Budget
                    {projectDetails.budget && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  </Label>
                  <Select 
                    value={projectDetails.budget} 
                    onValueChange={(value) => updateField('budget', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select budget range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0-25k">Under $25,000</SelectItem>
                      <SelectItem value="25-50k">$25,000 - $50,000</SelectItem>
                      <SelectItem value="50-100k">$50,000 - $100,000</SelectItem>
                      <SelectItem value="100-250k">$100,000 - $250,000</SelectItem>
                      <SelectItem value="250k+">$250,000+</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    AI estimate: {mockIdea.estimatedCost}
                  </p>
                </div>

                {/* Priority */}
                <div className="space-y-2">
                  <Label htmlFor="priority" className="text-foreground font-medium flex items-center gap-2">
                    Priority Level
                    {projectDetails.priority && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  </Label>
                  <Select 
                    value={projectDetails.priority} 
                    onValueChange={(value) => updateField('priority', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="How urgent is this project?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical - Must start immediately</SelectItem>
                      <SelectItem value="high">High - Start within 2 weeks</SelectItem>
                      <SelectItem value="medium">Medium - Start within 1 month</SelectItem>
                      <SelectItem value="low">Low - Can wait for capacity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Optional Fields */}
            <div className="fusion-card p-6">
              <div className="flex items-center gap-2 mb-6">
                <Users className="w-5 h-5 text-primary" />
                <span className="font-medium text-foreground">Additional Details</span>
                <span className="text-xs text-muted-foreground">(Optional)</span>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="firstMilestone" className="text-foreground font-medium">
                    First Milestone
                  </Label>
                  <Input
                    id="firstMilestone"
                    placeholder="e.g., Complete data pipeline setup"
                    value={projectDetails.firstMilestone}
                    onChange={(e) => updateField('firstMilestone', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    What is the first measurable goal for this project?
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="successCriteria" className="text-foreground font-medium">
                    Success Criteria
                  </Label>
                  <Textarea
                    id="successCriteria"
                    placeholder="How will you know when this project is complete and successful?"
                    value={projectDetails.successCriteria}
                    onChange={(e) => updateField('successCriteria', e.target.value)}
                    className="min-h-[100px] resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Confirmation */}
            <div className={`fusion-card p-6 border-2 transition-colors ${canConvert ? 'border-green-200 bg-green-50/50' : 'border-transparent'}`}>
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${canConvert ? 'bg-green-500' : 'bg-muted'}`}>
                  <Rocket className={`w-6 h-6 ${canConvert ? 'text-white' : 'text-muted-foreground'}`} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">
                    {canConvert ? 'Ready to Create Project' : 'Complete Required Fields'}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {canConvert 
                      ? 'All required information has been provided. Click below to officially create this project.'
                      : `${requiredFields.length - completedFields.length} required field${requiredFields.length - completedFields.length > 1 ? 's' : ''} remaining`
                    }
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      variant="ghost"
                      onClick={() => navigate(`/ideas/${ideaId || '1'}/score`)}
                      className="w-full sm:w-auto"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back to Scoring
                    </Button>
                    <Button
                      variant="hero"
                      onClick={handleConvert}
                      disabled={!canConvert || isConverting}
                      className="gap-2 w-full sm:w-auto"
                    >
                      {isConverting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Creating Project...
                        </>
                      ) : (
                        <>
                          Create Project
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

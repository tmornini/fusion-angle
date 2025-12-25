import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft,
  Lightbulb,
  Target,
  Users,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Send,
  FileText,
  Clock,
  DollarSign,
  User,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { toast } from 'sonner';

interface Clarification {
  id: string;
  question: string;
  askedBy: string;
  askedAt: string;
  status: 'pending' | 'answered';
  answer?: string;
  answeredBy?: string;
  answeredAt?: string;
}

const mockProject = {
  id: '1',
  title: 'AI-Powered Customer Segmentation',
  description: 'Implement machine learning model to automatically segment customers based on behavior, purchase history, and engagement patterns.',
  businessContext: {
    problem: 'Current manual segmentation takes 2 weeks and is often outdated by the time it\'s complete. Marketing campaigns suffer from poor targeting.',
    expectedOutcome: 'Real-time customer segments that update automatically, enabling personalized marketing with 40% better conversion rates.',
    successMetrics: [
      'Reduce segmentation time from 2 weeks to real-time',
      'Improve campaign conversion rates by 40%',
      'Increase customer lifetime value by 25%'
    ],
    constraints: [
      'Must integrate with existing CRM (Salesforce)',
      'GDPR compliance required for EU customers',
      'Budget capped at $50,000 for Phase 1'
    ]
  },
  team: [
    { id: '1', name: 'Sarah Chen', role: 'Project Lead', type: 'business' },
    { id: '2', name: 'Mike Thompson', role: 'ML Engineer', type: 'engineering' },
    { id: '3', name: 'Jessica Park', role: 'Data Scientist', type: 'engineering' },
    { id: '4', name: 'David Martinez', role: 'Backend Developer', type: 'engineering' },
  ],
  linkedIdea: {
    id: '1',
    title: 'AI-Powered Customer Segmentation',
    score: 92
  },
  timeline: '3-4 months',
  budget: '$45,000'
};

const mockClarifications: Clarification[] = [
  {
    id: '1',
    question: 'What data sources are currently available for customer behavior tracking? We need to understand the data pipeline before designing the ML model.',
    askedBy: 'Mike Thompson',
    askedAt: '2024-02-20',
    status: 'answered',
    answer: 'We have event tracking via Segment, transaction data in our data warehouse (Snowflake), and email engagement metrics from Mailchimp. All can be accessed via APIs.',
    answeredBy: 'Sarah Chen',
    answeredAt: '2024-02-21'
  },
  {
    id: '2',
    question: 'Are there any existing segment definitions we should match, or are we free to discover optimal segments through clustering?',
    askedBy: 'Jessica Park',
    askedAt: '2024-02-22',
    status: 'answered',
    answer: 'Marketing has 5 legacy segments they use today (High Value, Growth, At-Risk, New, Dormant). We\'d like to preserve compatibility but welcome additional discovered segments.',
    answeredBy: 'Sarah Chen',
    answeredAt: '2024-02-22'
  },
  {
    id: '3',
    question: 'What\'s the expected latency requirement for segment updates? Real-time vs batch processing has significant architecture implications.',
    askedBy: 'David Martinez',
    askedAt: '2024-02-25',
    status: 'pending'
  }
];

export default function EngineeringRequirements() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [clarifications, setClarifications] = useState<Clarification[]>(mockClarifications);
  const [newQuestion, setNewQuestion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitQuestion = () => {
    if (!newQuestion.trim()) return;
    
    setIsSubmitting(true);
    
    // Simulate API call
    setTimeout(() => {
      const newClarification: Clarification = {
        id: Date.now().toString(),
        question: newQuestion,
        askedBy: 'You (Engineer)',
        askedAt: new Date().toISOString().split('T')[0],
        status: 'pending'
      };
      
      setClarifications(prev => [newClarification, ...prev]);
      setNewQuestion('');
      setIsSubmitting(false);
      
      toast.success('Question sent to business team', {
        description: 'They\'ll be notified and can respond in the project discussion.'
      });
    }, 500);
  };

  const pendingCount = clarifications.filter(c => c.status === 'pending').length;
  const answeredCount = clarifications.filter(c => c.status === 'answered').length;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <Breadcrumbs items={[
          { label: 'Projects', href: '/projects' },
          { label: mockProject.title, href: `/projects/${projectId}` },
          { label: 'Engineering Requirements' }
        ]} />

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground mb-2">
              Engineering Requirements
            </h1>
            <p className="text-muted-foreground">
              Business context and clarifications for {mockProject.title}
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate(`/projects/${projectId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Project
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{mockProject.timeline}</p>
                  <p className="text-xs text-muted-foreground">Timeline</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{mockProject.budget}</p>
                  <p className="text-xs text-muted-foreground">Budget</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <MessageSquare className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pending Questions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{answeredCount}</p>
                  <p className="text-xs text-muted-foreground">Answered</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Business Context */}
        <Card className="bg-card border-border mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lightbulb className="h-5 w-5 text-primary" />
              Business Context
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Problem Statement</h4>
              <p className="text-muted-foreground">{mockProject.businessContext.problem}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Expected Outcome</h4>
              <p className="text-muted-foreground">{mockProject.businessContext.expectedOutcome}</p>
            </div>
          </CardContent>
        </Card>

        {/* Success Metrics */}
        <Card className="bg-card border-border mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-emerald-600" />
              Success Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {mockProject.businessContext.successMetrics.map((metric, index) => (
                <li key={index} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span className="text-foreground">{metric}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Constraints */}
        <Card className="bg-card border-border mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Constraints & Requirements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {mockProject.businessContext.constraints.map((constraint, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-amber-600 mt-0.5">•</span>
                  <span className="text-foreground">{constraint}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Team Contacts */}
        <Card className="bg-card border-border mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-primary" />
              Team Contacts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {mockProject.team.map((member) => (
                <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    member.type === 'business' ? 'bg-primary/10' : 'bg-emerald-500/10'
                  }`}>
                    <User className={`w-5 h-5 ${
                      member.type === 'business' ? 'text-primary' : 'text-emerald-600'
                    }`} />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.role}</p>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={`ml-auto text-xs ${
                      member.type === 'business' 
                        ? 'bg-primary/10 text-primary border-primary/20' 
                        : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                    }`}
                  >
                    {member.type}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Linked Idea */}
        <Card className="bg-card border-border mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" />
              Source Idea
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link 
              to={`/ideas/${mockProject.linkedIdea.id}/score`}
              className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Lightbulb className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                    {mockProject.linkedIdea.title}
                  </p>
                  <p className="text-xs text-muted-foreground">View original idea and scoring</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="bg-emerald-500/10 text-emerald-600 border-0">
                  Score: {mockProject.linkedIdea.score}
                </Badge>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </Link>
          </CardContent>
        </Card>

        {/* Clarifications Section */}
        <div className="mb-8">
          <h2 className="text-xl font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Clarifications
          </h2>
          
          {/* Ask a Question */}
          <Card className="bg-card border-border mb-4">
            <CardContent className="p-4">
              <Textarea
                placeholder="Ask a clarifying question to the business team..."
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                className="min-h-[80px] resize-none mb-3"
              />
              <div className="flex justify-end">
                <Button 
                  onClick={handleSubmitQuestion}
                  disabled={!newQuestion.trim() || isSubmitting}
                >
                  <Send className="w-4 h-4 mr-2" />
                  {isSubmitting ? 'Sending...' : 'Send Question'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Clarification Thread */}
          <div className="space-y-4">
            {clarifications.map((clarification) => (
              <Card key={clarification.id} className={`border ${
                clarification.status === 'pending' 
                  ? 'border-amber-500/30 bg-amber-500/5' 
                  : 'border-border bg-card'
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`p-2 rounded-full ${
                      clarification.status === 'pending' ? 'bg-amber-500/10' : 'bg-muted'
                    }`}>
                      <MessageSquare className={`w-4 h-4 ${
                        clarification.status === 'pending' ? 'text-amber-600' : 'text-muted-foreground'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground">{clarification.askedBy}</span>
                        <span className="text-xs text-muted-foreground">{clarification.askedAt}</span>
                        <Badge 
                          variant="outline" 
                          className={clarification.status === 'pending' 
                            ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' 
                            : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                          }
                        >
                          {clarification.status === 'pending' ? 'Awaiting response' : 'Answered'}
                        </Badge>
                      </div>
                      <p className="text-foreground">{clarification.question}</p>
                    </div>
                  </div>

                  {clarification.answer && (
                    <div className="ml-10 mt-4 p-3 rounded-lg bg-muted/50 border-l-2 border-primary">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground">{clarification.answeredBy}</span>
                        <span className="text-xs text-muted-foreground">{clarification.answeredAt}</span>
                      </div>
                      <p className="text-foreground">{clarification.answer}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border">
          <div className="text-sm text-muted-foreground">
            {pendingCount > 0 
              ? `${pendingCount} question(s) awaiting business response` 
              : 'All questions have been answered'
            }
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate(`/projects/${projectId}`)}>
              Back to Project
            </Button>
            <Button onClick={() => {
              toast.success('Requirements marked as complete', {
                description: 'Project status has been updated.'
              });
              navigate(`/projects/${projectId}`);
            }}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Mark Requirements Complete
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

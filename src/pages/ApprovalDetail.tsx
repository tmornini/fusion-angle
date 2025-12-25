import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  AlertTriangle, 
  TrendingUp, 
  Clock, 
  User,
  Calendar,
  Target,
  Lightbulb,
  CheckCircle,
  XCircle,
  MessageSquare,
  FileText,
  DollarSign,
  Users,
  Shield,
  BarChart3,
  Gauge
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

interface IdeaDetail {
  id: string;
  title: string;
  description: string;
  submittedBy: string;
  submittedAt: string;
  priority: "high" | "medium" | "low";
  score: number;
  category: string;
  impact: {
    level: string;
    description: string;
  };
  effort: {
    level: string;
    timeEstimate: string;
    teamSize: string;
  };
  cost: {
    estimate: string;
    breakdown: string;
  };
  risks: Array<{
    title: string;
    severity: "high" | "medium" | "low";
    mitigation: string;
  }>;
  assumptions: string[];
  alignments: string[];
  attachments: number;
  comments: number;
}

const mockIdea: IdeaDetail = {
  id: "1",
  title: "AI-Powered Customer Support Chatbot",
  description: "Implement an intelligent chatbot using GPT-4 to handle tier-1 customer support inquiries. The system would integrate with our existing helpdesk platform and learn from historical ticket data to provide accurate, context-aware responses.",
  submittedBy: "Sarah Chen",
  submittedAt: "January 15, 2024",
  priority: "high",
  score: 87,
  category: "Customer Experience",
  impact: {
    level: "High",
    description: "Expected to reduce support ticket volume by 40% and improve first-response time from 4 hours to under 1 minute for common inquiries."
  },
  effort: {
    level: "Medium",
    timeEstimate: "3-4 months",
    teamSize: "4-5 engineers"
  },
  cost: {
    estimate: "$120,000 - $150,000",
    breakdown: "Development: $80K, API costs: $20K/year, Training: $10K"
  },
  risks: [
    {
      title: "AI response accuracy",
      severity: "high",
      mitigation: "Implement human escalation for low-confidence responses and continuous training loop"
    },
    {
      title: "Integration complexity",
      severity: "medium",
      mitigation: "Phase rollout starting with FAQ-only queries before expanding scope"
    },
    {
      title: "Customer acceptance",
      severity: "low",
      mitigation: "Clear bot identification and easy handoff to human agents"
    }
  ],
  assumptions: [
    "Current helpdesk API supports required integrations",
    "Historical ticket data is clean and categorizable",
    "Legal has approved AI usage for customer interactions"
  ],
  alignments: [
    "Q1 OKR: Improve customer satisfaction score by 15%",
    "Digital transformation initiative",
    "Cost optimization program"
  ],
  attachments: 3,
  comments: 7
};

// Edge data for the idea
const mockEdge = {
  outcomes: [
    {
      id: '1',
      description: 'Reduce support ticket volume',
      metrics: [
        { id: '1', name: 'Ticket Reduction', target: '40', unit: '%' },
        { id: '2', name: 'First Response Time', target: '1', unit: 'min' },
      ]
    },
    {
      id: '2',
      description: 'Improve customer satisfaction',
      metrics: [
        { id: '3', name: 'CSAT Score', target: '4.5', unit: '/5' },
        { id: '4', name: 'Resolution Rate', target: '85', unit: '%' },
      ]
    }
  ],
  impact: {
    shortTerm: 'Handle 60% of tier-1 inquiries automatically. Reduce agent workload significantly.',
    midTerm: '40% reduction in support costs. Improved 24/7 availability for customers.',
    longTerm: 'Full self-service capability for common issues. Agents focus on complex cases only.'
  },
  confidence: 'high' as const,
  owner: 'Sarah Chen'
};

const confidenceConfig = {
  high: { label: 'High Confidence', className: 'bg-success-soft text-success' },
  medium: { label: 'Medium Confidence', className: 'bg-warning-soft text-warning' },
  low: { label: 'Low Confidence', className: 'bg-error-soft text-error' }
};

const severityConfig = {
  high: { className: "bg-destructive/10 text-destructive border-destructive/20" },
  medium: { className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  low: { className: "bg-muted text-muted-foreground border-border" }
};

export default function ApprovalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showClarificationDialog, setShowClarificationDialog] = useState(false);
  const [feedback, setFeedback] = useState("");

  const handleApprove = () => {
    toast.success("Idea approved successfully", {
      description: "The submitter has been notified and the idea is moving to project planning."
    });
    navigate("/review");
  };

  const handleReject = () => {
    toast.info("Idea sent back for revision", {
      description: "The submitter has been notified with your feedback."
    });
    setShowRejectDialog(false);
    navigate("/review");
  };

  const handleRequestClarification = () => {
    toast.info("Clarification requested", {
      description: "The submitter has been notified to provide additional information."
    });
    setShowClarificationDialog(false);
  };

  const idea = mockIdea;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <Button variant="ghost" size="icon" asChild className="flex-shrink-0">
                <Link to="/review">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground">Reviewing Idea</p>
                <h1 className="text-sm sm:text-lg font-bold text-foreground truncate">{idea.title}</h1>
              </div>
            </div>
            <Badge 
              variant="outline" 
              className="bg-destructive/10 text-destructive border-destructive/20 text-xs flex-shrink-0"
            >
              High
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-28 sm:pb-32">
        {/* Meta Info */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs sm:text-sm text-muted-foreground mb-6 sm:mb-8">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="text-foreground font-medium">{idea.submittedBy}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>{idea.submittedAt}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>{idea.category}</span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>{idea.attachments} attachments</span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span>{idea.comments} comments</span>
          </div>
        </div>

        {/* Score Banner */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20 mb-6 sm:mb-8">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Innovation Score</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-bold text-primary">{idea.score}</span>
                  <span className="text-muted-foreground">/100</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 sm:gap-8">
                <div className="text-center">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Impact</p>
                  <p className="text-base sm:text-xl font-semibold text-foreground">{idea.impact.level}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Effort</p>
                  <p className="text-base sm:text-xl font-semibold text-foreground">{idea.effort.level}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Timeline</p>
                  <p className="text-base sm:text-xl font-semibold text-foreground">{idea.effort.timeEstimate}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Description */}
        <Card className="bg-card border-border mb-4 sm:mb-6">
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Lightbulb className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Idea Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm sm:text-base text-foreground leading-relaxed">{idea.description}</p>
          </CardContent>
        </Card>

        {/* Impact & Effort */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
                Expected Impact
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm sm:text-base text-foreground">{idea.impact.description}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
                Effort Required
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 sm:space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Timeline</span>
                <span className="text-sm text-foreground font-medium">{idea.effort.timeEstimate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Team Size</span>
                <span className="text-sm text-foreground font-medium">{idea.effort.teamSize}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cost */}
        <Card className="bg-card border-border mb-4 sm:mb-6">
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Cost Estimate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl sm:text-2xl font-bold text-foreground mb-1 sm:mb-2">{idea.cost.estimate}</p>
            <p className="text-xs sm:text-sm text-muted-foreground">{idea.cost.breakdown}</p>
          </CardContent>
        </Card>

        {/* Edge Summary - Business Outcomes & Success Criteria */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20 mb-4 sm:mb-6">
          <CardHeader className="pb-2 sm:pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Target className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Edge: Business Outcomes & Success Criteria
              </CardTitle>
              <Badge variant="outline" className={`text-xs ${confidenceConfig[mockEdge.confidence].className}`}>
                <Shield className="w-3 h-3 mr-1" />
                {confidenceConfig[mockEdge.confidence].label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Outcomes with Metrics */}
            {mockEdge.outcomes.map((outcome, index) => (
              <div key={outcome.id} className="p-3 sm:p-4 rounded-lg bg-background border border-border">
                <div className="flex items-start gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {index + 1}
                  </div>
                  <p className="font-medium text-sm sm:text-base text-foreground">{outcome.description}</p>
                </div>
                <div className="pl-7 flex flex-wrap gap-2">
                  {outcome.metrics.map((metric) => (
                    <div key={metric.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border">
                      <Gauge className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs sm:text-sm text-foreground">
                        {metric.name}: <span className="font-semibold text-primary">{metric.target}{metric.unit}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Impact Timeline */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-lg bg-success-soft border border-success/20">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-3.5 h-3.5 text-success" />
                  <span className="text-xs font-medium text-success">Short-term (0-3mo)</span>
                </div>
                <p className="text-xs text-foreground">{mockEdge.impact.shortTerm}</p>
              </div>
              <div className="p-3 rounded-lg bg-warning-soft border border-warning/20">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-3.5 h-3.5 text-warning" />
                  <span className="text-xs font-medium text-warning">Mid-term (3-12mo)</span>
                </div>
                <p className="text-xs text-foreground">{mockEdge.impact.midTerm}</p>
              </div>
              <div className="p-3 rounded-lg bg-info-soft border border-primary/20">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">Long-term (12+mo)</span>
                </div>
                <p className="text-xs text-foreground">{mockEdge.impact.longTerm}</p>
              </div>
            </div>

            {/* Owner */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">Edge Owner</span>
              <span className="text-sm font-medium text-foreground">{mockEdge.owner}</span>
            </div>
          </CardContent>
        </Card>

        {/* Risks */}
        <Card className="bg-card border-border mb-4 sm:mb-6">
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
              Identified Risks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            {idea.risks.map((risk, index) => (
              <div key={index} className="p-3 sm:p-4 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h4 className="font-medium text-sm sm:text-base text-foreground">{risk.title}</h4>
                  <Badge variant="outline" className={`text-xs ${severityConfig[risk.severity].className}`}>
                    {risk.severity}
                  </Badge>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  <span className="font-medium">Mitigation:</span> {risk.mitigation}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Assumptions */}
        <Card className="bg-card border-border mb-4 sm:mb-6">
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Key Assumptions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {idea.assumptions.map((assumption, index) => (
                <li key={index} className="flex items-start gap-2 text-sm sm:text-base text-foreground">
                  <span className="text-primary mt-1">•</span>
                  {assumption}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Strategic Alignment */}
        <Card className="bg-card border-border mb-4 sm:mb-6">
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Strategic Alignment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {idea.alignments.map((alignment, index) => (
                <Badge key={index} variant="secondary" className="bg-primary/10 text-primary border-0 text-xs">
                  {alignment}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Fixed Decision Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
            <Button 
              variant="outline" 
              size={isMobile ? "sm" : "default"}
              onClick={() => setShowClarificationDialog(true)}
              className="gap-2 order-2 sm:order-1"
            >
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Request Clarification</span>
              <span className="sm:hidden">Clarify</span>
            </Button>
            <div className="flex gap-2 sm:gap-3 order-1 sm:order-2">
              <Button 
                variant="outline" 
                size={isMobile ? "sm" : "default"}
                onClick={() => setShowRejectDialog(true)}
                className="gap-2 flex-1 sm:flex-none border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <XCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Send Back</span>
                <span className="sm:hidden">Reject</span>
              </Button>
              <Button 
                size={isMobile ? "sm" : "default"}
                onClick={handleApprove}
                className="gap-2 flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle className="h-4 w-4" />
                Approve
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-[90vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Back for Revision</DialogTitle>
            <DialogDescription>
              Provide feedback to help the submitter improve their idea.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Explain what changes or additional information is needed..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="min-h-[100px] sm:min-h-[120px]"
          />
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleReject} variant="destructive">
              Send Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clarification Dialog */}
      <Dialog open={showClarificationDialog} onOpenChange={setShowClarificationDialog}>
        <DialogContent className="max-w-[90vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request Clarification</DialogTitle>
            <DialogDescription>
              Ask the submitter for additional details before making a decision.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="What additional information do you need?"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="min-h-[100px] sm:min-h-[120px]"
          />
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowClarificationDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRequestClarification}>
              Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

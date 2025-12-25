import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { 
  Clock, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  MessageSquare,
  Filter,
  Search,
  ChevronRight,
  Target,
  Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardLayout } from "@/components/DashboardLayout";

interface ReviewIdea {
  id: string;
  title: string;
  submittedBy: string;
  submittedAt: string;
  priority: "high" | "medium" | "low";
  readiness: "ready" | "needs-info" | "incomplete";
  edgeStatus: "complete" | "draft" | "missing";
  score: number;
  impact: string;
  effort: string;
  waitingDays: number;
  category: string;
}

const mockIdeas: ReviewIdea[] = [
  {
    id: "1",
    title: "AI-Powered Customer Support Chatbot",
    submittedBy: "Sarah Chen",
    submittedAt: "2024-01-15",
    priority: "high",
    readiness: "ready",
    edgeStatus: "complete",
    score: 87,
    impact: "High",
    effort: "Medium",
    waitingDays: 3,
    category: "Customer Experience"
  },
  {
    id: "2",
    title: "Mobile App Push Notification Revamp",
    submittedBy: "Marcus Johnson",
    submittedAt: "2024-01-14",
    priority: "high",
    readiness: "needs-info",
    edgeStatus: "draft",
    score: 72,
    impact: "Medium",
    effort: "Low",
    waitingDays: 4,
    category: "Product"
  },
  {
    id: "3",
    title: "Sustainability Dashboard for Operations",
    submittedBy: "Emily Rodriguez",
    submittedAt: "2024-01-12",
    priority: "medium",
    readiness: "ready",
    edgeStatus: "complete",
    score: 81,
    impact: "High",
    effort: "High",
    waitingDays: 6,
    category: "Operations"
  },
  {
    id: "4",
    title: "Employee Wellness Program Integration",
    submittedBy: "David Kim",
    submittedAt: "2024-01-10",
    priority: "low",
    readiness: "incomplete",
    edgeStatus: "missing",
    score: 45,
    impact: "Medium",
    effort: "Medium",
    waitingDays: 8,
    category: "HR"
  },
  {
    id: "5",
    title: "Real-time Inventory Tracking System",
    submittedBy: "Lisa Wang",
    submittedAt: "2024-01-13",
    priority: "high",
    readiness: "ready",
    edgeStatus: "complete",
    score: 91,
    impact: "High",
    effort: "Medium",
    waitingDays: 5,
    category: "Operations"
  }
];

const priorityConfig = {
  high: { label: "High Priority", className: "bg-destructive/10 text-destructive border-destructive/20" },
  medium: { label: "Medium", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  low: { label: "Low", className: "bg-muted text-muted-foreground border-border" }
};

const readinessConfig = {
  ready: { label: "Ready for Review", icon: CheckCircle2, className: "text-emerald-600" },
  "needs-info": { label: "Needs Info", icon: MessageSquare, className: "text-amber-600" },
  incomplete: { label: "Incomplete", icon: AlertCircle, className: "text-destructive" }
};

const edgeStatusConfig = {
  complete: { label: "Edge Complete", className: "bg-success-soft text-success border-success/30" },
  draft: { label: "Edge Draft", className: "bg-warning-soft text-warning border-warning/30" },
  missing: { label: "Edge Missing", className: "bg-error-soft text-error border-error/30" }
};

export default function IdeaReviewQueue() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [readinessFilter, setReadinessFilter] = useState<string>("all");

  const filteredIdeas = mockIdeas.filter((idea) => {
    const matchesSearch = idea.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      idea.submittedBy.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = priorityFilter === "all" || idea.priority === priorityFilter;
    const matchesReadiness = readinessFilter === "all" || idea.readiness === readinessFilter;
    return matchesSearch && matchesPriority && matchesReadiness;
  });

  const stats = {
    total: mockIdeas.length,
    ready: mockIdeas.filter(i => i.readiness === "ready").length,
    highPriority: mockIdeas.filter(i => i.priority === "high").length,
    avgWaitDays: Math.round(mockIdeas.reduce((acc, i) => acc + i.waitingDays, 0) / mockIdeas.length)
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/ideas">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div>
                <h1 className="text-xl font-bold text-foreground">Review Queue</h1>
                <p className="text-sm text-muted-foreground">Ideas awaiting your decision</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                  <p className="text-sm text-muted-foreground">Pending Review</p>
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
                  <p className="text-2xl font-bold text-foreground">{stats.ready}</p>
                  <p className="text-sm text-muted-foreground">Ready to Decide</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.highPriority}</p>
                  <p className="text-sm text-muted-foreground">High Priority</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <TrendingUp className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stats.avgWaitDays}d</p>
                  <p className="text-sm text-muted-foreground">Avg. Wait Time</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search ideas or submitters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={readinessFilter} onValueChange={setReadinessFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Readiness" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="needs-info">Needs Info</SelectItem>
                <SelectItem value="incomplete">Incomplete</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Ideas List */}
        <div className="space-y-3">
          {filteredIdeas.map((idea) => {
            const ReadinessIcon = readinessConfig[idea.readiness].icon;
            return (
              <Card 
                key={idea.id} 
                className="bg-card border-border hover:border-primary/30 transition-all cursor-pointer group"
                onClick={() => navigate(`/review/${idea.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                        <Badge 
                          variant="outline" 
                          className={priorityConfig[idea.priority].className}
                        >
                          {priorityConfig[idea.priority].label}
                        </Badge>
                        <div className={`flex items-center gap-1.5 text-sm ${readinessConfig[idea.readiness].className}`}>
                          <ReadinessIcon className="h-4 w-4" />
                          <span>{readinessConfig[idea.readiness].label}</span>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${edgeStatusConfig[idea.edgeStatus].className}`}
                        >
                          <Target className="h-3 w-3 mr-1" />
                          {edgeStatusConfig[idea.edgeStatus].label}
                        </Badge>
                      </div>
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1">
                        {idea.title}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>by {idea.submittedBy}</span>
                        <span>•</span>
                        <span>{idea.category}</span>
                        <span>•</span>
                        <span className="text-amber-600">{idea.waitingDays} days waiting</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right hidden sm:block">
                        <div className="flex items-center gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Score</p>
                            <p className={`font-semibold ${idea.score >= 80 ? 'text-emerald-600' : idea.score >= 60 ? 'text-amber-600' : 'text-destructive'}`}>
                              {idea.score}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Impact</p>
                            <p className="font-medium text-foreground">{idea.impact}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Effort</p>
                            <p className="font-medium text-foreground">{idea.effort}</p>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filteredIdeas.length === 0 && (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No ideas match your filters</h3>
            <p className="text-muted-foreground">Try adjusting your search or filter criteria</p>
          </div>
        )}
      </main>
    </div>
  );
}

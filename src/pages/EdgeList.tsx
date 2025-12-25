import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Target,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  TrendingUp,
  Shield,
  BarChart3,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardLayout } from '@/components/DashboardLayout';

interface EdgeItem {
  id: string;
  ideaId: string;
  ideaTitle: string;
  status: 'complete' | 'draft' | 'missing';
  outcomesCount: number;
  metricsCount: number;
  confidence: 'high' | 'medium' | 'low' | null;
  owner: string;
  updatedAt: string;
}

const mockEdges: EdgeItem[] = [
  {
    id: '1',
    ideaId: '1',
    ideaTitle: 'AI-Powered Customer Segmentation',
    status: 'complete',
    outcomesCount: 2,
    metricsCount: 4,
    confidence: 'high',
    owner: 'Sarah Chen',
    updatedAt: '2024-02-28'
  },
  {
    id: '2',
    ideaId: '2',
    ideaTitle: 'Automated Report Generation',
    status: 'complete',
    outcomesCount: 3,
    metricsCount: 5,
    confidence: 'medium',
    owner: 'Mike Thompson',
    updatedAt: '2024-02-25'
  },
  {
    id: '3',
    ideaId: '3',
    ideaTitle: 'Predictive Maintenance System',
    status: 'draft',
    outcomesCount: 1,
    metricsCount: 2,
    confidence: 'low',
    owner: 'Emily Rodriguez',
    updatedAt: '2024-02-20'
  },
  {
    id: '4',
    ideaId: '4',
    ideaTitle: 'Real-time Analytics Dashboard',
    status: 'complete',
    outcomesCount: 2,
    metricsCount: 3,
    confidence: 'high',
    owner: 'David Kim',
    updatedAt: '2024-02-18'
  },
  {
    id: '5',
    ideaId: '5',
    ideaTitle: 'Smart Inventory Optimization',
    status: 'missing',
    outcomesCount: 0,
    metricsCount: 0,
    confidence: null,
    owner: '',
    updatedAt: ''
  },
];

const statusConfig = {
  complete: { label: 'Complete', icon: CheckCircle2, className: 'bg-success-soft text-success border-success/30' },
  draft: { label: 'Draft', icon: Clock, className: 'bg-warning-soft text-warning border-warning/30' },
  missing: { label: 'Missing', icon: AlertCircle, className: 'bg-error-soft text-error border-error/30' }
};

const confidenceConfig = {
  high: { label: 'High', className: 'text-success' },
  medium: { label: 'Medium', className: 'text-warning' },
  low: { label: 'Low', className: 'text-error' }
};

export default function EdgeList() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredEdges = mockEdges.filter((edge) => {
    const matchesSearch = edge.ideaTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      edge.owner.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || edge.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: mockEdges.length,
    complete: mockEdges.filter(e => e.status === 'complete').length,
    draft: mockEdges.filter(e => e.status === 'draft').length,
    missing: mockEdges.filter(e => e.status === 'missing').length
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-3">
            <Target className="w-4 h-4" />
            Business Case Definition
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-1 sm:mb-2">Edge</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Define outcomes, metrics, and expected impact for ideas</p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Ideas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success-soft">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.complete}</p>
                <p className="text-sm text-muted-foreground">Complete</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning-soft">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.draft}</p>
                <p className="text-sm text-muted-foreground">In Draft</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-error-soft">
                <AlertCircle className="h-5 w-5 text-error" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.missing}</p>
                <p className="text-sm text-muted-foreground">Missing</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search ideas or owners..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="missing">Missing</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Edge List */}
      <div className="space-y-3">
        {filteredEdges.map((edge) => {
          const StatusIcon = statusConfig[edge.status].icon;
          return (
            <Card 
              key={edge.id} 
              className="bg-card border-border hover:border-primary/30 transition-all cursor-pointer group"
              onClick={() => navigate(`/ideas/${edge.ideaId}/edge`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${statusConfig[edge.status].className}`}
                      >
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusConfig[edge.status].label}
                      </Badge>
                      {edge.confidence && (
                        <div className={`flex items-center gap-1 text-xs ${confidenceConfig[edge.confidence].className}`}>
                          <Shield className="h-3.5 w-3.5" />
                          <span>{confidenceConfig[edge.confidence].label} Confidence</span>
                        </div>
                      )}
                    </div>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-1">
                      {edge.ideaTitle}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-muted-foreground">
                      {edge.owner && (
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          <span>{edge.owner}</span>
                        </div>
                      )}
                      {edge.status !== 'missing' && (
                        <>
                          <div className="flex items-center gap-1.5">
                            <TrendingUp className="h-3.5 w-3.5" />
                            <span>{edge.outcomesCount} outcomes</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <BarChart3 className="h-3.5 w-3.5" />
                            <span>{edge.metricsCount} metrics</span>
                          </div>
                        </>
                      )}
                      {edge.updatedAt && (
                        <span className="text-xs">Updated {edge.updatedAt}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredEdges.length === 0 && (
        <div className="text-center py-12">
          <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Edge definitions found</h3>
          <p className="text-muted-foreground">Try adjusting your search or filter criteria</p>
        </div>
      )}
    </DashboardLayout>
  );
}

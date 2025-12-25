import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Activity,
  CheckCircle2,
  MessageSquare,
  UserPlus,
  Edit3,
  Star,
  ArrowRight,
  Filter,
  Search,
  Lightbulb,
  FolderKanban
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from '@/components/ui/button';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Breadcrumbs } from '@/components/Breadcrumbs';

interface ActivityItem {
  id: string;
  type: 'idea_created' | 'idea_scored' | 'project_created' | 'task_completed' | 'comment_added' | 'user_joined' | 'status_changed' | 'idea_converted';
  actor: {
    name: string;
  };
  action: string;
  target: string;
  targetType: 'idea' | 'project' | 'task' | 'team';
  timestamp: string;
  metadata?: {
    score?: number;
    status?: string;
    comment?: string;
  };
}

const mockActivities: ActivityItem[] = [
  { id: '1', type: 'idea_scored', actor: { name: 'Sarah Chen' }, action: 'scored', target: 'AI-Powered Customer Support Bot', targetType: 'idea', timestamp: '10 minutes ago', metadata: { score: 87 } },
  { id: '2', type: 'task_completed', actor: { name: 'Marcus Johnson' }, action: 'completed task', target: 'Design system audit', targetType: 'task', timestamp: '25 minutes ago' },
  { id: '3', type: 'idea_created', actor: { name: 'Emily Rodriguez' }, action: 'submitted new idea', target: 'Mobile App Redesign', targetType: 'idea', timestamp: '1 hour ago' },
  { id: '4', type: 'comment_added', actor: { name: 'David Park' }, action: 'commented on', target: 'Q1 Analytics Dashboard', targetType: 'project', timestamp: '2 hours ago', metadata: { comment: 'Great progress on the charts!' } },
  { id: '5', type: 'user_joined', actor: { name: 'Alex Thompson' }, action: 'joined the team', target: 'Product Innovation', targetType: 'team', timestamp: '3 hours ago' },
  { id: '6', type: 'status_changed', actor: { name: 'Lisa Wang' }, action: 'changed status of', target: 'Customer Feedback Portal', targetType: 'project', timestamp: '4 hours ago', metadata: { status: 'In Progress' } },
  { id: '7', type: 'idea_converted', actor: { name: 'James Miller' }, action: 'converted idea to project', target: 'Automated Testing Framework', targetType: 'idea', timestamp: '5 hours ago' },
  { id: '8', type: 'project_created', actor: { name: 'Sarah Chen' }, action: 'created new project', target: 'Performance Optimization Initiative', targetType: 'project', timestamp: '6 hours ago' },
  { id: '9', type: 'task_completed', actor: { name: 'Emily Rodriguez' }, action: 'completed task', target: 'API documentation update', targetType: 'task', timestamp: 'Yesterday' },
  { id: '10', type: 'idea_scored', actor: { name: 'Marcus Johnson' }, action: 'scored', target: 'Data Pipeline Modernization', targetType: 'idea', timestamp: 'Yesterday', metadata: { score: 92 } },
];

const getActivityIcon = (type: ActivityItem['type']) => {
  switch (type) {
    case 'idea_created': return { icon: Lightbulb, color: 'bg-amber-100 text-amber-600' };
    case 'idea_scored': return { icon: Star, color: 'bg-purple-100 text-purple-600' };
    case 'project_created': return { icon: FolderKanban, color: 'bg-primary/10 text-primary' };
    case 'task_completed': return { icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-600' };
    case 'comment_added': return { icon: MessageSquare, color: 'bg-sky-100 text-sky-600' };
    case 'user_joined': return { icon: UserPlus, color: 'bg-indigo-100 text-indigo-600' };
    case 'status_changed': return { icon: Edit3, color: 'bg-orange-100 text-orange-600' };
    case 'idea_converted': return { icon: ArrowRight, color: 'bg-teal-100 text-teal-600' };
    default: return { icon: Activity, color: 'bg-muted text-muted-foreground' };
  }
};

export default function ActivityFeed() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredActivities = mockActivities.filter(activity => {
    const matchesFilter = filter === 'all' || activity.targetType === filter;
    const matchesSearch = 
      activity.target.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.actor.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <Breadcrumbs items={[
          { label: 'Account', href: '/account' },
          { label: 'Activity Feed' }
        ]} />

        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg gradient-hero flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground">Activity Feed</h1>
          </div>
          <p className="text-muted-foreground">
            Stay updated on recent actions across your ideas and projects
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search activity..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activity</SelectItem>
              <SelectItem value="idea">Ideas</SelectItem>
              <SelectItem value="project">Projects</SelectItem>
              <SelectItem value="task">Tasks</SelectItem>
              <SelectItem value="team">Teams</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Activity List */}
        <div className="space-y-1">
          {filteredActivities.map((activity, index) => {
            const { icon: Icon, color } = getActivityIcon(activity.type);
            const isNewDay = index === 0 || 
              (activity.timestamp.includes('Yesterday') && 
               !mockActivities[index - 1].timestamp.includes('Yesterday'));

            return (
              <div key={activity.id}>
                {isNewDay && activity.timestamp.includes('Yesterday') && (
                  <div className="flex items-center gap-4 py-4">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs font-medium text-muted-foreground uppercase">Yesterday</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/30 transition-colors group">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{activity.actor.name}</span>
                      {' '}
                      <span className="text-muted-foreground">{activity.action}</span>
                      {' '}
                      <span className="font-medium">{activity.target}</span>
                    </p>
                    {activity.metadata?.score && (
                      <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        <Star className="w-3 h-3" />
                        Score: {activity.metadata.score}
                      </div>
                    )}
                    {activity.metadata?.status && (
                      <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        {activity.metadata.status}
                      </div>
                    )}
                    {activity.metadata?.comment && (
                      <p className="mt-1 text-sm text-muted-foreground italic">
                        "{activity.metadata.comment}"
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">{activity.timestamp}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredActivities.length === 0 && (
          <div className="text-center py-12">
            <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No activity found</p>
          </div>
        )}

        {filteredActivities.length > 0 && (
          <div className="text-center mt-8">
            <Button variant="outline">Load More Activity</Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

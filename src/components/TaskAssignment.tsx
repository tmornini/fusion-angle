import { useState } from 'react';
import { 
  Users,
  Star,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Target,
  Brain,
  Zap,
  ArrowRight,
  UserPlus,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  estimatedHours: number;
  requiredSkills: string[];
  assignedTo?: string;
  status: 'unassigned' | 'assigned' | 'in_progress' | 'completed';
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  availability: number;
  strengths: string[];
  matchScore?: number;
}

interface TaskAssignmentProps {
  projectId: string;
  onClose?: () => void;
}

// Mock data
const mockTasks: Task[] = [
  {
    id: '1',
    title: 'Set up data pipeline',
    description: 'Configure ETL process for customer data ingestion',
    priority: 'high',
    estimatedHours: 16,
    requiredSkills: ['Data Architecture', 'Python', 'Database Design'],
    status: 'unassigned',
  },
  {
    id: '2',
    title: 'Train ML model',
    description: 'Develop and train customer segmentation model',
    priority: 'high',
    estimatedHours: 24,
    requiredSkills: ['Machine Learning', 'Python', 'Statistical Analysis'],
    status: 'unassigned',
  },
  {
    id: '3',
    title: 'Design dashboard UI',
    description: 'Create user interface mockups for analytics dashboard',
    priority: 'medium',
    estimatedHours: 12,
    requiredSkills: ['User Research', 'Prototyping', 'Design Systems'],
    status: 'unassigned',
  },
  {
    id: '4',
    title: 'Build API endpoints',
    description: 'Develop REST API for model predictions',
    priority: 'medium',
    estimatedHours: 20,
    requiredSkills: ['API Development', 'System Integration'],
    assignedTo: '4',
    status: 'assigned',
  },
  {
    id: '5',
    title: 'Create documentation',
    description: 'Write technical documentation for the system',
    priority: 'low',
    estimatedHours: 8,
    requiredSkills: ['Technical Writing'],
    status: 'unassigned',
  },
];

const mockTeamMembers: TeamMember[] = [
  {
    id: '1',
    name: 'Sarah Chen',
    role: 'Project Lead',
    availability: 85,
    strengths: ['Strategic Planning', 'Team Leadership', 'Risk Management'],
  },
  {
    id: '2',
    name: 'Mike Thompson',
    role: 'ML Engineer',
    availability: 60,
    strengths: ['Machine Learning', 'Python', 'Data Architecture'],
  },
  {
    id: '3',
    name: 'Jessica Park',
    role: 'Data Scientist',
    availability: 70,
    strengths: ['Statistical Analysis', 'Visualization', 'Predictive Modeling'],
  },
  {
    id: '4',
    name: 'David Martinez',
    role: 'Backend Developer',
    availability: 40,
    strengths: ['API Development', 'Database Design', 'System Integration'],
  },
  {
    id: '5',
    name: 'Emily Rodriguez',
    role: 'UX Designer',
    availability: 90,
    strengths: ['User Research', 'Prototyping', 'Design Systems'],
  },
];

export default function TaskAssignment({ projectId, onClose }: TaskAssignmentProps) {
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [expandedRecommendations, setExpandedRecommendations] = useState<string | null>(null);

  // Calculate match score based on skill overlap and availability
  const getRecommendedMembers = (task: Task): TeamMember[] => {
    return mockTeamMembers
      .map(member => {
        const skillMatch = task.requiredSkills.filter(skill => 
          member.strengths.some(s => s.toLowerCase().includes(skill.toLowerCase()) || 
                               skill.toLowerCase().includes(s.toLowerCase()))
        ).length;
        const matchScore = Math.round(
          (skillMatch / task.requiredSkills.length) * 70 + 
          (member.availability / 100) * 30
        );
        return { ...member, matchScore };
      })
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  };

  const handleAssign = (taskId: string, memberId: string) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId 
        ? { ...task, assignedTo: memberId, status: 'assigned' as const }
        : task
    ));
    setExpandedRecommendations(null);
  };

  const handleUnassign = (taskId: string) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId 
        ? { ...task, assignedTo: undefined, status: 'unassigned' as const }
        : task
    ));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'medium':
        return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'low':
        return 'text-green-600 bg-green-50 border-green-200';
      default:
        return 'text-muted-foreground bg-muted border-border';
    }
  };

  const getMatchScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-muted-foreground';
  };

  const getAssignedMember = (memberId?: string) => {
    return mockTeamMembers.find(m => m.id === memberId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-semibold text-foreground">Task Assignment</h2>
          <p className="text-sm text-muted-foreground">
            AI-powered recommendations based on strengths and availability
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span>AI Recommended</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>High Match (80%+)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span>Moderate Match (60-79%)</span>
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-3">
        {tasks.map((task) => {
          const assignedMember = getAssignedMember(task.assignedTo);
          const recommendations = getRecommendedMembers(task);
          const isExpanded = expandedRecommendations === task.id;

          return (
            <div
              key={task.id}
              className={`fusion-card overflow-hidden transition-all ${
                selectedTask === task.id ? 'ring-2 ring-primary' : ''
              }`}
            >
              {/* Task Header */}
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-1 text-muted-foreground cursor-grab">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-foreground">{task.title}</h4>
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                    
                    {/* Required Skills */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {task.requiredSkills.map((skill, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-2 py-0.5 rounded bg-muted/50 text-xs text-muted-foreground"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>

                    {/* Estimated Time */}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{task.estimatedHours} hours estimated</span>
                    </div>
                  </div>

                  {/* Assignment Status */}
                  <div className="flex-shrink-0">
                    {assignedMember ? (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                          <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                            <span className="text-xs font-bold text-green-700">
                              {assignedMember.name.split(' ').map(n => n[0]).join('')}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-green-700">{assignedMember.name}</span>
                          <button
                            onClick={() => handleUnassign(task.id)}
                            className="ml-1 p-0.5 hover:bg-green-200 rounded"
                          >
                            <X className="w-3 h-3 text-green-600" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpandedRecommendations(isExpanded ? null : task.id)}
                        className="gap-2"
                      >
                        <UserPlus className="w-4 h-4" />
                        Assign
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Recommendations Panel */}
              {isExpanded && !assignedMember && (
                <div className="border-t border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Recommended Team Members</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {recommendations.slice(0, 4).map((member, index) => (
                      <div
                        key={member.id}
                        className={`p-3 rounded-lg border bg-background transition-all hover:shadow-md cursor-pointer ${
                          index === 0 ? 'border-primary/50 bg-primary/5' : 'border-border'
                        }`}
                        onClick={() => handleAssign(task.id, member.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="relative">
                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                              <span className="text-sm font-bold text-muted-foreground">
                                {member.name.split(' ').map(n => n[0]).join('')}
                              </span>
                            </div>
                            {index === 0 && (
                              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                <Sparkles className="w-3 h-3 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm text-foreground">{member.name}</span>
                              <span className={`text-sm font-bold ${getMatchScoreColor(member.matchScore || 0)}`}>
                                {member.matchScore}%
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{member.role}</p>
                            
                            {/* Match Breakdown */}
                            <div className="flex items-center gap-3 text-xs">
                              <div className="flex items-center gap-1">
                                <Star className="w-3 h-3 text-amber-500" />
                                <span className="text-muted-foreground">
                                  {member.strengths.filter(s => 
                                    task.requiredSkills.some(skill => 
                                      s.toLowerCase().includes(skill.toLowerCase()) || 
                                      skill.toLowerCase().includes(s.toLowerCase())
                                    )
                                  ).length}/{task.requiredSkills.length} skills
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span className="text-muted-foreground">{member.availability}% available</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground mt-3 text-center">
                    Click a team member to assign, or manually search for others
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="fusion-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span className="text-sm text-foreground">
                <strong>{tasks.filter(t => t.assignedTo).length}</strong> assigned
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <span className="text-sm text-foreground">
                <strong>{tasks.filter(t => !t.assignedTo).length}</strong> unassigned
              </span>
            </div>
          </div>
          <Button className="gap-2">
            <ArrowRight className="w-4 h-4" />
            Save Assignments
          </Button>
        </div>
      </div>
    </div>
  );
}

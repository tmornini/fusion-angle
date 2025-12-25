import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  GitBranch,
  Plus,
  Trash2,
  Check,
  Users,
  Clock,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Share2,
  Download,
  Eye,
  Edit3,
  FileText,
  Mail,
  Database,
  Globe,
  Phone,
  MessageSquare,
  FolderOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardLayout } from '@/components/DashboardLayout';

interface ProcessStep {
  id: string;
  title: string;
  description: string;
  owner: string;
  role: string;
  tools: string[];
  duration: string;
  order: number;
  type: 'action' | 'decision' | 'start' | 'end';
}

interface Process {
  id: string;
  name: string;
  description: string;
  department: string;
  steps: ProcessStep[];
  createdAt: string;
  lastUpdated: string;
  sharedWith: string[];
}

const toolIcons: Record<string, typeof Mail> = {
  'Email': Mail,
  'Database': Database,
  'Website': Globe,
  'Phone': Phone,
  'Chat': MessageSquare,
  'Files': FolderOpen,
  'Document': FileText,
};

const mockProcess: Process = {
  id: '1',
  name: 'Customer Onboarding',
  description: 'End-to-end process for onboarding new enterprise customers',
  department: 'Customer Success',
  createdAt: '2024-02-15',
  lastUpdated: '2024-02-28',
  sharedWith: ['Engineering', 'Sales'],
  steps: [
    {
      id: '1',
      title: 'Receive signed contract',
      description: 'Sales team sends signed contract to customer success inbox',
      owner: 'Sales Team',
      role: 'Account Executive',
      tools: ['Email', 'Document'],
      duration: 'Immediate',
      order: 1,
      type: 'start',
    },
    {
      id: '2',
      title: 'Create customer record',
      description: 'Enter customer details in CRM and create project folder',
      owner: 'Customer Success',
      role: 'CS Manager',
      tools: ['Database', 'Files'],
      duration: '15 minutes',
      order: 2,
      type: 'action',
    },
    {
      id: '3',
      title: 'Schedule kickoff call',
      description: 'Reach out to customer to schedule implementation kickoff',
      owner: 'Customer Success',
      role: 'Implementation Specialist',
      tools: ['Email', 'Phone'],
      duration: '1 day',
      order: 3,
      type: 'action',
    },
    {
      id: '4',
      title: 'Conduct kickoff meeting',
      description: 'Review goals, timeline, and assign customer contacts',
      owner: 'Customer Success',
      role: 'Implementation Specialist',
      tools: ['Chat', 'Document'],
      duration: '1 hour',
      order: 4,
      type: 'action',
    },
    {
      id: '5',
      title: 'Technical setup complete',
      description: 'Engineering confirms environment is ready for customer use',
      owner: 'Engineering',
      role: 'Solutions Engineer',
      tools: ['Database', 'Website'],
      duration: '2 days',
      order: 5,
      type: 'action',
    },
  ],
};

export default function Flow() {
  const navigate = useNavigate();
  const [process, setProcess] = useState<Process>(mockProcess);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const addStep = () => {
    const newStep: ProcessStep = {
      id: Date.now().toString(),
      title: '',
      description: '',
      owner: '',
      role: '',
      tools: [],
      duration: '',
      order: process.steps.length + 1,
      type: 'action',
    };
    setProcess(prev => ({
      ...prev,
      steps: [...prev.steps, newStep],
    }));
    setExpandedStep(newStep.id);
  };

  const updateStep = (stepId: string, updates: Partial<ProcessStep>) => {
    setProcess(prev => ({
      ...prev,
      steps: prev.steps.map(step =>
        step.id === stepId ? { ...step, ...updates } : step
      ),
    }));
  };

  const removeStep = (stepId: string) => {
    setProcess(prev => ({
      ...prev,
      steps: prev.steps.filter(step => step.id !== stepId),
    }));
  };

  const moveStep = (stepId: string, direction: 'up' | 'down') => {
    const currentIndex = process.steps.findIndex(s => s.id === stepId);
    if (
      (direction === 'up' && currentIndex === 0) ||
      (direction === 'down' && currentIndex === process.steps.length - 1)
    ) return;

    const newSteps = [...process.steps];
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    [newSteps[currentIndex], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[currentIndex]];
    
    setProcess(prev => ({ ...prev, steps: newSteps }));
  };

  const toggleTool = (stepId: string, tool: string) => {
    const step = process.steps.find(s => s.id === stepId);
    if (!step) return;

    const tools = step.tools.includes(tool)
      ? step.tools.filter(t => t !== tool)
      : [...step.tools, tool];
    
    updateStep(stepId, { tools });
  };

  const getStepTypeColor = (type: string) => {
    switch (type) {
      case 'start':
        return 'bg-emerald-100 border-emerald-300 text-emerald-700';
      case 'end':
        return 'bg-destructive/10 border-destructive/30 text-destructive';
      case 'decision':
        return 'bg-amber-100 border-amber-300 text-amber-700';
      default:
        return 'bg-primary/10 border-primary/30 text-primary';
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-medium mb-3 sm:mb-4">
              <GitBranch className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Process Documentation
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-1 sm:mb-2">Flow</h1>
            <p className="text-sm sm:text-base text-muted-foreground max-w-xl">
              Document your business processes step by step. We'll help you create clear workflows 
              that everyone can understand and follow.
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button 
              variant={viewMode === 'edit' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setViewMode('edit')}
              className="gap-1.5 sm:gap-2 text-xs sm:text-sm"
            >
              <Edit3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Edit
            </Button>
            <Button 
              variant={viewMode === 'preview' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setViewMode('preview')}
              className="gap-1.5 sm:gap-2 text-xs sm:text-sm"
            >
              <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Preview
            </Button>
          </div>
        </div>

        {/* Process Info */}
        <div className="fusion-card p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2 block">Process Name</label>
              <Input
                value={process.name}
                onChange={(e) => setProcess(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Customer Onboarding"
                className="text-base sm:text-lg font-medium"
              />
            </div>
            <div>
              <label className="text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2 block">Department</label>
              <Select
                value={process.department}
                onValueChange={(value) => setProcess(prev => ({ ...prev, department: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sales">Sales</SelectItem>
                  <SelectItem value="Customer Success">Customer Success</SelectItem>
                  <SelectItem value="Engineering">Engineering</SelectItem>
                  <SelectItem value="Operations">Operations</SelectItem>
                  <SelectItem value="Finance">Finance</SelectItem>
                  <SelectItem value="HR">HR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2 block">Description</label>
              <Textarea
                value={process.description}
                onChange={(e) => setProcess(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Briefly describe what this process accomplishes..."
                className="resize-none text-sm"
              />
            </div>
          </div>
        </div>

        {/* Edit Mode */}
        {viewMode === 'edit' && (
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-display font-semibold text-foreground">Process Steps</h2>
              <span className="text-xs sm:text-sm text-muted-foreground">{process.steps.length} steps</span>
            </div>

            {/* Steps */}
            <div className="space-y-3">
              {process.steps.map((step, index) => {
                const isExpanded = expandedStep === step.id;
                
                return (
                  <div key={step.id} className="relative">
                    {index < process.steps.length - 1 && (
                      <div className="absolute left-6 top-full w-0.5 h-3 bg-border z-0" />
                    )}
                    
                    <div className={`fusion-card overflow-hidden ${isExpanded ? 'ring-2 ring-primary' : ''}`}>
                      <div
                        className="p-3 sm:p-4 cursor-pointer"
                        onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                      >
                        <div className="flex items-center gap-2 sm:gap-4">
                          <div className="cursor-grab text-muted-foreground hover:text-foreground hidden sm:block">
                            <GripVertical className="w-4 h-4" />
                          </div>
                          
                          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center border-2 flex-shrink-0 ${getStepTypeColor(step.type)}`}>
                            <span className="text-xs sm:text-sm font-bold">{index + 1}</span>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                              <span className="font-medium text-foreground text-sm sm:text-base truncate">
                                {step.title || 'Untitled Step'}
                              </span>
                              {!step.title && (
                                <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                  Needs info
                                </span>
                              )}
                            </div>
                            {step.owner && (
                              <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
                                <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                <span className="truncate">{step.owner}</span>
                                {step.duration && (
                                  <>
                                    <span className="hidden sm:inline">•</span>
                                    <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 hidden sm:block" />
                                    <span className="hidden sm:inline">{step.duration}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 sm:gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); moveStep(step.id, 'up'); }}
                              disabled={index === 0}
                              className="h-7 w-7 sm:h-8 sm:w-8"
                            >
                              <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); moveStep(step.id, 'down'); }}
                              disabled={index === process.steps.length - 1}
                              className="h-7 w-7 sm:h-8 sm:w-8"
                            >
                              <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); removeStep(step.id); }}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 sm:h-8 sm:w-8"
                            >
                              <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-border pt-3 sm:pt-4 bg-muted/20">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className="col-span-1 sm:col-span-2">
                              <label className="text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2 block">
                                What happens in this step?
                              </label>
                              <Input
                                placeholder="e.g., Review and approve customer application"
                                value={step.title}
                                onChange={(e) => updateStep(step.id, { title: e.target.value })}
                                className="text-sm"
                              />
                            </div>
                            
                            <div className="col-span-1 sm:col-span-2">
                              <label className="text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2 block">
                                Describe this step in detail
                              </label>
                              <Textarea
                                placeholder="Explain what needs to happen, any special considerations..."
                                value={step.description}
                                onChange={(e) => updateStep(step.id, { description: e.target.value })}
                                className="resize-none text-sm"
                              />
                            </div>
                            
                            <div>
                              <label className="text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2 block">
                                Who is responsible?
                              </label>
                              <Input
                                placeholder="e.g., Customer Success Team"
                                value={step.owner}
                                onChange={(e) => updateStep(step.id, { owner: e.target.value })}
                                className="text-sm"
                              />
                            </div>
                            
                            <div>
                              <label className="text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2 block">
                                Specific Role
                              </label>
                              <Input
                                placeholder="e.g., Account Manager"
                                value={step.role}
                                onChange={(e) => updateStep(step.id, { role: e.target.value })}
                                className="text-sm"
                              />
                            </div>
                            
                            <div>
                              <label className="text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2 block">
                                How long does this take?
                              </label>
                              <Input
                                placeholder="e.g., 30 minutes"
                                value={step.duration}
                                onChange={(e) => updateStep(step.id, { duration: e.target.value })}
                                className="text-sm"
                              />
                            </div>
                            
                            <div>
                              <label className="text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2 block">
                                Step Type
                              </label>
                              <Select
                                value={step.type}
                                onValueChange={(value: ProcessStep['type']) => updateStep(step.id, { type: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="start">Start</SelectItem>
                                  <SelectItem value="action">Action</SelectItem>
                                  <SelectItem value="decision">Decision</SelectItem>
                                  <SelectItem value="end">End</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="col-span-1 sm:col-span-2">
                              <label className="text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2 block">
                                Tools Used
                              </label>
                              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                {Object.entries(toolIcons).map(([toolName, Icon]) => {
                                  const isSelected = step.tools.includes(toolName);
                                  return (
                                    <button
                                      key={toolName}
                                      onClick={() => toggleTool(step.id, toolName)}
                                      className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm transition-all ${
                                        isSelected
                                          ? 'bg-primary text-primary-foreground'
                                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                      }`}
                                    >
                                      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                      {toolName}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <Button onClick={addStep} variant="outline" className="w-full gap-2 border-dashed">
              <Plus className="w-4 h-4" />
              Add Step
            </Button>
          </div>
        )}

        {/* Preview Mode */}
        {viewMode === 'preview' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-base sm:text-lg font-display font-semibold text-foreground">{process.name}</h2>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
                  <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Share
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Export
                </Button>
              </div>
            </div>

            <p className="text-sm sm:text-base text-muted-foreground">{process.description}</p>

            <div className="relative pl-4 sm:pl-6">
              <div className="absolute left-2 sm:left-3 top-0 bottom-0 w-0.5 bg-border" />
              
              {process.steps.map((step, index) => (
                <div key={step.id} className="relative pb-6 sm:pb-8 last:pb-0">
                  <div className={`absolute left-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 -translate-x-[calc(50%+0.5px)] flex items-center justify-center ${getStepTypeColor(step.type)} bg-background`}>
                    <span className="text-[10px] sm:text-xs font-bold">{index + 1}</span>
                  </div>
                  
                  <div className="ml-4 sm:ml-6 fusion-card p-3 sm:p-4">
                    <h4 className="font-medium text-foreground text-sm sm:text-base mb-1">{step.title}</h4>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">{step.description}</p>
                    
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        <span className="truncate">{step.owner} ({step.role})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        {step.duration}
                      </div>
                    </div>
                    
                    {step.tools.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2 sm:mt-3">
                        {step.tools.map(tool => {
                          const Icon = toolIcons[tool];
                          return (
                            <div key={tool} className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-muted text-muted-foreground text-[10px] sm:text-xs">
                              <Icon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                              {tool}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

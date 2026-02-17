// ============================================
// FUSION AI — Mock Data
// All functions are async to match future API signatures.
// ============================================

// ── Shared ──────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  company: string;
  avatar?: string;
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  time: string;
  unread: boolean;
}

export async function getCurrentUser(): Promise<User> {
  return {
    id: '1',
    name: 'Demo User',
    email: 'demo@example.com',
    role: 'Admin',
    company: 'Demo Company',
  };
}

export async function getNotifications(): Promise<Notification[]> {
  return [
    { id: 1, title: 'New idea submitted', message: 'Marketing team submitted "AI Chatbot Integration"', time: '5 min ago', unread: true },
    { id: 2, title: 'Project approved', message: 'Your project "Mobile App Redesign" was approved', time: '1 hour ago', unread: true },
    { id: 3, title: 'Comment on idea', message: 'John commented on "Customer Portal"', time: '2 hours ago', unread: false },
    { id: 4, title: 'Review requested', message: 'Sarah requested your review on "API Gateway"', time: '1 day ago', unread: false },
  ];
}

// ── Dashboard ───────────────────────────────

export interface GaugeCardData {
  title: string;
  icon: string;       // icon function name: 'dollarSign' | 'clock' | 'zap'
  iconClass: string;
  theme: 'blue' | 'green' | 'amber';
  outer: { value: number; max: number; label: string; display: string };
  inner: { value: number; max: number; label: string; display: string };
}

export interface QuickAction {
  label: string;
  icon: string;  // icon function name
  href: string;
}

export async function getDashboardGauges(): Promise<GaugeCardData[]> {
  return [
    {
      title: 'Time Tracking', icon: 'clock', iconClass: 'text-success', theme: 'green',
      outer: { value: 25, max: 30, label: 'Total Duration', display: '25d' },
      inner: { value: 12, max: 30, label: 'Days Elapsed', display: '12d' },
    },
    {
      title: 'Cost Overview', icon: 'dollarSign', iconClass: 'text-primary', theme: 'blue',
      outer: { value: 42300, max: 50000, label: 'Budget Spent', display: '$42.3K' },
      inner: { value: 25000, max: 50000, label: 'ROI Generated', display: '$25K' },
    },
    {
      title: 'Project Impact', icon: 'zap', iconClass: 'text-warning', theme: 'amber',
      outer: { value: 92, max: 100, label: 'Target Score', display: '92%' },
      inner: { value: 85, max: 100, label: 'Current Score', display: '85%' },
    },
  ];
}

export async function getDashboardQuickActions(): Promise<QuickAction[]> {
  return [
    { label: 'New Idea', icon: 'lightbulb', href: '../idea-create/index.html' },
    { label: 'Create Project', icon: 'folderKanban', href: '../projects/index.html' },
    { label: 'Invite Team', icon: 'users', href: '../team/index.html' },
    { label: 'View Reports', icon: 'trendingUp', href: '../dashboard/index.html' },
  ];
}

export async function getDashboardStats(): Promise<{ label: string; value: number; trend: string }[]> {
  return [
    { label: 'Ideas', value: 12, trend: '+3' },
    { label: 'Projects', value: 5, trend: '+1' },
    { label: 'Done', value: 8, trend: '' },
    { label: 'Review', value: 3, trend: '' },
  ];
}

// ── Ideas ───────────────────────────────────

export interface Idea {
  id: string;
  title: string;
  score: number;
  estimatedImpact: number;
  estimatedTime: number;
  estimatedCost: number;
  priority: number;
  status: 'draft' | 'scored' | 'pending_review' | 'approved' | 'rejected';
  submittedBy: string;
  edgeStatus: 'incomplete' | 'draft' | 'complete';
}

export async function getIdeas(): Promise<Idea[]> {
  return [
    { id: '1', title: 'AI-Powered Customer Segmentation', score: 92, estimatedImpact: 85, estimatedTime: 120, estimatedCost: 45000, priority: 1, status: 'pending_review', submittedBy: 'Sarah Chen', edgeStatus: 'complete' },
    { id: '2', title: 'Automated Report Generation', score: 87, estimatedImpact: 78, estimatedTime: 80, estimatedCost: 32000, priority: 2, status: 'approved', submittedBy: 'Mike Thompson', edgeStatus: 'complete' },
    { id: '3', title: 'Predictive Maintenance System', score: 84, estimatedImpact: 90, estimatedTime: 200, estimatedCost: 75000, priority: 3, status: 'scored', submittedBy: 'Emily Rodriguez', edgeStatus: 'draft' },
    { id: '4', title: 'Real-time Analytics Dashboard', score: 81, estimatedImpact: 72, estimatedTime: 60, estimatedCost: 28000, priority: 4, status: 'pending_review', submittedBy: 'David Kim', edgeStatus: 'complete' },
    { id: '5', title: 'Smart Inventory Optimization', score: 78, estimatedImpact: 68, estimatedTime: 100, estimatedCost: 38000, priority: 5, status: 'draft', submittedBy: 'Lisa Wang', edgeStatus: 'incomplete' },
    { id: '6', title: 'Employee Training Assistant', score: 74, estimatedImpact: 65, estimatedTime: 90, estimatedCost: 35000, priority: 6, status: 'rejected', submittedBy: 'Jessica Park', edgeStatus: 'incomplete' },
  ];
}

// ── Projects ────────────────────────────────

export interface Project {
  id: string;
  title: string;
  status: 'approved' | 'under_review' | 'sent_back';
  priorityScore: number;
  estimatedTime: number;
  actualTime: number;
  estimatedCost: number;
  actualCost: number;
  estimatedImpact: number;
  actualImpact: number;
  progress: number;
  priority: number;
}

export async function getProjects(): Promise<Project[]> {
  return [
    { id: '1', title: 'AI-Powered Customer Segmentation', status: 'approved', priorityScore: 92, estimatedTime: 120, actualTime: 85, estimatedCost: 45000, actualCost: 38000, estimatedImpact: 85, actualImpact: 78, progress: 72, priority: 1 },
    { id: '2', title: 'Automated Report Generation', status: 'approved', priorityScore: 87, estimatedTime: 80, actualTime: 60, estimatedCost: 32000, actualCost: 28000, estimatedImpact: 78, actualImpact: 82, progress: 85, priority: 2 },
    { id: '3', title: 'Predictive Maintenance System', status: 'under_review', priorityScore: 84, estimatedTime: 200, actualTime: 45, estimatedCost: 75000, actualCost: 18000, estimatedImpact: 90, actualImpact: 0, progress: 22, priority: 3 },
    { id: '4', title: 'Real-time Analytics Dashboard', status: 'approved', priorityScore: 81, estimatedTime: 60, actualTime: 55, estimatedCost: 28000, actualCost: 26000, estimatedImpact: 72, actualImpact: 70, progress: 95, priority: 4 },
    { id: '5', title: 'Smart Inventory Optimization', status: 'sent_back', priorityScore: 78, estimatedTime: 100, actualTime: 30, estimatedCost: 38000, actualCost: 12000, estimatedImpact: 68, actualImpact: 0, progress: 15, priority: 5 },
    { id: '6', title: 'Employee Training Assistant', status: 'under_review', priorityScore: 74, estimatedTime: 90, actualTime: 20, estimatedCost: 35000, actualCost: 8000, estimatedImpact: 65, actualImpact: 0, progress: 18, priority: 6 },
  ];
}

// ── Project Detail ──────────────────────────

export interface ProjectDetail {
  id: string;
  title: string;
  description: string;
  status: string;
  progress: number;
  startDate: string;
  targetEndDate: string;
  projectLead: string;
  metrics: {
    time: { baseline: number; current: number };
    cost: { baseline: number; current: number };
    impact: { baseline: number; current: number };
  };
  edge: {
    outcomes: { id: string; description: string; metrics: { id: string; name: string; target: string; unit: string; current: string }[] }[];
    impact: { shortTerm: string; midTerm: string; longTerm: string };
    confidence: 'high' | 'medium' | 'low';
    owner: string;
  };
  team: { id: string; name: string; role: string }[];
  milestones: { id: string; title: string; status: string; date: string }[];
  versions: { id: string; version: string; date: string; changes: string; author: string }[];
  discussions: { id: string; author: string; date: string; message: string }[];
  tasks: { name: string; priority: string; desc: string; skills: string[]; hours: number; assigned: string }[];
}

export async function getProjectById(_id: string): Promise<ProjectDetail> {
  return {
    id: '1',
    title: 'AI-Powered Customer Segmentation',
    description: 'Implement machine learning model to automatically segment customers based on behavior, purchase history, and engagement patterns.',
    status: 'approved',
    progress: 72,
    startDate: '2024-01-15',
    targetEndDate: '2024-04-15',
    projectLead: 'Sarah Chen',
    metrics: {
      time: { baseline: 120, current: 85 },
      cost: { baseline: 45000, current: 38000 },
      impact: { baseline: 85, current: 78 },
    },
    edge: {
      outcomes: [
        { id: '1', description: 'Reduce customer churn rate', metrics: [
          { id: '1', name: 'Churn Rate Reduction', target: '15', unit: '%', current: '12' },
          { id: '2', name: 'Customer Retention', target: '85', unit: '%', current: '82' },
        ]},
        { id: '2', description: 'Increase marketing ROI', metrics: [
          { id: '3', name: 'Campaign Conversion', target: '25', unit: '%', current: '28' },
          { id: '4', name: 'Cost per Acquisition', target: '45', unit: '$', current: '42' },
        ]},
      ],
      impact: {
        shortTerm: 'Automated segmentation reduces manual effort by 80%. Initial customer insights available within 2 weeks.',
        midTerm: 'Expected 15% reduction in churn through targeted campaigns. Marketing ROI improvement of 25%.',
        longTerm: 'Full personalization pipeline enabling real-time customer journey optimization across all channels.',
      },
      confidence: 'high',
      owner: 'Sarah Chen',
    },
    team: [
      { id: '1', name: 'Sarah Chen', role: 'Project Lead' },
      { id: '2', name: 'Mike Thompson', role: 'ML Engineer' },
      { id: '3', name: 'Jessica Park', role: 'Data Scientist' },
      { id: '4', name: 'David Martinez', role: 'Backend Developer' },
    ],
    milestones: [
      { id: '1', title: 'Data Pipeline Setup', status: 'completed', date: '2024-01-30' },
      { id: '2', title: 'Model Training Complete', status: 'completed', date: '2024-02-15' },
      { id: '3', title: 'Integration Testing', status: 'in_progress', date: '2024-03-01' },
      { id: '4', title: 'User Acceptance Testing', status: 'pending', date: '2024-03-20' },
      { id: '5', title: 'Production Deployment', status: 'pending', date: '2024-04-01' },
    ],
    versions: [
      { id: '1', version: 'v1.2', date: '2024-02-28', changes: 'Added real-time segmentation capability', author: 'Mike Thompson' },
      { id: '2', version: 'v1.1', date: '2024-02-15', changes: 'Improved model accuracy by 12%', author: 'Jessica Park' },
      { id: '3', version: 'v1.0', date: '2024-01-30', changes: 'Initial model deployment', author: 'Sarah Chen' },
    ],
    discussions: [
      { id: '1', author: 'Sarah Chen', date: '2024-02-28', message: 'Great progress on the integration testing. We should be ready for UAT next week.' },
      { id: '2', author: 'Mike Thompson', date: '2024-02-25', message: 'Segmentation accuracy is now at 94%. Exceeding our initial target of 90%.' },
      { id: '3', author: 'David Martinez', date: '2024-02-20', message: 'API endpoints are ready for frontend integration.' },
    ],
    tasks: [
      { name: 'Set up data pipeline', priority: 'High', desc: 'Configure ETL pipeline for customer data ingestion', skills: ['Python', 'Apache Airflow', 'SQL'], hours: 24, assigned: 'Mike Thompson' },
      { name: 'Train ML model', priority: 'High', desc: 'Develop and train clustering model using customer behavior data', skills: ['Machine Learning', 'Python', 'scikit-learn'], hours: 40, assigned: '' },
      { name: 'Design dashboard UI', priority: 'Medium', desc: 'Create visual interface for segment exploration and management', skills: ['React', 'D3.js', 'CSS'], hours: 32, assigned: '' },
      { name: 'Build API endpoints', priority: 'Medium', desc: 'RESTful API for segment data access and management', skills: ['Node.js', 'REST API', 'PostgreSQL'], hours: 20, assigned: '' },
      { name: 'Create documentation', priority: 'Low', desc: 'Technical documentation and user guides for the segmentation system', skills: ['Technical Writing', 'Markdown'], hours: 12, assigned: '' },
    ],
  };
}

// ── Team ─────────────────────────────────────

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  department: string;
  email: string;
  availability: number;
  performanceScore: number;
  projectsCompleted: number;
  currentProjects: number;
  strengths: string[];
  teamDimensions: Record<string, number>;
  status: string;
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  return [
    { id: '1', name: 'Sarah Chen', role: 'Project Lead', department: 'Operations', email: 'sarah.chen@company.com', availability: 85, performanceScore: 94, projectsCompleted: 12, currentProjects: 3, strengths: ['Strategic Planning', 'Team Leadership', 'Risk Management'], teamDimensions: { driver: 78, analytical: 85, expressive: 62, amiable: 70 }, status: 'available' },
    { id: '2', name: 'Mike Thompson', role: 'ML Engineer', department: 'Engineering', email: 'mike.thompson@company.com', availability: 60, performanceScore: 91, projectsCompleted: 8, currentProjects: 2, strengths: ['Machine Learning', 'Python', 'Data Architecture'], teamDimensions: { driver: 55, analytical: 95, expressive: 40, amiable: 58 }, status: 'busy' },
    { id: '3', name: 'Jessica Park', role: 'Data Scientist', department: 'Analytics', email: 'jessica.park@company.com', availability: 70, performanceScore: 88, projectsCompleted: 6, currentProjects: 2, strengths: ['Statistical Analysis', 'Visualization', 'Predictive Modeling'], teamDimensions: { driver: 45, analytical: 92, expressive: 68, amiable: 75 }, status: 'available' },
    { id: '4', name: 'David Martinez', role: 'Backend Developer', department: 'Engineering', email: 'david.martinez@company.com', availability: 40, performanceScore: 86, projectsCompleted: 10, currentProjects: 4, strengths: ['API Development', 'Database Design', 'System Integration'], teamDimensions: { driver: 70, analytical: 82, expressive: 35, amiable: 55 }, status: 'limited' },
    { id: '5', name: 'Emily Rodriguez', role: 'UX Designer', department: 'Design', email: 'emily.rodriguez@company.com', availability: 90, performanceScore: 92, projectsCompleted: 15, currentProjects: 1, strengths: ['User Research', 'Prototyping', 'Design Systems'], teamDimensions: { driver: 50, analytical: 72, expressive: 88, amiable: 85 }, status: 'available' },
    { id: '6', name: 'Alex Kim', role: 'Product Manager', department: 'Product', email: 'alex.kim@company.com', availability: 55, performanceScore: 89, projectsCompleted: 7, currentProjects: 3, strengths: ['Roadmap Planning', 'Stakeholder Management', 'Agile Methods'], teamDimensions: { driver: 85, analytical: 70, expressive: 78, amiable: 65 }, status: 'busy' },
  ];
}

// ── Edge (per-idea definition) ──────────────

export interface EdgeIdea {
  title: string;
  problem: string;
  solution: string;
  submittedBy: string;
  score: number;
}

export async function getEdgeIdea(_ideaId: string): Promise<EdgeIdea> {
  return {
    title: 'AI-Powered Customer Segmentation',
    problem: 'Manual customer segmentation is time-consuming and often inaccurate, leading to misaligned marketing efforts.',
    solution: 'Implement ML-based customer clustering that automatically segments users based on behavior patterns.',
    submittedBy: 'Sarah Chen',
    score: 92,
  };
}

// ── Edge List ───────────────────────────────

export interface EdgeItem {
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

export async function getEdges(): Promise<EdgeItem[]> {
  return [
    { id: '1', ideaId: '1', ideaTitle: 'AI-Powered Customer Segmentation', status: 'complete', outcomesCount: 2, metricsCount: 4, confidence: 'high', owner: 'Sarah Chen', updatedAt: '2024-02-28' },
    { id: '2', ideaId: '2', ideaTitle: 'Automated Report Generation', status: 'complete', outcomesCount: 3, metricsCount: 5, confidence: 'medium', owner: 'Mike Thompson', updatedAt: '2024-02-25' },
    { id: '3', ideaId: '3', ideaTitle: 'Predictive Maintenance System', status: 'draft', outcomesCount: 1, metricsCount: 2, confidence: 'low', owner: 'Emily Rodriguez', updatedAt: '2024-02-20' },
    { id: '4', ideaId: '4', ideaTitle: 'Real-time Analytics Dashboard', status: 'complete', outcomesCount: 2, metricsCount: 3, confidence: 'high', owner: 'David Kim', updatedAt: '2024-02-18' },
    { id: '5', ideaId: '5', ideaTitle: 'Smart Inventory Optimization', status: 'missing', outcomesCount: 0, metricsCount: 0, confidence: null, owner: '', updatedAt: '' },
  ];
}

// ── Account ─────────────────────────────────

export interface AccountData {
  company: {
    name: string;
    plan: string;
    planStatus: string;
    nextBilling: string;
    seats: number;
    usedSeats: number;
  };
  usage: {
    projects: { current: number; limit: number };
    ideas: { current: number; limit: number };
    storage: { current: number; limit: number };
    aiCredits: { current: number; limit: number };
  };
  health: { score: number; status: string; lastActivity: string; activeUsers: number };
  recentActivity: { type: string; description: string; time: string }[];
}

export async function getAccountData(): Promise<AccountData> {
  return {
    company: {
      name: 'Acme Corporation',
      plan: 'Business',
      planStatus: 'active',
      nextBilling: '2025-01-15',
      seats: 25,
      usedSeats: 18,
    },
    usage: {
      projects: { current: 12, limit: 50 },
      ideas: { current: 47, limit: 200 },
      storage: { current: 2.4, limit: 10 },
      aiCredits: { current: 850, limit: 1000 },
    },
    health: { score: 92, status: 'excellent', lastActivity: '2 hours ago', activeUsers: 14 },
    recentActivity: [
      { type: 'user_added', description: 'Sarah Chen joined the team', time: '2 hours ago' },
      { type: 'project_created', description: 'New project "Q1 Analytics Dashboard" created', time: '5 hours ago' },
      { type: 'billing', description: 'Invoice #2024-089 paid successfully', time: '2 days ago' },
    ],
  };
}

// ── Profile ─────────────────────────────────

export interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  bio: string;
}

export const allStrengths = ['Strategic Planning', 'Data Analysis', 'Stakeholder Management', 'Agile Methods', 'Team Leadership', 'Risk Management', 'Budget Planning', 'Technical Writing', 'User Research', 'Prototyping'];

export async function getProfileData(): Promise<ProfileData> {
  return {
    firstName: 'Alex',
    lastName: 'Thompson',
    email: 'alex.thompson@company.com',
    phone: '+1 (555) 123-4567',
    role: 'Product Manager',
    department: 'Product',
    bio: 'Passionate about building products that solve real problems.',
  };
}

// ── Company Settings ────────────────────────

export interface CompanySettingsData {
  name: string;
  domain: string;
  industry: string;
  size: string;
  timezone: string;
  language: string;
  enforceSSO: boolean;
  twoFactor: boolean;
  ipWhitelist: boolean;
  dataRetention: string;
}

export async function getCompanySettings(): Promise<CompanySettingsData> {
  return {
    name: 'Acme Corporation',
    domain: 'acmecorp.com',
    industry: 'Technology',
    size: '51-200',
    timezone: 'America/New_York',
    language: 'English',
    enforceSSO: false,
    twoFactor: true,
    ipWhitelist: false,
    dataRetention: '12 months',
  };
}

// ── Manage Users ────────────────────────────

export interface UserData {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'member' | 'viewer';
  department: string;
  status: 'active' | 'pending' | 'deactivated';
  lastActive: string;
}

export async function getUsers(): Promise<UserData[]> {
  return [
    { id: '1', name: 'Sarah Chen', email: 'sarah@acmecorp.com', role: 'admin', department: 'Engineering', status: 'active', lastActive: '2 hours ago' },
    { id: '2', name: 'Marcus Johnson', email: 'marcus@acmecorp.com', role: 'manager', department: 'Product', status: 'active', lastActive: '30 min ago' },
    { id: '3', name: 'Emily Rodriguez', email: 'emily@acmecorp.com', role: 'member', department: 'Design', status: 'active', lastActive: '1 hour ago' },
    { id: '4', name: 'David Park', email: 'david@acmecorp.com', role: 'member', department: 'Engineering', status: 'active', lastActive: '4 hours ago' },
    { id: '5', name: 'Lisa Wang', email: 'lisa@acmecorp.com', role: 'viewer', department: 'Sales', status: 'active', lastActive: '1 day ago' },
    { id: '6', name: 'Alex Thompson', email: 'alex@acmecorp.com', role: 'member', department: 'Product', status: 'pending', lastActive: '' },
    { id: '7', name: 'James Miller', email: 'james@acmecorp.com', role: 'member', department: 'Engineering', status: 'deactivated', lastActive: '1 week ago' },
  ];
}

// ── Activity Feed ───────────────────────────

export interface ActivityItem {
  id: string;
  type: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  score?: number;
  status?: string;
  comment?: string;
}

export async function getActivityFeed(): Promise<ActivityItem[]> {
  return [
    { id: '1', type: 'idea_scored', actor: 'Sarah Chen', action: 'scored', target: 'AI-Powered Customer Support Bot', timestamp: '10 minutes ago', score: 87 },
    { id: '2', type: 'task_completed', actor: 'Marcus Johnson', action: 'completed task', target: 'Design system audit', timestamp: '25 minutes ago' },
    { id: '3', type: 'idea_created', actor: 'Emily Rodriguez', action: 'submitted new idea', target: 'Mobile App Redesign', timestamp: '1 hour ago' },
    { id: '4', type: 'comment_added', actor: 'David Park', action: 'commented on', target: 'Q1 Analytics Dashboard', timestamp: '2 hours ago', comment: 'Great progress on the charts!' },
    { id: '5', type: 'user_joined', actor: 'Alex Thompson', action: 'joined the team', target: 'Product Innovation', timestamp: '3 hours ago' },
    { id: '6', type: 'status_changed', actor: 'Lisa Wang', action: 'changed status of', target: 'Customer Feedback Portal', timestamp: '4 hours ago', status: 'In Progress' },
    { id: '7', type: 'idea_converted', actor: 'James Miller', action: 'converted idea to project', target: 'Automated Testing Framework', timestamp: '5 hours ago' },
    { id: '8', type: 'project_created', actor: 'Sarah Chen', action: 'created new project', target: 'Performance Optimization Initiative', timestamp: '6 hours ago' },
    { id: '9', type: 'task_completed', actor: 'Emily Rodriguez', action: 'completed task', target: 'API documentation update', timestamp: 'Yesterday' },
    { id: '10', type: 'idea_scored', actor: 'Marcus Johnson', action: 'scored', target: 'Data Pipeline Modernization', timestamp: 'Yesterday', score: 92 },
  ];
}

// ── Notification Settings ───────────────────

export interface NotificationPref {
  id: string;
  label: string;
  description: string;
  email: boolean;
  push: boolean;
}

export interface NotificationCategory {
  id: string;
  label: string;
  icon: string;  // icon function name
  prefs: NotificationPref[];
}

export async function getNotificationCategories(): Promise<NotificationCategory[]> {
  return [
    {
      id: 'ideas', label: 'Ideas', icon: 'lightbulb',
      prefs: [
        { id: 'idea_submitted', label: 'New idea submitted', description: 'When someone submits a new idea', email: true, push: true },
        { id: 'idea_scored', label: 'Idea scored', description: 'When an idea receives an AI score', email: true, push: false },
        { id: 'idea_converted', label: 'Idea converted to project', description: 'When an idea becomes a project', email: true, push: true },
        { id: 'idea_comment', label: 'Comment on your idea', description: 'When someone comments on your idea', email: true, push: true },
      ],
    },
    {
      id: 'projects', label: 'Projects', icon: 'folderKanban',
      prefs: [
        { id: 'project_created', label: 'New project created', description: 'When a new project is started', email: true, push: false },
        { id: 'task_assigned', label: 'Task assigned to you', description: 'When you are assigned a new task', email: true, push: true },
        { id: 'task_completed', label: 'Task completed', description: 'When a task in your project is completed', email: false, push: false },
        { id: 'project_status', label: 'Project status changed', description: 'When a project status is updated', email: true, push: false },
      ],
    },
    {
      id: 'teams', label: 'Teams', icon: 'users',
      prefs: [
        { id: 'team_invite', label: 'Team invitation', description: 'When you are invited to join a team', email: true, push: true },
        { id: 'member_joined', label: 'New team member', description: 'When someone joins your team', email: true, push: false },
        { id: 'member_left', label: 'Team member left', description: 'When someone leaves your team', email: true, push: false },
        { id: 'team_mention', label: 'Team mention', description: 'When your team is mentioned', email: false, push: true },
      ],
    },
    {
      id: 'account', label: 'Account', icon: 'user',
      prefs: [
        { id: 'security_alert', label: 'Security alerts', description: 'Important security notifications', email: true, push: true },
        { id: 'billing_reminder', label: 'Billing reminders', description: 'Upcoming payment reminders', email: true, push: false },
        { id: 'usage_limit', label: 'Usage limit warnings', description: 'When approaching plan limits', email: true, push: true },
        { id: 'weekly_digest', label: 'Weekly activity digest', description: 'Summary of weekly activity', email: true, push: false },
      ],
    },
  ];
}

// ── Crunch ───────────────────────────────────

export interface CrunchColumn {
  id: string;
  originalName: string;
  friendlyName: string;
  dataType: string;
  description: string;
  sampleValues: string[];
  isAcronym: boolean;
  acronymExpansion: string;
}

export async function getCrunchColumns(): Promise<CrunchColumn[]> {
  return [
    { id: '1', originalName: 'CUST_ID', friendlyName: '', dataType: 'text', description: '', sampleValues: ['C001', 'C002', 'C003'], isAcronym: true, acronymExpansion: '' },
    { id: '2', originalName: 'TXN_DT', friendlyName: '', dataType: 'date', description: '', sampleValues: ['2024-01-15', '2024-01-16', '2024-01-17'], isAcronym: true, acronymExpansion: '' },
    { id: '3', originalName: 'AMT', friendlyName: '', dataType: 'number', description: '', sampleValues: ['150.00', '299.99', '75.50'], isAcronym: true, acronymExpansion: '' },
    { id: '4', originalName: 'PROD_CAT', friendlyName: '', dataType: 'text', description: '', sampleValues: ['Electronics', 'Apparel', 'Home'], isAcronym: true, acronymExpansion: '' },
    { id: '5', originalName: 'REP_ID', friendlyName: '', dataType: 'text', description: '', sampleValues: ['R101', 'R102', 'R103'], isAcronym: true, acronymExpansion: '' },
    { id: '6', originalName: 'STATUS', friendlyName: '', dataType: 'text', description: '', sampleValues: ['COMP', 'PEND', 'CANC'], isAcronym: false, acronymExpansion: '' },
  ];
}

// ── Flow ─────────────────────────────────────

export interface ProcessStep {
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

export interface FlowData {
  processName: string;
  processDescription: string;
  processDepartment: string;
  steps: ProcessStep[];
}

export async function getFlowData(): Promise<FlowData> {
  return {
    processName: 'Customer Onboarding',
    processDescription: 'End-to-end process for onboarding new enterprise customers',
    processDepartment: 'Customer Success',
    steps: [
      { id: '1', title: 'Receive signed contract', description: 'Sales team sends signed contract to customer success inbox', owner: 'Sales Team', role: 'Account Executive', tools: ['Email', 'Document'], duration: 'Immediate', order: 1, type: 'start' },
      { id: '2', title: 'Create customer record', description: 'Enter customer details in CRM and create project folder', owner: 'Customer Success', role: 'CS Manager', tools: ['Database', 'Files'], duration: '15 minutes', order: 2, type: 'action' },
      { id: '3', title: 'Schedule kickoff call', description: 'Reach out to customer to schedule implementation kickoff', owner: 'Customer Success', role: 'Implementation Specialist', tools: ['Email', 'Phone'], duration: '1 day', order: 3, type: 'action' },
      { id: '4', title: 'Conduct kickoff meeting', description: 'Review goals, timeline, and assign customer contacts', owner: 'Customer Success', role: 'Implementation Specialist', tools: ['Chat', 'Document'], duration: '1 hour', order: 4, type: 'action' },
      { id: '5', title: 'Technical setup complete', description: 'Engineering confirms environment is ready for customer use', owner: 'Engineering', role: 'Solutions Engineer', tools: ['Database', 'Website'], duration: '2 days', order: 5, type: 'action' },
    ],
  };
}

// ── Engineering Requirements ─────────────────

export interface Clarification {
  id: string;
  question: string;
  askedBy: string;
  askedAt: string;
  status: 'pending' | 'answered';
  answer?: string;
  answeredBy?: string;
  answeredAt?: string;
}

export interface EngineeringProject {
  id: string;
  title: string;
  description: string;
  businessContext: {
    problem: string;
    expectedOutcome: string;
    successMetrics: string[];
    constraints: string[];
  };
  team: { id: string; name: string; role: string; type: string }[];
  linkedIdea: { id: string; title: string; score: number };
  timeline: string;
  budget: string;
}

export async function getEngineeringProject(_projectId: string): Promise<EngineeringProject> {
  return {
    id: '1',
    title: 'AI-Powered Customer Segmentation',
    description: 'Implement machine learning model to automatically segment customers based on behavior, purchase history, and engagement patterns.',
    businessContext: {
      problem: "Current manual segmentation takes 2 weeks and is often outdated by the time it's complete. Marketing campaigns suffer from poor targeting.",
      expectedOutcome: 'Real-time customer segments that update automatically, enabling personalized marketing with 40% better conversion rates.',
      successMetrics: [
        'Reduce segmentation time from 2 weeks to real-time',
        'Improve campaign conversion rates by 40%',
        'Increase customer lifetime value by 25%',
      ],
      constraints: [
        'Must integrate with existing CRM (Salesforce)',
        'GDPR compliance required for EU customers',
        'Budget capped at $50,000 for Phase 1',
      ],
    },
    team: [
      { id: '1', name: 'Sarah Chen', role: 'Project Lead', type: 'business' },
      { id: '2', name: 'Mike Thompson', role: 'ML Engineer', type: 'engineering' },
      { id: '3', name: 'Jessica Park', role: 'Data Scientist', type: 'engineering' },
      { id: '4', name: 'David Martinez', role: 'Backend Developer', type: 'engineering' },
    ],
    linkedIdea: { id: '1', title: 'AI-Powered Customer Segmentation', score: 92 },
    timeline: '3-4 months',
    budget: '$45,000',
  };
}

export async function getClarifications(_projectId: string): Promise<Clarification[]> {
  return [
    {
      id: '1',
      question: 'What data sources are currently available for customer behavior tracking? We need to understand the data pipeline before designing the ML model.',
      askedBy: 'Mike Thompson', askedAt: '2024-02-20', status: 'answered',
      answer: 'We have event tracking via Segment, transaction data in our data warehouse (Snowflake), and email engagement metrics from Mailchimp. All can be accessed via APIs.',
      answeredBy: 'Sarah Chen', answeredAt: '2024-02-21',
    },
    {
      id: '2',
      question: 'Are there any existing segment definitions we should match, or are we free to discover optimal segments through clustering?',
      askedBy: 'Jessica Park', askedAt: '2024-02-22', status: 'answered',
      answer: "Marketing has 5 legacy segments they use today (High Value, Growth, At-Risk, New, Dormant). We'd like to preserve compatibility but welcome additional discovered segments.",
      answeredBy: 'Sarah Chen', answeredAt: '2024-02-22',
    },
    {
      id: '3',
      question: "What's the expected latency requirement for segment updates? Real-time vs batch processing has significant architecture implications.",
      askedBy: 'David Martinez', askedAt: '2024-02-25', status: 'pending',
    },
  ];
}

// ── Idea Review Queue ───────────────────────

export interface ReviewIdea {
  id: string;
  title: string;
  submittedBy: string;
  priority: 'high' | 'medium' | 'low';
  readiness: 'ready' | 'needs-info' | 'incomplete';
  edgeStatus: 'complete' | 'draft' | 'missing';
  score: number;
  impact: string;
  effort: string;
  waitingDays: number;
  category: string;
}

export async function getReviewQueue(): Promise<ReviewIdea[]> {
  return [
    { id: '1', title: 'AI-Powered Customer Support Chatbot', submittedBy: 'Sarah Chen', priority: 'high', readiness: 'ready', edgeStatus: 'complete', score: 87, impact: 'High', effort: 'Medium', waitingDays: 3, category: 'Customer Experience' },
    { id: '2', title: 'Mobile App Push Notification Revamp', submittedBy: 'Marcus Johnson', priority: 'high', readiness: 'needs-info', edgeStatus: 'draft', score: 72, impact: 'Medium', effort: 'Low', waitingDays: 4, category: 'Product' },
    { id: '3', title: 'Sustainability Dashboard for Operations', submittedBy: 'Emily Rodriguez', priority: 'medium', readiness: 'ready', edgeStatus: 'complete', score: 81, impact: 'High', effort: 'High', waitingDays: 6, category: 'Operations' },
    { id: '4', title: 'Employee Wellness Program Integration', submittedBy: 'David Kim', priority: 'low', readiness: 'incomplete', edgeStatus: 'missing', score: 45, impact: 'Medium', effort: 'Medium', waitingDays: 8, category: 'HR' },
    { id: '5', title: 'Real-time Inventory Tracking System', submittedBy: 'Lisa Wang', priority: 'high', readiness: 'ready', edgeStatus: 'complete', score: 91, impact: 'High', effort: 'Medium', waitingDays: 5, category: 'Operations' },
  ];
}

// ── Idea Scoring ────────────────────────────

export interface ScoreBreakdown {
  label: string;
  score: number;
  maxScore: number;
  reason: string;
}

export interface IdeaScore {
  overall: number;
  impact: { score: number; breakdown: ScoreBreakdown[] };
  feasibility: { score: number; breakdown: ScoreBreakdown[] };
  efficiency: { score: number; breakdown: ScoreBreakdown[] };
  estimatedTime: string;
  estimatedCost: string;
  recommendation: string;
}

export async function getIdeaForScoring(_ideaId: string): Promise<{ title: string; problemStatement: string }> {
  return {
    title: 'AI-Powered Customer Segmentation',
    problemStatement: 'Marketing team spends 20+ hours weekly manually segmenting customers, leading to delayed campaigns and missed opportunities.',
  };
}

export async function getIdeaScore(_ideaId: string): Promise<IdeaScore> {
  return {
    overall: 82,
    impact: {
      score: 88,
      breakdown: [
        { label: 'Business Value', score: 9, maxScore: 10, reason: 'Direct revenue impact through improved conversions' },
        { label: 'Strategic Alignment', score: 8, maxScore: 10, reason: 'Supports digital transformation goals' },
        { label: 'User Benefit', score: 9, maxScore: 10, reason: 'Saves significant time for marketing team' },
      ],
    },
    feasibility: {
      score: 75,
      breakdown: [
        { label: 'Technical Complexity', score: 7, maxScore: 10, reason: 'Requires ML expertise and data pipeline' },
        { label: 'Resource Availability', score: 8, maxScore: 10, reason: 'Team has relevant skills' },
        { label: 'Integration Effort', score: 8, maxScore: 10, reason: 'Works with existing CRM' },
      ],
    },
    efficiency: {
      score: 85,
      breakdown: [
        { label: 'Time to Value', score: 9, maxScore: 10, reason: 'MVP deliverable in 6-8 weeks' },
        { label: 'Cost Efficiency', score: 8, maxScore: 10, reason: 'Reasonable investment for expected returns' },
        { label: 'Scalability', score: 9, maxScore: 10, reason: 'Can expand to other use cases' },
      ],
    },
    estimatedTime: '6-8 weeks',
    estimatedCost: '$45,000 - $65,000',
    recommendation: 'Strong candidate for immediate prioritization. High impact with manageable complexity. Recommend starting with a focused pilot on top customer segment.',
  };
}

// ── Idea Convert ────────────────────────────

export interface ConvertIdea {
  id: string;
  title: string;
  problemStatement: string;
  proposedSolution: string;
  expectedOutcome: string;
  score: number;
  estimatedTime: string;
  estimatedCost: string;
}

export async function getIdeaForConversion(_ideaId: string): Promise<ConvertIdea> {
  return {
    id: '1',
    title: 'AI-Powered Customer Segmentation',
    problemStatement: 'Marketing team spends 20+ hours weekly manually segmenting customers.',
    proposedSolution: 'Implement machine learning model to automatically segment customers.',
    expectedOutcome: 'Reduce segmentation time by 80% and increase conversion rates by 25%.',
    score: 82,
    estimatedTime: '6-8 weeks',
    estimatedCost: '$45,000 - $65,000',
  };
}

// ── Approval Detail ─────────────────────────

export interface ApprovalIdea {
  id: string;
  title: string;
  description: string;
  submittedBy: string;
  submittedAt: string;
  priority: string;
  score: number;
  category: string;
  impact: { level: string; description: string };
  effort: { level: string; timeEstimate: string; teamSize: string };
  cost: { estimate: string; breakdown: string };
  risks: { title: string; severity: 'high' | 'medium' | 'low'; mitigation: string }[];
  assumptions: string[];
  alignments: string[];
}

export interface ApprovalEdge {
  outcomes: { id: string; description: string; metrics: { id: string; name: string; target: string; unit: string }[] }[];
  impact: { shortTerm: string; midTerm: string; longTerm: string };
  confidence: 'high' | 'medium' | 'low';
  owner: string;
}

export async function getApprovalIdea(_id: string): Promise<ApprovalIdea> {
  return {
    id: '1',
    title: 'AI-Powered Customer Support Chatbot',
    description: 'Implement an intelligent chatbot using GPT-4 to handle tier-1 customer support inquiries. The system would integrate with our existing helpdesk platform and learn from historical ticket data to provide accurate, context-aware responses.',
    submittedBy: 'Sarah Chen',
    submittedAt: 'January 15, 2024',
    priority: 'high',
    score: 87,
    category: 'Customer Experience',
    impact: { level: 'High', description: 'Expected to reduce support ticket volume by 40% and improve first-response time from 4 hours to under 1 minute for common inquiries.' },
    effort: { level: 'Medium', timeEstimate: '3-4 months', teamSize: '4-5 engineers' },
    cost: { estimate: '$120,000 - $150,000', breakdown: 'Development: $80K, API costs: $20K/year, Training: $10K' },
    risks: [
      { title: 'AI response accuracy', severity: 'high', mitigation: 'Implement human escalation for low-confidence responses and continuous training loop' },
      { title: 'Integration complexity', severity: 'medium', mitigation: 'Phase rollout starting with FAQ-only queries before expanding scope' },
      { title: 'Customer acceptance', severity: 'low', mitigation: 'Clear bot identification and easy handoff to human agents' },
    ],
    assumptions: [
      'Current helpdesk API supports required integrations',
      'Historical ticket data is clean and categorizable',
      'Legal has approved AI usage for customer interactions',
    ],
    alignments: [
      'Q1 OKR: Improve customer satisfaction score by 15%',
      'Digital transformation initiative',
      'Cost optimization program',
    ],
  };
}

export async function getApprovalEdge(_id: string): Promise<ApprovalEdge> {
  return {
    outcomes: [
      { id: '1', description: 'Reduce support ticket volume', metrics: [{ id: '1', name: 'Ticket Reduction', target: '40', unit: '%' }, { id: '2', name: 'First Response Time', target: '1', unit: 'min' }] },
      { id: '2', description: 'Improve customer satisfaction', metrics: [{ id: '3', name: 'CSAT Score', target: '4.5', unit: '/5' }, { id: '4', name: 'Resolution Rate', target: '85', unit: '%' }] },
    ],
    impact: { shortTerm: 'Handle 60% of tier-1 inquiries automatically. Reduce agent workload significantly.', midTerm: '40% reduction in support costs. Improved 24/7 availability for customers.', longTerm: 'Full self-service capability for common issues. Agents focus on complex cases only.' },
    confidence: 'high',
    owner: 'Sarah Chen',
  };
}

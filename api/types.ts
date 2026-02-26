// ============================================
// FUSION AI — API Type Definitions
// Row types (snake_case), shared type aliases,
// and utility functions.
// ============================================

// ── Shared Type Aliases ─────────────────────

/** Semantic alias for entity ID strings used as map keys and function params. */
export type Id = string;

/** Confidence level used across Edge, ideas, and projects. */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** Edge definition completion status. */
export type EdgeStatus = 'complete' | 'draft' | 'missing';

/** Idea lifecycle status. */
export type IdeaStatus = 'draft' | 'scored' | 'pending_review' | 'approved' | 'rejected';

/** Stored boolean in localStorage (0 or 1 integer). */
export type StoredBoolean = 0 | 1;

// ── Utility ──────────────────────────────────

/** Convert 0/1/boolean to boolean (handles localStorage int vs JSON boolean). */
export function toBool(value: unknown): boolean {
  return value === 1 || value === true;
}

// ── Entity Types ─────────────────────────────

export interface UserEntity {
  id: Id;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  department: string;
  status: string;
  availability: number;
  performance_score: number;
  projects_completed: number;
  current_projects: number;
  strengths: string; // JSON array
  team_dimensions: string; // JSON object
  phone: string;
  bio: string;
  last_active: string;
}

/** Domain object wrapping a UserEntity with camelCase accessors. */
export class User {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly role: string;
  readonly department: string;
  readonly status: string;
  readonly availability: number;
  readonly performanceScore: number;
  readonly projectsCompleted: number;
  readonly currentProjects: number;
  readonly strengths: string;
  readonly teamDimensions: string;
  readonly phone: string;
  readonly bio: string;
  readonly lastActive: string;

  constructor(entity: UserEntity) {
    this.id = entity.id;
    this.firstName = entity.first_name;
    this.lastName = entity.last_name;
    this.email = entity.email;
    this.role = entity.role;
    this.department = entity.department;
    this.status = entity.status;
    this.availability = entity.availability;
    this.performanceScore = entity.performance_score;
    this.projectsCompleted = entity.projects_completed;
    this.currentProjects = entity.current_projects;
    this.strengths = entity.strengths;
    this.teamDimensions = entity.team_dimensions;
    this.phone = entity.phone;
    this.bio = entity.bio;
    this.lastActive = entity.last_active;
  }

  fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }
}

export interface IdeaEntity {
  id: Id;
  title: string;
  score: number;
  estimated_impact: number;
  estimated_time: number;
  estimated_cost: number;
  priority: number;
  status: IdeaStatus;
  submitted_by_id: Id;
  edge_status: string;
  problem_statement: string;
  proposed_solution: string;
  expected_outcome: string;
  category: string;
  readiness: string;
  waiting_days: number;
  impact_label: string;
  effort_label: string;
  description: string;
  submitted_at: string;
  risks: string; // JSON array
  assumptions: string; // JSON array
  alignments: string; // JSON array
  effort_time_estimate: string;
  effort_team_size: string;
  cost_estimate: string;
  cost_breakdown: string;
}

export interface IdeaScoreEntity {
  id: Id;
  idea_id: Id;
  overall: number;
  impact_score: number;
  impact_breakdown: string; // JSON array
  feasibility_score: number;
  feasibility_breakdown: string; // JSON array
  efficiency_score: number;
  efficiency_breakdown: string; // JSON array
  estimated_time: string;
  estimated_cost: string;
  recommendation: string;
}

export interface ProjectEntity {
  id: Id;
  title: string;
  description: string;
  status: string;
  progress: number;
  start_date: string;
  target_end_date: string;
  lead_id: Id;
  estimated_time: number;
  actual_time: number;
  estimated_cost: number;
  actual_cost: number;
  estimated_impact: number;
  actual_impact: number;
  priority: number;
  priority_score: number;
  linked_idea_id: Id;
  business_context: string; // JSON object
  timeline_label: string;
  budget_label: string;
}

export interface ProjectTeamEntity {
  id: Id;
  project_id: Id;
  user_id: Id;
  role: string;
  type: string;
}

export interface MilestoneEntity {
  id: Id;
  project_id: Id;
  title: string;
  status: string;
  date: string;
  sort_order: number;
}

export interface ProjectTaskEntity {
  id: Id;
  project_id: Id;
  name: string;
  priority: string;
  description: string;
  skills: string; // JSON array
  hours: number;
  assigned_to_id: Id;
}

export interface DiscussionEntity {
  id: Id;
  project_id: Id;
  author_id: Id;
  date: string;
  message: string;
}

export interface ProjectVersionEntity {
  id: Id;
  project_id: Id;
  version: string;
  date: string;
  changes: string;
  author_id: Id;
}

export interface EdgeEntity {
  id: Id;
  idea_id: Id;
  status: EdgeStatus;
  confidence: ConfidenceLevel | '';
  owner_id: Id;
  impact_short_term: string;
  impact_mid_term: string;
  impact_long_term: string;
  updated_at: string;
}

export interface EdgeOutcomeEntity {
  id: Id;
  edge_id: Id;
  description: string;
}

export interface EdgeMetricEntity {
  id: Id;
  outcome_id: Id;
  name: string;
  target: string;
  unit: string;
  current: string;
}

export interface ActivityEntity {
  id: Id;
  type: string;
  actor_id: Id;
  action: string;
  target: string;
  timestamp: string;
  score: number | null;
  status: string | null;
  comment: string | null;
}

export interface NotificationEntity {
  id: Id;
  title: string;
  message: string;
  time: string;
  is_unread: StoredBoolean;
}

export interface ClarificationEntity {
  id: Id;
  project_id: Id;
  question: string;
  asked_by_id: Id;
  asked_at: string;
  status: string;
  answer: string | null;
  answered_by_id: Id | null;
  answered_at: string | null;
}

export interface CrunchColumnEntity {
  id: Id;
  original_name: string;
  friendly_name: string;
  data_type: string;
  description: string;
  sample_values: string; // JSON array
  is_acronym: StoredBoolean;
  acronym_expansion: string;
}

export interface ProcessEntity {
  id: Id;
  name: string;
  description: string;
  department: string;
}

export interface ProcessStepEntity {
  id: Id;
  process_id: Id;
  title: string;
  description: string;
  owner: string;
  role: string;
  tools: string; // JSON array
  duration: string;
  sort_order: number;
  type: string;
}

export interface CompanySettingsEntity {
  id: Id;
  name: string;
  domain: string;
  industry: string;
  size: string;
  timezone: string;
  language: string;
  is_sso_enforced: StoredBoolean;
  is_two_factor_enabled: StoredBoolean;
  is_ip_whitelist_enabled: StoredBoolean;
  data_retention: string;
}

export interface NotificationCategoryEntity {
  id: Id;
  label: string;
  icon: string;
}

export interface NotificationPreferenceEntity {
  id: Id;
  category_id: Id;
  label: string;
  description: string;
  is_email_enabled: StoredBoolean;
  is_push_enabled: StoredBoolean;
}

export interface AccountEntity {
  id: Id;
  plan: string;
  plan_status: string;
  next_billing: string;
  seats: number;
  used_seats: number;
  projects_limit: number;
  projects_current: number;
  ideas_limit: number;
  ideas_current: number;
  storage_limit: number;
  storage_current: number;
  ai_credits_limit: number;
  ai_credits_current: number;
  health_score: number;
  health_status: string;
  last_activity: string;
  active_users: number;
}

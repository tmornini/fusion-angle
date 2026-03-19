export type Id = string;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type PriorityLevel = 'high' | 'medium' | 'low';

export type EdgeStatus = 'complete' | 'draft' | 'missing';

export type FlowStepType =
    | 'action'
    | 'decision'
    | 'start'
    | 'end';

export type ClarificationStatus =
    | 'pending'
    | 'answered';

export type IdeaStatus =
    | 'active'
    | 'in-review'
    | 'approved'
    | 'promoted'
    | 'archived'
    | 'deleted';

export type ProjectStatus =
    | 'submitted'
    | 'under-review'
    | 'sent-back'
    | 'approved'
    | 'declined'
    | 'completed'
    | 'deleted';

export const SCORE_THRESHOLD_HIGH = 80;
export const SCORE_THRESHOLD_MEDIUM = 60;

export const SCORE_BADGE_HIGH = 85;
export const SCORE_BADGE_MEDIUM = 70;

export const AVAILABILITY_HIGH = 70;
export const AVAILABILITY_LOW = 40;

export function computePriority(
    score: number,
): PriorityLevel {
    if (score >= SCORE_THRESHOLD_HIGH)
        return 'high';
    if (score >= SCORE_THRESHOLD_MEDIUM)
        return 'medium';
    return 'low';
}

export type StoredBoolean = 0 | 1;

/** Convert 0/1/boolean to boolean.
 *  Handles localStorage int vs JSON bool.
 */
export function toBool(
    value: unknown,
): boolean {
    return value === 1
        || value === true;
}

function includes<T extends string>(
    values: readonly T[],
    v: string,
): v is T {
    return (values as readonly string[])
        .includes(v);
}

const CONFIDENCE_LEVELS:
    readonly ConfidenceLevel[]
    = ['high', 'medium', 'low'];

export function isConfidenceLevel(
    v: string,
): v is ConfidenceLevel {
    return includes(
        CONFIDENCE_LEVELS, v,
    );
}

const FLOW_STEP_TYPES:
    readonly FlowStepType[]
    = [
        'action', 'decision',
        'start', 'end',
    ];

export function isFlowStepType(
    v: string,
): v is FlowStepType {
    return includes(
        FLOW_STEP_TYPES, v,
    );
}

const PROJECT_STATUSES:
    readonly ProjectStatus[]
    = [
        'submitted', 'under-review',
        'sent-back', 'approved',
        'declined', 'completed',
        'deleted',
    ];

export function isProjectStatus(
    v: string,
): v is ProjectStatus {
    return includes(
        PROJECT_STATUSES, v,
    );
}

const IDEA_STATUSES:
    readonly IdeaStatus[]
    = [
        'active', 'in-review',
        'approved', 'promoted',
        'archived', 'deleted',
    ];

export function isIdeaStatus(
    v: string,
): v is IdeaStatus {
    return includes(
        IDEA_STATUSES, v,
    );
}

const EDGE_STATUSES:
    readonly EdgeStatus[]
    = ['complete', 'draft', 'missing'];

export function isEdgeStatus(
    v: string,
): v is EdgeStatus {
    return includes(
        EDGE_STATUSES, v,
    );
}

export const SECONDS_PER_DAY = 86400;

export function durationInDays(
    seconds: number,
): number {
    return Math.ceil(seconds / SECONDS_PER_DAY);
}

export function formatCompactCurrency(
    value: number,
): string {
    if (value >= 1_000_000_000)
        return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000)
        return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000)
        return `$${Math.round(value / 1_000)}K`;
    return `$${value}`;
}

/**
 * Returns current UTC time as RFC-3339 Zulu
 * with microsecond resolution.
 */
export function nowUtc(): string {
    const iso = new Date().toISOString();
    // toISOString gives 3 decimal places;
    // pad to 6 for microsecond resolution
    return iso.replace(
        /\.(\d{3})Z$/,
        '.$1000Z',
    );
}

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
  estimated_duration: number;
  estimated_cost: number;
  priority: number;
  status: IdeaStatus;
  submitted_by_id: Id;
  edge_status: EdgeStatus | 'incomplete';
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
  effort_duration_estimate: string;
  effort_team_size: string;
  cost_estimate: string;
  cost_breakdown: string;
  success_metrics: string;
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
  estimated_duration: string;
  estimated_cost: string;
  recommendation: string;
}

export interface ProjectEntity {
  id: Id;
  title: string;
  description: string;
  status: ProjectStatus;
  progress: number;
  start_date: string;
  target_end_date: string;
  lead_id: Id;
  estimated_duration: number; // seconds
  actual_duration: number; // seconds
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
  duration: number; // seconds
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
  confidence: ConfidenceLevel;
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
  score: number;
  status: string;
  comment: string;
}

export interface ClarificationEntity {
  id: Id;
  project_id: Id;
  question: string;
  asked_by_id: Id;
  asked_at: string;
  status: ClarificationStatus;
  answer: string;
  answered_by_id: Id;
  answered_at: string;
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

export interface FlowEntity {
  id: Id;
  name: string;
  description: string;
  department: string;
}

export interface FlowStepEntity {
  id: Id;
  process_id: Id;
  title: string;
  description: string;
  owner: string;
  role: string;
  tools: string; // JSON array
  duration: string;
  sort_order: number;
  type: FlowStepType;
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

export interface IdeaCreationFields {
    id: Id;
    title: string;
    submitted_by_id: Id;
    score?: number;
    estimated_impact?: number;
    estimated_duration?: number;
    estimated_cost?: number;
    priority?: number;
    status?: IdeaStatus;
    category?: string;
    description?: string;
    problem_statement?: string;
    proposed_solution?: string;
    expected_outcome?: string;
}

export function createIdea(
    fields: IdeaCreationFields,
): IdeaEntity {
    return {
        id: fields.id,
        title: fields.title,
        score: fields.score ?? 0,
        estimated_impact:
            fields.estimated_impact ?? 0,
        estimated_duration:
            fields.estimated_duration ?? 0,
        estimated_cost:
            fields.estimated_cost ?? 0,
        priority: fields.priority ?? 0,
        status: fields.status ?? 'active',
        submitted_by_id:
            fields.submitted_by_id,
        edge_status: 'missing',
        problem_statement:
            fields.problem_statement ?? '',
        proposed_solution:
            fields.proposed_solution ?? '',
        expected_outcome:
            fields.expected_outcome ?? '',
        category: fields.category ?? '',
        readiness: 'incomplete',
        waiting_days: 0,
        impact_label: '',
        effort_label: '',
        description:
            fields.description ?? '',
        submitted_at: nowUtc(),
        risks: '[]',
        assumptions: '[]',
        alignments: '[]',
        effort_duration_estimate: '',
        effort_team_size: '',
        cost_estimate: '',
        cost_breakdown: '',
        success_metrics: '',
    };
}

export interface ProjectCreationFields {
    id: Id;
    title: string;
    lead_id: Id;
    linked_idea_id?: Id;
    description?: string;
    status?: ProjectStatus;
    estimated_duration?: number;
    estimated_cost?: number;
    estimated_impact?: number;
}

export function createProject(
    fields: ProjectCreationFields,
): ProjectEntity {
    return {
        id: fields.id,
        title: fields.title,
        description:
            fields.description ?? '',
        status:
            fields.status ?? 'submitted',
        progress: 0,
        start_date: nowUtc(),
        target_end_date: '',
        lead_id: fields.lead_id,
        estimated_duration:
            fields.estimated_duration ?? 0,
        actual_duration: 0,
        estimated_cost:
            fields.estimated_cost ?? 0,
        actual_cost: 0,
        estimated_impact:
            fields.estimated_impact ?? 0,
        actual_impact: 0,
        priority: 0,
        priority_score: 0,
        linked_idea_id:
            fields.linked_idea_id ?? '',
        business_context: '{}',
        timeline_label: '',
        budget_label: '',
    };
}

export interface EdgeCreationFields {
    id: Id;
    idea_id: Id;
    owner_id: Id;
    status?: EdgeStatus;
    confidence?: ConfidenceLevel;
}

export function createEdge(
    fields: EdgeCreationFields,
): EdgeEntity {
    return {
        id: fields.id,
        idea_id: fields.idea_id,
        status: fields.status ?? 'draft',
        confidence:
            fields.confidence ?? 'medium',
        owner_id: fields.owner_id,
        impact_short_term: '',
        impact_mid_term: '',
        impact_long_term: '',
        updated_at: nowUtc(),
    };
}

export interface ActivityCreationFields {
    id: Id;
    type: string;
    actor_id: Id;
    action: string;
    target: string;
    score?: number;
    status?: string;
    comment?: string;
}

export function createActivity(
    fields: ActivityCreationFields,
): ActivityEntity {
    return {
        id: fields.id,
        type: fields.type,
        actor_id: fields.actor_id,
        action: fields.action,
        target: fields.target,
        timestamp: nowUtc(),
        score: fields.score ?? 0,
        status: fields.status ?? '',
        comment: fields.comment ?? '',
    };
}

export interface FlowCreationFields {
    id: Id;
    name: string;
    department: string;
    description?: string;
}

export function createFlow(
    fields: FlowCreationFields,
): FlowEntity {
    return {
        id: fields.id,
        name: fields.name,
        description:
            fields.description ?? '',
        department: fields.department,
    };
}

export interface FlowStepCreationFields {
    id: Id;
    process_id: Id;
    title: string;
    sort_order: number;
    type?: FlowStepType;
    description?: string;
    owner?: string;
    role?: string;
    tools?: string;
    duration?: string;
}

export function createFlowStep(
    fields: FlowStepCreationFields,
): FlowStepEntity {
    return {
        id: fields.id,
        process_id: fields.process_id,
        title: fields.title,
        description:
            fields.description ?? '',
        owner: fields.owner ?? '',
        role: fields.role ?? '',
        tools: fields.tools ?? '[]',
        duration: fields.duration ?? '',
        sort_order: fields.sort_order,
        type: fields.type ?? 'action',
    };
}

export interface StatusDisplay {
    label: string;
    className: string;
}

export const UNKNOWN_CONFIG: StatusDisplay = {
    label: 'Unknown',
    className: 'badge-default',
};

export const UNKNOWN_CONFIDENCE_CONFIG:
    StatusDisplay = {
        label: 'Unknown',
        className: 'text-muted',
    };

export const IDEA_STATUS_CONFIG: Record<
    IdeaStatus,
    StatusDisplay
> = {
    'active': {
        label: 'Active',
        className: 'badge-success',
    },
    'in-review': {
        label: 'In Review',
        className: 'badge-warning',
    },
    'approved': {
        label: 'Approved',
        className: 'badge-primary',
    },
    'promoted': {
        label: 'Promoted',
        className: 'badge-primary',
    },
    'archived': {
        label: 'Archived',
        className: 'badge-default',
    },
    'deleted': {
        label: 'Deleted',
        className: 'badge-default',
    },
};

export const EDGE_STATUS_CONFIG: Record<
    EdgeStatus | 'incomplete',
    StatusDisplay
> = {
    missing: {
        label: 'Edge Missing',
        className: 'badge-error',
    },
    incomplete: {
        label: 'Edge Missing',
        className: 'badge-error',
    },
    draft: {
        label: 'Edge Draft',
        className: 'badge-warning',
    },
    complete: {
        label: 'Edge Complete',
        className: 'badge-success',
    },
};

export const PROJECT_STATUS_CONFIG: Record<
    ProjectStatus,
    StatusDisplay
> = {
    'submitted': {
        label: 'Submitted',
        className: 'badge-default',
    },
    'under-review': {
        label: 'Under Review',
        className: 'badge-warning',
    },
    'sent-back': {
        label: 'Sent Back',
        className: 'badge-warning',
    },
    'approved': {
        label: 'Approved',
        className: 'badge-success',
    },
    'declined': {
        label: 'Declined',
        className: 'badge-error',
    },
    'completed': {
        label: 'Completed',
        className: 'badge-primary',
    },
    'deleted': {
        label: 'Deleted',
        className: 'badge-default',
    },
};

export const CONFIDENCE_CONFIG: Record<
    ConfidenceLevel,
    StatusDisplay
> = {
    high: {
        label: 'High',
        className: 'text-success',
    },
    medium: {
        label: 'Medium',
        className: 'text-warning',
    },
    low: {
        label: 'Low',
        className: 'text-error',
    },
};

export class Idea {
    readonly id: string;
    readonly title: string;
    readonly score: number;
    readonly estimatedImpact: number;
    readonly estimatedDuration: number;
    readonly estimatedCost: number;
    readonly priority: number;
    readonly status: IdeaStatus;
    readonly edgeStatus: EdgeStatus | 'incomplete';
    readonly submittedById: Id;
    readonly problemStatement: string;
    readonly proposedSolution: string;
    readonly expectedOutcome: string;
    readonly category: string;
    readonly readiness: string;
    readonly waitingDays: number;
    readonly impactLabel: string;
    readonly effortLabel: string;
    readonly description: string;
    readonly submittedAt: string;
    readonly risks: string;
    readonly assumptions: string;
    readonly alignments: string;
    readonly effortDurationEstimate: string;
    readonly effortTeamSize: string;
    readonly costEstimate: string;
    readonly costBreakdown: string;
    readonly successMetrics: string;
    readonly submittedBy: string;

    constructor(
        entity: IdeaEntity,
        submittedBy: string = 'Unknown',
    ) {
        this.id = entity.id;
        this.title = entity.title;
        this.score = entity.score;
        this.estimatedImpact =
            entity.estimated_impact;
        this.estimatedDuration =
            entity.estimated_duration;
        this.estimatedCost =
            entity.estimated_cost;
        this.priority = entity.priority;
        this.status = entity.status;
        this.edgeStatus =
            entity.edge_status || 'incomplete';
        this.submittedById =
            entity.submitted_by_id;
        this.problemStatement =
            entity.problem_statement;
        this.proposedSolution =
            entity.proposed_solution;
        this.expectedOutcome =
            entity.expected_outcome;
        this.category = entity.category;
        this.readiness = entity.readiness;
        this.waitingDays = entity.waiting_days;
        this.impactLabel = entity.impact_label;
        this.effortLabel = entity.effort_label;
        this.description = entity.description;
        this.submittedAt = entity.submitted_at;
        this.risks = entity.risks;
        this.assumptions = entity.assumptions;
        this.alignments = entity.alignments;
        this.effortDurationEstimate =
            entity.effort_duration_estimate;
        this.effortTeamSize =
            entity.effort_team_size;
        this.costEstimate = entity.cost_estimate;
        this.costBreakdown =
            entity.cost_breakdown;
        this.successMetrics =
            entity.success_metrics;
        this.submittedBy = submittedBy;
    }

    isDeleted(): boolean {
        return this.status === 'deleted';
    }

    isInReview(): boolean {
        return this.status === 'in-review';
    }

    isReviewable(): boolean {
        return this.status === 'in-review'
            && this.edgeStatus === 'complete';
    }

    isConvertible(): boolean {
        return this.status === 'approved';
    }

    needsEdgeDefinition(): boolean {
        return this.edgeStatus !== 'complete'
            && this.status === 'active';
    }

    durationInDays(): number {
        return Math.ceil(
            this.estimatedDuration
                / SECONDS_PER_DAY,
        );
    }

    resolvedScore(
        scoreOverride?: number,
    ): number {
        return scoreOverride ?? this.score;
    }

    priorityLevel(): PriorityLevel {
        return computePriority(this.score);
    }

    scoreStyle(): string {
        if (this.score >= SCORE_BADGE_HIGH)
            return 'color:hsl(var(--success))'
                + ';background:'
                + 'hsl(var(--success-soft))';
        if (this.score >= SCORE_BADGE_MEDIUM)
            return 'color:hsl(var(--warning))'
                + ';background:'
                + 'hsl(var(--warning-soft))';
        return 'color:hsl(var(--error))'
            + ';background:'
            + 'hsl(var(--error-soft))';
    }

    scoreColor(): string {
        if (this.score >= SCORE_THRESHOLD_HIGH)
            return 'color:hsl(var(--success))';
        if (this.score >= SCORE_THRESHOLD_MEDIUM)
            return 'color:hsl(var(--warning))';
        return 'color:hsl(var(--error))';
    }

    statusLabel(): string {
        return (
            IDEA_STATUS_CONFIG[this.status]
                ?? UNKNOWN_CONFIG
        ).label;
    }

    statusClassName(): string {
        return (
            IDEA_STATUS_CONFIG[this.status]
                ?? UNKNOWN_CONFIG
        ).className;
    }

    edgeStatusLabel(): string {
        return (
            EDGE_STATUS_CONFIG[this.edgeStatus]
                ?? UNKNOWN_CONFIG
        ).label;
    }

    edgeStatusClassName(): string {
        return (
            EDGE_STATUS_CONFIG[this.edgeStatus]
                ?? UNKNOWN_CONFIG
        ).className;
    }
}

export class Project {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly status: ProjectStatus;
    readonly progress: number;
    readonly startDate: string;
    readonly targetEndDate: string;
    readonly leadId: Id;
    readonly estimatedDuration: number;
    readonly actualDuration: number;
    readonly estimatedCost: number;
    readonly actualCost: number;
    readonly estimatedImpact: number;
    readonly actualImpact: number;
    readonly priority: number;
    readonly priorityScore: number;
    readonly linkedIdeaId: Id;
    readonly businessContext: string;
    readonly timelineLabel: string;
    readonly budgetLabel: string;

    constructor(entity: ProjectEntity) {
        this.id = entity.id;
        this.title = entity.title;
        this.description = entity.description;
        this.status = entity.status;
        this.progress = entity.progress;
        this.startDate = entity.start_date;
        this.targetEndDate =
            entity.target_end_date;
        this.leadId = entity.lead_id;
        this.estimatedDuration =
            entity.estimated_duration;
        this.actualDuration =
            entity.actual_duration;
        this.estimatedCost =
            entity.estimated_cost;
        this.actualCost = entity.actual_cost;
        this.estimatedImpact =
            entity.estimated_impact;
        this.actualImpact =
            entity.actual_impact;
        this.priority = entity.priority;
        this.priorityScore =
            entity.priority_score;
        this.linkedIdeaId =
            entity.linked_idea_id;
        this.businessContext =
            entity.business_context;
        this.timelineLabel =
            entity.timeline_label;
        this.budgetLabel = entity.budget_label;
    }

    isDeleted(): boolean {
        return this.status === 'deleted';
    }

    isOverBudget(): boolean {
        return this.actualCost
            > this.estimatedCost;
    }

    isOverdue(): boolean {
        return this.actualDuration
            > this.estimatedDuration;
    }

    estimatedDurationDays(): number {
        return durationInDays(
            this.estimatedDuration,
        );
    }

    actualDurationDays(): number {
        return durationInDays(
            this.actualDuration,
        );
    }

    formattedCost(): string {
        return formatCompactCurrency(
            this.estimatedCost,
        );
    }

    priorityLevel(): PriorityLevel {
        return computePriority(
            this.priorityScore,
        );
    }

    leadName(
        userMap: Map<Id, User>,
    ): string {
        return userMap.get(this.leadId)
            ?.fullName() ?? 'Unknown';
    }

    statusLabel(): string {
        return (
            PROJECT_STATUS_CONFIG[this.status]
                ?? UNKNOWN_CONFIG
        ).label;
    }

    statusClassName(): string {
        return (
            PROJECT_STATUS_CONFIG[this.status]
                ?? UNKNOWN_CONFIG
        ).className;
    }
}

export class Edge {
    readonly id: string;
    readonly ideaId: Id;
    readonly status: EdgeStatus;
    readonly confidence: ConfidenceLevel;
    readonly ownerId: Id;
    readonly impactShortTerm: string;
    readonly impactMidTerm: string;
    readonly impactLongTerm: string;
    readonly updatedAt: string;

    constructor(entity: EdgeEntity) {
        this.id = entity.id;
        this.ideaId = entity.idea_id;
        this.status = entity.status;
        this.confidence = entity.confidence;
        this.ownerId = entity.owner_id;
        this.impactShortTerm =
            entity.impact_short_term;
        this.impactMidTerm =
            entity.impact_mid_term;
        this.impactLongTerm =
            entity.impact_long_term;
        this.updatedAt = entity.updated_at;
    }

    isComplete(): boolean {
        return this.status === 'complete';
    }

    isDraft(): boolean {
        return this.status === 'draft';
    }

    isMissing(): boolean {
        return this.status === 'missing';
    }

    statusLabel(): string {
        return (
            EDGE_STATUS_CONFIG[this.status]
                ?? UNKNOWN_CONFIG
        ).label;
    }

    statusClassName(): string {
        return (
            EDGE_STATUS_CONFIG[this.status]
                ?? UNKNOWN_CONFIG
        ).className;
    }

    confidenceLabel(): string {
        return (
            CONFIDENCE_CONFIG[this.confidence]
                ?? UNKNOWN_CONFIG
        ).label;
    }

    confidenceClassName(): string {
        return (
            CONFIDENCE_CONFIG[this.confidence]
                ?? UNKNOWN_CONFIG
        ).className;
    }
}

export class Activity {
    readonly id: string;
    readonly type: string;
    readonly actorId: Id;
    readonly action: string;
    readonly target: string;
    readonly timestamp: string;
    readonly score: number;
    readonly status: string;
    readonly comment: string;
    readonly actor: string;

    constructor(
        entity: ActivityEntity,
        actor: string = 'Unknown',
    ) {
        this.id = entity.id;
        this.type = entity.type;
        this.actorId = entity.actor_id;
        this.action = entity.action;
        this.target = entity.target;
        this.timestamp = entity.timestamp;
        this.score = entity.score;
        this.status = entity.status;
        this.comment = entity.comment;
        this.actor = actor;
    }

    actorName(
        userMap: Map<Id, User>,
    ): string {
        return userMap.get(this.actorId)
            ?.fullName() ?? 'Unknown';
    }

    formattedDescription(
        userMap: Map<Id, User>,
    ): string {
        return `${this.actorName(userMap)}`
            + ` ${this.action}`
            + ` ${this.target}`;
    }
}

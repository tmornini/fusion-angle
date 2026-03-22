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

export type JsonArrayField = string & {
    readonly __brand: 'JsonArrayField';
};

export type JsonObjectField = string & {
    readonly __brand: 'JsonObjectField';
};

export function jsonArrayField(
    value: unknown[],
): JsonArrayField {
    return JSON.stringify(
        value,
    ) as JsonArrayField;
}

export function jsonObjectField(
    value: Record<string, unknown>,
): JsonObjectField {
    return JSON.stringify(
        value,
    ) as JsonObjectField;
}

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

const BILLION = 1_000_000_000;
const MILLION = 1_000_000;
const THOUSAND = 1_000;
const BILLION_PRECISION = 2;
const MILLION_PRECISION = 1;

export function formatCompactCurrency(
    value: number,
): string {
    if (value >= BILLION)
        return `$${(value / BILLION).toFixed(BILLION_PRECISION)}B`;
    if (value >= MILLION)
        return `$${(value / MILLION).toFixed(MILLION_PRECISION)}M`;
    if (value >= THOUSAND)
        return `$${Math.round(value / THOUSAND)}K`;
    return `$${value}`;
}

export function nowUtc(): string {
    return new Date().toISOString();
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
    strengths: JsonArrayField;
    team_dimensions: JsonObjectField;
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
        return (
            `${this.firstName}`
            + ` ${this.lastName}`
        ).trim();
    }

    isActive(): boolean {
        return this.status === 'active';
    }

    isPending(): boolean {
        return this.status === 'pending';
    }

    isDeactivated(): boolean {
        return this.status === 'deactivated';
    }

    statusLabel(): string {
        if (this.status === 'active')
            return 'Active';
        if (this.status === 'pending')
            return 'Pending';
        if (this.status === 'deactivated')
            return 'Deactivated';
        return this.status;
    }

    statusClassName(): string {
        if (this.status === 'active')
            return 'badge-success';
        if (this.status === 'pending')
            return 'badge-warning';
        if (this.status === 'deactivated')
            return 'badge-default';
        return 'badge-default';
    }

    hasDepartment(): boolean {
        return this.department !== '';
    }

    hasPerformanceScore(): boolean {
        return this.performanceScore > 0;
    }

    parsedStrengths(): string[] {
        return JSON.parse(
            this.strengths,
        ) as string[];
    }

    parsedTeamDimensions():
        Record<string, number> {
        return JSON.parse(
            this.teamDimensions,
        ) as Record<string, number>;
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
    problem_statement: string;
    proposed_solution: string;
    expected_outcome: string;
    category: string;
    readiness: string;
    impact_label: string;
    effort_label: string;
    description: string;
    risks: JsonArrayField;
    assumptions: JsonArrayField;
    alignments: JsonArrayField;
    effort_duration_estimate: string;
    effort_team_size: string;
    cost_estimate: string;
    cost_breakdown: string;
    success_metrics: string;
}

export interface IdeaScoreEntity {
    id: Id;
    overall: number;
    impact_score: number;
    impact_breakdown: JsonArrayField;
    feasibility_score: number;
    feasibility_breakdown: JsonArrayField;
    efficiency_score: number;
    efficiency_breakdown: JsonArrayField;
    estimated_duration: string;
    estimated_cost: string;
    recommendation: string;
}

export interface IdeaScoreIdeaEntity {
    id: Id;
    idea_score_id: Id;
    idea_id: Id;
    created_at: string;
}

export interface ProjectEntity {
    id: Id;
    title: string;
    description: string;
    status: ProjectStatus;
    progress: number;
    start_date: string;
    target_end_date: string;
    estimated_duration: number; // seconds
    actual_duration: number; // seconds
    estimated_cost: number;
    actual_cost: number;
    estimated_impact: number;
    actual_impact: number;
    priority: number;
    priority_score: number;
    business_context: JsonObjectField;
    timeline_label: string;
    budget_label: string;
}

export interface TeamMembershipEntity {
    id: Id;
    role: string;
    type: string;
}

export interface TeamMembershipProjectEntity {
    id: Id;
    team_membership_id: Id;
    project_id: Id;
    created_at: string;
}

export interface TeamMembershipUserEntity {
    id: Id;
    team_membership_id: Id;
    user_id: Id;
    created_at: string;
}

export interface MilestoneEntity {
    id: Id;
    title: string;
    status: string;
    date: string;
    sort_order: number;
}

export interface MilestoneProjectEntity {
    id: Id;
    milestone_id: Id;
    project_id: Id;
    created_at: string;
}

export interface ProjectTaskEntity {
    id: Id;
    name: string;
    priority: string;
    description: string;
    skills: JsonArrayField;
    duration: number; // seconds
}

export interface ProjectTaskProjectEntity {
    id: Id;
    project_task_id: Id;
    project_id: Id;
    created_at: string;
}

export interface DiscussionEntity {
    id: Id;
    date: string;
    message: string;
}

export interface DiscussionProjectEntity {
    id: Id;
    discussion_id: Id;
    project_id: Id;
    created_at: string;
}

export interface ProjectVersionEntity {
    id: Id;
    version: string;
    date: string;
    changes: string;
}

export interface ProjectVersionProjectEntity {
    id: Id;
    project_version_id: Id;
    project_id: Id;
    created_at: string;
}

export interface EdgeEntity {
    id: Id;
    status: EdgeStatus;
    confidence: ConfidenceLevel;
    impact_short_term: string;
    impact_mid_term: string;
    impact_long_term: string;
    updated_at: string;
}

export interface EdgeIdeaEntity {
    id: Id;
    edge_id: Id;
    idea_id: Id;
    created_at: string;
}

export interface EdgeOutcomeEntity {
    id: Id;
    description: string;
}

export interface EdgeOutcomeEdgeEntity {
    id: Id;
    edge_outcome_id: Id;
    edge_id: Id;
    created_at: string;
}

export interface EdgeMetricEntity {
    id: Id;
    name: string;
    target: string;
    unit: string;
    current: string;
}

export interface EdgeMetricOutcomeEntity {
    id: Id;
    edge_metric_id: Id;
    outcome_id: Id;
    created_at: string;
}

export interface ActivityEntity {
    id: Id;
    type: string;
    action: string;
    target: string;
    timestamp: string;
    score: number;
    status: string;
    comment: string;
}

export interface ClarificationEntity {
    id: Id;
    question: string;
    asked_at: string;
    status: ClarificationStatus;
}

export interface ClarificationAnswerEntity {
    id: Id;
    answer: string;
}

export interface ClarificationAnswerClarificationEntity {
    id: Id;
    clarification_answer_id: Id;
    clarification_id: Id;
    created_at: string;
}

export interface CrunchColumnEntity {
    id: Id;
    original_name: string;
    friendly_name: string;
    data_type: string;
    description: string;
    sample_values: JsonArrayField;
}

export interface CrunchColumnAcronymEntity {
    id: Id;
    expansion: string;
}

export interface CrunchColumnAcronymLinkEntity {
    id: Id;
    crunch_column_acronym_id: Id;
    crunch_column_id: Id;
    created_at: string;
}

export interface FlowEntity {
    id: Id;
    name: string;
    description: string;
    department: string;
}

export interface FlowStepEntity {
    id: Id;
    title: string;
    description: string;
    owner: string;
    role: string;
    tools: JsonArrayField;
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

export interface IdeaSubmissionEntity {
    id: Id;
    idea_id: Id;
    user_id: Id;
    created_at: string;
}

export interface IdeaProjectLinkEntity {
    id: Id;
    idea_id: Id;
    project_id: Id;
    created_at: string;
}

export interface EdgeOwnershipEntity {
    id: Id;
    edge_id: Id;
    user_id: Id;
    created_at: string;
}

export interface TaskAssignmentEntity {
    id: Id;
    task_id: Id;
    user_id: Id;
    created_at: string;
}

export interface DiscussionAuthorshipEntity {
    id: Id;
    discussion_id: Id;
    user_id: Id;
    created_at: string;
}

export interface VersionAuthorshipEntity {
    id: Id;
    version_id: Id;
    user_id: Id;
    created_at: string;
}

export interface ActivityActorEntity {
    id: Id;
    activity_id: Id;
    user_id: Id;
    created_at: string;
}

export interface ClarificationAskerEntity {
    id: Id;
    clarification_id: Id;
    user_id: Id;
    created_at: string;
}

export interface ClarificationAnswererEntity {
    id: Id;
    clarification_id: Id;
    user_id: Id;
    created_at: string;
}

export interface ClarificationProjectEntity {
    id: Id;
    clarification_id: Id;
    project_id: Id;
    created_at: string;
}

export interface ProcessStepProcessEntity {
    id: Id;
    process_step_id: Id;
    process_id: Id;
    created_at: string;
}

export interface StatusDisplay {
    label: string;
    className: string;
}

export interface InlineStyleDisplay {
    label: string;
    style: string;
}

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
    EdgeStatus,
    StatusDisplay
> = {
    missing: {
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

export const FLOW_STEP_TYPE_CONFIG: Record<
    FlowStepType,
    InlineStyleDisplay
> = {
    start: {
        label: 'Start',
        style: 'background:hsl(var('
            + '--success) / 0.1);border:'
            + '2px solid hsl(var(--success)'
            + ' / 0.3);color:hsl(var('
            + '--success))',
    },
    end: {
        label: 'End',
        style: 'background:hsl(var('
            + '--error)/0.1);border:2px'
            + ' solid hsl(var(--error)'
            + '/0.3);color:hsl(var('
            + '--error))',
    },
    decision: {
        label: 'Decision',
        style: 'background:hsl(var('
            + '--warning)/0.1);border:2px'
            + ' solid hsl(var(--warning)'
            + '/0.3);color:hsl(var('
            + '--warning))',
    },
    action: {
        label: 'Action',
        style: 'background:hsl(var('
            + '--primary)/0.1);border:2px'
            + ' solid hsl(var(--primary)'
            + '/0.3);color:hsl(var('
            + '--primary))',
    },
};

export interface MilestoneDisplay {
    label: string;
    textStyle: string;
    iconBackground: string;
}

export type MilestoneStatus =
    'completed'
    | 'in_progress'
    | 'pending';

export const MILESTONE_STATUS_CONFIG:
    Record<MilestoneStatus, MilestoneDisplay>
= {
    completed: {
        label: 'Completed',
        textStyle:
            'color:hsl(var(--success))',
        iconBackground:
            'hsl(var(--success))',
    },
    in_progress: {
        label: 'In Progress',
        textStyle:
            'color:hsl(var(--warning))',
        iconBackground:
            'hsl(var(--warning))',
    },
    pending: {
        label: 'Pending',
        textStyle: 'color:hsl(var('
            + '--muted-foreground))',
        iconBackground:
            'hsl(var(--muted))',
    },
};

export const TASK_PRIORITY_CONFIG:
    Record<string, InlineStyleDisplay>
= {
    High: {
        label: 'High',
        style: 'background:hsl(var('
            + '--error-soft));'
            + 'color:hsl(var('
            + '--error-text));'
            + 'border:1px solid '
            + 'hsl(var(--error-border))',
    },
    Medium: {
        label: 'Medium',
        style: 'background:hsl(var('
            + '--warning-soft));'
            + 'color:hsl(var('
            + '--warning-text));'
            + 'border:1px solid '
            + 'hsl(var(--warning-border))',
    },
};

export const TASK_PRIORITY_LOW:
    InlineStyleDisplay = {
        label: 'Low',
        style: 'background:hsl(var('
            + '--muted)/0.5);'
            + 'color:hsl(var('
            + '--muted-foreground));'
            + 'border:1px solid '
            + 'hsl(var(--border))',
    };

export const READINESS_CONFIG: Record<
    string,
    StatusDisplay
> = {
    ready: {
        label: 'Ready for Review',
        className: 'text-success',
    },
    'needs-info': {
        label: 'Needs Info',
        className: 'text-warning',
    },
    incomplete: {
        label: 'Incomplete',
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
    readonly edgeStatus: EdgeStatus;
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
    readonly submittedBy: string | null;

    constructor(
        entity: IdeaEntity,
        submittedBy: string | null,
        edgeStatus: EdgeStatus,
        submittedAt: string,
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
        this.edgeStatus = edgeStatus;
        this.problemStatement =
            entity.problem_statement;
        this.proposedSolution =
            entity.proposed_solution;
        this.expectedOutcome =
            entity.expected_outcome;
        this.category = entity.category;
        this.readiness = entity.readiness;
        this.impactLabel = entity.impact_label;
        this.effortLabel = entity.effort_label;
        this.description = entity.description;
        this.submittedAt = submittedAt;
        this.waitingDays = this.submittedAt
            ? Math.max(0, Math.ceil(
                (Date.now()
                    - new Date(
                        this.submittedAt,
                    ).getTime())
                / SECONDS_PER_DAY
                / 1000,
            ))
            : 0;
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

    isReady(): boolean {
        return this.readiness === 'ready';
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
        )!.label;
    }

    statusClassName(): string {
        return (
            IDEA_STATUS_CONFIG[this.status]
        )!.className;
    }

    edgeStatusLabel(): string {
        return (
            EDGE_STATUS_CONFIG[this.edgeStatus]
        )!.label;
    }

    edgeStatusClassName(): string {
        return (
            EDGE_STATUS_CONFIG[this.edgeStatus]
        )!.className;
    }

    readinessLabel(): string {
        return (
            READINESS_CONFIG[this.readiness]
        )!.label;
    }

    readinessClassName(): string {
        return (
            READINESS_CONFIG[this.readiness]
        )!.className;
    }

    parsedRisks(): { title: string;
        severity: string;
        mitigation: string }[] {
        return JSON.parse(
            this.risks,
        ) as { title: string;
            severity: string;
            mitigation: string }[];
    }

    parsedAssumptions(): string[] {
        return JSON.parse(
            this.assumptions,
        ) as string[];
    }

    parsedAlignments(): string[] {
        return JSON.parse(
            this.alignments,
        ) as string[];
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
    readonly estimatedDuration: number;
    readonly actualDuration: number;
    readonly estimatedCost: number;
    readonly actualCost: number;
    readonly estimatedImpact: number;
    readonly actualImpact: number;
    readonly priority: number;
    readonly priorityScore: number;
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

    statusLabel(): string {
        return (
            PROJECT_STATUS_CONFIG[this.status]
        )!.label;
    }

    statusClassName(): string {
        return (
            PROJECT_STATUS_CONFIG[this.status]
        )!.className;
    }
}

export class Edge {
    readonly id: string;
    readonly status: EdgeStatus;
    readonly confidence: ConfidenceLevel;
    readonly impactShortTerm: string;
    readonly impactMidTerm: string;
    readonly impactLongTerm: string;
    readonly updatedAt: string;

    constructor(entity: EdgeEntity) {
        this.id = entity.id;
        this.status = entity.status;
        this.confidence = entity.confidence;
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
        )!.label;
    }

    statusClassName(): string {
        return (
            EDGE_STATUS_CONFIG[this.status]
        )!.className;
    }

    confidenceLabel(): string {
        return (
            CONFIDENCE_CONFIG[this.confidence]
        )!.label;
    }

    confidenceClassName(): string {
        return (
            CONFIDENCE_CONFIG[this.confidence]
        )!.className;
    }
}

export class EdgeListEntry extends Edge {
    readonly ideaId: string;
    readonly ideaTitle: string;
    readonly outcomesCount: number;
    readonly metricsCount: number;
    readonly owner: string | null;

    constructor(
        entity: EdgeEntity,
        ideaId: string,
        ideaTitle: string,
        outcomesCount: number,
        metricsCount: number,
        owner: string | null,
    ) {
        super(entity);
        this.ideaId = ideaId;
        this.ideaTitle = ideaTitle;
        this.outcomesCount = outcomesCount;
        this.metricsCount = metricsCount;
        this.owner = owner;
    }
}

export class Activity {
    readonly id: string;
    readonly type: string;
    readonly action: string;
    readonly target: string;
    readonly timestamp: string;
    readonly score: number;
    readonly status: string;
    readonly comment: string;
    readonly actor: string | null;

    constructor(
        entity: ActivityEntity,
        actor: string | null,
    ) {
        this.id = entity.id;
        this.type = entity.type;
        this.action = entity.action;
        this.target = entity.target;
        this.timestamp = entity.timestamp;
        this.score = entity.score;
        this.status = entity.status;
        this.comment = entity.comment;
        this.actor = actor;
    }

    formattedDescription(): string {
        return `${this.actor ?? ''}`
            + ` ${this.action}`
            + ` ${this.target}`;
    }
}

export interface RecentActivityItem {
    type: string;
    description: string;
    time: string;
}

export class Account {
    readonly companyName: string;
    readonly plan: string;
    readonly planStatus: string;
    readonly nextBilling: string;
    readonly seats: number;
    readonly usedSeats: number;
    readonly projectsCurrent: number;
    readonly projectsLimit: number;
    readonly ideasCurrent: number;
    readonly ideasLimit: number;
    readonly storageCurrent: number;
    readonly storageLimit: number;
    readonly aiCreditsCurrent: number;
    readonly aiCreditsLimit: number;
    readonly healthScore: number;
    readonly healthStatus: string;
    readonly lastActivity: string;
    readonly activeUsers: number;
    readonly recentActivity:
        RecentActivityItem[];

    constructor(
        entity: AccountEntity,
        companyName: string,
        recentActivity:
            RecentActivityItem[],
    ) {
        this.companyName = companyName;
        this.plan = entity.plan;
        this.planStatus =
            entity.plan_status;
        this.nextBilling =
            entity.next_billing;
        this.seats = entity.seats;
        this.usedSeats =
            entity.used_seats;
        this.projectsCurrent =
            entity.projects_current;
        this.projectsLimit =
            entity.projects_limit;
        this.ideasCurrent =
            entity.ideas_current;
        this.ideasLimit =
            entity.ideas_limit;
        this.storageCurrent =
            entity.storage_current;
        this.storageLimit =
            entity.storage_limit;
        this.aiCreditsCurrent =
            entity.ai_credits_current;
        this.aiCreditsLimit =
            entity.ai_credits_limit;
        this.healthScore =
            entity.health_score;
        this.healthStatus =
            entity.health_status;
        this.lastActivity =
            entity.last_activity;
        this.activeUsers =
            entity.active_users;
        this.recentActivity =
            recentActivity;
    }

    seatUsagePercent(): number {
        return this.seats > 0
            ? Math.min(
                (this.usedSeats
                    / this.seats) * 100,
                100,
            )
            : 0;
    }

    projectUsagePercent(): number {
        return this.projectsLimit > 0
            ? Math.min(
                (this.projectsCurrent
                    / this.projectsLimit)
                    * 100,
                100,
            )
            : 0;
    }

    ideaUsagePercent(): number {
        return this.ideasLimit > 0
            ? Math.min(
                (this.ideasCurrent
                    / this.ideasLimit)
                    * 100,
                100,
            )
            : 0;
    }

    aiCreditUsagePercent(): number {
        return this.aiCreditsLimit > 0
            ? Math.min(
                (this.aiCreditsCurrent
                    / this.aiCreditsLimit)
                    * 100,
                100,
            )
            : 0;
    }

    storageUsagePercent(): number {
        return this.storageLimit > 0
            ? Math.min(
                (this.storageCurrent
                    / this.storageLimit)
                    * 100,
                100,
            )
            : 0;
    }
}

export function ideaIsNotDeleted(
    e: IdeaEntity,
): boolean {
    return e.status !== 'deleted';
}

export function ideaIsInReview(
    e: IdeaEntity,
): boolean {
    return e.status === 'in-review';
}

export function projectIsNotDeleted(
    e: ProjectEntity,
): boolean {
    return e.status !== 'deleted';
}

export function projectIsApproved(
    e: ProjectEntity,
): boolean {
    return e.status === 'approved';
}

export function clarificationIsPending(
    e: { status: ClarificationStatus },
): boolean {
    return e.status === 'pending';
}

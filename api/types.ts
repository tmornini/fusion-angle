export type Id = string;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type PriorityLevel = 'high' | 'medium' | 'low';

export type WfFieldType =
    | 'text'
    | 'textarea'
    | 'number'
    | 'date'
    | 'select'
    | 'checkbox'
    | 'file'
    | 'email'
    | 'url'
    | 'phone'
    | 'currency'
    | 'multi_select'
    | 'radio'
    | 'image';

export type UserStatus =
    | 'active'
    | 'pending'
    | 'deactivated';

export type ReadinessLevel =
    | 'ready'
    | 'needs-info'
    | 'incomplete';

export type IdeaStatus =
    | 'active'
    | 'in-review'
    | 'approved'
    | 'promoted'
    | 'sent-back'
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

const WF_FIELD_TYPES:
    readonly WfFieldType[]
    = [
        'text', 'textarea', 'number',
        'date', 'select', 'checkbox',
        'file', 'email', 'url',
        'phone', 'currency',
        'multi_select', 'radio',
        'image',
    ];

export function isWfFieldType(
    v: string,
): v is WfFieldType {
    return includes(
        WF_FIELD_TYPES, v,
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
        'sent-back', 'archived',
        'deleted',
    ];

export function isIdeaStatus(
    v: string,
): v is IdeaStatus {
    return includes(
        IDEA_STATUSES, v,
    );
}

const USER_STATUSES: readonly UserStatus[] =
    ['active', 'pending', 'deactivated'];

export function isUserStatus(
    v: string,
): v is UserStatus {
    return includes(
        USER_STATUSES, v,
    );
}

const READINESS_LEVELS:
    readonly ReadinessLevel[] =
    ['ready', 'needs-info', 'incomplete'];

export function isReadinessLevel(
    v: string,
): v is ReadinessLevel {
    return includes(
        READINESS_LEVELS, v,
    );
}

export const MS_PER_SECOND = 1000;
export const SECONDS_PER_DAY = 86400;
export const COST_DIVISOR = 1000;

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
    status: UserStatus;
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
    readonly status: UserStatus;
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
        return (
            USER_STATUS_CONFIG[this.status]
        )!.label;
    }

    statusClassName(): string {
        return (
            USER_STATUS_CONFIG[this.status]
        )!.className;
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
    estimated_impact: number;
    estimated_duration: number;
    estimated_cost: number;
    priority: number;
    position: number;
    status: IdeaStatus;
    problem_statement: string;
    proposed_solution: string;
    expected_outcome: string;
    category: string;
    readiness: ReadinessLevel;
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
    position: number;
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

export interface GraphField {
    id: string;
    name: string;
    fieldType: WfFieldType;
    sortOrder: number;
    isRequired: boolean;
    options: string[];
}

export interface GraphNode {
    id: string;
    name: string;
    description: string;
    positionX: number;
    positionY: number;
    isStart: boolean;
    isComplete: boolean;
    fields: GraphField[];
}

export interface GraphEdge {
    id: string;
    name: string;
    description: string;
    fromNodeId: string;
    toNodeId: string;
}

export const DEFAULT_LOCK_TIMEOUT = 28800;

export interface FlowEntity {
    id: Id;
    name: string;
    description: string;
    is_locked: boolean;
    lock_timeout: number;
    graph: JsonObjectField;
    created_at: string;
    updated_at: string;
}

export interface WorkOrderFlowGraph {
    flowId: Id;
    name: string;
    description: string;
    lockTimeout: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface WorkOrderEntity {
    id: Id;
    display_id: string;
    flow_graph: JsonObjectField;
    created_at: string;
}

export interface FlowWorkOrderEntity {
    id: Id;
    flow_id: Id;
    work_order_id: Id;
    created_at: string;
}

export interface WorkOrderTransitionEntity {
    id: Id;
    work_order_id: Id;
    from_node_id: Id;
    to_node_id: Id;
    user_id: Id;
    values: JsonObjectField;
    transitioned_at: string;
}

export interface WorkOrderClaimEntity {
    id: Id;
    work_order_id: Id;
    user_id: Id;
    claimed_at: string;
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

export interface ActivityActorEntity {
    id: Id;
    activity_id: Id;
    user_id: Id;
    created_at: string;
}

export interface ProjectFlowEntity {
    id: Id;
    project_id: Id;
    flow_id: Id;
    created_at: string;
}


export interface StatusDisplay {
    label: string;
    className: string;
}

export const USER_STATUS_CONFIG: Record<
    UserStatus,
    StatusDisplay
> = {
    active: {
        label: 'Active',
        className: 'badge-success',
    },
    pending: {
        label: 'Pending',
        className: 'badge-warning',
    },
    deactivated: {
        label: 'Deactivated',
        className: 'badge-default',
    },
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
        className: 'badge-success',
    },
    'promoted': {
        label: 'Promoted',
        className: 'badge-primary',
    },
    'sent-back': {
        label: 'Sent Back',
        className: 'badge-error',
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

export const PROJECT_STATUS_CONFIG: Record<
    ProjectStatus,
    StatusDisplay
> = {
    'submitted': {
        label: 'Submitted',
        className: 'badge-default',
    },
    'under-review': {
        label: 'In Review',
        className: 'badge-warning',
    },
    'sent-back': {
        label: 'Sent Back',
        className: 'badge-error',
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
        label: 'Active',
        className: 'badge-success',
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

export const READINESS_CONFIG: Record<
    ReadinessLevel,
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
    readonly estimatedImpact: number;
    readonly estimatedDuration: number;
    readonly estimatedCost: number;
    readonly priority: number;
    readonly position: number;
    readonly status: IdeaStatus;
    readonly problemStatement: string;
    readonly proposedSolution: string;
    readonly expectedOutcome: string;
    readonly category: string;
    readonly readiness: ReadinessLevel;
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
        submittedBy: string,
        submittedAt: string,
    ) {
        this.id = entity.id;
        this.title = entity.title;
        this.estimatedImpact =
            entity.estimated_impact;
        this.estimatedDuration =
            entity.estimated_duration;
        this.estimatedCost =
            entity.estimated_cost;
        this.priority = entity.priority;
        this.position = entity.position;
        this.status = entity.status;
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
                / MS_PER_SECOND
                / SECONDS_PER_DAY,
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
        return this.status === 'in-review';
    }

    isConvertible(): boolean {
        return this.status === 'approved';
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

    matchesSearch(term: string): boolean {
        const t = term.toLowerCase();
        return (
            this.title
                .toLowerCase()
                .includes(t)
            || this.submittedBy
                .toLowerCase()
                .includes(t)
        );
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
    readonly position: number;
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
        this.position = entity.position;
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

    timelineProgress(): number {
        if (this.status === 'completed')
            return 100;
        const start =
            new Date(this.startDate);
        const end =
            new Date(this.targetEndDate);
        if (
            isNaN(start.getTime())
            || isNaN(end.getTime())
        ) return 0;
        const total =
            end.getTime()
            - start.getTime();
        if (total <= 0) return 0;
        const elapsed =
            Date.now() - start.getTime();
        return Math.max(
            0,
            Math.min(
                100,
                Math.round(
                    elapsed / total * 100,
                ),
            ),
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

export class Activity {
    readonly id: string;
    readonly type: string;
    readonly action: string;
    readonly target: string;
    readonly timestamp: string;
    readonly score: number;
    readonly status: string;
    readonly comment: string;
    readonly actor: string;

    constructor(
        entity: ActivityEntity,
        actor: string,
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
        const prefix =
            this.actor !== null
                ? `${this.actor} `
                : '';
        return prefix
            + `${this.action}`
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

export function ideaIsVisible(
    e: IdeaEntity,
): boolean {
    return e.status !== 'archived'
        && e.status !== 'deleted';
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


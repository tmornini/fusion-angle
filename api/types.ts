import {
    validateStringArrayJson,
    validateStringNumberRecordJson,
    validateRisksJson,
} from './validators.ts';
import type { Risk } from './validators.ts';

export type { Risk };

export type Id = string;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type FlowFieldType =
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

export type ActivityType =
    | 'idea_created'
    | 'project_created'
    | 'user_joined'
    | 'status_changed'
    | 'idea_converted';

const ACTIVITY_TYPES:
    readonly ActivityType[] = [
    'idea_created',
    'project_created',
    'user_joined',
    'status_changed',
    'idea_converted',
];

export function isActivityType(
    v: string,
): v is ActivityType {
    return (ACTIVITY_TYPES as readonly string[])
        .includes(v);
}

export type DimensionKey =
    | 'driver'
    | 'analytical'
    | 'expressive'
    | 'amiable';

const DIMENSION_KEYS:
    readonly DimensionKey[] = [
    'driver',
    'analytical',
    'expressive',
    'amiable',
];

export function isDimensionKey(
    v: string,
): v is DimensionKey {
    return (DIMENSION_KEYS as readonly string[])
        .includes(v);
}

export type ProjectStatus =
    | 'submitted'
    | 'under-review'
    | 'sent-back'
    | 'approved'
    | 'declined'
    | 'completed'
    | 'deleted';

export const AVAILABILITY_HIGH = 70;
export const AVAILABILITY_LOW = 40;

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

const FLOW_FIELD_TYPES:
    readonly FlowFieldType[]
    = [
        'text', 'textarea', 'number',
        'date', 'select', 'checkbox',
        'file', 'email', 'url',
        'phone', 'currency',
        'multi_select', 'radio',
        'image',
    ];

export function isFlowFieldType(
    v: string,
): v is FlowFieldType {
    return includes(
        FLOW_FIELD_TYPES, v,
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
export const MS_PER_DAY =
    SECONDS_PER_DAY * MS_PER_SECOND;
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

export function msSinceUtc(
    iso: string,
): number {
    return Date.now()
        - new Date(iso).getTime();
}

export interface Deleted {
    id: Id;
    deleted_at: string;
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
    readonly #id: string;
    readonly #firstName: string;
    readonly #lastName: string;
    readonly #email: string;
    readonly #role: string;
    readonly #department: string;
    readonly #status: UserStatus;
    readonly #availability: number;
    readonly #performanceScore: number;
    readonly #projectsCompleted: number;
    readonly #currentProjects: number;
    readonly #strengths: string;
    readonly #teamDimensions: string;
    readonly #lastActive: string;

    constructor(entity: UserEntity) {
        this.#id = entity.id;
        this.#firstName =
            entity.first_name;
        this.#lastName =
            entity.last_name;
        this.#email = entity.email;
        this.#role = entity.role;
        this.#department =
            entity.department;
        this.#status = entity.status;
        this.#availability =
            entity.availability;
        this.#performanceScore =
            entity.performance_score;
        this.#projectsCompleted =
            entity.projects_completed;
        this.#currentProjects =
            entity.current_projects;
        this.#strengths =
            entity.strengths;
        this.#teamDimensions =
            entity.team_dimensions;
        this.#lastActive =
            entity.last_active;
    }

    idForLink(): string {
        return this.#id;
    }

    fullName(): string {
        return (
            `${this.#firstName}`
            + ` ${this.#lastName}`
        ).trim();
    }

    roleLabel(): string {
        return this.#role;
    }

    departmentLabel(): string {
        return this.#department;
    }

    emailAddress(): string {
        return this.#email;
    }

    isActive(): boolean {
        return this.#status === 'active';
    }

    isPending(): boolean {
        return (
            this.#status === 'pending'
        );
    }

    isDeactivated(): boolean {
        return (
            this.#status === 'deactivated'
        );
    }

    statusLabel(): string {
        return (
            USER_STATUS_CONFIG[
                this.#status
            ]
        )!.label;
    }

    statusClassName(): string {
        return (
            USER_STATUS_CONFIG[
                this.#status
            ]
        )!.className;
    }

    hasDepartment(): boolean {
        return this.#department !== '';
    }

    hasPerformanceScore(): boolean {
        return this.#performanceScore > 0;
    }

    availabilityScore(): number {
        return this.#availability;
    }

    performanceScoreValue(): number {
        return this.#performanceScore;
    }

    projectsCompletedCount(): number {
        return this.#projectsCompleted;
    }

    currentProjectsCount(): number {
        return this.#currentProjects;
    }

    lastActiveDate(): string {
        return this.#lastActive;
    }

    statusValue(): UserStatus {
        return this.#status;
    }

    parsedStrengths(): string[] {
        return validateStringArrayJson(
            this.#strengths,
            'user.strengths',
        );
    }

    parsedTeamDimensions():
        Record<string, number> {
        return (
            validateStringNumberRecordJson(
                this.#teamDimensions,
                'user.teamDimensions',
            )
        );
    }

    matchesSearch(term: string): boolean {
        const t = term.toLowerCase();
        return (
            this.fullName()
                .toLowerCase()
                .includes(t)
            || this.#email
                .toLowerCase()
                .includes(t)
            || this.#role
                .toLowerCase()
                .includes(t)
            || this.#department
                .toLowerCase()
                .includes(t)
        );
    }

}

export interface IdeaEntity {
    id: Id;
    title: string;
    position: number;
    status: IdeaStatus;
    problem_statement: string;
    target_users: string;
    proposed_solution: string;
    expected_outcome: string;
    success_metrics: string;
    readiness: ReadinessLevel;
    risks: JsonArrayField;
    assumptions: JsonArrayField;
    alignments: JsonArrayField;
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
    position: number;
    business_context: JsonObjectField;
    timeline_label: string;
    budget_label: string;
}

export interface TeamEntity {
    id: Id;
    role: string;
    type: string;
}

export interface TeamProjectEntity {
    id: Id;
    team_id: Id;
    project_id: Id;
    created_at: string;
}

export interface TeamUserEntity {
    id: Id;
    team_id: Id;
    user_id: Id;
    created_at: string;
}

export interface ActivityEntity {
    id: Id;
    type: string;
    action: string;
    target: string;
    timestamp: string;
    status: string;
    feedback: string;
}

export interface GraphField {
    id: string;
    name: string;
    fieldType: FlowFieldType;
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

export interface StoredGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export const DEFAULT_LOCK_TIMEOUT = 28800;

// Named defaults for flow-graph entities.
// Pass explicitly at call sites: the
// constant tells the next reader the
// empty value is deliberate, not
// coincidental.
export const DEFAULT_NODE_DESCRIPTION = '';
export const DEFAULT_EDGE_DESCRIPTION = '';
export const DEFAULT_NODE_FIELDS:
    readonly GraphField[] = [];
export const DEFAULT_NEW_STATE_NAME =
    'New State';
export const DEFAULT_TRANSITION_NAME =
    'Transition';

export interface FlowEntity {
    id: Id;
    name: string;
    description: string;
    is_locked: boolean;
    is_auto_layout: boolean;
    is_auto_fit: boolean;
    lock_timeout: number;
    graph: JsonObjectField;
    created_at: string;
    updated_at: string;
}

export interface FlowVersionEntity {
    id: Id;
    flow_id: Id;
    name: string;
    description: string;
    is_locked: boolean;
    is_auto_layout: boolean;
    is_auto_fit: boolean;
    lock_timeout: number;
    graph: JsonObjectField;
    created_at: string;
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
    position: number;
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

export interface CompanyEntity {
    id: Id;
    name: string;
    domain: string;
}

export interface OrganizationEntity {
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
    readonly #id: string;
    readonly #title: string;
    readonly #position: number;
    readonly #status: IdeaStatus;
    readonly #problemStatement: string;
    readonly #targetUsers: string;
    readonly #proposedSolution: string;
    readonly #expectedOutcome: string;
    readonly #successMetrics: string;
    readonly #readiness: ReadinessLevel;
    readonly #risks: string;
    readonly #assumptions: string;
    readonly #alignments: string;

    constructor(entity: IdeaEntity) {
        this.#id = entity.id;
        this.#title = entity.title;
        this.#position = entity.position;
        this.#status = entity.status;
        this.#problemStatement =
            entity.problem_statement;
        this.#targetUsers =
            entity.target_users;
        this.#proposedSolution =
            entity.proposed_solution;
        this.#expectedOutcome =
            entity.expected_outcome;
        this.#successMetrics =
            entity.success_metrics;
        this.#readiness = entity.readiness;
        this.#risks = entity.risks;
        this.#assumptions = entity.assumptions;
        this.#alignments = entity.alignments;
    }

    isDeleted(): boolean {
        return this.#status === 'deleted';
    }

    isInReview(): boolean {
        return this.#status === 'in-review';
    }

    isReviewable(): boolean {
        return this.#status === 'in-review';
    }

    isConvertible(): boolean {
        return this.#status === 'approved';
    }

    canBeSubmittedForReview(): boolean {
        return this.#status === 'active'
            || this.#status === 'sent-back';
    }

    isReady(): boolean {
        return this.#readiness === 'ready';
    }

    statusLabel(): string {
        return (
            IDEA_STATUS_CONFIG[this.#status]
        )!.label;
    }

    statusClassName(): string {
        return (
            IDEA_STATUS_CONFIG[this.#status]
        )!.className;
    }

    readinessLabel(): string {
        return (
            READINESS_CONFIG[this.#readiness]
        )!.label;
    }

    readinessClassName(): string {
        return (
            READINESS_CONFIG[this.#readiness]
        )!.className;
    }

    parsedRisks(): Risk[] {
        return validateRisksJson(
            this.#risks,
        );
    }

    parsedAssumptions(): string[] {
        return validateStringArrayJson(
            this.#assumptions,
            'idea.assumptions',
        );
    }

    parsedAlignments(): string[] {
        return validateStringArrayJson(
            this.#alignments,
            'idea.alignments',
        );
    }

    matchesSearch(term: string): boolean {
        return this.#title
            .toLowerCase()
            .includes(term.toLowerCase());
    }

    idForLink(): string {
        return this.#id;
    }

    titleText(): string {
        return this.#title;
    }

    positionSortKey(): number {
        return this.#position;
    }

    statusValue(): IdeaStatus {
        return this.#status;
    }

    problemStatementText(): string {
        return this.#problemStatement;
    }

    targetUsersText(): string {
        return this.#targetUsers;
    }

    proposedSolutionText(): string {
        return this.#proposedSolution;
    }

    expectedOutcomeText(): string {
        return this.#expectedOutcome;
    }

    successMetricsText(): string {
        return this.#successMetrics;
    }

    readinessValue(): ReadinessLevel {
        return this.#readiness;
    }
}

export class Project {
    readonly #id: string;
    readonly #title: string;
    readonly #description: string;
    readonly #status: ProjectStatus;
    readonly #progress: number;
    readonly #startDate: string;
    readonly #targetEndDate: string;
    readonly #estimatedDuration: number;
    readonly #actualDuration: number;
    readonly #estimatedCost: number;
    readonly #actualCost: number;
    readonly #estimatedImpact: number;
    readonly #actualImpact: number;
    readonly #position: number;
    readonly #businessContext: string;
    readonly #timelineLabel: string;
    readonly #budgetLabel: string;

    constructor(entity: ProjectEntity) {
        this.#id = entity.id;
        this.#title = entity.title;
        this.#description =
            entity.description;
        this.#status = entity.status;
        this.#progress = entity.progress;
        this.#startDate =
            entity.start_date;
        this.#targetEndDate =
            entity.target_end_date;
        this.#estimatedDuration =
            entity.estimated_duration;
        this.#actualDuration =
            entity.actual_duration;
        this.#estimatedCost =
            entity.estimated_cost;
        this.#actualCost =
            entity.actual_cost;
        this.#estimatedImpact =
            entity.estimated_impact;
        this.#actualImpact =
            entity.actual_impact;
        this.#position = entity.position;
        this.#businessContext =
            entity.business_context;
        this.#timelineLabel =
            entity.timeline_label;
        this.#budgetLabel =
            entity.budget_label;
    }

    isDeleted(): boolean {
        return this.#status === 'deleted';
    }

    isOverBudget(): boolean {
        return this.#actualCost
            > this.#estimatedCost;
    }

    isOverdue(): boolean {
        return this.#actualDuration
            > this.#estimatedDuration;
    }

    estimatedDurationDays(): number {
        return durationInDays(
            this.#estimatedDuration,
        );
    }

    actualDurationDays(): number {
        return durationInDays(
            this.#actualDuration,
        );
    }

    timelineProgress(): number {
        if (this.#status === 'completed')
            return 100;
        const start =
            new Date(this.#startDate);
        const end =
            new Date(
                this.#targetEndDate,
            );
        if (
            isNaN(start.getTime())
            || isNaN(end.getTime())
        ) return 0;
        const total =
            end.getTime()
            - start.getTime();
        if (total <= 0) return 0;
        const elapsed =
            msSinceUtc(this.#startDate);
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
            this.#estimatedCost,
        );
    }

    statusLabel(): string {
        return (
            PROJECT_STATUS_CONFIG[
                this.#status
            ]
        )!.label;
    }

    statusClassName(): string {
        return (
            PROJECT_STATUS_CONFIG[
                this.#status
            ]
        )!.className;
    }

    idForLink(): string {
        return this.#id;
    }

    titleText(): string {
        return this.#title;
    }

    descriptionText(): string {
        return this.#description;
    }

    statusValue(): ProjectStatus {
        return this.#status;
    }

    progressPercent(): number {
        return this.#progress;
    }

    startDateValue(): string {
        return this.#startDate;
    }

    targetEndDateValue(): string {
        return this.#targetEndDate;
    }

    estimatedCostAmount(): number {
        return this.#estimatedCost;
    }

    actualCostAmount(): number {
        return this.#actualCost;
    }

    estimatedImpactScore(): number {
        return this.#estimatedImpact;
    }

    actualImpactScore(): number {
        return this.#actualImpact;
    }

    positionSortKey(): number {
        return this.#position;
    }

    matchesSearch(term: string): boolean {
        const t = term.toLowerCase();
        return this.#title
            .toLowerCase()
            .includes(t);
    }
}

export interface RecentActivityItem {
    type: string;
    description: string;
    time: string;
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


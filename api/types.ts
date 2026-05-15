import {
    validateStringArrayJson,
    validateStringNumberRecordJson,
    validateRisksJson,
} from './validators.ts';
import type { Risk } from './validators.ts';

export type { Risk };

export type Id = string;

export type WorkerId = Id;

export type WorkerKind = 'human' | 'ai';

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

export type WorkerStatus =
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
    | 'person_joined'
    | 'status_changed'
    | 'idea_converted';

const ACTIVITY_TYPES:
    readonly ActivityType[] = [
    'idea_created',
    'project_created',
    'person_joined',
    'status_changed',
    'idea_converted',
];

export function isActivityType(
    v: string,
): v is ActivityType {
    return (ACTIVITY_TYPES as readonly string[])
        .includes(v);
}

export function assertActivityType(
    v: string,
    label: string,
): ActivityType {
    if (!isActivityType(v)) {
        throw new Error(
            'expected ActivityType for '
                + label + ', got ' + v,
        );
    }
    return v;
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

export function assertProjectStatus(
    v: string,
    label: string,
): ProjectStatus {
    if (!includes(PROJECT_STATUSES, v)) {
        throw new Error(
            'expected ProjectStatus for '
                + label + ', got ' + v,
        );
    }
    return v;
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

export function assertIdeaStatus(
    v: string,
    label: string,
): IdeaStatus {
    if (!includes(IDEA_STATUSES, v)) {
        throw new Error(
            'expected IdeaStatus for '
                + label + ', got ' + v,
        );
    }
    return v;
}

const WORKER_STATUSES: readonly WorkerStatus[] =
    ['active', 'pending', 'deactivated'];

export function isWorkerStatus(
    v: string,
): v is WorkerStatus {
    return includes(
        WORKER_STATUSES, v,
    );
}

export function assertWorkerStatus(
    v: string,
    label: string,
): WorkerStatus {
    if (!includes(WORKER_STATUSES, v)) {
        throw new Error(
            'expected WorkerStatus for '
                + label + ', got ' + v,
        );
    }
    return v;
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

export function assertReadinessLevel(
    v: string,
    label: string,
): ReadinessLevel {
    if (!includes(READINESS_LEVELS, v)) {
        throw new Error(
            'expected ReadinessLevel for '
                + label + ', got ' + v,
        );
    }
    return v;
}

export const MS_PER_SECOND = 1000;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
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

export interface HumanWorkerEntity {
    id: WorkerId;
    first_name: string;
    last_name: string;
    email: string;
    title: string;
    department: string;
    status: WorkerStatus;
    strengths: JsonArrayField;
    team_dimensions: JsonObjectField;
    phone: string;
    bio: string;
}

export class HumanWorker {
    readonly kind = 'human' as const;
    readonly #id: WorkerId;
    readonly #firstName: string;
    readonly #lastName: string;
    readonly #email: string;
    readonly #title: string;
    readonly #department: string;
    readonly #status: WorkerStatus;
    readonly #strengths: string;
    readonly #teamDimensions: string;
    readonly #phone: string;
    readonly #bio: string;

    constructor(
        entity: HumanWorkerEntity,
    ) {
        this.#id = entity.id;
        this.#firstName =
            entity.first_name;
        this.#lastName =
            entity.last_name;
        this.#email = entity.email;
        this.#title = entity.title;
        this.#department =
            entity.department;
        this.#status = entity.status;
        this.#strengths =
            entity.strengths;
        this.#teamDimensions =
            entity.team_dimensions;
        this.#phone = entity.phone;
        this.#bio = entity.bio;
    }

    idForLink(): string {
        return this.#id;
    }

    firstNameText(): string {
        return this.#firstName;
    }

    lastNameText(): string {
        return this.#lastName;
    }

    fullName(): string {
        return (
            `${this.#firstName}`
            + ` ${this.#lastName}`
        ).trim();
    }

    titleLabel(): string {
        return this.#title;
    }

    departmentLabel(): string {
        return this.#department;
    }

    emailAddress(): string {
        return this.#email;
    }

    phoneNumber(): string {
        return this.#phone;
    }

    bioText(): string {
        return this.#bio;
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
            WORKER_STATUS_CONFIG[
                this.#status
            ]
        )!.label;
    }

    statusClassName(): string {
        return (
            WORKER_STATUS_CONFIG[
                this.#status
            ]
        )!.className;
    }

    hasDepartment(): boolean {
        return this.#department !== '';
    }

    statusValue(): WorkerStatus {
        return this.#status;
    }

    parsedStrengths(): string[] {
        return validateStringArrayJson(
            this.#strengths,
            'humanWorker.strengths',
        );
    }

    parsedTeamDimensions():
        Record<string, number> {
        return (
            validateStringNumberRecordJson(
                this.#teamDimensions,
                'humanWorker.teamDimensions',
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
            || this.#title
                .toLowerCase()
                .includes(t)
            || this.#department
                .toLowerCase()
                .includes(t)
        );
    }

}

export interface AIWorkerEntity {
    id: WorkerId;
    name: string;
    provider: string;
    description: string;
    auth_token: string;
    created_at: string;
}

export class AIWorker {
    readonly kind = 'ai' as const;
    readonly #id: WorkerId;
    readonly #name: string;
    readonly #provider: string;
    readonly #description: string;
    readonly #authToken: string;
    readonly #createdAt: string;

    constructor(
        entity: AIWorkerEntity,
    ) {
        this.#id = entity.id;
        this.#name = entity.name;
        this.#provider = entity.provider;
        this.#description =
            entity.description;
        this.#authToken =
            entity.auth_token;
        this.#createdAt =
            entity.created_at;
    }

    idForLink(): string {
        return this.#id;
    }

    nameText(): string {
        return this.#name;
    }

    providerText(): string {
        return this.#provider;
    }

    descriptionText(): string {
        return this.#description;
    }

    createdAtIso(): string {
        return this.#createdAt;
    }

    maskedToken(): string {
        const t = this.#authToken;
        if (t.length <= 4) return t;
        return (
            t.slice(0, 3)
            + '…'
            + t.slice(-4)
        );
    }

    matchesSearch(term: string): boolean {
        const t = term.toLowerCase();
        return (
            this.#name
                .toLowerCase()
                .includes(t)
            || this.#provider
                .toLowerCase()
                .includes(t)
            || this.#description
                .toLowerCase()
                .includes(t)
        );
    }
}

export type Worker = HumanWorker | AIWorker;

export function isHumanWorker(
    w: Worker,
): w is HumanWorker {
    return w.kind === 'human';
}

export function isAIWorker(
    w: Worker,
): w is AIWorker {
    return w.kind === 'ai';
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

export type ObjectiveId = Id;

export interface Objective {
    id: ObjectiveId;
    position: number;
}

export interface ObjectiveRevision {
    id: string;
    objective_id: ObjectiveId;
    name: string;
    description: string;
    revised_at: string;
}

export interface DeprecatedObjective {
    id: string;
    objective_id: ObjectiveId;
    deprecated_at: string;
}

export interface ProjectObjectiveBaselineScore {
    id: string;
    project_id: Id;
    objective_id: ObjectiveId;
    score: number;
    scored_at: string;
}

export interface ProjectObjectiveActualScore {
    id: string;
    project_id: Id;
    objective_id: ObjectiveId;
    score: number;
    scored_at: string;
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
    position: number;
    business_context: JsonObjectField;
    timeline_label: string;
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
    isCreate: boolean;
    isArchive: boolean;
    workerIds: WorkerId[];
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
export const DEFAULT_NODE_WORKER_IDS:
    readonly WorkerId[] = [];

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
    person_id: Id;
    transitioned_at: string;
}

// Per-field values written when a transition fires.
// Replaces the former JSON `values` blob on
// work_order_transitions — a relation belongs in a
// table, not a column. (Codd 1NF.)
export interface TransitionFieldValueEntity {
    id: Id;
    transition_id: Id;
    field_id: Id;
    value: string;
}

export interface WorkOrderClaimEntity {
    id: Id;
    work_order_id: Id;
    person_id: Id;
    claimed_at: string;
}

export interface OrganizationEntity {
    id: Id;
    name: string;
    domain: string;
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
    active_people: number;
}

export interface IdeaSubmissionEntity {
    id: Id;
    idea_id: Id;
    person_id: Id;
    created_at: string;
}

export interface ActivityActorEntity {
    id: Id;
    activity_id: Id;
    person_id: Id;
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

export const WORKER_STATUS_CONFIG: Record<
    WorkerStatus,
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
    readonly #position: number;
    readonly #businessContext: string;
    readonly #timelineLabel: string;

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
        this.#position = entity.position;
        this.#businessContext =
            entity.business_context;
        this.#timelineLabel =
            entity.timeline_label;
    }

    isDeleted(): boolean {
        return this.#status === 'deleted';
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


import {
    validateStringArrayJson,
    validateStringNumberRecordJson,
} from './validators.ts';

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

// The state alphabet for workers. Three values
// shared by humans and AIs. Commandment III
// (Uniformity): one terminal state across both
// kinds. Stage 10b+c retires the dual-vocabulary
// snowflake — both humans and AIs now end at
// 'archived'.
export const WORKER_STATES = [
    'active',
    'pending',
    'archived',
] as const;

export type WorkerState = typeof WORKER_STATES[number];

// The composite state alphabet for ideas. Three
// 'active' sub-states encode the readiness dimension;
// the remaining six states stand alone. One string,
// one truth — the dual-column representation that
// preceded this is retired (Stage 8b+c).
export const IDEA_STATES = [
    'active:incomplete',
    'active:needs-info',
    'active:ready',
    'in-review',
    'approved',
    'promoted',
    'sent-back',
    'archived',
    'deleted',
] as const;

export type IdeaState = typeof IDEA_STATES[number];

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

// The state alphabet for projects. Stage 9b+c
// retires the dual-column representation; the
// states log IS the truth. Projects have no
// composite dimension — each state stands alone.
export const PROJECT_STATES = [
    'submitted',
    'under-review',
    'sent-back',
    'approved',
    'declined',
    'completed',
    'deleted',
] as const;

export type ProjectState = typeof PROJECT_STATES[number];

// The state alphabet for flows. Three lifecycle
// states plus 'updated' for content-change events
// (graph edits, name/description/lock changes,
// auto-layout). The states log carries the full
// audit trail — the retired created_at /
// updated_at columns are now derived from the
// head and tail of the entity's event sequence.
export const FLOW_STATES = [
    'active',
    'archived',
    'deleted',
    'updated',
] as const;

export type FlowState = typeof FLOW_STATES[number];

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

export function isProjectState(
    v: string,
): v is ProjectState {
    return includes(
        PROJECT_STATES, v,
    );
}

export function assertProjectState(
    v: string,
    label: string,
): ProjectState {
    if (!includes(PROJECT_STATES, v)) {
        throw new Error(
            'expected ProjectState for '
                + label + ', got ' + v,
        );
    }
    return v;
}

export function isIdeaState(
    v: string,
): v is IdeaState {
    return includes(
        IDEA_STATES, v,
    );
}

export function assertIdeaState(
    v: string,
    label: string,
): IdeaState {
    if (!includes(IDEA_STATES, v)) {
        throw new Error(
            'expected IdeaState for '
                + label + ', got ' + v,
        );
    }
    return v;
}

export function isWorkerState(
    v: string,
): v is WorkerState {
    return includes(
        WORKER_STATES, v,
    );
}

export function assertWorkerState(
    v: string,
    label: string,
): WorkerState {
    if (!includes(WORKER_STATES, v)) {
        throw new Error(
            'expected WorkerState for '
                + label + ', got ' + v,
        );
    }
    return v;
}

export function isFlowState(
    v: string,
): v is FlowState {
    return includes(FLOW_STATES, v);
}

export function assertFlowState(
    v: string,
    label: string,
): FlowState {
    if (!includes(FLOW_STATES, v)) {
        throw new Error(
            'expected FlowState for '
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

export interface StateEntity {
    id: Id;
    entity_id: Id;
    state: string;
    worker_id: Id;
    at: string;
}

export const SYSTEM_WORKER_ID: Id = 'system';

export interface HumanWorkerEntity {
    id: WorkerId;
    first_name: string;
    last_name: string;
    email: string;
    title: string;
    department: string;
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
    readonly #state: WorkerState;
    readonly #strengths: string;
    readonly #teamDimensions: string;
    readonly #phone: string;
    readonly #bio: string;

    constructor(
        entity: HumanWorkerEntity,
        state: WorkerState,
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
        this.#state = state;
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

    name(): string {
        return this.fullName();
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
        return this.#state === 'active';
    }

    isPending(): boolean {
        return this.#state === 'pending';
    }

    isArchived(): boolean {
        return this.#state === 'archived';
    }

    stateLabel(): string {
        return (
            WORKER_STATE_CONFIG[this.#state]
        )!.label;
    }

    stateClassName(): string {
        return (
            WORKER_STATE_CONFIG[this.#state]
        )!.className;
    }

    hasDepartment(): boolean {
        return this.#department !== '';
    }

    stateValue(): WorkerState {
        return this.#state;
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
        const lowerTerm = term.toLowerCase();
        return (
            this.fullName()
                .toLowerCase()
                .includes(lowerTerm)
            || this.#email
                .toLowerCase()
                .includes(lowerTerm)
            || this.#title
                .toLowerCase()
                .includes(lowerTerm)
            || this.#department
                .toLowerCase()
                .includes(lowerTerm)
        );
    }

}

export interface AIWorkerEntity {
    id: WorkerId;
    name: string;
    provider: string;
    description: string;
    auth_token: string;
}

export class AIWorker {
    readonly kind = 'ai' as const;
    readonly #id: WorkerId;
    readonly #name: string;
    readonly #provider: string;
    readonly #description: string;
    readonly #authToken: string;
    readonly #state: WorkerState;

    constructor(
        entity: AIWorkerEntity,
        state: WorkerState,
    ) {
        this.#id = entity.id;
        this.#name = entity.name;
        this.#provider = entity.provider;
        this.#description =
            entity.description;
        this.#authToken =
            entity.auth_token;
        this.#state = state;
    }

    idForLink(): string {
        return this.#id;
    }

    nameText(): string {
        return this.#name;
    }

    name(): string {
        return this.nameText();
    }

    providerText(): string {
        return this.#provider;
    }

    descriptionText(): string {
        return this.#description;
    }

    maskedToken(): string {
        const token = this.#authToken;
        if (token.length <= 4) return token;
        return (
            token.slice(0, 3)
            + '…'
            + token.slice(-4)
        );
    }

    isActive(): boolean {
        return this.#state === 'active';
    }

    isPending(): boolean {
        return this.#state === 'pending';
    }

    isArchived(): boolean {
        return this.#state === 'archived';
    }

    stateLabel(): string {
        return (
            WORKER_STATE_CONFIG[this.#state]
        )!.label;
    }

    stateClassName(): string {
        return (
            WORKER_STATE_CONFIG[this.#state]
        )!.className;
    }

    stateValue(): WorkerState {
        return this.#state;
    }

    matchesSearch(term: string): boolean {
        const lowerTerm = term.toLowerCase();
        return (
            this.#name
                .toLowerCase()
                .includes(lowerTerm)
            || this.#provider
                .toLowerCase()
                .includes(lowerTerm)
            || this.#description
                .toLowerCase()
                .includes(lowerTerm)
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
    problem_statement: string;
    target_users: string;
    proposed_solution: string;
    expected_outcome: string;
    success_metrics: string;
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
    at: string;
}

export interface ProjectObjectiveBaselineScore {
    id: string;
    project_id: Id;
    objective_id: ObjectiveId;
    score: number;
    at: string;
}

export interface ProjectObjectiveActualScore {
    id: string;
    project_id: Id;
    objective_id: ObjectiveId;
    score: number;
    at: string;
}

export interface ProjectEntity {
    id: Id;
    title: string;
    description: string;
    progress: number;
    start_date: string;
    target_end_date: string;
    estimated_cost: number;
    actual_cost: number;
    position: number;
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
    at: string;
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
}

export interface FlowWorkOrderEntity {
    id: Id;
    flow_id: Id;
    work_order_id: Id;
    at: string;
}

// Per-field values written when a state event
// records a work-order transition. Each row pins
// the payload to its parent event by state_event_id
// (Codd 1NF — a relation belongs in a table, not a
// column on the event row).
export interface StateFieldValueEntity {
    id: Id;
    state_event_id: Id;
    field_id: Id;
    value: string;
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
    ideas_limit: number;
    health_score: number;
    health_status: string;
    last_activity: string;
}

export interface IdeaSubmissionEntity {
    id: Id;
    idea_id: Id;
    worker_id: Id;
    at: string;
}

export interface ProjectFlowEntity {
    id: Id;
    project_id: Id;
    flow_id: Id;
    at: string;
}

export interface StatusDisplay {
    label: string;
    className: string;
}

// Visual identity preserved across the Stage 10b+c
// rename: the 'archived' badge keeps the
// 'badge-default' className it inherited from the
// retired terminal state, so existing CSS
// continues to color it correctly. The label text
// updates to match the new vocabulary.
export const WORKER_STATE_CONFIG: Record<
    WorkerState,
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
    archived: {
        label: 'Archived',
        className: 'badge-default',
    },
};

export const IDEA_STATE_CONFIG: Record<
    IdeaState,
    StatusDisplay
> = {
    'active:incomplete': {
        label: 'Active · Incomplete',
        className: 'badge-success',
    },
    'active:needs-info': {
        label: 'Active · Needs Info',
        className: 'badge-success',
    },
    'active:ready': {
        label: 'Active · Ready',
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

export const PROJECT_STATE_CONFIG: Record<
    ProjectState,
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
        label: 'Completed',
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

export class Idea {
    readonly #id: string;
    readonly #title: string;
    readonly #position: number;
    readonly #state: IdeaState;
    readonly #problemStatement: string;
    readonly #targetUsers: string;
    readonly #proposedSolution: string;
    readonly #expectedOutcome: string;
    readonly #successMetrics: string;

    constructor(
        entity: IdeaEntity,
        state: IdeaState,
    ) {
        this.#id = entity.id;
        this.#title = entity.title;
        this.#position = entity.position;
        this.#state = state;
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
    }

    isReviewable(): boolean {
        return this.#state === 'in-review';
    }

    isConvertible(): boolean {
        return this.#state === 'approved';
    }

    canBeSubmittedForReview(): boolean {
        return this.#state.startsWith('active:')
            || this.#state === 'sent-back';
    }

    stateLabel(): string {
        return (
            IDEA_STATE_CONFIG[this.#state]
        )!.label;
    }

    stateClassName(): string {
        return (
            IDEA_STATE_CONFIG[this.#state]
        )!.className;
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

    stateValue(): IdeaState {
        return this.#state;
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
}

export class Project {
    readonly #id: string;
    readonly #title: string;
    readonly #description: string;
    readonly #state: ProjectState;
    readonly #progress: number;
    readonly #startDate: string;
    readonly #targetEndDate: string;
    readonly #estimatedCost: number;
    readonly #actualCost: number;
    readonly #position: number;

    constructor(
        entity: ProjectEntity,
        state: ProjectState,
    ) {
        this.#id = entity.id;
        this.#title = entity.title;
        this.#description =
            entity.description;
        this.#state = state;
        this.#progress = entity.progress;
        this.#startDate =
            entity.start_date;
        this.#targetEndDate =
            entity.target_end_date;
        this.#estimatedCost =
            entity.estimated_cost;
        this.#actualCost =
            entity.actual_cost;
        this.#position = entity.position;
    }

    isDeleted(): boolean {
        return this.#state === 'deleted';
    }

    timelineProgress(): number {
        if (this.#state === 'completed')
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

    stateLabel(): string {
        return (
            PROJECT_STATE_CONFIG[
                this.#state
            ]
        )!.label;
    }

    stateClassName(): string {
        return (
            PROJECT_STATE_CONFIG[
                this.#state
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

    stateValue(): ProjectState {
        return this.#state;
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
        const lowerTerm = term.toLowerCase();
        return this.#title
            .toLowerCase()
            .includes(lowerTerm);
    }
}

export function ideaIsVisible(
    state: IdeaState,
): boolean {
    return state !== 'archived'
        && state !== 'deleted';
}

export function projectStateIsNotDeleted(
    state: ProjectState,
): boolean {
    return state !== 'deleted';
}

export function projectStateIsApproved(
    state: ProjectState,
): boolean {
    return state === 'approved';
}

export function projectStateIsScorable(
    state: ProjectState,
): boolean {
    return state === 'under-review';
}

export function projectStateAllowsMeasurement(
    state: ProjectState,
): boolean {
    return state === 'approved';
}


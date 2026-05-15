import type {
    Id,
    HumanWorkerEntity,
    AIWorkerEntity,
    IdeaEntity,
    ProjectEntity,
    ActivityEntity,
    FlowEntity,
    FlowVersionEntity,
    OrganizationEntity,
    IdeaSubmissionEntity,
    ActivityActorEntity,
    ProjectFlowEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    WorkOrderTransitionEntity,
    WorkOrderClaimEntity,
    TransitionFieldValueEntity,
    Objective,
    ObjectiveRevision,
    DeprecatedObjective,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from './types.ts';

export class EntityNotFound {
    readonly message: string;
    readonly table: string;
    readonly id: string;
    constructor(
        table: string,
        id: string,
    ) {
        this.table = table;
        this.id = id;
        this.message =
            `Not found: ${table}/${id}`;
    }
}

export class MissingTableError extends Error {
    readonly table: string;
    constructor(table: string) {
        super(
            `Schema is missing table "${table}".`
            + ' Recreate the schema from snapshots.',
        );
        this.table = table;
        this.name = 'MissingTableError';
    }
}

export interface EntityStore<
    T extends { id: string },
> {
    getAll(): Promise<T[]>;
    getById(id: string): Promise<T>;
    put(
        id: string,
        fields: Omit<T, 'id'>,
    ): Promise<T>;
    delete(id: string): Promise<void>;
}

export interface SingletonStore<
    T extends { id: string },
> {
    get(): Promise<T>;
    put(fields: Omit<T, 'id'>): Promise<T>;
}

export interface DeletedStore {
    isDeleted(id: Id): Promise<boolean>;
    record(id: Id): Promise<void>;
    allDeletedIds(): Promise<Set<Id>>;
}

// The byte-level seam. Store classes compose a backend
// to obtain rows; backends own persistence + encoding,
// stores own semantics (tombstones, splices, singletons).
export interface StorageBackend {
    read<T extends { id: string }>(
        table: string,
    ): Promise<T[]>;
    write<T extends { id: string }>(
        table: string,
        rows: T[],
    ): Promise<void>;
    remove(table: string): Promise<void>;
    clearAll(): Promise<void>;
    list(): Promise<string[]>;
}

export interface DbAdapter {
    initialize(): Promise<void>;
    close(): Promise<void>;
    flush(): Promise<void>;
    deleteSchema(): Promise<void>;
    hasSchema(): Promise<boolean>;
    createSchema(): Promise<void>;
    exportSnapshot():
        Promise<string>;
    importSnapshot(
        json: string,
    ): Promise<void>;

    workers:
        EntityStore<HumanWorkerEntity>;
    aiWorkers:
        EntityStore<AIWorkerEntity>;
    ideas:
        EntityStore<IdeaEntity>;
    projects:
        EntityStore<ProjectEntity>;
    activities:
        EntityStore<ActivityEntity>;
    flows:
        EntityStore<FlowEntity>;
    flowVersions:
        EntityStore<FlowVersionEntity>;
    projectFlows:
        EntityStore<
            ProjectFlowEntity
        >;
    workOrders:
        EntityStore<
            WorkOrderEntity
        >;
    flowWorkOrders:
        EntityStore<
            FlowWorkOrderEntity
        >;
    workOrderTransitions:
        EntityStore<
            WorkOrderTransitionEntity
        >;
    transitionFieldValues:
        EntityStore<
            TransitionFieldValueEntity
        >;
    workOrderClaims:
        EntityStore<
            WorkOrderClaimEntity
        >;
    organization:
        SingletonStore<OrganizationEntity>;
    ideaSubmissions:
        EntityStore<
            IdeaSubmissionEntity
        >;
    activityActors:
        EntityStore<
            ActivityActorEntity
        >;
    objectives:
        EntityStore<Objective>;
    objectiveRevisions:
        EntityStore<ObjectiveRevision>;
    deprecatedObjectives:
        EntityStore<DeprecatedObjective>;
    projectObjectiveBaselineScores:
        EntityStore<
            ProjectObjectiveBaselineScore
        >;
    projectObjectiveActualScores:
        EntityStore<
            ProjectObjectiveActualScore
        >;
    deleted: DeletedStore;
}

export const TABLE_NAMES = [
    'workers',
    'ai_workers',
    'ideas',
    'projects',
    'activities',
    'flows',
    'flow_versions',
    'project_flows',
    'work_orders',
    'flow_work_orders',
    'work_order_transitions',
    'transition_field_values',
    'work_order_claims',
    'organization',
    'idea_submissions',
    'activity_actors',
    'objectives',
    'objective_revisions',
    'deprecated_objectives',
    'project_objective_baseline_scores',
    'project_objective_actual_scores',
    'deleted',
];

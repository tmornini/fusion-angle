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
    StateFieldValueEntity,
    Objective,
    ObjectiveRevision,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
    StateEntity,
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

export interface StateStore {
    getAll(): Promise<StateEntity[]>;
    getById(id: Id): Promise<StateEntity>;
    put(
        id: Id,
        fields: Omit<StateEntity, 'id'>,
    ): Promise<StateEntity>;
    record(
        id: Id,
        entityId: Id,
        state: string,
        workerId: Id,
    ): Promise<void>;
    currentFor(
        entityId: Id,
    ): Promise<StateEntity | null>;
    allFor(entityId: Id): Promise<StateEntity[]>;
    deletedIds(): Promise<Set<Id>>;
    isDeleted(id: Id): Promise<boolean>;
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
    stateFieldValues:
        EntityStore<
            StateFieldValueEntity
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
    projectObjectiveBaselineScores:
        EntityStore<
            ProjectObjectiveBaselineScore
        >;
    projectObjectiveActualScores:
        EntityStore<
            ProjectObjectiveActualScore
        >;
    states: StateStore;
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
    'state_field_values',
    'organization',
    'idea_submissions',
    'activity_actors',
    'objectives',
    'objective_revisions',
    'project_objective_baseline_scores',
    'project_objective_actual_scores',
    'states',
];

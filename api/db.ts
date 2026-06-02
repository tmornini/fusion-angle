import type {
    Id,
    WorkerEntity,
    HumanWorkerEntity,
    AIWorkerEntity,
    IdeaEntity,
    ProjectEntity,
    FlowEntity,
    FlowVersionEntity,
    OrganizationEntity,
    IdeaSubmissionEntity,
    ProjectFlowEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    StateFieldValueEntity,
    RecordEntity,
    RecordAttributeEntity,
    FlowRecordEntity,
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

export interface EntityPut<
    T extends { id: string },
> {
    readonly id: string;
    readonly fields: Omit<T, 'id'>;
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
    putMany(
        entries: readonly EntityPut<T>[],
        deleteIds: readonly string[],
    ): Promise<void>;
    delete(id: string): Promise<void>;
}

// The storage-edge validator. Stores accept one at
// construction and re-verify every `put` body through
// it — the same telling-shape function used by the
// HTTP route validator. Threaded into stores so the
// gate sits at the storage edge, not only at the
// route layer.
export type EntityValidator<
    T extends { id: string },
> = (
    body: Record<string, unknown>,
) => Omit<T, 'id'>;

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

    simulateLatency(): Promise<void>;

    workers:
        EntityStore<WorkerEntity>;
    humanWorkers:
        EntityStore<HumanWorkerEntity>;
    aiWorkers:
        EntityStore<AIWorkerEntity>;
    ideas:
        EntityStore<IdeaEntity>;
    projects:
        EntityStore<ProjectEntity>;
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
    records:
        EntityStore<RecordEntity>;
    recordAttributes:
        EntityStore<RecordAttributeEntity>;
    flowRecords:
        EntityStore<FlowRecordEntity>;
    organization:
        SingletonStore<OrganizationEntity>;
    ideaSubmissions:
        EntityStore<
            IdeaSubmissionEntity
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
    'human_workers',
    'ai_workers',
    'ideas',
    'projects',
    'flows',
    'flow_versions',
    'project_flows',
    'work_orders',
    'flow_work_orders',
    'state_field_values',
    'records',
    'record_attributes',
    'flow_records',
    'organization',
    'idea_submissions',
    'objectives',
    'objective_revisions',
    'project_objective_baseline_scores',
    'project_objective_actual_scores',
    'states',
];

import type {
    Id,
    MemberEntity,
    HumanMemberEntity,
    AIMemberEntity,
    IdentityEntity,
    IdentityPiiEntity,
    IdentityCredentialEntity,
    IdentityTokenRevocationEntity,
    IdentityDefaultOrgEntity,
    RoleGrantEntity,
    IdentityTokenEntity,
    ClientEntity,
    IdentityProviderEntity,
    AuthorizationCodeEntity,
    IdeaEntity,
    ProjectEntity,
    FlowEntity,
    FlowVersionEntity,
    OrganizationEntity,
    MembershipEntity,
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
        memberId: Id,
    ): Promise<void>;
    currentFor(
        entityId: Id,
    ): Promise<StateEntity | null>;
    allFor(entityId: Id): Promise<StateEntity[]>;
    deletedIds(): Promise<Set<Id>>;
    isDeleted(id: Id): Promise<boolean>;
    // The *In twins read the log within an already-open tx,
    // so a joined reader scans states in the same
    // transaction that reads the entity row.
    currentForIn(
        tx: Tx,
        entityId: Id,
    ): Promise<StateEntity | null>;
    allForIn(tx: Tx, entityId: Id): Promise<StateEntity[]>;
    deletedIdsIn(tx: Tx): Promise<Set<Id>>;
    isDeletedIn(tx: Tx, id: Id): Promise<boolean>;
}

export type TxMode = 'readonly' | 'readwrite';

// A row-granular handle over one transaction. `get`
// returns null for an absent row — absence is modeled at
// the call site, never via a sentinel. The handle is the
// real primitive Phase B fulfills with a native
// IndexedDB transaction; memory + localStorage simulate
// it transitionally (buffer touched tables, flush on
// success, discard on throw).
export interface Tx {
    get<T extends { id: string }>(
        table: string,
        id: string,
    ): Promise<T | null>;
    getAll<T extends { id: string }>(
        table: string,
    ): Promise<T[]>;
    put<T extends { id: string }>(
        table: string,
        row: T,
    ): Promise<void>;
    delete(table: string, id: string): Promise<void>;
    clear(table: string): Promise<void>;
}

// The byte-level seam. Store classes compose a backend
// to obtain rows; backends own persistence + encoding,
// stores own semantics (tombstones, splices, singletons).
// `transaction` is the primitive every row op crosses;
// `ensureTables` is schema lifecycle, never a row op.
export interface StorageBackend {
    transaction<R>(
        tables: readonly string[],
        mode: TxMode,
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R>;
    ensureTables(
        tables: readonly string[],
    ): Promise<void>;
    // Schema lifecycle — storage-level because each tier
    // signals "schema exists" differently: the simulated
    // backends by table existence, IndexedDB by a marker
    // store (its object stores always exist post-upgrade).
    hasSchema(): Promise<boolean>;
    createSchema(): Promise<void>;
    deleteSchema(): Promise<void>;
}

// How a store reaches storage. Standalone, a store opens a
// fresh single-op transaction via `backendRunner`; joined
// to an open view, it returns the open `tx` via
// `ambientRunner` — no AsyncLocalStorage, no ambient global,
// just the runner the store was handed at construction.
export type TxRunner = <R>(
    tables: readonly string[],
    mode: TxMode,
    fn: (tx: Tx) => Promise<R>,
) => Promise<R>;

export const backendRunner = (
    backend: StorageBackend,
): TxRunner =>
    (tables, mode, fn) =>
        backend.transaction(tables, mode, fn);

// Join the open tx: the declared tables/mode are the open
// transaction's already, so this ignores them and runs `fn`
// against the same handle.
export const ambientRunner = (tx: Tx): TxRunner =>
    (_tables, _mode, fn) => fn(tx);

// The 32 stores an adapter exposes, factored out of
// DbAdapter so an adapter can build the whole bundle in one
// place (`#buildStores`) and a transaction can rebuild it
// bound to an open tx (A9).
export interface DbStores {
    members:
        EntityStore<MemberEntity>;
    humanMembers:
        EntityStore<HumanMemberEntity>;
    aiMembers:
        EntityStore<AIMemberEntity>;
    identities:
        EntityStore<IdentityEntity>;
    identityPii:
        EntityStore<IdentityPiiEntity>;
    identityCredentials:
        EntityStore<IdentityCredentialEntity>;
    identityTokenRevocations:
        EntityStore<IdentityTokenRevocationEntity>;
    identityDefaultOrgs:
        EntityStore<IdentityDefaultOrgEntity>;
    roleGrants:
        EntityStore<RoleGrantEntity>;
    identityTokens:
        EntityStore<IdentityTokenEntity>;
    clients:
        EntityStore<ClientEntity>;
    identityProviders:
        EntityStore<IdentityProviderEntity>;
    authorizationCodes:
        EntityStore<AuthorizationCodeEntity>;
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
    organizations:
        EntityStore<OrganizationEntity>;
    memberships:
        EntityStore<MembershipEntity>;
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

export interface DbAdapter extends DbStores {
    initialize(): Promise<void>;
    close(): Promise<void>;
    flush(): Promise<void>;
    deleteSchema(): Promise<void>;
    hasSchema(): Promise<boolean>;
    createSchema(): Promise<void>;
    exportSnapshot(): Promise<string>;
    importSnapshot(json: string): Promise<void>;
    simulateLatency(): Promise<void>;
    // Run `fn` inside one transaction. The view it receives
    // exposes the same stores bound to the open tx, so every
    // op joins it — GET-modify-PUT and multi-PUT commit
    // atomically. A nested view.transaction throws.
    transaction<R>(
        tables: readonly string[],
        fn: (view: DbAdapter) => Promise<R>,
    ): Promise<R>;
}

export const TABLE_NAMES = [
    'members',
    'human_members',
    'ai_members',
    'identities',
    'identity_pii',
    'identity_credentials',
    'identity_token_revocations',
    'identity_default_orgs',
    'role_grants',
    'identity_tokens',
    'clients',
    'identity_providers',
    'authorization_codes',
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
    'organizations',
    'memberships',
    'idea_submissions',
    'objectives',
    'objective_revisions',
    'project_objective_baseline_scores',
    'project_objective_actual_scores',
    'states',
];

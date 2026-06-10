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
    InvitationEntity,
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

// A re-put of an existing ledger event with a DIFFERENT
// payload is an attempt to rewrite history — surfaced as a
// conflict, never applied. The identical re-put stays
// silent: that is the idempotent retry the id-keyed PUT
// exists for.
export class LedgerImmutabilityError extends Error {
    readonly table: string;
    readonly id: string;
    constructor(table: string, id: string) {
        super(
            `Ledger event ${table}/${id} exists with a`
            + ' different payload; the log is append-only',
        );
        this.table = table;
        this.id = id;
        this.name = 'LedgerImmutabilityError';
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

// A keyed sub-collection read: the rows of one table whose
// indexed `column` equals `key`, tombstones already removed.
// The concrete EntityStore implements it over `Tx.getWhere`,
// so the org fence narrows a collection to its tenant through
// the organization_id index instead of scanning the whole
// table and filtering in JS. Kept OFF the EntityStore
// contract — the decorators and the history store would only
// carry a read they never serve (Interface Segregation).
export interface KeyedCollectionReader<
    T extends { id: string },
> {
    getAllWhere(
        column: string,
        key: string,
    ): Promise<T[]>;
}

// Reach a store's keyed sub-collection read, kept off the
// EntityStore contract by Interface Segregation. Both concrete
// leaf stores (EntityStore + HistoryEntityStore) implement it,
// so the cast is sound for every fenced or cold-spine store
// that narrows a collection through a secondary index — the one
// documented home for the assertion the DbStores types erase.
export function keyed<T extends { id: string }>(
    store: EntityStore<T>,
): KeyedCollectionReader<T> {
    return store as EntityStore<T> & KeyedCollectionReader<T>;
}

// The write-side fence capability: peek + decide + write in
// ONE transaction, so no concurrent writer can slip between
// the check and the row op. The peek hands each guard the
// RAW row (or null when absent) — tombstone-blind, because a
// fence must decide on the row that EXISTS, not the row
// lifecycle presents. putGuarded's guard throws to reject
// (the tx aborts, nothing written); deleteGuarded's guard
// returns whether to splice — false is a silent no-op, so a
// replayed or foreign DELETE is indistinguishable from
// deleting an absent row (Commandment VII). putManyGuarded
// applies both guards inside the batch's one transaction.
export interface GuardedEntityWriter<
    T extends { id: string },
> {
    putGuarded(
        id: string,
        fields: Omit<T, 'id'>,
        guard: (
            existing: T | null,
            id: string,
        ) => void,
    ): Promise<T>;
    putManyGuarded(
        entries: readonly EntityPut<T>[],
        deleteIds: readonly string[],
        putGuard: (
            existing: T | null,
            id: string,
        ) => void,
        deleteGuard: (existing: T | null) => boolean,
    ): Promise<void>;
    deleteGuarded(
        id: string,
        guard: (existing: T | null) => boolean,
    ): Promise<void>;
}

// Reach a store's guarded write capability, kept off the
// EntityStore contract by Interface Segregation — only the
// org fence needs it. Both concrete leaf stores implement
// it, so the cast is sound for every fenced store — the same
// documented assertion home as keyed().
export function guarded<T extends { id: string }>(
    store: EntityStore<T>,
): GuardedEntityWriter<T> {
    return store as EntityStore<T> & GuardedEntityWriter<T>;
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
    // The rows where `column` equals `key` — the indexed
    // answer to `WHERE column = key`, served without
    // scanning the table. `column` must carry a secondary
    // index (TABLE_INDEXES); the native factory resolves it
    // to `store.index(column)`. The matches keep each tier's
    // own row order, so a reducer folds them exactly as
    // it folds a full read.
    getWhere<T extends { id: string }>(
        table: string,
        column: string,
        key: string,
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
    invitations:
        EntityStore<InvitationEntity>;
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
    'invitations',
    'idea_submissions',
    'objectives',
    'objective_revisions',
    'project_objective_baseline_scores',
    'project_objective_actual_scores',
    'states',
];

// The secondary indexes each store carries: every FK and
// read-discriminator column, declared beside TABLE_NAMES as
// the schema of record both backends read. A keyed read
// (`Tx.getWhere`) names one of these. Index ONLY NOT-NULL
// columns — IndexedDB omits a row missing the keyPath from
// `index.getAll`, and the NOT-NULL covenant guarantees
// declared FKs are present. Tables absent here have no
// narrowing discriminator: the collection IS its rows.
export const TABLE_INDEXES:
    Record<string, readonly string[]> = {
    identity_pii: ['email'],
    identity_credentials: ['identity_id'],
    identity_token_revocations: ['identity_id'],
    identity_default_orgs: ['identity_id'],
    role_grants: ['organization_id', 'identity_id'],
    identity_tokens: ['jti', 'chain_id', 'identity_id'],
    identity_providers: ['identity_id'],
    authorization_codes: ['code', 'identity_id'],
    ideas: ['organization_id'],
    projects: ['organization_id'],
    flows: ['organization_id'],
    flow_versions: ['flow_id'],
    project_flows: ['project_id', 'flow_id'],
    work_orders: ['organization_id'],
    flow_work_orders: ['flow_id', 'work_order_id'],
    state_field_values: ['state_event_id', 'field_id'],
    records: ['organization_id'],
    record_attributes: ['organization_id', 'record_id'],
    flow_records: ['flow_id', 'record_id'],
    memberships: ['organization_id', 'identity_id'],
    invitations: ['organization_id', 'identity_id'],
    idea_submissions: ['idea_id'],
    objectives: ['organization_id'],
    objective_revisions: ['objective_id'],
    project_objective_baseline_scores:
        ['project_id', 'objective_id'],
    project_objective_actual_scores:
        ['project_id', 'objective_id'],
    states: ['entity_id', 'member_id'],
};

import type {
    Id,
    MemberEntity,
    HumanMemberEntity,
    AIMemberEntity,
    IdentityEntity,
    IdentityPiiEntity,
    IdentityCredentialEntity,
    IdentityTokenRevocationEntity,
    IdentityDefaultOrganizationEntity,
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
    ObjectiveRevisionEntity,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
    StateEntity,
} from './types.ts';

export class EntityNotFoundError {
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
    // The keyed sub-collection read: the rows whose indexed
    // `column` equals `key`, tombstones already removed. The
    // concrete stores serve it over `Tx.getWhere`; the fences
    // serve it by matching through the inner index and then
    // filtering to their slice. Every store face honors the
    // same read, so no caller re-acquires it by assertion.
    getAllWhere(
        column: string,
        key: string,
    ): Promise<T[]>;
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

// The full face of an unfenced leaf store: the plain
// contract plus the guarded write capability the org fence
// consumes. Kept off EntityStore by Interface Segregation —
// the fence needs it inward but never re-exposes it.
export type GuardedEntityStore<T extends { id: string }> =
    EntityStore<T> & GuardedEntityWriter<T>;

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
    postEvent(
        id: Id,
        entityId: Id,
        state: string,
        memberId: Id,
    ): Promise<void>;
    getCurrentFor(
        entityId: Id,
    ): Promise<StateEntity | null>;
    getAllFor(entityId: Id): Promise<StateEntity[]>;
    getDeletedIds(): Promise<Set<Id>>;
    isDeleted(id: Id): Promise<boolean>;
    // The *In twins read the log within an already-open tx,
    // so a joined reader scans states in the same
    // transaction that reads the entity row.
    getCurrentForIn(
        tx: Tx,
        entityId: Id,
    ): Promise<StateEntity | null>;
    getAllForIn(tx: Tx, entityId: Id): Promise<StateEntity[]>;
    getDeletedIdsIn(tx: Tx): Promise<Set<Id>>;
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
    postSchemaCreation(): Promise<void>;
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
    identityDefaultOrganizations:
        EntityStore<IdentityDefaultOrganizationEntity>;
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
        EntityStore<ObjectiveRevisionEntity>;
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

// Schema/connection lifecycle plus the snapshot plane — the
// non-row surface every adapter face serves identically.
export interface DbLifecycle {
    initialize(): Promise<void>;
    deleteSchema(): Promise<void>;
    hasSchema(): Promise<boolean>;
    postSchemaCreation(): Promise<void>;
    // Make the named tables writable without declaring the
    // schema present: the installer primitive data loads
    // (seeds, snapshot import) run before their writes.
    ensureTables(
        tables: readonly string[],
    ): Promise<void>;
    getSnapshot(): Promise<string>;
    putSnapshot(json: string): Promise<void>;
}

export interface DbAdapter extends DbLifecycle, DbStores {
    // Run `fn` inside one transaction. The view it receives
    // exposes the same stores bound to the open tx, so every
    // op joins it — GET-modify-PUT and multi-PUT commit
    // atomically. A nested view.transaction throws.
    transaction<R>(
        tables: readonly string[],
        fn: (view: DbAdapter) => Promise<R>,
    ): Promise<R>;
}

// The unfenced tier's stores: every entity store carries the
// guarded write capability the concrete leaf stores
// implement; the states log keeps its own contract.
export type GuardedDbStores = {
    [K in keyof DbStores]: DbStores[K] extends
        EntityStore<infer T>
        ? GuardedEntityStore<T>
        : DbStores[K];
};

// The unfenced tier's honest contract. The org fence consumes
// THIS face, so the guarded write capability is carried by
// the type from construction to use — never re-acquired by
// assertion. The fenced face it returns is a plain DbAdapter:
// the fence spends the guard; it does not re-expose it.
export interface GuardedDbAdapter
    extends DbLifecycle, GuardedDbStores
{
    transaction<R>(
        tables: readonly string[],
        fn: (view: GuardedDbAdapter) => Promise<R>,
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
    'identity_default_organizations',
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

// The secondary indexes each store carries: ONLY the columns
// some keyed read (`Tx.getWhere`) actually names, measured
// against the call sites — never one-per-FK on speculation.
// Declared beside TABLE_NAMES as the schema of record both
// backends read. Index ONLY NOT-NULL columns — IndexedDB
// omits a row missing the keyPath from `index.getAll`, and
// the NOT-NULL covenant guarantees declared FKs are present.
// Tables absent here are read in full or by primary key: the
// collection IS its rows.
export const TABLE_INDEXES:
    Record<string, readonly string[]> = {
    identity_pii: ['email'],
    identity_credentials: ['identity_id'],
    identity_token_revocations: ['identity_id'],
    identity_default_organizations: ['identity_id'],
    role_grants: ['organization_id', 'identity_id'],
    identity_tokens: ['jti', 'chain_id'],
    authorization_codes: ['code'],
    ideas: ['organization_id'],
    projects: ['organization_id'],
    flows: ['organization_id'],
    work_orders: ['organization_id'],
    state_field_values: ['field_id'],
    records: ['organization_id'],
    record_attributes: ['organization_id'],
    objectives: ['organization_id'],
    memberships: ['organization_id', 'identity_id'],
    states: ['entity_id'],
};

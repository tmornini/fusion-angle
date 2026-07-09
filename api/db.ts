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
    ClientEntity,
    IdentityProviderEntity,
    IdeaEntity,
    ProjectEntity,
    FlowEntity,
    FlowVersionEntity,
    FlowNodeEntity,
    FlowEdgeEntity,
    FlowNodeMemberEntity,
    FlowNodeAttributeEntity,
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
    ObjectiveEntity,
    ObjectiveRevisionEntity,
    ProjectObjectiveBaselineScoreEntity,
    ProjectObjectiveActualScoreEntity,
    RequestEntity,
    ResponseEntity,
    StateEntity,
} from './types.ts';
import type { NotificationPost } from './notifications.ts';

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

// A unique-column collision. IndexedDB raises its native
// ConstraintError from the {unique:true} index; the
// simulated tiers scan the declared unique columns before
// buffering. One typed error covers all three backends;
// handleRequest maps it to 412.
export class UniqueConstraintError extends Error {
    readonly table: string;
    readonly column: string;
    constructor(table: string, column: string) {
        super(
            `Unique column ${table}.${column}`
            + ' already holds this value',
        );
        this.table = table;
        this.column = column;
        this.name = 'UniqueConstraintError';
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
        at: string,
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
    // FENCE MECHANICS (Phase 14 Task 6 fix wave): does a row
    // with `id` exist AT ALL, ignoring any organization fence a
    // wrapper applies on top — RAW presence, the same
    // unfenced-escape shape as rawReadRow/rawOrganizationOwned
    // Probes (store-parent-scoped.ts), scoped to this ONE store.
    // A wrapper's getById cannot answer this alone: "no such
    // row" and "a row owned by a different organization" both
    // throw EntityNotFoundError identically, yet
    // state_field_values' own parent-event visibility rule
    // treats them oppositely (the former is a visible orphan,
    // the latter is hidden — db-organization-scoped.ts's
    // stateFieldValues resolver). Retires alongside the
    // row-plane state_field_values plane at Phase Final.
    // Phase 14 Task 7 adjudicated a pair-plane re-point of
    // this same probe infeasible, for the same reason — see
    // api/api.ts's Region B NAMED DEVIATION comment.
    rawHasRow(id: Id): Promise<boolean>;
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

// The 37 stores an adapter exposes, factored out of
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
    clients:
        EntityStore<ClientEntity>;
    identityProviders:
        EntityStore<IdentityProviderEntity>;
    ideas:
        EntityStore<IdeaEntity>;
    projects:
        EntityStore<ProjectEntity>;
    flows:
        EntityStore<FlowEntity>;
    flowVersions:
        EntityStore<FlowVersionEntity>;
    flowNodes:
        EntityStore<FlowNodeEntity>;
    flowEdges:
        EntityStore<FlowEdgeEntity>;
    flowNodeMembers:
        EntityStore<FlowNodeMemberEntity>;
    flowNodeAttributes:
        EntityStore<FlowNodeAttributeEntity>;
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
        EntityStore<ObjectiveEntity>;
    objectiveRevisions:
        EntityStore<ObjectiveRevisionEntity>;
    projectObjectiveBaselineScores:
        EntityStore<
            ProjectObjectiveBaselineScoreEntity
        >;
    projectObjectiveActualScores:
        EntityStore<
            ProjectObjectiveActualScoreEntity
        >;
    requests:
        EntityStore<RequestEntity>;
    responses:
        EntityStore<ResponseEntity>;
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
    // The Decision 5 post hook: fired AFTER a write commits,
    // so cross-tab (and future cross-process) subscribers are
    // informed of state changes — never polled. Carried on the
    // COMMON ancestor of DbAdapter and GuardedDbAdapter so
    // both the fenced view (organizationScopedAdapter) and the
    // open-tx view (#viewForTx) type-check.
    postNotification: NotificationPost;
}

export interface DbAdapter extends DbLifecycle, DbStores {
    // Run `fn` inside one transaction. The view it receives
    // exposes the same stores bound to the open tx, so every
    // op joins it — GET-modify-PUT and multi-PUT commit
    // atomically. A nested view.transaction re-enters this
    // same tx; its tables must be a subset of the outer set.
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
    // Raw single-row read bypassing the EntityStore deleted
    // filter — the shared primitive of the cross-tenant
    // OWNERSHIP FENCE probes: graphEntityProbe (flow_nodes /
    // flow_edges), rawOrganizationOwnedProbes (the org-owned
    // stores), and the field-values parent-event resolution.
    // A deleted entity must still resolve to its TRUE owner,
    // never surface as an ownerless orphan.
    rawReadRow<T extends { id: string }>(
        table: string,
        id: string,
    ): Promise<T | null>;
}

// Phase 13 Task 9 shrank this list by two (identity_tokens,
// authorization_codes retired). IndexedDB's own open is
// UNVERSIONED (backend-indexeddb.ts's #openConnection calls
// indexedDB.open(DB_NAME) with no version argument), so
// onupgradeneeded — the only place object stores are created —
// never re-fires for an origin that already has a database: an
// EXISTING origin keeps the two dropped stores as harmless,
// unread orphans. deleteSchema (a full database delete) is the
// only cleanup; nothing else needs to reconcile them.
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
    'clients',
    'identity_providers',
    'ideas',
    'projects',
    'flows',
    'flow_versions',
    'flow_nodes',
    'flow_edges',
    'flow_node_members',
    'flow_node_attributes',
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
    'requests',
    'responses',
    'states',
];

// The snapshot export's ONE reserved top-level key, stamped
// beside the TABLE_NAMES entries by getSnapshot (api/db-
// backed.ts) and checked by parseAndValidateSnapshot (api/
// snapshot-validator.ts) before any table is read. Never a
// TABLE_NAMES entry itself — picked to share the '__schema__'
// marker-store naming voice (backend-indexeddb.ts) while
// staying visibly distinct from it. Twelve+one families now
// derive their reads from the requests/responses message
// ledger (Phase 12); a snapshot exported before a family's own
// pairs existed would import clean but derive EMPTY reads
// against the current build. SNAPSHOT_SCHEMA_VERSION closes
// that class BY REJECTION, not migration: an absent or
// mismatched marker rejects the import outright — never a
// default, never a best-effort import. Bump it whenever
// TABLE_NAMES (or a family's derivation shape) changes in a
// way that would strand an older export; Phase 13's TABLE_NAMES
// shrink (identity_tokens + authorization_codes retire) is the
// first such bump.
//
// THE ASYMMETRY: this closes only "a new build imports an old
// export." A new build's OWN marked export is silently accepted
// by an OLD build's importer — parseAndValidateSnapshot has
// always ignored unknown top-level keys, and that stays true
// here (an old build's validator loop never looks at this key
// at all). Intended and dev-tier-acceptable: the old build has
// no way to know a marker scheme was ever invented.
export const SNAPSHOT_SCHEMA_VERSION = 2;
export const SNAPSHOT_SCHEMA_VERSION_KEY = '__schema_version__';

// A secondary index is either a plain column name (the
// existing shape) or an object form declaring `unique: true`
// — a UNIQUE index. Absent keys are unindexed in IndexedDB,
// so a row lacking the column never collides: that IS the
// partial-unique-index semantics genesis rows rely on.
export type TableIndexSpec =
    | string
    | { readonly column: string; readonly unique: true };

export function indexColumn(
    spec: TableIndexSpec,
): string {
    return typeof spec === 'string' ? spec : spec.column;
}

// The columns a table declares unique, in TABLE_INDEXES
// order — consumed by both the IndexedDB ConstraintError
// translation and the simulated tiers' pre-buffer scan.
export function uniqueColumns(
    table: string,
): readonly string[] {
    return (TABLE_INDEXES[table] ?? [])
        .filter((spec) => typeof spec !== 'string')
        .map((spec) => indexColumn(spec));
}

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
    Record<string, readonly TableIndexSpec[]> = {
    identity_pii: ['email'],
    identity_credentials: ['identity_id'],
    identity_token_revocations: ['identity_id'],
    identity_default_organizations: ['identity_id'],
    role_grants: ['organization_id', 'identity_id'],
    ideas: ['organization_id'],
    idea_submissions: ['idea_id'],
    projects: ['organization_id'],
    project_flows: ['project_id'],
    project_objective_baseline_scores: ['project_id'],
    project_objective_actual_scores: ['project_id'],
    flows: ['organization_id'],
    flow_versions: ['flow_id'],
    flow_nodes: ['flow_id'],
    flow_edges: ['flow_id'],
    flow_node_members: ['flow_node_id'],
    flow_node_attributes: ['flow_node_id', 'attribute_id'],
    flow_work_orders: ['flow_id'],
    flow_records: ['flow_id'],
    work_orders: ['organization_id'],
    state_field_values: ['attribute_id', 'state_event_id'],
    records: ['organization_id'],
    record_attributes: ['organization_id'],
    objectives: ['organization_id'],
    objective_revisions: ['objective_id'],
    memberships: ['organization_id', 'identity_id'],
    requests: ['uri_prefix', 'uri_id', 'message_hash'],
    responses: [
        'uri_prefix',
        'uri_id',
        { column: 'follows', unique: true },
    ],
    states: ['entity_id'],
};

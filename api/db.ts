import type {
    RequestEntity,
    ResponseEntity,
} from './types.ts';
import type {
    NotificationEvent,
    NotificationPost,
} from './notifications.ts';

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

// Cross-tenant ownership breach: the entity exists, but under
// a different organization. Mapped once at the domain-boundary
// catch to HTTP 403. HTTP-agnostic like EntityNotFoundError.
export function foreignOrganizationMessage(
    table: string,
    id: string,
): string {
    return `forbidden: ${table}/${id}`
        + ' belongs to a different organization';
}

export class ForeignOrganizationError {
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
            foreignOrganizationMessage(table, id);
    }
}

export class MissingTableError extends Error {
    readonly table: string;
    constructor(table: string) {
        super(
            `Schema is missing table "${table}".`
            + ' Reseed with --seed-bootstrap or'
            + ' --seed-mock-data.',
        );
        this.table = table;
        this.name = 'MissingTableError';
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
    // `column` equals `key`. Concrete stores serve it over
    // `Tx.getWhere`. Every store face honors the same read,
    // so no caller re-acquires it by assertion.
    getAllWhere(
        column: string,
        key: string,
    ): Promise<T[]>;
    getAllAtAddress(
        collection: string,
        uriId: string,
    ): Promise<T[]>;
    getAllAtVersion(
        collection: string,
        uriId: string,
        version: string,
    ): Promise<T[]>;
    getAllWhereBody(
        collection: string,
        containment: Record<string, unknown>,
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
    getAddress<T extends { id: string }>(
        table: string,
        collection: string,
        uriId: string,
    ): Promise<T[]>;
    getAddressVersion<T extends { id: string }>(
        table: string,
        collection: string,
        uriId: string,
        version: string,
    ): Promise<T[]>;
    getWhereBody<T extends { id: string }>(
        table: string,
        collection: string,
        containment: Record<string, unknown>,
    ): Promise<T[]>;
    put<T extends { id: string }>(
        table: string,
        row: T,
    ): Promise<void>;
    delete(table: string, id: string): Promise<void>;
    clear(table: string): Promise<void>;
    // Postgres write coordination. Other backends omit
    // these; callers treat absence as a no-op.
    lock?(label: string): Promise<void>;
    lockShared?(label: string): Promise<void>;
    lockHead?(id: string): Promise<void>;
    latestPutDelete?(
        collection: string,
        uriId: string,
    ): Promise<{
        readonly id: string;
        readonly method: string;
    } | null>;
    notify?(event: NotificationEvent): Promise<void>;
    stampSchemaMarker?(): Promise<void>;
}

export interface WriteLocks {
    lockDedup(hash: string): Promise<void>;
    lockAddress(
        collection: string,
        uriId: string,
    ): Promise<void>;
    lockHead(id: string): Promise<void>;
    latestPutDelete(
        collection: string,
        uriId: string,
    ): Promise<{
        readonly id: string;
        readonly method: string;
    } | null>;
    notify(event: NotificationEvent): Promise<void>;
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

// The 2 stores an adapter exposes, factored out of
// DbAdapter so an adapter can build the whole bundle in one
// place (`#buildStores`) and a transaction can rebuild it
// bound to an open tx (A9). Both surviving stores ride
// HistoryEntityStore (message plane only).
export interface DbStores {
    requests:
        EntityStore<RequestEntity>;
    responses:
        EntityStore<ResponseEntity>;
}

// Schema/connection lifecycle — the non-row surface every
// adapter face serves identically.
export interface DbLifecycle {
    initialize(): Promise<void>;
    deleteSchema(): Promise<void>;
    hasSchema(): Promise<boolean>;
    postSchemaCreation(): Promise<void>;
    // Make the named tables writable without declaring the
    // schema present: the installer primitive for seeds,
    // not snapshot import.
    ensureTables(
        tables: readonly string[],
    ): Promise<void>;
    // The Decision 5 post hook: fired AFTER a write commits,
    // so cross-tab (and future cross-process) subscribers are
    // informed of state changes — never polled. Carried on the
    // COMMON ancestor of DbAdapter and GuardedDbAdapter so
    // both the open-tx view (#viewForTx) and plain adapters
    // type-check.
    postNotification: NotificationPost;
    readonly writeLocks?: WriteLocks;
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
    // Pure-read sibling of `transaction`. IndexedDB can run
    // concurrent readonly scopes; the memory tier still
    // serializes for Node determinism. Nested
    // `readTransaction` joins whatever mode is open so
    // read-your-writes stays intact.
    readTransaction<R>(
        tables: readonly string[],
        fn: (view: DbAdapter) => Promise<R>,
    ): Promise<R>;
}

// The unfenced tier: same stores as DbAdapter. Phase Final
// Task 5 retired the guarded write capability (putGuarded
// family) with the store decorator shell — surviving tables
// never soft-delete. clients-table elimination retired the
// rawReadRow primary-key probe with the clients store.
export interface GuardedDbAdapter
    extends DbLifecycle, DbStores
{
    transaction<R>(
        tables: readonly string[],
        fn: (view: GuardedDbAdapter) => Promise<R>,
    ): Promise<R>;
    readTransaction<R>(
        tables: readonly string[],
        fn: (view: GuardedDbAdapter) => Promise<R>,
    ): Promise<R>;
}

// Phase Final Stage B shrank this list (ideas +
// idea_submissions first; remaining doomed families follow
// in later Task 4 commits). IndexedDB's own open is
// UNVERSIONED (backend-indexeddb.ts's #openConnection calls
// indexedDB.open(DB_NAME) with no version argument), so
// onupgradeneeded — the only place object stores are created —
// never re-fires for an origin that already has a database: an
// EXISTING origin keeps dropped stores as harmless, unread
// orphans. deleteSchema (a full database delete) is the only
// cleanup; nothing else needs to reconcile them.
export const TABLE_NAMES = [
    'requests',
    'responses',
];

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
    requests: [
        'uri_collection', 'message_hash',
    ],
    responses: [
        'uri_collection',
    ],
};

export function assertGetWhereColumn(
    table: string,
    column: string,
): void {
    if (column === 'uri_id') {
        throw new Error(
            'getWhere does not accept uri_id',
        );
    }
    const specs = TABLE_INDEXES[table];
    if (specs === undefined) return;
    const allowed = specs.map(indexColumn);
    if (!allowed.includes(column)) {
        throw new Error(
            'getWhere does not accept ' + column,
        );
    }
}

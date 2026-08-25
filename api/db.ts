import type {
    MessagePairEntity,
} from './types.ts';
import type {
    NotificationEvent,
    NotificationPost,
} from './notifications.ts';

export class EntityNotFoundError extends Error {
    readonly table: string;
    readonly id: string;
    constructor(
        table: string,
        id: string,
    ) {
        super(`Not found: ${table}/${id}`);
        this.name = 'EntityNotFoundError';
        this.table = table;
        this.id = id;
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

export class ForeignOrganizationError extends Error {
    readonly table: string;
    readonly id: string;
    constructor(
        table: string,
        id: string,
    ) {
        super(foreignOrganizationMessage(table, id));
        this.name = 'ForeignOrganizationError';
        this.table = table;
        this.id = id;
    }
}

export class MissingTableError extends Error {
    readonly table: string;
    constructor(table: string) {
        super(
            `Schema is missing table "${table}".`
            + ' Seed with ./postgres-seed.',
        );
        this.table = table;
        this.name = 'MissingTableError';
    }
}

// A unique-column collision on a declared unique column;
// the memory backend scans the declared unique columns
// before buffering. No table declares one today.
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

// The row-granular handle over one transaction. Postgres
// fulfills it with a native transaction; the memory backend
// simulates it (buffer touched tables, flush on success,
// discard on throw).
// `get` returns null for an absent row — absence is
// modeled at the call site, never via a sentinel.
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
    // Schema lifecycle — each backend signals
    // 'schema exists' its own way: memory by table
    // existence, Postgres by the `schema_marker` row.
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

// The store an adapter exposes, factored out of
// DbAdapter so an adapter can build the whole bundle in one
// place (`#buildStores`) and a transaction can rebuild it
// bound to an open tx (A9). The surviving store rides
// HistoryEntityStore (message plane only).
export interface DbStores {
    messagePairs: EntityStore<MessagePairEntity>;
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
    // Pure-read sibling of `transaction`; both backends
    // reject a write under it. Nested `readTransaction`
    // joins whatever mode is open so read-your-writes
    // stays intact.
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

// The tables of the message plane — one,
// `message_pairs`.
export const TABLE_NAMES = [
    'message_pairs',
];

// The message-plane transaction declaration. Every
// `transaction` / `readTransaction` that touches
// the message plane passes this instead of a
// literal list. Equals TABLE_NAMES.
export const MESSAGE_TABLES = TABLE_NAMES;

// A secondary index is a plain column name, or the object
// form declaring `unique: true`. No table declares the
// object form today.
export type TableIndexSpec =
    | string
    | { readonly column: string; readonly unique: true };

export function indexColumn(
    spec: TableIndexSpec,
): string {
    return typeof spec === 'string' ? spec : spec.column;
}

// The columns a table declares unique, in TABLE_INDEXES
// order — consumed by the memory backend's pre-buffer
// scan.
export function uniqueColumns(
    table: string,
): readonly string[] {
    return (TABLE_INDEXES[table] ?? [])
        .filter((spec) => typeof spec !== 'string')
        .map((spec) => indexColumn(spec));
}

// The columns `getWhere` accepts per table — the
// keyed-read allow-list both backends enforce
// (`assertGetWhereColumn`). Postgres indexes are
// declared in `schema-postgres.ts`.
// Tables absent here are read in full or by primary key: the
// collection IS its rows.
export const TABLE_INDEXES:
    Record<string, readonly TableIndexSpec[]> = {
    message_pairs: [
        'uri_collection', 'request_hash',
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

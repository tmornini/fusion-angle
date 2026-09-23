import type {
    MessagePairEntity,
} from './types.ts';
import type {
    NotificationEvent,
    NotificationPost,
} from './notifications.ts';
import type {
    Attempt,
    StatementAnswer,
    StatementBind,
} from '../shared/ledger-statement.ts';

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

export interface EntityStore<
    T extends { id: string },
> {
    // The keyed sub-collection read: the literal `WHERE
    // path = $1`: every pair of every document in the
    // collection.
    getCollectionPairs(path: string): Promise<T[]>;
    getDocumentHistory(
        path: string,
        name: string,
    ): Promise<T[]>;
    // The latest PUT or DELETE at the document, projected
    // to what the write gate compares; null when none.
    getHead(path: string, name: string): Promise<{
        readonly id: string;
        readonly method: string;
    } | null>;
    // The head pair itself, PUT or DELETE; null when none.
    getHeadPair(path: string, name: string): Promise<T | null>;
    // The live PUT heads of a collection, (response_at, id).
    getCollectionHeadPairs(path: string): Promise<T[]>;
    getAllWhereBody(
        path: string,
        containment: Record<string, unknown>,
    ): Promise<T[]>;
    getById(id: string): Promise<T>;
    // Writes the row if its id is absent and reports whether
    // it did. A later append of the same id changes nothing.
    append(
        id: string,
        fields: Omit<T, 'id'>,
    ): Promise<boolean>;
}

// The storage-edge validator. Stores accept one at
// construction and re-verify every `append` body through
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
// simulates it (copy the table, adopt on success, discard
// on throw).
// `getById` returns null for an absent row — absence is
// modeled at the call site, never via a sentinel.
export interface Tx {
    getById<T extends { id: string }>(
        id: string,
    ): Promise<T | null>;
    getAll<T extends { id: string }>(): Promise<T[]>;
    getCollectionPairs<T extends { id: string }>(
        path: string,
    ): Promise<T[]>;
    getDocumentHistory<T extends { id: string }>(
        path: string,
        name: string,
    ): Promise<T[]>;
    getWhereBody<T extends { id: string }>(
        path: string,
        containment: Record<string, unknown>,
    ): Promise<T[]>;
    append<T extends { id: string }>(
        row: T,
    ): Promise<boolean>;
    getHead(path: string, name: string): Promise<{
        readonly id: string;
        readonly method: string;
    } | null>;
    getHeadPair<T extends { id: string }>(
        path: string,
        name: string,
    ): Promise<T | null>;
    getCollectionHeadPairs<T extends { id: string }>(
        path: string,
    ): Promise<T[]>;
    // In-transaction notify. A read handle omits it.
    // The statement is the api's bell; this stays for a
    // caller that already holds the client.
    notify?(event: NotificationEvent): Promise<void>;
    // The open memory buffer, when this handle is one.
    ledgerBuffer?(): { id: string }[];
}

// The byte-level seam. Store classes compose a backend
// to obtain rows; backends own persistence + encoding,
// stores own semantics (tombstones, splices, singletons).
// `read` is one statement with no BEGIN; `transaction`
// is BEGIN/COMMIT; `ensureTable` is schema lifecycle,
// never a row op.
export interface StorageBackend {
    read<R>(
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R>;
    transaction<R>(
        mode: TxMode,
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R>;
    ensureTable(): Promise<void>;
    executeLedger(
        attempt: Attempt,
        rows: readonly StatementBind[],
        now: string | undefined,
        tx: Tx | undefined,
    ): Promise<StatementAnswer[]>;
    // Schema lifecycle — each backend signals
    // 'schema exists' its own way: memory by table
    // existence, Postgres by the `schema_marker` row.
    hasSchema(): Promise<boolean>;
    postSchemaCreation(): Promise<void>;
    deleteSchema(): Promise<void>;
}

// How a store reaches storage. Standalone, a store opens a
// fresh `read` or `transaction` via `backendRunner`; joined
// to an open view, it returns the open `tx` via
// `ambientRunner` — no AsyncLocalStorage, no ambient global,
// just the runner the store was handed at construction.
export type TxRunner = <R>(
    mode: TxMode,
    fn: (tx: Tx) => Promise<R>,
) => Promise<R>;

export const backendRunner = (
    backend: StorageBackend,
): TxRunner =>
    (mode, fn) => mode === 'readonly'
        ? backend.read(fn)
        : backend.transaction(mode, fn);

// Join the open tx: the open transaction's mode is
// already fixed, so this ignores the declared mode and
// runs `fn` against the same handle.
export const ambientRunner = (tx: Tx): TxRunner =>
    (_mode, fn) => fn(tx);

// The store an adapter exposes, factored out of
// DbAdapter so an adapter can build the whole bundle in one
// place (`#buildStores`) and a read can rebuild it bound
// to an open client. The surviving store rides
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
    // Make the table writable without declaring the
    // schema present: the installer primitive for seeds,
    // not snapshot import.
    ensureTable(): Promise<void>;
    executeLedger(
        attempt: Attempt,
        rows: readonly StatementBind[],
        now?: string,
    ): Promise<StatementAnswer[]>;
    // The Decision 5 post hook: fired AFTER a write commits,
    // so cross-tab (and future cross-process) subscribers are
    // informed of state changes — never polled. Carried on the
    // COMMON ancestor of DbAdapter and GuardedDbAdapter so
    // both the open-client view and plain adapters type-check.
    postNotification: NotificationPost;
}

export interface DbAdapter extends DbLifecycle, DbStores {
    // A pure read. Both backends reject a write under it.
    // Nested readTransaction joins the open client, so a
    // seed phase still sees its own uncommitted rows.
    readTransaction<R>(
        fn: (view: DbAdapter) => Promise<R>,
    ): Promise<R>;
}

// The unfenced tier: same stores as DbAdapter. Phase Final
// Task 5 retired the guarded write capability (putGuarded
// family) with the store decorator shell — surviving tables
// never soft-delete. clients-table elimination retired the
// rawReadRow primary-key probe with the clients store.
export interface GuardedDbAdapter extends DbAdapter {}

// The tables of the message plane — one,
// `fa_message_pairs`.
export const TABLE_NAMES = [
    'fa_message_pairs',
];

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

// Secondary indexes per table. Postgres indexes are
// declared in `schema-postgres.ts`.
// Tables absent here are read in full or by primary key:
// the collection IS its rows.
export const TABLE_INDEXES:
    Record<string, readonly TableIndexSpec[]> = {
    fa_message_pairs: [
        'path',
    ],
};

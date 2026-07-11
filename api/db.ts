import type {
    ClientEntity,
    RequestEntity,
    ResponseEntity,
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
            + ' Recreate the schema from snapshots.',
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

// The 3 stores an adapter exposes, factored out of
// DbAdapter so an adapter can build the whole bundle in one
// place (`#buildStores`) and a transaction can rebuild it
// bound to an open tx (A9). Phase Final Stage B: states
// table retired; clients rides HistoryEntityStore.
export interface DbStores {
    clients:
        EntityStore<ClientEntity>;
    requests:
        EntityStore<RequestEntity>;
    responses:
        EntityStore<ResponseEntity>;
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
    // both the open-tx view (#viewForTx) and plain adapters
    // type-check.
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

// The unfenced tier: same stores as DbAdapter, plus a raw
// primary-key probe. Phase Final Task 5 retired the guarded
// write capability (putGuarded family) with the store
// decorator shell — surviving tables never soft-delete.
export interface GuardedDbAdapter
    extends DbLifecycle, DbStores
{
    transaction<R>(
        tables: readonly string[],
        fn: (view: GuardedDbAdapter) => Promise<R>,
    ): Promise<R>;
    // Raw single-row read by primary key — no store-layer
    // semantics. Surviving tables never soft-delete, so this
    // is byte-identical to EntityStore.getById for present
    // rows and returns null for absence (getById throws).
    // Kept for the client-lookup path and residual probes.
    rawReadRow<T extends { id: string }>(
        table: string,
        id: string,
    ): Promise<T | null>;
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
    'clients',
    'requests',
    'responses',
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
// way that would strand an older export. Phase 13's TABLE_NAMES
// shrink (identity_tokens + authorization_codes) bumped 1→2;
// Phase Final Stage B's doomed-table deletions bump 2→3;
// states-address retirement bumps 3→4 (pre-retirement v3
// exports still carry states/:id pairs no derive source
// reads — blanket version reject).
//
// THE ASYMMETRY: this closes only "a new build imports an old
// export." A new build's OWN marked export is silently accepted
// by an OLD build's importer — parseAndValidateSnapshot has
// always ignored unknown top-level keys, and that stays true
// here (an old build's validator loop never looks at this key
// at all). Intended and dev-tier-acceptable: the old build has
// no way to know a marker scheme was ever invented.
//
// MID-SEQUENCE WINDOW (Phase Final Task 4): several commits
// stamp v3 while TABLE_NAMES shrinks further. parseAndValidate
// ignores unknown keys, so a mid-sequence v3 export can import
// into a later v3 build by silently dropping later-deleted
// tables' keys. Intra-phase exports are NOT a supported
// contract — do not export/import across deletion commits
// except in tests that control both ends.
export const SNAPSHOT_SCHEMA_VERSION = 4;
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
    requests: ['uri_prefix', 'uri_id', 'message_hash'],
    responses: [
        'uri_prefix',
        'uri_id',
        { column: 'follows', unique: true },
    ],
};

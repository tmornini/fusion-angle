import {
    TABLE_NAMES,
    backendRunner,
    ambientRunner,
} from './db.ts';
import type {
    GuardedDbAdapter,
    DbStores,
    EntityStore,
    StorageBackend,
    Tx,
    TxMode,
    TxRunner,
    WriteLocks,
} from './db.ts';
import { SNAPSHOT_IMPORT_LOCK_NAME } from
    './advisory-lock.ts';
import type {
    RequestEntity,
    ResponseEntity,
} from './types.ts';
import type { LatencySimulation } from './latency.ts';
import type {
    NotificationEvent,
    NotificationPost,
} from './notifications.ts';
import { HistoryEntityStore }
    from './store-history-entity.ts';
import {
    parseAndValidateSnapshot,
} from './snapshot-validator.ts';
import {
    validateRequestEntity,
    validateResponseEntity,
} from './validators.ts';

// One adapter over any StorageBackend. The store wiring,
// the transaction view, and the tx-based snapshot ops live
// here once (Commandment IX — the third backend, IndexedDB,
// triggers the abstraction). The per-tier variation rides in
// the constructor: the backend itself, a latency shim, and
// an open hook the async tiers (IndexedDB) use to connect
// before any store op. Schema lifecycle delegates to the
// backend, which signals "schema exists" its own way.
//
// Both surviving stores ride HistoryEntityStore (message
// plane only — clients table eliminated).
export class BackedDbAdapter
    implements GuardedDbAdapter, LatencySimulation
{
    readonly #backend: StorageBackend;
    readonly #latency: () => Promise<void>;
    readonly #open: () => Promise<void>;
    readonly #notify: NotificationPost;

    readonly requests!: EntityStore<RequestEntity>;
    readonly responses!: EntityStore<ResponseEntity>;

    constructor(
        backend: StorageBackend,
        latency: () => Promise<void>,
        open: () => Promise<void>,
        notify: NotificationPost,
    ) {
        this.#backend = backend;
        this.#latency = latency;
        this.#open = open;
        this.#notify = notify;
        Object.assign(
            this,
            this.#buildStores(backendRunner(backend)),
        );
    }

    async initialize(): Promise<void> {
        await this.#open();
    }

    simulateLatency(): Promise<void> {
        return this.#latency();
    }

    postNotification(event: NotificationEvent): void {
        this.#notify(event);
    }

    hasSchema(): Promise<boolean> {
        return this.#backend.hasSchema();
    }

    postSchemaCreation(): Promise<void> {
        return this.#backend.postSchemaCreation();
    }

    ensureTables(
        tables: readonly string[],
    ): Promise<void> {
        return this.#backend.ensureTables(tables);
    }

    deleteSchema(): Promise<void> {
        return this.#backend.deleteSchema();
    }

    async getSnapshot(): Promise<string> {
        if (this.#backend.exportSnapshot !== undefined) {
            return this.#backend.exportSnapshot();
        }
        const obj = await this.#backend.transaction(
            TABLE_NAMES, 'readonly',
            async (tx) => {
                const out: Record<string, unknown[]> = {};
                for (const table of TABLE_NAMES) {
                    out[table] = await tx.getAll(table);
                }
                return out;
            },
        );
        return JSON.stringify(obj, null, 2);
    }

    async putSnapshot(json: string): Promise<void> {
        // Validators run at the gate, before any storage
        // touch — a bad snapshot throws here, leaving prior
        // data intact. The clear+put then runs in one
        // transaction; a logic error discards the buffer
        // (rollback). On IndexedDB the whole flush is a
        // genuine atomic commit; localStorage's multi-key
        // flush is not OS-atomic on a mid-write quota error.
        // Postgres takes the exclusive import lock and
        // stamps schema_marker in that same transaction.
        const validated = parseAndValidateSnapshot(json);
        await this.#backend.ensureTables(TABLE_NAMES);
        if (this.#backend.importSnapshot !== undefined) {
            await this.#backend.importSnapshot(validated);
            return;
        }
        await this.#backend.transaction(
            TABLE_NAMES, 'readwrite',
            async (tx) => {
                for (const [table, rows] of validated) {
                    await tx.clear(table);
                    for (const row of rows) {
                        await tx.put(table, row);
                    }
                }
            },
        );
        // Imported data IS a schema: stamp the marker after
        // the commit so hasSchema() answers true after a
        // restore onto a fresh origin. A failed import never
        // stamps.
        await this.#backend.postSchemaCreation();
    }

    async transaction<R>(
        tables: readonly string[],
        fn: (view: GuardedDbAdapter) => Promise<R>,
    ): Promise<R> {
        return this.#transaction(tables, 'readwrite', fn);
    }

    async readTransaction<R>(
        tables: readonly string[],
        fn: (view: GuardedDbAdapter) => Promise<R>,
    ): Promise<R> {
        return this.#transaction(tables, 'readonly', fn);
    }

    #transaction<R>(
        tables: readonly string[],
        mode: TxMode,
        fn: (view: GuardedDbAdapter) => Promise<R>,
    ): Promise<R> {
        return this.#backend.transaction(
            tables, mode,
            (tx) => fn(this.#viewForTx(tx, tables)),
        );
    }

    #viewForTx(
        tx: Tx,
        declaredTables: readonly string[],
    ): GuardedDbAdapter {
        // Nested transaction / readTransaction both re-enter
        // the open view: the outer mode is already fixed, so
        // a nested read inside a write joins the write tx
        // (read-your-writes). Tables must still be a subset.
        const reenter = <R>(
            tables: readonly string[],
            fn: (view: GuardedDbAdapter) => Promise<R>,
        ): Promise<R> => {
            this.#assertSubset(tables, declaredTables);
            return fn(view);
        };
        const locks = writeLocksOf(tx);
        const view: GuardedDbAdapter = {
            ...this.#buildStores(ambientRunner(tx)),
            initialize: () => this.initialize(),
            deleteSchema: () => this.deleteSchema(),
            hasSchema: () => this.hasSchema(),
            postSchemaCreation: () => this.postSchemaCreation(),
            ensureTables: (tables) =>
                this.ensureTables(tables),
            getSnapshot: () => this.getSnapshot(),
            putSnapshot: (json) =>
                this.putSnapshot(json),
            postNotification: (e) =>
                this.postNotification(e),
            ...(locks === undefined
                ? {}
                : { writeLocks: locks }),
            transaction: reenter,
            readTransaction: reenter,
        };
        return view;
    }

    #assertSubset(
        nestedTables: readonly string[],
        declaredTables: readonly string[],
    ): void {
        for (const table of nestedTables) {
            if (!declaredTables.includes(table)) {
                throw new Error(
                    `Nested transaction table '${table}'`
                    + ' is not in the outer declared set'
                    + ` [${declaredTables.join(', ')}].`,
                );
            }
        }
    }

    #buildStores(run: TxRunner): DbStores {
        return {
            requests: new HistoryEntityStore(
                'requests', run, validateRequestEntity,
            ),
            responses: new HistoryEntityStore(
                'responses', run, validateResponseEntity,
            ),
        };
    }
}

function writeLocksOf(tx: Tx): WriteLocks | undefined {
    const lock = tx.lock;
    const lockShared = tx.lockShared;
    const lockHead = tx.lockHead;
    const latestPutDelete = tx.latestPutDelete;
    const notify = tx.notify;
    if (
        lock === undefined
        || lockShared === undefined
        || lockHead === undefined
        || latestPutDelete === undefined
        || notify === undefined
    ) {
        return undefined;
    }
    return {
        lockImportExclusive: () =>
            lock(SNAPSHOT_IMPORT_LOCK_NAME),
        lockImportShared: () =>
            lockShared(SNAPSHOT_IMPORT_LOCK_NAME),
        lockDedup: (hash) =>
            lock('fusion.dedup.' + hash),
        lockAddress: (collection, uriId) =>
            lock(
                'fusion.address.' + collection + uriId,
            ),
        lockHead,
        latestPutDelete,
        notify,
    };
}

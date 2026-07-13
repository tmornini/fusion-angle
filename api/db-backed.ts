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
    TxRunner,
} from './db.ts';
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
        const validated = parseAndValidateSnapshot(json);
        await this.#backend.ensureTables(TABLE_NAMES);
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
        return this.#backend.transaction(
            tables, 'readwrite',
            (tx) => fn(this.#viewForTx(tx, tables)),
        );
    }

    #viewForTx(
        tx: Tx,
        declaredTables: readonly string[],
    ): GuardedDbAdapter {
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
            transaction: (tables, fn) => {
                this.#assertSubset(tables, declaredTables);
                return fn(view);
            },
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

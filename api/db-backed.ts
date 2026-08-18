import {
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
    validateRequestEntity,
    validateResponseEntity,
} from './validators.ts';

// One adapter over any StorageBackend. The store wiring
// and the transaction view live here once (Commandment IX
// — the third backend, IndexedDB, triggers the
// abstraction). The per-tier variation rides in the
// constructor: the backend itself, a latency shim, and
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
    const lockHead = tx.lockHead;
    const latestPutDelete = tx.latestPutDelete;
    const notify = tx.notify;
    if (
        lock === undefined
        || lockHead === undefined
        || latestPutDelete === undefined
        || notify === undefined
    ) {
        return undefined;
    }
    return {
        lockDedup: (hash) =>
            lock('fusion.dedup.' + hash),
        lockAddress: (collection, uriId) =>
            lock(
                'fusion.address.' + collection
                + uriId,
            ),
        lockHead,
        latestPutDelete,
        notify,
    };
}

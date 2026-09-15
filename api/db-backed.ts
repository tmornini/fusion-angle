import {
    backendRunner,
    ambientRunner,
} from './db.ts';
import type {
    GuardedDbAdapter,
    StorageBackend,
    Tx,
    TxMode,
    TxRunner,
    WriteLocks,
} from './db.ts';
import type {
    MessagePairEntity,
} from './types.ts';
import type { LatencySimulation } from './latency.ts';
import type {
    NotificationEvent,
    NotificationPost,
} from './notifications.ts';
import { HistoryEntityStore }
    from './store-history-entity.ts';
import {
    validateMessagePairEntity,
} from './validators.ts';

// One adapter over any StorageBackend. The per-backend
// variation rides in the constructor: the backend, a
// latency shim, an open hook, a post-commit hook — both
// presets pass no-ops for the last three today. Schema
// lifecycle delegates to the backend.
//
// The surviving store rides HistoryEntityStore (message
// plane only — clients table eliminated).
export class BackedDbAdapter
    implements GuardedDbAdapter, LatencySimulation
{
    readonly #backend: StorageBackend;
    readonly #latency: () => Promise<void>;
    readonly #open: () => Promise<void>;
    readonly #notify: NotificationPost;

    // Declared concrete, not as the `EntityStore` face: a
    // test holding the adapter keeps `getAll()` as its
    // whole-plane oracle, while nothing typed `DbAdapter` —
    // every derive, route handler, and transaction view —
    // can reach it.
    readonly messagePairs!: HistoryEntityStore<
        MessagePairEntity
    >;

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

    ensureTable(): Promise<void> {
        return this.#backend.ensureTable();
    }

    deleteSchema(): Promise<void> {
        return this.#backend.deleteSchema();
    }

    async transaction<R>(
        fn: (view: GuardedDbAdapter) => Promise<R>,
    ): Promise<R> {
        return this.#transaction('readwrite', fn);
    }

    async readTransaction<R>(
        fn: (view: GuardedDbAdapter) => Promise<R>,
    ): Promise<R> {
        return this.#transaction('readonly', fn);
    }

    #transaction<R>(
        mode: TxMode,
        fn: (view: GuardedDbAdapter) => Promise<R>,
    ): Promise<R> {
        return this.#backend.transaction(
            mode,
            (tx) => fn(this.#viewForTx(tx)),
        );
    }

    #viewForTx(
        tx: Tx,
    ): GuardedDbAdapter {
        // Nested transaction / readTransaction both re-enter
        // the open view: the outer mode is already fixed, so
        // a nested read inside a write joins the write tx
        // (read-your-writes).
        const reenter = <R>(
            fn: (view: GuardedDbAdapter) => Promise<R>,
        ): Promise<R> => fn(view);
        const locks = writeLocksOf(tx);
        const stores = this.#buildStores(
            ambientRunner(tx),
        );
        const view: GuardedDbAdapter = {
            ...stores,
            initialize: () => this.initialize(),
            deleteSchema: () => this.deleteSchema(),
            hasSchema: () => this.hasSchema(),
            postSchemaCreation: () => this.postSchemaCreation(),
            ensureTable: () => this.ensureTable(),
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

    // Returns the concrete store so the class field keeps
    // `getAll`; `DbStores` stays the view's type, and a
    // view never sees the whole-plane read.
    #buildStores(run: TxRunner): {
        messagePairs: HistoryEntityStore<MessagePairEntity>;
    } {
        return {
            messagePairs: new HistoryEntityStore(
                'message_pairs', run, validateMessagePairEntity,
            ),
        };
    }
}

function writeLocksOf(tx: Tx): WriteLocks | undefined {
    const lockRequest = tx.lockRequest;
    const lockDocument = tx.lockDocument;
    const lockHead = tx.lockHead;
    const notify = tx.notify;
    if (
        lockRequest === undefined
        || lockDocument === undefined
        || lockHead === undefined
        || notify === undefined
    ) {
        return undefined;
    }
    return {
        lockRequest,
        lockDocument,
        lockHead,
        getHead: (path, name) => tx.getHead(path, name),
        notify,
    };
}

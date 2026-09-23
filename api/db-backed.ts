import {
    backendRunner,
    ambientRunner,
} from './db.ts';
import type {
    DbAdapter,
    GuardedDbAdapter,
    StorageBackend,
    Tx,
    TxRunner,
} from './db.ts';
import type {
    MessagePairEntity,
} from './types.ts';
import type {
    Attempt,
    StatementAnswer,
    StatementBind,
} from '../shared/ledger-statement.ts';
import type { LatencySimulation } from './latency.ts';
import type {
    NotificationEvent,
    NotificationPost,
} from './notifications.ts';
import { HistoryEntityStore }
    from './store-history-entity.ts';
import { SuccessionConflict } from
    './ledger-statement.ts';
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

    executeLedger(
        attempt: Attempt,
        rows: readonly StatementBind[],
        now?: string,
    ): Promise<StatementAnswer[]> {
        return this.#backend.executeLedger(
            attempt, rows, now, undefined,
        );
    }

    deleteSchema(): Promise<void> {
        return this.#backend.deleteSchema();
    }

    get backend(): StorageBackend {
        return this.#backend;
    }

    // A view whose statement joins an already-open client.
    // The seed opens backend.transaction and writes through
    // this view. A matched or stale row fails the phase:
    // the seed meant every row to land.
    openClient(tx: Tx): DbAdapter {
        const client = this.#viewForTx(tx);
        const run = client.executeLedger.bind(client);
        client.executeLedger = async (attempt, rows, now) => {
            let stated;
            try {
                stated = await run(attempt, rows, now);
            } catch (error) {
                if (error instanceof SuccessionConflict) {
                    throw new Error(
                        'seed statement returned refused',
                    );
                }
                throw error;
            }
            for (const row of stated) {
                if (row.outcome !== 'land') {
                    throw new Error(
                        'seed statement returned '
                            + row.outcome,
                    );
                }
            }
            return stated;
        };
        return client;
    }

    async readTransaction<R>(
        fn: (view: GuardedDbAdapter) => Promise<R>,
    ): Promise<R> {
        return this.#backend.transaction(
            'readonly',
            (tx) => fn(this.#viewForTx(tx)),
        );
    }

    #viewForTx(tx: Tx): GuardedDbAdapter {
        // Nested readTransaction re-enters the open client.
        // The outer mode is already fixed, so a read inside
        // a seed phase sees that phase's uncommitted rows.
        const stores = this.#buildStores(
            ambientRunner(tx),
        );
        const view: GuardedDbAdapter = {
            ...stores,
            initialize: () => this.initialize(),
            deleteSchema: () => this.deleteSchema(),
            hasSchema: () => this.hasSchema(),
            postSchemaCreation: () =>
                this.postSchemaCreation(),
            ensureTable: () => this.ensureTable(),
            executeLedger: (attempt, rows, now) =>
                this.#backend.executeLedger(
                    attempt, rows, now, tx,
                ),
            postNotification: (e) =>
                this.postNotification(e),
            readTransaction: (fn) => fn(view),
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
                'fa_message_pairs',
                run,
                validateMessagePairEntity,
            ),
        };
    }
}

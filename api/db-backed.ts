import {
    backendRunner,
    ambientRunner,
} from './db.ts';
import type {
    DbAdapter,
    StorageBackend,
    Tx,
    TxRunner,
} from './db.ts';
import type {
    MessagePairEntity,
} from '../shared/types.ts';
import type {
    Attempt,
    StatementAnswer,
    StatementBind,
} from '../shared/ledger-statement.ts';
import type { LatencySimulation } from './latency.ts';
import type {
    NotificationEvent,
    NotificationPost,
} from '../shared/notifications.ts';
import { HistoryEntityStore }
    from './store-history-entity.ts';
import {
    validateMessagePairEntity,
} from './validators.ts';

// One adapter over any StorageBackend. The per-backend
// variation rides in the constructor: the backend, a
// latency shim, and a post-commit hook — both presets
// pass no-ops for the last two today. Schema lifecycle
// delegates to the backend.
//
// The surviving store rides HistoryEntityStore (message
// plane only — clients table eliminated).
export class BackedDbAdapter
    implements DbAdapter, LatencySimulation
{
    readonly #backend: StorageBackend;
    readonly #latency: () => Promise<void>;
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
        notify: NotificationPost,
    ) {
        this.#backend = backend;
        this.#latency = latency;
        this.#notify = notify;
        Object.assign(
            this,
            this.#buildStores(backendRunner(backend)),
        );
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
        tx?: Tx,
    ): Promise<StatementAnswer[]> {
        return this.#backend.executeLedger(
            attempt, rows, now, tx,
        );
    }

    deleteSchema(): Promise<void> {
        return this.#backend.deleteSchema();
    }

    get backend(): StorageBackend {
        return this.#backend;
    }

    // The open client. A route that must re-read and
    // write as one transaction uses this; token rotation
    // and revocation read a refusal from the answer.
    clientOn(tx: Tx): DbAdapter {
        return this.#viewForTx(tx);
    }

    async readTransaction<R>(
        fn: (view: DbAdapter) => Promise<R>,
    ): Promise<R> {
        return this.#backend.transaction(
            'readonly',
            (tx) => fn(this.#viewForTx(tx)),
        );
    }

    #viewForTx(tx: Tx): DbAdapter {
        // Nested readTransaction re-enters the open client.
        // The outer mode is already fixed, so a read inside
        // a seed phase sees that phase's uncommitted rows.
        const stores = this.#buildStores(
            ambientRunner(tx),
        );
        const view: DbAdapter = {
            ...stores,
            deleteSchema: () => this.deleteSchema(),
            hasSchema: () => this.hasSchema(),
            postSchemaCreation: () =>
                this.postSchemaCreation(),
            ensureTable: () => this.ensureTable(),
            executeLedger: (attempt, rows, now) =>
                this.executeLedger(attempt, rows, now, tx),
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

// A write that reads and lands in one transaction opens the
// client beneath the adapter. A view has no backend of its
// own; callers pass the backed adapter the route already
// holds.
export function backedWrite(
    adapter: DbAdapter,
): {
    readonly backend: StorageBackend;
    readonly clientOn: (tx: Tx) => DbAdapter;
} {
    if (
        !('backend' in adapter)
        || !('clientOn' in adapter)
    ) {
        throw new Error(
            'a transactional write requires a backed'
                + ' adapter',
        );
    }
    return adapter as DbAdapter & {
        backend: StorageBackend;
        clientOn: (tx: Tx) => DbAdapter;
    };
}

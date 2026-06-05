import {
    MissingTableError,
    TABLE_NAMES,
    type StorageBackend,
    type Tx,
    type TxMode,
} from './db.ts';
import {
    serializeRecord,
} from './storage-serialize.ts';

// The IndexedDB tier — the ONLY file that names indexedDB.*,
// the divorce point against the day the platform evolves.
// Here the transaction is a genuine platform primitive
// (Commandment X): a real IDBTransaction that commits on
// `oncomplete` (durability) and aborts on a thrown body
// (atomic rollback). Two tabs hold separate connections to
// one database, so concurrent appends to `states` both
// survive — the lost-update hazard the simulated tiers
// could not close.
//
// AUTO-COMMIT CONSTRAINT: an IDBTransaction lives only while
// it has pending requests. Awaiting any NON-IDB promise
// inside a `transaction` body (a timer, fetch, gzip, HMAC)
// yields to a macrotask and the transaction commits early.
// Every `transaction(…)` body in this codebase therefore
// awaits ONLY row ops; sync compute between them is fine.

const DB_NAME = 'fusion-ai';
const DB_VERSION = 1;
const SCHEMA_STORE = '__schema__';
const SCHEMA_MARKER_ID = 'schema';

function requestPromise<T>(
    request: IDBRequest<T>,
): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// A row-granular Tx over a real IDBTransaction. `put` is an
// idempotent upsert (keyPath 'id'); the NOT-NULL gate runs
// here too, so the IDB tier rejects null/undefined fields
// identically to the simulated tiers.
function indexedDbTx(
    idbTransaction: IDBTransaction,
    mode: TxMode,
): Tx {
    const store = (table: string): IDBObjectStore => {
        try {
            return idbTransaction.objectStore(table);
        } catch {
            throw new MissingTableError(table);
        }
    };
    const assertWritable = (): void => {
        if (mode === 'readonly') {
            throw new Error(
                'Cannot write in a readonly transaction.',
            );
        }
    };
    return {
        async get<T extends { id: string }>(
            table: string,
            id: string,
        ): Promise<T | null> {
            const row = await requestPromise(
                store(table).get(id),
            );
            return (row ?? null) as T | null;
        },
        async getAll<T extends { id: string }>(
            table: string,
        ): Promise<T[]> {
            return await requestPromise(
                store(table).getAll(),
            ) as T[];
        },
        async put<T extends { id: string }>(
            table: string,
            row: T,
        ): Promise<void> {
            assertWritable();
            const written = {
                ...serializeRecord(
                    row as Record<string, unknown>,
                    table,
                ),
                id: row.id,
            };
            await requestPromise(store(table).put(written));
        },
        async delete(
            table: string,
            id: string,
        ): Promise<void> {
            assertWritable();
            await requestPromise(store(table).delete(id));
        },
        async clear(table: string): Promise<void> {
            assertWritable();
            await requestPromise(store(table).clear());
        },
    };
}

export class IndexedDbBackend implements StorageBackend {
    #db: IDBDatabase | null;
    readonly #post: (tables: readonly string[]) => void;

    constructor(
        post: (tables: readonly string[]) => void =
            () => {},
    ) {
        this.#db = null;
        this.#post = post;
    }

    // The open hook the adapter runs in initialize(): create
    // the object stores (one per table + the schema marker)
    // on first open, and close on a version change so a newer
    // tab's upgrade is never blocked.
    open(): Promise<void> {
        if (this.#db !== null) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(
                DB_NAME, DB_VERSION,
            );
            request.onupgradeneeded = () => {
                const db = request.result;
                for (const table of TABLE_NAMES) {
                    if (
                        !db.objectStoreNames.contains(table)
                    ) {
                        db.createObjectStore(
                            table, { keyPath: 'id' },
                        );
                    }
                }
                if (
                    !db.objectStoreNames.contains(
                        SCHEMA_STORE,
                    )
                ) {
                    db.createObjectStore(
                        SCHEMA_STORE, { keyPath: 'id' },
                    );
                }
            };
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => db.close();
                this.#db = db;
                resolve();
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(
                new Error(
                    'IndexedDB open blocked by another'
                    + ' connection.',
                ),
            );
        });
    }

    async #connection(): Promise<IDBDatabase> {
        if (this.#db === null) {
            await this.open();
        }
        return this.#db!;
    }

    async transaction<R>(
        tables: readonly string[],
        mode: TxMode,
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        const db = await this.#connection();
        return new Promise<R>((resolve, reject) => {
            const idbTransaction = db.transaction(
                [...tables], mode,
            );
            let result: R;
            let settled = false;
            idbTransaction.oncomplete = () => {
                if (mode === 'readwrite') {
                    this.#post(tables);
                }
                resolve(result);
            };
            idbTransaction.onabort = () => {
                if (!settled) {
                    reject(
                        idbTransaction.error ?? new Error(
                            'IndexedDB transaction aborted.',
                        ),
                    );
                }
            };
            idbTransaction.onerror = () => {
                if (!settled) {
                    reject(
                        idbTransaction.error ?? new Error(
                            'IndexedDB transaction error.',
                        ),
                    );
                }
            };
            Promise.resolve(
                fn(indexedDbTx(idbTransaction, mode)),
            ).then(
                (value) => { result = value; },
                (error) => {
                    settled = true;
                    try {
                        idbTransaction.abort();
                    } catch {
                        // The tx may already be aborting from
                        // the same fault; the real error is
                        // `error`, which we reject with.
                    }
                    reject(error);
                },
            );
        });
    }

    // Object stores are created at upgrade time; ensuring a
    // table is just ensuring the connection is open.
    async ensureTables(
        _tables: readonly string[],
    ): Promise<void> {
        await this.#connection();
    }

    // Object stores always exist post-upgrade, so existence
    // can't signal schema — the marker store does.
    async hasSchema(): Promise<boolean> {
        const db = await this.#connection();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(
                SCHEMA_STORE, 'readonly',
            );
            const request = tx.objectStore(SCHEMA_STORE)
                .get(SCHEMA_MARKER_ID);
            request.onsuccess = () =>
                resolve(request.result !== undefined);
            request.onerror = () => reject(request.error);
        });
    }

    async createSchema(): Promise<void> {
        const db = await this.#connection();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(
                SCHEMA_STORE, 'readwrite',
            );
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.objectStore(SCHEMA_STORE).put({
                id: SCHEMA_MARKER_ID,
            });
        });
    }

    async deleteSchema(): Promise<void> {
        const db = await this.#connection();
        const stores = [...TABLE_NAMES, SCHEMA_STORE];
        return new Promise((resolve, reject) => {
            const tx = db.transaction(stores, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            for (const name of stores) {
                tx.objectStore(name).clear();
            }
        });
    }
}

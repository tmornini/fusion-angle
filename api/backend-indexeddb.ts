import {
    MissingTableError,
    TABLE_INDEXES,
    TABLE_NAMES,
    UniqueConstraintError,
    indexColumn,
    uniqueColumns,
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

// The first of `stores` absent from `available`, or undefined
// when all are present. db.transaction() throws an opaque
// NotFoundError when a named store is missing; this names the
// culprit so openTx can raise a typed MissingTableError instead.
export function firstMissingStore(
    available: { contains(name: string): boolean },
    stores: readonly string[],
): string | undefined {
    return stores.find(store => !available.contains(store));
}

// Open an IDBTransaction, converting the opaque NotFoundError a
// missing store throws at CREATION time into the typed
// MissingTableError the boot path routes to snapshots recovery.
// The objectStore() guard in indexedDbTx only catches a missing
// store INSIDE a live tx; this closes the creation-time gap.
function openTx(
    db: IDBDatabase,
    stores: readonly string[],
    mode: TxMode,
): IDBTransaction {
    try {
        return db.transaction([...stores], mode);
    } catch (err) {
        const missing = firstMissingStore(
            db.objectStoreNames, stores);
        if (missing !== undefined) {
            throw new MissingTableError(missing);
        }
        throw err;
    }
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
        } catch (err) {
            // Only a missing store is the boot-recovery
            // signal; anything else (a use-after-commit
            // InvalidStateError) is a bug and must surface.
            if (
                err instanceof DOMException
                && err.name === 'NotFoundError'
            ) {
                throw new MissingTableError(table);
            }
            throw err;
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
        async getWhere<T extends { id: string }>(
            table: string,
            column: string,
            key: string,
        ): Promise<T[]> {
            return await requestPromise(
                store(table).index(column)
                    .getAll(IDBKeyRange.only(key)),
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
            try {
                await requestPromise(
                    store(table).put(written),
                );
            } catch (err) {
                if (
                    err instanceof DOMException
                    && err.name === 'ConstraintError'
                ) {
                    // The raw DOMException names no column;
                    // resolve it from the declared unique
                    // columns. If a table ever declares two,
                    // this resolver must disambiguate by
                    // probing — today responses.follows is
                    // the only one.
                    const column =
                        uniqueColumns(table)[0] ?? 'id';
                    throw new UniqueConstraintError(
                        table, column,
                    );
                }
                throw err;
            }
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

// Create every object store (one per table + the schema
// marker) with its declared indexes. Runs only inside
// onupgradeneeded — the sole context where IndexedDB
// permits createObjectStore.
function createSchemaStores(db: IDBDatabase): void {
    for (const table of TABLE_NAMES) {
        if (db.objectStoreNames.contains(table)) {
            continue;
        }
        const store = db.createObjectStore(
            table, { keyPath: 'id' },
        );
        for (
            const spec of TABLE_INDEXES[table] ?? []
        ) {
            const col = indexColumn(spec);
            store.createIndex(col, col, {
                unique:
                    typeof spec !== 'string' && spec.unique,
            });
        }
    }
    if (!db.objectStoreNames.contains(SCHEMA_STORE)) {
        db.createObjectStore(
            SCHEMA_STORE, { keyPath: 'id' },
        );
    }
}

export class IndexedDbBackend implements StorageBackend {
    #db: IDBDatabase | null;

    constructor() {
        this.#db = null;
    }

    // Open the connection, creating every object store (one
    // per table + the schema marker) in onupgradeneeded —
    // which fires only when the DB is first created. There is
    // no schema version (no migrations until Postgres); new
    // indexes are adopted when a store is reborn on reset.
    // Resolves with the opened connection; the caller decides
    // whether to adopt or heal it.
    #openConnection(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME);
            request.onupgradeneeded = () =>
                createSchemaStores(request.result);
            request.onsuccess = () =>
                resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(
                new Error(
                    'IndexedDB open blocked by another'
                    + ' connection.',
                ),
            );
        });
    }

    // Delete the database so the next open re-runs the
    // upgrade and rebuilds every store. Mirrors
    // #openConnection's onblocked rejection so a rare
    // multi-tab-during-recovery edge surfaces visibly rather
    // than corrupting silently.
    #deleteConnection(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request =
                indexedDB.deleteDatabase(DB_NAME);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(
                new Error(
                    'IndexedDB delete blocked by another'
                    + ' connection.',
                ),
            );
        });
    }

    // Adopt an opened connection: close it on a versionchange
    // event — fired when another tab deletes the database to
    // reset — so that delete is never blocked.
    #install(db: IDBDatabase): void {
        db.onversionchange = () => db.close();
        this.#db = db;
    }

    // The open hook the adapter runs in initialize(). On
    // first open, onupgradeneeded builds every store. But a
    // pre-existing DB holding NONE of our stores never ran
    // our upgrade (a bare connection some other code left
    // behind); it holds no rows, so we delete and reopen,
    // letting onupgradeneeded rebuild every store. The schema
    // marker store is the canonical "did our upgrade run"
    // signal — the same check onupgradeneeded makes per store
    // — so its absence means heal here, never an internal
    // guard on hasSchema downstream (which would distrust our
    // own gate).
    async open(): Promise<void> {
        if (this.#db !== null) return;
        const db = await this.#openConnection();
        if (db.objectStoreNames.contains(SCHEMA_STORE)) {
            this.#install(db);
            return;
        }
        db.close();
        await this.#deleteConnection();
        this.#install(await this.#openConnection());
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
            const idbTransaction = openTx(
                db, tables, mode,
            );
            let result: R;
            let settled = false;
            idbTransaction.oncomplete = () => {
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
            const tx = openTx(
                db, [SCHEMA_STORE], 'readonly',
            );
            const request = tx.objectStore(SCHEMA_STORE)
                .get(SCHEMA_MARKER_ID);
            request.onsuccess = () =>
                resolve(request.result !== undefined);
            request.onerror = () => reject(request.error);
        });
    }

    async postSchemaCreation(): Promise<void> {
        const db = await this.#connection();
        return new Promise((resolve, reject) => {
            const tx = openTx(
                db, [SCHEMA_STORE], 'readwrite',
            );
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.objectStore(SCHEMA_STORE).put({
                id: SCHEMA_MARKER_ID,
            });
        });
    }

    // Reset by delete + reopen, not clear: re-firing
    // onupgradeneeded is how the rebuilt stores adopt the
    // indexes. Both snapshots-page resets ("pristine" and
    // "mock data") flow through here. Close our own
    // connection first — it would block the delete — then
    // reopen, leaving a healthy connection for the
    // postSchemaCreation + populate that follows.
    async deleteSchema(): Promise<void> {
        if (this.#db !== null) {
            this.#db.close();
            this.#db = null;
        }
        await this.#deleteConnection();
        this.#install(await this.#openConnection());
    }
}

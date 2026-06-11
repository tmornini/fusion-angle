import {
    EntityNotFoundError,
    type StateStore,
    type EntityStore as EntityStoreInterface,
    type EntityPut,
    type EntityValidator,
    type GuardedEntityWriter,
    type KeyedCollectionReader,
    type TxRunner,
} from './db.ts';

export class EntityStore<T extends { id: string }>
    implements
        EntityStoreInterface<T>,
        KeyedCollectionReader<T>,
        GuardedEntityWriter<T>
{
    readonly #table: string;
    readonly #run: TxRunner;
    readonly #stateStore: StateStore;
    readonly #validate: EntityValidator<T>;

    constructor(
        table: string,
        run: TxRunner,
        stateStore: StateStore,
        validate: EntityValidator<T>,
    ) {
        this.#table = table;
        this.#run = run;
        this.#stateStore = stateStore;
        this.#validate = validate;
    }

    async getAll(): Promise<T[]> {
        // Entity rows and the deleted-id scan read one tx —
        // two reads, one truth — so a concurrent tombstone
        // can't tear the result.
        return this.#run(
            [this.#table, 'states'], 'readonly',
            async (tx) => {
                const rows = await tx.getAll<T>(
                    this.#table,
                );
                const deletedIds =
                    await this.#stateStore.getDeletedIdsIn(
                        tx,
                    );
                return rows.filter(
                    row => !deletedIds.has(row.id),
                );
            },
        );
    }

    // The keyed-collection read: getAll narrowed to one
    // indexed column. Same one-tx discipline as getAll — the
    // index returns only matching rows, the deleted-id scan
    // rides the SAME tx, two reads one truth — so the org
    // fence reads a tenant's slice without scanning the table.
    async getAllWhere(
        column: string,
        key: string,
    ): Promise<T[]> {
        return this.#run(
            [this.#table, 'states'], 'readonly',
            async (tx) => {
                const rows = await tx.getWhere<T>(
                    this.#table, column, key,
                );
                const deletedIds =
                    await this.#stateStore.getDeletedIdsIn(
                        tx,
                    );
                return rows.filter(
                    row => !deletedIds.has(row.id),
                );
            },
        );
    }

    async getById(id: string): Promise<T> {
        return this.#run(
            [this.#table, 'states'], 'readonly',
            async (tx) => {
                if (
                    await this.#stateStore.isDeletedIn(
                        tx, id,
                    )
                ) {
                    throw new EntityNotFoundError(
                        this.#table, id,
                    );
                }
                const row = await tx.get<T>(
                    this.#table, id,
                );
                if (!row) {
                    throw new EntityNotFoundError(
                        this.#table, id,
                    );
                }
                return row;
            },
        );
    }

    async put(
        id: string,
        fields: Omit<T, 'id'>,
    ): Promise<T> {
        const { id: _id, ...body } =
            fields as unknown as Record<string, unknown>;
        const written = {
            ...this.#validate(body),
            id,
        } as T;
        // The row op IS the upsert (Commandment VII): no
        // read-then-splice guard — that was internal
        // defense, distrust of our own gate.
        await this.#run(
            [this.#table], 'readwrite',
            tx => tx.put(this.#table, written),
        );
        return written;
    }

    async putMany(
        entries: readonly EntityPut<T>[],
        deleteIds: readonly string[],
    ): Promise<void> {
        const written = entries.map(entry => {
            const { id: _id, ...body } =
                entry.fields as unknown as
                    Record<string, unknown>;
            return {
                ...this.#validate(body),
                id: entry.id,
            } as T;
        });
        await this.#run(
            [this.#table], 'readwrite',
            async (tx) => {
                for (const id of deleteIds) {
                    await tx.delete(this.#table, id);
                }
                for (const row of written) {
                    await tx.put(this.#table, row);
                }
            },
        );
    }

    // Hard splice. The states log is for entities whose
    // history matters; transient entities (claims, field
    // values) simply leave the table when no longer
    // referenced. The delete is unconditional and idempotent
    // — no read, no findIndex.
    async delete(id: string): Promise<void> {
        await this.#run(
            [this.#table], 'readwrite',
            tx => tx.delete(this.#table, id),
        );
    }

    // The guarded write primitives (GuardedEntityWriter):
    // peek + guard + write ride ONE tx. The peek is tx.get —
    // raw, tombstone-blind — so a guard sees a tombstoned
    // row as existing, never as absent.
    async putGuarded(
        id: string,
        fields: Omit<T, 'id'>,
        guard: (
            existing: T | null,
            id: string,
        ) => void,
    ): Promise<T> {
        const { id: _id, ...body } =
            fields as unknown as Record<string, unknown>;
        const written = {
            ...this.#validate(body),
            id,
        } as T;
        await this.#run(
            [this.#table], 'readwrite',
            async (tx) => {
                guard(
                    await tx.get<T>(this.#table, id),
                    id,
                );
                await tx.put(this.#table, written);
            },
        );
        return written;
    }

    async putManyGuarded(
        entries: readonly EntityPut<T>[],
        deleteIds: readonly string[],
        putGuard: (
            existing: T | null,
            id: string,
        ) => void,
        deleteGuard: (existing: T | null) => boolean,
    ): Promise<void> {
        const written = entries.map(entry => {
            const { id: _id, ...body } =
                entry.fields as unknown as
                    Record<string, unknown>;
            return {
                ...this.#validate(body),
                id: entry.id,
            } as T;
        });
        await this.#run(
            [this.#table], 'readwrite',
            async (tx) => {
                for (const id of deleteIds) {
                    const existing = await tx.get<T>(
                        this.#table, id,
                    );
                    if (deleteGuard(existing)) {
                        await tx.delete(
                            this.#table, id,
                        );
                    }
                }
                for (const row of written) {
                    putGuard(
                        await tx.get<T>(
                            this.#table, row.id,
                        ),
                        row.id,
                    );
                    await tx.put(this.#table, row);
                }
            },
        );
    }

    async deleteGuarded(
        id: string,
        guard: (existing: T | null) => boolean,
    ): Promise<void> {
        await this.#run(
            [this.#table], 'readwrite',
            async (tx) => {
                const existing = await tx.get<T>(
                    this.#table, id,
                );
                if (guard(existing)) {
                    await tx.delete(this.#table, id);
                }
            },
        );
    }
}

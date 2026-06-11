import {
    EntityNotFoundError,
    type EntityStore as EntityStoreInterface,
    type EntityPut,
    type EntityValidator,
    type GuardedEntityWriter,
    type TxRunner,
} from './db.ts';

// History tables hold immutable point-in-time facts. Their
// only valid removal is hard splice (eviction for cap
// enforcement, schema reset, etc.) — never a tombstone,
// which would corrupt the global deleted-id keyspace shared
// with entity tables. So a history store never reads the
// states log: it declares only its own table on every tx.
export class HistoryEntityStore<
    T extends { id: string },
> implements
    EntityStoreInterface<T>,
    GuardedEntityWriter<T>
{
    readonly #table: string;
    readonly #run: TxRunner;
    readonly #validate: EntityValidator<T>;

    constructor(
        table: string,
        run: TxRunner,
        validate: EntityValidator<T>,
    ) {
        this.#table = table;
        this.#run = run;
        this.#validate = validate;
    }

    async getAll(): Promise<T[]> {
        return this.#run(
            [this.#table], 'readonly',
            tx => tx.getAll<T>(this.#table),
        );
    }

    // The keyed-collection read: getAll narrowed to one
    // indexed column. History rows never tombstone, so —
    // like getAll — no deleted-id scan; just the index slice.
    async getAllWhere(
        column: string,
        key: string,
    ): Promise<T[]> {
        return this.#run(
            [this.#table], 'readonly',
            tx => tx.getWhere<T>(
                this.#table, column, key,
            ),
        );
    }

    async getById(id: string): Promise<T> {
        return this.#run(
            [this.#table], 'readonly',
            async (tx) => {
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
        // Validate every entry before opening the tx, so a
        // bad row throws before any write — the whole batch
        // is all-or-nothing.
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

    async delete(id: string): Promise<void> {
        await this.#run(
            [this.#table], 'readwrite',
            tx => tx.delete(this.#table, id),
        );
    }

    // The guarded write primitives (GuardedEntityWriter):
    // peek + guard + write ride ONE tx. History rows never
    // tombstone, so the raw peek and the lifecycle view
    // coincide here; the org fence still requires the
    // capability on every store it wraps.
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

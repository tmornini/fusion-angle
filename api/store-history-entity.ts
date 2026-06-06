import {
    EntityNotFound,
    type EntityStore as EntityStoreInterface,
    type EntityPut,
    type EntityValidator,
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
> implements EntityStoreInterface<T>
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

    async getById(id: string): Promise<T> {
        return this.#run(
            [this.#table], 'readonly',
            async (tx) => {
                const row = await tx.get<T>(
                    this.#table, id,
                );
                if (!row) {
                    throw new EntityNotFound(
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
}

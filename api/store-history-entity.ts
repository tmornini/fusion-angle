import {
    EntityNotFoundError,
    type EntityStore as EntityStoreInterface,
    type EntityValidator,
    type TxRunner,
} from './db.ts';

// History tables hold immutable point-in-time facts. Their
// only valid removal is hard splice (eviction for cap
// enforcement, schema reset, etc.) — never a tombstone.
// A history store never consults a lifecycle log: it
// declares only its own table on every tx.
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

    async getCollectionPairs(path: string): Promise<T[]> {
        return this.#run(
            [this.#table], 'readonly',
            tx => tx.getWhere<T>(this.#table, 'path', path),
        );
    }

    async getPairsByRequestHash(hash: string): Promise<T[]> {
        return this.#run(
            [this.#table], 'readonly',
            tx => tx.getWhere<T>(
                this.#table, 'request_hash', hash,
            ),
        );
    }

    async getDocumentHistory(
        path: string,
        name: string,
    ): Promise<T[]> {
        return this.#run(
            [this.#table], 'readonly',
            tx => tx.getAddress<T>(this.#table, path, name),
        );
    }

    async getAllWhereBody(
        path: string,
        containment: Record<string, unknown>,
    ): Promise<T[]> {
        return this.#run(
            [this.#table], 'readonly',
            tx => tx.getWhereBody<T>(
                this.#table, path, containment,
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

    async append(
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
}

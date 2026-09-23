import {
    EntityNotFoundError,
    type EntityStore as EntityStoreInterface,
    type EntityValidator,
    type TxRunner,
} from './db.ts';

// History tables hold immutable point-in-time facts. Their
// only valid removal is hard splice (eviction for cap
// enforcement, schema reset, etc.) — never a tombstone.
// A history store never consults a lifecycle log. `#table`
// names the entity for EntityNotFoundError only.
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
            'readonly',
            tx => tx.getAll<T>(),
        );
    }

    async getCollectionPairs(path: string): Promise<T[]> {
        return this.#run(
            'readonly',
            tx => tx.getCollectionPairs<T>(path),
        );
    }

    async getDocumentHistory(
        path: string,
        name: string,
    ): Promise<T[]> {
        return this.#run(
            'readonly',
            tx => tx.getDocumentHistory<T>(path, name),
        );
    }

    async getHead(
        path: string,
        name: string,
    ): Promise<{
        readonly id: string;
        readonly method: string;
    } | null> {
        return this.#run(
            'readonly',
            (tx) => tx.getHead(path, name),
        );
    }

    async getHeadPair(
        path: string,
        name: string,
    ): Promise<T | null> {
        return this.#run(
            'readonly',
            (tx) => tx.getHeadPair<T>(path, name),
        );
    }

    async getCollectionHeadPairs(path: string): Promise<T[]> {
        return this.#run(
            'readonly',
            (tx) => tx.getCollectionHeadPairs<T>(path),
        );
    }

    async getAllWhereBody(
        path: string,
        containment: Record<string, unknown>,
    ): Promise<T[]> {
        return this.#run(
            'readonly',
            tx => tx.getWhereBody<T>(path, containment),
        );
    }

    async getById(id: string): Promise<T> {
        return this.#run(
            'readonly',
            async (tx) => {
                const row = await tx.getById<T>(id);
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
    ): Promise<boolean> {
        const { id: _id, ...body } =
            fields as unknown as Record<string, unknown>;
        const written = {
            ...this.#validate(body),
            id,
        } as T;
        return this.#run(
            'readwrite',
            (tx) => tx.append(written),
        );
    }
}

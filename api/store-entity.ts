import {
    EntityNotFound,
    type DeletedStore,
    type EntityStore as EntityStoreInterface,
    type StorageBackend,
} from './db.ts';
import { createSerializer } from './store-serializer.ts';

export class EntityStore<T extends { id: string }>
    implements EntityStoreInterface<T>
{
    readonly #table: string;
    readonly #backend: StorageBackend;
    readonly #deleted: DeletedStore;
    readonly #serialize:
        <R>(fn: () => Promise<R>) => Promise<R>;

    constructor(
        table: string,
        backend: StorageBackend,
        deleted: DeletedStore,
    ) {
        this.#table = table;
        this.#backend = backend;
        this.#deleted = deleted;
        this.#serialize = createSerializer();
    }

    async getAll(): Promise<T[]> {
        const rows = await this.#backend.read<T>(
            this.#table,
        );
        const deletedIds =
            await this.#deleted.allDeletedIds();
        return rows.filter(
            row => !deletedIds.has(row.id),
        );
    }

    async getById(id: string): Promise<T> {
        if (await this.#deleted.isDeleted(id)) {
            throw new EntityNotFound(
                this.#table, id,
            );
        }
        const rows = await this.#backend.read<T>(
            this.#table,
        );
        const row = rows.find(
            entity => entity.id === id,
        );
        if (!row) {
            throw new EntityNotFound(
                this.#table, id,
            );
        }
        return row;
    }

    async put(
        id: string,
        fields: Omit<T, 'id'>,
    ): Promise<T> {
        return this.#serialize(async () => {
            const rows = await this.#backend.read<T>(
                this.#table,
            );
            const index = rows.findIndex(
                entity => entity.id === id,
            );
            const written = {
                ...fields,
                id,
            } as T;
            const next = index >= 0
                ? rows.with(index, written)
                : [...rows, written];
            await this.#backend.write(
                this.#table, next,
            );
            return written;
        });
    }

    async delete(id: string): Promise<void> {
        await this.#deleted.record(id);
    }
}

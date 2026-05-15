import type {
    DeletedStore as DeletedStoreInterface,
    StorageBackend,
} from './db.ts';
import {
    nowUtc,
    type Deleted,
    type Id,
} from './types.ts';
import { createSerializer } from './store-serializer.ts';

const TABLE = 'deleted';

// The global tombstone bag. EntityStore consults it
// on getAll/getById to suppress deleted entities.
// HistoryEntityStore (correctly) never touches it.
export class DeletedStore
    implements DeletedStoreInterface
{
    readonly #backend: StorageBackend;
    readonly #serialize:
        <R>(fn: () => Promise<R>) => Promise<R>;

    constructor(backend: StorageBackend) {
        this.#backend = backend;
        this.#serialize = createSerializer();
    }

    async isDeleted(id: Id): Promise<boolean> {
        const rows = await this.#backend.read<Deleted>(
            TABLE,
        );
        return rows.some(r => r.id === id);
    }

    async record(id: Id): Promise<void> {
        return this.#serialize(async () => {
            const rows =
                await this.#backend.read<Deleted>(TABLE);
            if (rows.some(r => r.id === id)) return;
            const next: Deleted[] = [
                ...rows,
                { id, deleted_at: nowUtc() },
            ];
            await this.#backend.write(TABLE, next);
        });
    }

    async allDeletedIds(): Promise<Set<Id>> {
        const rows = await this.#backend.read<Deleted>(
            TABLE,
        );
        return new Set(rows.map(r => r.id));
    }
}

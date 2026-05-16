import {
    EntityNotFound,
    type StateStore as StateStoreInterface,
    type StorageBackend,
} from './db.ts';
import {
    nowUtc,
    type Id,
    type StateEntity,
} from './types.ts';
import { createSerializer } from './store-serializer.ts';

// The states table is the append-only event log
// of every state change in the system. One row,
// one fact. `record` writes a single row with
// caller-supplied id (Commandment VII —
// idempotency: retries hit the same row). The
// table itself never deletes; the read methods
// scan-and-filter (Postgres tier will index).
export class StateStore
    implements StateStoreInterface
{
    readonly #backend: StorageBackend;
    readonly #table: string;
    readonly #serialize:
        <R>(fn: () => Promise<R>) => Promise<R>;

    constructor(
        backend: StorageBackend,
        table: string,
    ) {
        this.#backend = backend;
        this.#table = table;
        this.#serialize = createSerializer();
    }

    async getAll(): Promise<StateEntity[]> {
        return this.#backend.read<StateEntity>(
            this.#table,
        );
    }

    async getById(id: Id): Promise<StateEntity> {
        const rows = await this.#backend.read<
            StateEntity
        >(this.#table);
        const row = rows.find(r => r.id === id);
        if (!row) {
            throw new EntityNotFound(
                this.#table, id,
            );
        }
        return row;
    }

    async put(
        id: Id,
        fields: Omit<StateEntity, 'id'>,
    ): Promise<StateEntity> {
        return this.#serialize(async () => {
            const rows = await this.#backend.read<
                StateEntity
            >(this.#table);
            const index = rows.findIndex(
                r => r.id === id,
            );
            const written: StateEntity = {
                ...fields,
                id,
            };
            const next = index >= 0
                ? rows.with(index, written)
                : [...rows, written];
            await this.#backend.write(
                this.#table, next,
            );
            return written;
        });
    }

    async record(
        id: Id,
        entityId: Id,
        state: string,
        workerId: Id,
    ): Promise<void> {
        await this.put(id, {
            entity_id: entityId,
            state,
            worker_id: workerId,
            at: nowUtc(),
        });
    }

    async currentFor(
        entityId: Id,
    ): Promise<StateEntity | null> {
        const rows = await this.#backend.read<
            StateEntity
        >(this.#table);
        let latest: StateEntity | null = null;
        for (const row of rows) {
            if (row.entity_id !== entityId) {
                continue;
            }
            if (
                latest === null
                || row.at > latest.at
            ) {
                latest = row;
            }
        }
        return latest;
    }

    async allFor(
        entityId: Id,
    ): Promise<StateEntity[]> {
        const rows = await this.#backend.read<
            StateEntity
        >(this.#table);
        return rows
            .filter(r => r.entity_id === entityId)
            .sort((a, b) =>
                a.at < b.at ? -1
                    : a.at > b.at ? 1
                        : 0,
            );
    }

    // Answers "which entities are currently in
    // state=deleted?" by scanning the log and keeping
    // the latest event per entity_id (>= tiebreak so
    // same-millisecond writes resolve to insertion
    // order — the deterministic order the append-only
    // log already captures). Hot path for getAll on
    // every EntityStore.
    async deletedIds(): Promise<Set<Id>> {
        const rows = await this.#backend.read<
            StateEntity
        >(this.#table);
        const latestByEntity = new Map<Id, StateEntity>();
        for (const row of rows) {
            const seen =
                latestByEntity.get(row.entity_id);
            if (
                seen === undefined
                || row.at >= seen.at
            ) {
                latestByEntity.set(row.entity_id, row);
            }
        }
        const deleted = new Set<Id>();
        for (const [entityId, row] of latestByEntity) {
            if (row.state === 'deleted') {
                deleted.add(entityId);
            }
        }
        return deleted;
    }

    // Single-entity variant for getById's hot path.
    // Scans the log once, keeps only rows for the
    // requested entity, returns whether the latest
    // is 'deleted'. O(events per entity) — small.
    async isDeleted(id: Id): Promise<boolean> {
        const rows = await this.#backend.read<
            StateEntity
        >(this.#table);
        let latest: StateEntity | null = null;
        for (const row of rows) {
            if (row.entity_id !== id) continue;
            if (
                latest === null
                || row.at >= latest.at
            ) {
                latest = row;
            }
        }
        return latest !== null
            && latest.state === 'deleted';
    }
}

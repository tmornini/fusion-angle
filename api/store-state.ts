import {
    EntityNotFound,
    type StateStore as StateStoreInterface,
    type EntityValidator,
    type Tx,
    type TxRunner,
} from './db.ts';
import {
    nowUtc,
    type Id,
    type StateEntity,
} from './types.ts';

// The states table is the append-only event log of every
// state change in the system. One row, one fact. `record`
// writes a single row with caller-supplied id (Commandment
// VII — idempotency: retries hit the same row). The table
// never deletes; the read methods scan-and-filter (the
// Postgres tier will index).
//
// Every op crosses the runner: standalone, the runner opens
// a fresh single-op transaction; joined to a view, it runs
// against the already-open tx. The `*In(tx)` twins let a
// joined reader (EntityStore) scan the log inside the SAME
// transaction that reads the entity row — two reads, one
// truth.
export class StateStore
    implements StateStoreInterface
{
    readonly #run: TxRunner;
    readonly #table: string;
    readonly #validate: EntityValidator<StateEntity>;

    constructor(
        run: TxRunner,
        table: string,
        validate: EntityValidator<StateEntity>,
    ) {
        this.#run = run;
        this.#table = table;
        this.#validate = validate;
    }

    async getAll(): Promise<StateEntity[]> {
        return this.#run(
            [this.#table], 'readonly',
            tx => tx.getAll<StateEntity>(this.#table),
        );
    }

    async getById(id: Id): Promise<StateEntity> {
        return this.#run(
            [this.#table], 'readonly',
            async (tx) => {
                const row = await tx.get<StateEntity>(
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
        id: Id,
        fields: Omit<StateEntity, 'id'>,
    ): Promise<StateEntity> {
        // Validate at the storage edge — the same gate the
        // states route applies, so a direct put cannot smuggle
        // a malformed event past it.
        const written: StateEntity = {
            ...this.#validate(
                fields as unknown as
                    Record<string, unknown>,
            ),
            id,
        };
        await this.#run(
            [this.#table], 'readwrite',
            tx => tx.put(this.#table, written),
        );
        return written;
    }

    async record(
        id: Id,
        entityId: Id,
        state: string,
        memberId: Id,
    ): Promise<void> {
        await this.put(id, {
            entity_id: entityId,
            state,
            member_id: memberId,
            at: nowUtc(),
        });
    }

    async currentFor(
        entityId: Id,
    ): Promise<StateEntity | null> {
        return this.#run(
            [this.#table], 'readonly',
            tx => this.currentForIn(tx, entityId),
        );
    }

    async allFor(entityId: Id): Promise<StateEntity[]> {
        return this.#run(
            [this.#table], 'readonly',
            tx => this.allForIn(tx, entityId),
        );
    }

    async deletedIds(): Promise<Set<Id>> {
        return this.#run(
            [this.#table], 'readonly',
            tx => this.deletedIdsIn(tx),
        );
    }

    async isDeleted(id: Id): Promise<boolean> {
        return this.#run(
            [this.#table], 'readonly',
            tx => this.isDeletedIn(tx, id),
        );
    }

    async currentForIn(
        tx: Tx,
        entityId: Id,
    ): Promise<StateEntity | null> {
        const rows = await tx.getAll<StateEntity>(
            this.#table,
        );
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

    async allForIn(
        tx: Tx,
        entityId: Id,
    ): Promise<StateEntity[]> {
        const rows = await tx.getAll<StateEntity>(
            this.#table,
        );
        return rows
            .filter(r => r.entity_id === entityId)
            .sort((a, b) =>
                a.at < b.at ? -1
                    : a.at > b.at ? 1
                        : 0,
            );
    }

    // Answers "which entities are currently in
    // state=deleted?" by scanning the log and keeping the
    // latest event per entity_id (>= tiebreak so
    // same-millisecond writes resolve to insertion order —
    // the deterministic order the append-only log already
    // captures). Hot path for getAll on every EntityStore.
    async deletedIdsIn(tx: Tx): Promise<Set<Id>> {
        const rows = await tx.getAll<StateEntity>(
            this.#table,
        );
        const latestByEntity =
            new Map<Id, StateEntity>();
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

    // Single-entity variant for getById's hot path. Scans
    // the log once, keeps only rows for the requested
    // entity, returns whether the latest is 'deleted'.
    async isDeletedIn(
        tx: Tx,
        id: Id,
    ): Promise<boolean> {
        const rows = await tx.getAll<StateEntity>(
            this.#table,
        );
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

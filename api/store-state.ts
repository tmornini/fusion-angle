import {
    EntityNotFoundError,
    LedgerImmutabilityError,
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
import { latestByKey } from './ledger-reduction.ts';

// The states table is the append-only event log of every
// state change in the system. One row, one fact. `record`
// writes a single row with caller-supplied id (Commandment
// VII — idempotency: retries hit the same row). The table
// never deletes, and `put` enforces it: an identical re-put
// is the idempotent retry; a different payload on an
// existing id throws LedgerImmutabilityError. Entity-scoped
// reads narrow through the `entity_id` index; getDeletedIdsIn
// alone still reduces the whole log — no key answers "which
// ids are tombstoned".
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
                    throw new EntityNotFoundError(
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
        // Check + write in ONE readwrite tx so a concurrent
        // writer cannot slip between the read and the put.
        await this.#run(
            [this.#table], 'readwrite',
            async (tx) => {
                const existing =
                    await tx.get<StateEntity>(
                        this.#table, id,
                    );
                if (existing === null) {
                    await tx.put(this.#table, written);
                    return;
                }
                if (!sameEvent(existing, written)) {
                    throw new LedgerImmutabilityError(
                        this.#table, id,
                    );
                }
            },
        );
        return written;
    }

    async postEvent(
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

    async getCurrentFor(
        entityId: Id,
    ): Promise<StateEntity | null> {
        return this.#run(
            [this.#table], 'readonly',
            tx => this.getCurrentForIn(tx, entityId),
        );
    }

    async getAllFor(entityId: Id): Promise<StateEntity[]> {
        return this.#run(
            [this.#table], 'readonly',
            tx => this.getAllForIn(tx, entityId),
        );
    }

    async getDeletedIds(): Promise<Set<Id>> {
        return this.#run(
            [this.#table], 'readonly',
            tx => this.getDeletedIdsIn(tx),
        );
    }

    async isDeleted(id: Id): Promise<boolean> {
        return this.#run(
            [this.#table], 'readonly',
            tx => this.isDeletedIn(tx, id),
        );
    }

    async getCurrentForIn(
        tx: Tx,
        entityId: Id,
    ): Promise<StateEntity | null> {
        const rows = await tx.getWhere<StateEntity>(
            this.#table, 'entity_id', entityId,
        );
        // The default (at, id) total order — ONE truth with
        // getDeletedIdsIn/isDeletedIn, so list filtering and
        // lifecycle reads can never contradict each other.
        return latestByKey(
            rows, row => row.entity_id,
        ).get(entityId) ?? null;
    }

    async getAllForIn(
        tx: Tx,
        entityId: Id,
    ): Promise<StateEntity[]> {
        const rows = await tx.getWhere<StateEntity>(
            this.#table, 'entity_id', entityId,
        );
        return rows.sort((a, b) =>
            a.at < b.at ? -1
                : a.at > b.at ? 1
                    : 0,
        );
    }

    // Answers "which entities are currently in
    // state=deleted?" by scanning the log and keeping the
    // latest event per entity_id under the (at, id) total
    // order — identical on every backend and every row
    // permutation. Hot path for getAll on every EntityStore.
    async getDeletedIdsIn(tx: Tx): Promise<Set<Id>> {
        const rows = await tx.getAll<StateEntity>(
            this.#table,
        );
        const latestByEntity = latestByKey(
            rows, row => row.entity_id,
        );
        const deleted = new Set<Id>();
        for (const [entityId, row] of latestByEntity) {
            if (row.state === 'deleted') {
                deleted.add(entityId);
            }
        }
        return deleted;
    }

    // Single-entity variant for getById's hot path. Reads
    // this entity's events through the `entity_id` index and
    // returns whether its latest event is 'deleted'.
    async isDeletedIn(
        tx: Tx,
        id: Id,
    ): Promise<boolean> {
        const rows = await tx.getWhere<StateEntity>(
            this.#table, 'entity_id', id,
        );
        const latest = latestByKey(rows, row => row.entity_id)
            .get(id);
        return latest !== undefined
            && latest.state === 'deleted';
    }
}

function sameEvent(
    a: StateEntity,
    b: StateEntity,
): boolean {
    return a.entity_id === b.entity_id
        && a.state === b.state
        && a.member_id === b.member_id
        && a.at === b.at;
}

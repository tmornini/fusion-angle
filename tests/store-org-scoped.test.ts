import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OrgScopedEntityStore }
    from '../api/store-org-scoped.ts';
import { EntityNotFound } from '../api/db.ts';
import type {
    EntityStore,
    EntityPut,
    KeyedCollectionReader,
} from '../api/db.ts';

interface Row {
    id: string;
    organization_id: string;
    label: string;
}

// A minimal in-memory EntityStore the decorator can wrap, so
// the test exercises the guard's logic — not store-entity's.
class FakeStore
    implements
        EntityStore<Row>,
        KeyedCollectionReader<Row>
{
    readonly #rows = new Map<string, Row>();

    constructor(seed: readonly Row[] = []) {
        for (const row of seed) this.#rows.set(row.id, row);
    }

    async getAll(): Promise<Row[]> {
        return [...this.#rows.values()];
    }

    async getAllWhere(
        column: string,
        key: string,
    ): Promise<Row[]> {
        return [...this.#rows.values()].filter(
            row => (
                row as unknown as Record<string, unknown>
            )[column] === key,
        );
    }

    async getById(id: string): Promise<Row> {
        const row = this.#rows.get(id);
        if (row === undefined) {
            throw new EntityNotFound('rows', id);
        }
        return row;
    }

    async put(
        id: string,
        fields: Omit<Row, 'id'>,
    ): Promise<Row> {
        const row = { id, ...fields };
        this.#rows.set(id, row);
        return row;
    }

    async putMany(
        entries: readonly EntityPut<Row>[],
        deleteIds: readonly string[],
    ): Promise<void> {
        for (const id of deleteIds) this.#rows.delete(id);
        for (const entry of entries) {
            this.#rows.set(entry.id, {
                id: entry.id, ...entry.fields,
            });
        }
    }

    async delete(id: string): Promise<void> {
        this.#rows.delete(id);
    }
}

function seeded(): FakeStore {
    return new FakeStore([
        { id: 'a1', organization_id: 'A', label: 'mine' },
        { id: 'a2', organization_id: 'A', label: 'mine2' },
        { id: 'b1', organization_id: 'B', label: 'theirs' },
    ]);
}

function scopedToA(inner: FakeStore): OrgScopedEntityStore<Row> {
    return new OrgScopedEntityStore<Row>(inner, 'A', 'rows');
}

test('getAll returns only the bound org rows', async () => {
    const rows = await scopedToA(seeded()).getAll();
    assert.deepEqual(
        rows.map(r => r.id).sort(),
        ['a1', 'a2'],
    );
});

test('getById returns an own-org row', async () => {
    const row = await scopedToA(seeded()).getById('a1');
    assert.equal(row.label, 'mine');
});

test('getById 404s a foreign-org row', async () => {
    await assert.rejects(
        () => scopedToA(seeded()).getById('b1'),
        (e: unknown) => e instanceof EntityNotFound,
    );
});

test('a foreign-org 404 is identical to an absent 404',
async () => {
    const foreign = await scopedToA(seeded())
        .getById('b1').catch(e => e as unknown);
    const absent = await scopedToA(new FakeStore())
        .getById('b1').catch(e => e as unknown);
    assert.ok(foreign instanceof EntityNotFound);
    assert.ok(absent instanceof EntityNotFound);
    assert.equal(foreign.message, absent.message);
    assert.equal(foreign.table, absent.table);
});

test('put stamps the bound org, ignoring a forged body',
async () => {
    const inner = seeded();
    const written = await scopedToA(inner).put('a3', {
        organization_id: 'B', label: 'forged',
    });
    assert.equal(written.organization_id, 'A');
    assert.equal(
        (await inner.getById('a3')).organization_id, 'A',
    );
});

test('putMany stamps the bound org onto every entry',
async () => {
    const inner = seeded();
    await scopedToA(inner).putMany([
        { id: 'a4', fields: {
            organization_id: 'B', label: 'x' } },
        { id: 'a5', fields: {
            organization_id: 'B', label: 'y' } },
    ], []);
    assert.equal(
        (await inner.getById('a4')).organization_id, 'A',
    );
    assert.equal(
        (await inner.getById('a5')).organization_id, 'A',
    );
});

test('delete 404s a foreign-org id and splices nothing',
async () => {
    const inner = seeded();
    await assert.rejects(
        () => scopedToA(inner).delete('b1'),
        (e: unknown) => e instanceof EntityNotFound,
    );
    assert.equal((await inner.getById('b1')).label, 'theirs');
});

test('putMany 404s a foreign-org delete id, splices nothing',
async () => {
    const inner = seeded();
    await assert.rejects(
        () => scopedToA(inner).putMany([], ['b1']),
        (e: unknown) => e instanceof EntityNotFound,
    );
    assert.equal((await inner.getById('b1')).label, 'theirs');
});

test('delete removes an own-org row', async () => {
    const inner = seeded();
    await scopedToA(inner).delete('a1');
    await assert.rejects(
        () => inner.getById('a1'),
        (e: unknown) => e instanceof EntityNotFound,
    );
});

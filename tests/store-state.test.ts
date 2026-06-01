import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { EntityNotFound } from '../api/db.ts';

test(
    'put round-trip writes and reads back the row',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        const written = await db.states.put('s1', {
            entity_id: 'e1',
            state: 'active',
            worker_id: 'w1',
            at: '2026-01-01T00:00:00.000Z',
        });
        assert.equal(written.id, 's1');
        assert.equal(written.entity_id, 'e1');
        assert.equal(written.state, 'active');
        assert.equal(written.worker_id, 'w1');
        const read = await db.states.getById('s1');
        assert.deepEqual(read, written);
    },
);

test(
    'getById throws EntityNotFound for unknown id',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await assert.rejects(
            () => db.states.getById('missing'),
            (err: unknown) =>
                err instanceof EntityNotFound,
        );
    },
);

test('getAll returns every written row', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.states.put('s1', {
        entity_id: 'e1',
        state: 'a',
        worker_id: 'w1',
        at: '2026-01-01T00:00:00.000Z',
    });
    await db.states.put('s2', {
        entity_id: 'e2',
        state: 'b',
        worker_id: 'w1',
        at: '2026-01-02T00:00:00.000Z',
    });
    const all = await db.states.getAll();
    assert.equal(all.length, 2);
    const ids = all.map(r => r.id).sort();
    assert.deepEqual(ids, ['s1', 's2']);
});

test(
    'record writes nowUtc; later record has later at',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await db.states.record('s1', 'e1', 'a', 'w1');
        // RFC-3339 timestamps from Date.now() share
        // millisecond resolution; pause to guarantee
        // ordering on fast machines.
        await new Promise(resolve =>
            setTimeout(resolve, 2),
        );
        await db.states.record('s2', 'e1', 'b', 'w1');
        const first = await db.states.getById('s1');
        const second = await db.states.getById('s2');
        assert.ok(second.at > first.at);
        assert.equal(first.entity_id, 'e1');
        assert.equal(second.entity_id, 'e1');
        assert.equal(first.state, 'a');
        assert.equal(second.state, 'b');
        assert.equal(first.worker_id, 'w1');
    },
);

test(
    'currentFor returns the latest of three events',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await db.states.put('s1', {
            entity_id: 'e1',
            state: 'a',
            worker_id: 'w1',
            at: '2026-01-01T00:00:00.000Z',
        });
        await db.states.put('s2', {
            entity_id: 'e1',
            state: 'b',
            worker_id: 'w1',
            at: '2026-01-03T00:00:00.000Z',
        });
        await db.states.put('s3', {
            entity_id: 'e1',
            state: 'c',
            worker_id: 'w1',
            at: '2026-01-02T00:00:00.000Z',
        });
        const current =
            await db.states.currentFor('e1');
        assert.ok(current !== null);
        assert.equal(current.id, 's2');
        assert.equal(current.state, 'b');
    },
);

test(
    'currentFor returns null for unknown entity_id',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await db.states.put('s1', {
            entity_id: 'e1',
            state: 'a',
            worker_id: 'w1',
            at: '2026-01-01T00:00:00.000Z',
        });
        const current =
            await db.states.currentFor('unknown');
        assert.equal(current, null);
    },
);

test(
    'allFor returns events for one entity_id sorted '
        + 'ascending by at',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await db.states.put('s1', {
            entity_id: 'e1',
            state: 'b',
            worker_id: 'w1',
            at: '2026-01-02T00:00:00.000Z',
        });
        await db.states.put('s2', {
            entity_id: 'e2',
            state: 'x',
            worker_id: 'w1',
            at: '2026-01-01T00:00:00.000Z',
        });
        await db.states.put('s3', {
            entity_id: 'e1',
            state: 'a',
            worker_id: 'w1',
            at: '2026-01-01T00:00:00.000Z',
        });
        await db.states.put('s4', {
            entity_id: 'e1',
            state: 'c',
            worker_id: 'w1',
            at: '2026-01-03T00:00:00.000Z',
        });
        const events = await db.states.allFor('e1');
        assert.equal(events.length, 3);
        assert.deepEqual(
            events.map(e => e.state),
            ['a', 'b', 'c'],
        );
        assert.deepEqual(
            events.map(e => e.at),
            [
                '2026-01-01T00:00:00.000Z',
                '2026-01-02T00:00:00.000Z',
                '2026-01-03T00:00:00.000Z',
            ],
        );
    },
);

test(
    'allFor returns empty array for unknown entity_id',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await db.states.put('s1', {
            entity_id: 'e1',
            state: 'a',
            worker_id: 'w1',
            at: '2026-01-01T00:00:00.000Z',
        });
        const events =
            await db.states.allFor('unknown');
        assert.deepEqual(events, []);
    },
);

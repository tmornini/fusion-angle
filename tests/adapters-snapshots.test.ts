// @ts-expect-error - Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getSnapshot,
    putSnapshot,
    putSnapshotFromFile,
    postSchemaCreation,
    postMockDataLoad,
    deleteSchema,
    SnapshotTooLargeError,
} from '../web-app/app/adapters/snapshots.ts';

function buildPerson(id: string, first: string) {
    return {
        id,
        first_name: first,
        last_name: 'User',
        email: `${first}@example.com`.toLowerCase(),
        phone: '',
        title: 'product_manager',
        status: 'active',
        strengths: '[]',
        team_dimensions: '{}',
        bio: '',
        department: 'Product',
    };
}

function setup(): {
    db: MemoryDbAdapter;
    ctx: RequestContext;
} {
    const db = new MemoryDbAdapter();
    return { db, ctx: createRequestContext(db) };
}

test('getSnapshot returns a JSON object of tables', async () => {
    const { ctx } = setup();
    const json = await getSnapshot(ctx);
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed.people));
    assert.ok(Array.isArray(parsed.activities));
    assert.ok(Array.isArray(parsed.deleted));
});

test(
    'getSnapshot reflects rows written before the'
    + ' export',
    async () => {
        const { db, ctx } = setup();
        await db.ideas.put('i1', {
            id: 'i1',
            title: 'Seeded idea',
            position: 1,
            status: 'active',
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            readiness: 'ready',
            risks: '[]',
            assumptions: '[]',
            alignments: '[]',
        });
        const parsed =
            JSON.parse(await getSnapshot(ctx));
        assert.equal(parsed.ideas.length, 1);
        assert.equal(
            parsed.ideas[0].title, 'Seeded idea',
        );
    },
);

test(
    'putSnapshot round-trips written rows back'
    + ' into the database',
    async () => {
        const { db, ctx } = setup();
        await putSnapshot(ctx, JSON.stringify({
            people: [buildPerson('u1', 'Alice')],
        }));
        const rows = await db.people.getAll();
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.first_name, 'Alice');
    },
);

test(
    'putSnapshot result is visible via getSnapshot',
    async () => {
        const { ctx } = setup();
        await putSnapshot(ctx, JSON.stringify({
            people: [buildPerson('u1', 'Alice')],
        }));
        const parsed =
            JSON.parse(await getSnapshot(ctx));
        assert.equal(parsed.people.length, 1);
        assert.equal(
            parsed.people[0].id, 'u1',
        );
    },
);

test(
    'putSnapshot replaces, not merges, the prior'
    + ' table contents',
    async () => {
        const { db, ctx } = setup();
        await putSnapshot(ctx, JSON.stringify({
            people: [buildPerson('u1', 'Alice')],
        }));
        await putSnapshot(ctx, JSON.stringify({
            people: [buildPerson('u2', 'Bob')],
        }));
        const rows = await db.people.getAll();
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.id, 'u2');
        assert.equal(rows[0]?.first_name, 'Bob');
    },
);

test(
    'putSnapshotFromFile reads the file and'
    + ' imports it',
    async () => {
        const { db, ctx } = setup();
        const file = new File(
            [JSON.stringify({
                people: [buildPerson('u1', 'Alice')],
            })],
            'snapshot.json',
            { type: 'application/json' },
        );
        await putSnapshotFromFile(ctx, file);
        const rows = await db.people.getAll();
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.first_name, 'Alice');
    },
);

test(
    'putSnapshotFromFile rejects a file over the'
    + ' size cap',
    async () => {
        const { ctx } = setup();
        const big = new File(
            ['x'.repeat(2_600_000)],
            'big.json',
        );
        await assert.rejects(
            () => putSnapshotFromFile(ctx, big),
            (err: unknown) =>
                err instanceof SnapshotTooLargeError,
        );
    },
);

test(
    'SnapshotTooLargeError exposes file size and'
    + ' available cap',
    async () => {
        const { ctx } = setup();
        const big = new File(
            ['x'.repeat(2_600_000)],
            'big.json',
        );
        await putSnapshotFromFile(ctx, big).then(
            () => assert.fail('expected rejection'),
            (err: SnapshotTooLargeError) => {
                assert.equal(err.fileSize, 2_600_000);
                assert.ok(err.available > 0);
                assert.ok(
                    err.fileSize > err.available,
                );
            },
        );
    },
);

test('postSchemaCreation keeps existing data', async () => {
    const { db, ctx } = setup();
    await db.people.put(
        'u1', buildPerson('u1', 'Alice'),
    );
    await postSchemaCreation(ctx);
    const rows = await db.people.getAll();
    assert.equal(rows.length, 1);
});

test('deleteSchema clears all table contents', async () => {
    const { db, ctx } = setup();
    await db.people.put(
        'u1', buildPerson('u1', 'Alice'),
    );
    await deleteSchema(ctx);
    const rows = await db.people.getAll();
    assert.equal(rows.length, 0);
});

test(
    'postMockDataLoad populates the people table',
    async () => {
        const { db, ctx } = setup();
        await postMockDataLoad(ctx);
        const rows = await db.people.getAll();
        assert.ok(
            rows.length > 0,
            'mock data should seed people',
        );
    },
);

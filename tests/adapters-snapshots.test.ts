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
    RETIRED_KEYS_PER_TABLE,
    RETIRED_TABLES,
    SnapshotTooLargeError,
    SnapshotIncompatibleError,
} from '../web-app/app/adapters/snapshots.ts';

function buildWorker(id: string, first: string) {
    return {
        id,
        first_name: first,
        last_name: 'User',
        email: `${first}@example.com`.toLowerCase(),
        phone: '',
        title: 'product_manager',
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
    assert.ok(Array.isArray(parsed.workers));
    assert.ok(Array.isArray(parsed.states));
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
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
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
            workers: [buildWorker('u1', 'Alice')],
        }));
        const rows = await db.workers.getAll();
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.first_name, 'Alice');
    },
);

test(
    'putSnapshot result is visible via getSnapshot',
    async () => {
        const { ctx } = setup();
        await putSnapshot(ctx, JSON.stringify({
            workers: [buildWorker('u1', 'Alice')],
        }));
        const parsed =
            JSON.parse(await getSnapshot(ctx));
        assert.equal(parsed.workers.length, 1);
        assert.equal(
            parsed.workers[0].id, 'u1',
        );
    },
);

test(
    'putSnapshot replaces, not merges, the prior'
    + ' table contents',
    async () => {
        const { db, ctx } = setup();
        await putSnapshot(ctx, JSON.stringify({
            workers: [buildWorker('u1', 'Alice')],
        }));
        await putSnapshot(ctx, JSON.stringify({
            workers: [buildWorker('u2', 'Bob')],
        }));
        const rows = await db.workers.getAll();
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
                workers: [buildWorker('u1', 'Alice')],
            })],
            'snapshot.json',
            { type: 'application/json' },
        );
        await putSnapshotFromFile(ctx, file);
        const rows = await db.workers.getAll();
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
    await db.workers.put(
        'u1', buildWorker('u1', 'Alice'),
    );
    await postSchemaCreation(ctx);
    const rows = await db.workers.getAll();
    assert.equal(rows.length, 1);
});

test('deleteSchema clears all table contents', async () => {
    const { db, ctx } = setup();
    await db.workers.put(
        'u1', buildWorker('u1', 'Alice'),
    );
    await deleteSchema(ctx);
    const rows = await db.workers.getAll();
    assert.equal(rows.length, 0);
});

test(
    'postMockDataLoad populates the workers table',
    async () => {
        const { db, ctx } = setup();
        await postMockDataLoad(ctx);
        const rows = await db.workers.getAll();
        assert.ok(
            rows.length > 0,
            'mock data should seed workers',
        );
    },
);

test(
    'putSnapshot rejects retired activities table',
    async () => {
        const { ctx } = setup();
        const json = JSON.stringify({
            activities: [
                { id: 'x', type: 'idea_created' },
            ],
        });
        await assert.rejects(
            () => putSnapshot(ctx, json),
            SnapshotIncompatibleError,
        );
    },
);

test(
    'putSnapshot rejects retired projects fields',
    async () => {
        const { ctx } = setup();
        const json = JSON.stringify({
            projects: [{
                id: 'p1',
                title: 'P',
                business_context: '{}',
            }],
        });
        await assert.rejects(
            () => putSnapshot(ctx, json),
            /projects\.business_context/,
        );
    },
);

test(
    'putSnapshot rejects retired flows.updated_at',
    async () => {
        const { ctx } = setup();
        const json = JSON.stringify({
            flows: [{
                id: 'f1',
                name: 'F',
                updated_at: '2024-01-01T00:00:00Z',
            }],
        });
        await assert.rejects(
            () => putSnapshot(ctx, json),
            /flows\.updated_at/,
        );
    },
);

test(
    'putSnapshot accepts current-shape snapshot',
    async () => {
        const { ctx } = setup();
        const json = JSON.stringify({ workers: [] });
        await putSnapshot(ctx, json);
    },
);

test(
    'putSnapshot rejects every retired table'
    + ' enumerated in RETIRED_TABLES',
    async () => {
        for (const table of RETIRED_TABLES) {
            const { ctx } = setup();
            const json = JSON.stringify({
                [table]: [{ id: 'x' }],
            });
            await assert.rejects(
                () => putSnapshot(ctx, json),
                (err: Error) =>
                    err instanceof
                        SnapshotIncompatibleError
                    && err.retired.includes(table),
                'expected ' + table
                + ' to surface as retired',
            );
        }
    },
);

test(
    'putSnapshot rejects every retired field'
    + ' enumerated in RETIRED_KEYS_PER_TABLE',
    async () => {
        for (const [table, keys] of Object.entries(
            RETIRED_KEYS_PER_TABLE,
        )) {
            for (const key of keys) {
                const { ctx } = setup();
                const json = JSON.stringify({
                    [table]: [{
                        id: 'x', [key]: 1,
                    }],
                });
                const expected = table + '.' + key;
                await assert.rejects(
                    () => putSnapshot(ctx, json),
                    (err: Error) =>
                        err instanceof
                            SnapshotIncompatibleError
                        && err.retired
                            .includes(expected),
                    'expected ' + expected
                    + ' to surface as retired',
                );
            }
        }
    },
);

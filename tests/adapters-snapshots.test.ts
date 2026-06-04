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
import { devToken } from './token-fixtures.ts';
import {
    mintAccessToken,
    ANONYMOUS_ID,
} from '../api/access-token.ts';
import { seedHumanMember } from './member-fixtures.ts';
import {
    seedRootAdmin,
} from './root-admin-fixture.ts';
import {
    getHasAnyHumanMembers,
    getSnapshot,
    putSnapshot,
    putSnapshotFromFile,
    postSchemaCreation,
    postMockDataLoad,
    deleteSchema,
    RETIRED_KEYS_PER_TABLE,
    RETIRED_STATE_VALUES_PER_ENTITY,
    RETIRED_TABLES,
    SnapshotTooLargeError,
    SnapshotIncompatibleError,
} from '../web-app/app/adapters/snapshots.ts';

// A human_members detail row in the post-normalization
// shape (no name or contact PII — name lives on the parent
// members row, contact PII in identity_pii). The snapshot
// round-trip carries the human_members table, so these
// import / export tests exercise it directly.
function buildHumanDetail(id: string) {
    return {
        id,
        title: 'product_manager',
        strengths: '[]',
        team_dimensions: '{}',
        department: 'Product',
    };
}

async function setup(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedRootAdmin(db);
    return { db, ctx: createRequestContext(db, await devToken()) };
}

test('getSnapshot returns a JSON object of tables', async () => {
    const { ctx } = await setup();
    const json = await getSnapshot(ctx);
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed.members));
    assert.ok(Array.isArray(parsed.states));
});

test(
    'getSnapshot reflects rows written before the'
    + ' export',
    async () => {
        const { db, ctx } = await setup();
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
        const { db, ctx } = await setup();
        await putSnapshot(ctx, JSON.stringify({
            human_members: [
                buildHumanDetail('u1'),
            ],
        }));
        const rows = await db.humanMembers.getAll();
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.id, 'u1');
    },
);

test(
    'putSnapshot result is visible via getSnapshot',
    async () => {
        const { ctx } = await setup();
        await putSnapshot(ctx, JSON.stringify({
            human_members: [
                buildHumanDetail('u1'),
            ],
        }));
        const parsed =
            JSON.parse(await getSnapshot(ctx));
        assert.equal(parsed.human_members.length, 1);
        assert.equal(
            parsed.human_members[0].id, 'u1',
        );
    },
);

test(
    'putSnapshot replaces, not merges, the prior'
    + ' table contents',
    async () => {
        const { db, ctx } = await setup();
        await putSnapshot(ctx, JSON.stringify({
            human_members: [
                buildHumanDetail('u1'),
            ],
        }));
        await putSnapshot(ctx, JSON.stringify({
            human_members: [
                buildHumanDetail('u2'),
            ],
        }));
        const rows = await db.humanMembers.getAll();
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.id, 'u2');
        assert.equal(
            rows[0]?.title, 'product_manager',
        );
    },
);

test(
    'putSnapshotFromFile reads the file and'
    + ' imports it',
    async () => {
        const { db, ctx } = await setup();
        const file = new File(
            [JSON.stringify({
                human_members: [
                    buildHumanDetail('u1'),
                ],
            })],
            'snapshot.json',
            { type: 'application/json' },
        );
        await putSnapshotFromFile(ctx, file);
        const rows = await db.humanMembers.getAll();
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.id, 'u1');
    },
);

test(
    'putSnapshotFromFile rejects a file over the'
    + ' size cap',
    async () => {
        const { ctx } = await setup();
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
        const { ctx } = await setup();
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
    const { db, ctx } = await setup();
    await db.members.put('u1', {
        type: 'human',
    });
    await postSchemaCreation(ctx);
    const rows = await db.members.getAll();
    assert.equal(rows.length, 1);
});

test('deleteSchema clears all table contents', async () => {
    const { db, ctx } = await setup();
    await db.members.put('u1', {
        type: 'human',
    });
    await deleteSchema(ctx);
    assert.equal(await db.hasSchema(), false);
});

test(
    'postMockDataLoad populates the members table',
    async () => {
        const { db, ctx } = await setup();
        await postMockDataLoad(ctx);
        const rows = await db.members.getAll();
        assert.ok(
            rows.length > 0,
            'mock data should seed members',
        );
    },
);

test(
    'putSnapshot rejects retired activities table',
    async () => {
        const { ctx } = await setup();
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
        const { ctx } = await setup();
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
        const { ctx } = await setup();
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
        const { ctx } = await setup();
        const json = JSON.stringify({ members: [] });
        await putSnapshot(ctx, json);
    },
);

test(
    'putSnapshot rejects every retired table'
    + ' enumerated in RETIRED_TABLES',
    async () => {
        for (const table of RETIRED_TABLES) {
            const { ctx } = await setup();
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
                const { ctx } = await setup();
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

test(
    'putSnapshot rejects every retired state value'
    + ' enumerated in'
    + ' RETIRED_STATE_VALUES_PER_ENTITY',
    async () => {
        for (const values of Object.values(
            RETIRED_STATE_VALUES_PER_ENTITY,
        )) {
            for (const value of values) {
                const { ctx } = await setup();
                const json = JSON.stringify({
                    states: [{
                        id: 's1',
                        entity_id: 'e1',
                        state: value,
                        member_id: 'w1',
                        at: '2026-01-01T00:00:00Z',
                    }],
                });
                const expected =
                    'states[].state=' + value;
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

async function anonToken(): Promise<string> {
    return mintAccessToken({
        sub: ANONYMOUS_ID, roles: [], name: 'Anonymous',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'anon',
    });
}

// The snapshots page reads data-existence via the PUBLIC
// snapshot plane, so an anonymous (pre-session) viewer gets a
// correct answer without a 401 at the gate.
test(
    'getHasAnyHumanMembers is false for an anonymous viewer'
    + ' with no members',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedRootAdmin(db);
        const ctx = createRequestContext(db, await anonToken());
        assert.equal(
            await getHasAnyHumanMembers(ctx), false);
    },
);

test(
    'getHasAnyHumanMembers is true for an anonymous viewer'
    + ' when a member exists',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedRootAdmin(db);
        await seedHumanMember(db, 'current', 'Demo');
        const ctx = createRequestContext(db, await anonToken());
        assert.equal(
            await getHasAnyHumanMembers(ctx), true);
    },
);

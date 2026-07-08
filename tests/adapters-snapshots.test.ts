// @ts-expect-error — Node global stub
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
    MissingTableError,
    SNAPSHOT_SCHEMA_VERSION,
    SNAPSHOT_SCHEMA_VERSION_KEY,
} from '../api/db.ts';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
    ANONYMOUS_ID,
} from '../api/access-token.ts';
import { seedHumanMember } from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    getHasAnyHumanMembers,
    getSnapshot,
    putSnapshot,
    putSnapshotFromFile,
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
    await seedAdminSchema(db);
    return { db, ctx: createRequestContext(db, await devToken()) };
}

// Every putSnapshot fixture below needs the reserved schema-
// version marker — parseAndValidateSnapshot rejects its
// absence before any table is read (Phase 12 Task 6).
function withVersion(
    tables: Record<string, unknown>,
): Record<string, unknown> {
    return {
        [SNAPSHOT_SCHEMA_VERSION_KEY]: SNAPSHOT_SCHEMA_VERSION,
        ...tables,
    };
}

// Import REPLACES every table — a snapshot that omits the
// importer's own membership and admin grant locks the session
// out of the authenticated surfaces. Tests that keep using
// the ctx after an import carry the admin's rows, exactly as
// a real exported snapshot would.
function withAdminRows(
    tables: Record<string, unknown[]>,
): Record<string, unknown> {
    return withVersion({
        memberships: [{
            id: 'test-membership-current',
            organization_id: '1',
            identity_id: 'current',
            at: '2020-01-01T00:00:00.000000Z',
        }],
        role_grants: [{
            id: 'test-role-current-admin',
            organization_id: '1',
            identity_id: 'current',
            role: 'admin',
            action: 'granted',
            by_member_id: 'system',
            at: '2020-01-01T00:00:00.000000Z',
        }],
        ...tables,
    });
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
            organization_id: '1',
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
        await putSnapshot(ctx, JSON.stringify(withVersion({
            human_members: [
                buildHumanDetail('u1'),
            ],
        })));
        const rows = await db.humanMembers.getAll();
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.id, 'u1');
    },
);

test(
    'putSnapshot result is visible via getSnapshot',
    async () => {
        const { ctx } = await setup();
        await putSnapshot(ctx, JSON.stringify(withAdminRows({
            human_members: [
                buildHumanDetail('u1'),
            ],
        })));
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
        await putSnapshot(ctx, JSON.stringify(withAdminRows({
            human_members: [
                buildHumanDetail('u1'),
            ],
        })));
        await putSnapshot(ctx, JSON.stringify(withVersion({
            human_members: [
                buildHumanDetail('u2'),
            ],
        })));
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
            [JSON.stringify(withVersion({
                human_members: [
                    buildHumanDetail('u1'),
                ],
            }))],
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

test('a snapshot import stamps the schema marker', async () => {
    const { db, ctx } = await setup();
    await db.members.put('u1', {
        type: 'human',
    });
    const json = await getSnapshot(ctx);
    await db.deleteSchema();
    assert.equal(await db.hasSchema(), false);
    await putSnapshot(ctx, json);
    assert.equal(await db.hasSchema(), true);
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

// The client-side pre-flight CONVENIENCE (scanForRetiredKeys):
// a missing/mismatched marker never reaches the network — the
// SERVER-side gate in api/snapshot-validator.ts is the real
// guarantee, pinned in tests/snapshot-import-validation.test.ts.
test(
    'putSnapshot rejects a snapshot missing the schema'
    + ' version marker before any network round trip',
    async () => {
        const { ctx } = await setup();
        const json = JSON.stringify({ members: [] });
        await assert.rejects(
            () => putSnapshot(ctx, json),
            (err: Error) =>
                err instanceof SnapshotIncompatibleError
                && err.retired.includes(
                    SNAPSHOT_SCHEMA_VERSION_KEY,
                ),
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
                updated_at: '2024-01-01T00:00:00.000000Z',
            }],
        });
        await assert.rejects(
            () => putSnapshot(ctx, json),
            /flows\.updated_at/,
        );
    },
);

test(
    'putSnapshot rejects retired flows.graph',
    async () => {
        const { ctx } = await setup();
        const json = JSON.stringify({
            flows: [{
                id: 'f1',
                name: 'F',
                graph: '{"nodes":[],"edges":[]}',
            }],
        });
        await assert.rejects(
            () => putSnapshot(ctx, json),
            /flows\.graph/,
        );
    },
);

test(
    'putSnapshot accepts current-shape snapshot',
    async () => {
        const { db, ctx } = await setup();
        const json = JSON.stringify(
            withVersion({ members: [] }),
        );
        await putSnapshot(ctx, json);
        // import REPLACES: the seeded admin rows are
        // gone, proving the snapshot actually landed
        assert.deepEqual(
            await db.members.getAll(), [],
        );
        assert.deepEqual(
            await db.memberships.getAll(), [],
        );
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
                        at: '2026-01-01T00:00:00.000000Z',
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
        aud: TOKEN_AUDIENCE,
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
    + ' before a schema exists',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createRequestContext(db, await anonToken());
        assert.equal(
            await getHasAnyHumanMembers(ctx), false);
    },
);

test(
    'getHasAnyHumanMembers reads an admin-only schema as'
    + ' no-data for an anonymous viewer',
    async () => {
        // The snapshot plane is auth-free, so an anonymous
        // viewer reads the schema directly and counts members
        // honestly: an admin-only schema has no human member,
        // so the answer is false.
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
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
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo');
        const ctx = createRequestContext(db, await anonToken());
        assert.equal(
            await getHasAnyHumanMembers(ctx), true);
    },
);

// A hand-built schema, served the same way the partial-schema
// stub above serves one — lets these tests pin the DERIVATION
// (pairs vs. the raw members table slice) directly, without
// driving a full member-creation op through the gate.
function stubSnapshotCtx(
    schema: Record<string, unknown>,
): RequestContext {
    return {
        GET: async (resource: string) => {
            if (resource === 'snapshots/schema') {
                return JSON.stringify(schema);
            }
            return null;
        },
    } as unknown as RequestContext;
}

// Phase 12 Task 6: re-anchored from the raw `members` table
// slice onto the requests/responses message ledger — the SAME
// family address api/derive-members.ts already reads
// (MEMBERS_PREFIX, '/members/'). A raw table row with no
// backing pair is exactly the staleness class this closes: the
// live app's own reads already derive from pairs, so a row that
// exists only in the raw slice would show here but derive EMPTY
// everywhere else.
test(
    'getHasAnyHumanMembers ignores a raw members-table row'
    + ' with no backing message pair',
    async () => {
        const ctx = stubSnapshotCtx({
            members: [{ id: 'stale', type: 'human' }],
            requests: [], responses: [],
        });
        assert.equal(
            await getHasAnyHumanMembers(ctx), false);
    },
);

test(
    'getHasAnyHumanMembers is true from a members-family pair'
    + ' even when the raw members table is empty',
    async () => {
        const ctx = stubSnapshotCtx({
            members: [],
            requests: [{
                id: 'r1', uri_prefix: '/members/',
                uri_id: 'm1',
                at: '2026-01-01T00:00:00.000000Z',
                requester_identity_id: 'system',
                message_hash: 'h', message: '{}',
            }],
            responses: [],
        });
        assert.equal(
            await getHasAnyHumanMembers(ctx), true);
    },
);

// NOT human-members: that family's own address would under-
// report AI/system seeds, whose one parent document always
// rides /members/, never /human-members/. A pair at the detail
// address alone (no /members/ parent pair) must NOT count.
test(
    'getHasAnyHumanMembers ignores a human-members detail'
    + ' pair with no matching /members/ parent pair',
    async () => {
        const ctx = stubSnapshotCtx({
            members: [],
            requests: [{
                id: 'r1', uri_prefix: '/human-members/',
                uri_id: 'u1',
                at: '2026-01-01T00:00:00.000000Z',
                requester_identity_id: 'system',
                message_hash: 'h', message: '{}',
            }],
            responses: [],
        });
        assert.equal(
            await getHasAnyHumanMembers(ctx), false);
    },
);

// A partial/incompatible schema makes the snapshot export
// throw MissingTableError. The recovery page must still
// render its seed/import controls, so this resolves to false
// rather than propagating the throw (BOOT-01 follow-up).
test(
    'getHasAnyHumanMembers is false when the schema is'
    + ' partial (export throws MissingTableError)',
    async () => {
        const ctx = {
            GET: async (resource: string) => {
                if (resource === 'snapshots/schema') {
                    throw new MissingTableError('members');
                }
                return null;
            },
        } as unknown as RequestContext;
        assert.equal(
            await getHasAnyHumanMembers(ctx), false);
    },
);

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    getObjectives,
    getArchivedObjectiveIds,
    getObjectiveArchivalEvents,
    getObjectiveHistories,
    getObjectiveRevisionsByObjective,
    getActiveObjectives,
    getCurrentObjectiveDefinitions,
    getObjectiveStateDetails,
    postObjectiveCreation,
    postObjectiveArchival,
    postObjectiveReactivation,
    putObjectivePosition,
} from '../web-app/app/adapters/objectives.ts';
import {
    computeNewPosition,
} from '../web-app/app/drag-reorder-positions.ts';
import {
    seedCurrentMember,
} from './member-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

function ctxFor(db: MemoryDbAdapter) {
    return createRequestContext(db, DEV_TOKEN);
}

// Seed an objective document with a lifecycle trio — raw
// PUT objectives/:id requires state/state_at/state_event_id
// after the states-address retirement gate (Task 1).
function objectiveDoc(
    position: number,
    state: 'active' | 'archived',
    eventId: string,
    at = '2026-01-01T00:00:00.000000Z',
) {
    return {
        position,
        state,
        state_at: at,
        state_event_id: eventId,
    };
}

test('getObjectives returns all', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const ctx = ctxFor(db);
    await ctx.PUT(
        'objectives/o1',
        objectiveDoc(0, 'active', 'ev-o1'),
    );
    await ctx.PUT(
        'objectives/o2',
        objectiveDoc(1, 'active', 'ev-o2'),
    );
    const rows = await getObjectives(ctx);
    assert.equal(rows.length, 2);
});

function revision(
    objectiveId: string,
    name: string,
    at: string,
) {
    return {
        objective_id: objectiveId,
        name,
        description: 'd:' + name,
        member_id: 'w1',
        at,
    };
}

test(
    'getObjectiveRevisionsByObjective groups one read',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = ctxFor(db);
        await ctx.PUT(
            'objectives/o1/revisions/o1:t0',
            revision(
                'o1', 'A',
                '2026-05-14T00:00:00.000000Z',
            ),
        );
        await ctx.PUT(
            'objectives/o1/revisions/o1:t1',
            revision(
                'o1', 'B',
                '2026-05-15T00:00:00.000000Z',
            ),
        );
        await ctx.PUT(
            'objectives/o2/revisions/o2:t0',
            revision(
                'o2', 'C',
                '2026-05-14T00:00:00.000000Z',
            ),
        );
        const grouped =
            await getObjectiveRevisionsByObjective(
                ctx, ['o1', 'o2'],
            );
        assert.equal(grouped.size, 2);
        assert.equal(grouped.get('o1')!.length, 2);
        assert.equal(grouped.get('o2')!.length, 1);
        assert.deepEqual(grouped.get('o2')![0], {
            id: 'o2:t0',
            objectiveId: 'o2',
            name: 'C',
            description: 'd:C',
            memberId: 'w1',
            at: '2026-05-14T00:00:00.000000Z',
        });
    },
);

test(
    'getCurrentObjectiveDefinitions picks the latest'
    + ' revision per requested id',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = ctxFor(db);
        await ctx.PUT(
            'objectives/o1/revisions/o1:t0',
            revision(
                'o1', 'Old',
                '2026-05-14T00:00:00.000000Z',
            ),
        );
        await ctx.PUT(
            'objectives/o1/revisions/o1:t1',
            revision(
                'o1', 'New',
                '2026-05-15T00:00:00.000000Z',
            ),
        );
        await ctx.PUT(
            'objectives/o2/revisions/o2:t0',
            revision(
                'o2', 'Other',
                '2026-05-14T00:00:00.000000Z',
            ),
        );
        const defs =
            await getCurrentObjectiveDefinitions(
                ctx, ['o1', 'o2'],
            );
        assert.equal(defs.get('o1')!.name, 'New');
        assert.equal(
            defs.get('o1')!.description, 'd:New',
        );
        assert.equal(defs.get('o2')!.name, 'Other');
    },
);

test(
    'getCurrentObjectiveDefinitions throws on an'
    + ' objective with no revisions',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await assert.rejects(
            getCurrentObjectiveDefinitions(
                ctxFor(db), ['ghost'],
            ),
            /no revisions for objective ghost/,
        );
    },
);

test('getArchivedObjectiveIds returns a Set', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const ctx = ctxFor(db);
    // Seed archived via the document PUT carrying the
    // lifecycle trio — GET objectives stamps state on
    // the row (states-URI elimination B6).
    await ctx.PUT(
        'objectives/o1',
        objectiveDoc(0, 'archived', 'ev-o1-arch'),
    );
    const ids = await getArchivedObjectiveIds(ctx);
    assert.ok(ids.has('o1'));
    assert.equal(ids.size, 1);
});

test(
    'getObjectiveArchivalEvents streams archived'
    + ' history rows only',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Rev', 'd', 0,
        );
        await postObjectiveArchival(ctx, 'o1');
        await postObjectiveReactivation(ctx, 'o1');
        await postObjectiveArchival(ctx, 'o1');

        const histories =
            await getObjectiveHistories(ctx);
        assert.ok(
            histories.some(r => r.state === 'active'),
        );
        assert.equal(
            histories.filter(
                r => r.state === 'archived',
            ).length,
            2,
        );

        const archivals =
            await getObjectiveArchivalEvents(ctx);
        assert.equal(archivals.length, 2);
        for (const a of archivals) {
            assert.equal(a.objectiveId, 'o1');
            assert.equal(typeof a.memberId, 'string');
            assert.match(
                a.at, /^\d{4}-\d{2}-\d{2}T/,
            );
        }
    },
);

test(
    'postObjectiveCreation writes via GET the objective'
    + ' and its first revision through POST /objectives',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Revenue', 'Top line', 1,
        );

        // Phase Final Task 2: row halves stripped — assert via
        // adapter GETs (pair plane).
        const objectives = await getObjectives(ctx);
        assert.equal(objectives.length, 1);
        assert.equal(objectives[0]!.id, 'o1');
        assert.equal(objectives[0]!.position, 1);
        assert.equal(objectives[0]!.organization_id, '1');
        // GET stamps lifecycle-current genesis trio.
        assert.equal(objectives[0]!.state, 'active');
        assert.equal(
            typeof objectives[0]!.state_at, 'string',
        );
        assert.equal(
            typeof objectives[0]!.state_event_id, 'string',
        );
        assert.ok(
            objectives[0]!.state_event_id.length > 0,
        );

        const revisions =
            await getObjectiveRevisionsByObjective(
                ctx, ['o1'],
            );
        const revs = revisions.get('o1')!;
        assert.equal(revs.length, 1);
        assert.equal(revs[0]!.objectiveId, 'o1');
        assert.equal(revs[0]!.name, 'Revenue');
        assert.equal(revs[0]!.description, 'Top line');
        assert.equal(revs[0]!.memberId, 'current');

        const archived = await getArchivedObjectiveIds(ctx);
        assert.equal(archived.size, 0);
        // Phase Final Stage B: objectives table retired.
    },
);

test(
    'computeNewPosition + putObjectivePosition'
    + ' wedge an item into the middle without'
    + ' renumbering anyone',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'A', 'd', 1,
        );
        await postObjectiveCreation(
            ctx, 'o2', 'B', 'd', 2,
        );
        await postObjectiveCreation(
            ctx, 'o3', 'C', 'd', 3,
        );

        const active = await getActiveObjectives(ctx);
        const others = active.filter(
            o => o.id !== 'o3',
        );
        const newPos = computeNewPosition(
            others.map(o => o.position),
            1,
        );
        const details = await getObjectiveStateDetails(ctx);
        await putObjectivePosition(
            ctx, 'o3', newPos, details.get('o3')!,
        );

        // Phase Final Task 2: positions from GET (pair plane).
        const all = await getObjectives(ctx);
        const map = new Map(
            all.map(o => [o.id, o.position]),
        );
        assert.equal(map.get('o3'), 1.5);
        assert.equal(map.get('o1'), 1);
        assert.equal(map.get('o2'), 2);
    },
);

test(
    'putObjectivePosition preserves adjacent'
    + ' fractional values across sequential'
    + ' reorders',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'A', 'd', 1,
        );
        await postObjectiveCreation(
            ctx, 'o2', 'B', 'd', 2,
        );
        await postObjectiveCreation(
            ctx, 'o3', 'C', 'd', 3,
        );

        const details = await getObjectiveStateDetails(ctx);
        await putObjectivePosition(
            ctx, 'o2', 1.5, details.get('o2')!,
        );
        await putObjectivePosition(
            ctx, 'o3', 1.25, details.get('o3')!,
        );

        // Phase Final Task 2: positions from GET (pair plane).
        const all = await getObjectives(ctx);
        const map = new Map(
            all.map(o => [o.id, o.position]),
        );
        assert.equal(map.get('o1'), 1);
        assert.equal(map.get('o3'), 1.25);
        assert.equal(map.get('o2'), 1.5);
    },
);

type RecordedCall = {
    method: string;
    path: string;
    body?: Record<string, unknown>;
};

// Recording fake RequestContext — pins the hop shape of
// get-then-put writers without spinning up a MemoryDb.
function recordingCtx(
    handlers: {
        GET?: (
            path: string,
        ) => Promise<unknown>;
        PUT?: (
            path: string,
            body: Record<string, unknown>,
        ) => Promise<unknown>;
    },
): { ctx: RequestContext; calls: RecordedCall[] } {
    const calls: RecordedCall[] = [];
    const ctx = {
        requestId: 'r1',
        identity: { id: 'current' },
        GET: async <T>(path: string): Promise<T> => {
            calls.push({ method: 'GET', path });
            if (!handlers.GET) {
                throw new Error('unexpected GET ' + path);
            }
            return handlers.GET(path) as Promise<T>;
        },
        PUT: async <T>(
            path: string,
            body: Record<string, unknown>,
        ): Promise<T> => {
            calls.push({ method: 'PUT', path, body });
            if (!handlers.PUT) {
                throw new Error('unexpected PUT ' + path);
            }
            return handlers.PUT(path, body) as Promise<T>;
        },
        POST: async () => {
            throw new Error('unexpected POST');
        },
        DELETE: async () => {
            throw new Error('unexpected DELETE');
        },
        GETWithEtag: async () => {
            throw new Error(
                'unexpected GETWithEtag',
            );
        },
    } as unknown as RequestContext;
    return { ctx, calls };
}

test(
    'postObjectiveArchival PUTs the document with an'
    + ' archived trio and the current position',
    async () => {
        const { ctx, calls } = recordingCtx({
            GET: async (path) => {
                assert.equal(path, 'objectives/o1');
                return {
                    id: 'o1',
                    organization_id: '1',
                    position: 3,
                    state: 'active',
                    state_at: '2026-01-01T00:00:00.000000Z',
                    state_event_id: 'ev-o1-prior',
                };
            },
            PUT: async () => ({}),
        });
        await postObjectiveArchival(ctx, 'o1');
        assert.equal(calls.length, 2);
        assert.equal(calls[0]!.method, 'GET');
        assert.equal(calls[0]!.path, 'objectives/o1');
        assert.equal(calls[1]!.method, 'PUT');
        assert.equal(calls[1]!.path, 'objectives/o1');
        const body = calls[1]!.body!;
        assert.equal(body['position'], 3);
        assert.equal(body['state'], 'archived');
        assert.equal(typeof body['state_at'], 'string');
        assert.match(
            body['state_at'] as string,
            /^\d{4}-\d{2}-\d{2}T/,
        );
        assert.equal(
            typeof body['state_event_id'], 'string',
        );
        assert.ok(
            (body['state_event_id'] as string).length > 0,
        );
    },
);

test(
    'putObjectivePosition echoes the supplied trio'
    + ' verbatim',
    async () => {
        const { ctx, calls } = recordingCtx({
            PUT: async () => ({}),
        });
        await putObjectivePosition(
            ctx, 'o1', 1.5, {
                state: 'active',
                stateAt: '2026-01-01T00:00:00.000000Z',
                stateEventId: 'ev-fixed',
            },
        );
        assert.equal(calls.length, 1);
        assert.equal(calls[0]!.method, 'PUT');
        assert.equal(calls[0]!.path, 'objectives/o1');
        assert.deepEqual(calls[0]!.body, {
            position: 1.5,
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-fixed',
        });
    },
);

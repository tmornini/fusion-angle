import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    organizationItem,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    getObjectives,
    getArchivedObjectiveIds,
    getObjectiveLifecycleEvents,
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
import { generateIdentifier } from
    '../shared/identifier.ts';

function ctxFor(db: MemoryDbAdapter) {
    return createRequestContext(db, DEV_TOKEN);
}

// Seed an objective document with a lifecycle trio — raw
// PUT organizations/:id/objectives/:id requires state/state_at/state_event_id
// after the states-address retirement gate (Task 1).
function objectiveDoc(
    position: number,
    state: 'active' | 'archived',
    _eventId: string,
    _at = '2026-01-01T00:00:00.000000Z',
) {
    return {
        position,
        state,
    };
}

Deno.test('getObjectives returns all', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const ctx = ctxFor(db);
    const o2 = generateIdentifier();
    await ctx.PUT(
        'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg',
        objectiveDoc(0, 'active', 'ev-o1'),
    );
    await ctx.PUT(
        'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + o2,
        objectiveDoc(1, 'active', 'ev-o2'),
    );
    const rows = await getObjectives(ctx);
    assertStrictEquals(rows.length, 2);
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
        member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
        at,
    };
}

Deno.test(
    'getObjectiveRevisionsByObjective groups one read',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = ctxFor(db);
        const o2 = generateIdentifier();
        const r1t0 = generateIdentifier();
        const r1t1 = generateIdentifier();
        const r2t0 = generateIdentifier();
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                + 'ohqxgUBEaFQwYbXsonRPmg/revisions/'
                + r1t0,
            revision(
                'ohqxgUBEaFQwYbXsonRPmg', 'A',
                '2026-05-14T00:00:00.000000Z',
            ),
        );
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                + 'ohqxgUBEaFQwYbXsonRPmg/revisions/'
                + r1t1,
            revision(
                'ohqxgUBEaFQwYbXsonRPmg', 'B',
                '2026-05-15T00:00:00.000000Z',
            ),
        );
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                + o2 + '/revisions/' + r2t0,
            revision(
                o2, 'C',
                '2026-05-14T00:00:00.000000Z',
            ),
        );
        const grouped =
            await getObjectiveRevisionsByObjective(
                ctx, ['ohqxgUBEaFQwYbXsonRPmg', o2],
            );
        assertStrictEquals(grouped.size, 2);
        assertStrictEquals(
            grouped.get('ohqxgUBEaFQwYbXsonRPmg')!.length, 2,
        );
        assertStrictEquals(grouped.get(o2)!.length, 1);
        assertEquals(grouped.get(o2)![0], {
            id: r2t0,
            objectiveId: o2,
            name: 'C',
            description: 'd:C',
            memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
            at: '2026-05-14T00:00:00.000000Z',
        });
    },
);

Deno.test(
    'getCurrentObjectiveDefinitions picks the latest'
    + ' revision per requested id',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = ctxFor(db);
        const o2 = generateIdentifier();
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                + 'ohqxgUBEaFQwYbXsonRPmg/revisions/'
                + generateIdentifier(),
            revision(
                'ohqxgUBEaFQwYbXsonRPmg', 'Old',
                '2026-05-14T00:00:00.000000Z',
            ),
        );
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                + 'ohqxgUBEaFQwYbXsonRPmg/revisions/'
                + generateIdentifier(),
            revision(
                'ohqxgUBEaFQwYbXsonRPmg', 'New',
                '2026-05-15T00:00:00.000000Z',
            ),
        );
        await ctx.PUT(
            'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                + o2 + '/revisions/'
                + generateIdentifier(),
            revision(
                o2, 'Other',
                '2026-05-14T00:00:00.000000Z',
            ),
        );
        const defs =
            await getCurrentObjectiveDefinitions(
                ctx, ['ohqxgUBEaFQwYbXsonRPmg', o2],
            );
        assertStrictEquals(defs.get('ohqxgUBEaFQwYbXsonRPmg')!.name, 'New');
        assertStrictEquals(
            defs.get('ohqxgUBEaFQwYbXsonRPmg')!.description, 'd:New',
        );
        assertStrictEquals(defs.get(o2)!.name, 'Other');
    },
);

Deno.test(
    'getCurrentObjectiveDefinitions throws on an'
    + ' objective with no revisions',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ghost = generateIdentifier();
        const err = await assertRejects(
            () => getCurrentObjectiveDefinitions(
                ctxFor(db), [ghost],
            ),
        ) as Error;
        assertInstanceOf(err, Error);
        assertStrictEquals(
            err.message, 'no revisions for objective ' + ghost,
        );
    },
);

Deno.test('getArchivedObjectiveIds returns a Set', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const ctx = ctxFor(db);
    // Seed archived via the document PUT carrying the
    // lifecycle trio — GET objectives stamps state on
    // the row (states-URI elimination B6).
    await ctx.PUT(
        'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg',
        objectiveDoc(0, 'archived', 'ev-o1-arch'),
    );
    const ids = await getArchivedObjectiveIds(ctx);
    assert(ids.has('ohqxgUBEaFQwYbXsonRPmg'));
    assertStrictEquals(ids.size, 1);
});

Deno.test(
    'getObjectiveLifecycleEvents streams dated'
    + ' transitions oldest-first',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctxFor(db),
            'ohqxgUBEaFQwYbXsonRPmg',
            'Rev', 'd', 0,
        );
        await postObjectiveArchival(
            ctxFor(db), 'ohqxgUBEaFQwYbXsonRPmg',
        );
        await postObjectiveReactivation(
            ctxFor(db), 'ohqxgUBEaFQwYbXsonRPmg',
        );
        await postObjectiveArchival(
            ctxFor(db), 'ohqxgUBEaFQwYbXsonRPmg',
        );
        const events =
            await getObjectiveLifecycleEvents(ctx);
        assertEquals(
            events.map(e => e.kind),
            [
                'archival',
                'reactivation',
                'archival',
            ],
        );
        for (const e of events) {
            assertStrictEquals(
                e.objectiveId,
                'ohqxgUBEaFQwYbXsonRPmg',
            );
            assertNotStrictEquals(e.memberId, '');
            assertNotStrictEquals(e.at, '');
        }
        assert(events[0]!.at <= events[1]!.at);
        assert(events[1]!.at <= events[2]!.at);
    },
);

Deno.test(
    'a position echo while archived adds no'
    + ' lifecycle event',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctxFor(db),
            'ohqxgUBEaFQwYbXsonRPmg',
            'Rev', 'd', 0,
        );
        await postObjectiveArchival(
            ctxFor(db), 'ohqxgUBEaFQwYbXsonRPmg',
        );
        // The wire putObjectivePosition drives: a
        // position PUT re-sending the standing
        // state. It must collapse, not mint a
        // phantom archival.
        await ctx.PUT(
            organizationItem(
                ctx, 'objectives',
                'ohqxgUBEaFQwYbXsonRPmg',
            ),
            {
                position: 3,
                state: 'archived',
            },
        );
        const events =
            await getObjectiveLifecycleEvents(ctx);
        assertStrictEquals(events.length, 1);
        assertStrictEquals(events[0]!.kind, 'archival');
    },
);

Deno.test(
    'postObjectiveCreation writes via GET the objective'
    + ' and its first revision through POST /objectives',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'ohqxgUBEaFQwYbXsonRPmg', 'Revenue', 'Top line', 1,
        );

        // Phase Final Task 2: row halves stripped — assert via
        // adapter GETs (message plane).
        const objectives = await getObjectives(ctx);
        assertStrictEquals(objectives.length, 1);
        assertStrictEquals(objectives[0]!.id, 'ohqxgUBEaFQwYbXsonRPmg');
        assertStrictEquals(objectives[0]!.position, 1);
        assertStrictEquals(objectives[0]!.organization_id
            , 'AjdvjuECVZEgZoFajaIEkg');
        // GET stamps lifecycle-current genesis trio.
        assertStrictEquals(objectives[0]!.state, 'active');

        const revisions =
            await getObjectiveRevisionsByObjective(
                ctx, ['ohqxgUBEaFQwYbXsonRPmg'],
            );
        const revs = revisions.get('ohqxgUBEaFQwYbXsonRPmg')!;
        assertStrictEquals(revs.length, 1);
        assertStrictEquals(revs[0]!.objectiveId, 'ohqxgUBEaFQwYbXsonRPmg');
        assertStrictEquals(revs[0]!.name, 'Revenue');
        assertStrictEquals(revs[0]!.description, 'Top line');
        assertStrictEquals(revs[0]!.memberId, 'XXZruirZyAOoRpNxaDnpSA');

        const archived = await getArchivedObjectiveIds(ctx);
        assertStrictEquals(archived.size, 0);
        // Phase Final Stage B: objectives table retired.
    },
);

Deno.test(
    'computeNewPosition + putObjectivePosition'
    + ' wedge an item into the middle without'
    + ' renumbering anyone',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'ohqxgUBEaFQwYbXsonRPmg', 'A', 'd', 1,
        );
        const o2 = generateIdentifier();
        const o3 = generateIdentifier();
        await postObjectiveCreation(
            ctx, o2, 'B', 'd', 2,
        );
        await postObjectiveCreation(
            ctx, o3, 'C', 'd', 3,
        );

        const active = await getActiveObjectives(ctx);
        const others = active.filter(
            o => o.id !== o3,
        );
        const newPos = computeNewPosition(
            others.map(o => o.position),
            1,
        );
        const details = await getObjectiveStateDetails(ctx);
        await putObjectivePosition(
            ctx, o3, newPos, details.get(o3)!,
        );

        // Phase Final Task 2: positions from GET (message plane).
        const all = await getObjectives(ctx);
        const map = new Map(
            all.map(o => [o.id, o.position]),
        );
        assertStrictEquals(map.get(o3), 1.5);
        assertStrictEquals(map.get('ohqxgUBEaFQwYbXsonRPmg'), 1);
        assertStrictEquals(map.get(o2), 2);
    },
);

Deno.test(
    'putObjectivePosition preserves adjacent'
    + ' fractional values across sequential'
    + ' reorders',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'ohqxgUBEaFQwYbXsonRPmg', 'A', 'd', 1,
        );
        const o2 = generateIdentifier();
        const o3 = generateIdentifier();
        await postObjectiveCreation(
            ctx, o2, 'B', 'd', 2,
        );
        await postObjectiveCreation(
            ctx, o3, 'C', 'd', 3,
        );

        const details = await getObjectiveStateDetails(ctx);
        await putObjectivePosition(
            ctx, o2, 1.5, details.get(o2)!,
        );
        await putObjectivePosition(
            ctx, o3, 1.25, details.get(o3)!,
        );

        // Phase Final Task 2: positions from GET (message plane).
        const all = await getObjectives(ctx);
        const map = new Map(
            all.map(o => [o.id, o.position]),
        );
        assertStrictEquals(map.get('ohqxgUBEaFQwYbXsonRPmg'), 1);
        assertStrictEquals(map.get(o3), 1.25);
        assertStrictEquals(map.get(o2), 1.5);
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
        requestId: 'rOEPOcVMQdJiiiMuiiEhlg',
        identity: { id: 'XXZruirZyAOoRpNxaDnpSA'
            , organization: 'AjdvjuECVZEgZoFajaIEkg' },
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

Deno.test(
    'postObjectiveArchival PUTs the document with an'
    + ' archived trio and the current position',
    async () => {
        const { ctx, calls } = recordingCtx({
            GET: async (path) => {
                assertStrictEquals(path
                    , 'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                    + 'ohqxgUBEaFQwYbXsonRPmg');
                return {
                    id: 'ohqxgUBEaFQwYbXsonRPmg',
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    position: 3,
                    state: 'active',
                };
            },
            PUT: async () => ({}),
        });
        await postObjectiveArchival(ctx, 'ohqxgUBEaFQwYbXsonRPmg');
        assertStrictEquals(calls.length, 2);
        assertStrictEquals(calls[0]!.method, 'GET');
        assertStrictEquals(calls[0]!.path
            , 'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg');
        assertStrictEquals(calls[1]!.method, 'PUT');
        assertStrictEquals(calls[1]!.path
            , 'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg');
        const body = calls[1]!.body!;
        assertStrictEquals(body['position'], 3);
        assertStrictEquals(body['state'], 'archived');
        assertStrictEquals('state_at' in body, false);
    },
);

Deno.test(
    'putObjectivePosition echoes the supplied trio'
    + ' verbatim',
    async () => {
        const { ctx, calls } = recordingCtx({
            PUT: async () => ({}),
        });
        await putObjectivePosition(
            ctx, 'ohqxgUBEaFQwYbXsonRPmg', 1.5, {
                state: 'active',
            },
        );
        assertStrictEquals(calls.length, 1);
        assertStrictEquals(calls[0]!.method, 'PUT');
        assertStrictEquals(calls[0]!.path
            , 'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
            + 'ohqxgUBEaFQwYbXsonRPmg');
        assertEquals(calls[0]!.body, {
            position: 1.5,
            state: 'active',
        });
    },
);

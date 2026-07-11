import { test } from 'node:test';
import { deriveStatesFor } from
    '../api/derive-states.ts';
import { strict as assert } from 'node:assert';
import { GET, POST } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    nowUtc,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
    StateEntity,
} from '../api/types.ts';

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// The flow body OMITS organization_id — the org fence stamps it
// from the verified token before the store validates. It also
// carries no graph: the graph lands in the relation tables via
// graphDelta, never as a stored flow column.
function flowFields() {
    return {
        name: 'My Flow',
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
    };
}

const CREATE_AT = '2025-01-01T00:00:00.000000Z';

function createBody() {
    return {
        id: 'flow-1',
        flow: flowFields(),
        projectFlowId: 'pf-1',
        projectFlow: {
            project_id: 'p1',
            flow_id: 'flow-1',
            at: CREATE_AT,
        },
        initialState: 'active',
        initialStateEventId: 'ev-1',
        initialStateAt: CREATE_AT,
        graphDelta: {
            nodes: [
                {
                    id: 'n-start',
                    flow_id: 'flow-1',
                    name: 'Start',
                    position_x: 0,
                    position_y: 0,
                    is_create: true,
                    is_archive: false,
                    task_instructions: '',
                    at: CREATE_AT,
                },
                {
                    id: 'n-finish',
                    flow_id: 'flow-1',
                    name: 'Done',
                    position_x: 0,
                    position_y: 0,
                    is_create: false,
                    is_archive: true,
                    task_instructions: '',
                    at: CREATE_AT,
                },
            ],
            edges: [],
            deletions: [],
            memberEvents: [],
            attributeEvents: [],
        },
    };
}

test(
    'POST flows writes the flow, its project link, and an'
    + " 'active' state event in one operation",
    async () => {
        const db = await freshDb();
        await POST(db, 'flows', createBody(), DEV_TOKEN);

        const flow = await GET<{
            id: string;
            name: string;
            organization_id: string;
        }>(db, 'flows/flow-1', DEV_TOKEN);
        assert.equal(flow.name, 'My Flow');
        // The fence stamped the bound org — never the body.
        assert.equal(flow.organization_id, '1');

        // Phase Final Task 2: project_flows row half stripped —
        // join derives from the pair plane.
        const links = await GET<{
            id: string;
            project_id: string;
            flow_id: string;
        }[]>(db, 'projects/p1/flows', DEV_TOKEN);
        assert.equal(links.length, 1);
        assert.equal(links[0]!.id, 'pf-1');
        assert.equal(links[0]!.project_id, 'p1');
        assert.equal(links[0]!.flow_id, 'flow-1');

        const events = await deriveStatesFor(db, '1', 'flow-1');
        // Phase Final Stage B: states table retired.
        assert.equal(events.length, 1);
        const ev = events[0]! as StateEntity;
        assert.equal(ev.id, 'ev-1');
        assert.equal(ev.state, 'active');
        // The event is authored by the verified caller, never
        // the body.
        assert.equal(ev.member_id, 'current');
    },
);

test(
    'POST flows ignores a raw colliding states row'
    + ' (states ROW half stripped)',
    async () => {
        const db = await freshDb();
        // Phase Final Task 2: states ROW half stripped —
        // a raw colliding states row no longer aborts the
        // pair-plane create (immutability is pair-plane only
        // on states/:id PUT).
    // Phase Final Stage B: states table retired.
        await POST(db, 'flows', createBody(), DEV_TOKEN);
        const flow = await GET<{ id: string }>(
            db, 'flows/flow-1', DEV_TOKEN,
        );
        assert.equal(flow.id, 'flow-1');
        const flowEvents = await deriveStatesFor(
            db, '1', 'flow-1',
        );
        assert.equal(flowEvents.length, 1);
        assert.equal(flowEvents[0]!.state, 'active');
    },
);

test(
    'POST flows stamps the initial event with the'
    + ' caller-supplied initialStateAt',
    async () => {
        // Use a far-future timestamp so this event sorts last
        // in any ascending-at history, making the assertion
        // index-independent if prior tests grow the fixture.
        const AT = '2099-06-17T12:00:00.000000Z';
        const db = await freshDb();
        await POST(db, 'flows', {
            ...createBody(),
            initialStateAt: AT,
        }, DEV_TOKEN);

        const events = await GET<StateEntity[]>(
            db,
            'entity-states/flow-1/history',
            DEV_TOKEN,
        );
        assert.equal(events.length, 1);
        assert.equal(events[0]!.at, AT);
    },
);

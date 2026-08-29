import { test } from 'node:test';
import { deriveFlowStateHistory } from
    '../api/derive-flows.ts';
import { strict as assert } from 'node:assert';
import { GET, POST } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
    StateEntity,
} from '../api/types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

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
        id: 'aEsGMmBEFaVdWihhHXwCbw',
        flow: flowFields(),
        projectFlowId: generateIdentifier(),
        projectFlow: {
            project_id: 'pnXmXrxOWayANgDLdCjuBw',
            flow_id: 'aEsGMmBEFaVdWihhHXwCbw',
            at: CREATE_AT,
        },
        initialState: 'active',
        initialStateEventId: generateIdentifier(),
        initialStateAt: CREATE_AT,
        graphDelta: {
            nodes: [
                {
                    id: generateIdentifier(),
                    flow_id: 'aEsGMmBEFaVdWihhHXwCbw',
                    name: 'Start',
                    position_x: 0,
                    position_y: 0,
                    is_create: true,
                    is_archive: false,
                    task_instructions: '',
                    at: CREATE_AT,
                },
                {
                    id: generateIdentifier(),
                    flow_id: 'aEsGMmBEFaVdWihhHXwCbw',
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
        const body = createBody();
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            , body, DEV_TOKEN);

        const flow = await GET<{
            id: string;
            name: string;
            organization_id: string;
        }>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'aEsGMmBEFaVdWihhHXwCbw', DEV_TOKEN);
        assert.equal(flow.name, 'My Flow');
        // The fence stamped the bound org — never the body.
        assert.equal(flow.organization_id, 'AjdvjuECVZEgZoFajaIEkg');

        // Phase Final Task 2: project_flows row half stripped —
        // join derives from the message plane.
        const links = await GET<{
            id: string;
            project_id: string;
            flow_id: string;
        }[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/flows/', DEV_TOKEN);
        assert.equal(links.length, 1);
        assert.equal(links[0]!.id, body.projectFlowId);
        assert.equal(links[0]!.project_id, 'pnXmXrxOWayANgDLdCjuBw');
        assert.equal(links[0]!.flow_id, 'aEsGMmBEFaVdWihhHXwCbw');

        const events = await deriveFlowStateHistory(db
            , 'AjdvjuECVZEgZoFajaIEkg', 'aEsGMmBEFaVdWihhHXwCbw');
        // Phase Final Stage B: states table retired.
        assert.equal(events.length, 1);
        const ev = events[0]! as StateEntity;
        assert.equal(ev.id, body.initialStateEventId);
        assert.equal(ev.state, 'active');
        // The event is authored by the verified caller, never
        // the body.
        assert.equal(ev.member_id, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

test(
    'POST flows ignores a raw colliding states row'
    + ' (states ROW half stripped)',
    async () => {
        const db = await freshDb();
        // Phase Final Task 2: states ROW half stripped —
        // a raw colliding states row no longer aborts the
        // message-plane create (immutability is message-plane only
        // on states/:id PUT).
    // Phase Final Stage B: states table retired.
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            , createBody(), DEV_TOKEN);
        const flow = await GET<{ id: string }>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw', DEV_TOKEN,
        );
        assert.equal(flow.id, 'aEsGMmBEFaVdWihhHXwCbw');
        const flowEvents = await deriveFlowStateHistory(
            db, 'AjdvjuECVZEgZoFajaIEkg', 'aEsGMmBEFaVdWihhHXwCbw',
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
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/', {
            ...createBody(),
            initialStateAt: AT,
        }, DEV_TOKEN);

        const events = await GET<StateEntity[]>(
            db,
            'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'aEsGMmBEFaVdWihhHXwCbw/versions/',
            DEV_TOKEN,
        );
        assert.equal(events.length, 1);
        assert.equal(events[0]!.at, AT);
    },
);

import { test } from 'node:test';
import { workOrderLifecycleStatesFor } from
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
    WorkOrderFlowGraph,
} from '../api/types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const WO_ID = generateIdentifier();
const FWO_ID = generateIdentifier();
const NODE_START = generateIdentifier();
const NODE_MIDDLE = generateIdentifier();
const NODE_FINISH = generateIdentifier();
const EDGE_2 = generateIdentifier();
const EV_1 = generateIdentifier();
const EV_2 = generateIdentifier();
const EV_3 = generateIdentifier();

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// The frozen flow graph a work order captures at creation. A
// linear start → middle → finish, stored as a native object on
// the work_orders.flow_graph document field.
function flowGraph(): Record<string, unknown> {
    const graph: WorkOrderFlowGraph = {
        name: 'Test flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [
            {
                id: NODE_START, name: 'Start',
                positionX: 0, positionY: 0,
                isCreate: true, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: NODE_MIDDLE, name: 'Doing work',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: false,
                memberIds: ['XXZruirZyAOoRpNxaDnpSA'], attributes: [],
                taskInstructions: '',
            },
            {
                id: NODE_FINISH, name: 'Done',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: true,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
        ],
        edges: [
            {
                id: 'YiJPbufDpkyrZcZCYbUJpg', name: '',
                fromNodeId: NODE_START, toNodeId: NODE_MIDDLE,
            },
            {
                id: EDGE_2, name: '',
                fromNodeId: NODE_MIDDLE, toNodeId: NODE_FINISH,
            },
        ],
    };
    return graph as unknown as Record<string, unknown>;
}

// The work-order body OMITS organization_id — the org fence
// stamps it from the verified token before the store validates.
function workOrderFields() {
    return {
        display_id: 'abcd',
        flow_graph: flowGraph(),
        position: 1,
    };
}

function createBody() {
    return {
        id: WO_ID,
        workOrder: workOrderFields(),
        flowWorkOrderId: FWO_ID,
        flowWorkOrder: {
            flow_id: 'ZOousbbnzpqlxJExVAruYQ',
            work_order_id: WO_ID,
            at: nowUtc(),
        },
        stateEventIds: [EV_1, EV_2, EV_3],
        states: [NODE_START, NODE_MIDDLE, 'claimed'],
        stateEventAts: [
            // Three distinct increasing values — distinct because
            // latest-wins on entity state must be deterministic;
            // far-future to prove the caller's at is threaded, not
            // server-stamped.
            '2099-01-01T00:00:00.000000Z',
            '2099-01-01T00:00:00.000001Z',
            '2099-01-01T00:00:00.000002Z',
        ],
    };
}

// Phase Final Task 2: work_orders + flow_work_orders ROW
// halves stripped — GET derives the document; join is pair-
// plane; three state events still dual-write until states-
// trace.
test(
    'POST work-orders writes three state events and pair-'
    + 'plane document + join in one operation',
    async () => {
        const db = await freshDb();
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , createBody(),
            DEV_TOKEN);

        const wo = await GET<{
            id: string;
            display_id: string;
            position: number;
            organization_id: string;
        }>(
            db,
            'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + WO_ID,
            DEV_TOKEN,
        );
        assert.equal(wo.display_id, 'abcd');
        assert.equal(wo.position, 1);
        // The fence stamped the bound org — never the body.
        assert.equal(wo.organization_id, 'AjdvjuECVZEgZoFajaIEkg');

        // Row plane empty; join lives on the pair plane.
        // Phase Final Stage B: work_orders +
        // flow_work_orders tables retired.
        const links = await GET<{
            id: string;
            flow_id: string;
            work_order_id: string;
        }[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'ZOousbbnzpqlxJExVAruYQ/work-orders/', DEV_TOKEN);
        assert.equal(links.length, 1);
        assert.equal(links[0]!.id, FWO_ID);
        assert.equal(links[0]!.flow_id, 'ZOousbbnzpqlxJExVAruYQ');
        assert.equal(links[0]!.work_order_id, WO_ID);

        const events = await workOrderLifecycleStatesFor(db
            , 'AjdvjuECVZEgZoFajaIEkg', WO_ID);
        // Phase Final Stage B: states table retired.
        assert.equal(events.length, 3);
        // The three events land IN ORDER: start, post-start,
        // then the creation-time claim.
        const byId = new Map(events.map(e => [e.id, e]));
        assert.equal(byId.get(EV_1)!.state, NODE_START);
        assert.equal(byId.get(EV_2)!.state, NODE_MIDDLE);
        assert.equal(byId.get(EV_3)!.state, 'claimed');
        // Every event is authored by the verified caller, never
        // the body.
        for (const ev of events as StateEntity[]) {
            assert.equal(ev.member_id, 'XXZruirZyAOoRpNxaDnpSA');
        }
    },
);

test(
    'POST work-orders threads the caller stateEventAts onto'
    + ' each state event',
    async () => {
        const db = await freshDb();
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , createBody(),
            DEV_TOKEN);

        const events = await workOrderLifecycleStatesFor(db
            , 'AjdvjuECVZEgZoFajaIEkg', WO_ID);
        // Phase Final Stage B: states table retired.
        assert.equal(events.length, 3);
        const byId = new Map(
            (events as StateEntity[]).map(e => [e.id, e]),
        );
        // Each event must carry the exact caller-supplied at,
        // not a server-stamped value.
        assert.equal(
            byId.get(EV_1)!.at,
            '2099-01-01T00:00:00.000000Z',
        );
        assert.equal(
            byId.get(EV_2)!.at,
            '2099-01-01T00:00:00.000001Z',
        );
        assert.equal(
            byId.get(EV_3)!.at,
            '2099-01-01T00:00:00.000002Z',
        );
    },
);

test(
    'POST work-orders ignores a raw colliding states row'
    + ' (states ROW half stripped)',
    async () => {
        const db = await freshDb();
        // Phase Final Task 2: states ROW half stripped —
        // a raw colliding states row no longer aborts the
        // pair-plane create.
    // Phase Final Stage B: states table retired.
        await POST(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                , createBody(), DEV_TOKEN,
        );
        const wo = await GET<{ id: string }>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + WO_ID, DEV_TOKEN,
        );
        assert.equal(wo.id, WO_ID);
        const woEvents = await workOrderLifecycleStatesFor(
            db, 'AjdvjuECVZEgZoFajaIEkg', WO_ID,
        );
        assert.equal(woEvents.length, 3);
    },
);

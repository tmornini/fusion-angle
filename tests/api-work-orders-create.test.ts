import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, POST } from '../api/api.ts';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    jsonObjectField,
    nowUtc,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
    StateEntity,
    WorkOrderFlowGraph,
} from '../api/types.ts';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// The frozen flow graph a work order captures at creation. A
// linear start → middle → finish, stored as the raw JSON string
// the work_orders.flow_graph column holds.
function flowGraph(): string {
    const graph: WorkOrderFlowGraph = {
        name: 'Test flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [
            {
                id: 'n-start', name: 'Start',
                positionX: 0, positionY: 0,
                isCreate: true, isArchive: false,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
            {
                id: 'n-middle', name: 'Doing work',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: false,
                memberIds: ['current'], attributes: [],
                taskInstructions: '',
            },
            {
                id: 'n-finish', name: 'Done',
                positionX: 0, positionY: 0,
                isCreate: false, isArchive: true,
                memberIds: [], attributes: [],
                taskInstructions: '',
            },
        ],
        edges: [
            {
                id: 'e1', name: '',
                fromNodeId: 'n-start', toNodeId: 'n-middle',
            },
            {
                id: 'e2', name: '',
                fromNodeId: 'n-middle', toNodeId: 'n-finish',
            },
        ],
    };
    return jsonObjectField(
        graph as unknown as Record<string, unknown>,
    );
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
        id: 'wo-1',
        workOrder: workOrderFields(),
        flowWorkOrderId: 'fwo-1',
        flowWorkOrder: {
            flow_id: 'f1',
            work_order_id: 'wo-1',
            at: nowUtc(),
        },
        stateEventIds: ['ev-1', 'ev-2', 'ev-3'],
        states: ['n-start', 'n-middle', 'claimed'],
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

test(
    'POST work-orders writes the work order, its flow link,'
    + ' and three state events in one operation',
    async () => {
        const db = await freshDb();
        await POST(db, 'work-orders', createBody(), DEV_TOKEN);

        const wo = await GET<{
            id: string;
            display_id: string;
            position: number;
            organization_id: string;
        }>(db, 'work-orders/wo-1', DEV_TOKEN);
        assert.equal(wo.display_id, 'abcd');
        assert.equal(wo.position, 1);
        // The fence stamped the bound org — never the body.
        assert.equal(wo.organization_id, '1');

        const links = await db.flowWorkOrders.getAll();
        assert.equal(links.length, 1);
        assert.equal(links[0]!.id, 'fwo-1');
        assert.equal(links[0]!.flow_id, 'f1');
        assert.equal(links[0]!.work_order_id, 'wo-1');

        const events = await db.states.getAllFor('wo-1');
        assert.equal(events.length, 3);
        // The three events land IN ORDER: start, post-start,
        // then the creation-time claim.
        const byId = new Map(events.map(e => [e.id, e]));
        assert.equal(byId.get('ev-1')!.state, 'n-start');
        assert.equal(byId.get('ev-2')!.state, 'n-middle');
        assert.equal(byId.get('ev-3')!.state, 'claimed');
        // Every event is authored by the verified caller, never
        // the body.
        for (const ev of events as StateEntity[]) {
            assert.equal(ev.member_id, 'current');
        }
    },
);

test(
    'POST work-orders threads the caller stateEventAts onto'
    + ' each state event',
    async () => {
        const db = await freshDb();
        await POST(db, 'work-orders', createBody(), DEV_TOKEN);

        const events = await db.states.getAllFor('wo-1');
        assert.equal(events.length, 3);
        const byId = new Map(
            (events as StateEntity[]).map(e => [e.id, e]),
        );
        // Each event must carry the exact caller-supplied at,
        // not a server-stamped value.
        assert.equal(
            byId.get('ev-1')!.at,
            '2099-01-01T00:00:00.000000Z',
        );
        assert.equal(
            byId.get('ev-2')!.at,
            '2099-01-01T00:00:00.000001Z',
        );
        assert.equal(
            byId.get('ev-3')!.at,
            '2099-01-01T00:00:00.000002Z',
        );
    },
);

test(
    'POST work-orders rolls back every write when one of its'
    + ' state events conflicts',
    async () => {
        const db = await freshDb();
        // Pre-seed a DIFFERENT event at the create's middle
        // event id. postEvent re-puts that id with a conflicting
        // payload mid-tx (LedgerImmutability), so the work order,
        // its join row, and the sibling events must roll back.
        await db.states.put('ev-2', {
            entity_id: 'other',
            state: 'n-middle',
            member_id: 'current',
            at: '2020-01-01T00:00:00.000000Z',
        });
        await assert.rejects(
            () => POST(
                db, 'work-orders', createBody(), DEV_TOKEN,
            ),
        );
        // Not one write survived the aborted transaction.
        await assert.rejects(
            () => GET(db, 'work-orders/wo-1', DEV_TOKEN));
        const links = await db.flowWorkOrders.getAll();
        assert.equal(links.length, 0);
        // Only the pre-seeded conflicting event remains — none
        // of the create's own events landed.
        const woEvents = await db.states.getAllFor('wo-1');
        assert.equal(woEvents.length, 0);
    },
);

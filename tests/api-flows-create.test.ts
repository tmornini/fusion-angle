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
    storedGraphField,
    nowUtc,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import type {
    StateEntity,
    StoredGraph,
} from '../api/types.ts';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// A minimal two-node flow graph, stored as the raw JSON string
// the flows.graph column holds.
function flowGraph(): string {
    const graph: StoredGraph = {
        nodes: [
            {
                id: 'n-start', name: 'Start',
                positionX: 0, positionY: 0,
                isCreate: true, isArchive: false,
                memberIds: [], attributes: [],
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
        edges: [],
    };
    return storedGraphField(graph);
}

// The flow body OMITS organization_id — the org fence stamps it
// from the verified token before the store validates.
function flowFields() {
    return {
        name: 'My Flow',
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        graph: flowGraph(),
    };
}

function createBody() {
    return {
        id: 'flow-1',
        flow: flowFields(),
        projectFlowId: 'pf-1',
        projectFlow: {
            project_id: 'p1',
            flow_id: 'flow-1',
            at: nowUtc(),
        },
        initialState: 'active',
        initialStateEventId: 'ev-1',
        initialStateAt: '2025-01-01T00:00:00.000000Z',
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

        const links = await db.projectFlows.getAll();
        assert.equal(links.length, 1);
        assert.equal(links[0]!.id, 'pf-1');
        assert.equal(links[0]!.project_id, 'p1');
        assert.equal(links[0]!.flow_id, 'flow-1');

        const events = await db.states.getAllFor('flow-1');
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
    'POST flows rolls back every write when its state event'
    + ' conflicts',
    async () => {
        const db = await freshDb();
        // Pre-seed a DIFFERENT event at the create's event id.
        // postEvent re-puts that id with a conflicting payload
        // mid-tx (LedgerImmutability), so the flow and its join
        // row must roll back.
        await db.states.put('ev-1', {
            entity_id: 'other',
            state: 'active',
            member_id: 'current',
            at: '2020-01-01T00:00:00.000000Z',
        });
        await assert.rejects(
            () => POST(db, 'flows', createBody(), DEV_TOKEN),
        );
        // Not one write survived the aborted transaction.
        await assert.rejects(
            () => GET(db, 'flows/flow-1', DEV_TOKEN));
        const links = await db.projectFlows.getAll();
        assert.equal(links.length, 0);
        // Only the pre-seeded conflicting event remains — the
        // create's own event never landed.
        const flowEvents = await db.states.getAllFor('flow-1');
        assert.equal(flowEvents.length, 0);
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

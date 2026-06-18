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
    FlowVersionEntity,
    StoredGraph,
} from '../api/types.ts';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// A minimal two-node flow graph, stored as the raw JSON string
// the graph column holds.
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

// Seed a flow owned by org '1' directly below the gate — the
// version rows' parent, so they resolve to the bound org.
async function seedFlow(
    db: MemoryDbAdapter,
    flowId: string,
): Promise<void> {
    await db.flows.put(flowId, {
        organization_id: '1',
        name: 'My Flow',
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
    });
}

// Seed a flow_versions row directly below the gate.
async function seedVersion(
    db: MemoryDbAdapter,
    id: string,
    flowId: string,
    at: string,
): Promise<void> {
    await db.flowVersions.put(id, {
        flow_id: flowId,
        name: 'My Flow',
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        graph: flowGraph(),
        at,
    });
}

// A well-formed version snapshot body for POST
// /flows/:id/versions.
function versionBody(flowId: string) {
    return {
        flow_id: flowId,
        name: 'My Flow',
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        graph: flowGraph(),
        at: nowUtc(),
    };
}

test(
    'POST flows/:id/versions writes the new snapshot and'
    + ' trims the named over-cap versions in one operation',
    async () => {
        const db = await freshDb();
        await seedFlow(db, 'flow-1');
        await seedVersion(
            db, 'old-1', 'flow-1',
            '2020-01-01T00:00:00.000000Z',
        );
        await seedVersion(
            db, 'old-2', 'flow-1',
            '2020-01-02T00:00:00.000000Z',
        );
        await seedVersion(
            db, 'keep-1', 'flow-1',
            '2020-01-03T00:00:00.000000Z',
        );

        await POST(
            db, 'flows/flow-1/versions',
            {
                id: 'new-1',
                version: versionBody('flow-1'),
                trimIds: ['old-1', 'old-2'],
            },
            DEV_TOKEN,
        );

        // The new snapshot row exists.
        const fresh = await GET<FlowVersionEntity>(
            db, 'flows/flow-1/versions/new-1', DEV_TOKEN,
        );
        assert.equal(fresh.id, 'new-1');
        assert.equal(fresh.flow_id, 'flow-1');

        // The named over-cap rows are gone; the unnamed one
        // survives.
        const ids = (await db.flowVersions.getAll())
            .map(r => r.id)
            .sort();
        assert.deepEqual(ids, ['keep-1', 'new-1']);
    },
);

test(
    'POST flows/:id/versions rolls back BOTH the put and the'
    + ' deletes when the snapshot put fails mid-transaction',
    async () => {
        const db = await freshDb();
        await seedFlow(db, 'flow-1');
        await seedVersion(
            db, 'old-1', 'flow-1',
            '2020-01-01T00:00:00.000000Z',
        );
        await seedVersion(
            db, 'old-2', 'flow-1',
            '2020-01-02T00:00:00.000000Z',
        );

        // The snapshot body carries an unparseable graph. The
        // gate's publish validator passes it (it only shapes
        // version as an object); the flow_versions store rejects
        // it through validateFlowVersionEntity as the put lands,
        // throwing inside the open transaction so the whole
        // operation — the snapshot put AND the named trims —
        // aborts as one unit, leaving the prior rows intact.
        const bad = versionBody('flow-1');
        (bad as Record<string, unknown>).graph = 'not json';
        await assert.rejects(
            () => POST(
                db, 'flows/flow-1/versions',
                {
                    id: 'new-1',
                    version: bad,
                    trimIds: ['old-1', 'old-2'],
                },
                DEV_TOKEN,
            ),
        );

        // The snapshot never landed.
        await assert.rejects(
            () => GET(
                db, 'flows/flow-1/versions/new-1', DEV_TOKEN,
            ),
        );
        // The named trim targets both survive — the deletes
        // rolled back with the put.
        const ids = (await db.flowVersions.getAll())
            .map(r => r.id)
            .sort();
        assert.deepEqual(ids, ['old-1', 'old-2']);
    },
);

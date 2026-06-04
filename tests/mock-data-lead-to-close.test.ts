import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    populateMockData,
} from '../api/mock-data.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    getFlowStats,
} from '../web-app/app/adapters/flow-stats.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';

const FLOW_NAME = 'Lead-to-Close';
const EXPECTED_NODE_COUNT = 7;
const EXPECTED_EDGE_COUNT = 9;
const WO_COUNT_MIN = 95;
const WO_COUNT_MAX = 105;
const HOT_NODE_NAME = 'Qualification';
const HOT_NODE_HEAT_MIN = 0.75;
const COLD_WORKING_NODE_HEAT_MAX = 0.25;

async function seededLeadToClose() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedRootAdmin(db);
    await populateMockData(db);
    const flows = await db.flows.getAll();
    const flow = flows.find(
        f => f.name === FLOW_NAME,
    );
    assert.ok(
        flow,
        `flow "${FLOW_NAME}" not seeded`,
    );
    const ctx = createRequestContext(db, devToken());
    return await getFlowStats(ctx, flow!.id);
}

test(
    'Lead-to-Close graph has 7 nodes, 9 edges,'
    + ' one isCreate, one isArchive',
    async () => {
        const { graph } = await seededLeadToClose();
        assert.equal(
            graph.nodes.length,
            EXPECTED_NODE_COUNT,
        );
        assert.equal(
            graph.edges.length,
            EXPECTED_EDGE_COUNT,
        );
        const createCount = graph.nodes
            .filter(n => n.isCreate).length;
        const archiveCount = graph.nodes
            .filter(n => n.isArchive).length;
        assert.equal(
            createCount, 1,
            'exactly one isCreate node',
        );
        assert.equal(
            archiveCount, 1,
            'exactly one isArchive node',
        );
    },
);

test(
    'Lead-to-Close work-order count lies in'
    + ` [${WO_COUNT_MIN}, ${WO_COUNT_MAX}]`,
    async () => {
        const { model } = await seededLeadToClose();
        const total =
            model.completedWorkOrderCount
            + model.incompleteWorkOrderCount;
        assert.ok(
            total >= WO_COUNT_MIN
            && total <= WO_COUNT_MAX,
            `WO count ${total} outside`
            + ` [${WO_COUNT_MIN}, ${WO_COUNT_MAX}]`,
        );
    },
);

test(
    'Lead-to-Close Qualification node is the'
    + ' single red node; every other working node'
    + ' stays cool',
    async () => {
        const { model } = await seededLeadToClose();
        const hot = model.nodes.find(
            n => n.displayName === HOT_NODE_NAME,
        );
        assert.ok(
            hot !== undefined,
            `${HOT_NODE_NAME} node must be present`,
        );
        assert.ok(
            hot!.heatT >= HOT_NODE_HEAT_MIN,
            `${HOT_NODE_NAME} heatT ${hot!.heatT}`
            + ` < ${HOT_NODE_HEAT_MIN}`,
        );
        for (const n of model.nodes) {
            if (n.isCreate || n.isArchive) continue;
            if (n.displayName === HOT_NODE_NAME) {
                continue;
            }
            assert.ok(
                n.heatT
                <= COLD_WORKING_NODE_HEAT_MAX,
                `${n.displayName} heatT`
                + ` ${n.heatT} >`
                + ` ${COLD_WORKING_NODE_HEAT_MAX}`,
            );
        }
    },
);

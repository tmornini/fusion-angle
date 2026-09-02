import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    getFlowStats,
} from '../web-app/app/adapters/flow-stats.ts';
import { now } from '../api/mock-data/seed-kit.ts';
import { deriveFlows } from '../api/derive-flows.ts';
import { asStoredGraph } from '../api/validators.ts';
import { buildAiMembers } from '../api/mock-data/ai-members.ts';
import { buildFlows } from '../api/mock-data/flows.ts';
import {
    buildLeadToCloseNodes,
    l2cTriageNodeId,
    memberLisa,
    memberClaude,
    buildLeadToCloseWorkload,
} from '../api/mock-data/lead-to-close-flow.ts';
import { seededMockDb } from './mock-seed.ts';

const FLOW_NAME = 'Lead-to-Close';
const EXPECTED_NODE_COUNT = 7;
const EXPECTED_EDGE_COUNT = 9;
const WO_COUNT_MIN = 95;
const WO_COUNT_MAX = 105;
const HOT_NODE_NAME = 'Qualification';
const HOT_NODE_HEAT_MIN = 0.75;
const COLD_WORKING_NODE_HEAT_MAX = 0.25;

async function seededLeadToClose() {
    const db = await seededMockDb();
    // Phase Final Task 2: flows row half stripped — resolve
    // the seed flow from the message plane.
    const flows = await deriveFlows(db, 'AjdvjuECVZEgZoFajaIEkg');
    const flow = flows.find(
        f => f.name === FLOW_NAME,
    );
    assert(
        flow,
        `flow "${FLOW_NAME}" not seeded`,
    );
    const ctx = createRequestContext(db, await organizationToken());
    return await getFlowStats(ctx, flow!.id, now.getTime());
}

Deno.test(
    'L2C triage names Lisa in memberIds and'
    + ' Claude in agentIds',
    () => {
        const triage = buildLeadToCloseNodes().find(
            (node) => node.id === l2cTriageNodeId,
        );
        assert(triage, 'Inbound Triage node');
        assertEquals(
            triage.memberIds, [memberLisa],
        );
        assertEquals(
            triage.agentIds, [memberClaude],
        );
    },
);

Deno.test(
    'no seed graph memberIds names an AI member',
    () => {
        const aiIds = new Set(
            buildAiMembers().map((row) => row.id),
        );
        for (const flow of buildFlows()) {
            const graph = asStoredGraph(
                flow.graph, 'seed flow ' + flow.id,
            );
            for (const node of graph.nodes) {
                for (const id of node.memberIds) {
                    assertStrictEquals(
                        aiIds.has(id),
                        false,
                        flow.id + ' node ' + node.id
                            + ' memberIds names AI '
                            + id,
                    );
                }
            }
        }
    },
);

Deno.test(
    'Lead-to-Close graph has 7 nodes, 9 edges,'
    + ' one isCreate, one isArchive',
    async () => {
        const { graph } = await seededLeadToClose();
        assertStrictEquals(
            graph.nodes.length,
            EXPECTED_NODE_COUNT,
        );
        assertStrictEquals(
            graph.edges.length,
            EXPECTED_EDGE_COUNT,
        );
        const createCount = graph.nodes
            .filter(n => n.isCreate).length;
        const archiveCount = graph.nodes
            .filter(n => n.isArchive).length;
        assertStrictEquals(
            createCount, 1,
            'exactly one isCreate node',
        );
        assertStrictEquals(
            archiveCount, 1,
            'exactly one isArchive node',
        );
    },
);

Deno.test(
    'Lead-to-Close work-order count lies in'
    + ` [${WO_COUNT_MIN}, ${WO_COUNT_MAX}]`,
    async () => {
        const { model } = await seededLeadToClose();
        const total =
            model.completedWorkOrderCount
            + model.incompleteWorkOrderCount;
        assert(
            total >= WO_COUNT_MIN
            && total <= WO_COUNT_MAX,
            `WO count ${total} outside`
            + ` [${WO_COUNT_MIN}, ${WO_COUNT_MAX}]`,
        );
    },
);

Deno.test(
    'Lead-to-Close Qualification node is the'
    + ' single red node; every other working node'
    + ' stays cool',
    async () => {
        const { model } = await seededLeadToClose();
        const hot = model.nodes.find(
            n => n.displayName === HOT_NODE_NAME,
        );
        assert(
            hot !== undefined,
            `${HOT_NODE_NAME} node must be present`,
        );
        assert(
            hot!.heatT >= HOT_NODE_HEAT_MIN,
            `${HOT_NODE_NAME} heatT ${hot!.heatT}`
            + ` < ${HOT_NODE_HEAT_MIN}`,
        );
        for (const n of model.nodes) {
            if (n.isCreate || n.isArchive) continue;
            if (n.displayName === HOT_NODE_NAME) {
                continue;
            }
            assert(
                n.heatT
                <= COLD_WORKING_NODE_HEAT_MAX,
                `${n.displayName} heatT`
                + ` ${n.heatT} >`
                + ` ${COLD_WORKING_NODE_HEAT_MAX}`,
            );
        }
    },
);

Deno.test('generated state events are strictly ascending', () => {
    const generated = buildLeadToCloseWorkload();
    const atsByWorkOrder = new Map<string, string[]>();
    for (const event of generated.stateEvents) {
        const ats =
            atsByWorkOrder.get(event.entity_id) ?? [];
        ats.push(event.at);
        atsByWorkOrder.set(event.entity_id, ats);
    }
    assert(atsByWorkOrder.size >= WO_COUNT_MIN);
    for (const [id, ats] of atsByWorkOrder) {
        for (let i = 1; i < ats.length; i++) {
            assert(
                ats[i]! > ats[i - 1]!,
                id + ' step ' + i + ': ' + ats[i - 1]
                    + ' then ' + ats[i],
            );
        }
    }
});

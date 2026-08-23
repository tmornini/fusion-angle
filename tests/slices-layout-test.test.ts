import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import {
    postTestPlanSlices, sliceEntityId,
} from '../api/test-plan-slices.ts';
import { testHashPassword } from
    './mock-seed.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { claimToken } from
    './token-fixtures.ts';
import {
    getFlowsWithProjectNames,
    getFlowGraph,
} from '../web-app/app/adapters/flow-queries.ts';
import { findCycleEdgeIds } from
    '../web-app/app/flow-cycle-edges.ts';

test('F slice lists Layout Test with one cycle edge',
async () => {
    const db = memoryDbAdapter();
    await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    const organization = sliceEntityId('f-org');
    const ctx = createRequestContext(
        db,
        await claimToken({
            sub: sliceEntityId('f-admin'),
            organization,
            organizations: [organization],
            roles: ['admin:' + organization],
        }),
    );
    const flows = await getFlowsWithProjectNames(
        ctx,
    );
    assert.equal(flows.length, 2);
    const layout = flows.find((row) =>
        row.summary.name
            === 'Layout Test: Proposal Review Cycle');
    assert.ok(layout);
    assert.equal(layout.summary.nodeCount, 17);
    assert.equal(layout.summary.edgeCount, 23);
    const graph = await getFlowGraph(
        ctx, layout.summary.id,
    );
    assert.deepEqual(
        findCycleEdgeIds(graph.nodes, graph.edges),
        new Set(['txieWmAdbSTRDAZIghdvag']),
    );
});

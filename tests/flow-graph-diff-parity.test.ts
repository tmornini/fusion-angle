import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    buildSaveEvents,
    buildRevivals,
} from '../web-app/app/adapters/flow-mutations.ts';
import {
    buildFlowGraphDelta,
    buildFlowGraphRevivals,
} from '../api/flow-graph-diff.ts';
import type {
    StoredGraph,
    GraphNode,
    GraphEdge,
} from '../api/types.ts';

// Cross-consistency pin: api/flow-graph-diff.ts is the
// sanctioned server twin of buildSaveEvents/buildRevivals
// (api/ cannot import web-app/; shared/ cannot import api/
// validators). Two pure instances below rule-of-three; this
// test is the drift detector that keeps them byte-identical
// in semantics. Zero test files imported the server twin
// before this pin (roadmap R3).

const AT = '2026-01-01T00:00:00.000000Z';
const FLOW_ID = 'biSFoHVEGnaArklDDblCXQ';

function makeMint(): () => string {
    let n = 0;
    return () => 'e' + String(n++);
}

function baseNode(
    id: string,
    overrides?: Partial<GraphNode>,
): GraphNode {
    return {
        id,
        name: id,
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds: [],
        attributes: [],
        taskInstructions: '',
        ...overrides,
    };
}

function baseEdge(
    id: string,
    from: string,
    to: string,
    overrides?: Partial<GraphEdge>,
): GraphEdge {
    return {
        id,
        name: id,
        fromNodeId: from,
        toNodeId: to,
        ...overrides,
    };
}

const EMPTY: StoredGraph = { nodes: [], edges: [] };

Deno.test('buildFlowGraphDelta matches buildSaveEvents'
+ ' on add/move/delete/member/attribute', () => {
    const baseline: StoredGraph = {
        nodes: [
            baseNode('n1', {
                positionX: 0,
                memberIds: ['m-keep', 'm-drop'],
                attributes: [
                    {
                        attributeId: 'a-keep',
                        mode: 'readonly',
                        isRequired: false,
                    },
                    {
                        attributeId: 'a-drop',
                        mode: 'editable',
                        isRequired: true,
                    },
                    {
                        attributeId: 'a-change',
                        mode: 'readonly',
                        isRequired: false,
                    },
                ],
            }),
            baseNode('n-gone'),
        ],
        edges: [
            baseEdge('YiJPbufDpkyrZcZCYbUJpg', 'n1', 'n-gone'),
            baseEdge('e-gone', 'n-gone', 'n1'),
        ],
    };
    const working: StoredGraph = {
        nodes: [
            baseNode('n1', {
                positionX: 42,
                memberIds: ['m-keep', 'm-add'],
                attributes: [
                    {
                        attributeId: 'a-keep',
                        mode: 'readonly',
                        isRequired: false,
                    },
                    {
                        attributeId: 'a-change',
                        mode: 'editable',
                        isRequired: true,
                    },
                    {
                        attributeId: 'a-new',
                        mode: 'readonly',
                        isRequired: false,
                    },
                ],
            }),
            baseNode('n-new', { isCreate: true }),
        ],
        edges: [
            baseEdge('YiJPbufDpkyrZcZCYbUJpg', 'n1', 'n-new'),
            baseEdge('e-new', 'n1', 'n-new'),
        ],
    };

    const client = buildSaveEvents(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    const server = buildFlowGraphDelta(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    assertEquals(server, client);
});

Deno.test('buildFlowGraphRevivals matches buildRevivals'
+ ' entity order and at (eventIds mint-shaped)', () => {
    const current: StoredGraph = {
        nodes: [baseNode('n-live')],
        edges: [baseEdge('e-live', 'n-live', 'n-live')],
    };
    const target: StoredGraph = {
        nodes: [
            baseNode('n-live'),
            baseNode('n-revived'),
        ],
        edges: [
            baseEdge('e-live', 'n-live', 'n-live'),
            baseEdge(
                'e-revived', 'n-live', 'n-revived',
            ),
        ],
    };

    // Client buildRevivals mints via generateIdentifier
    // internally; server twin takes mint. Compare the
    // structural payload (entityId + at), not eventId bytes.
    const client = buildRevivals(current, target, AT);
    const server = buildFlowGraphRevivals(
        current, target, makeMint(), AT,
    );
    assertStrictEquals(server.length, client.length);
    assertEquals(
        server.map(r => ({
            entityId: r.entityId, at: r.at,
        })),
        client.map(r => ({
            entityId: r.entityId, at: r.at,
        })),
    );
});

Deno.test('empty-to-empty twin deltas are identical', () => {
    const client = buildSaveEvents(
        EMPTY, EMPTY, FLOW_ID, makeMint(), AT,
    );
    const server = buildFlowGraphDelta(
        EMPTY, EMPTY, FLOW_ID, makeMint(), AT,
    );
    assertEquals(server, client);
    assertEquals(client, {
        nodes: [],
        edges: [],
        deletions: [],
        memberEvents: [],
        attributeEvents: [],
    });
});

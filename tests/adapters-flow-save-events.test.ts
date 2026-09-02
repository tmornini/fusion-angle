import { assertStrictEquals } from '@std/assert';
import {
    buildSaveEvents,
} from '../web-app/app/adapters/flow-mutations.ts';
import type {
    StoredGraph,
    GraphNode,
    NodeAttribute,
} from '../api/types.ts';

const AT = '2026-01-01T00:00:00.000000Z';
const FLOW_ID = 'aEsGMmBEFaVdWihhHXwCbw';

// Counter-based mint stub for determinism
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

const EMPTY: StoredGraph = { nodes: [], edges: [] };

// ── node upserts ──────────────

Deno.test('add a node emits one upsert, no deletions', () => {
    const working: StoredGraph = {
        nodes: [baseNode('n1')],
        edges: [],
    };
    const delta = buildSaveEvents(
        EMPTY, working, FLOW_ID, makeMint(), AT,
    );
    assertStrictEquals(delta.nodes.length, 1);
    assertStrictEquals(delta.nodes[0]!.id, 'n1');
    assertStrictEquals(delta.nodes[0]!.flow_id, FLOW_ID);
    assertStrictEquals(delta.nodes[0]!.at, AT);
    assertStrictEquals(delta.deletions.length, 0);
    assertStrictEquals(delta.edges.length, 0);
    assertStrictEquals(delta.memberEvents.length, 0);
    assertStrictEquals(delta.attributeEvents.length, 0);
});

Deno.test('move a node emits one upsert with new position', () => {
    const baseline: StoredGraph = {
        nodes: [baseNode('n1', { positionX: 0 })],
        edges: [],
    };
    const working: StoredGraph = {
        nodes: [baseNode('n1', { positionX: 99 })],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    assertStrictEquals(delta.nodes.length, 1);
    assertStrictEquals(delta.nodes[0]!.position_x, 99);
    assertStrictEquals(delta.deletions.length, 0);
    assertStrictEquals(delta.memberEvents.length, 0);
    assertStrictEquals(delta.attributeEvents.length, 0);
});

Deno.test('remove a node emits a deletion', () => {
    const baseline: StoredGraph = {
        nodes: [baseNode('n1')],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, EMPTY, FLOW_ID, makeMint(), AT,
    );
    assertStrictEquals(delta.nodes.length, 0);
    assertStrictEquals(delta.deletions.length, 1);
    assertStrictEquals(delta.deletions[0]!.entityId, 'n1');
    assertStrictEquals(delta.deletions[0]!.at, AT);
});

// ── edge upserts ──────────────

Deno.test('add an edge emits one upsert', () => {
    const working: StoredGraph = {
        nodes: [baseNode('n1'), baseNode('n2')],
        edges: [
            {
                id: 'YiJPbufDpkyrZcZCYbUJpg',
                name: 'next',
                fromNodeId: 'n1',
                toNodeId: 'n2',
            },
        ],
    };
    const delta = buildSaveEvents(
        EMPTY, working, FLOW_ID, makeMint(), AT,
    );
    assertStrictEquals(delta.edges.length, 1);
    assertStrictEquals(delta.edges[0]!.id, 'YiJPbufDpkyrZcZCYbUJpg');
    assertStrictEquals(delta.edges[0]!.from_node_id, 'n1');
    assertStrictEquals(delta.edges[0]!.to_node_id, 'n2');
    assertStrictEquals(delta.edges[0]!.flow_id, FLOW_ID);
    assertStrictEquals(delta.edges[0]!.at, AT);
});

Deno.test('remove an edge emits a deletion', () => {
    const baseline: StoredGraph = {
        nodes: [baseNode('n1'), baseNode('n2')],
        edges: [
            {
                id: 'YiJPbufDpkyrZcZCYbUJpg',
                name: 'next',
                fromNodeId: 'n1',
                toNodeId: 'n2',
            },
        ],
    };
    const working: StoredGraph = {
        nodes: [baseNode('n1'), baseNode('n2')],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    assertStrictEquals(delta.deletions.length, 1);
    assertStrictEquals(
        delta.deletions[0]!.entityId, 'YiJPbufDpkyrZcZCYbUJpg',
    );
});

// ── member events ─────────────

Deno.test('add a member emits one added event', () => {
    const baseline: StoredGraph = {
        nodes: [baseNode('n1')],
        edges: [],
    };
    const working: StoredGraph = {
        nodes: [baseNode('n1', { memberIds: ['mFNSxZqywTSMXhgUTdTqtA'] })],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    assertStrictEquals(delta.memberEvents.length, 1);
    assertStrictEquals(
        delta.memberEvents[0]!.flow_node_id, 'n1',
    );
    assertStrictEquals(
        delta.memberEvents[0]!.member_id, 'mFNSxZqywTSMXhgUTdTqtA',
    );
    assertStrictEquals(
        delta.memberEvents[0]!.action, 'added',
    );
    assertStrictEquals(delta.memberEvents[0]!.at, AT);
});

Deno.test('remove a member emits one removed event', () => {
    const baseline: StoredGraph = {
        nodes: [baseNode('n1', { memberIds: ['mFNSxZqywTSMXhgUTdTqtA'] })],
        edges: [],
    };
    const working: StoredGraph = {
        nodes: [baseNode('n1')],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    assertStrictEquals(delta.memberEvents.length, 1);
    assertStrictEquals(
        delta.memberEvents[0]!.action, 'removed',
    );
    assertStrictEquals(
        delta.memberEvents[0]!.member_id, 'mFNSxZqywTSMXhgUTdTqtA',
    );
});

// ── attribute events ──────────

function attr(
    attributeId: string,
    mode: 'editable' | 'readonly' = 'editable',
    isRequired = false,
): NodeAttribute {
    return { attributeId, mode, isRequired };
}

Deno.test('add an attribute emits one added event', () => {
    const baseline: StoredGraph = {
        nodes: [baseNode('n1')],
        edges: [],
    };
    const working: StoredGraph = {
        nodes: [
            baseNode('n1', {
                attributes: [attr('UQTJZvCoKlFjEoDlDUwekw', 'editable'
                    , true)],
            }),
        ],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    assertStrictEquals(delta.attributeEvents.length, 1);
    assertStrictEquals(
        delta.attributeEvents[0]!.flow_node_id, 'n1',
    );
    assertStrictEquals(
        delta.attributeEvents[0]!.attribute_id, 'UQTJZvCoKlFjEoDlDUwekw',
    );
    assertStrictEquals(
        delta.attributeEvents[0]!.mode, 'editable',
    );
    assertStrictEquals(
        delta.attributeEvents[0]!.is_required, true,
    );
    assertStrictEquals(
        delta.attributeEvents[0]!.action, 'added',
    );
});

Deno.test('remove an attribute emits one removed event', () => {
    const baseline: StoredGraph = {
        nodes: [
            baseNode('n1', {
                attributes: [attr('UQTJZvCoKlFjEoDlDUwekw')],
            }),
        ],
        edges: [],
    };
    const working: StoredGraph = {
        nodes: [baseNode('n1')],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    assertStrictEquals(delta.attributeEvents.length, 1);
    assertStrictEquals(
        delta.attributeEvents[0]!.action, 'removed',
    );
    assertStrictEquals(
        delta.attributeEvents[0]!.attribute_id, 'UQTJZvCoKlFjEoDlDUwekw',
    );
});

Deno.test('remove an attr preserves its baseline mode/isRequired', () => {
    const baseline: StoredGraph = {
        nodes: [
            baseNode('n1', {
                attributes: [attr('UQTJZvCoKlFjEoDlDUwekw', 'readonly'
                    , true)],
            }),
        ],
        edges: [],
    };
    const working: StoredGraph = {
        nodes: [baseNode('n1')],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    assertStrictEquals(delta.attributeEvents.length, 1);
    assertStrictEquals(
        delta.attributeEvents[0]!.action, 'removed',
    );
    assertStrictEquals(
        delta.attributeEvents[0]!.attribute_id, 'UQTJZvCoKlFjEoDlDUwekw',
    );
    assertStrictEquals(
        delta.attributeEvents[0]!.mode, 'readonly',
    );
    assertStrictEquals(
        delta.attributeEvents[0]!.is_required, true,
    );
});

Deno.test('change mode emits one new added (not removed)', () => {
    const baseline: StoredGraph = {
        nodes: [
            baseNode('n1', {
                attributes: [attr('UQTJZvCoKlFjEoDlDUwekw', 'editable')],
            }),
        ],
        edges: [],
    };
    const working: StoredGraph = {
        nodes: [
            baseNode('n1', {
                attributes: [attr('UQTJZvCoKlFjEoDlDUwekw', 'readonly')],
            }),
        ],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    assertStrictEquals(delta.attributeEvents.length, 1);
    assertStrictEquals(
        delta.attributeEvents[0]!.action, 'added',
    );
    assertStrictEquals(
        delta.attributeEvents[0]!.mode, 'readonly',
    );
});

Deno.test('change is_required emits one new added', () => {
    const baseline: StoredGraph = {
        nodes: [
            baseNode('n1', {
                attributes: [attr('UQTJZvCoKlFjEoDlDUwekw', 'editable'
                    , false)],
            }),
        ],
        edges: [],
    };
    const working: StoredGraph = {
        nodes: [
            baseNode('n1', {
                attributes: [attr('UQTJZvCoKlFjEoDlDUwekw', 'editable'
                    , true)],
            }),
        ],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    assertStrictEquals(delta.attributeEvents.length, 1);
    assertStrictEquals(
        delta.attributeEvents[0]!.action, 'added',
    );
    assertStrictEquals(
        delta.attributeEvents[0]!.is_required, true,
    );
});

// ── no-change baseline ────────────────

Deno.test('identical baseline and working → all arrays empty', () => {
    const graph: StoredGraph = {
        nodes: [
            baseNode('n1', {
                memberIds: ['mFNSxZqywTSMXhgUTdTqtA'],
                attributes: [attr('UQTJZvCoKlFjEoDlDUwekw', 'editable'
                    , true)],
            }),
        ],
        edges: [],
    };
    const delta = buildSaveEvents(
        graph, graph, FLOW_ID, makeMint(), AT,
    );
    // Node upsert still emitted (always-upsert rule)
    assertStrictEquals(delta.nodes.length, 1);
    assertStrictEquals(delta.deletions.length, 0);
    assertStrictEquals(delta.memberEvents.length, 0);
    assertStrictEquals(delta.attributeEvents.length, 0);
});

Deno.test('empty baseline and empty working → all arrays empty',
() => {
    const delta = buildSaveEvents(
        EMPTY, EMPTY, FLOW_ID, makeMint(), AT,
    );
    assertStrictEquals(delta.nodes.length, 0);
    assertStrictEquals(delta.edges.length, 0);
    assertStrictEquals(delta.deletions.length, 0);
    assertStrictEquals(delta.memberEvents.length, 0);
    assertStrictEquals(delta.attributeEvents.length, 0);
});

// ── field shape correctness ───────────

Deno.test('node upsert maps all camelCase fields', () => {
    const n = baseNode('n1', {
        name: 'Draft',
        positionX: 10,
        positionY: 20,
        isCreate: true,
        isArchive: false,
        taskInstructions: 'do it',
    });
    const working: StoredGraph = {
        nodes: [n], edges: [],
    };
    const delta = buildSaveEvents(
        EMPTY, working, FLOW_ID, makeMint(), AT,
    );
    const row = delta.nodes[0]!;
    assertStrictEquals(row.name, 'Draft');
    assertStrictEquals(row.position_x, 10);
    assertStrictEquals(row.position_y, 20);
    assertStrictEquals(row.is_create, true);
    assertStrictEquals(row.is_archive, false);
    assertStrictEquals(
        row.task_instructions, 'do it',
    );
});

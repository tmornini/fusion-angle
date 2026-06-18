import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildSaveEvents,
} from '../web-app/app/adapters/flow-mutations.ts';
import type {
    StoredGraph,
    GraphNode,
    NodeAttribute,
} from '../api/types.ts';

const AT = '2026-01-01T00:00:00.000000Z';
const FLOW_ID = 'flow-1';

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

test('add a node emits one upsert, no deletions', () => {
    const working: StoredGraph = {
        nodes: [baseNode('n1')],
        edges: [],
    };
    const delta = buildSaveEvents(
        EMPTY, working, FLOW_ID, makeMint(), AT,
    );
    assert.equal(delta.nodes.length, 1);
    assert.equal(delta.nodes[0]!.id, 'n1');
    assert.equal(delta.nodes[0]!.flow_id, FLOW_ID);
    assert.equal(delta.nodes[0]!.at, AT);
    assert.equal(delta.deletions.length, 0);
    assert.equal(delta.edges.length, 0);
    assert.equal(delta.memberEvents.length, 0);
    assert.equal(delta.attributeEvents.length, 0);
});

test('move a node emits one upsert with new position', () => {
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
    assert.equal(delta.nodes.length, 1);
    assert.equal(delta.nodes[0]!.position_x, 99);
    assert.equal(delta.deletions.length, 0);
    assert.equal(delta.memberEvents.length, 0);
    assert.equal(delta.attributeEvents.length, 0);
});

test('remove a node emits a deletion', () => {
    const baseline: StoredGraph = {
        nodes: [baseNode('n1')],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, EMPTY, FLOW_ID, makeMint(), AT,
    );
    assert.equal(delta.nodes.length, 0);
    assert.equal(delta.deletions.length, 1);
    assert.equal(delta.deletions[0]!.entityId, 'n1');
    assert.equal(delta.deletions[0]!.at, AT);
});

// ── edge upserts ──────────────

test('add an edge emits one upsert', () => {
    const working: StoredGraph = {
        nodes: [baseNode('n1'), baseNode('n2')],
        edges: [
            {
                id: 'e1',
                name: 'next',
                fromNodeId: 'n1',
                toNodeId: 'n2',
            },
        ],
    };
    const delta = buildSaveEvents(
        EMPTY, working, FLOW_ID, makeMint(), AT,
    );
    assert.equal(delta.edges.length, 1);
    assert.equal(delta.edges[0]!.id, 'e1');
    assert.equal(delta.edges[0]!.from_node_id, 'n1');
    assert.equal(delta.edges[0]!.to_node_id, 'n2');
    assert.equal(delta.edges[0]!.flow_id, FLOW_ID);
    assert.equal(delta.edges[0]!.at, AT);
});

test('remove an edge emits a deletion', () => {
    const baseline: StoredGraph = {
        nodes: [baseNode('n1'), baseNode('n2')],
        edges: [
            {
                id: 'e1',
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
    assert.equal(delta.deletions.length, 1);
    assert.equal(delta.deletions[0]!.entityId, 'e1');
});

// ── member events ─────────────

test('add a member emits one added event', () => {
    const baseline: StoredGraph = {
        nodes: [baseNode('n1')],
        edges: [],
    };
    const working: StoredGraph = {
        nodes: [baseNode('n1', { memberIds: ['m1'] })],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    assert.equal(delta.memberEvents.length, 1);
    assert.equal(
        delta.memberEvents[0]!.flow_node_id, 'n1',
    );
    assert.equal(
        delta.memberEvents[0]!.member_id, 'm1',
    );
    assert.equal(
        delta.memberEvents[0]!.action, 'added',
    );
    assert.equal(delta.memberEvents[0]!.at, AT);
});

test('remove a member emits one removed event', () => {
    const baseline: StoredGraph = {
        nodes: [baseNode('n1', { memberIds: ['m1'] })],
        edges: [],
    };
    const working: StoredGraph = {
        nodes: [baseNode('n1')],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    assert.equal(delta.memberEvents.length, 1);
    assert.equal(
        delta.memberEvents[0]!.action, 'removed',
    );
    assert.equal(
        delta.memberEvents[0]!.member_id, 'm1',
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

test('add an attribute emits one added event', () => {
    const baseline: StoredGraph = {
        nodes: [baseNode('n1')],
        edges: [],
    };
    const working: StoredGraph = {
        nodes: [
            baseNode('n1', {
                attributes: [attr('a1', 'editable', true)],
            }),
        ],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    assert.equal(delta.attributeEvents.length, 1);
    assert.equal(
        delta.attributeEvents[0]!.flow_node_id, 'n1',
    );
    assert.equal(
        delta.attributeEvents[0]!.attribute_id, 'a1',
    );
    assert.equal(
        delta.attributeEvents[0]!.mode, 'editable',
    );
    assert.equal(
        delta.attributeEvents[0]!.is_required, true,
    );
    assert.equal(
        delta.attributeEvents[0]!.action, 'added',
    );
});

test('remove an attribute emits one removed event', () => {
    const baseline: StoredGraph = {
        nodes: [
            baseNode('n1', {
                attributes: [attr('a1')],
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
    assert.equal(delta.attributeEvents.length, 1);
    assert.equal(
        delta.attributeEvents[0]!.action, 'removed',
    );
    assert.equal(
        delta.attributeEvents[0]!.attribute_id, 'a1',
    );
});

test('remove an attr preserves its baseline mode/isRequired', () => {
    const baseline: StoredGraph = {
        nodes: [
            baseNode('n1', {
                attributes: [attr('a1', 'readonly', true)],
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
    assert.equal(delta.attributeEvents.length, 1);
    assert.equal(
        delta.attributeEvents[0]!.action, 'removed',
    );
    assert.equal(
        delta.attributeEvents[0]!.attribute_id, 'a1',
    );
    assert.equal(
        delta.attributeEvents[0]!.mode, 'readonly',
    );
    assert.equal(
        delta.attributeEvents[0]!.is_required, true,
    );
});

test('change mode emits one new added (not removed)', () => {
    const baseline: StoredGraph = {
        nodes: [
            baseNode('n1', {
                attributes: [attr('a1', 'editable')],
            }),
        ],
        edges: [],
    };
    const working: StoredGraph = {
        nodes: [
            baseNode('n1', {
                attributes: [attr('a1', 'readonly')],
            }),
        ],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    assert.equal(delta.attributeEvents.length, 1);
    assert.equal(
        delta.attributeEvents[0]!.action, 'added',
    );
    assert.equal(
        delta.attributeEvents[0]!.mode, 'readonly',
    );
});

test('change is_required emits one new added', () => {
    const baseline: StoredGraph = {
        nodes: [
            baseNode('n1', {
                attributes: [attr('a1', 'editable', false)],
            }),
        ],
        edges: [],
    };
    const working: StoredGraph = {
        nodes: [
            baseNode('n1', {
                attributes: [attr('a1', 'editable', true)],
            }),
        ],
        edges: [],
    };
    const delta = buildSaveEvents(
        baseline, working, FLOW_ID, makeMint(), AT,
    );
    assert.equal(delta.attributeEvents.length, 1);
    assert.equal(
        delta.attributeEvents[0]!.action, 'added',
    );
    assert.equal(
        delta.attributeEvents[0]!.is_required, true,
    );
});

// ── no-change baseline ────────────────

test('identical baseline and working → all arrays empty', () => {
    const graph: StoredGraph = {
        nodes: [
            baseNode('n1', {
                memberIds: ['m1'],
                attributes: [attr('a1', 'editable', true)],
            }),
        ],
        edges: [],
    };
    const delta = buildSaveEvents(
        graph, graph, FLOW_ID, makeMint(), AT,
    );
    // Node upsert still emitted (always-upsert rule)
    assert.equal(delta.nodes.length, 1);
    assert.equal(delta.deletions.length, 0);
    assert.equal(delta.memberEvents.length, 0);
    assert.equal(delta.attributeEvents.length, 0);
});

test('empty baseline and empty working → all arrays empty',
() => {
    const delta = buildSaveEvents(
        EMPTY, EMPTY, FLOW_ID, makeMint(), AT,
    );
    assert.equal(delta.nodes.length, 0);
    assert.equal(delta.edges.length, 0);
    assert.equal(delta.deletions.length, 0);
    assert.equal(delta.memberEvents.length, 0);
    assert.equal(delta.attributeEvents.length, 0);
});

// ── field shape correctness ───────────

test('node upsert maps all camelCase fields', () => {
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
    assert.equal(row.name, 'Draft');
    assert.equal(row.position_x, 10);
    assert.equal(row.position_y, 20);
    assert.equal(row.is_create, true);
    assert.equal(row.is_archive, false);
    assert.equal(
        row.task_instructions, 'do it',
    );
});

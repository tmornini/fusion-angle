import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    currentNodeMemberIds,
    currentNodeAttributes,
    reassembleStoredGraph,
} from '../api/flow-graph-relations.ts';
import type {
    FlowNodeEntity,
    FlowEdgeEntity,
    FlowNodeMemberEntity,
    FlowNodeAttributeEntity,
    FlowNodeRelationAction,
} from '../api/types.ts';

const memberRow = (
    id: string, nodeId: string, memberId: string,
    action: FlowNodeRelationAction, at: string,
): FlowNodeMemberEntity => ({
    id, flow_node_id: nodeId, member_id: memberId, action, at,
});

const attrRow = (
    id: string, nodeId: string, attributeId: string,
    mode: 'editable' | 'readonly', isRequired: boolean,
    action: FlowNodeRelationAction, at: string,
): FlowNodeAttributeEntity => ({
    id, flow_node_id: nodeId, attribute_id: attributeId,
    mode, is_required: isRequired, action, at,
});

const nodeRow = (
    id: string, flowId: string, name: string, at: string,
): FlowNodeEntity => ({
    id, flow_id: flowId, name,
    position_x: 0, position_y: 0,
    is_create: false, is_archive: false,
    task_instructions: '', at,
});

const edgeRow = (
    id: string, flowId: string, name: string,
    from: string, to: string, at: string,
): FlowEdgeEntity => ({
    id, flow_id: flowId, name,
    from_node_id: from, to_node_id: to, at,
});

// ── currentNodeMemberIds ──────────────

test('an added member with no later removal is current',
() => {
    const rows = [
        memberRow('1', 'n1', 'm1', 'added',
            '2026-01-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeMemberIds(rows, 'n1'), ['m1']);
});

test('a later removal drops the member', () => {
    const rows = [
        memberRow('1', 'n1', 'm1', 'added',
            '2026-01-01T00:00:00.000000Z'),
        memberRow('2', 'n1', 'm1', 'removed',
            '2026-02-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeMemberIds(rows, 'n1'), []);
});

test('a re-add after removal restores the member', () => {
    const rows = [
        memberRow('1', 'n1', 'm1', 'added',
            '2026-01-01T00:00:00.000000Z'),
        memberRow('2', 'n1', 'm1', 'removed',
            '2026-02-01T00:00:00.000000Z'),
        memberRow('3', 'n1', 'm1', 'added',
            '2026-03-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeMemberIds(rows, 'n1'), ['m1']);
});

test('a same-instant removal beats the add, either order',
() => {
    const at = '2026-03-01T00:00:00.000000Z';
    assert.deepEqual(
        currentNodeMemberIds([
            memberRow('1', 'n1', 'm1', 'added', at),
            memberRow('2', 'n1', 'm1', 'removed', at),
        ], 'n1'), []);
    assert.deepEqual(
        currentNodeMemberIds([
            memberRow('1', 'n1', 'm1', 'removed', at),
            memberRow('2', 'n1', 'm1', 'added', at),
        ], 'n1'), []);
});

test('members are isolated per node', () => {
    const rows = [
        memberRow('1', 'n1', 'm1', 'added',
            '2026-01-01T00:00:00.000000Z'),
        memberRow('2', 'n2', 'm2', 'added',
            '2026-01-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeMemberIds(rows, 'n1'), ['m1']);
    assert.deepEqual(
        currentNodeMemberIds(rows, 'n2'), ['m2']);
});

// ── currentNodeAttributes ─────────────

test('an added attribute is current with its payload', () => {
    const rows = [
        attrRow('1', 'n1', 'a1', 'editable', true, 'added',
            '2026-01-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeAttributes(rows, 'n1'),
        [{ attributeId: 'a1', mode: 'editable',
            isRequired: true }]);
});

test('a later removal drops the attribute', () => {
    const rows = [
        attrRow('1', 'n1', 'a1', 'editable', true, 'added',
            '2026-01-01T00:00:00.000000Z'),
        attrRow('2', 'n1', 'a1', 'editable', true, 'removed',
            '2026-02-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeAttributes(rows, 'n1'), []);
});

test('a mode change is a new add whose payload wins', () => {
    const rows = [
        attrRow('1', 'n1', 'a1', 'editable', false, 'added',
            '2026-01-01T00:00:00.000000Z'),
        attrRow('2', 'n1', 'a1', 'readonly', true, 'added',
            '2026-02-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeAttributes(rows, 'n1'),
        [{ attributeId: 'a1', mode: 'readonly',
            isRequired: true }]);
});

test('a same-instant removal beats the attribute add', () => {
    const at = '2026-03-01T00:00:00.000000Z';
    assert.deepEqual(
        currentNodeAttributes([
            attrRow('1', 'n1', 'a1', 'editable', true,
                'added', at),
            attrRow('2', 'n1', 'a1', 'editable', true,
                'removed', at),
        ], 'n1'), []);
    assert.deepEqual(
        currentNodeAttributes([
            attrRow('1', 'n1', 'a1', 'editable', true,
                'removed', at),
            attrRow('2', 'n1', 'a1', 'editable', true,
                'added', at),
        ], 'n1'), []);
});

test('attributes are isolated per node', () => {
    const rows = [
        attrRow('1', 'n1', 'a1', 'editable', false, 'added',
            '2026-01-01T00:00:00.000000Z'),
        attrRow('2', 'n2', 'a2', 'readonly', true, 'added',
            '2026-01-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeAttributes(rows, 'n1'),
        [{ attributeId: 'a1', mode: 'editable',
            isRequired: false }]);
    assert.deepEqual(
        currentNodeAttributes(rows, 'n2'),
        [{ attributeId: 'a2', mode: 'readonly',
            isRequired: true }]);
});

// ── reassembleStoredGraph ─────────────

test('reassembly maps node rows to domain GraphNodes', () => {
    const node: FlowNodeEntity = {
        id: 'n1', flow_id: 'f1', name: 'Draft',
        position_x: 12, position_y: 34,
        is_create: true, is_archive: false,
        task_instructions: 'do the thing',
        at: '2026-01-01T00:00:00.000000Z',
    };
    const members = [
        memberRow('1', 'n1', 'm1', 'added',
            '2026-01-01T00:00:00.000000Z'),
    ];
    const attrs = [
        attrRow('1', 'n1', 'a1', 'readonly', true, 'added',
            '2026-01-01T00:00:00.000000Z'),
    ];
    const graph = reassembleStoredGraph(
        [node], [], members, attrs);
    assert.deepEqual(graph, {
        nodes: [{
            id: 'n1', name: 'Draft',
            positionX: 12, positionY: 34,
            isCreate: true, isArchive: false,
            memberIds: ['m1'],
            attributes: [{ attributeId: 'a1',
                mode: 'readonly', isRequired: true }],
            taskInstructions: 'do the thing',
        }],
        edges: [],
    });
});

test('reassembly maps edge rows to domain GraphEdges', () => {
    const graph = reassembleStoredGraph(
        [], [edgeRow('e1', 'f1', 'next', 'n1', 'n2',
            '2026-01-01T00:00:00.000000Z')], [], []);
    assert.deepEqual(graph, {
        nodes: [],
        edges: [{ id: 'e1', name: 'next',
            fromNodeId: 'n1', toNodeId: 'n2' }],
    });
});

test('reassembly draws each node members from its own rows',
() => {
    const nodes = [
        nodeRow('n1', 'f1', 'A',
            '2026-01-01T00:00:00.000000Z'),
        nodeRow('n2', 'f1', 'B',
            '2026-01-01T00:00:00.000000Z'),
    ];
    const members = [
        memberRow('1', 'n1', 'm1', 'added',
            '2026-01-01T00:00:00.000000Z'),
        memberRow('2', 'n2', 'm2', 'added',
            '2026-01-01T00:00:00.000000Z'),
    ];
    const graph = reassembleStoredGraph(
        nodes, [], members, []);
    assert.deepEqual(
        graph.nodes.map(n => n.memberIds),
        [['m1'], ['m2']]);
});

test('reassembly of empty relations is an empty graph', () => {
    assert.deepEqual(
        reassembleStoredGraph([], [], [], []),
        { nodes: [], edges: [] });
});

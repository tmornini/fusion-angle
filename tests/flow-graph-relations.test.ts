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
        memberRow('AjdvjuECVZEgZoFajaIEkg', 'n1', 'mFNSxZqywTSMXhgUTdTqtA'
            , 'added',
            '2026-01-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeMemberIds(rows, 'n1'), ['mFNSxZqywTSMXhgUTdTqtA']);
});

test('a later removal drops the member', () => {
    const rows = [
        memberRow('AjdvjuECVZEgZoFajaIEkg', 'n1', 'mFNSxZqywTSMXhgUTdTqtA'
            , 'added',
            '2026-01-01T00:00:00.000000Z'),
        memberRow('BBjWJsjYIDkTRKIIPrzWRw', 'n1', 'mFNSxZqywTSMXhgUTdTqtA'
            , 'removed',
            '2026-02-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeMemberIds(rows, 'n1'), []);
});

test('a re-add after removal restores the member', () => {
    const rows = [
        memberRow('AjdvjuECVZEgZoFajaIEkg', 'n1', 'mFNSxZqywTSMXhgUTdTqtA'
            , 'added',
            '2026-01-01T00:00:00.000000Z'),
        memberRow('BBjWJsjYIDkTRKIIPrzWRw', 'n1', 'mFNSxZqywTSMXhgUTdTqtA'
            , 'removed',
            '2026-02-01T00:00:00.000000Z'),
        memberRow('3', 'n1', 'mFNSxZqywTSMXhgUTdTqtA', 'added',
            '2026-03-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeMemberIds(rows, 'n1'), ['mFNSxZqywTSMXhgUTdTqtA']);
});

test('a same-instant removal beats the add, either order',
() => {
    const at = '2026-03-01T00:00:00.000000Z';
    assert.deepEqual(
        currentNodeMemberIds([
            memberRow('AjdvjuECVZEgZoFajaIEkg', 'n1'
                , 'mFNSxZqywTSMXhgUTdTqtA', 'added', at),
            memberRow('BBjWJsjYIDkTRKIIPrzWRw', 'n1'
                , 'mFNSxZqywTSMXhgUTdTqtA', 'removed', at),
        ], 'n1'), []);
    assert.deepEqual(
        currentNodeMemberIds([
            memberRow('AjdvjuECVZEgZoFajaIEkg', 'n1'
                , 'mFNSxZqywTSMXhgUTdTqtA', 'removed', at),
            memberRow('BBjWJsjYIDkTRKIIPrzWRw', 'n1'
                , 'mFNSxZqywTSMXhgUTdTqtA', 'added', at),
        ], 'n1'), []);
});

test('members are isolated per node', () => {
    const rows = [
        memberRow('AjdvjuECVZEgZoFajaIEkg', 'n1', 'mFNSxZqywTSMXhgUTdTqtA'
            , 'added',
            '2026-01-01T00:00:00.000000Z'),
        memberRow('BBjWJsjYIDkTRKIIPrzWRw', 'n2', 'm2', 'added',
            '2026-01-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeMemberIds(rows, 'n1'), ['mFNSxZqywTSMXhgUTdTqtA']);
    assert.deepEqual(
        currentNodeMemberIds(rows, 'n2'), ['m2']);
});

// ── currentNodeAttributes ─────────────

test('an added attribute is current with its payload', () => {
    const rows = [
        attrRow('AjdvjuECVZEgZoFajaIEkg', 'n1', 'UQTJZvCoKlFjEoDlDUwekw'
            , 'editable', true, 'added',
            '2026-01-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeAttributes(rows, 'n1'),
        [{ attributeId: 'UQTJZvCoKlFjEoDlDUwekw', mode: 'editable',
            isRequired: true }]);
});

test('a later removal drops the attribute', () => {
    const rows = [
        attrRow('AjdvjuECVZEgZoFajaIEkg', 'n1', 'UQTJZvCoKlFjEoDlDUwekw'
            , 'editable', true, 'added',
            '2026-01-01T00:00:00.000000Z'),
        attrRow('BBjWJsjYIDkTRKIIPrzWRw', 'n1', 'UQTJZvCoKlFjEoDlDUwekw'
            , 'editable', true, 'removed',
            '2026-02-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeAttributes(rows, 'n1'), []);
});

test('a mode change is a new add whose payload wins', () => {
    const rows = [
        attrRow('AjdvjuECVZEgZoFajaIEkg', 'n1', 'UQTJZvCoKlFjEoDlDUwekw'
            , 'editable', false, 'added',
            '2026-01-01T00:00:00.000000Z'),
        attrRow('BBjWJsjYIDkTRKIIPrzWRw', 'n1', 'UQTJZvCoKlFjEoDlDUwekw'
            , 'readonly', true, 'added',
            '2026-02-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeAttributes(rows, 'n1'),
        [{ attributeId: 'UQTJZvCoKlFjEoDlDUwekw', mode: 'readonly',
            isRequired: true }]);
});

test('a same-instant removal beats the attribute add', () => {
    const at = '2026-03-01T00:00:00.000000Z';
    assert.deepEqual(
        currentNodeAttributes([
            attrRow('AjdvjuECVZEgZoFajaIEkg', 'n1', 'UQTJZvCoKlFjEoDlDUwekw'
                , 'editable', true,
                'added', at),
            attrRow('BBjWJsjYIDkTRKIIPrzWRw', 'n1', 'UQTJZvCoKlFjEoDlDUwekw'
                , 'editable', true,
                'removed', at),
        ], 'n1'), []);
    assert.deepEqual(
        currentNodeAttributes([
            attrRow('AjdvjuECVZEgZoFajaIEkg', 'n1', 'UQTJZvCoKlFjEoDlDUwekw'
                , 'editable', true,
                'removed', at),
            attrRow('BBjWJsjYIDkTRKIIPrzWRw', 'n1', 'UQTJZvCoKlFjEoDlDUwekw'
                , 'editable', true,
                'added', at),
        ], 'n1'), []);
});

test('attributes are isolated per node', () => {
    const rows = [
        attrRow('AjdvjuECVZEgZoFajaIEkg', 'n1', 'UQTJZvCoKlFjEoDlDUwekw'
            , 'editable', false, 'added',
            '2026-01-01T00:00:00.000000Z'),
        attrRow('BBjWJsjYIDkTRKIIPrzWRw', 'n2', 'UZgNCkZlSJcSaAmAJuSkcw'
            , 'readonly', true, 'added',
            '2026-01-01T00:00:00.000000Z'),
    ];
    assert.deepEqual(
        currentNodeAttributes(rows, 'n1'),
        [{ attributeId: 'UQTJZvCoKlFjEoDlDUwekw', mode: 'editable',
            isRequired: false }]);
    assert.deepEqual(
        currentNodeAttributes(rows, 'n2'),
        [{ attributeId: 'UZgNCkZlSJcSaAmAJuSkcw', mode: 'readonly',
            isRequired: true }]);
});

// ── reassembleStoredGraph ─────────────

test('reassembly maps node rows to domain GraphNodes', () => {
    const node: FlowNodeEntity = {
        id: 'n1', flow_id: 'ZOousbbnzpqlxJExVAruYQ', name: 'Draft',
        position_x: 12, position_y: 34,
        is_create: true, is_archive: false,
        task_instructions: 'do the thing',
        at: '2026-01-01T00:00:00.000000Z',
    };
    const members = [
        memberRow('AjdvjuECVZEgZoFajaIEkg', 'n1', 'mFNSxZqywTSMXhgUTdTqtA'
            , 'added',
            '2026-01-01T00:00:00.000000Z'),
    ];
    const attrs = [
        attrRow('AjdvjuECVZEgZoFajaIEkg', 'n1', 'UQTJZvCoKlFjEoDlDUwekw'
            , 'readonly', true, 'added',
            '2026-01-01T00:00:00.000000Z'),
    ];
    const graph = reassembleStoredGraph(
        [node], [], members, attrs);
    assert.deepEqual(graph, {
        nodes: [{
            id: 'n1', name: 'Draft',
            positionX: 12, positionY: 34,
            isCreate: true, isArchive: false,
            memberIds: ['mFNSxZqywTSMXhgUTdTqtA'],
            attributes: [{ attributeId: 'UQTJZvCoKlFjEoDlDUwekw',
                mode: 'readonly', isRequired: true }],
            taskInstructions: 'do the thing',
        }],
        edges: [],
    });
});

test('reassembly maps edge rows to domain GraphEdges', () => {
    const graph = reassembleStoredGraph(
        [], [edgeRow('YiJPbufDpkyrZcZCYbUJpg', 'ZOousbbnzpqlxJExVAruYQ'
            , 'next', 'n1', 'n2',
            '2026-01-01T00:00:00.000000Z')], [], []);
    assert.deepEqual(graph, {
        nodes: [],
        edges: [{ id: 'YiJPbufDpkyrZcZCYbUJpg', name: 'next',
            fromNodeId: 'n1', toNodeId: 'n2' }],
    });
});

test('reassembly draws each node members from its own rows',
() => {
    const nodes = [
        nodeRow('n1', 'ZOousbbnzpqlxJExVAruYQ', 'A',
            '2026-01-01T00:00:00.000000Z'),
        nodeRow('n2', 'ZOousbbnzpqlxJExVAruYQ', 'B',
            '2026-01-01T00:00:00.000000Z'),
    ];
    const members = [
        memberRow('AjdvjuECVZEgZoFajaIEkg', 'n1', 'mFNSxZqywTSMXhgUTdTqtA'
            , 'added',
            '2026-01-01T00:00:00.000000Z'),
        memberRow('BBjWJsjYIDkTRKIIPrzWRw', 'n2', 'm2', 'added',
            '2026-01-01T00:00:00.000000Z'),
    ];
    const graph = reassembleStoredGraph(
        nodes, [], members, []);
    assert.deepEqual(
        graph.nodes.map(n => n.memberIds),
        [['mFNSxZqywTSMXhgUTdTqtA'], ['m2']]);
});

test('reassembly of empty relations is an empty graph', () => {
    assert.deepEqual(
        reassembleStoredGraph([], [], [], []),
        { nodes: [], edges: [] });
});

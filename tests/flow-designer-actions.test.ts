import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    applyMoveNodes,
    applyDragPreview,
    applyToggleLock,
    applyUpdateFlowName,
    applyAddEdge,
    applyDeleteNodes,
    applyDeleteEdge,
    applyUpdateNode,
    applyUpdateEdge,
} from '../web-app/app/flow-designer-actions.ts';

const node = (id: string, x = 0, y = 0) => ({
    id,
    name: id.toUpperCase(),
    positionX: x,
    positionY: y,
    isCreate: false,
    isArchive: false,
    memberIds: [] as string[],
    attributes: [],
});

const edge = (
    id: string, fromId: string, toId: string,
) => ({
    id,
    name: '',
    fromNodeId: fromId,
    toNodeId: toId,
});

test('applyMoveNodes updates only matching ids', () => {
    const nodes = [
        node('a', 0, 0),
        node('b', 10, 10),
        node('c', 20, 20),
    ];
    const result = applyMoveNodes(nodes, [
        { nodeId: 'b', x: 99, y: 88 },
    ]);
    assert.equal(result[0]?.positionX, 0);
    assert.equal(result[1]?.positionX, 99);
    assert.equal(result[1]?.positionY, 88);
    assert.equal(result[2]?.positionX, 20);
});

test('applyMoveNodes returns new array (immutable)', () => {
    const nodes = [node('a')];
    const result = applyMoveNodes(nodes, [
        { nodeId: 'a', x: 5, y: 5 },
    ]);
    assert.notEqual(result, nodes);
    assert.equal(nodes[0]?.positionX, 0);
});

test('applyMoveNodes empty updates returns equivalent', () => {
    const nodes = [node('a', 1, 2)];
    const result = applyMoveNodes(nodes, []);
    assert.deepEqual(result, nodes);
});

test('applyDragPreview applies offset to dragging nodes', () => {
    const nodes = [
        node('a', 100, 100),
        node('b', 200, 200),
    ];
    const drag = {
        kind: 'dragging' as const,
        anchorNodeId: 'a',
        startPointerX: 0,
        startPointerY: 0,
        currentPointerX: 50,
        currentPointerY: 30,
        initialPositions: new Map([
            ['a', { x: 100, y: 100 }],
            ['b', { x: 200, y: 200 }],
        ]),
    };
    const result = applyDragPreview(
        nodes, drag,
    );
    assert.equal(result[0]?.positionX, 150);
    assert.equal(result[0]?.positionY, 130);
    assert.equal(result[1]?.positionX, 250);
    assert.equal(result[1]?.positionY, 230);
});

test('applyDragPreview idle drag returns nodes copy', () => {
    const nodes = [node('a', 1, 2)];
    const result = applyDragPreview(
        nodes, { kind: 'idle' },
    );
    assert.deepEqual(result, nodes);
    assert.notEqual(result, nodes);
});

test('applyToggleLock unlocked → locked clears editing', () => {
    const result = applyToggleLock(
        false, true,
    );
    assert.equal(result.isLocked, true);
    assert.equal(
        result.isEditingName, false,
    );
});

test('applyToggleLock locked → unlocked preserves editing flag', () => {
    const result = applyToggleLock(
        true, true,
    );
    assert.equal(result.isLocked, false);
    assert.equal(
        result.isEditingName, true,
    );
});

test('applyUpdateFlowName trims input', () => {
    const result =
        applyUpdateFlowName('  hello  ');
    assert.equal(result.flowName, 'hello');
    assert.equal(
        result.isEditingName, false,
    );
});

test('applyAddEdge appends new edge', () => {
    const edges = [edge('e1', 'a', 'b')];
    const result = applyAddEdge(
        edges, 'e2', 'goto', 'b', 'c',
    );
    assert.equal(result.length, 2);
    assert.equal(result[1]?.id, 'e2');
    assert.equal(result[1]?.name, 'goto');
    assert.equal(result[1]?.fromNodeId, 'b');
    assert.equal(result[1]?.toNodeId, 'c');
});

test('applyAddEdge does not mutate input', () => {
    const edges = [edge('e1', 'a', 'b')];
    applyAddEdge(edges, 'e2', '', 'b', 'c');
    assert.equal(edges.length, 1);
});

test('applyDeleteNodes removes nodes and orphan edges', () => {
    const nodes = [
        node('a'), node('b'), node('c'),
    ];
    const edges = [
        edge('e1', 'a', 'b'),
        edge('e2', 'b', 'c'),
        edge('e3', 'a', 'c'),
    ];
    const result = applyDeleteNodes(
        nodes, edges,
        new Set(['b']),
    );
    assert.equal(result.nodes.length, 2);
    assert.deepEqual(
        result.nodes.map(n => n.id),
        ['a', 'c'],
    );
    // e1 and e2 reference 'b', so are dropped
    assert.equal(result.edges.length, 1);
    assert.equal(result.edges[0]?.id, 'e3');
});

test('applyDeleteNodes empty id set leaves both arrays unchanged', () => {
    const nodes = [node('a'), node('b')];
    const edges = [edge('e1', 'a', 'b')];
    const result = applyDeleteNodes(
        nodes, edges, new Set(),
    );
    assert.deepEqual(
        result.nodes.map(n => n.id), ['a', 'b'],
    );
    assert.deepEqual(
        result.edges.map(e => e.id), ['e1'],
    );
});

test('applyDeleteEdge removes single edge by id', () => {
    const edges = [
        edge('e1', 'a', 'b'),
        edge('e2', 'b', 'c'),
    ];
    const result = applyDeleteEdge(
        edges, 'e1',
    );
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, 'e2');
});

test('applyDeleteEdge with non-matching id is a no-op', () => {
    const edges = [
        edge('e1', 'a', 'b'),
        edge('e2', 'b', 'c'),
    ];
    const result = applyDeleteEdge(
        edges, 'missing',
    );
    assert.equal(result.length, 2);
    assert.deepEqual(
        result.map(e => e.id), ['e1', 'e2'],
    );
});

test('applyUpdateNode patches matching id', () => {
    const nodes = [
        node('a', 0, 0),
        node('b', 0, 0),
    ];
    const result = applyUpdateNode(
        nodes, 'a',
        { name: 'Alpha', isCreate: true },
    );
    assert.equal(result[0]?.name, 'Alpha');
    assert.equal(result[0]?.isCreate, true);
    assert.equal(result[1]?.name, 'B');
});

test(
    'applyUpdateNode patches memberIds',
    () => {
        const nodes = [
            node('a', 0, 0),
            node('b', 0, 0),
        ];
        const result = applyUpdateNode(
            nodes, 'a',
            { memberIds: ['hw_1', 'ai_1'] },
        );
        assert.deepEqual(
            result[0]?.memberIds,
            ['hw_1', 'ai_1'],
        );
        assert.deepEqual(
            result[1]?.memberIds, [],
        );
    },
);

test('applyUpdateEdge patches matching id', () => {
    const edges = [
        edge('e1', 'a', 'b'),
        edge('e2', 'b', 'c'),
    ];
    const result = applyUpdateEdge(
        edges, 'e1', { name: 'go' },
    );
    assert.equal(result[0]?.name, 'go');
    assert.equal(result[1]?.name, '');
});

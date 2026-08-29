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
    applyAddNode,
    applyAddAttributeRef,
    applyRemoveAttributeRef,
    applyUpdateAttributeMode,
    applyUpdateAttributeRequired,
    applyAutoLayout,
    applyPanToRevealSelected,
    applyPanelTransition,
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
    taskInstructions: '',
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
    const edges = [edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b')];
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
    const edges = [edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b')];
    applyAddEdge(edges, 'e2', '', 'b', 'c');
    assert.equal(edges.length, 1);
});

test('applyDeleteNodes removes nodes and orphan edges', () => {
    const nodes = [
        node('a'), node('b'), node('c'),
    ];
    const edges = [
        edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b'),
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
    // YiJPbufDpkyrZcZCYbUJpg and e2 reference 'b', so are dropped
    assert.equal(result.edges.length, 1);
    assert.equal(result.edges[0]?.id, 'e3');
});

test('applyDeleteNodes empty id set leaves both arrays unchanged', () => {
    const nodes = [node('a'), node('b')];
    const edges = [edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b')];
    const result = applyDeleteNodes(
        nodes, edges, new Set(),
    );
    assert.deepEqual(
        result.nodes.map(n => n.id), ['a', 'b'],
    );
    assert.deepEqual(
        result.edges.map(e => e.id), ['YiJPbufDpkyrZcZCYbUJpg'],
    );
});

test('applyDeleteEdge removes single edge by id', () => {
    const edges = [
        edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b'),
        edge('e2', 'b', 'c'),
    ];
    const result = applyDeleteEdge(
        edges, 'YiJPbufDpkyrZcZCYbUJpg',
    );
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, 'e2');
});

test('applyDeleteEdge with non-matching id is a no-op', () => {
    const edges = [
        edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b'),
        edge('e2', 'b', 'c'),
    ];
    const result = applyDeleteEdge(
        edges, 'missing',
    );
    assert.equal(result.length, 2);
    assert.deepEqual(
        result.map(e => e.id), ['YiJPbufDpkyrZcZCYbUJpg', 'e2'],
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
        edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b'),
        edge('e2', 'b', 'c'),
    ];
    const result = applyUpdateEdge(
        edges, 'YiJPbufDpkyrZcZCYbUJpg', { name: 'go' },
    );
    assert.equal(result[0]?.name, 'go');
    assert.equal(result[1]?.name, '');
});

// ── T16: previously-untested apply* transforms ──

const attr = (
    id: string,
    mode: 'editable' | 'readonly' = 'editable',
    isRequired = false,
) => ({ attributeId: id, mode, isRequired });

test('applyAddNode appends a node with defaults', () => {
    const result = applyAddNode(
        [node('a')], 'b', 'New', 10, 20);
    assert.equal(result.length, 2);
    const added = result[1]!;
    assert.equal(added.id, 'b');
    assert.equal(added.name, 'New');
    assert.equal(added.positionX, 10);
    assert.equal(added.positionY, 20);
    assert.equal(added.isCreate, false);
    assert.equal(added.isArchive, false);
});

test('applyAddNode does not mutate the input', () => {
    const nodes = [node('a')];
    applyAddNode(nodes, 'b', 'New', 0, 0);
    assert.equal(nodes.length, 1);
});

test('applyAddAttributeRef appends to the matching node', () => {
    const nodes = [
        { ...node('a'), attributes: [] },
        { ...node('b'), attributes: [] },
    ];
    const result = applyAddAttributeRef(
        nodes, 'a', attr('x'));
    assert.deepEqual(
        result[0]!.attributes.map(r => r.attributeId),
        ['x']);
    assert.equal(result[1]!.attributes.length, 0);
});

test('applyRemoveAttributeRef drops by attributeId', () => {
    const nodes = [
        {
            ...node('a'),
            attributes: [attr('x'), attr('y')],
        },
    ];
    const result = applyRemoveAttributeRef(nodes, 'a', 'x');
    assert.deepEqual(
        result[0]!.attributes.map(r => r.attributeId),
        ['y']);
});

test('applyUpdateAttributeMode updates the one ref', () => {
    const nodes = [
        {
            ...node('a'),
            attributes: [attr('x', 'editable')],
        },
    ];
    const result = applyUpdateAttributeMode(
        nodes, 'a', 'x', 'readonly');
    assert.equal(
        result[0]!.attributes[0]!.mode, 'readonly');
});

test('applyUpdateAttributeRequired flips the flag', () => {
    const nodes = [
        {
            ...node('a'),
            attributes: [attr('x', 'editable', false)],
        },
    ];
    const result = applyUpdateAttributeRequired(
        nodes, 'a', 'x', true);
    assert.equal(
        result[0]!.attributes[0]!.isRequired, true);
});

test('applyAutoLayout positions every node', () => {
    const result = applyAutoLayout(
        [{ ...node('a'), isCreate: true }, node('b')],
        [edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b')],
        800, 600, false, 0);
    for (const n of result.nodes) {
        assert.equal(typeof n.positionX, 'number');
        assert.equal(typeof n.positionY, 'number');
    }
    assert.ok(result.edgeWaypoints instanceof Map);
});

test('applyPanToRevealSelected centers a node, else null',
() => {
    const vb = { x: 0, y: 0, w: 800, h: 600 };
    const at100 = applyPanToRevealSelected(
        'a', null, [node('a', 100, 0)], [], vb, 800, 0);
    const at200 = applyPanToRevealSelected(
        'a', null, [node('a', 200, 0)], [], vb, 800, 0);
    assert.ok(at100 !== null && at200 !== null);
    // A node 100 to the right shifts the origin by 100.
    assert.equal(at200!.x - at100!.x, 100);
    // No selection → no pan.
    assert.equal(
        applyPanToRevealSelected(
            null, null, [], [], vb, 800, 0),
        null);
});

test('applyPanelTransition saves the viewBox on open', () => {
    const vb = { x: 5, y: 6, w: 800, h: 600 };
    // autoFit short-circuits to null.
    assert.equal(
        applyPanelTransition(
            true, true, { kind: 'none' }, vb),
        null);
    // Panel just opened → save the viewBox + request a pan.
    const opened = applyPanelTransition(
        false, true, { kind: 'none' }, vb);
    assert.ok(opened !== null);
    assert.equal(opened!.shouldPanToReveal, true);
    assert.equal(opened!.savedViewBox.kind, 'saved');
});

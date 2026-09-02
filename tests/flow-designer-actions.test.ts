import {
    assert,
    assertEquals,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
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

Deno.test('applyMoveNodes updates only matching ids', () => {
    const nodes = [
        node('a', 0, 0),
        node('b', 10, 10),
        node('c', 20, 20),
    ];
    const result = applyMoveNodes(nodes, [
        { nodeId: 'b', x: 99, y: 88 },
    ]);
    assertStrictEquals(result[0]?.positionX, 0);
    assertStrictEquals(result[1]?.positionX, 99);
    assertStrictEquals(result[1]?.positionY, 88);
    assertStrictEquals(result[2]?.positionX, 20);
});

Deno.test('applyMoveNodes returns new array (immutable)', () => {
    const nodes = [node('a')];
    const result = applyMoveNodes(nodes, [
        { nodeId: 'a', x: 5, y: 5 },
    ]);
    assertNotStrictEquals(result, nodes);
    assertStrictEquals(nodes[0]?.positionX, 0);
});

Deno.test('applyMoveNodes empty updates returns equivalent', () => {
    const nodes = [node('a', 1, 2)];
    const result = applyMoveNodes(nodes, []);
    assertEquals(result, nodes);
});

Deno.test('applyDragPreview applies offset to dragging nodes', () => {
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
    assertStrictEquals(result[0]?.positionX, 150);
    assertStrictEquals(result[0]?.positionY, 130);
    assertStrictEquals(result[1]?.positionX, 250);
    assertStrictEquals(result[1]?.positionY, 230);
});

Deno.test('applyDragPreview idle drag returns nodes copy', () => {
    const nodes = [node('a', 1, 2)];
    const result = applyDragPreview(
        nodes, { kind: 'idle' },
    );
    assertEquals(result, nodes);
    assertNotStrictEquals(result, nodes);
});

Deno.test('applyToggleLock unlocked → locked clears editing', () => {
    const result = applyToggleLock(
        false, true,
    );
    assertStrictEquals(result.isLocked, true);
    assertStrictEquals(
        result.isEditingName, false,
    );
});

Deno.test(
    'applyToggleLock locked → unlocked preserves editing flag',
    () => {
        const result = applyToggleLock(
            true, true,
        );
        assertStrictEquals(result.isLocked, false);
        assertStrictEquals(
            result.isEditingName, true,
        );
    },
);

Deno.test('applyUpdateFlowName trims input', () => {
    const result =
        applyUpdateFlowName('  hello  ');
    assertStrictEquals(result.flowName, 'hello');
    assertStrictEquals(
        result.isEditingName, false,
    );
});

Deno.test('applyAddEdge appends new edge', () => {
    const edges = [edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b')];
    const result = applyAddEdge(
        edges, 'e2', 'goto', 'b', 'c',
    );
    assertStrictEquals(result.length, 2);
    assertStrictEquals(result[1]?.id, 'e2');
    assertStrictEquals(result[1]?.name, 'goto');
    assertStrictEquals(result[1]?.fromNodeId, 'b');
    assertStrictEquals(result[1]?.toNodeId, 'c');
});

Deno.test('applyAddEdge does not mutate input', () => {
    const edges = [edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b')];
    applyAddEdge(edges, 'e2', '', 'b', 'c');
    assertStrictEquals(edges.length, 1);
});

Deno.test('applyDeleteNodes removes nodes and orphan edges', () => {
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
    assertStrictEquals(result.nodes.length, 2);
    assertEquals(
        result.nodes.map(n => n.id),
        ['a', 'c'],
    );
    // YiJPbufDpkyrZcZCYbUJpg and e2 reference 'b', so are dropped
    assertStrictEquals(result.edges.length, 1);
    assertStrictEquals(result.edges[0]?.id, 'e3');
});

Deno.test(
    'applyDeleteNodes empty id set leaves both arrays unchanged',
    () => {
        const nodes = [node('a'), node('b')];
        const edges = [edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b')];
        const result = applyDeleteNodes(
            nodes, edges, new Set(),
        );
        assertEquals(
            result.nodes.map(n => n.id), ['a', 'b'],
        );
        assertEquals(
            result.edges.map(e => e.id),
            ['YiJPbufDpkyrZcZCYbUJpg'],
        );
    },
);

Deno.test('applyDeleteEdge removes single edge by id', () => {
    const edges = [
        edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b'),
        edge('e2', 'b', 'c'),
    ];
    const result = applyDeleteEdge(
        edges, 'YiJPbufDpkyrZcZCYbUJpg',
    );
    assertStrictEquals(result.length, 1);
    assertStrictEquals(result[0]?.id, 'e2');
});

Deno.test('applyDeleteEdge with non-matching id is a no-op', () => {
    const edges = [
        edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b'),
        edge('e2', 'b', 'c'),
    ];
    const result = applyDeleteEdge(
        edges, 'missing',
    );
    assertStrictEquals(result.length, 2);
    assertEquals(
        result.map(e => e.id), ['YiJPbufDpkyrZcZCYbUJpg', 'e2'],
    );
});

Deno.test('applyUpdateNode patches matching id', () => {
    const nodes = [
        node('a', 0, 0),
        node('b', 0, 0),
    ];
    const result = applyUpdateNode(
        nodes, 'a',
        { name: 'Alpha', isCreate: true },
    );
    assertStrictEquals(result[0]?.name, 'Alpha');
    assertStrictEquals(result[0]?.isCreate, true);
    assertStrictEquals(result[1]?.name, 'B');
});

Deno.test(
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
        assertEquals(
            result[0]?.memberIds,
            ['hw_1', 'ai_1'],
        );
        assertEquals(
            result[1]?.memberIds, [],
        );
    },
);

Deno.test('applyUpdateEdge patches matching id', () => {
    const edges = [
        edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b'),
        edge('e2', 'b', 'c'),
    ];
    const result = applyUpdateEdge(
        edges, 'YiJPbufDpkyrZcZCYbUJpg', { name: 'go' },
    );
    assertStrictEquals(result[0]?.name, 'go');
    assertStrictEquals(result[1]?.name, '');
});

// ── T16: previously-untested apply* transforms ──

const attr = (
    id: string,
    mode: 'editable' | 'readonly' = 'editable',
    isRequired = false,
) => ({ attributeId: id, mode, isRequired });

Deno.test('applyAddNode appends a node with defaults', () => {
    const result = applyAddNode(
        [node('a')], 'b', 'New', 10, 20);
    assertStrictEquals(result.length, 2);
    const added = result[1]!;
    assertStrictEquals(added.id, 'b');
    assertStrictEquals(added.name, 'New');
    assertStrictEquals(added.positionX, 10);
    assertStrictEquals(added.positionY, 20);
    assertStrictEquals(added.isCreate, false);
    assertStrictEquals(added.isArchive, false);
});

Deno.test('applyAddNode does not mutate the input', () => {
    const nodes = [node('a')];
    applyAddNode(nodes, 'b', 'New', 0, 0);
    assertStrictEquals(nodes.length, 1);
});

Deno.test('applyAddAttributeRef appends to the matching node', () => {
    const nodes = [
        { ...node('a'), attributes: [] },
        { ...node('b'), attributes: [] },
    ];
    const result = applyAddAttributeRef(
        nodes, 'a', attr('x'));
    assertEquals(
        result[0]!.attributes.map(r => r.attributeId),
        ['x']);
    assertStrictEquals(result[1]!.attributes.length, 0);
});

Deno.test('applyRemoveAttributeRef drops by attributeId', () => {
    const nodes = [
        {
            ...node('a'),
            attributes: [attr('x'), attr('y')],
        },
    ];
    const result = applyRemoveAttributeRef(nodes, 'a', 'x');
    assertEquals(
        result[0]!.attributes.map(r => r.attributeId),
        ['y']);
});

Deno.test('applyUpdateAttributeMode updates the one ref', () => {
    const nodes = [
        {
            ...node('a'),
            attributes: [attr('x', 'editable')],
        },
    ];
    const result = applyUpdateAttributeMode(
        nodes, 'a', 'x', 'readonly');
    assertStrictEquals(
        result[0]!.attributes[0]!.mode, 'readonly');
});

Deno.test('applyUpdateAttributeRequired flips the flag', () => {
    const nodes = [
        {
            ...node('a'),
            attributes: [attr('x', 'editable', false)],
        },
    ];
    const result = applyUpdateAttributeRequired(
        nodes, 'a', 'x', true);
    assertStrictEquals(
        result[0]!.attributes[0]!.isRequired, true);
});

Deno.test('applyAutoLayout positions every node', () => {
    const result = applyAutoLayout(
        [{ ...node('a'), isCreate: true }, node('b')],
        [edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b')],
        800, 600, false, 0);
    for (const n of result.nodes) {
        assertStrictEquals(typeof n.positionX, 'number');
        assertStrictEquals(typeof n.positionY, 'number');
    }
    assert(result.edgeWaypoints instanceof Map);
});

Deno.test('applyPanToRevealSelected centers a node, else null',
() => {
    const vb = { x: 0, y: 0, w: 800, h: 600 };
    const at100 = applyPanToRevealSelected(
        'a', null, [node('a', 100, 0)], [], vb, 800, 0);
    const at200 = applyPanToRevealSelected(
        'a', null, [node('a', 200, 0)], [], vb, 800, 0);
    assert(at100 !== null && at200 !== null);
    // A node 100 to the right shifts the origin by 100.
    assertStrictEquals(at200!.x - at100!.x, 100);
    // No selection → no pan.
    assertStrictEquals(
        applyPanToRevealSelected(
            null, null, [], [], vb, 800, 0),
        null);
});

Deno.test('applyPanelTransition saves the viewBox on open', () => {
    const vb = { x: 5, y: 6, w: 800, h: 600 };
    // autoFit short-circuits to null.
    assertStrictEquals(
        applyPanelTransition(
            true, true, { kind: 'none' }, vb),
        null);
    // Panel just opened → save the viewBox + request a pan.
    const opened = applyPanelTransition(
        false, true, { kind: 'none' }, vb);
    assert(opened !== null);
    assertStrictEquals(opened!.shouldPanToReveal, true);
    assertStrictEquals(opened!.savedViewBox.kind, 'saved');
});

Deno.test('applyPanelTransition restores the viewBox on close',
    () => {
        const pre = { x: 5, y: 6, w: 800, h: 600 };
        const opened = applyPanelTransition(
            false, true, { kind: 'none' }, pre);
        assert(opened !== null);
        const panned = {
            x: 50, y: 60, w: 800, h: 600,
        };
        const closed = applyPanelTransition(
            false, false, opened!.savedViewBox, panned);
        assert(closed !== null);
        assertStrictEquals(closed!.savedViewBox.kind, 'none');
        assertEquals(closed!.viewBox, pre);
        assertStrictEquals(closed!.shouldPanToReveal, false);
    });

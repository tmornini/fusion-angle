import {
    assert,
    assertEquals,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import { reduceFsm }
    from '../web-app/app/flow-fsm-reduce.ts';
import type {
    FsmState,
    FsmInput,
    Action,
    NodeWithPos,
} from '../web-app/app/flow-fsm-types.ts';

function buildState(
    overrides: Partial<FsmState> = {},
): FsmState {
    return {
        selection: { kind: 'none' },
        lastClick: { kind: 'none' },
        drag: { kind: 'idle' },
        connect: { kind: 'idle' },
        pan: { kind: 'idle' },
        marquee: { kind: 'idle' },
        viewBox: { x: 0, y: 0, w: 800, h: 600 },
        zoom: 1.0,
        isPanMode: false,
        ...overrides,
    };
}

function findAction<K extends Action['kind']>(
    actions: readonly Action[],
    kind: K,
): Extract<Action, { kind: K }> | undefined {
    return actions.find(
        (a): a is Extract<
            Action, { kind: K }
        > => a.kind === kind,
    );
}

Deno.test(
    'click empty canvas clears selection'
    + ' and starts marquee',
    () => {
        const state = buildState({
            selection: {
                kind: 'nodes',
                nodeIds: new Set(['n1']),
            },
        });
        const input: FsmInput = {
            kind: 'pointer-down-on-canvas',
            svgX: 100, svgY: 100,
            clientX: 0, clientY: 0,
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(
            r.state.selection.kind, 'none',
        );
        assertStrictEquals(
            r.state.marquee.kind, 'selecting',
        );
        const open = findAction(
            r.actions, 'open-panel',
        );
        assertStrictEquals(open?.open, false);
        assert(findAction(
            r.actions, 'capture-pointer',
        ));
        assertEquals(
            r.state.viewBox, state.viewBox,
        );
    },
);

Deno.test(
    'empty canvas click keeps a zoomed viewBox',
    () => {
        const zoomed = {
            x: 40, y: 20, w: 400, h: 300,
        };
        const state = buildState({
            viewBox: zoomed,
            zoom: 1.1,
        });
        const down: FsmInput = {
            kind: 'pointer-down-on-canvas',
            svgX: 100, svgY: 100,
            clientX: 0, clientY: 0,
        };
        const afterDown = reduceFsm(state, down);
        const up: FsmInput = {
            kind: 'pointer-up',
            svgX: 100, svgY: 100,
            clientX: 0, clientY: 0,
            isShift: false,
            hoverNodeId: null,
            fromNodePosition: null,
            allNodes: [],
        };
        const afterUp = reduceFsm(
            afterDown.state, up,
        );
        assertEquals(
            afterUp.state.viewBox, zoomed,
        );
        assertStrictEquals(afterUp.state.zoom, 1.1);
    },
);

Deno.test('click on node selects it', () => {
    const state = buildState();
    const input: FsmInput = {
        kind: 'pointer-down-on-node',
        nodeId: 'n1',
        isPort: false,
        isDraggable: true,
        isShift: false,
        isMeta: false,
        isLocked: false,
        svgX: 0, svgY: 0,
        now: 1000,
        selectedPositions: new Map([
            ['n1', { x: 0, y: 0 }],
        ]),
    };
    const r = reduceFsm(state, input);
    assertStrictEquals(r.state.selection.kind, 'nodes');
    if (r.state.selection.kind === 'nodes') {
        assert(
            r.state.selection.nodeIds.has('n1'),
        );
    }
    assertStrictEquals(r.state.drag.kind, 'dragging');
});

Deno.test(
    'shift-click adds node to selection',
    () => {
        const state = buildState({
            selection: {
                kind: 'nodes',
                nodeIds: new Set(['n1']),
            },
        });
        const input: FsmInput = {
            kind: 'pointer-down-on-node',
            nodeId: 'n2',
            isPort: false,
            isDraggable: true,
            isShift: true,
            isMeta: false,
            isLocked: false,
            svgX: 0, svgY: 0,
            now: 1000,
            selectedPositions: new Map([
                ['n1', { x: 0, y: 0 }],
                ['n2', { x: 50, y: 0 }],
            ]),
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(
            r.state.selection.kind, 'nodes',
        );
        if (r.state.selection.kind === 'nodes') {
            const ids = r.state.selection.nodeIds;
            assertStrictEquals(ids.size, 2);
            assert(ids.has('n1'));
            assert(ids.has('n2'));
        }
    },
);

Deno.test(
    'pointer-up after drag emits move-nodes',
    () => {
        const initial = new Map([
            ['n1', { x: 0, y: 0 }],
        ]);
        const state = buildState({
            selection: {
                kind: 'nodes',
                nodeIds: new Set(['n1']),
            },
            drag: {
                kind: 'dragging',
                anchorNodeId: 'n1',
                startPointerX: 0,
                startPointerY: 0,
                currentPointerX: 50,
                currentPointerY: 30,
                initialPositions: initial,
            },
        });
        const input: FsmInput = {
            kind: 'pointer-up',
            svgX: 50, svgY: 30,
            clientX: 0, clientY: 0,
            isShift: false,
            hoverNodeId: null,
            fromNodePosition: null,
            allNodes: [],
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(r.state.drag.kind, 'idle');
        const move = findAction(
            r.actions, 'move-nodes',
        );
        assert(move);
        assertStrictEquals(move.updates.length, 1);
        assertStrictEquals(
            move.updates[0]?.nodeId, 'n1',
        );
        assertStrictEquals(move.updates[0]?.x, 50);
        assertStrictEquals(move.updates[0]?.y, 30);
    },
);

Deno.test(
    'port click starts connect mode',
    () => {
        const state = buildState();
        const input: FsmInput = {
            kind: 'pointer-down-on-node',
            nodeId: 'n1',
            isPort: true,
            isDraggable: true,
            isShift: false,
            isMeta: false,
            isLocked: false,
            svgX: 100, svgY: 50,
            now: 1000,
            selectedPositions: new Map(),
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(
            r.state.connect.kind, 'connecting',
        );
        if (r.state.connect.kind === 'connecting') {
            assertStrictEquals(
                r.state.connect.fromNodeId, 'n1',
            );
        }
    },
);

Deno.test(
    'shift-pointer-up over node emits add-edge',
    () => {
        const state = buildState({
            connect: {
                kind: 'connecting',
                fromNodeId: 'n1',
                toX: 200, toY: 100,
                isShift: true,
                target: { kind: 'node', id: 'n2' },
            },
        });
        const input: FsmInput = {
            kind: 'pointer-up',
            svgX: 200, svgY: 100,
            clientX: 0, clientY: 0,
            isShift: true,
            hoverNodeId: 'n2',
            fromNodePosition: { x: 0, y: 0 },
            allNodes: [],
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(
            r.state.connect.kind, 'idle',
        );
        const edge = findAction(
            r.actions, 'add-edge',
        );
        assert(edge);
        assertStrictEquals(edge.fromId, 'n1');
        assertStrictEquals(edge.toId, 'n2');
    },
);

Deno.test(
    'far-drop port-drag emits add-node',
    () => {
        const state = buildState({
            connect: {
                kind: 'connecting',
                fromNodeId: 'n1',
                toX: 500, toY: 500,
                isShift: false,
                target: { kind: 'none' },
            },
        });
        const input: FsmInput = {
            kind: 'pointer-up',
            svgX: 500, svgY: 500,
            clientX: 0, clientY: 0,
            isShift: false,
            hoverNodeId: null,
            fromNodePosition: { x: 0, y: 0 },
            allNodes: [],
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(
            r.state.connect.kind, 'idle',
        );
        const addNode = findAction(
            r.actions, 'add-node',
        );
        assert(addNode);
        assertStrictEquals(addNode.fromId, 'n1');
    },
);

Deno.test('marquee selects overlapping nodes', () => {
    const state = buildState({
        marquee: {
            kind: 'selecting',
            startX: 0, startY: 0,
            currentX: 200, currentY: 200,
        },
    });
    const allNodes: NodeWithPos[] = [
        { id: 'n1', x: 50, y: 50 },
        { id: 'n2', x: 300, y: 300 },
    ];
    const input: FsmInput = {
        kind: 'pointer-up',
        svgX: 200, svgY: 200,
        clientX: 0, clientY: 0,
        isShift: false,
        hoverNodeId: null,
        fromNodePosition: null,
        allNodes,
    };
    const r = reduceFsm(state, input);
    assertStrictEquals(r.state.marquee.kind, 'idle');
    assertStrictEquals(r.state.selection.kind, 'nodes');
    if (r.state.selection.kind === 'nodes') {
        const ids = r.state.selection.nodeIds;
        assert(ids.has('n1'));
        assert(!ids.has('n2'));
    }
});

Deno.test(
    'space-toggle from off enables pan mode'
    + ' and emits cursor-on action',
    () => {
        const state = buildState();
        const input: FsmInput = {
            kind: 'space-toggle',
            isAutoFit: false,
            isFormFocused: false,
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(
            r.state.isPanMode, true,
        );
        const cursor = findAction(
            r.actions, 'set-pan-cursor',
        );
        assertStrictEquals(cursor?.on, true);
    },
);

Deno.test(
    'space-toggle from on disables pan mode'
    + ' and emits cursor-off action',
    () => {
        const state = buildState({
            isPanMode: true,
        });
        const input: FsmInput = {
            kind: 'space-toggle',
            isAutoFit: false,
            isFormFocused: false,
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(
            r.state.isPanMode, false,
        );
        const cursor = findAction(
            r.actions, 'set-pan-cursor',
        );
        assertStrictEquals(cursor?.on, false);
    },
);

Deno.test(
    'space-toggle from off with autofit'
    + ' shows toast and stays off',
    () => {
        const state = buildState();
        const input: FsmInput = {
            kind: 'space-toggle',
            isAutoFit: true,
            isFormFocused: false,
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(
            r.state.isPanMode, false,
        );
        const toast = findAction(
            r.actions, 'show-toast',
        );
        assert(toast);
        assertStrictEquals(toast.tone, 'error');
    },
);

Deno.test(
    'space-toggle from on with autofit'
    + ' still toggles off',
    () => {
        const state = buildState({
            isPanMode: true,
        });
        const input: FsmInput = {
            kind: 'space-toggle',
            isAutoFit: true,
            isFormFocused: false,
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(
            r.state.isPanMode, false,
        );
        const cursor = findAction(
            r.actions, 'set-pan-cursor',
        );
        assertStrictEquals(cursor?.on, false);
    },
);

Deno.test(
    'space-toggle commits isPanMode via'
    + ' request-update',
    () => {
        const r = reduceFsm(buildState(), {
            kind: 'space-toggle',
            isAutoFit: false,
            isFormFocused: false,
        });
        const upd = findAction(
            r.actions, 'request-update',
        );
        assert(upd);
        assertStrictEquals(
            upd.state.isPanMode, true,
        );
        const cursor = findAction(
            r.actions, 'set-pan-cursor',
        );
        assertStrictEquals(cursor?.on, true);
    },
);

Deno.test(
    'space-toggle off under autofit still'
    + ' request-updates',
    () => {
        const r = reduceFsm(
            buildState({ isPanMode: true }),
            {
                kind: 'space-toggle',
                isAutoFit: true,
                isFormFocused: false,
            },
        );
        const upd = findAction(
            r.actions, 'request-update',
        );
        assert(upd);
        assertStrictEquals(
            upd.state.isPanMode, false,
        );
        assertStrictEquals(
            findAction(r.actions, 'show-toast'),
            undefined,
        );
    },
);

Deno.test(
    'space-toggle while dragging is ignored',
    () => {
        const state = buildState({
            drag: {
                kind: 'dragging',
                anchorNodeId: 'n1',
                startPointerX: 0,
                startPointerY: 0,
                currentPointerX: 0,
                currentPointerY: 0,
                initialPositions: new Map(),
            },
        });
        const input: FsmInput = {
            kind: 'space-toggle',
            isAutoFit: false,
            isFormFocused: false,
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(r.state, state);
        assertStrictEquals(r.actions.length, 0);
    },
);

Deno.test(
    'space-toggle while connecting is ignored',
    () => {
        const state = buildState({
            connect: {
                kind: 'connecting',
                fromNodeId: 'n1',
                toX: 0,
                toY: 0,
                isShift: false,
                target: { kind: 'none' },
            },
        });
        const input: FsmInput = {
            kind: 'space-toggle',
            isAutoFit: false,
            isFormFocused: false,
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(r.state, state);
        assertStrictEquals(r.actions.length, 0);
    },
);

Deno.test(
    'space-toggle while marquee selecting'
    + ' is ignored',
    () => {
        const state = buildState({
            marquee: {
                kind: 'selecting',
                startX: 0,
                startY: 0,
                currentX: 0,
                currentY: 0,
            },
        });
        const input: FsmInput = {
            kind: 'space-toggle',
            isAutoFit: false,
            isFormFocused: false,
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(r.state, state);
        assertStrictEquals(r.actions.length, 0);
    },
);

Deno.test(
    'space-toggle while panning is ignored',
    () => {
        const state = buildState({
            isPanMode: true,
            pan: {
                kind: 'panning',
                startX: 0,
                startY: 0,
            },
        });
        const input: FsmInput = {
            kind: 'space-toggle',
            isAutoFit: false,
            isFormFocused: false,
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(r.state, state);
        assertStrictEquals(r.actions.length, 0);
    },
);

Deno.test(
    'space-toggle while form-focused is ignored',
    () => {
        const state = buildState();
        const input: FsmInput = {
            kind: 'space-toggle',
            isAutoFit: false,
            isFormFocused: true,
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(r.state, state);
        assertStrictEquals(r.actions.length, 0);
    },
);

Deno.test(
    'wheel with autofit shows toast '
    + 'and does not zoom',
    () => {
        const state = buildState();
        const input: FsmInput = {
            kind: 'wheel',
            deltaY: -100,
            svgX: 0, svgY: 0,
            isAutoFit: true,
        };
        const r = reduceFsm(state, input);
        assertStrictEquals(r.state.zoom, 1.0);
    },
);

Deno.test(
    'wheel without autofit changes zoom',
    () => {
        const state = buildState();
        const input: FsmInput = {
            kind: 'wheel',
            deltaY: -100,
            svgX: 0, svgY: 0,
            isAutoFit: false,
        };
        const r = reduceFsm(state, input);
        assertNotStrictEquals(r.state.zoom, 1.0);
    },
);

Deno.test(
    'request-update carries the new state'
    + ' (FSM-to-presenter sync contract)',
    () => {
        const state = buildState();
        const input: FsmInput = {
            kind: 'pointer-down-on-node',
            nodeId: 'n1',
            isPort: false,
            isDraggable: true,
            isShift: false,
            isMeta: false,
            isLocked: false,
            svgX: 0, svgY: 0,
            now: 1000,
            selectedPositions: new Map([
                ['n1', { x: 0, y: 0 }],
            ]),
        };
        const r = reduceFsm(state, input);
        const update = findAction(
            r.actions, 'request-update',
        );
        assert(update);
        assertStrictEquals(update.state, r.state);
        assertStrictEquals(
            update.state.selection.kind, 'nodes',
        );
    },
);

Deno.test(
    'second click within DBLCLICK window emits'
    + ' open-panel:true and request-update with'
    + ' selection set (double-click integration)',
    () => {
        const state0 = buildState();
        const downInput = (now: number): FsmInput => ({
            kind: 'pointer-down-on-node',
            nodeId: 'n1',
            isPort: false,
            isDraggable: true,
            isShift: false,
            isMeta: false,
            isLocked: false,
            svgX: 0, svgY: 0,
            now,
            selectedPositions: new Map([
                ['n1', { x: 0, y: 0 }],
            ]),
        });
        const rOEPOcVMQdJiiiMuiiEhlg = reduceFsm(
            state0, downInput(1000),
        );
        const r2 = reduceFsm(
            rOEPOcVMQdJiiiMuiiEhlg.state, downInput(1200),
        );
        const open = findAction(
            r2.actions, 'open-panel',
        );
        assertStrictEquals(open?.open, true);
        const update = findAction(
            r2.actions, 'request-update',
        );
        assert(update);
        assertStrictEquals(
            update.state.selection.kind, 'nodes',
        );
        if (
            update.state.selection.kind === 'nodes'
        ) {
            assert(
                update.state.selection
                    .nodeIds.has('n1'),
            );
        }
    },
);

Deno.test(
    'canvas-key-activate on a node single-selects it,'
    + ' opens the panel, and requests an update',
    () => {
        const state = buildState();
        const r = reduceFsm(state, {
            kind: 'canvas-key-activate',
            nodeId: 'n1',
            edgeId: null,
        });
        assertStrictEquals(
            r.state.selection.kind, 'nodes',
        );
        if (r.state.selection.kind === 'nodes') {
            assertEquals(
                [...r.state.selection.nodeIds],
                ['n1'],
            );
        }
        const open = findAction(
            r.actions, 'open-panel',
        );
        assertStrictEquals(open?.open, true);
        const update = findAction(
            r.actions, 'request-update',
        );
        assert(update);
        assertStrictEquals(update.state, r.state);
    },
);

Deno.test(
    'canvas-key-activate on an edge selects the edge'
    + ' and opens the panel',
    () => {
        const state = buildState();
        const r = reduceFsm(state, {
            kind: 'canvas-key-activate',
            nodeId: null,
            edgeId: 'e1',
        });
        assertStrictEquals(
            r.state.selection.kind, 'edge',
        );
        if (r.state.selection.kind === 'edge') {
            assertStrictEquals(
                r.state.selection.edgeId, 'e1',
            );
        }
        const open = findAction(
            r.actions, 'open-panel',
        );
        assertStrictEquals(open?.open, true);
        assert(findAction(
            r.actions, 'request-update',
        ));
    },
);

Deno.test(
    'canvas-focus on an unselected node single-selects'
    + ' it with request-update and no open-panel',
    () => {
        const state = buildState();
        const r = reduceFsm(state, {
            kind: 'canvas-focus',
            nodeId: 'n1',
            edgeId: null,
            isRenderedSelected: false,
        });
        assertStrictEquals(
            r.state.selection.kind, 'nodes',
        );
        if (r.state.selection.kind === 'nodes') {
            assertEquals(
                [...r.state.selection.nodeIds],
                ['n1'],
            );
        }
        assert(findAction(
            r.actions, 'request-update',
        ));
        assertStrictEquals(
            findAction(r.actions, 'open-panel'),
            undefined,
        );
    },
);

Deno.test(
    'canvas-focus on a rendered-selected item is a'
    + ' no-op (the promotion loop-breaker)',
    () => {
        const state = buildState({
            selection: {
                kind: 'nodes',
                nodeIds: new Set(['n1']),
            },
        });
        const r = reduceFsm(state, {
            kind: 'canvas-focus',
            nodeId: 'n1',
            edgeId: null,
            isRenderedSelected: true,
        });
        assertStrictEquals(r.state, state);
        assertStrictEquals(r.actions.length, 0);
    },
);

Deno.test(
    'canvas-focus mid-gesture is ignored',
    () => {
        const state = buildState({
            drag: {
                kind: 'dragging',
                anchorNodeId: 'n1',
                startPointerX: 0,
                startPointerY: 0,
                currentPointerX: 50,
                currentPointerY: 30,
                initialPositions: new Map([
                    ['n1', { x: 0, y: 0 }],
                ]),
            },
        });
        const r = reduceFsm(state, {
            kind: 'canvas-focus',
            nodeId: 'n2',
            edgeId: null,
            isRenderedSelected: false,
        });
        assertStrictEquals(r.state, state);
        assertStrictEquals(r.actions.length, 0);
    },
);

Deno.test(
    'canvas-focus on an edge selects the edge',
    () => {
        const state = buildState();
        const r = reduceFsm(state, {
            kind: 'canvas-focus',
            nodeId: null,
            edgeId: 'e1',
            isRenderedSelected: false,
        });
        assertStrictEquals(
            r.state.selection.kind, 'edge',
        );
        if (r.state.selection.kind === 'edge') {
            assertStrictEquals(
                r.state.selection.edgeId, 'e1',
            );
        }
        assert(findAction(
            r.actions, 'request-update',
        ));
    },
);

Deno.test(
    'canvas-focus collapses a foreign multi-selection'
    + ' to the focused node',
    () => {
        const state = buildState({
            selection: {
                kind: 'nodes',
                nodeIds: new Set(['n2', 'n3']),
            },
        });
        const r = reduceFsm(state, {
            kind: 'canvas-focus',
            nodeId: 'n1',
            edgeId: null,
            isRenderedSelected: false,
        });
        assertStrictEquals(
            r.state.selection.kind, 'nodes',
        );
        if (r.state.selection.kind === 'nodes') {
            assertEquals(
                [...r.state.selection.nodeIds],
                ['n1'],
            );
        }
    },
);

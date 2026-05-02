import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { reduceFsm }
    from '../web-app/app/flow-fsm-reduce.ts';
import type {
    FsmState,
    FsmInput,
    Action,
    NodeWithPos,
} from '../web-app/app/flow-fsm-types.ts';

const DBLCLICK_WITHIN_MS = 100;
const DBLCLICK_BEYOND_MS = 500;
const FAR_DROP_X = 500;
const FAR_DROP_Y = 500;
const CLOSE_DROP_X = 165;
const CLOSE_DROP_Y = 33;
const SVG_RECT = 800;

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
        isSpaceDown: false,
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

function findActions<K extends Action['kind']>(
    actions: readonly Action[],
    kind: K,
): Extract<Action, { kind: K }>[] {
    return actions.filter(
        (a): a is Extract<
            Action, { kind: K }
        > => a.kind === kind,
    );
}

function drive(
    state: FsmState,
    inputs: readonly FsmInput[],
): { state: FsmState; actions: Action[] } {
    let s = state;
    const out: Action[] = [];
    for (const i of inputs) {
        const r = reduceFsm(s, i);
        s = r.state;
        out.push(...r.actions);
    }
    return { state: s, actions: out };
}

test(
    'port drag far-drop emits add-node'
    + ' (AA27/AA31/F15)',
    () => {
        const inputs: FsmInput[] = [
            {
                kind: 'pointer-down-on-node',
                nodeId: 'n1',
                isPort: true,
                isDraggable: true,
                isShift: false,
                isMeta: false,
                isLocked: false,
                svgX: 160, svgY: 32,
                now: 1000,
                selectedPositions: new Map(),
            },
            {
                kind: 'pointer-move',
                svgX: FAR_DROP_X,
                svgY: FAR_DROP_Y,
                clientX: 0, clientY: 0,
                isShift: false,
                hoverNodeId: null,
                svgRectW: SVG_RECT,
                svgRectH: SVG_RECT,
            },
            {
                kind: 'pointer-up',
                svgX: FAR_DROP_X,
                svgY: FAR_DROP_Y,
                clientX: 0, clientY: 0,
                isShift: false,
                hoverNodeId: null,
                fromNodePosition: { x: 0, y: 0 },
                allNodes: [],
            },
        ];
        const r = drive(buildState(), inputs);
        assert.equal(r.state.connect.kind, 'idle');
        const addNode = findAction(
            r.actions, 'add-node',
        );
        assert.ok(addNode);
        assert.equal(addNode.fromId, 'n1');
        assert.equal(addNode.svgX, FAR_DROP_X);
        assert.equal(addNode.svgY, FAR_DROP_Y);
        assert.equal(
            findActions(r.actions, 'add-edge')
                .length, 0,
        );
    },
);

test(
    'port drag close-drop (under 20px) emits'
    + ' no add-node (AA27 negative)',
    () => {
        const inputs: FsmInput[] = [
            {
                kind: 'pointer-down-on-node',
                nodeId: 'n1',
                isPort: true,
                isDraggable: true,
                isShift: false,
                isMeta: false,
                isLocked: false,
                svgX: 160, svgY: 32,
                now: 1000,
                selectedPositions: new Map(),
            },
            {
                kind: 'pointer-move',
                svgX: CLOSE_DROP_X,
                svgY: CLOSE_DROP_Y,
                clientX: 0, clientY: 0,
                isShift: false,
                hoverNodeId: null,
                svgRectW: SVG_RECT,
                svgRectH: SVG_RECT,
            },
            {
                kind: 'pointer-up',
                svgX: CLOSE_DROP_X,
                svgY: CLOSE_DROP_Y,
                clientX: 0, clientY: 0,
                isShift: false,
                hoverNodeId: null,
                fromNodePosition: { x: 0, y: 0 },
                allNodes: [],
            },
        ];
        const r = drive(buildState(), inputs);
        assert.equal(r.state.connect.kind, 'idle');
        assert.equal(
            findActions(r.actions, 'add-node')
                .length, 0,
        );
        assert.equal(
            findActions(r.actions, 'add-edge')
                .length, 0,
        );
    },
);

test(
    'shift-drag from port onto different node'
    + ' emits add-edge (AA32/F19)',
    () => {
        const inputs: FsmInput[] = [
            {
                kind: 'pointer-down-on-node',
                nodeId: 'n1',
                isPort: true,
                isDraggable: true,
                isShift: true,
                isMeta: false,
                isLocked: false,
                svgX: 160, svgY: 32,
                now: 1000,
                selectedPositions: new Map(),
            },
            {
                kind: 'pointer-move',
                svgX: 400, svgY: 200,
                clientX: 0, clientY: 0,
                isShift: true,
                hoverNodeId: 'n2',
                svgRectW: SVG_RECT,
                svgRectH: SVG_RECT,
            },
            {
                kind: 'pointer-up',
                svgX: 400, svgY: 200,
                clientX: 0, clientY: 0,
                isShift: true,
                hoverNodeId: 'n2',
                fromNodePosition: { x: 0, y: 0 },
                allNodes: [],
            },
        ];
        const r = drive(buildState(), inputs);
        assert.equal(r.state.connect.kind, 'idle');
        const edge = findAction(
            r.actions, 'add-edge',
        );
        assert.ok(edge);
        assert.equal(edge.fromId, 'n1');
        assert.equal(edge.toId, 'n2');
        assert.equal(
            findActions(r.actions, 'add-node')
                .length, 0,
        );
    },
);

test(
    'shift-drag onto same source node emits'
    + ' nothing (no self-loop) (F19 self)',
    () => {
        const inputs: FsmInput[] = [
            {
                kind: 'pointer-down-on-node',
                nodeId: 'n1',
                isPort: true,
                isDraggable: true,
                isShift: true,
                isMeta: false,
                isLocked: false,
                svgX: 160, svgY: 32,
                now: 1000,
                selectedPositions: new Map(),
            },
            {
                kind: 'pointer-move',
                svgX: 200, svgY: 50,
                clientX: 0, clientY: 0,
                isShift: true,
                hoverNodeId: 'n1',
                svgRectW: SVG_RECT,
                svgRectH: SVG_RECT,
            },
            {
                kind: 'pointer-up',
                svgX: 200, svgY: 50,
                clientX: 0, clientY: 0,
                isShift: true,
                hoverNodeId: 'n1',
                fromNodePosition: { x: 0, y: 0 },
                allNodes: [],
            },
        ];
        const r = drive(buildState(), inputs);
        assert.equal(r.state.connect.kind, 'idle');
        assert.equal(
            findActions(r.actions, 'add-edge')
                .length, 0,
        );
        assert.equal(
            findActions(r.actions, 'add-node')
                .length, 0,
        );
    },
);

test(
    'shift-drag released over empty canvas emits'
    + ' nothing (F22)',
    () => {
        const inputs: FsmInput[] = [
            {
                kind: 'pointer-down-on-node',
                nodeId: 'n1',
                isPort: true,
                isDraggable: true,
                isShift: true,
                isMeta: false,
                isLocked: false,
                svgX: 160, svgY: 32,
                now: 1000,
                selectedPositions: new Map(),
            },
            {
                kind: 'pointer-move',
                svgX: FAR_DROP_X,
                svgY: FAR_DROP_Y,
                clientX: 0, clientY: 0,
                isShift: true,
                hoverNodeId: null,
                svgRectW: SVG_RECT,
                svgRectH: SVG_RECT,
            },
            {
                kind: 'pointer-up',
                svgX: FAR_DROP_X,
                svgY: FAR_DROP_Y,
                clientX: 0, clientY: 0,
                isShift: true,
                hoverNodeId: null,
                fromNodePosition: { x: 0, y: 0 },
                allNodes: [],
            },
        ];
        const r = drive(buildState(), inputs);
        assert.equal(r.state.connect.kind, 'idle');
        assert.equal(
            findActions(r.actions, 'add-edge')
                .length, 0,
        );
        assert.equal(
            findActions(r.actions, 'add-node')
                .length, 0,
        );
    },
);

test(
    'plain port-drag then shift-key toggles'
    + ' connect.isShift (F23)',
    () => {
        const initialPress: FsmInput = {
            kind: 'pointer-down-on-node',
            nodeId: 'n1',
            isPort: true,
            isDraggable: true,
            isShift: false,
            isMeta: false,
            isLocked: false,
            svgX: 160, svgY: 32,
            now: 1000,
            selectedPositions: new Map(),
        };
        const press = drive(
            buildState(), [initialPress],
        );
        assert.equal(
            press.state.connect.kind, 'connecting',
        );
        if (
            press.state.connect.kind === 'connecting'
        ) {
            assert.equal(
                press.state.connect.isShift, false,
            );
        }
        const afterShift = drive(press.state, [
            {
                kind: 'shift-key', isShift: true,
            },
        ]);
        assert.equal(
            afterShift.state.connect.kind,
            'connecting',
        );
        if (
            afterShift.state.connect.kind
                === 'connecting'
        ) {
            assert.equal(
                afterShift.state.connect.isShift,
                true,
            );
        }
    },
);

// F14 (autofit suppresses panel-open) is renderer-layer; the
// FSM emits open-panel unconditionally. Not testable here.
test(
    'double-click node opens panel; second tap'
    + ' within window flips open=true (AA28/F13)',
    () => {
        const firstPress: FsmInput = {
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
        const release: FsmInput = {
            kind: 'pointer-up',
            svgX: 0, svgY: 0,
            clientX: 0, clientY: 0,
            isShift: false,
            hoverNodeId: null,
            fromNodePosition: null,
            allNodes: [],
        };
        const secondPress: FsmInput = {
            ...firstPress,
            now: 1000 + DBLCLICK_WITHIN_MS,
        };
        const r = drive(buildState(), [
            firstPress, release, secondPress,
        ]);
        const panels = findActions(
            r.actions, 'open-panel',
        );
        assert.equal(panels.length, 2);
        assert.equal(panels[0]?.open, false);
        assert.equal(panels[1]?.open, true);
    },
);

test(
    'second click beyond DBLCLICK window does not'
    + ' open panel (F13 negative)',
    () => {
        const firstPress: FsmInput = {
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
        const release: FsmInput = {
            kind: 'pointer-up',
            svgX: 0, svgY: 0,
            clientX: 0, clientY: 0,
            isShift: false,
            hoverNodeId: null,
            fromNodePosition: null,
            allNodes: [],
        };
        const lateSecond: FsmInput = {
            ...firstPress,
            now: 1000 + DBLCLICK_BEYOND_MS,
        };
        const r = drive(buildState(), [
            firstPress, release, lateSecond,
        ]);
        const panels = findActions(
            r.actions, 'open-panel',
        );
        assert.equal(panels.length, 2);
        assert.equal(panels[0]?.open, false);
        assert.equal(panels[1]?.open, false);
    },
);

test(
    'double-click n1 then double-click n2 retargets'
    + ' panel and selection to n2 (F13 retarget)',
    () => {
        const startPositions = new Map([
            ['n1', { x: 0, y: 0 }],
            ['n2', { x: 200, y: 0 }],
        ]);
        const firstN1: FsmInput = {
            kind: 'pointer-down-on-node',
            nodeId: 'n1',
            isPort: false,
            isDraggable: true,
            isShift: false,
            isMeta: false,
            isLocked: false,
            svgX: 0, svgY: 0,
            now: 1000,
            selectedPositions: startPositions,
        };
        const releaseN1: FsmInput = {
            kind: 'pointer-up',
            svgX: 0, svgY: 0,
            clientX: 0, clientY: 0,
            isShift: false,
            hoverNodeId: 'n1',
            fromNodePosition: null,
            allNodes: [],
        };
        const secondN1: FsmInput = {
            ...firstN1,
            now: 1000 + DBLCLICK_WITHIN_MS,
        };
        const releaseN1Again: FsmInput = {
            ...releaseN1,
        };
        const firstN2: FsmInput = {
            kind: 'pointer-down-on-node',
            nodeId: 'n2',
            isPort: false,
            isDraggable: true,
            isShift: false,
            isMeta: false,
            isLocked: false,
            svgX: 200, svgY: 0,
            now: 2000,
            selectedPositions: startPositions,
        };
        const releaseN2: FsmInput = {
            kind: 'pointer-up',
            svgX: 200, svgY: 0,
            clientX: 0, clientY: 0,
            isShift: false,
            hoverNodeId: 'n2',
            fromNodePosition: null,
            allNodes: [],
        };
        const secondN2: FsmInput = {
            ...firstN2,
            now: 2000 + DBLCLICK_WITHIN_MS,
        };
        const r = drive(buildState(), [
            firstN1, releaseN1,
            secondN1, releaseN1Again,
            firstN2, releaseN2, secondN2,
        ]);
        assert.equal(
            r.state.selection.kind, 'nodes',
        );
        if (r.state.selection.kind === 'nodes') {
            const ids = r.state.selection.nodeIds;
            assert.equal(ids.size, 1);
            assert.ok(ids.has('n2'));
        }
        const panels = findActions(
            r.actions, 'open-panel',
        );
        const lastPanel = panels[panels.length - 1];
        assert.equal(lastPanel?.open, true);
    },
);

test(
    'drag node emits move-nodes with delta '
    + 'matching cumulative pointer travel (F16/F17)',
    () => {
        const startPositions = new Map([
            ['n1', { x: 100, y: 100 }],
        ]);
        const inputs: FsmInput[] = [
            {
                kind: 'pointer-down-on-node',
                nodeId: 'n1',
                isPort: false,
                isDraggable: true,
                isShift: false,
                isMeta: false,
                isLocked: false,
                svgX: 110, svgY: 110,
                now: 1000,
                selectedPositions: startPositions,
            },
            {
                kind: 'pointer-move',
                svgX: 130, svgY: 120,
                clientX: 0, clientY: 0,
                isShift: false,
                hoverNodeId: 'n1',
                svgRectW: SVG_RECT,
                svgRectH: SVG_RECT,
            },
            {
                kind: 'pointer-move',
                svgX: 160, svgY: 145,
                clientX: 0, clientY: 0,
                isShift: false,
                hoverNodeId: null,
                svgRectW: SVG_RECT,
                svgRectH: SVG_RECT,
            },
            {
                kind: 'pointer-up',
                svgX: 160, svgY: 145,
                clientX: 0, clientY: 0,
                isShift: false,
                hoverNodeId: null,
                fromNodePosition: null,
                allNodes: [],
            },
        ];
        const r = drive(buildState(), inputs);
        assert.equal(r.state.drag.kind, 'idle');
        const move = findAction(
            r.actions, 'move-nodes',
        );
        assert.ok(move);
        assert.equal(move.updates.length, 1);
        const u = move.updates[0]!;
        assert.equal(u.nodeId, 'n1');
        // dx = 160-110 = 50; dy = 145-110 = 35.
        // initial 100,100 -> 150, 135.
        assert.equal(u.x, 150);
        assert.equal(u.y, 135);
    },
);

test(
    'drag start node also emits move-nodes (F17)',
    () => {
        const startPositions = new Map([
            ['start', { x: 0, y: 0 }],
        ]);
        const inputs: FsmInput[] = [
            {
                kind: 'pointer-down-on-node',
                nodeId: 'start',
                isPort: false,
                isDraggable: true,
                isShift: false,
                isMeta: false,
                isLocked: false,
                svgX: 0, svgY: 0,
                now: 1000,
                selectedPositions: startPositions,
            },
            {
                kind: 'pointer-move',
                svgX: 40, svgY: 25,
                clientX: 0, clientY: 0,
                isShift: false,
                hoverNodeId: null,
                svgRectW: SVG_RECT,
                svgRectH: SVG_RECT,
            },
            {
                kind: 'pointer-up',
                svgX: 40, svgY: 25,
                clientX: 0, clientY: 0,
                isShift: false,
                hoverNodeId: null,
                fromNodePosition: null,
                allNodes: [],
            },
        ];
        const r = drive(buildState(), inputs);
        const move = findAction(
            r.actions, 'move-nodes',
        );
        assert.ok(move);
        assert.equal(move.updates.length, 1);
        const u = move.updates[0]!;
        assert.equal(u.nodeId, 'start');
        assert.equal(u.x, 40);
        assert.equal(u.y, 25);
    },
);

test(
    'edge double-click selects edge and opens'
    + ' panel (F26)',
    () => {
        const firstClick: FsmInput = {
            kind: 'pointer-down-on-edge',
            edgeId: 'e1',
            now: 1000,
        };
        const secondClick: FsmInput = {
            kind: 'pointer-down-on-edge',
            edgeId: 'e1',
            now: 1000 + DBLCLICK_WITHIN_MS,
        };
        const r = drive(buildState(), [
            firstClick, secondClick,
        ]);
        assert.equal(
            r.state.selection.kind, 'edge',
        );
        if (r.state.selection.kind === 'edge') {
            assert.equal(
                r.state.selection.edgeId, 'e1',
            );
        }
        const panels = findActions(
            r.actions, 'open-panel',
        );
        assert.equal(panels.length, 2);
        assert.equal(panels[0]?.open, false);
        assert.equal(panels[1]?.open, true);
    },
);

test(
    'single edge click selects but does not'
    + ' open panel (F26 single)',
    () => {
        const r = drive(buildState(), [
            {
                kind: 'pointer-down-on-edge',
                edgeId: 'e1',
                now: 1000,
            },
        ]);
        assert.equal(
            r.state.selection.kind, 'edge',
        );
        const panel = findAction(
            r.actions, 'open-panel',
        );
        assert.equal(panel?.open, false);
    },
);

test(
    'marquee drag covers two nodes → selection'
    + ' contains both (marquee)',
    () => {
        const allNodes: NodeWithPos[] = [
            { id: 'n1', x: 50, y: 50 },
            { id: 'n2', x: 150, y: 100 },
            { id: 'n3', x: 600, y: 600 },
        ];
        const inputs: FsmInput[] = [
            {
                kind: 'pointer-down-on-canvas',
                svgX: 0, svgY: 0,
                clientX: 0, clientY: 0,
            },
            {
                kind: 'pointer-move',
                svgX: 400, svgY: 300,
                clientX: 0, clientY: 0,
                isShift: false,
                hoverNodeId: null,
                svgRectW: SVG_RECT,
                svgRectH: SVG_RECT,
            },
            {
                kind: 'pointer-up',
                svgX: 400, svgY: 300,
                clientX: 0, clientY: 0,
                isShift: false,
                hoverNodeId: null,
                fromNodePosition: null,
                allNodes,
            },
        ];
        const r = drive(buildState(), inputs);
        assert.equal(r.state.marquee.kind, 'idle');
        assert.equal(
            r.state.selection.kind, 'nodes',
        );
        if (r.state.selection.kind === 'nodes') {
            const ids = r.state.selection.nodeIds;
            assert.equal(ids.size, 2);
            assert.ok(ids.has('n1'));
            assert.ok(ids.has('n2'));
            assert.ok(!ids.has('n3'));
        }
    },
);

test(
    'marquee drag covering no nodes leaves'
    + ' selection none (marquee negative)',
    () => {
        const allNodes: NodeWithPos[] = [
            { id: 'n1', x: 500, y: 500 },
        ];
        const inputs: FsmInput[] = [
            {
                kind: 'pointer-down-on-canvas',
                svgX: 0, svgY: 0,
                clientX: 0, clientY: 0,
            },
            {
                kind: 'pointer-move',
                svgX: 50, svgY: 50,
                clientX: 0, clientY: 0,
                isShift: false,
                hoverNodeId: null,
                svgRectW: SVG_RECT,
                svgRectH: SVG_RECT,
            },
            {
                kind: 'pointer-up',
                svgX: 50, svgY: 50,
                clientX: 0, clientY: 0,
                isShift: false,
                hoverNodeId: null,
                fromNodePosition: null,
                allNodes,
            },
        ];
        const r = drive(buildState(), inputs);
        assert.equal(r.state.marquee.kind, 'idle');
        assert.equal(
            r.state.selection.kind, 'none',
        );
    },
);

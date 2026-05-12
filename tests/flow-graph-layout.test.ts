import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    runFlowLayout,
    runLayoutFromInputs,
    areNodePositionsDegenerate,
    withRenderableLayout,
} from '../web-app/app/flow-graph-layout.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import type { GraphNode, GraphEdge } from '../api/types.ts';
import type { FlowGraph } from
    '../web-app/app/adapters/flow-queries.ts';

// --- builders ------------------------------------------------

type NodeOpts = {
    name?: string;
    positionX?: number;
    positionY?: number;
    isStart?: boolean;
    isComplete?: boolean;
};

function node(id: string, o: NodeOpts = {}): GraphNode {
    return {
        id,
        name: o.name ?? id,
        description: '',
        positionX: o.positionX ?? 0,
        positionY: o.positionY ?? 0,
        isStart: o.isStart ?? false,
        isComplete: o.isComplete ?? false,
        crew: { kind: 'unassigned' },
        fields: [],
    };
}

function edge(
    from: string, to: string, name = 'go',
): GraphEdge {
    return {
        id: `${from}->${to}`,
        name,
        description: '',
        fromNodeId: from,
        toNodeId: to,
    };
}

function flowGraph(o: {
    isAutoLayout?: boolean;
    nodes: GraphNode[];
    edges: GraphEdge[];
}): FlowGraph {
    return {
        id: 'f1',
        name: 'F1',
        description: '',
        isLocked: false,
        isAutoLayout: o.isAutoLayout ?? false,
        isAutoFit: true,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        createdAt: '2026-01-01T00:00:00.000Z',
        nodes: o.nodes,
        edges: o.edges,
    };
}

// A fan plus a back-edge: the layout has to do real work.
function sampleNodes(): GraphNode[] {
    return [
        node('s', { isStart: true }),
        node('a'),
        node('b'),
        node('c'),
        node('z', { isComplete: true }),
    ];
}

function sampleEdges(): GraphEdge[] {
    return [
        edge('s', 'a'),
        edge('a', 'b'),
        edge('a', 'c'),
        edge('b', 'z'),
        edge('c', 'z'),
        edge('z', 'a', 'redo'),
    ];
}

function spanX(
    ns: ReadonlyArray<{ positionX: number }>,
): number {
    const xs = ns.map(n => n.positionX);
    return Math.max(...xs) - Math.min(...xs);
}

function distinctXY(
    ns: ReadonlyArray<{ positionX: number; positionY: number }>,
): number {
    return new Set(
        ns.map(n => `${n.positionX},${n.positionY}`),
    ).size;
}

function distinctPos(
    ps: Iterable<{ x: number; y: number }>,
): number {
    return new Set([...ps].map(p => `${p.x},${p.y}`)).size;
}

// --- areNodePositionsDegenerate ------------------------------

test(
    'areNodePositionsDegenerate: empty is not degenerate',
    () => {
        assert.equal(areNodePositionsDegenerate([]), false);
    },
);

test(
    'areNodePositionsDegenerate: a single node is not'
        + ' degenerate',
    () => {
        assert.equal(
            areNodePositionsDegenerate([
                node('a', { positionX: 500, positionY: 300 }),
            ]),
            false,
        );
    },
);

test(
    'areNodePositionsDegenerate: nodes piled at the origin'
        + ' are degenerate',
    () => {
        assert.equal(
            areNodePositionsDegenerate(
                [node('a'), node('b'), node('c')],
            ),
            true,
        );
    },
);

test(
    'areNodePositionsDegenerate: nodes piled within one'
        + ' node-rect are degenerate',
    () => {
        assert.equal(
            areNodePositionsDegenerate([
                node('a', { positionX: 50, positionY: 50 }),
                node('b', { positionX: 90, positionY: 60 }),
            ]),
            true,
        );
    },
);

test(
    'areNodePositionsDegenerate: a real spread is not'
        + ' degenerate',
    () => {
        assert.equal(
            areNodePositionsDegenerate([
                node('a', { positionX: 0, positionY: 0 }),
                node('b', { positionX: 400, positionY: 0 }),
                node('c', { positionX: 0, positionY: 300 }),
            ]),
            false,
        );
    },
);

// --- runLayoutFromInputs / runFlowLayout ---------------------

test('runLayoutFromInputs: empty inputs yield empty maps', () => {
    const r = runLayoutFromInputs([], []);
    assert.equal(r.positions.size, 0);
    assert.equal(r.waypoints.size, 0);
});

test(
    'runLayoutFromInputs: a chain lays out start before end',
    () => {
        const r = runLayoutFromInputs(
            [
                { id: 's', isStart: true, isComplete: false },
                { id: 'a', isStart: false, isComplete: false },
                { id: 'z', isStart: false, isComplete: true },
            ],
            [edge('s', 'a'), edge('a', 'z')],
        );
        assert.equal(r.positions.size, 3);
        assert.equal(distinctPos(r.positions.values()), 3);
        assert.ok(
            r.positions.get('s')!.x < r.positions.get('z')!.x,
        );
    },
);

test('runFlowLayout: empty nodes yield empty maps', () => {
    assert.equal(runFlowLayout([], []).positions.size, 0);
});

test(
    'runFlowLayout: a piled-up flow lays out into a real'
        + ' shape',
    () => {
        const r = runFlowLayout(sampleNodes(), sampleEdges());
        assert.equal(r.positions.size, 5);
        assert.equal(distinctPos(r.positions.values()), 5);
        assert.ok(
            r.positions.get('s')!.x < r.positions.get('z')!.x,
        );
    },
);

// --- withRenderableLayout ------------------------------------

test(
    'withRenderableLayout: lays out an auto-layout flow',
    () => {
        const out = withRenderableLayout(flowGraph({
            isAutoLayout: true,
            nodes: sampleNodes(),
            edges: sampleEdges(),
        }));
        assert.equal(distinctXY(out.nodes), 5);
        assert.ok(spanX(out.nodes) > 2 * 160);
        const s = out.nodes.find(n => n.isStart)!;
        const z = out.nodes.find(n => n.isComplete)!;
        assert.ok(s.positionX < z.positionX);
    },
);

test(
    'withRenderableLayout: lays out a degenerate non-auto'
        + ' flow',
    () => {
        const out = withRenderableLayout(flowGraph({
            isAutoLayout: false,
            nodes: sampleNodes(),
            edges: sampleEdges(),
        }));
        assert.equal(distinctXY(out.nodes), 5);
        assert.ok(spanX(out.nodes) > 2 * 160);
    },
);

test(
    'withRenderableLayout: leaves a laid-out non-auto flow'
        + ' alone',
    () => {
        const out = withRenderableLayout(flowGraph({
            isAutoLayout: false,
            nodes: [
                node('s', { isStart: true }),
                node('a', { positionX: 300 }),
                node('z', {
                    isComplete: true, positionX: 600,
                }),
            ],
            edges: [edge('s', 'a'), edge('a', 'z')],
        }));
        assert.deepEqual(
            out.nodes.map(
                n => [n.id, n.positionX, n.positionY],
            ),
            [['s', 0, 0], ['a', 300, 0], ['z', 600, 0]],
        );
    },
);

test(
    'withRenderableLayout: a flow with no start node is'
        + ' returned unchanged',
    () => {
        const out = withRenderableLayout(flowGraph({
            isAutoLayout: true,
            nodes: [node('a'), node('b')],
            edges: [edge('a', 'b')],
        }));
        assert.equal(out.nodes[0]!.positionX, 0);
        assert.equal(out.nodes[1]!.positionX, 0);
    },
);

test(
    'withRenderableLayout: an empty graph is returned'
        + ' unchanged',
    () => {
        const out = withRenderableLayout(flowGraph({
            isAutoLayout: true, nodes: [], edges: [],
        }));
        assert.equal(out.nodes.length, 0);
    },
);

import { assert, assertEquals, assertStrictEquals } from '@std/assert';
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
    isCreate?: boolean;
    isArchive?: boolean;
};

function node(id: string, o: NodeOpts = {}): GraphNode {
    return {
        id,
        name: o.name ?? id,
        positionX: o.positionX ?? 0,
        positionY: o.positionY ?? 0,
        isCreate: o.isCreate ?? false,
        isArchive: o.isArchive ?? false,
        memberIds: [],
        attributes: [],
        taskInstructions: '',
    };
}

function edge(
    from: string, to: string, name = 'go',
): GraphEdge {
    return {
        id: `${from}->${to}`,
        name,
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
        id: 'ZOousbbnzpqlxJExVAruYQ',
        name: 'F1',
        isLocked: false,
        isAutoLayout: o.isAutoLayout ?? false,
        isAutoFit: true,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        hasUndoHistory: false,
        nodes: o.nodes,
        edges: o.edges,
    };
}

// A fan plus a back-edge: the layout has to do real work.
function sampleNodes(): GraphNode[] {
    return [
        node('s', { isCreate: true }),
        node('a'),
        node('b'),
        node('c'),
        node('z', { isArchive: true }),
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

Deno.test(
    'areNodePositionsDegenerate: empty is not degenerate',
    () => {
        assertStrictEquals(areNodePositionsDegenerate([]), false);
    },
);

Deno.test(
    'areNodePositionsDegenerate: a single node is not'
        + ' degenerate',
    () => {
        assertStrictEquals(
            areNodePositionsDegenerate([
                node('a', { positionX: 500, positionY: 300 }),
            ]),
            false,
        );
    },
);

Deno.test(
    'areNodePositionsDegenerate: nodes piled at the origin'
        + ' are degenerate',
    () => {
        assertStrictEquals(
            areNodePositionsDegenerate(
                [node('a'), node('b'), node('c')],
            ),
            true,
        );
    },
);

Deno.test(
    'areNodePositionsDegenerate: nodes piled within one'
        + ' node-rect are degenerate',
    () => {
        assertStrictEquals(
            areNodePositionsDegenerate([
                node('a', { positionX: 50, positionY: 50 }),
                node('b', { positionX: 90, positionY: 60 }),
            ]),
            true,
        );
    },
);

Deno.test(
    'areNodePositionsDegenerate: a real spread is not'
        + ' degenerate',
    () => {
        assertStrictEquals(
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

Deno.test('runLayoutFromInputs: empty inputs yield empty maps', () => {
    const r = runLayoutFromInputs([], []);
    assertStrictEquals(r.positions.size, 0);
    assertStrictEquals(r.waypoints.size, 0);
});

Deno.test(
    'runLayoutFromInputs: a chain lays out start before end',
    () => {
        const r = runLayoutFromInputs(
            [
                { id: 's', isCreate: true, isArchive: false },
                { id: 'a', isCreate: false, isArchive: false },
                { id: 'z', isCreate: false, isArchive: true },
            ],
            [edge('s', 'a'), edge('a', 'z')],
        );
        assertStrictEquals(r.positions.size, 3);
        assertStrictEquals(distinctPos(r.positions.values()), 3);
        assert(
            r.positions.get('s')!.x < r.positions.get('z')!.x,
        );
    },
);

Deno.test('runFlowLayout: empty nodes yield empty maps', () => {
    assertStrictEquals(runFlowLayout([], []).positions.size, 0);
});

Deno.test(
    'runFlowLayout: a piled-up flow lays out into a real'
        + ' shape',
    () => {
        const r = runFlowLayout(sampleNodes(), sampleEdges());
        assertStrictEquals(r.positions.size, 5);
        assertStrictEquals(distinctPos(r.positions.values()), 5);
        assert(
            r.positions.get('s')!.x < r.positions.get('z')!.x,
        );
    },
);

// --- withRenderableLayout ------------------------------------

Deno.test(
    'withRenderableLayout: lays out an auto-layout flow',
    () => {
        const out = withRenderableLayout(flowGraph({
            isAutoLayout: true,
            nodes: sampleNodes(),
            edges: sampleEdges(),
        }));
        assertStrictEquals(distinctXY(out.nodes), 5);
        assert(spanX(out.nodes) > 2 * 160);
        const s = out.nodes.find(n => n.isCreate)!;
        const z = out.nodes.find(n => n.isArchive)!;
        assert(s.positionX < z.positionX);
    },
);

Deno.test(
    'withRenderableLayout: lays out a degenerate non-auto'
        + ' flow',
    () => {
        const out = withRenderableLayout(flowGraph({
            isAutoLayout: false,
            nodes: sampleNodes(),
            edges: sampleEdges(),
        }));
        assertStrictEquals(distinctXY(out.nodes), 5);
        assert(spanX(out.nodes) > 2 * 160);
    },
);

Deno.test(
    'withRenderableLayout: leaves a laid-out non-auto flow'
        + ' alone',
    () => {
        const out = withRenderableLayout(flowGraph({
            isAutoLayout: false,
            nodes: [
                node('s', { isCreate: true }),
                node('a', { positionX: 300 }),
                node('z', {
                    isArchive: true, positionX: 600,
                }),
            ],
            edges: [edge('s', 'a'), edge('a', 'z')],
        }));
        assertEquals(
            out.nodes.map(
                n => [n.id, n.positionX, n.positionY],
            ),
            [['s', 0, 0], ['a', 300, 0], ['z', 600, 0]],
        );
    },
);

Deno.test(
    'withRenderableLayout: a flow with no start node is'
        + ' returned unchanged',
    () => {
        const out = withRenderableLayout(flowGraph({
            isAutoLayout: true,
            nodes: [node('a'), node('b')],
            edges: [edge('a', 'b')],
        }));
        assertStrictEquals(out.nodes[0]!.positionX, 0);
        assertStrictEquals(out.nodes[1]!.positionX, 0);
    },
);

Deno.test(
    'withRenderableLayout: an empty graph is returned'
        + ' unchanged',
    () => {
        const out = withRenderableLayout(flowGraph({
            isAutoLayout: true, nodes: [], edges: [],
        }));
        assertStrictEquals(out.nodes.length, 0);
    },
);

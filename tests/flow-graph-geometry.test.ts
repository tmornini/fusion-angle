import {
    assert,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    buildGraphSvg,
    computeEdgeGeometry,
    computeEdgeAimOffsets,
} from '../web-app/app/flow-graph.ts';
import type {
    GraphEdge,
    GraphNode,
} from '../api/types.ts';

function node(
    id: string,
    positionX: number,
    positionY: number,
): GraphNode {
    return {
        id,
        name: 'N',
        positionX,
        positionY,
        isCreate: false,
        isArchive: false,
        memberIds: [],
        attributes: [],
        taskInstructions: '',
    };
}

function edge(
    id: string,
    from: string,
    to: string,
): GraphEdge {
    return {
        id,
        name: 'go',
        fromNodeId: from,
        toNodeId: to,
    };
}

function render(
    nodes: GraphNode[],
    edges: GraphEdge[],
    waypoints: Map<
        string,
        { x: number; y: number }[]
    >,
): string {
    return buildGraphSvg(
        nodes, edges,
        0, 0, 800, 600,
        { kind: 'none' },
        false, false, null,
        waypoints,
        '',
    ).toString();
}

Deno.test(
    'the rendered edge path is exactly the'
    + ' computed geometry',
    () => {
        const nodes = [
            node('a', 0, 0),
            node('b', 300, 120),
        ];
        const edges = [edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b')];
        const offsets =
            computeEdgeAimOffsets(edges);
        const geo = computeEdgeGeometry(
            nodes[0]!, nodes[1]!,
            offsets.get('YiJPbufDpkyrZcZCYbUJpg')!, [],
        );
        const out = render(
            nodes, edges, new Map(),
        );
        assert(
            out.includes(`d="${geo.pathD}"`),
        );
        assert(
            out.includes(`x="${geo.labelX}"`),
        );
    },
);

Deno.test(
    'a two-way pair aims both edges off-axis'
    + ' and renders both computed paths',
    () => {
        const nodes = [
            node('a', 0, 0),
            node('b', 300, 0),
        ];
        const edges = [
            edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b'),
            edge('e2', 'b', 'a'),
        ];
        const offsets =
            computeEdgeAimOffsets(edges);
        assertStrictEquals(offsets.get('YiJPbufDpkyrZcZCYbUJpg'), 1);
        assertStrictEquals(offsets.get('e2'), 1);
        const g1 = computeEdgeGeometry(
            nodes[0]!, nodes[1]!, 1, [],
        );
        const g2 = computeEdgeGeometry(
            nodes[1]!, nodes[0]!, 1, [],
        );
        assertNotStrictEquals(g1.pathD, g2.pathD);
        const out = render(
            nodes, edges, new Map(),
        );
        assert(
            out.includes(`d="${g1.pathD}"`),
        );
        assert(
            out.includes(`d="${g2.pathD}"`),
        );
    },
);

Deno.test(
    'a lone edge between distinct pairs aims'
    + ' straight',
    () => {
        const edges = [
            edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b'),
            edge('e2', 'b', 'c'),
        ];
        const offsets =
            computeEdgeAimOffsets(edges);
        assertStrictEquals(offsets.get('YiJPbufDpkyrZcZCYbUJpg'), 0);
        assertStrictEquals(offsets.get('e2'), 0);
    },
);

Deno.test(
    'a waypoint edge renders the computed'
    + ' polyline path',
    () => {
        const nodes = [
            node('a', 0, 0),
            node('b', 400, 200),
        ];
        const edges = [edge('YiJPbufDpkyrZcZCYbUJpg', 'a', 'b')];
        const wps = [{ x: 200, y: 0 }];
        const geo = computeEdgeGeometry(
            nodes[0]!, nodes[1]!, 0, wps,
        );
        const out = render(
            nodes, edges,
            new Map([['YiJPbufDpkyrZcZCYbUJpg', wps]]),
        );
        assert(
            out.includes(`d="${geo.pathD}"`),
        );
        assert(geo.pathD.includes(' Q '));
    },
);

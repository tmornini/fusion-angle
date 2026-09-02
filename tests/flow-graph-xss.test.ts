import { assert } from '@std/assert';
import {
    buildGraphSvg,
} from '../web-app/app/flow-graph.ts';
import type {
    GraphEdge,
    GraphNode,
} from '../api/types.ts';

const HOSTILE_ID =
    'x"><script>alert(1)</script>';
const HOSTILE_ID_ESCAPED =
    'x&quot;&gt;&lt;script&gt;'
    + 'alert(1)&lt;/script&gt;';

function node(
    id: string,
    overrides: Partial<GraphNode> = {},
): GraphNode {
    return {
        id,
        name: 'N',
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds: [],
        attributes: [],
        taskInstructions: '',
        ...overrides,
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
): string {
    return buildGraphSvg(
        nodes, edges,
        0, 0, 800, 600,
        { kind: 'none' },
        false, false, null,
        new Map(),
        '',
    ).toString();
}

Deno.test(
    'a hostile node id renders escaped in'
    + ' data-node-id',
    () => {
        const out = render(
            [node(HOSTILE_ID)], [],
        );
        assert(
            !out.includes(HOSTILE_ID),
        );
        assert(
            out.includes(
                'data-node-id="'
                + HOSTILE_ID_ESCAPED
                + '"',
            ),
        );
    },
);

Deno.test(
    'a hostile edge id renders escaped in'
    + ' data-edge-id',
    () => {
        const out = render(
            [
                node('a', {
                    positionX: 0,
                    positionY: 0,
                }),
                node('b', {
                    positionX: 300,
                    positionY: 0,
                }),
            ],
            [edge(HOSTILE_ID, 'a', 'b')],
        );
        assert(
            !out.includes(HOSTILE_ID),
        );
        assert(
            out.includes(
                'data-edge-id="'
                + HOSTILE_ID_ESCAPED
                + '"',
            ),
        );
        assert(
            out.includes(
                'data-edge-ref="'
                + HOSTILE_ID_ESCAPED
                + '"',
            ),
        );
    },
);

Deno.test(
    'a hostile edge id from the Create node'
    + ' renders escaped in data-edge-ref',
    () => {
        const out = render(
            [
                node('a', {
                    isCreate: true,
                    positionX: 0,
                    positionY: 0,
                }),
                node('b', {
                    positionX: 300,
                    positionY: 0,
                }),
            ],
            [edge(HOSTILE_ID, 'a', 'b')],
        );
        assert(
            !out.includes(HOSTILE_ID),
        );
        assert(
            out.includes(
                'data-edge-ref="'
                + HOSTILE_ID_ESCAPED
                + '"',
            ),
        );
    },
);

Deno.test(
    'an ampersand in a node id renders as'
    + ' a character entity',
    () => {
        const out = render(
            [node('a&b')], [],
        );
        assert(
            out.includes(
                'data-node-id="a&amp;b"',
            ),
        );
    },
);

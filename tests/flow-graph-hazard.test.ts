import { assertStrictEquals } from '@std/assert';
import {
    shouldShowMemberHazard,
} from '../web-app/app/flow-graph.ts';
import type {
    GraphEdge,
    GraphNode,
    MemberId,
} from '../api/types.ts';

function buildNode(
    id: string,
    memberIds: MemberId[],
    overrides: Partial<GraphNode> = {},
): GraphNode {
    return {
        id,
        name: 'N',
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds,
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
        name: '',
        fromNodeId: from,
        toNodeId: to,
    };
}

Deno.test(
    'zero members on a regular node renders danger',
    () => {
        const n = buildNode('n1', []);
        assertStrictEquals(
            shouldShowMemberHazard(
                n,
                [edge('YiJPbufDpkyrZcZCYbUJpg', 'n1', 'next')],
            ),
            'danger',
        );
    },
);

Deno.test(
    'one member on a regular node with outgoing'
    + ' edges renders warning',
    () => {
        const n = buildNode('n1', ['hw_1']);
        assertStrictEquals(
            shouldShowMemberHazard(
                n,
                [edge('YiJPbufDpkyrZcZCYbUJpg', 'n1', 'next')],
            ),
            'warning',
        );
    },
);

Deno.test(
    'two or more members with outgoing edges'
    + ' renders no hazard',
    () => {
        const n = buildNode(
            'n1', ['hw_1', 'hw_2'],
        );
        assertStrictEquals(
            shouldShowMemberHazard(
                n,
                [edge('YiJPbufDpkyrZcZCYbUJpg', 'n1', 'next')],
            ),
            null,
        );
    },
);

Deno.test(
    'one member with no outgoing edges (dead-end)'
    + ' renders danger (precedence over warning)',
    () => {
        const n = buildNode('n1', ['hw_1']);
        assertStrictEquals(
            shouldShowMemberHazard(n, []),
            'danger',
        );
    },
);

Deno.test(
    'a start node never renders hazard regardless'
    + ' of member count',
    () => {
        const n = buildNode('n1', [], {
            isCreate: true,
        });
        assertStrictEquals(
            shouldShowMemberHazard(n, []),
            null,
        );
    },
);

Deno.test(
    'a complete node never renders hazard'
    + ' regardless of member count',
    () => {
        const n = buildNode('n1', [], {
            isArchive: true,
        });
        assertStrictEquals(
            shouldShowMemberHazard(n, []),
            null,
        );
    },
);

Deno.test(
    'multiple members but no outgoing edges still'
    + ' renders danger (dead-end takes precedence)',
    () => {
        const n = buildNode(
            'n1', ['hw_1', 'hw_2', 'hw_3'],
        );
        assertStrictEquals(
            shouldShowMemberHazard(n, []),
            'danger',
        );
    },
);

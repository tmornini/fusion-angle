import { test } from 'node:test';
import { strict as assert } from 'node:assert';
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

test(
    'zero members on a regular node renders danger',
    () => {
        const n = buildNode('n1', []);
        assert.equal(
            shouldShowMemberHazard(
                n,
                [edge('e1', 'n1', 'next')],
            ),
            'danger',
        );
    },
);

test(
    'one member on a regular node with outgoing'
    + ' edges renders warning',
    () => {
        const n = buildNode('n1', ['hw_1']);
        assert.equal(
            shouldShowMemberHazard(
                n,
                [edge('e1', 'n1', 'next')],
            ),
            'warning',
        );
    },
);

test(
    'two or more members with outgoing edges'
    + ' renders no hazard',
    () => {
        const n = buildNode(
            'n1', ['hw_1', 'hw_2'],
        );
        assert.equal(
            shouldShowMemberHazard(
                n,
                [edge('e1', 'n1', 'next')],
            ),
            null,
        );
    },
);

test(
    'one member with no outgoing edges (dead-end)'
    + ' renders danger (precedence over warning)',
    () => {
        const n = buildNode('n1', ['hw_1']);
        assert.equal(
            shouldShowMemberHazard(n, []),
            'danger',
        );
    },
);

test(
    'a start node never renders hazard regardless'
    + ' of member count',
    () => {
        const n = buildNode('n1', [], {
            isCreate: true,
        });
        assert.equal(
            shouldShowMemberHazard(n, []),
            null,
        );
    },
);

test(
    'a complete node never renders hazard'
    + ' regardless of member count',
    () => {
        const n = buildNode('n1', [], {
            isArchive: true,
        });
        assert.equal(
            shouldShowMemberHazard(n, []),
            null,
        );
    },
);

test(
    'multiple members but no outgoing edges still'
    + ' renders danger (dead-end takes precedence)',
    () => {
        const n = buildNode(
            'n1', ['hw_1', 'hw_2', 'hw_3'],
        );
        assert.equal(
            shouldShowMemberHazard(n, []),
            'danger',
        );
    },
);

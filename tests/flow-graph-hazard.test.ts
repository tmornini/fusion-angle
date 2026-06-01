import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    shouldShowWorkerHazard,
} from '../web-app/app/flow-graph.ts';
import type {
    GraphEdge,
    GraphNode,
    WorkerId,
} from '../api/types.ts';

function buildNode(
    id: string,
    workerIds: WorkerId[],
    overrides: Partial<GraphNode> = {},
): GraphNode {
    return {
        id,
        name: 'N',
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        workerIds,
        attributes: [],
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
    'zero workers on a regular node renders danger',
    () => {
        const n = buildNode('n1', []);
        assert.equal(
            shouldShowWorkerHazard(
                n,
                [edge('e1', 'n1', 'next')],
            ),
            'danger',
        );
    },
);

test(
    'one worker on a regular node with outgoing'
    + ' edges renders warning',
    () => {
        const n = buildNode('n1', ['hw_1']);
        assert.equal(
            shouldShowWorkerHazard(
                n,
                [edge('e1', 'n1', 'next')],
            ),
            'warning',
        );
    },
);

test(
    'two or more workers with outgoing edges'
    + ' renders no hazard',
    () => {
        const n = buildNode(
            'n1', ['hw_1', 'hw_2'],
        );
        assert.equal(
            shouldShowWorkerHazard(
                n,
                [edge('e1', 'n1', 'next')],
            ),
            null,
        );
    },
);

test(
    'one worker with no outgoing edges (dead-end)'
    + ' renders danger (precedence over warning)',
    () => {
        const n = buildNode('n1', ['hw_1']);
        assert.equal(
            shouldShowWorkerHazard(n, []),
            'danger',
        );
    },
);

test(
    'a start node never renders hazard regardless'
    + ' of worker count',
    () => {
        const n = buildNode('n1', [], {
            isCreate: true,
        });
        assert.equal(
            shouldShowWorkerHazard(n, []),
            null,
        );
    },
);

test(
    'a complete node never renders hazard'
    + ' regardless of worker count',
    () => {
        const n = buildNode('n1', [], {
            isArchive: true,
        });
        assert.equal(
            shouldShowWorkerHazard(n, []),
            null,
        );
    },
);

test(
    'multiple workers but no outgoing edges still'
    + ' renders danger (dead-end takes precedence)',
    () => {
        const n = buildNode(
            'n1', ['hw_1', 'hw_2', 'hw_3'],
        );
        assert.equal(
            shouldShowWorkerHazard(n, []),
            'danger',
        );
    },
);

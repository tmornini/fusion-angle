import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    shouldShowHazard,
} from '../web-app/app/flow-graph.ts';
import type {
    GraphNode, NodeAssignment,
} from '../api/types.ts';

function buildNode(
    id: string,
    crew: NodeAssignment,
    overrides: Partial<GraphNode> = {},
): GraphNode {
    return {
        id,
        name: 'N',
        description: '',
        positionX: 0,
        positionY: 0,
        isStart: false,
        isComplete: false,
        crew,
        fields: [],
        ...overrides,
    };
}

test(
    'hazard renders for an unassigned node',
    () => {
        const node = buildNode(
            'n1', { kind: 'unassigned' },
        );
        assert.equal(
            shouldShowHazard(
                node, new Map(),
            ),
            true,
        );
    },
);

test(
    'hazard renders for a role-assigned node'
    + ' when the role has no members',
    () => {
        const node = buildNode(
            'n1',
            { kind: 'role', roleId: 'r-eng' },
        );
        const counts = new Map([
            ['r-eng', 0],
        ]);
        assert.equal(
            shouldShowHazard(node, counts),
            true,
        );
    },
);

test(
    'hazard renders for a role-assigned node'
    + ' when the role has no entry in counts'
    + ' (treat as zero)',
    () => {
        const node = buildNode(
            'n1',
            { kind: 'role', roleId: 'r-eng' },
        );
        assert.equal(
            shouldShowHazard(
                node, new Map(),
            ),
            true,
        );
    },
);

test(
    'hazard does NOT render for a role-assigned'
    + ' node with at least one member',
    () => {
        const node = buildNode(
            'n1',
            { kind: 'role', roleId: 'r-eng' },
        );
        const counts = new Map([
            ['r-eng', 1],
        ]);
        assert.equal(
            shouldShowHazard(node, counts),
            false,
        );
    },
);

test(
    'hazard does NOT render for a user-private'
    + ' role assignment (cardinality 1 by'
    + ' construction)',
    () => {
        const node = buildNode(
            'n1',
            {
                kind: 'role',
                roleId: 'user-private:p-1',
            },
        );
        assert.equal(
            shouldShowHazard(
                node, new Map(),
            ),
            false,
        );
    },
);

test(
    'hazard does NOT render for a model'
    + ' assignment',
    () => {
        const node = buildNode(
            'n1',
            {
                kind: 'model',
                modelId: 'm-1',
            },
        );
        assert.equal(
            shouldShowHazard(
                node, new Map(),
            ),
            false,
        );
    },
);

test(
    'hazard renders for a crew-assigned node'
    + ' when the crew has no members',
    () => {
        const node = buildNode(
            'n1',
            { kind: 'crew', crewId: 'c-1' },
        );
        const crewCounts = new Map([
            ['c-1', 0],
        ]);
        assert.equal(
            shouldShowHazard(
                node, new Map(), crewCounts,
            ),
            true,
        );
    },
);

test(
    'hazard renders for a crew-assigned node'
    + ' when the crew has no entry (treat as'
    + ' zero)',
    () => {
        const node = buildNode(
            'n1',
            { kind: 'crew', crewId: 'c-1' },
        );
        assert.equal(
            shouldShowHazard(
                node, new Map(), new Map(),
            ),
            true,
        );
    },
);

test(
    'hazard does NOT render for a crew-assigned'
    + ' node with at least one member',
    () => {
        const node = buildNode(
            'n1',
            { kind: 'crew', crewId: 'c-1' },
        );
        const crewCounts = new Map([
            ['c-1', 3],
        ]);
        assert.equal(
            shouldShowHazard(
                node, new Map(), crewCounts,
            ),
            false,
        );
    },
);

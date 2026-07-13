import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
    storedGraph,
    storedWorkOrderFlowGraph,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import {
    asStoredGraph,
    asWorkOrderFlowGraph,
} from '../api/validators.ts';

// The graph storage seam, pinned: stored JSON that crosses
// the parse half (validators.ts) and comes back out the
// serialize half (types.ts stored* mappers) must return
// key-for-key identical. SCHEMA.md documents the stored
// shape; existing rows and exported backups carry it, so
// a domain-type change must never leak into storage keys.

const STORED_FLOW_GRAPH = {
    nodes: [
        {
            id: 'n-create',
            name: 'Create',
            positionX: 40,
            positionY: 30,
            isCreate: true,
            isArchive: false,
            memberIds: [],
            attributes: [],
            taskInstructions: '',
        },
        {
            id: 'n-step',
            name: 'Step',
            positionX: 260,
            positionY: 140,
            isCreate: false,
            isArchive: false,
            memberIds: ['m-1', 'm-2'],
            attributes: [
                {
                    attribute_id: 'a-1',
                    mode: 'editable',
                    isRequired: true,
                },
                {
                    attribute_id: 'a-2',
                    mode: 'readonly',
                    isRequired: false,
                },
            ],
            taskInstructions: 'Fill the form',
        },
    ],
    edges: [
        {
            id: 'e-1',
            name: 'go',
            fromNodeId: 'n-create',
            toNodeId: 'n-step',
        },
    ],
};

const STORED_WO_GRAPH = {
    name: 'Flow',
    lockTimeout: DEFAULT_LOCK_TIMEOUT,
    ...STORED_FLOW_GRAPH,
};

test(
    'stored flow graph survives parse then serialize',
    () => {
        const parsed = asStoredGraph(
            STORED_FLOW_GRAPH, 'graph',
        );
        const out = storedGraph(parsed);
        assert.deepEqual(
            out, STORED_FLOW_GRAPH,
        );
    },
);

test(
    'serialized node attributes keep storage keys',
    () => {
        const parsed = asStoredGraph(
            STORED_FLOW_GRAPH, 'graph',
        );
        const out = storedGraph(parsed);
        assert.deepEqual(
            Object.keys(
                (out.nodes as { attributes: object[] }[])[1]!
                    .attributes[0]!,
            ).sort(),
            ['attribute_id', 'isRequired', 'mode'],
        );
    },
);

test(
    'parsed node attributes speak the domain tongue',
    () => {
        const parsed = asStoredGraph(
            STORED_FLOW_GRAPH, 'graph',
        );
        const ref = parsed.nodes[1]!.attributes[0]!;
        assert.equal(ref.attributeId, 'a-1');
        assert.equal('attribute_id' in ref, false);
    },
);

test(
    'stored work-order graph survives parse then'
    + ' serialize',
    () => {
        const parsed =
            asWorkOrderFlowGraph(
                STORED_WO_GRAPH, 'flow_graph',
            );
        const out = storedWorkOrderFlowGraph(parsed);
        assert.deepEqual(out, STORED_WO_GRAPH);
    },
);

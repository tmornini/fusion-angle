
import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    storedGraph,
    storedWorkOrderFlowGraph,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import {
    asStoredGraph,
    asWorkOrderFlowGraph,
} from '../api/validators.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// The graph storage seam, pinned: stored JSON that crosses
// the parse half (validators.ts) and comes back out the
// serialize half (types.ts stored* mappers) must return
// key-for-key identical. SCHEMA.md documents the stored
// shape; existing rows and exported backups carry it, so
// a domain-type change must never leak into storage keys.

const NODE_CREATE = generateIdentifier();
const NODE_STEP = generateIdentifier();
const MEMBER_1 = generateIdentifier();
const MEMBER_2 = generateIdentifier();
const ATTR_2 = generateIdentifier();
const EDGE_1 = generateIdentifier();

const STORED_FLOW_GRAPH = {
    nodes: [
        {
            id: NODE_CREATE,
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
            id: NODE_STEP,
            name: 'Step',
            positionX: 260,
            positionY: 140,
            isCreate: false,
            isArchive: false,
            memberIds: [MEMBER_1, MEMBER_2],
            attributes: [
                {
                    attribute_id: 'UQBiHFcwJeCDSnmkPBoYRA',
                    mode: 'editable',
                    isRequired: true,
                },
                {
                    attribute_id: ATTR_2,
                    mode: 'readonly',
                    isRequired: false,
                },
            ],
            taskInstructions: 'Fill the form',
        },
    ],
    edges: [
        {
            id: EDGE_1,
            name: 'go',
            fromNodeId: NODE_CREATE,
            toNodeId: NODE_STEP,
        },
    ],
};

const STORED_WO_GRAPH = {
    name: 'Flow',
    lockTimeout: DEFAULT_LOCK_TIMEOUT,
    ...STORED_FLOW_GRAPH,
};

Deno.test(
    'stored flow graph survives parse then serialize',
    () => {
        const parsed = asStoredGraph(
            STORED_FLOW_GRAPH, 'graph',
        );
        const out = storedGraph(parsed);
        assertEquals(
            out, STORED_FLOW_GRAPH,
        );
    },
);

Deno.test(
    'serialized node attributes keep storage keys',
    () => {
        const parsed = asStoredGraph(
            STORED_FLOW_GRAPH, 'graph',
        );
        const out = storedGraph(parsed);
        assertEquals(
            Object.keys(
                (out.nodes as { attributes: object[] }[])[1]!
                    .attributes[0]!,
            ).sort(),
            ['attribute_id', 'isRequired', 'mode'],
        );
    },
);

Deno.test(
    'parsed node attributes speak the domain tongue',
    () => {
        const parsed = asStoredGraph(
            STORED_FLOW_GRAPH, 'graph',
        );
        const ref = parsed.nodes[1]!.attributes[0]!;
        assertStrictEquals(ref.attributeId, 'UQBiHFcwJeCDSnmkPBoYRA');
        assertStrictEquals('attribute_id' in ref, false);
    },
);

Deno.test(
    'stored work-order graph survives parse then'
    + ' serialize',
    () => {
        const parsed =
            asWorkOrderFlowGraph(
                STORED_WO_GRAPH, 'flow_graph',
            );
        const out = storedWorkOrderFlowGraph(parsed);
        assertEquals(out, STORED_WO_GRAPH);
    },
);

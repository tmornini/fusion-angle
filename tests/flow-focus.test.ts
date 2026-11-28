import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    focusedStepOf,
    stepFocusOf,
} from '../web-app/app/flow-focus.ts';

// Triage fans out to Quick and Deep; Deep goes on to Panel,
// and Panel loops back to Triage.
const EDGES = [
    { id: 'e1', fromNodeId: 'triage', toNodeId: 'quick' },
    { id: 'e2', fromNodeId: 'triage', toNodeId: 'deep' },
    { id: 'e3', fromNodeId: 'deep', toNodeId: 'panel' },
    { id: 'e4', fromNodeId: 'panel', toNodeId: 'triage' },
];

Deno.test(
    'a focused state lights itself, its transitions in and'
    + ' out, and the states at their other ends',
    () => {
        const focus = stepFocusOf(EDGES, 'deep');
        assertEquals([...focus.edgeIds].sort(), ['e2', 'e3']);
        assertEquals(
            [...focus.nodeIds].sort(), ['deep', 'panel', 'triage'],
        );
    },
);

Deno.test('a state with no transitions lights only itself', () => {
    const focus = stepFocusOf(EDGES, 'lonely');
    assertEquals([...focus.nodeIds], ['lonely']);
    assertStrictEquals(focus.edgeIds.size, 0);
});

Deno.test(
    'the pointer wins, then keyboard focus, then a lone'
    + ' selected state',
    () => {
        const one = { kind: 'nodes' as const, nodeIds: new Set(['a']) };
        assertStrictEquals(focusedStepOf('h', 'k', one), 'h');
        assertStrictEquals(focusedStepOf(null, 'k', one), 'k');
        assertStrictEquals(focusedStepOf(null, null, one), 'a');
    },
);

Deno.test(
    'no state holds focus for a multi-state, edge, or empty'
    + ' selection',
    () => {
        assertStrictEquals(
            focusedStepOf(null, null, {
                kind: 'nodes', nodeIds: new Set(['a', 'b']),
            }),
            null,
        );
        assertStrictEquals(
            focusedStepOf(null, null, { kind: 'edge', edgeId: 'e' }),
            null,
        );
        assertStrictEquals(
            focusedStepOf(null, null, { kind: 'none' }), null,
        );
    },
);

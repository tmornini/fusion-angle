import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    findCycleEdgeIds,
} from '../web-app/app/flow-cycle-edges.ts';

// A node only needs an id and an isStart flag here; an
// edge needs an id and its endpoints. Both GraphNode and
// the stats model's NodeStat satisfy these shapes.
function n(id: string, isStart = false) {
    return { id, isStart };
}
function e(
    id: string,
    fromNodeId: string,
    toNodeId: string,
) {
    return { id, fromNodeId, toNodeId };
}

test('a linear flow has no cycle edges', () => {
    const ids = findCycleEdgeIds(
        [n('start', true), n('a'), n('done')],
        [e('e1', 'start', 'a'), e('e2', 'a', 'done')],
    );
    assert.deepEqual([...ids], []);
});

test('a self-loop edge is a cycle edge', () => {
    const ids = findCycleEdgeIds(
        [n('start', true), n('a')],
        [e('e1', 'start', 'a'), e('loop', 'a', 'a')],
    );
    assert.deepEqual([...ids], ['loop']);
});

test(
    'a back-edge to an ancestor is a cycle edge',
    () => {
        const ids = findCycleEdgeIds(
            [n('start', true), n('a'), n('b')],
            [
                e('e1', 'start', 'a'),
                e('e2', 'a', 'b'),
                e('back', 'b', 'a'),
            ],
        );
        assert.deepEqual([...ids], ['back']);
    },
);

test(
    'a diamond with no back-edge has no cycle edges',
    () => {
        const ids = findCycleEdgeIds(
            [n('start', true), n('a'), n('b'), n('c')],
            [
                e('e1', 'start', 'a'),
                e('e2', 'start', 'b'),
                e('e3', 'a', 'c'),
                e('e4', 'b', 'c'),
            ],
        );
        assert.deepEqual([...ids], []);
    },
);

test(
    'parallel forward edges between one pair are both'
    + ' forward (no cycle edges)',
    () => {
        const ids = findCycleEdgeIds(
            [n('start', true), n('a'), n('b')],
            [
                e('e1', 'start', 'a'),
                e('e2a', 'a', 'b'),
                e('e2b', 'a', 'b'),
            ],
        );
        assert.deepEqual([...ids], []);
    },
);

test(
    'the DFS roots at the start node, not the first'
    + ' node in the array',
    () => {
        // `a` comes first in the array, but `start` is
        // the designated entry. Rooting at `start` makes
        // b->start the back-edge; rooting at `a` would
        // instead flag start->a. We must get b->start.
        const ids = findCycleEdgeIds(
            [n('a'), n('start', true), n('b')],
            [
                e('e1', 'start', 'a'),
                e('e2', 'a', 'b'),
                e('e3', 'b', 'start'),
            ],
        );
        assert.deepEqual([...ids], ['e3']);
    },
);

test(
    'an edge from a node not in the set is ignored,'
    + ' not a crash',
    () => {
        const ids = findCycleEdgeIds(
            [n('start', true), n('a')],
            [
                e('e1', 'start', 'a'),
                e('ghost', 'missing', 'a'),
            ],
        );
        assert.deepEqual([...ids], []);
    },
);

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    edgeWaypointKey,
    buildAdjacency,
    isReachable,
    wouldBeCycle,
} from '../web-app/app/flow-layout.ts';

test('edgeWaypointKey concatenates with arrow', () => {
    assert.equal(
        edgeWaypointKey('a', 'b'),
        'a->b',
    );
});

test('buildAdjacency groups successors per source', () => {
    const adj = buildAdjacency([
        { fromId: 'a', toId: 'b' },
        { fromId: 'a', toId: 'c' },
        { fromId: 'b', toId: 'c' },
    ]);
    assert.deepEqual(
        adj.get('a'), ['b', 'c'],
    );
    assert.deepEqual(
        adj.get('b'), ['c'],
    );
    assert.equal(adj.get('c'), undefined);
});

test('isReachable finds direct neighbor', () => {
    const adj = buildAdjacency([
        { fromId: 'a', toId: 'b' },
    ]);
    assert.ok(isReachable('a', 'b', adj));
});

test('isReachable finds transitive reach', () => {
    const adj = buildAdjacency([
        { fromId: 'a', toId: 'b' },
        { fromId: 'b', toId: 'c' },
        { fromId: 'c', toId: 'd' },
    ]);
    assert.ok(isReachable('a', 'd', adj));
});

test('isReachable returns false for unreachable', () => {
    const adj = buildAdjacency([
        { fromId: 'a', toId: 'b' },
        { fromId: 'c', toId: 'd' },
    ]);
    assert.equal(
        isReachable('a', 'd', adj),
        false,
    );
});

test('isReachable handles self-loop without infinite loop', () => {
    const adj = buildAdjacency([
        { fromId: 'a', toId: 'a' },
    ]);
    assert.ok(isReachable('a', 'a', adj));
});

test('isReachable handles cycle without infinite loop', () => {
    const adj = buildAdjacency([
        { fromId: 'a', toId: 'b' },
        { fromId: 'b', toId: 'a' },
    ]);
    assert.equal(
        isReachable('a', 'c', adj),
        false,
    );
});

test('wouldBeCycle: forward edge in DAG is fine', () => {
    const edges = [
        { fromId: 'a', toId: 'b' },
        { fromId: 'b', toId: 'c' },
    ];
    assert.equal(
        wouldBeCycle('a', 'c', edges),
        false,
    );
});

test('wouldBeCycle: backward edge creates cycle', () => {
    const edges = [
        { fromId: 'a', toId: 'b' },
        { fromId: 'b', toId: 'c' },
    ];
    assert.ok(
        wouldBeCycle('c', 'a', edges),
    );
});

test('wouldBeCycle: self-edge is a cycle', () => {
    assert.ok(
        wouldBeCycle('a', 'a', []),
    );
});

test('wouldBeCycle: parallel edges (same direction) not cycle', () => {
    const edges = [
        { fromId: 'a', toId: 'b' },
    ];
    assert.equal(
        wouldBeCycle('a', 'b', edges),
        false,
    );
});

test('wouldBeCycle: detects deep transitive cycle', () => {
    const edges = [
        { fromId: 'a', toId: 'b' },
        { fromId: 'b', toId: 'c' },
        { fromId: 'c', toId: 'd' },
        { fromId: 'd', toId: 'e' },
    ];
    assert.ok(
        wouldBeCycle('e', 'a', edges),
    );
});

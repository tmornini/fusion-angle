import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    computeLayout,
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

function lin(
    id: string,
    f: { start?: boolean; complete?: boolean } = {},
): { id: string; isCreate: boolean; isArchive: boolean } {
    return {
        id,
        isCreate: f.start ?? false,
        isArchive: f.complete ?? false,
    };
}

test(
    'computeLayout: an empty graph yields empty maps',
    () => {
        const r = computeLayout({
            nodes: [], edges: [],
            canvasWidth: 0, canvasHeight: 0,
        });
        assert.equal(r.positions.size, 0);
        assert.equal(r.waypoints.size, 0);
    },
);

test(
    'computeLayout: throws when there is no start node',
    () => {
        assert.throws(
            () => computeLayout({
                nodes: [lin('a')],
                edges: [],
                canvasWidth: 0, canvasHeight: 0,
            }),
            /no start node/i,
        );
    },
);

test(
    'computeLayout: a linear chain reads start before'
    + ' complete',
    () => {
        const r = computeLayout({
            nodes: [
                lin('s', { start: true }),
                lin('a'),
                lin('z', { complete: true }),
            ],
            edges: [
                { fromId: 's', toId: 'a', labelWidth: 0 },
                { fromId: 'a', toId: 'z', labelWidth: 0 },
            ],
            canvasWidth: 0, canvasHeight: 0,
        });
        assert.ok(
            r.positions.get('s')!.x
                < r.positions.get('z')!.x,
        );
    },
);

test(
    'computeLayout: every input node gets a distinct'
    + ' position',
    () => {
        const r = computeLayout({
            nodes: [
                lin('s', { start: true }),
                lin('a'),
                lin('b'),
                lin('z', { complete: true }),
            ],
            edges: [
                { fromId: 's', toId: 'a', labelWidth: 0 },
                { fromId: 's', toId: 'b', labelWidth: 0 },
                { fromId: 'a', toId: 'z', labelWidth: 0 },
                { fromId: 'b', toId: 'z', labelWidth: 0 },
            ],
            canvasWidth: 0, canvasHeight: 0,
        });
        const ids = ['s', 'a', 'b', 'z'];
        for (const id of ids) {
            assert.ok(
                r.positions.has(id),
                `missing position for ${id}`,
            );
        }
        const seen = new Set(
            ids.map(id => {
                const p = r.positions.get(id)!;
                return `${p.x},${p.y}`;
            }),
        );
        assert.equal(seen.size, 4);
    },
);

test(
    'computeLayout: Archive is pinned to the rightmost'
    + ' column when Sugiyama places it interior',
    () => {
        // Create → A → B, plus Create → Archive direct.
        // Sugiyama places Archive at column 1 (depth 1
        // from Create) while B is at column 2 (depth 2
        // through A). The post-pass moves Archive to
        // the rightmost column at the bottom.
        const r = computeLayout({
            nodes: [
                lin('s', { start: true }),
                lin('a'),
                lin('b'),
                lin('z', { complete: true }),
            ],
            edges: [
                { fromId: 's', toId: 'a', labelWidth: 0 },
                { fromId: 'a', toId: 'b', labelWidth: 0 },
                { fromId: 's', toId: 'z', labelWidth: 0 },
            ],
            canvasWidth: 0, canvasHeight: 0,
        });
        const sPos = r.positions.get('s')!;
        const aPos = r.positions.get('a')!;
        const bPos = r.positions.get('b')!;
        const zPos = r.positions.get('z')!;
        const maxX = Math.max(
            sPos.x, aPos.x, bPos.x, zPos.x,
        );
        assert.equal(
            zPos.x, maxX,
            'Archive at rightmost column',
        );
        const sharing = [sPos, aPos, bPos].filter(
            p => Math.abs(p.x - maxX) < 0.5,
        );
        for (const p of sharing) {
            assert.ok(
                zPos.y >= p.y,
                'Archive at bottom of rightmost column',
            );
        }
    },
);

function bboxMaxDim(
    positions: Map<string, { x: number; y: number }>,
): number {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const p of positions.values()) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    return Math.max(maxX - minX, maxY - minY);
}

function distinctRows(
    positions: Map<string, { x: number; y: number }>,
): number {
    const rows = new Set<number>();
    for (const p of positions.values()) {
        rows.add(Math.round(p.y / 5));
    }
    return rows.size;
}

test(
    'computeLayout: a Create->Archive shortcut routes'
    + ' through a waypoint when Archive is terminal',
    () => {
        // Create → A → B, plus the Create → Archive
        // shortcut. Archive is terminal, so it belongs in
        // the last layer; the shortcut then spans two
        // layers and must bend through a waypoint rather
        // than jump straight across the canvas.
        const r = computeLayout({
            nodes: [
                lin('s', { start: true }),
                lin('a'),
                lin('b'),
                lin('z', { complete: true }),
            ],
            edges: [
                { fromId: 's', toId: 'a', labelWidth: 0 },
                { fromId: 'a', toId: 'b', labelWidth: 0 },
                { fromId: 's', toId: 'z', labelWidth: 0 },
            ],
            canvasWidth: 0, canvasHeight: 0,
        });
        const wp = r.waypoints.get(
            edgeWaypointKey('s', 'z'),
        );
        assert.ok(
            wp !== undefined && wp.length >= 1,
            'Create->Archive must route through a waypoint',
        );
    },
);

test(
    'computeLayout: a real canvas does not upscale node'
    + ' spacing beyond the natural layout (fan)',
    () => {
        // The camera (fitBoxToCanvas) fills the viewport; the
        // layout must not stretch node spacing to fill.
        const nodes = [
            lin('s', { start: true }),
            lin('a'), lin('b'), lin('c'),
            lin('z', { complete: true }),
        ];
        const edges = [
            { fromId: 's', toId: 'a', labelWidth: 0 },
            { fromId: 's', toId: 'b', labelWidth: 0 },
            { fromId: 's', toId: 'c', labelWidth: 0 },
            { fromId: 'a', toId: 'z', labelWidth: 0 },
            { fromId: 'b', toId: 'z', labelWidth: 0 },
            { fromId: 'c', toId: 'z', labelWidth: 0 },
        ];
        const big = computeLayout({
            nodes, edges,
            canvasWidth: 1400, canvasHeight: 740,
        });
        const nat = computeLayout({
            nodes, edges,
            canvasWidth: 0, canvasHeight: 0,
        });
        assert.ok(
            bboxMaxDim(big.positions)
                <= bboxMaxDim(nat.positions) + 1,
            'canvas must not stretch node spacing',
        );
    },
);

test(
    'computeLayout: a wrapped (snake) layout keeps'
    + ' comfortable spacing, not canvas-filling stretch',
    () => {
        // A long linear chain wraps into rows. The wrap
        // makes it compact; spacing within stays at the
        // natural density rather than stretching to fill.
        const nodes = [
            lin('s', { start: true }),
            lin('a'), lin('b'), lin('c'), lin('d'),
            lin('z', { complete: true }),
        ];
        const edges = [
            { fromId: 's', toId: 'a', labelWidth: 0 },
            { fromId: 'a', toId: 'b', labelWidth: 0 },
            { fromId: 'b', toId: 'c', labelWidth: 0 },
            { fromId: 'c', toId: 'd', labelWidth: 0 },
            { fromId: 'd', toId: 'z', labelWidth: 0 },
        ];
        const big = computeLayout({
            nodes, edges,
            canvasWidth: 1400, canvasHeight: 740,
        });
        const nat = computeLayout({
            nodes, edges,
            canvasWidth: 0, canvasHeight: 0,
        });
        assert.ok(
            distinctRows(big.positions) >= 2,
            'expected the chain to wrap into rows',
        );
        assert.ok(
            bboxMaxDim(big.positions)
                <= bboxMaxDim(nat.positions) + 1,
            'wrapped layout must not stretch to fill',
        );
    },
);

test(
    'computeLayout: a long chain wraps to more rows rather'
    + ' than overflowing the canvas width',
    () => {
        const nodes: ReturnType<typeof lin>[] = [
            lin('s', { start: true }),
        ];
        for (let i = 0; i < 14; i++) {
            nodes.push(lin('n' + i));
        }
        nodes.push(lin('z', { complete: true }));
        const edges: {
            fromId: string;
            toId: string;
            labelWidth: number;
        }[] = [];
        for (let i = 0; i < nodes.length - 1; i++) {
            edges.push({
                fromId: nodes[i]!.id,
                toId: nodes[i + 1]!.id,
                labelWidth: 0,
            });
        }
        const big = computeLayout({
            nodes, edges,
            canvasWidth: 1400, canvasHeight: 740,
        });
        let minX = Infinity;
        let maxX = -Infinity;
        for (const p of big.positions.values()) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
        }
        assert.ok(
            (maxX - minX) <= 1400,
            'wrapped row must fit the canvas width',
        );
    },
);

function columnOf(
    positions: Map<string, { x: number; y: number }>,
    id: string,
): string[] {
    const x = positions.get(id)!.x;
    return [...positions.entries()]
        .filter(([, p]) => Math.abs(p.x - x) < 0.5)
        .toSorted((a, b) => a[1].y - b[1].y)
        .map(([memberId]) => memberId);
}

function edge(fromId: string, toId: string) {
    return { fromId, toId, labelWidth: 0 };
}

test(
    'computeLayout: Create heads its column when an'
    + ' orphan precedes it in input order',
    () => {
        const r = computeLayout({
            nodes: [
                lin('o'),
                lin('s', { start: true }),
                lin('a'),
                lin('z', { complete: true }),
            ],
            edges: [edge('s', 'a'), edge('a', 'z')],
            canvasWidth: 0, canvasHeight: 0,
        });
        assert.equal(
            columnOf(r.positions, 's')[0], 's',
            'Create heads its column',
        );
    },
);

test(
    'computeLayout: Create heads its column beside a'
    + ' second root, and Archive ends its',
    () => {
        const r = computeLayout({
            nodes: [
                lin('r'),
                lin('s', { start: true }),
                lin('a'),
                lin('x'),
                lin('d'),
                lin('z', { complete: true }),
            ],
            edges: [
                edge('r', 'x'), edge('x', 'd'),
                edge('s', 'a'), edge('a', 'z'),
            ],
            canvasWidth: 0, canvasHeight: 0,
        });
        assert.equal(
            columnOf(r.positions, 's')[0], 's',
            'Create heads its column',
        );
        assert.equal(
            columnOf(r.positions, 'z').at(-1), 'z',
            'Archive ends its column',
        );
    },
);

test(
    'computeLayout: Archive ends its column when the'
    + ' relative mirror would fire',
    () => {
        const r = computeLayout({
            nodes: [
                lin('r'),
                lin('s', { start: true }),
                lin('x'),
                lin('a1'),
                lin('a2'),
                lin('m'),
                lin('z', { complete: true }),
            ],
            edges: [
                edge('r', 'x'), edge('x', 'm'),
                edge('s', 'a1'), edge('a1', 'z'),
                edge('s', 'a2'),
            ],
            canvasWidth: 0, canvasHeight: 0,
        });
        assert.equal(
            columnOf(r.positions, 'z').at(-1), 'z',
            'Archive ends its column under the mirror',
        );
    },
);

test(
    'computeLayout: a wrapped chain keeps Create'
    + ' leftmost past an orphan',
    () => {
        const r = computeLayout({
            nodes: [
                lin('o'),
                lin('s', { start: true }),
                lin('a'),
                lin('b'),
                lin('c'),
                lin('d'),
                lin('z', { complete: true }),
            ],
            edges: [
                edge('s', 'a'), edge('a', 'b'),
                edge('b', 'c'), edge('c', 'd'),
                edge('d', 'z'),
            ],
            canvasWidth: 1400, canvasHeight: 740,
        });
        let minX = Infinity;
        for (const p of r.positions.values()) {
            if (p.x < minX) minX = p.x;
        }
        assert.equal(
            r.positions.get('s')!.x, minX,
            'Create leads the serpentine',
        );
    },
);

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildFlowStats,
    quantile,
    clipInterval,
    type FlowStatsInput,
    type FlowStatsModel,
    type FlowPath,
} from '../web-app/app/flow-stats-aggregate.ts';
import type {
} from '../api/types.ts';
import type {
    TransitionEvent,
    StepTransition,
} from '../web-app/app/adapters/work-orders-queries.ts';

export function makeFixture(): FlowStatsInput {
    return {
        nodes: [
            { id: 'c', name: 'Create',
              positionX: 0,   positionY: 0,
              isCreate: true,  isArchive: false,
              memberIds: [],
              attributes: [], taskInstructions: '' },
            { id: 'a', name: 'Data Capture',
              positionX: 200, positionY: 0,
              isCreate: false, isArchive: false,
              memberIds: [],
              attributes: [], taskInstructions: '' },
            { id: 'b', name: 'Review',
              positionX: 400, positionY: 0,
              isCreate: false, isArchive: false,
              memberIds: [],
              attributes: [], taskInstructions: '' },
            { id: 'z', name: 'Archive',
              positionX: 600, positionY: 0,
              isCreate: false, isArchive: true,
              memberIds: [],
              attributes: [], taskInstructions: '' },
        ],
        edges: [
            { id: 'YiJPbufDpkyrZcZCYbUJpg', name: '',
              fromNodeId: 'c', toNodeId: 'a' },
            { id: 'e2', name: '',
              fromNodeId: 'a', toNodeId: 'b' },
            { id: 'e3', name: 'approve',
              fromNodeId: 'b', toNodeId: 'z' },
            { id: 'e4', name: 'revise',
              fromNodeId: 'b', toNodeId: 'a' },
        ],
        transitions: [],
        nowMs: Date.parse(
            '2026-05-10T00:00:00.000000Z',
        ),
        windowDays: 90,
        memberNameById: new Map(),
    };
}

test('quantile is linear-interpolation, p50 is true median', () => {
    assert.equal(quantile([60, 120, 180, 240, 300], 0.5), 180);
    assert.equal(quantile([60, 120, 180, 240, 300], 0.9), 276);
    assert.equal(quantile([10],                    0.5),  10);
    assert.equal(quantile([1, 3],                  0.5),   2);
});

test('quantile on empty input returns 0', () => {
    assert.equal(quantile([], 0.5), 0);
});

test('clipInterval returns overlap in seconds', () => {
    // window [10000, 100000] ms = [10s, 100s].
    assert.equal(clipInterval(50000,  80000, 10000, 100000), 30);
    assert.equal(clipInterval(0,      50000, 10000, 100000), 40);
    assert.equal(clipInterval(-100000, 200000, 10000, 100000), 90);
    assert.equal(clipInterval(0,      5000,  10000, 100000), 0);
    assert.equal(clipInterval(110000, 200000, 10000, 100000), 0);
    assert.equal(clipInterval(80000,  50000, 10000, 100000), 0);
});

test(
    'buildFlowStats returns the structural shape'
    + ' on empty input',
    () => {
        const m: FlowStatsModel =
            buildFlowStats(makeFixture());
        assert.equal(m.nodes.length, 4);
        assert.deepEqual(
            m.nodes.map(n => n.id),
            ['c', 'a', 'b', 'z'],
        );
        assert.equal(m.edges.length, 4);
        assert.equal(m.pathEntries.length, 0);
        assert.equal(
            m.completedWorkOrderCount, 0,
        );
        assert.equal(
            m.incompleteWorkOrderCount, 0,
        );
        assert.equal(m.windowDays, 90);
        assert.equal(m.droppedNodeIds.size, 0);
        assert.equal(
            m.pathsWithDroppedStepsCount, 0,
        );
    },
);

function tBefore(
    input: FlowStatsInput,
    ms: number,
): string {
    return new Date(input.nowMs - ms).toISOString();
}

test(
    'attributes sojourns and computes'
    + ' heatPct + heatT',
    () => {
        const f = makeFixture();
        const tCreated =
            tBefore(f, 3 * 3600 * 1000);
        const tEnterB =
            tBefore(f, 1 * 3600 * 1000);
        const tEnterZ = tBefore(f, 0);
        const input: FlowStatsInput = { ...f,
            transitions: [
                { id: 't0', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'creation',
                  toNodeId: 'c', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: tCreated },
                { id: 't1', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'step',
                  fromNodeId: 'c',
                  toNodeId: 'a', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: tCreated },
                { id: 't2', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'step',
                  fromNodeId: 'a',
                  toNodeId: 'b', memberId: 'prBESZPjJDiuXCeZLmbiVw',
                  at: tEnterB },
                { id: 't3', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'step',
                  fromNodeId: 'b',
                  toNodeId: 'z', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: tEnterZ },
            ],
        };
        const m = buildFlowStats(input);
        const byId = new Map(
            m.nodes.map(n => [n.id, n]),
        );
        assert.equal(
            Math.round(byId.get('a')!.heatPct),
            67,
        );
        assert.equal(
            Math.round(byId.get('b')!.heatPct),
            33,
        );
        assert.equal(byId.get('c')!.heatPct, 0);
        assert.equal(byId.get('z')!.heatPct, 0);
        assert.equal(
            byId.get('a')!.heatT.toFixed(2),
            '0.67',
        );
        assert.equal(
            byId.get('b')!.heatT.toFixed(2),
            '0.33',
        );
        assert.equal(
            m.completedWorkOrderCount, 1,
        );
        assert.equal(
            m.incompleteWorkOrderCount, 0,
        );
    },
);

test(
    'drops transitions to nodes missing'
    + ' from the current graph',
    () => {
        const f = makeFixture();
        const tCreated = tBefore(f, 60_000);
        const input: FlowStatsInput = { ...f,
            transitions: [
                { id: 't0', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'creation',
                  toNodeId: 'c', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: tCreated },
                { id: 't1', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'step',
                  fromNodeId: 'c',
                  toNodeId: 'GHOST',
                  memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at:
                      tBefore(f, 30_000) },
            ],
        };
        const m = buildFlowStats(input);
        assert.ok(m.droppedNodeIds.has('GHOST'));
        assert.equal(
            m.pathsWithDroppedStepsCount, 1,
        );
    },
);

test(
    'clips sojourns to the trailing'
    + ' 90-day window',
    () => {
        const f = makeFixture();
        const D = 24 * 3600 * 1000;
        const t100d = tBefore(f, 100 * D);
        const t10d  = tBefore(f, 10  * D);
        const input: FlowStatsInput = { ...f,
            transitions: [
                { id: 't0', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'creation',
                  toNodeId: 'c', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t100d },
                { id: 't1', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'step',
                  fromNodeId: 'c',
                  toNodeId: 'a', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t100d },
                { id: 't2', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'step',
                  fromNodeId: 'a',
                  toNodeId: 'z', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t10d },
            ],
        };
        const m = buildFlowStats(input);
        assert.equal(
            Math.round(
                m.nodes.find(n =>
                    n.id === 'a',
                )!.heatPct,
            ),
            100,
        );
    },
);

test(
    'tracks incomplete (in-flight) work orders',
    () => {
        const f = makeFixture();
        const t = tBefore(f, 60_000);
        const input: FlowStatsInput = { ...f,
            transitions: [
                { id: 't0', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'creation',
                  toNodeId: 'c', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t },
                { id: 't1', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'step',
                  fromNodeId: 'c',
                  toNodeId: 'a', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t },
            ],
        };
        const m = buildFlowStats(input);
        assert.equal(
            m.completedWorkOrderCount, 0,
        );
        assert.equal(
            m.incompleteWorkOrderCount, 1,
        );
    },
);

test(
    'per-node percentiles, visits, WIP,'
    + ' throughput, revisit',
    () => {
        const f = makeFixture();
        const t = (msAgo: number) =>
            tBefore(f, msAgo);
        const H = 3600 * 1000;
        // xdaJyuuPyHfffCGLhqDrOQ: c→a(2h)→b(1h)→z   (complete)
        // w2: c→a(4h)→b→a(1h)→b→z  (a revisited)
        // w3: c→a  (still in-flight at a)
        const input: FlowStatsInput = { ...f,
            transitions: [
                { id: '1a', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'creation',
                  toNodeId: 'c', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t(3 * H) },
                { id: '1b', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'step',
                  fromNodeId: 'c',
                  toNodeId: 'a', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t(3 * H) },
                { id: '1c', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'step',
                  fromNodeId: 'a',
                  toNodeId: 'b', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t(1 * H) },
                { id: '1d', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'step',
                  fromNodeId: 'b',
                  toNodeId: 'z', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t(0) },
                { id: '2a', workOrderId: 'w2',
                  kind: 'creation',
                  toNodeId: 'c', memberId: 'prBESZPjJDiuXCeZLmbiVw',
                  at: t(6 * H) },
                { id: '2b', workOrderId: 'w2',
                  kind: 'step',
                  fromNodeId: 'c',
                  toNodeId: 'a', memberId: 'prBESZPjJDiuXCeZLmbiVw',
                  at: t(6 * H) },
                { id: '2c', workOrderId: 'w2',
                  kind: 'step',
                  fromNodeId: 'a',
                  toNodeId: 'b', memberId: 'prBESZPjJDiuXCeZLmbiVw',
                  at: t(2 * H) },
                { id: '2d', workOrderId: 'w2',
                  kind: 'step',
                  fromNodeId: 'b',
                  toNodeId: 'a', memberId: 'prBESZPjJDiuXCeZLmbiVw',
                  at: t(2 * H) },
                { id: '2e', workOrderId: 'w2',
                  kind: 'step',
                  fromNodeId: 'a',
                  toNodeId: 'b', memberId: 'prBESZPjJDiuXCeZLmbiVw',
                  at: t(1 * H) },
                { id: '2f', workOrderId: 'w2',
                  kind: 'step',
                  fromNodeId: 'b',
                  toNodeId: 'z', memberId: 'prBESZPjJDiuXCeZLmbiVw',
                  at: t(0) },
                { id: '3a', workOrderId: 'w3',
                  kind: 'creation',
                  toNodeId: 'c', memberId: 'psEaaErZDHeKCbdAnrwbDQ',
                  at: t(1 * H) },
                { id: '3b', workOrderId: 'w3',
                  kind: 'step',
                  fromNodeId: 'c',
                  toNodeId: 'a', memberId: 'psEaaErZDHeKCbdAnrwbDQ',
                  at: t(1 * H) },
            ],
        };
        const m = buildFlowStats(input);
        const a = m.nodes.find(n => n.id === 'a')!;
        const b = m.nodes.find(n => n.id === 'b')!;
        // a visits: xdaJyuuPyHfffCGLhqDrOQ×1 + w2×2 + w3×1 = 4
        assert.equal(a.visitsInWindow, 4);
        assert.equal(a.distinctWorkOrders, 3);
        assert.equal(a.currentlyHere, 1);
        // revisits: w2's 2nd visit → AjdvjuECVZEgZoFajaIEkg/4 = 25%
        assert.equal(a.revisitRatePct, 25);
        // throughput: 4 / (90/7) ≈ 0.31
        assert.equal(
            a.throughputPerWeek.toFixed(2), '0.31',
        );
        assert.equal(b.visitsInWindow, 3);
        assert.equal(b.currentlyHere, 0);
        // a sojourns sorted: [3600, 3600, 7200, 14400]
        // avg 7200, median (q*(n-1)=1.5 between
        // idx1=3600 and idx2=7200) = 5400,
        // p90 (idx=2.7 → 7200+0.7*(14400-7200) = 12240)
        assert.equal(a.avgSeconds,    7200);
        assert.equal(a.medianSeconds, 5400);
        assert.equal(a.p90Seconds,    12240);
    },
);

test(
    'resolves clan from memberIds, identifies'
    + ' top producer + vsClanAvg + share',
    () => {
        const f = makeFixture();
        const nodes = f.nodes.map(n =>
            n.id === 'a'
                ? {
                    ...n,
                    memberIds: ['pnXmXrxOWayANgDLdCjuBw'
                        , 'prBESZPjJDiuXCeZLmbiVw', 'psEaaErZDHeKCbdAnrwbDQ'],
                }
                : n);
        const t = (msAgo: number) => tBefore(f, msAgo);
        const H = 3600 * 1000;
        // 4 OUT-transitions from a: pnXmXrxOWayANgDLdCjuBw×3,
        // prBESZPjJDiuXCeZLmbiVw×1.
        // psEaaErZDHeKCbdAnrwbDQ in clan but inactive.
        const input: FlowStatsInput = { ...f, nodes,
            transitions: [
                { id: 'in0', workOrderId: 'w',
                  kind: 'creation',
                  toNodeId: 'c', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t(10 * H) },
                { id: 'in1', workOrderId: 'w',
                  kind: 'step',
                  fromNodeId: 'c',
                  toNodeId: 'a', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t(10 * H) },
                { id: 'ohqxgUBEaFQwYbXsonRPmg', workOrderId: 'w',
                  kind: 'step',
                  fromNodeId: 'a',
                  toNodeId: 'b', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t(9 * H) },
                { id: 'rOEPOcVMQdJiiiMuiiEhlg', workOrderId: 'w',
                  kind: 'step',
                  fromNodeId: 'b',
                  toNodeId: 'a', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t(8 * H) },
                { id: 'o2', workOrderId: 'w',
                  kind: 'step',
                  fromNodeId: 'a',
                  toNodeId: 'b', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t(7 * H) },
                { id: 'r2', workOrderId: 'w',
                  kind: 'step',
                  fromNodeId: 'b',
                  toNodeId: 'a', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t(6 * H) },
                { id: 'o3', workOrderId: 'w',
                  kind: 'step',
                  fromNodeId: 'a',
                  toNodeId: 'b', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t(5 * H) },
                { id: 'r3', workOrderId: 'w',
                  kind: 'step',
                  fromNodeId: 'b',
                  toNodeId: 'a', memberId: 'prBESZPjJDiuXCeZLmbiVw',
                  at: t(4 * H) },
                { id: 'o4', workOrderId: 'w',
                  kind: 'step',
                  fromNodeId: 'a',
                  toNodeId: 'b', memberId: 'prBESZPjJDiuXCeZLmbiVw',
                  at: t(3 * H) },
                { id: 'fin', workOrderId: 'w',
                  kind: 'step',
                  fromNodeId: 'b',
                  toNodeId: 'z', memberId: 'prBESZPjJDiuXCeZLmbiVw',
                  at: t(0) },
            ],
            memberNameById: new Map([
                ['pnXmXrxOWayANgDLdCjuBw', 'Alex'],
                ['prBESZPjJDiuXCeZLmbiVw', 'Bea'],
                ['psEaaErZDHeKCbdAnrwbDQ', 'Cy'],
            ]),
        };
        const m = buildFlowStats(input);
        const a = m.nodes.find(n => n.id === 'a')!;
        assert.equal(a.clanSize, 3);
        assert.equal(a.activeProducerCount, 2);
        assert.equal(
            a.assignmentLabel, 'Alex, Bea, Cy',
        );
        assert.ok(a.topProducer);
        assert.equal(a.topProducer!.name, 'Alex');
        assert.equal(a.topProducer!.sharePct, 75);
        assert.equal(a.topProducer!.vsClanAvgPct, 225);
        assert.equal(a.topProducer!.inCurrentClan, true);
    },
);

test(
    'top producer outside the current clan'
    + ' is flagged',
    () => {
        const f = makeFixture();
        const nodes = f.nodes.map(n =>
            n.id === 'a'
                ? { ...n, memberIds: ['pnXmXrxOWayANgDLdCjuBw'] }
                : n);
        const t = (msAgo: number) => tBefore(f, msAgo);
        const H = 3600 * 1000;
        const input: FlowStatsInput = { ...f, nodes,
            transitions: [
                { id: 'AjdvjuECVZEgZoFajaIEkg', workOrderId: 'w',
                  kind: 'creation',
                  toNodeId: 'c', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t(2 * H) },
                { id: 'BBjWJsjYIDkTRKIIPrzWRw', workOrderId: 'w',
                  kind: 'step',
                  fromNodeId: 'c',
                  toNodeId: 'a', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: t(2 * H) },
                { id: '3', workOrderId: 'w',
                  kind: 'step',
                  fromNodeId: 'a',
                  toNodeId: 'z', memberId: 'psZcIMMgiSomMHzDxcUnYQ',
                  at: t(0) },
            ],
            memberNameById: new Map([
                ['pnXmXrxOWayANgDLdCjuBw', 'Alex'],
                ['psZcIMMgiSomMHzDxcUnYQ', 'Zed'],
            ]),
        };
        const m = buildFlowStats(input);
        const a = m.nodes.find(n => n.id === 'a')!;
        assert.equal(a.topProducer!.name, 'Zed');
        assert.equal(
            a.topProducer!.inCurrentClan, false,
        );
    },
);

test(
    'unassigned node has clan size 0 and label'
    + ' "Unassigned"',
    () => {
        const m = buildFlowStats(makeFixture());
        const a = m.nodes.find(n => n.id === 'a')!;
        assert.equal(a.clanSize, 0);
        assert.equal(a.assignmentLabel, 'Unassigned');
    },
);

test(
    'branch split distributes outgoing transitions'
    + ' across edges',
    () => {
        const f = makeFixture();
        const t = (msAgo: number) => tBefore(f, msAgo);
        const H = 3600 * 1000;
        // b has two outgoing edges (e3 approve→z,
        // e4 revise→a).  8 OUT from b: 6 to z, 2 to a.
        const enters: StepTransition[] = Array.from(
            { length: 8 },
            (_, i) => ({
                id:'in'+i, workOrderId:'w'+i,
                kind: 'step',
                fromNodeId:'a', toNodeId:'b',
                memberId:'pnXmXrxOWayANgDLdCjuBw',
                at:t((20-i) * H),
            }),
        );
        const outs: StepTransition[] = [
            { id:'ohqxgUBEaFQwYbXsonRPmg', workOrderId:'w0',
              kind: 'step',
              fromNodeId:'b',
              toNodeId:'z', memberId:'pnXmXrxOWayANgDLdCjuBw',
              at:t(0) },
            { id:'o2', workOrderId:'xdaJyuuPyHfffCGLhqDrOQ',
              kind: 'step',
              fromNodeId:'b',
              toNodeId:'z', memberId:'pnXmXrxOWayANgDLdCjuBw',
              at:t(1*H) },
            { id:'o3', workOrderId:'w2',
              kind: 'step',
              fromNodeId:'b',
              toNodeId:'z', memberId:'pnXmXrxOWayANgDLdCjuBw',
              at:t(2*H) },
            { id:'o4', workOrderId:'w3',
              kind: 'step',
              fromNodeId:'b',
              toNodeId:'z', memberId:'pnXmXrxOWayANgDLdCjuBw',
              at:t(3*H) },
            { id:'o5', workOrderId:'w4',
              kind: 'step',
              fromNodeId:'b',
              toNodeId:'z', memberId:'pnXmXrxOWayANgDLdCjuBw',
              at:t(4*H) },
            { id:'o6', workOrderId:'w5',
              kind: 'step',
              fromNodeId:'b',
              toNodeId:'z', memberId:'pnXmXrxOWayANgDLdCjuBw',
              at:t(5*H) },
            { id:'o7', workOrderId:'w6',
              kind: 'step',
              fromNodeId:'b',
              toNodeId:'a', memberId:'pnXmXrxOWayANgDLdCjuBw',
              at:t(6*H) },
            { id:'o8', workOrderId:'w7',
              kind: 'step',
              fromNodeId:'b',
              toNodeId:'a', memberId:'pnXmXrxOWayANgDLdCjuBw',
              at:t(7*H) },
        ];
        const input: FlowStatsInput = { ...f,
            transitions: [...enters, ...outs],
        };
        const m = buildFlowStats(input);
        const b = m.nodes.find(n => n.id === 'b')!;
        assert.equal(b.branchSplit.length, 2);
        assert.equal(
            b.branchSplit[0]!.label, 'approve',
        );
        assert.equal(b.branchSplit[0]!.pct, 75);
        assert.equal(
            b.branchSplit[1]!.label, 'revise',
        );
        assert.equal(b.branchSplit[1]!.pct, 25);
    },
);

test(
    'branchSplit empty on linear (single-out) nodes',
    () => {
        const m = buildFlowStats(makeFixture());
        assert.equal(
            m.nodes.find(n => n.id === 'a')!
                .branchSplit.length,
            0,
        );
    },
);

test(
    'memberHazard is danger on zero-member'
    + ' regular nodes (per shouldShowMemberHazard)',
    () => {
        const m = buildFlowStats(makeFixture());
        assert.equal(
            m.nodes.find(n => n.id === 'a')!
                .memberHazard,
            'danger',
        );
        assert.equal(
            m.nodes.find(n => n.id === 'b')!
                .memberHazard,
            'danger',
        );
        // start and complete nodes never hazard
        assert.equal(
            m.nodes.find(n => n.id === 'c')!
                .memberHazard,
            null,
        );
        assert.equal(
            m.nodes.find(n => n.id === 'z')!
                .memberHazard,
            null,
        );
    },
);

test(
    'memberHazard is warning on single-member'
    + ' regular nodes with outgoing edges',
    () => {
        const f = makeFixture();
        const nodes = f.nodes.map(n =>
            n.id === 'a' || n.id === 'b'
                ? { ...n, memberIds: ['hw_1'] }
                : n);
        const m = buildFlowStats({ ...f, nodes });
        assert.equal(
            m.nodes.find(n => n.id === 'a')!
                .memberHazard,
            'warning',
        );
        assert.equal(
            m.nodes.find(n => n.id === 'b')!
                .memberHazard,
            'warning',
        );
    },
);

test(
    'memberHazard is null on multi-member regular'
    + ' nodes with outgoing edges',
    () => {
        const f = makeFixture();
        const nodes = f.nodes.map(n =>
            n.id === 'a' || n.id === 'b'
                ? {
                    ...n,
                    memberIds: ['hw_1', 'hw_2'],
                }
                : n);
        const m = buildFlowStats({ ...f, nodes });
        assert.equal(
            m.nodes.find(n => n.id === 'a')!
                .memberHazard,
            null,
        );
        assert.equal(
            m.nodes.find(n => n.id === 'b')!
                .memberHazard,
            null,
        );
    },
);

test(
    'groups completed paths and sorts by frequency'
    + ' desc',
    () => {
        const f = makeFixture();
        const t = (msAgo: number) => tBefore(f, msAgo);
        const H = 3600 * 1000;
        function happyTrans(
            woId: string, startMs: number,
        ): TransitionEvent[] {
            return [
                { id:woId+'A', workOrderId:woId,
                  kind: 'creation',
                  toNodeId:'c', memberId:'pnXmXrxOWayANgDLdCjuBw',
                  at:t(startMs) },
                { id:woId+'B', workOrderId:woId,
                  kind: 'step',
                  fromNodeId:'c',
                  toNodeId:'a', memberId:'pnXmXrxOWayANgDLdCjuBw',
                  at:t(startMs) },
                { id:woId+'C', workOrderId:woId,
                  kind: 'step',
                  fromNodeId:'a',
                  toNodeId:'b', memberId:'pnXmXrxOWayANgDLdCjuBw',
                  at:t(startMs - 1*H) },
                { id:woId+'D', workOrderId:woId,
                  kind: 'step',
                  fromNodeId:'b',
                  toNodeId:'z', memberId:'pnXmXrxOWayANgDLdCjuBw',
                  at:t(startMs - 2*H) },
            ];
        }
        const loopTrans: TransitionEvent[] = [
            { id:'lA', workOrderId:'wl',
              kind: 'creation',
              toNodeId:'c', memberId:'pnXmXrxOWayANgDLdCjuBw',
              at:t(10*H) },
            { id:'lB', workOrderId:'wl',
              kind: 'step',
              fromNodeId:'c',
              toNodeId:'a', memberId:'pnXmXrxOWayANgDLdCjuBw',
              at:t(10*H) },
            { id:'lC', workOrderId:'wl',
              kind: 'step',
              fromNodeId:'a',
              toNodeId:'b', memberId:'pnXmXrxOWayANgDLdCjuBw',
              at:t(9*H) },
            { id:'lD', workOrderId:'wl',
              kind: 'step',
              fromNodeId:'b',
              toNodeId:'a', memberId:'pnXmXrxOWayANgDLdCjuBw',
              at:t(8*H) },
            { id:'lE', workOrderId:'wl',
              kind: 'step',
              fromNodeId:'a',
              toNodeId:'b', memberId:'pnXmXrxOWayANgDLdCjuBw',
              at:t(7*H) },
            { id:'lF', workOrderId:'wl',
              kind: 'step',
              fromNodeId:'b',
              toNodeId:'z', memberId:'pnXmXrxOWayANgDLdCjuBw',
              at:t(6*H) },
        ];
        const input: FlowStatsInput = { ...f,
            transitions: [
                ...happyTrans('xdaJyuuPyHfffCGLhqDrOQ', 10 * H),
                ...happyTrans('w2',  9 * H),
                ...happyTrans('w3',  8 * H),
                ...loopTrans,
            ],
        };
        const m = buildFlowStats(input);
        assert.equal(m.pathEntries.length, 2);
        const top = m.pathEntries[0]! as
            { kind: 'path'; path: FlowPath };
        assert.deepEqual(
            top.path.nodeIds, ['c','a','b','z'],
        );
        assert.equal(top.path.workOrderCount, 3);
        assert.equal(top.path.sharePct, 75);
        assert.deepEqual(
            top.path.edgeIds, ['YiJPbufDpkyrZcZCYbUJpg','e2','e3'],
        );
        const second = m.pathEntries[1]! as
            { kind: 'path'; path: FlowPath };
        assert.deepEqual(
            second.path.nodeIds,
            ['c','a','b','a','b','z'],
        );
        assert.equal(second.path.workOrderCount, 1);
        assert.equal(second.path.sharePct, 25);
    },
);

test('collapses long tail into a rest bucket', () => {
    const f = makeFixture();
    const t = (msAgo: number) => tBefore(f, msAgo);
    const H = 3600 * 1000;
    const transitions: TransitionEvent[] = [];
    for (let i = 0; i < 10; i++) {
        const woId = 'w' + i;
        let step = 0;
        let nowAgoH = 50;
        const push = (
            from: string | null, to: string,
        ) => {
            const base = {
                id: woId + '-' + (step++),
                workOrderId: woId,
                toNodeId: to,
                memberId: 'pnXmXrxOWayANgDLdCjuBw',
                at: t(nowAgoH-- * H),
            };
            transitions.push(from === null
                ? { kind: 'creation', ...base }
                : {
                    kind: 'step',
                    fromNodeId: from,
                    ...base,
                });
        };
        push(null, 'c');
        push('c', 'a');
        for (let k = 0; k < i; k++) {
            push('a', 'b');
            push('b', 'a');
        }
        push('a', 'b');
        push('b', 'z');
    }
    const m = buildFlowStats({ ...f, transitions });
    assert.equal(m.pathEntries.length, 9);
    assert.equal(m.pathEntries[8]!.kind, 'rest');
    const rest = m.pathEntries[8]! as
        { kind:'rest'; count:number;
          combinedSharePct:number };
    assert.equal(rest.count, 2);
    assert.equal(rest.combinedSharePct, 20);
});

test(
    'an out-of-order Archive is here-now at the later node',
    () => {
        const f = makeFixture();
        const tied = tBefore(f, 30_000);
        const input: FlowStatsInput = { ...f,
            transitions: [
                { id: 't0', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'creation',
                  toNodeId: 'c', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: tBefore(f, 90_000) },
                { id: 't1', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'step',
                  fromNodeId: 'c',
                  toNodeId: 'a', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: tBefore(f, 60_000) },
                { id: 't2', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'step',
                  fromNodeId: 'a',
                  toNodeId: 'z', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: tied },
                { id: 't3', workOrderId: 'xdaJyuuPyHfffCGLhqDrOQ',
                  kind: 'step',
                  fromNodeId: 'z',
                  toNodeId: 'b', memberId: 'pnXmXrxOWayANgDLdCjuBw',
                  at: tied },
            ],
        };
        const m = buildFlowStats(input);
        assert.equal(m.completedWorkOrderCount, 0);
        assert.equal(m.incompleteWorkOrderCount, 1);
        assert.equal(
            m.nodes.find(n => n.id === 'b')!.currentlyHere,
            1,
        );
    },
);

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HistoryLine as CoreHistoryLine } from
    '../web-app/app/measure-core.ts';
import {
    formatDurationPerf,
    pickAxisUnit,
    formatAxisTick,
    parseHistoryJsonl,
    parseBudgetsJson,
    budgetRatio,
    deltaReadyMs,
    phaseBucketFor,
    residualPageInitMs,
    rollupPhases,
    pageKeysUnion,
    rankPages,
    buildPayload,
    trendLabelIndices,
    pageKeySet,
    dominantPageKeySet,
    filterFullRegistrySweeps,
    meanReadyMs,
    systemReadySeries,
    systemDeltaMs,
    budgetPressure,
    meanPhaseBuckets,
    systemMetrics,
    MEASURE_BOOT_PAGE_INIT,
    VIZ_PAYLOAD_VERSION,
} from '../web-app/app/measure-viz-core.ts';

// --- fixtures ---

function sampleSweep(
    at: string,
    pages: CoreHistoryLine['pages'],
): CoreHistoryLine {
    return {
        at,
        sha: 'deadbeef',
        machine: {
            platform: 'test',
            arch: 'x64',
            cpuModel: 'test-cpu',
            cpuCount: 1,
        },
        runs: 5,
        pages,
    };
}

// --- formatDurationPerf ---

test('formatDurationPerf sub-ms as integer µs', () => {
    assert.equal(formatDurationPerf(0.4), '400 µs');
    assert.equal(formatDurationPerf(0), '0 µs');
    assert.equal(formatDurationPerf(0.001), '1 µs');
});

test('formatDurationPerf ms range', () => {
    assert.equal(formatDurationPerf(245), '245 ms');
    assert.equal(formatDurationPerf(1), '1 ms');
    assert.equal(formatDurationPerf(1.5), '1.5 ms');
    assert.equal(formatDurationPerf(999.4), '999.4 ms');
});

test('formatDurationPerf seconds range', () => {
    assert.equal(formatDurationPerf(1000), '1 s');
    assert.equal(formatDurationPerf(3280), '3.28 s');
    assert.equal(formatDurationPerf(3282.75), '3.28 s');
});

test('formatDurationPerf signed option', () => {
    assert.equal(
        formatDurationPerf(990, { signed: true }),
        '+990 ms',
    );
    assert.equal(
        formatDurationPerf(-12, { signed: true }),
        '−12 ms',
    );
    assert.equal(
        formatDurationPerf(-0.4, { signed: true }),
        '−400 µs',
    );
    assert.equal(
        formatDurationPerf(1500, { signed: true }),
        '+1.5 s',
    );
});

test('formatDurationPerf absolute negatives', () => {
    assert.equal(formatDurationPerf(12), '12 ms');
    assert.equal(formatDurationPerf(-12), '−12 ms');
});

// --- pickAxisUnit / formatAxisTick ---

test('pickAxisUnit from max abs', () => {
    assert.equal(pickAxisUnit([0.1, 0.4]), 'us');
    assert.equal(pickAxisUnit([1, 500]), 'ms');
    assert.equal(pickAxisUnit([1000, 50]), 's');
    assert.equal(pickAxisUnit([]), 'us');
});

test('formatAxisTick respects unit', () => {
    assert.equal(formatAxisTick(0.4, 'us'), '400 µs');
    assert.equal(formatAxisTick(245, 'ms'), '245 ms');
    assert.equal(formatAxisTick(3280, 's'), '3.28 s');
});

// --- parseHistoryJsonl ---

test('parseHistoryJsonl happy two lines', () => {
    const a = sampleSweep('2026-01-01T00:00:00.000Z', {
        dashboard: { readyMs: 100, phases: {} },
    });
    const b = sampleSweep('2026-01-02T00:00:00.000Z', {
        dashboard: { readyMs: 200, phases: {} },
    });
    const text =
        `${JSON.stringify(a)}\n${JSON.stringify(b)}\n`;
    const lines = parseHistoryJsonl(text);
    assert.equal(lines.length, 2);
    assert.equal(lines[0]!.at, a.at);
    assert.equal(lines[1]!.pages.dashboard!.readyMs, 200);
});

test('parseHistoryJsonl skips blank lines', () => {
    const a = sampleSweep('2026-01-01T00:00:00.000Z', {
        ideas: { readyMs: 50, phases: {} },
    });
    const text =
        `\n${JSON.stringify(a)}\n\n`;
    const lines = parseHistoryJsonl(text);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.at, a.at);
});

test('parseHistoryJsonl empty throws', () => {
    assert.throws(
        () => parseHistoryJsonl(''),
        /no valid lines/i,
    );
    assert.throws(
        () => parseHistoryJsonl('\n\n'),
        /no valid lines/i,
    );
});

test('parseHistoryJsonl bad line includes line number', () => {
    const a = sampleSweep('2026-01-01T00:00:00.000Z', {
        dashboard: { readyMs: 1, phases: {} },
    });
    const text =
        `${JSON.stringify(a)}\n{not-json}\n`;
    assert.throws(
        () => parseHistoryJsonl(text),
        /line 2/i,
    );
});

// --- parseBudgetsJson ---

test('parseBudgetsJson happy', () => {
    const text = JSON.stringify({
        dashboard: { readyMs: 200 },
        ideas: { readyMs: 150 },
    });
    const budgets = parseBudgetsJson(text);
    assert.deepEqual(budgets, {
        dashboard: { readyMs: 200 },
        ideas: { readyMs: 150 },
    });
});

test('parseBudgetsJson bad JSON throws budget', () => {
    assert.throws(
        () => parseBudgetsJson('{not'),
        /budget/i,
    );
});

// --- budgetRatio / deltaReadyMs ---

test('budgetRatio is ready over budget', () => {
    assert.equal(budgetRatio(150, 200), 0.75);
    assert.equal(budgetRatio(300, 200), 1.5);
});

test('deltaReadyMs subtracts from from to', () => {
    assert.equal(deltaReadyMs(100, 250), 150);
    assert.equal(deltaReadyMs(200, 150), -50);
});

test('deltaReadyMs null when either missing', () => {
    assert.equal(deltaReadyMs(undefined, 100), null);
    assert.equal(deltaReadyMs(100, undefined), null);
    assert.equal(
        deltaReadyMs(undefined, undefined),
        null,
    );
});

// --- phaseBucketFor / rollupPhases ---

test('phaseBucketFor by prefix', () => {
    assert.equal(
        phaseBucketFor('boot:db-open'),
        'boot',
    );
    assert.equal(
        phaseBucketFor('fetch:ideas'),
        'fetch',
    );
    assert.equal(
        phaseBucketFor('render:paint'),
        'render',
    );
    assert.equal(
        phaseBucketFor('custom:x'),
        'other',
    );
});

test('rollupPhases sums buckets; lists present only', () => {
    const rollup = rollupPhases({
        'boot:db-open': 10,
        'fetch:list': 40,
        'render:paint': 20,
        'misc:extra': 5,
    });
    assert.deepEqual(rollup.buckets, {
        boot: 10,
        fetch: 40,
        render: 20,
        other: 5,
    });
    assert.equal(rollup.phases.length, 4);
    // Longest duration first.
    assert.deepEqual(
        rollup.phases.map((p) => p.name),
        [
            'fetch:list',
            'render:paint',
            'boot:db-open',
            'misc:extra',
        ],
    );
    assert.equal(rollup.phases[0]!.bucket, 'fetch');
    assert.equal(rollup.phases[0]!.ms, 40);
    assert.equal(rollup.phases[3]!.bucket, 'other');
});

test('residualPageInitMs subtracts nested fetch/render', () => {
    assert.equal(
        residualPageInitMs({
            [MEASURE_BOOT_PAGE_INIT]: 1000,
            'fetch:a': 400,
            'fetch:b': 300,
            'render:a': 50,
            'boot:sidebar-chrome': 600,
        }),
        250,
    );
    assert.equal(
        residualPageInitMs({
            'boot:db-open': 10,
        }),
        undefined,
    );
    // Nested sum may exceed page-init → floor 0.
    assert.equal(
        residualPageInitMs({
            [MEASURE_BOOT_PAGE_INIT]: 100,
            'fetch:a': 80,
            'fetch:b': 80,
        }),
        0,
    );
});

test('rollupPhases uses residual page-init (no double-count)', () => {
    const rollup = rollupPhases({
        [MEASURE_BOOT_PAGE_INIT]: 1000,
        'boot:sidebar-chrome': 600,
        'fetch:list': 700,
        'render:list': 50,
    });
    // boot = sidebar 600 + residual (1000-700-50)=250
    assert.deepEqual(rollup.buckets, {
        boot: 850,
        fetch: 700,
        render: 50,
        other: 0,
    });
    const pageInit = rollup.phases.find(
        (p) => p.name === MEASURE_BOOT_PAGE_INIT,
    );
    assert.equal(pageInit!.ms, 250);
    // Residual ranks below nested fetch, not as 1000.
    assert.equal(
        rollup.phases[0]!.name,
        'fetch:list',
    );
});

test('rollupPhases ties break by name', () => {
    const rollup = rollupPhases({
        'boot:b': 10,
        'boot:a': 10,
        'fetch:x': 20,
    });
    assert.deepEqual(
        rollup.phases.map((p) => p.name),
        ['fetch:x', 'boot:a', 'boot:b'],
    );
});

test('rollupPhases empty phases', () => {
    const rollup = rollupPhases({});
    assert.deepEqual(rollup.buckets, {
        boot: 0,
        fetch: 0,
        render: 0,
        other: 0,
    });
    assert.deepEqual(rollup.phases, []);
});

// --- pageKeysUnion / rankPages ---

test('pageKeysUnion sorted unique across sweeps', () => {
    const sweeps = [
        sampleSweep('a', {
            slow: { readyMs: 100, phases: {} },
            fast: { readyMs: 50, phases: {} },
        }),
        sampleSweep('b', {
            mid: { readyMs: 150, phases: {} },
            fast: { readyMs: 40, phases: {} },
        }),
    ];
    assert.deepEqual(
        pageKeysUnion(sweeps),
        ['fast', 'mid', 'slow'],
    );
});

test('rankPages ready / delta / budget with two sweeps', () => {
    const sweeps = [
        sampleSweep('a', {
            slow: { readyMs: 100, phases: {} },
            fast: { readyMs: 50, phases: {} },
        }),
        sampleSweep('b', {
            slow: { readyMs: 300, phases: {} },
            fast: { readyMs: 40, phases: {} },
            mid: { readyMs: 150, phases: {} },
        }),
    ];
    const budgets = {
        slow: { readyMs: 200 },
        fast: { readyMs: 100 },
    };

    const byReady = rankPages(
        sweeps, budgets, 0, 1, 'ready',
    );
    assert.deepEqual(
        byReady.map((e) => e.page),
        ['slow', 'mid', 'fast'],
    );
    assert.equal(byReady[0]!.readyMs, 300);
    assert.equal(byReady[1]!.readyMs, 150);
    assert.equal(byReady[2]!.readyMs, 40);

    const byDelta = rankPages(
        sweeps, budgets, 0, 1, 'delta',
    );
    assert.deepEqual(
        byDelta.map((e) => e.page),
        ['slow', 'fast', 'mid'],
    );
    assert.equal(byDelta[0]!.deltaMs, 200);
    assert.equal(byDelta[1]!.deltaMs, -10);
    assert.equal(byDelta[2]!.deltaMs, null);

    const byBudget = rankPages(
        sweeps, budgets, 0, 1, 'budget',
    );
    assert.deepEqual(
        byBudget.map((e) => e.page),
        ['slow', 'fast', 'mid'],
    );
    assert.equal(byBudget[0]!.budgetPct, 1.5);
    assert.equal(byBudget[1]!.budgetPct, 0.4);
    assert.equal(byBudget[2]!.budgetPct, null);
});

test('rankPages single sweep delta is null', () => {
    const sweeps = [
        sampleSweep('only', {
            dashboard: { readyMs: 100, phases: {} },
        }),
    ];
    const ranked = rankPages(
        sweeps, {}, 0, 0, 'delta',
    );
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]!.deltaMs, null);
    assert.equal(ranked[0]!.readyMs, 100);
});

// --- buildPayload ---

test('buildPayload version and compareDefault', () => {
    const sweeps = [
        sampleSweep('a', {
            dashboard: { readyMs: 1, phases: {} },
        }),
        sampleSweep('b', {
            dashboard: { readyMs: 2, phases: {} },
        }),
    ];
    const budgets = {
        dashboard: { readyMs: 10 },
    };
    const payload = buildPayload(
        sweeps,
        budgets,
        '2026-07-12T00:00:00.000Z',
    );
    assert.equal(payload.version, VIZ_PAYLOAD_VERSION);
    assert.equal(payload.version, 1);
    assert.equal(
        payload.generatedAt,
        '2026-07-12T00:00:00.000Z',
    );
    assert.deepEqual(payload.compareDefault, {
        fromIndex: 0,
        toIndex: 1,
    });
    assert.equal(payload.sweeps, sweeps);
    assert.equal(payload.budgets, budgets);
});

test('buildPayload empty sweeps throws', () => {
    assert.throws(
        () => buildPayload(
            [],
            {},
            '2026-07-12T00:00:00.000Z',
        ),
        /no sweeps/i,
    );
});

// --- trendLabelIndices ---

test('trendLabelIndices labels samples only', () => {
    // 9 sweeps; page present on all but 6 and 7
    const page = 'not-found';
    const sweeps: CoreHistoryLine[] = [];
    for (let i = 0; i < 9; i++) {
        if (i === 6 || i === 7) {
            sweeps.push(sampleSweep(`t${i}`, {
                other: { readyMs: 1, phases: {} },
            }));
        } else {
            sweeps.push(sampleSweep(`t${i}`, {
                [page]: {
                    readyMs: 100 + i,
                    phases: {},
                },
            }));
        }
    }
    const labels = trendLabelIndices(
        sweeps, page, 0, 8, 20,
    );
    assert.deepEqual(
        labels,
        [0, 1, 2, 3, 4, 5, 8],
    );
    assert.ok(!labels.includes(6));
    assert.ok(!labels.includes(7));
});

test('trendLabelIndices always keeps first/last sample', () => {
    const page = 'dashboard';
    const sweeps: CoreHistoryLine[] = [];
    for (let i = 0; i < 20; i++) {
        sweeps.push(sampleSweep(`t${i}`, {
            [page]: { readyMs: 100, phases: {} },
        }));
    }
    const labels = trendLabelIndices(
        sweeps, page, 0, 19, 3,
    );
    assert.ok(labels.length <= 3);
    assert.equal(labels[0], 0);
    assert.equal(labels[labels.length - 1], 19);
    assert.ok(labels.includes(0));
    assert.ok(labels.includes(19));
});

test('trendLabelIndices includes from/to only if sampled', () => {
    // fromIndex=6 page missing → not forced
    // toIndex=8 present → included
    const page = 'not-found';
    const sweeps: CoreHistoryLine[] = [];
    for (let i = 0; i < 9; i++) {
        if (i === 6 || i === 7) {
            sweeps.push(sampleSweep(`t${i}`, {}));
        } else {
            sweeps.push(sampleSweep(`t${i}`, {
                [page]: {
                    readyMs: 100,
                    phases: {},
                },
            }));
        }
    }
    const labels = trendLabelIndices(
        sweeps, page, 6, 8, 3,
    );
    assert.ok(!labels.includes(6));
    assert.ok(labels.includes(8));
});

test('trendLabelIndices thins among candidates only', () => {
    const page = 'dashboard';
    const sweeps: CoreHistoryLine[] = [];
    for (let i = 0; i < 9; i++) {
        sweeps.push(sampleSweep(`t${i}`, {
            [page]: { readyMs: 100, phases: {} },
        }));
    }
    const labels = trendLabelIndices(
        sweeps, page, 0, 8, 5,
    );
    assert.ok(labels.length <= 5);
    for (const i of labels) {
        assert.ok(
            sweeps[i]?.pages[page] !== undefined,
            `index ${i} must have page sample`,
        );
    }
    // sorted ascending unique
    for (let j = 1; j < labels.length; j++) {
        assert.ok(labels[j]! > labels[j - 1]!);
    }
});

test('not-found shaped fixture labels the peak', () => {
    // Production-like: page on 0-5 and 8; missing 6,7
    // idx 5 is the peak and must be labeled when present
    const page = 'not-found';
    const ready: Array<number | undefined> = [
        100, 110, 120, 130, 140, 500,
        undefined, undefined, 150,
    ];
    const sweeps = ready.map((ms, i) => {
        if (ms === undefined) {
            return sampleSweep(`t${i}`, {
                other: { readyMs: 1, phases: {} },
            });
        }
        return sampleSweep(`t${i}`, {
            [page]: { readyMs: ms, phases: {} },
        });
    });
    const labels = trendLabelIndices(
        sweeps, page, 0, 8, 8,
    );
    assert.ok(
        labels.includes(5),
        'peak idx 5 labeled when it has data',
    );
    assert.ok(
        !labels.includes(6),
        'idx 6 must not be labeled for not-found',
    );
    assert.ok(!labels.includes(7));
});

// --- page-set / surgery helpers ---

test('pageKeySet returns sorted keys', () => {
    const s = sampleSweep('t', {
        zebra: { readyMs: 1, phases: {} },
        alpha: { readyMs: 2, phases: {} },
    });
    assert.deepEqual(pageKeySet(s), ['alpha', 'zebra']);
});

test('dominantPageKeySet picks mode by frequency', () => {
    const full = {
        a: { readyMs: 1, phases: {} },
        b: { readyMs: 2, phases: {} },
    };
    const partial = {
        a: { readyMs: 1, phases: {} },
    };
    const sweeps = [
        sampleSweep('t0', full),
        sampleSweep('t1', full),
        sampleSweep('t2', partial),
    ];
    assert.deepEqual(
        dominantPageKeySet(sweeps),
        ['a', 'b'],
    );
});

test('filterFullRegistrySweeps drops unequal sets', () => {
    const keys = ['a', 'b'];
    const full = {
        a: { readyMs: 10, phases: {} },
        b: { readyMs: 20, phases: {} },
    };
    const partial = {
        a: { readyMs: 10, phases: {} },
    };
    const extra = {
        a: { readyMs: 10, phases: {} },
        b: { readyMs: 20, phases: {} },
        c: { readyMs: 30, phases: {} },
    };
    const sweeps = [
        sampleSweep('t0', full),
        sampleSweep('t1', partial),
        sampleSweep('t2', full),
        sampleSweep('t3', extra),
    ];
    const kept = filterFullRegistrySweeps(sweeps, keys);
    assert.equal(kept.length, 2);
    assert.equal(kept[0]!.at, 't0');
    assert.equal(kept[1]!.at, 't2');
});

// --- system aggregates ---

test('meanReadyMs averages present pages only', () => {
    const s = sampleSweep('t', {
        a: { readyMs: 100, phases: {} },
        b: { readyMs: 200, phases: {} },
    });
    assert.equal(meanReadyMs(s), 150);
});

test('meanReadyMs null when no pages', () => {
    assert.equal(
        meanReadyMs(sampleSweep('t', {})),
        null,
    );
});

test('systemReadySeries window and sampleCount', () => {
    const sweeps = [
        sampleSweep('t0', {
            a: { readyMs: 100, phases: {} },
            b: { readyMs: 200, phases: {} },
        }),
        sampleSweep('t1', {
            a: { readyMs: 300, phases: {} },
        }),
        sampleSweep('t2', {
            a: { readyMs: 400, phases: {} },
            b: { readyMs: 600, phases: {} },
        }),
    ];
    const series = systemReadySeries(sweeps, 0, 2);
    assert.equal(series.length, 3);
    assert.deepEqual(series[0], {
        index: 0,
        meanMs: 150,
        sampleCount: 2,
    });
    assert.deepEqual(series[1], {
        index: 1,
        meanMs: 300,
        sampleCount: 1,
    });
    assert.deepEqual(series[2], {
        index: 2,
        meanMs: 500,
        sampleCount: 2,
    });
    const mid = systemReadySeries(sweeps, 1, 1);
    assert.equal(mid.length, 1);
    assert.equal(mid[0]!.index, 1);
});

test('systemDeltaMs end minus start means', () => {
    const sweeps = [
        sampleSweep('t0', {
            a: { readyMs: 100, phases: {} },
            b: { readyMs: 200, phases: {} },
        }),
        sampleSweep('t1', {
            a: { readyMs: 400, phases: {} },
            b: { readyMs: 600, phases: {} },
        }),
    ];
    // 500 - 150 = 350
    assert.equal(systemDeltaMs(sweeps, 0, 1), 350);
    assert.equal(systemDeltaMs(sweeps, 0, 0), null);
});

test('budgetPressure counts over within unknown', () => {
    const sweeps = [
        sampleSweep('t0', {
            a: { readyMs: 150, phases: {} },
            b: { readyMs: 50, phases: {} },
            c: { readyMs: 80, phases: {} },
        }),
    ];
    const budgets = {
        a: { readyMs: 100 },
        b: { readyMs: 100 },
        // c missing budget → unknown
    };
    const r = budgetPressure(sweeps, budgets, 0);
    assert.equal(r.over, 1);
    assert.equal(r.within, 1);
    assert.equal(r.unknown, 1);
    assert.equal(r.rows[0]!.page, 'a');
    assert.ok(r.rows[0]!.budgetPct! > 1);
});

test('meanPhaseBuckets averages rollups at end', () => {
    const sweeps = [
        sampleSweep('t0', {
            a: {
                readyMs: 100,
                phases: {
                    'boot:x': 10,
                    'fetch:y': 20,
                    'render:z': 30,
                },
            },
            b: {
                readyMs: 200,
                phases: {
                    'boot:x': 30,
                    'fetch:y': 40,
                    'render:z': 50,
                },
            },
        }),
    ];
    const buckets = meanPhaseBuckets(sweeps, 0);
    assert.equal(buckets.boot, 20);
    assert.equal(buckets.fetch, 30);
    assert.equal(buckets.render, 40);
    assert.equal(buckets.other, 0);
});

test('systemMetrics composes window metrics', () => {
    const sweeps = [
        sampleSweep('t0', {
            a: { readyMs: 100, phases: {} },
            b: { readyMs: 200, phases: {} },
        }),
        sampleSweep('t1', {
            a: { readyMs: 300, phases: {} },
            b: { readyMs: 500, phases: {} },
        }),
    ];
    const budgets = {
        a: { readyMs: 250 },
        b: { readyMs: 400 },
    };
    const m = systemMetrics(sweeps, budgets, 0, 1);
    assert.equal(m.sweepsInWindow, 2);
    assert.equal(m.totalSweeps, 2);
    assert.equal(m.pageCount, 2);
    assert.equal(m.meanReadyMs, 400);
    assert.equal(m.systemDeltaMs, 250);
    assert.equal(m.overBudget, 2);
    assert.ok(m.budgetP50 !== null);
});

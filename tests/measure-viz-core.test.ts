import {
    assert,
    assertEquals,
    assertMatch,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
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

Deno.test('formatDurationPerf sub-ms as integer µs', () => {
    assertStrictEquals(formatDurationPerf(0.4), '400 µs');
    assertStrictEquals(formatDurationPerf(0), '0 µs');
    assertStrictEquals(formatDurationPerf(0.001), '1 µs');
});

Deno.test('formatDurationPerf ms range', () => {
    assertStrictEquals(formatDurationPerf(245), '245 ms');
    assertStrictEquals(formatDurationPerf(1), '1 ms');
    assertStrictEquals(formatDurationPerf(1.5), '1.5 ms');
    assertStrictEquals(formatDurationPerf(999.4), '999.4 ms');
});

Deno.test('formatDurationPerf seconds range', () => {
    assertStrictEquals(formatDurationPerf(1000), '1 s');
    assertStrictEquals(formatDurationPerf(3280), '3.28 s');
    assertStrictEquals(formatDurationPerf(3282.75), '3.28 s');
});

Deno.test('formatDurationPerf signed option', () => {
    assertStrictEquals(
        formatDurationPerf(990, { signed: true }),
        '+990 ms',
    );
    assertStrictEquals(
        formatDurationPerf(-12, { signed: true }),
        '−12 ms',
    );
    assertStrictEquals(
        formatDurationPerf(-0.4, { signed: true }),
        '−400 µs',
    );
    assertStrictEquals(
        formatDurationPerf(1500, { signed: true }),
        '+1.5 s',
    );
});

Deno.test('formatDurationPerf absolute negatives', () => {
    assertStrictEquals(formatDurationPerf(12), '12 ms');
    assertStrictEquals(formatDurationPerf(-12), '−12 ms');
});

// --- pickAxisUnit / formatAxisTick ---

Deno.test('pickAxisUnit from max abs', () => {
    assertStrictEquals(pickAxisUnit([0.1, 0.4]), 'us');
    assertStrictEquals(pickAxisUnit([1, 500]), 'ms');
    assertStrictEquals(pickAxisUnit([1000, 50]), 's');
    assertStrictEquals(pickAxisUnit([]), 'us');
});

Deno.test('formatAxisTick respects unit', () => {
    assertStrictEquals(formatAxisTick(0.4, 'us'), '400 µs');
    assertStrictEquals(formatAxisTick(245, 'ms'), '245 ms');
    assertStrictEquals(formatAxisTick(3280, 's'), '3.28 s');
});

// --- parseHistoryJsonl ---

Deno.test('parseHistoryJsonl happy two lines', () => {
    const a = sampleSweep('2026-01-01T00:00:00.000Z', {
        dashboard: { readyMs: 100, phases: {} },
    });
    const b = sampleSweep('2026-01-02T00:00:00.000Z', {
        dashboard: { readyMs: 200, phases: {} },
    });
    const text =
        `${JSON.stringify(a)}\n${JSON.stringify(b)}\n`;
    const lines = parseHistoryJsonl(text);
    assertStrictEquals(lines.length, 2);
    assertStrictEquals(lines[0]!.at, a.at);
    assertStrictEquals(lines[1]!.pages.dashboard!.readyMs, 200);
});

Deno.test('parseHistoryJsonl skips blank lines', () => {
    const a = sampleSweep('2026-01-01T00:00:00.000Z', {
        ideas: { readyMs: 50, phases: {} },
    });
    const text =
        `\n${JSON.stringify(a)}\n\n`;
    const lines = parseHistoryJsonl(text);
    assertStrictEquals(lines.length, 1);
    assertStrictEquals(lines[0]!.at, a.at);
});

Deno.test('parseHistoryJsonl empty throws', () => {
    const err1 = assertThrows(
        () => parseHistoryJsonl(''),
    ) as Error;
    assertMatch(err1.message, /no valid lines/i);
    const err2 = assertThrows(
        () => parseHistoryJsonl('\n\n'),
    ) as Error;
    assertMatch(err2.message, /no valid lines/i);
});

Deno.test('parseHistoryJsonl bad line includes line number', () => {
    const a = sampleSweep('2026-01-01T00:00:00.000Z', {
        dashboard: { readyMs: 1, phases: {} },
    });
    const text =
        `${JSON.stringify(a)}\n{not-json}\n`;
    const err = assertThrows(
        () => parseHistoryJsonl(text),
    ) as Error;
    assertMatch(err.message, /line 2/i);
});

// --- parseBudgetsJson ---

Deno.test('parseBudgetsJson happy', () => {
    const text = JSON.stringify({
        dashboard: { readyMs: 200 },
        ideas: { readyMs: 150 },
    });
    const budgets = parseBudgetsJson(text);
    assertEquals(budgets, {
        dashboard: { readyMs: 200 },
        ideas: { readyMs: 150 },
    });
});

Deno.test('parseBudgetsJson bad JSON throws budget', () => {
    const err = assertThrows(
        () => parseBudgetsJson('{not'),
    ) as Error;
    assertMatch(err.message, /budget/i);
});

// --- budgetRatio / deltaReadyMs ---

Deno.test('budgetRatio is ready over budget', () => {
    assertStrictEquals(budgetRatio(150, 200), 0.75);
    assertStrictEquals(budgetRatio(300, 200), 1.5);
});

Deno.test('deltaReadyMs subtracts from from to', () => {
    assertStrictEquals(deltaReadyMs(100, 250), 150);
    assertStrictEquals(deltaReadyMs(200, 150), -50);
});

Deno.test('deltaReadyMs null when either missing', () => {
    assertStrictEquals(deltaReadyMs(undefined, 100), null);
    assertStrictEquals(deltaReadyMs(100, undefined), null);
    assertStrictEquals(
        deltaReadyMs(undefined, undefined),
        null,
    );
});

// --- phaseBucketFor / rollupPhases ---

Deno.test('phaseBucketFor by prefix', () => {
    assertStrictEquals(
        phaseBucketFor('boot:db-open'),
        'boot',
    );
    assertStrictEquals(
        phaseBucketFor('fetch:ideas'),
        'fetch',
    );
    assertStrictEquals(
        phaseBucketFor('render:paint'),
        'render',
    );
    assertStrictEquals(
        phaseBucketFor('custom:x'),
        'other',
    );
});

Deno.test('rollupPhases sums buckets; lists present only', () => {
    const rollup = rollupPhases({
        'boot:db-open': 10,
        'fetch:list': 40,
        'render:paint': 20,
        'misc:extra': 5,
    });
    assertEquals(rollup.buckets, {
        boot: 10,
        fetch: 40,
        render: 20,
        other: 5,
    });
    assertStrictEquals(rollup.phases.length, 4);
    // Longest duration first.
    assertEquals(
        rollup.phases.map((p) => p.name),
        [
            'fetch:list',
            'render:paint',
            'boot:db-open',
            'misc:extra',
        ],
    );
    assertStrictEquals(rollup.phases[0]!.bucket, 'fetch');
    assertStrictEquals(rollup.phases[0]!.ms, 40);
    assertStrictEquals(rollup.phases[3]!.bucket, 'other');
});

Deno.test('residualPageInitMs subtracts nested fetch/render', () => {
    assertStrictEquals(
        residualPageInitMs({
            [MEASURE_BOOT_PAGE_INIT]: 1000,
            'fetch:a': 400,
            'fetch:b': 300,
            'render:a': 50,
            'boot:sidebar-chrome': 600,
        }),
        250,
    );
    assertStrictEquals(
        residualPageInitMs({
            'boot:db-open': 10,
        }),
        undefined,
    );
    // Nested sum may exceed page-init → floor 0.
    assertStrictEquals(
        residualPageInitMs({
            [MEASURE_BOOT_PAGE_INIT]: 100,
            'fetch:a': 80,
            'fetch:b': 80,
        }),
        0,
    );
});

Deno.test('rollupPhases uses residual page-init (no double-count)', () => {
    const rollup = rollupPhases({
        [MEASURE_BOOT_PAGE_INIT]: 1000,
        'boot:sidebar-chrome': 600,
        'fetch:list': 700,
        'render:list': 50,
    });
    // boot = sidebar 600 + residual (1000-700-50)=250
    assertEquals(rollup.buckets, {
        boot: 850,
        fetch: 700,
        render: 50,
        other: 0,
    });
    const pageInit = rollup.phases.find(
        (p) => p.name === MEASURE_BOOT_PAGE_INIT,
    );
    assertStrictEquals(pageInit!.ms, 250);
    // Residual ranks below nested fetch, not as 1000.
    assertStrictEquals(
        rollup.phases[0]!.name,
        'fetch:list',
    );
});

Deno.test('rollupPhases ties break by name', () => {
    const rollup = rollupPhases({
        'boot:b': 10,
        'boot:a': 10,
        'fetch:x': 20,
    });
    assertEquals(
        rollup.phases.map((p) => p.name),
        ['fetch:x', 'boot:a', 'boot:b'],
    );
});

Deno.test('rollupPhases empty phases', () => {
    const rollup = rollupPhases({});
    assertEquals(rollup.buckets, {
        boot: 0,
        fetch: 0,
        render: 0,
        other: 0,
    });
    assertEquals(rollup.phases, []);
});

// --- pageKeysUnion / rankPages ---

Deno.test('pageKeysUnion sorted unique across sweeps', () => {
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
    assertEquals(
        pageKeysUnion(sweeps),
        ['fast', 'mid', 'slow'],
    );
});

Deno.test('rankPages ready / delta / budget with two sweeps', () => {
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
    assertEquals(
        byReady.map((e) => e.page),
        ['slow', 'mid', 'fast'],
    );
    assertStrictEquals(byReady[0]!.readyMs, 300);
    assertStrictEquals(byReady[1]!.readyMs, 150);
    assertStrictEquals(byReady[2]!.readyMs, 40);

    const byDelta = rankPages(
        sweeps, budgets, 0, 1, 'delta',
    );
    assertEquals(
        byDelta.map((e) => e.page),
        ['slow', 'fast', 'mid'],
    );
    assertStrictEquals(byDelta[0]!.deltaMs, 200);
    assertStrictEquals(byDelta[1]!.deltaMs, -10);
    assertStrictEquals(byDelta[2]!.deltaMs, null);

    const byBudget = rankPages(
        sweeps, budgets, 0, 1, 'budget',
    );
    assertEquals(
        byBudget.map((e) => e.page),
        ['slow', 'fast', 'mid'],
    );
    assertStrictEquals(byBudget[0]!.budgetPct, 1.5);
    assertStrictEquals(byBudget[1]!.budgetPct, 0.4);
    assertStrictEquals(byBudget[2]!.budgetPct, null);
});

Deno.test('rankPages single sweep delta is null', () => {
    const sweeps = [
        sampleSweep('only', {
            dashboard: { readyMs: 100, phases: {} },
        }),
    ];
    const ranked = rankPages(
        sweeps, {}, 0, 0, 'delta',
    );
    assertStrictEquals(ranked.length, 1);
    assertStrictEquals(ranked[0]!.deltaMs, null);
    assertStrictEquals(ranked[0]!.readyMs, 100);
});

// --- buildPayload ---

Deno.test('buildPayload version and compareDefault', () => {
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
    assertStrictEquals(payload.version, VIZ_PAYLOAD_VERSION);
    assertStrictEquals(payload.version, 1);
    assertStrictEquals(
        payload.generatedAt,
        '2026-07-12T00:00:00.000Z',
    );
    assertEquals(payload.compareDefault, {
        fromIndex: 0,
        toIndex: 1,
    });
    assertStrictEquals(payload.sweeps, sweeps);
    assertStrictEquals(payload.budgets, budgets);
});

Deno.test('buildPayload empty sweeps throws', () => {
    const err = assertThrows(
        () => buildPayload(
            [],
            {},
            '2026-07-12T00:00:00.000Z',
        ),
    ) as Error;
    assertMatch(err.message, /no sweeps/i);
});

// --- trendLabelIndices ---

Deno.test('trendLabelIndices labels samples only', () => {
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
    assertEquals(
        labels,
        [0, 1, 2, 3, 4, 5, 8],
    );
    assert(!labels.includes(6));
    assert(!labels.includes(7));
});

Deno.test('trendLabelIndices always keeps first/last sample', () => {
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
    assert(labels.length <= 3);
    assertStrictEquals(labels[0], 0);
    assertStrictEquals(labels[labels.length - 1], 19);
    assert(labels.includes(0));
    assert(labels.includes(19));
});

Deno.test('trendLabelIndices includes from/to only if sampled', () => {
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
    assert(!labels.includes(6));
    assert(labels.includes(8));
});

Deno.test('trendLabelIndices thins among candidates only', () => {
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
    assert(labels.length <= 5);
    for (const i of labels) {
        assert(
            sweeps[i]?.pages[page] !== undefined,
            `index ${i} must have page sample`,
        );
    }
    // sorted ascending unique
    for (let j = 1; j < labels.length; j++) {
        assert(labels[j]! > labels[j - 1]!);
    }
});

Deno.test('not-found shaped fixture labels the peak', () => {
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
    assert(
        labels.includes(5),
        'peak idx 5 labeled when it has data',
    );
    assert(
        !labels.includes(6),
        'idx 6 must not be labeled for not-found',
    );
    assert(!labels.includes(7));
});

// --- page-set / surgery helpers ---

Deno.test('pageKeySet returns sorted keys', () => {
    const s = sampleSweep('t', {
        zebra: { readyMs: 1, phases: {} },
        alpha: { readyMs: 2, phases: {} },
    });
    assertEquals(pageKeySet(s), ['alpha', 'zebra']);
});

Deno.test('dominantPageKeySet picks mode by frequency', () => {
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
    assertEquals(
        dominantPageKeySet(sweeps),
        ['a', 'b'],
    );
});

Deno.test('filterFullRegistrySweeps drops unequal sets', () => {
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
    assertStrictEquals(kept.length, 2);
    assertStrictEquals(kept[0]!.at, 't0');
    assertStrictEquals(kept[1]!.at, 't2');
});

// --- system aggregates ---

Deno.test('meanReadyMs averages present pages only', () => {
    const s = sampleSweep('t', {
        a: { readyMs: 100, phases: {} },
        b: { readyMs: 200, phases: {} },
    });
    assertStrictEquals(meanReadyMs(s), 150);
});

Deno.test('meanReadyMs null when no pages', () => {
    assertStrictEquals(
        meanReadyMs(sampleSweep('t', {})),
        null,
    );
});

Deno.test('systemReadySeries window and sampleCount', () => {
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
    assertStrictEquals(series.length, 3);
    assertEquals(series[0], {
        index: 0,
        meanMs: 150,
        sampleCount: 2,
    });
    assertEquals(series[1], {
        index: 1,
        meanMs: 300,
        sampleCount: 1,
    });
    assertEquals(series[2], {
        index: 2,
        meanMs: 500,
        sampleCount: 2,
    });
    const mid = systemReadySeries(sweeps, 1, 1);
    assertStrictEquals(mid.length, 1);
    assertStrictEquals(mid[0]!.index, 1);
});

Deno.test('systemDeltaMs end minus start means', () => {
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
    assertStrictEquals(systemDeltaMs(sweeps, 0, 1), 350);
    assertStrictEquals(systemDeltaMs(sweeps, 0, 0), null);
});

Deno.test('budgetPressure counts over within unknown', () => {
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
    assertStrictEquals(r.over, 1);
    assertStrictEquals(r.within, 1);
    assertStrictEquals(r.unknown, 1);
    assertStrictEquals(r.rows[0]!.page, 'a');
    assert(r.rows[0]!.budgetPct! > 1);
});

Deno.test('meanPhaseBuckets averages rollups at end', () => {
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
    assertStrictEquals(buckets.boot, 20);
    assertStrictEquals(buckets.fetch, 30);
    assertStrictEquals(buckets.render, 40);
    assertStrictEquals(buckets.other, 0);
});

Deno.test('systemMetrics composes window metrics', () => {
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
    assertStrictEquals(m.sweepsInWindow, 2);
    assertStrictEquals(m.totalSweeps, 2);
    assertStrictEquals(m.pageCount, 2);
    assertStrictEquals(m.meanReadyMs, 400);
    assertStrictEquals(m.systemDeltaMs, 250);
    assertStrictEquals(m.overBudget, 2);
    assert(m.budgetP50 !== null);
});

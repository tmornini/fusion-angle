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

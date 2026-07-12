import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    median,
    mean,
    sampleStandardDeviation,
    trimExtremes,
    budgetReadyMsFromSamples,
    statsForPage,
    compareBudgets,
    shapeHistoryLine,
    formatReport,
    type PageRun,
    type PageStats,
} from '../web-app/app/measure-core.ts';

// --- trimExtremes ---

test('trimExtremes empty throws', () => {
    assert.throws(
        () => trimExtremes([]),
        /empty/i,
    );
});

test('trimExtremes rejects bad fraction', () => {
    assert.throws(
        () => trimExtremes([1], -0.1),
        /fraction/i,
    );
    assert.throws(
        () => trimExtremes([1], 0.5),
        /fraction/i,
    );
    assert.throws(
        () => trimExtremes([1], NaN),
        /fraction/i,
    );
});

test('trimExtremes n<20 at 5% keeps all', () => {
    // floor(5 × 0.05) = 0 → no drop
    const input = [5, 1, 4, 2, 3];
    assert.deepEqual(
        trimExtremes(input),
        [1, 2, 3, 4, 5],
    );
    // Input not mutated.
    assert.deepEqual(input, [5, 1, 4, 2, 3]);
});

test('trimExtremes drops 5% each tail', () => {
    // n=20 → floor(20×0.05)=1 each side
    const values = [];
    for (let i = 1; i <= 20; i++) {
        values.push(i);
    }
    assert.deepEqual(
        trimExtremes(values),
        [
            2, 3, 4, 5, 6, 7, 8, 9, 10,
            11, 12, 13, 14, 15, 16, 17, 18, 19,
        ],
    );
});

test('trimExtremes fraction 0 is identity sorted', () => {
    assert.deepEqual(
        trimExtremes([3, 1, 2], 0),
        [1, 2, 3],
    );
});

// --- median ---

test('median odd length returns middle value', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([9]), 9);
    assert.equal(median([5, 1, 4, 2, 3]), 3);
});

test('median even length averages two middle', () => {
    assert.equal(median([1, 2]), 1.5);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([10, 20, 30, 40]), 25);
});

test('median empty throws', () => {
    assert.throws(
        () => median([]),
        /empty/i,
    );
});

test('median does not mutate input', () => {
    const input = [3, 1, 2];
    const copy = input.slice();
    median(input);
    assert.deepEqual(input, copy);
});

// --- mean / sample σ / budget ---

test('mean of simple series', () => {
    assert.equal(mean([1, 2, 3]), 2);
    assert.equal(mean([10]), 10);
    assert.equal(mean([2, 4]), 3);
});

test('mean empty throws', () => {
    assert.throws(() => mean([]), /empty/i);
});

test('sampleStandardDeviation known series', () => {
    // {2,4,4,4,5,5,7,9}: mean=5, Σ(x−μ)²=32
    // sample σ = √(32/7) ≈ 2.138…
    const sd = sampleStandardDeviation(
        [2, 4, 4, 4, 5, 5, 7, 9],
    );
    assert.ok(
        Math.abs(sd - Math.sqrt(32 / 7)) < 1e-12,
    );
});

test('sampleStandardDeviation single is 0', () => {
    assert.equal(sampleStandardDeviation([42]), 0);
});

test('sampleStandardDeviation empty throws', () => {
    assert.throws(
        () => sampleStandardDeviation([]),
        /empty/i,
    );
});

test(
    'budgetReadyMsFromSamples is mean + sigmas×σ'
    + ' ceiled',
    () => {
        // n=8 < 20 → no trim; mean=5, sample σ=√(32/7)
        // 5 + 1.5×√(32/7) ≈ 8.207 → ceil 9
        const values = [2, 4, 4, 4, 5, 5, 7, 9];
        assert.equal(
            budgetReadyMsFromSamples(values, 1.5),
            9,
        );
        // mean of [1,2]=1.5, σ=√0.5
        // 1.5 + 1.5×√0.5 ≈ 2.5607 → 3
        assert.equal(
            budgetReadyMsFromSamples([1, 2], 1.5),
            3,
        );
        // Zero sigmas → ceil(mean)
        assert.equal(
            budgetReadyMsFromSamples([1.1, 1.1], 0),
            2,
        );
    },
);

test(
    'budgetReadyMsFromSamples trims 5% each tail',
    () => {
        // n=20: drop 1 and 100; mean of 2..19 = 10.5
        // sample σ of 2..19; 10.5 + 0×σ → ceil 11
        const values = [];
        for (let i = 1; i <= 20; i++) {
            values.push(i);
        }
        assert.equal(
            budgetReadyMsFromSamples(values, 0),
            11,
        );
    },
);

test('budgetReadyMsFromSamples rejects bad sigmas', () => {
    assert.throws(
        () => budgetReadyMsFromSamples([1], -1),
        /sigmas/i,
    );
    assert.throws(
        () => budgetReadyMsFromSamples([1], NaN),
        /sigmas/i,
    );
});

// --- statsForPage ---

test('statsForPage min/median/max readyMs', () => {
    const runs: PageRun[] = [
        { readyMs: 100, phases: {} },
        { readyMs: 300, phases: {} },
        { readyMs: 200, phases: {} },
    ];
    const s = statsForPage(runs);
    assert.equal(s.readyMs.min, 100);
    assert.equal(s.readyMs.median, 200);
    assert.equal(s.readyMs.max, 300);
});

test('statsForPage phase medians across runs', () => {
    const runs: PageRun[] = [
        {
            readyMs: 100,
            phases: { 'boot:db-open': 10, fetch: 40 },
        },
        {
            readyMs: 200,
            phases: { 'boot:db-open': 30 },
        },
        {
            readyMs: 300,
            phases: { 'boot:db-open': 20, fetch: 60 },
        },
    ];
    const s = statsForPage(runs);
    // boot:db-open across all three: 10, 30, 20 → 20
    assert.equal(s.phases['boot:db-open'], 20);
    // fetch only in runs 0 and 2: 40, 60 → 50
    assert.equal(s.phases['fetch'], 50);
});

test('statsForPage empty runs throws', () => {
    assert.throws(
        () => statsForPage([]),
        /empty/i,
    );
});

test('statsForPage trims extremes on readyMs', () => {
    // n=20 → drop lowest (1) and highest (1000)
    const runs: PageRun[] = [];
    for (let i = 1; i <= 19; i++) {
        runs.push({ readyMs: i, phases: {} });
    }
    runs.push({ readyMs: 1000, phases: {} });
    const s = statsForPage(runs);
    assert.equal(s.readyMs.min, 2);
    assert.equal(s.readyMs.max, 19);
    // Middle of 2..19 (18 values, even): (10+11)/2 = 10.5
    assert.equal(s.readyMs.median, 10.5);
});

// --- compareBudgets ---

function page(
    medianReady: number,
): PageStats {
    return {
        readyMs: {
            min: medianReady,
            median: medianReady,
            max: medianReady,
        },
        phases: {},
    };
}

test('compareBudgets under budget is ok', () => {
    const verdict = compareBudgets(
        { dashboard: page(100) },
        { dashboard: { readyMs: 200 } },
    );
    assert.deepEqual(verdict, { ok: true });
});

test('compareBudgets equal budget is ok', () => {
    const verdict = compareBudgets(
        { dashboard: page(200) },
        { dashboard: { readyMs: 200 } },
    );
    assert.deepEqual(verdict, { ok: true });
});

test('compareBudgets over budget lists offender', () => {
    const verdict = compareBudgets(
        { dashboard: page(250) },
        { dashboard: { readyMs: 200 } },
    );
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.equal(verdict.offenders.length, 1);
    assert.deepEqual(verdict.offenders[0], {
        page: 'dashboard',
        reason: 'over-budget',
        medianReadyMs: 250,
        budgetReadyMs: 200,
    });
});

test('compareBudgets missing-budget for measured page', () => {
    const verdict = compareBudgets(
        { ideas: page(100) },
        {},
    );
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.deepEqual(verdict.offenders, [
        {
            page: 'ideas',
            reason: 'missing-budget',
            medianReadyMs: 100,
        },
    ]);
});

test('compareBudgets unknown-page for stale budget', () => {
    const verdict = compareBudgets(
        {},
        { retired: { readyMs: 500 } },
    );
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.deepEqual(verdict.offenders, [
        {
            page: 'retired',
            reason: 'unknown-page',
            budgetReadyMs: 500,
        },
    ]);
});

test('compareBudgets lists every offender', () => {
    const verdict = compareBudgets(
        {
            dashboard: page(300),
            ideas: page(100),
        },
        {
            dashboard: { readyMs: 200 },
            retired: { readyMs: 500 },
        },
    );
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    const reasons = Object.fromEntries(
        verdict.offenders.map(
            (o) => [o.page, o.reason],
        ),
    );
    assert.deepEqual(reasons, {
        dashboard: 'over-budget',
        ideas: 'missing-budget',
        retired: 'unknown-page',
    });
    assert.equal(verdict.offenders.length, 3);
});

// --- shapeHistoryLine ---

test('shapeHistoryLine maps median stats', () => {
    const line = shapeHistoryLine({
        at: '2026-07-12T00:00:00.000Z',
        sha: 'abc123',
        machine: {
            platform: 'darwin',
            arch: 'arm64',
            cpuModel: 'Apple M2',
            cpuCount: 8,
        },
        runs: 5,
        stats: {
            dashboard: {
                readyMs: {
                    min: 80,
                    median: 100,
                    max: 140,
                },
                phases: {
                    'boot:db-open': 12,
                    fetch: 40,
                },
            },
            ideas: {
                readyMs: {
                    min: 200,
                    median: 250,
                    max: 300,
                },
                phases: {},
            },
        },
    });
    assert.equal(line.at, '2026-07-12T00:00:00.000Z');
    assert.equal(line.sha, 'abc123');
    assert.equal(line.runs, 5);
    assert.equal(line.machine.platform, 'darwin');
    assert.deepEqual(line.pages, {
        dashboard: {
            readyMs: 100,
            phases: {
                'boot:db-open': 12,
                fetch: 40,
            },
        },
        ideas: {
            readyMs: 250,
            phases: {},
        },
    });
});

// --- formatReport ---

test('formatReport includes page names and numbers', () => {
    const report = formatReport({
        ideas: {
            readyMs: {
                min: 200,
                median: 250,
                max: 300,
            },
            phases: { fetch: 80 },
        },
        dashboard: {
            readyMs: {
                min: 80,
                median: 100,
                max: 140,
            },
            phases: { 'boot:db-open': 12 },
        },
    });
    assert.match(report, /dashboard/);
    assert.match(report, /ideas/);
    assert.match(report, /100/);
    assert.match(report, /250/);
    assert.match(report, /boot:db-open/);
    assert.match(report, /fetch/);
    // sorted page keys: dashboard before ideas
    const dashIdx = report.indexOf('dashboard');
    const ideasIdx = report.indexOf('ideas');
    assert.ok(dashIdx < ideasIdx);
});

import {
    assert,
    assertEquals,
    assertMatch,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
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

Deno.test('trimExtremes empty throws', () => {
    const err = assertThrows(
        () => trimExtremes([]),
    ) as Error;
    assertMatch(err.message, /empty/i);
});

Deno.test('trimExtremes rejects bad fraction', () => {
    const err1 = assertThrows(
        () => trimExtremes([1], -0.1),
    ) as Error;
    assertMatch(err1.message, /fraction/i);
    const err2 = assertThrows(
        () => trimExtremes([1], 0.5),
    ) as Error;
    assertMatch(err2.message, /fraction/i);
    const err3 = assertThrows(
        () => trimExtremes([1], NaN),
    ) as Error;
    assertMatch(err3.message, /fraction/i);
});

Deno.test('trimExtremes n=25 at 10% drops 3 each tail', () => {
    // ceil(25 × 0.10) = 3 each side
    const values = [];
    for (let i = 1; i <= 25; i++) {
        values.push(i);
    }
    assertEquals(
        trimExtremes(values),
        [
            4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
            14, 15, 16, 17, 18, 19, 20, 21, 22,
        ],
    );
});

Deno.test('trimExtremes n=5 at 10% drops 1 each tail', () => {
    // ceil(5 × 0.10) = 1 each side
    const input = [5, 1, 4, 2, 3];
    assertEquals(
        trimExtremes(input),
        [2, 3, 4],
    );
    // Input not mutated.
    assertEquals(input, [5, 1, 4, 2, 3]);
});

Deno.test('trimExtremes n=2 keeps all (cap)', () => {
    // ceil(2 × 0.10) = 1, but maxDrop is 0
    assertEquals(
        trimExtremes([2, 1]),
        [1, 2],
    );
});

Deno.test('trimExtremes drops 10% each tail', () => {
    // n=20 → ceil(20×0.10)=2 each side
    const values = [];
    for (let i = 1; i <= 20; i++) {
        values.push(i);
    }
    assertEquals(
        trimExtremes(values),
        [
            3, 4, 5, 6, 7, 8, 9, 10,
            11, 12, 13, 14, 15, 16, 17, 18,
        ],
    );
});

Deno.test('trimExtremes fraction 0 is identity sorted', () => {
    assertEquals(
        trimExtremes([3, 1, 2], 0),
        [1, 2, 3],
    );
});

// --- median ---

Deno.test('median odd length returns middle value', () => {
    assertStrictEquals(median([3, 1, 2]), 2);
    assertStrictEquals(median([9]), 9);
    assertStrictEquals(median([5, 1, 4, 2, 3]), 3);
});

Deno.test('median even length averages two middle', () => {
    assertStrictEquals(median([1, 2]), 1.5);
    assertStrictEquals(median([4, 1, 3, 2]), 2.5);
    assertStrictEquals(median([10, 20, 30, 40]), 25);
});

Deno.test('median empty throws', () => {
    const err = assertThrows(() => median([])) as Error;
    assertMatch(err.message, /empty/i);
});

Deno.test('median does not mutate input', () => {
    const input = [3, 1, 2];
    const copy = input.slice();
    median(input);
    assertEquals(input, copy);
});

// --- mean / sample σ / budget ---

Deno.test('mean of simple series', () => {
    assertStrictEquals(mean([1, 2, 3]), 2);
    assertStrictEquals(mean([10]), 10);
    assertStrictEquals(mean([2, 4]), 3);
});

Deno.test('mean empty throws', () => {
    const err = assertThrows(() => mean([])) as Error;
    assertMatch(err.message, /empty/i);
});

Deno.test('sampleStandardDeviation known series', () => {
    // {2,4,4,4,5,5,7,9}: mean=5, Σ(x−μ)²=32
    // sample σ = √(32/7) ≈ 2.138…
    const sd = sampleStandardDeviation(
        [2, 4, 4, 4, 5, 5, 7, 9],
    );
    assert(
        Math.abs(sd - Math.sqrt(32 / 7)) < 1e-12,
    );
});

Deno.test('sampleStandardDeviation single is 0', () => {
    assertStrictEquals(sampleStandardDeviation([42]), 0);
});

Deno.test('sampleStandardDeviation empty throws', () => {
    const err = assertThrows(
        () => sampleStandardDeviation([]),
    ) as Error;
    assertMatch(err.message, /empty/i);
});

Deno.test(
    'budgetReadyMsFromSamples is mean + sigmas×σ'
    + ' ceiled',
    () => {
        // n=8 → drop 1 each tail; [4,4,4,5,5,7]
        // mean=29/6; sample σ=√(41/30)
        // 29/6 + 1.5×√(41/30) ≈ 6.587 → ceil 7
        const values = [2, 4, 4, 4, 5, 5, 7, 9];
        assertStrictEquals(
            budgetReadyMsFromSamples(values, 1.5),
            7,
        );
        // mean of [1,2]=1.5, σ=√0.5
        // 1.5 + 1.5×√0.5 ≈ 2.5607 → 3
        assertStrictEquals(
            budgetReadyMsFromSamples([1, 2], 1.5),
            3,
        );
        // Zero sigmas → ceil(mean)
        assertStrictEquals(
            budgetReadyMsFromSamples([1.1, 1.1], 0),
            2,
        );
    },
);

Deno.test(
    'budgetReadyMsFromSamples trims 10% each tail',
    () => {
        // n=20: drop 1,2 and 19,20; mean of 3..18 = 10.5
        // 10.5 + 0×σ → ceil 11
        const values = [];
        for (let i = 1; i <= 20; i++) {
            values.push(i);
        }
        assertStrictEquals(
            budgetReadyMsFromSamples(values, 0),
            11,
        );
    },
);

Deno.test('budgetReadyMsFromSamples rejects bad sigmas', () => {
    const err1 = assertThrows(
        () => budgetReadyMsFromSamples([1], -1),
    ) as Error;
    assertMatch(err1.message, /sigmas/i);
    const err2 = assertThrows(
        () => budgetReadyMsFromSamples([1], NaN),
    ) as Error;
    assertMatch(err2.message, /sigmas/i);
});

// --- statsForPage ---

Deno.test('statsForPage min/median/max readyMs', () => {
    // n=2: ceil trim is capped, so both samples remain
    const runs: PageRun[] = [
        { readyMs: 100, phases: {} },
        { readyMs: 300, phases: {} },
    ];
    const s = statsForPage(runs);
    assertStrictEquals(s.readyMs.min, 100);
    assertStrictEquals(s.readyMs.median, 200);
    assertStrictEquals(s.readyMs.max, 300);
});

Deno.test('statsForPage phase medians across runs', () => {
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
    assertStrictEquals(s.phases['boot:db-open'], 20);
    // fetch only in runs 0 and 2: 40, 60 → 50
    assertStrictEquals(s.phases['fetch'], 50);
});

Deno.test('statsForPage empty runs throws', () => {
    const err = assertThrows(
        () => statsForPage([]),
    ) as Error;
    assertMatch(err.message, /empty/i);
});

Deno.test('statsForPage trims extremes on readyMs', () => {
    // n=20 → drop two lowest and two highest
    const runs: PageRun[] = [];
    for (let i = 1; i <= 19; i++) {
        runs.push({ readyMs: i, phases: {} });
    }
    runs.push({ readyMs: 1000, phases: {} });
    const s = statsForPage(runs);
    assertStrictEquals(s.readyMs.min, 3);
    assertStrictEquals(s.readyMs.max, 18);
    // 3..18 (16 values, even): (10+11)/BBjWJsjYIDkTRKIIPrzWRw = 10.5
    assertStrictEquals(s.readyMs.median, 10.5);
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

Deno.test('compareBudgets under budget is ok', () => {
    const verdict = compareBudgets(
        { dashboard: page(100) },
        { dashboard: { readyMs: 200 } },
    );
    assertEquals(verdict, { ok: true });
});

Deno.test('compareBudgets equal budget is ok', () => {
    const verdict = compareBudgets(
        { dashboard: page(200) },
        { dashboard: { readyMs: 200 } },
    );
    assertEquals(verdict, { ok: true });
});

Deno.test('compareBudgets over budget lists offender', () => {
    const verdict = compareBudgets(
        { dashboard: page(250) },
        { dashboard: { readyMs: 200 } },
    );
    assertStrictEquals(verdict.ok, false);
    if (verdict.ok) return;
    assertStrictEquals(verdict.offenders.length, 1);
    assertEquals(verdict.offenders[0], {
        page: 'dashboard',
        reason: 'over-budget',
        medianReadyMs: 250,
        budgetReadyMs: 200,
    });
});

Deno.test('compareBudgets missing-budget for measured page', () => {
    const verdict = compareBudgets(
        { ideas: page(100) },
        {},
    );
    assertStrictEquals(verdict.ok, false);
    if (verdict.ok) return;
    assertEquals(verdict.offenders, [
        {
            page: 'ideas',
            reason: 'missing-budget',
            medianReadyMs: 100,
        },
    ]);
});

Deno.test('compareBudgets unknown-page for stale budget', () => {
    const verdict = compareBudgets(
        {},
        { retired: { readyMs: 500 } },
    );
    assertStrictEquals(verdict.ok, false);
    if (verdict.ok) return;
    assertEquals(verdict.offenders, [
        {
            page: 'retired',
            reason: 'unknown-page',
            budgetReadyMs: 500,
        },
    ]);
});

Deno.test('compareBudgets lists every offender', () => {
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
    assertStrictEquals(verdict.ok, false);
    if (verdict.ok) return;
    const reasons = Object.fromEntries(
        verdict.offenders.map(
            (o) => [o.page, o.reason],
        ),
    );
    assertEquals(reasons, {
        dashboard: 'over-budget',
        ideas: 'missing-budget',
        retired: 'unknown-page',
    });
    assertStrictEquals(verdict.offenders.length, 3);
});

// --- shapeHistoryLine ---

Deno.test('shapeHistoryLine maps median stats', () => {
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
    assertStrictEquals(line.at, '2026-07-12T00:00:00.000Z');
    assertStrictEquals(line.sha, 'abc123');
    assertStrictEquals(line.runs, 5);
    assertStrictEquals(line.machine.platform, 'darwin');
    assertEquals(line.pages, {
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

Deno.test('formatReport includes page names and numbers', () => {
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
    assertMatch(report, /dashboard/);
    assertMatch(report, /ideas/);
    assertMatch(report, /100/);
    assertMatch(report, /250/);
    assertMatch(report, /boot:db-open/);
    assertMatch(report, /fetch/);
    // sorted page keys: dashboard before ideas
    const dashIdx = report.indexOf('dashboard');
    const ideasIdx = report.indexOf('ideas');
    assert(dashIdx < ideasIdx);
});

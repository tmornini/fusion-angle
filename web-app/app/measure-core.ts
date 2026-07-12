// Pure statistics and budget gate for ./measure.
// No I/O, no Chrome, no side effects — unit-tested only.

export type PageRun = {
    readyMs: number;
    phases: Record<string, number>;
};

export type PageStats = {
    readyMs: { min: number; median: number; max: number };
    phases: Record<string, number>; // median per phase
};

export type Budgets = Record<string, { readyMs: number }>;

export type BudgetOffender = {
    page: string;
    reason:
        | 'over-budget'
        | 'missing-budget'
        | 'unknown-page';
    medianReadyMs?: number;
    budgetReadyMs?: number;
};

export type BudgetVerdict =
    | { ok: true }
    | { ok: false; offenders: BudgetOffender[] };

export type HistoryLine = {
    at: string; // ISO
    sha: string;
    machine: {
        platform: string;
        arch: string;
        cpuModel: string;
        cpuCount: number;
    };
    runs: number;
    pages: Record<
        string,
        { readyMs: number; phases: Record<string, number> }
    >;
};

/**
 * Median of a number array. Sorts a copy; never mutates
 * input. Odd length → middle value. Even length → average
 * of the two middle values. Empty → throws.
 */
export function median(values: number[]): number {
    if (values.length === 0) {
        throw new Error('median: empty values');
    }
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
        return sorted[mid]!;
    }
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Arithmetic mean. Empty → throws.
 */
export function mean(values: number[]): number {
    if (values.length === 0) {
        throw new Error('mean: empty values');
    }
    let sum = 0;
    for (const v of values) {
        sum += v;
    }
    return sum / values.length;
}

/**
 * Sample standard deviation (Bessel's correction, n−1).
 * Empty → throws. Single value → 0 (no dispersion).
 */
export function sampleStandardDeviation(
    values: number[],
): number {
    if (values.length === 0) {
        throw new Error(
            'sampleStandardDeviation: empty values',
        );
    }
    if (values.length === 1) {
        return 0;
    }
    const m = mean(values);
    let sumSq = 0;
    for (const v of values) {
        const d = v - m;
        sumSq += d * d;
    }
    return Math.sqrt(sumSq / (values.length - 1));
}

/**
 * Upper budget for readyMs: mean + sigmas × sample σ,
 * ceiled to a whole millisecond. Empty → throws.
 * sigmas must be finite and ≥ 0.
 */
export function budgetReadyMsFromSamples(
    values: number[],
    sigmas: number,
): number {
    if (values.length === 0) {
        throw new Error(
            'budgetReadyMsFromSamples: empty values',
        );
    }
    if (
        !Number.isFinite(sigmas)
        || sigmas < 0
    ) {
        throw new Error(
            'budgetReadyMsFromSamples: sigmas must'
            + ' be a finite number ≥ 0',
        );
    }
    const upper =
        mean(values)
        + sigmas * sampleStandardDeviation(values);
    return Math.ceil(upper);
}

/**
 * Aggregate min/median/max readyMs and per-phase medians
 * across runs. Empty runs → throws.
 */
export function statsForPage(runs: PageRun[]): PageStats {
    if (runs.length === 0) {
        throw new Error('statsForPage: empty runs');
    }
    const readyValues = runs.map((r) => r.readyMs);
    const phaseValues = new Map<string, number[]>();
    for (const run of runs) {
        for (const [name, ms] of Object.entries(
            run.phases,
        )) {
            let bucket = phaseValues.get(name);
            if (bucket === undefined) {
                bucket = [];
                phaseValues.set(name, bucket);
            }
            bucket.push(ms);
        }
    }
    const phases: Record<string, number> = {};
    for (const [name, values] of phaseValues) {
        phases[name] = median(values);
    }
    return {
        readyMs: {
            min: Math.min(...readyValues),
            median: median(readyValues),
            max: Math.max(...readyValues),
        },
        phases,
    };
}

/**
 * Compare measured page stats against budgets. Failures:
 * over-budget, missing-budget (measured, no budget),
 * unknown-page (budget for unmeasured page). Lists every
 * offender; under-or-equal is ok.
 */
export function compareBudgets(
    stats: Record<string, PageStats>,
    budgets: Budgets,
): BudgetVerdict {
    const pages = new Set([
        ...Object.keys(stats),
        ...Object.keys(budgets),
    ]);
    const offenders: BudgetOffender[] = [];
    for (const page of [...pages].sort()) {
        const pageStats = stats[page];
        const budget = budgets[page];
        if (pageStats === undefined) {
            offenders.push({
                page,
                reason: 'unknown-page',
                budgetReadyMs: budget!.readyMs,
            });
            continue;
        }
        if (budget === undefined) {
            offenders.push({
                page,
                reason: 'missing-budget',
                medianReadyMs: pageStats.readyMs.median,
            });
            continue;
        }
        if (pageStats.readyMs.median > budget.readyMs) {
            offenders.push({
                page,
                reason: 'over-budget',
                medianReadyMs: pageStats.readyMs.median,
                budgetReadyMs: budget.readyMs,
            });
        }
    }
    if (offenders.length === 0) {
        return { ok: true };
    }
    return { ok: false, offenders };
}

/**
 * Shape one history JSONL object from sweep stats.
 * Pages map carries each page's median readyMs and
 * median phase timings. Caller stringifies + appends.
 */
export function shapeHistoryLine(input: {
    at: string;
    sha: string;
    machine: HistoryLine['machine'];
    runs: number;
    stats: Record<string, PageStats>;
}): HistoryLine {
    const pages: HistoryLine['pages'] = {};
    for (const page of Object.keys(input.stats).sort()) {
        const s = input.stats[page]!;
        pages[page] = {
            readyMs: s.readyMs.median,
            phases: { ...s.phases },
        };
    }
    return {
        at: input.at,
        sha: input.sha,
        machine: input.machine,
        runs: input.runs,
        pages,
    };
}

/**
 * Human-readable multi-line table of page ×
 * min/median/max readyMs, with phase medians indented
 * under each page. Page keys sorted for stability.
 */
export function formatReport(
    stats: Record<string, PageStats>,
): string {
    const pages = Object.keys(stats).sort();
    if (pages.length === 0) {
        return 'No pages measured.';
    }
    const lines: string[] = [
        'page  min  median  max  (readyMs)',
    ];
    for (const page of pages) {
        const s = stats[page]!;
        const { min, median: med, max } = s.readyMs;
        lines.push(
            `${page}  ${min}  ${med}  ${max}`,
        );
        const phaseNames = Object.keys(s.phases).sort();
        for (const name of phaseNames) {
            lines.push(
                `  ${name}  ${s.phases[name]!}`,
            );
        }
    }
    return lines.join('\n');
}

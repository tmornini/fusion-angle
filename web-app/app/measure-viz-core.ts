// Pure view-model logic for ./measure --visualize.
// No I/O, no DOM — unit-tested only. Reuses HistoryLine
// and Budgets from measure-core; does not duplicate them.

import type {
    Budgets,
    HistoryLine,
} from './measure-core.ts';

export type DurationUnit = 'us' | 'ms' | 's';

export type FormatDurationOptions = {
    signed?: boolean;
};

const MINUS = '\u2212'; // −

export function formatDurationPerf(
    ms: number,
    options?: FormatDurationOptions,
): string {
    const signed = options?.signed === true;
    const abs = Math.abs(ms);
    let body: string;
    if (abs < 1) {
        const us = Math.round(abs * 1000);
        body = `${us} µs`;
    } else if (abs < 1000) {
        body = `${trimNum(abs, 3)} ms`;
    } else {
        body = `${trimNum(abs / 1000, 2)} s`;
    }
    if (ms < 0) {
        return `${MINUS}${body}`;
    }
    if (signed && ms > 0) {
        return `+${body}`;
    }
    return body;
}

function trimNum(n: number, maxDecimals: number): string {
    if (Number.isInteger(n)) {
        return String(n);
    }
    let s = n.toFixed(maxDecimals);
    if (s.includes('.')) {
        s = s.replace(/\.?0+$/, '');
    }
    return s;
}

export function pickAxisUnit(
    valuesMs: number[],
): DurationUnit {
    let max = 0;
    for (const v of valuesMs) {
        const a = Math.abs(v);
        if (a > max) max = a;
    }
    if (max < 1) return 'us';
    if (max < 1000) return 'ms';
    return 's';
}

export function formatAxisTick(
    ms: number,
    unit: DurationUnit,
): string {
    const abs = Math.abs(ms);
    let body: string;
    if (unit === 'us') {
        body = `${Math.round(abs * 1000)} µs`;
    } else if (unit === 'ms') {
        body = `${trimNum(abs, 3)} ms`;
    } else {
        body = `${trimNum(abs / 1000, 2)} s`;
    }
    if (ms < 0) return `${MINUS}${body}`;
    return body;
}

export function parseHistoryJsonl(text: string): HistoryLine[] {
    const rawLines = text.split('\n');
    const out: HistoryLine[] = [];
    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i]!.trim();
        if (line.length === 0) continue;
        let parsed: unknown;
        try {
            parsed = JSON.parse(line);
        } catch {
            throw new Error(
                `history.jsonl line ${i + 1}:`
                + ' unparseable JSON',
            );
        }
        if (!isHistoryLine(parsed)) {
            throw new Error(
                `history.jsonl line ${i + 1}:`
                + ' invalid shape',
            );
        }
        out.push(parsed);
    }
    if (out.length === 0) {
        throw new Error(
            'history.jsonl: no valid lines',
        );
    }
    return out;
}

function isHistoryLine(v: unknown): v is HistoryLine {
    if (v === null || typeof v !== 'object') {
        return false;
    }
    const o = v as Record<string, unknown>;
    if (typeof o.at !== 'string') return false;
    if (typeof o.sha !== 'string') return false;
    if (typeof o.runs !== 'number') return false;
    if (
        o.pages === null
        || typeof o.pages !== 'object'
    ) {
        return false;
    }
    if (
        o.machine === null
        || typeof o.machine !== 'object'
    ) {
        return false;
    }
    return true;
}

export function parseBudgetsJson(text: string): Budgets {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error(
            'budgets.json: unparseable JSON',
        );
    }
    if (
        parsed === null
        || typeof parsed !== 'object'
        || Array.isArray(parsed)
    ) {
        throw new Error(
            'budgets.json: expected object',
        );
    }
    const out: Budgets = {};
    for (const [page, val] of Object.entries(
        parsed as Record<string, unknown>,
    )) {
        if (
            val === null
            || typeof val !== 'object'
            || typeof (val as { readyMs?: unknown })
                .readyMs !== 'number'
        ) {
            throw new Error(
                `budgets.json: invalid entry for ${page}`,
            );
        }
        out[page] = {
            readyMs: (val as { readyMs: number })
                .readyMs,
        };
    }
    return out;
}

export const VIZ_PAYLOAD_VERSION = 1 as const;

export type RankSort = 'ready' | 'delta' | 'budget';

export type RankEntry = {
    page: string;
    readyMs: number | null;
    deltaMs: number | null;
    budgetPct: number | null;
};

export type PhaseBucket =
    | 'boot'
    | 'fetch'
    | 'render'
    | 'other';

export type PhaseRollup = {
    buckets: {
        boot: number;
        fetch: number;
        render: number;
        other: number;
    };
    /** Present phases only — never invented zeros. */
    phases: Array<{
        name: string;
        ms: number;
        bucket: PhaseBucket;
    }>;
};

export type VizPayload = {
    version: typeof VIZ_PAYLOAD_VERSION;
    generatedAt: string;
    compareDefault: {
        fromIndex: number;
        toIndex: number;
    };
    budgets: Budgets;
    sweeps: HistoryLine[];
};

export function budgetRatio(
    readyMs: number,
    budgetMs: number,
): number {
    return readyMs / budgetMs;
}

export function deltaReadyMs(
    fromMs: number | undefined,
    toMs: number | undefined,
): number | null {
    if (fromMs === undefined || toMs === undefined) {
        return null;
    }
    return toMs - fromMs;
}

/** Wire-stable; matches page-performance MEASURE_BOOT_PAGE_INIT. */
export const MEASURE_BOOT_PAGE_INIT =
    'boot:page-init';

export function phaseBucketFor(
    name: string,
): PhaseBucket {
    if (name.startsWith('boot:')) return 'boot';
    if (name.startsWith('fetch:')) return 'fetch';
    if (name.startsWith('render:')) return 'render';
    return 'other';
}

/**
 * Wall time inside boot:page-init that is not already
 * accounted for by nested fetch:* / render:* measures.
 * Undefined when page-init is absent. Nested sums may
 * exceed page-init when children overlap; residual
 * floors at 0 (no invented negative).
 */
export function residualPageInitMs(
    phases: Record<string, number>,
): number | undefined {
    const pageInit = phases[MEASURE_BOOT_PAGE_INIT];
    if (pageInit === undefined) {
        return undefined;
    }
    let nested = 0;
    for (const name of Object.keys(phases)) {
        if (
            name.startsWith('fetch:')
            || name.startsWith('render:')
        ) {
            nested += phases[name]!;
        }
    }
    return Math.max(0, pageInit - nested);
}

/**
 * Sum phases into boot / fetch / render / other without
 * double-counting nested work: boot:page-init contributes
 * only its residual after nested fetch:* and render:*.
 * The phase list shows residual ms for page-init so it
 * no longer ranks as a false parent span.
 */
export function rollupPhases(
    phases: Record<string, number>,
): PhaseRollup {
    const buckets = {
        boot: 0,
        fetch: 0,
        render: 0,
        other: 0,
    };
    const residual = residualPageInitMs(phases);
    const list: PhaseRollup['phases'] = [];
    for (const name of Object.keys(phases)) {
        const raw = phases[name]!;
        const bucket = phaseBucketFor(name);
        if (name === MEASURE_BOOT_PAGE_INIT) {
            const ms = residual ?? 0;
            buckets.boot += ms;
            list.push({ name, ms, bucket: 'boot' });
            continue;
        }
        buckets[bucket] += raw;
        list.push({ name, ms: raw, bucket });
    }
    // Longest duration first; name break for stability.
    list.sort((a, b) => {
        if (a.ms > b.ms) return -1;
        if (a.ms < b.ms) return 1;
        if (a.name < b.name) return -1;
        if (a.name > b.name) return 1;
        return 0;
    });
    return { buckets, phases: list };
}

export function pageKeysUnion(
    sweeps: HistoryLine[],
): string[] {
    const set = new Set<string>();
    for (const s of sweeps) {
        for (const k of Object.keys(s.pages)) {
            set.add(k);
        }
    }
    return [...set].sort();
}

export function rankPages(
    sweeps: HistoryLine[],
    budgets: Budgets,
    fromIndex: number,
    toIndex: number,
    sort: RankSort,
): RankEntry[] {
    const from = sweeps[fromIndex];
    const to = sweeps[toIndex];
    if (from === undefined || to === undefined) {
        throw new Error(
            'rankPages: compare index out of range',
        );
    }
    // Same-index compare (single-sweep default): Δ is n/a.
    const sameSweep = fromIndex === toIndex;
    const pages = pageKeysUnion(sweeps);
    const entries: RankEntry[] = pages.map((page) => {
        const toReady = to.pages[page]?.readyMs;
        const fromReady = from.pages[page]?.readyMs;
        const budget = budgets[page]?.readyMs;
        const readyMs =
            toReady === undefined ? null : toReady;
        const deltaMs = sameSweep
            ? null
            : deltaReadyMs(fromReady, toReady);
        const budgetPct =
            readyMs === null || budget === undefined
                ? null
                : budgetRatio(readyMs, budget);
        return { page, readyMs, deltaMs, budgetPct };
    });
    entries.sort((a, b) => {
        if (sort === 'ready') {
            return cmpNumDescNullLast(
                a.readyMs, b.readyMs,
            );
        }
        if (sort === 'delta') {
            return cmpNumDescNullLast(
                a.deltaMs, b.deltaMs,
            );
        }
        return cmpNumDescNullLast(
            a.budgetPct, b.budgetPct,
        );
    });
    return entries;
}

/** Descending numeric order; nulls always last. */
function cmpNumDescNullLast(
    a: number | null,
    b: number | null,
): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    if (a < b) return 1;
    if (a > b) return -1;
    return 0;
}

export function buildPayload(
    sweeps: HistoryLine[],
    budgets: Budgets,
    generatedAt: string,
): VizPayload {
    if (sweeps.length === 0) {
        throw new Error(
            'buildPayload: no sweeps',
        );
    }
    return {
        version: VIZ_PAYLOAD_VERSION,
        generatedAt,
        compareDefault: {
            fromIndex: 0,
            toIndex: sweeps.length - 1,
        },
        budgets,
        sweeps,
    };
}

/**
 * Sweep indices that should draw SHA ticks on a trend
 * chart for `page`. Only indices where the page has a
 * sample are candidates. Always keeps first/last
 * candidate; includes from/to only when sampled; thins
 * by even spacing when over maxLabels (default 8).
 */
export function trendLabelIndices(
    sweeps: HistoryLine[],
    page: string,
    fromIndex: number,
    toIndex: number,
    maxLabels?: number,
): number[] {
    const max = maxLabels ?? 8;
    const cands: number[] = [];
    for (let i = 0; i < sweeps.length; i++) {
        if (sweeps[i]?.pages[page] !== undefined) {
            cands.push(i);
        }
    }
    if (cands.length === 0) return [];
    if (cands.length <= max) return cands;

    const first = cands[0]!;
    const last = cands[cands.length - 1]!;
    const forced = new Set<number>([first, last]);
    if (cands.includes(fromIndex)) {
        forced.add(fromIndex);
    }
    if (cands.includes(toIndex)) {
        forced.add(toIndex);
    }

    if (forced.size >= max) {
        // Cap at max: first/last always; then from, to.
        if (max <= 1) return [first];
        const out = new Set<number>([first, last]);
        const room = max - out.size;
        const interiors: number[] = [];
        if (
            forced.has(fromIndex)
            && fromIndex !== first
            && fromIndex !== last
        ) {
            interiors.push(fromIndex);
        }
        if (
            forced.has(toIndex)
            && toIndex !== first
            && toIndex !== last
            && toIndex !== fromIndex
        ) {
            interiors.push(toIndex);
        }
        for (
            let i = 0;
            i < room && i < interiors.length;
            i++
        ) {
            out.add(interiors[i]!);
        }
        return [...out].sort((a, b) => a - b);
    }

    const picked = new Set<number>(forced);
    if (max >= 2) {
        for (let k = 0; k < max; k++) {
            if (picked.size >= max) break;
            const ci = Math.round(
                (k * (cands.length - 1)) / (max - 1),
            );
            picked.add(cands[ci]!);
        }
    }
    // Even spacing can collide; fill gaps if under max.
    if (picked.size < max) {
        for (const c of cands) {
            if (picked.size >= max) break;
            picked.add(c);
        }
    }
    return [...picked].sort((a, b) => a - b);
}

// --- page-set helpers (history surgery) ---

export function pageKeySet(sweep: HistoryLine): string[] {
    return Object.keys(sweep.pages).sort();
}

/**
 * Mode of page key sets across sweeps (sorted key join).
 * Ties break lexicographically on the joined key string
 * so the result is stable. Empty sweeps → [].
 */
export function dominantPageKeySet(
    sweeps: HistoryLine[],
): string[] {
    if (sweeps.length === 0) return [];
    const counts = new Map<string, number>();
    const sets = new Map<string, string[]>();
    for (const s of sweeps) {
        const keys = pageKeySet(s);
        const sig = keys.join('\0');
        counts.set(sig, (counts.get(sig) ?? 0) + 1);
        sets.set(sig, keys);
    }
    let bestSig = '';
    let bestCount = -1;
    for (const [sig, n] of counts) {
        if (
            n > bestCount
            || (n === bestCount && sig < bestSig)
        ) {
            bestCount = n;
            bestSig = sig;
        }
    }
    return sets.get(bestSig) ?? [];
}

/**
 * Keep only sweeps whose page key set equals `keys`
 * (same members; order independent via pageKeySet sort).
 */
export function filterFullRegistrySweeps(
    sweeps: HistoryLine[],
    keys: string[],
): HistoryLine[] {
    const want = keys.slice().sort().join('\0');
    return sweeps.filter((s) => {
        return pageKeySet(s).join('\0') === want;
    });
}

// --- system aggregates ---

export function meanReadyMs(
    sweep: HistoryLine,
): number | null {
    const pages = Object.values(sweep.pages);
    if (pages.length === 0) return null;
    let sum = 0;
    for (const p of pages) {
        sum += p.readyMs;
    }
    return sum / pages.length;
}

export type SystemReadyPoint = {
    index: number;
    meanMs: number;
    sampleCount: number;
};

export function systemReadySeries(
    sweeps: HistoryLine[],
    startIndex: number,
    endIndex: number,
): SystemReadyPoint[] {
    const out: SystemReadyPoint[] = [];
    const lo = Math.max(0, startIndex);
    const hi = Math.min(sweeps.length - 1, endIndex);
    for (let i = lo; i <= hi; i++) {
        const s = sweeps[i];
        if (s === undefined) continue;
        const pages = Object.values(s.pages);
        if (pages.length === 0) continue;
        let sum = 0;
        for (const p of pages) {
            sum += p.readyMs;
        }
        out.push({
            index: i,
            meanMs: sum / pages.length,
            sampleCount: pages.length,
        });
    }
    return out;
}

export function systemDeltaMs(
    sweeps: HistoryLine[],
    startIndex: number,
    endIndex: number,
): number | null {
    if (startIndex === endIndex) return null;
    const from = sweeps[startIndex];
    const to = sweeps[endIndex];
    if (from === undefined || to === undefined) {
        return null;
    }
    const a = meanReadyMs(from);
    const b = meanReadyMs(to);
    if (a === null || b === null) return null;
    return b - a;
}

export type BudgetPressureRow = {
    page: string;
    readyMs: number | null;
    budgetMs: number | null;
    budgetPct: number | null;
};

export type BudgetPressure = {
    over: number;
    within: number;
    unknown: number;
    rows: BudgetPressureRow[];
};

export function budgetPressure(
    sweeps: HistoryLine[],
    budgets: Budgets,
    endIndex: number,
): BudgetPressure {
    const to = sweeps[endIndex];
    if (to === undefined) {
        return {
            over: 0,
            within: 0,
            unknown: 0,
            rows: [],
        };
    }
    const pages = pageKeysUnion(sweeps);
    let over = 0;
    let within = 0;
    let unknown = 0;
    const rows: BudgetPressureRow[] = [];
    for (const page of pages) {
        const readyMs = to.pages[page]?.readyMs;
        const budgetMs = budgets[page]?.readyMs;
        if (
            readyMs === undefined
            || budgetMs === undefined
        ) {
            unknown += 1;
            rows.push({
                page,
                readyMs: readyMs === undefined
                    ? null
                    : readyMs,
                budgetMs: budgetMs === undefined
                    ? null
                    : budgetMs,
                budgetPct: null,
            });
            continue;
        }
        const pct = budgetRatio(readyMs, budgetMs);
        if (readyMs > budgetMs) {
            over += 1;
        } else {
            within += 1;
        }
        rows.push({
            page,
            readyMs,
            budgetMs,
            budgetPct: pct,
        });
    }
    rows.sort((a, b) => {
        return cmpNumDescNullLast(
            a.budgetPct, b.budgetPct,
        );
    });
    return { over, within, unknown, rows };
}

export type MeanPhaseBuckets = {
    boot: number;
    fetch: number;
    render: number;
    other: number;
};

export function meanPhaseBuckets(
    sweeps: HistoryLine[],
    endIndex: number,
): MeanPhaseBuckets {
    const empty = {
        boot: 0, fetch: 0, render: 0, other: 0,
    };
    const to = sweeps[endIndex];
    if (to === undefined) return empty;
    const pageEntries = Object.values(to.pages);
    if (pageEntries.length === 0) return empty;
    let boot = 0;
    let fetch = 0;
    let render = 0;
    let other = 0;
    for (const p of pageEntries) {
        const r = rollupPhases(p.phases);
        boot += r.buckets.boot;
        fetch += r.buckets.fetch;
        render += r.buckets.render;
        other += r.buckets.other;
    }
    const n = pageEntries.length;
    return {
        boot: boot / n,
        fetch: fetch / n,
        render: render / n,
        other: other / n,
    };
}

export type SystemMetrics = {
    sweepsInWindow: number;
    totalSweeps: number;
    pageCount: number;
    meanReadyMs: number | null;
    systemDeltaMs: number | null;
    overBudget: number;
    budgetP50: number | null;
};

export function systemMetrics(
    sweeps: HistoryLine[],
    budgets: Budgets,
    startIndex: number,
    endIndex: number,
): SystemMetrics {
    const totalSweeps = sweeps.length;
    const lo = Math.min(startIndex, endIndex);
    const hi = Math.max(startIndex, endIndex);
    const sweepsInWindow = totalSweeps === 0
        ? 0
        : hi - lo + 1;
    const pageCount = pageKeysUnion(sweeps).length;
    const endSweep = sweeps[endIndex];
    const meanReady = endSweep === undefined
        ? null
        : meanReadyMs(endSweep);
    const delta = systemDeltaMs(
        sweeps, startIndex, endIndex,
    );
    const pressure = budgetPressure(
        sweeps, budgets, endIndex,
    );
    const pcts: number[] = [];
    for (const row of pressure.rows) {
        if (row.budgetPct !== null) {
            pcts.push(row.budgetPct);
        }
    }
    let budgetP50: number | null = null;
    if (pcts.length > 0) {
        const sorted = pcts.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 1) {
            budgetP50 = sorted[mid]!;
        } else {
            budgetP50 =
                (sorted[mid - 1]! + sorted[mid]!) / 2;
        }
    }
    return {
        sweepsInWindow,
        totalSweeps,
        pageCount,
        meanReadyMs: meanReady,
        systemDeltaMs: delta,
        overBudget: pressure.over,
        budgetP50,
    };
}

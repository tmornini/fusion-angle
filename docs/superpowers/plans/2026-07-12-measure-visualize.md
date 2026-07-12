# Measure History Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Generate a self-contained, gitignored HTML report
from committed `measurements/history.jsonl` +
`measurements/budgets.json` so engineers can rank pages,
compare any two sweeps, and inspect ready / phase / budget
slices without re-running Chrome.

**Architecture:** Pure type-checked core
(`measure-viz-core.ts`) parses history, formats durations,
ranks pages, rolls up phases, and builds a versioned
payload. A Node-only generator (`measure-viz.ts`) embeds
that payload in Layout B HTML (rank list + focused detail)
with inline CSS/JS and zero runtime deps. Thin hooks in
`measure.ts` add `--visualize` (early path for bare flag;
post-run hook after a measure sweep). Math lives only in
the pure core; the HTML client re-ranks/refreshes from the
embedded payload.

**Tech Stack:** Vanilla TypeScript ES2024, zero runtime
deps, `node:test` via `./test` / `./validate`, Node
`--strip-types` for generators (same as `measure.ts`).

**Spec of record:**
`docs/superpowers/specs/2026-07-12-measure-visualize-design.md`
(approved 2026-07-12). Decisions there are binding — do not
re-litigate Layout B, adaptive duration display, pickable
compare pair, generate-only artifact, embed-JSON, budgets
required, or CLI behavior.

## Global Constraints

- Branch stays `master` (or current work branch); NO
  worktrees (CLAUDE.md). Linear history; rebase-only.
- `./validate` MUST pass before every commit (types + tests
  + 78-char line lint on `.ts`/`.html`/`.css` sources +
  SCHEMA.svg drift). Generated `measurements/index.html` is
  **not** linted (outside validate paths).
- Max line length **78 chars**; 4-space indent; no trailing
  whitespace; final newline on source files.
- Commit subject: one line ≈50 chars, present-tense
  imperative; trailer:

      Co-Authored-By: Grok Build <grok@x.ai>

- TDD for pure core: failing test → implement → pass →
  commit. Never weaken assertions.
- Reuse `HistoryLine` and `Budgets` from `measure-core.ts`.
  Do not duplicate those types.
- Do **not** reuse `duration-units.ts` (flow-seconds ladder).
- Do **not** add chart libraries, CDNs, or runtime deps.
- Do **not** wire `./measure` into `./validate`.
- Do **not** commit `measurements/index.html`.
- `measure-viz-core.ts` is type-checked (like
  `measure-core.ts`). `measure-viz.ts` is tsconfig-excluded
  (like `measure.ts`).
- `exactOptionalPropertyTypes` is on — prefer `| null`
  over optional fields for explicit absence.
- Subagent dispatch: every subagent prompt begins with
  `Go to Medium Church!` plus CLAUDE.md § Subagents
  pushdowns (voice rules, commandments, abominations,
  patterns).

## File Map

| File | Responsibility |
| --- | --- |
| `web-app/app/measure-viz-core.ts` | Pure parse / format / rank / delta / phase rollup / budget ratio / `buildPayload` |
| `tests/measure-viz-core.test.ts` | Unit tests for every pure export |
| `web-app/app/measure-viz.ts` | Read history + budgets from disk; emit HTML |
| `web-app/app/measure.ts` | `--visualize` CLI parse; early exit; post-run hook |
| `web-app/app/tsconfig.json` | Exclude `measure-viz.ts` only |
| `./measure` | Comment lists `--visualize` |
| `.gitignore` | `measurements/index.html` |
| `CLAUDE.md` | § Measurement documents the flag |
| `measurements/index.html` | Generated only; never committed |

## Task Map (spec sequencing)

| Task | Spec step | Commit subject |
| --- | --- | --- |
| 1 | 1 (pure core) | `add measure history visualizer pure core` |
| 2 | 2 (HTML emit) | `generate Layout B measure history HTML` |
| 3 | 3 (CLI hooks) | `wire measure --visualize flag and paths` |
| 4 | 4 (docs) | `document measure --visualize in CLAUDE.md` |

---

### Task 1: Pure core + unit tests

**Files:**
- Create: `web-app/app/measure-viz-core.ts`
- Create: `tests/measure-viz-core.test.ts`

**Interfaces (produce all of these in this task):**

```ts
// Imports
import type {
    Budgets,
    HistoryLine,
} from './measure-core.ts';

export const VIZ_PAYLOAD_VERSION = 1 as const;

export type RankSort = 'ready' | 'delta' | 'budget';

export type RankEntry = {
    page: string;
    readyMs: number | null;   // "to" sweep median
    deltaMs: number | null;   // to − from; null if either missing
    budgetPct: number | null; // ready/budget; null if either missing
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
    generatedAt: string; // ISO
    compareDefault: {
        fromIndex: number;
        toIndex: number;
    };
    budgets: Budgets;
    sweeps: HistoryLine[];
};

export type DurationUnit = 'us' | 'ms' | 's';
```

- [ ] **Step 1: Write failing tests for `formatDurationPerf`**

Create `tests/measure-viz-core.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    formatDurationPerf,
    pickAxisUnit,
    formatAxisTick,
    parseHistoryJsonl,
    parseBudgetsJson,
    budgetRatio,
    deltaReadyMs,
    rollupPhases,
    rankPages,
    buildPayload,
    VIZ_PAYLOAD_VERSION,
    type HistoryLine,
    // RankEntry / types only if needed for locals
} from '../web-app/app/measure-viz-core.ts';
import type {
    Budgets,
    HistoryLine as CoreHistoryLine,
} from '../web-app/app/measure-core.ts';

// Prefer importing HistoryLine from measure-viz-core
// only if re-exported; otherwise use measure-core's.
// Plan: re-export nothing — import HistoryLine from
// measure-core in the test file.

test('formatDurationPerf sub-ms as integer µs', () => {
    assert.equal(formatDurationPerf(0.4), '400 µs');
    assert.equal(formatDurationPerf(0), '0 µs');
    assert.equal(formatDurationPerf(0.001), '1 µs');
});

test('formatDurationPerf ms band', () => {
    assert.equal(formatDurationPerf(245), '245 ms');
    assert.equal(formatDurationPerf(1), '1 ms');
    assert.equal(formatDurationPerf(1.5), '1.5 ms');
    assert.equal(formatDurationPerf(999.4), '999.4 ms');
});

test('formatDurationPerf seconds band', () => {
    assert.equal(formatDurationPerf(1000), '1 s');
    assert.equal(formatDurationPerf(3280), '3.28 s');
    assert.equal(formatDurationPerf(3282.75), '3.28 s');
});

test('formatDurationPerf signed deltas keep sign', () => {
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

test('formatDurationPerf absolute ignores plus', () => {
    assert.equal(formatDurationPerf(12), '12 ms');
    assert.equal(formatDurationPerf(-12), '−12 ms');
});
```

Rules the implementation must honor (from spec §B):

| Range (absolute ms) | Display |
| --- | --- |
| `\|x\| < 1` | integer µs, e.g. `400 µs` |
| `1 ≤ \|x\| < 1000` | ms, e.g. `245 ms`, `1.5 ms` |
| `\|x\| ≥ 1000` | s, e.g. `3.28 s` |

- Space before unit.
- Use Unicode minus `−` (U+2212), not ASCII hyphen, for
  negative and for signed negative.
- µs: `Math.round(Math.abs(ms) * 1000)` then apply sign.
- ms: if whole number after reasonable display, print
  without trailing `.0`; otherwise up to one decimal when
  needed (pin `1.5 ms`). Use:
  - For `|ms| < 1000` and `|ms| >= 1`: if
    `Number.isInteger(abs)` show integer; else strip
    trailing zeros from one-decimal / three-decimal as
    needed so `1.5` and `999.4` pass.
  - Practical helper: format number with up to 3 decimals
    then trim trailing zeros — but pin the cases above.
- s: `abs/1000` with up to 2 decimals, trim trailing zeros
  (`3.28 s`, `1 s`).
- `{ signed: true }`: prefix `+` when value > 0; `−` when
  value < 0; zero stays unsigned `0 µs`.

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

```bash
node --test --strip-types tests/measure-viz-core.test.ts
```

Expected: FAIL — cannot find module / not exported.

- [ ] **Step 3: Implement `formatDurationPerf` + axis helpers**

Create `web-app/app/measure-viz-core.ts` (start of file):

```ts
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

/**
 * Adaptive duration for rank/KPI cells. Internal values
 * stay ms; display ladder is µs / ms / s (not
 * duration-units.ts).
 */
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

/** Trim trailing zeros after toFixed; drop trailing dot. */
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

/**
 * One unit for a whole chart axis so ticks stay
 * comparable. Uses max |value|.
 */
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
```

- [ ] **Step 4: Run duration tests — expect PASS**

```bash
node --test --strip-types tests/measure-viz-core.test.ts
```

If `3282.75` → `3.28 s` fails on rounding, pin
`toFixed(2)` then trim (`3282.75/1000 = 3.28275` →
`3.28`). Adjust `trimNum` only if needed; do not weaken
tests.

- [ ] **Step 5: Add axis unit tests**

Append:

```ts
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
```

Run tests — PASS.

- [ ] **Step 6: Write failing tests for parse + edges**

```ts
function sampleSweep(
    at: string,
    pages: CoreHistoryLine['pages'],
): CoreHistoryLine {
    return {
        at,
        sha: 'abc1234',
        machine: {
            platform: 'darwin',
            arch: 'arm64',
            cpuModel: 'test',
            cpuCount: 1,
        },
        runs: 5,
        pages,
    };
}

test('parseHistoryJsonl happy path', () => {
    const a = sampleSweep('2026-01-01T00:00:00.000Z', {
        auth: { readyMs: 100, phases: {} },
    });
    const b = sampleSweep('2026-01-02T00:00:00.000Z', {
        auth: { readyMs: 200, phases: {} },
    });
    const text =
        JSON.stringify(a) + '\n'
        + JSON.stringify(b) + '\n';
    const sweeps = parseHistoryJsonl(text);
    assert.equal(sweeps.length, 2);
    assert.equal(sweeps[0]!.pages.auth!.readyMs, 100);
    assert.equal(sweeps[1]!.pages.auth!.readyMs, 200);
});

test('parseHistoryJsonl skips blank lines', () => {
    const a = sampleSweep('2026-01-01T00:00:00.000Z', {
        auth: { readyMs: 1, phases: {} },
    });
    const text = '\n' + JSON.stringify(a) + '\n\n';
    assert.equal(parseHistoryJsonl(text).length, 1);
});

test('parseHistoryJsonl empty throws', () => {
    assert.throws(
        () => parseHistoryJsonl(''),
        /no valid lines|empty/i,
    );
    assert.throws(
        () => parseHistoryJsonl('\n\n'),
        /no valid lines|empty/i,
    );
});

test('parseHistoryJsonl bad line names line number', () => {
    const a = sampleSweep('2026-01-01T00:00:00.000Z', {
        auth: { readyMs: 1, phases: {} },
    });
    const text =
        JSON.stringify(a) + '\n'
        + '{not-json\n';
    assert.throws(
        () => parseHistoryJsonl(text),
        /line 2/i,
    );
});

test('parseBudgetsJson happy path', () => {
    const budgets = parseBudgetsJson(
        JSON.stringify({
            auth: { readyMs: 367 },
            workbox: { readyMs: 4000 },
        }),
    );
    assert.equal(budgets.auth!.readyMs, 367);
    assert.equal(budgets.workbox!.readyMs, 4000);
});

test('parseBudgetsJson bad JSON throws', () => {
    assert.throws(
        () => parseBudgetsJson('{'),
        /budget/i,
    );
});
```

- [ ] **Step 7: Implement parse helpers**

Append to `measure-viz-core.ts`:

```ts
/**
 * Parse measurements/history.jsonl text. Blank lines
 * skipped. Unparseable line → Error with 1-based line
 * number. Zero valid lines → Error.
 */
export function parseHistoryJsonl(
    text: string,
): HistoryLine[] {
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

/**
 * Parse measurements/budgets.json text.
 */
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
```

- [ ] **Step 8: Run parse tests — PASS**

```bash
node --test --strip-types tests/measure-viz-core.test.ts
```

- [ ] **Step 9: Write failing tests for ratio, delta, rollup, rank, payload**

```ts
test('budgetRatio is ready/budget', () => {
    assert.equal(budgetRatio(500, 1000), 0.5);
    assert.equal(budgetRatio(3282.75, 3282.75), 1);
    assert.equal(budgetRatio(200, 100), 2);
});

test('deltaReadyMs null when either side missing', () => {
    assert.equal(deltaReadyMs(100, 200), 100);
    assert.equal(deltaReadyMs(200, 100), -100);
    assert.equal(deltaReadyMs(undefined, 100), null);
    assert.equal(deltaReadyMs(100, undefined), null);
    assert.equal(deltaReadyMs(undefined, undefined), null);
});

test('rollupPhases sums by prefix; omits missing', () => {
    const r = rollupPhases({
        'boot:db-open': 10,
        'boot:page-init': 20,
        'fetch:list': 40,
        'render:list': 5,
        'mystery:x': 7,
    });
    assert.equal(r.buckets.boot, 30);
    assert.equal(r.buckets.fetch, 40);
    assert.equal(r.buckets.render, 5);
    assert.equal(r.buckets.other, 7);
    assert.equal(r.phases.length, 5);
    assert.ok(
        !r.phases.some((p) => p.ms === 0 && p.name === 'nope'),
    );
    const names = r.phases.map((p) => p.name).sort();
    assert.deepEqual(names, [
        'boot:db-open',
        'boot:page-init',
        'fetch:list',
        'mystery:x',
        'render:list',
    ]);
});

test('rollupPhases empty phases is all-zero buckets', () => {
    const r = rollupPhases({});
    assert.deepEqual(r.buckets, {
        boot: 0,
        fetch: 0,
        render: 0,
        other: 0,
    });
    assert.equal(r.phases.length, 0);
});

test('rankPages ready descending default math', () => {
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
    const budgets: Budgets = {
        slow: { readyMs: 200 },
        fast: { readyMs: 100 },
        // mid has no budget
    };
    const ready = rankPages(
        sweeps, budgets, 0, 1, 'ready',
    );
    assert.deepEqual(
        ready.map((e) => e.page),
        ['slow', 'mid', 'fast'],
    );
    assert.equal(ready[0]!.readyMs, 300);
    assert.equal(ready[0]!.deltaMs, 200);
    assert.equal(ready[0]!.budgetPct, 1.5);

    const delta = rankPages(
        sweeps, budgets, 0, 1, 'delta',
    );
    // slow +200, mid null (only in to), fast -10
    // nulls last when sorting delta
    assert.equal(delta[0]!.page, 'slow');
    assert.equal(delta[1]!.page, 'fast');
    assert.equal(delta[2]!.page, 'mid');
    assert.equal(delta[2]!.deltaMs, null);

    const budget = rankPages(
        sweeps, budgets, 0, 1, 'budget',
    );
    // slow 1.5, fast 0.4, mid null last
    assert.equal(budget[0]!.page, 'slow');
    assert.equal(budget[1]!.page, 'fast');
    assert.equal(budget[2]!.page, 'mid');
    assert.equal(budget[2]!.budgetPct, null);
});

test('rankPages single sweep delta null', () => {
    const sweeps = [
        sampleSweep('a', {
            auth: { readyMs: 100, phases: {} },
        }),
    ];
    const ranked = rankPages(
        sweeps, { auth: { readyMs: 200 } }, 0, 0, 'ready',
    );
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]!.deltaMs, null);
    assert.equal(ranked[0]!.budgetPct, 0.5);
});

test('buildPayload version and compareDefault', () => {
    const sweeps = [
        sampleSweep('a', {
            auth: { readyMs: 1, phases: {} },
        }),
        sampleSweep('b', {
            auth: { readyMs: 2, phases: {} },
        }),
    ];
    const budgets: Budgets = {
        auth: { readyMs: 10 },
    };
    const p = buildPayload(
        sweeps, budgets, '2026-07-12T00:00:00.000Z',
    );
    assert.equal(p.version, VIZ_PAYLOAD_VERSION);
    assert.equal(p.version, 1);
    assert.equal(p.sweeps.length, 2);
    assert.deepEqual(p.compareDefault, {
        fromIndex: 0,
        toIndex: 1,
    });
    assert.equal(
        p.generatedAt, '2026-07-12T00:00:00.000Z',
    );
});

test('buildPayload single sweep compare indexes', () => {
    const sweeps = [
        sampleSweep('a', {
            auth: { readyMs: 1, phases: {} },
        }),
    ];
    const p = buildPayload(
        sweeps, {}, '2026-07-12T00:00:00.000Z',
    );
    assert.deepEqual(p.compareDefault, {
        fromIndex: 0,
        toIndex: 0,
    });
});

test('buildPayload empty sweeps throws', () => {
    assert.throws(
        () => buildPayload(
            [], {}, '2026-07-12T00:00:00.000Z',
        ),
        /sweep/i,
    );
});
```

- [ ] **Step 10: Implement remaining pure exports**

Append to `measure-viz-core.ts`:

```ts
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

export function phaseBucketFor(
    name: string,
): PhaseBucket {
    if (name.startsWith('boot:')) return 'boot';
    if (name.startsWith('fetch:')) return 'fetch';
    if (name.startsWith('render:')) return 'render';
    return 'other';
}

/**
 * Sum phase ms by name prefix. Missing phases omitted
 * from `phases` — never invented as zero. Empty `other`
 * bucket value may be 0 when no unknown prefixes.
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
    const list: PhaseRollup['phases'] = [];
    const names = Object.keys(phases).sort();
    for (const name of names) {
        const ms = phases[name]!;
        const bucket = phaseBucketFor(name);
        buckets[bucket] += ms;
        list.push({ name, ms, bucket });
    }
    return { buckets, phases: list };
}

/** Union of page keys across sweeps, sorted. */
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

/**
 * Rank pages for compare pair. ready: to-sweep median
 * desc. delta: (to−from) desc; nulls last. budget:
 * ready/budget desc; nulls last.
 */
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
    const pages = pageKeysUnion(sweeps);
    const entries: RankEntry[] = pages.map((page) => {
        const toReady = to.pages[page]?.readyMs;
        const fromReady = from.pages[page]?.readyMs;
        const budget = budgets[page]?.readyMs;
        const readyMs =
            toReady === undefined ? null : toReady;
        const deltaMs = deltaReadyMs(fromReady, toReady);
        const budgetPct =
            readyMs === null || budget === undefined
                ? null
                : budgetRatio(readyMs, budget);
        return { page, readyMs, deltaMs, budgetPct };
    });
    entries.sort((a, b) => {
        if (sort === 'ready') {
            return cmpNumNullLast(
                b.readyMs, a.readyMs,
            );
        }
        if (sort === 'delta') {
            return cmpNumNullLast(
                b.deltaMs, a.deltaMs,
            );
        }
        return cmpNumNullLast(
            b.budgetPct, a.budgetPct,
        );
    });
    return entries;
}

/** Higher first when both present; nulls last. */
function cmpNumNullLast(
    a: number | null,
    b: number | null,
): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    if (a < b) return -1;
    if (a > b) return 1;
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
```

Note on delta sort for `mid` only in `to`:
`deltaReadyMs(undefined, 150)` is `null` — N/A last.
Good.

Note on ready sort with null ready (page only in from):
`readyMs` null — should sort last under ready desc. The
`cmpNumNullLast(b.readyMs, a.readyMs)` with nulls last
on the "higher first" comparison: when comparing for
desc, we pass `(b, a)` so null on b → return 1 means b
after a... Actually `cmpNumNullLast(b, a)`: if b is null
and a is number, `b === null` → return 1, so sort says
b > a in comparator terms which puts b later in
ascending sort — good (null last). If a is null and b is
number, return -1, b before a — good.

- [ ] **Step 11: Run all core tests — PASS**

```bash
node --test --strip-types tests/measure-viz-core.test.ts
./validate
```

Expected: all green. Fix 78-char / types if validate
complains.

- [ ] **Step 12: Commit**

```bash
git add web-app/app/measure-viz-core.ts \
  tests/measure-viz-core.test.ts
git commit -m "$(cat <<'EOF'
add measure history visualizer pure core

Co-Authored-By: Grok Build <grok@x.ai>
EOF
)"
```

---

### Task 2: Node HTML generator (Layout B)

**Files:**
- Create: `web-app/app/measure-viz.ts`
- Modify: `web-app/app/tsconfig.json` (exclude
  `./measure-viz.ts`)

**Paths (hardcoded, same family as measure):**

- History: `measurements/history.jsonl`
- Budgets: `measurements/budgets.json`
- Output: `measurements/index.html`

- [ ] **Step 1: Exclude generator from tsc**

In `web-app/app/tsconfig.json`, add `./measure-viz.ts` to
`exclude` next to `./measure.ts`:

```json
"exclude": [
    "./compose.ts",
    "./generate-schema-svg.ts",
    "./measure.ts",
    "./measure-viz.ts"
]
```

- [ ] **Step 2: Implement `measure-viz.ts`**

Create `web-app/app/measure-viz.ts` with the full module
below. Keep every source line ≤78 chars. The embedded
client script is a string; prefer concise JS inside the
template but keep the outer TS file lint-clean.

```ts
// Node-only generator for ./measure --visualize.
// Reads history + budgets from disk; embeds a versioned
// payload in self-contained Layout B HTML. Excluded from
// browser tsc (Node APIs).

import {
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import {
    buildPayload,
    parseBudgetsJson,
    parseHistoryJsonl,
    VIZ_PAYLOAD_VERSION,
    type VizPayload,
} from './measure-viz-core.ts';

export const HISTORY_PATH =
    'measurements/history.jsonl';
export const BUDGETS_PATH =
    'measurements/budgets.json';
export const VIZ_OUTPUT_PATH =
    'measurements/index.html';

/**
 * Read disk history + budgets, write measurements/
 * index.html. Throws named Errors (caller maps to exit 1).
 */
export function generateMeasureViz(
    repoRoot: string,
    generatedAt: string = new Date().toISOString(),
): string {
    const historyFile = join(repoRoot, HISTORY_PATH);
    const budgetsFile = join(repoRoot, BUDGETS_PATH);
    const outFile = join(repoRoot, VIZ_OUTPUT_PATH);

    if (!existsSync(historyFile)) {
        throw new Error(
            `visualize: missing history file: `
            + historyFile,
        );
    }
    if (!existsSync(budgetsFile)) {
        throw new Error(
            `visualize: missing budgets file: `
            + budgetsFile,
        );
    }

    let historyText: string;
    let budgetsText: string;
    try {
        historyText = readFileSync(
            historyFile, 'utf8',
        );
    } catch (err: unknown) {
        const msg = err instanceof Error
            ? err.message
            : String(err);
        throw new Error(
            `visualize: cannot read ${historyFile}: `
            + msg,
        );
    }
    try {
        budgetsText = readFileSync(
            budgetsFile, 'utf8',
        );
    } catch (err: unknown) {
        const msg = err instanceof Error
            ? err.message
            : String(err);
        throw new Error(
            `visualize: cannot read ${budgetsFile}: `
            + msg,
        );
    }

    const sweeps = parseHistoryJsonl(historyText);
    const budgets = parseBudgetsJson(budgetsText);
    const payload = buildPayload(
        sweeps, budgets, generatedAt,
    );
    const html = renderVizHtml(payload);

    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, html, 'utf8');
    return outFile;
}

function renderVizHtml(payload: VizPayload): string {
    const json = JSON.stringify(payload)
        .replace(/</g, '\\u003c');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Measure history</title>
<style>
:root {
  --bg: #0f1115;
  --panel: #171a21;
  --border: #2a3140;
  --text: #e7ecf3;
  --muted: #9aa6b2;
  --accent: #6ea8fe;
  --good: #3dd68c;
  --bad: #f07178;
  --boot: #6ea8fe;
  --fetch: #f0c674;
  --render: #c678dd;
  --other: #9aa6b2;
  --budget: #56b6c2;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}
header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}
header h1 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  margin-right: auto;
}
header label {
  font-size: 0.8rem;
  color: var(--muted);
  display: flex;
  gap: 6px;
  align-items: center;
}
header select {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 8px;
}
.summary {
  font-size: 0.8rem;
  color: var(--muted);
}
.layout {
  display: grid;
  grid-template-columns: minmax(240px, 320px) 1fr;
  min-height: calc(100vh - 56px);
}
@media (max-width: 800px) {
  .layout { grid-template-columns: 1fr; }
}
.rank, .focus {
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.focus { border-right: 0; }
.tabs {
  display: flex;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}
.tabs button {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 0.8rem;
}
.tabs button[aria-selected="true"] {
  color: var(--text);
  border-color: var(--accent);
  background: #1c2433;
}
.rank-list {
  overflow: auto;
  flex: 1;
}
.rank-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  font-size: 0.85rem;
}
.rank-row:hover { background: #1a2030; }
.rank-row[aria-selected="true"] {
  background: #1c2a40;
  box-shadow: inset 3px 0 0 var(--accent);
}
.rank-meta {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.kpi-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.kpi {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  min-width: 120px;
}
.kpi .label {
  font-size: 0.7rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.kpi .value {
  font-size: 1.1rem;
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}
.panel-body { padding: 16px; flex: 1; }
.trend-svg {
  width: 100%;
  height: 260px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.bar-stack {
  display: flex;
  height: 28px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--border);
  margin: 12px 0;
}
.bar-seg { height: 100%; min-width: 0; }
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 0.8rem;
  color: var(--muted);
  margin-bottom: 12px;
}
.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 4px;
}
.phase-list, .budget-block {
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
.phase-list div, .budget-block div {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}
.muted { color: var(--muted); }
.delta-pos { color: var(--bad); }
.delta-neg { color: var(--good); }
.budget-track {
  height: 16px;
  background: #222833;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--border);
  margin-top: 8px;
}
.budget-fill {
  height: 100%;
  background: var(--budget);
}
.budget-fill.over { background: var(--bad); }
</style>
</head>
<body>
<header>
  <h1>Measure history</h1>
  <span class="summary" id="summary"></span>
  <label>From
    <select id="from-sel" aria-label="Compare from sweep"></select>
  </label>
  <label>To
    <select id="to-sel" aria-label="Compare to sweep"></select>
  </label>
</header>
<div class="layout">
  <section class="rank" aria-label="Page rank">
    <div class="tabs" role="tablist" aria-label="Rank sort">
      <button type="button" role="tab" data-sort="ready"
        aria-selected="true">ready</button>
      <button type="button" role="tab" data-sort="delta"
        aria-selected="false">Δ</button>
      <button type="button" role="tab" data-sort="budget"
        aria-selected="false">budget%</button>
    </div>
    <div class="rank-list" id="rank-list" role="listbox"
      aria-label="Pages"></div>
  </section>
  <section class="focus" aria-label="Page focus">
    <div class="tabs" role="tablist" aria-label="Focus mode">
      <button type="button" role="tab" data-mode="trend"
        aria-selected="true">trend</button>
      <button type="button" role="tab" data-mode="phase"
        aria-selected="false">phase</button>
      <button type="button" role="tab" data-mode="budget"
        aria-selected="false">budget</button>
    </div>
    <div class="kpi-row" id="kpis"></div>
    <div class="panel-body" id="focus-body"></div>
  </section>
</div>
<script type="application/json" id="payload">${json}</script>
<script>
(function () {
  var raw = document.getElementById('payload').textContent;
  var payload = JSON.parse(raw);
  if (payload.version !== ${VIZ_PAYLOAD_VERSION}) {
    document.body.innerHTML =
      '<p>Unsupported payload version '
      + payload.version + '</p>';
    return;
  }
  var sweeps = payload.sweeps;
  var budgets = payload.budgets;
  var fromIndex = payload.compareDefault.fromIndex;
  var toIndex = payload.compareDefault.toIndex;
  var sort = 'ready';
  var mode = 'trend';
  var focused = null;
  var MINUS = '\\u2212';

  function trimNum(n, maxDecimals) {
    if (Number.isInteger(n)) return String(n);
    var s = n.toFixed(maxDecimals);
    if (s.indexOf('.') !== -1) {
      s = s.replace(/\\.?0+$/, '');
    }
    return s;
  }
  function formatDurationPerf(ms, signed) {
    var abs = Math.abs(ms);
    var body;
    if (abs < 1) {
      body = Math.round(abs * 1000) + ' µs';
    } else if (abs < 1000) {
      body = trimNum(abs, 3) + ' ms';
    } else {
      body = trimNum(abs / 1000, 2) + ' s';
    }
    if (ms < 0) return MINUS + body;
    if (signed && ms > 0) return '+' + body;
    return body;
  }
  function pickAxisUnit(values) {
    var max = 0;
    for (var i = 0; i < values.length; i++) {
      var a = Math.abs(values[i]);
      if (a > max) max = a;
    }
    if (max < 1) return 'us';
    if (max < 1000) return 'ms';
    return 's';
  }
  function toAxis(ms, unit) {
    if (unit === 'us') return ms * 1000;
    if (unit === 'ms') return ms;
    return ms / 1000;
  }
  function formatAxisTick(ms, unit) {
    var abs = Math.abs(ms);
    var body;
    if (unit === 'us') {
      body = Math.round(abs * 1000) + ' µs';
    } else if (unit === 'ms') {
      body = trimNum(abs, 3) + ' ms';
    } else {
      body = trimNum(abs / 1000, 2) + ' s';
    }
    if (ms < 0) return MINUS + body;
    return body;
  }
  function pageKeysUnion() {
    var set = {};
    for (var s = 0; s < sweeps.length; s++) {
      var pages = sweeps[s].pages;
      for (var k in pages) {
        if (Object.prototype.hasOwnProperty.call(pages, k)) {
          set[k] = true;
        }
      }
    }
    return Object.keys(set).sort();
  }
  function cmpNumNullLast(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  function rankPages() {
    var from = sweeps[fromIndex];
    var to = sweeps[toIndex];
    var keys = pageKeysUnion();
    var entries = keys.map(function (page) {
      var toReady = to.pages[page]
        ? to.pages[page].readyMs
        : undefined;
      var fromReady = from.pages[page]
        ? from.pages[page].readyMs
        : undefined;
      var budget = budgets[page]
        ? budgets[page].readyMs
        : undefined;
      var readyMs = toReady === undefined ? null : toReady;
      var deltaMs =
        fromReady === undefined || toReady === undefined
          ? null
          : toReady - fromReady;
      var budgetPct =
        readyMs === null || budget === undefined
          ? null
          : readyMs / budget;
      return {
        page: page,
        readyMs: readyMs,
        deltaMs: deltaMs,
        budgetPct: budgetPct,
      };
    });
    entries.sort(function (a, b) {
      if (sort === 'ready') {
        return cmpNumNullLast(b.readyMs, a.readyMs);
      }
      if (sort === 'delta') {
        return cmpNumNullLast(b.deltaMs, a.deltaMs);
      }
      return cmpNumNullLast(b.budgetPct, a.budgetPct);
    });
    return entries;
  }
  function phaseBucket(name) {
    if (name.indexOf('boot:') === 0) return 'boot';
    if (name.indexOf('fetch:') === 0) return 'fetch';
    if (name.indexOf('render:') === 0) return 'render';
    return 'other';
  }
  function rollupPhases(phases) {
    var buckets = {
      boot: 0, fetch: 0, render: 0, other: 0,
    };
    var list = [];
    var names = Object.keys(phases || {}).sort();
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var ms = phases[name];
      var bucket = phaseBucket(name);
      buckets[bucket] += ms;
      list.push({ name: name, ms: ms, bucket: bucket });
    }
    return { buckets: buckets, phases: list };
  }
  function sweepLabel(i) {
    var s = sweeps[i];
    var at = s.at.slice(0, 19).replace('T', ' ');
    return at + ' · ' + s.sha;
  }
  function fillSelectors() {
    var fromSel = document.getElementById('from-sel');
    var toSel = document.getElementById('to-sel');
    fromSel.innerHTML = '';
    toSel.innerHTML = '';
    for (var i = 0; i < sweeps.length; i++) {
      var o1 = document.createElement('option');
      o1.value = String(i);
      o1.textContent = sweepLabel(i);
      if (i === fromIndex) o1.selected = true;
      fromSel.appendChild(o1);
      var o2 = document.createElement('option');
      o2.value = String(i);
      o2.textContent = sweepLabel(i);
      if (i === toIndex) o2.selected = true;
      toSel.appendChild(o2);
    }
  }
  function renderSummary() {
    document.getElementById('summary').textContent =
      sweeps.length + ' sweep'
      + (sweeps.length === 1 ? '' : 's')
      + ' · payload v' + payload.version;
  }
  function metaFor(entry) {
    if (sort === 'ready') {
      return entry.readyMs === null
        ? 'n/a'
        : formatDurationPerf(entry.readyMs, false);
    }
    if (sort === 'delta') {
      return entry.deltaMs === null
        ? 'n/a'
        : formatDurationPerf(entry.deltaMs, true);
    }
    if (entry.budgetPct === null) return 'n/a';
    return Math.round(entry.budgetPct * 1000) / 10 + '%';
  }
  function renderRank() {
    var list = document.getElementById('rank-list');
    var entries = rankPages();
    if (focused === null && entries.length) {
      focused = entries[0].page;
    }
    list.innerHTML = '';
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var row = document.createElement('div');
      row.className = 'rank-row';
      row.setAttribute('role', 'option');
      row.setAttribute(
        'aria-selected',
        e.page === focused ? 'true' : 'false',
      );
      row.dataset.page = e.page;
      row.innerHTML =
        '<span>' + e.page + '</span>'
        + '<span class="rank-meta">'
        + metaFor(e) + '</span>';
      row.addEventListener('click', function (ev) {
        focused = ev.currentTarget.dataset.page;
        renderAll();
      });
      list.appendChild(row);
    }
  }
  function currentEntry() {
    var entries = rankPages();
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].page === focused) return entries[i];
    }
    return entries[0] || null;
  }
  function renderKpis() {
    var e = currentEntry();
    var el = document.getElementById('kpis');
    if (!e) {
      el.innerHTML = '';
      return;
    }
    var ready =
      e.readyMs === null
        ? 'n/a'
        : formatDurationPerf(e.readyMs, false);
    var delta =
      e.deltaMs === null
        ? 'n/a'
        : formatDurationPerf(e.deltaMs, true);
    var budget =
      e.budgetPct === null
        ? 'n/a'
        : (Math.round(e.budgetPct * 1000) / 10) + '%';
    var deltaClass = '';
    if (e.deltaMs !== null && e.deltaMs > 0) {
      deltaClass = ' delta-pos';
    } else if (e.deltaMs !== null && e.deltaMs < 0) {
      deltaClass = ' delta-neg';
    }
    el.innerHTML =
      '<div class="kpi"><div class="label">Page</div>'
      + '<div class="value">' + e.page + '</div></div>'
      + '<div class="kpi"><div class="label">Latest ready</div>'
      + '<div class="value">' + ready + '</div></div>'
      + '<div class="kpi"><div class="label">Δ from→to</div>'
      + '<div class="value' + deltaClass + '">'
      + delta + '</div></div>'
      + '<div class="kpi"><div class="label">Budget</div>'
      + '<div class="value">' + budget + '</div></div>';
  }
  function renderTrend() {
    var body = document.getElementById('focus-body');
    var page = focused;
    var xs = [];
    var ys = [];
    for (var i = 0; i < sweeps.length; i++) {
      var p = sweeps[i].pages[page];
      if (!p) continue;
      xs.push(i);
      ys.push(p.readyMs);
    }
    if (!ys.length) {
      body.innerHTML =
        '<p class="muted">No samples for this page.</p>';
      return;
    }
    var budget = budgets[page]
      ? budgets[page].readyMs
      : null;
    var unitVals = ys.slice();
    if (budget !== null) unitVals.push(budget);
    var unit = pickAxisUnit(unitVals);
    var w = 640;
    var h = 260;
    var padL = 56;
    var padR = 16;
    var padT = 16;
    var padB = 36;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;
    var yMax = Math.max.apply(null, unitVals);
    if (yMax <= 0) yMax = 1;
    function xPos(idx) {
      if (sweeps.length === 1) {
        return padL + plotW / 2;
      }
      return padL + (idx / (sweeps.length - 1)) * plotW;
    }
    function yPos(ms) {
      var v = toAxis(ms, unit);
      var vmax = toAxis(yMax, unit);
      return padT + plotH - (v / vmax) * plotH;
    }
    var parts = [];
    parts.push(
      '<svg class="trend-svg" viewBox="0 0 '
      + w + ' ' + h
      + '" role="img" aria-label="Ready trend">',
    );
    // grid + ticks
    for (var t = 0; t < 5; t++) {
      var frac = t / 4;
      var msTick = yMax * (1 - frac);
      var y = padT + plotH * frac;
      parts.push(
        '<line x1="' + padL + '" x2="' + (w - padR)
        + '" y1="' + y + '" y2="' + y
        + '" stroke="#2a3140"/>',
      );
      parts.push(
        '<text x="' + (padL - 6) + '" y="' + (y + 4)
        + '" fill="#9aa6b2" font-size="10" text-anchor="end">'
        + formatAxisTick(msTick, unit) + '</text>',
      );
    }
    if (budget !== null) {
      var by = yPos(budget);
      parts.push(
        '<line x1="' + padL + '" x2="' + (w - padR)
        + '" y1="' + by + '" y2="' + by
        + '" stroke="#56b6c2" stroke-dasharray="4 3"/>',
      );
    }
    var d = '';
    for (var j = 0; j < xs.length; j++) {
      var px = xPos(xs[j]);
      var py = yPos(ys[j]);
      d += (j === 0 ? 'M' : 'L') + px + ' ' + py + ' ';
      parts.push(
        '<circle cx="' + px + '" cy="' + py
        + '" r="3.5" fill="#6ea8fe"/>',
      );
    }
    parts.push(
      '<path d="' + d
      + '" fill="none" stroke="#6ea8fe" stroke-width="2"/>',
    );
    // x labels for from/to emphasis
    for (var xi = 0; xi < sweeps.length; xi++) {
      if (xi !== fromIndex && xi !== toIndex
        && sweeps.length > 6 && xi % 2 === 1) {
        continue;
      }
      parts.push(
        '<text x="' + xPos(xi) + '" y="' + (h - 12)
        + '" fill="#9aa6b2" font-size="9" text-anchor="middle">'
        + sweeps[xi].sha + '</text>',
      );
    }
    parts.push('</svg>');
    if (budget !== null) {
      parts.push(
        '<p class="muted">Dashed line = budget ceiling ('
        + formatDurationPerf(budget, false) + ').</p>',
      );
    }
    parts.push(
      '<p class="muted">Gaps mean the page was absent '
      + 'from that sweep (partial --pages).</p>',
    );
    body.innerHTML = parts.join('');
  }
  function renderPhase() {
    var body = document.getElementById('focus-body');
    var to = sweeps[toIndex];
    var pageData = to.pages[focused];
    if (!pageData) {
      body.innerHTML =
        '<p class="muted">No phase data in the '
        + '<strong>to</strong> sweep for this page.</p>';
      return;
    }
    var r = rollupPhases(pageData.phases);
    var total =
      r.buckets.boot + r.buckets.fetch
      + r.buckets.render + r.buckets.other;
    function seg(name, ms, color) {
      if (ms <= 0 || total <= 0) return '';
      var pct = (ms / total) * 100;
      return '<div class="bar-seg" style="width:'
        + pct + '%;background:' + color
        + '" title="' + name + '"></div>';
    }
    var html = '';
    html += '<div class="legend">'
      + '<span><span class="swatch" style="background:var(--boot)"></span>boot '
      + formatDurationPerf(r.buckets.boot, false)
      + '</span>'
      + '<span><span class="swatch" style="background:var(--fetch)"></span>fetch '
      + formatDurationPerf(r.buckets.fetch, false)
      + '</span>'
      + '<span><span class="swatch" style="background:var(--render)"></span>render '
      + formatDurationPerf(r.buckets.render, false)
      + '</span>'
      + '<span><span class="swatch" style="background:var(--other)"></span>other '
      + formatDurationPerf(r.buckets.other, false)
      + '</span></div>';
    html += '<div class="bar-stack">'
      + seg('boot', r.buckets.boot, 'var(--boot)')
      + seg('fetch', r.buckets.fetch, 'var(--fetch)')
      + seg('render', r.buckets.render, 'var(--render)')
      + seg('other', r.buckets.other, 'var(--other)')
      + '</div>';
    html += '<div class="phase-list">';
    for (var i = 0; i < r.phases.length; i++) {
      var p = r.phases[i];
      html += '<div><span>' + p.name
        + ' <span class="muted">(' + p.bucket
        + ')</span></span><span>'
        + formatDurationPerf(p.ms, false)
        + '</span></div>';
    }
    if (!r.phases.length) {
      html += '<p class="muted">No phase marks recorded.</p>';
    }
    html += '</div>';
    body.innerHTML = html;
  }
  function renderBudget() {
    var body = document.getElementById('focus-body');
    var e = currentEntry();
    if (!e) {
      body.innerHTML = '';
      return;
    }
    var budget = budgets[focused]
      ? budgets[focused].readyMs
      : null;
    if (e.readyMs === null || budget === null) {
      body.innerHTML =
        '<p class="muted">Budget ratio n/a '
        + '(need median and budget for this page).</p>';
      return;
    }
    var pct = e.budgetPct;
    var pctShow =
      Math.round(pct * 1000) / 10;
    var headroom = budget - e.readyMs;
    var fillPct = Math.min(pct * 100, 100);
    var over = pct > 1;
    var html = '<div class="budget-block">';
    html += '<div><span>Median ready</span><span>'
      + formatDurationPerf(e.readyMs, false)
      + '</span></div>';
    html += '<div><span>Budget ceiling</span><span>'
      + formatDurationPerf(budget, false)
      + '</span></div>';
    html += '<div><span>Used</span><span>'
      + pctShow + '%</span></div>';
    html += '<div><span>Headroom</span><span>'
      + formatDurationPerf(headroom, true)
      + '</span></div>';
    html += '<div class="budget-track"><div class="budget-fill'
      + (over ? ' over' : '')
      + '" style="width:' + fillPct
      + '%"></div></div>';
    if (over) {
      html += '<p class="delta-pos">Over budget.</p>';
    }
    html += '</div>';
    body.innerHTML = html;
  }
  function renderFocus() {
    if (mode === 'trend') renderTrend();
    else if (mode === 'phase') renderPhase();
    else renderBudget();
  }
  function renderAll() {
    renderSummary();
    renderRank();
    renderKpis();
    renderFocus();
  }
  document.querySelectorAll('[data-sort]').forEach(
    function (btn) {
      btn.addEventListener('click', function () {
        sort = btn.getAttribute('data-sort');
        document.querySelectorAll('[data-sort]').forEach(
          function (b) {
            b.setAttribute(
              'aria-selected',
              b === btn ? 'true' : 'false',
            );
          },
        );
        renderAll();
      });
    },
  );
  document.querySelectorAll('[data-mode]').forEach(
    function (btn) {
      btn.addEventListener('click', function () {
        mode = btn.getAttribute('data-mode');
        document.querySelectorAll('[data-mode]').forEach(
          function (b) {
            b.setAttribute(
              'aria-selected',
              b === btn ? 'true' : 'false',
            );
          },
        );
        renderFocus();
      });
    },
  );
  document.getElementById('from-sel').addEventListener(
    'change',
    function (ev) {
      fromIndex = Number(ev.target.value);
      renderAll();
    },
  );
  document.getElementById('to-sel').addEventListener(
    'change',
    function (ev) {
      toIndex = Number(ev.target.value);
      renderAll();
    },
  );
  fillSelectors();
  renderAll();
})();
</script>
</body>
</html>
`;
}
```

**Important implementation notes for the agent:**

1. The template above uses hex colors in generated HTML —
   allowed (artifact not design-system CSS; not linted).
   Source TS must still obey 78-char and no raw hex in
   **checked-in** app CSS — this file is generator-only.
2. The client reimplements rank/format in JS from the
   embedded payload (math source of truth remains the pure
   core for server-side ranking used if ever needed;
   client must match the tested semantics — keep the JS
   port faithful to Task 1).
3. Escape `</` in JSON via `\\u003c` before embed.
4. If the HTML string blows past practical editing, split
   `renderVizHtml` into helper functions that return CSS,
   shell markup, and client script as separate template
   literals — same output.
5. Keep **TS source** lines ≤78 chars. Inside the emitted
   HTML string, lines may be longer (not linted). Prefer
   breaking TS concatenations rather than fighting the
   template.

- [ ] **Step 3: Smoke-generate against real history**

From repo root (dirty tree OK):

```bash
node --strip-types -e "
import { generateMeasureViz } from './web-app/app/measure-viz.ts';
const out = generateMeasureViz(process.cwd());
console.log('wrote', out);
"
```

Expected: prints `wrote …/measurements/index.html`.
File exists and contains `"version":1` and at least one
page key from history (e.g. `workbox`).

Failure cases to pin manually once:

```bash
# missing budgets — rename temporarily, expect throw
# bad JSONL line — optional; unit tests already cover parse
```

- [ ] **Step 4: Open HTML (manual)**

```bash
open measurements/index.html
# or: python3 -m http.server 8765 --directory measurements
# then visit http://127.0.0.1:8765/index.html
```

Check: rank list populated; three sort tabs; three focus
modes; compare selectors default first→latest; clicking a
page updates KPIs; Δ for workbox first→latest is large
positive (~+1 s class).

- [ ] **Step 5: Validate + commit**

```bash
./validate
git add web-app/app/measure-viz.ts \
  web-app/app/tsconfig.json
# Do NOT add measurements/index.html
git status  # confirm index.html untracked or ignored later
git commit -m "$(cat <<'EOF'
generate Layout B measure history HTML

Co-Authored-By: Grok Build <grok@x.ai>
EOF
)"
```

If `measurements/index.html` appears in status as
untracked, that is OK until Task 3 gitignores it — do not
`git add` it.

---

### Task 3: CLI flag, early path, gitignore

**Files:**
- Modify: `web-app/app/measure.ts`
- Modify: `./measure`
- Modify: `.gitignore`

- [ ] **Step 1: Gitignore generated artifact**

Append to `.gitignore`:

```
measurements/index.html
```

- [ ] **Step 2: Document flag on wrapper**

Update `./measure` comment block:

```bash
#!/bin/bash
set -euo pipefail

# Page-load benchmark via headless Chrome + CDP.
# Flags: --check, --record, --write-budgets,
#   --budget-sigmas N, --pages a,b,c, --runs N,
#   --visualize (history HTML; bare = no Chrome)
node --strip-types web-app/app/measure.ts "$@"
```

- [ ] **Step 3: Extend CLI types and `parseArgs`**

In `web-app/app/measure.ts`:

1. Import generator:

```ts
import { generateMeasureViz } from './measure-viz.ts';
```

2. Extend `Cli`:

```ts
type Cli = {
    check: boolean;
    record: boolean;
    writeBudgets: boolean;
    budgetSigmas: number;
    pages: string[] | null;
    runs: number;
    visualize: boolean;
    /** True when --runs was present on argv. */
    runsExplicit: boolean;
};
```

3. In `parseArgs`, add:

```ts
let visualize = false;
let runsExplicit = false;
// inside loop:
if (a === '--visualize') {
    visualize = true;
    continue;
}
// when handling --runs, set runsExplicit = true
```

4. Return includes `visualize` and `runsExplicit`.

- [ ] **Step 4: Early visualize-only path before clean-tree**

Replace the start of `main` so visualize-only never hits
clean-tree / Chrome:

```ts
async function main(): Promise<void> {
    const cli = parseArgs(process.argv.slice(2));
    const repoRoot = process.cwd();

    const visualizeOnly =
        cli.visualize
        && !cli.check
        && !cli.record
        && !cli.writeBudgets
        && cli.pages === null
        && !cli.runsExplicit;

    if (visualizeOnly) {
        const out = generateMeasureViz(repoRoot);
        process.stderr.write(
            `Wrote visualizer → ${out}\n`,
        );
        return;
    }

    // Clean tree: measure committed bytes only.
    {
        const { stdout } = await execFile(
            'git',
            ['status', '--porcelain'],
            { cwd: repoRoot },
        );
        if (stdout.trim().length > 0) {
            throw new Error(
                'Working tree is dirty; commit before'
                + ' measuring (every run measures'
                + ' committed bytes)',
            );
        }
    }

    // ... existing measure flow unchanged ...
```

- [ ] **Step 5: Post-run visualize hook**

After the `--record` block (still inside `try`, after
report/check/record, before `finally`), append:

```ts
        // 11. --visualize (always from disk after run)
        if (cli.visualize) {
            if (!cli.record) {
                process.stderr.write(
                    'Note: this run is not in history; '
                    + 'visualizer regenerated from disk '
                    + 'only.\n',
                );
            }
            const out = generateMeasureViz(repoRoot);
            process.stderr.write(
                `Wrote visualizer → ${out}\n`,
            );
        }
```

Order covenant:

1. report  
2. optional `--write-budgets`  
3. optional `--check` (may set `exitCode = 1` and return
   early today — **preserve that behavior**)  
4. optional `--record`  
5. optional `--visualize`

**Bug to avoid:** current `--check` failure path does
`process.exitCode = 1; return;` before record. If check
fails, visualize should still run only if we want
disk-only viz — spec does not require viz on check
failure. Keep visualize **after** successful path through
record; if check returns early, skip visualize (simplest,
matches “after a successful run”). Read the existing check
block: if it `return`s on failure, place visualize after
check only on the success fall-through, and after record.

If the current structure is:

```ts
if (cli.check) {
  ...
  if (!verdict.ok) {
    process.exitCode = 1;
    return;
  }
}
if (cli.record) { ... }
// place visualize here
if (cli.visualize) { ... }
```

that is correct.

- [ ] **Step 6: Manual CLI verification**

```bash
# Dirty tree OK for bare visualize
./measure --visualize
# Expected stderr: Wrote visualizer → …/measurements/index.html
# Exit 0; no Chrome launch

# Missing budgets hard fail
mv measurements/budgets.json measurements/budgets.json.bak
./measure --visualize ; echo exit:$?
# Expected: measure failed: visualize: missing budgets…
# exit 1
mv measurements/budgets.json.bak measurements/budgets.json

# Gitignore
git status --porcelain | grep index.html || echo 'ignored OK'
# Expected: ignored OK (or empty)

# Note path without --record cannot be fully automated
# without Chrome; unit of work is the stderr string present
# in source — optional full sweep when willing:
# ./measure --record --visualize
```

- [ ] **Step 7: Validate + commit**

```bash
./validate
git add web-app/app/measure.ts ./measure .gitignore
git commit -m "$(cat <<'EOF'
wire measure --visualize flag and paths

Co-Authored-By: Grok Build <grok@x.ai>
EOF
)"
```

---

### Task 4: CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md` (§ Commands table + § Measurement)

- [ ] **Step 1: Commands table**

Add after the other measure lines:

```bash
./measure --visualize  # History HTML from disk (no Chrome)
```

- [ ] **Step 2: Measurement section prose**

After the history paragraph, add (wrap ≤78 chars):

```markdown
`--visualize` regenerates `measurements/index.html` from
committed history + budgets (self-contained HTML, gitignored).
Bare `./measure --visualize` skips the clean-tree gate and
Chrome. With a measure run, pass `--visualize` to regenerate
after success; without `--record`, stdout notes that this run
is not in history. Missing history or budgets is a hard fail.
Not part of `./validate`.
```

Also extend the Design links bullet if present to mention
the visualize design:

```markdown
Design:
`docs/superpowers/specs/2026-07-12-page-
performance-measurement-design.md`,
`docs/superpowers/specs/2026-07-12-measure-
visualize-design.md`.
```

(Keep line wraps within 78 chars as required for root
`.md` files under validate.)

- [ ] **Step 3: Validate + commit**

```bash
./validate
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
document measure --visualize in CLAUDE.md

Co-Authored-By: Grok Build <grok@x.ai>
EOF
)"
```

---

## Verification Checklist (plan complete when all green)

### Automated

- [ ] `./validate` green after every task commit
- [ ] Duration ladder edges (sub-ms, ms, ≥1s, signed)
- [ ] Rank order ready / Δ / budget% with nulls last
- [ ] Phase rollup prefixes; missing phases not zero-filled
  as invented phase rows
- [ ] Payload `version === 1` and sweep count
- [ ] Malformed JSONL throws with line number

### Manual

- [ ] Dirty tree: `./measure --visualize` succeeds; no Chrome
- [ ] Produces `measurements/index.html`
- [ ] Open via `file://` or static server
- [ ] Missing budgets → exit 1
- [ ] Click page + change compare pair updates Δ / KPIs
- [ ] Spot-check workbox ~3.28 s class on latest; large +Δ
  first→latest if history still has the three 2026-07-12
  sweeps
- [ ] `git status` does not stage
  `measurements/index.html` as a tracked add
- [ ] Optional: `./measure --record --visualize` includes new
  line; without `--record`, note on stderr

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Layout B rank + focus | 2 |
| Sort tabs ready / Δ / budget% | 1 + 2 |
| Focus modes trend / phase / budget | 2 |
| Adaptive duration display | 1 (+ JS port in 2) |
| Pickable compare pair; default first→latest | 1 `buildPayload` + 2 UI |
| Generate-only; gitignore HTML | 3 |
| Embed versioned JSON | 1 + 2 |
| Budgets required hard fail | 2 I/O + 3 CLI |
| Bare `--visualize` early path | 3 |
| Post-run `--visualize` from disk | 3 |
| Note without `--record` | 3 |
| Pure core + Node generator | 1 + 2 |
| Reuse `HistoryLine` / `Budgets` | 1 |
| Phase prefix rollup + `other` | 1 |
| Partial sweeps as gaps | 2 trend |
| Single-sweep Δ null / n/a | 1 + 2 |
| Budget% N/A last | 1 |
| `./measure` comment + CLAUDE.md | 3 + 4 |
| Not in `./validate` | (no task adds it) |
| Zero chart libs / CDN | 2 SVG/div only |
| 78-char on source TS | all tasks |

## Risks / abominations (from spec)

| Risk | Guard in plan |
| --- | --- |
| Chart library / CDN | Forbidden; SVG + div |
| Invented phase zeros | `rollupPhases` lists present only |
| Second source of truth | Gitignore; never commit HTML |
| Math only in HTML strings | Pure core tested; JS port mirrors |
| Clean-tree for visualize-only | Early return before gate |
| Rename storage fields | Display-only formatting |
| Premature admin page | Not built |
| 78-char on generated HTML | Exempt; source must obey |

---

## Execution handoff

Plan complete and saved to
`docs/superpowers/plans/2026-07-12-measure-visualize.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per
   task, review between tasks; each subagent starts with
   `Go to Medium Church!`
2. **Inline Execution** — execute tasks in this session
   with checkpoints

Which approach?

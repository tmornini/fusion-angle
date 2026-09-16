# Measure candles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this spec's worktree (AGENTS.md
> § Worktrees): `.worktrees/2026-09-15-measure-candles`,
> branch `2026-09-15-measure-candles`, spec commit
> `1542effc` on master `e9d61b6a`.

> **For the dispatching orchestrator (AGENTS.md § Subagents):**
> every subagent prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then push down: the 78-char lint on
> code/scripts (not `.md`) — the ES5 client lives inside a
> `.ts` template string and IS linted — 4-space indent in TS
> and 2-space inside the client template (matching the
> existing client), no inline styles for the candle marks
> (classes in `vizCss()` on the `:root` custom properties),
> present-tense-imperative ~50-char commit subjects with the
> mandated trailer, the Sin of Test Weakening (when test and
> code diverge the code changes — except where THIS plan
> names a covenant the spec itself rewrote: the
> `shapeHistoryLine` expectation gains `spread`, and the
> hand-built `PageStats` fixtures gain `mean` and `sigma`),
> the Sin of Unbidden Helper Code (each task's diff is its
> story; no report change, no budget change, no flag), the
> Sin of Default Values (a missing candle is `null` at the
> call site, never zeros), the Sin of Internal Defense (the
> parser is the gate; `pageCandle` and `systemCandle` trust
> it), and the codebase patterns named under "Context an
> implementer must know". Subagents work in the worktree the
> orchestrator names and never create their own — never pass
> the Agent tool `isolation`. Subagents never run
> `./deploy --render`. The tasks are strictly serial; one
> worker, one worktree.

**Goal:** Record each page's trimmed min, max, mean, and
sample σ beside its median in `measurements/history.jsonl`,
and draw a candle — whiskers min–max, box mean ± 1σ, tick
median — at every point of both trend charts in the measure
visualizer.

**Architecture:** Three layers, one commit each, then a
regenerate. Statistics: `statsForPage` already trims (ceil
10% each tail) and takes min/median/max; it gains `mean` and
`sigma` from the two helpers `budgetReadyMsFromSamples`
already uses. Record: `shapeHistoryLine` writes an optional
`spread` per page and `isHistoryLine` validates it when
present; old lines carry none and draw exactly as today.
View-model: three pure functions in `measure-viz-core.ts`
(`pageCandle`, `systemCandle`, `trendAxisMax`) under
`Deno.test`, then mirrored by hand into the ES5 client
inside `measure-viz.ts` the way `rollupPhases` and its
siblings already are, and drawn by `buildTrendSvg` beneath
the existing polyline, point, and hit circle.

**Tech Stack:** Deno 2.9.6, TypeScript strict under
`deno.json` (`noUncheckedIndexedAccess`,
`verbatimModuleSyntax`, `erasableSyntaxOnly`), `Deno.test`
+ `@std/assert`. No new dependencies. No Chrome: bare
`./bin/measure --visualize` regenerates the HTML from disk.

**Spec:**
`docs/superpowers/specs/2026-09-15-measure-candles-design.md`.
Read it first; every task cites its section.

## Global Constraints

- One concern per commit, in the spec's order (§ Sequence
  3–7): statistics, record, core, rendering, regenerate.
  Five commits after the plan commit.
- `./test validate` green on every commit.
- Additive record (spec Decision 5): `readyMs` (median) and
  `phases` unchanged; `spread` optional; no migration, no
  backfill.
- Out of scope (spec § Out of scope): per-phase spread; IQR
  or percentile boxes; raw samples; new CLI flags
  (`--record` writes `spread` unconditionally); any change
  to `--check`, budgets, `--write-budgets`, or the text
  report (`formatReport`).
- The three candle classes live in `vizCss()` and take their
  colors from `--muted`, `--band`, `--accent` (spec
  § Rendering). No inline `style=` on candle marks.
- Hover, drag-to-window, and SHA labels are untouched (spec
  § Rendering).
- Commit subject ≈50 chars, present-tense imperative, no
  body beyond the trailer:

  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FKvfQB7E44FirpwbcQ9S6G
  ```

## Interpretations this plan fixes

The spec leaves five small things to the plan. Each is
stated here so the operator can overrule it before dispatch;
every task below is written against them.

**(A) `trendAxisMax` floors the way the builder floors
today.** `buildTrendSvg` (`measure-viz.ts:1142-1143`) does
`if (yMax <= 0) yMax = 1`; a value in (0, 1) is kept. The
spec's "at least 1, as the builder floors today" differs
from the builder only for sub-millisecond ready times, which
do not occur. The plan follows the builder: ≤ 0 → 1.

**(B) The axis unit follows the axis maximum.** Today
`pickAxisUnit` sees the medians plus the budget. The plan
computes `yMax = trendAxisMax(points, budgetMs)` first and
picks the unit from `[yMax]`, so a whisker that crosses 1 s
moves the axis into seconds. For a window with no candles
this is the same unit as today (every ready time is
positive, so the max of the values IS `yMax`).

**(C) `PageSpread` is a named type.** The spec shows the
`spread` shape inline; the plan names it once in
`measure-core.ts` so `HistoryLine`, `shapeHistoryLine`, and
the parser guard share one definition.

**(D) A page value that is not an object rejects the
line.** To read `spread` off each page the guard must
establish the page is an object. Today a non-object page
passes `isHistoryLine` (the guard never looked); the plan
reads the spec's "anything else rejects the line as an
invalid shape" to cover it. `readyMs` and `phases` stay
unchecked — the spec asks for the spread rules only.

**(E) The box may overtop the whisker for a two-sample
page.** Sample σ (Bessel) of [0, 1] is 0.707, so mean + σ =
1.21 > max. `trendAxisMax` takes the spec's three inputs (y,
candle max, budget) and not mean + σ. With 25 runs the
trimmed set is 19 samples and the box sits inside the
whiskers. Not addressed.

## Files

| File | Task | Change |
|---|---|---|
| `web-app/app/measure-core.ts` | 1, 2 | `PageStats.readyMs` gains `mean`, `sigma`; `PageSpread`; `HistoryLine` page gains `spread?`; `shapeHistoryLine` writes it |
| `tests/measure-core.test.ts` | 1, 2 | new `statsForPage` test; fixtures gain the fields; `shapeHistoryLine` expectation gains `spread` |
| `web-app/app/measure-viz-core.ts` | 2, 3 | `isHistoryLine` validates `spread`; `Candle`, `pageCandle`, `systemCandle`, `trendAxisMax` |
| `tests/measure-viz-core.test.ts` | 2, 3 | five parser tests; seven candle/axis tests |
| `web-app/app/measure-viz.ts` | 4 | three CSS rules; three client mirrors; `buildTrendSvg` draws candles; both trend renderers pass `candle`, add tooltip rows and caption |
| `measurements/page-load-times-broken-in-ichat.html` | 5 | regenerated |

## Dependency graph

```
spec 1542effc → Task 1 → Task 2 → Task 3 → Task 4 → Task 5
```

Strictly serial. Task 2 needs Task 1's `mean`/`sigma`;
Task 3 needs Task 2's `spread` type; Task 4 mirrors Task 3's
core by hand; Task 5 embeds Task 4's client. No lanes, no
lane worktrees. Execute in the spec worktree.

## Context an implementer must know

**Running tests.** `./test` is the whole memory suite
(≈10 s). One file:

```bash
export DENO_DIR="$TMPDIR/deno-dir"    # Claude Code sandbox only
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check --sanitize-ops \
    --sanitize-resources --allow-env --allow-read \
    --allow-write --allow-net \
    --allow-run=deno,./bin/serve,./deploy,sh,./test,./bin/postgres-wipe,./bin/postgres-seed \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    tests/<file>.test.ts
```

Below, "Run one: tests/x.test.ts" means that command. It
accepts several files. `./test check` is the type gate
alone (`deno check --frozen api shared server tests
web-app`); `./test lint` is the 78-char and `org` sweep;
`./test validate` is the commit gate (check, memory suite,
lint, schema, api docs). `--no-check` on the runner means a
type error — a `PageStats` literal missing `mean` — shows
only in `./test check`. Run it before every commit.

**The split.** `web-app/app/measure-core.ts` is pure
statistics and the record shape; `web-app/app/
measure-viz-core.ts` is the pure view-model (imports types
from measure-core, never the reverse); `web-app/app/
measure-viz.ts` is the Deno-only generator whose
`vizCss()`, `vizBodyMarkup()`, and `vizClientScript()`
return template strings that become the self-contained
HTML. `vizClientScript()` is ES5-flavoured JS (it already
uses `Set` and `Number.isInteger`; "ES5" means `var`,
`function`, string concatenation, no modules). It is not
type-checked. It IS linted at 78 chars per line. A `\\` in
the template is one backslash in the page. Its indent is 2
spaces; the surrounding TS is 4.

**Trimmed statistics.** `trimExtremes(values)` drops
`ceil(n × 0.10)` from each tail, keeping ≥ 1 (`measure-
core.ts:54`). `mean` (`:104`) and
`sampleStandardDeviation` (`:119`, Bessel, single value →
0) are the helpers `budgetReadyMsFromSamples` (`:145`)
already composes. `statsForPage` (`:176`) trims
`readyMs` once into `readyValues` and takes min, median,
max from that one set — mean and σ come from the same set
(spec Decision 4: one sample set per candle).

**The trend builder.** `buildTrendSvg(points, opts)` at
`measure-viz.ts:1121`. `points` are
`{ index, y, tipLines }`; `opts` are
`{ budgetMs?, labelIndices? }` (`budgetMs` is absent for
the system chart and `null` for a page with no budget —
the code tests `!= null`). It computes `unit`, the SVG
box (`w = 640`, `h = 260`, `padL = 56`, `padR = 16`,
`padT = 16`, `padB = 36`, `plotW`, `plotH`), `yMax`, then
closures `xPos(idx)` and `yPos(ms)` (larger ms → smaller
y). Draw order today: gridlines and tick labels, the
budget line, the `sel-band` rect, then per point a
`point-vis` circle and a `point-hit` circle, then the
median `path`, then SHA labels. SVG paints in document
order, so what is pushed first is underneath. Two callers:
`renderSysTrend` (`:1338`) and `renderTrend` (`:1603`).
Tooltip rows are `[key, value]` pairs serialized into the
hit circle's `data-tip`. The client's
`formatDurationPerf(ms, signed)` takes a boolean; the
core's takes `{ signed }`.

**Vocabulary.** Storage is the JSONL line; domain is
`HistoryLine`. The record field is `spread` (spec § Record
shape); the view-model value is a `Candle` (spec § Pure
core). A `Candle` has the four spread fields plus
`median`. `meanReadyMs(sweep)` (`measure-viz-core.ts:552`)
is the mean of page medians, today's system line, and
equals `systemCandle(sweep).median` when present.

**Bare `--visualize`.** `./bin/measure --visualize` with no
other flag takes the `isVisualizeOnly` path
(`measure.ts:386`): no Chrome, no env, no clean-tree check,
no server. It reads `measurements/history.jsonl` and
`measurements/budgets.json` and writes
`measurements/page-load-times-broken-in-ichat.html`
(`generateMeasureViz`, `measure-viz.ts:41`). `payload.
generatedAt` is `new Date()`, so the HTML differs on every
run. `generateMeasureViz(repoRoot)` is exported and takes
any root that holds a `measurements/` directory — the
smoke in Task 4 uses a temp root.

**Sandbox.** Under the Claude Code sandbox, `export
DENO_DIR="$TMPDIR/deno-dir"` before any `deno` command,
`./test`, or `./bin/measure`. Never bake that into a script.

## Subagent prompt template

Use this verbatim as the opening of every dispatch, then
paste the task section.

```
Go to Medium Church!

You are executing Task <N> of
docs/superpowers/plans/2026-09-15-measure-candles.md in the
worktree <absolute path> on branch 2026-09-15-measure-candles.
Read the plan's header, "Global Constraints",
"Interpretations this plan fixes", "Context an implementer
must know", and Task <N> in full, then the spec sections
Task <N> cites in
docs/superpowers/specs/2026-09-15-measure-candles-design.md.

Voice: 78-char max lines in .ts and scripts (./test lint;
.md exempt) — the ES5 client inside measure-viz.ts's template
string is linted too; 4-space indent in TS, 2-space inside
the client template; never the `org` abbreviation in an
identifier (spell `organization`); present-tense imperative
~50-char commit subject, body = exactly the two trailer lines
the plan's Global Constraints give.

Commandments this task touches: <from the task>.
Abominations this task risks: <from the task>.
Patterns: the parser is the gate and downstream trusts it;
absence is `undefined` in the record and `null` in the
view-model, decided at the call site, never `??`'d in a
helper; the core is tested, the client mirrors it by hand;
candle marks are styled by class on `:root` custom
properties, never inline; no untyped `any` at the JSON
boundary (narrow `unknown`).

Do not run ./deploy --render. Do not create a worktree or
pass `isolation`. Commit when the task's steps say to and
report: files changed, every test command you ran with its
result line, the commit SHA, and anything the plan got wrong
about the code you found.
```

---

### Task 1: Statistics — `mean` and `sigma` in `PageStats`

Spec § Record shape (`PageStats.readyMs`), § Testing
(`statsForPage mean and sigma on the trimmed set`),
§ Sequence 3, Decision 1 (σ is the sample standard
deviation the budget already uses) and Decision 4 (one
sample set per candle).

**Files:**
- Modify: `web-app/app/measure-core.ts:9-12` (the
  `PageStats` type), `:170-208` (`statsForPage` and its
  doc comment)
- Test: `tests/measure-core.test.ts` (new test after line
  271; `PageStats` fixtures at 275-286, 391-411, 435-452)

**Interfaces:**
- Consumes: `trimExtremes`, `median`, `mean`,
  `sampleStandardDeviation` — all already exported from
  `web-app/app/measure-core.ts`.
- Produces: `PageStats.readyMs: { min: number; median:
  number; max: number; mean: number; sigma: number }`.
  Task 2 reads `mean` and `sigma` off it.

**Commandments touched:** I Reliability (mean and σ come
from the same trimmed set as min/median/max, so the record
is internally consistent); III Uniformity (`mean` and
`sigma` are the names the spec and the helpers use).

**Abominations risked:** Test Weakening (three hand-built
`PageStats` fixtures gain the two fields; no assertion
changes; no test is deleted); Unbidden Helper Code
(`formatReport` and the budget path do not change).

- [ ] **Step 1: Write the failing test**

In `tests/measure-core.test.ts`, after the test
`statsForPage trims extremes on readyMs` (ends line 271),
add:

```ts
Deno.test('statsForPage mean and sigma on trimmed set', () => {
    // n=8 → drop 1 each tail → [4,4,4,5,5,7]
    // mean = 29/6; sample σ = √(41/30)
    const runs: PageRun[] = [2, 4, 4, 4, 5, 5, 7, 9].map(
        (readyMs) => ({ readyMs, phases: {} }),
    );
    const s = statsForPage(runs);
    assert(Math.abs(s.readyMs.mean - 29 / 6) < 1e-12);
    assert(
        Math.abs(s.readyMs.sigma - Math.sqrt(41 / 30))
            < 1e-12,
    );
});
```

The series and its constants are the ones the
`budgetReadyMsFromSamples` test (line 163) already
documents.

- [ ] **Step 2: Run the test to verify it fails**

Run one: `tests/measure-core.test.ts`

Expected: `statsForPage mean and sigma on trimmed set ...
FAILED` with `AssertionError: Expected expression to be
truthy` (`undefined - 29/6` is `NaN`). Every other test in
the file passes.

- [ ] **Step 3: Write the implementation**

In `web-app/app/measure-core.ts`, replace the `PageStats`
type (lines 9-12):

```ts
export type PageStats = {
    readyMs: {
        min: number;
        median: number;
        max: number;
        mean: number;
        sigma: number;
    };
    phases: Record<string, number>; // median per phase
};
```

Replace the `statsForPage` doc comment (lines 170-175):

```ts
/**
 * Aggregate min/median/max/mean/sample σ readyMs and
 * per-phase medians across runs. Each series is first
 * trimmed (default 10% each tail) so every statistic
 * ignores environment extremes. Empty runs → throws.
 */
```

Replace the return (lines 200-207):

```ts
    return {
        readyMs: {
            min: Math.min(...readyValues),
            median: median(readyValues),
            max: Math.max(...readyValues),
            mean: mean(readyValues),
            sigma: sampleStandardDeviation(readyValues),
        },
        phases,
    };
```

- [ ] **Step 4: Bring the hand-built fixtures to the new
shape**

`./test` runs `--no-check`, so these only bite in
`./test check`. Three sites in `tests/measure-core.test.ts`:

The `page()` helper (lines 275-286):

```ts
function page(
    medianReady: number,
): PageStats {
    return {
        readyMs: {
            min: medianReady,
            median: medianReady,
            max: medianReady,
            mean: medianReady,
            sigma: 0,
        },
        phases: {},
    };
}
```

The `shapeHistoryLine maps median stats` test (lines
391-411) — `dashboard` becomes:

```ts
            dashboard: {
                readyMs: {
                    min: 80,
                    median: 100,
                    max: 140,
                    mean: 104,
                    sigma: 22,
                },
                phases: {
                    'boot:db-open': 12,
                    fetch: 40,
                },
            },
```

and `ideas` becomes:

```ts
            ideas: {
                readyMs: {
                    min: 200,
                    median: 250,
                    max: 300,
                    mean: 250,
                    sigma: 40,
                },
                phases: {},
            },
```

The `formatReport includes page names and numbers` test
(lines 435-452) — `ideas` readyMs becomes
`{ min: 200, median: 250, max: 300, mean: 250, sigma: 40 }`
and `dashboard` readyMs becomes
`{ min: 80, median: 100, max: 140, mean: 104, sigma: 22 }`,
each written one field per line like the originals.

Task 2 reuses exactly these numbers (104/22 and 250/40) in
its `spread` expectation.

- [ ] **Step 5: Run the tests and the type gate**

Run one: `tests/measure-core.test.ts`

Expected: `ok | 32 passed | 0 failed` (31 today plus the
new one).

Run: `./test validate`

Expected: exits 0 — check, the memory suite in both TZ
passes, lint, schema, api docs all green.

- [ ] **Step 6: Commit**

```bash
git add web-app/app/measure-core.ts tests/measure-core.test.ts
git commit -m "Carry mean and sigma in page stats" \
    -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FKvfQB7E44FirpwbcQ9S6G"
```

---

### Task 2: Record — `spread` through `HistoryLine`, `shapeHistoryLine`, `isHistoryLine`

Spec § Record shape (the `HistoryLine` page and the parser
rules), § Testing (`shapeHistoryLine writes spread from
stats`; the five `parseHistoryJsonl` cases), § Sequence 4,
Decision 5 (additive, optional, no migration).

**Files:**
- Modify: `web-app/app/measure-core.ts:30-44` (`HistoryLine`;
  new `PageSpread` above it), `:259-286` (`shapeHistoryLine`
  and its doc comment)
- Modify: `web-app/app/measure-viz-core.ts:5-8` (type
  import), `:114-135` (`isHistoryLine`; new `isPageSpread`
  below it)
- Test: `tests/measure-core.test.ts:378-430`
  (`shapeHistoryLine`), `tests/measure-viz-core.test.ts`
  (after line 167, the last `parseHistoryJsonl` test)

**Interfaces:**
- Consumes: `PageStats.readyMs.{min,max,mean,sigma}` from
  Task 1.
- Produces:
  ```ts
  export type PageSpread = {
      min: number;
      max: number;
      mean: number;
      sigma: number;
  };
  // HistoryLine['pages'][string] is now
  // { readyMs: number; phases: Record<string, number>;
  //   spread?: PageSpread }
  ```
  and `parseHistoryJsonl` throws
  `history.jsonl line N: invalid shape` for a present
  `spread` that is not four finite numbers with
  `min <= max` and `sigma >= 0`. Task 3 reads `spread` off
  a parsed page without re-checking it.

**Commandments touched:** I Reliability (the parser rejects
a corrupt spread before the chart sees it); III Uniformity
(the field is `spread`, the type is `PageSpread`, the guard
is `isPageSpread`); IV Logic (`min <= max && sigma >= 0` —
an AND; every field finite — an AND).

**Articles:** "We validate at every edge … Storage: what was
written was commonly stored incorrectly." The parser is the
storage edge. "Once data has crossed the threshold of
validation, trust it completely" — Task 3 does.

**Abominations risked:** Internal Defense (do NOT add a
second spread check anywhere downstream); Default Values
(an absent `spread` stays `undefined`; `shapeHistoryLine`
never writes a placeholder); Test Weakening (the existing
`shapeHistoryLine` expectation gains `spread` because the
spec rewrote that covenant — nothing else in that test
changes); Unbidden Helper Code (`readyMs` and `phases` are
not newly validated; Interpretation D is the one deliberate
edge).

- [ ] **Step 1: Write the failing record test**

In `tests/measure-core.test.ts`, rename the test at line 380
from `shapeHistoryLine maps median stats` to
`shapeHistoryLine maps median stats and spread`, and
replace its `assertEquals(line.pages, …)` (lines 417-429)
with:

```ts
    assertEquals(line.pages, {
        dashboard: {
            readyMs: 100,
            phases: {
                'boot:db-open': 12,
                fetch: 40,
            },
            spread: {
                min: 80,
                max: 140,
                mean: 104,
                sigma: 22,
            },
        },
        ideas: {
            readyMs: 250,
            phases: {},
            spread: {
                min: 200,
                max: 300,
                mean: 250,
                sigma: 40,
            },
        },
    });
```

- [ ] **Step 2: Run it to verify it fails**

Run one: `tests/measure-core.test.ts`

Expected: `shapeHistoryLine maps median stats and spread
... FAILED` with `Values are not equal` (the diff shows
`spread` missing on both pages).

- [ ] **Step 3: Write the failing parser tests**

In `tests/measure-viz-core.test.ts`, after
`parseHistoryJsonl bad line includes line number` (ends line
167), add five tests. The helper builds two lines so the
rejection names line 2:

```ts
function twoLinesSecondSpread(spread: unknown): string {
    const good = sampleSweep('2026-01-01T00:00:00.000Z', {
        dashboard: { readyMs: 100, phases: {} },
    });
    const bad = {
        ...sampleSweep('2026-01-02T00:00:00.000Z', {}),
        pages: {
            dashboard: { readyMs: 100, phases: {}, spread },
        },
    };
    return `${JSON.stringify(good)}\n${JSON.stringify(bad)}\n`;
}

Deno.test('parseHistoryJsonl accepts a page without spread', () => {
    const a = sampleSweep('2026-01-01T00:00:00.000Z', {
        dashboard: { readyMs: 100, phases: {} },
    });
    const lines = parseHistoryJsonl(JSON.stringify(a) + '\n');
    assertStrictEquals(
        lines[0]!.pages.dashboard!.spread,
        undefined,
    );
});

Deno.test('parseHistoryJsonl accepts a valid spread', () => {
    const a = sampleSweep('2026-01-01T00:00:00.000Z', {
        dashboard: {
            readyMs: 357,
            phases: {},
            spread: {
                min: 331, max: 402, mean: 361.2, sigma: 19.8,
            },
        },
    });
    const lines = parseHistoryJsonl(JSON.stringify(a) + '\n');
    assertEquals(lines[0]!.pages.dashboard!.spread, {
        min: 331,
        max: 402,
        mean: 361.2,
        sigma: 19.8,
    });
});

Deno.test('parseHistoryJsonl rejects sigma below zero', () => {
    const err = assertThrows(
        () => parseHistoryJsonl(twoLinesSecondSpread({
            min: 1, max: 2, mean: 1.5, sigma: -0.1,
        })),
    ) as Error;
    assertMatch(err.message, /line 2/);
    assertMatch(err.message, /invalid shape/);
});

Deno.test('parseHistoryJsonl rejects min above max', () => {
    const err = assertThrows(
        () => parseHistoryJsonl(twoLinesSecondSpread({
            min: 3, max: 2, mean: 2.5, sigma: 0.5,
        })),
    ) as Error;
    assertMatch(err.message, /line 2/);
    assertMatch(err.message, /invalid shape/);
});

Deno.test('parseHistoryJsonl rejects a non-number spread field', () => {
    const err = assertThrows(
        () => parseHistoryJsonl(twoLinesSecondSpread({
            min: 1, max: 2, mean: 'x', sigma: 0.5,
        })),
    ) as Error;
    assertMatch(err.message, /line 2/);
    assertMatch(err.message, /invalid shape/);
});
```

JSON cannot carry `NaN` or `Infinity`, so "finite" is
exercised by the type check on `'x'`; `Number.isFinite`
still states the rule in the guard.

- [ ] **Step 4: Run them to verify the rejects fail**

Run one: `tests/measure-viz-core.test.ts`

Expected: the three `rejects …` tests FAIL with
`AssertionError: Expected function to throw.` The two
`accepts …` tests already pass — today's guard never looked
at pages — and stay as regression pins. (`.spread` on the
page type is a type error until Step 5; `--no-check` runs
it anyway.)

- [ ] **Step 5: Write the record implementation**

In `web-app/app/measure-core.ts`, replace `HistoryLine`
(lines 30-44) with the named spread type and the widened
page:

```ts
export type PageSpread = {
    min: number;
    max: number;
    mean: number;
    sigma: number;
};

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
        {
            readyMs: number;
            phases: Record<string, number>;
            spread?: PageSpread;
        }
    >;
};
```

Replace the `shapeHistoryLine` doc comment (lines 259-263):

```ts
/**
 * Shape one history JSONL object from sweep stats.
 * Pages map carries each page's median readyMs, median
 * phase timings, and the trimmed spread (min, max, mean,
 * sample σ). Caller stringifies + appends.
 */
```

Replace the page assignment inside it (lines 274-277):

```ts
        pages[page] = {
            readyMs: s.readyMs.median,
            phases: { ...s.phases },
            spread: {
                min: s.readyMs.min,
                max: s.readyMs.max,
                mean: s.readyMs.mean,
                sigma: s.readyMs.sigma,
            },
        };
```

- [ ] **Step 6: Write the parser implementation**

In `web-app/app/measure-viz-core.ts`, widen the type import
(lines 5-8):

```ts
import type {
    Budgets,
    HistoryLine,
    PageSpread,
} from './measure-core.ts';
```

Replace `isHistoryLine` (lines 114-135) and add the spread
guard directly below it:

```ts
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
    for (const page of Object.values(
        o.pages as Record<string, unknown>,
    )) {
        if (page === null || typeof page !== 'object') {
            return false;
        }
        const spread = (page as { spread?: unknown }).spread;
        if (spread === undefined) continue;
        if (!isPageSpread(spread)) return false;
    }
    return true;
}

function isPageSpread(v: unknown): v is PageSpread {
    if (v === null || typeof v !== 'object') return false;
    const o = v as Record<string, unknown>;
    const { min, max, mean, sigma } = o;
    if (
        typeof min !== 'number' || !Number.isFinite(min)
        || typeof max !== 'number' || !Number.isFinite(max)
        || typeof mean !== 'number' || !Number.isFinite(mean)
        || typeof sigma !== 'number' || !Number.isFinite(sigma)
    ) {
        return false;
    }
    return min <= max && sigma >= 0;
}
```

`parseHistoryJsonl` already wraps a `false` from
`isHistoryLine` as `history.jsonl line N: invalid shape`
(line 98-103); nothing there changes.

- [ ] **Step 7: Run both files and the type gate**

Run one: `tests/measure-core.test.ts tests/measure-viz-core.test.ts`

Expected: `ok | 79 passed | 0 failed` (32 + 42 after
Task 1, plus the five parser tests).

Run: `./test validate`

Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add web-app/app/measure-core.ts \
    web-app/app/measure-viz-core.ts \
    tests/measure-core.test.ts \
    tests/measure-viz-core.test.ts
git commit -m "Record per-page spread in history lines" \
    -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FKvfQB7E44FirpwbcQ9S6G"
```

---

### Task 3: Core — `pageCandle`, `systemCandle`, `trendAxisMax`

Spec § Pure core (the three signatures and their rules),
§ Testing (the `pageCandle`, `systemCandle`, `trendAxisMax`
bullets), § Sequence 5, Decision 3 (the system candle
averages page spreads; present only when every page carries
spread).

**Files:**
- Modify: `web-app/app/measure-viz-core.ts` (append a
  `// --- candles ---` section after `systemMetrics`, which
  ends at line 784)
- Test: `tests/measure-viz-core.test.ts` (import list lines
  10-36; append tests at the end of the file)

**Interfaces:**
- Consumes: `HistoryLine['pages'][string].spread?:
  PageSpread` (Task 2); `meanReadyMs` (already exported)
  for the equality assertion only.
- Produces:
  ```ts
  export type Candle = {
      min: number;
      max: number;
      mean: number;
      sigma: number;
      median: number;
  };
  export function pageCandle(
      page: HistoryLine['pages'][string],
  ): Candle | null;
  export function systemCandle(
      sweep: HistoryLine,
  ): Candle | null;
  export function trendAxisMax(
      points: Array<{ y: number; candle: Candle | null }>,
      budgetMs: number | null,
  ): number;
  ```
  Task 4 transcribes these three bodies into the client.

**Commandments touched:** IV Logic (`systemCandle` is null
when ANY page lacks spread — a single `return null` inside
the loop, not a count); VIII Simplicity (three functions,
no candle "strategy", no options object); IX Generality
(`trendAxisMax` takes the minimal point shape
`{ y, candle }`, so the client's richer point objects pass
structurally).

**Abominations risked:** Internal Defense (`pageCandle`
copies `spread` fields; it does not re-check them — the
parser did); Default Values (a missing candle is `null`,
never a zeroed candle); Premature Generalization (no shared
"mean of field" helper across the five sums).

- [ ] **Step 1: Write the failing tests**

In `tests/measure-viz-core.test.ts`, extend the import
block (lines 10-36) by adding, after `systemMetrics,`:

```ts
    pageCandle,
    systemCandle,
    trendAxisMax,
```

Append at the end of the file:

```ts
// --- candles ---

Deno.test('pageCandle null without spread', () => {
    assertStrictEquals(
        pageCandle({ readyMs: 100, phases: {} }),
        null,
    );
});

Deno.test('pageCandle carries spread and median', () => {
    assertEquals(
        pageCandle({
            readyMs: 357,
            phases: {},
            spread: {
                min: 331, max: 402, mean: 361.2, sigma: 19.8,
            },
        }),
        {
            min: 331,
            max: 402,
            mean: 361.2,
            sigma: 19.8,
            median: 357,
        },
    );
});

Deno.test('systemCandle averages page spreads', () => {
    const s = sampleSweep('t', {
        a: {
            readyMs: 100,
            phases: {},
            spread: { min: 80, max: 140, mean: 104, sigma: 20 },
        },
        b: {
            readyMs: 300,
            phases: {},
            spread: { min: 200, max: 400, mean: 296, sigma: 40 },
        },
    });
    assertEquals(systemCandle(s), {
        min: 140,
        max: 270,
        mean: 200,
        sigma: 30,
        median: 200,
    });
    assertStrictEquals(systemCandle(s)!.median, meanReadyMs(s));
});

Deno.test('systemCandle null when any page lacks spread', () => {
    const s = sampleSweep('t', {
        a: {
            readyMs: 100,
            phases: {},
            spread: { min: 80, max: 140, mean: 104, sigma: 20 },
        },
        b: { readyMs: 300, phases: {} },
    });
    assertStrictEquals(systemCandle(s), null);
});

Deno.test('systemCandle null for a sweep with no pages', () => {
    assertStrictEquals(
        systemCandle(sampleSweep('t', {})),
        null,
    );
});

Deno.test('trendAxisMax is the largest of y, candle max, budget', () => {
    const candle = {
        min: 90, max: 700, mean: 300, sigma: 50, median: 280,
    };
    const points = [
        { y: 280, candle },
        { y: 500, candle: null },
    ];
    // candle max above every y
    assertStrictEquals(trendAxisMax(points, null), 700);
    // budget above everything
    assertStrictEquals(trendAxisMax(points, 900), 900);
    // y above candle and budget
    assertStrictEquals(
        trendAxisMax(
            [{ y: 800, candle }, { y: 500, candle: null }],
            600,
        ),
        800,
    );
});

Deno.test('trendAxisMax floors at 1', () => {
    assertStrictEquals(
        trendAxisMax([{ y: 0, candle: null }], null),
        1,
    );
    assertStrictEquals(trendAxisMax([], null), 1);
});
```

Arithmetic check for the averaging test: min (80+200)/2 =
140; max (140+400)/2 = 270; mean (104+296)/2 = 200; sigma
(20+40)/2 = 30; median (100+300)/2 = 200 = `meanReadyMs`.

- [ ] **Step 2: Run to verify they fail**

Run one: `tests/measure-viz-core.test.ts`

Expected: the file fails to load — `SyntaxError: The
requested module '../web-app/app/measure-viz-core.ts' does
not provide an export named 'pageCandle'` — so every test
in the file is reported failed. That is the expected red.

- [ ] **Step 3: Write the implementation**

Append to `web-app/app/measure-viz-core.ts` after
`systemMetrics` (after line 784):

```ts

// --- candles ---

export type Candle = {
    min: number;
    max: number;
    mean: number;
    sigma: number;
    median: number;
};

/** Null when the page predates spread recording. */
export function pageCandle(
    page: HistoryLine['pages'][string],
): Candle | null {
    if (page.spread === undefined) return null;
    return {
        min: page.spread.min,
        max: page.spread.max,
        mean: page.spread.mean,
        sigma: page.spread.sigma,
        median: page.readyMs,
    };
}

/**
 * Mean over pages of each spread field; median is the
 * mean of page medians (meanReadyMs). Null when the sweep
 * has no pages or any page lacks spread.
 */
export function systemCandle(
    sweep: HistoryLine,
): Candle | null {
    const pages = Object.values(sweep.pages);
    if (pages.length === 0) return null;
    let min = 0;
    let max = 0;
    let mean = 0;
    let sigma = 0;
    let median = 0;
    for (const p of pages) {
        if (p.spread === undefined) return null;
        min += p.spread.min;
        max += p.spread.max;
        mean += p.spread.mean;
        sigma += p.spread.sigma;
        median += p.readyMs;
    }
    const n = pages.length;
    return {
        min: min / n,
        max: max / n,
        mean: mean / n,
        sigma: sigma / n,
        median: median / n,
    };
}

/**
 * Largest of every point's y, every present candle's max,
 * and the budget. Values ≤ 0 floor to 1, as the trend
 * builder does.
 */
export function trendAxisMax(
    points: Array<{ y: number; candle: Candle | null }>,
    budgetMs: number | null,
): number {
    let max = 0;
    for (const p of points) {
        if (p.y > max) max = p.y;
        if (p.candle !== null && p.candle.max > max) {
            max = p.candle.max;
        }
    }
    if (budgetMs !== null && budgetMs > max) {
        max = budgetMs;
    }
    if (max <= 0) return 1;
    return max;
}
```

- [ ] **Step 4: Run the file and the type gate**

Run one: `tests/measure-viz-core.test.ts`

Expected: `ok | 54 passed | 0 failed` (47 after Task 2
plus seven).

Run: `./test validate`

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/measure-viz-core.ts \
    tests/measure-viz-core.test.ts
git commit -m "Derive trend candles in the viz core" \
    -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FKvfQB7E44FirpwbcQ9S6G"
```

---

### Task 4: Rendering — client mirror, SVG, CSS, tooltip, caption

Spec § Rendering (every bullet), § Sequence 6, Decision 2
(both trend charts; nothing else moves).

**Files:**
- Modify: `web-app/app/measure-viz.ts`
  - `vizCss()`: three rules after `.sel-band` (line 348)
  - `vizClientScript()`: three mirrors after `systemDeltaMs`
    (ends line 730), before `budgetPressure`
  - `buildTrendSvg` (lines 1121-1228): axis max and unit,
    box width, a candle loop before the point loop
  - `renderSysTrend` (lines 1338-1369): `candle`, tooltip
    rows, caption
  - `renderTrend` (lines 1603-1649): `candle`, tooltip
    rows, caption

No `Deno.test` covers the client (it is a template string
and the visualizer is not in `./test browser`). The gate is
`./test validate`: `./test lint` catches an over-long
template line, `./test check` the TS around it. The witness
is a generated page opened in a browser (Step 8).

**Interfaces:**
- Consumes: the three bodies from Task 3 (transcribe them;
  do not "improve" them); the `spread` field shape from
  Task 2; the existing client `formatDurationPerf(ms,
  signed)`, `pickAxisUnit`, `xPos`, `yPos`.
- Produces: `buildTrendSvg` points are
  `{ index, y, candle, tipLines }` where `candle` is a
  `Candle` or `null`; three CSS classes `candle-whisker`,
  `candle-box`, `candle-median`. Task 5 embeds this client.

**Commandments touched:** III Uniformity (the mirrors keep
the core's names — `pageCandle`, `systemCandle`,
`trendAxisMax` — as `rollupPhases` and `meanReadyMs` already
do); V Clarity (the caption says what each mark is); VIII
Simplicity (a separate candle loop keeps the existing point
loop byte-identical); XII Performance (nothing new on the
hover path).

**Abominations risked:** Magical Values (the box width
constants are named `candleBoxMaxWidth` and
`candleBoxSlotFraction`; the 1px/2px strokes live in CSS
where they are self-disclosing); Unbidden Helper Code (no
shared tooltip helper — two call sites, duplicated without
shame per Commandment IX, matching the file's own two
`seg()`s); Foreign Tongues (the SVG speaks `candle-*`, not
`ohlc`); Obscurity (a one-line reason comment sits on the
candle loop's draw order).

- [ ] **Step 1: Add the three CSS rules**

In `vizCss()`, after line 348
(`.sel-band { fill: var(--band); pointer-events: none; }`),
add:

```css
.candle-whisker {
  stroke: var(--muted);
  stroke-width: 1;
  pointer-events: none;
}
.candle-box {
  fill: var(--band);
  stroke: var(--accent);
  pointer-events: none;
}
.candle-median {
  stroke: var(--accent);
  stroke-width: 2;
  pointer-events: none;
}
```

`pointer-events: none` matches the sibling `.point-vis` and
`.sel-band` rules for non-interactive SVG marks, so the hit
circle keeps every hover and drag (spec: "Hover,
drag-to-window … untouched").

- [ ] **Step 2: Add the three client mirrors**

In `vizClientScript()`, after the `systemDeltaMs` function
(its closing `  }` is line 730) and before
`  function budgetPressure() {`, insert (2-space indent,
inside the template):

```js
  function pageCandle(page) {
    if (page.spread === undefined) return null;
    return {
      min: page.spread.min,
      max: page.spread.max,
      mean: page.spread.mean,
      sigma: page.spread.sigma,
      median: page.readyMs,
    };
  }
  function systemCandle(sweep) {
    var keys = Object.keys(sweep.pages);
    if (!keys.length) return null;
    var min = 0;
    var max = 0;
    var mean = 0;
    var sigma = 0;
    var median = 0;
    for (var i = 0; i < keys.length; i++) {
      var p = sweep.pages[keys[i]];
      if (p.spread === undefined) return null;
      min += p.spread.min;
      max += p.spread.max;
      mean += p.spread.mean;
      sigma += p.spread.sigma;
      median += p.readyMs;
    }
    var n = keys.length;
    return {
      min: min / n,
      max: max / n,
      mean: mean / n,
      sigma: sigma / n,
      median: median / n,
    };
  }
  function trendAxisMax(points, budgetMs) {
    var max = 0;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (p.y > max) max = p.y;
      if (p.candle !== null && p.candle.max > max) {
        max = p.candle.max;
      }
    }
    if (budgetMs !== null && budgetMs > max) {
      max = budgetMs;
    }
    if (max <= 0) return 1;
    return max;
  }
```

A page parsed from the payload JSON with no `spread` key
reads `page.spread === undefined`, the same test the core
makes.

- [ ] **Step 3: Rewrite the head of `buildTrendSvg`**

Replace lines 1121-1143 (from `function buildTrendSvg` down
to and including `if (yMax <= 0) yMax = 1;`) with:

```js
  function buildTrendSvg(points, opts) {
    // points: {index, y, candle, tipLines[]}
    // opts: {budgetMs?, labelIndices?}
    if (!points.length) {
      return '<p class="muted">No samples in window.'
        + '</p>';
    }
    var budgetMs = opts.budgetMs == null
      ? null
      : opts.budgetMs;
    var yMax = trendAxisMax(points, budgetMs);
    var unit = pickAxisUnit([yMax]);
    var w = 640;
    var h = 260;
    var padL = 56;
    var padR = 16;
    var padT = 16;
    var padB = 36;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;
```

This removes `ys`, `unitVals`, and the old `yMax` lines
(Interpretations A and B). The lines from
`var span = endIndex - startIndex;` through the `yPos`
closure stay as they are.

Then change the budget-line guard at line 1178 from
`if (opts.budgetMs != null) {` to `if (budgetMs !== null) {`
and its `yPos(opts.budgetMs)` on the next line to
`yPos(budgetMs)`, so the function tests the budget one way.

- [ ] **Step 4: Draw the candles beneath the points**

Immediately after the `sel-band` push (its closing `);` is
line 1191) and before `var d = '';`, insert:

```js
    var candleBoxMaxWidth = 10;
    var candleBoxSlotFraction = 0.6;
    var boxW = span === 0
      ? candleBoxMaxWidth
      : Math.min(
        candleBoxMaxWidth,
        candleBoxSlotFraction * (plotW / span),
      );
    // Candles first, so the existing polyline, point,
    // and hit circle paint on top of them.
    for (var ci = 0; ci < points.length; ci++) {
      var c = points[ci].candle;
      if (c === null) continue;
      var cx = xPos(points[ci].index);
      parts.push(
        '<line class="candle-whisker" x1="' + cx
        + '" x2="' + cx + '" y1="' + yPos(c.max)
        + '" y2="' + yPos(c.min) + '"/>',
      );
      var boxTop = yPos(c.mean + c.sigma);
      var boxH = Math.max(
        1, yPos(c.mean - c.sigma) - boxTop,
      );
      parts.push(
        '<rect class="candle-box" x="' + (cx - boxW / 2)
        + '" y="' + boxTop + '" width="' + boxW
        + '" height="' + boxH + '"/>',
      );
      var my = yPos(c.median);
      parts.push(
        '<line class="candle-median" x1="'
        + (cx - boxW / 2) + '" x2="' + (cx + boxW / 2)
        + '" y1="' + my + '" y2="' + my + '"/>',
      );
    }
```

`yPos` is inverted (larger ms → smaller y), so
`yPos(c.max)` is the whisker's top and `yPos(c.mean +
c.sigma)` the box's top; the box height is at least 1
(spec). The slot between sweeps is `plotW / span`; with one
sweep in the window the box is `candleBoxMaxWidth` (spec).
The existing point loop and the `path` push after it do not
change.

- [ ] **Step 5: Pass the candle and the tooltip rows from the system chart**

In `renderSysTrend`, replace the `points` mapping (lines
1342-1361) with:

```js
    var points = series.map(function (p) {
      var s = sweeps[p.index];
      var candle = systemCandle(s);
      var tipLines = [
        ['SHA', s.sha],
        ['Date', formatUtc(s.at)],
        ['Mean', formatDurationPerf(p.meanMs, false)],
      ];
      if (candle !== null) {
        tipLines.push(
          ['Low', formatDurationPerf(candle.min, false)],
          ['High', formatDurationPerf(candle.max, false)],
          [
            'Box',
            formatDurationPerf(candle.mean, false)
            + ' ± '
            + formatDurationPerf(candle.sigma, false),
          ],
        );
      }
      tipLines.push(
        ['Runs', String(s.runs) + ' runs'],
        ['Pages', p.sampleCount + ' / ' + nPages],
      );
      return {
        index: p.index,
        y: p.meanMs,
        candle: candle,
        tipLines: tipLines,
      };
    });
```

`Mean` stays the tick's row; no second row is named Mean
(spec). Then extend the caption (lines 1365-1367) so the
`el.innerHTML = …` expression ends:

```js
      + '<p class="muted">Mean of page medians. '
      + 'Drag point→point to set window. '
      + 'No system budget line.</p>'
      + '<p class="muted">Candle: whiskers trimmed '
      + 'min–max, box mean ± 1σ, tick median. '
      + 'Sweeps without a candle predate spread '
      + 'recording.</p>';
```

The en-dash, `±`, and `σ` are typed directly, as `→`, `µ`,
and `Δ` already are in this file; the page declares UTF-8.

- [ ] **Step 6: Pass the candle and the tooltip rows from the page chart**

In `renderTrend`, replace the loop body that builds
`points` (lines 1608-1623) with:

```js
      var p = sweeps[i].pages[page];
      if (!p) continue;
      var s = sweeps[i];
      var candle = pageCandle(p);
      var tipLines = [
        ['SHA', s.sha],
        ['Date', formatUtc(s.at)],
        ['Ready', formatDurationPerf(p.readyMs, false)],
      ];
      if (candle !== null) {
        tipLines.push(
          ['Low', formatDurationPerf(candle.min, false)],
          ['High', formatDurationPerf(candle.max, false)],
          [
            'Box',
            formatDurationPerf(candle.mean, false)
            + ' ± '
            + formatDurationPerf(candle.sigma, false),
          ],
        );
      }
      tipLines.push(['Runs', String(s.runs) + ' runs']);
      points.push({
        index: i,
        y: p.readyMs,
        candle: candle,
        tipLines: tipLines,
      });
```

`Ready` stays the tick's row (spec). Then, after the
existing `Gaps mean the page was absent …` paragraph
(lines 1643-1646) and before `body.innerHTML = html;`, add:

```js
    html +=
      '<p class="muted">Candle: whiskers trimmed '
      + 'min–max, box mean ± 1σ, tick median. '
      + 'Sweeps without a candle predate spread '
      + 'recording.</p>';
```

- [ ] **Step 7: Run the gates**

Run: `./test lint`

Expected: exits 0 (no `lines exceed 78 characters`). If it
names a line inside the template, wrap it with another
`+ '…'` segment.

Run: `./test validate`

Expected: exits 0 — check, both TZ passes of the memory
suite (`ok | 79 passed` for the two measure files among
them), lint, schema, api docs.

- [ ] **Step 8: Generate a smoke page and have it witnessed**

Nothing under the repo's `measurements/` changes in this
task. Build a temp root with a synthetic two-sweep history
— the first sweep without `spread`, the second with — and
render it:

```bash
export DENO_DIR="$TMPDIR/deno-dir"    # sandbox only
ROOT="$TMPDIR/candles-smoke"
mkdir -p "$ROOT/measurements"
cp measurements/budgets.json "$ROOT/measurements/"
cat > "$ROOT/measurements/history.jsonl" <<'JSONL'
{"at":"2026-09-14T00:00:00.000Z","sha":"aaaaaaa","machine":{"platform":"darwin","arch":"arm64","cpuModel":"unknown","cpuCount":16},"runs":25,"pages":{"dashboard":{"readyMs":119,"phases":{"boot:page-init":38.4}},"ideas":{"readyMs":150,"phases":{}}}}
{"at":"2026-09-15T00:00:00.000Z","sha":"bbbbbbb","machine":{"platform":"darwin","arch":"arm64","cpuModel":"unknown","cpuCount":16},"runs":25,"pages":{"dashboard":{"readyMs":121,"phases":{"boot:page-init":40},"spread":{"min":100,"max":160,"mean":123,"sigma":12}},"ideas":{"readyMs":148,"phases":{},"spread":{"min":130,"max":190,"mean":150,"sigma":15}}}}
JSONL
deno run --frozen --allow-read --allow-write="$ROOT" - "$ROOT" <<'TS'
import { generateMeasureViz } from './web-app/app/measure-viz.ts';
console.log(generateMeasureViz(Deno.args[0]!));
TS
```

Expected: prints
`…/candles-smoke/measurements/page-load-times-broken-in-ichat.html`.
(`deno run -` reads the program from stdin and resolves the
relative import against the cwd, the pattern
`bin/postgres-lib` already uses.)

Report that path. The reviewer opens it as a `file://` URL
and confirms, on the system chart and then on
`#/page/dashboard`:

- the first sweep draws a point on the line and nothing
  else — exactly as today;
- the second sweep draws a muted vertical whisker, a
  translucent box with an accent border, and a 2px accent
  tick, all beneath the point and the line;
- hovering the second point shows `Low`, `High`, and `Box`
  rows after `Mean` (system) or `Ready` (page), before
  `Runs`;
- the candle caption sits under each chart's existing
  muted text;
- dragging point→point still sets the window; SHA labels
  still draw.

- [ ] **Step 9: Commit**

```bash
git add web-app/app/measure-viz.ts
git commit -m "Draw spread candles on both trend charts" \
    -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FKvfQB7E44FirpwbcQ9S6G"
```

---

### Task 5: Regenerate the visualizer HTML

Spec § Sequence 7; § Witness ("`./bin/measure --visualize`
(no Chrome)").

**Files:**
- Modify: `measurements/page-load-times-broken-in-ichat.html`
  (generated; never hand-edited)

**Interfaces:**
- Consumes: the client from Task 4, embedded by
  `generateMeasureViz`.
- Produces: the committed page, now carrying the candle CSS
  and client. No committed sweep carries `spread` yet, so
  the page draws no candle until the operator's next
  `--record` sweep (spec § Witness).

**Commandments touched:** I Reliability (the committed page
matches the committed generator — the Office of the Commit:
"commit before you build"). **Abominations risked:** none
new; do not edit the HTML by hand.

- [ ] **Step 1: Confirm a clean tree on Task 4's commit**

```bash
git status --porcelain
git log --oneline -1
```

Expected: empty status; the head subject is
`Draw spread candles on both trend charts`.

- [ ] **Step 2: Regenerate from disk**

```bash
export DENO_DIR="$TMPDIR/deno-dir"    # sandbox only
./bin/measure --visualize
```

Expected: stderr ends with
`Wrote visualizer → …/measurements/page-load-times-broken-in-ichat.html`.
No Chrome starts; no server starts.

- [ ] **Step 3: Verify the diff is only the generated page and carries the client**

```bash
git status --porcelain
grep -c 'candle-box' \
    measurements/page-load-times-broken-in-ichat.html
```

Expected: status shows exactly
` M measurements/page-load-times-broken-in-ichat.html`; the
count is 2 (one CSS rule, one client string).

- [ ] **Step 4: Run the commit gate**

Run: `./test validate`

Expected: green through check, memory suite, lint, schema,
api docs.

- [ ] **Step 5: Commit**

```bash
git add measurements/page-load-times-broken-in-ichat.html
git commit -m "Regenerate the measure visualizer HTML" \
    -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FKvfQB7E44FirpwbcQ9S6G"
```

---

## Landing

After Task 5, from the spec worktree:

```bash
git rebase master          # amend until every commit is green
./test validate
cd /Users/tmornini/code/fusion-angle
git merge --ff-only 2026-09-15-measure-candles
git worktree remove .worktrees/2026-09-15-measure-candles
git branch -d 2026-09-15-measure-candles
```

The first candle appears when the operator runs a
`--record` sweep on their machine (spec § Witness); that
sweep, its history line, and its regenerated page are that
operator's commit, not this plan's.

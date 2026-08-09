# Measure Viz Dashboard — Design Spec

**Date:** 2026-08-08  
**Status:** approved  
**Sibling:**  
[2026-07-12-measure-visualize-design.md](2026-07-12-measure-visualize-design.md)

## Context

`./measure --visualize` emits a self-contained HTML file
(`measurements/page-load-times-broken-in-ichat.html`) from
`history.jsonl` + `budgets.json`. Today it is a single
**Layout B** pane: page rank list + focused page detail
(trend / phase / budget) with compare-from / compare-to
selectors.

Gaps against how engineers actually read history:

1. Trend dots carry no hover payload (SHA / date / value).
2. Sweep range is only via two `<select>`s — slow for
   “zoom this regression window.”
3. There is no system-wide first look; every session starts
   already inside a single page.
4. Longitudinal history may contain structural outliers
   (partial page sets from older `--pages` records) that
   make system averages and trends harder to trust.

This work enhances the **generated** visualizer and
performs a **one-time history surgery** so committed
history is structurally uniform. It does not change
measure recording semantics, budget calibration formulas,
or `./validate`. It does not build an in-app admin page.

## Goals

1. **Point tooltips** on every trend data point: git SHA,
   sweep date/time, ready value (adaptive duration), and
   `runs` (sample quality).
2. **Drag-range on points:** press on one point, release on
   another → set the active visualization window
   (start / end sweeps).
3. **Two-level navigation:** system dashboard first;
   existing per-page Layout B becomes drill-down.
4. **System aggregates** that answer “is the app getting
   slower?” without picking a page first.
5. **History normalization** — one-time surgery so retained
   sweeps share a structural page set (drop partials /
   outliers; never invent timings).
6. Stay **zero-deps**, self-contained HTML, pure math in
   `measure-viz-core.ts`, generator in `measure-viz.ts`.

## Non-goals

- Chart libraries / CDN / React
- Committing the generated HTML
- Live RUM, server tier, or in-app PAGE_REGISTRY page
- Changing history **schema** or budget **calibration**
  math (rewriting **rows** for structural parity is in
  scope; inventing new medians is not)
- Phase-level budgets
- Touch-polish beyond Pointer Events (desktop-first;
  pointer path covers stylus/trackpad)
- Re-running Chrome to backfill missing pages or to
  homogenize `runs` (expensive; not this change set)

## Vocabulary

Use **metric**, not “KPI”. Cards, tables, and docs say
“system metrics,” “metric card,” etc.

---

## Revisions answered (review comments)

### 1) Prefer “metric” over “KPI”

**Accepted.** Every former “KPI” label in this design is
**metric**. UI copy, headings, and code names follow
(`systemMetrics`, not `systemKpis`).

### 2) Normalize historical data (was a non-goal)

**Accepted — structural surgery is in scope.** The old
non-goal “rewriting partial legacy history lines” is
removed. We normalize **structure**, not measured values.

**Audit of `measurements/history.jsonl` (2026-08-08):**

| Dimension | Uniform? | Action |
| --- | --- | --- |
| Page key set | Yes — 9 sweeps × 29 pages | Keep; pin as expected set |
| Phase names per page | Yes — no drift | Keep |
| Machine | Yes — darwin/arm64 M3 Max | Keep |
| `runs` | No — 5, 30, or 25 | Keep all full-registry lines; show `runs` in tooltips (do not delete longitudinal signal; do not invent re-medians) |
| `sha` / `at` / readyMs | Differ by design | Never “normalize” |

**Surgery rules (apply once; commit history file):**

1. Compute the **dominant page key set** = mode of
   `Object.keys(pages)` across lines (today: 29 keys).
2. **Drop** any line whose page key set is a proper
   subset or otherwise unequal to the dominant set
   (legacy partial `--pages` records).
3. Do **not** fill missing pages with zeros or copies.
4. Do **not** rewrite `readyMs`, phases, `sha`, or `at`.
5. Do **not** drop full-registry lines solely because
   `runs` differs (5 vs 25 vs 30). Those are valid
   medians at different sample sizes; the tooltip
   discloses `runs` so readers weight confidence.
6. After surgery, document residual intentional variance
   (`runs`) in the design + a one-line history note if
   useful.
7. Visualizer **remains defensive**: if a future partial
   slips in, means use present pages only and page trends
   gap — but committed history after surgery should not
   need that path.

If a later audit finds a dead PAGE_REGISTRY key still in
history or a new registry key never measured, do **not**
invent rows; optional follow-up is a fresh full ceremony
(`./measure`) — out of band.

---

## User-facing design

### Navigation model

```
┌─────────────────────────────────────────┐
│  Header (always): title, window picks,  │
│  summary, view breadcrumb               │
├─────────────────────────────────────────┤
│  VIEW: System  (default)                │
│    metrics · system trend · tables · …  │
│    → click a page row / name            │
├─────────────────────────────────────────┤
│  VIEW: Page (drill-down)                │
│    Layout B: rank list + focus modes    │
│    ← System (breadcrumb / button)       │
└─────────────────────────────────────────┘
```

**Default open:** System dashboard.  
**Enter page:** click a page identity anywhere it appears
(rank list, movers table, budget offenders, etc.).  
**Leave page:** “← System” control in header or breadcrumb.  
**Hash routing:** `#/` system, `#/page/<key>` page focus.
Unknown hash → system.

Existing Layout B behavior (rank tabs ready / Δ / budget%,
focus tabs trend / phase / budget, page metrics) is
**preserved** inside the page view. Rank list remains the
primary way to hop between pages once drilled in.

### Active window (start / end)

Replace the mental model of “compare pair only” with an
**active window** over sweep indices:

| Concept | Meaning |
| --- | --- |
| `startIndex` | Inclusive left bound of the window |
| `endIndex` | Inclusive right bound |
| Default | `0` … `sweeps.length - 1` (full history) |
| Constraint | `0 ≤ start ≤ end ≤ n-1` |

**Effects of the window (everywhere):**

- Trend charts **plot only points whose sweep index is in
  [start, end]** (gaps inside the window still gap).
- System and page **Δ** = value(end) − value(start) for the
  same metric (page ready, or system mean ready).
- Phase / budget page modes use the **end** sweep (same as
  today’s “to”).
- Rank sort **Δ** and **budget%** use end (and start for Δ)
  within the window, same pure helpers as today with
  `fromIndex=start`, `toIndex=end`.
- Header selects stay: labels **Start** / **End** (rename
  from From / To). Changing a select updates the window.

**Single-sweep window** (`start === end`): Δ is `n/a`
(already pinned). Trend may show one point.

### 1) Hover tooltips

On every trend chart data point (system + page):

| Field | Source | Display |
| --- | --- | --- |
| SHA | `sweep.sha` | short as stored |
| Date | `sweep.at` | `YYYY-MM-DD HH:MM:SS` **UTC** |
| Value | series y | `formatDurationPerf` (unsigned) |
| Runs | `sweep.runs` | e.g. `25 runs` |
| Extra (system only) | sample count | `k / N pages` in the mean |

**Implementation notes:**

- Floating HTML tooltip (not SVG `<title>` alone).
- Larger invisible hit target (`r` ≥ 8); visible marker
  ~3.5.
- Hide on leave / drag start.
- Prefer `tabindex="0"` + `aria-label` with the same
  fields when cheap; Start/End selects remain the a11y
  path for window changes.

### 2) Click-hold-drag to set window

**Gesture (Pointer Events):**

1. `pointerdown` on a data-point hit target → capture
   pointer, remember `anchorIndex`, show selection preview.
2. `pointermove` → rubber-band between anchor and nearest
   point (or x-mapped index clamped to series indices).
3. `pointerup` → commit `start = min(a,b)`,
   `end = max(a,b)`; release capture; re-render.
4. Release on same point: **no window change**.
5. Explicit **Reset window** control in header restores
   full span (not double-click only).

**Visual during drag:** semi-transparent vertical band;
endpoints highlighted.

**Works on:** system mean trend and page ready trend.  
**Does not apply to:** phase / budget bar modes.

**Sync:** selects, metrics, rank Δ, both views re-render
from the same `startIndex` / `endIndex` state.

### 3) System dashboard (new initial view)

Layout (single column, scrollable; dense dark theme —
match existing tokens):

```
┌─ System metrics (4–6 cards) ──────────────────────┐
│ sweeps · pages · mean ready · Δ · over budget · … │
├─ System ready trend (SVG, same family as page) ───┤
│  mean of page readyMs per sweep · window drag     │
├─ Two columns (stack on narrow) ───────────────────┤
│  Biggest regressions (Δ desc) │ Biggest wins (Δ)  │
├─ Budget pressure ─────────────────────────────────┤
│  over / within / unknown counts · worst % table   │
├─ Phase mix at end sweep (stacked bar) ────────────┤
│  mean bucket shares across pages at end           │
└─ All pages table (sortable) → drill-down ─────────┘
```

#### System metrics (end of window unless noted)

| Metric | Definition |
| --- | --- |
| Sweeps in window | `end - start + 1` (also show total sweeps) |
| Pages | page key count (after surgery: same every sweep) |
| Mean ready | mean of page `readyMs` at **end** sweep |
| System Δ | meanReady(end) − meanReady(start); signed; `n/a` if same index or either side empty |
| Over budget | count of pages at end with ready > budget |
| Budget p50 | median of budget% across pages with both ready+budget at end |

Machine label from **end** sweep (`platform` / `arch` /
short `cpuModel`) in the summary line — not a metric card.

#### System trend series

For each sweep index `i` in the active window:

```
meanReady(i) = average of readyMs over pages present
               in sweeps[i].pages
```

After history surgery, “pages present” is the full set
for every retained sweep. Defensive path if a partial
appears later:

- Omit missing pages from that sweep’s mean (never invent
  0).
- If a sweep has zero pages: omit the point.

**No system budget line** (budgets are per-page; a
mean-of-budgets line is easy to misread). Caption:
“mean of page medians.”

Same axis unit picker and duration formatters as page
trend. Tooltips + drag-range as specified above.

#### Movers tables

Using `rankPages(..., start, end, 'delta')`:

- **Regressions:** top 8 with `deltaMs > 0` (worst first).
- **Wins:** top 8 with `deltaMs < 0` (most improved first).
- Row: page · Δ · end ready. Click → page view.

Empty state when all Δ null (single-sweep window).

#### Budget pressure

At **end** sweep:

- Counts: over (`ready > budget`), within
  (`ready ≤ budget`), unknown (missing ready or budget).
- Table: top 10 by budget% desc; ready, budget, %.
  Click → page view.

#### Phase mix (dashboard)

At **end** sweep: for each page, `rollupPhases`; average
the four bucket ms across pages. Stacked bar + legend.
Caption: “Mean phase mix across pages at end sweep
(page-init residual rules unchanged).”

#### All-pages table

Full rank table: page, ready, Δ, budget%. Default sort
ready desc; header toggles sort. Click row → page.

Page drill-down keeps the compact rank list.

### 4) Page drill-down (existing Layout B)

Upgrades only:

- Trend points: tooltips + drag-range (shared window).
- Header breadcrumb: `System / <page>`.
- Rank list still switches focused page.
- Focus modes trend / phase / budget unchanged in meaning.

## Architecture

```
history.jsonl (normalized) + budgets.json
        │
        ▼
 measure-viz-core.ts     pure (+ aggregate helpers)
   parse, rank, rollup, format, trendLabelIndices,
   systemMeanReadySeries, systemMetrics, …
        │
        ▼
 measure-viz.ts          HTML shell + CSS + client JS
   views: system | page
   shared: window state, tooltip, drag-range, charts
        │
        ▼
 measurements/page-load-times-broken-in-ichat.html
```

### Pure core additions (unit-tested)

| Function | Role |
| --- | --- |
| `meanReadyMs(sweep): number \| null` | Mean of present page readyMs; null if none |
| `systemReadySeries(sweeps, start, end)` | `{ index, meanMs, sampleCount }[]` in window |
| `systemDeltaMs(sweeps, start, end)` | mean(end) − mean(start) or null |
| `budgetPressure(sweeps, budgets, end)` | over / within / unknown + ranked rows |
| `meanPhaseBuckets(sweeps, end)` | mean boot/fetch/render/other at end |
| `pageKeySet(sweep)` / `dominantPageKeySet(sweeps)` | Surgery / audit helpers (pure) |
| `filterFullRegistrySweeps(sweeps, keys)` | Drop structural outliers (pure; used by surgery script or one-shot) |

Keep `rankPages` for movers / all-pages.

Existing: `formatDurationPerf`, `pickAxisUnit`,
`trendLabelIndices`, `rollupPhases`, `buildPayload`.

### History surgery delivery

One dedicated commit (after pure helpers exist, before or
beside viz UI — prefer **early** so viz work sees clean
data):

1. Pure helpers + tests for dominant set / filter.
2. Apply filter to `measurements/history.jsonl` (rewrite
   file; if zero drops needed today, still run audit and
   commit only if content changes — if no-op, skip the
   data commit and note “already uniform” in the spec).
3. Subject e.g. `drop partial measure history sweeps`
   (or skip if already clean).

As of audit: **no partial lines** — surgery is a verified
no-op on page sets; residual work is tooltip `runs`
disclosure, not mass deletion.

### Payload

**No DTO break:** keep `version: 1`
(`sweeps`, `budgets`, `compareDefault`, `generatedAt`).

New aggregate math lives in core with unit tests; embedded
client ports match (status quo inline JS). No version bump.

`compareDefault` seeds `startIndex` / `endIndex` on load.

### CLI / paths

Unchanged paths and flags:

| Path | Role |
| --- | --- |
| `measurements/history.jsonl` | input (normalized) |
| `measurements/budgets.json` | input |
| `measurements/page-load-times-broken-in-ichat.html` | output (gitignored) |

### File plan

| File | Change |
| --- | --- |
| `web-app/app/measure-viz-core.ts` | Aggregates + page-set helpers |
| `tests/measure-viz-core.test.ts` | Series, metrics, pressure, phases, filter |
| `web-app/app/measure-viz.ts` | System view; tooltips; drag; nav |
| `measurements/history.jsonl` | Surgery if any partials remain |
| `docs/superpowers/specs/2026-08-08-…-design.md` | This spec |
| `CLAUDE.md` § Measurement | Dashboard + page drill-down note |

## Interaction edge matrix

| Condition | Result |
| --- | --- |
| One sweep total | Window 0..0; system Δ n/a; drag no-op |
| Drag same point | No commit |
| Drag inverted order | Normalize min/max |
| Post-surgery full sets | Means over all pages; no page-trend gaps from missing keys |
| Defensive partial (future) | Gaps / present-only means; no invented zeros |
| Missing budgets | Hard fail at generate (unchanged) |
| Empty history | Hard fail (unchanged) |
| Hash `#/page/unknown` | System view |

## Sequencing (implementation commits)

1. **Spec commit** — land design under
   `docs/superpowers/specs/`.
2. **Core page-set helpers + aggregates + tests.**
3. **History surgery** (only if audit finds drops; else
   note no-op in commit message of step 2 or skip).
4. **Tooltips + drag-range on page trend** — window state
   ↔ Start/End; include `runs` in tooltip.
5. **System dashboard + navigation** — default system;
   drill-down; hash; breadcrumb.
6. **Dashboard tables + phase mix + CLAUDE.md.**
7. **Manual smoke** — regenerate viz; exercise interactions.

## Verification

### Automated

- Mean series / system Δ / budget pressure / mean phases.
- `filterFullRegistrySweeps` drops unequal page sets only.
- Existing rank / format / label tests stay green.
- `./validate` green.

### Manual

- `./measure --visualize` on post-surgery history.
- Tooltips: SHA, UTC date, value, runs.
- Drag sets Start/End; Reset restores full span.
- System ↔ page navigation; numbers match Layout B for
  the same window.
- No console errors; no network from the HTML.

## Risks / abominations

| Risk | Guard |
| --- | --- |
| Chart library | Forbidden |
| Invented zeros / backfilled pages | Surgery drops; means never invent |
| Deleting good full-registry 5-run data | Keep; show `runs` |
| Mean-of-budgets as fake SLO | No system budget line |
| Core vs inlined client drift | Core tests + careful port |
| Unbidden scope | Dashboard + page + tooltip + drag + surgery only |
| Silent history rewrite | Explicit commit; pure filter; no value edits |

## Settled decisions

1. **Window = zoom + Δ endpoints.** Selects: Start / End.
2. **UTC** in tooltips.
3. **No** system budget reference line on the mean chart.
4. **Hash routing** for system vs page.
5. **Reset window** explicit control.
6. **Output path** stays
   `page-load-times-broken-in-ichat.html`.
7. Vocabulary: **metric**, never KPI.
8. History: **structural normalize** (drop partials); keep
   heterogeneous `runs`; never invent timings.

## Handoff

After user approves this plan:

1. Commit the design to
   `docs/superpowers/specs/2026-08-08-measure-viz-dashboard-design.md`.
2. Write an implementation plan under
   `docs/superpowers/plans/` (task checkboxes, TDD order).
3. Implement per sequencing; Church of Code on every
   subagent (`Go to Medium Church!`).

Do not implement until the design is approved.

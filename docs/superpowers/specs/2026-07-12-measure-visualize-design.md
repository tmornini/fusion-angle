# Measure History Visualizer — Design

Date: 2026-07-12
Status: approved (brainstorm 2026-07-12; user gates passed)

## Context

`./measure` already records page-load medians and phase
timings into `measurements/history.jsonl` and gates medians
against `measurements/budgets.json`. Engineers watching the
IndexedDB → Postgres migration need a fast visual read of
that committed history — not another multi-minute Chrome
sweep and not a multi-route app.

Sibling: [2026-07-12-page-performance-measurement-design.md](
2026-07-12-page-performance-measurement-design.md).

## User decisions

1. **Layout B** — rank list + focused detail (not mosaic,
   not timeline-primary).
2. **Adaptive duration display** — µs / ms / s from internal
   millisecond numbers; storage field names stay `readyMs`.
3. **Pickable compare pair** — UI selects any two sweeps;
   default first → latest.
4. **Generate-only artifact** — do not commit the HTML;
   gitignore it.
5. **Embed JSON** in the generated HTML (self-contained,
   `file://`-friendly).
6. **Budgets required** — missing budgets → hard fail.
7. **CLI** — bare `./measure --visualize` (no Chrome, no
   clean tree) **and** optional `--visualize` after a
   measure run; payload always from disk.
8. **Without `--record`** — viz regenerates from disk only;
   print a one-line note that this run is not in history.
9. **Approach 2** — pure `measure-viz-core.ts` + Node
   generator `measure-viz.ts` + thin hooks in `measure.ts`.
   Core stays source-agnostic for a future admin page with
   a different data adapter.

## Goals

Answer quickly:

1. Which pages are slow *now*?
2. Which pages got worse/better *across sweeps*?
3. Where does time go (boot vs fetch vs render) for a page?
4. How close is each page to its budget?

Form: one HTML file, one coordinated pane. At least three
slicing modes. Zero runtime deps. Not part of `./validate`.

## Non-goals

- Live RUM / server-tier beacons
- Replacing the tabular stdout report
- CI gating via the visualizer
- Playwright or charting libraries
- Committing the generated HTML
- Phase-level budget gates
- Building the future in-app admin page now

## Design

### A. Visual model (Layout B)

Single pane:

| Region | Role |
| --- | --- |
| Header | Sweep count, short summary, **compare-from** and **compare-to** selectors (default first → latest) |
| Left: page rank | PAGE_REGISTRY keys; sort tabs **ready** · **Δ** · **budget%** (default ready descending) |
| Right: focus | Selected page; mode tabs **trend** · **phase** · **budget** |

**Slice 1 — Trend.** Ready over sweeps for the focused page;
budget ceiling as a reference line when that page has a
budget; KPIs: latest ready, Δ(from→to), budget %.

**Slice 2 — Phase.** Stacked boot / fetch / render for the
**to** sweep of the compare pair; list of wire-stable phase
names from history. Missing phases omitted — never painted
as zero.

**Slice 3 — Budget.** Median vs ceiling, % used, headroom;
budget% rank uses the same math.

**Interaction.** Click a page in the list → focus modes all
show that page. Changing the compare pair re-ranks Δ and
refreshes KPIs.

Page identity is always a PAGE_REGISTRY key, never a full
URL.

### B. Duration display

Internal values remain milliseconds (`readyMs`, phase maps).
Pure formatter `formatDurationPerf(ms: number): string`
(name may vary; spirit fixed):

| Range (absolute ms) | Display |
| --- | --- |
| `|x| < 1` | integer µs, e.g. `400 µs` |
| `1 ≤ |x| < 1000` | ms, e.g. `245 ms`, `1.5 ms` |
| `|x| ≥ 1000` | s, e.g. `3.28 s` |

Rules:

- Signed deltas keep the sign: `+990 ms`, `−12 ms`.
- Chart axes pick **one unit for the whole axis** so ticks
  stay comparable.
- Rank list and KPIs format **each value independently**.
- Space before unit (`3.28 s`) for dense-table scanability.
- Do **not** reuse `duration-units.ts` — that ladder is for
  flow minimums starting at whole seconds.

### C. CLI

| Invocation | Behavior |
| --- | --- |
| `./measure` | Full ceremony: record + write-budgets + runs 25 + visualize (full registry); viz regenerates after record. |
| `./measure --visualize` | Early path: no clean-tree gate, no Chrome, no build/serve. Read history + budgets → write HTML → exit. |
| `./measure … --visualize` | Existing measure flow; after a successful run, regenerate viz from **disk**. |
| `./measure --record --visualize` | Append history (full registry only), then viz includes the new line. |
| Measure with `--visualize` but without `--record` | Viz from disk only; stdout one-line note that this run is not in history. |

**Hard failures (exit 1, named paths):**

- Missing or empty `measurements/history.jsonl`
- Unparseable JSONL line (include line number)
- Missing or unreadable `measurements/budgets.json`

**Paths (hardcoded, same family as measure today):**

- History: `measurements/history.jsonl`
- Budgets: `measurements/budgets.json`
- Output: `measurements/index.html`

**Gitignore:** `measurements/index.html` (generate-only).

**Not wired into `./validate`.**

`./validate` line lint covers `api/`, `web-app/`, `tests/`,
`shared/` (and root scripts/md) — **not** `measurements/`.
Generated HTML is exempt; source under `web-app/app/` is
not.

### D. Architecture

```
history.jsonl + budgets.json
        │
        ▼
 measure-viz-core.ts   pure, type-checked, unit-tested
   parse / normalize / rank / delta / phase rollup /
   budget ratio / duration format / buildPayload
        │
        ▼
 measure-viz.ts        Node-only I/O + HTML emit
        │              (inline CSS/JS + embedded JSON)
        ▼
 measurements/index.html   gitignored
```

**Future admin page (not built):** a second adapter maps
server/RUM data into the same core types and pure
view-model; a real PAGE_REGISTRY page replaces the
generated chrome. The embedded HTML is not the admin UI.

**Reuse:** import `HistoryLine` and `Budgets` from
`measure-core.ts`. Do not duplicate those types.

**Rendering:** zero dependencies — CSS layout, SVG for
trend, div stacks for phase and budget bars. No CDN, no
chart library.

**Phase rollup:** sum phase milliseconds by name prefix
`boot:`, `fetch:`, `render:`. Unknown prefixes → an
`other` bucket (visible, not dropped silently).
`boot:page-init` is a parent span that nests `fetch:*` and
`render:*`; rollup contributes only its **residual**
(`page-init − Σ fetch − Σ render`, floored at 0) to the
boot bucket so the stacked bar does not double-count.

### E. Embedded payload (versioned DTO)

Generated HTML embeds one JSON document, e.g.:

```ts
{
  version: 1,
  generatedAt: string, // ISO
  compareDefault: { fromIndex: 0, toIndex: n - 1 },
  budgets: Record<string, { readyMs: number }>,
  sweeps: HistoryLine[], // same shape as history rows
}
```

Client script checks `version`. Bump `version` when the
DTO shape breaks consumers.

New partial records (`--record` with `--pages`) are
**illegal** at the CLI (full registry only). The visualizer
must still tolerate **legacy** partial lines: union of page
keys across sweeps; missing points are gaps in the trend —
never invented.

Single-sweep history: compare selectors offer one sweep;
pure core returns `null` for Δ; UI shows `n/a` (pin in
tests).

Budget ratio only when both median and budget exist for
that page; budget% sort places N/A last.

### F. File plan

| File | Role | Typecheck |
| --- | --- | --- |
| `web-app/app/measure-viz-core.ts` | Pure logic | Included (like `measure-core.ts`) |
| `web-app/app/measure-viz.ts` | Read files, emit HTML | Excluded (like `measure.ts`) |
| `web-app/app/measure.ts` | `--visualize` parse, early exit, post-run hook | Excluded |
| `tests/measure-viz-core.test.ts` | Unit tests | `./test` |
| `./measure` | Comment lists `--visualize` | — |
| `.gitignore` | `measurements/index.html` | — |
| `CLAUDE.md` | § Measurement documents the flag | — |

`measure-viz.ts` and any generator helpers stay out of the
browser bundle (Node-only, tsconfig `exclude`).

### G. Error and edge matrix

| Condition | Result |
| --- | --- |
| No history / zero valid lines | Exit 1 |
| Bad JSONL line | Exit 1 + line number |
| No budgets | Exit 1 |
| Page in sweep without budget | Render; N/A for budget ratio; last in budget% sort |
| Legacy partial page sets across sweeps | Gaps, no fill (new partial records illegal at CLI) |
| One sweep | Δ `null` / UI `n/a` (tested) |

## Sequencing (implementation commits)

One concern per commit; pure core green before generator.

1. `measure-viz-core.ts` + `tests/measure-viz-core.test.ts`
   (parse, formatDurationPerf, delta, rank, phase rollup,
   budget ratio, buildPayload).
2. `measure-viz.ts` — generate usable Layout B HTML with
   embedded payload (list + three modes + compare pair).
3. `measure.ts` + `./measure` + `.gitignore` — flag, early
   path before clean-tree/Chrome, post-sweep hook, note
   when visualizing without `--record`.
4. `CLAUDE.md` § Measurement — document `--visualize`,
   output path, generate-only, no Chrome for bare flag.

## Verification

### Automated

- Duration ladder edges (sub-ms, ms, ≥1s, signed delta).
- Rank order for ready / Δ / budget%.
- Phase rollup; missing phases not zero-filled.
- Payload `version` and sweep count.
- Malformed JSONL throws with line context.

### Manual

- Dirty tree: `./measure --visualize` succeeds without
  Chrome; produces `measurements/index.html`.
- Open via `file://` or a trivial static server.
- Missing budgets → exit 1.
- Bare `./measure` or `./measure --record --visualize`
  (full registry): new history line appears in viz.
- Measure with `--visualize` without `--record`: note on
  stdout; viz matches disk history only.
- `./validate` green; `git status` does not show
  `measurements/index.html` as a tracked change.
- Click page + change compare pair updates Δ and KPIs.
- Spot-check against known history (e.g. workbox ~3.28 s,
  large positive Δ first→latest, budget tension near
  ceiling).

## Risks / abominations

| Risk | Guard |
| --- | --- |
| Chart library / CDN | Forbidden |
| Invented phase zeros | Omit only |
| Viz as second source of truth | Gitignore; never commit artifact |
| Math only in HTML strings | All math in `measure-viz-core` |
| `./measure` into `./validate` | Do not |
| Clean-tree required for visualize-only | Early exit before that gate |
| Rename storage fields | Display-only formatting |
| Premature admin / RUM UI | Types leave the door; do not build |
| Multi-route visualizer | Single pane only |
| 78-char on generated HTML | Not linted; source TS must obey |

## Implementation handoff

Execute in a **fresh session** (context length). Do not
implement in the brainstorm session.

Suggested start:

1. Read this spec fully.
2. Read `web-app/app/measure.ts` (CLI + main flow),
   `measure-core.ts`, `measurements/history.jsonl` shape,
   `.gitignore`, CLAUDE.md § Measurement.
3. Follow sequencing commits above.
4. Church of Code: pure core first, tests green, then I/O,
   then CLI hook.

Proselytize subagents with Medium Church if used; master
reads Full.

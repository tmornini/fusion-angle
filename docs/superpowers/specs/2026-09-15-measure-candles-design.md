# Measure candles: min/max whiskers and a mean ± σ box

- Date: 2026-09-15
- Status: awaiting review, pre-plan
- Worktree: `.worktrees/2026-09-15-measure-candles`
- Base: master at `e9d61b6a`
- Ships: a per-page `spread` in `measurements/history.jsonl`;
  candles on both trend charts of the measure visualizer
- Defers: per-phase spread; IQR boxes; raw-sample recording
- Witness: `./test validate`; `./bin/measure --visualize` (no
  Chrome); the first `--record` sweep on the operator's machine
  draws the first candle

## Problem

A history line keeps one median per page and per phase. The
trend charts plot that median alone, so a sweep whose runs
spread 60 ms wide and one whose runs sit within 5 ms draw the
same dot. The 2026-09-15 flow-stats regression was read from
the median alone; whether a move is a shift or noise cannot be
seen. The measure already computes a trimmed min, median, and
max per page and a sample standard deviation for the budget.
Only the median survives into the record.

## Decisions

1. **Box = mean ± 1σ; tick = median; whiskers = min and max.**
   All from the trimmed samples `statsForPage` already uses
   (ceil 10% each tail). σ is the sample standard deviation
   (Bessel), the helper the budget already uses.
2. **Both trend charts.** System trend and page trend. Phase
   stacked bars, the budget fill bar, and every table stay as
   they are; those show one sweep, not a series.
3. **The system candle averages page spreads.** Whiskers are
   the mean of page mins and the mean of page maxes; the box is
   the mean of page means ± the mean of page σ; the tick is the
   mean of page medians, today's line. Present only when every
   page in the sweep carries spread.
4. **Whiskers reach the trimmed extremes.** One sample set per
   candle; whiskers agree with the min and max the report
   prints.
5. **Additive record field.** `spread` is optional beside the
   unchanged `readyMs` median. No migration, no backfill. Old
   sweeps draw exactly as today.

## Out of scope

- Per-phase spread and candles in the phase view.
- IQR or percentile boxes.
- Recording raw samples.
- New CLI flags. `--record` writes spread unconditionally.
- Any change to `--check`, budgets, `--write-budgets`, or the
  text report.

## Record shape

`PageStats.readyMs` gains `mean` and `sigma`:

```ts
readyMs: {
    min: number;
    median: number;
    max: number;
    mean: number;
    sigma: number;
};
```

`HistoryLine.pages[page]` gains an optional `spread`:

```ts
{
    readyMs: number;                 // median, unchanged
    phases: Record<string, number>;  // medians, unchanged
    spread?: {
        min: number;
        max: number;
        mean: number;
        sigma: number;
    };
}
```

`shapeHistoryLine` writes `spread` for every page. The parser's
`isHistoryLine` accepts a page with no `spread`. When present,
all four fields must be finite numbers with `min <= max` and
`sigma >= 0`; anything else rejects the line as an invalid
shape with its line number, as today.

One page of one line, after this change:

```json
"flow-stats": {
    "readyMs": 357,
    "phases": { "fetch:flow-stats": 275 },
    "spread": {
        "min": 331, "max": 402, "mean": 361.2, "sigma": 19.8
    }
}
```

## Pure core

Three functions in `web-app/app/measure-viz-core.ts`, following
the existing split: tested logic in the core, mirrored by hand
in the ES5 client script the way `rollupPhases` and its
siblings already are.

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

export function systemCandle(sweep: HistoryLine): Candle | null;

export function trendAxisMax(
    points: Array<{ y: number; candle: Candle | null }>,
    budgetMs: number | null,
): number;
```

- `pageCandle` returns null when `spread` is absent; otherwise
  the four spread fields plus `median = readyMs`.
- `systemCandle` returns null when the sweep has no pages or
  any page lacks `spread`; otherwise each field is the
  arithmetic mean over pages of that page's field, and
  `median` is the mean of page medians, equal to
  `meanReadyMs` for the sweep.
- `trendAxisMax` is the largest of every point's `y`, every
  present candle's `max`, and the budget; at least 1, as the
  builder floors today.

## Rendering

`buildTrendSvg` accepts an optional `candle` per point. Draw
order per point: whisker, box, median tick, then the existing
median polyline, point, and hit circle on top, so old sweeps
without a candle look exactly as they do now.

- Whisker: a 1px `line` at the point's x from `yPos(max)` to
  `yPos(min)`, class `candle-whisker`, stroke `var(--muted)`.
- Box: a `rect` centered on the point's x, width the smaller of
  10 and 0.6 × the slot between sweeps (10 when the window
  holds one sweep), from `yPos(mean + sigma)` to
  `yPos(mean - sigma)`, height at least 1, class `candle-box`,
  fill `var(--band)`, stroke `var(--accent)`.
- Median tick: a 2px `line` across the box width at
  `yPos(median)`, class `candle-median`, stroke
  `var(--accent)`.
- The y-axis maximum comes from `trendAxisMax`, so no whisker
  clips.
- Tooltip rows added when a candle is present: `Low` (min),
  `High` (max), and `Box` as `mean ± σ`, each value through
  `formatDurationPerf`. They sit after the existing Ready or
  Mean row, which stays the tick. No second row is named Mean.
- Caption appended to both charts' muted text: "Candle:
  whiskers trimmed min–max, box mean ± 1σ, tick median. Sweeps
  without a candle predate spread recording."
- The three classes live in `vizCss()` beside the existing
  chart rules; colors come from the custom properties already
  defined on `:root`.
- Hover, drag-to-window, and SHA labels are untouched.

## Testing

`tests/measure-core.test.ts`:

- `statsForPage` mean and sigma on the trimmed set, against a
  known series.
- `shapeHistoryLine` writes `spread` from stats.

`tests/measure-viz-core.test.ts`:

- `parseHistoryJsonl` accepts a page without `spread`; accepts
  a valid `spread`; rejects `sigma < 0`, `min > max`, and a
  non-number field, each naming the line number.
- `pageCandle` null without `spread`; fields with it.
- `systemCandle` averages across pages; null when any page
  lacks `spread`; null for a sweep with no pages.
- `trendAxisMax` includes a candle max above every `y`,
  includes the budget, floors at 1.

The visualizer is not part of `./test browser`, so the
regenerated HTML is the witness, not a gate. Layer 1 stays the
gate.

## Sequence

1. Spec (this file).
2. Plan.
3. Statistics: `mean` and `sigma` in `PageStats`.
4. Record: `spread` through `HistoryLine`, `shapeHistoryLine`,
   and `isHistoryLine`.
5. Core: `pageCandle`, `systemCandle`, `trendAxisMax`.
6. Rendering: client mirror, SVG, CSS, tooltip, caption.
7. Regenerate `measurements/page-load-times-broken-in-ichat.html`
   with the bare `--visualize`.

One commit per step; steps 3 through 6 land test-first.

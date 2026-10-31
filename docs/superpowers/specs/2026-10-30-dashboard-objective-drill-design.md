# Dashboard objective drill

Branch and worktree `ui-refinement`.

## Intent

On `dashboard/index.html`, clicking an aggregate objective
row replaces the Objectives card with that objective's
approved projects. Each project row shows the project's
name, its own baseline/actual gauge, and its own score
graph. The graph is the aggregate graph, drawn by the
same painter.

## Decisions

- The drill stays inside the card. The address remains
  `dashboard/index.html`. Reload returns to the aggregate
  list.
- The list is approved projects only, the same set
  `approvedProjectIds` already uses.
- Sort is latest actual minus baseline, most negative
  first. A change of zero is a real change. A project
  with no actual, or an actual but no baseline, sorts
  after every numeric change. Equal changes, and that
  trailing group, sort by title ascending, then by
  project id ascending.
- The project name links to the project page. The gauge
  and the graph do not navigate.
- Step colors stay the dashboard's: a rise is success, a
  drop is destructive, an unchanged step is blue-400, and
  the baseline dot is muted.

## Non-goals

- Putting the open objective in the URL, and making the
  browser Back button restore the drill.
- A new route.
- Changing which projects the aggregate mean includes, or
  the aggregate row's layout.
- Changing sparkline geometry, hover copy, or colors.
- A new empty-state sentence. An objective with no
  approved projects opens onto an empty list.

## Behavior

The card root stays `card gauge-card
objective-aggregates-card`. The open objective id lives
in the dashboard page module for the visit. It starts
null.

An aggregate row carries `data-objective-id` and
`tabindex="0"`. A click on that row opens the drill. So
does Enter or Space while the row is focused. A click or
key on a `.spark-dot` only shows the readout the painter
already shows. Space on a row does not scroll the page.

The drilled header drops the trending icon. It is a
`type="button"` whose text is `← Objectives`, with
`data-drill-back`, and an `h3` of the objective's name.
The name is not a link. Activating the button clears the
open id and draws the aggregate list again.

Each drilled row is an `li.score-row` with
`data-project-id` and `data-empty="true"` when the series
has no points. The name sits in `.score-row-label` and is
an anchor to `buildPageUrl('project-detail', { projectId
})`. The anchor does not open or close the drill. The
gauge is the small bipolar gauge: outer arc the project's
baseline, inner arc its latest actual, either omitted
when absent, labels `Baseline` and `Actual`, empty
display text, the same call the aggregate row makes.
Its element id is `drill-` plus the project id, so two
rows do not share a gradient id. The graph is the shared
sparkline.

The drilled card adds `objective-drill`. Its `220px
110px 1fr` columns apply only inside `@media (min-width:
768px)`. Below that, the existing max-width 767px rule
on `.objective-aggregates-card .score-row` still puts
the label and the gauge on one line and the sparkline
full width beneath. A bare `.objective-drill` rule would
outrank that mobile rule. The aggregate list's `140px`
first column is unchanged.

A score, objective, or project change uses the render
path the page already uses. That path draws the drilled
card when the open id is still an active objective, and
the aggregate list otherwise. An id that is no longer
active is cleared first.

`setHtml` replaces the container's contents. The
container element stays. One delegated listener on
`#objective-aggregates-card` is bound once. A redraw
does not add another, and `init` retry does not add
another. Click uses `objectiveCardHit` on the event
target. Keydown does too, and only for Enter and Space.
When that hit opens the drill, the handler prevents the
browser default so Space does not scroll the page.

## Units

`buildProjectObjectiveRows` lives in
`web-app/app/scoring-aggregate.ts`, beside
`buildObjectiveTrendlines`.

```ts
interface ProjectObjectiveRow {
    projectId: Id;
    title: string;
    baseline: number | undefined;
    latestActual: number | undefined;
    points: TrendPoint[];
}

function buildProjectObjectiveRows(
    inputs: ObjectiveScoringInputs,
    projects: ReadonlyArray<{ id: Id; title: string }>,
    objectiveId: ObjectiveId,
): ProjectObjectiveRow[]
```

It ignores a project whose id is not in
`inputs.approvedProjectIds`. Baseline and latest actual
are the latest row for that project and objective, the
same `latestPerPair` the aggregate uses. The series
follows `buildObjectiveTrendlines` for one project: no
baseline yields no points; otherwise the first point is
that baseline, dated to its `at`. Later points are that
project's actuals sorted by `at`, one point per distinct
`at`, and the last row in that order supplies the value
when several share an `at`.

The returned array is sorted. A numeric change is
`latestActual - baseline`. Those rows sort by change
ascending. Rows with no numeric change follow them. Ties
break by title ascending using string `<`, then by
project id ascending using string `<`.

`buildSparkline(points: readonly TrendPoint[]): SafeHtml`
lives in `web-app/app/presenters/sparkline.ts`. It owns
the geometry, the axis, the segments, the dots, and the
tips that `DashboardObjectiveAggregatesPresenter` holds
today. The aggregate presenter calls it. The HTML classes
stay `sparkline-wrap`, `sparkline-svg`, `sparkline-axis`,
`sparkline-seg`, and `spark-dot`, including each
segment's and dot's `data-direction`.

`DashboardObjectiveProjectsPresenter` lives in
`web-app/app/presenters/dashboard-objective-projects.ts`
and is exported from `presenters/index.ts`. It takes the
objective name and the rows and returns the card.
`dashboard/index.ts` chooses that presenter or the
aggregate presenter.

`objectiveCardHit` lives next to the page wiring, in
`web-app/dashboard/objective-card-hit.ts`, so the click
rule is pure:

```ts
type ObjectiveCardHit =
    | { kind: 'open'; objectiveId: string }
    | { kind: 'close' }
    | { kind: 'none' };

function objectiveCardHit(
    target: Element,
): ObjectiveCardHit
```

`.spark-dot` and an anchor are `none`.
`[data-drill-back]` is `close`. `[data-objective-id]` is
`open` with that id. Anything else is `none`. The closest
match wins, and a dot or an anchor wins over the row that
contains it.

## Errors

A missing objective definition throws, as the aggregate
card does today. The drill cannot title the card without
the name.

An open id missing from the active objectives is not an
error. The id is cleared and the aggregate list returns.

A score whose project is not approved never becomes a
row.

A failed scoring read stays on the card's existing path.
This design adds no request and no status.

## Tests

`tests/scoring-project-objective-rows.test.ts` covers the
builder: a baseline plus two actuals, two actuals that
share an `at` collapsing to one point, no baseline
yielding no points, a project outside
`approvedProjectIds` omitted, and the sort (negative,
zero, positive, missing actual, missing baseline, equal
change by title, equal title by id).

`tests/presenter-dashboard-objective-projects.test.ts`
covers the back button, the objective name, the project
link, the gauge, `data-direction` on the shared
sparkline, row order, `data-empty` when the series is
empty, and an empty approved set (back control present,
no rows).

`tests/objective-card-hit.test.ts` covers a row, a spark
dot inside a row, the back button, a project link, and a
click on empty card chrome.

`tests/presenter-dashboard-objective-aggregates.test.ts`
stays green. The shared painter must keep the markup
those tests already pin.

## Files

- `web-app/app/scoring-aggregate.ts`
- `web-app/app/presenters/sparkline.ts`
- `web-app/app/presenters/dashboard-objective-aggregates.ts`
- `web-app/app/presenters/dashboard-objective-projects.ts`
- `web-app/app/presenters/index.ts`
- `web-app/dashboard/objective-card-hit.ts`
- `web-app/dashboard/index.ts`
- `web-app/app/styles/components-metrics.css`
- `tests/scoring-project-objective-rows.test.ts`
- `tests/presenter-dashboard-objective-projects.test.ts`
- `tests/objective-card-hit.test.ts`

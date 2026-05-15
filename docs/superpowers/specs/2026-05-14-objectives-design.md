# Objectives & Per-Objective Project Scoring

**Spec date:** 2026-05-14
**Status:** Approved, awaiting implementation plan

## Context

Today every project carries two free-typed integer impact
fields (`estimated_impact`, `actual_impact`) rendered as
"X / Y pts" in the project card and summed across approved
projects in the dashboard's Impact gauge. The numbers have no
organizational anchor — each project's impact means whatever
its author decided at the time. There is no shared vocabulary
for *what* impact a project has, no review-time scoring
against organizational priorities, no measurement of realized
vs. projected effect post-completion, and no per-objective
rollup across the portfolio.

This spec replaces those two integer fields with a
per-objective scoring model:

1. The CEO authors a small set of organization-level
   objectives.
2. During project review, the reviewer scores the project
   against each active objective via a slider in the range
   **[-100, +100]** — bipolar, so negative impacts on an
   objective (e.g., a revenue project that increases carbon
   emissions) are expressible.
3. Project **approval** gates on every active objective
   having a baseline score.
4. After approval, **actual** measurements are logged via
   "Log measurement" — rolling event-log entries during the
   approved phase.
5. Project **completion** gates on every baseline-scored
   objective having at least one actual measurement.
6. The dashboard's Impact gauge is reworked from sum-based
   unipolar to **average-of-project-averages** bipolar; a new
   per-objective aggregate card joins it.

Project impact is **derived**, never stored. The historical
record of objective wording is preserved via a revisions
event log; score rows reference only the immutable
`objective_id` and resolve current/historical names by
temporal join.

## Doctrine notes

The design honors specific Church-of-Code commandments and
articles. Implementers should keep these in scope:

- **Codd's normalization** — no duplication that can be
  fetched. Objective name/description live in
  `objective_revisions` only; score rows never carry name
  snapshots.
- **Temporal facts in event tables** — both baseline and
  actual scores are append-only event logs. Latest by
  `scored_at` per `(project_id, objective_id)` is "current."
- **No nulls, no defaults** — every column NOT NULL. Score
  range `[-100, +100]` integer; absence of a row = absence
  of the event.
- **HTTP-verb naming** — `get_*` = single API GET (one
  resource); `post_*` = multi-resource composition,
  computation, or side-effect. No `put_objective` exists
  (objective edits are POSTs that append revision rows).
- **Validation at the gate** — three sibling validators
  (`validateFlowForCreation` existing,
  `validateProjectForApproval` new,
  `validateProjectForCompletion` new); a generic
  `ValidationResult<P>` is the only abstraction across them.
- **Uniformity** — old `estimated_impact` / `actual_impact`
  columns are removed entirely, not renamed. The old gauge's
  computation path is deleted, not retained as a shim.
- **`data-tone` attribute + design tokens** — all sign-
  driven colors flow through CSS custom properties. Never
  raw hex in committed code.

## Schema

### Five new tables

Added to `TABLE_NAMES` in `api/db.ts`:

```
objectives
objective_revisions
deprecated_objectives
project_objective_baseline_scores
project_objective_actual_scores
```

### Row types (`api/types.ts`)

```ts
type ObjectiveId = string;

interface Objective {
    id:       ObjectiveId;
    position: number;
}

interface ObjectiveRevision {
    objective_id: ObjectiveId;
    name:         string;
    description:  string;
    revised_at:   string;
}
// Append-only. Conceptual PK: (objective_id, revised_at).
// Latest revised_at per objective_id = current definition.

interface DeprecatedObjective {
    objective_id:  ObjectiveId;
    deprecated_at: string;
}
// Tombstone. Conceptual PK: objective_id. Absence = active.

interface ProjectObjectiveBaselineScore {
    project_id:   ProjectId;
    objective_id: ObjectiveId;
    score:        number;
    scored_at:    string;
}
// Append-only. Conceptual PK:
// (project_id, objective_id, scored_at).
// Each Save baselines appends rows for moved sliders only.
// "Current baseline" for a pair = latest scored_at.

interface ProjectObjectiveActualScore {
    project_id:   ProjectId;
    objective_id: ObjectiveId;
    score:        number;
    scored_at:    string;
}
// Append-only. Identical shape to baseline; distinct table
// because distinct fact (reviewer's estimate vs. measurement
// event). Discriminator columns explicitly rejected — two
// vocabularies, two tables.
```

All timestamps RFC-3339 zulu with the fullest sub-second
resolution the environment provides (Office of Time).

### Project entity changes (`api/types.ts`)

REMOVE from `ProjectEntity`:
- `estimated_impact: number`
- `actual_impact: number`

Everything else on `ProjectEntity` is unchanged.

### Derived methods on `Project` (`adapters/projects.ts`)

Following the `workerName(map, id)` pattern from
`adapters/workers-union.ts`: throw on absent, expose
presence predicates. Callers branch at the seam.

```ts
class Project {
    isBaselineScored(
        activeObjectives: Objective[],
        latestBaselines: ProjectObjectiveBaselineScore[],
    ): boolean;

    isFullyActualScored(
        latestBaselines: ProjectObjectiveBaselineScore[],
        latestActuals:   ProjectObjectiveActualScore[],
    ): boolean;

    estimatedImpactScore(
        latestBaselines: ProjectObjectiveBaselineScore[],
    ): number;
    // Throws if zero baseline rows.
    // Returns: mean of baseline.score over the project's
    // latest-baseline rows.

    currentActualImpactScore(
        latestBaselines: ProjectObjectiveBaselineScore[],
        latestActuals:   ProjectObjectiveActualScore[],
    ): number;
    // Throws if any baseline-scored objective lacks an
    // actual. Returns: mean of latest-actual.score per
    // baseline-scored pair.
}
```

The presenter branches:

```ts
view.isBaselineScored(activeObjectives, latestBaselines)
    ? formatSigned(view.estimatedImpactScore(latestBaselines))
    : DISPLAY_ABSENT
```

## Validators

### Entity validators (`api/validators.ts`)

ADD `assert*` validators (telling-shape; throw on invalid;
return typed value):

- `assertObjective(v): Objective`
- `assertObjectiveRevision(v): ObjectiveRevision`
- `assertDeprecatedObjective(v): DeprecatedObjective`
- `assertBaselineScore(v): ProjectObjectiveBaselineScore`
- `assertActualScore(v): ProjectObjectiveActualScore`

Each enforces NOT NULL on every field, score range
`[-100, +100]` integer, RFC-3339 zulu timestamp format. No
defaults.

REMOVE from `assertProject`: validation of the removed
`estimated_impact` / `actual_impact` fields.

### Three sibling project validators

Shared generic shape (define in a new
`adapters/validation.ts` or co-locate in
`adapters/project-publish.ts`):

```ts
type ValidationResult<P> = {
    ready:    boolean;
    problems: P[];
};
```

Type-specific:

```ts
type ProjectProblem =
    | { kind: 'baseline_unscored'; objectiveId: ObjectiveId }
    | { kind: 'actual_unscored';   objectiveId: ObjectiveId };

validateProjectForApproval(
    project:          Project,
    activeObjectives: Objective[],
    latestBaselines:  ProjectObjectiveBaselineScore[],
): ValidationResult<ProjectProblem>;

validateProjectForCompletion(
    project:         Project,
    latestBaselines: ProjectObjectiveBaselineScore[],
    latestActuals:   ProjectObjectiveActualScore[],
): ValidationResult<ProjectProblem>;
```

Three call sites of the validate-gate pattern now exist:
1. `validateFlowForCreation` — `adapters/flow-publish.ts`
   (existing, unchanged)
2. `validateProjectForApproval` — NEW
3. `validateProjectForCompletion` — NEW

`ValidationResult<P>` is the only shared abstraction. Each
validator stays distinct; no validator factory.

## Adapters

### `adapters/objectives.ts` (NEW)

```ts
// Primitives — single API GET each
getObjective(ctx, id):              Promise<Objective>
getObjectives(ctx):                 Promise<Objective[]>
getDeprecatedObjectiveIds(ctx):     Promise<Set<ObjectiveId>>
getObjectiveRevisions(ctx, id):     Promise<ObjectiveRevision[]>

// Operations — multi-resource or computation
postActiveObjectivesRetrieval(ctx): Promise<Objective[]>
    // objectives + deprecated_objectives, filter

postCurrentObjectiveDefinition(ctx, id):
    Promise<{ name: string; description: string }>
    // revisions + argmax by revised_at

postObjectiveDefinitionAtTime(ctx, id, atTime: string):
    Promise<{ name: string; description: string }>
    // revisions + temporal argmax (revised_at <= atTime)

// Write operations
postObjectiveCreation(
    ctx, id, name, description, position,
): Promise<void>
    // commit(tx): PUT objective row + PUT first revision

postObjectiveRevision(ctx, id, name, description):
    Promise<void>
    // PUT new revision row (composite-key URL)

postObjectiveDeprecation(ctx, id):     Promise<void>
postObjectiveReactivation(ctx, id):    Promise<void>
postObjectiveReordering(
    ctx, idsInOrder: ObjectiveId[],
): Promise<void>
    // commit(tx) of N PUTs writing new positions
```

All writes notify `objectiveChanges`.

### `adapters/project-scoring.ts` (NEW)

```ts
// Primitives
getBaselineScoresForProject(ctx, projectId):
    Promise<ProjectObjectiveBaselineScore[]>
getActualScoresForProject(ctx, projectId):
    Promise<ProjectObjectiveActualScore[]>

// Operations
postProjectScoringRetrieval(ctx, projectId): Promise<{
    baseline: ProjectObjectiveBaselineScore[];
    actual:   ProjectObjectiveActualScore[];
}>

postPortfolioImpactSummary(ctx): Promise<{
    baselineMean: number | undefined;
    actualMean:   number | undefined;
    projectCount: number;
    actualCount:  number;
}>
    // avg-of-project-averages across approved projects;
    // means undefined when zero contributors.

postObjectiveAggregates(ctx): Promise<{
    objectiveId:            ObjectiveId;
    baselineMean:           number | undefined;
    latestActualMean:       number | undefined;
    projectsBaselineScored: number;
    projectsActualScored:   number;
}[]>
    // one entry per active objective; means undefined when
    // count is zero.

postProjectsScoreColumn(ctx): Promise<{
    projectId:             ProjectId;
    baselineAvg:           number | undefined;
    latestActualAvg:       number | undefined;
    baselineCount:         number;
    totalActiveObjectives: number;
}[]>
    // per-project rollup for the Projects list column

// Write operations — multi-noun POST composed of N PUTs
postProjectBaselineScoring(
    ctx,
    projectId: ProjectId,
    scores:    { objectiveId: ObjectiveId; score: number }[],
): Promise<void>
    // commit(tx) of N PUTs to baseline-score URLs.
    // Each URL keyed by (project_id, objective_id, scored_at)
    // — unique by timestamp. Caller passes only objectives
    // whose slider moved. Notifies scoreChanges.

postProjectActualMeasurement(
    ctx,
    projectId: ProjectId,
    scores:    { objectiveId: ObjectiveId; score: number }[],
): Promise<void>
    // Same shape, writes to actual-score table.
```

### `adapters/project-publish.ts` (NEW)

```ts
// Pure validators (no ctx — take fetched data)
validateProjectForApproval(...)   : ValidationResult<...>
validateProjectForCompletion(...) : ValidationResult<...>

// Multi-noun POST transitions
postProjectApproval(ctx, projectId: ProjectId): Promise<void>
    // Fetches active objectives + latest baselines via
    // postProjectScoringRetrieval. Runs validator. Throws
    // ProjectNotReadyError if !ready (defense in depth).
    // Else PUTs project row with status='approved'.
    // Notifies projectChanges.

postProjectCompletion(ctx, projectId: ProjectId):
    Promise<void>
    // Symmetric: validates, throws on !ready, else PUTs
    // status='completed'.
```

### Existing adapter updates

- **`adapters/projects.ts`** — REMOVE `impactBaseline()` /
  `impactCurrent()` view methods + `'impactBaseline'` from
  the `FIELDS` set in `projects/detail.ts`; ADD the four
  derived methods listed in the Schema section.
- **`adapters/dashboard.ts`** — REMOVE the existing Impact
  gauge entry from `getDashboardGauges`. The Portfolio Impact
  card uses `postPortfolioImpactSummary(ctx)` directly from
  the page module.
- **Notification channels** (the file housing existing
  channels — `ideaChanges`, `projectChanges`, etc.) — ADD
  `objectiveChanges` and `scoreChanges`.

### `RequestContext.commit` — unchanged

Both new scoring operations and the objective-reordering
operation use the existing `commit(tx)` primitive from
`adapters/shared.ts`. Each PUT inside the transaction
addresses a unique URL by composite key; PUTting a unique
URL creates a new resource (event-log append semantics
emerge from URL uniqueness, not from a non-idempotent verb).

## Presenters (`web-app/app/presenters/`)

Each NEW presenter is an immutable view object:
constructor takes the full data shape; public methods
return `SafeHtml`; never touches the DOM; never fetches.

### NEW presenters

1. **`organization-objectives.ts`** —
   `OrganizationObjectivesPresenter`. Renders the
   Objectives box: drag-to-reorder active list, "+ Add
   objective" affordance, "Deprecated" sub-section,
   per-row Edit and Deprecate / Reactivate buttons.

2. **`project-action-bar.ts`** —
   `ProjectActionBarPresenter`. Takes (project,
   activeObjectives, latestBaselines, latestActuals).
   Emits the buttons row (Score / Approve / Decline /
   Send back / Log measurement / Complete / View history)
   with per-button disabled state derived from project
   status and validator output. Tooltip on disabled
   buttons lists the missing objectives.

3. **`score-modal.ts`** — `ScoreModalPresenter`. Renders
   one `<input type="range" min="-100" max="100" step="1">`
   per active objective. Pre-fills from the project's latest
   baseline for that objective when one exists; renders
   visibly unset (no thumb shown, "Score required" hint
   beneath, slider snaps to the user's first click) when no
   prior baseline exists. Save posts to
   `postProjectBaselineScoring` only sliders whose current
   value **differs from the latest prior baseline OR which
   were not pre-filled (newly set)**. Untouched-and-unset
   sliders are omitted from the payload entirely; they
   neither pass nor fail the Approval gate — they simply
   remain unscored, and the Approve button stays disabled
   until they're addressed in a subsequent Score-modal pass.

4. **`measurement-modal.ts`** — `MeasurementModalPresenter`.
   Renders one slider per baseline-scored objective.
   Pre-fills with the latest actual for that objective if
   one exists, otherwise with the latest baseline value as a
   starting reference. Per-slider caption shows
   "Baseline: X · Last actual: Y (date)" for context. Save
   posts to `postProjectActualMeasurement` only sliders
   whose current value differs from the latest prior actual
   (or, for objectives with no prior actuals, sliders the
   user actively moved away from the baseline pre-fill).
   Untouched sliders are omitted from the payload.

5. **`project-objectives.ts`** —
   `ProjectObjectivesPresenter`. Read-only section on
   project-detail. For each baseline-scored objective:
   name + baseline + latest actual + mini bipolar bar.
   Includes "View history" button.

6. **`project-score-history.ts`** —
   `ProjectScoreHistoryPresenter`. Renders the project's
   full scoring history as a chronologically-merged table
   over four event streams: baseline events, actual events,
   objective-revision events (filtered to objectives the
   project was scored against), and deprecation events
   (same filter). Takes a `definitionResolver(objId,
   atTime)` closure; the page module pre-fetches relevant
   revisions and provides the resolver.

7. **`portfolio-impact.ts`** — `PortfolioImpactPresenter`.
   The dashboard's bipolar arc gauge.
   - Structure: concentric half-arcs matching existing
     `GaugePresenter` (180×95 viewBox, radii 65 outer / 45
     inner, 14px stroke).
   - All arc segments start at TDC (90, 20) outer or
     (90, 40) inner.
   - Positive value: sweep right with SVG sweep-flag 1;
     endpoint at
     `(90 + r·cos(270°+α), 85 + r·sin(270°+α))` where
     `α = (V/100)·90°`.
   - Negative value: sweep left with sweep-flag 0;
     endpoint at `(90 + r·cos(270°-α), 85 + r·sin(270°-α))`.
   - Single color per arc; `data-tone="positive" |
     "negative" | "neutral"` drives the hue via CSS tokens.
   - At-zero (un-scored) state: render only the muted
     background arcs and TDC tick; no value arcs.
   - Legend: 2-column grid (Actual left, Baseline right)
     matching existing `GaugePresenter` legend pattern.
   - Icon-box `data-tone` SHIFTS with value sign.

8. **`dashboard-objective-aggregates.ts`** —
   `DashboardObjectiveAggregatesPresenter`. Multi-row
   card, one row per active objective. Each row: objective
   name + horizontal bipolar bar (baseline area + actual
   tick) + signed baseline mean + signed actual mean +
   project count. Objectives with zero contributors render
   dimmed with empty bars and "0 projects."

### Existing presenters — updates

- `presenters/project.ts` — REMOVE the inline impact
  display (the "X / Y pts" treatment in the list card).
- `presenters/project-detail.ts` — REMOVE the Impact
  metric cell from both `ProjectDetailPresenter` and
  `ProjectDetailEditPresenter`. The read-only
  `ProjectObjectivesPresenter` takes its functional place
  on the page.
- `presenters/gauge.ts` (`GaugePresenter`) — NO CHANGES.
  Still handles Time and Cost. `PortfolioImpactPresenter`
  is a sibling, not a modification.
- `presenters/index.ts` (barrel) — ADD the eight new
  presenter exports.

## CSS additions

### `web-app/app/styles/components.css`

- **`.bipolar-bar`** — horizontal bar widget (zero-centered;
  baseline area sweeps right or left from TDC; actual tick
  at its value). Used by `ProjectObjectivesPresenter` (mini)
  and `DashboardObjectiveAggregatesPresenter` (rows). Three
  call sites total — Commandment IX threshold met.
- **`.score-row`** — row layout shared by per-objective
  dashboard rows and the read-only project-objectives
  section (label · bar · numbers · count).
- **`.objective-list-item`** — row layout for the
  Organization Objectives box (grip handle · name + desc ·
  edit · deprecate).

### `web-app/app/styles/pages.css`

- Score modal slider styling (single-site, page-scoped).
- Portfolio Impact gauge class hooks
  (`.portfolio-impact-card`, `.portfolio-impact-arc-outer`,
  `.portfolio-impact-arc-inner`, etc.).

All colors via `data-tone="positive" | "negative" |
"neutral"` and existing design tokens. Never raw hex in
production CSS.

## Page module changes

### `web-app/organization/index.html` + `index.ts`

- HTML adds:
  - `<div id="objectives-box"></div>` placeholder
  - Static dialog scaffolding for Add Objective, Edit
    Objective, Confirm Deprecation (matching existing
    `openDialog` pattern from `app/core.ts`)
- TS `init()`:
  - Fetch `postActiveObjectivesRetrieval(ctx)` +
    `getDeprecatedObjectiveIds(ctx)` (then `getObjectives`
    to resolve deprecated rows' display) + resolve current
    definitions
  - Instantiate `OrganizationObjectivesPresenter`, render
    into `#objectives-box`
  - Subscribe to `objectiveChanges` for re-render
  - Wire dialog open/close, drag-to-reorder pointer
    handlers, click handlers for Edit / Deprecate /
    Reactivate / Reorder

### `web-app/projects/detail.html` + `detail.ts`

- HTML adds:
  - Action-bar placeholder (replaces existing fixed buttons
    row)
  - Read-only Objectives section placeholder
  - Dialog scaffolding for Score modal, Log measurement
    modal, Approve confirmation, Complete confirmation,
    Score history modal
- TS `init()`:
  - Fetch project + active objectives +
    `postProjectScoringRetrieval(ctx, projectId)`
  - Instantiate `ProjectActionBarPresenter` and
    `ProjectObjectivesPresenter`; render
  - Subscribe to `scoreChanges`, `objectiveChanges`,
    `projectChanges`
  - Wire click handlers: Score → modal, Approve →
    confirmation → `postProjectApproval`, Log measurement
    → modal, Complete → confirmation →
    `postProjectCompletion`, View history → modal
- TS REMOVES: `'impactBaseline'` from the `FIELDS` set;
  related form-field draft handling.

### `web-app/projects/index.ts` (list page)

- Fetch `postProjectsScoreColumn(ctx)` alongside existing
  project list
- Pass the score map into the list presenter for the new
  Projected Impact column
- Subscribe to `scoreChanges` and `objectiveChanges`
- New column is sortable by projected average (descending
  default when filtered to pre-approval statuses)

### `web-app/dashboard/index.html` + `index.ts`

- HTML adds:
  - Portfolio Impact card placeholder
  - Aggregate objectives box placeholder
- TS `init()`:
  - Existing gauge fetch — REMOVE the Impact gauge entry
  - Fetch `postPortfolioImpactSummary(ctx)` for the
    Portfolio Impact card
  - Fetch `postObjectiveAggregates(ctx)` and
    `postActiveObjectivesRetrieval(ctx)` for the aggregate
    box
  - Instantiate `PortfolioImpactPresenter` and
    `DashboardObjectiveAggregatesPresenter`; render
  - Subscribe to `scoreChanges`, `objectiveChanges`,
    `projectChanges`

## Mock data (`api/mock-data.ts`)

Seed during `populateMockData`:

- **5 objectives** (positions 0–4):
  1. Revenue Growth — "Drive sustainable top-line growth"
  2. Cost Reduction — "Minimize operational waste"
  3. Customer Satisfaction — "Improve user-perceived value"
  4. Team Wellbeing — "Sustainable, energizing work"
  5. Operational Efficiency — "Reduce friction in delivery"
- **5 `objective_revisions`** — one initial revision per
  objective; `revised_at = mockDataSeedTime`
- **0 `deprecated_objectives`** — deprecation testable via UI
- Per existing mock project (deterministic-RNG based on the
  existing seeding logic):
  - `submitted`: zero scores
  - `under-review` / `sent-back`: 0–N baseline events
    (partial — exercises the disabled-Approve case)
  - `approved`: one baseline per active objective; 0–2
    actual events per pair
  - `completed`: one baseline per active objective; 1–3
    actual events per pair (gates completion)
  - `declined` / `deleted`: whatever scores existed at
    terminal-status time
- **No `estimated_impact` / `actual_impact` on any seeded
  project row** — removed entirely.

## Migration / breaking change

The schema change is breaking for any persisted localStorage
state from older builds.

1. Add a `SCHEMA_VERSION` constant (new
   `api/schema-version.ts` or co-located in `api/db.ts`).
   Bump to the next integer.
2. In `web-app/app/database-init.ts`, on bootstrap, read
   `fusion-ai:schema_version`. If absent or `<
   SCHEMA_VERSION`:
   - Wipe every `fusion-ai:*` key (reuse the existing
     wipe-on-fail logic from the snapshots import path)
   - Re-bootstrap from mock data
   - Write the new `SCHEMA_VERSION` value
3. No backward-compat shim; no migration code for old
   impact values. The codebase is mock-data-only at this
   stage; nothing real to preserve.

Optional one-shot toast: "Mock data was reset for the
updated schema."

## Tests

### Automated (Node `node:test` runner, ~16 new files)

```
tests/validators-objectives.test.ts
tests/adapters-objectives.test.ts
tests/adapters-project-scoring.test.ts
tests/adapters-project-publish.test.ts
tests/project-domain.test.ts
tests/objective-revision-resolution.test.ts
tests/presenter-organization-objectives.test.ts
tests/presenter-project-action-bar.test.ts
tests/presenter-score-modal.test.ts
tests/presenter-measurement-modal.test.ts
tests/presenter-project-objectives.test.ts
tests/presenter-project-score-history.test.ts
tests/presenter-portfolio-impact.test.ts
tests/presenter-dashboard-objective-aggregates.test.ts
tests/presenter-projects-list.test.ts
tests/mock-data.test.ts                          (updated)
```

Each test file uses `MemoryDbAdapter` (existing pattern,
`api/db-memory.ts`). Approximately +120 to +150 cases
total; CLAUDE.md's count of 657 grows to ~800.

Notable coverage:
- Validator gate logic tested at the *validator* level AND
  at the *post-action* level (defense in depth — same
  predicate verified twice)
- Temporal name resolution at exact-boundary edges
- The "only moved sliders" payload assembly in both score
  modals
- The at-zero rendering states (no value arc, "—" values)

### Manual browser regression (`TEST-PLAN.md`)

New section: `## K. Objectives & Scoring`. ~30 cases
distributed across existing Phase-2 agents:

| Range | Surface | Owner |
|---|---|---|
| K1–K8 | Org Objectives box | Agent-G |
| K9–K18 | Project detail action bar + Score + Approve | Agent-E |
| K19–K23 | Log measurement + Complete | Agent-E |
| K24–K26 | Projects list Projected Impact column | Agent-E |
| K27–K29 | Dashboard Portfolio Impact + Aggregates | Agent-CH |
| K30 | Project history modal | Agent-E |

**Mutation-domain delta** from CLAUDE.md's Phase 2 agent
table:
- Agent-G adds: `objectives`, `objective_revisions`,
  `deprecated_objectives`
- Agent-E adds: `project_objective_baseline_scores`,
  `project_objective_actual_scores`
- Agent-CH stays read-only

## Verification

End-to-end after implementation:

1. `./validate` — type-check + tests + lint. All ~800
   automated tests pass.
2. `./build` to produce the distribution ZIP.
3. `./serve 8080` (`TMPDIR=/tmp/claude ./serve 8080`
   inside the sandbox).
4. Manual smoke test (the golden path):
   - Open `http://localhost:8080/landing/index.html`
   - Sign in (mock auth)
   - Open Organization page → confirm Objectives box
     renders with 5 seeded objectives
   - Add a 6th objective via dialog
   - Open an existing submitted project; transition to
     under-review
   - Click Score; verify modal shows 6 sliders with
     "Score required" hints; set values; save
   - Verify Approve enables; click Approve → confirmation
     → confirm; verify project status flips
   - Open the now-approved project; click Log measurement;
     verify pre-fills with baselines; adjust some; save
   - Open project history modal; verify chronological
     event log including the just-logged measurement
   - Click Complete (should be disabled — not every
     objective has an actual yet); verify the disabled
     tooltip lists the missing objectives
   - Log measurements for the remaining objectives; verify
     Complete enables
   - Click Complete → confirmation → confirm
   - Open dashboard; verify Portfolio Impact gauge renders
     bipolar with the new project's contribution; verify
     the aggregates box shows rows for the active
     objectives with the new project counted
5. Manual edge cases (per TEST-PLAN K1–K30):
   - Deprecate an active objective; verify it leaves the
     active list and the gauge/aggregate's contributing
     pool; verify past project scores referencing it still
     appear in their project history modals
   - Edit an objective name; reload an old project's
     history; verify events from before the edit display
     the OLD name (temporal name resolution)
   - Run the parallel Phase 2 protocol; confirm Agent-G
     edits propagate to Agent-E and Agent-CH via
     `objectiveChanges` storage events
6. Visual regression — manual eye-check that the dashboard
   row reads symmetrically (Time + Cost + Portfolio Impact
   all use the same gauge proportions), and the aggregates
   box rows are scannable without scrolling at typical
   viewport widths.

## File manifest

```
api/types.ts                                      modified
api/db.ts                                         modified
api/validators.ts                                 modified
api/mock-data.ts                                  modified
api/schema-version.ts                             NEW
web-app/app/database-init.ts                      modified
web-app/app/changes.ts (or equivalent)            modified

web-app/app/adapters/objectives.ts                NEW
web-app/app/adapters/project-scoring.ts           NEW
web-app/app/adapters/project-publish.ts           NEW
web-app/app/adapters/validation.ts                NEW
web-app/app/adapters/projects.ts                  modified
web-app/app/adapters/dashboard.ts                 modified

web-app/app/presenters/organization-objectives.ts NEW
web-app/app/presenters/project-action-bar.ts      NEW
web-app/app/presenters/score-modal.ts             NEW
web-app/app/presenters/measurement-modal.ts       NEW
web-app/app/presenters/project-objectives.ts      NEW
web-app/app/presenters/project-score-history.ts   NEW
web-app/app/presenters/portfolio-impact.ts        NEW
web-app/app/presenters/dashboard-objective-aggregates.ts NEW
web-app/app/presenters/project.ts                 modified
web-app/app/presenters/project-detail.ts          modified
web-app/app/presenters/index.ts                   modified

web-app/app/styles/components.css                 modified
web-app/app/styles/pages.css                      modified

web-app/organization/index.html                   modified
web-app/organization/index.ts                     modified
web-app/projects/index.ts                         modified
web-app/projects/detail.html                      modified
web-app/projects/detail.ts                        modified
web-app/dashboard/index.html                      modified
web-app/dashboard/index.ts                        modified

tests/*                                           ~16 NEW
TEST-PLAN.md                                      modified
```

## Out of scope (explicit)

These are intentionally NOT addressed in this design — they
surfaced during brainstorming but belong elsewhere:

- **Performance work** — argmax-per-pair on event reads is
  fine at localStorage scale; indexed `ORDER BY scored_at
  DESC LIMIT 1` is the Postgres-migration shape, addressed
  there.
- **Project status transitions as an event log** —
  currently the project row carries `status` directly;
  converting that to a transitions event log is a separate,
  doctrinally-clean cleanup but unrelated to objectives.
- **Audit log for objective edits** — if substantive
  renames start producing confusion in practice, a future
  spec adds an audit table with before/after values. The
  current `objective_revisions` IS already an effective
  audit log for name/description; an additional explicit
  audit surface (with reason text, change author, etc.) is
  deferred.
- **Per-user permissions on objective editing** — the
  codebase currently has no real permission model; "the
  CEO" is the conceptual author but any logged-in user can
  edit objectives in practice. Out of scope.
- **Weighted averages** — the impact average is unweighted
  (each objective contributes equally to a project's
  average; each project contributes equally to the
  portfolio average). If a weighted scheme is desired
  later, it's a future spec.

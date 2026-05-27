# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code)
when working with code in this repository.

## Alignment

**Match the codebase's voice, or change the codebase.** A better
pattern earns its place by replacing every site of the old one —
never by living beside it. One codebase, one voice.

## Build & Dev Commands

### Commands

```bash
./test                 # Run automated tests
./validate             # Type-check + tests + lint (works on dirty tree)
./build                # Compile, bundle, minify, ZIP to ~/Desktop/
./build --no-zip dir/  # Bundle to dir/ without zipping (for testing)
./build dir/           # ZIP to dir/ instead of ~/Desktop/
./build --help         # Show usage
./serve <port>         # Build + start local HTTP server on <port>
```

**Commit before building.** `./build` requires a clean
working directory. Run `./validate` to catch type errors
and lint issues; commit; then build.

For local test-as-you-go:

```bash
./serve 8080
# open http://localhost:8080/landing/index.html
```

### Sandbox invocation

When running under the Claude Code sandbox, the defaults
above fail two ways: `/tmp/` is not writable, and the tsx IPC
pipe used by the `npx tsx` step inside `./build` lands in
`$TMPDIR/tsx-501/…` which is outside the sandbox's allowed
Unix-socket path (`/tmp/claude/tsx-501`). Use this invocation
instead:

```bash
TMPDIR=/tmp/claude ./serve 8080
# open http://localhost:8080/landing/index.html
```

`TMPDIR=/tmp/claude` redirects both tsx's IPC socket and
`./serve`'s temp build dir into the sandbox-allowed path.
`localhost` is reachable from the sandbox, so the Chrome MCP
tools can drive the page normally.

### Validate semantics

`./validate` runs `tsc --noEmit` (type checking), then
`./test` (automated tests against pure modules and the
`api/`, `adapters/`, and `presenters/` layers, via `node
--test --strip-types tests/*.test.ts`), then enforces a
78-character maximum line length on all `.ts`, `.html`, and
`.css` files (excluding `compose.ts`) and on every `.md`
file at the repo root except `TEST-PLAN.md` — exempted
because each test case bullet is meant to scan as one
self-contained line.

For what each test layer covers, see `## Testing`.

## TypeScript

Target: **ES2024** · Strict mode with
`noUncheckedIndexedAccess`. Config at
`web-app/app/tsconfig.json`. The `compose.ts` build script
is excluded from type checking (it runs in Node).

## Architecture

**Vanilla TypeScript** with zero runtime dependencies.
Enterprise innovation management platform with modules for
ideas, projects, workers, flows, workbox, and analytics.
Every page is a standalone HTML file served via HTTP. The
code also supports `file:///` protocol locally, but testing
is HTTP-only.

### Key Layers

- **HTML Composition.** `web-app/app/compose.ts` assembles
  `components-layout.html` + `component-*.html` + each page's
  `index.html` into composed standalones in a temp build dir.
  Standalone pages are copied directly.
- **Navigation.** `<a href>` between pages. `navigateTo(page,
  params?)` builds relative URLs.
- **Page Detection.** `<html data-page="dashboard">` →
  `PAGE_REGISTRY` lookup → page module's `init()`.
- **Source = Output Alignment.** `PAGE_REGISTRY` declares
  `sourceDir` and `sourceFile`. Both `compose.ts` and
  `navigateTo()` resolve output as
  `{sourceDir}/{sourceFile}.html` — the file you edit is the
  file the browser loads.
- **Auth.** Mock, returns `demo@example.com`.
- **Data.** REST-style API (`api/`) over localStorage. Adapters
  in `web-app/app/adapters/` shape rows for pages.
- **Presentation.** Presenters in `web-app/app/presenters/` emit
  `SafeHtml`.
- **Database.** localStorage with JSON serialization. Each
  entity table is a `fusion-ai:tableName` key. The `states`
  table is the unified append-only event log: every entity
  lifecycle change lands as one row `{id, entity_id, state,
  worker_id, at}`. The latest event by `at` is the entity's
  current state, with `>=` tiebreak on same-millisecond
  writes so the deterministic insertion order of the
  append-only log decides ties. `StateStore` is its own
  class (not a templated `EntityStore`) with four route
  definitions covering five HTTP operations: `GET/PUT
  states/:id`, `GET states`, `GET entity-states/:id`
  (current), `GET entity-states/:id/history` (ordered).
  Tombstones are retired — the
  `deprecated` and `deleted` tombstone tables, and the
  polymorphic `TombstoneStore` class, are gone; `'deleted'`
  is now a state event value, not a separate table.
  `EntityStore.getAll`/`getById` consult
  `StateStore.deletedIds()` / `isDeleted(id)` to filter
  currently-deleted rows. `EntityStore.delete(id)` is
  retained for hard splice of relationship rows
  (`state_field_values`, etc.) — the doctrinal distinction
  is entity lifecycle = state event; relationship
  dissolution = splice. Entity rows never carry state
  columns. History stores hard-delete via splice. When no
  schema exists, non-entry pages redirect to snapshots.

  The `'system'` worker (`SYSTEM_WORKER_ID = 'system'` in
  `api/types.ts`) is the well-known actor seeded as a real
  `HumanWorkerEntity` row by both `populateMockData` and
  `populateBootstrapData`. State events without a specific
  user actor reference this worker.
- **State.** Module-level vars + pub-sub for theme, mobile, auth,
  sidebar.
- **Read-only siblings of editable pages.** `flow-stats.html` is a
  flat, non-editable rendering of one flow's diagram (heat-tinted by
  share of trailing-90-day flow time, with a hover/click stat card
  and a path stepper). It is a sibling, not an extension, of
  `flow-detail` — see `### Flow Canvas` for the renderer split.

### State Alphabets

The states log carries entity lifecycle events. Each entity
type uses its own state alphabet — distinct vocabularies for
distinct lifecycles, all stored in the one log. Defined in
`api/types.ts` as `IDEA_STATES`, `PROJECT_STATES`,
`WORKER_STATES`, `FLOW_STATES`, `RECORD_STATES`, with
`assertIdeaState` / `assertProjectState` /
`assertWorkerState` / `assertFlowState` /
`assertRecordState` and the matching `is*` guards.

**Ideas** (7 values, single-dimension lifecycle):
- `active`, `in-review`, `approved`, `promoted`,
  `sent-back`, `archived`, `deleted`

Readiness is a derived property of the `Idea` domain
object, computed at instantiation from required-field
presence: `title`, `problem_statement`,
`proposed_solution`, `expected_outcome` all non-empty →
`'ready'`; any one empty → `'incomplete'`. Readiness is
not stored in the states log; `Idea.readinessValue()` /
`Idea.isReady()` derive per call.
`canBeSubmittedForReview()` gates on lifecycle
(`active` or `sent-back`) AND `isReady()`.

**Projects** (7 values, single-dimension):
- `submitted`, `under-review`, `sent-back`, `approved`,
  `declined`, `completed`, `deleted`

**Workers** (3 values, shared between humans and AIs):
- `active`, `pending`, `archived`

**Flows** (4 values, three lifecycle + one
content-change marker):
- `active`, `archived`, `deleted`, `updated`

**Records** (3 values, single-dimension):
- `active`, `archived`, `deleted`

The flow lifecycle's `'updated'` event records every
content mutation (graph edits, name/description/lock
changes, auto-layout). Creation emits `'active'` —
the first event records the initial lifecycle state,
not a content edit. The retired `flows.created_at` /
`flows.updated_at` columns are now derived from the
head and tail of the entity's event sequence.

The terminal state for both human and AI workers is
`'archived'`. AI workers retire via `archiveAIWorker`; humans
via `archiveHumanWorker`.

**Work orders** (open-ended transitions + closed claim
alphabet):
- Transition state: any graph node id (a base62 token,
  recorded when the work order transitions to that node)
- Claim state: `'claimed'`, `'claim_released'`,
  `'claim_expired'`

A work order's "current node" is the latest state event
whose value is NOT in the claim vocabulary. Its "active
claim" is the latest claim-state event, subject to
`lockTimeout` arithmetic for implicit expiration — see
`getWorkOrderActiveClaim` in `adapters/state-events.ts`.

`buildStateEventOp(ctx, entityId, state)` in
`adapters/state-events.ts` is the canonical helper for
state-event op construction; every entity-lifecycle adapter
composes one of these into a `ctx.commit` batch alongside
its sibling entity-table op.

Domain classes wrap entity + state: `Idea(entity, state)`,
`Project(entity, state)`, `HumanWorker(entity, state)`,
`AIWorker(entity, state)` all expose `stateValue()`,
`stateLabel()`, and `stateClassName()` — the lifecycle
stage is part of the domain object, not a separate fetch
the presenter has to reconcile. `Idea` additionally
exposes `readinessValue()`, `readinessLabel()`,
`readinessClassName()`, and `isReady()` — readiness is
derived from required-field presence on every call.

### Flow Canvas

The Flow Designer (`flows/detail.html`) renders an SVG canvas
with pan, marquee, drag, and edge connection. Layers:
`flow-layout.ts` (Sugiyama layout), `flow-graph.ts` (SVG render),
`flow-interactions.ts` (pointer/keyboard state machines —
discriminated unions, pan toggles via Space: one tap on,
one tap off; toggle is ignored mid-gesture),
`mermaid-{generate,parse}.ts` (round-trip text format),
`zip.ts` (in-browser ZIP). Integration point:
`adapters/flow-export.ts`. The FSM (`flow-fsm-reduce.ts`)
propagates its new state to the presenter via the
`request-update` action payload, consumed by detail.ts through
`presenter.withInteractionState(state)` — the single sanctioned
seam, no shared mutable state. The properties
panel is positioned on the LEFT
(`pages-flow-detail.css` `.flow-props-panel` uses
`left: 0`); the visible canvas occupies pixels
`[PANEL_WIDTH_PX, canvasW]`. When the panel is open, both Auto
Layout (`applyAutoLayout`) and Auto Fit (`zoomToFit`) account
for the panel-occupied left portion via `PANEL_WIDTH_PX`. The
presenter's `withFitReconciled` runs Auto Fit only when
`isAutoFit` is true (no-op otherwise), so panel toggles and
selection updates re-fit the visible canvas symmetrically
without re-laying out nodes. Viewport scale/translate
operations (zoom, pan, Auto Fit, panel toggle, selection
centering) MUST NOT invoke Auto Layout. Explicit auto-layout
fires only via `withAutoLayoutToggled`, `withLayoutReconciled`,
and the `withNodesMoved` chain — never via `withFitReconciled`
or `withSelectionCentered`. The detail-page `request-update`
callback runs `withFitReconciled` after `withInteractionState`
so the auto-fit viewBox is the final state, not stomped by the
FSM's frozen viewBox; on selection change while the panel is
open, it then runs `withSelectionCentered` to pan the newly
selected node to the visible canvas center (zoom unchanged).
The two special nodes (`isCreate` / `isArchive`) persist
their `name` field directly as "Create" and "Archive" — no
constants, no render-time override. The flow renderer, the
stats renderer, the properties panel header, and the mermaid
generator all read `node.name` and emit it verbatim;
persistence and presentation share one vocabulary.
`isCreate` and `isArchive` are properties of the graph node,
not state values. A work order's state at any node is
recorded as that node's id (a base62 token), distinct in
shape from the closed claim alphabet
(`'claimed'`, `'claim_released'`, `'claim_expired'`) on
the same `entity_id`. The states log carries both families;
`adapters/state-events.ts` partitions them by string shape. The
mermaid parser does not translate either: a legacy `.mmd`
file that names its special nodes `[Start]` / `[End]`
imports with those literal names, surfacing the staleness
rather than masking it via a shim. Regular
nodes (not start/end) carry a `workerIds: WorkerId[]` field
(zero or more) persisted on the node and rendered in the
panel body as a `<fieldset>` with two `<div class=
"worker-group">` children — HUMANS and AIs — each holding a
labeled `<input type="checkbox">` per worker carrying
`data-worker-id="<id>"`. The fieldset respects `isLocked`
(every checkbox `disabled` when locked). On change, the
panel collects every checked value into a `WorkerId[]`
and dispatches the node-property-update action via the
pure helper `parseWorkerIdsFromPanel(panelEl)` in
`flows/detail.ts`.

Regular nodes also carry `attributes: NodeAttribute[]`
(`{ attribute_id, mode, isRequired }`). Hidden is encoded
by absence from the array. `mode` is `'editable'` or
`'readonly'`. The per-node panel renders one row per ref
with a mode picker + Required checkbox + remove button,
plus a picker `<select>` listing every record_attribute on
the bound Record not yet referenced. The flow header
carries a Record-binding `<select>` driven by
`getRecordForFlow` / `putFlowRecord` / `deleteFlowRecord`.

Hazards are two-tier and shared across the designer +
stats canvases via the pure predicate
`shouldShowWorkerHazard(node, allEdges)` in
`web-app/app/flow-graph.ts`. Precedence: `isCreate` /
`isArchive` → no hazard ever; zero workers → `'danger'`
(red `iconNoEntry`, class `.flow-node-danger` /
`.flow-stats-node-danger`); zero outgoing edges (strict
dead-end) → `'danger'`; exactly one worker → `'warning'`
(yellow `iconAlertTriangle`, class `.flow-node-warning` /
`.flow-stats-node-warning`); two-or-more workers AND at
least one outgoing edge → no hazard. Both badges sit in
the bottom-left of the node, mutually exclusive at the
slot. The aggregate model emitted by
`flow-stats-aggregate.ts` carries the resolved level on
each node as `workerHazard: 'warning' | 'danger' | null`;
the stats renderer reads it directly.

The flow-publish gate is the third call site of the same
predicate. `validateFlowForCreation(flow)` in
`web-app/app/adapters/flow-publish.ts` returns
`{ ready: boolean, problems: FlowProblem[] }` —
`zero_workers(nodeId)` and `dead_end(nodeId)` variants —
and `getFlowsForCreation(ctx)` partitions all flows into
`{ ready, notReady }` for the workbox "Create Work Order"
dropdown. The picker renders two sections: READY
(clickable, carries `data-flow-id`) and NOT READY
(disabled, octagon icon, "N nodes need attention"
subtitle, no `data-flow-id` so the click handler ignores
it). `postWorkOrderCreation` re-runs
`validateFlowForCreation` server-side and throws if the
picker was somehow bypassed — defense in depth at the
boundary.

The workbox shows every active and archived work order
to every user; there is no per-user visibility filter.
`buildInboxItems` in `presenters/workbox-inbox.ts` runs
the active/archive split, the claimed-and-unfinished
exclusion, and the sort — nothing more.

Claim-expiration implementation:
`getWorkOrderActiveClaim(ctx, workOrderId, lockTimeout)`
returns `null` for a `'claimed'` event older than
`lockTimeout` seconds even when no `'claim_expired'` /
`'claim_released'` event has yet superseded it.
`postWorkOrderClaim` materializes that implicit expiration
as an explicit `'claim_expired'` event when a new claim
notices a stale prior, so the durable record converges on
the reader's view.

The read-only stats variant (`flow-stats`) uses its own renderer
`flow-stats-graph.ts` and presenter `FlowStatsPresenter`,
deliberately *not* a parametrization of
`flow-graph.ts`/`FlowDesignerPresenter` (Commandment IX). It
shares only the pure pieces: geometry constants
(`NODE_WIDTH`/`NODE_HEIGHT` from `flow-layout.ts`,
`NODE_RADIUS` / `GRID_CELL` exported from `flow-graph.ts`),
the already-exported edge-path helpers (`perimeterPoint`,
`whichEdge`, `controlOffset`), `findCycleEdgeIds` from the
pure `flow-cycle-edges.ts` (the designer's back-edge DFS,
extracted so both renderers mark loop-backs identically),
`iconAlertTriangle` and `iconNoEntry` (the two hazard
icons), and the START/END display-name constants. Node
positions, though, do *not* come from the renderer:
`getFlowGraph` runs `flow-graph-layout.ts`'s
`withRenderableLayout`, which lays a flow out
(`computeLayout`) whenever it is `is_auto_layout` or its
stored positions are degenerate — so the stats renderer
and the designer both start from real coordinates, not
the persisted (0,0) placeholders. `runFlowLayout` /
`runLayoutFromInputs` is the one `computeLayout` wrapper,
shared by `getFlowGraph`, the designer's `applyAutoLayout`,
and `flow-export`'s mermaid-import path (Commandment IX).
Its emitted SVG carries *none* of the editor's
interactivity tells (no `<animate>`, `role="button"`,
`tabindex`, connection ports, `data-connect-port`,
`aria-current`) and *no paint either* — edge/node strokes,
the arrowhead, the loop-back dash all live in
`pages-flow-stats.css`; the renderer emits structure (`d`,
`transform`, `x/y`, `class`, `data-*`) only. The one
presentational inline attribute is the per-node
`style="--heat-t:${t}"`; CSS computes the fill via a 4-stop
chained `color-mix(in oklch, ...)` driven by `--heat-t`.
Loop-back edges carry `data-cycle="true"` → CSS dashes +
warning-colours them, mirroring the designer; the single
`#stats-arrow` marker's head tracks each line's own stroke
via `fill: context-stroke`, so default / on-path / cycle
arrows match for free. Path selection highlights via
`data-on-path` / `data-dim` (off-path fades *and*
desaturates, leaving the lit path the only colour on the
canvas), never an animated filter — the editor uses a glow;
the stats canvas does not. A path is lit by default (the
most-travelled one), so `.flow-stats-body:has([data-on-path])`
accent-flags the stepper bar — itself an eyebrow-labelled
widget ("Most-traveled paths") — tying control to canvas. The
aggregate logic lives in the pure module
`flow-stats-aggregate.ts` (`buildFlowStats(input) → model`);
it consumes the universal `TransitionEvent[]` shape exported
from `adapters/state-events.ts` — derived from the states
log, not from any retired event table. The I/O wrapper is
`adapters/flow-stats.ts`'s `getFlowStats(ctx, flowId)`.

### Records

A Record is a named data shape: name + description +
ordered attributes + per-attribute constraints. A flow
binds to one Record via `flow_records` (UNIQUE flow_id);
a Record can back many flows. Each per-node attribute
ref (`NodeAttribute`) points at one `record_attributes.id`
and carries a `mode` (`'editable'` or `'readonly'`) and an
`isRequired` flag. Hidden is structural: absence from the
node's `attributes` array.

Five attribute types: `text`, `number`, `select`, `date`,
`checkbox`. Three constraint kinds: `regex` (text only),
`range_min` and `range_max` (number or date only). The
applicability rule has two enforcement sites:
`assertConstraintAppliesTo` at the row writer and the
editor filtering the kind picker.

The property-test gate at work-order transitions:
`validateRecordTransition(ctx, workOrderId, targetNodeId,
pendingValues?)` walks work order → flow → Record →
attributes; gathers stored values from `state_field_values`;
overlays pending values from the form; runs requiredness
+ `validateAttributeValue`. Returns aggregated
`ConstraintViolation[]`. `postWorkOrderTransition` throws
`RecordTransitionViolations` on non-empty results; the
workbox page module catches the typed error and surfaces
the violations banner.

The pure constraint runner is `record-constraints.ts`
(`validateAttributeValue`, `formatViolation`) — three
callers earn the abstraction: the gate, the editor live
preview, and a future fuzz runner.

A work order's frozen `flow_graph` references
`record_attributes.id` directly. If a Record's attribute
is deleted while a flow that targets it is in flight, the
gate throws `node X references unknown attribute Y` rather
than silently coercing — versioned Record snapshots arrive
in a future iteration.

The user-facing vocabulary is strict: `Record` is the
definition, `Attribute` is one of its properties,
`Constraint` is a per-attribute predicate. The storage
term `entity` never appears in user-facing strings. UI
copy says "Work orders using this Record" rather than
"instances."

### API Layer (`/api`)

`api/types.ts` (row types + shared aliases — `WorkerId`,
`Worker` discriminated union, `HumanWorker` /
`AIWorker` classes, `GraphNode.workerIds: WorkerId[]`,
`GraphNode.attributes: NodeAttribute[]`, `RecordEntity` /
`RecordAttributeEntity` / `FlowRecordEntity`, `Constraint`
discriminated union, `StateEntity`, the five state
alphabets, and `SYSTEM_WORKER_ID`), `api/db.ts`
(`DbAdapter` interface + `TABLE_NAMES` array listing every
storage table — `workers`, `ai_workers`, `ideas`,
`projects`, `flows`, `flow_versions`, `records`,
`record_attributes`, `flow_records`, `states`,
`state_field_values`, etc.),
`api/store-state.ts` (the `StateStore` class — `record`,
`currentFor`, `allFor`, `deletedIds`, `isDeleted`),
`api/store-entity.ts` (`EntityStore` — consults `StateStore`
for delete filtering), `api/db-localstorage.ts` (production
impl), `api/db-memory.ts` (test impl), `api/api.ts` (pure
HTTP routing — `GET/PUT/DELETE/POST` helpers, **no
module-level adapter; threaded explicitly** — plus the
state routes for the unified states log),
`api/mock-data.ts` (seeds the `'system'` worker, 6 humans
in `workers`, and 4 AIs in `ai_workers`), `api/validators.ts`
(`validateHumanWorkerEntity` / `validateAIWorkerEntity` /
`validateStateEntity`, where the AI validator rejects empty
`auth_token` per the no-defaults doctrine). The `DbAdapter`
interface is the migration seam to Postgres.

`web-app/app/adapters/init.ts` wires the production LocalStorage
adapter singleton (`initAdapter()` / `getDbAdapter()`).
`web-app/app/adapters/shared.ts` defines the `RequestContext`
interface and `createRequestContext(adapter?)`, defaulting to
that singleton; tests pass it a `MemoryDbAdapter`.

### Page Module Pattern

Every entry in `PAGE_REGISTRY` declares both `sourceDir` and
`sourceFile` explicitly (e.g., `flow-detail` →
`web-app/flows/detail.ts` + `web-app/flows/detail.html`).
The most common values are `index`, `detail`, `create`, and
`convert`. Each page module exports:
- `init(): Promise<void>` — fetches data, populates DOM
  placeholders, binds event listeners

Sidebar-layout pages have `index.html` containing page content
that gets composed with the layout template. Standalone pages
have a complete hand-written `index.html` with a
`<div id="page-root">` that `init()` renders into.

Notable registry entries:
- `flow-stats` → `web-app/flows/stats.ts` + `stats.html`
  (read-only flow heat map; sidebar layout;
  `searchable: false`).
- `workers` → `web-app/workers/index.ts` + `index.html`
  (single list grouped Humans / AIs; filter chips, search,
  `+ Add Worker` dialog with a Human/AI kind picker).
- `worker-detail` → `web-app/workers/detail.ts` +
  `detail.html` (dispatches by `worker.kind` to the human
  or AI detail presenter; `searchable: false`).

### Presenter Pattern

Presenters in `web-app/app/presenters/` are immutable view
objects: constructor takes the full data shape, methods return
`SafeHtml`. Page modules instantiate them and inject the result
into the DOM — presenters never touch the DOM, never fetch,
never mutate.

Editable detail views split into two presenters: a read presenter
(takes the entity) and an `*Edit` presenter (takes entity + draft
shape). The page module owns a `PageState` discriminated union
(`{kind: 'reading'} | {kind: 'editing', draft}`) and constructs
the appropriate one per render. This pattern applies to `Idea`,
`HumanWorker`, `AIWorker`, and `ProjectDetail`. The
`worker-detail` page module reads `worker.kind` and dispatches
to the right pair: `HumanWorkerDetailPresenter` /
`HumanWorkerDetailEditPresenter` for humans,
`AIWorkerDetailPresenter` / `AIWorkerDetailEditPresenter` for
AIs (the AI edit presenter renders the auth-token input as
`type="password"` and emits the security warning copy from
`buildSecurityWarning()`).

`presenters/index.ts` is the barrel; page modules import from
`'../app/presenters'`. `WorkboxDetailPresenter` uses a public
`buildPage()` orchestrating private `#build*` helpers; the rest
expose `build*` directly.

`FlowStatsPresenter` (`web-app/app/presenters/flow-stats.ts`) is
the read-only counterpart to `FlowDesignerPresenter`. It exposes
pure `build*` helpers (`buildShell`, `buildStepperBar`,
`buildLegend`, `buildCard`) returning `SafeHtml` for testability,
plus DOM-touching `renderShell` / `renderUpdate` / `renderCard`.
It is flow-name-agnostic by design — the page module writes the
flow name and description into the header after `renderShell`,
keeping `buildFlowStats` independent of presentation strings.

### Import Conventions

Page modules import directly from source modules, not through a barrel:

```typescript
import { $ } from '../app/dom';
import { html, setHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import { buildSkeleton, buildErrorState } from '../app/loading-states';
import { iconPlus, iconTrash } from '../app/icons';
import { navigateTo, openDialog, closeDialog } from '../app/core';
```

`core.ts` re-exports from `format.ts`, `navigation.ts`, and
`dialog.ts` so page modules can import `navigateTo`,
`initials`, `formatDateTime`, `formatCompactCurrency`,
`SECONDS_PER_DAY`, `openDialog`, `closeDialog`, `initTabs`
from `'../app/core'`. The `adapters/` directory retains
its barrel re-export (`adapters/index.ts`).

**Page modules never import from `api/api.ts`** — all data
access (reads and writes) goes through the adapter layer
(`adapters/`). Only adapter modules import from the API
layer directly.

### Naming Conventions

- `mutate*` — finds existing DOM and updates it (side-effecting,
  distinct from `build*` which constructs and returns)
- `toneFor*` / `levelFor*` — return string enums consumed as
  `data-tone` / `data-level` attribute values (replaces older
  `styleFor*` inline-style pattern)
- `assert*` — Telling-shape validators in `api/types.ts` and
  `api/validators.ts` that take a raw value and return a typed
  value or throw. The `is*` type-guards remain for legitimate
  type-narrowing call sites.
- Adapter functions use **domain nouns** (`getIdea`, not
  `getIdeaEntity`) — return type already communicates shape.

### Adapter Conventions

- **Worker domain split.** `adapters/workers.ts` is humans-
  only (`getHumanWorker` etc., backed by `workers`).
  `adapters/ai-workers.ts` is AIs-only (backed by
  `ai_workers`, owns `maskAuthToken`).
  `adapters/workers-union.ts` is the union seam (`getWorkers`,
  `workerName`, `isHumanWorker` / `isAIWorker`). Import the
  union for kind-agnostic display; per-kind modules for
  status mutations and AI auth-token storage.
- **`workerName(workerMap, workerId)`.** Throws on missing
  and unknown ids. Optional worker references branch at the
  call site (`row.worker_id ? workerName(...) : ''`); do not
  overload with a fallback. UI renders `'—'` via
  `DISPLAY_ABSENT`. Do not use magic strings like `'Unknown'`.
- **`RequestContext` is the only I/O surface.** Every data-
  access adapter takes `ctx: RequestContext` first and uses
  `ctx.GET/PUT/DELETE/POST/commit`. The standalone
  `GET/PUT/...` exports in `api/api.ts` are the transport
  `ctx` delegates to — adapters never import them directly.
  Multi-table reads share one ctx so every adapter call in a
  request sees the same snapshot.
- **Platform-shim vs data-access adapters share `adapters/`.**
  Data-access adapters (`ideas.ts`, `flow-queries.ts`, etc.)
  fetch entity data through `ctx`. Platform shims
  (`clipboard.ts`, `viewport.ts`, `location.ts`,
  `crypto-safe-base62.ts`, etc.) wrap browser primitives so the
  app speaks one voice.
- **`getFlowStats(ctx, flowId)`.** Resolves the work-order
  set via the `flow-work-orders` join table (relational
  truth per Codd), not via each work order's frozen
  `flow_graph.flowId`. Returns `{ model, graph }` so the
  page derives the canvas viewBox from real laid-out
  coordinates — `getFlowGraph` runs `computeLayout` for
  `is_auto_layout` or degenerate flows.
- **Mutation adapters return `Promise<void>`.**
  Change-awareness flows through notification channels (e.g.,
  `ideaChanges.notify()`), never through return values —
  callers tell the channel rather than branch on a result.
- **Records adapters.** `adapters/records.ts` owns Record
  lifecycle (CRUD + `archiveRecord`).
  `adapters/record-attributes.ts` exposes
  `getRecordAttributesByRecord`, sort-ordered.
  `adapters/flow-records.ts` is the binding seam
  (`getRecordForFlow`, `getFlowsForRecord`,
  `getWorkOrdersForRecord`).
  `adapters/record-transitions.ts` orchestrates the
  property-test gate via `validateAttributeValue`;
  `postWorkOrderTransition` runs it and throws
  `RecordTransitionViolations` on non-empty result.

### Dark Mode

CSS custom properties on `:root` (light) and
`[data-theme="dark"]` (dark). Toggle persists to
`localStorage` and carries across page navigation. Supports
system preference detection via `prefers-color-scheme`.

## UI & Styling

### CSS-first styling

All styling lives in `web-app/app/styles/`. Do not use inline
`style="..."` strings except:

1. **Dynamic per-element values.** Progress widths, fill
   percentages, heat intensities — passed via CSS custom
   properties: `style="--progress-fill:${value}%"` consumed
   by a CSS rule reading `var(--progress-fill, 0%)`; the
   flow-stats heat ramp uses the same pattern with per-node
   `style="--heat-t:${0..1}"` — see DESIGN-SYSTEM.md §
   Heat ramp. The value is **data**; the colors stay in
   the design system.
2. **Bootstrap fallbacks.** `database-init.ts` uses these
   for error UI before CSS may have loaded; marked with a
   file-header comment.

The variant pattern is `data-tone` / `data-level` attributes on
a base class. The TS enum and the CSS attribute selector share
one source of truth.

When extending CSS: `components-X.css` for patterns used by
3+ pages (one file per family — buttons, cards, dialog, etc.),
`pages-X.css` for page-scoped patterns (each page declares its
bundles in `cssBundles` per `page-registry.ts`), `utilities.css`
for single-property primitives. Do not use raw hex colors;
use `hsl(var(--token))`. See DESIGN-SYSTEM.md § 12 CSS
Architecture for the full cascade order, per-page bundle
mechanism, and decision tree.

### Component Library

All UI components are vanilla HTML/CSS with ARIA attributes,
defined as CSS classes in `web-app/app/styles/` and helper
functions across `web-app/app/` modules. No external
component library.

**Dialog pattern.** Use `openDialog(id)` / `closeDialog(id)`
from `core.ts`. Requires matching HTML elements:
`id="{id}-backdrop"` (with `class="dialog-backdrop hidden"`)
and `id="{id}-dialog"` (with `class="dialog hidden"
aria-hidden="true"`). Helpers manage visibility, ARIA
attributes, and focus.

**Tab pattern.** Use `initTabs('[data-tab]', '.tab-panel')`
from `core.ts`. Tab buttons use `data-tab="{name}"`
attribute, panels use `id="tab-{name}"`.

### Design System

See `DESIGN-SYSTEM.md`. Key invariant: do not use raw hex
colors in CSS; use `hsl(var(--token))`. Icons are ~100 inline SVG
functions in `web-app/app/icons.ts`.

**Heat ramp.** See DESIGN-SYSTEM.md § Heat ramp.

### Mobile Responsiveness

CSS media queries in `web-app/app/styles/responsive.css`
show/hide desktop vs mobile header and sidebar. Mobile
sidebar uses Sheet (slide-in drawer) toggled by JS.
Breakpoints: sm 640px, md 768px, lg 1024px, xl 1280px.

## Project Structure

`api/` — REST routing, DB adapter interface, mock data,
validators. `web-app/app/` — all source (TypeScript + CSS), with
subdirectories `adapters/` (data-access + platform shims, both
kinds share the folder), `presenters/` (presenter classes
producing `SafeHtml`), and `styles/` (cascade-ordered CSS
modules).
`web-app/{dashboard,workbox,ideas,projects,flows,workers,...}/`
— page directories registered in `PAGE_REGISTRY` (sidebar-layout
+ standalone). `billing/` is a stub.

The composition root is `web-app/app/adapters/init.ts`. Run `ls`
or read file headers — both are more current than this document
will ever be.

## Build

`./build` requires a clean working directory. Output is a ZIP at
`~/Desktop/`. Use `./build --help` for options. The build script
itself is the source of truth for what gets composed, bundled,
and copied — read it, don't read this section.

## Testing

Two layers, both zero-dependency.

### Automated tests

Node's built-in `node:test` runner with `--strip-types`,
no devDependencies. Tests cover
pure modules, flow-edit business logic and the connection-
validation rules (`tests/flow-operations.test.ts`), the flow
version/query adapters, every data adapter (including
`adapters-workers-union.test.ts` for the worker union seam
and `adapters-flow-publish.test.ts` for
`validateFlowForCreation` / `getFlowsForCreation`), the
workbox inbox aggregation, the mermaid round-trip,
in-browser ZIP, snapshot import-validation/quota/wipe-on-fail,
api routing, navigation, mock-data validity, the two-tier
hazard predicate (`tests/flow-graph-hazard.test.ts` covers
`shouldShowWorkerHazard`), and the SafeHtml output of the
presenters (`presenter-worker-detail.test.ts` checks the AI
variant masks its auth token); the automated suite also
covers `flow-stats-aggregate` (pure heat / sojourn / path /
clan math), `adapters-flow-stats` (the read-only adapter
via `MemoryDbAdapter`), `presenter-flow-stats` (the SafeHtml
shape — including the *absence* of editor affordances), and
`duration-units` (the compact ascending-unit duration
formatter) — see `tests/` for the current set.
`api/db-memory.ts` provides an in-memory `DbAdapter` so
adapter and api-layer tests run without `localStorage`.

Run via `./validate` (which also type-checks and lints) or
directly: `node --test --strip-types tests/*.test.ts`.

### Manual browser regression

UI behavior runs against `TEST-PLAN.md`, driven either by a
single human tester
serially or by Claude Code agents in parallel via the
`claude-in-chrome` MCP. Anything DOM-driven (gestures, layout,
visual rendering) lives here; where a manual case is the
browser counterpart of an automated area it carries an inline
pointer at the test file. Pure transitions, flow-edit logic,
adapters, presenter output, and API routing live in the
automated suite. The six-phase agent protocol, the per-entity
mutation-domain table, the `StorageEvent` tolerance patterns,
and the known MCP limitations (flow-designer gesture
pointer-capture, `resize_window`, file I/O, kill EPERM) live
in TEST-PLAN.md § Protocol — CLAUDE.md does not duplicate them.

### Orchestration

When an agent runs the full test plan (CLI + browser),
`./validate` is the gate: a failing type-check, test, or
line-length lint ABORTS the run automatically. Do not ask
whether to continue — the bundle is built from the same
source, so a failing CLI suite makes the browser run
meaningless. Report the failure, stop, await fix.

## Gotchas

- **`noUncheckedIndexedAccess`.** tsconfig enables this —
  array/object index access returns `T | undefined`,
  requiring explicit `!` assertions or guards.
- **ES2024 target.** No transpilation. Native
  `Object.groupBy()`, `Map.groupBy()` are available. Assumes
  modern browser.
- **`withLoadingState()` returns null.** Returns `null` on
  error AND when data is empty with an `emptyState` config —
  callers must check for null before using the result.
- **Cross-tab theme sync.** `state.ts` listens to
  `StorageEvent` and syncs theme changes across browser tabs
  automatically.
- **Non-critical writes logged at warn.** localStorage writes
  for theme and sidebar state are wrapped in try/catch that
  log at `warn` level — quota errors don't break the app but
  are observable via the logger.
- **Snapshots wipe-first.** All snapshot operations
  (pristine, mock data, import) call
  `DELETE('snapshots/schema')` before writing — there is no
  merge, only replace.
- **Snapshot quota pre-flight.** `putSnapshotFromFile`
  consults `navigator.storage.estimate()` and rejects with
  `SnapshotTooLargeError` if `file.size` exceeds half of
  `quota - usage` (the import doubles peak memory while
  parsing). Falls back to a 5 MB hard cap when
  `navigator.storage.estimate()` is unavailable.
- **Snapshot wipe-on-fail.** With pre-flight quota checks +
  per-row validation + column-level compression, mid-write
  failure is rare; when it does happen, `importSnapshot`
  wipes every `fusion-ai:<table>` key so the next bootstrap
  detects no schema and routes the user to the snapshots
  page to re-import. No backup, no sentinel, no rollback —
  real atomicity arrives with Postgres.
- **`file:///` protocol.** Navigation detects file protocol
  and skips link prefetching. Page URLs use relative paths.
  Code supports `file:///` locally but testing is HTTP-only.
- **View Transition aborts.** rapid programmatic navigation
  surfaces both `AbortError: Transition was skipped` and
  `InvalidStateError: Transition was aborted...` lines in
  console — Chromium throws both classes for the same root
  cause. Browser-internal (no app code calls
  `startViewTransition`); no app impact.
- **The states log is append-only by convention.**
  `StateStore.record` only appends; the table never deletes.
  An entity's lifecycle reads as the latest event on its
  `entity_id`. Reversal is a *new* event with the new state,
  not an edit of the prior row. The doctrinal split between
  entity-lifecycle event (state log) and relationship-row
  splice (`EntityStore.delete` on relationship rows like
  `state_field_values`) is the seam — read
  `api/store-entity.ts` and `api/store-state.ts` together to
  see both halves.
- **`state_field_values.field_id` references
  `record_attributes.id`.** the column name predates Records
  and stays until a second non-Record consumer arrives. The
  semantic note lives in `SCHEMA.md § state_field_values`.

## Commits

Commit completed, tested work. Do not ask. The Office of
the Commit governs — ABC.

## Worktrees

Do not use git worktrees. Work directly in the main checkout.
Worktrees fragment review surface, hide state from the
working tree, and add ceremony without buying isolation that
small focused commits don't already provide.

## Subagents

Subagents inherit no scripture and read no CLAUDE.md by
default. Every subagent prompt MUST begin with the literal
phrase `Go to Church!` — this invokes the `church-of-code`
skill in the subagent's session, loading the full scripture
before the work begins. A subagent unproselytized is a
heathen given a hammer.

The scripture is universal; the codebase is local. After
the proselytization, the dispatching agent MUST also push
down the codebase-specific patterns the scripture itself
cannot know:

- **Voice rules.** 78-char max line, 4-space indent, no
  inline styles (use CSS custom properties + classes per
  the styling section above), present-tense imperative
  commit messages, Co-Authored-By trailer.
- **Commandments touched by the task.** Name them.
- **Abominations the task specifically risks.** Name them.
- **Existing codebase patterns to match.** RequestContext
  as the only argument to adapter methods, SafeHtml from
  presenters, snake_case storage / camelCase domain,
  HTTP-verb adapter naming (`getNoun`/`putNoun`/`deleteNoun`/
  `postNounOperation`), validators at the gate not
  downstream, no untyped `any` from external boundaries.

Proselytize first, then brief — the scripture loads via the
skill, the patterns load via the prompt.

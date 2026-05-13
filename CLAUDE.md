# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Alignment

**Match the codebase's voice, or change the codebase.** A better
pattern earns its place by replacing every site of the old one —
never by living beside it. One codebase, one voice. The snowflake
is a sin against Uniformity (Commandment III).

## Build & Dev Commands

```bash
./test                 # Run automated tests
./validate             # Type-check + tests + lint (works on dirty tree)
./build                # Compile, bundle, minify, ZIP to ~/Desktop/
./build --no-zip dir/  # Bundle to dir/ without zipping (for testing)
./build dir/           # ZIP to dir/ instead of ~/Desktop/
./build --help         # Show usage
./serve <port>         # Build + start local HTTP server on <port>
```

**Always commit before building.** `./build` requires a clean working directory. Use `./validate` to catch type errors and lint issues before committing, then commit, then build.

**Build and test locally:**

```bash
./serve 8080
# open http://localhost:8080/landing/index.html
```

**When running under the Claude Code sandbox**, the defaults above fail two ways: `/tmp/` is not writable, and the tsx IPC pipe used by the `npx tsx` step inside `./build` lands in `$TMPDIR/tsx-501/…` which is outside the sandbox's allowed Unix-socket path (`/tmp/claude/tsx-501`). Use this invocation instead:

```bash
TMPDIR=/tmp/claude ./serve 8080
# open http://localhost:8080/landing/index.html
```

`TMPDIR=/tmp/claude` redirects both tsx's IPC socket and `./serve`'s temp build dir into the sandbox-allowed path. `localhost` is reachable from the sandbox, so the Chrome MCP tools can drive the page normally.

`./validate` runs `tsc --noEmit` (type checking), then `./test` (automated tests against pure modules and the `api/`, `adapters/`, and `presenters/` layers, via `node --test --strip-types tests/*.test.ts`), then enforces 78-character maximum line length on all `.ts`, `.html`, and `.css` files (excluding `compose.ts`).

Automated tests cover pure modules, flow-edit logic, all data adapters, the workbox inbox aggregation, navigation, mock-data validity, and presenter HTML output; UI behavior — gestures, layout, visual rendering, end-to-end DOM flows — is still covered by the manual browser regression protocol — see `## Testing` below.

## TypeScript

Target: **ES2024** · Strict mode with `noUncheckedIndexedAccess`. Config at `web-app/app/tsconfig.json`. The `compose.ts` build script is excluded from type checking (it runs in Node).

## Architecture

**Vanilla TypeScript** with zero runtime dependencies. Enterprise innovation management platform with modules for ideas, projects, people, flows, workbox, and analytics. Every page is a standalone HTML file served via HTTP. The code also supports `file:///` protocol locally, but testing is HTTP-only.

### Key Layers

- **HTML Composition**: `web-app/app/compose.ts` assembles
  `components-layout.html` + `component-*.html` + each page's
  `index.html` into composed standalones in a temp build dir.
  Standalone pages are copied directly.
- **Navigation**: `<a href>` between pages. `navigateTo(page,
  params?)` builds relative URLs.
- **Page Detection**: `<html data-page="dashboard">` →
  `PAGE_REGISTRY` lookup → page module's `init()`.
- **Source = Output Alignment**: `PAGE_REGISTRY` declares
  `sourceDir` and `sourceFile`. Both `compose.ts` and
  `navigateTo()` resolve output as
  `{sourceDir}/{sourceFile}.html` — the file you edit is the
  file the browser loads.
- **Auth**: Mock, returns `demo@example.com`.
- **Data**: REST-style API (`api/`) over localStorage. Adapters
  in `web-app/app/adapters/` shape rows for pages.
- **Presentation**: Presenters in `web-app/app/presenters/` emit
  `SafeHtml`.
- **Database**: localStorage with JSON serialization. Each table
  is a `fusion-ai:tableName` key. Deletion uses a single
  `fusion-ai:deleted` tombstone table; entity rows never carry
  `deleted_at`. History stores hard-delete via splice. When no
  schema exists, non-entry pages redirect to snapshots.
- **State**: Module-level vars + pub-sub for theme, mobile, auth,
  sidebar.
- **Durations**: Persisted in seconds; UI displays days via
  `durationInDays(seconds)`.
- **Read-only siblings of editable pages**: `flow-stats.html` is a
  flat, non-editable rendering of one flow's diagram (heat-tinted by
  share of trailing-90-day flow time, with a hover/click stat card
  and a path stepper). It is a sibling, not an extension, of
  `flow-detail` — see `### Flow Canvas` for the renderer split.

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
panel is positioned on the LEFT (`pages.css` `.flow-props-panel`
uses `left: 0`); the visible canvas occupies pixels
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
The two special nodes (`isStart` / `isComplete`) display as
"Create" and "Archive" — names live in `START_NODE_DEFAULT_NAME`
and `END_NODE_DEFAULT_NAME` constants in `api/types.ts` and
override `node.name` at SVG-render and panel-render time, so
existing flows whose persisted name is "Start"/"End" still
display the new labels without a data migration. Regular
nodes (not start/end) carry a `crew: NodeAssignment` field
— a 4-variant discriminated union (`unassigned`/`role`/
`crew`/`model`) persisted on the node and rendered in the
panel body as a labeled `<select>` with `<optgroup>`
sections (Roles → People (private) → Crews → Models),
matching the Name/Description label pattern. The
assignment respects `isLocked` (disabled when locked).
Regular nodes whose assignment is `unassigned` render a
hazard triangle (`iconAlertTriangle` colored via
`.flow-node-hazard`) in the bottom-left corner; the same
hazard fires for role-assigned and crew-assigned nodes
when the role or crew has zero members (user-private
roles always count as 1). Model assignments are never
hazardous. The `<select>` value crosses the DOM seam as
`'role:<id>'` / `'crew:<id>'` / `'model:<id>'` /
`'unassigned'` and is parsed by
`parseNodeAssignmentSelectValue` in `flows/detail.ts`.

Models live in their own `models` table — a `ModelEntity`
with name/provider/description, persisted just like roles
and crews. The string-enum predecessor (`CREW_MODELS`)
was deleted; `validateModelEntity` rejects the old shape
clean. Models bind to roles via `role_model_memberships`.

The workbox filters work orders by their current node's
assignment via `isWorkOrderVisibleToPerson` in
`presenters/workbox-inbox.ts`. Unassigned is visible to
all (the hazard triangle brands it as misconfiguration);
model is visible to no human (a model participates, not
a person); role and crew resolve through member sets,
with user-private roles short-circuiting to the encoded
person id. `loadInboxItems` builds the visibility scope
once per request.

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
`iconAlertTriangle`, and the START/END display-name
constants. Node positions, though, do *not* come from
the renderer: `getFlowGraph` runs `flow-graph-layout.ts`'s
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
the arrowhead, the loop-back dash all live in `pages.css`
(`§48 FLOW STATS`); the renderer emits structure (`d`,
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
the I/O wrapper is `adapters/flow-stats.ts`'s
`getFlowStats(ctx, flowId)`.

### API Layer (`/api`)

`api/types.ts` (row types + shared aliases), `api/db.ts`
(`DbAdapter` interface), `api/db-localstorage.ts` (production
impl), `api/db-memory.ts` (test impl), `api/api.ts` (pure HTTP
routing — `GET/PUT/DELETE/POST` helpers, **no module-level
adapter; threaded explicitly**), `api/mock-data.ts`,
`api/validators.ts`. The `DbAdapter` interface is the migration
seam to Postgres.

`web-app/app/adapters/init.ts` wires the production LocalStorage
adapter singleton (`initAdapter()` / `getDbAdapter()`).
`web-app/app/adapters/shared.ts` defines the `RequestContext`
interface and `createRequestContext(adapter?)`, defaulting to
that singleton; tests pass it a `MemoryDbAdapter`.

### Page Module Pattern

Every entry in `PAGE_REGISTRY` declares both `sourceDir` and `sourceFile` explicitly (e.g., `flow-detail` → `web-app/flows/detail.ts` + `web-app/flows/detail.html`). The most common values are `index`, `detail`, `create`, and `convert`. Each page module exports:
- `init(): Promise<void>` — fetches data, populates DOM placeholders, binds event listeners

Sidebar-layout pages have `index.html` containing page content
that gets composed with the layout template. Standalone pages
have a complete hand-written `index.html` with a
`<div id="page-root">` that `init()` renders into.

Notable registry entries:
- `flow-stats` → `web-app/flows/stats.ts` + `stats.html`
  (read-only flow heat map; sidebar layout;
  `searchable: false`).

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
`Person`, and `ProjectDetail`. The word "Member" is reserved for a
future `(user, role)` join — do not name a member-rendering
construct until that scroll opens.

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

`core.ts` re-exports from `format.ts`, `navigation.ts`, and `dialog.ts` so page modules can import `navigateTo`, `initials`, `durationInDays`, `formatDateTime`, `formatCompactCurrency`, `SECONDS_PER_DAY`, `openDialog`, `closeDialog`, `initTabs` from `'../app/core'`. The `adapters/` directory retains its barrel re-export (`adapters/index.ts`).

**Page modules never import from `api/api.ts`** — all data access (reads and writes) goes through the adapter layer (`adapters/`). Only adapter modules import from the API layer directly.

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

- **`personName(personMap, personId: Id)`** throws on both missing
  and unknown personId. Optional person references must branch at
  the call site (`leadRow ? personName(...) : ''`) — never overload
  `personName` with a fallback. UI renders `'—'` via
  `DISPLAY_ABSENT` for legitimately absent values. Never use
  magic strings like `'Unknown'`.
- **`RequestContext` is the only I/O surface.** Every data-access
  adapter takes `ctx: RequestContext` first and uses
  `ctx.GET/PUT/DELETE/POST/commit`. The standalone `GET/PUT/...`
  exports in `api/api.ts` are the transport `ctx` delegates to —
  adapters never import them directly. A ctx executes against an
  immutable snapshot: `ctx.getPersonMap()`, `ctx.getIdeaRows()`,
  etc. are memoized for its lifetime so multiple adapter calls
  see the same view.
- **Platform-shim vs data-access adapters share `adapters/`.**
  Data-access adapters (`ideas.ts`, `flow-queries.ts`, etc.)
  fetch entity data through `ctx`. Platform shims
  (`clipboard.ts`, `viewport.ts`, `location.ts`,
  `crypto-safe-base62.ts`, etc.) wrap browser primitives so the
  app speaks one voice. Tiny shims are not a smell — they are
  the divorce point.
- **`getFlowStats(ctx, flowId)`** — the stats adapter — resolves
  the work-order set for a flow through the `flow-work-orders`
  join table (relational truth per Codd), **not** through each
  work order's frozen `flow_graph.flowId`. It returns
  `{ model, graph }` so the page can derive the canvas viewBox
  from the flow graph's node positions — which `getFlowGraph`
  has already resolved to a real layout (`computeLayout` runs
  for `is_auto_layout` or degenerately-positioned flows), so
  the stats canvas never collapses onto one scaled-up node.
- **Mutation adapters return `Promise<void>`.**
  Change-awareness flows through notification channels (e.g.,
  `ideaChanges.notify()`), never through return values —
  callers tell the channel rather than branch on a result.
  The type's silence is intentional.

### Dark Mode

CSS custom properties on `:root` (light) and `[data-theme="dark"]` (dark). Toggle persists to `localStorage` and carries across page navigation. Supports system preference detection via `prefers-color-scheme`.

## UI & Styling

### CSS-first styling

All styling lives in `web-app/app/styles/`. Inline `style="..."`
strings are forbidden except:

1. **Dynamic per-element values** (progress widths, fill
   percentages, heat intensities) — passed via CSS custom
   properties: `style="--progress-fill:${value}%"` consumed
   by a CSS rule reading `var(--progress-fill, 0%)`, and the
   flow-stats heat ramp: per-node `style="--heat-t:${0..1}"`
   on the SVG canvas, with CSS computing the fill via a
   chained `color-mix(in oklch, ...)` over four
   `--heat-stop-*` design tokens (blue → green → yellow →
   red at non-uniform stops 0 / 50 / 75 / 100). The value is
   **data**; the colors stay in the design system.
2. **Bootstrap fallbacks** in `database-init.ts` — error UI
   before CSS may have loaded, marked with a file-header
   comment.

The variant pattern is `data-tone` / `data-level` attributes on
a base class. The TS enum and the CSS attribute selector share
one source of truth.

When extending CSS: components.css for patterns appearing in 3+
files; pages.css for page-scoped patterns; utilities.css for
single-property primitives. Never use raw hex colors — always
`hsl(var(--token))`.

### Component Library

All UI components are vanilla HTML/CSS with ARIA attributes, defined as CSS classes in `web-app/app/styles/` and helper functions across `web-app/app/` modules. No external component library.

**Dialog pattern**: Use `openDialog(id)` / `closeDialog(id)` from `core.ts`. Requires matching HTML elements: `id="{id}-backdrop"` (with `class="dialog-backdrop hidden"`) and `id="{id}-dialog"` (with `class="dialog hidden" aria-hidden="true"`). Helpers manage visibility, ARIA attributes, and focus.

**Tab pattern**: Use `initTabs('[data-tab]', '.tab-panel')` from `core.ts`. Tab buttons use `data-tab="{name}"` attribute, panels use `id="tab-{name}"`.

### Design System

See `DESIGN-SYSTEM.md`. Key invariant: never use raw hex colors
in CSS — always `hsl(var(--token))`. Icons are ~100 inline SVG
functions in `web-app/app/icons.ts`.

**Heat ramp** — see `DESIGN-SYSTEM.md`. Four `--heat-stop-*`
tokens (low / mid / high / peak) define the flow-stats
fixed-scale heat ramp; the per-node `--heat-t` (0..1) drives a
4-stop chained `color-mix(in oklch, ...)` in `pages.css`.

### Mobile Responsiveness

CSS media queries in `web-app/app/styles/responsive.css` show/hide desktop vs mobile header and sidebar. Mobile sidebar uses Sheet (slide-in drawer) toggled by JS. Breakpoints: sm 640px, md 768px, lg 1024px, xl 1280px.

## Project Structure

`api/` — REST routing, DB adapter interface, mock data,
validators. `web-app/app/` — all source (TypeScript + CSS), with
subdirectories `adapters/` (data-access + platform shims, both
kinds share the folder), `presenters/` (presenter classes
producing `SafeHtml`), and `styles/` (cascade-ordered CSS
modules). `web-app/{dashboard,workbox,ideas,projects,flows,...}/`
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

Two layers, both zero-dependency:

**Automated tests** (Node's built-in `node:test` runner with
`--strip-types`, no devDependencies; ~738 tests). Tests cover
pure modules, flow-edit business logic and the connection-
validation rules (`tests/flow-operations.test.ts`), the flow
version/query adapters, every data adapter, the workbox inbox
aggregation plus the visibility filter, the mermaid round-trip,
in-browser ZIP, snapshot import-validation/quota/wipe-on-fail,
api routing, navigation, mock-data validity, and the SafeHtml
output of the presenters; the automated suite now also covers
`flow-stats-aggregate` (pure heat / sojourn / path / clan
math), `adapters-flow-stats` (the read-only adapter via
`MemoryDbAdapter`), `presenter-flow-stats` (the SafeHtml
shape — including the *absence* of editor affordances), and
`duration-units` (the compact ascending-unit duration
formatter) — see `tests/` for the current set.
`api/db-memory.ts` provides an in-memory `DbAdapter` so adapter
and api-layer tests run without `localStorage`.

Run via `./validate` (which also type-checks and lints) or
directly: `node --test --strip-types tests/*.test.ts`.

**Manual browser regression** for UI behavior: a pass against
`TEST-PLAN.md` (~265 cases), driven either by a single human
tester serially or by Claude Code agents in parallel via the
`claude-in-chrome` MCP. Anything DOM-driven (gestures, layout,
visual rendering) lives here; where a manual case is the browser
counterpart of an automated area it carries an inline pointer at
the test file. Pure transitions, flow-edit logic, adapters,
presenter output, and API routing live in the automated suite.

### Six-phase parallel protocol

Agents execute the plan in six phases to fit within context and
time budgets while keeping per-entity mutation domains disjoint:

1. **Phase 0 — Preflight** (main): `./validate`, `./build` to
   produce the distribution ZIP, `./build --no-zip` for the test
   server, start HTTP server, open tab 0. Covers A1–A5.
2. **Phase 1 — Data setup** (one agent, serial): AA1–AA43 in
   tab 0. Creates pristine environment, people, ideas, projects,
   one flow. Populates the shared database that Phase 2
   verifies.
3. **Phase 2 — Parallel verification** (7 agents concurrent,
   each in its own tab, no shared tabs):
   - Agent-B — Entry pages (B1–B16)
   - Agent-CH — Dashboard + Reference (C1–C7, H1–H2), read-only
   - Agent-D — Ideas (D1–D37)
   - Agent-E — Projects (E1–E11)
   - Agent-F — Flows (F1–F74)
   - Agent-F2 — Workbox (WB1–WB19)
   - Agent-G — Admin (G9–G14, G19–G24, G36–G40; skip G30–G35; G1–G8/G15–G18/G25–G29 retired)
4. **Phase 3 — Cross-cutting** (one agent, alone): I1–I28.
   Mutates global UI state (theme, sidebar, command palette) —
   no concurrent agents.
5. **Phase 4 — Snapshot lifecycle** (one agent, alone):
   G30–G35. Wipes and reloads the database — strictly last
   before teardown.
6. **Phase 5 — Teardown** (main): stop HTTP server, remove
   build directory, verify distribution ZIP remains, aggregate
   results.

### Entity mutation domain scoping

Phase 2 agents share one localStorage but each owns a disjoint
subset of tables:

| Agent | Mutation domain |
|---|---|
| Agent-B | creates one user via signup |
| Agent-D | `ideas` |
| Agent-E | `projects` (plus one flow via E7) |
| Agent-F | `flows`, `flow_versions` |
| Agent-F2 | `work_orders`, `work_order_transitions`, `work_order_claims`, plus its own private flow in `flows`/`flow_versions` |
| Agent-G | `people`, `organization` |
| Agent-CH | none (read-only) |

Agent-F2 owns its source flow because `postWorkOrderCreation`
freezes `flow_graph` at creation time. If Agent-F edits the
shared flow concurrently, the captured snapshot reflects
mid-edit state, not a clean baseline.

Because `StorageEvent` propagation makes sibling changes visible
to every tab, cross-boundary assertions use `≥ N` or
"displayed-count matches current localStorage at read time"
framing rather than frozen expected values. Agent-CH's dashboard
count checks are non-zero + consistency, not numeric equality.

### Known MCP limitations

- **Flow designer gestures** (port drag, shift-drag to connect,
  marquee select): synthetic PointerEvents do not reliably
  drive the `flow-interactions.ts` state machines because they
  use pointer-capture semantics. Affected tests include
  AA27–AA34, F15, F19–F23, D36, D37, E11. Work around by
  validating end-state via direct JSON injection into
  `fusion-ai:flows`, then reloading and verifying render. Mark
  BLOCKED if neither path confirms behavior.
- **`resize_window`** does not change the CSS viewport;
  responsive tests at specific widths (I10) cannot be driven.
  Inspect `responsive.css` manually to verify media queries.
- **File downloads** cannot write to disk from the MCP
  sandbox. Capture Blob content via `javascript_tool`
  intercepting `URL.createObjectURL` for validation.
- **File uploads** require constructing a `DataTransfer` in
  `javascript_tool` and dispatching a synthetic change event.
- **Keyboard events** (arrows, Cmd+K, Delete, Tab) work
  normally and bypass the pointer-capture limitation.

### Serial single-tester mode

The same TEST-PLAN.md runs serially by one human in one browser
following document order (A → AA → B → C → D → E → F → F2 → G
→ H → I → J). The agent-scoped mutation domains and tolerance
patterns apply only to the parallel run.

## Gotchas

- **`noUncheckedIndexedAccess`**: tsconfig enables this — array/object index access returns `T | undefined`, requiring explicit `!` assertions or guards.
- **ES2024 target**: No transpilation. Native `Object.groupBy()`, `Map.groupBy()` are available. Assumes modern browser.
- **`withLoadingState()` returns null**: Returns `null` on error AND when data is empty with an `emptyState` config — callers must check for null before using the result.
- **Cross-tab theme sync**: `state.ts` listens to `StorageEvent` and syncs theme changes across browser tabs automatically.
- **Non-critical writes logged at warn**: localStorage writes for theme and sidebar state are wrapped in try/catch that log at `warn` level — quota errors don't break the app but are observable via the logger.
- **Snapshots wipe-first**: All snapshot operations (pristine, mock data, import) call `DELETE('snapshots/schema')` before writing — there is no merge, only replace.
- **Snapshot quota pre-flight**: `putSnapshotFromFile` consults `navigator.storage.estimate()` and rejects with `SnapshotTooLargeError` if `file.size` exceeds half of `quota - usage` (the import doubles peak memory while parsing). Falls back to a 5 MB hard cap when `navigator.storage.estimate()` is unavailable.
- **Snapshot wipe-on-fail**: With pre-flight quota checks + per-row validation + column-level compression, mid-write failure is rare; when it does happen, `importSnapshot` wipes every `fusion-ai:<table>` key so the next bootstrap detects no schema and routes the user to the snapshots page to re-import. No backup, no sentinel, no rollback — real atomicity arrives with Postgres.
- **`file:///` protocol**: Navigation detects file protocol and skips link prefetching. Page URLs use relative paths. Code supports `file:///` locally but testing is HTTP-only.
- **View Transition aborts**: rapid programmatic navigation surfaces `InvalidStateError` lines in console. Browser-internal (no app code calls `startViewTransition`); no app impact.

## Worktrees

Do not use git worktrees. Work directly in the main checkout.
Worktrees fragment review surface, hide state from the
working tree, and add ceremony without buying isolation that
small focused commits don't already provide.

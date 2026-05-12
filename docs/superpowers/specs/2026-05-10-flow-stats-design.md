# flows/stats — Read-Only Flow Heat-Map + Path Stepper

## Context

The app has a Flow Designer (`flows/detail.html`) for *building* flows but
nothing for *understanding how flows actually run*. This adds `flows/stats.html`
— a read-only, non-editable rendering of one flow's diagram, heat-tinted by
where work-order time is spent over the trailing 90 days, with per-node
statistical detail (sojourn distribution, throughput, WIP, top producer vs.
clan average, rework rate, branch splits) shown in a read-only card on
hover/click, and a stepper through the most-common → least-common paths work
orders take. Prompted by: the user wants high-impact operational insight
surfaced on the flow diagram itself, at one or two layers of detail. Mock data
is currently 1 work order / 4 transitions — far too thin — so this also
hand-authors ~35–40 work orders on a flagship flow so the page demonstrates
real value.

## Decisions already made (with the user)

- **Interaction model: flat canvas + read-only hover/click stat card + path
  stepper.** Zero editability tells on the canvas (no toolbar, props panel,
  ports, marquee, selection glow, `role="button"`/`tabindex`, hover cursors,
  interaction FSM). Hovering a node pops a read-only info card; clicking pins
  it. The card is visibly *not* the editor's props panel (no inputs, no Save).
- **Card content: the Rich set** — everything computable per node.
- **Node face: average sojourn in minimum ascending units** (`47s` / `8.5m` /
  `3.2h` / `4.8d` / `2.1w`) via a new `formatMinAscending(seconds)` helper,
  used everywhere a duration appears on the page. Start/Archive faces show `—`.
- **Mock data: hand-authored** literal objects in `api/mock-data.ts` (no
  generator).

## Architecture — three-layer split + a dedicated read-only renderer

```
flows/stats.ts          page module — init(params); wires hover/click + stepper
                        events; touches DOM; NO writes
  └ adapters/flow-stats.ts   getFlowStats(ctx, flowId)  [ctx-first, reads only]
      ├ getFlowGraph(ctx, flowId)                  current graph (flows table)
      ├ getWorkOrderRows / getWorkOrderTransitionRows / getFlowWorkOrderRows(NEW)
      ├ getPersonMap/RoleMap/CrewMap/ModelMap, getRoleMembershipRows,
      │   getMembersOfCrew  → clan member sets, like workbox buildVisibilityScope()
      └ buildFlowStats(...)  ← the pure module
  └ flow-stats-aggregate.ts  buildFlowStats(input) → FlowStatsModel
                        [PURE: in → transform → out]
      path reconstruction; sojourn clipping to [now−90d, now]; heat fraction +
      heatT (raw 0..1 ramp position, fixed-scale); avg/median/p90;
      visits/WIP/throughput; revisit rate; clan +
      top-producer-vs-clan-avg; branch splits; distinct full paths (top 8 +
      "rest" bucket); dropped-node tracking
  └ presenters/flow-stats.ts  FlowStatsPresenter(model, viewBox)
                        [immutable; returns SafeHtml; never touches DOM]
      renderShell / renderUpdate(uiState) / renderCard(nodeId)
      — header, canvas, card, stepper, legend
      └ flow-stats-graph.ts  buildStatsGraphSvg(model, viewBox, highlight)
                        → SafeHtml
          NEW renderer — NOT an extension of flow-graph.ts. Reuses geometry
          constants + perimeterPoint/whichEdge/controlOffset + iconAlertTriangle;
          emits heat-tinted nodes (style="--heat-t:..."), avg-sojourn faces,
          path highlight via data-on-path/data-dim. NO ports, NO role="button",
          NO <animate>.
```

**Why a separate renderer (not extending `flow-graph.ts`):** `flow-graph.ts` is
the *editor's* renderer, full of editor-only concerns (ports, marquee, animated
`flow-glow` filter, `role="button"`, `tabindex`, `data-connect-port`,
`aria-current`). The stats canvas is a genuinely different artifact. This is
exploratory duplication (Commandment IX — don't generalize before three uses);
`flow-detail` stays untouched. If a third flow-canvas consumer ever appears,
*then* extract a shared core. What it *does* reuse (genuinely pure,
editor-state-free): `NODE_WIDTH/HEIGHT/RADIUS`, `GRID_CELL`,
`perimeterPoint`/`whichEdge`/`controlOffset` (already exported), `bezierAt`
(export it — pure), `START_NODE_DEFAULT_NAME`/`END_NODE_DEFAULT_NAME`,
`iconAlertTriangle`, `shouldShowHazard`, the grid `<pattern>` markup (small
local copy with a `// cf. flow-graph.buildDefs` note).

## Files — NEW

- **`web-app/flows/stats.html`** — one line: `<div id="flow-stats"></div>`
  (sidebar-layout page-content; `compose.ts` discovers it from `PAGE_REGISTRY`).
- **`web-app/flows/stats.ts`** — `export async function init(params?)`. Read
  `params.flowId` (→ `navigateTo('flows')` if missing). `withLoadingState` +
  `buildSkeleton`. `createRequestContext()` → `getFlowStats(ctx, flowId)`.
  Compute viewBox = bounding box of `graph.nodes` + padding (tiny
  `boundingViewBox` helper). `new FlowStatsPresenter(model, viewBox)`;
  `renderShell(host)`; `renderUpdate(host, {selectedPathIndex:0,
  pinnedNodeId:null, hoveredNodeId:null})`. Delegated events (with
  `AbortController`): `mouseover`/`mouseout` on `[data-node-id]` →
  `presenter.renderCard(host, id|null)` + pass the node `<g>`'s
  `getBoundingClientRect()` (relative to the canvas-area) as pixel offsets to
  anchor the card; `click` on `[data-node-id]` → toggle pin; click empty canvas
  → unpin; `click` on `[data-stepper="prev"|"next"]` → bump index +
  `renderUpdate`. Back button `#flow-stats-back` → `navigateTo('flow-detail',
  {flowId, ...projectId})`.
- **`web-app/app/flow-stats-aggregate.ts`** — pure. Exports `FlowStatsInput`,
  `FlowStatsModel` (+ `NodeStat`, `FlowPath`, `PathEntry`), `quantile`,
  `buildFlowStats`. Algorithm: group transitions by `work_order_id`; sort each
  by `transitioned_at`; a WO is "in" `to_node_id` from that transition until
  the next (or "now" if not complete); sojourn in `isStart`/`isComplete` nodes
  = 0; clip each occupancy interval to `[now−90d, now]` and accumulate
  per-node + flow-total seconds; transitions referencing node IDs absent from
  the *current* graph are dropped (tracked in `droppedNodeIds`, the path
  elides that step); per node compute the heat fraction `heatPct` and the
  ramp position `heatT` ∈ [0,1] (= `heatPct / 100`, clamped — the raw share
  of flow time; the heat ramp is fixed-scale, NOT normalized to the busiest
  node), avg/median/p90 sojourn, visits-in-window, distinct WOs,
  currently-here (WIP), throughput/week, revisit rate, clan set (role →
  members; crew → crew→role→members; user-private role → 1 person;
  unassigned/model → empty), top producer (most OUT-transitions; tie-break
  name/id), top-producer-vs-clan-avg % and share-of-node %, hazard, branch
  split (% down each outgoing edge for >1-out nodes); distinct full paths of
  *completed* WOs grouped + sorted desc, top 8 explicit + a `{kind:'rest'}`
  bucket. `nowMs` and `windowDays` injected for testability.
- **`web-app/app/duration-units.ts`** — pure. Exports `formatMinAscending(
  seconds: number): string` — largest unit on the `s → m → h → d → w` ladder
  where the value ≥ 1; 1 decimal if scaled value < 10 else integer; `0` →
  `'0s'`; negative → throw. Imports `SECONDS_PER_HOUR`/`SECONDS_PER_DAY` from
  `api/types.ts`; adds `SECONDS_PER_MINUTE=60`, `SECONDS_PER_WEEK=604800`.
  Separate module (not in `format.ts`): only the *presenter* renders durations,
  and presenters import from source modules; `format.ts` is the page-module
  facade.
- **`web-app/app/flow-stats-graph.ts`** — exports `buildStatsGraphSvg(model,
  viewBox, highlight) → SafeHtml`. `<svg class="flow-stats-canvas" role="img"
  aria-label="…">`; grid bg; `<defs>` with normal + accent arrow markers (no
  animated filters); edges as simple cubic Béziers with `data-edge-id`,
  `data-dim`/`data-on-path`; nodes as `<g class="flow-stats-node" data-node-id
  style="--heat-t:${heatT}" data-special? data-dim? data-on-path?>` — rounded
  `<rect class="flow-stats-node-rect">` (fill computed in CSS via `color-mix`
  from the per-node `--heat-t` custom property — the doctrine's
  dynamic-value-as-data exception, like `--progress-fill`; border from
  `[data-special]` in CSS), name `<text>`, face `<text
  class="flow-stats-node-face">` = `formatMinAscending(avgSeconds)` or `'—'`,
  hazard `<g>` (reuse `iconAlertTriangle`) when `hasHazard`. NO ports, NO
  `role="button"`, NO `tabindex`, NO `data-connect-port`, NO `<animate>`.
- **`web-app/app/presenters/flow-stats.ts`** — `FlowStatsPresenter(model,
  viewBox)`. `renderShell(container)`: static skeleton — header
  (`#flow-stats-back` ghost-icon button, flow name `h1` + description,
  "Trailing 90 days" badge); `.flow-stats-body` → `.flow-stats-canvas-area`
  (`position:relative`) containing `.flow-stats-canvas-host` +
  `.flow-stats-card.hidden`; stepper bar; legend. `renderUpdate(container,
  ui)`: compute highlight from `ui.selectedPathIndex` into `model.pathEntries`;
  `setHtml(host, buildStatsGraphSvg(...))`; stepper label `◀ Path i+1 of N ·
  X% of M work orders ▶` (or `+ N rarer paths, combined Z%` for a `rest`
  entry; `disabled` attr at ends); a 4-stop heat gradient-bar legend (blue at
  `0%` → green at `50%` → yellow at `75%` → red at `100%` of flow time, same
  non-uniform stop positions as the node fill, captioned "share of flow time,
  trailing 90 days"); dropped-nodes footnote iff any; render card per
  `pinnedNodeId ?? hoveredNodeId`. `renderCard(container, nodeId|null)`:
  card-only update (toggle `.hidden`, `#buildCard`, set `--card-x`/`--card-y`
  px anchors). `#buildCard(s: NodeStat): SafeHtml` — Rich `<dl>`: % of flow
  time; avg/median/p90 (`formatMinAscending`, `DISPLAY_ABSENT` for null);
  visits(90d)/distinct WOs/currently-here; throughput `~N/wk`; loop-back rate;
  for regular non-model nodes: clan size / active producers / top producer
  `name · X% of clan avg · Y% of node's work [(not in current clan)]`; for
  model nodes: model name (no clan/producer); branch nodes: `next → A x% ·
  B y%`. Register in `presenters/index.ts`.
- **`web-app/app/adapters/flow-stats.ts`** — `export async function
  getFlowStats(ctx, flowId): Promise<{model: FlowStatsModel; graph: FlowGraph}>`.
  `Promise.all` the fetches; filter work orders/transitions to this flow via
  the `flow-work-orders` join table (relational truth); build
  `roleMemberSetByRoleId`/`crewMemberSetByCrewId` (mirrors
  `workbox/index.ts buildVisibilityScope()` — ~30 lines local with a
  `// mirrors workbox` note); build name maps; call `buildFlowStats({...})`;
  set `flowName`/`flowDescription` from `graph`. Register in
  `adapters/index.ts`.
- **`web-app/app/adapters/work-orders-queries.ts`** — add one-liner
  `getFlowWorkOrderRows(ctx)` = `ctx.GET('flow-work-orders')` (flows through
  `adapters/index.ts`'s `export *`).
- **Tests** — `tests/duration-units.test.ts` (boundary table: `0→'0s'`,
  `47→'47s'`, `60→'1m'`, `90→'1.5m'`, `510→'8.5m'`, `3600→'1h'`,
  `414720→'4.8d'`, `604800→'1w'`, `1270080→'2.1w'`, negative throws);
  `tests/flow-stats-aggregate.test.ts` (the big one — small fixtures: 4-node
  flow + a B→A self-loop, hand-authored transition arrays, fixed `nowMs`;
  assert sojourn attribution, heat fractions + `heatT` (= `heatPct / 100`,
  clamped to [0,1]; e.g. a node at 32% of flow time → `heatT === 0.32`; a
  node at 60% → `0.60`; all-zero flow → all `heatT === 0`), window clipping,
  `isStart`/`isComplete` sojourn=0, avg/median/p90 by the chosen quantile
  convention, WIP, throughput, revisit rate, clan + top producer + vs-avg +
  share + `inCurrentClan:false`, hazard cases (unassigned / zero-member role
  / user-private / model), branch split, distinct paths + `rest` bucket +
  `incompleteWorkOrderCount`, dropped-node mismatch, empty flow);
  `tests/adapters-flow-stats.test.ts` (`MemoryDbAdapter` via
  `createRequestContext(db)`: flow isolation — seed a *second* flow's WO and
  confirm it's excluded; cross-check clan sets against an independent
  `getMembersOfCrew` call; names resolved (not ids); `flowName` from the
  current flow row not a frozen snapshot — mutate the flow name post-WO and
  assert the new name appears; `getFlowWorkOrderRows` returns seeded rows;
  unknown flowId propagates the `getFlowGraph` error);
  `tests/presenter-flow-stats.test.ts` (SafeHtml string assertions: each node
  `<g>` carries `style="--heat-t:…"` with the expected value and **no**
  `data-heat` attribute, face text = `formatMinAscending(avgSeconds)` / `—`
  for start nodes, card `<dt>`/`<dd>` pairs, model node shows model name +
  no clan rows, unassigned renders hazard, stepper label, `rest` entry → `+N
  rarer paths`, the legend is a 4-stop gradient bar with `0%` and `100%` end
  labels (not 5 chips, no `{maxHeatPct}%` label), dropped-nodes footnote iff
  applicable, `data-dim`/`data-on-path` on the right elements, and
  **absence** of `role="button"`, `data-connect-port`, `aria-current`,
  `<animate>`).

## Files — MODIFIED

- **`web-app/app/page-registry.ts`** — add `'flow-stats': { title: 'Flow
  Statistics', layout: 'sidebar', sidebarKey: 'flows', sourceDir: 'flows',
  sourceFile: 'stats', icon: iconBarChart, searchable: false, loader: () =>
  import('../flows/stats') }`; add `iconBarChart` to the icon imports.
- **`web-app/app/flow-designer.ts`** — add `<button id="flow-stats-btn"
  class="btn btn-ghost btn-icon" title="Stats" aria-label="Flow
  statistics">${iconBarChart(20,'')}</button>` to the detail header in
  `renderShell` (near the back button); import `iconBarChart`.
- **`web-app/flows/detail.ts`** — `bindStatsButton(container, flowId,
  projectId, signal)` → `navigateTo('flow-stats', {flowId,
  ...(projectId?{projectId}:{})})`.
- **`web-app/app/presenters/flow.ts`** — add `<button class="btn btn-ghost
  btn-icon flow-card-stats-btn" data-flow-stats="${f.id}" title="Stats"
  aria-label="Flow statistics">${iconBarChart(16,'')}</button>` to each flow
  card (next to the chevron); import `iconBarChart`.
- **`web-app/flows/index.ts`** — in the `listEl` click handler, before the
  `[data-flow-card]` branch: `const sb = e.target.closest('[data-flow-stats]');
  if (sb) { navigateTo('flow-stats', {flowId:
  getRequiredAttribute(sb,'data-flow-stats')}); return; }`.
- **`web-app/app/styles/pages.css`** — new `/* ===== N. FLOW STATS ===== */`
  section: `html[data-page="flow-stats"]` full-height block (parallel to the
  `flow-detail` one); `.flow-stats*` layout. **The node fill is a 4-stop
  non-uniform fixed-scale heat ramp driven by `--heat-t` (0..1):** blue at 0
  → green at 0.5 → yellow at 0.75 → red at 1.0, interpolated by three chained
  `color-mix(in oklch, …)` invocations, one per segment. Each segment's
  fraction is a CSS custom property using `clamp(0%, calc((var(--heat-t) -
  <lo>) / <span> * 100%), 100%)` so it activates over its t-range and
  saturates outside it (`--seg1` over [0,0.5], `--seg2` over [0.5,0.75],
  `--seg3` over [0.75,1.0]). All four colors come from design tokens
  (`--heat-stop-low/-mid/-high/-peak`). One rule, ~10 lines with a doc comment
  naming the stops. `[data-special="start|archive"]` borders unchanged;
  `[data-dim="true"]{opacity:.28}`, `[data-on-path="true"]
  .flow-stats-node-rect{stroke-width:4;stroke:hsl(var(--accent))}` (+ accent
  arrow); `.flow-stats-node-face`; `.flow-stats-card` (absolute; anchored via
  `--card-x`/`--card-y` px; `max-width:22rem`; `z-index`; clamp within the
  area; bottom-sheet at `<768px`); `.flow-stats-card-grid` (`<dl>` 2-col);
  `.flow-stats-stepper-bar` (reuse `.btn .btn-ghost .btn-icon`);
  `.flow-stats-legend` — a horizontal 4-stop gradient bar (`background:
  linear-gradient(to right, hsl(var(--heat-stop-low)) 0%,
  hsl(var(--heat-stop-mid)) 50%, hsl(var(--heat-stop-high)) 75%,
  hsl(var(--heat-stop-peak)) 100%)`) with `0%` / `100%` end labels + a text
  caption "share of flow time, trailing 90 days". NO inline styles except the
  `--card-x/y` and `--heat-t` data exceptions; all colors `hsl(var(--token))`.
- **`web-app/app/styles/light-mode.css`** + **`dark-mode.css`** — four
  `--heat-stop-*` ramp-stop tokens (`low`, `mid`, `high`, `peak`) as `H S% L%`
  triples — blue, green, yellow, red. Starting values (tune to taste):
  Light: low `210 85% 55%` · mid `145 65% 50%` · high `48 95% 55%` · peak
  `0 80% 55%`. Dark: low `210 60% 60%` · mid `145 50% 55%` · high `48 80% 60%`
  · peak `0 65% 60%` (desaturated and lifted in lightness so they read well
  on dark surfaces and keep node-name text legible across the full range).
  Interpolated in `oklch` (via `color-mix`) so each segment is perceptually
  smooth between its endpoints. **Accessibility note:** blue/green/yellow/red
  is a classic colorblind-tricky palette, but on this page color is never
  the sole channel — every node carries its avg-sojourn number on its face
  and the hover card shows the exact percentage, so the gradient is
  decoration over data; the data path is colorblind-safe.
- **`api/mock-data.ts`** — hand-author ~35–40 `WorkOrderEntity` + matching
  `FlowWorkOrderEntity` + ordered `WorkOrderTransitionEntity` chains on
  `mockFlows[0]` ('Customer Onboarding': Create → Data Capture → Review →
  Archive, with the Review→Data Capture "needs revision" loop; Data Capture
  assigned to `crew_design`), plus ~5–8 on a second flow. Vary sojourn
  lengths (Data Capture hottest, fat right tail), loop counts (revisit rate +
  the Review branch split `approve` vs `needs revision`), in-flight count
  (WIP), the OUT-transition `person_id` from Data Capture (spread across
  `crew_design`'s members for top-producer signal; 1–2 out-of-clan),
  `created_at` across the trailing ~120 days (a few outside the 90-day window
  → exercises clipping). Aim for 4–5 distinct completed paths with a clear
  leader + a long tail. `flow_graph` per WO = the frozen snapshot of
  `mockFlows[0].graph`, exactly like the existing single WO. Every new row
  must pass `validators.ts` (`./test` runs `tests/mock-data-valid.test.ts`).
- **`tests/navigation.test.ts`** — add `buildPageUrl('flow-stats')` /
  `buildPageUrl('flow-stats',{flowId:'f1'})` / `navigateTo('flow-stats',
  {flowId:'x'})` assertions.
- **`TEST-PLAN.md`** — add manual cases `FS1–FS9` (entry from flows/index
  card icon & detail-header button; flat canvas / no edit tells; heat tints +
  `—` on Create/Archive + `8.5m`-style faces; hover→rich read-only card /
  branch `next →` line / no inputs-or-Save; click→pin / empty-canvas→unpin;
  model node → model name + no hazard / unassigned → hazard /
  zero-member-role → hazard; path stepper `◀ N of M · X% ▶` / accent
  highlight + dimming / no pulse-animation / disabled at ends / "+N rarer
  paths"; dark-mode legibility; data-shape regression — heat sums ≈100%
  across non-special nodes, WIP matches, no-`flowId` → redirect). Note:
  hover/click on SVG `<g>` is MCP-drivable (no pointer-capture FSM, unlike
  the editor). Also flag: the ~35–45 new work orders re-baseline Workbox
  cases WB1–WB19 (and possibly dashboard C-cases) — covered by the parallel
  protocol's "≥ N" tolerance, but note it. (Total new work orders ≈ 40–48
  across the two flows.)

## Key decisions on the open questions (flag if you disagree)

- **Heat: a continuous 4-stop fixed-scale linear gradient** (per the user) —
  blue at `heatT=0` → green at `0.5` → yellow at `0.75` → red at `1.0`, where
  `heatT = heatPct/100` (the raw share of flow time — NOT normalized to the
  busiest node). The stops are non-uniformly spaced so the top quarter of
  the value range (75%–100%) compresses yellow→red into a visually salient
  "bottleneck zone," while the lower half (0–50%) ramps gently blue→green.
  A typical busy node at 30–40% of flow time lands in the blue→green region;
  only a genuinely dominant node (>50%) starts going yellow/red. Rendered as
  a per-node `style="--heat-t:…"` custom property (the doctrine's
  dynamic-value-as-data exception, like `--progress-fill`); the four ramp
  stops are design tokens (`--heat-stop-low/-mid/-high/-peak`); the color is
  three chained `color-mix(in oklch, …)` rules in CSS, one per segment, with
  segment activation via `clamp(0%, calc(…), 100%)` — palette centralized in
  tokens, no magic colors in TS, no TS color math at all. The legend is a
  4-stop gradient bar with the same non-uniform stop positions and `0%`/
  `100%` end labels. The exact percentage is always in the node's hover card,
  so the color is a visual aid, never the sole channel.
- **Numeric display: low resolution, no false precision** — this is a
  high-level view: heat % shown as an integer (`58%`, never `58.3%`); all
  card percentages (loop-back rate, top-producer-vs-clan-avg, share-of-node,
  path share) as integers; throughput as an integer (`~11/wk`; `<1/wk` if it
  would round to 0); durations already coarse via `formatMinAscending`; raw
  counts (visits, distinct WOs, WIP, clan size, active producers) shown
  exact — a count is its own value; rounding it is a lie, not a
  simplification.
- **Window = clip intervals to [now−90d, now]** — a WO in a node for 200
  days contributes only its last 90 to that node and the flow total. (Not
  "WOs *created* in the last 90d", which would discard long-runners.)
- **Sojourn in `isStart`/`isComplete` nodes = 0** — otherwise "sits in
  Archive forever" swamps the heat map. Hence Create/Archive faces show `—`.
- **Render the *current* flow graph**; count only transitions whose node IDs
  still exist in it; dropped ones don't perturb heat, the path elides that
  step, and a footnote reports the count. (Per-WO frozen `flow_graph`s
  differ → no single canvas to draw; `flow_versions` are editor undo-history,
  wrong tool.)
- **Top producer = the actual person with the most OUT-transitions**, even
  if they're no longer in the node's clan — shown with a "(not in current
  clan)" note rather than hidden/substituted (honesty over magic, the
  `personName`-throws philosophy). "% of clan average" = their out-count ÷
  (node's total out-count ÷ clan size); user-private role clan = 1;
  model/unassigned → no producer stat.
- **`p90`/median = linear-interpolation quantiles, p50 = true median**
  (`index = q·(n−1)`). Fixes the presenter/aggregate tests' exact numbers.
- **Path list: top 8 explicit + a selectable "rest" stepper position**
  ("+N rarer paths, combined Z%", highlights nothing). Only *completed* WOs
  have paths; in-flight count shown as context.
- **Layout: use the flow's persisted node positions** + a bounding-box
  viewBox (`preserveAspectRatio="xMidYMid meet"`) — zero layout code, exact
  match to "Designer with Auto Layout off". (Auto-fit/re-layout is a
  follow-up.)
- **Work-order → flow link: the `flow-work-orders` join table** (relational
  truth — Codd / the Church's relationships-in-their-own-relations Article).
  Verify `postWorkOrderCreation` writes a `FlowWorkOrderEntity`; fall back
  to matching the frozen `flow_graph.flowId` only if it doesn't.
- **Title "Flow Statistics"**, page heading = the flow name, button labels
  "Stats" — parallels "Flow Designer".

## Verification

- `./validate` (= `tsc --noEmit` + `./test` + 78-char lint) — must pass
  clean. Watch: `noUncheckedIndexedAccess` (`map.get(id)` is `T|undefined`
  throughout the aggregate — `!`/guards as the existing code does); 78-char
  overruns in the SVG-string concatenations (`flow-graph.ts` shows the house
  `+ '...'` continuation style) and the `pages.css` heat rules.
- New automated tests green: `node --test --strip-types
  tests/duration-units.test.ts tests/flow-stats-aggregate.test.ts
  tests/adapters-flow-stats.test.ts tests/presenter-flow-stats.test.ts`;
  `tests/navigation.test.ts` + `tests/mock-data-valid.test.ts` still green.
- End-to-end (sandbox): `TMPDIR=/tmp/claude ./serve 8080` → open
  `http://localhost:8080/flows/index.html` → click a flow card's chart icon
  → `flows/stats.html?flowId=…` renders the heat-tinted canvas; hover a node
  → rich read-only card near it; step the paths → accent highlight + dimming,
  no pulse; "← Designer" returns to `flows/detail.html`; direct-nav
  `http://localhost:8080/flows/stats.html` (no flowId) → redirects to
  `flows/index.html`; toggle dark mode → tints + card stay legible. Drive
  with the `claude-in-chrome` MCP (hover/click on `<g>` works — no
  pointer-capture FSM).
- Manual: `TEST-PLAN.md` `FS1–FS9`.

## Critical files
- `web-app/app/flow-stats-aggregate.ts` (NEW — the keystone; pure
  heat/sojourn/path/clan math)
- `web-app/app/presenters/flow-stats.ts` (NEW — read-only presenter: card,
  stepper, legend)
- `web-app/app/flow-stats-graph.ts` (NEW — read-only SVG renderer,
  deliberately separate from `flow-graph.ts`)
- `web-app/app/adapters/flow-stats.ts` (NEW — `getFlowStats`, ctx-first,
  reads only)
- `web-app/app/duration-units.ts` (NEW — `formatMinAscending`)
- `web-app/flows/stats.ts` + `web-app/flows/stats.html` (NEW — page module +
  shell)
- `web-app/app/page-registry.ts` (MODIFY — `flow-stats` entry)
- `api/mock-data.ts` (MODIFY — ~35–40 hand-authored work orders + transitions
  + flow-work-order links)
- `web-app/app/styles/pages.css` + `light-mode.css` + `dark-mode.css`
  (MODIFY — `flow-stats-*` section + `--heat-*` tokens)

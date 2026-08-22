# Flow Canvas

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
seam, no shared mutable state. While a gesture is in flight
(drag, pan, marquee, connect), detail.ts routes
`request-update` payloads to `flow-gesture-render.ts` instead:
one narrow attribute-level mutation per animation frame (node
transform, affected edge `d`/label, marquee rect, viewBox +
grid, connect-preview layer), built from the same pure
geometry the full rebuild uses (`computeEdgeGeometry`,
`buildConnectPreview`, `marqueeDrawRect`). The presenter
snapshot stays at the gesture-start state; pointer-up lands
the final state through the sanctioned seam and a full
rebuild. With Auto-Fit on, the camera re-fits at gesture end,
not per move. Pointer-moves force no layout reads: the
interaction layer captures the canvas rect at gesture start
and maps client points through the FSM's own viewBox — exact,
because the viewBox always shares the canvas aspect ratio and
`svg.flow-canvas` carries no border or padding. The properties
panel is positioned on the LEFT
(`pages-flow-detail.css` `.flow-props-panel` uses
`left: 0`); the visible canvas occupies pixels
`[PANEL_WIDTH_PX, canvasW]`. When the panel is open, both Auto
Layout (`applyAutoLayout`) and Auto Fit (`fitBoxToCanvas`) account
for the panel-occupied left portion via `PANEL_WIDTH_PX`. The
detail page's `reconcileFitFromDom` runs Auto Fit only when
`isAutoFit` is true (no-op otherwise), so panel toggles and
selection updates re-fit the visible canvas symmetrically
without re-laying out nodes. Viewport scale/translate
operations (zoom, pan, Auto Fit, panel toggle, selection
centering) MUST NOT invoke Auto Layout. Explicit auto-layout
fires only via `withAutoLayoutToggled`, `withLayoutReconciled`,
and the `withNodesMoved` chain — never via `withFitToBox`
or `withSelectionCentered`. The detail-page `request-update`
callback runs `reconcileFitFromDom` after `withInteractionState`
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
recorded as that node's id (an identifier), distinct in
shape from the closed claim alphabet
(`'claimed'`, `'claim_released'`, `'claim_expired'`) on
the same `entity_id`. The states log carries both families;
`adapters/work-orders-queries.ts` partitions them with
`isClaimState` (a closed-set test over the claim alphabet,
defined in `api/work-order-claims.ts`) and exports the
`TransitionEvent` shape. The
mermaid parser does not translate either: a legacy `.mmd`
file that names its special nodes `[Start]` / `[End]`
imports with those literal names, surfacing the staleness
rather than masking it via a shim. Regular
nodes (not start/end) carry a `memberIds: MemberId[]` field
(zero or more person members / identities) and an optional
`agentIds: AgentId[]` field (live `/ai-agents` ids). The
panel body renders a `<fieldset>` with two `<div class=
"member-group">` children — HUMANS and AIs — each holding a
labeled `<input type="checkbox">`. Humans carry
`data-member-id="<id>"`; AI checkboxes are display-only
(`data-ai-member-id`) until a roster seat names an agent.
The fieldset respects `isLocked` (every checkbox
`disabled` when locked). On change, the panel collects
every checked human into a `MemberId[]` and dispatches
the node-property-update action via the pure helper
`parseMemberIdsFromPanel(panelEl)` in `flows/detail.ts`.

Regular nodes also carry `attributes: NodeAttribute[]`
(`{ attributeId, mode, isRequired }`). Hidden is encoded
by absence from the array. `mode` is `'editable'` or
`'readonly'`. The per-node panel renders one row per ref
with a mode picker + Required checkbox + remove button,
plus a picker `<select>` listing every record_attribute on
the bound Record not yet referenced. The flow header
carries a Record-binding `<select>` driven by
`getRecordForFlow` / `postFlowRecordBinding` /
`deleteFlowRecordForFlow`.

The canvas operates on the domain `GraphNode` /
`GraphEdge` (`memberIds`, `agentIds`, `attributes`). The
live graph is pair-plane only — see
[ARCHITECTURE.md](ARCHITECTURE.md)
§ Flow-graph storage seam for storage, reassembly, and
write semantics. `getFlowGraph` reads through `ctx.GET` and
parses the returned graph into the domain `FlowGraph`.
`flow-mutations.ts` builds a client-minted save delta
(node/edge upserts, `deletions: GraphDeletion[]`
(eventId/entityId/at), member/attribute `'added'`|
`'removed'` ledger events). Lifecycle `'deleted'`/
`'restored'` are derived from deletions/revivals, not
delta action tokens. Undo resolves its restore target from
the flow's own document-pair history (server-side); reviving
a previously removed node/edge id posts a `'restored'`
event so the tombstoned id reappears.

Hazards are two-tier and shared across the designer +
stats canvases via the pure predicate
`shouldShowMemberHazard(node, allEdges)` in
`web-app/app/flow-graph.ts`. Precedence: `isCreate` /
`isArchive` → no hazard ever; zero members → `'danger'`
(red `iconNoEntry`, class `.flow-node-danger` /
`.flow-stats-node-danger`); zero outgoing edges (strict
dead-end) → `'danger'`; exactly one member → `'warning'`
(yellow `iconAlertTriangle`, class `.flow-node-warning` /
`.flow-stats-node-warning`); two-or-more members AND at
least one outgoing edge → no hazard. Both badges sit in
the bottom-left of the node, mutually exclusive at the
slot. The aggregate model emitted by
`flow-stats-aggregate.ts` carries the resolved level on
each node as `memberHazard: 'warning' | 'danger' | null`;
the stats renderer reads it directly.

The flow-publish gate is the third call site of the same
predicate. `validateFlowForCreation(flow)` in
`web-app/app/adapters/flow-publish.ts` returns
`{ ready: boolean, problems: FlowProblem[] }` —
`zero_members(nodeId)` and `dead_end(nodeId)` variants —
and `getFlowsForCreation(ctx)` partitions the unlocked
flows into `{ ready, notReady }` (locked flows are
excluded) for the workbox "Create Work Order"
dropdown. The picker renders two sections: READY
(clickable, carries `data-flow-id`) and NOT READY
(disabled, no-entry icon, "N nodes need attention"
subtitle, no `data-flow-id` so the click handler ignores
it). The client adapter `postWorkOrderCreation` re-runs
`validateFlowForCreation` and throws before POST if the
picker was somehow bypassed — defense in depth at the
client boundary.

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
`putWorkOrderClaim` materializes that implicit expiration
as an explicit `'claim_expired'` event when a new claim
notices a stale prior, so the durable record converges on
the reader's view.

The read-only stats variant (`flow-stats`) uses its own renderer
`flow-stats-graph.ts` and presenter `FlowStatsPresenter`,
deliberately *not* a parametrization of
`flow-graph.ts`/`FlowDesignerPresenter`. It
shares only the pure pieces: geometry constants
(`NODE_WIDTH`/`NODE_HEIGHT` from `flow-layout.ts`,
`NODE_RADIUS` / `GRID_CELL` exported from `flow-graph.ts`),
the already-exported edge-path helpers (`perimeterPoint`,
`whichEdge`, `controlOffset`), `findCycleEdgeIds` from the
pure `flow-cycle-edges.ts` (the designer's back-edge DFS,
extracted so both renderers mark loop-backs identically),
`iconAlertTriangle` and `iconNoEntry` (the two hazard
icons). Node positions, though, do *not* come from the
renderer:
`getFlowGraph` runs `flow-graph-layout.ts`'s
`withRenderableLayout`, which lays a flow out
(`computeLayout`) whenever domain `isAutoLayout` is set
(wire `is_auto_layout` on FlowWithGraph) or its stored
positions are degenerate — so the stats renderer and the
designer both start from real coordinates, not the
persisted (0,0) placeholders. `runFlowLayout` /
`runLayoutFromInputs` is the one `computeLayout` wrapper,
shared by `getFlowGraph`, the designer's `applyAutoLayout`,
and `flow-export`'s mermaid-import path.
Its emitted SVG carries *none* of the editor's
interactivity tells (no `<animate>`, `role="button"`,
`tabindex`, connection ports, `data-connect-port`,
`aria-current`) and *no paint either* — edge/node strokes,
the arrowhead, the loop-back dash all live in
`pages-flow-stats.css`; the renderer emits structure (`d`,
`transform`, `x/y`, `class`, `data-*`) only. The one
presentational inline attribute is the per-node
`style="--heat-t:${t}"`; CSS computes the fill via a 4-stop
ramp built from three chained `color-mix(in oklch, ...)`
segments driven by `--heat-t`.
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
from `adapters/work-orders-queries.ts` — derived from
work-order history (`GET work-orders/history` and per-id
history on the pair-plane lifecycle), not from any retired
event table. The I/O wrapper is `adapters/flow-stats.ts`'s
`getFlowStats(ctx, flowId, nowMs)`.

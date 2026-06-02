# Architecture

Vanilla TypeScript with zero runtime dependencies. This
document covers the domain, data, API, presentation, and
convention layers. Storage shapes and state alphabets live
in [SCHEMA.md](SCHEMA.md).

## Domain objects

Domain classes wrap entity + state: `Idea(entity, state)`,
`Project(entity, state)`, `HumanMember(entity, state)`,
`AIMember(entity, state)` all expose `stateValue()`,
`stateLabel()`, and `stateClassName()` — the lifecycle
stage is part of the domain object, not a separate fetch
the presenter has to reconcile. `Idea` additionally
exposes `readinessValue()`, `readinessLabel()`,
`readinessClassName()`, and `isReady()` — readiness is
derived from required-field presence on every call.

Readiness is a derived property of the `Idea` domain
object, computed at instantiation from required-field
presence: `title`, `problem_statement`,
`proposed_solution`, `expected_outcome` all non-empty →
`'ready'`; any one empty → `'incomplete'`. Readiness is
not stored in the states log; `Idea.readinessValue()` /
`Idea.isReady()` derive per call.
`canBeSubmittedForReview()` gates on lifecycle
(`active` or `sent-back`) AND `isReady()`.

The terminal state for both human and AI members is
`'archived'`. Both kinds change lifecycle through the
member-detail State select, which records the chosen
state via `postHumanMemberStateChange` /
`postAIMemberStateChange` — one voice across kinds.

## Flow Canvas

The Flow Designer (`flows/detail.html`) renders an SVG
canvas with pan, marquee, drag, and edge connection. Its
full architecture — the layer split, the FSM seam, panel
and auto-fit reconciliation, the two-tier hazard predicate,
and the read-only stats variant — lives in
[FLOW-CANVAS.md](FLOW-CANVAS.md).

## Records

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

## API Layer (`/api`)

`api/types.ts` (row types + shared aliases — `MemberId`,
`MemberEntity` parent + `Member` union (`HumanMember` /
`AIMember` / `SystemMember`),
`GraphNode.memberIds: MemberId[]`,
`GraphNode.attributes: NodeAttribute[]`, `RecordEntity` /
`RecordAttributeEntity` / `FlowRecordEntity`, `Constraint`
discriminated union, `StateEntity`, the five state
alphabets, and `SYSTEM_MEMBER_ID`), `api/db.ts`
(`DbAdapter` interface + `TABLE_NAMES` array listing every
storage table — `members`, `human_members`,
`ai_members`, `ideas`,
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
`api/mock-data.ts` (seeds parent `members` rows plus
`human_members` / `ai_members` detail — the `'system'`
member plus the human and AI rosters), `api/validators.ts`
(`validateMemberEntity` /
`validateHumanMemberEntity` / `validateAIMemberEntity` /
`validateStateEntity`, where the AI validator verifies
`model` is a known catalog id). The `DbAdapter`
interface is the migration seam to Postgres.

`web-app/app/adapters/init.ts` wires the production LocalStorage
adapter singleton (`initAdapter()` / `getDbAdapter()`).
`web-app/app/adapters/shared.ts` defines the `RequestContext`
interface and `createRequestContext(adapter?)`, defaulting to
that singleton; tests pass it a `MemoryDbAdapter`.

The `StateStore` class defines four route definitions
covering five HTTP operations: `GET/PUT states/:id`,
`GET states`, `GET entity-states/:id` (current), and
`GET entity-states/:id/history` (ordered). When no schema
exists, non-entry pages redirect to snapshots.

## Page Module Pattern

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
- `members` → `web-app/members/index.ts` + `index.html`
  (single list grouped Humans / AIs; filter chips, search,
  `+ Add Member` dialog with a Human/AI kind picker).
- `member-detail` → `web-app/members/detail.ts` +
  `detail.html` (dispatches by `member.kind` to the human
  or AI detail presenter; `searchable: false`).

## Presenter Pattern

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
`HumanMember`, `AIMember`, and `ProjectDetail`. The
`member-detail` page module reads `member.kind` and dispatches
to the right pair: `HumanMemberDetailPresenter` /
`HumanMemberDetailEditPresenter` for humans,
`AIMemberDetailPresenter` / `AIMemberDetailEditPresenter` for
AIs (the AI edit presenter renders a provider-grouped model
pulldown and a skill-focus textarea; no token field).

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
flow name into the header after `renderShell`,
keeping `buildFlowStats` independent of presentation strings.

## Import Conventions

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

## Naming Conventions

- `mutate*` — finds existing DOM and updates it (side-effecting,
  distinct from `build*` which constructs and returns)
- `toneFor*` / `levelFor*` — return string enums consumed as
  `data-tone` / `data-level` attribute values (replaces older
  `styleFor*` inline-style pattern)
- `assert*` — validators in `api/types.ts` and
  `api/validators.ts` that take a raw value and return a typed
  value or throw. The `is*` type-guards remain for legitimate
  type-narrowing call sites.
- Adapter functions use **domain nouns** (`getIdea`, not
  `getIdeaEntity`) — return type already communicates shape.

## Adapter Conventions

- **Member domain split.** Members are one parent table
  (`members`: id, type, name) plus per-kind detail tables
  sharing the id (`human_members`, `ai_members`).
  `adapters/members.ts` composes humans (parent +
  `human_members` detail); `adapters/ai-members.ts`
  composes AIs (parent + `ai_members` detail).
  `adapters/members-union.ts` is the
  union seam: `getMembers` is the roster (humans + AIs,
  never `'system'`); `getMemberMap` additionally resolves
  the system member so a system-authored event's author
  has a name; plus `memberName` and `isHumanMember` /
  `isAIMember` / `isSystemMember`. Import the union for
  kind-agnostic display; per-kind modules for status
  mutations and AI model/skill-focus storage.
- **`memberName(memberMap, memberId)`.** Throws on missing
  and unknown ids. Optional member references branch at the
  call site (`row.member_id ? memberName(...) : ''`); do not
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
  `crypto-safe-base62.ts`, etc.) wrap browser primitives
  behind adapters the app owns.
- **`getFlowStats(ctx, flowId)`.** Resolves the work-order
  set via the `flow-work-orders` join table, not via each
  work order's frozen `flow_graph.flowId`. Returns
  `{ model, graph }` so the page derives the canvas viewBox
  from real laid-out coordinates — `getFlowGraph` runs
  `computeLayout` for `is_auto_layout` or degenerate flows.
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

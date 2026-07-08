# Architecture

Vanilla TypeScript with zero runtime dependencies. This
document covers the domain, data, API, presentation, and
convention layers. Storage shapes and state alphabets live
in [SCHEMA.md](SCHEMA.md).

## Domain objects

Domain classes wrap entity + state: `Idea(entity, state)`
and `Project(entity, state)`; the member classes compose
parent + detail rows: `HumanMember(parent, detail, pii,
state)` and `AIMember(parent, detail, state)`. All expose
`stateValue()` — the
lifecycle stage is part of the domain object, not a
separate fetch the presenter has to reconcile. How a state
is displayed (badge label and class) is presentation
vocabulary, owned by the `*_STATE_CONFIG` maps in
`web-app/app/presenters/state-display.ts` and keyed by the
state alphabets in `api/types.ts`. `Idea` additionally
exposes `readinessValue()` and `isReady()` — readiness is
derived from required-field presence on every call.

Readiness is a derived property of the `Idea` domain
object, computed at instantiation from required-field
presence: `title`, `problem_statement`,
`proposed_solution`, `expected_outcome` all non-empty →
`'ready'`; any one empty → `'incomplete'`. Readiness is
not stored in the states log; `Idea.readinessValue()` /
`Idea.isReady()` derive per call.
`canBeSubmittedForReview()` gates on lifecycle
(`active` or `sent_back`) AND `isReady()`.

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

### Flow-graph storage seam

The live flow graph is normalized out of the retired
`flows.graph` JSON blob into four relations: `flow_nodes` +
`flow_edges` (`EntityStore`; removal = a `'deleted'` states-log
event, undo/redo revival = a `'restored'` event that supersedes
the `'deleted'` under the `(at, id)` total order) and
`flow_node_members` + `flow_node_attributes`
(`HistoryEntityStore` append-only ledgers; removal = a new
`'removed'` row; current state via `latestByKey` keeping the
latest `'added'`, same-`at` ties failing closed). The frozen
plane keeps its inlined blob (`flow_versions.graph`,
`work_orders.flow_graph`) — a frozen value is not a live
relationship.

The **route is the single divorce point**. `GET flows/:id` AND
`GET flows` (list) reassemble the graph from relations and
return `FlowWithGraph` (`= FlowEntity & { graph }` — the read
DTO; the stored row carries only scalars). Freeze, work-order
creation, stats, the member-hazard reader, and export all
derive from relations for free because they read through
`ctx.GET`; the client `getFlowGraph` adapter is unchanged. The
WRITE seam carries a client-minted `FlowGraphDelta` (node/edge
upserts by stable id, node/edge `'deleted'` events,
member/attribute `'added'`/`'removed'` ledger events) written
in one tx over the flow tables (Atomicity); ids and `at` are
client-minted (Idempotency), the author server-derived from
the verified token. Undo/redo bodies carry the `graphDelta`
PLUS a sibling `revivals: GraphRevival[]` array; the route
posts each revival as a `'restored'` event (local-revival
design: revivals are undo/redo-specific, not part of the
shared delta).

A node/edge `'deleted'` / `'restored'` states event's
`entity_id` resolves to its flow's org via a node/edge → flow →
`organization_id` two-hop in `ownerOrgOfEntity` (a
tombstone-blind `rawReadRow`), fencing it cross-tenant. The org
fence parent-scopes `flow_nodes` / `flow_edges` through their
flow, and the two ledgers via `flow_node` → `flow` (two hops).

## Records

A Record is a named data shape: name + description +
ordered attributes + per-attribute constraints. A flow
binds to one Record via `flow_records` (one binding per
flow, app-enforced — no UNIQUE index on `flow_id`);
a Record can back many flows. Each per-node attribute
ref (`NodeAttribute`) points at one `record_attributes.id`
and carries a `mode` (`'editable'` or `'readonly'`) and an
`isRequired` flag. Hidden is structural: absence from the
node's `attributes` array.

Six attribute types: `text`, `number`, `select`, `radio`,
`date`, `checkbox`. Three constraint kinds: `regex` (text only),
`range_min` and `range_max` (number or date only). The
applicability rule has two enforcement sites:
`assertConstraintAppliesTo` at the row writer and the
editor filtering the kind picker.

The property-test gate at work-order transitions:
`validateRecordTransition(ctx, workOrderId, targetNodeId,
pendingValues)` walks work order → flow → Record →
attributes; gathers stored values from `state_field_values`;
overlays pending values from the form; runs requiredness
+ `validateAttributeValue`. Returns aggregated
`ConstraintViolation[]`. `postWorkOrderTransition` throws
`RecordTransitionViolations` on non-empty results; the
workbox page module catches the typed error and surfaces
the violations banner.

The pure constraint runner is `record-constraints.ts`
(`validateAttributeValue`, `formatViolation`) — the gate
(`record-transitions.ts`) runs the validation; the workbox
presenter renders violations via `formatViolation`.
Extracted as a pure module so a future editor live preview
and a fuzz runner can share it too.

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

## Auth, Org-scoping & Identity

### Org-scoping at the gate

Every authenticated request runs org-scoped, riding one
request vessel — the server half of the Office of the
Context (`api/request-context.ts`). `handleRequest` mints
`IncomingContext` (requestId, method, pathname, base
adapter; the facade re-entry keeps the outer request's id
via the `x-request-id` header). The authentication step
enriches it to `AuthenticatedContext` (principal), and
`fenceRequest` (`api/request-auth.ts`) completes the
`RequestContext` — organization, live `memberOrgs`, roles,
and the org-scoped adapter — each field set exactly once.
Every handler runs against the vessel's scoped adapter. The
org rides the VERIFIED token claim, never the path; a flat
(un-exchanged) token has none and resolves via
`identityDefaultOrg`: the identity's SET default org
(`identity_default_organizations` ledger, latest wins), else its
PRIMARY membership org, else a 403 — there is no global
default to fall back on. Two covenants bound the vessel:
it never carries the bearer token (authentication reads the
header from the raw Request, so the vessel stays loggable),
and route handlers keep their `(adapter, params, body)`
contract — the route table is the chosen boundary where the
vessel hands its scoped adapter to the handler, keeping
handlers transport-free.

`OrgScopedEntityStore` (`api/store-org-scoped.ts`) is an
`EntityStore` decorator bound to one org: it filters reads,
stamps the org onto writes, and 404s a foreign id — NEVER
403, which would confirm a foreign row exists. The write
fence (`#assertMine`) rejects a write that targets an id
another tenant owns, the write-side twin of the read fence.
`orgScopedAdapter` (`api/db-org-scoped.ts`) fences the
org-owned stores (ideas, projects, flows, work_orders,
records, record_attributes, objectives, role_grants,
memberships) by their stamped org, and the parent-derived
leaves (`flow_versions`, junctions, scores, …) by
`ParentScopedEntityStore` (the append-only states log by its
sibling `ParentScopedStateStore`) — a READ-time server-side
join that resolves each leaf's owning org THROUGH its
already-fenced parent (`api/store-parent-scoped.ts`). Only
the global identity/auth spine and the organizations
directory pass straight through; route guards fence the
directory and the credential/PII reads. The HMAC signing
key is client-shipped, so this is demo-grade isolation
until the server tier.

Leaf isolation is READ derivation, not a WRITE stamp:
`OrgScopedEntityStore` stamps the BOUND org onto each
org-owned parent row on write, but the parent-derived
leaves carry no org column — so `ParentScopedEntityStore`
isolates them on READ, resolving each leaf's org through
its already-fenced parent.

### Multitenancy model

`organizations` is the tenant root; `memberships` (id,
organization_id, identity_id, at) is the identity↔org join.
The members roster is DERIVED from the org-scoped membership
ledger in the `members` route handler — it filters the
global members directory to ids present in `effective
.memberships` (the system member rides along
unconditionally) — so there is no `organization_id` column
on `members` and an org switch re-scopes the roster with no
denormalized column to sync. Per-org roles resolve via
`currentRolesForInOrganization` (`api/authorization.ts`): the latest
action per `(organization_id, identity_id, role)`, fenced to
the request's org.

### Invitation lifecycle and acceptance

A `memberships` row is now born from an INVITATION accept —
the first live membership-write path (the ledger was
seed-only before). `invitations` (id, organization_id,
identity_id, at) is GLOBAL spine, pass-through, NOT
org-fenced: the invitee must read an invitation to an org it
is not yet in, so the row cannot hide behind the org fence.
Its lifecycle is event-sourced in the append-only `states`
log under the alphabet {pending, accepted, declined,
revoked}, keyed to the invitation id; current status is the
LATEST event, derived and never mutated — the row itself
persists as audit through every transition.

Grant (admin) appends `pending`. Accept (invitee) appends
`accepted` AND writes the real `memberships` row in the SAME
atomic ctx-batch, stamped with the INVITATION's org — not the
caller's active org. Acceptance is inherently a cross-org act
(the invitee acts on an org it does not yet belong to), so it
cannot ride the org-stamped write path. Decline (invitee)
appends `declined`; Revoke (admin) appends `revoked`.

The surface is dedicated facade request handlers on the BASE
(un-org-scoped) adapter — like `identityDefaultOrgRequest` —
bypassing the admin-only `ROUTE_POLICY` with explicit guards:
grant/revoke and the sent-list require an admin role in the
relevant org; accept/decline and the invitee read require the
caller to BE the invitee (identity match). That identity
guard is what lets a non-admin invitee accept. The
identity-scoped read (`GET /invitations`) returns the
caller's own invitations plus latest state; the admin read
(`GET /invitations/sent`) returns the active org's pending
invitations. `invitations` joins the states owner-resolver
probe, so an invitation's lifecycle events resolve to the
invitation's org and stay out of every other tenant's
`/states` read.

`memberships` semantics are UNCHANGED: a row still means an
accepted member, and the roster, reachable-orgs enumeration,
and token exchange all read it untouched.

### Facade + enumeration

`/organizations/:org/:entity[/:id]` is a facade:
`facadeRequest` exchanges the caller's bearer for a token
scoped to `:org` (RFC 8693 self-delegation, membership-
fenced — a non-member exchange is a 403 minting nothing),
then re-enters the flat gate with the scoped token so the
existing handler is org-fenced automatically. `GET
/organizations` (`enumerateMyOrgs`) returns the caller's
reachable orgs, derived fresh from the membership ledger
(never the possibly-stale token claim).

### Boot + org-switcher

`core.ts::scopeBootToActiveOrg` always scopes the session
before first render: enumerate reachable orgs →
`resolveActiveOrg` (the persisted `fusion.active-org`, else
the identity's default org if reachable, else the first
reachable) → `postOrgSessionExchange` → install the scoped
token. The
sidebar org-switcher (`web-app/app/org-switcher.ts`) renders
its `<select>` only at ≥2 reachable orgs and re-scopes via a
FULL reload (boot re-exchanges from the persisted id, so no
mixed-org view survives the switch).

### Identity surface

Pages `identities` (list, `inSidebarNav`), `identity-detail`,
`identity-providers`, `identity-tokens` share `sidebarKey:
'identities'`. Adapters (`adapters/identities.ts` etc.):
`getIdentity`, `getIdentityRoster` (single-pass join of
identities + identity_pii + ai_members), `postIdentityCreation` (person →
identity + PII; service → identity + hashed `client_secret`).
The identity stores are the GLOBAL spine — creation is a
client-minted id + idempotent PUT, OFF the org facade.
Presenters mirror the member ones (PII via the `MemberPii`
tagged union, erased fallback at the call site). Erasure
splices `identity_pii` only; the identity, the member, and
every `member_id` reference survive.

## Server-tier deploy blockers

Every item below is INERT today: the whole store is client-side
IndexedDB in the page-runner's own browser, so there is no trust
boundary to cross. Each becomes a live exposure the moment the
backend is physically split out and the browser becomes an
untrusted client — this is the disclosure checklist that gates
that split. Several former entries are now mitigated client-tier
and listed separately below. An audit re-confirms each remaining
seam is still KNOWN (seam flag present, unwidened) and separates
any NEW exposure — see [AUDIT.md](AUDIT.md) § Security: KNOWN
vs NEW.

Remaining seams — no client-tier mitigation exists:

- **Client-shipped HMAC key.** `SIGNING_KEY_MATERIAL`
  (`api/access-token.ts`) is a constant in client JS, so any
  party with the bundle can mint a valid token — forgery is
  trivial. NO client-tier mitigation exists or is possible:
  whatever the browser holds, the browser's user holds. Every
  gate downstream of token verification (org fence, role
  policy, membership liveness) is therefore demo-grade
  isolation until the server tier relocates ONLY the key
  (client constant → server secret/KMS) and who-mints (browser
  → `/authentication/token`); the wire format, alg (HS256),
  and every caller signature stay put.
- **In-band credential reveal.** The mock-data seeder returns
  freshly-minted plaintext credentials in-band for a one-time
  reveal (only PBKDF2 hashes are stored). Demo-only by design;
  the in-band return is deleted at the server tier.
- **client_assertion jti replay.** JWS verification is real
  (below), but no ledger yet remembers a jti as spent, so a
  captured assertion replays until its `exp`. The replay
  ledger lands with the server tier.
- **Auth-free snapshot plane.** `BOOTSTRAP_ROUTES`
  (`api/request-auth.ts`) —
  `snapshots/schema|mock-data|bootstrap|import` — is
  bearer-exempt UNCONDITIONALLY: no bearer, no route policy,
  regardless of whether a schema exists. A deliberate dev-tier
  install/demo decision (the surface is local, ephemeral, and
  slated for removal), so an anonymous wipe/seed/import is
  intended, not a regression — the exemption was widened from
  the old schema-gated window on purpose. This is the LAST
  seam to leave standing: the whole `BOOTSTRAP_ROUTES`
  exemption MUST be removed or re-gated the moment the
  Postgres server tier lands, when the browser becomes an
  untrusted client and an unauthenticated wipe of a populated
  tenant store is catastrophic. Until then it is KNOWN and
  accepted; do not re-raise it.

Mitigated client-tier — the seam is narrowed in this codebase,
re-verified by the automated suite:

- **Token-exchange delegation** (`grantTokenExchange`,
  `api/authentication.ts`): self-delegation ONLY — a
  cross-party exchange (subject ≠ actor) is 403 until a
  delegation ledger exists. The claim shape (`sub`,
  `act.sub`) is frozen.
- **`client_assertion` JWS** (`api/client-assertion.ts`):
  really verified against the client's registered JWKS
  (RS256/ES256, WebCrypto) plus RFC 7523 claim checks.
- **500 fallback body** (`handleRequest`, `api/api.ts`): a
  fixed opaque `internal error` body; fault detail goes to
  the console, never the wire. Through Phase 11 this covered
  only the domain-boundary catch; a thrown pre-dispatch
  ownership-fence read (`fenceRequest` itself, or the
  `states/:id` PUT / field-values ownership guards) still
  propagated unredacted. Phase 12 Task 1 closed that gap: the
  two fence regions now share one redaction catch with the
  same fixed body, so the claim holds everywhere a request can
  fault. `MissingTableError` still re-raises past all three
  catches, recovered by `redirectIfMissingTable`
  (`web-app/app/core.ts`).
- **Route policy tiers** (`ROUTE_POLICY`,
  `api/authorization.ts`): `admin` everywhere plus a real
  `member` tier on the content surfaces; identity, credential,
  membership, and snapshot surfaces stay admin-only,
  deny-by-default.
- **De-membership latency** (`fenceRequest`,
  `api/request-auth.ts`): every fenced request re-derives
  membership from the ledger, so revoking a membership stops
  access on the NEXT request — the token's 15-minute org
  claim no longer rides out its TTL.

## API Layer (`/api`)

`api/` is the server tier — the REST/DB-schema request
handlers, currently running in-browser. Code that crosses the
client/server chasm lives one level out in `shared/` (a sibling
of `api/` and `web-app/`): the HTTP wire schema (`http-message/`,
its own `types.ts`) plus pure cross-chasm utilities
(`base64url.ts`, `crypto-safe-base62.ts`, `password-hash.ts`,
`ledger-reduction.ts`, `error-helpers.ts`). Both `api/` and
`web-app/` import `shared/`; `shared/` NEVER imports `api/`.

`api/types.ts` (row types + shared aliases — `MemberId`,
`MemberEntity` parent + `Member` union (`HumanMember` /
`AIMember` / `SystemMember`),
`GraphNode.memberIds: MemberId[]`,
`GraphNode.attributes: NodeAttribute[]`, `RecordEntity` /
`RecordAttributeEntity` / `FlowRecordEntity`, `Constraint`
discriminated union, `StateEntity`, the seven state
alphabets, and `SYSTEM_MEMBER_ID`), `api/db.ts`
(`DbAdapter` interface + `TABLE_NAMES` array listing every
storage table — the entity tables plus the identity/auth
spine (`identities`, `identity_pii`, `identity_credentials`,
`identity_tokens`, `clients`, `identity_providers`,
`authorization_codes`, `role_grants`, …) and the tenancy
stores (`organizations`, `memberships`); [SCHEMA.md](SCHEMA.md)
is the authoritative list and per-column reference),
`api/store-state.ts` (the `StateStore` class — `postEvent`,
`getCurrentFor`, `getAllFor`, `getDeletedIds`, `isDeleted`),
`api/store-entity.ts` (`EntityStore` — consults `StateStore`
for delete filtering), `api/db-indexeddb.ts` (production
persistence tier), `api/db-localstorage.ts` (demo tier),
`api/db-memory.ts` (test impl), `api/api.ts` (the HTTP
gate — `handleRequest` plus the `GET/PUT/DELETE/POST`
helpers, **no module-level adapter; threaded
explicitly**), `api/routes.ts` (the route table — entity
routes plus the state routes for the unified states log),
`api/mock-data.ts` (seeds parent `members` rows plus
`human_members` / `ai_members` detail — the `'system'`
member plus the human and AI rosters), `api/validators.ts`
(`validateMemberEntity` /
`validateHumanMemberEntity` / `validateAIMemberEntity` /
`validateStateEntity`, where the AI validator verifies
`model` is a known catalog id). The `DbAdapter`
interface is the migration seam to Postgres.

`web-app/app/adapters/init.ts` wires the production IndexedDB
adapter singleton (`initAdapter()` / `getDbAdapter()`); the
IDB connection opens in `initialize()`, which boot awaits.
`web-app/app/adapters/shared.ts` defines the `RequestContext`
interface and `createRequestContext(adapter, token)` — both
args are required; `sessionContext()` is the no-arg
convenience that defaults to the singleton adapter and
session token. Tests pass `createRequestContext` a
`MemoryDbAdapter`.

`api/routes.ts` defines four state-route patterns covering
five HTTP operations — `GET/PUT states/:id`, `GET states`,
`GET entity-states/:id` (current), and
`GET entity-states/:id/history` (ordered). The two CONSUMED
reads derive from the message ledger (Phase 11 Task 7):
`GET states` → `deriveStates(db, organization)` and
`GET entity-states/:id/history` →
`deriveStatesFor(db, organization, entityId)`
(`api/derive-states.ts`, a six-source union fenced from the
pair plane). The two zero-caller reads (`GET states/:id` by
event id, `GET entity-states/:id` current) still dispatch to
the store methods (`getById`, `getCurrentFor`) and flip at
Phase Final; `PUT states/:id` still appends through `put`,
gated by the ownership fence.
When no schema exists, non-entry pages redirect to snapshots.

## Storage tiers

`StorageBackend` (`api/db.ts`) is the byte-level seam:
`transaction(tables, mode, fn)` is the primitive every row op
crosses, and `ensureTables` / `hasSchema` /
`postSchemaCreation` / `deleteSchema` are schema lifecycle.
Stores own semantics (tombstones, splices, singletons);
backends own persistence
and encoding. `BackedDbAdapter` (`api/db-backed.ts`) composes
one backend into the full `DbStores` bundle.

Three backends implement the seam:

- `backend-indexeddb.ts` — the production tier, wired by
  `db-indexeddb.ts`. It is the ONLY file that names
  `indexedDB.*` (the divorce point). `transaction` runs a real
  `IDBTransaction` that commits on `oncomplete` and aborts on a
  thrown body, so a batch applies whole or not at all; schema
  presence is a `__schema__` marker store.
- `backend-localstorage.ts` — the demo tier, wired by
  `db-localstorage.ts`. It SIMULATES the transaction via
  `backend-buffer-tx.ts` (buffer touched tables, flush on
  success, discard on throw); schema presence is table
  existence.
- `backend-memory.ts` — the test tier, wired by `db-memory.ts`,
  simulating the same buffer transaction in process.

The simulated tiers share the buffer-then-flush helper so the
test backend cannot lie about what the production gate
enforces. The one property only IndexedDB provides is OS-atomic
multi-key commit — see the snapshot-import note in CLAUDE.md.

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
`'../app/presenters/index.ts'`. `WorkboxDetailPresenter` uses a public
`buildPage()` orchestrating private `#build*` helpers; the rest
expose `build*` directly.

`FlowStatsPresenter` (`web-app/app/presenters/flow-stats.ts`) is
the read-only counterpart to `FlowDesignerPresenter`. It exposes
pure `build*` helpers (`buildShell`, `buildStepperBar`,
`buildLegend`, `buildCard`) returning `SafeHtml` for testability,
plus DOM-touching `renderShell` / `renderUpdate` / `renderCard`.
It is flow-name-agnostic by design — the page module writes the
flow name into the header after `renderShell`,
keeping the presenter's `buildShell` / `renderShell` output
independent of presentation strings.

## Import Conventions

Page modules import directly from source modules, not through a barrel:

```typescript
import { $ } from '../app/dom.ts';
import { html, setHtml } from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import { buildSkeleton, buildErrorState } from '../app/loading-states.ts';
import { iconPlus, iconTrash } from '../app/icons.ts';
import { navigateTo, openDialog, closeDialog } from '../app/core.ts';
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
- Adapter reads are two-tier, named by what they return:
  the **domain noun** read returns the domain object
  (`getProject` → `Project`); where a raw stored-shape read
  also exists it carries the **Entity** suffix
  (`getProjectEntity` → `ProjectEntity`). Never table
  vocabulary (`Row`/`Rows`).

## Adapter Conventions

- **Member domain split.** Members are one parent table
  (`members`: id, type) plus per-kind detail tables
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
  Each verb dispatches its own request with its own per-op
  transactions: two awaited reads on one ctx are NOT a
  snapshot — a write (same tab or cross-tab) can land
  between them.
- **Platform-shim vs data-access adapters share `adapters/`.**
  Data-access adapters (`ideas.ts`, `flow-queries.ts`, etc.)
  fetch entity data through `ctx`. Platform shims
  (`clipboard.ts`, `viewport.ts`, `location.ts`, etc.)
  wrap browser primitives behind adapters the app owns.
- **`getFlowStats(ctx, flowId)`.** Resolves the work-order
  set via the `flow_work_orders` join table (its `flow_id`
  column), since the frozen `flow_graph` carries no flow id
  of its own. Returns `{ model, graph }` so the page derives
  the canvas viewBox from real laid-out coordinates —
  `getFlowGraph` runs `computeLayout` for `is_auto_layout`
  or degenerate flows.
- **Mutation adapters return `Promise<void>`.**
  Change-awareness flows through notification channels (e.g.,
  `ideaChanges.notify()`), never through return values —
  callers tell the channel rather than branch on a result.
- **Records adapters.** `adapters/records.ts` owns Record
  lifecycle (CRUD + `postRecordStateChange`).
  `adapters/record-attributes.ts` exposes
  `getRecordAttributesByRecord`, sort-ordered.
  `adapters/flow-records.ts` is the binding seam
  (`getRecordForFlow`, `getFlowSummariesForRecord`,
  `getWorkOrdersForRecord`).
  `adapters/record-transitions.ts` orchestrates the
  property-test gate via `validateRecordTransition`;
  `postWorkOrderTransition`
  (`adapters/work-orders-mutations.ts`) runs that gate and
  throws `RecordTransitionViolations` on a non-empty result.

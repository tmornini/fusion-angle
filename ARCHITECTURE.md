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

## Auth, Org-scoping & Identity

### Org-scoping at the gate

Every authenticated request runs org-scoped. After
`matchRoute` and the Bearer/role checks, `handleRequest`
resolves `org = authResult.organization ??
identityDefaultOrg(adapter, authResult.id)`, 403s a null
org, then sets `effective = orgScopedAdapter(adapter, org)`
and every handler runs against `effective`. The org rides
the VERIFIED token claim, never the path; a flat
(un-exchanged) token has none and resolves via
`identityDefaultOrg`: the identity's SET default org
(`identity_default_orgs` ledger, latest wins), else its
PRIMARY membership org, else a 403 — there is no global
default to fall back on.

`OrgScopedEntityStore` (`api/store-org-scoped.ts`) is an
`EntityStore` decorator bound to one org: it filters reads,
stamps the org onto writes, and 404s a foreign id — NEVER
403, which would confirm a foreign row exists. The write
fence (`#assertWritable`) rejects a write that targets an id
another tenant owns, the write-side twin of the read fence.
`orgScopedAdapter` (`api/db-org-scoped.ts`) fences the
org-owned stores (ideas, projects, flows, work_orders,
records, record_attributes, objectives, role_grants,
memberships) by their stamped org, and the parent-derived
leaves (`flow_versions`, junctions, scores, the states log,
…) by `ParentScopedEntityStore` — a READ-time server-side
join that resolves each leaf's owning org THROUGH its
already-fenced parent (`api/store-parent-scoped.ts`). Only
the global identity/auth spine and the organizations
directory pass straight through; route guards fence the
directory and the credential/PII reads. The HMAC signing
key is client-shipped, so this is demo-grade isolation
until the server tier.

Derive-from-parent is WRITE stamping, not READ isolation:
`OrgScopedEntityStore` stamps the parent's org on write, but
that stamp alone does not isolate reads of the leaves that
derive their org from it — `ParentScopedEntityStore` runs
that derivation on READ. The two are distinct mechanisms.

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
`currentRolesForInOrg` (`api/authorization.ts`): the latest
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
header org-switcher (`web-app/app/org-switcher.ts`) renders
its `<select>` only at ≥2 reachable orgs and re-scopes via a
FULL reload (boot re-exchanges from the persisted id, so no
mixed-org view survives the switch).

### Identity surface

Pages `identities` (list, `inSidebarNav`), `identity-detail`,
`identity-providers`, `identity-tokens` share `sidebarKey:
'identities'`. Adapters (`adapters/identities.ts` etc.):
`getIdentities`, `getIdentityRoster` (single-pass join of
identities + identity_pii), `postIdentityCreation` (person →
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
- **Snapshot plane** (`BOOTSTRAP_ROUTES`, `api/api.ts`):
  bearer-exempt ONLY while no schema exists (the bootstrap
  window); once a schema exists the plane closes — bearer
  plus the admin route policy.
- **500 fallback body** (`handleRequest`, `api/api.ts`): a
  fixed opaque `internal error` body; fault detail goes to
  the console, never the wire.
- **Route policy tiers** (`ROUTE_POLICY`,
  `api/authorization.ts`): `admin` everywhere plus a real
  `member` tier on the content surfaces; identity, credential,
  membership, and snapshot surfaces stay admin-only,
  deny-by-default.
- **De-membership latency** (`handleRequest`): every fenced
  request re-derives membership from the ledger, so revoking a
  membership stops access on the NEXT request — the token's
  15-minute org claim no longer rides out its TTL.

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
storage table — the entity tables plus the identity/auth
spine (`identities`, `identity_pii`, `identity_credentials`,
`identity_tokens`, `clients`, `identity_providers`,
`authorization_codes`, `role_grants`, …) and the tenancy
stores (`organizations`, `memberships`); [SCHEMA.md](SCHEMA.md)
is the authoritative list and per-column reference),
`api/store-state.ts` (the `StateStore` class — `record`,
`currentFor`, `allFor`, `deletedIds`, `isDeleted`),
`api/store-entity.ts` (`EntityStore` — consults `StateStore`
for delete filtering), `api/db-indexeddb.ts` (production
persistence tier), `api/db-localstorage.ts` (demo tier),
`api/db-memory.ts` (test impl), `api/api.ts` (pure
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

`web-app/app/adapters/init.ts` wires the production IndexedDB
adapter singleton (`initAdapter()` / `getDbAdapter()`); the
IDB connection opens in `initialize()`, which boot awaits.
`web-app/app/adapters/shared.ts` defines the `RequestContext`
interface and `createRequestContext(adapter, token)` — both
args are required; `sessionContext()` is the no-arg
convenience that defaults to the singleton adapter and
session token. Tests pass `createRequestContext` a
`MemoryDbAdapter`.

`api/api.ts` defines four state-route patterns covering
five HTTP operations — `GET/PUT states/:id`, `GET states`,
`GET entity-states/:id` (current), and
`GET entity-states/:id/history` (ordered) — each dispatching
to a `StateStore` method (`record`, `currentFor`, `allFor`).
When no schema exists, non-entry pages redirect to snapshots.

## Storage tiers

`StorageBackend` (`api/db.ts`) is the byte-level seam:
`transaction(tables, mode, fn)` is the primitive every row op
crosses, and `ensureTables` / `hasSchema` / `createSchema` /
`deleteSchema` are schema lifecycle. Stores own semantics
(tombstones, splices, singletons); backends own persistence
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

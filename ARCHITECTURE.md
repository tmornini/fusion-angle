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
`RequestContext` — organization, live
`memberOrganizations`, roles, and the org-scoped adapter —
each field set exactly once. Every handler runs against the
vessel's scoped adapter. The org rides the VERIFIED token
claim, never the path; a flat (un-exchanged) token has none
and resolves via `identityDefaultOrganization`: the
identity's SET default org (`identity_default_organizations`
ledger, latest wins), else its PRIMARY membership org, else a
403 — there is no global default to fall back on. Both
`memberOrganizations` (`callerOrganizationIds` →
`deriveMembershipsForIdentity`, Phase 13 Task 3) and `roles`
(`callerRolesInOrganization` → `deriveRoleGrants`, same
phase) derive FRESH from the pair plane on EVERY fenced
request — never a snapshot the token claim carries — so a
revoked membership or role stops access on the identity's
very next request, not when the token expires. Two covenants
bound the vessel: it never carries the bearer token
(authentication reads the header from the raw Request, so
the vessel stays loggable), and route handlers keep their
`(adapter, params, body)` contract — the route table is the
chosen boundary where the vessel hands its scoped adapter to
the handler, keeping handlers transport-free.

`OrganizationScopedEntityStore`
(`api/store-organization-scoped.ts`) is an `EntityStore`
decorator bound to one org: it filters reads, stamps the org
onto writes, and 404s a foreign id — NEVER 403, which would
confirm a foreign row exists. The write fence (`#assertMine`)
rejects a write that targets an id another tenant owns, the
write-side twin of the read fence. `organizationScopedAdapter`
(`api/db-organization-scoped.ts`) fences the org-owned stores
(ideas, projects, flows, work_orders, records,
record_attributes, objectives, role_grants, memberships) by
their stamped org, and the parent-derived leaves
(`flow_versions`, junctions, scores, …) by
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
`OrganizationScopedEntityStore` stamps the BOUND org onto
each org-owned parent row on write, but the parent-derived
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
(un-org-scoped) adapter — like
`identityDefaultOrganizationRequest` — bypassing the
admin-only `ROUTE_POLICY` with explicit guards:
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
/organizations` (`enumerateMyOrganizations`) returns the
caller's reachable orgs, derived fresh from the membership
ledger (never the possibly-stale token claim).

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
`clients`, `identity_providers`, `role_grants`, …) and the
tenancy stores (`organizations`, `memberships`);
[SCHEMA.md](SCHEMA.md)
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

Phase 13 Task 9 retired `identity_tokens` and
`authorization_codes` from `TABLE_NAMES` — token issue,
rotation, and revocation live only as message-pair events now
(`requests`/`responses`), never a dedicated row store.
IndexedDB's own open is UNVERSIONED, so an origin that already
has a database never re-runs `onupgradeneeded` (the only place
object stores are created): an EXISTING origin keeps the two
dropped stores as harmless, unread orphans; only `deleteSchema`
(a full database delete) clears them.

`web-app/app/adapters/init.ts` wires the production IndexedDB
adapter singleton (`initAdapter()` / `getDbAdapter()`); the
IDB connection opens in `initialize()`, which boot awaits.
`web-app/app/adapters/shared.ts` defines the `RequestContext`
interface and `createRequestContext(adapter, token)` — both
args are required; `sessionContext()` is the no-arg
convenience that defaults to the singleton adapter and
session token. Tests pass `createRequestContext` a
`MemoryDbAdapter`.

`api/routes.ts` covers the surviving state-route surface:
`GET states`, `PUT states/:id`,
`GET entity-states/:id/history`, and
`GET states/:id/field-values`. The CONSUMED reads derive from
the message ledger (Phase 11 Task 7 + Phase 14 Task 6):
`GET states` → `deriveStates(db, organization)`,
`GET entity-states/:id/history` →
`deriveStatesFor(db, organization, entityId)`, and
`GET states/:id/field-values` →
`stateFieldValuesForStateEvent` (two-source union, visibility
via `stateEventVisibilityFor`). Four zero-caller families
retired at Phase 15 Task 7 (router 404 except bare
`GET states/:id` → **405** because `PUT` survives):
`GET states/:id`, `GET entity-states/:id` (current),
`PUT|DELETE states/:id/field-values/:fvid`, and
`GET|POST|PUT|DELETE flows/:id/versions[...]`.
`PUT states/:id` still appends through `put`, gated by the
pair-plane ownership fence (`resolveOwningOrganization`).
When no schema exists, non-entry pages redirect to snapshots.

## Write-path derives (Phase 14)

### The view-accepting convention, generalized

Several write-path decision reads — "what is the CURRENT
state before I write?" — derive from the pair plane
(`requests`/`responses`) rather than a table read, so a gate
never trusts a stale row-plane snapshot the ledger has
already superseded. Earlier phases established the shape for
invitations, memberships, and identity tokens; Phase 14
GENERALIZED it to invitation lifecycle state, work-order
claim history, the member_id-echo head-reads, and
`state_field_values` (SFV).

The convention is small helpers, not a framework — no
`ViewAwareDerive` class: (a) every core takes `dbOrView:
DbAdapter`, the SAME type an open transaction's `view`
satisfies, so a core is callable both pre-tx (passed `db`)
and from WITHIN an already-open write-gate transaction
(passed `view`); (b) a core never opens its OWN nested
transaction (see below); (c) a core reads only the stores
its caller already listed in its own `transaction(...)`
call, never widening the caller's table set on its own
authority; (d) every write-gate read is ENTITY-SCOPED —
indexed or prefix reads (`getAllWhere('uri_id', ...)`,
`getAllWhere('uri_prefix', ...)`), never a whole-plane
`getAll()` of `requests`/`responses` on a hot path (the one
named exception is below); (e) a pre-tx call and an in-tx
call of the same core return byte-identical results, pinned
by drift/parity tests.

New Phase 14 cores riding this shape: `invitationOpStateFor`
+ `invitationLifecycleStatesFor` (`derive-invitations.ts` /
`derive-states.ts`, entity-scoped siblings of the
whole-ledger `invitationOpStates`/`deriveStatesFor`, wired
into `pendingInvitationFor`/`currentInvitationState`);
`workOrderClaimHistoryFor` (`derive-states.ts`, pair-plane
claim history — op pairs ∪ `states/:id` event-append pairs,
disjoint by id, no dedup needed); `documentStateHeadFor`
(`derive-states.ts`, the one helper behind all four
member_id-echo head-reads); and `stateFieldValuesFrom` /
`deriveStateFieldValueReferrers` /
`stateFieldValuesForStateEvent` (`derive-state-field-
values.ts`, a TWO-SOURCE UNION — transition-pair-folded
field values ∪ standalone leaf-PUT/DELETE pairs, head-reduced
by the shared `(at, id)` order — backing both the
`record-attributes` RESTRICT gate and `GET
states/:id/field-values`).

### Nested-transaction re-entry

`api/db.ts`'s `DbAdapter.transaction` documents nested
re-entry as a LEGAL subset case: "a nested view.transaction
re-enters this same tx; its tables must be a subset of the
outer set" — the same open `IDBTransaction` is reused, not a
second transaction opened inside the first (which IndexedDB
forbids outright). The write-path convention still FORBIDS a
derive core from opening one on its own initiative (rule (b)
above): every derive is written to accept whichever view its
caller already holds, so nesting is never needed to reach the
open tx, and a caller's own table list stays the single,
auditable source of truth for what one transaction touches.

### LedgerImmutabilityError vs. the document-plane 412

Two DIFFERENT conflict mechanisms coexist, and Phase 14 did
not merge or replace either. The DOCUMENT plane — every
`flows/:id`-shaped save, including undo's own restore write —
detects a stale basis via the `responses.follows` unique
index: a racing write against the same head throws
`UniqueConstraintError`, mapped to HTTP 412 by
`handleRequest`, and the caller retries with a fresh basis.
The STATE plane (`states.postEvent`, the table-backed
event-append the states log still uses) detects a genuinely
different re-put of an existing event id via
`LedgerImmutabilityError`, mapped to HTTP 409 — an identical
resend still converges silently, the idempotent retry the
id-keyed PUT exists for. Phase 15 Task 6 adds a pair-plane
strangler beside the row half: `stateEventCollisionFromPairs`
REDUCES over ALL 2xx pairs at the event-append address
("at most one 2xx pair" is FALSE — a different-envelope
resend appends a second pair while the row write no-ops).
Both planes must agree when both hold an opinion; Final
strips the row half.

### SIDECAR-KEEP and undo-as-replay

Flow undo (`POST /flows/:id/undo`) resolves its restore
target SERVER-SIDE, pre-tx, by replaying this flow's own
`flows/:id` document-pair history against its own
`flows/:id/undo` OPERATION-pair history — a stack+pointer
replay, not a naive "N pairs back" count, since a genuine
save after an undo truncates the abandoned branch rather
than oscillating back into it. The cursor correlates by the
STORED REQUEST `at` (never the response `at`, independently
minted per pair) against the undo address's own
operation-pair `at` values. `graphDelta`/`revivals` still
land in the restore's own document-pair body feeding
`deriveFlowGraphStates`, exactly like an ordinary save's —
SIDECAR-KEEP names this MECHANISM persisting even though the
VALUES are now SERVER-computed rather than client-supplied
(the client cannot diff against a target it is never told;
no new GET route is sanctioned for this). `hasUndoHistory`
rides the flow's own `GET` response (a document-pair-count
signal, zero marginal reads) rather than a `flow_versions`
row count. `flow_versions` consume (undo) and publish (every
content edit, redo's archive) both STOPPED on the live path
at Phase 14; Phase 15 Task 7 RETIRED the routes and adapters
(router 404). The `flow_versions` TABLE remains
(`DELETE NOTHING`) until Phase Final deletes it with the
rest of the row plane.

### Three named deviations

Phase 14 recorded three deviations from its own plan rather
than silently reaching for a workaround:

1. **SFV RESTRICT whole-plane scan** (Task 6).
   `deriveStateFieldValueReferrers` reads
   `view.requests.getAll()`/`view.responses.getAll()` inside
   the RESTRICT write gate — a whole-plane scan rule (d)
   above otherwise forbids. No `attribute_id` index exists on
   the pair plane; the leaf family has no cheaper entity-id
   source, and the one candidate for the transition family
   (`view.workOrders.getAll()`) was REJECTED because
   `EntityStore.getAll()`'s own deleted-row filter would
   silently exclude a since-deleted work order's field-value
   history — a NEW wire delta, not a safe optimization.
   (Carried into Phase Final's residual worklist.)
2. **Region B / `rawHasRow` pair-plane re-anchor** (Task 7).
   A field value's parent state event resolves via the pair
   plane ONLY for event-append-born parents (`states/:id`
   PUT). Op-born parents (transition/claim/document-trio)
   have no pair at the event's own id. Phase 15 RETIRED the
   leaf PUT/DELETE routes (and their Region B fence arm);
   the surviving GET field-values collection re-anchors
   visibility onto `stateEventVisibilityFor` (3-tier; see
   Phase 15 below). Residual dual-write SFV writers still
   construct the scoped store — Final-only.
3. **Server-computed undo sidecars** (Task 8). "Client-owned
   graphDelta/revivals," read literally, is impossible under
   the server-side restore-resolution default: the client is
   never told the target it would need to diff against.
   Elected reading: "client-owned" names the WIRE SHAPE
   (every document pair, including undo's, carries these
   fields), not literally who computes the values — the
   SERVER now does, reusing the exact diff semantics
   `web-app/app/adapters/flow-mutations.ts` uses for an
   ordinary save, duplicated (not imported, per the `api/` →
   `web-app/` layering rule) into `api/flow-graph-diff.ts`.

### Flow tags: the first pair-plane-only document family

`flows/:id/tags/:name` (PUT/GET/DELETE, SIMPLE class) is the
first document family with NO backing table at all —
`postFlowTagDocumentOp`'s transaction touches only
`requests`/`responses`. A tag pins one flow document pair's
response id (`flow_response_id`, the tag's only body field);
GET replays the tag's own stored body, so a tag's pin
survives every later save of the flow it names. DELETE is a
marked tombstone (a `deriveDocumentsAt`-excluded head), never
a row splice — there is no row to splice. Registered in
`PAIR_WIRED_ROUTE_PATTERNS`; the locked write-class is
structurally MOOT for this address (`isLockedWrite`
exact-matches `family/:id`, never a 4-segment tag address).
No UI landed this phase (see [TEST-PLAN.md](TEST-PLAN.md));
the API surface is the sole coverage.

## Last readers (Phase 15)

Phase 15 re-anchored every remaining production decision
read of a delete-candidate table onto the pair plane and
retired four zero-caller route families. DELETE NOTHING —
tables, dual-writes, and seed row halves stay until Final.
Zero seed deltas (EXPECTED_PAIR_COUNT 1513 / bootstrap 14;
SNAPSHOT_SCHEMA_VERSION stays 2; simulateLatency 4;
fingerprints absolute).

### Wire covenant (only these deltas)

1. **Route retirements** → router 404, except bare
   `GET states/:id` → **405** (PUT survives on that
   pattern). Retired: `GET states/:id`,
   `GET entity-states/:id` (current),
   `PUT|DELETE states/:id/field-values/:fvid`,
   `GET|POST|PUT|DELETE flows/:id/versions[...]`.
2. **Fence strengthenings** (same 404 body shape):
   (2a) WP1 — forged `PUT states/:id` naming an
   organization id as `entity_id` now 404s (organizations
   self-as-owner leg); foreign orgs no longer see the
   forged row on derived reads. (2b) records hard-delete
   forgery closed — a hard-spliced record's orphaned
   genesis event no longer admits a foreign forge as an
   "orphan" (pair plane still resolves the true owner).
3. **Write-path re-anchors** (claim graph, RESTRICT legs,
   invitation discovery, identity_pii, clients re-home,
   PUT immutability strangler): intended byte identity.
4. **Dangling `state_event_id`** on transition-fold field
   values → 400 at the gate (forged clients only; shipped
   UI always mints the transaction's own id).

### Successor derives

All view-accepting (`dbOrView`), entity-scoped where the
address family allows, opening no nested transaction:

- `workOrderDocumentHeadFor` — claim-gate `flow_graph` head
  (successor of `workOrders.getById`).
- `stateEventVisibilityFor` — 3-tier field-values fence:
  (i) uri_id point-read (event-append), (ii) own-org
  op-born scan, (iii) widen-on-miss foreign vs nowhere.
  Disposition: `orphan` | `visible` | `hidden`.
- `resolveOwningOrganization` — pre-dispatch ownership for
  `PUT states/:id` and `GET entity-states/:id/history`.
  Legs: org-nested documents, invitations, memberships,
  flow-graph history (full graphDelta walk), plus
  **organizations self-as-owner** (the one new leg). Soft-
  deleted and hard-spliced parents still resolve.
- `flowGraphBindingsFromPairs` — RESTRICT graph legs from
  graphDelta attribute/member events + current node→flow
  map (soft-delete drops); never the client-authored
  document `graph` snapshot.
- `stateEventCollisionFromPairs` — pair-plane twin of
  `sameEvent`; strangler with the still-live row half.

### Gate 6 re-homes (AS-IS elections)

- Invitation grant email → `deriveIdentityPiiRows`.
- `pendingInvitationFor` / `loadInvitation` →
  `deriveInvitations` (no live invitations-table decision
  read).
- Client credentials → `rawReadRow('clients', …)` (clients
  never soft-delete; tombstone filter was a no-op).
  **clients** and **identity_providers** stay AS-IS tables.
  Follow-on note: client = kind-`'service'` identity +
  registration facet is a server-tier client-registration
  phase candidate (would retire the standalone clients
  noun; sub vs acting client moves to token claims).

### Addressability election

MEASURE-AND-ACCEPT. Claim/echo history derive remains
~7.8ms absolute at seed scale (under ~17ms = 1/4 hop
re-election trigger; under ~68ms simulated hop). Re-elect
if claim/echo exceeds ~17ms at a growth checkpoint —
then open a named entity_id index phase. No IndexedDB
migration this phase. Fence miss/orphan ~1.91ms mean at
2-org seed (under the Phase 13 3.43ms fence baseline).

### Exit residual (Phase Final's charter)

Only dual-write mechanics still read the old plane for
decision/control: `StateStore.put` sameEvent row half,
`EntityStore` tombstone filter on surviving dual-write-era
reads, dual-write writers themselves, seed row halves,
snapshot get/put over `TABLE_NAMES`, scoped-store write
residuals (`#assertMine`, SFV parent resolve via raw
probes for dual-write puts). Finding-1 production decision
reads are re-anchored or their routes retired.

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

# Architecture

Vanilla TypeScript. One ZIP: `fusion-ai-server-${SHA}.zip`.
postgres.js 3.4.9 is bundled behind
`api/postgres-client.ts` only (named exception). The
client is a fetch facade (`web-app/app/server-core.ts`).
The process is `server/boot.ts` / `server.mjs`. This
document covers the domain, data, API, presentation, and
convention layers. Storage shapes and state alphabets
live in [SCHEMA.md](SCHEMA.md).

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

The live flow graph is **pair-plane only**. The retired
four-relation row plane (`flow_nodes`, `flow_edges`,
`flow_node_members`, `flow_node_attributes`) and the
`flow_versions` table are GONE (Phase Final). Graph truth
rides the flow document pair body as native nested JSON:
the head `graph` object (nodes/edges in the stored
tongue), plus write-side `graphDelta` (node/edge upserts
by stable id, node/edge `'deleted'` events,
member/attribute `'added'`/`'removed'` ledger events) and
`revivals` (undo restore). Live GET serves
`FlowWithGraph.graph` from the document body's `graph`
field; `graphDelta` / `revivals` remain write-side
sidecars (SIDECAR-KEEP) for undo restore and RESTRICT
bindings (`flowGraphBindingsFromPairs`). A work order
freezes its own `flow_graph` as the same native shape
plus `name` / `lockTimeout` inside the work-order
document pair at creation — a frozen value, not a live
relationship.

The **route is the single divorce point**.
`GET /api/organizations/:id/flows/:id` AND
`GET /api/organizations/:id/flows/` (list) reassemble
`FlowWithGraph` from the pair plane
(`= FlowEntity & { graph; hasUndoHistory }` — the
read DTO).
Freeze, work-order creation, stats, the member-hazard
reader, and export all derive for free because they read
through `ctx.GET`; the client `getFlowGraph` adapter is
unchanged. Writes append pairs only (`tx`
`['requests','responses']`); ids and `at` are client-minted
(Idempotency), the author server-derived from the verified
token. Undo resolves its restore target SERVER-SIDE
(stack+pointer over this flow's document-pair history vs
its undo operation-pair history) and lands a restore
document pair with SERVER-computed `graphDelta`/`revivals`.

Cross-tenant fencing of graph history walks the pair plane
(`resolveOwningOrganization` flow-graph leg + the
write authorizer for org-scoped PUT/DELETE).

## Records

Vocabulary split (org-nested record-types wave):

- **Record type** — wire `record-types`, storage
  `record_types`. Schema: name + description + ordered
  attributes + constraints.
- **Attribute** — nested `.../attributes`. Field + ACL
  (`read_roles` / `write_roles`).
- **Instance** — nested `.../instances`. Data row:
  full-state `{ values }` head.

A flow binds to one record type via `flows/:id/records`
(one binding per flow, app-enforced — no UNIQUE index on
`flow_id`); a type can back many flows. Each per-node
attribute ref (`NodeAttribute`) points at one nested
attribute id and carries a `mode` (`'editable'` or
`'readonly'`) and an `isRequired` flag. Hidden is
structural: absence from the node's `attributes` array.

Six attribute types: `text`, `number`, `select`, `radio`,
`date`, `checkbox`. Three constraint kinds: `regex` (text
only), `range_min` and `range_max` (number or date only).
Applicability has two enforcement sites:
`assertConstraintAppliesTo` at the writer and the editor
filtering the kind picker. Server value validation on
instance PUT/PATCH shares the constraint engine
(`api/` — not `shared/`).

Wire = storage at
`/organizations/:organization-id/record-types/`
plus nested
`/:record-type-id/{attributes,instances}/...`.
Flat `/records` and `/record-attributes` are RETIRED.
Schema: member READ / admin MUTATION (SIMPLE PUT class).
Instances: member path-tier + per-attribute ACL; public
PUT is **405**; PATCH creates and updates (If-Match
428 / 412); DELETE tombstone-wins. See API.md §2.8 /
§5.4.1 / §5.20.

The property-test gate at work-order transitions:
`validateRecordTransition(ctx, workOrderId, pendingValues,
storedValues)` resolves the work order's CURRENT node from
the history fold (`getWorkOrderHistory` →
`currentNodeIdFromHistory`), walks that node's attribute
refs → type attributes, takes stored values from the bound
instance head (`instance.values`, or `null` when unbound),
overlays pending values from the form, and runs
requiredness + `validateAttributeValue`. The gate matches
the workbox action screen (current-node fields only).
Returns aggregated `ConstraintViolation[]`.
`postWorkOrderTransition` throws
`RecordTransitionViolations` on non-empty results; the
workbox page module catches the typed error and surfaces
the violations banner.

The pure constraint runner is `record-constraints.ts`
(`validateAttributeValue`, `formatViolation`) — the gate
(`record-transitions.ts`) runs the validation; the workbox
presenter renders violations via `formatViolation`.

A work order's frozen `flow_graph` references attribute
ids directly. If an attribute is deleted while a flow
that targets it is in flight, the gate throws
`node X references unknown attribute Y` rather than
silently coercing — versioned type snapshots arrive in a
future iteration. Attribute DELETE RESTRICT also blocks
on live instance heads carrying a value for that
attribute.

User-facing UI still says **Record** for the type
(sidebar, page titles) while the wire says
`record-types`. Instance UI is the minimal surface on
record detail (create / edit / delete + 412 recovery).
The storage term `entity` never appears in user-facing
strings.

## Auth, Org-scoping & Identity

### Org-scoping at the gate (pair-plane first)

Every authenticated request runs org-scoped, riding one
request vessel — the server half of the Office of the
Context (`api/request-context.ts`). `handleRequest` mints
`IncomingContext` (requestId, method, pathname, **base**
adapter). The authentication step
enriches it to `AuthenticatedContext` (principal), and
`fenceRequest` (`api/request-auth.ts`) completes the
`RequestContext` — organization, live
`memberOrganizations`, and roles — each field set exactly
once. There is **no org-scoped adapter wrapper**: the
message plane (`requests`, `responses`) is global; tenancy
rides `uri_collection` on the pair plane. Handlers receive
`ctx.base`. The org rides the VERIFIED token claim,
never the path; a flat (un-exchanged) token has none and
resolves via `identityDefaultOrganization`: the identity's
SET default organization (pair-plane
`/identities/:id/default-organization` document) if that
organization is a live seat, else PRIMARY (earliest
remaining join `at`, lex id on tie), else a 403 — there
is no global default to fall back on. Both
`memberOrganizations` and `roles` come from access-token
claims (organizations set + `{type}:{organization_id}`
roles baked at every mint/refresh/exchange from membership
`type`). The gate projects claim roles for the FENCED org
and checks membership against the claim set — no identity-
spine reads (memberships / roles / revocation) on the
per-request path. Ownership fences still read the pair
plane. NAMED COVENANT: de-membership, demotion, and
logout-everywhere bite at the next mint/refresh/exchange
or access-token expiry (≤ `ACCESS_TTL_SECONDS`, 15 min),
not on the very next request. Revocation ledger checks
remain on mint/refresh/exchange only. Two covenants bound
the vessel: it never carries the bearer token
(authentication reads the header from the raw Request, so
the vessel stays loggable), and route handlers stay
transport-free — the route table is the boundary where the
vessel hands `ctx.base` plus fenced claim projection into
live handler arities (`GetHandler`: adapter, params, actor,
organization, roles; write handlers add payload + pair).

**Write-time cross-tenant authorizer.** Pair addresses are
per-org namespaced (`canonicalUriCollection` from the VERIFIED
claim). A foreign-id PUT/DELETE/PATCH on an org-scoped
family must 403 (never invent a genesis in the caller's
own namespace). `writeAuthorizerFor` /
`assertWritableInOrganization`
(`api/write-authorizer.ts`) resolve ownership via
`resolveGlobalOwner` before the handler runs: owner-null →
genesis proceeds; foreign → `ForeignOrganizationError`
(HTTP 403). Read isolation is derivation plus a miss-path
global probe: foreign → 403, absent → 404. Isolation is
demo-grade: mint/verify reads `JWT_HMAC_SIGNING_KEY`
from the environment. There is no client-shipped HMAC
constant. See § Demo server tier.

#### History — the decorator era (retired Phase Final)

Through Phase 15, `OrganizationScopedEntityStore`
(`store-organization-scoped.ts`) filtered reads, stamped
org on writes, and 404'd foreign ids;
`organizationScopedAdapter` (`db-organization-scoped.ts`)
wrapped org-owned stores; `ParentScopedEntityStore` /
`ParentScopedStateStore` (`store-parent-scoped.ts`) resolved
leaf ownership through already-fenced parents. Phase Final
Stage B deleted those three decorator modules and the
`StateStore` class; `EntityStore` remains as the store
interface implemented by `HistoryEntityStore` on the
message plane (`requests`/`responses` only). The pair
plane + write authorizer is the as-built successor.

### Multitenancy model

`organizations` is the tenant root (pair-plane document
family); the seat at
`organizations/:organization-id/members/:identity-id`
is the identity↔org relationship, carrying `type`:
`"admin"` | `"member"`. The members roster is seats
(person identities) plus `/ai-agents` (not members, not
identities). The system member is a constant, not a
seat. Per-org roles exist only as access-token claims
(`admin:O` / `member:O`) baked from seat `type` at
mint; the gate projects them for the fenced org via
`projectClaimRolesForOrganization`. There is no
role-grants HTTP family.

### Invitation lifecycle and acceptance

A seat is now born from an INVITATION accept — the first
live membership-write path (the ledger was seed-only
before). `invitations` (id, organization_id, identity_id,
at) is GLOBAL spine, pass-through, NOT org-fenced: the
invitee must read an invitation to an org it is not yet
in, so the row cannot hide behind the org fence. Its
lifecycle is event-sourced on the pair plane under the
alphabet {pending, accepted, declined, revoked}. State is
pending when the invitation document head exists and no
terminal op-pair is present; terminal ops are pair-plane
addresses invitations/:id/{acceptance,decline,revocation}/
mapping to accepted|declined|revoked. Current status is the
LATEST event, derived and never mutated — the invitation
document persists as audit through every transition.

Grant (admin) appends `pending`. Accept (invitee) appends
`accepted` AND writes the seat at
`organizations/:organization-id/members/:identity-id`
in the SAME atomic ctx-batch, stamped with the
INVITATION's org — not the caller's active org.
Acceptance is inherently a cross-org act (the invitee
acts on an org it does not yet belong to), so it cannot
ride the org-stamped write path. Decline (invitee)
appends `declined`; Revoke (admin) appends `revoked`.

The surface is two HTTP nests over one storage prefix
(`/invitations/`): receive at
`/identities/:id/invitations/` and send at
`/organizations/:id/invitations/`. Grant is
`POST /organizations/:id/invitations/` (admin). Accept
and decline are
`PUT /identities/:id/invitations/:id` (invitee; body
`state` accepted or declined). Revoke is
`PUT /organizations/:id/invitations/:id` (admin; body
`state` revoked). Each nest has `GET …/versions/` plus
`GET …/versions/:etag`. `invitations` joins the
lifecycle owner-resolver probe, so an invitation's
lifecycle events resolve to the invitation's org and
stay out of every other tenant's history reads.

Seat semantics are UNCHANGED: a live seat still means an
accepted member, and the roster, reachable-orgs
enumeration, and token exchange all read seats.

### Route table is the surface

`routes[]` (`api/routes.ts`) is the HTTP surface. If a
URI is not on the table, it does not exist.
`handleRequest` calls `matchRoute` first — a linear
scan. A trailing slash is a collection segment
(`identities/` ≠ `identities`); `:id` never captures
the empty string. There is no `facadeRequest` rematch
and no `GET /organizations` collection. Reachable orgs
are `GET /identities/:id/organizations/`. Product
families nest under `/organizations/:id/`. Browse the
live table at `/api-documentation/`.

Path `:organization-id` on an org-nested route must
equal the VERIFIED token claim org else **403** (no
auto-exchange; nonexistent path org is also 403 — no
route-topology oracle).

### Boot + org-switcher

`app-boot.ts::scopeBootToActiveOrganization` always scopes
the session before first render: enumerate reachable orgs →
`resolveActiveOrganization` (the persisted
`fusion-ai:active-organization-id`, else the identity's
default org if reachable, else the first reachable) →
`postOrganizationSessionExchange` → install the scoped
token. The sidebar org-switcher
(`web-app/app/organization-switcher.ts`) renders its
`<select>` only at ≥2 reachable orgs and re-scopes via a
FULL reload (boot re-exchanges from the persisted id, so no
mixed-org view survives the switch).

### Identity surface

Pages `identities` (list, `inSidebarNav`), `identity-detail`,
`identity-providers`, `identity-tokens` share `sidebarKey:
'identities'`. Adapters (`adapters/identities.ts` etc.):
`getIdentity`, `getIdentityRoster` (identities +
identity-pii; a service has no name facet on this
roster), `postIdentityCreation` (person → identity +
PII; service → identity + hashed `client_secret`).
The identity stores are the GLOBAL spine — creation is a
client-minted id + idempotent PUT, not org-nested.
Presenters mirror the member ones (PII via the `MemberPii`
tagged union, erased fallback at the call site). Erasure
splices `identity_pii` only; the identity, the member, and
every `member_id` reference survive.

## Demo server tier

One origin, two collections — pages at `/ideas/`, API
at `/api/`.

`./build` emits one artifact from one source tree (clean
tree required): **`fusion-ai-server-${SHA}.zip`**. Node
serves composed pages and the API on one origin.
Postgres is the store. The page talks `fetch`. The
client bundle is the fetch facade (no in-page API, no
signing key, no IndexedDB). `--no-zip` writes that
same server-core bundle plus `server.mjs`. A metafile
test forbids `SIGNING_KEY_MATERIAL`,
`backend-indexeddb`, and token mint
(`api/access-token.ts`) in the client graph.

The yank that deleted the in-browser data tier has
shipped. Memory remains for `./test` / `./validate`.
Theme and sidebar still use localStorage.

### Server process

`node server.mjs` (`server/boot.ts`). Required env, never
logged and never defaulted: `POSTGRES_URL`,
`JWT_HMAC_SIGNING_KEY`, `HTTP_SERVER_PORT`. Optional
`TRUSTED_PROXY_HOPS` (comma list). Body over 1 MiB →
**413**. Seed `--seed-bootstrap` or `--seed-mock-data` on
an empty database only; credentials print once on stderr.
One mint process — do not run two replicas. Boot
`assertUtf8`; no `schema_marker` and no successful seed
→ refuse to listen. A missing table is a loud 500.

postgres.js 3.4.9 lives behind `api/postgres-client.ts`
only. DDL is `api/schema-postgres.ts`. Message columns
are BYTEA Latin-1. Writes `pg_notify('fusion_events',
…)`; payload over 8000 → `{"kind":"full"}`. There is
no LISTEN and no SSE client (stale-until-navigation).

scrypt hashes new passwords; PBKDF2 still verifies,
then rehashes. Refresh is an HttpOnly cookie
(`Path=/api/authentication`, `SameSite=Strict`;
`Secure` off only on `http://localhost`). Token JSON
has `access_token` and no `refresh_token`. Cookie-session
access is memory-only. 401 classes: `invalid_token`
(bearer), `invalid_client`, `invalid_grant`. Throttle:
5 authorize + password-class token grants per address
per minute; refresh and token-exchange are not counted
(cookie boot). Wrong `TRUSTED_PROXY_HOPS` makes the
throttle a global cap; refresh/exchange stay unlimited.

`./measure` builds `--no-zip` and spawns
`node server.mjs --seed-mock-data` (needs
`POSTGRES_URL` and `JWT_HMAC_SIGNING_KEY`).
`--base-url` hits a running origin instead (needs
`--password` or `MEASURE_PASSWORD`; skips seed).

### Deploy blockers A1–A6 (disposed)

These six seams were the old disclosure checklist.
They are disposed as follows.

- **A1 HMAC key.** Mint/verify reads
  `JWT_HMAC_SIGNING_KEY`. There is no
  `SIGNING_KEY_MATERIAL`.
- **A2 credential reveal.** Operator seed prints
  credentials once on stderr.
- **A3 plaintext ledger.** Messages stay verbatim.
  Residual at full strength (this is a demo server).
  Token-at-rest hashing is later.
- **A4 jti replay.** Spent. The grant requires `jti`.
  A second grant with the same assertion is 401
  `invalid_grant`. Do not put `jti` on the token JSON.
- **A5 bootstrap HTTP plane.** There is no
  bootstrap HTTP plane. Seed is below HTTP
  (`--seed-bootstrap` / `--seed-mock-data`).
- **A6 PKCE.** Authorize without S256 is rejected.
  The client sends S256.

### Residuals (named, still live)

- Work-order locked verbs not executed
- Two-role views and token-at-rest hashing later
- Stale-until-navigation (no NOTIFY listener)
- XSS can use the refresh cookie from the page
- A raw dump still has verbatim auth messages
- Single mint process
- Throttle is a global cap if `TRUSTED_PROXY_HOPS` is
  wrong; refresh/exchange unlimited
- Instance public PUT is 405 (`putRecordInstance`
  still PATCHes — name lie); same-body PATCH still
  appends 201
- `withLifecycleTrio` still exists
- Roster seat that names an AI agent is later

An audit re-confirms each residual is still KNOWN
(seam flag present, unwidened) and separates any NEW
exposure — see [AUDIT.md](AUDIT.md) § Security: KNOWN
vs NEW.

Mitigated client-tier — the seam is narrowed in this codebase,
re-verified by the automated suite:

- **Authorization-code grant hardening**
  (`grantAuthorizationCode`, `api/authentication.ts`): the
  code is TTL-bound (`AUTHORIZATION_CODE_TTL_SECONDS`,
  10 min from the authorize pair's `at`), client-bound
  (redeeming `client_id` must equal authorize's), and
  PKCE S256-verified (`code_verifier` →
  base64url(sha256) must match). Unknown, spent,
  expired, wrong-client, or bad-PKCE all share one 401
  and mint nothing (grant-first).
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
  field-values visibility / history ownership guards) still
  propagated unredacted. Phase 12 Task 1 closed that gap: the
  fence regions now share one redaction catch with the same
  fixed body, so the claim holds everywhere a request can
  fault. `MissingTableError` still re-raises past all
  three catches as a failed request. Product
  `server-core` just calls `bootApp()`.
- **Route policy tiers** (`ROUTE_POLICY`,
  `api/authorization.ts`): `admin` everywhere plus a real
  `member` tier on the content surfaces; identities,
  credentials, providers, organization and member
  writes stay admin-only (deny-by-default). Seat and
  ai-agent GET are member-readable. Member-tier
  carve-outs:
  `identities/:id/tokens` POST (rotation/revocation) and
  `identities/:id/token-revocations` PUT (self
  logout-everywhere; write authorizer keeps the write
  self-only — path identity vs actor).

## API Layer (`/api`)

`api/` is the server tier — the REST/DB-schema request
handlers. The product runs them in Node over Postgres.
`./test` / `./validate` run them against the memory
backend. Code that crosses the client/server chasm
lives one level out in `shared/` (a sibling of `api/`
and `web-app/`): the HTTP wire schema (`http-message/`,
its own `types.ts`) plus pure cross-chasm utilities
(`base64url.ts`, `crypto-safe-base62.ts`, `digest.ts`,
`password-hash.ts`, `ledger-reduction.ts`,
`error-helpers.ts`). Both `api/` and `web-app/` import
`shared/`; `shared/` NEVER imports `api/`.

`api/types.ts` (domain types + shared aliases — `MemberId`,
`MemberEntity` parent + `Member` union (`HumanMember` /
`AIMember` / `SystemMember`),
`GraphNode.memberIds: MemberId[]`,
`GraphNode.agentIds?: AgentId[]` (write-path `/ai-agents`
ids; omitted from stored JSON when empty),
`GraphNode.attributes: NodeAttribute[]`, record/constraint
shapes, `StateEntity` as the **derived** event DTO, the
state alphabets, and `SYSTEM_MEMBER_ID`), `api/db.ts`
(`DbAdapter` + `TABLE_NAMES` = `requests`,
`responses` only — [SCHEMA.md](SCHEMA.md) is the
authoritative list and per-column reference),
`api/store-history-entity.ts` (`HistoryEntityStore` — the
sole store class; backs both message-plane tables; no
tombstone filter, no lifecycle log), `api/db-postgres.ts`
(product persistence), `api/db-memory.ts` (test impl),
`api/api.ts` (the HTTP gate — `handleRequest` plus the
`GET/PUT/DELETE/POST` helpers, **no module-level adapter;
threaded explicitly**), `api/routes.ts` (the route table —
document families plus the surviving state routes),
`api/mock-data.ts` (seeds pair-plane demo data — the
`'system'` member plus human seats and AI agents as
pairs), `api/validators.ts` (wire/body validators still
consumed by `WRITE_RESPONSE_SPECS`, seed pair formation,
and the gate). The `DbAdapter` / `StorageBackend` seam
has two backends: Postgres (`api/backend-postgres.ts`,
product) and memory (`api/backend-memory.ts`, tests).

Phase Final deleted every entity table and the dual-write
row halves. `StateStore` and the three scoping decorators
are GONE; `EntityStore` remains as the store interface
implemented by `HistoryEntityStore`. The IndexedDB
orphan-store residual retired with the yank.

`web-app/app/server-core.ts` is the product composition
root: it installs the fetch facade and calls
`bootApp()`.
`web-app/app/adapters/init.ts` is the test composition
root (`initAdapter()` / `getDbAdapter()` over memory).
`web-app/app/adapters/shared.ts` defines the
`RequestContext` interface and
`createRequestContext(adapter, token)` — both args are
required; `sessionContext()` is the no-arg convenience
that reads the installed client facade and session
token. Tests wrap a `MemoryDbAdapter`.

`api/routes.ts` covers the surviving history surface.
Per-entity `GET …/versions/` (list) plus
`GET …/versions/:etag` is live for identities,
ai-agents, organizations, seats, invitations (both
nests), ideas, projects, flows, record-types, and
objectives. Work-orders stay
`GET /api/organizations/:id/work-orders/:id/history`
(inline `field_values`). Instance value-revision
history is
`GET …/record-types/:record-type-id/instances/:instance-id/versions/`
plus `…/versions/:version`. There is **no** bulk
`GET work-orders/history` and **no** bulk
`GET objectives/versions`. Ideas / projects /
record-types / objectives GET rows do **not** embed
the lifecycle trio (`state`, `state_at`,
`state_event_id`). Instances carry full-state
`values`. `stateEventVisibilityFor` remains the
RESTRICT / ownership 3-tier probe. Every verb on the
retired shared event-append address is router 404.
Flat `/records` and `/record-attributes` are also
router 404. Lifecycle writes ride document-trio PUTs
and named ops (work-order create/claim/transition/
bind, invitations), not a shared event-append
address. Instance public PUT is **405**; PATCH
creates and updates (If-Match). GET streams the
stored PUT for stream families; flows GET still
`deriveFlow`; assemble surfaces still assemble.
The process refuses to listen without
`schema_marker` (or a successful seed).

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
indexed or address reads (`getAllAtAddress`,
`getAllWhere('uri_collection', ...)`,
`getAllWhere('message_hash', ...)`), never a
whole-plane `getAll()` of `requests`/`responses` on a hot path (the one)
named exception is below); (e) a pre-tx call and an in-tx
call of the same core return byte-identical results, pinned
by drift/parity tests.

New Phase 14 cores riding this shape: `invitationOpStateFor`
+ `invitationLifecycleStatesFor` (`derive-invitations.ts` /
`derive-states.ts`, entity-scoped siblings of the
whole-ledger `invitationOpStates` /
`deriveInvitationStates`, wired into
`pendingInvitationFor`/`currentInvitationState`);
`workOrderClaimHistoryFor` (`derive-states.ts`, pair-plane
claim history — op pairs only: create/claim/transition/
release; the shared event-append arm is retired with the
address); and `stateFieldValuesFrom` /
`deriveStateFieldValueReferrers`
(`derive-state-field-values.ts`, SINGLE-SOURCE —
transition-pair-folded field values only, head-reduced by
the shared `(at, id)` order — backing the
`record-attributes` RESTRICT gate). Product field-value
reads fold inline on
`GET /api/organizations/:id/work-orders/:id/history`
(`workOrderHistoryFor`); the standalone field-values
GET and `stateFieldValuesForStateEvent` are GONE.

### Nested-transaction re-entry

`api/db.ts`'s `DbAdapter.transaction` documents nested
re-entry as a LEGAL subset case: "a nested view.transaction
re-enters this same tx; its tables must be a subset of the
outer set" — `BackedDbAdapter` reuses the open view
(`ambientRunner`), not a second transaction. The
write-path convention still FORBIDS a derive core from
opening one on its own initiative (rule (b) above):
every derive is written to accept whichever view its
caller already holds, so nesting is never needed to
reach the open tx, and a caller's own table list stays
the single, auditable source of truth for what one
transaction touches.

### Document-plane If-Match (sole conflict mechanism)

The DOCUMENT plane — every `flows/:id`-shaped save,
including undo's own restore write, and every other
document-trio PUT — detects a stale basis via `If-Match`
of the quoted 64-hex `documentVersion` (sha256 of body
octets; later writes hash body octets || matched tag).
Locked PUT missing If-Match over a live PUT → **428**.
Stale or unmatched → **412**. Same-body document PUT →
**200**, no append. First append send-time **201**;
the stored PUT start-line stays **200**. DELETE
never-written → **404**; already-gone → **204**, no
append. Pair `id` is `Response-ID` only. There is no
`follows` / `supersedes` / `etag` / `status` column.
Public writes require header `Operation-ID` (22-char);
the server does not mint those. Inner PUTs copy the
outer id. The old STATE-plane 409
(`stateEventCollisionFromPairs` →
`LedgerImmutabilityError`) retired with the shared
event-append address.

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
land in the restore's own document-pair body as write-side
sidecars, exactly like an ordinary save's —
SIDECAR-KEEP names this MECHANISM persisting even though the
VALUES are now SERVER-computed rather than client-supplied
(the client cannot diff against a target it is never told;
no new GET route is sanctioned for this). `hasUndoHistory`
rides the flow's own `GET` response (a document-pair-count
signal, zero marginal reads). `flow_versions` consume
(undo) and publish (every content edit) both STOPPED on
the live path at Phase 14; Phase 15 Task 7 RETIRED the
routes and adapters (router 404); Phase Final DELETED the
table with the rest of the row plane.

### Three named deviations

Phase 14 recorded three deviations from its own plan rather
than silently reaching for a workaround:

1. **SFV RESTRICT whole-plane scan** (Task 6).
   `deriveStateFieldValueReferrers` reads
   `view.requests.getAll()`/`view.responses.getAll()` inside
   the RESTRICT write gate — a whole-plane scan rule (d)
   above otherwise forbids. No `attribute_id` index exists on
   the pair plane; transition-fold field values live on
   work-order op bodies with no cheaper entity-id source.
   Stands post-Final (pair-only RESTRICT).
2. **Region B / leaf SFV routes** (Task 7). Phase 15 RETIRED
   the leaf PUT/DELETE routes (and their Region B fence
   arm); states-address retirement also retired the GET
   field-values collection — product reads fold values on
   work-order history. `stateEventVisibilityFor` (3-tier)
   remains for RESTRICT / ownership probes (see Phase 15 /
   Phase Final as-built below). Dual-write SFV writers are
   GONE with Final; the derive is single-source
   (transition fold only).
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

## Last readers → Phase Final as-built

Phase 15 re-anchored every remaining production decision
read onto the pair plane and retired four zero-caller
route families (DELETE NOTHING held through Phase 15).
**Phase Final DELETED the residual.** Dual-write row
halves stripped (Stage A); doomed tables + `StateStore`
+ the three scoping decorators deleted (Stage B);
`EntityStore` remains as the interface on
`HistoryEntityStore`; states-address retirement deletes
every verb on the shared event-append address; the
clients elimination re-homes client config to the
identities/:id/registration pair facet, deletes the last
entity table, and retires rawReadRow; seed absolute at
EXPECTED_PAIR_COUNT 1448 / bootstrap 8;
`simulateLatency` 4.

### The wire-silent claim (never collapse)

1. **HTTP-wire-silent on the entity surface** — route
   surface and every response byte of every derive-based
   GET and every `WRITE_RESPONSE_SPECS`-gated write are
   unchanged by the deletion. Operator seed prints
   `SeededCredentials` once on stderr (in-process
   `--seed-bootstrap` / `--seed-mock-data`); that body
   is not an HTTP response.

### Wire covenant (Phase 15 deltas still hold)

1. **Route retirements** → router 404 (including every
   verb on the shared event-append address; the old 405
   exception is gone with the address).
2. **Fence strengthenings** (foreign → 403 via
   `ForeignOrganizationError`; absent → 404): (2a) WP1
   organizations self-as-owner; (2b) records hard-delete
   forgery closed.
3. **Write-path re-anchors** (claim graph, RESTRICT legs,
   invitation discovery, identity_pii, clients):
   pair-plane only post-Final.
4. **Dangling `state_event_id`** on transition-fold field
   values → 400 at the gate (forged clients only).

### Successor derives (as-built)

Mixed shapes — not every successor is `dbOrView`-safe or
free of nested transactions:

- `workOrderDocumentHeadFor` — claim-gate `flow_graph`
  head (`dbOrView`, no nested tx)
- `workOrderHistoryFor` — per-id work-order history with
  inline `field_values` (takes plain `db`; no nested tx
  of its own)
- `deriveWorkOrderHistories` — bulk work-order history
  with inline `field_values` (takes plain `db`; opens
  `readTransaction`)
- `deriveObjectiveHistories` — bulk objective history
  (takes plain `db`)
- `documentStateHistoryHandler` — shared DESC GetHandler
  factory for trio-family per-id history
- `stateEventVisibilityFor` — 3-tier ownership probe
  (orphan | visible | hidden) for RESTRICT / related
  fences (`dbOrView`); consumers throw 403/404 rather
  than folding to empty
- `resolveGlobalOwner` — global-existence probe for
  403-vs-404 decisions (write authorizer + read miss
  paths; takes plain `db`)
- `resolveOwningOrganization` — ownership for per-entity
  family history misses (narrower allowlist; takes plain
  `db`)
- `flowGraphBindingsFromPairs` — RESTRICT graph legs
  from graphDelta (`dbOrView`)

### Gate 6 re-homes + survivors

- Invitation grant email → `deriveIdentityPiiRows`
- `pendingInvitationFor` / `loadInvitation` →
  `deriveInvitations`
- Client credentials → `deriveClientRegistration`
  (identities/:id/registration pair facet — clients TABLE
  DELETED)
- **`identity_providers` table DELETED** (Phase Final gate
  1 default) — derivation only
- Follow-on DISCHARGED: client = kind-`'service'` identity +
  registration facet SHIPPED (clients elimination)

### Addressability election

MEASURE-AND-ACCEPT stands. Claim/echo history remains
under the ~17ms re-election trigger at seed scale. Fence
hit/miss stays the same class (~27µs / ~2.0ms post-Final
measure). No entity_id index.

### Exit residual (named, not dual-write)

Gate 6 **PII leave-inert** still stands on the pair
plane (erasure completeness is pair-plane only).
Dual-write mechanics are GONE. The IndexedDB orphan-
store residual retired with the yank.

## Storage tiers

`StorageBackend` (`api/db.ts`) is the byte-level seam:
`transaction(tables, mode, fn)` is the primitive every row
op crosses, and `ensureTables` / `hasSchema` /
`postSchemaCreation` / `deleteSchema` are schema lifecycle.
`HistoryEntityStore` owns history-row semantics (no
tombstones; hard splice only where a path still needs it —
PII erasure on the message plane); backends own persistence
and encoding. `BackedDbAdapter` (`api/db-backed.ts`)
composes one backend into the full `DbStores` bundle
(two stores).

Two backends implement the seam:

- `backend-postgres.ts` — the product tier, wired by
  `db-postgres.ts`. postgres.js stays behind
  `api/postgres-client.ts`. Message columns are BYTEA
  Latin-1; `headPairIdAt` / `messageStore.get` is the live
  PUT. There is no `uri_id`-only index. Schema presence
  is the `schema_marker` row.
- `backend-memory.ts` — the test tier, wired by
  `db-memory.ts`, simulating the transaction via
  `backend-buffer-tx.ts` (buffer touched tables, flush
  on success, discard on throw). Schema presence is
  table existence.

The memory backend shares the buffer-then-flush helper so
the test backend cannot lie about what the production
gate enforces.

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
`HumanMember`, `AIMember`, `ProjectDetail`, `Organization`,
and `RecordDetail`. The
`member-detail` page module reads `member.kind` and dispatches
to the right pair: `HumanMemberDetailPresenter` /
`HumanMemberDetailEditPresenter` for humans,
`AIMemberDetailPresenter` / `AIMemberDetailEditPresenter` for
AIs (the AI edit presenter renders a provider-grouped model
pulldown and a skill-focus textarea; no token field).

`presenters/index.ts` is the barrel; page modules import from
`'../app/presenters/index.ts'`. Public `buildPage()`
orchestrators: `WorkboxDetailPresenter` (private `#build*`
helpers), `OrganizationPresenter` /
`OrganizationEditPresenter`, and `RecordDetailPresenter` /
`RecordDetailEditPresenter`. Other presenters expose
`build*` helpers directly.

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
import { navigateTo } from '../app/navigation.ts';
import { openDialog, closeDialog } from '../app/dialog.ts';
```

Page modules import `navigateTo` from `navigation.ts`,
date/number helpers from `format.ts`, and
`openDialog` / `closeDialog` / `initTabs` from
`dialog.ts`. The `adapters/` directory retains its
barrel re-export (`adapters/index.ts`).

**Page modules never call transport verbs from
`api/api.ts`** — all data access (reads and writes) goes
through the adapter layer (`adapters/`). Product ctx
verbs go through the fetch facade
(`adapters/http-facade.ts`); tests wrap a memory
adapter. Pages may import error/status symbols
(`RequestError`, `HTTP_*`) and other non-I/O types from
the API layer; only adapters invoke the verbs.

## Naming Conventions

- `mutate*` — finds existing DOM and updates it (side-effecting,
  distinct from `build*` which constructs and returns)
- `toneFor*` / `levelFor*` — return string enums consumed as
  `data-tone` / `data-level` attribute values (replaces older
  `styleFor*` inline-style pattern)
- `assert*` — validators at the gate that take a raw value
  and return a typed value or throw: `api/types.ts`,
  `api/validators.ts`, `api/attribute-acl.ts`, and
  `api/write-authorizer.ts`. The `is*` type-guards remain for
  legitimate type-narrowing call sites.
- Adapter reads are two-tier, named by what they return:
  the **domain noun** read returns the domain object
  (`getProject` → `Project`); where a raw stored-shape read
  also exists it carries the **Entity** suffix
  (`getProjectEntity` → `ProjectEntity`). Never table
  vocabulary (`Row`/`Rows`).

## Adapter Conventions

- **Member domain split.** The product roster is seats
  plus ai-agents. Humans compose from organization
  seats (`organizations/:org/members`), the identity
  profile, and identity-pii. AIs compose from
  `/ai-agents` (not members, not identities).
  `adapters/members.ts` builds seated humans;
  `adapters/ai-members.ts` builds agents.
  `adapters/members-union.ts` is the union seam:
  `getMembers` is the roster (humans + AIs, never
  `'system'`); `getMemberMap` additionally resolves
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
  `ctx.GET/PUT/PATCH/DELETE/POST` (plus `*WithEtag` /
  `POSTWithHeaders` where callers need the ETag or headers).
  Product ctx verbs go through the fetch facade; tests
  wrap a memory adapter. Other adapters use `ctx.*`
  only. `ctx.PATCH` is platform-wide (instances
  are the first live consumer; `*WithEtag` variants return
  the strong ETag for If-Match). Each verb dispatches its
  own request with its own per-op transactions: two awaited
  reads on one ctx are NOT a snapshot — a write (same tab
  or cross-tab) can land between them.
- **Platform-shim vs data-access adapters share `adapters/`.**
  Data-access adapters (`ideas.ts`, `flow-queries.ts`, etc.)
  fetch entity data through `ctx`. Platform shims
  (`clipboard.ts`, `viewport.ts`, `location.ts`, etc.)
  wrap browser primitives behind adapters the app owns.
- **`getFlowStats(ctx, flowId)`.** Resolves the work-order
  set via GET `flows/:id/work-orders` (pair-plane join
  documents with derived `flow_id` / `work_order_id`),
  since the frozen `flow_graph` carries no flow id of its
  own. Returns `{ model, graph }` so the page derives
  the canvas viewBox from real laid-out coordinates —
  `getFlowGraph` runs `computeLayout` for `is_auto_layout`
  or degenerate flows.
- **Mutation adapters return `Promise<void>` by default.**
  Change-awareness flows through notification channels (e.g.,
  `ideaChanges.notify()`), never through return values —
  callers tell the channel rather than branch on a result.
  Named non-void exceptions: `putRecordInstance` /
  `patchRecordInstance` return `{ etag: string }`;
  `postInvitationGrant` → `InvitationGrantOutcome`;
  `postMockDataLoad` / `postBootstrap` → `SeededCredentials`;
  `postSessionRefresh` / `postPasswordLogin` →
  `SessionCredentials` (login may be `null`);
  `postOrganizationSessionExchange` → `string`;
  `postFlowFromBackup` → `string`;
  `postFlowFromMermaid` / `postFlowFromZip` →
  `{ flowId, warnings }`.
- **Records adapters.** `adapters/records.ts` owns record-
  type lifecycle over nested
  `organizations/:org/record-types[...]` (CRUD +
  `postRecordStateChange` / composed
  `postRecordChange`).
  `adapters/record-attributes.ts` exposes
  `getRecordAttributesByRecord` over the nested
  attributes collection, sort-ordered.
  `adapters/record-instances.ts` is the instances seam
  (`getRecordInstances`, `getRecordInstance`,
  `putRecordInstance`, `patchRecordInstance`,
  `deleteRecordInstance`, `getRecordInstanceHistory`) —
  values as `Map`, etag opaque (quotes stripped) for
  If-Match.
  `adapters/flow-records.ts` is the flow↔type binding
  seam (`getRecordForFlow`, `getFlowSummariesForRecord`,
  `getWorkOrdersForRecord`) — wire still
  `flows/:id/records`.
  `adapters/record-transitions.ts` exposes the shared pure
  gate `recordTransitionViolationsFrom` plus the adapter
  fetch+gate helper `validateRecordTransition`.
  `postWorkOrderTransition`
  (`adapters/work-orders-mutations.ts`) calls
  `recordTransitionViolationsFrom` and throws
  `RecordTransitionViolations` on a non-empty result.

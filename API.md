# API.md — URI Catalog & POST Composition

The `api/` layer is a REST-style HTTP API. The browser ZIP
runs it in-page over IndexedDB. The server ZIP runs the
same handlers in Node over Postgres. Every
operation is an HTTP operation against a relative resource URI;
single-noun primitives (`GET`/`PUT`/`DELETE` on `/noun/:id`) are the
leaves, and multi-noun operations (`POST /noun/operation`) are interior
nodes composed from those leaves.

This document answers three questions:

1. **What URIs exist?** — the complete route catalog (§2).
2. **What does each POST do internally?** — the per-POST composition,
   shown both as the *actual* store-operation sequence and as the
   *doctrinal* single-noun-primitive decomposition (§3).
3. **What does the shadow ledger add to the wire?** — the pair
   formation step every write runs through, the response headers
   it produces, and the seed's own pre-formed pairs (§5).

The single most important fact: **POST endpoints here do not issue
internal HTTP sub-requests.** They compose store-level primitives
inside one `db.transaction([...tables])`. Why this is so — and the one
genuine exception (`facadeRequest`) — is §4.

The source of record is `api/routes.ts` (the route table),
`api/api.ts` (`handleRequest` + facades), `api/request-auth.ts` (the
gate), `api/authentication.ts` (the OAuth grants),
`api/invitations-domain.ts` (the invitation sub-router),
`api/organization-requests.ts` (the
organization/default-organization sub-routers), and
`api/message-pair.ts` (shadow-ledger pair
formation — §5). This file summarizes them; on any
disagreement, the code wins.

---

## 1. Dispatch & Auth Planes

### 1.1 Request flow

`handleRequest(adapter, request)` (`api/api.ts` `handleRequest`)
resolves a request in this order:

1. **Three pre-match special routes**, before `matchRoute`:
   - `/identities/:id/default-organization` (3
     segments) → `identityDefaultOrganizationRequest`.
   - `/invitations/...` (first segment `invitations`) →
     `invitationsRequest` (its own sub-router; see §2.12).
   - bare `GET /organizations` →
     `organizationsEnumerationRequest`.
2. **`matchRoute(routeTable, segments)`** (`api/routes.ts`
   `matchRoute`) — a linear scan over the flat `routes[]`
   array. A route matches when segment counts are equal and
   every literal segment matches; a `:` segment captures a
   positional param. First match wins. **Unmatched** org-
   nested paths (`/organizations/:org/:entity[/:id]`, ≥3
   segments) fall through to `facadeRequest` (the org-scoping
   facade; see §4) — in-table `organizations/...` patterns
   win over the facade when registered. Unmatched org-nested
   paths return from `facadeRequest` before the main gate
   (re-enter on the flat resource). Only non-facade match
   failures continue: authentication runs first (step 3),
   then 404 for an unmatched authenticated path.
3. **The gate** (skipped for bearer-exempt routes):
   `authenticateRequest` (verify the Bearer JWT; reject
   missing, invalid, or anonymous — per-request revocation
   is retired; a revoked access token works until `exp`,
   ≤ `ACCESS_TTL_SECONDS`) → on auth failure, **401** even
   for unknown paths (never a route-topology oracle) →
   `fenceRequest` (resolve the org once; memberships and
   roles ride token claims — NAMED ≤15-min covenant, not
   live ledger reads; the base adapter is unchanged —
   tenancy rides `uri_collection`, not an org-scoped decorator).
   Bearer 401 body is `{ error: 'invalid_token' }`. Grant
   401s use `invalid_client` or `invalid_grant` (see §3.8).
   → **nested path-org fence** (after fence, before
   authorize: for `organizations/...` other than bare
   `organizations/:id`, path org must equal the fenced
   token org — mismatch including a nonexistent path org
   is **403** with a fixed body; path org never authorizes
   alone) → `authorizeRequest` (per-org role check). After a
   successful auth, no route match is **404**.
4. **Body parse** (`PUT`/`POST`/`PATCH`): `parseObjectBody` —
   a malformed or non-object JSON body is a `400` here, before
   either the pair or the handler ever sees it.
5. **Region B + pre-pair write guards** (after body parse):
   the self-only identity-token-revocation target guard
   (`PUT identities/:id/token-revocations/:rid` — path
   identity must be the actor unless admin) runs for
   that route. Then, for a write with a handler on a non-
   exempt route: `writeAuthorizerFor` (foreign id → **403**
   before pair formation). Public writes require header
   `Operation-ID` (22-char); missing or malformed → **400**.
   The server does not mint that header. Inner PUTs copy
   the outer id. GET may send it; it is ignored.
6. **Shadow-ledger pair formation + idempotency + post-
   replay gates**, for a write verb whose route pattern is
   in `PAIR_WIRED_ROUTE_PATTERNS` (skipped for bearer-exempt
   routes and for a verb the matched route has no handler
   for): `formWritePair` builds the canonical
   request/response message pair pre-tx — address
   resolution, a pre-tx live-PUT head-read
   (`headPairIdAt` / `messageStore.get`) for a
   document-class route, and the hashing that feeds
   idempotency, all before any transaction opens. Wire
   `ETag` / `If-Match` are the quoted 64-hex
   `documentVersion`. Pair `id` is `Response-ID` only.
   Unless the route pattern is in
   `REPLAY_EXEMPT_ROUTE_PATTERNS`, a
   byte-identical resend is served straight from the STORED
   response (`storedResponseFor`) here — the handler never
   runs twice for the same request. **After** a replay miss:
   locked PUT missing If-Match over a live PUT → **428**;
   malformed → **400**; stale → **412**. Same-body
   document PUT → **200**, no append. First append
   send-time **201**; stored PUT start-line stays **200**.
   DELETE never-written → **404**; already-gone → **204**,
   no append. Instance PATCH creates when never-written;
   If-Match ladder on a live head (absent → **428**,
   malformed → **400**, stale → **412**). Public instance
   PUT is **405**. See §5 for what pair formation produces
   on the wire.
7. Only then does the matched handler run, receiving the base
   adapter (`effective` / `ctx.base`), the verified `actor`
   id, the fenced organization, and — for a pair-wired write —
   the formed pair, appended as the LAST act of the handler's own
   transaction.

The acting member (`actor`) is always the verified token subject,
stamped by the gate and passed to every handler — authorship is never
client-supplied. A bearer-exempt route carries the anonymous id and
authors no member-state event.

### 1.2 Bearer-exempt set (`api/request-auth.ts`)

One route set bypasses the Bearer gate. Exempt is not the same as
unauthenticated — it is a single audited surface.

- **`AUTHENTICATION_ROUTES`** — the grant surface (a caller cannot hold
  a token before minting one):
  - `authentication/token`
  - `authentication/authorize`

Seed is `--seed-bootstrap` / `--seed-mock-data` below HTTP. There is no
bootstrap HTTP plane. `AUTHENTICATION_ROUTES` stay exempt.

### 1.3 The client facade

The exported client facade in `api/api.ts` is the set of
one-`handleRequest` shims the web-app adapters call: `GET`,
`GETWithResponseId`, `GETWithEtag`, `PUT`, `PUTWithEtag`,
`PATCH`, `PATCHWithEtag`, `DELETE`, and `POST`. Each awaits a
`simulateLatency()` shim, then issues exactly **one** outer
`handleRequest` call. All fan-out happens server-side inside the
handler — the client makes one call per adapter method.

---

## 2. URI Catalog

Legend for classification:

- **primitive** — single-noun CRUD leaf (`get`/`put`/`delete`).
- **operation** — multi-noun `POST` that composes primitives (§3).
- **nested** — collection/leaf filtered to a parent id (param 0).
- Auth: most routes are authenticated + org-scoped. Exceptions are
  called out (admin, self-or-admin, self-only, identity-scoped,
  bearer-exempt).

### 2.1 Members & current member

- `GET /members` — roster derived from the membership ledger (plus the
  system member). primitive (derived).
- `GET|PUT /members/:id` — member by id. primitive (§3.30). `PUT`
  is a document write (§5.10) — the ninth family, and the FIRST
  `organizationNested:false` one: no `organization_id` exists on
  this entity at all.
- `GET /members/:id/versions/:version` — document
  version leaf (§2.10).
- `GET /current-member` — the verified caller's own member row.
- `GET /ai-members` · `GET|PUT /ai-members/:id` — primitive.
  `PUT /ai-members/:id` is a document write (§5.10) — the tenth
  family, joining `MEMBERS_WIRING`'s shared-log-with-genesis
  bucket. `GET /ai-members/:id/versions/:version` —
  document version leaf (§2.10).
- `POST /ai-members` · `POST /ai-members/:id` — operation (§3.1, §3.2).
  Admin-only.
- `GET /ai-agents` · `GET|PUT /ai-agents/:id` — primitive.
  `PUT /ai-agents/:id` is a document write — the fourteenth
  family, global-plane, not a member and not an identity.
  Body is `name`, `description`, `skill_focus`, `model`.
  `GET /ai-agents/:id/versions/:version` — document version
  leaf (§2.10).
- `GET /human-members` · `GET /human-members/:id` — primitive.
  `human-members/:id` is registered for the document wiring
  (§5.10) — the eleventh family — but carries no live `PUT`, the
  first registered family without one.
  `GET /human-members/:id/versions/:version` — document
  version leaf (§2.10).
- `POST /human-members` · `POST /human-members/:id` — operation (§3.3,
  §3.4). Admin-only.

### 2.2 Identities & subtree

- `GET /identities` · `GET|PUT /identities/:id` — primitive. `PUT`
  is a document write (§5.13) — the TWELFTH registered family,
  joining `MEMBERS_WIRING`'s shared-log-with-genesis bucket.
- `GET /identities/:id/versions/:version` — document
  version leaf (§2.10).
- `POST /identities` — operation (§3.5). Admin-only.
- `GET|PUT|DELETE /identities/:id/pii` — facet. GET is
  self-or-admin; PUT/DELETE are self-or-admin. The only
  PII HTTP (flat `/identity-pii` is RETIRED, router 404).
  PUT/DELETE ride the message plane's sanctioned
  hard-delete zone (§5.12).
- `GET /identities/:id/credentials` ·
  `GET|PUT /identities/:id/credentials/:cid` — nested; the opaque
  `secret` is projected out on every read. Admin-only. `PUT`'s
  closure is extracted to `postIdentityCredentialDocumentOp`
  (§5.13) but stays hand-dispatched, never family-registered
  (§5.13's nested-plane rationale).
- `GET|PUT|DELETE /identities/:id/registration` — client
  registration facet (admin-realm, kind-`'service'` gate);
  `grantClientCredentials` derives it pre-token.

### 2.3 Auth spine — tokens, providers, grants

- `GET /identities/:id/tokens` (derived) ·
  `GET|PUT /identities/:id/tokens/:tid` — nested under the
  identity. Admin-only GET. `PUT` is pair-only and stamps
  `identity_id` from the path. Flat `GET /identity-tokens` ·
  `GET|PUT /identity-tokens/:id` are RETIRED (router 404).
- `POST /identities/:id/tokens/:jti/rotation` — operation
  (§3.6). Path identity must match the jti's identity.
  Flat `POST /identity-tokens/:jti/rotation` is RETIRED.
- `POST /identities/:id/tokens/:jti/revocation` — operation
  (§3.7). Path identity must match the jti's identity.
  Flat `POST /identity-tokens/:jti/revocation` is RETIRED.
- `GET|PUT /identities/:id/token-revocations/:rid` —
  nested under the identity. `GET` admin-only; `PUT` is
  self-or-admin (path identity vs actor) — a member may
  revoke its OWN token chain, naming another identity
  still requires admin. Path stamps `identity_id`.
  Flat `GET|PUT /identity-token-revocations/:id` is
  RETIRED (router 404). No collection route.
- `GET /identities/:id/providers` ·
  `GET|PUT /identities/:id/providers/:eid` — nested under the
  identity. Admin-only. Flat `GET /identity-providers` ·
  `GET|PUT /identity-providers/:id` are RETIRED (router 404).
- `GET /role-grants` · `GET|PUT /role-grants/:id` — RETIRED
  (router 404). Roles derive from membership `type` / claims;
  `postRoleGrantDocumentOp` and the role-grants seed pairs are
  gone (§5.13 / §5.15).
- `POST /authentication/token` — grant dispatch (§3.8). Bearer-exempt.
- `POST /authentication/authorize` — interactive front door (§3.9).
  Bearer-exempt.

### 2.4 Ideas

- `GET /ideas` · `GET|PUT /ideas/:id` — primitive (§3.10).
  Member-tier. `GET /ideas/:id/versions/:version` —
  document version leaf (§2.10).
- `POST /ideas` — retired (Phase 2 Task 3, R1): the composed
  create folded into the PUT above; the route now 405s like
  any other method-absent verb.
- `POST /ideas/:id/conversion` — operation, idea→project (§3.11).
  Member-tier.
- `GET /ideas/:id/submissions` ·
  `PUT /ideas/:id/submissions/:sid` — nested.

### 2.5 Projects

- `GET /projects` · `GET|PUT /projects/:id` — primitive
  (§3.32). Member-tier. `GET /projects/:id/versions/:version`
  — document version leaf (§2.10).
- `GET /projects/:id/flows` · `PUT|DELETE /projects/:id/flows/:pfid` —
  nested (project↔flow join).
- `GET /projects/:id/objective-baseline-scores` ·
  `PUT .../objective-baseline-scores/:sid` — nested.
- `GET /projects/:id/objective-actual-scores` ·
  `PUT .../objective-actual-scores/:sid` — nested.

### 2.6 Flows

- `GET /flows` · `GET|PUT /flows/:id` — primitive. `PUT` is a
  document write (§3.13) and the FIRST locked-class route
  (§5.4) — a save on an existing flow must echo the current
  `ETag` via `If-Match` or 428/412s.
- `POST /flows` — operation (§3.12). Member-tier.
- `POST /flows/:id/undo` — operation (§3.14).
- `POST /flows/:id/redo` — retired (Phase 4 Task 4, R1/E5):
  the route leaves the URI tree entirely, so a request
  against it 404s (no pattern match) — never a 405
  method-absent gap. Live redo is a single locked
  `PUT /flows/:id` (§3.13).
- `GET /flows/:id/versions` — pair-chain lifecycle
  index (live). Wire `StateEntity` rows include
  `version` (the lookup token).
- `GET /flows/:id/versions/:version` — live
  document version leaf (`documentVersionRoute`).
  Table-backed PUT/DELETE on this address stay
  unwired (405). Writes on the pair-chain index
  stay unwired (405). Phase Final DELETED the
  `flow_versions` table. Historical prose for the
  dead table-backed write surface lives at §3.16 /
  §3.31.
- `GET /flows/:id/work-orders` ·
  `PUT /flows/:id/work-orders/:woid` — nested.
- `GET /flows/:id/records` ·
  `GET|PUT|DELETE /flows/:id/records/:frid` — nested.
- `GET|PUT|DELETE /flows/:id/tags/:name` — nested, PAIR-PLANE
  ONLY (Phase 14 Task 9): the codebase's FIRST document family
  with no backing table — `flow_response_id` (the pinned
  response id of a `flows/:id` document pair) is the tag's only
  body field. SIMPLE class, not locked (§5.4's locked arm
  exact-matches `flows/:id`, never this 4-segment address).
  `DELETE` is marked, like every other family.

### 2.7 Work orders

- `GET /work-orders` · `GET|PUT /work-orders/:id` — primitive.
  `PUT` is a document write (§5.6) — the fourth family, and the
  FIRST `'stateless'` one (§5.6): unlike ideas/projects/flows,
  its body carries no lifecycle trio. `GET` now rides the SAME generic
  document machinery `PUT` does — both the list (`GET /work-orders`) and the
  entity read (`GET /work-orders/:id`) derive from the message ledger (Task
  7, Phase 5), not a hand-written dispatch.
- `POST /work-orders` — operation (§3.17). Member-tier.
- `PUT|GET|DELETE /work-orders/:id/claim` — claim
  document (§3.18). First PUT **201**. GET
  `{member_id, expires_at}`; 404 only when unclaimed.
  DELETE releases (**204**). POST 405.
- `POST /work-orders/:id/transition` — operation (§3.19).
- `PUT /work-orders/:id/binding` — create-only bind
  (§3.34). First **201**; rebind 409; POST 405.
- `POST /work-orders/:id/release` — RETIRED (router
  404). Unclaim is `DELETE /work-orders/:id/claim`
  (§3.18 / §3.35).

### 2.8 Record types, attributes & instances

Org-nested primary wire (no dual-wire flat `/records`
facade). Base path:

`organizations/:organization-id/record-types`

Nested under `:record-type-id`:
`/versions`, `/attributes[/:attribute-id]`,
`/instances[/:instance-id[/versions]]`.

In-table nested routes match via `matchRoute` **before** the
org facade swallows unmatched org-nested paths (dispatch
inversion — ARCHITECTURE.md § Facade). Path
`:organization-id` must equal the fenced claim org else
**403** (no auto-exchange; nonexistent path org is also
403 — no route-topology oracle). Flat
`/records[/:id[/history]]` and
`/record-attributes[/:id]` are RETIRED (router 404;
unauth → 401 first).

**Record types** (schema; member READ / admin MUTATION;
`'trio'` SIMPLE PUT class — last-writer-wins, no
If-Match this wave):

- `GET .../record-types` — member; collection
- `GET .../record-types/:id` — member; no attribute embed
- `PUT .../record-types/:id` — admin; create or replace
  head (§5.7)
- `POST .../record-types` — admin; composed create/edit
  (§3.20)
- `DELETE .../record-types/:id` — admin; tombstone;
  RESTRICT if live instances or `flows/:id/records`
  joins
- `GET .../record-types/:id/versions` — member;
  lifecycle-trio history (§2.10). No document
  version leaf.

**Attributes** (nested under type; `'stateless'` SIMPLE
PUT; admin mutation; body drops `record_id` — type id
rides the uri prefix; ACL arrays
`read_roles` / `write_roles` on the document):

- `GET .../attributes` · `GET .../attributes/:id` —
  member; includes ACL arrays
- `PUT .../attributes/:id` — admin; body includes ACL
- `DELETE .../attributes/:id` — admin; RESTRICT (WO
  frozen graph + live flow-graph + state field values
  + live instance heads carrying a value)

**Instances** (data rows; member path-tier +
per-attribute ACL; full dialect in §5.4.1 / §5.20):

- `GET .../instances` — member; list; read-ACL
  projection; id-lex ASC; row embeds `etag`
- `GET .../instances/:id` — member; project by read ACL;
  **ETag** header
- `PUT .../instances/:id` — **405** (public PUT
  retired; PATCH creates)
- `PATCH .../instances/:id` — member; creates when
  never-written; **If-Match** on a live head
  (428 / 412). Same-body PATCH still appends 201
- `DELETE .../instances/:id` — member; tombstone;
  unconditional (phase 1)
- `GET .../instances/:id/versions` — member;
  value-revision chain
  (`{at, etag, version, values}` DESC)
- `GET .../instances/:id/versions/:version` —
  member; one stored revision (lookup token is
  index `version`)

`flows/:id/records` (flow↔type join) is UNTOUCHED —
accepted debt, not this family's wire.

### 2.9 Objectives

- `GET /objectives` · `GET|PUT /objectives/:id` — primitive
  (§3.29). `PUT` is a document write (§5.8) — the seventh
  family, lifecycle **`'trio'`** (genesis at create;
  archive/reactivate via the document PUT — not
  `'stateless'`). Both `GET`s DERIVE from the ledger
  (§3.29): the collection via
  `documentCollectionGetHandler(OBJECTIVES_WIRING)`, the entity
  via `documentEntityRoute(OBJECTIVES_WIRING)`.
  `GET /objectives/:id/versions/:version` — document
  version leaf (§2.10).
- `POST /objectives` — operation (§3.21).
- `GET /objectives/:id/revisions` ·
  `PUT /objectives/:id/revisions/:rid` — nested.

### 2.10 Lifecycle history — the per-URI event log

Lifecycle is pair-plane only. The `states` table and every
verb on the shared event-append address are RETIRED
(states-address retirement + Phase Final). **Nine
lifecycle GET registrations + one value-history
(instances)** replace the retired bulk collection,
per-entity history alias, and field-values read surface.
Wire order is `(at, id)`
**DESC** on every registration (index 0 = current). No
new authorization entries —
`matchesOnSegmentBoundary` extends existing family GET
grants under `/versions` (work-orders stay
`/history`). Route order is load-bearing:
literal `work-orders/history` and `objectives/versions`
register **before** the `:id` document routes so
`matchRoute` does not treat the literal as an id.

**Nine lifecycle registrations**

1. `GET ideas/:id/versions` —
   `documentStateHistoryHandler(deriveIdeaStateHistory,
   'ideas')`. Wire: `StateEntity[]`
   `{id, entity_id, state, member_id, at,
   version}` DESC. `version` is the lookup
   token for `GET .../versions/:version`.
   Empty → `missedReadError` → foreign **403** /
   absent **404** (honest family body).
2. `GET projects/:id/versions` — same builder over
   `deriveProjectStateHistory` / `'projects'`.
3. `GET organizations/:org/record-types/:id/versions` —
   same builder over
   `deriveRecordStateHistory` / `'record_types'`
   (nested address; flat `records/:id/history` is
   router 404).
4. `GET flows/:id/versions` — same builder over
   `deriveFlowStateHistory` / `'flows'`.
5. `GET objectives/:id/versions` — same builder over
   `deriveObjectiveStateHistory` / `'objectives'`.
6. `GET members/:id/versions` — `deriveMemberStates`
   filtered to `entity_id`, sorted DESC. Global-family
   miss: empty → `EntityNotFoundError('members', id)`
   → **404** only (no org write authorizer).
7. `GET work-orders/:id/history` —
   `workOrderHistoryFor` (entity-scoped op-pair replay
   + transition fold). Wire:
   `WorkOrderHistoryEventEntity extends StateEntity
   { field_values: TransitionFieldValueEntity[] }`
   with `{id, attribute_id, value}` (no
   `state_event_id` on the wire — the parent event
   already carries `id`). Transition rows fold values;
   claim / birth / release rows carry
   `field_values: []`. Empty → `missedReadError(...,
   'work_orders')` → foreign **403** / absent **404**.
8. `GET work-orders/history` —
   `deriveWorkOrderHistories(db, org)`. Org-prefix
   bulk of (7), same
   `WorkOrderHistoryEventEntity` shape, DESC overall.
   **Always 200** array (empty when the org has no
   work-order lifecycle).
9. `GET objectives/versions` —
   `deriveObjectiveHistories(db, org)`. Org-prefix
   bulk of objective document-trio events,
   `StateEntity` only (no `field_values`), DESC
   overall. **Always 200** array.

**Document version leaves** (`documentVersionRoute`).
`GET /:family/:id/versions/:version` is live for
identities, ai-members, human-members, memberships,
flows, members, ideas, projects, and objectives.
The `:version` token is the stored response
`version` (64-hex) advertised on the index row
where the family has one. Instance leaf
`GET .../instances/:id/versions/:version` is also
live (§5.20). Record-types and work-orders have
no document version leaf.

**One value-history registration (not a lifecycle
clone).**
`GET organizations/:org/record-types/:type/instances/:id/versions`
— value-revision chain:
`{ at, etag, version, values }[]` DESC,
projected by the caller's **current** read ACL (never
ACL-as-of-then). `version` is the lookup token for
`GET .../instances/:id/versions/:version`. Foreign
403 / absent 404 / tombstone 404. Full dialect: §5.20.

**Head-state on entity GETs (lifecycle trio).** Ideas,
projects, record-types, objectives, and members GET
rows embed `state`, `state_at`, `state_event_id` stamped
from the lifecycle-current event (genesis-wins-under-
skew), never the head PUT body alone. Flows skip the
embed (no consumer). Work-orders stay `'stateless'` —
lifecycle lives only on create / claim / transition /
binding ops and the history routes above. Unclaim is
DELETE on the claim address. Instances carry
`values` (full-state head), not the lifecycle trio.

**Field values have no successor route.** Product
reads fold them inline on work-order history (7)/(8).
`stateFieldValuesFrom` /
`deriveStateFieldValueReferrers` remain for the
record-attributes RESTRICT gate only;
`stateEventVisibilityFor` (3-tier: orphan | visible |
hidden) still fences RESTRICT and related ownership
probes — not a public field-values collection.

**Retired (router 404 for authenticated callers;
unauthenticated → 401 first):** every verb on the
shared event-append address; the bulk five-source
lifecycle collection; the per-entity current-state
alias; nested field-values write (and the retired
field-values GET). Live field-value writes ride the
work-order transition fold only. No
`WRITE_RESPONSE_SPECS` leaf; seed forms transition
op pairs, not bare leaf pairs (§5.16 / §5.19).

Lifecycle **writes** ride document-trio PUTs
(ideas / projects / record-types / flows / objectives /
members) and named ops (work-order create / claim /
transition / bind, invitations) — never a shared
event-append address. Instance public PUT is **405**;
value writes ride PATCH (creates + updates, If-Match
on a live head) / DELETE tombstone (§5.20) — not
lifecycle-trio PUTs.

Org-scoped document PUT/DELETE hit the write authorizer
(`api/write-authorizer.ts` → `resolveGlobalOwner` →
`resolveOwningOrganization` fallback) so a foreign id
403s rather than genesis-ing in the caller's namespace;
genuine absence still 404s (or genesis on PUT).
Surviving stores are global (`requests` /
`responses`); tenancy rides `uri_collection`. There is no
org-scoped adapter.

The intra-org shared event-append escape hatch is
RETIRED with the address itself (see
`tests/drift-roster.test.ts`
"THE STATES/:ID ESCAPE HATCH RETIRED").

### 2.11 Organizations & memberships

- `GET /organizations` — the caller's reachable orgs (identity-scoped;
  runs above the admin gate so a roleless member can boot). The row
  list is the pair-plane derivation (Phase 12 Task 5):
  `deriveOrganizations` (`api/derive-organizations.ts`, §5.18); the
  membership filter is ALSO derived now (Phase 13 Task 3):
  `callerOrganizationIds` (`api/request-auth.ts`) reads
  token claims via `callerOrganizationIdsFromClaims` (the
  adapter arg is unused), never a live memberships ledger
  or `memberships.getAllWhere`.
- `GET|PUT /organizations/:id` — primitive (global passthrough; reads
  fence to the caller's memberships). `GET` is FLIPPED too (Phase 12
  Task 5): a bespoke `deriveOrganization` call in the route closure
  (§5.18), not the generic `documentGetHandler` every other flipped
  family rides. `PUT` stays hand-written old-plane.
- `GET /memberships` · `GET|PUT|DELETE /memberships/:id` —
  primitive. `PUT` is a document write (§5.9) — the eighth
  family, `'stateless'` (a pure join with no lifecycle
  concept). Collection and entity `GET` ride the generic
  document handlers over `MEMBERSHIPS_WIRING`. `DELETE` is
  hand-written: a pure pair-plane tombstone append on
  `['requests','responses']`.
  `GET /memberships/:id/versions/:version` — document
  version leaf (§2.10).
- `GET|PUT /identities/:id/default-organization` — a
  simple document. Self-only. `GET` returns the SET
  document or 404 if never SET. `PUT { organization_id }`
  must be a live seat, else 400. No public DELETE.
  Revoke does not rewrite this document. Token
  resolution (`identityDefaultOrganization`) uses the
  SET if that organization is a live seat, else PRIMARY,
  else deny. Derived via `deriveDefaultOrganization`
  at `/identities/:id/default-organization/`.

### 2.12 Invitations (sub-router)

Handled inside `invitationsRequest` (`api/invitations-domain.ts`),
never through the main table — the workflow spans identity and org and
runs on the base adapter with explicit guards:

- `GET /invitations` — the caller's own invitations (invitee view).
- `GET /invitations/sent` — the active org's pending invitations
  (admin roster).
- `POST /invitations` — grant (§3.22). Admin-only.
- `POST /invitations/:id/acceptance` — accept (§3.23). Invitee-only.
- `POST /invitations/:id/decline` — decline (§3.24). Invitee-only.
- `POST /invitations/:id/revocation` — revoke (§3.25). Admin-only.

---

## 3. POST Composition Catalog

Each entry gives: the **transaction** table-set (or "no tx");
the **actual** ordered operation sequence; the **doctrinal**
mapping (single-noun HTTP primitives composed as a
`post_operation`); and **properties** (atomicity, idempotency,
TOCTOU-safety, validator, actor source).

**Pair-plane only (Phase Final).** Surviving stores are
exactly `requests` and `responses`. Every write composition
below opens `db.transaction(['requests','responses'], …)`
and appends message pairs — there is no entity-table put
and no `states.postEvent`. Lifecycle rides document-pair
bodies (trio families fold `state` / `state_at` /
`state_event_id` into the document body) or named-op pairs
(work-order claim / transition / binding,
invitations).

Notation in the doctrinal lines: `put_x` ≈ the document
pair a live `PUT /x/:id` would form; `post_op` ≈ the
operation pair at the POST address; `delete_x` ≈ a
marked tombstone pair at `DELETE /x/:id`. The retired
`post_state_event` ≈ shared event-append mapping is GONE
with the address.

### 3.1 `POST /ai-members` — create AI member

`postAiMemberCreationOp` (`api/routes.ts`).

- tx: `['requests','responses']`
- actual: three `appendMessagePair` calls when the gate
  supplied the bundle — operation, member document (body
  via `memberDocumentBodyOf` with the initial lifecycle
  trio), detail document.
- doctrinal: `post_op` + `put_member` + `put_ai_member`
  composed as `post_create_ai_member` (lifecycle on the
  member document body, not a separate states append).
- props: atomic; admin-only; `validateAIMemberCreateBody` at the gate;
  actor server-stamped.

### 3.2 `POST /ai-members/:id` — edit AI member

`postAiMemberEditOp` (`api/routes.ts`) — extracted from an anonymous
closure this same task, the FIRST composed-EDIT synthesis (below).

- tx: `['requests','responses']`
- actual: three `appendMessagePair` calls — operation,
  member document (echoed trio), detail document.
- doctrinal: `post_op` + `put_member` + `put_ai_member` as
  `post_edit_ai_member`.
- props: atomic; **no lifecycle move** (edit echoes the
  current trio); admin-only; `validateAIMemberEditBody`.

### 3.3 `POST /human-members` — create human member

`postHumanMemberCreationOp` (`api/routes.ts`). PII no longer
lands here (Phase 10 Task 2's intake decomposition, prose
below) — it enters via a second, separate hop.

- tx: `['requests','responses']`
- actual: FOUR `appendMessagePair` calls when the gate
  supplied the bundle — operation, member document (initial
  trio folded in), detail document, identities document.
- doctrinal: `post_op` + `put_member` + `put_human_member` +
  `put_identity` as `post_create_human_member` (lifecycle
  on the member document body).
- props: atomic; admin-only; `validateHumanMemberCreateBody`
  (`['id', 'detail', 'initialState', 'initialStateEventId',
  'initialStateAt']` — `pii` retired from this key set).

### 3.4 `POST /human-members/:id` — edit human member

`postHumanMemberEditOp` (`api/routes.ts`) — the postAiMemberEditOp
precedent above, for the sibling facet. PII no longer lands here
either — it changes ONLY via the separate hop, fired IFF the
client's dirty check finds it changed.

- tx: `['requests','responses']`
- actual: FOUR `appendMessagePair` calls — operation, member
  document (echoed trio), detail document, identities document
  (the last FOLDS by message_hash when byte-identical to create).
- doctrinal: `post_op` + three document puts as
  `post_edit_human_member`.
- props: atomic; **no lifecycle move**; admin-only;
  `validateHumanMemberEditBody` (`['detail', 'state',
  'stateAt', 'stateEventId']` — trio echo required; `pii`
  retired from this key set).

**The member write-pair bundle (Phase 8 Task 4), the
records/objectives-bundle sibling (§3.20/§3.21) — and the
migration's FIRST composed-EDIT synthesis: not only the two
CREATEs above (3.1, 3.3) but ALSO the two EDITs (3.2, 3.4) now
pre-form extra pairs beside the gate's own operation pair, ONLY
when the gate supplied both a pair and a fence organization — a
below-facade caller (`api/mock-data.ts`) skips all three, exactly
like every prior bundle.**

- **The operation pair** — the gate's own. For a create, the SAME
  address a live genesis `PUT /ai-members/:id` (or
  `/human-members/:id`) would use: the family's own
  `createBodyIdField` override collapses the bare
  `POST /ai-members` (or `/human-members`) onto the entity
  address's own (uriCollection, uriId) — the flows/objectives
  precedent (§3.12/§3.21). For an edit, the address IS the entity
  address already — `POST /ai-members/:id` / `/human-members/:id`
  were already pair-wired there.
- **The member document pair** — PUT-shaped, at the ONE shared
  `members/:id` address every member kind writes through
  regardless of family, body `memberDocumentBodyOf(type,
  trio)` → `{type, state, state_at, state_event_id}` — the
  exact live `PUT /members/:id` wire body — validated through
  `validateMemberDocumentBody`. The member kind is a
  server-supplied fact (never read off the request body); the
  lifecycle trio is the create's initial trio or the edit's
  echoed head trio — see the fold note below.
- **The detail document pair** — PUT-shaped, at the family's own
  `ai-members/:id` or `human-members/:id` address (the SAME
  address the operation pair uses), body `aiMemberDetailBodyOf` /
  `humanMemberDetailBodyOf` (the create/edit body's `detail`
  sub-object VERBATIM), validated through
  `validateAiMemberDocumentBody` / `validateHumanMemberDocumentBody`
  — byte-indistinguishable from a live `PUT /ai-members/:id`.
  `human-members/:id` carries NO live PUT of its own (Task 3's own
  comment, §5.10), so this is the ONLY writer its wiring row's
  `documentOp`/`entityOf` ever serves besides the seed;
  `WRITE_RESPONSE_SPECS['human-members/:id']` becomes a
  `PerVerbWriteResponseSpec` this task for exactly that reason —
  its `put` slot serves this synthesized bundle and the seed alone,
  never a real client PUT.
- **The identities document pair (Phase 10 Task 5) — human-only,
  a fourth member appended LAST.** PUT-shaped, at the identity's
  own `identities/:id` address (its OWN address, distinct from
  `members/:id` and the family's own detail address), body
  `identityDocumentBodyOf('person')` → `{kind:'person'}` alone —
  the exact live `PUT /identities/:id` wire body — validated
  through `validateIdentityDocumentBody`. An AI member carries
  none: it has no identity row of its own (finding 10), so
  `postAiMemberCreationOp`/`postAiMemberEditOp` never receive one
  and their bundle stays the ORIGINAL three (§5.14 has the full
  writeup — the discriminated-union rationale, the fold, and the
  seed's own extension).

The shared BODY builders (`memberDocumentBodyOf`,
`aiMemberDetailBodyOf`, `humanMemberDetailBodyOf`,
`identityDocumentBodyOf`) feed `formDocumentPairFor`
(`api/routes.ts`), the shared pair-FORMER the four routes above
now call directly (Phase 9 Task 2 retired their own route-inline
formation). The seed's own invocation construction
(`api/mock-data/seed-message-pairs.ts`) still forms its pairs
independently — a different pipeline by design, with no
dispatched route to resolve a fence organization or response spec
from.

Every pair in the bundle shares ONE `requestAt` yet strictly-later
response `at` stamps, so each address's LAST-appended pair becomes
its head: the member document is `members/:id`'s first-ever pair
on a member's first write and its new (superseding) head on every
later write; the detail document shares the operation pair's own
address and becomes THAT address's new head, appended after it;
the identities document (human-only) sits at its OWN address and
becomes THAT address's new head, appended last. A mid-write
failure (an invalid AI model id or a malformed human
`strengths` array / `team_dimensions` object — composites
are native nested JSON, never JSON-encoded strings —
caught by the pre-tx document-body check or by the op's
own re-validating store put) leaves zero of the bundle,
exactly like every other atomic write in this catalog.

**The PII facet is NEVER synthesized.** `identity_pii` stays
old-plane on BOTH the human create and edit — its own document
address (`identities/:id/pii`, §2.2) already exists and carries
its own message pair independently, never folded into the
bundle above.

**The PII intake decomposition (Phase 10 Task 2) — the phase's
NAMED browser-visible change.** The three `pii{}` carriers close
prospectively: the person branch of `POST /identities` (§3.5)
narrows to `{id, kind}`; `POST /human-members` (§3.3) narrows to
`{id, detail, initialState, initialStateEventId,
initialStateAt}`; `POST /human-members/:id` (§3.4) narrows to
`{detail, state, stateAt, stateEventId}` (detail + echoed
lifecycle trio; `pii` retired only). PII enters ONLY through `PUT
identities/:id/pii` (§2.2, §5.1) — the client adapters
(`web-app/app/adapters/identities.ts`'s `postIdentityCreation`,
`web-app/app/adapters/members.ts`'s `postHumanMemberCreation` and
`putHumanMember`) gain a SECOND, sequential hop after the
create/edit succeeds and BEFORE the change notification fires:

- `postIdentityCreation` (person branch): `POST /identities`
  (bare), then `PUT identities/:id/pii`, then `notify()`.
- `postHumanMemberCreation`: `POST /human-members` (pii-free),
  then `PUT identities/:id/pii`, then `notify()` — this hop is
  UNCONDITIONAL, since a freshly created member always supplies
  its initial contact facet.
- `putHumanMember`: `POST /human-members/:id` (detail +
  echoed lifecycle trio),
  then `PUT identities/:id/pii` IFF the caller supplies a `pii`
  argument — the ONLY conditional hop of the three, decided by
  the dirty check below.

**The dirty check (`web-app/members/detail.ts`'s
`humanMemberPiiPatchIfDirty`, a pure function).** The detail
page's save compares the draft's four contact fields — after the
SAME `trimStrings` normalization the save already applies —
against the member's FETCHED `pii()` (read at page load, before
any edit). An erased original has no stored fields to diff
against, so it baselines against blank strings, the SAME fallback
`humanMemberDraftFromMember` uses to seed the draft in the first
place — an untouched erased member's save never fires a spurious
PUT. `saveHumanMember` passes the resulting patch (or `undefined`)
straight to `putHumanMember`'s optional `pii` argument, so a
detail-only save stays exactly ONE hop.

**THE TORN-STATE ACCEPTANCE (gate 3).** The PII facet leaves the
creates' atomicity: a second-hop failure leaves a PII-less
member/identity, rendered first-class rather than rolled back.
- For a human member, this is SELF-HEALING: the next detail-page
  save re-supplies contact fields, the dirty check finds them
  differing from the still-erased original, and the PUT fires —
  one hop closes the gap.
- For a standalone identity (the Add Identity dialog's person
  branch), the residual is PERMANENT — there is no PII-edit UI
  for a bare identity outside the member surfaces.
- **The mint-once discipline caps the blast radius at ONE orphan
  per abandoned dialog.** Both Add dialogs
  (`web-app/identities/index.ts`, `web-app/members/index.ts`)
  used to mint a fresh entity id on every submit attempt — a
  retry after a second-hop failure minted a SECOND identity,
  orphaning the first forever. Both dialogs now mint the id ONCE
  when the dialog opens (reset on the next open, so a later,
  unrelated session never reuses a stale id) and REUSE it across
  retries, so a retry re-targets the SAME partially created
  entity instead of minting a new one. A second-hop failure
  surfaces its OWN fault message (`IdentityPiiIntakeFailedError`,
  `HumanMemberPiiIntakeFailedError`) naming the partial state,
  never the blanket create-failure toast.
- The seed inherits the SAME two-step dev-tier shape (§5.3):
  `api/mock-data.ts` calls `postIdentityPiiDocumentOp` once per
  seeded human, nested inside the SAME outer `TABLE_NAMES`
  transaction the member-facet writes already share — ordered
  BEFORE `seedHumanCredentials` runs (its pii-presence filter
  reads `identityPii.getAll()` to pick login-capable persons; a
  pii-empty read after this transaction commits would collapse
  the credential set to the system row alone).

**Wire-level accounting.** Every response stays byte-identical;
every OTHER request stays byte-identical; only the three request
bodies above narrow, and each of the three flows gains its own
+1 hop at its own `identities/:id/pii` address. Old-plane rows
stay byte-identical too — the op path writes the SAME
`identity_pii` ids/content, just through a second request instead
of folded into the first.

**The member-document fold (the E6 note, made concrete).** A
member's `type` is a server-pinned fact, and an edit that does
not move lifecycle **echoes** the current
`state`/`state_at`/`state_event_id` byte-for-byte, so
`memberDocumentBodyOf(type, trio)`'s body —
`{type, state, state_at, state_event_id}` — is byte-identical
to the head when the edit is a no-op transition.
`appendMessagePair`'s global by-hash fold therefore skips the
member-document pair on every such edit — a genuine fold when
the echoed trio matches, not type alone. The identities
document (Phase 10 Task 5) folds the SAME way, for the SAME
reason: a human member's identity `kind` is ALSO a server-pinned
fact ('person', always), so `identityDocumentBodyOf('person')`'s
body is byte-identical across create and every edit — a second,
independent PERMANENT fold at a DIFFERENT address. The detail
document and the operation pair carry the write's actual changes,
so they fold only when a caller resends byte-identical field
values (the general E6 hazard every bundle shares).

`tests/api-shadow-ledger-members-identities.test.ts`'s create and
composed-edit cases (balance re-pinned 1 → 3 per write at Phase 8
Task 4; human create re-pinned again, 3 → 4, at Phase 10 Task 5 —
AI stays 3, finding 10; the human edit gains the identities
document but folds it; address and key-set assertions for every
synthesized document, including the identities document's
`{kind}` alone; a failed-create/failed-edit-appends-nothing pair
for both families) are the bundle's proof.
`tests/mock-data-pairs.test.ts`'s `EXPECTED_PAIR_COUNT` (§5.3) and
its member-document/detail-document/identities-document address
spot-checks extend the SAME proof to the seed. §5.14 has the
identity-create bundle's own proof (person 1 → 2, service
1 → 3) and the bundle-or-nothing case.

### 3.5 `POST /identities` — create identity

The person branch narrows to a bare `{id, kind}` (Phase 10 Task
2's intake decomposition, prose above §3.5) — its PII enters via
a second, separate `PUT identities/:id/pii` hop, so a bad PII
sub-object can no longer roll a person identity back; the
service branch is untouched (its credential facet was never
PII, so it stays one atomic write).

- tx: `['requests','responses']` (both kinds)
- actual: the bundle (Phase 10 Task 5, §5.14):
  `appendMessagePair(operation)`, then
  `appendMessagePair(identityDocument)`, then — service only —
  `appendMessagePair(credentialDocument)`. Pair-plane only.
- doctrinal: `post_op` + `put_identity` (+
  `put_identity_credential` for service) as
  `post_create_identity`.
- props: atomic; **no lifecycle event** (an identity has no
  creation lifecycle); admin-only; secret hashed client-side
  (the route touches no crypto); `validateIdentityCreateBody`
  (`['id', 'kind']` for person — `pii` retired from this key set;
  `['id', 'kind', 'credential']` for service, unchanged); the
  bundle is pairs-or-nothing IFF the gate supplied a pair and a
  fence organization — a below-facade caller (`api/mock-data.ts`,
  Task 6's own scope) skips it, exactly like every prior bundle.

### 3.6 `POST /identities/:id/tokens/:jti/rotation` — rotate refresh jti

Delegates to `rotateRefreshJti` (`api/authentication.ts`).

- tx: `['requests','responses']`
- actual: PRE-TX — `deriveIdentityTokenEventsForJti(presented)`
  → `chainIdForJti(...)` → `deriveIdentityTokens` filtered to
  the chain → `planRotation(...)` (pure) → `formTokenEventWrites`
  (one `formTokenEventPair` per planned append). IN-TX
  VERIFY-OR-RETRY (Phase 13 Task 5, gate 7): re-derive the SAME
  chain, re-`planRotation`, compare the fresh jti set against
  the pre-formed writes' — diverged → abort and retry (3
  attempts); equal → `appendMessagePair` each pre-formed write,
  then, rotate only, `putMessagePair(pair)`.
- doctrinal: read the token ledger + `post_token_event`(s) as
  `post_rotate_refresh_token`.
- props: atomic; TOCTOU-safe (verify-or-retry inside the tx, so two
  concurrent rotations cannot both rotate); live jti → `{jti}`,
  reuse/unknown → 409; replay-exempt (§5.1) — a byte-identical resend
  re-enters this function rather than replaying a cached response;
  PAIR-ONLY (Phase 13 Task 9 retired the `identity_tokens` row
  write — every event lives only as its own message pair).

### 3.7 `POST /identities/:id/tokens/:jti/revocation` — revoke chain

Delegates to `revokeTokenChain` (`api/authentication.ts`).

- tx: `['requests','responses']`
- actual: PRE-TX — `deriveIdentityTokenEventsForJti(jti)` →
  `chainIdForJti` / `identityForJti` → `deriveIdentityTokens`
  filtered to the chain → `revocationAppends(...)` (pure) →
  `formTokenEventWrites`. IN-TX VERIFY-OR-RETRY (Phase 13 Task
  5, gate 7): re-derive, re-plan, compare jti sets — diverged →
  abort and retry (3 attempts); equal → `appendMessagePair` each
  pre-formed write, then `appendMessagePair(pair)` (both the
  known-chain and unknown-jti no-op exits append their pair).
- doctrinal: read chain + `post_token_event`(s) as
  `post_revoke_token_chain` (log out one session).
- props: atomic; idempotent no-op for an unknown jti — the pair still
  appends, that request's only write; PAIR-ONLY (Phase 13 Task 9
  retired the `identity_tokens` row write); retry exhaustion throws
  `TokenWriteRetriesExhaustedError` rather than a silent, incomplete
  revoke.

### 3.8 `POST /authentication/token` — grant dispatch

`postToken` (`api/authentication.ts`) dispatches on
`grant_type`. Every grant is **grant-first**: it authenticates
the presented grant before any side effect, so a failed grant
appends nothing and mints nothing. `mintPair` is pure crypto (no
DB). Success JSON is `{ access_token, token_type, expires_in }`
— **no `refresh_token`**. Refresh is an HttpOnly cookie
(`Path=/authentication`, `SameSite=Strict`; `Secure` off
only on `http://localhost`). Cookie-session access is
memory-only. Wire 401 classes: `invalid_token` (bearer
gate), `invalid_client` (bad `client_assertion`),
`invalid_grant` (credentials, spent code, spent jti).
Every SUCCESSFUL grant also forms its own message pair
pre-tx (`formAuthPair`, from the `AuthPairSeed` the dedicated
arm seeds in `api/api.ts`) and stores it as the tx's LAST row
op via `putMessagePair` (keyed by pair id, so two identical
logins each land) — see §5.1 for the headers this produces and
§5.2 for the verbatim-storage contract.

- **`authorization_code`** → `grantAuthorizationCode`:
  - PRE-TX: `deriveAuthorizationCodeId` (`sha256Hex(code)`) →
    `authorizeCodeIssuer` (`messageStore.getAllWhereBody`
    on `/authentication/authorize/` with `{ code }`) →
    TTL check → redeeming `client_id` must
    equal authorize's issuer (shared 401 on miss/wrong) →
    PKCE S256 when issuer stored `code_challenge`
    (`code_verifier` → base64url(sha256) must match; the
    server ZIP rejects authorize without S256, so redeem
    always verifies there; the browser ZIP still accepts
    authorize without a challenge) →
    `authorizationCodeSpent` fast-fail
    (`requests.getAllAtAddress` on
    `/identities/<id>/tokens/` + the code digest —
    leftover `/identity-tokens/` still dual-read — a
    hit IS the spend marker, KEY-BY-ANCHOR: the issued
    root's row id equals the code's own digest) →
    `mintPair` → `formAuthPair` →
    `formTokenEventPair` (the root's own event). Mints
    `act: {sub: clientId}` — the acting client — on the
    access token (RFC 8693 shape, the token-exchange
    precedent).
  - tx `[requests, responses]`: re-run `authorizationCodeSpent`
    on the open view — a race loser aborts, appending nothing
    further — then `appendMessagePair` the root's event pair,
    then `putMessagePair` the auth pair.
  - props: the spend re-check + chain-root issue + pair append
    are atomic (no double-spend on replay); a used/unknown code
    → 401, appending nothing.
- **`refresh`** → `grantRefresh`:
  - `verifyAccessToken` (crypto) → `tokenRevocationReason`
    (`deriveTokenRevocationsFor` +
    `deriveIdentityTokenEventsForJti`) → `nameFor` →
    `subjectOrganizations` → `mintPair` → `formAuthPair` →
    `rotateRefreshJti` (the §3.6 tx, passed the pre-formed pair;
    it appends the pair ONLY on the 'rotate' branch).
  - props: rotation + pair append are atomic; reuse revokes the
    chain then 401, discarding the pre-formed pair unstored;
    replay-exempt (§5.1) so a resent reuse genuinely re-fails
    rather than replaying a cached 200.
- **`token-exchange`** → `grantTokenExchange` (RFC 8693,
  self-delegation only):
  - `verifyAccessToken`×2 → `tokenRevocationReason`×2 → assert
    subject == actor → optional `subjectOrganizations`
    membership check → `nameFor` → `issueTokenPair`.
  - `issueTokenPair` = `mintPair` + `formAuthPair` (both pre-tx),
    plus the root's own `formTokenEventPair` (also pre-tx), then
    tx `[requests, responses]`: `appendMessagePair` the root's
    event pair, then `putMessagePair` the auth pair (when
    seeded).
  - props: the issue + pair append ride ONE minimal transaction
    — a mid-write fault can never leave an issued chain root
    with no matching ledger pair. Cross-party exchange → 403,
    appending nothing.
- **`client_credentials`** → `grantClientCredentials`
  (private_key_jwt):
  - `deriveClientRegistration`
    (identities/:id/registration facet; absent/tombstoned →
    401 `unknown client`) → status/grant-type checks →
    `verifyClientAssertion` (JWS, crypto) → `nameFor` →
    `issueTokenPair` (as above, same tx shape).
  - props: the same atomic single-tx shape as token-exchange.
    Bad assertion → 401 `invalid_client`. Spent `jti` →
    401 `invalid_grant`, nothing minted. `jti` is
    required; it is not put on the token JSON.

### 3.9 `POST /authentication/authorize` — interactive front door

`postAuthorize` (`api/authentication.ts`) dispatches on
`method`.

- **`password`** → `authorizePassword`:
  - Server ZIP rejects a request that lacks S256
    (400, no pair) before the credential check. The
    browser ZIP keeps the soft path. The client sends
    S256.
  - `deriveIdentityPiiRows` (full-ledger scan) →
    `identityByEmail` → `deriveCredentialsFor` (identity-keyed)
    → `currentPasswordSecret` → `verifyPassword` (PBKDF2;
    server ZIP hashes new secrets with scrypt and
    rehashes on verify) → on
    success `formAuthPair` (pre-tx) → tx `[requests, responses]`:
    `putMessagePair(pair)`.
  - doctrinal: verify credentials, then `post_authorization_code`.
  - props: every failure returns the **same** 401 and appends nothing
    (no user enumeration); unknown-user / missing-secret paths run
    `equalizeFailureTiming` to close the timing channel; the STORED
    pair holds the request and response **verbatim** — password,
    code, and all (§5.2); PAIR-ONLY (Phase 13 Task 9 retired the
    `authorization_codes` row write — the issued code lives only
    as its own message pair; `authorizationCodeSpent` in the
    `authorization_code` grant arm above replaces the retired
    `codeState`-driven re-read as the spend check).
- **`passkey` / `provider` / `oidc`** → 501 seam; no pair is formed
  (only the successful password branch calls `formAuthPair`).
- default → 400, appending nothing.

### 3.10 `PUT /ideas/:id` — idea document write (not a POST)

One shape serves create, edit, and transition (Decision 7): the
body is the entity's own fields plus the lifecycle trio
(`state`, `state_at`, `state_event_id`). Genesis is
head-presence-defined — the first PUT at an id IS the birth.
Phase 2 Task 3 (R1) retired the separate composed `POST /ideas`
create that used to carry this; the PUT above was already the
genesis write.

- tx: `['requests','responses']`
- actual: `appendMessagePair(pair)` — the document body
  carries entity fields plus the lifecycle trio; head /
  Supersedes decided pre-tx; a byte-identical echo folds
  by message_hash.
- doctrinal: `put_idea_document` (lifecycle on the body;
  no separate states append).
- props: atomic; member-tier; `validateIdeaDocumentBody`;
  idempotent; MEMBER_ID CAVEAT — a state-unchanged edit must
  echo the same `state_event_id` (and trio); the lifecycle
  author is the first-seen pair's `requesterIdentityId` for
  that event id (body has no `member_id` field).

### 3.11 `POST /ideas/:id/conversion` — promote idea → project

The lone cross-aggregate write.

- tx: `['requests','responses']`
- actual: 3+N `appendMessagePair` calls (operation + project
  document with genesis trio + idea document with
  `promoted` trio + N baseline documents) when the gate
  supplied the bundle — pair-plane only.
- doctrinal: `post_op` + `put_project` + `put_idea` + N
  `put_baseline_score` as `post_convert_idea` (lifecycle on
  document bodies).
- props: atomic (project never lands without its baselines, nor an
  idea promoted without its project); member-tier (segment-prefix
  match on `/ideas`); `validateIdeaConversionBody`.

**3+N pairs, one tx (Phase 3 Task 4 + Phase 5 Task 5 + Phase 7
Task 4).** The route pre-forms 2+N extra pairs beside the
gate's own operation pair, ONLY when the gate supplied both a
pair and a fence organization — a below-facade caller
(`api/mock-data.ts`) skips all 3+N:

- **The project pair (Phase 3 Task 4)** — PUT-shaped, at
  `projects/:id`'s own address, body the entity's own fields
  plus the lifecycle trio, validated through
  `validateProjectDocumentBody` — byte-indistinguishable from a
  live genesis `PUT /projects/:id` (a fresh address;
  `headPairIdAt` finds no head, so this pair carries no
  `Supersedes`).
- **The idea pair (Phase 5 Task 5)** — PUT-shaped, at
  `ideas/:id`'s OWN address, body the promoted entity's own
  fields plus the `promoted` trio, validated through
  `validateIdeaDocumentBody` — byte-indistinguishable from a
  live `PUT /ideas/:id`. UNLIKE the project pair, the idea's
  address is NOT fresh — the idea already exists, so
  `headPairIdAt` finds its prior document pair and this one
  records `Supersedes` against it. **This closes the standing
  'promoted' watch-point** (named at Phase 2/3): before this
  task, a converted idea's derived state history MISSED its
  'promoted' event, because no pair recorded it.
- **The N baseline pairs (Phase 7 Task 4)** — one PUT-shaped
  pair per validated baseline, at
  `projects/:id/objective-baseline-scores/:sid`'s OWN address
  (the baseline's project-nested id), body the baseline's
  `fields` VERBATIM — the live standalone PUT body, key set
  `{project_id, objective_id, score, member_id, at}` — response
  via the existing `WRITE_RESPONSE_SPECS` entry for that route,
  so it is byte-indistinguishable from a live standalone `PUT
  projects/:id/objective-baseline-scores/:sid`. Every baseline
  id is client-minted FRESH per conversion, so each pair is
  genesis, like the project pair, never `Supersedes`.

All 3+N pairs share ONE `requestAt` (the conversion's own
origination) yet strictly-later response `at` stamps. 3+N pairs
commit or none: a mid-transaction failure (a state-ledger
collision, say) leaves zero of the 3+N, exactly like every other
atomic write in this catalog.

### 3.12 `POST /flows` — create flow

- tx: `['requests','responses']`
- actual: three `appendMessagePair` calls (operation, flow
  document with initial trio + graphDelta/revivals, project-
  flow join) when the gate supplied the bundle — pair-plane
  only.
- doctrinal: `post_op` + `put_flow` + `put_project_flow` as
  `post_create_flow` (lifecycle on the flow document body).
- props: atomic; member-tier; `validateFlowCreateBody`.

**Three pairs, one tx (Phase 4 Task 5), mirrored by work-orders'
own create (§3.17).** The route pre-forms two extra pairs beside
the gate's own operation pair, ONLY when the gate supplied both a
pair and a fence organization — a below-facade caller
(`api/mock-data.ts`) skips all three:

- **The operation pair** — the gate's own, at the SAME address a
  live genesis `PUT /flows/:id` would use: `createdEntityUriId`'s
  override collapses `POST /flows` onto `flows/:id`'s own
  (uriCollection, uriId), so the two verbs chain against one address.
- **The document pair** — PUT-shaped, at `flows/:id`'s own
  address, body `flowCreateDocumentBody(b)` (the flow's own five
  fields, the initial-state trio, the reduced graph via
  `reduceCreateGraphDelta`, and the two transitional sidecars
  `graphDelta`/`revivals`), validated through
  `validateFlowDocumentBody` — byte-indistinguishable from a live
  genesis `PUT /flows/:id`.
- **The join pair** — PUT-shaped, at `projects/:id/flows/:pfid`'s
  address, body the create's own `projectFlow` verbatim
  (`validateProjectFlowEntity` accepts exactly `project_id`/
  `flow_id`/`at`, so it doubles as the join pair's body without a
  second construction) — byte-indistinguishable from a live
  `PUT /projects/:id/flows/:pfid`. Genesis-undefined: a flow's
  create-time join is always fresh.

All three pairs share ONE `requestAt` (the create's own
origination) yet strictly-later response `at` stamps, so the
document pair — appended AFTER the operation pair — becomes the
entity address's head. A duplicate create (same flow id) therefore
records `Supersedes` on its own new document pair against the
prior document pair; the duplicate's own operation pair, reading
that SAME shared address fresh at gate entry, supersedes that same
prior document pair too (`POST` never rides the locked
four-outcome table — that arm is `PUT`-only on `flows/:id` itself,
§5.4 — so a duplicate create always chains via `Supersedes`, never
412s). Three pairs commit or none: a mid-transaction failure (a
state-ledger collision, say) leaves zero of the three, exactly
like every other atomic write in this catalog.

### 3.13 `PUT /flows/:id` — flow document write (not a POST)

One shape serves genesis (below-facade only — see §5.4) and
every save (Decision 7): the body is the entity's own fields
plus the lifecycle trio (`state`, `state_at`, `state_event_id`),
the client-authored post-save `graph` (byte-identical to the GET
wire form, no transform — GET reassembles from body.graph via
`flowEntityOf`), and two write-side SIDECAR-KEEP fields
(`graphDelta`, `revivals` — pair-plane RESTRICT/bindings via
`flowGraphBindingsFromPairs` in `api/derive-flows.ts`; the
old-plane relation writer `writeFlowGraphDelta` and
`deriveFlowGraphStates` are RETIRED). UNLIKE
`PUT /ideas/:id` / `PUT /projects/:id`, this op
mints NO `member_id` ternary — every attempt (including a
client retry) mints a fresh trio, so nothing here ever resends
a STORED trio verbatim.

**flows is the FIRST locked-class route** (§5.4): a
save on an existing flow must carry `If-Match`, echoing
the advertised `ETag` the client just read, or the write
428s / 412s. The client
adapter (`putFlow`, `web-app/app/adapters/flow-mutations.ts`)
absorbs a 412/428 with up to 3 attempts total — each retry backs off
(jittered) and rebuilds the body against the NEW head (a fresh
baseline, fresh delta, fresh trio) before resubmitting; any other
error, or a third 412, propagates to the caller. version-publish
is no longer an option embedded in this PUT (Decision 3), nor is
it a client-side prerequisite of this PUT any more (Phase 14
Task 8, undo-as-replay): `POST /flows/:id/versions` stays
unwired (405). Pair-chain `GET /flows/:id/versions` and
`GET /flows/:id/versions/:version` are live. Undo
resolves its restore target from THIS route's
own document-pair history (§3.14); nothing archives a
versions snapshot before a save.

- tx: `['requests','responses']`
  — NO `flow_versions`.
- actual: `appendMessagePair(pair)` LAST — document body
  carries entity fields, lifecycle trio, and
  graphDelta/revivals sidecars (SIDECAR-KEEP). Graph truth
  derives from the document body's `graph` field;
  no row-plane graph writes and no separate states append.
- doctrinal: `put_flow_document` (lifecycle + graph delta on
  the body).
- props: atomic; member-tier; `validateFlowDocumentBody`;
  idempotent (a byte-identical resend — SAME body, SAME echo —
  converges at the gate's pre-tx fast path) — a same-id,
  genuinely different-content collision still 409s via
  `LedgerImmutabilityError`, today's covenant.
- **Response-ID on GET.** `GET /flows/:id` carries a
  `Response-ID` header (pair locator) and an `ETag`
  (quoted 64-hex `documentVersion`) — the save echoes
  `If-Match`, not `If-Response-ID`. GET is hand-written
  `deriveFlow` so it can embed `hasUndoHistory`; it does
  not stream the stored PUT.
- **Undo advances the shadow head.** Undo forms its own
  document pair (PUT-shaped, at `flows/:id`'s own address) in
  the SAME transaction as its own operation pair. Undo
  therefore moves `flows/:id`'s own head exactly like any
  other save. A save racing an undo for the same head
  412s on the in-tx live-PUT latch; the client absorbs
  it with a jittered retry (`postFlowUndo`, web-app) — with NO
  baseline of its own to rebuild (Phase 14 Task 8): the SERVER
  re-resolves the restore target fresh against the new head on
  each attempt, so a retry is just a re-POST with a fresh
  `eventId`/`at`. Redo's own document half still rides
  `PUT /flows/:id` directly, unchanged.

### 3.14 `POST /flows/:id/undo` — undo a flow edit
### (undo-as-replay, Phase 14 Task 8)

Undo no longer requires a `flow_versions` row to consume —
`flow_versions` is not in this route's transaction at all any
more. The restore target is resolved SERVER-SIDE, pre-tx (the
IndexedDB auto-commit constraint bars anything but row ops
inside a transaction), by walking this flow's OWN `flows/:id`
document-pair history and this flow's OWN `flows/:id/undo`
operation-pair history together
(`resolveFlowUndoTarget`, `api/derive-flows.ts`): a stack+pointer
replay where a document pair correlated (by its STORED REQUEST
`at`, never the response `at`) to an undo operation pair only
moves the pointer back, never pushes a new logical state — the
one piece a naive "N pairs back" count gets wrong across an
undo-save-undo sequence. `target === undefined` is exhaustion
(nothing before the current head) — a graceful no-op, described
below.

- **Wire body** (`validateFlowUndoBody`) shrinks to the state
  trio's two free fields — `eventId`, `at` — both still
  client-minted (S1: body timestamps belong to the message's
  creator) so each attempt's stored request stays unique (an
  empty body would collide on the gate's idempotency fast path
  across separate undo calls for the same flow). Every OTHER
  field the pre-Task-8 body carried (`flow`, `consumedVersionId`,
  `graph`, `graphDelta`, `revivals`) is now resolved or computed
  by the route itself.
- tx (target resolved): `['requests','responses']` — NO
  `flow_versions` (table DELETED Phase Final).
- actual (target resolved): server computes graphDelta /
  revivals from CURRENT vs TARGET document-pair graphs
  (`api/flow-graph-diff.ts`); then `appendMessagePair(pair)`
  + `appendMessagePair(documentPair)` with the restore body
  (SIDECAR-KEEP). Pair-plane only.
- **Exhaustion is a graceful no-op, not an error.** When
  resolution finds no target, the route still appends its OWN
  operation pair alone — no document pair, no domain writes —
  since the gate requires every wired write to have stored a
  pair (`api.ts`'s "wired write stored no pair" guard fires
  otherwise). A LATER resolution walk correctly ignores this
  attempt: it carries no correlated document pair to displace
  anything. Send-time **201** either way — undo
  appends (target resolved or exhaustion). The
  client cannot and does not need to distinguish
  "restored" from "no-op" from the response alone
  (see `hasUndoHistory` below).
- **`hasUndoHistory` rides the flow's own GET, not this
  response.** `WRITE_RESPONSE_SPECS`-driven responses are
  computed PRE-HANDLER, from request params/body alone — this
  route's own 201 can never carry post-resolution data. Instead,
  `FlowWithGraph`/`FlowGraph` (§5.x) carry a `hasUndoHistory`
  boolean — this flow's own document-pair count exceeding one —
  computed by `flowEntityOf` (`api/derive-flows.ts`) and reused
  by the trailing `GET /flows/:id` the client already makes
  after every undo (and at page load), so the signal costs zero
  new wire reads.
- **SIDECAR-KEEP.** `graphDelta`/`revivals` still land in the
  restore's own document pair body, feeding
  the live graph reassembly on the next GET exactly like
  any other save's — the MECHANISM persists even though the
  VALUES are now server-computed rather than client-supplied
  (the client cannot diff against a target it is never told,
  since no new GET route is sanctioned for this).
- doctrinal: `post_op` + `put_flow_document` as
  `post_undo_flow` (lifecycle + graph delta on the restore
  document body).
- **Two pairs, one tx (or one pair, zero domain writes, on
  exhaustion).** Undo synthesizes a second pair — a PUT-shaped
  document pair at `flows/:id`'s own address
  (`put_flow_document`, §3.13), taking the FOLLOWS slot at the
  pre-undo head — beside its own operation pair; both append in
  the ONE transaction when a target resolves, so a pair count of
  two or one (exhaustion) or zero (a genuinely missing flow —
  `EntityNotFoundError`), never anything else. See §3.13's own
  note on the follows collision this creates.
- props: atomic; member-tier; `validateFlowUndoBody`.

### 3.15 `POST /flows/:id/redo` — retired (Phase 4 Task 4, R1/E5)

Redo is now a SINGLE write: the redo target's graph lands
through `PUT /flows/:id` (§3.13, the locked document save, which
also carries the revivals) — the two-write fold this section
originally described (archive the current state through
`POST /flows/:id/versions`, THEN save) collapsed to one write at
Phase 14 Task 8 (undo-as-replay): that archive existed solely to
give the OLD undo mechanism a `flow_versions` row to consume: now
that undo resolves its target from the `flows/:id` document-pair
history instead, this PUT's OWN document pair is exactly what a
LATER undo's pair-plane walk finds as "the state before the
redo," with no archive needed. Any fault — putFlow's own
exhausted retry or a non-412 error — propagates to the caller
(§3.13's own retry loop absorbs a 412 internally). The route
LEAVES THE URI TREE entirely: a request against it now 404s (no
pattern match), unlike the retired `POST /ideas` (§2.4/§3.10),
which 405s because `ideas` GET stays wired — `flows/:id/redo`
had no other verb left to survive it.

### 3.16 `POST /flows/:id/versions` — RETIRED (Phase 15 Task 7)

**Write route retired.** `POST /flows/:id/versions` is
unwired (405) — pair-chain GET on this address is live
(§2.10). The GET leaf
`/flows/:id/versions/:version` is live
(`documentVersionRoute`). Table-backed PUT/DELETE on
the leaf stay unwired (405). Historical POST shape
(kept for the dual-write-era record; do not
re-implement):

- tx: `['requests','responses']`
- actual: `flowVersions.put(id, version)`; for each
  `trimId`: `flowVersions.delete(trimId)`;
  `appendMessagePair(pair)`.
- **Zero live callers since Phase 14 Task 8
  (undo-as-replay).** Versioned edits and redo used to
  archive through this route before `PUT /flows/:id`;
  undo-as-replay stopped both. Phase 15 Task 7 removed the
  table-backed write routes and adapters; Phase Final
  DELETED the `flow_versions` table with the rest of
  the row plane.

### 3.17 `POST /work-orders` — create work order

- tx: `['requests','responses']`
- actual: three `appendMessagePair` calls (operation,
  work-order document, flow-work-order join) when the gate
  supplied the bundle. Lifecycle (start / post-start /
  creation-time claimed) is derived from those pairs, not a
  separate states append.
- doctrinal: `post_op` + `put_work_order` + `put_flow_work_order`
  as `post_create_work_order`.
- props: atomic; member-tier; `validateWorkOrderCreateBody`.

**The create-triple (Phase 5 Task 3), mirroring flows' own create
(§3.12).** The route (not `postWorkOrderCreationOp`) pre-forms two
extra pairs beside the gate's own operation pair, ONLY when the
gate supplied both a pair and a fence organization — a
below-facade caller (`api/mock-data.ts`) skips all three:

- **The document pair** — PUT-shaped, at `work-orders/:id`'s own
  address (the SAME address `POST /work-orders` collapses onto,
  via the registry's create-address override — §5.6), body
  `{display_id, flow_graph, position}` picked directly from the
  create body's `workOrder` (never spread verbatim, so a
  tolerated `organization_id` never leaks in) and validated
  through `validateWorkOrderDocumentBody` — byte-indistinguishable
  from a live genesis `PUT /work-orders/:id`.
- **The join pair** — PUT-shaped, at
  `flows/:id/work-orders/:woid`'s address, body the create's own
  `flowWorkOrder` verbatim (`validateFlowWorkOrderEntity` accepts
  exactly `flow_id`/`work_order_id`/`at`, so it doubles as the
  join pair's body without a second construction) —
  byte-indistinguishable from a live
  `PUT /flows/:id/work-orders/:woid`. Genesis-undefined: a work
  order's create-time join is always fresh.

All three pairs share ONE `requestAt` (the create's own
origination) yet strictly-later response `at` stamps, so the
document pair — appended AFTER the operation pair — becomes the
entity address's head. A duplicate create (same work-order id)
still appends; `(at, id)` reduction alone decides the new head
(`work-orders` is `'simple'` concurrency, §5.4 — last-writer-wins,
no `If-Match`, never 412s). Send-time **201** on append (§5.1).
Three pairs commit or none: a mid-transaction failure (a
state-ledger collision, say) leaves zero of the three, exactly
like every other atomic write in this catalog.

### 3.18 `PUT|GET|DELETE /work-orders/:id/claim` — claim

Create-only-style claim document. PUT first-success
**201**; GET returns `{member_id, expires_at}` (**200**)
or **404** only when unclaimed (no row or DELETE head);
DELETE releases (**204**). POST `/claim` is **405**.

```http
PUT .../work-orders/{work-order-id}/claim
{
  "claimEventId": "...",
  "claimAt": "...",
  "expireEventId": "...",
  "expireAt": "...",
  "expires_at": "..."
}
```

- tx: `['requests','responses']`
- actual: pair-plane claim history
  (`workOrderClaimHistoryFor` / derive) → if a live claim by
  another member → 409; by the caller → no-op; else
  `appendMessagePair(pair)` for the claim document (expiry
  + claim derive from pairs at read time). Send-time **201**
  on append (§5.1). GET reads
  `workOrderClaimDocumentFor`. DELETE appends a DELETE
  pair; DELETE head = unclaimed.
- doctrinal: claim-history read + claim pair as
  `put_claim_work_order`; unclaim as
  `delete_claim_work_order`.
- props: atomic; **TOCTOU-safe** (read + check + append
  ride one tx, so two concurrent claims cannot both see
  "no live claim"); idempotent for the current holder —
  the pair still appends, that call's only write;
  member-tier.

Pins: `tests/api-work-order-claim.test.ts`.

### 3.19 `POST /work-orders/:id/transition` — transition along an edge

Post-Phase-2 shape. Value-bearing transitions couple to the
bound instance head; pure node moves append the op only.

```http
POST .../work-orders/{work-order-id}/transition
If-Match: "<instance-head-etag>"
{
  "transitionEventId": "...",
  "targetState": "<node-id>",
  "instance_id": "...",
  "record_type_id": "...",
  "set": [ { "attribute_id": "...", "value": "..." } ],
  "clear": [ "attribute_id" ],
  "release": null,
  "transitionAt": "..."
}
```

- tx: `['requests','responses']`
- actual: one tx appends the transition **operation** pair
  (targetState, delta, optional release) and — when
  `set`/`clear` present — the instance **revision** pair
  (server-formed full-state document via
  `formDocumentPairFor`). Pure moves append the op pair
  only. No separate states or state_field_values row
  writes.
- doctrinal: transition op pair (+ instance revision when
  value-bearing; optional claim release) as
  `post_transition_work_order`.
- props: atomic (op + revision both-or-neither);
  member-tier; claim-agnostic server-side;
  `validateWorkOrderTransitionBody`.

**If-Match preconditions the BOUND INSTANCE head** — the
op's one mutable participant — not the request-URI
resource. Named RFC 9110 §13.1.1 deviation (A6): same
header, same hoist (already hash-covered), same 428/412
voice as direct instance PATCH (§5.4.1 / §5.20).
Vocabulary per the sibling's D3 register: missing → 428,
stale/race → 412, malformed → 400, spent identity /
conflict → 409.

**Presence rule (one-dialect-per-shape; A2).** When
`set`/`clear` are present: If-Match, `instance_id`, and
`record_type_id` are REQUIRED (assert equality with the
CURRENT bind). Pure moves (`set`/`clear` absent) carry
NEITHER If-Match NOR the bind-assert fields (400 if sent
either way). The server derives the bind itself wherever
a gate needs it.

**Legacy `fieldValues` key → 400 at the gate path.**
Hard cut (W2). Below-facade seed (`api/mock-data.ts`) may
still form historical legacy-shape transition pairs
carrying `fieldValues` bags — those bytes stay on the
ledger for history-fold audit; the live route rejects the
key.

**Status ladder (spec §HTTP status covenant items 1–11),
in order:**

1. 401 / 403 / 404 as today (WO fence + existence)
2. 400 body shape (incl. legacy `fieldValues` key;
   set/clear rules; If-Match on a pure move; assert
   fields on a pure move / missing with values — A2)
3. 400 bind assert mismatch, values on an unbound WO,
   or a required-ref exit on an unbound WO (A3)
4. 428 missing If-Match with values present
5. 400 malformed If-Match
6. 412 stale If-Match (pre-tx)
7. 403 attribute write ACL (all-or-nothing)
8. 400 value type / constraint violations
9. 400 required-at-exit violations (W10)
10. In-tx: live-head latch race → 412; nothing stored
11. 201 success on append (op + revision committed
    together)

Error bodies: house `{ "error": "<string>" }` only.
Pins: `tests/api-work-order-transition.test.ts`.

### 3.20 `POST .../record-types` — record-type write (create or edit)

`postRecordWriteOp` (`api/routes.ts`) at
`organizations/:organization-id/record-types` (admin-
gated; the flat `POST /records` address is RETIRED —
router 404). Wire body shape inherits the prior
create/edit kind discriminator (`kind`, field names,
trio keys); only the route address and policy tier
changed (admin, not member).

- tx: `['requests','responses']`
- actual: `validateRecordWriteBody(body)`; if removals,
  RESTRICT referrer check (pair-plane) → 409 rolls back;
  then the bundle's pairs appended LAST: operation,
  document (lifecycle trio on body), N attribute-PUTs,
  M attribute-DELETEs.
- doctrinal: `post_op` + `put_record_type` + attribute
  put/delete pairs as `post_write_record_type`.
- props: atomic; **RESTRICT** (a removed attribute still
  referenced 409s and rolls back the whole write, so no
  pair lands for it either); **admin-tier**.

**The bundle: 2+N (create) or 2+N+M (edit) pairs, one tx
(Phase 6 Task 4 — the migration's FIRST
VARIABLE-CARDINALITY synthesis; re-homed nested by the
org-nested record-types wave).** Unlike the
flows/work-orders create-triple (§3.12/§3.17, always
exactly three), a record-type write's pair count scales
with its own attribute arrays: the operation pair, the
document pair, one attribute-PUT pair per
`attributes[]` entry (N), and — edit only — one
attribute-DELETE pair per `removedAttributeIds` entry
(M; a create body has no `removedAttributeIds` field at
all, so M is always 0 there). The route pre-forms every
non-operation pair beside the gate's own operation pair,
ONLY when the gate supplied both a pair and a fence
organization — a below-facade caller (`api/mock-data.ts`)
skips them all:

- **The document pair** — PUT-shaped, at
  `organizations/:org/record-types/:id`'s own address
  (the SAME address nested `POST .../record-types`
  collapses onto), body `recordDocumentBodyOf(b)`: the
  entity's own three fields (`name`, `description`,
  `position`; `organization_id` excluded) plus the
  lifecycle trio — mapped from `initialState*` on
  create, carried verbatim from the body's own echoed
  trio on edit — validated through
  `validateRecordDocumentBody` (belt-and-suspenders:
  `initialStateEventId` carries no non-empty rule of
  its own on create, so an empty value 400s HERE rather
  than minting an invalid pair) — byte-indistinguishable
  from a live genesis/edit
  `PUT .../record-types/:id`.
- **N attribute-PUT pairs** — one per `attributes[]`
  entry, PUT-shaped at the nested
  `.../record-types/:type/attributes/:id` address, body
  `recordAttributeDocumentBodyOf(attr)` (entity fields
  minus `id` / `organization_id` / parent `record_id` —
  type id rides the uri prefix) — byte-indistinguishable
  from a live `PUT .../attributes/:id`.
- **M attribute-DELETE pairs** (edit only) — one per
  `removedAttributeIds` entry, DELETE-shaped at the SAME
  nested attribute address the attribute's own PUT pair
  used, status 204 with no body — every DELETE response
  is UNIVERSALLY 204 with no body (`api/api.ts`'s gate)
  — byte-indistinguishable from a live
  `DELETE .../attributes/:id`.

The shared BODY builders (`recordDocumentBodyOf`,
`recordAttributeDocumentBodyOf`) feed `formDocumentPairFor`
(`api/routes.ts`), the shared pair-FORMER this route now calls
directly for all three pair shapes above — including the
attribute-DELETE tombstones, via an explicit response override
(they stay SPEC-LESS, skipping `WRITE_RESPONSE_SPECS`) — Phase 9
Task 2 retired this route's own route-inline formation. The
seed's own invocation construction
(`api/mock-data/seed-message-pairs.ts`) still forms its pairs
independently — a different pipeline by design, with no
dispatched route to resolve a fence organization or response
spec from.

All pairs share ONE `requestAt` (the write's own origination) yet
strictly-later response `at` stamps, so the document pair —
appended AFTER the operation pair — becomes the entity address's
head, exactly like flows'/work-orders' own create (§3.12/§3.17).
A duplicate create (same record-type id) therefore records
`Supersedes` on its own new document pair against the PRIOR
document pair; the duplicate's own operation pair, reading
that SAME shared address fresh at gate entry, supersedes
that same prior document pair too (`record-types` is
`'simple'` concurrency, §5.4). The whole bundle commits or
none: a mid-transaction failure (a state-ledger collision,
or a RESTRICTed removal) leaves ZERO of the bundle's pairs,
exactly like every other atomic write in this catalog.

**The edit-only trio.** `RecordWriteEditBody` now carries
the SAME `state`/`state_at`/`state_event_id` keys
`PUT .../record-types/:id` (§3.33) accepts, with the SAME
validation rules — an edit body without them 400s before
ever reaching the referrer check above (step 5): the
RESTRICT proof depends on that ordering. The client
(`postRecordChange`, `web-app/app/adapters/records.ts`) echoes
the trio from the already-loaded detail model
(`RecordChangeEdit.state`/`stateAt`/`stateEventId`) — zero new
hops, mirroring the records list's/detail page's existing
no-attribute-change echo (§3.33). Create's own keys are
UNCHANGED (`initialState`/`initialStateEventId`/
`initialStateAt` remain R2's byte-pinned birth names).

### 3.21 `POST /objectives` — create objective

`postObjectiveCreationOp` (`api/routes.ts`).

- tx: `['requests','responses']`
- actual: three `appendMessagePair` calls (operation,
  objective document with lifecycle trio, revision document)
  when the gate supplied the bundle — pair-plane only.
- doctrinal: `post_op` + `put_objective` +
  `put_objective_revision` as `post_create_objective`.
- props: atomic; lifecycle on the document body (trio family);
  `validateObjectiveCreateBody`.

**Three pairs, one tx (Phase 7 Task 3), the flows/work-orders
fixed-triple precedent (§3.12/§3.17).** The route pre-forms two
extra pairs beside the gate's own operation pair, ONLY when the
gate supplied both a pair and a fence organization — a
below-facade caller (`api/mock-data.ts`) skips all three:

- **The operation pair** — the gate's own, at the SAME address a
  live genesis `PUT /objectives/:id` would use:
  `createdEntityUriId`'s override collapses `POST /objectives`
  onto `objectives/:id`'s own (uriCollection, uriId), so the two
  verbs chain against one address.
- **The document pair** — PUT-shaped, at `objectives/:id`'s own
  address, body `objectiveDocumentBodyOf(b)` (the create body's
  `objective` sub-object with `organization_id` stripped, plus
  the genesis lifecycle trio — the live `PUT /objectives/:id`
  wire body is `{position}` plus `state`/`state_at`/
  `state_event_id`),
  validated through `validateObjectiveDocumentBody` —
  byte-indistinguishable from a live genesis
  `PUT /objectives/:id`.
- **The revision pair** — PUT-shaped, at
  `objectives/:id/revisions/:rid`'s own address (`:rid` the
  create's own `revisionId`), body `objectiveRevisionBodyOf(b)`
  (the create's `revision` sub-object verbatim — already the
  exact `{objective_id, name, description, member_id, at}` shape
  `validateObjectiveRevisionEntity` admits), validated through
  the SAME validator — byte-indistinguishable from a live
  `PUT /objectives/:id/revisions/:rid`. This address is
  independent of the shared objective address above, so it is
  always genesis on a fresh create (a fresh `revisionId` per
  create), never `Supersedes`.

The shared BODY builders (`objectiveDocumentBodyOf`,
`objectiveRevisionBodyOf`) feed `formDocumentPairFor`
(`api/routes.ts`), the shared pair-FORMER this route now calls
directly for both pair shapes above — the records precedent
(§3.20); Phase 9 Task 2 retired this route's own route-inline
formation. The seed's own invocation construction
(`api/mock-data/seed-message-pairs.ts`) still forms its pairs
independently — a different pipeline by design, with no
dispatched route to resolve a fence organization or response
spec from.

All three pairs share ONE `requestAt` (the create's own
origination) yet strictly-later response `at` stamps, so the
document pair — appended AFTER the operation pair — becomes the
shared objective address's head. A duplicate create (same
objective id) therefore records `Supersedes` on its own new
document pair against the prior document pair; the duplicate's
own operation pair, reading that SAME shared address fresh at
gate entry, supersedes that same prior document pair too
(`objectives` is `'simple'` concurrency, §5.4). Three pairs
commit or none: a mid-transaction failure (a validation 400 on
the derived document or revision body, say) leaves zero of the
three, exactly like every other atomic write in this catalog.

### 3.22 `POST /invitations` — grant an invitation

`grantInvitation` (`api/invitations-domain.ts`).

- before tx (base-adapter reads):
  `callerActiveOrganization` →
  `callerIsOrganizationAdmin` (claim roles via
  `projectClaimRolesForOrganization`) → parse `email` →
  `deriveIdentityPiiRows` find the matching identity
  (404 if none) → `formWritePair` (a pre-tx head-read via
  `headPairIdAt` feeds the `Supersedes` chain)
  → the pre-tx idempotency point-read (`storedResponseFor`).
- tx: `['requests','responses']`
- actual: pair-plane guards (already-member; pending
  invitation derive) → on fresh: `appendMessagePair(pair)`
  (operation) + `appendMessagePair(document)` (invitation
  document with pending lifecycle); duplicate echo appends
  operation only (§5.11).
- doctrinal: member/pending guards + invitation document
  pair as `post_grant_invitation`.
- props: atomic; admin-only; idempotent on an outstanding pending
  invite (the duplicate-echo branch still appends its own pair);
  TOCTOU-safe (the guards ride the write tx, re-verified against the
  pre-tx read that formed the pair). The org is the admin's active
  org, not the path.

### 3.23 `POST /invitations/:id/acceptance` — accept

`acceptInvitation` (`api/invitations-domain.ts`). Accept writes
a seat, not a leftover `/memberships/:id` row.

- before tx: `loadInvitation` (`deriveInvitations` find-by-id;
  404 if absent);
  assert `identity_id === caller` (else 403); `formInvitationOpPair`
  (operation-addressed, no head-read) → the pre-tx idempotency
  point-read.
- tx: `['requests','responses']`
- actual: pair-plane invitation state guard (`accepted` →
  no-op pair; not `pending` → 409, nothing); already-member
  guard; if new member: `appendMessagePair(seatDocument)` —
  `PUT /organizations/:organization-id/members/:identity-id`
  at the invitation's organization, same Operation-ID as the
  accept; always `appendMessagePair(pair)` on no-op/pending
  paths. Seats win leftover `/memberships` rows until Task
  55.
- doctrinal: state guard + seat document pair + accept op
  pair as `post_accept_invitation`.
- props: atomic; invitee-only; idempotent (re-accept is a no-op,
  still its own genesis pair — never a `Supersedes` chain);
  the seat is written in the **invitation's** org, never the
  caller's active org; TOCTOU-safe.

### 3.24 `POST /invitations/:id/decline` — decline

`declineInvitation` (`api/invitations-domain.ts`).

- before tx: `loadInvitation`; assert invitee (403 otherwise);
  `formInvitationOpPair` → the pre-tx idempotency point-read.
- tx: `['requests','responses']`
- actual: pair-plane invitation state guard; `declined` →
  no-op pair; not `pending` → 409; else accept-style op
  pair with declined lifecycle.
- doctrinal: state guard + decline op pair as
  `post_decline_invitation`.
- props: atomic; invitee-only; idempotent, its own genesis pair; the
  invitation row persists as audit (no membership written).

### 3.25 `POST /invitations/:id/revocation` — revoke

`revokeInvitation` (`api/invitations-domain.ts`).

- before tx: `loadInvitation`; `callerIsOrgAdmin(inv.organization_id)`
  (403 otherwise); `formInvitationOpPair` → the pre-tx idempotency
  point-read.
- tx: `['requests','responses']`
- actual: pair-plane invitation state guard; `revoked` →
  no-op pair; not `pending` → 409; else revoke op pair.
- doctrinal: state guard + revoke op pair as
  `post_revoke_invitation`.
- props: atomic; admin-only; idempotent, its own genesis pair; the
  invitation row persists as audit.

### 3.26 Operator seed — mock data (in-process)

`postMockDataLoad` (`api/mock-data.ts`). Operator flag
`--seed-mock-data` calls it in-process on an empty database
and prints credentials once on stderr (A2).
There is no HTTP path. The seed forms and appends no pair for itself (none of
§5.1's headers appear). What it seeds includes **1498** of its own pre-formed
message pairs (`EXPECTED_PAIR_COUNT`) — see §5.3.

- **Four sequential steps, not one atomic op:**
  1. `ensureTables(TABLE_NAMES)`
  2. `transaction(TABLE_NAMES, postMockDataLoadIn)` — builds the
     dataset and writes the non-credential seed pairs in one tx (a
     mid-seed failure leaves no half-populated schema).
  3. `seedHumanCredentials(adapter)` — its **own** tx over
     `['requests','responses']` appends the 12 identity-credential
     pairs (part of the 1498 total); the PBKDF2 hashing runs outside
     the tx (async crypto cannot run inside a transaction).
     Final absolute remains `EXPECTED_PAIR_COUNT = 1498` after both
     txs.
  4. `postSchemaCreation()` — the schema marker stamps **last**, so a
     failed seed reads as empty and retries cleanly.
- returns `SeededCredentials` — plaintext sign-ins printed once on
  stderr. Never on the HTTP wire.

### 3.27 Operator seed — bootstrap (in-process)

`postBootstrap` (`api/mock-data.ts`). Operator flag
`--seed-bootstrap` calls it in-process on an empty
database and prints credentials once on stderr. Same
four-step shape as §3.26 — no pair for itself, below
the ledger — with
`postBootstrapIn` planting only the shell essentials (system actor, current
user, the singleton org — no Records) and its multi-pair bootstrap set: the
current-user human-member create bundle (operation + member + detail +
identity documents), membership, system member, PII, system identity,
default-org, and organization, plus credentials via `seedHumanCredentials` —
bootstrap absolute **12** (§5.3; `tests/mock-data-pairs.test.ts`). Returns
`SeededCredentials` on stderr.

### 3.29 `PUT /objectives/:id` — objective document write (not a POST)

The seventh family, a **trio** family on the document body
(`OBJECTIVES_WIRING.lifecycle: 'trio'`, §5.8 — states-address
retirement). `PUT` dispatches through
`documentPutHandler(OBJECTIVES_WIRING)`. The live wire body is
`{ position }` plus the lifecycle trio (`state` / `state_at` /
`state_event_id`); today's only web-app caller
(`putObjectivePosition`, drag-reorder) echoes the head trio with
the new position. There is no shared `states` log
(§2.10 / §5.8).

- tx: `['requests','responses']`
- actual: `validateObjectiveDocumentBody(body)` →
  `appendMessagePair(pair)` (pair-plane only; lifecycle trio
  on the document body).
- props: atomic; document-class (a repeat PUT records
  `Supersedes`, §5.1); `validateObjectiveDocumentBody`'s
  `assertOnlyKeys` label is `'Objective'` — matching
  `validateObjectiveEntity`'s own label byte-for-byte (a NAMED
  divergence from the `*DocumentBody` naming convention every
  other document validator uses), so the 400 body text this route
  raises is unchanged.

### 3.30 `PUT /members/:id` — edit a member directory row (not a POST)

The ninth family, and the FIRST `organizationNested:false` one
(§5.10). `PUT` now dispatches through
`documentPutHandler(MEMBERS_WIRING)`, replacing the hand-written
stand-in this section used to describe (in place of the
earlier-retired `makeIdRoute` factory) — the wire is UNCHANGED:
same GLOBAL plane (no organization stamping — the `members` row
carries no `organization_id`), same `{id, type}` response.
Registered since before Phase 1 but, as of this task, uncalled by
any web-app adapter: member edits go through the composed
`POST /human-members/:id` / `POST /ai-members/:id` operations
(§3.2, §3.4) instead, which already touch this same `members` row
as one of their own facet puts.

- tx: `['requests','responses']`
- actual: `validateMemberDocumentBody(body)` →
  `appendMessagePair(pair)` (pair-plane only).
- props: atomic; document-class (a repeat PUT records
  `Supersedes`, §5.1); `validateMemberDocumentBody`'s
  `assertOnlyKeys` label is `'MemberEntity'` — matching
  `validateMemberEntity`'s own label byte-for-byte (a NAMED
  divergence from the `*DocumentBody` naming convention every
  other document validator uses), so the 400 body text this route
  raises is unchanged; `documentWriteResponseSpec`'s
  registration-first consult (§5.10) omits the `organization_id`
  stamp for this family, so the 200 body stays `{id, type}` —
  byte-identical to what `validateMemberEntity` reconstructed
  before this task.

### 3.31 table-backed `flows/:id/versions/:vid` writes
### — RETIRED (Phase 15 Task 7)

**Table-backed PUT/DELETE retired** with the publish
op (§3.16). Pair-plane GET
`/flows/:id/versions/:version` is live
(`documentVersionRoute`, §2.10). Historical leaf
shape: DOCUMENT-class PUT/DELETE over
`flow_versions` with `appendMessagePair`. Cap-trim
splices that once lived inside the publish op are
gone with those writes; Phase Final DELETED the
table with the row plane.

### 3.32 `PUT /projects/:id` — project document write (not a POST)

One shape serves create, edit, and transition (Decision 7): the
body is the entity's own eight writable fields plus the
lifecycle trio (`state`, `state_at`, `state_event_id`). Genesis
is head-presence-defined — the first PUT at an id IS the birth.
`postProjectStateChange` (the adapter's transition op) now
mints a fresh trio and fires this SAME document PUT;
the shared event-append address is retired (§2.10).

- tx: `['requests','responses']`
- actual: `appendMessagePair(pair)` — entity fields plus
  lifecycle trio on the document body; pair-plane only.
- doctrinal: `put_project_document` (lifecycle on the body).
- props: atomic; member-tier; `validateProjectDocumentBody`;
  idempotent; MEMBER_ID CAVEAT — a state-unchanged edit
  replays the STORED head event's `member_id`, never the
  editing actor.

### 3.33 `PUT .../record-types/:id` — type document write

One shape serves create, edit, and transition (Decision 7):
the body is the entity's own three writable fields
(`name`, `description`, `position`) plus the lifecycle
trio (`state`, `state_at`, `state_event_id`). Genesis is
head-presence-defined — the first PUT at an id IS the
birth, though a type's genesis normally arrives through
the composed `POST .../record-types` (§3.20) instead;
this PUT's genesis arm exists for a live PUT-first flow
and mirrors ideas/projects exactly. Flat
`PUT /records/:id` is RETIRED (router 404).
`postRecordStateChange` (the adapter's transition op)
mints a fresh trio and fires this SAME nested document
PUT; the shared event-append address is retired
(§2.10). `GET .../record-types/:id` rides
`documentGetHandler`; `DELETE .../record-types/:id` is
the RESTRICT tombstone (§5.7). **Admin-tier** mutation
(schema surface).

- tx: `['requests','responses']`
- actual: `appendMessagePair(pair)` — entity fields plus
  lifecycle trio on the document body; pair-plane only.
- doctrinal: `put_record_type_document` (lifecycle on
  the body).
- props: atomic; admin-tier;
  `validateRecordDocumentBody`; idempotent;
  MEMBER_ID CAVEAT — a state-unchanged edit replays the
  STORED head event's `member_id`, never the editing
  actor.

### 3.34 `PUT /work-orders/:id/binding` — bind an instance

Binds a work order to one org-owned instance of one
record-type. Body:

```json
{ "instance_id": "...", "record_type_id": "..." }
```

→ **201** on first append. One binding op pair, one
tx — no document write, no instance revision. The
CURRENT bind derives from the WO's own binding
op-pair prefix (latest `(at, id)` wins) — claim-op
derive precedent. WO entity GET (detail and list
rows) EMBEDS the derived bind as `instance_id` +
`record_type_id` wire fields
(derive-at-read; never a document field; the
`hasUndoHistory` embed precedent).

- tx: `['requests','responses']`
- actual: derive current bind (op-pair prefix) → if a
  prior pair names a DIFFERENT
  `(instance_id, record_type_id)` → 409; else
  `appendMessagePair(pair)` for the binding op.
- doctrinal: binding op pair as `put_bind_work_order`.
- props: atomic; **TOCTOU-safe** (in-tx rebind check);
  **claim-agnostic** member-tier (A7 — parity with the
  transition op's shipped posture; workbox UX may still
  gate its own flows on the active claim);
  `validateWorkOrderBindingBody`.

**Status ladder (spec §HTTP status covenant), in order:**

1. 401 unauthenticated
2. 403 org fence / 404 absent WO (`missedReadError`)
3. 400 body shape
4. 404 instance or type absent under the fenced org
   (tombstone = absent; foreign = absent)
5. 400 `record_type_id` not among the flow's live
   joins
6. 409 already bound to a different pair (in-tx)
7. 201 on first append; byte-identical resend
   replays the stored send-time status

Pins: `tests/api-work-order-binding.test.ts`.

### 3.35 `POST /work-orders/:id/release` — RETIRED

**Write route retired.** `POST /work-orders/:id/release`
is unwired (router **404**). Live unclaim is
`DELETE /work-orders/:id/claim` (§3.18): no body;
DELETE head = unclaimed; GET then 404s. Pins:
`tests/api-work-order-release.test.ts`,
`tests/api-work-orders-verb-gaps.test.ts`.

---

## 4. Why composition is store-level, not HTTP-level

Every multi-noun POST above composes **store primitives** inside a
single `db.transaction([...tables])` — not by re-issuing HTTP routes.
This is forced, not stylistic:

- **The IndexedDB auto-commit constraint.** An `IDBTransaction` lives
  only while it has pending requests; awaiting any non-IDB work inside
  the transaction body (a timer, fetch, HMAC, gzip) yields to a
  macrotask and the transaction commits early. Re-entering
  `handleRequest` mid-transaction would do exactly that. So a handler
  holding a transaction can only `await` row ops — it physically
  cannot recurse through the router. The single transaction is what
  buys atomicity for the multi-table write.
- **The client makes one call.** The web-app adapters call the §1.3
  facade once per method; the fan-out is entirely server-side, within
  the handler's transaction.

### The one genuine internal HTTP sub-request: `facadeRequest`

`facadeRequest` (`api/api.ts`) is the sole place a request
re-enters `handleRequest`. For `/organizations/:org/:entity/...` it:

1. takes the caller's Bearer token,
2. calls `exchangeBearerForOrganization` (a self-delegation
   token exchange; a non-member is 403 — the tenant fence),
3. rewrites the path to the flat `/:entity/...`, swaps in the
   org-scoped access token, preserves the request id, and
4. **re-enters `handleRequest`** with the flat request.

Note what it is and isn't: it is method-agnostic (it forwards
`GET`/`PUT`/`POST`/`DELETE` alike), and it runs **before** any handler
or transaction opens — it is a routing/auth rewrite, not a POST
composing other operations. So even the one true internal request is
not a POST issuing sub-requests; it is the org fence re-dispatching the
*same* user request against the flat resource path.

---

## 5. The Shadow Ledger

The message plane IS the schema of record (Phase Final).
Every pair-wired write (`PAIR_WIRED_ROUTE_PATTERNS`, plus the
invitations/default-org side channels and the two
`/authentication` grant routes) appends one row to
`requests` and one to `responses` — sharing an `id` — as
the LAST (and only storage) act of its own transaction
(`appendMessagePair`, `api/message-pair.ts`). There is no
dual-write row half and no entity table beside the ledger.
§1.1 covers where this runs in the dispatch order; this
section covers what it produces on the wire, how a secret
crosses it, and how the seeded demo data carries its own
pre-formed pairs. The name "Shadow Ledger" is KEPT (load-
bearing section title + `api-shadow-ledger-*` test file
names); only dual-write/strangler qualifiers are retired.

### 5.1 Response headers and the wire-visible, UI-invisible class

A wired write's response — fresh or replayed — is rebuilt from the
STORED response row (`responseFromStored` / `sendWriteResponse`),
never re-serialized from the handler's live return value, and
carries headers derived from that same row (`wireHeadersFor`):

- **`Date`** — the row's own `at`, rendered IMF-fixdate
  (`new Date(at).toUTCString()`).
- **`Response-ID`** — the row's `id` (pair locator).
- **`Operation-ID`** — the 22-char id from the request
  (send-time; not stored on the GET-shaped blob).
- **`ETag`** — quoted 64-hex `documentVersion` of the
  body octets (later writes: body octets || matched
  tag). Pair id is **not** the ETag.

Send-time status: **201** if this request appended a
pair (PUT/PATCH/POST); **200** if it stored nothing
(same-body document PUT, or POST no-op). Stored PUT
start-line stays **200**. DELETE is **204**.
Byte-identical retry (`message_hash`) returns the
same send-time status as the first time.

Because the body is reconstructed by parsing the row's stored
`serializeWire` message (Latin-1), its top-level key order is
whatever formation chose — which need
not match the order the handler's own object literal would have
produced. **A byte-identical resend (the idempotency fast-path, §1.1)
returns the ORIGINAL stored row**, `Date` included — it is
never re-stamped "now" on a write replay. GET streams a
stored PUT with a fresh `Date:` and no `Operation-ID`.

**The locked class is the one named exception.** A
locked-family document GET (`flows/:id` today — §5.4, §3.13)
carries `Response-ID` as provenance. The save path
echoes the advertised `ETag` as `If-Match` (quoted
64-hex), not `If-Response-ID`. Missing If-Match over
a live PUT → **428**. The C6 retry loop branches on
the PUT's own failure status (`RequestError.status
=== 412` / `428`).

### 5.2 The verbatim-storage contract

Every wired write stores its request and response messages
**verbatim** — `serializeWire` Latin-1 (BYTEA on
Postgres). Request `message_hash` is
`sha256HexOfBytes` of those octets. There is no
masking step on the write path.

**Auth pairs hold live credentials.** The two
`/authentication/*` grant routes store passwords, usernames,
authorization codes, access tokens, `client_assertion`
values, and bearer `Authorization` headers as they arrived /
were issued. Refresh is cookie-only (not in the token
JSON) but a raw dump still has verbatim auth messages.
This is accepted on the **demo server**: messages stay
verbatim. Token-at-rest hashing is later. See
[ARCHITECTURE.md](ARCHITECTURE.md) § Demo server tier.

**Why auth routes stay replay-exempt.** Serving a stored auth
response would re-hand a single-use code or stale/revoked
tokens and would bypass the domain guards (code double-spend,
refresh reuse detection) that only fire when the handler
re-runs. Auth pairs are also keyed by id (`putMessagePair`),
not hash: two byte-identical logins each land a row, so
`message_hash` is not a per-call identity on these routes.

**The one remaining stored ≠ wire site** is invitations:
`grantInvitation` substitutes the resolved `identity_id` for
the wire `email` in the stored request body so the invitations
derive can read `identity_id` from the document body and so
two different invitees stay hash-distinct. Wire body is
untouched.

### 5.3 Seed pair formation (below the gate)

`--seed-mock-data` and `--seed-bootstrap` call `postMockDataLoad` /
`postBootstrap` in-process on an empty database (§3.26 / §3.27). There
is no HTTP seed path. What they seed is itself the output of
FIFTEEN pair-capable write families, in dependency order:
`human-members`, `ideas`, `idea-submissions`, `projects`, `flows`,
`work-orders`, `flow-work-orders`, `ai-members`,
`record-types` (nested; + attributes), `objectives`,
`memberships`, `members`, `organizations`,
`identities`, and `identity-credentials` (the last two, Phase 10
Task 6, §5.15; organizations, Phase 12 Task 3, §5.18), PLUS the
`identity_default_organizations` family's own writes (Phase 11
Task 8, §5.17) — no dedicated op wraps that family, so it stands
outside the FIFTEEN
(`buildMockDataInvocations`, `api/mock-data/seed-message-pairs.ts`),
so the seed forms each family's pair the SAME way a live
request would, then appends it on the pair plane only
(`requests`/`responses` — Phase Final deleted every entity
table; no dual-write beside a seeded row):

- The mock-data seed pre-forms **1498** message pairs — one pair per seeded
  row for most families, but each seeded human/AI member folds in an
  operation/member-document/detail-document triple (11 human-members +
  4 ai-members, each × 3 = 45 member-family pairs: 15 ops + 15 member
  documents + 15 detail documents, Phase 8 Task 4's bundle synthesis,
  the objectives-family 1+1+1 precedent generalized to the roster —
  see §3.1–§3.4), PLUS each seeded human ALSO folds in its OWN
  `identities/:id/pii` document pair (11 more — Phase 10 Task 2's
  intake decomposition, prose at §3.4: `postIdentityPiiDocumentOp`
  nested in the SAME transaction as the member-facet writes, ordered
  BEFORE `seedHumanCredentials` runs so its pii-presence filter still
  finds every login-capable person), PLUS each seeded human ALSO folds
  in its OWN `identities/:id` document pair (11 more — Phase 10 Task 5,
  §5.14: the human-member create-time bundle widens from a triple to a
  quadruple, human-only — an AI member forms no identities row,
  finding 10, so its own triple is unchanged), each seeded membership
  row folds
  in its OWN document
  pair (16 — 11 human-member-organization rows, `current` counted
  twice for its two-organization membership, + 4 ai-member rows,
  closed through `postMembershipDocumentOp`), the system member's own
  `members/:id` document forms ONE more pair (closed through
  `postMemberDocumentOp`, Phase 8 Task 5, the LAST whole-slice seed
  deferral to close), each seeded flow folds in an
  operation/document/join triple (4 creates × 3 pair triples + 1 genesis
  document = 13, §3.12), each seeded work order forms both a document
  pair and a join pair (145 + 145, §3.17), each seeded record folds
  in its OWN document pair plus one attribute-PUT pair per seeded
  attribute (2 operations + 2 documents + 14 attribute documents = 18,
  §3.20's bundle synthesis, generalized from flows'/work-orders' fixed
  1+1+1 to 1+1+N), each seeded objective folds in an
  operation/document/revision triple (5 creates × 3 = 15, §3.21, the
  flows'/work-orders' fixed 1+1+1 precedent verbatim), each seeded
  flow_records binding forms its own join pair (3 flow-record joins,
  closed through `postFlowRecordDocumentOp`), each seeded baseline/
  actual score row forms its own document pair (49 baseline + 92 actual
  = 141, closed through `postBaselineScoreDocumentOp` /
  `postActualScoreDocumentOp`), PLUS the 4 AI members + the system
  member each fold in their OWN `identities/:id` document pair (5
  more — Phase 10 Task 6, §5.15: a standalone invocation, not a
  bundle-widening, since neither create-time bundle ever carried
  one), PLUS every seeded human/system credential row folds in its
  OWN `identities/:id/credentials/:cid` document pair (12 more —
  11 human passwords + the system client secret, formed by
  `seedHumanCredentials`' OWN local pass-1/pass-2 split since a
  credential's hashed secret is unknown until PBKDF2 resolves),
  PLUS 0 role-grant pairs (retired: membership `type` carries
  privilege; mint bakes claims), PLUS 859 legacy work-order
  historical-trace `work-orders/:id/transition` op-shaped pairs
  (states-address retirement: 861 traces minus WO01's two
  value-bearing events, which migrate to the instance chain;
  field values fold into those transition bodies; no bare
  `states/:id` or field-values leaf seed pairs remain) + 6
  WO-instance SoT chain pairs (instance genesis + binding +
  Review/Complete new-shape ops each with a revision) + 1
  gate0001 Capture step, PLUS every seeded human member's OWN
  default-org event forms its OWN identity-keyed
  `identities/:id/default-org/` pair (11 more) —
  in a first pass, BEFORE the seed's own big transaction opens
  (`formWritePair`'s hashing is async crypto, which would
  auto-commit an IndexedDB transaction early if awaited inside
  one); a second pass then appends each pre-formed pair in one
  `['requests','responses']` transaction (pair-plane only —
  Phase Final deleted every entity table). The bootstrap seed
  forms exactly **twelve** such pairs (absolute; see
  `tests/mock-data-pairs.test.ts`). Total mock seed:
  **EXPECTED_PAIR_COUNT = 1498**.
- The scores deferral now closes WHOLE — baselines AND actuals, the
  SAME `buildSeedScoreRows` output (`api/mock-data/scores.ts`) driving
  both the pair formation above and the seeded row writes.
- Every seed pair carries **no `Authorization` header** — a seed
  invocation is not a real HTTP request, so `headerFields` is empty
  rather than a synthesized fake bearer.
- Every seed pair is **genesis** (`headPairId: undefined`) — a fresh
  database has nothing to supersede.
- `organization` is set per-entity, matching whichever org the seeded
  row itself belongs to (`undefined` for global entities like
  human-members and AI members).
- `requestAt` is minted ONCE per seed run and shared by every pair
  that run forms, so seeded pairs read as arriving together.
- `identity_default_organizations` (both seed paths' `seed-default-
  org-*` / `bootstrap-default-org-current` rows) STAYS RAW — the
  ROW write is unchanged — but each ALSO forms its own message pair
  now (Phase 11 Task 8, §5.17), closing the LAST family this seed
  deferred WHOLE (Phase 10 Task 6, §5.15).

### 5.4 The two PUT classes

Every document-class PUT belongs to a concurrency class
declared per family in `api/family-registry.ts`
(`ConcurrencyClass`: `'simple' | 'locked' | 'create-only'`)
and dispatched through `api/document-family.ts`'s generic
`documentPutHandler`. Registry rows today use only
`'simple'` / `'locked'`; the `'create-only'` arm exists on
the type for instance addresses (§5.4.1 —
`CREATE_ONLY_PUT_ROUTE_PATTERNS`, not
`documentPutHandler`).
The gate (`handleRequest`) keys the class off the route's
`documentFamilyWiring` entry ANDed with its family registration
— NEVER a blanket `DOCUMENT_CLASS_ROUTE_PATTERNS` read — so a
family can register `'locked'` (family-registry.ts) with no live
route riding the arm until its OWN wiring row lands.

- **`simple`** (`ideas`, `projects`, `work-orders` — §5.6;
  `objectives` — §5.8): a repeat PUT ALWAYS succeeds.
  Same-body as the live PUT head → **200**, no append.
  First append send-time **201**; stored start-line stays
  **200**.
- **`locked`** (`flows`, live — §3.13): a repeat PUT
  must echo the advertised `ETag` via `If-Match`
  (quoted 64-hex `documentVersion`), or 412s.
  Missing If-Match over a live PUT → **428**.

**The request header.** `If-Match` joins the hoisted,
hash-covered header set (`HOISTED_HEADER_NAMES`) — a different
echo is a different request, so a byte-identical resend (the
SAME echo) still hits the idempotency fast-path FIRST; a stale
echo on an otherwise-identical body is a NEW request, evaluated
against the six outcomes below.

**The six outcomes**, checked ONLY after the replay fast-path
MISSES (ordering is load-bearing: a byte-identical resend of an
already-succeeded locked write MUST replay, never 412):

- live PUT, If-Match absent → **428**.
- live PUT, If-Match malformed → **400**.
- live PUT, If-Match ≠ advertised version → **412**.
- live PUT, If-Match == advertised → proceed (same-body
  → 200 no append; else append 201).
- no live PUT, If-Match absent → genesis 201.
- no live PUT, If-Match present → **412**.

There is no `Follows` / `Supersedes` header or column.
Derivation never walks a chain — `(at, id)` reduction
alone decides the head. Pair `id` is `Response-ID`
only.

**The atomic backstop.** Two writers racing the SAME
echo both pass the pre-check; the in-tx live-PUT latch
closes the race (second writer 412). No pair is stored
for a 412 — the tx aborted or never opened.

**Status today:** `PUT /flows/:id` rides
`documentPutHandler` (`locked`). `flows/:id`
`GET` is hand-written (Phase 14 Task 8, undo-as-
replay): it calls `deriveFlow` directly so the response can
carry `hasUndoHistory` — a field the generic `entityOf`
contract has no slot for. GET does **not** stream the
stored PUT (G2). The GET response carries
`Response-ID` as provenance and `ETag` as the
advertised version.

### 5.4.1 Instance concurrency: PUT 405 + If-Match PATCH

Sibling dialect to §5.4's two PUT classes. Instances are
NOT on `DOCUMENT_CLASS_ROUTE_PATTERNS` (R10) and do NOT
ride `documentPutHandler`. Public PUT is **405**. PATCH
creates and updates. Wire **ETag / If-Match** is the
quoted 64-hex `documentVersion`.

- **PUT = 405.** No public create-only PUT. Adapter
  `putRecordInstance` still PATCHes (name lie).
- **PATCH = create or locked update.** Never-written +
  no If-Match → create (201). Live head requires
  exactly one strong If-Match validator (lists / `*`
  → **400**). Body `{ set?, clear? }` merges into the
  full-state head (`{ values }`). Missing If-Match on
  a live head → **428**; stale → **412**; tombstoned
  + no pin → **409** spent; + pin → **404**.
  Same-body PATCH still appends **201** (named
  residual).
- **409 vs 412 NAMED.** Address spent (tombstone or
  prior head on a create-shaped miss) is **409**.
  Lost-update on an existing live head is **412**.
- **ETag source.** Wire ETag is quoted 64-hex
  `documentVersion` of the projected GET body
  (instance GET advertises that hash, not the stored
  full-body `version`). If-Match parses exactly one
  strong validator.
- **Replay.** Byte-identical resend hits the
  idempotency fast path first. If-Match is hoisted /
  hash-covered, so two PATCHes differing only in
  If-Match are different messages. DELETE is
  tombstone-wins (replay → 204).

Full outcome / projection / history tables: §5.20.
The transition op (§3.19) is the second If-Match
consumer — same dialect, preconditioning the bound
instance head (named RFC 9110 §13.1.1 deviation).

### 5.5 ideas/projects/flows: generic components

`ideas/:id`, `ideas` (collection), `projects/:id`, `projects`
(collection) — plus their `WRITE_RESPONSE_SPECS` entries —
dispatch through `api/document-family.ts`'s generic
`documentEntityRoute` / `documentCollectionRoute` /
`documentWriteResponseSpec`, driven by a per-family
`DocumentFamilyWiring` (a lifecycle class, a not-found table,
a validator, a decompose op, and an entity mapper — §5.6)
rather than hand-written route objects. For `ideas`/
`projects` (`simple` concurrency, §5.4) the wire is byte-
identical to the routes it replaces. **`flows` PUT** (and its
`WRITE_RESPONSE_SPECS` entry) rides the same generic
`documentPutHandler` as `locked` concurrency (§5.4) — the
`If-Match` / `ETag` six-outcome machinery. **`flows`
collection + entity GET** are hand-written (`deriveFlows` /
`deriveFlow`) so entity GET can embed `hasUndoHistory`
(Phase 14 Task 8 un-flip). `flows` also keeps hand-written
`POST /flows` (create, §3.12) and `POST /flows/:id/undo`
(§3.14) outside generic dispatch. The untouched existing suite
plus `tests/document-family.test.ts`'s successBody and dispatch
pins are the absorption's proof.

### 5.6 The fourth family: work-orders and the stateless class

Task 2 (Phase 5) registers `work-orders` as the fourth
`DocumentFamilyWiring` row (`WORK_ORDERS_WIRING`, beside
ideas/projects/flows in `api/routes.ts`) and, on its evidence,
grows the wiring interface by two REQUIRED facts every family
now declares:

- **`lifecycle`: `'trio' | 'stateless'`.** ideas/projects/flows
  are `'trio'` — every document body folds in the Decision 7
  `state`/`state_at`/`state_event_id` trio, and a GET walks that
  history (`documentLifecycleEvents`/`stateHistoryFrom`/
  `currentDocumentState`) to 404 a lifecycle-deleted document
  too. `work-orders` is the FIRST `'stateless'` family: a work
  order's lifecycle is written ONLY by `POST /work-orders`
  (§3.17), `PUT /work-orders/:id/claim` (§3.18), `POST
  /work-orders/:id/transition` (§3.19), `PUT
  /work-orders/:id/binding` (§3.34), and `DELETE
  /work-orders/:id/claim` (unclaim) — never by a
  document PUT — so `validateWorkOrderDocumentBody` 400s a
  body carrying any trio key (the stateless covenant is
  validator-enforced, not caller discipline), and the generic
  GET-side lifecycle walk is skipped entirely for a
  `'stateless'` wiring (its only tombstone signal is a
  DELETE-method head, already absent via `deriveDocumentsAt`
  — the SAME reduction every family shares). History reads
  live on `GET work-orders/:id/history` and
  `GET work-orders/history` (§2.10) with inline
  `field_values`.
- **`notFoundTable`: the identifier the wire 404 body speaks**
  (`EntityNotFoundError`'s table, rendered `Not found:
  <table>/<id>`). Family name for ideas/projects/flows;
  `'work_orders'` for work-orders — a 404 label only (Phase
  Final deleted domain entity tables; surviving
  `EntityStore` keys are `requests`/`responses` only).

**PUT /work-orders/:id** now dispatches through
`documentPutHandler(WORK_ORDERS_WIRING)` — the SAME `'simple'`
concurrency class ideas/projects ride (§5.4) — and
`WRITE_RESPONSE_SPECS['work-orders/:id']` is
`documentWriteResponseSpec(WORK_ORDERS_WIRING)`. **GET
/work-orders/:id** is a binding wrapper around
`documentGetHandler(WORK_ORDERS_WIRING)`: after the document
entity, one `workOrderBindingFor` may add optional
`instance_id` / `record_type_id` when bound (keys ABSENT when
unbound — unbound wire bytes match the five entity keys).

**Unbound GET wire keys.** The response's `{id,
organization_id, display_id, flow_graph, position}` and the
404 body (`Not found: work_orders/<id>`) match the prior
hand-written unbound shape; when bound, GET also embeds
`instance_id` / `record_type_id`. The suite
(`tests/api-work-orders-create.test.ts`) plus
`tests/api-work-order-document.test.ts`'s below-gate op pin
and byte-identical-resend case are the absorption's proof;
`tests/api-work-orders-verb-gaps.test.ts` additionally pins
the **18** deliberate verb gaps the family still carries
(PUT/DELETE `work-orders`; POST/DELETE `work-orders/:id`;
every verb on `/claim`, `/transition`, and `/binding` but
their own POST; POST/PUT/DELETE `flows/:id/work-orders`;
GET/POST `flows/:id/work-orders/:woid` — its DELETE already
pinned in `api-flows-verb-gaps.test.ts`).

### 5.7 The fifth family: record-types (nested) and the DELETE-pair filter

Phase 6 Task 2 registered the fifth
`DocumentFamilyWiring` row as flat `records`
(`RECORDS_WIRING`, `'trio'`). The org-nested
record-types wave re-homes that family:

- **Wire = storage** at
  `organizations/:org/record-types[/:id]`.
- Flat `/records[/:id[/history]]` and
  `/record-attributes[/:id]` are RETIRED (router 404;
  unauth → 401 first).
- Family registration name is `record-types` /
  storage name `record_types`; lifecycle alphabet and
  DELETE-pair filter posture are unchanged.
- Nested attributes replace flat `record-attributes`
  (still `'stateless'` SIMPLE PUT; ACL arrays on the
  document; RESTRICT gains a live-instance-head leg).
- Nested instances are a **separate** surface (§5.20)
  — not DOCUMENT_CLASS, not trio.

`'trio'` election (Decision 7 as amended) still holds:
a family is `'trio'` when its lifecycle fits the trio
(a single current state, authored once per transition,
folded into the SAME document PUT that edits its
entity fields) rather than `'stateless'`. Record-types'
active/archived/deleted lifecycle fits the trio exactly
as ideas/projects/flows' does.

Record-types remain the FIRST trio family whose `:id`
address carries a live `DELETE` beside a `'trio'` PUT.
`documentLifecycleEvents` (`api/derive-documents.ts`)
SKIPS a DELETE-method pair entirely (Author gate 9), so
a delete-then-recreate history (`PUT`, `DELETE`, `PUT`)
yields the two PUT trios rather than crashing on an
empty DELETE body.

**Type DELETE RESTRICT** is net-new vs the old bare
tombstone: any live (non-tombstoned) instance under the
type, OR any live `flows/:id/records` join naming the
type → **409** naming the blockers.

**PUT .../record-types/:id** is inline (param index 1 is
`:record-type-id`), reusing `postRecordDocumentOp` — not
`documentPutHandler` (that factory always takes param 0 as
id). Task 23 retired flat `RECORDS_WIRING` /
`RECORD_ATTRIBUTES_WIRING`; no nested
`DocumentFamilyWiring` row exists for record-types.
Family-registry concurrency stays `'simple'` (§5.4) —
last-writer-wins (admin-only mutation volume; no If-Match
this wave). Collection/entity `GET` are likewise inline
derives. Composed create/edit is `POST .../record-types`
(§3.20), admin-gated.

Adapters (`web-app/app/adapters/records.ts`) speak the
nested path; `putRecord` / `postRecordStateChange`
still carry the lifecycle trio in camelCase at the
wire seam. The list drag-reorder and detail no-
attribute-change save echo the trio from data already
loaded — zero new hops.

### 5.8 The seventh family: objectives (trio, simple concurrency)

Task 2 (Phase 7) registered `objectives` as the seventh
`DocumentFamilyWiring` row (`OBJECTIVES_WIRING` in
`api/routes.ts`). States-address retirement flipped it from the
old `'stateless'` / absence-as-active doctrine onto
`lifecycle: 'trio'` — the FIFTH trio family. The three retired
rationales (wire body cannot grow a trio; genesis would abort a
states pin; absence-as-active on a shared `states` log) no
longer hold: the document body **carries** the lifecycle trio,
genesis is an explicit minted event, and there is no shared
`states` plane.

- **`notFoundTable` is `'objectives'`** — its storage table name
  matches its family name, like ideas/projects/flows/records
  (work-orders/record-attributes are the two families whose
  names diverge).
- **`lifecycle: 'trio'`** — PUT body is entity fields
  (`position`) plus `state` / `state_at` / `state_event_id`
  (`validateObjectiveDocumentBody`). PUT **response** still
  returns entity fields only (`{id, organization_id,
  position}` via the write-response spec). GET embeds the
  lifecycle trio on the derived row
  (`objectiveDocumentEntityOf`).
- **Concurrency:** `'simple'` (§5.4) — last-writer-wins,
  no `If-Match`. Same-body → 200 no append.
- **Archived inclusion:** `GET /objectives` INCLUDES archived
  objectives — deliberate CONTRAST to records' deleted-
  exclusion (§5.7); nothing in the objective alphabet is
  `'deleted'`, so no derived read filters one out.

**PUT /objectives/:id** dispatches through
`documentPutHandler(OBJECTIVES_WIRING)` — and
`WRITE_RESPONSE_SPECS['objectives/:id']` is
`documentWriteResponseSpec(OBJECTIVES_WIRING)`. **GET
/objectives/:id DERIVES from the ledger** through the generic
`documentEntityRoute(OBJECTIVES_WIRING)` — `entityOf` is the
LIVE reader and constructs the wire row with id first, then
entity + embedded trio.

**The wire covenant, precisely scoped.** PUT request body is
position + trio; PUT response entity keys stay
`{id, organization_id, position}` (lifecycle does not leak
onto the write response). Stray-key 400 stays byte-identical
(`unexpected key "..." for Objective` — the label mandate,
§3.29). GET key order is id-first (`objectiveDocumentEntityOf`),
JSON-semantically and client-invisible.

`tests/api-objective-document.test.ts` (the below-gate op/
validator pins, the PUT-chain-derives-the-head case, and the
DELETE-derives-absent case, all run against the REAL registered
wiring row) plus the untouched existing suite
(`tests/api-shadow-ledger-objectives.test.ts`'s `Supersedes`/
resend/hash-parity assertions) are the absorption's proof;
`tests/api-objectives-verb-gaps.test.ts` additionally pins all
22 deliberate verb gaps across the eight objectives/scores
route patterns: PUT/DELETE `objectives`; POST/DELETE
`objectives/:id`; POST/PUT/DELETE `objectives/:id/revisions`;
GET/POST/DELETE `objectives/:id/revisions/:rid`; POST/PUT/DELETE
`projects/:id/objective-baseline-scores`; GET/POST/DELETE
`projects/:id/objective-baseline-scores/:sid`; POST/PUT/DELETE
`projects/:id/objective-actual-scores`; GET/POST/DELETE
`projects/:id/objective-actual-scores/:sid`.

### 5.9 The eighth family: memberships and the no-fork ruling

Task 2 (Phase 8) registers `memberships` as the eighth
`DocumentFamilyWiring` row (`MEMBERSHIPS_WIRING`, beside
ideas/projects/flows/work-orders/objectives in
`api/routes.ts` — sixth live registration after Task 23
retired flat `RECORDS_WIRING` / `RECORD_ATTRIBUTES_WIRING`)
— the FOURTH `'stateless'` family, with yet another distinct
rationale from the other three. Work-orders' `'stateless'` is
vacuous-in-practice (its lifecycle CAN be authored, just never
through the document address, §5.6); objectives' rides the
`states` log's own absence-as-active covenant (§5.8);
memberships carries NO lifecycle concept WHATSOEVER — a pure
join relation (Codd's own teaching: the identities of the
joined, plus the moment of union) — joining record-attributes'
vacuous-BY-CONSTRUCTION bucket as its historical sibling
(Task 23 retired that flat wiring), not standing alone against
work-orders' as record-attributes' own comment once implied.

**The no-fork adjudication (Author gate 3).** §5.8 named a
THIRD distinct `'stateless'` rationale (objectives') as the
trigger for a type-level fork (Commandment IX: three is
pattern), read at the time as the next family author's binding
expectation. The roster phase settles it instead: a FOURTH
distinct rationale (memberships', above) arrived with no fork
needed, and the roster's remaining families (`MEMBERS_WIRING`,
Task 3 onward) share the SAME `states` log WITH a genesis event
— a FIFTH bucket, still no fork. `'stateless'` stays ONE type
covering every one of them; the §5.8 comment's "type-level
fork" claim now reads as history, not standing doctrine.

- **`notFoundTable` is `'memberships'`** — its storage table
  name matches its family name, like ideas/projects/flows/
  records/objectives (work-orders/record-attributes are the two
  families whose names diverge).
- **GET is FLIPPED (Task 8)** onto
  `documentGetHandler(MEMBERSHIPS_WIRING)` /
  `documentCollectionGetHandler(MEMBERSHIPS_WIRING)` — wire-
  identical to the old-plane getById/getAll it replaced.
- **DELETE stays hand-written** — the `records/:id` template
  (§5.7): no generic DELETE component exists for any family;
  memberships DELETE is a pure pair-plane tombstone append.

**PUT /memberships/:id** now dispatches through
`documentPutHandler(MEMBERSHIPS_WIRING)` — the SAME `'simple'`
concurrency class every other document family but flows rides
(§5.4) — and `WRITE_RESPONSE_SPECS['memberships/:id']` is
`documentWriteResponseSpec(MEMBERSHIPS_WIRING)`.

**The wire covenant, precisely scoped.** ZERO deltas in request
shapes, response key sets + values, statuses, headers, and hop
counts. UNLIKE objectives' fence-stamped-only `{position}` body,
memberships' entity carries its OWN `organization_id` on the
wire — all four keys (`organization_id`, `identity_id`,
`type`, `at`) REQUIRED (`type` is `admin`|`member`; the
accept path stamps `type: 'member'` the same way); none
tolerated-but-optional; `organization_id` rides the document
body and the write-response spec's fence organization
(pair-plane only — no org-scoped EntityStore stamp), so the
wire acceptance and the stored pair body agree whenever a
client's own organization_id is honest. THE
LABEL MANDATE: the stray-key 400 body stays byte-identical
(`unexpected key "..." for MembershipEntity` — matching
`validateMembershipEntity`'s OWN label, NOT the
`MembershipDocumentBody` naming convention every other
`*DocumentBody` validator uses); the missing-key 400s are the
SAME `assertOnlyKeys` call on both paths, so they too are
unchanged.

`tests/api-membership-document.test.ts` (the below-gate op/
validator pins, the PUT-chain-derives-the-head case, and the
DELETE-derives-absent case, all run against the REAL registered
wiring row) plus the untouched existing suite
(`tests/api-shadow-ledger-memberships-invitations.test.ts`'s
`Supersedes`/resend/wire-body-matches-domain-read assertions)
are the absorption's proof; `tests/api-roster-verb-gaps.test.ts`
additionally pins the WHOLE roster surface's verb gaps, both
dispatch regimes: 19 route-table 405s across the nine roster
`route()` patterns (`members`, `ai-members`, `ai-members/:id`,
`human-members`, `human-members/:id`, `memberships`,
`memberships/:id`, `current-member`, `members/:id`); 18
invitations-facade 404s (the side channel never calls
`matchRoute`) across its five real shapes (`invitations`,
`invitations/sent`, `invitations/:id/acceptance`,
`invitations/:id/decline`, `invitations/:id/revocation`) plus
one bogus-path shape (`invitations/:id` bare) on every verb — 37
combos, 15 patterns total.

### 5.10 The member directory: the first global-plane families

Task 3 (Phase 8) registers `members`, `ai-members`, and
`human-members` as the ninth, tenth, and eleventh
`DocumentFamilyWiring` rows (`MEMBERS_WIRING`,
`AI_MEMBERS_WIRING`, `HUMAN_MEMBERS_WIRING` in `api/routes.ts`)
— the FIRST `organizationNested:false` ("global-plane")
registrations of any wiring row. **Split lifecycle class:**
`MEMBERS_WIRING` is `lifecycle: 'trio'` (document-address
lifecycle on `members/:id` — genesis at create;
archive/reactivate via a later PUT carrying a new trio).
`AI_MEMBERS_WIRING` and `HUMAN_MEMBERS_WIRING` remain
`'stateless'` **detail facets** (no independent lifecycle —
they do not carry a trio of their own). States-address
retirement retired the dual-plane / FREEZE-at-genesis story:
lifecycle lives only on the members parent document. History
reads live on `GET members/:id/versions` (§2.10); the members
GET row embeds the lifecycle trio for head state.

**The blocking fix (`api/document-family.ts`).**
`documentWriteResponseSpec` unconditionally stamped
`organization_id: organization` before spreading the validated
entity — a no-op for the eight org-nested families registered
before this task (their entities already carry
`organization_id`, so the spread overwrote the stamp with the
SAME value), but a WIRE-VISIBLE EXTRA KEY for a global-plane
family, whose entity carries no such field at all. The fix: the
constructor now consults
`familyRegistration(wiring.family)?.organizationNested` and
OMITS the `organization_id` line entirely when it is `false` —
mirroring `canonicalUriCollection`'s own registration-first pattern
(`message-pair.ts`). Two pre-existing, untouched pins are the
regression proof this fix is byte-safe both ways: "PUT
members/:id appends its pair..." and "PUT ai-members/:id
appends its pair..." (both in
`tests/api-shadow-ledger-members-identities.test.ts`) stayed
green, unmodified, through every commit of this task.

- **`notFoundTable` diverges for two of the three** —
  `'ai_members'` and `'human_members'` (the storage table names,
  `db-backed.ts`'s `EntityStore` keys) versus their hyphenated
  family/route names, the SAME divergence work-orders/
  record-attributes established; `'members'` matches its family
  name.
- **`human-members/:id` gains NO live PUT.** Its wiring row
  registers (`documentOp`/`entityOf` fully shaped) but serves no
  route — the FIRST registered family without a live document
  PUT. `PUT /human-members/:id` still 405s (the Task 2 verb-gap
  pin, `tests/api-roster-verb-gaps.test.ts`, proves it survives
  untouched); the row exists for a future synthesis/seed caller
  only.
- **GET is FLIPPED (Task 8)** for all three onto
  `documentGetHandler` / `documentCollectionGetHandler` of
  each wiring row — same flip as memberships (§5.9).

**PUT /members/:id** and **PUT /ai-members/:id** now dispatch
through `documentPutHandler(MEMBERS_WIRING)` /
`documentPutHandler(AI_MEMBERS_WIRING)`, and
`WRITE_RESPONSE_SPECS['members/:id']` /
the `'ai-members/:id'` `PerVerbWriteResponseSpec`'s `put` arm
are each `documentWriteResponseSpec(...)` of the matching row —
the SAME `'simple'` concurrency class every document family but
flows rides (§5.4). The `'ai-members/:id'` `post` arm (the
composed edit) is untouched.

**The wire covenant, precisely scoped.** ZERO deltas in request
shapes, response key sets + values, statuses, headers, and hop
counts — the blocking fix above is what MAKES this true for a
global-plane family; without it, `organization_id` would have
leaked onto both wires. THE LABEL MANDATE, both families: the
stray-key 400 stays byte-identical to `unexpected key "..." for
MemberEntity` / `AIMemberEntity` (matching
`validateMemberEntity`/`validateAIMemberEntity`'s OWN labels,
NOT the `*DocumentBody` naming convention); the missing-key 400s
and, for ai-members, the unknown-model-id 400, are the SAME
calls on both paths, so all stay unchanged.
`validateHumanMemberDocumentBody` carries the SAME label
mandate (`'HumanMemberEntity'`) though no live route raises it
yet.

`tests/api-member-documents.test.ts` (the validator accept/
reject cases for all three families, the below-gate op pins,
the E6 byte-identical-resend pin for the two LIVE routes, and
the PUT-chain-derives-the-head / DELETE-derives-absent cases
against all three REAL registered wiring rows) plus the
untouched existing suite
(`tests/api-shadow-ledger-members-identities.test.ts`'s
`Supersedes`/resend/wire-body-matches-domain-read assertions,
and `tests/api-roster-verb-gaps.test.ts`'s full 37-combo pin,
including `human-members/:id`'s surviving 405) are the
absorption's proof.

### 5.11 The invitation document plane: grant + accept synthesis

Phase 8 Task 6 gives the invitations side channel
(`api/invitations-domain.ts`, §2.12/§3.22-3.25) its own
document pairs and derivation, WITHOUT joining the route
table — Author gate 2 is permanent: no `route()` entry, no
`DocumentFamilyWiring` registration, no `WRITE_RESPONSE_SPECS`
entry for `invitations/:id` exists or ever will. Task 8
flipped `invitationsForInvitee` / `sentInvitations` onto
`deriveInvitations` (`api/derive-invitations.ts`); the pairs
are the live invitation read source. Author gate 2 still
holds (no `route()` / wiring).

**Grant: 2 pairs on a fresh outcome, 1 on a duplicate echo.**
`grantInvitation` forms its existing operation pair (POST,
`/invitations/`, `uriId` = the client-minted `invitationId`) as
before; on the 'fresh' outcome ONLY it ALSO forms a PUT-shaped
invitation DOCUMENT pair at the SAME `(uriCollection, uriId)` —
body `{organization_id, identity_id, at}`, the entity minus
`id`, so the wire NEVER carries the invitee's email (already
resolved to `identity_id` at the gate). There is no live PUT
route for `invitations/:id` to mirror (Author gate 2), so the
response is hand-built to the stored-row shape (`{id,
...body}`) rather than consulting a `WRITE_RESPONSE_SPECS`
entry — the synthesized-only class, like the human-members
detail document (§5.10) has no live-PUT twin either. A
duplicate (idempotent-echo) grant's operation pair sits at the
DUPLICATE's own submitted id, but `deriveDocumentsAt`'s
`DOCUMENT_METHODS` filter excludes POST — only a PUT/DELETE
pair is ever a document head — so even if a document WERE
formed there it could never derive; this task forms nothing at
all for that outcome, belt-and-suspenders. Every conflict path
(already-member, the in-tx race-disagreement throw) forms and
appends nothing, unchanged.

**Accept: the seat document — same Operation-ID.**
`acceptInvitation` forms a PUT-shaped seat document pair
pre-tx — address
`PUT /organizations/:organization-id/members/:identity-id`
at the INVITATION's organization (never the caller's
active org), `uriId` = the invitee's identity, body
`{type: 'member', at}`, same Operation-ID as the accept
op pair. Response via `WRITE_RESPONSE_SPECS` for that
seat pattern — the SAME spec a live admin `PUT` of a
seat resolves. Formed pre-tx (crypto cannot run inside a
transaction body) but appended ONLY inside the
`!already` branch: a re-accept that finds a membership
already present, or a 409 conflict, appends no seat
either. Seats win leftover `/memberships` rows until
Task 55.

**The op addresses are unchanged and carry no document.**
Accept/decline/revoke each still form their existing
operation-addressed pair at `/invitations/<id>/<op>/` (`uriId`
`''`, never a head-read, a repeat op always its own genesis
pair) — `deriveInvitations`'s state derivation reads exactly
this shape, unchanged by this task.

**`api/derive-invitations.ts`: `deriveInvitations(db)`.** The
invitation ROW comes from the grant's document head at the
flat `/invitations/` address (one keyed `getAllWhere` read per
store — `deriveDocumentsAt`, unchanged from every prior
family). Its STATE comes from a SEPARATE reduction: an
invitation's lifecycle never rides the document address (no
trio field has room in the wire body), so state is read off
op-address PAIR PRESENCE instead — 'accepted' iff any
`/invitations/<id>/acceptance/` pair exists for the id,
likewise 'declined'/'revoked', else 'pending'. This is the E13
FULL-SCAN NAMED CLASS: no index serves "every request whose
`uri_collection` has the shape `/invitations/<id>/<op>/`" for an
arbitrary id, so this ONE reduction reads `db.requests.getAll()`
in full, regardless of invitation count; its measured cost is
recorded at the Task 9 CLI leg, not here. Mutual exclusivity of
the three terminal states is the domain gate's OWN covenant
(accept/decline/revoke each require 'pending' to succeed; a
409 conflict appends nothing), never re-derived in this
module — an id accumulates repeat pairs of only ONE op kind.
Reads `db.requests`/`db.responses` ONLY; domain readers call
it (Task 8 done). Author gate 2 still holds (no `route()`).

**The gate-resolve settlement needs zero code change.** Today's
grant already resolves the invitee's `email` to `identity_id`
at the HTTP gate (before either pair forms) and stores only
the reference — so the document body's email-free shape is the
identity_id substitution the gate already performed, now simply
persisted. A reader expecting a diff here finds none.

`tests/api-invitation-document.test.ts` (fresh/duplicate/failed
grant; fresh/no-op accept; `deriveInvitations` round-tripping
all four terminal states; a no-op replay; hash + balance across
a mixed grant/accept/decline sequence) plus the re-pinned
`tests/api-shadow-ledger-memberships-invitations.test.ts` (grant
balance 1→2, duplicate 2→3; accept balance re-pinned per
outcome) and the ADDITIVE `tests/api-invitations-fence.test.ts`
KEEP-ATOMIC pin (a removed member's re-accept stays a no-op,
proven pass-first against the PRE-task code, Author gate 6e)
are the proof.

### 5.12 The /pii hard-delete zone: single-slot erasure

Phase 10 Task 3 gives `identities/:id/pii` (§2.2) the message
plane's ONE sanctioned exception to the append-only covenant
every other family honors. `replacePiiSlot`
(`api/pii-hard-delete.ts`) is THE ONLY code path that deletes
rows from `requests` or `responses` — grep-provable. Its two
callers (`postIdentityPiiDocumentOp`'s PUT,
the `identities/:id/pii` DELETE closure — both `api/routes.ts`)
open only `['requests', 'responses']` (Phase Final Task 2
stripped the `identity_pii` ROW half — pair-plane only). The
zone rides that SAME transaction, never a second one
(Commandment X — wrap the indivisible in the platform's
existing primitive).

**The single-slot register.** Every write at the address —
PUT or DELETE — enumerates whatever pair(s) currently occupy it
by ONE scan (`requests.getAllWhere('uri_collection', ...)`), deletes
THAT id-set from BOTH tables, then appends its own pair. A PUT
leaves a PUT pair (the PII document); a DELETE leaves a DELETE
pair (a bodyless erasure tombstone — evidence of erasure without
erased content). Supersession and erasure are the SAME
mechanism: PUT-PUT leaves exactly one (the latest) PUT pair;
PUT-DELETE leaves exactly one tombstone; DELETE-PUT re-sets the
slot to exactly one fresh PUT pair.

**THE SINGLE-AUTHORITATIVE-ID-SET RULE.** `responses` is NEVER
re-scanned independently and trusted to agree with `requests` —
two independent scans could disagree (a pre-existing torn pair,
a mid-flight anomaly), and reconciling them defensively would be
Internal Defense over a covenant this one function alone must
keep. Deriving both deletions from ONE id-set structurally
preserves the orphan-pair balance (`requests.length ===
responses.length`, asserted throughout the shadow-ledger suite)
and guarantees the zone never MANUFACTURES a torn pair — a
pre-existing one still surfaces on its own terms, via
`storedResponseFor`'s `responses.getById` throwing
`EntityNotFoundError` (message-pair.ts) rather than silently
reading as a missing replay.

**Chainless (gate 4) — sanctioned wire delta 5.**
`identities/:id/pii` is retired from `DOCUMENT_CLASS_ROUTE_
PATTERNS` (message-pair.ts), so the gate's pre-tx head-read
never runs for it: every /pii pair forms with NEITHER Supersedes
nor Follows. A stored provenance pointer at a physically removed
pair would be a stored lie, so the absence is asserted
EXPLICITLY (`Supersedes === null`) at both re-pinned chain
cases, never merely the old assertion deleted. This is the ONLY
wire delta this task ships — GET is pair-derived via
`deriveIdentityPii` (Phase 10 Task 8; historical Task-time
deferral closed) and every PUT/DELETE status and body is
unchanged.

**The zone's confinement.** Every OTHER document-class address
still chains exactly as before — a memberships DELETE still
appends a tombstone that supersedes its PUT
(`tests/api-pii-hard-delete.test.ts`'s confinement case). The
retirement above touches ONE Set entry; it is not a blanket
append-only exemption.

**THE ERASURE-COMPLETENESS PIN (gate 5) — a theorem of gates
1-4, scoped to the STORED SERVER PLANE.** Because gate 1 confines
every PII byte to the /pii address alone, and gates 2-4 keep
that ONE address chainless and single-slot, erasing it (DELETE)
leaves zero PII bytes anywhere `requests`/`responses` can
be scanned (no `identity_pii` table remains) — proven end to
end by a real
grant → accept → human-member create → edit → erase chain
(`tests/api-pii-hard-delete.test.ts`), scanning every stored
message for the erased name/email/phone/bio values after the
fact. Four residuals sit OUTSIDE this theorem, named rather than
hidden:

1. **Pre-phase historical pairs.** A database that predates this
   task may already hold a multi-pair chain at some /pii
   address. No scrub pass ships (gate 2's historical-residual
   disposition, honestly stated): that chain persists until the
   NEXT write or erase at the SAME address — `replacePiiSlot`'s
   own next invocation is what cleans it up, lazily, as a side
   effect of ordinary use, never a background sweep. An address
   nobody ever revisits again keeps its full historical chain
   forever.
2. **Exported snapshots.** A snapshot taken before an erasure
   carries the pre-erasure PII rows verbatim; the theorem covers
   live storage, not files already written to disk.
3. **The browser's own session credential.** The
   `fusion-ai:authorization` localStorage entry carries the
   caller's own JWT, whose `name` claim is base64-decodable
   client-side for the token's lifetime (up to the 30-day
   refresh TTL). The pin does not scan localStorage — an
   erased member's OWN prior session token, if retained,
   still decodes to the pre-erasure name until it expires or
   is revoked.
4. **Replay resurrection.** A client that retained a pre-erasure
   PUT request (the exact bytes, not merely the values) can
   resend it: hash-keyed idempotency composed with hard-delete
   means a byte-identical resend after the slot has moved on
   finds no stored hash (§ The E6 branches, above) and is
   processed as a FRESH write — which re-installs the old PII as
   a new, live slot. The theorem proves the LEDGER holds no
   trace between erasure and such a resend; it cannot prove no
   such resend will ever arrive.

`tests/api-pii-hard-delete.test.ts` (new) is the proof: PUT-PUT
single slot; PUT-DELETE tombstone; DELETE-PUT re-set; the E6
branches (a byte-identical resend against the live slot replays
and appends nothing; the same resend after supersession finds
no stored hash and appends fresh); the erasure-completeness
chain; the zone's confinement; the tombstone-Supersedes absence
asserted explicitly on both verbs. The re-pinned
`tests/api-shadow-ledger-members-identities.test.ts` moves its
two pii chain cases (PUT-PUT, PUT-DELETE) from asserting a
Supersedes chain to asserting the single-slot replacement —
the ONLY re-pins this task authorizes.

### 5.13 The twelfth family: identities

Phase 10 Task 4 registers `identities` as the TWELFTH
`FAMILY_REGISTRY` family (`api/family-registry.ts`;
global-plane) and the TENTH `DocumentFamilyWiring`
registration (`IDENTITIES_WIRING` in `api/routes.ts`).
Record-types / record-attributes are registry rows with
inline handlers (Task 23 retired their flat wiring);
organizations is registry-only (no wiring row). The
identities registry row sets `organizationNested: false`
("global-plane"), `concurrency: 'simple'`, `createBodyIdField:
'id'`. It joins `MEMBERS_WIRING`'s shared-log-with-genesis
`'stateless'` bucket as the FOURTH member (§5.10): the shared id
(`member.id === identity.id`, always) already receives a genesis
lifecycle event at create and archive/reactivate via the
`members/:id` document-trio PUT, so the identities document
plane carries NO lifecycle of its own — a trio here would
FREEZE that lifecycle at genesis forever. The stateless arm's
ONLY tombstone signal is a DELETE-method head, already
404-absent via `deriveDocumentsAt` with no further walk needed
(`document-family.ts`'s `derivedDocumentEntity`) — the SAME
deleted-filter escape hatch every `'stateless'` family before
it accepted.

**The slot is LIVE, not inert.** Unlike the projects/members-
family inert-`createBodyIdField` precedent, `POST /identities` IS
a live bare collection-POST create route whose pattern is
literally `'identities'` — the registry consult in
`createdEntityUriId` (`message-pair.ts`) now fires for real, the
third live bare collection-POST create route after flows and
work-orders (flat POST records retired). `'identities'` retires
from `CREATE_BODY_ID_FIELDS`
(the same literal table) — the registered family answers ONLY
from its own registration now. The literal table keeps two
residual entries: `'invitations'` → `'invitationId'`
(permanent — the invitations side channel has no
organization-nesting tier, no concurrency class, and no
document address of its own to register, so it is never a
family-registry waypoint) and
`RECORD_TYPES_COLLECTION_PATTERN` → `'id'` (nested
composed POST; the pattern is not a bare family name, so the
registry consult never fires).

**The three extractions (own commit each, behavior-identical).**
`postIdentityDocumentOp`, `postIdentityCredentialDocumentOp`,
and `postRoleGrantDocumentOp` were lifted byte-for-byte out of
their hand-written PUT closures (`identities/:id`,
`identities/:id/credentials/:cid`, `role-grants/:id`), mirroring
the `postIdentityPiiDocumentOp` precedent (§5.12). At Task time
all three were EXPORTED — Task 6 seeded through them, and
Task 7's drift-mirror wiring imported them to compile —
alongside `validateIdentityDocumentBody`. Only
`postIdentityDocumentOp` joins a `DocumentFamilyWiring` row;
credentials stayed directly dispatched from its route closure.
**As of later retirement:** `postRoleGrantDocumentOp`, the
role-grants HTTP family, and its seed pairs are RETIRED —
roles ride membership `type` / claim projection; routes 404
(`tests/api-authz-gate.test.ts`); zero live implementation
(stale seed comment only).

**Why credentials (and retired role-grants) do NOT get their
own family-registry row.** `family-registry.ts` answers exactly
three axes a document-class, per-id family needs: organization-
nesting tier, PUT concurrency class, and create-address body
field. Neither plane is such a family:

- `identities/:id/credentials/:cid` is a NESTED facet of the
  identity subtree (the identity id is param 0; the credential
  id is param 1) — it has no address of its own independent of
  the identity it hangs off, so it never needs an organization-
  nesting or create-address answer separate from `identities`'
  own.
- `role-grants/:id` WAS an EVENT-APPEND ledger row
  (`HistoryEntityStore`, latest-wins per `(organization_id,
  identity_id, role)`) — a grant/revoke history, not a document
  address; **RETIRED** with the role-grants HTTP family
  (membership type / claim roles; no live store or routes).

Credentials extraction leaves its `WRITE_RESPONSE_SPECS` entry:
`'identities/:id/credentials/:cid'` still reconstructs the full
entity (including `secret`, a deliberate zero-change carry-
over). The role-grants `'role-grants/:id'` org-stamp spec and
ORG-SCOPED `role_grants` store prose are **RETIRED** with that
family (no live WRITE_RESPONSE_SPECS entry).

**PUT /identities/:id** now dispatches through
`documentPutHandler(IDENTITIES_WIRING)`, and
`WRITE_RESPONSE_SPECS['identities/:id']` is
`documentWriteResponseSpec(IDENTITIES_WIRING)` — the
registration-first consult (§5.10's blocking fix) omits the
`organization_id` stamp for this `organizationNested:false`
family, so the emitted bytes stay UNCHANGED from the hand-written
`{id, kind}` body this replaces (validated: Step 0 of this task
re-confirmed key-set/value equality before the swap landed). GET
stays hand-written, old-plane, until Task 8 (§5.10's same
deferral).

**The verb-gap pins (finding 20), COUNT AT EXECUTION: 42
combos across four regimes**
(`tests/api-identity-spine-verb-gaps.test.ts`, own commit BEFORE
the wiring landed):

1. The route-table regime — 36 combos across the identity-spine
   `route()` patterns (`identities` through
   `identities/:id/providers/:eid`): a matched pattern with no
   handler for the request's verb 405s via `handleRequest`'s own
   per-method branch; role-grants, flat identity-providers, and
   their `:id` patterns are retired and assert 404 (not
   matchRoute 405).
2. The `identities/:id/default-org` side channel regime — 2
   combos: this side channel never calls `matchRoute` — a POST or
   DELETE falls through its own if-chain to ITS OWN inline 405
   terminal (`organization-requests.ts`).
3. The identity-tokens authz-tier regime — `GET
   /identities/:id/tokens` is admin-only (absent from
   `MEMBER_VERBS` GET), so a member-tier token 403s at the
   authz layer BEFORE `matchRoute` runs; `POST
   /identities/:id/tokens/:jti/rotation` and `.../revocation`
   match `MEMBER_VERBS`' `'/identities/:id/tokens'` POST, so a
   member-tier token clears authz and reaches the handler's
   own domain terms (409 reuse; 204 idempotent no-op). Flat
   `/identity-tokens` is RETIRED (router 404). Path identity
   must match the jti's identity or 403.
4. The identity-token-revocations authz-tier regime — 1 combo:
   `PUT /identities/:id/token-revocations/:rid` matches
   `MEMBER_VERBS` (member clears authz; self-target 2xx). GET
   stays admin-only. Flat `/identity-token-revocations` is
   RETIRED (router 404). (36 + 2 + 3 + 1 = 42.)

`tests/family-registry.test.ts` gains the twelfth case
(`identities`, global-plane like `members`). **As of Phase 12:**
`organizations` is the thirteenth registered family (global-
plane, `concurrency: 'simple'`, inert `createBodyIdField:
'id'`); the unregistered-family control is a non-family string
(`'not-a-family'` → `familyRegistration` undefined), not
`organizations`.

`tests/api-identity-document.test.ts` (new) is the wiring's
proof, mirroring `tests/api-member-documents.test.ts` (§5.10) for
the identities family alone: `validateIdentityDocumentBody`'s
accept/reject bytes (the label mandate — `'IdentityEntity'`,
matching `validateIdentityEntity` byte-for-byte); the below-gate
op pin; the E6 byte-identical-resend pin; the PUT-chain-derives-
the-head / DELETE-derives-absent cases against the REAL
registered wiring row; and a direct assertion that the wire
response carries `{id, kind}` only, no `organization_id`.

### 5.14 The composed-write bundle widenings: identities
documents + the service credential document (Phase 10 Task 5)

Every widened site consumes `formDocumentPairFor` (gate 10) — NO
new formation machinery. Message-side only: old-plane write sets
(the actual `.put` calls) are untouched, fingerprints and the
states-911 pin hold, and the wire is byte-unchanged — the bundles
are storage-only.

**`IdentityWritePairs`, a discriminated union on `kind` (a
verification finding).** `POST /identities` (§3.5) forms one of
two shapes: a person carries `{kind: 'person', operation,
identityDocument}`; a service carries `{kind: 'service',
operation, identityDocument, credentialDocument}` — the SAME
`operation`/`identityDocument` pair every kind forms, plus the
service-only `credentialDocument`. The union mirrors
`IdentityCreatePersonBody`/
`IdentityCreateServiceBody` one layer down (`validators.ts`)
rather than an optional `credentialDocument` field — the
doctrine lens: prefer the union over an optional field wherever
the codebase's OWN body-validation axis already draws the same
line, so a person bundle can never carry a stray credential pair
by construction (the type system, not a runtime check, closes
the gap).

**The identity-create bundle (person 1 → 2, service 1 → 3).**
`postIdentityCreationOp` appends the operation pair, the
synthesized `identityDocument` pair (+ `credentialDocument` for
service) LAST, bundle-or-nothing — forming ALL pairs pre-tx
before the transaction opens means a mid-formation failure (an
invalid credential `kind`, say) leaves the transaction never
even called, so zero rows land. The `identities` route forms the
bundle inline pre-tx:

- `identityDocumentBodyOf(kind)` → `{kind}` — byte-indistinguish-
  able from a live `PUT /identities/:id` body — at the identity's
  own `identities/:id` address. `createBodyIdField` collapses
  `POST /identities` and `PUT /identities/:id` onto the SAME
  address (§5.13), so `identityDocument` shares the operation
  pair's own address and becomes its new head, appended after it
  — the ai-members/detail-document create-address-collapse
  precedent (§3.1–§3.4).
- The credential document body (service only) is the create
  body's credential sub-object MINUS its `id` — mirroring the
  live `PUT /identities/:id/credentials/:cid` wire body
  (hash-bearing per the covenant: the secret arrives ALREADY
  client-hashed, so no crypto runs here) — at the credential's
  OWN `identities/:id/credentials/:cid` address.

**`MemberWritePairs` gains `identityDocument?: MessagePair`
(human create/edit 3 → 4; AI stays 3, finding 10).** The human
create/edit routes (§3.3/§3.4) form + append it LAST, after
`detailDocument`; the AI routes (§3.1/§3.2) never do —
`postAiMemberCreationOp` writes no `identities` row (an AI member
has no identity of its own), so `postAiMemberCreationOp`/
`postAiMemberEditOp` always receive it `undefined`. The field
stays on this ONE shared type rather than forking a person-only
sibling — every consuming op already honors it uniformly via the
SAME `!== undefined` guard `memberDocument`/`detailDocument` use,
so the AI ops' own bundle-forming code is untouched by this task.

**The fold (the E6 fold, the member-document fold's own
precedent — §3.3/§3.4's prose).** A human member's identity
`kind` is a server-pinned fact, always `'person'`, so
`identityDocumentBodyOf('person')`'s body is byte-identical
across a create and every later edit of the SAME member.
`appendMessagePair`'s global by-hash fold therefore skips the
identities-document pair on every edit following the member's
first write — a genuinely PERMANENT fold, at a DIFFERENT address
than the member-document fold, for the SAME structural reason.

**The seed (`api/mock-data/seed-message-pairs.ts` +
`api/mock-data.ts`, the SAME commit as the member-op widening —
two callers of one covenant).** The 11 seeded human-member create
bundles each gain their `identities/:id` document invocation
(`seedPairKey('identities/:id', id)`, body `{kind:'person'}`);
bootstrap's lone `current` bundle widens 3 → 4 the SAME way.
`EXPECTED_PAIR_COUNT` (§5.3) moves 592 → 603 (+11); the bootstrap
seed's own count moves 6 → 7. The 4 AI + 1 system identities and
the credentials/role-grants seed slices are Task 6's — this task
seeds NEITHER.

**The re-pins.** In
`tests/api-shadow-ledger-members-identities.test.ts`: identity
person-create 1 → 2, service-create 1 → 3 (+ a bundle-or-nothing
case: a service create with an invalid credential body appends
nothing, since `postIdentityCreationOp` is never even called);
human create 3 → 4; the human edit gains the identities document
but it FOLDS, so its OWN balance stays the running total, not +1;
key-set pins for the identities document (`{kind}`) and the
credential document (the SAME five keys
`validateIdentityCredentialEntity` admits). In
`tests/mock-data-pairs.test.ts`: `EXPECTED_PAIR_COUNT` 592 → 603,
the breakdown prose (§5.3), an identities-document spot-check
(the PII spot-check's own precedent), and bootstrap 6 → 7. In
`tests/drift-roster.test.ts`: the live-write chain re-pins its
human-member create balance 3 → 4 alongside — the SAME fact
named above, exercised a second time through the live route
rather than the shadow-ledger suite.

**Contract (Task-time).** The synthesized identities document is
byte-indistinguishable from a live `PUT /identities/:id` pair's
shape at the same address; old-plane row and lifecycle surfaces
were then untouched (fingerprints + the states-911 pin held);
the wire was unchanged — the bundles are storage-only. **As of
Phase Final:** that fingerprint oracle and the states-911 pin
are RETIRED; standing absolutes are
`EXPECTED_PAIR_COUNT = 1498` / bootstrap 12
(`tests/mock-data-pairs.test.ts`); pair-plane spot-checks only.

### 5.15 Gate-seeding the remaining spine slices: AI/system
identities, credentials, role grants (Phase 10 Task 6)

Path A throughout: the THREE ops §5.13 extracted and exported
at Task time (`postIdentityDocumentOp`,
`postIdentityCredentialDocumentOp`, `postRoleGrantDocumentOp`) +
per-row invocations through the UNTOUCHED `formSeedPair`
pipeline — no logic change to `formSeedPair` itself, only new
callers. `formSeedPair` carries no `chain` argument at all, so
`headPairId` is undefined for EVERY seed pair by construction
(always-genesis); the live-path `chain: 'none'` vocabulary
(`formDocumentPairFor`, api/routes.ts) does not apply here. Row
ids/ats/content stay byte-identical — only `EXPECTED_PAIR_COUNT`
(§5.3, 603 → 632) and the bootstrap count (7 → 11) move.

**The three slices (+29).** The 4 AI + 1 system identities' raw
`identities.put` sites re-point onto `postIdentityDocumentOp`
(+5 — a standalone invocation each, since neither the ai-members
nor the system-member write ever carried an `identityDocument`
slot the way the human-member bundle does, §5.14). The 12
credential writes in `seedHumanCredentials` re-point onto
`postIdentityCredentialDocumentOp` (+12 — 11 human passwords +
the system client secret). At Task time the 12 role-grant raw
`roleGrants.put` sites re-pointed onto
`postRoleGrantDocumentOp` (+12 — the 2 admin grants for
`current` plus one member grant per non-admin human); bootstrap
mirrored system identity, 2 credentials, and 1 role grant (+4,
7 → 11). **Later RETIRED:** role-grant seed pairs,
`postRoleGrantDocumentOp`, and the role-grants HTTP family are
gone (roles from membership type / claims; mock asserts zero
`/role-grants/` pairs). `identity_default_organizations` was
still deferred WHOLE here — §5.17 forms its pairs; Phase Final
strips the ROW half (pair-only seed/read; absolute 1498 / 12).

**The credential seed transaction (present-tense).**
Phase Final stripped the `identity_credentials` ROW half.
`seedHumanCredentials` now opens a pair-plane-only
`adapter.transaction(['requests', 'responses'], ...)` and
calls `postIdentityCredentialDocumentOp` inside it — the SAME
op every live `PUT identities/:id/credentials/:cid` rides.
(Historical: the Task-time three-table widen from a nested
`['identity_credentials']` outer set onto
`['identity_credentials', 'requests', 'responses']` is
retired with the row table.) Each credential pair is PRE-FORMED
from the post-hash secret BEFORE the transaction opens
(`formSeedCredentialPairs`,
`api/mock-data/seed-message-pairs.ts`) — a credential's body is
unknown until PBKDF2 resolves, and crypto never runs in-tx
(CLAUDE.md § the IndexedDB auto-commit constraint), so this
credential batch runs its OWN local pass-1/pass-2 split rather
than joining `formMockDataMessagePairs` /
`formBootstrapMessagePair` (both already ran, before
`seedHumanCredentials` is even called).
`tests/credential-surfacing.test.ts` is the Task 2 ordering
canary — it re-ran green (12 credentials still surface).

**The org-stamp trap (a verification finding; Task-time).**
At Task time `role-grants/:id`'s `successBody` re-stamped
`organization_id` from the invocation's `organization` argument
(§5.3's `documentSeedResponse`,
`api/mock-data/seed-message-pairs.ts`, threads
`inv.organization` straight into it) — so each of the 12
role-grant seed invocations had to carry its OWN grant's
`organization_id` (`STARK_ORGANIZATION`/`ORGANIZATION_TWO` per
the write body, `assignOrganization(index)` for members), never
undefined. A wrong/undefined value silently corrupted the
STORED RESPONSE body with no fingerprint pin catching it —
`requests`/`responses` were excluded tables
(`tests/mock-data-fingerprint.test.ts`, later RETIRED). Only
the Task-time spot-check below caught it. **As of role-grants
retirement:** no live `'role-grants/:id'` WRITE_RESPONSE_SPECS
org-stamp path remains.

**The re-pins (`tests/mock-data-pairs.test.ts`).**
`EXPECTED_PAIR_COUNT` 603 → 632 + the breakdown prose; ONE
credentials-document spot-check, KEY-SET ONLY (`{at, id,
identity_id, kind, secret, status}`) — a credential's `secret`
is nondeterministic per reseed, so content can never be pinned;
ONE role-grant spot-check that reads BOTH the stored response
body and the actually-written row for the `current`/
`ORGANIZATION_TWO` admin grant and asserts they agree — the only
place the org-stamp bug surfaces, not a mere key-set check; the
bootstrap count 7 → 11. One PRE-EXISTING assertion also needed a
disambiguating fix, not a re-pin: the ai-member create-pair
lookup matched by `uri_id` alone, which the new identities-
document pair (sharing that SAME `uri_id`) now makes ambiguous —
fixed by filtering on the operation pair's OWN 204 response, the
SAME technique the ai-member detail-document test already uses
(the H7/arrival-order hazard class) — the assertion itself is
unchanged.

**Contract (Task-time).** Fingerprint pins held then —
`identities` 16/`0c164977`, `identity_credentials` 12/
`4990628d`, `role_grants` 12/`4b2311dd` via
`tests/mock-data-fingerprint.test.ts` — because the three ops
wrote the SAME row content the raw puts did; only the message
plane (excluded from that fingerprint) grew. **As of Phase
Final:** that fingerprint oracle is RETIRED (file absent);
standing absolutes are `EXPECTED_PAIR_COUNT = 1498` /
bootstrap 12 (`tests/mock-data-pairs.test.ts`); pair-plane
spot-checks only. Reseed marginal cost measured ~2 ms for the
+29 pairs (order-of-magnitude consistent with the ~0.144
ms/pair baseline; within this harness's run-to-run noise
floor).

### 5.16 Gate-seeding the historical-trace carve-out (Phase 11
Task 3; reshaped at states-address retirement)

**Historical dual-write era (Phase 11).** Path A throughout,
the migration's most FINGERPRINT-CRITICAL task: the 861
work-order historical trace events (212 hand-authored + 649
generated), the 7 `state_field_values` rows, and the system
member's OWN genesis event (2 — one per seed path) ALSO formed
their own message pairs beside rows that stayed the SAME
direct writes mock-data.ts already made. Pre-retirement those
slices rode bare states/SFV adapters; pairs were appended via
`appendMessagePair` directly. The fingerprint oracle
(`tests/mock-data-fingerprint.test.ts`) later RETIRED with the
entity-table era.

**As-built seed (post states-address retirement).** Those
slices no longer form bare event-append or field-values leaf
pairs. Work-order historical traces reseed as
`work-orders/:id/transition` op-shaped pairs (**861** absolute
with the system-member genesis path accounted in the member
document plane); field values fold into those transition
bodies as `fieldValues: [{id, fields}]`. Product reads expose
them inline on `GET work-orders/:id/history` and
`GET work-orders/history` as `field_values: [{id,
attribute_id, value}]` (§2.10). No
`WRITE_RESPONSE_SPECS` leaf entry remains for a field-values
write address. See §5.19 for the full surviving-route list
and seed reshape pin.

**The three slices as they stood at Phase 11 (+869).** Every
work-order trace event
(`buildWorkOrderStateEvents()` +
`leadToCloseWorkloadStateEvents`, 861) formed its OWN
event-append pair — idParams `[event.id]`, byte-identical to
the id the dual-write row already carried, so the derived
plane's future ids could never drift. `requesterIdentityId`
was the EVENT'S OWN `member_id` — never
`workOrderFirstEventMemberId`, the sibling map ~30 lines away
that answers a DIFFERENT question (a work order DOCUMENT's
own authorship, not one of its many trace events). Every
seeded work order is Stark (§3.17's own finding), so every
trace nested under `STARK_ORGANIZATION`. The 7 field-value
rows (`mockStateFieldValues`) each formed their OWN leaf pair
at a nested field-values address — idParams
`[stateEventId, fvId]` — authored by the PARENT event's OWN
`member_id`, looked up off the SAME trace-event map, never a
second, independently-picked author. The system member's OWN
genesis event formed its OWN pair too (2 —
`memberStateEvents` in the mock-data seed,
`bootstrapSystemStateEventId` in `formBootstrapMessagePair`'s
own SEPARATE mirror for bootstrap), organization `undefined`
— the system member is the org-less global actor, the SAME
choice its `members/:id` and `identities/:id` pairs already
make. Post-retirement the work-order slice is transition ops
and the member genesis rides the members document trio
(§2.10 / §5.10).

**The body shape (a sharp edge the task brief named).** Every
trace/genesis pair's body is `{entity_id, state, at}` —
DESTRUCTURED off the stored `StateEntity`, never spread, so a
leaked `id`/`member_id` can never ride along (`assertOnlyKeys`
throws on either). Every field-value pair's body is
`{state_event_id, attribute_id, value}`, the SAME destructuring
discipline. `stateEventSeedBody` accepts the narrower
`Pick<StateEntity, 'entity_id' | 'state' | 'at'>`, not the full
entity, so bootstrap's own system-event — which mints its `at`
fresh, never from a stored row — shares this ONE construction
without fabricating a dummy `id`/`member_id`.

**The member_id content spot-check (the role-grant precedent, in
THIS task).** Fingerprints hash row ids only and exclude
`requests`/`responses`, so a wrong-but-real `member_id` in a
gate-seeded pair would be fingerprint-INVISIBLE — the SAME class
of gap §5.15's role-grant org-stamp spot-check closed. A NEW
assertion (`tests/mock-data-pairs.test.ts`) reads BOTH a seeded
trace pair's stored request `requester_identity_id` and the
pair-derived lifecycle state's `member_id`
(`workOrderLifecycleStatesFor`) for the SAME event id and
asserts they agree.

**The re-pins (`tests/mock-data-pairs.test.ts`).**
`EXPECTED_PAIR_COUNT` 632 → 1500 (+860 trace +7 field-value +1
mock-data-seed system-genesis — NOTE: NOT +2; bootstrap's OWN
system-genesis pair is counted in the bootstrap total below, a
SEPARATE seed path with its OWN test) + the breakdown prose; the
bootstrap count 11 → 12; THREE new address/body-shape spot-checks
(a trace event, a field value, the mock-data seed's OWN
system-genesis pair at the GLOBAL, non-org-nested shared
event-append address) + the member_id content spot-check
above.
`tests/mock-data-fingerprint.test.ts` later RETIRED with
the entity-table / clients era (file absent).

**Contract (as of Phase Final).** Absolute pair count is
`EXPECTED_PAIR_COUNT = 1498` with bootstrap 12. Historical
Path A dual-write (`appendMessagePair` beside row puts) is
gone — only `requests`/`responses` remain; formerly
this task touches. Reseed marginal cost measured ~125 ms for the
+868 `postMockDataLoad`-side pairs (baseline ~351 ms → ~478 ms,
5 runs each; ≈0.144 ms/pair, consistent with §5.15's own baseline)
— the largest single-task increment of the migration, ~60× the
prior (§5.15's +29 at ~2 ms), tracking the pair COUNT rather than
any new per-pair cost.

### 5.17 Flipping default organization reads to the ledger
(Phase 11 Task 8)

The gate 7 USER ELECTION: `identityDefaultOrganization`
(`api/authentication.ts`) — the I/O composition every flip-relevant
caller rides transitively (`fenceRequest`'s flat-token fallback,
`identityDefaultOrganizationRequest`'s own GET arm, and
`callerActiveOrganization` in `api/invitations-domain.ts`) — swaps
its ROW SOURCE from `identity_default_organizations.getAllWhere`
to `deriveDefaultOrganization` (a new sibling module,
`api/derive-default-organization.ts`), still handing the mapped
rows to the SAME UNCHANGED pure reducer,
`currentDefaultOrganizationFor` (`api/authorization.ts`, pinned by
`tests/default-organization-resolve.test.ts`), and keeping the
`primaryMembershipOrganization` fallback verbatim. The FOURTH
caller — `organization-requests.ts`'s PUT idempotency no-op check,
which calls the pure reducer directly over a live `getAll()` — is
UNTOUCHED; it never rode `identityDefaultOrganization` at all. Zero
caller edits: all three flip-relevant callers, and the reducer
itself, are absent from this task's diff.

**The derivation.** `deriveDefaultOrganization(db, identityId)`
reads the SAME identity-keyed address
`identityDefaultOrganizationRequest` already writes to
(`api/organization-requests.ts`) —
`/identities/:id/default-org/`, the eventId riding a FABRICATED
trailing `:eventId` path segment no real URL carries (the live
PUT's `eventId` is a BODY key) — via a TARGETED
`requests`/`responses.getAllWhere('uri_collection', prefix)` pair, never
a full-ledger scan, and maps each 2xx pair
(`documentPairsAt`, `api/derive-documents.ts`) to an
`IdentityDefaultOrganizationEntity`-shaped row: `id` is the pair's
own `uriId` (the eventId), `organization_id`/`at` are read off the
stored request body. A no-op PUT resend still forms its own pair
(`identityDefaultOrganizationRequest`'s pair append is
unconditional; only the `identity_default_organizations` ROW write
is conditional on `changes`) — but it always carries the SAME
`organization_id` the identity already held, so including it
changes nothing the reducer would resolve.

**Why the fence fallback is safe to flip categorically.** It runs
PRE-DISPATCH in `fenceRequest` — never inside a transaction, so no
IndexedDB auto-commit hazard — and is LATENT-hot: ordinary traffic
carries an org-scoped token (`ctx.principal.organization` already
set), so the fallback read fires only for a flat, un-exchanged
token, once per boot.

**The gate-seed (+11).** The `identity_default_organizations`
family is pair-only as of Phase Final Task 2 (ROW half stripped —
no `adapter.identityDefaultOrganizations.put`; `TABLE_NAMES` is
`requests`/`responses` only), closing the LAST family Phase 10
Task 6 (§5.15) deferred WHOLE: each forms its own message pair
through a dedicated former (`formDefaultOrganizationSeedPair`,
`api/mock-data/seed-message-pairs.ts`) that mirrors the live PUT's
`formWritePair` call byte-for-byte rather than riding the generic
`formSeedPair`/`WRITE_RESPONSE_SPECS` pipeline every other family
uses — the fabricated trailing `:eventId` segment cannot be
expressed by that pipeline's `routePattern.split('/')` convention,
the SAME reason the invitations side channel forms its own pairs
directly. 11 mock-data pairs (one per seeded human member, actor =
the member's OWN id — the route's self-authorship rule, never
`SYSTEM_MEMBER_ID`) + bootstrap's OWN mirror pair (actor =
`'current'`). Task-time intermediate re-pins were 1500 → 1506 /
bootstrap 12 → 13; standing absolute pins are
`EXPECTED_PAIR_COUNT = 1498` / bootstrap 12.

**The re-pins (`tests/mock-data-pairs.test.ts`).**
Task-time: `EXPECTED_PAIR_COUNT` 1500 → 1506 (+11) + breakdown;
bootstrap 12 → 13 + a new assertion for its default-org pair
address; ONE new address/body-shape spot-check (a seeded default-
org pair's identity-keyed address, its body carrying the three
`{organization_id, eventId, at}` keys). Standing absolute pins
are 1498 / bootstrap 12. Fingerprint test later RETIRED (file
absent); no standing `identity_default_organizations` row
fingerprint HOLD.

**The adapter/fence suites (plumbing only).** Three suites seeded
a SET default via a raw `identityDefaultOrganizations.put` and then
exercised the now-flipped read
(`identityDefaultOrganization`/`fenceRequest`) — a raw row no
longer influences that read, so each converts to a paired write,
assertions byte-identical: `tests/default-organization-precedence.
test.ts` (a local `formWritePair` + `appendMessagePair` helper, the
lowest-level plumbing this file's own style already uses),
`tests/api-flat-token-organization.test.ts` and
`tests/api-membership-liveness.test.ts` (both ride the REAL PUT
route via `handleRequest`, already available in-file). `tests/
default-organization-resolve.test.ts` (the pure reducer's pin) is
UNTOUCHED, as is every suite exercising the LIVE PUT/GET route
through `handleRequest` (`tests/api-identity-default-organization.
test.ts`, `tests/api-shadow-ledger-default-organization.test.ts`) —
those already form genuine pairs alongside their raw rows and
needed no change. `tests/api.test.ts`'s 500-fallback fault-injection
test narrows its blanket `db.requests.getAllWhere` override to the
`/ideas` domain-read prefix alone, since the fence's own fallback
now ALSO reads `db.requests` — an unrelated widened dependency
surface, not a weakened assertion.

**Contract.** `identity_default_organizations` 11/`ab3efde4` HOLDS
(fingerprint oracle later RETIRED) — Path
A: the new pair writes ONLY `requests`/`responses`, disjoint from
the row-write side this task touches. Reseed marginal cost measured
~4 ms for the +11 pairs (baseline ~479 ms → ~483 ms, 10 runs each)
— consistent with §5.16's own ~0.14 ms/pair rate at this small a
delta, within the run-to-run noise floor at this scale.

### 5.18 Flipping organizations reads to the ledger
(Phase 12 Tasks 2–5)

organizations is the tenant root — the THIRTEENTH and LAST
in-scope family — flipped through the same arc every prior
family rode: a derive module (Task 2), seed pairs (Task 3), a
drift-parity suite (Task 4), then the consumer flip (Task 5).

**The derivation.** `deriveOrganizations(db)` /
`deriveOrganization(db, id)` (`api/derive-organizations.ts`)
head-pair-reduce the `/organizations/:id` address family,
reusing `derive-documents.ts`'s helpers like every sibling.
`organizationEntityOf` departs from the seven-sibling id-first
`entityOf` convention ON PURPOSE: it re-runs the head pair's own
REQUEST body through `validateOrganizationEntity` (an echoed
`id` stripped via `withoutId` first) rather than re-listing
field names, so the derived shape is byte-identical to the
STORED ROW — id-LAST, never id-first
(`tests/drift-organizations.test.ts` leg 6 pins the key order on
both planes). Registration (Task 2's sibling) makes organizations
the THIRTEENTH `FAMILY_REGISTRY` row: `organizationNested: false`
(the tenant root — global plane, like members/ai-members/
human-members/identities), `concurrency: 'simple'`,
`createBodyIdField: 'id'` (INERT — no collection POST exists).
Registration alone is byte-inert for the canonical address; it
does not flip a read by itself.

**The seed pairs (Task 3).** Both seeded organizations (Stark
Industries, Wayne Enterprises) form their OWN
`organizations/:id` document pairs on the message plane.
Phase Final deleted the organizations row store; the live
absolute is **EXPECTED_PAIR_COUNT = 1498** with bootstrap
**12** (see `tests/mock-data-pairs.test.ts`). The retired
`tests/mock-data-fingerprint.test.ts` file is gone with the
clients / entity-table era.

**The drift suite (Task 4, `tests/drift-organizations.test.ts`,
8 legs).** OLD-vs-DERIVED parity: the caller-filtered collection
for a multi-org and a single-org caller (leg 1); the unfiltered
collection plus both seeded `:id` reads (leg 2); the bootstrap
singleton (leg 2b); both 404 shapes — the store's
`EntityNotFoundError` and the pre-dispatch membership-fence 404
(legs 3a/3b); a live PUT re-compared after the write (leg 4); the
SEED-STATE precondition — no `states` event exists for either
seeded organization, so no tombstone can diverge the two planes
(leg 5); and the id-LAST key-order pin (leg 6). Stays until Phase
Final, like every sibling drift suite.

**The flip (Task 5) — six consumers, five re-pointed, one
removed:**

- `enumerateMyOrganizations` (`api/organization-requests.ts`) —
  row source only: `deriveOrganizations` replaces
  `ctx.base.organizations.getAll()`. The `callerOrganizationIds`
  membership filter stayed old-plane through this task — Phase
  13 Task 3 has since flipped it onto
  `deriveMembershipsForIdentity` too (§2.11).
- `GET /organizations/:id` (`api/routes.ts`) — a BESPOKE
  `deriveOrganization` call in the route closure, not the
  generic `documentGetHandler(wiring)` every other flipped
  family rides: that machinery needs a wiring row's
  `documentOp`, and organizations has none — `PUT` stays
  hand-written old-plane, so a `documentOp` built only to
  satisfy the type would never be called.
- The gate-15 fence enumeration —
  `membershipsAcrossAllOrganizations` (`api/routes.ts`) — now
  walks `deriveOrganizations(db)` instead of
  `db.organizations.getAll()`.
- `derive-states.ts`'s own `organizationIds` — the ALL-orgs,
  uncaller-filtered ownership resolution, distinct from
  `enumerateMyOrganizations`'s caller-filtered read — now sources
  from `deriveOrganizations` too. Stays ALL-orgs; never
  caller-filtered.
- `invitations-domain.ts`'s `organizationName` join — a Map
  built ONCE over every organization (Efficiency: one
  derivation, not one `deriveOrganization` call per invitation)
  — sources from `deriveOrganizations` in place of
  `ctx.base.organizations.getAll()`.
- The DEAD `route('organizations', {get: ...})` table entry is
  REMOVED: unreachable since `GET /organizations` is intercepted
  PRE-`matchRoute` in `api/api.ts` (the `pathSegments.length ===
  1 && GET` guard, §1.1) — the route-table row never dispatched.

**What stayed old-plane (at Task 5's own close).** The
`organizations` is pair-plane only after Phase Final —
writes append document pairs at `organizations/:id`; there
is no dual-write row half. `PUT /organizations/:id` remains
hand-written on the message plane.
`callerOrganizationIds`'s membership filter and
`derive-states.ts`'s ALL-orgs shape were both UNCHANGED — this
task flips the row SOURCE only, never a fence or a filter.
`callerOrganizationIds`'s OWN row source flips later, at Phase
13 Task 3 (§2.11) — its membership FILTER (caller-only, never
ALL-orgs) stays exactly as this task left it.

### 5.19 Phase 15 route retirements and seed-address survival

Phase 15 Task 7 retired zero-caller route families; states-
address retirement made **every verb** on the shared
event-append address a router **404** (unauthenticated →
401 first). Product callers were already zero. Surviving
live history surfaces (§2.10 — **nine lifecycle + one
value-history**, wire `(at, id)` DESC, index 0 =
current):

1. `GET ideas/:id/versions`
2. `GET projects/:id/versions`
3. `GET organizations/:org/record-types/:id/versions`
   (flat `records/:id/history` RETIRED → router 404)
4. `GET flows/:id/versions`
5. `GET objectives/:id/versions`
6. `GET members/:id/versions` (global; absent → 404)
7. `GET work-orders/:id/history` (inline `field_values`)
8. `GET work-orders/history` (bulk; always 200; inline
   `field_values`)
9. `GET objectives/versions` (bulk; always 200;
   `StateEntity` only)
10. (value-history, not lifecycle)
    `GET .../record-types/:type/instances/:id/versions`
    → `{ at, etag, version, values }[]` projected by
    current read ACL (§5.20). Leaf
    `.../versions/:version` is live.

Per-entity org-nested legs (1–5, 7) empty →
`missedReadError` → foreign **403** / absent **404**.
Bulk legs (8–9) always return an array. Field values have
no successor GET route — product reads fold them on (7)
and (8). `stateEventVisibilityFor` remains the RESTRICT /
ownership 3-tier probe, not a public collection.

Head-state trio (`state`, `state_at`, `state_event_id`)
embeds on GET rows for ideas / projects / record-types /
objectives / members (not flows; work-orders stay
stateless; instances carry `values`, not trio).

`flow_versions` table and table-backed write routes
are GONE (Phase 15 retired writes; Phase Final
deleted the table). Pair-chain
`GET /flows/:id/versions` and
`GET /flows/:id/versions/:version` are live.
Document version leaves (`documentVersionRoute`) and
the instance version leaf are live — see §2.10.
Record-types and work-orders have no document version
leaf. Also router-404: per-entity current-state
alias; nested field-values write address; bulk
five-source lifecycle collection.

**Seed reshape (states-address retirement).** The 861
historical work-order traces reseed as
`work-orders/:id/transition` op-shaped pairs; field values
fold into those transition bodies. No bare event-append or
nested field-values leaf seed pairs remain. No
`WRITE_RESPONSE_SPECS` leaf entry for the retired field-
values write address. Table-backed
`flows/:id/versions*` write specs are gone with
those routes. Mock seed absolute:
**EXPECTED_PAIR_COUNT = 1498** / bootstrap 12.

**§5 chronological gap (named) — DEFERRED.** Tasks 1–6 of
Phase 14, the Phase 15 re-anchors, and the Phase Final
deletion as-built live in ARCHITECTURE.md § Write-path
derives / § Last readers → Phase Final as-built rather than
as further §5.N narrative chapters here. A single
chronological §5 voice is optional prose work, not a
contract gate — elected DEFER at Phase Final Task 7.

### 5.20 Instances family — full-state heads + If-Match

First-class data rows under a record type. Wire =

`organizations/:org/record-types/:type/instances[/:id[/versions[/:version]]]`

Storage name `record_instances`. NOT on
`DOCUMENT_CLASS_ROUTE_PATTERNS` (R10) — headPairId and
document-class PUT machinery do not apply. Member path-
tier at the gate, then per-attribute ACL. Schema (type +
attributes) is admin-only; instance values are
member-writable per `write_roles`.

**Stored shape = full state.** Document head body is
`{ values: [{ attribute_id, value }] }` (address carries
org + type). Wire PATCH is operation-plane
(`set` / `clear`); the server merges pre-tx and appends
a full-state revision. GET is one head read (R5) —
never a client-side fold of revision history.

**PUT is 405.** Public create is PATCH. Adapter
`putRecordInstance` still PATCHes (name lie).

**PATCH (creates; If-Match on a live head).**

```http
PATCH .../instances/{instance-id}
If-Match: "<64-hex-documentVersion>"
{ "set": [...], "clear": ["attribute_id"] }
```

| Case | Result |
| --- | --- |
| Type absent under fenced org | **404** |
| Never-written, no If-Match | **201** create |
| Head tombstoned, no If-Match | **409** (address spent) |
| Head tombstoned + If-Match | **404** |
| Live head, If-Match absent | **428** |
| If-Match malformed | **400** |
| If-Match ≠ advertised version | **412** |
| If-Match = advertised | Proceed; append 201 |
| Duplicate attr in `set`, or attr in both `set` and `clear` | **400** |
| Empty `set` and `clear` | **400** |
| Write-ACL fail | **403** all-or-nothing |
| Constraint / type / unknown attr | **400** |
| Same-body PATCH | still appends **201** |

Pipeline: pre-tx read head → resolve type +
attributes → outcomes → validate → authorize →
merge → form pair (crypto pre-tx). ONE transaction
appends (outer PATCH + inner PUT, same
`Operation-ID`). Concurrent stale If-Match →
**412**. Lost update is client re-GET + reconcile +
retry; server never auto-merges concurrent patches.

**409 vs 412 (NAMED).** Address spent → **409**.
Lost-update on a live head → **412**. See §5.4.1.

**DELETE.** Tombstone-wins (replay → **204**). Placement
RESTRICT: any org WO whose CURRENT bind (§3.34 derive)
names this instance AND whose current node is
NON-TERMINAL (outgoing edges exist in that WO's own
frozen `flow_graph`) → **409** naming the blocker WO
ids (`describeReferrers` voice). Terminal-node and
unbound instances DELETE as before (unconditional
tombstone). A DELETE after an interleaved PATCH still
leaves the address spent; PUT never revives. Named
residual (W5): no WO abandon/delete op exists — a WO
parked mid-flow blocks its instance's deletion until
transitioned to a terminal node.

**GET projection.** Return only read-permitted
attributes. Sparse PATCH is required for correctness
with filtered GET. Zero readable attributes still
yields **200** with empty `values` (existence is
member-visible). Collection: id-lex ASC; list rows
embed `etag` string (no per-row response headers).
Detail GET / PUT / PATCH success carry the strong
`ETag` header.

**Write-success bodies.** PATCH 201 bodies echo
the request-derived delta (validated `set` / `clear` as
applied + address-derived ids) and the new `ETag` —
NEVER the merged head (replay must not freeze one
caller's read projection or leak write-only-not-read
values). GET is the only projection surface.

**Value-revision history.**
`GET .../instances/:id/versions` — NOT a tenth lifecycle-
trio clone. Each entry `{ at, etag, version, values }`
DESC, projected by the caller's **current** read ACL.
`version` is the lookup token for
`GET .../instances/:id/versions/:version`. Foreign
403 / absent 404 / tombstone 404.

**ETag definition.** Quoted 64-hex `documentVersion`
of the projected GET body. If-Match parses exactly one
strong validator. Stored `responses.version` is
`documentVersion` of the full stored body — the two
differ by definition (§5.4.1).

**Miss posture (R2).** Every miss surface answers
through `missedReadError` (foreign 403 / absent 404
honest family body `record_instances`).

**Phase 2 resolution (G6).** Work-order ↔ instance SoT
coupling is the doctrine of record: bind op
`PUT /work-orders/:id/binding` (§3.34), transition
value writes through the instance head with If-Match
(§3.19), placement UNIQUE by construction. Design:
`docs/superpowers/specs/2026-08-05-work-order-instance-
sot-coupling-design.md` (amendments merged 2026-08-07 —
`2026-08-07-work-order-instance-sot-coupling-amendments-
design.md`). `flows/:id/records` join family is
UNTOUCHED.

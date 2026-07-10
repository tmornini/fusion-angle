# API.md — URI Catalog & POST Composition

The `api/` layer is a REST-style HTTP API over IndexedDB. Every
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
   formation step every write runs through, the response headers and
   redaction it produces, and the seed's own pre-formed pairs (§5).

The single most important fact: **POST endpoints here do not issue
internal HTTP sub-requests.** They compose store-level primitives
inside one `db.transaction([...tables])`. Why this is so — and the one
genuine exception (`facadeRequest`) — is §4.

The source of record is `api/routes.ts` (the route table),
`api/api.ts` (`handleRequest` + facades), `api/request-auth.ts` (the
gate), `api/authentication.ts` (the OAuth grants),
`api/invitations-domain.ts` (the invitation sub-router),
`api/organization-requests.ts` (the org/default-org
sub-routers), and `api/message-pair.ts` /
`api/message-redaction.ts` (shadow-ledger pair formation and
redaction — §5). This file summarizes them; on any
disagreement, the code wins.

---

## 1. Dispatch & Auth Planes

### 1.1 Request flow

`handleRequest(adapter, request)` (`api/api.ts:121`) resolves a request
in this order:

1. **Four pre-table special routes**, matched before the table:
   - `/organizations/:org/:entity[/:id]` (≥3 segments) →
     `facadeRequest` (the org-scoping facade; see §4).
   - `/identities/:id/default-org` (3 segments) →
     `identityDefaultOrganizationRequest`.
   - `/invitations/...` (first segment `invitations`) →
     `invitationsRequest` (its own sub-router; see §2.12).
   - bare `GET /organizations` →
     `organizationsEnumerationRequest`.
2. **`matchRoute(routeTable, segments)`** (`api/routes.ts:1443`) — a
   linear scan over the flat `routes[]` array. A route matches when
   segment counts are equal and every literal segment matches; a `:`
   segment captures a positional param. First match wins. No match is
   a `404`.
3. **The gate** (skipped for bearer-exempt routes): `authenticateRequest`
   (verify the Bearer JWT, reject anonymous/revoked) → `fenceRequest`
   (resolve the org once, derive live memberships + roles, build the
   org-scoped adapter) → `authorizeRequest` (per-org role check).
4. **Body parse** (`PUT`/`POST` only): `parseObjectBody` — a
   malformed or non-object JSON body is a `400` here, before either
   the pair or the handler ever sees it.
5. **Shadow-ledger pair formation + idempotency point-read**, for a
   write verb whose route pattern is in `PAIR_WIRED_ROUTE_PATTERNS`
   (skipped for bearer-exempt routes and for a verb the matched route
   has no handler for): `formWritePair` builds the canonical,
   redacted request/response message pair pre-tx — address
   resolution, a pre-tx head-read (`headPairIdAt`) for a
   document-class route's `Supersedes` chain, and the hashing that
   feeds idempotency, all before any transaction opens. Unless the
   route pattern is in `REPLAY_EXEMPT_ROUTE_PATTERNS`, a
   byte-identical resend is served straight from the STORED response
   (`storedResponseFor`) here — the handler never runs twice for the
   same request. See §5 for what this step produces on the wire.
6. Only then does the matched handler run, receiving the org-scoped
   adapter, the verified `actor` id, and — for a pair-wired write —
   the formed pair, appended as the LAST act of the handler's own
   transaction.

The acting member (`actor`) is always the verified token subject,
stamped by the gate and passed to every handler — authorship is never
client-supplied. A bearer-exempt route carries the anonymous id and
authors no member-state event.

### 1.2 Bearer-exempt sets (`api/request-auth.ts`)

Two route sets bypass the Bearer gate. Exempt is not the same as
unauthenticated — it is a single audited surface.

- **`AUTHENTICATION_ROUTES`** — the grant surface (a caller cannot hold
  a token before minting one):
  - `authentication/token`
  - `authentication/authorize`
- **`BOOTSTRAP_ROUTES`** — the auth-free dev-tier snapshot plane
  (installs the datastore before any identity exists; removed or
  re-gated at the Postgres server tier):
  - `snapshots/schema`
  - `snapshots/mock-data`
  - `snapshots/bootstrap`
  - `snapshots/import`

### 1.3 The client facade

The exported `GET`/`PUT`/`POST`/`DELETE` functions in `api/api.ts` are
the client-side facade the web-app adapters call. Each awaits a
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
- `GET /current-member` — the verified caller's own member row.
- `GET /ai-members` · `GET|PUT /ai-members/:id` — primitive.
  `PUT /ai-members/:id` is a document write (§5.10) — the tenth
  family, joining `MEMBERS_WIRING`'s shared-log-with-genesis
  bucket.
- `POST /ai-members` · `POST /ai-members/:id` — operation (§3.1, §3.2).
  Admin-only.
- `GET /human-members` · `GET /human-members/:id` — primitive.
  `human-members/:id` is registered for the document wiring
  (§5.10) — the eleventh family — but carries no live `PUT`, the
  first registered family without one.
- `POST /human-members` · `POST /human-members/:id` — operation (§3.3,
  §3.4). Admin-only.

### 2.2 Identities & subtree

- `GET /identities` · `GET|PUT /identities/:id` — primitive. `PUT`
  is a document write (§5.13) — the TWELFTH registered family,
  joining `MEMBERS_WIRING`'s shared-log-with-genesis bucket.
- `POST /identities` — operation (§3.5). Admin-only.
- `GET|PUT|DELETE /identities/:id/pii` — facet. Self-only read;
  self-or-admin write. PUT/DELETE ride the message plane's
  sanctioned hard-delete zone (§5.12).
- `GET /identity-pii` — admin PII roster.
- `GET /identities/:id/credentials` ·
  `GET|PUT /identities/:id/credentials/:cid` — nested; the opaque
  `secret` is projected out on every read. Admin-only. `PUT`'s
  closure is extracted to `postIdentityCredentialDocumentOp`
  (§5.13) but stays hand-dispatched, never family-registered
  (§5.13's nested-plane rationale).

### 2.3 Auth spine — tokens, providers, grants

- `GET /identity-tokens` (derived) · `GET /identity-tokens/:id`
  (derived) · `PUT /identity-tokens/:id` — primitive. `PUT` is
  pair-only (Phase 13 Task 9 retired the row write — nothing
  has read `identity_tokens` rows since Task 6).
- `POST /identity-tokens/:jti/rotation` — operation (§3.6).
- `POST /identity-tokens/:jti/revocation` — operation (§3.7).
- `GET|PUT /identity-token-revocations/:id` — primitive. `GET`
  admin-only; `PUT` is self-or-admin (WP8, Phase 13 Task 8) — a
  member may revoke its OWN token chain, naming another
  identity still requires admin.
- `GET /identity-providers` · `GET|PUT /identity-providers/:id` —
  primitive.
- `GET /role-grants` · `GET|PUT /role-grants/:id` — primitive.
  `PUT`'s closure is extracted to `postRoleGrantDocumentOp`
  (§5.13) but stays hand-dispatched, never family-registered
  (§5.13's event-plane rationale); its `WRITE_RESPONSE_SPECS`
  entry keeps re-stamping `organization_id` from the fence,
  untouched by the extraction.
- `POST /authentication/token` — grant dispatch (§3.8). Bearer-exempt.
- `POST /authentication/authorize` — interactive front door (§3.9).
  Bearer-exempt.

### 2.4 Ideas

- `GET /ideas` · `GET|PUT /ideas/:id` — primitive (§3.10).
  Member-tier.
- `POST /ideas` — retired (Phase 2 Task 3, R1): the composed
  create folded into the PUT above; the route now 405s like
  any other method-absent verb.
- `POST /ideas/:id/conversion` — operation, idea→project (§3.11).
  Member-tier.
- `GET /ideas/:id/submissions` ·
  `PUT /ideas/:id/submissions/:sid` — nested.

### 2.5 Projects

- `GET /projects` · `GET|PUT /projects/:id` — primitive
  (§3.32). Member-tier.
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
  head via `If-Response-ID` or 412s.
- `POST /flows` — operation (§3.12). Member-tier.
- `POST /flows/:id/undo` — operation (§3.14).
- `POST /flows/:id/redo` — retired (Phase 4 Task 4, R1/E5):
  the route leaves the URI tree entirely, so a request
  against it 404s (no pattern match) — never a 405
  method-absent gap. Live redo is a single locked
  `PUT /flows/:id` (§3.13).
- `GET|POST /flows/:id/versions` ·
  `GET|PUT|DELETE /flows/:id/versions/:vid` — retired
  (Phase 15 Task 7): zero product callers after
  undo-as-replay stopped consuming/publishing
  `flow_versions`. Router 404 (no pattern match). The
  table remains until Phase Final; historical prose for
  the dead surface lives at §3.16 / §3.31.
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
- `POST /work-orders/:id/claim` — operation (§3.18).
- `POST /work-orders/:id/transition` — operation (§3.19).

### 2.8 Records & attributes

- `GET /records` · `GET|PUT|DELETE /records/:id` — primitive.
  `PUT` is a document write (§3.33/§5.7) — the fifth family,
  and the first `'trio'` family whose `:id` address also
  carries a live `DELETE`. `GET` now rides the SAME generic
  document machinery `PUT` does — both the list (`GET
  /records`) and the entity read (`GET /records/:id`) derive
  from the message ledger (Task 7, Phase 6), not a
  hand-written dispatch; `DELETE` stays hand-written,
  unchanged.
- `POST /records` — operation, create-or-edit write (§3.20).
  Member-tier.
- `GET /record-attributes` · `GET|PUT /record-attributes/:id` —
  primitive.
- `DELETE /record-attributes/:id` — RESTRICT delete (409 if
  referenced; referrer check + splice in one tx).

### 2.9 Objectives

- `GET /objectives` · `GET|PUT /objectives/:id` — primitive
  (§3.29). `PUT` is a document write (§5.8) — the seventh
  family, and the THIRD `'stateless'` one (§5.8): Author gate
  3's second Decision 7 amendment, a distinct rationale from
  work-orders'/record-attributes' own. Both `GET`s now DERIVE
  from the ledger (§3.29): the collection via
  `documentCollectionGetHandler(OBJECTIVES_WIRING)`, the entity
  via `documentEntityRoute(OBJECTIVES_WIRING)` — flipped below
  the wire, key-set/value-identical to the old plane save the
  named id-first sub-cosmetic order.
- `POST /objectives` — operation (§3.21).
- `GET /objectives/:id/revisions` ·
  `PUT /objectives/:id/revisions/:rid` — nested.

### 2.10 States — the derived event log

- `GET /states` — primitive, DERIVED: the collection reads
  `deriveStates(db, organization)` (`api/derive-states.ts`),
  a six-source union over the message ledger reduced by
  `(at, id)`, returned `byIdAscending`. The `states` table
  is DELETED (Phase Final); this route never read a row
  store post-flip.
- `PUT /states/:id` — append/stamp a state event as a pair
  only; the author is the verified caller, stamped over any
  client-supplied `member_id`. Gated by the OWNERSHIP FENCE
  below — a foreign org's entity_id 404s. Immutability is
  pair-plane only: `stateEventCollisionFromPairs` reduces
  over 2xx pairs at the event-append address; 409 bytes stay
  `LedgerImmutabilityError`. The dual-write row half is
  GONE (Phase Final).
- `GET /states/:id` — retired (Phase 15 Task 7): zero product
  callers. The pattern STILL matches for PUT, so a bare GET
  is **405** (method-absent), not the router's open-tree
  404. Document this honestly — do not collapse it with the
  other retirements.
- `GET /entity-states/:id` — retired (Phase 15 Task 7): zero
  product callers; router 404 (no pattern match). History
  below is the LIVE current-state surface.
- `GET /entity-states/:id/history` — the full event history
  for an entity, DERIVED: reads
  `deriveStatesFor(db, organization, entityId)` in
  `(at, id)` order. The GATE fences parent ownership via
  `resolveOwningOrganization`; the derived handler does NOT
  re-fence.
- `GET /states/:id/field-values` — nested collection,
  DERIVED: `stateFieldValuesForStateEvent` two-source
  union; visibility via `stateEventVisibilityFor` (3-tier).
  Wire shape held: ALWAYS 200; orphan/own → rows; foreign →
  `[]`.
- `PUT|DELETE /states/:id/field-values/:fvid` — retired
  (Phase 15 Task 7): zero product callers; live writes ride
  the transition fold only. Router 404. The
  `WRITE_RESPONSE_SPECS` entry and seed address formation
  SURVIVE (§5.16) so reseeds still form the seven nested
  leaf pairs.

**The state ownership fence** (`api/api.ts`): `MEMBER_VERBS`
permits member-tier PUT on `/states/:id`
(`api/authorization.ts`), and the body names its target
`entity_id` directly. `PutHandler` carries no organization
argument (`routes.ts`). Surviving stores are global (no
org-scoped adapter); the check runs at the GATE via
`resolveOwningOrganization` (`api/derive-states.ts`) —
org-nested document legs, invitations, memberships, the
flow-graph history walk, and the organizations
self-as-owner leg. Outcomes: OWN-org (or owner-null)
passes; foreign — LIVE, soft-deleted, OR hard-spliced —
404s, byte-identical to
`{error: 'Not found: ' + pathname}` (never an
`EntityNotFoundError`, which keys on the wrong id). Org-
scoped document PUT/DELETE also hit the write-ownership
fence (`api/write-ownership-fence.ts`) so a foreign id
cannot genesis in the caller's namespace. The leaf
field-values write fence retired WITH the leaf routes.

Two named strengthenings closed at the same re-anchor:
(2a) WP1 — a forged PUT naming an organization id as
`entity_id` now 404s (self-as-owner); (2b) a hard-deleted
record's orphaned genesis event no longer admits a foreign
forge as an "orphan."

Named residual: within ONE org, a member-tier PUT
`/states/:id` can still post a `'deleted'` event naming a
fellow member/membership/ai-member/human-member id
(MEMBER_VERBS allows it; those roster kinds resolve via the
membership ledger). This intra-org reachability is
unchanged — the user elected the ORG boundary, not a
kind/alphabet gate — and is tracked as a named acceptance
(see `tests/drift-roster.test.ts`'s "states/:id escape
hatch"), not a bug this phase closes.

### 2.11 Organizations & memberships

- `GET /organizations` — the caller's reachable orgs (identity-scoped;
  runs above the admin gate so a roleless member can boot). The row
  list is the pair-plane derivation (Phase 12 Task 5):
  `deriveOrganizations` (`api/derive-organizations.ts`, §5.18); the
  membership filter is ALSO derived now (Phase 13 Task 3):
  `callerOrganizationIds` (`api/request-auth.ts`) reads
  `deriveMembershipsForIdentity`, never `memberships.getAllWhere`.
- `GET|PUT /organizations/:id` — primitive (global passthrough; reads
  fence to the caller's memberships). `GET` is FLIPPED too (Phase 12
  Task 5): a bespoke `deriveOrganization` call in the route closure
  (§5.18), not the generic `documentGetHandler` every other flipped
  family rides. `PUT` stays hand-written old-plane.
- `GET /memberships` · `GET|PUT|DELETE /memberships/:id` —
  primitive. `PUT` is a document write (§5.9) — the eighth
  family, and the FOURTH `'stateless'` one (§5.9): a pure join
  relation with no lifecycle concept at all — record-attributes'
  actual sibling, not work-orders'/objectives' own distinct
  rationale. `GET` and `DELETE` stay hand-written, old-plane,
  until Task 8.
- `GET|PUT /identities/:id/default-org` — the read/write face of the
  default-org ledger. Self-only. `GET` (and every other caller of
  `identityDefaultOrganization`, api/authentication.ts) reads via
  `deriveDefaultOrganization` (api/derive-default-organization.ts,
  Phase 11 Task 8): a TARGETED `requests`/`responses` read at the
  identity-keyed `/identities/:id/default-org/` prefix, never the
  `identity_default_organizations` table directly. `PUT` still
  writes that table (Path A — unchanged) beside its own pair.

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

### 2.13 Snapshots (bootstrap plane, bearer-exempt)

- `GET /snapshots/schema` — schema existence + full export, else null.
  The export (`getSnapshot`, `api/db-backed.ts`) stamps one reserved
  top-level key, `__schema_version__` (`SNAPSHOT_SCHEMA_VERSION`
  = 3 post-Phase-Final, `api/db.ts`), beside the survivor
  `TABLE_NAMES` arrays (`clients`, `requests`, `responses`).
- `DELETE /snapshots/schema` — drop the schema and reopen clean.
- `POST /snapshots/mock-data` — seed the full demo dataset (§3.26).
- `POST /snapshots/bootstrap` — seed the pristine minimal state
  (§3.27).
- `PUT /snapshots/import` — validate then atomically restore a snapshot
  (§3.28). `parseAndValidateSnapshot` (`api/snapshot-validator.ts`)
  REJECTS an absent or mismatched `__schema_version__` with
  `SnapshotVersionMismatchError`, before any table is read — the
  universal gate, covering every `DbAdapter.putSnapshot` caller.
  ASYMMETRIC by design: it closes "a new build imports an old
  export" only — an old build's importer has no way to know the
  marker exists, so it silently ignores the key and imports
  anyway. The client-side `scanForRetiredKeys` pre-flight
  (`web-app/app/adapters/snapshots.ts`) checks the same key
  before upload, as a convenience only; the server gate is the
  guarantee.

`getHasAnyHumanMembers` (`web-app/app/adapters/snapshots.ts`) — the
first-run check gating the pristine-vs-seeded boot choice —
re-anchored (Task 6) from a raw `members` table slice onto a scan
of the SAME export's `requests` rows at the `/members/` address,
matching what the now-derived `GET /members` (§2.1) actually sees.

---

## 3. POST Composition Catalog

Each entry gives: the **transaction** table-set (or "no tx"); the
**actual** ordered store-operation sequence; the **doctrinal** mapping
(each store op as a single-noun primitive — `put_noun`,
`post_state_event`, `delete_noun` — and the whole as a composed
`post_operation`); and **properties** (atomicity, idempotency,
TOCTOU-safety, validator, actor source).

Notation in the doctrinal lines: `put_x` ≈ `PUT /x/:id`;
`post_state_event` ≈ append to the `states` ledger (cf. `PUT
/states/:id`); `delete_x` ≈ `DELETE /x/:id`.

### 3.1 `POST /ai-members` — create AI member

`postAiMemberCreationOp` (`api/routes.ts`).

- tx: `[members, ai_members, states, requests, responses]`
- actual:
  1. `members.put(id, {type:'ai'})`
  2. `aiMembers.put(id, detail)`
  3. `states.postEvent(initialStateEventId, id, initialState, actor)`
  4. three `appendMessagePair` calls — operation, member document,
     detail document (the bundle, below)
- doctrinal: `put_member` + `put_ai_member` + `post_state_event`
  composed as `post_create_ai_member`.
- props: atomic; admin-only; `validateAIMemberCreateBody` at the gate;
  actor server-stamped.

### 3.2 `POST /ai-members/:id` — edit AI member

`postAiMemberEditOp` (`api/routes.ts`) — extracted from an anonymous
closure this same task, the FIRST composed-EDIT synthesis (below).

- tx: `[members, ai_members, requests, responses]`
- actual: `members.put(id, {type:'ai'})` then
  `aiMembers.put(id, detail)`, then three `appendMessagePair` calls —
  operation, member document, detail document (the bundle, below).
- doctrinal: `put_member` + `put_ai_member` as `post_edit_ai_member`.
- props: atomic; **no state event** (an edit does not move lifecycle);
  admin-only; `validateAIMemberEditBody`.

### 3.3 `POST /human-members` — create human member

`postHumanMemberCreationOp` (`api/routes.ts`). PII no longer
lands here (Phase 10 Task 2's intake decomposition, prose
below) — it enters via a second, separate hop.

- tx: `[members, identities, human_members, states, requests,
  responses]`
- actual:
  1. `members.put(id, {type:'human'})`
  2. `identities.put(id, {kind:'person'})`
  3. `humanMembers.put(id, detail)`
  4. `states.postEvent(initialStateEventId, id, initialState, actor)`
  5. FOUR `appendMessagePair` calls — operation, member document,
     detail document, identities document (the bundle, below;
     Phase 10 Task 5 widens the triple to a quadruple, human-only)
- doctrinal: three `put_*` primitives + `post_state_event` as
  `post_create_human_member`.
- props: atomic; admin-only; `validateHumanMemberCreateBody`
  (`['id', 'detail', 'initialState', 'initialStateEventId',
  'initialStateAt']` — `pii` retired from this key set).

### 3.4 `POST /human-members/:id` — edit human member

`postHumanMemberEditOp` (`api/routes.ts`) — the postAiMemberEditOp
precedent above, for the sibling facet. PII no longer lands here
either — it changes ONLY via the separate hop, fired IFF the
client's dirty check finds it changed.

- tx: `[members, identities, human_members, requests, responses]`
- actual: the three facet `put`s (member, identity, detail), then
  FOUR `appendMessagePair` calls — operation, member document,
  detail document, identities document (the bundle, below) — the
  LAST of which FOLDS (§5.14): its `{kind:'person'}` body is
  byte-identical to the create's own, at the SAME address.
- doctrinal: three `put_*` primitives as `post_edit_human_member`.
- props: atomic; **no state event**; admin-only;
  `validateHumanMemberEditBody` (`['detail']` alone — `pii`
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
  address's own (uriPrefix, uriId) — the flows/objectives
  precedent (§3.12/§3.21). For an edit, the address IS the entity
  address already — `POST /ai-members/:id` / `/human-members/:id`
  were already pair-wired there.
- **The member document pair** — PUT-shaped, at the ONE shared
  `members/:id` address every member kind writes through
  regardless of family, body `memberDocumentBodyOf(type)` →
  `{type}` alone — the exact live `PUT /members/:id` wire body —
  validated through `validateMemberDocumentBody`. The member kind
  is a server-supplied fact (never read off the request body), so
  this body is IDENTICAL for a create and every later edit of the
  SAME member — see the fold note below.
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
failure (an invalid AI model id or a malformed human `strengths`
JSON string, caught by the pre-tx document-body check or by the
op's own re-validating store put) leaves zero of the bundle,
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
`{detail}` alone. PII enters ONLY through `PUT
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
- `putHumanMember`: `POST /human-members/:id` (detail alone),
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
member's `type` is a server-pinned fact that never changes across
an edit, so `memberDocumentBodyOf`'s body — `{type}` — is
byte-identical, at the SAME address, on every write to the SAME
member from its genesis onward. `appendMessagePair`'s global
by-hash fold therefore skips the member-document pair on every
edit following the first write to that member — a genuinely
PERMANENT fold, not a fixture accident: the address needs no
second write since its one field never varies. The identities
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

- tx (branches by kind):
  - person → `[identities, requests, responses]`
  - service → `[identities, identity_credentials, requests,
    responses]`
- actual: `identities.put(id, {kind})`; then, service only,
  `identityCredentials.put(credId, fields)`; then the bundle
  (Phase 10 Task 5, §5.14): `appendMessagePair(operation)`, then
  `appendMessagePair(identityDocument)`, then — service only —
  `appendMessagePair(credentialDocument)`.
- doctrinal: `put_identity` (+ `put_identity_credential` for
  service) as `post_create_identity`.
- props: atomic; **no state event** (an identity has no creation
  lifecycle event); admin-only; secret hashed client-side (the route
  touches no crypto); `validateIdentityCreateBody`
  (`['id', 'kind']` for person — `pii` retired from this key set;
  `['id', 'kind', 'credential']` for service, unchanged); the
  bundle is pairs-or-nothing IFF the gate supplied a pair and a
  fence organization — a below-facade caller (`api/mock-data.ts`,
  Task 6's own scope) skips it, exactly like every prior bundle.

### 3.6 `POST /identity-tokens/:jti/rotation` — rotate refresh jti

Delegates to `rotateRefreshJti` (`api/authentication.ts:480`).

- tx: `[requests, responses]`
- actual: PRE-TX — `deriveIdentityTokenEventsForJti(presented)`
  → `chainIdForJti(...)` → `deriveIdentityTokens` filtered to
  the chain → `planRotation(...)` (pure) → `formTokenEventWrites`
  (one `formTokenEventPair` per planned append). IN-TX
  VERIFY-OR-RETRY (Phase 13 Task 5, gate 7): re-derive the SAME
  chain, re-`planRotation`, compare the fresh jti set against
  the pre-formed writes' — diverged → abort and retry (3
  attempts); equal → `appendMessagePair` each pre-formed write,
  then, rotate only, `appendMessagePair(pair)`.
- doctrinal: read the token ledger + `post_token_event`(s) as
  `post_rotate_refresh_token`.
- props: atomic; TOCTOU-safe (verify-or-retry inside the tx, so two
  concurrent rotations cannot both rotate); live jti → `{jti}`,
  reuse/unknown → 409; replay-exempt (§5.1) — a byte-identical resend
  re-enters this function rather than replaying a cached response;
  PAIR-ONLY (Phase 13 Task 9 retired the `identity_tokens` row
  write — every event lives only as its own message pair).

### 3.7 `POST /identity-tokens/:jti/revocation` — revoke chain

Delegates to `revokeTokenChain` (`api/authentication.ts:576`).

- tx: `[requests, responses]`
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

`postToken` (`api/authentication.ts:1022`) dispatches on
`grant_type`. Every grant is **grant-first**: it authenticates
the presented grant before any side effect, so a failed grant
appends nothing and mints nothing. `mintPair` is pure crypto (no
DB). Every SUCCESSFUL grant also forms its own message pair
pre-tx (`formAuthPair`, from the `AuthPairSeed` the dedicated
arm seeds in `api/api.ts`) and appends it as the tx's LAST row
op — see §5.1 for the headers this produces and §5.2 for the
redaction the stored pair carries.

- **`authorization_code`** → `grantAuthorizationCode`:
  - PRE-TX: `deriveAuthorizationCodeId` (`sha256Hex(code)`) →
    `authorizeCodeIssuer` (scans the
    `/authentication/authorize/` response family for the
    fingerprint match) → `authorizationCodeSpent` fast-fail
    (`requests.getAllWhere('uri_id', derivedId)` filtered to the
    `identity-tokens/` prefix — a hit IS the spend marker,
    KEY-BY-ANCHOR: the issued root's row id equals the code's
    own digest) → `mintPair` → `formAuthPair` →
    `formTokenEventPair` (the root's own event).
  - tx `[requests, responses]`: re-run `authorizationCodeSpent`
    on the open view — a race loser aborts, appending nothing
    further — then `appendMessagePair` the root's event pair,
    then the auth pair.
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
    event pair, then the auth pair (when seeded).
  - props: the issue + pair append ride ONE minimal transaction
    — a mid-write fault can never leave an issued chain root
    with no matching ledger pair. Cross-party exchange → 403,
    appending nothing.
- **`client_credentials`** → `grantClientCredentials`
  (private_key_jwt):
  - `clients.getById` → status/grant-type checks →
    `verifyClientAssertion` (JWS, crypto) → `nameFor` →
    `issueTokenPair` (as above, same tx shape).
  - props: the same atomic single-tx shape as token-exchange. Bad
    assertion → 401, appending nothing.

### 3.9 `POST /authentication/authorize` — interactive front door

`postAuthorize` (`api/authentication.ts:1183`) dispatches on
`method`.

- **`password`** → `authorizePassword`:
  - `deriveIdentityPiiRows` (full-ledger scan) →
    `identityByEmail` → `deriveCredentialsFor` (identity-keyed)
    → `currentPasswordSecret` → `verifyPassword` (PBKDF2) → on
    success `formAuthPair` (pre-tx) → tx `[requests, responses]`:
    `appendMessagePair(pair)`.
  - doctrinal: verify credentials, then `post_authorization_code`.
  - props: every failure returns the **same** 401 and appends nothing
    (no user enumeration); unknown-user / missing-secret paths run
    `equalizeFailureTiming` to close the timing channel; the STORED
    pair carries the PBKDF2-fingerprinted password and the
    sha256-fingerprinted code (§5.2), never the live values;
    PAIR-ONLY (Phase 13 Task 9 retired the `authorization_codes`
    row write — the issued code lives only as its own message
    pair; `authorizationCodeSpent` in the `authorization_code`
    grant arm above replaces the retired `codeState`-driven
    re-read as the spend check).
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

- tx: `[ideas, states, requests, responses]`
- actual: read the current head event
  (`states.getCurrentFor(id)`) → `ideas.put(id, entity)` (the
  org-scoped store stamps `organization_id`, so the body omits
  it) → `states.postEvent(state_event_id, id, state, memberId,
  state_at)` → `appendMessagePair(pair)`.
- doctrinal: `put_idea` + `post_state_event` as
  `put_idea_document`.
- props: atomic; member-tier; `validateIdeaDocumentBody`;
  idempotent (a byte-identical resend converges: one row, one
  event, one pair); MEMBER_ID CAVEAT — a state-unchanged edit
  (the resent trio matches the current head byte-for-byte)
  replays the STORED head event's `member_id`, never the
  editing actor, so a different member editing a field after
  someone else's transition does not 409.

### 3.11 `POST /ideas/:id/conversion` — promote idea → project

The lone cross-aggregate write.

- tx: `[projects, ideas, states,
  project_objective_baseline_scores, requests, responses]`
- actual:
  1. `projects.put(projectId, project)` (org-scoped stamps org)
  2. `ideas.put(ideaId, idea)` (promote)
  3. `states.postEvent(ideaStateEventId, ideaId, ideaState, actor)`
  4. `states.postEvent(projectStateEventId, projectId, projectState,
     actor)`
  5. for each baseline: `projectObjectiveBaselineScores.put(...)`
  6. 3+N `appendMessagePair` calls (below).
- doctrinal: `put_project` + `put_idea` + two `post_state_event` + N
  `put_baseline_score` as `post_convert_idea`.
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

- tx: `[flows, project_flows, states, requests, responses]`
- actual: `flows.put(id, flow)` (org-scoped stamps org) →
  `projectFlows.put(projectFlowId, projectFlow)` →
  `states.postEvent(initialStateEventId, id, initialState, actor)` →
  three `appendMessagePair` calls (below).
- doctrinal: `put_flow` + `put_project_flow` + `post_state_event` as
  `post_create_flow`.
- props: atomic; member-tier; `validateFlowCreateBody`.

**Three pairs, one tx (Phase 4 Task 5), mirrored by work-orders'
own create (§3.17).** The route pre-forms two extra pairs beside
the gate's own operation pair, ONLY when the gate supplied both a
pair and a fence organization — a below-facade caller
(`api/mock-data.ts`) skips all three:

- **The operation pair** — the gate's own, at the SAME address a
  live genesis `PUT /flows/:id` would use: `createdEntityUriId`'s
  override collapses `POST /flows` onto `flows/:id`'s own
  (uriPrefix, uriId), so the two verbs chain against one address.
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
wire form, no transform), and two TRANSITIONAL decomposition
sidecars (`graphDelta`, `revivals` — consumed by the old-plane
relation writer below AND by `deriveFlowGraphStates`
(`api/derive-states.ts`), the sole ledger source of flow-node/
edge deleted/restored history; retirement at Phase Final is now
GATED on that lifecycle source being re-anchored elsewhere
first). UNLIKE `PUT /ideas/:id` / `PUT /projects/:id`, this op
mints NO `member_id` ternary — every attempt (including a
client retry) mints a fresh trio, so nothing here ever resends
a STORED trio verbatim.

**flows is the FIRST locked-class route** (§5.4, Task 3): a
save on an existing flow must carry `If-Response-ID`, echoing
the head the client just read, or the write 412s. The client
adapter (`putFlow`, `web-app/app/adapters/flow-mutations.ts`)
absorbs a 412 with up to 3 attempts total — each retry backs off
(jittered) and rebuilds the body against the NEW head (a fresh
baseline, fresh delta, fresh trio) before resubmitting; any other
error, or a third 412, propagates to the caller. version-publish
is no longer an option embedded in this PUT (Decision 3), nor is
it a client-side prerequisite of this PUT any more (Phase 14
Task 8, undo-as-replay): `POST /flows/:id/versions` (§3.16)
still exists as a standalone route but has NO live caller —
undo now resolves its own restore target from THIS route's own
document-pair history (§3.14), so nothing archives a snapshot
before a save any more.

- tx: `[flows, states, flow_nodes, flow_edges,
  flow_node_members, flow_node_attributes, requests, responses]`
  — NO `flow_versions`.
- actual: `flows.put(id, entity)` (the org-scoped store stamps
  `organization_id`, so the body omits it) →
  `states.postEvent(state_event_id, id, state, actor, state_at)`
  → the graph delta's node/edge upserts, member/attribute
  events, and deletion events (`writeFlowGraphDelta`, the SAME
  helper `POST /flows` and undo use — redo's document half
  IS this very PUT, Phase 4 Task 4) → for each revival:
  `states.postEvent(eventId, entityId, 'restored', actor, at)`
  (the undo route's own loop, reused) → `appendMessagePair(pair)`
  LAST.
- doctrinal: `put_flow` + `post_state_event` + graph-relation
  writes + N `post_restored_event` as `put_flow_document`.
- props: atomic; member-tier; `validateFlowDocumentBody`;
  idempotent (a byte-identical resend — SAME body, SAME echo —
  converges at the gate's pre-tx fast path: one row, one event,
  one pair) — a same-id, genuinely different-content collision
  still 409s via `LedgerImmutabilityError`, today's covenant.
- **Response-ID on GET.** `GET /flows/:id` carries a
  `Response-ID` header — the current head pair id, the exact
  value a save's `If-Response-ID` echoes back — attached
  generically by the gate for any locked-family document GET
  (never a `flows` literal), served by the generic
  `documentGetHandler` (§5.5) like every other document GET.
- **Undo advances the shadow head.** Undo forms its own
  document pair (PUT-shaped, at `flows/:id`'s own address) in
  the SAME transaction as its own operation pair, taking the
  locked family's FOLLOWS slot against the pre-undo head —
  never Supersedes, since the op holds no echo of its own.
  Undo therefore moves `flows/:id`'s own head exactly like any
  other save. A save racing an undo for the same head loses the
  `responses.follows` unique index and 412s; the client absorbs
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
- tx (target resolved): `[flows, states, flow_nodes, flow_edges,
  flow_node_members, flow_node_attributes, requests,
  responses]` — NO `flow_versions`.
- actual (target resolved): `flows.put(id, targetFields)` (the
  RESOLVED target's own scalar fields) →
  `states.postEvent(eventId, id, 'updated', actor, at)` → the
  graph delta's node/edge upserts, member/attribute events, and
  deletion events (`writeFlowGraphDelta`, the SAME helper
  `PUT /flows/:id` and create use) — the delta itself computed
  by `api/flow-graph-diff.ts` from CURRENT (this flow's own
  head document pair's `graph` field) vs TARGET (the resolved
  pair's own `graph` field), both already in hand from the SAME
  pre-tx pair-plane read — for each revival:
  `states.postEvent(eventId, entityId, 'restored', actor, at)`
  → `appendMessagePair(pair)` → `appendMessagePair(documentPair)`.
- **Exhaustion is a graceful no-op, not an error.** When
  resolution finds no target, the route still appends its OWN
  operation pair alone — no document pair, no domain writes —
  since the gate requires every wired write to have stored a
  pair (`api.ts`'s "wired write stored no pair" guard fires
  otherwise). A LATER resolution walk correctly ignores this
  attempt: it carries no correlated document pair to displace
  anything. 204 either way — the client cannot and does not
  need to distinguish "restored" from "no-op" from the response
  alone (see `hasUndoHistory` below).
- **`hasUndoHistory` rides the flow's own GET, not this
  response.** `WRITE_RESPONSE_SPECS`-driven responses are
  computed PRE-HANDLER, from request params/body alone — this
  route's own 204 can never carry post-resolution data. Instead,
  `FlowWithGraph`/`FlowGraph` (§5.x) carry a `hasUndoHistory`
  boolean — this flow's own document-pair count exceeding one —
  computed by `flowEntityOf` (`api/derive-flows.ts`) and reused
  by the trailing `GET /flows/:id` the client already makes
  after every undo (and at page load), so the signal costs zero
  new wire reads.
- **SIDECAR-KEEP.** `graphDelta`/`revivals` still land in the
  restore's own document pair body, feeding
  `deriveFlowGraphStates` (`api/derive-states.ts`) exactly like
  any other save's — the MECHANISM persists even though the
  VALUES are now server-computed rather than client-supplied
  (the client cannot diff against a target it is never told,
  since no new GET route is sanctioned for this).
- doctrinal: `put_flow` + `post_state_event` + graph-relation
  writes + N `post_restored_event` as `post_undo_flow`.
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

**Route retired.** A request against `/flows/:id/versions`
(or the leaf `/flows/:id/versions/:vid`) 404s — no pattern
match. Historical shape (kept for the dual-write-era
record; do not re-implement):

- tx: `[flow_versions, requests, responses]`
- actual: `flowVersions.put(id, version)`; for each
  `trimId`: `flowVersions.delete(trimId)`;
  `appendMessagePair(pair)`.
- **Zero live callers since Phase 14 Task 8
  (undo-as-replay).** Versioned edits and redo used to
  archive through this route before `PUT /flows/:id`;
  undo-as-replay stopped both. Phase 15 Task 7 removed the
  routes and adapters; the `flow_versions` TABLE remains
  until Phase Final.

### 3.17 `POST /work-orders` — create work order

- tx: `[work_orders, flow_work_orders, states, requests, responses]`
- actual: `workOrders.put(id, workOrder)` (org-scoped stamps org) →
  `flowWorkOrders.put(flowWorkOrderId, flowWorkOrder)` → loop i in
  0..2: `states.postEvent(stateEventIds[i], id, states[i], actor)` →
  three `appendMessagePair` calls (below).
- doctrinal: `put_work_order` + `put_flow_work_order` + three
  `post_state_event` (start transition, post-start transition,
  creation-time `claimed`) as `post_create_work_order`.
- props: atomic; the three events are applied in order; member-tier;
  `validateWorkOrderCreateBody`.

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
therefore records `Supersedes` on its OWN new document pair
against the PRIOR document pair; the duplicate's own operation
pair, reading that SAME shared address fresh at gate entry,
supersedes that same prior document pair too (`work-orders` is
`'simple'` concurrency, §5.4 — it chains via `Supersedes`, never
`Follows`). Three pairs commit or none: a mid-transaction failure
(a state-ledger collision, say) leaves zero of the three, exactly
like every other atomic write in this catalog.

### 3.18 `POST /work-orders/:id/claim` — claim

- tx: `[work_orders, states, requests, responses]`
- actual:
  1. `workOrders.getById(id)`
  2. `validateWorkOrderFlowGraphJson(...)` (pure parse)
  3. `states.getAllFor(id)` → `latestClaimEvent(...)`
  4. if a live claim by another member → 409; by the caller → no-op.
  5. if the prior claim is expired:
     `states.postEvent(..., 'claim_expired', prior.member_id)`.
  6. `states.postEvent(..., 'claimed', actor)`.
  7. `appendMessagePair(pair)`.
- doctrinal: read the claim history + up to two `post_state_event` as
  `post_claim_work_order`.
- props: atomic; **TOCTOU-safe** (read + check + append ride one tx, so
  two concurrent claims cannot both see "no live claim"); idempotent
  for the current holder — the pair still appends, that call's only
  write; member-tier.

### 3.19 `POST /work-orders/:id/transition` — transition along an edge

- tx: `[states, state_field_values, requests, responses]`
- actual:
  1. `states.postEvent(transitionEventId, id, targetState, actor)`
  2. for each field value: `stateFieldValues.put(row.id, fields)`
  3. if `release !== null`:
     `states.postEvent(release.id, id, release.state, actor)`
  4. `appendMessagePair(pair)`
- doctrinal: `post_state_event` + N `put_state_field_value` + optional
  `post_state_event` (claim release) as `post_transition_work_order`.
- props: atomic; the web-app computes the target node, field values,
  and whether a claim release is needed; member-tier;
  `validateWorkOrderTransitionBody`.
- **Dangling `state_event_id` (Phase 15 Task 3, wire delta 4).**
  A field value whose `state_event_id` names no event of THIS
  transaction 400s at the gate. Observable ONLY to forged
  clients — the shipped UI always sends the transaction's
  own id. Pins: `tests/api-work-order-transition.test.ts`.

### 3.20 `POST /records` — record write (create or edit)

`postRecordWriteOp` (`api/routes.ts`).

- tx (dynamic): `[records, record_attributes, states,
  ...ATTRIBUTE_RESTRICT_TABLES, requests, responses]`
- actual:
  1. `validateRecordWriteBody(body)` (create vs edit, entries,
     removals)
  2. `records.put(id, record)`
  3. if `create`: `states.postEvent(initialStateEventId, id,
     initialState, actor)` — genesis, actor-authored, exactly
     ONE event
  4. if `edit`: the SAME sameEvent decompose `PUT /records/:id`
     (§3.33) runs — read the current head, replay its
     `member_id` on a byte-identical echo, else `actor` — then
     `states.postEvent(state_event_id, id, state, memberId,
     state_at)`; a genuine echo converges to a no-op write
     (`states.put`'s own idempotency by id)
  5. if removals: `collectAttributeReferrers(...)` → if any referrer,
     `throw 409` (rolls back the whole batch)
  6. if entries or removals:
     `recordAttributes.putMany(entries, removedIds)`
  7. the bundle's pairs (below), appended LAST, in order:
     operation, document, N attribute-PUTs, M attribute-DELETEs
- doctrinal: `put_record` + optional `post_state_event` + a
  put/delete batch over `record_attributes` as `post_write_record`.
- props: atomic; **RESTRICT** (a removed attribute still referenced
  409s and rolls back the whole write, so no pair lands for it
  either); member-tier.

**The bundle: 2+N (create) or 2+N+M (edit) pairs, one tx (Phase
6 Task 4 — the migration's FIRST VARIABLE-CARDINALITY
synthesis).** Unlike the flows/work-orders create-triple
(§3.12/§3.17, always exactly three), a record write's pair count
scales with its own attribute arrays: the operation pair, the
document pair, one attribute-PUT pair per `attributes[]` entry
(N), and — edit only — one attribute-DELETE pair per
`removedAttributeIds` entry (M; a create body has no
`removedAttributeIds` field at all, so M is always 0 there). The
route pre-forms every non-operation pair beside the gate's own
operation pair, ONLY when the gate supplied both a pair and a
fence organization — a below-facade caller (`api/mock-data.ts`)
skips them all:

- **The document pair** — PUT-shaped, at `records/:id`'s own
  address (the SAME address `POST /records` collapses onto, via
  the registry's create-address override — §5.6), body
  `recordDocumentBodyOf(b)`: the entity's own three fields
  (`name`, `description`, `position`; `organization_id`
  excluded) plus the lifecycle trio — mapped from
  `initialState*` on create, carried verbatim from the body's
  own echoed trio on edit — validated through
  `validateRecordDocumentBody` (belt-and-suspenders:
  `initialStateEventId` carries no non-empty rule of its own on
  create, so an empty value 400s HERE rather than minting an
  invalid pair) — byte-indistinguishable from a live
  genesis/edit `PUT /records/:id`.
- **N attribute-PUT pairs** — one per `attributes[]` entry,
  PUT-shaped at `record-attributes/:id`'s own address, body
  `recordAttributeDocumentBodyOf(attr)` (the id-strip
  destructure: the entity fields minus `id` and
  `organization_id`) — byte-indistinguishable from a live
  `PUT /record-attributes/:id`.
- **M attribute-DELETE pairs** (edit only) — one per
  `removedAttributeIds` entry, DELETE-shaped at the SAME
  `record-attributes/:id` address the attribute's own PUT pair
  used, status 204 with no body — every DELETE response is
  UNIVERSALLY 204 with no body (`api/api.ts`'s gate) —
  byte-indistinguishable from a live
  `DELETE /record-attributes/:id`.

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
A duplicate create (same record id) therefore records
`Supersedes` on its own new document pair against the PRIOR
document pair; the duplicate's own operation pair, reading that
SAME shared address fresh at gate entry, supersedes that same
prior document pair too (`records` is `'simple'` concurrency,
§5.4). The whole bundle commits or none: a mid-transaction
failure (a state-ledger collision, or a RESTRICTed removal)
leaves ZERO of the bundle's pairs, exactly like every other
atomic write in this catalog.

**The edit-only trio.** `RecordWriteEditBody` now carries the
SAME `state`/`state_at`/`state_event_id` keys `PUT /records/:id`
(§3.33) accepts, with the SAME validation rules — an edit body
without them 400s before ever reaching the referrer check above
(step 5): the RESTRICT proof depends on that ordering. The client
(`postRecordChange`, `web-app/app/adapters/records.ts`) echoes
the trio from the already-loaded detail model
(`RecordChangeEdit.state`/`stateAt`/`stateEventId`) — zero new
hops, mirroring the records list's/detail page's existing
no-attribute-change echo (§3.33). Create's own keys are
UNCHANGED (`initialState`/`initialStateEventId`/
`initialStateAt` remain R2's byte-pinned birth names).

### 3.21 `POST /objectives` — create objective

`postObjectiveCreationOp` (`api/routes.ts`).

- tx: `[objectives, objective_revisions, requests, responses]`
- actual: `objectives.put(id, objective)` (org-scoped stamps org) →
  `objectiveRevisions.put(revisionId, revision)` → three
  `appendMessagePair` calls (below).
- doctrinal: `put_objective` + `put_objective_revision` as
  `post_create_objective`.
- props: atomic; **no state event** (a fresh objective reads as active
  until a later archival event); `validateObjectiveCreateBody`.

**Three pairs, one tx (Phase 7 Task 3), the flows/work-orders
fixed-triple precedent (§3.12/§3.17).** The route pre-forms two
extra pairs beside the gate's own operation pair, ONLY when the
gate supplied both a pair and a fence organization — a
below-facade caller (`api/mock-data.ts`) skips all three:

- **The operation pair** — the gate's own, at the SAME address a
  live genesis `PUT /objectives/:id` would use:
  `createdEntityUriId`'s override collapses `POST /objectives`
  onto `objectives/:id`'s own (uriPrefix, uriId), so the two
  verbs chain against one address.
- **The document pair** — PUT-shaped, at `objectives/:id`'s own
  address, body `objectiveDocumentBodyOf(b)` (the create body's
  `objective` sub-object with `organization_id` stripped — the
  live `PUT /objectives/:id` wire body is `{position}` alone),
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

`grantInvitation` (`api/invitations-domain.ts:238`).

- before tx (base-adapter reads): `callerActiveOrg` → `callerIsOrgAdmin`
  (`roleGrants.getAllWhere`) → parse `email` → `identityPii.getAll`
  find the matching identity (404 if none) → `formWritePair` (a
  pre-tx head-read via `headPairIdAt` feeds the `Supersedes` chain)
  → the pre-tx idempotency point-read (`storedResponseFor`).
- tx: `[invitations, states, memberships, requests, responses]`
- actual:
  1. `memberships.getAll` — already-member check (→ 409)
  2. `pendingInvitationFor(...)` (`invitations.getAll` +
     `states.getAll`) — idempotency (→ return existing pending)
  3. `invitations.put(id, {organization_id, identity_id, at})`
  4. `states.postEvent(eventId, id, 'pending', principal.id)`
  5. `appendMessagePair(pair)` — the operation pair
  6. on the SAME 'fresh' outcome only: `appendMessagePair(document)`
     — the invitation DOCUMENT pair (Phase 8 Task 6), PUT-shaped, at
     the SAME address as the operation pair; a duplicate echo forms
     and appends no document (§5.11)
- doctrinal: member/pending guards + `put_invitation` +
  `post_state_event` as `post_grant_invitation`.
- props: atomic; admin-only; idempotent on an outstanding pending
  invite (the duplicate-echo branch still appends its own pair);
  TOCTOU-safe (the guards ride the write tx, re-verified against the
  pre-tx read that formed the pair). The org is the admin's active
  org, not the path.

### 3.23 `POST /invitations/:id/acceptance` — accept

`acceptInvitation` (`api/invitations-domain.ts:364`). The only live
membership write.

- before tx: `loadInvitation` (`invitations.getById`; 404 if absent);
  assert `identity_id === caller` (else 403); `formInvitationOpPair`
  (operation-addressed, no head-read) → the pre-tx idempotency
  point-read.
- tx: `[memberships, states, requests, responses]`
- actual:
  1. `currentInvitationState` (`states.getCurrentFor`); `accepted` →
     no-op (append the pair, below, then return); not `pending` →
     409, appending nothing.
  2. `memberships.getAll` — already-member guard.
  3. if not already: `memberships.put(membershipId,
     {organization_id: INVITATION's org, identity_id: caller, at})`,
     THEN `appendMessagePair(membershipDocument)` — the memberships
     DOCUMENT pair (Phase 8 Task 6, the B2 closure), beside the row
     write; the no-op and 409 branches append no document (§5.11).
  4. `states.postEvent(eventId, id, 'accepted', principal.id)`.
  5. `appendMessagePair(pair)` — both the no-op and the pending
     branches reach this step; the 409 branch never does.
- doctrinal: state guard + `put_membership` + `post_state_event` as
  `post_accept_invitation`.
- props: atomic; invitee-only; idempotent (re-accept is a no-op,
  still its own genesis pair — never a `Supersedes` chain);
  membership is written in the **invitation's** org, never the
  caller's active org; TOCTOU-safe.

### 3.24 `POST /invitations/:id/decline` — decline

`declineInvitation` (`api/invitations-domain.ts:417`).

- before tx: `loadInvitation`; assert invitee (403 otherwise);
  `formInvitationOpPair` → the pre-tx idempotency point-read.
- tx: `[states, requests, responses]`
- actual: `currentInvitationState`; `declined` → no-op,
  `appendMessagePair(pair)`, return; not `pending` → 409, appending
  nothing; else `states.postEvent(eventId, id, 'declined',
  principal.id)` → `appendMessagePair(pair)`.
- doctrinal: state guard + `post_state_event` as
  `post_decline_invitation`.
- props: atomic; invitee-only; idempotent, its own genesis pair; the
  invitation row persists as audit (no membership written).

### 3.25 `POST /invitations/:id/revocation` — revoke

`revokeInvitation` (`api/invitations-domain.ts:451`).

- before tx: `loadInvitation`; `callerIsOrgAdmin(inv.organization_id)`
  (403 otherwise); `formInvitationOpPair` → the pre-tx idempotency
  point-read.
- tx: `[states, requests, responses]`
- actual: `currentInvitationState`; `revoked` → no-op,
  `appendMessagePair(pair)`, return; not `pending` → 409, appending
  nothing; else `states.postEvent(eventId, id, 'revoked',
  principal.id)` → `appendMessagePair(pair)`.
- doctrinal: state guard + `post_state_event` as
  `post_revoke_invitation`.
- props: atomic; admin-only; idempotent, its own genesis pair; the
  invitation row persists as audit.

### 3.26 `POST /snapshots/mock-data` — seed the demo dataset

`postMockDataLoad` (`api/mock-data.ts:217`). Bearer-exempt, demo-only,
and — as a `BOOTSTRAP_ROUTES` member — below the shadow ledger
entirely: this call forms and appends no pair for ITSELF (none of
§5.1's headers appear on its own response). What it seeds, though,
includes 603 of its OWN pre-formed message pairs, one per pair-capable
seed write — see §5.3.

- **Three sequential steps, not one atomic op:**
  1. `ensureTables(TABLE_NAMES)`
  2. `transaction(TABLE_NAMES, postMockDataLoadIn)` — builds the whole
     dataset, including the 603 seed pairs, in one tx (a mid-seed
     failure leaves no half-populated schema).
  3. `seedHumanCredentials(adapter)` — its **own** tx
     `[identity_credentials]`; the PBKDF2 hashing runs outside the tx
     (async crypto cannot run inside an IDB transaction).
  4. `postSchemaCreation()` — the schema marker stamps **last**, so a
     failed seed reads as empty and retries cleanly.
- returns `SeededCredentials` — plaintext sign-ins surfaced in-band,
  once (deleted at the server tier).

### 3.27 `POST /snapshots/bootstrap` — seed the pristine minimal state

`postBootstrap` (`api/mock-data.ts:990`). Same four-step shape as
§3.26 — no pair for itself, below the ledger — with `postBootstrapIn`
planting only the shell essentials (system actor, current user, the
singleton org — no Records) and its own single pre-formed pair for
the current-user create (§5.3). Returns `SeededCredentials`.

### 3.28 `PUT /snapshots/import` — restore a snapshot (not a POST)

Included for completeness: it is the textbook gate-then-atomic write.
`putSnapshot` (`api/db-backed.ts:219`). Also a `BOOTSTRAP_ROUTES`
member — no pair for this call itself; a restored snapshot's own
`requests`/`responses` rows, if it had any, ride in with the rest of
the imported data.

- `parseAndValidateSnapshot(json)` at the **gate**, before any storage
  touch (a bad snapshot throws here, leaving prior data intact).
- `ensureTables(TABLE_NAMES)`.
- `transaction(TABLE_NAMES, 'readwrite')`: for each table, `tx.clear`
  then `tx.put` each row — clear+put as one atomic commit on
  IndexedDB.
- `postSchemaCreation()` after the commit (imported data is a schema).

A client-side quota pre-flight (`putSnapshotFromFile`,
`SnapshotTooLargeError` in `web-app/app/adapters/snapshots.ts`) gates
the file size before this route is called; that lives in the web-app
adapter, not the api layer.

### 3.29 `PUT /objectives/:id` — objective document write (not a POST)

The seventh family, and the THIRD `'stateless'` one (§5.8) —
Author gate 3's second Decision 7 amendment. `PUT` now dispatches
through `documentPutHandler(OBJECTIVES_WIRING)`, replacing the
hand-written stand-in this section used to describe (in place of
the earlier-retired `makeIdRoute` factory) — the wire is
UNCHANGED: the body stays `{ position }` (today's only caller
remains the web-app's `putObjectivePosition`, drag-reorder), never
a lifecycle trio. The trio COULD represent the objective alphabet,
but the states 911 pin forbids ever minting an objective genesis
event, so the lifecycle stays on the shared `states` log instead
(§5.8).

- tx: `[objectives, requests, responses]`
- actual: `validateObjectiveDocumentBody(body)` → `objectives.put(
  id, entity)` (the org-scoped store stamps `organization_id`, so
  the body omits it) → `appendMessagePair(pair)`.
- props: atomic; document-class (a repeat PUT records
  `Supersedes`, §5.1); `validateObjectiveDocumentBody`'s
  `assertOnlyKeys` label is `'Objective'` — matching
  `validateObjectiveEntity`'s own label byte-for-byte (a NAMED
  divergence from the `*DocumentBody` naming convention every
  other document validator uses), so the 400 body text this route
  raises is unchanged; no lifecycle event is ever posted here.

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

- tx: `[members, requests, responses]`
- actual: `validateMemberDocumentBody(body)` → `members.put(
  id, entity)` → `appendMessagePair(pair)`.
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

### 3.31 `flows/:id/versions/:vid` — RETIRED (Phase 15 Task 7)

**Route retired** with the collection (§3.16). Historical
leaf shape: DOCUMENT-class PUT/DELETE over
`flow_versions` with `appendMessagePair`. Cap-trim splices
that once lived inside the publish op are gone with the
route; the table itself remains until Phase Final.

### 3.32 `PUT /projects/:id` — project document write (not a POST)

One shape serves create, edit, and transition (Decision 7): the
body is the entity's own eight writable fields plus the
lifecycle trio (`state`, `state_at`, `state_event_id`). Genesis
is head-presence-defined — the first PUT at an id IS the birth.
`postProjectStateChange` (the adapter's transition op) now
mints a fresh trio and fires this SAME document PUT; projects
no longer ride the generic `PUT /states/:id` (§2.10) — that
route stays for every other family.

- tx: `[projects, states, requests, responses]`
- actual: read the current head event
  (`states.getCurrentFor(id)`) → `projects.put(id, entity)` (the
  org-scoped store stamps `organization_id`, so the body omits
  it) → `states.postEvent(state_event_id, id, state, memberId,
  state_at)` → `appendMessagePair(pair)`.
- doctrinal: `put_project` + `post_state_event` as
  `put_project_document`.
- props: atomic; member-tier; `validateProjectDocumentBody`;
  idempotent (a byte-identical resend converges: one row, one
  event, one pair); MEMBER_ID CAVEAT — a state-unchanged edit
  (the resent trio matches the current head byte-for-byte)
  replays the STORED head event's `member_id`, never the
  editing actor, so a different member editing a field after
  someone else's transition does not 409.

### 3.33 `PUT /records/:id` — record document write (not a POST)

One shape serves create, edit, and transition (Decision 7): the
body is the entity's own three writable fields (`name`,
`description`, `position`) plus the lifecycle trio (`state`,
`state_at`, `state_event_id`). Genesis is head-presence-defined
— the first PUT at an id IS the birth, though a record's
genesis normally arrives through the composed `POST /records`
(§3.20) instead; this PUT's genesis arm exists for a live
PUT-first flow and mirrors ideas/projects exactly rather than
special-casing records as PUT-only-for-edits.
`postRecordStateChange` (the adapter's transition op) now mints
a fresh trio and fires this SAME document PUT; records no
longer ride the generic `PUT /states/:id` (§2.10) for a
transition — that route stays for every family without its own
document PUT. `GET /records/:id` now rides the SAME wiring row
through `documentGetHandler` (Task 7, Phase 6) — the flip that
retired records' last hand-written GET; `DELETE /records/:id`
stays hand-written, unchanged.

- tx: `[records, states, requests, responses]`
- actual: read the current head event
  (`states.getCurrentFor(id)`) → `records.put(id, entity)` (the
  org-scoped store stamps `organization_id`, so the body omits
  it) → `states.postEvent(state_event_id, id, state, memberId,
  state_at)` → `appendMessagePair(pair)`.
- doctrinal: `put_record` + `post_state_event` as
  `put_record_document`.
- props: atomic; member-tier; `validateRecordDocumentBody`;
  idempotent (a byte-identical resend converges: one row, one
  event, one pair); MEMBER_ID CAVEAT — a state-unchanged edit
  (the resent trio matches the current head byte-for-byte)
  replays the STORED head event's `member_id`, never the
  editing actor, so a different member editing a field after
  someone else's transition does not 409.

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

`facadeRequest` (`api/api.ts:77`) is the sole place a request
re-enters `handleRequest`. For `/organizations/:org/:entity/...` it:

1. takes the caller's Bearer token,
2. calls `exchangeBearerForOrg` (a self-delegation token exchange; a
   non-member is 403 — the tenant fence),
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
STORED response row (`responseFromStored`), never re-serialized from
the handler's live return value, and carries three headers derived
from that same row (`wireHeadersFor`):

- **`Date`** — the row's own `at`, rendered IMF-fixdate
  (`new Date(at).toUTCString()`).
- **`Response-ID`** — the row's `id` (== the paired request's `id`).
- **`Supersedes`** — the prior response's `id`, present only when this
  write revisited a document-class address (`DOCUMENT_CLASS_ROUTE_
  PATTERNS`) that already had one; absent on a genesis pair.

Because the body is reconstructed by parsing the row's stored
canonical message, its top-level key order is whatever `canonicalJson`
chose at formation time — ASCII-sorted (`sortJsonKeys`) — which need
not match the order the handler's own object literal would have
produced. **A byte-identical resend (the idempotency fast-path, §1.1)
returns the ORIGINAL stored row verbatim**, `Date` included — it is
never re-stamped "now."

Both facts are the plan's named **wire-visible, UI-invisible** class:
a client doing raw byte/header comparison can observe them, but
nothing in this app reads response headers or depends on body key
order (`unwrapResponse` in `api/api.ts`'s client facade ignores
headers entirely, and every adapter destructures the body by field
name) — so the change is real on the wire and inert in the UI.

**The locked class is the one named exception (Task 3).** A
locked-family document GET (`flows/:id` today — §5.4, §3.13)
carries `Response-ID`, and its save path genuinely reads it:
`GETWithResponseId` (the client facade + `RequestContext`) pulls
it off the response to echo as `If-Response-ID` on the next PUT,
and the C6 retry loop branches on the PUT's own failure status
(`RequestError.status === 412`). This is still wire-visible only
in the narrow sense that no OTHER header or the body's key order
is read — the mechanism is a deliberate, documented precondition
header, not an accidental leak of transport detail into the
domain layer.

### 5.2 The redaction contract

Only the two `/authentication` routes carry live secrets, and only
their stored pair is redacted (`api/message-redaction.ts`) — every
other route's stored message is the request/response verbatim.
**Redact-always:** a PRESENT field in the redacted set is ALWAYS
transformed, regardless of its type — never a pass-through, and (bar
one case) never a throw:

- **Headers** — `authorization` and `cookie`, when present, become
  `sha256:<hex>` unconditionally.
- **Request body, high-entropy fields** — `refresh_token`,
  `subject_token`, `actor_token`, `client_assertion`, `code`: a
  string value fingerprints directly (`sha256:<hex>`); a non-string
  value fingerprints over its **canonical serialization**
  (`JSON.stringify(sortJsonKeys(value))`, with any embedded number
  beyond `2^53` carried through verbatim rather than rounded) — so
  the fingerprint stays deterministic across byte-identical resends,
  which `message_hash` and the idempotency fast-path both depend on.
- **Request body, `password`** — hashed with the SAME PBKDF2 scheme
  as a stored credential (`hashPassword`, a self-describing
  `$pbkdf2-sha256$...` string), never the faster bare `sha256:`
  fingerprint used elsewhere — a string value hashes directly, a
  non-string value hashes over its canonical serialization.
- **Response body, high-entropy fields** — `access_token`,
  `refresh_token`, `code`: fingerprinted exactly like the
  request-side fields above.
- **The one throw** — a body that fails to parse as JSON on a
  redacted route raises `HttpMessageError`: a structurally malformed
  message is never silently passed through with a live secret still
  inside it. A bodyless message, or a body that decodes to something
  other than a plain object, passes through unchanged (redaction
  never invents or reshapes fields).

### 5.3 Seed pair formation (below the gate)

`POST /snapshots/mock-data` and `POST /snapshots/bootstrap` are
`BOOTSTRAP_ROUTES` — bearer-exempt and below the ledger for their OWN
request (§3.26–§3.28). What they seed, though, is itself the output of
FIFTEEN pair-capable write families, in dependency order:
`human-members`, `ideas`, `idea-submissions`, `projects`, `flows`,
`work-orders`, `flow-work-orders`, `ai-members`, `records`,
`objectives`, `memberships`, `members`, `identities`,
`identity-credentials`, and `role-grants` (the last three, Phase 10
Task 6, §5.15), PLUS the historical-trace carve-out's own bare
`states` / `state_field_values` writes (Phase 11 Task 3, §5.16) AND
the `identity_default_organizations` family's own bare writes
(Phase 11 Task 8, §5.17) — no dedicated op wraps either of these
two, so they stand outside the FIFTEEN
(`buildMockDataInvocations`, `api/mock-data/seed-message-pairs.ts`),
so the seed forms each family's pair the SAME way a live request
would, then writes it alongside the seeded row:

- The mock-data seed pre-forms **1511** message pairs — one pair per seeded
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
  PLUS every seeded role grant folds in its OWN `role-grants/:id`
  document pair (12 more — the 2 admin grants for `current` plus
  one member grant per non-admin human), PLUS every work-order
  historical trace event forms its OWN `states/:id` pair (860 —
  211 hand-authored + 649 generated, Phase 11 Task 3, §5.16: no
  dedicated op wraps it, a bare `adapter.states.put` untouched
  beside its own new pair), PLUS every seeded `state_field_value`
  forms its OWN nested `states/:id/field-values/:fvid` pair (7
  more, same §5.16), PLUS the system member's OWN genesis event
  forms its OWN pair (1 more, same §5.16 — bootstrap's own mirror
  event is counted in the bootstrap count below, never here), PLUS
  every seeded human member's OWN default-org event forms its OWN
  identity-keyed `identities/:id/default-org/` pair (11 more, Phase
  11 Task 8, §5.17: no dedicated op wraps it either, a bare
  `adapter.identityDefaultOrganizations.put` untouched beside its
  own new pair) —
  in a first pass, BEFORE the
  seed's own big transaction opens (`formWritePair`'s hashing is async
  crypto, which would auto-commit an IndexedDB transaction early if awaited
  inside one); a second pass then writes the seeded rows and appends each
  pre-formed pair in the SAME transaction the row lands in. The bootstrap
  seed forms exactly thirteen such pairs (the SAME member-family bundle —
  now a quadruple, Phase 10 Task 5 — its
  OWN membership and system-member document pairs, its own
  `identities/:id/pii` document pair, PLUS Phase 10 Task 6's OWN
  system-identity document pair, role-grant pair, and the two
  credential pairs — current's password + the system client
  secret, PLUS Phase 11 Task 3's OWN system-member genesis-event
  pair (§5.16), PLUS Phase 11 Task 8's OWN default-org event pair
  (§5.17)), for its lone `current` human-member create.
- Memberships closed the LAST whole-slice seed deferral (Phase 8 Task
  5): every seeded membership row and the system member's own
  `members/:id` document now form a message pair too, closed through
  `postMembershipDocumentOp` / `postMemberDocumentOp`. NO whole-slice
  seed deferral remains; the work-order historical traces (states
  events + state_field_values) stayed the one NAMED direct-write
  carve-out, bound to the states-consumers flip, not "the work-orders
  phase" (§5.6) — until Phase 11 Task 3 (§5.16) closed it: every
  trace event and field value now ALSO forms its own message pair,
  Path A (the states / state_field_values ROWS themselves stay the
  SAME direct writes mock-data.ts already made).
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

Every document-class PUT belongs to one of two concurrency
classes, declared per family in `api/family-registry.ts`
(`ConcurrencyClass`: `'simple' | 'locked'`) and dispatched
through `api/document-family.ts`'s generic `documentPutHandler`.
The gate (`handleRequest`) keys the class off the route's
`documentFamilyWiring` entry ANDed with its family registration
— NEVER a blanket `DOCUMENT_CLASS_ROUTE_PATTERNS` read — so a
family can register `'locked'` (family-registry.ts) with no live
route riding the arm until its OWN wiring row lands.

- **`simple`** (`ideas`, `projects`, `work-orders` — §5.6;
  `objectives` — §5.8): the existing head-read → `Supersedes`
  chain (§5.1) — a repeat PUT ALWAYS succeeds and ALWAYS
  supersedes the current head.
- **`locked`** (`flows`, live since Task 3 — §3.13): a repeat PUT
  must ECHO the current head via the request header
  `If-Response-ID`, or 412s.

**The request header.** `If-Response-ID` joins the hoisted,
hash-covered header set (`HOISTED_HEADER_NAMES`) — a different
echo is a different request, so a byte-identical resend (the
SAME echo) still hits the idempotency fast-path FIRST; a stale
echo on an otherwise-identical body is a NEW request, evaluated
against the four outcomes below.

**The four outcomes**, checked ONLY after the replay fast-path
MISSES (ordering is load-bearing: a byte-identical resend of an
already-succeeded locked write carries its original, now-stale
echo and MUST replay, never 412):

- head present, echo absent → 412.
- echo present, echo ≠ head → 412 (head absent counts as "≠",
  since no head can ever match a claimed one).
- echo present, echo == head → 200, response carries
  `Follows: <head>`.
- head absent, echo absent → 200, genesis — NEITHER header.

**`Follows`** is the locked class's response header
(`wireHeadersFor`), rendered from the stored row exactly like
`Supersedes`. Like `Supersedes`, it is PROVENANCE ONLY —
derivation never walks either chain to decide which pair is
current (`derive-documents.ts`'s (at, id) reduction alone
decides that). The two headers are mutually exclusive per
response: a locked write's carries `Follows` and never
`Supersedes`; a simple write's carries `Supersedes` and never
`Follows`.

**The atomic backstop.** Two writers racing the SAME echo both
pass the pre-check (both observe the same, not-yet-superseded
head) — the UNIQUE index on `responses.follows` closes the
race: the first commits, the second's `appendMessagePair` raises
`UniqueConstraintError`, mapped to 412 by the SAME
`handleRequest` catch that maps every other unique violation. No
pair is stored for a 412 — the tx aborted or never opened.

**Status today:** the locked arm was built and tested against a
synthetic registration in Task 2 (`tests/document-family.
test.ts`); Task 3 registers `flows`' own `DocumentFamilyWiring`
row and moves `PUT /flows/:id` onto it (`documentPutHandler`) —
the first LIVE route riding the arm (§3.13). `flows/:id`'s `GET`
rides the SAME generic `documentGetHandler` (§5.5, Task 8) —
its response additionally carries the `Response-ID` header
(§3.13).

### 5.5 ideas/projects/flows: generic components

`ideas/:id`, `ideas` (collection), `projects/:id`, `projects`
(collection), `flows/:id`, and `flows` (collection) — plus
their `WRITE_RESPONSE_SPECS` entries — dispatch through
`api/document-family.ts`'s generic `documentEntityRoute`/
`documentCollectionRoute`/`documentWriteResponseSpec`, driven
by a per-family `DocumentFamilyWiring` (a lifecycle class, a
not-found table, a validator, a decompose op, and an entity
mapper — §5.6) rather than hand-written route objects. For
`ideas`/`projects` (`simple` concurrency, §5.4) the wire is
byte-identical to the routes it replaces. `flows` rides the
SAME generic dispatch as `locked` concurrency (§5.4) — its
document PUT alone carries the `If-Response-ID`/
`Follows` four-outcome machinery the other two families never
need; `flows` also keeps its own hand-written `POST /flows`
(create, §3.12) and `POST /flows/:id/undo` (§3.14) outside this
generic dispatch. The untouched existing suite plus
`tests/document-family.test.ts`'s successBody and dispatch pins
are the absorption's proof.

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
  (§3.17), `POST /work-orders/:id/claim` (§3.18), `POST
  /work-orders/:id/transition` (§3.19), and the `states/:id`
  unclaim path — never by a document PUT — so
  `validateWorkOrderDocumentBody` 400s a body carrying any trio
  key (the stateless covenant is validator-enforced, not caller
  discipline), and the generic GET-side lifecycle walk is
  skipped entirely for a `'stateless'` wiring (its only
  tombstone signal is a DELETE-method head, already absent via
  `deriveDocumentsAt` — the SAME reduction every family shares).
- **`notFoundTable`: the identifier the wire 404 body speaks**
  (`EntityNotFoundError`'s table, rendered `Not found:
  <table>/<id>`). Family name for ideas/projects/flows;
  `'work_orders'` for work-orders — the FIRST family whose
  storage table name (the `EntityStore` key in `db-backed.ts`)
  differs from its family name (`work-orders`, the URI segment).

**PUT /work-orders/:id** now dispatches through
`documentPutHandler(WORK_ORDERS_WIRING)` — the SAME `'simple'`
concurrency class ideas/projects ride (§5.4) — and
`WRITE_RESPONSE_SPECS['work-orders/:id']` is
`documentWriteResponseSpec(WORK_ORDERS_WIRING)`. **GET /work-orders/:id**
rides the SAME wiring row through `documentGetHandler` (Task 7, Phase 5) —
the flip that retired the last hand-written document-family route object;
`entityOf` is now a live reader for both verbs, not merely future-proofing.

**The wire is unchanged.** The response's `{id, organization_id,
display_id, flow_graph, position}` keys and the 404 body
(`Not found: work_orders/<id>`) are byte-identical to the prior
hand-written route — the untouched existing suite (including
`tests/api-work-orders-create.test.ts`) plus
`tests/api-work-order-document.test.ts`'s below-gate op pin and
byte-identical-resend case are the absorption's proof;
`tests/api-work-orders-verb-gaps.test.ts` additionally pins
every deliberate verb gap the family still carries (PUT/DELETE
`work-orders`; POST/DELETE `work-orders/:id`; every verb on
`/claim` and `/transition` but their own POST; POST/PUT/DELETE
`flows/:id/work-orders`; GET/POST `flows/:id/work-orders/:woid`
— its DELETE already pinned in `api-flows-verb-gaps.test.ts`).

### 5.7 The fifth family: records and the DELETE-pair filter

Task 2 (Phase 6) registers `records` as the fifth
`DocumentFamilyWiring` row (`RECORDS_WIRING`, beside
ideas/projects/flows/work-orders in `api/routes.ts`). `records`
is `'trio'` — Decision 7's election as amended: a family is
`'trio'` when its lifecycle fits the trio (a single current
state, authored once per transition, folded into the SAME
document PUT that edits its entity fields) rather than
`'stateless'` (a lifecycle written by its own dedicated ops,
never a document PUT) — records' active/archived/deleted
lifecycle fits the trio exactly as ideas/projects/flows' does,
so the amendment stays narrow: it elects records into the
EXISTING `'trio'` class rather than widening the class itself.

`records` is also the FIRST family whose `:id` address carries
a live `DELETE` route alongside a `'trio'` PUT.
`documentLifecycleEvents` (`api/derive-documents.ts`) walked
every 2xx PUT/DELETE pair at a document address and
`pickString`-threw on a DELETE pair's body — always EMPTY
(design decision 6: DELETE tombstones a document, it carries no
wire fields) — since no `'trio'` family before records ever had
a live DELETE at its own document address for the throw to
reach. Author gate 9's fix: the walk now SKIPS a DELETE-method
pair entirely, so a delete-then-recreate history (`PUT`,
`DELETE`, `PUT`) yields the two PUT trios rather than crashing —
behavior-preserving for ideas/projects/flows (none has a DELETE
at its own document address). At the time of this fix, `GET
/records/:id` and `GET /records` were still hand-written,
old-plane (`RECORDS_WIRING`'s `entityOf` unreached until Task 7
flipped them), so the fix was proven directly against
fabricated pairs (`tests/api-record-document.test.ts`), not
through a live route. `GET` now rides the SAME generic document
machinery `PUT` does — both the list (`GET /records`, via
`documentCollectionGetHandler`) and the entity read (`GET
/records/:id`, via `documentGetHandler`) derive from the
message ledger (Task 7, Phase 6), not a hand-written dispatch.

**PUT /records/:id** now dispatches through
`documentPutHandler(RECORDS_WIRING)` — the SAME `'simple'`
concurrency class ideas/projects/work-orders ride (§5.4) — and
`WRITE_RESPONSE_SPECS['records/:id']` is
`documentWriteResponseSpec(RECORDS_WIRING)`.

**The wire is unchanged except the named trio delta.** The
response's `{id, organization_id, name, description, position}`
keys are byte-identical to the prior hand-written route — the
entity/trio separation in `RecordDocumentBody` guarantees it.
The three named wire deltas: (1) the PUT request body now
carries the trio; (2) `putRecord`/`postRecordStateChange`
(`web-app/app/adapters/records.ts`) speak the trio in
camelCase, translating to snake_case at the wire seam; (3) the
records list's drag-reorder and the detail page's no-attribute-
change save each echo the trio from data already loaded (the
list model's `RecordModel` accessors; `currentView.record`) —
zero new hops. `tests/api-record-document.test.ts` (the
below-gate op/validator/DELETE-filter pins) plus the untouched
existing suite (byte-identical GET/DELETE, the deleted-
exclusion test, `postRecordStateChange`'s states-log assertions)
are the fold's proof.

### 5.8 The seventh family: objectives and Author gate 3's second amendment

Task 2 (Phase 7) registers `objectives` as the seventh
`DocumentFamilyWiring` row (`OBJECTIVES_WIRING`, beside
ideas/projects/flows/work-orders/records/record-attributes in
`api/routes.ts`) — the SECOND named partial amendment to
Decision 7 (Author gate 3).

Decision 7 as amended at Phase 5 (§5.6) scopes `'stateless'` to
lifecycles "a single trio cannot represent without loss" — the
work-orders fork. Objectives are a DIFFERENT fork: the trio
COULD represent the objective alphabet, but is FORBIDDEN three
ways — the wire body would have to grow it (the unavoidable
zero-delta violation); a minted genesis event would abort the
states 911 pin at reseed (the genesis dilemma); and
absence-as-active is R2's named covenant. The amendment extends
`'stateless'` to a SECOND, distinct fork: absence-as-active
families whose lifecycle rides the SHARED `states` log — the
document body carries entity fields only, lifecycle events keep
riding the generic `states` plane (already pair-wired), and the
family's derived reads perform no lifecycle walk. THREE distinct
`'stateless'` rationales now exist — work-orders' vacuous-in-
practice (§5.6: its lifecycle CAN be authored, just never
through the document address), record-attributes' vacuous-by-
construction (no lifecycle concept exists at all), and
objectives' forbidden-three-ways above — a third distinct
rationale is the named trigger for a type-level fork
(Commandment IX): the next family author reads Decision 7 as
TWICE amended, not as negotiable.

- **`notFoundTable` is `'objectives'`** — its storage table name
  matches its family name, like ideas/projects/flows/records
  (work-orders/record-attributes are the two families whose
  names diverge).
- **Consequence named:** `GET /objectives` INCLUDES archived
  objectives on both planes — the deliberate CONTRAST to
  records' deleted-exclusion (§5.7); nothing in the objective
  alphabet can produce a `'deleted'` state, so no derived read
  ever needs to filter one out.

**PUT /objectives/:id** now dispatches through
`documentPutHandler(OBJECTIVES_WIRING)` — the SAME `'simple'`
concurrency class ideas/projects/work-orders/records ride
(§5.4) — and `WRITE_RESPONSE_SPECS['objectives/:id']` is
`documentWriteResponseSpec(OBJECTIVES_WIRING)`. **GET
/objectives/:id now DERIVES from the ledger** through the
generic `documentEntityRoute(OBJECTIVES_WIRING)` (flipped at the
read-flip task; see §3.29) — `entityOf` is the LIVE reader, and
it constructs the wire row ID FIRST
(`{id, organization_id, position}`), the SAME seven-sibling
convention every shipped `entityOf` follows.

**The wire covenant, precisely scoped.** ZERO deltas in request
shapes, response key sets + values, statuses, headers, and hop
counts. The response's `{id, organization_id, position}` keys
and values are byte-identical to the prior hand-written route —
`validateObjectiveDocumentBody`'s entity/organization_id
separation guarantees it, and PUT responses are order-blind BY
CONSTRUCTION (the canonical `sortJsonKeys` pipeline), so key
order was never part of the covenant for a write. The stray-key
400 body stays byte-identical (`unexpected key "..." for
Objective` — the label mandate, §3.29); the missing-position 400
is the SAME `assertOnlyKeys` call, so it too is unchanged. The
ONE named sub-cosmetic exception this whole phase carries — a
flipped GET's JSON key order moving id-last → id-first (the
seven-sibling `entityOf` convention, verified at `f81e2c33`) —
fires for the flipped objectives GETs: `objectiveDocumentEntityOf`
serializes id-first, JSON-semantically and client-invisible
(consumers destructure by key; deepEqual gates are order-blind),
the same class every prior flip shipped.

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
ideas/projects/flows/work-orders/records/record-attributes/
objectives in `api/routes.ts`) — the FOURTH `'stateless'`
family, with yet another distinct rationale from the other
three. Work-orders' `'stateless'` is vacuous-in-practice (its
lifecycle CAN be authored, just never through the document
address, §5.6); objectives' rides the `states` log's own
absence-as-active covenant (§5.8); memberships carries NO
lifecycle concept WHATSOEVER — a pure join relation (Codd's own
teaching: the identities of the joined, plus the moment of
union) — joining record-attributes' vacuous-BY-CONSTRUCTION
bucket as its actual sibling, not standing alone against
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
- **GET stays hand-written, old-plane, until Task 8.** Unlike
  objectives (§5.8, whose `GET` flipped in the SAME phase it
  registered), `memberships/:id`'s `get` arm is untouched this
  task — `MEMBERSHIPS_WIRING`'s `entityOf` exists (the contract
  requires it) but serves no live route yet.
- **DELETE stays hand-written too** — the `records/:id`
  template (§5.7): no generic DELETE component exists for any
  family.

**PUT /memberships/:id** now dispatches through
`documentPutHandler(MEMBERSHIPS_WIRING)` — the SAME `'simple'`
concurrency class every other document family but flows rides
(§5.4) — and `WRITE_RESPONSE_SPECS['memberships/:id']` is
`documentWriteResponseSpec(MEMBERSHIPS_WIRING)`.

**The wire covenant, precisely scoped.** ZERO deltas in request
shapes, response key sets + values, statuses, headers, and hop
counts. UNLIKE objectives' fence-stamped-only `{position}` body,
memberships' entity carries its OWN `organization_id` on the
wire — all three keys (`organization_id`, `identity_id`, `at`)
REQUIRED, none tolerated-but-optional; the org-scoped store
still stamps `organization_id` from the fence at write time
regardless (the same fence-stamp the store applies to every
org-owned entity), so the wire acceptance and the stored value
agree whenever a client's own organization_id is honest. THE
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
registrations of any wiring row, and the FIFTH `'stateless'`
rationale (Author gate 3, verification-corrected — still no
type-level fork). All three share ONE shared-log-WITH-genesis
bucket, distinct from every prior one: the shared member id
receives REAL `states` events (a genesis event at create,
archive/reactivate via `PUT states/:id`), so a trio-carrying
document plane here would FREEZE every member's state at
genesis forever the moment a second `states` event posted — the
decisive refutation, unlike work-orders' vacuous-in-practice
(§5.6), objectives' absence-as-active (§5.8), or record-
attributes'/memberships' vacuous-by-construction pair (§5.9).

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
mirroring `canonicalUriPrefix`'s own registration-first pattern
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
- **GET stays hand-written, old-plane, until Task 8** for all
  three — same as memberships (§5.9).

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
entry for `invitations/:id` exists or ever will. Both
synthesized pairs are storage-only today; nothing reads them
yet (Task 8 flips `invitationsForInvitee`/`sentInvitations`
onto `deriveInvitations`, `api/derive-invitations.ts`).

**Grant: 2 pairs on a fresh outcome, 1 on a duplicate echo.**
`grantInvitation` forms its existing operation pair (POST,
`/invitations/`, `uriId` = the client-minted `invitationId`) as
before; on the 'fresh' outcome ONLY it ALSO forms a PUT-shaped
invitation DOCUMENT pair at the SAME `(uriPrefix, uriId)` —
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

**Accept: the B2 closure — the third memberships writer joins
the document plane.** `acceptInvitation` forms a PUT-shaped
MEMBERSHIPS document pair pre-tx — address =
`canonicalUriPrefix(inv.organization_id, '/memberships/')`
(the INVITATION's org, never the caller's active org, mirroring
the domain write's own organization choice), `uriId` = the
caller's own `membershipId`, body `{organization_id:
inv.organization_id, identity_id: caller, at}` byte-mirroring
the row, response via `WRITE_RESPONSE_SPECS['memberships/:id']`
— the SAME spec (`documentWriteResponseSpec(MEMBERSHIPS_WIRING)`,
§5.9) a live `PUT /memberships/:id` resolves, since THIS pair
DOES have a live twin. Formed pre-tx (crypto cannot run inside
a transaction body) but appended ONLY inside the `!already`
branch, beside the `memberships.put` it mirrors: a re-accept
that finds a membership already present, or a 409 conflict,
writes no row and so appends no document either. Before this
task, memberships had exactly two document writers: the live
`PUT /memberships/:id` route and the mock-data seed (Phase 8
Task 5, `postMembershipDocumentOp`); a live accepted invitation
is the third — and, before Task 8 flips the readers, the ONLY
writer whose row a derived (not old-plane) membership read
would otherwise miss entirely, since the accepted membership
was never seeded and never PUT directly.

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
`uri_prefix` has the shape `/invitations/<id>/<op>/`" for an
arbitrary id, so this ONE reduction reads `db.requests.getAll()`
in full, regardless of invitation count; its measured cost is
recorded at the Task 9 CLI leg, not here. Mutual exclusivity of
the three terminal states is the domain gate's OWN covenant
(accept/decline/revoke each require 'pending' to succeed; a
409 conflict appends nothing), never re-derived in this
module — an id accumulates repeat pairs of only ONE op kind.
Reads `db.requests`/`db.responses` ONLY; nothing routes to it
yet (revertible in isolation).

**The gate-resolve settlement needs zero code change.** Today's
grant already resolves the invitee's `email` to `identity_id`
at the HTTP gate (the `identityPii.getAll` find, before either
pair forms) and stores only the reference — so the document
body's email-free shape is not a NEW redaction this task adds;
it is what the gate already produced, now simply persisted.
A reader expecting a diff here finds none.

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
already ran inside `['identity_pii', 'requests', 'responses']`
before this task; the zone rides that SAME transaction, never a
second one (Commandment X — wrap the indivisible in the
platform's existing primitive).

**The single-slot register.** Every write at the address —
PUT or DELETE — enumerates whatever pair(s) currently occupy it
by ONE scan (`requests.getAllWhere('uri_prefix', ...)`), deletes
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
wire delta this task ships — GET behavior is unchanged (reads
stay old-plane until Task 8) and every PUT/DELETE status and
body is unchanged.

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
leaves zero PII bytes anywhere `requests`/`responses` or
`identity_pii` can be scanned — proven end to end by a real
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
   carries the pre-erasure PII rows verbatim (§ Snapshots,
   §3.26-§3.28); the theorem covers live storage, not files
   already written to disk.
3. **The browser's own session credential.** The `fusion.
   session-credentials` localStorage entry carries the caller's
   own JWT, whose `name` claim is base64-decodable client-side
   for the token's lifetime (up to the 30-day refresh TTL). The
   pin does not scan localStorage — an erased member's OWN prior
   session token, if retained, still decodes to the pre-erasure
   name until it expires or is revoked.
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
`DocumentFamilyWiring` row (`IDENTITIES_WIRING` in
`api/routes.ts`) and the family-registry row it consults
(`api/family-registry.ts`): `organizationNested: false`
("global-plane"), `concurrency: 'simple'`, `createBodyIdField:
'id'`. It joins `MEMBERS_WIRING`'s shared-log-with-genesis
`'stateless'` bucket as the FOURTH member (§5.10): the shared id
(`member.id === identity.id`, always) already receives a genesis
`states` event at create and archive/reactivate via `PUT
states/:id`, so the identities document plane carries NO
lifecycle of its own — a trio here would FREEZE that lifecycle
at genesis forever. The stateless arm's ONLY tombstone signal is
a DELETE-method head, already 404-absent via `deriveDocumentsAt`
with no further walk needed (`document-family.ts`'s
`derivedDocumentEntity`) — the SAME deleted-filter escape hatch
every `'stateless'` family before it accepted.

**The slot is LIVE, not inert.** Unlike the projects/members-
family inert-`createBodyIdField` precedent, `POST /identities` IS
a live bare collection-POST create route whose pattern is
literally `'identities'` — the registry consult in
`createdEntityUriId` (`message-pair.ts`) now fires for real, the
FOURTH live-firing registered family after flows, work-orders,
and records. `'identities'` retires from `CREATE_BODY_ID_FIELDS`
(the same literal table) — the registered family answers ONLY
from its own registration now. `'invitations'` is the ONE entry
that literal table keeps PERMANENTLY: the invitations side
channel has no organization-nesting tier, no concurrency class,
and no document address of its own to register, so it is never a
family-registry waypoint, only a standing exception.

**The three extractions (own commit each, behavior-identical).**
`postIdentityDocumentOp`, `postIdentityCredentialDocumentOp`,
and `postRoleGrantDocumentOp` are lifted byte-for-byte out of
their hand-written PUT closures (`identities/:id`,
`identities/:id/credentials/:cid`, `role-grants/:id`), mirroring
the `postIdentityPiiDocumentOp` precedent (§5.12). All three are
EXPORTED — Task 6 seeds through them, and Task 7's drift-mirror
wiring imports them to compile — alongside
`validateIdentityDocumentBody`, also exported for the same
reason. Only `postIdentityDocumentOp` joins a
`DocumentFamilyWiring` row; the other two stay directly
dispatched from their own route closures, per the non-
registration rationale below.

**Why credentials and role-grants do NOT get their own
family-registry row.** `family-registry.ts` answers exactly
three axes a document-class, per-id family needs: organization-
nesting tier, PUT concurrency class, and create-address body
field. Neither plane is such a family:

- `identities/:id/credentials/:cid` is a NESTED facet of the
  identity subtree (the identity id is param 0; the credential id
  is param 1) — it has no address of its own independent of the
  identity it hangs off, so it never needs an organization-
  nesting or create-address answer separate from `identities`'
  own.
- `role-grants/:id` is an EVENT-APPEND ledger row
  (`HistoryEntityStore`, latest-wins per `(organization_id,
  identity_id, role)`) — a grant/revoke history, not a document
  address with a genesis-then-edit lifecycle a family-registry
  row exists to describe.

Both extractions leave their own `WRITE_RESPONSE_SPECS` entries
untouched: `'identities/:id/credentials/:cid'` still reconstructs
the full entity (including `secret`, a deliberate zero-change
carry-over); `'role-grants/:id'` still re-stamps
`organization_id` from the fence — the ONE org-stamped spine
spec, since `role_grants` rides the ORG-SCOPED store (unlike its
global-plane siblings) and the wire body omits the field the
scoped store auto-stamps.

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

**The verb-gap pins (finding 20), COUNT AT EXECUTION: 41
combos across three regimes**
(`tests/api-identity-spine-verb-gaps.test.ts`, own commit BEFORE
the wiring landed):

1. The route-table regime — 36 combos across the FIFTEEN
   identity-spine `route()` patterns (`identities` through
   `identity-providers/:id`): a matched pattern with no handler
   for the request's verb 405s via `handleRequest`'s own
   per-method branch.
2. The `identities/:id/default-org` side channel regime — 2
   combos: this side channel never calls `matchRoute` — a POST or
   DELETE falls through its own if-chain to ITS OWN inline 405
   terminal (`organization-requests.ts`).
3. The identity-tokens authz-tier regime — 3 combos: `GET
   /identity-tokens` is admin-only (absent from `MEMBER_VERBS`),
   so a member-tier token 403s at the authz layer BEFORE
   `matchRoute` runs; `POST /identity-tokens/:jti/rotation` and
   `.../revocation`, by contrast, DO match `MEMBER_VERBS`'
   `'/identity-tokens'` entry (POST), so a member-tier token
   clears authz and reaches the route handler's own domain terms
   (409 reuse; 204 idempotent no-op) instead of 403.

`tests/family-registry.test.ts` gains the twelfth case
(`identities`, global-plane like `members`) and swaps its
unregistered-family control exemplar from `'identities'` (now
registered) to `'organizations'` — a NAMED re-pin: organizations
stays unregistered by design (family-registry.ts answers
document-class per-id families, and `organizations/:id` rides its
own hand-written PUT with no genesis-address concept the registry
needs to describe).

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

**Contract.** The synthesized identities document is
byte-indistinguishable from a live `PUT /identities/:id` pair's
shape at the same address; old-plane rows/states are untouched
(fingerprints + the states-911 pin hold); the wire is unchanged
— the bundles are storage-only.

### 5.15 Gate-seeding the remaining spine slices: AI/system
identities, credentials, role grants (Phase 10 Task 6)

Path A throughout: the THREE ops §5.13 extracted and exported
(`postIdentityDocumentOp`, `postIdentityCredentialDocumentOp`,
`postRoleGrantDocumentOp`) + per-row invocations through the
UNTOUCHED `formSeedPair` pipeline — no logic change to
`formSeedPair` itself, only new callers. `formSeedPair` carries
no `chain` argument at all, so `headPairId` is undefined for
EVERY seed pair by construction (always-genesis); the live-path
`chain: 'none'` vocabulary (`formDocumentPairFor`, api/routes.ts)
does not apply here. Row ids/ats/content stay byte-identical —
only `EXPECTED_PAIR_COUNT` (§5.3, 603 → 632) and the bootstrap
count (7 → 11) move.

**The three slices (+29).** The 4 AI + 1 system identities' raw
`identities.put` sites re-point onto `postIdentityDocumentOp`
(+5 — a standalone invocation each, since neither the ai-members
nor the system-member write ever carried an `identityDocument`
slot the way the human-member bundle does, §5.14). The 12
credential writes in `seedHumanCredentials` re-point onto
`postIdentityCredentialDocumentOp` (+12 — 11 human passwords +
the system client secret). The 12 role-grant raw `roleGrants.put`
sites re-point onto `postRoleGrantDocumentOp` (+12 — the 2 admin
grants for `current` plus one member grant per non-admin human).
Bootstrap mirrors its own system identity, 2 credentials, and 1
role grant (+4, 7 → 11). `identity_default_organizations` STAYS
RAW — see §5.3's own boundary note; a later gate defers that
family whole.

**The tx-widening trap (a verification finding).**
`seedHumanCredentials` opened its OWN
`adapter.transaction(['identity_credentials'], ...)` — calling
`postIdentityCredentialDocumentOp` inside it would throw the
nested-subset guard (`api/db-backed.ts`'s `#assertSubset`:
`identities/:id/credentials/:cid`'s wiring transacts
`['identity_credentials', 'requests', 'responses']`, and
`'requests'`/`'responses'` are not in the outer declared set).
The fix widens `seedHumanCredentials`' own transaction to that
SAME three-table set — one fix covers both the mock-data and
bootstrap call sites, since both share this one function. Each
credential pair is PRE-FORMED from the post-hash secret BEFORE
the widened transaction opens (`formSeedCredentialPairs`,
`api/mock-data/seed-message-pairs.ts`) — a credential's body is
unknown until PBKDF2 resolves, and crypto never runs in-tx
(CLAUDE.md § the IndexedDB auto-commit constraint), so this
credential batch runs its OWN local pass-1/pass-2 split rather
than joining `formMockDataMessagePairs` / `formBootstrapMessagePair`
(both already ran, before `seedHumanCredentials` is even called).
`tests/credential-surfacing.test.ts` is the Task 2 ordering
canary — it re-ran green (12 credentials still surface).

**The org-stamp trap (a verification finding).**
`role-grants/:id`'s `successBody` re-stamps `organization_id`
from the invocation's `organization` argument (§5.3's
`documentSeedResponse`, `api/mock-data/seed-message-pairs.ts`,
threads `inv.organization` straight into it) — so each of the 12
role-grant seed invocations MUST carry its OWN grant's
`organization_id` (`STARK_ORGANIZATION`/`ORGANIZATION_TWO` per
the write body, `assignOrganization(index)` for members), never
undefined. A wrong/undefined value silently corrupts the STORED
RESPONSE body with no fingerprint pin catching it —
`requests`/`responses` are excluded tables (`tests/mock-data-
fingerprint.test.ts`). Only the spot-check below catches it.

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

**Contract.** Every fingerprint pin holds — `identities` 16/
`0c164977`, `identity_credentials` 12/`4990628d`, `role_grants`
12/`4b2311dd`, the full table (`tests/mock-data-fingerprint.
test.ts`) — because the three ops write the SAME row content the
raw puts did; only the message plane (excluded from that
fingerprint) grew. Reseed marginal cost measured ~2 ms for the
+29 pairs (order-of-magnitude consistent with the ~0.144 ms/pair
baseline; within this harness's run-to-run noise floor).

### 5.16 Gate-seeding the historical-trace carve-out (Phase 11
Task 3)

Path A throughout, the migration's most FINGERPRINT-CRITICAL
task: the 860 work-order historical trace events (211 hand-
authored + 649 generated), the 7 `state_field_values` rows, and
the system member's OWN genesis event (2 — one per seed path)
ALSO form their own message pair, beside rows that stay the SAME
direct writes mock-data.ts already made. Unlike every other
family §5.3 names, none of these three slices rides a dedicated
op — `adapter.states.put` / `adapter.stateFieldValues.put` /
`adapter.states.postEvent` stay bare, and the new pair is appended
alongside via `appendMessagePair` directly, in the SAME
transaction the row lands in. `states` 911/`679a7541`,
`state_field_values` 7/`95d00f3a`, `work_orders` 145/`b57d1e25`,
`members` 16/`0c164977` — every fingerprint pin the row-write
side of this task touches — HOLD unchanged (`tests/mock-data-
fingerprint.test.ts`, re-run, UNCHANGED file).

**The three slices (+869).** Every work-order trace event
(`buildWorkOrderStateEvents()` + `leadToCloseWorkload.stateEvents`,
860) forms its OWN `states/:id` pair — idParams `[event.id]`,
byte-identical to the id the row already carries, so the derived
plane's future ids can never drift. `requesterIdentityId` is the
EVENT'S OWN `member_id` — never `workOrderFirstEventMemberId`, the
sibling map ~30 lines away that answers a DIFFERENT question (a
work order DOCUMENT's own authorship, not one of its many trace
events). Every seeded work order is Stark (§3.17's own finding),
so every trace event nests under `STARK_ORGANIZATION`. The 7
`state_field_values` rows (`mockStateFieldValues`) each form their
OWN pair at `states/:id/field-values/:fvid` — idParams
`[stateEventId, fvId]`, matching `WRITE_RESPONSE_SPECS`'s own
`param(params, 1)` leaf-id read — authored by the PARENT event's
OWN `member_id`, looked up off the SAME trace-event map, never a
second, independently-picked author. The system member's OWN
genesis event forms its OWN pair too (2 — `memberStateEvents` in
the mock-data seed, `bootstrapSystemStateEventId` in
`formBootstrapMessagePair`'s own SEPARATE mirror for bootstrap),
organization `undefined` — the system member is the org-less
global actor, the SAME choice its `members/:id` and
`identities/:id` pairs already make.

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
ACTUALLY-WRITTEN `states` row's `member_id` for the SAME event id
and asserts they agree.

**The re-pins (`tests/mock-data-pairs.test.ts`).**
`EXPECTED_PAIR_COUNT` 632 → 1500 (+860 trace +7 field-value +1
mock-data-seed system-genesis — NOTE: NOT +2; bootstrap's OWN
system-genesis pair is counted in the bootstrap total below, a
SEPARATE seed path with its OWN test) + the breakdown prose; the
bootstrap count 11 → 12; THREE new address/body-shape spot-checks
(a trace event, a field value, the mock-data seed's OWN
system-genesis pair at the GLOBAL, non-org-nested `/states/`
address) + the member_id content spot-check above.
`tests/mock-data-fingerprint.test.ts` is UNCHANGED — re-ran green.

**Contract.** `states` 911/`679a7541`, `work_orders` 145/
`b57d1e25`, `state_field_values` 7/`95d00f3a`, `members` 16/
`0c164977` HOLD (`tests/mock-data-fingerprint.test.ts`, file
byte-unchanged) — Path A: `appendMessagePair` writes ONLY
`requests`/`responses`, proven disjoint from every row-write side
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
`requests`/`responses.getAllWhere('uri_prefix', prefix)` pair, never
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
family's own row writes STAY RAW (Path A — both seed paths' bare
`adapter.identityDefaultOrganizations.put` calls are untouched),
closing the LAST family Phase 10 Task 6 (§5.15) deferred WHOLE:
each ALSO forms its own message pair now, through a dedicated
former (`formDefaultOrganizationSeedPair`,
`api/mock-data/seed-message-pairs.ts`) that mirrors the live PUT's
`formWritePair` call byte-for-byte rather than riding the generic
`formSeedPair`/`WRITE_RESPONSE_SPECS` pipeline every other family
uses — the fabricated trailing `:eventId` segment cannot be
expressed by that pipeline's `routePattern.split('/')` convention,
the SAME reason the invitations side channel forms its own pairs
directly. 11 mock-data pairs (one per seeded human member, actor =
the member's OWN id — the route's self-authorship rule, never
`SYSTEM_MEMBER_ID`) + bootstrap's OWN mirror pair (actor =
`'current'`) — `EXPECTED_PAIR_COUNT` 1500 → 1511; the bootstrap
count 12 → 13.

**The re-pins (`tests/mock-data-pairs.test.ts`).**
`EXPECTED_PAIR_COUNT` 1500 → 1511 (+11) + the breakdown prose; the
bootstrap count 12 → 13 + a new assertion for its default-org pair
address; ONE new address/body-shape spot-check (a seeded default-
org pair's identity-keyed address, its body carrying the three
`{organization_id, eventId, at}` keys).
`tests/mock-data-fingerprint.test.ts` is UNCHANGED — re-ran green;
`identity_default_organizations` 11/`ab3efde4` HOLDS, along with
every other pin.

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
(`tests/mock-data-fingerprint.test.ts`, file byte-unchanged) — Path
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
Industries, Wayne Enterprises) form their OWN `organizations/:id`
document pair beside the SAME direct
`adapter.organizations.put` row write — Path A, the row itself
untouched. `EXPECTED_PAIR_COUNT` 1511 → 1513 (+2); the bootstrap
count 13 → 14 (+1, its own lone Stark row).
`tests/mock-data-fingerprint.test.ts`'s `organizations` pin —
2/`e13d8f06` — HOLDS byte-identical: Path A, the pair write
touches only `requests`/`responses`, disjoint from the row-write
side.

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
`organizations` row store is fully intact — every write above
is STILL Path A, dual-writing the row beside its pair. `PUT
/organizations/:id` is untouched, hand-written.
`callerOrganizationIds`'s membership filter and
`derive-states.ts`'s ALL-orgs shape were both UNCHANGED — this
task flips the row SOURCE only, never a fence or a filter.
`callerOrganizationIds`'s OWN row source flips later, at Phase
13 Task 3 (§2.11) — its membership FILTER (caller-only, never
ALL-orgs) stays exactly as this task left it.

### 5.19 Phase 15 route retirements and seed-address survival

Phase 15 Task 7 retired four zero-caller route families
(wire delta 1). The router 404s every retired address except
bare `GET /states/:id`, which is **405** because
`PUT /states/:id` still matches that pattern. Product
callers were already zero; the only surviving live surfaces
from those families are:

- `PUT /states/:id` (unclaim / ownership write fence /
  pair-plane immutability)
- `GET /entity-states/:id/history` (derived)
- `GET /states/:id/field-values` (derived collection)

`flow_versions` routes and table are GONE (Phase 15
retired routes; Phase Final deleted the table).

**Seed constraint (finding 7).** The
`WRITE_RESPONSE_SPECS['states/:id/field-values/:fvid']`
entry SURVIVES the leaf-route retirement: reseeds still form
the seven nested leaf pairs at that address (§5.16). Pair-
plane derivation of the collection does not require the
write route to live — historical leaf pairs remain
addressable. `flows/:id/versions*` specs and handlers are
gone with the routes.

**§5 chronological gap (named) — DEFERRED.** Tasks 1–6 of
Phase 14, the Phase 15 re-anchors, and the Phase Final
deletion as-built live in ARCHITECTURE.md § Write-path
derives / § Last readers → Phase Final as-built rather than
as further §5.N narrative chapters here. A single
chronological §5 voice is optional prose work, not a
contract gate — elected DEFER at Phase Final Task 7.

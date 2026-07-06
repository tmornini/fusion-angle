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

- `GET /identities` · `GET|PUT /identities/:id` — primitive.
- `POST /identities` — operation (§3.5). Admin-only.
- `GET|PUT|DELETE /identities/:id/pii` — facet. Self-only read;
  self-or-admin write.
- `GET /identity-pii` — admin PII roster.
- `GET /identities/:id/credentials` ·
  `GET|PUT /identities/:id/credentials/:cid` — nested; the opaque
  `secret` is projected out on every read. Admin-only.

### 2.3 Auth spine — tokens, providers, grants

- `GET /identity-tokens` · `GET|PUT /identity-tokens/:id` — primitive.
- `POST /identity-tokens/:jti/rotation` — operation (§3.6).
- `POST /identity-tokens/:jti/revocation` — operation (§3.7).
- `GET|PUT /identity-token-revocations/:id` — primitive.
- `GET /identity-providers` · `GET|PUT /identity-providers/:id` —
  primitive.
- `GET /role-grants` · `GET|PUT /role-grants/:id` — primitive.
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
  folds into a `POST /flows/:id/versions` (§3.16) plus the
  locked `PUT` above (§3.13); the route leaves the URI tree
  entirely, so a request against it now 404s (no pattern
  match) — never a 405 method-absent gap.
- `GET /flows/:id/versions` · `POST /flows/:id/versions` (§3.16) ·
  `GET|PUT|DELETE /flows/:id/versions/:vid` — nested (§3.31).
- `GET /flows/:id/work-orders` ·
  `PUT /flows/:id/work-orders/:woid` — nested.
- `GET /flows/:id/records` ·
  `GET|PUT|DELETE /flows/:id/records/:frid` — nested.

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

### 2.10 States — the append-only event log

- `GET /states` · `GET /states/:id` — primitive.
- `PUT /states/:id` — append/stamp a state event; the author is the
  verified caller, stamped over any client-supplied `member_id`.
- `GET /entity-states/:id` — the current (latest) state for an entity.
- `GET /entity-states/:id/history` — the full event history for an
  entity. Both are parent-ownership gated (a foreign org's entity
  404s).
- `GET /states/:id/field-values` ·
  `PUT|DELETE /states/:id/field-values/:fvid` — nested.

### 2.11 Organizations & memberships

- `GET /organizations` — the caller's reachable orgs (identity-scoped;
  runs above the admin gate so a roleless member can boot).
- `GET|PUT /organizations/:id` — primitive (global passthrough; reads
  fence to the caller's memberships).
- `GET /memberships` · `GET|PUT|DELETE /memberships/:id` —
  primitive. `PUT` is a document write (§5.9) — the eighth
  family, and the FOURTH `'stateless'` one (§5.9): a pure join
  relation with no lifecycle concept at all — record-attributes'
  actual sibling, not work-orders'/objectives' own distinct
  rationale. `GET` and `DELETE` stay hand-written, old-plane,
  until Task 8.
- `GET|PUT /identities/:id/default-org` — the read/write face of the
  default-org ledger. Self-only.

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
- `DELETE /snapshots/schema` — drop the schema and reopen clean.
- `POST /snapshots/mock-data` — seed the full demo dataset (§3.26).
- `POST /snapshots/bootstrap` — seed the pristine minimal state
  (§3.27).
- `PUT /snapshots/import` — validate then atomically restore a snapshot
  (§3.28).

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

`postHumanMemberCreationOp` (`api/routes.ts`).

- tx: `[members, identities, identity_pii, human_members, states,
  requests, responses]`
- actual:
  1. `members.put(id, {type:'human'})`
  2. `identities.put(id, {kind:'person'})`
  3. `identityPii.put(id, pii)`
  4. `humanMembers.put(id, detail)`
  5. `states.postEvent(initialStateEventId, id, initialState, actor)`
  6. three `appendMessagePair` calls — operation, member document,
     detail document (the bundle, below)
- doctrinal: four `put_*` primitives + `post_state_event` as
  `post_create_human_member`.
- props: atomic; admin-only; `validateHumanMemberCreateBody`.

### 3.4 `POST /human-members/:id` — edit human member

`postHumanMemberEditOp` (`api/routes.ts`) — the postAiMemberEditOp
precedent above, for the sibling facet.

- tx: `[members, identities, identity_pii, human_members, requests,
  responses]`
- actual: the four facet `put`s (member, identity, pii, detail), then
  three `appendMessagePair` calls — operation, member document,
  detail document (the bundle, below).
- doctrinal: four `put_*` primitives as `post_edit_human_member`.
- props: atomic; **no state event**; admin-only;
  `validateHumanMemberEditBody`.

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

The shared BODY builders (`memberDocumentBodyOf`,
`aiMemberDetailBodyOf`, `humanMemberDetailBodyOf`) feed
`formDocumentPairFor` (`api/routes.ts`), the shared pair-FORMER
the four routes above now call directly (Phase 9 Task 2 retired
their own route-inline formation). The seed's own invocation
construction (`api/mock-data/seed-message-pairs.ts`) still forms
its pairs independently — a different pipeline by design, with no
dispatched route to resolve a fence organization or response spec
from.

All three pairs share ONE `requestAt` yet strictly-later response
`at` stamps, so each address's LAST-appended pair becomes its
head: the member document is `members/:id`'s first-ever pair on a
member's first write and its new (superseding) head on every
later write; the detail document shares the operation pair's own
address and becomes THAT address's new head, appended after it. A
mid-write failure (an invalid AI model id or a malformed human
`strengths` JSON string, caught by the pre-tx document-body check
or by the op's own re-validating store put) leaves zero of the
three, exactly like every other atomic write in this catalog.

**The PII facet is NEVER synthesized.** `identity_pii` stays
old-plane on BOTH the human create and edit — its own document
address awaits the identity spine (a forward-pointer commented at
both `postHumanMemberCreationOp` and `postHumanMemberEditOp`,
`api/routes.ts`).

**The member-document fold (the E6 note, made concrete).** A
member's `type` is a server-pinned fact that never changes across
an edit, so `memberDocumentBodyOf`'s body — `{type}` — is
byte-identical, at the SAME address, on every write to the SAME
member from its genesis onward. `appendMessagePair`'s global
by-hash fold therefore skips the member-document pair on every
edit following the first write to that member — a genuinely
PERMANENT fold, not a fixture accident: the address needs no
second write since its one field never varies. The detail
document and the operation pair carry the write's actual changes,
so they fold only when a caller resends byte-identical field
values (the general E6 hazard every bundle shares).

`tests/api-shadow-ledger-members-identities.test.ts`'s create and
composed-edit cases (balance re-pinned 1 → 3 per write, address
and key-set assertions for both synthesized documents, and a
failed-create/failed-edit-appends-nothing pair for both families)
are the bundle's proof; `tests/mock-data-pairs.test.ts`'s
`EXPECTED_PAIR_COUNT` (§5.3) and its member-document/
detail-document address spot-checks extend the SAME proof to the
seed.

### 3.5 `POST /identities` — create identity

- tx (branches by kind):
  - person → `[identities, identity_pii, requests, responses]`
  - service → `[identities, identity_credentials, requests,
    responses]`
- actual: `identities.put(id, {kind})`; then person →
  `identityPii.put(id, pii)`; service →
  `identityCredentials.put(credId, fields)`; then
  `appendMessagePair(pair)`.
- doctrinal: `put_identity` + (`put_identity_pii` |
  `put_identity_credential`) as `post_create_identity`.
- props: atomic; **no state event** (an identity has no creation
  lifecycle event); admin-only; secret hashed client-side (the route
  touches no crypto); `validateIdentityCreateBody`.

### 3.6 `POST /identity-tokens/:jti/rotation` — rotate refresh jti

Delegates to `rotateRefreshJti` (`api/authentication.ts:276`).

- tx: `[identity_tokens, requests, responses]`
- actual:
  1. `identityTokens.getAllWhere('jti', presented)`
  2. `chainIdForJti(...)`
  3. `identityTokens.getAllWhere('chain_id', chainId)`
  4. `planRotation(...)` (pure)
  5. rotate → `appendEvents` (successor jti) →
     `appendMessagePair(pair)`; replay/reuse → `appendEvents` (revoke
     the whole chain), no pair append.
- doctrinal: read the token ledger + `post_token_event`(s) as
  `post_rotate_refresh_token`.
- props: atomic; TOCTOU-safe (read + plan + append in one tx, so two
  concurrent rotations cannot both rotate); live jti → `{jti}`,
  reuse/unknown → 409; replay-exempt (§5.1) — a byte-identical resend
  re-enters this function rather than replaying a cached response.

### 3.7 `POST /identity-tokens/:jti/revocation` — revoke chain

Delegates to `revokeTokenChain` (`api/authentication.ts:320`).

- tx: `[identity_tokens, requests, responses]`
- actual: `getAllWhere('jti')` → `chainIdForJti` / `identityForJti` →
  `getAllWhere('chain_id')` → `appendEvents(revocationAppends(...))`
  (a `revoked` event per jti in the chain) →
  `appendMessagePair(pair)` (both the known-chain and unknown-jti
  no-op exits append their pair).
- doctrinal: read chain + `post_token_event`(s) as
  `post_revoke_token_chain` (log out one session).
- props: atomic; idempotent no-op for an unknown jti — the pair still
  appends, that request's only write.

### 3.8 `POST /authentication/token` — grant dispatch

`postToken` (`api/authentication.ts:598`) dispatches on `grant_type`.
Every grant is **grant-first**: it authenticates the presented grant
before any side effect, so a failed grant appends nothing and mints
nothing. `mintPair` is pure crypto (no DB). Every SUCCESSFUL grant
also forms its own message pair pre-tx (`formAuthPair`, from the
`AuthPairSeed` the dedicated arm seeds in `api/api.ts`) and appends
it as the tx's LAST row op — see §5.1 for the headers this produces
and §5.2 for the redaction the stored pair carries.

- **`authorization_code`** → `grantAuthorizationCode`:
  - tx `[authorization_codes, identity_tokens, requests, responses]`:
    `authorizationCodes.getAllWhere('code')` → `codeState` (must be
    `issued`) → `authorizationCodes.put(consumed)` →
    `recordIssuedRoot` (`identityTokens.put(issued)`) →
    `appendMessagePair(pair)`.
  - then (outside tx): `nameFor` (`identityPii.getById`) →
    `subjectOrgs` (`memberships.getAllWhere`) → `mintPair` →
    `formAuthPair`.
  - props: the consume + chain-root issue + pair append are atomic
    (no double-spend on replay); a used/unknown code → 401, appending
    nothing.
- **`refresh`** → `grantRefresh`:
  - `verifyAccessToken` (crypto) → `tokenRevocationReason`
    (`identityTokenRevocations.getAllWhere` +
    `identityTokens.getAllWhere`) → `nameFor` → `subjectOrgs` →
    `mintPair` → `formAuthPair` → `rotateRefreshJti` (the §3.6 tx,
    passed the pre-formed pair; it appends the pair ONLY on the
    'rotate' branch).
  - props: rotation + pair append are atomic; reuse revokes the
    chain then 401, discarding the pre-formed pair unstored;
    replay-exempt (§5.1) so a resent reuse genuinely re-fails rather
    than replaying a cached 200.
- **`token-exchange`** → `grantTokenExchange` (RFC 8693,
  self-delegation only):
  - `verifyAccessToken`×2 → `tokenRevocationReason`×2 → assert
    subject == actor → optional `subjectOrgs` membership check →
    `nameFor` → `issueTokenPair`.
  - `issueTokenPair` = `mintPair` + `formAuthPair` (both pre-tx),
    then tx `[identity_tokens, requests, responses]`:
    `recordIssuedRoot` (a single put) → `appendMessagePair(pair)`.
  - props: the issue + pair append ride ONE minimal transaction — a
    mid-write fault can never leave an issued chain root with no
    matching ledger pair. Cross-party exchange → 403, appending
    nothing.
- **`client_credentials`** → `grantClientCredentials`
  (private_key_jwt):
  - `clients.getById` → status/grant-type checks →
    `verifyClientAssertion` (JWS, crypto) → `nameFor` →
    `issueTokenPair` (as above, same tx shape).
  - props: the same atomic single-tx shape as token-exchange. Bad
    assertion → 401, appending nothing.

### 3.9 `POST /authentication/authorize` — interactive front door

`postAuthorize` (`api/authentication.ts:736`) dispatches on `method`.

- **`password`** → `authorizePassword`:
  - `identityPii.getAllWhere('email')` → `identityByEmail` →
    `identityCredentials.getAllWhere('identity_id')` →
    `currentPasswordSecret` → `verifyPassword` (PBKDF2) → on success
    `formAuthPair` (pre-tx) → tx `[authorization_codes, requests,
    responses]`: `authorizationCodes.put(issued)` →
    `appendMessagePair(pair)`.
  - doctrinal: verify credentials, then `post_authorization_code`.
  - props: every failure returns the **same** 401 and appends nothing
    (no user enumeration); unknown-user / missing-secret paths run
    `equalizeFailureTiming` to close the timing channel; the STORED
    pair carries the PBKDF2-fingerprinted password and the
    sha256-fingerprinted code (§5.2), never the live values.
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
sidecars (`graphDelta`, `revivals` — consumed only by the
old-plane relation writer below; no derivation reads either,
and both retire at Phase Final). UNLIKE `PUT /ideas/:id` /
`PUT /projects/:id`, this op mints NO `member_id` ternary —
every attempt (including a client retry) mints a fresh trio, so
nothing here ever resends a STORED trio verbatim.

**flows is the FIRST locked-class route** (§5.4, Task 3): a
save on an existing flow must carry `If-Response-ID`, echoing
the head the client just read, or the write 412s. The client
adapter (`putFlow`, `web-app/app/adapters/flow-mutations.ts`)
absorbs a 412 with up to 3 attempts total — each retry backs off
(jittered) and rebuilds the body against the NEW head (a fresh
baseline, fresh delta, fresh trio) before resubmitting; any other
error, or a third 412, propagates to the caller. version-publish
is no longer an option embedded in this PUT (Decision 3) — it
rides its own `POST /flows/:id/versions` (§3.16) transaction,
called by the client BEFORE the save on a versioned edit. That
splits a versioned rename/drag-move into two independent
round-trips (1→2 hops) instead of one: a failure between them
leaves an extra version snapshot (one extra undo point) but never
a lost save — the structural path's already-shipped behavior.

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
  it with a jittered retry (`postFlowUndo`, web-app), rebuilt
  against a fresh baseline — the SAME shape redo (Phase 4 Task
  4, R1/E5) carries, since its document half rides
  `PUT /flows/:id` (§3.13) directly.

### 3.14 `POST /flows/:id/undo` — undo a flow edit

- tx: `[flows, flow_versions, states, flow_nodes, flow_edges,
  flow_node_members, flow_node_attributes, requests,
  responses]`
- actual: `flows.put(id, flow)` (reverted graph) →
  `states.postEvent(eventId, id, 'updated', actor)` →
  `flowVersions.delete(consumedVersionId)` → the graph delta's
  node/edge upserts, member/attribute events, and deletion
  events (`writeFlowGraphDelta`, the SAME helper
  `PUT /flows/:id` and create use) → for each revival:
  `states.postEvent(eventId, entityId, 'restored', actor, at)`
  → `appendMessagePair(pair)` → `appendMessagePair(documentPair)`.
- doctrinal: `put_flow` + `post_state_event` +
  `delete_flow_version` + graph-relation writes + N
  `post_restored_event` as `post_undo_flow`.
- **Two pairs, one tx.** Undo synthesizes a second pair — a
  PUT-shaped document pair at `flows/:id`'s own address
  (`put_flow_document`, §3.13), taking the FOLLOWS slot at the
  pre-undo head — beside its own operation pair; both append in
  the ONE transaction, so a pair count of two or zero, never
  one (+2 to the message-pair balance per undo). See §3.13's
  own note on the follows collision this creates.
- props: atomic; member-tier; `validateFlowUndoBody`.

### 3.15 `POST /flows/:id/redo` — retired (Phase 4 Task 4, R1/E5)

Redo folds into two writes already documented elsewhere: the
CURRENT state archives through `POST /flows/:id/versions` (§3.16
— the SAME op version-publish already rode; the client's
`postFlowVersion` computes the publish internally, so this is
never a second, bespoke snapshot), then the redo target's graph
lands through `PUT /flows/:id` (§3.13, the locked document save,
which also carries the revivals). The two writes are no longer
one transaction — the same non-atomic shape every other
client-composed flow edit already carries (§3.13's own retry
loop absorbs a 412; any other fault propagates to the caller).
The route LEAVES THE URI TREE entirely: a request against it now
404s (no pattern match), unlike the retired `POST /ideas`
(§2.4/§3.10), which 405s because `ideas` GET stays wired —
`flows/:id/redo` had no other verb left to survive it.

### 3.16 `POST /flows/:id/versions` — publish a version

- tx: `[flow_versions, requests, responses]`
- actual: `flowVersions.put(id, version)`; for each `trimId`:
  `flowVersions.delete(trimId)`; `appendMessagePair(pair)`.
- doctrinal: `put_flow_version` + `delete_flow_version`* as
  `post_publish_flow_version`.
- props: atomic; **no state event**; the web-app computes which
  versions to trim; member-tier; `validateFlowVersionPublishBody`.
- **Two callers (Phase 4 Task 4).** A versioned edit's own
  save calls this BEFORE its `PUT /flows/:id` (§3.13); redo
  (retired §3.15) now calls it too, ALONE, to archive the
  CURRENT state before its own `PUT /flows/:id` lands the redo
  target — the same two-call shape, never a third variant.

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
includes 581 of its OWN pre-formed message pairs, one per pair-capable
seed write — see §5.3.

- **Three sequential steps, not one atomic op:**
  1. `ensureTables(TABLE_NAMES)`
  2. `transaction(TABLE_NAMES, postMockDataLoadIn)` — builds the whole
     dataset, including the 581 seed pairs, in one tx (a mid-seed
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

### 3.31 `flows/:id/versions/:vid` — a named version (not POST)

The leaf primitive under the `flows/:id/versions` collection (§3.16).
DOCUMENT-class: a version row is a plain, revisitable row, so a
repeat `PUT` records `Supersedes` and a `DELETE` tombstones it —
exactly like `flow_work_orders`/`state_field_values` above. This is
distinct from the cap-trim machinery inside §3.13/§3.14/§3.15/§3.16,
which calls `flowVersions.delete` directly, inside ITS OWN
transaction, to physically splice versions past the retention cap —
that splice is untouched by this task and stores no pair of its own;
only a client-addressed request through THIS route appends one.

- tx: `[flow_versions, requests, responses]`
- actual: `flowVersions.put(id, body)` or `flowVersions.delete(id)`
  (no organization stamping — a version's org rides its parent flow)
  → `appendMessagePair(pair)`.
- props: atomic; `validateFlowVersionEntity` reconstructs the PUT's
  200 body; the DELETE is the universal 204/no-body shape (§1.1).

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

Every pair-wired write (`PAIR_WIRED_ROUTE_PATTERNS`, plus the
invitations/default-org side channels and the two `/authentication`
grant routes) appends one row to `requests` and one to `responses` —
sharing an `id` — as the LAST act of its own transaction
(`appendMessagePair`, `api/message-pair.ts`). §1.1 covers where this
runs in the dispatch order; this section covers what it produces on
the wire, how a secret crosses it, and how the seeded demo data
carries its own pre-formed pairs.

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
TWELVE pair-capable write families, in dependency order: `human-members`,
`ideas`, `idea-submissions`, `projects`, `flows`, `work-orders`,
`flow-work-orders`, `ai-members`, `records`, `objectives`, `memberships`,
and `members` (`buildMockDataInvocations`,
`api/mock-data/seed-message-pairs.ts`), so the seed forms each family's pair
the SAME way a live request would, then writes it alongside the seeded row:

- The mock-data seed pre-forms **581** message pairs — one pair per seeded
  row for most families, but each seeded human/AI member folds in an
  operation/member-document/detail-document triple (11 human-members +
  4 ai-members, each × 3 = 45 member-family pairs: 15 ops + 15 member
  documents + 15 detail documents, Phase 8 Task 4's bundle synthesis,
  the objectives-family 1+1+1 precedent generalized to the roster —
  see §3.1–§3.4), each seeded membership row folds in its OWN document
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
  closed through `postFlowRecordDocumentOp`), and each seeded baseline/
  actual score row forms its own document pair (49 baseline + 92 actual
  = 141, closed through `postBaselineScoreDocumentOp` /
  `postActualScoreDocumentOp`) — in a first pass, BEFORE the
  seed's own big transaction opens (`formWritePair`'s hashing is async
  crypto, which would auto-commit an IndexedDB transaction early if awaited
  inside one); a second pass then writes the seeded rows and appends each
  pre-formed pair in the SAME transaction the row lands in. The bootstrap
  seed forms exactly five such pairs (the SAME member-family triple, plus
  its OWN membership and system-member document pairs), for its lone
  `current` human-member create.
- Memberships closed the LAST whole-slice seed deferral (Phase 8 Task
  5): every seeded membership row and the system member's own
  `members/:id` document now form a message pair too, closed through
  `postMembershipDocumentOp` / `postMemberDocumentOp`. NO whole-slice
  seed deferral remains; the work-order historical traces (states
  events + state_field_values) stay the one NAMED direct-write
  carve-out, bound to the states-consumers flip, not "the work-orders
  phase" (§5.6).
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

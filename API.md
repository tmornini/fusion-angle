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
- `GET|PUT /members/:id` — member by id. primitive (§3.30).
- `GET /current-member` — the verified caller's own member row.
- `GET /ai-members` · `GET|PUT /ai-members/:id` — primitive.
- `POST /ai-members` · `POST /ai-members/:id` — operation (§3.1, §3.2).
  Admin-only.
- `GET /human-members` · `GET /human-members/:id` — primitive.
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
  carries a live `DELETE`. `GET` stays hand-written, old-plane,
  through this task (Task 7 flips it); `DELETE` stays
  hand-written too, unchanged.
- `POST /records` — operation, create-or-edit write (§3.20).
  Member-tier.
- `GET /record-attributes` · `GET|PUT /record-attributes/:id` —
  primitive.
- `DELETE /record-attributes/:id` — RESTRICT delete (409 if
  referenced; referrer check + splice in one tx).

### 2.9 Objectives

- `GET /objectives` · `GET|PUT /objectives/:id` — primitive
  (§3.29).
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
- `GET /memberships` · `GET|PUT|DELETE /memberships/:id` — primitive.
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

- tx: `[members, ai_members, states, requests, responses]`
- actual:
  1. `members.put(id, {type:'ai'})`
  2. `aiMembers.put(id, detail)`
  3. `states.postEvent(initialStateEventId, id, initialState, actor)`
  4. `appendMessagePair(pair)`
- doctrinal: `put_member` + `put_ai_member` + `post_state_event`
  composed as `post_create_ai_member`.
- props: atomic; admin-only; `validateAIMemberCreateBody` at the gate;
  actor server-stamped.

### 3.2 `POST /ai-members/:id` — edit AI member

- tx: `[members, ai_members, requests, responses]`
- actual: `members.put(id, {type:'ai'})` then
  `aiMembers.put(id, detail)`, then `appendMessagePair(pair)`.
- doctrinal: `put_member` + `put_ai_member` as `post_edit_ai_member`.
- props: atomic; **no state event** (an edit does not move lifecycle);
  admin-only; `validateAIMemberEditBody`.

### 3.3 `POST /human-members` — create human member

- tx: `[members, identities, identity_pii, human_members, states,
  requests, responses]`
- actual:
  1. `members.put(id, {type:'human'})`
  2. `identities.put(id, {kind:'person'})`
  3. `identityPii.put(id, pii)`
  4. `humanMembers.put(id, detail)`
  5. `states.postEvent(initialStateEventId, id, initialState, actor)`
  6. `appendMessagePair(pair)`
- doctrinal: four `put_*` primitives + `post_state_event` as
  `post_create_human_member`.
- props: atomic; admin-only; `validateHumanMemberCreateBody`.

### 3.4 `POST /human-members/:id` — edit human member

- tx: `[members, identities, identity_pii, human_members, requests,
  responses]`
- actual: the four facet `put`s (member, identity, pii, detail), then
  `appendMessagePair(pair)`.
- doctrinal: four `put_*` primitives as `post_edit_human_member`.
- props: atomic; **no state event**; admin-only;
  `validateHumanMemberEditBody`.

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
  6. three `appendMessagePair` calls (below).
- doctrinal: `put_project` + `put_idea` + two `post_state_event` + N
  `put_baseline_score` as `post_convert_idea`.
- props: atomic (project never lands without its baselines, nor an
  idea promoted without its project); member-tier (segment-prefix
  match on `/ideas`); `validateIdeaConversionBody`.

**Three pairs, one tx (Phase 3 Task 4 + Phase 5 Task 5).** The
route pre-forms two extra pairs beside the gate's own operation
pair, ONLY when the gate supplied both a pair and a fence
organization — a below-facade caller (`api/mock-data.ts`) skips
all three:

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

All three pairs share ONE `requestAt` (the conversion's own
origination) yet strictly-later response `at` stamps. Three
pairs commit or none: a mid-transaction failure (a state-ledger
collision, say) leaves zero of the three, exactly like every
other atomic write in this catalog.

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
`recordAttributeDocumentBodyOf`, `api/routes.ts`) are the
ONE-voice seam: pure functions consumed by BOTH this
route-inline formation and the seed's own invocation
construction (`api/mock-data/seed-message-pairs.ts`) — never a
shared pair-FORMER, since forming a pair itself needs the fence
organization and the response specs, which only the route
(and, independently, the seed) hold.

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

- tx: `[objectives, objective_revisions, requests, responses]`
- actual: `objectives.put(id, objective)` (org-scoped stamps org) →
  `objectiveRevisions.put(revisionId, revision)` →
  `appendMessagePair(pair)`.
- doctrinal: `put_objective` + `put_objective_revision` as
  `post_create_objective`.
- props: atomic; **no state event** (a fresh objective reads as active
  until a later archival event); `validateObjectiveCreateBody`.

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
  5. `appendMessagePair(pair)`
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
     {organization_id: INVITATION's org, identity_id: caller, at})`.
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

`postMockDataLoad` (`api/mock-data.ts:173`). Bearer-exempt, demo-only,
and — as a `BOOTSTRAP_ROUTES` member — below the shadow ledger
entirely: this call forms and appends no pair for ITSELF (none of
§5.1's headers appear on its own response). What it seeds, though,
includes 37 of its OWN pre-formed message pairs, one per pair-capable
seed write — see §5.3.

- **Three sequential steps, not one atomic op:**
  1. `ensureTables(TABLE_NAMES)`
  2. `transaction(TABLE_NAMES, postMockDataLoadIn)` — builds the whole
     dataset, including the 37 seed pairs, in one tx (a mid-seed
     failure leaves no half-populated schema).
  3. `seedHumanCredentials(adapter)` — its **own** tx
     `[identity_credentials]`; the PBKDF2 hashing runs outside the tx
     (async crypto cannot run inside an IDB transaction).
  4. `postSchemaCreation()` — the schema marker stamps **last**, so a
     failed seed reads as empty and retries cleanly.
- returns `SeededCredentials` — plaintext sign-ins surfaced in-band,
  once (deleted at the server tier).

### 3.27 `POST /snapshots/bootstrap` — seed the pristine minimal state

`postBootstrap` (`api/mock-data.ts:3744`). Same four-step shape as
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

### 3.29 `PUT /objectives/:id` — reposition an objective (not a POST)

Included alongside §3.28 for the same reason: a bare-CRUD `PUT`, hand-
written in place of the (now-retired) `makeIdRoute` factory so its
pair can append in the same transaction as the write. Today's only
caller is the web-app's `putObjectivePosition` (drag-reorder), whose
body is just `{ position }`.

- tx: `[objectives, requests, responses]`
- actual: `objectives.put(id, body)` (the org-scoped store stamps
  `organization_id`, so the body omits it) → `appendMessagePair(pair)`.
- props: atomic; document-class (a repeat PUT records `Supersedes`,
  §5.1); `validateObjectiveEntity` reconstructs the written row for
  the 200 body.

### 3.30 `PUT /members/:id` — edit a member directory row (not a POST)

Same shape as §3.29, on the GLOBAL plane (no organization stamping —
the `members` row carries no `organization_id`). Registered since
before Phase 1 but, as of this task, uncalled by any web-app adapter:
member edits go through the composed `POST /human-members/:id` /
`POST /ai-members/:id` operations (§3.2, §3.4) instead, which already
touch this same `members` row as one of their own facet puts.

- tx: `[members, requests, responses]`
- actual: `members.put(id, body)` → `appendMessagePair(pair)`.
- props: atomic; document-class; `validateMemberEntity` (just
  `type: 'human' | 'ai' | 'system'`) reconstructs the 200 body.

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
document PUT. `GET`/`DELETE /records/:id` stay hand-written,
old-plane, unchanged (Task 7 flips the `GET`).

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
request (§3.26–§3.28). What they seed, though, is itself the output of TEN
pair-capable write families, in dependency order: `human-members`, `ideas`,
`idea-submissions`, `projects`, `flows`, `work-orders`, `flow-work-orders`,
`ai-members`, `records`, and `objectives` (`buildMockDataInvocations`,
`api/mock-data/seed-message-pairs.ts`), so the seed forms each family's pair
the SAME way a live request would, then writes it alongside the seeded row:

- The mock-data seed pre-forms **380** message pairs — one pair per seeded
  row for most families, but each seeded flow folds in an
  operation/document/join triple (4 creates × 3 pair triples + 1 genesis
  document = 13, §3.12), each seeded work order forms both a document
  pair and a join pair (145 + 145, §3.17), and each seeded record folds
  in its OWN document pair plus one attribute-PUT pair per seeded
  attribute (2 operations + 2 documents + 14 attribute documents = 18,
  §3.20's bundle synthesis, generalized from flows'/work-orders' fixed
  1+1+1 to 1+1+N) — in a first pass, BEFORE the
  seed's own big transaction opens (`formWritePair`'s hashing is async
  crypto, which would auto-commit an IndexedDB transaction early if awaited
  inside one); a second pass then writes the seeded rows and appends each
  pre-formed pair in the SAME transaction the row lands in. The bootstrap
  seed forms exactly one such pair, for its lone `current` human-member
  create.
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

- **`simple`** (`ideas`, `projects`, `work-orders` — §5.6): the
  existing head-read → `Supersedes` chain (§5.1) — a repeat PUT
  ALWAYS succeeds and ALWAYS supersedes the current head.
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
at its own document address). `GET /records/:id` and `GET
/records` stay hand-written, old-plane, through this task
(`RECORDS_WIRING`'s `entityOf` is unreached until Task 7 flips
them), so the fix is proven directly against fabricated pairs
(`tests/api-record-document.test.ts`), not through a live route.

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

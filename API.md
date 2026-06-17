# API.md — URI Catalog & POST Composition

The `api/` layer is a REST-style HTTP API over IndexedDB. Every
operation is an HTTP operation against a relative resource URI;
single-noun primitives (`GET`/`PUT`/`DELETE` on `/noun/:id`) are the
leaves, and multi-noun operations (`POST /noun/operation`) are interior
nodes composed from those leaves.

This document answers two questions:

1. **What URIs exist?** — the complete route catalog (§2).
2. **What does each POST do internally?** — the per-POST composition,
   shown both as the *actual* store-operation sequence and as the
   *doctrinal* single-noun-primitive decomposition (§3).

The single most important fact: **POST endpoints here do not issue
internal HTTP sub-requests.** They compose store-level primitives
inside one `db.transaction([...tables])`. Why this is so — and the one
genuine exception (`facadeRequest`) — is §4.

The source of record is `api/routes.ts` (the route table),
`api/api.ts` (`handleRequest` + facades), `api/request-auth.ts` (the
gate), `api/authentication.ts` (the OAuth grants),
`api/invitations-domain.ts` (the invitation sub-router), and
`api/org-requests.ts` (the org/default-org sub-routers). This file
summarizes them; on any disagreement, the code wins.

---

## 1. Dispatch & Auth Planes

### 1.1 Request flow

`handleRequest(adapter, request)` (`api/api.ts:121`) resolves a request
in this order:

1. **Four pre-table special routes**, matched before the table:
   - `/organizations/:org/:entity[/:id]` (≥3 segments) →
     `facadeRequest` (the org-scoping facade; see §4).
   - `/identities/:id/default-org` (3 segments) →
     `identityDefaultOrgRequest`.
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
   org-scoped adapter) → `authorizeRequest` (per-org role check). Only
   then does the matched handler run, receiving the org-scoped adapter
   and the verified `actor` id.

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
- `GET|PUT /members/:id` — member by id. primitive.
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

- `GET /ideas` · `GET|PUT /ideas/:id` — primitive.
- `POST /ideas` — operation (§3.10). Member-tier.
- `POST /ideas/:id/conversion` — operation, idea→project (§3.11).
  Member-tier.
- `GET /ideas/:id/submissions` ·
  `PUT /ideas/:id/submissions/:sid` — nested.

### 2.5 Projects

- `GET /projects` · `GET|PUT /projects/:id` — primitive.
- `GET /projects/:id/flows` · `PUT|DELETE /projects/:id/flows/:pfid` —
  nested (project↔flow join).
- `GET /projects/:id/objective-baseline-scores` ·
  `PUT .../objective-baseline-scores/:sid` — nested.
- `GET /projects/:id/objective-actual-scores` ·
  `PUT .../objective-actual-scores/:sid` — nested.

### 2.6 Flows

- `GET /flows` · `GET|PUT /flows/:id` — primitive.
- `POST /flows` — operation (§3.12). Member-tier.
- `POST /flows/:id/save` — operation (§3.13).
- `POST /flows/:id/undo` — operation (§3.14).
- `POST /flows/:id/redo` — operation (§3.15).
- `GET /flows/:id/versions` · `POST /flows/:id/versions` (§3.16) ·
  `GET|PUT|DELETE /flows/:id/versions/:vid` — nested.
- `GET /flows/:id/work-orders` ·
  `PUT /flows/:id/work-orders/:woid` — nested.
- `GET /flows/:id/records` ·
  `GET|PUT|DELETE /flows/:id/records/:frid` — nested.

### 2.7 Work orders

- `GET /work-orders` · `GET|PUT /work-orders/:id` — primitive.
- `POST /work-orders` — operation (§3.17). Member-tier.
- `POST /work-orders/:id/claim` — operation (§3.18).
- `POST /work-orders/:id/transition` — operation (§3.19).

### 2.8 Records & attributes

- `GET /records` · `GET|PUT|DELETE /records/:id` — primitive.
- `POST /records` — operation, create-or-edit write (§3.20).
  Member-tier.
- `GET /record-attributes` · `GET|PUT /record-attributes/:id` —
  primitive.
- `DELETE /record-attributes/:id` — RESTRICT delete (409 if
  referenced; referrer check + splice in one tx).

### 2.9 Objectives

- `GET /objectives` · `GET|PUT /objectives/:id` — primitive.
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

- tx: `[members, ai_members, states]`
- actual:
  1. `members.put(id, {type:'ai'})`
  2. `aiMembers.put(id, detail)`
  3. `states.postEvent(initialStateEventId, id, initialState, actor)`
- doctrinal: `put_member` + `put_ai_member` + `post_state_event`
  composed as `post_create_ai_member`.
- props: atomic; admin-only; `validateAIMemberCreateBody` at the gate;
  actor server-stamped.

### 3.2 `POST /ai-members/:id` — edit AI member

- tx: `[members, ai_members]`
- actual: `members.put(id, {type:'ai'})` then
  `aiMembers.put(id, detail)`.
- doctrinal: `put_member` + `put_ai_member` as `post_edit_ai_member`.
- props: atomic; **no state event** (an edit does not move lifecycle);
  admin-only; `validateAIMemberEditBody`.

### 3.3 `POST /human-members` — create human member

- tx: `[members, identities, identity_pii, human_members, states]`
- actual:
  1. `members.put(id, {type:'human'})`
  2. `identities.put(id, {kind:'person'})`
  3. `identityPii.put(id, pii)`
  4. `humanMembers.put(id, detail)`
  5. `states.postEvent(initialStateEventId, id, initialState, actor)`
- doctrinal: four `put_*` primitives + `post_state_event` as
  `post_create_human_member`.
- props: atomic; admin-only; `validateHumanMemberCreateBody`.

### 3.4 `POST /human-members/:id` — edit human member

- tx: `[members, identities, identity_pii, human_members]`
- actual: the four facet `put`s (member, identity, pii, detail).
- doctrinal: four `put_*` primitives as `post_edit_human_member`.
- props: atomic; **no state event**; admin-only;
  `validateHumanMemberEditBody`.

### 3.5 `POST /identities` — create identity

- tx (branches by kind):
  - person → `[identities, identity_pii]`
  - service → `[identities, identity_credentials]`
- actual: `identities.put(id, {kind})`; then person →
  `identityPii.put(id, pii)`; service →
  `identityCredentials.put(credId, fields)`.
- doctrinal: `put_identity` + (`put_identity_pii` |
  `put_identity_credential`) as `post_create_identity`.
- props: atomic; **no state event** (an identity has no creation
  lifecycle event); admin-only; secret hashed client-side (the route
  touches no crypto); `validateIdentityCreateBody`.

### 3.6 `POST /identity-tokens/:jti/rotation` — rotate refresh jti

Delegates to `rotateRefreshJti` (`api/authentication.ts:276`).

- tx: `[identity_tokens]`
- actual:
  1. `identityTokens.getAllWhere('jti', presented)`
  2. `chainIdForJti(...)`
  3. `identityTokens.getAllWhere('chain_id', chainId)`
  4. `planRotation(...)` (pure)
  5. rotate → `appendEvents` (successor jti); replay/reuse →
     `appendEvents` (revoke the whole chain).
- doctrinal: read the token ledger + `post_token_event`(s) as
  `post_rotate_refresh_token`.
- props: atomic; TOCTOU-safe (read + plan + append in one tx, so two
  concurrent rotations cannot both rotate); live jti → `{jti}`,
  reuse/unknown → 409.

### 3.7 `POST /identity-tokens/:jti/revocation` — revoke chain

Delegates to `revokeTokenChain` (`api/authentication.ts:320`).

- tx: `[identity_tokens]`
- actual: `getAllWhere('jti')` → `chainIdForJti` / `identityForJti` →
  `getAllWhere('chain_id')` → `appendEvents(revocationAppends(...))`
  (a `revoked` event per jti in the chain).
- doctrinal: read chain + `post_token_event`(s) as
  `post_revoke_token_chain` (log out one session).
- props: atomic; idempotent no-op for an unknown jti.

### 3.8 `POST /authentication/token` — grant dispatch

`postToken` (`api/authentication.ts:598`) dispatches on `grant_type`.
Every grant is **grant-first**: it authenticates the presented grant
before any side effect, so a failed grant appends nothing and mints
nothing. `mintPair` is pure crypto (no DB).

- **`authorization_code`** → `grantAuthorizationCode`:
  - tx `[authorization_codes, identity_tokens]`:
    `authorizationCodes.getAllWhere('code')` → `codeState` (must be
    `issued`) → `authorizationCodes.put(consumed)` →
    `recordIssuedRoot` (`identityTokens.put(issued)`).
  - then (outside tx): `nameFor` (`identityPii.getById`) →
    `subjectOrgs` (`memberships.getAllWhere`) → `mintPair`.
  - props: the consume + chain-root issue are atomic (no double-spend
    on replay); a used/unknown code → 401.
- **`refresh`** → `grantRefresh`:
  - `verifyAccessToken` (crypto) → `tokenRevocationReason`
    (`identityTokenRevocations.getAllWhere` +
    `identityTokens.getAllWhere`) → `rotateRefreshJti` (the §3.6 tx) →
    `nameFor` → `subjectOrgs` → `mintPair`.
  - props: rotation is atomic; reuse revokes the chain then 401.
- **`token-exchange`** → `grantTokenExchange` (RFC 8693,
  self-delegation only):
  - `verifyAccessToken`×2 → `tokenRevocationReason`×2 → assert
    subject == actor → optional `subjectOrgs` membership check →
    `nameFor` → `issueTokenPair`.
  - `issueTokenPair` = `recordIssuedRoot` (a **single** put) +
    `subjectOrgs` + `mintPair`.
  - props: a lone write needs no explicit `transaction([...])`
    wrapper — but it is still atomic: `EntityStore.put` runs its
    own `readwrite` tx (`api/store-entity.ts:106`). The wrapper in
    the two grants above bundles multiple writes + a check-then-act,
    which a single write has neither of. Cross-party exchange → 403.
- **`client_credentials`** → `grantClientCredentials`
  (private_key_jwt):
  - `clients.getById` → status/grant-type checks →
    `verifyClientAssertion` (JWS, crypto) → `nameFor` →
    `issueTokenPair` (as above).
  - props: same single-write shape as token-exchange — atomic
    without an explicit wrapper. Bad assertion → 401.

### 3.9 `POST /authentication/authorize` — interactive front door

`postAuthorize` (`api/authentication.ts:736`) dispatches on `method`.

- **`password`** → `authorizePassword`:
  - `identityPii.getAllWhere('email')` → `identityByEmail` →
    `identityCredentials.getAllWhere('identity_id')` →
    `currentPasswordSecret` → `verifyPassword` (PBKDF2) → on success
    `authorizationCodes.put(issued)`.
  - doctrinal: verify credentials, then `post_authorization_code`.
  - props: every failure returns the **same** 401 and appends nothing
    (no user enumeration); unknown-user / missing-secret paths run
    `equalizeFailureTiming` to close the timing channel.
- **`passkey` / `provider` / `oidc`** → 501 seam.
- default → 400.

### 3.10 `POST /ideas` — create idea

- tx: `[ideas, states]`
- actual: `ideas.put(id, idea)` (the org-scoped store stamps
  `organization_id`, so the body omits it) →
  `states.postEvent(initialStateEventId, id, initialState, actor)`.
- doctrinal: `put_idea` + `post_state_event` as `post_create_idea`.
- props: atomic; member-tier; `validateIdeaCreateBody`.

### 3.11 `POST /ideas/:id/conversion` — promote idea → project

The lone cross-aggregate write.

- tx: `[projects, ideas, states,
  project_objective_baseline_scores]`
- actual:
  1. `projects.put(projectId, project)` (org-scoped stamps org)
  2. `ideas.put(ideaId, idea)` (promote)
  3. `states.postEvent(ideaStateEventId, ideaId, ideaState, actor)`
  4. `states.postEvent(projectStateEventId, projectId, projectState,
     actor)`
  5. for each baseline: `projectObjectiveBaselineScores.put(...)`
- doctrinal: `put_project` + `put_idea` + two `post_state_event` + N
  `put_baseline_score` as `post_convert_idea`.
- props: atomic (project never lands without its baselines, nor an
  idea promoted without its project); member-tier (segment-prefix
  match on `/ideas`); `validateIdeaConversionBody`.

### 3.12 `POST /flows` — create flow

- tx: `[flows, project_flows, states]`
- actual: `flows.put(id, flow)` (org-scoped stamps org) →
  `projectFlows.put(projectFlowId, projectFlow)` →
  `states.postEvent(initialStateEventId, id, initialState, actor)`.
- doctrinal: `put_flow` + `put_project_flow` + `post_state_event` as
  `post_create_flow`.
- props: atomic; member-tier; `validateFlowCreateBody`.

### 3.13 `POST /flows/:id/save` — save (optional version)

- tx: `[flows, flow_versions, states]`
- actual:
  1. if `version !== null`: `flowVersions.put(version.id, version)`;
     for each `trimId`: `flowVersions.delete(trimId)`.
  2. `flows.put(id, flow)` (org-scoped stamps org)
  3. `states.postEvent(eventId, id, 'updated', actor)`
- doctrinal: optional (`put_flow_version` + `delete_flow_version`*) +
  `put_flow` + `post_state_event` as `post_save_flow`.
- props: atomic; plain save (version null) touches no versions;
  member-tier; `validateFlowSaveBody`.

### 3.14 `POST /flows/:id/undo` — undo a flow edit

- tx: `[flows, flow_versions, states]`
- actual: `flows.put(id, flow)` (reverted graph) →
  `states.postEvent(eventId, id, 'updated', actor)` →
  `flowVersions.delete(consumedVersionId)`.
- doctrinal: `put_flow` + `post_state_event` + `delete_flow_version`
  as `post_undo_flow`.
- props: atomic; member-tier; `validateFlowUndoBody`.

### 3.15 `POST /flows/:id/redo` — redo a flow edit

- tx: `[flows, flow_versions, states]`
- actual: `flowVersions.put(version.id, version)`; for each `trimId`:
  `flowVersions.delete(trimId)`; `flows.put(id, flow)`;
  `states.postEvent(eventId, id, 'updated', actor)`.
- doctrinal: `put_flow_version` + `delete_flow_version`* + `put_flow`
  + `post_state_event` as `post_redo_flow`.
- props: atomic; always writes a version (the reverse of undo);
  member-tier; `validateFlowRedoBody`.

### 3.16 `POST /flows/:id/versions` — publish a version

- tx: `[flow_versions]`
- actual: `flowVersions.put(id, version)`; for each `trimId`:
  `flowVersions.delete(trimId)`.
- doctrinal: `put_flow_version` + `delete_flow_version`* as
  `post_publish_flow_version`.
- props: atomic; **no state event**; the web-app computes which
  versions to trim; member-tier; `validateFlowVersionPublishBody`.

### 3.17 `POST /work-orders` — create work order

- tx: `[work_orders, flow_work_orders, states]`
- actual: `workOrders.put(id, workOrder)` (org-scoped stamps org) →
  `flowWorkOrders.put(flowWorkOrderId, flowWorkOrder)` → loop i in
  0..2: `states.postEvent(stateEventIds[i], id, states[i], actor)`.
- doctrinal: `put_work_order` + `put_flow_work_order` + three
  `post_state_event` (start transition, post-start transition,
  creation-time `claimed`) as `post_create_work_order`.
- props: atomic; the three events are applied in order; member-tier;
  `validateWorkOrderCreateBody`.

### 3.18 `POST /work-orders/:id/claim` — claim

- tx: `[work_orders, states]`
- actual:
  1. `workOrders.getById(id)`
  2. `validateWorkOrderFlowGraphJson(...)` (pure parse)
  3. `states.getAllFor(id)` → `latestClaimEvent(...)`
  4. if a live claim by another member → 409; by the caller → no-op.
  5. if the prior claim is expired:
     `states.postEvent(..., 'claim_expired', prior.member_id)`.
  6. `states.postEvent(..., 'claimed', actor)`.
- doctrinal: read the claim history + up to two `post_state_event` as
  `post_claim_work_order`.
- props: atomic; **TOCTOU-safe** (read + check + append ride one tx, so
  two concurrent claims cannot both see "no live claim"); idempotent
  for the current holder; member-tier.

### 3.19 `POST /work-orders/:id/transition` — transition along an edge

- tx: `[states, state_field_values]`
- actual:
  1. `states.postEvent(transitionEventId, id, targetState, actor)`
  2. for each field value: `stateFieldValues.put(row.id, fields)`
  3. if `release !== null`:
     `states.postEvent(release.id, id, release.state, actor)`
- doctrinal: `post_state_event` + N `put_state_field_value` + optional
  `post_state_event` (claim release) as `post_transition_work_order`.
- props: atomic; the web-app computes the target node, field values,
  and whether a claim release is needed; member-tier;
  `validateWorkOrderTransitionBody`.

### 3.20 `POST /records` — record write (create or edit)

`applyRecordWrite` (`api/routes.ts:220`).

- tx (dynamic): `[records, record_attributes, states,
  ...ATTRIBUTE_RESTRICT_TABLES]`
- actual:
  1. `validateRecordWriteBody(body)` (create vs edit, entries,
     removals)
  2. `records.put(id, record)`
  3. if `create`: `states.postEvent(initialStateEventId, id,
     initialState, actor)`
  4. if removals: `collectAttributeReferrers(...)` → if any referrer,
     `throw 409` (rolls back the whole batch)
  5. if entries or removals:
     `recordAttributes.putMany(entries, removedIds)`
- doctrinal: `put_record` + optional `post_state_event` + a
  put/delete batch over `record_attributes` as `post_write_record`.
- props: atomic; **RESTRICT** (a removed attribute still referenced
  409s and rolls back the whole write); member-tier.

### 3.21 `POST /objectives` — create objective

- tx: `[objectives, objective_revisions]`
- actual: `objectives.put(id, objective)` (org-scoped stamps org) →
  `objectiveRevisions.put(revisionId, revision)`.
- doctrinal: `put_objective` + `put_objective_revision` as
  `post_create_objective`.
- props: atomic; **no state event** (a fresh objective reads as active
  until a later archival event); `validateObjectiveCreateBody`.

### 3.22 `POST /invitations` — grant an invitation

`grantInvitation` (`api/invitations-domain.ts:238`).

- before tx (base-adapter reads): `callerActiveOrg` → `callerIsOrgAdmin`
  (`roleGrants.getAllWhere`) → parse `email` → `identityPii.getAll`
  find the matching identity (404 if none).
- tx: `[invitations, states, memberships]`
- actual:
  1. `memberships.getAll` — already-member check (→ 409)
  2. `pendingInvitationFor(...)` (`invitations.getAll` +
     `states.getAll`) — idempotency (→ return existing pending)
  3. `invitations.put(id, {organization_id, identity_id, at})`
  4. `states.postEvent(eventId, id, 'pending', principal.id)`
- doctrinal: member/pending guards + `put_invitation` +
  `post_state_event` as `post_grant_invitation`.
- props: atomic; admin-only; idempotent on an outstanding pending
  invite; TOCTOU-safe (the guards ride the write tx). The org is the
  admin's active org, not the path.

### 3.23 `POST /invitations/:id/acceptance` — accept

`acceptInvitation` (`api/invitations-domain.ts:364`). The only live
membership write.

- before tx: `loadInvitation` (`invitations.getById`; 404 if absent);
  assert `identity_id === caller` (else 403).
- tx: `[memberships, states]`
- actual:
  1. `currentInvitationState` (`states.getCurrentFor`); `accepted` →
     no-op; not `pending` → 409.
  2. `memberships.getAll` — already-member guard.
  3. if not already: `memberships.put(membershipId,
     {organization_id: INVITATION's org, identity_id: caller, at})`.
  4. `states.postEvent(eventId, id, 'accepted', principal.id)`.
- doctrinal: state guard + `put_membership` + `post_state_event` as
  `post_accept_invitation`.
- props: atomic; invitee-only; idempotent (re-accept is a no-op);
  membership is written in the **invitation's** org, never the
  caller's active org; TOCTOU-safe.

### 3.24 `POST /invitations/:id/decline` — decline

`declineInvitation` (`api/invitations-domain.ts:417`).

- before tx: `loadInvitation`; assert invitee (403 otherwise).
- tx: `[states]`
- actual: `currentInvitationState`; `declined` → no-op; not `pending`
  → 409; else `states.postEvent(eventId, id, 'declined',
  principal.id)`.
- doctrinal: state guard + `post_state_event` as
  `post_decline_invitation`.
- props: atomic; invitee-only; idempotent; the invitation row persists
  as audit (no membership written).

### 3.25 `POST /invitations/:id/revocation` — revoke

`revokeInvitation` (`api/invitations-domain.ts:451`).

- before tx: `loadInvitation`; `callerIsOrgAdmin(inv.organization_id)`
  (403 otherwise).
- tx: `[states]`
- actual: `currentInvitationState`; `revoked` → no-op; not `pending` →
  409; else `states.postEvent(eventId, id, 'revoked', principal.id)`.
- doctrinal: state guard + `post_state_event` as
  `post_revoke_invitation`.
- props: atomic; admin-only; idempotent; the invitation row persists
  as audit.

### 3.26 `POST /snapshots/mock-data` — seed the demo dataset

`postMockDataLoad` (`api/mock-data.ts:173`). Bearer-exempt, demo-only.

- **Three sequential steps, not one atomic op:**
  1. `ensureTables(TABLE_NAMES)`
  2. `transaction(TABLE_NAMES, postMockDataLoadIn)` — builds the whole
     dataset in one tx (a mid-seed failure leaves no half-populated
     schema).
  3. `seedHumanCredentials(adapter)` — its **own** tx
     `[identity_credentials]`; the PBKDF2 hashing runs outside the tx
     (async crypto cannot run inside an IDB transaction).
  4. `postSchemaCreation()` — the schema marker stamps **last**, so a
     failed seed reads as empty and retries cleanly.
- returns `SeededCredentials` — plaintext sign-ins surfaced in-band,
  once (deleted at the server tier).

### 3.27 `POST /snapshots/bootstrap` — seed the pristine minimal state

`postBootstrap` (`api/mock-data.ts:3744`). Same four-step shape as
§3.26, with `postBootstrapIn` planting only the shell essentials
(system actor, current user, the singleton org — no Records). Returns
`SeededCredentials`.

### 3.28 `PUT /snapshots/import` — restore a snapshot (not a POST)

Included for completeness: it is the textbook gate-then-atomic write.
`putSnapshot` (`api/db-backed.ts:219`).

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

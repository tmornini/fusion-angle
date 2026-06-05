# Plan: Identity, Auth & Multi-Tenancy Transformation

## Context

**Why this change.** Today the app is single-tenant with mock auth:
one hardcoded worker (`id='current'`, `demo@example.com`) returned by
`route('current-worker', …)`, no identity system, no real
organizations (the `organization` table is a billing *singleton*,
`id='1'`), no tokens, no roles, no authorization. The cosmetic auth
form just waits 800ms and navigates.

**What we have to build on.** There is already a real internal HTTP
API — `api/api.ts` holds a genuine route table (`route('ai-workers/:id',
…)` with `:param` segment matching), `handleRequest()` parses
`request.url`, and the verb functions construct real `Request` objects
and even `simulateLatency()`. This boundary — App → `RequestContext`
→ internal HTTP API → `DbAdapter` → localStorage — **is the server
seam.** The contract (paths, verbs, headers, status codes) is fully
real and designable now; the backing store (localStorage today,
networked server + Postgres later) is the scripture's "datastore last"
axis and is orthogonal to the contract.

**Intended outcome.** A forward-modeled HTTP contract at that internal
boundary implementing: `/organizations/:id/` tenancy, a general
`/identities/:id` system (PII isolation, provider links, token
management), real authentication (humans + non-humans) and
authorization, with DPoP-bindable Bearer tokens (OAuth 2.1 / RFC 9700).
The cryptographic ceremony (passkeys, DPoP verification, PAR/JAR/RAR)
is "server-fulfilled later" — it slots into the auth middleware and
`/authentication/` endpoints without changing the resource contract.

## Architecture — locked decisions

1. **Contract at the internal HTTP API.** All design happens at the
   `api/api.ts` boundary. Backing store is deferred ("datastore last").

2. **Global identity.** One `/identities/:id` principal spans all
   orgs. `/identities/`, `/authentication/`, `/authorizations/`, and
   `/organizations/:id` itself sit OUTSIDE the org prefix because auth
   resolves the global principal first.

3. **`member.id === identity.id`** — renaming the existing `worker`.
   A **member** is the org-scoped manifestation of an identity; its
   *existence in an org IS the membership* — no membership join table
   (the relationship carries a profile + is therefore an entity, per
   the "false name" test). The id-equality means every existing
   `worker_id` *value* becomes a valid `identity_id` with **zero value
   remapping**; the `worker_id → member_id` rename is purely
   mechanical. *Terminology:* the existing `worker` entity (`workers`
   table, `WorkerEntity`, the Workers page) is renamed to `member` as
   Step 0 of SP-1; below, 'member' is the target and existing files
   are cited by their current `worker*` names.

4. **Roles are global, on the identity.** A role gates an *endpoint*
   (org-prefixed or not). Authorization = (token valid + DPoP proof)
   AND (a role authorizes this endpoint) AND (if org-scoped, a member
   exists for `sub` in that org). Capability = role; locus = member
   existence. [SUPERSEDED by SP-6: roles are PER-ORG. `role_grants`
   carries `organization_id` and `currentRolesForInOrg` resolves the
   latest action per `(organization_id, identity_id, role)`, fenced
   to the request's org — a grant in one org does not authorize in
   another. See Execution status.]

5. **Flat root stores + org facades.** Each entity type lives in one
   flat root store `/<entity>/:id` (single source of truth).
   `/organizations/:org-id/<entity>/:id` is a *facade* that issues an
   internal, RFC-8693 token-exchanged sub-request to
   `/<entity>/:id?organization-id=:org-id`. Org-scoped entities carry a
   NOT-NULL `organization_id` (containment, not entangled-nouns). The
   root store enforces `entity.organization_id === asserted org` →
   **cross-org leakage is structurally impossible, not policy-enforced.**

6. **Principal in the token, never in the path.** Access token (JWT,
   DPoP-bindable) carries `sub`=identity-id, `roles`, `name`,
   `aud`/origin (which website), `cnf` (DPoP key). [SUPERSEDED by
   SP-2 deviation (a): an `org` (active) + `orgs` (reachable) claim
   now ride the token; see Execution status.]
   Identity-id appears in a path only where the identity is the
   resource (`/identities/:id/…`). Delegation = RFC 8693 token
   exchange.

7. **Auth dispatches on client modality, not principal kind.** The
   axis is browser/computer-user (can complete an interactive ceremony)
   vs api/code (headless) — captured per-client in a **client
   registry** (grant types, redirect URIs, JWKS, origin/`aud`; these
   clients ARE the "websites built by us and others" and answer "know
   where they access from"). A single OAuth 2.1
   **`/authentication/token`** endpoint serves every client (dispatch
   on `grant_type`: `authorization_code`, `client_credentials` via
   `private_key_jwt`, `token-exchange`, `refresh`); browser/
   computer-user clients first pass the interactive
   **`/authentication/authorize`** front door (passkey / provider-IdP /
   password loop, extensible to corporate OIDC) to obtain a grant.
   Key-possession unifies both doors (passkey ≙ `private_key_jwt`);
   both yield DPoP-bound tokens. `identity.kind` therefore means
   **person (has PII) vs service (no PII)**, never how-you-authenticate.

## Decomposition & sequence

Six independently-shippable sub-projects. **Critical path
(foundation-first):** `1 → 3 → {4, 5} → 2 → 6`. DAG: `1 → {2,3}`,
`3 → {4,5}`, `5 → {2-facades, 6}`.

| # | Sub-project | Lands |
|---|-------------|-------|
| 1 | **Identity core** | rename `worker`→`member`; `identity` store; `member.id===identity.id`; PII split into `identity_pii` |
| 3 | **Token gate** | JWT claim contract; auth middleware at `handleRequest`; identity into `RequestContext`; Bearer required |
| 4 | **Authorization** | `role_grants` append-only ledger; endpoint→roles policy; role check |
| 5 | **Authentication** | `clients` registry; single `/authentication/token` (grant_type dispatch) + interactive `/authentication/authorize`; `identity_providers`, `identity_tokens` |
| 2 | **Tenancy** | org singleton → tenant root; NOT-NULL `organization_id`; org facades + leakage guard |
| 6 | **Identity surface** | `/identities/:id` CRUD + `/pii` erasure + `/providers` + `/tokens` |

### Execution status

- **SP-1 Identity core — ✅ DONE** (executed 2026-06; commits
  `3ff30b5..386e7af` on `master`, `./validate` green at every step,
  1050 tests). Landed: the `identity` store (`{id, kind}`,
  `member.id === identity.id`), `identity_pii` (splice-erasable person
  PII modeled to the app as the `MemberPii` tagged union), and a bonus
  `identity_credentials` append-only ledger (revoke-to-retain). PII
  (name + contact) moved off `members`/`human_members` into
  `identity_pii`; `members` is now `{id, type}`; AI name on
  `ai_members.name`; the system actor's name is a constant. Detailed
  plan + execution record:
  `docs/superpowers/plans/2026-06-02-sp1-identity-core.md`.
  - **Deviations recorded during execution:** (a) `kind` = the
    principal's NATURE (person|service), NOT a "has-PII" flag — both
    kinds carry sensitive data; (b) Phase C shipped as **two** atomic
    green commits, not four — the polymorphic-`name()` / tagged-union
    migration is indivisible (the type system makes "reshape" and
    "migrate readers" one act); (c) credential writes use
    PUT-with-client-id (codebase-native, idempotent per Commandment
    VII), not POST; (d) credential `secret` hashing + verification
    deferred to SP-5 / the server tier (bcrypt would break zero-deps;
    you hash where you verify) — SP-1 enforces non-leakage on read.
  - **Codebase finding for all later SPs:** `SCHEMA.svg` is generated
    from `api/db.ts` + `api/types.ts` and gated by `./validate`'s
    `./generate-schema-svg --check`; any schema change must regenerate
    + commit it, and the sandbox gate is `TMPDIR=/tmp/claude
    ./validate`.
- **SP-3 Token gate — ✅ DONE** (executed 2026-06; commits
  `c595126..HEAD` on `master`, `./validate` green at every step, 1078
  tests). Landed: the JWT access-token claim contract
  (`api/access-token.ts`: `sub`/`roles`/`name`/`aud`/`cnf` +
  `iat`/`nbf`/`exp`/`jti`, short-lived) over a co-located base64url codec
  (`api/base64url.ts`); the authentication gate at `handleRequest`
  (verify structure + `aud` + `exp`/`nbf` + per-identity revoked-before +
  reject the anonymous principal on protected routes); the append-only
  `identity_token_revocations` ledger (revoked-before = latest `at`, one
  home `latestRevocationAt`); `RequestContext.identity` set exactly once
  (a `Principal` value); the token carried on the vessel via an explicit
  required param + a per-tab session holder (`init.ts`) +
  `sessionContext()`; mint-at-login/boot for the seeded `current`
  identity. Detailed plan + execution record:
  `docs/superpowers/plans/2026-06-03-sp3-token-gate.md`.
  - **Deviations recorded during execution:** (a) the token contract +
    verify live in `api/` (not `web-app/`) because the gate is in `api/`
    and cannot import upward; (b) the signature is a DEFERRED structural
    seam (`verifyTokenSignature` accepts a placeholder) — real HS256/DPoP
    verification is SP-5, exactly as SP-1 deferred credential hashing; the
    gate's real teeth are structure + `aud` + `exp`/`nbf` +
    revoked-before + anonymous-rejection. **Deployment constraint**
    (automated security review flagged this CRITICAL): the signing key is
    a client-shipped constant, so a token is trivially forgeable — the
    gate MUST NOT be enabled in a networked / multi-user / untrusted-
    client-reachable context until SP-5 supplies a real server-side
    signature. Safe today ONLY because the whole store is client-side
    localStorage (no trust boundary; the page-runner already owns their
    data). The gate and real signing are inseparable — they arrive
    together with the server tier; (c) STRICT deny-by-default
    (user-ratified): the token param is required, no fallback token; the
    logged-out state is a named `ANONYMOUS_PRINCIPAL` the gate rejects on
    protected routes (authentication teeth, distinct from SP-4 role
    authorization); (d) the exempt set is `BEARER_EXEMPT_ROUTES` (the
    snapshot/bootstrap plane) — exempt-from-the-Bearer-gate is NOT
    "unauthenticated"; (e) the sweep surfaced and fixed a pre-existing
    wart — `flow-operations.ts` now threads the `ctx` vessel, not a raw
    `db` adapter (Generality: one voice).
  - **Corrected the 401-vs-404 reasoning:** the gate runs AFTER
    `matchRoute`, so a path OUTSIDE our URL tree → 404 (honest: no
    resource to authenticate to) and an IN-tree unauthenticated request →
    401 (which asserts only "no valid credentials," never existence — per
    RFC 9110). Because the gate runs BEFORE the handler, an
    unauthenticated caller never reaches an instance lookup, so
    RESOURCE-INSTANCE enumeration is STRUCTURALLY prevented (not an oracle
    to defer); only the route-SHAPE table — the public API contract — is
    observable, which is acceptable. Both codes are honest; no protective
    lie is being deferred.
  - **Grant-first principle for SP-5:** the `/authentication/*` front
    doors will be in `BEARER_EXEMPT_ROUTES` (you cannot require a Bearer
    to obtain one), but they are NOT unauthenticated — they MUST
    authenticate the presented grant immediately, before any side effect,
    and a failed grant is a clean no-op (no token minted, no session
    written). Authenticate-then-act; validate at the gate + atomicity.
  - **Self-revocation note (for SP-4/SP-6):** "log out everywhere" stamps
    `revoked_before = now`, which also revokes the actor's own in-flight
    token; a caller must re-establish a session before any further write.
  - **`aud` enforced now, multi-audience later:** a single
    `TOKEN_AUDIENCE` is enforced in `verifyAccessToken`; per-client
    multi-audience validation (via the SP-5 clients registry) is deferred.
- **SP-4 Authorization — ✅ DONE** (executed 2026-06; commits
  `ec88791..fa7a535` on `master`, `./validate` green at every step,
  1101 tests). Landed: the `role_grants` append-only ledger as its
  own `HistoryEntityStore` table (joins `identity_credentials` /
  `identity_token_revocations`), with `role-grants` + `role-grants/:id`
  routes; deny-by-default authorization gate — an ordered
  `(verb, pathPrefix) → roles` policy matched by
  `method === verb && pathname.startsWith(prefix)`, permitted iff a
  held role matches, else 403 (`admin` allowed at `/` for all four
  verbs — four honest lines, no implicit-superuser special case); two
  DISTINCT gate stages: `authenticateRequest → Principal | string`
  (401) then `authorizeRequest → string | null` (403), authentication
  first; roles derived FRESH from the `role_grants` ledger every
  request (the token's `roles` claim stays `[]` and is never
  consulted — a revoke takes effect on the next request); `current`
  seeded `admin` in both `populateMockData` and
  `populateBootstrapData`; vessel adapter
  `web-app/app/adapters/role-grants.ts` (`postRoleGrant` /
  `postRoleRevocation` / `getRolesFor`). Detailed plan:
  `docs/superpowers/plans/2026-06-03-sp4-authorization.md`.
  - **Deviations recorded during execution:** (a) **User-directed
    simpler model:** deny-by-default per `(verb, path-prefix)` via
    `startsWith`, NOT the richer allow/deny IAM rule engine (explicitly
    descoped this session); (b) **Own-table decision:** `role_grants`
    is its own `HistoryEntityStore` table, NOT riding the `states`
    log — this RESOLVES the open question the spec deferred to SP-4
    (see Deferred section below, now updated); (c) **Roles
    ledger-derived fresh** at the gate; the token `roles` claim is
    unused; (d) **Fixture migration:** the plan listed 43 candidate
    gate-traversing test files; 41 were seeded and 2
    (`adapters-shared-identity`, `flow-designer-presenter`) were
    verified PURE (identity-resolution and presenter tests that never
    cross the HTTP gate) and correctly left unseeded; the api-layer
    trio (`api`, `api-records`, `api-records-multi-put`) refactored to
    a local `freshDb()` helper; (e) **Same-instant tie-break fix:**
    `currentRolesFor` changed `>` → `>=` (its own commit) — a security
    correctness fix: `nowUtc()` is millisecond-resolution, so a grant
    and an immediate revoke can share an `at`; `>=` lets the
    later-appended event (the revoke) win — the secure direction;
    (f) **DEFERRED to SP-5:** credential surfacing after wipe-and-load
    (show the admin username + password on the snapshots page) AND
    switching the seeded admin password from the fixed placeholder to a
    crypto-grade UUID — both land with SP-5's real password
    verification (a random seed password is non-deterministic and
    unknowable until a surfacing path displays it);
    (g) **same-instant ledger ordering relies on append order** —
    correct now (single-writer; `getAll()` returns insertion order)
    but implicit; explicit `ORDER BY (at, monotonic-key)` deferred to
    the Postgres tier — see the Deferred/open section.
  - **Deployment constraint:** the HS256 signature is a placeholder
    shipped in client JS (inherited from SP-3), so the gate MUST NOT be
    enabled in any networked / multi-user context until SP-5 supplies
    real crypto — the gate and real signing arrive together with the
    server tier.
- **SP-5 Authentication — ✅ DONE** (executed 2026-06; commits
  `6f7d61c..1a5f7af` on `master`, `./validate` green at every step,
  1183 tests). Landed: real **HMAC-SHA256** token signing via WebCrypto
  (`api/access-token.ts`; sign/verify/mint now async) over the frozen
  three-segment JWT; real **PBKDF2-HMAC-SHA256** credential hashing in a
  self-describing PHC string in the existing
  `identity_credentials.secret` column (`api/password-hash.ts`: a
  registry of deletable per-algo verifiers + one
  `CURRENT_PASSWORD_HASH`); credential surfacing after wipe-and-load +
  a crypto-grade seed admin password (the two SP-4 deferrals); the
  `identity_tokens` lifecycle ledger (issued/rotated/revoked per jti,
  pure chain reduce + reuse-detection, gate denies revoked jtis); the
  `clients`, `identity_providers`, `authorization_codes` registries;
  the OAuth 2.1 `/authentication/token` dispatcher (`authorization_code`,
  `refresh` with reuse-detection → chain revoke, RFC 8693
  `token-exchange` with the `act` claim, `client_credentials` via the
  `private_key_jwt` structural seam) + the interactive
  `/authentication/authorize` front door (real password loop;
  passkey/provider/oidc as 501 seams); and the real session flow —
  login drives `/authorize` → `/token` for a signed pair
  (`web-app/app/adapters/authentication.ts`). Detailed plan + execution
  record: `docs/superpowers/plans/2026-06-03-sp5-authentication.md`.
  - **Deviations recorded during execution:**
    (a) **Both crypto seams made real now via WebCrypto** (user
    directive) — HMAC-SHA256 + PBKDF2-HMAC-SHA256 are zero-dependency
    platform primitives, so SP-1's "no zero-dep KDF" reason for
    deferring credential hashing is satisfied without the server.
    PBKDF2 is TRANSITIONAL: the server tier flips
    `CURRENT_PASSWORD_HASH` to scrypt and DELETES the PBKDF2 verifier
    (one registry edit + one file removal) — never coexistence.
    (b) **Deployment constraint REDUCED, not resolved.** Real HMAC with
    a client-shipped key remains forgeable; the constraint is carried
    forward, now "key location only" — restated in the
    `api/access-token.ts` seam comment and the login facade. The gate
    still MUST NOT be enabled in a networked context until the key
    lives server-side.
    (c) **`authorization_codes.id` is a generated event id with `code`
    as a field** (not "id = the opaque code"): an append-only,
    multi-row-per-code ledger (issue then consume) needs the code as a
    logical key, like `identity_tokens`' jti — honoring the append-only
    ledger discipline (Immutability).
    (d) **token-exchange VERIFIES both subject_token and actor_token**
    (signature/exp/aud, like the refresh grant) — an automated security
    review flagged decode-without-verify; the remaining seam is the
    DELEGATION POLICY (may actor act-as subject), deferred to the
    server tier (resolves the open delegation-policy question below).
    (e) **Boot keeps a mock direct-mint session; the LOGIN FORM drives
    the real OAuth flow.** The seed admin password is random and
    surfaced once, so none exists at boot — `establishSession` stays a
    documented mock convenience for app-boot / demo sign-up, while
    `loginViaPassword` is the real path (what the browser regression
    exercises).
  - **Codebase finding:** TS 5.7+ made `Uint8Array` generic over its
    buffer; WebCrypto's `BufferSource` requires `Uint8Array<ArrayBuffer>`
    (not the default `<ArrayBufferLike>`), so `base64UrlToBytes` and the
    PBKDF2 salt are typed `Uint8Array<ArrayBuffer>`.
- **SP-2 Tenancy — ✅ DONE** (executed 2026-06-04; commits
  323228d..f5521df). Promoted the `organization` singleton to an
  `organizations` tenant-root table; added NOT-NULL `organization_id`
  to the org-owned entities (`role_grants`, `ideas`, `projects`,
  `flows`, `work_orders`, `records`, `record_attributes`,
  `objectives`), backfilled to `DEFAULT_ORG` ('1') on re-seed. Built
  the `OrgScopedEntityStore` decorator + `orgScopedAdapter` factory
  (filter on read, stamp on write, foreign id → 404 never 403), wired
  into `handleRequest` as the per-request `effective` adapter (inert
  for flat tokens). Extended the `token-exchange` grant to mint
  org-scoped tokens after a membership check (grant-first — a
  non-member is a 403 minting nothing); added the
  `/organizations/:org/:entity[/:id]` facade that exchanges the
  caller's bearer and re-enters the gate against the flat path.
  Headline isolation proven in `tests/api-org-isolation.test.ts`.
  - **Deviation (a) — org rides a verified token claim, not the
    path.** Point 6 froze "no org claim"; the user chose an `org`
    claim (set once at exchange) as the tamper-evident enforcement
    seam. The decorator reads `org` from the VERIFIED claim, never a
    caller-controlled path/query.
  - **Deviation (b) — multi-org membership via a `memberships` join,
    not `organization_id` on `members`.** A mid-execution requirement
    surfaced (switch orgs without re-auth; enumerate reachable orgs),
    so an identity must reach MANY orgs. `members` / `human_members` /
    `ai_members` STAY GLOBAL (member.id === identity.id preserved); a
    new `memberships` join `(id, identity_id, organization_id, at)` is
    the org-scoped covenant — the source of enumerate and the exchange
    member-check.
  - **Deviation (c) — the token embeds the reachable `orgs` list.**
    Alongside the active `org`, every issued/exchanged token carries
    `orgs: Id[]` (derived from `memberships` at mint); `Principal`
    gains `organizations`. `GET /organizations` (scoped to the
    caller's memberships) is the authoritative fresh enumerate source
    the `orgs` claim snapshots.
  - **DEFERRED:** per-org member profiles; the member-list-by-
    membership derivation (the members list is still global in SP-2);
    broad web-app migration to facade routes (only `admin.ts`
    migrated — the rest stay flat, stamping `DEFAULT_ORG` in their
    adapters as the single-org interim); org-aware roles
    (`currentRolesForInOrg`). Tenant isolation MUST NOT be relied on
    in a networked/multi-user context until the HMAC signing key lives
    server-side (inherited SP-3/5 constraint).
- **SP-6 Identity surface + multi-org completion — ✅ DONE**
  (executed 2026-06-04; 17 commits `3cc3a9d..7e39e55` on `master`,
  `./validate` green at every step). Landed: the identity-surface
  UI (pages `identities` / `identity-detail` / `identity-providers`
  / `identity-tokens` under one `identities` nav item, mirroring
  the member pages + presenters; adapters `getIdentities` /
  `getIdentityRoster` / `postIdentityCreation` on the GLOBAL spine,
  client-minted id + idempotent PUT, OFF the facade; PII erase
  targets `identity_pii` only); per-org roles (`currentRolesForInOrg`
  reads `role_grants.organization_id` — the column SP-2 wrote but
  nothing read — closing the cross-org privilege leak); the
  always-org-scoped request (`handleRequest` wraps `effective =
  orgScopedAdapter(adapter, org)` for every authenticated route);
  the member-list-by-membership derivation in the `members` route
  handler; the full facade migration (every org-owned web-app write
  adapter stops stamping `DEFAULT_ORG`; the server stamps from the
  verified token — `grep -rn DEFAULT_ORG web-app/` is empty); the
  honest header org-switcher (`org-switcher.ts` + `org-session.ts`,
  boot-always-scope in `core.ts`, shown only at ≥2 orgs, re-scopes
  via full reload); the two-org demo seed (`'1'` Stark Industries,
  `'2'` Wayne Enterprises) with per-human one-time credentials
  surfaced once on the snapshots page (the copy-all credential-
  reveal panel); empty bootstrap seeds org `'1'` only. Detailed
  plan + execution record:
  `docs/superpowers/plans/2026-06-04-sp6-identity-surface.md`.
  - **Deviations recorded during execution:** (a) the multi-org
    migration shipped as **always-scope `effective`** in
    `handleRequest` (every authenticated request is org-scoped, flat
    tokens via the `DEFAULT_ORG` bridge), NOT as a `shared.ts`
    facade-prefix seam that org-prefixes write resources — scoping
    at the one gate is uniform and leaves handlers unchanged; (b)
    per-org roles via `currentRolesForInOrg` (replaced
    `currentRolesFor` at all three call sites — one voice), reading
    the previously-written-but-unread `role_grants.organization_id`;
    (c) seed records cross-org coherence: the org-`'2'` Project Brief
    record was rebound from an org-`'1'` flow to the org-`'2'`
    `seed-flow-org2` so `flowOrg === recordOrg` and the binding stays
    visible behind the org fence; (d) two HIGH-severity security
    fixes landed during the final audit — `token-exchange` /
    `refresh` now honor token revocation before minting (a revoked-
    but-unexpired token could otherwise be laundered into a fresh
    pair), and `OrgScopedEntityStore` gained a **write-side** fence
    (`#assertWritable` 404s a write to a foreign-owned id, the
    write-side twin of the read fence).
- **All six sub-projects (SP-1..SP-6) are done.** The remaining
  work — real server-side HMAC signing, atomicity / Web Locks, the
  delegation policy, credential-mutation UI — is the server/Postgres
  tier (see Deferred / open).

## Sub-project 1 — Identity core (detailed; build first)

**Goal.** Rename `worker`→`member`, introduce the global identity
layer with zero id *value* churn, and establish PII isolation.

**Step 0 — pure rename** (separate commits, before any content change;
Office of the Commit: never rename and change content together).
`workers`→`members` table, `worker_id`→`member_id` (in `states`,
`idea_submissions`, the score tables, work-order claims),
`WorkerEntity`→`MemberEntity`, `HumanWorker`→`HumanMember`, the Workers
page → Members. Values are unchanged — `member_id` holds exactly the
ids `worker_id` held.

**New stores.**
- `identity` — stable, non-PII core: `id`, `kind` (`person` /
  `service`). The `id` is the universal key. `kind` is the PII axis
  (person has PII, service does not), NOT the auth mechanism — that
  is a client property (see SP-5).
- `identity_pii` — separate, independently deletable row keyed by
  identity id: display `name`, `email`, `phone`, `bio`. Erasing PII
  = splice this row; the `identity` + `member` + every `member_id`
  reference survive.

**The "add an entity store" pattern** (describe once; representative
files):
- `api/types.ts` — add `IdentityEntity`, `IdentityPiiEntity`, an
  `IdentityKind`; reuse the snake_case storage / camelCase domain
  split (see `HumanWorkerEntity` ~419 and the `HumanWorker` class
  ~430-557).
- `api/validators.ts` — add `validateIdentityEntity`,
  `validateIdentityPiiEntity`, reusing `asString` etc. Validate at the
  gate only.
- `api/db.ts` (interface ~132-202) — add `identities:
  EntityStore<IdentityEntity>` and `identityPii:
  EntityStore<IdentityPiiEntity>`.
- `api/db-localstorage.ts` (~117-160) and `api/db-memory.ts` —
  instantiate both stores with their validators (mirror the existing
  `workers`/`humanWorkers` instantiation).
- `api/api.ts` — add `route('identities', …)`,
  `route('identities/:id', …)`, `route('identities/:id/pii', …)` to
  the `routes` array, matching the existing `route()` style and the
  `validate*Entity(withoutId(payload))` gate pattern.
- `web-app/app/adapters/identities.ts` (new) — `getIdentity(ctx, id)`,
  `putIdentity(ctx, id, draft)`, `deleteIdentityPii(ctx, id)`, etc.
  `RequestContext` is the sole argument; verb-noun naming.
- `api/mock-data.ts` (~665, ~6267 `populateBootstrapData`) — create an
  `identity` + `identity_pii` for every seed member, `id === member.id`
  (including `current` and the `system` worker, `SYSTEM_WORKER_ID`
  ~404 — `system` becomes a canonical `service` identity).
- `SCHEMA.svg` — regenerate via `./generate-schema-svg`; the ERD is
  derived from `api/db.ts` + `api/types.ts`, and `./validate` runs
  `--check` and fails on drift. Commit the regenerated SVG with the
  schema change. (Found at execution — the seventh step of this
  ritual; sandbox gate is `TMPDIR=/tmp/claude ./validate`.)

**id-equality invariant.** New persons: identity created first, member
reuses the id. Seed data: identities created with `id ===` existing
`member.id`. No id *values* change — only the `worker_id → member_id`
name does (Step 0).

**PII split.** Move `human_workers.email` (+ `phone`, `bio`) and
`workers.name` into `identity_pii`. The member keeps the org *profile*
(`title`, `department`, `strengths`, `team_dimensions`; AI: `model`,
`skill_focus`). `DELETE /identities/:id/pii` uses the existing splice
path (`EntityStore.delete`, `api/store-entity.ts` ~135-150). Display
fallback for erased PII is modeled **at the call site**, never in a
helper (scripture: helpers shall not pretend absence) — e.g. header
greeting (`web-app/app/header-info.ts` ~25-31), sidebar
(`web-app/app/sidebar-worker.ts`).

**Reuse.** `generateCryptoSafeBase62`
(`web-app/app/adapters/crypto-safe-base62.ts`) for new ids;
`EntityStore`/`StateStore`; `serializeRecord` NOT-NULL gate
(`api/storage-serialize.ts`); `createRequestContext`
(`web-app/app/adapters/shared.ts`); `route()`/`matchRoute`;
`MemoryDbAdapter` (`api/db-memory.ts`) for tests.

**Migration note.** Migration discipline is not yet codified (the
Unwritten Scrolls) and snapshots wipe-first (pristine / mock / import).
So the backfill rides the bootstrap/snapshot path — pristine + mock
data generate identities alongside members; pre-existing localStorage
is handled by re-import. No in-place migration tier yet; real
migrations arrive with Postgres.

## Sub-projects 2–6 (sketched; detail each in its own spec)

- **3 Token gate.** JWT claim contract (`sub`/`roles`/`name`/`aud`/
  `cnf` + `iat`/`exp`/`nbf`/`jti`); access tokens are **short-lived**.
  Auth middleware at `handleRequest` (`api/api.ts` ~594) verifies the
  token (co-located key now; server key later), checks `exp`/`nbf` vs.
  current time and a per-identity **`revoked-before`** stamp (reject
  `iat <` stamp → log-out-everywhere), then populates identity into
  `RequestContext` (`web-app/app/adapters/shared.ts` — add `identity`
  per the Office of the Context: each field set once). Bearer required
  for all requests; `simulateLatency` already prices the boundary.
- **4 Authorization.** `role_grants` append-only ledger (id,
  identity_id, role, `granted|revoked`, by-member-id, at); current
  roles = latest action per (identity, role) — same discipline as
  `states`. Endpoint→required-roles policy; enforced in middleware.
- **5 Authentication.** A **`clients`** registry (allowed grant types,
  redirect URIs, JWKS, origin/`aud` — the "websites built by us and
  others"; also "know where they access from"). A single
  **`/authentication/token`** endpoint dispatching on `grant_type`:
  `authorization_code` (browser/computer-user), `client_credentials`
  via `private_key_jwt` (api/code), RFC 8693 `token-exchange`
  (delegation — the org-facade, agent-on-behalf-of-person), `refresh`.
  An interactive **`/authentication/authorize`** front door (passkey +
  provider-IdP + corporate-OIDC + password loop) that ONLY
  browser-capable clients use to obtain an auth-code. New stores
  `identity_providers` (identity_id, provider, provider_subject, at)
  and `identity_tokens` (append-only `issued`/`rotated`/`revoked`
  events; current validity = latest per `jti`). The endpoint mints a
  **short access token + a rotating refresh token**; presenting a
  rotated-away refresh `jti` triggers **reuse-detection** → revoke the
  chain. A per-identity `revoked-before` stamp powers
  log-out-everywhere. Crypto ceremony server-fulfilled later; the
  contract is designed now.
- **2 Tenancy.** Promote `organization` singleton → tenant root; add
  NOT-NULL `organization_id` to org-scoped entities (backfill to a
  default org so the single-org present keeps working). Add
  `/organizations/:id/<entity>/` facade routes that token-exchange a
  sub-request to the root store + the `organization_id` leakage guard.
  Thread org through facade calls only (not a global — derive
  per-request). Blast radius: ~50 routes, ~121 `ctx` call sites — but
  ordinary callers keep using flat resources; facades are additive.
- **6 Identity surface.** `/identities/:id` CRUD + `/pii` erasure +
  `/providers/:provider` + `/tokens` management UI/adapters/presenters.

## Doctrine constraints for implementers

- `RequestContext` is the **sole** argument to adapter methods.
- Presenters emit **SafeHtml**; no inline `style=""` (use CSS custom
  properties + classes); 78-char lines, 4-space indent.
- snake_case storage ↔ camelCase domain; HTTP-verb adapter naming
  (`getNoun`/`putNoun`/`deleteNoun`/`postNounOperation`).
- Validators at the gate, never downstream; columns NOT NULL (absence
  = absent row, not null); ledgers append-only (no edits, reversal is
  a new event).
- Any subagent prompt MUST begin with `Go to Church!` and be briefed
  on the patterns above.

## Verification

- **`TMPDIR=/tmp/claude ./validate` is the gate** (tsc `--noEmit` +
  `node --test --strip-types tests/*.test.ts` + 78-char lint +
  `./generate-schema-svg --check`). A failure ABORTS. `TMPDIR` is set
  because the SVG check runs `npx tsx` under the sandbox.
- **Per sub-project tests** (zero-dependency, via `MemoryDbAdapter`):
  - SP-1: creating an identity yields a worker-compatible id;
    `DELETE /identities/:id/pii` splices `identity_pii` while the
    `identity` + a `worker_id`-referencing state event survive;
    bootstrap creates identities for every seed worker incl. `system`.
    New `tests/adapters-identities.test.ts`, `tests/api-identities.test.ts`,
    plus validator cases (mirror existing `adapters-*`/`api-*` tests).
  - SP-2: root store rejects `?organization-id=X` when
    `entity.organization_id !== X` (the leakage guard); facade proxies
    correctly.
  - SP-3/4/5: middleware rejects missing/invalid token; role check
    gates endpoints; token-exchange yields `act`/`sub` claims.
- **Manual browser regression** (TEST-PLAN.md, HTTP-only via
  `TMPDIR=/tmp/claude ./serve 8080`): identity display + PII-erased
  fallback (SP-1); login → token (SP-3/5); org switch + isolation
  (SP-2). Add cases where a sub-project introduces DOM behavior.

## Deferred / open (named so they don't hide)

- **Settable per-identity default org** (replaces the global
  `DEFAULT_ORG` fallback — deferred to the END of the master plan,
  per direction). The shared global `DEFAULT_ORG` ('1') that a flat
  (un-exchanged) token bridges to is the smell: a privileged default
  every identity shares. Replace it with a default each identity can
  SET — an append-only `identity_default_orgs` ledger (latest-wins;
  the chosen org must be one of the identity's memberships). The gate
  and boot resolve a flat token's org to that set default → else the
  identity's primary (earliest) membership → else deny. On UI login
  the user is taken to their chosen default org. Removes the
  `DEFAULT_ORG` constant and every `?? DEFAULT_ORG` fallback (~12
  production sites; the ~180 test/seed literals become a local
  org-id name); the org-switcher gains a "set as default" control.
- Real cryptographic ceremony (passkey assertion, DPoP verify,
  PAR/JAR/RAR) — server-fulfilled; seam designed now.
- Credential **secret hashing + verification** — the SP-1
  `identity_credentials.secret` column stores opaque material
  UNHASHED at the seam (client-side localStorage, mock auth, no
  verification path yet; seeds are obvious placeholders). Hashing
  (argon2/bcrypt/scrypt) belongs WHERE verification lives — the SP-5
  server tier — co-located, never half-applied here (and bcrypt would
  violate the zero-runtime-dependency rule). SP-1 DOES enforce
  non-leakage now: `getIdentityCredentialState` returns only the
  active kinds, never the secret. Flagged by automated security
  review of the E1 commit; deferred per this scope, recorded so the
  gap cannot hide. **RESOLVED (SP-5):** hashed now with
  PBKDF2-HMAC-SHA256 (a zero-dep WebCrypto primitive) in a
  self-describing PHC string; verification lives in the
  `/authentication/authorize` password loop. The server tier swaps
  PBKDF2 → scrypt and deletes the verifier. See SP-5 entry,
  deviation (a).
- Token revocation *propagation* across independently-deployed
  resource servers, and atomic `identity_tokens` writes (the cross-tab
  shared-write hazard) — server-fulfilled. The model now: short access
  tokens + revocable rotating refresh + reuse-detection + per-identity
  `revoked-before` stamp. Contract designed; teeth added with the
  server tier.
- Auth contract modeled as OAuth 2.1 (shared `/token` + interactive
  `/authorize`); **GNAP (RFC 9635)** is the strategic end-state that
  natively unifies browser/api on one negotiated endpoint — revisit
  if/when its tooling matures.
- Computer-use agent acting for a person: `token-exchange` shapes
  `act`=agent, `sub`=person (BUILT in SP-5, both tokens verified). The
  DELEGATION POLICY — which actor may act-as which subject — is NOT yet
  enforced (the remaining seam); it lands with the server tier. See
  SP-5 entry, deviation (d).
- In-place migration tier — arrives with Postgres; backfill rides the
  snapshot/bootstrap path until then.
- Per-org *profile* divergence (different title per org) — YAGNI;
  would move the varying field onto a per-org row if a second org ever
  needs it.
- ~~`role_grants` ledger as its own table vs. riding the unified
  `states` log — decide in SP-4's spec.~~ **RESOLVED (SP-4):** own
  `HistoryEntityStore` table — see SP-4 execution entry, deviation (b).
- **Same-instant ledger ordering relies on append order (implicit;
  fragile at Postgres).** `currentRolesFor` (`api/authorization.ts`)
  and `latestRevocationAt` (`api/access-token.ts`) break a same-`at`
  tie by iteration order of `getAll()`. `nowUtc()` is
  millisecond-resolution, so two events can share an `at`; the later-
  appended row wins because `getAll()` returns insertion order on the
  single-writer memory/localStorage tier. This is correct today and
  pinned by the "same-instant" tie-break tests in
  `tests/authorization.test.ts` — but the ordering is implicit: a
  multi-writer Postgres tier whose `getAll()` has no guaranteed row
  order could break the tie wrongly, leaving a revoked role held (a
  security risk). The robust fix is an explicit
  `ORDER BY (at, <monotonic-key>)` on every ledger read, where the
  secondary key is a sortable sequence or ULID — NOT a content-hash
  ETag (a content ETag orders deterministically but not chronologically,
  so a revoke could lose to a grant). Apply ledger-wide
  (`role_grants`, `identity_credentials`,
  `identity_token_revocations`) for one consistent voice. Lands with
  the Postgres tier.

## Next step (all sub-projects executed)

SP-1 through SP-6 are all done (see Execution status). The forward-
modeled HTTP contract — global identity, real OAuth 2.1
auth/authz, the identity surface, and org-scoped multitenancy — is
in place over the client-side localStorage tier. SP-6 also closed
the two SP-2 follow-ons (member-list-by-membership derivation and
the full facade migration off `DEFAULT_ORG`). The remaining work is
the server/Postgres tier (see Deferred / open): server-side HMAC
signing (the only thing standing between demo-grade and production
isolation), real atomicity / Web Locks for the cross-tab shared-
write hazard, the delegation policy for `token-exchange`, the
explicit ledger `ORDER BY (at, <monotonic-key>)`, and in-place
migrations. Per-org member-profile divergence stays YAGNI until a
second org needs a differing field.

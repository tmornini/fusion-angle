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
   existence.

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
   `aud`/origin (which website), `cnf` (DPoP key) — **no org claim**.
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
- **SP-4, 5, 2, 6 — not started.** Next on the critical path:
  **{SP-4 Authorization, SP-5 Authentication}** (the `3 → {4,5}` fork).

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
  gap cannot hide.
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
- Computer-use agent acting for a person: own `service` identity via
  `token-exchange` (`act`=agent, `sub`=person) vs. completing the
  person's own interactive session — a delegation-policy choice,
  machinery already present (decide in SP-5's spec).
- In-place migration tier — arrives with Postgres; backfill rides the
  snapshot/bootstrap path until then.
- Per-org *profile* divergence (different title per org) — YAGNI;
  would move the varying field onto a per-org row if a second org ever
  needs it.
- `role_grants` ledger as its own table vs. riding the unified `states`
  log — decide in SP-4's spec.

## Next step (SP-1 executed)

SP-1 is done (see Execution status). The next sub-project on the
critical path is **SP-3 (Token gate)**. Invoke the writing-plans skill
to produce its detailed implementation plan from the SP-3 sketch above
— JWT claim contract (`sub`/`roles`/`name`/`aud`/`cnf` + `iat`/`exp`/
`nbf`/`jti`), short-lived access tokens; auth middleware at
`handleRequest` (`api/api.ts`) verifying the token + a per-identity
`revoked-before` stamp; `RequestContext.identity` populated once (the
Office of the Context); Bearer required on every request — then execute
it TDD-first against `TMPDIR=/tmp/claude ./validate`. SP-1's seams to
build on: the `identity` store, `member.id === identity.id`, and the
`identity_credentials` ledger (the possessed-secret facet a
`password` / `client_secret` grant verifies against — and where SP-5's
real hashing/verification lands).

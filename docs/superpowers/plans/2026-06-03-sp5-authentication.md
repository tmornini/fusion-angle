# SP-5 Authentication — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: implement this plan
> task-by-task, TDD-first. Every subagent prompt MUST begin with the
> literal phrase `Go to Church!` (loads the Church of Code scripture)
> and then be briefed on the Voice rules below. Tasks use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Land the OAuth 2.1 authentication surface on the existing
internal HTTP API: a `clients` registry, one `/authentication/token`
endpoint dispatching on `grant_type`, an interactive
`/authentication/authorize` front door, the `identity_providers`,
`identity_tokens`, and `authorization_codes` ledgers, a short access
token + rotating refresh token with reuse-detection, REAL signing
(HMAC-SHA256) and REAL credential hashing (PBKDF2-HMAC-SHA256), and
the credential surfacing + crypto-grade seed password deferred from
SP-4.

**Architecture:** SP-3 built the token gate; SP-4 built authorization.
SP-5 is the keystone that makes both trustworthy — it supplies the
front doors that mint tokens, the token lifecycle the gate consults,
and the real algorithms that replace the SP-3/SP-4 placeholders. Two
seams are FROZEN here so the eventual server tier is a key-location
swap + a one-time `scrypt`-replaces-`pbkdf2` cutover, never a format
or logic rewrite. The deployment constraint (client-shipped signing
key → trivial forgery) is REDUCED to "key location only," NOT
resolved — said honestly, never papered over.

**Tech Stack:** Vanilla TypeScript (ES2024, strict,
`noUncheckedIndexedAccess`), zero runtime deps. Crypto via WebCrypto
(`crypto.subtle`) — a zero-dependency platform primitive. Tests via
`node --test --strip-types`. Gate: `TMPDIR=/tmp/claude ./validate`.

---

## Context — why this change

The fusion-ai identity transformation runs the critical path
`1 → 3 → {4,5} → 2 → 6`. SP-1 (identity core), SP-3 (token gate), and
SP-4 (authorization) are DONE on `master` (`ec88791..ccf6ed0`). SP-5
(Authentication) is next — the `3 → {4,5}` fork, SP-4 already landed.

SP-5 supplies the OAuth 2.1 front doors, the token lifecycle, real
signing/verification algorithms, and the credential surfacing deferred
from SP-4. From the spec (`docs/superpowers/specs/
2026-06-02-identity-auth-multitenancy.md`, lines 351-368, 473-490):

- a `clients` registry (grant types, redirect URIs, JWKS, origin/`aud`)
- one `/authentication/token` endpoint dispatching on `grant_type` —
  `authorization_code`, `client_credentials` via `private_key_jwt`,
  RFC 8693 `token-exchange`, `refresh`
- an interactive `/authentication/authorize` front door (password loop
  real now; passkey / provider-IdP / corporate-OIDC as designed seams)
- new append-only ledgers `identity_providers`, `identity_tokens`,
  `authorization_codes`
- short access token + rotating refresh token with reuse-detection →
  revoke the chain
- credential surfacing after wipe-and-load + a crypto-grade seed
  password (the two SP-4 deferrals, deviation (f))

**User decisions for this engagement (LOAD-BEARING — do not
re-litigate):**

1. **Crypto = "both real via WebCrypto."** Replace the placeholder
   signature with real HMAC-SHA256, and store credentials as real
   PBKDF2-HMAC-SHA256 hashes. The goal is NOT current security (the
   signing key stays a client-shipped constant — forgery stays
   trivial, explicitly accepted) but a design that **fits perfectly
   when the API/DB break out to a server tier**: the token wire format
   and the credential storage format are frozen now; only the *key
   location* and *who-mints* move later.
2. **The signing key STAYS a client-shipped constant.** The deployment
   constraint is REDUCED, NOT RESOLVED — Phase 6 does not resolve it;
   say so honestly.
3. **PBKDF2 is TRANSITIONAL — eliminated when scrypt lands**, not a
   permanent coexisting algorithm.

**Intended outcome.** A complete, validate-green OAuth 2.1 auth surface
on the existing internal HTTP API, with real algorithms and final data
shapes, such that the eventual server tier is a key-location swap + a
one-time `scrypt`-replaces-`pbkdf2` cutover, never a format or logic
rewrite.

## The two frozen seams (what survives the server-tier breakout)

**1. Token signing — `api/access-token.ts`.** Real HMAC-SHA256 via
`crypto.subtle` over the unchanged three-segment `head.body.sig` JWT
(alg `HS256`, `kid` retained). WebCrypto is async, so the crypto choke
points go async; decode stays sync (see the async split). Future
server tier changes only where the key bytes come from (client
constant → server secret/KMS) and who mints (browser →
`/authentication/token`). No caller signature changes.

**2. Credential storage — `api/password-hash.ts` (new).** Self-
describing PHC / modular-crypt string in the existing
`identity_credentials.secret` column (no new column, no schema drift):

```
$pbkdf2-sha256$i=<iterations>$<b64url-salt>$<b64url-digest>
```

The interface is the divorce point:

```
hashPassword(plaintext): Promise<string>            // PHC out
verifyPassword(plaintext, storedPhc): Promise<boolean>
```

`verifyPassword` parses the embedded algo-id + params and **dispatches
through a registry of per-algo verifiers** — each a self-contained,
deletable unit. `hashPassword` always uses a single
`CURRENT_PASSWORD_HASH` algorithm. `verifyPassword` degrades to `false`
on a malformed stored string (never throws — a bad column must not
crash a login).

**PBKDF2 elimination at scrypt cutover (the user's directive).** At the
server tier, `CURRENT_PASSWORD_HASH` flips to `scrypt` (Node built-in
`crypto.scryptSync` — a zero-dependency platform primitive,
memory-hard). During a bounded window the PBKDF2 verifier stays so any
`$pbkdf2-sha256$` row verifies-then-rehashes on next login; the self-
describing prefix makes "any PBKDF2 rows left?" a decidable query. Once
none remain — **immediate here, because credentials are seed data and
snapshots wipe-first** — the PBKDF2 verifier module + its registry
entry are **deleted**. PBKDF2 never coexists permanently. The module is
structured now so that deletion is one registry edit + one file
removal. The module doc comment states this cutover.

## Key decisions

- **Store kinds** (deliberate, per codebase patterns):
  - `clients` → `EntityStore<ClientEntity>` (mutable config of record:
    redirect URIs change, JWKS rotate, a client is disabled — like
    `flows`/`members`, not an event ledger).
  - `identity_providers`, `identity_tokens`, `authorization_codes` →
    `HistoryEntityStore` (append-only events; current state = latest
    action per key — like `identity_credentials` / `role_grants`).
- **The async split.** `signAccessToken`, `verifyTokenSignature`,
  `mintAccessToken`, `verifyAccessToken` become async;
  `decodeAccessToken`, `principalFromToken`, `latestRevocationAt`,
  `revokedBeforeSeconds` stay sync (decode/reduce only). This keeps
  `createRequestContext` / `sessionContext` synchronous; the ripple is
  contained to minting + the already-async gate.
- **`getSessionToken()` stays sync.** Lazy async mint in a sync getter
  is impossible; instead an async `ensureSessionToken()` pre-seeds the
  per-tab holder (anonymous default) on the boot path, and
  `establishSession` goes async. `getSessionToken()` returns the
  already-minted string.
- **Two revocation mechanisms, distinct roles** (both consulted at the
  gate): `identity_token_revocations` = coarse per-identity log-out-
  everywhere (kept, unchanged); `identity_tokens` = fine per-jti /
  per-chain lifecycle + refresh reuse-detection.
- **Grant-first / no-op-on-failure.** `/authentication/token` and
  `/authentication/authorize` go in `BEARER_EXEMPT_ROUTES` but
  authenticate the presented grant BEFORE any side effect; a failed
  grant appends zero rows and mints nothing. `clients`,
  `identity-providers`, `authorization-codes` stay FULLY gated admin
  CRUD; each exemption lands in the same commit as its handler (no
  dangling exempt route).
- **Deployment constraint is NOT resolved here.** Real HMAC with a
  client-side key is still forgeable. The constraint is carried
  forward, documented, now reduced to "key location only." Honesty over
  a comforting claim.

## Reuse (existing functions/patterns — do not reinvent)

`generateCryptoSafeBase62` (ids/jti/seed-pw),
`base64UrlEncode/Decode` + new raw-byte siblings, `HistoryEntityStore`
/ `EntityStore` / `MemoryDbAdapter`, the two-gate `route()` +
`validate*Entity(withoutId(payload))` pattern, `createRequestContext` +
`RequestContext` vessel, `seedRootAdmin` + `devToken` fixtures,
`appendCredentialEvent` (adapter ledger-write template, `role-grants.ts`
/ `identity-credentials.ts`), `html`` ` + `SafeHtml` + `setHtml`
(presenter output), `nowUtc`. The "add a store" pattern is one unit:
`types.ts` → `validators.ts` → `db.ts` (interface + `TABLE_NAMES`) →
`db-memory.ts` + `db-localstorage.ts` → `api.ts` routes →
`web-app/app/adapters/<noun>.ts` vessel adapter → regenerate
`SCHEMA.svg`.

## Voice rules (push down to EVERY subagent)

- 78-char max line length; 4-space indent; no trailing whitespace;
  final newline. No inline `style="…"` (CSS classes / custom
  properties).
- snake_case storage ↔ camelCase domain.
- `RequestContext` is the SOLE argument to web-app adapter methods.
  HTTP-verb adapter naming: `getNoun` / `putNoun` / `deleteNoun` /
  `postNounOperation`. Multi-noun operations: `postOperation` composed
  from single-noun primitives.
- Validators at the gate, never downstream. Ledgers append-only: a
  revoke / rotation is a NEW row, never a splice or edit.
- Present-tense imperative commit subject (~50 chars), no body. End
  every commit with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context)
  <noreply@anthropic.com>`.
- Commandments in play: **I Reliability**, **II Security**, **VI
  Immutability** (append-only ledgers), **VII Idempotency** (PUT by
  id). Articles: **derive from the ledger**, **insulation through
  adapters** (the two frozen seams ARE divorce points). Abominations to
  avoid: **Null / Default Values** (no `?? ''` masking a missing
  requirement), **Internal Defense**, **Swallowed Failures** (a network
  timeout is expected; an impossible state crashes), **Greedy Catch**
  (one try, one call).
- Never move + change content in one commit. `SCHEMA.svg` regenerates
  in its OWN commit whenever `db.ts`/`types.ts` add a store.
- The hard gate after EVERY task: `TMPDIR=/tmp/claude ./validate` (tsc
  `--noEmit` + `node --test --strip-types tests/*.test.ts` + 78-char
  lint + `./generate-schema-svg --check`). A failure ABORTS.

---

## File map

**Create**
- `api/crypto-safe-base62.ts` — moved from `web-app/app/adapters/`.
- `api/password-hash.ts` — `hashPassword` / `verifyPassword`, PHC,
  registry-of-verifiers.
- `api/identity-tokens.ts` — pure chain reduce (live jtis, chain walk,
  replay detection).
- `web-app/app/adapters/identity-tokens.ts` — token-lifecycle vessel
  adapter.
- `web-app/app/adapters/clients.ts`,
  `web-app/app/adapters/identity-providers.ts`,
  `web-app/app/adapters/authorization-codes.ts` — vessel adapters.
- `web-app/app/adapters/authentication.ts` — the front-door facade
  (`postAuthorize`, `postToken`, `establishSession` driver).
- `web-app/app/presenters/credential-reveal.ts` — one-time reveal
  panel (SafeHtml).
- New test files: `password-hash`, `credential-surfacing`,
  `identity-tokens-reduce`, `adapters-identity-tokens`,
  `adapters-clients`, `adapters-identity-providers`,
  `adapters-authorization-codes`, `api-authentication-token`,
  `api-authentication-authorize`, `presenter-credential-reveal`.

**Modify**
- `api/base64url.ts` — `bytesToBase64Url` / `base64UrlToBytes`.
- `api/access-token.ts` — async sign/verify/mint; real HMAC-SHA256;
  add `act?: { sub: Id }` to `AccessTokenClaims` (token-exchange).
- `web-app/app/adapters/init.ts` — `ensureSessionToken`; async
  `establishSession`; async `mintSessionToken`.
- `web-app/auth/index.ts`, `web-app/app/core.ts` — await the async
  session path.
- `api/types.ts`, `api/validators.ts`, `api/db.ts`, `api/db-memory.ts`,
  `api/db-localstorage.ts`, `api/api.ts` — the four new stores +
  routes + the OAuth endpoints + `BEARER_EXEMPT_ROUTES`.
- `web-app/app/adapters/identity-credentials.ts` — hash before append.
- `api/mock-data.ts` — crypto-grade hashed seed admin password; carry
  it back through the load handlers' POST return channel.
- `web-app/app/adapters/snapshots.ts`, `web-app/snapshots/index.ts`,
  `web-app/app/styles/pages-snapshots.css` — surface the reveal once.
- `tests/token-fixtures.ts`, `tests/session-holder.test.ts`,
  `tests/access-token.test.ts`, `tests/api-token-gate.test.ts`, and
  every gate-traversing test caller of `devToken` — async conversion.
- `SCHEMA.svg` (regenerated per store-add), `SCHEMA.md` (four new
  table sections).
- `docs/superpowers/specs/2026-06-02-identity-auth-multitenancy.md` —
  SP-5 status + deviations.

**Task 0 — persist this plan.** First commit: write this plan to
`docs/superpowers/plans/2026-06-03-sp5-authentication.md` and commit
(`Add SP-5 authentication implementation plan`).

---

## Phase 0 — Plan doc + shared foundations

- [ ] **Write the committed SP-5 plan doc** (this file). Commit.
- [ ] **Move crypto-safe-base62 into `api/`** (move-only). So `api/`
  (seeds, gate) can generate ids/jti/seed-pw without importing upward
  from `web-app/`. Update all 16 importers; no content change.
  `git mv` so the move is recorded as a rename. Separate commit; never
  move + change content together.
- [ ] **Add raw-byte base64url round-trip.** `bytesToBase64Url` /
  `base64UrlToBytes` in `api/base64url.ts` (MACs are bytes). Test
  first: round-trips arbitrary `Uint8Array` incl. high bytes (0xFF),
  empty, and a known vector.

## Phase 1 — Real crypto (token signing + password module)

- [ ] **Make token sign/verify asynchronous (signatures only).** Wrap
  the four crypto functions (`signAccessToken`, `verifyTokenSignature`,
  `mintAccessToken`, `verifyAccessToken`) in Promises, still returning
  the constant; `await` at the one gate callsite; convert
  `token-fixtures.ts` (`devToken`/`expiredToken`/`notYetValidToken`
  become async) + EVERY test caller in this ONE commit so the tree
  never half-compiles. (Largest mechanical risk — isolate it.) Test:
  the existing access-token + gate suites pass against the awaited
  fixtures.
- [ ] **Pre-seed the session-token holder asynchronously.**
  `ensureSessionToken()` (async, mints the anonymous default into the
  holder) + async `establishSession`; login (`web-app/auth/index.ts`)
  and boot (`web-app/app/core.ts`) await; `getSessionToken()` stays
  sync and returns the already-minted string (no lazy mint). Update
  `tests/session-holder.test.ts` to await `ensureSessionToken()`.
- [ ] **Sign access tokens with real HMAC-SHA256.** `importKey('raw',
  …, {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify'])` memoized
  as a one-time key handle; `subtle.sign` produces the MAC bytes →
  `bytesToBase64Url`; `subtle.verify` is the constant-time primitive
  (no hand-rolled compare). Test: a minted token verifies; a one-byte
  tamper of the body fails for a REAL signature reason.
- [ ] **Password module `api/password-hash.ts`** (TDD). Tests first:
  round-trip (hash then verify true), wrong-password→false, salt-
  uniqueness (two hashes of same pw differ), malformed-stored→false
  (no throw), embedded-param dispatch (a hand-built PHC with known
  params verifies). Then `hashPassword` + `verifyPassword` with named
  constants (`PBKDF2_ITERATIONS` = 600_000, `SALT_BYTES` = 16,
  `DIGEST_BITS` = 256, `ALGO_ID` = `'pbkdf2-sha256'`,
  `CURRENT_PASSWORD_HASH`), registry-of-verifiers dispatch keyed on the
  PHC algo-id, `crypto.subtle.verify`-style constant-time digest
  compare via re-derive + `subtle`-safe equality. Module doc comment
  states the **scrypt-replaces-then-deletes-PBKDF2** cutover.

## Phase 2 — Credential hashing + surfacing (self-contained slice)

- [ ] **Hash credential secrets before append.** `await hashPassword`
  inside the credential-append path in
  `web-app/app/adapters/identity-credentials.ts` (and `client_secret`
  — uniformity); validator unchanged (a PHC string is still a string;
  a format check there would be internal defense at the wrong gate).
  Test: stored secret starts `$pbkdf2-sha256$`, ≠ plaintext, and
  `verifyPassword(plaintext, stored)` is true;
  `getIdentityCredentialState` still never leaks `secret`.
- [ ] **Return seed password from load handlers.** `snapshots/mock-
  data` + `snapshots/bootstrap` handlers + `populateMockData` /
  `populateBootstrapData` + the snapshots adapter carry `{
  adminUsername, adminPassword }` through the existing POST return
  channel (plaintext lives only in the response + DOM, never a column).
- [ ] **Seed admin with a crypto-grade hashed password.** Replace the
  fixed placeholder: generate via `generateCryptoSafeBase62`,
  `hashPassword` into `secret`, return the plaintext. Update any test
  asserting the old placeholder in the same commit.
- [ ] **Style + surface the one-time reveal.** `.credential-reveal`
  class in `styles/pages-snapshots.css` (tokens via `hsl(var(--…))`,
  no inline style); new `presenters/credential-reveal.ts` (escapes via
  `html`` `, never `trusted`); `web-app/snapshots/index.ts` renders the
  panel once on the post-load path (acknowledge-then-navigate). Test
  the presenter (shows username + plaintext once; HTML-escapes a
  hostile password).
- [ ] **`seedRootAdmin` verifiable password** (only if the OAuth
  password-loop test needs it): store `hashPassword(<fixed test pw>)`,
  export the known plaintext.

## Phase 3 — identity_tokens lifecycle

- [ ] **Add identity-token types + validator.** Action union
  `issued | rotated | revoked`; row `{id, jti, identity_id, action,
  chain_id, parent_jti, at}` — all NOT NULL, `parent_jti: ''` for a
  chain root is a self-disclosing empty (not null).
- [ ] **Register the identity-tokens store + routes + SCHEMA.**
  `HistoryEntityStore`; routes `identity-tokens` +
  `identity-tokens/:id`; regenerate `SCHEMA.svg` (own commit) — confirm
  `jti` / `parent_jti` / `chain_id` draw NO spurious FK edge.
- [ ] **Reduce the ledger to live jtis** (pure, `api/identity-
  tokens.ts`): latest-action-per-jti, chain walk by `parent_jti`,
  replay detection (a `rotated`/`revoked` jti presented again).
- [ ] **Token-lifecycle vessel adapter**
  `web-app/app/adapters/identity-tokens.ts`: `postTokenIssue` (issued
  root, `parent_jti: ''`), `postTokenRotation` (rotate a live jti →
  `rotated`(old) + `issued`(new); replay of a rotated-away jti → append
  `revoked` for the whole `chain_id`), `postTokenRevocation`,
  `getTokenChainState`. Two-append rotation via `ctx.commit` (atomic
  pair). Tests: rotation appends two rows; replay revokes the chain;
  ZERO-on-failure.
- [ ] **Deny access tokens revoked in the token ledger** at the gate
  (one added `await` + check in `authenticateRequest`; tested beside
  log-out-everywhere). A jti whose latest action is `revoked` → 401.
- [ ] **Document the cross-tab shared-write hazard** for
  `identity_tokens` as a code comment at the ledger seam (mirroring the
  `ccf6ed0` precedent) — real atomicity arrives with Postgres.

## Phase 4 — Registries

For each (`clients` = EntityStore; `identity_providers` = History;
`authorization_codes` = History), run the "add a store" unit:
types+validator → register store + `TABLE_NAMES` → routes → SCHEMA
regen (own commit) → vessel adapter — each as tiny commits with
validator + gate-round-trip + anonymous-401 tests.

- [ ] **clients** — `EntityStore<ClientEntity>`. Row `{id,
  grant_types, redirect_uris, jwks, aud, status}` (arrays stored as
  declared; `status: active|disabled`). Vessel adapter
  `getClient`/`putClient`/`deleteClient`.
- [ ] **identity_providers** — `HistoryEntityStore`. Row `{id,
  identity_id, provider, provider_subject, action: linked|unlinked,
  at}`. Adapter `postProviderLink`/`postProviderUnlink`/
  `getProvidersFor`.
- [ ] **authorization_codes** — `HistoryEntityStore`. Row `{id,
  identity_id, client_id, status: issued|consumed, at}` — `id` is the
  opaque code; consumption appends `consumed`; replay detected by
  latest-per-code. Adapter `postCodeIssue`/`postCodeConsumption`/
  `getCodeState`.

## Phase 5 — OAuth endpoints

- [ ] **`/authentication/token` dispatcher** (`postOperation` composed
  from single-grant primitives). Add to `BEARER_EXEMPT_ROUTES` + a
  tested 400-skeleton first (unknown `grant_type` → 400, ZERO side
  effects), then one primitive per commit:
  - `authorization_code` — consume an `issued` auth code → issue token
    pair; replayed/unknown code → 401 clean no-op.
  - `refresh` — rotate via the identity-tokens adapter; replay → chain
    revoked + 401.
  - `token-exchange` (RFC 8693) — shape `sub` = subject,
    `act = {sub: actor}`; requires adding `act?: {sub: Id}` to
    `AccessTokenClaims` (shared edit, sequenced here). Tested: the
    decoded token carries act/sub AND passes the gate.
  - `client_credentials` via `private_key_jwt` — look up the client,
    structural-validate the assertion against its JWKS (real JWS verify
    is a documented SEAM, spec 418-419) → issue.
  Every primitive: validate body at the gate, authenticate the grant,
  THEN the single issue call. Each minted token passes the SP-3 gate
  (asserted by using it as a Bearer on a protected route).
- [ ] **`/authentication/authorize` front door**: add to exempt set +
  a tested method-dispatch skeleton; then **the real password loop** —
  reduce `identity_credentials` to the current password →
  `verifyPassword` → issue an auth code; wrong password → 401, no code
  (clean no-op). `passkey` / `provider` / `oidc` branches throw a
  documented `501` seam, each pinned by a test.

## Phase 6 — Wire the real session flow

- [ ] **Establish session via the front doors.** `establishSession`
  drives `/authentication/authorize` (password) →
  `/authentication/token` (`authorization_code`) to obtain the real
  signed access + refresh pair (per-tab holder); new
  `web-app/app/adapters/authentication.ts` vessel facade. The flow +
  algorithm are now real; the **deployment constraint persists**
  (client-side key) and is restated in the seam comment — lifted only
  with the server tier.

## Phase 7 — Verification

Full `TMPDIR=/tmp/claude ./validate` green; `SCHEMA.svg` current;
browser regression (below). Record SP-5 done in the spec; record the
deviations.

## Spec deviations to record (in plan doc + spec)

- **Client-side PBKDF2 hashing now** (SP-1 deferred all credential
  hashing to the server tier, citing no zero-dep KDF). PBKDF2-HMAC-
  SHA256 IS a zero-dep WebCrypto platform primitive, so the deferral's
  reason is satisfied without the server. The server tier later
  **replaces** PBKDF2 with scrypt and **deletes** it (the user's
  directive), additive via the self-describing format — not a
  migration.
- **Deployment constraint reduced, not resolved.** Real HMAC with a
  client-shipped key remains forgeable; the constraint is carried
  forward, now "key location only."
- **token-exchange / private_key_jwt / passkey / provider-IdP /
  corporate-OIDC / DPoP are DESIGNED SEAMS** — structural now, real
  asymmetric crypto deferred to the server tier; each pinned by a test
  (501 or structural).

## Risks

1. **Async ripple (highest).** `devToken`/fixtures are imported widely;
   convert fixtures + all callers in ONE commit; verify with full
   `./validate`, not just `tsc`.
2. **`getSessionToken` sync trap.** Pre-seed the holder
   (`ensureSessionToken`) or every `sessionContext()` breaks at
   runtime — the subtlest correctness hazard.
3. **`crypto.subtle` under `node --test --strip-types`.** Node 20+
   exposes WebCrypto globally; await the key-import (no floating
   promise).
4. **Grant-first ordering.** No-op-on-failure tests assert ZERO ledger
   rows appended on failure — that's the teeth.
5. **BEARER_EXEMPT correctness.** Only the two front doors exempt; each
   lands with its handler; tests pin the audited surface.
6. **Cross-tab shared-write hazard** on `identity_tokens` /
   `authorization_codes` — documented, not papered over.
7. **SCHEMA drift.** Every `db.ts`/`types.ts` store-add gets its own
   regen commit; `--check` is the gate.
8. **`act` claim shared edit** to `access-token.ts` — sequenced in the
   token-exchange task (sequential execution, no real collision).

## Verification (end to end)

- **Gate after every commit:** `TMPDIR=/tmp/claude ./validate` (tsc
  `--noEmit` + `node --test --strip-types tests/*.test.ts` + 78-char
  lint + `./generate-schema-svg --check`). A failure ABORTS.
- **New test files** (zero-dep, `MemoryDbAdapter`): `password-hash`,
  `credential-surfacing`, `adapters-identity-tokens`,
  `identity-tokens-reduce`, `adapters-clients`,
  `adapters-identity-providers`, `adapters-authorization-codes`,
  `api-authentication-token` (incl. token-exchange act/sub + each grant
  mints a gate-valid token + grant-failure no-op),
  `api-authentication-authorize` (password loop + seam 501s),
  `presenter-credential-reveal`, plus extensions to
  `adapters-identity-credentials`, `adapters-snapshots`, the seed test,
  and the async conversions across `access-token`, `api-token-gate`,
  `token-fixtures`, `session-holder`.
- **Manual browser regression** (`TMPDIR=/tmp/claude ./serve 8080`,
  `claude-in-chrome`): (a) login → token end-to-end via the real
  password through `/authentication/*`; (b) wipe-and-load surfaces
  `demo@example.com` + a 22-char password exactly once, the panel
  focusable / contrasty, and the stored `identity_credentials` secret
  reads back as `$pbkdf2-sha256$…` (never the surfaced plaintext);
  (c) refresh rotation + replay → chain revoked; (d) the SP-4
  revoke→403→restore demo still passes.

## Self-review

- **Spec coverage:** `clients` registry ✓; single `/authentication/
  token` grant dispatch ✓ (authorization_code, refresh, token-exchange,
  client_credentials); interactive `/authentication/authorize` ✓
  (password real, passkey/provider/oidc seams); `identity_providers` +
  `identity_tokens` + `authorization_codes` ledgers ✓; short access +
  rotating refresh + reuse-detection → chain revoke ✓; real HS256
  signing ✓; real PBKDF2 credential hashing ✓; credential surfacing +
  crypto-grade seed password ✓.
- **Doctrine:** RequestContext sole adapter arg ✓; validators at the
  gate ✓; ledgers append-only (rotation/revoke = new rows) ✓;
  snake_case ↔ camelCase ✓; HTTP-verb adapter naming ✓; the two frozen
  seams are adapter divorce points (insulation) ✓; no null / sentinel /
  default-masking (`parent_jti: ''` is a self-disclosing empty,
  `verifyPassword` returns a real boolean) ✓; grant-first =
  authenticate-then-act, failure is a clean no-op (atomicity) ✓.
- **Honesty:** the deployment constraint is reduced, NOT resolved —
  stated in the seam comments and the spec deviation ✓.
- **Execution order soundness:** 0 (foundations, no behavior change) →
  1 (real crypto, async ripple isolated) → 2 (credential slice) → 3
  (token lifecycle) → 4 (registries) → 5 (endpoints, grant-first) → 6
  (wire the real flow) → 7 (verify + record). Every commit green; each
  exempt route lands with its handler; each store-add regenerates
  `SCHEMA.svg` in its own commit.

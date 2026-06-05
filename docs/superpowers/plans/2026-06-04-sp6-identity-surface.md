# SP-6 — Identity Surface + Multi-Org Completion

> Deliverable target on approval:
> `docs/superpowers/plans/2026-06-04-sp6-identity-surface.md`
> (mirrors the SP-2 / SP-5 plan convention).

## Context

SP-1..SP-5 are done. SP-2 built the multi-org machinery — the
`org`/`orgs` claims, the `memberships` join, `enumerateMyOrgs`,
the `/organizations/:org/...` facade, and `orgScopedAdapter` —
**explicitly for SP-6 to consume**, but nothing consumes it yet.
By the scripture's own *Sin of Premature Generalization*, an
abstraction with no consumer is premature; this phase redeems
that SP-2 investment.

The user chose a combined scope: **SP-6 (the identity surface +
an honest org-switcher) AND the SP-2 multi-org follow-ons (full
facade migration, member-list-by-membership, per-org roles)** —
plus a two-org demo seed and a demo-credentials panel.

A five-slice design fan-out (read-only Plan architects) verified
every load-bearing claim against source and **corrected the brief
in four evidence-backed ways** (see *Corrections*). Those
corrections are binding.

### The central honesty constraint

A switcher that flips the token's `org` while the web-app still
reads flat/global and writes `DEFAULT_ORG` would show "you're in
Org B" over Org A's data — a *comfortable lie* (Clarity / *Sin of
Obscurity*). An honest switcher therefore requires the full
follow-on set: derive members by membership, migrate every write
to the facade, seed a real second org, and close the per-org role
leak. That coupling is why "1 & 3" is one phase, not two.

## Corrections (the brief vs. the source)

The recon half-found three things; the design verified the truth.
These supersede the original brief:

1. **No server POST creation routes.** Every creation in this
   codebase is *client-minted UUID + idempotent PUT* (Commandment
   VII; `tests/api-identities.test.ts:66` pins "PUT then GET
   round-trips"). The brief's "POST creation routes / server mints
   uuid" is **rejected**. `postIdentityCreation` is a PUT-backed
   web-app adapter, not a server route.
2. **The open gate is the snapshot *importer*, not the write
   path.** Validators ARE wired at store construction
   (`api/db-memory.ts:170-214`, `db-localstorage.ts:177-217`). The
   unguarded edge is `api/snapshot-validator.ts:41-112`, whose
   switch silently no-ops for nine identity/auth tables — they
   import **unvalidated**. That is the real fix.
3. **facade-POST is already wired** (`facadeRequest` forwards POST
   bodies, `api/api.ts:905`; the POST case runs against the
   org-scoped `effective` adapter, `api.ts:1097-1122`). So this is
   *verify-first*: prove it with a test; add code only if red.
4. **Full migration ⇒ the app always holds an org-scoped token.**
   A flat token makes a *single-org* member see *all* orgs' data
   merged (the base adapter ignores org). So boot must **always**
   establish an active org — there is no honest "unscoped default"
   once the migration lands.

## Locked decisions (do not relitigate)

| # | Decision |
|---|---|
| 1 | **Per-org roles now.** `currentRolesForInOrg` closes the cross-org privilege leak (`role_grants.organization_id` is written but read by nothing on the gate path). |
| 2 | **Identity UI: separate pages** (identities / providers / tokens), but **one "Identities" nav item** — providers/tokens are reached from the identity detail (`sidebarKey:'identities'`). |
| 3 | **Create dialog: person + service identities** (person → identity+PII; service → identity+`client_secret` credential, no PII). |
| 4 | **Full facade migration** — every org-owned web-app write adapter stops stamping `DEFAULT_ORG`; the server stamps from the verified token. |
| 5 | **Seed: only Tony Stark (`current`) is multi-org and admin** (member + admin in BOTH orgs). Every other identity is single-org, non-admin, but **login-capable**. |
| 6 | **Fresh base62 password per seeded human per wipe-and-reload**, hashed into storage, plaintext returned in-band. |
| 7 | **Demo-credentials panel** on snapshots wipe-and-reload: every seeded identity's email+password in a monospace box with a single copy-all icon. |
| 8 | **Boot always scopes** to an active org (single-org → their org; multi-org Tony → persisted choice, else `DEFAULT_ORG`). Switch re-scopes via full reload. |

### Carried constraints (restate in doc comments where touched)

- **HMAC signing key is client-shipped** (`api/access-token.ts:68-71,
  85-103`): the org fence is only as strong as a forgeable
  signature. NOT production-grade tenant isolation until the key
  is server-side. This phase *reduces* the leak; it does not close
  it.
- **Cross-tab shared-write hazard** (CLAUDE.md): `states`,
  `identity_tokens`, `organizations`, and the new
  `fusion.active-org` key are racy across tabs; second `setItem`
  clobbers. Real atomicity arrives with Postgres. Do **not** add an
  app-layer lock (*Sin of simulating atomicity*).
- **`generate-schema-svg` pluralizes `*_id`** to derive FK
  targets: no new table is introduced (org-2 is a new *row*), so
  `--check` stays stable.

## The seams (per slice)

**A — Identity API surface.**
- Close the snapshot-import gate: add nine `switch` cases to
  `validateSnapshotRow` calling the already-exported
  `validateIdentity*` / `validateClient*` / `validateRoleGrant*` /
  `validateAuthorizationCode*` (`api/validators.ts:612-881`).
- Verify facade-POST via a `records-multi-put` facade test.
- `postIdentityCreation` web-app adapter: client-minted id +
  idempotent PUT; **global spine, no `organization_id` stamp**.

**B — Per-org roles (security).** Divorce point is the
role-evaluation function, not the gate plumbing.
`currentRolesForInOrg(rows, identityId, org)` = the exact
latest-action-wins reduce of `currentRolesFor`
(`api/authorization.ts:14-37`) with one added predicate beside the
identity filter: `if (row.organization_id !== org) continue;`,
preserving the `row.at >= prev.at` secure tie-break. The gate
reads the **verified** `principal.organization` (the token claim,
never the path); flat callers fall back to `DEFAULT_ORG` as an
**explicit named-constant call-site fallback** (a documented
bridge, not a helper default). Replace `currentRolesFor` at all
three call sites (one voice).

**C — Member-list-by-membership + full facade migration.**
- The member join lives in the **`api.ts` route handler**: derive
  `members WHERE id ∈ {memberships.identity_id}` off `effective`
  (org-fenced under the facade, global under a flat token — no
  branch). NOT a store wrapper (`members` has no `organization_id`),
  NOT a presenter (would leak the full roster first).
- Migration pattern (uniform, mirrors `admin.ts`): the adapter
  **stops sending `organization_id`** and prefixes its write
  resource with `organizations/${activeOrg}/`; `OrgScopedEntityStore
  .#stamp` writes the org server-side. Apply via **one shared seam**
  in `web-app/app/adapters/shared.ts` (org-prefix when the session
  token carries an org), not 8 copies (Commandment IX).
- `role-grants.ts` migrates **first** (authz-critical).
  `projects.ts` is the anomaly (round-trips `organization_id` from
  a prior GET — narrow the `Omit` and fix its two callers).
  `record-attributes.ts` must migrate (org-fenced though absent
  from the original enumerate).

**D — Identity UI (three pages, one nav item).** PAGE_REGISTRY
entries mirroring `members`/`member-detail`: `identities`
(`inSidebarNav`), `identity-detail` + `identity-providers` +
`identity-tokens` (`sidebarKey:'identities'`, `searchable:false`).
Shell+slot+SafeHtml presenters mirroring `human-member-detail.ts`;
PII via the `MemberPii` tagged union with the erased fallback at
the **call site** (no helper pretends absence; no `'Unknown'`
magic string). Named-gap adapters: `getIdentities`,
`getIdentityRoster` (single-pass join of identities+PII),
`postIdentityCreation` (commit identity row + person-PII **or**
service-`client_secret`), `getProviderEvents`, `getTokenChainsFor`.
**Create stays OFF the facade** — identity stores are global.

**E — Org-switcher + two-org seed.**
- The held session token is the single client-side org vessel.
  Switch = `postOrgSessionExchange(ctx, org)` → real
  `token-exchange` (membership-fenced; 403 mints nothing) →
  `setSessionToken`. The dropdown's render gate is
  `enumerateMyOrgs` (fresh from memberships), shown only at ≥2 orgs.
- Persist the **org id** (not the token) under `fusion.active-org`
  via `preferences.ts`; boot re-exchanges (sidesteps the 15-min
  TTL). Boot **always** resolves an active org and installs a
  scoped token before first render.
- Seed: `ORG_TWO = '2'` named constant; deterministic `assignOrg`;
  a second `organizations` row (distinct company); `current` gets
  a second membership + admin grant in `'2'`; non-admin identities
  partitioned single-org across both; every seeded human gets a
  fresh base62 password credential; work orders + `flow_work_orders`
  + their parent flows stay in `'1'` (coherence + storage trim).

**F — Demo credentials panel.** EXTEND the existing
single-admin in-band reveal (`seedAdminCredentials`,
`api/mock-data.ts:419-448`; `credentialRevealPanel`,
`web-app/app/presenters/credential-reveal.ts`) to **all**
login-capable seeded identities. The plaintext exists only at
seed time and rides out **in-band** in the wipe/reload POST
response (`SeededCredentials`) — the stored `secret` is a one-way
PBKDF2 hash and is never read back. Username = `identity_pii.email`
(the login key, `api/authentication.ts:430-432`). Monospace
`.credential-reveal-box`, one credential per line, copy-all via
reused `iconCopy` + `postClipboardCopy` + `showToast`.
**Demo-only seam** — see *Self-review*.

## File map

### Create
- `api/` tests: `tests/snapshot-import-identity-validation.test.ts`,
  `tests/api-facade-records-multi-put.test.ts`,
  `tests/api-authz-per-org.test.ts`, `tests/api-org-members.test.ts`,
  `tests/mock-data-two-orgs.test.ts`,
  `tests/adapters-org-session-exchange.test.ts`,
  `tests/adapters-identity-roster.test.ts`,
  `tests/presenter-identity-detail.test.ts`,
  `tests/presenter-identity-providers.test.ts`,
  `tests/presenter-identity-tokens.test.ts`
  (extend `tests/presenter-credential-reveal.test.ts`,
  `tests/credential-surfacing.test.ts`).
- web-app pages: `web-app/identities/{index,detail}.{html,ts}`,
  `web-app/identity-providers/index.{html,ts}`,
  `web-app/identity-tokens/index.{html,ts}`.
- presenters: `web-app/app/presenters/{identity-detail,
  identity-providers,identity-tokens}.ts`.
- adapters: `web-app/app/adapters/org-session.ts`,
  `web-app/app/org-switcher.ts`.
- styles: `web-app/app/styles/pages-identities.css`,
  `pages-identity-providers.css`, `pages-identity-tokens.css`,
  `components-org-switcher.css` (auto-bundled by the `pages-*.css`
  glob / composed link).

### Modify
- **Backend:** `api/snapshot-validator.ts` (9 cases),
  `api/authorization.ts` (+`currentRolesForInOrg`), `api/api.ts`
  (gate rewire + the member-join handler + false-comment rewrite),
  `api/mock-data.ts` (two-org partition + per-identity credentials +
  `SeededCredentials`).
- **Migration (same pattern, ~8 sites):**
  `web-app/app/adapters/shared.ts` (org-prefix seam) then
  `role-grants.ts` → `record-attributes.ts` → `records.ts` →
  `objectives.ts` → `ideas.ts` → `projects.ts` (+ `projects/index.ts`,
  `projects/detail.ts` callers) → `flow-mutations.ts` →
  `work-orders-mutations.ts` → finish `admin.ts`.
- **UI wiring:** `web-app/app/page-registry.ts`,
  `web-app/app/adapters/{index,identities,identity-providers,
  identity-tokens}.ts`, `web-app/app/presenters/index.ts`,
  `web-app/app/icons.ts` (iconLink), `web-app/app/header-info.ts`,
  `web-app/app/core.ts` (boot-scope), `web-app/snapshots/index.ts`,
  `web-app/app/presenters/credential-reveal.ts`,
  `web-app/app/styles/pages-snapshots.css`,
  `tests/presenter-barrel.test.ts`.

## Phases (risk-first; each green at `TMPDIR=/tmp/claude ./validate`)

Every phase is TDD: failing test first, then the minimal code.
Each phase is independently committable (one adapter per commit in
the migration). `./validate` (tsc + tests + 78-char lint +
`generate-schema-svg --check`) is the gate after every task.

1. **Snapshot-import validation gate (A).** Fail-first: import
   rejects a bad identity/credential/client row. Add the 9 cases.
   Re-run the FULL suite — a newly-rejected malformed seed is a
   real bug to fix, not a validator to loosen. *Risk: MEDIUM.*
2. **Verify facade-POST + `postIdentityCreation` (A).** Fail-first
   `records-multi-put` facade test (stamps org over a forged body;
   non-member 403). Green → no `facadeRequest` change. Add the
   PUT-backed `postIdentityCreation` (no org stamp) + test.
   *Risk: LOW.*
3. **Per-org roles at the gate (B, security).** Fail-first: grant
   in org-A does NOT authorize in org-B; grant in active org does;
   revoke honored. Add `currentRolesForInOrg`; rewire
   `authorizeRequest` with the explicit `DEFAULT_ORG` fallback;
   rewrite the false "roles are global" comments; align the
   `api-org-isolation` fixture (grant admin in the org being
   administered); replace all three `currentRolesFor` callers.
   *Risk: HIGH — fix fixtures, never weaken the gate.*
4. **Two-org seed + per-identity credentials (E-seed, F-seed).**
   Fail-first `mock-data-two-orgs` (both org rows; `enumerate
   ('current')===['1','2']`; each org owns ≥1 idea/project/flow/
   record/objective; all work_orders org-1; recordAttributes match
   parent; every seeded human has a fresh base62 password that
   `verifyPassword`s; `current` admin in both; others single-org
   non-admin). Implement the partition + `SeededCredentials`
   in-band return. Re-run all seed-dependent suites. *Risk: MEDIUM
   — org coherence across the seed graph.*
5. **Org-switcher + boot-always-scope (E-switcher).** Fail-first
   `postOrgSessionExchange` (member→scoped token; non-member→403)
   and the pure `shouldShowOrgSwitcher(orgs)` predicate. Build
   `org-session.ts`, `org-switcher.ts` (accessible `<select>`),
   `components-org-switcher.css`; wire `header-info.ts`
   (stopPropagation) and the `core.ts` boot (enumerate → resolve
   active org → exchange → install before render). *Risk:
   MEDIUM-HIGH — boot-scope is load-bearing for the whole migrated
   app.*
6. **Member-join + full facade migration (C).** Fail-first
   `api-org-members` (org-filtered; `current` in both; flat = full
   roster). Rewrite the members handler. Add the `shared.ts`
   org-prefix seam. Migrate `role-grants.ts` first (with the
   cross-org authz test), then one adapter per commit, risk-ordered;
   finish `admin.ts`. End state: `grep -rn DEFAULT_ORG web-app/` is
   empty. *Risk: MEDIUM, mechanical; records needs Phase 2, all
   need Phase 5.*
7. **Identity UI: three pages (D).** Fail-first adapter-shaping +
   presenter SafeHtml + barrel tests. Add named-gap adapters +
   barrel exports; build the pages, presenters, css, registry
   entries (one nav item), the person+service create dialog. Erase
   targets `identity_pii` only. `./build --no-zip` smoke (compose
   finds the new pages). *Risk: MEDIUM — create stays off the
   facade.* (Independent of 5/6; may parallelize.)
8. **Demo credentials panel (F).** Fail-first: panel contains every
   seeded identity's email+password, escapes hostile input, copy
   text is one credential per line. Extend `SeededCredentials` →
   `credentialRevealPanel` from one admin to all; add
   `credentialsCopyText`; monospace box + copy-all button; wire
   `snapshots/index.ts`. Demo-only doc comments at the seed return,
   presenter, and route. *Risk: LOW-MEDIUM — security-flagged.*

## Verification

- **Automated:** `TMPDIR=/tmp/claude ./validate` green after every
  phase (tsc strict + `noUncheckedIndexedAccess`, the full
  `node --test --strip-types tests/*.test.ts` suite, 78-char lint,
  `generate-schema-svg --check`). The new behavior tests assert at
  the **highest level** (api gate via `handleRequest`, seed via
  `MemoryDbAdapter`, presenter SafeHtml via the recording-container
  harness) — never implementation shape.
- **Browser demo** (`TMPDIR=/tmp/claude ./serve 8080`, Chrome MCP):
  1. Snapshots → *Wipe and Load Mock Data* → the panel lists every
     seeded identity's email+password; copy-all populates the
     clipboard.
  2. Log in as `current` (Tony) → greeting shows `Good …, Tony
     Stark, [Org ▾]`; switch org-1 ↔ org-2 → members, ideas,
     projects, flows, records, objectives re-scope; reload stays in
     the chosen org.
  3. Log in as a single-org seeded user → greeting has **no**
     dropdown; they see only their org's data.
  4. `/identities` → list, create a person and a service identity,
     open a detail → PII + credential summary; erase PII (identity
     survives); reach that identity's providers/tokens views.
  5. Confirm a role granted while in org-2 does not authorize in
     org-1 (the per-org leak is closed).

## Deferred / SP-boundary

- **Server-side HMAC key** — tenant/identity isolation stays
  demo-grade until the key leaves the bundle (arrives with the
  server/Postgres tier).
- **Real atomicity / Web Locks** for the cross-tab shared-write
  hazard — Postgres tier.
- **Credential *mutation* UI on the identity-detail page**
  (set/rotate/revoke) beyond the active-kinds summary — later.
- **`identity_tokens` / `authorization_codes` / `clients`
  management pages** beyond the three in scope — later.
- **The demo-credentials panel and the in-band plaintext return
  are deleted at the server tier** — they must not survive a
  networked deployment.

## Open questions (residual, non-blocking)

- Re-scope on switch is a **full reload** (guarantees no mixed-org
  views; loses transient page state) — confirm acceptable for a
  context switch.
- Org-2's company name/domain and the deterministic partition ratio
  (~half) are author's-choice; the seed test pins invariants, not
  exact assignments.
- `iconLink` is added for the providers affordance (falls back to
  `iconExternalLink` if rejected in review).

## Self-review (doctrine)

- **Reliability / Security (I, II):** the per-org gate closes a
  real privilege leak; the snapshot gate closes a real unvalidated
  edge; the client-shipped-key limit is stated, not overstated.
- **Idempotency (VII):** creation is client-mint + PUT; no server
  INSERT idiom introduced. Ledgers stay append-only (revoke = a new
  event).
- **Generality (IX):** the migration is one shared seam, not 8
  copies; `currentRolesFor` is replaced everywhere, not left beside
  its successor.
- **Derive from the ledger:** members-by-org is derived from
  `memberships`, not a denormalized join table; `enumerate` gates
  the switcher fresh, never the stale claim.
- **No Default Values / No Internal Defense:** the `DEFAULT_ORG`
  flat fallback is an explicit, documented call-site bridge, not a
  helper default; the erased-PII fallback lives at the call site.
- **Adapters as divorce points:** `org-session.ts`,
  `postIdentityCreation`, and the org-prefix seam keep the OAuth/
  storage tongues out of the domain.
- **Office of the Interface:** the org `<select>` and the identity
  pages carry ARIA + keyboard + token-driven contrast; the first
  interaction (no org chosen) resolves to a working scoped state.
- **Abominations avoided:** no swallowed failures (TokenReuseError
  degrades visibly), no greedy catch, no entangled nouns (org rides
  the token, not a foreign key on `identities`), no foreign tongues
  across the adapter wall.

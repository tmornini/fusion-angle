# SP-4 Authorization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to implement this
> plan task-by-task. Every subagent prompt MUST begin with the
> literal phrase `Go to Church!` (loads the Church of Code
> scripture) and then be briefed on the Voice rules below.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deny-by-default authorization to the API gate: a
`role_grants` append-only ledger assigns roles to identities,
and `handleRequest` permits a request only when the principal
holds a role allowed for that `(verb, path-prefix)` — every
request denied unless explicitly allowed.

**Architecture:** Authentication (SP-3) resolves *who* you are;
SP-4 adds a distinct *authorization* stage that resolves *what
your roles permit*. Roles are derived FRESH from the
`role_grants` ledger on every request (never the token claim —
a revoked role must take effect immediately). The policy is an
ordered list of `(verb, pathPrefix) → roles` entries matched by
HTTP method equality + `pathname.startsWith(prefix)`;
`permit = ∃ matching entry listing a held role`, else 403.
`admin` is allowed on every verb at prefix `/` (four honest
lines — no implicit-superuser magic). `current` is seeded
`admin` so the app and demo work.

**Tech Stack:** Vanilla TypeScript (ES2024, strict,
`noUncheckedIndexedAccess`), zero runtime deps. Tests via
`node --test --strip-types`. Gate: `TMPDIR=/tmp/claude
./validate`.

---

## Context — why this change

SP-1 (identity core) and SP-3 (token gate) are DONE on
`master`. SP-3 left the gate at *authentication* only: a valid,
non-anonymous, non-revoked Bearer reaches every route, and the
`Principal.roles` claim is always `[]`. The critical path is
`1 → 3 → {4,5} → 2 → 6`; SP-4 (Authorization) and SP-5
(Authentication) are both unblocked. SP-4 makes roles real and
enforces them at the gate.

User-directed scope (this session): **deny-by-default,
per-route allow via role**, where a "route" is **a verb on a
URI path matched by `startsWith`**. The richer allow/deny IAM
rule engine was explicitly descoped to this simpler model.

## Locked design decisions

1. **`role_grants` is its OWN table, not the `states` log.**
   The spec deferred this to SP-4
   (`…specs/2026-06-02-identity-auth-multitenancy.md` lines
   396–397). Decision: own `HistoryEntityStore` table.
   Evidence: `states` is `{id, entity_id, state, member_id,
   at}` — entity-lifecycle-scoped; riding it forces encoding
   `role`+`action`+`by_member_id` into the single `state`
   *string*, destroying column-level validation (the
   validators-at-the-gate Article), type safety, and 1NF
   (Codd). Precedent is unanimous: `identity_credentials` and
   `identity_token_revocations` are both their own ledger
   tables. `role_grants` joins them.

2. **Roles are derived FRESH from the ledger at the gate, not
   carried in the token.** `authenticateRequest` already reads
   `identity_token_revocations.getAll()` live every request;
   SP-4's role read is the identical shape against
   `role_grants`. Token-carried roles would be a cache of the
   ledger that goes stale on revoke — violating the
   "derive from the ledger" Article and Security (a revoked
   admin must lose access *now*). The token's `roles` claim
   stays `[]`; it is not consulted for authorization.

3. **Deny-by-default, per `(verb, pathPrefix)` allow.** Policy
   is an ordered list of `(verb, pathPrefix) → roles`. Match =
   `method === verb && pathname.startsWith(pathPrefix)`.
   `permit = ∃ matching entry listing a role the principal
   holds`, else 403. `admin` allowed at `/` for all four verbs.
   Prefixes chosen on segment boundaries (`/` and full resource
   names) so `startsWith` never half-matches `/flow` into
   `/flow-versions`.

4. **Distinct gate stages.** `authenticateRequest` →
   `Principal | string` (who you are / why rejected, 401);
   `authorizeRequest` → `string | null` (what you may do, 403).
   Authentication runs first; authorization second.

5. **Bootstrap admin = `current`** (the demo `demo@example.com`
   user, `devToken` sub), seeded in BOTH `populateBootstrapData`
   (pristine) and `populateMockData` — written directly to
   storage, below the gate. Under deny-by-default the app is
   unusable unless `current` holds an allowing role.

### Notes / deferred (named so they don't hide)

- **Credential surfacing after wipe-and-load — DEFERRED.** When
  built: surface the default admin username
  (`demo@example.com`) + password on the snapshots page after a
  successful pristine/mock load, AND change the seeded admin
  password from the fixed placeholder to a crypto-grade UUID
  (`generateCryptoSafeBase62`). A random seed password is
  non-deterministic (would break reproducible seeds/snapshots)
  and unknowable until displayed, so it must land WITH the
  surfacing path that captures it at generation time. Real
  password verification/hashing remains SP-5.
- **Non-admin role widening** (e.g. `viewer`, `editor` on
  narrower prefixes) — the mechanism ships; specific entries
  are added when a second role exists (YAGNI; below three
  instances, do not generalize).
- **Allow/deny rule engine + verb wildcards** — descoped to the
  simpler model; revisit if deny-overrides are ever needed.
- **Per-request role-read memoization** — authz reads
  `role_grants` fresh each request, as authn reads revocations.
  Derive-from-the-ledger is correct; memoize only if MEASURED
  necessary; never token-cache (stale).

## Voice rules (push down to EVERY subagent)

- 78-char max line length; 4-space indent; no trailing
  whitespace; final newline. No inline `style="…"`.
- snake_case storage ↔ camelCase domain.
- `RequestContext` is the SOLE argument to web-app adapter
  methods. HTTP-verb adapter naming: `postRoleGrant`,
  `postRoleRevocation`, `getRolesFor`.
- Validators at the gate, never downstream. Ledgers
  append-only: a revoke is a NEW `'revoked'` row, never a
  splice or edit.
- Present-tense imperative commit subject (~50 chars), no body.
  End every commit with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context)
  <noreply@anthropic.com>`.
- Commandments in play: **II Security** (deny-by-default,
  secure-by-default), **III Uniformity**, **VI Immutability**
  (append-only ledger), **VII Idempotency** (PUT by id).
  Article: **derive from the ledger**. Abominations to avoid:
  **Null / Default Values** (no `?? []` masking a missing
  requirement — model absence explicitly), **Internal Defense**
  (trust validated data within the walls), **Scattered
  Context**.
- The hard gate after EVERY task: `TMPDIR=/tmp/claude
  ./validate`. A failure ABORTS — fix before proceeding. Any
  schema change (`api/db.ts` TABLE_NAMES / `DbAdapter`,
  `api/types.ts` entities) MUST regenerate + commit `SCHEMA.svg`
  via `TMPDIR=/tmp/claude ./generate-schema-svg` (validate gates
  freshness with `--check`).

---

## File map

**Create**
- `api/authorization.ts` — pure `currentRolesFor` reduce +
  `ROUTE_POLICY` + `isPermitted`.
- `web-app/app/adapters/role-grants.ts` — `postRoleGrant`,
  `postRoleRevocation`, `getRolesFor` (RequestContext vessel).
- `tests/authorization.test.ts` — pure reduce + policy tests.
- `tests/adapters-role-grants.test.ts` — validator + web-app
  adapter tests (through the gate).
- `tests/api-authz-gate.test.ts` — gate 403/allow tests.
- `tests/root-admin-fixture.ts` — shared `seedRootAdmin(db)`.

**Modify**
- `api/types.ts` — `RoleGrantAction`, `RoleGrantEntity`.
- `api/validators.ts` — `validateRoleGrantEntity`.
- `api/db.ts` — `TABLE_NAMES` + `DbAdapter.roleGrants`.
- `api/db-memory.ts` — field + instantiate store.
- `api/db-localstorage.ts` — field + instantiate store.
- `api/api.ts` — routes; `HTTP_FORBIDDEN`; refactor
  `authenticateRequest`; add `authorizeRequest`; wire gate.
- `api/mock-data.ts` — seed `current`=admin (both paths).
- `tests/api-routes.test.ts` — add `role-grants`; seed admin.
- ~42 other gate-traversing test files — `seedRootAdmin`.
- `SCHEMA.svg` (regenerated), `SCHEMA.md` (role_grants doc).
- `…/specs/2026-06-02-identity-auth-multitenancy.md` — status.

**Task 0 — persist this plan.** First commit: write this plan
to `docs/superpowers/plans/2026-06-03-sp4-authorization.md` and
commit (`Add SP-4 authorization implementation plan`).

---

## Phase A — pure core (types, validator, reduce, policy)

No `DbAdapter`/SVG change → `SCHEMA.svg` unaffected (the
generator reads `DbAdapter` store declarations, not
`types.ts`). Each task is a green commit.

### Task A1: role-grant entity + validator

**Files:** Modify `api/types.ts`, `api/validators.ts`; Test
`tests/adapters-role-grants.test.ts` (validator cases only this
task).

- [ ] **Step 1: Write failing validator tests.** Create
  `tests/adapters-role-grants.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateRoleGrantEntity,
} from '../api/validators.ts';

test('validates a role-grant body', () => {
    assert.deepEqual(
        validateRoleGrantEntity({
            identity_id: 'current',
            role: 'admin',
            action: 'granted',
            by_member_id: 'system',
            at: '2026-06-03T00:00:00.000Z',
        }),
        {
            identity_id: 'current',
            role: 'admin',
            action: 'granted',
            by_member_id: 'system',
            at: '2026-06-03T00:00:00.000Z',
        },
    );
});

test('rejects an extra key', () => {
    assert.throws(() =>
        validateRoleGrantEntity({
            identity_id: 'c', role: 'admin',
            action: 'granted', by_member_id: 's',
            at: 'x', extra: 1,
        }));
});

test('rejects an unknown action', () => {
    assert.throws(() =>
        validateRoleGrantEntity({
            identity_id: 'c', role: 'admin',
            action: 'elevated', by_member_id: 's',
            at: '2026-06-03T00:00:00.000Z',
        }));
});

test('rejects an unparseable timestamp', () => {
    assert.throws(() =>
        validateRoleGrantEntity({
            identity_id: 'c', role: 'admin',
            action: 'granted', by_member_id: 's',
            at: 'not-a-date',
        }));
});
```

- [ ] **Step 2: Run, verify it fails.** Run:
  `node --test --strip-types
  tests/adapters-role-grants.test.ts`
  Expected: FAIL (`validateRoleGrantEntity` not exported).

- [ ] **Step 3: Add the entity types** to `api/types.ts` (after
  `IdentityTokenRevocationEntity`, ~line 465):

```typescript
export type RoleGrantAction = 'granted' | 'revoked';

// Append-only role-assignment ledger event. One row per
// grant or revoke; the roles an identity CURRENTLY holds =
// the latest action per (identity_id, role) — a 'granted'
// with no later 'revoked'. Append-only: a revoke is a NEW
// 'revoked' row, never a splice (mirrors
// identity_credentials / identity_token_revocations).
// `by_member_id` is the actor (== their identity id, per
// member.id === identity.id). `at` is the RFC-3339 zulu
// moment. Authorization derives roles from THIS ledger fresh
// at the gate — never from a token claim.
export interface RoleGrantEntity {
    id: Id;
    identity_id: Id;
    role: string;
    action: RoleGrantAction;
    by_member_id: Id;
    at: string;
}
```

- [ ] **Step 4: Add the validator** to `api/validators.ts`
  (mirror `validateIdentityTokenRevocationEntity`). Add
  `RoleGrantEntity` to its `types.ts` import, then:

```typescript
const ROLE_GRANT_BODY_KEYS: readonly string[] = [
    'identity_id', 'role', 'action', 'by_member_id', 'at',
];

export function validateRoleGrantEntity(
    body: Record<string, unknown>,
): Omit<RoleGrantEntity, 'id'> {
    assertOnlyKeys(
        body, ROLE_GRANT_BODY_KEYS, 'RoleGrantEntity',
    );
    const action = pickString(body, 'action');
    if (action !== 'granted' && action !== 'revoked') {
        throw new Error(
            'invalid role action "' + action
            + '" on RoleGrantEntity',
        );
    }
    const at = pickString(body, 'at');
    if (Number.isNaN(Date.parse(at))) {
        throw new Error(
            'invalid timestamp "' + at + '" on '
            + 'RoleGrantEntity',
        );
    }
    return {
        identity_id: pickString(body, 'identity_id'),
        role: pickString(body, 'role'),
        action,
        by_member_id: pickString(body, 'by_member_id'),
        at,
    };
}
```

- [ ] **Step 5: Run tests, verify pass.** Run the file again →
  PASS.
- [ ] **Step 6: Gate + commit.** `TMPDIR=/tmp/claude
  ./validate` → green. Commit:
  `git add api/types.ts api/validators.ts
  tests/adapters-role-grants.test.ts`
  `git commit -m "Add role_grants entity and validator"`

### Task A2: role reduce + deny-by-default policy

**Files:** Create `api/authorization.ts`,
`tests/authorization.test.ts`.

- [ ] **Step 1: Write failing tests.** Create
  `tests/authorization.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    currentRolesFor, isPermitted,
} from '../api/authorization.ts';

const grant = (
    id: string, identity: string, role: string,
    action: 'granted' | 'revoked', at: string,
) => ({
    id, identity_id: identity, role, action,
    by_member_id: 'system', at,
});

test('a granted role with no later revoke is held', () => {
    const rows = [
        grant('1', 'current', 'admin', 'granted',
            '2026-01-01T00:00:00.000Z'),
    ];
    assert.deepEqual(
        currentRolesFor(rows, 'current'), ['admin']);
});

test('latest action per (identity, role) wins', () => {
    const rows = [
        grant('1', 'current', 'admin', 'granted',
            '2026-01-01T00:00:00.000Z'),
        grant('2', 'current', 'admin', 'revoked',
            '2026-02-01T00:00:00.000Z'),
    ];
    assert.deepEqual(currentRolesFor(rows, 'current'), []);
});

test('roles are isolated per identity', () => {
    const rows = [
        grant('1', 'current', 'admin', 'granted',
            '2026-01-01T00:00:00.000Z'),
    ];
    assert.deepEqual(currentRolesFor(rows, 'other'), []);
});

test('admin is permitted on every verb at root', () => {
    for (const verb of ['GET', 'PUT', 'POST', 'DELETE']) {
        assert.equal(
            isPermitted(verb, '/role-grants/x', ['admin']),
            true);
        assert.equal(
            isPermitted(verb, '/members', ['admin']), true);
    }
});

test('deny-by-default: no held role is forbidden', () => {
    assert.equal(isPermitted('GET', '/members', []), false);
    assert.equal(
        isPermitted('GET', '/members', ['viewer']), false);
});
```

- [ ] **Step 2: Run, verify it fails.** Run:
  `node --test --strip-types tests/authorization.test.ts`
  Expected: FAIL (module not found).

- [ ] **Step 3: Create `api/authorization.ts`:**

```typescript
import type { Id, RoleGrantEntity } from './types.ts';

// Roles an identity currently holds: latest action per
// (identity_id, role); a 'granted' with no later 'revoked'
// wins. RFC-3339 zulu `at` sorts lexically = chronologically
// (the same reduce discipline as latestRevocationAt).
export function currentRolesFor(
    rows: readonly RoleGrantEntity[],
    identityId: Id,
): string[] {
    const latest = new Map<
        string,
        { action: RoleGrantEntity['action']; at: string }
    >();
    for (const row of rows) {
        if (row.identity_id !== identityId) continue;
        const prev = latest.get(row.role);
        if (prev === undefined || row.at > prev.at) {
            latest.set(
                row.role,
                { action: row.action, at: row.at },
            );
        }
    }
    const held: string[] = [];
    for (const [role, last] of latest) {
        if (last.action === 'granted') held.push(role);
    }
    return held;
}

// A policy entry: the roles permitted to use `verb` on any
// path that BEGINS WITH `pathPrefix`. Prefixes are chosen on
// segment boundaries so startsWith never half-matches.
export interface PolicyEntry {
    readonly verb: string;
    readonly pathPrefix: string;
    readonly roles: readonly string[];
}

// Deny-by-default policy. `admin` is allowed on every verb at
// the root prefix `/` — "admin everywhere" in four honest
// lines, no implicit-superuser special case. Narrower
// (verb, prefix) entries widen access to other roles later.
export const ROUTE_POLICY: readonly PolicyEntry[] = [
    { verb: 'GET', pathPrefix: '/', roles: ['admin'] },
    { verb: 'PUT', pathPrefix: '/', roles: ['admin'] },
    { verb: 'POST', pathPrefix: '/', roles: ['admin'] },
    { verb: 'DELETE', pathPrefix: '/', roles: ['admin'] },
];

// Permitted iff SOME matching entry (same verb; pathname
// begins with prefix) lists a role the principal holds.
// No match → false (deny-by-default).
export function isPermitted(
    method: string,
    pathname: string,
    heldRoles: readonly string[],
): boolean {
    for (const entry of ROUTE_POLICY) {
        if (entry.verb !== method) continue;
        if (!pathname.startsWith(entry.pathPrefix)) continue;
        for (const role of entry.roles) {
            if (heldRoles.includes(role)) return true;
        }
    }
    return false;
}
```

- [ ] **Step 4: Run tests, verify pass.** Run the file → PASS.
- [ ] **Step 5: Gate + commit.** `TMPDIR=/tmp/claude
  ./validate` → green. Commit:
  `git add api/authorization.ts tests/authorization.test.ts`
  `git commit -m "Add role reduce and deny-by-default policy"`

---

## Phase B — register the role_grants table + routes

Atomic table introduction (tsc forces it: a `DbAdapter` field
without instantiation fails to compile). Regenerates
`SCHEMA.svg`. The gate does NOT land here — so the new route is
reachable with a valid token (authn only), keeping this commit
green before Phase D seeds + gates.

> **Invariant (verified):**
> `tests/snapshot-import-validation.test.ts` asserts
> `Object.keys(parsed).length === TABLE_NAMES.length` — the
> exported snapshot must carry exactly one key per table. So
> `'role_grants'` MUST be added to `TABLE_NAMES` AND the
> `roleGrants` store instantiated in BOTH `db-memory.ts` and
> `db-localstorage.ts` in this SAME commit; `exportSnapshot`
> then gains the `role_grants` key in lockstep and the test
> stays green. Adding the name without the store (or vice
> versa) breaks it. Run this test explicitly in Step 10.

### Task B1: wire the store, routes, schema

**Files:** Modify `api/db.ts`, `api/db-memory.ts`,
`api/db-localstorage.ts`, `api/api.ts`, `tests/api-routes.test.ts`;
regenerate `SCHEMA.svg`; update `SCHEMA.md`; Test
`tests/adapters-role-grants.test.ts` (add a store round-trip).

- [ ] **Step 1: Write a failing store round-trip test.** Append
  to `tests/adapters-role-grants.test.ts`:

```typescript
import { MemoryDbAdapter } from '../api/db-memory.ts';

test('role_grants store retains appended events', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.roleGrants.put('g1', {
        identity_id: 'current', role: 'admin',
        action: 'granted', by_member_id: 'system',
        at: '2026-01-01T00:00:00.000Z',
    });
    await db.roleGrants.put('g2', {
        identity_id: 'current', role: 'admin',
        action: 'revoked', by_member_id: 'system',
        at: '2026-02-01T00:00:00.000Z',
    });
    const rows = await db.roleGrants.getAll();
    assert.equal(rows.length, 2);   // append-only retained
});
```

- [ ] **Step 2: Run, verify it fails.** Run the file →
  FAIL (`db.roleGrants` undefined).

- [ ] **Step 3: Register in `api/db.ts`.** Add `RoleGrantEntity`
  to the `types.ts` import; add to `TABLE_NAMES` after
  `'identity_token_revocations'`:

```typescript
    'role_grants',
```

  and to the `DbAdapter` interface after
  `identityTokenRevocations`:

```typescript
    roleGrants:
        EntityStore<RoleGrantEntity>;
```

- [ ] **Step 4: Instantiate in `api/db-memory.ts`.** Add the
  type + validator imports; add the field declaration after
  `identityTokenRevocations`:

```typescript
    readonly roleGrants: IEntityStore<RoleGrantEntity>;
```

  and instantiate after the `identityTokenRevocations` store:

```typescript
        this.roleGrants =
            new HistoryEntityStore(
                'role_grants', backend,
                validateRoleGrantEntity,
            );
```

- [ ] **Step 5: Instantiate in `api/db-localstorage.ts`** with
  the identical field declaration + import + `HistoryEntityStore`
  instantiation (mirror its `identityTokenRevocations`).

- [ ] **Step 6: Add routes in `api/api.ts`** after the
  `identity-token-revocations/:id` route (~line 282); add
  `RoleGrantEntity` to its `types.ts` import:

```typescript
    route('role-grants', {
        get: (db) => db.roleGrants.getAll(),
    }),
    route('role-grants/:id', {
        get: (db, p) =>
            db.roleGrants.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.roleGrants.put(
                param(p, 0),
                withoutId(payload) as unknown as
                    Omit<RoleGrantEntity, 'id'>,
            ),
    }),
```

- [ ] **Step 7: Add `role-grants` to COLLECTION_ROUTES** in
  `tests/api-routes.test.ts` (so the generic GET-returns-array
  test covers it). This route is open until Phase D; Phase C
  seeds admin into this file's setup so it survives the gate.

- [ ] **Step 8: Regenerate the ERD.** Run:
  `TMPDIR=/tmp/claude ./generate-schema-svg` (writes
  `SCHEMA.svg`).

- [ ] **Step 9: Document the table in `SCHEMA.md`.** Add a
  `### role_grants` section after `identity_token_revocations`
  (≤78-char lines — SCHEMA.md is root-linted):

```markdown
### role_grants

Append-only role-assignment ledger
(`HistoryEntityStore`). One row per grant or revoke;
the roles an identity CURRENTLY holds = the latest
action per `(identity_id, role)` — a `granted` with
no later `revoked`. Append-only: a revoke is a NEW
`revoked` row, never a splice. `by_member_id` is the
actor (== their identity id). Authorization derives
roles from THIS ledger fresh at the gate
(`isPermitted` in `api/authorization.ts`) — never
from a token claim, so a revoke takes effect on the
next request. `at` is the RFC-3339 zulu moment,
validated at the storage gate.

| Column | Type |
|--------|------|
| id | TEXT |
| identity_id | TEXT (FK → identities) |
| role | TEXT |
| action | TEXT (`granted` \| `revoked`) |
| by_member_id | TEXT (FK → members) |
| at | TEXT |
```

- [ ] **Step 10: Run tests + gate.** `node --test --strip-types
  tests/adapters-role-grants.test.ts` → PASS. Then
  `TMPDIR=/tmp/claude ./validate` → green (incl. SVG `--check`).
- [ ] **Step 11: Commit.**
  `git add api/db.ts api/db-memory.ts api/db-localstorage.ts
  api/api.ts tests/api-routes.test.ts tests/adapters-role-grants.test.ts
  SCHEMA.svg SCHEMA.md`
  `git commit -m "Register role_grants table and routes"`

---

## Phase C — authorize the test principal (fixture migration)

Deny-by-default (Phase D) will 403 every test that drives the
HTTP gate as `current`. We seed `current`=admin into those
tests FIRST — while the gate does not yet exist, so each
addition is a green no-op — so Phase D lands already-green.
This is the irreducible cost of deny-by-default, not of the
policy shape.

### Task C1: shared fixture

**Files:** Create `tests/root-admin-fixture.ts`.

- [ ] **Step 1: Create the helper:**

```typescript
import type { DbAdapter } from '../api/db.ts';

// Grant the demo `current` identity the `admin` role directly
// at the storage layer (below the gate), so a test that
// drives the HTTP gate as `current` (devToken) is authorized
// under deny-by-default. Writing the ledger row directly
// mirrors how the bootstrap/mock-data seeds plant the root
// admin before any auth exists.
export async function seedRootAdmin(
    db: DbAdapter,
): Promise<void> {
    await db.roleGrants.put('test-role-current-admin', {
        identity_id: 'current',
        role: 'admin',
        action: 'granted',
        by_member_id: 'system',
        at: '2020-01-01T00:00:00.000Z',
    });
}
```

- [ ] **Step 2: Gate + commit.** `TMPDIR=/tmp/claude ./validate`
  → green. `git add tests/root-admin-fixture.ts`
  `git commit -m "Add shared root-admin test fixture"`

### Task C2..Cn: migrate gate-traversing test files

For EACH gate-traversing file, import `seedRootAdmin` and call
`await seedRootAdmin(db);` immediately after every
`await db.createSchema();` that precedes a gate-driving call as
`current`. Where a file builds the db inline per test
(e.g. `tests/api.test.ts`, `tests/api-records.test.ts`),
refactor its db creation into a local `freshDb()` that does
`new MemoryDbAdapter()` + `createSchema()` + `seedRootAdmin()`,
then use it. **Do not** seed the unprivileged-path tests in
`tests/api-token-gate.test.ts` beyond its `freshDb()` helper
(its rejection tests fail at AUTHENTICATION, before authz, so
the seed is harmless there but only its `freshDb` needs it).

**The 43 gate-traversing files** (from measurement;
`tests/adapters-role-grants.test.ts`, `tests/authorization.test.ts`,
and the new `tests/api-authz-gate.test.ts` are handled in their
own phases and excluded here):

```
adapter-parity, adapters-admin, adapters-ai-members,
adapters-dashboard-mock-seed, adapters-dashboard,
adapters-flow-mutations, adapters-flow-publish,
adapters-flow-queries, adapters-flow-records,
adapters-flow-stats, adapters-flow-versions, adapters-ideas,
adapters-identities, adapters-identity-credentials,
adapters-identity-token-revocations, adapters-members-union,
adapters-members, adapters-objectives, adapters-project-publish,
adapters-project-scoring-validation, adapters-project-scoring,
adapters-projects, adapters-record-attributes,
adapters-record-transitions, adapters-records,
adapters-shared-commit, adapters-shared-identity,
adapters-shared, adapters-snapshots, adapters-state-events,
adapters-work-orders, api-identities, api-records-multi-put,
api-records, api-routes, api-token-gate, api,
flow-designer-presenter, flow-operations,
mock-data-lead-to-close, mock-data-objectives, snapshot-quota,
workbox-inbox
```

- [ ] **Per file:** import + seed after `createSchema()`; run
  that file (`node --test --strip-types tests/<file>.test.ts`)
  → PASS; if the extra `role_grants` row breaks an assertion
  (e.g. a snapshot round-trip that counts rows — watch
  `adapters-snapshots`, `snapshot-quota`,
  `mock-data-*`), adapt that assertion to the new reality (the
  data still round-trips; counts change by one row).
- [ ] **Commit in small groups** (e.g. 5–8 files per commit),
  `TMPDIR=/tmp/claude ./validate` green before each commit:
  `git commit -m "Seed root admin in <area> gate tests"`

> Execution note: dispatch one subagent per file (or small
> group). Each begins `Go to Church!`, is briefed on the Voice
> rules, makes the minimal change, runs the file + `./validate`,
> and reports. Two-stage review between batches.

---

## Phase D — the authorization gate

Now the suite is authorized; land deny-by-default. Refactor
authentication to RESOLVE the principal, add the authorization
stage, return 403 on denial.

### Task D1: refactor authn to return the Principal

**Files:** Modify `api/api.ts`.

- [ ] **Step 1: Update imports** from `./access-token.ts` to add
  `principalFromToken` and `type Principal`; import from the new
  module: `import { currentRolesFor, isPermitted } from
  './authorization.ts';`. Add the status constant near the other
  HTTP_ constants: `const HTTP_FORBIDDEN = 403;`.

- [ ] **Step 2: Change `authenticateRequest`'s return** from
  `Promise<string | null>` to `Promise<Principal | string>` —
  return the resolved principal on success instead of `null`:

```typescript
async function authenticateRequest(
    adapter: DbAdapter,
    request: Request,
): Promise<Principal | string> {
    const header =
        request.headers.get('authorization');
    if (header === null
        || !header.startsWith('Bearer ')) {
        return 'missing bearer token';
    }
    const token = header.slice('Bearer '.length);
    const now = Math.floor(Date.now() / 1000);
    const result = verifyAccessToken(token, now);
    if (!result.valid) {
        return result.reason;
    }
    if (result.claims.sub === ANONYMOUS_ID) {
        return 'anonymous principal not authenticated';
    }
    const rows =
        await adapter.identityTokenRevocations.getAll();
    const revokedBefore = revokedBeforeSeconds(
        rows, result.claims.sub,
    );
    if (revokedBefore !== null
        && result.claims.iat < revokedBefore) {
        return 'token revoked';
    }
    return principalFromToken(token);
}
```

### Task D2: add the authorization stage + wire the gate

- [ ] **Step 1: Write failing gate tests.** Create
  `tests/api-authz-gate.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { GET, handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';

const BASE = 'http://localhost';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    return db;
}

test('deny-by-default: a roleless principal is forbidden',
async () => {
    const db = await freshDb();   // no role granted
    const res = await handleRequest(db, new Request(
        `${BASE}/members`, {
            headers: {
                'Authorization': 'Bearer ' + devToken(),
            },
        }));
    assert.equal(res.status, 403);
    const body = await res.json() as { error: string };
    assert.match(body.error, /forbidden/);
});

test('an admin is permitted', async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const rows = await GET(db, 'members', devToken());
    assert.ok(Array.isArray(rows));   // 200, not 403
});

test('admin may write a role grant', async () => {
    const db = await freshDb();
    await seedRootAdmin(db);
    const res = await handleRequest(db, new Request(
        `${BASE}/role-grants/r1`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + devToken(),
            },
            body: JSON.stringify({
                identity_id: 'p2', role: 'viewer',
                action: 'granted',
                by_member_id: 'current',
                at: '2026-06-03T00:00:00.000Z',
            }),
        }));
    assert.equal(res.status, 200);
});

test('a non-admin may not write a role grant', async () => {
    const db = await freshDb();   // no admin
    const res = await handleRequest(db, new Request(
        `${BASE}/role-grants/r1`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + devToken(),
            },
            body: JSON.stringify({
                identity_id: 'p2', role: 'viewer',
                action: 'granted',
                by_member_id: 'current',
                at: '2026-06-03T00:00:00.000Z',
            }),
        }));
    assert.equal(res.status, 403);
});

test('authentication precedes authorization (401 first)',
async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, new Request(`${BASE}/members`));
    assert.equal(res.status, 401);   // no token, not 403
});
```

- [ ] **Step 2: Run, verify it fails.** Run the file → FAIL
  (the roleless request returns 200, not 403 — no gate yet).

- [ ] **Step 3: Add `authorizeRequest`** to `api/api.ts` (after
  `authenticateRequest`):

```typescript
async function authorizeRequest(
    adapter: DbAdapter,
    principal: Principal,
    method: string,
    pathname: string,
): Promise<string | null> {
    const rows = await adapter.roleGrants.getAll();
    const roles = currentRolesFor(rows, principal.id);
    if (isPermitted(method, pathname, roles)) {
        return null;
    }
    return 'forbidden: ' + method + ' ' + pathname
        + ' requires a role this principal lacks';
}
```

- [ ] **Step 4: Wire both stages** in `handleRequest` (replace
  the existing `if (!BEARER_EXEMPT_ROUTES.has(routePattern))`
  block):

```typescript
    const routePattern = matched.segments.join('/');
    if (!BEARER_EXEMPT_ROUTES.has(routePattern)) {
        const authResult =
            await authenticateRequest(adapter, request);
        if (typeof authResult === 'string') {
            return Response.json(
                { error: authResult },
                { status: HTTP_UNAUTHORIZED },
            );
        }
        const authzFailure = await authorizeRequest(
            adapter, authResult, method, pathname,
        );
        if (authzFailure !== null) {
            return Response.json(
                { error: authzFailure },
                { status: HTTP_FORBIDDEN },
            );
        }
    }
```

  (`pathname` and `method` are already in scope at the top of
  `handleRequest`.)

- [ ] **Step 5: Run the gate tests, verify pass.** Run
  `tests/api-authz-gate.test.ts` → PASS.
- [ ] **Step 6: Full gate.** `TMPDIR=/tmp/claude ./validate` →
  green. (Phase C seeded the rest of the suite; any straggler
  403 names the file still needing `seedRootAdmin` — fix it in
  this commit.)
- [ ] **Step 7: Commit.**
  `git add api/api.ts tests/api-authz-gate.test.ts`
  `git commit -m "Enforce deny-by-default authorization at gate"`

---

## Phase E — web-app role adapter

The vessel-facing API the app/console uses to grant, revoke,
and read roles (through the gate).

### Task E1: role-grants adapter

**Files:** Create `web-app/app/adapters/role-grants.ts`; Test:
extend `tests/adapters-role-grants.test.ts`.

- [ ] **Step 1: Write failing adapter tests.** Append to
  `tests/adapters-role-grants.test.ts`:

```typescript
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import {
    postRoleGrant, postRoleRevocation, getRolesFor,
} from '../web-app/app/adapters/role-grants.ts';

async function adminCtx() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedRootAdmin(db);   // current may write grants
    return { db, ctx: createRequestContext(db, devToken()) };
}

test('grant then read reflects the role', async () => {
    const { ctx } = await adminCtx();
    await postRoleGrant(ctx, 'p2', 'viewer');
    assert.deepEqual(
        await getRolesFor(ctx, 'p2'), ['viewer']);
});

test('revoke removes the role; ledger retains all', async () => {
    const { db, ctx } = await adminCtx();
    await postRoleGrant(ctx, 'p2', 'viewer');
    await postRoleRevocation(ctx, 'p2', 'viewer');
    const events = await db.roleGrants.getAll();
    // seed-admin + grant + revoke = 3 retained
    assert.equal(events.length, 3);
    assert.deepEqual(await getRolesFor(ctx, 'p2'), []);
});

test('the actor is recorded as by_member_id', async () => {
    const { db, ctx } = await adminCtx();
    await postRoleGrant(ctx, 'p2', 'viewer');
    const rows = await db.roleGrants.getAll();
    const granted = rows.find(r => r.identity_id === 'p2');
    assert.equal(granted?.by_member_id, 'current');
});
```

- [ ] **Step 2: Run, verify it fails.** Run the file → FAIL
  (adapter module not found).

- [ ] **Step 3: Create `web-app/app/adapters/role-grants.ts`:**

```typescript
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import {
    nowUtc,
    type Id,
    type RoleGrantAction,
    type RoleGrantEntity,
} from '../../../api/types.ts';
import {
    currentRolesFor,
} from '../../../api/authorization.ts';
import type { RequestContext } from './shared.ts';

async function appendRoleEvent(
    ctx: RequestContext,
    identityId: Id,
    role: string,
    action: RoleGrantAction,
): Promise<void> {
    const id = generateCryptoSafeBase62();
    await ctx.PUT(`role-grants/${id}`, {
        identity_id: identityId,
        role,
        action,
        by_member_id: ctx.identity.id,
        at: nowUtc(),
    });
}

export async function postRoleGrant(
    ctx: RequestContext,
    identityId: Id,
    role: string,
): Promise<void> {
    await appendRoleEvent(ctx, identityId, role, 'granted');
}

export async function postRoleRevocation(
    ctx: RequestContext,
    identityId: Id,
    role: string,
): Promise<void> {
    await appendRoleEvent(ctx, identityId, role, 'revoked');
}

export async function getRolesFor(
    ctx: RequestContext,
    identityId: Id,
): Promise<string[]> {
    const all = await ctx.GET<RoleGrantEntity[]>(
        'role-grants',
    );
    return currentRolesFor(all, identityId);
}
```

- [ ] **Step 4: Run tests, verify pass.** Run the file → PASS.
- [ ] **Step 5: Gate + commit.** `TMPDIR=/tmp/claude ./validate`
  → green.
  `git add web-app/app/adapters/role-grants.ts
  tests/adapters-role-grants.test.ts`
  `git commit -m "Add role-grants vessel adapter"`

---

## Phase F — bootstrap the default admin

Seed `current`=admin so the running app (pristine and demo) is
usable under deny-by-default.

### Task F1: seed in both seed paths

**Files:** Modify `api/mock-data.ts`; Test: extend
`tests/mock-data-objectives.test.ts` or add a focused seed
assertion (a new small test is acceptable).

- [ ] **Step 1: Write a failing seed test.** Add to a seed test
  file (or create `tests/mock-data-root-admin.test.ts`):

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    populateBootstrapData,
} from '../api/mock-data.ts';
import {
    currentRolesFor,
} from '../api/authorization.ts';

test('bootstrap seeds current as admin', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await populateBootstrapData(db);
    const rows = await db.roleGrants.getAll();
    assert.ok(
        currentRolesFor(rows, 'current').includes('admin'));
});
```

  (Use the actual exported name of the pristine seed; confirm
  `populateBootstrapData` / `populateMockData` exports.)

- [ ] **Step 2: Run, verify it fails.** Run the file → FAIL
  (no admin grant seeded).

- [ ] **Step 3: Seed in `populateMockData`** — add to the
  `await Promise.all([...])` that holds the credential puts
  (~line 752):

```typescript
        adapter.roleGrants.put(
            'seed-role-current-admin', {
                identity_id: 'current',
                role: 'admin',
                action: 'granted',
                by_member_id: SYSTEM_MEMBER_ID,
                at: MOCK_SEED_TIMESTAMP,
            },
        ),
```

- [ ] **Step 4: Seed in `populateBootstrapData`** — add to its
  `await Promise.all([...])` (~line 6348):

```typescript
        adapter.roleGrants.put(
            'bootstrap-role-current-admin', {
                identity_id: 'current',
                role: 'admin',
                action: 'granted',
                by_member_id: SYSTEM_MEMBER_ID,
                at: MOCK_SEED_TIMESTAMP,
            },
        ),
```

- [ ] **Step 5: Run tests, verify pass.** Run the seed test →
  PASS.
- [ ] **Step 6: Full gate.** `TMPDIR=/tmp/claude ./validate` →
  green. (Watch `mock-data-*` / snapshot tests for the extra
  seeded row; adapt counts if asserted.)
- [ ] **Step 7: Commit.**
  `git add api/mock-data.ts tests/mock-data-root-admin.test.ts`
  `git commit -m "Seed current identity as default admin"`

---

## Phase G — record the work in the design spec

**Files:** Modify
`docs/superpowers/specs/2026-06-02-identity-auth-multitenancy.md`.

- [ ] **Step 1: Add an SP-4 execution-status entry** (after the
  SP-3 block, ~line 194), in the house style: date; commit range
  on `master`; `./validate` green at every step; final test
  count; landed pieces (`role_grants` ledger; deny-by-default
  per-`(verb, pathPrefix)` policy; distinct authn→Principal /
  authz gate stages; `current`=admin seed; vessel adapter); and
  Deviations recorded — (a) **user-directed simpler model**:
  deny-by-default per-route allow (verb + path-prefix
  `startsWith`), not an allow/deny rule engine; (b) **own
  table** decision (records the resolved 396–397 flag); (c)
  **roles ledger-derived fresh at the gate**, token `roles`
  claim unused; (d) **fixture migration**: 43 gate-traversing
  test files seed `current`=admin (deny-by-default's cost); (e)
  credential surfacing + crypto-UUID admin password DEFERRED.
- [ ] **Step 2: Update the "not started" line** (195–196):
  `**SP-5, 2, 6 — not started.** Next on the critical path:
  **SP-5 Authentication** …`.
- [ ] **Step 3: Resolve the decision flag** (396–397): note
  `role_grants` is its own table (decided in SP-4; see the SP-4
  plan) rather than riding `states`.
- [ ] **Step 4: Update the "Next step" section** (399+) to point
  at SP-5.
- [ ] **Step 5: Gate + commit.** `TMPDIR=/tmp/claude ./validate`
  → green. `git add docs/superpowers/specs/...md`
  `git commit -m "Record SP-4 authorization as done"`

---

## Verification

- **Gate:** `TMPDIR=/tmp/claude ./validate` is green after every
  task (tsc `--noEmit` + `node --test` + 78-char lint + SVG
  `--check`). A failure ABORTS the run.
- **New automated coverage:** `tests/authorization.test.ts`
  (pure reduce + deny-by-default policy);
  `tests/adapters-role-grants.test.ts` (validator + store +
  vessel adapter); `tests/api-authz-gate.test.ts` (401 precedes
  403; deny-by-default; admin permitted; role-grant write
  admin-gated); seed test (bootstrap grants `current` admin).
- **Manual browser regression** (the SP-3 browser pass caught
  an integration bug 1078 unit tests missed — treat this as
  part of "done"). `TMPDIR=/tmp/claude ./serve 8080`, open
  `http://localhost:8080/landing/index.html`, drive via the
  `claude-in-chrome` MCP:
  1. **App is fully usable** after pristine/mock load — every
     page loads, no unexpected 403s. This is the key
     integration check: deny-by-default does NOT break the app
     because `current`=admin is seeded and `admin` is allowed
     at `/`. A 403 on any normal page is the bug to catch
     (e.g. a route hit before the session token is set, or an
     exempt-route gap) — the SP-3 `flow-operations` lesson:
     every adapter call now crosses the gate.
  2. In the console: `getRolesFor(sessionContext(), 'current')`
     → `['admin']`.
  3. `postRoleGrant(sessionContext(), 'p2', 'viewer')` →
     resolves (admin permitted).
  4. **Self-revocation / immediacy:**
     `postRoleRevocation(sessionContext(), 'current', 'admin')`
     resolves; the NEXT gated write (e.g. another
     `postRoleGrant`) REJECTS with 403 — proving roles are
     read fresh from the ledger (no stale token cache) and
     deny-by-default bites. Restore via snapshots wipe-and-load.

## Self-review

- **Spec coverage:** `role_grants` ledger ✓; endpoint→roles
  policy ✓ (deny-by-default per-`(verb, pathPrefix)`); role
  check enforced in the gate after authentication ✓; distinct
  authn/authz stages ✓; table-vs-states decision recorded ✓
  (own table); derive-from-the-ledger ✓.
- **Type consistency:** `RoleGrantEntity` / `RoleGrantAction`
  identical across `types.ts`, `validators.ts`, `db.ts`,
  `db-memory.ts`, `db-localstorage.ts`, `authorization.ts`, the
  vessel adapter; `currentRolesFor(rows, identityId)` and
  `isPermitted(method, pathname, roles)` signatures stable;
  routes use the hyphenated `role-grants` path, storage uses
  the snake_case `role_grants` table.
- **Doctrine:** RequestContext sole adapter arg ✓; validators at
  the gate ✓; ledger append-only (revoke = new row) ✓;
  snake_case↔camelCase ✓; HTTP-verb adapter naming ✓; no
  null/sentinel/default-masking (absence modeled, `isPermitted`
  returns a real boolean, policy miss → explicit 403) ✓;
  deny-by-default = secure-by-default (Commandment II) ✓.
- **No placeholders:** every step shows real code/commands.
- **Execution order soundness:** A (pure, no gate) → B (table,
  no gate) → C (seed fixtures, gate absent = no-op) → D (gate;
  suite already authorized) → E (vessel adapter) → F (app seed)
  → G (docs). Every commit green; the gate never lands before
  the fixtures that keep the suite green.

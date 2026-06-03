# SP-3 Token Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Every subagent prompt MUST begin with the literal phrase
> `Go to Church!` and be briefed on the Voice rules below.

**Goal:** Install a single real Bearer-token authentication gate at
`handleRequest` (the one server-side chokepoint every request crosses),
define a short-lived JWT access-token claim contract, derive the
resolved principal onto `RequestContext.identity` exactly once, and
require a valid Bearer on every protected request — with cryptographic
signature/DPoP verification left as a named, deferred SP-5 server seam.

**Architecture:** Additive-first, then a strict flip. New token
primitives, a revocation ledger, a session holder, and an optional
token-transport scaffold land while the suite stays green (gate off).
Then one atomic "teeth" commit flips the token parameters to **required**
and enables the gate. App → `RequestContext` (`shared.ts`) → verb
functions (`api/api.ts`) → `handleRequest` gate → `DbAdapter` →
localStorage. The token rides on the vessel (closure), never a global.

**Tech Stack:** Vanilla TypeScript (ES2024, strict,
`noUncheckedIndexedAccess`), zero runtime deps. JWT shape via platform
primitives only (`btoa`/`atob` + `TextEncoder`/`TextDecoder`). Tests:
`node --test --strip-types` via `MemoryDbAdapter`. Gate:
`TMPDIR=/tmp/claude ./validate`.

---

## Context — why this change

SP-1 (identity core) is DONE on master: the `identity` store,
`member.id === identity.id`, the `identity_pii` facet, and the
append-only `identity_credentials` ledger. But every request is still
unauthenticated — `handleRequest` (`api/api.ts:642`) dispatches with no
notion of a caller, and the whole app sources its principal as the
hardcoded literal `'current'` (`route('current-member')` →
`db.members.getById('current')`). The login form is cosmetic (validate →
800ms spinner → navigate). SP-3 is next on the critical path
(`1 → 3 → {4,5} → 2 → 6`): it turns the internal HTTP boundary into a
real authentication gate without changing the resource contract, so
SP-4 (authorization/roles), SP-5 (authentication/grants), and SP-2
(tenancy) can build on a verified principal.

The intended outcome: a forward-modeled JWT contract
(`sub`/`roles`/`name`/`aud`/`cnf` + `iat`/`exp`/`nbf`/`jti`,
short-lived), a middleware gate that verifies structure + `exp`/`nbf` +
a per-identity revoked-before stamp + rejects the anonymous principal on
protected routes, and `RequestContext.identity` set exactly once (the
Office of the Context). Real cryptography is a deferred server-tier seam,
exactly as SP-1 stored credential secrets unhashed and deferred
verification to where verification lives (SP-5).

## User-ratified decisions (this plan executes these)

1. **Strict deny-by-default.** No fallback/system token that masks
   missing auth. The token parameter is **required** at the end state;
   missing/malformed/expired/not-yet-valid/revoked/anonymous on a
   protected route → **401**. Real tokens are threaded through the
   existing app and test suites (the acknowledged cost of the
   discipline).
2. **Structural signature seam, defer crypto.** SP-3 verifies token
   STRUCTURE, `exp`/`nbf`, and the revoked-before stamp (all real). The
   signature check is a named `verifyTokenSignature()` seam (accepts a
   co-located placeholder now); real HS256/DPoP verification lands in the
   SP-5 server tier. Mint/verify stay synchronous.

## Locked design decisions

- **DQ1 token transport.** The token rides on the `RequestContext`
  vessel via a closure, attached as `Authorization: Bearer <token>` by
  the four verb functions. `createRequestContext(adapter, token)` takes
  the token explicitly (required at end state). The `ctx.GET/PUT/DELETE/
  POST` interface is UNCHANGED — the ~121 `ctx.*` adapter call sites do
  not change (the token binds once in the closure). A new
  `sessionContext()` helper is the app's session-bound entry point.
- **DQ2 gate placement.** One block in `handleRequest` AFTER `matchRoute`
  (preserves the 404 contract) and AFTER `method` is known, BEFORE body
  parse (don't parse an unauthenticated body). A static
  `PUBLIC_ROUTE_PATTERNS` allowlist (single audit surface, not a
  per-route flag) exempts the datastore-lifecycle plane. Failure →
  early-return `Response.json({error}, {status: HTTP_UNAUTHORIZED})`,
  mirroring the adjacent 404 early-return.
- **DQ3 identity on the vessel.** `RequestContext.identity: Principal`
  (`{id, roles, name}`), set exactly once from the token at context
  creation. The logged-out state is a named `ANONYMOUS_PRINCIPAL`, never
  null.
- **DQ4 signature seam.** `api/access-token.ts` owns the contract +
  mint + decode + verify; `verifyTokenSignature()` is the SP-5 divorce
  point. Sync, zero-dep.
- **DQ5 revoked-before storage.** A new append-only
  `identity_token_revocations` ledger (`{id, identity_id, at}`) via
  `HistoryEntityStore`; the effective stamp is `max(at)` per identity
  (derive from the ledger — append-and-max-reduce is commutative, so a
  concurrent cross-tab append can only DELAY a logout, never un-revoke).
- **DQ6 issuer.** SP-3 mints a real (signature-deferred) token for the
  seeded `'current'` identity at app boot (`core.ts`) and at login
  (`auth/index.ts`), so the single-principal demo stays functional. Full
  OAuth (clients registry, grant_type dispatch, refresh rotation,
  reuse-detection) is SP-5.

### Reasoned deviations from the design panel (recorded)

- **`api/access-token.ts`, not `web-app/...`.** The gate is in `api/`,
  which cannot import from `web-app/` (layering). The contract + verify
  live in `api/`; both tiers import it.
- **Structural seam, not async Web-Crypto HMAC.** Per the user's choice
  and to keep mint/verify sync (the vessel/session ergonomics need it);
  a co-located symmetric key is no real trust boundary anyway.
- **Early-return 401, not throw+catch.** The gate sits before the
  existing `try`, so it mirrors the 404 early-return rather than the
  `ApiError` catch path.

## Voice rules (push down to EVERY subagent)

78-char max line; 4-space indent; no inline `style=""`; `snake_case`
storage ↔ `camelCase` domain; HTTP-verb adapter naming (`getNoun`/
`putNoun`/`deleteNoun`/`postNounOperation`); validators at the gate
only; columns NOT NULL (absence = absent row, never null/sentinel/
default); ledgers append-only (reversal is a NEW event); `RequestContext`
is the sole adapter argument; presenters emit `SafeHtml`; present-tense
imperative commit messages; `Co-Authored-By: Claude Opus 4.8 (1M
context) <noreply@anthropic.com>` trailer. **Commandments in play:** I
Reliability (master always green), II Security (the gate has real
teeth), III Uniformity (mirror `identity_credentials`), VI Immutability,
VII Idempotency (PUT/DELETE), VIII Simplicity, IX Generality (no OAuth
machinery — that's SP-5). **Abominations risked:** Null, Default Values,
Internal Defense, Foreign Tongues, Premature Generalization, Global
State (token rides the vessel, NOT a global). **Patterns to match:** the
store-injected validator gate (`store-entity.ts`), the
`identity_credentials` ledger + reduce-on-read, the `init.ts` holder.

---

## Migration discipline (how every commit stays green)

Flipping the token parameter to `required` in one shot would break all
~195 `createRequestContext` call sites + the verb-fn callers at once (a
big-bang commit). Instead:

1. **Phases A–C add the token param as OPTIONAL** (scaffold): when
   absent, no `Authorization` header is attached; the gate is not yet
   enabled, so every existing call site compiles and the suite stays
   green.
2. **Phases D–E establish the real app session and migrate every call
   site** to pass a token — still green (gate off), behaviourally
   identical to today (tokens attached but unverified).
3. **Phase F is the atomic "teeth" commit:** flip the token params to
   **required** (tsc catches any missed site), enable the gate, and ship
   the negative tests in the SAME commit. All migrated sites pass valid
   tokens → green; negative tests pass bad tokens → 401 → green.

The transient optional param is a migration scaffold, not a permanent
default — the end state is strict (required token, deny-by-default).

`TMPDIR=/tmp/claude ./validate` is the gate after EVERY task. A failure
ABORTS — fix before proceeding. Tasks marked **[schema]** add/alter a
table and MUST run `./generate-schema-svg` and `git add SCHEMA.svg`.

---

## File map

**Create**
- `api/base64url.ts` — UTF-8-safe base64url encode/decode.
- `api/access-token.ts` — claim contract, `Principal`,
  `ANONYMOUS_PRINCIPAL`, mint/decode/verify, the `verifyTokenSignature`
  seam, the revoked-before reducer.
- `web-app/app/adapters/identity-token-revocations.ts` — client adapter
  (`postIdentityLogoutEverywhere`, `getRevokedBefore`).
- `tests/base64url.test.ts`
- `tests/access-token.test.ts`
- `tests/adapters-identity-token-revocations.test.ts`
- `tests/api-token-gate.test.ts`
- `tests/token-fixtures.ts` — `devToken()` + negative-token builders.

**Modify**
- `api/api.ts` — verb-fn token param; the gate; `HTTP_UNAUTHORIZED`;
  `PUBLIC_ROUTE_PATTERNS`; revocation routes.
- `api/types.ts` — `IdentityTokenRevocationEntity`.
- `api/validators.ts` — `validateIdentityTokenRevocationEntity`.
- `api/db.ts` — interface field + `TABLE_NAMES` entry.
- `api/db-localstorage.ts`, `api/db-memory.ts` — store instantiation.
- `web-app/app/adapters/shared.ts` — `RequestContext.identity`; token in
  `createRequestContext`.
- `web-app/app/adapters/init.ts` — session-token holder + mint helpers +
  `sessionContext()`.
- `web-app/app/core.ts` — establish the `'current'` session at boot.
- `web-app/auth/index.ts` — login mints + establishes the session.
- App call sites (~25 files) — `createRequestContext()` → `sessionContext()`.
- Test call sites (~35 + 5 files) — thread `devToken()`.
- `SCHEMA.md` — new table + count + reframed note.
- `SCHEMA.svg` — regenerated (Phase B).
- `docs/superpowers/specs/2026-06-02-identity-auth-multitenancy.md` —
  Execution status.
- `docs/superpowers/plans/2026-06-03-sp3-token-gate.md` — persist THIS
  plan (first execution task).

---

## Phase A — Token primitives (additive, green)

### Task A0: Persist this plan

- [ ] **Step 1:** Copy this plan file to
  `docs/superpowers/plans/2026-06-03-sp3-token-gate.md`.
- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-06-03-sp3-token-gate.md
git commit -m "Add SP-3 token gate implementation plan"
```

### Task A1: base64url encode/decode

**Files:** Create `api/base64url.ts`, `tests/base64url.test.ts`.

- [ ] **Step 1: Write the failing test** (`tests/base64url.test.ts`):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    base64UrlEncode,
    base64UrlDecode,
} from '../api/base64url.ts';

test('round-trips UTF-8 JSON', () => {
    const json = JSON.stringify({ name: 'Tóny ✦', n: 1 });
    const encoded = base64UrlEncode(json);
    assert.equal(base64UrlDecode(encoded), json);
});

test('is URL-safe with no padding', () => {
    const encoded = base64UrlEncode('???>>>???');
    assert.equal(/[+/=]/.test(encoded), false);
});
```

- [ ] **Step 2:** Run → FAIL (module not found).
  `node --test --strip-types tests/base64url.test.ts`
- [ ] **Step 3: Implement** (`api/base64url.ts`):

```ts
// URL-safe base64 for the JWT-shaped access token. btoa/atob
// operate on Latin-1 binary strings, so route bytes through
// TextEncoder / TextDecoder to stay UTF-8 correct. Platform
// primitives only — zero runtime dependencies.

export function base64UrlEncode(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export function base64UrlDecode(encoded: string): string {
    const restored = encoded
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const remainder = restored.length % 4;
    const padded = remainder
        ? restored + '='.repeat(4 - remainder)
        : restored;
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
}
```

- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `git commit -m "Add UTF-8-safe base64url codec"`

### Task A2: Access-token contract, mint, decode, verify

**Files:** Create `api/access-token.ts`, `tests/access-token.test.ts`.

- [ ] **Step 1: Write the failing tests** (`tests/access-token.test.ts`)
  — cover round-trip claims, expired (`exp`), not-yet-valid (`nbf`),
  malformed (2 segments), tampered signature, and `principalFromToken`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mintAccessToken,
    verifyAccessToken,
    principalFromToken,
    ANONYMOUS_PRINCIPAL,
} from '../api/access-token.ts';

function token(over: Partial<{
    sub: string; iat: number; ttlSeconds: number;
}> = {}): string {
    return mintAccessToken({
        sub: over.sub ?? 'current',
        roles: [],
        name: 'Demo',
        iat: over.iat ?? 1_700_000_000,
        ttlSeconds: over.ttlSeconds ?? 10_000_000_000,
        jti: 'jti-test',
    });
}

test('verifies a well-formed unexpired token', () => {
    const r = verifyAccessToken(token(), 1_700_000_100);
    assert.equal(r.valid, true);
    assert.equal(r.valid && r.claims.sub, 'current');
});

test('rejects an expired token', () => {
    const t = token({ iat: 1_600_000_000, ttlSeconds: 1 });
    const r = verifyAccessToken(t, 1_700_000_000);
    assert.equal(r.valid, false);
});

test('rejects a not-yet-valid token', () => {
    const t = token({ iat: 4_000_000_000 });
    const r = verifyAccessToken(t, 1_700_000_000);
    assert.equal(r.valid, false);
});

test('rejects a malformed token', () => {
    assert.equal(
        verifyAccessToken('a.b', 1_700_000_000).valid, false);
});

test('rejects a tampered signature', () => {
    const t = token();
    const bad = t.slice(0, t.lastIndexOf('.') + 1) + 'XXXX';
    assert.equal(
        verifyAccessToken(bad, 1_700_000_100).valid, false);
});

test('principalFromToken reads sub/roles/name', () => {
    const p = principalFromToken(token());
    assert.equal(p.id, 'current');
    assert.deepEqual(p.roles, []);
});

test('exposes a named anonymous principal', () => {
    assert.equal(ANONYMOUS_PRINCIPAL.id, 'anonymous');
});
```

- [ ] **Step 2:** Run → FAIL (module not found).
- [ ] **Step 3: Implement** (`api/access-token.ts`). Times are epoch
  SECONDS (RFC 7519 NumericDate). `verifyTokenSignature` is the SP-5
  seam. `mintAccessToken` takes `iat`/`jti` as inputs so it stays pure
  (the clock + id generation live in the caller):

```ts
import {
    base64UrlEncode,
    base64UrlDecode,
} from './base64url.ts';
import type { Id } from './types.ts';

// The resolved principal — the verified subject of a request.
// Distinct from the storage `Identity` ({id,kind}): this is
// the token's claim view. `roles` stays [] until SP-4 reads
// role_grants; `name` is a display copy.
export interface Principal {
    readonly id: Id;
    readonly roles: readonly string[];
    readonly name: string;
}

// The JWT claim contract. `aud` names the origin the token is
// for; `cnf` is the DPoP confirmation (SP-5 binds the key —
// present in the contract, unenforced now); `jti` is the
// unique token id (reuse-detection: SP-5).
export interface AccessTokenClaims {
    readonly sub: Id;
    readonly roles: readonly string[];
    readonly name: string;
    readonly aud: string;
    readonly cnf?: { readonly jkt: string };
    readonly iat: number;
    readonly nbf: number;
    readonly exp: number;
    readonly jti: string;
}

export const ANONYMOUS_ID: Id = 'anonymous';

// The logged-out principal — a real, named first-class
// subject, never null. The gate ACCEPTS it on public routes
// and REJECTS it on protected routes (deny-by-default
// authentication; role-based authorization is SP-4).
export const ANONYMOUS_PRINCIPAL: Principal = {
    id: ANONYMOUS_ID,
    roles: [],
    name: 'Anonymous',
};

const TOKEN_AUDIENCE = 'fusion-ai-web';
const SIGNING_KEY_ID = 'dev-co-located';

interface AccessTokenHeader {
    readonly alg: 'HS256';
    readonly typ: 'JWT';
    readonly kid: string;
}

const HEADER: AccessTokenHeader = {
    alg: 'HS256',
    typ: 'JWT',
    kid: SIGNING_KEY_ID,
};

// SEAM (SP-5 divorce point): real HS256/DPoP signing and
// verification land in the server tier with a non-co-located
// key. The placeholder freezes the three-segment wire shape
// without claiming cryptographic integrity — exactly as SP-1
// stored the credential secret unhashed and deferred
// verification to where it lives. The gate's REAL teeth are
// structure + exp/nbf + revoked-before + anonymous-rejection.
function signAccessToken(_signingInput: string): string {
    return base64UrlEncode(SIGNING_KEY_ID);
}

function verifyTokenSignature(
    _signingInput: string,
    signature: string,
): boolean {
    return signature === base64UrlEncode(SIGNING_KEY_ID);
}

export interface MintInput {
    readonly sub: Id;
    readonly roles: readonly string[];
    readonly name: string;
    readonly iat: number;
    readonly ttlSeconds: number;
    readonly jti: string;
}

export function mintAccessToken(input: MintInput): string {
    const claims: AccessTokenClaims = {
        sub: input.sub,
        roles: input.roles,
        name: input.name,
        aud: TOKEN_AUDIENCE,
        iat: input.iat,
        nbf: input.iat,
        exp: input.iat + input.ttlSeconds,
        jti: input.jti,
    };
    const head =
        base64UrlEncode(JSON.stringify(HEADER));
    const body =
        base64UrlEncode(JSON.stringify(claims));
    const signingInput = head + '.' + body;
    return signingInput + '.'
        + signAccessToken(signingInput);
}

function hasClaimShape(
    value: unknown,
): value is AccessTokenClaims {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const c = value as Record<string, unknown>;
    return typeof c.sub === 'string'
        && Array.isArray(c.roles)
        && typeof c.name === 'string'
        && typeof c.iat === 'number'
        && typeof c.nbf === 'number'
        && typeof c.exp === 'number'
        && typeof c.jti === 'string';
}

export function decodeAccessToken(
    token: string,
): AccessTokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error(
            'malformed token: expected 3 segments',
        );
    }
    const claims = JSON.parse(
        base64UrlDecode(parts[1]!),
    ) as unknown;
    if (!hasClaimShape(claims)) {
        throw new Error('malformed token: bad claim shape');
    }
    return claims;
}

export function principalFromToken(
    token: string,
): Principal {
    const claims = decodeAccessToken(token);
    return {
        id: claims.sub,
        roles: claims.roles,
        name: claims.name,
    };
}

export type VerifyResult =
    | { readonly valid: true; readonly claims: AccessTokenClaims }
    | { readonly valid: false; readonly reason: string };

export function verifyAccessToken(
    token: string,
    nowSeconds: number,
): VerifyResult {
    const parts = token.split('.');
    if (parts.length !== 3) {
        return { valid: false, reason: 'malformed token' };
    }
    const signingInput = parts[0]! + '.' + parts[1]!;
    if (!verifyTokenSignature(signingInput, parts[2]!)) {
        return { valid: false, reason: 'bad signature' };
    }
    let claims: AccessTokenClaims;
    try {
        const parsed = JSON.parse(
            base64UrlDecode(parts[1]!),
        ) as unknown;
        if (!hasClaimShape(parsed)) {
            return {
                valid: false, reason: 'bad claim shape',
            };
        }
        claims = parsed;
    } catch {
        return { valid: false, reason: 'unparseable claims' };
    }
    if (nowSeconds < claims.nbf) {
        return { valid: false, reason: 'not yet valid' };
    }
    if (nowSeconds >= claims.exp) {
        return { valid: false, reason: 'expired' };
    }
    return { valid: true, claims };
}

// Derive the revoked-before stamp from the ledger rows for one
// identity: the LATEST event wins (RFC-3339 zulu sorts
// lexically = chronologically). Returns epoch seconds or null
// (no revocation). Shared by the gate (server) and any client
// reducer so the derivation has ONE home.
export function revokedBeforeSeconds(
    rows: readonly { identity_id: Id; at: string }[],
    identityId: Id,
): number | null {
    let latest: string | null = null;
    for (const row of rows) {
        if (row.identity_id !== identityId) continue;
        if (latest === null || row.at > latest) {
            latest = row.at;
        }
    }
    return latest === null
        ? null
        : Math.floor(Date.parse(latest) / 1000);
}
```

- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit**
  `git commit -m "Add JWT access-token contract with deferred sig seam"`

---

## Phase B — Revocation ledger (additive, green) **[schema]**

### Task B1: Entity + validator

**Files:** Modify `api/types.ts`, `api/validators.ts`; extend
`tests/access-token.test.ts` is NOT used — add validator cases to a new
section of `tests/adapters-identity-token-revocations.test.ts` later.
Write the validator test inline here.

- [ ] **Step 1: Failing validator test** (append to a new
  `tests/adapters-identity-token-revocations.test.ts`):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateIdentityTokenRevocationEntity,
} from '../api/validators.ts';

test('validates a revocation body', () => {
    assert.deepEqual(
        validateIdentityTokenRevocationEntity({
            identity_id: 'current',
            at: '2026-06-03T00:00:00.000Z',
        }),
        {
            identity_id: 'current',
            at: '2026-06-03T00:00:00.000Z',
        },
    );
});

test('rejects an extra key', () => {
    assert.throws(() =>
        validateIdentityTokenRevocationEntity({
            identity_id: 'c', at: 'x', extra: 1,
        }));
});
```

- [ ] **Step 2:** Run → FAIL (not exported).
- [ ] **Step 3: Add the entity** (`api/types.ts`, beside
  `IdentityCredentialEntity`):

```ts
// A log-out-everywhere event: every access token for this
// identity issued before `at` is revoked. Append-only — a new
// logout is a NEW row; the effective revoked-before stamp is
// the LATEST `at` per identity (derive from the ledger, never
// a mutable column). Mirrors identity_credentials'
// revoke-to-retain discipline.
export interface IdentityTokenRevocationEntity {
    id: Id;
    identity_id: Id;
    at: string;
}
```

- [ ] **Step 4: Add the validator** (`api/validators.ts`, after
  `validateIdentityCredentialEntity`; import the new type):

```ts
const IDENTITY_TOKEN_REVOCATION_BODY_KEYS:
    readonly string[] = ['identity_id', 'at'];

export function validateIdentityTokenRevocationEntity(
    body: Record<string, unknown>,
): Omit<IdentityTokenRevocationEntity, 'id'> {
    assertOnlyKeys(
        body,
        IDENTITY_TOKEN_REVOCATION_BODY_KEYS,
        'IdentityTokenRevocationEntity',
    );
    return {
        identity_id: pickString(body, 'identity_id'),
        at: pickString(body, 'at'),
    };
}
```

- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6: Commit**
  `git commit -m "Add identity_token_revocations entity and validator"`

### Task B2: Register the store **[schema]**

**Files:** Modify `api/db.ts`, `api/db-localstorage.ts`,
`api/db-memory.ts`; regenerate `SCHEMA.svg`.

- [ ] **Step 1:** `api/db.ts` — import
  `IdentityTokenRevocationEntity`; add the interface field (declared
  `EntityStore`, the append-only `flowVersions`/`identityCredentials`
  precedent so `generate-schema-svg` parses it), beside
  `identityCredentials`:

```ts
    identityTokenRevocations:
        EntityStore<IdentityTokenRevocationEntity>;
```

- [ ] **Step 2:** `api/db.ts` — add to `TABLE_NAMES` right after
  `'identity_credentials'`: `'identity_token_revocations',`.

- [ ] **Step 3:** Instantiate in BOTH adapters (mirror
  `identityCredentials` — `HistoryEntityStore`, append-only). Import
  `validateIdentityTokenRevocationEntity`:

```ts
        this.identityTokenRevocations =
            new HistoryEntityStore(
                'identity_token_revocations', backend,
                validateIdentityTokenRevocationEntity,
            );
```

- [ ] **Step 4:** Regenerate the ERD: `TMPDIR=/tmp/claude
  ./generate-schema-svg`. Type-check:
  `npx tsc --noEmit -p web-app/app/tsconfig.json` → PASS.
- [ ] **Step 5: Commit**

```bash
git add api/db.ts api/db-localstorage.ts api/db-memory.ts SCHEMA.svg
git commit -m "Register the identity_token_revocations store"
```

### Task B3: Routes + client adapter

**Files:** Modify `api/api.ts`; create
`web-app/app/adapters/identity-token-revocations.ts`; extend
`tests/adapters-identity-token-revocations.test.ts`.

- [ ] **Step 1: Failing adapter test** (append) — note this test
  constructs its context WITHOUT a token; it is written against the
  current optional-token world and stays green because the new routes
  are reached before the gate exists (gate lands in Phase F, by which
  point Phase E threads the token):

```ts
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    postIdentityLogoutEverywhere,
    getRevokedBefore,
} from
    '../web-app/app/adapters/identity-token-revocations.ts';

async function setup() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    return { db, ctx: createRequestContext(db) };
}

test('logout-everywhere appends; reduce is latest-wins',
async () => {
    const { db, ctx } = await setup();
    await postIdentityLogoutEverywhere(ctx, 'current');
    await postIdentityLogoutEverywhere(ctx, 'current');
    const rows =
        await db.identityTokenRevocations.getAll();
    assert.equal(rows.length, 2);            // retained
    const stamp = await getRevokedBefore(ctx, 'current');
    assert.equal(typeof stamp, 'string');
    assert.equal(
        await getRevokedBefore(ctx, 'other'), null);
});
```

- [ ] **Step 2:** Run → FAIL (route 404 / module missing).
- [ ] **Step 3: Add routes** (`api/api.ts`, after the
  `identity-credentials` routes; import the entity type):

```ts
    route('identity-token-revocations', {
        get: (db) =>
            db.identityTokenRevocations.getAll(),
    }),
    route('identity-token-revocations/:id', {
        get: (db, p) =>
            db.identityTokenRevocations.getById(
                param(p, 0),
            ),
        put: (db, p, payload) =>
            db.identityTokenRevocations.put(
                param(p, 0),
                withoutId(payload) as unknown as
                    Omit<
                        IdentityTokenRevocationEntity, 'id'
                    >,
            ),
    }),
```

- [ ] **Step 4: Implement the client adapter**
  (`web-app/app/adapters/identity-token-revocations.ts`) — mirror
  `identity-credentials.ts`; the reduce reuses `revokedBeforeSeconds`'s
  sibling logic but returns the RFC-3339 stamp for client display:

```ts
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import {
    nowUtc,
    type Id,
    type IdentityTokenRevocationEntity,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';

export async function postIdentityLogoutEverywhere(
    ctx: RequestContext,
    identityId: Id,
): Promise<void> {
    const id = generateCryptoSafeBase62();
    await ctx.PUT(
        `identity-token-revocations/${id}`,
        { identity_id: identityId, at: nowUtc() },
    );
}

export async function getRevokedBefore(
    ctx: RequestContext,
    identityId: Id,
): Promise<string | null> {
    const all = await ctx.GET<
        IdentityTokenRevocationEntity[]
    >('identity-token-revocations');
    let latest: string | null = null;
    for (const row of all) {
        if (row.identity_id !== identityId) continue;
        if (latest === null || row.at > latest) {
            latest = row.at;
        }
    }
    return latest;
}
```

- [ ] **Step 5:** Run → PASS. `TMPDIR=/tmp/claude ./validate` → PASS.
- [ ] **Step 6: Commit**

```bash
git add api/api.ts \
    web-app/app/adapters/identity-token-revocations.ts \
    tests/adapters-identity-token-revocations.test.ts
git commit -m "Route and adapt the token-revocation ledger"
```

---

## Phase C — Context scaffold + session holder (additive, green)

### Task C1: Session-token holder + mint helpers

**Files:** Modify `web-app/app/adapters/init.ts`; create
`tests/session-holder.test.ts`.

- [ ] **Step 1: Failing test** (`tests/session-holder.test.ts`):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    getSessionToken,
    setSessionToken,
    clearSessionToken,
} from '../web-app/app/adapters/init.ts';
import {
    principalFromToken,
    ANONYMOUS_ID,
} from '../api/access-token.ts';

test('defaults to an anonymous-principal token', () => {
    clearSessionToken();
    const p = principalFromToken(getSessionToken());
    assert.equal(p.id, ANONYMOUS_ID);
});

test('returns the established token once set', () => {
    setSessionToken('header.body.sig');
    assert.equal(getSessionToken(), 'header.body.sig');
    clearSessionToken();
});
```

- [ ] **Step 2:** Run → FAIL (not exported).
- [ ] **Step 3: Implement** (append to
  `web-app/app/adapters/init.ts`). The holder mirrors the existing `let
  adapter` precedent; `getSessionToken` is non-null by construction
  (lazy anonymous token), so the required token param downstream never
  faces an absent value — the gate, not a null check, denies anonymous:

```ts
import {
    mintAccessToken,
    ANONYMOUS_ID,
} from '../../../api/access-token.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';

const SESSION_TTL_SECONDS = 15 * 60;

let sessionToken: string | undefined;

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function mintSessionToken(
    sub: string,
    name: string,
): string {
    return mintAccessToken({
        sub,
        roles: [],
        name,
        iat: nowSeconds(),
        ttlSeconds: SESSION_TTL_SECONDS,
        jti: generateCryptoSafeBase62(),
    });
}

export function setSessionToken(token: string): void {
    sessionToken = token;
}

export function clearSessionToken(): void {
    sessionToken = undefined;
}

export function getSessionToken(): string {
    if (sessionToken === undefined) {
        sessionToken = mintSessionToken(
            ANONYMOUS_ID, 'Anonymous',
        );
    }
    return sessionToken;
}

// Mint and install a real (signature-deferred) session token
// for an authenticated subject. Login and app-boot call this.
export function establishSession(
    sub: string,
    name: string,
): void {
    setSessionToken(mintSessionToken(sub, name));
}
```

- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit**
  `git commit -m "Add per-tab session-token holder and mint helpers"`

### Task C2: Token on the vessel + `RequestContext.identity`

**Files:** Modify `api/api.ts` (verb fns), `web-app/app/adapters/
shared.ts`; create `tests/adapters-shared-identity.test.ts`.

This is the SCAFFOLD: the token param is OPTIONAL here (kept green); it
becomes REQUIRED in Phase F. `ctx.identity` is set once.

- [ ] **Step 1: Failing test** (`tests/adapters-shared-identity.test.ts`).
  Both cases pass an EXPLICIT token so they survive the Phase-F flip to a
  required token (do NOT test the transient no-token default — it is
  scaffold-only):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    mintAccessToken,
    ANONYMOUS_ID,
} from '../api/access-token.ts';

function tokenFor(sub: string): string {
    return mintAccessToken({
        sub, roles: [], name: 'Demo',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'j-' + sub,
    });
}

test('identity is resolved once from the token', () => {
    const ctx = createRequestContext(
        new MemoryDbAdapter(), tokenFor('current'));
    assert.equal(ctx.identity.id, 'current');
    assert.equal(ctx.identity, ctx.identity);
});

test('an anonymous token yields the anonymous principal', () => {
    const ctx = createRequestContext(
        new MemoryDbAdapter(), tokenFor(ANONYMOUS_ID));
    assert.equal(ctx.identity.id, ANONYMOUS_ID);
});
```

- [ ] **Step 2:** Run → FAIL (`identity` missing / arity).
- [ ] **Step 3: Verb fns** (`api/api.ts`) — add an OPTIONAL trailing
  `token?: string`; when present, attach `Authorization`. GET/DELETE
  gain a headers bag; PUT/POST extend theirs. Pattern for GET (apply the
  same to PUT/DELETE/POST):

```ts
export async function GET<T>(
    adapter: DbAdapter,
    resource: string,
    token?: string,
): Promise<T> {
    await adapter.simulateLatency();
    const headers: Record<string, string> = {};
    if (token !== undefined) {
        headers['Authorization'] = 'Bearer ' + token;
    }
    return unwrapResponse<T>(
        await handleRequest(
            adapter,
            new Request(
                `${BASE_URL}/${resource}`,
                { headers },
            ),
        ),
    );
}
```

For PUT/POST, merge `'Authorization'` into the existing
`{'Content-Type': 'application/json'}` headers object.

- [ ] **Step 4: `shared.ts`** — add `readonly identity: Principal` to
  the `RequestContext` interface; add an OPTIONAL `token` param to
  `createRequestContext`; bind it into each verb call and resolve
  `identity` ONCE:

```ts
import {
    type Principal,
    principalFromToken,
    ANONYMOUS_PRINCIPAL,
} from '../../../api/access-token.ts';

// in the interface:
    readonly identity: Principal;

// in createRequestContext(adapter = getDbAdapter(), token?):
    const identity = token === undefined
        ? ANONYMOUS_PRINCIPAL
        : principalFromToken(token);
    const ctx: RequestContext = {
        requestId: generateCryptoSafeBase62(),
        identity,
        GET: <T>(resource: string) =>
            httpGet<T>(adapter, resource, token),
        PUT: <T>(resource, body) =>
            httpPut<T>(adapter, resource, body, token),
        DELETE: (resource) =>
            httpDelete(adapter, resource, token),
        POST: <T>(resource, body) =>
            httpPost<T>(adapter, resource, body, token),
        commit: /* unchanged */,
    };
```

- [ ] **Step 5:** Run → PASS. `TMPDIR=/tmp/claude ./validate` → PASS
  (all existing call sites still compile — token optional).
- [ ] **Step 6: Commit**
  `git commit -m "Carry the access token on the request-context vessel"`

### Task C3: `sessionContext()` app entry point

**Files:** Modify `web-app/app/adapters/shared.ts`.

- [ ] **Step 1:** Add `sessionContext()` to `shared.ts` (NOT `init.ts` —
  `shared.ts` already imports `getDbAdapter` from `init.ts`, so placing
  it here keeps the dependency one-directional and avoids a `shared ↔
  init` cycle). Import `getSessionToken` from `./init.ts` alongside the
  existing `getDbAdapter` import:

```ts
export function sessionContext(): RequestContext {
    return createRequestContext(
        getDbAdapter(), getSessionToken(),
    );
}
```

- [ ] **Step 2:** Type-check → PASS (no callers yet).
- [ ] **Step 3: Commit**
  `git commit -m "Add sessionContext as the app's session-bound entry"`

---

## Phase D — Establish the real app session (green, gate still off)

### Task D1: Mint the `'current'` session at boot

**Files:** Modify `web-app/app/core.ts`.

- [ ] **Step 1:** In the `DOMContentLoaded` handler, after
  `hasSchema = await initDatabase()` succeeds and `hasSchema` is true
  (`core.ts:83`), establish the demo principal's session BEFORE any page
  module runs. Import `establishSession` from `./adapters/init.ts`:

```ts
        if (hasSchema) {
            establishSession('current', 'Demo User');
        }
```

(Place immediately after the `try/catch` around `initDatabase`, before
`getPageName()`.) The display name still flows from `identity_pii` at the
~121 call sites; the token's `name` claim is a minimal copy until
SP-5/SP-6 enrich it.

- [ ] **Step 2:** `TMPDIR=/tmp/claude ./validate` → PASS.
- [ ] **Step 3: Commit**
  `git commit -m "Establish the current session at app boot"`

### Task D2: Login mints + establishes the session

**Files:** Modify `web-app/auth/index.ts`.

- [ ] **Step 1:** In the form-submit handler (`auth/index.ts` ~448),
  inside the existing `setTimeout` success branch, call
  `establishSession('current', 'Demo User')` BEFORE `navigateTo
  ('dashboard')`. Keep the cosmetic spinner; only add the mint. Import
  `establishSession` from `../app/adapters/init.ts`.
- [ ] **Step 2:** `TMPDIR=/tmp/claude ./validate` → PASS.
- [ ] **Step 3: Commit**
  `git commit -m "Mint and establish the session on login"`

---

## Phase E — Migrate call sites (green, gate still off)

The token param is still optional and the gate is off, so each migration
commit is behaviour-preserving and green. Apply each pattern across its
files; commit per group.

### Task E1: App context creation → `sessionContext()`

- [ ] **Step 1:** Replace every app `createRequestContext()` (no-arg,
  using the default adapter) with `sessionContext()`, imported from the
  same module the page already imports `createRequestContext` from
  (`web-app/app/adapters/shared.ts`; adjust the relative path per file).
  Representative
  sites: `web-app/organization/index.ts`, `web-app/records/index.ts`,
  and the ~23 other app pages found via
  `grep -rl "createRequestContext()" web-app`. Do NOT touch
  `createRequestContext` calls that pass an explicit adapter (none
  expected in app code).
- [ ] **Step 2:** `TMPDIR=/tmp/claude ./validate` → PASS.
- [ ] **Step 3: Commit**
  `git commit -m "Source app contexts from the session token"`

### Task E2: Token fixtures + adapter-test contexts

**Files:** Create `tests/token-fixtures.ts`; modify ~35 adapter test
files.

- [ ] **Step 1:** Create `tests/token-fixtures.ts`:

```ts
import { mintAccessToken } from '../api/access-token.ts';

// A deterministic, always-valid 'current' token: a fixed iat
// with an enormous TTL puts exp far in the future, so it
// verifies against any wall clock without a clock seam.
export function devToken(sub = 'current'): string {
    return mintAccessToken({
        sub, roles: [], name: 'Demo',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'dev-' + sub,
    });
}

export function expiredToken(sub = 'current'): string {
    return mintAccessToken({
        sub, roles: [], name: 'Demo',
        iat: 1_600_000_000, ttlSeconds: 1,
        jti: 'exp-' + sub,
    });
}

export function notYetValidToken(sub = 'current'): string {
    return mintAccessToken({
        sub, roles: [], name: 'Demo',
        iat: 4_000_000_000, ttlSeconds: 10_000_000_000,
        jti: 'nbf-' + sub,
    });
}
```

- [ ] **Step 2:** In EVERY adapter test's `setup()` and any direct
  `createRequestContext(db)`, pass `devToken()`:
  `createRequestContext(db, devToken())`. Apply across ALL ~35 files
  found via `grep -rl "createRequestContext(" tests` — including the
  existing `adapters-shared.test.ts` requestId tests and the
  `adapters-identity-token-revocations.test.ts` setup from Task B3 (after
  the Phase-F flip, an untokened `createRequestContext(db)` is a tsc
  error, so none may remain). The `adapters-shared-identity.test.ts` and
  `session-holder.test.ts` cases already pass explicit tokens — leave
  them.
- [ ] **Step 3:** `TMPDIR=/tmp/claude ./validate` → PASS.
- [ ] **Step 4: Commit**
  `git commit -m "Thread dev tokens through adapter-layer tests"`

### Task E3: API-layer test direct calls

**Files:** modify the 5 test files importing `GET/PUT/DELETE/POST` from
`api/api.ts`.

- [ ] **Step 1:** Add `devToken()` as the trailing argument to EVERY
  direct `GET(db, res)` / `PUT(db, res, body)` / `DELETE(db, res)` /
  `POST(db, res, body)` call — including public-route (`snapshots/*`) and
  404/error-path calls. The `token` param is REQUIRED at the type level
  after Phase F regardless of route; the gate simply ignores it for
  public routes and a non-match 404s before the gate runs. Files via
  `grep -rl "from '../api/api.ts'" tests`. (Tests that deliberately
  exercise the missing-header path call `handleRequest` directly, not the
  verb fns — see `tests/api-token-gate.test.ts`.)
- [ ] **Step 2:** `TMPDIR=/tmp/claude ./validate` → PASS.
- [ ] **Step 3: Commit**
  `git commit -m "Thread dev tokens through api-layer tests"`

---

## Phase F — Enable the gate (atomic teeth commit, green)

### Task F1: Require the token, install the gate, prove the teeth

**Files:** Modify `api/api.ts`, `web-app/app/adapters/shared.ts`; create
`tests/api-token-gate.test.ts`.

- [ ] **Step 1: Write the gate tests FIRST**
  (`tests/api-token-gate.test.ts`) — these FAIL until the gate exists:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { GET, PUT, handleRequest } from '../api/api.ts';
import {
    devToken, expiredToken, notYetValidToken,
} from './token-fixtures.ts';
import {
    mintAccessToken, ANONYMOUS_ID,
} from '../api/access-token.ts';

const BASE = 'http://localhost';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    return db;
}

// The verb fns always attach a Bearer header, so the
// missing-header path is reachable only via handleRequest.
test('rejects a request with no Authorization header',
async () => {
    const db = await freshDb();
    const res = await handleRequest(
        db, new Request(`${BASE}/members`));
    assert.equal(res.status, 401);
});

test('protected route accepts a valid token', async () => {
    const db = await freshDb();
    const rows = await GET(db, 'members', devToken());
    assert.ok(Array.isArray(rows));
});

test('rejects an expired token', async () => {
    const db = await freshDb();
    await assert.rejects(
        () => GET(db, 'members', expiredToken()));
});

test('rejects a not-yet-valid token', async () => {
    const db = await freshDb();
    await assert.rejects(
        () => GET(db, 'members', notYetValidToken()));
});

test('rejects the anonymous principal on a protected route',
async () => {
    const db = await freshDb();
    const anon = mintAccessToken({
        sub: ANONYMOUS_ID, roles: [], name: 'Anonymous',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'anon',
    });
    await assert.rejects(() => GET(db, 'members', anon));
});

// Public routes are exempt: even an anonymous token (which a
// protected route rejects) reaches the snapshot plane.
test('public snapshot routes admit any token', async () => {
    const db = await freshDb();
    const anon = mintAccessToken({
        sub: ANONYMOUS_ID, roles: [], name: 'Anonymous',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'anon2',
    });
    const snap = await GET(db, 'snapshots/schema', anon);
    assert.equal(snap, null);   // hasSchema false here
});

test('a logout-everywhere revokes earlier tokens', async () => {
    const db = await freshDb();
    // The rejected token predates the revocation stamp; the
    // writer (devToken, iat 1.7e9) is stamped AFTER it, so the
    // revocation does not revoke its own writer.
    const stale = mintAccessToken({
        sub: 'current', roles: [], name: 'Demo',
        iat: 1_600_000_000, ttlSeconds: 10_000_000_000,
        jti: 'stale',
    });
    await PUT(
        db, 'identity-token-revocations/r1',
        {
            identity_id: 'current',
            at: '2021-01-01T00:00:00.000Z',
        },
        devToken(),
    );
    await assert.rejects(() => GET(db, 'members', stale));
});
```

- [ ] **Step 2:** Run → FAIL (no gate; missing-token call currently
  succeeds).
- [ ] **Step 3: Make the token REQUIRED.** In `api/api.ts` change the
  verb-fn signatures from `token?: string` to `token: string`. In
  `shared.ts` change the factory to
  `createRequestContext(adapter: DbAdapter, token: string)` — drop BOTH
  the adapter default and the token optionality (both params required,
  unambiguously valid; by now every caller passes both: app via
  `sessionContext()`, tests via `createRequestContext(db, devToken())`),
  and simplify `identity` to `principalFromToken(token)` (no anonymous
  branch — an explicit token is always supplied; `sessionContext()`
  supplies the anonymous token when logged out). tsc now flags any
  unmigrated call site — fix each (there should be none after Phase E).

- [ ] **Step 4: Install the gate** (`api/api.ts`). Add the constant and
  the allowlist near the other `HTTP_*` constants:

```ts
const HTTP_UNAUTHORIZED = 401;

// The datastore-lifecycle plane runs BELOW the auth tier:
// these routes create/seed/import the schema before any
// identity or token can exist, so they are the ONLY un-gated
// surface. A single audited allowlist (not a per-route flag)
// keeps the exempt set reviewable in one place; any addition
// here is a security-sensitive change. ROUTE EXISTENCE IS
// PUBLIC at this in-process tier (the client already holds
// the route table), so the gate runs AFTER matchRoute,
// preserving the 404 contract; an enumeration oracle only
// appears at a networked tier and is a server-tier deferral.
const PUBLIC_ROUTE_PATTERNS: ReadonlySet<string> =
    new Set([
        'snapshots/schema',
        'snapshots/mock-data',
        'snapshots/bootstrap',
        'snapshots/import',
    ]);

async function authenticateRequest(
    adapter: DbAdapter,
    request: Request,
): Promise<string | null> {
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
    return null;
}
```

Import `verifyAccessToken`, `ANONYMOUS_ID`, `revokedBeforeSeconds` from
`./access-token.ts`. Insert the gate in `handleRequest` immediately after
`const method = request.method;` (line 663), before body parse:

```ts
    const routePattern = matched.segments.join('/');
    if (!PUBLIC_ROUTE_PATTERNS.has(routePattern)) {
        const authFailure =
            await authenticateRequest(adapter, request);
        if (authFailure !== null) {
            return Response.json(
                { error: authFailure },
                { status: HTTP_UNAUTHORIZED },
            );
        }
    }
```

- [ ] **Step 5:** Run the gate tests → PASS. Then the FULL gate:
  `TMPDIR=/tmp/claude ./validate` → PASS. If any pre-existing test fails,
  it is a missed token (thread `devToken()`) or the malformed-JSON path
  (it now needs a token to reach the 400 — add `devToken()`); fix and
  re-run.
- [ ] **Step 6: Commit**

```bash
git add api/api.ts web-app/app/adapters/shared.ts \
    tests/api-token-gate.test.ts
git commit -m "Require a verified Bearer on every protected request"
```

---

## Phase G — Documentation

### Task G1: SCHEMA.md + spec Execution status

**Files:** Modify `SCHEMA.md`,
`docs/superpowers/specs/2026-06-02-identity-auth-multitenancy.md`.

- [ ] **Step 1:** `SCHEMA.md` — bump the table count; add an
  `### identity_token_revocations` section (columns; append-only;
  effective stamp = `max(at)` per identity; that it powers
  log-out-everywhere and the token gate). Keep every line ≤ 78 chars.
- [ ] **Step 2:** Update the spec's **Execution status**: mark
  **SP-3 Token gate — ✅ DONE**, record the landed pieces (JWT contract;
  the `handleRequest` gate with `PUBLIC_ROUTE_PATTERNS`;
  `RequestContext.identity`; the `identity_token_revocations` ledger;
  mint-at-login/boot) and the deviations (api/ placement; structural
  signature seam; strict deny-by-default; anonymous-rejection as the
  authentication teeth). Note the next critical-path step is
  **{SP-4 Authorization, SP-5 Authentication}**.
- [ ] **Step 3:** `TMPDIR=/tmp/claude ./validate` → PASS (md line lint).
- [ ] **Step 4: Commit**
  `git commit -m "Document the token gate and revocation ledger"`

---

## Verification

- **Gate:** `TMPDIR=/tmp/claude ./validate` after EVERY task (tsc
  `--noEmit` + `node --test --strip-types tests/*.test.ts` + 78-char lint
  + `./generate-schema-svg --check`). A failure ABORTS.
- **New automated coverage:** `tests/base64url.test.ts`,
  `tests/access-token.test.ts`,
  `tests/adapters-identity-token-revocations.test.ts`,
  `tests/session-holder.test.ts`, `tests/adapters-shared-identity.test.ts`,
  `tests/api-token-gate.test.ts`. Key assertions: token round-trip +
  expired/nbf/malformed/tampered rejection; the gate rejects
  missing/expired/not-yet-valid/anonymous/revoked and accepts a valid
  token; public snapshot routes need none; `ctx.identity` resolved once;
  revocation appends (ledger retained) and `revokedBeforeSeconds` reduces
  latest-wins.
- **Manual browser regression** (HTTP-only; sandbox invocation):

  ```bash
  TMPDIR=/tmp/claude ./serve 8080
  # open http://localhost:8080/landing/index.html
  ```

  Confirm: a fresh load creates schema (snapshots page, public routes)
  then the app works end-to-end (boot establishes the `'current'`
  session; dashboard/members/flows load without 401s); the login form
  still navigates to the dashboard; data reads/writes succeed. Add a
  TEST-PLAN.md case for the gate (a forged/absent Bearer is rejected)
  when SP-6 surfaces session UI.

## Deferred / SP-5 boundary (named so it cannot hide)

- **Real signature/DPoP crypto** — `verifyTokenSignature` accepts a
  co-located placeholder; real HS256/asymmetric + DPoP proof-of-
  possession verification lands in the SP-5 server tier with a
  non-co-located key. Security is CONTRACTUAL, not cryptographic, until
  then (the whole store is client-side localStorage; no secret crosses a
  trust boundary). Exactly mirrors SP-1's unhashed-credential deferral.
- **Token issuance** — SP-3 mints only a minimal `'current'` token at
  boot/login. The `clients` registry, `/authentication/token` grant_type
  dispatch (`authorization_code`/`client_credentials`/`token-exchange`/
  `refresh`), the interactive `/authentication/authorize` front door,
  refresh rotation, and reuse-detection are SP-5. The `cnf`/`aud` claims
  are present-but-unenforced to freeze the contract.
- **`roles` claim** is `[]` — SP-4 populates it from the `role_grants`
  ledger and adds the endpoint→roles authorization check (distinct from
  SP-3's authentication teeth: anonymous-rejection).
- **The `current-member` route** still returns the literal `'current'`;
  migrating the ~121 `'current'`-literal call sites to `ctx.identity.id`
  is SP-4/SP-6 scope (SP-1's `member.id === identity.id` keeps `sub ===
  'current'` consistent in the interim).
- **Cross-tab atomicity** of the revocation ledger and the token holder —
  localStorage has no atomic read-modify-write, so a concurrent
  interleave can drop a row; append-and-max-reduce bounds the blast to a
  DELAYED logout, never a silent un-revoke. Real atomicity arrives with
  Postgres.
- **Per-request reduce-over-ledger** for revoked-before is O(events) on
  every authenticated request — epsilon at seed scale (no cache without a
  measured cost). Flag for the absolute-scale check at real traffic.
- **401-after-404 enumeration oracle** — harmless at this in-process tier
  (the client holds the route table); a networked tier inheriting
  match-first ordering must revisit.

## Self-review

- **Spec coverage:** JWT claim contract ✓ (A2:
  `AccessTokenClaims`); short-lived ✓ (`ttlSeconds`); gate at
  `handleRequest` verifying signature-seam + `exp`/`nbf` + revoked-before
  ✓ (F1); `RequestContext.identity` set once ✓ (C2); Bearer required ✓
  (F1, strict); build on SP-1 seams (identity store, `member.id ===
  identity.id`, the credential-ledger idiom reused for revocations) ✓.
- **Type consistency:** `Principal` (A2) is consumed identically in
  `RequestContext.identity` (C2), `principalFromToken` (A2/C2), and the
  gate (F1). `verifyAccessToken`/`revokedBeforeSeconds` signatures match
  their call in `authenticateRequest`. The verb-fn `token` param is
  optional in C2 and required in F1 — the only intentional signature
  evolution (the migration scaffold).
- **Green at each commit:** Phases A–E add optional/ungated machinery;
  F1 is the atomic flip-to-required + gate + negative tests. Every task
  ends on `TMPDIR=/tmp/claude ./validate` green.
- **Doctrine:** validators at the gate (B1); append-only ledger +
  derive-from-the-ledger (B/F); no null (ANONYMOUS_PRINCIPAL); token on
  the vessel, not a global (C2); single audited public-route surface
  (F1); deferred crypto named, not hidden.

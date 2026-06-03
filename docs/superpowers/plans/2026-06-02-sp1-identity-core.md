# SP-1 Identity Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking. Every subagent
> prompt MUST begin with the literal phrase `Go to Church!` and be
> briefed on the voice rules below.

**Goal:** Build the global `identity` layer on top of the
already-landed `worker→member` rename: an `identity` store, the
`member.id === identity.id` invariant, a separately-erasable
`identity_pii` row, and a minimal append-only `identity_credentials`
seam — so every principal (person or service) has a first-class,
correctly-isolated home for its sensitive data.

**Architecture:** Additive-first. New stores/adapters/routes/tests
land while the `member` tables are untouched; then PII *moves* out of
`members`/`human_members` into `identity_pii` (two semantic moves);
then erasure and the credential ledger land. Storage truth flows App →
`RequestContext` → internal HTTP API (`api/api.ts`) → `DbAdapter` →
localStorage. `EntityStore` (splice) backs `identity`/`identity_pii`;
`HistoryEntityStore` (append-only) backs `identity_credentials`.

**Tech Stack:** Vanilla TypeScript (ES2024, strict,
`noUncheckedIndexedAccess`), zero runtime deps. Tests: `node --test
--strip-types` via `MemoryDbAdapter`. `./validate` is the gate.

---

## Context — why this change

Today an identity has no home of its own: a `member` row carries both
its display `name` and (for humans) its contact PII
(`email`/`phone`/`bio`) directly on the `members`/`human_members`
tables. There is no notion of a principal that spans orgs, no PII
isolation, and no place for credentials. SP-1 is the foundation of the
larger Identity/Auth/Multi-Tenancy transformation
(`~/.claude/plans/go-to-church-generic-diffie.md`): it introduces the
global `identity`, establishes `member.id === identity.id` (zero id
*value* churn), and splits sensitive data into separately-erasable
facets. Everything downstream (token gate SP-3, authorization SP-4,
authentication SP-5, tenancy SP-2, identity surface SP-6) builds on
the seam this plan lays.

Step 0 — the pure `worker→member` rename — has **already landed** on
master (`b0690b7 → 361c207 → a7d73c1`, `./validate` green). This plan
is the *content* layer that builds on it; it does **not** repeat the
rename.

## Locked decisions (from brainstorm)

1. **`kind` = the nature of the principal**, `person | service` —
   **NOT** "has PII vs no PII." That framing was wrong: services carry
   sensitive data too (secrets/credentials). Re-document `kind`
   accordingly in types, comments, and SCHEMA.md.

2. **`name` is erasable PII (Option 2).** `name` moves OFF the shared
   `members` parent. Persons store `name`/`email`/`phone`/`bio` in
   `identity_pii` (fully erasable). The two **service** identities keep
   a non-secret display label elsewhere: an **AI** member's name moves
   to `ai_members.name` (catalog data); the **system** actor's name
   becomes a named constant `SYSTEM_MEMBER_NAME`.

3. **Identity has multiple separately-isolatable sensitive facets.**
   `identity_pii` (human contact PII) is **spliced** on erasure
   (`EntityStore.delete` — destroy). `identity_credentials` (secrets)
   is an **append-only ledger** (`HistoryEntityStore`) where
   revocation is a *new* event (retain history) — never a splice. SP-1
   demonstrates both erasure disciplines side by side.

4. **The credential seam is a SEAM, not SP-5.** It establishes the
   store, the append-only lifecycle, and the isolation. It explicitly
   does NOT build OAuth machinery. **SP-5 owns** the `clients`
   registry (JWKS, redirect URIs, grant types), the `identity_tokens`
   ledger (issued/rotated/revoked JWTs + reuse-detection),
   `identity_providers` (external IdP links), and all cryptographic
   verification (passkey, DPoP, `private_key_jwt`). SP-1 credential
   kinds are limited to `password` (person) and `client_secret`
   (service); asymmetric/JWKS material is deferred to SP-5's `clients`.

5. **Absence is modeled at the call site, never in a helper.** PII
   presence is a tagged union `MemberPii` (`{erased:false, …}` |
   `{erased:true}`) — no null, no sentinel, no default. Presenters
   switch on it and supply a per-site fallback constant.

## Deviations from the authoritative spec (confirm at approval)

- **PII path is flat, not nested.** The spec wrote
  `route('identities/:id/pii')`; this plan uses `identity-pii/:id`
  (GET/PUT/DELETE) to match the existing detail-table convention
  (`human-members/:id`, not `members/:id/human`). Same table, same
  splice; only the URL shape differs.
- **Credential seam added** beyond the original spec (your call): a
  minimal `identity_credentials` append-only ledger, bounded as in
  decision 4.

## Execution findings (codebase) — folded in during the run

Grounding the live codebase before execution surfaced gaps the
brainstorm could not have known. Recorded here so they do not hide
(and so SP-2..6 inherit them):

1. **`SCHEMA.svg` is generated, and `./validate` gates it.**
   `web-app/app/generate-schema-svg.ts` derives the ERD from
   `api/db.ts` (the `DbAdapter` store map + `TABLE_NAMES`) and
   `api/types.ts` (entity interfaces). `./validate` runs
   `./generate-schema-svg --check` and FAILS on drift. So every task
   that adds a table, changes the `DbAdapter` interface, or reshapes
   an entity's columns MUST run `./generate-schema-svg` and commit the
   regenerated `SCHEMA.svg`. Affected: **A2** (identities,
   identity_pii), **C1**/**C2** (member/human/ai columns), **E1**
   (identity_credentials). Add `SCHEMA.svg` to those tasks' `git add`.

2. **Every `TABLE_NAMES` entry needs a `DbAdapter` interface store
   field, typed `EntityStore`/`SingletonStore`.**
   `generate-schema-svg` throws on a store/table count mismatch and
   its regex matches only those two generics. So `identity_credentials`
   — though instantiated as a `HistoryEntityStore` — MUST be DECLARED
   in the interface as `EntityStore<IdentityCredentialEntity>` (the
   `flowVersions` precedent), or the generator throws.

3. **The sandbox gate is `TMPDIR=/tmp/claude ./validate`.** The
   generator runs `npx tsx`; under the Claude Code sandbox its IPC
   socket must land in `/tmp/claude/tsx-501`. Bare `./validate` fails
   for sandbox reasons unrelated to the code.

These do not alter the architecture — they complete the parent spec's
"add an entity store" ritual with its missing step: regenerate the
derived ERD.

4. **Phase C cannot be four green commits — the tagged-union
   migration is atomic.** `HumanMember.name()` is POLYMORPHIC on the
   `Member` union (called on union-typed values in
   `flow-designer-view`, `flow-stats`, and `memberName` itself), and
   `emailAddress`/`phoneNumber`/`bioText` have direct callers in
   `command-palette`, `human-member-detail`, and the `member`
   presenter. Removing them (plan C1) breaks ~10 call sites that plan
   C3/C4 only fix later — an intermediate NON-COMPILING commit,
   forbidden by the Office of the Commit AND by this plan's own
   per-task `./validate` gate. The type system makes "reshape the
   type" and "migrate the readers" the SAME atomic act; a tagged-union
   migration cannot be half-applied. Plan C4's caller list was also
   incomplete — it missed `flow-stats.ts:60` (`w.name()`),
   `tests/adapters-shared.test.ts`, and
   `tests/adapters-members-union.test.ts`. **Resequenced
   (user-approved) into two green commits, identical end state and
   doctrine:**
   - **C-A "Move human PII to identity_pii"** = plan C1 + C3 + C4:
     storage reshape + `HumanMember.pii()` + the adapter read/write
     split + `memberName()`'s `ERASED_MEMBER_NAME` + EVERY human
     name/email/phone/bio reader (all display sites, `flow-stats`, and
     the reshaped tests) + `SCHEMA.svg` regen. One green commit.
   - **C-B "Move display name off members parent"** = plan C2 +
     `SCHEMA.svg` regen. One green commit.

## Voice rules (push down to every subagent)

78-char max line; 4-space indent; no inline `style=""` (CSS custom
properties + classes); `snake_case` storage ↔ `camelCase` domain;
HTTP-verb adapter naming (`getNoun`/`putNoun`/`deleteNoun`/
`postNounOperation`); validators at the gate only; columns NOT NULL
(absence = absent row); ledgers append-only (reversal is a new event);
`RequestContext` is the sole adapter argument; presenters emit
`SafeHtml`; present-tense imperative commit messages; `Co-Authored-By`
trailer. **Commandments in play:** III Uniformity (Rectification of
Names — fix `kind`), VI Immutability, VII Idempotency (PUT/DELETE),
IX Generality (no premature abstraction — credential seam stays
minimal). **Abominations risked:** Null, Default Values, Internal
Defense, Foreign Tongues, Premature Generalization. **Pattern to
match:** the store-injected validator gate (`store-entity.ts:72`).

---

## Target storage shapes

```
members        { id, type }                  name REMOVED
identity       { id, kind }                  NEW (person|service)
identity_pii   { id, name, email, phone,     NEW; persons only
                 bio }                        EntityStore (splice)
identity_credentials                          NEW; append-only
               { id, identity_id, kind,       HistoryEntityStore
                 status, secret, at }
human_members  { id, title, department,      email/phone/bio gone
                 strengths, team_dimensions }
ai_members     { id, name, description,      name ADDED (catalog)
                 skill_focus, model }
system actor   name = SYSTEM_MEMBER_NAME     constant (no pii row)

kind:  human → person   ai → service   system → service
erasable PII (splice):       person name/email/phone/bio
revocable creds (append):    password (person) / client_secret (svc)
```

## File map

**Create**
- `web-app/app/adapters/identities.ts` — identity + PII adapter.
- `web-app/app/adapters/identity-credentials.ts` — credential ledger
  adapter.
- `tests/identity-fixtures.ts` — seed/build helpers for tests.
- `tests/adapters-identities.test.ts`
- `tests/api-identities.test.ts`
- `tests/adapters-identity-credentials.test.ts`

**Modify (core data layer)**
- `api/types.ts` — new entities/types/classes; reshape member types;
  `MemberPii` union; `SYSTEM_MEMBER_NAME`.
- `api/validators.ts` — new validators; reshape member validators.
- `api/db.ts` — interface fields + `TABLE_NAMES`.
- `api/db-localstorage.ts`, `api/db-memory.ts` — store instantiation.
- `api/api.ts` — new routes.
- `api/mock-data.ts` — seed identities/pii/credentials; reshape member
  seeding; bootstrap path.

**Modify (adapters / presentation ripple)**
- `web-app/app/adapters/members.ts`, `ai-members.ts`,
  `members-union.ts` — three/four-row split; name sourcing.
- `tests/member-fixtures.ts` — new member shape.
- Display sites (enumerated in Task C4).

**Modify (docs)**
- `SCHEMA.md` — new tables + reframed `kind` + table-count.

---

## Phase A — Identity + PII stores (additive; members untouched)

### Task A1: Identity & PII entities, kind, validators

**Files:**
- Modify: `api/types.ts` (near the member entities, ~`391`)
- Modify: `api/validators.ts` (after `validateMemberEntity`, ~`599`)
- Test: `tests/api-identities.test.ts` (new)

- [ ] **Step 1: Write failing validator tests**

```ts
// tests/api-identities.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateIdentityEntity,
    validateIdentityPiiEntity,
} from '../api/validators.ts';

test('validateIdentityEntity accepts person/service', () => {
    assert.deepEqual(
        validateIdentityEntity({ kind: 'person' }),
        { kind: 'person' },
    );
    assert.deepEqual(
        validateIdentityEntity({ kind: 'service' }),
        { kind: 'service' },
    );
});

test('validateIdentityEntity rejects bad kind', () => {
    assert.throws(() =>
        validateIdentityEntity({ kind: 'robot' }));
});

test('validateIdentityEntity rejects extra keys', () => {
    assert.throws(() =>
        validateIdentityEntity({ kind: 'person', name: 'x' }));
});

test('validateIdentityPiiEntity requires four fields', () => {
    assert.deepEqual(
        validateIdentityPiiEntity({
            name: 'Tony Stark',
            email: 'demo@example.com',
            phone: '+1 (555) 123-4567',
            bio: 'Builder.',
        }),
        {
            name: 'Tony Stark',
            email: 'demo@example.com',
            phone: '+1 (555) 123-4567',
            bio: 'Builder.',
        },
    );
});

test('validateIdentityPiiEntity rejects missing field', () => {
    assert.throws(() =>
        validateIdentityPiiEntity({
            name: 'x', email: 'y', phone: 'z',
        }));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --strip-types tests/api-identities.test.ts`
Expected: FAIL — `validateIdentityEntity` is not exported.

- [ ] **Step 3: Add the types** (`api/types.ts`)

```ts
// A principal that spans the whole platform. `kind` is the
// NATURE of the principal — a person (a human being) or a
// service (an automated agent / API client / the platform
// itself) — NOT a statement about whether it has sensitive
// data. Both kinds carry sensitive facets: persons an
// identity_pii row, services credentials (SP-5). The id is
// the universal key: member.id === identity.id, always.
export type IdentityKind = 'person' | 'service';

export interface IdentityEntity {
    id: Id;
    kind: IdentityKind;
}

// The person-PII facet, keyed by the shared identity id. A
// separately-erasable row: erasing PII splices THIS row;
// the identity, the member, and every member_id reference
// survive. Services have no row here (their secrets live in
// identity_credentials). All fields NOT NULL — absence of
// the row, not a null column, models erased PII.
export interface IdentityPiiEntity {
    id: Id;
    name: string;
    email: string;
    phone: string;
    bio: string;
}

// The person-PII display facet as a tagged union, so the
// ABSENCE of the row (erased PII) is represented without
// null and DECIDED AT THE CALL SITE. Presenters switch on
// `erased` and supply their own fallback constant.
export type MemberPii =
    | {
        readonly erased: false;
        readonly name: string;
        readonly email: string;
        readonly phone: string;
        readonly bio: string;
    }
    | { readonly erased: true };

export class Identity {
    readonly #id: Id;
    readonly #kind: IdentityKind;

    constructor(entity: IdentityEntity) {
        this.#id = entity.id;
        this.#kind = entity.kind;
    }

    idForLink(): string {
        return this.#id;
    }

    kindValue(): IdentityKind {
        return this.#kind;
    }

    isPerson(): boolean {
        return this.#kind === 'person';
    }

    isService(): boolean {
        return this.#kind === 'service';
    }
}
```

- [ ] **Step 4: Add the validators** (`api/validators.ts`)

```ts
const IDENTITY_BODY_KEYS: readonly string[] = ['kind'];

export function validateIdentityEntity(
    body: Record<string, unknown>,
): Omit<IdentityEntity, 'id'> {
    assertOnlyKeys(
        body, IDENTITY_BODY_KEYS, 'IdentityEntity',
    );
    const kind = pickString(body, 'kind');
    if (kind !== 'person' && kind !== 'service') {
        throw new Error(
            'invalid identity kind "' + kind
            + '" on IdentityEntity',
        );
    }
    return { kind };
}

const IDENTITY_PII_BODY_KEYS: readonly string[] = [
    'name', 'email', 'phone', 'bio',
];

export function validateIdentityPiiEntity(
    body: Record<string, unknown>,
): Omit<IdentityPiiEntity, 'id'> {
    assertOnlyKeys(
        body, IDENTITY_PII_BODY_KEYS, 'IdentityPiiEntity',
    );
    return {
        name: pickString(body, 'name'),
        email: pickString(body, 'email'),
        phone: pickString(body, 'phone'),
        bio: pickString(body, 'bio'),
    };
}
```

Add `IdentityEntity`, `IdentityPiiEntity` to the type import in
`api/validators.ts`.

- [ ] **Step 5: Run to verify pass**

Run: `node --test --strip-types tests/api-identities.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/types.ts api/validators.ts tests/api-identities.test.ts
git commit -m "Add identity and identity_pii entities and validators"
```

### Task A2: Register the stores

**Files:**
- Modify: `api/db.ts` (interface ~`147`, `TABLE_NAMES` ~`204`)
- Modify: `api/db-localstorage.ts` (~`117`), `api/db-memory.ts` (~`112`)

- [ ] **Step 1:** Add to the `DbAdapter` interface (`api/db.ts`),
  beside the member stores, and import the new entity types:

```ts
    identities:
        EntityStore<IdentityEntity>;
    identityPii:
        EntityStore<IdentityPiiEntity>;
```

- [ ] **Step 2:** Add table names to `TABLE_NAMES` (`api/db.ts`),
  right after `'ai_members'`:

```ts
    'identities',
    'identity_pii',
```

- [ ] **Step 3:** Instantiate in BOTH adapters (mirror the
  `humanMembers` block) — `api/db-localstorage.ts` and
  `api/db-memory.ts`:

```ts
        this.identities =
            new EntityStore(
                'identities', backend, stateStore,
                validateIdentityEntity,
            );
        this.identityPii =
            new EntityStore(
                'identity_pii', backend, stateStore,
                validateIdentityPiiEntity,
            );
```

Add the two field declarations (`readonly identities: …`) and import
`validateIdentityEntity`, `validateIdentityPiiEntity` in both adapter
files.

- [ ] **Step 4:** Type-check.

Run: `npx tsc --noEmit -p web-app/app/tsconfig.json`
Expected: PASS (no route/adapter references the stores yet).

- [ ] **Step 5: Commit**

```bash
git add api/db.ts api/db-localstorage.ts api/db-memory.ts
git commit -m "Register identity and identity_pii stores"
```

### Task A3: Routes for identity and identity_pii

**Files:**
- Modify: `api/api.ts` (member routes block, ~`153–390`)
- Test: `tests/api-identities.test.ts`

- [ ] **Step 1: Add failing API round-trip test** (append to
  `tests/api-identities.test.ts`):

```ts
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { PUT, GET, DELETE } from '../api/api.ts';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    return db;
}

test('PUT then GET an identity round-trips', async () => {
    const db = await freshDb();
    await PUT(db, 'identities/abc', { kind: 'person' });
    const got = await GET<{ id: string; kind: string }>(
        db, 'identities/abc',
    );
    assert.deepEqual(got, { id: 'abc', kind: 'person' });
});

test('DELETE identity-pii splices only the pii row',
async () => {
    const db = await freshDb();
    await PUT(db, 'identities/abc', { kind: 'person' });
    await PUT(db, 'identity-pii/abc', {
        name: 'A', email: 'a@x.io', phone: 'p', bio: 'b',
    });
    await DELETE(db, 'identity-pii/abc');
    await assert.rejects(
        () => GET(db, 'identity-pii/abc'));
    const id = await GET<{ id: string }>(db, 'identities/abc');
    assert.equal(id.id, 'abc');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --strip-types tests/api-identities.test.ts`
Expected: FAIL — 404 (routes missing).

- [ ] **Step 3: Add routes** (`api/api.ts`, after the member routes;
  validators run inside the store, so payloads pass through with the
  established cast — mirror `human-members/:id`):

```ts
    route('identities', {
        get: (db) => db.identities.getAll(),
    }),
    route('identities/:id', {
        get: (db, p) =>
            db.identities.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.identities.put(
                param(p, 0),
                withoutId(payload) as unknown as
                    Omit<IdentityEntity, 'id'>,
            ),
    }),
    route('identity-pii', {
        get: (db) => db.identityPii.getAll(),
    }),
    route('identity-pii/:id', {
        get: (db, p) =>
            db.identityPii.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.identityPii.put(
                param(p, 0),
                withoutId(payload) as unknown as
                    Omit<IdentityPiiEntity, 'id'>,
            ),
        delete: (db, p) =>
            db.identityPii.delete(param(p, 0)),
    }),
```

Import `IdentityEntity`, `IdentityPiiEntity` in `api/api.ts`.

- [ ] **Step 4: Run to verify pass**

Run: `node --test --strip-types tests/api-identities.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/api.ts tests/api-identities.test.ts
git commit -m "Route identity and identity_pii through the API"
```

### Task A4: Identity adapter + fixtures

**Files:**
- Create: `web-app/app/adapters/identities.ts`
- Create: `tests/identity-fixtures.ts`
- Create: `tests/adapters-identities.test.ts`

- [ ] **Step 1: Write the fixtures** (`tests/identity-fixtures.ts`) —
  the single home for the test-side identity shape:

```ts
import type { MemoryDbAdapter } from '../api/db-memory.ts';

export async function seedPersonIdentity(
    db: MemoryDbAdapter,
    id: string,
    pii: {
        name: string; email: string;
        phone: string; bio: string;
    },
): Promise<void> {
    await db.identities.put(id, { kind: 'person' });
    await db.identityPii.put(id, pii);
}

export async function seedServiceIdentity(
    db: MemoryDbAdapter,
    id: string,
): Promise<void> {
    await db.identities.put(id, { kind: 'service' });
}
```

- [ ] **Step 2: Write failing adapter test**
  (`tests/adapters-identities.test.ts`):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getIdentity,
    getMemberPii,
    deleteIdentityPii,
} from '../web-app/app/adapters/identities.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';

async function setup() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    return { db, ctx: createRequestContext(db) };
}

test('getIdentity reads kind', async () => {
    const { db, ctx } = await setup();
    await seedPersonIdentity(db, 'p1', {
        name: 'P', email: 'p@x.io', phone: '1', bio: 'b',
    });
    const id = await getIdentity(ctx, 'p1');
    assert.equal(id.isPerson(), true);
});

test('getMemberPii is present, then erased after delete',
async () => {
    const { db, ctx } = await setup();
    await seedPersonIdentity(db, 'p1', {
        name: 'P', email: 'p@x.io', phone: '1', bio: 'b',
    });
    const before = await getMemberPii(ctx, 'p1');
    assert.equal(before.erased, false);
    await deleteIdentityPii(ctx, 'p1');
    const after = await getMemberPii(ctx, 'p1');
    assert.equal(after.erased, true);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `node --test --strip-types tests/adapters-identities.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the adapter**
  (`web-app/app/adapters/identities.ts`). `RequestContext` is the sole
  argument; the PII read returns the tagged union, surfacing absence
  (an `EntityNotFound` from the store) rather than masking it:

```ts
import type { Id } from '../../../api/types.ts';
import {
    Identity,
    type IdentityEntity,
    type IdentityPiiEntity,
    type MemberPii,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';

export async function getIdentity(
    ctx: RequestContext,
    id: Id,
): Promise<Identity> {
    const entity = await ctx.GET<IdentityEntity>(
        `identities/${id}`,
    );
    return new Identity(entity);
}

// Returns the tagged union. A missing pii row (erased, or a
// service identity) is reported as erased — the CALLER, not
// this adapter, decides what to display.
export async function getMemberPii(
    ctx: RequestContext,
    id: Id,
): Promise<MemberPii> {
    const all = await ctx.GET<IdentityPiiEntity[]>(
        'identity-pii',
    );
    const row = all.find(r => r.id === id);
    if (row === undefined) {
        return { erased: true };
    }
    return {
        erased: false,
        name: row.name,
        email: row.email,
        phone: row.phone,
        bio: row.bio,
    };
}

export async function putMemberPii(
    ctx: RequestContext,
    id: Id,
    pii: Omit<IdentityPiiEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`identity-pii/${id}`, { ...pii });
}

export async function deleteIdentityPii(
    ctx: RequestContext,
    id: Id,
): Promise<void> {
    await ctx.DELETE(`identity-pii/${id}`);
}
```

- [ ] **Step 5: Run to verify pass**

Run: `node --test --strip-types tests/adapters-identities.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web-app/app/adapters/identities.ts tests/identity-fixtures.ts \
    tests/adapters-identities.test.ts
git commit -m "Add identity adapter with tagged-union PII reads"
```

---

## Phase B — Seed identities alongside members (additive)

Seeds identities + pii for every seed member, with `id === member.id`,
while the member tables still carry their current columns. This proves
the id-equality invariant before the move; the brief seed-only
duplication of name/email/etc. is removed in Phase C.

### Task B1: Seed identities in mock + bootstrap

**Files:**
- Modify: `api/mock-data.ts` (human seed ~`689`, AI seed ~`6029`,
  bootstrap ~`6262`)
- Modify: `api/types.ts` (add `SYSTEM_MEMBER_NAME`)

- [ ] **Step 1:** Add the system-name constant beside
  `SYSTEM_MEMBER_ID` (`api/types.ts:399`):

```ts
export const SYSTEM_MEMBER_NAME = 'System';
```

- [ ] **Step 2:** In `populateMockData`, add identity + pii puts to the
  human `Promise.all` (alongside the existing `members.put` /
  `humanMembers.put`):

```ts
                adapter.identities.put(member.id, {
                    kind: 'person',
                }),
                adapter.identityPii.put(member.id, {
                    name,
                    email: detail.email,
                    phone: detail.phone,
                    bio: detail.bio,
                }),
```

For the AI seed `flatMap` add `adapter.identities.put(m.id, { kind:
'service' })`; for the system member add `adapter.identities.put(
SYSTEM_MEMBER_ID, { kind: 'service' })`. No pii rows for services.

- [ ] **Step 3:** Mirror the same identity/pii puts in
  `populateBootstrapData` for `'system'` (service) and `'current'`
  (person + pii: `name 'Tony Stark'`, `email demo@example.com`,
  `phone`, `bio` — the values already inline there).

- [ ] **Step 4: Add a bootstrap invariant test** (new file
  `tests/api-identities.test.ts` already exists; append):

```ts
test('bootstrap seeds an identity per member, id-equal',
async () => {
    const db = await freshDb();
    const { populateBootstrapData } =
        await import('../api/mock-data.ts');
    await populateBootstrapData(db);
    const sys = await GET<{ kind: string }>(
        db, 'identities/system');
    assert.equal(sys.kind, 'service');
    const cur = await GET<{ kind: string }>(
        db, 'identities/current');
    assert.equal(cur.kind, 'person');
});
```

- [ ] **Step 5: Validate.**

Run: `./validate`
Expected: PASS (mock-data validity test still green; new test passes).

- [ ] **Step 6: Commit**

```bash
git add api/mock-data.ts api/types.ts tests/api-identities.test.ts
git commit -m "Seed an identity for every seed member"
```

---

## Phase C — Move PII out of the member tables (the breaking change)

Two semantic moves, each its own commit. Each is a *move* of content
between tables — one coherent operation, never mixed with unrelated
changes (Office of the Commit).

### Task C1: Move human contact PII to identity_pii

**Files:**
- Modify: `api/types.ts` (`HumanMemberEntity`, `HumanMember`)
- Modify: `api/validators.ts` (`validateHumanMemberEntity`)
- Modify: `web-app/app/adapters/members.ts`
- Modify: `api/mock-data.ts` (human seed + bootstrap detail)
- Modify: `tests/member-fixtures.ts`
- Modify: `tests/adapters-members.test.ts`

- [ ] **Step 1: Update the human tests to the new shape first** (they
  fail). In `tests/adapters-members.test.ts`, the human draft loses
  `email`/`phone`/`bio`; assertions for those move to an
  `identity_pii` read. (Full draft-builder shown in C3.)

- [ ] **Step 2: Reshape the storage type** (`api/types.ts`):

```ts
export interface HumanMemberEntity {
    id: MemberId;
    title: string;
    department: string;
    strengths: JsonArrayField;
    team_dimensions: JsonObjectField;
}
```

- [ ] **Step 3: Reshape the validator** (`api/validators.ts`) — drop
  `email`/`phone`/`bio` from `HUMAN_MEMBER_BODY_KEYS` and the returned
  object.

- [ ] **Step 4: Reshape the domain class** (`api/types.ts`,
  `HumanMember`). Constructor takes the parent, the (slimmer) detail,
  the `MemberPii` union, and state. Replace the direct
  `name()/emailAddress()/phoneNumber()/bioText()` accessors with a
  single `pii(): MemberPii`; keep all org-profile accessors;
  `matchesSearch` searches title/department always and name/email only
  when not erased:

```ts
    readonly #pii: MemberPii;
    // …
    constructor(
        parent: MemberEntity,
        detail: HumanMemberEntity,
        pii: MemberPii,
        state: MemberState,
    ) {
        this.#id = parent.id;
        this.#pii = pii;
        this.#title = detail.title;
        this.#department = detail.department;
        this.#state = state;
        this.#strengths = detail.strengths;
        this.#teamDimensions = detail.team_dimensions;
    }

    pii(): MemberPii {
        return this.#pii;
    }

    matchesSearch(term: string): boolean {
        const t = term.toLowerCase();
        if (
            this.#title.toLowerCase().includes(t)
            || this.#department.toLowerCase().includes(t)
        ) {
            return true;
        }
        if (this.#pii.erased) return false;
        return (
            this.#pii.name.toLowerCase().includes(t)
            || this.#pii.email.toLowerCase().includes(t)
        );
    }
```

- [ ] **Step 5: Update the adapter** (`web-app/app/adapters/
  members.ts`). `getHumanMemberMap`/`getHumanMember` add a parallel
  `getMemberPii` read and pass the union to the constructor;
  `putHumanMember`/`postHumanMemberCreation` split the write across
  `identity-pii/{id}` (name/email/phone/bio) and `human-members/{id}`
  (title/department/strengths/team_dimensions), and ensure an
  `identities/{id}` row exists (`{ kind: 'person' }`). Reshape
  `HumanMemberDraft` so PII and org-profile fields are distinct at the
  write seam. Add `'identity_pii'` to `humanMemberChanges`’ channel
  list.

- [ ] **Step 6:** Update human seeding (`api/mock-data.ts`) so
  `humanMembers.put` no longer receives `email`/`phone`/`bio` (now
  only on `identityPii.put`), and the bootstrap `humanMembers.put(
  'current', …)` likewise. Update `tests/member-fixtures.ts`
  `humanDetail`/`makeHumanMember`/`seedHumanMember` to the new shape
  (seed identity + pii; build `HumanMember` with a `MemberPii`).

- [ ] **Step 7: Validate.**

Run: `./validate`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/types.ts api/validators.ts api/mock-data.ts \
    web-app/app/adapters/members.ts tests/member-fixtures.ts \
    tests/adapters-members.test.ts
git commit -m "Move human contact PII to identity_pii"
```

### Task C2: Move the display name off the members parent

**Files:**
- Modify: `api/types.ts` (`MemberEntity`, `AIMemberEntity`,
  `HumanMember`/`AIMember`/`SystemMember`, `MemberPii` source)
- Modify: `api/validators.ts` (`validateMemberEntity`,
  `validateAIMemberEntity`)
- Modify: `web-app/app/adapters/members.ts`, `ai-members.ts`,
  `members-union.ts`
- Modify: `api/mock-data.ts`, `tests/member-fixtures.ts`

- [ ] **Step 1: Tests to new shape first** (member parent has no
  `name`; AI name read from `ai_members`; system name is the
  constant). They fail.

- [ ] **Step 2: Reshape types** (`api/types.ts`):

```ts
export interface MemberEntity {
    id: MemberId;
    type: MemberKind;
}

export interface AIMemberEntity {
    id: MemberId;
    name: string;
    description: string;
    skill_focus: string;
    model: ModelId;
}
```

- [ ] **Step 3:** `MemberEntity` no longer supplies a name.
  - `HumanMember` already sources name from `pii()` (Task C1) — drop
    the `parent.name` read.
  - `AIMember` sources `#name` from `detail.name` (the AI detail row).
  - `SystemMember` sources `#name` from `SYSTEM_MEMBER_NAME` (no longer
    from `parent.name`).

- [ ] **Step 4: Reshape validators** (`api/validators.ts`):
  `MEMBER_BODY_KEYS = ['type']`; add `'name'` to `AI_MEMBER_BODY_KEYS`
  and the returned `AIMemberEntity`.

- [ ] **Step 5: Update seeding + adapters.** `members.put` calls drop
  `name` everywhere (`api/mock-data.ts` human/AI/system + bootstrap);
  AI `aiMembers.put` now includes `name`. `ai-members.ts` adapter
  read/write threads `name` through the AI detail row.
  `members-union.ts` `getMemberMap` is unaffected structurally;
  `memberName` is updated in C4. Update `tests/member-fixtures.ts`.

- [ ] **Step 6: Validate & commit.**

Run: `./validate` → PASS.

```bash
git add api/types.ts api/validators.ts api/mock-data.ts \
    web-app/app/adapters/members.ts \
    web-app/app/adapters/ai-members.ts \
    web-app/app/adapters/members-union.ts tests/member-fixtures.ts
git commit -m "Move the display name off the members parent row"
```

### Task C3: Adapter & union name resolution

**Files:**
- Modify: `web-app/app/adapters/members-union.ts`

- [ ] **Step 1:** `memberName(map, id)` resolves an event author for
  display. For an AI/system member it returns the catalog/constant
  name. For a human, it switches on `pii()`: present → `name`; erased
  → a named constant `ERASED_MEMBER_NAME = 'Unknown member'`. This is
  **visible degradation** (Article: degrade visibly), not a fake-name
  default — it is the single author-resolution point and tells the
  truth about erasure:

```ts
export const ERASED_MEMBER_NAME = 'Unknown member';

export function memberName(
    memberMap: Map<MemberId, Member>,
    memberId: MemberId,
): string {
    const member = memberMap.get(memberId);
    if (!member) {
        throw new Error(
            'memberName: unknown member ' + memberId,
        );
    }
    if (member.kind === 'human') {
        const pii = member.pii();
        return pii.erased ? ERASED_MEMBER_NAME : pii.name;
    }
    return member.name();
}
```

- [ ] **Step 2: Validate & commit.**

```bash
git add web-app/app/adapters/members-union.ts
git commit -m "Resolve erased author names as visible degradation"
```

### Task C4: Display-site ripple (presenters)

Every site that read `member.name()/emailAddress()/phoneNumber()/
bioText()` on a **human** now reads `member.pii()` and switches at the
call site. AI/system name reads are unchanged. Apply this one pattern;
the sites are enumerated below.

**Pattern (worked example — header greeting):**

```ts
// web-app/app/header-info.ts — was: const name = member.name();
const pii = member.pii();
const name = pii.erased ? ERASED_MEMBER_NAME : pii.name;
```

Per-field fallbacks reuse the existing `DISPLAY_ABSENT` constant for
contact fields (email/phone/bio) and `ERASED_MEMBER_NAME` for the
name, each chosen **at the call site**.

**Files (each its own small commit, or one commit titled "Source
human PII from identity_pii at display sites"):**
- `web-app/app/header-info.ts` (greeting name)
- `web-app/app/sidebar-member.ts` (chip name)
- `web-app/app/presenters/human-member-detail.ts` (title/avatar
  initials, name, email, phone, bio — readonly + editable draft)
- `web-app/app/presenters/member.ts` (`HumanMemberRowPresenter`:
  avatar initials, name, email subtitle)
- `web-app/app/command-palette.ts` (search title + email keywords;
  skip name/email keywords when erased)
- `web-app/app/presenters/flow-designer-view.ts` (human sort key +
  checkbox label)

- [ ] **Step 1:** For each file, replace human `name()/emailAddress()/
  phoneNumber()/bioText()` reads with the `pii()` switch above,
  importing `ERASED_MEMBER_NAME` (and reusing `DISPLAY_ABSENT`).
- [ ] **Step 2:** The human-member edit form (`human-member-detail.ts`)
  writes name/email/phone/bio back through `putMemberPii` and the
  org-profile fields through the member write seam (Task C1) — keep
  the draft shape for the form, split at save.
- [ ] **Step 3: Validate.** `./validate` → PASS.
- [ ] **Step 4:** Manual browser smoke (Phase F verification) after the
  suite is green.
- [ ] **Step 5: Commit.**

```bash
git add web-app/app/header-info.ts web-app/app/sidebar-member.ts \
    web-app/app/presenters/human-member-detail.ts \
    web-app/app/presenters/member.ts web-app/app/command-palette.ts \
    web-app/app/presenters/flow-designer-view.ts
git commit -m "Source human PII from identity_pii at display sites"
```

---

## Phase D — PII erasure path + test

The DELETE route + `deleteIdentityPii` adapter already landed (Tasks
A3/A4). This phase proves the end-to-end erasure invariant and the
survival of the identity + member + a member_id-referencing state
event.

### Task D1: Erasure survival test

**Files:**
- Modify: `tests/adapters-identities.test.ts`

- [ ] **Step 1: Write the test:**

```ts
test('erasing PII keeps identity, member, and authored event',
async () => {
    const { db, ctx } = await setup();
    // seed a person identity + member + an authored state event
    await seedPersonIdentity(db, 'p1', {
        name: 'P', email: 'p@x.io', phone: '1', bio: 'b',
    });
    await db.members.put('p1', { type: 'human' });
    await db.states.record('e1', 'someEntity', 'active', 'p1');
    await deleteIdentityPii(ctx, 'p1');
    assert.equal((await getMemberPii(ctx, 'p1')).erased, true);
    assert.equal((await getIdentity(ctx, 'p1')).isPerson(), true);
    const events = await db.states.allFor('someEntity');
    assert.equal(events[0]!.member_id, 'p1');
});
```

- [ ] **Step 2:** Run → PASS (paths already exist).
- [ ] **Step 3: Commit.**

```bash
git add tests/adapters-identities.test.ts
git commit -m "Prove PII erasure preserves identity and references"
```

---

## Phase E — Credential seam (append-only ledger)

Independent of Phases C/D. Establishes the second sensitive facet with
the **opposite** erasure discipline (append-to-retain). Bounded per
locked decision 4 — no OAuth machinery.

### Task E1: Credential entity, validator, store

**Files:**
- Modify: `api/types.ts`, `api/validators.ts`, `api/db.ts`,
  `api/db-localstorage.ts`, `api/db-memory.ts`

- [ ] **Step 1: Types** (`api/types.ts`):

```ts
export type IdentityCredentialKind =
    | 'password'        // person: interactive secret
    | 'client_secret';  // service: shared secret

export type IdentityCredentialStatus =
    | 'set' | 'rotated' | 'revoked';

// Append-only credential lifecycle event. One row per
// event; current validity = the latest event per
// (identity_id, kind). `secret` is OPAQUE material that
// never escapes the adapter boundary — never rendered.
// Revocation is a NEW 'revoked' event, never a splice
// (contrast identity_pii). Real crypto and the OAuth
// stores (clients, identity_tokens, identity_providers)
// are SP-5; this is only the seam.
export interface IdentityCredentialEntity {
    id: Id;
    identity_id: Id;
    kind: IdentityCredentialKind;
    status: IdentityCredentialStatus;
    secret: string;
    at: string;
}
```

- [ ] **Step 2: Validator** (`api/validators.ts`) — `assertOnlyKeys`
  over `['identity_id','kind','status','secret','at']`; `kind` ∈
  {password, client_secret}; `status` ∈ {set, rotated, revoked};
  others `pickString`. Returns `Omit<IdentityCredentialEntity,'id'>`.

- [ ] **Step 3: Register** as a `HistoryEntityStore` (append-only,
  like `flow_versions`) in `api/db.ts` interface + `TABLE_NAMES`
  (`'identity_credentials'`), and instantiate in both adapters:

```ts
        this.identityCredentials =
            new HistoryEntityStore(
                'identity_credentials', backend,
                validateIdentityCredentialEntity,
            );
```

- [ ] **Step 4:** Type-check → PASS. **Commit:**

```bash
git add api/types.ts api/validators.ts api/db.ts \
    api/db-localstorage.ts api/db-memory.ts
git commit -m "Add append-only identity_credentials store"
```

### Task E2: Credential routes + adapter

**Files:**
- Modify: `api/api.ts`
- Create: `web-app/app/adapters/identity-credentials.ts`
- Create: `tests/adapters-identity-credentials.test.ts`

- [ ] **Step 1: Failing test** — set, rotate, revoke; assert the
  ledger retains all three events and current validity reflects the
  latest; assert the secret never appears in `getIdentityCredentialState`:

```ts
test('revocation appends, never splices', async () => {
    const { db, ctx } = await setup();
    await postIdentityCredentialSet(
        ctx, 'p1', 'password', 'hash-v1');
    await postIdentityCredentialRevocation(
        ctx, 'p1', 'password');
    const events = await db.identityCredentials.getAll();
    assert.equal(events.length, 2);          // retained
    const state = await getIdentityCredentialState(ctx, 'p1');
    assert.equal(state.active.length, 0);    // revoked
    assert.equal('secret' in state, false);  // never leaks
});
```

- [ ] **Step 2: Routes** (`api/api.ts`): `route('identity-credentials',
  { get, post })` where `post` appends an event with a fresh id; plus
  `route('identity-credentials/:id', { get })`. (POST creates an
  event; the ledger is append-only.)

- [ ] **Step 3: Adapter** (`web-app/app/adapters/identity-
  credentials.ts`) — verb-noun, process-first:
  - `postIdentityCredentialSet(ctx, identityId, kind, secret)`
  - `postIdentityCredentialRotation(ctx, identityId, kind, secret)`
  - `postIdentityCredentialRevocation(ctx, identityId, kind)`
  - `getIdentityCredentialState(ctx, identityId)` → reduces the ledger
    to the latest event per kind and returns `{ active:
    IdentityCredentialKind[] }` — **never** the `secret`.
  Each event id via `generateCryptoSafeBase62()`; `at` via `nowUtc()`.

- [ ] **Step 4:** Run → PASS. **Commit:**

```bash
git add api/api.ts web-app/app/adapters/identity-credentials.ts \
    tests/adapters-identity-credentials.test.ts
git commit -m "Add credential ledger adapter with revoke-to-retain"
```

### Task E3: Seed a demo credential

**Files:**
- Modify: `api/mock-data.ts`

- [ ] **Step 1:** In `populateMockData`/`populateBootstrapData`, append
  one `set` credential event for `current` (`kind 'password'`, an
  opaque placeholder secret) and one for the `system` service
  (`kind 'client_secret'`), so the seam carries live data. Use a fixed
  `MOCK_SEED_TIMESTAMP`.
- [ ] **Step 2: Validate.** `./validate` → PASS.
- [ ] **Step 3: Commit.**

```bash
git add api/mock-data.ts
git commit -m "Seed demo credentials for current and system"
```

---

## Phase F — Documentation

### Task F1: SCHEMA.md

**Files:**
- Modify: `SCHEMA.md`

- [ ] **Step 1:** Update the table count (`20` → `23`).
- [ ] **Step 2:** Add `### identity`, `### identity_pii`, and `###
  identity_credentials` sections under `## Core`, documenting columns,
  the `member.id === identity.id` invariant, splice-vs-append erasure,
  and that `kind` is the **principal nature**, not a PII flag.
- [ ] **Step 3:** Edit `### members` (drop `name`), `### human_members`
  (drop email/phone/bio), `### ai_members` (add `name`), and the
  `'system'` member note (it is now a `service` identity). Keep every
  line ≤ 78 chars (root `.md` lint).
- [ ] **Step 4: Validate** (lint catches over-long lines). `./validate`
  → PASS. **Commit:**

```bash
git add SCHEMA.md
git commit -m "Document identity tables and reframed kind"
```

---

## Verification

- **Gate:** `TMPDIR=/tmp/claude ./validate` after every task (tsc
  `--noEmit` + `node --test --strip-types tests/*.test.ts` + 78-char
  lint + `./generate-schema-svg --check`). A failure ABORTS — fix
  before proceeding. Tasks that touch the schema (A2, C1, C2, E1) must
  regenerate and commit `SCHEMA.svg`. `TMPDIR` is required because the
  SVG check runs `npx tsx`.
- **New automated coverage:** `tests/api-identities.test.ts`,
  `tests/adapters-identities.test.ts`,
  `tests/adapters-identity-credentials.test.ts`, plus reshaped
  `tests/adapters-members.test.ts` / `tests/member-fixtures.ts`.
  Key assertions: identity round-trips; `member.id === identity.id` on
  seed; PII erasure splices `identity_pii` while identity + member +
  authored state event survive; credential revocation **appends** (the
  ledger retains all events) and the secret never leaves the adapter.
- **Manual browser regression** (HTTP-only; sandbox invocation):

  ```bash
  TMPDIR=/tmp/claude ./serve 8080
  # open http://localhost:8080/landing/index.html
  ```

  Confirm: the Members page, the header greeting, and the sidebar chip
  render names/emails identically to before the move (seed PII is
  present); the member detail edit form saves name/email/phone/bio
  through `identity-pii`; AI member names render from `ai_members`. Add
  a TEST-PLAN.md case for the PII-erased fallback (drive a `DELETE
  identity-pii/current` and confirm "Unknown member" / `DISPLAY_ABSENT`
  appear) when SP-6 wires the erasure UI.

## Deferred / SP-5 boundary (named so it doesn't hide)

- **SP-5 owns:** the `clients` registry (JWKS, redirect URIs, grant
  types), the `identity_tokens` ledger (issued/rotated/revoked JWTs +
  reuse-detection), `identity_providers`, and all cryptographic
  verification. The SP-1 `identity_credentials` seam is the
  possessed-secret facet they build on — NOT the token ledger.
  Asymmetric/JWKS material and `public_key` credential kinds are SP-5.
  **Secret hashing + verification is SP-5/server-tier too:** the SP-1
  `secret` column stores opaque material UNHASHED (client-side mock,
  no verification path; seeds are obvious placeholders). Hashing is
  co-located with verification on the server — not half-applied at
  this seam, and bcrypt would break the zero-dependency rule. SP-1
  still enforces non-leakage: `getIdentityCredentialState` returns
  only active kinds, never the secret. (Raised by automated security
  review of the E1 commit; deferred per scope, recorded here.)
- **`RequestContext.identity`** (the resolved principal) is added by
  **SP-3** (token gate), not here.
- **Per-org profile divergence**, **in-place migration tier**, and the
  **erased-name UI** (SP-6) remain deferred per the parent spec.

## Self-review notes

- **Spec coverage:** identity store ✓ (A1–A4); `member.id ===
  identity.id` ✓ (B1, seed + adapter); PII split incl. name ✓ (C1–C2);
  erasure via splice ✓ (A3 route + D1); call-site fallback ✓ (C3–C4);
  reuse of `generateCryptoSafeBase62`/`EntityStore`/
  `HistoryEntityStore`/`createRequestContext`/`route`/`MemoryDbAdapter`
  ✓; mock + bootstrap seeding ✓ (B1); credential seam ✓ (E); docs ✓
  (F1).
- **Type consistency:** `MemberPii` (A1) is consumed identically in
  `HumanMember` (C1), the adapter (A4/C1), `memberName` (C3), and the
  display sites (C4). `getMemberPii` returns `MemberPii` everywhere.
- **On execution**, persist this plan to
  `docs/superpowers/plans/2026-06-02-sp1-identity-core.md` and the
  parent spec to `docs/superpowers/specs/`, then commit (the parent
  spec's "next step after approval").

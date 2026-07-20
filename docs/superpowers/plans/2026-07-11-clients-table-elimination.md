# Clients-Table Elimination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Delete the last entity table (`clients`) so
`TABLE_NAMES` is the pure message plane (`requests` +
`responses`), replacing client config with a pair-plane
registration facet at `identities/:id/registration`, plus
`act.sub` wiring on the authorization_code grant and a
registration UI on the identities detail page.

**Architecture:** Client = kind-`'service'` identity + a
single-slot PUT-overwrite registration document derived from
message pairs. The facet is a **hand-written route closure**
(the `identities/:id/credentials/:cid` template — Supersedes-
chained `appendMessagePair`) at a **pii-shaped singleton
address** (literal last segment → uriId `''`). It is NOT a
`DocumentFamilyWiring` row: the generic
`documentGetHandler`/`documentPutHandler` structurally serve
only 2-segment `family/:id` patterns (their prefix derives
from `wiring.family` alone), which is why pii and credentials
are hand-written closures too. `grantClientCredentials` swaps
its one `rawReadRow` onto a new `deriveClientRegistration`;
`rawReadRow` then retires; `SNAPSHOT_SCHEMA_VERSION` bumps
4→5 exactly once, on the deletion commit.

**Tech Stack:** Vanilla TypeScript ES2024, zero runtime deps,
IndexedDB (+ memory/localStorage simulated tiers), `node:test`
via `./validate`.

**Spec of record:**
`docs/superpowers/specs/2026-07-11-clients-table-elimination-design.md`
(commit c7b2548a). Decisions there are binding — do not
re-litigate. One spec clarification this plan encodes: spec
§4's "generic document handlers with identities wiring"
means the generic route/pair machinery (`route()`,
`WRITE_RESPONSE_SPECS`, the pattern registries), not literally
`documentGetHandler` — see Architecture above.

## Global Constraints

- Branch `remediation/audit-findings`; NO worktrees, NO
  branching, linear history, rebase-only.
- `./validate` MUST pass before every commit (types + tests +
  78-char line lint on .ts/.html/.css + SCHEMA.svg drift
  gate). tsconfig has `noUnusedLocals` — an import left
  unused after an edit FAILS the build; every task that
  removes a call site must prune its imports.
- Max line length 78 chars; 4-space indent; no trailing
  whitespace; final newline.
- Commit subject: one line ≈50 chars, present-tense
  imperative, no body prose; end every commit message with
  exactly these two trailer lines:

      Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
      Claude-Session: https://claude.ai/code/session_01DFXAu3kLsrKbdEy8XDQHvz

- TDD: write the failing test first, watch it fail, implement,
  watch it pass, commit. Never weaken an assertion to pass.
- IndexedDB auto-commit constraint: validators, crypto, and
  compression run OUTSIDE `transaction(...)` bodies; a tx body
  awaits ONLY row ops.
- Honest status covenant: unauthenticated → 401 before any
  404; facet gate order is absent-identity 404 / kind-person
  400 / non-admin 403.
- No inline `style="..."`; no raw hex colors —
  `hsl(var(--token))` only (no new CSS is expected at all).
- Storage bodies snake_case; domain camelCase; adapters take
  `RequestContext` as first argument; presenters emit
  `SafeHtml`; HTTP-verb adapter naming
  (`getNoun`/`putNoun`/`deleteNoun`).
- `SNAPSHOT_SCHEMA_VERSION` bumps ONCE (4→5) in Task 8 — never
  earlier.
- Subagent dispatch: every subagent prompt begins with the
  literal phrase `Go to Medium Church!` plus the CLAUDE.md
  § Subagents pushdowns (voice rules, commandments touched,
  abominations risked, patterns to match).
- Run tests via `./test` (whole suite) or
  `node --test --strip-types tests/<file>.test.ts` (one file).

## Task Map (spec §9 sequencing, refined)

| Task | Spec step | Commit subject |
|------|-----------|----------------|
| 1 | 1 (derive plane) | `add client registration derive plane` |
| 2 | 1 (route plane) | `wire identities/:id/registration routes` |
| 3 | 2 (cutover-read) | `re-point client_credentials onto facet` |
| 4 | 3 (act.sub) | `wire act.sub on authorization_code grant` |
| 5 | 4 (UI: adapter) | `add client registration adapter` |
| 6 | 4 (UI: card+dialog) | `add client registration card and dialog` |
| 7 | 5 (fixture moves) | `re-point plumbing fixtures off clients` |
| 8 | 5 (deletion) | `delete clients table` |
| 9 | 6 (docs) | `update docs for clients retirement` |

Tasks 1–6 land with the table still present but unread on the
client path after Task 3 — build-derive → cutover-read →
delete-table, collapsed because there is no production write
path to dual-run.

---

### Task 1: Registration entity, validator, derive plane

**Files:**
- Modify: `api/types.ts` (add `ClientRegistrationEntity` after
  `ClientEntity`, which ends at line 602)
- Modify: `api/validators.ts` (add
  `validateClientRegistrationEntity` after `validateClientEntity`
  at lines 1081–1096; add `ClientRegistrationEntity` to the
  types import)
- Modify: `api/derive-identity-spine.ts` (add
  `deriveClientRegistration` + `deriveIdentityKind` at end of
  file; fix the stale module-header sentence at lines 84–86;
  update "Five facets" at line 31)
- Modify: `api/message-pair.ts` (register the pattern in
  `PAIR_WIRED_ROUTE_PATTERNS` after line 608 and
  `DOCUMENT_CLASS_ROUTE_PATTERNS` after line 697)
- Modify: `api/routes.ts` (add the `WRITE_RESPONSE_SPECS`
  entry after the `'identities/:id/credentials/:cid'` entry at
  lines 2812–2820; add `validateClientRegistrationEntity` to
  the validators import)
- Modify: `tests/identity-fixtures.ts` (add
  `seedServiceIdentity`, `seedClientRegistration`,
  `seedClientRegistrationTombstone`)
- Test: `tests/derive-client-registration.test.ts` (new)

**Interfaces:**
- Consumes (all existing): `deriveDocumentsAt`
  (api/derive-documents.ts), `canonicalUriPrefix`,
  `formWritePair`, `appendMessagePair` (api/message-pair.ts),
  `pickString` (api/validators.ts), `EntityNotFoundError`
  (api/db.ts), `identityDocumentPair(id, kind, requestAt)` +
  `postIdentityDocumentOp` (already kind-parameterized,
  tests/identity-fixtures.ts:29-58).
- Produces:
  - `ClientRegistrationEntity { id: Id; grant_types: string;
    redirect_uris: string; jwks: string; aud: string;
    status: ClientStatus }` — field-set IDENTICAL to
    `ClientEntity`, so it is structurally assignable where
    `ClientEntity` is expected (Task 3 relies on this; Task 8
    re-points `client-assertion.ts` onto it).
  - `validateClientRegistrationEntity(body):
    Omit<ClientRegistrationEntity, 'id'>` (shares
    `CLIENT_BODY_KEYS`; that const survives Task 8 serving
    this validator alone).
  - `deriveClientRegistration(db: DbAdapter, identityId: Id):
    Promise<ClientRegistrationEntity>` — throws
    `EntityNotFoundError('client_registration', id)` on
    absent OR tombstoned facet.
  - `deriveIdentityKind(db: DbAdapter, identityId: Id):
    Promise<IdentityKind | undefined>` — undefined = no
    identity document.
  - Test fixtures: `seedServiceIdentity(db, id)`,
    `seedClientRegistration(db, id, fields)`,
    `seedClientRegistrationTombstone(db, id)`.

- [ ] **Step 1: Write the failing test**

Create `tests/derive-client-registration.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { EntityNotFoundError } from '../api/db.ts';
import {
    deriveClientRegistration,
    deriveIdentityKind,
} from '../api/derive-identity-spine.ts';
import {
    seedServiceIdentity,
    seedPersonIdentity,
    seedClientRegistration,
    seedClientRegistrationTombstone,
} from './identity-fixtures.ts';

const REGISTRATION = {
    grant_types: 'client_credentials',
    redirect_uris: '',
    jwks: '{"keys":[]}',
    aud: 'fusion-ai-web',
    status: 'active',
};

async function freshDb() {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

test('an absent registration throws EntityNotFoundError',
async () => {
    const db = await freshDb();
    await assert.rejects(
        () => deriveClientRegistration(db, 'svc-1'),
        (err: unknown) =>
            err instanceof EntityNotFoundError
            && err.table === 'client_registration'
            && err.id === 'svc-1',
    );
});

test('a seeded registration derives whole, id-first',
async () => {
    const db = await freshDb();
    await seedClientRegistration(db, 'svc-1', REGISTRATION);
    assert.deepEqual(
        await deriveClientRegistration(db, 'svc-1'),
        { id: 'svc-1', ...REGISTRATION },
    );
});

test('a re-PUT supersedes: the latest body wins', async () => {
    const db = await freshDb();
    await seedClientRegistration(db, 'svc-1', REGISTRATION);
    await seedClientRegistration(db, 'svc-1', {
        ...REGISTRATION, jwks: '{"keys":[{"kty":"EC"}]}',
    });
    const derived =
        await deriveClientRegistration(db, 'svc-1');
    assert.equal(derived.jwks, '{"keys":[{"kty":"EC"}]}');
});

test('a tombstoned registration reads as absent', async () => {
    const db = await freshDb();
    await seedClientRegistration(db, 'svc-1', REGISTRATION);
    await seedClientRegistrationTombstone(db, 'svc-1');
    await assert.rejects(
        () => deriveClientRegistration(db, 'svc-1'),
        EntityNotFoundError,
    );
});

test('deriveIdentityKind: absent, person, service',
async () => {
    const db = await freshDb();
    assert.equal(
        await deriveIdentityKind(db, 'ghost'), undefined,
    );
    await seedPersonIdentity(db, 'p-1', {
        name: 'Ada', email: 'ada@example.com',
        phone: '', bio: '',
    });
    assert.equal(await deriveIdentityKind(db, 'p-1'), 'person');
    await seedServiceIdentity(db, 'svc-1');
    assert.equal(
        await deriveIdentityKind(db, 'svc-1'), 'service',
    );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
`node --test --strip-types tests/derive-client-registration.test.ts`
Expected: FAIL — `deriveClientRegistration` /
`seedClientRegistration` etc. are not exported.

- [ ] **Step 3: Implement — types + validator**

`api/types.ts`, insert directly after the `ClientEntity`
interface (line 602):

```ts
// The client-registration facet — the pair-plane document at
// identities/:id/registration that replaces the clients
// table (clients elimination). Same five columns; `id` is
// the OWNING kind-'service' identity's id. PUT-overwrite via
// the Supersedes chain; a DELETE tombstone is deregistration.
// Derived by deriveClientRegistration
// (api/derive-identity-spine.ts).
export interface ClientRegistrationEntity {
    id: Id;
    grant_types: string;
    redirect_uris: string;
    jwks: string;
    aud: string;
    status: ClientStatus;
}
```

`api/validators.ts`, insert directly after
`validateClientEntity` (line 1096), and add
`ClientRegistrationEntity` to the existing `../api/types.ts`
type-import list at the top of the file:

```ts
// The registration facet's body validator — the SAME five
// keys as the clients row it replaces (CLIENT_BODY_KEYS is
// shared; validateClientEntity retires with the table).
export function validateClientRegistrationEntity(
    body: Record<string, unknown>,
): Omit<ClientRegistrationEntity, 'id'> {
    assertOnlyKeys(
        body, CLIENT_BODY_KEYS, 'ClientRegistrationEntity',
    );
    const status = validateEnumField(
        body, 'status', ['active', 'disabled'],
        'registration status', 'ClientRegistrationEntity',
    );
    return {
        grant_types: pickString(body, 'grant_types'),
        redirect_uris: pickString(body, 'redirect_uris'),
        jwks: pickString(body, 'jwks'),
        aud: pickString(body, 'aud'),
        status,
    };
}
```

- [ ] **Step 4: Implement — the derives**

`api/derive-identity-spine.ts`:

(a) Extend the types import (lines 3–15) with
`ClientRegistrationEntity`, `ClientStatus`, `IdentityKind`.

(b) Fix the stale header: at lines 84–86 replace

```
// derive-members.ts and api/derive-invitations.ts. NOTHING reads
// this module in production yet; tests/drift-identities.test.ts
// alone gates the flip Task 8 performs.
```

with

```
// derive-members.ts and api/derive-invitations.ts. Production
// reads this module today: the identity facet routes
// (api/routes.ts) and api/authentication.ts.
```

(Deliberately non-enumerating — caller lists rot; this stays
true when Task 3 adds grantClientCredentials as a reader.)

and at line 31 change `// Five facets, four shapes:` to
`// Facets (registration joined at the clients elimination):`.

(c) Append at end of file:

```ts
// ---- client_registration — the clients-table replacement: a ----
// ---- singleton document at the identity's own nested address ---
// ---- (the /pii single-slot shape: literal last segment, ------
// ---- uriId ''), Supersedes-chained like /credentials. NOT a ---
// ---- delete zone — a DELETE head is a deregistration ----------
// ---- tombstone, not an erasure — so the plain Promise.all ----
// ---- read shape suffices (the module header's torn-read -------
// ---- closure stays pii-only) -------------------------------------

function registrationPrefixFor(identityId: Id): string {
    return canonicalUriPrefix(
        undefined,
        '/identities/' + identityId + '/registration/',
    );
}

function registrationEntityOf(
    identityId: Id,
    document: DerivedDocument,
): ClientRegistrationEntity {
    const body = document.body;
    return {
        id: identityId,
        grant_types: pickString(body, 'grant_types'),
        redirect_uris: pickString(body, 'redirect_uris'),
        jwks: pickString(body, 'jwks'),
        aud: pickString(body, 'aud'),
        status: pickString(body, 'status') as ClientStatus,
    };
}

// The single-slot read at the identity's exact registration
// prefix. Throws EntityNotFoundError('client_registration',
// id) on absence OR a DELETE-head slot (deregistration
// tombstone) — grantClientCredentials maps both to the same
// 401 'unknown client'.
export async function deriveClientRegistration(
    db: DbAdapter,
    identityId: Id,
): Promise<ClientRegistrationEntity> {
    const prefix = registrationPrefixFor(identityId);
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    const document = deriveDocumentsAt(
        requests, responses, prefix,
    ).get('');
    if (document === undefined) {
        throw new EntityNotFoundError(
            'client_registration', identityId,
        );
    }
    return registrationEntityOf(identityId, document);
}

// One identity's document kind, or undefined when no identity
// document exists — the registration route's kind gate reads
// this (absent -> 404, person -> 400) before every verb. The
// whole-family prefix read matches the demo tier's E13
// posture (deriveIdentityPiiRows reads more).
export async function deriveIdentityKind(
    db: DbAdapter,
    identityId: Id,
): Promise<IdentityKind | undefined> {
    const prefix = canonicalUriPrefix(
        undefined, '/identities/',
    );
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    const document = deriveDocumentsAt(
        requests, responses, prefix,
    ).get(identityId);
    return document === undefined
        ? undefined
        : pickString(document.body, 'kind') as IdentityKind;
}
```

- [ ] **Step 5: Implement — pattern registries + response spec**

`api/message-pair.ts`: add
`'identities/:id/registration',` to
`PAIR_WIRED_ROUTE_PATTERNS` directly after
`'identities/:id/credentials/:cid',` (line 608), and the same
line to `DOCUMENT_CLASS_ROUTE_PATTERNS` directly after its
`'identities/:id/credentials/:cid',` entry (line 697).
Registration IS chained (unlike pii, which is deliberately
absent from the document-class set).

`api/routes.ts`: add to `WRITE_RESPONSE_SPECS` directly after
the `'identities/:id/credentials/:cid'` entry (ends line
2820); the id keys on `param(params, 0)` because the last
segment is literal (the pii precedent, not the credentials
one). Add `validateClientRegistrationEntity` to the
validators import list.

```ts
    'identities/:id/registration': {
        status: HTTP_OK,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateClientRegistrationEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
```

- [ ] **Step 6: Implement — test fixtures**

`tests/identity-fixtures.ts`: add `appendMessagePair` to the
existing `../api/message-pair.ts` import. Append at end of
file:

```ts
export async function seedServiceIdentity(
    db: DbAdapter,
    id: string,
): Promise<void> {
    const requestAt = nowUtc();
    await postIdentityDocumentOp(
        db, id, identityDocumentBodyOf('service'),
        SYSTEM_MEMBER_ID,
        await identityDocumentPair(id, 'service', requestAt),
    );
}

// One identities/:id/registration document pair — the
// clients-elimination facet. Chainless below-facade append
// (headPairId undefined): deriveDocumentsAt's (at, id)
// reduction decides currency; Supersedes is provenance-only.
async function clientRegistrationDocumentPair(
    id: Id,
    fields: Record<string, unknown>,
    requestAt: string,
): Promise<MessagePair> {
    const spec =
        WRITE_RESPONSE_SPECS['identities/:id/registration'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for'
            + ' identities/:id/registration',
        );
    }
    return formWritePair({
        method: 'PUT',
        pathname: `/identities/${id}/registration`,
        routePattern: 'identities/:id/registration',
        routeSegments: ['identities', ':id', 'registration'],
        pathSegments: ['identities', id, 'registration'],
        headerFields: [],
        body: fields,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization: undefined,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], fields, SYSTEM_MEMBER_ID, undefined,
        ),
        headPairId: undefined,
    });
}

export async function seedClientRegistration(
    db: DbAdapter,
    id: string,
    fields: Record<string, unknown>,
): Promise<void> {
    const pair = await clientRegistrationDocumentPair(
        id, fields, nowUtc(),
    );
    await db.transaction(
        ['requests', 'responses'],
        async (view) => {
            await appendMessagePair(view, pair);
        },
    );
}

// A deregistration tombstone: a DELETE-method pair at the
// slot — deriveDocumentsAt excludes a DELETE head, so the
// facet reads as absent afterward.
export async function seedClientRegistrationTombstone(
    db: DbAdapter,
    id: string,
): Promise<void> {
    const pair = await formWritePair({
        method: 'DELETE',
        pathname: `/identities/${id}/registration`,
        routePattern: 'identities/:id/registration',
        routeSegments: ['identities', ':id', 'registration'],
        pathSegments: ['identities', id, 'registration'],
        headerFields: [],
        body: undefined,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: undefined,
        responseStatus: 204,
        responseBody: undefined,
        headPairId: undefined,
    });
    await db.transaction(
        ['requests', 'responses'],
        async (view) => {
            await appendMessagePair(view, pair);
        },
    );
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run:
`node --test --strip-types tests/derive-client-registration.test.ts`
Expected: PASS (5 tests). Then run `./validate` — everything
green (the new pattern-set entries and response spec have no
live route yet; the gate only consults them for matched
routes).

- [ ] **Step 8: Commit**

```bash
git add api/types.ts api/validators.ts \
    api/derive-identity-spine.ts api/message-pair.ts \
    api/routes.ts tests/identity-fixtures.ts \
    tests/derive-client-registration.test.ts
git commit -m "add client registration derive plane"
```

(with the mandated trailers; same for every commit below.)

---

### Task 2: Facet routes PUT/GET/DELETE + kind gate

**Files:**
- Modify: `api/routes.ts` (add
  `postClientRegistrationDocumentOp` after
  `postIdentityCredentialDocumentOp` at lines 2489–2513; add
  `requireServiceIdentity` beside it; add the
  `route('identities/:id/registration', ...)` entry after the
  `route('identities/:id/credentials/:cid', ...)` entry that
  ends at line 3602; extend the derive-identity-spine import
  at lines 175–184 with `deriveClientRegistration` and
  `deriveIdentityKind`; extend the types import with
  `ClientRegistrationEntity`)
- Test: `tests/api-client-registration.test.ts` (new)

**Interfaces:**
- Consumes: Task 1's derives + validator + fixtures;
  `appendMessagePair`, `withoutId`, `param`, `ApiError`,
  `HTTP_BAD_REQUEST`, `EntityNotFoundError` (all already
  imported by routes.ts — verify each and add any missing);
  ROUTE_POLICY deny-by-default (api/authorization.ts:162-168)
  — NO member-tier entry, NO write-authorizer entry, NO
  request-auth carve-out: the route is admin-only and global
  with zero new authz code. `matchRoute` is exact-segment, so
  it can never fall into the `identities/:id/pii` carve-out
  (api/api.ts:382-386) or the `default-org` pre-match branch.
- Produces: live `PUT|GET|DELETE /identities/:id/registration`.
  DELETE response is the gate's automatic 204 (api/api.ts
  short-circuits DELETE specs); the tombstone pair is formed
  by the gate and appended by the handler.

- [ ] **Step 1: Write the failing test**

Create `tests/api-client-registration.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    PUT, GET, DELETE,
    UnauthorizedError, RequestError,
} from '../api/api.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    seedOrganizationMember,
} from './root-admin-fixture.ts';
import {
    seedServiceIdentity,
    seedPersonIdentity,
} from './identity-fixtures.ts';

const REGISTRATION = {
    grant_types: 'client_credentials',
    redirect_uris: '',
    jwks: '{"keys":[]}',
    aud: 'fusion-ai-web',
    status: 'active',
};

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

function rejectsWithStatus(status: number) {
    return (err: unknown) =>
        err instanceof RequestError
        && err.status === status;
}

test('unauthenticated registration access is 401,'
+ ' even for an unknown identity (401 before 404)',
async () => {
    const db = await freshDb();
    await assert.rejects(
        () => GET(db, 'identities/ghost/registration',
            'not-a-token'),
        UnauthorizedError,
    );
});

test('a member-tier caller is 403 (admin realm)',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'svc-1');
    await seedOrganizationMember(db, 'peon');
    const memberToken = await devToken('peon');
    await assert.rejects(
        () => PUT(db, 'identities/svc-1/registration',
            { ...REGISTRATION }, memberToken),
        rejectsWithStatus(403),
    );
});

test('an absent identity is 404', async () => {
    const db = await freshDb();
    await assert.rejects(
        () => PUT(db, 'identities/ghost/registration',
            { ...REGISTRATION }, DEV_TOKEN),
        rejectsWithStatus(404),
    );
});

test("a kind-'person' identity is 400", async () => {
    const db = await freshDb();
    await seedPersonIdentity(db, 'p-1', {
        name: 'Ada', email: 'ada@example.com',
        phone: '', bio: '',
    });
    await assert.rejects(
        () => PUT(db, 'identities/p-1/registration',
            { ...REGISTRATION }, DEV_TOKEN),
        rejectsWithStatus(400),
    );
});

test('a rogue body key is 400 (validator at the gate)',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'svc-1');
    await assert.rejects(
        () => PUT(db, 'identities/svc-1/registration',
            { ...REGISTRATION, rogue: 'x' }, DEV_TOKEN),
        rejectsWithStatus(400),
    );
});

test('PUT registers; GET reads it back; a second PUT'
+ ' overwrites (rotate-JWKS)', async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'svc-1');
    const put = await PUT<Record<string, unknown>>(
        db, 'identities/svc-1/registration',
        { ...REGISTRATION }, DEV_TOKEN,
    );
    assert.deepEqual(put, { id: 'svc-1', ...REGISTRATION });
    const got = await GET<Record<string, unknown>>(
        db, 'identities/svc-1/registration', DEV_TOKEN,
    );
    assert.deepEqual(got, { id: 'svc-1', ...REGISTRATION });
    const rotated = {
        ...REGISTRATION, jwks: '{"keys":[{"kty":"EC"}]}',
    };
    await PUT(db, 'identities/svc-1/registration',
        { ...rotated }, DEV_TOKEN);
    const reread = await GET<{ jwks: string }>(
        db, 'identities/svc-1/registration', DEV_TOKEN,
    );
    assert.equal(reread.jwks, rotated.jwks);
});

test('GET with no registration yet is 404 (identity'
+ ' exists)', async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'svc-1');
    await assert.rejects(
        () => GET(db, 'identities/svc-1/registration',
            DEV_TOKEN),
        rejectsWithStatus(404),
    );
});

test('DELETE deregisters: a marked tombstone, then 404',
async () => {
    const db = await freshDb();
    await seedServiceIdentity(db, 'svc-1');
    await PUT(db, 'identities/svc-1/registration',
        { ...REGISTRATION }, DEV_TOKEN);
    await DELETE(db, 'identities/svc-1/registration',
        DEV_TOKEN);
    await assert.rejects(
        () => GET(db, 'identities/svc-1/registration',
            DEV_TOKEN),
        rejectsWithStatus(404),
    );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
`node --test --strip-types tests/api-client-registration.test.ts`
Expected: FAIL — every authed request 404s
(`Not found: /identities/.../registration` — no route matches
yet). The 401 test may already pass; that is fine.

- [ ] **Step 3: Implement the op, the gate, and the route**

`api/routes.ts` — insert after
`postIdentityCredentialDocumentOp` (line 2513):

```ts
// Client-registration document write (clients elimination) —
// pure pair-plane write, the postIdentityCredentialDocumentOp
// shape: Supersedes-chained appendMessagePair, never the pii
// hard-delete zone. `pair` is optional so a below-facade
// caller keeps compiling; the live route always supplies one.
// WRITE_RESPONSE_SPECS successBody forms the wire bytes.
export async function postClientRegistrationDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<ClientRegistrationEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<ClientRegistrationEntity, 'id'>;
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return entity;
        },
    );
}

// The registration facet's kind gate (validators at the
// gate, never downstream): the facet exists only under a
// kind-'service' identity. Absent identity -> 404; person
// -> 400. Runs before every verb on
// identities/:id/registration.
async function requireServiceIdentity(
    db: DbAdapter,
    identityId: Id,
): Promise<void> {
    const kind = await deriveIdentityKind(db, identityId);
    if (kind === undefined) {
        throw new EntityNotFoundError(
            'identities', identityId,
        );
    }
    if (kind !== 'service') {
        throw new ApiError(
            'client registration requires a'
            + " kind-'service' identity",
            HTTP_BAD_REQUEST,
        );
    }
}
```

Insert into the routes array after the
`route('identities/:id/credentials/:cid', ...)` entry
(line 3602):

```ts
    // The client-registration facet (clients elimination):
    // client = kind-'service' identity + this single-slot
    // PUT-overwrite document. Hand-written closure — the
    // pii/credentials precedent; documentGet/PutHandler only
    // serve 2-segment family/:id patterns. ADMIN-ONLY via
    // deny-by-default (/identities has no MEMBER_VERBS
    // entry); GLOBAL plane (no org nesting, no
    // write authorizer). DELETE is a marked tombstone =
    // deregistration; the gate forms the 204 pair, the
    // handler appends it — idempotent by construction.
    route('identities/:id/registration', {
        get: async (db, p) => {
            const identityId = param(p, 0);
            await requireServiceIdentity(db, identityId);
            return deriveClientRegistration(db, identityId);
        },
        put: async (db, p, body, actor, pair) => {
            const identityId = param(p, 0);
            await requireServiceIdentity(db, identityId);
            return postClientRegistrationDocumentOp(
                db, identityId, body, actor, pair,
            );
        },
        delete: async (db, p, _actor, pair) => {
            await requireServiceIdentity(db, param(p, 0));
            return db.transaction(
                ['requests', 'responses'],
                async (view) => {
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
```

Extend the derive-identity-spine import (lines 175–184) with
`deriveClientRegistration` and `deriveIdentityKind`, and the
types import with `ClientRegistrationEntity`. The `delete:`
handler shape mirrors the `records/:id` route's simple
tombstone DELETE at api/routes.ts:4513-4522
(`delete: (db, _p, _actor, pair) => {...}`) — NOT the
record-attributes DELETE near line 4581, which carries
RESTRICT checks this facet does not need.

- [ ] **Step 4: Run tests to verify they pass**

Run:
`node --test --strip-types tests/api-client-registration.test.ts`
Expected: PASS (8 tests). Then `./validate` — green.

- [ ] **Step 5: Commit**

```bash
git add api/routes.ts tests/api-client-registration.test.ts
git commit -m "wire identities/:id/registration routes"
```

---

### Task 3: grantClientCredentials cutover + grant re-fixtures

**Files:**
- Modify: `api/authentication.ts` (the read swap at lines
  807–858; import pruning at lines 4 and 27)
- Modify: `tests/api-authentication-token.test.ts`
  (fixtures at lines 643–734)
- Modify: `tests/api-shadow-ledger-auth.test.ts` (lines
  492–546)
- Modify: `tests/api-shadow-ledger-tokens.test.ts` (lines
  510–532)

**Interfaces:**
- Consumes: `deriveClientRegistration` (Task 1) — add it to
  authentication.ts's existing derive-identity-spine import
  (around line 74); `EntityNotFoundError` (already imported
  at line 1); `ClientRegistrationEntity` type (add to the
  types import). `seedClientRegistration` /
  `seedClientRegistrationTombstone` (Task 1 fixtures).
- Produces: `grantClientCredentials` reads ONLY the pair
  plane. Wire behavior unchanged: absent/tombstoned → 401
  `unknown client`; disabled → 401; grant_types → 400;
  assertion verification unchanged.

- [ ] **Step 1: Write the failing tests**

In `tests/api-authentication-token.test.ts`:

(a) Add to the imports:

```ts
import {
    seedClientRegistration,
    seedClientRegistrationTombstone,
} from './identity-fixtures.ts';
```

(b) Add three new tests after the existing
`client_credentials` tests (after line 715):

```ts
test('client_credentials for a disabled registration is 401',
async () => {
    const db = await freshDb();
    const { client, assertion } =
        await signedClientSetup();
    await seedClientRegistration(db, 'svc-client', {
        ...client, status: 'disabled',
    });
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'svc-client',
        client_assertion: assertion,
    }));
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.match(body.error, /client is disabled/);
});

test('client_credentials without the grant type is 400',
async () => {
    const db = await freshDb();
    const { client, assertion } =
        await signedClientSetup();
    await seedClientRegistration(db, 'svc-client', {
        ...client, grant_types: 'authorization_code',
    });
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'svc-client',
        client_assertion: assertion,
    }));
    assert.equal(res.status, 400);
});

test('client_credentials for a deregistered client is 401',
async () => {
    const db = await freshDb();
    const { client, assertion } =
        await signedClientSetup();
    await seedClientRegistration(db, 'svc-client', client);
    await seedClientRegistrationTombstone(db, 'svc-client');
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'svc-client',
        client_assertion: assertion,
    }));
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.match(body.error, /unknown client/);
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run:
`node --test --strip-types tests/api-authentication-token.test.ts`
Expected: the three NEW tests FAIL (the grant still reads the
clients table, which is empty → all three return 401
`unknown client`, so the disabled test's message match and
the 400 test's status fail). Existing tests still pass.

- [ ] **Step 3: Implement the cutover**

`api/authentication.ts` — replace lines 819–832 (the FLIPPED
comment, the `rawReadRow` call, the null check, and the
status check):

```ts
    // FLIPPED (clients elimination): the registration facet
    // derive replaces the raw clients row read. An absent OR
    // tombstoned facet ≡ the old null row -> the same 401
    // 'unknown client'; any other fault surfaces (500).
    let client: ClientRegistrationEntity;
    try {
        client = await deriveClientRegistration(
            adapter, clientId,
        );
    } catch (e) {
        if (e instanceof EntityNotFoundError) {
            return failure(
                HTTP_UNAUTHORIZED, 'unknown client',
            );
        }
        throw e;
    }
    if (client.status !== 'active') {
        return failure(HTTP_UNAUTHORIZED, 'client is disabled');
    }
```

The grant_types check, `verifyClientAssertion` call,
`nameFor`, and `issueTokenPair` below stay byte-identical
(`ClientRegistrationEntity` is structurally assignable to
`verifyClientAssertion`'s `ClientEntity` parameter).

Prune imports: remove `GuardedDbAdapter` (line 4) and
`type ClientEntity` (line 27) — the swap removed their only
uses; `noUnusedLocals` fails the build if left. Add
`deriveClientRegistration` to the derive-identity-spine
import (~line 74) and `ClientRegistrationEntity` to the
types import.

- [ ] **Step 4: Re-fixture the existing grant tests**

`tests/api-authentication-token.test.ts`:
- Replace every `await db.clients.put('svc-client', client);`
  (lines 659, 675) with
  `await seedClientRegistration(db, 'svc-client', client);`
- Replace `await db.clients.put('svc-client', activeClient);`
  (line 698) with
  `await seedClientRegistration(db, 'svc-client', activeClient);`
- Replace the `rawReadRow` fault test (lines 717–734) whole:

```ts
test('a registration-read fault is a 500, never 401',
async () => {
    const db = await freshDb();
    // Only an EntityNotFoundError means 'unknown client';
    // any other fault is a bug and must surface, not wear a
    // 401 mask. The derive's first read is
    // requests.getAllWhere — the fault-injection point that
    // replaced the retired rawReadRow stub.
    (db.requests as unknown as {
        getAllWhere: () => Promise<never>;
    }).getAllWhere = async () => {
        throw new Error('store exploded');
    };
    const res = await handleRequest(db, tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'svc-client',
        client_assertion: 'a.b.c',
    }));
    assert.equal(res.status, 500);
});
```

`tests/api-shadow-ledger-auth.test.ts` (lines 492–546):
- Add the import
  `import { seedClientRegistration } from './identity-fixtures.ts';`
- Replace the `db.clients.put('svc-client', {...})` block
  (lines 513–517) with:

```ts
    await seedClientRegistration(db, 'svc-client', {
        grant_types: 'client_credentials',
        redirect_uris: '', jwks: signer.jwks,
        aud: 'fusion-ai-web', status: 'active',
    });
```

- The pinned ledger count at line 537 changes 6 → 7 (the
  registration facet is itself a pair now); update the
  comment at lines 531–536 to name it, e.g. append: `plus
  the registration-facet pair the fixture seeds (clients
  elimination).`

`tests/api-shadow-ledger-tokens.test.ts` (lines 510–532):
same import; replace the `db.clients.put('svc-shadow', {...})`
block (lines 521–525) with:

```ts
    await seedClientRegistration(db, 'svc-shadow', {
        grant_types: 'client_credentials',
        redirect_uris: '', jwks: signer.jwks,
        aud: 'fusion-ai-web', status: 'active',
    });
```

- [ ] **Step 5: Run tests, then the whole gate**

Run:
`node --test --strip-types tests/api-authentication-token.test.ts`
then the two shadow-ledger files, then `./validate`.
Expected: ALL PASS. The clients table still exists but has
ZERO production readers from this commit on.

- [ ] **Step 6: Commit**

```bash
git add api/authentication.ts \
    tests/api-authentication-token.test.ts \
    tests/api-shadow-ledger-auth.test.ts \
    tests/api-shadow-ledger-tokens.test.ts
git commit -m "re-point client_credentials onto facet"
```

---

### Task 4: act.sub on authorization_code redemption

**Files:**
- Modify: `api/authentication.ts:1056-1059`
  (`grantAuthorizationCode`'s mint call)
- Modify: `tests/api-authentication-token.test.ts` (the
  redemption test at lines 297–318)

**Interfaces:**
- Consumes: `mintPair(identityId, name, refreshJti, act?,
  scope?)` — the 4th positional arg is `act`, threaded
  verbatim into the ACCESS token's claims only (never the
  refresh token). `issuer.clientId` is already
  verified-equal to the redeeming `client_id`
  (api/authentication.ts:1017-1023). No production code
  reads `claims.act` for authorization
  (`principalFromClaims` ignores it) — nothing else changes.

- [ ] **Step 1: Write the failing pin**

In `tests/api-authentication-token.test.ts`, extend the test
`'authorization_code grant issues a gate-valid token pair'`
(lines 297–318): after the existing `assert.ok(
body.refresh_token.length > 0);` add:

```ts
    // act.sub carries the acting client (RFC 8693 shape,
    // mirroring token-exchange); sub stays the user. The
    // refresh token never carries act.
    const claims = decodeAccessToken(body.access_token);
    assert.equal(claims.sub, 'current');
    assert.equal(claims.act?.sub, 'web');
    assert.equal(
        decodeAccessToken(body.refresh_token).act,
        undefined,
    );
```

(`decodeAccessToken` is already used at lines 516/573/616 of
this file — no new import needed.)

- [ ] **Step 2: Run to verify it fails**

Run:
`node --test --strip-types tests/api-authentication-token.test.ts`
Expected: FAIL — `claims.act?.sub` is `undefined`, not
`'web'`.

- [ ] **Step 3: Implement**

`api/authentication.ts` lines 1056–1059 — replace:

```ts
    const response = await mintPair(
        issuer.identityId, name, refreshJti,
        undefined, { organizations },
    );
```

with:

```ts
    // act.sub = the acting client (RFC 8693), mirroring
    // grantTokenExchange's own act:{sub: actor}. sub stays
    // the user; issuer.clientId is already verified equal to
    // the redeeming client_id above.
    const response = await mintPair(
        issuer.identityId, name, refreshJti,
        { sub: issuer.clientId }, { organizations },
    );
```

- [ ] **Step 4: Run to verify it passes**

Run the file, then `./validate`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/authentication.ts \
    tests/api-authentication-token.test.ts
git commit -m "wire act.sub on authorization_code grant"
```

---

### Task 5: Registration adapter methods

**Files:**
- Modify: `web-app/app/adapters/identities.ts` (new exports
  beside `deleteIdentityPii` at line 192; extend the types
  import at lines 1–10 with `ClientRegistrationEntity` and
  `ClientStatus`; new import of `RequestError` +
  `HTTP_NOT_FOUND` from `../../../api/api.ts`)
- Test: `tests/adapters-client-registration.test.ts` (new)

**Interfaces:**
- Consumes: `ctx.GET/PUT/DELETE` (RequestContext,
  adapters/shared.ts); `RequestError` (re-exported from
  api/api.ts:105 block, defined api/http-errors.ts:34 with a
  `.status` field); Tasks 1–2's live route. The barrel
  `web-app/app/adapters/index.ts:31` is `export * from
  './identities.ts'` — new exports flow through untouched.
- Produces (camelCase domain; snake_case stays at the wire):

```ts
export type ClientRegistration =
    | {
        readonly registered: true;
        readonly grantTypes: string;
        readonly redirectUris: string;
        readonly jwks: string;
        readonly aud: string;
        readonly status: ClientStatus;
    }
    | { readonly registered: false };

export interface ClientRegistrationFields {
    readonly grantTypes: string;
    readonly redirectUris: string;
    readonly jwks: string;
    readonly aud: string;
    readonly status: ClientStatus;
}

getClientRegistration(ctx, id): Promise<ClientRegistration>
putClientRegistration(ctx, id, fields): Promise<void>
deleteClientRegistration(ctx, id): Promise<void>
```

- [ ] **Step 1: Write the failing test**

Create `tests/adapters-client-registration.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { devToken } from './token-fixtures.ts';
import {
    seedServiceIdentity,
} from './identity-fixtures.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getClientRegistration,
    putClientRegistration,
    deleteClientRegistration,
} from '../web-app/app/adapters/identities.ts';

const FIELDS = {
    grantTypes: 'client_credentials',
    redirectUris: '',
    jwks: '{"keys":[]}',
    aud: 'fusion-ai-web',
    status: 'active' as const,
};

async function setup() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedServiceIdentity(db, 'svc-1');
    return createRequestContext(db, await devToken());
}

test('an unregistered service reads as registered: false',
async () => {
    const ctx = await setup();
    assert.deepEqual(
        await getClientRegistration(ctx, 'svc-1'),
        { registered: false },
    );
});

test('put then get round-trips through the camelCase'
+ ' domain shape', async () => {
    const ctx = await setup();
    await putClientRegistration(ctx, 'svc-1', FIELDS);
    assert.deepEqual(
        await getClientRegistration(ctx, 'svc-1'),
        { registered: true, ...FIELDS },
    );
});

test('delete deregisters back to registered: false',
async () => {
    const ctx = await setup();
    await putClientRegistration(ctx, 'svc-1', FIELDS);
    await deleteClientRegistration(ctx, 'svc-1');
    assert.deepEqual(
        await getClientRegistration(ctx, 'svc-1'),
        { registered: false },
    );
});
```

(`createRequestContext(db, token)` is exported from
`web-app/app/adapters/shared.ts:84`; this setup mirrors
`tests/adapters-snapshots.test.ts:62-69`, the established
adapter-test precedent.)

- [ ] **Step 2: Run to verify it fails**

Run:
`node --test --strip-types tests/adapters-client-registration.test.ts`
Expected: FAIL — the adapter functions are not exported.

- [ ] **Step 3: Implement**

`web-app/app/adapters/identities.ts` — add imports:

```ts
import {
    RequestError,
    HTTP_NOT_FOUND,
} from '../../../api/api.ts';
```

(add `ClientRegistrationEntity` and `ClientStatus` to the
existing types import at the top). Insert after
`deleteIdentityPii` (line 198):

```ts
// The client-registration facet as a tagged union: absence
// (never registered, or deregistered) is a branch, never a
// null — the CALLER renders the unregistered state. Wire
// snake_case crosses to domain camelCase HERE (the adapter
// is the divorce point of vocabulary).
export type ClientRegistration =
    | {
        readonly registered: true;
        readonly grantTypes: string;
        readonly redirectUris: string;
        readonly jwks: string;
        readonly aud: string;
        readonly status: ClientStatus;
    }
    | { readonly registered: false };

export interface ClientRegistrationFields {
    readonly grantTypes: string;
    readonly redirectUris: string;
    readonly jwks: string;
    readonly aud: string;
    readonly status: ClientStatus;
}

export async function getClientRegistration(
    ctx: RequestContext,
    id: Id,
): Promise<ClientRegistration> {
    try {
        const row =
            await ctx.GET<ClientRegistrationEntity>(
                `identities/${id}/registration`,
            );
        return {
            registered: true,
            grantTypes: row.grant_types,
            redirectUris: row.redirect_uris,
            jwks: row.jwks,
            aud: row.aud,
            status: row.status,
        };
    } catch (err) {
        if (
            err instanceof RequestError
            && err.status === HTTP_NOT_FOUND
        ) {
            return { registered: false };
        }
        throw err;
    }
}

export async function putClientRegistration(
    ctx: RequestContext,
    id: Id,
    fields: ClientRegistrationFields,
): Promise<void> {
    await ctx.PUT(`identities/${id}/registration`, {
        grant_types: fields.grantTypes,
        redirect_uris: fields.redirectUris,
        jwks: fields.jwks,
        aud: fields.aud,
        status: fields.status,
    });
    identityChanges.notify();
}

export async function deleteClientRegistration(
    ctx: RequestContext,
    id: Id,
): Promise<void> {
    await ctx.DELETE(`identities/${id}/registration`);
    identityChanges.notify();
}
```

(Both names are verified present in api/api.ts's re-export
block at lines 102–115.)

- [ ] **Step 4: Run to verify it passes**

Run the file, then `./validate`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-app/app/adapters/identities.ts \
    tests/adapters-client-registration.test.ts
git commit -m "add client registration adapter"
```

---

### Task 6: Registration card + dialog on identities detail

**Files:**
- Modify: `web-app/app/presenters/identity-detail.ts`
  (view model + `buildRegistrationCard`; service branch of
  `renderUpdate` at lines 264–266)
- Modify: `web-app/identities/detail.ts` (load + prefill +
  submit/deregister wiring)
- Modify: `web-app/identities/detail.html` (the new
  `<dialog>`)
- Modify: `tests/presenter-identity-detail.test.ts` (every
  `IdentityDetailView` literal gains `registration`; two new
  tests)
- Modify: `TEST-PLAN.md` (new manual case **G47** after G46
  at line 2197; Agent-G row at line 166 gains
  `/ registration` in its facet parenthetical)

**Interfaces:**
- Consumes: Task 5's adapter exports (via the barrel
  `../app/adapters/index.ts`); `openDialog`/`closeDialog`/
  `handleDialogClick` (core.ts — the document-level dialog
  delegate is ALREADY bound in detail.ts:122-131, so
  `data-dialog-cancel` works with zero new wiring);
  `buildReadonlyField` (presenters/detail-field.ts); existing
  `card`/`dialog`/`input`/`textarea`/`label`/`pill[data-tone]`
  CSS (components-cards.css, components-dialog.css,
  components-inputs.css, components-badges.css:169-180). NO
  new CSS.
- Produces: a "Client registration" card in the service
  branch (before Credentials), one `client-registration`
  dialog serving register / edit / rotate-JWKS / status
  toggle / deregister.

- [ ] **Step 1: Write the failing presenter tests**

`tests/presenter-identity-detail.test.ts`:
(a) Add `registration: { registered: false as const },` to
EVERY existing `IdentityDetailView` object literal in the
file (tsc will list them once the interface gains the field —
`personPresenter()` at lines 83–98 is one).
(b) Add two tests at the end:

```ts
test(
    'a service identity renders an unregistered'
    + ' registration card',
    () => {
        const { container, allHtml } =
            makeRecordingContainer();
        new IdentityDetailPresenter({
            identity: new Identity({
                id: 's1', kind: 'service',
            }),
            pii: { erased: true },
            service: { named: true, name: 'Robo',
                detail: 'bot' },
            activeCredentialKinds: [],
            registration: { registered: false },
        }).renderShell(container);
        assert.match(allHtml(), /Client registration/);
        assert.match(allHtml(), /Not registered\./);
        assert.match(allHtml(), /Register client/);
    },
);

test(
    'a registered service renders status tone and fields',
    () => {
        const { container, allHtml } =
            makeRecordingContainer();
        new IdentityDetailPresenter({
            identity: new Identity({
                id: 's1', kind: 'service',
            }),
            pii: { erased: true },
            service: { named: true, name: 'Robo',
                detail: 'bot' },
            activeCredentialKinds: [],
            registration: {
                registered: true,
                grantTypes: 'client_credentials',
                redirectUris: '',
                jwks: '{"keys":[]}',
                aud: 'fusion-ai-web',
                status: 'active',
            },
        }).renderShell(container);
        assert.match(allHtml(), /data-tone="success"/);
        assert.match(allHtml(), /client_credentials/);
        assert.match(allHtml(), /Manage registration/);
    },
);
```

- [ ] **Step 2: Run to verify they fail**

Run:
`node --test --strip-types tests/presenter-identity-detail.test.ts`
Expected: FAIL — `registration` is not a known view property
(compile error) — that IS the failing state; proceed.

- [ ] **Step 3: Implement the presenter**

`web-app/app/presenters/identity-detail.ts`:
(a) Extend the adapters import with
`type ClientRegistration` and `type ClientStatus`.
(b) `IdentityDetailView` gains
`readonly registration: ClientRegistration;`.
(c) Insert before `buildCredentialsCard`:

```ts
const REGISTRATION_TONE: Readonly<
    Record<ClientStatus, string>
> = {
    active: 'success',
    disabled: 'warning',
};

function buildRegistrationFields(
    registration: Extract<
        ClientRegistration, { registered: true }
    >,
): SafeHtml {
    return html`
        <div class="flex items-center gap-2 mb-4">
            <span class="pill" data-tone="${
                REGISTRATION_TONE[registration.status]
            }">${registration.status}</span>
        </div>
        <div class="grid grid-cols-2 gap-4 mb-4">
            ${buildReadonlyField(
                'Grant types', registration.grantTypes,
            )}
            ${buildReadonlyField(
                'Redirect URIs',
                registration.redirectUris,
            )}
            ${buildReadonlyField(
                'Audience', registration.aud,
            )}
            ${buildReadonlyField(
                'JWKS', registration.jwks,
            )}
        </div>`;
}

function buildRegistrationCard(
    view: IdentityDetailView,
): SafeHtml {
    const registration = view.registration;
    return html`
        <div class="card p-6">
            <h3 class="${
                'font-display font-semibold mb-4'
            }">Client registration</h3>
            ${
                registration.registered
                    ? buildRegistrationFields(registration)
                    : html`<p class="${
                        'text-sm text-muted mb-4'
                    }">Not registered.</p>`
            }
            <button
                class="btn btn-outline"
                data-identity-action="registration">
                ${
                    registration.registered
                        ? 'Manage registration'
                        : 'Register client'
                }
            </button>
        </div>`;
}
```

(d) In `renderUpdate`, the service branch (lines 264–266)
becomes:

```ts
                : html`
                    ${buildRegistrationCard(this.#view)}
                    ${buildCredentialsCard(this.#view)}
                    ${buildLinksCard(this.#view)}`,
```

- [ ] **Step 4: Run the presenter tests**

Run:
`node --test --strip-types tests/presenter-identity-detail.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the dialog markup**

`web-app/identities/detail.html` — append after the
`confirm-erase-dialog` `</dialog>`:

```html
<dialog id="client-registration-dialog"
    class="dialog dialog-xwide"
    role="dialog"
    aria-modal="true"
    aria-labelledby="client-registration-title">
    <div class="dialog-header">
        <h3 id="client-registration-title"
            class="dialog-title">
            Client registration</h3>
        <p class="dialog-description">
            OAuth client configuration for this
            service identity.
        </p>
    </div>
    <div class="flex flex-col gap-3 py-4">
        <div>
            <label class="label mb-1 block"
                for="reg-grant-types">Grant types</label>
            <input class="input" id="reg-grant-types"
                placeholder="client_credentials" />
        </div>
        <div>
            <label class="label mb-1 block"
                for="reg-redirect-uris">
                Redirect URIs</label>
            <input class="input" id="reg-redirect-uris"
                placeholder="https://app.example.com/cb" />
        </div>
        <div>
            <label class="label mb-1 block"
                for="reg-aud">Audience</label>
            <input class="input" id="reg-aud"
                placeholder="fusion-ai-web" />
        </div>
        <div>
            <label class="label mb-1 block"
                for="reg-jwks">JWKS</label>
            <textarea class="textarea" rows="4"
                id="reg-jwks"
                placeholder='{"keys":[]}'></textarea>
        </div>
        <div>
            <label class="label mb-1 block"
                for="reg-status">Status</label>
            <select class="input" id="reg-status">
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
            </select>
        </div>
    </div>
    <div class="dialog-footer">
        <button class="btn btn-destructive hidden"
            id="client-registration-deregister">
            Deregister
        </button>
        <button class="btn btn-outline"
            data-dialog-cancel="client-registration">
            Cancel
        </button>
        <button class="btn btn-primary"
            id="client-registration-submit">
            Save
        </button>
    </div>
</dialog>
```

- [ ] **Step 6: Implement the page wiring**

`web-app/identities/detail.ts`:

(a) Extend the adapters import with `getClientRegistration`,
`putClientRegistration`, `deleteClientRegistration`,
`type ClientRegistration`.

(b) `LoadedIdentity` gains
`registration: ClientRegistration;`; add a module-level
`let lastLoaded: LoadedIdentity | null = null;` beside
`currentId`.

(c) In `loadIdentity`, after `activeCredentialKinds`:

```ts
    const registration: ClientRegistration =
        identity.isService()
            ? await getClientRegistration(ctx, identityId)
            : { registered: false };
    return {
        identity, pii, service, activeCredentialKinds,
        registration,
    };
```

(d) `buildView` passes `registration: loaded.registration`
through. In `init`'s `onData` and in `refresh`, set
`lastLoaded = loaded;` before rendering.

(e) In `onClick`, after the `erase` branch:

```ts
    if (action === 'registration') {
        prefillRegistrationDialog();
        openDialog('client-registration');
    }
```

(f) In `bindListeners`, after the confirm-erase binding:

```ts
    $required(
        '#client-registration-submit', document,
    ).addEventListener(
        'click', () => void saveRegistration(), { signal },
    );
    $required(
        '#client-registration-deregister', document,
    ).addEventListener(
        'click', () => void deregisterClient(), { signal },
    );
```

(g) Append the new functions:

```ts
function registrationField(
    selector: string,
): HTMLInputElement {
    return $required(
        selector, document,
    ) as HTMLInputElement;
}

function prefillRegistrationDialog(): void {
    const registration = lastLoaded?.registration;
    const filled = registration?.registered === true
        ? registration
        : undefined;
    registrationField('#reg-grant-types').value =
        filled?.grantTypes ?? '';
    registrationField('#reg-redirect-uris').value =
        filled?.redirectUris ?? '';
    registrationField('#reg-aud').value =
        filled?.aud ?? '';
    registrationField('#reg-jwks').value =
        filled?.jwks ?? '';
    registrationField('#reg-status').value =
        filled?.status ?? 'active';
    $required(
        '#client-registration-deregister', document,
    ).classList.toggle('hidden', filled === undefined);
}

async function saveRegistration(): Promise<void> {
    if (!currentId) return;
    const grantTypes =
        registrationField('#reg-grant-types').value.trim();
    const aud = registrationField('#reg-aud').value.trim();
    const jwks = registrationField('#reg-jwks').value.trim();
    if (grantTypes === '' || aud === '' || jwks === '') {
        showToast(
            'Grant types, audience, and JWKS are required',
            'error',
        );
        return;
    }
    try {
        await putClientRegistration(
            sessionContext(), currentId, {
                grantTypes,
                redirectUris: registrationField(
                    '#reg-redirect-uris',
                ).value.trim(),
                jwks,
                aud,
                status: registrationField('#reg-status')
                    .value as 'active' | 'disabled',
            },
        );
    } catch (err) {
        log.error(
            'putClientRegistration failed',
            'identities', err,
        );
        showToast('Failed to save registration', 'error');
        return;
    }
    showToast('Client registration saved', 'success');
    closeDialog('client-registration');
    await refresh();
}

async function deregisterClient(): Promise<void> {
    if (!currentId) return;
    try {
        await deleteClientRegistration(
            sessionContext(), currentId,
        );
    } catch (err) {
        log.error(
            'deleteClientRegistration failed',
            'identities', err,
        );
        showToast('Failed to deregister client', 'error');
        return;
    }
    showToast('Client registration removed', 'success');
    closeDialog('client-registration');
    await refresh();
}
```

(The prefill's `?? ''` reads are presentation transforms of a
tagged-union absence branch — the union models the absence;
the form renders it as empty fields.)

- [ ] **Step 7: TEST-PLAN case**

`TEST-PLAN.md`: after G46 (line 2197) insert:

```
- [ ] **G47** On a kind-'service' identity's detail page (admin session), a "Client registration" card renders before Credentials showing "Not registered." and a "Register client" button (`data-identity-action="registration"`). Click it → the `client-registration-dialog` opens; fill Grant types `client_credentials`, Audience `fusion-ai-web`, JWKS `{"keys":[]}`, leave Status Active, Save (`#client-registration-submit`) → "Client registration saved" toast, dialog closes, the card shows an `active` pill (`data-tone="success"`) plus Grant types / Redirect URIs / Audience / JWKS fields, and the button reads "Manage registration". Re-open, change JWKS, Save → the card reflects the new JWKS (rotate = same PUT-overwrite). Re-open, set Status Disabled, Save → `disabled` pill (`data-tone="warning"`). Re-open → a "Deregister" button (`#client-registration-deregister`, hidden while unregistered) is visible; click it → "Client registration removed" toast and the card returns to "Not registered." Empty Grant types / Audience / JWKS shows "Grant types, audience, and JWKS are required" and keeps the dialog open. Cancel (`data-dialog-cancel="client-registration"`) discards edits. Source: `web-app/identities/detail.ts` (`saveRegistration` / `deregisterClient`), `web-app/app/presenters/identity-detail.ts` (`buildRegistrationCard`). Wire: PUT|GET|DELETE `identities/:id/registration` (admin realm; kind gate 404/400).
```

And in the Agent-G row (line 166), extend the parenthetical
`(+ credentials / pii / token-revocations /
default-organization)` to
`(+ credentials / pii / registration / token-revocations /
default-organization)`.

- [ ] **Step 8: Commit**

`./validate` first (green), then:

```bash
git add web-app/app/presenters/identity-detail.ts \
    web-app/identities/detail.ts \
    web-app/identities/detail.html \
    tests/presenter-identity-detail.test.ts TEST-PLAN.md
git commit -m "add client registration card and dialog"
```

(The commit precedes the browser pass because `./serve`
builds, and `./build` requires a clean working directory. If
the browser pass surfaces a fix, apply it and
`git commit --amend --no-edit` — the sanctioned mercy.)

- [ ] **Step 9: Verify end-to-end in the browser**

```bash
TMPDIR=/tmp/claude ./serve 8080
```

Drive `http://localhost:8080/identities/index.html` via the
Chrome MCP: create a service identity (G44 flow), open its
detail, then execute the full G47 sequence (register →
rotate → disable → deregister). Confirm card + dialog + toast
behaviors. This is the spec's Verification browser pass.

---

### Task 7: Re-point generic-plumbing fixtures off clients

Test-only; the table still exists, so `./validate` stays
green while every generic fixture stops naming it. Reusable
deterministic row shapes (already established in this suite —
`backend-unique-constraint.test.ts:27-35`,
`db-table-names.test.ts:73-80`):

```ts
const aRequest = {
    uri_prefix: '/organizations/1/ideas/',
    uri_id: '42',
    at: '2026-01-01T00:00:00.000000Z',
    requester_identity_id: 'current',
    message_hash: 'a'.repeat(64),
    message: '{"kind":"request"}',
};
const aResponse = {
    uri_prefix: '/organizations/1/flows/',
    uri_id: '7',
    at: '2026-01-01T00:00:00.000000Z',
    status: 204,
    etag: 'e'.repeat(64),
    message_hash: 'b'.repeat(64),
    message: '{"kind":"response"}',
};
```

Validator key sets the re-pointed fixtures must satisfy
(api/validators.ts:2374-2431): requests
`{uri_prefix (ends '/'), uri_id, at (timestamp),
requester_identity_id, message_hash (64-hex), message}`;
responses `{uri_prefix, uri_id, at, status (int 100..599),
etag, message_hash, message}` + optional
`follows`/`supersedes`. `responses.follows` carries a UNIQUE
index — plumbing fixtures must omit `follows` or keep values
distinct.

**Files (each: replace the clients fixture + every
`clients`/`db.clients`/`'clients'` reference; keep test
INTENT identical):**

- [ ] **Step 1: `tests/db-transaction-view.test.ts`** — the
  `aClient` fixture (lines 5–11) becomes `aResponse` (above);
  every `['clients', 'requests']` table list becomes
  `['responses', 'requests']`; every `view.clients.put('c1',
  aClient)` becomes `view.responses.put('r-tx-1',
  aResponse)`; the nested-mismatch test's `['clients']`-only
  outer set becomes `['responses']`. Run the file — PASS.

- [ ] **Step 2: `tests/backend-unique-constraint.test.ts`** —
  in the one clients test (lines 89–126): `ensureTables(
  ['responses', 'clients'])` → `(['responses', 'requests'])`;
  the `tx.put('clients', {...client fields})` becomes
  `tx.put('requests', { id: 'rq1', ...aRequest })`; the
  read-back `transaction(['clients'], ...
  tx.getAll('clients'))` becomes `(['requests'], ...
  tx.getAll('requests'))` (assert length 0 — never a
  half-write); update the "second table is clients (a
  permanent survivor)" comment (lines 92–93) to name
  `requests` and this re-point. Run — PASS.

- [ ] **Step 3: `tests/db-localstorage-compression.test.ts`**
  — `baseClient` (lines 30–36) becomes a `baseRequest` =
  `aRequest` shape; every `adapter.clients` becomes
  `adapter.requests`; every `KEY_PREFIX + 'clients'` becomes
  `KEY_PREFIX + 'requests'`; test titles rename
  clients→requests; the header comment (lines 27–29) names
  requests as the pinned surface. The vacuous
  `got.name === baseClient.name` assertion (line ~76, both
  sides undefined) becomes a REAL field assertion:
  `assert.equal(got.message, baseRequest.message);` — the
  line is being rewritten anyway; do not preserve a
  can't-fail assertion (a test that cannot fail is a comfort
  object). The gz1-tolerance test gzips a requests row
  instead. Run — PASS.

- [ ] **Step 4: `tests/snapshot-import-validation.test.ts`** —
  every `clients: [...]` snapshot key becomes `requests:
  [...]` with `aRequest`-shaped rows (`{ id: 'u1',
  ...aRequest }`); every `/table "clients"/` regex →
  `/table "requests"/`; every `snapshot\.clients\[0\]` regex
  → `snapshot\.requests\[0\]`; `adapter.clients.getAll()` →
  `adapter.requests.getAll()`; `KEY_PREFIX + 'clients'` →
  `KEY_PREFIX + 'requests'`. The two near-duplicate
  unknown-key tests (lines 317–342 and 344–366): re-point the
  first onto a requests row (`rogue_field` reject), the
  second onto a RESPONSES row (`{ id: 'o1', ...aResponse,
  rogue_field: 'invalid' }`, regex
  `/snapshot\.responses\[0\]/`) and retitle it `'rejects
  response row with unknown key'` — the duplication becomes
  two distinct covenants. The `TABLE_NAMES`-loop tests
  (419–438, 510–531) are constant-driven — no edit. Run —
  PASS.

- [ ] **Step 5: `tests/snapshot-wipe-on-fail.test.ts`** —
  `clientRow` (lines 39–45) becomes `aRequest`; both
  snapshot literals swap `clients:` → `requests:`; the
  invalid second-import row `{ id: 'm2', status: 'paused' }`
  stays (on requests, `status` is an unknown key → rejects
  at the gate exactly as before); the final read-back uses
  `adapter.requests.getAll()`. Run — PASS.

- [ ] **Step 6: `tests/adapters-snapshots.test.ts`** —
  `clientFields()`/`buildClient()` (lines 46–60) become
  `requestFields()`/`buildRequest()` returning the `aRequest`
  shape; every `db.clients.*` → `db.requests.*`; every
  `parsed.clients` → `parsed.requests` (line 96's pair check
  becomes `parsed.requests` + `parsed.responses`); because
  `requests` also carries the seeded admin pairs, change
  exact-length assertions (`rows.length === 1`,
  `parsed.clients.length === 1`) to `.some((r) => r.id ===
  'u1')` membership assertions where the snapshot import
  did NOT wipe the seeds, and keep exact assertions where
  the import replaced everything (read the surrounding
  `withVersion` vs `withAdminRows` usage per test — an
  import of `withVersion({requests: [buildRequest('u2')]})`
  leaves EXACTLY one requests row, so `rows.length === 1`
  still holds there). Fix the duplicated identical
  assertion at lines 384–389 by asserting requests AND
  responses are both empty (one assertion each).
  `MissingTableError('clients')` (line 626) →
  `MissingTableError('requests')`. The
  `RETIRED_TABLES`-driven test (393–413) is data-driven —
  no edit. Run — PASS.

- [ ] **Step 7:
  `tests/snapshot-import-identity-validation.test.ts`** —
  re-point the data table onto the message plane (spec §7
  keeps this file as the second validation edge):

```ts
const VALID_ROWS: Record<
    string, Record<string, unknown>
> = {
    requests: {
        id: 'rq1',
        uri_prefix: '/organizations/1/ideas/',
        uri_id: '42',
        at: '2026-01-01T00:00:00.000000Z',
        requester_identity_id: 'current',
        message_hash: 'a'.repeat(64),
        message: '{"kind":"request"}',
    },
    responses: {
        id: 'rs1',
        uri_prefix: '/organizations/1/ideas/',
        uri_id: '42',
        at: '2026-01-01T00:00:00.000000Z',
        status: 200,
        etag: 'e'.repeat(64),
        message_hash: 'b'.repeat(64),
        message: '{"kind":"response"}',
    },
};

const BAD_OVERRIDE: Record<
    string, Record<string, unknown>
> = {
    requests: { at: 'not-a-timestamp' },
    responses: { status: 9999 },
};
```

Rewrite the header (lines 9–15): the identity-spine framing
is done — this file now pins the snapshot gate's
value-level validation on the two message-plane survivors,
still mirroring snapshot-import-validation.test.ts. Run —
PASS (4 generated tests).

- [ ] **Step 8: Full gate + commit**

`./validate` — green (clients still in TABLE_NAMES; only
`mock-data-fingerprint.test.ts`, `db-table-names.test.ts`,
`pin-invitation-client-rehome-parity.test.ts`, and
`client-assertion.test.ts` still reference clients, and all
still pass).

```bash
git add tests/db-transaction-view.test.ts \
    tests/backend-unique-constraint.test.ts \
    tests/db-localstorage-compression.test.ts \
    tests/snapshot-import-validation.test.ts \
    tests/snapshot-wipe-on-fail.test.ts \
    tests/adapters-snapshots.test.ts \
    tests/snapshot-import-identity-validation.test.ts
git commit -m "re-point plumbing fixtures off clients"
```

---

### Task 8: Delete the clients table

**Files:**
- Modify: `api/db.ts` (TABLE_NAMES 288-292; DbStores 211-218;
  `rawReadRow` in GuardedDbAdapter 260-276;
  SNAPSHOT_SCHEMA_VERSION 331 + narrative comment;
  ClientEntity import)
- Modify: `api/db-backed.ts` (clients field 56; buildStores
  entry 226-228; both rawReadRow implementations 168-178 and
  201-204; ClientEntity + validateClientEntity imports)
- Modify: `api/snapshot-validator.ts` (the `case 'clients'`
  arm 28-30 + validateClientEntity import)
- Modify: `api/validators.ts` (delete `validateClientEntity`
  1081-1096; keep CLIENT_BODY_KEYS — it serves
  validateClientRegistrationEntity; prune the ClientEntity
  type import)
- Modify: `api/types.ts` (delete `ClientEntity` + its comment
  block 585-602; `ClientStatus` at 583 SURVIVES)
- Modify: `api/client-assertion.ts` (type re-point at lines
  15 and 89/182: `ClientEntity` → `ClientRegistrationEntity`)
- Modify: `web-app/app/adapters/snapshots.ts`
  (`RETIRED_TABLES` at 91 gains `'clients',` — first entry)
- Modify: comment-only stale sites naming clients as a
  survivor: `api/api.ts:313`, `api/request-context.ts:51`
  ("Surviving stores are global (clients + message plane)" →
  "Surviving stores are the message plane"),
  `api/access-token.ts:30` ("per-client multi-audience
  validation via the clients registry" → "via the
  registration facet"), `api/types.ts:502` ("the OAuth spine
  (clients, identity-tokens, ...)" → "(client registrations,
  identity-tokens, ...)"), and
  `web-app/app/storage-keys.ts:1-5` (the header's
  "(fusion-ai:clients|requests|responses)" example →
  "(fusion-ai:requests|responses)") — five sites; the final
  grep sweep in Verification depends on all five
- Modify: `tests/client-assertion.test.ts` (import + return
  type of `clientWith` → `ClientRegistrationEntity`)
- Modify: `tests/db-table-names.test.ts` (move `'clients'`
  from the survivor array line 14 into the dropped array
  lines 26-61; retitle the dropped test `'TABLE_NAMES drops
  ideas..objectives, roster, and clients'`)
- Modify: `tests/pin-invitation-client-rehome-parity.test.ts`
  (delete the rawReadRow test at lines 187-219; delete the
  now-dead `ClientEntity` import at line 8 and, if unused by
  the surviving pins, the `EntityNotFoundError` import at
  line 7; update the header comment 23-32 — pin 3 retired
  with its subject, pins 1-2 survive)
- Delete: `tests/mock-data-fingerprint.test.ts` (its EXPECTED
  map's sole entry was the clients sentinel; empty-vs-empty
  is a comfort object)
- Modify: `tests/snapshot-import-validation.test.ts` (add the
  v4-reject pin)
- Regenerate: `SCHEMA.svg` via `./generate-schema-svg`

**Interfaces:**
- Consumes: nothing new. After Tasks 3+7 the only remaining
  `clients` references are the ones this task deletes —
  verify with `grep -rn "\bclients\b" api/ web-app/ tests/`
  before starting; the hit list must match the Files list
  above.
- Produces: `TABLE_NAMES = ['requests', 'responses']`;
  `SNAPSHOT_SCHEMA_VERSION = 5`; no `rawReadRow` anywhere;
  orphan-store posture is leave-inert (the unversioned
  IndexedDB open never re-fires onupgradeneeded — existing
  origins keep the dead store unread until deleteSchema; NO
  migration code, per the gate-6 residual statement).
  Mock-data pair counts (1506 / bootstrap 13) UNAFFECTED —
  clients seeded zero rows and zero pairs.

- [ ] **Step 1: Write the failing pins**

(a) `tests/db-table-names.test.ts`: remove `'clients'` from
the survivor array (line 14); add `'clients',` to the dropped
array (after `'states',` at line 60); retitle the dropped
test.

(b) `tests/snapshot-import-validation.test.ts`: add beside
the existing historical version-reject tests:

```ts
test(
    'rejects a genuine v4 (pre-clients-elimination) export',
    async () => {
        installShim();
        const adapter = localStorageDbAdapter();
        const json = JSON.stringify({
            '__schema_version__': 4,
            requests: [],
        });
        await assert.rejects(
            () => adapter.putSnapshot(json),
            (err: Error) =>
                err instanceof SnapshotVersionMismatchError,
        );
    },
);
```

(`SnapshotVersionMismatchError` is already imported at line
10 of this file; the historical-version reject tests at
lines 176–231 use exactly this instanceof idiom.)

- [ ] **Step 2: Run to verify they fail**

`node --test --strip-types tests/db-table-names.test.ts` —
FAIL (`clients still in TABLE_NAMES`). The v4-reject test
FAILS (4 === SNAPSHOT_SCHEMA_VERSION today, so the import
succeeds).

- [ ] **Step 3: Implement the deletion**

In order (each edit is quoted in Files above):
1. `api/db.ts`: TABLE_NAMES loses `'clients',`; DbStores
   loses the `clients:` member; `GuardedDbAdapter` loses the
   `rawReadRow` declaration and its comment (the interface
   keeps `transaction`); the `ClientEntity` import goes;
   `SNAPSHOT_SCHEMA_VERSION` becomes `5` and its narrative
   comment gains: `the clients elimination deletes the last
   entity table (client config re-homed to the
   identities/:id/registration pair facet) and bumps 4→5.`
   Update the stale `db.ts:210` comment ("clients rides
   HistoryEntityStore" → the two message stores).
2. `api/db-backed.ts`: drop the `clients!` field, the
   buildStores `clients:` entry, the class `rawReadRow`
   method (168-178), the `#viewForTx` `rawReadRow` member
   (201-204), and the `ClientEntity`/`validateClientEntity`
   imports. Update the class-header "All three surviving
   stores" comment to "Both surviving stores".
3. `api/snapshot-validator.ts`: drop the `case 'clients':`
   arm and the `validateClientEntity` import.
4. `api/validators.ts`: delete `validateClientEntity`
   (1081-1096) and the `ClientEntity` type import; adjust the
   `CLIENT_BODY_KEYS` comment to name its one surviving
   consumer (`validateClientRegistrationEntity`).
5. `api/types.ts`: delete the `ClientEntity` interface + its
   comment block (585-602). `ClientStatus` stays.
6. `api/client-assertion.ts`: `import type {
   ClientRegistrationEntity } from './types.ts';`; the
   `client:` params in `claimsFault` (line 89) and
   `verifyClientAssertion` (line 182) re-type to
   `ClientRegistrationEntity`. Update the module-header's
   "client's registered JWKS" wording only if it names the
   table (it does not — leave prose).
7. `web-app/app/adapters/snapshots.ts`: `RETIRED_TABLES`
   gains `'clients',` as the first entry (line 92).
8. The four comment-only sites (Files list above).
9. `tests/client-assertion.test.ts`: import + `clientWith`
   return type → `ClientRegistrationEntity`.
10. `tests/pin-invitation-client-rehome-parity.test.ts`:
    delete lines 187-219 (the whole rawReadRow test); prune
    dead imports; header comment now names two pins and
    records pin 3's retirement with its subject.
11. `git rm tests/mock-data-fingerprint.test.ts`.
12. Regenerate the schema picture: `./generate-schema-svg`
    (the drift gate in ./validate must then pass).

- [ ] **Step 4: Run the whole gate**

`./validate` — green: type-check proves zero survivors
reference `ClientEntity`/`rawReadRow`/`db.clients`; the
suite proves wire behavior is unchanged; the SVG gate proves
the schema of record shrank to the pure message plane.
Also `grep -rn "\bclients\b" api/ web-app/app/adapters/`
returns ZERO hits (docs and TEST-PLAN hits remain for
Task 9).

- [ ] **Step 5: Snapshot round-trip check (spec Verification)**

Add nothing new — confirm the existing suite covers it: the
v4-reject pin (Step 1), the v5 export/import round-trips in
`adapters-snapshots.test.ts` + `db-localstorage-compression
.test.ts` (both stamped by the constant, already re-pointed
in Task 7). Run those two files once more explicitly.

- [ ] **Step 6: Commit**

```bash
git add -A api/ web-app/app/adapters/snapshots.ts \
    web-app/app/adapters/identities.ts tests/
git commit -m "delete clients table"
```

(`git add -A tests/` records the fingerprint deletion; check
`git status` — ONLY the files this task names may appear.)

---

### Task 9: Docs pass

**Files:** `SCHEMA.md`, `API-TREE.md`, `ARCHITECTURE.md`,
`CLAUDE.md`, `TEST-PLAN.md`, `API.md`. No code. Exact sites
(verified against current text):

- [ ] **Step 1: SCHEMA.md**
  - Opening (lines 12-16): drop "plus one survivor registry
    row store, `clients`"; "(the authoritative count: three)"
    → "(the authoritative count: two)"; the message plane IS
    the schema of record now.
  - Version narrative (lines 34-42): leading "**4**
    (states-address retirement)" → "**5** (clients
    elimination)"; append to the history sentence: `; the
    clients elimination deletes the last entity table and
    bumps 4→5 — a v4 export is rejected by a v5 import.`
  - Delete the whole `## Survivor tables` section (lines
    109-145): `### clients` is its ONLY subsection —
    `requests`/`responses` live under the separate
    `## Messages (schema of record)` heading, which stands
    unchanged.
  - Under `## Derived document families (no table)`
    (line 210), after the Flow tags template, add:

```
### Client registration (pair-plane only, no table)

`identities/:id/registration` (clients elimination) is the
client-config facet of a kind-`'service'` identity — the
family that replaced the `clients` table. A singleton
document at the identity's own nested address (uriId `''`,
the `/pii` address shape) that Supersedes-chains like
`/credentials` — NOT a hard-delete zone. Body:
`{ grant_types, redirect_uris, jwks, aud, status }`;
`status` (`active` | `disabled`) rides the document, so the
schema's last mutable lifecycle column is gone with the
table. Register, rotate-JWKS, and disable are all the same
PUT-overwrite; every revision is an appended pair —
registration history for free. DELETE is a marked tombstone
= deregistration. Admin-realm writes; kind-`'service'` gate
(absent identity 404 / person 400 / non-admin 403 / unauth
401-before-404). `grantClientCredentials` derives it
pre-token via `deriveClientRegistration`
(`api/derive-identity-spine.ts`); `act.sub` carries the
acting client on authorization_code redemption.
```

  - Also update line 234's family list ("identities,
    organizations, role grants, and the rest") — no change
    needed unless it enumerates exceptions; verify by
    reading.

- [ ] **Step 2: API-TREE.md** (lint-exempt; single-line
  entries)
  - Line 63 becomes (spec §8's exact tree voice):

```
└─|─ /clients[/:id]                            • RETIRED (clients retirement): noun retired — client = kind-'service' identity + /identities/:id/registration facet; act.sub carries the acting client on authorization_code redemption; clients TABLE DELETED (TABLE_NAMES 2 — pure message plane; SNAPSHOT_SCHEMA_VERSION 4→5); rawReadRow retired with it
```

  - In the `/identities/:id` block, after the `/pii` line
    (line 26), insert:

```
  |      └─|─ /registration                    • RECONCILED (clients retirement): client registration facet — single-slot PUT-overwrite document (grant_types, redirect_uris, jwks, aud, status), admin-realm writes, kind-'service' gate; grantClientCredentials derives it pre-token (bearer-exempt precedent); DELETE tombstone = deregistration
```

- [ ] **Step 3: ARCHITECTURE.md** (4 sites)
  - Lines 150-154: "surviving stores (`clients`, `requests`,
    `responses`) are global" → "the message plane
    (`requests`, `responses`) is global".
  - Line 418: "`TABLE_NAMES` = `clients`, `requests`,
    `responses` only" → "`TABLE_NAMES` = `requests`,
    `responses` only".
  - Lines 629-659 (as-built narrative): after the "states-
    address retirement bumps 3→4" clause add "; the clients
    elimination re-homes client config to the
    identities/:id/registration pair facet, deletes the last
    entity table, retires rawReadRow, and bumps 4→5"; in
    claim 2 (lines 655-657) the table-key set becomes
    "`requests` + `responses`" and the version reference
    updates.
  - Lines 692-703 (Gate 6 list): the "Client credentials →
    rawReadRow('clients', …) on the KEPT clients table" line
    becomes "Client credentials → deriveClientRegistration
    (identities/:id/registration pair facet — clients TABLE
    DELETED)"; the Follow-on note line becomes "Follow-on
    DISCHARGED: client = kind-'service' identity +
    registration facet SHIPPED (clients elimination)".

- [ ] **Step 4: CLAUDE.md** (repo root; 78-char lint applies)
  - Database bullet (lines 173-177): "`TABLE_NAMES` is three:
    `clients`, `requests`, `responses` — all on
    `HistoryEntityStore`." → "`TABLE_NAMES` is two:
    `requests`, `responses` — the pure message plane, both
    on `HistoryEntityStore`."
  - Auth bullet (lines 100-120): after the PKCE sentence
    add: "A client is a kind-'service' identity + a
    registration facet (`identities/:id/registration`,
    admin-realm, kind-gated); `grantClientCredentials`
    derives it pre-token, and authorization_code redemption
    stamps `act.sub` with the acting client."
  - Testing bullet (lines 325-338): "mock-data validity (pair
    count 1506 / bootstrap 13 absolute; fingerprint file
    shrunk to the clients sentinel)" → "mock-data validity
    (pair count 1506 / bootstrap 13 absolute; the mock-data
    fingerprint file retired with the clients table)". Add
    the new suites to the list voice if the bullet enumerates
    families (client registration facet + derive).
  - Gotchas "Snapshot version gate" bullet (lines ~405-444):
    the "(currently **4**)" becomes "(currently **5**)"; add
    "; the clients elimination (last entity table) is 4→5"
    to the bump history sentence.
- [ ] **Step 5: TEST-PLAN.md** (lint-exempt; 4 sites — the
  spec said 3; grep found 4)
  - Line 153: "only three tables (`clients`, `requests`,
    `responses`)" → "only two tables (`requests`,
    `responses`)".
  - Line 567 (AA2): "exactly three: `clients`, `requests`,
    `responses`) plus the `__schema__` marker" → "exactly
    two: `requests`, `responses`) plus the `__schema__`
    marker"; keep the orphan-store sentence (now also covers
    the dead clients store).
  - Line 2241: delete the sentence "`clients` is empty
    (sentinel)."
  - Line 2715 (L1): "4 object stores (3 tables in
    `TABLE_NAMES` — `clients`, `requests`, `responses` —
    plus `__schema__`)" → "3 object stores (2 tables in
    `TABLE_NAMES` — `requests`, `responses` — plus
    `__schema__`)".
- [ ] **Step 6: API.md**
  - Lines 842-844 (§3.8 client_credentials arm): replace the
    stale "`clients.getById` → status/grant-type checks →"
    with "`deriveClientRegistration`
    (identities/:id/registration facet; absent/tombstoned →
    401 `unknown client`) → status/grant-type checks →".
    (This also discharges the spec's "§3.9 stale
    clients.getById" note — the claim lives in §3.8.)
  - In the same §3.8, the `authorization_code` arm gains:
    "mints `act: {sub: clientId}` — the acting client — on
    the access token (RFC 8693 shape, the token-exchange
    precedent)."
  - Grep `clients` across API.md for any remaining table
    references and update them to the facet voice.
- [ ] **Step 7: Gate + commit**

`./validate` (the .md lint applies to CLAUDE.md/SCHEMA.md/
ARCHITECTURE.md/API.md at the root; TEST-PLAN.md and
API-TREE.md are exempt).

```bash
git add SCHEMA.md API-TREE.md ARCHITECTURE.md CLAUDE.md \
    TEST-PLAN.md API.md
git commit -m "update docs for clients retirement"
```

---

## Verification (whole-feature)

- `./validate` green at every one of the nine commits.
- Browser pass (after Task 6, already executed as its Step
  8): `TMPDIR=/tmp/claude ./serve 8080`, drive the identities
  detail page via Chrome MCP — create a service identity,
  register, rotate JWKS, disable, deregister (TEST-PLAN G47).
- Grant path end-to-end: the automated suite's
  WebCrypto-signed client_assertion fixtures now run over the
  facet (api-authentication-token.test.ts, re-pointed in
  Task 3).
- Snapshot: v5 export/import round-trips
  (adapters-snapshots.test.ts); a v4 export rejects with
  `SnapshotVersionMismatchError` (the Task 8 pin).
- Final sweep: `grep -rni "clients" api/ web-app/ tests/`
  returns only the registration-facet vocabulary
  (client_credentials, client-registration,
  ClientRegistrationEntity, client-assertion) — no table
  references anywhere.

## Out of scope (spec)

- Server-tier hard-PKCE, jti replay tracking.
- client_secret-credential grants (client_credentials remains
  private_key_jwt-only).
- Re-gating the auth-free snapshot plane.
- Seeding any registered client in mock/bootstrap data (none
  exists today; none is added).

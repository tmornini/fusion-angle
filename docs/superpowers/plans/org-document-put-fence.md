# The organization document PUT fence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Close the cross-tenant write on
`PUT organizations/:id`: the PUT takes the path fence,
its conditional becomes `required`, and the record says
so.

**Architecture:** Two product edits. The path fence's
exemption in `api/api.ts` narrows to the document's
GET reads, so its PUT meets the fence every
`organizations/...` route meets. `WRITE_RESPONSE_SPECS`
in `api/routes.ts` moves the route to class B. Thirteen
test sites that leaned on the unfenced PUT move to
`seedOrganizationDocument` or latch the claim
organization's head. Then six record commits.

**Tech Stack:** Deno 2.9.6, `Deno.test` with
`@std/assert`, the in-process `handleRequest` gate, the
memory adapter.

**Spec:** `docs/superpowers/specs/org-document-put-fence-design.md`
(commit 1, amended by commit 2). The plan argues from it.
Read both.

## Global Constraints

- Worktree `.worktrees/org-document-put-fence`, branch
  `org-document-put-fence`, based on `next-release` at
  `c9dfce78`. Never rebase, merge, or push. Never pass
  the Agent tool `isolation`; never create a worktree.
- One worker per worktree: a task that writes files runs
  alone and in order. Only read-only agents run in
  parallel.
- `export DENO_DIR="$TMPDIR/deno-dir"` before any `deno`
  or `./test` command.
- Pre-flight, before Task 4: in this sandbox,
  `./test check` fails at HEAD with two TS7006 errors at
  `tests/pg-ledger-store.test.ts:267` and `:279`. The
  `$TMPDIR/deno-dir` copy of `npm:postgres@3.4.9` has no
  `package.json`, so its types do not resolve; the
  operator's `~/Library/Caches/deno` copy has one. Each
  Layer 1 gate below assumes a cache that type-checks
  HEAD green. The conductor settles the cache before
  Task 4; no task edits that test.
- Never run `./deploy --render`, `./bin/build`, the seed,
  or the wipe.
- Stage by path only (`git add <path>…`); never
  `git add -A` or `git commit -a`.
- Every commit: one subject line, present-tense
  imperative, about 50 characters, and the trailer as
  its only body, exactly
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  The commit form used below is
  `git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- 78-character lines in every file `./test lint` lints
  (code and scripts; not `.md`), 4-space indent. Keep
  the `.md` prose near 78 too.
- Prose says "organization admin" or "operator", never
  bare "admin"; the role string `admin` stays. `grant`
  is a verb.
- `noUnusedLocals` is on: an import a task stops using
  is removed in that task.
- Doctrine: Security, Reliability, Uniformity. Never
  loosen R1-R3 or leg 4's parity assertions (Test
  Weakening). No second fence in a handler (Internal
  Defense). No new fixture: reuse
  `seedOrganizationDocument(db: DbAdapter, id: Id,
  name: string): Promise<void>`, defined at
  `tests/root-admin-fixture.ts:69`, re-exported from
  `tests/test-fixtures.ts:11-14`. It returns early when
  the document exists (Unbidden Helper Code).
- Out of scope, never edited: `postOrganizationDocumentOp`,
  `ROUTE_POLICY`, the seed, the bootstrap seed. There is
  no new Layer 2 case, and no pin for a stale `If-Match`
  or `If-None-Match: *` (under `optional` the gate
  already answers both 412, so a pin could not fail).
- Layer 2 runs outside the sandbox only when the whole
  Bash command is exactly `./test browser` or
  `./test validate browser`: no export, `&&`, pipe,
  redirect, or env prefix. A compound form stays
  sandboxed and fails with "Chrome DevToolsActivePort
  timed out".

## Review Focus

These are failure modes the spec implies but its tests
do not pin. None gets a task. Each line ending in a
question goes to the owner.

1. Verbs with no handler on `organizations/:id`
   (`DELETE`, `PATCH`, `POST`, `HEAD`), sent to a
   foreign or absent id, now answer the path fence's 403
   before the router's 405 or 404. On the caller's own
   id nothing changes. This matches "foreign paths 403",
   and no test pins it. Pin it?
2. A member's PUT on a foreign organization answers 403
   with the path fence's body, where it got the role
   body before. The status is the same and the body is
   unpinned. Leave it unpinned?
3. The absent-claim genesis. A claim naming an
   organization with no document still reaches
   `If-None-Match: *` genesis. It is filed (Task 9), not
   built, by the owner's decision.
4. Any product caller that PUTs the organization without
   a held message now gets 428. The only caller is
   `client/admin.ts:118` through `putOrganization`
   (`client/organizations.ts:37`), which latches. That is
   pinned at Layer 1 (`tests/adapters-admin.test.ts:267`)
   and covered by the Layer 2 gate.
5. "deriveOrganizations mirrors every PUT wire body,
   id-lex ordered" (`tests/derive-organizations.test.ts:85`)
   seeds its organizations after Task 5, so its name no
   longer says what it does. The spec keeps the name.
   Rename it in Task 5?

## Execution waves

The conductor has already made commits 1-3: the spec,
its amendment, and this plan.

1. **Task 4**, one writer, alone. Then two read-only
   reviewers in parallel: one for spec compliance, one
   for code quality.
2. **Task 5**, one writer, alone. It depends on Task 4,
   whose red cases it turns green. Then the same parallel
   review pair.
3. **Tasks 6-11**, one writer, one serial dispatch of
   six commits in order. They depend on Task 5 for the
   facts they record, and no task touches another's
   file, except that Tasks 8, 9, and 10 all edit
   `TODO.md`. Task 9's line lands directly after Task 8's
   new line, so the order holds. Then the parallel review
   pair over the six commits.
4. **Finish.**
   - One read-only subagent runs oracle lines 1, 3, 4,
     and 5 (see Oracle).
   - The conductor runs `./test validate browser`,
     exactly that command, alone.
   - A final read-only whole-branch review.

The owner's assignments: Task 4 goes to `coder`, Task 5
to `planner`, and Tasks 6-11 to one `coder` dispatch.
After each writer, a spec-compliance reviewer and a
code-quality reviewer, both read-only, are dispatched
together. A fix round goes back to the writer, or to
`architect` if a second round fails. The final
whole-branch review is `architect`, read-only.

---

### Task 4: Pin the organization document PUT fence

R1-R3, red on the branch.

**Files:**
- Modify: `tests/api-organization-isolation.test.ts:35-36`
  (an import) and insert after `:275`, the end of "a
  content-tier member is still denied admin writes"
  (`:267-275`).
- Modify: `tests/drift-organizations.test.ts`: insert
  after `:306`, the end of leg 4 (`:270-306`).

**Interfaces:**
- Consumes these, all already imported in their files:
  - `twoOrganizations(): Promise<{ db; organizationA;
    organizationB }>`
    (`tests/api-organization-isolation.test.ts:74`). It
    seeds organizationA's document and an `admin` seat
    for `XXZruirZyAOoRpNxaDnpSA` there, and nothing for
    organizationB.
  - `req(method, path, token, body?)`
  - `organizationToken(sub, organization)`
  - `organizationRow(name)`
  - `seedOrganizationDocument`
  - `generateIdentifier`
  - `deriveOrganization(db, id)`
  - In drift, `seededDb()`,
    `MULTI_ORGANIZATION_IDENTITY_ID` and
    `STARK_ORGANIZATION`.
- Produces: three test names that Task 5 turns green:
  - "an organization admin PUT on an absent id is 403"
  - "an organization admin PUT on a foreign org is 403"
  - "leg 4b: PUT /organizations/:id with no precondition
    is 428 and leaves the head unchanged"

- [ ] **Step 1: Widen the derive import in the isolation
  file**

Replace, at `tests/api-organization-isolation.test.ts:35-36`:

```ts
import { deriveOrganization } from
    '../api/derive-organizations.ts';
```

with:

```ts
import {
    deriveOrganization,
    deriveOrganizations,
} from '../api/derive-organizations.ts';
```

- [ ] **Step 2: Add R1 and R2 after "a content-tier member
  is still denied admin writes"**

Insert directly after that case's closing `});`
(`:275`), before the blank line and
`// ---- T8: the parent-derived READ fence`:

```ts

// The organization document's PUT takes the path fence: its
// id must be the claim organization. An absent id is the
// path fence's fixed 403, and nothing is stored.
Deno.test('an organization admin PUT on an absent id is 403',
async () => {
    const { db, organizationA } = await twoOrganizations();
    const fresh = generateIdentifier();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/' + fresh,
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', organizationA),
        organizationRow('Fresh')));
    assertStrictEquals(res.status, 403);
    assertEquals(await res.json(), {
        error: 'forbidden: path organization does not match'
            + ' the token organization',
    });
    assertEquals(
        (await deriveOrganizations(db))
            .filter((organization) => organization.id === fresh),
        [],
    );
});

// A real organization the caller is no member of answers
// the same 403, and its document keeps its name.
Deno.test('an organization admin PUT on a foreign org is 403',
async () => {
    const { db, organizationA, organizationB } =
        await twoOrganizations();
    await seedOrganizationDocument(db, organizationB, 'Wayne');
    const res = await handleRequest(db, req(
        'PUT', '/organizations/' + organizationB,
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', organizationA),
        organizationRow('Hijack')));
    assertStrictEquals(res.status, 403);
    assertEquals(await res.json(), {
        error: 'forbidden: path organization does not match'
            + ' the token organization',
    });
    assertStrictEquals(
        (await deriveOrganization(db, organizationB)).name, 'Wayne',
    );
});
```

- [ ] **Step 3: Add R3 after leg 4 in the drift file**

Insert directly after leg 4's closing `});` (`:306`),
before the blank line and `// ---- leg 5`:

```ts

// The organization document's PUT is class B: it only
// rewrites the live head, so a PUT naming no head is 428
// (RFC 6585 §3) and stores nothing.
Deno.test('leg 4b: PUT /organizations/:id with no precondition'
+ ' is 428 and leaves the head unchanged', async () => {
    const db = await seededDb();
    const adminToken = await organizationToken(
        MULTI_ORGANIZATION_IDENTITY_ID, STARK_ORGANIZATION,
    );
    const before = await deriveOrganization(
        db, STARK_ORGANIZATION,
    );
    const put = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION,
        adminToken, organizationRow('Stark Unlatched'),
    ));
    assertStrictEquals(put.status, 428);
    assertEquals(await put.json(), {
        error: 'If-Match or If-None-Match is required to PUT'
            + ' /organizations/' + STARK_ORGANIZATION,
    });
    assertEquals(
        await deriveOrganization(db, STARK_ORGANIZATION),
        before,
    );
});
```

- [ ] **Step 4: Gate: type-check and lint green, R1-R3
  red for the spec's reasons**

Run: `./test check`, then `./test lint`. Expected: both
exit 0.

Run: `./test`. Expected: exit non-zero, with exactly
three FAILED cases. Each fails on its first status
assertion:

| Case | Actual | Expected |
|---|---|---|
| "an organization admin PUT on an absent id is 403" | 201 | 403 |
| "an organization admin PUT on a foreign org is 403" | 200 | 403 |
| "leg 4b: … is 428 and leaves the head unchanged" | 200 | 428 |

Every other case is `ok`. The UTC pass fails, so
`./test` stops before the time-zone pass, which these
files do not touch. A scratch export of this exact
change showed this result. If any other case is red,
stop and report.

- [ ] **Step 5: Commit only the two test files**

```bash
git add tests/api-organization-isolation.test.ts \
    tests/drift-organizations.test.ts
git commit -m "Pin the organization document PUT fence" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Fence the organization document PUT

Section 1's two edits, section 2's thirteen test sites,
and the regenerated `rooms.ts`, in one commit.

**Files:**
- Modify: `api/api.ts:617-632` (path-fence comment and
  arm) and `:656-663` (membership-fence comment)
- Modify: `api/routes.ts:3066-3068`
- Regenerate: `web-app/api-documentation/rooms.ts`
  (`put/organizations/id`, `:2588` and `:2603-2604`)
- Modify, tests:
  - `tests/api-organization-isolation.test.ts:7-11`,
    `:167-177`, `:221-232`
  - `tests/adapters-organizations.test.ts:3`, `:58-61`,
    `:78-80`
  - `tests/drift-organizations.test.ts:276-282`
  - `tests/adapters-admin.test.ts:255-256`
  - `tests/api-versions-etag.test.ts:391-424`
  - `tests/derive-organizations.test.ts:20-23`, `:34-38`,
    `:60-69`, `:73-83`, `:85-112`, `:129-149`,
    `:153-171`, `:175-194`, `:198-204`

**Interfaces:**
- Consumes: Task 4's three cases, which must go green.
  `getOrganizationEntity(ctx): Promise<HttpMessage<OrganizationEntity>>`
  (`client/admin.ts:22`, already imported in
  `tests/adapters-admin.test.ts`). `ctx.PUT<T>(resource,
  body, latch?)` (`client/request-context.ts:149`).
  `apiRequest({ method, path, token?, body?, headers? })`
  (`tests/http-fixtures.ts:182`). `pairIdOf(response)`
  (`tests/http-fixtures.ts:34`). `DEV_TOKEN`
  (`tests/token-fixtures.ts:140`) is
  `organizationToken()`: subject
  `XXZruirZyAOoRpNxaDnpSA`, claim organization
  `AjdvjuECVZEgZoFajaIEkg`, which `seedAdminSchema`
  seeds along with its `admin` seat.
- Produces: `putClaimOrganization(db, body)`, local to
  `tests/derive-organizations.test.ts`. It replaces that
  file's existing local `putOrganization` and is not a
  new fixture.

- [ ] **Step 1: Narrow the path fence's exemption to
  reads, at `api/api.ts:617-632`**

Replace:

```ts
                // Nested org path fence: after fenceRequest and
                // before authorizeRequest. Path org never
                // authorizes alone — mismatch (incl.
                // nonexistent path org) is 403 with a fixed
                // body. No auto-exchange. The organization
                // document and its versions keep the
                // membership fence below; every other
                // organizations/... match takes this arm.
                if (
                    match !== null
                    && match.route.segments[0]
                        === 'organizations'
                    && !isOrganizationDocumentPath(
                        fencePattern,
                    )
                    && fenceParams[0]
```

with:

```ts
                // Nested org path fence: after fenceRequest and
                // before authorizeRequest. Path org never
                // authorizes alone — mismatch (incl.
                // nonexistent path org) is 403 with a fixed
                // body. No auto-exchange. Reads of the
                // organization document and its versions keep
                // the membership fence below; its PUT, and
                // every other organizations/... match, take
                // this arm.
                if (
                    match !== null
                    && match.route.segments[0]
                        === 'organizations'
                    && !(
                        method === 'GET'
                        && isOrganizationDocumentPath(
                            fencePattern,
                        )
                    )
                    && fenceParams[0]
```

`isOrganizationDocumentPath` (`:156-165`) and its
comment stay.

- [ ] **Step 2: Rewrite the membership fence's comment,
  at `api/api.ts:656-663`**

Replace:

```ts
                // Organization document reads (item and
                // versions) are global passthrough;
                // fence READS to the caller's memberships.
                // A real org the caller is not a member of
                // is 403 (honest); a genuinely absent id
                // stays 404. PUT is not gated here — a new
                // org is created before its first membership
                // exists.
```

with:

```ts
                // Organization document reads (item and
                // versions) are global passthrough;
                // fence READS to the caller's memberships.
                // A real org the caller is not a member of
                // is 403 (honest); a genuinely absent id
                // stays 404. The document's PUT took the
                // path fence above.
```

The `if (method === 'GET' && …)` below it does not
change.

- [ ] **Step 3: Make the route class B, at
  `api/routes.ts:3066-3068`**

Replace:

```ts
    // G3: GET wins. Stored PUT = GET, `id` first.
    'organizations/:id': {
        conditional: 'optional',
```

with:

```ts
    // G3: GET wins. Stored PUT = GET, `id` first. Class B: a
    // PUT only rewrites the live head and never creates the
    // document; the operator's seed does.
    'organizations/:id': {
        conditional: 'required',
```

- [ ] **Step 4: Regenerate the API documentation**

Run: `./bin/generate-api-documentation`. Expected:
`wrote web-app/api-documentation`. The whole diff in
`web-app/api-documentation/rooms.ts` is the
`put/organizations/id` room:

```diff
-            'If-Match or If-None-Match: * (optional)',
+            'If-Match or If-None-Match: *',
...
             '412',
+            '428',
         ],
```

- [ ] **Step 5: The isolation file: delete the dead PUT,
  move `contentMemberDb`'s**

The `devToken` import goes, since nothing else in the
file uses it. Replace (`:7-11`):

```ts
    claimToken,
    devToken,
    organizationToken,
```

with:

```ts
    claimToken,
    organizationToken,
```

In "enumerate returns only the caller member orgs",
delete `:167-177`, leaving `:166` followed directly by
`:178`. Replace:

```ts
    const { db, organizationA } = await twoOrganizations();
    // Seeded through the live document PUT (not a raw
    // db.organizations.put) so organizationA has a message pair — the
    // GET /identities/:id/organizations/ derives from
    // the ledger, not the old organizations table. organizationB stays a
    // raw row: `current` is never a member of B, so the
    // membership filter excludes it whether or not it derives.
    await handleRequest(db, req(
        'PUT', '/organizations/' + organizationA,
        await devToken('XXZruirZyAOoRpNxaDnpSA'),
        organizationRow('Acme'),
    ));
    // Phase Final Stage B
```

with:

```ts
    const { db, organizationA } = await twoOrganizations();
    // Phase Final Stage B
```

In `contentMemberDb` (`:221-232`), replace:

```ts
    // seedAdminSchema (not bare postSchemaCreation) so `current`
    // can create org A through the live document PUT below —
    // GET /identities/:id/organizations/ derives
    // from the ledger, so a raw db.organizations.put would be
    // invisible to it. `current` never appears in an assertion
    // here; it exists only to author the org A document.
    await seedAdminSchema(db);
    await handleRequest(db, req(
        'PUT', '/organizations/' + organizationA,
        await devToken('XXZruirZyAOoRpNxaDnpSA'),
        organizationRow('Acme'),
    ));
```

with:

```ts
    // GET /identities/:id/organizations/ derives from the
    // ledger, so org A needs its document pair; it is written
    // below the fence, the path the operator's seed takes.
    await seedAdminSchema(db);
    await seedOrganizationDocument(db, organizationA, 'Acme');
```

- [ ] **Step 6: `tests/adapters-organizations.test.ts`:
  two setup creates move to the seed path**

Replace (`:3`):

```ts
import { organizationRow } from './test-fixtures.ts';
```

with:

```ts
import {
    organizationRow,
    seedOrganizationDocument,
} from './test-fixtures.ts';
```

Replace (`:58-61`):

```ts
    await ctx.PUT(
        'organizations/' + generateIdentifier(),
        organizationRow('Beta'),
    );
```

with:

```ts
    await seedOrganizationDocument(db, generateIdentifier(), 'Beta');
```

Replace (`:78-80`):

```ts
        await ctx.PUT(
            'organizations/' + id, organizationRow('O-' + id),
        );
```

with:

```ts
        await seedOrganizationDocument(db, id, 'O-' + id);
```

The loop keeps its `[high, low]` write order, which is
that case's subject.

- [ ] **Step 7: Drift leg 4 latches the head it reads**

Replace (`:276-282`):

```ts
    const updatedFields = organizationRow(
        'Stark Industries Renamed',
    );
    const put = await handleRequest(db, req(
        'PUT', '/organizations/' + STARK_ORGANIZATION,
        adminToken, updatedFields,
    ));
```

with:

```ts
    const updatedFields = organizationRow(
        'Stark Industries Renamed',
    );
    const read = await handleRequest(db, req(
        'GET', '/organizations/' + STARK_ORGANIZATION, adminToken,
    ));
    assertStrictEquals(read.status, 200);
    await read.body?.cancel();
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/' + STARK_ORGANIZATION,
        token: adminToken,
        body: updatedFields,
        headers: { 'If-Match': read.headers.get('ETag')! },
    }));
```

The rest of leg 4 does not change: 200, then wire,
derive, and stored parity.

- [ ] **Step 8: `tests/adapters-admin.test.ts:243`: the
  setup PUT latches**

Replace (`:255-256`):

```ts
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg'
            , organizationRow('Acme'));
```

with:

```ts
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg'
            , organizationRow('Acme'),
            [await getOrganizationEntity(ctx)]);
```

- [ ] **Step 9: `tests/api-versions-etag.test.ts:387`:
  seed, then two latched PUTs**

In "two organization PUTs list oldest first, each part
the item its tag serves", replace `:391-424`:

```ts
        const db = await seedMemberOrganizations();
        const id = generateIdentifier();
        const token = await claimToken({
            organization: id,
            organizations: [id],
            roles: ['admin:' + id],
        });
        const path = '/organizations/' + id;
        const firstBody = organizationRow('First');
        const secondBody = organizationRow('Second');
        const first = await handleRequest(db, req(
            'PUT', path, token, firstBody,
        ));
        assertStrictEquals(first.status, 201);
        await first.body?.cancel();
        const second = await handleRequest(db, req(
            'PUT', path, token, secondBody,
        ));
        assertStrictEquals(second.status, 200);
        await second.body?.cancel();
        const list = await handleRequest(db, req(
            'GET', path + '/versions/', token,
        ));
        assertStrictEquals(list.status, 200);
        const versions = await partsOf<OrganizationEntity>(
            list,
        );
        assertStrictEquals(versions.length, 2);
        assertEquals(versions[0]!.body().toValue(), {
            id, ...firstBody,
        });
        assertEquals(versions[1]!.body().toValue(), {
            id, ...secondBody,
        });
```

with:

```ts
        const db = await seedMemberOrganizations();
        const id = generateIdentifier();
        await seedOrganizationDocument(db, id, 'Genesis');
        const token = await claimToken({
            organization: id,
            organizations: [id],
            roles: ['admin:' + id],
        });
        const path = '/organizations/' + id;
        const genesisBody = organizationRow('Genesis');
        const firstBody = organizationRow('First');
        const secondBody = organizationRow('Second');
        const read = await handleRequest(db, req(
            'GET', path, token,
        ));
        assertStrictEquals(read.status, 200);
        await read.body?.cancel();
        const first = await handleRequest(db, apiRequest({
            method: 'PUT', path, token, body: firstBody,
            headers: { 'If-Match': read.headers.get('ETag')! },
        }));
        assertStrictEquals(first.status, 200);
        await first.body?.cancel();
        const second = await handleRequest(db, apiRequest({
            method: 'PUT', path, token, body: secondBody,
            headers: { 'If-Match': first.headers.get('ETag')! },
        }));
        assertStrictEquals(second.status, 200);
        await second.body?.cancel();
        const list = await handleRequest(db, req(
            'GET', path + '/versions/', token,
        ));
        assertStrictEquals(list.status, 200);
        const versions = await partsOf<OrganizationEntity>(
            list,
        );
        assertStrictEquals(versions.length, 3);
        assertEquals(versions[0]!.body().toValue(), {
            id, ...genesisBody,
        });
        assertEquals(versions[1]!.body().toValue(), {
            id, ...firstBody,
        });
        assertEquals(versions[2]!.body().toValue(), {
            id, ...secondBody,
        });
```

The same seven lines, from `assertStrictEquals(versions.length, 2);`
through the second `});`, also appear in a later case.
Edit only this one. The `for (const part of versions)`
loop that follows does not change; it now walks three
parts.

- [ ] **Step 10: `tests/derive-organizations.test.ts`:
  five cases latch the claim organization, one seeds**

Replace the header comment's last line (`:37-38`):

```ts
// wire-body / derive agreement and message-plane document proofs.
// Every pair is still built through the live PUT route.
```

with:

```ts
// wire-body / derive agreement and message-plane document proofs.
// A PUT here rewrites the claim organization's live head,
// latched on the ETag it reads; any other organization a
// case needs is seeded below the fence.
```

Replace the import (`:20-23`):

```ts
import {
    seedAdminSchema,
    organizationRow,
} from './test-fixtures.ts';
```

with:

```ts
import {
    seedAdminSchema,
    organizationRow,
    seedOrganizationDocument,
} from './test-fixtures.ts';
```

Replace the local helper (`:60-69`):

```ts
function putOrganization(
    db: MemoryDbAdapter,
    id: string,
    name: string,
): Promise<Response> {
    return handleRequest(db, req(
        'PUT', '/organizations/' + id, DEV_TOKEN,
        organizationRow(name),
    ));
}
```

with:

```ts
// DEV_TOKEN's claim organization, which seedAdminSchema
// seeds. The organization document's PUT is class B and
// takes the path fence, so only this id's live head takes
// a PUT, and only with its current ETag.
const CLAIM_ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';

async function putClaimOrganization(
    db: MemoryDbAdapter,
    body: Record<string, unknown>,
): Promise<Response> {
    const path = '/organizations/' + CLAIM_ORGANIZATION;
    const read = await handleRequest(db, req(
        'GET', path, DEV_TOKEN,
    ));
    assertStrictEquals(read.status, 200);
    await read.body?.cancel();
    return handleRequest(db, apiRequest({
        method: 'PUT',
        path,
        token: DEV_TOKEN,
        body,
        headers: { 'If-Match': read.headers.get('ETag')! },
    }));
}
```

In "deriveOrganization mirrors the PUT wire body
exactly", replace (`:75-80`):

```ts
    const db = await freshDb();
    const organizationId = generateIdentifier();
    const res = await putOrganization(db, organizationId, 'Acme');
    assertStrictEquals(res.status, 201);
    const wire = await res.json();
    const derived = await deriveOrganization(db, organizationId);
```

with:

```ts
    const db = await freshDb();
    const res = await putClaimOrganization(
        db, organizationRow('Acme'),
    );
    assertStrictEquals(res.status, 200);
    const wire = await res.json();
    const derived = await deriveOrganization(
        db, CLAIM_ORGANIZATION,
    );
```

In "deriveOrganizations mirrors every PUT wire body,
id-lex ordered", replace (`:88-95`):

```ts
    // seedAdminSchema plants org 'AjdvjuECVZEgZoFajaIEkg'; these two PUTs add
    // more heads — derive is id-lex over the full set.
    const organizationB = generateIdentifier();
    const organizationA = generateIdentifier();
    const beta = await putOrganization(db, organizationB, 'Beta');
    const alpha = await putOrganization(db, organizationA, 'Alpha');
    assertStrictEquals(beta.status, 201);
    assertStrictEquals(alpha.status, 201);
```

with:

```ts
    // seedAdminSchema plants org 'AjdvjuECVZEgZoFajaIEkg'; these
    // two seeds add more heads — derive is id-lex over the
    // full set.
    const organizationB = generateIdentifier();
    const organizationA = generateIdentifier();
    await seedOrganizationDocument(db, organizationB, 'Beta');
    await seedOrganizationDocument(db, organizationA, 'Alpha');
```

Its order and name assertions do not change.

In "a second live PUT supersedes the first; derive sees
the NEW head, not the genesis body", replace
(`:131-139`):

```ts
    const db = await freshDb();
    const organizationId = generateIdentifier();
    const first = await putOrganization(db, organizationId, 'First');
    const firstId = pairIdOf(first);
    assert(firstId);
    const second = await putOrganization(db, organizationId, 'Second');
    assertStrictEquals(second.headers.get('Supersedes'), null);

    const derived = await deriveOrganization(db, organizationId);
```

with:

```ts
    const db = await freshDb();
    const first = await putClaimOrganization(
        db, organizationRow('First'),
    );
    const firstId = pairIdOf(first);
    assert(firstId);
    await first.body?.cancel();
    const second = await putClaimOrganization(
        db, organizationRow('Second'),
    );
    assertStrictEquals(second.headers.get('Supersedes'), null);

    const derived = await deriveOrganization(
        db, CLAIM_ORGANIZATION,
    );
```

and replace (`:146`):

```ts
        all.filter((org) => org.id === organizationId).length, 1,
```

with:

```ts
        all.filter((org) => org.id === CLAIM_ORGANIZATION).length,
        1,
```

In "the pair lives at the flat /organizations/ prefix, no
organization segment — derive takes no org argument",
replace (`:156-170`):

```ts
    const db = await freshDb();
    const organizationId = generateIdentifier();
    await putOrganization(db, organizationId, 'Flat');
    const requests = await db.messagePairs.getAll();
    // nil root + seedAdminSchema's 2 pairs + this PUT.
    assertStrictEquals(requests.length, 4);
    const stored = requests.find(
        (row) => row.name === organizationId,
    );
    assert(stored !== undefined);
    assertStrictEquals(stored.path, '/organizations/');
    assertStrictEquals(stored.name, organizationId);

    const derived = await deriveOrganization(db, organizationId);
    assertStrictEquals(derived.id, organizationId);
```

with:

```ts
    const db = await freshDb();
    const put = await putClaimOrganization(
        db, organizationRow('Flat'),
    );
    const putId = pairIdOf(put);
    await put.body?.cancel();
    const requests = await db.messagePairs.getAll();
    // nil root + seedAdminSchema's 2 pairs + this PUT.
    assertStrictEquals(requests.length, 4);
    const stored = requests.find((row) => row.id === putId);
    assert(stored !== undefined);
    assertStrictEquals(stored.path, '/organizations/');
    assertStrictEquals(stored.name, CLAIM_ORGANIZATION);

    const derived = await deriveOrganization(
        db, CLAIM_ORGANIZATION,
    );
    assertStrictEquals(derived.id, CLAIM_ORGANIZATION);
```

The count stays four: the GET stores no pair, and the
PUT still adds one. The case finds the PUT's own pair by
its ETag, because the seed's pair now shares the name.

In "a PUT whose body echoes id round-trips through
derivation, …", replace (`:178-192`):

```ts
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/pcOGAHXkUUQAIuXHzKMGnw', DEV_TOKEN,
        { id: 'pcOGAHXkUUQAIuXHzKMGnw', ...organizationRow('Echo') },
    ));
    assertStrictEquals(res.status, 201);
    const wire = await res.json();

    const derived = await deriveOrganization(db, 'pcOGAHXkUUQAIuXHzKMGnw');
    assertEquals(derived, wire);

    const all = await deriveOrganizations(db);
    assertEquals(
        all.find((org) => org.id === 'pcOGAHXkUUQAIuXHzKMGnw'), wire,
    );
```

with:

```ts
    const db = await freshDb();
    const res = await putClaimOrganization(
        db, { id: CLAIM_ORGANIZATION, ...organizationRow('Echo') },
    );
    assertStrictEquals(res.status, 200);
    const wire = await res.json();

    const derived = await deriveOrganization(
        db, CLAIM_ORGANIZATION,
    );
    assertEquals(derived, wire);

    const all = await deriveOrganizations(db);
    assertEquals(
        all.find((org) => org.id === CLAIM_ORGANIZATION), wire,
    );
```

In "stored PUT body equals organizationEntityOf
id-first", replace (`:200-204`):

```ts
    const db = await freshDb();
    const id = generateIdentifier();
    const fields = organizationRow('Streamed');
    const put = await putOrganization(db, id, 'Streamed');
    assertStrictEquals(put.status, 201);
```

with:

```ts
    const db = await freshDb();
    const id = CLAIM_ORGANIZATION;
    const fields = organizationRow('Streamed');
    const put = await putClaimOrganization(db, fields);
    assertStrictEquals(put.status, 200);
```

"deriveOrganization 404s with store-shaped
EntityNotFoundError on an absent id" (`:114-125`) does
not change.

- [ ] **Step 11: Gate: Layer 1 green**

Run: `./test validate`. Expected: exit 0.
- `deno check` green. Every touched import is still
  used; `devToken` is gone from the isolation file.
- `./test` is all `ok` in both passes, including R1-R3
  and the twelve moved cases.
- `./test lint` is clean.
- `generate-api-documentation --check` prints
  `api-documentation is up to date`.

A scratch export of HEAD with exactly these edits ran
the UTC suite with no failures in any touched file, and
passed `./test lint`, `./test schema`, and
`./test api-docs`.

Run: `git diff --stat`. Expected: exactly the nine paths
in Step 12, and nothing under `server/`, `api/mock-data`,
`api/mock-data.ts`, or `api/authorization.ts`.

- [ ] **Step 12: Commit**

```bash
git add api/api.ts api/routes.ts \
    web-app/api-documentation/rooms.ts \
    tests/api-organization-isolation.test.ts \
    tests/adapters-organizations.test.ts \
    tests/drift-organizations.test.ts \
    tests/adapters-admin.test.ts \
    tests/api-versions-etag.test.ts \
    tests/derive-organizations.test.ts
git commit -m "Fence the organization document PUT" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Rewrite the tenancy prose on the fence

**Files:**
- Modify: `ARCHITECTURE.md:154-173` ("Two names for
  people") and `:175-190` (the paragraph after it)

**Interfaces:** Consumes Task 5's behavior: a foreign or
absent id answers 403; the claim organization's own PUT
needs a conditional.

- [ ] **Step 1: Replace the "Two names for people" tail,
  `:162-173`**

Replace:

```markdown
and the identity fence confines it to co-members. It
reaches no other organization's documents but one:
`PUT organizations/:id` passes the path fence
(`api/api.ts:629`), and the membership fence gates
only its GET (`api/api.ts:664`), so an organization
admin can create an organization or overwrite
another's document. The **operator** is whoever holds
`POSTGRES_URL` and `JWT_HMAC_SIGNING_KEY` and runs
`./deploy`, the seed, and the wipe. The operator is
not an identity, holds no token, and never acts over
HTTP. Organizations come from the operator's seed, or
from that unfenced `PUT organizations/:id`.
```

with:

```markdown
and the identity fence confines it to co-members. It
reaches no other organization's documents. The
**operator** is whoever holds `POSTGRES_URL` and
`JWT_HMAC_SIGNING_KEY` and runs `./deploy`, the seed,
and the wipe. The operator is not an identity, holds
no token, and never acts over HTTP. Organizations come
only from the operator's seed; no request creates one.
```

- [ ] **Step 2: Replace the next paragraph, `:175-190`**

Replace:

```markdown
A foreign id under the caller's own organization path
is absent there: a write geneses or 404s, a read 404s.
Global-plane reads of an organization document answer
a foreign owner 403, an absent one 404. Global-plane
identity reads and writes are the identity fence:
co-membership. When the path identity is not the actor,
an accepted membership in the claim organization admits
the request. Absent, orphan, and foreign answer the same
403, body `forbidden: <METHOD> <path> names an identity
outside this organization`. Self stays self. The
organization admin's `/` rows stay and reach co-members
only on the identity plane. Path `:organization-id` on an
org-nested route must equal the claim org else 403. A
membership name's organization half must equal the
path's (403). Its identity half must equal the path's
(404).
```

with:

```markdown
A foreign id under the caller's own organization path
is absent there: a write geneses or 404s, a read 404s.
Global-plane reads of an organization document answer
a foreign owner 403, an absent one 404. Its PUT takes
the path fence: a foreign or absent id is 403, and the
claim organization's own PUT requires If-Match.
Global-plane identity reads and writes are the identity
fence: co-membership. When the path identity is not the
actor, an accepted membership in the claim organization
admits the request. Absent, orphan, and foreign answer
the same 403, body `forbidden: <METHOD> <path> names an
identity outside this organization`. Self stays self.
The organization admin's `/` rows stay and reach only
co-members and the claim organization. Path
`:organization-id` on an org-nested route must equal the
claim org else 403. A membership name's organization
half must equal the path's (403). Its identity half
must equal the path's (404).
```

- [ ] **Step 3: Gate**

Run: `grep -n "unfenced\|but one:\|on the identity plane" ARCHITECTURE.md`.
Expected: no output, exit 1. That proves the old
exception and the narrowing are gone (oracle line 3).

Run: `grep -n "no request creates one\|reach only" ARCHITECTURE.md`.
Expected: two lines, inside `## Tenancy`.

Run: `./test validate`. Expected: exit 0. It does not
lint `.md`, so the greps are this task's proof.

- [ ] **Step 4: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "Rewrite the tenancy prose on the fence" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Name the organization PUT a class B write

**Files:**
- Modify: `API.md:270` (the `required` row of the
  conditional table)

**Interfaces:** Consumes `conditional: 'required'` from
Task 5.

- [ ] **Step 1: Edit the row**

Replace:

```markdown
| `required` | If-Match or If-None-Match: * | class B: the flow and work-order PUTs; the instance PATCH; the organization-nest membership item `organizations/:id/invitations/:membership-id` |
```

with:

```markdown
| `required` | If-Match or If-None-Match: * | class B: the flow, work-order, and organization document PUTs; the instance PATCH; the organization-nest membership item `organizations/:id/invitations/:membership-id` |
```

- [ ] **Step 2: Gate**

Run: `grep -n "organization document PUTs" API.md`.
Expected: one line, `270:`, in the conditional table.
Run: `./test validate`. Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add API.md
git commit -m "Name the organization PUT a class B write" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Close the fence line and file personal organizations

**Files:**
- Modify: `TODO.md`:
  - insert after `:3320`, the end of "A person identity
    is created only by its person" (`:3315-3320`)
  - delete the fence line, `:3330-3335` before the
    insert

**Interfaces:** Task 9 inserts its line directly after
this task's new line. Task 10 edits `TODO.md:558`, above
both.

- [ ] **Step 1: File the personal-organization line**

Insert directly after this line:

```markdown
  orphan no view lists.
```

this text:

```markdown
- A person identity's genesis also creates that
  person's personal organization, an organization like
  any other, with an accepted `admin` membership, in
  the same statement; with SP-6 and item 5. Open: the
  default organization, since PRIMARY takes the
  earliest join and the personal organization would be
  every person's earliest.
```

- [ ] **Step 2: Drop the fence line**

Delete these six lines whole:

```markdown
- Fence `PUT organizations/:id`. It passes the path
  fence (`api/api.ts:629`), and the membership fence
  gates only its GET (`api/api.ts:664`), so an
  organization admin can create an organization or
  overwrite another's document. Security; a red test
  first.
```

- [ ] **Step 3: Gate**

Run: `grep -n 'Fence `PUT organizations' TODO.md`. Use
single quotes so the shell does not run the backticks.
Expected: no output, exit 1 (oracle line 4).

Run: `grep -n "personal organization, an organization" TODO.md`.
Expected: one line, two lines below
`A person identity is created only by its person.`

Run: `./test validate`. Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add TODO.md
git commit -m "Close the fence line and file personal organizations" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: File the absent-claim organization genesis

**Files:**
- Modify: `TODO.md`: insert directly after Task 8's
  personal-organization line

**Interfaces:** Consumes Task 8's line as its anchor. The
line decides nothing: it names the hole, why it is
unreachable, and the open question.

- [ ] **Step 1: File the line**

Insert directly after this line:

```markdown
  every person's earliest.
```

this text:

```markdown
- A claim naming an organization with no document
  passes the path fence on `PUT organizations/:id`, and
  `If-None-Match: *` there creates the document,
  against decision 5's "never a genesis"
  (`docs/superpowers/specs/org-document-put-fence-design.md`).
  Unreachable today: every claim organization has a
  seeded document, and nothing pins that. Open: which
  status refuses it, and at which gate.
```

- [ ] **Step 2: Gate**

Run: `grep -n "A claim naming an organization with no document" TODO.md`.
Expected: one line, directly after the
personal-organization line.

Run: `./test validate`. Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -m "File the absent-claim organization genesis" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Retarget the postIdentityCreation citation

**Files:**
- Modify: `TODO.md:558`

**Interfaces:** `postIdentityCreation` is at
`client/identities.ts:284`.

- [ ] **Step 1: Edit the line**

Replace:

```markdown
  (`postIdentityCreation`, `client/identities.ts:314`),
```

with:

```markdown
  (`postIdentityCreation`, `client/identities.ts:284`),
```

- [ ] **Step 2: Gate**

Run: `grep -n "export async function postIdentityCreation" client/identities.ts`.
Expected: `284:`. Run: `grep -n "identities.ts:314" TODO.md`.
Expected: no output. Run: `./test validate`. Expected:
exit 0.

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -m "Retarget the postIdentityCreation citation" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Correct the person-retire roster oracle

**Files:**
- Modify: `docs/superpowers/specs/identities-person-retire-design.md:271-272`
  (§7 oracle 3)

**Interfaces:** The roster's type and row hold
`kind: 'person'` at `client/identities.ts:75` and `:114`.

- [ ] **Step 1: Edit oracle 3**

Replace:

```markdown
3. `grep -rn "kind: 'person'" client/identities.ts`
   prints nothing.
```

with:

```markdown
3. `grep -rn "kind: 'person'" client/identities.ts`
   prints only the two roster lines, the
   `IdentityRosterRow` type (`:75`) and its row
   (`:114`).
```

- [ ] **Step 2: Gate**

Run: `grep -rn "kind: 'person'" client/identities.ts`.
Expected, exactly:

```
client/identities.ts:75:        readonly kind: 'person';
client/identities.ts:114:                kind: 'person',
```

Run: `./test validate`. Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/identities-person-retire-design.md
git commit -m "Correct the person-retire roster oracle" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Oracle

Spec §5, line by line. A read-only subagent runs lines 1,
3, 4, and 5 against the branch tip. The conductor runs
line 2 alone.

1. **R1-R3 are red at commit 4 and green at commit 5.**
   The subagent checks out neither commit. It exports
   each one into a scratch directory with
   `git archive <sha> | tar -x -C "$TMPDIR/oracle-<sha>"`,
   then runs there:

   ```bash
   export DENO_DIR="$TMPDIR/deno-dir"
   JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
       deno test --frozen --no-check --allow-env \
       --allow-read --allow-write --allow-net \
       --allow-run=deno,sh \
       --preload ./tests/hmac-test-key.ts \
       --preload ./tests/local-storage-stub.ts \
       --preload ./tests/session-storage-stub.ts \
       --preload ./tests/worker-name-prefix.ts \
       tests/api-organization-isolation.test.ts \
       tests/drift-organizations.test.ts
   ```

   Expected at commit 4: `FAILED | … | 3 failed`, with
   the three R1-R3 names and diffs `201`/`403`,
   `200`/`403`, `200`/`428`. Expected at commit 5:
   `ok | … | 0 failed`.
2. **`./test validate browser` is green on the branch
   tip.** The conductor runs exactly
   `./test validate browser`, alone, outside the
   sandbox. Expected: exit 0.
3. **`grep -n "unfenced\|but one:" ARCHITECTURE.md`
   prints nothing.** Expected: no output, exit 1.
4. **`grep -n 'Fence `PUT organizations' TODO.md`
   prints nothing.** Single-quote the pattern; the
   spec's double-quoted form lets bash run the
   backticks. Expected: no output, exit 1.
5. **`git diff c9dfce78 -- server api/mock-data
   api/mock-data.ts api/authorization.ts` prints
   nothing.** Expected: no output.

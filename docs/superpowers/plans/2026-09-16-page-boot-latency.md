# Page boot latency — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this spec's worktree (AGENTS.md
> § Worktrees): `.worktrees/2026-09-16-page-boot-latency`,
> branch `2026-09-16-page-boot-latency`, base `750c39b0`,
> spec commit `f32aef76`.

> **For the dispatching orchestrator (AGENTS.md § Subagents):**
> every subagent prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then push down: the 78-char lint on
> code/scripts (not `.md`), 4-space indent, the `org`
> identifier ban (spell `organization`), present-tense-
> imperative ~50-char commit subjects with the mandated
> trailer, the Sin of Test Weakening (when test and code
> diverge the code changes — except where THIS plan names a
> covenant the spec itself rewrote), the Sin of Unbidden
> Helper Code (each task's diff is its story), the Sin of
> Default Values (absence is `null` or `undefined` at the
> call site, never `??`'d in a helper), the Sin of Internal
> Defense (trust validated data inside the walls), the Sin
> of the Cache (passing already-fetched rows is not a cache;
> re-fetching them is the defect), and the codebase patterns
> named under "Context an implementer must know". Subagents
> work in the worktree the orchestrator names and never
> create their own — never pass the Agent tool `isolation`.
> Subagents never run `./deploy --render`. The "Dependency
> graph and lanes" section says which tasks may run
> concurrently and how the orchestrator gives each concurrent
> lane its own worktree; one worker per worktree, always.

**Goal:** Cut authenticated page boot wall time by six
internal changes: standalone reads as one statement, token
document reads with a moved spend marker, one membership
derivation per grant, concurrent work-order bindings and
one transition read, a one-hop return-visit boot, five
client fan-out dedupes, and hashed gzip-encoded
code-split assets.

**Architecture:** No new routes. The storage seam gains a
`read` that issues one statement with no BEGIN; grants
thread rows they already hold; the client sends the
persisted organization on refresh and skips the two GETs
when the token already names a reachable tenant; pages
accept already-fetched rows; the build hashes, gzips, and
splits what `Deno.serve` currently sends as `app.js`
`no-store`.

**Tech Stack:** Deno 2.9.6, TypeScript strict under
`deno.json` (`noUncheckedIndexedAccess`, `noUnusedLocals`,
`verbatimModuleSyntax`, `erasableSyntaxOnly`), `Deno.test`
+ `@std/assert`, memory backend for Layer 1, Docker
Postgres for `./test postgres`, `deno bundle
--code-splitting --format esm` for the client. No new
dependencies. No `node:` import in the build (gzip via
`CompressionStream('gzip')`).

**Spec:**
`docs/superpowers/specs/2026-09-16-page-boot-latency-design.md`.
Read it first; every task cites its section. The parent
axiom is
`docs/superpowers/specs/2026-09-15-exact-read-folds-design.md`
§ Axiom: a read is a collection (exact `path`) or a
document (exact `path` and `name`).

## Global Constraints

- One concern per commit, in the spec's order (§ Sequence).
  Lanes may run concurrently, but they land on the spec
  branch in that order (see "Dependency graph and lanes").
- `./test validate` green on every commit that lands on the
  spec branch. Red on a lane branch is fine; red on landing
  is not.
- Never move/rename a file and change its content in the
  same commit (AGENTS.md § Commit).
- The axiom: no third read kind. Bindings stay exact
  collection reads issued concurrently, not a subtree
  `LIKE`.
- One read, many uses: rows a request has already fetched
  are trusted within that request. Passing them down is
  not a cache.
- `readTransaction` and `transaction` keep BEGIN/COMMIT.
  Only standalone store reads (`backendRunner` + mode
  `'readonly'`) take the new `read` path.
- Wipe and reseed for the marker prefix. No dual-read of
  `name = sha256(code)` in the tokens collection.
- No new API endpoint. Part 4 extends the body of the
  existing refresh grant.
- HTML stays `no-store`. Hashed names already earn
  `immutable` (`isHashedAssetName` /
  `staticCacheControl`).
- Commit subject ≈50 chars, present-tense imperative, no
  body beyond the trailer the executing agent is bound to
  by AGENTS.md § Commit.

## Two interpretations this plan fixes

The spec leaves two things to the plan. Both are stated
here so the operator can overrule them before dispatch;
every task below is written against them.

**(A) Memory `read` does not take the write serializer.**
Spec § 1: "The memory backend serves it from the live rows
under the same serializer, without the buffer copy." The
named Layer 1 pin is "a standalone read during an open
write transaction sees committed rows, not the buffer."
That pin is only possible if `read` does not wait on
`#serialize`: a write holds the serializer for its whole
body, copies into a buffer, and adopts on resolve. `read`
therefore snapshots the live array reference
(`const live = this.#rows`) and serves `bufferTx(live,
'readonly')`. Reads already hand out row copies
(`tests/backend-read-isolation.test.ts`). Writes still
serialize against each other. `readTransaction` still
copies. "Under the same serializer" names the same row
store the serializer guards, not an exclusive lock on
`read`. A nested `backend.read` from inside
`backend.transaction` therefore sees committed rows, not
the write's buffer, and does not deadlock.

**(B) Same-string tokens share one revocation check.**
Spec Decision 4: "Subject equals actor is checked first.
The exchange revocation-checks one token when both are
the same." Verify first (one `verifyAccessToken` when
`subject_token === actor_token`, else two). Then
`subject !== actor` is 403 with today's wording, before
any revocation check — a revoked token in a cross-party
exchange now 403s self-delegation rather than 401
revoked; the spec rewrote that order. When the strings
are equal, one `tokenRevocationReason`. When the strings
differ but `sub` is equal, two checks (two jtis). The
boot client already sends the same access token as both
(`postOrganizationSessionExchange`).

## Dependency graph and lanes

```
            spec commit f32aef76
                     │
   ┌────────┬────────┼────────┬────────┐
   │        │        │        │        │
 Lane A   Lane B   Lane C   Lane D   Lane E
 Task 1   Task 2   Task 4   Task 6   Task 11
 (read)   (marker  (work-   (workbox (assets)
   │       + docs)  orders)   dedupe)
   │        │        │        Task 7
   │      Task 3     │        (flow-
   │      (member-   │         stats)
   │       ship +    │        Task 8
   │       actor)    │        (record)
   │        │        │        Task 9
   │      Task 5     │        (dash)
   │      (one-hop)  │        Task 10
   │        │        │        (org)
   └────────┴────────┴────────┴────────┘
                     │
              orchestrator W1
           (measure --record after)
```

Edges: 3 → 2 (same file, token shape first); 5 → 3
(`grantRefresh` after `subjectClaims`); 4 has no
predecessor; 6–10 have no predecessor and are serial
inside Lane D only because they are five named commits,
not because they share files (they do not — they may
become five one-task lanes if the orchestrator prefers);
11 has no predecessor. Task 1 shares no product file
with 2–11.

**Landing order on the spec branch** (spec § Sequence):
Task 1, Task 2, Task 3, Task 4, Task 5, Tasks 6–10,
Task 11. Lane B's Task 5 lands after Lane C even though
it is ready after Task 3. Spec part 2 is Tasks 2 then 3
(one concern each: the token document, then the grant's
one derivation). Spec part 5 is Tasks 6–10.

**Shared files across lanes** (the rebase hot spots):

| File | Lanes |
|---|---|
| `api/authentication.ts` | B only (Tasks 2, 3, 5) |
| `api/routes.ts` | C (GET work-orders/ attach) |
| `api/derive-states.ts` | C only |
| `web-app/app/app-boot.ts` | B/Task 5 |
| `web-app/app/adapters/work-orders-queries.ts` | D/Tasks 6–7 |
| `server/http-server.ts` | E only |
| `bin/build-lib` | E only |
| `TODO.md` | E (cachability bullet) |

**Lane worktrees.** The orchestrator, from the spec
worktree, creates one worktree per concurrent lane off
the spec commit, names it in the subagent prompt, and
never passes `isolation`:

```bash
cd .worktrees/2026-09-16-page-boot-latency
for lane in a b c d e; do
    git worktree add \
        "../2026-09-16-page-boot-latency-lane-$lane" \
        -b "2026-09-16-page-boot-latency-lane-$lane"
done
```

Each lane's tasks run serially in that lane's worktree
by one subagent at a time. The spec worktree is the
trunk.

**Integration** (the orchestrator, after each lane
reports green on its own `./test validate`):

```bash
cd .worktrees/2026-09-16-page-boot-latency
git merge --ff-only <sha of Task 1>
./test validate
# Lane B Tasks 2 then 3:
git -C ../2026-09-16-page-boot-latency-lane-b \
    rebase 2026-09-16-page-boot-latency
git merge --ff-only 2026-09-16-page-boot-latency-lane-b
# stop before Task 5 if that lane still has it unpushed;
# otherwise cherry-pick / ff only up through Task 3.
./test validate
git merge --ff-only <sha of Task 4>
./test validate
# Lane B remaining (Task 5):
git -C ../2026-09-16-page-boot-latency-lane-b \
    rebase 2026-09-16-page-boot-latency
git merge --ff-only 2026-09-16-page-boot-latency-lane-b
./test validate
for n in 6 7 8 9 10; do
    git merge --ff-only <sha of Task $n>
    ./test validate
done
git merge --ff-only <sha of Task 11>
./test validate
for lane in a b c d e; do
    git worktree remove \
        "../2026-09-16-page-boot-latency-lane-$lane"
    git branch -d \
        "2026-09-16-page-boot-latency-lane-$lane"
done
```

If Lane B commits Task 5 before Task 4 has landed, the
orchestrator ff-merges Task 2 and Task 3 first (reset /
cherry-pick those two SHAs) and holds Task 5 until after
Task 4. Never `-D`, never force-push.

**Serial fallback.** With no lanes, execute Tasks 1, 2,
3, 4, 5, 6, 7, 8, 9, 10, 11 in that order in the spec
worktree.

**Witness (orchestrator, not a lane).** Spec § Testing:
`./bin/measure --record` once before Task 1 and
`--record --write-budgets` after Task 11, one line each
in `measurements/history.jsonl`. Layer 1 is the gate;
measure is the witness. Skip the before-line if Chrome
or a running origin is unavailable; do not block Task 1
on it. After Task 11, record when Chrome is available
and commit the history line separately:
`Record page-boot-latency measure after`.

## Context an implementer must know

**Running tests.** `./test` is the whole memory suite.
One file:

```bash
export DENO_DIR="$TMPDIR/deno-dir"    # sandbox only
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check --sanitize-ops \
    --sanitize-resources --allow-env --allow-read \
    --allow-write --allow-net \
    --allow-run=deno,./bin/serve,./deploy,sh,./test,./bin/postgres-wipe,./bin/postgres-seed \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    tests/<file>.test.ts
```

Below, "Run one: tests/x.test.ts" means that command.
`./test check` is the type gate; `./test validate` is
the commit gate. `./test postgres` is Docker Postgres
and is required for Task 1's BEGIN pin and Task 2's
marker/document pins.

**The ledger vocabulary.** One table. A pair has `path`
(the collection, slash-bounded), `name` (the document's
name within it). `getCollectionPairs(path)` is every
pair at `path`; `getDocumentHistory(path, name)` is one
document. `deriveDocumentsAt(pairs, path)` folds to the
head per name, dropping DELETE heads.
`documentMessagePairsAt` is every PUT/DELETE pair.
`canonicalPath(organization, flatPrefix)` nests
registered families; the global plane passes `undefined`.

**Transaction bodies await only row ops.** Form pairs
pre-tx. Nested `view.transaction` / `readTransaction`
re-enter the open view (`ambientRunner`). A standalone
store method uses `backendRunner`.

**Auth grants.** `grantRefresh` (`api/authentication.ts`
~815), `grantTokenExchange` (~881), `issueTokenPair`
(~396), `grantClientCredentials` (~1020),
`grantAuthorizationCode` (~1243). `subjectOrganizations`
and `subjectRoles` each call `deriveMembershipsForIdentity`.
`tokenRevocationReason` (~459) reads revocations then
`deriveIdentityTokenEventsForJti`, which today scans the
tokens collection. `authorizationCodeSpent` (~1219) reads
the tokens document named by `sha256(code)`.
`formTokenEventMessagePair` (`api/message-pair.ts:361`)
takes `name` as the document name. `mintPair` already
accepts `scope.organization` and `scope.organizations`.
Token HTTP success is 201 (`api/api.ts` postToken arm).
Exchange 403 wording: `'subject is not a member of'
+ ' the organization'`.

**Boot.** Cookie session. `cookieRefreshAndInstall`
(`web-app/app/app-boot.ts:204`) POSTs refresh with no
organization. `scopeBootToActiveOrganization` (~111)
GETs organizations and default-organization in parallel,
then exchanges. `resolveOrganizationGate`
(`credential-resolution.ts:58`) is pure: empty reachable
bounces except on invitations. `initSidebarLayout`
already accepts `null`; `mutateSidebarMember` self-fetches
when `bootOrganizations === null`.
`postSessionRefresh` throws `UnauthorizedError` on 401
and `RequestError` on any other non-ok (including 403).
`ACTIVE_ORGANIZATION_ID` is the preference key.
`decodeAccessToken` / `principalFromToken` already
expose `organization` and `organizations`.

**Work orders.** GET list (`api/routes.ts:4696`) loops
`workOrderBindingFor` sequentially. `workOrderHistoryFor`
(`api/derive-states.ts:1187`) calls
`workOrderLifecycleStatesFor` then re-reads the
transition prefix. `workOrderClaimSourcesFor` (~980)
already reads that prefix.

**Client fan-out.** `getWorkOrderHistories` always GETs
`work-orders/` then each `/history`. Workbox
(`web-app/workbox/index.ts:190`) already has the rows.
`getFlowStats` fetches all histories then discards.
Record-detail `load()` (`web-app/records/detail.ts:171`)
calls `getFlowSummariesForRecord` and
`getWorkOrdersForRecord`, each of which GETs `flows/`
and each `flows/:id/records/`. Dashboard gauges
(`getDashboardGauges`) and
`getObjectiveScoringInputs` / `getPortfolioImpactSummary`
each GET `projects/`. Organization
`fetchObjectivesData` calls `getActiveObjectives`,
`getObjectives`, `getArchivedObjectiveIds`, and
`getObjectiveStates` — four GETs of `objectives/`.
`loadInto` already writes `fetch:<id>` / `render:<id>`
when the container has an id.

**Assets.** `bundle_client` (`bin/build-lib`) composes
first, then `deno bundle --format iife -o
dest/assets/app.js`. `isHashedAssetName` is
`/\.[0-9a-f]{8,}\.[a-z0-9]+$/i`. HTML references
`../assets/app.js` (classic script) in
`web-app/app/components-layout.html:60` and the three
standalone pages. `theme-init.js` stays classic.
`POOL_MAX` is 10 (`api/advisory-lock.ts`).

**Sandbox.** `export DENO_DIR="$TMPDIR/deno-dir"` before
any `deno` command under the Claude Code sandbox. Never
bake that into a script.

## Subagent prompt template

Use this verbatim as the opening of every dispatch, then
paste the task section.

```
Go to Medium Church!

You are executing Task <N> of
docs/superpowers/plans/2026-09-16-page-boot-latency.md
in the worktree <absolute path> on branch <branch>.
Read the plan's header, "Global Constraints", "Two
interpretations this plan fixes", "Context an
implementer must know", and Task <N> in full, then the
spec section Task <N> cites in
docs/superpowers/specs/2026-09-16-page-boot-latency-design.md.

Voice: 78-char max lines in .ts and scripts (./test lint;
.md exempt), 4-space indent, never the `org` abbreviation
in an identifier (spell `organization`), present-tense
imperative ~50-char commit subject, body = the Co-Authored-By
trailer AGENTS.md mandates.

Commandments this task touches: <from the task>.
Abominations this task risks: <from the task>.
Patterns: RequestContext as the first argument to adapter
methods; SafeHtml from presenters; snake_case storage /
camelCase domain; HTTP-verb adapter naming; validators at
the gate; no untyped `any` from external boundaries;
transaction bodies await only row ops; absence is
`undefined`/`null` at the call site; `dbOrView: DbAdapter`
is the first argument of every derive core.

Do not run ./deploy --render. Do not create a worktree or
pass `isolation`. Commit when the task's steps say to and
report: files changed, every test command you ran with its
result line, the commit SHA, and anything the plan got
wrong about the code you found.
```

---

### Task 1: Single-statement standalone reads

Lane A. Spec § 1. Commandments: I Reliability, X
Atomicity (a lone statement is its own snapshot), VIII
Simplicity. Abominations risked: Premature Optimization
(do not batch or cache; drop BEGIN), Shared Mutable
State (memory `read` snapshots the live array
reference), Internal Defense (identical SQL).

**Files:**
- Modify: `api/db.ts` (`StorageBackend`, `backendRunner`)
- Modify: `api/backend-memory.ts`
- Modify: `api/backend-postgres.ts`
- Modify: `api/postgres-client.ts` (optional `debug`)
- Create: `tests/backend-standalone-read.test.ts`
- Create: `tests/pg-standalone-read.test.ts`
- Modify: `bin/test-postgres` (add the new pg file)

**Consumes:** spec commit.

- [ ] **Step 1: Write the failing memory pin**

`tests/backend-standalone-read.test.ts`:

```typescript
import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { MemoryStorageBackend }
    from '../api/backend-memory.ts';
import { MissingTableError } from '../api/db.ts';

interface Row { id: string; n: number }

Deno.test(
    'read before ensureTable throws',
    async () => {
        const backend = new MemoryStorageBackend();
        await assertRejects(
            () => backend.read(
                tx => tx.getAll<Row>(),
            ),
            MissingTableError,
        );
    },
);

Deno.test(
    'read rejects a put',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTable();
        await assertRejects(
            () => backend.read(
                tx => tx.append<Row>(
                    { id: 'a', n: 1 },
                ),
            ),
            Error,
            'readonly',
        );
    },
);

Deno.test(
    'standalone read during an open write sees'
        + ' committed rows, not the buffer',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTable();
        await backend.transaction(
            'readwrite',
            tx => tx.append<Row>(
                { id: 'c', n: 1 },
            ),
        );
        const started = Promise.withResolvers<void>();
        const hold = Promise.withResolvers<void>();
        const write = backend.transaction(
            'readwrite',
            async (tx) => {
                await tx.append<Row>(
                    { id: 'u', n: 2 },
                );
                started.resolve();
                await hold.promise;
            },
        );
        await started.promise;
        const seen = await backend.read(
            tx => tx.getAll<Row>(),
        );
        assertEquals(
            seen.map(r => r.id).sort(),
            ['c'],
        );
        hold.resolve();
        await write;
        const after = await backend.read(
            tx => tx.getAll<Row>(),
        );
        assertEquals(
            after.map(r => r.id).sort(),
            ['c', 'u'],
        );
    },
);

Deno.test(
    'read handle has no lock methods',
    async () => {
        const backend = new MemoryStorageBackend();
        await backend.ensureTable();
        await backend.read(async (tx) => {
            assertStrictEquals(
                tx.lockRequest, undefined,
            );
            assertStrictEquals(
                tx.lockDocument, undefined,
            );
            assertStrictEquals(
                tx.lockHead, undefined,
            );
            assertStrictEquals(
                tx.notify, undefined,
            );
        });
    },
);
```

This fails: `StorageBackend` has no `read`.

- [ ] **Step 2: Run it to verify it fails**

Run one: `tests/backend-standalone-read.test.ts`.
Expected: FAIL, `read` is not a function / not on the
type.

- [ ] **Step 3: Add `read` to the seam**

`api/db.ts` — on `StorageBackend`, beside `transaction`:

```typescript
    read<R>(
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R>;
    transaction<R>(
        mode: TxMode,
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R>;
```

`backendRunner` routes readonly to `read`:

```typescript
export const backendRunner = (
    backend: StorageBackend,
): TxRunner =>
    (mode, fn) => mode === 'readonly'
        ? backend.read(fn)
        : backend.transaction(mode, fn);
```

`ambientRunner` unchanged. `readTransaction` on
`BackedDbAdapter` still calls `#backend.transaction(
'readonly', …)`.

- [ ] **Step 4: Memory `read`**

`api/backend-memory.ts`:

```typescript
    async read<R>(
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        if (this.#rows === undefined) {
            throw new MissingTableError(
                'message_pairs',
            );
        }
        const live = this.#rows;
        return fn(bufferTx(live, 'readonly'));
    }
```

Do not enter `#serialize`. Do not copy. `bufferTx` on
a readonly handle already copies each row out and
rejects `append`.

- [ ] **Step 5: Postgres `read` and optional debug**

`api/backend-postgres.ts` — `PostgresBackend.read`:

```typescript
    async read<R>(
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        try {
            return await fn(
                postgresTx(this.#sql, 'readonly'),
            );
        } catch (error) {
            throw mapPostgresError(error);
        }
    }
```

`postgresTx` for mode `'readonly'` already throws on
`append`. Omit `lockRequest`, `lockDocument`,
`lockHead`, and `notify` on that handle when `mode ===
'readonly'` (they are optional on `Tx`). Keep them on
the `'readwrite'` handle. `transaction()` still uses
`this.#sql.begin`.

`api/postgres-client.ts` — extend
`PostgresConnectOptions`:

```typescript
    readonly debug?: (
        connection: number,
        query: string,
        parameters: unknown[],
    ) => void;
```

Pass `debug: options.debug` into `postgres(url, {…})`
when provided. Existing callers pass nothing.

- [ ] **Step 6: Postgres BEGIN pin**

`tests/pg-standalone-read.test.ts` — same
`POSTGRES_URL` skip / private-schema pattern as
`tests/pg-acceptance.test.ts`. Connect with `debug`
pushing every `query` string. `ensureTable`, append
one pair inside `transaction('readwrite')`, clear the
log, then:

```typescript
const adapter = new BackedDbAdapter(
    backend, async () => {}, async () => {},
    () => {},
);
await adapter.messagePairs.getCollectionPairs(
    '/x/',
);
assert(
    !queries.some(q => /^\s*BEGIN\b/i.test(q)),
    'standalone read must not BEGIN',
);
assert(
    queries.some(q => /message_pairs/i.test(q)),
    'standalone read must SELECT',
);
```

Add `tests/pg-standalone-read.test.ts` to the
`DENO_PG_TEST` list in `bin/test-postgres`.
`tests/pg-explain.test.ts` is unchanged.

- [ ] **Step 7: Run memory green, check, postgres**

Run one: `tests/backend-standalone-read.test.ts`.
Expected: PASS.
`./test check` and `./test validate`.
`./test postgres` (BEGIN pin).

- [ ] **Step 8: Commit**

```bash
git add api/db.ts api/backend-memory.ts \
    api/backend-postgres.ts api/postgres-client.ts \
    tests/backend-standalone-read.test.ts \
    tests/pg-standalone-read.test.ts \
    bin/test-postgres
git commit -m "Read standalone rows in one statement"
```

---

### Task 2: Token document reads and the marker prefix

Lane B. Spec § 2 (Marker prefix, Happy path, Replay
branch). Commandments: II Security (fail-closed fold
unchanged), I Reliability. Abominations risked: Test
Weakening (drift bytes that named the split leave with
the split; revocation verdicts stay as strong), Foreign
Tongues (path is `authorization-codes`, not a SQL
table).

**Files:**
- Modify: `api/message-pair.ts` (`formTokenEventMessagePair`
  comment; add `formAuthorizationCodeMarkerPair`)
- Modify: `api/authentication.ts` (`authorizationCodeSpent`,
  `grantAuthorizationCode`, `tokenRevocationReason`,
  `planRotationAttempt` / in-tx re-plan, prefixes)
- Modify: `api/derive-identity-tokens.ts` (header comment;
  `deriveIdentityTokenEventsForJti` becomes a document
  read)
- Modify: `tests/drift-identity-tokens.test.ts` (no two
  heads for one jti; spent reads the marker prefix)
- Modify: `tests/api-authentication-token.test.ts` (spent
  marker; issued name is jti)
- Modify: `tests/api-identity-token-rotation.test.ts` if
  a collection-scan assumption breaks
- Modify: `tests/api-token-exchange-revocation.test.ts`
  (verdicts unchanged)

**Consumes:** spec commit. Independent of Task 1.

- [ ] **Step 1: Write the failing spent-prefix pin**

In `tests/api-authentication-token.test.ts`, after the
GATE 3 grant of `'the-code-spent'` (that test already
calls `authorizationCodeSpent` at line 500):

```typescript
Deno.test(
    'authorization-code issued event is named by jti',
    async () => {
        const db = await freshDb();
        await seedRootAdmin(db);
        await seedAuthorizationCodeMessagePair(
            db, 'the-code-spent',
            'XXZruirZyAOoRpNxaDnpSA', 'web',
        );
        const first = await handleRequest(
            db, tokenRequest({
                grant_type: 'authorization_code',
                code: 'the-code-spent',
                client_id: 'web',
            }),
        );
        assertStrictEquals(first.status, 201);
        const identityId = 'XXZruirZyAOoRpNxaDnpSA';
        const derivedId =
            await deriveAuthorizationCodeId(
                'the-code-spent',
            );
        const prefix = '/identities/'
            + identityId + '/tokens/';
        const markerPrefix = '/identities/'
            + identityId + '/authorization-codes/';
        const marker = await db.messagePairs
            .getDocumentHistory(
                markerPrefix, derivedId,
            );
        assert(marker.length > 0, 'marker document');
        assertStrictEquals(
            await authorizationCodeSpent(
                db, derivedId, identityId,
            ),
            true,
        );
        const issued = (await deriveIdentityTokensFor(
            db, identityId,
        )).filter(r => r.action === 'issued');
        assertEquals(
            new Set(issued.map(r => r.jti)).size,
            issued.length,
            'one head per jti',
        );
        const old = await db.messagePairs
            .getDocumentHistory(prefix, derivedId);
        assertEquals(old.length, 0);
    },
);
```

Expected: FAIL, marker prefix empty, issued still at
the hash name.

- [ ] **Step 2: Run it to verify it fails**

Run one: the file you added the test to. Expected:
FAIL as above.

- [ ] **Step 3: Marker former**

`api/message-pair.ts` — beside `formTokenEventMessagePair`.
Route pattern `identities/:id/authorization-codes/:hash`.
Body `{ jti }`. Response `{ jti, id: hash }`. Global
plane (`organization: undefined`). Formed pre-tx.
Update the `formTokenEventMessagePair` comment: `name`
is always the jti; the spend marker is a different
prefix.

- [ ] **Step 4: Spend check and grant write**

`api/authentication.ts`:

```typescript
function authorizationCodesPrefixFor(
    identityId: Id,
): string {
    return canonicalPath(
        undefined,
        '/identities/' + identityId
            + '/authorization-codes/',
    );
}

export async function authorizationCodeSpent(
    dbOrView: DbAdapter,
    derivedId: Id,
    identityId: Id,
): Promise<boolean> {
    const spent = await dbOrView.messagePairs
        .getDocumentHistory(
            authorizationCodesPrefixFor(identityId),
            derivedId,
        );
    return spent.length > 0;
}
```

`grantAuthorizationCode`: `formTokenEventMessagePair(
refreshJti, { jti: refreshJti, … action: 'issued' … })`
— not `rootId`. Form the marker with
`formAuthorizationCodeMarkerPair(derivedId, refreshJti,
issuer.identityId, at, operationId)`. One transaction
still appends marker, event, and auth pair, marker
first so a crash after the marker still fails a replay
closed. Delete KEY-BY-ANCHOR comments that say the
issued document's name is the hash.

- [ ] **Step 5: Document reads on the happy path**

`api/derive-identity-tokens.ts` — delete the header
block that explains the split. Rewrite
`deriveIdentityTokenEventsForJti`:

```typescript
export async function deriveIdentityTokenEventsForJti(
    dbOrView: DbAdapter,
    jti: string,
    identityId: Id,
): Promise<IdentityTokenEntity[]> {
    const prefix = tokensPrefixFor(identityId);
    const pairs = await dbOrView.messagePairs
        .getDocumentHistory(prefix, jti);
    return documentMessagePairsAt(pairs, prefix)
        .filter(d => d.method === 'PUT')
        .map(d => nestedTokenEntityOf(identityId, {
            name: d.name,
            messagePairId: d.id,
            method: d.method,
            body: d.body,
        }));
}
```

Export `nestedTokenEntityOf` if the mapper needs it, or
keep it file-private and inline. `isTokenRevoked` folds
those events (fail-closed rank unchanged).
`tokenRevocationReason` stays: revocations collection,
then this function.

`planRotationAttempt` and the in-tx re-plan:

```typescript
const events = await deriveIdentityTokenEventsForJti(
    adapter, presentedJti, identityId,
);
const latest = latestActionForJti(
    events, presentedJti,
);
const rows = latest === 'issued' || latest === null
    ? events
    : await readTokenChainFromLedger(
        adapter, identityId, presentedJti,
    ).then(r => r.rows);
const plan = planRotation(
    rows, presentedJti, newJti, nowUtc(),
);
```

`revokeTokenChain` / `planRevocationAttempt` keep
`readTokenChainFromLedger` (collection). The pre-tx /
in-tx double read stays. Same `TokenPlanDivergedError`
jti-set equality.

- [ ] **Step 6: Drift and rotation pins**

Update `tests/drift-identity-tokens.test.ts` comments
and any assertion that two heads share one jti. Keep
pre-tx / in-tx parity for `authorizationCodeSpent` and
`deriveIdentityTokenEventsForJti`. Rotation and
exchange-revocation tests keep their verdicts
(`tests/api-identity-token-rotation.test.ts`,
`tests/api-token-exchange-revocation.test.ts`).

- [ ] **Step 7: Run green**

Run one: `tests/drift-identity-tokens.test.ts`,
`tests/api-authentication-token.test.ts`,
`tests/api-identity-token-rotation.test.ts`,
`tests/api-token-exchange-revocation.test.ts`,
`tests/api-shadow-ledger-tokens.test.ts`.
`./test validate`. `./test postgres` if a pg test
touches tokens.

- [ ] **Step 8: Commit**

```bash
git add api/message-pair.ts api/authentication.ts \
    api/derive-identity-tokens.ts \
    tests/drift-identity-tokens.test.ts \
    tests/api-authentication-token.test.ts \
    tests/api-identity-token-rotation.test.ts \
    tests/api-token-exchange-revocation.test.ts
git commit -m "Read one token document per jti"
```

---

### Task 3: One membership derivation; subject equals actor first

Lane B. Spec § 2 (One membership derivation) and
Decision 4. Commandments: VIII Simplicity, II Security
(403 wording and grant-first). Abominations risked:
Asking not Telling (thread rows; do not re-derive),
Test Weakening (`tests/drift-memberships-identity.test.ts`
bytes stay).

**Files:**
- Modify: `api/derive-memberships.ts`
- Modify: `api/authentication.ts` (`subjectClaims`,
  grants, `grantTokenExchange` order, `issueTokenPair`)
- Modify: `api/organization-requests.ts`
  (`getIdentityOrganizations`)
- Modify: `tests/api-authentication-token.test.ts`
  (cross-party 403 before revocation)
- Modify: `tests/api-token-exchange-revocation.test.ts`
  (logged-out actor with a different subject is 403
  self-delegation — the spec rewrote this covenant;
  same-token logged-out subject stays 401)
- Modify: `tests/drift-memberships-identity.test.ts`
  only if order or bytes move — they must not

**Consumes:** Task 2 (same `authentication.ts` regions).

- [ ] **Step 1: Rewrite the logged-out-actor covenant**

`tests/api-token-exchange-revocation.test.ts`
`'token-exchange rejects a logged-out actor token'`
(lines 146–165) uses `USER_2` as subject and revoked
`USER_1` as actor. Today that 401s `token revoked`.
After Decision 4 it 403s self-delegation before any
revocation check. Change the assertion to
`res.status === 403` and `res.error` matching
`/self-delegation/`. Keep `'token-exchange rejects a
logged-out subject token'` (same string, same `sub`)
at 401 `token revoked`.

Expected: FAIL on the actor test until Step 5 lands.

- [ ] **Step 2: Run it to verify it fails**

Run one: `tests/api-authentication-token.test.ts` on
that test. Expected: FAIL, 401 not 403.

- [ ] **Step 3: Concurrent seats in one read transaction**

`api/derive-memberships.ts` —
`deriveMembershipsForIdentity`:

```typescript
export async function deriveMembershipsForIdentity(
    db: DbAdapter,
    identityId: Id,
    organizations?: readonly OrganizationEntity[],
): Promise<MembershipEntity[]> {
    const run = async (
        view: DbAdapter,
        orgs: readonly OrganizationEntity[],
    ): Promise<MembershipEntity[]> => {
        const perOrg = await Promise.all(
            orgs.map(async (organization) => {
                const seatPrefix = seatsPrefixFor(
                    organization.id,
                );
                const seatMessagePairs =
                    await view.messagePairs
                        .getCollectionPairs(
                            seatPrefix,
                        );
                const seat = deriveDocumentsAt(
                    seatMessagePairs, seatPrefix,
                ).get(identityId);
                return seat === undefined
                    ? null
                    : seatEntityOf(
                        seat, organization.id,
                    );
            }),
        );
        const rows: MembershipEntity[] = [];
        for (const row of perOrg) {
            if (row !== null) rows.push(row);
        }
        return rows.sort(byAtThenIdAscending);
    };
    if (organizations !== undefined) {
        return run(db, organizations);
    }
    return db.readTransaction(async (view) => {
        const orgs = await deriveOrganizations(view);
        return run(view, orgs);
    });
}
```

Import `OrganizationEntity` and `deriveOrganizations`
(already imported). Nested `readTransaction` joins.
Do not `?? []` a missing organizations argument — the
optional parameter is the "already fetched" hand-off.

- [ ] **Step 4: `subjectClaims` and grant call sites**

`api/authentication.ts`:

```typescript
export async function subjectClaims(
    adapter: DbAdapter,
    identityId: Id,
): Promise<{
    readonly organizations: Id[];
    readonly roles: string[];
}> {
    const rows = await deriveMembershipsForIdentity(
        adapter, identityId,
    );
    return {
        organizations: rows.map(
            m => m.organization_id,
        ),
        roles: rows.map(
            m => composeClaimRole(
                m.type, m.organization_id,
            ),
        ),
    };
}
```

Keep `subjectOrganizations` / `subjectRoles` as thin
wrappers over `subjectClaims` if exported tests call
them, or switch those tests to `subjectClaims`.
`grantRefresh`, `issueTokenPair`,
`grantClientCredentials`, `grantAuthorizationCode`
call `subjectClaims` once. `issueTokenPair` accepts
optional pre-derived `{ organizations, roles }` and
does not derive again when passed.

`getIdentityOrganizations`:

```typescript
    return db.readTransaction(async (view) => {
        const organizations =
            await deriveOrganizations(view);
        const memberships =
            await deriveMembershipsForIdentity(
                view, identityId, organizations,
            );
        const mine = new Set(
            memberships.map(m => m.organization_id),
        );
        return organizations.filter(
            o => mine.has(o.id),
        );
    });
```

- [ ] **Step 5: Exchange order (interpretation B)**

`grantTokenExchange`:

```typescript
    const subjectToken = /* as today */;
    const actorToken = /* as today */;
    const now = nowEpochSeconds();
    const sameToken = subjectToken === actorToken;
    const subjectV = await verifyAccessToken(
        subjectToken, now,
    );
    const actorV = sameToken
        ? subjectV
        : await verifyAccessToken(actorToken, now);
    if (!subjectV.valid || !actorV.valid) {
        return failure(
            HTTP_UNAUTHORIZED,
            'token-exchange needs valid'
                + ' subject/actor tokens',
        );
    }
    const subject = subjectV.claims.sub;
    const actor = actorV.claims.sub;
    if (subject !== actor) {
        return failure(
            HTTP_FORBIDDEN,
            'token-exchange is limited to'
                + ' self-delegation'
                + ' (subject must equal actor)',
        );
    }
    const subjectRev = await tokenRevocationReason(
        adapter, subjectV.claims.sub,
        subjectV.claims.iat, subjectV.claims.jti,
    );
    if (subjectRev !== null) {
        return failure(HTTP_UNAUTHORIZED, subjectRev);
    }
    if (!sameToken) {
        const actorRev = await tokenRevocationReason(
            adapter, actorV.claims.sub,
            actorV.claims.iat, actorV.claims.jti,
        );
        if (actorRev !== null) {
            return failure(
                HTTP_UNAUTHORIZED, actorRev,
            );
        }
    }
    const claims = await subjectClaims(
        adapter, subject,
    );
    // organization membership uses claims.organizations
    // issueTokenPair receives claims, does not derive
```

- [ ] **Step 6: Run green**

Run one: `tests/api-authentication-token.test.ts`,
`tests/drift-memberships-identity.test.ts`,
`tests/api-token-exchange-revocation.test.ts`,
`tests/drift-organizations.test.ts`.
`./test validate`.

- [ ] **Step 7: Commit**

```bash
git add api/derive-memberships.ts \
    api/authentication.ts \
    api/organization-requests.ts \
    tests/api-authentication-token.test.ts
git commit -m "Derive memberships once per grant"
```

---

### Task 4: Work-order bindings concurrent; one transition read

Lane C. Spec § 3. Commandments: I Reliability (same
rows, same `atIdCompare`), XII Performance only as
consequence. Abominations risked: Premature
Generalization (no subtree read), Test Weakening
(`tests/api-work-order-history.test.ts` events stay).

**Files:**
- Modify: `api/routes.ts` (GET `work-orders/` attach)
- Modify: `api/derive-states.ts` (`WorkOrderClaimSources`,
  `workOrderClaimSourcesFor`, `workOrderHistoryFor`)
- Modify: `tests/api-work-order-history.test.ts` (unchanged
  assertions; add a pin that history equals today's
  fixture)
- Modify: `tests/drift-work-orders.test.ts` if the
  binding attach is compared there

**Consumes:** spec commit. Independent of Tasks 1–3.

- [ ] **Step 1: Write the failing history-shape pin**

If `tests/api-work-order-history.test.ts` already pins
events byte-for-byte, add one assertion that two
consecutive `workOrderHistoryFor` calls on the same db
return `assertEquals` identical arrays (concurrency
must not reorder). Expected: still PASS today; keep it
as the covenant the implementation must not weaken.

- [ ] **Step 2: Concurrent bindings**

`api/routes.ts` GET list — replace the `for` loop:

```typescript
            const binds = await Promise.all(
                rows.map(row => workOrderBindingFor(
                    db, org, row.id,
                )),
            );
            const out: unknown[] = [];
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i]!;
                const bind = binds[i]!;
                out.push({
                    ...row,
                    ...(bind === null
                        ? {}
                        : {
                            instance_id:
                                bind.instanceId,
                            record_type_id:
                                bind.recordTypeId,
                        }),
                });
            }
            return out;
```

Same per-row pick inside `workOrderBindingFor`. Absent
stays absent (keys omitted). Pool bounds concurrency
(`POOL_MAX` 10); do not add a semaphore.

- [ ] **Step 3: Claim sources return transitions; four reads concurrent**

`api/derive-states.ts`:

```typescript
interface WorkOrderClaimSources {
    readonly replayed: readonly StateEntity[];
    readonly transitionMessagePairs:
        readonly OperationMessagePair[];
}

async function workOrderClaimSourcesFor(
    dbOrView: DbAdapter,
    organization: Id,
    workOrderId: Id,
): Promise<WorkOrderClaimSources> {
    const collectionPrefix = canonicalPath(
        organization, '/work-orders/',
    );
    const claimPrefix = canonicalPath(
        organization,
        '/work-orders/' + workOrderId + '/claim/',
    );
    const releasePrefix = canonicalPath(
        organization,
        '/work-orders/' + workOrderId
            + '/release/',
    );
    const transitionPrefix = canonicalPath(
        organization,
        '/work-orders/' + workOrderId
            + '/transition/',
    );
    const [
        collectionMessagePairs,
        claimStored,
        releaseStored,
        transitionStored,
    ] = await Promise.all([
        dbOrView.messagePairs.getDocumentHistory(
            collectionPrefix, workOrderId,
        ),
        dbOrView.messagePairs.getCollectionPairs(
            claimPrefix,
        ),
        dbOrView.messagePairs.getCollectionPairs(
            releasePrefix,
        ),
        dbOrView.messagePairs.getCollectionPairs(
            transitionPrefix,
        ),
    ]);
    // decode once; same operationMessagePairsAt /
    // documentMessagePairsAt / replayWorkOrderOperations
    // as today
    const transitionMessagePairs =
        operationMessagePairsAt(
            transitionStored, transitionPrefix,
        );
    return {
        replayed: replayWorkOrderOperations(
            /* same five lists as today */,
            workOrderId,
        ),
        transitionMessagePairs,
    };
}

export async function workOrderHistoryFor(
    db: DbAdapter,
    organization: Id,
    workOrderId: Id,
): Promise<WorkOrderHistoryEventEntity[]> {
    const { replayed, transitionMessagePairs } =
        await workOrderClaimSourcesFor(
            db, organization, workOrderId,
        );
    const lifecycle = [...replayed].sort(atIdCompare);
    if (lifecycle.length === 0) {
        throw await missedReadError(
            db, workOrderId, organization,
            'work_orders',
        );
    }
    return historyEventsWithFieldValues(
        lifecycle, transitionMessagePairs,
    );
}
```

`workOrderLifecycleStatesFor` and
`workOrderClaimHistoryFor` keep using `replayed` only.
Document history is decoded once for create + entity
filters. Do not re-read the transition prefix in
`workOrderHistoryFor`.

- [ ] **Step 4: Run green**

Run one: `tests/api-work-order-history.test.ts`,
`tests/api-work-order-history-shapes.test.ts`,
`tests/derive-work-order-lifecycle-for.test.ts`,
`tests/drift-work-orders.test.ts`,
`tests/api-work-order-transition.test.ts`.
`./test validate`.

- [ ] **Step 5: Commit**

```bash
git add api/routes.ts api/derive-states.ts \
    tests/api-work-order-history.test.ts
git commit -m "Read work-order bindings together"
```

---

### Task 5: One-hop boot

Lane B. Spec § 4. Commandments: I Reliability (stale
choice never bounces to login), II Security (server
membership fence is the exchange's check). Abominations
risked: Default Values (absent `organization` is
today's flat token, not a server-side default),
Unbidden Helper Code (no new route).

**Files:**
- Modify: `api/authentication.ts` (`grantRefresh`)
- Modify: `tests/api-authentication-token.test.ts`
  (three grant outcomes)
- Modify: `web-app/app/adapters/session-refresh.ts`
- Modify: `web-app/app/adapters/preferences.ts`
  (`deletePreference`)
- Modify: `web-app/app/credential-resolution.ts`
  (pure three-way branch)
- Modify: `tests/boot-organization-gate.test.ts`
- Modify: `web-app/app/app-boot.ts`
  (`cookieRefreshAndInstall`, `bootOrganizationGate`,
  `scopeBootIfCredentialed`, drop the two GETs on the
  happy branches)
- Modify: `tests/api-flat-token-organization.test.ts`
  (flat bytes unchanged when body omits organization)

**Consumes:** Task 3 (`subjectClaims`).

- [ ] **Step 1: Write the failing grant pins**

In `tests/api-authentication-token.test.ts`, three
tests on a seeded member with a live refresh cookie /
body token:

1. `body.organization` is a live seat → 201, access
   token `organization` claim equals it,
   `organizations` claim unchanged.
2. `body.organization` is not a seat → 403, error
   matches `/not a member/`, token event count
   unchanged (nothing minted, presented refresh still
   live).
3. body omits `organization` → 201, no `organization`
   claim (byte-stable with
   `tests/api-flat-token-organization.test.ts`).

Expected: FAIL, extra field ignored, no 403.

- [ ] **Step 2: Run it to verify it fails**

Run one: `tests/api-authentication-token.test.ts`.
Expected: FAIL.

- [ ] **Step 3: `grantRefresh` reads `body.organization`**

After verify + `tokenRevocationReason`, before
`generateIdentifier` / `mintPair` / `rotateRefreshJti`:

```typescript
    const claims = await subjectClaims(
        adapter, verified.claims.sub,
    );
    const organization =
        typeof body.organization === 'string'
            ? body.organization
            : '';
    if (organization !== '') {
        if (!claims.organizations.includes(
            organization,
        )) {
            return failure(
                HTTP_FORBIDDEN,
                'subject is not a member of'
                    + ' the organization',
            );
        }
    }
    const minted = await mintPair(
        verified.claims.sub, name, newJti,
        undefined, {
            organizations: claims.organizations,
            roles: claims.roles,
            ...(organization !== ''
                ? { organization }
                : {}),
        },
    );
```

`refreshSetCookie` and the auth pair unchanged. Throttle
exemption for `refresh` unchanged. Do not resolve a
default organization on the server.

- [ ] **Step 4: Pure three-way branch**

`web-app/app/credential-resolution.ts`:

```typescript
export type BootOrganizationBranch =
    | { readonly kind: 'scoped'; readonly id: string }
    | {
        readonly kind: 'exchange';
        readonly id: string;
    }
    | { readonly kind: 'walk' };

export function resolveBootOrganizationBranch(
    tokenOrganization: string | undefined,
    tokenOrganizations: readonly string[] | undefined,
    persisted: string | null,
): BootOrganizationBranch {
    const reachable = tokenOrganizations ?? [];
    if (
        tokenOrganization !== undefined
        && reachable.includes(tokenOrganization)
    ) {
        return {
            kind: 'scoped',
            id: tokenOrganization,
        };
    }
    if (
        persisted !== null
        && reachable.includes(persisted)
    ) {
        return { kind: 'exchange', id: persisted };
    }
    return { kind: 'walk' };
}
```

`tests/boot-organization-gate.test.ts` — two new tests:
scoped when the token already carries a reachable
organization; exchange when flat `organizations`
contains the persisted id; walk otherwise (including
empty reachable, including persisted foreign id).
Keep the invitations empty-list test.

- [ ] **Step 5: Client refresh and boot**

`deletePreference` in
`web-app/app/adapters/preferences.ts`:

```typescript
function deletePreference(key: string): void {
    localStorage.removeItem(key);
}
```

Export it. No try/catch around `removeItem`.

`postSessionRefresh` accepts optional `organization`
and sets `body.organization` only when the string is
present (do not send `organization: null`).

`cookieRefreshAndInstall`:

```typescript
        const persisted = getPreference(
            ACTIVE_ORGANIZATION_ID,
        );
        try {
            const creds = await postSessionRefresh(
                ctx, '', persisted ?? undefined,
            );
            putSessionToken(creds.accessToken);
            return creds.accessToken;
        } catch (err) {
            if (err instanceof RequestError
                && err.status === HTTP_FORBIDDEN
                && persisted !== null) {
                deletePreference(
                    ACTIVE_ORGANIZATION_ID,
                );
                const creds =
                    await postSessionRefresh(
                        ctx, '',
                    );
                putSessionToken(creds.accessToken);
                return creds.accessToken;
            }
            if (err instanceof UnauthorizedError) {
                return null;
            }
            throw err;
        }
```

One retry without `organization`. A second 403
propagates. 401 still fails closed. The facade's 401
recovery refresh is unchanged (no organization on that
path).

`bootOrganizationGate` / `scopeBootIfCredentialed`
after a live token:

```typescript
    const principal = principalFromToken(
        getSessionToken(),
    );
    const branch = resolveBootOrganizationBranch(
        principal.organization,
        principal.organizations,
        getPreference(ACTIVE_ORGANIZATION_ID),
    );
    if (branch.kind === 'scoped') {
        putPreference(
            ACTIVE_ORGANIZATION_ID, branch.id,
        );
        return []; // sidebar self-fetches
    }
    if (branch.kind === 'exchange') {
        const ctx = sessionContext();
        putSessionToken(
            await postOrganizationSessionExchange(
                ctx, getSessionToken(), branch.id,
            ),
        );
        putPreference(
            ACTIVE_ORGANIZATION_ID, branch.id,
        );
        return [];
    }
    // walk: today's GET pair + resolveActiveOrganization
    // + exchange. Empty reachable → []
```

`bootOrganizationGate` then
`resolveOrganizationGate(reachableFromClaimOrWalk,
getPageName())`. On the scoped/exchange branches the
reachable set is `principal.organizations` (claim), not
fetched rows — a zero-membership identity still bounces
to invitations. `initSidebarLayout(null)` on those
branches so `mutateSidebarMember` self-fetches in
parallel with page init. Walk branch still passes the
fetched rows when it has them.

Extract `principalFromToken` use; do not duplicate
claim parsing.

- [ ] **Step 6: Run green**

Run one: `tests/api-authentication-token.test.ts`,
`tests/api-flat-token-organization.test.ts`,
`tests/boot-organization-gate.test.ts`,
`tests/adapters-session-refresh.test.ts` if present,
`tests/adapters-shared-recovery.test.ts`.
`./test validate`. `./test browser` is the existing WB
and boot pins — run when Chrome is available; do not
weaken them.

- [ ] **Step 7: Commit**

```bash
git add api/authentication.ts \
    tests/api-authentication-token.test.ts \
    web-app/app/adapters/session-refresh.ts \
    web-app/app/adapters/preferences.ts \
    web-app/app/credential-resolution.ts \
    tests/boot-organization-gate.test.ts \
    web-app/app/app-boot.ts
git commit -m "Scope refresh to the persisted organization"
```

---

### Task 6: Workbox histories take rows already fetched

Lane D. Spec § 5 Workbox. Commandments: IX Generality
at the third caller (signature change now; Tasks 6–7
are two of five). Abominations risked: Unbidden Helper
Code (no new adapter).

**Files:**
- Modify: `web-app/app/adapters/work-orders-queries.ts`
- Modify: `web-app/workbox/index.ts`
- Create: `tests/adapters-work-order-histories.test.ts`

**Consumes:** spec commit.

- [ ] **Step 1: Write the failing call-count pin**

A fake `ctx` whose `GET` records the path and returns
`[{ id: 'w1' }]` for `work-orders/` and `[]` for
history:

```typescript
Deno.test(
    'getWorkOrderHistories does not GET work-orders/',
    async () => {
        const paths: string[] = [];
        const ctx = {
            GET: async (path: string) => {
                paths.push(path);
                return [];
            },
        } as unknown as RequestContext;
        await getWorkOrderHistories(
            ctx, [{ id: 'w1' }],
        );
        assertEquals(
            paths.some(p =>
                p.endsWith('/work-orders/')
                && !p.includes('/history'),
            ),
            false,
        );
        assert(
            paths.some(p => p.endsWith('/history')),
        );
    },
);
```

Expected: FAIL, function arity / extra GET.

- [ ] **Step 2: Required `orders` parameter**

```typescript
export async function getWorkOrderHistories(
    ctx: RequestContext,
    orders: readonly { readonly id: Id }[],
): Promise<Map<Id, WorkOrderHistoryEventEntity[]>> {
    const pairs = await Promise.all(
        orders.map(async (row) => {
            const history = await ctx.GET<
                WorkOrderHistoryEventEntity[]
            >(
                organizationItem(
                    ctx, 'work-orders', row.id,
                ) + '/history',
            );
            return [row.id, history] as const;
        }),
    );
    return new Map(pairs);
}
```

No default that GETs the collection. Update
`getActiveClaimsByWorkOrder` and
`getTransitionEventsByWorkOrder` only if they no
longer type-check — they must pass orders they
already have or GET `work-orders/` once themselves.
Do not expand the spec's five named dedupes.

Workbox `fetchInboxRows`:

```typescript
        getWorkOrders(ctx),
        getMemberMap(ctx),
    ]);
    const histories = await getWorkOrderHistories(
        ctx, workOrders,
    );
```

Do not `Promise.all` histories with `getWorkOrders`
anymore — histories consume those rows. Member map
may stay parallel with `getWorkOrders`.

- [ ] **Step 3: Run green and commit**

Run one: the new test; any workbox adapter test.
`./test validate`.

```bash
git add web-app/app/adapters/work-orders-queries.ts \
    web-app/workbox/index.ts \
    tests/adapters-work-order-histories.test.ts
git commit -m "Pass work orders into history fetches"
```

---

### Task 7: Flow-stats histories follow the joins

Lane D. Spec § 5 Flow-stats. Commandments: I
Reliability (same `transitions` after today's filter).
Abominations risked: Unbidden Helper Code.

**Files:**
- Modify: `web-app/app/adapters/flow-stats.ts`
- Modify: `tests/adapters-work-order-histories.test.ts`
  (or `tests/adapters-flow-stats.test.ts` if it exists)

**Consumes:** Task 6 (required `orders` argument).

- [ ] **Step 1: Failing pin**

Fake GET: `getFlowStats` must not request
`work-orders/` collection; it may request
`flows/:id/work-orders/` and then only those
histories.

- [ ] **Step 2: Joins first, then those histories**

```typescript
    const [
        graph,
        fwoRows,
        memberMap,
    ] = await Promise.all([
        getFlowGraph(ctx, flowId),
        getFlowWorkOrderEntities(ctx, flowId),
        getMemberMap(ctx),
    ]);
    const histories = await getWorkOrderHistories(
        ctx,
        fwoRows.map(r => ({ id: r.work_order_id })),
    );
    const woIds = new Set(
        fwoRows.map(r => r.work_order_id),
    );
    // same projectTransitions loop; the woIds filter
    // is now a no-op keep-guard, leave it
```

Same `transitions` after the filter. Same member map.

- [ ] **Step 3: Run green and commit**

```bash
git add web-app/app/adapters/flow-stats.ts \
    tests/adapters-flow-stats.test.ts
git commit -m "Fetch flow-stats histories after joins"
```

---

### Task 8: Record-detail fetches `flows/` once

Lane D. Spec § 5 Record-detail. 20 requests to 12.

**Files:**
- Modify: `web-app/app/adapters/flow-records.ts`
- Modify: `web-app/records/detail.ts`
- Create: `tests/adapters-flow-records-dedupe.test.ts`

**Consumes:** spec commit.

- [ ] **Step 1: Failing pin**

`load()`-equivalent: one fake GET log. `flows/`
appears once; each `flows/:id/records/` once.

- [ ] **Step 2: Optional already-fetched rows**

```typescript
async function getAllFlowRecordEntities(
    ctx: RequestContext,
    flows?: readonly { readonly id: Id }[],
): Promise<FlowRecordEntity[]> {
    const list = flows ?? await getFlowEntities(ctx);
    const perFlow = await Promise.all(
        list.map(f => getFlowRecordsForFlow(
            ctx, f.id,
        )),
    );
    return perFlow.flat();
}

async function getAllFlowWorkOrderEntities(
    ctx: RequestContext,
    flows?: readonly { readonly id: Id }[],
): Promise<FlowWorkOrderEntity[]> {
    const list = flows ?? await getFlowEntities(ctx);
    const perFlow = await Promise.all(
        list.map(f => ctx.GET<FlowWorkOrderEntity[]>(
            organizationItem(ctx, 'flows', f.id)
                + '/work-orders/',
        )),
    );
    return perFlow.flat();
}
```

`getFlowSummariesForRecord` and
`getWorkOrdersForRecord` gain optional `flows` and
optional `flowRecords`. `load()`:

```typescript
            const flows = await getFlowEntities(ctx);
            const flowRecords =
                await getAllFlowRecordEntities(
                    ctx, flows,
                );
            const [
                record,
                attributes,
                summaries,
                workOrders,
                instances,
            ] = await Promise.all([
                getRecordModel(ctx, id),
                getRecordAttributesByRecord(ctx, id),
                getFlowSummariesForRecord(
                    ctx, id, flows, flowRecords,
                ),
                getWorkOrdersForRecord(
                    ctx, id, flows, flowRecords,
                ),
                getRecordInstances(ctx, id),
            ]);
```

Export `getAllFlowRecordEntities` only if the page
calls it; otherwise keep it file-private and add a
page-level helper in `flow-records.ts`:
`loadRecordFlowBindings(ctx)` that returns
`{ flows, flowRecords }` so `load()` does not
re-implement. Presenters stay pure over the same rows
— byte-identical HTML.

- [ ] **Step 3: Run green and commit**

```bash
git add web-app/app/adapters/flow-records.ts \
    web-app/records/detail.ts \
    tests/adapters-flow-records-dedupe.test.ts
git commit -m "Share one flows list on record detail"
```

---

### Task 9: Dashboard shares one scoring input

Lane D. Spec § 5 Dashboard.

**Files:**
- Modify: `web-app/app/adapters/project-scoring.ts`
- Modify: `web-app/app/adapters/dashboard.ts`
- Modify: `web-app/dashboard/index.ts`
- Modify: `web-app/app/page-performance.ts` only if a
  name is missing — prefer `fetchMeasureName` /
  `renderMeasureName` already there

**Consumes:** spec commit.

- [ ] **Step 1: Failing pin**

Fake GET: `init()` of dashboard requests `projects/`
once and `objectives/` once during the joined gauges
+ aggregates fetch.

- [ ] **Step 2: One bundle**

```typescript
export async function getDashboardScoringBundle(
    ctx: RequestContext,
): Promise<{
    readonly projects: ProjectEntity[];
    readonly objectives: ObjectiveEntity[];
    readonly baselineScores: ObjectiveScore[];
    readonly actualScores: ObjectiveScore[];
}> {
    const [
        projects,
        objectives,
        baselineScores,
        actualScores,
    ] = await Promise.all([
        getProjectEntities(ctx),
        getObjectives(ctx),
        getAllBaselineScores(ctx),
        getAllActualScores(ctx),
    ]);
    return {
        projects, objectives,
        baselineScores, actualScores,
    };
}
```

`getDashboardGauges(ctx, bundle)` and
`getObjectiveScoringInputs` / `getPortfolioImpactSummary`
accept the bundle (or a required argument, not a
default fetch). `activeObjectives` is
`bundle.objectives.filter(o => o.state === 'active')`
sorted as `getActiveObjectives` does today — at the
call site or a named pure helper in `objectives.ts`,
not a second GET.

`dashboard/index.ts` `init`: fetch the bundle once,
pass it to gauges and aggregates. Around
`#objective-aggregates-card`, if not using `loadInto`,
`markStart(fetchMeasureName('objective-aggregates-card'))`
/ `markEnd` around the bundle-consuming work that
fills that card, and `renderMeasureName` around
`setHtml`. Gauges already ride `loadInto` on
`#gauge-container`.

- [ ] **Step 3: Run green and commit**

```bash
git add web-app/app/adapters/project-scoring.ts \
    web-app/app/adapters/dashboard.ts \
    web-app/dashboard/index.ts
git commit -m "Share dashboard scoring reads"
```

---

### Task 10: Organization page fetches members and objectives once

Lane D. Spec § 5 Organization page.

**Files:**
- Modify: `web-app/organization/index.ts`
  (`fetchObjectivesData`)
- Modify: `web-app/app/adapters/objectives.ts` only if
  a pure `activeOf` / `archivedIdsOf` helper is the
  third copy — otherwise filter at the call site
- Modify: `web-app/app/adapters/admin.ts` only if
  `getOrganizationStats` would otherwise GET members a
  second time from this page

**Consumes:** spec commit.

- [ ] **Step 1: Failing pin**

Fake GET during `fetchObjectivesData`: `objectives/`
once. Members: `…/members/` once across
`getOrganizationStats` + init.

- [ ] **Step 2: Filter, do not re-GET**

```typescript
    const [allObjs, states] = await Promise.all([
        getObjectives(ctx),
        // getObjectiveStates today re-GETs; pass rows:
    ]);
```

Add `objectiveStatesOf(rows)` and use
`getArchivedObjectiveIds` shape over `allObjs`
(`state === 'archived'`). `getActiveObjectives` shape
over `allObjs` (`state === 'active'`, position sort).
One `getObjectives`. Keep
`getCurrentObjectiveDefinitions` after, with the
combined ids — that is versions, not the collection.

If `getOrganizationStats` is the only members GET on
this page, leave it. If init also calls `getMembers`
/ `getHumanMembers`, pass the seats down.

Marks: `organization-content` already has an id.
Wrap the Wave 1 `Promise.allSettled` with
`fetchMeasureName('organization-content')` and the
paint with `renderMeasureName('organization-content')`
so page-init is attributed. Do not add a second
skeleton.

- [ ] **Step 3: Run green and commit**

```bash
git add web-app/organization/index.ts \
    web-app/app/adapters/objectives.ts
git commit -m "Fetch organization collections once"
```

---

### Task 11: Hashed, gzip-encoded, code-split assets

Lane E. Spec § 6. Commandments: I Reliability
(byte-identical decoded bodies), II Security (CSP
unchanged: `script-src 'self'`), XII Performance as
consequence. Abominations risked: Premature
Optimization (no brotli, no `node:zlib`), Foreign
Tongues (logical names in HTML, hashed names on disk),
Unbidden Helper Code (no service worker, no
`sessionStorage` token).

**Files:**
- Create: `web-app/app/hash-static.ts` (hash, rewrite
  ESM imports, write manifest, gzip text)
- Modify: `web-app/app/compose.ts` (read manifest;
  rewrite `../assets/<name>` and `assets/<name>`)
- Modify: `bin/build-lib` (`bundle_client` order:
  bundle, hash, compose, gzip)
- Modify: `web-app/app/components-layout.html` and the
  three standalone pages: `app.js` becomes
  `<script type="module" src="../assets/app.js">`
  (compose rewrites to the hashed name). `theme-init.js`
  stays a classic script.
- Modify: `server/http-server.ts` (`serveStatic` sidecar,
  `Vary`, `Content-Encoding`)
- Modify: `tests/http-server.test.ts`
- Modify: `TODO.md` (cachability bullet: hashed names
  and gzip shipped; `HEAD` already reports length;
  conditional requests stay open)
- `tests/root-scripts-exec-deno.test.ts` unchanged

**Consumes:** spec commit.

- [ ] **Step 1: Write the failing sidecar pins**

In `tests/http-server.test.ts`. Extend `withServer`'s
`files` to `Record<string, string | Uint8Array>`:
`Uint8Array` goes through `Deno.writeFile`, strings
through `Deno.writeTextFile` as today. Helper:

```typescript
async function gzipBytes(
    text: string,
): Promise<Uint8Array> {
    const source = new Blob([text]).stream()
        .pipeThrough(
            new CompressionStream('gzip'),
        );
    return new Uint8Array(
        await new Response(source).arrayBuffer(),
    );
}
```

Then:

```typescript
Deno.test(
    'gzip sidecar is served when accepted',
    async () => {
        const body = 'console.log(1)';
        const gz = await gzipBytes(body);
        await withServer({
            'assets/app.deadbeef.js': body,
            'assets/app.deadbeef.js.gz': gz,
        }, undefined, async (base) => {
            const res = await fetch(
                base + '/assets/app.deadbeef.js',
                {
                    headers: {
                        'Accept-Encoding': 'gzip',
                    },
                },
            );
            assertStrictEquals(res.status, 200);
            assertStrictEquals(
                res.headers.get('content-encoding'),
                'gzip',
            );
            assertStrictEquals(
                res.headers.get('vary'),
                'Accept-Encoding',
            );
            assertStrictEquals(
                res.headers.get('cache-control'),
                HASHED_CACHE_CONTROL,
            );
            assertStrictEquals(
                res.headers.get('content-type')
                    ?.startsWith(
                        'text/javascript',
                    )
                    || res.headers.get(
                        'content-type',
                    )?.includes('javascript'),
                true,
            );
            assertStrictEquals(
                res.headers.get('content-length'),
                String(gz.length),
            );
            const raw = new Uint8Array(
                await res.arrayBuffer(),
            );
            assertEquals([...raw], [...gz]);
        });
    },
);

Deno.test(
    'identity body when gzip is not accepted',
    async () => {
        const body = 'console.log(1)';
        const gz = await gzipBytes(body);
        await withServer({
            'assets/app.deadbeef.js': body,
            'assets/app.deadbeef.js.gz': gz,
        }, undefined, async (base) => {
            const res = await fetch(
                base + '/assets/app.deadbeef.js',
            );
            assertStrictEquals(res.status, 200);
            assertStrictEquals(
                res.headers.get('content-encoding'),
                null,
            );
            assertStrictEquals(
                res.headers.get('vary'),
                'Accept-Encoding',
            );
            assertStrictEquals(
                await res.text(), body,
            );
        });
    },
);

Deno.test(
    'HEAD reports the gzip Content-Length',
    async () => {
        const body = 'console.log(1)';
        const gz = await gzipBytes(body);
        await withServer({
            'assets/app.deadbeef.js': body,
            'assets/app.deadbeef.js.gz': gz,
        }, undefined, async (base) => {
            const res = await fetch(
                base + '/assets/app.deadbeef.js',
                {
                    method: 'HEAD',
                    headers: {
                        'Accept-Encoding': 'gzip',
                    },
                },
            );
            assertStrictEquals(res.status, 200);
            assertStrictEquals(
                res.headers.get('content-encoding'),
                'gzip',
            );
            assertStrictEquals(
                res.headers.get('content-length'),
                String(gz.length),
            );
            assertStrictEquals(
                await res.text(), '',
            );
        });
    },
);
```

`gzipBytes` in the test uses `CompressionStream('gzip')`
over `TextEncoder`. Expected: FAIL, sidecar ignored.

- [ ] **Step 2: `serveStatic` sidecar**

Parse `Accept-Encoding` as comma-separated tokens;
`gzip` is accepted when a token is `gzip` or `gzip;q=`
with q > 0. When the logical file has a sibling
`filePath + '.gz'` and gzip is accepted, `stat` the
sidecar, set `Content-Encoding: gzip`, `Vary:
Accept-Encoding`, `Content-Length` from the sidecar,
`Content-Type` and `Cache-Control` from the logical
name (`extname(filePath)`, `staticCacheControl(name)`
of the logical name, never `.gz`). HEAD returns those
headers and a null body. GET opens the sidecar.
When gzip is not accepted, serve the logical file and
still send `Vary: Accept-Encoding` if the sidecar
exists. Never serve `*.gz` as a URL of its own: if the
request path ends in `.gz`, 404 (or treat as a
logical name that is not hashed — 404 is simpler; pin
it).

- [ ] **Step 3: Bundle, hash, compose, gzip**

`bundle_client`:

1. `mkdir -p "$dest/assets"`
2. `deno bundle --frozen --platform browser
   --format esm --code-splitting --minify
   --keep-names --outdir "$dest/assets"
   web-app/app/server-core.ts`
   Identify the entry chunk (the file that is the
   bundle of `server-core.ts`; Deno names it after the
   entry). Copy/rename it to `app.js` in that staging
   dir before hashing if the emitted name is not
   `app.js`.
3. IIFE minify `theme-init.js` and `root-redirect.js`
   as today (classic scripts).
4. Concat CSS as today. Before minify, rewrite
   `url('NAME.woff2')` in the concat using the hashed
   font names — so copy fonts first, hash-rename
   fonts, then rewrite, then `deno bundle --minify`
   CSS with `--external '*.woff2'`.
5. Copy favicons and `mark.png`.
6. `deno run --frozen --allow-read --allow-write
   web-app/app/hash-static.ts "$dest"`
   For every non-HTML file under `dest/assets` and
   not already matching `isHashedAssetName`:
   `base.sha256HexOfBytes(bytes).slice(0, 16).ext`.
   Rewrite `from './X.js'` / `from "./X.js"` inside
   `.js` files to the hashed names. Write
   `dest/asset-manifest.json` as
   `{ "app.js": "app.<hash>.js", … }` including
   chunks, css, fonts, favicons, `mark.png`,
   `theme-init.js`, `root-redirect.js`.
7. `deno run … web-app/app/compose.ts "$dest"` —
   compose reads `dest/asset-manifest.json`. For every
   `../assets/<logical>` and `assets/<logical>`
   (root `index.html`), replace with the hashed name.
   `app.js` script tags are `type="module"`.
   `theme-init.js` stays classic.
8. `hash-static` second pass or `gzip-static`: for
   every `.html`, `.js`, `.css`, `.svg` under `dest`
   (including composed HTML), write `<file>.gz` via
   `CompressionStream('gzip')`. Not woff2, png, ico.

Pin: decoded gzip of `app.<hash>.js` equals the
logical bytes. `tests/root-scripts-exec-deno.test.ts`
stays green (`hash-static.ts` is `deno run`, not
`node`).

Module scripts run before `DOMContentLoaded`;
`server-core.ts` listener stays. CSP unchanged.

- [ ] **Step 4: TODO.md cachability**

Replace the later-work cachability bullet so hashed
names and gzip have shipped; `HEAD` reports the same
length; conditional requests (`If-None-Match` /
`304`) stay open. Keep the oracle that names
`HASHED_CACHE_CONTROL`.

- [ ] **Step 5: Run green**

Run one: `tests/http-server.test.ts`,
`tests/root-scripts-exec-deno.test.ts`.
`./test validate`. A local `./bin/build --no-zip`
dir plus `./bin/serve` is the operator witness, not
the gate.

- [ ] **Step 6: Commit**

```bash
git add web-app/app/hash-static.ts \
    web-app/app/compose.ts bin/build-lib \
    web-app/app/components-layout.html \
    web-app/auth/index.html \
    web-app/not-found/index.html \
    web-app/landing/index.html \
    web-app/index.html \
    server/http-server.ts \
    tests/http-server.test.ts TODO.md
git commit -m "Hash, gzip, and split static assets"
```

If the HTML `type="module"` change must not share a
commit with compose rewrites, split: first commit
the classic-to-module attribute on the four HTML
files with no other content change, then the rest.
Never move/rename and change content in the same
commit.

---

## Spec coverage

| Spec section | Task |
|---|---|
| § 1 Single-statement standalone reads | Task 1 |
| § 2 Marker prefix | Task 2 |
| § 2 Happy path + Replay | Task 2 |
| § 2 One membership derivation | Task 3 |
| Decision 4 subject === actor first | Task 3 |
| § 3 Bindings concurrent | Task 4 |
| § 3 History / one transition read | Task 4 |
| § 4 Grant + client three-way | Task 5 |
| § 5 Workbox | Task 6 |
| § 5 Flow-stats | Task 7 |
| § 5 Record-detail | Task 8 |
| § 5 Dashboard | Task 9 |
| § 5 Organization page | Task 10 |
| § 6 Assets | Task 11 |
| Out of scope (subtree, brotli, sessionStorage, server default org, JSON parse) | no task |
| Witness measure | orchestrator W0/W1 |
| Error and wire table | Tasks 1, 2, 5, 11 |

## Placeholder scan

No TBD, no "similar to Task N", no "add validation".
`gzipBytes` in Task 11's test is specified as
`CompressionStream('gzip')`. Lane B's Task 5 held
until after Task 4 on landing is an integration rule,
not a missing task.

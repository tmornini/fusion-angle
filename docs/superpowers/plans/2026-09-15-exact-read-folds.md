# Exact-read folds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this spec's worktree (AGENTS.md
> § Worktrees): `.worktrees/2026-09-15-exact-read-folds`,
> branch `2026-09-15-exact-read-folds`, base `21a54605`.

> **For the dispatching orchestrator (AGENTS.md § Subagents):**
> every subagent prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then push down: the 78-char lint on
> code/scripts (not `.md`), 4-space indent, the `org`
> identifier ban (spell `organization`), present-tense-
> imperative ~50-char commit subjects with the mandated
> trailer, the Sin of Test Weakening (when test and code
> diverge the code changes — except where THIS plan names a
> covenant the spec itself rewrote: a removed fold's test
> leaves with it, a re-pointed oracle follows the spec), the
> Sin of Unbidden Helper Code (each task's diff is its
> story), the Sin of Default Values (absence is `null` or
> `undefined` at the call site, never `??`'d in a helper),
> the Sin of Internal Defense (trust validated data inside
> the walls), and the codebase patterns named under
> "Context an implementer must know". Subagents work in the
> worktree the orchestrator names and never create their
> own — never pass the Agent tool `isolation`. Subagents
> never run `./deploy --render`. The "Dependency graph and
> lanes" section says which tasks may run concurrently and
> how the orchestrator gives each concurrent lane its own
> worktree; one worker per worktree, always.

**Goal:** Retire the six whole-ledger folds behind
`messagePairs.getAll()` so every read in `api/` is an exact
collection read (`path`) or an exact document read
(`path`, `name`), then take `getAll` off the face the
derives use and pin it.

**Architecture:** Three of the six folds are pure re-reads
(token chain by identity, work-order lifecycle deleted,
field-value RESTRICT leg deleted). Three need a data-shape
decision first, each landing as its own commit before its
fold: the invitation terminal becomes a second PUT of the
invitation document whose head carries `state`; the PII
slot moves from `path = /identities/<id>/pii/, name = ''`
to `path = /identities/<id>/, name = pii` via one named
exception in the pair former; the token document is named
by its jti. `getAll` leaves the `EntityStore` interface
(the derive face) once no `api/` caller remains; the
generic `HistoryEntityStore`, `Tx.getAll`, the backends,
and `selectAll` stay because the backend and store suites
still exercise them.

**Tech Stack:** Deno 2.9.6, TypeScript strict under
`deno.json` (`noUncheckedIndexedAccess`, `noUnusedLocals`,
`verbatimModuleSyntax`, `erasableSyntaxOnly`), `Deno.test`
+ `@std/assert`, the memory backend for Layer 1, Docker
Postgres for `./test postgres`. No new dependencies.

**Spec:**
`docs/superpowers/specs/2026-09-15-exact-read-folds-design.md`.
Read it first; every task cites its section. The examination
report it descends from is
`docs/superpowers/specs/2026-09-15-one-table-examined-report.md`
§ "The six folds, classified".

## Global Constraints

- One concern per commit, in the spec's order (§ Sequence):
  Auth 1a; invitation terminal as document; both invitation
  folds; PII slot; PII rows; delete SFV referrers; delete
  work-order lifecycle; Auth 1b; retire `getAll`. Lanes may
  run concurrently, but they land on the spec branch in
  that order (see "Dependency graph and lanes").
- `./test validate` green on every commit that lands on the
  spec branch. Red on a lane branch is fine; red on landing
  is not.
- Never move/rename a file and change its content in the
  same commit (AGENTS.md § Commit).
- The axiom (spec § Axiom): a collection read is an exact
  match on `path`; a document read is an exact match on
  `path` and `name`; the write appends one pair. No regex
  over the ledger's paths anywhere under `api/` after this
  plan.
- No dual-read of an old shape in production derives (spec
  Decision 8): no `/invitations/<id>/<op>/` read, no
  `/identities/<id>/pii/` read, no `/identity-tokens/` read.
  This repo reaches the new shape by wipe and reseed.
- HTTP routes do not change except where `path + name`
  already is the route: `identities/:id/pii` (same pathname,
  new split), `invitations/:id` (a second PUT of an existing
  document), `identities/:id/tokens/:tid` → `:jti` (same
  shape, honest param name).
- Wire JSON for invitations stays `{ id, organization_id,
  identity_id, at, state }`. The token event entity keeps
  its six keys id-last.
- Commit subject ≈50 chars, present-tense imperative, no
  body beyond the trailer:

  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01UFx7WTb5BghBs2sn925w3w
  ```

## Two interpretations this plan fixes

The spec leaves two things to the plan. Both are stated here
so the operator can overrule them before dispatch; every
task below is written against them.

**(A) The token document's `id` is its `name`, and the
collection read returns heads.** Under Auth 1b (spec § 6)
each jti is one document at `/identities/<id>/tokens/`,
`name = <jti>`. `identityTokenEntityOf` already sets
`id: document.name`, and `deriveIdentityTokensFor` already
folds with `deriveDocumentsAt` (one head per name). Keeping
both means: the entity `id` equals its `jti` (the
authorization_code chain root keeps its spend-marker name,
spec § 6, so that one root's `id` is the marker), and
`GET identities/:id/tokens/` returns one row per jti — its
latest event — rather than one row per event. Every chain
fold the product runs works on heads (every event of a jti
carries the same `chain_id`; `latestActionForJti` is a
head). The one visible consequence is the Tokens page's
derived `parentJti` line (`parentJtiByJti`, display only):
a successor's parent shows while the successor is live and
disappears once the successor is itself rotated, because
the 'issued' row it pairs against is no longer the head.
The alternative — one row per event with `id` = the pair's
own id — would need the gate's `successBody` to know the
pair id it does not have, and breaks "stored PUT = GET" for
tokens. Rejected for that reason.

**(B) `getAll` leaves the `EntityStore` interface, not the
`HistoryEntityStore` class.** Spec § 7: "Drop that method
from the message-store face `api/` derives use … `store-
history-entity.getAll` stays (different store)." The face
is `EntityStore<T>` (`api/db.ts:78-112`), the type of
`DbAdapter.messagePairs`. The class `HistoryEntityStore<T>`
(`api/store-history-entity.ts`) is generic and the store
and backend suites instantiate it over their own row types
(`tests/backend-document-read.test.ts`,
`tests/store-entity-validation.test.ts`); `Tx.getAll` is
exercised by `tests/backend-tx-memory.test.ts`,
`tests/backend-postgres.test.ts`,
`tests/backend-read-isolation.test.ts`,
`tests/backend-getwhere-parity.test.ts`. So `Tx.getAll`,
both backends' `getAll`, `selectAll`, and the pg-explain pin
"the whole ledger is the one seq scan, sorted" stay:
`selectAll` does not "only serve" the derive face. The two
adapter factories return `BackedDbAdapter` (whose
`messagePairs` is declared as the concrete
`HistoryEntityStore<MessagePairEntity>`), so a test holding
a `MemoryDbAdapter` keeps `db.messagePairs.getAll()` as its
whole-plane oracle while nothing typed `DbAdapter` — every
derive, every route handler, every transaction view — can
reach it. The grep pin under `api/` (not `tests/`) is the
belt to that type's braces.

## Dependency graph and lanes

```
            spec commit 21a54605
                     │
   ┌────────┬────────┼────────┬────────┐
   │        │        │        │        │
 Lane A   Lane B   Lane C   Lane D   Lane E
 Task 1   Task 2   Task 4   Task 6   Task 7
 (1a)     (inv     (PII     (SFV     (WO
   │       doc)     slot)    leg)     bulk)
   │        │        │        │        │
 Task 8   Task 3   Task 5     │        │
 (1b)     (inv     (PII       │        │
   │       folds)   rows)     │        │
   │        │        │        │        │
   └────────┴────────┴────────┴────────┘
                     │
                  Task 9
          (getAll off the face, pin, TODO)
```

Edges: 8 → 1; 3 → 2; 5 → 4; 9 → {8, 3, 5, 6, 7}. Tasks 1,
2, 4, 6, 7 have no predecessor and may start at once. Task 9
is last.

**Landing order on the spec branch** (spec § Sequence):
Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7,
Task 8, Task 9. Lane A's second commit (Task 8) lands after
Lane E even though it is ready earlier.

**Shared files across lanes** (the rebase hot spots; every
pair touches disjoint regions, so `git rebase` merges them
cleanly unless a comment hunk abuts another):

| File | Lanes |
|---|---|
| `api/derive-states.ts` | B (invitation section, ~1885–2088), E (work-order section, ~1279–1440) |
| `api/routes.ts` | A (token routes 3277–3292, 4196–4328), C (PII spec 3215–3225) |
| `api/message-pair.ts` | A/Task 8 (token event former 298–359, wired list 903), C (`storedPathAndNameOf` near 203–222) |
| `api/authentication.ts` | A only |
| `tests/drift-states.test.ts` | B (invitation rows), E (bulk lifecycle) |
| `tests/mock-data-valid.test.ts` | E only (B leaves its `deriveInvitationStates` call as is) |
| `tests/drift-phase14-cores-parity.test.ts` | B only |
| `tests/drift-phase15-cores-parity.test.ts` | D (`valueCount`), E (bulk lifecycle) |
| `tests/mock-data-pairs.test.ts` | C only |

**Lane worktrees.** The orchestrator, from the spec
worktree, creates one worktree per concurrent lane off the
spec commit, names it in the subagent prompt, and never
passes `isolation`:

```bash
cd .worktrees/2026-09-15-exact-read-folds
for lane in a b c d e; do
    git worktree add \
        "../2026-09-15-exact-read-folds-lane-$lane" \
        -b "2026-09-15-exact-read-folds-lane-$lane"
done
```

Each lane's tasks run serially in that lane's worktree by
one subagent at a time. The spec worktree is the trunk;
Task 9 runs there.

**Integration** (the orchestrator, after each lane reports
green on its own `./test validate`):

```bash
cd .worktrees/2026-09-15-exact-read-folds     # trunk
# Task 1 alone from lane A (its first commit):
git merge --ff-only <sha of Task 1>
./test validate
# Lanes B, C, D, E in that order:
for lane in b c d e; do
    git -C "../2026-09-15-exact-read-folds-lane-$lane" \
        rebase 2026-09-15-exact-read-folds
    git merge --ff-only "2026-09-15-exact-read-folds-lane-$lane"
    ./test validate
done
# Lane A's remaining commit (Task 8):
git -C ../2026-09-15-exact-read-folds-lane-a \
    rebase 2026-09-15-exact-read-folds
git merge --ff-only 2026-09-15-exact-read-folds-lane-a
./test validate
# Task 9 on the trunk, then clean up:
for lane in a b c d e; do
    git worktree remove "../2026-09-15-exact-read-folds-lane-$lane"
    git branch -d "2026-09-15-exact-read-folds-lane-$lane"
done
```

A rebase conflict is the orchestrator's to resolve (expect
only comment hunks). A lane whose rebase goes red is fixed
in that lane by its subagent before `--ff-only`. Never
`-D`, never force-push.

**Serial fallback.** With no lanes, execute Tasks 1–9 in
numeric order in the spec worktree. The graph still holds:
each task's "Consumes" names exactly what must already be
on the branch.

## Context an implementer must know

**Running tests.** `./test` is the whole memory suite
(≈10 s). One file:

```bash
export DENO_DIR="$TMPDIR/deno-dir"    # Claude Code sandbox only
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
`./test check` is the type gate alone; `./test validate` is
the commit gate (check, memory suite, lint, schema, api
docs). `--no-check` on the runner means a type error shows
only in `./test check` — run it before every commit.

**The ledger vocabulary.** One table. A pair has `path`
(the collection, slash-bounded), `name` (the document's
name within it; `''` for an operation), `method`,
`request`/`response` wire bytes, `request_at`/`response_at`,
`requester_identity_id`, `operation_id`. The seam
(`api/db.ts` `EntityStore`) offers `getCollectionPairs(path)`
(every pair of every document at `path`),
`getDocumentHistory(path, name)`, `getHead`, `getHeadPair`,
`getCollectionHeadPairs`, `getPairsByRequestHash`,
`getAllWhereBody`, `getById`, `append`. `deriveDocumentsAt(
pairs, path)` (`api/derive-documents.ts:123`) folds pairs to
the head per name, dropping DELETE heads;
`documentMessagePairsAt(pairs, path)` (`:78`) is every
PUT/DELETE pair at `path` as `DocumentMessagePair { id, at,
name, method, body, requesterIdentityId }`, (at, id)
ascending. `canonicalPath(organization, flatPrefix)`
(`api/message-pair.ts:136`) applies the organization nest
for registered families; the global plane passes
`undefined`.

**Derive cores.** ARCHITECTURE.md § Derivation: every core
takes `dbOrView: DbAdapter` first, opens no nested
transaction, reads through the view it was handed, and
returns byte-identical results pre-tx and in-tx. Adapters
name HTTP verbs (`getNoun`/`putNoun`/`deleteNoun`/
`postNounOperation`). Storage is snake_case, domain
camelCase. Validators sit at the gate. Absence is modeled at
the call site (`row === undefined ? null : row`), never
`??`'d inside a helper. `noUncheckedIndexedAccess` makes
every index `T | undefined`.

**Two places compute a write's (path, name).** The pair
former `formWriteMessagePair` (`api/message-pair.ts:203`)
and the gate (`api/api.ts:777-785`) each run the same three
steps: `pathAndNameOf(routeSegments, pathSegments)`, then
`canonicalPath(organization, path)`, then
`createdEntityName(routePattern, body) ?? name`. The gate
uses its copy for the head read, the DELETE table, and the
locks; the former stores the pair. Task 4 folds the two into
one exported function because the PII exception must bind
both, or a PII DELETE would head-read the wrong document.

**Transaction bodies await only row ops.** Form pairs
pre-tx (crypto, hashing, `nowUtc()`), then append in the
transaction. `appendMessagePairOnce` stores a pair if its
id is absent; `appendMessagePairAlways` always.

**Fixtures.** `tests/identity-fixtures.ts`:
`seedPersonIdentity(db, id, pii)` writes the
`identities/:id` document AND the PII document;
`seedIdentityPii(db, id, pii)` writes the PII document
alone. `tests/root-admin-fixture.ts` seeds the root admin
`XXZruirZyAOoRpNxaDnpSA`; `DEV_TOKEN`
(`tests/token-fixtures.ts`) is that admin's org-scoped
token; `organizationToken(identityId, organization)` mints
others. `seededMockDb()` (`tests/mock-seed.ts`) is the full
mock seed (1453 pairs, `tests/mock-data-pairs.test.ts:162`).
`PUT`/`POST`/`GET`/`DELETE` from `api/api.ts` are in-process
request helpers that throw `RequestError` on a non-2xx.

**Sandbox.** Under the Claude Code sandbox, `export
DENO_DIR="$TMPDIR/deno-dir"` before any `deno` command,
`./test`, or `./deploy`. Never bake that into a script.

## Subagent prompt template

Use this verbatim as the opening of every dispatch, then
paste the task section.

```
Go to Medium Church!

You are executing Task <N> of
docs/superpowers/plans/2026-09-15-exact-read-folds.md in the
worktree <absolute path> on branch <branch>. Read the plan's
header, "Global Constraints", "Two interpretations this plan
fixes", "Context an implementer must know", and Task <N> in
full, then the spec section Task <N> cites in
docs/superpowers/specs/2026-09-15-exact-read-folds-design.md.

Voice: 78-char max lines in .ts and scripts (./test lint;
.md exempt), 4-space indent, never the `org` abbreviation in
an identifier (spell `organization`), present-tense
imperative ~50-char commit subject, body = exactly the two
trailer lines the plan's Global Constraints give.

Commandments this task touches: <from the task>.
Abominations this task risks: <from the task>.
Patterns: `dbOrView: DbAdapter` is the first argument of every
derive core and a core never opens a nested transaction;
transaction bodies await only row ops; snake_case storage,
camelCase domain; absence is `undefined`/`null` at the call
site, never `??` in a helper; validators at the gate; no
untyped `any` at an external boundary.

Do not run ./deploy --render. Do not create a worktree or
pass `isolation`. Commit when the task's steps say to and
report: files changed, every test command you ran with its
result line, the commit SHA, and anything the plan got wrong
about the code you found.
```

---

### Task 1: Auth 1a — the chain fold reads one identity's collection

Lane A. Spec § 1. Commandments: I Reliability, II Security
(the gate's fail-open hazard on the by-jti fold), VIII
Simplicity. Abominations risked: Greedy Catch (keep
`TokenPlanDivergedError` narrow), Test Weakening (the
cross-identity 403 → 409/2xx is a covenant the spec
rewrote; every other assertion stays as strong).

**Files:**
- Modify: `api/derive-identity-tokens.ts:1-98` (header),
  `:186-239` (delete `deriveIdentityTokens`; require
  `identityId` on `deriveIdentityTokenEventsForJti`)
- Modify: `api/authentication.ts:86-91` (imports),
  `:491-524` (`readTokenChainFromLedger`), `:590-621`
  (`planRotationAttempt`), `:651-704` (`rotateRefreshJti`),
  `:706-729` (`planRevocationAttempt`), `:752-802`
  (`revokeTokenChain`), `:856-859` (`grantRefresh`)
- Modify: `api/routes.ts:270-277` (imports), `:4247-4328`
  (the two token operation routes)
- Test: `tests/api-identity-token-rotation.test.ts`,
  `tests/api-shadow-ledger-tokens.test.ts`,
  `tests/api-authentication-token.test.ts`,
  `tests/adapters-shared-recovery.test.ts`,
  `tests/drift-identity-tokens.test.ts`

**Interfaces:**
- Consumes: `deriveIdentityTokensFor(db, identityId)`
  (`api/derive-identity-tokens.ts:136`, unchanged here);
  `chainIdForJti`, `revocationAppends`, `planRotation`
  (`api/identity-tokens.ts`).
- Produces:

  ```ts
  // api/derive-identity-tokens.ts — identityId now required
  export async function deriveIdentityTokenEventsForJti(
      dbOrView: DbAdapter,
      jti: string,
      identityId: Id,
  ): Promise<IdentityTokenEntity[]>

  // api/authentication.ts — identityId inserted second
  export async function rotateRefreshJti(
      adapter: DbAdapter,
      identityId: Id,
      presentedJti: string,
      newJti: string,
      messagePair?: MessagePair,
  ): Promise<RotationOutcome>

  export async function revokeTokenChain(
      adapter: DbAdapter,
      identityId: Id,
      jti: string,
      messagePair?: MessagePair,
  ): Promise<void>
  ```

  `deriveIdentityTokens` no longer exists. Task 8 consumes
  all three signatures unchanged.

- [ ] **Step 1: Write the failing cross-identity tests**

Append to `tests/api-identity-token-rotation.test.ts`
(add `deriveIdentityTokensFor` to the import from
`../api/derive-identity-tokens.ts` in the same edit; leave
`deriveIdentityTokens` imported until Step 5):

```ts
// Spec § 1 "Unknown": a jti outside THIS identity's own
// tokens collection is unknown to this identity — the
// chain lookup reads one collection, never the plane, so a
// chain another identity owns is not seen, not 403'd. Same
// security (you cannot rotate or revoke a chain you do not
// own), the unknown status. DEV_TOKEN is the root admin, so
// the gate admits the foreign path and the handler decides.
const OTHER_IDENTITY = 'toccYYkLEABmlbpHJalgtQ';

Deno.test(
    'rotating another identity\'s jti is unknown: 409, and'
        + ' the owning chain stays live',
    async () => {
        const db = await seededDb();
        const err = await assertRejects(
            () => POST(
                db,
                `identities/${OTHER_IDENTITY}/tokens/`
                    + `${ROOT_JTI}/rotation`,
                {},
                DEV_TOKEN,
            ),
        ) as RequestError;
        assertInstanceOf(err, RequestError);
        assertStrictEquals(err.status, 409);
        const rows = await deriveIdentityTokensFor(
            db, 'XXZruirZyAOoRpNxaDnpSA',
        );
        assertStrictEquals(rows.length, 1);
        assertStrictEquals(
            latestActionForJti(rows, ROOT_JTI), 'issued');
    },
);

Deno.test(
    'revoking another identity\'s jti is a 2xx no-op that'
        + ' leaves the owning chain live',
    async () => {
        const db = await seededDb();
        await POST(
            db,
            `identities/${OTHER_IDENTITY}/tokens/`
                + `${ROOT_JTI}/revocation`,
            {},
            DEV_TOKEN,
        );
        const rows = await deriveIdentityTokensFor(
            db, 'XXZruirZyAOoRpNxaDnpSA',
        );
        assertStrictEquals(rows.length, 1);
        assertStrictEquals(
            latestActionForJti(rows, ROOT_JTI), 'issued');
    },
);
```

- [ ] **Step 2: Run them to see them fail**

Run one: `tests/api-identity-token-rotation.test.ts`.
Expected: both new tests FAIL — rotation with status 403
(not 409); revocation rejects with 403 (today's
`'token does not belong to this identity'`).

- [ ] **Step 3: Scope the by-jti fold and delete the global one**

In `api/derive-identity-tokens.ts`:

1. Delete `TOKENS_PATH_PATTERN` (lines 90–91).
2. Delete `deriveIdentityTokens` and its comment (lines
   187–221).
3. Replace `deriveIdentityTokenEventsForJti` (lines
   223–239) with:

```ts
// Every LIVE event naming `jti` in ONE identity's own
// collection, id-lex ordered — the by-jti fold
// tokenRevocationReason's SECOND read (isTokenRevoked)
// folds over. A jti that has never appeared in this
// identity's collection returns []. Never the plane: the
// Bearer gate hot path reads one collection.
export async function deriveIdentityTokenEventsForJti(
    dbOrView: DbAdapter,
    jti: string,
    identityId: Id,
): Promise<IdentityTokenEntity[]> {
    const rows = await deriveIdentityTokensFor(
        dbOrView, identityId,
    );
    return rows.filter((row) => row.jti === jti);
}
```

4. In the header comment (lines 13–83) delete the sentences
   that describe a global fold: "an adapter-shaped in-tx
   reader none of those five need" stays; delete "Internal
   global fold — leftover flat plus every nested … prefix"
   wherever it appears. Keep the leftover-flat description
   (Task 8 retires it).

- [ ] **Step 4: Thread the identity through the chain fold**

In `api/authentication.ts`:

1. Imports (lines 88–91): drop `deriveIdentityTokens`; add
   `deriveIdentityTokensFor`.
2. Replace `readTokenChainFromLedger` and its comment (lines
   491–524) with:

```ts
// The two-step narrow shared by rotation and revocation, run
// BOTH pre-tx (the provisional read) and in-tx (the
// authoritative re-read): ONE collection read of the
// identity's own tokens (deriveIdentityTokensFor — the
// nested prefix plus, until Auth 1b, the leftover flat
// prefix filtered to this identity), folded in memory first
// for the presented jti's chain_id, then for every row of
// that chain — planRotation's replay path and an explicit
// revocation act on every jti the chain has ever held, so a
// jti-only fold would under-revoke. A jti absent from this
// identity's collection is unknown: chainId null, rows
// empty. The refresh grant already verified the JWT
// (claims.sub); the rotation and revocation routes carry the
// identity on their path. Never the whole plane (spec
// 2026-09-15 exact-read folds § 1).
async function readTokenChainFromLedger(
    db: DbAdapter,
    identityId: Id,
    jti: string,
): Promise<{
    readonly chainId: string | null;
    readonly rows: readonly IdentityTokenEntity[];
}> {
    const collection = await deriveIdentityTokensFor(
        db, identityId,
    );
    const chainId = chainIdForJti(collection, jti);
    const rows = chainId === null
        ? []
        : collection.filter((row) => row.chain_id === chainId);
    return { chainId, rows };
}
```

3. `planRotationAttempt` (line 601): add `identityId: Id`
   as the second parameter and call
   `readTokenChainFromLedger(adapter, identityId,
   presentedJti)`.
4. `rotateRefreshJti` (line 651): signature per
   "Produces"; pass `identityId` to `planRotationAttempt`
   and to the in-tx `readTokenChainFromLedger(view,
   identityId, presentedJti)`.
5. `planRevocationAttempt` (line 712): add `identityId: Id`
   second; body:

```ts
    const { chainId, rows } = await readTokenChainFromLedger(
        adapter, identityId, jti,
    );
    const appends = chainId === null
        ? []
        : revocationAppends(rows, chainId, identityId, nowUtc());
```

6. `revokeTokenChain` (line 752): signature per "Produces";
   the in-tx body reads
   `readTokenChainFromLedger(view, identityId, jti)` and
   plans `chainId === null ? [] : revocationAppends(rows,
   chainId, identityId, nowUtc())`.
7. `grantRefresh` (line 856): `rotateRefreshJti(adapter,
   verified.claims.sub, verified.claims.jti, newJti,
   messagePair)`.
8. Update the comments above `planRevocationAttempt` ("An
   unknown jti (no chain, no identity)") to "An unknown jti
   (no chain in this identity's collection)".

In `api/routes.ts`:

1. Rotation route (lines 4270–4303): delete the `owner`
   pre-check (4274–4285); call
   `rotateRefreshJti(db, identityId, presented, newJti,
   messagePair)`. Rewrite the comment's first sentence to:
   "Rotate a refresh jti. The path identity's own tokens
   collection is the only ledger this reads: a jti outside
   it is unknown — 409, the same status as reuse (spec
   2026-09-15 § 1)."
2. Revocation route (lines 4310–4328): delete the
   pre-check (4314–4325); call `revokeTokenChain(db,
   identityId, presented, messagePair)`. Comment: "Revoke
   the whole chain a jti belongs to (log out one session).
   A jti outside the path identity's own collection is
   unknown: an idempotent no-op that still appends its
   pair."
3. Drop `deriveIdentityTokenEventsForJti` (line 274) and
   `identityForJti` (line 277) from the imports — neither
   has another use in `routes.ts`.

- [ ] **Step 5: Re-point the tests that listed every token**

The rule: `deriveIdentityTokens(db)` becomes
`deriveIdentityTokensFor(db, <the identity the test minted
for>)`. Where a test has no identity in play and asserts
"no side effects", assert the ledger's pair count instead
(`(await db.messagePairs.getAll()).length` before and after
— a whole-plane count in a test is allowed; see
interpretation (B)).

- `tests/api-identity-token-rotation.test.ts:72,92,109,124,142`
  → `deriveIdentityTokensFor(db, 'XXZruirZyAOoRpNxaDnpSA')`;
  drop `deriveIdentityTokens` from the import.
- `tests/api-shadow-ledger-tokens.test.ts:243,270,315,338,
  524,622,656,678,700,709,725,758,764,820` →
  `deriveIdentityTokensFor(db, 'XXZruirZyAOoRpNxaDnpSA')`
  (every seeded-root test in this file is that identity's).
  `assertRootEventMessagePair` (line 443) gains an
  `identityId: string` parameter used at line 446; each of
  its callers (the authorization_code, token-exchange,
  client_credentials, and org-exchange-hop tests) passes the
  identity that grant mints for — read each test's own
  fixture to find it.
- `tests/api-authentication-token.test.ts:383,391,418,684,
  695,745,755` → `deriveIdentityTokensFor(db,
  'XXZruirZyAOoRpNxaDnpSA')`. Lines 185, 624, 931 (an unknown
  grant type, an invalid refresh token, a rejected
  client_credentials — no identity resolved) → capture
  `const before = (await db.messagePairs.getAll()).length;`
  before the request and assert equality after.
- `tests/adapters-shared-recovery.test.ts:294,541` →
  `deriveIdentityTokensFor(db, 'XXZruirZyAOoRpNxaDnpSA')`
  (confirm from the file that the recovering session is that
  identity; if a test uses another, pass that one).
- `tests/drift-identity-tokens.test.ts:381,384,390,393` →
  add the third argument `'XXZruirZyAOoRpNxaDnpSA'`.

- [ ] **Step 6: Type-check and run the touched files**

```bash
./test check
```

Then Run one for each of the five test files. Expected: all
PASS, including the two Step 1 tests.

- [ ] **Step 7: Run the whole memory suite and lint**

```bash
./test && ./test lint
```

Expected: green. Any other red file is a caller of the
deleted fold this plan missed — re-point it by the Step 5
rule.

- [ ] **Step 8: Commit**

```bash
git add api/derive-identity-tokens.ts api/authentication.ts \
    api/routes.ts tests/api-identity-token-rotation.test.ts \
    tests/api-shadow-ledger-tokens.test.ts \
    tests/api-authentication-token.test.ts \
    tests/adapters-shared-recovery.test.ts \
    tests/drift-identity-tokens.test.ts
git commit -m "Read the token chain from one identity's collection" \
    -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UFx7WTb5BghBs2sn925w3w"
```

---

### Task 2: The invitation terminal is a PUT of the invitation document

Lane B. Spec § 2 (the write side). Commandments: VII
Idempotency (PUT overwrites: the terminal is a full body),
VI Immutability, IV Logic. Abominations risked: Null (state
is required on the document, never nullable), Unbidden
Helper Code (one former, used four times — the abstraction
is earned at the fourth site).

**Files:**
- Modify: `api/types.ts:1330-1344` (`InvitationEntity`)
- Modify: `api/validators.ts:2053-2071`
  (`validateInvitationEntity`)
- Modify: `api/invitations-domain.ts:478-499` (grant
  document), `:570-591` (a sibling former),
  `:632-683` (accept), `:730-757` (decline), `:802-823`
  (revoke)
- Modify: `api/mock-data/seed-message-pairs.ts:2262-2266`
  (seed document body)
- Test: `tests/api-invitation-document.test.ts`,
  `tests/adapters-invitations.test.ts:284-320`

**Interfaces:**
- Consumes: `formWriteMessagePair` (`api/message-pair.ts:203`);
  `currentInvitationState` (`api/invitations-domain.ts:60`,
  unchanged in this task).
- Produces: the invitation document body is
  `{ organization_id, identity_id, at, state }` on every
  PUT; `InvitationEntity.state: InvitationState`;
  `validateInvitationEntity` requires `state`. Task 3 reads
  `state` from the head.

- [ ] **Step 1: Write the failing tests**

In `tests/api-invitation-document.test.ts` add constants
beside the others:

```ts
const INV_DOC_5 = generateIdentifier();
const MS_DOC_5 = generateIdentifier();
const EV_ACC_5 = generateIdentifier();
```

Change the key pin at line 177 to:

```ts
        ['at', 'identity_id', 'organization_id', 'state'],
```

and add after line 182:

```ts
    assertStrictEquals(wire.state, 'pending');
```

Add after the "a no-op re-accept appends no seat document"
test:

```ts
Deno.test('a terminal answer appends a full PUT of the'
+ ' invitation document whose head carries the state',
async () => {
    const db = await freshDb();
    await grant(db, INV_DOC_5);
    const res = await accept(
        db, INV_DOC_5, MS_DOC_5, EV_ACC_5,
        '2026-01-01T00:00:01.000000Z',
    );
    assertStrictEquals(res.status, 204);
    const documents = documentMessagePairsAt(
        await db.messagePairs.getCollectionPairs('/invitations/'),
        '/invitations/',
    ).filter(messagePair => messagePair.name === INV_DOC_5);
    assertStrictEquals(documents.length, 2);
    assertEquals(documents[0]!.body, {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'toccYYkLEABmlbpHJalgtQ',
        at: AT,
        state: 'pending',
    });
    assertEquals(documents[1]!.body, {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'toccYYkLEABmlbpHJalgtQ',
        at: AT,
        state: 'accepted',
    });
    assertStrictEquals(
        documents[1]!.requesterIdentityId,
        'toccYYkLEABmlbpHJalgtQ',
    );
});
```

In the "a no-op re-accept appends no seat document" test,
add before its final assertion:

```ts
    const invitationDocuments = documentMessagePairsAt(
        await db.messagePairs.getCollectionPairs('/invitations/'),
        '/invitations/',
    ).filter(messagePair => messagePair.name === INV_DOC_4);
    assertStrictEquals(invitationDocuments.length, 2);
```

Update the balance test's count and comment (lines
449–458): the accept adds a document PUT and the decline
adds a document PUT, so `15` becomes `17`; rewrite the
comment's arithmetic: "3 grants x 2 (operation + invitation
document) + 1 accept x 3 (operation + memberships document
+ the invitation's terminal document PUT) + 1 decline x 2
(operation + terminal document PUT) = 11, plus the
fixture's own membership pair, four identities/:id/pii
pairs, and the organizations/:id document = 17."

In `tests/adapters-invitations.test.ts:284-320`: add
`state: 'pending'` to the "accepts a full body" and "rejects
a bad timestamp" bodies, and add:

```ts
Deno.test('validateInvitationEntity rejects a missing state',
    () => {
        assertThrows(() => validateInvitationEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: 'toccYYkLEABmlbpHJalgtQ',
            at: '2026-01-01T00:00:00.000000Z',
        }));
    });

Deno.test('validateInvitationEntity rejects an unknown state',
    () => {
        assertThrows(() => validateInvitationEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: 'toccYYkLEABmlbpHJalgtQ',
            at: '2026-01-01T00:00:00.000000Z',
            state: 'lost',
        }));
    });
```

(Match the file's existing import of `assertThrows` and its
existing full-body literal for the ids it uses.)

- [ ] **Step 2: Run them to see them fail**

Run one: `tests/api-invitation-document.test.ts` and
`tests/adapters-invitations.test.ts`. Expected: the key pin,
the new terminal test (1 document, not 2), the balance count
(15, not 17), and the two validator tests FAIL.

- [ ] **Step 3: Put `state` on the entity and its validator**

`api/types.ts` — in `InvitationEntity` after `at: string;`:

```ts
    // The document's head IS the lifecycle: the grant PUTs
    // 'pending'; accept, decline, and revoke each PUT the
    // same document again with the terminal state (spec
    // 2026-09-15 exact-read folds § 2). Required, never null.
    state: InvitationState;
```

`api/validators.ts` — `INVITATION_BODY_KEYS` gains
`'state'`; `validateInvitationEntity` returns
`state: assertInvitationState(pickString(body, 'state'),
'InvitationEntity')`. Import `assertInvitationState` from
`./types.ts` alongside the file's existing type imports
(lines 55–70).

- [ ] **Step 4: One former, four writers**

In `api/invitations-domain.ts`, replace
`formInvitationOperationMessagePair`'s neighbourhood: keep
that function, and add directly above it:

```ts
// The invitation document: `path = /invitations/`, `name =
// <id>`, body = the three grant fields plus `state` (spec
// 2026-09-15 § 2). Its head IS the state — the grant writes
// 'pending'; accept, decline, and revoke each append a full
// PUT with the terminal state, so a collection read of
// /invitations/ or a document read of one id answers "what
// state" with no op-prefix scan. The operation POST pairs
// (acceptance / decline / revocation) remain the HTTP audit
// of each request; derivation never reads them.
async function formInvitationDocumentMessagePair(
    actor: Id,
    requestAt: string,
    operationId: string,
    invitationId: Id,
    body: {
        readonly organization_id: Id;
        readonly identity_id: Id;
        readonly at: string;
        readonly state: InvitationState;
    },
): Promise<MessagePair> {
    return formWriteMessagePair({
        method: 'PUT',
        pathname: '/invitations/' + invitationId,
        routePattern: 'invitations/:id',
        routeSegments: ['invitations', ':id'],
        pathSegments: ['invitations', invitationId],
        headerFields: [],
        body,
        requesterIdentityId: actor,
        requestAt,
        organization: undefined,
        responseStatus: HTTP_OK,
        responseBody: { id: invitationId, ...body },
        operationId,
    });
}
```

`grantInvitation` (lines 478–499) becomes:

```ts
    const document = preOutcome.kind === 'fresh'
        ? await formInvitationDocumentMessagePair(
            actor, requestAt, operationId, invitationId,
            {
                organization_id: organization,
                identity_id: identityId,
                at: grantAt,
                state: 'pending',
            },
        )
        : undefined;
```

`acceptInvitation`: after the replay check (line 644) and
before the seat document, form the terminal:

```ts
    const terminal = await formInvitationDocumentMessagePair(
        actor, requestAt, operationId, id,
        {
            organization_id: inv.organization_id,
            identity_id: inv.identity_id,
            at: inv.at,
            state: 'accepted',
        },
    );
```

and inside its transaction, after
`await appendMessagePairOnce(view, messagePair);` (line
680):

```ts
            await appendMessagePairOnce(view, terminal);
```

`declineInvitation` and `revokeInvitation`: the same two
edits with `state: 'declined'` and `state: 'revoked'`, the
append after each one's `appendMessagePairOnce(view,
messagePair)` (lines 754 and 821). The terminal PUT is
appended only where the domain gate found `'pending'` —
the existing `state !== 'pending'` returns already skip it.

`api/mock-data/seed-message-pairs.ts:2262-2266` — the seed's
`documentBody` gains `state: 'pending',` after `at`.

- [ ] **Step 5: Type-check, run the touched files**

```bash
./test check
```

Run one: `tests/api-invitation-document.test.ts`,
`tests/adapters-invitations.test.ts`. Expected: PASS.

- [ ] **Step 6: Run the whole memory suite**

```bash
./test && ./test lint
```

Expected: green. A red count elsewhere is a test that
counted pairs across an accept/decline/revoke — raise it by
one per terminal answer with a one-line comment naming the
terminal document PUT (the covenant the spec rewrote).

- [ ] **Step 7: Commit**

```bash
git add api/types.ts api/validators.ts \
    api/invitations-domain.ts \
    api/mock-data/seed-message-pairs.ts \
    tests/api-invitation-document.test.ts \
    tests/adapters-invitations.test.ts
git commit -m "Record the invitation terminal as a document PUT" \
    -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UFx7WTb5BghBs2sn925w3w"
```

---

### Task 3: Both invitation folds read the document

Lane B, after Task 2. Spec § 2 (the read side). Commandments:
VIII Simplicity, IX Generality (one row mapper shared by two
folds of the same pairs), III Uniformity. Abominations
risked: Test Weakening (row `id`/`at` move from op-body
event ids to the PUT pair's own — the spec's covenant; every
state assertion stays), Internal Defense (do not re-check
`state` shapes the validator already gated).

**Files:**
- Modify: `api/derive-invitations.ts` (whole file)
- Modify: `api/derive-states.ts:1885-2088` (the invitation
  section)
- Modify: `api/invitations-domain.ts:32-35` (imports),
  `:553-568` (`pendingInvitationFor`), `:836-843`
  (`loadInvitation`)
- Test: `tests/derive-invitation-op-state.test.ts`,
  `tests/derive-invitation-lifecycle-for.test.ts`,
  `tests/derive-states-union.test.ts:735-960`,
  `tests/api-invitations-fence.test.ts:360-383`,
  `tests/drift-phase14-cores-parity.test.ts:97-139`,
  `tests/mock-data-unaffiliated-identity.test.ts:52-69`,
  `tests/pin-invitation-client-rehome-parity.test.ts:160-190`

**Interfaces:**
- Consumes: the document head's `state` (Task 2);
  `deriveDocumentsAt`, `documentMessagePairsAt`,
  `byIdAscending` (`api/derive-documents.ts`);
  `assertInvitationState` (`api/types.ts:303`).
- Produces:

  ```ts
  // api/derive-invitations.ts
  export async function deriveInvitations(
      db: DbAdapter,
  ): Promise<DerivedInvitationRow[]>          // unchanged shape
  export async function deriveInvitation(
      dbOrView: DbAdapter,
      id: Id,
  ): Promise<DerivedInvitationRow | undefined>  // NEW

  // api/derive-states.ts — unchanged signatures
  export async function deriveInvitationStates(
      db: DbAdapter,
  ): Promise<StateEntity[]>
  export async function invitationLifecycleStatesFor(
      dbOrView: DbAdapter,
      id: Id,
  ): Promise<StateEntity[]>
  ```

  A lifecycle row is `{ id: <PUT pair id>, entity_id:
  <invitation id>, state: <body.state>, member_id: <pair
  requester>, at: <pair response stamp> }`.
  `invitationOpStateFor` and `invitationOpStates` no longer
  exist.

- [ ] **Step 1: Write the failing tests**

`tests/derive-invitation-op-state.test.ts` — this file
becomes the document-head oracle. Replace the import of
`invitationOpStateFor` with `deriveInvitation`; rewrite
`rowPlaneOpState` to return `latest.state` (delete the
`'pending' → undefined` branch); in every test replace
`await invitationOpStateFor(db, id)` with
`(await deriveInvitation(db, id))?.state`; the pending test
now expects `'pending'`; the never-granted test expects
`undefined`. Rewrite the header comment (lines 18–26):

```ts
// The document-head oracle: deriveInvitation is ONE document
// read whose head carries `state` (spec 2026-09-15 § 2).
// This file proves it agrees with invitationLifecycleStatesFor
// (the document's own history, latest row) over the three
// live lifecycles plus pending and never-granted.
```

`tests/drift-phase14-cores-parity.test.ts:99-139` — replace
`invitationOpStateFor` with `deriveInvitation` (import too);
`assertEquals(inTx, preTx)`; `assertStrictEquals(
preTx?.state, 'accepted')`; the missing case asserts
`preTxMissing === undefined`.

`tests/mock-data-unaffiliated-identity.test.ts:65-68`:

```ts
    assertStrictEquals(
        (await deriveInvitation(db, invitation.id))?.state,
        'pending',
    );
```

(swap the import).

`tests/pin-invitation-client-rehome-parity.test.ts:160-190`
— retitle to `'deriveInvitation (one document read) equals
deriveInvitations find-by-id, and is undefined for an
unknown id'`; assert
`assertEquals(await deriveInvitation(db, id), (await
deriveInvitations(db)).find(r => r.id === id))` for a
granted id and `undefined` for `generateIdentifier()`.

`tests/derive-invitation-lifecycle-for.test.ts:90` — replace
`assertStrictEquals(scoped[0]!.id, grantEventId)` with
`assertStrictEquals(scoped[0]!.member_id,
'XXZruirZyAOoRpNxaDnpSA')` (the granting admin is the PUT's
requester). Rewrite the header (lines 21–29) and the
phantom-echo test's rationale (193–198): a duplicate grant
writes no document, so it has no rows — structurally, not
by cross-reference.

`tests/derive-states-union.test.ts` — line 735–745: replace
`.map((row) => row.id)` / `[fx.grantEventId,
fx.acceptEventId]` with `.map((row) => row.state)` /
`['pending', 'accepted']`. Line 817: delete the
`pendingForOriginal[0]!.id === grantA` assertion. Lines
890–894: replace with
`assertStrictEquals(rows.filter((row) => row.entity_id ===
invitationId).length, 2);`. The re-decline test's tail:
likewise (one declined row, two rows total).

`tests/api-invitations-fence.test.ts:371-382` — retitle the
comment "Event carries the caller-supplied at" to "The
pending row is the grant's own document PUT"; replace the
two assertions with:

```ts
    const [grantPut] = documentMessagePairsAt(
        await db.messagePairs.getDocumentHistory(
            '/invitations/', INV_IDEM,
        ),
        '/invitations/',
    );
    assertStrictEquals(ev.id, grantPut!.id);
    assertStrictEquals(ev.at, grantPut!.at);
```

(import `documentMessagePairsAt` from
`../api/derive-documents.ts`).

- [ ] **Step 2: Run them to see them fail**

Run one for each of the seven files. Expected: FAIL on the
missing export `deriveInvitation` (import error) in five
files; the fence and states-union files fail on ids/at.

- [ ] **Step 3: Rewrite `api/derive-invitations.ts`**

Replace the whole file with:

```ts
import type { DbAdapter } from './db.ts';
import {
    assertInvitationState,
    type Id,
    type InvitationState,
} from './types.ts';
import { pickString } from './validators.ts';
import { canonicalPath } from './message-pair.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
    type DerivedDocument,
} from './derive-documents.ts';

// The invitation family's reduction over the message ledger.
// An invitation is ONE document: `path = /invitations/`,
// `name = <id>`, body = organization_id, identity_id, at,
// state. The grant PUTs it 'pending'; accept, decline, and
// revoke each PUT it again with the terminal state
// (api/invitations-domain.ts). The head IS the state: the
// list is one collection read, one invitation is one
// document read — no op-prefix scan, no whole-ledger read
// (spec 2026-09-15 exact-read folds § 2).

const INVITATIONS_PREFIX = canonicalPath(
    undefined, '/invitations/',
);

export interface DerivedInvitationRow {
    readonly id: Id;
    readonly organization_id: Id;
    readonly identity_id: Id;
    readonly at: string;
    readonly state: InvitationState;
}

function invitationRowOf(
    document: DerivedDocument,
): DerivedInvitationRow {
    return {
        id: document.name,
        organization_id: pickString(
            document.body, 'organization_id',
        ),
        identity_id: pickString(document.body, 'identity_id'),
        at: pickString(document.body, 'at'),
        state: assertInvitationState(
            pickString(document.body, 'state'),
            'invitation ' + document.name,
        ),
    };
}

// The collection read: every live invitation head, id-lex.
export async function deriveInvitations(
    db: DbAdapter,
): Promise<DerivedInvitationRow[]> {
    const messagePairs = await db.messagePairs.getCollectionPairs(
        INVITATIONS_PREFIX,
    );
    const documents = deriveDocumentsAt(
        messagePairs, INVITATIONS_PREFIX,
    );
    const rows: DerivedInvitationRow[] = [];
    for (const document of documents.values()) {
        rows.push(invitationRowOf(document));
    }
    return rows.sort(byIdAscending);
}

// The document read: one invitation's head, or undefined
// when no document was ever written at this id. dbOrView-
// shaped and opens no nested transaction — callable from
// within an open write-gate transaction.
export async function deriveInvitation(
    dbOrView: DbAdapter,
    id: Id,
): Promise<DerivedInvitationRow | undefined> {
    const history = await dbOrView.messagePairs.getDocumentHistory(
        INVITATIONS_PREFIX, id,
    );
    const document = deriveDocumentsAt(
        history, INVITATIONS_PREFIX,
    ).get(id);
    return document === undefined
        ? undefined
        : invitationRowOf(document);
}
```

- [ ] **Step 4: Rewrite the invitation section of `api/derive-states.ts`**

Replace lines 1885–2088 (from the comment block that begins
"THE GRANT'S OWN DUPLICATE-ECHO" through the end of
`invitationLifecycleStatesFor`) with:

```ts
// The invitation lifecycle, from the invitation document's
// own history (api/derive-invitations.ts owns the head
// read): every PUT at /invitations/<id> is one lifecycle
// row — the grant's 'pending', then the terminal PUT. `id`
// and `at` are the pair's own; `member_id` is the pair's
// requester (the granting admin, the answering invitee, the
// revoking admin). A duplicate grant writes no document and
// a no-op resend appends no PUT, so neither has a row.
function invitationLifecycleRowsOf(
    messagePairs: readonly DocumentMessagePair[],
): StateEntity[] {
    const rows: StateEntity[] = [];
    for (const messagePair of messagePairs) {
        rows.push({
            id: messagePair.id,
            entity_id: messagePair.name,
            state: pickString(messagePair.body, 'state'),
            member_id: messagePair.requesterIdentityId,
            at: messagePair.at,
        });
    }
    return rows.sort(byIdAscending);
}

// Every invitation's lifecycle: ONE collection read of
// /invitations/ — every pair of every document there.
export async function deriveInvitationStates(
    db: DbAdapter,
): Promise<StateEntity[]> {
    const stored = await db.messagePairs.getCollectionPairs(
        INVITATIONS_PREFIX,
    );
    return invitationLifecycleRowsOf(
        documentMessagePairsAt(stored, INVITATIONS_PREFIX),
    );
}

// One invitation's lifecycle: ONE document read. dbOrView-
// shaped; opens no nested transaction
// (currentInvitationState's in-tx gate reads through it).
export async function invitationLifecycleStatesFor(
    dbOrView: DbAdapter,
    id: Id,
): Promise<StateEntity[]> {
    const history = await dbOrView.messagePairs.getDocumentHistory(
        INVITATIONS_PREFIX, id,
    );
    return invitationLifecycleRowsOf(
        documentMessagePairsAt(history, INVITATIONS_PREFIX),
    );
}
```

Delete `INVITATION_OP_PATH_PATTERN`, `InvitationOpFields`,
and `INVITATION_OP_FIELDS`. `DocumentMessagePair`,
`documentMessagePairsAt`, `byIdAscending`, `pickString`, and
`INVITATIONS_PREFIX` are already in the module (lines 18–23,
85). If `./test check` names any other now-unused local,
delete it.

- [ ] **Step 5: Re-point `api/invitations-domain.ts`**

Imports (lines 32–35): `deriveInvitations, deriveInvitation`
from `./derive-invitations.ts` (drop
`invitationOpStateFor`).

```ts
// The org's outstanding pending invitation for an identity,
// or null. Exported for write-path parity pins.
export async function pendingInvitationFor(
    adapter: DbAdapter,
    organization: Id,
    identityId: Id,
): Promise<{ id: Id; at: string } | null> {
    const pending = (await deriveInvitations(adapter)).find(
        inv => inv.organization_id === organization
            && inv.identity_id === identityId
            && inv.state === 'pending',
    );
    return pending === undefined
        ? null
        : { id: pending.id, at: pending.at };
}
```

```ts
async function loadInvitation(
    adapter: DbAdapter,
    id: Id,
): Promise<InvitationRow | null> {
    const row = await deriveInvitation(adapter, id);
    return row === undefined ? null : row;
}
```

- [ ] **Step 6: Type-check, run the touched files, then everything**

```bash
./test check
```

Run one for each of the seven Step 1 files. Then:

```bash
./test && ./test lint
```

Expected: green. Any other red is a test that keyed an
invitation lifecycle row by an op-body event id
(`grantEventId`, `acceptEventId`, …) or by `grantAt`; move
it to the PUT pair's `id`/`at` as the fence test does, or to
`state`/`member_id`.

- [ ] **Step 7: Commit**

```bash
git add api/derive-invitations.ts api/derive-states.ts \
    api/invitations-domain.ts \
    tests/derive-invitation-op-state.test.ts \
    tests/derive-invitation-lifecycle-for.test.ts \
    tests/derive-states-union.test.ts \
    tests/api-invitations-fence.test.ts \
    tests/drift-phase14-cores-parity.test.ts \
    tests/mock-data-unaffiliated-identity.test.ts \
    tests/pin-invitation-client-rehome-parity.test.ts
git commit -m "Fold invitations from the document, not op prefixes" \
    -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UFx7WTb5BghBs2sn925w3w"
```

---

### Task 4: The PII slot is `path = /identities/<id>/`, `name = pii`

Lane C. Spec § 3 (the shape). Commandments: III Uniformity
(one function computes a write's stored path and name for
the gate and the former), I Reliability (the DELETE table's
head read must see the same document the PUT stored).
Abominations risked: Premature Generalization (this is the
one named exception; do not widen `pathAndNameOf`),
Scattered Context (the gate and the former had drifted into
two copies of one rule — fold them, do not add a third).

**Files:**
- Modify: `api/message-pair.ts:203-222` (`formWriteMessagePair`;
  new `storedPathAndNameOf` above it)
- Modify: `api/api.ts:774-785` (the gate's (path, name))
- Modify: `api/derive-identity-spine.ts:36-66` (header),
  `:86-92` (prefix), `:148-168` (`deriveIdentityPii`)
- Modify: `api/routes.ts:3220` (`name: 'pii'`)
- Test: `tests/message-pair.test.ts:39-53`,
  `tests/api-pii-tombstone.test.ts:81-93,420-439`,
  `tests/mock-data-pairs.test.ts:251-270,980-983`

**Interfaces:**
- Consumes: `pathAndNameOf` (`api/path-and-name.ts:14`),
  `createdEntityName` (`api/message-pair.ts:798`),
  `canonicalPath` (`:136`).
- Produces:

  ```ts
  // api/message-pair.ts
  export function storedPathAndNameOf(input: {
      readonly routePattern: string;
      readonly routeSegments: readonly string[];
      readonly pathSegments: readonly string[];
      readonly organization: Id | undefined;
      readonly body: Record<string, unknown> | undefined;
  }): PathAndName
  ```

  Every PII pair — live PUT/DELETE, seed, fixtures — stores
  `path = '/identities/<id>/'`, `name = 'pii'`. Task 5
  consumes `identityPrefixFor` and `PII_DOCUMENT_NAME` from
  `api/derive-identity-spine.ts` (module-private; Task 5
  edits the same file).

- [ ] **Step 1: Write the failing tests**

`tests/message-pair.test.ts:39-53` — retitle to `'the PII
route stores at the identity's own path under the name
pii'` and assert:

```ts
    assertStrictEquals(messagePair.path, '/identities/ada/');
    assertStrictEquals(messagePair.name, 'pii');
```

`tests/api-pii-tombstone.test.ts` — lines 81–93:

```ts
function piiPath(id: string): string {
    return '/identities/' + id + '/';
}

async function pairsAtPii(
    db: MemoryDbAdapter,
    id: string,
) {
    const messagePairs = await db.messagePairs.getAll();
    return messagePairs.filter(
        r => r.path === piiPath(id) && r.name === 'pii',
    );
}
```

(rename every `piiCollection(` call to `piiPath(`). Line
427: `storedPutBodyText(db, '/identities/' + id + '/',
'pii')`. Line 431: `name: 'pii'`.

`tests/mock-data-pairs.test.ts:257-262`:

```ts
    const row = requests.find(
        r => r.path === '/identities/' + firstMember.id + '/'
            && r.name === 'pii',
    );
    assert(row, 'no request row for the seeded PII intake');
```

(delete the `row!.name === ''` assertion; the find already
pins the name). Lines 980–983:

```ts
    const atPii = requests.filter(
        r => r.path === '/identities/XXZruirZyAOoRpNxaDnpSA/'
            && r.name === 'pii',
    );
```

Update the test titles that say "identities/:id/pii
document" to "identities/:id/ document named pii" where the
title states the split.

- [ ] **Step 2: Run them to see them fail**

Run one: `tests/message-pair.test.ts`,
`tests/api-pii-tombstone.test.ts`,
`tests/mock-data-pairs.test.ts`. Expected: FAIL on the path
and name assertions.

- [ ] **Step 3: One function for a write's stored (path, name)**

In `api/message-pair.ts`, add
`import type { PathAndName } from './path-and-name.ts';`
beside the existing `pathAndNameOf` import (line 10), and
above `formWriteMessagePair`:

```ts
// The stored (path, name) of a write, in ONE place for the
// gate (api.ts's head read, DELETE table, and locks) and the
// former: the route splitter, then the canonical
// organization prefix, then the two named overrides — a
// create-shaped collection POST names its created entity
// (createdEntityName), and PII names its singleton. PII is
// the one route whose literal last segment is a document
// name, not an operation (spec 2026-09-15 exact-read folds
// § 3): `path = /identities/<id>/`, `name = pii`, the same
// pathname as its URL. pathAndNameOf keeps its literal-tail
// rule — widening it would rename every operation
// (transition, rotation, acceptance).
const PII_ROUTE_PATTERN = 'identities/:id/pii';
const PII_DOCUMENT_NAME = 'pii';

export function storedPathAndNameOf(input: {
    readonly routePattern: string;
    readonly routeSegments: readonly string[];
    readonly pathSegments: readonly string[];
    readonly organization: Id | undefined;
    readonly body: Record<string, unknown> | undefined;
}): PathAndName {
    if (input.routePattern === PII_ROUTE_PATTERN) {
        return {
            path: canonicalPath(
                input.organization,
                '/' + input.pathSegments.slice(0, -1).join('/')
                    + '/',
            ),
            name: PII_DOCUMENT_NAME,
        };
    }
    const pathAndName = pathAndNameOf(
        input.routeSegments, input.pathSegments,
    );
    const createdId = createdEntityName(
        input.routePattern, input.body,
    );
    return {
        path: canonicalPath(input.organization, pathAndName.path),
        name: createdId ?? pathAndName.name,
    };
}
```

(The `createdId ?? pathAndName.name` is the line that lives
at `:222` today, moved, not added.)

In `formWriteMessagePair`, replace lines 213–222 with:

```ts
    const { path, name } = storedPathAndNameOf(input);
```

In `api/api.ts:777-785`, replace the three-step computation
with:

```ts
            const { path: canonicalPrefix, name } =
                storedPathAndNameOf({
                    routePattern,
                    routeSegments: matched.segments,
                    pathSegments,
                    organization,
                    body,
                });
```

Import `storedPathAndNameOf` from `./message-pair.ts`; drop
`pathAndNameOf` and `createdEntityName` from `api.ts`'s
imports if nothing else in the file uses them (grep before
deleting; keep `canonicalPath` if it has other uses).

- [ ] **Step 4: Read the slot at its new (path, name)**

In `api/derive-identity-spine.ts`, replace lines 86–92 with:

```ts
// The PII slot is the identity's own singleton: `path =
// /identities/<id>/`, `name = pii` — the same pathname as
// PUT identities/:id/pii (message-pair.ts
// storedPathAndNameOf). One document read serves it.
const PII_DOCUMENT_NAME = 'pii';

function identityPrefixFor(identityId: Id): string {
    return canonicalPath(
        undefined, '/identities/' + identityId + '/',
    );
}
```

`deriveIdentityPii` (lines 148–168) becomes:

```ts
// The single-slot read: ONE document read of (the identity's
// prefix, 'pii'). Throws EntityNotFoundError('identity_pii',
// id) on absence OR a DELETE-head slot (an erasure
// tombstone) — the 404-byte anchor
// tests/drift-identities.test.ts pins.
export async function deriveIdentityPii(
    db: DbAdapter,
    id: Id,
): Promise<IdentityPiiEntity> {
    const prefix = identityPrefixFor(id);
    return db.readTransaction(async (view) => {
            const history = await view.messagePairs.getDocumentHistory(
                prefix, PII_DOCUMENT_NAME,
            );
            const document = deriveDocumentsAt(
                history, prefix,
            ).get(PII_DOCUMENT_NAME);
            if (document === undefined) {
                throw new EntityNotFoundError(
                    'identity_pii', id,
                );
            }
            return piiEntityOf(id, document);
        },
    );
}
```

`deriveIdentityPiiRows` keeps its whole-ledger fold for one
more commit (Task 5 replaces it), but it must find the NEW
slot so this commit is green on its own: change
`PII_PATH_PATTERN` to `/^\/identities\/([^/]+)\/$/` and the
`.get('')` at line 133 to `.get(PII_DOCUMENT_NAME)`. Nothing
else stores at `/identities/<id>/` (credentials, providers,
tokens, and default-organization each add a segment), so
the pattern selects only PII prefixes. In the header (lines
36–66), delete the paragraphs describing PII as "a singleton
document at a collection-style path"; Task 5 rewrites the
rest.

`api/routes.ts:3220`: `name: 'pii',`.

- [ ] **Step 5: Type-check and run the three files, then the PII suite**

```bash
./test check
```

Run one: the three Step 1 files, then
`tests/drift-identities.test.ts`,
`tests/api-identities-create.test.ts`,
`tests/adapters-identity-creation.test.ts`. Expected: PASS.
Then the whole suite:

```bash
./test && ./test lint
```

Expected: green — every PII writer rides `formWriteMessagePair`
(the live route, the seed's `formSeedMessagePair`, and the
`identity-fixtures.ts` / `member-fixtures.ts` formers), so
the new (path, name) reaches every reader at once.

- [ ] **Step 6: Commit**

```bash
git add api/message-pair.ts api/api.ts \
    api/derive-identity-spine.ts api/routes.ts \
    tests/message-pair.test.ts tests/api-pii-tombstone.test.ts \
    tests/mock-data-pairs.test.ts
git commit -m "Store PII at the identity's path under the name pii" \
    -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UFx7WTb5BghBs2sn925w3w"
```

---

### Task 5: `deriveIdentityPiiRows` lists identities, then one document each

Lane C, after Task 4. Spec § 3 (the fold). Commandments: XI
Efficiency (O(identities), not O(ledger)), I Reliability
(login by email and grant by email ride this).
Abominations risked: Polling/Scattered Context — none;
Test Weakening — fixtures that seeded a PII document with
no identity document must now seed both, because PII rides
its identity.

**Files:**
- Modify: `api/derive-identity-spine.ts:31-79` (header),
  `:107-140` (`deriveIdentityPiiRows`), `:485-500`
  (`deriveIdentityKind` shares the identities prefix)
- Test: `tests/drift-identities.test.ts` (a new pin), plus
  every test whose PII must be visible through
  `deriveIdentityPiiRows` and was seeded with
  `seedIdentityPii` alone (Step 4)

**Interfaces:**
- Consumes: `identityPrefixFor`, `PII_DOCUMENT_NAME`
  (Task 4); `deriveDocumentsAt`.
- Produces: `deriveIdentityPiiRows(db)` unchanged signature;
  a PII row is listed iff its identity has a live
  `identities/:id` document AND a live PII head.

- [ ] **Step 1: Write the failing pin**

Append to `tests/drift-identities.test.ts` (import
`seedIdentityPii` and `seedPersonIdentity` from
`./identity-fixtures.ts`, `generateIdentifier` is already
imported):

```ts
// Spec 2026-09-15 § 3: the rows fold lists identities, then
// reads one document each. A PII document with no
// identities/:id document is unreachable by construction —
// PII rides its identity.
Deno.test('deriveIdentityPiiRows lists a slot only through its'
+ ' identity document', async () => {
    const db = await seededDb();
    const orphanSlot = generateIdentifier();
    const person = generateIdentifier();
    await seedIdentityPii(db, orphanSlot, {
        name: 'Orphan Slot', email: 'orphan@example.net',
        phone: '', bio: '',
    });
    await seedPersonIdentity(db, person, {
        name: 'Whole Person', email: 'whole@example.net',
        phone: '', bio: '',
    });
    const ids = new Set(
        (await deriveIdentityPiiRows(db)).map((row) => row.id),
    );
    assertStrictEquals(ids.has(person), true);
    assertStrictEquals(ids.has(orphanSlot), false);
});
```

- [ ] **Step 2: Run it to see it fail**

Run one: `tests/drift-identities.test.ts`. Expected: the new
test FAILS — Task 4's interim fold still scans the ledger
for PII prefixes, so the orphan slot is listed.

- [ ] **Step 3: Enumerate identities, read one document each**

In `api/derive-identity-spine.ts`, add beside
`PII_DOCUMENT_NAME`:

```ts
const IDENTITIES_PREFIX = canonicalPath(
    undefined, '/identities/',
);
```

Replace `deriveIdentityPiiRows` and `PII_PATH_PATTERN` with:

```ts
// Every LIVE PII slot, id-lex: the identities collection
// lists the ids (ONE collection read), then ONE document
// read per identity — O(identities), never O(ledger). A
// DELETE-head slot (an erasure tombstone) is absent
// (deriveDocumentsAt's own head-absence rule). An identity
// with no identities/:id document has no slot to read: PII
// rides its identity. One readonly transaction so the list
// and its reads see one snapshot.
export async function deriveIdentityPiiRows(
    db: DbAdapter,
): Promise<IdentityPiiEntity[]> {
    return db.readTransaction(async (view) => {
            const identities = deriveDocumentsAt(
                await view.messagePairs.getCollectionPairs(
                    IDENTITIES_PREFIX,
                ),
                IDENTITIES_PREFIX,
            );
            const rows: IdentityPiiEntity[] = [];
            for (const identityId of identities.keys()) {
                const prefix = identityPrefixFor(identityId);
                const document = deriveDocumentsAt(
                    await view.messagePairs.getDocumentHistory(
                        prefix, PII_DOCUMENT_NAME,
                    ),
                    prefix,
                ).get(PII_DOCUMENT_NAME);
                if (document === undefined) continue;
                rows.push(piiEntityOf(identityId, document));
            }
            return rows.sort(byIdAscending);
        },
    );
}
```

`deriveIdentityKind` (lines 485–500): use `IDENTITIES_PREFIX`
instead of its inline `canonicalPath(undefined,
'/identities/')`, and change its comment's last sentence to
"The identities collection read is the one
deriveIdentityPiiRows begins with."

Rewrite the module header (lines 31–79): drop every E13
full-scan paragraph and the two-half-store torn-read
paragraph; state the four facets and that every read below
is a collection or a document read.

- [ ] **Step 4: Seed the identity document where a test needs its PII listed**

Every test that reaches PII through
`deriveIdentityPiiRows` — grant by email, roster and
invitation views, login by email — and seeded with
`seedIdentityPii` alone must seed the identity document too.
Rule: replace `seedIdentityPii(` with `seedPersonIdentity(`
(same `(db, id, pii)` signature; it writes `identities/:id`
then the PII document) in every test file where the PII is
read back through a grant, a list, or a login. Find them:

```bash
grep -rln "seedIdentityPii(" tests/
```

(13 files today.) Leave a file on `seedIdentityPii` only
when it reads the slot solely through `deriveIdentityPii`
or the PII route — the tombstone tests. Then check
`tests/member-fixtures.ts`'s `seedCurrentMember`: if it
writes the PII document without an `identities/:id`
document, add the identity document there (mirror
`identity-fixtures.ts`'s `identityDocumentMessagePair` +
`postIdentityDocumentOp`), because `authorizePassword` finds
a login by email through this fold. If `seedIdentityPii`
ends with no caller, delete it and its comment (lines
185–203 of `tests/identity-fixtures.ts`).

- [ ] **Step 5: Type-check, then the whole suite**

```bash
./test check && ./test && ./test lint
```

Expected: green. A red "no identity with that email" 404 or
an empty invitee list names a fixture Step 4 missed.

- [ ] **Step 6: Commit**

```bash
git add api/derive-identity-spine.ts tests/
git commit -m "List PII by identity, one document read each" \
    -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UFx7WTb5BghBs2sn925w3w"
```

(`git add tests/` is deliberate: Step 4 touches many files;
review `git status` first so nothing outside this task is
staged.)

---

### Task 6: Delete `deriveStateFieldValueReferrers`

Lane D. Spec § 4. Commandments: VIII Simplicity, IV Logic
(RESTRICT's rule is no LIVE referrer; a ledger that never
forgets cannot be a liveness oracle). Abominations risked:
Test Weakening (the SFV-leg tests die with the leg; the
RESTRICT covenant is carried by the instance-head leg,
already pinned in `tests/api-nested-attributes.test.ts:388`
and re-pointed below).

**Files:**
- Delete: `api/derive-state-field-values.ts`
- Modify: `api/record-attribute-refs.ts:10-15` (import),
  `:25-59` (header), `:36-44` (`AttributeReferrers`),
  `:80-99` (comment), `:132-135`, `:144-145`, `:173-182`
  (`valueCount`), `:216-223` (`hasReferrers`), `:225-255`
  (`describeReferrers`)
- Modify: `ARCHITECTURE.md:191-194`
- Test: `tests/api-work-order-history-shapes.test.ts:458-514`,
  `tests/drift-state-field-values.test.ts:147-176`,
  `tests/drift-records.test.ts:1340-1498`,
  `tests/api-record-attribute-restrict.test.ts:187-256,
  318-378,380-405,586-646`,
  `tests/api-record-types-composed-op.test.ts:160-200,300-313`,
  `tests/drift-phase15-cores-parity.test.ts:1544-1557`

**Interfaces:**
- Consumes: `deriveInstanceCollection`
  (`api/derive-record-instances.ts:188`) — the fourth leg,
  already wired.
- Produces:

  ```ts
  export interface AttributeReferrers {
      readonly flowIds: readonly string[];
      readonly workOrderIds: readonly string[];
      readonly instanceIds: readonly string[];
  }
  ```

  `describeReferrers` names "flow(s) …; work order(s) …;
  instance(s) …" in that order. `StateFieldValueEntity`
  (`api/types.ts:1272`) stays: the transition-body validator
  and the seed's legacy trace bags still use it.

- [ ] **Step 1: Re-point the RESTRICT tests to an instance head**

`tests/api-record-attribute-restrict.test.ts`:

1. Shape proof (lines 217–254): remove `'valueCount'` from
   both union positions and from the sample; the expected
   key list becomes `['flowIds', 'instanceIds',
   'workOrderIds']`. Update the comment "AttributeReferrers
   names only valueCount / flowIds / workOrderIds" to
   "flowIds / workOrderIds / instanceIds".
2. Replace `seedFieldValueReferrer` (lines 318–378) with an
   instance referrer under the same type (the idiom
   `tests/api-nested-attributes.test.ts`'s fourth-leg test
   uses — read it and match its request shape):

```ts
const INSTANCE_ID = generateIdentifier();

// A live instance head under the parent type whose values
// name `attributeId` — the fourth RESTRICT leg (spec
// 2026-09-15 § 4: values live on the instance document).
async function seedInstanceReferrer(
    db: MemoryDbAdapter,
    attributeId: string,
    value: string,
): Promise<void> {
    await PATCH(
        db, TYPE_PATH + '/instances/' + INSTANCE_ID,
        { set: [{ attribute_id: attributeId, value }] },
        DEV_TOKEN,
    );
}
```

   (import `PATCH` from `../api/api.ts` beside `PUT`; if the
   in-process helper is named differently, use the
   `handleRequest` + `apiRequest({ method: 'PATCH', … })`
   shape the nested-attributes test uses.)
3. Test at lines 380–405: call `seedInstanceReferrer(db,
   'VXTdVVRluJDRBqbXWZBntA', 'High')`; the message pin
   becomes `assertStringIncludes(err.message, 'instance(s) '
   + INSTANCE_ID)`; retitle `'an instance-head referrer
   blocks deletion with 409'`.
4. Test at lines 586–646: the same seed call; keep every
   other assertion (the batch applies nothing; pair counts
   unchanged).
5. Delete now-unused constants (`TRANSITION_EVENT_ID`,
   `FIELD_VALUE_ID`, `NODE_NEXT`, `WORK_ORDER_ID` if nothing
   else uses them) and the `formWriteMessagePair` /
   `postWorkOrderTransitionOp` imports if they go unused.

`tests/api-record-types-composed-op.test.ts:160-200` — the
same replacement (`seedInstanceReferrer(db, token,
attributeId)` PATCHing `{ set: [{ attribute_id, value:
'High' }] }` under the composed type's instances path); the
assertion at line 313 becomes
`assertMatch(err.error, /instance\(s\)/)`.

`tests/drift-phase15-cores-parity.test.ts:1544-1557` —
remove `valueCount` from `sortedReferrerShape`.

`tests/drift-records.test.ts:1340-1498` — the "VALUE-COUNT
DERIVABILITY PROOF" test: keep its seeded-flagship half as a
new test titled `'seeded flagship attributes are referenced
by the seeded instance head'` (the loop asserting
`referrers.instanceIds.includes(SEED_INSTANCE_ID)`), delete
the `stateFieldValuesFrom` tally, the `valueCount`
assertions, and the live-transition half (lines 1417–1498);
delete `transitionFieldValueCounts` and the
`stateFieldValuesFrom` import if nothing else uses them.

`tests/api-work-order-history-shapes.test.ts:458-514` —
delete Pin 5 and its import (line 27).

`tests/drift-state-field-values.test.ts:147-176` — delete
the RESTRICT test and the import (lines 19–21). The file's
history-parity tests stay; rewrite the header's "SFV census
is STORED-data truth" sentence to say RESTRICT reads
instance heads.

- [ ] **Step 2: Run them to see them fail**

Run one for each of the six files. Expected: the restrict
and composed-op tests FAIL — today the SFV leg is absent
from their seeding and the instance leg is what they now
assert (a 409 naming `instance(s)`); the other four fail
only to compile until Step 3 (the import of a soon-deleted
module is still valid, so they may pass — that is fine;
they are deletions).

- [ ] **Step 3: Delete the leg**

```bash
git rm api/derive-state-field-values.ts
```

In `api/record-attribute-refs.ts`: delete the import (lines
13–15); delete `valueCount` from `AttributeReferrers` and
from the `referrers.set` literal; delete the
`sfvReferrersByAttribute` read and `values`; `hasReferrers`
becomes `flowIds.length > 0 || workOrderIds.length > 0 ||
instanceIds.length > 0`; `describeReferrers` drops the
"state field value(s)" part and its comment reads "Order:
flows; work orders; instance(s)." Rewrite the header (lines
25–34, 46–59) and the function comment (80–99): three
legs — live flow bindings (graphDelta replay), frozen
work-order graphs (document heads), live instance heads
under the parent type. Delete every sentence about
`state_field_values`, `deriveStateFieldValueReferrers`, and
the "NAMED DEVIATION".

`ARCHITECTURE.md:191-194` — delete the paragraph "The one
named whole-plane scan is …". Rule (d) above it stands.

- [ ] **Step 4: Type-check and run the six files, then everything**

```bash
./test check
```

Run one for each of the six files. Then:

```bash
./test && ./test lint
```

Expected: green. `./test lint`'s Later-work rule reads
ARCHITECTURE.md; the deleted paragraph deferred nothing, so
it stays quiet.

- [ ] **Step 5: Commit**

```bash
git add -A api/derive-state-field-values.ts \
    api/record-attribute-refs.ts ARCHITECTURE.md \
    tests/api-work-order-history-shapes.test.ts \
    tests/drift-state-field-values.test.ts \
    tests/drift-records.test.ts \
    tests/api-record-attribute-restrict.test.ts \
    tests/api-record-types-composed-op.test.ts \
    tests/drift-phase15-cores-parity.test.ts
git commit -m "Drop the field-value leg from attribute RESTRICT" \
    -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UFx7WTb5BghBs2sn925w3w"
```

---

### Task 7: Delete `deriveWorkOrderLifecycle`

Lane E. Spec § 5. Commandments: VIII Simplicity. Abominations
risked: Test Weakening (the bulk-vs-scoped parity legs lose
their bulk side; every scoped assertion and every
row-plane/handleRequest oracle stays).

**Files:**
- Modify: `api/derive-states.ts:1279-1440` (the multi-work-
  order reader and its private replay-over-plane helper)
- Test: `tests/derive-states-work-orders.test.ts`,
  `tests/mock-data-valid.test.ts:127-141,322-330,497-520`,
  `tests/drift-phase15-cores-parity.test.ts:392-400,738-750`,
  `tests/derive-work-order-lifecycle-for.test.ts:173-180`
  (and every `bulkRowsFor` use), `tests/drift-states.test.ts:676-695`

**Interfaces:**
- Consumes: `workOrderLifecycleStatesFor(dbOrView,
  organization, workOrderId)` (`api/derive-states.ts:1539`).
- Produces: nothing new. `deriveWorkOrderLifecycle` and
  `workOrderLifecycleFromPlane` no longer exist.

- [ ] **Step 1: Re-point the tests**

`tests/derive-states-work-orders.test.ts`: every
`forWorkOrder(await deriveWorkOrderLifecycle(db),
workOrderId)` (lines 196, 286, 323, 362, 431, 512, 566)
becomes `await workOrderLifecycleStatesFor(db,
ORGANIZATION_A, workOrderId)`; line 222–223 becomes
`assertEquals(await workOrderLifecycleStatesFor(db,
ORGANIZATION_A, workOrderId), [])`. Swap the import; delete
`forWorkOrder` if unused.

`tests/mock-data-valid.test.ts`: add one helper —

```ts
// Every seeded work order's lifecycle across both seeded
// organizations, by the entity-scoped derive (the bulk fold
// is gone — spec 2026-09-15 § 5): one collection read per
// organization lists the ids, then one scoped read each.
async function seededWorkOrderLifecycle(
    db: MemoryDbAdapter,
): Promise<StateEntity[]> {
    const rows: StateEntity[] = [];
    for (const organization of [
        STARK_ORGANIZATION, ORGANIZATION_TWO,
    ]) {
        const prefix = canonicalPath(
            organization, '/work-orders/',
        );
        const heads = deriveDocumentsAt(
            await db.messagePairs.getCollectionPairs(prefix),
            prefix,
        );
        for (const workOrderId of heads.keys()) {
            rows.push(...await workOrderLifecycleStatesFor(
                db, organization, workOrderId,
            ));
        }
    }
    return rows;
}
```

— and use it at lines 131, 326, and 510 (the third site
already lists Stark's work orders for its `organizationByWo`
map; keep that list and call the helper for `states`).
Import `StateEntity` from `../api/types.ts`,
`ORGANIZATION_TWO` from `../api/mock-data/seed-constants.ts`,
`canonicalPath` from `../api/message-pair.ts`,
`deriveDocumentsAt` from `../api/derive-documents.ts`, and
`workOrderLifecycleStatesFor` from `../api/derive-states.ts`
(drop `deriveWorkOrderLifecycle`).

`tests/drift-phase15-cores-parity.test.ts:396,741`: the same
helper (copy it into that file with the same name and
imports — two files, two copies; a third would earn a
fixture).

`tests/derive-work-order-lifecycle-for.test.ts`: delete
`bulkRowsFor` (173–180) and every `assertEquals(scoped,
await bulkRowsFor(db, id))` leg; keep each test's scoped
assertions and its row-plane/handleRequest oracle; retitle
tests whose names say "matches the bulk subset". Swap the
import.

`tests/drift-states.test.ts:685-694`: `lifecycle` becomes
`await workOrderLifecycleStatesFor(db, STARK_ORGANIZATION,
seededWorkOrderId)`; keep the `> 0` assertion and
`assertHistoryParity`; delete the tautological
`derived.length === lifecycle.length`.

- [ ] **Step 2: Run them to see them fail**

Run one for each of the five files. Expected: they compile
(the old export still exists) and PASS — the red is the
`./test check` in Step 4 once the export is gone; record
that these tests were green before and after.

- [ ] **Step 3: Delete the fold and its private helper**

In `api/derive-states.ts`: delete `deriveWorkOrderLifecycle`
and its comment (lines 1420–1440). `./test check` then
names `workOrderLifecycleFromPlane` (line 1279) as unused
(`noUnusedLocals`): delete it and its comment, then any
further helper the check names as unused only because of
that deletion. Do not delete a helper that still has a
caller. Rewrite the comment above
`workOrderClaimSourcesFor` (lines 1442–1462): it is no
longer a "sibling" of anything — it is the work-order
lifecycle read.

- [ ] **Step 4: Type-check, run the five files, then everything**

```bash
./test check
```

Run one for each of the five files. Then:

```bash
./test && ./test lint
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add api/derive-states.ts tests/derive-states-work-orders.test.ts \
    tests/mock-data-valid.test.ts \
    tests/drift-phase15-cores-parity.test.ts \
    tests/derive-work-order-lifecycle-for.test.ts \
    tests/drift-states.test.ts
git commit -m "Delete the whole-ledger work-order lifecycle fold" \
    -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UFx7WTb5BghBs2sn925w3w"
```

---

### Task 8: Auth 1b — `name = jti`, the leftover prefix retired

Lane A, after Task 1. Spec § 6 and interpretation (A).
Commandments: II Security (`authorizationCodeSpent` keeps
its spend-marker name; never widen its read), III Uniformity
(id = name, like every document family), VII Idempotency
(a repeat PUT at a jti is that jti's history).
Abominations risked: Test Weakening (per-event row counts
become per-jti head counts — the spec's covenant; every
`latestActionForJti` and pair-count assertion stays),
Foreign Tongues (`:tid` was the row-plane's word; `:jti` is
the domain's).

**Files:**
- Modify: `api/derive-identity-tokens.ts` (whole file)
- Modify: `api/authentication.ts:410-437` (`issueTokenPair`),
  `:526-552` (`formTokenEventWrites`), `:1037-1055`
  (`grantClientCredentials`), `:1126-1136`
  (`IDENTITY_TOKENS_FLAT_PREFIX`), `:1208-1236`
  (`authorizationCodeSpent`), `:1305-1339` (the auth-code
  root keeps `rootId = derivedId`)
- Modify: `api/message-pair.ts:298-359` (the token event
  former), `:903` (the wired-routes entry)
- Modify: `api/routes.ts:3277-3292` (the write spec),
  `:4196-4246` (the collection GET and the document
  GET/PUT)
- Modify: `web-app/app/generate-api-documentation.ts:279`;
  regenerate `web-app/api-documentation/`
- Test: `tests/write-response-spec-shape.test.ts:138`,
  `tests/drift-identity-tokens.test.ts`,
  `tests/api-shadow-ledger-tokens.test.ts`,
  `tests/api-identity-token-rotation.test.ts:71-73`,
  `tests/api-identity-spine-verb-gaps.test.ts:844`

**Interfaces:**
- Consumes: Task 1's `deriveIdentityTokensFor`,
  `deriveIdentityTokenEventsForJti`, `rotateRefreshJti`,
  `revokeTokenChain` signatures (unchanged).
- Produces:

  ```ts
  // api/message-pair.ts — first argument is the document NAME
  export async function formTokenEventMessagePair(
      name: Id,
      event: Omit<IdentityTokenEntity, 'id'>,
      operationId: string,
  ): Promise<MessagePair>

  // api/derive-identity-tokens.ts
  export async function deriveIdentityTokensFor(
      db: DbAdapter, identityId: Id,
  ): Promise<IdentityTokenEntity[]>   // one head per document
  export async function deriveIdentityToken(
      db: DbAdapter, identityId: Id, jti: Id,
  ): Promise<IdentityTokenEntity>     // one document read
  ```

  Route pattern `identities/:id/tokens/:jti`. A PUT there
  stamps `jti` and `identity_id` from the path; a body that
  disagrees is 400. The entity `id` is the document name.

- [ ] **Step 1: Write the failing tests**

`tests/write-response-spec-shape.test.ts:138`: rename the
key to `'identities/:id/tokens/:jti'`.

`tests/drift-identity-tokens.test.ts`:

- Lines 171–188 (KEY ORDER): PUT at
  `'identities/XXZruirZyAOoRpNxaDnpSA/tokens/' + JTI_ORDER`
  with body `jti: JTI_ORDER`; derive with
  `deriveIdentityToken(db, 'XXZruirZyAOoRpNxaDnpSA',
  JTI_ORDER)`. Delete `TOK_ORDER`.
- Lines 192–224 (stored PUT = GET): the PUT path's last
  segment and `name`/`messagePairId` become `JTI_G4`; delete
  the local `id`.
- Lines 226–248: `formTokenEventMessagePair(JTI_G4_SYNTH,
  event, …)`; expected `name: JTI_G4_SYNTH, messagePairId:
  JTI_G4_SYNTH`. Delete the local `id`.
- Lines 252–272: the spec key `'identities/:id/tokens/:jti'`
  and params `['XXZruirZyAOoRpNxaDnpSA', JTI_G4]`; the
  expected body's `id` is `JTI_G4`. Delete `TOK_G4`.
- Lines 364–397 (pre-tx/in-tx parity): both PUTs go to
  `'…/tokens/' + JTI_TX` (`action: 'issued'` at `AT`, then
  `action: 'rotated'` at `AT2`); `preTx.length` becomes `1`
  and add `assertStrictEquals(preTx[0]!.action, 'rotated')`.
  Delete `TOK_TX1`, `TOK_TX2`.
- Lines 573–606 (omit-PUT stamps identity_id): PUT at
  `'…/tokens/' + JTI_OMIT`; find the row by `r.id ===
  JTI_OMIT`; the leaf GET at `'…/tokens/' + JTI_OMIT`.
  Delete the local `id`.
- Lines 608–652 (dual-reads leftover flat): delete the test,
  `JTI_FLAT`, `CHAIN_FLAT`, and any import that then goes
  unused. Add in its place:

```ts
Deno.test('a PUT whose body jti disagrees with the path is 400',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
            + JTI_W1,
        DEV_TOKEN,
        {
            jti: generateIdentifier(),
            identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'issued', chain_id: CHAIN_W, at: AT,
        },
    ));
    assertStrictEquals(res.status, 400);
});
```

`tests/api-shadow-ledger-tokens.test.ts`:

- Every `PUT '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/<x>'`
  with `tokenFields(<y>)`: make `y === x` (lines 117–135,
  137–155, 392–399, and `seededDb`'s own PUT).
- Lines 157–184 ("a second PUT to the SAME id"): the second
  body is `{ ...tokenFields(sameJti), action: 'rotated', at:
  AT2 }`; assert `domainRow.action === 'rotated'` instead of
  the jti; retitle: "… the DERIVED read is the jti's LATEST
  event (its document head)". Define `AT2` beside `AT`.
- `assertRootEventMessagePair` (443–471): unchanged — the
  event pair's `name` equals `root.id` still.

`tests/api-identity-token-rotation.test.ts:71-73`: the
comment and count become "root head 'rotated' + successor
head 'issued' = 2" and `rows.length === 2`.

`tests/api-identity-spine-verb-gaps.test.ts:844`: title
`'GET /identities/:id/tokens/:jti 404s for an absent jti'`.

- [ ] **Step 2: Run them to see them fail**

Run one for each of the five files. Expected: FAIL — the
spec key is absent; the derived id is the fresh event id,
not the jti; the second-PUT head is a separate document;
`rows.length` is 3.

- [ ] **Step 3: Name the document by its jti**

`api/message-pair.ts`:

```ts
const TOKEN_EVENT_ROUTE_PATTERN = 'identities/:id/tokens/:jti';
```

and (lines 313–359):

```ts
// Synthesizes ONE token event pair at the jti's own
// document — `name` is the jti, or, for the
// authorization_code chain root, the code's sha256 spend
// marker (api/authentication.ts authorizationCodeSpent; spec
// 2026-09-15 § 6). The SAME document, method, and response
// shape a real PUT identities/:id/tokens/:jti stores; the
// response `id` is the name (identityTokenEntityOf: GET
// wins). Formed PRE-TX — crypto, hashing, and timers never
// run inside an open transaction. requesterIdentityId is the
// event's OWN identity_id — the named convention for a write
// with no authenticated actor in view at this depth. A jti
// is an identifier, not a bearer secret.
export async function formTokenEventMessagePair(
    name: Id,
    event: Omit<IdentityTokenEntity, 'id'>,
    operationId: string,
): Promise<MessagePair> {
    const pathSegments = [
        TOKEN_EVENT_ROUTE_SEGMENTS[0]!,
        event.identity_id,
        TOKEN_EVENT_ROUTE_SEGMENTS[2]!,
        name,
    ];
    const body = event as unknown as Record<string, unknown>;
    return formWriteMessagePair({
        method: 'PUT',
        pathname: '/' + pathSegments.join('/'),
        routePattern: TOKEN_EVENT_ROUTE_PATTERN,
        routeSegments: TOKEN_EVENT_ROUTE_SEGMENTS,
        pathSegments,
        headerFields: [],
        body,
        requesterIdentityId: event.identity_id,
        requestAt: event.at,
        organization: undefined,
        responseStatus: HTTP_OK,
        responseBody: {
            ...validateIdentityTokenEntity(body),
            id: name,
        },
        operationId,
    });
}
```

Line 903: `'identities/:id/tokens/:jti'`.

`api/authentication.ts`:

- `formTokenEventWrites` (537–552): no `generateIdentifier()`;
  `formTokenEventMessagePair(event.jti, event,
  operationId)`. Rewrite its comment: "Each append's event,
  paired with its OWN event pair at the jti's document."
- `issueTokenPair` (410–437): delete `rootId`; pass
  `refreshJti` as the name.
- `grantClientCredentials` (1037–1055): delete `rootId`;
  pass `refreshJti`.
- `grantAuthorizationCode` (1305–1339): keep `rootId =
  derivedId` — the spend marker IS the name (its comment
  already says so).
- Delete `IDENTITY_TOKENS_FLAT_PREFIX` (1128–1129);
  `authorizationCodeSpent` keeps only the nested read:

```ts
export async function authorizationCodeSpent(
    dbOrView: DbAdapter,
    derivedId: Id,
    identityId: Id,
): Promise<boolean> {
    const spent = await dbOrView.messagePairs.getDocumentHistory(
        tokensEventPrefixFor(identityId), derivedId,
    );
    return spent.length > 0;
}
```

  and delete the "Dual-reads leftover" sentences from its
  comment.

`api/derive-identity-tokens.ts` — replace the file's body
below the imports with:

```ts
// The identity's tokens collection: `path =
// /identities/<id>/tokens/`, `name = <jti>` — each jti is one
// document whose history is its own issued → rotated →
// revoked (api/message-pair.ts formTokenEventMessagePair). The
// authorization_code grant's chain root is the one document
// not named by its jti: its name is the code's sha256 spend
// marker (api/authentication.ts authorizationCodeSpent). A
// collection read returns heads — one row per document, its
// latest event; every event of a jti carries the same
// chain_id, so the chain fold (readTokenChainFromLedger)
// filters heads. The derived row is id-LAST
// (validateIdentityTokenEntity's order plus `id`); `id` is
// the document name. withoutId FIRST, always. Spec
// 2026-09-15 exact-read folds § 6; nothing here reads
// /identity-tokens/.

const IDENTITY_TOKENS_TABLE = 'identity_tokens';

function tokensPrefixFor(identityId: Id): string {
    return canonicalPath(
        undefined,
        '/identities/' + identityId + '/tokens/',
    );
}

export function identityTokenEntityOf(
    document: DerivedDocument,
): IdentityTokenEntity {
    return {
        ...validateIdentityTokenEntity(withoutId(document.body)),
        id: document.name,
    };
}

// The nested document is the source of truth — fill or
// overwrite the request body's identity_id from the path.
function nestedTokenEntityOf(
    identityId: Id,
    document: DerivedDocument,
): IdentityTokenEntity {
    return identityTokenEntityOf({
        ...document,
        body: {
            ...withoutId(document.body),
            identity_id: identityId,
        },
    });
}

// One identity's collection: the head of every document
// there, id-lex.
export async function deriveIdentityTokensFor(
    db: DbAdapter,
    identityId: Id,
): Promise<IdentityTokenEntity[]> {
    const prefix = tokensPrefixFor(identityId);
    const documents = deriveDocumentsAt(
        await db.messagePairs.getCollectionPairs(prefix),
        prefix,
    );
    const rows: IdentityTokenEntity[] = [];
    for (const document of documents.values()) {
        rows.push(nestedTokenEntityOf(identityId, document));
    }
    return rows.sort(byIdAscending);
}

// One document: the jti's latest event.
export async function deriveIdentityToken(
    db: DbAdapter,
    identityId: Id,
    jti: Id,
): Promise<IdentityTokenEntity> {
    const prefix = tokensPrefixFor(identityId);
    const document = deriveDocumentsAt(
        await db.messagePairs.getDocumentHistory(prefix, jti),
        prefix,
    ).get(jti);
    if (document === undefined) {
        throw new EntityNotFoundError(IDENTITY_TOKENS_TABLE, jti);
    }
    return nestedTokenEntityOf(identityId, document);
}

// Every LIVE head naming `jti` in ONE identity's own
// collection — the by-jti fold tokenRevocationReason's
// SECOND read (isTokenRevoked) folds over. A jti that has
// never appeared in this identity's collection returns [].
export async function deriveIdentityTokenEventsForJti(
    dbOrView: DbAdapter,
    jti: string,
    identityId: Id,
): Promise<IdentityTokenEntity[]> {
    const rows = await deriveIdentityTokensFor(
        dbOrView, identityId,
    );
    return rows.filter((row) => row.jti === jti);
}
```

`api/routes.ts`:

- Line 3280: key `'identities/:id/tokens/:jti'`; the
  `successBody` body gains `jti: param(params, 1),` beside
  `identity_id: param(params, 0)`.
- Lines 4196–4246: delete the "Dual-read still sees leftover"
  sentence; route pattern `'identities/:id/tokens/:jti'`;
  in the PUT, `const jti = param(p, 1);` replaces `id`, and
  after the `identity_id` check add:

```ts
            if ('jti' in raw && raw['jti'] !== jti) {
                throw new ApiError(
                    'jti does not match path jti',
                    HTTP_BAD_REQUEST,
                );
            }
            const stamped = {
                ...raw, identity_id: identityId, jti,
            };
            const entity = identityTokenEntityOf({
                name: jti,
                messagePairId: jti,
                method: 'PUT',
                body: stamped,
            });
```

  The GET calls `deriveIdentityToken(db, param(p, 0),
  param(p, 1))` — unchanged text, new meaning.

`web-app/app/generate-api-documentation.ts:279`:
`'/identities/:id/tokens/:jti'`, then:

```bash
./bin/generate-api-documentation
```

- [ ] **Step 4: Type-check, run the five files, then everything**

```bash
./test check
```

Run one for each of the five Step 1 files. Then:

```bash
./test validate
```

Expected: green, including `api-docs` (the regenerated
tree). A red count elsewhere is a test that counted events
per jti; re-derive its expectation as heads (one per
document) and keep every `latestActionForJti` and pair-count
assertion as is.

- [ ] **Step 5: Commit**

```bash
git add api/derive-identity-tokens.ts api/authentication.ts \
    api/message-pair.ts api/routes.ts \
    web-app/app/generate-api-documentation.ts \
    web-app/api-documentation \
    tests/write-response-spec-shape.test.ts \
    tests/drift-identity-tokens.test.ts \
    tests/api-shadow-ledger-tokens.test.ts \
    tests/api-identity-token-rotation.test.ts \
    tests/api-identity-spine-verb-gaps.test.ts
git commit -m "Name each token document by its jti" \
    -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UFx7WTb5BghBs2sn925w3w"
```

---

### Task 9: Take `getAll` off the derive face and pin it

Trunk, after every lane has landed. Spec § 7 and
interpretation (B). Commandments: I Reliability (the pin
outlives the people), III Uniformity (one face for derives).
Abominations risked: Unbidden Helper Code (no new test
helper for the whole plane — the concrete store already has
it), Test Weakening (a whole-plane count in a test is an
oracle, not a smell; keep it where it is the strongest
oracle).

**Files:**
- Modify: `api/db.ts:78-112` (`EntityStore`)
- Modify: `api/db-backed.ts:45,145-151`
- Modify: `api/db-memory.ts:11-25`, `api/db-postgres.ts:10-21`
- Modify: `test:143` (after the retired-vocabulary block)
- Modify: `TODO.md:303-312`
- Test: `tests/db-transaction-view.test.ts:68,128,165` and
  whichever files `./test check` names

**Interfaces:**
- Consumes: no `messagePairs.getAll(` under `api/` (Tasks
  1–8).
- Produces: `EntityStore<T>` without `getAll`;
  `memoryDbAdapter(): BackedDbAdapter` and
  `postgresDbAdapter(…): BackedDbAdapter`, whose
  `messagePairs: HistoryEntityStore<MessagePairEntity>`
  keeps `getAll` for tests. `Tx.getAll`, both backends'
  `getAll`, `selectAll`, and the pg-explain pin stay.

- [ ] **Step 1: Prove the face is clean**

```bash
grep -rn 'messagePairs\.getAll(' api
```

Expected: no output. If there is output, a lane landed
without its fold — stop and report which.

- [ ] **Step 2: Add the lint pin (red first)**

In `test`, after the retired-vocabulary block (line 143)
and before the Later-work block:

```bash
    # Every api/ read is a collection or a document (spec
    # 2026-09-15 exact-read folds § 7): the whole-plane read
    # is not on the derive face. tests/ may still count the
    # plane through the concrete store.
    WHOLE_PLANE=$(
        grep -rn 'messagePairs\.getAll(' api || true
    )

    if [ -n "$WHOLE_PLANE" ]; then
        echo "Error: whole-plane messagePairs.getAll( in api/:" >&2
        echo "$WHOLE_PLANE" >&2
        exit 1
    fi
```

Prove the pin bites: temporarily add a line
`// db.messagePairs.getAll(` to `api/db.ts`, run
`./test lint`, see it fail naming the line, remove the line,
run `./test lint`, see it pass. Record both results.

- [ ] **Step 3: Drop `getAll` from the face; narrow the factories**

`api/db.ts:81`: delete `getAll(): Promise<T[]>;` from
`EntityStore`. Leave `Tx.getAll` (line 138).

`api/db-backed.ts`: line 45 becomes
`readonly messagePairs!: HistoryEntityStore<MessagePairEntity>;`
and `#buildStores` returns
`{ messagePairs: HistoryEntityStore<MessagePairEntity> }`
(declare that return type; `DbStores` stays the view's
type — a view never sees `getAll`). Drop `EntityStore` from
the type import if now unused.

`api/db-memory.ts:11-12`: `memoryDbAdapter(): BackedDbAdapter`
(it already `implements GuardedDbAdapter, LatencySimulation`);
keep `MemoryDbAdapter = ReturnType<typeof memoryDbAdapter>`.
Update the comment: the factory returns the class so a test
holds the concrete store. `api/db-postgres.ts:10-12`: the
same return type.

- [ ] **Step 4: Type-check; fix the views and the interface-typed holders**

```bash
./test check
```

Every error is a test reaching `getAll` through a
`DbAdapter`, `GuardedDbAdapter`, or transaction view. Fix
each by the first rule that applies:

1. The test wrote pairs at a known path → read that
   collection: `tests/db-transaction-view.test.ts:68,128,165`
   become `view.messagePairs.getCollectionPairs(
   aMessagePair.path)` (and `inner.…` at 165).
2. The holder is a local `db` that came from
   `memoryDbAdapter()` but is annotated `DbAdapter` → annotate
   it `MemoryDbAdapter` (import from `../api/db-memory.ts`).
3. A helper parameter typed `DbAdapter` that calls `getAll`
   → type the parameter `MemoryDbAdapter` if every caller
   passes one; otherwise rule 1.

Nine files may need a look (they name `DbAdapter` and call
`getAll`): `tests/mock-data-pairs.test.ts`,
`tests/db-transaction-view.test.ts`,
`tests/message-pair.test.ts`, `tests/adapters-shared.test.ts`,
`tests/api-client-registration.test.ts`,
`tests/api-operation-id.test.ts`,
`tests/api-actor-from-token.test.ts`,
`tests/schema-lifecycle.test.ts` (postgres suite; its
`adapter` is the factory's return — rule 2 or the collection
`/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/` it wrote),
`tests/api-ideas-create.test.ts`. `./test check` is the
oracle, not this list.

- [ ] **Step 5: Retire the TODO bullet**

`TODO.md:303-312`: delete the bullet "Every read is a
collection or a document …" (the six folds are gone;
`getAll` is off the face; the pin is in `./test lint`). Do
not touch the other bullets.

- [ ] **Step 6: Validate**

```bash
./test validate
```

Expected: green. If Docker is available, also:

```bash
./test postgres
```

(the postgres suite type-checks under Layer 1 either way).

- [ ] **Step 7: Commit**

```bash
git add api/db.ts api/db-backed.ts api/db-memory.ts \
    api/db-postgres.ts test TODO.md tests/
git commit -m "Take getAll off the derive face and pin it" \
    -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UFx7WTb5BghBs2sn925w3w"
```

(Review `git status` before the `tests/` add.)

---

## After the branch lands

1. `cd` to the main checkout; `git merge --ff-only
   2026-09-15-exact-read-folds`; `git worktree remove
   .worktrees/2026-09-15-exact-read-folds`; `git branch -d
   2026-09-15-exact-read-folds` (AGENTS.md § Worktrees).
2. The operator wipes and reseeds any live database (spec
   Decision 8): `./bin/postgres-wipe --postgres local` then
   `./bin/postgres-seed --postgres local --mock-data`, or
   the Render equivalents through `./deploy`.
3. The witness (spec Decision 9, not a gate): a `./bin/measure`
   run against the landed master, compared with the
   2026-09-15 local measure that opened the spec. Expect
   `boot:auth-gate` to stop tracking `readyMs` with ledger
   size.

## Spec coverage

| Spec | Task |
|---|---|
| § 1 Auth 1a; unknown → 409 / 2xx; cross-identity 403 gone | 1 |
| § 2 terminal as document PUT; `state` on head; seed | 2 |
| § 2 list, one, lifecycle reads from the document | 3 |
| § 3 PII `(path, name)`; one exception at the form | 4 |
| § 3 rows: identities collection then one document each | 5 |
| § 4 delete SFV referrers; RESTRICT via instance heads; ARCHITECTURE.md | 6 |
| § 5 delete `deriveWorkOrderLifecycle`; tests call the scoped read | 7 |
| § 6 `name = jti`; leftover retired; spend marker kept; 403 stays unknown | 8 |
| § 7 `getAll` off the face; pin under `api/`; TODO bullet | 9 |
| Error and wire table | 1 (409/2xx), 3 (409 non-pending unchanged), 4 (404 on DELETE head unchanged), 6 (409 instance heads) |
| Testing bullets | 1, 2, 3, 4, 5, 6, 7, 8, 9 as listed in each task |
| Decision 8 wipe and reseed | After the branch lands |
| Decision 9 measure as witness | After the branch lands |

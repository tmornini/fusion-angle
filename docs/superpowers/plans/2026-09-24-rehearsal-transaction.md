# Rehearsal transaction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this spec's worktree (AGENTS.md
> § Worktrees): `.worktrees/rehearsal-transaction`,
> branch `rehearsal-transaction`, cut from
> `ledger-store` at `d2ab618e` (the spec's commit; its
> code is the spec's base `2790a9a5`). The plan is a
> dependency graph: dispatch by the graph, not by the
> numbering. One worker per worktree. Do not create a
> lane worktree.

> **For the dispatching orchestrator (AGENTS.md
> § Subagents):** every subagent prompt MUST begin with
> the literal phrase `Go to Medium Church!`, then push
> down: the 78-char lint on code and scripts (not
> `.md`), 4-space indent, the `org` identifier ban
> (spell `organization`), present-tense-imperative
> ~50-char commit subjects with the trailer below, the
> commandments and abominations named under Global
> Constraints, and the codebase patterns under Context.
> Subagents work in `.worktrees/rehearsal-transaction`
> and never create their own — never pass the Agent
> tool `isolation`. Subagents never run
> `./deploy --render`, `./deploy --local`, or
> `./bin/measure`. One worker per worktree. Master owns
> 8080.

**Goal:** Run the seed's rehearsal as one transaction on
its scratch memory backend. The ops' own transactions
and reads re-enter it, so the rehearsal's statements
overlap as a transaction's do.

**Architecture:** `RehearsalBackend` gains one field,
the open handle. `rehearse` runs `ensureTable` on the
scratch, then opens one readwrite `transaction` on it.
It hands that handle to `RehearsalBackend.runOn`, which
holds it for the run and clears it in a `finally`.
While the handle is set, `read` and `transaction` run
their body on it. A bare `executeLedger` applies on it,
and so does one that re-entered it. `ensureTable`,
`seedTransaction`, and `postSchemaCreation` throw, so a
call that would queue forever on the scratch's
serializer crashes instead. The verdict, the recording,
the landing, and `MemoryStorageBackend` are unchanged.

**Tech Stack:** Deno 2.9.6, TypeScript strict under
`deno.json` (`noUncheckedIndexedAccess`,
`noUnusedLocals`, `noUnusedParameters`,
`exactOptionalPropertyTypes`, `verbatimModuleSyntax`,
`erasableSyntaxOnly`), `Deno.test` + `@std/assert`,
memory backend for Layer 1, Docker Postgres 18.6 for
`./test postgres` and the probe. No new dependencies.

**Spec:**
`docs/superpowers/specs/2026-09-24-rehearsal-transaction-design.md`.
Read it first. Every task cites its section. The seed
spec and plan (`2026-09-23-ledger-seed*`) are closed.
This spec supersedes the seed plan's Interpretation (C)
by citation. Do not rewrite them.

**Worktree:** `.worktrees/rehearsal-transaction` on
branch `rehearsal-transaction`.

---

## Global Constraints

- **Scope.** This plan ships the rehearsal as one
  scratch transaction: the open handle, re-entry of
  `read`, `transaction`, and `executeLedger`, the three
  guards, the AGENTS.md carve-out, the probe, and the
  TODO close. The one-rehearsal test harness stays
  unbuilt. So do any change to the product memory
  backend's per-statement table copy
  (`api/backend-memory.ts:144`), the intermittent
  `--parallel` failures, the Postgres landing,
  `packSeedBatches`, `depthsOf`, and the seed verb.
- **Untouched (Decision 5).** `api/backend-memory.ts`,
  `api/store-serializer.ts`, `api/db-backed.ts`,
  `api/mock-data.ts`, and `server/` stay byte for byte.
  `rehearse(scratch, run)` keeps its signature. Both
  callers (`api/mock-data.ts:409-410`, `:1216-1217`)
  stand.
- **Green.** `./test validate` is green on every commit
  that lands on `rehearsal-transaction`.
  `./test postgres` stays green: the landing is
  unchanged. A red test is a step inside a task, and
  the commit that follows the fix is green.
- **One concern per commit.** Subject ≈50 characters,
  present-tense imperative, no body beyond the trailer.
  The trailer is the committing model's own
  `Co-Authored-By` line, plus the `Claude-Session`
  line when the committing harness mandates one. This
  plan's commit carries:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

  Author remains `Tom Mornini <tmornini@me.com>`.
- **Never** move or rename a file or function and
  change its contents in the same commit.
- **Voice.** 78-character lines in `api/`, `tests/`,
  and the probe. Four-space indent. Spell
  `organization`.
- **Commandments.** I Reliability: a call that would
  hang on the serializer throws instead, and a failed
  rehearsal adopts nothing. III Uniformity: the
  verdict's messages stay byte for byte. IV Logic: the
  overlap cannot reorder a chain, because a wave holds
  no two writers of one document; a pin proves the
  failure is loud when one does. VI Immutability:
  `rehearse` returns what it returned, and the landing
  binds it unchanged. X Atomicity: the scratch's own
  `transaction`, never a simulated one. XI and XII: the
  probe and `./test` are measured at the base and the
  head.
- **Abominations.** Unbidden Helper Code: no rehearsal
  cache, no memory-backend change, no generic
  re-entrant backend, no pin the spec or the Review
  Focus does not name. Test Weakening: every standing
  pin passes unchanged; the one edit to existing test
  code is Task 2's helper, whose pairs stay byte for
  byte. Internal Defense: the only new checks are the
  spec's: no handle outside a run, and the guards
  while one is open. Nothing checks that a passed `tx`
  is the open handle. Swallowed Failures: `runOn`'s
  `finally` clears the handle and catches nothing.
  Greedy Catch: `executeLedger`'s `try` still wraps its
  one scratch call; the handle choice sits outside it.
  Default Values: the handle is chosen by
  `tx === undefined ? … : tx`, a choice between two
  real handles, never a `??` fallback. Premature
  Optimization: the product memory backend's copy is
  unmeasured and stays.
- **Sandbox.** Before any `deno` or `./test`:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
```

- **Layer 1, one file** (append `--filter "/…/"` to
  run a subset):

```bash
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write --allow-net \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    tests/FILE.test.ts
```

- **Layer 1, the gate:** `./test validate`.
- **Postgres:** `./test postgres`.

---

## Interpretations this plan fixes

The spec leaves these to the plan. Every task below is
written against them. Overrule them before dispatch if
they are wrong.

**(A) Red first is a step, not a red commit.** Each
task writes its tests and runs them. The tests the
change makes true fail, and the tests that guard what
the change must keep pass. Then the task implements,
reruns, and commits green.

**(B) The handle is set by `RehearsalBackend.runOn`.**
The spec puts the handle on `RehearsalBackend` and the
transaction in `rehearse`. A module function cannot
write a private field, so the class gains
`runOn(tx, run)`: it sets the handle, awaits `run`, and
clears the handle in `finally`. `rehearse` calls
`scratch.transaction('readwrite', (tx) =>
backend.runOn(tx, () => run(db)))`. The name follows
`clientOn(tx)` (`api/db-backed.ts:121`).

**(C) Every method that can throw for the handle is
`async`.** `read`, `transaction`, and the three guarded
methods become `async`, so their throw is a rejected
promise. `assertRejects` fails a function that throws
synchronously ("Function throws when expected to
reject"). The spec's "the guards throw before they
queue" is observed as a rejection that reaches the
caller before any serializer call is made.

**(D) The messages.** A guard throws
`<method> called during the open seed rehearsal`, for
example `ensureTable called during the open seed
rehearsal`. A call with no handle throws `seed
rehearsal is not open`. The verdict's two messages are
unchanged.

**(E) The pins take distinct names through a helper.**
The wave pin needs several ideas. `ideaPairAt(idea, …)`
carries `ideaPair`'s body with the idea as a parameter,
and `ideaPair` delegates with `IDEA`. Every existing
caller's pair is formed as before. The helper lands as
its own commit, green, before the red pins.

**(F) The replay runs by depth.** The spec's replay
re-executes the recorded statements "one by one through
the rehearsal's path". The probe runs one
`executeLedger` per recorded statement: each depth's
statements in one `Promise.all`, the depths in order,
all as `composed`, the way the landing binds them. That
is the most overlap the chains allow: no two statements
of one depth write one document. At the base each call
queues on the serializer. At the head each applies on
the open handle. The dry run below reproduced the
spec's 146 ms at the head with this shape.

**(G) The base is measured in a clone, not a
worktree.** `tests/test-cli.test.ts` needs a git
repository, so an archive extraction fails one test.
The sandbox refuses to delete a worktree's admin
directory (`.git/worktrees/<name>/config.worktree`), so
a worktree made for measuring could not be removed.
`git clone` puts its own `.git` under `$TMPDIR`, and
`rm -rf` removes it.

**(H) Stop condition.** If a standing pin goes red
after Task 2, stop and report BLOCKED with the test's
name and message. The instance-chain pins, the shape
pins, and every seeded test count here. Spec §4 reads
a red shape pin as a wave holding two writers of one
document. There the wave changes, never the pin. The
seed plan's Interpretation (F) and this spec's
Decision 8 close that decision to this plan. Do not
edit a wave, a pin, or seed data.

**(I) The oracle is reported, not chased.** Task 7
records the numbers, whatever they are. If the memory
seed is over the base's 692 ms, the TODO text says so
plainly. Do not tune the seed, the backend, or the
probe to meet it.

**(J) The dry run.** Before this plan was committed,
its code ran on a scratch copy of `2790a9a5`: a
`git archive` under `$TMPDIR` for the tests, and a
`git clone` for the probe's base figures. Witnessed
there:

- The expected red and green of Tasks 2 and 3, step
  for step. After Task 3, 71 pins passed across
  `tests/ledger-seed.test.ts`,
  `tests/mock-data-instance-chain.test.ts`, and
  `tests/mock-data-pairs.test.ts`.
- `./test` on the archive copy: 3,708 passed, 1
  failed. The failure was `tests/test-cli.test.ts` for
  want of `.git`, the reason for (G).
- The probe, as a preview, not the record: replay
  1,091 ms at the base against 145 ms at the head, a
  rehearsal 1,314 ms against 708–719 ms, and a memory
  seed 1,447 ms against 833–837 ms. The Postgres seed
  ran only at the head: 876 ms.
- The preview puts the memory seed over the 692 ms
  oracle. Task 7's numbers decide.

---

## File structure

| File | Responsibility |
|---|---|
| `api/ledger-seed.ts` | `RehearsalBackend`'s open handle, re-entry, and guards; `rehearse` opens the transaction |
| `tests/ledger-seed.test.ts` | The helper, three spec pins, three Review Focus pins |
| `AGENTS.md` | The carve-out sentence |
| `measurements/probes/seed/rehearsal.ts` (new) | The oracle's figures |
| `measurements/probes/README.md` | Names the probe |
| `TODO.md` | The serialization bullet leaves; the numbers land |

`api/ledger-seed.ts` gains no import. The probe imports
only APIs that exist at `2790a9a5`.

---

## Context an implementer must know

- `MemoryStorageBackend.executeLedger`
  (`api/backend-memory.ts:130-151`) has two paths. If
  `tx?.ledgerBuffer?.()` is set, it applies on that
  buffer at once (`#apply`). With no `tx`, it takes the
  serializer, copies the whole table, applies, and
  adopts the copy. A `bufferTx(buffer, mode)` handle
  (`api/backend-buffer-tx.ts:231-233`) supplies
  `ledgerBuffer` in either mode.
- `MemoryStorageBackend.transaction`
  (`api/backend-memory.ts:82-95`) holds the serializer
  for its whole body. It copies the table, runs `fn` on
  `bufferTx(copy, mode)`, and adopts the copy only when
  `fn` resolves. `seedTransaction`, a bare
  `executeLedger`, and `ensureTable` on a table with no
  root all take the same serializer. Called inside the
  open transaction, each waits forever. `read`
  (`:72-80`) takes no serializer: it serves the
  committed rows, which during the run are the root
  alone.
- `runWrite` (`api/message-pair.ts:789`) calls
  `runLedgerStatement`, which calls
  `adapter.executeLedger(attempt, rows, now)` with no
  `tx`. A view from `clientOn(tx)` passes its `tx`
  (`api/db-backed.ts:183-184`). `BackedDbAdapter` passes
  both to `backend.executeLedger(attempt, rows, now,
  tx)`. That is where `RehearsalBackend` chooses the
  handle and records.
- `backendRunner` (`api/db.ts:212-217`) sends a
  `readonly` store op to `backend.read` and a
  `readwrite` one to `backend.transaction`.
  `readTransaction` calls
  `backend.transaction('readonly', …)`
  (`api/db-backed.ts:159-166`). `ambientRunner(tx)`
  ignores the mode (`api/db.ts:222-223`), and
  `RehearsalBackend.transaction` does the same one level
  down.
- `postInstanceCreateOp` opens
  `backed.backend.transaction('readwrite', …)` and
  writes through `backed.clientOn(tx)`
  (`api/routes.ts:3880-3883`). That is the op whose
  transaction must re-enter.
- `classifyStatement` (`shared/ledger-statement.ts:98`)
  runs synchronously up to its first per-row hash
  `await`. `#apply` computes `headsOf(buffer)` before
  that call. So writes started in one `Promise.all` all
  classify against the heads as they stood at the
  start. The first to resume pushes its rows. A second
  writer of the same document then finds the
  succession key claimed and throws
  `SuccessionConflict` (`api/backend-memory.ts:209-221`),
  which the verdict turns into `seed statement returned
  refused`.
- `refuseNextSuccessions(n)` counts down in `#apply` on
  both paths. `ensureTable` returns early when the root
  exists, so it consumes nothing: the standing pin
  `a refused row fails the rehearsal` prepares the
  scratch, sets the count, and the op's write takes it.
- `noUnusedParameters` is on: the re-entered
  `transaction` spells its mode `_mode`, as
  `ambientRunner` does.
- `tests/ledger-seed.test.ts` defines `NIL`, `fresh`,
  `ORGANIZATION`, `IDEA`, `ideaPair`, and `write`
  before the rehearsal pins. The new pins use only
  names the file already imports. Insert them after
  `a refused row fails the rehearsal`, before
  `function adapterOver`.
- A missed re-entry, or a guard that delegates, hangs
  on the serializer. If a run stops making progress,
  check re-entry first.

---

## Review Focus

These five conditions could bite a person using the
seed, and no spec pin exercises them. Each line names
where it is exercised.

1. **Two writers of one document in one wave.** A seed
   author adds a wave that writes one document twice.
   Expected (spec §4): the rehearsal fails loudly with
   `seed statement returned refused`. It must not land
   both on one predecessor, and it must not hang.
   Task 2, `two writers of one document in a wave fail
   the seed`. Red at the base, where both land
   serialized.
2. **A standalone read after a write inside the run.**
   A handler reads the head it just wrote, the way the
   instance chain reads `deriveInstanceHead`. Expected
   (Decision 2): the read sees the run's uncommitted
   write. Task 2, `a read inside the rehearsal sees the
   run's writes`. Green at the base; it guards
   re-entry.
3. **A run that throws after it wrote.** Say a handler
   refuses a seeded input (the seed plan's (I)).
   Expected (## Error and wire): `rehearse` rejects
   with the run's own message, and the scratch adopts
   nothing. Task 2, `a failed rehearsal adopts nothing
   on its scratch`. Red at the base, where the write
   committed.
4. **A readonly request that writes inside the run.**
   Expected (Decision 2): the rehearsal accepts it,
   because the readonly request joins the readwrite
   handle. The live path refuses it. Checked, not
   pinned: the spec accepts the divergence, and the
   live path's own pins hold the mode.
5. **The Postgres seed.** It rehearses on memory and
   lands on Postgres (Found 5). Expected: the landing
   is byte for byte, and the rehearsal is faster.
   Task 6 runs `./test postgres`. Task 7's probe
   records `postgresSeedMs`.

---

## Dependency graph

```mermaid
graph TD
    T1[T1 plan] --> T2[T2 one scratch transaction]
    T2 --> T3[T3 guards]
    T2 --> T4[T4 AGENTS carve-out]
    T1 --> T5[T5 probe]
    T3 --> T6[T6 gate]
    T4 --> T6
    T5 --> T6
    T6 --> T7[T7 measure, close the bullet]
```

| Task | Depends on | Layer | Outcome |
|---|---|---|---|
| T1 plan | — | doc | this file |
| T2 one scratch transaction | T1 | 1 | open handle, re-entry, six pins |
| T3 guards | T2 | 1 | three calls throw mid-run |
| T4 AGENTS carve-out | T2 | doc | Decision 6 |
| T5 probe | T1 | probe | the oracle's instrument |
| T6 gate | T3, T4, T5 | 1 + pg | green, untouched files |
| T7 measure, close | T6 | probe + doc | numbers in TODO |

**Landing order** on `rehearsal-transaction`: T1
through T7 in numeric order, which respects every edge.
T4 may land any time after T2. T5 may land any time
after T1. T7 is the last commit (Decision 7). A single
worker's serial order is the numeric order.

**Shared files:**

| File | Tasks |
|---|---|
| `api/ledger-seed.ts` | T2, T3 |
| `tests/ledger-seed.test.ts` | T2, T3 |

---

### Task 1: Commit this plan

**Files:**
- Create: `docs/superpowers/plans/2026-09-24-rehearsal-transaction.md`

- [x] **Step 1: Commit**

```bash
git add docs/superpowers/plans/2026-09-24-rehearsal-transaction.md
git commit -m "Plan the rehearsal transaction as a graph"
```

Expected: one commit on `rehearsal-transaction`,
parent `d2ab618e`.

---

### Task 2: Rehearse the seed in one scratch transaction

**Spec:** Decisions 1, 2, and 4; ## Sequence; §1, §2,
and §4; ## Error and wire; ## Testing (the first two
new pins); ## Docs (the `api/ledger-seed.ts` comment
blocks). Review Focus 1–3.

**Files:**
- Modify: `tests/ledger-seed.test.ts` (the `ideaPair`
  helper at `:276-304`; five pins after `:363`)
- Modify: `api/ledger-seed.ts:140-244`
  (`RehearsalBackend`, `rehearse`)

**Interfaces:**
- Consumes: `rehearse(scratch, run)`, `depthsOf`,
  `postSeedLanding`, `MemoryStorageBackend`,
  `BackedDbAdapter.clientOn(tx)`, and
  `BackedDbAdapter.backend`, all as on the base.
- Produces: `RehearsalBackend.runOn(tx: Tx, run: () =>
  Promise<void>): Promise<void>`, the private field
  `#open: Tx | undefined`, and the private method
  `#handle(): Tx`, which throws `seed rehearsal is not
  open`. Task 3 reads `#open`. The test helper
  `ideaPairAt(idea: string, method: 'PUT' | 'DELETE',
  title: string, genesis: boolean):
  Promise<MessagePair>`.

- [ ] **Step 1: Name the idea in the pair helper**

In `tests/ledger-seed.test.ts`, replace `ideaPair`
(`:276-304`) with:

```ts
function ideaPair(
    method: 'PUT' | 'DELETE',
    title: string,
    genesis: boolean,
): Promise<MessagePair> {
    return ideaPairAt(IDEA, method, title, genesis);
}

function ideaPairAt(
    idea: string,
    method: 'PUT' | 'DELETE',
    title: string,
    genesis: boolean,
): Promise<MessagePair> {
    const operationId = generateIdentifier();
    const body = method === 'DELETE' ? undefined : { title };
    return formWriteMessagePair({
        method,
        pathname: '/organizations/' + ORGANIZATION
            + '/ideas/' + idea,
        routePattern: 'organizations/:id/ideas/:id',
        routeSegments: [
            'organizations', ':id', 'ideas', ':id',
        ],
        pathSegments: [
            'organizations', ORGANIZATION, 'ideas', idea,
        ],
        headerFields: [],
        body,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: '2026-09-23T00:00:00.000000Z',
        organization: ORGANIZATION,
        responseBody: body,
        operationId,
        requestId: operationId,
        ...(genesis ? { genesis: true as const } : {}),
    });
}
```

- [ ] **Step 2: Run the file, then the gate, and
  commit the helper**

Run the one-file command on `tests/ledger-seed.test.ts`.
Expected: `ok | 28 passed | 0 failed`. Then
`./test validate`: green.

```bash
git add tests/ledger-seed.test.ts
git commit -m "Name the idea in the seed test's pair helper"
```

- [ ] **Step 3: Write the pins**

Insert after the test `a refused row fails the
rehearsal`, before `function adapterOver`:

```ts
Deno.test(
    'a wave of concurrent writes records each predecessor',
    async () => {
        const ideas = [fresh(), fresh(), fresh()];
        const geneses = await Promise.all(ideas.map(
            (idea) => ideaPairAt(idea, 'PUT', 'Fresh', true),
        ));
        const successors = await Promise.all(ideas.map(
            (idea) => ideaPairAt(idea, 'PUT', 'Again', false),
        ));
        const statements = await rehearse(
            new MemoryStorageBackend(),
            async (db) => {
                await Promise.all(
                    geneses.map((pair) => write(db, pair)),
                );
                await Promise.all(
                    successors.map((pair) => write(db, pair)),
                );
            },
        );
        const depths = depthsOf(statements);
        const recorded = new Map(statements.map(
            (statement, index) => [
                statement.rows[0]!.id,
                {
                    supersedes: statement.supersedes[0],
                    depth: depths[index],
                },
            ],
        ));
        assertStrictEquals(statements.length, 6);
        assertStrictEquals(recorded.size, 6);
        geneses.forEach((genesis, index) => {
            assertEquals(
                recorded.get(genesis.id),
                { supersedes: NIL, depth: 1 },
            );
            assertEquals(
                recorded.get(successors[index]!.id),
                { supersedes: genesis.id, depth: 2 },
            );
        });
        const backend = new MemoryStorageBackend();
        await postSeedLanding(
            backend, { seedRunId: fresh(), statements },
        );
        assertStrictEquals(backend.statementExecutions(), 2);
    },
);

Deno.test(
    'a write inside an op\'s own transaction is recorded',
    async () => {
        const pair = await ideaPair('PUT', 'Fresh', true);
        const statements = await rehearse(
            new MemoryStorageBackend(),
            (db) => db.backend.transaction(
                'readwrite',
                (tx) => write(db.clientOn(tx), pair),
            ),
        );
        assertEquals(
            statements.map((s) => s.rows.map((r) => r.id)),
            [[pair.id]],
        );
    },
);

Deno.test(
    'a read inside the rehearsal sees the run\'s writes',
    async () => {
        const pair = await ideaPair('PUT', 'Fresh', true);
        await rehearse(
            new MemoryStorageBackend(),
            async (db) => {
                await write(db, pair);
                const head = await db.messagePairs.getHeadPair(
                    '/organizations/' + ORGANIZATION
                        + '/ideas/',
                    IDEA,
                );
                assertStrictEquals(head?.id, pair.id);
            },
        );
    },
);

Deno.test(
    'two writers of one document in a wave fail the seed',
    async () => {
        const first = await ideaPair('PUT', 'Fresh', true);
        const second = await ideaPair('PUT', 'Again', false);
        await assertRejects(
            () => rehearse(
                new MemoryStorageBackend(),
                async (db) => {
                    await Promise.all([
                        write(db, first),
                        write(db, second),
                    ]);
                },
            ),
            Error,
            'seed statement returned refused',
        );
    },
);

Deno.test(
    'a failed rehearsal adopts nothing on its scratch',
    async () => {
        const scratch = new MemoryStorageBackend();
        const pair = await ideaPair('PUT', 'Fresh', true);
        await assertRejects(
            () => rehearse(scratch, async (db) => {
                await write(db, pair);
                throw new Error('stop the rehearsal');
            }),
            Error,
            'stop the rehearsal',
        );
        assertStrictEquals(
            (await scratch.read((tx) => tx.getAll())).length,
            1,
        );
    },
);
```

The first two are the spec's new pins. The last three
are Review Focus 2, 1, and 3.

- [ ] **Step 4: Run the file and watch two fail**

Run the one-file command on `tests/ledger-seed.test.ts`.
Expected: `FAILED | 31 passed | 2 failed`:

- `two writers of one document in a wave fail the
  seed`: `AssertionError: Expected function to
  reject.` The base serializes the two writes, and
  both land.
- `a failed rehearsal adopts nothing on its scratch`:
  `AssertionError: Values are not strictly equal`
  (actual 2, expected 1). The base commits the write
  before the throw.

The other three new pins pass on the base. They guard
what Step 5 must keep: the re-entered transaction, the
re-entered read, and a wave's predecessors.

- [ ] **Step 5: Hold the rehearsal in one transaction**

In `api/ledger-seed.ts`, replace the comment block, the
class head, and `read` and `transaction`
(`:140-166`) with:

```ts
// Records what the seed's live ops write. The run holds
// one transaction open on the scratch, which nothing else
// uses: the ops' own transactions and reads re-enter it,
// and a bare statement applies on it, so the statements
// overlap as a transaction's do. It keeps openClient's
// verdict beneath the adapter: a matched, stale, or
// refused row fails the seed. A conflict must not reach
// runWrite, which would retry and answer refused.
export class RehearsalBackend implements StorageBackend {
    readonly #scratch: StorageBackend;
    readonly #statements: RehearsedStatement[] = [];
    #open: Tx | undefined;

    constructor(scratch: StorageBackend) {
        this.#scratch = scratch;
        this.#open = undefined;
    }

    statements(): readonly RehearsedStatement[] {
        return this.#statements;
    }

    // Hold `tx`, the scratch's one open transaction, for
    // `run`. Cleared in finally, so no handle outlives it.
    async runOn(
        tx: Tx,
        run: () => Promise<void>,
    ): Promise<void> {
        this.#open = tx;
        try {
            await run();
        } finally {
            this.#open = undefined;
        }
    }

    // The ops' reads and transactions re-enter the open
    // handle, as a nested readTransaction re-enters the
    // open client. A readonly request joins the readwrite
    // handle: the live path enforces the mode, and the
    // rehearsal does not.
    async read<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
        return fn(this.#handle());
    }

    async transaction<R>(
        _mode: TxMode,
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        return fn(this.#handle());
    }
```

`seedTransaction` and `ensureTable` stay as they are.
Replace the head of `executeLedger`, from its
signature through the scratch call (`:178-188`), with:

```ts
    // An op inside its own transaction passes the handle
    // it re-entered; a bare statement takes the open one.
    async executeLedger(
        attempt: Attempt,
        rows: readonly StatementBind[],
        now: string | undefined,
        tx: Tx | undefined,
    ): Promise<StatementAnswer[]> {
        const handle = tx === undefined ? this.#handle() : tx;
        let answers: StatementAnswer[];
        try {
            answers = await this.#scratch.executeLedger(
                attempt, rows, now, handle,
            );
```

The `catch`, the verdict loop, and the recording stay
byte for byte. `hasSchema`, `postSchemaCreation`, and
`deleteSchema` stay. Add the handle after
`deleteSchema`, as the class's last member:

```ts
    // Nothing reaches the scratch's rows outside a run.
    #handle(): Tx {
        if (this.#open === undefined) {
            throw new Error('seed rehearsal is not open');
        }
        return this.#open;
    }
}
```

Replace `rehearse` and its comment (`:227-244`) with:

```ts
// Run the seed's live ops in one transaction on a scratch
// backend and return every statement they executed, in
// order. The scratch root is the scratch's own statement,
// not the seed's, and lands before the transaction copies
// the table.
export async function rehearse(
    scratch: StorageBackend,
    run: (db: BackedDbAdapter) => Promise<void>,
): Promise<readonly RehearsedStatement[]> {
    const backend = new RehearsalBackend(scratch);
    const db = new BackedDbAdapter(
        backend,
        async () => {},
        async () => {},
        () => {},
    );
    await db.ensureTable();
    await scratch.transaction(
        'readwrite',
        (tx) => backend.runOn(tx, () => run(db)),
    );
    return backend.statements();
}
```

- [ ] **Step 6: Run the file, then the standing pins**

Run the one-file command on `tests/ledger-seed.test.ts`.
Expected: `ok | 33 passed | 0 failed`. Then run it on
the three seed files together:

```bash
... tests/ledger-seed.test.ts \
    tests/mock-data-instance-chain.test.ts \
    tests/mock-data-pairs.test.ts
```

Expected: `ok | 70 passed | 0 failed`. A red standing
pin is (H): stop and report BLOCKED.

- [ ] **Step 7: Gate and commit**

`./test validate`: green. Then:

```bash
git add api/ledger-seed.ts tests/ledger-seed.test.ts
git commit -m "Rehearse the seed in one scratch transaction"
```

---

### Task 3: Refuse the scratch's schema calls mid-rehearsal

**Spec:** Decision 3; §3; ## Error and wire ("The
guards throw before they queue"); ## Testing (the third
new pin); Found 3.

**Files:**
- Modify: `tests/ledger-seed.test.ts` (one pin after
  Task 2's)
- Modify: `api/ledger-seed.ts` (`seedTransaction`,
  `ensureTable`, `postSchemaCreation`; one private
  method)

**Interfaces:**
- Consumes: `#open` from Task 2.
- Produces: the private method
  `#refuseWhileOpen(method: string): void`, and the
  message `<method> called during the open seed
  rehearsal`.

- [ ] **Step 1: Write the pin**

Insert after `a failed rehearsal adopts nothing on its
scratch`:

```ts
Deno.test(
    'the scratch\'s schema calls are refused mid-rehearsal',
    async () => {
        const statements = await rehearse(
            new MemoryStorageBackend(),
            async (db) => {
                await assertRejects(
                    () => db.backend.ensureTable(),
                    Error,
                    'ensureTable called during the open seed'
                        + ' rehearsal',
                );
                await assertRejects(
                    () => db.backend.seedTransaction(
                        async () => {},
                    ),
                    Error,
                    'seedTransaction called during the open'
                        + ' seed rehearsal',
                );
                await assertRejects(
                    () => db.backend.postSchemaCreation(),
                    Error,
                    'postSchemaCreation called during the open'
                        + ' seed rehearsal',
                );
            },
        );
        assertStrictEquals(statements.length, 0);
    },
);
```

- [ ] **Step 2: Run the file and watch it fail**

Run the one-file command on `tests/ledger-seed.test.ts`.
Expected: `FAILED | 33 passed | 1 failed`. The new pin
fails with `AssertionError: Expected function to
reject.` at its first `assertRejects`: the scratch
already holds its root, so `ensureTable` resolves. The
first failure ends the run, so `seedTransaction`, which
would hang, is never called.

- [ ] **Step 3: Guard the three calls**

In `api/ledger-seed.ts`, replace `seedTransaction` and
`ensureTable` with:

```ts
    async seedTransaction<R>(
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        this.#refuseWhileOpen('seedTransaction');
        return this.#scratch.seedTransaction(fn);
    }

    async ensureTable(): Promise<void> {
        this.#refuseWhileOpen('ensureTable');
        return this.#scratch.ensureTable();
    }
```

Replace `postSchemaCreation` with:

```ts
    async postSchemaCreation(): Promise<void> {
        this.#refuseWhileOpen('postSchemaCreation');
        return this.#scratch.postSchemaCreation();
    }
```

Add, directly before `#handle`:

```ts
    // Each of the three takes the scratch's serializer,
    // which the open run holds until it ends: a crash in
    // place of a hang.
    #refuseWhileOpen(method: string): void {
        if (this.#open !== undefined) {
            throw new Error(
                method + ' called during the open seed'
                    + ' rehearsal',
            );
        }
    }
```

`hasSchema` and `deleteSchema` keep delegating: they
touch no serializer. `rehearse`'s own `db.ensureTable()`
runs before `runOn` sets the handle, so it delegates.

- [ ] **Step 4: Run the file and the standing pins**

Run the one-file command on `tests/ledger-seed.test.ts`.
Expected: `ok | 34 passed | 0 failed`. Then the three
seed files together, as in Task 2 Step 6. Expected:
`ok | 71 passed | 0 failed`.

- [ ] **Step 5: Gate and commit**

`./test validate`: green. Then:

```bash
git add api/ledger-seed.ts tests/ledger-seed.test.ts
git commit -m "Refuse the scratch's schema calls mid-rehearsal"
```

---

### Task 4: Carve the seed rehearsal out of the row-ops rule

**Spec:** Decision 6; ## Docs.

**Files:**
- Modify: `AGENTS.md:390-397`

- [ ] **Step 1: Insert the sentence**

In `### Transaction bodies await only row ops`, insert
four lines after `fine. Nested \`view.transaction\`
re-enters the same tx.`, so the paragraph reads:

```
Every `transaction(…)` body awaits ONLY row ops —
validators, crypto, hash, `serializeWire`, and scrypt
run OUTSIDE the tx. Sync compute between row ops is
fine. Nested `view.transaction` re-enters the same tx.
The seed's rehearsal is the one exception: it holds a
transaction on its scratch memory backend for its
whole run, on an instance nothing else uses, so the
ops' validators and hashes run inside it.
A transaction holds its pooled connection and its
advisory locks for its whole body; the memory backend
serializes whole transactions, so a long body stalls
every other op.
```

Every other line stays byte for byte.

- [ ] **Step 2: Gate and commit**

`./test validate`: green. It does not lint `.md`, but
the gate runs on every commit. Then:

```bash
git add AGENTS.md
git commit -m "Carve the seed rehearsal out of the row-ops rule"
```

---

### Task 5: Commit the rehearsal transaction probe

**Spec:** Decision 7 (the committed probe);
## Measurement; ## Docs (`measurements/probes/README.md`);
Found 6 (a probe beside `landing.ts`, which stays byte
for byte).

**Files:**
- Create: `measurements/probes/seed/rehearsal.ts`
- Modify: `measurements/probes/README.md:100-120`

**Interfaces:**
- Consumes: `rehearseMockData`, `postMockDataLoad`,
  `rehearse`, `depthsOf`, `memoryDbAdapter`,
  `MemoryStorageBackend`, `BackedDbAdapter`,
  `PostgresBackend`, `connectPostgres`,
  `STATEMENT_TIMEOUT_MS`, and `testHashPassword`, all
  present at `2790a9a5`.
- Produces: one JSON object on stdout: `statements`,
  `deepest`, `replayMs`, `rehearsalMs`, `memorySeedMs`,
  and, with `FA_PROBE_POSTGRES_URL` set,
  `postgresSeedMs`.

- [ ] **Step 1: Write the probe**

```ts
// The rehearsal transaction spec's figures, medians in ms.
// `replayMs` re-executes the rehearsal's recorded
// statements through a fresh rehearsal, one executeLedger
// each: a depth's statements at once, the depths in order.
// `rehearsalMs` is rehearseMockData alone, and
// `memorySeedMs` is postMockDataLoad on a fresh memory
// adapter, both with the test hasher. With
// FA_PROBE_POSTGRES_URL set, `postgresSeedMs` is
// postMockDataLoad on a Postgres adapter, the public schema
// dropped and re-created before each run. The probe calls
// no API the spec adds, so it runs at the base and the head
// alike.
import { memoryDbAdapter } from '../../../api/db-memory.ts';
import { MemoryStorageBackend } from
    '../../../api/backend-memory.ts';
import { BackedDbAdapter } from '../../../api/db-backed.ts';
import { PostgresBackend } from
    '../../../api/backend-postgres.ts';
import { connectPostgres } from
    '../../../api/postgres-client.ts';
import {
    depthsOf,
    rehearse,
} from '../../../api/ledger-seed.ts';
import {
    postMockDataLoad,
    rehearseMockData,
} from '../../../api/mock-data.ts';
import { STATEMENT_TIMEOUT_MS } from
    '../../../server/postgres-gate.ts';
import { testHashPassword } from
    '../../../tests/mock-seed.ts';

const RUNS = 7;
const POSTGRES_RUNS = 3;
const ACQUIRE_TIMEOUT_MS = 5000;
const options = { hashPassword: testHashPassword };

async function timedMs(
    run: () => Promise<unknown>,
): Promise<number> {
    const started = performance.now();
    await run();
    return performance.now() - started;
}

async function medianMs(
    runs: number,
    measure: () => Promise<number>,
): Promise<number> {
    const times: number[] = [];
    for (let run = 0; run < runs; run++) {
        times.push(await measure());
    }
    times.sort((a, b) => a - b);
    return Math.round(times[Math.floor(runs / 2)]!);
}

const { rehearsal } = await rehearseMockData(options);
const statements = rehearsal.statements;
const depths = depthsOf(statements);
const deepest = Math.max(...depths);

function replay(): Promise<unknown> {
    return rehearse(new MemoryStorageBackend(), async (db) => {
        for (let depth = 1; depth <= deepest; depth++) {
            await Promise.all(statements
                .filter((_, index) => depths[index] === depth)
                .map((statement) => db.executeLedger(
                    'composed', statement.rows,
                )));
        }
    });
}

const figures: Record<string, number> = {
    statements: statements.length,
    deepest,
    replayMs: await medianMs(RUNS, () => timedMs(replay)),
    rehearsalMs: await medianMs(RUNS, () =>
        timedMs(() => rehearseMockData(options))),
    memorySeedMs: await medianMs(RUNS, () =>
        timedMs(() => postMockDataLoad(
            memoryDbAdapter(), options,
        ))),
};

const url = Deno.env.get('FA_PROBE_POSTGRES_URL');
if (url !== undefined) {
    const sql = connectPostgres(url, {
        statementTimeoutMs: STATEMENT_TIMEOUT_MS,
        acquireTimeoutMs: ACQUIRE_TIMEOUT_MS,
    });
    const adapter = new BackedDbAdapter(
        new PostgresBackend(sql),
        async () => {},
        async () => {},
        () => {},
    );
    try {
        figures['postgresSeedMs'] = await medianMs(
            POSTGRES_RUNS,
            async () => {
                await sql.unsafe(
                    'DROP SCHEMA public CASCADE;'
                        + ' CREATE SCHEMA public;',
                );
                return timedMs(
                    () => postMockDataLoad(adapter, options),
                );
            },
        );
    } finally {
        await sql.end();
    }
}

console.log(JSON.stringify(figures, null, 1));
```

- [ ] **Step 2: Check and run it**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
deno check --frozen measurements/probes/seed/rehearsal.ts
env -u FA_PROBE_POSTGRES_URL deno run --frozen \
    --allow-env --allow-read --allow-net \
    measurements/probes/seed/rehearsal.ts
```

Expected: `Check` with no error, then one JSON object
with `"statements": 1416` and `"deepest": 3`, and no
`postgresSeedMs`. These are not the record. Task 7
takes the record.

- [ ] **Step 3: Name the probe in the README**

In `measurements/probes/README.md`, change the section
head and its first paragraph (`:100-106`) to:

```
## seed/ (2026-09-23, 2026-09-24)

Item 0's seed figures, and the rehearsal transaction's.
Run from the repository root. `landing.ts`, and
`rehearsal.ts` for its Postgres figure, also need
Postgres 18.6 in a container named `fa-seed-probe`,
database `probe`, tmpfs on `/var/lib/postgresql`, the
compose shape, on host port 55433, named by
`FA_PROBE_POSTGRES_URL`.
```

After the `repoint.ts` bullet, add:

```
- `rehearsal.ts` — the rehearsal transaction spec's
  figures, run at its base and its head: the
  rehearsal's recorded statements replayed through a
  fresh rehearsal by depth, the rehearsal alone, and a
  memory seed, medians of seven; with
  `FA_PROBE_POSTGRES_URL`, a Postgres seed on a fresh
  public schema, medians of three.
```

- [ ] **Step 4: Gate and commit**

`./test validate`: green. It neither lints nor checks
`measurements/`. Then:

```bash
git add measurements/probes/seed/rehearsal.ts \
    measurements/probes/README.md
git commit -m "Commit the rehearsal transaction probe"
```

---

### Task 6: Gate

**Spec:** ## Testing ("`./test postgres` is unchanged
… and stays green"); Decision 5; Decision 8.

- [ ] **Step 1: Layer 1**

`./test validate`. Expected: green, or `already
validated <sha>` on the clean head Task 5 stamped.

- [ ] **Step 2: Postgres**

`./test postgres`. Expected: green. The landing is
byte for byte, and the rehearsal it lands is the one
the memory pins passed.

- [ ] **Step 3: The untouched files**

```bash
git diff --stat d2ab618e -- api/backend-memory.ts \
    api/store-serializer.ts api/db-backed.ts \
    api/mock-data.ts server/ \
    measurements/probes/seed/landing.ts
```

Expected: no output.

No commit.

---

### Task 7: Measure and close the serialization bullet

**Spec:** Decision 7; ## Measurement; ## Docs
(`TODO.md`); Found 4.

**Files:**
- Modify: `TODO.md:2811-2834` (removed),
  `TODO.md:2871-2874` (replaced)

- [ ] **Step 1: Grep for a stale comment (Found 4)**

```bash
grep -rn -i "opens no\|no transaction" api server tests
```

Expected: exactly five lines, all `opens no nested
transaction` on derives: `api/derive-flows.ts:394`,
`api/derive-invitations.ts:73`, and
`api/derive-states.ts:966`, `:1349`, `:1430`. None
speaks of the rehearsal. A sixth line that says the
rehearsal opens no transaction is fixed in its own
commit before Step 7, with the subject `Correct the
comment the rehearsal outdated`.

- [ ] **Step 2: Start the probe's Postgres**

```bash
docker run -d --rm --name fa-seed-probe \
    -e POSTGRES_USER=probe -e POSTGRES_PASSWORD=probe \
    -e POSTGRES_DB=probe \
    --tmpfs /var/lib/postgresql \
    -p 127.0.0.1:55433:5432 \
    --health-cmd 'pg_isready -h 127.0.0.1 -U probe -d probe' \
    --health-interval 1s \
    postgres:18
until [ "$(docker inspect -f '{{.State.Health.Status}}' \
    fa-seed-probe)" = healthy ]; do :; done
export FA_PROBE_POSTGRES_URL=postgres://probe:probe@127.0.0.1:55433/probe
```

`postgres:18` is the compose image, 18.6 today (check
with `docker image inspect postgres:18`). The probe
drops and re-creates the public schema itself.

- [ ] **Step 3: Clone the base (G)**

```bash
BASE="$TMPDIR/rehearsal-base"
git clone --quiet --no-checkout \
    "$(git rev-parse --path-format=absolute --git-common-dir)" \
    "$BASE"
git -C "$BASE" checkout --quiet 2790a9a5
cp measurements/probes/seed/rehearsal.ts \
    "$BASE/measurements/probes/seed/"
```

- [ ] **Step 4: Run the probe at the base and the head**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
(cd "$BASE" && deno run --frozen \
    --allow-env --allow-read --allow-net \
    measurements/probes/seed/rehearsal.ts)
deno run --frozen --allow-env --allow-read --allow-net \
    measurements/probes/seed/rehearsal.ts
```

Record both objects. The slots in Step 6 take their
values from here:

| Slot | Figure |
|---|---|
| `‹R0›`, `‹R1›` | `replayMs`, base then head |
| `‹H0›`, `‹H1›` | `rehearsalMs`, base then head |
| `‹M0›`, `‹M1›` | `memorySeedMs`, base then head |
| `‹P0›`, `‹P1›` | `postgresSeedMs`, base then head |

Then stop the container: `docker stop fa-seed-probe`.

- [ ] **Step 5: Time `./test` at the base and the head**

Three runs each, the seed cycle's protocol:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
for run in 1 2 3; do
    (cd "$BASE" && /usr/bin/time -p \
        -o "$TMPDIR/base-$run.time" \
        ./test > "$TMPDIR/base-$run.log" 2>&1)
    echo "base $run: exit $?"
done
for run in 1 2 3; do
    /usr/bin/time -p -o "$TMPDIR/head-$run.time" \
        ./test > "$TMPDIR/head-$run.log" 2>&1
    echo "head $run: exit $?"
done
grep -H real "$TMPDIR"/base-*.time "$TMPDIR"/head-*.time
```

`‹T0›` is the median `real` of the base's three runs
and `‹T1›` the head's, in seconds, one decimal. A red
run is reported with its failing test's name, taken
from its log, and replaced by one more run. The
intermittent `--parallel` failures are out of scope.
Five runs on one side without three green is BLOCKED.

Then remove the clone: `rm -rf "$BASE"`.

- [ ] **Step 6: Edit TODO.md**

Delete the bullet that begins `- The seed's rehearsal
runs its statements one at a` and ends `are
re-measured` (`:2811-2834`), whole.

In the bullet `- One rehearsal per test process`,
replace these four lines:

```
  its rehearsal. It waits on the rehearsal-serialization
  bullet above, which shrinks what it could save: land
  that, re-measure `./test`, and build this only if the
  per-seed rehearsal is still a cost worth a cache.
```

with the lines below, each slot replaced by its
number (thousands with a comma, as the file writes
them):

```
  its rehearsal. The rehearsal now runs as one
  transaction on its scratch, measured at `2790a9a5`
  and after (`measurements/probes/seed/rehearsal.ts`,
  medians): the rehearsal's replay ‹R0› ms to ‹R1› ms,
  the rehearsal ‹H0› ms to ‹H1› ms, a memory seed
  ‹M0› ms to ‹M1› ms (692 ms before the ledger seed),
  a Postgres seed ‹P0› ms to ‹P1› ms, and `./test`
  ‹T0› s to ‹T1› s over three runs each. Whether the
  per-seed rehearsal is still a cost worth a cache is
  the operator's decision.
```

The `Oracle:` lines below stay byte for byte.

- [ ] **Step 7: Gate and commit**

`./test validate`: green. Then:

```bash
git add TODO.md
git commit -m "Close the rehearsal serialization bullet"
```

- [ ] **Step 8: Report**

Report the eight probe figures, `‹T0›` and `‹T1›`,
and the oracle read plainly against them. The replay
should be near 146 ms, and the memory seed at or under
692 ms. `./test` and the Postgres seed are only
re-measured. Name any red run from Step 5.

---

## Spec coverage

| Spec | Task |
|---|---|
| Decision 1, the one scratch transaction | T2 |
| Decision 2, re-entry of `transaction` and `read` | T2; Review Focus 2 |
| Decision 3, the three guards | T3 |
| Decision 4, the verdict unchanged | T2 Step 6 (standing pins) |
| Decision 5, the product backend untouched | Global Constraints; T6 Step 3 |
| Decision 6, the carve-out | T4 |
| Decision 7, the probe and the TODO close | T5, T7 |
| Decision 8, carried in | (H); T2 Step 6; T6 |
| Found 1–3, 5 | Context; T3 Step 3; Review Focus 5 |
| Found 4, the stale-comment grep | T7 Step 1 |
| Found 6, a probe beside `landing.ts` | T5; T6 Step 3 |
| ## Sequence, §1, §2 | T2 |
| §3 | T3 |
| §4, the overlap | T2; Review Focus 1 |
| ## Error and wire | T2; Review Focus 3; T3 |
| ## Testing, standing pins | T2 Step 6, T3 Step 4, T6 |
| ## Testing, new pins | T2 (two), T3 (one) |
| ## Measurement | T5, T7 |
| ## Docs that change | T2 (comments), T4, T5, T7 |

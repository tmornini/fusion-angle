# The one table, examined — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this spec's worktree (AGENTS.md
> § Worktrees): `.worktrees/2026-09-04-one-table-examined`,
> branch `2026-09-04-one-table-examined`.

> **For the dispatching orchestrator (AGENTS.md § Subagents):**
> every subagent prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then push down: the 78-char lint on
> code/scripts (not `.md`), 4-space indent, the `org`
> identifier ban (spell `organization`), present-tense-
> imperative ~50-char commit subjects with the mandated
> `Co-Authored-By` trailer, the Sin of Test Weakening (when
> test and code diverge the code changes — except where THIS
> plan names a covenant the spec itself rewrote: the append
> return type, the store's three head folds), the Sin of
> Unbidden Helper Code (each task's diff is its story —
> nothing more), the Sin of Default Values (absence is `null`
> at the call site, never `??`'d in a helper), the Sin of
> Internal Defense (rows past the seam are validated; do not
> re-check them), and the codebase patterns named under
> "Context an implementer must know". Subagents work in this
> worktree and never create their own — never pass the Agent
> tool `isolation`. One worker at a time: every task commits
> into one branch. Subagents never run `./deploy --render`
> or any Render command.

**Goal:** Every statement the backend issues has a plan pin;
the two heads live in SQL; thirteen single-document reads
read one document; the write appends once at the storage
edge; the two stamps are `timestamptz` in the columns and
RFC-3339 text at the seam; the report that closes TODO.md
item 1 is written.

**Architecture:** One table behind five layers: the DDL
(`api/schema-postgres.ts`), the two backends
(`api/backend-postgres.ts`; `api/backend-memory.ts` over
`api/backend-buffer-tx.ts`) behind the `Tx` handle, the seam
(`EntityStore<MessagePairEntity>` in `api/db.ts`, implemented
by `api/store-history-entity.ts`), the store
(`api/message-store.ts`), and the gate (`api/message-pair.ts`).
Each behavior change lands red-then-green on both runners
(`tests/store-acceptance.ts`, run by the memory and Postgres
runners), then its plan pin lands in `tests/pg-explain.test.ts`.
The document-read restoration is one commit per derive
family. The report and the TODO close come last.

**Tech Stack:** Deno 2.9.6, TypeScript strict under
`deno.json` (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`), `Deno.test`
+ `@std/assert`, `npm:postgres@3.4.9` behind
`api/postgres-client.ts`, Docker Postgres 18 via `./test
postgres` (`compose.yaml`, image `postgres:18`). No new
dependencies.

**Spec:**
`docs/superpowers/specs/2026-09-04-one-table-examined-design.md`.
Read it first; every task cites its section. The vocabulary
is the path-and-name spec's
(`docs/superpowers/specs/2026-09-14-path-and-name-design.md`),
which landed on master at `033b6116`; this branch is rebased
onto it.

## Global Constraints

- **Base.** The `2026-09-14-path-and-name` branch landed on
  master (`033b6116`) and this worktree is rebased onto it;
  Task 0 proves the vocabulary and baselines both runners.
  Every identifier below is that spec's:
  `path`/`name` columns, `message_pairs_document`,
  `getCollectionPairs`, `getPairsByRequestHash`,
  `getDocumentHistory`, `append`, `getById`, `getHead`,
  `lockRequest`/`lockDocument`/`lockHead`, `getDocumentHead`,
  `appendMessagePairOnce`/`appendMessagePairAlways`,
  `getPairByRequestHash`, `selectPairById`/`selectAll`/
  `selectCollectionPairs`/`selectPairsByRequestHash`/
  `selectDocumentHistory`/`selectWhereBody`/`selectHead`,
  `upsertRow`, `transaction(mode, fn)`, `ensureTable()`.
- Two ways to read, one way to write (spec § Decisions 3):
  a collection read is exact on `path`; a document read is
  exact on `path` and `name`; the write appends one pair.
- `./test validate` green on every commit. `./test postgres`
  green before Tasks 1–16 land (each task says when to run
  it). Neither the executor nor a subagent runs a Render
  command; the operator wipes and reseeds Render after the
  deploy that carries Task 15 (spec § Design: timestamptz).
- No migration discussion; no sweep; no timings; no
  reshaping of the six whole-ledger folds; no retirement of
  `selectAll` or `getAll`; no one-gate refactor of the append
  sites; the authorize-code body search and the GIN index
  stay; the E13 comment in `api/derive-invitations.ts` stays
  (spec § Non-goals).
- Absence is `null` at every layer. Never `??` a NOT NULL
  column. Rows past the seam are trusted.
- Transaction bodies await only row ops.
- 78-character lines in every `.ts` and every script `./test
  lint` reads; `.md` files are exempt. 4-space indent.
- `export DENO_DIR="$TMPDIR/deno-dir"` before any `deno`
  command, `./test`, or `./deploy` in the sandbox. `./test
  postgres` needs the Docker socket (allowed).
- One worktree, one branch, one worker. Commit subjects
  ≈50 chars, present-tense imperative, no body, then the
  trailer:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

## Context an implementer must know

**The chain after path-and-name.** `api/db.ts` declares:

```ts
export interface EntityStore<T extends { id: string }> {
    getAll(): Promise<T[]>;
    getCollectionPairs(path: string): Promise<T[]>;
    getPairsByRequestHash(hash: string): Promise<T[]>;
    getDocumentHistory(path: string, name: string): Promise<T[]>;
    getAllWhereBody(path: string, containment: Record<string, unknown>): Promise<T[]>;
    getById(id: string): Promise<T>;            // throws EntityNotFoundError
    append(id: string, fields: Omit<T, 'id'>): Promise<T>;
}
export interface Tx {
    getById<T extends { id: string }>(id: string): Promise<T | null>;
    getAll<T extends { id: string }>(): Promise<T[]>;
    getCollectionPairs<T extends { id: string }>(path: string): Promise<T[]>;
    getPairsByRequestHash<T extends { id: string }>(hash: string): Promise<T[]>;
    getDocumentHistory<T extends { id: string }>(path: string, name: string): Promise<T[]>;
    getWhereBody<T extends { id: string }>(path: string, containment: Record<string, unknown>): Promise<T[]>;
    append<T extends { id: string }>(row: T): Promise<void>;
    // Postgres write coordination; other backends omit these.
    lockRequest?(hash: string): Promise<void>;
    lockDocument?(path: string, name: string): Promise<void>;
    lockHead?(id: string): Promise<void>;
    getHead?(path: string, name: string): Promise<{ readonly id: string; readonly method: string } | null>;
    notify?(event: NotificationEvent): Promise<void>;
}
export interface WriteLocks { lockRequest; lockDocument; lockHead; getHead; notify }
export interface StorageBackend {
    transaction<R>(mode: TxMode, fn: (tx: Tx) => Promise<R>): Promise<R>;
    ensureTable(): Promise<void>; hasSchema(); postSchemaCreation(); deleteSchema();
}
```

`api/store-history-entity.ts` implements `EntityStore` over a
`TxRunner` (`this.#run(mode, tx => …)`). `api/db-backed.ts`
derives `WriteLocks` from a `Tx` in `writeLocksOf`.
`api/backend-postgres.ts` holds `postgresTx(sql, mode)` and
one SQL function per statement; `entityOf(row)` decodes the
two uuid columns and the two `bytea` columns. `api/backend-
buffer-tx.ts` is `bufferTx(buffer: { id: string }[], mode)`
over a copied array, with `byResponseAtThenId` as its one
comparator. `api/message-store.ts` is `messageStore(db)`
with `getDocumentHead`, `getDocumentHistory`,
`getCollection`, and the three process folds `latestOf`,
`livePutOf`, `livePutsOf` this plan retires. `api/message-
pair.ts` is the gate: `documentHeadAt(db, path, name)`,
`getPairByRequestHash`, `appendMessagePairOnce`,
`appendMessagePairAlways`, `writeMessagePairRows`,
`coordinateWrite`. `api/derive-documents.ts` holds the pure
reductions `documentMessagePairsAt(rows, path)` (every
PUT/DELETE pair at `path`, `(at, id)` ascending) and
`deriveDocumentsAt(rows, path)` (the head document per
`name`, DELETE heads excluded), both of which take a
collection's rows today and a document's rows tomorrow
without change — the `path` filter inside them is then a
no-op.

**The test runners.** `./test` is the memory suite
(`tests/*.test.ts`, TZ=UTC, then `tests/tz/`). `./test
postgres` starts its own Docker Postgres and runs
`tests/pg-acceptance.test.ts`, `tests/pg-races.test.ts`,
`tests/pg-boot.test.ts`, `tests/pg-seed.test.ts`,
`tests/pg-explain.test.ts`, `tests/pg-identifier-order.test.ts`,
`tests/schema-lifecycle.test.ts`. The acceptance suite is
`defineStoreAcceptance(name, open)` in
`tests/store-acceptance.ts`, run by
`tests/store-acceptance-memory.test.ts` and
`tests/pg-acceptance.test.ts`; each case calls `ready()` for a
fresh adapter, so cases never share rows. It already carries
`orderRow(name, responseAt, n)` and the constants
`ORDER_PATH`, `ORDER_REQUESTER`, `ORDER_OPERATION` from the
path-and-name order pin. `tests/backend-postgres.test.ts`
drives `PostgresBackend` over `fakeClient()`, which records
every tagged query's text (parameters rendered as `$n`) and
values. `tests/pg-explain.test.ts` seeds a private schema
(`IDEA_COLLECTION` with four documents, `VERSION_COLLECTION`
with 81 PUTs at `VERSION_NAME`, `AUTH_COLLECTION`, 2000
`FILLER_COLLECTION` rows), runs `ANALYZE`, and pins `EXPLAIN`
text with `explainText(plans)` and `assertIndexPlan(text,
indexes)` (asserts each index name appears and no `Seq
Scan`). To run one memory file:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check --sanitize-ops \
    --sanitize-resources --allow-env --allow-read \
    --allow-write --allow-net \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    tests/<file>.test.ts
```

Type errors surface only through `deno check` (the runner is
`--no-check`), so a call to a not-yet-existing seam method is
a runtime `TypeError` on the memory runner — that is the red
the plan asks for. Run `./test validate` before every commit.

**Patterns to match.** snake_case storage rows / camelCase
domain fields; `readonly` on interface fields; `null` for
absence; comments explain why, never what; SQL functions are
named `select<Noun>` / `insertPair` after the seam method they
serve; every SQL function takes `sql: SqlClient` first.

## Deviations from the spec, stated up front

The walk behind this plan found nine places where the spec
is silent, or where executing it literally breaks a Global
Constraint. Each is decided here so the executor does not
re-decide it; the reviewer may overrule.

1. **Thirteen sites, attributed differently.** The spec
   counts `api/derive-record-instances.ts` once and
   `api/derive-states.ts` once. The tree has two
   single-document collection reads in record-instances
   (`deriveInstanceHead`, `deriveInstanceRevisions`) and
   none in derive-states (`resolveInvitationOwner`,
   `organizationHasMemberMessagePair`, and
   `invitationLifecycleStatesFor` already read
   `getDocumentHistory`; `resolveFlowGraphOwner` scans whole
   collections by design). The count is still thirteen:
   ideas 2, flows 3, projects 2, record-types 2, objectives
   1, record-instances 2, plus `revisionMessagePairIdForPatch`.
   Tasks 5–11 follow the tree.
2. **`documentHeadAt` returns `null`.** Path-and-name kept
   the function by name and left its `undefined` absence.
   This plan folds it onto the seam's `getHead`, which
   returns `null`, so the function does too; its one
   `=== undefined` caller (`api/api.ts` DELETE branch) and
   the `flow-undo-cursor` fake follow (Task 3).
3. **`Tx.getHead` becomes required on both backends.** Today
   it is optional and Postgres-only. The spec says the memory
   backend computes "the same three reads", so `getHead`,
   `getHeadPair`, and `getCollectionHeadPairs` are required
   `Tx` members served by both backends, and the seam exposes
   all three (Task 2). `writeLocksOf` stops testing `getHead`
   for absence — the lock trio still decides whether
   `writeLocks` exists.
4. **The append return type retires one assertion.** `tests/
   store-entity-validation.test.ts` 'HistoryEntityStore.append
   writes the validator output' reads `written.n` off the
   returned row. With `append` returning `Promise<boolean>`
   the test asserts `true` and reads the row back through
   `getById`, which it already does (Task 12).
5. **Layer-1 pins for the select lists and the casts.** The
   spec's `timestamptz` proof is Postgres-only (the DDL pin
   and the round trip). Eight hand-copied column lists are a
   stale-list hazard that `./test validate` would not see, so
   Task 15 adds two `fakeClient` pins in
   `tests/backend-postgres.test.ts`: every pair read formats
   both stamps, and the insert casts both. They are the red
   tests that step's code turns green.
6. **`ORDER BY` names the native column.** In a SELECT list
   that aliases `to_char(…) AS response_at`, a bare `ORDER BY
   response_at` binds to the alias (Postgres resolves output
   names first). The order is the same — fixed width, lexical
   equals chronological — but the statements say what they
   mean: `ORDER BY message_pairs.response_at,
   message_pairs.id` on the plain reads and `heads.response_at,
   heads.id` on the collection heads.
7. **The pins keep `SELECT *`.** The spec keeps the pin
   file's hand-built shape; a `to_char` in the SELECT list
   changes no plan node, so the pins EXPLAIN `SELECT *` and
   the report says so.
8. **Plans for the report come from an ephemeral log.** Task
   18 captures each statement's plan by temporarily adding
   `console.log(text)` inside `explainText`, running `./test
   postgres`, and reverting the file before committing. No
   repo code changes for it.
9. **The round-trip case runs on both runners.** The suite
   is parameterized; the memory backend holds strings and
   passes trivially. Nothing is lost by running it twice.

---

## Phase 0 — The base

### Task 0: Prove the vocabulary and baseline both runners

**Spec:** § Sequence — "One worktree, rebased onto
`2026-09-14-path-and-name` once it lands on master." Done:
the branch sits on `033b6116`.

**Files:** none changed.

- [ ] **Step 1: Confirm the base**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-09-04-one-table-examined
git merge-base --is-ancestor 033b6116 HEAD && echo based   # based
git status --short                                          # clean
```

If master has moved again, `git rebase master` first.

- [ ] **Step 2: Prove the vocabulary this plan is written in**

```bash
grep -n "getDocumentHistory\|getCollectionPairs\|append(" api/db.ts        # all present
grep -n "selectHead\|upsertRow\|selectDocumentHistory" api/backend-postgres.ts   # all present
grep -rn "uri_collection\|uri_id\|latestPutDelete\|getAllWhere(" api tests server   # none
grep -n "message_pairs_document" api/schema-postgres.ts   # present
```

- [ ] **Step 3: Baseline both runners**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
./test postgres
```

Both green. Nothing to commit.

## Phase A — Pins pinnable at today's truth (spec § Sequence 2)

### Task 1: Pin the whole-ledger read, the head lock, and the head's shape

**Spec:** § The pins — "Whole ledger: a Seq Scan and a Sort";
"Pair by id, head lock: the primary key; the lock under
`LockRows`"; "Head pair, collection head pairs: as proven
above" (the head's `Limit` + `Index Scan Backward` shape,
which `selectHead` already has). § Scope 1 names `selectAll`,
the head lock, and `selectHead`.

**Files:**
- Modify: `tests/pg-explain.test.ts`

- [ ] **Step 1: Add the two new pins and strengthen the head pin**

After `Deno.test('getHead uses the document index and pkey', …)`
add:

```ts
    Deno.test('the whole ledger is the one seq scan, sorted',
    async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT * FROM message_pairs
            ORDER BY response_at, id
        `;
        const text = explainText(plans);
        assertMatch(text, /Sort/);
        assertMatch(text, /Seq Scan on message_pairs/);
    });

    Deno.test('the head lock rows the primary key',
    async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT id FROM message_pairs
            WHERE id = ${uuidTextOfIdentifier(ideaId)}
            FOR UPDATE
        `;
        const text = explainText(plans);
        assertMatch(text, /LockRows/);
        assertIndexPlan(text, ['message_pairs_pkey']);
    });
```

Add `assertMatch` to the `@std/assert` import. In the existing
'getHead uses the document index and pkey' test, after
`assertIndexPlan(text, ['message_pairs_document']);` add:

```ts
        assertMatch(text, /Limit/);
        assertMatch(
            text,
            /Index Scan Backward using message_pairs_document/,
        );
        assertNotMatch(text, /Sort/);
```

- [ ] **Step 2: Run the Postgres runner**

```bash
./test postgres
```

Expected: green. If the head pin's `Index Scan Backward` or
`no Sort` fails, do NOT weaken it — report the plan text; the
pin asserts what the planner does and the spec chose this
shape.

- [ ] **Step 3: Commit**

```bash
./test validate
git add -A && git commit -m "Pin the ledger scan, the head lock, and the head shape"
```

## Phase B — Heads in SQL (spec § Sequence 3)

### Task 2: The three head reads at the seam, on both backends

**Spec:** § Design: heads in SQL — the two statements, the
seam names `getHeadPair(path, name)` and
`getCollectionHeadPairs(path)`, `getHead` kept narrow, the
memory backend's `latestByKey` folds; § Proof — the two
acceptance cases. Deviation 3.

**Files:**
- Modify: `tests/store-acceptance.ts` (helper + two cases)
- Modify: `api/db.ts` (`EntityStore`, `Tx`)
- Modify: `api/store-history-entity.ts`
- Modify: `api/backend-postgres.ts` (two methods, two SQL functions)
- Modify: `api/backend-buffer-tx.ts` (three methods, three helpers)
- Modify: `api/db-backed.ts` (`writeLocksOf`)

**Interfaces:**
- Produces:

```ts
// EntityStore<T>
    getHead(path: string, name: string): Promise<{
        readonly id: string;
        readonly method: string;
    } | null>;
    getHeadPair(path: string, name: string): Promise<T | null>;
    getCollectionHeadPairs(path: string): Promise<T[]>;
// Tx (all three required, both backends)
    getHead(path: string, name: string): Promise<{
        readonly id: string;
        readonly method: string;
    } | null>;
    getHeadPair<T extends { id: string }>(
        path: string, name: string,
    ): Promise<T | null>;
    getCollectionHeadPairs<T extends { id: string }>(
        path: string,
    ): Promise<T[]>;
```

- [ ] **Step 1: Write the two failing acceptance cases**

In `tests/store-acceptance.ts` add
`import { messageStore } from '../api/message-store.ts';`
and, after `orderRow`, a row former that takes the method:

```ts
const HEAD_PATH = '/head-pin/';

function pairRow(
    path: string,
    name: string,
    method: string,
    responseAt: string,
    n: number,
): Omit<MessagePairEntity, 'id'> {
    return {
        path,
        name,
        requester_identity_id: ORDER_REQUESTER,
        method,
        request_at: responseAt,
        request_hash: n.toString(16).padStart(64, '0'),
        request: method + ' ' + path + name
            + ' HTTP/1.1\r\n\r\n',
        response_at: responseAt,
        response: 'HTTP/1.1 200 OK\r\n\r\n',
        operation_id: ORDER_OPERATION,
    };
}

function stamp(k: number): string {
    return '2026-01-01T00:00:00.00000' + String(k) + 'Z';
}
```

Inside `defineStoreAcceptance`, after the existing cases:

```ts
    Deno.test(name + ': collection head pairs are the live'
    + ' PUT heads in (response_at, id) order', async () => {
        const { db } = await ready();
        const revised1 = generateIdentifier();
        const revised2 = generateIdentifier();
        const deleted1 = generateIdentifier();
        const deleted2 = generateIdentifier();
        const posted1 = generateIdentifier();
        const posted2 = generateIdentifier();
        const posted3 = generateIdentifier();
        const untouched = generateIdentifier();
        const rows: [string, string, string, number][] = [
            [revised1, 'revised', 'PUT', 1],
            [deleted1, 'deleted', 'PUT', 2],
            [revised2, 'revised', 'PUT', 3],
            [deleted2, 'deleted', 'DELETE', 4],
            [posted1, 'posted', 'PUT', 5],
            [posted2, 'posted', 'POST', 6],
            [posted3, 'posted', 'PATCH', 7],
            [untouched, 'untouched', 'PUT', 8],
        ];
        for (const [id, docName, method, k] of rows) {
            await db.messagePairs.append(
                id, pairRow(HEAD_PATH, docName, method, stamp(k), k),
            );
        }
        const heads = await db.messagePairs
            .getCollectionHeadPairs(HEAD_PATH);
        assertEquals(
            heads.map((row) => row.id),
            [revised2, posted1, untouched],
        );
        assertEquals(
            heads.map((row) => row.name),
            ['revised', 'posted', 'untouched'],
        );
        assert(heads.every((row) => row.method === 'PUT'));
    });

    Deno.test(name + ': head pair is the latest PUT or'
    + ' DELETE; POST and PATCH never displace it', async () => {
        const { db } = await ready();
        const put1 = generateIdentifier();
        const put2 = generateIdentifier();
        const post = generateIdentifier();
        const patch = generateIdentifier();
        const del = generateIdentifier();
        await db.messagePairs.append(
            put1, pairRow(HEAD_PATH, 'doc', 'PUT', stamp(1), 1),
        );
        assertStrictEquals(
            (await db.messagePairs.getHeadPair(HEAD_PATH, 'doc'))
                ?.id,
            put1,
        );
        await db.messagePairs.append(
            put2, pairRow(HEAD_PATH, 'doc', 'PUT', stamp(2), 2),
        );
        await db.messagePairs.append(
            post, pairRow(HEAD_PATH, 'doc', 'POST', stamp(3), 3),
        );
        await db.messagePairs.append(
            patch, pairRow(HEAD_PATH, 'doc', 'PATCH', stamp(4), 4),
        );
        const afterOps = await db.messagePairs.getHeadPair(
            HEAD_PATH, 'doc',
        );
        assertStrictEquals(afterOps?.id, put2);
        assertStrictEquals(afterOps?.method, 'PUT');
        assertEquals(
            await db.messagePairs.getHead(HEAD_PATH, 'doc'),
            { id: put2, method: 'PUT' },
        );
        await db.messagePairs.append(
            del, pairRow(HEAD_PATH, 'doc', 'DELETE', stamp(5), 5),
        );
        const afterDelete = await db.messagePairs.getHeadPair(
            HEAD_PATH, 'doc',
        );
        assertStrictEquals(afterDelete?.id, del);
        assertStrictEquals(afterDelete?.method, 'DELETE');
        assertStrictEquals(
            await messageStore(db).getDocumentHead(HEAD_PATH, 'doc'),
            null,
        );
        assertStrictEquals(
            await db.messagePairs.getHeadPair(HEAD_PATH, 'nothing'),
            null,
        );
        assertStrictEquals(
            await db.messagePairs.getHead(HEAD_PATH, 'nothing'),
            null,
        );
    });
```

(`assertEquals`, `assert`, `assertStrictEquals`,
`generateIdentifier`, and `MessagePairEntity` are already
imported by the order pin.)

- [ ] **Step 2: Run the memory runner red**

```bash
deno test … tests/store-acceptance-memory.test.ts
```

Expected: both new cases FAIL with
`db.messagePairs.getCollectionHeadPairs is not a function` /
`getHeadPair is not a function`.

- [ ] **Step 3: The seam and `Tx` interfaces**

In `api/db.ts`, `EntityStore`: after `getDocumentHistory` add

```ts
    // The latest PUT or DELETE at the document, projected
    // to what the write gate compares; null when none.
    getHead(path: string, name: string): Promise<{
        readonly id: string;
        readonly method: string;
    } | null>;
    // The head pair itself, PUT or DELETE; null when none.
    getHeadPair(path: string, name: string): Promise<T | null>;
    // The live PUT heads of a collection, (response_at, id).
    getCollectionHeadPairs(path: string): Promise<T[]>;
```

In `Tx`: move `getHead` above the "Postgres write
coordination" comment, drop its `?`, and add beside it

```ts
    getHeadPair<T extends { id: string }>(
        path: string,
        name: string,
    ): Promise<T | null>;
    getCollectionHeadPairs<T extends { id: string }>(
        path: string,
    ): Promise<T[]>;
```

`WriteLocks` is unchanged.

- [ ] **Step 4: The seam implementation**

In `api/store-history-entity.ts` add:

```ts
    async getHead(
        path: string,
        name: string,
    ): Promise<{
        readonly id: string;
        readonly method: string;
    } | null> {
        return this.#run(
            'readonly',
            (tx) => tx.getHead(path, name),
        );
    }

    async getHeadPair(
        path: string,
        name: string,
    ): Promise<T | null> {
        return this.#run(
            'readonly',
            (tx) => tx.getHeadPair<T>(path, name),
        );
    }

    async getCollectionHeadPairs(path: string): Promise<T[]> {
        return this.#run(
            'readonly',
            (tx) => tx.getCollectionHeadPairs<T>(path),
        );
    }
```

- [ ] **Step 5: Postgres**

In `api/backend-postgres.ts`, in `postgresTx`, after
`getDocumentHistory`:

```ts
        async getHeadPair<T extends { id: string }>(
            path: string,
            name: string,
        ): Promise<T | null> {
            const rows = await selectHeadPair(sql, path, name);
            const row = rows[0];
            return row === undefined
                ? null
                : entityOf<T>(row);
        },
        async getCollectionHeadPairs<
            T extends { id: string },
        >(path: string): Promise<T[]> {
            const rows = await selectCollectionHeadPairs(
                sql, path,
            );
            return rows.map((row) => entityOf<T>(row));
        },
```

and beside `selectHead` the two statements (spec § Design:
heads in SQL, verbatim):

```ts
// One backward walk of the document index under a Limit.
async function selectHeadPair(
    sql: SqlClient,
    path: string,
    name: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT * FROM message_pairs
        WHERE path = ${path}
          AND name = ${name}
          AND method IN ('PUT', 'DELETE')
        ORDER BY response_at DESC, id DESC
        LIMIT 1
    `;
}

// DISTINCT ON takes the first row per name straight off
// the document index read backward; the outer sort orders
// the heads, a small set.
async function selectCollectionHeadPairs(
    sql: SqlClient,
    path: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT * FROM (
            SELECT DISTINCT ON (name) *
            FROM message_pairs
            WHERE path = ${path}
              AND method IN ('PUT', 'DELETE')
            ORDER BY name DESC, response_at DESC, id DESC
        ) heads
        WHERE method = 'PUT'
        ORDER BY response_at, id
    `;
}
```

`PostgresTx` (which `extends Tx`) needs no new declaration.

- [ ] **Step 6: Memory**

In `api/backend-buffer-tx.ts` add
`import { latestByKey } from '../shared/ledger-reduction.ts';`
and, beside `byResponseAtThenId`:

```ts
const PUT_METHOD = 'PUT';
const DELETE_METHOD = 'DELETE';

function isDocumentMethod(method: unknown): boolean {
    return method === PUT_METHOD || method === DELETE_METHOD;
}

// The (at, id) key latestByKey reduces over, beside the row
// it came from. response_at is NOT NULL past the seam.
function keyedByResponseAt(row: { id: string }): {
    readonly at: string;
    readonly id: string;
    readonly row: Record<string, unknown> & { id: string };
} {
    const rec = row as Record<string, unknown> & { id: string };
    return { at: String(rec['response_at']), id: row.id, row: rec };
}

// The latest PUT or DELETE among `rows` by (response_at, id).
function headOf(
    rows: readonly { id: string }[],
): (Record<string, unknown> & { id: string }) | null {
    const head = latestByKey(
        rows.map(keyedByResponseAt), () => 'head',
    ).get('head');
    return head === undefined ? null : head.row;
}

function documentRows(
    buffer: readonly { id: string }[],
    path: string,
    name: string,
): { id: string }[] {
    return buffer.filter((row) => {
        const rec = row as Record<string, unknown>;
        return rec['path'] === path
            && rec['name'] === name
            && isDocumentMethod(rec['method']);
    });
}
```

and in the returned `Tx`, after `getDocumentHistory`:

```ts
        async getHead(
            path: string,
            name: string,
        ): Promise<{
            readonly id: string;
            readonly method: string;
        } | null> {
            const head = headOf(documentRows(buffer, path, name));
            return head === null
                ? null
                : { id: head.id, method: String(head['method']) };
        },
        async getHeadPair<T extends { id: string }>(
            path: string,
            name: string,
        ): Promise<T | null> {
            const head = headOf(documentRows(buffer, path, name));
            return head === null ? null : { ...head } as T;
        },
        async getCollectionHeadPairs<
            T extends { id: string },
        >(path: string): Promise<T[]> {
            const documents = buffer.filter((row) => {
                const rec = row as Record<string, unknown>;
                return rec['path'] === path
                    && isDocumentMethod(rec['method']);
            });
            const heads = latestByKey(
                documents.map(keyedByResponseAt),
                (keyed) => String(keyed.row['name']),
            );
            const live: { id: string }[] = [];
            for (const head of heads.values()) {
                if (head.row['method'] === PUT_METHOD) {
                    live.push(head.row);
                }
            }
            return live
                .sort(byResponseAtThenId)
                .map((row) => ({ ...row })) as T[];
        },
```

- [ ] **Step 7: `writeLocksOf`**

In `api/db-backed.ts`, `getHead` is no longer optional, so
its `=== undefined` test is a type error. Rewrite:

```ts
function writeLocksOf(tx: Tx): WriteLocks | undefined {
    const lockRequest = tx.lockRequest;
    const lockDocument = tx.lockDocument;
    const lockHead = tx.lockHead;
    const notify = tx.notify;
    if (
        lockRequest === undefined
        || lockDocument === undefined
        || lockHead === undefined
        || notify === undefined
    ) {
        return undefined;
    }
    return {
        lockRequest,
        lockDocument,
        lockHead,
        getHead: (path, name) => tx.getHead(path, name),
        notify,
    };
}
```

The memory backend still has no locks, so `writeLocks` stays
`undefined` there (the gate's `coordinateWrite` short-circuits
on it, unchanged).

- [ ] **Step 8: Green on both runners, commit**

```bash
./test validate
./test postgres
git add -A && git commit -m "Read the heads at the seam, in SQL"
```

### Task 3: Fold the store and the gate onto the seam's heads

**Spec:** § Design: heads in SQL — "The store." `getCollection`
calls `getCollectionHeadPairs`; `getDocumentHead` calls
`getHeadPair` and returns it when its method is PUT, else
`null`; `documentHeadAt` calls the seam's `getHead` and its
loop goes; `livePutOf`, `latestOf`, `livePutsOf` leave.
Deviation 2.

**Files:**
- Modify: `api/message-store.ts`
- Modify: `api/message-pair.ts` (`documentHeadAt`)
- Modify: `api/api.ts` (the DELETE branch's `head === undefined`)
- Modify: `tests/flow-undo-cursor.test.ts` (the `getHead` fake)

- [ ] **Step 1: The store**

Replace the body of `messageStore` and delete the three folds:

```ts
export function messageStore(db: DbAdapter): MessageStore {
    return {
        async getDocumentHead(path, name) {
            const head = await db.messagePairs.getHeadPair(
                path, name,
            );
            return head !== null && head.method === PUT_METHOD
                ? head
                : null;
        },
        async getDocumentHistory(path, name) {
            return db.messagePairs.getDocumentHistory(
                path, name,
            );
        },
        async getCollection(path) {
            return entitiesOf(
                await db.messagePairs.getCollectionHeadPairs(
                    path,
                ),
            );
        },
    };
}
```

Delete `latestOf`, `livePutOf`, `livePutsOf`,
`compareMessagePair`, `isDocumentMethod`, `DELETE_METHOD`, and
the now-unused imports (`latestByKey`, `compareIdentifiers`).
Keep `PUT_METHOD`, `jsonBodyOf`, `entitiesOf`, `liveHeadId`.
Rewrite the header comment: "Three reads over the ledger, each
one seam read. The seam serves both heads in SQL
(`getHeadPair`, `getCollectionHeadPairs`); this layer parses
bodies and decides that a DELETE head is no document."

- [ ] **Step 2: The gate**

In `api/message-pair.ts` replace `documentHeadAt` (its comment
and loop) with:

```ts
// The head of a document: its latest PUT or DELETE, or
// null. A DELETE head is a gone document, not a miss.
export async function documentHeadAt(
    db: DbAdapter,
    path: string,
    name: string,
): Promise<{
    readonly id: string;
    readonly method: string;
} | null> {
    return db.messagePairs.getHead(path, name);
}
```

`deno check` will name any import this leaves unused
(`compareIdentifiers`, `messageStore`); remove those it names.

- [ ] **Step 3: The two callers that spelled absence**

`api/api.ts`, the DELETE branch: the `if (head === undefined)`
that follows `const head = await documentHeadAt(effective,
canonicalPrefix, name)` (`grep -n "head === undefined"
api/api.ts` prints three lines; only the one directly under
that call is this function's — the other two test different
bindings) becomes `if (head === null) {`. The other
`documentHeadAt` callers read `?.method` or `?.id` and need
nothing.
`tests/flow-undo-cursor.test.ts`, the write-locks fake:

```ts
            getHead: (path, name) =>
                documentHeadAt(view, path, name),
```

(`tests/api-pii-tombstone.test.ts` reads `head?.id`; leave it.)

- [ ] **Step 4: Verify and commit**

```bash
grep -n "livePutOf\|latestOf\|livePutsOf\|compareMessagePair" api tests   # none
grep -c "\.sort(" api/message-store.ts   # 0
./test validate
git add -A && git commit -m "Fold the store's heads onto the seam"
```

### Task 4: Pin the two head statements' plans

**Spec:** § Proof (heads) — "the collection read as an `Index
Scan Backward` on `message_pairs_document` under a `Unique`
node with no `Sort` beneath it, and the document read as the
same scan under a `Limit`." Deviation 7.

**Files:**
- Modify: `tests/pg-explain.test.ts`

- [ ] **Step 1: A helper for "no Sort beneath a node" and the two pins**

Beside `assertIndexPlan`:

```ts
// Every line after `node`'s own is its subtree: EXPLAIN
// text indents children beneath their parent.
function assertNoSortBeneath(text: string, node: string): void {
    const lines = text.split('\n');
    const at = lines.findIndex((line) => line.includes(node));
    assert(at >= 0, 'expected ' + node + ' in\n' + text);
    for (const line of lines.slice(at + 1)) {
        assertNotMatch(
            line, /Sort/, 'Sort beneath ' + node + ' in\n' + text,
        );
    }
}
```

After the Task 1 pins:

```ts
    Deno.test('collection head pairs come off the document'
    + ' index backward under Unique', async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT * FROM (
                SELECT DISTINCT ON (name) *
                FROM message_pairs
                WHERE path = ${IDEA_COLLECTION}
                  AND method IN ('PUT', 'DELETE')
                ORDER BY name DESC, response_at DESC, id DESC
            ) heads
            WHERE method = 'PUT'
            ORDER BY response_at, id
        `;
        const text = explainText(plans);
        assertMatch(text, /Unique/);
        assertMatch(
            text,
            /Index Scan Backward using message_pairs_document/,
        );
        assertNoSortBeneath(text, 'Unique');
        assertNotMatch(text, /Seq Scan/);
    });

    Deno.test('head pair is one backward walk under a Limit',
    async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT * FROM message_pairs
            WHERE path = ${VERSION_COLLECTION}
              AND name = ${VERSION_NAME}
              AND method IN ('PUT', 'DELETE')
            ORDER BY response_at DESC, id DESC
            LIMIT 1
        `;
        const text = explainText(plans);
        assertMatch(text, /Limit/);
        assertMatch(
            text,
            /Index Scan Backward using message_pairs_document/,
        );
        assertNotMatch(text, /Sort/);
    });
```

- [ ] **Step 2: Run, then commit**

```bash
./test postgres
```

Expected: green. A different plan is a report, not a
weakening (Task 1 Step 2's rule).

```bash
./test validate
git add -A && git commit -m "Pin the two head reads' plans"
```

## Phase C — Document reads restored (spec § Sequence 4)

Each family's single-document derives read
`getDocumentHistory(path, name)` instead of
`getCollectionPairs(path)` followed by a `name` filter.
`deriveDocumentsAt` and `documentMessagePairsAt` fold only that
document's pairs; output is byte-identical because both
functions filtered by `path` (now a no-op over a document's
rows) and the removed `.filter(name === id)` selected exactly
the rows the seam now returns. The derive and drift tests are
the net. One commit per family.

### Task 5: Ideas — `deriveIdea`, `deriveIdeaStateHistory`

**Files:**
- Modify: `api/derive-ideas.ts`

- [ ] **Step 1: Add the document fetch beside the collection fetch**

After `fetchIdeaMessagePairs`:

```ts
async function fetchIdeaDocumentMessagePairs(
    db: DbAdapter,
    prefix: string,
    ideaId: Id,
): Promise<{
    readonly document: DerivedDocument | undefined;
    readonly messagePairs: readonly DocumentMessagePair[];
}> {
    const history = await db.messagePairs.getDocumentHistory(
        prefix, ideaId,
    );
    return {
        document: deriveDocumentsAt(history, prefix).get(ideaId),
        messagePairs: documentMessagePairsAt(history, prefix),
    };
}
```

- [ ] **Step 2: Repoint the two derives**

`deriveIdea`:

```ts
    const prefix = ideasUriPrefix(organization);
    const { document, messagePairs } =
        await fetchIdeaDocumentMessagePairs(db, prefix, ideaId);
    if (document === undefined) {
        throw await missedReadError(
            db, ideaId, organization, IDEAS_TABLE,
        );
    }
    const history = stateHistoryFrom(
        documentLifecycleEvents(messagePairs),
        ideaId,
    );
```

(the rest of the function unchanged). `deriveIdeaStateHistory`:

```ts
    const prefix = ideasUriPrefix(organization);
    const { messagePairs } =
        await fetchIdeaDocumentMessagePairs(db, prefix, ideaId);
    return stateHistoryFrom(
        documentLifecycleEvents(messagePairs),
        ideaId,
    );
```

`deriveIdeas` and `deriveIdeaSubmissions` keep
`fetchIdeaMessagePairs` / `getCollectionPairs` — they are
collection reads.

- [ ] **Step 3: Verify and commit**

```bash
grep -n "\.name === ideaId" api/derive-ideas.ts   # none
./test validate
git add -A && git commit -m "Read one idea as a document"
```

### Task 6: Flows — `deriveFlow`, `resolveFlowUndoTarget`, `deriveFlowStateHistory`

**Files:**
- Modify: `api/derive-flows.ts`

- [ ] **Step 1: Add the document fetch**

After `fetchFlowMessagePairs`:

```ts
async function fetchFlowDocumentMessagePairs(
    db: DbAdapter,
    prefix: string,
    flowId: Id,
): Promise<{
    readonly document: DerivedDocument | undefined;
    readonly messagePairs: readonly DocumentMessagePair[];
}> {
    const history = await db.messagePairs.getDocumentHistory(
        prefix, flowId,
    );
    return {
        document: deriveDocumentsAt(history, prefix).get(flowId),
        messagePairs: documentMessagePairsAt(history, prefix),
    };
}
```

- [ ] **Step 2: Repoint the three derives**

`deriveFlow`:

```ts
    const prefix = flowsUriPrefix(organization);
    const { document, messagePairs } =
        await fetchFlowDocumentMessagePairs(db, prefix, flowId);
    if (document === undefined) {
        throw await missedReadError(
            db, flowId, organization, FLOWS_TABLE,
        );
    }
    const history = stateHistoryFrom(
        documentLifecycleEvents(messagePairs),
        flowId,
    );
    if (currentDocumentState(history) === DELETED_STATE) {
        throw await missedReadError(
            db, flowId, organization, FLOWS_TABLE,
        );
    }
    return flowEntityOf(
        document, organization, messagePairs.length,
    );
```

(`ownMessagePairs` is gone: `messagePairs` is already this
flow's own.) `resolveFlowUndoTarget`, the two reads and the
first fold:

```ts
    const prefix = flowsUriPrefix(organization);
    const [stored, undoMessagePairs] = await Promise.all([
        db.messagePairs.getDocumentHistory(prefix, flowId),
        db.messagePairs.getCollectionPairs(undoUriPrefix),
    ]);
    const messagePairs = documentMessagePairsAt(stored, prefix);
```

(the `.filter((messagePair) => messagePair.name === flowId)`
goes; `storedById` and the stack walk are unchanged — every
`messagePair.id` it looks up is one of `stored`'s rows.)
`deriveFlowStateHistory`:

```ts
    const prefix = flowsUriPrefix(organization);
    const { messagePairs } =
        await fetchFlowDocumentMessagePairs(db, prefix, flowId);
    return stateHistoryFrom(
        documentLifecycleEvents(messagePairs),
        flowId,
    );
```

`deriveFlows` and `flowGraphBindingsFromMessagePairs` keep
their collection reads.

- [ ] **Step 3: Verify and commit**

```bash
grep -n "\.name === flowId" api/derive-flows.ts   # none
./test validate
git add -A && git commit -m "Read one flow as a document"
```

### Task 7: Projects — `deriveProject`, `deriveProjectStateHistory`

**Files:**
- Modify: `api/derive-projects.ts`

- [ ] **Step 1: Add the document fetch**

After `fetchProjectMessagePairs`:

```ts
async function fetchProjectDocumentMessagePairs(
    db: DbAdapter,
    prefix: string,
    projectId: Id,
): Promise<{
    readonly document: DerivedDocument | undefined;
    readonly messagePairs: readonly DocumentMessagePair[];
}> {
    const history = await db.messagePairs.getDocumentHistory(
        prefix, projectId,
    );
    return {
        document: deriveDocumentsAt(history, prefix)
            .get(projectId),
        messagePairs: documentMessagePairsAt(history, prefix),
    };
}
```

- [ ] **Step 2: Repoint the two derives**

`deriveProject`:

```ts
    const prefix = projectsUriPrefix(organization);
    const { document, messagePairs } =
        await fetchProjectDocumentMessagePairs(
            db, prefix, projectId,
        );
    if (document === undefined) {
        throw await missedReadError(
            db, projectId, organization, PROJECTS_TABLE,
        );
    }
    const history = stateHistoryFrom(
        documentLifecycleEvents(messagePairs),
        projectId,
    );
```

(rest unchanged). `deriveProjectStateHistory`:

```ts
    const prefix = projectsUriPrefix(organization);
    const { messagePairs } =
        await fetchProjectDocumentMessagePairs(
            db, prefix, projectId,
        );
    return stateHistoryFrom(
        documentLifecycleEvents(messagePairs),
        projectId,
    );
```

- [ ] **Step 3: Verify and commit**

```bash
grep -n "\.name === projectId" api/derive-projects.ts   # none
./test validate
git add -A && git commit -m "Read one project as a document"
```

### Task 8: Record types — `deriveRecordTypeEntity`, `deriveRecordTypeStateHistory`

**Files:**
- Modify: `api/derive-record-types.ts`

- [ ] **Step 1: Add the document fetch**

After `fetchRecordTypeMessagePairs`:

```ts
async function fetchRecordTypeDocumentMessagePairs(
    db: DbAdapter,
    prefix: string,
    id: Id,
): Promise<{
    readonly document: DerivedDocument | undefined;
    readonly messagePairs: readonly DocumentMessagePair[];
}> {
    const history = await db.messagePairs.getDocumentHistory(
        prefix, id,
    );
    return {
        document: deriveDocumentsAt(history, prefix).get(id),
        messagePairs: documentMessagePairsAt(history, prefix),
    };
}
```

- [ ] **Step 2: Repoint the two derives**

`deriveRecordTypeEntity`:

```ts
    const prefix = recordTypesUriPrefix(organization);
    const { document, messagePairs } =
        await fetchRecordTypeDocumentMessagePairs(
            db, prefix, id,
        );
    if (document === undefined) {
        throw await missedReadError(
            db, id, organization, RECORD_TYPES_TABLE,
        );
    }
    const history = stateHistoryFrom(
        documentLifecycleEvents(messagePairs),
        id,
    );
```

(rest unchanged). `deriveRecordTypeStateHistory`:

```ts
    const prefix = recordTypesUriPrefix(organization);
    const { messagePairs } =
        await fetchRecordTypeDocumentMessagePairs(
            db, prefix, id,
        );
    return stateHistoryFrom(
        documentLifecycleEvents(messagePairs),
        id,
    );
```

- [ ] **Step 3: Verify and commit**

```bash
grep -n "\.name === id" api/derive-record-types.ts   # none
./test validate
git add -A && git commit -m "Read one record type as a document"
```

### Task 9: Objectives — `deriveObjectiveStateHistory`

**Files:**
- Modify: `api/derive-objectives.ts`

- [ ] **Step 1: One read, no filter**

```ts
export async function deriveObjectiveStateHistory(
    db: DbAdapter,
    organization: Id,
    objectiveId: Id,
): Promise<StateEntity[]> {
    const prefix = objectivesUriPrefix(organization);
    const stored = await db.messagePairs.getDocumentHistory(
        prefix, objectiveId,
    );
    return stateHistoryFrom(
        documentLifecycleEvents(
            documentMessagePairsAt(stored, prefix),
        ),
        objectiveId,
    );
}
```

- [ ] **Step 2: Verify and commit**

```bash
./test validate
git add -A && git commit -m "Read one objective as a document"
```

### Task 10: Record instances — `deriveInstanceHead`, `deriveInstanceRevisions`

**Spec:** Deviation 1 (two sites here, none in derive-states).

**Files:**
- Modify: `api/derive-record-instances.ts`

- [ ] **Step 1: The fetch takes the instance; the two derives read one document**

`fetchInstanceMessagePairs` has one caller,
`deriveInstanceRevisions`; give it the instance:

```ts
async function fetchInstanceMessagePairs(
    db: DbAdapter,
    organization: Id,
    recordTypeId: Id,
    instanceId: Id,
): Promise<readonly DocumentMessagePair[]> {
    const prefix = instancesUriPrefix(
        organization, recordTypeId,
    );
    const history = await db.messagePairs.getDocumentHistory(
        prefix, instanceId,
    );
    return documentMessagePairsAt(history, prefix);
}
```

`deriveInstanceHead`:

```ts
    const prefix = instancesUriPrefix(
        organization, recordTypeId,
    );
    const history = await db.messagePairs.getDocumentHistory(
        prefix, instanceId,
    );
    const document = deriveDocumentsAt(
        history, prefix,
    ).get(instanceId);
    if (document === undefined) return undefined;
```

(rest unchanged). `deriveInstanceRevisions`:

```ts
    const messagePairs = await fetchInstanceMessagePairs(
        db, organization, recordTypeId, instanceId,
    );
    if (messagePairs.length === 0) return [];
```

(the `.filter((messagePair) => messagePair.name === instanceId)`
goes; rest unchanged). `deriveInstanceCollection` keeps its
collection read.

- [ ] **Step 2: Verify and commit**

```bash
grep -n "\.name === instanceId" api/derive-record-instances.ts   # none
./test validate
git add -A && git commit -m "Read one instance as a document"
```

### Task 11: The PATCH's revision pair, with its two fixes

**Spec:** § Design: document reads restored — "The thirteenth
site carries two fixes in its commit. Its `=== undefined`
branch is dead, since `getById` throws on absence, and goes.
It joins the two pairs of one operation by `request_at`
equality; the plan verifies whether the revision pair is
written under the same `operation_id`, and if so the join
uses it."

**Files:**
- Modify: `api/api.ts` (`revisionMessagePairIdForPatch`)

- [ ] **Step 1: Verify the operation id is shared**

```bash
grep -n "revisionMessagePair = await formDocumentMessagePairFor" -A 8 api/routes.ts \
    | grep -c "operationId: messagePair.operationId"   # 3
```

Three revision pairs are formed (the instance create PUT,
create PATCH, and PATCH handlers) and each carries
`operationId: messagePair.operationId` beside `requestAt:
messagePair.requestAt`. The revision pair and the wire pair
share both; `operation_id` is the honest key.

- [ ] **Step 2: Rewrite the lookup**

```ts
// The revision pair an instance PATCH wrote beside its wire
// pair: same document, same operation, the other id.
async function revisionMessagePairIdForPatch(
    db: DbAdapter,
    wireMessagePairId: string,
): Promise<string | undefined> {
    const wireReq = await db.messagePairs.getById(
        wireMessagePairId,
    );
    const siblings = await db.messagePairs.getDocumentHistory(
        wireReq.path, wireReq.name,
    );
    const revision = siblings.find(
        (row) =>
            row.operation_id === wireReq.operation_id
            && row.id !== wireMessagePairId,
    );
    return revision?.id;
}
```

The two callers test `revisionId !== undefined` and are
unchanged.

- [ ] **Step 3: Verify and commit**

```bash
grep -n "request_at === wireReq" api/api.ts   # none
./test validate
git add -A && git commit -m "Join a PATCH's revision pair by operation id"
```

## Phase D — Append-only write (spec § Sequence 5)

### Task 12: Append once at the storage edge

**Spec:** § Design: append-only write — the covenant, `ON
CONFLICT (id) DO NOTHING RETURNING id`, the memory mirror,
`Tx.append` and `EntityStore.append` return `Promise<boolean>`,
`writeMessagePairRows` throws on `false`; § Proof — the
acceptance case. Deviation 4. The `upsertRow` name stays until
Task 14.

**Files:**
- Modify: `tests/store-acceptance.ts` (one case)
- Modify: `api/db.ts` (`EntityStore.append`, `Tx.append`)
- Modify: `api/store-history-entity.ts` (`append`)
- Modify: `api/backend-postgres.ts` (`append`, `upsertRow`)
- Modify: `api/backend-buffer-tx.ts` (`append`)
- Modify: `api/message-pair.ts` (`writeMessagePairRows`)
- Modify: `tests/store-entity-validation.test.ts` (one assertion)

**Interfaces:**
- Produces: `EntityStore.append(id, fields): Promise<boolean>`;
  `Tx.append<T>(row: T): Promise<boolean>` — `true` when the
  row was written, `false` when its id already existed and
  nothing changed.

- [ ] **Step 1: Write the failing acceptance case**

In `defineStoreAcceptance`, after the Task 2 cases:

```ts
    Deno.test(name + ': a second append of an id changes'
    + ' nothing and says so', async () => {
        const { db } = await ready();
        const id = generateIdentifier();
        const first = pairRow(HEAD_PATH, 'once', 'PUT', stamp(1), 1);
        const second = pairRow(HEAD_PATH, 'once', 'PUT', stamp(2), 2);
        assertStrictEquals(
            await db.messagePairs.append(id, first), true,
        );
        assertStrictEquals(
            await db.messagePairs.append(id, second), false,
        );
        assertEquals(
            await db.messagePairs.getById(id),
            { id, ...first },
        );
    });
```

Run the memory runner: FAIL (the first `append` returns the
row, not `true`; the second overwrites).

- [ ] **Step 2: The interfaces**

`api/db.ts`: in `EntityStore`,

```ts
    // Writes the row if its id is absent and reports whether
    // it did. A later append of the same id changes nothing.
    append(
        id: string,
        fields: Omit<T, 'id'>,
    ): Promise<boolean>;
```

in `Tx`, `append<T extends { id: string }>(row: T):
Promise<boolean>;`.

- [ ] **Step 3: The seam**

`api/store-history-entity.ts`:

```ts
    async append(
        id: string,
        fields: Omit<T, 'id'>,
    ): Promise<boolean> {
        const { id: _id, ...body } =
            fields as unknown as Record<string, unknown>;
        const written = {
            ...this.#validate(body),
            id,
        } as T;
        return this.#run(
            'readwrite',
            (tx) => tx.append(written),
        );
    }
```

- [ ] **Step 4: Postgres**

In `postgresTx`:

```ts
        async append<T extends { id: string }>(
            row: T,
        ): Promise<boolean> {
            assertWritable();
            const written = serializeRecord(
                row as Record<string, unknown>,
                'message_pairs',
            );
            return upsertRow(sql, written);
        },
```

In `upsertRow`, the signature returns `Promise<boolean>` and
the statement ends (its local for `path` is still named
`collection`; Task 14 renames it):

```ts
    const inserted = await sql.query<{ id: string }>`
        INSERT INTO message_pairs (
            id, path, name,
            requester_identity_id, method,
            request_at, request_hash, request,
            response_at, response,
            operation_id
        ) VALUES (
            ${id}, ${collection}, ${name},
            ${requester}, ${method},
            ${requestAt}, ${requestHash}, ${request},
            ${responseAt}, ${response},
            ${operationId}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
    `;
    return inserted.length === 1;
```

The whole `DO UPDATE SET …` block goes. Update the file's
header comment: "The write appends: `ON CONFLICT (id) DO
NOTHING`, the row count is the report."

- [ ] **Step 5: Memory**

In `bufferTx`'s `append`, before the unique-column scan:

```ts
        async append<T extends { id: string }>(
            row: T,
        ): Promise<boolean> {
            assertWritable();
            if (buffer.some((existing) => existing.id === row.id)) {
                return false;
            }
```

(the unique-column scan and `serializeRecord` follow
unchanged) and at the end replace the `findIndex` /
`rows[idx] = written` / `push` branch with:

```ts
            buffer.push(written);
            return true;
```

Rewrite the comment above `bufferTx` that says the NOT-NULL
gate "runs at `put` time" to say `append`, and add: "An
existing id is left as it is and reported `false` — the
buffer is append-only like the table."

- [ ] **Step 6: The writer**

In `api/message-pair.ts`:

```ts
async function writeMessagePairRows(
    view: DbAdapter,
    messagePair: MessagePair,
): Promise<void> {
    const appended = await view.messagePairs.append(
        messagePair.id,
        {
            path: messagePair.path,
            name: messagePair.name,
            requester_identity_id:
                messagePair.requesterIdentityId,
            method: messagePair.method,
            request_at: messagePair.requestAt,
            request_hash: messagePair.requestHash,
            request: messagePair.requestMessage,
            response_at: nowUtc(),
            response: messagePair.responseMessage,
            operation_id: messagePair.operationId,
        },
    );
    if (!appended) {
        throw new Error(
            'message pair ' + messagePair.id
            + ' is already stored',
        );
    }
}
```

A fresh id that conflicts is an invariant violation; the throw
rolls the transaction back and the domain-boundary catch in
`api/api.ts` answers 500. Update the `appendMessagePairAlways`
comment, which says "a second put of the same pair overwrites
the same slot": "keyed by pair id — ids are minted fresh per
request, so two byte-identical logins each land."

- [ ] **Step 7: The validation test's covenant (Deviation 4)**

In `tests/store-entity-validation.test.ts`,
'HistoryEntityStore.append writes the validator output':

```ts
        assertStrictEquals(
            await store.append('a', { n: 7 }), true,
        );
        const fetched = await store.getById('a');
        assertStrictEquals(fetched.n, 8);
```

(`written` and its assertion go.)

- [ ] **Step 8: Green on both runners, commit**

```bash
./test validate
./test postgres     # pg-races' 'exact-hash dedup keeps one pair' and both first-writer pins stay green unchanged
grep -rn "DO UPDATE" api   # none
git add -A && git commit -m "Append once at the storage edge"
```

### Task 13: Pin the insert's conflict resolution

**Spec:** § Proof (append) — "`tests/pg-explain.test.ts` pins
`Conflict Resolution: NOTHING`."

**Files:**
- Modify: `tests/pg-explain.test.ts`

- [ ] **Step 1: The pin**

Add a constant `const EXPLAIN_INSERT_N = 9000;` beside the
other seed constants (outside every seeded range), and after
the Task 4 pins:

```ts
    Deno.test('insert resolves an id conflict by doing nothing',
    async () => {
        const wire = Octets.fromLatin1(
            putWire(IDEA_COLLECTION + '9', ''),
        ).asBytes();
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            INSERT INTO message_pairs (
                id, path, name,
                requester_identity_id, method,
                request_at, request_hash, request,
                response_at, response,
                operation_id
            ) VALUES (
                ${uuidTextOfIdentifier(id22(EXPLAIN_INSERT_N))},
                ${IDEA_COLLECTION}, ${'9'},
                ${REQUESTER}, ${'PUT'},
                ${atStamp(EXPLAIN_INSERT_N)},
                ${hex64(EXPLAIN_INSERT_N)}, ${wire},
                ${atStamp(EXPLAIN_INSERT_N)}, ${wire},
                ${uuidTextOfIdentifier(OPERATION)}
            )
            ON CONFLICT (id) DO NOTHING
        `;
        const text = explainText(plans);
        assertMatch(text, /Conflict Resolution: NOTHING/);
        assertMatch(
            text, /Conflict Arbiter Indexes: message_pairs_pkey/,
        );
    });
```

`EXPLAIN` without `ANALYZE` plans and does not execute, so the
schema's row count is unchanged for the other pins.

- [ ] **Step 2: Run and commit**

```bash
./test postgres
./test validate
git add -A && git commit -m "Pin the insert's conflict resolution"
```

### Task 14: Rename `upsertRow` to `insertPair`

**Spec:** § Design: append-only write — "`upsertRow` is renamed
`insertPair` in its own commit after the behavior lands."

**Files:**
- Modify: `api/backend-postgres.ts`

- [ ] **Step 1: Pure rename**

The function, and its local `collection` (the `path` column's
value, named before the column was):

```bash
perl -pi -e 's/\bupsertRow\b/insertPair/g' api/backend-postgres.ts
perl -0pi -e 's/const collection = textField\(row, \x27path\x27\);/const path = textField(row, \x27path\x27);/; s/\$\{id\}, \$\{collection\}, \$\{name\}/\${id}, \${path}, \${name}/' api/backend-postgres.ts
grep -n "collection" api/backend-postgres.ts   # none inside insertPair
grep -rn "upsertRow" api tests server *.md | grep -v docs/superpowers   # none
./test validate
git add -A && git commit -m "Rename upsertRow to insertPair"
```

## Phase E — `timestamptz` (spec § Sequence 6)

### Task 15: Store the stamps as `timestamptz`

**Spec:** § Design: timestamptz — the DDL (two `timestamptz
NOT NULL` columns, the two CHECK regexes gone), every read's
explicit column list with the two `to_char` stamps, the
`::timestamptz` casts on the write, `SCHEMA.svg` regenerated;
§ Proof — the DDL pin. Deviations 5, 6, 7. `./test postgres`
green here. Render needs a wipe and reseed after the deploy
that carries this commit (the operator's act).

**Files:**
- Modify: `tests/schema-lifecycle.test.ts` (the live DDL pin)
- Modify: `tests/backend-postgres.test.ts` (two `fakeClient` pins)
- Modify: `api/schema-postgres.ts`
- Modify: `api/backend-postgres.ts` (eight SELECT lists, the insert's casts)
- Regenerate: `SCHEMA.svg`

- [ ] **Step 1: The failing DDL pin (Postgres runner)**

In `tests/schema-lifecycle.test.ts` add `assertEquals` to the
`@std/assert` import and, inside the `else` branch after the
uuid test:

```ts
    Deno.test(
        'the two stamps are timestamptz with no CHECK',
        async () => {
            const columns = await sql.query<{
                column_name: string;
                data_type: string;
            }>`
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'message_pairs'
                  AND column_name IN (
                      'request_at', 'response_at'
                  )
                ORDER BY column_name
            `;
            assertEquals(
                columns.map((row) => row.data_type),
                [
                    'timestamp with time zone',
                    'timestamp with time zone',
                ],
            );
            const checks = await sql.query<{
                conname: string;
            }>`
                SELECT conname FROM pg_constraint
                WHERE conrelid = 'message_pairs'::regclass
                  AND conname LIKE '%_at_chk'
            `;
            assertEquals(checks, []);
        },
    );
```

- [ ] **Step 2: The failing select-list and cast pins (memory runner; Deviation 5)**

In `tests/backend-postgres.test.ts` add:

```ts
const ZULU_REQUEST_AT =
    /to_char\(request_at AT TIME ZONE 'UTC',\s*'YYYY-MM-DD"T"HH24:MI:SS\.US"Z"'\)\s*AS request_at/;
const ZULU_RESPONSE_AT =
    /to_char\(response_at AT TIME ZONE 'UTC',\s*'YYYY-MM-DD"T"HH24:MI:SS\.US"Z"'\)\s*AS response_at/;

Deno.test('every pair read formats both stamps as zulu text',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    const path = MESSAGE_PAIR_ROW.path;
    await backend.transaction('readonly', async (tx) => {
        await tx.getById(MESSAGE_PAIR_ROW.id);
        await tx.getAll();
        await tx.getCollectionPairs(path);
        await tx.getPairsByRequestHash(
            MESSAGE_PAIR_ROW.request_hash,
        );
        await tx.getDocumentHistory(path, MESSAGE_PAIR_ROW.name);
        await tx.getWhereBody(path, { code: 'abc' });
        await tx.getHeadPair(path, MESSAGE_PAIR_ROW.name);
        await tx.getCollectionHeadPairs(path);
    });
    assertStrictEquals(fake.calls.length, 8);
    for (const call of fake.calls) {
        assertMatch(call.text, ZULU_REQUEST_AT);
        assertMatch(call.text, ZULU_RESPONSE_AT);
    }
});

Deno.test('append casts both stamps to timestamptz',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.transaction(
        'readwrite',
        (tx) => tx.append(MESSAGE_PAIR_ROW),
    );
    const text = fake.calls[0]!.text;
    assertMatch(text, /\$6::timestamptz/);
    assertMatch(text, /\$9::timestamptz/);
});
```

(The regex lines exceed 78 characters; split each pattern with
`new RegExp('to_char\\(request_at AT TIME ZONE \'UTC\',\\s*'
+ '\'YYYY-MM-DD"T"HH24:MI:SS\\.US"Z"\'\\)\\s*AS request_at')`
or equivalent so the lint passes.) Run the file: both FAIL.

- [ ] **Step 3: The DDL**

In `api/schema-postgres.ts` replace the two stamp columns:

```ts
    request_at timestamptz NOT NULL,
    request_hash text COLLATE "C" NOT NULL
        CONSTRAINT message_pairs_request_hash_chk
        CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    request bytea NOT NULL,
    response_at timestamptz NOT NULL,
```

(`message_pairs_request_at_chk` and
`message_pairs_response_at_chk` are gone; the indexes are
unchanged.)

- [ ] **Step 4: The eight SELECT lists**

In `api/backend-postgres.ts`, above the first SQL function:

```ts
// Every pair read names its columns so the two stamps come
// back as the six-digit zulu text the gate minted: the
// columns are timestamptz, the seam speaks RFC-3339. The
// list is written per statement — the SqlClient seam carries
// no fragments — and ORDER BY qualifies the native column,
// because a bare name binds to the alias.
```

Then rewrite each of `selectPairById`, `selectAll`,
`selectCollectionPairs`, `selectPairsByRequestHash`,
`selectDocumentHistory`, `selectWhereBody`, `selectHeadPair`,
`selectCollectionHeadPairs` so its `SELECT *` becomes this
list (shown on `selectCollectionPairs`; the others differ
only in their WHERE / ORDER BY / LIMIT, which stay as they
are, with the ORDER BY qualified):

```ts
async function selectCollectionPairs(
    sql: SqlClient,
    path: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT id, path, name, requester_identity_id, method,
            to_char(request_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                AS request_at,
            request_hash, request,
            to_char(response_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                AS response_at,
            response, operation_id
        FROM message_pairs
        WHERE path = ${path}
        ORDER BY message_pairs.response_at, message_pairs.id
    `;
}
```

`selectPairById` has no ORDER BY. `selectAll`,
`selectPairsByRequestHash`, `selectDocumentHistory`, and
`selectWhereBody` order by `message_pairs.response_at,
message_pairs.id`. `selectHeadPair` orders by
`message_pairs.response_at DESC, message_pairs.id DESC` under
its `LIMIT 1`. `selectCollectionHeadPairs` keeps its inner
`SELECT DISTINCT ON (name) *` (native columns, no aliases) and
formats in the outer list:

```ts
    return sql.query`
        SELECT id, path, name, requester_identity_id, method,
            to_char(request_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                AS request_at,
            request_hash, request,
            to_char(response_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                AS response_at,
            response, operation_id
        FROM (
            SELECT DISTINCT ON (name) *
            FROM message_pairs
            WHERE path = ${path}
              AND method IN ('PUT', 'DELETE')
            ORDER BY name DESC, response_at DESC, id DESC
        ) heads
        WHERE method = 'PUT'
        ORDER BY heads.response_at, heads.id
    `;
```

`selectHead` (`SELECT id, method`) and `lockHead` (`SELECT
id`) read no stamp and are unchanged.

- [ ] **Step 5: The casts on the write**

In `insertPair`'s VALUES: `${requestAt}::timestamptz` and
`${responseAt}::timestamptz`. postgres.js sends the strings
untyped; the cast makes the server parse them at full
resolution and makes the intent visible.

- [ ] **Step 6: The SVG**

```bash
./bin/generate-schema-svg
git diff --stat SCHEMA.svg          # may or may not change: the SVG draws types from api/types.ts
./bin/generate-schema-svg --check   # clean
```

- [ ] **Step 7: Green on both runners, commit**

```bash
./test validate
./test postgres     # the DDL pin, every plan pin, pg-seed, pg-boot, identifier order
grep -rn "_at_chk\|SELECT \* FROM message_pairs" api   # none
git add -A && git commit -m "Store the stamps as timestamptz"
```

### Task 16: Round-trip the padded stamps

**Spec:** § Proof (timestamptz) — "An acceptance case on the
Postgres runner round-trips the two padded stamps." Deviation
9.

**Files:**
- Modify: `tests/store-acceptance.ts`

- [ ] **Step 1: The case**

```ts
    Deno.test(name + ': padded stamps round-trip byte for'
    + ' byte', async () => {
        const { db } = await ready();
        const id = generateIdentifier();
        const row = {
            ...pairRow(
                HEAD_PATH, 'stamp', 'PUT',
                '2026-03-04T05:06:07.100000Z', 1,
            ),
            request_at: '2026-03-04T05:06:07.000000Z',
        };
        await db.messagePairs.append(id, row);
        const stored = await db.messagePairs.getById(id);
        assertStrictEquals(
            stored.request_at, '2026-03-04T05:06:07.000000Z',
        );
        assertStrictEquals(
            stored.response_at, '2026-03-04T05:06:07.100000Z',
        );
    });
```

- [ ] **Step 2: Run both runners and commit**

```bash
./test validate
./test postgres
git add -A && git commit -m "Round-trip padded stamps through the seam"
```

### Task 17: Say `timestamptz` in SCHEMA.md

**Spec:** § Design: timestamptz — "SCHEMA.md item 2 is
rewritten from 'the six-digit CHECK' to the type plus the
formatter."

**Files:**
- Modify: `SCHEMA.md`

- [ ] **Step 1: Item 2 and the Timestamps section**

Under "## What the DDL buys you", item 2 becomes:

"2. **`timestamptz` plus the formatter** — `request_at` and
   `response_at` are `timestamptz NOT NULL`; the type is the
   storage-edge validator (a month-13 stamp is rejected where
   the old regex accepted it), and every read formats them
   back to six-digit zulu text with `to_char(… AT TIME ZONE
   'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
   (`api/backend-postgres.ts`), so the native `(response_at,
   id)` order and the seam's lexical order agree."

Item 6 ("The CHECK constraints") still names
`message_pairs_*_chk`; it stays. Under "## Timestamps":

"Every timestamp crosses the seam as RFC-3339 zulu at exactly
six fraction digits; the validation gate rejects any other
width. Postgres holds the two envelope stamps as `timestamptz`
and formats them back on every read (`tests/timestamps.test.ts`
pins the mint; the Postgres acceptance suite pins the round
trip). Render to local time for display only."

- [ ] **Step 2: Commit**

```bash
grep -n "six-digit CHECK\|_at_chk" SCHEMA.md   # none
./test validate
git add -A && git commit -m "Say timestamptz in SCHEMA.md"
```

## Phase F — The report (spec § Sequence 7)

### Task 18: Write the examination report

**Spec:** § The report, § Scope 6–9, § Design: heads in SQL
(body filters), § Non-goals. Deviation 8.

**Files:**
- Create: `docs/superpowers/specs/<today>-one-table-examined-report.md`
  (`today` = `date +%F`)

- [ ] **Step 1: Capture every plan**

Temporarily add `console.log(text);` as the first line of the
body of `assertIndexPlan` AND before each `const text =
explainText(plans);` result is asserted in the pins that do
not call `assertIndexPlan` (the ledger scan, the two head
pins, the insert pin) — simplest: add `console.log(plans)`
right after each `const plans = await sql.query…` in
`tests/pg-explain.test.ts`. Then:

```bash
./test postgres 2>&1 | tee "$TMPDIR/explain-plans.txt"
git checkout tests/pg-explain.test.ts
git status --short   # clean
```

Also record the base and the versions:

```bash
git rev-parse HEAD
docker run --rm postgres:18 postgres --version
```

Render's Postgres is v18 (spec § Decisions 1); say so.

- [ ] **Step 2: Verify the facts the analyses cite**

```bash
grep -n "ADVISORY_KEY_HEX_DIGITS\|POOL_MAX\|BigInt" api/advisory-lock.ts
grep -n "Number(await advisoryKey" api/backend-postgres.ts
sed -n '220,230p' ~/Library/Caches/deno/npm/registry.npmjs.org/postgres/3.4.9/src/types.js   # inferType: 0 for strings and numbers
grep -n "IMMUTABLE\|convert_from" api/schema-postgres.ts
grep -n "requestAt: nowUtc()" api/request-context.ts
grep -n "Date.now()\|readCappedBody(request)\|throttle.limited" server/http-server.ts
grep -n "response_at: nowUtc()" api/message-pair.ts
grep -n "messagePairs.getAll()" api/*.ts     # the six folds
grep -rn "appendMessagePairOnce(" api | grep -vc "function appendMessagePairOnce"    # 96 today
grep -rn "appendMessagePairAlways(" api | grep -vc "function appendMessagePairAlways"  # 6 today
grep -c "appendMessagePairOnce(" api/routes.ts                                        # 73 today
grep -n "name: ''" api/message-pair.ts api/path-and-name.ts
grep -n "?? ''" api/backend-buffer-tx.ts
```

Every number the report states comes from these commands, run
on the branch, today.

- [ ] **Step 3: Write the report**

Structure and content:

```markdown
# The one table, examined: report

- Date: <today>
- Base: <sha from Step 1>, branch `2026-09-04-one-table-examined`
- Postgres: 18.<minor> (compose `postgres:18`); Render v18
- Spec: docs/superpowers/specs/2026-09-04-one-table-examined-design.md
- Closes: TODO.md `## Critical product path` item 1

## The statements and their pins

One section per statement, eleven in all, each with: the SQL
as `api/backend-postgres.ts` issues it (the column list
elided to `<columns>` after Task 15), the pin's name in
`tests/pg-explain.test.ts`, and the captured plan text. In
order: `selectPairById`, `selectAll`, `selectCollectionPairs`,
`selectPairsByRequestHash`, `selectDocumentHistory`,
`selectWhereBody`, `selectHead`, `selectHeadPair`,
`selectCollectionHeadPairs`, the head lock (`lockHead`),
`insertPair`. Say once, under `selectAll`, that it is the one
statement allowed to seq-scan until the folds retire it. Say
once, at the top, that the pins EXPLAIN `SELECT *` because a
`to_char` in the list adds no plan node (Deviation 7). The
`schema_marker` statements, the advisory locks, and
`pg_notify` are out of scope (spec § Scope 1).

## The four corrections

Each with before and after, the commit that landed it, and
its proof:

1. Heads in SQL — before: `livePutsOf` / `livePutOf` /
   `latestOf` folding a whole collection in the process, plus
   `documentHeadAt`'s own loop (three implementations of "the
   head"); after: `selectCollectionHeadPairs` (`DISTINCT ON`
   read backward off `message_pairs_document`) and
   `selectHeadPair` (`LIMIT 1` off the same walk), the memory
   backend's `latestByKey` mirrors, one head. Proof: the two
   acceptance cases on both runners, the two head pins.
2. Document reads restored — before: thirteen sites reading a
   collection and filtering to one name; after: each reads
   `getDocumentHistory(path, name)`. List the thirteen by
   file and function (Deviation 1's attribution). The PATCH
   revision lookup joins by `operation_id` and lost its dead
   branch. Proof: the derive and drift suites, byte-identical.
3. Append-only write — before: `ON CONFLICT (id) DO UPDATE`
   (the store could rewrite a pair) and a memory `put` that
   replaced the row; after: `DO NOTHING RETURNING id`, the
   memory mirror, `append` reports `boolean`, the writer
   throws on `false`. What did not change: the 201/200
   decision rides `request_hash`. Proof: the acceptance case,
   `Conflict Resolution: NOTHING`, the race pins green
   unchanged.
4. `timestamptz` — before: `text COLLATE "C"` under a regex
   that `2026-13-45T25:61:61.000000Z` satisfies; after: the
   type, `to_char` on every read, `::timestamptz` on the
   write, each index entry ~20 bytes narrower per stamp.
   Proof: the DDL pin, the round trip, the select-list pins.

## Analyses from the tree (spec § Scope 6)

- The 52-bit advisory key: `advisoryKey` takes 13 hex digits
  of SHA-256 (52 bits) as a `bigint`; `advisoryLock` passes
  `Number(…)` untyped, and postgres.js 3.4.9's `inferType`
  (src/types.js:220) returns 0 for a number, so the server
  parses the decimal text into the `bigint` the lock function
  takes — exact, because 52 bits sit under 2^53. Collision
  bound for `POOL_MAX` = 10 concurrent labels: the birthday
  bound over 2^52, ≈ 45/2^52 ≈ 1e-14 per instant; a collision
  only serializes unrelated work.
- The IMMUTABLE `message_body`: `convert_from` is STABLE
  because its result depends on the database encoding, fixed
  at `CREATE DATABASE`; the declaration is a lie Postgres
  tolerates, and the GIN index cannot drift unless the
  database is recreated, when the index is rebuilt anyway.
  It serves one lookup (the authorize-code body search) and
  leaves with item 2.
- Tenancy: both composite indexes lead with `path`; the
  collection, document, and head plans show it as the first
  index condition — quote the `Index Cond` line from each
  captured plan.

## The stamps, honestly (spec § Scope 7)

`request_at` is minted in `incomingContext`
(`api/request-context.ts`) as the gate's first act, but by
then `server/http-server.ts` has recorded its own `Date.now()`
for the request log (`started`), awaited the whole body
through `readCappedBody`, routed, sniffed the grant type, and
throttled: the persisted stamp means "body received and
routed", not "arrived", and the log runs on a second clock.
`response_at` is minted at the row write inside the
transaction (`writeMessagePairRows`), after the locks, before
commit and before any byte is sent: the response's origination
time in RFC 9110's sense, from which the wire `Date` derives
(`httpDateOf`); stamping it after the locks is what makes
`(response_at, id)` order agree with lock order. Recommendation
to item 5, whose log work owns the request clock: one clock,
read once at arrival, carried in the context.

## The six folds, classified (spec § Scope 8)

For each: where it reads `getAll()`, the exact-read shape it
must become, and the data-shape decision that precedes it.
Verify each function and line on the branch before writing.

1. `deriveIdentityTokens` (`api/derive-identity-tokens.ts`) —
   scans the ledger to discover every `/identities/<id>/tokens/`
   path plus the flat `/identity-tokens/` leftover. Shape: a
   collection read per identity for the identity in hand; the
   chain lookup by jti needs a document read at a path derived
   from the jti. Decision first: the token chain's path from a
   jti, and the retirement of the flat leftover prefix.
2. `invitationOpStates` (`api/derive-invitations.ts`) — scans
   for `/invitations/<id>/<op>/` paths. Shape:
   `invitationOpStateFor(id)` already exists (three collection
   reads per id); the list derivation enumerates ids from the
   invitations collection and calls it. No decision required;
   a data-shape decision (record the terminal op as a document
   at the invitation's own path) would make it one document
   read per id.
3. `deriveIdentityPiiRows` (`api/derive-identity-spine.ts`) —
   scans for `/identities/<id>/pii/` paths (name `''`). Shape:
   the identities collection lists identities, then one
   document read per identity. Decision first: the PII slot's
   (path, name) — today `path = /identities/<id>/pii/, name =
   ''`; the honest reading is `path = /identities/<id>/, name
   = pii` (path-and-name § Vocabulary).
4. `deriveStateFieldValueReferrers`
   (`api/derive-state-field-values.ts`) — scans for transition
   pairs naming attribute ids, inside a write-gate transaction.
   Shape: enumerate work-order names from
   `getCollectionPairs(work-orders path)` (every pair, so
   deleted work orders are discoverable — the header comment's
   objection), then one collection read per transition path.
   No decision required; the RESTRICT count stays exact.
5. `deriveWorkOrderLifecycle` (`api/derive-states.ts`) —
   replays the whole ledger for every work order of every
   organization. Shape: `workOrderLifecycleStatesFor(org, id)`
   exists; the multi-work-order reader enumerates
   organizations, then names from each work-orders collection.
   Decision first: whether the multi-reader has a product
   caller at all (name its callers).
6. `deriveInvitationStates` (`api/derive-states.ts`) — scans
   the ledger for invitations and their ops. Shape:
   `invitationLifecycleStatesFor(id)` exists; enumerate ids
   from `getCollectionPairs(INVITATIONS_PREFIX)`. No decision
   required.

`getAll` and `selectAll` retire with the last fold.

## Body filters (spec § Design: heads in SQL)

No live read filters heads by a body field. The only correct
pushdown wraps head selection: a predicate applied before the
head is chosen lets a superseded version's match elect the
wrong head. The index-driven spelling is an anti-join — a GIN
bitmap over candidates verified by a `NOT EXISTS` probe on the
document index for a later PUT or DELETE at the same path and
name. Recorded for the day it has a caller.

## The walk's findings

The spec's list (§ The report), each line verified against the
branch with the commands in Step 2, plus the two streaming
findings and the stored `response-id` line from the
path-and-name spec's § Findings:

- Three implementations of "the head", now one.
- <N> `appendMessagePairOnce` sites and <M>
  `appendMessagePairAlways` sites, <K> of them in
  `api/routes.ts`, because each handler owns its own storage.
- The authorize-code lookup is a document read done as a body
  search; the GIN index exists for it alone; the hashed name
  is the design handed to item 2.
- Operation pairs store `name = ''`, a sentinel for "no
  document".
- The two advisory locks are constraints in disguise:
  `lockRequest` stands in for `UNIQUE (request_hash)`, blocked
  by the three auth routes that store duplicate hashes until
  item 2; `lockDocument` stands in for "one genesis per
  document", which the ledger cannot express until a pair
  records whether it had a predecessor. `lockHead` is the ETag
  pin and stays.
- The collection GET reads its collection twice, heads and
  pairs; item 7 retires the second read.
- The memory backend's sort coerces `response_at` with `?? ''`
  on a NOT NULL column (`byResponseAtThenId`).
- The request log and the persisted `request_at` run on two
  clocks, and the persisted one starts after the body.
- Document GET rebuilds the response instead of streaming the
  stored column; collection GET parses N bodies to rebuild one
  array (path-and-name § Findings).
- The stored response wire carries a `response-id` header line
  that never reaches the HTTP wire (path-and-name Deviation 4).
```

- [ ] **Step 4: Commit**

```bash
ls docs/superpowers/specs/ | grep one-table-examined-report
./test validate
git add -A && git commit -m "Report on the one table, examined"
```

## Phase G — Closing the item (spec § Sequence 8)

### Task 19: Close TODO.md item 1 and land the four deferred bullets

**Spec:** § Closing the item, § Deferred, in TODO's voice.

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Item 1 leaves; the count and the two mentions follow**

Delete item 1 (the block from `1. The one table, examined —`
through `… items 2, 5, 8, 10, and 12 design against.`). The
remaining items keep their numbers (the list now starts at
`2.`). In the `## Critical product path` intro, "Twelve items,
in this order" → "Eleven items, in this order". Item 12's
last sentence "Consumes items 3, 5, 8, and item 1's lock and
growth findings." → "Consumes items 3, 5, 8, and the
examination report's lock and growth findings
(`docs/superpowers/specs/<today>-one-table-examined-report.md`)."
Under `## Sequencing`, "- 1 → 2, 5, 8, 10, 12 (the report's
findings are their oracles)" → "- The examination report
(`docs/superpowers/specs/<today>-one-table-examined-report.md`)
→ 2, 5, 8, 10, 12 (its findings are their oracles)".

```bash
grep -n "item 1\b\|Item 1\b\|Twelve items" TODO.md   # none
```

- [ ] **Step 2: The four bullets, verbatim, at the top of `## Later work`**

Insert immediately after the `## Later work` heading (before
the `render.yaml` bullet), exactly as the spec § Deferred
gives them:

```markdown
- One gate for the write. Ninety-six `appendMessagePairOnce`
  sites and six `appendMessagePairAlways` sites, 73 of them in
  `api/routes.ts`, because each handler owns its own storage
  instead of returning its pairs for one place to store. A
  handler returns `MessagePair[]`; the gate appends them once,
  under one lock order, with one notification. Lands beside
  items 7 and 10, which rewrite the largest handlers. Oracle:
  one append site in `api/api.ts`, zero in `api/routes.ts`.
- Every read is a collection or a document. The six
  whole-ledger folds, `deriveIdentityTokens`,
  `invitationOpStates`, `deriveIdentityPiiRows`,
  `deriveStateFieldValueReferrers`, `deriveWorkOrderLifecycle`,
  `deriveInvitationStates`, each take the exact-read shape the
  examination report names for them, with the data-shape
  decisions it names first, the token chain's path from a jti
  among them. `getAll` and `selectAll` retire with the last
  fold. Oracle: no caller of `getAll` in `api/`, and the
  whole-ledger pin deleted.
- The ledger sweep, built into `./bin/measure` the way
  `./deploy` grew modes. A ledger mode that subsumes a
  generator and a loader: the mock seed as the base, a modeled
  year of growth on top, every model constant a CLI argument
  (seats, working days, logins and refreshes and document
  writes per seat-day, revision share, neighbor size); base
  through `postMockDataLoad`, growth in batches of 1000 through
  the seam's `append` with modeled stamps, formed by the real
  pair formers. A decade sweep at 10k, 100k, and 1M pairs.
  `EXPLAIN (ANALYZE, BUFFERS)` per statement with parameters
  chosen by query, and the size at which any statement crosses
  30 ms. Two hundred real writes through the gate per size;
  per-index bytes, rebuild time, and the write sample with each
  index dropped. A neighbor run at 100k this tenant and 900k
  neighbor. Statistics discipline: snapshot
  `pg_stat_user_tables`, then `VACUUM (ANALYZE)`, re-ANALYZE
  after every rebuild, stats recorded per measurement. Local
  compose Postgres 18 on tmpfs, Render v18; timings are lower
  bounds. Loopback-only URL guard; a private schema per size;
  JSON under `measurements/ledger/`. Oracle: committed JSON per
  size and a report section per statement naming its 30 ms
  crossing or "beyond 1M".
- Growth: bytes per pair with two wire messages stored, heap
  against index bytes, `pg_dump` size at 1M, and autovacuum's
  insert-threshold behavior on the insert-only table. Oracle:
  numbers in the sweep's JSON and a backup-size line item 5
  can plan against.
```

The counts were measured on the rebased branch at planning
(96 once, 6 always, 73 in `api/routes.ts`) and match the
spec's words. If Task 18's Step 2 finds them changed, the
report and this bullet carry the measured numbers; say so in
the handoff.

- [ ] **Step 3: Commit**

```bash
./test validate
git add -A && git commit -m "Close the one-table item; defer the sweep"
```

### Task 20: Final verification and landing

- [ ] **Step 1: The full gate on both runners**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
./test postgres
```

Both green. Then the vocabulary and covenant proof:

```bash
grep -rn "livePutOf\|latestOf\|livePutsOf\|upsertRow\|DO UPDATE\|_at_chk\|SELECT \* FROM message_pairs" api server tests | grep -v "tests/pg-explain.test.ts"   # none
grep -rn "getCollectionPairs(" api/derive-ideas.ts api/derive-flows.ts api/derive-projects.ts api/derive-record-types.ts api/derive-objectives.ts api/derive-record-instances.ts   # only the collection derives: deriveIdeas, deriveIdeaSubmissions, deriveFlows, flowGraphBindingsFromMessagePairs, resolveFlowUndoTarget's undo read, deriveProjects, deriveRecordTypeCollection, deriveInstanceCollection
grep -c "Deno.test(" tests/pg-explain.test.ts   # 11 pins
```

- [ ] **Step 2: Layer 2 if Chrome is available**

```bash
./test validate browser
```

If Chrome is not reachable from the sandbox, say so in the
handoff; the operator runs it before a build.

- [ ] **Step 3: Land (the operator's or the orchestrator's call)**

```bash
git rebase master          # amend until every commit is green
cd /Users/tmornini/code/fusion-angle
git merge --ff-only 2026-09-04-one-table-examined
git worktree remove .worktrees/2026-09-04-one-table-examined
git branch -d 2026-09-04-one-table-examined
```

Render: the DDL change (Task 15) means the operator wipes and
reseeds after the deploy that carries it. Production holds
mock data. The executor runs no Render command.

---

## Self-review against the spec

- **§ Scope 1, § The pins** — eleven pins: `selectPairById`
  (existing), `selectAll` (1), `selectCollectionPairs`
  (existing), `selectPairsByRequestHash` (existing),
  `selectDocumentHistory` (existing), `selectWhereBody`
  (existing), `selectHead` (existing, strengthened in 1),
  `selectHeadPair` (4), `selectCollectionHeadPairs` (4), the
  head lock (1), `insertPair` (13).
- **§ Design: heads in SQL** — the two statements and the
  seam names (2); `getHead` narrow (2); the store's three
  reads and `documentHeadAt` (3); the three folds gone (3);
  the memory `latestByKey` mirrors (2); body filters recorded
  in the report (18); § Proof (2, 4).
- **§ Design: document reads restored** — thirteen sites
  (5–11, Deviation 1); the PATCH site's two fixes (11).
- **§ Design: append-only write** — covenant, `DO NOTHING
  RETURNING id`, memory mirror, boolean interface, the
  writer's throw (12); what does not change, stated (12 Step
  8's race run); `Conflict Resolution: NOTHING` (13); the
  rename (14).
- **§ Design: timestamptz** — DDL, reads, writes, round trip,
  faults (no new mapping — `api/errors-postgres.ts` untouched),
  memory unchanged, SVG, SCHEMA.md, Render note (15–17).
- **§ Scope 6–9, § The report** — (18).
- **§ Closing the item, § Deferred** — (19).
- **§ Testing** — Layer 1 memory acceptance (2, 12, 16), the
  derives' suites (5–11); `./test postgres` at 1, 2, 4, 12,
  13, 15, 16, 20.
- **§ Sequence** — followed in order; Deviations 1–9 stated.
- **§ Non-goals** — no task touches the six folds' code,
  `selectAll`, `getAll`, the append sites, the GIN index, the
  authorize-code lookup, or the E13 comment.

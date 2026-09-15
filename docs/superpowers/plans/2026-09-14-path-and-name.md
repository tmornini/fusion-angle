# Path and name — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this spec's worktree (AGENTS.md
> § Worktrees): `.worktrees/2026-09-14-path-and-name`,
> branch `2026-09-14-path-and-name`.

> **For the dispatching orchestrator (AGENTS.md § Subagents):**
> every subagent prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then push down: the 78-char lint on
> code/scripts (not `.md`), 4-space indent, the `org`
> identifier ban (spell `organization`), present-tense-
> imperative ~50-char commit subjects with the mandated
> `Co-Authored-By` trailer, the Sin of Test Weakening (when
> test and code diverge the code changes — except where THIS
> plan names a covenant the spec itself rewrote: a removed
> primitive's test leaves with it, and a renamed identifier's
> pin follows the rename), the Sin of Unbidden Helper Code
> (each task's diff is its story — nothing more), the Sin of
> Default Values (absence is `null` at the call site, never
> `??`'d in a helper), and the codebase patterns named under
> "Context an implementer must know". Subagents work in this
> worktree and never create their own — never pass the Agent
> tool `isolation`. One worker at a time: every task commits
> into one branch. Subagents never run `./deploy --render`.

**Goal:** One vocabulary for the ledger's read and write
chain — `path` and `name` from the two columns to the wire
`ETag` — and the removal of every dead primitive the walk
found, as a sequence of commits that each rename or remove
and never change behavior.

**Architecture:** The chain is five layers over one table:
the DDL (`api/schema-postgres.ts`), the two backends
(`api/backend-postgres.ts`, `api/backend-memory.ts` +
`api/backend-buffer-tx.ts`) behind the `Tx` handle, the seam
(`EntityStore<MessagePairEntity>` in `api/db.ts`,
implemented by `api/store-history-entity.ts`), the store
(`api/message-store.ts`), and the gate
(`api/message-pair.ts`). Every task below is a pure removal
or a pure rename at one of those layers, with its callers.
Removals first, then the seam's order promise (pinned red-
then-green on the memory runner), then the columns (DDL,
entity, storage rows, one mechanical snake_case sweep), then
the domain fields (one mechanical camelCase sweep per token,
shadow-reviewed per file), then the seam and `Tx` names, the
`table` argument, the store, the locks, the two writers, the
wire header, and the docs.

**Tech Stack:** Deno 2.9.6, TypeScript strict under
`deno.json` (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`), `Deno.test`
+ `@std/assert`, the memory backend, `npm:postgres` behind
`api/postgres-client.ts`, Docker Postgres via
`./test postgres`. No new dependencies. `perl -pi` for the
mechanical renames.

**Spec:**
`docs/superpowers/specs/2026-09-14-path-and-name-design.md`.
Read it first; every task cites its section.

## Global Constraints

- Every commit is a pure rename or a pure removal; none
  changes behavior and none mixes the two (spec § Sequence).
- `./test validate` green on every commit. `./test postgres`
  green at the DDL commit (Task 12) and at the end (Task 26).
- Never move/rename a file and change its content in the
  same commit (AGENTS.md § Commit). A move commit may update
  the import specifiers in OTHER files so the tree stays
  green.
- Absence is `null` at every layer; the store's `undefined`
  goes (spec § Vocabulary). Absence is modeled at the call
  site, never `??`'d in a helper.
- Vocabulary (spec § Vocabulary): `uri_collection` /
  `uriCollection` → `path`; `uri_id` / `uriId` → `name`;
  `pathname` stays; "address" is retired and reads `path`,
  `name`, or `document`; `message_pairs_address` →
  `message_pairs_document`; "head" and the pair `id` stay.
- 78-character lines in every `.ts` and every script
  `./test lint` reads; `.md` files are exempt.
- `export DENO_DIR="$TMPDIR/deno-dir"` before any `deno`
  command, `./test`, or `./deploy` in the sandbox.
- One worktree, one branch, one worker. Commit subjects
  ≈50 chars, present-tense imperative, no body, then the
  trailer:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

## Context an implementer must know

**Where the chain lives.** `api/db.ts` declares
`EntityStore`, `Tx`, `WriteLocks`, `StorageBackend`,
`TxRunner`, `DbAdapter`, `TABLE_NAMES`, `MESSAGE_TABLES`,
`TABLE_INDEXES`, `assertGetWhereColumn`.
`api/store-history-entity.ts` is the one `EntityStore`
implementation. `api/db-backed.ts` builds the adapter over
either backend and derives `WriteLocks` from a `Tx`
(`writeLocksOf`). `api/backend-postgres.ts` holds the
`PostgresTx` factory and every SQL function.
`api/backend-buffer-tx.ts` is the memory `Tx` over a copied
buffer; `api/backend-memory.ts` owns the tables Map and the
serializer. `api/message-store.ts` is `messageStore(db)`.
`api/message-pair.ts` is the gate: `MessagePair`,
`formWriteMessagePair`, the two writers, `coordinateWrite`,
`wireHeadersFor`, `streamGetFromStored`.
`api/message-address.ts` resolves a route into
`{ uriCollection, uriId }`. `api/schema-postgres.ts` is the
DDL. `web-app/app/schema-svg.ts` parses `db.ts`, `types.ts`,
and `schema-postgres.ts` to draw `SCHEMA.svg`; `./test
validate` runs `generate-schema-svg --check`, so the SVG
regenerates in the same commit as any DDL change
(`./bin/generate-schema-svg` writes it).

**The test runners.** `./test` is the memory suite
(`tests/*.test.ts`, TZ=UTC, then `tests/tz/`). `./test
postgres` starts its own Docker Postgres and runs
`tests/pg-acceptance.test.ts`, `tests/pg-races.test.ts`,
`tests/pg-boot.test.ts`, `tests/pg-seed.test.ts`,
`tests/pg-explain.test.ts`,
`tests/pg-identifier-order.test.ts`,
`tests/schema-lifecycle.test.ts`. The acceptance suite is
`tests/store-acceptance.ts` (`defineStoreAcceptance`), run
by `tests/store-acceptance-memory.test.ts` and
`tests/pg-acceptance.test.ts`. To run one memory file:

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

Type errors surface only through `deno check` (the runner
is `--no-check`), so run `./test validate` before every
commit, not just the one file.

**Patterns to match.** snake_case storage rows / camelCase
domain fields; `RequestContext` first in adapter methods;
validators at the gate, none downstream; no `any` from an
external boundary; transaction bodies await only row ops;
`readonly` on interface fields; `null` for absence; comments
explain why, never what.

**Mechanical renames.** Use word-boundary `perl -pi -e
's/\bOLD\b/NEW/g'` over an explicit file list from `grep
-rl`, then `git diff --stat` to confirm the list, then
`grep -rn '\bOLD\b'` to prove zero. For multi-line call
sites use `perl -0pi -e` (slurp mode) with `\s*` across the
newline. `deno check` catches every type-visible miss; it
cannot see a same-typed shadow (a renamed local `name`
beside a pre-existing `name`), which is why Tasks 14 and 15
carry a per-file shadow review.

## Deviations from the spec, stated up front

The walk behind this plan found six places where executing
the spec literally would break a Global Constraint or where
the spec is silent. Each is decided here so the executor
does not re-decide it; the reviewer may overrule.

1. **`Tx.clear` and "ten tests".** The spec removes
   `Tx.clear` "with `deleteAll` and the ten tests' reset".
   The tree has exactly two tests calling `tx.clear`, both
   in `tests/backend-tx-memory.test.ts`, and no test uses
   `clear` as a reset. Task 3 removes those two; no adapter
   reset is rewired because none exists.
2. **The order promise lands before the store removals.**
   The spec's Sequence puts every removal (step 2) before
   the order promise (step 3). Removing the store's
   `getAllAt` moves its caller onto the seam's
   `getAllWhere`, which on the memory backend returns
   insertion order today — a behavior change until the seam
   promises order. Task 10 pins and delivers the promise
   first; Task 11 then moves the callers.
3. **`livePutsOf` keeps its sort.** The spec removes four
   sorts in `api/message-store.ts`. Three re-sort rows the
   seam already ordered and go (Task 10b). The fourth,
   `live.sort(compareMessagePair)` in `livePutsOf`, orders
   *heads* by the head pair's `(response_at, id)`; the
   seam's row order yields the Map's first-seen order (each
   document's FIRST pair), which differs whenever documents
   interleave updates. Removing it reorders collection GET
   bodies — a behavior change. It stays, with a one-line
   comment naming why.
4. **The stored `response-id` field stays.** `formWriteMessagePair`
   writes a `response-id` header line into the STORED
   response wire (`RESPONSE_ID_FIELD`). It never reaches the
   HTTP wire (`responseFromStored` rebuilds headers from
   `wireHeadersFor`). Renaming it changes the stored `response`
   bytes of every new pair and the in-memory `responseHash`
   (`request_hash`, the replay key, is over the request wire
   alone and is untouched) — a storage change, not a wire
   rename. Task 23 retires `Response-ID` on the wire only
   and Task 25 names this field in the examination-report
   findings.
5. **Identifiers that contain the retired words.** The spec
   names the fields; these follow the same vocabulary:
   `canonicalUriCollection` → `canonicalPath`,
   `createdEntityUriId` → `createdEntityName`,
   `isGatedAddress` → `isGatedPath`, `MessageAddress` →
   `PathAndName`, `messageAddress` → `pathAndNameOf`,
   `api/message-address.ts` → `api/path-and-name.ts`,
   `tests/message-address.test.ts` →
   `tests/path-and-name.test.ts`,
   `tests/backend-address-read.test.ts` →
   `tests/backend-document-read.test.ts`, the advisory lock
   label `fusion.address.` → `fusion.document.` (Task 21;
   `fusion.dedup.` stays — "dedup" is not retired
   vocabulary), `VERSION_URI_ID` → `VERSION_NAME` and
   `idsAtAddress` → `idsAtDocument` in the pg tests.
6. **The camelCase rename is per token, not per layer.**
   `uriId` is read by the gate, the routes, the seed, and
   ~60 tests in the same token; a layer-at-a-time split
   cannot keep each commit type-clean. Task 14 renames
   `uriCollection` everywhere, Task 15 renames `uriId`
   everywhere; each is one pure rename, green, and shadow-
   reviewed file by file.

---

## Phase A — Removals (spec § Sequence 2)

### Task 1: Remove `putMany`

**Spec:** § The seam — `putMany(entries, ids)` removed; one
test caller, no product caller.

**Files:**
- Modify: `api/db.ts` (interface `EntityPut`, `EntityStore.putMany`)
- Modify: `api/store-history-entity.ts` (import, method)
- Modify: `tests/store-entity-validation.test.ts` (last test)

- [ ] **Step 1: Delete the interface and the method from the seam**

In `api/db.ts` delete the whole `EntityPut` interface and,
from `EntityStore`, the `putMany` member:

```ts
    putMany(
        entries: readonly EntityPut<T>[],
        deleteIds: readonly string[],
    ): Promise<void>;
```

- [ ] **Step 2: Delete the implementation**

In `api/store-history-entity.ts` remove `type EntityPut,`
from the import and delete the entire `async putMany(...)`
method (everything from the `async putMany(` line to its
closing brace).

- [ ] **Step 3: Delete the test that exercised it**

In `tests/store-entity-validation.test.ts` delete the
`Deno.test('HistoryEntityStore.putMany upserts every entry',
…)` block. `pass` is then unused: delete the `pass` const
and its comment too (`noUnusedLocals` fails otherwise).

- [ ] **Step 4: Verify and commit**

```bash
grep -rn "putMany\|EntityPut\b" api tests server web-app  # expect none
./test validate
git add -A && git commit -m "Remove putMany from the message-pair store"
```

### Task 2: Remove `Tx.delete`

**Spec:** § The transaction — `delete(table, id)` removed; one
caller, `putMany` (gone in Task 1).

**Files:**
- Modify: `api/db.ts` (`Tx.delete`)
- Modify: `api/backend-postgres.ts` (`delete` method, `deleteById`)
- Modify: `api/backend-buffer-tx.ts` (`delete` method)
- Modify: `tests/backend-tx-memory.test.ts`

- [ ] **Step 1: Remove the member from `Tx`**

Delete `delete(table: string, id: string): Promise<void>;`
from `Tx` in `api/db.ts`.

- [ ] **Step 2: Remove both implementations**

In `api/backend-postgres.ts` delete the `async delete(table,
id)` method in `postgresTx` and the `deleteById` function.
In `api/backend-buffer-tx.ts` delete the `async delete(table,
id)` method.

- [ ] **Step 3: Remove its test**

In `tests/backend-tx-memory.test.ts` delete
`Deno.test('delete removes a row within the tx', …)`.

- [ ] **Step 4: Verify and commit**

```bash
grep -n "deleteById\|tx\.delete\|async delete(" api/*.ts tests/backend-*.ts  # none
./test validate
git add -A && git commit -m "Remove Tx.delete"
```

### Task 3: Remove `Tx.clear`

**Spec:** § The transaction — `clear(table)` removed with
`deleteAll`. See Deviation 1: two tests, not ten.

**Files:**
- Modify: `api/db.ts` (`Tx.clear`)
- Modify: `api/backend-postgres.ts` (`clear`, `deleteAll`)
- Modify: `api/backend-buffer-tx.ts` (`clear`)
- Modify: `tests/backend-tx-memory.test.ts` (two tests)

- [ ] **Step 1: Remove the member and both implementations**

Delete `clear(table: string): Promise<void>;` from `Tx`. In
`api/backend-postgres.ts` delete the `async clear(table)`
method and the `deleteAll` function. In
`api/backend-buffer-tx.ts` delete the `async clear(table)`
method.

- [ ] **Step 2: Remove the two tests**

In `tests/backend-tx-memory.test.ts` delete
`Deno.test('clear empties a table within the tx', …)` and
`Deno.test('a rolled-back tx discards a clear', …)`.

- [ ] **Step 3: Verify and commit**

```bash
grep -n "deleteAll\|tx\.clear\|async clear(" api/*.ts tests/backend-*.ts  # none
./test validate
git add -A && git commit -m "Remove Tx.clear"
```

### Task 4: Remove `lockShared`

**Spec:** § The transaction — `lockShared(label)` removed; no
caller.

**Files:**
- Modify: `api/db.ts` (`Tx.lockShared?`)
- Modify: `api/backend-postgres.ts` (`PostgresTx.lockShared`, the method, `advisoryLock`'s `shared` branch)

- [ ] **Step 1: Remove the member from both interfaces and the method**

Delete `lockShared?(label: string): Promise<void>;` from `Tx`
and `lockShared(label: string): Promise<void>;` from
`PostgresTx`. Delete the `async lockShared(label)` method in
`postgresTx`.

- [ ] **Step 2: Narrow `advisoryLock`**

Replace the function with:

```ts
async function advisoryLock(
    sql: SqlClient,
    label: string,
): Promise<void> {
    const key = Number(await advisoryKey(label));
    await sql.query`
        SELECT pg_advisory_xact_lock(${key})
    `;
}
```

and change the surviving `lock` method's call to
`advisoryLock(sql, label)`.

- [ ] **Step 3: Verify and commit**

```bash
grep -rn "lockShared\|xact_lock_shared" api tests  # none
./test validate
git add -A && git commit -m "Remove lockShared"
```

### Task 5: Remove `Tx.stampSchemaMarker`

**Spec:** § The transaction — removed from `Tx`; the backend's
`postSchemaCreation` is the caller's.

**Files:**
- Modify: `api/db.ts` (`Tx.stampSchemaMarker?`)
- Modify: `api/backend-postgres.ts` (`PostgresTx.stampSchemaMarker`, the method)

- [ ] **Step 1: Remove it**

Delete `stampSchemaMarker?(): Promise<void>;` from `Tx`,
`stampSchemaMarker(): Promise<void>;` from `PostgresTx`, and
the `async stampSchemaMarker()` method in `postgresTx`.
`PostgresBackend.postSchemaCreation` keeps its own INSERT.

- [ ] **Step 2: Verify and commit**

```bash
grep -rn "stampSchemaMarker" api tests server  # none
./test validate
git add -A && git commit -m "Remove Tx.stampSchemaMarker"
```

### Task 6: Remove `PostgresBackend.getAddress`

**Spec:** § The transaction — a read-only transaction around
the Tx read, no product caller.

**Files:**
- Modify: `api/backend-postgres.ts` (the class method)
- Modify: `tests/backend-postgres.test.ts` ('getAddress uses collection and id, ordered')

- [ ] **Step 1: Delete the class method**

In `PostgresBackend` delete the whole `async getAddress<T>(
table, collection, uriId)` method. Keep `PostgresTx.getAddress`
and the `postgresTx` method — they stay until Task 18 renames
them.

- [ ] **Step 2: Repoint the SQL pin at the Tx read**

The test pins the SQL text, which is still wanted. Replace
its body's call:

```ts
Deno.test('getAddress uses collection and id, ordered',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.transaction(
        ['message_pairs'],
        'readonly',
        (tx) => tx.getAddress(
            'message_pairs',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
            '42',
        ),
    );
    const text = fake.calls[0]!.text;
    assertMatch(text, /WHERE uri_collection = \$1/);
    assertMatch(text, /AND uri_id = \$2/);
    assertMatch(text, /ORDER BY response_at, id/);
    assertEquals(
        fake.calls[0]!.values,
        ['/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', '42'],
    );
});
```

- [ ] **Step 3: Verify and commit**

```bash
grep -rn "backend\.getAddress\|async getAddress<T extends { id: string }>(" api/backend-postgres.ts tests  # only the tx method
./test validate
git add -A && git commit -m "Remove PostgresBackend.getAddress"
```

### Task 7: Remove `getCollectionFiltered`

**Spec:** § The store — removed with `matchesFilters`; no
caller.

**Files:**
- Modify: `api/message-store.ts`

- [ ] **Step 1: Delete the interface member, the method, and the helper**

Remove from `MessageStore`:

```ts
    getCollectionFiltered(
        collection: string,
        filters: Readonly<Record<string, string>>,
    ): Promise<unknown[]>;
```

Remove the `async getCollectionFiltered(collection, filters)`
method from the returned object, and delete the
`matchesFilters` function.

- [ ] **Step 2: Verify and commit**

```bash
grep -rn "getCollectionFiltered\|matchesFilters" api tests  # none
./test validate
git add -A && git commit -m "Remove getCollectionFiltered"
```

### Task 8: Remove `headMessagePairIdAt`

**Spec:** § The gate — removed; its four callers read `.id`
off the store's document head read (today `messageStore(db)
.get`, renamed `getDocumentHead` in Task 20).

**Files:**
- Modify: `api/message-pair.ts:364-375` (the function)
- Modify: `api/routes.ts:96-98` (import), `:1479`, `:1594`, `:2378`, `:3853` (four call sites), `:4554` (comment)
- Modify: `api/derive-flows.ts:45`, `api/document-family.ts:325`, `api/derive-documents.ts:66-68`, `api/api.ts:1562` (comments)
- Modify: `tests/message-pair.test.ts`, `tests/document-family.test.ts`, `tests/api-flow-document.test.ts`

- [ ] **Step 1: Delete the function**

In `api/message-pair.ts` delete `headMessagePairIdAt` and its
two-line comment. `messageStore` stays imported (used by
`documentHeadAt`).

- [ ] **Step 2: Repoint the four route call sites**

`api/routes.ts` does not import `messageStore` today. Add to
its imports:

```ts
import { messageStore } from './message-store.ts';
```

and remove `headMessagePairIdAt,` from the `./message-pair.ts`
import. Each of the four sites has the shape

```ts
            const latest = await headMessagePairIdAt(
                view, X.uriCollection, X.uriId,
            );
```

Rewrite each as

```ts
            const latest = (await messageStore(view).get(
                X.uriCollection, X.uriId,
            ))?.id;
```

keeping the surrounding comparison (`latest !== latchedId`
etc.) unchanged — `get` returns `undefined` for a missing
head today, so `?.id` is `undefined` exactly where the old
function returned `undefined`.

- [ ] **Step 3: Repoint the three tests**

`tests/message-pair.test.ts`: replace the import line
`headMessagePairIdAt,` with an import of `messageStore` from
`'../api/message-store.ts'`, and in 'append then head-read
round-trips' replace

```ts
    assertStrictEquals(
        await headMessagePairIdAt(
            db, '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', '42',
        ),
        messagePair.id,
    );
```

with

```ts
    assertStrictEquals(
        (await messageStore(db).get(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', '42',
        ))?.id,
        messagePair.id,
    );
```

`tests/document-family.test.ts:269` and
`tests/api-flow-document.test.ts:649`: the same rewrite (both
files already import `messageStore`? check with `grep -n
messageStore` and add the import if not).

- [ ] **Step 4: Comments**

Rewrite each comment that names `headMessagePairIdAt` to say
"the store's document head read (`messageStore(db).get`)".
Sites: `api/derive-flows.ts:45`, `api/document-family.ts:325`,
`api/derive-documents.ts:66,68`, `api/api.ts:1562`,
`api/routes.ts:4554`, `tests/document-family.test.ts:742`,
`tests/api-flow-document.test.ts:626-635` (the test title
too: 'equals the store head read's own').

- [ ] **Step 5: Verify and commit**

```bash
grep -rn "headMessagePairIdAt" api tests  # none
./test validate
git add -A && git commit -m "Remove headMessagePairIdAt"
```

### Task 9: Remove the `'create-only'` concurrency class

**Spec:** § The transaction — `ConcurrencyClass` value
`'create-only'` has no family and goes.

**Files:**
- Modify: `api/family-registry.ts:18-19`
- Modify: `api/message-pair.ts:803-806`

- [ ] **Step 1: Narrow the union**

```ts
export type ConcurrencyClass = 'simple' | 'locked';
```

- [ ] **Step 2: Narrow the gate test**

In `isGatedAddress`:

```ts
    return concurrency === 'locked';
```

(`grep -n "create-only" api` must then show only comments;
`tests/api-work-orders-verb-gaps.test.ts:23` says "create-only
PUT" about a route, not the class — leave it.)

- [ ] **Step 3: Verify and commit**

```bash
./test validate
git add -A && git commit -m "Remove the create-only concurrency class"
```

## Phase B — The seam's order promise (spec § Sequence 3)

### Task 10: Pin `(response_at, id)` order at the seam, then stop re-sorting

**Spec:** § The seam — "The seam promises `(response_at, id)`
order on both backends, pinned by the acceptance suite on
both runners. Every `.sort` in `api/message-store.ts` goes …
Postgres orders in `ORDER BY`; the memory backend orders
once in its filter." See Deviation 3 for `livePutsOf`.

**Files:**
- Modify: `tests/store-acceptance.ts` (new test)
- Modify: `api/backend-buffer-tx.ts` (`getWhere` sorts)
- Modify: `api/message-store.ts` (three sorts removed)

**Interfaces:** consumes `db.messagePairs.getAllWhere('uri_collection', c)`
and `getAllAtAddress(c, id)` as they are today.

- [ ] **Step 1: Write the failing acceptance test**

In `tests/store-acceptance.ts` add `assertEquals` to the
`@std/assert` import, `compareIdentifiers` to the
`../shared/identifier.ts` import, and
`import type { MessagePairEntity } from '../api/types.ts';`.
Add after the helpers:

```ts
const ORDER_PATH = '/order-pin/';
const ORDER_REQUESTER = 'XXZruirZyAOoRpNxaDnpSA';
const ORDER_OPERATION = '0123456789ABCDEFGHIJKw';

function orderRow(
    name: string,
    responseAt: string,
    n: number,
): Omit<MessagePairEntity, 'id'> {
    return {
        uri_collection: ORDER_PATH,
        uri_id: name,
        requester_identity_id: ORDER_REQUESTER,
        method: 'PUT',
        request_at: responseAt,
        request_hash: n.toString(16).padStart(64, '0'),
        request: 'PUT ' + ORDER_PATH + name
            + ' HTTP/1.1\r\n\r\n',
        response_at: responseAt,
        response: 'HTTP/1.1 200 OK\r\n\r\n',
        operation_id: ORDER_OPERATION,
    };
}
```

and inside `defineStoreAcceptance`, after the existing tests:

```ts
    Deno.test(name + ': seam reads are (response_at, id)'
    + ' order', async () => {
        const { db } = await ready();
        const sorted = [
            generateIdentifier(),
            generateIdentifier(),
            generateIdentifier(),
        ].sort(compareIdentifiers);
        const first = sorted[0]!;
        const second = sorted[1]!;
        const third = sorted[2]!;
        const early = '2026-01-01T00:00:00.000001Z';
        const late = '2026-01-01T00:00:00.000002Z';
        // Appended newest-first, so insertion order
        // disagrees with the promised order on every row.
        await db.messagePairs.put(
            third, orderRow('doc', late, 3),
        );
        await db.messagePairs.put(
            second, orderRow('doc', early, 2),
        );
        await db.messagePairs.put(
            first, orderRow('doc', early, 1),
        );
        const history = await db.messagePairs
            .getAllAtAddress(ORDER_PATH, 'doc');
        assertEquals(
            history.map((row) => row.id),
            [first, second, third],
        );
        const collection = await db.messagePairs
            .getAllWhere('uri_collection', ORDER_PATH);
        assertEquals(
            collection.map((row) => row.id),
            [first, second, third],
        );
    });
```

(The literal is typed as the entity minus its id, so a
missing field fails `deno check`; the store's validator
re-checks every field at run time.)

- [ ] **Step 2: Run it red on the memory runner**

```bash
deno test … tests/store-acceptance-memory.test.ts
```

Expected: FAIL on the `collection` assertion — memory
`getWhere` returns insertion order `[third, second, first]`.
The `history` assertion passes (memory `getAddress` already
sorts).

- [ ] **Step 3: Order the memory `getWhere` once, in its filter**

In `api/backend-buffer-tx.ts` the `getAddress` and
`getWhereBody` methods each carry an identical
`.sort((left, right) => { … compareResponseAtThenId(… ?? '') })`
block. Three sites is the pattern: add one helper next to
`compareResponseAtThenId`:

```ts
function byResponseAtThenId(
    left: { id: string },
    right: { id: string },
): number {
    const l = left as Record<string, unknown>;
    const r = right as Record<string, unknown>;
    return compareResponseAtThenId(
        left, right,
        String(l['response_at'] ?? ''),
        String(r['response_at'] ?? ''),
    );
}
```

(The `?? ''` on a NOT NULL column is a named finding for the
other spec — reproduce it, do not fix it.) Replace both
inline sort callbacks with `.sort(byResponseAtThenId)` and
add the same call to `getWhere`:

```ts
        async getWhere<T extends { id: string }>(
            table: string,
            column: string,
            key: string,
        ): Promise<T[]> {
            assertGetWhereColumn(table, column);
            return scoped(table)
                .filter(row => (
                    row as Record<string, unknown>
                )[column] === key)
                .sort(byResponseAtThenId)
                .map(row => ({ ...row })) as T[];
        },
```

`tests/backend-getwhere-parity.test.ts` stays green: its rows
carry no `response_at`, so the sort falls to id order, which
equals their insertion order.

- [ ] **Step 4: Run both runners green and commit the pin**

```bash
./test validate
./test postgres   # the same test on the Postgres runner
git add -A && git commit -m "Pin (response_at, id) order at the seam"
```

- [ ] **Step 5: Remove the three double sorts in the store**

In `api/message-store.ts`:

```ts
        async getAllWhereBody(collection, containment) {
            return db.messagePairs.getAllWhereBody(
                collection, containment,
            );
        },
```

```ts
async function messagePairsInCollection(
    db: DbAdapter,
    collection: string,
): Promise<readonly MessagePairEntity[]> {
    return db.messagePairs.getAllWhere(
        'uri_collection', collection,
    );
}

async function messagePairsAt(
    db: DbAdapter,
    collection: string,
    id: string,
): Promise<readonly MessagePairEntity[]> {
    return db.messagePairs.getAllAtAddress(collection, id);
}
```

`livePutsOf` keeps `return live.sort(compareMessagePair);`
and gains the comment:

```ts
    // Heads sorted by the HEAD pair's (response_at, id).
    // The seam's row order would yield each document's
    // FIRST pair — a different order once documents
    // interleave updates.
```

Update the file's header comment to say the seam orders by
`(response_at, id)` and the store never re-sorts rows.

- [ ] **Step 6: Verify and commit**

```bash
grep -c "\.sort(" api/message-store.ts   # expect 1
./test validate
git add -A && git commit -m "Stop re-sorting seam rows in the store"
```

### Task 11: Move `getAllAt` and `getAllWhereBody` callers to the seam

**Spec:** § The store — `getAllAt(c)` removed, its one caller
calls the seam's collection read; `getAllWhereBody(c, json)`
removed, its one caller calls the seam.

**Files:**
- Modify: `api/message-store.ts` (two interface members, two methods)
- Modify: `api/document-family.ts:633`
- Modify: `api/authentication.ts:1190-1191`
- Modify: `tests/message-store.test.ts` ('getAllWhereBody matches one JSON fact')

- [ ] **Step 1: Repoint the two callers**

`api/document-family.ts:633`:

```ts
        const stored = await db.messagePairs.getAllWhere(
            'uri_collection', prefix,
        );
```

`api/authentication.ts:1190`:

```ts
    const hits = await adapter.messagePairs
        .getAllWhereBody(AUTHORIZE_PREFIX, { code });
```

`adapter` is `DbAdapter` there already (see the function's
parameter list); no import changes.

- [ ] **Step 2: Remove the two store members and methods**

Delete `getAllAt` and `getAllWhereBody` from `MessageStore`
and from the returned object in `messageStore`.

- [ ] **Step 3: Move the test onto the seam**

In `tests/message-store.test.ts` rewrite the last test to read
through `db.messagePairs.getAllWhereBody(COLLECTION, { code:
'abc' })` and retitle it 'seam getAllWhereBody matches one
JSON fact'. Its assertions stay.

- [ ] **Step 4: Verify and commit**

```bash
grep -rn "store\.getAllAt\|messageStore([a-z]*)\s*\.getAllWhereBody\|\.getAllAt(" api tests  # none
./test validate
git add -A && git commit -m "Move getAllAt and getAllWhereBody callers to the seam"
```

## Phase C — The columns (spec § Sequence 4)

### Task 12: Rename the columns to `path` and `name`

**Spec:** § Vocabulary, § Sequence 4 (first clause), § Testing
(the DDL pin). One mechanical snake_case sweep: the DDL, the
index, `MessagePairEntity`, the validator, both backends,
`TABLE_INDEXES`, every `uri_collection` / `uri_id` token in
`api/`, `server/`, `tests/`, and the regenerated
`SCHEMA.svg`. `./test postgres` green here. Render needs a
wipe and reseed after the deploy that carries this commit.

**Files:**
- Modify: `api/schema-postgres.ts`
- Modify: `api/types.ts:953-954`
- Modify: `api/validators.ts:2355-2397`
- Modify: `api/backend-postgres.ts`, `api/backend-buffer-tx.ts`, `api/db.ts`
- Modify: every file `grep -rl "uri_collection\|uri_id" api server tests` lists
- Modify: `web-app/app/schema-svg.ts:43` (`INDEX_FILL` key)
- Regenerate: `SCHEMA.svg`
- Modify: `tests/backend-postgres.test.ts` (regexes; new DDL pin)
- Modify: `tests/schema-lifecycle.test.ts` (column list)

- [ ] **Step 1: Write the failing DDL pin**

In `tests/backend-postgres.test.ts` add:

```ts
Deno.test('the columns are path and name; the document index'
+ ' names them', () => {
    assertMatch(
        POSTGRES_SCHEMA,
        /\n    path text COLLATE "C" NOT NULL\n/,
    );
    assertMatch(
        POSTGRES_SCHEMA,
        /\n    name text COLLATE "C" NOT NULL,\n/,
    );
    assertMatch(
        POSTGRES_SCHEMA,
        /CREATE INDEX IF NOT EXISTS message_pairs_document\n/,
    );
    assertMatch(
        POSTGRES_SCHEMA,
        /ON message_pairs \(path, name, response_at, id\)/,
    );
    assertNotMatch(
        POSTGRES_SCHEMA,
        /uri_collection|uri_id|message_pairs_address/,
    );
});
```

Run `tests/backend-postgres.test.ts`: FAIL (old columns).

- [ ] **Step 2: The DDL**

In `api/schema-postgres.ts`:

```ts
export const POSTGRES_MESSAGE_PAIRS_TABLE =
    String.raw`CREATE TABLE IF NOT EXISTS message_pairs (
    id uuid PRIMARY KEY,
    path text COLLATE "C" NOT NULL
        CONSTRAINT message_pairs_collection_chk
        CHECK (left(path, 1) = '/'
           AND right(path, 1) = '/'),
    name text COLLATE "C" NOT NULL,
    requester_identity_id text COLLATE "C" NOT NULL,
```

(the rest of the table unchanged) and

```ts
export const POSTGRES_INDEXES =
    String.raw`CREATE INDEX IF NOT EXISTS message_pairs_document
    ON message_pairs (path, name, response_at, id);
CREATE INDEX IF NOT EXISTS message_pairs_collection
    ON message_pairs (path, response_at, id);
```

(the replay and body indexes unchanged).

- [ ] **Step 3: The entity and the validator**

`api/types.ts`:

```ts
export interface MessagePairEntity {
    id: Id;
    path: string;
    name: string;
```

`api/validators.ts`:

```ts
const MESSAGE_PAIR_BODY_KEYS: readonly string[] = [
    'path', 'name',
    'requester_identity_id', 'method',
    'request_at', 'request_hash', 'request',
    'response_at', 'response',
    'operation_id',
];
```

and in `validateMessagePairEntity`:

```ts
    const path = pickString(body, 'path');
    if (!path.endsWith('/')) {
        throw new ValidationError(
            'MessagePairEntity.path must end with "/"',
        );
    }
    …
    return {
        path,
        name: pickString(body, 'name'),
```

`grep -n "uri_collection must end" tests/validators.test.ts`
— update that pinned message if present.

- [ ] **Step 4: The mechanical sweep of the two tokens**

```bash
FILES=$(grep -rl "uri_collection\|uri_id" api server tests web-app)
perl -pi -e 's/\buri_collection\b/path/g; s/\buri_id\b/name/g' $FILES
grep -rn "uri_collection\|uri_id" api server tests web-app bin deploy   # expect none
```

This rewrites SQL text (`WHERE path = ${key}`, `AND name =
${uriId}`, the `INSERT … (id, path, name, …)` column list
and `EXCLUDED.path` / `EXCLUDED.name` in `upsertRow`),
`textField(row, 'path')`, the buffer-tx filters
(`rec['path']`, `rec['name']`), `TABLE_INDEXES:
{ message_pairs: ['path', 'request_hash'] }`,
`assertGetWhereColumn`'s refusal (`if (column === 'name')`
with message `'getWhere does not accept name'`), every
`getAllWhere('path', …)` call, every row literal and
`.path` / `.name` property read in `api/` and `tests/`, the
pg test SQL, `tests/schema-lifecycle.test.ts`'s column list,
`tests/db-keyed-read-coverage.test.ts`'s manifest, and the
comments on the same lines. `VERSION_URI_ID` is upper-case
and untouched. Read `git diff --stat`; the file list must
equal `$FILES`.

- [ ] **Step 5: Fix the regexes the sweep did not reach**

`tests/backend-postgres.test.ts`: the regexes
`/ON message_pairs \(uri_collection, response_at, id\)/`,
`/WHERE uri_collection = \$1/`, `/AND uri_id = \$2/`,
`/uri_collection = \$1/`, and the two refusal tests' expected
messages (`'getWhere does not accept uri_id'` → `name`) —
the sweep rewrote their bare tokens, so only confirm each
now reads `path` / `name` and the tests are titled for them
('getWhere throws for name', 'memory getWhere refuses name'
in `tests/backend-address-read.test.ts`). `tests/pg-explain.test.ts`
test title 'address uses address index' → 'document read
uses the document index', expecting `'message_pairs_document'`;
'latestPutDelete uses address and pkey' expects
`'message_pairs_document'` too.

- [ ] **Step 6: The SVG**

In `web-app/app/schema-svg.ts` rename the `INDEX_FILL` key
`address` to `document` (the fill value stays). Then:

```bash
./bin/generate-schema-svg
git diff --stat SCHEMA.svg   # changed
./bin/generate-schema-svg --check   # clean
```

- [ ] **Step 7: Sweep "address" on the lines this task touched**

`git diff -U0 | grep '^+.*address'` — on each such line
say `path`, `name`, or `document` instead (e.g. the
`message-address.ts` header comment "the message plane's
(path, name)"; `db.ts`'s `lockAddress` comment stays — that
identifier is Task 21's).

- [ ] **Step 8: Verify on both runners and commit**

```bash
./test validate
./test postgres
git add -A && git commit -m "Rename the columns to path and name"
```

### Task 13: Move `message-address.ts` and its test

**Spec:** § Vocabulary ("address" retired); Deviation 5. Two
pure move commits; the content rename is Task 14.

- [ ] **Step 1: Move the module and repoint its importers**

```bash
git mv api/message-address.ts api/path-and-name.ts
perl -pi -e "s#'./message-address.ts'#'./path-and-name.ts'#" \
    api/message-pair.ts api/api.ts
perl -pi -e "s#'../api/message-address.ts'#'../api/path-and-name.ts'#" \
    tests/message-address.test.ts
./test validate
git add -A && git commit -m "Move message-address.ts to path-and-name.ts"
```

- [ ] **Step 2: Move the test**

```bash
git mv tests/message-address.test.ts tests/path-and-name.test.ts
./test validate
git add -A && git commit -m "Move message-address.test.ts to path-and-name.test.ts"
```

### Task 14: Rename `uriCollection` to `path`

**Spec:** § Vocabulary, § Sequence 4 (domain fields). One
pure rename of one token across the tree, plus the
identifiers built on it (Deviation 5, 6). Shadow-reviewed
per file: the type checker cannot see a same-typed shadow.

**Files:**
- Modify: every file `grep -rl "uriCollection\|canonicalUriCollection\|MessageAddress\|messageAddress" api server tests web-app` lists (≈70 files; `api/routes.ts`, `api/derive-states.ts`, `api/message-pair.ts`, `api/api.ts`, `api/derive-identity-spine.ts` carry most)

**Interfaces:**
- Produces: `PathAndName { readonly path: string; readonly name: string }`
  (Task 15 renames the second field — this task changes only
  `uriCollection` → `path` inside it), `pathAndNameOf(routeSegments,
  pathSegments): PathAndName`, `canonicalPath(organization,
  flatPrefix)`, `MessagePair.path`, `isGatedPath(path)`.

- [ ] **Step 1: The mechanical rename**

```bash
FILES=$(grep -rl "uriCollection\|canonicalUriCollection\|MessageAddress\|messageAddress\|isGatedAddress" api server tests web-app)
perl -pi -e 's/\bcanonicalUriCollection\b/canonicalPath/g;
             s/\bMessageAddress\b/PathAndName/g;
             s/\bmessageAddress\b/pathAndNameOf/g;
             s/\bisGatedAddress\b/isGatedPath/g;
             s/\buriCollection\b/path/g' $FILES
grep -rn "uriCollection\|canonicalUriCollection\|MessageAddress\|messageAddress\|isGatedAddress" api server tests web-app   # none
deno check --frozen api shared server tests web-app
```

`deno check` will report every duplicate-binding collision
(`Cannot redeclare block-scoped variable 'path'`) and every
place a parameter renamed to `path` now shadows a same-named
outer binding that a later line still expected. Fix each by
the rule in Step 2.

- [ ] **Step 2: The shadow review**

The rule: a **field or property key** is `path`,
unconditionally. A **local binding** (`const`, parameter,
destructured name) is `path` unless the enclosing function
(or the module, for top-level consts) already binds `path`;
then the renamed local is `collectionPath`. Never rename the
pre-existing `path` — it is usually the request path or a
route param, a different thing.

The checker sees a redeclaration but not a shadow. Find the
candidates:

```bash
git diff -U0 -- api server tests web-app \
  | grep -nE '^\+.*(\bconst\b|\blet\b|\(|,)\s*path\b\s*[:=,)]|^\+.*\{[^}]*\bpath\b[^}]*\}\s*[=:]' \
  | grep -v '^\+.*\.path\b' | grep -v "^\+.*path:" 
```

For every hit, open the enclosing function and search its
UNCHANGED lines for `\bpath\b`. Files that mix both today
and therefore need a hand read regardless of the grep:
`api/routes.ts` (48 pre-existing `path`), `api/api.ts` (16),
`api/validators.ts` (12), `api/message-pair.ts` (10),
`api/derive-states.ts` (5), `api/document-family.ts` (3),
`tests/document-family.test.ts` (25),
`tests/api-identity-token-revocations-self.test.ts` (18),
`tests/api-organization-member-seat.test.ts` (12),
`tests/api-operation-id.test.ts` (8). `WriteMessagePairInput`
and `AuthMessagePairSeed` carry `pathname` — untouched by the
word-boundary regex; confirm `formWriteMessagePair` reads
`input.pathname` for the request target and the new
`path` for the collection, and that no line now reads
`input.path`.

- [ ] **Step 3: Comments beside the identifier**

On every line the diff touches, "address" becomes `path`,
`name`, or `document` (`git diff -U0 | grep '^+.*address'`).
The `path-and-name.ts` header now reads "Resolves a matched
route into the message plane's `(path, name)`." In
`formWriteMessagePair` the local `const address =
pathAndNameOf(…)` becomes `const pathAndName = …` and its two
reads follow (`pathAndName.path`, `pathAndName.uriId` — the
second renames again in Task 15).

- [ ] **Step 4: Verify and commit**

```bash
./test validate
git add -A && git commit -m "Rename uriCollection to path"
```

### Task 15: Rename `uriId` to `name`

**Spec:** § Vocabulary, § Sequence 4. The second token, the
same discipline. `name` is the riskier of the two: 440 bare
`name` identifiers already live in `api/`, and flows,
attributes, and members all carry a `name` field.

**Files:**
- Modify: every file `grep -rl "uriId\|createdEntityUriId\|VERSION_URI_ID\|idsAtAddress" api server tests web-app` lists

**Interfaces:**
- Produces: `PathAndName.name`, `MessagePair.name`,
  `DocumentMessagePair.name`, `DerivedDocument.name`,
  `createdEntityName(routePattern, body)`, `derive-states.ts`'s
  own row shapes' `name`.

- [ ] **Step 1: The mechanical rename**

```bash
FILES=$(grep -rl "uriId\|createdEntityUriId\|VERSION_URI_ID\|idsAtAddress" api server tests web-app)
perl -pi -e 's/\bcreatedEntityUriId\b/createdEntityName/g;
             s/\bVERSION_URI_ID\b/VERSION_NAME/g;
             s/\bidsAtAddress\b/idsAtDocument/g;
             s/\buriId\b/name/g' $FILES
grep -rn "uriId\|createdEntityUriId\|VERSION_URI_ID\|idsAtAddress" api server tests web-app   # none
deno check --frozen api shared server tests web-app
```

- [ ] **Step 2: The shadow review**

The same rule as Task 14 with `documentName` as the
qualified local. The candidate grep, for `name`:

```bash
git diff -U0 -- api server tests web-app \
  | grep -nE '^\+.*(\bconst\b|\blet\b|\(|,)\s*name\b\s*[:=,)]|^\+.*\{[^}]*\bname\b[^}]*\}\s*[=:]' \
  | grep -v '^\+.*\.name\b' | grep -v "^\+.*name:"
```

Hand-read these regardless of the grep, because they bind
`name` for a body field or a fixture today:
`api/routes.ts` (19), `api/message-pair.ts` (17),
`api/authentication.ts` (17), `api/api.ts` (14),
`api/derive-flow-tags.ts` (9 — a tag's name!),
`api/invitations-domain.ts` (6), `api/document-family.ts`
(4), `api/mock-data/seed-message-pairs.ts` (13),
`tests/flow-undo-cursor.test.ts` (29),
`tests/drift-records.test.ts` (26),
`tests/drift-phase15-cores-parity.test.ts` (24),
`tests/api-record-types-composed-op.test.ts` (23),
`tests/api-flow-document.test.ts` (21),
`tests/api-organization-isolation.test.ts` (17),
`tests/store-acceptance.ts` (15), `tests/drift-flows.test.ts`
(14), `tests/drift-states.test.ts` (13),
`tests/api-nested-stream.test.ts` (12),
`tests/api-record-types-write.test.ts` (12).

One shape needs care: a destructuring like
`const { uriId, name } = …` becomes `const { name, name }` —
a redeclaration the checker reports; resolve it as
`const { name: documentName, name: … }` only if the second
`name` is a body field, else drop the duplicate.

- [ ] **Step 3: Comments beside the identifier**

`git diff -U0 | grep '^+.*address'` — each becomes `path`,
`name`, or `document`. In `api/message-pair.ts` the
`CREATE_BODY_ID_FIELDS` comment block and
`createdEntityName`'s comment say "name" where they said
"uriId".

- [ ] **Step 4: Verify and commit**

```bash
./test validate
git add -A && git commit -m "Rename uriId to name"
```

### Task 16: Retire "address" from the remaining comments and test names

**Spec:** § Vocabulary — "address" retired; § Docs —
"Comments: address becomes path, name, or document wherever
it appears". Tasks 12, 14, and 15 swept the lines beside the
identifiers; this task sweeps the rest of the code tree. Two
commits: a move, then the prose.

**Files:**
- Move: `tests/backend-address-read.test.ts` → `tests/backend-document-read.test.ts`
- Modify: every `.ts` under `api/`, `server/`, `shared/`, `web-app/`, `tests/` where `grep -n -i address` hits the message plane

- [ ] **Step 1: Move the test file (pure move)**

```bash
git mv tests/backend-address-read.test.ts tests/backend-document-read.test.ts
./test validate
git add -A && git commit -m "Move backend-address-read.test.ts to backend-document-read.test.ts"
```

- [ ] **Step 2: Sweep the prose**

```bash
grep -rn -i "address" api server shared web-app tests --include='*.ts' \
  | grep -v -i "email\|ip address\|addressable\|addressing"
```

Every remaining hit is message-plane prose (comments and
`Deno.test` titles — ~600 lines across ~50 files;
`api/routes.ts`, `api/derive-states.ts`,
`tests/mock-data-pairs.test.ts`, `api/message-pair.ts`,
`server/throttle.ts` carry most). Rewrite each: "at an
address" → "at a document" or "at (path, name)"; "the
address" → "the document" or "the path"; "an operation
address" → "an operation path"; "address family" →
"document family"; "same-address" → "same-document";
`server/throttle.ts` — read first: if its "address" is a
network peer address, leave it. Test titles such as
'address miss is 404' become 'document miss is 404',
'getAddress is collection+name, ordered by at,id' becomes
'getAddress is path+name, ordered by at,id' (the Tx method
itself renames in Task 18). `ORGANIZATIONS_ADDRESS_PREFIX`
in `api/derive-states.ts` → `ORGANIZATIONS_PATH_PREFIX`. A
local or parameter named `address` that holds a
`PathAndName` value becomes `pathAndName`; one that holds a
path string becomes `path`. Never `document` for a local —
`deno.json`'s lib includes `dom`, so `document` is a global
there and a local would shadow it.

- [ ] **Step 3: Prove it and commit**

```bash
grep -rn -i "address" api server shared web-app tests --include='*.ts' \
  | grep -v -i "email\|ip address\|addressable\|addressing"   # none
./test validate
git add -A && git commit -m "Say path, name, and document in the comments"
```

## Phase D — The seam and `Tx` (spec § Sequence 5)

### Task 17: Name the seam's reads and its append

**Spec:** § The seam — `getAllWhere('path', c)` →
`getCollectionPairs(path)`; `getAllWhere('request_hash', h)`
→ `getPairsByRequestHash(hash)`; `getAllAtAddress(c, id)` →
`getDocumentHistory(path, name)`; `put(id, fields)` →
`append(id, fields)`; `getAll`, `getAllWhereBody`, `getById`
kept.

**Files:**
- Modify: `api/db.ts` (`EntityStore`)
- Modify: `api/store-history-entity.ts`
- Modify: every caller (`grep -rl "\.getAllWhere(\|getAllAtAddress\|messagePairs\.put(\|\.put(messagePair\|store\.put(" api server tests`)
- Modify: `tests/db-keyed-read-coverage.test.ts`

**Interfaces:**
- Produces:

```ts
export interface EntityStore<T extends { id: string }> {
    getAll(): Promise<T[]>;
    getCollectionPairs(path: string): Promise<T[]>;
    getPairsByRequestHash(hash: string): Promise<T[]>;
    getDocumentHistory(path: string, name: string): Promise<T[]>;
    getAllWhereBody(
        path: string,
        containment: Record<string, unknown>,
    ): Promise<T[]>;
    getById(id: string): Promise<T>;
    append(id: string, fields: Omit<T, 'id'>): Promise<T>;
}
```

- [ ] **Step 1: The interface**

Replace `getAllWhere` and `getAllAtAddress` in `EntityStore`
with the three named reads above (keep the comment about
the keyed read on `getCollectionPairs`: "the literal `WHERE
path = $1`: every pair of every document in the
collection"), rename `put` to `append`.

- [ ] **Step 2: The implementation**

In `api/store-history-entity.ts`:

```ts
    async getCollectionPairs(path: string): Promise<T[]> {
        return this.#run(
            [this.#table], 'readonly',
            tx => tx.getWhere<T>(this.#table, 'path', path),
        );
    }

    async getPairsByRequestHash(hash: string): Promise<T[]> {
        return this.#run(
            [this.#table], 'readonly',
            tx => tx.getWhere<T>(
                this.#table, 'request_hash', hash,
            ),
        );
    }

    async getDocumentHistory(
        path: string,
        name: string,
    ): Promise<T[]> {
        return this.#run(
            [this.#table], 'readonly',
            tx => tx.getAddress<T>(this.#table, path, name),
        );
    }
```

and rename `put` → `append` (body unchanged; the `Tx.put` call
inside stays until Task 18).

- [ ] **Step 3: The callers, mechanically**

```bash
FILES=$(grep -rl "getAllWhere(\|getAllAtAddress\|messagePairs\.put(\|store\.put(\|\.put('" api server tests)
perl -0pi -e "s/\.getAllWhere\(\s*'path',\s*/.getCollectionPairs(/g;
              s/\.getAllWhere\(\s*'request_hash',\s*/.getPairsByRequestHash(/g;
              s/\bgetAllAtAddress\b/getDocumentHistory/g;
              s/\.messagePairs\.put\(/.messagePairs.append(/g" $FILES
grep -rn "getAllWhere(\|getAllAtAddress" api server tests   # none
```

Then by hand: `tests/backend-document-read.test.ts`,
`tests/store-entity-validation.test.ts`,
`tests/pg-identifier-order.test.ts`, and any other test that
calls `store.put(` on a `HistoryEntityStore` directly →
`store.append(`. A multi-line call whose first argument sits
on the next line (`getAllWhere(\n 'path', c,\n)`) is caught
by the slurp regex; confirm with the grep.

- [ ] **Step 4: The coverage manifest**

`tests/db-keyed-read-coverage.test.ts` pinned every
`getAllWhere('…')` literal against `TABLE_INDEXES`. There
are no literals now: delete `KEYED_READS`, the tests 'no
caller getAllWhere name', 'every keyed read has a matching
secondary index', 'KEYED_READS lists every getAllWhere
literal', and `apiTypeScriptFiles`; keep 'message_pairs
carry no unique follows index' and rewrite the header
comment: "TABLE_INDEXES is the memory backend's unique-
column manifest and the SVG's secondary-index list; the
seam's reads are typed, so no column-literal manifest is
needed." Drop the now-unused imports (`join`, `assert`,
`assertEquals`).

- [ ] **Step 5: Verify and commit**

```bash
./test validate
git add -A && git commit -m "Name the seam's reads and its append"
```

### Task 18: Name the `Tx` reads, its append, and their SQL

**Spec:** § The transaction — `get(table, id)` → `getById`;
`getWhere(table, col, key)` → `getCollectionPairs(path)`,
`getPairsByRequestHash(hash)`; `getAddress(table, c, id)` →
`getDocumentHistory(path, name)`; `put(table, row)` →
`append(row)`. SQL: `selectPairById`,
`selectCollectionPairs`, `selectPairsByRequestHash`,
`selectDocumentHistory`; `selectAll` and `upsertRow` keep
their names. The `table` argument itself goes in Task 19;
here every method keeps it.

**Files:**
- Modify: `api/db.ts` (`Tx`, `assertGetWhereColumn` removed)
- Modify: `api/backend-postgres.ts` (`PostgresTx`, `postgresTx`, SQL functions, `assertIndexedColumn` removed)
- Modify: `api/backend-buffer-tx.ts`
- Modify: `api/store-history-entity.ts`
- Modify: `tests/backend-tx-memory.test.ts`, `tests/backend-getwhere-parity.test.ts`, `tests/backend-read-isolation.test.ts`, `tests/tx-runner.test.ts`, `tests/backend-document-read.test.ts`, `tests/backend-postgres.test.ts`, `tests/pg-explain.test.ts`, `tests/pg-races.test.ts`

**Interfaces:**
- Produces (with `table` still first on every member):

```ts
export interface Tx {
    getById<T extends { id: string }>(table: string, id: string): Promise<T | null>;
    getAll<T extends { id: string }>(table: string): Promise<T[]>;
    getCollectionPairs<T extends { id: string }>(table: string, path: string): Promise<T[]>;
    getPairsByRequestHash<T extends { id: string }>(table: string, hash: string): Promise<T[]>;
    getDocumentHistory<T extends { id: string }>(table: string, path: string, name: string): Promise<T[]>;
    getWhereBody<T extends { id: string }>(table: string, path: string, containment: Record<string, unknown>): Promise<T[]>;
    append<T extends { id: string }>(table: string, row: T): Promise<void>;
    lock?(label: string): Promise<void>;
    lockHead?(id: string): Promise<void>;
    latestPutDelete?(path: string, name: string): Promise<{ readonly id: string; readonly method: string } | null>;
    notify?(event: NotificationEvent): Promise<void>;
}
```

- [ ] **Step 1: `Tx` and the guard**

Rewrite `Tx` as above (wrap to 78 chars). Delete
`assertGetWhereColumn` from `api/db.ts` — its only purpose
was to police a column argument that no longer exists.
`TABLE_INDEXES`, `indexColumn`, `uniqueColumns` stay (the
memory backend's unique scan and the SVG read them).

- [ ] **Step 2: Postgres**

In `api/backend-postgres.ts`: `PostgresTx` declares
`getDocumentHistory` instead of `getAddress`; delete
`assertIndexedColumn`; in `postgresTx`:

```ts
        async getById<T extends { id: string }>(
            table: string,
            id: string,
        ): Promise<T | null> {
            const name = assertMessageTable(table);
            const rows = await selectPairById(sql, name, id);
            const row = rows[0];
            return row === undefined
                ? null
                : entityOf<T>(row);
        },
        async getCollectionPairs<T extends { id: string }>(
            table: string,
            path: string,
        ): Promise<T[]> {
            const name = assertMessageTable(table);
            const rows = await selectCollectionPairs(
                sql, name, path,
            );
            return rows.map((row) => entityOf<T>(row));
        },
        async getPairsByRequestHash<T extends { id: string }>(
            table: string,
            hash: string,
        ): Promise<T[]> {
            const name = assertMessageTable(table);
            const rows = await selectPairsByRequestHash(
                sql, name, hash,
            );
            return rows.map((row) => entityOf<T>(row));
        },
        async getDocumentHistory<T extends { id: string }>(
            table: string,
            path: string,
            name: string,
        ): Promise<T[]> {
            const known = assertMessageTable(table);
            const rows = await selectDocumentHistory(
                sql, known, path, name,
            );
            return rows.map((row) => entityOf<T>(row));
        },
        async append<T extends { id: string }>(
            table: string,
            row: T,
        ): Promise<void> {
            assertWritable();
            const name = assertMessageTable(table);
            const written = serializeRecord(
                row as Record<string, unknown>,
                name,
            );
            await upsertRow(sql, name, written);
        },
```

(the `name` parameter shadows the local `const name =
assertMessageTable(table)` idiom — use `known` for the
table there, as shown.) The SQL functions — `selectById`
becomes `selectPairById` with its body unchanged,
`selectAddress` becomes `selectDocumentHistory` with its
parameters `path` and `name` and its body unchanged, and
`selectWhere` splits in two:

```ts
async function selectCollectionPairs(
    sql: SqlClient,
    _table: 'message_pairs',
    path: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT * FROM message_pairs
        WHERE path = ${path}
        ORDER BY response_at, id
    `;
}
async function selectPairsByRequestHash(
    sql: SqlClient,
    _table: 'message_pairs',
    hash: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT * FROM message_pairs
        WHERE request_hash = ${hash}
        ORDER BY response_at, id
    `;
}
```

`selectWhere` and its trailing `throw` go.

- [ ] **Step 3: Memory**

In `api/backend-buffer-tx.ts` replace `get` → `getById`,
`getWhere` → two methods (each filters on its one column and
sorts with `byResponseAtThenId`), `getAddress` →
`getDocumentHistory`, `put` → `append`; drop the
`assertGetWhereColumn` import. In
`api/store-history-entity.ts` call the new names.

- [ ] **Step 4: Tests**

Mechanical first:

```bash
perl -pi -e 's/\btx\.get\b/tx.getById/g; s/\btx\.put\b/tx.append/g;
             s/\btx\.getAddress\b/tx.getDocumentHistory/g;
             s/\binner\.put\b/inner.append/g' \
    tests/backend-tx-memory.test.ts tests/backend-read-isolation.test.ts \
    tests/tx-runner.test.ts tests/backend-document-read.test.ts \
    tests/backend-postgres.test.ts tests/pg-explain.test.ts \
    tests/backend-getwhere-parity.test.ts
```

Then by hand:
- `tests/backend-getwhere-parity.test.ts` → rows must carry
  `path`; rewrite `SAMPLE` as `{ id, path, n }` with `path:
  '/x/'` / `'/y/'`, `byIndex` calls
  `tx.getCollectionPairs<Row>('t', key)`, `byScan` filters
  `r.path === key`, keys `'/x/'`, `'/y/'`, `'/z/'`; retitle
  the file's comment to name `getCollectionPairs`.
- `tests/backend-read-isolation.test.ts` 'mutating a
  getWhere() row' → `tx.getCollectionPairs<Row>('t', '/x/')`
  with the seeded row carrying `path: '/x/'` (rename its `k`
  field).
- `tests/backend-postgres.test.ts`: delete 'getWhere throws
  for name' and 'getWhere throws for operation_id' (there is
  no column argument to refuse); rewrite 'getWhere supports
  indexed single columns' as 'getCollectionPairs selects by
  path, ordered' (`tx.getCollectionPairs('message_pairs',
  '/organizations/…/ideas/')`, pin `/WHERE path = \$1/` and
  the ORDER BY) and add 'getPairsByRequestHash selects by
  request_hash, ordered' (pin `/WHERE request_hash = \$1/`).
  Retitle 'getAddress uses …' → 'getDocumentHistory selects
  by path and name, ordered'.
- `tests/backend-document-read.test.ts`: delete 'memory
  getWhere refuses name' and 'memory getWhere refuses
  operation_id'; retitle the first two tests for
  `getDocumentHistory`.

- [ ] **Step 5: Verify and commit**

```bash
grep -rn "assertGetWhereColumn\|assertIndexedColumn\|selectWhere\b\|selectAddress\|selectById\b\|\btx\.get(\|\btx\.put(\|getWhere\b" api tests   # none
./test validate
git add -A && git commit -m "Name the Tx reads and their SQL"
```

### Task 19: Drop the `table` argument

**Spec:** § The transaction — "The `table` argument goes.
Every `Tx` method loses it, `assertMessageTable` goes,
`transaction(tables, mode, fn)` becomes `transaction(mode,
fn)` at every `MESSAGE_TABLES` and `TABLE_NAMES` call site,
and `ensureTables` becomes `ensureTable`. There is one
table; the interface stops saying otherwise."

**Files:**
- Modify: `api/db.ts` (`Tx`, `StorageBackend`, `TxRunner`, `backendRunner`, `ambientRunner`, `DbLifecycle.ensureTable`, `DbAdapter` / `GuardedDbAdapter` `transaction(fn)` / `readTransaction(fn)`, `MESSAGE_TABLES` retired)
- Modify: `api/backend-memory.ts`, `api/backend-buffer-tx.ts`, `api/backend-postgres.ts`, `api/db-backed.ts` (`#assertSubset` gone), `api/store-history-entity.ts`
- Modify: `server/postgres-seed.ts:88`
- Modify: every `transaction(` / `readTransaction(` / `ensureTables(` caller — 206 `MESSAGE_TABLES|TABLE_NAMES` lines across `api/`, `server/`, `tests/`
- Modify: `tests/backend-tx-memory.test.ts`, `tests/db-transaction-view.test.ts`, `tests/db-table-names.test.ts`, `tests/store-entity-validation.test.ts`, `tests/backend-getwhere-parity.test.ts`, `tests/backend-read-isolation.test.ts`, `tests/tx-runner.test.ts`, `tests/backend-document-read.test.ts`, the seven `./test postgres` files

**Interfaces:**
- Produces:

```ts
export interface Tx {
    getById<T extends { id: string }>(id: string): Promise<T | null>;
    getAll<T extends { id: string }>(): Promise<T[]>;
    getCollectionPairs<T extends { id: string }>(path: string): Promise<T[]>;
    getPairsByRequestHash<T extends { id: string }>(hash: string): Promise<T[]>;
    getDocumentHistory<T extends { id: string }>(path: string, name: string): Promise<T[]>;
    getWhereBody<T extends { id: string }>(path: string, containment: Record<string, unknown>): Promise<T[]>;
    append<T extends { id: string }>(row: T): Promise<void>;
    lock?(label: string): Promise<void>;
    lockHead?(id: string): Promise<void>;
    latestPutDelete?(path: string, name: string): Promise<{ readonly id: string; readonly method: string } | null>;
    notify?(event: NotificationEvent): Promise<void>;
}
export interface StorageBackend {
    transaction<R>(mode: TxMode, fn: (tx: Tx) => Promise<R>): Promise<R>;
    ensureTable(): Promise<void>;
    hasSchema(): Promise<boolean>;
    postSchemaCreation(): Promise<void>;
    deleteSchema(): Promise<void>;
}
export type TxRunner = <R>(mode: TxMode, fn: (tx: Tx) => Promise<R>) => Promise<R>;
// DbLifecycle: ensureTable(): Promise<void>;
// DbAdapter / GuardedDbAdapter:
//   transaction<R>(fn: (view: …) => Promise<R>): Promise<R>;
//   readTransaction<R>(fn: (view: …) => Promise<R>): Promise<R>;
```

`TABLE_NAMES` stays exactly as written (`web-app/app/schema-svg.ts`
parses the literal `TABLE_NAMES = [`). `MESSAGE_TABLES` is
retired: no call site passes it.

- [ ] **Step 1: The interfaces**

Rewrite the five interfaces and the two runners in
`api/db.ts` per the block above:

```ts
export const backendRunner = (
    backend: StorageBackend,
): TxRunner =>
    (mode, fn) => backend.transaction(mode, fn);

export const ambientRunner = (tx: Tx): TxRunner =>
    (_mode, fn) => fn(tx);
```

Delete `MESSAGE_TABLES` and its comment. Rewrite the
`DbAdapter.transaction` comment: "A nested view.transaction
re-enters this same tx."

- [ ] **Step 2: The memory backend**

```ts
export class MemoryStorageBackend
    implements StorageBackend
{
    #rows: { id: string }[] | undefined;
    readonly #serialize:
        <R>(fn: () => Promise<R>) => Promise<R>;

    constructor() {
        this.#rows = undefined;
        this.#serialize = createSerializer();
    }

    // Simulated transaction: copy the table, serve every
    // row op from the copy, adopt the copy when `fn`
    // resolves. A throw skips the adoption, so the live
    // rows are byte-identical — rollback is "don't adopt",
    // never "undo".
    async transaction<R>(
        mode: TxMode,
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        return this.#serialize(async () => {
            if (this.#rows === undefined) {
                throw new MissingTableError('message_pairs');
            }
            const buffer = [...this.#rows];
            const result = await fn(bufferTx(buffer, mode));
            this.#rows = buffer;
            return result;
        });
    }

    async ensureTable(): Promise<void> {
        if (this.#rows === undefined) {
            this.#rows = [];
        }
    }

    async hasSchema(): Promise<boolean> {
        return this.#rows !== undefined;
    }

    async postSchemaCreation(): Promise<void> {
        await this.ensureTable();
    }

    async deleteSchema(): Promise<void> {
        this.#rows = undefined;
    }
}
```

`bufferTx(buffer: { id: string }[], mode: TxMode): Tx` —
delete `scoped`, `dirty`, and the `table` parameter on every
method; `uniqueColumns('message_pairs')`,
`serializeRecord(row, 'message_pairs')`,
`new UniqueConstraintError('message_pairs', column)`.

- [ ] **Step 3: Postgres**

`transaction(mode, fn)` drops the `assertMessageTable` loop;
`ensureTable()` replaces `ensureTables(_tables)`; every
`postgresTx` method drops `table` and the `const name =
assertMessageTable(table)` line; every SQL function drops
`_table`; delete `assertMessageTable`.

- [ ] **Step 4: The adapter and the store**

`api/db-backed.ts`: `transaction(fn)` / `readTransaction(fn)`
/ `#transaction(mode, fn)` / `#viewForTx(tx)`; delete
`#assertSubset`; `reenter` is `(fn) => fn(view)`;
`ensureTable()`. `api/store-history-entity.ts`: every
`this.#run([this.#table], mode, …)` → `this.#run(mode, …)`
and every `tx.x(this.#table, …)` → `tx.x(…)`; the `#table`
field survives only for `EntityNotFoundError(this.#table,
id)`.

- [ ] **Step 5: The 206 call sites, mechanically**

```bash
FILES=$(grep -rl "MESSAGE_TABLES\|TABLE_NAMES\|ensureTables\|\['message_pairs'\]" api server tests web-app)
perl -0pi -e "s/\.(transaction|readTransaction)\(\s*(?:MESSAGE_TABLES|TABLE_NAMES|\[\s*'message_pairs'\s*\]),\s*/.\$1(/g;
              s/\bensureTables\(\s*(?:TABLE_NAMES|\[\s*'[a-z_]+'\s*\]|\[\s*'a',\s*'b'\s*\])\s*\)/ensureTable()/g" $FILES
perl -pi -e "s/^import \{ MESSAGE_TABLES \} from '(\.\.?\/api\/db\.ts|\.\/db\.ts)';\n//" $FILES
grep -rn "\bMESSAGE_TABLES\b\|ensureTables" api server tests web-app   # none
grep -rn "\bTABLE_NAMES\b" api server tests web-app   # only db.ts, schema-svg.ts, db-table-names.test.ts
deno check --frozen api shared server tests web-app
```

(`LEGACY_MESSAGE_TABLES` in `server/postgres-gate.ts` is an
error string, not the constant; the word-boundary grep
skips it.) `deno check` reports every import that is now
unused (`noUnusedLocals`) — remove `MESSAGE_TABLES` /
`TABLE_NAMES` from multi-name import lists by hand. Two
sites wrap `transaction` themselves and need a hand edit:
`tests/flow-undo-cursor.test.ts`'s `withWriteGate`
(`db.transaction = (fn) => origTx((view) => fn(wrapView(view)))`,
`transaction: (fn) => view.transaction((inner) => fn(wrapView(inner)))`,
and the same for `readTransaction`) and `api/db-backed.ts`'s
`reenter` (Step 4). `backend.transaction(
['t'], 'readwrite', fn)` in the backend tests →
`backend.transaction('readwrite', fn)`; the slurp regex
above covers `['message_pairs']` and `TABLE_NAMES`; for `['t']`,
`['a', 'b']`, `['things']`, `['ghost']`, `['ignored']` do:

```bash
perl -0pi -e "s/\.transaction\(\s*\[\s*'[a-z_]+'(?:,\s*'[a-z_]+')*\s*\],\s*/.transaction(/g" \
    tests/backend-*.ts tests/tx-runner.test.ts tests/store-entity-validation.test.ts
```

- [ ] **Step 6: The tests whose covenant was the table argument**

Delete, because there is no second table and no declared
set: in `tests/backend-tx-memory.test.ts` 'a tx spanning two
tables commits both' and 'a throw inside the tx rolls back
every table' (keep the one-table rollback covered by 'a NULL
field rejects the put and rolls back' — verify it still
asserts an empty table after the throw); rewrite
'transaction over a never-created table throws' as
'transaction before ensureTable throws' (`new
MemoryStorageBackend()` then `transaction('readonly', …)`
rejects `MissingTableError`); in
`tests/db-transaction-view.test.ts` 'a nested out-of-scope
table throws a clear error'; in `tests/tx-runner.test.ts`
the comment "ignoring its args" now reads "ignoring its
mode". `tests/db-table-names.test.ts`: delete 'MESSAGE_TABLES
is TABLE_NAMES' and its import.

- [ ] **Step 7: Verify on both runners and commit**

```bash
./test validate
./test postgres
git add -A && git commit -m "Drop the table argument"
```

## Phase E — The store (spec § Sequence 6)

### Task 20: Name the store's reads; `null` for absence

**Spec:** § The store — `get(c, id)` → `getDocumentHead(path,
name)`: the live PUT head pair or `null`;
`getMessagePairs(c, id)` → `getDocumentHistory(path, name)`;
`getCollection(c)` kept. "Absence is `null`, at every layer.
The store's `undefined` goes."

**Files:**
- Modify: `api/message-store.ts`
- Modify: `api/document-family.ts:248,332,406,443,476,787`
- Modify: `api/message-pair.ts` (`documentHeadAt`)
- Modify: `api/api.ts:2326-2327`
- Modify: `api/authentication.ts:1096-1102`
- Modify: `api/routes.ts` (the four Task 8 sites)
- Modify: `tests/http-fixtures.ts:78-85`, `tests/message-store.test.ts`, `tests/api-idea-document.test.ts:312-316`, `tests/api-flow-document.test.ts`, `tests/message-pair.test.ts`, `tests/document-family.test.ts`

**Interfaces:**
- Produces:

```ts
export interface MessageStore {
    getDocumentHead(
        path: string,
        name: string,
    ): Promise<MessagePairEntity | null>;
    getDocumentHistory(
        path: string,
        name: string,
    ): Promise<readonly MessagePairEntity[]>;
    getCollection(path: string): Promise<unknown[]>;
}
```

- [ ] **Step 1: Write the failing test**

In `tests/message-store.test.ts` rename the two `get` tests'
calls to `getDocumentHead` and change the DELETE-head
assertion to `assertStrictEquals(got, null);`. Run: FAIL
(no such method).

- [ ] **Step 2: The store**

```ts
export function messageStore(db: DbAdapter): MessageStore {
    return {
        async getDocumentHead(path, name) {
            return livePutOf(
                await db.messagePairs.getDocumentHistory(
                    path, name,
                ),
            );
        },
        async getDocumentHistory(path, name) {
            return db.messagePairs.getDocumentHistory(
                path, name,
            );
        },
        async getCollection(path) {
            return entitiesOf(
                livePutsOf(
                    await db.messagePairs.getCollectionPairs(
                        path,
                    ),
                ),
            );
        },
    };
}
```

Delete `messagePairsInCollection` and `messagePairsAt` (each
store method now calls one seam read). `latestOf` and
`livePutOf` return `MessagePairEntity | null`:

```ts
function latestOf(
    messagePairs: readonly MessagePairEntity[],
): MessagePairEntity | null {
    if (messagePairs.length === 0) return null;
    …
    return latestByKey(rows, () => 'head').get('head')
        ?.messagePair ?? null;
}

function livePutOf(
    messagePairs: readonly MessagePairEntity[],
): MessagePairEntity | null {
    const head = latestOf(…);
    if (head === null || head.method !== PUT_METHOD) {
        return null;
    }
    return head;
}
```

(The `?? null` in `latestOf` translates the Map API's
`undefined` at the one place it enters; it is not a default
value.) `jsonBodyOf`'s `undefined` means "no body octets",
a different absence; leave it.

- [ ] **Step 3: The callers**

```bash
perl -pi -e 's/\bmessageStore\((\w+)\)\.get\(/messageStore($1).getDocumentHead(/g;
             s/\bmessageStore\((\w+)\)\s*\.getMessagePairs\(/messageStore($1).getDocumentHistory(/g;
             s/\bstore\.getMessagePairs\(/store.getDocumentHistory(/g' \
    api/document-family.ts api/message-pair.ts api/api.ts api/authentication.ts \
    api/routes.ts tests/http-fixtures.ts tests/api-idea-document.test.ts \
    tests/api-flow-document.test.ts tests/message-pair.test.ts tests/document-family.test.ts
grep -rn "\.get(\s*$\|\.getMessagePairs(" api tests | grep -i "messageStore\|store\b"   # catch multi-line calls by hand
```

Then the absence checks: `api/api.ts:2327` `if (stored ===
null)`; `api/authentication.ts:1100` `if (existing !== null)`;
`tests/http-fixtures.ts:81` `if (stored === null)`;
`tests/api-idea-document.test.ts:316` `assert(stored !==
null)`. The Task 8 sites read `?.id` — with `null`, `?.id`
still yields `undefined`, which their `latest !== latchedId`
comparison expects; leave them.

- [ ] **Step 4: Verify and commit**

```bash
grep -rn "getMessagePairs\|messageStore([a-z]*)\.get(" api tests   # none
./test validate
git add -A && git commit -m "Name the store's reads; null for absence"
```

## Phase F — The locks (spec § Sequence 7)

### Task 21: Name the locks and the head read

**Spec:** § The transaction — `lock(label)` → `lockRequest(hash)`,
`lockDocument(path, name)`, the label prefixes move inside;
`latestPutDelete(c, id)` → `getHead(path, name)`; `WriteLocks`
carries `lockRequest`, `lockDocument`, `lockHead`, `getHead`,
`notify`; SQL `selectHead`. Deviation 5: the label
`fusion.address.` → `fusion.document.`.

**Files:**
- Modify: `api/db.ts` (`Tx`, `WriteLocks`)
- Modify: `api/backend-postgres.ts` (`PostgresTx`, `postgresTx`, `selectHead`)
- Modify: `api/db-backed.ts` (`writeLocksOf`)
- Modify: `api/message-pair.ts` (`coordinateWrite`)
- Modify: `api/authentication.ts:1089-1094`
- Modify: `tests/flow-undo-cursor.test.ts:1237-1248`, `tests/pg-races.test.ts`, `tests/pg-explain.test.ts:384-402`, `tests/advisory-lock.test.ts:38`

**Interfaces:**
- Produces:

```ts
// Tx (optional, Postgres only)
    lockRequest?(hash: string): Promise<void>;
    lockDocument?(path: string, name: string): Promise<void>;
    lockHead?(id: string): Promise<void>;
    getHead?(path: string, name: string): Promise<{
        readonly id: string;
        readonly method: string;
    } | null>;
    notify?(event: NotificationEvent): Promise<void>;

export interface WriteLocks {
    lockRequest(hash: string): Promise<void>;
    lockDocument(path: string, name: string): Promise<void>;
    lockHead(id: string): Promise<void>;
    getHead(path: string, name: string): Promise<{
        readonly id: string;
        readonly method: string;
    } | null>;
    notify(event: NotificationEvent): Promise<void>;
}
```

- [ ] **Step 1: `Tx`, `PostgresTx`, and the Postgres methods**

```ts
        async lockRequest(hash: string): Promise<void> {
            await advisoryLock(sql, 'fusion.dedup.' + hash);
        },
        async lockDocument(
            path: string,
            name: string,
        ): Promise<void> {
            await advisoryLock(
                sql, 'fusion.document.' + path + name,
            );
        },
        async lockHead(id: string): Promise<void> { …unchanged… },
        async getHead(
            path: string,
            name: string,
        ): Promise<{
            readonly id: string;
            readonly method: string;
        } | null> {
            const rows = await selectHead(sql, path, name);
            const row = rows[0];
            if (row === undefined) {
                return null;
            }
            return {
                id: identifierOfUuidText(row.id),
                method: row.method,
            };
        },
```

with the SQL lifted out:

```ts
async function selectHead(
    sql: SqlClient,
    path: string,
    name: string,
): Promise<{ id: string; method: string }[]> {
    return sql.query<{ id: string; method: string }>`
        SELECT id, method
        FROM message_pairs
        WHERE path = ${path}
          AND name = ${name}
          AND method IN ('PUT', 'DELETE')
        ORDER BY response_at DESC, id DESC
        LIMIT 1
    `;
}
```

Update the file's header comment ("Write lock order is
request, document, then FOR UPDATE").

- [ ] **Step 2: `writeLocksOf`**

```ts
function writeLocksOf(tx: Tx): WriteLocks | undefined {
    const lockRequest = tx.lockRequest;
    const lockDocument = tx.lockDocument;
    const lockHead = tx.lockHead;
    const getHead = tx.getHead;
    const notify = tx.notify;
    if (
        lockRequest === undefined
        || lockDocument === undefined
        || lockHead === undefined
        || getHead === undefined
        || notify === undefined
    ) {
        return undefined;
    }
    return { lockRequest, lockDocument, lockHead, getHead, notify };
}
```

- [ ] **Step 3: The gate and the auth caller**

In `coordinateWrite`: `locks.lockRequest(messagePair.requestHash)`,
`locks.lockDocument(messagePair.path, messagePair.name)`,
`locks.getHead(messagePair.path, messagePair.name)` (twice);
the comment: "Lock order: request if hash-deduped, document
if gated, then FOR UPDATE + a fresh head read."
`api/authentication.ts:1091`:
`locks.lockDocument('/authentication/assertion-jtis/', verdict.jti)`.

- [ ] **Step 4: Tests**

`tests/flow-undo-cursor.test.ts` fake: keys `lockRequest`,
`lockDocument`, `lockHead`, `getHead: async (path, name) =>
{ const head = await documentHeadAt(view, path, name);
return head ?? null; }`, `notify`.
`tests/pg-races.test.ts:265`: `'fusion.document.' + FLOW_PREFIX
+ id`; the deadlock test's `pg.lock('fusion.test.deadlock.l')`
→ `pg.lockDocument('/fusion-test/deadlock/', 'l')` (and `'r'`);
the timeout test: `const label = 'fusion.document./fusion-test/timeout/x';`
for the holder's `advisoryKey(label)` and
`txn.lockDocument('/fusion-test/timeout/', 'x')` for the
tight transaction. `tests/pg-explain.test.ts:384`: title
'getHead uses the document index and pkey'.
`tests/advisory-lock.test.ts:38`: the label reads
`'fusion.document./organizations/AjdvjuECVZEgZoFajaIEkg/ideas/42'`.

- [ ] **Step 5: Verify and commit**

```bash
grep -rn "latestPutDelete\|lockDedup\|lockAddress\|fusion\.address\|\.lock(" api tests   # none (advisory-lock.test.ts may keep 'fusion.dedup.')
./test validate
./test postgres
git add -A && git commit -m "Name the locks and the head read"
```

## Phase G — The two writers (spec § Sequence 8)

### Task 22: Name the two writers by their covenant

**Spec:** § The gate — `appendMessagePair(view, pair)` →
`appendMessagePairOnce`; `putMessagePair(view, pair)` →
`appendMessagePairAlways`; `storedResponseFor(db, hash)` →
`getPairByRequestHash(db, hash)`.

**Files:**
- Modify: `api/message-pair.ts` (three definitions and their comments)
- Modify: every caller — `grep -rl "appendMessagePair\|putMessagePair\|storedResponseFor" api server tests`

- [ ] **Step 1: The rename, mechanically**

```bash
FILES=$(grep -rl "appendMessagePair\b\|putMessagePair\b\|storedResponseFor" api server tests)
perl -pi -e 's/\bappendMessagePair\b/appendMessagePairOnce/g;
             s/\bputMessagePair\b/appendMessagePairAlways/g;
             s/\bstoredResponseFor\b/getPairByRequestHash/g' $FILES
grep -rn "appendMessagePair\b\|putMessagePair\b\|storedResponseFor" api server tests   # none
```

`tests/pg-explain.test.ts` defines its own local
`putMessagePair(tx, n, …)` helper — the regex renames it and
its calls consistently; rename that helper to `appendRow`
by hand so it does not borrow the gate's word.

- [ ] **Step 2: The three comments**

On `appendMessagePairOnce`: "In-tx append (row ops only, no
crypto): a byte-identical request lands once — skips
silently if a pair with the same request_hash is already
stored." On `appendMessagePairAlways`: "In-tx append keyed
by pair id: a byte-identical request lands again. Auth
grant pairs use this path so two identical logins each land
(their ids differ)." On `getPairByRequestHash`: "The oldest
stored pair for this request hash, or undefined — the
idempotency fast path and the post-dispatch source of every
wire header." Fix the `MessagePair` doc comment
("minted inside appendMessagePairOnce") and the
`REPLAY_EXEMPT_ROUTE_PATTERNS` comment ("keyed by id
(appendMessagePairAlways)").

- [ ] **Step 3: Verify and commit**

```bash
./test validate
git add -A && git commit -m "Name the two writers by their covenant"
```

## Phase H — The wire (spec § Sequence 9)

### Task 23: Carry every pair id as `ETag`

**Spec:** § The wire — "Every response that carries a pair id
carries it as `ETag`, writes included. `Response-ID` retires
… `wireHeadersFor` and `streamGetFromStored` set `ETag`;
API.md and the tests that pin `Response-ID` follow." § Testing:
"A wire pin: a write response carries `ETag` and no
`Response-ID`." Deviation 4: the stored `response-id` field
stays.

**Files:**
- Modify: `api/message-pair.ts:540-547` (`wireHeadersFor`), `:574-602` (`streamGetFromStored`), comments at `:573`, `:907`
- Modify: `api/api.ts:1575-1583`, comments at `:766`, `:1529`
- Modify: `api/derive-documents.ts:113` (comment)
- Modify: `tests/http-fixtures.ts` (new helper `pairIdOf`)
- Modify: `tests/store-acceptance.ts` (the wire pin; 'exact retry replays as 200')
- Modify: the 25 other test files `grep -rl "Response-ID" tests` lists
- Modify: `API.md:58-66`

**Interfaces:**
- Produces: `pairIdOf(response: Response): string | null` in `tests/http-fixtures.ts`.

- [ ] **Step 1: Write the failing wire pin**

In `tests/store-acceptance.ts`, inside `defineStoreAcceptance`:

```ts
    Deno.test(name + ': a write carries ETag and no'
    + ' Response-ID', async () => {
        const { db, token } = await ready();
        const put = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'tWirePinAAAAAAAAAAAAAw', token,
            ideaDocument('Wire', 'ev-sa-wire'),
        ));
        assertStrictEquals(put.status, 201);
        assertStrictEquals(put.headers.get('Response-ID'), null);
        const etag = put.headers.get('ETag');
        assert(etag !== null && etag.startsWith('"'));
    });
```

Run the memory runner: FAIL (Response-ID present).

- [ ] **Step 2: The gate**

```ts
export function wireHeadersFor(stored: MessagePairEntity): HeadersInit {
    const headers: Record<string, string> = {
        'Date': httpDateOf(stored.response_at),
        'ETag': strongEtagOf(stored.id),
        'Operation-ID': stored.operation_id,
    };
    return headers;
}
```

In `streamGetFromStored` delete `headers.set('Response-ID',
stored.id);` (the trailing `attachEtag` already names the
pair); its comment reads "ETag names the stored pair". In
`api/api.ts:1575-1583` replace

```ts
                        return attachEtag(
                            Response.json(result, {
                                headers: {
                                    'Response-ID':
                                        headMessagePairId,
                                },
                            }),
                            headMessagePairId,
                        );
```

with

```ts
                        return attachEtag(
                            Response.json(result),
                            headMessagePairId,
                        );
```

Comments: `api/api.ts:766` "advertises an ETag it did not
store", `:1529` "ETag attach", `api/message-pair.ts:907`
"an ETag it did not store", `api/derive-documents.ts:113`
"(== the advertisable ETag)".

- [ ] **Step 3: The test helper and the 26 files**

Add to `tests/http-fixtures.ts`:

```ts
// The pair id a response advertises: its strong ETag,
// unquoted. No ETag → null.
export function pairIdOf(response: Response): string | null {
    const raw = response.headers.get('ETag');
    if (raw === null) return null;
    return raw.length >= 2
        && raw.startsWith('"')
        && raw.endsWith('"')
        ? raw.slice(1, -1)
        : raw;
}
```

Then:

```bash
FILES=$(grep -rl "Response-ID" tests)
perl -pi -e 's/(\w+)\.headers\.get\(\x27Response-ID\x27\)/pairIdOf($1)/g' $FILES
grep -n "Response-ID" $FILES
```

Every remaining hit is one of: the new pin (keep), a
`headers.has('Response-ID')` / `get('response-id')` variant
(rewrite by hand to `pairIdOf`), a pin that a read emits NO
`Response-ID` (keep — it is now literally true for every
route; retitle "emits no Response-ID header"), or a comment
(reword to ETag). Add `pairIdOf` to each file's
`./http-fixtures.ts` import. Where a test compared
`strongEtagOf(responseId)` to `headers.get('ETag')`, the
two sides are now the same header; simplify to
`assertStrictEquals(pairIdOf(res), expectedId)`.

- [ ] **Step 4: API.md**

Replace the "Wire contract" paragraph's header list:

"Three headers (`wireHeadersFor`): Date, ETag (quoted
message-pair identifier), Operation-ID. A document PUT's
ETag is its pair id, the same value a later GET advertises.
A byte-identical replay answers 200 with the original —
ETag and Date. If-Match is the sole conflict mechanism …"

and delete the sentence "Instance reads do not emit
Response-ID."

- [ ] **Step 5: Verify and commit**

```bash
grep -rn "Response-ID" api server web-app   # none
grep -rn "Response-ID" tests | grep -v "no Response-ID\|Response-ID'), null"   # only comments
./test validate
git add -A && git commit -m "Carry every pair id as ETag"
```

## Phase I — Docs (spec § Sequence 10)

### Task 24: Say path and name in the docs

**Spec:** § Docs. `SCHEMA.svg` already regenerated (Task 12);
API.md already follows the wire (Task 23).

**Files:**
- Modify: `SCHEMA.md`
- Modify: `ARCHITECTURE.md:175,185-187`
- Modify: `TODO.md:22,30,51,166,214`
- Modify: `TEST-PLAN.md:5380`

- [ ] **Step 1: SCHEMA.md**

Under "## The one table" replace "Columns are addressing
metadata." with:

"A document is `path` plus `name`: `pathname = path + name`,
the URL API's word. `path` is the collection's path, always
slash-bounded; `name` is the document's name within it — an
identifier for most documents, a word (`pii`,
`default-organization`, `binding`) for the singleton
sub-documents, and empty for an operation."

Under "## What the DDL buys you" item 1: "→
`getAllWhereBody` (`api/db.ts`)" stays; item 3:

"3. **`message_pairs_document`** — head and history for
   free (`path`, `name`, `response_at`, `id`). The seam
   promises `(response_at, id)` order on every read, on
   both backends; nothing above it re-sorts rows."

item 8: "**Tenancy rides `path`**". Add after item 10:

"11. **Three reads over the ledger** — `messageStore(db)`
    (`api/message-store.ts`): `getDocumentHead(path, name)`
    is the live PUT head pair or `null`;
    `getDocumentHistory(path, name)` is every pair at the
    document, in seam order; `getCollection(path)` is the
    live documents as entities."

- [ ] **Step 2: ARCHITECTURE.md**

Line 175: "Every family is a fold over pairs at a document
or a collection —". Rule (d): "write-gate reads are
entity-scoped (`getDocumentHistory`, `getCollectionPairs`),
never a whole-plane `getAll()` of `message_pairs` on a hot
path;". Line 312 "the event-append address" → "the
event-append path".

- [ ] **Step 3: TODO.md and TEST-PLAN.md**

`TODO.md:22` "by collection, by document, by
`request_hash`, body"; `:30` "head-of-document"; `:51`
"`path`"; `:166` "at an operation path"; `:214` "document …
that document's history". `TEST-PLAN.md:5380` "The surviving
pair at the document is". Leave `TODO.md:607` and
`TEST-PLAN.md:1278`, `:6757` (email and URL-bar prose).

- [ ] **Step 4: Prove it and commit**

```bash
grep -n -i "uri_collection\|uri_id\|uriCollection\|uriId\|message_pairs_address\|Response-ID" *.md   # none outside docs/superpowers
grep -n -i "address" SCHEMA.md ARCHITECTURE.md API.md README.md   # none
./test validate     # runs the lint's TODO/deferral checks too
git add -A && git commit -m "Say path and name in the docs"
```

### Task 25: Hand the walk's findings to the examination report

**Spec:** § Findings for the examination report — "they are
not this spec's to fix and are handed to the other spec's
report." Deviation 4 adds one.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-path-and-name-design.md` § Findings

- [ ] **Step 1: Append the finding**

Add a bullet: "The stored response wire carries a
`response-id` header line (`RESPONSE_ID_FIELD` in
`api/message-pair.ts`) that never reaches the HTTP wire;
renaming it to `etag` changes the stored `response` bytes of
every new pair (never `request_hash`, which is over the request
wire alone), so it stayed when `Response-ID` left the wire."

Update the spec's `Status` line to "executed" and, in the
Sequence, note Deviations 2, 3, and 6 in one line each so
the spec and the branch agree.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "Record the walk's findings in the spec"
```

### Task 26: Final verification and landing

- [ ] **Step 1: The full gate on both runners**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
./test postgres
```

Both green. Then the vocabulary proof over the whole tree:

```bash
grep -rn "uri_collection\|uri_id\|uriCollection\|uriId\|getAllWhere(\|getAllAtAddress\|headMessagePairIdAt\|latestPutDelete\|lockDedup\|lockAddress\|storedResponseFor\|putMessagePair\b\|appendMessagePair\b\|MESSAGE_TABLES\|ensureTables\|Response-ID\|create-only\|lockShared\|stampSchemaMarker\|putMany\|getCollectionFiltered" api server shared web-app tests bin deploy *.md \
  | grep -v "docs/superpowers"
```

Expected: only the "no Response-ID" pins and the
`api-work-orders-verb-gaps` "create-only PUT" route comment.

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
git merge --ff-only 2026-09-14-path-and-name
git worktree remove .worktrees/2026-09-14-path-and-name
git branch -d 2026-09-14-path-and-name
```

`2026-09-04-one-table-examined` then rebases onto master so
every statement it adds is written once, in this vocabulary
(spec § Precedes).

Render: the DDL change (Task 12) means the operator wipes
and reseeds after the deploy that carries it. Production
holds mock data.

---

## Self-review against the spec

- **§ Vocabulary** — `path`, `name` (Tasks 12, 14, 15);
  "address" retired (12, 14, 15, 16, 24);
  `message_pairs_document` (12); `null` for absence (20).
- **§ The seam** — `getCollectionPairs`,
  `getPairsByRequestHash`, `getDocumentHistory`, `append`
  (17); `putMany` (1); the order promise and the sorts (10);
  `getHeadPair` / `getCollectionHeadPairs` are the other
  spec's and have no task here.
- **§ The store** — `getDocumentHead`, `getDocumentHistory`
  (20); `getAllAt`, `getAllWhereBody` (11);
  `getCollectionFiltered` (7); `livePutOf` / `latestOf` /
  `livePutsOf` stay for the other spec.
- **§ The transaction** — every `Tx` rename (18, 19, 21);
  `delete` (2), `clear` (3), `lockShared` (4),
  `stampSchemaMarker` (5), `PostgresBackend.getAddress` (6),
  `'create-only'` (9); `WriteLocks` (21); the SQL names
  (18, 21); `selectAll` and `upsertRow` untouched.
- **§ The gate** — the two writers and
  `getPairByRequestHash` (22); `headMessagePairIdAt` (8);
  `documentHeadAt` kept.
- **§ The wire** — (23).
- **§ Docs** — SCHEMA.md, ARCHITECTURE.md, API.md, SVG,
  comments (12, 16, 23, 24).
- **§ Testing** — the order pin (10), the DDL pin (12), the
  wire pin (23), each removal takes its test (1-9, 17-19).
- **§ Sequence** — followed, with Deviations 2 and 6 stated.
- **§ Findings** — handed on (25).

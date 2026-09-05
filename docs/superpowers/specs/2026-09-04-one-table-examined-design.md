# The one table, examined: design

- Date: 2026-09-04
- Revised: 2026-09-14, after the operator's review and the walk
  through the read and write chain
- Status: awaiting review, pre-plan
- Worktree: `.worktrees/2026-09-04-one-table-examined`
- Base: the `2026-09-14-path-and-name` branch, once it lands;
  this spec is written in that vocabulary and rebases onto it
- Ships: a plan pin for every statement; heads in SQL for a
  collection, a document, and the gate's pre-transaction head
  read; thirteen document reads restored to their shape; an
  append-only write at the storage edge; `timestamptz` columns
  with RFC-3339 text at the adapter; the report
- Defers: four bullets at the top of TODO.md `## Later work`,
  drafted at the end
- Closes: TODO.md `## Critical product path` item 1

## Problem

`message_pairs` is the one table, and nothing in the tree says
how it behaves. Six pins in `tests/pg-explain.test.ts` cover
six of the statements `api/backend-postgres.ts` issues. The
store folds a whole collection down to its live heads in the
process, work the document index can do in one backward scan,
and the tree holds three implementations of "the head".
Thirteen single-document derives fetch their whole collection
and filter it to one name in the process. The write's
`ON CONFLICT (id) DO UPDATE` lets the store rewrite a pair the
doctrine calls append-only, and the memory backend replaces a
row the same way. Timestamps are text under a regex that
`2026-13-45T25:61:61.000000Z` satisfies. The advisory key space
is 52 bits. The GIN index sits on a function declared IMMUTABLE
over a STABLE primitive, and serves one lookup.

The operator's review narrowed the item to the basics: plans and
pins now, bounded corrections now, scale and timing later. The
walk through the chain then produced one vocabulary, which the
path-and-name spec lands first, and a set of findings this
spec's report carries.

## Decisions

1. **Postgres.** The compose container, `postgres:18`, driven
   from the sandbox. The operator added the Docker socket to
   the sandbox's `allowUnixSockets`. Render's Postgres is v18.
2. **Basics first.** Plans from the pin file's own shape, no
   scale sweep, no timings, no growth measurement.
3. **The axiom.** There are two ways to read and one way to
   write. A collection read is an exact match on a path,
   perhaps paged or filtered in a prescribed form. A document
   read is an exact match on path and name. The write appends
   one pair. A read that is neither shape is a defect, not a
   measurement subject.
4. **Heads in SQL.** Head-of-collection and head-of-document
   belong in the database. The process folds were a leftover
   of the localStorage → IndexedDB → Postgres transitions.
5. **Append-only at the storage edge.** A second `append` of an
   existing id changes nothing and says so. The statement
   becomes `ON CONFLICT (id) DO NOTHING`; the memory backend
   mirrors it.
6. **`timestamptz` in the columns, RFC-3339 text at the API.**
   Every read formats the two stamps back to the six-digit `Z`
   form with `to_char` inside the adapter's SELECT lists.
7. **Rename first.** The path-and-name spec renames and removes;
   this spec changes behavior. Every statement here is written
   once, in the final vocabulary.
8. **Migrations.** None exist and none are discussed here.

## Scope

1. **A plan for every statement.** After both specs the backend
   issues eleven: `selectPairById`, `selectAll`,
   `selectCollectionPairs`, `selectPairsByRequestHash`,
   `selectDocumentHistory`, `selectWhereBody`, `selectHead`,
   `selectHeadPair`, `selectCollectionHeadPairs`, the head lock,
   and `insertPair`. Each gets a pin. The `schema_marker`
   statements read a one-row table and are out of scope. The
   advisory locks and `pg_notify` have no plan.
2. **Heads in SQL.** Designed below.
3. **Document reads restored.** Designed below.
4. **Append-only write.** Designed below.
5. **`timestamptz`.** Designed below.
6. **Analysis in the report, from the tree, no probes.** The
   52-bit advisory key: postgres.js 3.4.9 sends a JavaScript
   number untyped (`inferType` in its `src/types.js` returns 0
   for numbers and strings), so the server parses the decimal
   text into the `bigint` the lock function takes, exact
   because 52 bits sit under 2^53; the collision bound for ten
   pooled connections is the birthday bound over 2^52. The
   IMMUTABLE declaration on `message_body`: `convert_from` is
   STABLE because its result depends on the database encoding,
   fixed at `CREATE DATABASE`, so the declaration is a lie
   Postgres tolerates and the index cannot drift unless the
   database is recreated, when the index is rebuilt anyway.
   Tenancy: both composite indexes lead with `path`, so the
   collection, document, and head plans show the prefix as the
   first index condition, the isolation the fence relies on.
7. **The stamps, honestly.** `request_at` is minted in
   `incomingContext` (`api/request-context.ts`) as the gate's
   first act, but by then `server/http-server.ts` has recorded
   its own `Date.now()` for the request log, awaited the whole
   body through `readCappedBody`, routed, sniffed the grant
   type, and throttled: the persisted stamp means "body
   received and routed", not "arrived", and the log runs on a
   second clock. `response_at` is minted at the row write
   inside the transaction, after the locks, before commit and
   before any byte is sent: the response's origination time in
   RFC 9110's sense, which the wire `ETag`'s sibling `Date`
   already derives from it, and stamping it after the locks is
   what makes `(response_at, id)` order agree with lock order.
   The recommendation goes to item 5, whose log work owns the
   request clock.
8. **The six folds, classified.** Each whole-ledger fold is
   named with the exact-read shape it must become and whether a
   data-shape decision precedes it. The classification is the
   oracle of a deferred bullet, not work here.
9. **The walk's findings.** Listed under the report.

## Non-goals

- No sweep, no timings, no growth, no vacuum study. Deferred.
- No migration discussion of any kind.
- No reshaping of the six folds, and no retirement of
  `selectAll`; classified only.
- No one-gate refactor of the 96 append sites; a bullet.
- No removals: every dead primitive leaves in the path-and-name
  spec.
- The authorize-code lookup stays a body search until item 2
  reshapes the auth ledger; the GIN index leaves with it.
- The E13 comment in `api/derive-invitations.ts` stays.

## Design: heads in SQL

Document methods are PUT and DELETE. The head of a document is
the latest of those by `(response_at, id)`; the document is live
when that head is a PUT.

**A collection's live heads**, seam `getCollectionHeadPairs(path)`:

```sql
SELECT <columns, stamps formatted> FROM (
    SELECT DISTINCT ON (name) *
    FROM message_pairs
    WHERE path = $1
      AND method IN ('PUT', 'DELETE')
    ORDER BY name DESC, response_at DESC, id DESC
) heads
WHERE method = 'PUT'
ORDER BY response_at, id
```

With `path` fixed, the inner order is the document index
`(path, name, response_at, id)` read backward, so `DISTINCT ON`
takes the first row per name straight off the scan with no
sort. The `id DESC` tie-break is uuid order, which
`tests/pg-identifier-order.test.ts` pins equal to
`compareIdentifiers`. The outer sort orders the heads, a small
set.

**One document's head**, seam `getHeadPair(path, name)`, the full
column list, PUT or DELETE, `null` when none:

```sql
SELECT <columns, stamps formatted>
FROM message_pairs
WHERE path = $1
  AND name = $2
  AND method IN ('PUT', 'DELETE')
ORDER BY response_at DESC, id DESC
LIMIT 1
```

One backward walk of the document index under a `Limit`, no
sort. `getHead(path, name)`, the gate's `{ id, method }`
projection, keeps its narrow statement so the write path never
pulls two wire messages per write; the three statements share
one shape and one pin family.

**The store.** `getCollection(path)` calls
`getCollectionHeadPairs` and parses bodies. `getDocumentHead
(path, name)` calls `getHeadPair` and returns it when its method
is PUT, else `null`. `getDocumentHistory` is unchanged.
`documentHeadAt` in `api/message-pair.ts` calls the seam's
`getHead` and its hand-written loop goes, so the tree holds one
head, in SQL. `livePutOf`, `latestOf`, and `livePutsOf` leave
`api/message-store.ts`. The memory backend computes the same
three reads with `latestByKey` from `shared/ledger-reduction.ts`.

**Body filters.** No live read filters heads by a body field;
`getCollectionFiltered` was dead and leaves in the other spec.
The only correct pushdown form, recorded for the day it has a
caller, wraps head selection rather than preceding it: a
predicate applied before the head is chosen lets a superseded
version's match elect the wrong head. The index-driven spelling
is an anti-join, a GIN bitmap over candidates verified by a
`NOT EXISTS` probe on the document index for a later PUT or
DELETE at the same path and name.

**Proof.** `defineStoreAcceptance` in `tests/store-acceptance.ts`
gains two cases both runners execute. A collection with a
revised document, a deleted document, a document followed by a
POST and a PATCH at its own name, and an untouched document
yields exactly the live PUT heads in `(response_at, id)` order.
A document with revisions returns its latest PUT; after a DELETE
head it returns `null`; a POST and a PATCH after the PUT do not
displace it. `tests/pg-explain.test.ts` pins the collection read
as an `Index Scan Backward` on `message_pairs_document` under a
`Unique` node with no `Sort` beneath it, and the document read
as the same scan under a `Limit`.

## Design: document reads restored

Thirteen sites read a whole collection through
`getCollectionPairs` and then filter it to one name in the
process. Twelve are single-document derives: `api/derive-ideas.ts`
(two), `api/derive-flows.ts` (three), `api/derive-projects.ts`
(two), `api/derive-record-types.ts` (two),
`api/derive-objectives.ts`, `api/derive-record-instances.ts`,
`api/derive-states.ts`. The thirteenth is
`revisionMessagePairIdForPatch` in `api/api.ts`, which reads the
collection to find a PATCH's sibling revision pair.

Each becomes `getDocumentHistory(path, name)`, exact on both
keys over the document index, with `deriveDocumentsAt` folding
only that document's pairs. Output is byte-identical; the derive
tests are the net. One commit per family.

The thirteenth site carries two fixes in its commit. Its
`=== undefined` branch is dead, since `getById` throws on
absence, and goes. It joins the two pairs of one operation by
`request_at` equality; the plan verifies whether the revision
pair is written under the same `operation_id`, and if so the
join uses it, since a timestamp coincidence is a fallacy waiting
for two operations in one microsecond.

## Design: append-only write

**The covenant.** `append(id, fields)` writes the row if its id
is absent and reports whether it did. A later `append` of the
same id changes nothing and reports `false`.

**Postgres.** `INSERT … ON CONFLICT (id) DO NOTHING RETURNING
id`; the row count is the report. `upsertRow` is renamed
`insertPair` in its own commit after the behavior lands, since
the other spec leaves the name with the behavior.

**Memory.** `append` in `api/backend-buffer-tx.ts` returns
`false` and leaves the row when the id exists.

**The interface.** `Tx.append` and `EntityStore.append` return
`Promise<boolean>`.

**The writer.** `writeMessagePairRows` throws when the report is
`false`: a fresh id that conflicts is an invariant violation,
which surfaces as a 500 inside the request boundary.

**What does not change.** The gate's 201-against-200 decision.
Replay identity is `request_hash`, not id: `appendMessagePairOnce`
finds the twin by hash under the request lock and returns before
any INSERT, and the gate then re-reads by hash to render the
stored row and compares ids. The affected-row count cannot carry
that signal, because the loser never reaches the INSERT.

**Proof.** An acceptance case both runners execute: a second
`append` of an existing id with different bytes reports `false`
and leaves the row byte-identical. `tests/pg-explain.test.ts`
pins `Conflict Resolution: NOTHING`. The race pins in
`tests/pg-races.test.ts` stay green unchanged.

## Design: `timestamptz`

**DDL.** `request_at timestamptz NOT NULL` and
`response_at timestamptz NOT NULL`. The two CHECK regexes go;
the type is the storage-edge validator, and it rejects the
month-13 stamp the regex accepted. The index definitions are
unchanged and each entry is about 20 bytes narrower per stamp:
a 27-character text carries a one-byte header, against 8 bytes
for the type.

**Reads.** Every `SELECT *` becomes an explicit column list in
which each stamp is
`to_char(<stamp> AT TIME ZONE 'UTC',
'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS <stamp>`. `US` pads to six
digits, `AT TIME ZONE 'UTC'` makes the result independent of
the session time zone, and the alias keeps the row shape, so
`entityOf` and every caller see the strings they see today.
`ORDER BY response_at, id` orders the native column; the
process's lexical order over the formatted text is the same
order because the width is fixed.

**Writes.** Stamps are sent as they are; postgres.js sends
strings untyped, so the server parses `…T17:03:00.123456Z` at
full resolution. The parameters carry an explicit
`::timestamptz` so the intent is visible.

**Round trip.** Byte-identical, including `.100000` and
`.000000`, because `US` pads what Postgres's default text
output would trim.

**Faults.** A malformed stamp reaching Postgres is a gate bug,
since the gate validates the form first; `api/errors-postgres.ts`
maps every non-timeout fault to 500 already. No new mapping.

**Memory backend.** Unchanged; it holds the strings.

**Docs and artifacts.** SCHEMA.md item 2 is rewritten from "the
six-digit CHECK" to the type plus the formatter. `SCHEMA.svg` is
regenerated; `./test validate` checks it.

**Render.** After the deploy that carries this, the operator
wipes and reseeds. Production holds mock data only. The executor
never runs a Render command.

**Proof.** A DDL pin asserts the two columns are `timestamptz`
and no stamp CHECK exists. An acceptance case on the Postgres
runner round-trips the two padded stamps.
`tests/timestamps.test.ts` is unchanged; it pins the formatter
the app still uses.

## The pins

`tests/pg-explain.test.ts` keeps its hand-built shape. After
both specs, one pin per statement:

- **Whole ledger:** a Seq Scan and a Sort, the only statement
  allowed to seq-scan, until the folds retire it.
- **Pair by id, head lock:** the primary key; the lock under
  `LockRows`.
- **Collection pairs, pairs by request hash, document
  history, body containment, head:** the six existing pins,
  re-targeted at the renamed statements.
- **Head pair, collection head pairs:** as proven above.
- **Insert:** `Conflict Resolution: NOTHING`.

Pins assert what the planner does, not what we wish it did.

## The report

`docs/superpowers/specs/<date>-one-table-examined-report.md`,
dated the day it is written. Header: base sha, Postgres 18
local and Render v18. Body: one section per statement with its
plan and its pin; the four corrections, each with before and
after; the analyses from scope item 6; the stamps from item 7;
the six folds classified; and the walk's findings:

- Three implementations of "the head", now one.
- Ninety-six append sites, one per pair per handler, because
  each handler owns its own storage instead of returning its
  pairs for one place to store.
- The authorize-code lookup is a document read done as a body
  search, and the GIN index exists for it alone; the hashed name
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
  on a NOT NULL column.
- The request log and the persisted `request_at` run on two
  clocks, and the persisted one starts after the body.

## Closing the item

Item 1 leaves `TODO.md`. The remaining items keep their
numbers; "Twelve items" becomes eleven; every mention of item
1, including the `## Sequencing` line and item 12's "lock and
growth findings", becomes the report's path.

## Deferred, in TODO's voice

The plan lands these four bullets verbatim at the top of
`## Later work`, in this order.

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

## Testing

- **Layer 1, memory.** The acceptance cases above on the memory
  runner; the `append` covenant; the three head reads; the
  thirteen derives' existing tests.
- **`./test postgres`.** The same acceptance cases on the
  Postgres runner; the DDL pin; the round-trip case; every
  plan pin.
- **`./test validate`** on every commit, including the SVG
  check.

## Sequence

One worktree, rebased onto `2026-09-14-path-and-name` once it
lands on master. Small commits, tests first.

1. This spec, then the plan.
2. Pins for the statements pinnable at today's truth.
3. Heads in SQL: two acceptance cases red on both runners; the
   three statements, the memory folds, the store and
   `documentHeadAt` wiring; green; the two head pins.
4. Document reads restored: one commit per family, the
   thirteenth with its two fixes.
5. Append-only write: acceptance case red; `DO NOTHING`, the
   memory mirror, the boolean interface, the writer's throw;
   green; the insert pin; then the `insertPair` rename.
6. `timestamptz`: DDL pin red; the DDL, the select lists, the
   casts; green; the round-trip case; SVG regenerated;
   SCHEMA.md.
7. The report.
8. The TODO close and the four deferred bullets.

`./test validate` green on every commit; `./test postgres`
green before steps 2 through 6 land.

## Environment notes for the executor

- `export DENO_DIR="$TMPDIR/deno-dir"` before any `deno`
  command in the sandbox.
- `./test postgres` starts its own compose project and needs
  the Docker socket, now allowed.

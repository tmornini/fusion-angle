# Path and name: the ledger's vocabulary

- Date: 2026-09-14
- Status: awaiting review, pre-plan
- Worktree: `.worktrees/2026-09-14-path-and-name`
- Base: master at `2b68e4c2`
- Ships: one vocabulary for the ledger's read and write chain,
  from the two columns to the wire header, and the removal of
  every dead primitive found on the walk. Renames and removals
  only; behavior changes are the other spec's.
- Precedes: `2026-09-04-one-table-examined-design.md` rebases
  onto this branch so every statement it adds is written once,
  in this vocabulary.

## Problem

The API has two ways to read and one way to write, and the
chain that serves them has several words for each. A document's
URI is `uri_collection` plus `uri_id` in the row, `uriCollection`
plus `uriId` in the domain, and "address" in 190 comments, an
index name, and two lock names, a word no document defines. The
last segment is called an id, and for `pii`,
`default-organization`, and `binding` it is a word. "All" means
collection in one method and history in the next. `getAllWhere`
promises any column and accepts two. The store's `get` returns a
pair and its `getCollection` returns entities. The seam sorts,
then the store sorts the sorted rows again. `put` overwrites and
`append` is the idempotent one. One value leaves the wire as
`ETag` on reads and `Response-ID` on writes, and the client reads
only `ETag`. Six methods have no caller.

The walk through the chain, one function at a time, produced a
verdict for each. This spec is those verdicts, in order, as
commits that rename or remove and never change behavior.

## The axiom

There are two ways to read and one way to write.

- A **collection** read is an exact match on the collection's
  path, perhaps paged or filtered in a prescribed form.
- A **document** read is an exact match on path and name.
- The **write** appends one pair to one document's history.

Every name in the chain is derived from these three. A read that
is neither shape has no name here; the six whole-ledger folds
are classified by the other spec and reshaped by a later item.

## Vocabulary

| Was | Becomes | Meaning |
|---|---|---|
| `uri_collection`, `uriCollection` | `path` | the collection's path |
| `uri_id`, `uriId` | `name` | the document's name within it |
| `pathname` | `pathname` | `path + name`, the URL API's word |
| "address" | retired | said `path`, `name`, or `document` |
| `message_pairs_address` | `message_pairs_document` | the document index |
| "head" | kept | the latest PUT or DELETE at a document |
| `id` on a pair | kept | the pair's identity, `ETag` on the wire |

`name` is a name, not an identifier: for most documents it is
their identifier, for the singleton sub-documents it is a word.
`path = /identities/<id>/` and `name = pii` is the honest reading
of a row the old names called an id.

Absence is `null`, at every layer. The store's `undefined` goes.

## The seam: `db.messagePairs`

`EntityStore<MessagePairEntity>` in `api/db.ts`, implemented by
`api/store-history-entity.ts`.

| Was | Becomes |
|---|---|
| `getAll()` | kept as is; retires with the six folds |
| `getAllWhere('uri_collection', c)` | `getCollectionPairs(path)` |
| `getAllWhere('request_hash', h)` | `getPairsByRequestHash(hash)` |
| `getAllAtAddress(c, id)` | `getDocumentHistory(path, name)` |
| `getAllWhereBody(c, json)` | kept; retires with item 2 |
| `getById(id)` | kept |
| `put(id, fields)` | `append(id, fields)` |
| `putMany(entries, ids)` | removed; one test caller, no product caller |

`getCollectionPairs` is the literal `WHERE path = $1`: every pair
of every document in the collection. It has one caller, the
generic collection GET for trio families, which item 7 retires.

The seam promises `(response_at, id)` order on both backends,
pinned by the acceptance suite on both runners. Every `.sort` in
`api/message-store.ts` goes: the two in
`messagePairsInCollection` and `messagePairsAt`, the
`.slice().sort()` in `getAllWhereBody`, and the one in
`livePutsOf`. Postgres orders in `ORDER BY`; the memory backend
orders once in its filter. Nothing sorts twice.

The head reads the other spec introduces take these names at the
seam: `getHeadPair(path, name)`, the full head pair, PUT or
DELETE, `null` when none; and `getCollectionHeadPairs(path)`, the
live PUT heads of a collection.

## The store: `messageStore(db)`

Kept as a layer. The seam returns pairs; the store returns what
the API returns, and is the one place a body is parsed.

- `get(c, id)` → `getDocumentHead(path, name)`: the live PUT head pair, its
  `id` the ETag, or `null`
- `getMessagePairs(c, id)` → `getDocumentHistory(path, name)`: the pairs,
  ordered by the seam
- `getAllAt(c)` → removed; its one caller calls `getCollectionPairs`
- `getAllWhereBody(c, json)` → removed; its one caller calls the seam
- `getCollection(c)` → kept: the live documents as entities
- `getCollectionFiltered(c, f)` → removed with `matchesFilters`; no caller

`getDocumentHead` returns the pair, not the entity, because its
callers need the pair's id for `ETag` and the body's `id` is the
document's name. `livePutOf`, `latestOf`, and `livePutsOf` leave
with the other spec's head reads; the store's three surviving
methods each call one seam read.

## The transaction: `Tx` and `WriteLocks`

The `table` argument goes. Every `Tx` method loses it,
`assertMessageTable` goes, `transaction(tables, mode, fn)`
becomes `transaction(mode, fn)` at every `MESSAGE_TABLES` and
`TABLE_NAMES` call site, and `ensureTables` becomes
`ensureTable`. There is one table; the interface stops saying
otherwise.

- `get(table, id)` → `getById(id)`
- `getAll(table)` → `getAll()`; retires with the folds
- `getWhere(table, col, key)` → `getCollectionPairs(path)`,
  `getPairsByRequestHash(hash)`
- `getAddress(table, c, id)` → `getDocumentHistory(path, name)`
- `getWhereBody(table, c, json)` → `getWhereBody(path, json)`; retires with
  item 2
- `put(table, row)` → `append(row)`
- `delete(table, id)` → removed; one caller, `putMany`
- `clear(table)` → removed with `deleteAll`; ten tests get a fresh adapter
  per case
- `lock(label)` → `lockRequest(hash)`, `lockDocument(path, name)`; the label
  prefixes move inside
- `lockShared(label)` → removed; no caller
- `lockHead(id)` → kept: the ETag pin, `FOR UPDATE` on the head pair
- `latestPutDelete(c, id)` → `getHead(path, name)`: `{ id, method }` or
  `null`
- `notify(event)` → kept
- `stampSchemaMarker()` → removed from `Tx`; the backend's
  `postSchemaCreation` is the caller's

`WriteLocks` carries the same names up: `lockRequest`,
`lockDocument`, `lockHead`, `getHead`, `notify`. The
`ConcurrencyClass` value `'create-only'` has no family and goes.

The SQL functions in `api/backend-postgres.ts` take the seam's
name with a `select` prefix: `selectPairById`,
`selectCollectionPairs`, `selectPairsByRequestHash`,
`selectDocumentHistory`, `selectHead`. `selectAll` stays until
the folds go. `upsertRow` keeps its name here because it still
upserts; the other spec renames it when it changes it.
`PostgresBackend.getAddress`, a read-only transaction around the
Tx read, has no product caller and goes.

## The gate: `api/message-pair.ts`

- `appendMessagePair(view, pair)` → `appendMessagePairOnce`: a
  byte-identical request lands once
- `putMessagePair(view, pair)` → `appendMessagePairAlways`: a byte-identical
  request lands again
- `storedResponseFor(db, hash)` → `getPairByRequestHash(db, hash)`: the
  oldest, named as a rule, not `[0]`
- `headMessagePairIdAt(db, c, id)` → removed; its four callers read `.id`
  off `getDocumentHead`
- `documentHeadAt(db, c, id)` → kept by name; folds onto the seam's
  `getHead` in the other spec

`appendMessagePairOnce` has 96 call sites and
`appendMessagePairAlways` six, all in `api/`. The suffix is the
covenant each keeps, visible at every site instead of in a set
of route patterns and a comment.

## The wire

Every response that carries a pair id carries it as `ETag`,
writes included. `Response-ID` retires: the client reads only
`ETag`, and one value under two names was the duality that
started the question. `wireHeadersFor` and `streamGetFromStored`
set `ETag`; API.md and the tests that pin `Response-ID` follow.

## Docs

- SCHEMA.md: `pathname = path + name`; the document index; the
  seam's order promise; the store's three methods; "address"
  gone.
- ARCHITECTURE.md: the derivation convention's rule (d) names
  `getDocumentHistory` and `getCollectionPairs`; "address" gone.
- API.md: `ETag` on writes; `Response-ID` gone.
- SCHEMA.svg regenerated; `./test validate` checks it.
- Comments: "address" becomes `path`, `name`, or `document`
  wherever it appears, in the same commit as the identifier it
  sits beside.

## Sequence

One worktree. Every commit is a pure rename or a pure removal;
none changes behavior, and none mixes the two. `./test
validate` green on every commit; `./test postgres` green at the
DDL commit and at the end.

1. This spec, then the plan.
2. Removals, one commit each: `putMany`; `Tx.delete`; `Tx.clear`
   with `deleteAll` and the ten tests' reset; `lockShared`;
   `Tx.stampSchemaMarker`; `PostgresBackend.getAddress`;
   `getCollectionFiltered` with `matchesFilters`; the store's
   `getAllAt` and `getAllWhereBody`, their callers moved to the
   seam; `headMessagePairIdAt`; `'create-only'`.
3. The seam's order promise: the acceptance pin on both runners,
   then the four store sorts removed.
4. The columns: `path` and `name` in the DDL, the index renamed,
   `MessagePairEntity`, the storage rows, then the domain fields
   layer by layer: `shared`, the seam, the gate, the derives,
   the routes, `web-app`, `tests`. Per-file review for the 277
   bare `name` and 130 bare `path` identifiers already in
   `api/`; the type checker cannot see a same-typed shadow.
5. The seam and Tx renames, and the `table` argument removed.
6. The store renames; `null` for absence.
7. The lock renames.
8. The two writers renamed across their 102 call sites.
9. `Response-ID` to `ETag`.
10. Docs and the SVG.

Render: the DDL change means a wipe and reseed by the operator
after the deploy that carries it. Production holds mock data.

## Testing

Pure renames have the existing suites as their net. Added:

- The acceptance suite pins `(response_at, id)` order on both
  runners.
- A DDL pin: the columns are `path` and `name`, the index is
  `message_pairs_document`.
- A wire pin: a write response carries `ETag` and no
  `Response-ID`.
- Every removal commit removes the test that exercised the dead
  primitive, or moves the reset it relied on.

## Findings for the examination report

The walk found these; they are not this spec's to fix and are
handed to the other spec's report:

- `revisionMessagePairIdForPatch` in `api/api.ts` has a dead
  `=== undefined` branch, since `getById` throws, and joins the
  two pairs of one operation by `request_at` equality where
  `operation_id` is the honest key.
- The memory backend's sort coerces `response_at` with `?? ''`
  on a NOT NULL column.
- Three implementations of "the head": `livePutOf`, the loop in
  `documentHeadAt`, and the SQL.
- Ninety-six append sites: each handler owns its own storage
  instead of returning its pairs for one place to store.
- The authorize-code lookup is a document read done as a body
  search, and the GIN index exists for it alone.
- Operation pairs store `name = ''`.
- The two advisory locks are constraints in disguise.
- The collection GET reads its collection twice.

## Environment notes for the executor

- `export DENO_DIR="$TMPDIR/deno-dir"` before any `deno`
  command in the sandbox.
- `./test postgres` starts its own compose project and needs
  the Docker socket, now allowed.

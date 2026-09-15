# The one table, examined: report

- Date: 2026-09-15
- Base: 85c45eaf, branch `2026-09-04-one-table-examined`
- Postgres: 18.6 (compose `postgres:18`, read from
  `docker run --rm postgres:18 postgres --version`); Render v18
- Spec: docs/superpowers/specs/2026-09-04-one-table-examined-design.md
- Closes: TODO.md `## Critical product path` item 1

The backend issues eleven statements against `message_pairs`. Each has
a pin in `tests/pg-explain.test.ts` and each plan below was captured
from `./test postgres` at this base, with a temporary `console.log`
that was reverted before the commit. `./test postgres` is green at
66 passed, 0 failed.

The pins EXPLAIN `SELECT *` where the adapter names its columns: a
`to_char` in the select list adds no plan node, so the shapes are the
same (Deviation 7). `grep -c "Deno.test(" tests/pg-explain.test.ts`
prints 12 — eleven pins plus an `ignore: true` stub that stands in when
`POSTGRES_URL` is unset. The `schema_marker` statements, the two
advisory locks, and `pg_notify` are out of scope (spec § Scope 1); an
advisory lock has no plan.

Every plan carries the planner's cost estimates from the pin fixture's
seeded ledger: 200 authorize pairs, 4 idea pairs, 81 pairs at one
versioned name, 2000 filler pairs, `ANALYZE`d before the pins run.

## The statements and their pins

### `selectPairById`

```sql
SELECT <columns> FROM message_pairs
WHERE id = $1
```

Pin: `pk uses message_pairs_pkey`.

```
Index Scan using message_pairs_pkey on message_pairs  (cost=0.28..8.30 rows=1 width=201)
  Index Cond: (id = '69a69a69-a69a-69a6-9a69-a69a69a69ad4'::uuid)
```

### `selectAll`

```sql
SELECT <columns> FROM message_pairs
ORDER BY message_pairs.response_at, message_pairs.id
```

Pin: `the whole ledger is the one seq scan, sorted`.

```
Sort  (cost=221.33..227.04 rows=2285 width=201)
  Sort Key: response_at, id
  ->  Seq Scan on message_pairs  (cost=0.00..93.85 rows=2285 width=201)
```

This is the one statement allowed to seq-scan. It exists for the six
whole-ledger folds classified below and retires with the last of them;
until then the pin asserts the scan rather than wishing it away.

### `selectCollectionPairs`

```sql
SELECT <columns> FROM message_pairs
WHERE path = $1
ORDER BY message_pairs.response_at, message_pairs.id
```

Pin: `small collection uses collection index`.

```
Index Scan using message_pairs_collection on message_pairs  (cost=0.28..15.79 rows=4 width=201)
  Index Cond: (path = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'::text)
```

### `selectPairsByRequestHash`

```sql
SELECT <columns> FROM message_pairs
WHERE request_hash = $1
ORDER BY message_pairs.response_at, message_pairs.id
```

Pin: `request_hash uses message_pairs_replay`.

```
Index Scan using message_pairs_replay on message_pairs  (cost=0.28..8.30 rows=1 width=201)
  Index Cond: (request_hash = '0000000000000000000000000000000000000000000000000000000000000001'::text)
```

The index is not unique and the plan does not claim it is; three routes
store duplicate hashes by design (below).

Two pins are narrower than the statements they stand for, and this is
one. The pin's text omits the statement's
`ORDER BY response_at, id`, so the captured plan carries no `Sort`
node: `message_pairs_replay` is on `request_hash` alone and orders
nothing. The pin proves index selection, not the ordering. A later
statement-faithful pin would show the `Sort` the real read pays.

### `selectDocumentHistory`

```sql
SELECT <columns> FROM message_pairs
WHERE path = $1
  AND name = $2
ORDER BY message_pairs.response_at, message_pairs.id
```

Pin: `document read uses the document index`.

```
Index Scan using message_pairs_document on message_pairs  (cost=0.28..13.30 rows=3 width=201)
  Index Cond: ((path = '/versioned/'::text) AND (name = 'AjdvjuECVZEgZoFajaIEkg'::text))
```

Both keys are index conditions and the `ORDER BY` needs no sort: the
index is `(path, name, response_at, id)` and the scan walks it forward.

### `selectWhereBody`

```sql
SELECT <columns> FROM message_pairs
WHERE path = $1
  AND message_body(response) @> $2::jsonb
ORDER BY message_pairs.response_at, message_pairs.id
```

Pin: `body containment uses message_pairs_body`.

```
Sort  (cost=46.81..46.82 rows=1 width=201)
  Sort Key: response_at, id
  ->  Bitmap Heap Scan on message_pairs  (cost=42.54..46.80 rows=1 width=201)
        Recheck Cond: (message_body(response) @> '{"code": "abc"}'::jsonb)
        Filter: (path = '/authentication/authorize/'::text)
        ->  Bitmap Index Scan on message_pairs_body  (cost=0.00..42.54 rows=1 width=0)
              Index Cond: (message_body(response) @> '{"code": "abc"}'::jsonb)
```

This is the only statement whose `path` is a `Filter` rather than an
`Index Cond`: the GIN index is on the expression alone, so the tenancy
prefix is checked after the bitmap, on the heap. It is also the only
plan with a `Sort` that a composite index could have avoided. Both
follow from the lookup being a document read spelled as a body search;
the finding below hands the hashed-name design to item 2, and the
index leaves with it.

### `selectHead`

```sql
SELECT id, method FROM message_pairs
WHERE path = $1
  AND name = $2
  AND method IN ('PUT', 'DELETE')
ORDER BY response_at DESC, id DESC
LIMIT 1
```

Pin: `getHead uses the document index and pkey`.

```
Limit  (cost=0.28..4.62 rows=1 width=28)
  ->  Index Scan Backward using message_pairs_document on message_pairs  (cost=0.28..13.31 rows=3 width=28)
        Index Cond: ((path = '/versioned/'::text) AND (name = 'AjdvjuECVZEgZoFajaIEkg'::text))
        Filter: (method = ANY ('{PUT,DELETE}'::text[]))
```

The gate's narrow projection: the write path reads `{ id, method }` and
never pulls two wire messages per write. `width=28` against
`selectHeadPair`'s `width=201` is that difference, measured.

### `selectHeadPair`

```sql
SELECT <columns> FROM message_pairs
WHERE path = $1
  AND name = $2
  AND method IN ('PUT', 'DELETE')
ORDER BY message_pairs.response_at DESC, message_pairs.id DESC
LIMIT 1
```

Pin: `head pair is one backward walk under a Limit`.

```
Limit  (cost=0.28..4.62 rows=1 width=201)
  ->  Index Scan Backward using message_pairs_document on message_pairs  (cost=0.28..13.31 rows=3 width=201)
        Index Cond: ((path = '/versioned/'::text) AND (name = 'AjdvjuECVZEgZoFajaIEkg'::text))
        Filter: (method = ANY ('{PUT,DELETE}'::text[]))
```

One backward walk under a `Limit`, no sort. The `method` predicate is a
`Filter`, not an `Index Cond` — the index does not carry `method` — so
a document whose tail is a long run of POSTs and PATCHes walks that run
before it reaches a head. The `Limit` still stops at the first match.

### `selectCollectionHeadPairs`

```sql
SELECT <columns> FROM (
    SELECT DISTINCT ON (name) *
    FROM message_pairs
    WHERE path = $1
      AND method IN ('PUT', 'DELETE')
    ORDER BY name DESC, response_at DESC, id DESC
) heads
WHERE method = 'PUT'
ORDER BY heads.response_at, heads.id
```

Pin: `collection head pairs come off the document index backward under
Unique`.

```
Sort  (cost=15.87..15.88 rows=1 width=201)
  Sort Key: heads.response_at, heads.id
  ->  Subquery Scan on heads  (cost=0.28..15.86 rows=1 width=201)
        Filter: (heads.method = 'PUT'::text)
        ->  Unique  (cost=0.28..15.81 rows=4 width=201)
              ->  Index Scan Backward using message_pairs_document on message_pairs  (cost=0.28..15.80 rows=4 width=201)
                    Index Cond: (path = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'::text)
                    Filter: (method = ANY ('{PUT,DELETE}'::text[]))
```

No `Sort` beneath `Unique`: with `path` fixed the index
`(path, name, response_at, id)` read backward already delivers
`name DESC, response_at DESC, id DESC`, so `DISTINCT ON (name)` takes
the first row per name straight off the scan. The outer `Sort` orders
the heads — one row per document, a small set — and is the price of
returning them oldest-first. The `id DESC` tie-break is uuid order,
which `tests/pg-identifier-order.test.ts` pins equal to
`compareIdentifiers`.

### The head lock (`lockHead`)

```sql
SELECT id FROM message_pairs
WHERE id = $1
FOR UPDATE
```

Pin: `the head lock rows the primary key`.

```
LockRows  (cost=0.28..8.31 rows=1 width=22)
  ->  Index Scan using message_pairs_pkey on message_pairs  (cost=0.28..8.30 rows=1 width=22)
        Index Cond: (id = '69a69a69-a69a-69a6-9a69-a69a69a69ad4'::uuid)
```

`LockRows` over the primary key: the If-Match path latches exactly the
row it claims as the head, and the lock is row-level rather than
advisory. It is the only lock in the tree with a plan.

### `insertPair`

```sql
INSERT INTO message_pairs (
    id, path, name,
    requester_identity_id, method,
    request_at, request_hash, request,
    response_at, response,
    operation_id
) VALUES (
    $1, $2, $3, $4, $5,
    $6::text::timestamptz, $7, $8,
    $9::text::timestamptz, $10,
    $11
)
ON CONFLICT (id) DO NOTHING
RETURNING id
```

Pin: `insert resolves an id conflict by doing nothing`.

```
Insert on message_pairs  (cost=0.00..0.01 rows=0 width=0)
  Conflict Resolution: NOTHING
  Conflict Arbiter Indexes: message_pairs_pkey
  ->  Result  (cost=0.00..0.01 rows=1 width=272)
```

This is the second pin narrower than its statement: the pin's text
omits `RETURNING id` and the stamps' `::text::timestamptz` casts, both
of which the statement carries. Neither adds a plan node — `RETURNING`
projects the row the `Insert` already has, and a cast is evaluated in
the `Result` — so the shape the pin asserts is the shape the statement
plans. The casts have their own Layer-1 guard in
`tests/backend-postgres.test.ts`; `RETURNING` has the append
acceptance case, which reads the boolean the row count produces.

## The four corrections

### 1. Heads in SQL

Before: three implementations of "the head". `livePutsOf`, `livePutOf`,
and `latestOf` in `api/message-store.ts` folded a whole collection in
the process, and `documentHeadAt` in `api/message-pair.ts` ran its own
loop over a document's history.

After: two statements at the seam. `selectCollectionHeadPairs` is
`DISTINCT ON (name)` over `message_pairs_document` read backward;
`selectHeadPair` is `LIMIT 1` off the same walk. The memory backend
computes the same three reads with `latestByKey` from
`shared/ledger-reduction.ts`. `getCollection(path)` calls
`getCollectionHeadPairs` and parses bodies; `getDocumentHead(path,
name)` calls `getHeadPair` and returns it when the head's method is
PUT, else `null`; `documentHeadAt` calls the seam's `getHead`. The
tree holds one head, in SQL.

Landed: c9410788 (the ledger scan, the head lock, and the head shape
pinned), 51a1ff8e (the heads read at the seam, in SQL), 0109cfd4 (the
store's three folds gone), a0c08729 (the two head plans pinned).

Proof: the two acceptance cases in `defineStoreAcceptance`
(`tests/store-acceptance.ts`), executed by both runners, and the two
head pins above.

### 2. Document reads restored

Before: thirteen sites read a whole collection through
`getCollectionPairs` and filtered it to one name in the process.

After: each reads `getDocumentHistory(path, name)`, exact on both keys
over the document index, with `deriveDocumentsAt` folding only that
document's pairs. The thirteen, by file and function as they landed
(the spec's § Design named twelve derives with one in
`api/derive-record-instances.ts` and one in `api/derive-states.ts`;
Deviation 1 re-attributed the pair to `derive-record-instances`, and
`derive-states` carried none):

- `api/derive-ideas.ts` — `deriveIdea`, `deriveIdeaStateHistory`
  (6317306f)
- `api/derive-flows.ts` — `deriveFlow`, `resolveFlowUndoTarget`,
  `deriveFlowStateHistory` (69f3ae78)
- `api/derive-projects.ts` — `deriveProject`,
  `deriveProjectStateHistory` (1ed70846)
- `api/derive-record-types.ts` — `deriveRecordTypeEntity`,
  `deriveRecordTypeStateHistory` (d6c6deab)
- `api/derive-objectives.ts` — `deriveObjectiveStateHistory` (dc7b0613)
- `api/derive-record-instances.ts` — `deriveInstanceHead`,
  `deriveInstanceRevisions` (21aa5782)
- `api/api.ts` — `revisionMessagePairIdForPatch` (4345c36b)

The thirteenth carried two fixes. Its `=== undefined` branch was dead,
since `getById` throws on absence, and went. It joined a PATCH to its
sibling revision pair by `request_at` equality; the join now uses
`operation_id` (d3ebf0f9), a timestamp coincidence being a fallacy
waiting for two operations in one microsecond.

That join exposed a client bug the plan could not know. The CLIENT
minted one Operation-ID per request context (`makeRequestContext`,
`web-app/app/adapters/shared.ts`) and reused it across every write that
context issued, so two PATCHes of one instance from one page shared an
id and the join found the wrong sibling. The fix landed on this branch:
the client mints one id per write (`writeHeaders`, 27201ab0), and
API.md item 3 states the contract (3e31d9f6) — an Operation-ID names
one write and is never reused; a retry or resend of one operation
carries the same id, which is what makes it byte-identical and lets it
replay.

Not done: server-side enforcement of non-reuse. It needs a read by
operation id, which is neither a collection read nor a document read
under the spec's axiom. It is named as a finding below.

Proof: the derive and drift suites, byte-identical output.

### 3. Append-only write

Before: `ON CONFLICT (id) DO UPDATE` — the store could rewrite a stored
pair — and a memory `put` that replaced the row.

After: `ON CONFLICT (id) DO NOTHING RETURNING id`, whose returned row
count is the report; the memory backend's `append` in
`api/backend-buffer-tx.ts` returns `false` and leaves the row; `Tx.
append` and `EntityStore.append` return `Promise<boolean>`; and
`writeMessagePairRows` throws when the report is `false`, because a
fresh id that conflicts is an invariant violation and surfaces as a 500
inside the request boundary.

Landed: fa59f043 (append once at the storage edge), 3eb37a97 (the
insert's conflict resolution pinned), acb21e56 (`upsertRow` renamed
`insertPair`, after the behavior, in its own commit).

What did not change: the gate's 201-against-200 decision, which rides
`request_hash`, not id. `appendMessagePairOnce` finds the twin by hash
under the request lock and returns before any INSERT, and the gate
re-reads by hash to render the stored row and compares ids. The
affected-row count cannot carry that signal, because the loser never
reaches the INSERT.

Proof: the acceptance case both runners execute (a second `append` of
an existing id with different bytes reports `false` and leaves the row
byte-identical); the `Conflict Resolution: NOTHING` pin above; the race
pins in `tests/pg-races.test.ts` green unchanged.

### 4. `timestamptz`

Before: `request_at` and `response_at` were `text COLLATE "C"` under a
CHECK regex that `2026-13-45T25:61:61.000000Z` satisfies.

After: both columns are `timestamptz NOT NULL`, the two CHECK regexes
are gone, every read formats the stamp with
`to_char(<stamp> AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
aliased back to the column name, and the write casts each stamp
parameter. The type is now the storage-edge validator and rejects the
month-13 stamp the regex accepted. Each stamp is about 20 bytes
narrower: a 27-character text carries a one-byte varlena header, 28
bytes, against 8 bytes for the type. Both composite indexes carry
`response_at`, so each index entry shrinks by that once; the heap row
carries both stamps and shrinks by twice it.

Landed: 7f375b7a (the stamps stored as `timestamptz`), b1d15480 (padded
stamps round-tripped through the seam), 85c45eaf (SCHEMA.md).

The write casts `${stamp}::text::timestamptz`, not `::timestamptz`, and
the extra hop is load-bearing. Confirmed from the `npm:postgres@3.4.9`
source: a cast written directly after a placeholder lets the server
infer that parameter's type, the driver caches the OID on the prepared
statement (`connection.js`, ParameterDescription), and on every LATER
execution it serializes the string through its own `timestamptz`
serializer, `new Date(x).toISOString()` — three fraction digits. The
first execution sends raw text and is exact; the second truncates. The
`::text` hop makes the inferred OID `text`, whose serializer is the
identity, and the server parses six digits. The spec's premise that
"postgres.js sends strings untyped" holds only for a bare placeholder.

Proof: the DDL pin `the two stamps are timestamptz with no CHECK`
(`tests/schema-lifecycle.test.ts`); the round-trip acceptance case
`padded stamps round-trip byte for byte` on the Postgres runner; and
two Layer-1 guards in `tests/backend-postgres.test.ts` — `every pair
read formats both stamps as zulu text` (all eight pair reads) and
`append casts both stamps to timestamptz` (`$6::text::timestamptz`,
`$9::text::timestamptz`).

## Analyses from the tree (spec § Scope 6)

### The 52-bit advisory key

`advisoryKey` (`api/advisory-lock.ts`) takes
`ADVISORY_KEY_HEX_DIGITS = 13` hex digits of the SHA-256 of a lock
label — 52 bits — and returns `BigInt('0x' + hex)`. `advisoryLock`
(`api/backend-postgres.ts:254`) passes `Number(await advisoryKey(
label))` with no type annotation, and postgres.js 3.4.9's `inferType`
(`src/types.js:220`) falls through to `0` for a JavaScript number, as
it does for a string. The driver therefore sends the decimal text
untyped and the server parses it into the `bigint` that
`pg_advisory_xact_lock` takes. The conversion is exact: 52 bits sit
under 2^53, so `Number` loses nothing.

Collision bound for `POOL_MAX = 10` concurrent labels: the birthday
bound over 2^52 is C(10,2) / 2^52 = 45 / 2^52 ≈ 1e-14 per instant. A
collision only serializes unrelated work; it corrupts nothing.

### The IMMUTABLE `message_body`

`message_body(bytea) RETURNS jsonb` is declared `IMMUTABLE STRICT
PARALLEL SAFE` (`api/schema-postgres.ts:34`) and calls `convert_from(…,
'UTF8')` (`:42`). `convert_from` is STABLE, not IMMUTABLE, because its
result depends on the database encoding, which is fixed at
`CREATE DATABASE`. The declaration is therefore a lie Postgres
tolerates, and the expression GIN index built on it cannot drift unless
the database is recreated — at which point the index is rebuilt anyway.
The index serves exactly one lookup, the authorize-code body search,
and leaves with item 2.

### Tenancy

Both composite indexes lead with `path`:
`message_pairs_document (path, name, response_at, id)` and
`message_pairs_collection (path, response_at, id)`. The collection, the
document, and both head plans show the prefix as the first index
condition, which is the isolation the tenancy fence relies on — a
tenant's rows are a contiguous index range, not a filtered scan. From
the captured plans:

- collection (`selectCollectionPairs`):
  `Index Cond: (path = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'::text)`
- document (`selectDocumentHistory`):
  `Index Cond: ((path = '/versioned/'::text) AND (name = 'AjdvjuECVZEgZoFajaIEkg'::text))`
- head (`selectHead`):
  `Index Cond: ((path = '/versioned/'::text) AND (name = 'AjdvjuECVZEgZoFajaIEkg'::text))`
- head pair (`selectHeadPair`):
  `Index Cond: ((path = '/versioned/'::text) AND (name = 'AjdvjuECVZEgZoFajaIEkg'::text))`
- collection heads (`selectCollectionHeadPairs`):
  `Index Cond: (path = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'::text)`

`selectWhereBody` is the exception noted above: its `path` is a
`Filter`, not an `Index Cond`.

## The stamps, honestly (spec § Scope 7)

`request_at` is minted in `incomingContext`
(`api/request-context.ts:75`, `requestAt: nowUtc()`) as the gate's
first act. By then `server/http-server.ts` has already recorded its own
`Date.now()` for the request log (`started`, line 459), awaited the
whole body through `readCappedBody(request)` (line 462), routed,
sniffed the grant type, and consulted `throttle.limited` (line 505).
The persisted stamp therefore means "body received and routed", not
"arrived", and the request log runs on a second clock — its latency is
`Math.max(0, Date.now() - started)` at line 432, never the difference
between two persisted stamps.

`response_at` is minted at the row write inside the transaction
(`writeMessagePairRows`, `api/message-pair.ts:671`,
`response_at: nowUtc()`), after the locks, before commit, and before
any byte is sent. That is the response's origination time in RFC 9110's
sense, and the wire `Date` derives from it through `httpDateOf`
(`api/message-pair.ts:389`). Stamping it after the locks is what makes
`(response_at, id)` order agree with lock order, which is what makes
every head read above correct.

Recommendation, to item 5, whose log work owns the request clock: one
clock, read once at arrival, carried in the context. Two clocks for one
request is a fact the ledger cannot explain to a reader who finds it
later.

## The six folds, classified (spec § Scope 8)

Six call sites read the whole ledger through `messagePairs.getAll()`.
Each is named below with where it reads, the exact-read shape it must
become, and the data-shape decision that precedes it, if any. No fold
is reshaped here; this is the oracle of the deferred bullet.

### 1. `deriveIdentityTokens` (`api/derive-identity-tokens.ts:190`)

Reads `getAll()` at line 193 and scans the ledger to discover every
`/identities/<id>/tokens/` path (`TOKENS_PATH_PATTERN`, line 90) plus
the flat `/identity-tokens/` leftover (`IDENTITY_TOKENS_FLAT_PREFIX`,
line 87). Shape: a collection read per identity, for the identity in
hand — `deriveIdentityTokensFor` (line 136) already reads one
identity's prefix. The rotation and revocation chain lookup by jti
(`deriveIdentityTokenEventsForJti`, line 230) needs a document read at
a path derived from the jti. Decision first: the token chain's path
from a jti, and the retirement of the flat leftover prefix.

### 2. `invitationOpStates` (`api/derive-invitations.ts:66`)

Reads `getAll()` at line 70 and scans for `/invitations/<id>/<op>/`
paths. Shape: `invitationOpStateFor(id)` (line 97) already exists and
costs three collection reads per id; the list derivation enumerates ids
from the invitations collection (`INVITATIONS_PREFIX`, line 36) and
calls it. No decision required. A data-shape decision — record the
terminal op as a document at the invitation's own path — would reduce
it to one document read per id.

### 3. `deriveIdentityPiiRows` (`api/derive-identity-spine.ts:112`)

Reads `getAll()` at line 116 and scans for `/identities/<id>/pii/`
paths (`PII_PATH_PATTERN`, line 86) with name `''`. Shape: the
identities collection lists identities, then one document read per
identity — `piiPrefixFor` (line 88) already forms the prefix and the
single-id read at line 155 already uses it. Decision first: the PII
slot's (path, name). Today it is `path = /identities/<id>/pii/,
name = ''`; the honest reading is `path = /identities/<id>/,
name = pii` (path-and-name § Vocabulary).

### 4. `deriveStateFieldValueReferrers`
(`api/derive-state-field-values.ts:182`)

Reads `getAll()` at line 187, inside a write-gate transaction, and
scans for transition pairs naming attribute ids. Shape: enumerate
work-order names from `getCollectionPairs` over the work-orders path —
every pair, so a since-deleted work order is still discoverable — then
one collection read per transition path. That last point is the
objection the function's own header raises: enumerating ids without the
deleted work orders would drop a since-deleted work order's field-value
history from the RESTRICT count, a genuine wire delta. Reading pairs
rather than heads answers it. No decision required; the RESTRICT count
stays exact.

### 5. `deriveWorkOrderLifecycle` (`api/derive-states.ts:1428`)

Reads `getAll()` at line 1432 and replays the whole ledger for every
work order of every organization. Shape:
`workOrderLifecycleStatesFor(organization, id)` (line 1539) exists; a
multi-work-order reader would enumerate organizations, then names from
each work-orders collection. Decision first: whether the multi-reader
has a product caller at all. Measured on this branch, it has none —
`grep -rn "deriveWorkOrderLifecycle(" api/ web-app/ server/ shared/`
returns only its own definition. Every other call site is a test
(`tests/derive-states-work-orders.test.ts`,
`tests/mock-data-valid.test.ts`,
`tests/drift-phase15-cores-parity.test.ts`,
`tests/derive-work-order-lifecycle-for.test.ts`,
`tests/drift-states.test.ts`). The cheapest correct shape may be
deletion, with the tests re-pointed at the entity-scoped sibling.

### 6. `deriveInvitationStates` (`api/derive-states.ts:1952`)

Reads `getAll()` at line 1956 and scans the ledger for invitations and
their ops. Shape: `invitationLifecycleStatesFor(id)` (line 2034)
exists; enumerate ids from `getCollectionPairs(INVITATIONS_PREFIX)`. No
decision required.

`getAll` and `selectAll` retire with the last fold, and the whole-ledger
pin is deleted with them.

## Body filters (spec § Design: heads in SQL)

No live read filters heads by a body field; `getCollectionFiltered` was
dead and left in the path-and-name spec. The only correct pushdown form
wraps head selection rather than preceding it: a predicate applied
before the head is chosen lets a superseded version's match elect the
wrong head — a document whose current PUT does not match but whose
earlier PUT does would answer with the earlier one. The index-driven
spelling is an anti-join: a GIN bitmap over the candidates, each
verified by a `NOT EXISTS` probe on the document index for a later PUT
or DELETE at the same path and name. Recorded for the day it has a
caller.

## The walk's findings

Each verified against this branch today.

- Three implementations of "the head", now one.
- 96 `appendMessagePairOnce` sites and 6 `appendMessagePairAlways`
  sites, 73 of them in `api/routes.ts`, because each handler owns its
  own storage instead of returning its pairs for one place to store.
  The six `Always` sites are all in `api/authentication.ts` (lines 441,
  689, 1094, 1096, 1347, 1576).
- The authorize-code lookup is a document read done as a body search;
  the GIN index `message_pairs_body` exists for it alone; the hashed
  name is the design handed to item 2. Its plan is the only one whose
  tenancy prefix is a `Filter` rather than an `Index Cond`, and the
  only single-scan read that sorts: a bitmap yields rows in heap order,
  so `(response_at, id)` costs a `Sort` that every composite-index read
  gets free from the index. (`selectCollectionHeadPairs` also sorts,
  but over one row per document after `DISTINCT ON`, which is the
  design.)
- Operation pairs store the empty name. `pathAndNameOf`
  (`api/path-and-name.ts:29`) returns `''` whenever the route pattern's
  last segment is not a `:param`, and four sites in `api/routes.ts`
  write the literal — `postIdentityPiiDocumentOp` (2760),
  `postClientRegistrationDocumentOp` (2862), and
  `postIdentityProviderDocumentOp` twice (3220, 3246).
  The two readings disagree and both are in the tree: the spec
  calls it a sentinel for "no document"; the file's own header calls it
  "a structural key, not an absence sentinel". What is not in dispute
  is that one empty string stands for "this write has no document".
- The two advisory locks are constraints in disguise. `lockRequest`
  stands in for `UNIQUE (request_hash)`, blocked by the three routes in
  `REPLAY_EXEMPT_ROUTE_PATTERNS` (`api/message-pair.ts`) that store
  duplicate hashes by design — `identities/:id/tokens/:jti/rotation`,
  `authentication/token`, `authentication/authorize` — until item 2.
  `lockDocument` stands in for "one genesis per document", which the
  ledger cannot express until a pair records whether it had a
  predecessor. `lockHead` is the ETag pin and stays; it is the one lock
  with a plan.
- The collection GET reads its collection twice, heads and pairs.
  `deriveIdeas` (`api/derive-ideas.ts:134`) calls
  `getCollectionPairs(prefix)` at line 101 through
  `fetchIdeaMessagePairs`, then `messageStore(db).getCollection(prefix)`
  at line 174, which issues `getCollectionHeadPairs(prefix)`. Item 7
  retires the second read.
- The memory backend's sort coerces `response_at` with `?? ''` on a
  NOT NULL column (`byResponseAtThenId`,
  `api/backend-buffer-tx.ts:37–38`).
- The request log and the persisted `request_at` run on two clocks, and
  the persisted one starts after the body.
- Document GET rebuilds the response instead of streaming the stored
  column. `streamGetFromStored` (`api/message-pair.ts:534`) parses the
  stored wire, mints `Date`, `Content-Type`, and `ETag` afresh — the
  last through `attachEtag(response, stored.id)` (`:462`) — forces
  status 200, and decodes then re-encodes the body; no stored status
  line or header line reaches the wire. `flows`, `work-orders`,
  and `members` never reach even that path — their GETs re-derive the
  body from the ledger and answer `Response.json`.
- Collection GET parses N stored bodies to rebuild one array.
  `getCollection` runs `parseWire` and `JSON.parse` on every live head
  (`entitiesOf`), and the stream collection GET stringifies the array
  again (`Response.json`, `api/api.ts:2341`). Every element is a live
  PUT, so every element has a body; writing `[`, each head's stored
  body octets joined by `,`, then `]` would mint only the envelope
  (path-and-name § Findings).
- The stored response wire carries a `response-id` header line
  (`RESPONSE_ID_FIELD`, `api/message-pair.ts:120`) that never reaches
  the HTTP wire. Renaming it to `etag` changes the stored `response`
  bytes of every new pair — never `request_hash`, which is over the
  request wire alone — so it stayed when `Response-ID` left the wire
  (path-and-name Deviation 4).
- The client minted one Operation-ID per request context and reused it
  across every write that context issued. Fixed on this branch
  (27201ab0, 3e31d9f6, d3ebf0f9); the contract is now written in API.md
  item 3; the server does not yet enforce it, because enforcement needs
  a read by operation id, which is neither a collection nor a document
  read.
- Any future statement that binds a stamp string against a
  `timestamptz` parameter, with or without a `::timestamptz` cast,
  silently truncates to milliseconds on its second execution — the
  prepared-statement type cache described under correction 4. Today
  `insertPair` is the only such statement and `append casts both stamps
  to timestamptz` guards it. Oracle for a later item: every
  stamp-bearing parameter in `api/backend-postgres.ts` carries
  `::text::`, or text OIDs are forced at the `api/postgres-client.ts`
  divorce point.
- The Postgres race pin `exact-hash dedup keeps one pair` asserted 201
  for both concurrent twins, while the gate (commit c1097fd8, Sept 4)
  answers the loser 200 by id comparison. The pin was stale because the
  Postgres suite needs Docker, which the sandbox gained only recently.
  Fixed on this branch before the first task (143d7270).

# Pairs Table Merge — Design

Date: 2026-08-21
Status: draft (brainstorm 2026-08-21; approved in chat;
awaiting the user's review of this document).
Spec-only. No implementation in this document.

Supersedes § Schema of
[the 2026-08-14 Postgres backend design](2026-08-14-postgres-backend-design.md)
(two tables). Precedes the ledger integrity design
(content-addressed pair ids, ETag chain, single ledger
lock), which lands on the merged table and is its own
document.

## Context

The message plane is two append-only tables, `requests`
and `responses`, joined 1:1 by a shared primary key
(`responses.id → requests.id`, `DEFERRABLE INITIALLY
DEFERRED`). A 1:1 mandatory relationship on a shared key
is one relation split in two. The split dates from the
shadow-ledger era, when the two halves were separate
ledgers and the pair id was a random locator that merely
happened to be shared.

Every guarantee the next design needs — one id, one
nonce, one seal, one transaction, one erasure — is a
pair-level guarantee. On two rows each is a covenant the
code must keep; on one row each is a fact the schema
keeps. The split is also what creates:

- the torn-pair worry (`api/pii-hard-delete.ts` spends
  its header on a single-authoritative-id-set rule),
- the duplicated `uri_collection` / `uri_id` /
  `operation_id` columns, enforced equal by nothing,
- two index sets,
- the `requestById` zip every read performs
  (`pairsAt`, `pairsInCollection`, `documentPairsAt`,
  `getAllWhereBody`, `getByVersion`), and
- fifteen test assertions whose only job is to prove the
  two tables still agree.

## User decisions

1. **Merge** to one table named `pairs` — "pair" is
   already this codebase's voice (`MessagePair`,
   `appendMessagePair`, `Response-ID`); HTTP's word
   `exchange` is not adopted.
2. **Zero semantic change.** Same ids, same hashes, same
   `version` values, same wire bytes, same statuses, same
   pair count. Every existing pin stays green; that is the
   proof the merge changed nothing.
3. **Merge first**, as its own commit series, before the
   ledger integrity work. Nothing dual-table is built only
   to be deleted.
4. **Strangler delivery.** Every commit on master builds
   and passes `./validate`.
5. **Boot refuses a pre-merge database** and names
   `./wipe-postgres`. Reseed is the migration; there is no
   data migration.

## Rule of the whole document

Nothing in this design changes what is stored, only where.
Names that the merge forces to change (two `at`s, two
`message`s, one `message_hash` on a row holding two
messages) change; nothing else does. The rename of
`version` to `etag`, generated columns, the nonce,
content-addressed ids, the ETag chain, the ledger lock,
`Idempotency-Key`, the `requester` index — all belong to
the ledger integrity design.

## Non-goals

- Renaming `version`.
- Any change to hash or ETag formulas.
- Any change to the wire: headers, statuses, bodies,
  `Response-ID`, `ETag`, `Operation-ID`.
- Any change to seeds' content or the 1448 / 8 pair
  counts.
- Dropping legacy tables at boot (see § Boot posture).
- Touching `schema_marker` or `message_body()`.

## The table

Columns, grouped by half, in the order both `PairEntity`
and the DDL declare them (the SVG draws TypeScript field
order):

| `pairs` column | From | Note |
|---|---|---|
| `id` | both | PK. 22-char. Unchanged |
| `uri_collection` | both, deduplicated | same CHECK |
| `uri_id` | both, deduplicated | |
| `requester_identity_id` | `requests` | unchanged |
| `method` | `requests` | unchanged |
| `request_at` | `requests.at` | arrival stamp |
| `request_hash` | `requests.message_hash` | renamed: the row now holds two messages |
| `request` | `requests.message` | BYTEA Latin-1 |
| `response_at` | `responses.at` | seal stamp; **the ordering column** |
| `version` | `responses.version` | unchanged |
| `response` | `responses.message` | BYTEA Latin-1 |
| `operation_id` | both, deduplicated | unchanged |

No foreign key. No `DEFERRABLE`. A torn pair is
structurally impossible.

### DDL

```sql
CREATE TABLE IF NOT EXISTS pairs (
    id text COLLATE "C" PRIMARY KEY
        CONSTRAINT pairs_id_chk
        CHECK (id ~ '^[0-9A-Za-z]{22}$'),
    uri_collection text COLLATE "C" NOT NULL
        CONSTRAINT pairs_collection_chk
        CHECK (left(uri_collection, 1) = '/'
           AND right(uri_collection, 1) = '/'),
    uri_id text COLLATE "C" NOT NULL,
    requester_identity_id text COLLATE "C" NOT NULL,
    method text COLLATE "C" NOT NULL
        CONSTRAINT pairs_method_chk
        CHECK (method ~ '^[A-Z]+$'),
    request_at text COLLATE "C" NOT NULL
        CONSTRAINT pairs_request_at_chk
        CHECK (request_at ~
        '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'),
    request_hash text COLLATE "C" NOT NULL
        CONSTRAINT pairs_request_hash_chk
        CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    request bytea NOT NULL,
    response_at text COLLATE "C" NOT NULL
        CONSTRAINT pairs_response_at_chk
        CHECK (response_at ~
        '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'),
    version text COLLATE "C" NOT NULL
        CONSTRAINT pairs_version_chk
        CHECK (version ~ '^[0-9a-f]{64}$'),
    response bytea NOT NULL,
    operation_id text COLLATE "C" NOT NULL
        CONSTRAINT pairs_operation_chk
        CHECK (operation_id ~ '^[0-9A-Za-z]{22}$')
);

CREATE INDEX IF NOT EXISTS pairs_address
    ON pairs (uri_collection, uri_id, response_at, id);
CREATE INDEX IF NOT EXISTS pairs_collection
    ON pairs (uri_collection, response_at, id);
CREATE INDEX IF NOT EXISTS pairs_replay
    ON pairs (request_hash);
CREATE INDEX IF NOT EXISTS pairs_version
    ON pairs (uri_collection, uri_id, version);
CREATE INDEX IF NOT EXISTS pairs_body
    ON pairs
    USING gin (message_body(response) jsonb_path_ops);
```

`schema_marker` and `message_body(bytea)` are unchanged.
The `DROP INDEX IF EXISTS requests_operation /
responses_operation` lines die with the tables they
cleaned; the boot guard makes them unreachable anyway.

Index shapes are today's, once. Every `ORDER BY at, id`
becomes `ORDER BY response_at, id` — the order every
reader already reconstructs after zipping.
`latestPutDelete` loses its join. Display names strip
`pairs_`, so the SVG palette (`pk`, `address`,
`collection`, `replay`, `version`, `body`) is unchanged.

### Two `at`s, two jobs

- **`response_at`** is minted per pair, in-tx, by
  `nowUtc()` — strictly monotonic — and is the ordering
  key of every reduction (`latestByKey`, `sortByAtId`,
  `documentPairsAt`, `latestPutDelete`, the memory tier's
  address sort). Nothing about its minting changes.
- **`request_at`** is the arrival stamp, minted at gate
  entry, and **shared by every pair of one envelope**. Two
  readers depend on that equality and must keep working
  unchanged:
  - `resolveFlowUndoTarget` (`api/derive-flows.ts`)
    correlates an undo's operation pair with its
    synthesized document pair by identical request `at` —
    the module's own comment names why response `at`
    cannot serve. Post-merge it reads `pair.request_at`
    directly; the `requestAtById` map dies.
  - The record-write envelope (`api/routes.ts`,
    `RecordWritePairs`) shares one `requestAt` across its
    operation, document, and attribute pairs with
    strictly-later response stamps, so the document pair
    becomes the head.

No reader orders by request `at` (grep-verified at design
time: the only `request.at` readers are the two above).

## Types, validator, stores

```ts
export interface PairEntity {
    id: Id;
    uri_collection: string;
    uri_id: string;
    requester_identity_id: Id;
    method: string;
    request_at: string;
    request_hash: string;
    request: string;      // Latin-1 wire
    response_at: string;
    version: string;
    response: string;     // Latin-1 wire
    operation_id: string;
}
```

- `RequestEntity` and `ResponseEntity` are deleted.
- `validatePairEntity` replaces the two validators: the
  same per-field checks, one key list in the order above,
  `assertOnlyKeys` as today.
- `DbStores { pairs: EntityStore<PairEntity> }`.
  `BackedDbAdapter.#buildStores` builds one
  `HistoryEntityStore('pairs', run, validatePairEntity)`.
- `TABLE_NAMES = ['pairs']`.
- `TABLE_INDEXES = { pairs: ['uri_collection',
  'request_hash'] }` — the `getWhere` allow-list, same two
  reads as today under the new hash name.
- `MESSAGE_TABLES` (new, `api/db.ts`): the constant every
  `transaction(…)` declaration passes instead of a literal
  list. Introduced first, while it still equals
  `['requests', 'responses']`, so the flip is one line.
  Seventy-nine literal lists in ten production files and
  thirty-one in tests become this constant.
- `StoredPair { request, response }` (`api/message-store.ts`)
  is deleted; `MessageStore` methods return `PairEntity`.
- `MessagePair` — the pre-tx formed pair in
  `api/message-pair.ts` — is unchanged. It is the
  in-memory formation shape, not a row.
- `Tx`: `getAddressVersion` and `getWhereBody` lose their
  "requests not accepted" branches; `lockHead` and
  `latestPutDelete` address `pairs`.

## Read and write path ripple

Thirty-six production files reference the two stores or
entity types. The named seams:

- `api/message-pair.ts` — `writePairRows` is one
  `view.pairs.put(pair.id, {...})`, minting `response_at`
  exactly where it mints `at` today; `storedResponseFor`
  is one `getAllWhere('request_hash', …)` read, not a
  hash read plus a `getById`; `appendMessagePair`'s dedup
  reads the same column; `wireHeadersFor`,
  `responseFromStored`, `streamGetFromStored`,
  `sendWriteResponse`, `storedPairResponse` take a
  `PairEntity` and read `response_at` / `response`;
  `headPairIdAt` / `documentHeadAt` read `method` and
  `response_at` off the row.
- `api/message-store.ts` — `pairsAt`,
  `pairsInCollection`, `getAllWhereBody`, `getByVersion`
  each become one store read; the zip and the
  silently-skipped-unmatched-row posture vanish because
  there is nothing to match.
- `api/derive-documents.ts` — `documentPairsAt(pairs,
  uriCollection)` takes one array; `DocumentPair` is built
  from one row. Every `derive-*.ts` caller passes one
  array.
- `api/derive-record-instances.ts` —
  `instanceParentEtag` reads `pair.request`.
- `api/derive-flows.ts` — undo correlation reads
  `pair.request_at` (above).
- `api/document-family.ts` — `lookupStoredRevision`
  returns a `PairEntity`.
- `api/api.ts`, `api/routes.ts`, `api/authentication.ts`,
  `api/invitations-domain.ts`,
  `api/organization-requests.ts`, `api/derive-states.ts`
  — field access only (`stored.version`,
  `pair.requester_identity_id`, `pair.method`).
- `api/pii-hard-delete.ts` — enumerate by
  `pairs.getAllWhere('uri_collection', …)`, delete each
  id, append. The single-authoritative-id-set rule becomes
  one sentence: there is one table.
- `api/errors-postgres.ts` — the `responses_request_fk`
  arm and the `23503` mapping are deleted.
- `api/backend-postgres.ts` — `assertMessageTable`
  accepts only `pairs`; one `INSERT … ON CONFLICT (id) DO
  UPDATE`; `entityOf` decodes two BYTEA columns through
  `latin1OfBytea`; `selectWhere` branches on
  `uri_collection` and `request_hash`; `DROP_SCHEMA` drops
  `pairs`, `schema_marker`, `message_body(bytea)`, **and**
  the legacy `responses` / `requests` (see § Boot
  posture).
- `api/backend-buffer-tx.ts` (memory) — the three
  `rec['at']` sort keys become `rec['response_at']`. Easy
  to miss; the message-store and pg-explain ordering pins
  catch it.
- `server/seed.ts` — the empty-database check probes
  `pairs`.
- `api/mock-data.ts`, `api/mock-data/seed-message-pairs.ts`,
  `api/test-plan-slices.ts` — form `MessagePair`s and
  append through `appendMessagePair`; only their
  transaction declarations change (`MESSAGE_TABLES`).
- `web-app/app/schema-svg.ts` /
  `generate-schema-svg.ts` — no code change beyond the
  header comment; one table draws at rank 0 with no edge
  (`parseForeignKeys` returns an empty list without
  throwing).

## Tests

Eighty-eight test files reference the stores, entity
types, or table names. Three classes of change, and only
three:

1. **Re-pointing.** `db.requests` / `db.responses` →
   `db.pairs`; `RequestEntity` / `ResponseEntity` →
   `PairEntity`; `['requests', 'responses']` →
   `MESSAGE_TABLES`; fixture `put`s build one row. No
   asserted value changes.
2. **Deleted as vacuous.** Fifteen orphan-balance
   assertions in six files (`requests.length ===
   responses.length` and kin) cannot fail once the two
   halves are one row. A test that cannot fail is a
   comfort object. Deleting them weakens nothing: the
   covenant they guarded is now the schema's.
3. **Re-pinned names.** `tests/pg-explain.test.ts` seeds
   one row per pair and expects `pairs_pkey`,
   `pairs_address`, `pairs_collection`, `pairs_replay`,
   `pairs_version`, `pairs_body`; the `latestPutDelete`
   plan no longer expects a second table's key.

`EXPECTED_PAIR_COUNT` stays **1448** (bootstrap **8**),
asserted on `pairs.length`. Every wire, ETag, hash,
status, and If-Match pin passes with the same expected
values.

## Docs

Table-sense mentions only; HTTP-sense "requests" and
"responses" stay.

- `CLAUDE.md` — Data bullet (`TABLE_NAMES` is one:
  `pairs`, on `HistoryEntityStore`); Testing paragraph's
  pair-count sentence; the schema-of-record line is
  unchanged.
- `SCHEMA.md` — "Schema of record" paragraph (one table;
  authoritative count one); § Messages becomes one
  `### pairs` subsection carrying today's request and
  response prose under the new column names; the claim
  that response addressing columns "including `at`" match
  the request dies with the split.
- `ARCHITECTURE.md` — nine table-sense mentions in the
  storage and lock paragraphs.
- `API.md` — § 5.1 (`wireHeadersFor` renders
  `response_at`) and § 5.2 verbatim-storage contract; the
  remaining mentions are HTTP-sense.
- `TEST-PLAN.md` — thirteen table-sense mentions.
- `web-app/app/generate-schema-svg.ts` header comment.
- `SCHEMA.svg` — regenerated; `--check` green.

The 2026-08-14 design is a record and is not edited.

## Boot posture on a pre-merge database

The DDL creates `pairs` idempotently and drops nothing.
Without a guard, deploying this series against today's
database boots with `schema_marker` present and an empty
`pairs` — silently serving nothing while the data sits in
the legacy tables.

- `server/boot.ts`, in the fail-fast sequence **before**
  the idempotent DDL: if `to_regclass('requests')` or
  `to_regclass('responses')` is non-null, refuse to listen
  with one message naming `./wipe-postgres`.
- `deleteSchema` drops the legacy tables too, so wipe →
  seed → boot is the whole migration.
- `./wipe-postgres` needs no change beyond what
  `deleteSchema` already does for it.

Pre-customer: reseed is the migration. No data migration
is written.

## Delivery — strangler, every commit green

1. **`MESSAGE_TABLES`.** Replace every literal two-table
   declaration with the constant. Pure substitution.
2. **`PairEntity` + `validatePairEntity` + the shim.**
   `db.pairs` as a temporary `EntityStore<PairEntity>`
   over the two existing tables: reads zip by id and sort
   by response `at` (exactly today's reader posture,
   unmatched rows skipped); `put` writes the two halves;
   `delete` / `putMany` touch both. Named as temporary in
   its header. About eighty lines.
3. **Migrate, module by module,** to `db.pairs` /
   `PairEntity`: `message-pair` → `message-store` →
   `derive-documents` and its callers → `document-family`
   → `api.ts` / `routes.ts` → auth, invitations,
   organization requests → `pii-hard-delete` → seeds →
   the tests of each. Each commit `./validate`-green.
4. **Flip storage.** DDL; both backends; `TABLE_NAMES`,
   `MESSAGE_TABLES`, `TABLE_INDEXES`; boot guard;
   `deleteSchema` legacy drops; delete `RequestEntity`,
   `ResponseEntity`, their validators, the two stores,
   and the shim; `errors-postgres`; `server/seed.ts`;
   `pg-explain` re-pins. The 1448 pin moves to
   `pairs.length` here.
5. **Docs and SVG.**

The shim runs *forward* (pairs over two tables) because
the reverse is impossible: a lone `requests.put` cannot
form a pair row — which is itself the argument for the
merge.

Commit discipline per the Office of the Commit: one
concern per commit, ~50-char subjects, no move-and-change
commits, linear history.

## Acceptance criteria

1. `./validate` green at every commit of the series.
2. `EXPECTED_PAIR_COUNT` 1448 / bootstrap 8, asserted on
   `pairs.length`.
3. No asserted value changes anywhere in `tests/`; only
   store names, entity types, table constants, and fixture
   row shapes.
4. `tests/pg-explain.test.ts` green against live Postgres
   with the `pairs_*` names and no `Seq Scan`; every other
   `pg-*` suite green.
5. Boot refuses when a legacy table exists, naming
   `./wipe-postgres`; wipe → seed → boot succeeds.
6. `generate-schema-svg --check` green: one table, no
   edges, unchanged palette.
7. Zero table-sense references to `requests` or
   `responses` remain in `api/`, `server/`, `tests/`,
   `web-app/app/`, or the docs listed above; the shim
   module is deleted.

## Risks

| Risk | What we do |
|---|---|
| A reader relied on request-`at` order | Grep-verified none; the two request-`at` readers use equality, preserved by the `request_at` column |
| Memory tier still sorts by `at` | Three named sites in `backend-buffer-tx.ts`; ordering pins catch a miss |
| A missed literal table list | `MESSAGE_TABLES` first; `assertMessageTable` and the buffer's scope check throw loudly on a stale name |
| Deploy against the un-wiped Render database | Boot guard refuses; `deleteSchema` drops legacy tables |
| Breadth (≈124 files) | Strangler: every commit green, each module's tests move with it |

## Follow-on (not this document)

The ledger integrity design, on the merged table:
content-addressed UUIDv8 pair ids and the per-row nonce,
`version` → `etag` with the `ETag:` header stored in the
response message, the per-address ETag chain (parent = the
latest pair at the address, any method), generated
`method` / `request_hash` / `etag` columns, the single
ledger lock with in-tx sealing, `UNIQUE(etag)`, the
`requester` index, `Idempotency-Key` replacing
`Operation-ID`, erasure tombstones that keep erased ids,
the log-drain anchor, and the verifier.

## Files

| File | Change |
|---|---|
| `api/types.ts` | `PairEntity`; delete the two entity types |
| `api/validators.ts` | `validatePairEntity`; delete the two validators |
| `api/db.ts` | `MESSAGE_TABLES`; `DbStores { pairs }`; `TABLE_NAMES`; `TABLE_INDEXES`; `Tx` branches |
| `api/db-backed.ts` | one store |
| `api/schema-postgres.ts` | `pairs` DDL and indexes |
| `api/backend-postgres.ts` | one table; `DROP_SCHEMA` with legacy drops |
| `api/backend-buffer-tx.ts` | `response_at` sort keys |
| `api/message-pair.ts`, `api/message-store.ts` | one row, one read, no zip |
| `api/derive-documents.ts` and every `derive-*.ts` | one array in |
| `api/document-family.ts`, `api/api.ts`, `api/routes.ts`, `api/authentication.ts`, `api/invitations-domain.ts`, `api/organization-requests.ts`, `api/derive-states.ts` | field access |
| `api/pii-hard-delete.ts` | one table |
| `api/errors-postgres.ts` | delete the FK arm |
| `server/boot.ts`, `server/seed.ts` | legacy guard; `pairs` probe |
| `tests/` (88 files) | re-point; delete 15 vacuous assertions; re-pin `pg-explain` |
| `CLAUDE.md`, `SCHEMA.md`, `ARCHITECTURE.md`, `API.md`, `TEST-PLAN.md` | table-sense prose |
| `web-app/app/generate-schema-svg.ts`, `SCHEMA.svg` | header; regenerate |

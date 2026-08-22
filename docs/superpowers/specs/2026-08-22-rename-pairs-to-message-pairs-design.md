# Rename the pairs table to message_pairs

## Problem

The sole product table is named `pairs`. The domain
already speaks `MessagePair` (the in-memory write DTO),
`appendMessagePair`, `seed-message-pairs.ts`, and
"message plane". The store is still `db.pairs`. The
stored row type is still `PairEntity`. Living docs still
say "pair plane" and "op pair".

That is two names for one ledger. Schema-svg snake_cases
the `DbStores` property and demands it match
`TABLE_NAMES`, so the SQL name and the TypeScript store
cannot drift.

There is no dump/restore. Schema change is wipe then
seed. `CREATE TABLE IF NOT EXISTS` will not rename an
existing volume. Boot already refuses leftover
`requests` / `responses`; it does not yet refuse a
leftover `pairs` table. Seed runs `ensureTables` then
`EXISTS` on the live table. An empty new table beside a
full old one would look empty.

## Goals

- One name for the ledger: SQL `message_pairs`, store
  `db.messagePairs`, stored row `MessagePairEntity`.
- Identifiers that contain the entity morpheme `pair`
  and do not already contain `message` take that name.
- Living docs speak "message plane", "document message
  pair", and "operation message pair". "Op" is not a
  word in this voice.
- Wipe-then-reseed cutover. No `ALTER`. No copy. No
  view named `pairs`. No TypeScript alias.
- Leftover `pairs` is a retired object: dropped by
  wipe, refused by boot, refused by seed before
  `ensureTables`.
- Three validate-green commits, then operator guns:
  local wipe (no seed), Render wipe then `--mock-data`.

## Non-goals

- In-place `ALTER TABLE … RENAME` or a dual-name
  window (SQL view, `get pairs()`,
  `type PairEntity = MessagePairEntity`).
- Reseeding the local product volume in this work.
- Compose as part of the operator ceremony.
- Rewriting historical `docs/superpowers/specs/` or
  `docs/superpowers/plans/`.
- A repo-wide `op` → `operation` sweep beyond
  pair-named identifiers and the living prose in
  scope.
- Changing columns, indexes' key lists, or
  `message_body(bytea)`.
- New TEST-PLAN cases. No new product behavior.
- Renaming data values (test ids such as `'pair-1'`).

## Name grammar

The ledger is the message-pairs table. Three spellings:

| Layer | Form | Example |
|---|---|---|
| SQL | `message_pairs` | table, `message_pairs_address` |
| TypeScript store / locals | `messagePairs` | `db.messagePairs` |
| Stored row type | `MessagePairEntity` | distinct from `MessagePair` |

Rename a TypeScript or SQL identifier when it contains
the entity morpheme `pair` / `pairs` / `Pair` / `PAIRS`
and does not already contain `message` / `Message` /
`MESSAGE`.

Examples: `requirePair` → `requireMessagePair`,
`seedPairKey` → `seedMessagePairKey`,
`documentPairsAt` → `documentMessagePairsAt`,
`latchedHeadPairId` → `latchedHeadMessagePairId`,
`WritePairInput` → `WriteMessagePairInput`,
`validatePairEntity` → `validateMessagePairEntity`,
`POSTGRES_PAIRS_TABLE` → `POSTGRES_MESSAGE_PAIRS_TABLE`,
`PAIR_ROW` → `MESSAGE_PAIR_ROW`. Locals `pairs` /
`pair` → `messagePairs` / `messagePair`.

Leave names that already contain `message`:
`MessagePair`, `appendMessagePair`,
`formMockDataMessagePairs`, `message-pair.ts`,
`seed-message-pairs.ts`.

Leave English that is not the ledger: “pairing”,
TEST-PLAN “Pairs with V7”.

Living prose kind nouns, spelled out:

- “document pair” → “document message pair”
- “operation pair” / “op pair” → “operation message
  pair”
- genus “message pair” stays; do not write “message
  message pair”
- “pair plane” / `pair-plane` → “message plane” /
  `message-plane`

“Op” is not a word in this voice. That rule applies to
this living prose and to pair-named identifiers. It
does not rename every `op` in the repository.

## Physical schema and cutover

Happy path is a wiped database, then seed.

`CREATE TABLE IF NOT EXISTS message_pairs` with the
same columns as today’s `pairs`. Check constraints and
indexes take the table prefix:
`message_pairs_collection_chk` and the rest;
`message_pairs_address`, `message_pairs_collection`,
`message_pairs_replay`, `message_pairs_version`,
`message_pairs_body`. Suffixes after `{table}_` are
unchanged. Schema-svg colors indexes by that suffix
(`INDEX_FILL`: `pk`, `address`, `collection`,
`replay`, `version`, `body`). The parser already
requires `{table}_{suffix}`; no special case.

`TABLE_NAMES` is `['message_pairs']`. `MESSAGE_TABLES`
remains that same array. `TABLE_INDEXES` keys
`message_pairs`. Both backends address the table by
that string. `assertMessageTable` returns
`'message_pairs'`.

`POSTGRES_DROP_SCHEMA` order:

1. `DROP TABLE IF EXISTS message_pairs`
2. `DROP TABLE IF EXISTS pairs`
3. `DROP TABLE IF EXISTS responses`
4. `DROP TABLE IF EXISTS requests`
5. `DROP TABLE IF EXISTS schema_marker`
6. `DROP FUNCTION IF EXISTS message_body(bytea)`

`deleteSchema` and `./postgres-wipe` keep sharing that
one list. Leftover `pairs` is the same class of
retired object as `requests` / `responses`.

Boot `assertNoLegacyMessageTables` adds `pairs` beside
`requests` and `responses`. A volume that still has
the old table does not listen
(`LEGACY_MESSAGE_TABLES`).

Seed order:

1. UTF-8
2. `assertNoLegacyMessageTables` (leftover `pairs`
   fails closed before a new empty table can appear
   beside it)
3. `ensureTables` (creates empty `message_pairs`)
4. emptiness: `EXISTS` on `message_pairs` and
   `schema_marker` only

After the legacy gate, seed does not `FROM pairs`.

## TypeScript surface

`DbStores` is
`messagePairs: EntityStore<MessagePairEntity>`.
`HistoryEntityStore` is constructed with
`'message_pairs'` and `validateMessagePairEntity`.
Every `db.pairs` call site becomes `db.messagePairs`.

`PairEntity` in `api/types.ts` becomes
`MessagePairEntity`. Columns do not change. The
in-memory write DTO stays `MessagePair`.

Apply the name grammar across `api/`, `server/`,
`tests/`, and `web-app/` TypeScript.

`schema-svg.ts` keeps snake_casing the store property:
`messagePairs` → `message_pairs`, which must match
`TABLE_NAMES`. Those two land in the same
validate-green commit. `./generate-schema-svg`
regenerates `SCHEMA.svg` in that commit. No hand-edit
of the SVG.

No alias.

## Living docs

Touch: `SCHEMA.md`, `ARCHITECTURE.md`, `CLAUDE.md`,
`API.md`, `TEST-PLAN.md`, `postgres-wipe` usage text,
and in-code comments in those trees. Apply the prose
rules in Name grammar.

Leave historical `docs/superpowers/specs/` and
`docs/superpowers/plans/` as written. Leave
TEST-PLAN’s line-length exemption. `API.svg` should be
a no-op; if `generate-api-documentation --check`
fails, that is a bug in the rename.

## Operator instances

`./validate` is memory and does not touch the product
volume. `./test-postgres` uses throwaway
`fusion_test_*` schemas and does not need the product
ledger.

The guns become necessary as soon as commit 1 is
deployed (DDL, store, and legacy gate agree). This
work runs them after all three commits, so the
deployed SHA matches the living docs.

1. Stop a local `./serve` if one is listening.
2. Local: `./postgres-wipe --postgres local`. The
   product volume is empty. This work does not reseed
   it. Local will not boot until someone seeds.
3. Render: deploy the new bundle. Boot refuses
   leftover `pairs` and will not listen. Then
   `./postgres-wipe --postgres render TOKEN`, then
   `./postgres-seed --postgres render TOKEN
   --mock-data`. Marker is last, as today.

Compose is ephemeral and not part of this ceremony.

## Tests

Existing pins change their expected names; they do
not change what they prove.

- `tests/db-table-names.test.ts`: survivor
  `message_pairs`; `MESSAGE_TABLES` still equals
  `TABLE_NAMES`.
- `POSTGRES_DROP_SCHEMA` pin: `message_pairs` first,
  then leftover `pairs`, then today’s retired
  objects. Wipe tests still assert the start command
  embeds that list.
- `assertNoLegacyMessageTables` pin: `pairs` joins
  `requests` and `responses`.
- Seed emptiness pin: `FROM message_pairs` and
  marker. Legacy `pairs` is the gate before
  emptiness.
- Backend SQL pins (`FROM` / `INSERT INTO` /
  `ON message_pairs`, index names).
- `schema-lifecycle`: `information_schema`
  `table_name = 'message_pairs'`.
- `db-keyed-read-coverage`:
  `TABLE_INDEXES['message_pairs']`.
- Transaction-view and pg suites that declare
  `'pairs'` declare `'message_pairs'`.
- Store tests: `db.messagePairs`,
  `MessagePairEntity`, renamed helpers.

`./test` is the gate for the identifier cut.
`./test-postgres` is the gate for DDL, wipe list,
legacy boot, and seed emptiness. `./validate`
includes both documentation `--check` gates.

No new TEST-PLAN cases. Hunters who inspect the
ledger read `message_pairs` because living docs
rewrote those lines.

## Error handling

A leftover `pairs` table: boot and seed fail with
`LEGACY_MESSAGE_TABLES` (wipe, then seed). A missing
marker: `MISSING_MARKER` as today. A nonempty
`message_pairs` or a marker row: seed refuses
(`SEED_NONEMPTY`) as today. Drop statements stay
`IF EXISTS`; a never-seeded database is a successful
wipe no-op. Local wipe still requires loopback
`POSTGRES_URL`. Render wipe still requires TOKEN and
one-Postgres one-web-service discovery.

## Commit series

Three validate-green commits, then the operator guns.
No aliases between them.

1. **Ledger name.** `TABLE_NAMES` is `message_pairs`.
   DDL, indexes, constraints, `db.messagePairs`, both
   backends, wipe list, boot legacy gate, seed
   emptiness, `postgres-wipe` usage, `SCHEMA.svg`.
   Tests that pin those strings. The store type
   parameter may remain `PairEntity` until commit 2.
   This commit is the one schema-svg cannot split.
2. **Identifier grammar.** `PairEntity` →
   `MessagePairEntity`, helpers, locals, fixtures,
   remaining TypeScript morphemes. Comments that name
   those symbols. Pair-plane prose in comments waits
   for commit 3. `./test` is the gate;
   `./test-postgres` if a pin still quotes a symbol
   this commit moves.
3. **Living voice.** `SCHEMA.md`, `ARCHITECTURE.md`,
   `CLAUDE.md`, `API.md`, `TEST-PLAN.md`: table
   citations, “message plane”, “document message
   pair”, “operation message pair”. Historical specs
   and plans untouched.

Subjects stay one line ≈50 characters, present-tense
imperative, no body beyond `Co-Authored-By`. Local
wipe and Render wipe + `--mock-data` are not commits;
they run after this series is on the tree.

## Alternatives rejected

- SQL-only rename, keep `db.pairs`: schema-svg would
  fail or need a special case. Two names for one
  ledger.
- `ALTER TABLE pairs RENAME TO message_pairs`:
  preserves rows this product reseeds; splits the
  cutover from the wipe gun already in hand.
- Dual-name window (view, TypeScript alias): the same
  lie as leaving `db.pairs`.
- One commit for the entire voice: review is a wall;
  the subject would need a body.
- Reseed local with mock-data in this work: the
  operator chose empty local, Render `--mock-data`.
- Collapse kind nouns to the genus “message pair”:
  loses document vs operation. The chosen spelling
  is “document message pair” / “operation message
  pair”.

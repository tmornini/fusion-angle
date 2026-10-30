# Operator wipe of the pair plane, then TEST-PLAN A3

## Problem

`TABLE_NAMES` is one table: `pairs`. `requests` and
`responses` are retired; boot refuses if they still
exist.

`PostgresBackend.deleteSchema` already drops `pairs`
first, then the two retired tables, then
`schema_marker`, then `message_body(bytea)`.

`./postgres-wipe` does not. Its Render/local
`WIPE_START` drops `responses`, `requests`,
`schema_marker`, and `message_body`, and leaves
`pairs`. After a product seed, wipe removes the
marker and keeps the message plane. The next
`./postgres-seed` refuses (`database is not empty`).
The next `node server.mjs` refuses (`schema_marker
absent`).

TEST-PLAN A3 requires an empty Postgres, then a mode
seed, then listen. Empty is a human prerequisite
today. Hunters must not re-seed. K8 already wipes
then reseeds, so it inherits the same miss.

Seed must not wipe. Two guns stay two guns.

## Goals

- One drop list. Operator wipe empties the live
  store (`pairs`) and the leftover retired objects.
- TEST-PLAN A3 wipes, then seeds, then listens.
  Empty is no longer a human prerequisite.
- Seed still refuses a non-empty database.

## Non-goals

- Folding wipe into seed (`--force`, `--replace`).
- A `--pristine` seed flag. Sparse data is
  `--bootstrap`.
- Wipe inside `server.mjs`. The listen process
  takes no arguments.
- TRUNCATE instead of DROP. `deleteSchema` DROPs;
  seed `ensureTables` recreates.
- Changing hunter contract, K8 shape, or compose
  wipe (compose is not a `./postgres-wipe` target).

## Source of truth

Export the existing `DROP_SCHEMA` string from
`api/backend-postgres.ts` as `POSTGRES_DROP_SCHEMA`.

Order, unchanged:

1. `DROP TABLE IF EXISTS pairs`
2. `DROP TABLE IF EXISTS responses`
3. `DROP TABLE IF EXISTS requests`
4. `DROP TABLE IF EXISTS schema_marker`
5. `DROP FUNCTION IF EXISTS message_body(bytea)`

`deleteSchema` keeps using that string. No second
list of table names.

## Local wipe

`./postgres-wipe --postgres local` stays the
operator gun. After the existing loopback assert
it runs `node --strip-types server/postgres-wipe.ts`,
the same shape as `./postgres-seed --postgres local`.

`server/postgres-wipe.ts` connects with
`POSTGRES_URL`, runs `sql.unsafe(POSTGRES_DROP_SCHEMA)`,
and ends the client. No seed. No DDL create. No
credential print.

`WIPE_START` no longer hardcodes table names for
the local path.

## Render wipe

The deployed web image is `server.mjs`, not
TypeScript sources. The Render job `startCommand`
stays a self-contained `node -e` that imports
`postgres`, requires `POSTGRES_URL`, runs one
`unsafe` of `POSTGRES_DROP_SCHEMA`, and ends.

The operator script **builds** that one-liner at
job-creation time from the exported string in the
checkout. The job command must contain the exact
`POSTGRES_DROP_SCHEMA` text. It must not retype
the drop list in `postgres-lib`.

## Seed

Unchanged. `ensureTables`, then
`assertEmptyDatabase` (`pairs` rows or a
`schema_marker` row → refuse). Modes remain
`--bootstrap`, `--mock-data`,
`--test-plan-slices`.

## TEST-PLAN A3

Master preflight, after AT and A1–A2:

1. `./postgres-wipe --postgres local`
2. Serial: `./postgres-seed --postgres local
   --mock-data`. Parallel (default):
   `./postgres-seed --postgres local
   --test-plan-slices`
3. `node server.mjs` from the A2 directory

Update How-to invoke, Protocol (serial and
parallel), A3 case text, and SV operator
prerequisites so they name wipe then seed.
A3 no longer says “against an empty Postgres”
as an unstated operator step; wipe is the step.

Hunters still do not re-seed.

K8 stays: stop → wipe → `--bootstrap` → start
(empty-state pin) → stop → wipe → `--mock-data`
→ start. Same guns, now actually empty.

Strike the Historical note “Operator seed wipes
the whole database.” Seed never wipes. K8 is
`global_lock: process` because **wipe** replaces
the shared database.

Serial AA’s optional wipe-then-bootstrap (when
the operator started from mock-data) is unchanged.

## Tests

- Keep `deleteSchema drops tables, function,
  marker` (`tests/backend-postgres.test.ts`).
- Pin `POSTGRES_DROP_SCHEMA` is that drop list,
  `pairs` first.
- Pin operator wipe uses the export (local entry
  runs `unsafe` of that same string; Render
  startCommand builder embeds that same string).
- Keep nonempty seed refuse
  (`tests/pg-seed.test.ts`).

No live-Postgres requirement beyond what those
suites already use.

## Docs

`./postgres-wipe` usage and CLAUDE.md: wipe drops
the pair plane (`pairs`) plus retired leftovers
and the marker. It does not seed.

## Error handling

Local wipe still requires `POSTGRES_URL` on
loopback. Missing URL fails as today. Render still
requires TOKEN and the one-Postgres one-web-service
discovery. Drop statements are `IF EXISTS`; a
never-seeded database is a successful no-op, then
A3 seed creates tables.

## Alternatives rejected

- Patch `WIPE_START` only: two lists, the same
  drift that left `pairs` behind.
- Seed `--force`: hides the destroy gun; a Render
  “seed” could empty production.

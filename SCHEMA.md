# Database Schema

This file is the capability map of the one table. Columns,
keys, and indexes live in `SCHEMA.svg` (generated from
`api/db.ts`, `api/types.ts`, and `api/schema-postgres.ts`;
`./test validate` fails on drift). Families, routes, and
alphabets live in code; this file does not restate them.

## The one table

A pair is the request wire bytes plus the response wire
bytes (`api/schema-postgres.ts`
`POSTGRES_MESSAGE_PAIRS_TABLE`). A document is `path` plus
`name`: `pathname = path + name`, the URL API's word. `path`
is the collection's path, always slash-bounded; `name` is
the document's name within it — an identifier for most
documents, a word (`pii`, `default-organization`, `binding`)
for the singleton sub-documents, and empty for an
operation. The ledger stores writes only — no GET rows. The
table is named once, here, and anchored to `TABLE_NAMES` in
`api/db.ts` (length 1). The name is `fa_message_pairs`.

The memory backend (`api/backend-memory.ts`) holds the
same rows in an in-process Map keyed by table name.

## What the DDL buys you

1. **`fa_message_body` and `fa_message_pairs_body`** —
   `POSTGRES_MESSAGE_BODY_FUNCTION` and the GIN index
   → `getAllWhereBody` (`api/db.ts`). Both stay until
   the message-plane spec retires code-document search.
2. **One stamp, `response_at`** — `timestamptz NOT
   NULL`. `request_at` is gone. The type is the
   storage-edge validator (a month-13 stamp is rejected
   where the old regex accepted it), and every read
   formats the stamp back to six-digit zulu with
   `to_char(… AT TIME ZONE 'UTC',
   'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
   (`api/backend-postgres.ts`), so the native
   `(response_at, id)` order and the seam's lexical
   order agree.
3. **`fa_message_pairs_document`** — head and history
   for free (`path`, `name`, `response_at`, `id`). The
   seam promises `(response_at, id)` order on every
   read, on both backends; nothing above it re-sorts
   rows.
4. **The pair `id` is the ETag** — If-Match names that
   identifier. Integrity is the hash tree
   (`fa_pair_root` in `api/schema-postgres.ts`;
   `pairRootHex` in `shared/pair-root.ts`). Lineage is
   `supersedes`. The nil root is the predecessor of a
   genesis. No chain.
5. **`fa_message_pairs_succession` is the only write
   enforcement** — unique on `(path, name,
   supersedes)` where the method is `PUT` or `DELETE`.
   The replay index is gone.
6. **The CHECK constraints** — Postgres as the
   storage-edge validator, named `fa_message_pairs_*`
   in `api/schema-postgres.ts`.
7. **`schema_marker` stays** —
   `POSTGRES_SCHEMA_MARKER_TABLE`; seed stamps it last
   so a failed seed reads as empty
   (`./bin/postgres-seed`).
8. **Tenancy rides `path`** — unchanged. The store is
   global; the fence and the write authorizer
   (`api/write-authorizer.ts`) enforce organization.
9. **`operation_id` groups one client operation** —
   unchanged. Wire `Operation-ID`; the server never
   mints it for a public write.
10. **The bell is `pg_notify('fusion_events', …)`**
    from the statement (`api/ledger-statement-sql.ts`),
    and only for a row that inserted. There is no
    LISTEN and no SSE client.
11. **`fa_message_pairs_collection` remains** —
    `(path, response_at, id)`, until the next spec's
    walk is the collection read.
12. **`fa_request_id_of` and
    `fa_message_pairs_request_id` exist** — the
    function reads a `request-id` line; the index is
    on `fa_request_id_of(response)`. Nothing reads
    them yet.

## Document bodies

Native nested JSON on the wire and in the pair body, never
JSON-encoded strings. Domain booleans are typed `boolean`
in `api/types.ts` and persist natively. `serializeValue`
(`api/storage-serialize.ts`) is the NOT-NULL gate on
present keys. The stored graph shape (`positionX`,
`fromNodeId`, `attribute_id`, `isRequired`) is a pinned
contract — `tests/flow-graph-roundtrip.test.ts`.

## Timestamps

Every timestamp crosses the seam as RFC-3339 zulu at exactly
six fraction digits; the validation gate rejects any other
width. Postgres holds `response_at`, the one envelope
stamp, as `timestamptz` and formats it back on every
read (`tests/timestamps.test.ts` pins the mint; the
Postgres acceptance suite pins the round trip). Render
to local time for display only.

## Secrets

Reads expose existence and lifecycle, never the hash.
`withoutSecret` in `api/routes.ts` projects the opaque
`secret` out of a credential before it crosses the API
boundary.

## PII erasure is a tombstone

Document DELETE is a marked tombstone pair. No physical
delete exists. Erasure of `identities/:id/pii` appends a
bodyless DELETE head; superseded PUT pairs remain in the
ledger. Credentials and registration stay append-only /
tombstone.

## State alphabets

`grep -n '_STATES = ' api/types.ts`

## Operator tools

`./bin/postgres-seed` (`--bootstrap`, `--mock-data`)
runs in-process on an empty database and stamps
`schema_marker` last. Seed refuses a non-empty
database. `./bin/postgres-wipe` is the public-schema
reset (`POSTGRES_DROP_SCHEMA`) and does not seed. The
schema is `CREATE TABLE IF NOT EXISTS` and never alters
a column, so the deploy that carries the `timestamptz`
stamp columns lands only on a database that was wiped
(`./bin/postgres-wipe`) and reseeded after it; an
unwiped database keeps `text` columns and every pair
read and write then fails.

## How we got here

Tables came and went; the ledger was always there; now it
is the schema.

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
`api/db.ts` (length 1). Today that name is `message_pairs`.

The memory backend (`api/backend-memory.ts`) holds the
same rows in an in-process Map keyed by table name.

## What the DDL buys you

1. **`message_body` plus the GIN index** —
   `POSTGRES_MESSAGE_BODY_FUNCTION` and `message_pairs_body`
   → `getAllWhereBody` (`api/db.ts`).
2. **`timestamptz` plus the formatter** — `request_at` and
   `response_at` are `timestamptz NOT NULL`; the type is the
   storage-edge validator (a month-13 stamp is rejected where
   the old regex accepted it), and every read formats them
   back to six-digit zulu text with `to_char(… AT TIME ZONE
   'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
   (`api/backend-postgres.ts`), so the native `(response_at,
   id)` order and the seam's lexical order agree.
3. **`message_pairs_document`** — head and history for
   free (`path`, `name`, `response_at`, `id`). The seam
   promises `(response_at, id)` order on every read, on
   both backends; nothing above it re-sorts rows.
4. **The pair `id` is the ETag** — If-Match names that
   identifier; integrity is `request_hash`; lineage is
   the latched head (`api/message-pair.ts`). No chain.
5. **`message_pairs_replay`** — idempotent replay on
   `request_hash` (`shared/digest.ts` `sha256HexOfBytes`).
6. **The CHECK constraints** — Postgres as the storage-edge
   validator (`message_pairs_*_chk` in
   `api/schema-postgres.ts`).
7. **`schema_marker` stamped last** —
   `POSTGRES_SCHEMA_MARKER_TABLE`; seed stamps it last so a
   failed seed reads as empty (`./bin/postgres-seed`).
8. **Tenancy rides `path`** — the store is
   global; the fence and the write authorizer
   (`api/write-authorizer.ts`) enforce organization.
9. **`operation_id` groups one client operation** — wire
   `Operation-ID`; the server never mints it for a public
   write.
10. **`requester_identity_id` is authorship.** Writes
    `pg_notify('fusion_events', …)`
    (`api/backend-postgres.ts`). There is no LISTEN and no
    SSE client. The memory backend simulates the same
    transaction semantics (`api/backend-memory.ts`).
11. **Three reads over the ledger** — `messageStore(db)`
    (`api/message-store.ts`): `getDocumentHead(path, name)`
    is the live PUT head pair or `null`;
    `getDocumentHistory(path, name)` is every pair at the
    document, in seam order; `getCollection(path)` is the
    live documents as entities.

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
width. Postgres holds the two envelope stamps as `timestamptz`
and formats them back on every read (`tests/timestamps.test.ts`
pins the mint; the Postgres acceptance suite pins the round
trip). Render to local time for display only.

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

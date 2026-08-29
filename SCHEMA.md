# Database Schema

This file is the capability map of the one table. Columns,
keys, and indexes live in `SCHEMA.svg` (generated from
`api/db.ts`, `api/types.ts`, and `api/schema-postgres.ts`;
`./validate` fails on drift). Families, routes, and
alphabets live in code; this file does not restate them.

## The one table

A pair is the request wire bytes plus the response wire
bytes (`api/schema-postgres.ts`
`POSTGRES_MESSAGE_PAIRS_TABLE`). Columns are addressing
metadata. The ledger stores writes only — no GET rows. The
table is named once, here, and anchored to `TABLE_NAMES` in
`api/db.ts` (length 1). Today that name is `message_pairs`.

The memory backend (`api/backend-memory.ts`) holds the
same rows in an in-process Map keyed by table name.

## What the DDL buys you

1. **`message_body` plus the GIN index** —
   `POSTGRES_MESSAGE_BODY_FUNCTION` and `message_pairs_body`
   → `getAllWhereBody` (`api/db.ts`).
2. **`COLLATE "C"` plus the six-digit CHECK** —
   `message_pairs_request_at_chk` /
   `message_pairs_response_at_chk` → lexical order is
   chronological → the `(at, id)` total order.
3. **`message_pairs_address`** — head and history for free
   (`uri_collection`, `uri_id`, `response_at`, `id`).
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
   failed seed reads as empty (`./postgres-seed`).
8. **Tenancy rides `uri_collection`** — the store is
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

## Document bodies

Native nested JSON on the wire and in the pair body, never
JSON-encoded strings. Domain booleans are typed `boolean`
in `api/types.ts` and persist natively. `serializeValue`
(`api/storage-serialize.ts`) is the NOT-NULL gate on
present keys. The stored graph shape (`positionX`,
`fromNodeId`, `attribute_id`, `isRequired`) is a pinned
contract — `tests/flow-graph-roundtrip.test.ts`.

## Timestamps

Every persisted timestamp is RFC-3339 zulu at exactly six
fraction digits. The validation gate rejects any other
width. Render to local time for display only
(`tests/timestamps.test.ts`).

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

`./postgres-seed` (`--bootstrap`, `--mock-data`) runs
in-process on an empty database
and stamps `schema_marker` last. Seed refuses a non-empty
database. `./postgres-wipe` drops the pair plane
(`POSTGRES_DROP_SCHEMA`) and does not seed.

## How we got here

Tables came and went; the ledger was always there; now it
is the schema.

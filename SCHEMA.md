# Database Schema

This file is the capability map of the one table. Columns,
keys, and indexes live in `SCHEMA.svg` (generated from
`api/db.ts`, `api/types.ts`, and `api/schema-postgres.ts`;
`./test validate` fails on drift). Families, routes, and
alphabets live in code; this file does not restate them.

## The one table

A pair is the request as received, or nothing, plus the
response wire bytes (`api/schema-postgres.ts`
`POSTGRES_MESSAGE_PAIRS_TABLE`). A pair the server
synthesizes — a sibling, a token event, a seeded row —
was never received, so its request is empty. A
document is `path` plus `name`: `pathname = path +
name`, the URL API's word. `path`
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

1. **`fa_message_body_bytes`** — the body search
   left with the code document. The function remains
   because the statement's sameness test reads it
   (`api/ledger-statement-sql.ts`).
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
7. **`schema_marker` stays** — `POSTGRES_SCHEMA_MARKER_TABLE`.
   The seed's one transaction writes it last, after the DDL,
   the root, and every pair, so a failed seed leaves no
   table (`./bin/postgres-seed`).
8. **Tenancy rides `path`** — unchanged. The store is
   global; the fence and the write authorizer
   (`api/write-authorizer.ts`) enforce organization.
9. **`operation_id` groups one client operation** —
   the client mints operation-id once per operation,
   on every request, and the server never mints one
   for a request. The root carries the seed run's id.
   Every row a seeded operation writes carries that
   operation's one id. A seedless exchange mints an id,
   because that write is not a client request.
10. **The bell is `pg_notify('fusion_events', …)`**
    from the statement (`api/ledger-statement-sql.ts`),
    and only for a row that inserted. There is no
    LISTEN and no SSE client.
11. **`fa_message_pairs_collection` remains** —
    `(path, response_at, id)`, until the next spec's
    walk is the collection read.
12. **`fa_request_id_of` and
    `fa_message_pairs_request_id`** — stored
    responses carry request-id, so `fa_request_id_of`
    finds the pairs one request wrote. A seed pair
    stores one. The root does not. The index is on
    `fa_request_id_of(response)`. Nothing in the
    product reads the index yet.

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

`request_secrets` and `response_secrets` are the
plaintext credential lines, not digests, each beside
its own message. Six names are credential lines
(`shared/http-message/credentials.ts`):
`authorization`, `proxy-authorization`, `cookie`,
`set-cookie`, `authentication-info`, and
`proxy-authentication-info`. The canonical message
(`serializeWire`) orders every other field by name,
then these, by name among themselves, so a message's
credential lines are the tail of its header block.
Each column holds whatever credential lines its own
message carried, exactly as that tail serializes:
every line CRLF-terminated, including the last, zero
bytes when there are none; `request` and `response`
hold the message without them. Putting a message back
together (`mergeSecret`) is a splice with no parse:
the stored header block, then its own column, then the
blank line and the body. `request_secrets_hash` and
`response_secrets_hash` are sha256 of their column's
bytes, no salt; `pair_hash` covers both, request
first. The storage edge (`validateMessagePairEntity`)
rejects a column that is not credential lines.
Credential bodies do not carry the eight
fields `username`, `password`, `code`,
`code_verifier`, `subject_token`, `actor_token`,
`client_assertion`, and `refresh_token`.

Reads of an identity credential expose existence and
lifecycle, never the hash. The credential's opaque
`secret` is a key declared with no read roles
(`CREDENTIAL_KEY_READ_ROLES`, `api/family-registry.ts`),
which `projectedBody` (`api/served-response.ts`) drops
from every read and every write's answer, admins
included.

## PII erasure is a tombstone

Document DELETE is a marked tombstone pair. No physical
delete exists. Erasure of `identities/:id/pii` appends a
bodyless DELETE head; superseded PUT pairs remain in the
ledger. Credentials and registration stay append-only /
tombstone.

## State alphabets

`grep -n '_STATES = ' api/types.ts`

## Operator tools

`./bin/postgres-seed` (`--bootstrap`, `--mock-data`) runs
in-process on a database with no `fa_message_pairs`. It
rehearses the seed on scratch memory, then lands the DDL,
the root, every pair, and `schema_marker` in one transaction,
and a failed seed leaves no table. Seed refuses a database
whose `fa_message_pairs` exists. `./bin/postgres-wipe` is
the public-schema reset (`POSTGRES_DROP_SCHEMA`) and does not
seed. The schema is `CREATE TABLE IF NOT EXISTS` and never
alters a column, so the deploy that carries the one
`timestamptz` stamp lands only on a database that was wiped
(`./bin/postgres-wipe`) and reseeded after it; an unwiped
database keeps `text` columns and every pair read and write
then fails.

## How we got here

Tables came and went; the ledger was always there; now it
is the schema.

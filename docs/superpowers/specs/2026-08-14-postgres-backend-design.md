# Postgres Backend — Design

Date: 2026-08-14
Author: Fusion-AI / Grok Build
Status: Accepted law (walkthrough 2026-08-13–14;
amended 2026-08-14 after two reviews)

Supersedes:
`docs/superpowers/specs/2026-08-13-postgres-backend-design.md`

This file is the implementation authority. Vocabulary:
**organization** (never “org”), **record instance**,
**uri_collection**, **Operation-ID** / `operation_id`,
**version** (column and revision token), **ETag**
(validator header only).

Lineage, not authority:
`docs/superpowers/specs/2026-08-13-postgres-backend-amendments-design.md`
and the 13–14 August review files.

---

## What this is

Today the product is a browser app: the API runs in the
page, IndexedDB holds the message store, and the build is
one static ZIP.

This spec is the authority for a **demo server**: a
Postgres store for the same message plane, a Node process
that serves pages and the API from one origin, and a later
yank that deletes the in-browser data tier.

The first ship is incomplete (named residuals). Incomplete
is not a lesser class of server, and it is not
production-class. A raw dump still holds verbatim
passwords, codes, tokens, assertions, and hoisted
`Authorization` headers. Token-at-rest hashing and
two-role views are later, together.

Postgres starts empty. There is no data migration. Seed
uses the existing bootstrap / mock-data path, operator-
invoked.

---

## Key decisions

Recorded in the 2026-08-14 review walkthrough.

1. **`ETag` / `version` hash the body**, not the wire.
   Unconditional: `sha256(body octets)`. Conditional
   genesis: the same. Conditional later:
   `sha256(body octets || matched 64-hex ETag)` (fixed
   width; no alias). Headers, `Date:`, `Operation-ID`,
   and `Response-ID` are not in either hash.
2. **Stored GET-shaped blob has no `Operation-ID`.** The
   write HTTP response adds it at send time. GET does not.
   The request still carries it (hoisted, part of
   `message_hash`). Both tables store `operation_id`.
3. **201 means this request appended.** 200 means it
   stored nothing (same body as live PUT head, or POST
   no-op). Exact-request retry (`message_hash`) returns
   the **same** status as the first time. Stored
   GET-shaped start-line stays **200**. DELETE is **204**.
4. **Head is latest 2xx PUT or DELETE.** DELETE head →
   gone. No empty-PUT tombstone. Already-gone DELETE →
   204, no append. PUT after DELETE is genesis, unless
   the family spends the id (409).
5. **Conditional race:** `SELECT` the latched head
   `FOR UPDATE`, then `SELECT` latest in a new statement.
   Isolation is READ COMMITTED. No `SERIALIZABLE` for
   this race. Genesis uses the address advisory lock
   (no row to lock).
6. **Address-scoped miss.** No `uri_id`-only index or
   read. Same id at two collections is two documents.
   Miss at this address is 404. 403 only when this
   address has a live PUT the caller may not have.
   Owner lookup and foreign-403 pins flip in the same
   cut as the index drop.
7. **One Postgres role this ship.** `POSTGRES_URL` is
   the owner connection. Two-role machinery is deferred
   (Later work), with token-at-rest hashing.
8. **Members / agents / default-organization** is its
   **own phase** in this file. Not mixed with the BYTEA
   cut. Phase A pins **1498** on today’s routes.
9. **Collection GET** is a JSON array of entity bodies.
   One `Date:` on the collection response. Oldest live
   head `(at, id)` first.
10. **Record-instance public PUT → 405.** PATCH creates
    and updates.
11. **`Operation-ID`:** required on public writes
    (missing → 400). Server does not mint for those.
    Inner PUTs copy the outer id. Seed/import: operator
    or dumped request supplies it.
12. **Refresh:** `HttpOnly` cookie; JSON has no
    `refresh_token`. Silent refresh, single-flight
    in-page and across tabs.
13. **Throttle:** trusted-hop client address. Public
    origin is HTTPS; this process may stay HTTP behind
    whatever owns :80.
14. **`at` is `text COLLATE "C"`** with the live 6-digit
    zulu CHECK. No `timestamptz`. No `Date`.
15. **Revoke does not rewrite default-organization.**
    Token resolution ignores a SET that is not a live
    seat, then PRIMARY, else deny.
16. **Bind gates stay.** Live instance; `record_type_id`
    among the flow’s live record-type joins; else 400.
17. **Instance DELETE** while an in-flight work order
    is bound → **409**, naming those work-order ids.

---

## Goals

- One message-plane schema in Postgres. Both tiers speak
  the same octets after Phase A.
- A fourth `StorageBackend` with keyed reads. No family
  scan to answer one document.
- Single-document GET: if the head is a PUT, stream that
  stored response (fresh `Date:`); if the head is a
  DELETE, 404.
- One Node process, pages + API, one origin. Deploy
  blockers A1–A6 disposed as named below.
- Dual ZIP, then a yank that deletes the browser data
  tier.

## Non-goals

See **Later work**. No data migration. No SSE listener.
No 304 in this ship. No two-role views. No token-at-rest
hashing.

---

## Two ZIPs, then the yank

Until Postgres is proven, `./build` emits two artifacts
from one source tree (clean tree required):

- **`fusion-ai-browser.zip`** — today’s product:
  IndexedDB, API in the page, today’s auth. It takes the
  storage-format break (new bytes, `/history` renamed).
  It is not a museum of the old store.
- **`fusion-ai-server.zip`** — Node serves composed
  pages and the API on one origin. The page talks
  `fetch`. Postgres is the store. The client bundle is
  the fetch facade (no in-page API, no signing key, no
  IndexedDB).

**Yank** (after Phase D is stable; do not call this
“Phase E” from memory — 13 and 14 August swapped
letters) deletes: IndexedDB and localStorage **data**
backends; in-page API dispatch; the browser ZIP; the
auth-free snapshot exemption; the demo signing constant;
browser-tier PBKDF2 **hashing** (verify stays for old
hashes).

**Yank keeps:** the memory backend (tests); localStorage
theme/sidebar; scrypt.

**Work-order conversion** is a later named phase and
does **not** block the yank. Those reads already run as
JavaScript over pair reads; on Postgres they use the
same derives.

---

## Deploy blockers A1–A6

These are the six remaining seams in `ARCHITECTURE.md`
§ Server-tier deploy blockers, mapped 1:1.

**A1 — Client-shipped HMAC key.** Key →
`JWT_HMAC_SIGNING_KEY`. Mint/verify server-side only.
Two esbuild entries; metafile test forbids
`SIGNING_KEY_MATERIAL` and `backend-indexeddb`.

**A2 — In-band credential reveal.** Deleted on the
server ZIP. Operator seed prints credentials to the
terminal once, never HTTP.

**A3 — Plaintext credential ledger.** Re-gated,
honestly. Snapshots admin+bearer. Messages stay
verbatim. Residual at full strength. This is a
**demo server**. Token-at-rest hashing is later.

**A4 — `client_assertion` `jti` replay.** Spent-`jti`
pair family. Require `jti`. Do not GIN-probe grant
bodies. Do not put `jti` on the token JSON.

**A5 — Auth-free `BOOTSTRAP_ROUTES`.** Remove the
bearer exemption on the server ZIP. Seed below HTTP.
Browser ZIP keeps the demo exemption until the yank.

**A6 — Soft-optional PKCE.** Server ZIP rejects
authorize without S256. `client_assertion` stays on
the token grant. The web app sending S256 is a
**Phase D client change**; today’s
`postPasswordLogin` does not send it.

---

## Postgres access

The process uses **postgres.js** only inside the storage
adapter (plus a thin client wrapper). Application code
never sees library names or types.

Queries are tagged-template and parameterized.
`sql.unsafe` exists only for boot-time DDL from
compile-time constants — never user input.

**PostgreSQL 18** is the version we run. 14+ would
suffice for SQL-standard function bodies; 18 is a pin,
not a feature floor. Boot fails if `server_encoding` is
not UTF8.

postgres.js is a `devDependency`, bundled into
`server.mjs`. The unzipped artifact needs no
`npm install`. README names that exception to “zero
runtime dependencies.”

**One role.** `POSTGRES_URL` is the owner connection.
Boot DDL and runtime share it. The process may
`INSERT`, `SELECT`, `DELETE`, and `TRUNCATE` as needed
(PII slot replace, snapshot import, authorize-code
body read). Two-role views do not ship.

---

## Storage covenant

Each stored request and response is the **entire
canonical HTTP message** (`serializeWire`: start line,
sorted lower-cased fields, Content-Length framing, body)
as `BYTEA`.

JSON columns and TEXT for the message are rejected. The
in-app wire is a Latin-1 binary string (one JS character
per octet). TEXT would mis-frame on the first non-ASCII
character.

- Write: Latin-1 wire → one byte per `charCodeAt` →
  BYTEA. The house codec is `Octets.fromLatin1` /
  `toLatin1` (`shared/http-message/octets.ts`).
- Read: BYTEA → Latin-1 via batched `fromCharCode` or
  Node `Buffer.toString('latin1')` → `parseWire`.
  **Do not** use `TextDecoder('latin1')`. That label is
  windows-1252 and remaps octets 0x80–0x9F.

`message_hash` on **requests** is SHA-256 of those
BYTEA octets via `sha256HexOfBytes` (new in
`shared/digest.ts`). Do not `TextEncoder` the Latin-1
string. Pair count **1498** holds for the Phase A cut
on **today’s** routes; hash values re-baseline. The
Members phase replaces that pin.

The backend stores what the caller sends. Postgres does
not parse ids or validators out of the blob. The one
allowed extraction is `message_body()` on **responses**
for the GIN containment index.

Do **not** alter an incoming request before store. No
injected header. Server-made inner PUTs are **new**
messages, not edits of the inbound request. Each inner
PUT mints a **new pair id**, copies the outer
`operation_id`, and uses the **outer requester**.

GET requests are **never** stored.

Failed writes store **nothing**.

---

## Address mapping

A matched route becomes `(uri_collection, uri_id)` the
way `messageAddress` already does
(`api/message-address.ts`):

- The collection **always** starts and ends with `/`.
- The last path segment is `uri_id` **exactly when**
  the route pattern’s last segment is a `:param`.
- Otherwise `uri_id` is `''` (collection or operation
  address). That empty string is a **structural key**,
  not null and not an absence sentinel.

Examples: `ideas/:id` → collection `/…/ideas/`, id =
the idea. `authentication/authorize` → collection
`/authentication/authorize/`, id = `''`.
`assertion-jtis/:jti` → collection
`/authentication/assertion-jtis/`, id = the jti.

---

## Schema

App-minted ids: `^[0-9A-Za-z]{22}$`. No sequences, no
`now()`. Text columns `COLLATE "C"`.

`at` is `text COLLATE "C"`, app-minted by `nowUtc()`.
Digits 1–3 of the six-digit fraction are UTC clock
milliseconds; digits 4–6 are the same-ms sequence
counter; overflow busy-advances. Strictly monotonic in
**one** process. The adapter returns the exact mint
string. Never `timestamptz`. Never a JavaScript `Date`.

### `requests`

| Column | Type | Notes |
|---|---|---|
| `id` | `text COLLATE "C"` | PK. 22-char id |
| `uri_collection` | `text COLLATE "C"` | NOT NULL. `/…/` |
| `uri_id` | `text COLLATE "C"` | NOT NULL. Resource id, or `''` |
| `at` | `text COLLATE "C"` | NOT NULL. 6-digit zulu |
| `requester_identity_id` | `text COLLATE "C"` | NOT NULL. Resolved principal |
| `message_hash` | `text COLLATE "C"` | NOT NULL. `^[0-9a-f]{64}$` |
| `message` | `bytea` | NOT NULL. Full canonical request |
| `method` | `text COLLATE "C"` | NOT NULL. `^[A-Z]+$`. No GET rows |
| `operation_id` | `text COLLATE "C"` | NOT NULL. 22-char id |

Indexes (names are the error-map keys):

- `requests_address` `(uri_collection, uri_id, at, id)`
- `requests_replay` `(message_hash)` — non-unique
- `requests_operation` `(operation_id)`

No `route` column. No index on `uri_id` alone.

### `responses`

| Column | Type | Notes |
|---|---|---|
| `id` | `text COLLATE "C"` | PK. Same as the paired request. FK `responses_request_fk` |
| `uri_collection` | `text COLLATE "C"` | NOT NULL |
| `uri_id` | `text COLLATE "C"` | NOT NULL |
| `at` | `text COLLATE "C"` | NOT NULL. 6-digit zulu |
| `version` | `text COLLATE "C"` | NOT NULL. `^[0-9a-f]{64}$` |
| `message` | `bytea` | NOT NULL. Full canonical response |
| `operation_id` | `text COLLATE "C"` | NOT NULL. Same value as the request |

The `id` FK `responses_request_fk` is DEFERRABLE
INITIALLY DEFERRED. `operation_id` is duplicated so
the index does not join.

Indexes:

- `responses_address` `(uri_collection, uri_id, at, id)`
- `responses_version` `(uri_collection, uri_id, version)`
  — non-unique; N matches serve latest `(at, id)`
- `responses_operation` `(operation_id)`
- `responses_body` GIN `message_body(message)
  jsonb_path_ops`

No `status` column (only successful writes are stored;
status lives on the wire start-line). No `message_hash`.
No `follows`. No `supersedes`. No `deleted`. No `etag`
column. No index on `uri_id` alone.

Do **not** query `uri_id` without `uri_collection`. Same
id at two collections is two documents. A miss at
**this** address is 404. 403 only when **this** address
has a live **PUT** and this caller may not have it.

`resolveGlobalOwner` / the write authorizer /
`missedReadError` become composite reads. They change
in the **same** sitting as the index drop. The
cross-prefix `getAllWhere('uri_id', …)` scan is
forbidden (that is the pattern to ban, not a symbol
named `getAllByRoute`).

### `schema_marker`

One row means schema exists. Stamped **inside** the
import transaction. Table existence is not schema
existence.

### `message_body(message bytea) → jsonb`

The body is everything after the **first CRLFCRLF**
(`\r\n\r\n`), not LF LF. `convert_from(..., 'UTF8')`
then `::jsonb`. `IMMUTABLE STRICT PARALLEL SAFE`.
`CREATE OR REPLACE` (Postgres has no `IF NOT EXISTS`
for functions). NULL if there is no blank line or the
body is empty (204s). Non-JSON body throws at INSERT
via the expression index. No GIN on request bodies
until a named request-body probe exists.

```sql
CREATE TABLE IF NOT EXISTS requests (
    id text COLLATE "C" PRIMARY KEY
        CONSTRAINT requests_id_chk
        CHECK (id ~ '^[0-9A-Za-z]{22}$'),
    uri_collection text COLLATE "C" NOT NULL
        CONSTRAINT requests_collection_chk
        CHECK (left(uri_collection, 1) = '/'
           AND right(uri_collection, 1) = '/'),
    uri_id text COLLATE "C" NOT NULL,
    at text COLLATE "C" NOT NULL
        CONSTRAINT requests_at_chk
        CHECK (at ~
        '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'),
    requester_identity_id text COLLATE "C" NOT NULL,
    message_hash text COLLATE "C" NOT NULL
        CONSTRAINT requests_hash_chk
        CHECK (message_hash ~ '^[0-9a-f]{64}$'),
    message bytea NOT NULL,
    method text COLLATE "C" NOT NULL
        CONSTRAINT requests_method_chk
        CHECK (method ~ '^[A-Z]+$'),
    operation_id text COLLATE "C" NOT NULL
        CONSTRAINT requests_operation_chk
        CHECK (operation_id ~ '^[0-9A-Za-z]{22}$')
);

CREATE TABLE IF NOT EXISTS responses (
    id text COLLATE "C" PRIMARY KEY
        CONSTRAINT responses_id_chk
        CHECK (id ~ '^[0-9A-Za-z]{22}$'),
    uri_collection text COLLATE "C" NOT NULL
        CONSTRAINT responses_collection_chk
        CHECK (left(uri_collection, 1) = '/'
           AND right(uri_collection, 1) = '/'),
    uri_id text COLLATE "C" NOT NULL,
    at text COLLATE "C" NOT NULL
        CONSTRAINT responses_at_chk
        CHECK (at ~
        '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'),
    version text COLLATE "C" NOT NULL
        CONSTRAINT responses_version_chk
        CHECK (version ~ '^[0-9a-f]{64}$'),
    message bytea NOT NULL,
    operation_id text COLLATE "C" NOT NULL
        CONSTRAINT responses_operation_chk
        CHECK (operation_id ~ '^[0-9A-Za-z]{22}$'),
    CONSTRAINT responses_request_fk
        FOREIGN KEY (id) REFERENCES requests (id)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS schema_marker (
    only boolean PRIMARY KEY CHECK (only)
);

CREATE OR REPLACE FUNCTION message_body(message bytea)
RETURNS jsonb
IMMUTABLE STRICT PARALLEL SAFE LANGUAGE sql
RETURN CASE
    WHEN position(E'\r\n\r\n'::bytea IN message) = 0
        THEN NULL
    WHEN substring(message FROM
         position(E'\r\n\r\n'::bytea IN message) + 4)
         = ''::bytea
        THEN NULL
    ELSE convert_from(
         substring(message FROM
         position(E'\r\n\r\n'::bytea IN message) + 4),
         'UTF8')::jsonb
END;

CREATE INDEX IF NOT EXISTS requests_address
    ON requests (uri_collection, uri_id, at, id);
CREATE INDEX IF NOT EXISTS responses_address
    ON responses (uri_collection, uri_id, at, id);
CREATE INDEX IF NOT EXISTS requests_replay
    ON requests (message_hash);
CREATE INDEX IF NOT EXISTS requests_operation
    ON requests (operation_id);
CREATE INDEX IF NOT EXISTS responses_version
    ON responses (uri_collection, uri_id, version);
CREATE INDEX IF NOT EXISTS responses_operation
    ON responses (operation_id);
CREATE INDEX IF NOT EXISTS responses_body
    ON responses
    USING gin (message_body(message) jsonb_path_ops);
```

### Snapshot loud-reject

No `route` column. Pre-break snapshots are refused when
any of: missing `operation_id`; `at` not the 6-digit
zulu; `message` not BYTEA-shaped / not
`serializeWire`; `uri_collection` absent (old
`uri_prefix`-only rows without the new name). Marker
present and rows failing that detector → refuse and
point at reseed. Hand-edited snapshots that pass today’s
JS validators but fail DDL CHECKs also die on Postgres.

---

## Version vs ETag vs request hash vs pair id

- **Document `ETag` and `version`** — the same hash.
  Unconditional PUT: `sha256(body octets)`. Conditional
  genesis (no live PUT head, no `If-Match`):
  `sha256(body octets)`. Conditional later:
  `sha256(body octets || matched 64-hex ETag)`.
- **Record-instance `version`** — that same formula on
  the **full stored** body.
- **Record-instance `ETag`** — that same formula on
  **this caller’s projected** body (genesis: no parent
  suffix; later: `||` the matched **ETag**, not
  `version`). Not stored. Not `version`.
- **Request `message_hash`** — SHA-256 of the exact
  stored request bytes. Replay / dedup.
- **Pair `id` / `Response-ID`** — which row. Locator,
  not a validator. It may appear on the stored
  GET-shaped blob and on GET. It is **not** in
  `version` or `ETag`.
- **DELETE row `version`** — sha256 of the stored 204
  wire with `Date:` omitted. Not an `If-Match` target.

`Authorization-Limited-Attributes: true` when the served
body **omitted any stored attribute**. Compute that from
the projection, never from `ETag ≠ version` (instance
hashes differ by definition). Absent means this
representation includes every stored attribute.

There is no `Version:` HTTP header. Path and JSON field
are `version`. HTTP validator is `ETag` / `If-Match`.

A→B→A on an **unconditional** document revives the
first `ETag` (same body). On a **conditional** document
it does not (parent is B’s tag). Same-body as the live
PUT head is **200**, no append, keep the current tag —
both kinds.

---

## Named reads

No family scan to answer one document. No
cross-prefix `uri_id` scan.

| Read | Meaning |
|---|---|
| `get(collection, id)` | Live PUT document, or none |
| `getPairs(collection, id)` | Every pair at that address, by `at` |
| `getAllAt(collection)` | Every pair in the collection, by `at` |
| `getAllWhereBody(collection, containment)` | Response JSON contains this fact, in that collection, by `at` |
| `getCollection(collection)` | Live PUT heads as entity bodies, oldest `(at, id)` first |
| `getCollectionFiltered(collection, filters)` | Same, filtered |
| `getByVersion(collection, id, version)` | That revision token |

**Live document:** latest successful **PUT or DELETE**
at `(uri_collection, uri_id)`, ordered by `at` then
`id`. Head method **PUT** → that body. Head method
**DELETE** → none. POST / PATCH rows are not heads.

`getCollection` returns the same **JSON entities** a
single GET of each live PUT would return. It is not an
array of HTTP messages. One `Date:` on the collection
response. Assembled lists (reachable organizations,
invitation lists, identity-pii, display names) are not
this function.

If a caller needs “does this collection have any live
document?”, that is a separate named function — not
added until a caller exists.

`getAllWhereBody` is the authorize-code probe (and any
later named containment). The GIN exists for those
callers.

During dual-ZIP these have IndexedDB implementations
(JS filter, same semantics).

---

## GET and writes

### GET is not stored

If the head is a **PUT**, GET streams that stored
response and replaces `Date:` with now. If the head is
a **DELETE** or there is no pair, GET is 404 (or 403
when this address has a live PUT this caller may not
see).

**Collection GET** is a JSON array of those entity
bodies, oldest live head `(at, id)` first. One `Date:`
on the collection response. No collection `ETag`. No
304 / `If-None-Match` in this ship.

`hasUndoHistory` is not stored. Stamp at read: more
than one PUT or DELETE pair at that flow address
(`COUNT(*) > 1`). Callers still see the field.

**When the wire is not that PUT blob**

| Case | What to do |
|---|---|
| Record instance | Store full state; project `values` and `ETag` at read |
| Collection | Build from each live PUT |
| Assemble | Joins at read |
| `hasUndoHistory` | Count PUT+DELETE at read |

`GET /organizations` is Assemble: **token claims** ∩
`deriveOrganizations`, not a live membership re-read.

### Write envelope

One client `Operation-ID`, one database transaction:

| Client verb | Stored pairs |
|---|---|
| **POST** | POST request → inner PUT(s) + their responses → POST response |
| **PATCH** | PATCH request → inner PUT(s) + their responses → PATCH response |
| **DELETE** | DELETE request + 204 response (the tombstone) |
| **PUT** | PUT request + GET-shaped response (the document) |

Inner PUTs are normal document versions. Live head is
the latest successful PUT or DELETE. A PUT after a
DELETE is a new live document (unless the family
spends the id).

A PUT whose stored response **is** the GET
representation is HTTP. An operation that changes a
streamable parent writes a synthesized **PUT** of that
parent in the same transaction so the head stays
current.

**Embed:** a stored PUT body holds only facts this
address owns and **immutable** foreign ids. No other
address’s mutable truth. No clock judgment
(“claimed now”).

### Write status

| Status | When |
|---|---|
| **201** | This request appended a pair (PUT, PATCH, or POST) |
| **200** | This request stored nothing (same body as live PUT head; POST no-op) |
| **204** | DELETE success (append or already-gone no-op) |

Stored GET-shaped messages keep status **200** on the
start-line. **201** is the write’s HTTP status, added
at send time with `Operation-ID`.

PUT/PATCH 201 body: this caller’s GET of the new
version. PUT/PATCH 200 body: this caller’s GET of the
unchanged head. POST 201 may have a JSON body
(authorize `{ code }`, token JSON without
`refresh_token`) or an empty body (transition, claim,
undo, conversion, invitation accept, collection
creates). Exact retry returns that same status.

Today’s composing POSTs that return 204 become **201**
when they append.

### PUT table

| Kind | Head | `If-Match` | Body vs head | Result |
|---|---|---|---|---|
| Unconditional | none | — | — | **201**, append, `ETag = sha256(body)` |
| Unconditional | live PUT | — | same | **200**, no append, keep `ETag` |
| Unconditional | live PUT | — | different | **201**, append, `ETag = sha256(body)` |
| Unconditional | DELETE | — | — | **201**, append, genesis tag (document lives) |
| Conditional | none / DELETE | absent | — | **201**, append, `ETag = sha256(body)` |
| Conditional | none / DELETE | present | — | **412** |
| Conditional | live PUT | absent | — | **428** |
| Conditional | live PUT | stale / wrong | — | **412** |
| Conditional | live PUT | matches | same | **200**, no append, keep `ETag` |
| Conditional | live PUT | matches | different | **201**, append, `ETag = sha256(body \|\| matched tag)` |

Body equality is **octets**, not `ETag`. There is no
unconditional PATCH.

### DELETE table

| Head | Pin | Result |
|---|---|---|
| Live PUT, unconditional | — | **204**, append DELETE pair |
| Live PUT, conditional | absent | **428** |
| Live PUT, conditional | stale | **412** |
| Live PUT, conditional | matches | **204**, append DELETE pair |
| Already DELETE | — | **204**, no append |
| Never written | — | **404**, nothing stored |

A PUT with an empty body is a **live empty document**,
`ETag = sha256('')`. It is not a delete.

### Failed conditional PUT / PATCH

**412** (stale pin, or pin present and no live PUT
head) and **428** (pin required, missing): body is the
current live PUT as this caller’s GET would return it
— fresh `Date:`, current `ETag`, plus
`Authorization-Limited-Attributes` when limited. No
live PUT → 412 has no document body (the none + pin
row).

Not that: **400** (malformed `If-Match`), **404** (no
live PUT and no pin where genesis is not allowed),
**409** (address spent).

**412** comes from the pin vs head comparison (pre-tx
and again after `FOR UPDATE` + re-query). It is not
only “in-transaction head assert.”

### Race (conditional PUT, PATCH, DELETE)

1. Pre-tx: find live PUT head, check the pin, latch
   that pair id. Crypto stays outside the transaction.
2. In-tx: `SELECT … FROM responses WHERE id = :latched
   FOR UPDATE`.
3. New statement: `SELECT` latest PUT or DELETE at the
   address (`ORDER BY at DESC, id DESC LIMIT 1`).
4. Latest ≠ latched → **412**. Same body → **200**.
   Else append → **201** (or DELETE **204**).

No head → address advisory lock (create-only /
genesis), then the same decide table. Two first-writers
are not two silent `INSERT`s.

The same-body no-op takes `FOR UPDATE` so it cannot
return a dead `ETag`.

### Shape evolution

Stored heads keep the shape they were written with.
Now (pre-customer): reseed. A re-render primitive is
later work. Phase B (write-time PUT shape = today’s
derive) invalidates every `version` token minted in
Phase A. Recovery is reseed. Do not promise stable
tokens across B.

---

## Record instances

Always say **record instance**.

Public **PUT → 405**. **PATCH** creates and updates at
the client-minted detail URL.

| Head | `If-Match` | Result |
|---|---|---|
| None (never written) | absent | **Create 201.** `set` required; `[]` legal. `clear` on create → 400 |
| None | present | 412 |
| Live PUT | absent | 428 |
| Live PUT | matches this caller’s `ETag` | same projected body → **200**; else **201** |
| Live PUT | stale / wrong | 412 |
| DELETE head | absent | 409 — address spent |
| DELETE head | present | 404 |

Malformed `If-Match` → 400.

Create does not require every attribute. There are no
schema-required attributes.

DELETE of a record instance stores a **DELETE pair**.
Then GET/PATCH/history are 404; a create attempt at
the same id is 409. Recovery is a new id. Repeat
DELETE when already gone is 204, no append.

**In-flight bind:** if any work order’s current bind
names this instance and that order’s current node is
non-terminal on its frozen graph → **409**, body names
those work-order ids, nothing stored. Yank does not
wait on this.

**Pin:** `If-Match: "<64-hex>"` is this caller’s live
`ETag` from GET — not `version`, not `Response-ID`.
Pre-tx: project, hash, compare. Match → latch the
head’s pair id. In-tx: `FOR UPDATE` + re-query.

Work-order transition `If-Match` preconditions the
bound record instance head with this same comparison.

List, detail, and value-history all project.
Credentials `withoutSecret` is the same idea (fixed
projection, not per-role).

A client cannot take a live record-instance `ETag` and
fetch `/versions/<that>`. The versions list’s
`version` field is the token that works.

Per-row SHA-256 of the projection is the cost of a
per-caller `ETag`. Accepted, not a risk.

Seed, tests, and adapters move with the PUT → 405
break.

---

## Operation-ID

Header **`Operation-ID`**. Column **`operation_id`** on
**both** tables, both indexed.

- Required on public **PUT, PATCH, POST, DELETE**.
  Missing → **400**. Server never mints one for those.
- Client mints a 22-char id at the start of the
  operation; reuse on retry (hoisted into the stored
  request, so it is part of `message_hash`).
- New user action → new id.
- Every pair in the envelope (outer verb and inner
  PUTs) carries the same value. Inner PUTs **copy** it.
- Write HTTP responses add `Operation-ID` at send time.
  It is **not** on the stored GET-shaped blob. GET does
  not echo it. If sent on GET, ignore it.
- Seed and import: the **operator** (or the dumped
  request) supplies `operation_id`. That mint is named
  and is not the public API. Snapshots missing it
  loud-reject.

From a GET: URL + `ETag` (or live PUT head) → that
row’s `operation_id` → every request/response with
that id. That set is the write that produced this GET,
not the document’s whole life.

GET logs: method, path, status, time.

---

## `/history` becomes `/versions`

Every lifecycle history path and record-instance
value-history rename to `/versions`. Payload as today,
plus **`version`**: the column value of that revision.
That is the token for
`GET <family>/:id/versions/<version>` on every
PUTable family. DELETE revisions may appear on the
index (method DELETE, no document body).

Documents: live `ETag` and `version` are the same
hash. Record instances: `etag` on the index is the
projected hash; `version` is the full-state hash. Do
not overload them.

Lookup: among responses at this collection + id, the
row whose `version` matches. 0 → miss table. 1 →
serve. N → latest `(at, id)`. Authorization is the
noun’s fence.

`flows/:id/versions`: 404-pin the old table-backed
address first (no callers today). The commit that
registers the pair-chain route flips the pin and names
the succession.

Work-order event histories stay the Work-order phase.
Invitation lists have no versions index.

---

## Identity, members, agents (Members phase)

This section is **law for a named phase**, not for the
BYTEA cut. Phase A keeps today’s `/members`,
`/human-members`, `/memberships`, `/current-member`,
`/ai-members`, and pin **1498**. The Members phase
retargets accept, token baking, the write authorizer,
flow `memberIds`, mock seed, and TEST-PLAN Agent-G,
and replaces the pair-count pin.

### Retired in that phase

`/members/…`, `/human-members/…`, `/memberships/…`,
`/current-member`, `/ai-members/…`.

The client reads **its id from the access token**
(`sub`). No extra browser key. Theme/sidebar stay in
localStorage.

### Identity

`PUT` / `GET /identities/:id` — kind plus folded human
profile (title, department, strengths, team
dimensions). Person may carry those fields; service
must not.

**Keep `/identities/:id/pii`.** Name, email, phone,
bio stay a facet so erasure can delete PII and leave
the identity. Title is not that. PII replace still
physically deletes the prior pair (one-role process
can `DELETE`).

### Organization member (the seat)

`/organizations/:organization-id/members/:identity-id`

This **is** the relationship: this identity, this
organization. Privilege `type` (`admin` | `member`) is
a field on it. Absence of the row means not a member.
Roster GET is a prefix slice.

Kind stays on the identity. The system user is not a
member; resolve authors via identity / a constant
name.

Invitation **accept** writes the **seat** inner PUT
(not `memberships/:id`). It stamps the
**invitation’s** organization, not the caller’s
active organization. Same `Operation-ID` as the
accept. No synthesized parent document beyond that
seat.

Token claims bake `{type}:{organization_id}` from
**seats**.

### Default organization

`/identities/:id/default-organization` is a **simple
document**. PUT `{ organization_id }` (must be a live
seat). GET that document, or 404 if never set. No
public DELETE.

**Revoke does not touch this document.** GET is the
last SET (a fact). Token resolution: use the SET if
that organization is a live seat, else PRIMARY
(earliest remaining join `at`, lex id on tie), else
deny.

### AI agents

`PUT` / `GET /ai-agents/:id` — name, description,
skill focus, model. Not a member. Not an identity
(they do not log in). A roster seat that names an
agent is later, not a third global family. Until that
later work, flow graph `memberIds` that named AI
members are retargeted in this phase to whatever the
phase’s graph law says — write that retarget in the
phase commits; do not leave `memberIds` pointing at
retired `/ai-members` ids.

### Create is PUT

No composing POST that writes three pairs.
Create/update a person: `PUT /identities/:id`.
Create/update an agent: `PUT /ai-agents/:id`. Seat:
`PUT` the organization member document.

---

## GET catalog

Only **stream** families use write-time PUT = GET
representation. Unclassified is not stream. This table
is the **target** after the Members phase. Phase A/B
stream today’s live families (including `/members`,
`/memberships`, `/ai-members`). Nested “Stream” rows
that have **no leaf GET** are collection-only; PUT =
GET cannot hold on an address with no GET.

| Surface | Class |
|---|---|
| Ideas, projects, objectives, record-types (detail + collection) | Stream |
| Their `/versions` | Chain |
| Flows (detail + collection) | Stream (`graph`; `hasUndoHistory` at read). Not a trio GET |
| Flow versions | Chain |
| Nested: submissions, project-flows, flow work-orders/records/tags, attributes, objective revisions, scores | Stream (often collection-only) |
| Record instances (list, detail, value history) | Project |
| `/identities` (+ `:id`) | Stream |
| `/identities/:id/pii` | Stream (self-only) |
| `/identity-pii` | Assemble |
| Credentials | Project (`withoutSecret`) |
| `/identities/:id/registration` | Stream |
| `/identities/:id/default-organization` | Stream (404 if never set) |
| Identity-tokens, revocations, providers | Stream |
| `/ai-agents` (+ `:id`) | Stream (Members phase) |
| `/organizations` | Assemble (token claims ∩ `deriveOrganizations`) |
| `/organizations/:id` | Stream |
| `/organizations/:id/members` (+ `:identity-id`) | Stream (Members phase) |
| `GET /invitations`, `/invitations/sent` | Assemble. No invitation detail GET |
| `GET snapshots/schema` | Dump (admin on server ZIP) |
| Work-order inbox / detail / history | Work-order phase (those routes **exist** today; the phase is a class deferral, not absence) |
| Bulk `GET objectives/versions` | Chain |

Invitation **write**: only while pending; first
terminal op wins (later 409). Lists stay assembled.

**Phase B pin review (stream families only):** the
streamed PUT must equal **today’s GET derive** over
the same chain (trio, `graph`, id-last tokens), not a
weaker write echo. A pin that drops those fields is
test weakening.

### Stream groups and writers

Phase B converts group by group. A pin that only says
“id-last tokens” is not enough; each group names the
mapper and every writer.

**G1 — Trio documents.** Mapper = wiring `entityOf`.

| Address | Mapper | Writers |
|---|---|---|
| `ideas/:id` | `ideaEntityOf` | `postIdeaDocumentOp`; conversion `ideaPair` |
| `projects/:id` | `projectEntityOf` | `postProjectDocumentOp`; conversion `projectPair` |
| `objectives/:id` | `objectiveDocumentEntityOf` | `postObjectiveDocumentOp`; creation document half |
| `members/:id` | `memberDocumentEntityOf` | member create/edit ops (until Members phase) |
| record-types `/:id` | `recordTypeEntityOf` | `postRecordDocumentOp`; `formRecordWritePairs` |

**G2 — Flow graph.** Mapper = `flowEntityOf` minus
`hasUndoHistory`. Writers: `postFlowDocumentOp`;
creation document half; undo synthesized document.

**G3 — Stateless wiring.** Mapper = wiring `entityOf`.

| Address | Mapper | Writers |
|---|---|---|
| `ai-members/:id` | `aiMemberDocumentEntityOf` | AI create/edit (until Members phase) |
| `human-members/:id` | `humanMemberDocumentEntityOf` | human create/edit (until Members phase) |
| `identities/:id` | `identityDocumentEntityOf` | `postIdentityDocumentOp`; creation; human half |
| `memberships/:id` | `membershipDocumentEntityOf` | `postMembershipDocumentOp`; accept (until Members phase writes the seat) |
| `organizations/:id` | `organizationEntityOf` | organizations PUT. Mapper is id-last; today’s successBody is id-first. |

**G4 — Event-append (id-last GET).** Mapper = stored
response body after B. Writers include
`formTokenEventPair` (id-first stored PUT). A pin
must cover both shapes.

| Address | Mapper | Writers |
|---|---|---|
| `identity-tokens/:id` | `identityTokenEntityOf` | `formTokenEventPair`; PUT |
| `identity-token-revocations/:id` | `tokenRevocationEntityOf` | PUT |
| `identity-providers/:id` | `identityProviderEntityOf` | `postIdentityProviderDocumentOp` |

**G5 — Facets.** `piiEntityOf` /
`replacePiiSlot`; `registrationEntityOf` + DELETE
tombstone.

**G6 — Nested.** submissions, project-flows, flow
work-orders/records/tags, attributes, objective
revisions, scores — each with its `*EntityOf` mapper
and the create/PUT writer already in
`api/routes.ts`.

Members phase adds writers for seats and `/ai-agents`
and retires the G1/G3 member/membership/ai-member
rows.

---

## Work-orders (Work-order phase)

This spec locks the verbs. It does not convert the
inbox. The yank does not wait.

- **Bind** — create-only PUT
  `{instance_id, record_type_id}` at
  `work-orders/:id/binding`. Those ids are immutable
  foreign ids. No row means not bound. Rebind 409. No
  DELETE. POST 204 is gone (first bind is 201).
  **Gates:** the instance must be a live PUT head;
  `record_type_id` must be a live record-type join on
  that flow. Else **400**, nothing stored. Follow-on
  **considers renaming** bind to `location` or
  `position`. Verbs stay locked; the name is open.
- **Claim / release** — `work-orders/:id/claim`: PUT
  claims, DELETE releases (DELETE head = unclaimed),
  GET returns the claim facts, **404 only when
  unclaimed** (no row or DELETE head). An expired
  claim is still a row. “Claimed now” is judged at
  read against the clock. PUT 409s only against a
  live unexpired head.
- **Transition** stays POST. First success **201**.
  Value-bearing `If-Match` preconditions the bound
  record instance head.

Follow-on **executes** these verbs. It still settles
expiry storage (`expires_at` vs `at` + TTL), list
embed vs extra fetch, and history shape.

Bind: a work order is a process; field values live on
an organization-owned record instance. Bind names
which one. Many work orders may share one record
instance.

---

## Spent assertion ticket

A client assertion must carry `jti`: present,
non-empty, `^[A-Za-z0-9_-]+$`. Omit → assertion
invalid.

First successful grant stores an internal pair at
`/authentication/assertion-jtis/:jti/` with
`{ "exp": <unix seconds> }`. Not a public route.
Absence means not spent.

Second grant with that `jti` → **401**
`invalid_grant`, nothing minted. If the row exists, it
stays spent even after `exp`. A janitor is later work.
Do not treat an expired row as a miss.

Lock the address, probe, then in **one transaction**
write the spent-ticket pair, the grant pair, and the
token-event pairs — or none. The advisory lock is
taken **inside** that transaction
(`pg_advisory_xact_lock`).

Do not put `jti` on the token response. Do not search
grant bodies for it.

---

## Auth, cookies, and the ledger

### Refresh cookie

On token success: `Set-Cookie` for the **refresh**
token. The JSON body has **no** `refresh_token`.

- `HttpOnly`, `Secure`, `SameSite=Strict` (one origin)
- `Path=/authentication`
- JS never reads it. Remove it from
  `session-credentials` / localStorage
- Access token: **memory only**, `Authorization`
  header. Not a cookie
- Refresh POST uses the cookie; response rotates
  (`Set-Cookie` again). Logout/revoke clears the
  cookie
- `Secure` requires HTTPS at the **public** origin.
  Local HTTP is a named `localhost`-only exception

**Silent refresh (required):** on boot and on API
**401**, `POST /authentication/token` with the cookie.
In-page, every caller waits on **one** such POST, then
retries with the new access token. Across tabs, the
same mutex (`navigator.locks` or the existing
`BroadcastChannel`). Failed refresh (no cookie, spent,
expired) → `/auth`. Do not treat “the loser’s next
401” as the coordinator — two in-flight refreshes
spend the rotation.

XSS can still *use* the cookie from that page. It
cannot *exfiltrate* the refresh token.

### Two Postgres roles — deferred

Not this ship. Later, with token-at-rest hashing, that
work must specify before it ships:

- how the process becomes `fusion_api` after DDL
  (`SET ROLE` vs a second URL)
- `SECURITY DEFINER` (or equivalent) for PII replace,
  import wipe, and authorize-code redeem
- view SQL that hides **every** secret collection
  (`/authentication/`, `/identity-tokens/`,
  `/identities/:id/credentials/`, hoisted
  `Authorization` on writes), not only
  `/authentication/`
- grants so `RETURNING id` works and
  `RETURNING message` does not on those collections

Until then: one owner connection; raw dump holds
verbatim auth messages; **demo server**.

### PKCE and 401s

Server ZIP rejects authorize without S256. Client
assertion stays on the **token** grant. The web app
sends S256 as a **Phase D client** change.

| Case | Body |
|---|---|
| Bearer / access token | `{ "error": "invalid_token" }` |
| Failed client assertion | `{ "error": "invalid_client" }` |
| Bad password, spent assertion, unknown code | `{ "error": "invalid_grant" }` |

Reason goes to **logs** only. Access tokens stay valid
until `exp` (≤ 15 minutes) after revocation.

Body over 1 MiB → **413**, no parse.

**Auth throttle:** 5 token/authorize attempts per
**client address** per minute → **429**. Env
`TRUSTED_PROXY_HOPS` names the proxy address (or hop
list). Honor `Forwarded` / `X-Forwarded-For` **only**
when `socket.remoteAddress` is that hop. Otherwise use
`remoteAddress` (one bucket). Bad config is a global
cap, not a spoofable identity. Do not key on identity.

Public origin is HTTPS. `http://` redirects at
whatever owns :80. This process may speak HTTP behind
that terminator. `Secure` cookies follow the public
URL.

Snapshots on the server ZIP: admin + bearer. Seed is
below HTTP. `requiresAuth: true` on the snapshots
page. Member 403.

Anonymous JWT is gone. Authenticated means a session
token is held. App pages go to `/auth/index.html`.

### Password hashing

Server: **scrypt** via `node:crypto`. PHC
`$scrypt$ln=17,r=8,p=1$<salt>$<digest>`.
`SCRYPT_LOG_N = 17`, `R = 8`, `P = 1`,
`SCRYPT_MAXMEM_BYTES = 167772160`. Successful PBKDF2
login appends a scrypt credential. Browser ZIP stays
PBKDF2 until the yank. Tests keep `testHashPassword`.
Operator mock seed hashes **serially**.

---

## Snapshots and locks

**Export:** one transaction, **REPEATABLE READ**.
Export may read base tables (one role). Auth blobs
stay in the file — demo residual.

**Import:** exclusive import lock, then one
transaction: delete all → insert both tables → stamp
`schema_marker`.

**Lock order** (never reverse):

1. Import lock, if this is an import
2. Dedup lock (from request `message_hash`), if
   hash-deduped
3. Address lock (from `uri_collection` + `uri_id`),
   if gated
4. `FOR UPDATE` on a latched head, if this is a
   conditional write (after 3; never before 1–3)

Deadlock → loud 500. No backend retry.

Dedup skipped only on: token rotation,
`authentication/token`, `authentication/authorize`
(`REPLAY_EXEMPT_ROUTE_PATTERNS`).

Advisory locks are `pg_advisory_xact_lock` (they exist
only inside a transaction). Keys are the first
`ADVISORY_KEY_HEX_DIGITS = 13` hex digits of sha256
(52 bits; fits signed bigint without the sign bit):

- Import: sha256 of
  `SNAPSHOT_IMPORT_LOCK_NAME = 'fusion.snapshot.import'`
- Dedup: sha256 of `'fusion.dedup.' || message_hash`
- Address: sha256 of
  `'fusion.address.' || uri_collection || uri_id`

A collision only serializes unrelated work. Do not
claim uniqueness. Do not use `hashtext`.

Address locks serialize create-only / first-terminal /
claim / genesis races. They do not prove “I hold the
current head.” That is `If-Match` + `FOR UPDATE` +
re-query.

---

## Server process

One Node process, one origin, `node:http` (or HTTP
behind a terminator). `handleRequest` is unchanged
behind a thin adapter.

| Env | Meaning |
|---|---|
| `POSTGRES_URL` | Owner connection; required |
| `JWT_HMAC_SIGNING_KEY` | HMAC material; required |
| `HTTP_SERVER_PORT` | Listen port; required |
| `TRUSTED_PROXY_HOPS` | Proxy address(es) for the throttle; optional |

Secrets enter at process start, stay fixed, are never
logged, have no defaults.

**One mint process.** Two Node processes corrupt `at`.
`POOL_MAX = 10` in one process is fine. Do not
load-balance until a mint realm exists.

**Boot, fail-fast:** env → pool → UTF8 → idempotent
DDL → no marker and no seed flag → **do not listen**
→ listen. A missing table after listen is a loud
failure, not recovery. `MissingTableError` is not a
redirect path.

**Seed:** `--seed-bootstrap` / `--seed-mock-data` on
an **empty** database; print credentials once on the
terminal. Operator mints `operation_id` for every
seed pair. Non-empty → refuse.

**Bounds:** statement 30s; header/body timeouts;
per-request deadline; body 1 MiB; pool acquire 5s;
SIGTERM drain 10s.

**Dispatch**

| Path | Handler |
|---|---|
| Static extension (`.html`, `.js`, `.css`, …) | File from composed output. Missing → 404 |
| `{dir}/{file}.html` | That page |
| No extension, API first segment | `handleRequest`. No token → **401 before 404** |
| No extension, not API, not a page | API-looking: 401 if unauthenticated, else 404 |

Hashed assets: `Cache-Control: public,
max-age=31536000, immutable`. Today’s `./build`
emits **fixed names**; content-hash filenames are
real Phase D work, not a free lunch. HTML and API:
`no-store`.

**Logs:** one structured line per request: RFC-3339
UTC `at`, level, `Operation-ID` on **writes**, method,
path (query string stripped), status, latency ms. No
secrets or PII.

**Stop:** SIGTERM → stop accepting, drain 10s, close
pool, exit 0. Impossible states crash.

**Notify:** `pg_notify('fusion_events', payload)`
inside the write transaction. Postgres delivers on
commit and swallows on rollback. Payload bound:
`PG_NOTIFY_PAYLOAD_MAX_BYTES = 8000`. If the
serialized `NotificationEvent` would exceed it, emit
`{"kind":"full"}`. No listener. Two browsers look
stale until navigation. TEST-PLAN names that so it is
not a failed case.

---

## Server-ZIP client

Verb helpers become a `fetch` facade
(`adapters/http-facade.ts`). Same `RequestContext`.
No import of `api/api.ts`.

`decodeAccessToken` / `principalFromToken` move to
`shared/` (decode only). Mint and verify stay on the
server.

Two esbuild entries. A metafile test forbids
`SIGNING_KEY_MATERIAL` and `backend-indexeddb` in
the server-ZIP client. Tree-shaking is not the gate.

The fetch facade always sends `Operation-ID` on
writes. It implements the silent-refresh mutex.

Browser ZIP keeps today’s in-page graph until the
yank.

---

## Errors from Postgres

Map by **constraint name**, not SQLSTATE alone.

| Condition | Wire |
|---|---|
| Duplicate primary key | loud 500 (mint bug) |
| Any other unique (none shipped) | loud 500 |
| Bad JSON at the GIN | loud 500 |
| Torn pair at commit (`responses_request_fk`) | loud 500 |
| CHECK failed | loud 500 |
| Deadlock `40P01` | loud 500; no retry |
| Timeout / connection loss | **504** |
| Missing table | loud failure — not a recovery path |

---

## Testing

**`./validate`** stays fast and Postgres-free. Warm
fuzzies, not a proof of the store.

Re-baseline once for the wire break (pair count 1498
on today’s routes). Codec round-trip with **`€`** (and
an emoji), not only `é`. Stream pins = today’s derive,
not a weaker echo. `/versions` hit / wrong-noun 404 /
address-scoped miss (not id-only foreign 403).
If-Match races one **201** and one **412**; no
`follows`. Same-body **200**. DELETE 204; no empty
PUT. Hasher PHC. Server-ZIP metafile. Spent `jti`.
428 for locked missing `If-Match`. Bind 400 gates.
Instance DELETE 409 names in-flight work orders.

**`./test-postgres`** is outside `./validate`. There
is no CI config in the repo today. Whoever calls
Phase C done — local operator or a future CI — **must
run it**. Fresh schema per run (`CREATE SCHEMA` +
`search_path`). Phase C **builds** the parameterized
acceptance factory (it does not exist yet).

Live SQLSTATE maps. Real races: dedup; If-Match;
create-only 201 vs 409; spent ticket; invitation
first-terminal; two simple first writes → two success,
not 409; import vs append. Security: snapshots
401/403/200; authorize without S256 rejected; 413;
sixth authorize → 429; opaque 401s; throttle uses the
trusted hop. Boot, UTF8, SIGTERM drain, seed refuse,
listen refused without marker.

TEST-PLAN gains a server section: browser against the
real server; two browsers / two identities / one
database; two tabs share the refresh cookie; stale-
until-navigation named.

**Measure** at four points: pre-split, **after the
Phase A/B browser-tier storage break**, server first-
light, post-yank. Harness gains a base-URL mode.
Budgets recalibrate (the network is in the path).

---

## Phases

Work is commits on **master**, one at a time, each
`./validate` green. No pull requests. Use the **names**
in the first column. Do not cite “Phase E” from
memory.

| Phase | Lands | Gate |
|---|---|---|
| A — Storage | Storage covenant; address-scoped miss; DELETE heads; body-hash `ETag` | `./validate`; **one reseed**; pair count 1498 |
| B — Stream | Write-time PUT = GET derive; keyed reads; G1–G6 | Per-group pins. Not work-orders. Second version-token reseed |
| C — Postgres | `backend-postgres.ts` + `./test-postgres` + parameterized suite | Live Postgres 18 green |
| D — Server | Node process, cookie, single-flight refresh, trusted-hop throttle, S256 **client**, snapshots auth, 413/429/401. **Not** two-role views | Security tests; first-light `--record` |
| Members | Roster rewrite (seats, agents, default-organization law) | New pair-count pin; accept/mint/authorizer/graph/seed/TEST-PLAN |
| Yank | Delete the browser data tier | D stable; post-yank `--record` |
| Work-orders | Inbox conversion; execute locked verbs | Does not block Yank |

**Independent commits first** (no store break):
bytes-in digest; locked missing `If-Match` → 428;
404-pin old `flows/:id/versions`; tighten write
success bodies to objects.

**Then the storage cut as a tight sequence** in one
sitting: drop `follows` and `supersedes`; in-tx
`FOR UPDATE` + re-query; store `serializeWire`;
request `message_hash` via `sha256HexOfBytes`;
`version` column; body-hash `ETag` / `If-Match`;
`uri_collection`, `method`, `operation_id`; no
`route`; no `uri_id`-only indexes; no response
`status` / response `message_hash`; loud-reject
pre-break snapshots. Each commit passes
`./validate`. **One reseed** at the first of those
commits. Do not interleave other work. Do not stop
overnight with a mixed `ETag` dialect. Do not start
the Members rewrite in this sitting.

**After the cut:** `/history` → `/versions`; named
reads; write-time machinery (second reseed); stream
groups; keyed scans; parameterized suite;
`backend-postgres.ts`; `./test-postgres`; locks /
notify / import; `node:http`; fetch facade + dual
ZIP; seed flags + hard PKCE + snapshots auth;
spent-ticket family; scrypt; refresh cookie +
single-flight; 401 classes + trusted-hop throttle;
TEST-PLAN; first-light measure; Members phase; yank;
work-orders.

---

## Follow-on (Work-order phase)

1. Deep-dive the work-order surface (reads, scans,
   bind N+1, claim, workbox fields actually consumed).
2. Execute the locked verbs. Do not re-ask them.
3. Settle expiry mechanics and holder-only rules.
4. Settle list embed vs sub-resource fetch under the
   embed covenant.
5. Design work-order write-time PUT + history;
   classify `GET work-orders` behind pins.
6. Consider renaming bind to `location` or `position`.

---

## Later work

- Data migration
- SSE `/notifications` (emit only)
- RUM / Server-Timing
- Cross-party delegation (stays 403)
- `/snapshots/export`, `/snapshots/pristine`
- Versioned record-type snapshots
- Work-order abandon
- **304 / `If-None-Match`**
- Mint realm / multi-process `at`
- Token-at-rest hashing
- Two-role views (checklist under Auth)
- Re-render of stored PUT shapes
- Spent-ticket janitor
- Unconditional PATCH
- `Operation-ID` on GET
- More than one Node process
- Roster seat that names an AI agent
- In-process TLS (not required for HTTPS at the
  public origin)

**Residuals on purpose:** raw dump still has verbatim
auth messages; XSS can *use* the refresh cookie from
the page; stale second browser until navigation;
already-exported snapshot files; single mint process;
throttle is a global cap if `TRUSTED_PROXY_HOPS` is
wrong or unset behind a terminator.

---

## Risks

| Risk | What we do |
|---|---|
| Phase A breaks the working browser store | One cut, one reseed, pair-count pin, loud snapshot reject |
| Phase B changes `version` tokens | Named; reseed until a re-render tool exists |
| Two Node processes mint `at` | One replica |
| scrypt × many logins or seed | 5/min; serial operator seed; tests use a cheap hasher |
| Mid-cut mixed `ETag` dialects | Tight commit sequence |
| Members rewrite mixed into the BYTEA cut | Own phase; 1498 stays A-only |
| `FOR UPDATE` on a historical row trusted as “I am head” | Re-query latest in a new statement |
| Unset trusted hop behind a terminator | Named residual: global 5/min |

---

## Cross-references

- `ARCHITECTURE.md` — A1–A6 above are those six
  remaining deploy blockers
- `SCHEMA.md` — update etag wording to body-hash
  `version` at implementation; gain the DDL
- If-Match unification design — validator **bytes**
  superseded (body hash, not pair id). 428, no
  `follows`/`supersedes`, simple LWW remain. Success
  statuses in **this** file supersede “every success
  is 200”
- Work-order SoT coupling — bind verb and gates
  restated here; in-flight instance DELETE 409 stays
- `TEST-PLAN.md` — server section (multi-user, two
  tabs, notify residual)

# The ledger store

- Date: 2026-09-23
- Status: awaiting review, pre-plan
- Worktree: `.worktrees/ledger-store`
- Base: master at `9c289d4c`
- Ships: `fa_message_pairs`, the root, the hash tree,
  and one INSERT shared by the api, the seed, and
  `migrate`
- Defers: the message plane, the seed, and items 1, 2,
  6, and 10
- Witness: `measurements/probes/store/` on Postgres 18.6

## Problem

`message_pairs` stores a pair, and the guarantees a
pair needs live in the application around it. The hash
is unsalted hex text (`api/schema-postgres.ts:17-19`).
Nothing stores a response hash. The handler computes
one (`api/message-pair.ts:288`) and the row has no
column for it.
`request_at` is a second clock beside `response_at`.
`supersedes` is not a column, so a genesis has no
predecessor to name. The `transaction(…)` calls, two
advisory locks, and a `FOR UPDATE`
(`api/backend-postgres.ts:220-246`) guard writes that
one unique index can guard. A request-hash dedupe
(`appendMessagePairOnce`, `api/message-pair.ts:718-729`)
answers a resend from the first pair
(`api/api.ts:967-974`). The table's name, its indexes,
and `message_body` carry no `fa_` prefix.

Item 0 fixes what a pair stores and what the store
guarantees, before anything reads it differently. It
ships as three specs. This is the first. Its DDL is
what the other two fill: `secret` holds zero bytes
until the message plane hoists into it, and the INSERT
hashes whatever bytes it is given.

## Axiom

A pair is one row of `fa_message_pairs`. An api write
is one statement, and that statement is the only write
text the api, the seed, and `migrate` use. The stamp
and the digests are minted in that statement, on the
database clock. The succession index is the only
constraint that guards a race. The memory backend
produces the same row, the same digests, and the same
refusals.

## Decisions

1. **`secret` stays plaintext, with no salt.** The
   column holds the credential lines a client sent.
   The reader is debugging. `secret_hash` is `sha256`
   of those bytes alone. A keyed digest is refused
   because it drops the bytes. Encryption under an
   `FA_` key is refused, whether the leaf would hash
   the ciphertext or the plaintext: a SQL reader
   should see the lines. `request_salt` and
   `response_salt` stay. A bare digest of a guessable
   request or response is still a guessing oracle.
   Item 2's brainstorm inherits the consequence: a
   role that can read `secret_hash` holds an oracle
   for the lines, so the old split (hash visible,
   salt hidden) does not survive.

2. **The succession index is the only write
   enforcement.** Measured on Postgres 18.6, tmpfs,
   the compose shape, against the 262,000-row load
   the row-policy figure used. One successor INSERT,
   median of seven `EXPLAIN ANALYZE` execution times
   after one warmup, rolled back. The scripts are
   `measurements/probes/store/`.

   | Shape | 50,000 versions | 10 versions |
   |---|---:|---:|
   | Minting in the INSERT | 0.402 ms | 0.418 ms |
   | `BEFORE INSERT` trigger | 0.901 ms | 0.879 ms |
   | Column grants plus that trigger | 0.872 ms | 0.877 ms |

   The head read alone is 0.026 ms at 50,000 versions
   and 0.019 ms at 10. The trigger's extra half
   millisecond is the plpgsql mint and its second
   head read. A column grant cannot fill a `NOT NULL`
   column, so that shape was timed with the trigger
   it needs. Naming `response_at` as `fa_api` is
   `permission denied for table`
   (`measurements/probes/store/checks.sql`). Both
   shapes are refused. The stamp and the digests are
   minted in the one INSERT text.

3. **A blind PUT gets three attempts, then 409.** An
   attempt is one execution of the statement. An
   index refusal consumes one. A `matched` outcome
   stops the loop with 200. Three refusals land
   nothing and answer 409. The retries are immediate.
   Two attempts, a single attempt, and 503 are
   refused. A genesis that loses the root's slot
   answers 409 on that attempt. Item 1 already gives
   two creates of one name that answer.

4. **Carried in, and not reopened.** One partial
   unique index on `(path, name, supersedes)` over
   `PUT` and `DELETE`. The statement selects the
   predecessor as the head. `If-Match` is a predicate
   on in-order writes. `supersedes` is `NOT NULL`,
   and the root is a real pair. Digests and the two
   salts are `bytea` under length checks. The pair
   hash is netstrings in DDL order, with no chain.
   One statement per api write. `transaction` and
   `writeLocks` leave `DbAdapter`. No request dedupe.
   The `fa_` prefix. Items 0–3 deploy together.

## Out of scope

The message plane and the seed, listed at the end so
those brainstorms start from the list. Items 1, 2, 6,
and 10, including synthesis decisions 3 through 7, 9,
and 11 through 15. `schema_marker`, which item 3
retires. The row policy, the roles, and the grants,
which item 2 owns. Changing which status a modifying
PUT stores (synthesis decision 5): until that spec,
a PUT that lands stores 201, which is the send-time
rule today (`api/message-pair.ts:649-651`).

## Sequence

1. The handler mints the id and the two salts, builds
   the response, and splits it around the date value.
   Crypto and serialization stay outside the
   statement.
2. The statement selects the predecessor, classifies
   every input row, and either inserts all of the
   `land` rows or inserts none. It splices the date,
   hashes the stored bytes, and notifies for each
   inserted row.
3. The handler maps the outcome, or the succession
   index's `23505`, to one HTTP response. A blind PUT
   may run the statement again. Each attempt commits
   or fails on its own.
4. The seed and `migrate` call this statement inside
   a transaction they open on the client beneath the
   adapter. The api does not.

## 1. The table

`fa_message_pairs` replaces `message_pairs`
(`api/schema-postgres.ts:4-24`). `request_at` is
gone. Column order is the hash order.

```sql
CREATE TABLE fa_message_pairs (
    id uuid PRIMARY KEY,
    operation_id uuid NOT NULL,
    path text COLLATE "C" NOT NULL
        CONSTRAINT fa_message_pairs_path_chk
        CHECK (left(path, 1) = '/'
           AND right(path, 1) = '/'),
    name text COLLATE "C" NOT NULL,
    supersedes uuid NOT NULL,
    requester_identity_id text COLLATE "C" NOT NULL,
    method text COLLATE "C" NOT NULL
        CONSTRAINT fa_message_pairs_method_chk
        CHECK (method ~ '^[A-Z]+$'),
    response_at timestamptz NOT NULL,
    request bytea NOT NULL,
    request_salt bytea NOT NULL
        CONSTRAINT fa_message_pairs_request_salt_chk
        CHECK (octet_length(request_salt) = 16),
    request_hash bytea NOT NULL
        CONSTRAINT fa_message_pairs_request_hash_chk
        CHECK (octet_length(request_hash) = 32),
    secret bytea NOT NULL,
    secret_hash bytea NOT NULL
        CONSTRAINT fa_message_pairs_secret_hash_chk
        CHECK (octet_length(secret_hash) = 32),
    response bytea NOT NULL,
    response_salt bytea NOT NULL
        CONSTRAINT fa_message_pairs_response_salt_chk
        CHECK (octet_length(response_salt) = 16),
    response_hash bytea NOT NULL
        CONSTRAINT fa_message_pairs_response_hash_chk
        CHECK (octet_length(response_hash) = 32),
    pair_hash bytea NOT NULL
        CONSTRAINT fa_message_pairs_pair_hash_chk
        CHECK (octet_length(pair_hash) = 32)
);
```

`name` may be empty: an operation pair's name is
empty today (`SCHEMA.md`, "The one table").
`supersedes` has no foreign key. The eraser in later
work removes a superseded pair and must not rewrite
the successor, whose root covers `supersedes`. The
root names itself. Any other `supersedes` that names
no row means the predecessor was erased.
`requester_identity_id` stays text, because the
root's requester is `fa_owner` and every other row's
is a 22-character identifier. `id` and
`operation_id` stay the uuid encoding of that
identifier (`uuidTextOfIdentifier`,
`api/backend-postgres.ts:290-303`).

## 2. The root

One row, seeded with the schema. `id` and
`supersedes` are the nil uuid, the identifier
`AAAAAAAAAAAAAAAAAAAAAA`
(`shared/identifier.ts:9`). `path` is
`/migrations/`, `name` is `0000-root`, `method` is
`PUT`, `requester_identity_id` is `fa_owner`.
`operation_id` is the operation id the seed mints
for that run, in the column's uuid encoding.
`request` and `secret` are zero bytes. Both salts
are 16 zero bytes. `response_at` is
`clock_timestamp()` at insert: the root has no
predecessor.

`response` is a 201 with an empty reason phrase, so
the start line is `HTTP/1.1 201 `, including the
trailing space (`serializeStartLine`,
`shared/http-message/wire-codec.ts:279-284`). The
header lines, ascending by name, are
`content-length`, `date`, `etag`, and
`operation-id`. There is no `request-id` line.
`date` is the IMF-fixdate of the stamp at one-second
resolution (`httpDateOf`,
`api/message-pair.ts:464-466`). `etag` quotes the
nil identifier (`strongEtagOf`,
`api/message-pair.ts:531-534`). `operation-id` is
the seed's operation id in the 22-character form.
The body is the 64-character lowercase hex of
`sha256` of zero bytes, and `content-length` is
`64`. The body's value is

```text
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

The index entry `('/migrations/', '0000-root', nil)`
is the slot a successor would need, so the index
refuses one. The stamp and the seed's operation id
are the only values that vary between databases.
`request_hash` is `sha256` of 16 zero bytes:

```text
374708fff7719dd5979ec875d56cd2286f6d3cf7ec317a3b25632aab28ec37bb
```

`secret_hash` is `sha256` of zero bytes, the same
hex as the body above. `response_hash` and
`pair_hash` follow from the stamp and the operation
id through the functions in the next section.

## 3. The hash tree

Three leaves and one root. No chain: the root covers
the `supersedes` id and never a predecessor's hash.

```text
request_hash = sha256(request_salt || request)
secret_hash  = sha256(secret)
response_hash = sha256(response_salt || response)
```

`response` in that line is the stored bytes, after
the date splice. `||` is byte concatenation.
`sha256` is Postgres `sha256`, 32 bytes, stored as
`bytea`. Hex appears only inside the pair-root
input.

The pair root hashes the UTF-8 of the netstrings of
eleven texts, in this order: `id`, `operation_id`,
`path`, `name`, `supersedes`,
`requester_identity_id`, `method`, `response_at`,
`request_hash`, `secret_hash`, `response_hash`. A
netstring is the decimal byte length, a colon, the
text, and a comma. A uuid is the lowercase text
Postgres prints. The stamp is UTC
`YYYY-MM-DDTHH:MM:SS.UUUUUUZ`, six digits, produced
with `to_char(… AT TIME ZONE 'UTC', …)` so
`DateStyle` and `TimeZone` cannot change it. A
digest is `encode(hash, 'hex')`, so `bytea_output`
cannot change it. Every one of these texts is
ASCII, and the length is `octet_length` of the
UTF-8 anyway.

`fa_pair_root` is the SQL function of those eleven
values. `shared/` holds the one TypeScript twin.
The memory backend and the tests call the twin.
The statement calls `fa_pair_root`.

The date splice uses `fa_imf_fixdate`, which builds
an IMF-fixdate from numeric fields and two English
arrays (Sunday-first, January-first). It does not
call `to_char` for `Dy` or `Mon`, which follow
`lc_time`. Its result is always 29 bytes, which is
what `Date.toUTCString()` produces
(`api/message-pair.ts:464-466`).

## 4. The extractor and the indexes

`fa_request_id_of(response)` is an immutable SQL
function. It converts the header block, the bytes
before the first CRLF CRLF, to text and returns the
value of the line `request-id`. The canonical form
guarantees at most one such line. A missing line
returns null. The root returns null.

```sql
CREATE INDEX fa_message_pairs_document
    ON fa_message_pairs (path, name, response_at, id);
CREATE UNIQUE INDEX fa_message_pairs_succession
    ON fa_message_pairs (path, name, supersedes)
    WHERE method IN ('PUT', 'DELETE');
CREATE INDEX fa_message_pairs_request_id
    ON fa_message_pairs (fa_request_id_of(response));
```

`fa_message_pairs_document` is today's
`message_pairs_document`
(`api/schema-postgres.ts:49-50`). Item 1's head
read and its skip walk both use it.
`message_pairs_replay` (`:53-54`) drops with the
dedupe. `fa_message_pairs_collection` keeps today's
`message_pairs_collection` (`:51-52`) under the new
name, until item 1's walk is the collection read.
`fa_message_body` keeps today's `message_body`
(`api/schema-postgres.ts:31-46`) under the new
name, and `fa_message_pairs_body` keeps the GIN
index, until the message-plane spec retires the
code-document search. `schema_marker` stays until
item 3.

`fa_message_body_bytes(message)` returns the bytes
after the first CRLF CRLF, or zero bytes when the
separator is absent. The sameness test compares
those bytes. It is not the jsonb `message_body`.

## 5. The statement

One text. Fourteen parameters per input row, in
this order, so the seed's `n` is 14:

| # | Parameter |
|---|---|
| 1 | `id` |
| 2 | `operation_id` |
| 3 | `path` |
| 4 | `name` |
| 5 | `requester_identity_id` |
| 6 | `method` |
| 7 | `request` |
| 8 | `request_salt` |
| 9 | `secret` |
| 10 | `response_prefix` |
| 11 | `response_suffix` |
| 12 | `response_salt` |
| 13 | `if_match` |
| 14 | `notify` |

`if_match` is null on a blind PUT and on a
genesis. `response_prefix` is the response bytes
before the 29-byte date value, and
`response_suffix` is the bytes after it. The
handler builds that split from a message whose
date value is any 29 bytes. `notify` is the
payload `eventForMessagePair` already builds
(`api/message-pair.ts:816-832`), after
`notifyPayload` has applied the 8000-byte cap
(`api/advisory-lock.ts:11-26`).

For each input row the statement takes the newest
`PUT` or `DELETE` at `(path, name)`, by
`(response_at, id)` descending. That is today's
head read (`api/backend-postgres.ts:477-490`). No
such row means the predecessor is the nil uuid.
The stamp is `clock_timestamp()` when there is no
head, and otherwise the later of
`clock_timestamp()` and the head's stamp plus one
microsecond. The stored response is
`prefix || fa_imf_fixdate(stamp) || suffix`.

A row's outcome:

- `stale`, when `if_match` is not null and the
  head's id is distinct from it. A latch against
  a document with no head is `stale`.
- `matched`, when a head exists and
  `fa_message_body_bytes` of the head's response
  equals `fa_message_body_bytes` of the spliced
  response.
- `land`, otherwise. A blind PUT of a document
  with no head is a genesis: `land`, superseding
  the nil uuid.

The statement inserts the `land` rows only when
every input row is `land`. One `stale` or one
`matched` inserts nothing. A no-op operation
therefore stores nothing at all, receipt included,
which is the rule item 1 already states for a
PATCH or POST whose head already holds the state.
The seed inherits the same rule: every row of a
batch is one the seed means to land, and a
shortfall fails the seed.

The final select rewrites the reported outcome to
match that decision. Any `stale` reports every row
as `stale`. Otherwise any `matched` reports every
row as `matched`. Otherwise every row is `land`.
Each row comes back with its id, path, name,
method, outcome, stamp, spliced response, the
head's id, and the head's response.
`pg_notify('fusion_events', notify)` runs only for
a row that was inserted.

A `23505` on `fa_message_pairs_succession` aborts
the statement. No row from it remains, and no
notify from it has been delivered, because the
statement is one unit. A `23505` on the primary
key is a fault: the handler minted an id that
already exists.

## 6. The handler

The handler sends at least one row. It maps the
result.

Every row `land`: the wire sends the stored response
of the row this request answers. A one-row PUT stores
201. A one-row DELETE stores 204. The status line in
the stored bytes is the status on the wire.

Every row `matched`: 200 and the head's stored
response. A one-row write uses that row's head. A
composed write uses the head of its `PUT` or `DELETE`
row. Item 1 names which row answers when a route has
several.

Every row `stale`: 412.

A `23505` on the succession index:

- A blind PUT runs the statement again
  immediately, up to three executions. A
  `matched` result stops the loop. Three
  refusals answer 409 and leave the head as the
  third attempt found it.
- A genesis answers 409 on the first refusal.
- An in-order write, and any composed write,
  answers 412 on the first refusal.

The handler distinguishes a blind PUT, a genesis,
and an in-order write before the call. A composed
statement is never retried: refilling
`supersedes` around a stale body would bury the
winner's change, which item 1 forbids.

## 7. Memory

The memory backend applies the same classification,
the same stamp rule, the same date splice, and the
same four digests, calling the TypeScript twin.
Its clock is the process clock. The succession
rule is the same function of that clock and the
predecessor's stamp. Its succession set refuses a
second `PUT` or `DELETE` with the same `(path,
name, supersedes)`, and the handler maps that
refusal as it maps `23505`. The blind PUT's three
attempts run here too. A `matched` or `stale`
statement rings no bell. A landed row rings the
same payload.

## 8. The adapter

`DbAdapter.transaction`
(`api/db.ts:267-269`) and `writeLocks`
(`api/db.ts:174-183`, carried at
`api/db.ts:258`) leave the adapter. An api read
is one statement. An api write is the statement
in §5. `appendMessagePairOnce`, the replay fast
path (`api/api.ts:967-974`), `lockRequest`,
`lockDocument`, and `lockHead` leave with them.
`RETURNING` replaces the post-dispatch readbacks. The seed and
`migrate` do not gain a transaction method on the
adapter. They open one on the client beneath it.

## Error and wire

A landed or matched answer is the stored response
bytes, written as the HTTP response. A refusal is
`{"error":"<sentence>"}` (`errorJson`,
`api/http-errors.ts:64-68`).

A stale latch, and an in-order or composed write that
loses the index, answers 412: `If-Match does not match
the current document at <path><name>`.

A genesis that loses the root's slot answers 409:
`Document already exists at <path><name>`.

A blind PUT that exhausts three attempts answers 409:
`Document remained contended at <path><name>`.

The 412 sentence is today's
(`api/message-pair.ts:784-788`). `<path><name>` is
the document the latch named, or the document the
genesis and the blind PUT were writing.

The bell payload is unchanged:
`{"kind":"scoped","organizationIds":[...],"identityIds":[...]}`,
or `{"kind":"full"}` past 8000 bytes. The channel
is `fusion_events`.

## Testing

Layer 1, against the memory backend, in
`tests/ledger-store.test.ts`. `./test postgres`,
against Postgres 18.6, in `tests/pg-ledger-store.test.ts`,
ignored when `POSTGRES_URL` is unset, the way the
other `pg-*.test.ts` files are.

One pinned row, hashed by both twins. `id`
`00000000-0000-0000-0000-000000000001`,
`operation_id`
`00000000-0000-0000-0000-000000000002`, `path`
`/migrations/`, `name` `0001-example`,
`supersedes` nil, requester `fa_owner`, method
`PUT`, stamp `2026-09-23T00:00:00.000000Z`.
`request` is the three bytes `req`.
`request_salt` is 16 bytes of `0x11`. `secret` is
zero bytes. `response_salt` is 16 bytes of
`0x22`. The response is the canonical message
whose start line is `HTTP/1.1 201 `, whose
headers are `content-length: 5`,
`date: Wed, 23 Sep 2026 00:00:00 GMT`, and
`etag: "AAAAAAAAAAAAAAAAAAAAAA"`, and whose body
is `hello`.

```text
request_hash  bf60c6295dfe880bfc15db7af6ee2acc1991cf793a765123e035e9c54326ab39
secret_hash   e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
response_hash 2f3231e1a728bf8d8997752e308dd9e2adbb14dc83fb76d9ee23d7208d6c5f87
pair_hash     f2e4a0d0c4a55a8e5efbbf3a689ab8ef03278458c3bc8510e0b5f9ae532364b9
```

Layer 1 also pins the behavior:

- A successor's stamp is the later of the clock
  and the predecessor's stamp plus one
  microsecond.
- A matched body answers 200 with the head's
  response and rings no bell.
- A stale latch answers 412 and lands nothing,
  including when a second row of the same
  statement would have landed.
- A second genesis answers 409.
- A blind PUT that loses once and then matches
  answers 200 on the second attempt.
- A blind PUT that loses three times answers 409
  and leaves the head untouched.
- An in-order loss answers 412 and does not run
  a second attempt.
- The root row's constant fields, salts, and the
  two pinned leaves match §2.

`./test postgres` pins the same statement on the
table:

- The root row passes every CHECK, occupies
  `('/migrations/', '0000-root', nil)`, and its
  digests match the TypeScript twin.
- A second successor of one predecessor raises
  `23505` on `fa_message_pairs_succession`. A
  `POST` at that same `(path, name, supersedes)`
  is allowed.
- A salt or a digest of the wrong length, a
  method outside `^[A-Z]+$`, and a path that is
  not slash-bounded are rejected by their CHECKs.
- `fa_request_id_of` returns the line's value,
  and null when the line is absent. The root
  returns null.
- The head read's plan is an index scan on
  `fa_message_pairs_document`.
- A landed row notifies `fusion_events` once. A
  matched statement notifies nothing.
- When the predecessor's stamp is ahead of
  `clock_timestamp()`, the successor's stamp is
  that stamp plus one microsecond.

## For the next brainstorms

The message-plane spec inherits:

- The canonical message: lowercase field names,
  one line per name, repeats joined with `, ` in
  the order received, `set-cookie` never joined,
  lines ascending by name, `name: value` with one
  space, the value trimmed, CRLF, a blank line,
  then the body. The version token is `HTTP/1.1`.
  A response reason phrase is empty.
  `content-length` is checked at the gate and
  stored, never stripped and recomputed.
- The credential hoist into `secret`: the lines
  `authorization`, `proxy-authorization`, and
  `cookie` from a request, and `set-cookie`,
  `authentication-info`, and
  `proxy-authentication-info` from a response,
  whole, in canonical order, joined by CRLF with
  none trailing. Zero bytes when there are none.
  No salt. The bytes are what the client sent.
- `request` holds the request less those lines.
  A pair that received nothing stores zero
  request bytes. `response` holds the response
  less those lines. The `user-agent` line is
  stored as received.
- The two ids. The server mints `request-id` on
  every request, returns it, and answers 400,
  landing nothing, when the client sent one.
  The client mints `operation-id` once per
  operation, in one place, and the gate requires
  it on every request except `/status`, which is
  item 4. The id rides every pair that
  operation writes. Nothing looks a request up
  by it.
- The authorize code document, the grant's read
  of it by name, and the retirement of the body
  search, `fa_message_body`, and
  `fa_message_pairs_body`.
- Synthesis decision 3: a chunked request, and
  whether the gate answers 411.
- Synthesis decision 4: a resent latched PUT
  whose latch names the predecessor.
- Synthesis decision 5: whether a modifying PUT
  keeps storing 201.

The seed spec inherits:

- One transaction on the client beneath the
  adapter, holding the DDL, the root, and every
  pair. A failure leaves nothing, including the
  table.
- This statement, with `n` of 14. Batches,
  `floor(65535 / 2 / n)` or whatever margin
  replaces it (synthesis decision 9), and chain
  order by depth: every genesis, then every
  second version, then every third, so each
  statement sees the previous depth's rows.
- Rows formed, and salts minted, before the
  transaction opens. The root's salts are the
  16 zero bytes from §2, and its `operation_id`
  is the seed's operation id.
- A batch lands entirely. A `matched` or
  `stale` row inserts nothing from that
  statement, and the seed treats a shortfall as
  a failed seed.

Items 1, 2, 6, and 10 keep the rest of the
synthesis list. Item 2 in particular inherits
the unsalted `secret_hash` from decision 1.

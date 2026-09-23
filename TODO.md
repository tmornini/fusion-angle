# TODO

The single home for later work. An item leaves this
file by shipping; `## Close protocol` is the exit.

## Critical product path

Fourteen items, in this order — each its own brainstorm →
spec → plan → ship cycle, implemented sequentially,
ordered by benefit over cost: the ledger right, then
fenced (items 0–3, one deploy), what a pilot tenant needs
next, the process engine and its AI worker on that, two
processes last. A "Merged:" clause names bullets absorbed
from `## Later work`; they keep their oracles. Four
former items left for `## Later work` (genericity, JSON
parse/stringify, simulated latency, cachability) and the
skew tests, which went with item 8's trio.

0. The table, right — what a pair stores and what the
   store guarantees, before anything reads it differently.
   It ships as three specs in order, each its own
   worktree, master green at Layer 1 between them and
   deployed with items 1–3: the store — the final DDL,
   its table `fa_message_pairs` and its indexes named
   after it under the naming bullet's prefix,
   the root, succession, the hash tree, one statement per
   write, locks and `transaction` out of `DbAdapter`; the
   message plane — the canonical form, credential lines,
   the two ids, the code document and the body search's
   retirement; and the seed — one transaction beneath the
   adapter, its batches and chain order. The store goes
   first because its DDL is what the other two fill: the
   credential column holds zero bytes until the message
   plane hoists into it, and the INSERT hashes whatever
   bytes it is given.
   Every stored message is in one canonical form: field
   names lowercase; one line per name, repeats joined with
   `, ` in the order received, `set-cookie` alone never
   joined (RFC 9110 §5.3); lines ascending by name,
   bytewise; `name: value` with one space and the value
   trimmed; CRLF line ends, a blank line, then the body
   bytes; the version token fixed at `HTTP/1.1` and a
   response's reason phrase empty. A sender's line order,
   name case, and version token are not recoverable, and
   nothing depends on them. `shared/http-message` parses
   and serializes exactly this form, request and response
   alike, and keeps every received line: `content-length`
   is checked against the body at the gate, never stripped
   and recomputed. `request` holds the entire request as
   received — start line, every header, and the body bytes
   exactly as received, never re-serialized — less its
   credential lines, hoisted as below; the client sends
   `user-agent: fusion-angle/<sha>` on every API request
   — the build embeds the SHA in the bundle as in the
   binary — so the ledger names the build that made each
   request, and a browser that keeps its own token
   instead (Layer 2 measures which) leaves that token
   stored as received. A pair for which
   nothing was received (item 1's sibling PUTs) stores
   zero request bytes. `response` holds the entire
   response as sent, less its credential lines: the status
   actually sent — 201 for every PUT that lands, a
   genesis, a successor, or a PUT after a DELETE alike,
   as today (`api/message-pair.ts:649-651`), a sibling
   PUT's line included; 200 for a PUT that lands nothing
   because its state is already the head — blind, or
   in-order with a latch that held (RFC 9110 §13.1.1) —
   a replay,
   answered with the head's unit; and 204 on DELETE —
   and `date`, `etag`, `operation-id`, and `request-id` as
   the wire carries them; item 1 says how a read serves
   these bytes. A runtime orders and cases the lines it
   puts on the wire, so `response` is the message handed
   to it — same lines, same values, same body bytes — and
   the runtime must keep a `date` it is given
   (`Deno.serve` does: measured, 2.9.6), so the stamp
   Postgres mints is the `date` the wire carries. A
   sibling PUT (item 1) sends nothing; its `response` is
   the message a read of it serves. Secrets
   move to credential lines: every secret a request
   presents rides `Authorization` — `Basic` where an
   identifier and its proof travel together: the
   password, no longer the authorize body, and the token
   request's `code` with its `code_verifier`; `Bearer`
   where the credential is a token: the exchange's
   `subject_token` and `actor_token`, and the
   `client_credentials` grant's `client_assertion`
   (`api/authentication.ts:1066-1067`) — so no stored
   request body holds a secret and `secret` is the one
   column of secrets, the message plane naming each
   grant's line;
   and the authorize `code` and the token grant's
   `access_token` leave the response body for
   `Authentication-Info` (RFC 9110 §11.6.3), the field
   HTTP defines for what a server says once credentials
   are accepted, as `#auth-param`: authorize answers
   `code="…"`, the grant `access_token="…"`, and a
   field that is no secret stays in the body; the
   refresh token's `Set-Cookie` is the
   precedent, and the departure from RFC 6749 §5.1 is
   accepted: both clients are ours. Credential lines are
   hoisted whole — name and value — out of `request` and
   `response` into one fenced column, `secret`, named
   for its leaf and salt, which holds them in canonical
   order joined by CRLF with none trailing, zero bytes
   when there are none: `authorization`,
   `proxy-authorization`, and `cookie` from a request,
   `set-cookie`, `authentication-info`, and
   `proxy-authentication-info` from a response — every
   credential-carrying field HTTP defines (RFC 9110 §11,
   RFC 6265),
   not a list that grows with our routes. No name sits on
   both sides of the fence, so sorting by name merges the
   hoisted lines back and rebuilds each message exactly:
   every byte stays stored. SCHEMA.md's secrets section
   takes that rule when this ships. Moving the `code`
   breaks the one reader of response bodies, so this item
   carries the repair: the grant finds a code today by
   searching authorize responses for it
   (`getAllWhereBody`, `api/authentication.ts:1253-1254`,
   its only caller; GIN `message_pairs_body` — examination
   report) and reads `client_id` and `code_challenge` from
   that pair's request (`:1257-1268`). Authorize lands a
   PUT
   document named `sha256(code)`
   (`deriveAuthorizationCodeId`) holding `client_id` and
   `code_challenge`, in the same multi-row INSERT as its
   own pair — its `request` zero bytes, its state in
   `response`, the message `fa_api` may read (item 2);
   the grant reads it by name and takes the
   issue instant from that pair's own response stamp —
   today's grant reads the pair's arrival stamp
   (`api/authentication.ts:1269-1273`) — because a copy in
   the document would be a second source on a second
   clock. Redeeming a code lands a successor to its
   document in the grant's statement, so the one-successor
   index below lets one redemption win and refuses the
   rest, where a spent marker re-checked inside a
   transaction does today (`authorizationCodeSpent`,
   `api/authentication.ts:1288-1300`). The body search,
   its index, and `message_body`
   (`api/schema-postgres.ts:31-46`, `:55-57`) lose their
   last reader and retire here, which keeps the DDL claim
   below true; item 1 makes such pairs the rule. So does
   `message_pairs_replay`
   (`api/schema-postgres.ts:53-54`), whose two readers
   (`api/message-pair.ts:456`, `:723`) leave with the
   dedupe below.
   Idempotency is the
   verb's (RFC 9110 §9.2.2): a PUT or DELETE that would
   leave the head's state unchanged lands nothing, and a
   repeated POST or PATCH is a new request that runs again
   — its only write is its sibling PUT (item 1). Nothing
   dedupes requests. Every write is ONE statement, guarded
   by a constraint, never by a transaction or a lock: the
   INSERT mints `response_at` from `clock_timestamp()`,
   splices it in as `date`, and computes every hash with
   Postgres's `sha256` over the bytes it stores — the
   stamp and the hashes are made where the row is made, on
   the one clock. `request_at` leaves the row: it is the
   app's clock (`nowUtc()`, `incomingContext`), a second
   clock beside the stamp, a sibling PUT and a seed pair
   received nothing to stamp, and after this item and
   item 1 nothing reads it — the grant's `issuedAt`
   (`api/authentication.ts:1273`) moves to the response
   stamp above, the flow undo's join
   (`api/derive-flows.ts:289-302`) moves to
   `operation_id`, and the logs read the context. A
   received request's arrival stays a log fact, joined to
   its pair by `request-id`. The stamp also obeys the
   succession the
   index enforces: the INSERT takes the later of
   `clock_timestamp()` and its predecessor's stamp plus
   one microsecond — a stored row whose stamp the api may
   read (item 2) — so a document's stamp order never
   contradicts its succession, and every read keeps the
   stamp: the head is the newest stamp at the document
   (`api/backend-postgres.ts:477-547`), as today.
   Measured, 18.6: with the bare clock, a step back
   leaves a successor stamped before its predecessor,
   reads serve the predecessor, every blind PUT names it
   and is refused, for good, and under item 2's policy a
   re-added PII pair is refused or lands hidden as a head;
   with the rule the successor lands one microsecond after
   its predecessor and, after a step back of N, that
   document's stamps and its `date` run up to N ahead of
   the clock until it catches up. Inside one statement the
   clock never steps back but ties — 149,680 of 200,000
   minimal rows, 0 of 200,000 rows carrying 300 bytes and
   two uuids — and a predecessor landing in the same
   statement is not visible to it, so a seed's chains
   take their order from more than the clock: the seed
   lands by depth — every genesis, then every second
   version, then every third, each statement seeing the
   last one's rows inside the one transaction — with the
   one INSERT text the api and `migrate` use, so the
   index and the head selection guard the seed as they
   guard the api. Item 3's
   full check walks every succession and names a pair
   stamped before its predecessor. The hashes form a
   tree. Each leaf —
   `request_hash`, `secret_hash`, `response_hash` — is
   `sha256(salt ‖ bytes)`, its salt stored and fenced with
   the bytes it hides: a bare digest of guessable bytes is
   a guessing oracle, and a fast hash of a request that
   held a password would sit beside the scrypt hash and
   undercut it. `pair_hash` is `sha256` over the envelope
   columns and the three leaves, so every reader verifies
   the root from what it may see, and a reader who sees a
   leaf's bytes and salt verifies that leaf too. The
   root's input is fixed by the design, never by a
   session's `DateStyle`, `TimeZone`, or `bytea_output`:
   each envelope column — `id`, `operation_id`, `path`,
   `name`, `supersedes`, `requester_identity_id`,
   `method`, `response_at` — then each leaf, in DDL
   order, as a netstring (`length:bytes,`) of its
   canonical text — a uuid as Postgres prints it, the
   stamp RFC 3339 zulu with six sub-second digits, a
   digest hex — all concatenated and hashed as UTF-8,
   the same string built in TypeScript for the memory
   backend. The
   three salts, `request_salt`, `secret_salt`, and
   `response_salt`, are 16 random bytes each, minted by
   the handler (`crypto.getRandomValues`) — one minting
   site for both backends — held in a `bytea` column
   beside the leaf's bytes under
   `CHECK (octet_length(x) = 16)`, and handed to the
   INSERT as parameters, like the bytes themselves. All
   four digests are `bytea` under
   `CHECK (octet_length(x) = 32)` — what `sha256()`
   returns, stored as is; hex appears only where a
   message body carries a digest (item 3). Today's
   `request_hash` is hex `text` under a `{64}` check
   (`api/schema-postgres.ts:17-19`). Row
   hashes stay independent — no chain: the root covers the
   `supersedes` id, never a predecessor's hash — so
   erasure stays possible. Every PUT and DELETE names the
   pair it supersedes; a genesis supersedes the ROOT, one
   row seeded with the schema under the nil UUID, so the
   column is NOT NULL and no sentinel exists. A received
   POST or PATCH names the head its `If-Match` named —
   the state it acted on — and a creating POST the root,
   as its sibling genesis does, so the column means one
   thing on every pair; the sibling PUT supersedes that
   head, and the index, over PUT and DELETE alone, sees
   the sibling and never the pair beside it.
   `supersedes` is not an enforced
   reference: the physical eraser in `## Later work` must
   be able to remove a superseded pair, and nothing may
   rewrite its successor, whose root covers `supersedes`;
   a `supersedes` that names no row means that pair was
   erased, and the ROOT row keeps that the only meaning.
   One unique index carries the invariants —
   `UNIQUE (path, name, supersedes)` over PUT and DELETE
   pairs: one successor per predecessor within a
   document, so the root, named by every genesis, has one
   successor per document and no document two geneses.
   `supersedes` is a column of the pair, never a join
   table: this index needs `path`, `name`, and the
   predecessor in one relation, and a join table could
   hold them only by copying the two names in.
   The root is a real pair, `/migrations/0000-root` —
   item 3's collection, the owner's alone — a PUT that
   names itself: `request` zero bytes, `response` a 201
   whose body is the digest of zero bytes, `fa_owner`
   its requester, the seed's `operation-id` its
   operation; it passes every CHECK as any pair does,
   its own index entry,
   `('/migrations/', '0000-root', nil)`, is the slot a
   successor would need, so the index refuses one
   forever, and boot counts it as the zeroth name of
   the set it compares (item 3).
   The index cannot tell a predecessor from an invented
   id or another document's pair, so the INSERT selects
   its predecessor as this document's head — the newest
   PUT or DELETE at `(path, name)` — and an in-order PUT
   (`If-Match`) adds `head.id = If-Match`: a stale,
   foreign, or invented latch selects no row and lands
   nothing, which answers 412, and the index refuses the
   second of two writers who read one head, which answers
   412 too — what `lockHead` and a fresh head read do
   today (`api/message-pair.ts:779-790`). A blind PUT
   selects the head without the predicate and retries,
   bounded, when the index refuses it; a genesis selects
   the root where no head exists. The memory backend
   raises the same rejections in TypeScript. Composed
   writes are one
   multi-row INSERT; the bell rings from the same
   statement (`RETURNING` into `pg_notify`). `transaction`
   and `writeLocks` leave `DbAdapter`; item 13's "advisory
   locks already cluster-wide" loses its referent. A seed
   is one of the two transactions left — item 3's release
   is the other, on the same owner-side writer — and it
   needs no adapter
   primitive: it opens on the client beneath the adapter
   and holds the DDL, the root row, and every pair, in
   multi-row INSERTs batched at half the 65,535
   parameters Postgres allows a statement — rows per
   statement `floor(65535 / 2 / n)`, `n` the INSERT's
   own parameters per row, both named, no number picked
   by hand — because the
   seed will grow; the driver's multi-row helper serves
   under item 2's `fetch_types: false` (measured: 5,000
   pairs in ten statements, and a failed batch left no
   table). A failed seed leaves nothing, not even
   a table — DDL, role switches, and batches roll back
   together (measured, 18.6) — and every pair is formed
   and every credential hashed before it opens. Today a
   seed commits three times and then stamps
   `schema_marker`: the DDL outside any transaction
   (`api/backend-postgres.ts:86`), the dataset
   (`api/mock-data.ts:358`), the credentials
   (`api/mock-data.ts:285`), the marker
   (`api/backend-postgres.ts:107-113`). The DDL is
   final when this item ships, but for `schema_marker`,
   which item 3 retires. Today falls short on every count:
   `request` keeps six header names
   (`HOISTED_HEADER_NAMES`,
   `api/message-pair.ts:555-558`), `authorization`
   verbatim among them, a body parsed and re-serialized
   with sorted keys, and an `operation-id` line the client
   never sent when one is missing
   (`headerFieldsWithOperationId`,
   `api/message-pair.ts:191-202`); the library sorts lines
   but never joins repeats
   (`shared/http-message/canonical.ts:13-25`), and strips
   and recomputes `content-length` (`isStoredField`,
   `shared/http-message/framing.ts:11-14`); `response`
   keeps a 200 rewritten to 201 at send time and a
   `response-id` field naming the id the wire sends as
   `ETag`; `api/message-pair.ts:288` computes the response
   hash and nothing stores it, and no hash is salted or
   covers the envelope; the password rides the authorize
   body (`api/authentication.ts:1558`); and 69
   `transaction(…)` sites, three lock primitives — two
   advisory labels and a `FOR UPDATE`
   (`api/backend-postgres.ts:220-246`) — and a
   request-hash dedupe (`appendMessagePairOnce`,
   `api/message-pair.ts:718-729`), behind which
   `api/api.ts:968-974` answers a byte-identical request
   from the first, guard what one index and
   the verbs will. Each lock has its successor: the
   request lock leaves with the dedupe; the document lock
   and the `FOR UPDATE` latch with its fresh head read
   (`api/message-pair.ts:769-790`) become the index and
   the predecessor-as-head statement; and the assertion
   jti's document lock (`api/authentication.ts:1152-1172`)
   guards a genesis at `authentication/assertion-jtis/`,
   which the index refuses a second time. Rides along:
   the in-band plaintext
   comment at `api/mock-data.ts:145-157`, which still says
   PBKDF2 and names a column that is not there (owner
   call); and the two ids, each with one source.
   `request-id` names one wire request: the server mints
   it, always, returns it in every response, and refuses
   one: a request that carries `request-id` answers 400
   and lands nothing, on every route, so no client's id
   is ever answered with another in silence — the gate
   refuses what it will not honor, as it requires the
   `operation-id` only the client mints. The store ships
   `fa_request_id_of(response)`, an `IMMUTABLE` extractor
   of the `request-id` line — a function of the bytes,
   as `message_body` is today
   (`api/schema-postgres.ts:31-46`) — and an index over
   it, `fa_message_pairs_request_id`, so a pair is found
   by `request-id` through the index with the id in one
   place, under the root through its leaf, and no
   column repeats it; nothing reads it yet, and item 6's
   log join is its first reader. Today the
   server takes
   the client's when it is valid and mints one otherwise
   (`incomingContext`, `api/request-context.ts:66-71`),
   answers 400 to a malformed one on an authenticated
   route alone (`api/api.ts:443-456`), returns it in no
   response, and reads it at two error-log sites and
   nowhere else (`api/api.ts:346-352`, `:2062-2068`).
   `operation-id` names one client operation: the client
   mints it, always, and it rides every request the
   operation makes, reads included, and lands on every
   pair those requests write — so a login's authorize and
   token pairs, or a 401 with its refresh, its exchange,
   and its resend, read as one operation in the ledger and
   in the logs, which carry both ids. The gate requires it
   on every request but `/status` (item 4): today it skips
   reads and the two bearer-exempt routes
   (`requireOperationId`, `api/message-pair.ts:156-189`),
   and a side channel reads it `?? ''`
   (`api/api.ts:1634-1636`). It stops naming one write,
   and one reader depended on that: the join from a PATCH
   pair to its revision (`revisionMessagePairIdForPatch`,
   `api/api.ts:309-328`), there only to attach the
   revision's ETag — its replay caller (`api/api.ts:981`)
   leaves with the dedupe, and its other caller
   (`api/api.ts:1746`) leaves when item 1 lands both pairs
   in one statement, the handler having minted both ids.
   It serves no idempotency: nothing looks a request up by
   it. Three client call sites send no id at all, each a
   raw `fetch` of `POST authentication/token` with
   `Content-Type` alone: `postCookieRefresh`
   (`web-app/app/adapters/http-facade.ts:199-220`,
   `grant_type: 'refresh'`), `postOrganizationExchange`
   (`web-app/app/adapters/http-facade.ts:222-249`,
   `grant_type: 'token-exchange'`), and
   `probeRefreshSession`
   (`web-app/app/apex-destination.ts:25-40`,
   `grant_type: 'refresh'` again, a second copy of the
   first). Each sends the `operation-id` of the operation
   whose 401 started the recovery, or a fresh one where no
   operation exists yet (the apex probe). The client mints
   `operation-id` in one place, once per operation, and
   takes none from a caller — its per-context `requestId`
   (`web-app/app/adapters/shared.ts:184`) already spans an
   operation's requests and becomes it. Five sites mint
   one per write unless supplied, and no caller supplies
   one — `web-app/app/adapters/shared.ts:185-198`;
   `web-app/app/adapters/http-facade.ts:161-166`, behind a
   `write` flag the verb already implies; and the
   in-process facade at `api/api.ts:2204-2207`,
   `:2478-2481`, and `:2511-2514`. Meets the JSON
   parse/stringify bullet in `## Later work` and the
   hash-and-verify half of its verifiable-ledger bullet;
   the brainstorm says what is left of each.
1. State arrives by PUT, and the application reads the
   response as a unit — every PATCH, and every POST that
   changes state, lands a sibling PUT in the same
   statement under the same `operation_id`, as instance
   PATCH does today (`postInstancePatchOp`,
   `api/routes.ts:3745-3761`). POST has two kinds: one
   changes state and is stored in PATCH's style; the other
   only reads — a convenience over GET, joined or computed
   by the database or the server — and stores nothing, as
   a GET stores nothing. A write that derives its state
   from a head is in-order: a PATCH or a state-changing
   POST carries `If-Match` naming the head it read, its
   sibling names that head, a missing latch answers 428
   at the gate (RFC 6585 §3), a field its writer may not
   change (`api/attribute-acl.ts:43`) answers 403 at the
   gate and lands nothing, and a refused sibling — the
   index's, when two derive from one head — refuses the
   whole statement and answers 412, after which the
   client resends from a fresh read, as the retries
   bullet permits; nothing re-fills `supersedes` around
   a stale body, which would drop the winner's change,
   and only the blind PUT retries on the server, since it
   derives nothing. A POST that creates a document is a
   genesis and carries no latch; two creates of one name
   are refused by the index and answer 409. Every unit a
   client reads carries its `etag`, so the client always
   holds the latch. A PATCH or POST that would leave
   the head's state unchanged stores nothing at all, as
   item 0's PUT does: neither its own pair nor a sibling
   lands, and it answers 200 with the head's unit, as that
   PUT does. Today a no-op claim still stores its pair
   (`api/routes.ts:1919-1923`) and a no-op PATCH appends a
   version and answers 201
   (`tests/api-instances-create.test.ts:578-614`).
   Sameness is judged on responses — the candidate
   response body against the head's response body, whole
   against whole, never a projection — never
   on the stored request bodies the check reads today
   (`api/api.ts:1341`). A sibling PUT is synthesized —
   nothing was received for it and nothing sent — so its
   `request` is zero bytes and its `response` is the
   message a read of it will serve, formed whole by the
   handler
   in the same statement: its own status line, `date`
   spliced from its own stamp as every pair's is, `etag`
   naming itself, the two ids, `content-type` and
   `content-length`, and the WHOLE state as body — every
   field, whatever its writer may read, as the
   document's validator orders it with `id` last, so a
   read adds nothing — for a PATCH usually the wire's
   own bytes, for authorize's code document (item 0)
   and the token grant's `tokens/:jti` a message the
   wire never carried, the token document's issued,
   rotated, and revoked events each landing the whole
   state so the fold that resolves them
   (`api/derive-identity-tokens.ts:14-26`) retires; the
   requester's own response is that message projected
   (below); and the handler mints both ids, so nothing
   looks
   the sibling up afterward (item 0 retires
   `revisionMessagePairIdForPatch`). The PATCH revision
   and the token grant's `tokens/:jti` pair become such
   pairs; the revision's synthesized request
   (`api/routes.ts:3724-3743`) — `If-Match`,
   `operation-id`, and the body's framing lines, not the
   `[]` its comment claims — retires with them.
   Work-order create and transition (POST), claim and
   binding (PUT), and release (DELETE) each land a PUT of
   `work-orders/:id`, derive reads the head, and
   `replayWorkOrderOperations` retires — a faithful
   conversion, nothing item 11 will add; claim expiry
   stays decided at read time
   (`isExpiredAsOf`, `api/derive-states.ts:658`, applied
   at `:754` and `:850`), recording it is item
   13's. The login code's document is already such a pair
   (item 0). Flows keep their
   event walk until item 11, and the undo's join of an
   undo pair to its document pair moves from equal
   `request_at`, which item 0 drops, to the
   `operation_id` both carry
   (`api/derive-flows.ts:257-263`, `:289-302`). A read
   hands out the stored
   response whole: a document GET is the stored bytes with
   three substitutions — the status line (201 → 200),
   `date`, and `request-id`, the lines that describe this
   transmission; `etag`, `content-type`, the body, and the
   `operation-id` of the write that made the state stay —
   made by ONE function on the head, the body
   bytes untouched but for one projection: a document
   whose fields carry read roles
   (`api/attribute-acl.ts:33`) is served with the fields
   this reader may read, by that same function, the
   only place a body is ever transformed, and every
   projection of one head carries the head's `etag`,
   which names the state the client acted on — what
   `If-Match` needs — and is safe under `no-store`;
   a collection GET is `multipart/mixed`,
   each part an `application/http; msgtype=response` unit
   with the same three substitutions and the same
   projection, so one head is one
   unit from either source. The boundary is a fresh
   UUID minted per response — 36 characters of
   RFC 2046 §5.1.1's alphabet, under its 70 — so no part
   can contain it, and the joiner and the splitter live
   in `shared/http-message`, beside the parser every
   part goes through: one library for both sides, and
   the client's only dependency outside its own
   directory. Measured on the
   mock data against today's arrays of bare bodies, a part
   costs 293 bytes, 215 of them the stored response's own
   lines: lists grow 33% in all — a tenth for large
   documents (flows, work orders), while most small ones
   double or triple — and gzipped, which nothing at the
   origin does today, they double, because each part's
   three ids do not compress. A JSON array of the same
   bytes as strings measured larger (38%), and a rebuilt
   JSON form is a second representation, so multipart
   stands. A before-and-after
   `./bin/measure --record --visualize` run on the
   list-heavy pages adds both sets of numbers to the
   history, gating nothing. Derivation is head selection;
   whatever still needs a body reads it in place from the
   unit, never from `request`. A collection's heads come
   from a skip walk of `message_pairs_document` — a
   recursive query that asks the index for the next name
   after the last, then one head read per name — one
   probe per document, where today's `DISTINCT ON`
   (`api/backend-postgres.ts:523-547`) reads every entry
   at the path, so its cost is every version of every
   document there. The walked heads are then sorted by
   `response_at, id`, the order today's read serves
   (`api/backend-postgres.ts:545`) — a small set — so the
   contract and the memory backend stay as they are.
   Measured on 18.6, owner on the bare
   table, 300-byte responses, medians of seven: 200
   documents at 10 / 250 / 2,500 versions read 0.51 /
   30.63 / 130.71 ms today and 1.11 / 1.43 / 1.93 ms by
   the walk, 2.15 ms through item 2's fence; the walk
   loses where documents are many and shallow — 10,000
   of one version, 4.54 ms today against 39.48 — and
   breaks even near 15 to 20 versions a document, a
   depth documents are expected to pass. Both reads use
   the index item 0 freezes; `EXPLAIN` pins the plan and
   the memory backend is untouched. The API client keeps
   each
   response whole, and pages and presenters read from the
   unit they were given; the packageable client closes
   in this rebuild, since the rebuild touches every file
   its three couplings name: `web-app/app/adapters/` is
   the client in all but boundary — one transport facade
   (`http-facade.ts`), a `RequestContext` passed first
   (`shared.ts`), per-noun adapters named by HTTP verb,
   57 files and about 10,000 lines — and it imports the
   server (37 files reach into `api/` for types, errors,
   and header names — `OPERATION_ID_HEADER` from
   `api/message-pair.ts`, `REQUEST_ID_HEADER` from
   `api/request-context.ts`, `MissingTableError` from
   `api/db.ts` — so the wire contract moves to
   `shared/`, which never imports `api/`), imports the
   app (24 files reach into `web-app/app/` — the facade
   navigates to the login page on a failed refresh
   (`web-app/app/adapters/http-facade.ts:286-292`), and
   `shared.ts` redirects, logs, and records page request
   profiles — so navigation, logging, and profiling are
   handed in at construction), and holds a singleton
   (`facade-holder.ts` keeps one module-level facade, so
   two origins or two sessions cannot coexist; the
   facade becomes an instance its caller owns); the
   barrel (`web-app/app/adapters/index.ts`) re-exports
   API nouns beside clipboard, viewport, location, and
   resize-observer adapters, and the client's barrel
   exports the client alone; three raw fetches bypass
   the facade (item 0's rides-along names them), and
   auth recovery lives at two layers (the retries
   bullet on the critical functionality path); the
   rebuilt client imports nothing from `api/` or the
   app, and its oracle is a test that walks the client
   entry point's import graph and finds no module
   outside the client's directory and `shared/`.
   ARCHITECTURE.md gains a NAMED COVENANT,
   `## A response is one unit`, in the commit that makes
   it true and not before — that file states only what is,
   and today the facade's `GETWithEtag` and `PUTWithEtag`
   twins and `unwrapResponse` part every response
   (`web-app/app/adapters/http-facade.ts:32,44,80`). Its
   approved wording: "The API, the client, and the
   application treat a response — status line, headers,
   and body — as one unit. A stored response is a
   response message: for a received request, the message
   handed to the wire; for a sibling PUT, which received
   nothing and sent nothing, the message a read of it
   serves. A read serves those stored
   bytes with exactly three substitutions — the status
   line, `date`, and `request-id`, the lines that describe
   this transmission — made by ONE function on the head;
   `etag` and `operation-id` stay, naming the state and
   the write that made it; the body
   bytes are never touched, except that a document
   whose fields carry read roles is projected to the
   fields the reader may see, by that same function,
   the only place a body is ever transformed. A list is
   whole responses:
   `multipart/mixed` of
   `application/http; msgtype=response` parts, each the
   unit a document GET serves. Nothing parts a response
   into a body plus picked headers. The client keeps each
   response whole, and pages and presenters read from the
   unit they were given. The application derives from
   `response` only, never from `request`." The landing
   commit adds the file references: the one read function
   and the client's splitter. A per-route audit proves
   each PUT
   response carries what its readers need; a gap closes by
   the response saying more — the mock data already shows
   one: a record instance's revisions store `{}` as their
   response body and their content in the request. API
   tests pin the headers a read serves and the headers it
   must not. Today: the five work-order operations answer
   204 and keep their state in their own request bodies
   alone (`api/routes.ts:3001-3014`, `api/api.ts:880-881`;
   `api/derive-states.ts:605-629`);
   derivation reads the request body at five seams
   (`api/derive-documents.ts:95,159`,
   `api/document-family.ts:396,473`,
   `api/routes.ts:5088,5303`, `api/api.ts:1341`, and the
   work-order decoder `api/derive-states.ts:615-617`
   behind seven callers), item 0
   having closed the grant's; a document GET parses
   the stored response, keeps the body, and rebuilds three
   headers, dropping `Operation-ID` on purpose
   (`streamGetFromStored`,
   `api/message-pair.ts:606-636`); a collection GET
   dismantles every head into an array of bodies
   (`entitiesOf`, `api/message-store.ts:59-68`); and the
   client receives bare JSON. The per-route audit —
   which POSTs change state and gain `If-Match`, which
   are read-only conveniences, and what each PUT
   response must say for its readers — is the spec's
   first section, written from the code as item 0
   leaves it. Merged: the API client, packageable (the
   critical functionality path), which keeps its
   oracle. Follows item 0.
2. The ledger fenced — roles, grants, and row policies, on
   a table items 0 and 1 have finished. Designed to stock
   Postgres and measured on 18.6, which compose runs; a
   host is measured against the design afterwards, and a
   shortfall is that host's recorded seam or a reason to
   leave it, never a change to the application. Every
   worker gets its own role, holding only its verbs on
   the columns it needs — grants and policies bind the
   role that queries, so the table itself is the place
   for them, and a view is only ever a device (measured:
   the whole fence below holds on the table with two
   roles). Product roles cannot log in and hold every
   grant; a deployment supplies logins under its own names
   and joins each to one role — a grant only the role's
   creator or a superuser may make (measured), so it runs
   as `fa_owner` — so the DDL is identical on every host
   and only memberships and secrets are the deployment's.
   Every role and login of ours carries the `fa_` prefix
   (the naming bullet on the critical functionality path).
   Roles belong to the cluster: they outlive the wipe's
   schema drop, every database in the cluster sees them,
   and creating one twice fails (measured), so what
   creates them checks first. `fa_owner` owns the
   database, the schema, the DDL, the root row,
   `schema_marker`, seed, and wipe, and holds the right to
   create roles, so it creates the other `fa_` roles too
   and no separate admin role exists; a member does not
   inherit that right, so every owner session first
   becomes `fa_owner`, which also makes `fa_owner`, not
   the login, the owner of what it creates (measured).
   `fa_api` — today's `fusion` split in two with
   `fa_owner` — holds INSERT on the table and SELECT on
   its unfenced columns, and no other right on it:
   Postgres wants SELECT on every column `RETURNING`
   names (measured), and a column grant is exactly that,
   so item 0's one statement hands its minted `date` back
   with no view between. The column fence is that
   grant: `fa_api` never reads back
   `request`, the fenced credential column, or the request
   and secret salts; it reads the response, the response
   salt, and all four digests, so it verifies `pair_hash`
   and the response leaf, and a reader of envelopes alone
   verifies the root alone. `requester_identity_id` — the
   verified token's `sub` — stays readable. No read may
   use `SELECT *` (one does,
   `api/backend-postgres.ts:538`), and every read stops
   selecting `request`, which item 1 made sure nothing
   needs. Removing PII stays a tombstone, and the fence
   hides every `identities/:id/pii` pair that precedes a
   DELETE at its document; the DELETE head stays visible,
   and every other family keeps its deleted history. A
   hidden pair is never a head, so a blind PUT always
   finds the head, and an in-order PUT that names a hidden
   pair is refused by item 0's index and answers 412:
   nothing needs a hidden pair back. The hiding rule is a
   row policy on the table bound to `fa_api`, and a
   helper view of the PII DELETE pairs, `fa_pii_deletes`,
   owned by `fa_owner`, keeps the policy
   from reading its own table, which Postgres refuses as
   recursion (measured): the view runs with its owner's
   rights, the owner is exempt, and the planner still
   inlines it. Row security refuses `fa_api`'s
   inserts until a second policy admits them (measured),
   and item 3 narrows that policy to keep `/migrations/`
   the owner's. A table's owner is exempt from
   its policies, so views `fa_owner` owns still see
   the hidden pairs the eraser needs. Measured on 262,000
   rows against the owner reading the bare table: at
   50,000 versions a head read through the policy costs
   0.062 ms against 0.049 ms (+0.013 ms, +27%), flat from
   10 versions up; the same rule in a security-barrier
   view costs 15.375 ms (+15.326 ms) and grows 0.3 µs a
   version, because a barrier view cannot merge into the
   outer query and its ORDER BY and LIMIT never reach the
   index; a plain view is as fast as the policy and does
   not hold the rule against a session that writes its own
   SQL (measured). The mock data cannot judge this: 577 of
   its 578 documents have one version. `EXPLAIN` and
   `./bin/measure` prove the head read stays on
   `message_pairs_document`. The memory backend hides the
   same pairs in TypeScript. Item 7's profile can be
   removed on its own only as its own document: keys on
   the seat body would hide the seat's whole history. The
   reduction takes back what Postgres grants every role.
   `fa_owner` revokes CONNECT and TEMPORARY on the
   database and every right on the schema from PUBLIC and
   grants CONNECT and USAGE to `fa_` roles alone, so a
   foreign login — one that belongs to none of our roles —
   cannot connect, and `POSTGRES_DROP_SCHEMA`'s
   `GRANT ALL … TO public` retires
   (`api/backend-postgres.ts:29-33`,
   `tests/backend-postgres.test.ts`, the re-grant). Four
   revokes from PUBLIC need a superuser and only warn for
   the owner (measured): `plpgsql`; large-object creation;
   the 21 advisory-lock functions, only once item 0 has
   removed the product's last use
   (`api/backend-postgres.ts:286`); and catalog reads,
   returned to `fa_owner`. With catalog reads gone the
   driver's type lookup at connect is refused and its
   unhandled rejection ends the process, and with
   `fetch_types: false` the api's statements work
   (measured, postgres.js 3.4.9), so
   `api/postgres-client.ts` sets it; product SQL passes no
   arrays today. After the reduction a member of `fa_api`
   connects, uses the schema, inserts into the table,
   reads its unfenced columns, and may LISTEN and NOTIFY,
   which are commands and not grants — nothing else. One
   owner verb, `migrate`, makes a cluster and its database
   match this
   build's fence, as `fa_owner`: fixed SQL beside the DDL,
   no input, safe to run again. It creates the `fa_` roles
   that are absent — roles belong to the cluster — and
   revokes CONNECT and TEMPORARY from PUBLIC on the
   database, which outlives a wipe; where our table
   exists it applies, in name order, each migration its
   binary carries and the database lacks — every one an
   owner transaction of its change, item 3's full check,
   and its document's genesis — and lands nothing where
   the two sets already match; where it does not,
   it says seed is next; and, as `check` does, it
   verifies the four superuser revokes below and names
   which PUBLIC still holds — information, never drift,
   since the owner cannot make them. The schema's
   objects die with the
   schema, so seed builds the fence inside its one
   transaction — one fence function, two callers — and
   wipe drops it and leaves the roles. Two steps stay with
   the host's first login:
   creating `fa_owner`, its login, and the database it
   owns, and the four superuser revokes; the container
   image's `POSTGRES_USER` is always a superuser
   (measured), so compose has such a login, `fa_root`,
   and `fa_api`
   must never be it; a host that offers no superuser
   keeps the four as its recorded seam, since none of
   them touches what the fence guarantees, and serves.
   Each verb reads `FA_POSTGRES_URL`
   from its own environment and only the value differs:
   `serve` gets a member of `fa_api`; `seed`, `wipe`,
   `migrate`, and `check` get a member of `fa_owner`. The
   product never
   creates a login and never handles a database password.
   This item creates the roles whose workers exist —
   `fa_owner` and `fa_api` — and names
   the next users of the principle, each created by the
   item that builds its worker: `fa_archiver` (item 6),
   `fa_eraser` (the physical-erasure bullet), and
   `fa_reporter` (its bullet in `## Later work`). Until
   the eraser ships, the page says the personal
   information is removed from the application, never
   erased or deleted: today the button
   (`web-app/app/presenters/identity-detail.ts:284-292`)
   and the dialog and its sentence
   (`web-app/identities/detail.html:3-28`) say "Erase",
   and the code's
   own word `erased` becomes `deleted`, HTTP's verb for
   the DELETE head that made the state, in a change of
   its own. Every
   byte stays recorded; roles fence live readers only, so
   a dump or backup carries the table whole, and item 6 no
   longer orders this item. This item changes no row and
   no column, and a test says so. Oracle: a Postgres test
   logs in as a member of `fa_api` and is refused every
   verb but its two. KNOWN seams "A raw dump still has
   verbatim auth messages" and "Erased PII persists as
   superseded pairs" are reworded, not closed: the bytes
   persist in the owner-only ledger, and `fa_api` reads
   none of them. Today: one role,
   `fusion`, owns and reads everything, and compose,
   `./deploy --local`, `bin/test-postgres`, and the tests
   all assume that one login (`compose.yaml:2,8`,
   `deploy:171`, `bin/test-postgres:22`); every write
   pair's `request` holds `Authorization:` verbatim
   (`tests/api-shadow-ledger-auth.test.ts` 'live secrets
   land in the auth-flow ledger rows'). Follows items 0
   and 1.
3. Retire `schema_marker` for migrations the ledger
   holds — the marker (`api/schema-postgres.ts:26-29`)
   proves only that a seed once finished; it cannot tell
   an unwiped database with the old `text` stamp columns
   from a correct one (SCHEMA.md § Operator tools). Each
   migration becomes a document like any other — the same
   canonical form, hash tree, succession index, and head
   read (item 0) — in the collection `/migrations/`, named
   for what it does behind a four-digit order,
   `0000-root` (item 0's root) then `0001-bootstrap`,
   that the owner writes and no
   route serves; one document with successors would hold
   the same history under a name that hides it. A
   migration's `request` is the SQL that ran —
   the whole definition for `0001-bootstrap`, the drops
   and the new fence for a later one — as the body of a
   PUT whose `user-agent` line names the build that ran
   it, `fusion-angle/<sha>` (RFC 9110 §10.1.5; the build
   embeds `git rev-parse HEAD`, having refused a dirty
   tree), provenance the owner's `check` can report and
   never the key; and its `response`
   is the digest of its fixed SQL, DDL and DML
   alike — `sha256` over the request body alone, the SQL
   exactly as the binary holds it, UTF-8, statements in
   run order joined as the module joins them, no
   normalization, hex in the response body, so boot
   digests its own strings the same way and the root's
   is the digest of zero bytes —
   the root row's insert and the grants count, and
   a seed's data pairs, which are parameters and vary by
   mode, do not. Item 2's fence does the rest: `fa_api`
   reads the digest and is refused the SQL, as it is every
   `request` (measured), so the catalog reads item 2
   closed stay closed. The stored SQL is a receipt, never
   an input: nothing executes SQL read from the ledger,
   and every step comes from the compiled binary, as
   `api/schema-postgres.ts:1-2` already rules for the DDL.
   No route ever executes a body's SQL: that would put the
   owner's credential in the serving process and turn
   every authorization mistake into the owner's SQL. Seed
   lands the root and `0001-bootstrap`, a genesis, in its
   one transaction (item 0). A later migration is one
   owner transaction — the change, the full check, and
   the genesis of its own document, in item 0's
   one-statement shape, landed
   by `migrate` beneath the adapter, where the
   seed lands every pair (item 0) — one owner-side writer
   for seed and migration, and `handleRequest`
   (`api/api.ts:387`) stays the api's. Names order
   migrations, bytewise: the verb applies its binary's
   migrations in name order and refuses one whose
   predecessors lack a head. Item 2's insert
   policy binds `fa_api`, which the adapter's fixed SQL
   runs as, and a table's owner is exempt from its
   policies, so `/migrations/` is refused to the
   api and open to the owner's writer (measured, 18.6).
   What
   the verb forgoes is the route layer's validation of
   that one PUT; the canonical form and the hash tree
   come from `shared/http-message` and the INSERT, which
   the seed uses there already. Item 0's index refuses a
   second genesis
   with no lock and no migrations table of its own: of
   two runners applying one migration, one commits and
   the other is refused and rolls back, its DDL included,
   and a failed step leaves the old fence and no document
   (both measured, 18.6, on a successor; a genesis is the
   same index's other case). Only the owner writes a
   migration:
   item 2's insert policy refuses its path to `fa_api`
   with one predicate, so a wire request cannot land
   one, and a table's owner is exempt from its policies
   (measured). After launch the fence is what changes —
   item 0 holds the table's DDL final — and views,
   policies, and grants hold no data, so a migration
   rebuilds them whole and needs no path from one
   fence to the next. Boot — `serve`, as `fa_api`,
   where the marker gate runs today (`server/boot.ts:106`)
   — does two small things. It asks what it holds itself
   through the privilege functions, which answer with
   catalog reads revoked (measured), and refuses to serve
   if it can read `request` or the credential column,
   update, delete, or
   make temporary objects — the rights the owner
   controls; the four superuser revokes it never
   checks. And it reads the
   `/migrations/` heads — a collection read (item 1) — and
   compares their names and digests with the migrations
   its binary carries, refusing to serve on any
   difference either way and naming it. The digest is of
   text, so a landed migration's SQL is never edited: the
   binary carries it verbatim, and a change is the next
   migration. "The sets are equal" means an owner verb of
   this exact build verified this database
   and recorded it. The full check runs as `fa_owner`,
   never at boot: it reads the live definition from the
   catalog — `information_schema.columns`,
   `pg_get_constraintdef`, `pg_get_indexdef`, the root
   row, and item 2's objects: the roles, `fa_api`'s
   column grants, the helper view, the row
   policies, and what PUBLIC holds —
   compares it to what the binary's migrations, applied
   in name order, declare, and
   names the drift, and walks every succession to name a
   pair stamped before its predecessor (item 0). The
   expected list lives beside the
   DDL, and a digest lands only after the check passes, in
   the same transaction, so every seed proves the list
   current. Drift made by hand afterwards is the full
   check's to find, not boot's (measured: the head reads
   the same after a column is added by hand). `SCHEMA.svg`
   loses `schema_marker`. A seed is one transaction (item
   0), so a failed seed leaves nothing and the last-stamp
   trick has no purpose; a seed refuses a database that
   holds our table at all, since one lands it whole or not
   at all. The full check is also a verb of its own,
   `check`, which
   changes nothing and exits nonzero on drift, because
   item 6's restore drill must verify and never repair —
   one check function with three callers: `seed`,
   `migrate`, and `check` — and the drill runs
   it instead of reading
   the marker. Limits, named for the
   table-migrations bullet in `## Later work`: boot's
   strict equality
   refuses an old binary that restarts after the change,
   which item 13's two processes must plan for; and a
   large index cannot ride the one-transaction step —
   built inside it, it holds `ShareLock` on the table
   until commit, and `CREATE INDEX CONCURRENTLY` is
   refused inside a transaction (measured). A migration's
   document has succession like any other, so a rollback
   can land as its DELETE head and a later system can
   annotate it without rewriting it — that bullet's to
   settle.
   Today: boot gates on
   the marker row (`assertSchemaMarker`,
   `server/postgres-gate.ts:67`, called at
   `server/boot.ts:106`), and the seed stamps it last
   (`api/backend-postgres.ts:107-113`) and refuses on it
   (`server/seed.ts:119-125`). Follows item 2.
4. `/status` — `{ up: boolean, components: { postgres:
   boolean } }`, 200 when every component is up and 503
   when any is not, built for more components.
   Unauthenticated — Render and compose probe it bare —
   so it joins the bearer-exempt set
   (`AUTHENTICATION_ROUTES`, `api/request-auth.ts:39-43`,
   is the whole set today) and becomes the one path
   outside authentication an anonymous caller can confirm
   exists: every other `/api/*` path answers 401 before
   the no-match 404, by design (`api/api.ts:437-467`). A
   probe sends no ids; the server mints its `request-id`
   (item 0). Decide: what `postgres: true` proves (a
   `SELECT 1` on a pooled connection under its own short
   timeout, not the 30 s statement timeout); that a read
   stores no pair; whether the throttle counts it and
   whether it logs. Replaces the compose healthcheck's
   `fetch('/')`, which proves static serving only. Item
   6's health probe; item 13 answers it per process.
5. A person's first sign-in — no page mints a human
   credential: the seed does
   (`api/mock-data/seed-message-pairs.ts:2609`), only
   services get a secret from the UI
   (`web-app/app/adapters/identities.ts:293`), and
   `postHumanMemberCreation`
   (`web-app/app/adapters/members.ts:222`) creates a
   member who cannot sign in. One primitive, two flows:
   a single-use, expiring, emailed link whose holder
   sets a password — sent on invitation grant (whether
   grant or the link creates the identity is the
   brainstorm's first question) and on "forgot
   password". `identities/:id/credentials/:cid` already
   accepts `kind: 'password'`; the link is the missing
   authorization to reach it. Email is an external
   service behind an adapter, its key supplied at deploy
   and never logged; the link token is a secret at rest
   under item 2's discipline. Not sign-up: a stranger
   creating an organization stays in `## Later work`
   (SP-6). Merged: invitation email delivery.
6. Operable — what a pilot tenant's data needs before it
   exists. A backup the operator has restored once:
   Render's schedule, a written restore drill, its
   measured duration, and item 3's full check passing
   afterward. `fa_archiver` adds a backup no host
   owns (item 2's principle): it holds SELECT on a view
   without the fenced credential column, cannot log in,
   exports through `COPY`, and restores onto any Postgres
   — `pg_dump` cannot serve it, because it locks the table
   and dumps a view as a definition with no rows
   (measured). A restore must fill the credential column,
   which is NOT NULL, and zero bytes is the honest fill:
   `pair_hash` still verifies on every pair, the secret
   leaf no longer does, and the api runs the same, since
   it reads no credential back. A full copy for a host
   move stays the owner's `pg_dump`. The brainstorm
   settles whether the archiver's view also applies item
   2's hiding rule, so an archive never holds removed PII.
   Cross-environment blocking, so
   `./deploy --render TOKEN --postgres mock-data` can
   never wipe the tenant database from a laptop. No
   connection reaches the database from outside its
   host's private network — essential before launch. On
   Render that is an emptied `ipAllowList`, which holds
   `0.0.0.0/0` today; the brainstorm confirms an empty
   list refuses every outside address and leaves the
   private network alone. Nothing of ours needs the
   outside door: on Render, seed and wipe already run as
   jobs inside it (`bin/postgres-seed:168-171`,
   `bin/postgres-wipe:127-130`). Item 2 refuses a foreign
   login — one that belongs to none of our roles — and
   this keeps the port out of its reach. Request and
   error logs as one JSON object per line —
   `api/api.ts:346-352` and `:2062-2068` print a label, an
   object, and an
   error as three values (the Office of Structured
   Observability wants one document with level, message,
   and request identity). One request clock, read once
   at arrival and carried in the context: the request
   log stamps `Date.now()` at accept
   (`server/http-server.ts`) while `request_at` is
   minted later in `incomingContext` after the body
   (examination report); latency must be their
   difference, not a second clock. An alert when
   `/status` is not 200 or the error rate rises.
   `TRUSTED_PROXY_HOPS` set to Render's real hop
   count. Consumes item 4. Merged:
   the throttle seam — a global cap if the hops are
   wrong, refresh and exchange unlimited
   (`tests/http-throttle.test.ts`); the `ipAllowList`
   bullet.
7. The membership profile — an organization-side profile
   per SEAT, so the identity "Tony Stark, CEO" holding a
   contractor seat elsewhere appears there as
   "contractor": the document shape (keys on the seat
   body, or a nested facet under the seat mirroring
   `identities/:id/pii` — the brainstorm decides), its
   validator, derive, seed, the roster and detail reads,
   and the Members page's edit. Replaces the
   one-profile-per-identity covenant at
   `api/types.ts:1303-1304`; the seed already carries
   the contradiction (the admin holds two seats with one
   title). Lands before items 11 and 12, whose designer
   roster and AI seats read it, and replaces the
   roster's absent profile with the read. Authored on
   the `2026-09-04-critical-functionality-path` branch;
   this is its master copy.
8. Lifecycle out of the document body — closed the other
   way by `docs/superpowers/specs/2026-09-15-retire-the-trio-design.md`:
   state stays in the document body, PUT stores it, GET
   reads it from the head, and ideas, projects,
   objectives, and record-types have no lifecycle event
   pairs. What closed: the server-side history walk over
   those four families, the `'trio'` discriminant, the
   two create-body event keys, the seed's per-entity
   state rows, the client's four `*StateDetail`
   wrappers, and the clock-skew and authorship-on-resend
   tests whose fixtures never built the skew they named.
   Flows keep their event walk and their three body
   fields until item 11 rewrites them.
9. The bell reaches the browser — every write already
   `pg_notify`s `fusion_events` with a scoped
   `NotificationEvent` (`api/notifications.ts`;
   `notifyPayload` in `api/advisory-lock.ts`, 8000-byte
   cap with a `full` fallback) and nothing LISTENs, so a
   second browser is stale until navigation. Ship the
   other half: one LISTEN connection per process,
   outside the pool, reconnecting; a per-session stream
   to the page (SSE is the platform primitive — the
   brainstorm weighs it against WebSocket and names the
   drain and the resource-sanitizer cost in `./test
   browser`), fenced to the session's organization and
   identity, delivered into the existing
   `fusion-angle:data` refresh so pages change nothing.
   Precedes item 10 (a chat that does not update is not a
   chat) and item 12 (the worker trusts the bell, never
   polls). Merged: stale-until-navigation (closes KNOWN
   seam "Stale-until-navigation (no LISTEN)" —
   `tests/advisory-lock.test.ts`).
10. Chats — a conversation on any document at
    `/…/:collection/:id/chat/` with as little ceremony as
    the plane allows: a message is a POST pair at that
    document, the chat is that document's history, and
    derive is `getMessagePairs` filtered to POST — no new
    family shape unless the brainstorm finds one (edits,
    deletions, and attachments are its questions).
    Authorship is `requester_identity_id`, so an AI
    seat's messages need no extra field. Reads ride the
    fenced org; updates ride item 9. Consumed by item 11
    (a chat on every record and work order) and item 12
    (the channel a person uses to instruct and correct a
    worker).
11. Processes — re-implement flows, work orders, and the
    workbox with a node as a process. Four kinds, each
    defined by what it waits on and what it emits:
    record modification (today's node — a member or
    agent edits the bound instance and transitions);
    external synchronization (new — the node waits on a
    system outside the origin: webhook in, request out,
    or both); sub-flow (the node runs another flow
    document as a child work order and resumes on its
    completion); sub-graph (the node holds an inline
    graph inside the same work order). Both graphs are
    directed and cyclic. Kept: the pair plane, the graph
    frozen into the work order at creation, the claim
    alphabet, all-see-all. Each record and work order
    carries a chat (consumes item 10). The brainstorm's
    first questions: what the two nested kinds share,
    and how a cycle across a sub-flow boundary
    terminates. Merged, the canvas debts the rewrite
    retires or keeps by decision: READY gate on dangling
    refs (`tests/adapters-flow-publish.test.ts`); locked
    verbs not executed (`tests/family-registry.test.ts`);
    the flow-tag designer UI (TEST-PLAN "Flow Designer —
    Flow Tags", API-only today); F6's ZIP import not
    rebinding `flow_records` (TEST-PLAN F6); page
    selection writes behind the FSM at four sites in
    `web-app/flows/detail.ts` (`canvasFocusOf`'s walk is
    the second instance the remediation added); in-place
    `viewBox` mutation at four method sites
    (`web-app/app/presenters/flow-designer.ts:537-538,
    556-559, 1036-1039, 1066-1067`); `hasUndoHistory` as
    `pairs > 1`
    (`api/derive-flows.ts:108` — the client's
    approximation, read by no route; the undo route
    walks the stack itself and its bottom-of-stack 201
    is the documented no-op, `api/types.ts:1043-1051`,
    which TEST-PLAN F36/F45 call PASS — the brainstorm
    decides whether that stays); rotation only on the
    toggle path (`web-app/app/flow-layout.ts:1032-1037`);
    the mirror trigger; and the canvas entries of the
    genericity bullet in `## Later work` (two zoom
    implementations, `#noteMutation`, `handleSpace`,
    Delete's `preventDefault`).
12. Headless AI worker — a process that hears item 9's
    bell for each AI seat's workbox, claims the work
    order as that seat (the `client_credentials` grant
    already mints a service identity's token, so every
    pair it lands names the agent as
    `requester_identity_id`), assembles the record
    definition, the attribute values (which — the
    brainstorm decides), the node instructions
    (`withNodeTaskInstructions` already stores them),
    and the chat (item 10), asks the model to follow them
    precisely, validates the reply at the gate like any
    other uninstructed voice, and applies it: attribute
    updates in record-PATCH form and the outgoing edge.
    API-only; no page. Decide in the brainstorm: an
    in-process loop or a second verb of the binary (a
    second process is item 13's precondition, the
    claim-expiry event, arriving early); the model
    behind an adapter with its key supplied at deploy
    and never logged; bounded retries with backoff; a
    loop guard and a spend ceiling for a cycle whose
    every node is an AI seat; record content treated as
    data, never as instruction. Consumes items 9, 10, and
    10. Merged: roster seat naming an AI agent
    (`tests/family-registry.test.ts:111-119`);
    FLOW-CANVAS.md's display-only AI checkboxes
    (`## Members and attributes`).
13. Two processes — high availability for the app and
    for Postgres on Render. The app's precondition is in
    the tree: `api/derive-states.ts:517-529` — the live
    claim route decides expiry against `Date.now()` and
    replay reproduces it only inside one process; record
    the expiry decision as its own event first (remove
    the comment there when done). Then two replicas
    behind Render's balancer, each answering item 4's
    probe; LISTEN in each (item 9 is per process by
    construction); advisory locks already cluster-wide;
    the throttle's per-process counters named as a known
    cost or moved to the store; a Postgres plan with a
    standby and a rehearsed failover. Closes KNOWN seam
    "Single mint process" and retires ARCHITECTURE.md's
    "do not run two replicas". Consumes items 4, 6, 9,
    and the examination report's lock and growth findings
    (`docs/superpowers/specs/2026-09-15-one-table-examined-report.md`).

## Critical functionality path

Off the critical path; each with its oracle.

- An inner pair of a composed operation skipped while the
  top-level pair landed answers 201;
  `appendMessagePairOnce` returns void and the gate never
  holds inner hashes (`api/message-pair.ts:718-729`).
  Product-path item 0 removes that dedupe, and this closes
  with it. Oracle: a composed create whose inner hash
  collides with an earlier pair
- The run-four remediation's remaining seams — R6 and
  R7. R6 holds in a stronger form: no picker renders for
  `select`. R7's primary clause is false: `regex` is
  always offered and a second pick adds a second row
  (`web-app/app/presenters/record-detail.ts:838-871,
  901-909`; `api/validators.ts:2759-2775` accepts
  duplicates). The walk decides whether that is a
  defect; the pin
  (`tests/presenter-record-detail.test.ts`) makes any
  rewrite honest. G9's staleness was the corrupted test
  name, restored by the small-items sweep
- A dragged objective slider's readout speaks a second
  voice: `web-app/projects/detail.ts`'s input handler
  writes `sign + String(v)` (ASCII `-100`) where the
  presenter paints `formatSigned`'s U+2212 `−100`, so
  K13's row reads `-100` until the save re-renders it.
  Oracle: a Layer 2 test that drags a `.baseline-slider`
  to its minimum and reads `.slider-value` as
  `formatSigned(-100)`
- I21's walk probe reads the page at the first paused
  `/api/organizations/*` request, and on 29 Sep that
  request was not the page's. The five GETs the walk
  held are all the top-bar strip's — organization, its
  seat read on `organizations/{id}/members/`, ideas,
  projects, flows (`web-app/app/header-info.ts`, sent
  from `bootApp`'s sidebar branch). The members page's
  own roster read, which `loadInto` sends only after it
  has painted the skeleton, is not among them. At the
  strip's organization GET the page branch may still be
  importing its code-split chunk, so no page code has
  run. `tests/members-pending-skeleton.test.ts` shows
  the skeleton painted once `init` runs. Owner call:
  have I21 poll for the skeleton while the pause holds,
  or rule the pre-import blank container a product gap.
  Oracle: TEST-PLAN I21's probe step and its
  `### Driving notes` twin
- A panel closed outside `withPanelOpen` keeps the
  viewBox it saved on open, so the next empty-canvas
  click or delete restores a stale camera — F29's
  defect through four more doors. In
  `web-app/flows/detail.ts`, `handleAddNodeAtPosition`
  writes `isPanelOpen: false` by hand, and
  `refreshFlowFromServer` drops the panel when a
  cross-tab edit removes its selection. Undo and redo
  commit `applyServerGraph`
  (`web-app/app/flow-operations.ts`), which writes
  `isPanelOpen: false` by hand when the selection is
  gone, and `handleUndo` / `handleRedo` leave
  `panelStateRef.open` true. `withAutoFitToggled`
  keeps the save, and `applyPanelTransition` returns
  null under Auto Fit, so a panel opened with Auto Fit
  off and closed with it on hands the save to the
  next click once Auto Fit is off again. Oracle: one
  Layer 2 test per door in
  `tests/browser/canvas-pan.test.ts` — with Auto Fit
  off, open a node's panel; then port-drag a new
  node, undo the open node's creation, or close the
  panel under Auto Fit and switch it back off; zoom
  in once and click empty canvas — each red today,
  green once its door resets the save
- API retries, unified — the client resends by two
  unrelated mechanisms spread across its files, and leaves
  the commonest failures unhandled. Contention: flow PUT
  (`web-app/app/adapters/flow-mutations.ts:441-546`,
  `MAX_PUT_ATTEMPTS = 3`) and flow undo
  (`web-app/app/flow-operations.ts:707-763`,
  `MAX_UNDO_ATTEMPTS = 3`) each hand-roll a loop that
  absorbs a 412, rebuilds the body against the fresh head,
  and resends, sharing only `jitteredBackoff`
  (`web-app/app/adapters/shared.ts:330`). Auth recovery,
  at two layers: on a 401 the facade refreshes once,
  single-flight, through a raw `fetch` and resends once
  (`web-app/app/adapters/http-facade.ts:276-297`), while
  `withAuthRecovery` does the same above it through
  `postSessionRefresh`
  (`web-app/app/adapters/shared.ts:374`, called at
  `:175`); boot
  refreshes twice more (`web-app/app/app-boot.ts:250`,
  `:366`), and an accepted invitation re-mints its claims
  in two attempts, no loop (`remintSessionClaims`,
  `web-app/app/adapters/invitations.ts:234`). Unhandled: a
  `fetch` that rejects — a dropped connection surfaces as
  a raw `TypeError`; a request that never answers — no
  `fetch` in the client carries a timeout or an abort
  signal; a 429 — the throttle sends no `Retry-After`
  (`server/http-server.ts:582-586`) and the client throws
  it like any failure; a 502, 503, or 504; and an error
  body that is not JSON — `unwrapResponse` parses every
  failure as `{ error }`
  (`web-app/app/adapters/http-facade.ts:80-98`), so a
  proxy's HTML error page surfaces as a `SyntaxError` that
  hides the status. One retry policy, in one place in the
  client: every request under a timeout; backoff with
  jitter, capped, never infinite; more attempts than
  today's three, the spec naming the count and what
  justifies it; and the verb decides what may be resent
  after an unknown outcome (RFC 9110 §9.2.2) — GET, PUT,
  and DELETE may, since a PUT that changes nothing lands
  nothing (item 0), while a POST or PATCH may only after
  an answer that proves nothing landed (401, 412, 429). A
  resend is the same operation and keeps its
  `operation-id`; the throttle sends `Retry-After` and the
  client honors it. Oracle: a facade test over a scripted
  transport — a rejection, a stall, a 429 with
  `Retry-After`, a 503, an HTML 502 — asserting the
  attempts, the delays, and that a POST with an unknown
  outcome is never resent
- Everything we own, named `fa_` — so that operating the
  system makes what is ours trivial to find:
  `env | grep FA_` lists every variable the system needs.
  Every environment variable the system reads becomes
  `FA_*`, and every Postgres role, login, table, index,
  and view `fa_*` (item 0 renames the table and its
  indexes; item 2 creates its roles and views under the
  prefix). Product code reads
  six names, and every reader is ours — `POSTGRES_URL`,
  `JWT_HMAC_SIGNING_KEY`, `PORT`, and `TRUSTED_PROXY_HOPS`
  (`server/boot.ts:59-72`; the URL again at
  `server/postgres-seed.ts:68` and
  `server/postgres-wipe.ts:60`; the key again at
  `api/access-token.ts:36`, through the `process` global a
  search for `Deno.env` misses), and the tooling's
  `MEASURE_PASSWORD` (`web-app/app/measure.ts:368-370`,
  with the URL and the key again at `:430-433`) and
  `CHROME` (`web-app/app/cdp-client.ts:39`) — so the app
  reads
  `FA_POSTGRES_URL` directly and nothing translates. Names
  others dictate stay at two edges: the Postgres image's
  `POSTGRES_USER`, `POSTGRES_DB`, and `POSTGRES_PASSWORD`,
  which `compose.yaml` fills from `FA_` values, and the
  Render CLI's `RENDER_API_KEY`, which `deploy:191` and
  `bin/postgres-seed:154` fill from their own argument; a
  dependency that ever dictates a name gets its adapter.
  Today's role and database are both `fusion`
  (`compose.yaml:2,8-9`, `deploy:171`,
  `bin/test-postgres:22`). Ships no later than the deploy
  of items 0–3, which already changes what operators
  configure, so they rename once. The brainstorm settles
  how far "infrastructure" reaches: the database name,
  compose's service and container names, the hosted
  service names, and the test-only `CHROME` and
  `CHROME_DEBUG_URL`. Oracle: `env | grep FA_` lists
  everything the system needs, and a test finds every
  environment read in product code and scripts and fails
  on a name without the prefix outside the two edges

## Later work

- The auth page's left panel shows invented stats —
  "10K+ Active Users", "98% Satisfaction", "50+
  Integrations" (`web-app/auth/index.ts:141-169`,
  TEST-PLAN B5). Same sin as the landing mock-up;
  its own spec.
- One gate for the write. Ninety-six `appendMessagePairOnce`
  sites and six `appendMessagePairAlways` sites, 73 of them in
  `api/routes.ts`, because each handler owns its own storage
  instead of returning its pairs for one place to store. A
  handler returns `MessagePair[]`; the gate appends them once,
  under one lock order, with one notification. Lands beside
  items 8 and 11, which rewrite the largest handlers. Oracle:
  one append site in `api/api.ts`, zero in `api/routes.ts`.
- The ledger sweep, built into `./bin/measure` the way
  `./deploy` grew modes. A ledger mode that subsumes a
  generator and a loader: the mock seed as the base, a modeled
  year of growth on top, every model constant a CLI argument
  (seats, working days, logins and refreshes and document
  writes per seat-day, revision share, neighbor size); base
  through `postMockDataLoad`, growth in batches of 1000 through
  the seam's `append` with modeled stamps, formed by the real
  pair formers. A decade sweep at 10k, 100k, and 1M pairs.
  `EXPLAIN (ANALYZE, BUFFERS)` per statement with parameters
  chosen by query, and the size at which any statement crosses
  30 ms. Two hundred real writes through the gate per size;
  per-index bytes, rebuild time, and the write sample with each
  index dropped. A neighbor run at 100k this tenant and 900k
  neighbor. Statistics discipline: snapshot
  `pg_stat_user_tables`, then `VACUUM (ANALYZE)`, re-ANALYZE
  after every rebuild, stats recorded per measurement. Local
  compose Postgres 18 on tmpfs, Render v18; timings are lower
  bounds. Loopback-only URL guard; a private schema per size;
  JSON under `measurements/ledger/`. Oracle: committed JSON per
  size and a report section per statement naming its 30 ms
  crossing or "beyond 1M".
- Growth: bytes per pair with two wire messages stored, heap
  against index bytes, `pg_dump` size at 1M, and autovacuum's
  insert-threshold behavior on the insert-only table. Oracle:
  numbers in the sweep's JSON and a backup-size line item 6
  can plan against.
- Schema evolution. `CREATE … IF NOT EXISTS` plus a boolean
  `schema_marker` is the whole migration story: a DDL change
  reaches a database only by wipe and reseed, which the
  `timestamptz` stamps needed and production's mock data
  allowed. Name how a column change reaches a tenant database
  that cannot be wiped — a versioned marker and forward-only
  steps, or a rebuild through the seam's `append` — before the
  first tenant holds real data. Oracle: a Layer-2 case that
  boots the executable against a schema one step behind and
  reads and writes a pair.
- Stamp parameters stay text until Postgres parses
  them. A stamp bound as `timestamptz` (bare
  placeholder or `::timestamptz`) truncates to
  milliseconds on the second execution of a prepared
  statement. Today only `insertPair` does this, and
  `append casts both stamps to timestamptz` guards
  `$6::text::timestamptz` / `$9::text::timestamptz`
  (`api/backend-postgres.ts:581-583`). Oracle: every
  stamp-bearing parameter in `api/backend-postgres.ts`
  carries `::text::`, or text OIDs are forced at
  `api/postgres-client.ts`; a second execution of a
  stamp write still round-trips six digits
- The memory backend's sort coerces `response_at`
  with `?? ''` on a NOT NULL column
  (`byResponseAtThenId`, `api/backend-buffer-tx.ts:
  37-38`; examination report). Oracle: the sort
  helper takes the same string the keyed path does;
  a missing stamp throws
- Gate Operation-ID non-reuse. The client mints one
  Operation-ID per write (`writeHeaders` in
  `web-app/app/adapters/shared.ts`); API.md item 3
  says an Operation-ID names one write and is never
  reused except a byte-identical retry. The server
  does not enforce it: `operation_id uuid NOT NULL`
  has no uniqueness (`api/schema-postgres.ts:23`),
  and a read by operation id is neither a collection
  nor a document read. Oracle: a second, different
  request with a spent Operation-ID is 400; a
  byte-identical retry still 200s; a PATCH and its
  revision pair still share one id
- Wipe and reseed live databases onto the exact-read
  shapes. Spec Decision 8: invitation `state` on the
  head, PII at `('/identities/<id>/', 'pii')`, token
  `name = jti`, no `/identity-tokens/`. Production
  derives do not dual-read those old shapes; a live
  ledger that predates the landing still holds them
  until `./bin/postgres-wipe` then `./bin/postgres-seed`,
  or the Render equivalents through `./deploy`. Decision
  9's measure witness landed at `3aaee31`
  (`measurements/history.jsonl`, `boot:auth-gate`
  recovered vs `c50e849`) and is closed. Oracle: every
  live database has been wiped and reseeded after
  `66457197`
- Drop leftover `/identity-providers/` dual-read.
  Nested providers are the source of truth;
  `deriveIdentityProvidersFor` still scans the retired
  flat prefix so leftover seed pairs still join
  (`api/derive-identity-spine.ts:228-301`). Exact-read
  Decision 8 retired the invitation, PII, and token
  dual-reads; this one remains. Cheap after the wipe
  bullet. Oracle: that derive reads only
  `/identities/<id>/providers/`, and a leftover flat
  pair does not appear
- XSS can use the refresh cookie from the page. The
  cookie is HttpOnly, SameSite=Strict, Path=
  `/api/authentication`, Secure
  (`api/authentication.ts:160-174`; pin
  `tests/api-authentication-token.test.ts` 'token JSON
  has no refresh_token; Set-Cookie is HttpOnly'), so a
  page script cannot read it — a same-origin `fetch` to
  `/api/authentication/token` still sends it and the
  JSON returns a live access token. CSP `script-src
  'self'` (`server/http-server.ts:41-47`) narrows
  injection; it does not close cookie-use. Closes KNOWN
  seam "XSS can use the refresh cookie from the page".
  Oracle: a Layer 1 case that an unauthenticated page
  script cannot mint a live access token from the
  cookie alone
- Layer 2 on the exact-read landing. `./test browser`
  has not run on master `66457197`; AGENTS.md makes it
  the gate before `./bin/build`, a deploy, or a walk.
  Interpretation (A) of the plan changed one visible
  thing only Layer 2/3 can see: a successor's `parent:`
  line on the Tokens page shows while the successor is
  live and disappears once the successor is itself
  rotated (TEST-PLAN.md G25 carries the caveat). The
  `3aaee31` history row is a measure, not this gate.
  Oracle: `./test browser` green on `66457197` or later
- `render.yaml` Blueprint as a second source of
  truth for the dashboard service. Oracle: a
  committed `render.yaml` that matches the live
  service without a dashboard PATCH.
- Dependency-warm Docker layer. `COPY . .` busts
  later layers; `deno compile` fetches `denort`.
  Cold-build reliability is not the problem.
  Oracle: a measured cold Render Docker build,
  then a layer that caches `deno.json` /
  `deno.lock` / `denort` only if that number is
  the bottleneck.
- The `exists()` helper is duplicated five times, byte
  for byte, all under `web-app/app/` — `compose.ts`,
  `generate-api-documentation.ts`, `measure-viz.ts`,
  `cdp-client.ts`, `measure.ts`. Commandment IX's
  threshold is three. Each copy was sanctioned
  deliberately: extracting a shared module from any one
  Deno porting task would have reached into four other
  tasks' files. Oracle: one definition, five importers,
  `./validate` green.
- Reword the exact-read plan's regex constraint.
  `docs/superpowers/plans/2026-09-15-exact-read-folds.md`
  Global Constraints say "No regex over the ledger's
  paths anywhere under `api/`", which over-claims:
  `ORGANIZATION_NESTED_URI_PREFIX.exec(path)` in
  `api/derive-states.ts` (`ownerFromPath`) parses the
  path of one pair already fetched by an exact document
  read to extract its organization segment — a parse of
  a known pair, not a read by pattern. The spec's axiom
  (a read is an exact `path`, or an exact `path` and
  `name`) holds. Say "no read discovers pairs by
  pattern" instead. Oracle: the reworded line, and the
  one `.exec` named as the sanctioned parse
- Gate the PII PUT on a live identity document.
  `PUT identities/:id/pii` writes the slot at
  `('/identities/<id>/', 'pii')` with no check that
  `identities/:id` has a live head, and
  `deriveIdentityPii` needs none either — so a future
  write can mint an orphan slot that `GET` answers 200
  for while `deriveIdentityPiiRows` (login by email,
  grant by email, the roster views) cannot see it. Spec
  2026-09-15 exact-read folds § 3 covers existing data
  by wipe (Decision 8), not future writes. A validator
  at the gate, not a downstream check. Oracle: a PUT
  with no identity document 404s, and
  `tests/drift-identities.test.ts`'s orphan-slot pin
  becomes unreachable by construction, not by fixture
- Name the authorization_code chain root by its jti.
  Spec § 6 keeps the root's document named by the
  code's sha256 spend marker, so the root's 'issued'
  event lives at the marker document while its later
  'rotated' / 'revoked' events land at the jti's own
  document: once that root rotates,
  `deriveIdentityTokensFor` returns two heads carrying
  one jti (safe — every fold groups by jti and resolves
  by `at`, fail-closed), and `GET identities/:id/tokens/`
  and the Tokens page show one phantom 'issued' row
  for it forever. The fix is a spec change: name the
  root by its jti and spend-mark by a separate document
  (`authorizationCodeSpent` keeps its own exact read).
  Oracle: one head per jti on every chain kind
- Split the `default-organization` singleton the way PII
  split. Exact-read spec Defers: the SET document is
  still a collection-shaped path with empty name (`path
  = /identities/<id>/default-organization/`, `name =
  ''` — `api/derive-default-organization.ts:11-17`),
  while PII is `path = /identities/<id>/`, `name = pii`.
  HTTP can stay `identities/:id/default-organization`;
  only the stored split changes. Oracle:
  `getDocumentHistory('/identities/<id>/',
  'default-organization')` is the SET document, and the
  empty-name prefix is gone after wipe
- Split `client_registration` the way PII split.
  Registration is still the pre-PII shape: `path =
  /identities/<id>/registration/`, `name = ''`
  (`api/derive-identity-spine.ts:425-466`;
  WRITE_RESPONSE_SPECS `name: ''` at
  `api/routes.ts:3243`). HTTP can stay
  `identities/:id/registration`; only the stored
  split changes. Oracle:
  `getDocumentHistory('/identities/<id>/',
  'registration')` is the SET document, and the
  empty-name prefix is gone after wipe
- Claim and release path vocabulary. Claim is the
  pre-PII shape: `path =
  /organizations/<org>/work-orders/<id>/claim/`, `name
  = ''` (`api/derive-states.ts:1002`; wired
  `organizations/:id/work-orders/:id/claim` at
  `api/message-pair.ts:915`). Release, transition,
  and binding are the same empty-name operations
  (`api/derive-states.ts:1250-1255`). Item 12 records
  expiry as an event; it does not rename the path.
  Oracle: claim/release/binding are document reads
  at a known `(path, name)`, not empty-name
  collection prefixes
- The cross-party delegation ledger
  (`api/authentication.ts:871-879`;
  `tests/api-authentication-token.test.ts:687`)
- Passkey, provider-IdP, and corporate-OIDC ceremonies
  (`api/authentication.ts:1575-1595`;
  `tests/api-authentication-authorize.test.ts:225`)
- Per-client multi-audience, DPoP `cnf`, jti reuse
  detection (`api/types.ts:508-510`;
  `shared/access-token-decode.ts:30-31`)
- SP-6 sign-up (`web-app/auth/index.ts:655-663`)
- Cryptographically signed ledger — brainstorm signing
  of stored pairs. Product-path item 0 hashes both
  messages where they are stored and verifies them;
  signing is what remains. The dropped `version` column
  hashed on write and was never checked on read —
  `SCHEMA.md` item 4
- ACL-editing UI for record attributes (`read_roles` /
  `write_roles`) — R21's restricted branches are
  seed-produced today; setting an ACL is
  `PUT …/attributes/:id` only, and no page reaches it.
  Oracle: an admin edits an ACL through the UI and a
  member-perspective New-instance form flips live;
  TEST-PLAN R21 gains the write path as a user gesture
- A pure-TypeScript scrypt would retire the last
  product-process `node:` import
  (`server/scrypt-hash.ts`). Measured at
  this repo's `ln=17,r=8,p=1,dkLen=32`,
  `jsr:@noble/hashes@2.4.0/scrypt.js` medians 224 ms
  against `node:crypto` scryptSync's 192 ms — 17% slower,
  digests byte-identical, so stored `$scrypt$` credentials
  verify unchanged, and `deno compile` embeds it with no
  native dependency. Its audit status, maintenance
  cadence, and supply-chain posture are UNVERIFIED; for a
  credential path that is the decisive question, and it
  settles before the benchmark means anything. The cost is
  a third-party package where the Article prefers a
  platform primitive. `@denorg/scrypt` and
  `@wildboar/scrypt-0` also exist on JSR, unexamined.
  Oracle: byte-identical digests for the stored parameters.
- Untested by design after run-six: the records/projects/
  flows `onEmpty` arms (only ideas is pinned), `loadInto`'s
  retry branch, a work order both claimed and completed,
  and the archived-genesis walk
  (`web-app/app/adapters/objectives.ts:150-151`)
- `./measure` harvests error-page timings;
  `page:ready` carries no status —
  `web-app/app/measure.ts`
- Claim-on-load with no release-on-leave plus the
  8-hour `DEFAULT_LOCK_TIMEOUT` turns a drive-by
  work-order view into an 8-hour claim
  (run-six Task 3 renders it; the UX remains) —
  `web-app/workbox/detail.ts:583-593`,
  `api/types.ts:1007`
- `subscribeOnce` guarantees "never two" live subscriptions,
  not "always one": a bell arriving between teardown and
  re-arm is dropped, leaving an empty list page blank — the
  symptom run-six Task 9 fixes. Needs two bells inside one
  fetch window; a pending flag would close it but
  reintroduces the shared state the design avoids —
  `web-app/app/channels.ts:138-154`
- The records list's steady-state subscribe is still
  fire-and-forget. `subscribeRecordChanges(async () => {
  … await getRecords … })` (`web-app/records/index.ts:
  118-127`) has no error handler. Critical-functionality
  path fenced `subscribeOnce`'s four `onEmpty` inits and
  excluded this sibling. Oracle: a failing re-GET on
  the records list renders Try Again, zero unhandled
  rejection — the same pin shape as
  `tests/ideas-empty-subscribe.test.ts`
- Three fixed `setImmediate` drains guard negative
  assertions after an asynchronous delivery: the raw-PUT
  "must not wake the page" checks in
  `tests/flow-stats-subscribe.test.ts:182-190` and
  `tests/ideas-empty-subscribe.test.ts:190-203`, and the
  "idle tab ignores a peer refresh broadcast" check in
  `tests/adapters-refresh-mutex.test.ts:153-155`. A late
  delivery can only pass them wrongly, never fail them —
  but this branch saw `tests/ideas-empty-subscribe.test.ts`
  fail three times under `--parallel` (the file itself
  untouched; `BroadcastChannel` is process-global) and
  `tests/adapters-flow-stats.test.ts` fail once, and
  `ledger-decisions` saw the ideas file fail a fourth
  and a fifth time, TODO.md its only change and a
  second gate
  running beside it, so the
  fixed count still proves less than it reads as proving;
  the ideas comment still says its drain matches the
  post-bell assert, which 90f5c722 turned into a deadline
  wait. Oracle: each check reads after a signal that the
  delivery was processed — a render count on the host
  stub for the two page tests, a second listener on
  `fusion-angle:refresh` for the mutex test — and no
  fixed-count drain remains at those three sites.
- Objective lifecycle history compares two clocks:
  `revision.at` is client-minted while the lifecycle `at`
  is the server-stamped pair fact. A browser clock ahead of
  the server can invert them and throw, so the History
  modal fails to open with an error toast instead of
  rendering —
  `web-app/app/adapters/objectives.ts:311`,
  `web-app/projects/detail.ts:986`
- Node-only modules still live under `web-app/app/` —
  `measure.ts`, `generate-api-documentation.ts`,
  `compose.ts`, `generate-schema-svg.ts`,
  `cdp-client.ts`, `measure-viz.ts`. The browser
  tsconfig `exclude` that listed them is gone with that
  file. Moving them to a top-level tools directory
  would make browser membership by rule and is the
  exclusion the `Deno.*` fence still needs. Oracle:
  those six files are not under `web-app/app/`
- A DOM-free server universe — `deno.json` is the only
  project and its `lib` includes `dom`, so a `document`
  in `api/` or `server/` type-checks. Re-measured: a
  temp `document.body` under `api/` passed `deno check
  --frozen api`. WebCrypto/Fetch names the server needs
  (`crypto.subtle` in `api/client-assertion.ts`,
  `HeadersInit` in `api/message-pair.ts`) live on
  `lib.webworker` without `document`. Oracle: a
  `document` reference in `api/` fails `./validate`
- The Send Back feedback textarea is discarded.
  `web-app/app/presenters/idea.ts:410-425` renders
  `<textarea id="approval-send-back-feedback">` in the
  Send Back dialog, and `grep -rn
  "approval-send-back-feedback" web-app/ api/ shared/
  tests/ server/` returns zero reads: the confirm path
  (`web-app/ideas/detail.ts:289-296` → `transitionIdea`
  → `postIdeaStateChange`) has no feedback parameter, so
  whatever a reviewer types is thrown away. Found by
  reading, not driving, during the 2026-08-29 audit; no
  TEST-PLAN case claims the feedback survives. Oracle: a
  Layer 1 test asserting the typed feedback reaches the
  transition
- Roster map mints `{ erased: true }` before the PII
  fill. `buildHumanMemberMap` plants a tombstone on
  every seat (`web-app/app/adapters/members.ts:96`);
  `getHumanMemberMap` then overwrites it. Spec
  2026-09-04 critical-functionality-path named this
  the same sentinel sin as the shipped
  `emptyPersonProfile` and said to put it in Later
  work. A fill that throws leaves seats looking
  erased. Oracle: `buildHumanMemberMap` carries no
  PII placeholder; a row is filled or absent
- Toast doubled live region and tab order.
  `ensureContainer` appends last in tab order and sets
  `aria-live=polite` (`web-app/app/toast.ts:94-104`);
  each toast is also `role=status` (`:117-119`).
  Critical-functionality path: accessibility
  precondition, unmeasured. Pause-on-hover shipped;
  this did not. Oracle: tab from the last page control
  reaches the live toast's dismiss; one live region,
  not two
- The browser type fence is gone, not weakened. Ambient
  Node globals unlock per `deno check` invocation: one
  `node:` specifier anywhere in the checked graph gives
  `process` to every file in it. `web-app` carries none
  of its own since the Deno port, but the gate checks it
  in one invocation with `server` and `tests`, and
  either alone suffices — `server/scrypt-hash.ts`'s
  `node:crypto` means retiring `node:test` will not
  restore it. `npm:` does not unlock; `Deno.*` never
  fenced at all, via `deno.ns`.
  `tests/browser-fence.test.ts` checks an isolated file,
  so it passes while the property is false. Restoring
  the `process` half now costs one line:
  `deno check --frozen web-app` alone is green on the
  tree today and rejects a `process` reference under
  `web-app/` with TS2591. The `Deno.*` half is a much
  bigger job and must not inherit that estimate: a lib
  array without `deno.ns` is necessary but far from
  sufficient — measured over `api shared web-app` it
  yields 104 TS2304 errors, every one of them in a
  `web-app/app/` tooling module (`measure.ts` 49,
  `generate-api-documentation.ts` 14, `compose.ts` 14,
  `generate-schema-svg.ts` 11, `cdp-client.ts` 10,
  `measure-viz.ts` 6) and none in browser page code. So
  that half needs the lib change PLUS the exclusion
  registry the `process` half escaped. Oracle for the
  `process` half: that invocation in `./validate`, red
  on a `process` reference under `web-app/`.
- `./measure --record` writes the literal `'unknown'` as
  `cpuModel` (`web-app/app/measure.ts:946`). Deno exposes
  no CPU-model API — `navigator.hardwareConcurrency` is a
  count — and the `sysctl` workaround was rejected as
  unverifiable and macOS-only. Sixteen rows in
  `measurements/history.jsonl`; the last two (`c50e849`,
  `3aaee31`) already store `"unknown"`. The truthful
  shape omits the field rather than storing a sentinel,
  which needs `measure-core.ts`'s field type and
  `shapeHistoryLine` (:36, :264) together with
  `measure-viz.ts:986`, whose `|| ''` is itself the
  default-value sin. Oracle: a row with no `cpuModel`
  key renders without the separator.
- The measure visualizer's client mirrors have no test
  binding them to the core. `vizClientScript()`
  (`web-app/app/measure-viz.ts`) hand-transcribes
  seventeen `measure-viz-core.ts` exports —
  `rollupPhases`, `meanReadyMs`, `systemDeltaMs`,
  `pageCandle`, `systemCandle`, `trendAxisMax`, and
  their siblings — because the page is one file that
  opens from disk and imports nothing (measure-candles
  design § Pure core). Each pair was verified by reading
  at review; nothing turns red when a core body changes
  and its mirror does not. One `Deno.test` that
  evaluates the template string in a `Function` scope
  and runs every mirrored function against the core on
  shared fixtures closes it, codebase-wide. Oracle: a
  one-character change to any mirrored body in
  `vizClientScript()` turns that test red.
- A trend candle's box can overtop its whisker.
  `trendAxisMax` (`web-app/app/measure-viz-core.ts`)
  takes each point's median, its candle's max, and the
  budget, never mean + σ (measure-candles plan,
  Interpretation E), so a left-skewed trimmed set —
  `[1, 10, 10, 10, 10]`: mean 8.2, sample σ ≈ 4.0,
  mean + σ ≈ 12.2 > max 10 — puts the box top above the
  plot's top pad, where the SVG clips it. The plan's
  reasoning that nineteen trimmed samples keep the box
  inside the whiskers is not true in general; page
  loads are right-skewed, so it is rare, and it is
  cosmetic. The fix is a spec amendment, not a client
  patch: `trendAxisMax` also takes mean + σ and the
  axis grows, or the box clamps to the whisker and the
  mark says less. Oracle: a `Deno.test` on the box
  geometry under that fixture, asserting the box top
  never rises above the whisker top, red today.
- Stale-history comment cleanup as one pass — comments
  still describe a past state as present. Sampled:
  `web-app/app/measure-cli.ts` names a Node harness;
  `web-app/app/page-request-profile.ts` says "No-op in
  Node"; `tests/drift-states.test.ts` says derive-states
  is unread in production while `api/routes.ts` imports
  it; `api/routes.ts` claims revival dual-write after
  the states row half is stripped. The run-four
  remediation's Evidence
  (`docs/superpowers/specs/`
  `2026-08-23-test-plan-run-four-remediation-design.md:911-932`)
  lists provenance, not comments, and the reproductions
  that might have were scratchpad, never committed —
  the pass re-derives its enumeration by reading. The
  two remaining "remove the comment at … when done"
  pointers under `## Critical path` are that path's
  property, not stale
- Unpinned but pinnable — TEST-PLAN covenants with no
  test, the 2026-08-29 audit's gap list. Each names the
  lowest layer that could express it. The walk observes
  these; nothing proves them. TEST-PLAN.md's "see
  Unpinned but pinnable" references land here.
  - A real `./build` run — its exit code, the ZIP it
    writes, and that ZIP surviving the walk, plus the
    artifact's contents: the 29 `PAGE_REGISTRY` files
    (the eight A2 names, `api-documentation/index.html`
    among them), the `fusion-angle` executable,
    `site/assets/app.js`, `site/assets/styles.css`, the
    woff2 fonts, the 18 page directories, and the
    verb/status rooms generated
    separately from `PAGE_REGISTRY` (A1, A2, J3) — Layer
    1, an integration test in the shape of
    `tests/crank-cli.test.ts` that spawns `./build
    --no-zip` into a temp dir; today
    `tests/server-zip-metafile.test.ts` only regex-checks
    the build script's source text
  - The mock-data reveal's 12 printed lines carry
    `demo@example.com` and `sarah.chen@company.com` by
    name, not merely a count of 12 (A3) — Layer 1,
    `tests/pg-seed.test.ts` `'mock-data seed prints every
    human sign-in'`; every `demo@example.com` assertion
    there sits on a `'bootstrap'` call or the synthetic
    formatter test
  - The live root redirect — exactly one transition, and
    a navigated URL that is never `auth/` or `snapshots/`
    (A4) — Layer 2, a CDP test under `tests/browser/`;
    `tests/root-redirect.test.ts` is a source-text regex
    a computed destination would evade
  - No console error and no 501 during a real
    unauthenticated page load (A5) — Layer 2, a CDP test
    capturing console messages and the network log
  - Create Project stays disabled while only SOME active
    objectives are scored (AA22, AA22a) — Layer 1, a
    `conversionIsReady` fixture in
    `tests/presenter-idea.test.ts` with two or more
    objectives partly baselined; today's fixtures are
    N=1, which cannot tell `.every()` from `.some()`, or
    N=2 all scored
  - The Add-Member dialog's Kind toggle, default-Human
    selection, and the AI form's disabled-until-Model
    Create gate (AA4, AA7a) — Layer 1 or 2;
    `bindAddMemberDialog` (`web-app/members/index.ts`)
    carries no test
  - The live seat-derived roster and the Ideas list's
    membership and counts against the real mock seed —
    which humans and which idea titles render on Stark
    (AA6, AA7, AA12, AA14) — Layer 1, a boot-level test
    in the spirit of `tests/mock-flow-readiness.test.ts`
  - The Projects list count after a live idea-to-project
    conversion, seeded 16 plus 1 (AA24) — Layer 1,
    chaining `postIdeaConversion` into
    `getProjects().length` in
    `tests/adapters-projects.test.ts`
  - The flow designer's toolbar and header chrome — Undo,
    Redo, Zoom −/+, Copy Mermaid, Export ZIP, Delete, and
    the Locked / Auto Layout / Auto Fit switches (AA26) —
    Layer 2; no presenter test enumerates these labels
  - Every member unassigned on a brand-new node, the
    `memberIds: []` shape (AA28) — Layer 1, one more
    assertion in `tests/presenter-misc.test.ts`'s
    `'buildNodePanel marks currently assigned member
    checkboxes as checked'`
  - The 800 ms auto-save debounce timing itself (AA29,
    AA40) — Layer 2, measuring the delay between a
    properties-panel edit and the resulting PUT
  - A renamed node's own name surviving a save and reread
    (AA29, AA40, F30) — Layer 1, an assertion on
    `graph.nodes` by id in
    `tests/adapters-flow-mutations.test.ts`'s `'putFlow
    persists every FlowSaveShape field'`
  - The Create-node edge group rendering `data-edge-ref`
    and deliberately no `data-edge-id`, which is what
    keeps it non-interactive (AA30) — Layer 1, a render
    test over `web-app/app/flow-graph.ts:869-882`
  - The auth form's client-side validation messages —
    "Email is required", "Please enter a valid email
    address", "Password must be at least 6 characters"
    (B6, B7, B8) — Layer 1, by exporting `validateEmail`
    and `validatePassword` from `web-app/auth/index.ts`
  - The exact rejection string "Invalid email or
    password." (B9) — Layer 2;
    `tests/browser/sign-in.test.ts` checks only
    `error.length > 0`
  - The Sign Up mode toggle's title, field, and button
    changes, and the "Sign-up is coming soon" toast with
    no navigation (B10, B11) — Layer 1, the same export
  - `resolveOrganizationGate(nonEmpty, <a gated page
    other than invitations>)` returning the list (B28) —
    Layer 1, one more assertion in
    `tests/boot-organization-gate.test.ts`; a mutation
    proved the old pin false
  - A header landmark and a main-content region rendering
    on `dashboard/` (C1) — Layer 2, extending
    `tests/browser/sidebar.test.ts` or
    `tests/browser/sign-in.test.ts`; the sidebar and the
    dashboard load are pinned, these two are not
  - The sidebar's 12 links in the stated order, labeled
    (C2) — Layer 1, asserting `PAGE_REGISTRY`'s
    `inSidebarNav` titles equal the 12-item order
    verbatim; one exclusion is checked today, never the
    order or the full set
  - The header's search bar, stats tiles, and theme
    toggle, and the retired greeting and org `<select>`
    being truly absent from the live DOM (C3) — Layer 2;
    `mutateHeaderInfo` mutates `document` directly and
    has no pure-function seam
  - The visual order of the four dashboard surfaces and
    the painted dual-concentric and bipolar arcs (C4) —
    Layer 2, reading the rendered SVG arc paths
  - Each sidebar link's click actually navigating to its
    target page (C5) — Layer 2, clicking each
    `PAGE_REGISTRY` sidebar link and reading
    `location.pathname`
  - The sidebar staying fixed while the main content
    scrolls (C6) — Layer 2, reading the sidebar's
    bounding rect before and after a scroll
  - The mock seed's per-org and global entity and roster
    counts landing in their stated bounds — ~6 ideas, ~16
    projects, ~4 flows, 6 humans, 4 AIs, ~11/~17/~5
    globally (C7) — Layer 1, a `sharedMockDb()`-backed
    test beside
    `tests/adapters-dashboard-mock-seed.test.ts`, which
    covers only the Impact and objective baselines
  - The six conversational prompt labels on the create
    form — "Give your idea a clear title" and its five
    siblings (D5) — Layer 1, an assertion on
    `IdeaCreatePresenter`'s rendered label text; the
    cited test reads field values, never the fixed
    strings around them
  - The read-mode Problem & Solution card's exact field
    set and its em-dash-for-empty-optional rendering
    (D11) — Layer 1; `presenter-idea.test.ts` excludes
    `renderShell`/`renderUpdate` by choice, and
    `makeRecordingContainer`
    (`tests/presenter-project-detail-impact.test.ts:30`)
    already renders a DOM-slot shell under `deno test`
  - The Edit → editable-inputs toggle and Cancel
    restoring the original (D12, D14) — Layer 2;
    `handleIdeaActions`'s edit and cancel branches are
    driven by nothing
  - The composed header action-button SET per idea state
    — Send Back / Approve / Edit together for
    `in_review`, only Edit otherwise, and only Cancel /
    Save in edit mode (AA18, D15, D29, D32, D32a) — Layer
    1, a presenter test rendering
    `IdeaPresenter`/`IdeaEditPresenter`'s action slot end
    to end; today only the state predicates
    (`isReviewable`, `canSubmit`, `isConvertible`) are
    unit-tested in isolation
  - A `promoted` idea's badge label reading exactly
    "Promoted", not "Approved" (D24) — Layer 1, a
    `promoted` fixture in `tests/presenter-idea.test.ts`;
    `IDEA_STATE_CONFIG`
    (`web-app/app/presenters/state-display.ts:35`) is
    untested
  - The convert page's error state (D35) — Layer 1;
    `web-app/ideas/convert.ts:96-115` hand-rolls its own
    `buildErrorState` call outside the shared `loadInto`
    helper, and `buildErrorState` has no test anywhere
  - The "New Idea" button, the create-form Cancel, and
    the convert-page back button — each a click then
    `navigateTo` (D4, D9, D34) — Layer 2; no test drives
    any click handler on any ideas page
  - A live drag on any list but projects — the ideas list
    (D36, D37) and an objective row (K6) — and a new
    objective's own "appears at bottom" placement (K2) —
    Layer 2; `tests/browser/list-reorder.test.ts` drags
    `[data-project-card]` and nothing else
  - The org-scoped projects list count landing at its
    stated lower bound with the paint-timing wait honored
    (E1) — Layer 2, waiting on the card count before
    asserting
  - The per-metric absent-placeholder rule — which of
    Time, Cost, and Impact produced the em-dash — on the
    list card's `project-metric-grid`
    (`ProjectPresenter`'s `#buildMetrics`, which no test
    reads) and on the detail page (E1, E4) — Layer 1,
    three fixtures in
    `tests/presenter-projects-organization.test.ts` each
    zeroing one baseline; the only candidate today
    searches the whole rendered shell and finds Impact's
    em-dash whatever Cost holds
  - The live status-badge click and its active/pressed
    styling (E2) — Layer 2
  - Clicking a project row landing on
    `projects/detail.html?projectId=<id>` (E3) — Layer 1,
    a `buildPageUrl('project-detail', { projectId })`
    case in `tests/navigation.test.ts`, whose detail-page
    cases name only `idea-detail` and `idea-create`
  - The project detail page's dates and progress bar
    rendering with data (E4) — Layer 1, extending
    `ProjectDetailPresenter`'s coverage in
    `tests/presenter-projects-organization.test.ts`
  - The absence of a Team card on the project sidebar
    (E5) — Layer 1, an exclusion assertion on
    `ProjectDetailPresenter.renderShell`
  - The "Flow creation limited to approved projects only"
    and "No flows yet" empty-state copy painting for a
    zero-flow project (E6) — Layer 1, asserting that
    paragraph directly; the New-Flow-button test passes
    `flows: []` for both branches and never reads it
  - The New Flow dialog's fields — Flow Name input,
    Create / Cancel — and the live navigation into the
    designer after Create (E7, AA26) — Layer 2, driving
    the dialog on an approved project's detail page
  - The live click swapping read mode for edit mode on
    project detail (E8) — Layer 2
  - The live click-Save round trip on project detail (E9)
    — Layer 2
  - Edit then Cancel restoring the original, unmodified
    data (E10) — Layer 2; the cancel branch is inline in
    `handleProjectActions`, mutating a module-level
    `state` variable, unlike the exported, tested
    `reduceProjectSave`
  - `#project-review-actions` and
    `#project-lifecycle-actions` carrying `hidden` while
    editing and reappearing on Cancel (E10a) — Layer 1;
    no test names either id
  - The drop indicator's appearance and the card
    following the pointer mid-drag (E11) — Layer 2,
    extending `tests/browser/list-reorder.test.ts` past
    the before/after order
  - The import dialog's Project selector, hidden file
    input, and Choose-File trigger (F4) — Layer 1, a
    markup test over `web-app/flows/index.html` in the
    shape of `tests/flow-detail-toast-overflow.test.ts`
  - The ZIP resolution dialog's four shapes — Overwrite,
    Create New, Create, and the description (F6, F44) —
    Layer 1, a pure test of `buildDialogConfig`
    (`web-app/app/adapters/flow-export.ts`), already pure
    and only unexported
  - Which node kind wears which colour, the Archive
    node's red 3-px border, the centred special label,
    and the attribute-count subtitle (F8, F40, AA26) —
    Layer 1, per-node `buildGraphSvg` assertions in
    `tests/flow-graph-locked.test.ts`; `'an unlocked
    canvas keeps per-type strokes'` renders all three
    kinds into one blob and asserts each token appears
    somewhere, so a green-for-red swap survives it, and
    cycle amber (`WARN`,
    `web-app/app/flow-graph.ts:47`) is asserted nowhere
  - The cycle edge's rendered `stroke-dasharray` and
    `url(#flow-arrow-warn)` marker (F9, F21) — Layer 1, a
    `buildGraphSvg` assertion on a graph with a back-edge
  - `canShowPort`'s three-way rule and the port's
    `<title>` copy (F10) — Layer 1, `buildGraphSvg` with
    a wired and an unwired Create node, locked and
    unlocked
  - The connect preview's markup — the "New State" ghost
    card, the grey straight line, and the bezier with its
    arrowhead (F15, F19, F23) — Layer 1,
    `buildConnectPreview` via `buildGraphSvg`
  - Auto Fit's refusal on the zoom BUTTONS (`withZoomedIn`
    / `withZoomedOut` under `isAutoFit`) and the 0.25
    `MIN_ZOOM` clamp (F29) — Layer 1,
    `tests/flow-designer-presenter.test.ts` for the
    buttons (only the wheel path is covered) and
    `tests/flow-fsm-reduce.test.ts` or
    `tests/flow-zoom-to-fit.test.ts` for the clamp
  - The pixel-identical position restore across an undo
    (F34) — Layer 1, asserting `positionX`/`positionY`
    after the undo in `tests/flow-undo-cursor.test.ts`
  - Backspace as a delete chord —
    `reduceDesignerShortcut` handles `Delete ||
    Backspace` in one branch and only `Delete` is
    asserted (F38) — Layer 1, one more `chord({ key:
    'Backspace' })` case in
    `tests/flows-detail-shortcuts.test.ts`
  - The Delete toolbar button's `disabled` attribute
    under lock (`FlowDesignerPresenter#canDelete`) and
    the attribute picker's own `disabled` attribute when
    locked or when nothing is free (F40, F71) — Layer 1,
    `tests/flow-designer-presenter.test.ts` and
    `tests/presenter-misc.test.ts`
  - The "Mermaid copied to clipboard" toast and the
    clipboard write itself (F41) — Layer 2,
    `tests/browser/toasts.test.ts`
  - The real archive round trip — the four-entry manifest
    as a set, `flow.json` and `flow.txt` in particular
    (F42), and members and attribute refs surviving
    `getFlowZip` → `getBackupFromZip` (F6, F44) — Layer
    1, `tests/adapters-flow-export.test.ts`; its own
    tests read back only `flow.mmd` and `sidecar.json`,
    and the members-and-attributes round trip builds its
    backup as an in-memory literal
  - The canvas itself changing after each Undo, as
    distinct from the server state (F45, F46) — Layer 2,
    `tests/browser/canvas-*.test.ts`
  - Pan mode surviving a second drag in one session (F49)
    — Layer 2, `tests/browser/canvas-pan.test.ts`
  - The `if (ke.repeat) return` auto-repeat guard (F50) —
    Layer 1 if it is extracted as a pure predicate beside
    `nextCanvasTabIndex`, Layer 2 otherwise
  - Space on a focused node leaving pan mode off — the
    `defaultPrevented` handshake between the
    document-phase activation listener and the
    window-phase space handler (F57a) — Layer 2,
    `tests/browser/canvas-keyboard.test.ts`
  - The node panel's members fieldset — the alphabetical
    ordering of the HUMANS and AIs groups and the
    `<legend>Members</legend>` text (F58) — Layer 1,
    `tests/presenter-misc.test.ts`
  - The Create and Archive panels' shape — no
    `#prop-node-members`, no
    `#prop-node-attribute-picker` (F63, F64) — Layer 1,
    `assert.doesNotMatch` in
    `tests/presenter-misc.test.ts`
  - The rendered hazard badge — `<g
    class="flow-node-danger">` / `.flow-node-warning` and
    its `<title>` copy (F73) — Layer 1, `buildGraphSvg`;
    only the predicate is pinned
  - The Workbox page's title, subtitle, and tab shell
    text (WB1) — Layer 1 or 2; no presenter or browser
    test asserts the shell copy
  - `emptyStateFor`'s rendered copy (WB2) — Layer 1; it
    is unexported page glue in `web-app/workbox/index.ts`
  - The seeded completed-work-order count, 129 of 145
    across `buildWorkOrders()` and
    `buildLeadToCloseWorkload()` (WB3) — Layer 1, an
    exact-count test in the shape of
    `tests/mock-data-objectives.test.ts`, so a seed drift
    goes red instead of surprising a live count
  - The NOT READY row — its subtitle copy and
    `aria-disabled` (Layer 1; the adapter test pins
    `problemCount` and nothing connects that to the page
    glue's rendered string), and the click handler's
    `data-flow-id`-absence guard (Layer 2) (WB4, WB4a)
  - The collapsible toggle interaction and the
    relative-timestamp formatting (WB10) — Layer 2
  - The message plane's append-only invariant — no app
    code path mutates an existing pair (WB16, WB19) —
    Layer 1 in its closest expressible form: a test that
    attempts a mutation through the storage adapter's own
    API and asserts it is refused or impossible
  - Workbox data surviving a page navigation (WB17) —
    Layer 2
  - The second tab's rendered read-only, already-claimed
    view (WB18) — Layer 2
  - The client-side 412 recovery on the WORKBOX action
    screen — re-GET, conflict notice, warning toast, no
    auto-retry (WB19a) — Layer 1 first:
    `WorkboxDetailPresenter`'s own `conflictNotice`
    parameter carries no rendering test, unlike
    `RecordInstancesPresenter`'s; then Layer 2 for the
    live sequence
  - AI-only-member and zero-member node visibility in the
    inbox (WB20) — Layer 1; no fixture in
    `tests/workbox-inbox.test.ts` uses either
  - Archive-tab visibility being independent of which
    members the final transition referenced (WB21) —
    Layer 1; no fixture varies this
  - The stats page shell's absences — no left toolbar, no
    slide-in props panel, no marquee — and the pointer
    cursor over a node (FS1) — Layer 2, reading computed
    cursor style and confirming those elements are absent
    from the DOM; the `buildShell` test asserts what is
    present, never what is not
  - The live Stats-button and back-button navigation and
    the preserved `projectId` (FS2) — Layer 2; the back
    handler is inline in `web-app/flows/stats.ts`
  - The painted colour ramp — yellow/red hot, warm,
    cool/no-data (FS3) — Layer 2, reading the colour
    `--heat-t` resolves to
  - The hover and mouse-out wiring that opens and hides
    the stat card (Layer 2, inline in `flows/stats.ts`),
    and that card carrying no inputs and no Save button
    (Layer 1, over `FlowStatsPresenter.buildCard`'s
    output) (FS4)
  - Review's card subtitle naming its two seeded
    reviewers (FS4) — Layer 1, a `sharedMockDb()`-backed
    `getFlowStats` test on the real Customer Onboarding
    flow; `tests/mock-data-lead-to-close.test.ts` covers
    a different flow
  - The live click-to-pin, click-to-unpin, and re-pin
    transitions (FS5) — Layer 2; pin state is mutated
    inline in the click handler and only the
    `renderCard(container, null)` primitive is tested
  - Data Capture's two seeded members with an outgoing
    edge — the premise beneath FS6's "no triangle on any
    of the four nodes" (FS6) — Layer 1, the same
    `sharedMockDb()`-backed `getFlowStats` assertion FS4
    wants, extended to Data Capture. The composed hazard
    rules are pinned, but the seed shape they rest on was
    READ, not asserted, and
    `tests/mock-flow-readiness.test.ts` pins Customer
    Onboarding READY, which excludes zero-member and
    dead-end nodes but not the one-member `warning` case
  - The live click advancing the stepper, the accent
    stroke, and the dimmed opacity's painted ~30% (FS7) —
    Layer 2
  - The painted contrast of tints and card text in both
    themes (FS8) — Layer 2, toggling dark mode and
    reading computed contrast
  - The redirect to `flows/index.html` when `flowId` is
    absent (Layer 2; `init()` in `web-app/flows/stats.ts`
    is exported but untested) and the "Here now" WIP
    count agreeing with the Workbox's count for the same
    node (Layer 1 or 2, over one fixture) (FS9)
  - The Organization stat grid's "Next Billing" cell, and
    the Projects and Ideas stat CELLS specifically (G9) —
    Layer 1,
    `tests/presenter-projects-organization.test.ts`; the
    cited test decides Active People and a usage bar, and
    Projects and Ideas each render twice
  - The Organization edit form's prefill — the two inputs
    carrying the current Name and Domain as `value`
    attributes (G10) — Layer 1,
    `tests/presenter-projects-organization.test.ts`,
    whose edit-form test already calls
    `toGeneralInfoDraft` (`web-app/app/adapters/admin.ts:58`)
    and makes no `value=` assertion
  - The sidebar member chip's click-to-profile navigation
    (G12) — Layer 2; `web-app/app/sidebar-member.ts`
    carries no test, and the browser tests read the
    chip's name only
  - The search match-fields — humans on name, email,
    title, or department; AIs on name or description and
    NOT provider or model (G13) — Layer 1, via
    `HumanMember.matchesSearch`; only "a term narrows the
    sections" is decided today
  - The AI dialog's "Model is required" toast-then-no-POST
    gate (G14, G14a) — Layer 1 or 2; `submitAIForm`
    (`web-app/members/index.ts`) carries no test
  - The Strengths card's read-to-edit tag-picker swap
    (G20) — Layer 1, a `.strength-chip` assertion on
    `HumanMemberDetailEditPresenter`; the cited test
    proves only that no State select renders
  - A Model-field edit persisting (G24b) — Layer 1;
    `aiDraft()` fixes `model` to `firstProviderModel().id`
    in both the seed and the update, so `'putAIMember
    updates the agent document'` never changes it
  - An event's `jti`, `parentJti`, `action`, and `at`
    reaching the presenter through one real adapter call
    (G25) — Layer 1; the adapter test asserts chain
    grouping and event counts only, and the presenter
    test that renders `parentJti` hand-builds its fixture
  - A `linked` provider badge distinct from `unlinked`
    (G26) — Layer 1, a scoped assertion in
    `presenter-identity-providers.test.ts`; `/linked/` is
    satisfied by the substring inside `'unlinked'`
  - The absence of a 3-pair composing POST on a human or
    AI edit (G41) — Layer 1, a spy on `ctx.POST` during
    `putHumanMember`/`putAIMember`; the cited tests prove
    the PUT lands, never that POST stays silent
  - The second-hop `IdentityPiiIntakeFailedError` toast
    and the error class itself (G44) — Layer 1; `grep -rn
    IdentityPiiIntakeFailedError tests/` is empty, though
    the torn-state mechanism it wraps is now pinned
  - The Erase PII button present for a person and absent
    for a service (G45) — Layer 1; neither
    `presenter-identity-detail.test.ts` fixture asserts
    `#identity-erase-btn` either way
  - The sent invitation row's "Invited {date}" sub-line
    and its state badge (V8) — Layer 1,
    `presenter-invitation-list.test.ts`; the
    `SentInvitationsPresenter` test asserts id, email, and
    Revoke only
  - The admin-only 403 on `GET
    organizations/:id/invitations/` for a non-admin caller
    (V9) — Layer 1; confirmed live by probe, but no test
    calls `getSentInvitations` as a non-admin
  - The not-found page's rendered message and link (H2) —
    Layer 2, a CDP test navigating to an unknown route
  - The live dark/light repaint — background, text, CSS
    custom properties — from a toggle click (I1, I3) —
    Layer 2; the CLI tests prove `data-theme` and icon
    state, never that the variables repaint
  - The theme choice actually persisting across a
    navigation or reload (I2, I5, FS8) — Layer 1,
    `tests/state-init.test.ts`; its `matchMedia` stub
    returns `matches: true`, which the module's own
    `'system'` default already satisfies, so the
    assertion holds with `initState()` never called.
    Flipping that one value to `false` closes it
  - `initState` hydrating a VALID stored
    `fusion-angle:sidebar-collapsed` value, and the
    `STORAGE_KEY_SIDEBAR` branch of the shared
    storage-event listener (I8, I28) — Layer 1,
    `tests/state-init.test.ts` (only the corrupt-value
    rejection is tested) and a sidebar sibling of
    `tests/state-theme-icon.test.ts`'s cross-tab test
  - `.mobile-header` going hidden again after the
    viewport is restored to ≥768px (I10) — Layer 2, one
    more assertion beside the `#desktop-sidebar` restore
    check in `tests/browser/viewport.test.ts`
  - The whole mobile drawer — hamburger open, backdrop
    and nav-link close, Escape close, and the Tab focus
    trap (I11–I15) — Layer 2; `initMobileDrawer`
    (`web-app/app/mobile-drawer.ts`) carries no test but
    `tests/browser/viewport.test.ts`'s breakpoint check,
    a different concern
  - The command palette's Cmd+K / Ctrl+K binding, Escape
    close, and arrow-key and Enter navigation (I16, I18,
    I19) — Layer 2; `tests/command-palette-init.test.ts`
    is a does-not-throw smoke test and the key-index
    logic is unexported inside the DOM listeners
  - The toast's top-center position and its ~6-second
    auto-dismiss (I23) — Layer 2, reading computed
    position and waiting out `TOAST_DURATION_MS`
  - The newest-on-top `prepend` order and the
    specifically OLDEST toast being the one evicted at
    the cap (I25) — Layer 2; today's browser test raises
    toasts with identical text, so it cannot tell which
    one was removed
  - The skip link's tab order and its focus destination
    on Enter (Layer 2), and the single `<main
    id="main-content">` landmark (Layer 1, a static scan
    of `web-app/app/components-layout.html`) (I29)
  - The wildcard `::view-transition-group(*)` and
    `::view-transition-old/new(*)` selectors carrying
    `animation: none` inside the reduced-motion block
    (I30) — Layer 1, one more `block.includes(...)`
    assertion in `tests/base-css-motion.test.ts`
  - The objectives presenter's render ORDER — the active
    list in position order (K1) and the Archived
    sub-section sitting under Active (K4) — Layer 1,
    `tests/presenter-organization-objectives.test.ts`;
    its assertions are unscoped `.includes()` calls that
    prove presence, not order
  - `postObjectiveRevision`, the rename write (K3) —
    Layer 1; no test anywhere calls it
  - Reactivation returning an objective to the active
    list as a live transition (K5) — Layer 1; the
    presenter fixture feeds static active and archived
    arrays
  - The `sent_back` branch of baseline-slider editability
    (K9) — Layer 1; only `under_review` is exercised,
    though the code path is shared
  - The project action bar's per-state button set —
    Decline and Send back present on `sent_back`, the
    View history button (`data-action="view-history"`)
    present at all (K16, K30) and absent where the case
    says so (K9), and no Score button or modal at
    `under_review` (K10) — Layer 1,
    `tests/presenter-project-action-bar.test.ts`
    fixtures for the states nothing feeds;
    `buildReviewActions` and `buildLifecycleActions` are
    different methods and only some states are covered
  - Dirty-tracking resetting after Save and staying reset
    across a re-render (K14) — Layer 1; no test renders,
    saves, and re-renders in sequence
  - The no-payload-save guard — an unmoved slider never
    calls `postProjectBaselineScoring` (K18) — Layer 1
  - The actual slider's own `value` attribute pre-filling
    with the latest actual (K21) — Layer 1, extracting
    that attribute and asserting on it; `'shows latest
    actual with sign'` searches the whole rendered blob,
    where the ASCII form is a tautology against every
    slider's `min="-100"`
  - The absent visible text label on the column header
    (K24) — Layer 1
  - Green-for-positive and red-for-negative on the gauge
    (K28) — Layer 1, asserting the colour inside each
    side's OWN `<linearGradient>`; the tri-gradient test
    confirms all three stops appear somewhere across four
    gradients, and swapping `gauge.ts:108-110`'s
    assignment keeps the suite green
  - The always-present muted `gauge-arc-track` at every
    value, including zero and undefined, and the actual
    tick's visual distinctness from the baseline area
    (K28) — Layer 1 in `gauge.ts`, or a DESIGN-SYSTEM CSS
    check
  - The production temporal-name resolver (K7, K30) — an
    inline, unexported closure in
    `web-app/projects/detail.ts` that the presenter's
    fixture hand-duplicates rather than imports; Layer 1
    once it is extracted as a named pure function
  - `RecordListPresenter` and `RecordPresenter`
    (`web-app/app/presenters/record-list.ts`) carry ZERO
    tests — the sidebar Records entry, its live
    navigation, and the org-scoped list's contents,
    Customer Profile visible and Project Brief hidden
    (R1), and the "Record archived" toast
    with the Archived chip beside Active,
    numeric-count-free chips, and the toggle hiding the
    card (R15) — Layer 1, a new
    `tests/presenter-records-list.test.ts`
  - The whole record edit-mode form — name and
    description inputs, per-attribute rows, type picker,
    options textarea, constraint editor, add and remove
    attribute, and the absent drag handle (R4–R9) — Layer
    1; `RecordDetailEditPresenter`, `recordDraftFromView`,
    `allowedConstraintKinds`, and `formatConstraint`
    (`web-app/app/presenters/record-detail.ts`) are all
    exported and all untested
  - Returning to read mode after Save, and the rendered
    constraint summaries (R10) — Layer 1, a new
    `tests/records-detail-reduce.test.ts` mirroring
    `tests/projects-detail-reduce.test.ts`
  - The toast-stack cap and the re-entrant-save guard for
    Record edits specifically (R10a) — Layer 2, a new
    `tests/browser/records.test.ts` in the spirit of
    `tests/browser/toasts.test.ts`
  - The flow header's painted "Record: Customer Profile"
    dropdown and its selected state (R11) — Layer 2
  - The workbox action screen's empty-required pre-check
    and its toast text (R13) — Layer 1;
    `hasEmptyRequiredAttribute`
    (`web-app/workbox/detail.ts`) is a pure function one
    `export` away from a direct test
  - A radio-option submit recording the chosen value
    through a transition (R14a) — Layer 1, a `radio`-typed
    case in `tests/adapters-record-transitions.test.ts`;
    the option-membership check in
    `api/record-constraints.ts` is exercised by nothing
  - `instanceListItems`
    (`web-app/app/presenters/record-detail.ts:120`) —
    Layer 1, zero tests; it builds the
    id-plus-readable-values projection
    `records/detail.ts:147` reads for R16's Instances
    list
  - The exact conflict-notice text (R17, R19) — Layer 1,
    importing `INSTANCE_CONFLICT_NOTICE` in
    `tests/presenter-record-instances.test.ts` instead of
    asserting a hand-typed literal
  - `crank`'s termination trap — a signal stopping the
    live `crank` and its child `./serve`, and the temp
    bundle removed afterward (J1, J2) — Layer 1,
    extending `tests/crank-cli.test.ts` past its
    docker-stub early abort
  - The `Secure` cookie attribute (SV3) — Layer 1, one
    `assert.match(cookie, /Secure/i)` in
    `tests/api-authentication-token.test.ts`;
    `api/authentication.ts` sets it and nothing checks it
  - `localStorage` holding neither
    `fusion-angle:authorization` nor `refresh_token`
    during a real cookie session (SV3) — Layer 2, reading
    `localStorage` after sign-in
  - `bootAuthGate`'s cookie-session branch
    (`cookieRefreshAndInstall` / `isCookieSession`)
    firing on a real reload (SV4) — Layer 2, reloading a
    signed-in page and confirming no bounce; only the
    server-side refresh grant is pinned
  - The ideas page's populated-list cross-tab re-render —
    `onIdeasLoaded`'s own `subscribeIdeaChanges` call
    (SV8b) — Layer 1, extending
    `tests/ideas-empty-subscribe.test.ts` with a
    non-empty initial load that still hears the bell;
    only the empty-list re-init branch is decided, and
    the walk never reaches it
  - The pre-navigation staleness itself (SV10) — Layer 2,
    a third test in `tests/browser/two-jars.test.ts`: B
    sits on `ideas/`, A writes, B's DOM is unchanged
    until B navigates
- Profile as its own document,
  `identities/:id/profile`, 404 = no profile — closes
  whole-or-none — `tests/api-identity-document.test.ts`
- Idea-create toasts an incomplete submit; convert
  still sets `btn.disabled` — two forms, one
  directory, opposite validation voices
  (`web-app/ideas/create.ts:124`,
  `web-app/ideas/convert.ts:356`). A design call, not
  a defect: TEST-PLAN D6/D7 pin the toast, and the
  2026-08-26 D6 stub files the voice question as its
  separate finding
- A full TEST-PLAN.md walk using serial subagents, so
  session context stays short — TEST-PLAN.md `## The walk`
- Billing (`web-app/billing/`)
- Attribute drag-reorder (TEST-PLAN R8)
- A flow loaded with Auto Fit OFF no longer fits on
  first paint. `withCanvasSize`
  (`web-app/app/presenters/flow-designer.ts:1020-1041`)
  fits only under `isAutoFit`, and the load-time block
  (`web-app/flows/detail.ts:1684-1695`) is the only
  load-time fit — its `reconcileFitFromDom()` returns
  early for the same reason. RECORDED, behavior
  unchanged. The sentence it falsifies is "onFlowLoaded
  keeps its explicit first fit" — the run-four
  remediation design spec, second-commit paragraph
- The first click after a page reload only focuses the window
  — the focusing click is the viewport center, never the
  top-left brand (that is the Apple menu when Chrome is
  fullscreen or flush with the menu bar; the next click
  opens About This Mac). The same corner is
  `#sidebar-toggle` (I7, I9, I28), `#mobile-sidebar-open`
  (I11, I14, I15), landing `.navbar-logo` (B2, B3), and
  a C5 miss of `.sidebar-nav-item`. Drive those by
  selector, not screenshot-xy. Then click the intended
  control once. Named by the 2026-08-29 three-layers
  audit and carried as a driving note in TEST-PLAN.md's
  `## The walk`. Oracle:
  `tests/test-plan-apple-menu.test.ts` (the document
  names the selectors). A Layer 2 test under
  `tests/browser/` asserting one click after reload
  reaches the element is still unwritten.
- Spec 6 did not run — replacing `npm:postgres@3.4.9`
  with `jsr:@db/postgres` behind `api/postgres-client.ts`.
  Spec:
  `docs/superpowers/specs/2026-08-21-deno-postgres-driver-design.md`.
  Task 56 ruled NO-GO: `@db/postgres` is 0.19.5, pre-1.0,
  a bet on someone else's trajectory under the product's
  only datastore, while the insulation above `SqlClient`
  is one adapter file, so keeping `postgres.js` costs one
  specifier and one file. Reopen at `@db/postgres` 1.0,
  or on measured `./measure` headroom. Oracle: `grep -rn
  'npm:' deno.json deno.lock` prints nothing;
  `./test-postgres` 52 passed; `./measure --check` green
  against the committed budgets.
- Cachability — hashed names and gzip sidecars have
  shipped; on the static server `HEAD` reports the same
  `Content-Length` as GET. The API serves no `HEAD`: its
  method switch has no case for it
  (`api/api.ts:1471-2014`), so it answers 405, and that
  405 carries no `Allow` (`api/api.ts:2004-2013`) —
  RFC 9110 §9.1 requires GET and HEAD of a
  general-purpose server and §15.5.6 requires `Allow` on
  a 405 — while `requireOperationId` already skips a
  method never served (`api/message-pair.ts:163`). Add
  `HEAD` to the API: once item 1 makes a document GET the
  stored bytes with three substitutions, `HEAD` is that
  function without the body. Conditional requests
  (`If-None-Match` / `304`) stay open. Start:
  `server/http-server.ts` `NO_STORE` and
  `CONTENT_SECURITY_POLICY`. Oracle: a measured
  `./bin/measure` repeat-load delta naming the header
  that earned it; hashed assets carry
  `HASHED_CACHE_CONTROL`; an API `HEAD` answers its GET's
  status and headers with no body, and a 405 carries
  `Allow`.
- Genericity — DRY, even once (the indulgence); spec
  away every nit. Merged: `putRecordInstance` PATCHes
  (name lie —
  `tests/adapters-record-instances.test.ts`,
  `tests/api-instances-create.test.ts`); same-body
  PATCH appends 201
  (`tests/api-instances-create.test.ts:585-586`);
  member detail's redundant GET trio
  (`web-app/members/detail.ts`); two zoom
  implementations and two constant sets
  (`web-app/app/flow-fsm-reduce.ts:12-14, 632-656`,
  `web-app/app/flow-interactions.ts:16-18, 816-850`);
  `#noteMutation` / `history()` beside
  `advanceHistory`
  (`web-app/app/presenters/flow-designer.ts:221-227`);
  the shell's hand-kept copy of the reveal header
  (`postgres-lib:8` against `server/seed.ts:26-27`,
  guarded by no test); the second instance the
  remediation added (`canvasFocusOf`'s walk); the undo
  path's duplicated pure helpers
  (`api/flow-graph-diff.ts:16-26`); `toRecordAttribute`'s
  `??` ACL default
  (`web-app/app/adapters/record-attributes.ts:76-79`;
  its server half is the ACL bullet on the critical
  functionality path); the nested
  key-set follow-on (`api/validators.ts:705-713` —
  remove the comment at `validators.ts:705-713` when
  done); `handleSpace` dispatching
  `isFormFocused: false` unconditionally; Delete's
  `preventDefault` with nothing selected. Oracle: each
  named site collapsed to one definition, `./test
  validate` green; the canvas entries retire with
  product-path item 11.
- Fewer JSON parse/stringify — byte-stream header
  setting, mechanical sympathy and simplicity for
  the processor; measured first
  (`./measure --profile`). Merged: the deferred
  content-coding seams
  (`shared/http-message/body.ts:76-79` and
  `shared/http-message/content-coding.ts:5-7` —
  revise both comments when done). Oracle: a
  `./bin/measure --profile` run placing parse/stringify
  above the budgets' noise — the item activates on that
  number, not before.
- Simulated latency by environment — when
  `FUSION_ANGLE_ENVIRONMENT` is exactly `local` and
  `FUSION_ANGLE_LATENCY` is a millisecond count,
  both present and non-empty, every API request
  takes the existing log-normal sampler
  (`api/latency.ts:18-40`) with
  `mu = ln(FUSION_ANGLE_LATENCY)`; otherwise the
  no-op. Merged: the shim's "both presets pass a
  no-op today" (`api/latency.ts:1-5`,
  `api/db-backed.ts:31-32` — revise both comments when
  done). Oracle:
  `FUSION_ANGLE_LATENCY=200` under `local` lifts every
  `./bin/measure` median by about 200 ms; unset leaves
  the no-op.
- GPU flag in the Layer 2 launcher — `launchChrome`
  no longer passes `--disable-gpu` (cargo cult under
  `--headless=new`; it was required only by old
  headless on Windows). Its one real effect was
  forcing software compositing, which made runs more
  alike across machines. Dropped UNVERIFIED —
  `./test-browser` has run green on one machine
  (2026-08-28). Restore it if two machines disagree.
  Oracle: `./test-browser` green on two machines
- `schema-svg.ts`'s `parseStores` still carries a dead
  `StateStore`-matching branch
  (`web-app/app/schema-svg.ts:156-162`): it can never
  match now that `DbStores` holds only `messagePairs`,
  so it has drawn nothing since that field left.
  Oracle: `./test schema` green with the dead branch
  gone, and `SCHEMA.svg` byte-identical.
- `/members/` parents on the document plane are still
  resolved by a full-history reduction,
  `resolveViaMembershipPairPlane`
  (`api/derive-states.ts:225-248`), which walks
  `getDocumentHistory` and reduces it through
  `deriveDocumentsAt` rather than reading the head
  alone; a C4 tombstone comment at
  `api/derive-states.ts:1382-1383` still narrates a
  retired `/members/` document-trio history. Oracle:
  the parent resolves from the head body alone.
- Collection reads in `api/document-family.ts:575` and
  `api/derive-record-types.ts:54` call
  `db.messagePairs.getCollectionHeadPairs` directly,
  while per-id reads go through
  `messageStore(db).getDocumentHead`; a
  `MessageStore.getCollectionHeads` seam would put the
  tombstone decision in one layer. Oracle: both reads
  go through the store seam, `./test validate` and
  `./test postgres` green.
- `documentLifecycleEvents`
  (`api/derive-documents.ts:190`) keeps an
  `if (messagePair.method === DELETE_METHOD) continue`
  guard that no live test pins and no flow route can
  reach — flows' `:id` route has get and put only.
  Oracle: delete the guard, or pin it with a
  flow-shaped fixture.
- Physical PII erasure — deferred by decision:
  product-path item 2 hides removed PII, it does not
  delete it. Activates on a tenant contract or a
  jurisdiction that requires physical deletion. The pairs
  item 2's policy hides are the pairs to delete, and
  `fa_eraser` deletes them through a view of exactly those
  pairs: it holds DELETE on that view and SELECT on the id
  and the hash alone, sees no bytes, and cannot log in
  (item 2's principle). Measured on Postgres 18.6: through
  such a view a live pair and a DELETE head each delete
  zero rows, the hidden pairs delete and come back named,
  and the table itself is refused; `fa_owner` owns the
  view, so item 2's policy hides nothing from it. An
  erasure pair names the removed ids and hashes so every
  absence is accounted for — item 0 left `supersedes`
  unenforced for this — and writing it is an INSERT, which
  a delete-only view cannot make: the brainstorm settles
  whether the eraser also inserts through a view of its
  own, held to erasure pairs by a check option (measured:
  such a view refuses a row at another path), or another
  role writes the record. Until it ships the page says
  "removed", never "erased" (item 2). `DELETE` is logical
  until `VACUUM`, and WAL and point-in-time backups hold
  the bytes until the host's retention expires — state the
  window. Oracle: `tests/api-pii-tombstone.test.ts`
  'erased PII remains in superseded pairs; login is 401'
  inverted for the erased pairs.
- The code's word `erased` becomes `deleted`: this is an
  HTTP application, and the state it names is a DELETE
  head at `identities/:id/pii`. Its own change: the PII
  union's discriminant (`api/types.ts:627-636`) and the
  stem's 76 occurrences in 17 product files, 80 in 14
  test files. It is a field, never a column, and touches
  no stored byte — the client builds the flag from a 404
  (`web-app/app/adapters/identities.ts:152`) — so it has
  no deadline. The page keeps "removed" (product-path
  item 2) until the eraser ships; the code speaks HTTP.
  Oracle: the stem appears in `api/`, `server/`,
  `shared/`, and `web-app/` only where the eraser
  bullet's own words do.
- The reporter — `fa_reporter`, named in product-path
  item 2 only as an example of its principle: a role
  created with its first worker, never before. Nothing
  about it is defined yet — its view, its grants, and
  whether it sees hidden pairs are its own brainstorm's.
  Activates with the first worker that needs reports.
- Table migrations — deferred by decision: product-path
  item 0 holds the table's DDL final, and item 3 ships
  everything a change to the fence needs. Activates on the
  first change to the table once a tenant's data exists
  and a wipe is no longer possible. The pieces already
  stand (item 3, measured): a migration is the genesis of
  its own document in `/migrations/`, named for what it
  does behind a four-digit order after item 0's root,
  landed by `migrate` with its SQL the `request` and
  its digest the `response`; names order migrations and
  item 0's index refuses a second runner, with no lock
  and no migrations table of its own; and the DDL and the
  genesis commit or roll back together. What is missing
  is only the table steps themselves, and whether a
  rollback lands as the migration's DELETE head or as a
  migration of its own — never a rewind. Named limits: a
  large index
  cannot ride the one-transaction step and needs two,
  build then record; boot's strict equality needs a
  declared set of digests once item 13 runs two processes;
  and pairs are hashed and never rewritten, so a new
  envelope column sits outside every old `pair_hash`.
  Never a route that executes a body's SQL (item 3). The
  scripture names this gap among its unwritten scrolls.
  Oracle: a Postgres test starts two runners on one
  migration and finds one document, one set of changes,
  and the loser's DDL gone; a second applies a table step
  to a database seeded from an older binary, and the new
  binary boots.

## Sequencing

- The examination report
  (`docs/superpowers/specs/2026-09-15-one-table-examined-report.md`)
  → 0–2, 6, 9, 11, 13 (its findings are their oracles)
- 0–2 → 5 (its link token is a secret at rest: item 0
  hoists it, item 2 fences it); item 2 no longer orders
  item 6, since a backup carries the table whole
- 0 → 2's advisory-lock revoke, which waits on item 0
  removing the product's last use
  (`api/backend-postgres.ts:286`)
- The naming bullet (`fa_`) lands no later than the
  deploy of items 0–3, so operators rename once
- 4 → 6 → 13 (the health probe, then per process)
- 7 → 11, 12 (the designer roster and AI seats read the
  profile)
- 8 closed; 11 retires flows' event walk with the
  rewrite
- 9 → 10 → 11 → 12 (the bell, then chats, then
  processes, then the worker)
- Items 6, 9, and 13, and the later-work XSS bullet,
  close KNOWN seams — the closer removes the
  ARCHITECTURE.md bullet and this file's line in one
  commit; item 2 rewords two and closes none
- Item 7 precedes routing the roster through the
  profile
- `api/derive-states.ts:517-529` (claim-expiry as its
  own event) lands before any multi-process deployment
  — item 13's first commit, or item 12's if the worker
  is a second process

## Close protocol

The pin flips red → fix the test to the new truth (or
delete it if the old incomplete behavior is gone) →
remove the bullet here → remove the named comment at
its `file:line` → for a KNOWN seam, remove the
ARCHITECTURE.md bullet in the same commit → AUDIT.md's
`m` is the new seam count.

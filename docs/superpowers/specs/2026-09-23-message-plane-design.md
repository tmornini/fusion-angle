# The message plane

- Date: 2026-09-23
- Status: awaiting review, pre-plan
- Worktree: `.worktrees/message-plane`
- Base: `ledger-store` at `d104e99b`
- Ships: the canonical message, the credential
  hoist into `secret`, the two ids, the
  authorization-code document, and the status a
  landed PUT stores
- Defers: the seed, and items 1, 2, 4, and 6
- Witness: `measurements/probes/serve/` on Deno
  2.9.6

## Problem

A pair stores less than the messages it names, and
more than it should. `request` keeps six header
names (`HOISTED_HEADER_NAMES`,
`api/message-pair.ts:575-578`), `authorization`
verbatim among them, and gains an `operation-id`
line the client never sent
(`headerFieldsWithOperationId`, `:211-222`). The
gate reads the body as text and parses it
(`api/request-auth.ts:204-242`). The former
re-serializes it with sorted keys
(`api/message-form.ts:58-62`,
`shared/http-message/json-codec.ts:75`). The
library sorts lines and never joins a repeat
(`sortFields`, `shared/http-message/canonical.ts:19-25`).
It strips `content-length` on parse
(`wire-codec.ts:45`, `json-codec.ts:51`,
`framing.ts:11-14`) and recomputes it on serialize
(`wire-codec.ts:239-244`). Every pair that is not a
DELETE stores 201 (`api/message-pair.ts:288-290`),
and `response-id` repeats the id the wire already
sends as `etag` (`:141`, `:298`). `secret` is zero
bytes on every row (`:966-976`).

Secrets ride bodies. The authorize body carries
`username` and `password`
(`api/authentication.ts:1623-1628`), and its
response body carries the code (`:1661-1662`). The
token grants read `code` and `code_verifier`,
`subject_token` and `actor_token` (`:1003-1010`),
`client_assertion` (`:1124-1127`), and a body
`refresh_token` (`:916-922`). The grant finds a
code by a jsonb containment search over authorize
responses (`authorizeCodeIssuer`, `:1303-1331`,
through `getAllWhereBody`, `fa_message_body`, and
`fa_message_pairs_body`,
`api/schema-postgres.ts:47-76`, `:253-255`), and
reads `client_id` and `code_challenge` back out of
that pair's stored request.

Each id has two sources. The server takes the
client's `request-id` when it is valid and mints
one otherwise (`incomingContext`,
`api/request-context.ts:66-71`). It answers 400 to
a malformed one only after authentication
(`api/api.ts:437-450`), and returns it in no
response. `operation-id` is required on writes
alone (`requireOperationId`,
`api/message-pair.ts:176-209`): reads and the two
doors skip it. The client mints one per write
(`web-app/app/adapters/shared.ts:185-198`), a
fallback mints again
(`web-app/app/adapters/http-facade.ts:161-166`),
the recovery a 401 starts opens fresh contexts
(`shared.ts:499-505`, `:547-568`), and three raw
fetches send none. The server mints one where a
pair lacks it (`api/message-pair.ts:360-362`;
`api/authentication.ts:452-453`, `:692-693`,
`:848-849`) and reads it `?? ''`
(`api/api.ts:1457-1459`, `:1783-1785`).

Nothing checks framing. A chunked request reaches
the api de-chunked, with its `transfer-encoding`
line and no `content-length`
(`measurements/probes/README.md:106-108`). The edge
reads `content-length` only against the 1 MiB cap
(`server/http-server.ts:219-253`).

## Axiom

Every stored message is in one canonical form.
`request`, `secret`, and `response` hold every byte
of the messages a pair names: merge `secret` back
into the other two by name and each message is
rebuilt exactly. No stored body holds a secret.
The server mints `request-id`. The client mints
`operation-id`. Each has one source, and nothing
else fills it.

## Decisions

1. **A request without a defined length answers
   411.** A request that carries
   `transfer-encoding`, or body bytes and no
   `content-length`, answers 411 (RFC 9110
   §15.5.12) and lands nothing. A `content-length`
   that is not the body's byte count answers 400.
   `Deno.serve` de-chunks a chunked request and
   hands it on with its `transfer-encoding` line
   and no `content-length`. Stored as received,
   that line would describe a chunked body over
   bytes that are not chunked, and `parseWire`
   decodes a body as chunked whenever it sees the
   line (`shared/http-message/wire-codec.ts:50-66`).
   Dropping the line breaks the rule that the
   canonical form keeps every received line. Every
   client here sends a string body, which carries
   `content-length`
   (`web-app/app/adapters/http-facade.ts:183-196`).
   One risk is named: nothing in the repository
   says whether Render's proxy ever forwards a
   request chunked. If it does, every write through
   Render answers 411. `./test browser` runs in
   process and cannot see it. The first walk of
   the items 0–3 deploy would.

2. **A resent latched PUT answers 412.** A PUT
   whose `If-Match` names the head's predecessor is
   stale even when the head holds its state: stale
   is decided before matched
   (`shared/ledger-statement.ts:224-237`, pinned at
   `tests/ledger-store.test.ts:279-320`). RFC 9110
   §13.1.1 permits a 2xx when the server can tell
   the change already succeeded, and requires none.
   No client makes this resend. The 412 loops read
   a fresh head and send a fresh latch
   (`web-app/app/adapters/flow-mutations.ts:516-556`,
   `web-app/app/flow-operations.ts:726-768`). The
   401 resend precedes any write. No `fetch`
   carries a timeout (`TODO.md:1313-1324`). The
   latched-write bullet (`TODO.md:1340`) inherits
   this case, and lands no later than the one retry
   policy those lines open, which first resends
   after a lost response. Answering 200 when the
   head supersedes the latch is refused for now: it
   widens both head reads and must be matched at
   the gate
   (`api/api.ts:1009-1050`) and in the handler
   (`api/routes.ts:1552-1566`), for a request
   nothing sends.

3. **The statement writes a landed PUT's status.**
   A PUT that lands stores 201 when its predecessor
   is the root or a DELETE, because it creates a
   representation. It stores 200 when its
   predecessor is a PUT, because it modifies one
   (RFC 9110 §9.3.4). Only the statement knows
   which. The handler's head read is not atomic
   with it, and on the base that read takes a
   DELETE head for no head
   (`api/message-store.ts:29-36`). The handler forms
   `HTTP/1.1 201 `, and the statement overwrites
   the three status bytes as it splices the date
   (§8). No bind is added. No client tells 201 from
   200: success goes through `response.ok`
   (`web-app/app/adapters/http-facade.ts:80-99`).
   Keeping 201 for every PUT is refused. The store
   spec deferred that departure from a MUST rather
   than accepting it.

4. **The exchange presents one token.**
   `Authorization: Bearer <token>` is the subject
   and the actor both. One `Authorization` line
   carries one credential (RFC 9110 §11.6.2), and
   the canonical form would join a second line into
   one value no parser accepts. The exchange allows
   self-delegation alone
   (`api/authentication.ts:993-996`), and its one
   client sends the same token as both
   (`web-app/app/adapters/organization-session.ts:22-35`).
   The cross-party delegation bullet
   (`TODO.md:1580`) inherits how a second party's
   token travels.

5. **The refresh token rides its cookie alone.**
   The refresh grant reads the `refresh_token`
   cookie and nothing else. The body
   `refresh_token` (`api/authentication.ts:916-922`)
   is sent only outside cookie mode
   (`web-app/app/adapters/session-refresh.ts:26-28`),
   and the product runs in cookie mode
   (`web-app/app/server-core.ts:24`). Outside it,
   in the tests' in-process facade, the facade
   sends the `cookie` line itself.

6. **A pair this spec creates stores zero request
   bytes; the rest wait for item 1.** The code
   document's genesis and its redemption receive
   nothing and store zero request bytes. Today's
   synthesized formers keep a request, now in
   canonical form. These are the document siblings
   (`formDocumentMessagePairFor`,
   `api/routes.ts:3603-3643`), the token events
   (`api/message-pair.ts:393-423`), the invitation's
   document and seat, the assertion ticket, the
   credential rehash, and the seed. They keep it
   because the application still derives documents
   from request bodies (`headDocumentOf`,
   `api/derive-documents.ts:152-161`;
   `api/document-family.ts:396`, `:473`). Item 1
   moves the application onto `response`. Its
   sibling PUTs are born with zero request bytes,
   and it empties the rest. Items 0–3 deploy
   together, so the deployed ledger keeps the rule
   on every pair.

7. **Carried in, and not reopened.** The store's
   decisions stand. `secret` is plaintext, with no
   salt, and `secret_hash` is `sha256` of those
   bytes alone. `request_salt` and `response_salt`
   stay. The succession index is the only write
   enforcement. `transaction` and `writeLocks` stay
   off `DbAdapter`. The statement keeps fourteen
   parameters per row.

## Found on the base

Two defects of the store as implemented, not of its
decisions. Each gets a red test before its fix, and
both fixes land before the rest of this spec.

1. **A code can be redeemed twice on Postgres.**
   The grant re-checks the spend marker inside a
   transaction, then writes the marker, the issued
   event, and its own pair in one composed
   statement (`api/authentication.ts:1458-1484`).
   Under read committed, a redeemer that commits
   between another's re-check and that one's INSERT
   becomes that INSERT's head. The second marker
   carries no latch, its `{jti}` body differs, and
   it lands as a successor: both redeemers mint.
   When both miss the marker instead, the index
   refuses the second, and `openClient` turns the
   refusal into a thrown error
   (`api/db-backed.ts:129-155`): a 500 where the
   grant owes 401. The memory backend serializes
   whole transactions
   (`api/backend-memory.ts:82-95`) and cannot show
   the race. `./test postgres` can. §7 replaces the
   marker, the re-check, and the transaction with a
   latched DELETE of the code document.

2. **A document PUT after a DELETE answers 409.**
   The gate's head read skips a DELETE head
   (`documentHeadMessagePairId`,
   `api/api.ts:810-814`), so the PUT is formed as a
   genesis (`:925-927`), supersedes the nil uuid,
   and meets the first genesis's slot in the index:
   409, `Document already exists`. No test covers
   it. `tests/drift-records.test.ts:1105-1150`
   re-creates a record type, which is not a
   document family, so its PUT is blind. A document
   PUT is a genesis only when the document has no
   head of either method. After a DELETE it is a
   successor, and §8 stores it 201.

## Out of scope

The seed, listed at the end so its brainstorm
starts from the list. Items 1, 2, 4, and 6. Moving
the application's reads from `request` to
`response`, and emptying the requests of today's
synthesized formers (Decision 6). The status a POST
or PATCH pair stores, which item 1 decides with its
receipts. `/status` and its exemption from
`operation-id`, which is item 4. What the client
sends as `user-agent`: `request` stores the line as
received, and the `FA_GIT_SHA` bullet
(`TODO.md:2726`) says what the client sends. The
transactions the base still opens beneath the
adapter for a token rotation
(`api/authentication.ts:694-705`) and an instance
PATCH (`api/routes.ts:3870-3871`). The code grant's
transaction is this spec's, and it retires (§7).

## Sequence

1. The gate reads the body bytes once. It checks
   framing (411, 400), refuses a carried
   `request-id` (400), and requires `operation-id`
   (400). Only then does it authenticate. The
   context holds `requestId`, minted, and
   `operationId`, validated. Each is set once.
2. The handler forms each row. `request` is the
   received message in canonical form, less its
   credential lines, or zero bytes when nothing was
   received (Decision 6). `response` is in
   canonical form, with `operation-id` and
   `request-id` from the context, less its
   credential lines. `secret` holds the credential
   lines of both.
3. The statement lands the rows, writes each landed
   PUT's status, splices the date, and hashes the
   bytes it stores.
4. The handler merges `secret` back into the
   answering row's response and hands that to the
   wire. Every response the api returns carries
   this request's `request-id`.

## 1. The canonical form

One form, request and response alike:

- Field names are lowercase.
- One line per name. Repeats are joined with `, `
  in the order received. `set-cookie` is never
  joined (RFC 9110 §5.3): each cookie keeps its own
  line, in the order formed.
- Lines ascend by name, bytewise.
- A line is `name: value`, one space, the value
  trimmed.
- Lines end in CRLF. A blank line follows the last,
  then the body bytes.
- The version token is `HTTP/1.1`
  (`api/message-form.ts:22`). A response's reason
  phrase is empty, so its start line is
  `HTTP/1.1 201 `, trailing space included
  (`serializeStartLine`,
  `shared/http-message/wire-codec.ts:279-284`).
- `content-length` is kept. Parsing checks it
  against the body and keeps the line. Serializing
  writes the lines it is given and computes none.
  Setting a body sets its `content-length` in the
  same step, the one place the library computes
  it, which `modify.ts` refuses today
  (`shared/http-message/modify.ts:129-133`).
- `transfer-encoding` never appears in a stored
  message (§5).

A sender's line order, name case, and version token
are not recoverable, and nothing depends on them.
`shared/http-message` parses and serializes exactly
this form. `sortFields` becomes the canonical join
and sort. `isStoredField` and its two strips retire,
and so does the recomputation in `serializeWire`.
The JSON form (`json-codec.ts`) keeps
`content-length` as the wire form does.

## 2. The request

For a received request, `request` holds the start
line `<method> <target> HTTP/1.1`, then every header
line the request carried, less its credential lines,
then the body bytes exactly as received. The target
is the path and query the api is handed. The edge's
`/api` mount stays the edge's
(`server/http-server.ts:591-597`). The body is the
bytes the gate read, never a decoded value
re-serialized. The gate decodes JSON from those
bytes to validate, as today. `HOISTED_HEADER_NAMES`
retires: every line is stored, not six.
`user-agent` is stored as received.

Among the rows one request writes, the answering row
holds the received request. That is the row whose
response goes on the wire. Decision 6 says what the
other rows hold.

The invitation POST's former drops `email` for
`identity_id` in the body it stores
(`api/invitations-domain.ts:445-447`). The received
bytes carry the email. Item 2's PII policy and the
physical eraser inherit a request that holds PII
outside the `pii` document.

## 3. The response

`response` is the response the api hands the wire,
less its credential lines. Its lines ascend:
`content-length` and `content-type` when a body is
present, `date`, `etag`, `operation-id`,
`request-id`, and whatever lines the route adds.
`operation-id` is the id the client sent.
`request-id` is the id the server minted. Every pair
one request writes carries both, whether that pair
received anything or not, so `fa_request_id_of`
finds every pair one request wrote. `response-id`
retires, because `etag` names the same id. A seed
pair and the root answer no request and carry no
`request-id` line.

The status line is the status sent. A PUT is formed
201 and the statement settles it (§8). A DELETE
stores 204. A POST or PATCH pair keeps what today's
former writes until item 1. The former's
`responseStatus` input, which it ignores
(`api/message-pair.ts:130`, `:288-290`), retires.

A matched answer is the head's stored response with
this transmission's three lines: status 200, no
`date` line, and this request's `request-id`.
`Deno.serve` stamps its own `date` when a response
has none. That was measured on 2.9.6 while writing
this spec, and the script was not kept. `etag` and
`operation-id` stay the head's, naming its state and
the write that made it. The head's `secret` never
reaches the answer: its lines described another
transmission. One function in `api/message-pair.ts`,
`responseFromHead`, makes the substitutions, and
item 1's reads call the same one. It replaces the
status override in `responseFromLatin1`
(`api/message-pair.ts:599-623`).

## 4. Credential lines

Six names: every credential-carrying field HTTP
defines (RFC 9110 §11, RFC 6265). From a request,
`authorization`, `proxy-authorization`, and
`cookie`. From a response, `set-cookie`,
`authentication-info`, and
`proxy-authentication-info`. The list lives once, in
`shared/http-message`, beside the parser. It does
not grow with routes.

A line with one of those names is hoisted whole,
name and value, out of `request` or `response` into
`secret`. `secret` holds the hoisted lines of both
messages in canonical order, joined by CRLF, with
none trailing. It is zero bytes when there are none.
No name sits on both sides. Merging `secret` back,
each line to the message its name belongs to,
re-sorted by name, rebuilds each message exactly.
`secret_hash` is `sha256(secret)`.

Every secret a request presents rides one line:

| Grant | Line | Body keeps |
|---|---|---|
| authorize | `authorization: Basic` of `username:password` | `method`, `client_id`, `code_challenge`, `code_challenge_method` |
| `authorization_code` | `authorization: Basic` of `code:code_verifier` | `grant_type`, `client_id` |
| `refresh` | `cookie: refresh_token=…` | `grant_type`, `organization` |
| `token-exchange` | `authorization: Bearer` | `grant_type`, `organization` |
| `client_credentials` | `authorization: Bearer` of the assertion | `grant_type`, `client_id` |

Basic is RFC 7617: base64 of the UTF-8 user-id, a
colon, and the password. A username and a code hold
no colon. A code issued without a challenge is
redeemed with an empty password.

Each door's body validator refuses a body that
carries `username`, `password`, `code`,
`code_verifier`, `refresh_token`, `subject_token`,
`actor_token`, or `client_assertion`. It answers
400, names the field, and lands nothing, so no
stored request body holds a secret. The session's
own bearer never rides a door, because the door's
`authorization` line is its grant's credential.
Today `ctx.POST` attaches the session bearer to
both doors
(`web-app/app/adapters/http-facade.ts:147-149`).

A server says what it hands over once credentials
are accepted in `Authentication-Info` (RFC 9110
§11.6.3), as auth-params. Authorize answers
`authentication-info: code="…"` and no body. The
token grant answers
`authentication-info: access_token="…"`, and
`token_type` and `expires_in`, which are no secret,
stay in its body (`api/authentication.ts:112-116`).
The departure from RFC 6749 §5.1 is accepted: both
clients are ours. The refresh `set-cookie`
(`api/api.ts:1743-1758`) and the clearing cookie on
a revocation (`:1477-1484`) are attached after the
pair is stored today. Now they are formed into the
response before the statement, and hoisted like any
credential line.

The client reads both parameters from the header:
`postPasswordLogin`
(`web-app/app/adapters/authentication.ts:28-80`),
`postSessionRefresh` (`session-refresh.ts:18-38`),
`postOrganizationSessionExchange`
(`organization-session.ts:22-35`), and the raw
refresh and exchange (`http-facade.ts:199-220`,
`:222-249`) and apex probe
(`web-app/app/apex-destination.ts:25-50`).

## 5. Framing

The gate reads the body bytes once. Once
`incomingContext` has minted the request's id,
framing is the gate's first check, before anything
else:

- a `transfer-encoding` line answers 411;
- body bytes and no `content-length` answer 411;
- a `content-length` that is not the body's byte
  count answers 400.

A request with no body needs no `content-length`.
The edge's 413 stays ahead of the gate
(`server/http-server.ts:528-535`). The in-process
facade (`api/api.ts:1946-1966`) and the request
fixtures (`tests/http-fixtures.ts`) set
`content-length`, as `fetch` does. The stored
request keeps `content-length` as received.

## 6. The two ids

`request-id` names one wire request.
`incomingContext` mints it on every request and
reads no header. A request that carries a
`request-id` line answers 400 and lands nothing, on
every route, before authentication: the gate
refuses what it will not honor. Every response the
api returns carries this request's `request-id`.
The gate's exit sets it on refusals and errors, and
every stored response already holds it (§3). The
edge's two refusals ahead of the api, 413 and the
throttle's 429
(`server/http-server.ts:528-535`, `:582-586`),
carry none. `fa_request_id_of`
(`api/schema-postgres.ts:217-241`) and
`fa_message_pairs_request_id` now find rows.
Nothing reads them yet, and item 6's log join is
the first reader. The two error-log lines
(`api/api.ts:340-346`, `:1872-1878`) and the edge's
access line, which today reads `operation-id` for
writes alone (`server/http-server.ts:465-473`),
carry both ids. The client sends no `request-id`.

`operation-id` names one client operation. The gate
requires it on every request, reads and both doors
included. Missing, or not a 22-character
identifier, it answers 400 and lands nothing,
before authentication. Item 4's `/status` will be
the one exemption. It does not exist yet. The
context holds the validated value, and every reader
takes it from there. These retire:

- the exemptions for reads and doors in
  `requireOperationId`;
- the second check at `api/api.ts:883-892`;
- the `?? ''` reads;
- the server's mints;
- `headerFieldsWithOperationId`.

The request's own line is stored as received, and
the response's comes from the context. The server
never mints an `operation-id` for a request. It
rides every pair the request writes.

The client mints it in one place,
`makeRequestContext`
(`web-app/app/adapters/shared.ts:161`), once per
context, and a context is one operation: each
handler takes a fresh `sessionContext()`. The
context's `requestId` (`:184`) becomes its
`operationId`, and `reportFault` logs that. Every
verb sends it, `GET` included. No caller supplies
one. These mints retire:

- the per-write mint in `writeHeaders`
  (`shared.ts:185-198`);
- the facade's fallback
  (`http-facade.ts:161-166`);
- the in-process facade's mint
  (`api/api.ts:1961-1964`).

The recovery a 401 starts runs inside the failing
operation. Its refresh (`shared.ts:499-505`), its
re-scope reads and exchange (`:547-568`), the raw
refresh and exchange (`http-facade.ts:199-220`,
`:222-249`), and the resend all carry that
operation's id. The apex probe
(`web-app/app/apex-destination.ts:25-50`) runs
before any operation and opens a context of its
own.

Nothing looks a request up by `operation-id`. It
stops naming one write, and one reader depended on
that. `revisionMessagePairIdForPatch`
(`api/api.ts:303-322`) joins a PATCH pair to its
revision by operation, for its one caller
(`:1566-1569`). The composed statement already
returns the revision's row, so the handler takes
its id from the statement's answer, and the join
retires. The flow undo's join
(`api/derive-flows.ts:292-319`) keeps working. An
undo is its own operation
(`web-app/flows/detail.ts:313-325`), so every flow
pair that shares an undo's `operation-id` is that
undo's.

## 7. The code document

Authorize lands a PUT at
`/authentication/authorization-codes/`, named
`sha256(code)` in lowercase hex
(`deriveAuthorizationCodeId`,
`api/authentication.ts:1245-1249`). It lands in the
statement that lands authorize's own pair. Its
request is zero bytes. Its response is a 201 whose
body holds `client_id` and `code_challenge`.
`code_challenge` is absent when authorize carried
none, never null. Its requester is the
authenticated identity. Its `operation-id` and
`request-id` are authorize's. It is a genesis, so
it supersedes the nil uuid.

The grant hashes the presented code and reads that
document's head by name. No head, or a DELETE head,
answers 401 `invalid_grant`, the same bytes for a
code never issued and a code already spent.
Otherwise:

- the issuer is the head's
  `requester_identity_id`;
- `client_id` and `code_challenge` come from its
  response body;
- the issue instant is its `response_at`, the stamp
  its `date` carries. A copy in the body would be a
  second source on a second clock.

Redeeming the code is a DELETE of that document,
latched on the head the grant read. It lands in the
statement that lands the issued event and the
grant's own pair. Its request is zero bytes, and
its response a 204. How racing redeemers resolve:

- Two redeemers that read one head both name it.
  The index lands one successor and refuses the
  other with `23505`, which a composed write
  answers 412, and the grant answers 401.
- A redeemer that reads after the first has landed
  finds a DELETE head and answers 401 before it
  mints.
- A redeemer that read the genesis while the first
  landed names a head that is no longer the head.
  It is stale, nothing lands, and it answers 401.

The grant opens no transaction. These retire:

- the re-check, `authorizationCodeSpent`
  (`api/authentication.ts:1341-1352`);
- the marker, `formAuthorizationCodeMarkerPair`
  (`api/message-pair.ts:437-466`), and its path,
  `authorizationCodesPrefixFor`
  (`api/authentication.ts:1254-1261`);
- the transaction at `:1458-1484`;
- `authorizeCodeIssuer`, which the read by name
  replaces.

The body search retires with its last reader:

- `getAllWhereBody` and `getWhereBody` leave
  `EntityStore` and `Tx` (`api/db.ts:104-107`,
  `:149-152`);
- so do their implementations
  (`api/store-history-entity.ts:85-92`,
  `api/backend-postgres.ts:249-257`, `:552-573`,
  `api/backend-buffer-tx.ts:191-215`);
- `fa_message_body` and `fa_message_pairs_body`
  leave the DDL (`api/schema-postgres.ts:47-76`,
  `:253-255`, and both lists at `:257-283`).

`fa_message_body_bytes` stays, because the
statement's sameness test reads it
(`api/ledger-statement-sql.ts:137-143`).

## 8. The status of a landed PUT

The handler forms every PUT response with the start
line `HTTP/1.1 201 `. The status is bytes 10
through 12 of `response_prefix`, counting from one.
For a `PUT` row the `spliced` step computes

```sql
CASE
    WHEN $1::text = 'genesis'
        OR s.head_id IS NULL
        OR s.head_method = 'DELETE'
    THEN s.response_prefix
    ELSE overlay(
        s.response_prefix
        PLACING '200'::bytea FROM 10 FOR 3
    )
END
```

and splices the date after that prefix. The head
read (`headed`, `api/ledger-statement-sql.ts:60-75`)
selects the head's `method` beside its id, stamp,
and response. A `DELETE` row keeps 204. A `POST` or
`PATCH` row keeps its former's status. The
overwrite precedes the hashes, so `response_hash`
and `pair_hash` cover the status stored. The memory
twin (`shared/ledger-statement.ts`) does the same,
and its `Head` (`:62-68`) gains `method`. The
statement keeps fourteen parameters.

A PUT that lands and a PUT that matches both answer
200 when the document was live. Their `etag`s tell
them apart: the new pair's id, or the head's. The
store's pinned-digest row is a genesis, and stays
201.

## Error and wire

A refusal is `{"error":"<sentence>"}` (`errorJson`,
`api/http-errors.ts:64-68`), and carries this
request's `request-id`. In gate order:

| Status | Sentence |
|---|---|
| 411 | `A request body requires Content-Length` |
| 400 | `Content-Length does not match the body` |
| 400 | `Request-ID is minted by the server` |
| 400 | `Operation-ID is required` |
| 400 | `Operation-ID must be a 22-character identifier` |
| 400 | `<field> rides the <line> line` |

`<line>` is `Authorization` for the Basic and
Bearer fields and `Cookie` for `refresh_token`. The
last row is the door's body validator, which runs
before any grant does. The second `Operation-ID` sentence is
today's (`api/message-pair.ts:199-207`). The code
grant's 401 keeps today's body.

A landed answer is the stored response with
`secret` merged back. A matched answer is §3's. The
bell is unchanged.

## Testing

Layer 1, against the memory backend, in
`tests/message-plane.test.ts`. `./test postgres`,
against Postgres 18.6, in
`tests/pg-message-plane.test.ts`, ignored when
`POSTGRES_URL` is unset.

Layer 1 pins:

- The library joins repeats in order, never joins
  `set-cookie`, lowercases, ascends bytewise, and
  trims. It keeps `content-length` through parse
  and serialize and refuses a mismatch on parse.
  It fixes the version and keeps the empty reason's
  trailing space.
- A received body with unsorted keys, odd spacing,
  and a number past 2^53 is stored as those exact
  bytes.
- `authorization` and `cookie` leave `request`, and
  `set-cookie` and `authentication-info` leave
  `response`. `secret` holds them ascending,
  CRLF-joined, with none trailing. Merging rebuilds
  both messages byte for byte. With no credential
  lines, `secret` is zero bytes and `secret_hash`
  is `sha256` of zero bytes.
- `transfer-encoding` answers 411, a body without
  `content-length` answers 411, and a mismatch
  answers 400. None lands a pair, and each carries
  a fresh `request-id`.
- A carried `request-id` answers 400 on an
  authenticated route, on each door, and
  unauthenticated, landing nothing.
- Landed, matched, refused, and error responses
  all carry a `request-id`. A landed pair's stored
  response carries the same one.
- A `GET` without `operation-id` answers 400, and
  so does each door.
- Every pair one request writes carries that
  request's two ids.
- The client sends one `operation-id` per context
  on every verb, `GET` included, and no
  `request-id`. A 401's refresh, exchange,
  re-scope, and resend carry the failing
  operation's id, and so do the raw fetches.
- Each door refuses its moved body fields with
  400. Authorize by Basic answers the code in
  `authentication-info` with no body. Each grant
  accepts its line, and the refresh accepts the
  cookie alone. No stored request body holds any
  of the eight fields. The refresh `set-cookie` is
  in `secret`, not in `response`.
- Authorize lands the code document, zero request
  bytes, in one statement with its own pair. The
  grant's issue instant is the document's
  `response_at`. A second redemption answers 401
  and lands nothing. A code whose head is a DELETE
  answers the same bytes as an unknown code.
- A genesis PUT stores 201. A PUT over a live PUT
  stores 200. A PUT after a DELETE lands and stores
  201 (red first: Found on the base, 2).
- A matched answer is 200, with this request's
  `request-id`, no `date` line, and the head's
  `etag` and `operation-id`.
- A resent latched PUT answers 412. The store's pin
  stays.
- A PATCH answer's `etag` names the revision,
  taken from the statement's answer.

`./test postgres` pins:

- Two concurrent redemptions of one code: one
  mints, the other answers 401, and one DELETE
  lands (red first: Found on the base, 1).
- The status overwrite on the table, 201, 200, and
  201 as above, with digests that match the
  TypeScript twin.
- `fa_request_id_of` returns the minted id for a
  landed row.
- `fa_message_body` and `fa_message_pairs_body` do
  not exist after `ensureTable`.
- The store spec's pinned-digest row is unchanged.

Pins that change because the covenant changes, each
named in the plan:

- request-id:
  `tests/api-identifier-route-gate.test.ts:182`,
  `:192`, `:205`, `:222`, `:246`;
  `tests/api-shadow-ledger-auth.test.ts:329`,
  `:630`; `tests/adapters-shared.test.ts:117`,
  `:138`.
- operation-id on reads:
  `tests/api-operation-id.test.ts:89`.
- A modifying PUT's 201:
  `tests/api-idea-document.test.ts:161`;
  `tests/api-flow-document.test.ts:261`, `:328`,
  `:511`, `:873`;
  `tests/api-work-order-document.test.ts:410`,
  `:452`; `tests/api-objective-document.test.ts:419`;
  `tests/pg-races.test.ts:367-370`.
- The status-override source pin at
  `tests/api-write-status.test.ts:362-370`.
- The door-body tests under
  `tests/api-authentication-*.test.ts`.

Docs that change when this ships:

- `SCHEMA.md`, "What the DDL buys you" items 1, 9,
  and 12. Its `## Secrets` takes the hoist rule.
- `API.md`'s stored statuses (`:63-80`,
  `:105-107`, `:116`) and the doors.
- The generated door bodies
  (`web-app/app/generate-api-documentation.ts:312-327`,
  `web-app/api-documentation/rooms.ts:1603-1608`),
  which `./test api-docs` checks.

## For the next brainstorms

The seed spec inherits:

- The canonical form, through the same former.
  Seed pairs keep a request until item 1
  (Decision 6).
- A seed pair and the root answer no request and
  carry no `request-id` line.
- The seed mints its own operation's id, the one
  mint outside the client, as the root's store
  rule already says.
- §8's status rule, which applies to seed PUTs as
  to any statement row.

Item 1 inherits:

- Moving the application from `request` to
  `response`, and emptying the synthesized formers'
  requests (Decision 6).
- `responseFromHead`, the one function its reads
  call.
- The status a POST or PATCH pair stores.

Item 2 inherits:

- The password, a code, and every token, plaintext
  in `secret` (store Decision 1).
- PII in received request bodies: the invitation's
  email.
- The path `/authentication/authorization-codes/`,
  which `fa_api` reads by name.

Item 4 inherits the `/status` exemption. Item 6
inherits `fa_request_id_of`'s first read, and the
edge's two refusals that carry no `request-id`.

Later work inherits:

- The latched-write bullet (`TODO.md:1340`)
  inherits Decision 2. It lands no later than the
  one retry policy.
- The cross-party delegation ledger inherits
  Decision 4.
- `FA_GIT_SHA` names what the client sends as
  `user-agent`.
- The JSON parse/stringify bullet: the stored
  request body is no longer re-serialized. The
  gate still decodes it to validate, and the
  server still serializes what it forms.

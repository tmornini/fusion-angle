# API

This file is composition and wire law, not a catalog.
Families, verbs, and rooms live in `routes[]`
(`api/routes.ts`); browse them at `/api-documentation/`
(141 rooms, derived from the table). On disagreement,
the table wins. Dispatch is `handleRequest`
(`api/api.ts`). Pair formation is `api/message-pair.ts`.
Each write route's conditional is its entry in
`WRITE_RESPONSE_SPECS` (`api/routes.ts`).

## Dispatch order

`handleRequest` (`api/api.ts`) mints request-id on
every request (`incomingContext`), then `dispatched`:

1. **Framing.** `framingRefusal`. Transfer-Encoding
   is 411 `A request body requires Content-Length`,
   even when Request-ID is present. A non-empty body
   with no Content-Length is that same 411. A
   Content-Length that does not match the body is
   400.
2. **Carried Request-ID.** A carried request-id is
   400 `Request-ID is minted by the server`, with no
   bearer check. That includes an unknown path and
   both doors.
3. **Operation-ID.** Missing is 400 `Operation-ID is
   required`. A present value that is not a
   22-character identifier is 400 `Operation-ID must
   be a 22-character identifier`. No bearer check,
   including an unknown path and both doors. The
   client mints operation-id once per operation, on
   every request, and the server never mints one for
   a request. An operation-id groups the pairs of
   one operation (an instance PATCH and its
   revision). It is not a request-hash replay. A
   resent write whose state equals the head matches:
   it stores nothing and answers 200. No request hash
   is replayed.
4. **Match, then the gate.** `matchRoute`, then
   `authenticateRequest` unless the matched pattern
   is in `AUTHENTICATION_ROUTES`.
   `authenticateRequest` answers 401
   `{ error: 'invalid_token' }` even on an unknown
   path (never a route-topology oracle). Then
   unmatched 404, identifier params, `fenceRequest`,
   nested org must equal fenced org (mismatch 403,
   fixed body, no auto-exchange), `authorizeRequest`.
5. **Body parse** for PUT/POST/PATCH, then **the
   conditional** (`preconditionRefusal`): its
   presence and form, per route and verb, with no
   head read. See Conditional classes.
6. **Region B + write authorizer.** Self-only token
   routes (`SELF_ONLY_TOKEN_ROUTES`): the
   token-revocations PUT and the jti rotation and
   revocation POSTs. A member acts only on its own
   chain; an admin may name any identity. Any other
   caller is 403 by form, before any read.
   `writeAuthorizerFor` on
   org-scoped PUT/DELETE: owner-null is genesis;
   foreign 403 before pair crypto.
7. **Pair plane.** Wired writes form the received
   pair before any transaction
   (`formWriteMessagePair`). A DELETE that is not an
   operation meets the DELETE table first:
   never-written 404 (stores nothing), already-gone
   204 (no append). Then one statement judges every
   row the write forms (Conditional classes says
   how). A stale latch answers 412, even for a
   byte-identical resend.
8. **Handler.** Matched verb with `ctx.base`. Auth
   grants intercept into `postToken` / `postAuthorize`.
   Missing verb → 405.

## Bearer-exempt set

Pointer: `AUTHENTICATION_ROUTES` in `api/request-auth.ts`.
The set is `authentication/token` and
`authentication/authorize`. Nothing else. An unmatched
path is never exempt.

## Wire contract

A landed answer restores the hoisted credential lines
onto the stored response (`mergeSecret`, in
`shared/http-message/credentials.ts`, then
`responseFromLatin1`, in `api/message-pair.ts`).
The statement splices the date into a landed row, and
the status line in those bytes is the status on the
wire. A landed PUT stores 201 when no live PUT head
precedes it and 200 when it succeeds one. A PUT after
a DELETE stores 201. A POST or PATCH through the
former stores 201 when its parent document is a
genesis and 200 when the parent lands in order. The
authentication doors keep OAuth's response and store
200. DELETE stores 204, except the claim release,
which stores 200 with the work order's state. A
landed message carries Date,
ETag (quoted message-pair identifier), Operation-ID,
and Request-ID. A document PUT's ETag is its pair id,
the same value a later GET advertises. A write through
the former answers with its received pair's response:
the parent document's state, projected for the
requester, and an ETag naming the parent's new pair. A
no-op stores nothing, not even the received pair, and
answers 200 with this request's request-id, no date
line, the head's etag and operation-id, and the head's
body projected for the requester. If-Match is one
strong validator (`"<identifier>"`); an `in-order`
route also takes a comma-separated list of them, one
per document. `*`, weak, unquoted, or 64-hex yield
400, as does a list elsewhere. If-None-Match is `*`
alone.

Status ladder:

- **200** — a landed PUT over a live head; a write
  whose parent lands in order; a landed
  authentication door. Also a no-op: this request's request-id, no
  date line, the head's etag and operation-id, the
  head's body, and nothing stored
- **201** — a genesis: a landed PUT with no live
  head, including a PUT after a DELETE; a POST
  create, with `Location`; an instance create
- **204** — DELETE success (landed, or already-gone)
- **400** — bad JSON / Request-ID / Operation-ID /
  validators; a malformed If-Match or If-None-Match;
  If-None-Match on an `in-order` route; any
  conditional on a `none` route
- **404** — authenticated unmatched; DELETE
  never-written; genuine absence
- **405** — no handler; public instance PUT
- **409** — domain conflict (a rebind, a live claim by
  another member, an invitation not pending, a
  RESTRICT); a handler's genesis over a live document
  (`Document already exists at <path><name>`); a
  never-written latch refused twice with no stated
  head, the same body; a blind PUT that loses three
  times (`Document remained contended at <path><name>`)
- **410** — a retired record instance: its GET, its
  PATCH, and a create over its tombstone (the create's
  body: `Document is gone at <path><name>`)
- **411** — A request body requires Content-Length.
  The same sentence answers a Transfer-Encoding
- **412** — a stale If-Match
  (`If-Match does not match the current document at <path><name>`);
  a client's declared genesis over a live document
  (`Document already exists at <path><name>`); both
  headers sent; more tags than documents the
  operation derives from
- **428** — a `required` or `in-order` route with no
  conditional; a tag missing for a document the
  operation derives from

409 is the home of domain conflict and of what a
handler declared. 412 refuses what the client
declared: a stale If-Match or a declared genesis.

## Conditional classes

A *conditional* is the request header that says which
head a write expects. A document's *head* is its latest
PUT or DELETE pair. `If-Match: "<etag>"` names the head
the client read, so the write is *in order*.
`If-None-Match: *` declares that no live document exists
yet, so the write is a *genesis*. A write with neither is
*blind*. Each write route declares the conditional it
takes (`conditionalOf`, `api/routes.ts`). Classes A
through E are the write shapes the spec audits
(`docs/superpowers/specs/2026-09-25-state-by-put-design.md`
§1):

| Conditional | Takes | Routes |
|---|---|---|
| `optional` | If-Match, If-None-Match: *, or neither; a DELETE's useful one is If-Match (If-None-Match: * passes the gate, but a live head refuses it 412) | class A document PUTs; every DELETE but the release |
| `required` | If-Match or If-None-Match: * | class B: the flow and work-order PUTs; the instance PATCH |
| `in-order` | If-Match, one tag per document the operation derives from | class C operations: conversion, undo, claim and release, transition, binding, invitation accept, decline, and revoke |
| `none` | no conditional | class D POST creates; class E operations: the grants, token rotation and revocation |

The instance PATCH does two writes: If-None-Match: *
declares a create of the id the client minted, and
If-Match an update. Public instance PUT is 405. The
record-type POST is `optional` at the gate because it
also serves two writes: a create takes no If-Match
(400), and an edit, a class C operation on the type,
needs one (428 without it).

**The gate checks presence and form, never value.**
`preconditionRefusal` (`api/api.ts`) runs before any pair
forms and stores nothing. A `required` or `in-order`
route with no conditional is 428 (RFC 6585 §3). A
malformed tag, If-None-Match other than `*`,
If-None-Match on an `in-order` route, and any
conditional on a `none` route are 400. Both headers at
once are 412: with `*` beside a named tag one of them
fails (RFC 9110 §13.2.2).

**The statement judges the value.** A row may carry a
*latch*: the head it must follow. An
If-Match tag is an in-order latch, stale unless it names
the current head. A declared genesis is the *nil latch*:
stale over a live PUT head, and it lands over no head or
a tombstone. The instance create alone uses the
*never-written latch*: stale over any head, live or
tombstone, so a retired name never comes back. A blind
row has no latch; a blind write that loses three
succession races answers 409.

**Refusals say who declared.** A stale in-order latch is
412. A refused genesis is 412 when the client declared
it with If-None-Match: *, and 409 when a handler did,
for a document a POST create names. A never-written
latch over a tombstone is 410 Gone (RFC 9110 §15.5.11).

**The statement rule.** A *statement* is the rows of one
write, judged and stored together: one SQL statement on
Postgres (`api/ledger-statement-sql.ts`), the same
classifier in memory (`shared/ledger-statement.ts`). A
*document
row* is a row that carries a latch. In a write through
the former the received pair never does; its siblings
do. Each row is stale, matched, or land. Only a PUT or
DELETE row can match: its body equals its head's body,
byte for byte. A POST or PATCH row never matches. Then:

1. Any stale row refuses the statement. Nothing is
   stored.
2. Otherwise, if a row matched and no document row
   lands, the write is a no-op: nothing is stored, the
   received pair included, and the answer is 200 with
   the head.
3. Otherwise the statement lands. Each row whose
   outcome is land is inserted. A matched row is
   skipped and rings no bell.

A statement of blind rows only has no document row, so
it stays all-or-nothing: one matched row stores nothing.

## Compositions worth knowing

Every class C, D, and E write lands through one former,
`runStateWrite` (`api/message-pair.ts`), in one
statement. The *received pair* is the request as it
arrived. The handler reads what it merges onto and
forms each *sibling*: a document the write changes,
with its whole state and its latch. The first sibling
is the *parent*, the document the route hangs off. The
former forms each sibling pair with an empty request
and the state as its response body. It then completes
the received pair's response once: 201 for a genesis
parent and 200 for an in-order one, an ETag naming the
parent's new pair, the parent's state projected for the
requester, and `Location` naming the created id on a
POST create. Every row shares the received pair's
operation-id. A handler that forms several siblings
leaves out any later sibling whose state equals its
head; the parent is never left out, and the statement
skips it when it matches.

An in-order parent followed by later siblings carries
the head its handler read; a POST create's genesis
parent carries none. When the parent equals that head
while a later sibling lands, the parent is skipped:
the answer is 200 with the parent's head, and the
received pair's ETag names that head. The work-order transition, the
record-type edit, conversion, and invitation accept
read so.

**POST creates** (class D). Flows, work orders,
objectives, identities, record types, and invitations.
The handler declares each created document's genesis,
so a resent create answers 409 and stores nothing. The
201 answers the created document's state.

**Idea conversion.**
`POST organizations/:id/ideas/:id/conversion` in
`api/routes.ts`. 3+N pairs, one statement: the received
POST, the promoted idea in order on the client's tag,
and the project and N baselines as the handler's
geneses. It answers the idea's state.

**Flow undo.**
`postFlowUndoOp` (`api/routes.ts`); target
`resolveFlowUndoTarget` (`api/derive-flows.ts`). One
sibling, the flow's restored state, in order on the
client's tag, so a save that raced the undo makes it
412. At exhaustion the sibling is the flow's current
state: the statement matches, stores nothing, and
answers 200 with the head.

**Work-order operations.** Claim (`PUT …/claim`),
release (`DELETE …/claim`), transition
(`postWorkOrderTransitionOp`), and binding
(`postWorkOrderBindingOp`) each land one work-order
version in order on the work order's head and answer
its state. A value-bearing transition also lands the
bound instance's revision, and its If-Match names both
heads, the work order's first. A live claim by another
member and a rebind to another instance are 409 from
the head. A resent claim, a release with no live claim,
and the same binding again are no-ops.

**Invitation accept.**
`PUT identities/:id/invitations/:id` →
`acceptInvitation` (`api/invitations-domain.ts`). The
invitation lands `accepted` in order on the client's
tag; a new seat lands beside it as the handler's
genesis, stamped with the invitation's org. Decline and
revoke land the invitation alone.

**Token grant dispatch.**
`POST authentication/token` → `postToken`
(`api/authentication.ts`). `POST
authentication/authorize` → `postAuthorize`.
grant_type: authorization_code, refresh,
token-exchange, client_credentials. Authorize
method: password. passkey, provider, and oidc
answer 501. A grant keeps OAuth's response on its
received pair; its token events land beside it as
siblings (class E, no client latch). An issued jti is
the handler's genesis; a later event of a jti lands in
order on the head the handler read.

The examples move to the lines. Authorize and the
code grant use Basic. Refresh uses the cookie.
token-exchange sends one Bearer, and that token is
both subject and actor. client_credentials sends
the assertion as Bearer. `access_token` and the
code are `authentication-info`. The refresh cookie
is a `set-cookie` line. A token success body is
`{ token_type, expires_in }`. Authorize stores no
body. The code grant's 401 wire body is
`{"error":"invalid_grant"}`. `wireGrantError` maps
that from `invalid or used authorization code`, maps
a client_credentials replay of `invalid_grant` to
the same body, and maps a failure that starts with
`invalid client_assertion` to `invalid_client`. The
token door's other 401 strings pass through:
`unknown client`, `client is disabled`,
`refresh token reuse or unknown`, `token revoked`,
`token chain revoked`,
`token-exchange needs valid subject/actor tokens`,
and `invalid refresh token: ` plus one of
`malformed token`, `bad signature`,
`bad claim shape`, `unparseable claims`,
`wrong audience`, `not yet valid`, or `expired`.
`invalid_token` is the protected-route bearer
failure (`unauthorizedBearerResponse`).
`authentication/token` and
`authentication/authorize` are bearer-exempt and do
not emit it. Authorize's 401 is `invalid_grant`
(`invalid credentials`). PKCE: authorize without
S256 is 400; redeem verifies S256.

## Why composition is store-level

POSTs do not re-enter `handleRequest`. One client call
is one ledger statement: the former runs every row of
a write together. Token rotation and revocation also
re-read their heads, so they wrap that re-read and the
statement in one `backend.transaction('readwrite', …)`,
reading through `clientOn(tx)` (`api/db-backed.ts`).
Atomicity is the platform primitive, not a simulated
HTTP nest. Validators, crypto, hash, and
`serializeWire` run outside the tx. See `AGENTS.md
§ Transaction bodies await only row ops`.

## Seed pair formation

Mock seed `EXPECTED_MESSAGE_PAIR_COUNT = 2317`, root
included; bootstrap exactly 8 pairs and the root. Pinned by
`tests/mock-data-pairs.test.ts`. A pair's request holds
what was received, or nothing. A seeded row was never
received, so every seeded row stores an empty request,
as the root does. A seed row stores no `request-id`
line, and neither does the root.

## How we got here

This file was a catalog and a migration instrument. The
actual-versus-doctrinal decomposition proved each POST
composable before the tables went; now every write is a
pair append and the instrument left with its subject.

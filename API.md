# API

This file is composition and wire law, not a catalog.
Families, verbs, and rooms live in `routes[]`
(`api/routes.ts`); browse them at `/api-documentation/`
(134 rooms, derived from the table). On disagreement,
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
   resent document write whose body equals the head
   matches, stores nothing, and answers 200. A
   membership PUT whose transition is not in the
   table is 409. No request hash is replayed.
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
8. **Handler.** Matched verb with `ctx.base`. A GET
   route either selects heads (`select`,
   `api/head-reads.ts`) and the gate serves them
   through `servedResponse`
   (`api/served-response.ts`), or answers 405. A selector
   runs after the fence and throws a document's miss
   (403 for a foreign owner, 404 otherwise); the gate
   then answers a deleted head 410 and serves a live
   one (`servedSelection`). Auth grants intercept into
   `postToken` / `postAuthorize`. Missing verb → 405.

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
Request-ID, and three lines from the inserted row:
`last-modified` (that row's `response_at` as an
IMF-fixdate), `response-at` (the same column, RFC-3339
zulu, six fraction digits), and
`requester-identity-id`. A document PUT's ETag is its pair id,
the same value a later GET advertises. A write through
the former answers with its received pair's response:
the parent document's state, projected for the
requester, and an ETag naming the parent's new pair. A
no-op stores nothing, not even the received pair, and
answers 200 through the served response: this
request's date and request-id, the head's etag and
operation-id, the three lines from the head's
envelope, and the head's body projected for the
requester. A pending grant sent again is `POST
organizations/:id/invitations/`. It answers 200
and stores nothing. A membership item PUT whose
`state` is `pending` is 409. `putMembership`
rejects `pending` before `membershipTransition`. If-Match is one
strong validator (`"<identifier>"`); an `in-order`
route also takes a comma-separated list of them, one
per document. `*`, weak, unquoted, or 64-hex yield
400, as does a list elsewhere. If-None-Match is `*`
alone.

A read serves what was stored. A document GET answers
its head's stored response with three substitutions,
the lines that describe this transmission: the status
line (200), `date`, and `request-id`. It adds three
lines from the pair's envelope, the lines that
describe the write: `last-modified` and `response-at`
from `response_at` (`last-modified` is an IMF-fixdate,
which stops at the second; `response-at` is RFC-3339
zulu with six fraction digits), and
`requester-identity-id` from `requester_identity_id`.
`etag`, `operation-id`, and `content-type` stay as
stored, and `content-length` counts the body served.
A hoisted credential line is never spliced back. The
body is the stored octets but for one projection, the
only body change (`projectedBody`): a credential's
`secret` reaches no reader, admins included, and an
instance keeps the values whose attributes the reader
may read. A collection GET is `multipart/mixed` of
`application/http; msgtype=response` parts, ordered
`response_at, id`, each the response a document GET of
that head serves, three lines included. The envelope
carries `date` and `request-id` and no `etag`, since
it names no one state. A deleted head is no part of
it, and a collection that selects none answers 204.
The two membership views are that collection:
`identities/:id/invitations/` by `identity_id` and
`organizations/:id/invitations/` by
`organization_id`, each with an optional `?state=`.
`versions/:etag` serves the stored PUT the tag names,
through the same function. `versions/` is
`multipart/mixed` of every PUT pair, oldest first.
A DELETE pair is not a version. A written document's
version list is never 204. A work order's history is
its `organizations/:id/work-orders/:id/versions/`: each
version holds the `events` it recorded, so the list is
the history in chain order; `…/history` is a router 404.

Status ladder:

- **200** — a landed PUT over a live head; a write
  whose parent lands in order; a landed
  authentication door; a document GET of a live head;
  a collection GET that selects a head. Also a no-op,
  through the served response: this request's date
  and request-id, the head's etag and operation-id,
  the three lines from the head, the head's body
  projected, and nothing stored. Also a version of a
  live document, and a view or version list that
  selects at least one
- **201** — a genesis: a landed PUT with no live
  head, including a PUT after a DELETE (never a work
  order's document PUT, which supersedes only); a POST
  create, with `Location`; an instance create
- **204** — DELETE success (landed, or already-gone);
  a collection GET that selects none, including a
  membership view. A version list is not this rung
- **400** — bad JSON / Request-ID / Operation-ID /
  validators; a malformed If-Match or If-None-Match;
  If-None-Match on an `in-order` route; any
  conditional on a `none` route; a malformed
  `:membership-id` (not two identifiers joined by one
  colon); a bad `?state=` or any other query
  parameter on a view
- **404** — authenticated unmatched; DELETE
  never-written; genuine absence, as a GET of a name
  never written; a conditional work-order PUT on a work
  order never created; a tag that names no PUT pair at
  the document; a membership name whose identity is not
  the path's
- **405** — no handler, including DELETE on a
  membership; public instance PUT; GET
  `…/work-orders/:id/claim`
- **409** — domain conflict (a rebind, a live claim by
  another member, a membership transition that is not
  in the table, the last accepted admin, a
  RESTRICT); a handler's genesis over a live document
  (`Document already exists at <path><name>`); a
  never-written latch refused twice with no stated
  head, the same body; a blind PUT that loses three
  times (`Document remained contended at <path><name>`)
- **410** — a GET of a deleted document, answered
  after the fence (`Gone: <table>/<id>`), and the
  same answer on both of its version routes: a DELETE
  head, or a state-`deleted` head in a lifecycle
  family (ideas, projects, objectives, flows, record
  types). Record-type version routes pass lifecycle
  `state`, so a state-deleted record type is 410
  there, the same as a DELETE head. Beside it, a
  retired record instance's PATCH and a create over
  its tombstone (the create's body: `Document is gone
  at <path><name>`)
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
| `required` | If-Match or If-None-Match: * | class B: the flow and work-order PUTs; the instance PATCH; the organization-nest membership item `organizations/:id/invitations/:membership-id` |
| `in-order` | If-Match, one tag per document the operation derives from | class C operations: conversion, undo, claim and release, transition, binding, and the identity-nest membership PUTs (accept and decline) |
| `none` | no conditional | class D POST creates; class E operations: the grants, including the membership grant, token rotation and revocation |

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
record-type edit, and conversion read so.

**POST creates** (class D). Flows, work orders,
objectives, identities, and record types.
The handler declares each created document's genesis,
so a resent create answers 409 and stores nothing. The
201 answers the created document's state. The
membership grant is not this shape.

**Membership grant.**
`POST organizations/:id/invitations/` →
`postOrganizationInvitationGrant`
(`api/invitations-domain.ts`). Conditional `none`.
The body is `{ email, grantAt }`. A name never
written, or a declined, revoked, or removed head,
lands `pending` as the handler's genesis or in order
on the head. A pending grant sent again stores
nothing and answers that head. An accepted membership
answers 409. One email under one organization names
one document, `<organization-id>:<identity-id>`.

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
and the same binding again are no-ops. The document PUT
supersedes only; a work order is born by `POST
…/work-orders/`. History is `…/work-orders/:id/versions/`.

**Memberships.** One document at `/invitations/`,
named `<organization-id>:<identity-id>`. Five states:
`pending`, `accepted`, `declined`, `revoked`,
`removed`. There is no seat document. Two views, each
a collection GET: `identities/:id/invitations/` and
`organizations/:id/invitations/`. `?state=` selects
one state; no query selects every state an admin may
read. A member reads `accepted` and `removed` on the
organization view. Any other `?state=`, or no query,
is 403 for that member. A bad query is 400. A view
that selects none is 204.

The identity-nest item is `in-order`. Accept
(`pending` → `accepted`) and decline
(`pending` → `declined`) are the invitee's PUTs.
Accept writes that membership `accepted`. It does not
write a seat. The organization-nest item is
`required`: If-Match, or If-None-Match: * for a name
never written. Revoke, removal (`accepted` →
`removed`), a type change, and a direct `accepted`
write are the admin's PUTs there. A transition that
is not in the table is 409, and so is removing or
demoting the last accepted admin. A stale latch is
412. DELETE on a membership is 405. A membership is
never `deleted`, so its GET is never 410.

`…/versions/:etag` serves the PUT pair that tag
names. `…/versions/` serves every PUT pair,
`multipart/mixed`, oldest first. A tag that names no
PUT pair is 404.

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

Mock seed `EXPECTED_MESSAGE_PAIR_COUNT = 1882`, root
included; bootstrap nine, root included. Pinned by
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

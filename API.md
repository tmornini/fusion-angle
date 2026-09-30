# API

This file is composition and wire law, not a catalog.
Families, verbs, and rooms live in `routes[]`
(`api/routes.ts`); browse them at `/api-documentation/`
(141 rooms, derived from the table). On disagreement,
the table wins. Dispatch is `handleRequest`
(`api/api.ts`). Pair formation is `api/message-pair.ts`.
Concurrency class is `api/family-registry.ts`.

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
   resend is idempotent because a matched body
   answers 200 and stores nothing, not because a
   request hash is replayed.
4. **Match, then the gate.** `matchRoute`, then
   `authenticateRequest` unless the matched pattern
   is in `AUTHENTICATION_ROUTES`.
   `authenticateRequest` answers 401
   `{ error: 'invalid_token' }` even on an unknown
   path (never a route-topology oracle). Then
   unmatched 404, identifier params, `fenceRequest`,
   nested org must equal fenced org (mismatch 403,
   fixed body, no auto-exchange), `authorizeRequest`.
5. **Body parse** for PUT/POST/PATCH.
6. **Region B + write authorizer.** Self-only token-
   revocations (member revokes own chain; admin may
   name any identity). `writeAuthorizerFor` on
   org-scoped PUT/DELETE: owner-null is genesis;
   foreign 403 before pair crypto.
7. **Pair plane.** Wired writes form the pair pre-tx
   (`formWriteMessagePair`). A matched body stores
   nothing and answers 200. A stale If-Match answers
   412 with `If-Match does not match the current
   document at <path><name>`; that 412 is not
   skipped for a byte-identical resend. If-Match
   table, instance PATCH table, DELETE
   never-written 404 (stores nothing) /
   already-gone 204 (no append).
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
onto the stored response (`mergeSecret`, then
`responseFromLatin1`, both in `api/message-pair.ts`).
The statement splices the date into a landed row, and
the status line in those bytes is the status on the
wire. A landed PUT stores 201 when it creates and 200
when it modifies. A PUT after a DELETE stores 201.
POST and PATCH store the status their formers write:
201, except the authentication doors, which store
200. DELETE stores 204. A landed message carries
Date, ETag (quoted message-pair identifier),
Operation-ID, and Request-ID. A document PUT's ETag
is its pair id, the same value a later GET
advertises. A landed instance-detail PATCH sends the
revision row's ETag. If that row is missing, the
response has no ETag. A matched body stores nothing
and answers 200 with this request's request-id, no
date line, and the head's etag and operation-id.
If-Match is exactly one strong validator
(`"<identifier>"`); `*`, weak, lists, unquoted, or
64-hex yield 400.

Status ladder:

- **200** — a matched body: this request's request-id,
  no date line, the head's etag and operation-id, and
  nothing stored. Also a landed PUT that modifies,
  and a landed authentication door
- **201** — a landed PUT that creates, including a PUT
  after a DELETE, and a POST or PATCH whose former
  wrote 201: the stored response bytes
- **204** — DELETE success (landed, or already-gone)
- **400** — bad JSON / Request-ID / Operation-ID /
  If-Match / validators
- **404** — authenticated unmatched; DELETE
  never-written; genuine absence
- **405** — no handler; public instance PUT
- **409** — domain conflict (rebind, invitation not
  pending, instance tombstone create without pin); a
  second genesis (`Document already exists at <path><name>`);
  a blind PUT that loses three times
  (`Document remained contended at <path><name>`)
- **411** — A request body requires Content-Length.
  The same sentence answers a Transfer-Encoding
- **412** — a stale If-Match:
  `If-Match does not match the current document at <path><name>`
- **428** — missing If-Match over live locked PUT,
  live instance PATCH / value-bearing transition, or a
  latched operation over a live parent document

409 remains the home of domain conflict and holds the
two store sentences above. 412 is a stale If-Match.

## Two PUT classes

`concurrency` on `FAMILY_REGISTRY`
(`api/family-registry.ts`), plus instance PATCH:

- **simple** — a matched body answers 200 with this
  request's request-id, no date line, and the head's
  etag and operation-id, and stores nothing. A landed
  create answers 201. A landed modify answers 200.
  A second genesis answers 409
  (`Document already exists at <path><name>`). A blind
  PUT that loses three times answers 409
  (`Document remained contended at <path><name>`)
- **locked** — live family is flows only. If-Match is
  one quoted identifier. A live document with no
  If-Match answers 428. A stale If-Match answers 412
  (`If-Match does not match the current document at <path><name>`).
  A genesis with no If-Match stores 201. A landed
  modify stores 200. A second genesis answers 409
  (`Document already exists at <path><name>`). A
  matched body answers 200 with this request's
  request-id, no date line, and the head's etag and
  operation-id, and stores nothing
- **latched operation** — a sub-resource POST that acts
  ON its parent document (flow undo today,
  `LATCHED_OPERATION_ROUTE_PATTERNS`). If-Match pins the
  PARENT head, not the operation's own path: absent
  → 428; malformed → 400; ≠ head → 412. No parent head
  at all is absence, not conflict — the gate stands
  aside and the handler 404s. The pin rides
  `pinnedDocumentMessagePairId` and is re-verified
  in-transaction, so the 412 names a real racer rather
  than the server's own resolution timing
- **instance PATCH** — public PUT is 405
  (`INSTANCE_DETAIL_PATTERN`). A pin is a well-formed
  If-Match (malformed is 400). Never-written + no pin
  → create; live head requires If-Match; DELETE head
  + no pin → 409. A landed answer sends the revision
  row's ETag. If that row is missing, the response
  has no ETag

## Compositions worth knowing

Six interiors. Each is store primitives in one
`db.transaction(fn)`, not nested HTTP.

**Idea conversion.**
`POST organizations/:id/ideas/:id/conversion` in
`api/routes.ts`. 3+N pairs, one transaction: gate op +
project document + idea promoted + N baselines.

**Flow undo.**
`postFlowUndoOp` (`api/routes.ts`); target
`resolveFlowUndoTarget` (`api/derive-flows.ts`).
Restore: op + locked flow document (2 pairs).
Exhaustion: op only. If-Match is REQUIRED and pins the
flow document head the caller saw — the resolution walk
runs outside the transaction, so without the pin a 412
would report the server's own read timing rather than a
conflict.

**Work-order transition.**
`postWorkOrderTransitionOp` (`api/routes.ts`). Pure
move: op only. Value-bearing: op + instance revision.
If-Match preconditions the bound instance.

**Work-order binding.**
`PUT .../work-orders/:id/binding` →
`postWorkOrderBindingOp` (`api/routes.ts`). 1 pair.
Create-only; different pair → 409.

**Invitation accept.**
`PUT identities/:id/invitations/:id` →
`acceptInvitation` (`api/invitations-domain.ts`).
Pending + new seat: seat document + acceptance op.
Seat stamped with the invitation's org.

**Token grant dispatch.**
`POST authentication/token` → `postToken`
(`api/authentication.ts`). `POST
authentication/authorize` → `postAuthorize`.
grant_type: authorization_code, refresh,
token-exchange, client_credentials. Authorize
method: password. passkey, provider, and oidc
answer 501.

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
is one transaction: they compose store primitives
inside `db.transaction(fn)` (`api/db.ts`).
Atomicity is the platform primitive, not a simulated
HTTP nest. Validators, crypto, hash, and
`serializeWire` run outside the tx. See `AGENTS.md
§ Transaction bodies await only row ops`.

## Seed pair formation

Mock seed
`EXPECTED_MESSAGE_PAIR_COUNT = 1454`; bootstrap
exactly 8. Pinned by `tests/mock-data-pairs.test.ts`.
A seed pair stores a request-id. The root does not
(`mintRootBind` in `api/ledger-root.ts`).

## How we got here

This file was a catalog and a migration instrument. The
actual-versus-doctrinal decomposition proved each POST
composable before the tables went; now every write is a
pair append and the instrument left with its subject.

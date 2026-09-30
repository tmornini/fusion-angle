# API

This file is composition and wire law, not a catalog.
Families, verbs, and rooms live in `routes[]`
(`api/routes.ts`); browse them at `/api-documentation/`
(141 rooms, derived from the table). On disagreement,
the table wins. Dispatch is `handleRequest`
(`api/api.ts`). Pair formation is `api/message-pair.ts`.
Concurrency class is `api/family-registry.ts`.

## Dispatch order

`handleRequest` (`api/api.ts`) runs six steps:

1. **Match.** `matchRoute` first and pure. Unmatched is
   not 404 yet.
2. **Gate** (skipped only if the matched pattern is in
   `AUTHENTICATION_ROUTES`). `authenticateRequest` →
   401 `{ error: 'invalid_token' }` even on unknown
   paths (never a route-topology oracle). Then
   Request-ID (if present, a 22-character identifier),
   unmatched 404, identifier params, `fenceRequest`,
   nested org must equal fenced org (mismatch 403,
   fixed body, no auto-exchange), `authorizeRequest`.
3. **Body parse** for PUT/POST/PATCH. Live
   `requireOperationId` runs before body parse. The
   client supplies Operation-ID; the server never
   mints it for a public write. An Operation-ID
   groups the pairs of one operation (an instance
   PATCH and its revision). It is not a request-hash
   replay. A resend is idempotent because a matched
   body answers 200 and stores nothing, not because a
   request hash is replayed.
4. **Region B + write authorizer.** Self-only token-
   revocations (member revokes own chain; admin may
   name any identity). `writeAuthorizerFor` on
   org-scoped PUT/DELETE: owner-null is genesis;
   foreign 403 before pair crypto.
5. **Pair plane.** Wired writes form the pair pre-tx
   (`formWriteMessagePair`). A matched body stores
   nothing and answers 200. A stale If-Match answers
   412 with `If-Match does not match the current
   document at <path><name>`; that 412 is not
   skipped for a byte-identical resend. If-Match
   table, instance PATCH table, DELETE
   never-written 404 (stores nothing) /
   already-gone 204 (no append).
6. **Handler.** Matched verb with `ctx.base`. Auth
   grants intercept into `postToken` / `postAuthorize`.
   Missing verb → 405.

## Bearer-exempt set

Pointer: `AUTHENTICATION_ROUTES` in `api/request-auth.ts`.
The set is `authentication/token` and
`authentication/authorize`. Nothing else. An unmatched
path is never exempt.

## Wire contract

A landed answer is the stored response bytes
(`responseFromLatin1` in `api/message-pair.ts`). The
statement splices the date, and the status line in
those bytes is the status on the wire. PUT, PATCH, and
POST store 201. DELETE stores 204. The stored message
carries Date, ETag (quoted message-pair identifier),
and Operation-ID. A document PUT's ETag is its pair id,
the same value a later GET advertises. A matched body
answers 200 with the head's stored response and stores
nothing. If-Match is exactly one strong validator
(`"<identifier>"`); `*`, weak, lists, unquoted, or
64-hex yield 400.

Status ladder:

- **200** — a matched body: the head's stored response,
  and nothing stored
- **201** — a landed PUT, PATCH, or POST: the stored
  response bytes
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

- **simple** — a matched body answers 200 with the
  head's stored response and stores nothing. A landed
  write answers with the stored response bytes (201).
  A second genesis answers 409
  (`Document already exists at <path><name>`). A blind
  PUT that loses three times answers 409
  (`Document remained contended at <path><name>`)
- **locked** — live family is flows only. If-Match is
  one quoted identifier. A live document with no
  If-Match answers 428. A stale If-Match answers 412
  (`If-Match does not match the current document at <path><name>`).
  A genesis with no If-Match stores 201. A second
  genesis answers 409
  (`Document already exists at <path><name>`). A
  matched body answers 200 with the head's stored
  response and stores nothing
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
  + no pin → 409

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
(`api/authentication.ts`). grant_type:
authorization_code, refresh, token-exchange,
client_credentials. Success JSON
`{ access_token, token_type, expires_in }` — no
`refresh_token`. 401 classes: `invalid_token`,
`invalid_client`, `invalid_grant`. PKCE: authorize
without S256 is 400; redeem verifies S256.

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

## How we got here

This file was a catalog and a migration instrument. The
actual-versus-doctrinal decomposition proved each POST
composable before the tables went; now every write is a
pair append and the instrument left with its subject.

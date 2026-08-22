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
   mints it for a public write.
4. **Region B + write authorizer.** Self-only token-
   revocations (member revokes own chain; admin may
   name any identity). `writeAuthorizerFor` on
   org-scoped PUT/DELETE: owner-null is genesis;
   foreign 403 before pair crypto.
5. **Pair plane.** Wired writes form the pair pre-tx
   (`formWriteMessagePair`). Replay via
   `storedResponseFor` unless exempt. After miss:
   If-Match table, instance PATCH table, same-body
   document PUT (200, no append; octets, not ETag),
   DELETE never-written 404 (stores nothing) /
   already-gone 204 (no append).
6. **Handler.** Matched verb with `ctx.base`. Auth
   grants intercept into `postToken` / `postAuthorize`.
   Missing verb → 405.

Replay of a locked write runs before the If-Match table
so a byte-identical resend does not 412 against the new
head.

## Bearer-exempt set

Pointer: `AUTHENTICATION_ROUTES` in `api/request-auth.ts`.
The set is `authentication/token` and
`authentication/authorize`. Nothing else. An unmatched
path is never exempt.

## Wire contract

The response is rebuilt from the stored row
(`responseFromStored` in `api/message-pair.ts`). Four
headers (`wireHeadersFor` + `attachEtag`): Date,
Response-ID, Operation-ID, ETag (quoted 64-hex
`documentVersion`). Replay returns the original,
including Date. If-Match is the sole conflict
mechanism: exactly one strong validator (`"<hex64>"`);
`*`, weak, lists, or unquoted yield 400.

`sendWriteResponse` sets send-time status: 201 if this
request appended a pair (PUT/PATCH/POST), 200 if it
stored nothing, DELETE 204. The stored start-line stays
GET-shaped 200 / DELETE 204.

Status ladder:

- **200** — same-body document PUT (no append); stored
  PUT start-line
- **201** — first append of PUT/PATCH/POST
- **204** — DELETE success (live or already-gone)
- **400** — bad JSON / Request-ID / Operation-ID /
  If-Match / validators
- **404** — authenticated unmatched; DELETE
  never-written; genuine absence
- **405** — no handler; public instance PUT
- **409** — domain conflict (rebind, invitation not
  pending, instance tombstone create without pin)
- **412** — stale If-Match
- **428** — missing If-Match over live locked PUT or
  live instance PATCH / value-bearing transition

409 is domain; 412 is concurrency.

## Two PUT classes

`concurrency` on `FAMILY_REGISTRY`
(`api/family-registry.ts`), plus instance PATCH:

- **simple** — same-body as live head → 200, no append;
  first append 201
- **locked** — live family is flows only. If-Match
  quoted 64-hex. live+absent → 428; live+≠ head → 412;
  genesis with no If-Match → 201
- **instance PATCH** — public PUT is 405
  (`INSTANCE_DETAIL_PATTERN`). A pin is a well-formed
  If-Match (malformed is 400). Never-written + no pin
  → create; live head requires If-Match; DELETE head
  + no pin → 409

## Compositions worth knowing

Six interiors. Each is store primitives in one
`db.transaction(MESSAGE_TABLES)`, not nested HTTP.

**Idea conversion.**
`POST organizations/:id/ideas/:id/conversion` in
`api/routes.ts`. 3+N pairs, one transaction: gate op +
project document + idea promoted + N baselines.

**Flow undo.**
`postFlowUndoOp` (`api/routes.ts`); target
`resolveFlowUndoTarget` (`api/derive-flows.ts`).
Restore: op + locked flow document (2 pairs).
Exhaustion: op only.

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
inside `db.transaction(MESSAGE_TABLES)` (`api/db.ts`).
Atomicity is the platform primitive, not a simulated
HTTP nest. Validators, crypto, hash, and
`serializeWire` run outside the tx. See `AGENTS.md
§ Transaction bodies await only row ops`.

## Seed pair formation

Mock seed
`EXPECTED_MESSAGE_PAIR_COUNT = 1448`; bootstrap
exactly 8. Pinned by `tests/mock-data-pairs.test.ts`.

## How we got here

This file was a catalog and a migration instrument. The
actual-versus-doctrinal decomposition proved each POST
composable before the tables went; now every write is a
pair append and the instrument left with its subject.

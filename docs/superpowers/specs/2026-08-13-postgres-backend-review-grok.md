# Critique — 2026-08-12 Postgres backend design spec

Date: 2026-08-13
Author: Grok 4.6 (this session)
Sibling: `go-to-church-state-vivid-raccoon.md` (prior
review of the same spec; different findings — do not
collapse them).

Spec:
`docs/superpowers/specs/2026-08-12-postgres-backend-design.md`
Status on disk: approved, amended per reviews 2026-08-12.

Four read-only investigations checked storage/wire, auth,
the GET catalog, and doc dispositions against live
`api/`, `SCHEMA.md`, `ARCHITECTURE.md`, and the If-Match
/ work-order SoT specs. Line cites are current as of this
write.

## Verdict

The spec is a strong storage-and-server design that is
not yet a safe implementation authority. BYTEA,
no-extraction, keyed reads, dual-ZIP-then-yank, and the
A1–A6 dispositions are real. It still silently
contradicts two approved locking specs, classifies only
a slice of the GET surface, and leaves the client/server
split thinner than the server ZIP requires.

Treat this as approved direction, not locked law. Do not
start Phase A until three contradictions are written
down and decided:

1. Wire `ETag` / `If-Match` byte source (this spec vs
   If-Match unification).
2. The `follows` unique column (keep-and-rename vs drop).
3. A complete GET classification (the catalog is not
   "every GET").

Until those are settled, two implementers can both
follow "approved" docs and build different products.

## What holds

The storage argument is the best part of the document.

- **BYTEA of `serializeWire` octets** is the right
  stored form. Today the pair is `canonicalJson` TEXT
  (`api/message-pair.ts` 192–205). `parseWire` counts JS
  string length as bytes
  (`shared/http-message/wire-codec.ts` 145–151). UTF-8
  TEXT would mis-frame on the first non-ASCII body. The
  rejection of JSONB and TEXT is earned.
- **No-extraction**, with one GIN expression index, is
  coherent. The app already knows `route`, `method`,
  `etag`, and chain ids at pair formation.
- **Keyed reads** name a real pathology. Single-document
  GETs still scan a family prefix (`document-family.ts`,
  `derive-flows.ts`). History often fetches the family
  and filters. `resolveFlowGraphOwner` walks every org's
  `/flows/` (`derive-states.ts` 167–196).
  `derive-state-field-values.ts` 187–188 is a true
  `getAll()`. Killing that on the server path is
  independently worth doing.
- **A1–A6 map 1:1** onto `ARCHITECTURE.md` § Server-tier
  deploy blockers. The A7–A12 numbers are this spec's
  invention; the six remaining seams are not.
- **W19 / W21** (notify inside the write transaction;
  `schema_marker` inside import) close two windows the
  IndexedDB tier still has: notify-after-rollback, and
  marker stamped after `putSnapshot` commits
  (`api/db-backed.ts` 137–141).
- **Phase order** (covenant break → render-at-write →
  Postgres → server ZIP → work-order follow-on → yank)
  is the right dependency order for a dual-ZIP world.
- **Honest residuals:** A3 (verbatim ledger), A7
  (delegation stays 403), A8 (emit `pg_notify`, no SSE),
  no data migration.
- The house precedent for loud snapshot reject is real
  (`SCHEMA.md` timestamp-width pin).

## Blockers

### B1 — W14 ETag vs locked If-Match

Live concurrency is **pair id**, not `responses.etag`:

- Instance GET advertises `ETag: "<pairId>"`
  (`api/api.ts` 1000–1021).
- Locked flow GET advertises `Response-ID: <pairId>`
  (954–998).
- Column `responses.etag` is `bodyEtagOf` — sha256 of
  body octets — and `SCHEMA.md` 175–178 says it is
  **unrelated** to the wire ETag.

The approved If-Match spec locks that:

> Changing the byte source of the strong validator
> (stays document-pair **response id**, never
> `responses.etag` body-hash).
> **D4** — Wire ETag / If-Match carry the head
> document-pair **response id**.

This spec's W14 makes every PUTable GET emit `ETag` =
sha256 of the stored wire with `ETag` and `Date`
omitted, and stores that hash in the `etag` column.
Clients that echo `ETag` into `If-Match` would then send
a content hash into a gate that still compares to
`head.pairId` (`api.ts` 918, `routes.ts` 2611). That
412s every locked write.

Cross-references name measurement and clients-table.
They do **not** name:

- `docs/superpowers/specs/2026-08-05-optimistic-
  locking-if-match-unification-design.md`
- `docs/superpowers/specs/2026-08-07-if-match-
  unification-amendments-design.md`
- the work-order SoT spec (same pair-id ETag)

Phase A calls this a covenant break. It does not say it
**overturns D4**, and it does not say how `If-Match` is
parsed after the flip.

Decide one dialect, in this spec:

- **A — keep D4.** `ETag` / `If-Match` stay pair id.
  Column `etag` may become W14 for
  `/versions/<etag>` only. Live `ETag` is not a
  versions address (already true for instances).
- **B — overturn D4.** Advertised `ETag` and
  `If-Match` become the content hash. Rewrite the
  If-Match gate, instance PATCH, flow lock, and
  work-order transition together.

Option A fits "`Response-ID` stays the locator."
Option B is a second platform cut. Mixing them is a
defect.

The raccoon critique (B1) proposes etag-resolved
If-Match. That is Option B with a lookup step. It is a
valid disposition only if this spec explicitly
supersedes D4.

### B2 — `follows` unique: keep-and-rename vs drop

Today the 412 race backstop is UNIQUE
`responses.follows` (`api/db.ts` 336). Simple-class
`supersedes` is **not** unique.

If-Match D5 / D6:

> **Not accepted:** … Renaming UNIQUE follows under a
> new column name.
> `follows` **Removed.** Race → in-tx head assert.
> Predecessor → hoisted If-Match.

This spec does the rejected rename: `follows` →
`replaces_response_id`, UNIQUE partial index, 23505 →
412. It also deletes `Supersedes` (both specs agree on
that).

So the later spec restores the column the earlier spec
spent a design cycle removing. That needs an explicit
"D5/D6 superseded, because …" or this spec must adopt
the in-tx head assert and drop the column.

Advisory address locks do **not** replace that decision.
They serialize some gates; they are not the If-Match
claim.

### B3 — GET catalog is not complete

The spec says every GET pattern is classified. Live
GETs it does not classify include:

- `identities` / `:id` / `pii` / `credentials` /
  `registration` / `default-org`
- `identity-tokens`, `identity-token-revocations/:id`,
  `identity-providers`
- `organizations/:id`
- `ideas/:id/submissions`, `projects/:id/flows`,
  `flows/:id/records`, `flows/:id/work-orders`,
  `flows/:id/tags/:name`
- record-type attributes
- `objectives/:id/revisions`, project objective scores
- `invitations/sent` (second list)
- every live `/history` route (catalog only names
  future `/versions`)
- `GET objectives/history` (bulk trio history — not
  FOLLOW-ON, not STREAM)

`identities` is a registered PUTable family
(`family-registry.ts` 111–121). `flows/:id/tags/:name`
is the template "no table" family. Leaving them out
means the conversion wave has no rule for the spine.

Several classified rows are also wrong:

- **Flows are not a trio GET.** `flowEntityOf` does not
  stamp `state` / `state_at` / `state_event_id` /
  `organization_id`. It adds `graph` + approximate
  `hasUndoHistory` (`derive-flows.ts` 72–108).
- **Members GET** stamps trio and **not**
  `organization_id` (global parent).
- **Invitation "earliest-wins"** is the write gate.
  Derive is kind priority (acceptance → decline →
  revocation), not earliest `at`.

A wave that "converts every STREAM family at once"
cannot be scheduled from this table.

## Major

### M1 — Client graph is not "one facade file"

`ClientFacadeAdapter` is `GuardedDbAdapter &
LatencySimulation` (`api/api.ts` 1419–1420). Page verbs
call `handleRequest(adapter, new Request(
'http://localhost/' + resource))`. `shared.ts` and
`init.ts` import `api/api.ts` and `access-token.ts`.
Session seed **mints** an anonymous JWT in the page
(`init.ts` 62–96).

The spec wants a server-ZIP client that imports neither
file, with "the same `ClientFacadeAdapter` shape." That
shape **is** the database. Fetch cannot grow
`transaction()` / `requests.getAllWhere()` without
exposing the store over HTTP.

What actually has to move:

- Verb helpers (`GET` / `PUT` / `PATCH` / `DELETE` /
  `POST`) to a fetch facade.
- `decodeAccessToken` / `principalFromToken` into
  `shared/` (decode only; the page cannot verify
  without the key).
- Anonymous boot: a public grant, or drop the anonymous
  JWT and teach `sessionIsAuthenticated` "no token."
- Org exchange, refresh, and `session-credentials`
  localStorage (XSS → refresh token survives A1).

The metafile test (no `SIGNING_KEY_MATERIAL`, no
`backend-indexeddb`) is the right gate. The graph
surgery is not specified.

### M2 — Origin dispatch is unspecified

API URLs are `http://localhost/${resource}` (`api.ts`
134, 1481). Pages are `{dir}/{file}.html`. That can
work (`GET /ideas` vs `/ideas/index.html`) if the
server's rule is written. The spec never writes it:
prefix, extension split, unknown-path posture, hashed
asset `Cache-Control`.

### M3 — A4 spent-`jti` is the wrong shape

Today:

- `verifyClientAssertion` does not return `jti`
  (`client-assertion.ts` 19–21).
- `claimsFault` does **not** require `jti` (89–120).
  Omit `jti` and the GIN probe never fires.
- Grant **response** is `{ access_token, refresh_token,
  token_type, expires_in }` (`authentication.ts`
  262–267). Stored body **is** the HTTP body.

Writing assertion `jti` onto that body either publishes
a misleading `jti` on the OAuth token response (stored
≡ served) or splits stored from served (fights
render-at-write). RFC 6749 clients will ignore the extra
field; humans will confuse it with the access-token
`jti` minted at line 251.

The house already has the right pattern: a spent
address is a pair family (flow tags, token events).
`PUT authentication/assertion-jtis/:jti` with stored
`{ exp }` is a keyed head probe, no GIN, no OAuth
pollution, no new table. Absence of the row is "not
spent."

A4 must also **require** assertion `jti` at verify
time, or RFC 7523 uniqueness is optional in practice.

The raccoon critique (its B2) names a concurrent-replay
race on the GIN probe (grants take neither lock). That
race is real **if** A4 stays a probe of committed
bodies. A spent-jti pair family with create-only PUT
closes it the same way instance genesis does (409 on
spent address) and does not need a third advisory lock.

### M4 — Render-at-write is a cache, and invitations
show it

The document insists this is not a materialized view:
one stored body, written in the write's own
transaction. For a document PUT whose response **is**
the GET representation, that is just HTTP.

The cache appears in the **op→parent** class: claim,
release, transition, binding, invitation
accept/decline/revoke must append a synthesized parent
pair so the streamed GET stays current. Miss a call
site and GET lies until the next parent write. That is
invalidation.

Invitations make it concrete: they are in op→parent
(parent document must update) **and** invitation list
is ASSEMBLE from ops (parent body is not the list's
source of truth). If detail streams the synthesized
parent and the list still derives from ops, those two
views can diverge. If detail also stays assembled, the
synthesized parent is an unused second copy.

`hasUndoHistory` is documented as a **cheap
approximation** (`api/types.ts` 1127–1135) with a known
false positive after undo-to-genesis. Storing that
boolean as a STREAM fact freezes the approximation
into the ledger.

Today's derive reads **request** bodies
(`derive-documents.ts` 120: `requestBodyOf(
request.message)`). After conversion, collection SQL
reads **response** `message_body`. That flip is
intended; implementers who port `deriveDocumentsAt`
into SQL will get the wrong column.

Trio GET is not "copy the PUT body." It is
lifecycle-current under genesis-wins-under-skew
(`derive-ideas.ts` 47–76). The renderer needs a chain
fetch that includes the pair being written. Feasible
in-tx (undo already synthesizes a document pair). Easy
to get subtly wrong. Parity pins are mandatory, not
ceremonial.

(The raccoon M1 — unnamed shape evolution after
render-at-write — stands beside this. Stored heads
serve old shapes; collections can mix shapes. Name
pre-customer reseed now, re-render as future work.)

### M5 — Work-order hole is larger than "follow-on"

The wave is blocked on another session, yet this spec
already locks the re-verb (claim PUT/DELETE, binding
create-only PUT, transition stays POST) and lists WO
ops in op→parent. Workbox already consumes `instanceId`
/ `recordTypeId` overlay plus inbox fields from
`flowGraph`. Binding is an N+1 on `GET work-orders`
(`routes.ts` 5197–5230). Two whole-plane WO scans still
exist.

That is enough to write the follow-on now, or to stop
pretending Phase B can "convert STREAM families" while
the inbox's main collection is unclassified.

### M6 — Security residual understated

What the spec gets right:

- A1 is the real blocker. Anyone with the bundle can
  mint any `sub`; the anonymous seed is only the
  documented path.
- A5 must die on the server ZIP. `BOOTSTRAP_ROUTES` is
  four snapshot routes, bearer-exempt with no schema
  gate (`request-auth.ts` 51–57). That includes
  **unauthenticated wipe** (`DELETE /snapshots/schema`),
  not only dump.
- A3 residual is real: DBA/`pg_dump` of BYTEA is
  session theft. Token-at-rest hashing is correctly
  future.

What it understates:

- The verbatim ledger is richer than K.3.
  `ARCHITECTURE.md` 382–386 also names **passwords**,
  usernames, authorization codes, and full
  `client_assertion` JWS. Password-loop authorize
  stores the request body including `password`.
- Soft PKCE is **production web login**
  (`web-app/app/adapters/authentication.ts` sends no
  `code_challenge`), not a test leftover. A6 is
  required.
- There is no public/confidential client field
  (`ClientRegistrationEntity` is grant_types,
  redirect_uris, jwks, aud, status). A6's "public vs
  `client_assertion` JWS" is a behavior split, not a
  registration bit.
- `ROUTE_POLICY` already has admin on `/`. Snapshots
  are absent from `MEMBER_VERBS`. A5 is "remove the
  exemption + seed below HTTP," not "invent an admin
  realm."
- 401s are not opaque (`invalid client_assertion: ` +
  reason). Spec only pins 500.
- Access tokens stay valid until `exp` (≤ 15 min)
  after revocation. Named covenant; still part of
  "database read = session theft."

Shipping a multi-user server with live passwords and
refresh tokens in BYTEA, no SSE, and a 15-minute
revocation lag is a **demo server**, not a production
posture. The spec is mostly honest about that. The
disposition table's "A3 RE-GATE" reads stronger than
K.3.

## Operability

**Phase A is the blast radius.** It changes stored
message form, every hash, both chain fields, request
`route`/`method`, `/history` → `/versions`,
`successBody` typing, and invalidates every IndexedDB
origin **before** Postgres exists. The working browser
product takes the break first. That is correct for one
covenant, and it is also the commit most likely to
stall the whole program.

**Single-process `nowUtc()`** (`api/types.ts` 387–416)
is correctly named a covenant. Two Node processes will
mint colliding or backward `at` values and corrupt
latest-wins. Write "one replica until a mint realm
exists" as an ops constraint, not a footnote.
`POOL_MAX = 10` in one process is fine; a load-balanced
pair is not.

**`./test-postgres` outside `./validate`** keeps the
default gate fast. It also means the fourth backend can
rot unless CI is obligated. Name that obligation.
Isolation via `CREATE SCHEMA` + `search_path` is the
right default.

**scrypt N=2^17, r=8** is ~128 MiB per hash; Node's
default `maxmem` is 32 MiB and will throw (spec is
right). `seedHumanCredentials` is `Promise.all` over
every human (`mock-data.ts` 206–217). Server seed with
production scrypt can OOM. Tests already inject a cheap
hasher (`tests/mock-seed.ts`). Keep that injection; do
not flip `CURRENT_PASSWORD_HASH` for mock seed.

**A8 without a listener:** two browsers on one database
stay stale until navigation. TEST-PLAN's first real
multi-user case will look broken. Either ship a minimal
SSE in Phase D or write that residual into the manual
plan so it is not filed as a regression.

**postgres.js in `devDependencies`, bundled into
`server.mjs`:** matches "zero runtime packages at
unzip." README must name the exception (spec already
says so; out of scope for this file).

**Advisory locks on 52 bits of sha256:** collision only
serializes unrelated work. Do not claim uniqueness.
Correct.

**DDL CHECKs** are tighter than JS validators
(`uri_prefix` leading `/`; id charset). Hand-edited
snapshots that import today will die on Postgres. Say
that next to the loud-reject story.

Live storage vs proposed DDL (Phase A must re-baseline;
the spec already says hashes change once):

- Proposed `message bytea` = `serializeWire`.
  Live: `message: string` = `canonicalJson`.
- Proposed `message_hash` of BYTEA octets.
  Live: `sha256Hex` of JSON UTF-8.
- Proposed `etag` = sha256(wire minus ETag/Date).
  Live: sha256(body base64 or `''`).
- Proposed `replaces_response_id` only.
  Live: `follows` **and** `supersedes`.
- Proposed `route`, `method` on requests.
  Live: absent; `assertOnlyKeys` would reject.
- Proposed 4th backend `backend-postgres.ts`.
  Live: 3 backends.
- Proposed GIN `message_body(message) @>`.
  Live: no store-level body query.
- Proposed extended seam.
  Live: `getWhere(column, key)` equality only.

Route CHECK `^[a-z0-9:/-]+$` is safe for every live
`route('…')` string today (hyphens, no underscores).

Pair count 1498 can hold across a hash/etag re-baseline;
the pin is row count, not hash identity.

## Doctrine (this codebase's own terms)

- **Derive from the ledger.** Render-at-write for
  document PUT is REST. Render-at-write via synthesized
  parent pairs is a derived cache beside the op ledger.
  The spec's "no second copy" line is true only if no
  op is allowed to change a STREAM GET without
  rewriting that GET. That is a discipline, not a
  schema property.
- **Process first.** Spent assertion `jti` wants an
  event address, not a fact smuggled into an OAuth
  token body and recovered with `@>`.
- **One voice.** `/history` → `/versions` is fine.
  Reusing `flows/:id/versions` (today a retired 404)
  for the pair chain is a named succession and needs
  the 404 pin **before** the flip, as the spec says.
  Do that.
- **Execute the request, not the request plus
  improvements.** One document containing schema,
  server, security, build, hashing, versions, and a
  work-order re-verb is why the GET catalog and
  If-Match collision shipped. The work-order follow-on
  is an admission that the "one comprehensive spec"
  decision already failed for the hardest family.

## What to amend before Phase A

1. **Explicit supersession** of If-Match D4/D5/D6 (or
   retreat W14 to column-only / versions-only). Same
   commit-message family as the covenant break.
2. **Complete GET catalog** — every live `route(` GET,
   plus facades (`default-org`, invitations,
   `organizations` collection). Classify joins vs
   documents. Split flows out of "trio." Classify
   `GET objectives/history`.
3. **Client-graph section** that is not "same
   `ClientFacadeAdapter`": verb facade, decode-only JWT
   in `shared/`, anonymous boot, esbuild entry import
   graph.
4. **HTTP vs static dispatch rule.**
5. **A4** as a spent-jti pair family; require `jti` at
   assertion verify; do not write it onto
   `TokenResponse`.
6. **Invitation op→parent** resolved: either STREAM
   detail and say how list stays consistent, or drop
   invitations from op→parent.
7. **Ops covenant:** one mint process; `./test-postgres`
   in CI; scrypt not used for mock seed; A8 UX written
   into TEST-PLAN.
8. **A3 residual list** aligned with `ARCHITECTURE.md`
   (passwords, codes, assertions), not only tokens and
   `Authorization`.
9. Cross-references to the If-Match and work-order SoT
   specs.

Also absorb the raccoon findings that this review did
not independently reopen and that still look right:

- `*_uri_id` has permanent prefix-agnostic readers
  (`resolveOwningOrganization`, `resolveGlobalOwner`) —
  retirement condition as written is unearnable.
- `getSnapshot` needs REPEATABLE READ, not the
  postgres.js READ COMMITTED default.
- Pin advisory-lock order; map 40P01.
- HEAD PROBE / versions fetch must name the live
  predicate (latest 2xx PUT/DELETE), or a 4xx/op row
  serves as head.
- Name request body-size cap and auth throttle, or
  name them residuals (scrypt × concurrent login is a
  memory DoS).
- § M "parameterized acceptance suite" does not exist
  yet at the claimed breadth.

## What not to reopen

- BYTEA vs JSONB/TEXT
- No data migration
- Dual ZIP then yank
- Keyed-read shapes (HEAD / CHAIN / BODY)
- Instance PROJECT carve-out
- `sql.unsafe` only for compile-time DDL
- Env names; scrypt as the server hasher with PHC
  self-description
- Deleting `Supersedes` as a walked chain (nothing
  walks it now)
- Fail-fast boot, opaque 500, structured logs without
  query strings

Those are stable.

## Relation to the raccoon critique

Same spec, different cut. Raccoon is strongest on
concurrency mechanics (jti race under GIN, lock
ordering, snapshot isolation, uri_id retirement).
This file is strongest on cross-spec contradiction
(If-Match D4/D5/D6), GET-catalog completeness, client
graph, A4 shape, and render-at-write-as-cache.
Both B1s are the same ETag collision; the
dispositions differ (raccoon: resolve If-Match via
etag index; this file: pick A or B explicitly and
supersede D4 if B). Do not implement from either
file alone.

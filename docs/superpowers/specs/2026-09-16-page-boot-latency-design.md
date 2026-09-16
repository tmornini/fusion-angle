# Page boot latency: six internal cuts

- Date: 2026-09-16
- Status: awaiting review, pre-plan
- Worktree: `.worktrees/2026-09-16-page-boot-latency`
- Base: master at `750c39b0`
- Parent:
  `docs/superpowers/specs/2026-09-15-exact-read-folds-design.md`
  (its read axiom binds every part below)
- Ships: single-statement standalone reads; document reads
  on the auth happy path and one membership derivation per
  grant; a concurrent binding read and one transition read
  for work orders; a one-hop boot when the active
  organization is known; five client fan-out dedupes;
  hashed, gzip-encoded, code-split static assets
- Defers: brotli sidecars; a per-tab `sessionStorage`
  access token; server-side default-organization
  resolution inside the refresh grant; a subtree (range)
  read on `path`
- Advances: TODO.md's later-work cachability bullet (hashed
  names and gzip; `HEAD` and conditional requests stay
  open)
- Witness: `./bin/measure --record` before and after, one
  history line each. Layer 1 is the gate.

## Problem

Every authenticated page pays three sequential
authentication hops before any page work, and every hop is
slower than the ledger it reads deserves. Measured on
2026-09-16 against a fresh mock-data seed on Docker
Postgres, replaying the browser's exact request sequence
with a script and logging every SQL statement:

| Request | Wall ms | SQL stmts | Txns | In Postgres |
|---|---|---|---|---|
| POST token refresh | 51 | 56 | 16 | 5.7 ms |
| GET identities/:id/organizations/ | 8 | 32 | 11 | 0.3 ms |
| GET identities/:id/default-organization | 3 | 23 | 8 | 0.3 ms |
| POST token-exchange | 35 | 54 | 16 | 3.9 ms |
| GET organizations/:id/work-orders/ | 146 | 440 | 147 | 8.6 ms |

Postgres is idle. Three things multiply the rest:

1. **A transaction per read.** `HistoryEntityStore#run`
   opens `backend.transaction` for every standalone read
   (`api/store-history-entity.ts:35-40`,
   `api/db.ts:214-217`, `api/backend-postgres.ts:57-64`):
   BEGIN, SELECT, COMMIT. Micro-benchmark on loopback: a
   wrapped single SELECT 0.99 ms, bare 0.32 ms.
2. **Whole-collection token reads that grow forever.**
   `deriveIdentityTokensFor` fetches every token event the
   identity ever produced (`api/derive-identity-tokens.ts:76-89`).
   Refresh reads it three times (`api/authentication.ts:479`,
   `:627`, `:667`); exchange twice, once each for subject
   and actor, which are the same token (`:895-909`). Each
   page view appends three events (rotated, issued, and a
   new exchange chain root). After 200 replayed boots the
   collection was 605 rows, 381 KB, 6.7 ms per read;
   refresh had climbed from 17 ms to 35 ms. The committed
   history shows the same climb: `boot:auth-gate` 33 ms on
   the first page of a sweep, 115 ms on the last.
3. **Memberships derived eight times per boot.**
   `subjectOrganizations` and `subjectRoles` each call
   `deriveMembershipsForIdentity` (`api/authentication.ts:249-273`),
   which enumerates organizations then reads every
   organization's seats. Refresh calls the pair once,
   exchange calls it three times, and the two boot GETs and
   their fences add three more.

Above the auth floor, three pages dominate `boot:page-init`:

- `GET work-orders/` does one head read then 145
  sequential binding reads (`api/routes.ts:4705-4709`,
  `api/derive-states.ts:1242-1257`); 144 return nothing.
  It is 146 ms and 404 KB, and workbox fetches it twice.
- Workbox issues about 156 requests: the collection twice,
  then 145 `work-orders/:id/history`, each five sequential
  reads with the transition prefix read twice
  (`api/derive-states.ts:1032`, `:1205`). Flow-stats fetches
  histories for all 145 work orders and discards 106
  (`web-app/app/adapters/flow-stats.ts:48-49`).
  Record-detail fetches `flows/` four times. Dashboard
  fetches `projects/` eight times. The organization page
  fetches `members/` and `objectives/` four times each.

Below everything, the bytes: `app.js` is 552 KB, sent with
no `Content-Encoding` (Deno.serve compresses nothing, string,
stream, or JSON, verified) and `Cache-Control: no-store`,
because only content-hashed names earn `immutable`
(`server/http-server.ts:100-107`) and `bin/build-lib` writes
`app.js`. Every navigation re-downloads about 650 KB. On
loopback that is 15 ms; at 10 Mbps it is about half a
second (computed, not measured).

## Axiom

Inherited unchanged. A read is a **collection** (exact
`path`) or a **document** (exact `path` and `name`). A read
that is neither is a defect. This spec adds no third kind:
the subtree read considered for bindings is deferred, not
adopted.

Two corollaries this spec leans on:

- A **single statement** is atomic on its own. A standalone
  read needs no enclosing transaction to be a consistent
  read; only a multi-read fold needs one.
- **One read, many uses.** Rows a request has already
  fetched are trusted within that request. Passing them
  down is not a cache; re-fetching them is a defect.

## Decisions

1. **Standalone reads are one statement.** The storage
   seam gains a single-statement read path; the store's
   readonly runner uses it. `readTransaction` and
   `transaction` keep BEGIN/COMMIT.
2. **The token happy path reads one document.** Every
   token event of a jti lives at `name = jti`, including
   the authorization-code root's `issued`. The spend
   marker moves to its own prefix. Revocation checks and
   rotation planning read `getDocumentHistory(prefix, jti)`;
   the collection is read only on the replay branch.
3. **One membership derivation per grant.** A grant
   derives memberships once and threads the rows to the
   claims and to the exchange's member check.
   `deriveMembershipsForIdentity` runs its reads inside one
   read transaction, seats concurrently.
4. **Subject equals actor is checked first.** The exchange
   revocation-checks one token when both are the same.
5. **Bindings are read concurrently, transitions once.**
   `GET work-orders/` issues its binding reads with
   `Promise.all`; the history route passes the transition
   pairs from `workOrderClaimSourcesFor` to
   `workOrderHistoryFor` and issues its four independent
   reads concurrently.
6. **Boot scopes from what it already holds.** The
   refresh grant accepts an optional `organization`. The
   client sends its persisted choice; a scoped token back
   ends the organization phase with zero GETs. A flat token
   whose `organizations` claim contains the persisted
   choice exchanges directly. Only a first visit with no
   persisted choice walks today's path.
7. **Clients fetch each collection once per load.** Five
   named dedupes; no new adapters beyond a parameter that
   accepts rows already fetched.
8. **Assets are hashed, gzip-encoded, and split.**
   Content-hashed names for every non-HTML asset, a `.gz`
   sidecar written at build and served when accepted, and
   `deno bundle --code-splitting --format esm` so a page
   loads the shared core plus its own chunk.
9. **Layer 1 gates; measure witnesses.** Each part lands
   with pins. `./bin/measure --record` runs once before
   part 1 and once after part 6.

## Out of scope

- A subtree read (`path LIKE '<prefix>%'`). It is a third
  read kind under the axiom. Named here so the door is
  visible; opening it is its own spec.
- Server-side default-organization resolution when the
  refresh body carries no `organization`. Today's flat
  token bytes stay; the client keeps the first-visit path.
- A per-tab `sessionStorage` access token. Security
  outranks performance; the option is recorded, not
  designed.
- Brotli sidecars. Deno's `CompressionStream` has gzip and
  no brotli; gzip takes 552 KB to 147 KB, brotli would take
  it to 122 KB. Not worth a `node:zlib` import in a build
  script today.
- Any new API endpoint or route. Part 4 extends the body of
  an existing grant.
- TODO.md's "Fewer JSON parse/stringify" bullet. Parsing
  was measured at about 1 ms per 600 rows; round trips are
  the cost.

## Sequence

One concern per commit, this order. Parts 5 and 6 are
independent of 1 through 4 and of each other.

1. Single-statement standalone reads
2. Token document reads, marker prefix, one membership
   derivation, subject-equals-actor first
3. Work-orders binding concurrency and one transition read
4. One-hop boot
5. Client fan-out dedupes
6. Hashed, gzip-encoded, code-split assets

## 1. Single-statement standalone reads

**Seam.** `StorageBackend` gains
`read<R>(fn: (tx: Tx) => Promise<R>): Promise<R>`. Postgres
fulfils it with the pool client and no `begin`:
`fn(postgresTx(sql, 'readonly'))`. The memory backend
serves it from the live rows under the same serializer,
without the buffer copy; reads already hand out row copies.
`backendRunner` routes mode `'readonly'` to `read` and
`'readwrite'` to `transaction`. `ambientRunner` is
unchanged: a read inside an open view still joins it.

**Invariant.** Identical SQL text and parameters. Under
READ COMMITTED a lone statement is its own snapshot, so
every store method that issued one statement inside a
transaction issues the same statement outside one and sees
the same rows. The write handle keeps `lockRequest`,
`lockDocument`, `lockHead`, and `notify`; the read handle
has none, and `append` on it throws as today.

**Expected.** Two thirds of every standalone read's cost.
`GET work-orders/` from 146 ms toward 50 before part 3;
each grant about 10 ms cheaper.

**Pins.** `tests/pg-explain.test.ts` unchanged. A Layer 1
test on the memory backend: a standalone read during an
open write transaction sees committed rows, not the
buffer. A Postgres acceptance test: statement log of one
`getCollectionPairs` shows no BEGIN.

## 2. Token document reads

**Marker prefix.** The authorization-code spend marker
moves from `name = sha256(code)` in the tokens collection
to `path = /identities/<id>/authorization-codes/`,
`name = sha256(code)`, body `{ jti }`. `authorizationCodeSpent`
reads that document. The chain root's `issued` event is
written at `name = jti` like every other event. One
transaction still appends marker, event, and auth pair
together. `deriveIdentityTokensFor` no longer returns two
heads for one jti; the comment block in
`api/derive-identity-tokens.ts` that explains the split is
deleted with the split.

**Happy path.** `tokenRevocationReason` reads the
revocations collection (one row per logout-everywhere) and
`getDocumentHistory(tokensPrefix, jti)`. `isTokenRevoked`
folds those events. `planRotationAttempt` and the in-tx
re-plan read the same document: `planRotation` needs the
presented jti's chain id, identity, and latest action, all
on that document. The pre-tx and in-tx double read stays.

**Replay branch.** When the presented jti's latest action
is not `issued`, the attempt reads the identity's tokens
collection, filters by `chain_id`, and plans
`revocationAppends` over the chain exactly as today.
`revokeTokenChain` keeps the collection read: a revocation
must see every jti the chain ever held.

**One membership derivation.** `subjectClaims(adapter, id)`
returns `{ organizations, roles }` from one
`deriveMembershipsForIdentity`. `grantRefresh`,
`issueTokenPair`, and `grantClientCredentials` call it
once. `grantTokenExchange` checks `subject === actor`
before any revocation check, runs one check when equal,
and passes the derived organizations into `issueTokenPair`
instead of letting it derive again.
`deriveMembershipsForIdentity` wraps the organization
enumeration and the per-organization seat reads in one
`readTransaction`, seats via `Promise.all`.
`getIdentityOrganizations` filters the organizations the
derivation already enumerated instead of calling
`deriveOrganizations` again.

**Invariant.** Same fail-closed fold, same claim bytes,
same error bodies. `tests/drift-identity-tokens.test.ts`
and `tests/drift-memberships-identity.test.ts` pin the
bytes; `tests/api-token-exchange-revocation.test.ts` and
`tests/api-identity-token-rotation.test.ts` pin the
verdicts. Wipe and reseed: no dual-read of the old marker
name.

**Expected.** Refresh and exchange stop tracking the
ledger. Per boot, token reads from five collection scans to
four document reads; membership derivations from eight to
five, the two flat-token GETs and their fences keeping
three until part 4 removes them from a return visit.

## 3. Work orders

**Bindings.** `documentCollectionGetHandler`'s per-row
`workOrderBindingFor` loop becomes `Promise.all` over the
same exact reads, bounded by the pool. With part 1 each is
one pooled statement. The per-work-order pick, latest
POST/PUT by `(response_at, id)` at that binding path, is
unchanged; absent stays absent.

**History.** `workOrderClaimSourcesFor` returns its
transition pairs; `workOrderHistoryFor` consumes them
instead of re-reading the prefix. Its four independent
reads, the document history and the claim, release, and
transition collections, run under `Promise.all`; replay
runs after all four resolve. The document history is
decoded once and fed to both the operation and the document
filters.

**Invariant.** Same statements, same rows, same in-code
ordering (`atIdCompare`). `tests/api-work-order-history.test.ts`
pins the events.

**Expected.** `GET work-orders/` from about 50 ms to about
10; each history GET from five sequential round trips to
two.

## 4. One-hop boot

**Grant.** `grantRefresh` reads optional
`body.organization`. Present and in the derived
`organizations`: `mintPair` receives it and the access
token carries the `organization` claim, as an exchange
would mint it. Present and not a member: 403 with the
exchange's wording, before rotation, so nothing is minted
and the presented refresh token stays live. Absent: today's
flat token, byte for byte. `refreshSetCookie` and the auth
pair are unchanged; the throttle exemption for `refresh`
stays.

**Client.** `cookieRefreshAndInstall` sends
`getPreference(ACTIVE_ORGANIZATION_ID)` when set. On a 403
it deletes the preference and refreshes once more without
`organization`; a stale choice costs one extra hop, never a
bounce to login. The facade's 401 recovery refresh is
unchanged. `bootOrganizationGate` then:

- token already scoped to a reachable organization: done,
  no fetch; `putPreference` confirms the id;
- flat token whose `organizations` claim contains the
  persisted choice: exchange directly, no GETs;
- otherwise: today's path, organizations and default in
  parallel, resolve, exchange.

`resolveOrganizationGate` takes the claim's reachable set,
not fetched rows; a zero-membership identity still bounces
to invitations. `initSidebarLayout` receives `null` and
`mutateSidebarMember` self-fetches the organizations in
the sidebar branch, which already runs in parallel with
page init. `scopeBootIfCredentialed` follows the same
three-way branch.

**Invariant.** The server-side membership fence is the same
check the exchange runs. `resolveActiveOrganization` is
unchanged. `tests/boot-organization-gate.test.ts` gains the
two new branches; `tests/api-authentication-token.test.ts`
gains the three grant outcomes; `tests/api-flat-token-organization.test.ts`
keeps the flat token's bytes.

**Expected.** Three sequential hops to one on every return
visit. On loopback about 30 ms; on a 50 ms link about 130.

## 5. Client dedupes

Each is one commit; each takes rows already fetched.

- **Workbox.** `getWorkOrderHistories(ctx, orders)` takes
  the rows `getWorkOrders` returned
  (`web-app/workbox/index.ts:190-196`). One collection GET,
  not two.
- **Flow-stats.** `getFlowStats` awaits the flow's joins
  first, then fans out histories for those work orders
  only. Same `transitions` after the filter it applies
  today.
- **Record-detail.** `load()` fetches `flows/` once and
  hands the rows to both summaries; each
  `flows/:id/records/` once. 20 requests to 12.
- **Dashboard.** Gauges and objective aggregates share one
  scoring input: `projects/`, its scores, and `objectives/`
  fetched once. Add `fetch:` and `render:` marks around
  `#objective-aggregates-card`.
- **Organization page.** `members/` and `objectives/` once
  each; add marks so page-init is attributed.

**Invariant.** Byte-identical rendered HTML; the presenters
are pure over the same rows. `./bin/measure --profile`
counts requests per route and is the witness.

## 6. Assets

**Order.** `bundle_client` bundles first, hashes second,
composes third, and gzips last, so the composed HTML gets
its sidecar too. Compose receives a manifest of
`{ logical: hashed }` names and rewrites every
`../assets/<name>` reference; `fonts.css` URLs are
rewritten in the concatenated CSS before minify.

**Names.** `<base>.<sha256 first 16 hex>.<ext>` for `app.js`
and its chunks, `theme-init.js`, `root-redirect.js`,
`styles.css`, the `pages-*.css` bundles, the nine fonts,
both favicons, and `mark.png`. `isHashedAssetName`
already admits them and
`staticCacheControl` already answers `immutable`. HTML stays
`no-store`; it is what carries the hashes.

**Split.** `deno bundle --code-splitting --format esm
--outdir` on `server-core.ts`. Pages load
`<script type="module" src="../assets/app.<hash>.js">`;
module scripts run before `DOMContentLoaded` fires, so the
boot listener is unchanged. `theme-init.js` stays a classic
synchronous script so the theme paints first. CSP is
unchanged: `script-src 'self'`.

**Sidecars.** For every text asset, including composed
HTML, the build writes `<file>.gz` through the web
`CompressionStream('gzip')`. `serveStatic` serves the
sidecar when `Accept-Encoding` names gzip, with
`Content-Encoding: gzip`, `Vary: Accept-Encoding`, and the
sidecar's `Content-Length`; `HEAD` reports the same.
`Content-Type` and `Cache-Control` come from the logical
name, never the sidecar's.

**Invariant.** Byte-identical decoded bodies; the same
module graph split across files. `tests/http-server.test.ts`
gains sidecar, `Vary`, and hashed-name pins;
`tests/root-scripts-exec-deno.test.ts` is unchanged.

**Expected.** First load 650 KB to about 190 KB; every
repeat navigation fetches HTML only. Loopback readyMs moves
little; the real-network cost falls by the transfer time.

## Error and wire

| Case | After |
|---|---|
| Refresh with `organization`, member | 201, scoped token |
| Refresh with `organization`, not a member | 403, nothing minted |
| Refresh without `organization` | 201, flat token, unchanged |
| Rotation, jti document absent | 409, unchanged |
| Authorization code replayed | 401, marker document seen |
| `GET` asset, `Accept-Encoding: gzip` | 200, `Content-Encoding: gzip` |
| `GET` asset, no gzip accepted | 200, identity body |
| Write on the read handle | throws, unchanged |

## Testing

- Layer 1: the pins named per part; `./test validate`
  green on every commit.
- `./test postgres`: statement-log pin for part 1; marker
  prefix and document reads for part 2; concurrency does
  not change rows for part 3.
- `./test browser`: existing WB and boot pins stay green
  through parts 4 and 5.
- Witness: `./bin/measure --record` before part 1 and
  `--record --write-budgets` after part 6, one line each in
  `measurements/history.jsonl`, and a 200-boot replay
  showing refresh flat instead of climbing.

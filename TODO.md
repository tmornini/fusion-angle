# TODO

The single home for later work. An item leaves this
file by shipping; `## Close protocol` is the exit.

## Critical product path

Twelve items, in this order — each its own brainstorm →
spec → plan → ship cycle, implemented sequentially,
ordered by benefit over cost: what a pilot tenant needs
first, the process engine and its AI worker on that, two
processes last. A "Merged:" clause names bullets absorbed
from `## Later work`; they keep their oracles. Four
former items left for `## Later work` (genericity, JSON
parse/stringify, simulated latency, cachability) and the
skew tests folded into item 7.

1. The one table, examined — a report, not a change:
   the structure and behavior of `message_pairs`
   (`api/schema-postgres.ts`) under the SQL the code
   actually issues (`api/backend-postgres.ts`: by id, by
   collection, by address, by `request_hash`, body
   containment, `latestPutDelete`, `lockHead` `FOR
   UPDATE`, the advisory locks, `pg_notify`, the upsert).
   `EXPLAIN ANALYZE` each against a ledger the size of a
   year of tenant writes, not the 1453-pair mock seed,
   and extend `tests/pg-explain.test.ts` (six plan pins
   today) until every statement has one. Name what each
   index buys and costs on the write path; whether
   head-of-address (`livePutsOf` in
   `api/message-store.ts` folding `SELECT *` of a whole
   collection, 69 callers) belongs in SQL (`DISTINCT
   ON`) or stays in the process; the five whole-ledger
   `getAll()` folds (`api/derive-invitations.ts:70`
   names the class; `api/derive-identity-tokens.ts:193`
   runs on every chained token refresh;
   `api/derive-identity-spine.ts:119`;
   `api/derive-state-field-values.ts:187`;
   `api/derive-states.ts:1441, 1970`) and the ledger
   size at which each crosses the perception threshold;
   integrity — `upsertRow`'s `ON CONFLICT (id) DO
   UPDATE` lets the store rewrite a pair the doctrine
   calls append-only (TEST-PLAN WB16/WB19, unpinned),
   text-with-regex timestamps against
   `timestamptz`, the 52-bit advisory key space, the
   IMMUTABLE `message_body()` beneath the GIN index;
   schema evolution — `CREATE … IF NOT EXISTS` plus a
   boolean `schema_marker` is the whole migration story,
   so name how a DDL change reaches a tenant database
   that cannot be wiped; tenancy riding
   `uri_collection`; growth (two wire messages per
   write, backup size, VACUUM on an insert-only table).
   Output: a dated report under `docs/superpowers/specs/`
   whose findings are the oracles items 2, 5, 8, 10, and
   12 design against.
2. The authentication header out of the message; roles
   and views — `HOISTED_HEADER_NAMES`
   (`api/message-pair.ts:519-521`) stores
   `Authorization:` verbatim in every write pair's
   `request`, so the ledger holds every bearer token
   ever spent on a write; the
   `/authentication/authorize/` pair stores the login
   body, password included, and the
   `/authentication/token/` pair stores the refresh
   token it was sent and the access token it issued
   (`tests/api-shadow-ledger-auth.test.ts` 'live secrets
   land in the auth-flow ledger rows' and 'a refresh
   grant stores its own pair with live secrets' pin the
   exposure). Every dump and backup carries all of it;
   retire that before item 5 backs anything up. The
   header leaves the `request` bytes for a column of its
   own — whether `request_hash` still covers it is the
   brainstorm's question, since replay identity across
   two tokens changes either way — and the grant bodies
   follow the same rule or are hashed in place; a view
   the application reads that omits the column; a
   schema-owner role that owns DDL, and application
   roles (read-only, write-only, read-write) that cannot
   read it, in place of `POSTGRES_DROP_SCHEMA`'s
   `GRANT ALL … TO public`; what Render's Postgres lets
   a role be, measured first. Merged: token-at-rest
   hashing (closes KNOWN
   seam "A raw dump still has verbatim auth messages");
   two-role views (`tests/backend-postgres.test.ts`, the
   re-grant); physical PII erasure (closes KNOWN seam
   "Erased PII persists as superseded pairs" —
   `tests/api-pii-tombstone.test.ts`; physical delete or
   crypto-shredding is the one place append-only yields,
   and the brainstorm names which); the in-band
   plaintext comment at `api/mock-data.ts:145-156`,
   which still says PBKDF2 and names a column that is
   not there (owner call).
3. `/status` — `{ up: boolean, components: { postgres:
   boolean } }`, 200 when every component is up and 503
   when any is not, built for more components. Decide:
   bearer-exempt or not (Render and compose probe it
   unauthenticated; `AUTHENTICATION_ROUTES` is the whole
   exempt set today); what `postgres: true` proves (a
   `SELECT 1` on a pooled connection under its own short
   timeout, not the 30 s statement timeout); that a read
   stores no pair; whether the throttle counts it and
   whether it logs. Replaces the compose healthcheck's
   `fetch('/')`, which proves static serving only. Item
   5's health probe; item 12 answers it per process.
4. A person's first sign-in — no page mints a human
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
5. Operable — what a pilot tenant's data needs before it
   exists. A backup the operator has restored once:
   Render's schedule, a written restore drill, its
   measured duration, and a `schema_marker` that reads
   present afterward. Cross-environment blocking, so
   `./deploy --render TOKEN --postgres mock-data` can
   never wipe the tenant database from a laptop and the
   Render `ipAllowList` loses `0.0.0.0/0`. Request and
   error logs as one JSON object per line — `api/api.ts:
   347` and `:2081` print a label, an object, and an
   error as three values (the Office of Structured
   Observability wants one document with level, message,
   and request identity). An alert when `/status` is not
   200 or the error rate rises. `TRUSTED_PROXY_HOPS` set
   to Render's real hop count. Consumes item 3. Merged:
   the throttle seam — a global cap if the hops are
   wrong, refresh and exchange unlimited
   (`tests/http-throttle.test.ts`); the `ipAllowList`
   bullet.
6. The membership profile — an organization-side profile
   per SEAT, so the identity "Tony Stark, CEO" holding a
   contractor seat elsewhere appears there as
   "contractor": the document shape (keys on the seat
   body, or a nested facet under the seat mirroring
   `identities/:id/pii` — the brainstorm decides), its
   validator, derive, seed, the roster and detail reads,
   and the Members page's edit. Replaces the
   one-profile-per-identity covenant at
   `api/types.ts:1301-1303`; the seed already carries
   the contradiction (the admin holds two seats with one
   title). Lands before items 10 and 11, whose designer
   roster and AI seats read it, and replaces the
   roster's absent profile with the read. Authored on
   the `2026-09-04-critical-functionality-path` branch;
   this is its master copy.
7. Lifecycle out of the document body — fold `state` /
   `state_at` / `state_event_id` (Decision 7's trio) out
   of every document PUT so ideas, projects, flows, and
   objectives (`lifecycle: 'trio'` at `api/routes.ts:
   369, 381, 402, 495`) take the shape work-orders,
   identities, and ai-agents already have: lifecycle is
   its own event pairs at an operation address, and the
   absence of a row IS the absence of the event. Sites:
   the reduction (`api/derive-documents.ts:148-157`),
   the stamp (`api/document-family.ts:118`), every
   derive (`api/derive-ideas.ts:54, 83`,
   `api/derive-projects.ts:39, 70`,
   `api/derive-flows.ts:75`), the seeds
   (`api/mock-data/seed-message-pairs.ts:733, 913`; the
   1453 pin moves), the validators' trio-key gates, and
   the wire — decide whether GET still presents `state`,
   derived, so the pages do not change. Eighty files
   name the trio, fifty-eight of them tests. Precedes
   item 10, so the flow rewrite lands on the stateless
   shape once. Merged: no lifecycle transition table at
   any gate; the genesis-wins-under-skew tests — five
   suites name a clock-skew case their fixtures never
   build (`tests/drift-ideas.test.ts` 'GET idea trio is
   lifecycle-current under clock skew' and its siblings
   in drift-objectives, drift-projects, drift-records,
   and derive-projects; `_stateAt` / `_stateEventId`
   carry the unused-argument prefix), so they pass for
   the wrong reason. With the trio gone the server
   stamps every `at`, skew cannot exist, and the tests
   go with the trio or rename to the arrival-order
   covenant they keep — never the other exit, teaching
   the PUT path to trust a caller's clock.
8. The bell reaches the browser — every write already
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
   Precedes item 9 (a chat that does not update is not a
   chat) and item 11 (the worker trusts the bell, never
   polls). Merged: stale-until-navigation (closes KNOWN
   seam "Stale-until-navigation (no LISTEN)" —
   `tests/advisory-lock.test.ts`).
9. Chats — a conversation on any document at
   `/…/:collection/:id/chat/` with as little ceremony as
   the plane allows: a message is a POST pair at that
   address, the chat is that address's history, and
   derive is `getMessagePairs` filtered to POST — no new
   family shape unless the brainstorm finds one (edits,
   deletions, and attachments are its questions).
   Authorship is `requester_identity_id`, so an AI
   seat's messages need no extra field. Reads ride the
   fenced org; updates ride item 8. Consumed by item 10
   (a chat on every record and work order) and item 11
   (the channel a person uses to instruct and correct a
   worker).
10. Processes — re-implement flows, work orders, and the
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
    carries a chat (consumes item 9). The brainstorm's
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
    (`web-app/app/presenters/flow-designer.ts:537, 556,
    1012, 1042`); `hasUndoHistory` as `pairs > 1`
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
11. Headless AI worker — a process that hears item 8's
    bell for each AI seat's workbox, claims the work
    order as that seat (the `client_credentials` grant
    already mints a service identity's token, so every
    pair it lands names the agent as
    `requester_identity_id`), assembles the record
    definition, the attribute values (which — the
    brainstorm decides), the node instructions
    (`withNodeTaskInstructions` already stores them),
    and the chat (item 9), asks the model to follow them
    precisely, validates the reply at the gate like any
    other uninstructed voice, and applies it: attribute
    updates in record-PATCH form and the outgoing edge.
    API-only; no page. Decide in the brainstorm: an
    in-process loop or a second verb of the binary (a
    second process is item 12's precondition, the
    claim-expiry event, arriving early); the model
    behind an adapter with its key supplied at deploy
    and never logged; bounded retries with backoff; a
    loop guard and a spend ceiling for a cycle whose
    every node is an AI seat; record content treated as
    data, never as instruction. Consumes items 8, 9, and
    10. Merged: roster seat naming an AI agent
    (`tests/family-registry.test.ts:112-113`);
    FLOW-CANVAS.md's display-only AI checkboxes
    (`## Members and attributes`).
12. Two processes — high availability for the app and
    for Postgres on Render. The app's precondition is in
    the tree: `api/derive-states.ts:811-823` — the live
    claim route decides expiry against `Date.now()` and
    replay reproduces it only inside one process; record
    the expiry decision as its own event first (remove
    the comment there when done). Then two replicas
    behind Render's balancer, each answering item 3's
    probe; LISTEN in each (item 8 is per process by
    construction); advisory locks already cluster-wide;
    the throttle's per-process counters named as a known
    cost or moved to the store; a Postgres plan with a
    standby and a rehearsed failover. Closes KNOWN seam
    "Single mint process" and retires ARCHITECTURE.md's
    "do not run two replicas". Consumes items 3, 5, 8,
    and item 1's lock and growth findings.

## Critical functionality path

Off the critical path; each with its oracle.

- The re-mint refresh is not single-flighted with the
  facade's cookie refresh —
  `web-app/app/adapters/shared.ts:463-464`
- `JWT_HMAC_SIGNING_KEY` may not belong in the local
  seed/wipe `--allow-env` (`postgres-seed:168`,
  `postgres-wipe:109`). `api/access-token.ts` IS in the
  seed's 105-module transitive graph — `postgres-seed.ts`
  → `seed.ts` → `api/mock-data.ts` → `api/routes.ts` →
  `api/authentication.ts`, a route that never touches
  `api/api.ts` — but it reads the key lazily inside
  `hmacSigningKeyMaterial()` (:29-44), so whether the seed
  ever reaches that read is undecided — the seed hits
  ECONNREFUSED first. Kept rather than narrowed on
  evidence that needs a database to gather. Oracle: a
  successful `./postgres-seed --postgres local
  --bootstrap` that never reads it.
- Mock seed's fixed 2026-06-15 anchor — after
  2026-09-13 serial-mode FS3 carries in-flight heat
  only
- Roster rows carry a fabricated empty profile
  (`emptyPersonProfile`) —
  `web-app/app/adapters/members.ts:48`
- `DEFAULT_DIM` stands in for an assessment that never
  happened — `web-app/members/index.ts:52`
- A replay is indistinguishable from a creation. The
  gate's replay branch renders a previously-stored
  pair but passes `appended: true`
  (`api/api.ts:1013-1015`), so `sendWriteResponse`
  (`api/message-pair.ts:610-624`) answers 201 exactly
  as the genuine create did. THE FIX IS WIRING, NOT
  DELETION: pass `false` there. The 200 branch is not
  dead — the unchanged-live-PUT site already passes
  `false` (`api/api.ts:1412-1413`), which is both the
  proof the distinction was designed and the precedent
  for the repair; an item reading "remove the 200
  branch" would be exactly backwards. Below the gate,
  the same blindness: `appendMessagePair` skips a
  duplicate `request_hash` silently by its own comment
  (`api/message-pair.ts:686-701`), and the composed
  operation wrapping it still answers 201 however many
  inner pairs actually landed
- A panel rename whose target is deleted during the
  800 ms debounce still saves and still clears redo.
  `withNodeNamed`, `withNodeTaskInstructions`, and
  `withEdgeNamed` fire `#queueSave` and `#noteMutation`
  unconditionally, so an `applyUpdateNode` that matches
  nothing still ships a phantom idempotent PUT and a
  spurious redo clear — a disclosed trade-off, not a
  regression. Oracle:
  `web-app/app/presenters/flow-designer.ts:808-885`;
  the debounced schedules are
  `web-app/flows/detail.ts:1349-1391`
- `mustFind` throws `gesture frame target missing:
  .flow-marquee` when a selecting-gesture rAF paints an
  SVG rebuilt without the rect. `renderMarqueeFrame`
  (`web-app/app/flow-gesture-render.ts`) looks up
  `.flow-marquee`; `buildGraphSvg` emits that rect only
  while `marqueeRect` is set. Mid-gesture rAF skips
  commit, so a resize `update()` rebuilds from the idle
  snapshot and omits the rect while `bindInteractions`
  still holds selecting state. Not global:
  `bindInteractions` is called only from
  `web-app/flows/detail.ts`, and Billing's `init()` is
  empty. TEST-PLAN.md G42's Billing console observation
  is not a Billing listener
- A re-init failure degrades weaker than a first-boot one:
  `subscribeOnce`'s `void fn()` lets the rejection reach the
  global `unhandledrejection` handler, which logs and
  toasts — but first boot gets `handlePageLoadError`'s full
  error state with a Try Again button. Toast-only, no retry
  — `web-app/app/channels.ts:152`,
  `web-app/app/page-loader.ts:41-75`,
  `web-app/app/error-helpers.ts:41-57`
- `subscribeOnce`'s `const unsubscribe = subscribe(...)`
  would throw a TDZ ReferenceError if any `subscribe` fired
  its callback synchronously; all thirteen
  `subscribe<Entity>Changes` delegate to `createChannel`,
  so it is inert — guard only if that changes
- Nothing asserts that the operator wrappers exec `deno`
  rather than `node`; coverage today is a grep run by
  hand. `tests/fusion-angle-live-name.test.ts` already
  walks the same root-file list for forbidden strings, so
  the shape exists. Oracle: a test asserting no `node`
  invocation in `postgres-lib`, `postgres-seed`,
  `postgres-wipe`.
- Absence and emptiness are conflated in attribute ACL
  derivation. `attributeSchemaOf` synthesizes
  `readRoles: []` both for a head that deliberately
  stores an empty array and for one carrying no role
  keys at all (`api/routes.ts:1000-1005`), because the
  nested attribute PUT appends the raw wire body
  rather than the validator's normalized document
  (`api/routes.ts:5307-5333`; the default-stamping it
  discards is `api/validators.ts:3042-3054`)
- Member-removal affordance under members/identities —
  zero-membership is seed-produced today (Riley Okafor);
  no page deletes a membership row. Oracle: removing a
  member's last seat lands that identity on
  `invitations/index.html` at next boot (TEST-PLAN
  B25–B29 driven live); restores B28's original
  "restore the deleted membership row" branch
- A shared test operation id can produce false greens.
  `tests/http-fixtures.ts:12` exports one hardcoded
  `TEST_OPERATION_ID`; 126 test files use it, 101
  through a local `req()` helper that pins it.
  `apiRequest` already mints a fresh identifier when
  `operationId` is omitted; the helpers still pass the
  shared id. Because `appendMessagePair` dedupes on
  `request_hash`, a test issuing two byte-identical
  requests has the second silently dropped — which
  made a security test in the run-four remediation
  pass against unfixed code until it was caught.
  Oracle:
  `tests/api-record-types-composed-op.test.ts:436-442`
- Toast pause on hover and focus
- The run-four remediation's remaining seams — R6 and
  R7, whose "toy" clauses need a Layer 3 observation
  before any rewrite. G9's staleness was the corrupted
  test name, restored by the small-items sweep

## Later work

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
- The cross-party delegation ledger
  (`api/authentication.ts:884-886`;
  `tests/api-authentication-token.test.ts:678`)
- Passkey, provider-IdP, and corporate-OIDC ceremonies
  (`api/authentication.ts:1595-1597`;
  `tests/api-authentication-authorize.test.ts:225`)
- Per-client multi-audience, DPoP `cnf`, jti reuse
  detection (`api/types.ts:508-510`;
  `shared/access-token-decode.ts:30-31`)
- SP-6 sign-up (`web-app/auth/index.ts:655-663`)
- Cryptographically verifiable ledger — brainstorm
  hash-and-verify (or sign) of stored pairs. The dropped
  `version` column hashed on write and was never checked
  on read. `request_hash` is replay identity, not
  response integrity — `SCHEMA.md` item 4
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
  (`web-app/app/adapters/objectives.ts:190-192`)
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
- Three fixed `setImmediate` drains guard negative
  assertions after an asynchronous delivery: the raw-PUT
  "must not wake the page" checks in
  `tests/flow-stats-subscribe.test.ts:182-190` and
  `tests/ideas-empty-subscribe.test.ts:190-203`, and the
  "idle tab ignores a peer refresh broadcast" check in
  `tests/adapters-refresh-mutex.test.ts:153-155`. A late
  delivery can only pass them wrongly, never fail them,
  so they never flake but prove less than they read as
  proving; the ideas comment still says its drain matches
  the post-bell assert, which 90f5c722 turned into a
  deadline wait. Oracle: each check reads after a signal
  that the delivery was processed — a render count on the
  host stub for the two page tests, a second listener on
  `fusion-angle:refresh` for the mutex test — and no
  fixed-count drain remains at those three sites.
- Objective lifecycle history compares two clocks:
  `revision.at` is client-minted while the lifecycle `at`
  is the server-stamped pair fact. A browser clock ahead of
  the server can invert them and throw, so the History
  modal fails to open with an error toast instead of
  rendering —
  `web-app/app/adapters/objectives.ts:311`,
  `web-app/projects/detail.ts:318`
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
  unverifiable and macOS-only. All 14 rows in
  `measurements/history.jsonl` carry a real chip name; no
  row written from here on will. The truthful shape omits
  the field rather than storing a sentinel, which needs
  `measure-core.ts`'s field type and `shapeHistoryLine`
  (:36, :264) together with `measure-viz.ts:986`, whose
  `|| ''` is itself the default-value sin. Oracle: a row
  with no `cpuModel` key renders without the separator.
- Stale-history comment cleanup as one pass — comments
  still describe a past state as present. Sampled:
  `web-app/app/measure-cli.ts` names a Node harness;
  `web-app/app/page-request-profile.ts` says "No-op in
  Node"; `tests/drift-states.test.ts` says derive-states
  is unread in production while `api/routes.ts` imports
  it; `api/routes.ts` claims revival dual-write after
  the states row half is stripped; `api/mock-data/seed-kit.ts`
  cites `tests/mock-data-fingerprint.test.ts`, which is
  gone. The run-four remediation's Evidence
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
  - The landing CTAs carrying `[data-goto-auth]` and
    navigating to `auth/index.html` on click (B2, B3) —
    Layer 2, a browser test on `web-app/landing/`;
    `tests/landing-stay.test.ts` finds the string in the
    page source but ties it to no element
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
  - The loading skeleton before a fetch settles (I21) —
    Layer 2, probing before `wait_for_load`; Layer 1 is
    possible by reading `innerHTML` between calling
    `loadInto` and awaiting it
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
  - `subscribeProjectScoreChanges` /
    `notifyProjectScoreChange` (K29) — Layer 2, a two-tab
    BroadcastChannel test
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
- The gap list above is the 2026-08-29 audit catalogs'
  output, not an exhaustive sweep of TEST-PLAN.md's own
  `exploratory` clauses. Thirteen purely-exploratory
  cases no catalog listed are its known residue — AA3,
  B4, B5, B12, B13, B14, G22, G23, G23a, G38, G39, G42,
  and I27. Several are species already filed above: G22,
  G23, G23a, G38, G39, and G42 each say in their own
  `Pin:` that the page module carries no CLI or browser
  test, exactly as G12 does; I27 is A5's
  console-and-network covenant on a longer path; B4 and
  B14 are static auth-page copy, decidable by the markup
  test F4 wants. F2 is exploratory too and is NOT residue
  — it is retired, PASS vacuously. Once the audit
  workspace is gone, those thirteen `Pin:` clauses in
  TEST-PLAN.md are the only record of them
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
- 2026-09-02 walk F23/AA32: compositor cannot hold
  Shift across a mouse gesture. Layer 1 pins and
  `tests/browser/canvas-gestures.test.ts` 'Shift held
  mid port-drag commits an edge and adds no node
  (F23)' decide the product. Score BLOCKED when
  Shift is missing on pointer-up — TEST-PLAN.md
  Driving notes
- 2026-09-02 walk AA33/AA34: DEFERRED on AA32 stray
  nodes. Attribute-ref writes:
  `tests/presenter-misc.test.ts` R12 pins +
  `tests/browser/canvas-gestures.test.ts`
  'Shift-drag adds an edge and Review accepts two
  attribute refs (AA32/AA33/AA34)'
- 2026-09-02 walk F37b: re-activate tab A after F37a;
  Layer 2 pin `tests/browser/canvas-gestures.test.ts`
  'plain port-drag on an auto-layout flow adds a
  node and Undo restores (F37b)'
- 2026-09-02 walk R12: driver (panel never opened).
  `buildAttributeRefRow` Layer 1 pin is green —
  `tests/presenter-misc.test.ts`
- 2026-09-02 walk F26/F28/F14: compositor mis-hit /
  missed Zoom-in. Layer 2 pins in
  `tests/browser/canvas-gestures.test.ts` and
  `tests/browser/canvas-pan.test.ts`
- 2026-09-02 second walk AA9/WB11: Layer 2
  characterization pins close the only maybe-product
  FAILs. Green pins (or a product fix behind a red
  one) decide them; compositor leftovers stay
  BLOCKED — TEST-PLAN.md Driving notes;
  tests/browser/member-strengths.test.ts
  'chip toggles persist on save and reload (AA9)';
  tests/browser/workbox-transition.test.ts
  'bind, fill, and submit navigates to the inbox
  (WB11)'
- Billing (`web-app/billing/`)
- Attribute drag-reorder (TEST-PLAN R8)
- A flow loaded with Auto Fit OFF no longer fits on
  first paint. `withCanvasSize`
  (`web-app/app/presenters/flow-designer.ts:996-1017`)
  fits only under `isAutoFit`, and the load-time block
  (`web-app/flows/detail.ts:1685-1697`) is the only
  load-time fit — its `reconcileFitFromDom()` returns
  early for the same reason. RECORDED, behavior
  unchanged. The sentence it falsifies is "onFlowLoaded
  keeps its explicit first fit" — the run-four
  remediation design spec, second-commit paragraph
- The first click after a page reload only focuses the window
  — the focusing click is the viewport center, never the
  top-left brand (that is the Apple menu when Chrome is
  fullscreen or flush with the menu bar; the next click
  opens About This Mac). Then click the intended control
  once. Named by the 2026-08-29 three-layers audit and
  carried as a driving note in TEST-PLAN.md's `## The
  walk`. Oracle: a Layer 2 test under `tests/browser/`
  asserting one click after reload reaches the element.
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
- Cachability — headers, `HEAD`, conditional
  requests, and the rest; the brainstorm presents its
  questions from most to least desirable. Start:
  `server/http-server.ts` `NO_STORE` and
  `CONTENT_SECURITY_POLICY`. Oracle: a measured
  `./bin/measure` repeat-load delta naming the header
  that earned it; hashed assets already carry
  `HASHED_CACHE_CONTROL`.
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
  product-path item 10.
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
  `api/db-backed.ts:31-32`, `api/api.ts:2133-2134` —
  revise the three comments when done). Oracle:
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

## Sequencing

- 1 → 2, 5, 8, 10, 12 (the report's findings are their
  oracles)
- 2 → 4, 5 (no credential is written or backed up in
  the clear)
- 3 → 5 → 12 (the health probe, then per process)
- 6 → 10, 11 (the designer roster and AI seats read the
  profile)
- 7 → 10 (the flow rewrite lands on the stateless shape
  once)
- 8 → 9 → 10 → 11 (the bell, then chats, then
  processes, then the worker)
- Items 2, 8, and 12 close KNOWN seams — the closer
  removes the ARCHITECTURE.md bullet and this file's
  line in one commit
- Item 6 precedes routing the roster through the
  profile
- The mock-seed anchor bullet activates after
  2026-09-13
- `api/derive-states.ts:811-823` (claim-expiry as its
  own event) lands before any multi-process deployment
  — item 12's first commit, or item 11's if the worker
  is a second process

## Close protocol

The pin flips red → fix the test to the new truth (or
delete it if the old incomplete behavior is gone) →
remove the bullet here → remove the named comment at
its `file:line` → for a KNOWN seam, remove the
ARCHITECTURE.md bullet in the same commit → AUDIT.md's
`m` is the new seam count.

# TODO

The single home for later work. An item leaves this
file by shipping; `## Close protocol` is the exit.

## Critical product path

Eleven items, in this order — each its own brainstorm →
spec → plan → ship cycle, implemented sequentially,
ordered by benefit over cost: the ledger right, then
fenced (items 0–3, one deploy; items 0 and 1 have
landed and left this file), what a pilot tenant needs
next, the process engine and its AI worker on that, two
processes last. A "Merged:" clause names bullets absorbed
from `## Later work`; they keep their oracles. Four
former items left for `## Later work` (genericity, JSON
parse/stringify, simulated latency, cachability) and the
skew tests, which went with the trio; item 8, lifecycle
out of the document body, closed the other way with the
trio's retirement
(`docs/superpowers/specs/2026-09-15-retire-the-trio-design.md`).

2. The ledger fenced — roles, grants, and row policies, on
   the table items 0 and 1 finished (landed: the
   2026-09-23 ledger-store, message-plane, and ledger-seed
   specs, then state by PUT, head reads, membership and
   versions, and work-order events, all under
   `docs/superpowers/specs/`). Designed to stock
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
   Postgres wants SELECT on every column a statement
   reads back, `RETURNING` included (measured), and a
   column grant is exactly that, so the ledger
   statement's head read and final select, which read
   only unfenced columns
   (`api/ledger-statement-sql.ts:78-79`, `:234-268`),
   hand its minted `date` back with no view between.
   The column fence is that
   grant: `fa_api` never reads back
   `request`, the two secrets columns, or the request
   salt (only `request_salt` and `response_salt` exist);
   it reads the response and the response salt, so it
   verifies the response leaf. Which digests it reads is
   this item's first question. The two secrets leaves
   are bare `sha256` of guessable credential lines, and
   the ledger-store spec's decision 1 hands this item the
   consequence: a role that reads them holds a guessing
   oracle for the lines
   (`docs/superpowers/specs/2026-09-23-ledger-store-design.md:52-65`,
   `:660-661`). Salt them — a change of hash form — and
   `fa_api` reads all five digests, verifies `pair_hash`,
   and a reader of envelopes alone verifies the root
   alone; fence them, and the root is the owner's to
   verify (item 3's full check). A column grant cannot
   reach a secret a document's state holds, and the
   state-by-PUT spec hands this item the credential and
   code bodies (`docs/superpowers/specs/`
   `2026-09-25-state-by-put-design.md:709-716`, `:1267`).
   A credential's state keeps its PHC hash in the
   response body, and its PUT stores the `secret` it is
   given, checked as a string and never as a PHC hash
   (`validateIdentityCredentialEntity`,
   `api/validators.ts:587`;
   `postIdentityCredentialDocumentOp`,
   `api/routes.ts:2610`). The key's empty read roles,
   the one declaration of its kind
   (`api/family-registry.ts:129-132`), leave when the
   hash leaves the body.
   `requester_identity_id` — the verified token's `sub` —
   stays readable. No read may
   use `SELECT *` (two do, `api/backend-postgres.ts:611`
   and `:651`'s `head.*`), and every read stops
   selecting `request`, `request_salt`, and the two
   secrets columns, which every read selects today
   (`api/backend-postgres.ts:446-665`, mapped by
   `entityOf` at `:352-363`), though nothing derives
   from `request` since state by PUT. Removing PII
   stays a tombstone, and the fence
   hides every `identities/:id/pii` pair that precedes a
   DELETE at its document; the DELETE head stays visible,
   and every other family keeps its deleted history. A
   hidden pair is never a head, so a blind PUT always
   finds the head, and an in-order PUT that names a hidden
   pair selects no head in the ledger statement and
   answers 412:
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
   SQL (measured). The mock data cannot judge this: 437 of
   its 579 documents have one version, and the deepest
   has 13. `EXPLAIN` and
   `./bin/measure` prove the head read stays on
   `fa_message_pairs_document`. The memory backend hides
   the
   same pairs in TypeScript. Item 7's profile can be
   removed on its own only as its own document: keys on
   the membership body would hide that membership's
   whole history. The membership read omits
   `organization_name`, `invited_by_name`, and
   `invitee_email`. Restoring the three names is a
   read scoped to the relationship. That read does
   not exist. A membership's organization rides its
   name, `<organization-id>:<identity-id>`, as well as
   its path, and any rule this item writes by
   organization reads both (`docs/superpowers/specs/`
   `2026-10-01-membership-and-versions-design.md:785-788`).
   The
   reduction takes back what Postgres grants every role.
   `fa_owner` revokes CONNECT and TEMPORARY on the
   database and every right on the schema from PUBLIC and
   grants CONNECT and USAGE to `fa_` roles alone, so a
   foreign login — one that belongs to none of our roles —
   cannot connect, and `POSTGRES_DROP_SCHEMA`'s
   `GRANT ALL … TO public` retires
   (`api/backend-postgres.ts:42-46`;
   `tests/backend-postgres.test.ts:202-211`, the
   re-grant). Four
   revokes from PUBLIC need a superuser and only warn for
   the owner (measured): `plpgsql`; large-object creation;
   the 21 advisory-lock functions, which the product no
   longer calls (4175b2d5; only
   `tests/pg-races.test.ts` takes one); and catalog reads,
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
   (`web-app/app/presenters/identity-detail.ts:286-293`)
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
   `./deploy --local`, `bin/test-postgres`,
   `./bin/measure`, and the tests all assume that one
   login (`compose.yaml:2,8-9,22-24`; `mint_compose_env`,
   `bin/compose-lib:14-15`); and the credential lines
   every request presents sit in plaintext in
   `request_secrets` and `response_secrets`, where that
   login reads them
   (`tests/shadow-ledger-invariants.test.ts` 'stored
   secrets carry the live bearer JWT';
   `tests/api-shadow-ledger-auth.test.ts` 'live secrets
   land in the auth-flow ledger rows'). Follows items 0
   and 1, which landed.
3. Retire `schema_marker` for migrations the ledger
   holds — the marker (`api/schema-postgres.ts:46-49`)
   proves only that a seed once finished; it cannot tell
   an unwiped database from a correct one. A master-era
   database — `message_pairs` and its `schema_marker`
   row — passes every boot gate, since the legacy check
   names `pairs`, `requests`, and `responses` alone
   (`assertNoLegacyMessageTables`,
   `server/postgres-gate.ts:75`), and the binary serves
   with no `fa_message_pairs` behind it; the seed calls
   that database empty, and its marker INSERT meets the
   old row's key and rolls back
   (`server/seed.ts:101-128`,
   `api/backend-postgres.ts:103-106`). Each
   migration becomes a document like any other — the same
   canonical form, hash tree, succession index, and head
   read — in the collection `/migrations/`, named
   for what it does behind a four-digit order,
   `0000-root` (landed, `api/ledger-root.ts`) then
   `0001-bootstrap`,
   that the owner writes and no
   route serves; one document with successors would hold
   the same history under a name that hides it. A
   migration's `request` is the SQL that ran —
   the whole definition for `0001-bootstrap`, the drops
   and the new fence for a later one — as the body of a
   PUT `fa_owner` writes, its requester as the root's,
   whose `user-agent` line names the build that ran
   it, `fusion-angle/<sha>` (RFC 9110 §10.1.5; the SHA
   `FA_GIT_SHA` supplies, its own bullet),
   provenance the owner's `check` can report and
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
   every authorization mistake into the owner's SQL. The
   seed lands the root in its one transaction today
   (`postSeedLanding`, `api/ledger-seed.ts:325-354`), and
   `0001-bootstrap`, a genesis, beside it. A later
   migration is one
   owner transaction — the change, the full check, and
   the genesis of its own document, in the ledger
   statement's shape, landed
   by `migrate` beneath the adapter, where the
   seed lands every pair — one owner-side writer
   for seed and migration, and `handleRequest`
   (`api/api.ts:446`) stays the api's. Names order
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
   the seed uses there already. The succession index
   (`fa_message_pairs_succession`,
   `api/schema-postgres.ts:266-268`) refuses a
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
   the ledger store holds the table's DDL final — and
   views,
   policies, and grants hold no data, so a migration
   rebuilds them whole and needs no path from one
   fence to the next. Boot — `serve`, as `fa_api`,
   where the marker gate runs today (`server/boot.ts:107`)
   — does two small things. It asks what it holds itself
   through the privilege functions, which answer with
   catalog reads revoked (measured), and refuses to serve
   if it can read `request` or the secrets columns,
   update, delete, or
   make temporary objects — the rights the owner
   controls; the four superuser revokes it never
   checks. And it reads the
   `/migrations/` heads — a collection read — and
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
   names the drift; walks every succession to name a
   pair stamped before its predecessor and a
   `supersedes` that names no row — none until the
   eraser ships, and each one an erasure pair must name
   after; and recomputes every root and every leaf the
   owner can see, to name a pair whose digests no longer
   match — a digest no reader recomputes is the dropped
   `version` column again (the signed-ledger bullet). The
   expected list lives beside the
   DDL, and a digest lands only after the check passes, in
   the same transaction, so every seed proves the list
   current. Drift made by hand afterwards is the full
   check's to find, not boot's (measured: the head reads
   the same after a column is added by hand). A seed is
   one transaction, so a failed seed leaves nothing and
   the last-stamp
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
   table-migrations bullet: boot's
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
   Today: the root, the seed's one transaction, its
   refusal of a database that holds our table, and the
   index that refuses a second genesis have landed;
   boot gates on
   the marker row (`assertSchemaMarker`,
   `server/postgres-gate.ts:67`, called at
   `server/boot.ts:107`), and the seed's one transaction
   writes `schema_marker` last
   (`api/backend-postgres.ts:103-106`). The marker's
   refusals name retired scripts: `MISSING_MARKER` says
   `./postgres-seed` and `NO_ARGUMENTS` `server.mjs`
   (`server/postgres-gate.ts:14-18`). The marker's close
   also removes SCHEMA.md's decision 7 and its line in
   the seed's account (SCHEMA.md:67, :191),
   ARCHITECTURE.md:43-44, and the comments that name it
   (`server/boot.ts:1-3`, `api/ledger-seed.ts:321-322`,
   `api/db.ts:217`, `:231`). Follows item 2.
4. `/status` — `{ up: boolean, components: { postgres:
   boolean } }`, 200 when every component is up and 503
   when any is not, built for more components.
   Unauthenticated — Render and compose probe it bare —
   so it joins the bearer-exempt set
   (`AUTHENTICATION_ROUTES`, `api/request-auth.ts:39-43`,
   is the whole set today) and becomes the one path
   outside authentication an anonymous caller can confirm
   exists: every other `/api/*` path answers 401 before
   the no-match 404, by design (the route match at
   `api/api.ts:495`, the exemption at `:534-535`, the 401
   at `:537-541`, the 404 at `:544-551`). A probe sends
   no ids, and the gate answers 400 to a request with no
   `operation-id` before it routes or authenticates
   (`api/api.ts:469-484`), so the exemption comes ahead
   of that gate, as the message-plane spec planned; the
   server mints the probe's `request-id`, as it does
   every request's. Decide: what `postgres: true` proves (a
   `SELECT 1` on a pooled connection under its own short
   timeout, not the 30 s statement timeout); that a read
   stores no pair; whether the throttle counts it and
   whether it logs. Replaces the compose healthcheck's
   `fetch('/')`, which proves static serving only. Item
   6's health probe; item 13 answers it per process.
5. A person's first sign-in — no page mints a human
   credential: the seed does
   (`formSeedCredentialMessagePairs`,
   `api/mock-data/seed-message-pairs.ts:2421`), only
   services get a secret from the UI
   (`postIdentityCreation`, `client/identities.ts:314`),
   and `postHumanMemberCreation`
   (`client/members.ts:276`) lands the identity, its
   PII, and a membership, and no credential, for a
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
   creating an organization stays its own bullet
   (SP-6). Merged: invitation email delivery.
6. Operable — what a pilot tenant's data needs before it
   exists. A backup the operator has restored once:
   Render's schedule, a written restore drill, its
   measured duration, and item 3's full check passing
   afterward. `fa_archiver` adds a backup no host
   owns (item 2's principle): it holds SELECT on a view
   without the two fenced secrets columns, cannot log in,
   exports through `COPY`, and restores onto any Postgres
   — `pg_dump` cannot serve it, because it locks the table
   and dumps a view as a definition with no rows
   (measured). A restore must fill the secrets columns,
   which are NOT NULL, and zero bytes is the honest fill:
   `pair_hash` still verifies on every pair, the secrets
   leaves no longer do, and the api runs the same, since
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
   this keeps the port out of its reach. Error logs as
   one JSON object per line, as the request log already
   is (`server/http-server.ts:471-510`):
   `api/api.ts:322-329` ('fence read failed') and
   `:1406-1413` ('request failed') print a label, an
   object, and an
   error as three values (the Office of Structured
   Observability wants one document with level, message,
   and request identity, and never a credential line:
   the credential hoist is the store's rule, and the log
   is a second writer). One request clock, read once
   at arrival and carried in the context: the edge
   stamps `performance.now()` at accept
   (`server/http-server.ts:530`) while the api reads its
   own after the body and mints `requestAt` there
   (`api/request-context.ts:85-96`); latency must be
   their difference, not a second clock. Every answer names
   its request: the edge's 413 and the throttle's 429
   are bare `jsonResponse`s with no `request-id`
   (`server/http-server.ts:535-541`, `:589-594`), as is
   the 500 for a throw that escapes `handleRequest`,
   whose bare `catch` drops the error itself
   (`server/http-server.ts:650-653`). The message-plane
   spec hands this item the two refusals
   (`docs/superpowers/specs/`
   `2026-09-23-message-plane-design.md:879-881`).
   An alert when
   `/status` is not 200 or the error rate rises.
   `TRUSTED_PROXY_HOPS` set to Render's real hop
   count. Consumes item 4. Merged:
   the throttle seam — a global cap if the hops are
   wrong, refresh and exchange unlimited
   (`tests/http-throttle.test.ts`); the `ipAllowList`
   bullet.
7. The membership profile — an organization-side profile
   per membership, so the identity "Tony Stark, CEO"
   holding a contractor membership elsewhere appears
   there as "contractor": the document shape (keys on
   the membership body, or a nested facet under the
   membership mirroring `identities/:id/pii` — the
   brainstorm decides, under item 2's rule that a
   profile removable on its own is its own document,
   since keys on the membership body would hide that
   membership's whole history), its validator, derive,
   seed, the roster and detail reads, and the Members
   page's edit. One profile still rides the identity
   (`HumanProfile`, `shared/types.ts:710`; `profileOf`,
   `client/members.ts:88-101`), and the roster reports a
   seat with none as `{ present: false }`
   (`client/members.ts:124`). The seed
   already carries the contradiction (the admin holds
   two memberships with one title). Lands before
   items 11 and 12, whose designer roster and AI
   memberships read it, and replaces the roster's
   absent profile with the read. Authored on
   the `2026-09-04-critical-functionality-path` branch;
   this is its master copy.
9. The bell reaches the browser — every write already
   `pg_notify`s `fusion_events` with a scoped
   `NotificationEvent` (`shared/notifications.ts`;
   `notifyPayload`, `api/advisory-lock.ts:17-26`, 8000-byte
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
   `tests/advisory-lock.test.ts` 'postgres notify is
   issued; server never LISTENs').
10. Chats — a conversation on any document at
    `/…/:collection/:id/chat/` with as little ceremony as
    the plane allows: a message is a POST pair at that
    document, the chat is that document's history, and
    derive is `getDocumentHistory`
    (`api/message-store.ts:20`) filtered to POST — no new
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
    terminates. The trio's retirement left flows their
    event walk (`documentLifecycleEvents`,
    `api/derive-documents.ts:184`, called at
    `api/derive-flows.ts:217`, `:250`, `:366`) and their
    three body fields, `state`, `state_at`, and
    `state_event_id` (`FLOW_DOCUMENT_BODY_KEYS`,
    `api/validators.ts:1308-1311`), with the create
    body's `initialStateEventId`; the rewrite retires
    them. Merged, the canvas debts the rewrite
    retires or keeps by decision: READY gate on dangling
    refs (`tests/adapters-flow-publish.test.ts`);
    the flow-tag designer UI (TEST-PLAN "Flow Designer —
    Flow Tags", API-only today); F6's ZIP import not
    rebinding `flow_records` (TEST-PLAN F6); page
    selection writes behind the FSM at four sites in
    `web-app/flows/detail.ts` (`canvasFocusOf`'s walk is
    the second instance the remediation added); in-place
    `viewBox` mutation at four method sites
    (`web-app/app/presenters/flow-designer.ts:489-490,
    510-513, 990-993, 1020-1021`); `hasUndoHistory` as
    the designer's own `versions.length > 1`, counting
    parts of `…/flows/:id/versions/`
    (`web-app/app/flow-operations.ts:841`, `:915`,
    `client/flow-queries.ts:234` — more than one part
    is something to undo). The server no longer
    computes it. The undo route resolves its target
    itself (`resolveFlowUndoTarget`,
    `api/derive-flows.ts:291`) and at exhaustion
    answers the head and stores nothing
    (`api/routes.ts:1363-1366`), which TEST-PLAN
    F36/F45 call PASS — the brainstorm decides whether
    that stays); the Auto Layout switch committing
    without `commitAndFit` (`web-app/flows/detail.ts:946-956`),
    the resize path with no gesture guard
    (`web-app/app/adapters/resize-observer.ts`), and the
    panel callback re-fitting at a double-click's second
    press (`docs/superpowers/plans/`
    `2026-10-05-walk-green.md:289-293`); rotation only on the
    toggle path (`web-app/app/flow-layout.ts:1032-1037`);
    the mirror trigger; and the canvas entries of the
    genericity bullet (two zoom
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
    11. Merged: roster seat naming an AI agent
    (`tests/family-registry.test.ts:97-105`);
    FLOW-CANVAS.md's display-only AI checkboxes
    (`## Members and attributes`).
13. Two processes — high availability for the app and
    for Postgres on Render. The app's precondition is in
    the tree: a claim decides expiry against its
    request's stamp (`isClaimUnlapsedAt`,
    `api/work-order-version.ts:104-109`, called with
    `received.requestAt` at `api/routes.ts:1776` and
    `:1807`), and that stamp is the receiving process's
    `nowUtc()` (`api/request-context.ts:95`), so each
    replica's clock decides the boundary; record the
    expiry decision as its own event first. Then two
    replicas
    behind Render's balancer, each answering item 4's
    probe; LISTEN in each (item 9 is per process by
    construction); the throttle's per-process counters
    named as a known cost or moved to the store; a
    Postgres plan with a standby and a rehearsed
    failover. Closes KNOWN seam
    "Single mint process" and retires ARCHITECTURE.md's
    "do not run two replicas". Consumes items 4, 6, 9,
    and the examination report's lock and growth findings
    (`docs/superpowers/specs/2026-09-15-one-table-examined-report.md`).

## Critical functionality path

Off the critical path; each with its oracle.

- `getIdea` (`client/ideas.ts:166`) fans three reads out
  through `Promise.all` at `:172`, so a rejection settles
  the caller while its siblings still run, and
  `tests/adapters-ideas.test.ts:195` (`getIdea throws on
  missing submission`, `:182`) waits one macrotask turn
  for them (`11cd89f8`). It was never seen to flake, but
  one turn proves only that the abandoned reads were
  fast: `getFlowStats` had the same shape, and with every
  memory-backend entry delayed by up to 20 ms its twin
  yield failed the ops sanitizer ("A timer was started in
  this test, but never completed") until its fan-out
  settled every read before rejecting.
  Oracle: a rejected `getIdea` leaves none of its reads
  in flight, pinned as `tests/adapters-flow-stats.test.ts`
  pins `getFlowStats`, and the yield at `:195` is gone
- The run-four remediation's remaining seams — R6 and
  R7. R6 holds in a stronger form: no picker renders for
  `select`. R7's primary clause is false: `regex` is
  always offered and a second pick adds a second row
  (`web-app/app/presenters/record-detail.ts:838-871,
  901-909`), and the three constraint maps accept
  duplicates (`api/validators.ts:2649-2665`,
  `:2754-2770`, `:2876-2890`). The walk decides whether
  that is a defect; the pins
  (`tests/presenter-record-detail.test.ts:122`, R7;
  `:141`, R6) make any
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
  projects, flows (`web-app/app/header-info.ts:11-26`, sent
  from `bootApp`'s sidebar branch). The members page's
  own roster read, which `loadInto` sends only after it
  has painted the skeleton, is not among them. At the
  strip's organization GET the page branch may still be
  importing its code-split chunk, so no page code has
  run. `tests/members-pending-skeleton.test.ts` shows
  the skeleton painted once `init` runs. I21 has scored
  PASS on every walk since (`a6af68a6`, `2acbc87a`,
  `ed1fac5c`), the first paused GET already showing the
  skeleton, so the race is latent. Owner call: have I21
  poll for the skeleton while the pause holds, rule the
  pre-import blank container a product gap, or retire
  this bullet.
  Oracle: TEST-PLAN I21's probe step and its
  `### Driving notes` twin
- The panel doors a937df40 closed are unpinned. A panel
  closed outside `withPanelOpen` kept the viewBox it
  saved on open, so the next empty-canvas click or
  delete restored a stale camera — F29's defect through
  four more doors: `handleAddNodeAtPosition` writing
  `isPanelOpen: false` by hand
  (`web-app/flows/detail.ts:608`),
  `refreshFlowFromServer` dropping the panel when a
  cross-tab edit removes its selection (`:1966-1970`),
  undo and redo committing `applyServerGraph`
  (`web-app/app/flow-operations.ts:707-709`), and a
  close under Auto Fit, where `applyPanelTransition`
  returns null (`web-app/app/flow-designer-actions.ts:474`).
  a937df40 keys the transitions on the snapshot's own
  previous open flag (`wasOpen`,
  `web-app/app/presenters/flow-designer.ts:416`), so a
  close the snapshot already holds restores nothing and
  the next open recaptures the camera — read, not
  driven. Two loose ends stay: `handleUndo` and
  `handleRedo` leave `panelStateRef.open` true
  (`web-app/flows/detail.ts:357`, `:373`), and the
  inline close sites still bypass `closePanel()`
  (`:1414`, `:2157`), the f29 plan's own deferral
  (`docs/superpowers/plans/`
  `2026-09-29-f29-zoomed-viewbox.md:984-986`). Oracle:
  one Layer 2 test per door in
  `tests/browser/canvas-pan.test.ts` — with Auto Fit
  off, open a node's panel; then port-drag a new node,
  apply a cross-tab edit that removes the selection,
  undo the open node's creation, or close the panel
  under Auto Fit and switch it back off; zoom in once
  and click empty canvas — each keeping the zoomed
  camera
- API retries, unified — the client resends by two
  unrelated mechanisms spread across its files, and leaves
  the commonest failures unhandled. Contention: flow PUT
  (`putFlow`, `client/flow-mutations.ts:579-612`,
  `MAX_PUT_ATTEMPTS = 3` at `:504`) and flow undo
  (`postFlowUndo`, `web-app/app/flow-operations.ts:740-777`,
  `MAX_UNDO_ATTEMPTS = 3` at `:721`) each hand-roll a loop that
  absorbs a 412, rebuilds the body against the fresh head,
  and resends, sharing only `jitteredBackoff`
  (`client/request-context.ts:337`). Auth recovery,
  at two layers: on a 401 the facade refreshes once,
  single-flight, through a raw `fetch` and resends once
  (`exchangeOnce`, `client/http-facade.ts:311-356`),
  while `withAuthRecovery` does the same above it
  through `postSessionRefresh`
  (`client/request-context.ts:355`, called at `:232`;
  `client/session-refresh.ts:15`); boot
  refreshes three times more (`web-app/app/app-boot.ts:243`,
  its 403 fallback at `:256`, and `:359`), and an
  accepted invitation re-mints its claims
  in two attempts, no loop (`remintSessionClaims`,
  `client/invitations.ts:242`). Unhandled: a
  `fetch` that rejects — a dropped connection surfaces as
  a raw `TypeError`; a request that never answers — no
  `fetch` in the client carries a timeout or an abort
  signal; a 429 — the throttle sends no `Retry-After`
  (`server/http-server.ts:589-593`) and the client throws
  it like any failure; a 502, 503, or 504; and an error
  body that is not JSON — `answered` reads every
  failure as `{ error }`
  (`client/http-facade.ts:116-130`), so a proxy's HTML
  error page finds no `error` and surfaces as an
  `HttpMessageError` ('queried value does not exist',
  `shared/http-message/field-value.ts:88-95`) that
  hides the status. One retry policy, in one place in the
  client: every request under a timeout; backoff with
  jitter, capped, never infinite; more attempts than
  today's three, the spec naming the count and what
  justifies it; and the verb decides what may be resent
  after an unknown outcome (RFC 9110 §9.2.2) — GET, PUT,
  and DELETE may, since a PUT that changes nothing lands
  nothing (the ledger statement), while a POST or PATCH
  may only after an answer that proves nothing landed
  (401, 412, 429). A
  resend is the same operation and keeps its
  `operation-id`; the throttle sends `Retry-After` and the
  client honors it. Oracle: a facade test over a scripted
  transport — a rejection, a stall, a 429 with
  `Retry-After`, a 503, an HTML 502 — asserting the
  attempts, the delays, and that a POST with an unknown
  outcome is never resent. Head reads hands this bullet
  the 412 a latched save now answers and the errors that
  carry their response (`RequestError.response`,
  `shared/http-errors.ts`): a page that holds a message
  and is refused keeps the stale head
  (`web-app/ideas/detail.ts`, `web-app/ideas/index.ts`,
  `web-app/projects/detail.ts`,
  `web-app/projects/index.ts`,
  `web-app/records/detail.ts`,
  `web-app/records/index.ts`,
  `web-app/organization/index.ts`,
  `web-app/workbox/index.ts`, and the PII hop of
  `putHumanMember` in `client/members.ts`), so every
  retry refuses until a bell refetch or a reload; the
  drag reorders surface nothing on a refusal (ideas,
  projects, records, organization — workbox toasts); the
  flow save's per-attempt read and `postFlowUndo`'s
  read-on-412 are the model; and a held-item miss also
  says nothing: a drop's handler returns when the item
  it held is gone (`web-app/ideas/index.ts:149`,
  `web-app/records/index.ts:140`,
  `web-app/projects/index.ts:189`,
  `web-app/organization/index.ts:240`,
  `web-app/workbox/index.ts:237`), as do the objective
  reactivate and archive clicks
  (`web-app/organization/index.ts:310`, `:480`) — no
  error, since a bell repaint landing mid-gesture has
  already resolved the list and a drop reverts visually,
  but nothing tells the person the gesture did nothing;
  and two the walk-green plan left: `postInvitationDecline`
  latches with no 412 recovery
  (`client/invitations.ts:317`), and the workbox action
  screen sends every 412 into the instance-conflict
  recovery, a stale work-order tag on a pure move
  included, its `conflictNotice` module state
  outliving a refresh (`web-app/workbox/detail.ts:70`,
  `:195-206`, `:234`;
  `docs/superpowers/plans/2026-10-05-walk-green.md:279-288`)
- A latched write aligned to RFC 9110 §13.1.1. When
  its `If-Match` fails, the RFC lets the origin answer
  2xx if it can verify that the requested state change
  has already succeeded: a lost response, or a
  compatible change by another agent. Otherwise it
  answers 412. The statement decides stale before
  matched, row by row
  (`rawOutcome`, `shared/ledger-statement.ts:198-230`;
  `api/ledger-statement-sql.ts:148-180`), pinned by
  'stale still beats matched and land'
  (`tests/ledger-store.test.ts:1154`,
  `tests/pg-ledger-store.test.ts:1546`). Only a PUT or
  DELETE row can match its head. A stale row refuses
  the statement; otherwise a matched row is skipped and
  the rest land, unless no document row — a row that
  carries a latch — lands, and then the statement
  stores nothing, the received pair included. A
  statement of blind rows has no document row, so it
  stays all-or-nothing
  (`reportedOutcome` and `isDocumentRow`,
  `shared/ledger-statement.ts:235-256`;
  `api/ledger-statement-sql.ts:184-202`). The
  message-plane spec keeps stale before matched
  (Decision 2,
  `docs/superpowers/specs/2026-09-23-message-plane-design.md`),
  so a resent in-order PUT whose latch names the
  head's predecessor answers 412 even when that head
  is its own first attempt and holds its state. No
  client sends one today: the 412 loops read a fresh
  head and latch, and no `fetch` times out. The
  retries bullet above makes it reachable, because a
  PUT resent after an unknown outcome would answer
  412 to its own success. How far to align is this
  bullet's brainstorm to decide.
  - The narrowest reading answers 200 with the head's
    response when the head supersedes the latch and
    holds the request's state.
  - The widest answers 200 whenever the head holds
    the state. It hides an intervening writer, and it
    answers an invented or foreign latch with 200.
  After state by PUT the alignment is one branch in the
  classifier, in both backends, and nothing else moves;
  a create resent after a lost response is a declared
  genesis the narrowest reading would answer 200
  (`docs/superpowers/specs/2026-09-25-state-by-put-design.md`
  §10). The gate checks only a latch's presence and
  form (`preconditionRefusal`, `api/api.ts:236-306`),
  and the flow PUT no longer re-reads the head to
  refuse its latch (`postFlowDocumentOp`,
  `api/routes.ts:1334-1360`). Both head reads carry
  the head's response and method, all the widest
  reading compares: `headed`
  (`api/ledger-statement-sql.ts:68-87`) and the memory
  `Head` (`shared/ledger-statement.ts:73-81`, filled by
  `headsOf`, `api/backend-memory.ts:315-362`). The
  narrowest also compares the head's `supersedes`,
  which neither selects today. The statement keeps its
  fifteen parameters. Lands no later than the retries
  bullet.
  Oracle: a Layer 1 test resends a landed in-order
  PUT with its original `If-Match` and gets 200 with
  the landed pair's `etag`, and `./test postgres`
  pins the same on the table
- Everything we own, named `fa_` — so that operating the
  system makes what is ours trivial to find:
  `env | grep FA_` lists every variable the system needs.
  Every environment variable the system reads becomes
  `FA_*`, and every Postgres role, login, table, index,
  and view `fa_*` (the ledger store named the table,
  its indexes, and its functions so; item 2 creates its
  roles and views under the
  prefix). Product code reads
  six names of its own — `POSTGRES_URL`,
  `JWT_HMAC_SIGNING_KEY`, `PORT`, and `TRUSTED_PROXY_HOPS`
  (`server/boot.ts:60-73`; the URL again at
  `server/postgres-seed.ts:69` and
  `server/postgres-wipe.ts:61`; the key again at
  `api/access-token.ts:36`, through the `process` global a
  search for `Deno.env` misses), and the tooling's
  `MEASURE_PASSWORD` (`web-app/app/measure.ts:368-370`,
  with the URL and the key again at `:430-432`) and
  `CHROME` (`web-app/app/cdp-client.ts:39`) — so the app
  reads
  `FA_POSTGRES_URL` directly and nothing translates. Names
  others dictate stay at two edges: the Postgres image's
  `POSTGRES_USER`, `POSTGRES_DB`, and `POSTGRES_PASSWORD`,
  which `compose.yaml` fills from `FA_` values, and the
  Render CLI's `RENDER_API_KEY`, which `deploy:178`,
  `bin/postgres-seed:154`, and `bin/postgres-wipe:113`
  fill from their own argument; a
  dependency that ever dictates a name gets its adapter.
  One dictates today: postgres.js reads sixteen `PG*`
  names as option defaults — `PGPORT`, `PGSSL`,
  `PGIDLE_TIMEOUT`, and their kin — and `bin/build:100-104`
  grants the binary exactly those, so not every reader is
  ours until `api/postgres-client.ts` passes every option
  and the grants go, or `PG*` is named a third edge — the
  brainstorm settles which.
  Today's role and database are both `fusion`
  (`compose.yaml:2,8-9,22,24`; `mint_compose_env`,
  `bin/compose-lib:14-15`). Owned names the prefix has
  not reached: the notify channel `fusion_events`
  (`api/advisory-lock.ts:11`,
  `api/ledger-statement-sql.ts:229`), the test schema
  `fusion_test_…` and compose project
  `fusion-test-postgres-$$` (`bin/test-postgres:22`,
  `:17`), and `schema_marker`, which item 3 retires.
  Ships no later than the deploy
  of items 0–3, which already changes what operators
  configure, so they rename once. The brainstorm settles
  how far "infrastructure" reaches: the database name,
  compose's service and container names, the hosted
  service names, the test-only `CHROME` and
  `CHROME_DEBUG_URL`, and the scripts' and tests'
  `FUSION_ANGLE_STATIC_ROOT` (`bin/test-browser:38`,
  `tests/browser/fixtures.ts:58`),
  `MOST_RECENTLY_VALIDATED_SHA_PATH`, and
  `WORKING_TREE_PORCELAIN` (`test:242`, `:246`), which
  the oracle reaches. Oracle: `env | grep FA_` lists
  everything the system needs, and a test finds every
  environment read in product code and scripts and fails
  on a name without the prefix outside the two edges
- Gone for every document. State by PUT retires a
  record instance's id for good: the never-written latch
  makes tombstone-wins the statement's rule, and a
  retired instance's read, update, and re-create answer
  410 Gone (RFC 9110 §15.5.11;
  `api/message-pair.ts:843-852`, used at
  `api/routes.ts:3381`). Memberships declare the same
  latch (`api/invitations-domain.ts:219`, `:696`).
  Reads are done: every
  family's deleted document — a DELETE head, or a
  state-`deleted` head in a lifecycle family — answers
  410 on GET after the fence and is no part of a
  collection. The write half stays open: every family
  but those two re-creates over its tombstone (the nil latch
  lands over a DELETE head), and a singleton's first
  write sends no declaration: `putClientRegistration`
  and `deleteClientRegistration`
  (`client/identities.ts:237`, `:258`) and the PII hop
  of `putHumanMember` (`client/members.ts:270`) send no
  conditional when the page read absence, though the
  transport has `'creates'` (`If-None-Match: *`,
  `client/request-context.ts:106`), used by the
  instance create (`client/record-instances.ts:117`) and
  the membership seat of `postHumanMemberCreation`
  (`client/members.ts:304`), so
  two tabs registering the same client at once overwrite
  each other silently. An id is
  an identity: reusing one lets a stale reference — a
  binding, an export, an audit line, a client's cache —
  name a different document, as two customers sharing an
  id would. Consider tombstone-wins, and so 410, for
  every document's writes. It costs re-creation by PUT
  for the class A families and `If-None-Match: *` over a
  tombstone for flows and work orders; the POST creates
  already mint fresh ids. Oracle: for each family,
  create, DELETE, then a declared create answers 410, as
  a GET already does; a never-written id answers 404; a
  foreign organization's retired document answers what
  its live one does; history and past versions answer
  410 with the document.
- Admins act within their organization. Any
  organization's admin can write a password credential
  for an identity in another organization and sign in
  as it. `ROUTE_POLICY` grants `admin` every verb at
  `/` (`api/authorization.ts:180-184`); `identities/…`
  is the global plane, which the organization fence
  never sees; and the credential PUT checks nothing —
  `postIdentityCredentialDocumentOp`
  (`api/routes.ts:2610`) ignores the path identity and
  the actor and lands the body, whose `secret` the gate
  checks only as a string (`api/validators.ts:587`) —
  while sign-in reads that identity's own credentials
  (`deriveCredentialsFor`, `api/authentication.ts:1729`).
  Found by reading the code; no test drives either
  answer. The same unscoped arm reaches the token chain:
  the gate's self-or-admin guard
  (`SELF_ONLY_TOKEN_ROUTES`, `api/api.ts:430-434`,
  checked at `:807-845`) lets an admin name any
  identity, `callerIsAdmin` being the claim
  organization's `admin` role (`:701-702`), so an
  organization's admin can rotate or revoke the token
  chain of an identity outside it. The sweep covers
  every other admin-reachable `identities/:id/…` write
  — the identity PUT (`api/routes.ts:3595`), PII PUT and
  DELETE (`:3690-3694`; `authorizeIdentityPii`,
  `api/request-auth.ts:160-176`, admits any admin),
  credentials (`:3793`), registration (`:3826`,
  `:3833`), tokens (`:3911`), and providers (`:4019`) —
  and `GET identities/`, which serves the stored heads
  at the global prefix whatever the caller's
  organization (`api/routes.ts:3509-3514`). The reads of
  PII and credentials carry a membership fence
  (`:3659-3686`, `:3774-3785`) that admits an identity
  with no membership. No root operator exists: the `/`
  tier every organization admin holds is the only
  cross-organization reach (`api/authorization.ts:172-186`).
  Scope the admin arm to identities with an accepted
  membership in the claim's organization; member
  creation lands the identity before its membership
  (`postHumanMemberCreation`, `client/members.ts:276`),
  so the brainstorm orders that, and decides whether a
  cross-organization operator should exist at all.
  Oracle: a red test first plants a credential across
  organizations and signs in with it; then, on each
  route above, an organization admin naming an identity
  with no accepted membership in its organization is
  403 before any read or write, and naming one that
  holds one is unchanged.
- Instances and bound work orders name the record-type
  version they were written against. An instance's state
  is `{ id, organization_id, record_type_id, values }`
  (`instanceStateOf`, `api/routes.ts:3291-3302`); it gains
  `record_type_etag`, the type's head etag when the
  instance's version landed, beside `record_type_id`,
  which stays, so the body keeps every id in its path. A
  bound work order's version carries `instance_id` and
  `record_type_id` (`api/work-order-version.ts:39`,
  `:70-76`, `boundVersion` at `:289-311`); it gains
  `record_type_etag`
  beside `record_type_id`. Oracle: an instance's GET and a
  bound work order's GET each carry `record_type_etag`
  equal to the record type's ETag at the write that
  produced that version, and a later type write leaves
  the older version's `record_type_etag` unchanged.
- An idea converts whatever its state. The conversion
  (`api/routes.ts:4059-4167`) latches the idea on the client's
  tag and runs one statement: the idea in order, the
  project and each baseline as declared geneses under the
  ids the client minted. Nothing reads the idea's state.
  An idea already promoted converts again: its row
  matches and is skipped, and a second project and its
  baselines land under their fresh ids; the answer is
  200 with the idea's head. An idea whose state is
  `deleted` converts too. A resent conversion with the
  same ids is refused only because the project's name is
  taken (409), when it latches the promoted head; one
  that carries its first `If-Match` meets the stale idea
  row first and answers 412. No test converts an idea
  that is not `approved`
  (`tests/api-idea-conversion.test.ts:108` seeds
  `approved`). The handler already reads the idea's head
  for its latch, and the latch holds that head through
  the statement, so the refusal can judge the head it
  read. Oracle: converting an idea whose head is not
  `approved` (promoted, deleted, or any other state)
  answers 409 naming the idea and stores nothing; an
  approved idea converts as today.
- The context is the one source of `operation-id`. The
  message-plane spec retired the `?? ''` reads, the
  server's mints, and `headerFieldsWithOperationId`
  (`docs/superpowers/specs/2026-09-23-message-plane-design.md:534-541`);
  two of the three stayed. Two handler calls read the raw
  header with `?? ''` (`api/api.ts:1011-1013`,
  `:1303-1305`) after the gate has required it
  (`:469-484`), and `headerFieldsWithOperationId`
  (`api/message-pair.ts:227-238`, called at `:353`) adds
  an `operation-id` line to a request the server forms
  itself. On the client, the raw token verbs take
  `operationId: string | undefined`
  (`client/http-facade.ts:235`, `:255`, `:274`, `:296`)
  and send no id when it is undefined, a branch no caller
  reaches. Oracle: no `?? ''` reads `operation-id` under
  `api/`, `headerFieldsWithOperationId` is gone, and the
  raw verbs take a `string`.
- A received POST or PATCH names the root, not the head
  it acted on. Item 0's design, which landed and left
  this file, had it name the head its
  `If-Match` named — the state it acted on — and a
  creating POST the root, so `supersedes` means one thing
  on every pair. The statement names the head at the
  pair's own `(path, name)`, or the root
  (`COALESCE(s.head_id, …)`,
  `api/ledger-statement-sql.ts:118-119`), and an
  operation stores at its operation path
  (`pathAndNameOf`, `api/path-and-name.ts:14-41`), where
  no PUT or DELETE lands, so every received POST and
  PATCH names the root whatever its `If-Match` said.
  SCHEMA.md calls `supersedes` the lineage and the root
  the predecessor of a genesis (§4) and says nothing of
  a received pair. Owner call: carry the latch into
  `supersedes`, or rule that a received pair names its
  own path's head and say so in SCHEMA.md. Oracle: a
  received in-order POST's `supersedes` equals its
  `If-Match`, or SCHEMA.md states the rule and a test
  pins the root.
- A revocation's cutoff is the client's clock. The
  token-revocation PUT carries `at` from the browser's
  `nowUtc()` (`client/identity-token-revocations.ts:17`),
  the gate checks it only as a timestamp
  (`validateIdentityTokenRevocationEntity`,
  `api/validators.ts:617-632`), and every access token
  with `iat <= revokedThrough` is refused
  (`tokenRevocationReason`, `api/authentication.ts:685`;
  `revokedThroughSeconds`, `api/access-token.ts:224`).
  A device clock behind the server's leaves the token a
  logout meant to end alive; one ahead refuses the
  identity's next tokens until it catches up. The state
  by PUT spec named it with primary-organization
  resolution, the other decision a client-minted stamp
  drives
  (`docs/superpowers/specs/2026-09-25-state-by-put-design.md:361-362`).
  The pair's own `response_at` is the one clock, as the
  grant's issue instant already reads it. Oracle: a
  revocation stamped by a skewed client still refuses
  every token issued before the server received it, and
  none issued after.

## Later work

- The auth page's left panel shows invented stats —
  "10K+ Active Users", "98% Satisfaction", "50+
  Integrations" (`web-app/auth/index.ts:118-157`,
  TEST-PLAN B5). Same sin as the landing mock-up;
  its own spec.
- One gate for the write. Every write is one ledger
  statement now (`runLedgerStatement`,
  `api/ledger-statement.ts:48`), but each handler still
  lands its own: `runWrite` at 40 sites, 37 of them in
  `api/routes.ts`, `runStateWrite` at 17, 13 there, and
  `landStateWrite` twice in `api/authentication.ts`,
  because each handler owns its own storage instead of
  returning its pairs for one place to store. A handler
  returns `MessagePair[]`; the gate lands them once, with
  one notification. Lands beside item 11, which
  rewrites the largest handlers. Oracle: one `runWrite`
  site in `api/api.ts`, and no `runWrite` or
  `runStateWrite` in `api/routes.ts`.
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
- Request statistics in `./bin/measure`, with
  visualizations. `handleRequest` (`api/api.ts:446`) is
  the one seam: `server/http-server.ts:681` routes the
  product through it, and the tests' in-process
  transport (`inProcessFetch`,
  `tests/in-page-facade.ts:31-56`) does too, after
  `simulateLatency()`, its only caller, so a timer there
  measures the handler alone. Record
  per request: method, route family (ids folded to `:id`),
  status, handler ms, wall stamp. A throwaway probe on
  `packageable-client` (`ffa73bf4`, memory suite,
  `--parallel`) saw 7,318 requests over a 36 s span (~200/s,
  peak 1,845 in one second); handler ms p50 0.57, p90 4.5,
  p99 100, max 244; 6,255 2xx, 1,057 4xx, 6 5xx. GET
  `work-orders/:id/history` (since retired)
  clusters at 100-102 ms (p90 100.7, max 102.3),
  unexplained. The probe's synchronous
  per-request append cost ~1.3 s on a 45 s suite. Suite
  throughput through the memory backend is not a load test;
  the Postgres origin (`--base-url`) is where a rate means
  something. Visualize beside readyMs in `measure-viz`: a
  log-bucket latency histogram, per-route p50/p90/p99, and a
  requests-per-second timeline. Oracle: `--record` writes the
  per-route figures to `measurements/`; `--visualize` draws
  the three charts; `--check` gates per-route p90 against
  `measurements/budgets.json`.
- The refresh lock `fusion-refresh`, the peer channel
  `fusion-angle:refresh`
  (`client/session-refresh-mutex.ts:8-9`), and the
  credential key `STORAGE_KEY_AUTHORIZATION`
  (`client/session-storage-keys.ts`) are per page
  origin, not per client. Two clients in one realm
  refreshing at once wait on one lock and adopt each
  other's broadcast token, across API origins too — the
  spec's "two origins or two sessions cannot coexist" is
  met for the token, flight, cookie flag, and recovery,
  but not for cross-tab coordination; no product path
  builds two clients in one document today. Fix: scope
  the lock name, channel name, and credential key by a
  key the client is built with (the transport origin).
  Oracle: two clients over different origins refresh
  concurrently in one realm and each keeps its own
  token.
- Stamp parameters stay text until Postgres parses
  them. A stamp bound as `timestamptz` (bare
  placeholder or `::timestamptz`) truncates to
  milliseconds on the second execution of a prepared
  statement. The ledger statement mints its stamp in
  SQL (`api/ledger-statement-sql.ts:88-99`), so one
  stamp parameter remains, `insertPair`'s
  `${responseAt}::text::timestamptz`
  (`api/backend-postgres.ts:737`), guarded by 'append
  casts the response stamp to timestamptz'
  (`tests/backend-postgres.test.ts:424`); nothing pins
  the round trip itself. Oracle: a Postgres test
  executes a stamp write twice and reads six digits
  back both times
- The memory backend's sort coerces `response_at`
  with `?? ''` on a NOT NULL column
  (`byResponseAtThenId`, `api/backend-buffer-tx.ts:
  35-36`; examination report). Oracle: the sort
  helper takes the same string the keyed path does;
  a missing stamp throws
- Wipe and reseed every live database onto the ledger
  store's table at the deploy of items 0–3. Nothing
  alters a database in place: the seed refuses one
  whose `fa_message_pairs` exists
  (`server/seed.ts:101-128`), and a master-era database
  — `message_pairs` and its `schema_marker` row — boots
  this binary and fails every read, while the seed
  meets its marker and rolls back (item 3). So every
  live ledger takes `./bin/postgres-wipe` then
  `./bin/postgres-seed`, or the Render equivalents
  through `./deploy`, and with it arrive the exact-read
  shapes (Spec Decision 8: invitation `state` on the
  head, PII at `('/identities/<id>/', 'pii')`, token
  `name = jti`, no `/identity-tokens/`), which
  production derives never dual-read, the membership
  documents, `fa_message_body_json`, and the partial
  index `fa_message_pairs_body`
  (`WHERE path = '/invitations/'`). Oracle: every live
  database has been wiped and reseeded after the ledger
  store's landing, and holds `/migrations/0000-root`
- Filtering other collections by a body field. The
  partial index `fa_message_pairs_body` reaches
  `path = '/invitations/'` only
  (`BODY_INDEXED_PATH`, `api/schema-postgres.ts:194`).
  Objectives record a transition in the body
  (`lifecycle: 'state'`, `OBJECTIVES_WIRING`,
  `api/routes.ts:454-462`) and serve versions per
  objective (`documentVersionsSelectRoute`,
  `api/routes.ts:5265`). They have no collection-wide
  versions view. Oracle: a body field on another
  collection selects through an index the statement
  names, or the read says it scans
- XSS can use the refresh cookie from the page. The
  cookie is HttpOnly, SameSite=Strict, Path=
  `/api/authentication`, Secure
  (`api/authentication.ts:175-191`; pin
  `tests/api-authentication-token.test.ts` 'token JSON
  has no refresh_token; Set-Cookie is HttpOnly'), so a
  page script cannot read it — a same-origin `fetch` to
  `/api/authentication/token` still sends it and the
  JSON returns a live access token. CSP `script-src
  'self'` (`server/http-server.ts:43-49`) narrows
  injection; it does not close cookie-use. Closes KNOWN
  seam "XSS can use the refresh cookie from the page".
  Oracle: a Layer 1 case that an unauthenticated page
  script cannot mint a live access token from the
  cookie alone
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
  `./test validate` green.
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
- Split the `default-organization` singleton the way PII
  split. Exact-read spec Defers: the SET document is
  still a collection-shaped path with empty name (`path
  = /identities/<id>/default-organization/`, `name =
  ''` — `api/derive-default-organization.ts:11-18`),
  while PII is `path = /identities/<id>/`, `name = pii`.
  HTTP can stay `identities/:id/default-organization`;
  only the stored split changes. Oracle:
  `getDocumentHistory('/identities/<id>/',
  'default-organization')` is the SET document, and the
  empty-name prefix is gone after wipe
- Split `client_registration` the way PII split.
  Registration is still the pre-PII shape: `path =
  /identities/<id>/registration/`, `name = ''`
  (`api/derive-identity-spine.ts:366-419`;
  WRITE_RESPONSE_SPECS `name: ''` at
  `api/routes.ts:3027`). HTTP can stay
  `identities/:id/registration`; only the stored
  split changes. Oracle:
  `getDocumentHistory('/identities/<id>/',
  'registration')` is the SET document, and the
  empty-name prefix is gone after wipe
- The cross-party delegation ledger
  (`api/authentication.ts:1199-1204`;
  `tests/api-authentication-token.test.ts:1028`)
- Passkey, provider-IdP, and corporate-OIDC ceremonies
  (`api/authentication.ts:1852-1888`;
  `tests/api-authentication-authorize.test.ts:253`)
- Per-client multi-audience, DPoP `cnf`, jti reuse
  detection (`shared/types.ts:527-529`;
  `shared/access-token-decode.ts:30-31`)
- SP-6 sign-up (`web-app/auth/index.ts:641-651`)
- Cryptographically signed ledger — brainstorm signing
  of stored pairs. The ledger store hashes both
  messages where they are stored
  (`api/ledger-statement-sql.ts:122-146`), and no
  product reader recomputes a hash: `pairRootHex` runs
  on the memory backend's write path alone
  (`shared/ledger-statement.ts:337`), and only tests
  verify ('stored messages verify against their
  hashes'). The dropped `version` column hashed on write
  and was never checked on read —
  `docs/superpowers/specs/2026-08-24-etag-is-the-pair-id-design.md`.
  Item 3's full check is the first reader; signing is
  what remains after it.
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
  against `node:crypto` scryptSync's 192 ms (the product
  calls the async `scrypt`, `server/scrypt-hash.ts:5`) —
  17% slower,
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
  (`client/objectives.ts:102-142`)
- `./bin/measure` harvests error-page timings;
  `page:ready` carries no status —
  `web-app/app/page-performance.ts:27`, harvested by
  `harvestReady` (`web-app/app/browser-drive.ts:45-60`)
- Claim-on-load with no release-on-leave plus the
  8-hour `DEFAULT_LOCK_TIMEOUT` turns a drive-by
  work-order view into an 8-hour claim
  (run-six Task 3 renders it; the UX remains) —
  `web-app/workbox/detail.ts:598-616`,
  `shared/types.ts:1087`
- `subscribeOnce` guarantees "never two" live subscriptions,
  not "always one": a bell arriving between teardown and
  re-arm is dropped, leaving an empty list page blank — the
  symptom run-six Task 9 fixes. Needs two bells inside one
  fetch window; a pending flag would close it but
  reintroduces the shared state the design avoids —
  `client/channels.ts:214-225`
- A `fusion-angle:data` bell during `./test` re-enters
  the ideas list `init` on a document that has no
  `#ideas-list`. `subscribeOnce`
  (`client/channels.ts:219-223`) calls `init`
  (`web-app/ideas/index.ts:47`), `$required` throws,
  and `handlePageLoadError` logs `page failed to init`
  with `Required element not found: #ideas-list`
  (`web-app/app/page-loader.ts:50`). Witnessed
  2026-10-03 on `a6af68a6` as post-test output between
  `identity-tokens-reduce` and `drift-states`; the
  suite still reported 0 failed, so the gate stays
  green. `BroadcastChannel` was process-global then;
  since 3d808c92 each test worker prefixes its channel
  and lock names (`tests/worker-name-prefix.ts`), so a
  peer file's bell no longer reaches the page, and a
  bell inside the ideas file's own worker after its
  document is gone stays possible. Re-witness before
  working it. Oracle: `./test` prints neither `page failed to
  init` nor `Required element not found: #ideas-list`;
  `tests/ideas-empty-subscribe.test.ts` stays green;
  a bell after the ideas document is gone does not
  log and does not paint the error state
- The records list's steady-state subscribe is still
  fire-and-forget. `subscribeRecordChanges(async () => {
  … await getRecords … })` (`web-app/records/index.ts:
  118-127`) has no error handler. Critical-functionality
  path fenced `subscribeOnce`'s four `onEmpty` inits and
  excluded this sibling. Oracle: a failing re-GET on
  the records list renders Try Again, zero unhandled
  rejection — the same pin shape as
  `tests/ideas-empty-subscribe.test.ts`
- Objective lifecycle history compares two clocks:
  `revision.at` is client-minted while the lifecycle `at`
  is the server-stamped pair fact. A browser clock ahead of
  the server can invert them and throw, so the History
  modal fails to open with an error toast instead of
  rendering —
  `client/objectives.ts:268`, `:302` (the revision's
  `nowUtc()`), `web-app/projects/detail.ts:925-986`,
  and the throw at
  `web-app/app/presenters/project-score-history.ts:206-211`
- Deno-only tooling modules still live under
  `web-app/app/` — `measure.ts`,
  `generate-api-documentation.ts`, `compose.ts`,
  `generate-schema-svg.ts`, `cdp-client.ts`,
  `measure-viz.ts`, and `hash-static.ts` (e7ce7969,
  `Deno.readDir`). The browser
  tsconfig `exclude` that listed them is gone with that
  file. Moving them to a top-level tools directory
  would make browser membership by rule and is the
  exclusion the `Deno.*` fence still needs. Oracle:
  those seven files are not under `web-app/app/`
- A DOM-free server universe — `deno.json` is the only
  project and its `lib` includes `dom`, so a `document`
  in `api/` or `server/` type-checks. Re-measured: a
  temp `document.body` under `api/` passed `deno check
  --frozen api`. WebCrypto/Fetch names the server needs
  (`crypto.subtle` in `api/client-assertion.ts:174`,
  `:184`) live on `lib.webworker` without `document`.
  Oracle: a
  `document` reference in `api/` fails `./test validate`
- The Send Back feedback textarea is discarded.
  `web-app/app/presenters/idea.ts:410-425` renders
  `<textarea id="approval-send-back-feedback">` in the
  Send Back dialog — its id split across a
  concatenation (`'approval-send-back' + '-feedback'`),
  so a grep for the whole id finds not even the render,
  and `grep -rn "\-feedback'"` finds no read: the confirm path
  (`web-app/ideas/detail.ts:285-300` → `transitionIdea`
  → `postIdeaStateChange`) has no feedback parameter, so
  whatever a reviewer types is thrown away. Found by
  reading, not driving, during the 2026-08-29 audit; no
  TEST-PLAN case claims the feedback survives. Oracle: a
  Layer 1 test asserting the typed feedback reaches the
  transition
- Roster map mints `{ erased: true }` before the PII
  fill. `buildHumanMemberMap` plants a tombstone on
  every seat (`client/members.ts:125`);
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
  in one invocation with `client`, `server`, and `tests`
  (`test:64`), and
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
  `measure-viz.ts` 6, before `hash-static.ts` joined
  them) and none in browser page code. So
  that half needs the lib change PLUS the exclusion
  registry the `process` half escaped. Oracle for the
  `process` half: that invocation in `./test validate`, red
  on a `process` reference under `web-app/`.
- `./bin/measure --record` writes the literal `'unknown'` as
  `cpuModel` (`web-app/app/measure.ts:956`). Deno exposes
  no CPU-model API — `navigator.hardwareConcurrency` is a
  count — and the `sysctl` workaround was rejected as
  unverifiable and macOS-only. Ten of the fourteen rows
  in `measurements/history.jsonl`, `c50e849` on, store
  `"unknown"`. The truthful
  shape omits the field rather than storing a sentinel,
  which needs `measure-core.ts`'s field type and
  `shapeHistoryLine` (:49, :284) together with
  `measure-viz.ts:1052`, whose `|| ''` is itself the
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
  the states row half is stripped; `states.postEvent`,
  defined nowhere now, is named at `api/routes.ts:354`,
  `:1066`, `:1102`, `:1143` and `api/mock-data.ts:872`;
  and `web-app/app/root-redirect.ts:6-7` says esbuild and
  `./build` where `deno bundle` and `./bin/build` run. The run-four
  remediation's Evidence
  (`docs/superpowers/specs/`
  `2026-08-23-test-plan-run-four-remediation-design.md:911-932`)
  lists provenance, not comments, and the reproductions
  that might have were scratchpad, never committed —
  the pass re-derives its enumeration by reading. The
  "remove the comment … when done" and "revise both
  comments when done" pointers other entries carry are
  those entries' property, not this pass's
- Unpinned but pinnable — TEST-PLAN covenants with no
  test, or no test for the part a sub-bullet names: the
  2026-08-29 audit's gap list, in TEST-PLAN order. Each
  names the lowest layer that could express it. The
  walk observes these; nothing else proves them. TEST-PLAN.md's "see
  Unpinned but pinnable" references land here.
  - A real `./bin/build` run — its exit code, the ZIP it
    writes, and that ZIP surviving the walk, plus the
    artifact's contents: the 29 `PAGE_REGISTRY` files
    (the eight A2 names, `api-documentation/index.html`
    among them), the `fusion-angle` executable, the
    content-hashed `assets/app.<hash>.js`,
    `styles.<hash>.css`, and `pages-*.<hash>.css`,
    `site/asset-manifest.json`, the woff2 fonts, the 18
    page directories, and the verb/status rooms generated
    separately from `PAGE_REGISTRY` (A1, A2, J3) — Layer
    1, an integration test in the shape of
    `tests/deploy-cli.test.ts` that spawns `./bin/build
    --no-zip` into a temp dir; today the 29 is pinned in
    the registry alone (`tests/page-registry.test.ts`), and
    `tests/server-zip-metafile.test.ts` regex-checks the
    build scripts and walks one `deno info` graph
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
    the computed destination is pinned
    (`tests/apex-destination.test.ts:53`, `:64`), the
    live transition is not: `tests/browser/landing.test.ts`
    opens `/landing/index.html`, never `/`
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
    `bindAddMemberDialog` (`web-app/members/index.ts:369`)
    is driven only for a human submit
    (`tests/browser/member-create.test.ts:31`) and a
    reset on reopen (`tests/browser/dialogs.test.ts:79`)
  - The live membership-derived roster and the Ideas list's
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
  - The Create-node edge group's deliberate lack of a
    `data-edge-id`, which is what keeps it
    non-interactive (AA30) — Layer 1, an absence
    assertion over `web-app/app/flow-graph.ts:872-886`;
    its `data-edge-ref` is pinned
    (`tests/flow-graph-xss.test.ts:119`)
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
    (`tests/presenter-project-detail-impact.test.ts:28`)
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
    "Promoted", not "Approved" (D24) — Layer 1, an
    assertion on the label; `promoted` fixtures exist
    (`tests/presenter-idea.test.ts:463`, `:750`) and none
    reads it from `IDEA_STATE_CONFIG`
    (`web-app/app/presenters/state-display.ts:34-37`)
  - The convert page's error states (D35) — Layer 1;
    `web-app/ideas/convert.ts` hand-rolls two
    `buildErrorState` calls, the idea's and the
    objectives' (`:99-120`, `:121-142`), outside the
    shared `loadInto` helper, whose own error state is
    pinned (`tests/loading-states.test.ts:79`)
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
    (`web-app/app/flow-export.ts:172`), already pure
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
    `web-app/app/flow-graph.ts:48`) is asserted nowhere
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
    / `withZoomedOut` through `#guardAutoFit`,
    `web-app/app/presenters/flow-designer.ts:877-903`)
    and the step path's 0.25 floor
    (`web-app/app/flow-interactions.ts:945-950`) (F29) —
    Layer 1, `tests/flow-designer-presenter.test.ts` for
    the buttons (only the wheel path is covered); the fit
    path's `MIN_ZOOM` clamp is pinned
    (`tests/flow-zoom-to-fit.test.ts:166`, `:206`, `:251`)
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
    as a set and `flow.txt` (F42), and members and
    attribute refs surviving `getFlowZip` →
    `getBackupFromZip` (F6, F44) — Layer 1,
    `tests/adapters-flow-export.test.ts`; `flow.json`'s
    presence rides 'zip Create New keeps begin edges and
    sidecar positions with Auto Layout off' (`:457`),
    whose nodes carry no members or attributes, and the
    members-and-attributes round trip builds its backup
    as an in-memory literal
  - The canvas itself changing after each Undo, as
    distinct from the server state (F45, F46) — Layer 2,
    `tests/browser/canvas-*.test.ts`
  - Pan mode surviving a second drag in one session (F49)
    — Layer 2, `tests/browser/canvas-pan.test.ts`
  - The `if (ke.repeat) return` auto-repeat guard (F50) —
    Layer 1 if it is extracted as a pure predicate beside
    `nextCanvasTabIndex`, Layer 2 otherwise
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
  - The seeded completed-work-order count, 129 of the
    145 across `buildWorkOrders()` and
    `buildLeadToCloseWorkload()` (WB3) — Layer 1, an
    exact-count test in the shape of
    `tests/mock-data-objectives.test.ts`, so a seed drift
    goes red instead of surprising a live count; the 145
    is pinned (`tests/mock-data-pairs.test.ts:1056`)
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
    reviewers (FS4) — Layer 1, extending
    `tests/mock-data-stats-window.test.ts:20`, a
    `getFlowStats` test on the real Customer Onboarding
    flow that asserts only its visit heat
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
    `toGeneralInfoDraft` (`web-app/app/organization-view.ts:44`)
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
    (`buildSentRow`,
    `web-app/app/presenters/invitation-list.ts:76`) and
    a pending row's badge (V8) — Layer 1,
    `presenter-invitation-list.test.ts`, whose declined
    and revoked badges are pinned (`:152`, `:170`)
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
    1; `recordDraftFromView` and `formatConstraint`
    (`web-app/app/presenters/record-detail.ts`) are
    exported and untested, and only the constraint
    picker's kinds are pinned
    (`tests/presenter-record-detail.test.ts:104`, `:123`,
    `:142`)
  - Returning to read mode after Save, and the rendered
    constraint summaries (R10) — Layer 1, extending
    `tests/records-detail-reduce.test.ts`, which pins
    only `instanceToDelete`, as
    `tests/projects-detail-reduce.test.ts` covers its page
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
    the option-membership check
    (`shared/record-constraints.ts:217`) is pinned alone
    (`tests/instance-value-validation.test.ts:224`), not
    through a transition
  - `instanceListItems`
    (`web-app/app/presenters/record-detail.ts:120`) —
    Layer 1, zero tests; it builds the
    id-plus-readable-values projection
    `records/detail.ts:145` reads for R16's Instances
    list
  - The exact conflict-notice text (R17, R19) — Layer 1,
    importing `INSTANCE_CONFLICT_NOTICE` in
    `tests/presenter-record-instances.test.ts` instead of
    asserting a hand-typed literal
  - `./deploy`'s termination trap — a signal stopping the
    live `./deploy` and its trap running `compose down
    --remove-orphans`, leaving no compose project and no
    `.env` (J1, J2) — Layer 1, a test that sends the
    signal; 'deploy INT TERM traps exit the park'
    (`tests/deploy-cli.test.ts:248`) reads the traps as
    source text
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
  `web-app/ideas/convert.ts:359`). A design call, not
  a defect: TEST-PLAN D6/D7 pin the toast, and the
  2026-08-26 D6 stub files the voice question as its
  separate finding
- Billing (`web-app/billing/`)
- Attribute drag-reorder (TEST-PLAN R8)
- A flow loaded with Auto Fit OFF no longer fits on
  first paint. `withCanvasSize`
  (`web-app/app/presenters/flow-designer.ts:974-995`)
  fits only under `isAutoFit`, and the load-time block
  (`web-app/flows/detail.ts:1798-1813`) is the only
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
  or on measured `./bin/measure` headroom. Oracle: `grep -rn
  'npm:' deno.json deno.lock` prints nothing;
  `./test postgres` green; `./bin/measure --check` green
  against the committed budgets.
- Cachability — hashed names and gzip sidecars have
  shipped; on the static server `HEAD` reports the same
  `Content-Length` as GET. The API serves no `HEAD`: its
  method switch has no case for it
  (`api/api.ts:964-1349`), so it answers 405, and that
  405 carries no `Allow` (`api/api.ts:1340-1348`) —
  RFC 9110 §9.1 requires GET and HEAD of a
  general-purpose server and §15.5.6 requires `Allow` on
  a 405 — while the gate requires `operation-id` on
  every request, a method never served included
  (`api/api.ts:469-484`). Add
  `HEAD` to the API: now that a document GET serves the
  stored response with three substitutions and three
  additions (`servedResponse`,
  `api/served-response.ts:74`; no route stays parted),
  `HEAD` is that function without the body.
  `last-modified` makes `If-Modified-Since` possible.
  No handler reads it. Conditional
  requests (`If-None-Match` / `304`) stay open. Start:
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
  `tests/api-instances-create.test.ts`); member
  detail's redundant reads (`refresh` on every member
  bell, `web-app/members/detail.ts:225-229`,
  `:261-271`, beside the save's own re-read at
  `:563`); two zoom implementations and two constant
  sets (`web-app/app/flow-fsm-reduce.ts:12-14, 626-675`,
  `web-app/app/flow-interactions.ts:16-18, 908-966`);
  `#noteMutation` / `history()` beside
  `advanceHistory`
  (`web-app/app/presenters/flow-designer.ts:198-204`);
  the shell's hand-kept copy of the reveal header
  (`bin/postgres-lib:7` against `server/seed.ts:28-29`,
  guarded by no test); the second instance the
  remediation added (`canvasFocusOf`'s walk); the undo
  path's duplicated pure helpers
  (`api/flow-graph-diff.ts:13-25`); `toRecordAttribute`'s
  `??` ACL default
  (`client/record-attributes.ts:72-75`); the nested
  key-set follow-on (`api/validators.ts:412-420` —
  remove the comment at `validators.ts:412-420` when
  done); `handleSpace` dispatching
  `isFormFocused: false` unconditionally; Delete's
  `preventDefault` with nothing selected. Oracle: each
  named site collapsed to one definition, `./test
  validate` green; the canvas entries retire with
  product-path item 11.
- Fewer JSON parse/stringify — byte-stream header
  setting, mechanical sympathy and simplicity for
  the processor; measured first
  (`./bin/measure --profile`). Merged: the deferred
  content-coding seams
  (`shared/http-message/body.ts:77-80` and
  `shared/http-message/content-coding.ts:3-8` —
  revise both comments when done). Oracle: a
  `./bin/measure --profile` run placing parse/stringify
  above the budgets' noise — the item activates on that
  number, not before.
- Simulated latency by environment — when
  `FA_ENVIRONMENT` is exactly `local` and
  `FA_LATENCY` is a millisecond count,
  both present and non-empty, every API request
  takes the existing log-normal sampler
  (`api/latency.ts:17-54`) with
  `mu = ln(FA_LATENCY)`; otherwise the
  no-op. Merged: the shim's "both presets pass a
  no-op today" (`api/latency.ts:1-5`,
  `api/db-backed.ts:31-35` — revise both comments when
  done). Oracle:
  `FA_LATENCY=200` under `local` lifts every
  `./bin/measure` median by about 200 ms; unset leaves
  the no-op.
- GPU flag in the Layer 2 launcher — `launchChrome`
  no longer passes `--disable-gpu` (cargo cult under
  `--headless=new`; it was required only by old
  headless on Windows). Its one real effect was
  forcing software compositing, which made runs more
  alike across machines. Dropped UNVERIFIED —
  `./test browser` has run green on one machine
  (2026-08-28). Restore it if two machines disagree.
  Oracle: `./test browser` green on two machines
- `schema-svg.ts`'s `parseStores` still carries a dead
  `StateStore`-matching branch
  (`web-app/app/schema-svg.ts:163-169`): it can never
  match now that `DbStores` holds only `messagePairs`,
  so it has drawn nothing since that field left.
  Oracle: `./test schema` green with the dead branch
  gone, and `SCHEMA.svg` byte-identical.
- Collection reads call
  `db.messagePairs.getCollectionHeadPairs` directly —
  `api/derive-identity-tokens.ts:121`,
  `api/head-reads.ts:123`,
  `api/organization-requests.ts:56`,
  `api/routes.ts:926`, `:3724`, and the test-only
  `documentCollectionGetHandler`
  (`api/document-family.ts:434`) — while per-id reads go
  through `messageStore(db).getDocumentHead`.
  `MessageStore` (`api/message-store.ts:15-25`) offers
  `getCollection`, which decides no tombstone, and no
  `getCollectionHeads`; that seam would put the
  tombstone decision in one layer. Oracle: every
  collection read goes through the store seam,
  `./test validate` and `./test postgres` green.
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
  absence is accounted for — the ledger store left
  `supersedes`
  unenforced for this — and writing it is an INSERT, which
  a delete-only view cannot make: the brainstorm settles
  whether the eraser also inserts through a view of its
  own, held to erasure pairs by a check option (measured:
  such a view refuses a row at another path), or another
  role writes the record. Until it ships the page says
  "removed", never "erased" (item 2). `DELETE` is logical
  until `VACUUM`, and WAL and point-in-time backups hold
  the bytes until the host's retention expires — state the
  window. The brainstorm also settles two questions this
  bullet inherits. Cascade: erasing a document's pairs
  follows the DELETE cascade policy (its bullet below),
  because a dependent that copied the erased values into
  its own state — a revision, an operation's response —
  still holds them, so erasure walks the same reference
  table the cascade does. Tombstones: the suspicion is that an erased
  document keeps exactly one version, its tombstone — the
  DELETE head the view already refuses to delete — so its
  id still reads retired (the Gone bullet), its
  succession still has a head, and the erasure pair names
  every predecessor the tombstone's `supersedes` chain
  lost. Oracle: `tests/api-pii-tombstone.test.ts`
  'erased PII remains in superseded pairs; login is 401'
  inverted for the erased pairs, and each erased
  document's one remaining pair is its tombstone.
- The code's word `erased` becomes `deleted`: this is an
  HTTP application, and the state it names is a DELETE
  head at `identities/:id/pii`. Its own change: the PII
  union's discriminant (`shared/types.ts:647-656`) and
  the stem `eras`, any case: 78 occurrences in 16
  product files under `api/`, `client/`, `server/`,
  `shared/`, and `web-app/`, and 83 in 15 test files,
  type-erasure words among them (`erasable`,
  `api/document-family.ts:34`, `:155`,
  `api/routes.ts:338`), so the sweep works from a word
  list, never the bare stem. It is a field, never a
  column, and touches no stored byte — the client
  builds the flag from a 404, 410, or 403
  (`client/identities.ts:140-146`) — so it has
  no deadline. The page keeps "removed" (product-path
  item 2) until the eraser ships; the code speaks HTTP.
  Oracle: the word list's terms appear in `api/`,
  `client/`, `server/`, `shared/`, and `web-app/` only
  where the eraser bullet's own words do.
- The reporter — `fa_reporter`, named in product-path
  item 2 only as an example of its principle: a role
  created with its first worker, never before. Nothing
  about it is defined yet — its view, its grants, and
  whether it sees hidden pairs are its own brainstorm's.
  Activates with the first worker that needs reports.
- Table migrations — deferred by decision: the ledger
  store holds the table's DDL final, and item 3 ships
  everything a change to the fence needs. Activates on the
  first change to the table once a tenant's data exists
  and a wipe is no longer possible. The pieces already
  stand (item 3, measured): a migration is the genesis of
  its own document in `/migrations/`, named for what it
  does behind a four-digit order after the root,
  landed by `migrate` with its SQL the `request` and
  its digest the `response`; names order migrations and
  the succession index refuses a second runner, with no lock
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
- `FA_GIT_SHA` — the commit that built the running
  binary, supplied by the environment as every `FA_`
  value is and never defaulted, read once at boot and
  carried in the context so every log line names the
  build (the Office of Structured Observability), and
  the one source of the `<sha>` in the `user-agent`
  token the client and item 3 send. `./deploy` fills it from
  `git rev-parse HEAD`, exact because the build refuses
  a dirty tree; on Render from the host's commit
  variable (`RENDER_GIT_COMMIT`), a name that stays at
  the edge (the naming bullet). How the page bundle
  learns it — embedded at build, or served — is this
  bullet's to settle. Nothing sends the token yet: the
  message-plane spec left it out
  (`docs/superpowers/specs/2026-09-23-message-plane-design.md:272-274`),
  and no `user-agent` line appears under `client/`,
  `api/`, `shared/`, or `server/`. Oracle: a boot without
  it refuses, as a boot without `FA_POSTGRES_URL` does; a
  request log line carries it; and every API request the
  client sends carries `user-agent: fusion-angle/<sha>`
- JEV joins the list of available AI agents, and that
  list becomes one. `api/provider-models.ts` calls
  `PROVIDER_MODELS` the single source of truth, and the
  AI-member gate checks `model` against it, but it is not
  yet the only list: the seeded roster
  (`api/mock-data/ai-members.ts`) spells four of its names
  again as agent names, and TEST-PLAN.md spells catalog
  names in prose: AA7a lists the four and picks "Claude
  Haiku 4.5" (`:647-656`), AA8a's example names "Claude
  Sonnet 4.6" (`:683`), two pin notes quote a
  fixture's 'Claude Opus 4.8' (`:694`, `:5588`), and the
  native-select driving note and G24b spell GPT-5.5 and
  "Claude Sonnet 4.6" (`:346-348`, `:5618`). Make the
  catalog the one list first: the roster takes each
  agent's name from its `model` id, and TEST-PLAN.md
  names models by their place in the catalog (the
  seeded AIs, an Anthropic model not seeded), never by
  spelling. Then JEV
  lands as one entry there: `provider` `TypeSafe AI`,
  `name` `JEV` (no catalog name carries its provider;
  "Claude", "GPT", and "Grok" are families, and the
  provider rides its own field), and `api_name`
  supplied, never invented. Wherever an AI model's
  provider name is stored, JEV's is `TypeSafe AI`.
  Oracle: JEV appears in `PROVIDER_MODELS` under
  `TypeSafe AI` and in the AI form's Model picker, and
  no model name is spelled outside
  `api/provider-models.ts` but in test fixtures;
  TEST-PLAN.md prose counts as a spelling
- No error-message allowlist. `safeErrorMessage`
  (`server/postgres-gate.ts:101-121`) prints a message
  only if a set names it, else `seed failed` (seed,
  `server/seed.ts:41`), or boot's and wipe's fallback
  (`postgres-gate.ts:126`, `server/postgres-wipe.ts:38`),
  so a fault the seed's own code raises — a rehearsed row
  that does not land, a row on another predecessor —
  reaches the operator as `seed failed` and a code, the
  evidence destroyed. Two classes replace it. A
  precondition refusal names itself: the database is
  not empty, a required env is missing, Postgres is
  unreachable, a concurrent seed won, the flags are
  wrong. Everything else is a bug and crashes with its
  message and stack. The allowlist kept secrets off
  stderr; that duty moves to the gate: no secret enters
  an error message, and the Postgres adapter enriches a
  driver fault without the URL or password. First check
  what the driver's own messages carry (connection,
  authentication, and constraint errors); a secret found
  there is fixed at the adapter, not filtered at print.
  Oracle: the allowlist and its fallback are gone; each
  named refusal prints its own message; a forced
  rehearsal fault prints its message; and a pin feeds
  the adapter each driver fault class with a known
  password in the URL and finds the password in no
  message
- One rehearsal per test process, if measurement earns
  it. `tests/` calls `seededMockDb()` at 96 sites, and
  `sharedMockDb()` seeds once per worker that uses it;
  each builds the identical dataset from nothing: hash,
  form, rehearse, land. A landing onto an absent table
  is a pure function of the rehearsal, and fresh memory
  backends share nothing, so the harness could rehearse
  once per process and land that one rehearsal into each
  new backend (a memory landing measured 130 ms). This is
  a test-only cache, and the product seed never keeps
  its rehearsal. The rehearsal now runs as one
  transaction on its scratch, measured at `2790a9a5`
  and after (`measurements/probes/seed/rehearsal.ts`,
  medians): the rehearsal's replay 1,055 ms to 153 ms,
  the rehearsal 1,276 ms to 707 ms, a memory seed
  1,396 ms to 851 ms (692 ms before the ledger seed),
  a Postgres seed 1,431 ms to 866 ms, and `./test`
  61.0 s to 44.2 s over three runs each. The memory
  seed misses the closed bullet's oracle, at or under
  692 ms, by 159 ms. Whether the per-seed rehearsal is
  still a cost worth a cache is the operator's decision.
  Oracle: `./test` measured before and after this change
  alone, three runs each, and every test that mutates
  its seeded database still gets its own backend
- The app still reads the server after the packageable
  client. With the contract in `shared/`, four modules
  outside the client import `api/`: the documentation
  generator (`web-app/app/generate-api-documentation.ts`)
  reads the route table and its surface
  (`api/routes.ts`, `api/route-surface.ts`,
  `api/http-status-documents.ts`, `api/request-auth.ts`,
  `api/document-family.ts`, `api/path-segments.ts`) under
  `deno run`, never in a page; two presenters
  (`web-app/app/presenters/ai-member-detail.ts:22`,
  `presenters/member.ts:25`) read the provider-model
  catalog (`api/provider-models.ts`); and the records
  detail page (`web-app/records/detail.ts:62`) derives
  claim roles (`api/authorization.ts`) — the two `api/`
  modules the page graph reaches today. The catalog and
  the claim-role derivation are both sides' and belong
  in `shared/`; the generator is a tool and may read
  the server. Oracle: an import-graph walk from every
  `PAGE_REGISTRY` entry finds no module under `api/`
- The client hands the app three shapes. Head reads
  made each raw row a message: a verb that read a wire
  row answers `HttpMessage<Row>`, or an array of them
  for a collection's parts. The five named values
  (`Idea`, `Project`, `RecordModel`, `WorkOrder`,
  `RecordInstance`) and the values a write latches
  through (`HumanMember` by its membership, `MemberPii`
  present, `ClientRegistration` registered, the app's
  `Organization`, and `FlowGraph`) keep the message
  they were built from. The aggregates and the
  camelCase values nothing writes through — `AIMember`,
  `Identity`, the roster, `RecordAttribute`,
  `ObjectiveScore`, `ObjectiveRevision`,
  `ProviderEvent`, `TokenChain`, the credential state,
  `FlowSummary`, `FlowListItem`, `BoundFlowSummary`,
  and the transition and claim projections — keep
  their shapes and drop the responses they were built
  from. `putHumanMember` (`client/members.ts`) answers
  void: its two heads, the identity's and the PII's,
  have no holder — the members page re-reads after a
  save (`web-app/members/detail.ts:563`) — and the one
  head a write verb owes is a composite shape for this
  bullet to name. Oracle: every client read verb returns a
  message, an array of messages, or a value whose
  `message` members name every response it was built
  from
- Fewer body decodes, after the work-order-events spec,
  the last of item 1's. Head
  reads slowed eight of the nine list pages' readyMs
  (`4a540f3` → `9a8396a`, medians of 25,
  `measurements/history.jsonl`),
  workbox 122.7 → 142.0 and flows 46.0 → 56.4 the
  most. After the work-order-events spec three stay
  slower than that base (`4a540f3` → `851adad`): flows
  46.0 → 55.8, projects 57.5 → 62.5, records 50.6 →
  54.3; workbox reads 87.2, under its base. Three
  suspects, none measured: larger
  multipart list payloads, each part a whole stored
  response (about 300 header octets plus the full
  document); each part's split and framing; and
  repeated body decodes. `Body.toValue()` decodes
  afresh on every call (`shared/http-message/body.ts:96`),
  and `HttpMessage.body()` builds a new `Body` on every
  call (`shared/http-message/http-message.ts:105-109`),
  so a memo belongs on `HttpMessage` beside `#wire` and
  `#json` (`:85-99`), not on `Body`. A message is
  shared across holders — `flowSaves` sends one head to
  every subscriber (`client/flow-mutations.ts:598`,
  `:73`), a page holds messages in its state
  (`web-app/organization/index.ts:181`), and values keep
  theirs in `message` fields
  (`client/flow-queries.ts:26`,
  `client/work-orders-queries.ts:121`) — and no caller
  mutates a decoded value today, so a memo hands every
  holder one shared object: freeze it, or rule the memo
  out. The quick reductions come first, before any
  memo: decode once before sorting rather than inside
  the comparator (`client/admin.ts:46`,
  `client/members.ts:80-81`,
  `client/organizations.ts:22`, and
  `client/objectives.ts:52-55`, whose four callers are
  `client/objectives.ts:244`,
  `client/project-scoring.ts:206`,
  `web-app/dashboard/index.ts:50`, and
  `web-app/organization/index.ts:160`); `flowSaves`
  subscribers each decode a whole flow to read its `id`
  (`client/flow-mutations.ts:74`); the flows binding
  render decodes each record twice
  (`web-app/flows/detail.ts:1528-1530`, after
  `bindableRecords` at
  `web-app/app/presenters/flow-designer-view.ts:457`);
  presenters decode per render
  (`web-app/app/presenters/organization-objectives.ts:108`,
  `project-objectives.ts:102`,
  `dashboard-objective-aggregates.ts:86`,
  `idea-conversion.ts:105` and `:640`, and
  `web-app/ideas/convert.ts:244`); and the organization
  page decodes each objective again per pass
  (`web-app/organization/index.ts:162`, `:168`,
  `:187-188`, `:195-197`). Oracle: a profile of flows,
  projects, and records names
  the cost before any change, and each reduction lands
  with its readyMs before and after
- Comments name absent code. `appendMessagePairOnce`
  and `appendMessagePairAlways` left with the store's
  one statement, and the comments citing them stayed:
  five in `api/` (`api/api.ts:1245`,
  `api/derive-documents.ts:33`,
  `api/message-pair.ts:94`, `api/routes.ts:707`,
  `:2636`), two explaining stamp order by
  "appendMessagePairOnce's nowUtc()"; three in `tests/`
  (`tests/api-shadow-ledger-auth.test.ts:297`,
  `tests/derive-documents.test.ts:19`,
  `tests/document-family.test.ts:283`). TEST-PLAN V4
  no longer names `appendMessagePairOnce`. The state by
  PUT spec found more: `sendWriteResponse`
  (`tests/pair-write-coverage.test.ts:55`);
  `MEMBERS_WIRING` (`api/routes.ts:476`,
  `api/validators.ts:535-536`, `:841-842`,
  `:934-935`); and the replay fast path, which no
  longer exists — nothing at the gate reads a request
  to serve a stored response — yet is described at
  `client/flow-mutations.ts:559-560`, its "fast" and
  "path" a line apart, and in `tests/`
  at `tests/api-identity-document.test.ts:176`,
  `tests/api-member-documents.test.ts:403`,
  `tests/api-shadow-ledger-tokens.test.ts:286-288`, and
  `tests/drift-roster.test.ts:638`. The `/members/`
  parent now resolves from heads
  (`resolveViaMembershipPairPlane`,
  `api/derive-states.ts:211-234`; 6eee335c), yet two C4
  tombstone comments still narrate its retired
  document-trio history (`api/derive-states.ts:38-41`,
  `:504-505`). The packageable client left seven
  comments naming moved paths (`api/flow-graph-diff.ts:15`,
  `tests/presenter-project-detail-impact.test.ts:16`,
  `tests/presenter-identity-detail.test.ts:16`,
  `tests/presenter-project-patch.test.ts:10`,
  `tests/api-facade-write-preconditions.test.ts:26`,
  `web-app/app/flow-operations.ts:720`, `:875`); the
  store left `api/request-context.ts:42-45` keeping
  `requestAt` in a requests row,
  `api/postgres-client.ts:2-3` taking advisory locks
  inside `begin`, and ARCHITECTURE.md:230-235 calling
  reads an open write-gate transaction's; and 960f2ce8
  wrote one comment twice (`api/mock-data.ts:179-183`,
  `:190-194`). Reword each to the
  code that runs today, or delete it where the code now
  says it. Oracle:
  `git grep -nE 'appendMessagePair|sendWriteResponse'`
  and `git grep -nE 'MEMBERS_WIRING'` find nothing
  under `api/`, `client/`, `tests/`, or TEST-PLAN.md,
  and every fast-path hit there, read across line
  breaks, names code that runs, as
  `tests/backend-postgres.test.ts:12-13`'s driver
  Buffer path does
- DELETE cascade. No one policy says what a delete does
  to the documents that name the deleted one. Four
  references refuse the delete today (the last
  accepted admin membership, the record-type and
  attribute RESTRICTs, and the
  instance placement RESTRICT under a work-order
  binding), each checked in a read that closes before
  the write; no audit lists the rest. Consider one
  policy per reference, named in one place: RESTRICT
  (refuse while referenced), CASCADE (tombstone the
  dependents in the same statement as the parent), or
  ORPHAN (leave the reference, which then reads 410 or
  404). Oracle: a table of every cross-document
  reference with its policy; each CASCADE lands parent
  and dependents in one statement and a GET of each
  dependent reads it gone; each RESTRICT refuses a
  racing delete under one statement; no reference is
  unlisted.
- The four counting checks close before their
  statement: the last accepted admin
  (`refuseLastAdmin`, `api/invitations-domain.ts:335-355`),
  the record-type RESTRICT (`api/routes.ts:4610-4620`),
  the attribute RESTRICT (`api/routes.ts:977-990`, and
  again in `deleteRecordAttributeSafe` at `:4764-4768`),
  and the instance placement RESTRICT
  (`api/routes.ts:3198-3224`) each verify in a read
  transaction that closes before the write. The
  default-organization write reads an accepted
  membership (`membershipOf`,
  `api/organization-requests.ts:120-129`) and then
  writes. A grant reads the membership head
  (`postOrganizationInvitationGrant`,
  `api/invitations-domain.ts:588`) and then lands
  (`:607`). Two grants of one email name one
  document, `<organization-id>:<identity-id>`.
  Oracle: two writers race the last accepted admin,
  a record-type DELETE against an instance create, an
  attribute DELETE against a flow PUT, an instance
  DELETE against a binding, a default-organization
  PUT against that membership's removal, and two
  grants of one email; each race refuses one writer.
  The guard lives in the write's own statement: the
  ledger store took transactions and advisory locks
  out of the write path (4175b2d5), so the one write
  transaction and the organization's lock the state by
  PUT spec named are gone.
- An RFC 7009 revocation endpoint for OAuth clients.
  Revocation today is
  `identities/:id/tokens/:jti/revocation`: the identity
  names its own token by `jti`, revokes the whole chain,
  and an unknown jti answers 404, which reveals nothing
  the identity cannot already list. A third-party client
  holding only a token string has no standard way to
  revoke it. Add `POST authentication/revocation`
  (`application/x-www-form-urlencoded`: `token`, and the
  optional `token_type_hint`), which authenticates the
  client as `authentication/token` does, checks the token
  was issued to that client, and revokes through the same
  chain revocation. It answers 200 for a revoked or an
  unknown token (RFC 7009 §2.2), so a guessed string
  learns nothing; `unsupported_token_type` for a kind it
  does not revoke; and 503 with `Retry-After` while
  revocation is unavailable. Oracle: a client revokes its
  refresh token and every jti in that chain then reads
  revoked; an unknown or already-revoked token answers
  200 and stores nothing; a token issued to another
  client is refused; a real and a guessed token of the
  same length answer byte-identical responses.
- CRUD verbs out of names, comments, and test titles. This
  is an HTTP application on a SQL database: a state change
  is PUT, POST, PATCH, or DELETE at the HTTP layer and
  INSERT at the store, never "create", "update", "upsert",
  or "write" standing in for one of them. The case that
  surfaced it is `postRecordWriteOp` (`api/routes.ts:872`,
  the seed's record-type POST bundle) and its family:
  `RecordWriteBody`, `RecordWriteCreateBody`,
  `RecordWriteEditBody`, `RecordWriteMessagePairs`,
  `validateRecordWriteBody`,
  `validateRecordWriteAttribute`, and
  `tests/api-records-write.test.ts`. The former's names are
  ruled, one rename-only commit, the store's `'land'`
  outcome unchanged:
  `StateWrite` → `NextStates`,
  `FormedStateWrite` → `FormedStatement`,
  `WriteAnswer` → a name still to rule, since
  `StatementAnswer` already names the per-row answer it
  holds (`shared/ledger-statement.ts:45`;
  `api/message-pair.ts:705`),
  `formStateWrite` → `formedStatement`,
  `landStateWrite` → `landedStatement`,
  `runStateWrite` → `landedStates`,
  `runWrite` → `landedRows`,
  `runStatement` → `executeStatement`,
  `StatementRun` → `StatementExecution`,
  `runLedgerStatement` → `executeLedgerStatement`.
  Across `api/`, `client/`, `shared/`, `web-app/`, and
  `server/`, 52 distinct
  identifiers contain a capitalized Create, Update, or
  Upsert and 35 contain Write, comments and strings
  aside. Some stay: the DOM's `createElement` and
  constructors such as `createHttpFacade`. The audit rules
  on each of the rest, naming by the HTTP-verb convention
  (`getNoun`, `putNoun`, `deleteNoun`,
  `postNounOperation`) at the HTTP layer and INSERT at the
  store. Each rename is its own commit. Oracle: a test
  sweeps identifiers for the four verbs and fails on any
  that is not in its named-exception list.
- The ledger root's body is JSON. `/migrations/0000-root`
  (`api/ledger-root.ts:16-17`) is the one head whose
  response body is not a JSON object: 64 hex characters of
  the empty string's sha256, with no `content-type`, so it
  carries none of its path's ids. Every other document
  body carries its id. Form it as a JSON object with `id`
  `0000-root` and the digest under a named key, with
  `content-type: application/json` and the
  `content-length` that follows. Both backends read the
  root (`hasRoot`, `api/backend-memory.ts:255-259`,
  `api/backend-postgres.ts:117`); every deployment seeds
  fresh, so nothing stored migrates. Oracle: the root
  head's response parses as a JSON object whose `id` is
  `0000-root`, in both backends.
- Test ids are identifiers, post-ship. Every id a
  test stores or sends — an identity, an
  organization, a document, an etag — is a canonical
  identifier, the 22-character encoding of a UUID
  (`isIdentifier` and `identifierOfUuidText` in
  `shared/identifier.ts`). A short label is not one.
  Witness: `the token sub is the caller identity`
  (`tests/api-actor-from-token.test.ts`) seeded
  `alice`, and `membershipsOfIdentity` rejected the
  mirrored membership with "identity_id must be a
  22-character identifier". That test now encodes
  `6f0b9c1e-4a27-4d5b-8e31-7c9a2f10b6d4`. The suite
  still mints tokens for `anonymous`
  (`tests/adapters-authentication.test.ts`,
  `tests/adapters-identity-providers.test.ts`) and
  `agent-7`
  (`tests/api-authentication-token.test.ts`).
  Display names and search text stay words. It waited
  on membership and versions, which has landed. Oracle:
  one test
  walks the ids the suite stores and fails when
  `isIdentifier` rejects one, with named exceptions
  for display names and search text.
- The default-organization client still says the PUT
  must name a live seat
  (`client/identity-default-organization.ts:9`), and a
  test comment says the seat remains
  (`tests/api-identity-default-organization.test.ts:162-164`,
  beside the `seedSeat` fixture,
  `tests/root-admin-fixture.ts:110`), though 3636aa0f
  retired the seat documents. Say an accepted
  membership: a removed membership head is 400, and an
  accepted membership is 201
  (`api/organization-requests.ts:120-129`). Oracle:
  neither comment names a seat document.
- Immutable document types. A family declares itself
  immutable where it declares its conditional; every
  write is a genesis under the never-written latch, so a
  second write at a written name stores nothing (412 for
  a client's declaration, 409 for a handler's) and a
  retired name answers 410; DELETE answers 405; only
  erasure removes pairs (the physical-erasure bullet).
  Their consumers are the join documents:
  `postFlowWorkOrderDocumentOp` and
  `postFlowRecordDocumentOp` (`api/routes.ts`) land a PUT
  with no latch, so a second PUT at a join's name replaces
  what it joins. Oracle: a second PUT at a written join
  name stores nothing and answers 409 or 412.
- Test-only list oracles. `documentCollectionGetHandler` and
  `documentGetHandler` (`api/document-family.ts`) and the
  `GetHandler` type (`api/routes.ts`) serve no route; sixteen
  test files read families through them below the gate. Move
  those reads onto the live read path, each moved assertion
  at least as strong, then delete all three. Oracle: `git
  grep -nw` finds none of the three names under `api/` or
  `tests/`.
- The work-order gates check no node and no edge.
  `assertRequiredAttributesAtExit` (`api/routes.ts`) returns
  when the head's `state` names no node in its frozen
  `flow_graph`, so the required-at-exit check is skipped
  silently for that head. No gate would stop it:
  `validateWorkOrderCreateBody` checks `states` only as
  non-empty strings, never `states[2]` as `'claimed'`
  (`docs/superpowers/specs/`
  `2026-10-04-work-order-events-design.md:199-200`), and
  `validateWorkOrderInstanceTransitionBody`
  and `postWorkOrderTransitionOp` (`api/validators.ts`,
  `api/routes.ts`) check `targetState` only as non-empty, with
  no edge from the head's `state`, and `postWorkOrderDocumentOp`
  (`api/routes.ts`) lays a PUT's `flow_graph` over the head
  without checking that `state` still names a node. Nothing
  compares the browser-minted `transitionAt` with the head's
  `transition.at` either. The inbox's static degraded row for an unplaced head
  contains the gap; it does not close it. Plan gate validation
  (node, edge, and `transitionAt`; real graphs in fixtures) as
  its own spec; it decides whether a skewed `transitionAt` is
  refused or clamped. Oracle: a create or transition naming a
  node absent from the graph, a transition with no edge from
  the head's `state`, or a PUT whose `flow_graph` drops the
  head's `state`, is refused at the gate.

## Sequencing

- The examination report
  (`docs/superpowers/specs/2026-09-15-one-table-examined-report.md`)
  → 2, 6, 9, 11, 13 (its findings are their oracles).
- 2 → 5 (its link token is a secret at rest: item 2
  fences it); item 2 no longer orders
  item 6, since a backup carries the table whole
- The naming bullet (`fa_`) lands no later than the
  deploy of items 0–3, so operators rename once
- 4 → 6 → 13 (the health probe, then per process)
- 7 → 11, 12 (the designer roster and AI seats read the
  profile)
- 9 → 10 → 11 → 12 (the bell, then chats, then
  processes, then the worker)
- Items 6, 9, and 13, and the later-work XSS bullet,
  close KNOWN seams — the closer removes the
  ARCHITECTURE.md bullet and this file's line in one
  commit; item 2 rewords two and closes none
- Item 7 precedes routing the roster through the
  profile
- The claim-expiry event, succeeding
  `isClaimUnlapsedAt`'s request-stamp judgment, lands
  before any multi-process deployment
  — item 13's first commit, or item 12's if the worker
  is a second process

## Close protocol

The pin flips red → fix the test to the new truth (or
delete it if the old incomplete behavior is gone) →
remove the bullet here → remove the named comment at
its `file:line` → for a KNOWN seam, remove the
ARCHITECTURE.md bullet in the same commit → AUDIT.md's
`m` is the new seam count.

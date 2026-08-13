# Postgres Backend — Design

Date: 2026-08-12
Status: superseded 2026-08-13

Superseded by:
`docs/superpowers/specs/2026-08-13-postgres-backend-design.md`
Do not implement from this file.

Previous status: approved, amended per reviews 2026-08-12

## Context

The app today is a standalone browser product: `api/` runs in
the page, IndexedDB is the store, and `./build` emits a static
ZIP. The schema of record is the message plane — two tables
(`requests`, `responses`) holding stored HTTP message pairs,
from which all domain state derives on read.

This spec designs the Postgres backend and the server tier
around it: the schema and indexes, the storage backend, the
server runtime, the security fixes the docs tie to this split,
the dual-artifact build, testing, and rollout. It also resolves
every `.md`-documented deferred-work item into a named
disposition so nothing rides on memory.

A key inventory finding shaped the scope: of the deferred items
the docs gate on the server tier, most are documented as
landing WITH the tier, not after it. They are in scope here.

This spec is the authoritative reference for the Postgres
backend structure and the server tier. A lost external plan
once lived at
`~/.claude/plans/go-to-church-binary-stonebraker.md`; commit
`9412921b` removed the `API-TREE.md` cite before this spec
landed. The authority declaration stands on its own. Render-at-
write is the mechanism that leaves each GET's stored body
current.

## User decisions

1. **One comprehensive spec.** Schema/backend, server split,
   security fixes, and build tooling in one document. No data
   migration: Postgres starts empty and seeds via the existing
   bootstrap/mock-data pair formation, operator-invoked.
2. **Dual ZIPs until stable, then the yank.** `./build` emits
   a browser ZIP and a server ZIP until Postgres is proven;
   then the IndexedDB and localStorage backends, the browser
   ZIP, and the dev-tier postures are deleted. The browser ZIP
   keeps today's posture and features (IndexedDB, in-page
   `handleRequest`, demo auth). It does not keep pre-break
   stored bytes or `/history` paths — Phase A is a cross-tier
   covenant break (see Review amendments).
3. **postgres.js behind our own adapter.** No library
   vocabulary outside the adapter. Tagged-template
   parameterization only — placeholders and auto-prepared
   statements are structural; the adapter exports no path to
   `sql.unsafe()`. `sql.unsafe` may exist only INSIDE the
   adapter, and only for boot-time DDL assembled from
   compile-time constants (zero user input).
4. **Extended seam.** The equality-only `getWhere` seam gains
   composite, ordered-head, prefix-range, and body-containment
   reads. A verbatim port was rejected: it scales with the
   whole database; the extended seam scales with the slice.
5. **Message storage is the entire canonical wire message** —
   headers included — as BYTEA of the wire octets. JSONB
   storage rejected (byte-shifted read-backs, inert
   verbatim-number machinery, unverifiable hash preimage,
   tier fork, doctrine reversal). TEXT rejected: a Latin-1
   wire string in a UTF-8 TEXT column cannot round-trip
   non-ASCII bodies through `parseWire`. Body queryability
   comes from one GIN expression index, never from stored
   jsonb.
6. **Single GETs stream stored bytes.** Collection GET stays
   a JSON array of GET-shaped entities, id-lex ASC — today's
   contract. The original "escaped wire envelopes" collection
   shape is withdrawn (review amendment W3).
7. **Render-at-write** (named by this spec): every write, in
   its own transaction, stores exactly the response body
   today's GET derive would serve for each STREAM address it
   affects. Document PUTs are not free — the body written is
   not the GET row. All STREAM families convert in one wave
   behind parity pins. Instances are exempt (per-caller ACL
   projection).
8. **The work-order deep dive moves to a follow-on session.**
   This spec records the covenant and the follow-on's charter;
   the conversion wave completes only after that session
   supplies the work-order design.
9. **No-extraction principle.** The backend stores what its
   caller sends; Postgres never parses column values out of
   the message. The one sanctioned extraction is the GIN body
   expression index.
10. **`/history` → `/versions`, unified**, plus per-version
    fetch at `GET <family>/:id/versions/<etag>` on every
    PUTable family. The path token is the wire ETag (sha256
    of that response's stored octets with `ETag` and `Date`
    omitted), looked up inside that noun. `Response-ID`
    stays the locator (`responses.id`).
11. **Env names call the thing the thing:** `POSTGRES_URL`,
    `JWT_HMAC_SIGNING_KEY`, `HTTP_SERVER_PORT`.
12. **Password hashing upgrades to scrypt** at the server tier
    (Node platform primitive), with self-describing hash
    strings and upgrade-on-login.

### Review amendments (2026-08-12)

Author choices from the merged revision worklist. All other
approved decisions stay locked.

1. **W1 — stored representation is BYTEA.** The `message`
   column holds `serializeWire` octets. `message_hash` is
   SHA-256 of those octets. `message_body()` is
   `convert_from` of the body region, then `::jsonb`.
   `parseWire` stays Latin-1-length. See § B.
2. **W3 — collection elements stay entities.** Collection
   GET is `jsonb_agg(message_body(message) ORDER BY uri_id)`
   over a filtered head subquery. Revises decision 6 for
   collections only. See § G, § H.
3. **W4 — spent assertion-jti is a stored fact.** At grant
   success the app writes the assertion `jti` onto the stored
   grant response body and probes that. RFC 7523
   jti-uniqueness. See § K.4.
4. **W14 — content-hash ETag, noun-scoped versions.** Every
   PUTable-family GET and every collection GET emits `ETag`
   = sha256 of the response wire with `ETag` and `Date`
   omitted. `GET <family>/:id/versions/<etag>` looks up that
   hash inside the noun. `Response-ID` stays the locator.
   SHA-3 rejected (WebCrypto has none; house digest is
   sha256). See § I.
5. **W19 — `pg_notify` is in-transaction.** Emission moves
   into `backend-postgres.ts`; Postgres delivers on commit
   and swallows on rollback. See § F.
6. **W21 — `schema_marker` stamps in the import
   transaction.** Presence bit only; no `created_at`. See
   § C, § F.

## Deferred-work dispositions

The docs' deferred items, resolved. **Tier A = A1–A6**, the six
remaining seams in `ARCHITECTURE.md` § Server-tier deploy
blockers. A7–A12 are adjacent items, numbered for the yank
checklist — not remaining blockers. Canonical list:
`ARCHITECTURE.md` § Server-tier deploy blockers (four
documents link to it; the audit counts its KNOWN seams).

### Tier A (A1–A6 — remaining deploy blockers)

| Item | Disposition |
|---|---|
| A1 client-shipped HMAC key | IN: key → `JWT_HMAC_SIGNING_KEY` env; mint/verify server-side only. Server-ZIP client graph is a fetch facade with no import of `api/api.ts` or `access-token.ts`; session seed is a token-endpoint call; page-side mint deleted. Two esbuild entries; metafile test forbids `SIGNING_KEY_MATERIAL` and `backend-indexeddb` in the server-ZIP client bundle. Wire format, HS256, caller signatures unchanged |
| A2 in-band credential reveal | IN: deleted; operator boot-flag seeding prints credentials to the terminal, once, never HTTP |
| A3 plaintext credential ledger | RE-GATE chosen (docs allow re-gate and/or re-mask): snapshot surface admin-only; messages stay verbatim. NAMED RESIDUAL at full strength: the ledger stores live access/refresh tokens and `authorization` headers verbatim; database read access is session theft; A4 does not cover it. Token-at-rest hashing is named future work (residuals list) |
| A4 client_assertion jti replay | IN: at grant success the app writes the assertion `jti` as a JSON fact on the stored grant response body (no-extraction: decoded at pair formation) and probes that fact via GIN `@>`. RFC 7523 jti-uniqueness. Bounded by the assertion's `exp`. No new table |
| A5 auth-free BOOTSTRAP_ROUTES | IN: server tier removes the bearer exemption and adds admin ROUTE_POLICY entries; install runs below HTTP via operator flags; browser ZIP keeps its demo posture until the yank deletes the plane |
| A6 soft-optional PKCE | IN: server rejects public-client authorize without a code_challenge; client_assertion JWS clients exempt per OAuth 2.1 |

### Adjacent (A7–A12 — yank checklist, not blockers)

| Item | Disposition |
|---|---|
| A7 delegation ledger | Already mitigated: cross-party token exchange is 403 until a ledger exists (`ARCHITECTURE.md` § mitigated). Residual stays 403. Not a remaining blocker |
| A8 LISTEN/NOTIFY notifications | TARGET-STATE surface (`API-TREE.md`). Backend emits `pg_notify` inside the write transaction (W19); SSE `/notifications` stays future. UX residual: without a listener, cross-machine views stay stale until navigation (BroadcastChannel is same-browser only) |
| A9 RUM sink / Server-Timing | Not a deploy blocker. Cited: measurement design § F (`page-performance.ts` is the future RUM source; a sink adapter and Server-Timing come later) and that spec's Out of scope. Module boundary exists; nothing is built |
| A10 longitudinal measurement | IN AS OBLIGATION: `./measure --record` at pre-split baseline, server first-light, post-yank. Process item, not a deploy blocker |
| A11 DbAdapter migration seam | REALIZED: `backend-postgres.ts` is the fourth backend. Seam item, not a remaining blocker |
| A12 lost binary-stonebraker plan | RESOLVED: this spec is the authoritative reference. No `API-TREE.md` re-point (the cite is already gone; commit `9412921b`) |

### Tier B

| Item | Disposition |
|---|---|
| B1 no migration primitive | Idempotent boot DDL (`CREATE ... IF NOT EXISTS`; `CREATE OR REPLACE FUNCTION` — Postgres has no `IF NOT EXISTS` form for functions); no migration framework until a third schema change demands one; reset = drop + reseed |
| B2 IndexedDB orphan stores | Browser-tier residual; dies with the tier at the yank |
| B3 PII erasure residuals | Posture unchanged: hard delete ports as one Postgres tx, single-id-set rule intact; already-exported snapshot files stay a named residual; the export route becomes admin-gated |
| B4 /snapshots/export route | Stays future; admin-gated `GET /snapshots/schema` serves export |
| B5 /snapshots/pristine | Stays deferred; bootstrap covers the minimal seed |
| B6 single-user acceptances | TEST-PLAN.md gains a server-tier section (zero deploy-blocker coverage today — named deliverable); real multi-user concurrency is tested for the first time (§ Testing) |
| B7 versioned type snapshots | Domain feature, orthogonal; stays future |
| B8 W5 no work-order abandon | Domain gap; untouched |
| B9 API.md §5 chronology | Docs-only; stays deferred |

## Design

### A. Architecture

Two build outputs from one source tree.

- **Browser ZIP** — today's posture and features: composed
  pages, `api/` in the page, IndexedDB store, demo-tier auth.
  Not today's stored bytes or `/history` paths.
- **Server ZIP** — one Node process serves the composed static
  pages AND the API on one origin (no CORS surface). The same
  `api/` spine runs against Postgres via the fourth
  `StorageBackend`. The browser bundle inside this artifact
  speaks real `fetch` through a facade that does not import
  `api/api.ts` or `access-token.ts`.

The server does not get a new API layer: a thin `node:http`
adapter turns each incoming request into the same vessel
`handleRequest` consumes today. The two new load-bearing files
are both divorce points — `node:http` → vessel, and seam →
postgres.js.

Endgame (the yank): delete the IndexedDB and localStorage
backends, the in-page dispatch composition, the browser ZIP,
and `BOOTSTRAP_ROUTES`. This spec is already the authority;
there is no `API-TREE.md` re-point.

### B. Storage-format covenant

Cross-tier, prerequisite change; both tiers store the same
octets.

- The `message` column holds the ENTIRE canonical wire
  message (`serializeWire` output: start-line, sorted
  lower-cased fields, derived Content-Length framing, body)
  as BYTEA of those octets. The in-app wire form is a Latin-1
  binary string (one JS char per octet;
  `shared/http-message/wire-codec.ts:29-31`). Codec, both
  directions:
  - write: Latin-1 wire → one byte per `charCodeAt` → BYTEA.
  - read: BYTEA → Latin-1 string → `parseWire`.
  `parseWire` frames the body by JS string length as byte
  count (`wire-codec.ts:145-151`). Feeding it UTF-8 TEXT
  mis-frames on the first non-ASCII character; storing the
  Latin-1 string as TEXT double-encodes. BYTEA avoids both.
- `message_hash` is SHA-256 of the BYTEA octets. The JS hash
  at the storage boundary hashes the octet array, not
  `TextEncoder` of the Latin-1 string (that would
  UTF-8-encode bytes `0x80–0xFF`). Every hash value changes
  once; `canonicalJson` write-path call sites become
  `serializeWire`; `parseJson` derive call sites become
  `parseWire`; the mock-data pair count 1498 holds while all
  hash values re-baseline.
- Stored bodies are JSON-only via three code locks — not
  "the media registry is JSON-only" (it admits form and
  text: `media-registry.ts:59,77,111-117`):
  1. `JSON_MEDIA_TYPE` is the only type passed to `withBody`
     (`message-form.ts:17,53-55,82-84`).
  2. `putBody` overwrites content-type
     (`shared/http-message/modify.ts:115-122`).
  3. Request bodies are object-typed at the gate
     (`request-auth.ts:208-227`).
  Phase A tightens `WriteResponseSpec.successBody` from
  `unknown` to `Record<string, unknown>` (`routes.ts:3236-
  3241`). A string return today silently stores base64
  (`json-codec.ts:30-33`) and would die at the GIN.
- The stored wire is always Content-Length framed (chunked is
  parse-side only), so the body region is everything after
  the FIRST CRLFCRLF — a provably unique boundary (compact
  JSON bodies and header values cannot contain a raw CRLF).
- Chain provenance rename, riding the same break: the
  `Supersedes` concept is DELETED system-wide (field, wire
  header, and the per-simple-write `headPairIdAt` pre-tx
  read that fed it). Provenance-only — no derive walks it
  (`derive-documents.ts:146-149`); the column and header go
  away. The one surviving chain field (today's `follows`)
  renames to `Replaces-Response-ID` (wire header) /
  `replaces_response_id` (seam row key and column). The
  header field inside the stored wire message is the truth;
  the column is app-sent index machinery beside it.
- The requests seam row gains two app-sent fields, both
  known at pair formation: `route` (the gate's matched route
  pattern; synthesized, auth, and seed pairs name their
  shapes) and `method`. Validators, snapshot format, and the
  IndexedDB tier take the same shape — one covenant break,
  never a second.
- Phase A invalidates every pre-break IndexedDB origin and
  every previously exported snapshot (house precedent:
  SCHEMA.md timestamp-width pin — old snapshots fail import
  loudly; recovery is reseed). Import rejects them loudly.
  Boot detect: schema marker present and rows missing
  `route` → refuse and point at reseed / Settings wipe.

### C. Schema (DDL, final)

PostgreSQL 15+ (SQL-standard function bodies). All text columns
`COLLATE "C"`: byte order IS the codebase's orders (id-lex,
zulu-lexical `at`), and a C-collated btree serves `LIKE 'x%'`
as a range scan with no extra opclass. `at` stays TEXT. Digits
1–3 of the six-digit fraction are UTC clock milliseconds;
digits 4–6 are the same-ms sequence counter, busy-advance on
overflow (`api/types.ts:390-416`). Do not describe the whole
tail as a counter. `timestamptz` would renormalize `.000000`
tails and destroy the mint. Ids and timestamps are app-minted
(no sequences, no `now()`). Strict-monotonic `at` is
per-process state; § J names the single-process mint realm.

    CREATE TABLE IF NOT EXISTS requests (
        id text COLLATE "C" PRIMARY KEY
            CHECK (id ~ '^[0-9A-Za-z]{22}$'),
        uri_prefix text COLLATE "C" NOT NULL
            CHECK (left(uri_prefix, 1) = '/'
               AND right(uri_prefix, 1) = '/'),
        uri_id text COLLATE "C" NOT NULL,
        at text COLLATE "C" NOT NULL CHECK (at ~
            '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'),
        requester_identity_id text COLLATE "C" NOT NULL,
        message_hash text COLLATE "C" NOT NULL
            CHECK (message_hash ~ '^[0-9a-f]{64}$'),
        message bytea NOT NULL,
        route text COLLATE "C" NOT NULL
            CHECK (route ~ '^[a-z0-9:/-]+$'),
        method text COLLATE "C" NOT NULL
            CHECK (method ~ '^[A-Z]+$')
    );

    CREATE TABLE IF NOT EXISTS responses (
        id text COLLATE "C" PRIMARY KEY
            CHECK (id ~ '^[0-9A-Za-z]{22}$')
            REFERENCES requests (id)
            DEFERRABLE INITIALLY DEFERRED,
        uri_prefix text COLLATE "C" NOT NULL
            CHECK (left(uri_prefix, 1) = '/'
               AND right(uri_prefix, 1) = '/'),
        uri_id text COLLATE "C" NOT NULL,
        at text COLLATE "C" NOT NULL CHECK (at ~
            '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'),
        status integer NOT NULL
            CHECK (status BETWEEN 100 AND 599),
        etag text COLLATE "C" NOT NULL
            CHECK (etag ~ '^[0-9a-f]{64}$'),
        message_hash text COLLATE "C" NOT NULL
            CHECK (message_hash ~ '^[0-9a-f]{64}$'),
        message bytea NOT NULL,
        replaces_response_id text COLLATE "C" CHECK
            (replaces_response_id ~ '^[0-9A-Za-z]{22}$')
    );

    CREATE TABLE IF NOT EXISTS schema_marker (
        only boolean PRIMARY KEY CHECK (only)
    );

    CREATE OR REPLACE FUNCTION message_body(message bytea)
    RETURNS jsonb
    IMMUTABLE STRICT PARALLEL SAFE LANGUAGE sql
    RETURN CASE
        WHEN position(E'\r\n\r\n'::bytea IN message) = 0
            THEN NULL
        WHEN substring(message FROM
             position(E'\r\n\r\n'::bytea IN message) + 4)
             = ''::bytea
            THEN NULL
        ELSE convert_from(
             substring(message FROM
             position(E'\r\n\r\n'::bytea IN message) + 4),
             'UTF8')::jsonb
    END;

Column notes:

- Every column is app-sent; the only nullable column is
  `replaces_response_id`, whose absence IS genesis (the
  seam's one sanctioned optional; a NULL never escapes the
  backend — the row mapper emits key-absence).
- `etag` is the wire ETag: sha256 hex of the stored response
  BYTEA with the `ETag` and `Date` fields omitted (W14).
  App-computed at pair formation. Retires today's body-sha256
  meaning of this column (same covenant break as the hash
  re-baseline). Collection and live-instance ETags are
  read-time and do not use this column.
- The pair FK (`responses.id REFERENCES requests`) makes the
  response→request half of the 1:1 pair balance structural.
  An orphan request row remains representable; the reverse
  stays test-asserted. DEFERRABLE INITIALLY DEFERRED:
  checked at COMMIT, so the PII hard-delete loop's per-row
  delete order and snapshot import's bulk order stay free.
  Named tier divergence: a torn snapshot imports silently
  on IndexedDB and fails on Postgres — Postgres is right.
- CHECKs are new tightenings, not mirrors of the JS
  validators. `id ~ '^[0-9A-Za-z]{22}$'` is mint practice
  (`crypto-safe-base62.ts`); SCHEMA.md does not CHECK it.
  `uri_prefix` JS validators require only a trailing `/`;
  the DDL also requires a leading `/`. Both match actual
  stored values (`message-address.ts:33`). Route CHECK
  `^[a-z0-9:/-]+$` admits no underscore — say so, so the
  first `_` family does not die at INSERT. Hyphens pass.
  Not internal defense: the datastore is an edge.
- `schema_marker` is a presence bit (`only boolean PRIMARY
  KEY CHECK (only)`), matching the IndexedDB `__schema__`
  row `{ id: 'schema' }` (`backend-indexeddb.ts:511-513`).
  No `created_at`. `hasSchema()` = row exists. On Postgres
  the marker stamps INSIDE the import transaction (W21):
  failed import rolls it back; success is atomic. Table
  existence is NOT schema existence.
- `message_body()` is the ONE sanctioned extraction (§ E).
  It returns NULL for bodyless messages so the expression
  index never throws on 204s and bodyless tombstones
  (NULLs are simply not indexed). A non-empty body that
  fails `::jsonb` THROWS at INSERT via the expression
  index. The GIN indexes make "non-empty stored bodies
  parse as JSON" a hard append-time invariant; any future
  non-JSON media type revisits both indexes first.
- `CREATE OR REPLACE FUNCTION` — Postgres has no
  `CREATE FUNCTION IF NOT EXISTS`. Same signature keeps
  the function identity so dependent expression indexes
  survive a second boot (B1).
- No pgcrypto in core DDL. The hash-verify query
  (`digest(message, 'sha256')` vs `message_hash`) is
  documented ops tooling where pgcrypto is available,
  never a CHECK.

### D. Indexes

    CREATE INDEX IF NOT EXISTS requests_address
        ON requests (uri_prefix, uri_id, at, id);
    CREATE INDEX IF NOT EXISTS responses_address
        ON responses (uri_prefix, uri_id, at, id);
    CREATE INDEX IF NOT EXISTS requests_route
        ON requests (route, uri_prefix);
    CREATE INDEX IF NOT EXISTS requests_uri_id
        ON requests (uri_id);
    CREATE INDEX IF NOT EXISTS responses_uri_id
        ON responses (uri_id);
    CREATE INDEX IF NOT EXISTS requests_replay
        ON requests (message_hash);
    CREATE UNIQUE INDEX IF NOT EXISTS responses_replaces_key
        ON responses (replaces_response_id)
        WHERE replaces_response_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS responses_version_etag
        ON responses (uri_prefix, uri_id, etag);
    CREATE INDEX IF NOT EXISTS requests_body
        ON requests
        USING gin (message_body(message) jsonb_path_ops);
    CREATE INDEX IF NOT EXISTS responses_body
        ON responses
        USING gin (message_body(message) jsonb_path_ops);

Each index maps to catalogued reads:

- `*_address` — the ~130 family-slice reads (leading-column
  equality, call count not distinct readers); the six
  by-id-within-prefix sites as single probes; ordered head
  selection (`ORDER BY at DESC, id DESC LIMIT 1`) and
  collection heads (`DISTINCT ON (uri_id)`) come back
  index-ordered — the `(at, id)` reduction becomes the
  index's job.
- `requests_route` — the nine whole-plane discovery scans
  plus the two `deriveStateFieldValueReferrers` `getAll`s
  (`derive-state-field-values.ts:187-188`) become exact
  probes (`WHERE route = $1`), with per-org narrowing as a
  `uri_prefix` range inside the route.
- `*_uri_id` — seam fidelity for today's
  `getWhere('uri_id', ...)`; retired when the six by-id
  call sites ride composite reads.
- `requests_replay` — the replay fast-path and the in-tx
  dedup re-check, twice per write. Non-unique on purpose:
  auth grant pairs legitimately carry duplicate hashes.
- `responses_replaces_key` — the locked-write concurrency
  backstop. Partial uniqueness reproduces IndexedDB's
  skip-absent-key semantics: genesis rows coexist.
- `responses_version_etag` — noun-scoped
  `GET <family>/:id/versions/<etag>` lookup. Not unique:
  N matches serve latest `(at, id)`.
- `*_body` GINs — replace parse-and-filter scans, not
  equality `getWhere`s. Body-fact probes (`jti`, `code`,
  `chain_id`, `identity_id`, `organization_id`,
  `attribute_id`, graph node ids) via `@>` containment,
  which descends nested arrays. Authorize-response `code`
  is a real `@>` target
  (`decodedBodyOf(response.message).code`). `jsonb_path_ops`
  because every query is containment. Named cost: two GIN
  indexes update on every append.

### E. The no-extraction principle

The backend stores what its caller sends; Postgres never
parses column values out of the message. The app knows every
machinery value at pair formation and sends it explicitly.
Rationale: an extraction expression in DDL is a second wire
parser, in a second language, that must stay bit-compatible
with `shared/http-message` forever — a standing drift risk.

The ONE sanctioned extraction is the GIN body expression
index. `message_body()` encodes exactly one RFC-level framing
fact — the body starts after the first CRLFCRLF — plus
Postgres's own standard JSON parser. It never encodes library
serialization internals, and it stores nothing: stored bytes
and served bytes are always the app's own.

### F. The Postgres backend

`api/backend-postgres.ts` — the fourth `StorageBackend`, a
constructor preset over the same `BackedDbAdapter` as the
other three. Node-only. postgres.js lives entirely inside
this backend plus a thin client adapter (the divorce point);
no library vocabulary escapes. `sql.unsafe` may exist only
INSIDE the adapter, and only for boot DDL assembled from
compile-time constants. README's "zero runtime dependencies"
gains that named exception: postgres.js is bundled into
`server.mjs` and is never imported outside the adapter.

- **Transactions.** `transaction(tables, mode, fn)` maps to a
  real `BEGIN ... COMMIT`; the `Tx` ops run parameterized
  SQL; a thrown body rolls back (rollback is "never
  happened", matching the buffer-discard tiers). The
  IndexedDB auto-commit constraint does not exist here, but
  the pre-tx crypto discipline is RETAINED: one write-path
  shape across tiers, short transactions. Statement timeout
  30 s, mirroring `IDB_OP_TIMEOUT_MS`.
- **Typed-error mapping** keeps `handleRequest` tier-blind.
  Discriminate by constraint name; never switch on SQLSTATE
  alone:
  - 23505 on `responses_replaces_key` →
    `UniqueConstraintError` → 412.
  - 23505 on a PRIMARY KEY → new typed error, loud 500
    (mint bug; impossible via the app path).
  - 22P02 (bad `message` body at the GIN) → new typed
    error, loud 500 (covenant break / bad snapshot).
  - 42P01 → `MissingTableError` (→ recovery).
  - 23503 (torn pair at commit) → new typed error, loud
    500.
  - 23514 (CHECK) → new typed error, loud 500 (two gates
    disagreeing is a bug).
  - timeout / connection loss → typed timeout error,
    surfaced, resources released.
- **Concurrency.** Two advisory locks, both
  `pg_advisory_xact_lock` on an app-computed 52-bit key
  (first 13 hex digits of a sha256), never undocumented
  `hashtext`. Collisions only serialize unrelated work —
  do not claim uniqueness.
  1. Dedup lock (key from `message_hash`): first statement
     of a hash-deduped append. Same-hash appends serialize;
     the in-tx re-check sees the winner. Auth grants bypass
     and do not take it.
  2. Address lock (key from `uri_prefix || uri_id`): first
     statement of every gated write transaction; the gate
     is then re-read inside the lock. Gate class: genesis
     PUTs (instance create-only, document-trio first
     write), work-order claim, binding create-only PUT,
     invitation ops (accept also writes the membership
     row), any other read-check-write gate. Plain appends
     and auth grants skip it. The 412 CAS path is already
     closed by `responses_replaces_key`.
- **Notifications.** Seam relocation (W19):
  `backend-postgres.ts` emits
  `pg_notify('fusion_events', payload)` inside the write
  transaction. Postgres delivers on commit and swallows on
  rollback. The injected `DbLifecycle.postNotification`
  sink is not used on this backend; IndexedDB keeps the
  post-commit BroadcastChannel sink. Payload bound is
  ~8000 bytes. If the serialized `NotificationEvent`
  would exceed it, emit `{"kind":"full"}` instead of a
  scoped id list (cap, not chunking). A8's emit-only
  seam; no listener ships yet.
- **Snapshots.** `getSnapshot` reads both tables in one
  readonly tx, same JSON shape. `putSnapshot` validates,
  then one tx: delete-all + bulk insert both tables +
  stamp `schema_marker`. Genuinely atomic — closes the
  localStorage mid-write quota gap and the post-commit
  marker crash window.

### G. The extended seam

Two faces. `Tx` is the primitive (`getWhere` and the new SQL
shapes below). App code reads through
`EntityStore.getAllWhere` (`api/db.ts:94-97`) over
`Tx.getWhere` (`api/db.ts:146-150`) and the new
`EntityStore` methods over those primitives. Each new read
is named on `EntityStore`; `Tx` gains the matching SQL.
Implementers hit the split immediately.

Named additions only, each traced to catalogued call sites:

| New read | Face | SQL shape | Serves |
|---|---|---|---|
| `getAllAt(prefix, uriId)` | both | equality on both columns | the six fetch-then-filter sites |
| `getHeadAt(prefix, uriId)` | both | + `ORDER BY at DESC, id DESC LIMIT 1` | head selection |
| `getAllByRoute(route[, prefixRange])` | both | route probe + optional range | the nine discovery scans + two SFV `getAll`s |
| `getAllWhereBody(containment)` | both | `message_body(message) @> $1` | parse-and-filter body facts |
| `getCollectionBody(prefix, filters)` | `EntityStore` | see SQL below | STREAM collection GET |
| `existsAt(prefix[, uriId])` | both | `SELECT EXISTS` | presence probes |
| `getByEtag(prefix, uriId, etag)` | both | address + `etag` | noun-scoped version fetch |

`getCollectionBody` is valid SQL over a subquery — not
`string_agg(DISTINCT ON ...)`. Head predicate: latest 2xx
PUT/DELETE per `uri_id` by `(at, id)`; DELETE heads dropped
(`derive-documents.ts:97-114,156-166`). Order: `uri_id` lex
ASC (today: `byIdAscending`). Element: `message_body` of the
stored response — the GET-shaped entity, not a wire envelope.

    SELECT COALESCE(
        jsonb_agg(body ORDER BY uri_id),
        '[]'::jsonb)
    FROM (
        SELECT uri_id, body
        FROM (
            SELECT DISTINCT ON (uri_id)
                r.uri_id,
                q.method,
                message_body(r.message) AS body
            FROM responses r
            JOIN requests q ON q.id = r.id
            WHERE r.uri_prefix = $1
              AND q.method IN ('PUT', 'DELETE')
              AND r.status BETWEEN 200 AND 299
            ORDER BY r.uri_id, r.at DESC, r.id DESC
        ) heads
        WHERE method <> 'DELETE'
    ) live;

Filters stay a named argument (AND-ed into the inner
`WHERE`). Members roster, `identity-pii`, and
`GET /organizations` are assembled joins — out of this
function's scope (see § H catalog).

A one-pass SQL collection read is a per-statement consistent
snapshot. Today's adapter covenant warns that two awaited
reads on one ctx are not (`ARCHITECTURE.md` § Adapter
Conventions). The server tier upgrades that quietly.

During dual-tier these methods get IndexedDB implementations
(JS filtering inside the store — same semantics, not faster).
The seam stays one interface; derives stay the shared
implementation until § H's conversion retires them per family.

### H. Render-at-write

The name: the app renders the GET answer at write time. NOT a
Postgres materialized view — no view objects exist anywhere;
there is no second copy, no refresh; the stored response body
IS the only copy, written in the same transaction as the write
that changed the truth.

**Covenant.** The stored response body of a write is the
servable GET answer for its address. In the write's own
transaction the writer computes exactly what today's GET
derive would serve (including genesis-wins-under-skew and
`hasUndoHistory`); THAT is the stored response body.
Streaming a stored write body, or today's `successBody`,
is not today's GET — trio families would lose `state` /
`state_at` / `state_event_id` / `organization_id`, flows
would lose `hasUndoHistory`, work-orders would lose the
binding overlay. Parity pins that "fixed" the stream to
match a weaker body would be Test Weakening.

Single-resource GET streams the head body verbatim
(envelope re-spoken through `node:http` from columns,
fresh `Date`, `ETag` from the `etag` column). Collection
GET of a STREAM family is one SQL pass producing a JSON
array of those GET-shaped entities (`getCollectionBody`).
Adapter impact: collection adapters keep
`response.json() as T[]` — a fetch re-plumb, not a
wire-contract change. Named accepted costs: GIN write
amplification (two indexes per append); the collection
SQL is a join + subquery, not a scan of stored envelopes.

**Embed covenant.** A stored GET body embeds only facts
owned by its own address plus IMMUTABLE foreign ids —
never another address's mutable truth (a member's display
name), never a clock judgment. This is the decision rule
for follow-on charter item 4, and it keeps the write-side
obligation bounded to the op→parent class. Today's bodies
already comply (adapters join display names client-side
via `memberName`).

**Write-side obligation.** Every write that changes a
STREAM GET leaves that GET's stored body current, same
transaction. Document PUTs run the renderer — they are
not free. Operation writes must also append an updated
parent document pair. The appended parent pair is a
synthesized exchange (no wire event occurred). Precedent:
seed pairs; `postFlowUndoOp`'s document pair
(`routes.ts:1654-1671`). Its stored request names `route`
and `method` (now required columns). Undo-on-exhaustion
appends the op pair only (`routes.ts:1584-1671`).

The op→parent class, exact:

- `work-orders/:id/claim`, `/release`, `/transition`,
  `/binding` (routes.ts:5338/5348/5364/5385) — claim state,
  node placement, and binding embeds live only in op pairs
  today.
- `invitations/:id/acceptance`, `/decline`, `/revocation`
  (synthesized off the route table) — invitation state is
  op-pair presence today.
- Shipped precedent: `flows/:id/undo` ALREADY appends the op
  pair plus an updated `flows/:id` document pair in one tx
  (`postFlowUndoOp`, routes.ts:1654-1671). This spec
  generalizes that pattern.
- NOT in the class: identity-token rotation/revocation (each
  appends its own event document; chain state is
  auth-internal), auth grants (no parent), instance PATCH
  (exempt family). Create POSTs already append op + document
  pairs.

**GET catalog.** Every GET pattern is classified. The wave
is the catalog's STREAM rows — not "all streamable families"
with footnotes. Dashboard / workbox / flow-stats are not
API routes.

| Pattern | Class | Notes |
|---|---|---|
| ideas / projects / objectives / record-types / members / flows detail | STREAM | Trio families: renderer stamps trio + `organization_id`; flows add `hasUndoHistory` |
| ai-members / human-members / memberships detail | STREAM | Stateless families: stored GET body is the entity |
| those families' collections except members | STREAM | `getCollectionBody`; id-lex ASC entities |
| `GET <family>/:id/versions` index | STREAM | chain fetch; trio embedded |
| `GET <family>/:id/versions/<etag>` | STREAM | noun-scoped etag lookup; instances PROJECT after |
| flow collection | STREAM | per-row `hasUndoHistory` is in the stored body |
| members roster | ASSEMBLE | membership join (`routes.ts:4036-4051`); not a prefix slice |
| `GET /current-member` | ASSEMBLE | actor's member parent |
| `GET /identity-pii` | ASSEMBLE | PII rows fenced by memberships across orgs |
| `GET /organizations` | ASSEMBLE | live orgs ∩ token claims |
| invitation list | ASSEMBLE | documents + earliest-wins ops + name/email joins |
| instance detail | PROJECT | `projectReadableValues` after head probe |
| instance collection | PROJECT | same, per row; not `getCollectionBody` |
| instance `.../versions` and `.../versions/<etag>` | PROJECT | resolve stored revision, then project |
| `GET /snapshots/schema` | DUMP | whole-plane dump; admin-gated |
| work-order detail / collection / history | FOLLOW-ON | binding overlay; charter |

**The wave.** Every STREAM family converts at once, each
behind a parity pin: a test proving the write-side renderer
== the current derive over the same store (the derive is
the reference implementation, demoted to checker) before
that family's derive retires. Two carve-outs stay out of
the wave:

1. **Instances — PROJECT, permanently.** Per-attribute
   `read_roles` project each caller's view of `values`; one
   stored body cannot serve two differently-roled callers.
   Stored revision bodies stay full state. A response-shape
   fact; authorization itself is untouched everywhere.
2. **Work-orders — FOLLOW-ON.** Design deferred to the
   follow-on session (§ Follow-on charter). The wave
   executes only after that session supplies the work-order
   design.

**Re-verb mandate** (decided here; executed by the follow-on):

- `claim` + `release` collapse into ONE document sub-resource
  `work-orders/:id/claim`: PUT = claim, DELETE = early
  release (tombstone), GET = the claim facts, 404 when
  unclaimed — the absence of the row IS the absence of the
  claim.
- **Claims expire.** The first DOMAIN time-lapsing state in
  the system (authorization-code TTL already compares stored
  `at` to the clock). Stored bodies carry FACTS ONLY —
  holder and expiry — never judgments: a stored
  `claimed: true` would rot when the clock crosses expiry
  with no write to refresh it.
  "Claimed now" is a read-time comparison of a stored
  timestamp against the clock (house precedent: the
  authorization-code TTL derives from the stored pair's
  `at`; the revocation gate compares seconds at evaluation
  time). The PUT contention gate 409s only against a live
  UNEXPIRED head; an expired head is claimable as if
  released.
- `binding` re-verbs to a create-only PUT document
  `{instance_id, record_type_id}` — rebind 409 IS the
  spent-address rule; no DELETE (no-unbind posture).
- `transition` STAYS POST: a genuine process (graph gates,
  If-Match coupling, set/clear effects), not a fact.
- Invitations STAY POST event ops: presence-is-state with
  EARLIEST-wins semantics (a first acceptance beats later
  ops), unlike the document family's latest-wins; the
  synthesis machinery is untouched.

**Keyed-read principle.** No family scan may serve a
single-document answer. Surviving read-side derives take
exactly three keyed shapes:

- HEAD PROBE — `(uri_prefix, uri_id)`,
  `ORDER BY at DESC, id DESC LIMIT 1`: most current wins.
- CHAIN FETCH — same filter, the document's full history,
  DESC.
- BODY PROBE — GIN `@>` containment on a body fact.

Family-shaped fetches remain only where the answer is
family-shaped: STREAM collection GET (one-pass SQL) and
bulk history (route-column probes). This kills the named
pathologies: single-entity GETs paying full-family scans,
history routes fetching the family then filtering to one
id, flow undo fetching the whole flows family, and the
organization-enumeration walks
(`deriveMembershipsForIdentity` at mint;
`resolveFlowGraphOwner` over every org's `/flows/` prefix,
`derive-states.ts:167-196`). Those become GIN probes.
`fenceRequest` does not enumerate organizations
(`request-auth.ts:109-145`). Instances are exempt from
streaming only, NOT from keyed reads: head probe →
ACL-project → serve.

**Keyed-read miss posture.** Happy path: head probe only.
Miss path: retain `missedReadError` (foreign 403 / absent
404 via `resolveGlobalOwner`). The `uri_id` index keeps
earning its keep until the six by-id sites move. Head-
probe-else-404 is an existence oracle and is forbidden.

**Where reduction lives now.** On the Postgres read path the
JS reductions dissolve into machinery: the head probe's
`ORDER BY ... LIMIT 1` and the collection's `DISTINCT ON` do
what `latestByKey` did; the lifecycle walk IS the `/versions`
chain fetch. JS reduction remains only on the IndexedDB tier
during dual-ZIP, inside write-time rendering (the writer
computes embedded state), and in the auth-plane security
reducers (fail-closed custom comparators). After the yank,
`latestByKey` on the read path is dead code.

### I. Versions unification

`/history` renames to `/versions` across the nine lifecycle
routes and the instance value-history. The version index
subsumes state history: each version row embeds its lifecycle
trio; instance versions carry `{etag, at, values}` after
projection.

**Wire ETag (W14).** Every PUTable-family GET and every
collection GET emits `ETag`. Value = sha256 hex of the
complete HTTP response wire with the `ETag` and `Date`
fields omitted (Date is re-spoken fresh on every serve; a
Date in the preimage would churn the tag). Algorithm is
sha256 — the house digest (`shared/digest.ts`). SHA-3 is
rejected: WebCrypto has none; the browser ZIP cannot
compute it without a new primitive.

`Response-ID` stays the locator: it is `responses.id`, the
id that keys both rows of one stored exchange. It does not
verify the message. Integrity of stored octets is
`message_hash`. The `etag` column holds the wire ETag for
that stored response (app-sent).

Live instance GET hashes the PROJECTED wire (per caller,
read-time). The stored `etag` column hashes the FULL-STATE
stored wire. Those values differ. Collection ETags hash
the assembled collection response at read time and are
not a versions address.

**Per-version fetch.**
`GET <family>/:id/versions/<etag>` on every PUTable
family — a suffix on that noun, never a global lookup.
Authorization is the standard fence on the noun. Lookup:
among responses at this `uri_prefix` + `uri_id`, the row
whose `etag` column matches. 0 matches → miss table.
1 match → serve. N matches → latest `(at, id)` (the index
is not unique; `Response-ID` in the preimage makes N a
cryptographic curiosity).

Miss table, written once:

- address match + etag hit → serve
- row exists at this etag but foreign org → 403
- no row / wrong noun → 404 (via `missedReadError` when
  the noun is org-nested and the id is known elsewhere)

Instances are carved out of verbatim streaming: the fetch
resolves the stored revision, then projects via
`projectReadableValues` — identical to today's
value-history route (`routes.ts:5738-5740`). A
read-restricted caller fetching a historical etag receives
projected values. A client cannot take a live instance
`ETag` and fetch `.../versions/<that>` — named, not a bug.

**`flows/:id/versions` succession.** The address is
retired (no route; comments at `routes.ts:5147-5150,
3303-3304`). There is no test today that
`GET /flows/:id/versions` is 404. Phase A lands that 404
pin BEFORE the rename, then flips it in the same commit
that registers the pair-chain route, succession named at
the pin site (old = a stored version-row table; new = the
pair chain itself).

Work-order and invitation EVENT histories (op folds) keep
their own shapes; the work-order one belongs to the
follow-on session.

### J. Server runtime

One Node process, one origin, `node:http` (platform
primitive). The `node:http` adapter feeds the same
`handleRequest` vessel the browser tier uses — no second API
layer. Strict-monotonic `at` minting is module-level
per-process state (`api/types.ts:387-416`, "within a
realm"). This shape is a covenant: horizontal scale-out is
a future decision, not an accident.

Boot, fail-fast: validate env → connect pool (fail loud) →
idempotent DDL → listen.

| Env | Meaning |
|---|---|
| `POSTGRES_URL` | connection string; required |
| `JWT_HMAC_SIGNING_KEY` | JWT HMAC material; required (A1) |
| `HTTP_SERVER_PORT` | listener port; required |

Secrets enter through the vessel at initialization, immutable
for the process life, never logged, never defaulted. TLS is
the deployment front door's job; the process speaks HTTP on
its port.

- **Operator seeding:** `--seed-bootstrap` /
  `--seed-mock-data` boot flags seed an empty database and
  print credentials to the operator terminal, once (A2).
  They refuse loudly when rows exist — no silent wipe path
  below HTTP. No HTTP seeding path exists on this tier.
- **Every I/O bounded:** statement timeout 30 s, request
  header/body timeouts, a per-request deadline. Pool
  constants: `POOL_MAX = 10`,
  `POOL_ACQUIRE_TIMEOUT_MS = 5000`.
- **Structured logs:** one line per request — RFC-3339 zulu
  `at`, standard level, request id, method, path, status,
  latency ms. Query strings are stripped from the logged
  path (authorization-code redirect may carry `?code=`).
  Fault detail to logs; the wire keeps the fixed opaque
  500 body. No secret, credential, or PII value is ever
  logged. Do not copy `access-token.ts:91`'s stale
  "localStorage" sentence into new prose.
- **Static serving:** the composed pages and bundles, correct
  content-types, `Cache-Control` on hashed assets — the HTTP
  cache header is the one cache this design ships.
- **Failure posture:** impossible states crash loud; the
  supervisor restarts. SIGTERM → stop accepting, drain
  in-flight within a bounded window, close the pool, exit 0.

### K. Security fixes (seven)

Tier posture is COMPOSITION, not conditionals: each artifact's
init passes its auth configuration into the spine; no
`if (isServer)` in gate code. The browser ZIP knowingly keeps
its documented dev-tier posture until the yank.

1. **A1 — signing key leaves the client.**
   `SIGNING_KEY_MATERIAL` is replaced by
   `JWT_HMAC_SIGNING_KEY` from env, injected at init. Mint
   and verify run only server-side. Wire format, HS256, and
   caller signatures unchanged. Tree-shaking is not a
   mechanism: the page today mints its own session
   (`adapters/init.ts:62-75`) and imports the gate through
   `adapters/shared.ts`. Server-ZIP client graph:
   - new `adapters/http-facade.ts` — `fetch` + Bearer, same
     `ClientFacadeAdapter` shape, no import of `api/api.ts`
     or `access-token.ts`.
   - session seed becomes `POST /authentication/token` (or
     a dedicated boot grant). `mintAccessToken` is deleted
     from the page.
   - two esbuild entries (§ L). The server-ZIP client
     entry's metafile is a test: `SIGNING_KEY_MATERIAL` and
     `backend-indexeddb` must be absent.
   Browser ZIP keeps today's graph until the yank.
2. **A2 — in-band credential reveal deleted.** Seeding is
   operator flags; plaintext prints to the terminal once and
   never rides HTTP.
3. **A3 — credential ledger re-gated.** Stored messages stay
   byte-verbatim; the exposure closes via A5's gate. Named
   residual at full strength: hoisted headers store
   `authorization` verbatim (`message-pair.ts:419-423`);
   token-grant bodies store live `access_token` and
   `refresh_token` (`authentication.ts:262-267`). Database
   read access is session theft. A4 does not cover it.
   Shielded by the admin gate and Postgres access control.
   Token-at-rest hashing is named future work.
4. **A4 — jti replay closed.** At grant success the app
   writes the assertion `jti` as a JSON fact on the stored
   grant response body (still no-extraction: the app decoded
   the assertion at pair formation). The spent check is
   `message_body(message) @> {"jti":"<assertion-jti>"}`
   over stored grant pairs. A replayed assertion `jti` →
   401. Bounded by the assertion's `exp`. This is RFC 7523
   jti-uniqueness, not exact-JWS containment. The `jti`
   values minted onto access/refresh tokens
   (`authentication.ts:301-303`) are a different
   identifier and are not this probe.
5. **A5 — BOOTSTRAP_ROUTES re-gated.** The bearer exemption
   for `snapshots/*` is removed on the server tier;
   `ROUTE_POLICY` gains admin-only entries. The
   no-identity-exists install problem is solved below HTTP by
   the operator flags. Wipe and import become admin actions.
6. **A6 — hard PKCE.** Authorize rejects a public client
   without a `code_challenge`; confidential clients
   authenticating via `client_assertion` JWS are exempt per
   OAuth 2.1.
7. **Password hashing** (user-added). Server tier hashes with
   scrypt via `node:crypto` — memory-hard, platform
   primitive (Argon2id rejected: npm native dependency
   against platform doctrine). Hash strings are ALREADY PHC
   self-describing (`$pbkdf2-sha256$i=<n>$<salt>$<digest>`,
   `shared/password-hash.ts:107-109`) with a fail-closed
   `VERIFIERS` registry. The K.7 delta is: add the scrypt
   verifier entry, flip `CURRENT_PASSWORD_HASH`, add
   upgrade-on-login. A successful PBKDF2 verify appends a
   rehashed scrypt credential document pair — convergence
   at the one moment plaintext is legitimately held.
   Parameters are named constants, OWASP-aligned:
   N=2^17, r=8, p=1, `maxmem` = 160 MiB. N=2^17, r=8
   needs 128·N·r = 128 MiB; Node's `crypto.scrypt` default
   `maxmem` is 32 MiB and THROWS without the raise. The
   browser ZIP stays PBKDF2 (WebCrypto has no scrypt)
   until the yank. Hashers are injected at init per tier;
   `shared/password-hash.ts` stays the divorce point.

### L. Build tooling — the dual ZIP

Bare `./build` emits two artifacts (clean tree required, as
today):

- `fusion-ai-browser.zip` — today's posture and features
  (not pre-break stored bytes or `/history` paths).
- `fusion-ai-server.zip` — composed pages + a browser
  bundle whose adapters speak `fetch` via
  `adapters/http-facade.ts` + `server.mjs` (the Node
  bundle: http adapter, Postgres backend, shared `api/`
  spine) — self-contained.

Two esbuild entries, one codebase. The server-ZIP client
entry does not import `api/api.ts`, `access-token.ts`, or
`backend-indexeddb`. A1 is enforced by a metafile test
(`SIGNING_KEY_MATERIAL` and `backend-indexeddb` absent
from that bundle), not by trust in tree-shaking. The
browser-ZIP entry keeps today's graph until the yank.

postgres.js enters `devDependencies` (joining esbuild and
typescript) and is bundled INTO `server.mjs` at build time.
The shipped artifact resolves zero packages: deploy = unzip,
set three env vars, `node server.mjs`. README names the
exception to "zero runtime dependencies": postgres.js is
bundled into `server.mjs` and is never imported outside
the adapter.

`./serve [port]` stays the browser tier. Running the server
locally IS the deploy path; the Postgres test suite boots it
programmatically the same way.

The `generate-schema-svg --check` gate keeps working: the
schema of record stays `api/db.ts` + `api/types.ts`, which
gain the new fields as part of the covenant break.

### M. Testing

The governing split: `./validate` stays fast and
dependency-free — it never requires Postgres. A new
`./test-postgres` runner owns everything needing a live
database (boots the server programmatically against
`POSTGRES_URL`, operator-supplied). Isolation: a fresh
schema per run (`CREATE SCHEMA` + `search_path`) so the
suite is not flaky by construction if two runs overlap. It
is a deliberate invocation, never a silently-skipped test
inside `./validate`.

In `./validate` (no Postgres):

- The existing suite, re-baselined once for the wire-format
  break (pair count 1498 absolute holds).
- Storage-codec pin: a body containing `é` store/read/hash
  round-trips on the memory backend (octets in, Latin-1
  `parseWire` out, `message_hash` equals SHA-256 of those
  octets).
- Parity pins: per STREAM family, write-side renderer ==
  the reference derive over the same store (memory
  backend).
- Versions surface logic: index shape (DESC, trio
  embedded), `GET <family>/:id/versions/<etag>` hit,
  wrong-noun 404, foreign-org 403, instance historical
  etag projected for a read-restricted caller, and the
  `flows/:id/versions` 404 pin landed then flipped in the
  registering commit with the succession named.
- Hasher self-description logic: PHC parse/dispatch,
  PBKDF2 verify path, scrypt path with `maxmem` (Node
  crypto is available to the runner).
- Server-ZIP client metafile: `SIGNING_KEY_MATERIAL` and
  `backend-indexeddb` absent.

In `./test-postgres` (live database):

- Seam conformance: the pinned acceptance suite (read
  isolation, transaction view, entity validation, snapshot
  round-trip, message-pair semantics) parameterized by
  backend factory, run against real Postgres. Postgres
  becomes the best-tested backend — IndexedDB never had
  Node-side automated coverage. The `é` codec vector runs
  here too.
- Typed-error mapping against real SQLSTATEs, including
  23505-on-PK → 500, 23505-on-`responses_replaces_key` →
  412, and 22P02 → typed 500.
- Real concurrency: racing identical appends → the dedup
  lock yields one stored pair, both callers get the stored
  response; two locked writes citing one
  `replaces_response_id` → exactly one 412; racing
  same-address geneses → exactly one 200 and one 409;
  racing claims on an expired head → one winner; racing
  invitation accepts → one membership row; cross-org
  writers stay isolated under concurrency.
- Security compositions: anon → `/snapshots/*` 401, member
  403, admin 200; public-client authorize without
  challenge rejected; assertion-jti replay → 401 (the
  probe is the stored grant-response `jti` fact, not a
  token `jti` and not a `jti` key that never exists);
  boot fails loud without `JWT_HMAC_SIGNING_KEY`; PBKDF2
  credential verifies AND the upgrade-on-login pair lands
  scrypt-self-described.
- Runtime behavior: fail-fast boot, second boot converges
  (`CREATE OR REPLACE FUNCTION`), structured log line
  shape (no query string), fixed 500 body, SIGTERM drain
  completes then exit 0, seed flags refuse on a non-empty
  database.

TEST-PLAN.md gains a server-tier section — the named
deliverable closing the manual plan's zero deploy-blocker
coverage: browser app against the real server, auth flows
end-to-end, snapshot gating, and the first genuine multi-user
regression (two browsers, two identities, one database).

### N. Measurement, rollout, and the yank

**Measurement (A10).** `./measure --record` at three named
milestones: pre-split baseline, server first-light (all pages
via `node server.mjs` against Postgres), post-yank. The
fetch/render phase split is the migration signal; the harness
gains a base-URL mode to measure a running server origin.
Budgets recalibrate after cutover — the network is in the
path, and the per-machine-class gate must say so.

**Rollout — capability milestones** (the implementation plan
turns these into tasks):

| Phase | Lands | Gate |
|---|---|---|
| A | The covenant break: BYTEA wire storage, hash re-baseline, supersedes deletion, `replaces_response_id` rename, `route` + `method` fields, `/versions` unification + noun-scoped `/versions/<etag>`, `successBody` tightened, pre-break stores invalidated, `flows/:id/versions` 404 pin landed | `./validate` green |
| B | Render-at-write machinery + keyed reads + converted families behind parity pins | pins green; wave completion blocked on the follow-on |
| C | The Postgres backend + `./test-postgres` | seam conformance green on live PG |
| D | Server runtime + the seven fixes + dual-ZIP build | security tests green; first-light `--record` |
| E | Work-order follow-on integrated (re-verb + WO render-at-write) | wave complete; WO parity pins green |
| F | Stability window → the yank | post-yank `--record` |

**The yank checklist:**

- Delete: the IndexedDB and localStorage STORAGE BACKENDS and
  factories, the in-page `api/` dispatch composition, the
  demo signing constant, `BOOTSTRAP_ROUTES` and its
  exemption, browser-tier PBKDF2 HASHING (verify survives
  for self-described stragglers), the browser ZIP.
- Keep, deliberately: the memory backend (test tier),
  localStorage THEME/SIDEBAR persistence (UI state was never
  the data tier), scrypt + self-description, parity pins
  still earning retirement.
- Retire when earned: the seam-fidelity `uri_id` indexes,
  once the six by-id call sites ride composite reads.
- Docs: closed seams move KNOWN → CLOSED in ARCHITECTURE.md
  § Server-tier deploy blockers (the audit's KNOWN count
  changes with it); SCHEMA.md gains the DDL; CLAUDE.md and
  README follow (README names the postgres.js exception).
  No `API-TREE.md` re-point.

**Residuals that survive, named:** A3's gated verbatim
credentials (live access/refresh tokens and
`authorization` headers; token-at-rest hashing is future
work); A7 delegation 403; A8 SSE surface (and the
cross-machine staleness until navigation); A9 RUM stays
future per the measurement design § F; B3's
already-exported snapshot files; B7 versioned type
snapshots; B8/W5 no-abandon. B2's orphan stores die with
the browser tier. Content-hash ETag via SHA-3 is rejected
and not residual.

## Follow-on session charter

A separate session, after this spec lands, owns the
work-order surface:

1. Deep-dive the surface (ten read shapes, two whole-plane
   scans, the collection GET's per-row binding N+1, the
   claim machine, workbox consumption — which fields
   consumers actually need).
2. Execute the re-verb mandate: claim(+release) as the
   PUT/DELETE/GET claim document with expiry-aware
   contention; binding as a create-only PUT document;
   transition stays POST.
3. Settle expiry mechanics: stored `expires_at` per claim vs
   expiry derived from the claim pair's `at` plus a named
   TTL; holder-only transition/release rules.
4. Settle the parent-embed question under the § H embed
   covenant: a stored GET body may embed facts owned by its
   own address plus IMMUTABLE foreign ids (`instance_id`,
   `record_type_id`) — never another address's mutable
   truth, never a clock judgment. Whether work-order rows
   embed claim/binding FACTS (holder, expiry, those ids)
   for list streaming, or the sub-resources are fetched
   separately, is decided by workbox consumer analysis
   inside that rule.
5. Design work-order render-at-write + its event-history
   shape; the conversion wave completes behind its parity
   pins.

## Out of scope

- Data migration of any kind — Postgres starts empty.
- The SSE `/notifications` surface (A8 emits only).
- RUM / Server-Timing (A9).
- Cross-party delegation (A7 stays 403).
- `/snapshots/export` and `/snapshots/pristine` routes
  (B4/B5).
- Versioned record-type snapshots (B7); work-order abandon
  (B8/W5).
- Doc edits outside this file — the implementation plan's
  work, not this spec's diff. There is no `API-TREE.md`
  re-point.

## Cross-references

- `ARCHITECTURE.md` § Server-tier deploy blockers — the
  canonical KNOWN-seam list this spec closes or re-gates.
- `docs/superpowers/specs/2026-07-12-page-performance-`
  `measurement-design.md` — the fetch/render migration
  signal and the RUM seam.
- `docs/superpowers/specs/2026-07-11-clients-table-`
  `elimination-design.md` — the identity/registration model
  the auth fixes build on.
- `SCHEMA.md` — the message-plane row shapes and orders this
  schema ports; gains the DDL at implementation.
- `TEST-PLAN.md` § Protocol — the manual tier gaining the
  server section.

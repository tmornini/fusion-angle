# Postgres Backend — Review Synthesis + Amendments — Design

Date: 2026-08-13
Status: approved amendments awaiting merge into the parent —
this document does not modify the parent.

Parent: `2026-08-12-postgres-backend-design.md` at commit
`c6576739` — MD5 `72304efda14016ff6eced9dbb638aa3a`,
58,438 bytes. Quotes and section letters anchor to that
revision; re-verify against this fingerprint if the parent
moves before the merge.

Sources, combined and superseded by this document:

- `2026-08-13-postgres-backend-review-raccoon.md` — the
  critique known as "raccoon" (strongest on concurrency
  mechanics: the jti race, lock ordering, snapshot
  isolation, `uri_id` retirement).
- `2026-08-13-postgres-backend-review-grok.md` — the
  critique known as "grok" (strongest on cross-spec
  contradiction, GET-catalog completeness, client graph,
  A4 shape, render-at-write-as-cache).

Both are retained verbatim beside this file as review
records. Where they conflict, this document adjudicates
with code evidence; do not implement from either source
alone — implement from this one.

Spec-only. No implementation in this document.

## Context and method

The parent resolved the 2026-08-12 review cycle (W1–W21)
and was then reviewed twice more, independently. The two
critiques overlap on some findings, conflict on others,
and propose different dispositions for the same defects.

This synthesis was built from first-hand reads of the
parent, `2026-08-05-optimistic-locking-if-match-
unification-design.md` (with its merged 2026-08-07
amendments), and `2026-08-05-work-order-instance-sot-
coupling-design.md`, plus three read-only verification
agents over every contested code claim. Citations prefer
symbols; line numbers are supplementary and were read at
write time (the amendments doctrine: lines drift).

Four decisions below were gated by the owner on
2026-08-13: the destination of this document, W22, W23,
and W24. All other dispositions follow from evidence.

## Verdict

The parent's foundations hold: BYTEA of `serializeWire`
octets, the no-extraction principle, keyed reads, the
A1–A6 mapping (exact 1:1 with `ARCHITECTURE.md` § Server-
tier deploy blockers), W19/W21, the phase order, and the
dual-ZIP-then-yank shape are all real and verified. The
counts check (131 family-slice reads, 9 + 2 scans, pair
count 1498).

Three blocker-class defects survived the 2026-08-12
cycle. Each now carries an owner-gated disposition —
W22, W23, W24 below — plus nine majors and a minors
batch, all resolved in this document.

One structural fact neither critique stated outright
decides how the blockers resolve: **the If-Match
unification spec (D1–D12) is entirely unimplemented.**
`IF_RESPONSE_ID_HEADER` is the live locked dialect
(`api/api.ts` — the locked arm at `:727,847,857`),
`GETWithResponseId` still ships
(`web-app/app/adapters/shared.ts`), UNIQUE `follows` is
live (`api/db.ts` `TABLE_INDEXES`, `:330-338`), and
`assertHeadMatchesIfMatch` does not exist. Every
contradiction between the parent and the unification
spec is therefore a collision of two PENDING covenants,
not a code migration: it is resolved here by explicit
supersession, implemented once, never churned.

## Source adjudication

Who was right, claim by claim, where the sources
conflicted or where only one looked.

- **Live instance ETag — grok right, raccoon FALSE.**
  Instance GET advertises `ETag: "<head pair id>"`
  (`api/api.ts:1000-1021`, via `attachEtag` /
  `strongEtagOf`); it is not a hash and does not vary
  per caller. Raccoon's "per-caller PROJECTED hash" is
  the parent's FUTURE W14 posture (§ I), not today's
  code. The kernel raccoon garbled is real, though: the
  projected BODY varies per caller while the validator
  does not (see the Vary finding below).
- **Neither source:** no DOCUMENT_CLASS GET emits any
  `ETag` header today. `attachEtag` is called only on
  `INSTANCE_DETAIL_PATTERN` paths; the locked flow GET
  emits a bare `Response-ID` header
  (`api/api.ts:970-998`). Arguments about "the document
  GET ETag" were arguments about a header that route
  never sets.
- **Neither source:** one strong instance ETag is served
  over per-role-differing projected bodies
  (`projectReadableValues`, `api/routes.ts:5782-5785`)
  with no `Vary` anywhere in `api/`. Correct for
  If-Match, wrong for HTTP revalidation. Resolved by
  W22 (per-caller instance validators) + the W33
  Cache-Control posture.
- **Grok B1/B2 cross-spec contradictions — confirmed**
  verbatim against the unification spec's text: D4 locks
  the validator to the pair response id ("never
  `responses.etag` body-hash"); D5's Not-accepted list
  rejects "Renaming UNIQUE follows under a new column
  name"; D6 drops both chain columns. The parent's W14
  and `replaces_response_id` do exactly what those
  decisions forbid, without citing them.
- **Raccoon B2 (jti replay race) — confirmed.** jti is
  never checked, never returned, never required
  (`api/client-assertion.ts:7-9,19-21`; `claimsFault`
  reads iss/sub/aud/exp/nbf only, `:89-116`). Grants are
  replay-fast-path exempt (`REPLAY_EXEMPT_ROUTE_
  PATTERNS`, `api/message-pair.ts:729-734`) and auth
  pairs are keyed by id, not hash — nothing serializes
  two concurrent replays.
- **Raccoon B3 (`uri_id` retirement unearnable) —
  confirmed.** The two permanent prefix-agnostic readers
  are `computeOwningOrganization`
  (`api/derive-states.ts:284`; memo wrapper
  `resolveOwningOrganization` at `:338`) and
  `resolveGlobalOwner` (`:391`). The other five
  `getAllWhere('uri_id')` sites (`headPairIdAt`,
  `authorizationCodeSpent`, `workOrderClaimSourcesFor`,
  `derive-states.ts:1759`,
  `invitationLifecycleStatesFor`) all narrow to one
  prefix afterward and can ride composite reads. The
  owner resolvers cannot — resolving the owner without
  knowing the prefix is their whole job.
- **Grok B3 (GET catalog incomplete) — confirmed and
  sharpened.** 62 live GET surfaces exist: 58 in
  `api/routes.ts` (52 literal `route()` registrations
  with a `get:` key, 5 factory-emitted with no pattern
  string, 1 bare object literal), plus 4 pre-dispatch
  intercepts that never enter the route table
  (`organizations`, `invitations`, `invitations/sent`,
  `identities/:id/default-org` — `api/api.ts:301-324`
  and `api/invitations-domain.ts:139-151`). The
  parent's § H catalog omits the entire identity spine
  (13 patterns), `organizations/:id`, all 8 join
  collections, `flows/:id/tags/:name`, the attributes
  collection/detail, and 7 of 10 live history routes.
  There is no `route('GET ...')` string in the codebase
  — registration is verb-keyed — so any catalog built by
  pattern grep silently drops ten surfaces. The full
  ground-truth catalog is the appendix below.
- **Grok's classification claims — two corrected.** The
  flow GET row DOES stamp `organization_id`
  (`flowEntityOf`, `api/derive-flows.ts:100`); only the
  lifecycle trio is absent. And the invitation
  "earliest-wins derive" story is wrong in all three
  documents (parent included): mutual exclusivity of the
  three terminal ops is enforced by the WRITE GATE
  refusing a second terminal op
  (`currentInvitationState`,
  `api/invitations-domain.ts:107-116` — latest-wins over
  a set the gate keeps at ≤ 1); the collection derive is
  last-match-wins scan order
  (`api/derive-invitations.ts:66-78`), and kind priority
  (acceptance > decline > revocation) exists only in the
  entity-scoped `invitationOpStateFor` (`:99-108`). All
  three read rules coincide BECAUSE the gate keeps the
  set exclusive. The parent catalog's "earliest-wins
  ops" phrase names a mechanism no code site implements.
  Grok's members-row claim is TRUE (trio stamped, no
  `organization_id` — global plane,
  `api/derive-members.ts:67-79`).
- **Grok M1 (client graph) — confirmed, larger.**
  `ClientFacadeAdapter` is
  `GuardedDbAdapter & LatencySimulation`
  (`api/api.ts:1418-1419`) — a database-adapter shape a
  fetch facade cannot implement. Twelve page-graph files
  import `api/api.ts` (adapters init/shared/index/
  invitations/flow-mutations/identities/authentication,
  `organization/index.ts`, `members/detail.ts`,
  `workbox/detail.ts`, `sidebar-member.ts`,
  `flow-operations.ts`), and `channels.ts` +
  `credential-resolution.ts` reach `access-token.ts`
  directly. The page mints a real HMAC session token at
  boot (`adapters/init.ts:62-96`).
- **Raccoon M4 (acceptance suite aspirational) —
  confirmed, worse.** Exactly two backend-tier UNIT
  suites parameterize over factories
  (`tests/backend-read-isolation.test.ts`,
  `tests/backend-getwhere-parity.test.ts`; memory +
  localStorage; IndexedDB never looped). No ACCEPTANCE
  suite is backend-parameterized at all —
  `tests/mock-seed.ts` hardcodes `memoryDbAdapter()`.
- **Line-drift corrections** (substance intact, cites
  fixed): the framing check lives in `frameBody`, not
  `parseWire` (`shared/http-message/wire-codec.ts:
  145-150`); the per-char Latin-1 loops live in
  `shared/http-message/octets.ts:24-30,58-64`, not the
  codec; `seedHumanCredentials` fans out over its
  `recipients` argument (`api/mock-data.ts:201-217`) —
  "every human" is true for one of its two callers;
  `responses.etag` today hashes the body's BASE64 TEXT
  and hashes `''` when the body is absent
  (`bodyEtagOf`, `api/message-form.ts:101-108`) —
  SCHEMA.md's "sha256 of body bytes (or empty)" is wrong
  twice, and dies with the break anyway.

Adjacent findings surfaced by this review, claimed by
neither source:

1. **Authorization-code redemption shares the jti race
   shape.** `authorizationCodeSpent`
   (`api/authentication.ts:1001-1005`) probes committed
   rows; nothing serializes two concurrent redemptions
   of one code. W24's lock-before-probe rule is applied
   to it as well.
2. **`shared/digest.ts` has no bytes-in entry and a
   misleading name.** `sha256Bytes(text: string)` is
   bytes-OUT, string-IN; `TextEncoder` would silently
   re-encode any `Uint8Array` forced through a string.
   § B's hash-of-octets needs a true bytes-in entry
   (minors batch).
3. **`Octets.fromLatin1` masks instead of throwing.**
   `charCodeAt(i) & 0xff` silently truncates a
   non-Latin-1 code unit — a validate-at-the-gate gap
   guarded today only by the é codec pin (minors batch).

## What holds — do not reopen

Verified sound by both reviews and this synthesis;
stable:

- BYTEA of `serializeWire` octets; JSONB and TEXT
  rejections (the framing evidence at `frameBody` is
  exactly why).
- No data migration; Postgres starts empty.
- Dual ZIP then the yank; phase order A→F.
- Keyed-read shapes (HEAD PROBE / CHAIN FETCH / BODY
  PROBE) and the pathologies they kill.
- Instance PROJECT carve-out (per-attribute read ACL).
- `sql.unsafe` only for compile-time boot DDL inside the
  adapter.
- Env names; scrypt as the server hasher with PHC
  self-description and upgrade-on-login; maxmem math.
- Deleting `Supersedes` system-wide (nothing walks it;
  `derive-documents.ts` currency never did).
- Fail-fast boot; opaque 500; structured logs with query
  strings stripped.
- W19 (`pg_notify` in-transaction) and W21
  (`schema_marker` inside the import tx) — both close
  real windows the IndexedDB tier has.
- A1–A6 = exact 1:1 with the canonical blocker list;
  A7–A12 correctly non-blockers.
- Pair count 1498 holds across the hash re-baseline (the
  pin is row count, not hash identity).

## Resolved blockers (owner-gated 2026-08-13)

### W22 — content-hash wire validator (completes W14)

**Supersedes** If-Match unification D4 (validator byte
source), the validator-value half of D1, and D8's
"pair id = wire ETag" table row; also the WO-SoT spec's
pair-id ETag pins ("ETag = head document-pair response
id — never `responses.etag`"). The 409/412/428/400
taxonomy, genesis rules, hard cut, replay-first, hoist
covenants, and client re-quote discipline of those specs
all stand — only the VALIDATOR BYTES change.

Grounds: (1) the live ETag becomes the `/versions/`
address — the content-addressing property W14 exists
for; (2) per-caller instance validators repair the
one-validator-over-projected-bodies defect this review
surfaced; (3) content validators are RFC-9110-pure and
open the future 304 path. Adjudicated by the owner
2026-08-13 with both options on the table.

The dialect:

- Every PUTable-family GET emits `ETag` = sha256 hex of
  that head's stored response wire with the `ETag` and
  `Date` fields omitted — the `etag` column, app-computed
  at pair formation. Locked flow GET emits the same
  (replacing today's bare `Response-ID` advertisement);
  `Response-ID` on write responses stays pair identity,
  never the concurrency dialect.
- Write success and replay responses attach the ETag of
  the stored response they serve (the new head's, or the
  original's on replay).
- Collection GET emits a read-time hash of the assembled
  response. It is a cache validator only — collections
  are not PUTable and the value is not a versions
  address.
- Live instance GET emits the per-caller PROJECTED-wire
  hash (parent § I). The stored `etag` column for
  instances remains the FULL-STATE hash and never gates
  instance writes; `.../versions/<etag>` stays
  full-state addressed. Live instance ETag ≠ versions
  token: named, not a bug.

The gate — the mechanics the parent never specified, and
the trap inside them:

- `If-Match` carries the content hash (quoted 64-hex;
  `parseIfMatch` mechanics unchanged; malformed → 400).
- **Documents:** pre-tx, resolve the hash noun-scoped via
  `responses_version_etag` (`uri_prefix`, `uri_id`,
  `etag`): zero rows → 412 (stale or unknown validator);
  N rows → latest `(at, id)`. Compare the resolved row
  id to the live head's pair id — mismatch → 412. In-tx,
  `assertHeadMatchesIfMatch(view, { uriPrefix, uriId,
  expectedPairId: resolvedPairId })` — ROW OPS ONLY.
- **Instances:** pre-tx, derive the head, project its
  values for THIS caller, hash the projected wire, and
  compare to the If-Match value — mismatch → 412. In-tx,
  assert the live head's pair id still equals the pre-tx
  head's pair id.
- **The trap:** hashing is async crypto. The IndexedDB
  auto-commit constraint (and the parent's own retained
  pre-tx crypto discipline) forbids awaiting it inside a
  transaction. So the WIRE dialect is content hashes
  while the INTERNAL in-tx anchor stays a pre-tx-resolved
  PAIR ID — exactly the wire-vs-internal split the
  unification spec already draws ("Server-internal head
  lookups stay on bare pair id. Only the HTTP dialect
  quotes the validator."). An implementation that
  recomputes hashes inside the tx is wrong on both
  tiers.
- The hoisted If-Match request field now stores the
  content hash — still the replay identity and (post-W23)
  the only predecessor provenance. Rare provenance
  resolution is the same noun-scoped etag lookup.
- R8 ETag recovery (byte-identical instance PATCH resend
  returns the ORIGINAL revision's ETag): replay serves
  the stored response; the attach recomputes the
  projected hash of that revision for the calling
  principal. No column read, no `follows` read.

Named semantics change: a content validator matches
REPRESENTATION, not history position. After an A→B→A
revert, a caller holding the first A's ETag passes
If-Match — RFC-9110-correct, and the lost-update premise
("current content is what I saw") genuinely holds.
D4's pair-id dialect had history-position semantics; W22
trades them for content addressing, deliberately.

SCHEMA.md's name-the-collision pins (wire ETag ≠
`responses.etag`) die with this: for documents the wire
ETag now IS the `etag` column. The instance full-state
vs projected distinction replaces them.

Sequencing: the unification cut has not shipped, so it
is implemented WITH content-hash bytes from the start,
inside Phase A. Pair-id wire ETags are never shipped and
then flipped. The unification spec gains a one-line
supersession pointer AT MERGE TIME.

### W23 — adopt D5/D6: no chain columns

The parent restores, against the unification spec's
explicit Not-accepted list, the UNIQUE-follows rename
(`replaces_response_id`, partial unique index,
23505 → 412). That restoration is WITHDRAWN; D5/D6 are
adopted as approved.

- § C DDL: the `replaces_response_id` column and the
  `responses_replaces_key` index are deleted. Every
  `responses` column is now NOT NULL — the Articles'
  every-attribute-NOT-NULL, made literal; the "seam's
  one sanctioned optional" note dies with the column.
- § B's chain-rename paragraph is rewritten: BOTH chain
  columns die (`supersedes` deleted, `follows` dropped —
  not renamed); there is no `Replaces-Response-ID` wire
  header. Predecessor provenance is the hoisted If-Match
  inside the stored request message (under W22, a
  content hash — resolvable noun-scoped when needed).
  `headPairIdAt` dies with `Supersedes` as the parent
  already says.
- **The engineering fact that makes the lock mandatory:**
  the unification amendments proved the in-tx assert
  serializable only on IndexedDB, whose overlapping
  readwrite transactions serialize. Postgres under READ
  COMMITTED does NOT serialize overlapping same-address
  writers — two racing claimants can both re-read head H
  in their own transactions and both append. Therefore
  § F's address-lock gate class EXTENDS to every
  predecessor-claiming write: locked flow PUT, instance
  PATCH, and the WO transition's If-Match-coupled write,
  alongside the existing genesis/claim/binding/
  invitation gates. Lock, then re-assert, then append.
  One mechanism on both tiers (IndexedDB gets the same
  assert; its serialization is the platform's).
- § F typed-error table: the 23505-on-
  `responses_replaces_key` → 412 row is deleted. 23505
  remains PK-only → loud 500 (mint bug). 412 comes from
  the assert throw, mapped in the gate with house-voice
  If-Match text.
- The unification amendments' A1 (R8 recovery moves to
  the message plane) and A2 (genesis claim boundary
  stays LWW, unreachable for client-minted fresh ids)
  ride along unchanged.

### W24 — spent-jti pair family (supersedes W4)

W4 wrote the assertion jti onto the stored OAuth token
response body and probed it by GIN containment. Two
defects, one from each source, kill that shape: grants
take neither advisory lock, so two concurrent replays
both probe committed rows, both miss, both mint
(raccoon); and stored ≡ served under render-at-write, so
the jti fact either pollutes the client-visible RFC 6749
token response or forks stored from served (grok).
Superseded:

- New INTERNAL pair family:
  `authentication/assertion-jtis/:jti` — create-only
  PUT, stored body `{ exp }` (the assertion's exp, for
  observability; the probe is presence-only). No wire
  route is registered — the address exists only on the
  message plane; external callers 404. Precedent: flow
  tags (a document family that never had a table), seed
  pairs and `postFlowUndoOp`'s synthesized pairs (the
  stored request names `route` and `method`).
- Grant flow, assertion-bearing: verify assertion → take
  the § F ADDRESS LOCK keyed on the assertion-jtis
  address → head probe (row live → 401, OAuth-shaped
  error body, detail to logs) → mint → append the grant
  pair AND the spent-jti pair in the grant's own
  transaction. The create-only spent-address gate is the
  race backstop — the same machinery as instance
  genesis; no third advisory lock, no GIN probe, and
  nothing written onto `TokenResponse`.
- Spent never revives, even past `exp` — stronger than
  RFC 7523 requires, uniform with the platform's
  spent-address doctrine (an expired assertion is
  already rejected at verify for `exp` regardless).
- `claimsFault` gains `jti` as a REQUIRED claim for
  client_assertion verification, and
  `verifyClientAssertion` returns it — without this,
  omitting jti evades any replay ledger and RFC 7523
  uniqueness stays optional in practice. Named as
  stricter than the RFC's MAY, deliberately.
- § D's catalogued GIN probe list drops its `jti` entry.
- **Same rule for authorization codes** (adjacent
  finding): code redemption takes the address lock keyed
  on the code's spent-event address before
  `authorizationCodeSpent` probes and the token events
  append — the probe-committed-rows race is identical.

## Resolved majors

- **`uri_id` indexes are permanent (raccoon B3).** § D's
  retirement condition and § N's "retire when earned"
  line are struck. The indexes' named permanent readers
  are the write-authorizer / miss-path owner resolvers
  (`computeOwningOrganization`, `resolveGlobalOwner`),
  which are prefix-agnostic by design and which § H
  itself retains for `missedReadError`. The six
  narrowing by-id sites still convert to composite
  reads; the indexes stay for the two that cannot.
- **`getSnapshot` isolation (raccoon M2).** One readonly
  transaction under postgres.js defaults is READ
  COMMITTED — per-statement snapshots — so a pair
  committed between the two table reads yields a torn
  export that then FAILS the deferred-FK re-import.
  `getSnapshot` runs `REPEATABLE READ READ ONLY`: one
  snapshot for both reads. `putSnapshot` takes
  `ACCESS EXCLUSIVE` on both tables inside its
  transaction — imports are admin-rare, and this closes
  the interleaved-append torn import the same way.
- **Advisory-lock order pinned (raccoon M3).** A gated
  hash-deduped write takes both locks; two writers
  taking them in opposite orders deadlock. Global order:
  DEDUP LOCK, then ADDRESS LOCK, for every writer that
  takes both. 40P01 joins the typed-error table as a
  typed loud 500 — impossible once the order holds, so
  seeing it is a bug.
- **Head predicate spelled once (raccoon M5).** § H's
  HEAD PROBE and § I's CHAIN FETCH name only address +
  `ORDER BY` — but a head is the latest **2xx PUT or
  DELETE** row, via the requests join for method, with
  DELETE heads dropped for liveness — exactly
  `documentPairsAt` (`api/derive-documents.ts:97-130`)
  and § G's collection SQL. Spelled once, referenced
  from all three shapes; otherwise a 4xx or op row
  serves as head.
- **Request-vs-response body flip named (grok M4
  precision).** Today's derive reads REQUEST bodies
  (`documentPairsAt` line 120,
  `requestBodyOf(request.message)`); post-conversion the
  STREAM SQL reads RESPONSE `message_body`. Intended —
  the response body IS the rendered GET shape — but an
  implementer porting `deriveDocumentsAt` into SQL will
  reach for the wrong column. § G gains the warning.
- **GET catalog rebuilt (grok B3).** The appendix below
  replaces § H's table: every one of the 62 live
  surfaces classified, live vs future marked, the
  registration mechanics (factories, the bare literal,
  the four pre-dispatch intercepts, the org-prefixed
  facade multiplier) named so the next cataloguer cannot
  silently drop ten surfaces. Corrected rows: flows
  stamp `organization_id` but not the trio; members
  stamp the trio but no `organization_id`; invitations'
  exclusivity is a write-gate covenant, not an
  earliest-wins reduction.
- **Invitations leave the op→parent class (grok M4).**
  There is no per-id invitation GET — only the two
  ASSEMBLE lists (`invitations`, `invitations/sent`).
  A synthesized parent document pair per invitation op
  would be a stored body no GET ever streams: a derived
  second copy beside the op ledger, kept current by
  discipline alone — precisely the derive-from-the-
  ledger violation. Both lists stay ASSEMBLE; the
  op→parent class shrinks to the work-order ops plus the
  shipped `postFlowUndoOp` precedent. The class itself
  is named an invalidation DISCIPLINE with a
  completeness covenant: every op route that changes a
  STREAM family's GET answer appears in the table, and
  each op family carries a parity pin.
- **`hasUndoHistory` is stamped EXACT at write time.**
  The write-side renderer holds the flow's chain in its
  own transaction; freezing the documented approximation
  (`api/types.ts:1127-1135` — false positive after
  undo-to-genesis) into the ledger would store a known
  lie. The browser-tier derive keeps its approximation
  until the yank (its cheapness is the point there); the
  parity pin supplies the true pair count and names the
  undo-to-genesis case as the one divergence.
- **Shape evolution named (raccoon M1).** Stored heads
  serve the shape they were rendered with; a GET-shape
  change leaves old heads serving old shapes and
  collections mixing shapes in one array. Posture now:
  pre-customer, a shape change is a reseed (Phase A
  precedent — loud invalidation, wipe and reseed). A
  re-render primitive (walk heads, re-render bodies,
  same transaction rules) is NAMED FUTURE WORK for the
  day customers exist; it is not designed here.
- **Client graph rewritten (grok M1).** The A1/K.1
  bullet "same `ClientFacadeAdapter` shape" is
  impossible — that type is
  `GuardedDbAdapter & LatencySimulation`, a database
  shape with `transaction()` and store getters; fetch
  cannot implement it without exposing the store over
  HTTP. The real seam is the RequestContext VERB FACADE
  in `adapters/shared.ts` (`GET` / `PUT` / `POST` /
  `PATCH` / `DELETE` / `GETWithEtag`): the server-ZIP
  client re-backs those verbs with `fetch` + Bearer
  against the one origin. Ripple, named: twelve
  page-graph files import `api/api.ts` today and
  `channels.ts` + `credential-resolution.ts` reach
  `access-token.ts` directly — decode-only token
  helpers (claims parse, no verify: the page holds no
  key) move to `shared/`; the session seed becomes a
  token-endpoint call and `mintAccessToken` leaves the
  page; anonymous boot is a named decision (a public
  boot grant, or `sessionIsAuthenticated` learns
  "no token"); org exchange, refresh, and
  `session-credentials` storage ride the facade. The
  esbuild metafile test (`SIGNING_KEY_MATERIAL` and
  `backend-indexeddb` absent) remains the enforcement.
- **Origin dispatch rule written (grok M2).** One
  origin, one rule: a GET whose path names a static
  asset (the composed pages and bundles — in practice,
  paths with file extensions, plus `/` serving the
  landing page) is served by the static tier with
  correct content types and long-lived `Cache-Control`
  on hashed asset names; EVERYTHING else — including
  unknown paths — enters `handleRequest`, preserving
  the 401-before-404 covenant (the static tier must
  never become a route-topology oracle). API responses
  ship `Cache-Control: no-store` this cut; a
  conditional-GET 304 path is named future work. With
  no-store plus W22's per-caller instance validators,
  the Vary defect closes.
- **Security residuals completed (grok M6).**
  - A3's residual list is aligned with
    `ARCHITECTURE.md:382-386`: the verbatim ledger holds
    every login's PASSWORD and USERNAME, every
    AUTHORIZATION CODE, every `client_assertion` JWS,
    and every `authorization` header — not only
    access/refresh tokens. The password-loop authorize
    request body stores the password. K.3 and § N's
    residual list say so with that completeness.
  - A6 gains its CLIENT half: the production web login
    sends no `code_challenge` today
    (`adapters/authentication.ts:31-56` — soft PKCE is
    the shipped product path, not a test leftover). The
    server-side reject of challenge-less public-client
    authorize would break the product's own login unless
    the page adopts S256 PKCE in the same phase — named
    as Phase D scope. "Public client" is a BEHAVIORAL
    rule (no client_assertion on the flow), not a
    registration bit — `ClientRegistrationEntity` has no
    public/confidential field; none is added.
  - A5 wording aligned with the code: `ROUTE_POLICY` is
    already admin-realm at `/` and snapshots are absent
    from `MEMBER_VERBS`; deny-by-default already covers
    the plane. The work is REMOVING the exemption —
    which today skips authentication AND authorization
    (`api/api.ts:381-384` wraps `authorizeRequest`) and
    exposes both the anonymous dump (GET) and the
    anonymous wipe (DELETE) — plus below-HTTP operator
    seeding. Optional explicit snapshot entries are
    clarity, not the gate.
  - 401 posture: client-assertion failures currently
    return `invalid client_assertion: <reason>` —
    expiry, unknown kid, and signature failures are
    distinguishable to an unauthenticated caller. Server
    tier returns RFC 6749 error codes with a coarse
    `error_description`; fine detail moves to logs.
  - The ≤ 15-minute revocation lag (claim-snapshot
    covenant) is restated in the honesty note: a
    multi-user server with verbatim credentials in
    BYTEA, no SSE, and TTL-bounded revocation is a
    demo-posture server until the named residuals land.
- **Work-order follow-on charter enriched (grok M5).**
  The charter gains the consumption facts already in
  evidence: workbox consumes the `instance_id` /
  `record_type_id` binding overlay plus inbox fields
  from `flowGraph`; the collection GET's binding join is
  a SERIAL per-row await (`api/routes.ts:5214-5229` —
  its own comment names the measure gate); two
  whole-plane WO scans (`deriveWorkOrderLifecycle`,
  `deriveWorkOrderHistories`) plus the definitional
  third (`deriveStateFieldValueReferrers`,
  `derive-state-field-values.ts:186-189`). That third
  carries a CONSTRAINT the § D conversion must honor:
  its indexed-alternative was considered and REJECTED
  because dropping deleted work orders' transitions
  breaks the RESTRICT count — the `requests_route`
  probe is safe (route rows survive document deletion)
  and the follow-on says so where an implementer will
  look.

## Minors batch

Each line: defect → disposition.

- `requests_body` GIN has no catalogued reader (every
  named probe is response-side; W24 removed the jti
  probe) → DROPPED until a reader is catalogued
  (unmeasured index paid on every append). The
  append-time JSON-validity invariant it enforced moves
  to a named CHECK evaluating `message_body(message)`;
  `responses_body` stays, with its reader list updated.
- `getCollectionBody` evaluates `message_body` per
  version row inside `DISTINCT ON` (planner-dependent)
  → restructure heads-first: inner subquery selects head
  ids only; the outer join extracts `message_body` for
  the N head rows.
- "PostgreSQL 15+ (SQL-standard function bodies)" — that
  feature is PG14 → floor corrected to 14+, or a real
  15+ reason named; the parenthetical as written is
  false.
- Boot asserts `server_encoding = 'UTF8'`
  (`convert_from(..., 'UTF8')` converts INTO the
  database encoding; a non-UTF8 database breaks bodies)
  and § C notes `message_body`'s IMMUTABLE declaration
  is sound only under that assert.
- `shared/digest.ts` gains a true bytes-in entry (e.g.
  `sha256HexOfBytes(bytes: Uint8Array)`) for § B's
  hash-of-octets; the `sha256Bytes` name (string-in,
  bytes-out) is noted as the Uniformity hazard it is.
- § F's "auth grants bypass" prose names the actual
  mechanism: `REPLAY_EXEMPT_ROUTE_PATTERNS` (token,
  authorize, AND `identity-tokens/:jti/rotation`) gates
  the replay FAST-PATH; auth pairs are keyed by id, not
  hash, so storage dedup is moot there — two distinct
  facts the parent's phrase collapses.
- Route-CHECK prose re-aimed: the live pattern universe
  is kebab-case, zero digits and zero underscores; the
  real near-miss is snake_case FAMILY vocabulary
  (`record_instances`) leaking into the column, and the
  note says so instead of gesturing at digits.
- A8 prose fixed: an SSE `/notifications` endpoint is
  NET-NEW future work (API-TREE pins addresses +
  LISTEN/NOTIFY only), not a "documented residual"; the
  cross-machine staleness UX residual stands.
- Wire-codec note: `frameBody`'s UTF-16-length framing
  is the load-bearing reason for BYTEA; `octets.ts`
  per-char loops (`toLatin1` / `fromLatin1` / base64)
  get a named future optimization
  (`TextDecoder('latin1')` et al.) gated on measurement
  once the wire is the hot path; `fromLatin1`'s
  `& 0xff` mask is named (silent truncation, guarded
  today only by the é pin — the pin is load-bearing).
- Parent Context §'s dangling sentence ("Render-at-write
  is the mechanism...") — amendment artifact; integrated
  into decision 7's paragraph at merge.
- SCHEMA.md's `etag` row is wrong today (input is the
  body's BASE64 TEXT; absent body hashes `''`) — noted;
  the row dies with the W22 break either way.
- Mint-realm ops covenant made a deployment constraint,
  not a footnote: ONE process, ONE replica
  (`nowUtc()`'s monotonic state is module-level —
  `api/types.ts:387-416`; two processes mint colliding
  or backward `at` and corrupt latest-wins).
  `POOL_MAX = 10` lives inside that one process; a
  load-balanced pair is forbidden until a mint realm
  exists.
- `./test-postgres` gains a named obligation: run in CI
  (or, absent CI, as a named pre-release gate beside
  `./measure --record` milestones) so the
  fourth backend cannot rot outside `./validate`.
- Server seeding with production scrypt: the mock/seed
  paths keep the injected-hasher covenant
  (`tests/mock-seed.ts` precedent); the operator seed
  flags hash SERIALLY (the `Promise.all` fan-out at
  128 MiB per hash is an OOM, not a seed).
- A8 staleness written into TEST-PLAN's server section
  so the first two-browser case is not filed as a
  regression.
- Request body-size cap: named constant, 413 posture,
  enforced at the `node:http` adapter.
- scrypt concurrency bound: a small named semaphore on
  password verifies (memory-DoS cap); per-identity
  auth throttling stays a NAMED RESIDUAL beside it.

## Testing (§ M scope corrections)

- The parent's "run the pinned acceptance suite
  parameterized by backend factory" requires BUILDING
  that suite: today only two backend-tier unit files
  loop factories and `mock-seed.ts` hardcodes the memory
  adapter. Naming it Phase C scope is the amendment —
  the checkbox was aspirational.
- New pins from W22/W23/W24, added to § M:
  - hash-resolved If-Match: hit, stale (0-row), N-match
    latest `(at, id)`;
  - instance projected-hash gate: differently-roled
    callers each round-trip their own validator;
  - racing predecessor claims under the address lock:
    statuses `[200, 412]`, exactly one new head, loser
    stores nothing, and NO unique chain index exists;
  - spent-jti: replay → 401; racing same-jti grants →
    one winner; assertion without `jti` → verify fault;
  - code-redemption race: one winner under the address
    lock;
  - the é storage-codec vector unchanged (load-bearing).

## Supersession register

| Superseded | By | Grounds |
|---|---|---|
| If-Match D4 (validator byte source); D1's validator-value detail; D8's "wire ETag" row | W22 | Content addressing: live ETag IS the versions address; per-caller instance validators fix the Vary defect; owner-adjudicated 2026-08-13 |
| WO-SoT spec's pair-id ETag pins (§ ETag definition echoes) | W22 | Same cut; transition gate re-pins on content hash |
| Parent § B/§ C/§ F `replaces_response_id` rename + unique backstop | W23 (D5/D6 ADOPTED) | The parent restored a column the unification cycle explicitly rejected; in-tx assert + extended address-lock class is one mechanism on both tiers |
| Parent W4 / A4 (jti fact on grant response + GIN probe) | W24 | Race (no lock covers grants) + stored≡served pollution; spent-address pair family rides existing machinery |
| Parent W14's unstated gate | W22 | W14 flipped emission only; every conditional write would 412 forever against a pair-id gate |

Each supersession lands in the same commit-message
family as the covenant break. The unification spec and
the WO-SoT spec each gain a one-line pointer to this
register AT MERGE TIME — not edited by this task.

## Ripple map (the future merge commit into the parent)

- Context — dangling sentence integrated.
- User decisions 6/10 — W22 wording; versions token
  unchanged.
- Review amendments (2026-08-12) — W4 and W14 annotated
  as superseded/completed by W24/W22.
- Tier A table — A3 residual list completed; A4 → W24;
  A5 wording; A6 + client PKCE.
- § B — chain paragraph rewritten (W23); digest bytes-in
  entry; codec notes.
- § C — DDL drops `replaces_response_id`; PG floor;
  encoding assert; CHECK-prose re-aim; JSON-validity
  CHECK note.
- § D — index list drops `responses_replaces_key` and
  `requests_body`; `*_uri_id` named permanent; GIN
  reader list updated; SFV-referrer RESTRICT constraint
  noted.
- § F — lock order; gate-class extension; typed-error
  table (delete 23505-replaces row; add 40P01); replay-
  exempt precision; snapshot isolation + import locks.
- § G — SQL restructured heads-first; head predicate
  reference; request-vs-response column warning.
- § H — covenant + op→parent (invitations out;
  completeness covenant); catalog replaced by the
  appendix; keyed-read miss posture keeps `uri_id`
  permanently; `hasUndoHistory` exact-at-write.
- § I — W22 dialect + gate mechanics; R8 recovery;
  content-equality semantics.
- § J — dispatch rule; Cache-Control; body cap; scrypt
  semaphore; mint-realm covenant; 401 posture.
- § K — K.1 client-graph rewrite; K.3/K.4/K.5/K.6 per
  above; K.7 seed serialization.
- § L — unchanged except README exception wording rides.
- § M — parameterized-suite deliverable; new pins;
  `./test-postgres` obligation.
- § N — yank checklist drops the `uri_id` retirement
  line; residuals list completed; A8 prose.
- Follow-on charter — consumption facts + RESTRICT
  constraint.
- Cross-references — add both If-Match specs and the
  WO-SoT spec (+ its amendments doc).

## Appendix — ground-truth GET catalog (62 surfaces)

Registration mechanics, so no future catalog drops
surfaces: registration is verb-keyed (`route(pattern,
{ get: ... })` — no `'GET ...'` strings exist); five
registrations are factory-emitted with no literal
pattern (`documentCollectionRoute` /
`documentEntityRoute`: `ideas`, `projects`, `ideas/:id`,
`projects/:id`, `objectives/:id`); one is a bare object
literal (`flows/:id`, `routes.ts:5092-5101`); four
surfaces are pre-dispatch intercepts that never enter
the route table (`organizations`, `invitations`,
`invitations/sent`, `identities/:id/default-org` —
`api/api.ts:301-324`, `api/invitations-domain.ts:
139-151`). The org-prefixed facade re-enters unmatched
`/organizations/:org/:entity[/:id]` paths against the
flat resource — a wire surface, not a registration.

Classes: STREAM (stored response body is the served
answer; render-at-write wave), ASSEMBLE (read-time join
or reducer; keyed reads still apply), PROJECT (per-
caller ACL projection), DUMP (whole-plane), FOLLOW-ON
(work-order session), FUTURE (not live today — the
`/versions` surface lands in Phase A).

| Surface | Class | Note |
|---|---|---|
| `ideas`, `projects`, `objectives` collections | STREAM | trio families; `getCollectionBody` |
| `ideas/:id`, `projects/:id`, `objectives/:id` | STREAM | factory-registered; trio + `organization_id` |
| `organizations/:organization-id/record-types` (+ `/:record-type-id`) | STREAM | trio family; inline routes (no wiring row) |
| `.../record-types/.../attributes` (+ `/:attribute-id`) | STREAM | document family; omitted by parent catalog |
| `flows` collection | STREAM | per-row `hasUndoHistory` exact at write (this doc) |
| `flows/:id` | STREAM | bare-literal registration; stamps `organization_id`, graph, `hasUndoHistory`; NO trio |
| `members` collection | ASSEMBLE | membership join roster (`routes.ts:4036`) |
| `members/:id` | STREAM | trio, NO `organization_id` (global plane) |
| `ai-members`, `ai-members/:id` | STREAM | stateless family |
| `human-members`, `human-members/:id` | STREAM | only non-PUTable registered family (GET/POST) |
| `memberships`, `memberships/:id` | STREAM | stateless join-entity family |
| `identities`, `identities/:id` | STREAM | wired PUTable family; global plane |
| `identities/:id/pii`; `identity-pii` | ASSEMBLE | self-fenced / membership-fenced PII reducers |
| `identities/:id/credentials` (+ `/:cid`) | STREAM | stored body is the secretless shape (`withoutSecret` at render) |
| `identities/:id/registration` | STREAM | registration facet document (kind-gated) |
| `identities/:id/default-org` | ASSEMBLE | pre-dispatch; ledger reduction + membership fallback |
| `identity-tokens` (+ `/:id`); `identity-token-revocations/:id` | ASSEMBLE | auth-plane fail-closed reducers; not in the wave |
| `identity-providers` (+ `/:id`) | STREAM | seeded documents |
| `organizations` | ASSEMBLE | pre-dispatch; live orgs ∩ token claims |
| `organizations/:id` | STREAM | org document |
| `invitations`; `invitations/sent` | ASSEMBLE | op-ledger lists; op→parent obligation REMOVED (this doc) |
| `ideas/:id/submissions`; `projects/:id/flows`; `flows/:id/work-orders`; `objectives/:id/revisions`; `projects/:id/objective-baseline-scores`; `projects/:id/objective-actual-scores` | ASSEMBLE | join/fold rows without own lifecycle |
| `flows/:id/records` | ASSEMBLE | join list |
| `flows/:id/records/:frid` | STREAM | PUTable join-document leaf |
| `flows/:id/tags/:name` | STREAM | tableless document family (the template) |
| `current-member` | ASSEMBLE | actor-keyed singleton |
| `work-orders`, `work-orders/:id`, `work-orders/:id/history`, `work-orders/history` | FOLLOW-ON | binding overlay; charter |
| per-id `/history`: ideas, projects, objectives, flows, record-types, members, instances | STREAM → FUTURE `/versions` | chain fetch; trio embedded; instances PROJECT after resolve |
| `objectives/history` (bulk) | STREAM (bulk) | `requests_route` probe + chain fold; registered before `/:id` |
| `record-types/.../instances` (+ detail) | PROJECT | per-caller `projectReadableValues` |
| instance `/history` → `/versions` (+ `/versions/<etag>`) | PROJECT | resolve stored revision, then project |
| `snapshots/schema` | DUMP | admin-gated at server tier (A5); GET and DELETE both exempt today |
| `GET <family>/:id/versions` (+ `/<etag>`) | FUTURE | Phase A surface; W22 dialect; `flows/:id/versions` 404 pin lands first |

## References

- Parent (fingerprinted above): §§ A–N, W1–W21, Tier A/B
  tables, follow-on charter.
- `2026-08-05-optimistic-locking-if-match-unification-`
  `design.md` — D1–D12; D4/D5/D6 superseded or adopted
  per the register.
- `2026-08-07-if-match-unification-amendments-design.md`
  — A1 (R8 message-plane recovery), A2 (genesis claim
  boundary); the genre precedent for this document.
- `2026-08-05-work-order-instance-sot-coupling-design.md`
  (+ its 2026-08-07 amendments) — pair-id ETag pins
  superseded by W22.
- `ARCHITECTURE.md` § Server-tier deploy blockers
  (`:350-410`) — A-list authority; the verbatim-ledger
  completeness at `:382-386`.
- `SCHEMA.md:169-183` — `etag` / `follows` rows dying
  with the break.
- Code evidence, read at write time:
  `api/message-pair.ts` (`strongEtagOf`, hoist, replay
  set), `api/api.ts` (locked arm, instance gate,
  intercepts, `ClientFacadeAdapter`), `api/routes.ts`
  (registrations, WO N+1, op routes),
  `api/derive-documents.ts` (`documentPairsAt`),
  `api/derive-flows.ts` (`flowEntityOf`),
  `api/derive-members.ts`, `api/derive-invitations.ts`,
  `api/invitations-domain.ts`, `api/derive-states.ts`
  (owner resolvers, WO scans),
  `api/derive-state-field-values.ts`,
  `api/client-assertion.ts`, `api/authentication.ts`,
  `api/family-registry.ts`, `api/db.ts`
  (`TABLE_INDEXES`), `api/request-auth.ts`
  (`BOOTSTRAP_ROUTES`), `api/authorization.ts`
  (`ROUTE_POLICY`), `api/types.ts` (`nowUtc`,
  `hasUndoHistory`), `api/mock-data.ts`,
  `shared/digest.ts`, `shared/http-message/
  wire-codec.ts` + `octets.ts`,
  `web-app/app/adapters/init.ts` / `shared.ts` /
  `authentication.ts`, `tests/backend-*.test.ts`,
  `tests/mock-seed.ts`.
- Church of Code — Reliability, Security, Uniformity,
  Logic, Clarity; derive from the ledger (W24, the
  invitation removal); process first (the spent-jti
  address); measure before optimize (`requests_body`,
  codec loops); validate at the gate (`fromLatin1`
  mask); execute the request (shape-evolution posture
  deferred, re-render primitive named not built).

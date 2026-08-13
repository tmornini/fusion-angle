# Critique — 2026-08-12 Postgres backend design spec

## Context

The user asked for a deep analysis and critique of
`docs/superpowers/specs/2026-08-12-postgres-backend-design.md`
(1,203 lines; already through one review cycle, W1–W21,
amendments in bf5140cb + c6576739). Three Explore agents
verified the spec's ~40 file:line claims against the code;
I stress-tested the schema, transaction, concurrency, and
security design directly. The critique is the deliverable;
the plan below records it as spec amendments if approved.

## Verdict

Foundations are sound and unusually well-evidenced (A1–A6
completeness verified exact; counts 131/9+2/1498 check out;
BYTEA/W1 correct; W21 fixes a real crash window). Three
blocker-class defects survive the prior review, plus six
major gaps and a tail of minor precision fixes.

## Blockers

- **B1 — W14 × If-Match dialect collision.** Today's served
  ETag IS the quoted pair id (`message-pair.ts:404-406`);
  If-Match compares pair ids (`routes.ts:2611`, `:3963`) and
  anchors `follows: ifMatchTarget` (`routes.ts:4007`). The
  2026-08-05 unification spec pins: "Wire ETag / If-Match
  carry the head document-pair response id, never
  `responses.etag`". W14 flips GET ETags to content hashes;
  the spec never converts the If-Match gate. Every
  conditional write 412s forever. Instances doubly broken:
  live instance ETag is per-caller PROJECTED hash — not a
  response id, not the stored etag column. Also: write
  responses' ETag under W14 undefined (two dialects live).
  Fix: new W-item — If-Match accepts the wire ETag, resolved
  noun-scoped via `responses_version_etag` to a response id;
  instance PATCH posture named explicitly.
- **B2 — A4 jti replay race.** Grants bypass the dedup lock
  AND the address lock (§ F); the spent-jti check is a GIN
  probe of committed rows; no unique index possible under
  no-extraction. Two concurrent replays of one assertion
  both probe, both miss, both mint. A fresh-signed assertion
  reusing a jti also evades any hash-keyed serialization.
  Today jti is never checked at all (`client-assertion.ts:
  7-9`) — this race IS the seam A4 exists to close. Fix:
  third advisory xact lock keyed on assertion jti, taken by
  assertion-bearing grants before probe; add racing-replay
  test to § M.
- **B3 — `*_uri_id` retirement is unearnable as written.**
  § D/§ N retire the indexes "once the six by-id call sites
  ride composite reads" — but `resolveOwningOrganization`
  (`derive-states.ts:284`) and `resolveGlobalOwner` (`:391`)
  are prefix-AGNOSTIC uri_id lookups on the write-authorizer
  and miss paths, which § H itself retains. The six is right
  (headPairIdAt dies with Supersedes; code probe goes GIN)
  but the retirement condition forgets the two permanent
  readers. Fix: name them permanent (keep the index) or
  design their successor.

## Major

- **M1 — render-at-write shape evolution unnamed.** Stored
  bodies become the serve path; changing a GET shape has no
  mechanism (old heads serve old shapes; collections mix
  shapes in one array). Needs a named posture: pre-customer
  reseed (Phase-A precedent) now, re-render primitive as
  named future work.
- **M2 — getSnapshot isolation.** "One readonly tx" is READ
  COMMITTED on postgres.js → per-statement snapshots → torn
  export (response without request) that then FAILS the
  deferred-FK re-import. Fix: REPEATABLE READ, one word.
- **M3 — advisory-lock ordering.** Dedup lock and address
  lock are each specified as "first statement"; a gated
  hash-deduped write takes both. Pin one global order and
  map 40P01 in the typed-error table.
- **M4 — § M acceptance suite is aspirational.** Only
  backend-read-isolation + backend-getwhere-parity are
  factory-parameterized (memory+localStorage; IndexedDB
  never looped). "Run the pinned suite against Postgres"
  requires BUILDING the parameterized suite — name it as
  scope.
- **M5 — head-probe/versions predicate omitted.** § H HEAD
  PROBE and § I chain fetch name only address + ORDER BY;
  the live predicate is latest **2xx PUT/DELETE** (requests
  join for method) — matching `getCollectionBody` and
  `derive-documents.ts:97-114`. Spell it, or a 4xx/op row
  serves as head.
- **M6 — server hardening unnamed:** no request body-size
  cap (413 posture); no auth throttle — scrypt at 128 MiB ×
  concurrent logins is a memory-DoS + online-guessing
  surface. Name caps/throttle or a named residual.

## Minor

- server_encoding=UTF8 boot assert (`convert_from` targets
  the DB encoding; IMMUTABLE declaration deserves a note).
- `requests_body` GIN has no catalogued reader (all named
  probes are response-side) — name one or drop until
  measured.
- `getCollectionBody` evaluates `message_body` per version
  row (planner-dependent); restructure head-ids-first.
- Import vs concurrent appends: take the address/exclusive
  lock during putSnapshot delete+insert.
- API-response Cache-Control / conditional-GET posture
  unnamed (real HTTP now; ETags ship without a 304 path).
- A8 "SSE surface" is net-new, not documented residual
  (API-TREE pins addresses + LISTEN/NOTIFY only).
- `shared/digest.ts` has no bytes-in entry point — § B's
  hash-of-octets needs a named digest-seam addition.
- Dedup-bypass class should name the actual exemption set
  (`REPLAY_EXEMPT_ROUTE_PATTERNS` incl. rotation), not
  "auth grants".
- Route-CHECK prose aims at the wrong hazard: pattern
  universe is kebab `[a-z:/-]` (verified, zero digits/
  underscores); the near-miss is snake_case FAMILY vocab
  (`record_instances`) leaking into the column.
- jti fact rides the client-visible token response wire —
  legal, name it.
- `toLatin1`/`fromLatin1` are per-char loops — note
  TextDecoder('latin1') before wire becomes the hot path;
  wire codec is production-unexercised today (é pin is
  load-bearing).
- "PostgreSQL 15+ (SQL-standard function bodies)" — that
  feature is PG14; name the real floor or the real reason.
- Context § dangling sentence ("Render-at-write is the
  mechanism...") — amendment artifact.
- SCHEMA.md's etag wording is already wrong today (code
  hashes base64 text, never empty) — note it dies with the
  break.

## Verified sound (report as strengths)

A1–A6 = exact 1:1 with ARCHITECTURE.md's six remaining
seams, nothing uncovered; 131 family-slice reads / 9+2
scans / six-by-id (post-conversion arithmetic) all check;
BYTEA + Latin-1 codec reasoning correct at the byte level;
uri_prefix slash CHECK matches stored values; route CHECK
safe for the entire current pattern universe; W21 closes a
real post-commit marker crash window (`db-backed.ts:
116-141`); Supersedes deletion removes a real per-write
pre-tx read (`api.ts:690-696`); scrypt params match OWASP
with correct maxmem math; A3 residual accurately named
(verbatim `authorization` hoisting + live tokens in grant
bodies confirmed).

## Plan (if approved)

1. Record the findings as "Review amendments (2026-08-13)"
   in the spec front (B1–B3 as new W-items with chosen
   dispositions; M1–M6 resolved in body; minors batched) —
   same pattern as the 2026-08-12 cycle, editing only
   `docs/superpowers/specs/2026-08-12-postgres-backend-
   design.md`.
2. Keep 78-char lines; run `./validate`; commit per house
   style (one concern per commit).

User gates each blocker's disposition choice (B1 has a real
design decision: etag-resolved If-Match vs dual dialect).

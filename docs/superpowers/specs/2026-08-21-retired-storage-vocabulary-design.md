# Retired Storage Vocabulary Sweep — Design

Date: 2026-08-21
Status: draft (brainstorm 2026-08-21; approved in chat;
awaiting the user's review of this document).
Spec-only. No implementation in this document.

Follows
[the 2026-08-21 pairs table merge](2026-08-21-pairs-table-merge-design.md)
(landed; `c8d2f01a`). Starts from that clean tree.

## Context

Commit `b1322740` yanked the browser-resident data tier:
`api/backend-indexeddb.ts`, `api/backend-localstorage.ts`,
their adapters, and their tests. The code is gone; the
vocabulary stayed. A measured sweep on `c8d2f01a` finds
104 lines across 44 files that still explain a surviving
rule by a deleted backend's behavior — "id-lex ordered
(the IndexedDB reference)", "the IndexedDB auto-commit
constraint", "the simulated backends (memory,
localStorage)", "IndexedDB has no Node stub" — plus a
SCHEMA.md section that still describes the table as an
IndexedDB object store and a "CANONICAL residual
statement" about orphan object stores in a database no
process opens.

The words are not harmless. Each one teaches the next
reader that a rule exists because of a platform quirk,
so the rule looks droppable the day the quirk is
forgotten — when in truth the rule is the seam's own
contract, enforced by tests on both surviving backends.

The survey also found organs, not words: no-op hooks, an
index form with zero instances, a session mode that
keeps a credential pair in localStorage. Those are named
in § Follow-on and are NOT this document.

## User decisions

1. **Ring 1 only — words.** Comments, docs, test prose,
   and one test literal. No interface, behavior, or
   structural change; the no-op organs stay and are
   described truthfully.
2. **Strict datastore separation and isolation** names
   three invariants (§ Invariants). Every replacement
   sentence must be consistent with all three.
3. **Families, one voice each, plus a gate.** Each
   rationale family gets one canonical sentence; the
   sweep applies it family by family; a word-gate in
   `./validate` keeps the vocabulary out afterwards.
4. **Trim the metafile pin.**
   `tests/server-zip-metafile.test.ts` stops naming
   `backend-indexeddb`; the pin's job — signing key and
   token mint — is unchanged.
5. **localStorage stays as a scratchpad** — UI
   preferences only — and the docs say so once.

## Rule of the whole document

A replacement sentence states what the seam promises and
what enforces it. It never says "there is no X" about a
deleted tier, never names a deleted backend, and never
explains a live rule by a dead platform. Where an organ is
unused today, the sentence says so plainly rather than
hiding it.

One historical pointer survives, in ARCHITECTURE.md
§ Demo server tier, and it is a commit hash: "Storage
moved server-side in `b1322740`; memory remains for
`./test` / `./validate`."

## Invariants

Stated here; every family below must hold all three.

- **Seam separation.** Stores own semantics; backends own
  bytes. A derive, route, or domain module never names a
  backend. Where a comment today justifies a rule by a
  backend's behavior, the replacement justifies it by the
  seam's contract: the seam promises rows, never an
  order; the transaction scope is the declared set; a
  transaction body awaits row ops only.
- **Tier isolation.** Exactly two backends implement the
  seam: Postgres (product, `api/backend-postgres.ts` via
  `api/db-postgres.ts`) and memory (`./test`,
  `api/backend-memory.ts` via `api/db-memory.ts`).
  Neither imports the other. The memory backend is never
  weaker than the production gate (the shared NOT NULL
  gate in `api/storage-serialize.ts`; the parity and
  acceptance suites). Comments inside `api/db.ts`,
  `api/db-backed.ts`, `api/backend-*.ts`,
  `api/store-serializer.ts`, and `api/storage-serialize.ts`
  may name both backends — describing the seam is their
  job.
- **Scratchpad separation.** localStorage holds UI
  preferences only — theme, sidebar, log level, active
  organization id — never data. The word `localStorage`
  stays legal; the compounds `localStorage backend` /
  `tier` / `simulated` / `demo` do not.

## Non-goals

- Ring 2 and Ring 3 organs (§ Follow-on): the
  `{unique: true}` index form and `UniqueConstraintError`;
  the `open`, `notify`, and latency hooks on
  `BackedDbAdapter`; `api/latency.ts`; the localStorage
  credential-pair session mode and the server's
  body-borne `refresh_token` fallback; the in-page
  facade's cookie-to-body lift.
- `TxMode` literals `'readonly'` / `'readwrite'` —
  Postgres speaks the same words.
- "Demo-tier concession" / "DEMO-TIER POSTURE" (three
  sites), "password-loop demo" (two sites), and
  ARCHITECTURE.md's "Demo server tier" — the
  product-maturity sense of *demo*, live vocabulary.
- The ~20 test files that stub `globalThis.localStorage`
  for the logger's preference read, and their comments
  attributing the read to `state.ts`.
- `docs/superpowers/**` (dated records), `measurements/`.
- "in-browser ZIP" — `zip.ts`, the live flow export.

## Rationale families and canonical text

Sites are named by file and anchor phrase, never by line:
the pairs merge moved every line once already. The plan
re-greps at execution.

### F1 — Ordering

Today: "id-lex ordered (the IndexedDB reference)" and
"H7: … (IndexedDB-invisible, memory-tier load-bearing)".

Definition site, `api/derive-documents.ts` at
`byIdAscending`:

> The shared id-lex ordering every document family's list
> derivation sorts its final rows by — byte-identical
> across families, so it lives here. The order is the
> derivation's own: the seam promises rows, never an
> order, so no backend's row order is a fact to inherit.

Citing sites — `derive-flow-records.ts`,
`derive-objective-revisions.ts` (second site),
`derive-project-scores.ts` (second site),
`derive-flow-work-orders.ts`, `derive-project-flows.ts`,
`derive-identity-spine.ts` (`deriveIdentityPiiRows`),
`derive-members.ts` (`deriveMemberParents`),
`derive-organizations.ts`, and tests
`api-invitation-document.test.ts`,
`drift-identity-tokens.test.ts`:

> id-lex ordered (byIdAscending — the derivation's own
> order, never the backend's).

H7 sites — `derive-objective-revisions.ts` (first site),
`derive-project-scores.ts` (first site),
`tests/drift-identities.test.ts`:

> H7: explicit id-lex sort — load-bearing, because the
> backend's row order is not a contract and no caller may
> inherit it.

`derive-memberships.ts` (the "OUTPUT ORDER IS DEFINED"
paragraph), `flow-graph-relations.ts` (the
nodes[]/edges[] re-sort paragraph),
`shared/ledger-reduction.ts` (header): keep their own
argument; drop every backend name; close with "the seam
promises rows, never an order."

### F2 — Await only row ops

Today: "the IndexedDB auto-commit constraint",
"auto-commit discipline", "CLAUDE.md § the IndexedDB
auto-commit constraint", "a non-IDB promise".

Canonical, every site:

> formed pre-tx — crypto, hashing, and timers never run
> inside an open transaction (CLAUDE.md § Transaction
> bodies await only row ops).

Sites: `api/message-pair.ts` (the `MessagePair` header;
the EVENT-APPEND paragraph; the response-row `at` note),
`api/authentication.ts` (`TokenEventWrite`; GATE 3),
`api/routes.ts` (the conversion baseline paragraph; the
admin DELETE RESTRICT comment), `api/mock-data.ts`
(three sites), `api/mock-data/seed-message-pairs.ts`
(header), `api/pii-hard-delete.ts` (header),
`api/record-type-refs.ts` (`collectRecordTypeReferrers`),
`tests/api-work-order-claim.test.ts` (the contention
pin's comment).

`api/api.ts` (the Decision 5 post comment):

> AFTER the route handler's promise resolves — the
> transaction has committed.

CLAUDE.md § Gotchas, "Transaction bodies await only row
ops", gains its reason — one sentence, true of both
backends (`advisoryLock` in `api/backend-postgres.ts`;
`createSerializer` in `api/backend-memory.ts`):

> A transaction holds its pooled connection and its
> advisory locks for its whole body; the memory backend
> serializes whole transactions, so a long body stalls
> every other op.

API.md: § 3.14 undo, the two seed pass-1/pass-2
paragraphs, and the fence-fallback paragraph take the
canonical citation. The "forced, not stylistic" bullet
under the composed-POST section becomes:

> **Atomicity.** A composed POST's appends commit or roll
> back as one. Re-entering `handleRequest` mid-transaction
> would open a second transaction and split the unit
> (Commandment X), so a handler holding a transaction
> composes store primitives and awaits row ops only
> (CLAUDE.md § Transaction bodies await only row ops).

### F3 — Declared-table scope

One site, `api/record-attribute-refs.ts` at
`ATTRIBUTE_RESTRICT_TABLES`. The whole paragraph is
stale (it also speaks of "residual dual-write callers"
and "Stage B"); it becomes:

> RESTRICT is pair-plane only (`pairs` via derive
> helpers). An in-tx caller must declare every table it
> touches — the transaction scope is the declared set,
> and the memory backend rejects an undeclared table on
> every test path.

### F4 — Copies on read

Two sites, `api/backend-buffer-tx.ts` (header, second
paragraph) and `tests/backend-read-isolation.test.ts`
(header):

> Reads hand out copies, never the buffered or committed
> row objects — the seam's value semantics: Postgres
> materializes a fresh row per read, and the test backend
> must not be weaker. A caller mutating a fetched row can
> never rewrite committed state.

### F5 — Tier descriptions

Present-tense descriptions of the two backends. Where an
organ is unused today, the comment says so.

`api/db.ts`:

- `UniqueConstraintError`: "A unique-column collision on
  a declared unique column; the memory backend scans the
  declared unique columns before buffering. No table
  declares one today. handleRequest maps it to 412."
- `Tx` header: "The row-granular handle over one
  transaction. Postgres fulfills it with a native
  transaction; the memory backend simulates it (buffer
  touched tables, flush on success, discard on throw)."
- `StorageBackend.hasSchema`: "each backend signals
  'schema exists' its own way: memory by table existence,
  Postgres by the `schema_marker` row."
- `readTransaction`: "Pure-read sibling of `transaction`;
  both backends reject a write under it."
- `TABLE_NAMES`: the whole comment (Phase Final history,
  unversioned open, orphan stores) is replaced by one
  sentence: "The tables of the message plane — one,
  `pairs`."
- `TableIndexSpec`: "a plain column name, or the object
  form declaring `unique: true`. No table declares the
  object form today."
- `uniqueColumns`: "consumed by the memory backend's
  pre-buffer scan."
- `TABLE_INDEXES`: "The columns `getWhere` accepts per
  table — the keyed-read allow-list both backends enforce
  (`assertGetWhereColumn`). Postgres indexes are declared
  in `schema-postgres.ts`."

`api/db-backed.ts` header: "One adapter over any
StorageBackend. The per-backend variation rides in the
constructor: the backend, a latency shim, an open hook, a
post-commit hook — both presets pass no-ops for the last
three today. Schema lifecycle delegates to the backend."

`api/backend-memory.ts` (`#serialize`),
`api/store-serializer.ts` (header),
`api/storage-serialize.ts` (header),
`api/backend-buffer-tx.ts` (header, first paragraph):
"the memory backend" in place of "the simulated backends
(memory, localStorage)"; "cross-process ordering is
Postgres's (advisory locks); this serializer orders one
memory instance" in place of "until the IndexedDB tier
(Phase B)"; the NOT NULL sentence keeps "so the test
backend cannot lie about what the production gate
enforces" with the two backends named correctly.

`api/pii-hard-delete.ts`: the "Cross-tab note" paragraph
is deleted — it describes a deleted tier's flush.

`api/derive-identity-spine.ts` (`deriveIdentityKind`,
"the demo tier's E13 posture"): "the whole-family prefix
read is the one `deriveIdentityPiiRows` already makes."
`api/derive-states.ts` ("this demo's zero-latency,
single-process architecture … the eventual server tier"):
keep the substantive caveat — byte-exact replay assumes
one process where `claimAt` and the decision instant
coincide; a multi-process deployment must record the
actual expiry decision as its own event — and drop
"demo" and "eventual server tier".

`api/api.ts` (`ClientFacadeAdapter`) and
`api/latency.ts` (header): "the latency shim — both
presets pass a no-op today" in place of "the demo
latency shim" / "the demo network-emulation seam".

`web-app/app/server-core.ts`: "The in-page test facade
stays off this graph." `web-app/app/adapters/`
`session-token.ts`: "No mint — the test composition root
(`adapters/init.ts`) seeds an anonymous token; the server
entry installs a login token."
`web-app/app/adapters/session-refresh.ts`: "The
non-cookie session mode of the test composition root
sends the stored refresh in the body."
`web-app/app/storage-keys.ts` header: "Client-side
localStorage keys — UI preferences and the test session
mode's credential slot. All share the `fusion-angle:`
prefix. No data lives in localStorage."

Tests: `flow-designer-presenter.test.ts` (two sites),
`command-palette-init.test.ts`,
`flow-undo-cursor.test.ts` — the true wall is "this file
installs no client facade", never "Node has no
IndexedDB"; `db-keyed-read-coverage.test.ts` header and
assertion message re-grounded on the allow-list contract
("every `getAllWhere` literal names a column `getWhere`
accepts on both backends"); `server-zip-metafile.test.ts`
— see § The metafile pin.

### F6 — Scratchpad rule

> localStorage holds UI preferences only — theme,
> sidebar, log level, active organization id — never
> data.

Sites: CLAUDE.md § Key Layers, Database bullet (replacing
"There is no IndexedDB or localStorage **data** backend.
Theme and sidebar still use localStorage.");
ARCHITECTURE.md § Demo server tier (replacing "Theme and
sidebar still use localStorage."); SCHEMA.md § Schema of
record (the localStorage-keys sentence is deleted, see
§ Docs).

## Docs

SCHEMA.md § Schema of record: the object-store sentence,
the localStorage-keys sentence, and "TypeScript /
IndexedDB view" become: "The table is `pairs` in Postgres
(`api/schema-postgres.ts`); the memory backend holds the
same rows in an in-process Map keyed by table name.
Column types match `PairEntity`: TEXT in the TypeScript
view; Postgres stores `request` and `response` as BYTEA
Latin-1." The **Orphan stores (gate 6) — CANONICAL
residual statement** paragraph is deleted whole. Before
deleting, the plan greps the root docs for "Orphan
stores", "gate 6", and "leave-inert" and retargets or
deletes each cross-reference; the surviving residual,
"erasure completeness is pair-plane only", already lives
in API.md § THE ERASURE-COMPLETENESS PIN.

ARCHITECTURE.md: § Demo server tier — "(no in-page API,
no signing key, no IndexedDB)" drops its last item; the
metafile-test sentence names signing key and token mint;
the "yank … has shipped" sentence becomes the history
pointer (§ Rule); the scratchpad rule follows it. The
sentence "The IndexedDB orphan-store residual retired
with the yank." (two places: the Phase Final paragraph
and § Exit residual) is deleted. § Storage tiers stands.

CLAUDE.md: the Database bullet (F6); the Build section's
metafile sentence names signing key and token mint; the
row-ops gotcha gains its reason (F2).

API.md: the F2 sites; the authorize-flow clauses "the
browser ZIP still accepts authorize without a challenge"
and "The browser ZIP keeps the soft path." are deleted —
authorize without S256 is a 400 on the only path
(`authorizePassword`, "S256 code_challenge is required"),
so the surrounding sentences read "authorize rejects a
request without S256, so redeem always verifies";
erasure residual 3 becomes: "The caller's own access
token, held in memory for its lifetime (≤ 15 min),
decodes to the pre-erasure name until it expires or is
refreshed."

TEST-PLAN.md: G46's residual list takes the same
in-memory wording; the MCP-limitations bullet loses
"There is no in-browser data database to inspect."; the
superseded blockquote loses its "The retired browser-ZIP
origin (…) is gone." sentence. README.md loses "The
in-browser data tier is gone."

## The metafile pin

`tests/server-zip-metafile.test.ts`: `FORBIDDEN_INPUTS`
drops `'backend-indexeddb'`; the fixture assertion that
feeds `'api/backend-indexeddb.ts'` / `SIGNING_KEY_MATERIAL`
is re-pointed at a neutral sample path and keeps proving
both fragment kinds hit; the third test is retitled
"client graph omits token mint and signing key". The
client-graph assertion itself is unchanged.

## The gate

In `validate`, after the `org` lint, in its idiom:

```
# Reject the vocabulary of the retired browser-resident
# storage tiers. `localStorage` alone is legal (UI
# preferences); its backend/tier compounds are not.
# `in-browser ZIP` is the live flow export (zip.ts).
```

Pattern (case-insensitive ERE, one alternation):

```
indexeddb|IDBTransaction|non-IDB|\bIDB\b
|LocalStorageBackend
|localStorage (backend|tier|simulated|demo)
|simulated (backend|tier)s?
|object stores?|\bPhase B\b|auto-?commit
|in-browser data|browser[ -]ZIP
```

Scope: `api/ shared/ server/ tests/ web-app/app/`
(`.ts`, `.html`, `.css`) and the root `*.md`. Excluded:
`docs/`, `measurements/`, `validate` itself. Carve-out:
lines containing `in-browser ZIP`. Not gated: `demo tier`
(live product-maturity vocabulary); `memory tier`.

Failure prints `Error: retired storage-tier vocabulary:`
and the hit list, then exits 1.

`auto-commit` joins the pattern (it was not in the list
approved in chat) because every one of its 21 uses in
scope is the IndexedDB sense — a Postgres transaction
does not commit on `await` — and it is the only way the
four F2 sites that never say "IndexedDB" are caught.

## Delivery — one family per commit, every commit green

The gate's grep runs by hand first, on `c8d2f01a`, and
its output — 104 lines, 44 files, plus the `auto-commit`
additions — is the acceptance list. The gate joins
`validate` as the LAST commit, so no red commit lands on
master while red-first is still observed locally.

Commits, one concern each, subjects ≈50 chars:

1. F1 — re-ground list ordering on the seam
2. F2 — cite the row-ops gotcha in pre-tx comments, and
   give the gotcha its reason sentence in CLAUDE.md
3. F3 — re-ground the declared-table scope comment
4. F4 — re-ground copies-on-read on the seam
5. F5 — describe the two backends in seam comments
   (`api/db.ts`, `db-backed.ts`, `backend-*.ts`, the
   serializers, `pii-hard-delete.ts`, the derive caveats,
   `api.ts`, `latency.ts`)
6. F5 — retire browser-tier wording in web-app comments
7. F5 — retire browser-tier wording in test comments
8. trim the metafile pin to mint and signing key (the
   test, plus the CLAUDE.md and ARCHITECTURE.md sentences
   that describe it)
9. SCHEMA.md — rewrite § Schema of record for two
   backends and delete the orphan-store paragraph with
   its two ARCHITECTURE.md echoes
10. API.md — re-ground the transaction rationale (F2,
    the browser-ZIP clauses, residual 3)
11. state the localStorage scratchpad rule and the
    history pointer (CLAUDE.md, ARCHITECTURE.md)
12. drop retired-tier notes from README and TEST-PLAN
    (including G46's residual wording)
13. add the retired storage vocabulary gate to validate
14. regenerate SCHEMA.svg — only if
    `generate-schema-svg --check` reports drift after the
    `api/db.ts` comment edits

`./validate` runs after every commit. Between commits 1
and 12 the gate's grep is run by hand and its count must
fall monotonically.

## Acceptance criteria

- `./validate` green with the gate in place.
- `git grep -niE '<pattern>' -- ':!docs/' ':!validate'
  ':!measurements/'` on the final commit returns nothing
  outside the `in-browser ZIP` carve-out.
- Every F1–F6 canonical sentence appears verbatim
  (modulo 78-column wrapping) at every site the family
  lists; no site of a family uses a different wording.
- No test assertion is weakened; the only test edits are
  comments, the assertion message in
  `db-keyed-read-coverage.test.ts`, and the metafile-pin
  trim.
- `SCHEMA.svg` and `API.svg` gates green (regenerated in
  their own commit if they drift).
- Root `.md` files pass the 78-column lint; `TEST-PLAN.md`
  stays exempt.

## Risks

- A re-grounded sentence that is *false* about the
  present — e.g. claiming Postgres enforces the declared
  table set (it does not; the memory backend does). Every
  sentence in F1–F5 was checked against the code on
  `c8d2f01a`; the plan re-checks the orphan-store
  cross-references before deleting the paragraph.
- The gate's `auto-commit` word acquiring a legitimate
  Postgres sense later (autocommit mode). If that day
  comes, the word leaves the pattern in its own commit.
- `generate-schema-svg` reads `api/db.ts` as text; comment
  edits may move the SVG. Commit 14 exists for that.

## Follow-on (not this document)

Ring 2 — seam organs shaped for IndexedDB, dead or
misnamed: the `{unique: true}` index form,
`uniqueColumns`, `indexColumn`, `UniqueConstraintError`
and its 412 mapping; `TABLE_INDEXES` renamed to what it
is; the `open` hook and `DbLifecycle.initialize`; the
`notify` hook, `DbLifecycle.postNotification`,
`NotificationPost`, and six dead call sites (the live
server notification is `Tx.notify` → `pg_notify` via
`notifyWrite` in `api/message-pair.ts`).

Ring 3 — browser-tier organs outside the seam: the
latency shim (`api/latency.ts`, `LatencySimulation`, four
`await adapter.simulateLatency()` sites, the
facade-holder duck-typing, the "exactly 4" pin); the
localStorage credential-pair session mode
(`session-credentials.ts` with its default-off cookie
mode, `STORAGE_KEY_AUTHORIZATION`,
`SessionCredentials.refreshToken`,
`SessionCredentialsCorruptError`, the non-cookie branches
in `app-boot.ts` / `adapters/shared.ts` /
`invitations.ts` / `adapters/authentication.ts` /
`session-refresh.ts`), the server's body-borne
`refresh_token` fallback in `grantRefresh`, and the
in-page facade's cookie-to-body lift in `unwrapResponse`
— whose removal needs a small cookie jar in
`tests/in-page-facade.ts` so real refresh round-trips
stay tested under Node.

## Files

Code comments: `api/db.ts`, `api/db-backed.ts`,
`api/backend-memory.ts`, `api/backend-buffer-tx.ts`,
`api/store-serializer.ts`, `api/storage-serialize.ts`,
`api/api.ts`, `api/latency.ts`, `api/routes.ts`,
`api/message-pair.ts`, `api/authentication.ts`,
`api/mock-data.ts`, `api/mock-data/seed-message-pairs.ts`,
`api/pii-hard-delete.ts`, `api/record-type-refs.ts`,
`api/record-attribute-refs.ts`, `api/derive-documents.ts`,
`api/derive-flow-records.ts`,
`api/derive-flow-work-orders.ts`,
`api/derive-project-flows.ts`,
`api/derive-project-scores.ts`,
`api/derive-objective-revisions.ts`,
`api/derive-identity-spine.ts`, `api/derive-members.ts`,
`api/derive-memberships.ts`, `api/derive-organizations.ts`,
`api/derive-states.ts`, `api/flow-graph-relations.ts`,
`shared/ledger-reduction.ts`, `web-app/app/server-core.ts`,
`web-app/app/storage-keys.ts`,
`web-app/app/adapters/session-token.ts`,
`web-app/app/adapters/session-refresh.ts`.

Tests: `tests/backend-read-isolation.test.ts`,
`tests/api-invitation-document.test.ts`,
`tests/drift-identity-tokens.test.ts`,
`tests/drift-identities.test.ts`,
`tests/api-work-order-claim.test.ts`,
`tests/flow-designer-presenter.test.ts`,
`tests/command-palette-init.test.ts`,
`tests/flow-undo-cursor.test.ts`,
`tests/db-keyed-read-coverage.test.ts`,
`tests/server-zip-metafile.test.ts`.

Docs and scripts: `SCHEMA.md`, `ARCHITECTURE.md`,
`CLAUDE.md`, `API.md`, `README.md`, `TEST-PLAN.md`,
`validate`, `SCHEMA.svg` (only if it drifts).

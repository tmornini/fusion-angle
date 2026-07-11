# Database Schema

> **Note on `SCHEMA.svg`:** the ERD is generated from the
> schema of record (`api/db.ts` + `api/types.ts`) by
> `./generate-schema-svg`; `./validate` runs it with
> `--check` and fails on drift, so it never goes stale.
> Regenerate with `./generate-schema-svg` after a schema
> change.

## Schema of record

Phase Final deleted the entity row plane. The schema of
record is the **message plane** — the append-only
`requests` / `responses` pair tables — plus one survivor
registry row store, `clients`. The tables are listed in
`api/db.ts` as `TABLE_NAMES` (the authoritative count: three).
Each table is an IndexedDB object store (`keyPath: 'id'`) in
the `fusion-ai` database; the simulated backends key the same
tables as `fusion-ai:tableName`. All rows have a text `id`
primary key. Column types: TEXT (string), INTEGER (number),
REAL (float), BOOLEAN (see below). JSON columns store
stringified arrays or objects. All columns are NOT NULL —
entity validation on creation ensures every field is present.

Every domain family (ideas, projects, flows, work orders,
records, objectives, roster, identity spine, organizations,
states, field values, flow tags, …) is a **derivation** over
message pairs at a URI address. There is no per-entity table
and no dual-write half. Reads reassemble documents and
lifecycle state from the pair plane (`api/derive-*.ts`);
writes append pairs only (`tx` lists
`['requests','responses']` on every pair-wired path).

`SNAPSHOT_SCHEMA_VERSION` is **4** (states-address
retirement). A pre-retirement (v3) export is rejected by a
post-retirement import (`SnapshotVersionMismatchError`).
Phase 13's 1→2 bump retired `identity_tokens` +
`authorization_codes`; Phase Final's 2→3 bump retires every
remaining doomed entity table; the 3→4 bump retires the
`states/:id` address (not a `TABLE_NAMES` shrink —
pre-retirement v3 exports still carry pairs no derive source
reads).

**Orphan stores (gate 6) — CANONICAL residual statement.**
Author gate 6 elected leave-inert (no sweep). IndexedDB opens
unversioned: a pre-Final origin keeps dropped object stores
as inert unread orphans until `deleteSchema` (full database
delete) or a fresh reseed. On localStorage, `deleteSchema`
iterates only the CURRENT `TABLE_NAMES`, so demo-tier orphan
keys are never reclaimed by reseed. Named residual: pre-Final
`identity_pii` rows may remain unspliceable after first-time
erasure of a pre-Final identity until a full reseed
(IndexedDB) — live writes no longer dual-write rows, so
erasure completeness is pair-plane only; the orphan store is
unread by post-Final code. Named beside the
erasure-completeness theorem's exported-snapshots disclaimer
(API.md § THE ERASURE-COMPLETENESS PIN). All other docs
cross-reference this paragraph; do not restate it.

**Timestamp width:** every persisted timestamp is RFC-3339
zulu at EXACTLY six fraction digits (`…T12:00:00.000000Z`)
— the one width the mints emit and the append-only ledgers
sort (lexical = chronological holds only within one width).
The validation gate rejects any other width, so a snapshot
exported before this pin that carries 3-digit or
fractionless stamps fails import loudly; the documented
recovery is re-seeding (Settings → mock data) or
re-exporting from a current build.

**Boolean storage:** BOOLEAN columns are typed as `boolean`
in TypeScript (`api/types.ts`) and persist NATIVELY — there
is no `0`|`1` transform. The one storage-edge transform is
the NOT-NULL gate in `api/storage-serialize.ts`
(`serializeValue`), which every backend applies so a write
with a null/undefined field throws rather than persisting.

**Timestamp convention:** TEXT columns storing timestamps
use RFC-3339 Zulu format (e.g.,
`2024-01-15T09:30:00.000000Z`). Temporal facts belong in
the message plane — the absence of a pair is the absence of
the event.

**State and deletion.** Entity rows themselves never carry
state columns. Every entity lifecycle change is a message
pair (document PUT or operation POST). Current state is the
latest event under the `(at, id)` total order on the derived
plane (`api/derive-states.ts`). `'deleted'` is a state event
value on that plane, not a table flag. Document families mark
DELETE as a tombstone pair excluded from the head by
`deriveDocumentsAt` — there is no row to splice. The sole
physical hard-delete is PII erasure (`identity_pii` pairs +
related credentials), which remains a real splice of the
message plane. History tables and the old `EntityStore` /
`StateStore` tombstone filter are GONE (Phase Final Task 5).
The `states/:id` event-append address is retired with every
verb on it — router 404.

**The `'system'` member:** `SYSTEM_MEMBER_ID = 'system'`
in `api/types.ts` is a derived directory entry with
`type = 'system'` and no human/AI detail, seeded by both
`postMockDataLoad` and `postBootstrap`. Its corresponding
identity carries `kind = 'service'` — the platform itself as
a non-person principal. State events with no specific user
actor reference it. It is a pure event-author:
`getMemberMap` resolves it for authorship display, but the
`getMembers` roster — and every list, picker, and detail
view — omits it.

## Survivor tables

### clients

OAuth client registry — the websites built by us and others.
Backed by `HistoryEntityStore` (Phase Final re-pointed it off
the deleted `EntityStore` class). Mutable config of record:
redirect URIs change, JWKS rotate, a client is disabled.
`status` (`active` | `disabled`) is the schema's one mutable
lifecycle column on a survivor row — a named deviation from
the pair-plane lifecycle discipline. Zero public `/clients`
routes today; production reads use
`rawReadRow('clients', …)` (authentication client-assertion
path). No seed rows, no pair companion, never soft-deleted.

`grant_types` and `redirect_uris` are space-delimited (OAuth
convention); `jwks` is the client's JSON Web Key Set as a
JSON string — JWS verification of `private_key_jwt`
assertions runs for real against it (RS256/ES256,
`api/client-assertion.ts`; jti replay tracking is the
remaining server-tier seam); `aud` is the audience the
client's assertions must claim and the origin a token is
minted for.

| Column | Type |
|--------|------|
| id | TEXT |
| grant_types | TEXT |
| redirect_uris | TEXT |
| jwks | TEXT |
| aud | TEXT |
| status | TEXT (`active` \| `disabled`) |

Follow-on (not this phase): client = kind-`'service'`
identity + registration facet is a server-tier
client-registration candidate (would retire the standalone
clients noun).

## Messages (schema of record)

The append-only ledgers every pair-wired HTTP write appends
into. Seeded demo data forms pairs pre-tx (`formSeedPair`);
`EXPECTED_PAIR_COUNT` 1506 / bootstrap 13 is absolute.
Global-spine (pass-through), NOT org-fenced at the store:
tenancy lives IN `uri_prefix`, enforced at the route gate
and the write-ownership fence
(`api/write-ownership-fence.ts` via
`resolveOwningOrganization`).

### requests

One row per stored canonical HTTP request message. The
message text IS the row; `uri_prefix` (retains its trailing
`/`) and `uri_id` (empty string for a collection request) are
addressing metadata, and `message_hash` is an index over the
sha256 digest (`shared/digest.ts` `sha256Hex`) of `message`
— never a second copy of its truth. `at` is pair ENVELOPE
metadata only, not a domain timestamp inside the message.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY — shared with the paired response |
| uri_prefix | TEXT | Collection URI, trailing `/` kept |
| uri_id | TEXT | Resource id, or `''` for a collection |
| at | TEXT | RFC-3339 Zulu — envelope metadata |
| requester_identity_id | TEXT | identity id of the requester |
| message_hash | TEXT | sha256 hex digest of `message` |
| message | TEXT | The canonical stored HTTP message |

Validator: `validateRequestEntity` (`api/validators.ts`).
Secondary indexes: `uri_prefix`, `uri_id`, `message_hash`
(`api/db.ts` `TABLE_INDEXES`).

### responses

The paired response: `id` equals the request's `id` (one
UUID per pair, never a foreign key of its own). `follows` /
`supersedes` are ABSENT KEYS when the write had no
predecessor — never `null`, never `''`. Absence-of-key IS
absence-of-event, and IndexedDB skips absent keys when
indexing, which is the partial-unique-index semantics the
two-PUT-classes design requires; a `null` value for either
is rejected by `validateResponseEntity` as invalid.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY — equals the request's id |
| uri_prefix | TEXT | Collection URI, trailing `/` kept |
| uri_id | TEXT | Resource id, or `''` for a collection |
| at | TEXT | RFC-3339 Zulu — envelope metadata |
| status | INTEGER | HTTP status, 100..599 |
| etag | TEXT | The response's ETag |
| message_hash | TEXT | sha256 hex digest of `message` |
| message | TEXT | The canonical stored HTTP message |
| follows | TEXT | ABSENT unless this follows a prior pair |
| supersedes | TEXT | ABSENT unless this supersedes a pair |

Validator: `validateResponseEntity` (`api/validators.ts`).
Secondary indexes: `uri_prefix`, `uri_id`, and the unique
`follows` index (`api/db.ts` `TABLE_INDEXES`).

## Derived document families (no table)

Every product family is pair-plane only. The template is
**flow tags** — the first family that never had a backing
table:

### Flow tags (pair-plane only, no table)

`flows/:id/tags/:name` (Phase 14 Task 9) is the FIRST
document family with no backing table at all: PUT, GET, and
DELETE all touch only `requests`/`responses`, addressed at
`flows/<flow-id>/tags/<name>/`. A tag body carries exactly
one field, `flow_response_id` — the pinned `id` of one of the
flow's own `flows/:id` document-pair responses — so the tag
survives every later save of the flow it names (GET replays
the tag's own stored body, never re-derives against the
flow's current head). DELETE is a marked tombstone: a
DELETE-shaped response pair excluded from the head by
`deriveDocumentsAt`, exactly like every other document
family's DELETE — there is no row to splice, since there was
never a row to begin with.

Post-Phase-Final, ideas, projects, flows (including
graphDelta/revivals for graph lifecycle), work orders,
records, objectives, memberships, invitations, identities,
organizations, role grants, and the rest share this
no-table posture: each is a URI-addressed pair family with
a derive module (`api/derive-*.ts`) and no row store.

## State alphabets (derive layer)

Lifecycle vocabularies live on the **derive layer**, not a
`states` table (retired at Phase Final Stage B). The
conceptual alphabets remain in `api/types.ts`
(`MEMBER_STATES`, `IDEA_STATES`, `PROJECT_STATES`, …) and
are asserted by validators and derive cores. Reads:

- `GET /states` → `deriveStates` (five-source union:
  trio families, members, work-order lifecycle, flow
  graph, invitations)
- `GET /entity-states/:id/history` → `deriveStatesFor`
- `GET /states/:id/field-values` →
  `stateFieldValuesForStateEvent` (transition-fold
  single-source)

Every verb on `/states/:id` is router 404. Lifecycle
writes ride document-trio PUTs
(ideas/projects/records/flows/objectives/members) and
named ops (work-order create/claim/transition/release,
invitations).

Domain notes (vocabulary, not storage):

- **Members** — `'active' | 'pending' | 'archived'`
- **Ideas** — `'active' | 'in_review' | 'approved' |
  'promoted' | 'sent_back' | 'archived' | 'deleted'`
- **Projects** — the project alphabet in `PROJECT_STATES`
- **Work orders** — open-ended transitions (state = any
  graph node id, a base62 token) plus the closed claim
  alphabet (`'claimed'`, `'claim_released'`,
  `'claim_expired'`)
- **Flow graph** — node/edge removal and revival ride
  graphDelta / revivals in the flow document pair body
  (`deriveFlowGraphStates`); `'deleted'` removes,
  `'restored'` revives under the `(at, id)` total order.
  A fresh node/edge is born live and event-free.

`adapters/state-events.ts` holds the READ helpers only
(latest-per-id reduction, claim/transition projections,
per-family state-detail getters). Lifecycle writes no
longer funnel through a shared state-event op — each
family's document PUT or named op owns its own pair
formation.

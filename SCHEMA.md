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
`requests` / `responses` pair tables. The tables are listed
in `api/db.ts` as `TABLE_NAMES` (the authoritative count:
two). Each table is an IndexedDB object store
(`keyPath: 'id'`) in the `fusion-ai` database; the simulated
backends key the same tables as `fusion-ai:tableName`. All
rows have a text `id` primary key. Column types: TEXT
(string), INTEGER (number), REAL (float), BOOLEAN (see
below). Document-body composites (arrays and objects —
`strengths`, `team_dimensions`, `options`, `constraints`,
`graph`, `graphDelta`, `revivals`, `flow_graph`) store as
native nested JSON on the wire and in the pair body, never
as JSON-encoded strings. All columns are NOT NULL —
entity validation on creation ensures every field is
present.

Every domain family (ideas, projects, flows, work orders,
record-types / attributes / instances, objectives, roster,
identity spine, organizations, states, field values, flow
tags, …) is a **derivation** over message pairs at a URI
address. There is no per-entity table and no dual-write
half. Reads reassemble documents and lifecycle state from
the pair plane (`api/derive-*.ts`); writes append pairs
only (`tx` lists `['requests','responses']` on every
pair-wired path).

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

## Messages (schema of record)

The append-only ledgers every pair-wired HTTP write appends
into. Seeded demo data forms pairs pre-tx (`formSeedPair`);
`EXPECTED_PAIR_COUNT` 1494 / bootstrap 12 is absolute.
Global-spine (pass-through), NOT org-fenced at the store:
tenancy lives IN `uri_prefix`, enforced at the route gate
and the write authorizer
(`api/write-authorizer.ts` via
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
| etag | TEXT | Body content-address (sha256 of message) |
| message_hash | TEXT | sha256 hex digest of `message` |
| message | TEXT | The canonical stored HTTP message |
| follows | TEXT | ABSENT unless this follows a prior pair |
| supersedes | TEXT | ABSENT unless this supersedes a pair |

`responses.etag` is storage-only content-addressing —
**unrelated to the wire ETag** on instance
GET/PUT/PATCH (wire ETag = head pair response id; see
API.md §5.4.1 / §5.20). Implementers must not conflate
them.

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
record-types / attributes / instances, objectives,
memberships, invitations, identities, organizations, role
grants, and the rest share this no-table posture: each is
a URI-addressed pair family with a derive module
(`api/derive-*.ts`) and no row store.

### Record types, attributes & instances (pair-plane only)

Org-nested wire = storage (no dual-wire flat `/records`):

```text
/organizations/:organization-id/record-types/
  :record-type-id
    /history
    /attributes/:attribute-id
    /instances/:instance-id
      /history
```

- **record-types** — `'trio'` SIMPLE document family;
  lifecycle alphabet active/archived/deleted; admin
  mutation; type DELETE RESTRICT on live instances or
  `flows/:id/records` joins. Derive:
  `api/derive-record-types.ts`.
- **attributes** — nested under type; `'stateless'`
  SIMPLE PUT; body drops parent `record_id` (type id
  rides the uri prefix); ACL arrays on the document;
  RESTRICT DELETE (WO frozen graph + live flow-graph +
  state field values + live instance heads). Flat
  `/record-attributes` RETIRED.
- **instances** — full-state revision heads store
  `{ values: [{ attribute_id, value }] }`. Wire PATCH
  is **operation-plane** (`set` / `clear`); the server
  merges pre-tx and appends a full-state document pair.
  GET is one head read. PUT create-only (409 if address
  spent, including tombstone). PATCH If-Match (428 /
  412). DELETE tombstone-wins. Value-revision history
  at `.../instances/:id/history` is **not** a lifecycle-
  trio clone. Derive:
  `api/derive-record-instances.ts`. Wire ETag = head
  response id (unrelated to `responses.etag` column).

Snapshot import rejects retired flat prefixes
`/organizations/:org/records/` and
`/organizations/:org/record-attributes/` (anchored so
`flows/:id/records` join pairs pass) via
`RETIRED_URI_PREFIX_PATTERNS` on both server
(`api/snapshot-validator.ts`) and client
(`scanForRetiredKeys`).

### Client registration (pair-plane only, no table)

`identities/:id/registration` (clients elimination) is the
client-config facet of a kind-`'service'` identity — the
family that replaced the `clients` table. A singleton
document at the identity's own nested address (uriId `''`,
the `/pii` address shape) that Supersedes-chains like
`/credentials` — NOT a hard-delete zone. Body:
`{ grant_types, redirect_uris, jwks, aud, status }`;
`status` (`active` | `disabled`) rides the document, so the
schema's last mutable lifecycle column is gone with the
table. Register, rotate-JWKS, and disable are all the same
PUT-overwrite; every revision is an appended pair —
registration history for free. DELETE is a marked tombstone
= deregistration. Admin-realm writes; kind-`'service'` gate
(absent identity 404 / person 400 / non-admin 403 / unauth
401-before-404). `grantClientCredentials` derives it
pre-token via `deriveClientRegistration`
(`api/derive-identity-spine.ts`); `act.sub` carries the
acting client on authorization_code redemption.

## State alphabets (derive layer)

Lifecycle vocabularies live on the **derive layer**, not a
`states` table (retired at Phase Final Stage B). The
conceptual alphabets remain in `api/types.ts`
(`MEMBER_STATES`, `IDEA_STATES`, `PROJECT_STATES`, …) and
are asserted by validators and derive cores.

### History read map (nine lifecycle + one value-history)

Wire order is `(at, id)` **DESC** (index 0 = current) on
every history route. See API.md §2.10 for full fence and
wire detail.

1. `GET ideas/:id/history` —
   `deriveIdeaStateHistory` → `StateEntity[]`; empty →
   403 foreign / 404 absent
2. `GET projects/:id/history` —
   `deriveProjectStateHistory` → same
3. `GET organizations/:org/record-types/:id/history` —
   `deriveRecordStateHistory` → same (flat
   `records/:id/history` RETIRED)
4. `GET flows/:id/history` —
   `deriveFlowStateHistory` → same
5. `GET objectives/:id/history` —
   `deriveObjectiveStateHistory` → same
6. `GET members/:id/history` —
   `deriveMemberStates` filter → `StateEntity[]`;
   global miss → 404
7. `GET work-orders/:id/history` —
   `workOrderHistoryFor` → WO history + inline
   `field_values`; empty → 403 / 404
8. `GET work-orders/history` —
   `deriveWorkOrderHistories` → same WO shape;
   always 200
9. `GET objectives/history` —
   `deriveObjectiveHistories` → `StateEntity[]`;
   always 200
10. (value-history, not lifecycle)
    `GET .../record-types/:type/instances/:id/history`
    → `{ at, etag, values }[]` by current read ACL

Org-nested per-id empty → `missedReadError` (foreign
403 / absent 404 via `resolveOwningOrganization`).
Members are global (`EntityNotFoundError` → 404).
Work-order `field_values` fold inline from transition
pair bodies (`TransitionFieldValueEntity {id,
attribute_id, value}`); claim/birth/release rows carry
`[]`. No separate field-values GET — RESTRICT still
uses `stateFieldValuesFrom` /
`deriveStateFieldValueReferrers` and
`stateEventVisibilityFor`.

**Head-state trio.** Ideas / projects / record-types /
objectives / members GET rows embed `state`,
`state_at`, `state_event_id` from the lifecycle-current
event. Flows skip the embed; work-orders stay
`'stateless'`; instances carry full-state `values`.

The bulk lifecycle collection, bare event-append
address, per-entity current-state alias, nested
field-values collection/write, and flat
`/records` / `/record-attributes` are RETIRED (router
404). Lifecycle writes ride document-trio PUTs
(ideas/projects/record-types/flows/objectives/members)
and named ops (work-order create/claim/transition/
release, invitations). Instance value writes ride PUT
genesis / PATCH If-Match / DELETE tombstone.

Domain notes (vocabulary, not storage):

- **Members** — `'active' | 'pending' | 'archived'`
- **Ideas** — `'active' | 'in_review' | 'approved' |
  'promoted' | 'sent_back' | 'archived' | 'deleted'`
- **Projects** — the project alphabet in
  `PROJECT_STATES`
- **Work orders** — open-ended transitions (state =
  any graph node id, a base62 token) plus the closed
  claim alphabet (`'claimed'`, `'claim_released'`,
  `'claim_expired'`)
- **Flow graph** — live graph rides the flow document
  body's `graph` field as a native nested object
  (nodes/edges in the stored tongue: `positionX`,
  `fromNodeId`, `attribute_id`, `isRequired`, …);
  `graphDelta` / `revivals` are native write-side
  sidecars (RESTRICT bindings via
  `flowGraphBindingsFromPairs`). A work order freezes
  `flow_graph` as the same native shape plus
  `name` / `lockTimeout`. A fresh node/edge is born
  live on the next document head.

Client history reads live in
`adapters/work-orders-queries.ts`
(`getWorkOrderHistory` / `getWorkOrderHistories`) and
`adapters/objectives.ts` (`getObjectiveHistories`).
Trio-family head state rides the entity row fields —
there is no `state-events` adapter. Lifecycle writes
no longer funnel through a shared event-append op —
each family's document PUT or named op owns its own
pair formation.

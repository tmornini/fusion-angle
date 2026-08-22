# Database Schema

> **Note on `SCHEMA.svg`:** the picture of columns, keys,
> and indexes is generated from the schema of record
> (`api/db.ts` + `api/types.ts` + `api/schema-postgres.ts`)
> by `./generate-schema-svg`; `./validate` runs it with
> `--check` and fails on drift, so it never goes stale.
> Regenerate with `./generate-schema-svg` after a schema
> change.

## Schema of record

Phase Final deleted the entity row plane. The schema of
record is the **message plane** — the append-only
`pairs` table. The table is listed in `api/db.ts` as
`TABLE_NAMES` (the authoritative count: one). The table
is `pairs` in Postgres
(`api/schema-postgres.ts`); the memory backend holds the
same rows in an in-process Map keyed by table name.
Column types match `PairEntity`. TypeScript views `id`
and `operation_id` as identifier strings; Postgres
stores those columns as uuid. `method` is TEXT.
Postgres stores `request` and `response` as BYTEA
Latin-1. No `uri_id`-only index.
Document-body composites (arrays and objects —
`strengths`, `team_dimensions`, `options`,
`constraints`, `graph`, `graphDelta`, `revivals`,
`flow_graph`) store as native nested JSON on the wire and
in the pair body, never as JSON-encoded strings. Required
columns are NOT NULL — entity validation on creation
ensures every required field is present.
`serializeValue` (`api/storage-serialize.ts`) rejects
null/undefined on present keys only.

Every domain family (ideas, projects, flows, work orders,
record-types / attributes / instances, objectives, roster,
identity spine, organizations, states, field values, flow
tags, …) is a **derivation** over message pairs at a URI
address. There is no per-entity table and no dual-write
half. Reads reassemble documents and lifecycle state from
the pair plane (`api/derive-*.ts`); writes append pairs
only (`tx` lists `MESSAGE_TABLES` on every
pair-wired path).

**Timestamp width:** every persisted timestamp is RFC-3339
zulu at EXACTLY six fraction digits (`…T12:00:00.000000Z`)
— the one width the mints emit and the append-only ledgers
sort (lexical = chronological holds only within one width).
The validation gate rejects any other width. Recovery
is operator re-seed via `./postgres-seed`.

**Boolean storage:** domain / document-body booleans are
typed as `boolean` in TypeScript (`api/types.ts`) and
persist NATIVELY in pair JSON — there is no `0`|`1`
transform. The one storage-edge transform is the NOT-NULL
gate in `api/storage-serialize.ts` (`serializeValue`),
which every backend applies so a write with a
null/undefined field throws rather than persisting.

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
physical hard-delete is PII erasure
(`identities/:id/pii` via `replacePiiSlot` — pair splice +
bodyless erasure tombstone), which remains a real splice
of the message plane. Credentials and registration stay
append-only / tombstone; they never enter the hard-delete
zone. History tables and the old `EntityStore` /
`StateStore` tombstone filter are GONE (Phase Final Task 5).
The `states/:id` event-append address is retired with every
verb on it — router 404.

**The `'system'` member:** `SYSTEM_MEMBER_ID` is
`NIL_IDENTIFIER` in `api/types.ts`. It is a derived
directory entry with kind `'system'` and no human/AI
detail, seeded by both `postMockDataLoad` and
`postBootstrap`. Its corresponding identity carries
`kind = 'service'` — the platform itself as a
non-person principal. State events with no specific user
actor reference it. It is a pure event-author:
`getMemberMap` resolves it for authorship display, but the
`getMembers` roster — and every list, picker, and detail
view — omits it.

## Messages (schema of record)

The append-only ledger every pair-wired HTTP write appends
into. Seeded demo data forms pairs pre-tx (`formSeedPair`);
`EXPECTED_PAIR_COUNT` 1448 / bootstrap 8 is absolute.
Global-spine (pass-through), NOT org-fenced at the store:
tenancy lives IN `uri_collection`, enforced at the route gate
and the write authorizer
(`api/write-authorizer.ts` via
`resolveGlobalOwner`, which may fall back to
`resolveOwningOrganization`).

### pairs

One row per stored canonical HTTP request message and its
paired response. The request and response texts ARE the
row; `uri_collection` (retains its trailing `/`) and
`uri_id` (empty string for a collection request) are
addressing metadata, and `request_hash` is an index over
the sha256 digest (`shared/digest.ts` `sha256HexOfBytes`)
of the Latin-1 wire octets of `request` — never a second
copy of its truth. `request_at` is pair ENVELOPE metadata
only, not a domain timestamp inside the message.
`response_at` is the paired response's envelope time; it
is not required to equal `request_at`.
`requester_identity_id` is the identity id of the
requester. `method` is the HTTP method (`^[A-Z]+$`); the
ledger stores no GET rows. `operation_id` is an
identifier on the pair. `id` is the pair locator (wire
`Response-ID`). No `etag`, `status`, `message_hash`,
`follows`, or `supersedes` column.

Columns, keys, and indexes live in `SCHEMA.svg`.

Public PUT/PATCH/POST/DELETE send header `Operation-ID`
(identifier). Missing or malformed → 400. The server
never mints this header for a public write. GET may
send it; it is ignored. Seed `formSeedPair` mints one
id per envelope and copies it onto inner PUTs.

`pairs.version` is the document revision token
(unconditional / genesis: sha256 of response body octets;
later: sha256 of body octets || matched 64-hex). Wire
`ETag` / `If-Match` are that same token for documents.
Instance GET advertises `documentVersion` of the
projected body (not stored). Pair `id` stays
`Response-ID` (locator). DELETE `version` is sha256 of
the stored 204 wire (`Date:` omitted). No `Version:`
header.

Write HTTP responses add `Operation-ID` at send time
from this column. It is not stored on the GET-shaped
response blob.

Validator: `validatePairEntity` (`api/validators.ts`).

## Derived document families (no table)

Every product family is pair-plane only. The template is
**flow tags** — the first family that never had a backing
table:

### Flow tags (pair-plane only, no table)

`flows/:id/tags/:name` (Phase 14 Task 9) is the FIRST
document family with no backing table at all: PUT, GET, and
DELETE all touch only `pairs`, addressed at
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

### Work-order instance binding (pair-plane only, no table)

`work-orders/:id/binding` is a create-only PUT family with
no backing table: first `PUT` appends a binding pair at
`/work-orders/:id/binding/` (201). Rebind is 409. POST is
405. The CURRENT bind derives from the WO's own binding
op-pair prefix — latest `(at, id)` wins (claim-op derive
precedent). WO GET embeds `instance_id` +
`record_type_id` at read time (never a document field).
Transition-driven value writes append instance
**revision** pairs at the instance's own canonical
address
(`organizations/:org/record-types/:type/instances/:id`) —
the bind itself writes no instance revision. See
API.md §3.34 / §3.19.

Post-Phase-Final, ideas, projects, flows (including
graphDelta/revivals for graph lifecycle), work orders,
record-types / attributes / instances, objectives,
memberships, invitations, identities, organizations, and
the rest share this no-table posture: each is a
URI-addressed pair family with a derive module
(`api/derive-*.ts`) and no row store. Roles bake from
membership `type` at mint; the role-grants family is
RETIRED (no live pair family and no route).

### Record types, attributes & instances (pair-plane only)

Org-nested wire = storage (no dual-wire flat `/records`):

```text
/organizations/:organization-id/record-types/
  :record-type-id
    /versions
    /attributes/:attribute-id
    /instances/:instance-id
      /versions
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
  GET is one head read. Public PUT is **405**; PATCH
  creates and updates (If-Match 428 / 412 on a live
  head). Same-body PATCH still appends 201. DELETE
  tombstone-wins. Value-revision history at
  `.../instances/:id/versions` is **not** a lifecycle-
  trio clone. Derive:
  `api/derive-record-instances.ts`. Wire ETag is
  `documentVersion` of the projected body; stored
  `version` is `documentVersion` of the full stored
  body. The two differ by definition.

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
(`IDEA_STATES`, `PROJECT_STATES`, …) and are
asserted by validators and derive cores.

### History read map (seven lifecycle + one value-history)

Wire order is `(at, id)` **DESC** (index 0 = current) on
every history route. Trio-family and instance paths
are `/versions`; work-orders stay `/history`. See
API.md §2.10 for full fence and wire detail.

1. `GET ideas/:id/versions` —
   `entityOf` snapshots (domain `state`); empty →
   403 foreign / 404 absent
2. `GET projects/:id/versions` —
   same
3. `GET organizations/:org/record-types/:id/versions` —
   same (flat `records/:id/history` RETIRED)
4. `GET flows/:id/versions` —
   `deriveFlowStateHistory` → `StateEntity[]`
5. `GET organizations/:id/objectives/:id/versions/` —
   `entityOf` snapshots (domain `state`); empty →
   403 foreign / 404 absent
6. `GET members/:id/versions` —
   RETIRED (router 404). `deriveMemberStates` is gone.
   Seat GET is
   `{ id, organization_id, identity_id, type, at }`
7. `GET organizations/:id/work-orders/:id/history` —
   `workOrderHistoryFor` → WO history + inline
   `field_values`; empty → 403 / 404
8. (value-history, not lifecycle)
    `GET .../record-types/:type/instances/:id/versions`
    → `{ at, etag, values }[]` by current read ACL

Org-nested per-id empty → `missedReadError` (foreign
403 / absent 404 via `resolveOwningOrganization`).
Work-order `field_values` fold inline from transition
pair bodies (`TransitionFieldValueEntity {id,
attribute_id, value}`); claim/birth/release rows carry
`[]`. No separate field-values GET — RESTRICT still
uses `stateFieldValuesFrom` /
`deriveStateFieldValueReferrers` and
`stateEventVisibilityFor`.

**Head-state trio.** Ideas / projects / record-types /
objectives GET rows keep domain `state` and do not
embed `state_at` / `state_event_id`. Member seats
GET `{ id, organization_id, identity_id, type, at }`.
Flows keep `StateEntity[]` on the versions list;
work-orders stay `'stateless'`; instances carry
full-state `values`.

The bulk lifecycle collection, bare event-append
address, per-entity current-state alias, nested
field-values collection/write, and flat
`/records` / `/record-attributes` are RETIRED (router
404). Lifecycle writes ride document-trio PUTs
(ideas/projects/record-types/flows/objectives/members)
and named ops (work-order create / claim PUT /
transition POST / bind PUT, invitations). Release
is DELETE on the claim address. Instance public
PUT is 405; values ride PATCH / DELETE tombstone.

Domain notes (vocabulary, not storage):

- **Ideas** — `'active' | 'in_review' | 'approved' |
  'promoted' | 'sent_back' | 'archived' | 'deleted'`
- **Projects** — the project alphabet in
  `PROJECT_STATES`
- **Work orders** — open-ended transitions (state =
  any graph node id, an identifier) plus the closed
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
  live on the next document head. Write-path graph
  law: `memberIds` name person members / identities
  only (an `/ai-members` id is 400). `agentIds` name
  live `/ai-agents` documents. Empty `agentIds` are
  omitted from stored JSON.

Client history reads live in
`adapters/work-orders-queries.ts`
(`getWorkOrderHistory` / `getWorkOrderHistories`) and
`adapters/objectives.ts` (`getObjectiveHistories`).
Trio-family head state rides the entity row fields —
there is no `state-events` adapter. Lifecycle writes
no longer funnel through a shared event-append op —
each family's document PUT or named op owns its own
pair formation.

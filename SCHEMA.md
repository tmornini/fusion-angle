# Database Schema

> **Note on `SCHEMA.svg`:** the ERD is generated from the
> schema of record (`api/db.ts` + `api/types.ts`) by
> `./generate-schema-svg`; `./validate` runs it with
> `--check` and fails on drift, so it never goes stale.
> Regenerate with `./generate-schema-svg` after a schema
> change.

25 tables stored in localStorage as JSON arrays, listed in
`api/db.ts` as `TABLE_NAMES`. Each table is keyed as
`fusion-ai:tableName`. All rows have a text `id` primary
key. Column types: TEXT (string), INTEGER (number), REAL
(float), BOOLEAN (see below). JSON columns store stringified
arrays or objects. All columns are NOT NULL — entity
validation on creation ensures every field is present.

**Boolean storage:** BOOLEAN columns are typed as `boolean`
in TypeScript (`api/types.ts`) but persisted as INTEGER
`0`|`1` by `db-localstorage.ts::serializeValue` on write and
deserialized back on read. The in-memory and API-boundary
shape is always a real boolean; the `0`|`1` form never
escapes the storage layer.

**Timestamp convention:** TEXT columns storing timestamps
use RFC-3339 Zulu format (e.g.,
`2024-01-15T09:30:00.000000Z`). Temporal facts belong in
event tables — the absence of a row is the absence of the
event.

**State and deletion:** Entity rows themselves never carry
state columns (`status`, `readiness`, `deleted_at`,
`deprecated_at`, etc. are all retired). Every entity
lifecycle change is recorded as one row in the unified
`states` event log. The latest event by `at` (with `>=`
tiebreak on same-millisecond writes) is the entity's
current state. `'deleted'` is a state event value, not a
separate table. `EntityStore.getAll`/`getById` consult
`StateStore.deletedIds()` / `isDeleted(id)` to filter
currently-deleted rows; `EntityStore.delete(id)` is
retained for hard splice of relationship rows
(`state_field_values`, etc.) where lifecycle event log
overkill — the seam is "entity lifecycle = state event;
relationship dissolution = splice." History tables
(`flow_versions`) are exempt and hard-delete via row
removal.

**The `'system'` member:** `SYSTEM_MEMBER_ID = 'system'`
in `api/types.ts` is a `members` parent row with
`type = 'system'` and no detail row, seeded by both
`populateMockData` and `populateBootstrapData`. Its
corresponding `identity` row carries `kind = 'service'`
— the platform itself as a non-person principal. State
events with no specific user actor reference it. It is a
pure event-author: `getMemberMap` resolves it for
authorship display, but the `getMembers` roster — and
every list, picker, and detail view — omits it.

## Core

### members

The parent member table: one row per member holding the
shared identity and the `type` discriminant only. The
display name lives with the kind — `ai_members.name`,
`identity_pii.name` — or as the `SYSTEM_MEMBER_NAME`
constant. Kind-specific detail lives in `human_members` /
`ai_members`, keyed by the same id; a `'system'` member
is a parent row with no detail row. The terminal
lifecycle state is `'archived'`, recorded in the `states`
log.

| Column | Type |
|--------|------|
| id | TEXT |
| type | TEXT (`human` \| `ai` \| `system`) |

### human_members

Human org-profile detail, keyed by the shared member id.
Contact PII (name, email, phone, bio) lives in
`identity_pii`, not here; this row carries only the org
profile.

| Column | Type |
|--------|------|
| id | TEXT |
| title | TEXT |
| department | TEXT |
| strengths | TEXT (JSON array) |
| team_dimensions | TEXT (JSON object) |

### ai_members

AI detail, keyed by the shared member id. The AI's
display `name` lives here, not on the parent. All member
kinds share the `MEMBER_STATES` alphabet (`active`,
`pending`, `archived`), recorded in the `states` log.

`model` is a foreign key into the code-resident
provider-model catalog (`api/provider-models.ts`), not a
DB table; the gate validates membership. `skill_focus`
is free text, NOT NULL — empty is `''`, never null.

| Column | Type |
|--------|------|
| id | TEXT |
| name | TEXT |
| description | TEXT |
| skill_focus | TEXT |
| model | TEXT |

### identity

One row per principal in the system. The `id` is the
universal key: `member.id === identity.id`, always —
no separate join is needed. `kind` is the NATURE of
the principal: `person` (a human being) or `service`
(an automated agent, API client, or the platform
itself). `kind` is NOT a statement about sensitive
data — both kinds carry it: persons an
`identity_pii` row, services credentials in
`identity_credentials`.

| Column | Type |
|--------|------|
| id | TEXT |
| kind | TEXT (`person` \| `service`) |

### identity_pii

Person-PII facet, keyed by the shared identity id.
Services have no row here; their secrets live in
`identity_credentials`. All columns are NOT NULL —
erased PII is the ABSENCE of the row, not a null
column. Erasure is a hard splice (`EntityStore
.delete`): the identity row, the member row, and
every `member_id` reference survive unchanged.

| Column | Type |
|--------|------|
| id | TEXT |
| name | TEXT |
| email | TEXT |
| phone | TEXT |
| bio | TEXT |

### identity_credentials

Append-only credential lifecycle ledger
(`HistoryEntityStore`). One row per event; current
validity is the latest event per
`(identity_id, kind)`. `kind` is `password`
(person interactive secret) or `client_secret`
(service shared secret). `status` is `set`,
`rotated`, or `revoked`. `at` is the RFC-3339 Zulu
moment of the event.

Revocation is a NEW `'revoked'` event — never a
splice. This is the OPPOSITE discipline from
`identity_pii` (which erases by splice). `secret`
is opaque material stored UNHASHED at this seam;
hashing, verification, and OAuth infrastructure are
SP-5. SP-1 enforces non-leakage on read.

| Column | Type |
|--------|------|
| id | TEXT |
| identity_id | TEXT (FK → identities) |
| kind | TEXT (`password` \| `client_secret`) |
| status | TEXT (`set` \| `rotated` \| `revoked`) |
| secret | TEXT |
| at | TEXT |

### identity_token_revocations

Append-only "log-out-everywhere" ledger
(`HistoryEntityStore`). Each row records a moment
after which every access token for that identity is
revoked. The effective revoked-before stamp is the
LATEST `at` per `identity_id` (derive from the
ledger — `latestRevocationAt` in
`api/access-token.ts` is its single home). The token
gate (`handleRequest`) rejects a Bearer whose `iat`
precedes that stamp. A logout is a NEW row — never a
mutated column; append-and-max-reduce is commutative,
so a concurrent cross-tab append can only DELAY a
logout, never un-revoke. `at` is validated as a
well-formed RFC-3339 Zulu timestamp at the storage
gate (the revoked-before reduce trusts it parses).

Logging an identity out everywhere also revokes the
ACTOR's own in-flight token (its `iat` predates the
new stamp) — a caller must re-establish a session
before any further write.

| Column | Type |
|--------|------|
| id | TEXT |
| identity_id | TEXT (FK → identities) |
| at | TEXT |

### role_grants

Append-only role-assignment ledger
(`HistoryEntityStore`). One row per grant or revoke;
the roles an identity CURRENTLY holds = the latest
action per `(identity_id, role)` — a `granted` with
no later `revoked`. Append-only: a revoke is a NEW
`revoked` row, never a splice. `by_member_id` is the
actor (== their identity id). Authorization derives
roles from THIS ledger fresh at the gate
(`isPermitted` in `api/authorization.ts`) — never
from a token claim, so a revoke takes effect on the
next request. `at` is the RFC-3339 zulu moment,
validated at the storage gate.

| Column | Type |
|--------|------|
| id | TEXT |
| identity_id | TEXT (FK → identities) |
| role | TEXT |
| action | TEXT (`granted` \| `revoked`) |
| by_member_id | TEXT (FK → members) |
| at | TEXT |

### identity_tokens

Append-only token-lifecycle ledger
(`HistoryEntityStore`). One row per jti event; a
token's current validity = the latest action for its
`jti`. `chain_id` groups a refresh-rotation lineage:
an issue creates a root (`parent_jti` = `''`, a
self-disclosing empty); each rotation appends
`rotated` for the old jti and `issued` for the new,
sharing the `chain_id`. Presenting a rotated-away or
`revoked` jti is replay → the whole chain is revoked.
Distinct from `identity_token_revocations` (coarse
per-identity log-out-everywhere); this is per-jti and
per-chain, checked at the gate. `at` is the RFC-3339
zulu moment, validated at the storage gate.

| Column | Type |
|--------|------|
| id | TEXT |
| jti | TEXT |
| identity_id | TEXT (FK → identities) |
| action | TEXT (`issued` \| `rotated` \| `revoked`) |
| chain_id | TEXT |
| parent_jti | TEXT |
| at | TEXT |

### clients

OAuth client registry (`EntityStore`) — the websites
built by us and others. Mutable config of record:
redirect URIs change, JWKS rotate, a client is
disabled. `grant_types` and `redirect_uris` are
space-delimited (OAuth convention); `jwks` is the
client's JSON Web Key Set as a JSON string, used to
verify `private_key_jwt` assertions (real JWS verify
is a server-tier seam); `aud` is the origin a token
is minted for.

| Column | Type |
|--------|------|
| id | TEXT |
| grant_types | TEXT |
| redirect_uris | TEXT |
| jwks | TEXT |
| aud | TEXT |
| status | TEXT (`active` \| `disabled`) |

### identity_providers

Append-only ledger of external-IdP links
(`HistoryEntityStore`). One row per link/unlink; a link
is current = its latest action per
`(identity_id, provider)` is `linked`. `provider` names
the IdP; `provider_subject` is the identity's id at that
IdP. An unlink is a NEW `unlinked` row, never a splice.
`at` is the RFC-3339 zulu moment, validated at the
storage gate.

| Column | Type |
|--------|------|
| id | TEXT |
| identity_id | TEXT (FK → identities) |
| provider | TEXT |
| provider_subject | TEXT |
| action | TEXT (`linked` \| `unlinked`) |
| at | TEXT |

### authorization_codes

Append-only ledger of authorization-code lifecycle
(`HistoryEntityStore`). One row per issue/consume; a
code's current status = the latest event for its
`code`. The row `id` is a generated event id; `code` is
the opaque single-use value bound to (identity, client).
A consume is a NEW `consumed` row; re-presenting a code
whose latest status is `consumed` (or unknown) is
replay. `at` is the RFC-3339 zulu moment, validated at
the storage gate.

| Column | Type |
|--------|------|
| id | TEXT |
| code | TEXT |
| identity_id | TEXT (FK → identities) |
| client_id | TEXT (FK → clients) |
| status | TEXT (`issued` \| `consumed`) |
| at | TEXT |

### ideas

| Column | Type |
|--------|------|
| id | TEXT |
| title | TEXT |
| position | REAL |
| problem_statement | TEXT |
| target_users | TEXT |
| proposed_solution | TEXT |
| expected_outcome | TEXT |
| success_metrics | TEXT |

Lifecycle state lives in `states` (alphabet
`IDEA_STATES`): 7 single-dimension values — `active`,
`in-review`, `approved`, `promoted`, `sent-back`,
`archived`, `deleted`. Readiness is derived from the
required-field set (`title`, `problem_statement`,
`proposed_solution`, `expected_outcome`) at domain-
object instantiation, not stored.

### projects

| Column | Type |
|--------|------|
| id | TEXT |
| title | TEXT |
| description | TEXT |
| progress | INTEGER |
| start_date | TEXT |
| target_end_date | TEXT |
| estimated_cost | INTEGER |
| actual_cost | INTEGER |
| position | REAL |

Lifecycle state lives in `states` (alphabet
`PROJECT_STATES`): `submitted`, `under-review`,
`sent-back`, `approved`, `declined`, `archived`,
`deleted`.

## Tools

### flows

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| name | TEXT | |
| is_locked | BOOLEAN | Default false |
| is_auto_layout | BOOLEAN | Default true |
| is_auto_fit | BOOLEAN | Default true |
| lock_timeout | INTEGER | Seconds (default 28800 = 8h) |
| graph | TEXT | JSON document (see below) |

Lifecycle state lives in `states` (alphabet
`FLOW_STATES`): `active`, `archived`, `deleted`,
`updated`. The first event records creation; each
content-change mutation appends an `updated`
event. Creation and last-update moments are the
head and tail of the entity's event sequence —
the retired `created_at` / `updated_at` columns
are now derived from the log.

The `graph` column stores the entire flow definition as a
JSON document:

```json
{
  "nodes": [{
    "id": "...",
    "name": "...",
    "positionX": 0,
    "positionY": 0,
    "isCreate": false,
    "isArchive": false,
    "memberIds": ["..."],
    "attributes": [{
      "attribute_id": "...",
      "mode": "editable",
      "isRequired": true
    }]
  }],
  "edges": [{
    "id": "...",
    "name": "...",
    "fromNodeId": "...",
    "toNodeId": "..."
  }]
}
```

`isCreate` / `isArchive` are graph topology markers, not
state values: they identify the special start/end nodes of
the flow. A work order's *state* at a node is recorded as
that node's id (a base62 token) in the `states` log.

`memberIds` is the set of MemberId values that may operate
on the node — zero or more, drawn from the human and AI
members (a unified MemberId space rooted in the `members`
parent table; see `adapters/members-union.ts`).

`attributes` is the per-node attribute reference list. Each
entry points at a `record_attributes.id`; absence from the
list means hidden. `mode` is `'editable'` or `'readonly'`.
Bind the flow to a Record via `flow_records` to populate the
attribute pool.

## Records

### records

A Record is a named data shape. Attributes belong to one
Record; flows bind to a Record via `flow_records`.
Lifecycle state lives in `states` (alphabet
`RECORD_STATES`: `active`, `archived`, `deleted`).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| name | TEXT | non-empty |
| description | TEXT | empty string allowed |
| position | REAL | Display order, ascending |

### record_attributes

One row per attribute of a Record. The `field_id` column
on `state_field_values` references this `id` once the flow
the work order belongs to is bound to the parent Record.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| record_id | TEXT | FK → records |
| name | TEXT | non-empty; unique within record_id |
| attribute_type | TEXT | one of text, number, select, date, checkbox |
| sort_order | REAL | author-controlled ordering |
| options | TEXT | JSON string[] (select-typed only) |
| constraints | TEXT | JSON Constraint[] |

Constraints discriminator (`Constraint['kind']`):
`'regex'` (pattern, applies to text), `'range_min'` and
`'range_max'` (min/max strings, apply to number or date).
The runner parses per `attribute_type`; date bounds are
RFC-3339 Zulu strings (lexicographic order = chronologic
order).

### flow_records

Join table binding one flow to one Record. UNIQUE on
`flow_id` — a flow has at most one Record; a Record may
back many flows.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| flow_id | TEXT | FK → flows (UNIQUE) |
| record_id | TEXT | FK → records |
| at | TEXT | RFC-3339 Zulu — moment of the binding |

## Workbox

### work_orders

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY (UUID) |
| display_id | TEXT | 8-char hex SHA-256 |
| flow_graph | TEXT | JSON (WorkOrderFlowGraph) |
| position | REAL | Display order, ascending |

The `flow_graph` column stores a snapshot of the flow
definition at work order creation time. Same structure as
`flows.graph` plus flow-level metadata (`flowId`, `name`,
`lockTimeout`).

Transitions and claims are NOT separate tables — both
families of events live in the unified `states` log
addressed by `entity_id = work_order_id`. The states log
carries:

- **Transition events**: `state` = a graph node id (base62
  token). The latest non-claim event names the current
  node.
- **Claim events**: `state` ∈ {`'claimed'`,
  `'claim_released'`, `'claim_expired'`}. The latest
  claim-state event names the active claim, subject to
  `lockTimeout` arithmetic for implicit expiration.

The byte-level split between the two families is
unambiguous: claim strings are snake-cased English, node
ids are base62 tokens. `adapters/state-events.ts`
partitions them.

## Platform

### organizations

Tenant-root table — one row per organization. The SP-2 seed
plants a single default org (`id = '1'`, the `DEFAULT_ORG`
constant). Every org-owned entity carries a NOT-NULL
`organization_id` FK to this table; pure join tables derive
org from their parent, and the identity/auth spine stays
global.

| Column | Type |
|--------|------|
| id | TEXT |
| name | TEXT |
| domain | TEXT |
| next_billing | TEXT |
| seats | INTEGER |
| used_seats | INTEGER |
| projects_limit | INTEGER |
| ideas_limit | INTEGER |
| last_activity | TEXT |

## Relationships

### idea_submissions

| Column | Type |
|--------|------|
| id | TEXT |
| idea_id | TEXT (FK → ideas) |
| member_id | TEXT (FK → members) |
| at | TEXT |

### project_flows

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| project_id | TEXT | References projects |
| flow_id | TEXT | References flows |
| at | TEXT | RFC-3339 Zulu |

### flow_work_orders

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| flow_id | TEXT | References flows |
| work_order_id | TEXT | References work_orders |
| at | TEXT | RFC-3339 Zulu |

### flow_versions

History table. Captures a point-in-time snapshot of a
flow's editable state before each mutation. Per-flow cap
of 10; oldest rows are hard-deleted on overflow. Powers
persistent undo on the flows/detail page.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY (UUID) |
| flow_id | TEXT | References flows |
| name | TEXT | Snapshot of flows.name |
| is_locked | BOOLEAN | Snapshot of flows.is_locked |
| is_auto_layout | BOOLEAN | Snapshot of flows.is_auto_layout |
| is_auto_fit | BOOLEAN | Snapshot of flows.is_auto_fit |
| lock_timeout | INTEGER | Snapshot of flows.lock_timeout |
| graph | TEXT | Snapshot of flows.graph (JSON) |
| at | TEXT | RFC-3339 Zulu — capture time |

### objectives

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| position | REAL | Display order |

The objective's name and description live in
`objective_revisions` — an objective is a long-lived
identity whose human-facing text evolves over time.

### objective_revisions

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| objective_id | TEXT | References objectives |
| name | TEXT | Human-facing name at this revision |
| description | TEXT | Human-facing description |
| member_id | TEXT | FK → members (author) |
| at | TEXT | RFC-3339 Zulu |

The latest row per `objective_id` by `at` is the
current text.

### project_objective_baseline_scores

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| project_id | TEXT | References projects |
| objective_id | TEXT | References objectives |
| score | INTEGER | |
| member_id | TEXT | FK → members (scorer) |
| at | TEXT | RFC-3339 Zulu |

### project_objective_actual_scores

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| project_id | TEXT | References projects |
| objective_id | TEXT | References objectives |
| score | INTEGER | |
| member_id | TEXT | FK → members (scorer) |
| at | TEXT | RFC-3339 Zulu |

## State Event Log

### states

The unified append-only event log for every entity
lifecycle change in the system. One row, one fact.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY (base62 token) |
| entity_id | TEXT | Id of the entity this event concerns |
| state | TEXT | A value from the entity's state alphabet |
| member_id | TEXT | FK → members (actor) |
| at | TEXT | RFC-3339 Zulu — moment of the event |

The latest event on `entity_id` by `at` (with `>=`
tiebreak on same-millisecond writes — the deterministic
order the append-only log captures) is the entity's
current state. Reversal is a *new* event, not an edit of
the prior row.

State alphabets by entity kind:

- **ideas** — `IDEA_STATES` (7 values, lifecycle only;
  readiness is derived from required-field presence):
  `active`, `in-review`, `approved`, `promoted`,
  `sent-back`, `archived`, `deleted`
- **projects** — `PROJECT_STATES` (7 values):
  `submitted`, `under-review`, `sent-back`, `approved`,
  `declined`, `archived`, `deleted`
- **members** (all kinds share one alphabet) —
  `MEMBER_STATES` (3 values): `active`, `pending`,
  `archived`
- **records** — `RECORD_STATES` (3 values): `active`,
  `archived`, `deleted`
- **work orders** — open-ended transitions (state = any
  graph node id, a base62 token) plus the closed claim
  alphabet (`'claimed'`, `'claim_released'`,
  `'claim_expired'`)

`buildStateEventOp(ctx, entityId, state)` in
`adapters/state-events.ts` is the canonical helper for
state-event op construction; entity-lifecycle adapters
compose it into a `ctx.commit` batch with their sibling
entity-table op.

### state_field_values

Per-attribute values written when a state event records a
work-order transition. Each row pins the payload to its
parent event by `state_event_id` — the values live in
their own table, not as columns on the event row.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| state_event_id | TEXT | References states |
| field_id | TEXT | References record_attributes |
| value | TEXT | Value as a string |

The `field_id` column references `record_attributes.id`;
the column name predates the Records iteration and will
be renamed when a second non-Record consumer arrives.

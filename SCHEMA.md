# Database Schema

> **Note on `SCHEMA.svg`:** the SVG was generated from an
> earlier revision of this schema and is now stale. There is
> no `./generate-schema` script in the codebase; regenerate
> by hand or via the next tool the maintainer wires in.

19 tables stored in localStorage as JSON arrays, listed in
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

**The `'system'` worker:** `SYSTEM_WORKER_ID = 'system'`
in `api/types.ts` is a real `workers` row seeded by both
`populateMockData` and `populateBootstrapData`. State
events that have no specific user actor reference this
worker.

## Core

### workers

The humans table. The terminal lifecycle state is
`'archived'`, recorded in the `states` log.

| Column | Type |
|--------|------|
| id | TEXT |
| first_name | TEXT |
| last_name | TEXT |
| email | TEXT |
| title | TEXT |
| department | TEXT |
| strengths | TEXT (JSON array) |
| team_dimensions | TEXT (JSON object) |
| phone | TEXT |
| bio | TEXT |

### ai_workers

The AIs table. The terminal lifecycle state is
`'archived'`, recorded in the `states` log. Per
Commandment III (Uniformity), human and AI workers share
the `WORKER_STATES` alphabet (`active`, `pending`,
`archived`).

| Column | Type |
|--------|------|
| id | TEXT |
| name | TEXT |
| provider | TEXT |
| description | TEXT |
| auth_token | TEXT |
| created_at | TEXT |

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
`IDEA_STATES`): 9 values composite of former status +
readiness — `active:incomplete`, `active:needs-info`,
`active:ready`, `in-review`, `approved`, `promoted`,
`sent-back`, `archived`, `deleted`.

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
`sent-back`, `approved`, `declined`, `completed`,
`deleted`.

## Tools

### flows

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| name | TEXT | |
| description | TEXT | |
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
    "description": "...",
    "positionX": 0,
    "positionY": 0,
    "isCreate": false,
    "isArchive": false,
    "workerIds": ["..."],
    "fields": [{
      "id": "...",
      "name": "...",
      "fieldType": "text",
      "sortOrder": 1,
      "isRequired": true,
      "options": []
    }]
  }],
  "edges": [{
    "id": "...",
    "name": "...",
    "description": "...",
    "fromNodeId": "...",
    "toNodeId": "..."
  }]
}
```

`isCreate` / `isArchive` are graph topology markers, not
state values: they identify the special start/end nodes of
the flow. A work order's *state* at a node is recorded as
that node's id (a base62 token) in the `states` log.

`workerIds` is the set of WorkerId values that may operate
on the node — zero or more, drawn from either workers or
ai_workers (a unified WorkerId space; see
`adapters/workers-union.ts`).

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
`description`, `lockTimeout`).

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

### organization

Singleton table (single row, `id = '1'`).

| Column | Type |
|--------|------|
| id | TEXT |
| name | TEXT |
| domain | TEXT |
| plan | TEXT |
| plan_status | TEXT |
| next_billing | TEXT |
| seats | INTEGER |
| used_seats | INTEGER |
| projects_limit | INTEGER |
| ideas_limit | INTEGER |
| health_score | INTEGER |
| health_status | TEXT |
| last_activity | TEXT |

## Relationships

### idea_submissions

| Column | Type |
|--------|------|
| id | TEXT |
| idea_id | TEXT (FK → ideas) |
| worker_id | TEXT (FK → workers / ai_workers) |
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
| description | TEXT | Snapshot of flows.description |
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
| at | TEXT | RFC-3339 Zulu |

### project_objective_actual_scores

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| project_id | TEXT | References projects |
| objective_id | TEXT | References objectives |
| score | INTEGER | |
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
| worker_id | TEXT | FK → workers / ai_workers (actor) |
| at | TEXT | RFC-3339 Zulu — moment of the event |

The latest event on `entity_id` by `at` (with `>=`
tiebreak on same-millisecond writes — the deterministic
order the append-only log captures) is the entity's
current state. Reversal is a *new* event, not an edit of
the prior row.

State alphabets by entity kind:

- **ideas** — `IDEA_STATES` (9 values, composite):
  `active:incomplete`, `active:needs-info`,
  `active:ready`, `in-review`, `approved`, `promoted`,
  `sent-back`, `archived`, `deleted`
- **projects** — `PROJECT_STATES` (7 values):
  `submitted`, `under-review`, `sent-back`, `approved`,
  `declined`, `completed`, `deleted`
- **workers** (humans and AIs share one alphabet) —
  `WORKER_STATES` (3 values): `active`, `pending`,
  `archived`
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

Per-field values written when a state event records a
work-order transition. Each row pins the payload to its
parent event by `state_event_id` — Codd 1NF, a relation
belongs in a table not a column on the event row.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| state_event_id | TEXT | References states |
| field_id | TEXT | Node-field id from flow_graph |
| value | TEXT | Value as a string |

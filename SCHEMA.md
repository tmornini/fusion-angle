# Database Schema

18 tables stored in localStorage as JSON arrays. Each table is keyed as `fusion-ai:tableName`. All rows have a text `id` primary key. Column types: TEXT (string), INTEGER (number), REAL (float), BOOLEAN (see below). JSON columns store stringified arrays or objects. All columns are NOT NULL — entity validation on creation ensures every field is present.

**Boolean storage:** BOOLEAN columns are typed as `boolean` in TypeScript (`api/types.ts`) but persisted as INTEGER `0`|`1` by `db-localstorage.ts::serializeValue` on write and deserialized back on read. The in-memory and API-boundary shape is always a real boolean; the `0`|`1` form never escapes the storage layer.

**Duration convention:** All numeric duration fields are persisted in seconds. UI displays days via `durationInDays(seconds)` from `format.ts`.

**Timestamp convention:** TEXT columns storing timestamps use RFC-3339 Zulu format (e.g., `2024-01-15T09:30:00.000000Z`). Temporal facts (completedAt, deletedAt, etc.) belong in event tables — the absence of a row is the absence of the event.

## Core

### users

| Column | Type |
|--------|------|
| id | TEXT |
| first_name | TEXT |
| last_name | TEXT |
| email | TEXT |
| role | TEXT |
| department | TEXT |
| status | TEXT |
| availability | INTEGER |
| performance_score | INTEGER |
| projects_completed | INTEGER |
| current_projects | INTEGER |
| strengths | TEXT (JSON array) |
| team_dimensions | TEXT (JSON object) |
| phone | TEXT |
| bio | TEXT |
| last_active | TEXT |

### ideas

| Column | Type |
|--------|------|
| id | TEXT |
| title | TEXT |
| position | REAL |
| status | TEXT |
| problem_statement | TEXT |
| target_users | TEXT |
| proposed_solution | TEXT |
| expected_outcome | TEXT |
| success_metrics | TEXT |
| readiness | TEXT |
| risks | TEXT (JSON array) |
| assumptions | TEXT (JSON array) |
| alignments | TEXT (JSON array) |

### projects

| Column | Type |
|--------|------|
| id | TEXT |
| title | TEXT |
| description | TEXT |
| status | TEXT |
| progress | INTEGER |
| start_date | TEXT |
| target_end_date | TEXT |
| estimated_duration | INTEGER (seconds) |
| actual_duration | INTEGER (seconds) |
| estimated_cost | INTEGER |
| actual_cost | INTEGER |
| estimated_impact | INTEGER |
| actual_impact | INTEGER |
| position | REAL |
| business_context | TEXT (JSON object) |
| timeline_label | TEXT |
| budget_label | TEXT |

### teams

A team is a named role group (identified by `role` and `type`) that can be
attached to projects (via `team_projects`) and users (via `team_users`).

| Column | Type |
|--------|------|
| id | TEXT |
| role | TEXT |
| type | TEXT |
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
| created_at | TEXT | RFC-3339 Zulu |
| updated_at | TEXT | RFC-3339 Zulu |

The `graph` column stores the entire flow
definition as a JSON document:

```json
{
  "nodes": [{
    "id": "...",
    "name": "...",
    "description": "...",
    "positionX": 0,
    "positionY": 0,
    "isStart": false,
    "isComplete": false,
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

## Workbox

### work_orders

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY (UUID) |
| display_id | TEXT | 8-char hex SHA-256 |
| flow_graph | TEXT | JSON (WorkOrderFlowGraph) |
| position | REAL | Display order, ascending |
| created_at | TEXT | RFC-3339 Zulu |

The `flow_graph` column stores a snapshot of the
flow definition at work order creation time. Same
structure as `flows.graph` plus flow-level metadata
(`flowId`, `name`, `description`, `lockTimeout`).

## Platform

### activities

| Column | Type |
|--------|------|
| id | TEXT |
| type | TEXT |
| action | TEXT |
| target | TEXT |
| timestamp | TEXT |
| status | TEXT |
| feedback | TEXT |
## Admin

### company

Singleton table (single row, `id = '1'`).

| Column | Type |
|--------|------|
| id | TEXT |
| name | TEXT |
| domain | TEXT |

### organization

Singleton table (single row, `id = '1'`).

| Column | Type |
|--------|------|
| id | TEXT |
| plan | TEXT |
| plan_status | TEXT |
| next_billing | TEXT |
| seats | INTEGER |
| used_seats | INTEGER |
| projects_limit | INTEGER |
| projects_current | INTEGER |
| ideas_limit | INTEGER |
| ideas_current | INTEGER |
| storage_limit | REAL |
| storage_current | REAL |
| ai_credits_limit | INTEGER |
| ai_credits_current | INTEGER |
| health_score | INTEGER |
| health_status | TEXT |
| last_activity | TEXT |
| active_users | INTEGER |

## Relationships

### idea_submissions

| Column | Type |
|--------|------|
| id | TEXT |
| idea_id | TEXT (FK → ideas) |
| user_id | TEXT (FK → users) |
| created_at | TEXT |
### activity_actors

| Column | Type |
|--------|------|
| id | TEXT |
| activity_id | TEXT (FK → activities) |
| user_id | TEXT (FK → users) |
| created_at | TEXT |
### project_flows

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| project_id | TEXT | References projects |
| flow_id | TEXT | References flows |
| created_at | TEXT | RFC-3339 Zulu |

### flow_work_orders

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| flow_id | TEXT | References flows |
| work_order_id | TEXT | References work_orders |
| created_at | TEXT | RFC-3339 Zulu |

### flow_versions

History table. Captures a point-in-time snapshot of
a flow's editable state before each mutation. Per-flow
cap of 10; oldest rows are hard-deleted on overflow.
Powers persistent undo on the flows/detail page.

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
| created_at | TEXT | RFC-3339 Zulu — capture time |

### work_order_transitions

Immutable event records — source of truth for
work order state and history.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| work_order_id | TEXT | References work_orders |
| from_node_id | TEXT | '' for creation |
| to_node_id | TEXT | Node in flow_graph |
| user_id | TEXT | References users |
| values | TEXT | JSON {field_id: value} |
| transitioned_at | TEXT | RFC-3339 Zulu |

### work_order_claims

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| work_order_id | TEXT | References work_orders |
| user_id | TEXT | References users |
| claimed_at | TEXT | RFC-3339 Zulu |

### team_projects

| Column | Type |
|--------|------|
| id | TEXT |
| team_id | TEXT (FK → teams) |
| project_id | TEXT (FK → projects) |
| created_at | TEXT |

### team_users

| Column | Type |
|--------|------|
| id | TEXT |
| team_id | TEXT (FK → teams) |
| user_id | TEXT (FK → users) |
| created_at | TEXT |

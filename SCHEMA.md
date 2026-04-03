# Database Schema

21 tables stored in localStorage as JSON arrays. Each table is keyed as `fusion-ai:tableName`. All rows have a text `id` primary key. Column types: TEXT (string), INTEGER (number), REAL (float). JSON columns store stringified arrays or objects. All columns are NOT NULL — entity validation on creation ensures every field is present.

**Duration convention:** All numeric duration fields are persisted in seconds. UI displays days via `durationInDays(seconds)` from `format.ts`.

**Timestamp convention:** TEXT columns storing timestamps use RFC-3339 Zulu format (e.g., `2024-01-15T09:30:00.000000Z`). Temporal facts (completedAt, deletedAt, etc.) belong in event tables — the absence of a row is the absence of the event. See CHURCH-OF-CODE.md.

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
| score | INTEGER |
| estimated_impact | INTEGER |
| estimated_duration | INTEGER (seconds) |
| estimated_cost | INTEGER |
| priority | INTEGER |
| status | TEXT |
| problem_statement | TEXT |
| proposed_solution | TEXT |
| expected_outcome | TEXT |
| category | TEXT |
| readiness | TEXT |
| impact_label | TEXT |
| effort_label | TEXT |
| description | TEXT |
| risks | TEXT (JSON array) |
| assumptions | TEXT (JSON array) |
| alignments | TEXT (JSON array) |
| effort_duration_estimate | TEXT |
| effort_team_size | TEXT |
| cost_estimate | TEXT |
| cost_breakdown | TEXT |
| success_metrics | TEXT |

### idea_scores

| Column | Type |
|--------|------|
| id | TEXT |
| overall | INTEGER |
| impact_score | INTEGER |
| impact_breakdown | TEXT (JSON array) |
| feasibility_score | INTEGER |
| feasibility_breakdown | TEXT (JSON array) |
| efficiency_score | INTEGER |
| efficiency_breakdown | TEXT (JSON array) |
| estimated_duration | TEXT |
| estimated_cost | TEXT |
| recommendation | TEXT |

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
| priority | INTEGER |
| priority_score | INTEGER |
| business_context | TEXT (JSON object) |
| timeline_label | TEXT |
| budget_label | TEXT |

### team_memberships

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
| created_at | TEXT | RFC-3339 Zulu |
| updated_at | TEXT | RFC-3339 Zulu |

### wf_nodes

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| name | TEXT | |
| description | TEXT | |
| position_x | INTEGER | Canvas X coordinate |
| position_y | INTEGER | Canvas Y coordinate |
| is_start | INTEGER | Boolean (0/1) |
| is_complete | INTEGER | Boolean (0/1) |
| created_at | TEXT | RFC-3339 Zulu |

### wf_edges

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| name | TEXT | Transition/button label |
| description | TEXT | |
| created_at | TEXT | RFC-3339 Zulu |

### wf_fields

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| name | TEXT | Field label |
| field_type | TEXT | Enum (see WfFieldType) |
| sort_order | INTEGER | Display order |
| is_required | INTEGER | Boolean (0/1) |
| options | TEXT | JSON array for select/radio/multi_select |
| created_at | TEXT | RFC-3339 Zulu |

## Platform

### activities

| Column | Type |
|--------|------|
| id | TEXT |
| type | TEXT |
| action | TEXT |
| target | TEXT |
| timestamp | TEXT |
| score | INTEGER |
| status | TEXT |
| comment | TEXT |
## Admin

### company_settings

Singleton table (single row, `id = '1'`).

| Column | Type |
|--------|------|
| id | TEXT |
| name | TEXT |
| domain | TEXT |
| industry | TEXT |
| size | TEXT |
| timezone | TEXT |
| language | TEXT |
| is_sso_enforced | INTEGER |
| is_two_factor_enabled | INTEGER |
| is_ip_whitelist_enabled | INTEGER |
| data_retention | TEXT |

### account

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

### idea_score_ideas

| Column | Type |
|--------|------|
| id | TEXT |
| idea_score_id | TEXT (FK → idea_scores) |
| idea_id | TEXT (FK → ideas) |
| created_at | TEXT |

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

### wf_flow_nodes

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| flow_id | TEXT | References flows |
| node_id | TEXT | References wf_nodes |
| created_at | TEXT | RFC-3339 Zulu |

### wf_node_edges

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| wf_edge_id | TEXT | References wf_edges |
| from_node_id | TEXT | References wf_nodes |
| to_node_id | TEXT | References wf_nodes |
| created_at | TEXT | RFC-3339 Zulu |

### wf_node_fields

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT | PRIMARY KEY |
| node_id | TEXT | References wf_nodes |
| field_id | TEXT | References wf_fields |
| created_at | TEXT | RFC-3339 Zulu |
### team_membership_projects

| Column | Type |
|--------|------|
| id | TEXT |
| team_membership_id | TEXT (FK → team_memberships) |
| project_id | TEXT (FK → projects) |
| created_at | TEXT |

### team_membership_users

| Column | Type |
|--------|------|
| id | TEXT |
| team_membership_id | TEXT (FK → team_memberships) |
| user_id | TEXT (FK → users) |
| created_at | TEXT |

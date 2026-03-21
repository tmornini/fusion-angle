# Database Schema

40 tables stored in localStorage as JSON arrays. Each table is keyed as `fusion-ai:tableName`. All rows have a text `id` primary key. Column types: TEXT (string), INTEGER (number), REAL (float). JSON columns store stringified arrays or objects. All columns are NOT NULL — entity validation on creation ensures every field is present.

**Duration convention:** All numeric duration fields are persisted in seconds. UI displays days via `durationInDays(seconds)` from `format.ts`.

**Timestamp convention:** TEXT columns storing timestamps use RFC-3339 Zulu format (e.g., `2024-01-15T09:30:00.000000Z`). Empty string `''` means the event has not yet occurred. All timestamps for events that have occurred must be RFC-3339 Zulu. See CONDUCT-OF-CODE.md.

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

### milestones

| Column | Type |
|--------|------|
| id | TEXT |
| title | TEXT |
| status | TEXT |
| date | TEXT |
| sort_order | INTEGER |

### project_tasks

| Column | Type |
|--------|------|
| id | TEXT |
| name | TEXT |
| priority | TEXT |
| description | TEXT |
| skills | TEXT (JSON array) |
| duration | INTEGER (seconds) |

### discussions

| Column | Type |
|--------|------|
| id | TEXT |
| date | TEXT |
| message | TEXT |

### project_versions

| Column | Type |
|--------|------|
| id | TEXT |
| version | TEXT |
| date | TEXT |
| changes | TEXT |

## Tools

### edges

| Column | Type |
|--------|------|
| id | TEXT |
| status | TEXT |
| confidence | TEXT |
| impact_short_term | TEXT |
| impact_mid_term | TEXT |
| impact_long_term | TEXT |
| updated_at | TEXT |

### edge_outcomes

| Column | Type |
|--------|------|
| id | TEXT |
| description | TEXT |

### edge_metrics

| Column | Type |
|--------|------|
| id | TEXT |
| name | TEXT |
| target | TEXT |
| unit | TEXT |
| current | TEXT |

### crunch_columns

| Column | Type |
|--------|------|
| id | TEXT |
| original_name | TEXT |
| friendly_name | TEXT |
| data_type | TEXT |
| description | TEXT |
| sample_values | TEXT (JSON array) |

### crunch_column_acronyms

| Column | Type |
|--------|------|
| id | TEXT |
| expansion | TEXT |

### processes

| Column | Type |
|--------|------|
| id | TEXT |
| name | TEXT |
| description | TEXT |
| department | TEXT |

### process_steps

| Column | Type |
|--------|------|
| id | TEXT |
| title | TEXT |
| description | TEXT |
| owner | TEXT |
| role | TEXT |
| tools | TEXT (JSON array) |
| duration | TEXT |
| sort_order | INTEGER |
| type | TEXT |

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

### clarifications

| Column | Type |
|--------|------|
| id | TEXT |
| question | TEXT |
| asked_at | TEXT |
| status | TEXT |

### clarification_answers

| Column | Type |
|--------|------|
| id | TEXT |
| answer | TEXT |

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

### idea_project_links

| Column | Type |
|--------|------|
| id | TEXT |
| idea_id | TEXT (FK → ideas) |
| project_id | TEXT (FK → projects) |
| created_at | TEXT |

### edge_ownerships

| Column | Type |
|--------|------|
| id | TEXT |
| edge_id | TEXT (FK → edges) |
| user_id | TEXT (FK → users) |
| created_at | TEXT |

### edge_ideas

| Column | Type |
|--------|------|
| id | TEXT |
| edge_id | TEXT (FK → edges) |
| idea_id | TEXT (FK → ideas) |
| created_at | TEXT |

### edge_outcome_edges

| Column | Type |
|--------|------|
| id | TEXT |
| edge_outcome_id | TEXT (FK → edge_outcomes) |
| edge_id | TEXT (FK → edges) |
| created_at | TEXT |

### edge_metric_outcomes

| Column | Type |
|--------|------|
| id | TEXT |
| edge_metric_id | TEXT (FK → edge_metrics) |
| outcome_id | TEXT (FK → edge_outcomes) |
| created_at | TEXT |

### task_assignments

| Column | Type |
|--------|------|
| id | TEXT |
| task_id | TEXT (FK → project_tasks) |
| user_id | TEXT (FK → users) |
| created_at | TEXT |

### discussion_authorships

| Column | Type |
|--------|------|
| id | TEXT |
| discussion_id | TEXT (FK → discussions) |
| user_id | TEXT (FK → users) |
| created_at | TEXT |

### discussion_projects

| Column | Type |
|--------|------|
| id | TEXT |
| discussion_id | TEXT (FK → discussions) |
| project_id | TEXT (FK → projects) |
| created_at | TEXT |

### version_authorships

| Column | Type |
|--------|------|
| id | TEXT |
| version_id | TEXT (FK → project_versions) |
| user_id | TEXT (FK → users) |
| created_at | TEXT |

### activity_actors

| Column | Type |
|--------|------|
| id | TEXT |
| activity_id | TEXT (FK → activities) |
| user_id | TEXT (FK → users) |
| created_at | TEXT |

### clarification_projects

| Column | Type |
|--------|------|
| id | TEXT |
| clarification_id | TEXT (FK → clarifications) |
| project_id | TEXT (FK → projects) |
| created_at | TEXT |

### clarification_answer_clarifications

| Column | Type |
|--------|------|
| id | TEXT |
| clarification_answer_id | TEXT (FK → clarification_answers) |
| clarification_id | TEXT (FK → clarifications) |
| created_at | TEXT |

### clarification_askers

| Column | Type |
|--------|------|
| id | TEXT |
| clarification_id | TEXT (FK → clarifications) |
| user_id | TEXT (FK → users) |
| created_at | TEXT |

### clarification_answerers

| Column | Type |
|--------|------|
| id | TEXT |
| clarification_id | TEXT (FK → clarifications) |
| user_id | TEXT (FK → users) |
| created_at | TEXT |

### project_task_projects

| Column | Type |
|--------|------|
| id | TEXT |
| project_task_id | TEXT (FK → project_tasks) |
| project_id | TEXT (FK → projects) |
| created_at | TEXT |

### crunch_column_acronym_links

| Column | Type |
|--------|------|
| id | TEXT |
| crunch_column_acronym_id | TEXT (FK → crunch_column_acronyms) |
| crunch_column_id | TEXT (FK → crunch_columns) |
| created_at | TEXT |

### process_step_processes

| Column | Type |
|--------|------|
| id | TEXT |
| process_step_id | TEXT (FK → process_steps) |
| process_id | TEXT (FK → processes) |
| created_at | TEXT |

### milestone_projects

| Column | Type |
|--------|------|
| id | TEXT |
| milestone_id | TEXT (FK → milestones) |
| project_id | TEXT (FK → projects) |
| created_at | TEXT |

### project_version_projects

| Column | Type |
|--------|------|
| id | TEXT |
| project_version_id | TEXT (FK → project_versions) |
| project_id | TEXT (FK → projects) |
| created_at | TEXT |

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

# Database Schema

40 tables stored in localStorage as JSON arrays. Each table is keyed as `fusion-ai:tableName`. All rows have a text `id` primary key. Column types: TEXT (string), INTEGER (number), REAL (float). JSON columns store stringified arrays or objects.

**Duration convention:** All numeric duration fields are persisted in seconds. UI displays days via `durationInDays(seconds)` from `format.ts`.

**Timestamp convention:** TEXT columns storing timestamps use RFC-3339 Zulu format (e.g., `2024-01-15T09:30:00.000000Z`). See CONDUCT-OF-CODE.md.

## Core

### users

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| first_name | TEXT | '' |
| last_name | TEXT | '' |
| email | TEXT | '' |
| role | TEXT | '' |
| department | TEXT | '' |
| status | TEXT | 'active' |
| availability | INTEGER | 100 |
| performance_score | INTEGER | 0 |
| projects_completed | INTEGER | 0 |
| current_projects | INTEGER | 0 |
| strengths | TEXT (JSON array) | '[]' |
| team_dimensions | TEXT (JSON object) | '{}' |
| phone | TEXT | '' |
| bio | TEXT | '' |
| last_active | TEXT | '' |

### ideas

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| title | TEXT | '' |
| score | INTEGER | 0 |
| estimated_impact | INTEGER | 0 |
| estimated_duration | INTEGER (seconds) | 0 |
| estimated_cost | INTEGER | 0 |
| priority | INTEGER | 0 |
| status | TEXT | 'draft' |
| edge_status | TEXT | 'incomplete' |
| problem_statement | TEXT | '' |
| proposed_solution | TEXT | '' |
| expected_outcome | TEXT | '' |
| category | TEXT | '' |
| readiness | TEXT | '' |
| waiting_days | INTEGER | 0 |
| impact_label | TEXT | '' |
| effort_label | TEXT | '' |
| description | TEXT | '' |
| submitted_at | TEXT | '' |
| risks | TEXT (JSON array) | '[]' |
| assumptions | TEXT (JSON array) | '[]' |
| alignments | TEXT (JSON array) | '[]' |
| effort_duration_estimate | TEXT | '' |
| effort_team_size | TEXT | '' |
| cost_estimate | TEXT | '' |
| cost_breakdown | TEXT | '' |
| success_metrics | TEXT | '' |

### idea_scores

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| overall | INTEGER | 0 |
| impact_score | INTEGER | 0 |
| impact_breakdown | TEXT (JSON array) | '[]' |
| feasibility_score | INTEGER | 0 |
| feasibility_breakdown | TEXT (JSON array) | '[]' |
| efficiency_score | INTEGER | 0 |
| efficiency_breakdown | TEXT (JSON array) | '[]' |
| estimated_duration | TEXT | '' |
| estimated_cost | TEXT | '' |
| recommendation | TEXT | '' |

### projects

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| title | TEXT | '' |
| description | TEXT | '' |
| status | TEXT | '' |
| progress | INTEGER | 0 |
| start_date | TEXT | '' |
| target_end_date | TEXT | '' |
| estimated_duration | INTEGER (seconds) | 0 |
| actual_duration | INTEGER (seconds) | 0 |
| estimated_cost | INTEGER | 0 |
| actual_cost | INTEGER | 0 |
| estimated_impact | INTEGER | 0 |
| actual_impact | INTEGER | 0 |
| priority | INTEGER | 0 |
| priority_score | INTEGER | 0 |
| business_context | TEXT (JSON object) | '{}' |
| timeline_label | TEXT | '' |
| budget_label | TEXT | '' |

### team_memberships

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| role | TEXT | '' |
| type | TEXT | '' |

### milestones

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| title | TEXT | '' |
| status | TEXT | 'pending' |
| date | TEXT | '' |
| sort_order | INTEGER | 0 |

### project_tasks

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| name | TEXT | '' |
| priority | TEXT | '' |
| description | TEXT | '' |
| skills | TEXT (JSON array) | '[]' |
| duration | INTEGER (seconds) | 0 |

### discussions

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| date | TEXT | '' |
| message | TEXT | '' |

### project_versions

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| version | TEXT | '' |
| date | TEXT | '' |
| changes | TEXT | '' |

## Tools

### edges

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| status | TEXT | '' |
| confidence | TEXT | '' |
| impact_short_term | TEXT | '' |
| impact_mid_term | TEXT | '' |
| impact_long_term | TEXT | '' |
| updated_at | TEXT | '' |

### edge_outcomes

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| description | TEXT | '' |

### edge_metrics

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| name | TEXT | '' |
| target | TEXT | '' |
| unit | TEXT | '' |
| current | TEXT | '' |

### crunch_columns

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| original_name | TEXT | '' |
| friendly_name | TEXT | '' |
| data_type | TEXT | '' |
| description | TEXT | '' |
| sample_values | TEXT (JSON array) | '[]' |

### crunch_column_acronyms

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| expansion | TEXT | '' |

### processes

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| name | TEXT | '' |
| description | TEXT | '' |
| department | TEXT | '' |

### process_steps

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| title | TEXT | '' |
| description | TEXT | '' |
| owner | TEXT | '' |
| role | TEXT | '' |
| tools | TEXT (JSON array) | '[]' |
| duration | TEXT | '' |
| sort_order | INTEGER | 0 |
| type | TEXT | 'action' |

## Platform

### activities

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| type | TEXT | '' |
| action | TEXT | '' |
| target | TEXT | '' |
| timestamp | TEXT | '' |
| score | INTEGER | 0 |
| status | TEXT | '' |
| comment | TEXT | '' |

### clarifications

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| question | TEXT | '' |
| asked_at | TEXT | '' |
| status | TEXT | 'pending' |

### clarification_answers

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| answer | TEXT | '' |

## Admin

### company_settings

Singleton table (single row, `id = '1'`).

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | '1' |
| name | TEXT | '' |
| domain | TEXT | '' |
| industry | TEXT | '' |
| size | TEXT | '' |
| timezone | TEXT | '' |
| language | TEXT | '' |
| is_sso_enforced | INTEGER | 0 |
| is_two_factor_enabled | INTEGER | 0 |
| is_ip_whitelist_enabled | INTEGER | 0 |
| data_retention | TEXT | '' |

### account

Singleton table (single row, `id = '1'`).

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | '1' |
| plan | TEXT | '' |
| plan_status | TEXT | '' |
| next_billing | TEXT | '' |
| seats | INTEGER | 0 |
| used_seats | INTEGER | 0 |
| projects_limit | INTEGER | 0 |
| projects_current | INTEGER | 0 |
| ideas_limit | INTEGER | 0 |
| ideas_current | INTEGER | 0 |
| storage_limit | REAL | 0 |
| storage_current | REAL | 0 |
| ai_credits_limit | INTEGER | 0 |
| ai_credits_current | INTEGER | 0 |
| health_score | INTEGER | 0 |
| health_status | TEXT | '' |
| last_activity | TEXT | '' |
| active_users | INTEGER | 0 |

## Relationships

### idea_score_ideas

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| idea_score_id | TEXT (FK → idea_scores) | — |
| idea_id | TEXT (FK → ideas) | — |
| created_at | TEXT | '' |

### idea_submissions

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| idea_id | TEXT (FK → ideas) | — |
| user_id | TEXT (FK → users) | — |
| created_at | TEXT | '' |

### idea_project_links

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| idea_id | TEXT (FK → ideas) | — |
| project_id | TEXT (FK → projects) | — |
| created_at | TEXT | '' |

### edge_ownerships

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| edge_id | TEXT (FK → edges) | — |
| user_id | TEXT (FK → users) | — |
| created_at | TEXT | '' |

### edge_ideas

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| edge_id | TEXT (FK → edges) | — |
| idea_id | TEXT (FK → ideas) | — |
| created_at | TEXT | '' |

### edge_outcome_edges

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| edge_outcome_id | TEXT (FK → edge_outcomes) | — |
| edge_id | TEXT (FK → edges) | — |
| created_at | TEXT | '' |

### edge_metric_outcomes

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| edge_metric_id | TEXT (FK → edge_metrics) | — |
| outcome_id | TEXT (FK → edge_outcomes) | — |
| created_at | TEXT | '' |

### task_assignments

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| task_id | TEXT (FK → project_tasks) | — |
| user_id | TEXT (FK → users) | — |
| created_at | TEXT | '' |

### discussion_authorships

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| discussion_id | TEXT (FK → discussions) | — |
| user_id | TEXT (FK → users) | — |
| created_at | TEXT | '' |

### discussion_projects

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| discussion_id | TEXT (FK → discussions) | — |
| project_id | TEXT (FK → projects) | — |
| created_at | TEXT | '' |

### version_authorships

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| version_id | TEXT (FK → project_versions) | — |
| user_id | TEXT (FK → users) | — |
| created_at | TEXT | '' |

### activity_actors

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| activity_id | TEXT (FK → activities) | — |
| user_id | TEXT (FK → users) | — |
| created_at | TEXT | '' |

### clarification_projects

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| clarification_id | TEXT (FK → clarifications) | — |
| project_id | TEXT (FK → projects) | — |
| created_at | TEXT | '' |

### clarification_answer_clarifications

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| clarification_answer_id | TEXT (FK → clarification_answers) | — |
| clarification_id | TEXT (FK → clarifications) | — |
| created_at | TEXT | '' |

### clarification_askers

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| clarification_id | TEXT (FK → clarifications) | — |
| user_id | TEXT (FK → users) | — |
| created_at | TEXT | '' |

### clarification_answerers

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| clarification_id | TEXT (FK → clarifications) | — |
| user_id | TEXT (FK → users) | — |
| created_at | TEXT | '' |

### project_task_projects

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| project_task_id | TEXT (FK → project_tasks) | — |
| project_id | TEXT (FK → projects) | — |
| created_at | TEXT | '' |

### crunch_column_acronym_links

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| crunch_column_acronym_id | TEXT (FK → crunch_column_acronyms) | — |
| crunch_column_id | TEXT (FK → crunch_columns) | — |
| created_at | TEXT | '' |

### process_step_processes

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| process_step_id | TEXT (FK → process_steps) | — |
| process_id | TEXT (FK → processes) | — |
| created_at | TEXT | '' |

### milestone_projects

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| milestone_id | TEXT (FK → milestones) | — |
| project_id | TEXT (FK → projects) | — |
| created_at | TEXT | '' |

### project_version_projects

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| project_version_id | TEXT (FK → project_versions) | — |
| project_id | TEXT (FK → projects) | — |
| created_at | TEXT | '' |

### team_membership_projects

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| team_membership_id | TEXT (FK → team_memberships) | — |
| project_id | TEXT (FK → projects) | — |
| created_at | TEXT | '' |

### team_membership_users

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| team_membership_id | TEXT (FK → team_memberships) | — |
| user_id | TEXT (FK → users) | — |
| created_at | TEXT | '' |

# Database Schema

22 tables stored in localStorage as JSON arrays. Each table is keyed as `fusion-ai:tableName`. All rows have a text `id` primary key. Column types: TEXT (string), INTEGER (number), REAL (float). JSON columns store stringified arrays or objects.

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
| estimated_time | INTEGER | 0 |
| estimated_cost | INTEGER | 0 |
| priority | INTEGER | 0 |
| status | TEXT | 'draft' |
| submitted_by_id | TEXT (FK → users) | '' |
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
| effort_time_estimate | TEXT | '' |
| effort_team_size | TEXT | '' |
| cost_estimate | TEXT | '' |
| cost_breakdown | TEXT | '' |

### idea_scores

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| idea_id | TEXT (FK → ideas) | — |
| overall | INTEGER | 0 |
| impact_score | INTEGER | 0 |
| impact_breakdown | TEXT (JSON array) | '[]' |
| feasibility_score | INTEGER | 0 |
| feasibility_breakdown | TEXT (JSON array) | '[]' |
| efficiency_score | INTEGER | 0 |
| efficiency_breakdown | TEXT (JSON array) | '[]' |
| estimated_time | TEXT | '' |
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
| lead_id | TEXT (FK → users) | '' |
| estimated_time | INTEGER | 0 |
| actual_time | INTEGER | 0 |
| estimated_cost | INTEGER | 0 |
| actual_cost | INTEGER | 0 |
| estimated_impact | INTEGER | 0 |
| actual_impact | INTEGER | 0 |
| priority | INTEGER | 0 |
| priority_score | INTEGER | 0 |
| linked_idea_id | TEXT | '' |
| business_context | TEXT (JSON object) | '{}' |
| timeline_label | TEXT | '' |
| budget_label | TEXT | '' |

### project_team

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| project_id | TEXT (FK → projects) | — |
| user_id | TEXT (FK → users) | — |
| role | TEXT | '' |
| type | TEXT | '' |

### milestones

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| project_id | TEXT (FK → projects) | — |
| title | TEXT | '' |
| status | TEXT | 'pending' |
| date | TEXT | '' |
| sort_order | INTEGER | 0 |

### project_tasks

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| project_id | TEXT (FK → projects) | — |
| name | TEXT | '' |
| priority | TEXT | '' |
| description | TEXT | '' |
| skills | TEXT (JSON array) | '[]' |
| hours | INTEGER | 0 |
| assigned_to_id | TEXT | '' |

### discussions

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| project_id | TEXT (FK → projects) | — |
| author_id | TEXT (FK → users) | — |
| date | TEXT | '' |
| message | TEXT | '' |

### project_versions

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| project_id | TEXT (FK → projects) | — |
| version | TEXT | '' |
| date | TEXT | '' |
| changes | TEXT | '' |
| author_id | TEXT | '' |

## Tools

### edges

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| idea_id | TEXT (FK → ideas) | — |
| status | TEXT | '' |
| confidence | TEXT | '' |
| owner_id | TEXT | '' |
| impact_short_term | TEXT | '' |
| impact_mid_term | TEXT | '' |
| impact_long_term | TEXT | '' |
| updated_at | TEXT | '' |

### edge_outcomes

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| edge_id | TEXT (FK → edges) | — |
| description | TEXT | '' |

### edge_metrics

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| outcome_id | TEXT (FK → edge_outcomes) | — |
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
| is_acronym | INTEGER | 0 |
| acronym_expansion | TEXT | '' |

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
| process_id | TEXT (FK → processes) | — |
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
| actor_id | TEXT (FK → users) | '' |
| action | TEXT | '' |
| target | TEXT | '' |
| timestamp | TEXT | '' |
| score | INTEGER | null |
| status | TEXT | null |
| comment | TEXT | null |

### notifications

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| title | TEXT | '' |
| message | TEXT | '' |
| time | TEXT | '' |
| is_unread | INTEGER | 1 |

### clarifications

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| project_id | TEXT (FK → projects) | — |
| question | TEXT | '' |
| asked_by_id | TEXT | '' |
| asked_at | TEXT | '' |
| status | TEXT | 'pending' |
| answer | TEXT | null |
| answered_by_id | TEXT | null |
| answered_at | TEXT | null |

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

### notification_categories

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| label | TEXT | '' |
| icon | TEXT | '' |

### notification_preferences

| Column | Type | Default |
|--------|------|---------|
| id | TEXT | — |
| category_id | TEXT (FK → notification_categories) | — |
| label | TEXT | '' |
| description | TEXT | '' |
| is_email_enabled | INTEGER | 1 |
| is_push_enabled | INTEGER | 0 |

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

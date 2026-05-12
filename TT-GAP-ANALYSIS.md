# Plan: TeamTrack Functional Parity — Gap Analysis

## Context

The user asks: what would it take to add the functionality of the
last version of Serena Software's TeamTrack (circa 2007, before
the rebrand to Serena Business Mashups / SBM and successors) to the
fusion-ai codebase?

The user explicitly does NOT want code modification detail. They want
a gap list — features TeamTrack provided that fusion-ai does not
currently have. This document is therefore a requirements / scoping
artifact, not an implementation plan. Concrete design decisions
(schemas, APIs, UI) are deferred to per-feature plans drafted later.

The fusion-ai inventory below is grounded in actual reads of
`SCHEMA.md`, `api/types.ts`, `web-app/app/adapters/*`, the flow
designer modules, the auth module, and the command palette. Nothing
here is speculation about fusion-ai's contents.

The TeamTrack feature inventory reflects the product's last
TeamTrack-branded release. Successor capabilities (BPM orchestration,
Composer-based form designer, ITSM modules, AppWave, mobile clients)
are explicitly out of scope per the user's instruction.

---

## What fusion-ai already has (the baseline)

To make the gap list accurate, here's what counts as "already
present" and therefore not a gap:

- Graphical workflow designer: SVG canvas with Sugiyama layered
layout, node drag, marquee selection, edge connect, undo via
`flow_versions` (`web-app/app/flow-*.ts`,
`web-app/app/adapters/flow-versions.ts`).
- Mermaid round-trip: import/export flows as Mermaid text or ZIP.
- Per-node form fields: 14 field types (`text`, `textarea`,
`number`, `date`, `select`, `checkbox`, `file`, `image`, `email`,
`url`, `phone`, `currency`, `multi_select`, `radio`) bound to
each flow node (`api/types.ts:589-596`). Required-flag and
options supported.
- Work-order state machine: items move through a flow graph;
current state derived from immutable `work_order_transitions`
events (`SCHEMA.md:257-270`). User, target node, and field values
are recorded per transition.
- Work-order claim/unclaim: `work_order_claims` table.
- Per-flow undo history: 10-snapshot rollover buffer in
`flow_versions`.
- Activity feed: 5 manually posted event types
(`idea_created`, `project_created`, `user_joined`,
`status_changed`, `idea_converted`) in `activities` table.
- Three fixed dashboard gauges: Time, Cost, Impact
(`web-app/app/adapters/dashboard.ts:116-259`).
- `Cmd+K` command palette: client-side substring search across
pages, ideas, projects, people.
- Full-database snapshot import/export: JSON snapshot file.
- In-app toasts: `showToast(message, variant)`, auto-dismiss.
- Internal pub/sub: `channels.ts` for cross-tab state sync.
- REST-style adapter layer: GET/PUT/DELETE/POST conventions,
but localStorage-backed and not exposed externally.

---

## Gap List — TeamTrack capabilities fusion-ai lacks

Grouped by domain. Within each group, ordered roughly from
foundational (others depend on it) to derivative.

### 1. Authentication, identity, and access control

The widest chasm. Fusion-ai's auth is a mock that calls
`navigateTo()` after `setTimeout(800)` with no credential check
(`web-app/auth/index.ts:388-525`). The `users.role` column exists
but has no enforcement anywhere in `api/api.ts`.

- Real authentication (credential verification, sessions,
logout, password reset).
- Multi-factor authentication / 2FA.
- LDAP / Active Directory integration (TeamTrack's primary
enterprise auth path).
- Single sign-on (SAML, OAuth/OIDC).
- Server-side session management (currently no concept of a
session — current user is hardcoded as `id='current'`).
- Role enforcement at the API/adapter layer (currently every
GET/PUT/DELETE/POST is unconditional).
- Role-based permissions per resource: who may view, create,
edit, delete, transition each entity type.
- Per-project role assignments (TeamTrack let users have
different roles in different projects; fusion-ai has one
org-wide role text field).
- Group-based permissions (TeamTrack groups granted access to
projects/categories; fusion-ai teams are lightweight id/role/
type rows with no permission semantics).
- Field-level security (TeamTrack: read-only or invisible per
role per field per state).
- Audit log of administrative actions (login attempts, role
changes, permission grants). The current `activities` table
records only 5 product event types.

### 2. Item / ticket / work-order data model

TeamTrack items had rich first-class metadata. Fusion-ai's work
order is essentially `{id, display_id, flow_graph_snapshot,
position, created_at}` plus per-transition values.

- Priority (Critical/High/Medium/Low or configurable scale).
- Severity (separate from priority — defect impact vs.
resolution urgency).
- Due date as a first-class column (currently only modelable
as a node-field of type date).
- Item type / sub-type (defect, enhancement, task, change
request — TeamTrack's "primary table" concept). Fusion-ai has
one item type: `work_order`.
- Affected version (which release exposed this).
- Fix version / target version (which release will resolve
this).
- Parent / child item relationships (epic → story → task).
- Cross-item linking with link types: relates-to, blocks,
blocked-by, duplicates, duplicated-by, depends-on.
- Labels / tags as a normalized concept (currently only
modelable per-flow as `multi_select`).
- Free-form description with rich text (markdown, embedded
images). Currently each node defines its own textarea field.
- Resolution / disposition codes (Fixed, Won't Fix, Duplicate,
Cannot Reproduce — TeamTrack's standard closure codes).

### 3. Custom fields and dynamic schemas

TeamTrack's defining capability. An admin defined a custom field
once at the project or item-type level, attached it to forms, and
applied rules. Fusion-ai's fields are bound inside a flow node
definition with no project-level field registry.

- Project-defined custom field registry (define Customer Impact
once, reuse across item types and flows).
- Item-type-scoped schemas (defects have these fields, tasks
have these others).
- Computed / calculated fields (`days_open = now() - created_at`,
`total_cost = hours * rate`).
- Cascading dropdowns (selecting Region narrows the City list).
- Field-level default value rules (defaults from current user,
current date, lookup tables).
- Field-level validation rules beyond required (regex, range,
uniqueness).
- Multi-row tables / sub-grids on a form (e.g., a list of
affected components per item).

### 4. Workflow engine semantics

Fusion-ai has the graph; TeamTrack had a runtime.

- Transition conditions — guards on edges
(`if priority == Critical require manager_approval == true`).
- Pre-transition actions — validation hooks, field
recalculation.
- Post-transition actions — auto-fill fields, set timestamps,
fire notifications, create child items.
- Role-gated transitions — only role X may perform edge Y.
- Required-fields-per-transition (different from node-level
required: "Resolution Code is required to leave Open, but not
to enter Open").
- Field visibility/edit rules per state (description editable
in Open, read-only in Closed).
- Approval gates — single-approver and parallel
approvals (multiple approvers, all must consent or any-may).
- Sub-workflows — a parent transition spawns a child workflow
whose completion satisfies the parent.
- Auto-transitions — time-based ("auto-close after 14 days
in Pending Verification") and event-based ("auto-route to QA
when `build_id` field set").
- Workflow versioning with live-item migration policy (when a
flow definition changes, what happens to in-flight items?
Currently fusion-ai snapshots the flow into each work order,
which is one valid answer but precludes flow upgrades for
existing items).

### 5. Notifications

Fusion-ai has in-app toasts and an internal `channels.ts` pub/sub.
There is no external delivery mechanism.

- Email delivery infrastructure (SMTP, queue, retries, bounce
handling). No SMTP config exists.
- Notification rules engine — configurable: notify on assign,
on state change, on field change, on comment, on @mention.
- Watcher / subscription model — users subscribe to specific
items.
- @mentions in comments/descriptions that notify the
mentioned user.
- Per-user notification preferences (digest vs. realtime,
channel selection).
- SLA / breach notifications — notify when a deadline-driven
threshold is approached or breached.
- Escalation rules — auto-reassign or notify a chain when a
state has been held too long.
- Templated notification content (per event type, per role).

### 6. Reports, dashboards, and analytics

Fusion-ai has three hardcoded gauges plus a per-flow heat-map
analytics page (`flows/stats`) that shows trailing-90-day
median time per node and path-stepper breakdowns. TeamTrack had a
configurable report engine.

- Saved queries / saved filters — personal and shared.
- Tabular reports with user-chosen columns and grouping.
- Trend reports — open count over time, throughput,
cumulative flow.
- Aging reports — time-in-state distributions, oldest-open.
  (`flows/stats` partially addresses per-node time-in-state
  for a single flow; cross-flow, cross-project, and oldest-open
  remain gaps.)
- Distribution charts — pie/bar by any field.
- Personal dashboards — multiple, configurable, layout-aware.
- Shared / role-default dashboards.
- Scheduled email delivery of reports (daily, weekly).
- Export to CSV, Excel, PDF.
- Cross-project reporting with ad-hoc joins.
- Drill-down from chart segment to underlying item list.

### 7. Search

Fusion-ai's command palette is a navigation/jump tool with
in-memory `.includes()` filtering across a few entity types.

- Full-text search across all entity types, including item
descriptions, comments, attachments (filename + indexed text).
- Boolean / field-scoped query language (TeamTrack used a
query builder with AND/OR/NOT and per-field operators).
- Quick filters / favorite filters persisted per user.
- Cross-project queries with project as a filter dimension.

### 8. Attachments

Fusion-ai's `file` and `image` field types in
`api/types.ts:14-28` are form field type definitions, not actual
file storage. There is no attachment table, no upload endpoint, no
blob handling.

- Attachment storage (filesystem, S3, or DB blob — pick one).
- Attachment metadata table (filename, size, mime, uploader,
uploaded_at, item ref).
- Multipart upload handling in the API layer.
- Versioned attachments — re-uploads keep history.
- Inline images in descriptions and comments.
- Download with audit (who downloaded, when).
- Per-attachment access control inheriting from the parent
item.

### 9. Comments / discussion

There is no comments table. The `activities.feedback` column is a
free-form text field on activity rows, not a per-item discussion
thread.

- Per-item comments table with author, timestamp,
edit-history, soft-delete.
- Threaded replies (TeamTrack supported nested discussion).
- Markdown formatting with safe rendering.
- @mentions resolved against users.
- Email-reply-to-comment (post a reply by replying to the
notification email).

### 10. History / audit

Fusion-ai has a transition event log for work orders and a
versioned `flow_versions` undo buffer for flows. Nothing else has
change history.

- Per-entity change history for ideas, projects, users,
teams, custom fields, etc.
- Field-level diffs in the work-order audit — currently a
transition stores the full values JSON; reconstructing
before/after for one field requires diffing two transitions.
- Configurable audit policies (what changes are audited, how
long retained).
- Audit log search and export.
- Tamper-evident log (TeamTrack's regulated-industry
customers required this).

### 11. Versions / releases

No release lifecycle exists.

- Versions as first-class entities per project (name, release
date, status: planned/released/archived).
- Affects-version and fix-version pickers on items.
- Release notes auto-compiled from items targeted at a
version.
- Version-scoped reports (what's in 2.4, what slipped to 2.5).

### 12. Time tracking

Project-level estimated/actual durations exist
(`SCHEMA.md:63-64`), but there is no per-item time tracking.

- Per-item original estimate.
- Per-item remaining estimate (separately revisable).
- Worklogs — a user logs N hours against an item with a
timestamp and optional comment.
- Worklog reports (time per user, per project, per period).
- Timesheet view for a user across all worklogged items.

### 13. Bulk operations

Fusion-ai's only bulk action is multi-node drag in the flow
designer. There are no bulk actions on items.

- Bulk edit — change a field value across a selection.
- Bulk transition — move many items through the same edge.
- Bulk assign / claim.
- Bulk delete (with confirmation and audit).
- Bulk export of the current filter result.

### 14. Import / export / migration

Fusion-ai has full-database snapshot import/export but nothing
item-level.

- CSV import for items with field mapping UI.
- CSV export of any saved query result.
- XML / JSON export per project for archival.
- Migration tooling from common third-party trackers
(TeamTrack offered migration paths from PVCS Tracker and
ClearQuest).

### 15. Integration / external API

Fusion-ai's "API" is internal SPA function calls
(`api/api.ts`); nothing is exposed over HTTP to outside callers.

- Public REST API with stable URL paths, auth
(token/OAuth), and documented contracts.
- Webhooks — outbound HTTP on state change, assignment,
comment, etc.
- Email-to-issue — inbound email creates an item or
appends a comment.
- Source-control integration — recognize item IDs in commit
messages, surface commits on items, and optionally drive
transitions from commit metadata.
- Build/CI integration — link build results to fix-version,
drive auto-transitions on green builds.
- IDE integration (TeamTrack had Eclipse and Visual Studio
plugins).

### 16. Multi-project / project administration

- Project templates — clone a fully configured project
(workflows, fields, roles, dashboards) into a new instance.
- Project archival with read-only retention and out-of-quota
exclusion.
- Project-level configuration (default workflow per item
type, default assignee rules).
- Cross-project dependencies — first-class link type
spanning project boundaries.

### 17. Licensing / seat management

The `organization` singleton table has `seats`, `used_seats`,
limits, etc. (`SCHEMA.md:176-200`), but nothing enforces them.

- Seat enforcement at user invite time.
- License types (full vs. read-only / restricted seats —
TeamTrack distinguished these).
- License pool reporting.
- Concurrent-user vs. named-user licensing models (TeamTrack
supported both).

---

## Cross-cutting concerns

Several gaps recur across the domains above and deserve naming
once rather than repeatedly:

- No server-side runtime. Fusion-ai is a browser SPA backed
by localStorage. Half of the gap list (auth, email,
notifications, server search, scheduled jobs, webhooks, public
API, attachment storage) presupposes a server. Adopting a real
backend is a foundational decision that gates roughly 60% of
the gap list.
- No event bus / job queue. TeamTrack-grade workflows trigger
side effects (notifications, escalations, computed fields, sub-
workflow spawning). These need durable scheduling.
- No external identity provider. LDAP/AD/SAML/OIDC support
presumes an external identity service.
- No file/blob storage. Attachments and inline images need a
storage layer.

The doctrinally honest framing: roughly two-thirds of the gap
list cannot be filled without a server-side runtime. The
remaining third (item metadata, comments-as-data, custom-field
registry shape, transition condition language, query language,
per-entity history, bulk-action UI) can be modeled and exercised
client-side first.

---

## Critical files for follow-up planning

When a per-feature plan is drafted later, these files will
inform the data-model and integration touchpoints:

- `SCHEMA.md` — the 18-table baseline; new entities will mostly
add tables here.
- `api/types.ts` — row types and shared aliases. The
`WorkOrderFlowGraph`, `GraphNode`, `GraphField`, and `User`
types are the central touchpoints.
- `api/db.ts` — `DbAdapter` interface. `CLAUDE.md` notes it was
designed for migration to Postgres; that migration is
prerequisite to most of the gap list.
- `api/api.ts` — current resource routing. A real public API
would extend or replace this.
- `web-app/app/adapters/workbox-*.ts` and `flow-*.ts` — the
current work-order and flow surface, where new transition
semantics, conditions, and approvals would attach.
- `web-app/app/adapters/shared.ts` — `getCurrentUser`,
`AuthContext`. Real auth replaces these.
- `web-app/auth/index.ts:388-525` — the mock auth flow that
needs replacement.
- `web-app/organization/users.ts` — user lifecycle UI;
enforcement layer needs to be added behind it.
- `web-app/dashboard/` and `web-app/app/charts.ts` — the report
surface to expand.
- `web-app/app/command-palette.ts` — the search surface to
upgrade to real search.

## Reusable patterns already in the codebase

Following Article of Faith we believe in process first, several
existing patterns should be reused rather than reinvented:

- Immutable event tables for state. `work_order_transitions`
is the model. Comments, worklogs, audit entries, and
notifications-sent should follow the same pattern (append-only,
current state derived).
- Adapter pattern at the data boundary. Every new external
dependency (SMTP, S3, LDAP) gets an adapter under
`web-app/app/adapters/` per the
Article of Faith on insulation.
- Presenter classes for rendering. New entity types follow
the existing `*Presenter` shape under `web-app/app/presenters/`.
- `SafeHtml` tagged template for all rendered markup — never
ad-hoc `innerHTML`.
- `channels.ts` pub/sub for cross-page state invalidation
when a backend mutation lands.

---

## Verification

This document is a gap list, not an implementation. Verification
that the list is accurate and complete (rather than that it is
correctly implemented) takes the form of spot checks:

1. Inventory accuracy. For each "fusion-ai already has" entry
in the baseline section, open the cited file/table and
confirm the capability exists. (The scoping research has
already done this; re-verification is a fast pass.)
2. TeamTrack accuracy. For each gap entry, confirm against
archived TeamTrack documentation
(e.g., the Serena TeamTrack 6.6 User Guide, Administrator
Guide, and TeamTrack Workflow Designer Guide) that the
feature was indeed in the last TeamTrack-branded release and
not introduced only in SBM/successors.
3. Successor exclusion. For features that look modern,
sanity-check they aren't actually SBM-era additions:
Composer-based forms, AppWave, mobile clients, Mashup
orchestration, SSM ITSM are explicitly out of scope.
4. No phantom gaps. Re-read this document looking for any
entry that fusion-ai actually does have. Common false
positives to avoid: "graphical workflow designer" (have it),
"per-node form fields" (have it), "transition history with
user attribution" (have it).

When a per-feature implementation plan is later drafted from this
document, that plan gets its own verification section appropriate
to running code (tests, manual exercise via `TEST-PLAN.md`
extensions, observable end-to-end behavior).

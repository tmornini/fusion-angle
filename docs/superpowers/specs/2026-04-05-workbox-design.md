# Workbox Feature: Design Spec + Implementation Plan

## Context

The platform needs a Workbox feature — a work-order
inbox where users process items through workflow
stages. Work orders flow through Flow graphs,
accumulating field values and transition history at
each state. This requires two phases: first refactor
flows from 7+ relational tables to a document model,
then build Workbox on the clean foundation.

## Phase 1: Flow Document Model Refactor

### Why

The current flow system stores a single graph
definition across 7+ tables (flows, wf_nodes,
wf_edges, wf_fields, wf_flow_nodes, wf_node_edges,
wf_node_fields). This decomposition created artificial
independent entities for things that are parts of one
aggregate. Workbox needs to snapshot flow graphs into
work orders — the document model makes this trivial
and eliminates 6 tables.

### Flow Table (after refactor)

```
flows
  id            Id (UUID)
  name          string
  description   string
  lock_timeout  number (seconds, default 28800)
  graph         string (JSON)
  created_at    string (RFC-3339 Zulu)
  updated_at    string (RFC-3339 Zulu)
```

### Graph JSON Structure

```json
{
  "nodes": [
    {
      "id": "uuid",
      "name": "Review",
      "description": "...",
      "positionX": 100,
      "positionY": 200,
      "isStart": false,
      "isComplete": false,
      "fields": [
        {
          "id": "uuid",
          "name": "Reviewer Comments",
          "fieldType": "textarea",
          "sortOrder": 1,
          "isRequired": true,
          "options": []
        }
      ]
    }
  ],
  "edges": [
    {
      "id": "uuid",
      "name": "Approve",
      "description": "...",
      "fromNodeId": "node-uuid-1",
      "toNodeId": "node-uuid-2"
    }
  ]
}
```

### Tables Eliminated

- wf_nodes
- wf_edges
- wf_fields
- wf_flow_nodes
- wf_node_edges
- wf_node_fields

### Tables Retained

- flows (restructured with graph JSON column)
- project_flows (sacred relationship: project <> flow)

### Files to Modify (Phase 1)

**Schema & types:**
- `SCHEMA.md` — remove 6 tables, update flows table
- `api/types.ts` — remove WfNodeEntity, WfEdgeEntity,
  WfFieldEntity, WfFlowNodeEntity, WfNodeEdgeEntity,
  WfNodeFieldEntity; update FlowEntity with graph
  column; add FlowGraph, GraphNode, GraphEdge,
  GraphField type definitions (move from adapter)
- `api/db.ts` — remove 6 entity stores from
  DbAdapter interface
- `api/db-localstorage.ts` — remove 6 entity stores,
  remove from TABLE_NAMES and createSchema
- `api/api.ts` — remove routes for wf_nodes,
  wf_edges, wf_fields, wf_flow_nodes, wf_node_edges,
  wf_node_fields
- `api/seed.ts` — rewrite flow seeding to create
  document-shaped flows with graph JSON

**Adapters:**
- `web-app/app/adapters/flow-queries.ts` — simplify
  getFlowGraph to parse and VALIDATE JSON against
  FlowGraph type structure; remove multi-table
  assembly; FlowGraph/GraphNode/GraphEdge/GraphField
  types move to api/types.ts. Per "Defense Against
  External Chaos" stricture, all data read from
  storage must be validated — the parsed graph JSON
  must be checked for correct structure (nodes array,
  edges array, required fields on each) before use.
  Validation function is reusable for both flows.graph
  and work_orders.flow_graph since they share the
  graph structure
- `web-app/app/adapters/flow-mutations.ts` — rewrite
  to load-modify-save document pattern; postFlowCreation,
  postNodeAddition, postEdgeConnection, postFieldAddition,
  putFlow, putNode, putWfEdge, putField all become
  document mutations
- `web-app/app/adapters/flow-deletions.ts` — simplify
  to document mutations (remove node/edge/field from
  graph JSON, save)
- `web-app/app/adapters/flow-undo-adapter.ts` —
  rewrite for document-level undo (snapshot before
  mutation, restore on undo)
- `web-app/app/adapters/flow-export.ts` — update
  to work with graph JSON directly

**Pages:**
- `web-app/flow/detail.ts` — update to work with
  new adapter signatures (should be minimal if adapter
  interface stays similar)
- `web-app/flow/index.ts` — update flow list if it
  accesses node/edge counts (derive from graph JSON)

### Phase 1 Verification

- `./validate` passes
- Flow list page loads, shows correct flow names
- Flow detail page loads, shows nodes/edges/fields
- Add node, edge, field — all persist correctly
- Delete node, edge, field — all persist correctly
- Undo operations work
- Export/import (Mermaid, ZIP) still works
- Seed data creates valid flows
- Existing flow-related tests in TEST-PLAN.md pass

---

## Phase 2: Workbox Feature

### Data Model (Event-Sourced)

#### Noun Table

```
work_orders
  id            Id (UUID)
  display_id    string (8-char lowercase hex SHA-3
                of id)
  flow_graph    string (JSON snapshot of flow at
                creation time — same structure as
                flows.graph plus flow metadata)
  created_at    string (RFC-3339 Zulu)
```

The flow_graph JSON includes flow-level metadata
that the work order needs:

```json
{
  "flowId": "uuid",
  "name": "Approval Process",
  "description": "...",
  "lockTimeout": 28800,
  "nodes": [ ... ],
  "edges": [ ... ]
}
```

#### Relationship / Event Tables

```
flow_work_orders  (flow <> work order)
  id              Id
  flow_id         Id
  work_order_id   Id
  created_at      string (RFC-3339 Zulu)

work_order_transitions  (immutable events)
  id              Id
  work_order_id   Id
  from_node_id    Id (empty string for creation)
  to_node_id      Id
  user_id         Id
  values          string (JSON: {field_id: value})
  transitioned_at string (RFC-3339 Zulu)

work_order_claims  (work order <> claiming user)
  id              Id
  work_order_id   Id
  user_id         Id
  claimed_at      string (RFC-3339 Zulu)
```

#### Derived State (adapter computes)

- current_node = last transition's to_node_id
- is_completed = current node's isComplete in
  flow_graph
- is_claimed = claim row exists AND (now -
  claimed_at) < flow_graph.lockTimeout
- body = scan transitions chronologically,
  collect values by from_node_id
- history = all transitions with user + values
- creator = user_id on the first transition

#### Display ID Generation

SHA-256(uuid) -> first 8 hex chars, lowercase.
Example: "Approval Process a3f2b91c"

Uses Web Crypto API: crypto.subtle.digest('SHA-256',
...) — browser-native, zero dependencies.

#### Start Node Constraint

For auto-transition on creation, the start node
must have exactly one outgoing edge. If the start
node has zero or multiple outgoing edges, work
order creation is blocked with an error. This is
validated at creation time, not at flow design time
(the flow designer is free to build any graph).

### Work Order Lifecycle

1. User clicks "+ New", picks a flow
2. work_orders row created (with flow_graph
   snapshot)
3. flow_work_orders row links to source flow
4. Transition: '' -> start_node (values: {})
5. Transition: start_node -> post_start_node
   (values: {}, start has no fields)
6. work_order_claims row auto-claims for creator
7. Creator sees action screen for post_start_node
8. Creator fills fields, picks a transition
9. Transition event recorded (with field values),
   claim deleted
10. Work order appears in inbox for all users
11. Another user claims it (claim row created)
12. Fill fields, transition -> repeat
13. When reaching is_complete node, final transition
    recorded -> moves to archive view

Unclaim: delete claim row, work order returns to
inbox at its current node (no transition event).

Claim timeout: checked on read. If
(now - claimed_at) > flow_graph.lockTimeout, treat
as expired. Work order appears in inbox pool.

### Adapter Functions

**Reads (all JSON parsed from storage is validated
per "Defense Against External Chaos" stricture):**
- getWorkboxItems() — active inbox (uncompleted,
  unclaimed work orders); validates flow_graph and
  transition values JSON on read
- getWorkboxArchive() — completed work orders
- getWorkboxItem(id) — full context for action
  screen: flow_graph, transitions, computed body,
  current node fields, outgoing edges, claim status

**Operations:**
- postWorkOrderCreation(flowId) — snapshot flow,
  create work order + flow_work_orders + two
  transitions + auto-claim
- postWorkOrderTransition(workOrderId, edgeId,
  values) — validate fields, create transition,
  delete claim
- postWorkOrderClaim(workOrderId) — create claim
  (check no unexpired claim exists)
- deleteWorkOrderClaim(workOrderId) — delete claim

### UI Design

#### Inbox View (list page)

Email-like list with two tabs: Active | Archive.

Each row shows:
- Line 1: Flow name + display_id (subject line)
- Line 2: Current state badge, "from" last
  transitioner name, relative time

Active tab: uncompleted AND unclaimed work orders.
Archive tab: completed work orders (read-only).

"+ New" button: pick a flow -> auto-transition
past start -> auto-claim -> navigate to action screen.

Clicking a row: claim + navigate to action screen.

#### Action Screen (detail page)

Header: back link to inbox, flow name + display_id,
current state name.

Fields section: dynamically rendered from current
node's fields in flow_graph. Field types map to HTML
inputs (text, textarea, number, date, select,
checkbox, radio, etc.). All fields must have non-
default values before transitions are enabled.

Transition buttons: one per outgoing edge from
current node in flow_graph, labeled with edge name.

Unclaim button: separate from transitions, releases
back to inbox.

History section: collapsible, showing all transitions
chronologically with user name, timestamp, and field
values from each state.

### Files to Create (Phase 2)

**Schema & types:**
- `SCHEMA.md` — add 4 new tables
- `api/types.ts` — add WorkOrderEntity,
  FlowWorkOrderEntity, WorkOrderTransitionEntity,
  WorkOrderClaimEntity; add WorkOrderFlowGraph type
- `api/db.ts` — add 4 entity stores to DbAdapter
- `api/db-localstorage.ts` — add 4 entity stores
- `api/api.ts` — add routes for work_orders,
  flow_work_orders, work_order_transitions,
  work_order_claims
- `api/seed.ts` �� add work order seed data

**Adapters:**
- `web-app/app/adapters/workbox.ts` — all 6 adapter
  functions (reads + operations)
- `web-app/app/adapters/index.ts` — add workbox
  barrel export

**Pages:**
- `web-app/workbox/index.ts` — inbox list page
- `web-app/workbox/index.html` — inbox markup
- `web-app/workbox/detail.ts` — action screen
- `web-app/workbox/detail.html` — action screen
  markup

**Wiring:**
- `web-app/app/page-registry.ts` — add workbox and
  workbox-detail entries
- `web-app/app/page-loader.ts` — add workbox and
  workbox-detail to pageModules
- `web-app/app/component-sidebar.html` — add Workbox
  nav item after Dashboard
- `web-app/app/icons.ts` — add workbox icon if
  needed (inbox/tray icon)

### Phase 2 Verification

- `./validate` passes
- Workbox appears in sidebar after Dashboard
- Inbox page loads with Active/Archive tabs
- "+ New" flow: pick flow, auto-transition,
  auto-claim, see action screen
- Action screen: fields rendered from flow_graph,
  transitions shown as buttons
- Fill fields, transition: values saved, work order
  appears in inbox for others
- Claim: work order disappears from inbox, action
  screen shown
- Unclaim: work order returns to inbox
- Complete: work order moves to Archive tab
- History: all transitions shown with user, time,
  values
- Claim timeout: expired claims show work order in
  inbox
- Display IDs: 8-char hex SHA-3 shown correctly

---

## Implementation Order

### Phase 1: Flow Document Model (do first)
1. Update types (FlowEntity, graph types)
2. Update schema (SCHEMA.md, db.ts,
   db-localstorage.ts)
3. Rewrite seed data
4. Update API routes
5. Rewrite flow adapters (queries, mutations,
   deletions, undo, export)
6. Update flow pages (detail, list)
7. Validate + test all flow operations

### Phase 2: Workbox (do second)
1. Add types (entities, flow graph snapshot type)
2. Add schema (4 tables, db stores, API routes)
3. Add seed data
4. Create workbox adapter
5. Create inbox page (list + tabs)
6. Create action screen (detail + fields + transitions)
7. Wire into sidebar, registry, page loader
8. Validate + test full lifecycle

# F-131 Flow-Graph Normalization — Cutover (steps 3–6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Every dispatched subagent prompt MUST begin with the literal
> `Go to Medium Church!` and then push down the codebase patterns
> in **Global Constraints** below.

**Goal:** Normalize the live flow graph out of the `flows.graph`
JSON blob (a Sin of Entangled Nouns) into four relation tables —
flipping the write, read, and freeze seams to the relations, then
retiring the live blob — while the frozen plane
(`flow_versions.graph`, `work_orders.flow_graph`) keeps its inlined
snapshot and the canvas is untouched.

**Architecture:** Expand-contract migration. Steps 1–2 already
landed the four dormant relation tables, their row validators, the
org fence for the store layer, the derive helpers
(`reassembleStoredGraph` et al.), and a dual-seed in mock-data.
This plan (steps 3–6) flips the seams: a security fence first
(Task 1), a dormant client delta-builder + HTTP gate (Task 2),
write-flip CREATE/SAVE/UNDO/REDO with a dual-write window (Tasks
3–5), the central read-flip at `GET /flows/:id` so freeze and every
`.graph` reader auto-derive (Task 6), then retire the blob (Tasks
7–12), docs (Task 13), close-out (Task 14).

**Tech Stack:** Vanilla TypeScript (ES2024, strict,
`noUncheckedIndexedAccess`), zero runtime deps. IndexedDB +
memory/localStorage backends behind a `StorageBackend` tx seam.
`node --test --strip-types` for the suite. `./validate` is the gate.

## Global Constraints

Every task's requirements implicitly include this section. Copy
verbatim into every subagent brief.

- **Scripture:** every subagent prompt begins `Go to Medium
  Church!`. Commandments touched: Entangled Nouns IX, Security II,
  Idempotency VII, Atomicity X, Derive-From-Ledger. Abominations
  risked: Null / Default values, Swallowed Failures, Foreign
  Tongues, Internal Defense, Greedy Catch.
- **Voice:** 78-char max line; 4-space indent; no inline styles
  (CSS custom properties + classes); present-tense imperative commit
  subject ≈50 chars; trailer
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
  NO plan tag in commit subjects.
- **Patterns to match:** `RequestContext` first arg to client
  adapter methods; `SafeHtml` from presenters; snake_case storage /
  camelCase domain (the adapter is the divorce point); HTTP-verb
  adapter naming (`getNoun`/`putNoun`/`deleteNoun`/
  `postNounOperation`); validators at the gate (HTTP) AND at the
  storage edge (the threaded `EntityValidator`); no untyped `any` at
  boundaries; the caller-owns-event-identity model — every id
  (`generateCryptoSafeBase62`) and every `at` (`nowUtc`) is
  client-minted into the body; the route resolves only the **author**
  from the verified token (`actor`), never re-stamps, never trusts a
  client-asserted identity.
- **TDD:** failing test FIRST, run it RED, minimal code to GREEN,
  run GREEN, commit. Tests run via `node --test --strip-types` over
  `MemoryDbAdapter` + a real `RequestContext`. Assert OUTCOMES
  (events emitted, fields persisted, exact values) — NEVER the verb
  or the stamp source. Only assertions on the LIVE `flows.graph`
  blob shape may change; behavior assertions NEVER weaken (Sin of
  Test Weakening).
- **Gate:** `./validate` GREEN after EVERY commit (tsc + `./test` +
  78-char lint + `generate-schema-svg --check`). RED ABORTS — fix
  before proceeding. Under the sandbox, `./validate` runs as-is;
  `./serve` needs `TMPDIR=/tmp/claude`.
- **History:** main checkout, NO worktrees. Linear — rebase/
  fast-forward, never merge. Build forward — never revert a landed
  commit. Tiny single-concern commits. Never move/rename AND change
  content in one commit.
- **Live-branch watch:** a concurrent HTTP-message line
  (`api/http-message/`, `tests/http-*`) commits to master
  interleaved with this work and does NOT overlap F-131. Do NOT
  touch it. Record the base commit before each task; if HEAD moved,
  rebase/fast-forward and isolate that task's review to
  `<taskcommit>~1..<taskcommit>`.
- **Re-derive anchors by SYMBOL search** at execution. Line numbers
  in this plan are orientation only — they drift; symbols do not.

---

## Resolved decisions (do not re-litigate)

1. Keep `PUT /flows/:id`; do NOT add `POST /flows/:id/save`. A later
   approved spec moved save to PUT (Idempotency VII). The fossil
   `validateFlowSaveBody` / `FlowSaveBody` / `FLOW_SAVE_KEYS` in
   `api/validators.ts` is wired to NO route — delete it (Task 12).
2. Reassemble SERVER-SIDE at `GET /flows/:id`. Freeze + every
   `.graph` reader fetch the flow via `ctx.GET<FlowEntity>(
   'flows/:id')`, so they all derive transparently — the route is
   the single divorce point; client `getFlowGraph` is unchanged.
3. Security fence is Task 1 — it MUST precede any deletion event.
4. Cutover = a short series of GREEN commits reviewed together
   (Tasks 1–6), not one diff. The dual-write/dual-seed window keeps
   each step green.
5. Carry-forward 3 (render safety) is a verification CHECKPOINT, not
   a code change: `member_id`/`attribute_id` stay `pickString`
   (already so in the landed row validators); the three node-id refs
   (`from_node_id`/`to_node_id`/`flow_node_id`) stay `asGraphId`
   (already so). Confirm during Task 4/6 review that a stored
   `member_id`/`attribute_id` cannot reach a markup-id sink
   unescaped (they flow to selector UIs, not markup ids).

## Write model (caller-owns delta)

The client diffs the working-copy `StoredGraph` against the loaded
baseline and mints ONE immutable body. Node/edge rows keep their
canvas ids (the stable FK target — `node.id`); every EVENT id
(deletions, member events, attribute events) is freshly minted
(`generateCryptoSafeBase62`); ONE `at` (`nowUtc()`) stamps the whole
save (the moment of the save). The body is identical on retry →
idempotent by construction. The route writes it verbatim and
resolves only the author from the token. ONE tx over
`['flows', 'flow_versions', 'states', 'flow_nodes', 'flow_edges',
'flow_node_members', 'flow_node_attributes']` (Atomicity X). The
blob is dual-written through Tasks 3–5 so not-yet-flipped readers
stay correct; Task 9 closes the dual-write.

The delta shape (produced by `buildSaveEvents`, validated by
`validateFlowGraphDelta`, consumed by the routes):

```ts
// web-app/app/adapters/flow-mutations.ts (Task 2)
export interface FlowGraphDelta {
    // EntityStore upserts — id is the canvas node/edge id.
    nodes: FlowNodeRowBody[];      // {id, flow_id, name,
                                   //  position_x, position_y,
                                   //  is_create, is_archive,
                                   //  task_instructions, at}
    edges: FlowEdgeRowBody[];      // {id, flow_id, name,
                                   //  from_node_id, to_node_id, at}
    // 'deleted' states-log events — entityId is a node OR edge id.
    deletions: GraphDeletion[];    // {eventId, entityId, at}
    // HistoryEntityStore appends — eventId is freshly minted.
    memberEvents: FlowNodeMemberRowBody[];    // {id, flow_node_id,
                                   //  member_id, action, at}
    attributeEvents: FlowNodeAttributeRowBody[]; // {id,
                                   //  flow_node_id, attribute_id,
                                   //  mode, is_required, action, at}
}
```

---

### Task 1 (3.0): Security — states-log tenancy fence

**The hole:** `ownerOrgOfEntity` (`api/store-parent-scoped.ts`)
resolves a `states.entity_id`'s org only by probing
`orgOwnedProbes` (org-stamped stores) then the membership ledger. A
`flow_nodes` / `flow_edges` removal is a `'deleted'` states event
whose `entity_id` is the node/edge id — it matches NO org-stamped
store and NO membership, so it resolves to `null` → treated as an
orphan → VISIBLE to every tenant via the `/states` getAll fence
(`api/db-org-scoped.ts`) and the `entity-states/:id` route guard
(`api/api.ts`). This MUST close before Task 5 writes the first
node/edge deletion event.

**Files:**
- Modify: `api/store-parent-scoped.ts` — `ownerOrgOfEntity` (extend
  to a node/edge → flow → `organization_id` two-hop before falling
  to the membership ledger).
- Modify: `api/db-org-scoped.ts` — the `states`
  `ParentScopedStateStore` resolver call site (`ownerOrgOfEntity(
  ...)` ~line 90): pass the new probe.
- Modify: `api/api.ts` — the `entity-states/:id[/history]` guard
  call site (`ownerOrgOfEntity(...)` ~line 247): pass the new probe.
- Test: `tests/store-parent-scoped-flowgraph-fence.test.ts` (new) OR
  extend the existing states-fence test if one exists — search
  first (`grep -rl "ownerOrgOfEntity\|entity-states" tests/`).

**Interfaces:**
- Consumes: `viaParent` / `viaFlowNode` two-hop pattern already in
  `api/db-org-scoped.ts`; `EntityNotFoundError` (`api/db.ts`);
  `base.flowNodes`, `base.flowEdges`, `base.flows` (UNFENCED base
  stores — a foreign parent must report its REAL org so the row is
  hidden).
- Produces: an `ownerOrgOfEntity` that, given a `flow_nodes` or
  `flow_edges` `entity_id`, returns its flow's `organization_id`;
  an absent node/edge OR absent flow still returns `null` (visible
  orphan, like every other parent-derived leaf). Signature stays
  shaped so BOTH call sites can build the probe from their
  available stores — prefer threading the flow-node/flow-edge stores
  in via a small resolver param (e.g. an added
  `graphEntityProbe?: (entityId) => Promise<Id | null>` applied
  before the membership fallback), so the org resolution lives in
  ONE function and both consumers share it.

**Design note (read before coding):** the cleanest shape is to add
an ordered probe step inside `ownerOrgOfEntity`: after the
`orgOwnedProbes` loop and BEFORE the membership ledger, try
`flowNodes.getById(entityId)` then `flowEdges.getById(entityId)`;
on a hit, resolve `flows.getById(node.flow_id).organization_id`.
Wrap each `getById` in its own try/catch translating ONLY
`EntityNotFoundError` to "miss" (one `try` per call — no greedy
catch; re-throw anything else). Both call sites pass the same three
unfenced stores. Do NOT duplicate the two-hop logic at the call
sites.

- [ ] **Step 1: Write the failing test.** Seed a `flows` row in org
  A (via the org-A scoped adapter), a `flow_nodes` row under it, and
  post a `'deleted'` states event with `entity_id` = the node id
  (author = an org-A member). Assert, through the org-B scoped
  adapter: (a) `states.getAll()` does NOT include the deletion
  event; (b) the `entity-states/:id` guard 404s for org B
  (route-level test if feasible, else assert `ownerOrgOfEntity`
  returns org A's id, not `null`); and through org A: (c) the same
  reads DO see it. Add an edge-deletion case (entity_id = an edge
  id). Add an orphan case (entity_id matching nothing → `null` →
  visible) to prove the orphan path still passes.

- [ ] **Step 2: Run it RED.** `./test` (or the focused file). Expect
  FAIL: org B currently SEES the deletion event (null owner =
  orphan = visible) — the leak.

- [ ] **Step 3: Implement the two-hop probe** in `ownerOrgOfEntity`
  and thread it through both call sites per the design note. Reuse
  the `viaParent`/`viaFlowNode` shape; one try per `getById`.

- [ ] **Step 4: Run it GREEN.** Focused file passes; then full
  `./validate` GREEN (the existing `/states` and `entity-states`
  fence tests must STAY green — behavior preserved for every
  non-graph entity).

- [ ] **Step 5: Commit.**
  `git commit -m "Fence flow-node/edge deletion events by owning org"`

---

### Task 2 (3.1): Client delta builder + HTTP gate (dormant)

**Files:**
- Modify: `web-app/app/adapters/flow-mutations.ts` — add
  `buildSaveEvents` + the `FlowGraphDelta` interface and its row-body
  interfaces, beside `buildFlowBody`.
- Modify: `api/validators.ts` — add `validateFlowGraphDelta`
  (and its body-key constant) near `validateFlowPutBody`.
- Test: `tests/adapters-flow-save-events.test.ts` (new, pure) and
  `tests/validators-flow-graph-delta.test.ts` (new, pure).

**Interfaces:**
- Consumes: `StoredGraph`, `GraphNode`, `GraphEdge`, `NodeAttribute`
  (`api/types.ts`); `generateCryptoSafeBase62`
  (`api/crypto-safe-base62.ts`); `nowUtc` (`api/types.ts`); the
  landed row validators `validateFlowNodeEntity`,
  `validateFlowEdgeEntity`, `validateFlowNodeMemberEntity`,
  `validateFlowNodeAttributeEntity` and helpers `validateTimestampField`,
  `pickString`, `asObject`, `asGraphId`, `assertOnlyKeys`
  (`api/validators.ts`).
- Produces:
  `buildSaveEvents(baseline: StoredGraph, working: StoredGraph,
  flowId: string, mint: () => string, at: string): FlowGraphDelta`
  — pure, deterministic given its inputs (ids for events come from
  `mint`; the caller passes `generateCryptoSafeBase62` and a single
  `nowUtc()`). And
  `validateFlowGraphDelta(body): FlowGraphDelta` — the HTTP gate,
  reusing the landed row validators per element plus an `eventId`/
  `entityId`/`at` shape for each deletion.

**Diff semantics (the heart of `buildSaveEvents`):**
- **nodes:** every node in `working` → an upsert row
  `{id: node.id, flow_id, name, position_x, position_y, is_create,
  is_archive, task_instructions, at}` (always upsert — create or
  move = overwrite; idempotent).
- **edges:** every edge in `working` → an upsert row
  `{id, flow_id, name, from_node_id, to_node_id, at}`.
- **deletions:** every node/edge id in `baseline` but NOT in
  `working` → `{eventId: mint(), entityId: <id>, at}`.
- **memberEvents:** per node, diff baseline `memberIds` vs working
  `memberIds`: present-in-working-not-baseline → `{id: mint(),
  flow_node_id: node.id, member_id, action: 'added', at}`;
  present-in-baseline-not-working → `action: 'removed'`.
- **attributeEvents:** per node, diff by `attributeId`: added →
  `'added'`; removed → `'removed'`; **mode OR is_required changed**
  → a NEW `'added'` row (latest-wins reads the new payload — never
  an UPDATE); unchanged → NO event.
- A node present in BOTH but whose membership/attributes are
  identical emits the node upsert row (positions may have moved) but
  NO member/attribute events.

- [ ] **Step 1: Write the failing pure tests** (`buildSaveEvents`):
  - add a node → one node upsert, no deletions/events.
  - remove a node (in baseline, absent in working) → one deletion
    with `entityId` = that node id.
  - move a node (same id, changed `position_x`) → one node upsert
    with the new position, no member/attr events.
  - add a member to a node → one `memberEvents` row `action:'added'`,
    `member_id` exact, `flow_node_id` = node id.
  - remove a member → one `action:'removed'` row.
  - add an attribute → one `attributeEvents` `'added'` with `mode`
    and `is_required` exact.
  - change an attribute's `mode` (editable→readonly) → one new
    `'added'` row carrying the new mode (NOT a 'removed').
  - no change (baseline === working) → ALL arrays empty.
  And the gate tests (`validateFlowGraphDelta`): a well-formed delta
  round-trips; an unknown top-level key throws `ValidationError`; a
  bad `at` on any element throws; a non-`asGraphId` node id in a
  member event throws.

- [ ] **Step 2: Run RED.** Expect FAIL: `buildSaveEvents` /
  `validateFlowGraphDelta` not defined.

- [ ] **Step 3: Implement** `buildSaveEvents` (pure diff) and
  `validateFlowGraphDelta` (delegates to the landed row validators
  per element; validates each deletion as `{eventId: non-empty
  string, entityId: asGraphId, at: validateTimestampField}`).
  Nothing wires it to a route yet (dormant).

- [ ] **Step 4: Run GREEN.** Focused files pass; full `./validate`
  GREEN.

- [ ] **Step 5: Commit.**
  `git commit -m "Add dormant flow-graph save-delta builder and gate"`

---

### Task 3 (3.2): Write-flip CREATE — `POST /flows`

**Files:**
- Modify: `web-app/app/adapters/flow-mutations.ts` —
  `postFlowCreation`: build the initial relation delta from the
  default graph via `buildSaveEvents(emptyGraph, defaultGraph,
  flowId, generateCryptoSafeBase62, now)` and add it to the POST
  body (KEEP the existing `flow.graph` blob — dual-write).
- Modify: `api/validators.ts` — `validateFlowCreateBody`: accept the
  new `graphDelta` key (via `validateFlowGraphDelta`).
- Modify: `api/routes.ts` — `route('flows')` `post`: expand the tx
  table list to include the four relation tables; write the
  delta's nodes/edges (`view.flowNodes.put`/`view.flowEdges.put`),
  member events (`view.flowNodeMembers.put`), attribute events
  (`view.flowNodeAttributes.put`) — there are NO deletions on
  create. KEEP the existing `flows`/`project_flows`/initial-state
  writes.
- Test: `tests/api-flows-create-relations.test.ts` (new).

**Interfaces:**
- Consumes: `buildSaveEvents`, `validateFlowGraphDelta` (Task 2);
  `view.flowNodes`/`view.flowEdges` (`EntityStore.put(id, fields)`);
  `view.flowNodeMembers`/`view.flowNodeAttributes`
  (`HistoryEntityStore.put(id, fields)`); `reassembleStoredGraph`
  (`api/flow-graph-relations.ts`) for the assertion.
- Produces: a created flow whose seeded relations reassemble to the
  default graph. Body shape: the existing create body PLUS
  `graphDelta: FlowGraphDelta`.

**Note:** node/edge upserts carry `flow_id` from the client (matches
the existing `projectFlow.flow_id` precedent); the store re-validates
via the landed row validators. Member/attribute events ride the same
tx; the author of the initial state event stays server-derived.

- [ ] **Step 1: Write the failing test.** Through the scoped
  adapter, call the create path (the route's `post` handler or
  `postFlowCreation` against a `RequestContext` over
  `MemoryDbAdapter`). Assert: `view.flowNodes.getAllWhere('flow_id',
  id)` + edges + the member/attribute ledgers, fed to
  `reassembleStoredGraph`, equal the default graph
  (`buildStartAndCompleteNodes()` → `{nodes:[start,complete],
  edges:[]}`). Assert the initial `'active'` state event still lands
  authored by the actor.

- [ ] **Step 2: Run RED.** Expect FAIL: relations empty (route does
  not write them yet) / `graphDelta` rejected by the gate.

- [ ] **Step 3: Implement** the gate change, the adapter body
  change, and the route's expanded tx + relation writes. Keep the
  blob dual-write.

- [ ] **Step 4: Run GREEN.** Focused file passes; full `./validate`
  GREEN (existing create tests stay green — the blob is still
  written).

- [ ] **Step 5: Commit.**
  `git commit -m "Seed flow-graph relations on flow creation"`

---

### Task 4 (3.3): Write-flip SAVE — `PUT /flows/:id`

**Files:**
- Modify: `web-app/app/adapters/flow-mutations.ts` — `putFlow` /
  `buildFlowBody` caller: thread the loaded baseline graph in,
  compute `buildSaveEvents(baseline, working, id,
  generateCryptoSafeBase62, now)`, add `graphDelta` to the PUT body.
  KEEP `flow.graph` (dual-write). The baseline is the graph as last
  loaded/saved (the flow designer already tracks it for undo/redo —
  search `flow-operations.ts` / the designer state for the loaded
  graph; if `putFlow` has no baseline in scope, extend its signature
  to take `baseline: StoredGraph` and pass it from the caller).
- Modify: `api/validators.ts` — `validateFlowPutBody`: accept the
  new `graphDelta` key via `validateFlowGraphDelta`.
- Modify: `api/routes.ts` — `route('flows/:id')` `put`: expand the
  tx table list to the four relation tables; write nodes/edges
  upserts, deletions (`view.states.postEvent(eventId, entityId,
  'deleted', actor, at)` — author server-derived), member +
  attribute events; KEEP the existing flow PUT, `'updated'` event,
  and optional version history. Dual-write the blob.
- Test: `tests/api-flows-save-relations.test.ts` (new).

**Interfaces:**
- Consumes: all of Task 2; `view.states.postEvent` (the deletion
  events); `reassembleStoredGraph`.
- Produces: a PUT that lands the delta in relations atomically with
  the flow row + `'updated'` event + optional version snapshot.

- [ ] **Step 1: Write the failing tests.** From a seeded flow with
  relations (reuse the Task 3 create path), apply a save that:
  adds a member, removes a member, adds an attribute, changes an
  attribute mode, moves a node, deletes a node, and deletes an edge.
  Assert `reassembleStoredGraph(relations)` equals the intended
  graph. Append-only assertions: a removed member leaves a
  `'removed'` row (the ledger never splices); re-adding leaves a new
  `'added'` row; a mode change leaves a new `'added'` row (no
  mutation of the prior). Idempotency: capture the body, replay it
  twice → byte-identical storage (no dup rows, no throw, derived
  state unchanged). Dual-write covenant: the stored `flows.graph`
  blob, parsed via `asStoredGraph`, equals
  `reassembleStoredGraph(relations)`.

- [ ] **Step 2: Run RED.** Expect FAIL: relations unchanged by the
  save / `graphDelta` rejected.

- [ ] **Step 3: Implement** the gate, adapter, and route changes.
  One `try` per concern in the route body — no greedy catch. Author
  stays `actor` for every deletion event.

- [ ] **Step 4: Run GREEN.** Focused file passes; full `./validate`
  GREEN. The existing flow-PUT tests stay green (blob still written,
  `'updated'` event unchanged).

- [ ] **Step 5: Commit.**
  `git commit -m "Write the flow-graph save delta to relations"`

---

### Task 5 (3.4): Write-flip UNDO + REDO

**Files:**
- Modify: `web-app/app/adapters/flow-mutations.ts` (and/or the
  undo/redo adapter — search `flows/:id/undo`, `flows/:id/redo`
  callers): compute the delta from the target version graph vs the
  current graph and add `graphDelta` to each body. Dual-write blob.
- Modify: `api/validators.ts` — `validateFlowUndoBody` /
  `validateFlowRedoBody`: accept `graphDelta`.
- Modify: `api/routes.ts` — `route('flows/:id/undo')` and
  `route('flows/:id/redo')` `post`: expand the tx table list; write
  the delta exactly as in Task 4, alongside the existing version-
  ledger semantics (`flowVersions.delete` for undo;
  `flowVersions.put` + trims for redo) and the `'updated'` event.
- Test: `tests/api-flows-undo-redo-relations.test.ts` (new).

**Interfaces:**
- Consumes: all of Task 4; the undo/redo target graph (decoded from
  the consumed/published frozen version via `asStoredGraph`).
- Produces: undo/redo that lands the target graph in relations
  atomically with the existing version-ledger writes.

- [ ] **Step 1: Write the failing tests.** Seed a flow, save twice
  (so a version exists), then undo → assert
  `reassembleStoredGraph(relations)` equals the prior graph; redo →
  assert it equals the post-edit graph. Cover a member add+undo and
  a node delete+undo (the node returns — a fresh upsert from the
  target graph, NOT a tombstone reversal).

- [ ] **Step 2: Run RED.** Expect FAIL: relations not updated by
  undo/redo.

- [ ] **Step 3: Implement** the gate, adapter, and route changes.

- [ ] **Step 4: Run GREEN.** Focused file passes; full `./validate`
  GREEN (existing undo/redo tests stay green).

- [ ] **Step 5: Commit.**
  `git commit -m "Write the flow-graph delta on undo and redo"`

---

### Task 6 (3.5): Read-flip GET — central flip; freeze auto-derives

**Files:**
- Modify: `api/routes.ts` — `route('flows/:id')` `get`: read the
  flow + `view.flowNodes.getAllWhere('flow_id', id)` +
  `flowEdges.getAllWhere(...)` + the member/attribute ledgers
  (`getAllWhere('flow_node_id', ...)` per node, or `getAll` filtered
  — match the derive-helper expectations), call
  `reassembleStoredGraph`, and return the flow with `graph =
  storedGraphField(reassembled)`. Because GET is a single
  `db.flows.getById` today, wrap it in a tx over `['flows',
  'flow_nodes', 'flow_edges', 'flow_node_members',
  'flow_node_attributes']` so the reads are consistent (no awaiting
  non-IDB work inside the tx — pure compute only; see the IndexedDB
  auto-commit constraint in CLAUDE.md).
- Test: `tests/api-flows-get-reassembly.test.ts` (new); plus assert
  freeze derives correctly (`tests/adapters-flow-versions` /
  `adapters-work-orders` stay green and a new round-trip case).

**Interfaces:**
- Consumes: `reassembleStoredGraph` + `currentNodeMemberIds` +
  `currentNodeAttributes` (`api/flow-graph-relations.ts`);
  `storedGraphField` (`api/types.ts`).
- Produces: `GET /flows/:id` returning `graph` reassembled from the
  relations — so `computeFlowVersionPublish`, work-order creation,
  the member-hazard reader, export, stats, and mermaid all derive
  from the relations for free (they fetch via GET). Client
  `getFlowGraph` is UNCHANGED.

- [ ] **Step 1: Write the failing tests.** Save a non-trivial graph
  (Task 4 path), then `GET /flows/:id` → assert the returned
  `graph`, parsed via `asStoredGraph`, equals the intended
  `StoredGraph` (round-trip). Publish a version → assert the frozen
  `flow_versions.graph` equals `reassembleStoredGraph(relations)`.
  Create a work order → assert the frozen `work_orders.flow_graph`
  equals the reassembled graph. Undo/redo → GET round-trips the
  target graph.

- [ ] **Step 2: Run RED.** Expect FAIL: GET returns the (stale-once-
  dual-write-stops) blob shape, not the relation-derived graph —
  prove the reassembly path is exercised (e.g. delete the blob in
  the test's stored row before GET, or assert against a graph the
  blob does NOT carry).

- [ ] **Step 3: Implement** the GET reassembly in the route tx.

- [ ] **Step 4: Run GREEN.** Focused file passes; full `./validate`
  GREEN. Freeze/hazard/stats/mermaid suites stay green.

- [ ] **Step 5: Commit.**
  `git commit -m "Reassemble the flow graph from relations on read"`

> **Broad review checkpoint:** Tasks 1–6 form the central cutover.
> Request a whole-arc review here (the security fence precedes
> deletions; write/read/freeze flip green via the dual-write
> window). Confirm carry-forward 3 (render safety) during this
> review. Only then proceed to Task 7.

---

### Task 7 (4.1): Attribute-referrer scan → keyed read

**Files:**
- Modify: `api/record-attribute-refs.ts` — flip from parsing
  `flow.graph` to a keyed read on `flow_node_attributes` by
  `attribute_id` → `flow_node_id` → `flow_nodes` → `flow_id`.
- Test: the existing record-attribute-refs test (search
  `grep -rl "record-attribute-refs\|recordAttributeRefs" tests/`);
  add a relation-backed case.

**Interfaces:**
- Consumes: `view.flowNodeAttributes.getAllWhere('attribute_id',
  ...)`; `currentNodeAttributes` / `latestByKey` to honor the
  append-only semantics (a `'removed'` attribute is NOT a current
  referrer).
- Produces: referrer behavior IDENTICAL to the blob-parsing version
  — a record attribute referenced by a current node attribute is
  reported; a removed one is not.

- [ ] **Step 1: Write the failing test.** A record attribute added
  to a node, then GET the referrer scan → it reports the flow.
  Remove the attribute (a `'removed'` event) → it no longer reports.

- [ ] **Step 2: Run RED.** Expect FAIL until the keyed read lands
  (or, if the blob path still answers, force the test to read from
  relations by asserting a case the blob no longer carries).

- [ ] **Step 3: Implement** the keyed read honoring latest-wins.

- [ ] **Step 4: Run GREEN.** Focused + full `./validate` GREEN.

- [ ] **Step 5: Commit.**
  `git commit -m "Scan attribute referrers via the relation index"`

---

### Task 8 (4.2): Resolve reverse indexes

**Files:**
- Modify: `api/db.ts` — `TABLE_INDEXES`: KEEP
  `flow_node_attributes` `['flow_node_id', 'attribute_id']` (Task 7
  reads `attribute_id`). For `flow_node_members`, AUDIT for any
  keyed `member_id` reader (`grep -rn "getAllWhere('member_id'\|
  flowNodeMembers.*member_id" api/ web-app/`). If NONE exists, drop
  `member_id` from its index per "index ONLY what a keyed read
  names." If a referrer reader DOES exist, keep it and note why.
- Regenerate: `SCHEMA.svg` (`node --strip-types
  api/generate-schema-svg.ts` or the documented regen command;
  `generate-schema-svg --check` must pass).
- Test: index-shape is covered by `generate-schema-svg --check`;
  no new behavior test unless a reader is added.

**Interfaces:**
- Consumes: the Task 7 outcome (attribute_id IS read → kept).
- Produces: `TABLE_INDEXES` reflecting only reader-justified indexes;
  `SCHEMA.svg` regenerated to match.

- [ ] **Step 1: Audit** for a `member_id` keyed reader. Record the
  finding in the task report.

- [ ] **Step 2: Apply** the decision (drop `member_id` from the
  `flow_node_members` index if reader-less; else keep + justify).

- [ ] **Step 3: Regenerate** `SCHEMA.svg`.

- [ ] **Step 4: Run GREEN.** `./validate` GREEN
  (`generate-schema-svg --check` passes).

- [ ] **Step 5: Commit.**
  `git commit -m "Drop the reader-less flow-node-member index"`
  (or `"Keep the member-id index for its referrer reader"`).

---

### Task 9 (4.3): Drop the live blob

**Files:**
- Modify: `api/types.ts` — remove `graph` from `FlowEntity`. KEEP
  `storedGraphField` / `storedWorkOrderFlowGraphField` /
  `asStoredGraph` for the FROZEN plane; narrow the pinned-contract
  comment to "frozen plane only."
- Modify: `api/validators.ts` — `validateFlowCreateBody` /
  `validateFlowPutBody` / undo / redo: stop expecting/forwarding
  `flow.graph`; `validateFlowEntity` (the storage-edge gate) stops
  requiring `graph`.
- Modify: `web-app/app/adapters/flow-mutations.ts` — `buildFlowBody`
  / `postFlowCreation`: stop emitting `flow.graph`. Stop the
  dual-write everywhere (create/save/undo/redo no longer send or
  write the blob).
- Modify: `api/routes.ts` — the flow writes no longer carry the
  blob.
- Test: update the LIVE-blob-shape assertions (the ONLY behavior-
  preserving exception — the storage covenant genuinely moved); all
  round-trip/freeze tests stay green.

**Interfaces:**
- Consumes: Task 6's reassembly (GET no longer needs the blob).
- Produces: `FlowEntity` WITHOUT `graph`; the live write path
  carries only the delta; the frozen plane still serializes via the
  surviving `storedGraphField`/`storedWorkOrderFlowGraphField`.

- [ ] **Step 1: Update the failing tests** — remove assertions that
  the live `flows.graph` blob is written (it no longer is); KEEP all
  reassembly/freeze/round-trip assertions. Add an assertion that the
  stored `flows` row has NO `graph` key.

- [ ] **Step 2: Run RED.** Expect FAIL: `graph` still emitted /
  `FlowEntity.graph` still required.

- [ ] **Step 3: Implement** the drop across types, validators,
  adapter, route.

- [ ] **Step 4: Run GREEN.** `./validate` GREEN (tsc proves no
  reader still references `FlowEntity.graph`).

- [ ] **Step 5: Commit.**
  `git commit -m "Retire the live flows.graph blob"`

---

### Task 10 (4.4): Mock-data decompose-and-discard

**Files:**
- Modify: `api/mock-data/flows.ts` / `api/mock-data.ts` —
  `buildFlows` keeps authoring the graph as a build-time literal;
  `buildFlowGraphRelations` decomposes it into seeded relation rows;
  the flow entity is stored WITHOUT `graph`. Drop the blob half of
  the dual-seed.
- Test: `tests/mock-data-flow-relations.test.ts` — narrow the
  covenant to the relations (the seeded relations reassemble to the
  authored literal graph); drop blob==relations.

**Interfaces:**
- Consumes: the authored build-time graph literal;
  `buildSaveEvents`-style decomposition OR a direct row builder
  (match whatever the dual-seed landed in step 2).
- Produces: seeded relation rows with NO stored `flows.graph`.

- [ ] **Step 1: Update the covenant test** to assert
  `reassembleStoredGraph(seeded relations)` equals the authored
  literal graph, and that no seeded `flows` row carries `graph`.

- [ ] **Step 2: Run RED.** Expect FAIL: flows seeded WITH `graph`.

- [ ] **Step 3: Implement** the decompose-and-discard seed.

- [ ] **Step 4: Run GREEN.** `./validate` GREEN (mock-data validity
  tests stay green).

- [ ] **Step 5: Commit.**
  `git commit -m "Seed mock flows from relations without the blob"`

---

### Task 11 (4.5): Snapshots + per-flow export

**Files:**
- Modify: `web-app/app/adapters/snapshots.ts` —
  `RETIRED_KEYS_PER_TABLE`: add `flows: ['graph']` so old-shape
  snapshots/backups carrying `flows[].graph` are REJECTED with the
  existing `SnapshotIncompatibleError` (no decompose-on-import).
- Modify: `web-app/app/adapters/flow-export.ts` — serialize/restore
  the four relations instead of the blob (export reads the
  reassembled graph via GET and emits relation rows; import writes
  relation rows).
- Test: `tests/adapters-snapshots-*` (old-shape snapshot → rejected)
  + a flow-export round-trip test via relations.

**Interfaces:**
- Consumes: `scanForRetiredKeys` / `SnapshotIncompatibleError`
  (`snapshots.ts`); the GET reassembly (export read);
  `buildSaveEvents`-shaped rows (import write).
- Produces: old snapshots rejected; export→import round-trips
  through relations.

- [ ] **Step 1: Write the failing tests.** A snapshot JSON with a
  `flows[].graph` key → `putSnapshotFromFile` rejects with
  `SnapshotIncompatibleError`. An export of a flow with members +
  attributes, re-imported, reassembles to the same graph.

- [ ] **Step 2: Run RED.** Expect FAIL: old snapshot accepted /
  export still blob-shaped.

- [ ] **Step 3: Implement** the `RETIRED_KEYS_PER_TABLE` entry and
  the export/import relation flip.

- [ ] **Step 4: Run GREEN.** `./validate` GREEN (snapshot
  quota/atomic-import tests stay green).

- [ ] **Step 5: Commit.**
  `git commit -m "Reject old-shape snapshots and export relations"`

---

### Task 12 (4.6): Delete the fossil gate

**Files:**
- Modify: `api/validators.ts` — delete `validateFlowSaveBody`,
  `FlowSaveBody`, `FLOW_SAVE_KEYS` (dead — wired to no route;
  confirm with `grep -rn "validateFlowSaveBody\|FlowSaveBody\|
  FLOW_SAVE_KEYS" api/ web-app/ tests/` → only the definitions).
- Test: none added; existing validator tests stay green.

- [ ] **Step 1: Confirm dead.** Grep shows only the definitions (no
  importer). If a test references it, that test is also fossil —
  delete it in the same commit (it tests dead code).

- [ ] **Step 2: Delete** the three symbols.

- [ ] **Step 3: Run GREEN.** `./validate` GREEN (tsc proves nothing
  imported them).

- [ ] **Step 4: Commit.**
  `git commit -m "Delete the unused flow-save body validator"`

---

### Task 13 (5): Docs + schema gate

**Files:**
- Modify: `SCHEMA.md` (the four relations + retired `flows.graph` +
  the state alphabets / `flow_nodes`+`flow_edges` `'deleted'`
  lifecycle), `ARCHITECTURE.md` (the storage seam + the GET divorce
  point), `FLOW-CANVAS.md` (graph reassembled at the route seam,
  canvas unchanged), `CLAUDE.md` (the Data/Database bullet — the
  flow graph is now four relations; `flows.graph` retired live, kept
  frozen).
- Regenerate: `SCHEMA.svg` (already regenerated in Task 8; confirm
  it still matches after the Task 9 `FlowEntity.graph` drop — if the
  SVG renders `flows.graph`, regenerate again here).
- Test: `generate-schema-svg --check` (part of `./validate`).

- [ ] **Step 1: Update** the four docs to the relation model, in the
  existing voice (78-char lines on every `.md` at repo root except
  TEST-PLAN.md).

- [ ] **Step 2: Regenerate** `SCHEMA.svg` if `flows.graph` still
  shows.

- [ ] **Step 3: Run GREEN.** `./validate` GREEN
  (`generate-schema-svg --check` passes; 78-char lint passes).

- [ ] **Step 4: Commit.**
  `git commit -m "Document the normalized flow-graph relations"`

---

### Task 14 (6): Close out

**Files:**
- Modify:
  `docs/superpowers/specs/2026-06-17-f131-flow-graph-normalization-design.md`
  — append a `## Status` section: `complete (steps 3–6)` with the
  commit range. Do NOT look for a "deferred-audit-findings record"
  file — it does not exist (resolved decision 5).

- [ ] **Step 1: Append** the status note (78-char lines).

- [ ] **Step 2: Run GREEN.** `./validate` GREEN.

- [ ] **Step 3: Commit.**
  `git commit -m "Mark F-131 complete through step 6"`

> **Final broad review + manual browser regression.** After Task 14,
> request a whole-arc review (F-131 scope only — isolate from the
> interleaved HTTP-message commits). Then run the `TEST-PLAN.md`
> flow-designer cases against `TMPDIR=/tmp/claude ./serve 8080`:
> add/remove members & attributes, save, reload (round-trip), create
> a work order (freeze), undo/redo, attempt an old-snapshot import
> (expect rejection).

---

## Verification (whole-plan)

- `./validate` GREEN after EVERY commit (the gate).
- Round-trip: save → GET → identical `StoredGraph` (Task 6);
  append-only lifecycle (remove → absent + `'removed'`; re-add → new
  `'added'`; mode change → latest wins, no mutation) (Task 4);
  idempotency (replay → byte-identical, no dup, no throw) (Task 4);
  freeze derives the frozen blob from relations (Task 6); old-shape
  snapshot → `SnapshotIncompatibleError` (Task 11).
- Stay green UNCHANGED (behavior preserved): `flow-operations`,
  `adapters-flow-publish`, `flow-graph-hazard`, `flow-stats` (×3),
  `mermaid`, `adapters-members-union`, `adapters-flow-versions`,
  `adapters-work-orders`, record-transition tests. The ONLY
  permitted assertion change is the LIVE `flows.graph` blob shape
  (Task 9) — behavior assertions never weaken.

## Out of scope

ARC 2 (drop materialized `claim_expired`; restructure event-bearing
bodies) and ARC 3 (Postgres server tier) are SEPARATE arcs —
brainstorm + explicit go-ahead before any code. No server tier, no
decompose-on-import, no canvas rewrite. Execute the request, not the
request plus improvements.

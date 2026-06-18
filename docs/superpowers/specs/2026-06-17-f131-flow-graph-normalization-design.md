# F-131 — Flow-graph relationship normalization

*Sin of Entangled Nouns (Commandment IX). Multi-session arc.
Breaking-schema window. Plan tag: `[F-131]`.*

This is the approved, self-contained design of record for F-131. It
mirrors the user-approved plan. The original audit defect and doctrine
clause live in the F-131 section of the deferred-audit-findings record;
this spec carries the data model, seams, idempotency invariant,
migration stance, code anchors, reuse, sequencing, tests, and
verification. Re-derive every code anchor by SYMBOL search at execution
— line numbers drift, symbols do not.

## Context

`api/types.ts` `GraphNode` embeds two relationships as arrays inside
the `flows.graph` JSON blob: `memberIds: MemberId[]` and
`attributes: NodeAttribute[]`. A foreign key buried in a blob is not a
relationship — it is a denormalization welded into a value, with no
moment of union. Codd: relationships occupy their own relations; the
Church adds the moment of union (`at`).

**Agreed direction (Option C, full normalization):** extract
`flow_nodes` + `flow_edges` into their own relations (real FKs), then
`flow_node_members` + `flow_node_attributes` as relationship ledgers,
each with a moment-of-union `at`. Retire the LIVE `flows.graph` blob;
frozen `flow_versions.graph` and `work_orders.flow_graph` KEEP an
inlined serialized snapshot at freeze (Immutability VI — a frozen value
is not a live relationship).

This rewrites the storage seam, freeze, ~the readers, mock-data,
snapshot/export, docs, and tests — but NOT the canvas (drag/gesture/
layout/undo-redo), because the domain `GraphNode` shape is preserved
and reassembled at read time.

## Approved design decisions

1. **Append-only ledgers, never DELETE.** `flow_node_members` and
   `flow_node_attributes` are `HistoryEntityStore` ledgers (like
   `role_grants`, `flow_versions`). Removal is a new row with
   `action: 'removed'`, never a hard splice or a states-log tombstone.
   Current state derived via `latestByKey` keeping the latest
   `'added'`. This is the codebase's existing ledger idiom — no new
   machinery.
2. **Entities vs ledgers, two removal idioms (must not mix).**
   `flow_nodes` / `flow_edges` are `EntityStore` (live, mutable; edit =
   PUT-overwrite by stable id; removal = a `'deleted'` states-log
   EVENT, not a hard splice). The ledgers are `HistoryEntityStore`
   (which by its own doctrine never reads the states log — its removal
   lives in its own `action` column).
3. **Zero server/DB id generation. Every id is app-minted**
   (`generateCryptoSafeBase62`, called in `web-app`) and rides in the
   request body — node/edge ids AND every lifecycle/ledger event id.
4. **The POST body is identical on retry.** All ids AND all `at`
   timestamps are minted client-side into an immutable body; the route
   writes them verbatim. `nowUtc()` LEAVES the write path. The route's
   only contribution to a stored row is the author, resolved from the
   verified token (identity is never client-asserted — Security II).
   Result: `POST …/save` is idempotent by construction — identical body
   + identical token ⇒ identical writes, every PUT a no-op on replay.
   Idempotent in derived state, not merely row count.
5. **`action` vocabulary:** `'added' | 'removed'`. Same-`at` ties fail
   closed (`'removed'` outranks `'added'`), mirroring `role_grants`'
   `failClosed`.
6. **Edges in scope** as `flow_edges` (named transitions = entities).
7. **Reject, no migration until Postgres.** Browser data is
   wipe-and-reseeded on the breaking change (existing
   `MissingTableError` → recovery behavior). Old-shape snapshots/
   backups carrying `flows[].graph` are REJECTED via
   `RETIRED_KEYS_PER_TABLE.flows` (existing "Re-snapshot from current
   state" error). No decompose-on-import.

## Data model — four new relations

**Entities (`EntityStore`; PUT by stable id; removal = `'deleted'`
states-log event):**

```
flow_nodes
  id (= canvas node id, the real FK target), flow_id FK→flows,
  name, position_x, position_y, is_create, is_archive,
  task_instructions, at
  index ['flow_id'] · org-fenced via parent flow

flow_edges
  id (= canvas edge id), flow_id FK→flows, name,
  from_node_id FK→flow_nodes, to_node_id FK→flow_nodes, at
  index ['flow_id'] · org-fenced via parent flow
```

**Relationship ledgers (`HistoryEntityStore`; removal = new `'removed'`
row; derive via `latestByKey`):**

```
flow_node_members            (pure join + moment of union)
  id (per event), flow_node_id FK→flow_nodes, member_id FK→members,
  action 'added'|'removed', at
  index ['flow_node_id', 'member_id']
  current = latestByKey(node rows, by member_id) keep 'added'

flow_node_attributes     (relationship-entity — carries payload)
  id (per event), flow_node_id FK→flow_nodes,
  attribute_id FK→record_attributes,
  mode 'editable'|'readonly', is_required, action 'added'|'removed', at
  index ['flow_node_id', 'attribute_id']  (attribute_id index also
  serves the record-attribute referrer scan)
  current = latestByKey(node rows, by attribute_id) keep 'added';
            the winning row carries current mode/is_required —
            a mode/required change is a new 'added' row, never UPDATE
```

All columns NOT NULL (Sin of Null); `''` task-instructions / edge name
are self-disclosing empties.

## Seams

**WRITE — `POST flows/:id/save`.** Client diffs working-copy
`StoredGraph` vs the loaded baseline; mints an id + `at` for every row
and event; sends one immutable body:
`{ nodes, edges, lifecycleEvents, memberEvents, attributeEvents,
version? }`. Route validates at the gate (before the tx), then ONE tx
over all touched tables: `PUT flow_nodes/flow_edges` by id; write
lifecycle events (state log) and ledger rows (`flow_node_members` /
`flow_node_attributes`) by their client ids with the client `at`;
author from token. New `buildSaveEvents` lives beside `buildFlowBody`
at the adapter seam — the canvas is untouched.

**READ — `GET flows/:id`** reassembles `StoredGraph` from relations
(nodes/edges live-filtered; members/attributes via `latestByKey`
keeping `'added'`), so the client `getFlowGraph` adapter is unchanged.

**FREEZE — `computeFlowVersionPublish` + work-order creation** derive
the same `StoredGraph` from live relations, then serialize it through
the EXISTING `storedGraphField` / `storedWorkOrderFlowGraphField` into
the frozen `flow_versions.graph` / `work_orders.flow_graph` blobs —
inlined, immutable, never re-read into relations. `storedGraphField` /
`asStoredGraph` survive, narrowed to the frozen plane (the pinned-
contract comment at `types.ts:1040` stays true).

**UNDO/REDO** feeds a frozen version's decoded graph in as the working
copy and runs the same diff — no special machinery.

## Critical files (re-derive anchors by symbol at execution)

- **Types:** `api/types.ts` — `GraphNode` (974), `NodeAttribute` (48),
  `GraphEdge` (986), `StoredGraph` (993), `FlowEntity` (1010, drop
  `graph`), `WorkOrderFlowGraph` (1033), `storedGraphNode` (1056),
  `storedGraphField` (1093), `storedWorkOrderFlowGraphField` (1099),
  `nowUtc` (377). Add 4 entity interfaces.
- **Validators:** `api/validators.ts` — `asNodeAttribute` (246),
  `asGraphNode` (355), `asStoredGraph` (429),
  `validateWorkOrderFlowGraphJson` (469). Add 4 entity validators; add
  a `validateFlowSaveBody` shape for the new event-bearing save body.
- **Storage registration:** `api/db.ts` `TABLE_NAMES` (426),
  `TABLE_INDEXES` (471), `DbStores` (291); `api/db-backed.ts` fields
  (~108) + `#buildStores` (~312); `api/db-org-scoped.ts` (56, parent-
  scope leaf tables via the flow); `api/snapshot-validator.ts` switch
  (~78). Stores: `api/store-entity.ts`, `api/store-history-entity.ts`,
  `api/store-state.ts`, `api/ledger-reduction.ts` (`latestByKey`).
- **Routes:** `api/routes.ts` — `flows` (762), `flows/:id/save` (820),
  `undo` (856), `redo` (888), work-orders (1147). Expand each tx table
  list with the 4 new tables; move `at` into the body.
- **Adapters (client):** `web-app/app/adapters/flow-mutations.ts`
  (`buildFlowBody` 101, `putFlow` 126 — add `buildSaveEvents`);
  `flow-queries.ts` `getFlowGraph` (170, reassemble);
  `flow-versions.ts` `computeFlowVersionPublish` (85, derive frozen);
  `flow-publish.ts` (member hazard, 34); `flow-export.ts`;
  `flow-defaults.ts`; `work-orders-mutations.ts` (~144);
  `work-orders-queries.ts`; `record-transitions.ts` (109, frozen-read,
  unchanged).
- **App logic:** `web-app/app/flow-graph.ts` `shouldShowMemberHazard`
  (~440), `buildNode` (454); `flow-operations.ts` (id minting 295,683).
- **Snapshot/legacy:** `web-app/app/adapters/snapshots.ts`
  `RETIRED_KEYS_PER_TABLE` (40, add `flows: ['graph']`),
  `scanForRetiredKeys` (110), `SnapshotIncompatibleError` (97).
- **Mock-data:** `api/mock-data/flows.ts` `buildFlows`;
  `api/mock-data.ts` (349 call; 514-572 frozen work-order graphs;
  255-290 role_grants seed pattern for ledger seeding).
- **Docs + gate:** `SCHEMA.md`, `ARCHITECTURE.md`, `FLOW-CANVAS.md`,
  `CLAUDE.md`; `generate-schema-svg.ts` + regenerate `SCHEMA.svg`.

## Reuse (do not reinvent)

- `HistoryEntityStore` (`api/store-history-entity.ts`) — the
  append-only ledger store.
- `latestByKey` (`api/ledger-reduction.ts`) + `currentRolesForInOrg` /
  `failClosed` (`api/authorization.ts`) — the derive-from-ledger
  template for `role_grants`; copy its shape for member/attribute
  derivation.
- `computeFlowVersionPublish` (`flow-versions.ts`) — derive-then-write
  freeze model.
- `generateCryptoSafeBase62` (`api/crypto-safe-base62.ts`) + `nowUtc`
  (`api/types.ts`) — the app-side id/timestamp minters.
- `EntityStore` + states-log lifecycle (`store-entity.ts` /
  `store-state.ts` `postEvent`) — the entity create/delete idiom.

## Sequencing — tiny `[F-131]` commits, `./validate` GREEN each, linear

0. Persist this design as this spec; commit.
1. **Additive, dormant:** 4 entity types + validators; register the 4
   tables (`TABLE_NAMES`/`INDEXES`, `DbStores`, `db-backed` stores,
   org-scope, snapshot-validator); reassembly + `latestByKey` derive
   helpers with pure tests. Nothing reads them yet.
2. **Dual-seed:** mock-data seeds relations ALONGSIDE the existing blob
   so the tables are populated before any reader.
3. **Seam cutover (central commit):** `GET` reassembles from relations;
   `POST …/save` writes the client-minted event delta to relations;
   freeze derives the frozen blob from relations. Read + write + freeze
   flip together; round-trip tests prove it.
4. **Retire the live blob:** drop `graph` from `FlowEntity` / live save
   path (keep `storedGraphField` for freeze only); drop the dual-seed
   blob half; add `flows: ['graph']` to `RETIRED_KEYS_PER_TABLE`.
5. **Docs + gate:** update the four docs; regenerate `SCHEMA.svg`
   (`--check`).
6. **Close out:** delete the F-131 section from the
   deferred-audit-findings record.

## Test strategy (Office of Verification — behavior, not the sausage)

- **New (TDD, `MemoryDbAdapter`):** relation round-trip (save → GET →
  identical `StoredGraph`); append-only lifecycle (remove → absent +
  `'removed'` row; re-add → present + new `'added'`; mode change →
  latest wins, no mutation); idempotency (replay identical body →
  byte-identical storage, no dup, no throw); pure `latestByKey`
  derivation sequences; old-shape snapshot →
  `SnapshotIncompatibleError`.
- **Stay GREEN unchanged (behavior preserved):** `flow-operations`,
  `adapters-flow-publish`, `flow-graph-hazard`, `flow-stats` (×3),
  `mermaid`, `adapters-members-union`.
- **Frozen-plane GREEN untouched:** `adapters-flow-versions`,
  `adapters-work-orders`, record-transition tests (frozen blobs do not
  change).
- **Weakening boundary:** only assertions on the LIVE `flows.graph`
  blob shape may change (that storage covenant genuinely moved);
  behavior assertions never weaken.

## Verification

- `./validate` GREEN after EVERY commit (tsc + `./test` + 78-char lint
  + `generate-schema-svg --check`). It is the gate; a RED aborts.
- Manual browser regression against `TEST-PLAN.md` flow-designer cases
  (`TMPDIR=/tmp/claude ./serve 8080`): add/remove members & attributes,
  save, reload (round-trip), create a work order (freeze), undo/redo,
  attempt an old-snapshot import (expect rejection).

## Step-3 carry-forward (verified in step 1)

Adversarial verification of step 1 surfaced items the seam
cutover (step 3) MUST address — recorded here so the multi-
session arc cannot lose them:

1. **States-log tenancy fence (Security II) — close BEFORE
   posting any node/edge deletion event.** A `flow_nodes` /
   `flow_edges` removal is a `'deleted'` states-log event whose
   `entity_id` is the node/edge id. But `ownerOrgOfEntity`
   resolves an event's org only via `orgOwnedProbes` (stores
   carrying `organization_id`) plus the membership ledger.
   `flow_nodes` / `flow_edges` carry NO `organization_id` and
   are NOT in `orgOwnedProbes`, so such an event resolves to a
   null owner — an orphan, VISIBLE to every org via the
   `/states` read fence (a cross-tenant leak of the deleted id +
   timestamp). Step 1 writes ZERO such events, so it does not
   trigger this. Step 3 MUST resolve a flow-node/flow-edge
   `entity_id` to its flow's org (e.g. a node→flow hop inside
   `ownerOrgOfEntity`) before the save delta posts the first
   `'deleted'` node/edge event.
2. **Confirm or remove the reader-less indexes.** The
   `flow_node_members.member_id` and
   `flow_node_attributes.attribute_id` `TABLE_INDEXES` entries
   have no keyed reader in step 1 (the derive helpers read only
   by `flow_node_id`). They are the reverse-lookup seams the
   plan names for step 3 (member/attribute referrer scans). If
   step 3 adds those keyed reads, keep them; if not, remove them
   per the "index ONLY what a keyed read names" doctrine.
3. **Reconsider the graph-id fence on `member_id` /
   `attribute_id`.** These stay plain strings (matching the
   legacy `asMemberIds` / `asNodeAttribute` and
   `state_field_values.attribute_id`); the three node-id
   references (`from_node_id` / `to_node_id` / `flow_node_id`)
   are `asGraphId`-pinned. When the save delta + render path
   land, deliberately confirm a stored `member_id` /
   `attribute_id` cannot reach a markup-id render site
   unescaped.

## Out of scope / non-goals

- Server tier / Postgres; real tenant isolation (HMAC key still
  client-shipped). True moment-of-union for legacy data (none
  recorded). No decompose-on-import. No canvas rewrite. Execute the
  request, not the request plus improvements.

## Status: complete (steps 3–6)

Steps 1–2 (additive dormant relations + dual-seed) landed earlier
(cf214b32→3443166f). Steps 3–6 — the seam cutover, blob retirement,
docs — landed via subagent-driven development under
`docs/superpowers/plans/2026-06-17-f131-flow-graph-normalization-cutover.md`
(commits 797418d1→ this close-out, on master). The live flow graph is
fully normalized into `flow_nodes` / `flow_edges` / `flow_node_members`
/ `flow_node_attributes`; the live `flows.graph` blob is retired
(`FlowEntity` drops it; the GET routes reassemble into a `FlowWithGraph`
read DTO; freeze + work-order + stats + hazard + export auto-derive).
The frozen plane (`flow_versions.graph`, `work_orders.flow_graph`)
keeps its inlined snapshot. Each commit passed `./validate`; the
central cutover (steps-3 commits) passed a clean broad review.

Carry-forward resolution:
1. States-log tenancy fence — closed as the FIRST commit (a node/edge
   `'deleted'`/`'restored'` event resolves to its flow's org via a
   tombstone-blind two-hop in `ownerOrgOfEntity`).
2. Reader-less indexes — `flow_node_attributes.attribute_id` kept (the
   record-attribute referrer scan reads it); `flow_node_members
   .member_id` dropped (no keyed reader).
3. Render safety — confirmed: stored `member_id` / `attribute_id` stay
   `pickString` and reach member/attribute SELECTOR UIs, not a
   markup-id sink; the three node-id refs (`from_node_id` /
   `to_node_id` / `flow_node_id`) stay `asGraphId`-pinned.

Discovered + resolved during execution: the spec's "undo … no special
machinery" was incomplete — reviving a deleted node/edge on undo/redo
needs a `'restored'` states event to supersede the `'deleted'`
tombstone (the latest `(at, id)` event wins); implemented as a sibling
`revivals` array on the undo/redo body (not inside the shared
`FlowGraphDelta`).

Approved follow-up (NOT in this arc): flow creation `POST /flows` is an
Idempotency-VII sin (INSERT); the client already mints the id, so a
later spec corrects it to a direct `PUT /flows/:id` (create-or-update)
and REMOVES the POST route — mirroring the shipped SAVE verb
correction.

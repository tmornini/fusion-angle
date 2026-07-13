# States-URI Elimination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Repo covenant:** every subagent prompt MUST begin with `Go to Medium Church!` and push down the voice rules (78-char lines, 4-space indent, RequestContext-first adapters, SafeHtml presenters, snake_case wire / camelCase domain, ~50-char present-imperative commit subjects with the mandated trailers).

**Goal:** Eliminate the entire states-read URI family — `GET /states`, `GET /states/:id/field-values`, `GET /entity-states/:id/history` — replacing it with per-URI history reads (`GET <family>/:id/history`, current-first) derived from the pair plane, then fully purge every `/states` / `entity-states` URI string from code, tests, comments, and docs.

**Architecture:** The requests/responses tables are append-only (`HistoryEntityStore`); every existing states route is already a pure derivation over them, and transition op-pair bodies already fold field values. So the replacement surface re-addresses existing derive machinery under family-native URIs (read follows the `work-orders/:id/transition` write addresses), and head-state consumers switch to a lifecycle trio (`state`, `state_at`, `state_event_id`) newly embedded in GET entity rows — stamped from the lifecycle-current event walk (genesis-wins-under-skew), never the head PUT body.

**Tech stack:** Vanilla TypeScript ES2024, zero deps; `node --test --strip-types`; `./validate` gate.

## Global constraints

- Every commit passes `./validate` (tsc, full test suite, 78-char lint, schema-svg gate). Linear history, main checkout, no worktrees.
- One concern per commit; subjects ≈50 chars, present-tense imperative, with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and `Claude-Session` trailers.
- TDD for every new route/derive: failing test → run → minimal code → green → commit.
- Invariants that must NOT move: mock-data pair count **1506**; `SNAPSHOT_SCHEMA_VERSION` **5**; SCHEMA.svg unchanged; no pair-plane address changes (historical transitions already live at `work-orders/:id/transition`).
- History responses sort `(at, id)` **DESC** — index 0 is current (user directive: latest→earliest).
- Honest-status covenants keep their force on the new surface: 401-before-404; foreign→403 honest body; absent→404; field-values three-way becomes inline-fold parity.
- End state: `grep -rn "/states\|entity-states" api web-app tests shared *.md` → **zero hits** (table-vocabulary `'states'` strings without a slash are exempt — see Out of scope).

## Context

User request: "eliminate any/all /states/ URIs from the code base," clarified to: (1) **whole states-read family** including `entity-states/:id/history`; (2) replacement = **`GET /:id/history` per URI**, all versions latest→earliest, derived from historical responses-table entries (derivability confirmed — the current routes already derive exactly this from pairs); (3) **full string purge** including pins, probes, and doc narrative.

The `/states` routes are the last URI fossils of the deleted `states` table. The write plane migrated already (861 seed transitions at `work-orders/:id/transition`); this completes the read plane. Verified corrections that shape the plan: GET entity rows do **not** yet carry the trio (only stored PUT bodies do — server widening required first); `deriveFlowGraphStates`' only real callers are the two dying derives; `matchesOnSegmentBoundary` already authorizes `/history` sub-paths under existing family GET grants; `lastActivityAt` is production-dead.

## Design decisions (settled)

**New routes** (9 registrations, one shared handler pattern):

| Route | Derive source | Miss posture |
|---|---|---|
| `GET ideas\|projects\|records\|flows\|objectives/:id/history` | family `derive*StateHistory` (e.g. `deriveIdeaStateHistory`, api/derive-ideas.ts:191) | empty → `missedReadError(db, id, org, '<table>')` → 403 foreign / 404 absent |
| `GET members/:id/history` | `deriveMemberStates(db)` filtered to `entity_id` | empty → `EntityNotFoundError('members', id)` (global-family posture) |
| `GET work-orders/:id/history` | `workOrderLifecycleStatesFor` reborn + inline field-values fold | empty → `missedReadError(..., 'work_orders')` |
| `GET work-orders/history` | new `deriveWorkOrderHistories(db, org)` (org-prefix scoped) | always 200 array |
| `GET objectives/history` | new `deriveObjectiveHistories(db, org)` | always 200 array |

- **Route order is load-bearing:** register `work-orders/history` immediately before the `work-orders/:id` documentEntityRoute (api/routes.ts:4406) and `objectives/history` before `objectives/:id` (:4961) — `matchRoute` (routes.ts:5123) is exact-segment first-match; pin with tests (literal wins; a real id still resolves).
- **No new authorization entries:** `matchesOnSegmentBoundary` (api/authorization.ts:81-100) extends existing family GET grants to `/history`. Phase C deletes MEMBER_VERBS `'/states/:id/field-values'` (:138), `'/states'` (:140), `'/entity-states'` (:141).
- **No api.ts pre-dispatch guard needed:** each derive reads only the token org's `uri_prefix` addresses; empty + `missedReadError` reproduces the honest 403/404 exactly as `GET ideas/:id` does today. The entity-states guard (api/api.ts:436-465) dies with its route.
- **Wire shapes** (snake_case, DESC): trio families + members + `objectives/history` emit `StateEntity` rows `{id, entity_id, state, member_id, at}` (type survives at api/types.ts:447). Work-order routes emit `WorkOrderHistoryEventEntity extends StateEntity { field_values: TransitionFieldValueEntity[] }` with `TransitionFieldValueEntity {id, attribute_id, value}` — folded from transition pair bodies (head-reduced per fv-row id, the `stateFieldValuesFrom` rule); `[]` on claim/birth/release rows. This kills `GET /states/:id/field-values` with no successor route.
- **Bulk strategy:** inbox and flow-stats use `GET work-orders/history` (one request replaces two `/states` scans; N-per-WO rejected — 145 seeded WOs). Project-detail archival stream uses `GET objectives/history`. Embedding lifecycle summaries on work-order rows was rejected (second mechanism, drift-pinned shape churn, still insufficient for flow-stats).
- **Trio embedding:** widen GET row shapes for ideas/projects/records/objectives/members with `state`, `state_at`, `state_event_id`, stamped from the lifecycle-current event the family derives already compute (derive-ideas.ts:110-160 pattern; records/objectives via `DocumentFamilyWiring.entityOf` receiving the current `StateEntity` for `'trio'` wirings, api/document-family.ts:199-233/:304-361). Flows skipped (no consumer); `WORK_ORDERS_WIRING` is `'stateless'` — untouched.
- **Adapter restructure:** `web-app/app/adapters/state-events.ts` dissolves. Work-order readers move to work-orders-queries.ts rebuilt on `getWorkOrderHistory(ctx, id)` / `getWorkOrderHistories(ctx)`; `getObjectiveHistories(ctx)` lands in objectives.ts; trio readers delete in favor of row fields. Production-dead fossils delete: `getRecordState` (records.ts:97), `getProjectState` (state-events.ts:393), `lastActivityAt`/`lastActivityText` (admin.ts:111 — zero presenter callers).
- **Derive kill list:** `deriveStates`, `deriveStatesFor`, `deriveTrioFamilyStates`, `trioFamilyPrefixesFor`, `fenceStatesByOwner`, `unionById`, `sameStateEntity`, `deriveFlowGraphStates` (+ private helpers), `documentStateHeadFor`, `stateFieldValuesForStateEvent`. **Survivors:** `missedReadError`, `resolveOwningOrganization` (all legs), `resolveGlobalOwner`, `stateEventVisibilityFor`, `operationPairsAt`, `deriveMemberStates`, `deriveWorkOrderLifecycle` (refactored to a prefix-filtered core), `workOrderLifecycleStatesFor` (reborn), `workOrderClaimHistoryFor`, `workOrderDocumentHeadFor`, invitation derives, `stateFieldValuesFrom`/`deriveStateFieldValueReferrers` (record-attribute-refs.ts callers).

---

## Phase A — additive server surface (old routes stay live)

Each task: write the failing wire-level test first (through `handleRequest`, like existing suites), see it fail, implement, `./validate` green, commit.

- [ ] **A0. Commit this plan** to `docs/superpowers/plans/2026-07-12-states-uri-elimination.md`. Commit: `add states-uri elimination plan`
- [ ] **A1. Work-order per-id history.** Create `tests/api-work-order-history.test.ts`: seeded WO chain (create/claim/transition-with-values/release) → 200 DESC rows, row[0] current; transition rows carry `field_values` `{id, attribute_id, value}`; claim rows carry `[]`; foreign WO → 403 `forbidden: work_orders/<id> belongs to a different organization`; absent → 404; unauthenticated → 401. Implement `workOrderHistoryFor(db, organization, workOrderId)` in api/derive-states.ts (reuse `workOrderLifecycleStatesFor` core + fold map), types in api/types.ts, `route('work-orders/:id/history', {get})` in api/routes.ts. Extend tests/derive-work-order-lifecycle-for.test.ts for the fold. Commit: `add work-order per-id history derive and route`
- [ ] **A2. Work-orders collection history.** Tests: route-order pin (literal `history` wins; real id resolves entity); org isolation (org B rows absent); parity vs per-id route. Implement `deriveWorkOrderHistories(db, organization)` (extract prefix-filtered core from `deriveWorkOrderLifecycle`, api/derive-states.ts:1248-1361); register before the `work-orders/:id` wiring (routes.ts:4406); add `'work-orders/history'` to COLLECTION_ROUTES in tests/api-routes.test.ts. Commit: `add org-scoped work-orders collection history`
- [ ] **A3. Trio-family per-id history routes.** Create `tests/api-entity-history-routes.test.ts`: per family (ideas/projects/records/flows/objectives) — document-PUT lifecycle seeded → 200 DESC current-first; foreign → 403 honest family body; absent → 404; one org-nested facade leg (`/organizations/:org/ideas/:id/history`) rides free. Implement one shared handler builder parameterized by (derive fn, table name); five registrations. Commit: `add per-id history routes for trio families`
- [ ] **A4. Members per-id history.** Test: `PUT members/:id` archive → history DESC with authored `member_id` (re-homes the api-actor-from-token authorship covenant); absent → 404. Register near `route('members')`. Commit: `add members per-id history route`
- [ ] **A5. Objectives collection history.** Test: archive/reactivate/re-archive one objective → both `archived` events present; isolation leg; route-order pin. Implement `deriveObjectiveHistories(db, organization)` in api/derive-objectives.ts; register before `objectives/:id` (routes.ts:4961); COLLECTION_ROUTES + `'objectives/history'`. Commit: `add objectives collection history route`
- [ ] **A6–A10. Embed lifecycle trio in GET rows — one family per commit** (ideas, projects, records, objectives, members). Per family: extend the drift suite first (expect `state`, `state_at`, `state_event_id`, plus one clock-skew case proving the trio comes from the lifecycle-current event — the case-7d guarantee — not the head body); widen the entity interface in api/types.ts; stamp in the family derive (ideas/projects direct; records/objectives via `DocumentFamilyWiring.entityOf`; members via `memberParentOf`). Commits: `embed lifecycle trio in <family> GET rows`

## Phase B — client re-homing (old routes still live; each commit deletes its own reads)

- [ ] **B1–B3. Ideas, projects, records list/detail** read the row trio; drop `getIdeaStateDetail(s)`/`getProjectStateDetail(s)`/`getRecordStateDetail(s)` usage; delete `getRecordState` (retarget its throws-on-absence pin to the row-absence error at records.ts:171-175). Adapter test stubs gain trio fields, lose `'states'` keys. Commits: `read <family> lifecycle from embedded row trio`
- [ ] **B4. Members.** `getMembers` 5-way `Promise.all` (members-union.ts:107-115) drops the `'states'` read; singles read row trio. Commit: `read member lifecycle from embedded row trio`
- [ ] **B5. Dashboard/header stats.** dashboard.ts:75/:215-217, project-scoring.ts, flow-export.ts:466 use the entity rows already fetched; delete `getIdeaStates`/`getProjectStates`. This removes 2 requests from EVERY sidebar page (header-info.ts). Commit: `derive dashboard stats from entity row trios`
- [ ] **B6. Objective archival.** `getArchivedObjectiveIds` → row trio; `getObjectiveArchivalEvents` → new `getObjectiveHistories(ctx)` filtered to `state === 'archived'` (projection `{objectiveId, memberId, at}` unchanged for projects/detail.ts:941). Commit: `re-home objective archival stream to history route`
- [ ] **B7. Drop dead org last-activity.** `deriveOrganizationFacts` loses the states read; delete `lastActivityAt`/`lastActivityText`; update tests/adapters-admin.test.ts:305-340, presenter-projects-organization.test.ts:143 fixture. Commit: `drop production-dead organization last-activity`
- [ ] **B8. Work-order singles.** Add `getWorkOrderHistory(ctx, id)`; rebuild `getWorkOrderCurrentNodeId`/`getWorkOrderActiveClaim`/`getWorkOrderTransitionEvents` on it; workbox/detail.ts builds `fieldValuesByEvent` from history rows (drop `getStateFieldValuesByEvent`/`ForEvent`); record-transitions.ts validation gate uses ONE history read; work-orders-mutations.ts:265-267 claim-release check likewise. Commit: `re-home work-order reads to per-id history`
- [ ] **B9. Bulk + dissolve.** Add `getWorkOrderHistories(ctx)` (Map grouped, DESC per group); workbox/index.ts collapses two states scans into it; flow-stats swaps (sorts ASC locally); move `TransitionEvent`/`projectTransitions` into work-orders-queries.ts; **delete state-events.ts**; prune adapters/index.ts; retire tests/adapters-state-events.test.ts naming where each covenant's force now lives. Commit: `re-home inbox and flow stats to bulk history`

## Phase C — deletion and covenant retargeting

- [ ] **C1. Retarget ~18 seeded-then-read test files** from `entity-states/:id/history` to family history routes (both live during this commit; DESC flips ordered assertions). Files: api-records-write, api-idea-conversion, api-ideas-create, api-flows-create(-relations), api-flows-save-relations, api-flows-undo-redo-relations, adapters-flow-mutations, api-human-members, api-ai-members, adapters-ai-members, adapters-members, api-actor-from-token:52, adapters-work-orders:788, derive-objectives.test:83-103, api-organization-isolation:979-1001 (403 body becomes the family's), drift-states case 2 → per-family history parity. Commit: `retarget history probes to family routes`
- [ ] **C2. Delete `GET entity-states/:id/history`:** route + comment block (routes.ts:5054-5075), api.ts:430-466 guard, authorization.ts:141, `deriveStatesFor`; api-states-ownership-fence entity-states cases fold into the new family-history fence coverage; api-fence-redaction states leg dies (redaction stays pinned by its other legs); measure-profile-core.test.ts labels → `work-orders/:id/history`. Commit: `retire entity-states history route and guard`
- [ ] **C3. Delete `GET /states`:** route (routes.ts:5044-5053), authorization.ts:140, kill-list derives + module header rewrite; api-organization-isolation states legs → force lives in A2/A5 isolation legs; **store-parent-scoped-flowgraph-fence.test.ts retires whole** (every probe is a states URI — surviving force named: flow-doc isolation → api-organization-isolation flows legs; sidecar integrity → undo/drift suites; graphDelta visibility → drift-phase15 `stateEventVisibilityFor` cases); drift-states cases rework onto collection-history parity; COLLECTION_ROUTES drops `'states'`. Commit: `retire bulk states collection route`
- [ ] **C4. Delete `GET states/:id/field-values`:** route (routes.ts:4460-4484), authorization.ts:138, `stateFieldValuesForStateEvent` (verify whether `isVisibleStateEvent` becomes single-caller; keep `stateFieldValuesFrom`/`deriveStateFieldValueReferrers`); drift-state-field-values reworks route cases into inline-fold parity on work-order history. Commit: `retire state field-values read route`
- [ ] **C5. Dead-code sweep:** `documentStateHeadFor` + tests/derive-document-state-head-for.test.ts + drift-phase14 section :344-520 (its `workOrderLifecycleStatesFor` sections stay — now covering the live core); `getProjectState` (retarget adapters-project-publish probes to project row trio); unused imports. Commit: `remove states-era dead derives and tests`

## Phase D — full string purge

- [ ] **D1. Re-anchor retirement pins on neutral paths:** api.test.ts:77-92 and shadow-ledger-invariants.test.ts:337-350 → one generic unknown-route pin (e.g. `PUT /no-such-route/x1`, preserving the writes-nothing force); api-actor-from-token.test.ts:16-33 keeps the document-trio authorship case, drops the states leg; api-states-ownership-fence finishes rebirth → rename `api-history-ownership-fence.test.ts`; api-unauthenticated-route-ordering.test.ts probe → neutral unknown path (401-before-404 force intact); mock-data-pairs `/states/` absence-pin block :827-849 drops (1506 count + members-trio assertion remain the invariant). Commit: `re-anchor retirement pins on neutral paths`
- [ ] **D2. Comment sweep:** reword every remaining `/states`/`entity-states` URI mention — api/routes.ts (~40 comment sites incl. SIDECAR-KEEP rationale lines, which now cite the live graph fold + `stateEventVisibilityFor` instead of `deriveFlowGraphStates`), api/derive-states.ts header (:39-107), derive-* comment lines, validators.ts:1626, record-attribute-refs.ts, web-app comments, ~20 comment-only test files. Gate: `grep -rn "/states\|entity-states" api web-app tests shared *.md` → zero hits. Commit: `purge states address vocabulary from comments`

## Phase E — docs

- [ ] **E1.** API.md §2.10 rewritten as the per-URI history surface (9 registrations, DESC, fence postures, inline field_values); §5.16/§5.19 lists; reconcile already-stale :2000 and :2283; API-TREE.md:63 re-encoded; SCHEMA.md:225-242 map. Commit: `document history routes in API docs`
- [ ] **E2.** ARCHITECTURE.md :251/:456-475/:551/:640/:666/:690; TEST-PLAN.md :204-226 + :1745-1796 + :2293-2295; CLAUDE.md :225-245 data section, :415-430 test roster, :532-549 lifecycle block. Commit: `update architecture and test docs for history reads`

## Phase F — measurement milestone

- [ ] `TMPDIR=/tmp/claude ./measure --record`, compare, then deliberate `--write-budgets` recalibration (expected: workbox −3, workbox-detail −(N+2), organization −4, projects −4 requests; flow-stats ~neutral; every sidebar page −2 from header stats). Browser smoke via the run/TEST-PLAN protocol: workbox inbox, workbox-detail (transition with field values), flow-stats, organization, project-detail score history, dashboard. Commit: `record measure milestone after states retirement`

## Verification

1. `./validate` green at every commit (the abort rule: a red gate stops the run).
2. Wire covenants re-asserted BEFORE deletion (Phase A tests land first): 200-DESC shape, foreign→403 honest body, absent→404, 401-before-404, org isolation, route-order pins.
3. Final purge gate: `grep -rn "/states\|entity-states" api web-app tests shared *.md` → zero hits.
4. Invariant tripwires: mock-data-pairs 1506; SNAPSHOT_SCHEMA_VERSION 5; `generate-schema-svg --check` clean.
5. Phase F: `./measure --check` passes post-recalibration; browser smoke on the six pages above.

## Risks

1. **Skew-truth regression** (trio stamped from head body) — caught by per-family skew drift cases (A6-A10).
2. **Route-order collision** (`history` matched as `:id`) — pinned tests in A2/A5.
3. **Test Weakening during C** — every retired suite names its force's receiving suite; fences re-asserted on the new surface before the old dies.
4. **DESC assumption breaks a client** — B-phase adapters sort locally or take index 0; adapter tests pin both.
5. **Missed deleted-export caller** — tsc gate; adapters/index.ts pruned per commit.

## Out of scope (explicit)

- Table-vocabulary `'states'` strings with no URI slash: snapshots.ts RETIRED_TABLES/`snap['states']`, db-table-names + backend-* store-name fixtures, generate-schema-svg.ts FK_SPECIAL `'states'` (:39, pre-existing drift), presenter `'3 states'` UI text, presenters/flow.ts:89 pluralization.
- Snapshot version bump (none — GETs form no pairs); pair-plane addresses; invitations surface; `StateEntity` rename; `resolveOwningOrganization` leg-trimming; caching of any kind.

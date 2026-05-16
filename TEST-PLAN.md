# Fusion AI — Test Plan

> **Encoding:** `- [ ]` = pending, `- [ ]` = PASS, `- [FAIL]` = failure (add note)

### How to invoke

When the user says "run the test plan", the agent:

1. Reads this document's `### Protocol` section (six-phase
   protocol, mutation domains, MCP limitations) — required
   context, not optional reference.
2. Executes section **AT** as a fail-fast gate; any AT
   failure aborts the run before A1's build.
3. Executes A1–A5 preflight; on success spawns the
   six-phase parallel protocol (Phase 1 serial data setup,
   Phase 2 seven concurrent agents, Phase 3 cross-cutting
   alone, Phase 4 snapshot lifecycle alone, Phase 5
   teardown). Or runs serially if `--serial` is requested.
4. Emits the run summary in the canonical format
   documented at the bottom of this file (`## Summary
   Format`). The summary is the conversational artifact;
   this document is NOT mutated by the run.

This document is the complete regression contract — no other
coordination state is read or written.

BLOCKED ≠ FAIL. BLOCKED is reserved for known MCP
environmental limits (pointer-capture gestures,
`resize_window`, file I/O) — never used to mask a real
failure.

### Sub-agent invocation contract

Every agent dispatched by the orchestrator — Phase 1
serial agent, all seven Phase 2 agents, the Phase 3
cross-cutting agent, and the Phase 4 snapshot-lifecycle
agent — MUST begin its turn by invoking the
`church-of-code:church-of-code` skill via the Skill tool
and reading `CHURCH-OF-CODE-small-context.md` in full.
Subagents inherit no scripture and read no CLAUDE.md by
default (see CLAUDE.md § Subagents). The orchestrator's
dispatch prompt MUST embed this requirement as the first
line of every sub-agent prompt.

After the scripture, each sub-agent reads
`/Users/tmornini/code/fusion-ai/CLAUDE.md` in full, then
begins its assigned case list. The discipline costs
context; the discipline IS the point.

### Scope

This plan covers **UI behavior** — anything that requires a browser
DOM, CSS, gestures, or visual rendering. Pure transitions,
adapter behavior, and HTTP-style API routing are now covered by
the **automated test suite** (`./validate` runs them; the suite
also runs standalone via `node --test --strip-types tests/*.test.ts`).
See `CLAUDE.md` section `## Testing` for the inventory of
automated test files and what each covers.

This UI plan therefore focuses on what automated tests cannot
verify: layout, gestures, navigation, drag-and-drop, dialog
behavior, and end-to-end user flows through the rendered DOM.

The fast suite (`./test` / `./validate`) now also covers:
flow-edit business logic and the connection-validation rules
(`tests/flow-operations.test.ts` — `performAddEdge` /
`performAddNodeAtPosition` / `performDeleteSelected*` /
`performAddField` / `performDeleteField` / `performUndo` /
`performRedo`, including no-edge-to-a-start-node, none-from-an-
end-node, no-duplicate-edge, start-node-single-outgoing, and the
lock/noop/commit-error branches); the flow version and query
adapters (`tests/adapters-flow-versions.test.ts`,
`tests/adapters-flow-queries.test.ts`); the workbox inbox
aggregation plus the visibility filter (`tests/workbox-inbox.test.ts`,
`tests/workbox-filter.test.ts`); the mermaid round-trip
(`tests/mermaid.test.ts`); the in-browser ZIP (`tests/zip-guards.test.ts`);
snapshot import-validation, quota pre-flight, and wipe-on-fail
(`tests/snapshot-import-validation.test.ts`,
`tests/snapshot-quota.test.ts`, `tests/snapshot-wipe-on-fail.test.ts`,
`tests/db-localstorage-compression.test.ts`); every data adapter
(`tests/adapters-*.test.ts`); navigation
(`tests/navigation.test.ts`); mock-data validity
(`tests/mock-data-valid.test.ts`); and the SafeHtml output of the
presenters (`tests/presenter-*.test.ts`). So the manual cases in
those areas can focus on the DOM/visual/gesture affordance rather
than re-deriving the logic. Where a case below is the browser
counterpart of one of those automated areas it carries an inline
note pointing at the test file.

### Protocol

The automated layer (`## AT`) runs first as a fail-fast
gate. On green, the browser regression runs over HTTP in
one of two modes:

- **Serial (single human tester)**:
  `./build --no-zip /tmp/fusion-test/` then
  `cd /tmp/fusion-test/ && python3 -m http.server 8080`. Run
  sections in document order.
- **Parallel (Claude Code agents)**:
  `TMPDIR=/tmp/claude ./build --no-zip ~/Desktop/fusion-test/`
  then `cd ~/Desktop/fusion-test/ && python3 -m http.server 8080`.

#### Six-phase parallel protocol

Agents execute the plan in six phases to fit within context and
time budgets while keeping per-entity mutation domains disjoint:

1. **Phase 0 — Preflight** (main): `./validate`, `./build` to
   produce the distribution ZIP, `./build --no-zip` for the test
   server, start HTTP server, open tab 0. Covers A1–A5.
2. **Phase 1 — Data setup** (one agent, serial): AA1–AA43 in
   tab 0. Creates pristine environment, workers (humans + AIs),
   ideas, projects, one flow. Populates the shared database
   that Phase 2 verifies.
3. **Phase 2 — Parallel verification** (7 agents concurrent,
   each in its own tab, no shared tabs):
   - Agent-B — Entry pages
   - Agent-CH — Dashboard + Reference (read-only)
   - Agent-D — Ideas
   - Agent-E — Projects
   - Agent-F — Flows (includes hazard severity, flow-publish
     gate)
   - Agent-F2 — Workbox (includes Create-Work-Order picker
     READY / NOT READY split)
   - Agent-G — Admin (Workers page, Worker detail (human + AI),
     Organization, Snapshots, Billing). The retired Teams /
     Roles / Crews / Activity Feed pages have no cases.
4. **Phase 3 — Cross-cutting** (one agent, alone): I1–I28.
   Mutates global UI state (theme, sidebar, command palette) —
   no concurrent agents.
5. **Phase 4 — Snapshot lifecycle** (one agent, alone):
   G30–G35. Wipes and reloads the database — strictly last
   before teardown.
6. **Phase 5 — Teardown** (main): stop HTTP server, remove
   build directory, verify distribution ZIP remains, aggregate
   results.

#### Entity mutation domain scoping

Phase 2 agents share one localStorage but each owns a disjoint
subset of tables:

| Agent | Mutation domain |
|---|---|
| Agent-B | creates one human worker via signup |
| Agent-D | `ideas` |
| Agent-E | `projects` (plus one flow via the project-detail New Flow path) |
| Agent-F | `flows`, `flow_versions` |
| Agent-F2 | `work_orders`, `flow_work_orders`, `states` (work-order entity_ids), `state_field_values`, plus its own private flow in `flows`/`flow_versions` |
| Agent-G | `workers`, `ai_workers`, `organization` |
| Agent-CH | none (read-only) |

Agent-F2 owns its source flow because `postWorkOrderCreation`
freezes `flow_graph` at creation time. If Agent-F edits the
shared flow concurrently, the captured snapshot reflects
mid-edit state, not a clean baseline.

Because `StorageEvent` propagation makes sibling changes visible
to every tab, cross-boundary assertions use `≥ N` or
"displayed-count matches current localStorage at read time"
framing rather than frozen expected values. Agent-CH's dashboard
count checks are non-zero + consistency, not numeric equality.

#### Known MCP limitations

- **Flow designer gestures** (port drag, shift-drag to connect,
  marquee select): synthetic PointerEvents do not reliably
  drive the `flow-interactions.ts` state machines because they
  use pointer-capture semantics. Affected tests include
  AA27–AA34, F15, F19–F23, D36, D37, E11. Work around by
  validating end-state via direct JSON injection into
  `fusion-ai:flows`, then reloading and verifying render. When
  the injection succeeds and the SVG renders the expected end
  state, the case is **PASS** with the note `verified via JSON
  injection` — NOT BLOCKED. `BLOCKED` is reserved for cases
  where neither gesture nor injection produces a verifiable
  end state.
- **`resize_window`** does not change the CSS viewport;
  responsive tests at specific widths (I10) cannot be driven.
  Inspect `responsive.css` manually to verify media queries.
- **File downloads** cannot write to disk from the MCP
  sandbox. Capture Blob content via `javascript_tool`
  intercepting `URL.createObjectURL` for validation.
- **File uploads** require constructing a `DataTransfer` in
  `javascript_tool` and dispatching a synthetic change event.
- **Keyboard events** (arrows, Cmd+K, Delete, Tab) work
  normally and bypass the pointer-capture limitation.
- **`kill` syscall against the background HTTP server**: the
  Claude Code sandbox rejects `kill -TERM` and `kill -9`
  against PIDs of long-running background tasks started via
  the Bash tool's `run_in_background: true` (EPERM). Phase 5
  teardown's **J1** ("Stop the HTTP server") cannot terminate
  the process from within the sandbox; mark J1 BLOCKED with
  the reason "sandbox EPERM on kill". The server is cleaned
  up at session end. Workaround: the user terminates manually
  after the run via `lsof -ti tcp:8080 | xargs kill -9`
  outside the sandbox.
- **Phase 5 build-dir cleanup (J2)**: deferred while the
  server remains alive. Deleting `/tmp/claude/fusion-serve.*`
  while the python `http.server` holds open file descriptors
  leaves the server in an unrecoverable state. After the
  user kills the server outside the sandbox
  (`lsof -ti tcp:8080 | xargs kill -9`), they should run
  `rm -rf /tmp/claude/fusion-serve.*` to reclaim the build
  artifacts. J2 is marked DEFERRED whenever J1 is BLOCKED.
- **Chrome MCP tab-group volatility**: the MCP tab group can
  dissolve between calls when no tabs in the group are
  actively held. If `tabs_create_mcp` returns "No tab
  available", recover via
  `tabs_context_mcp({ createIfEmpty: true })` to allocate a
  fresh group, then proceed. Pre-existing tab IDs from
  before the dissolution are invalidated.

#### Serial single-tester mode

The same TEST-PLAN.md runs serially by one human in one browser
following document order (A → AA → B → C → D → E → F → F2 → FS
→ G → H → I → J). The agent-scoped mutation domains and
tolerance patterns apply only to the parallel run.

### Execution Order

**AT (automated tests) precedes everything.** Any AT
failure aborts the run before A1's build — the expensive
browser layer never tests against a validate-broken tree.

After AT passes, sections A through AA establish a pristine
environment and populate it through the UI. Sections B
through J then verify every page renders correctly against
that data.

In the serial run the plan is a single continuous regression
pass. In the parallel run B–J split across seven agents
each with its own browser tab and disjoint entity mutation
domain; I runs alone (global UI state); G30–G35 run alone
last (they wipe the database). See `CLAUDE.md` section
`## Testing`.

## Summary

| Section | Tests |
|---|--:|
| AT. Automated Test Suite | 3 |
| A. Build & Setup | 5 |
| AA. Data Entry Workflow | 47 |
| B. Entry Pages | 14 |
| C. Core: Dashboard | 7 |
| D. Core: Ideas Workflow | 37 |
| E. Core: Projects | 11 |
| F. Tools | 74 |
| F2. Workbox | 25 |
| FS. Flow Statistics | 9 |
| G. Admin Pages | 27 |
| H. Reference & System | 2 |
| I. Cross-Cutting Concerns | 28 |
| J. Teardown | 3 |
| K. Objectives & Scoring | 30 |
| **Total** | **322** |

### Combined Totals (CLI + Browser)

The per-section table above counts browser-regression cases
only. Combined with the CLI automated suite:

| Layer                  | Cases    |
|------------------------|---------:|
| CLI automated tests    |      781 |
| Browser regression     |      322 |
| **Combined TOTAL**     | **1103** |

CLI count = most recent `./validate` (AT2) report; the number
grows as tests land in `tests/*.test.ts`. Browser count = the
per-section table above. Update both numbers when either side
changes.

Outcome categories used by run summaries (see `## Summary
Format` at the bottom of this file):

| Status   | Meaning                              | Fails? |
|----------|--------------------------------------|:------:|
| PASS     | Assertion satisfied                  |   no   |
| FAIL     | Real regression; investigate         |  YES   |
| BLOCKED  | Known MCP environmental limit        |   no   |
| DEFERRED | Skipped — dependency BLOCKED         |   no   |
| DRIFT    | Passes but doc/UI mismatch surfaced  |   no   |
| pending  | Default (`- [ ]`); not yet executed  |  n/a   |

A fully green run reports:
`PASS = 1103, FAIL = 0, BLOCKED ≤ k, DEFERRED ≤ j, DRIFT = 0`,
where the six status counts sum to **Combined TOTAL** (1103).
`BLOCKED ≠ FAIL` and `DRIFT ≠ FAIL` — only `FAIL` indicates a
regression.

---

## AT. Automated Test Suite

The automated layer is the gate. Any AT failure aborts the
run before A1's build. The single canonical invocation is
`./validate`, which composes all three sub-steps.

- [ ] **AT1** Run `npx tsc --noEmit -p web-app/app/tsconfig.json`. PASS: exits 0; no diagnostics emitted.
- [ ] **AT2** Run `./test` (delegates to `node --test --strip-types tests/*.test.ts`). PASS: exits 0; the runner's final summary reports `pass N` with `fail 0`.
- [ ] **AT3** Run `./validate`. PASS: exits 0 (composes AT1+AT2 plus the 78-char awk lint over `api/`, `web-app/`, `tests/`). Any long-line violation prints `FILE:LINE: N chars` to stderr and fails the script.

---

## A. Build & Setup

- [ ] **A1** Run `./build` from a clean working directory. PASS: exits 0, prints no errors, creates `~/Desktop/fusion-ai-<sha>.zip`.
- [ ] **A2** Run `./build --no-zip /tmp/fusion-test/`. PASS: `/tmp/fusion-test/` contains `assets/app.js`, `assets/styles.css`, `assets/` (*.woff2 fonts), 13 page directories (`auth`, `billing`, `dashboard`, `design-system`, `flows`, `ideas`, `landing`, `not-found`, `organization`, `projects`, `snapshots`, `workbox`, `workers`) with 22 HTML page files (including `flows/stats.html`), plus root `index.html`.
- [ ] **A3** Start an HTTP server from the build directory (`cd /tmp/fusion-test/ && python3 -m http.server 8080`). PASS: server starts without errors.
- [ ] **A4** Open `http://localhost:8080/` in the test browser. PASS: redirects to `snapshots/index.html` when no data exists, or `landing/index.html` (which auto-redirects to `dashboard/index.html` after ~2 seconds) when data has been loaded.
- [ ] **A5** Open DevTools Console and confirm no JavaScript errors on initial load. PASS: console is clean (warnings from browser extensions are acceptable).

---

## AA. Data Entry Workflow

This section populates a pristine environment with all data
through the UI. Each step creates data that later steps depend
on. Run these in order.

### AA1. Create Pristine Environment

- [ ] **AA1** Navigate to `snapshots/`. Click "Create Pristine Environment" and confirm the wipe dialog. PASS: redirects to dashboard. Dashboard shows empty/minimal state.
- [ ] **AA2** Open DevTools, verify localStorage has a `fusion-ai:*` key for every table listed in `TABLE_NAMES` (`api/db.ts`) — empty arrays plus bootstrap data, including the `states` event log (with the seeded `'system'`-worker and `'current'`-user 'active' bootstrap events).
- [ ] **AA3** Verify bootstrap data exists: user "Tony Stark" (id: `current`), organization "Stark Industries" (domain `acmecorp.com`) on the "Business" plan.

### AA2. Create Workers

- [ ] **AA4** Navigate to Workers (sidebar). Click "+ Add
  Worker". PASS: dialog opens with a Kind toggle (Human /
  AI, Human selected by default), a Human form below
  showing First Name, Last Name, Email, Title, Department,
  Phone, Bio, and an AI form (hidden by default) with
  Name, Provider, Description, and a required Auth Token
  password input plus a yellow security warning beginning
  "⚠ Auth tokens are stored unencrypted...".
- [ ] **AA5** With Human selected, fill all fields for
  "Sarah Chen" (Title: Engineering Manager, Department:
  Engineering). Click Create. PASS: toast confirms
  creation, the new worker appears in the Humans group
  on the list.
- [ ] **AA6** Repeat for all 10 humans: Sarah Chen, Mike
  Thompson, Jessica Park, David Martinez, Emily Rodriguez
  (pending), Alex Kim, Marcus Johnson, David Kim, Lisa
  Wang, James Miller (archived). PASS: all 10 appear
  in the Humans group with correct name, email, title,
  and status badge (Active / Pending / Archived).
- [ ] **AA7** Reload the Workers page. PASS: every human
  re-renders in the Humans group with the correct status
  badge.
- [ ] **AA7a** Click "+ Add Worker", switch the Kind
  toggle to AI. PASS: the Human form hides and the AI
  form appears. Fill Name, Provider, Description, and
  Auth Token. Click Create. PASS: toast confirms, the
  new AI appears in the AIs group. Repeat for 4 AIs
  matching mock data (Claude Opus 4.7 Max, Claude
  Sonnet 4.6, GPT-5.4 Pro, Grok 4.20 Heavy).

### AA3. Worker Detail & Organization

- [ ] **AA8** On Workers, click the current user's row.
  PASS: navigates to `worker-detail` for that human. Read
  mode shows avatar, name, status badge, title ·
  department subtitle, Personal Information card (First
  Name, Last Name, Email, Phone, Title, Department, Bio),
  Working Styles card, and Strengths card.
- [ ] **AA8a** From the Workers list, click any AI
  worker's row. PASS: navigates to `worker-detail` for
  that AI. Read mode shows the AI identity card (Name,
  Provider, Description) and a separate Auth Token row
  showing the masked token (last 4 chars only,
  e.g. `sk-...XXXX`).
- [ ] **AA9** From the human worker detail, click Edit,
  change Phone and Bio, toggle one strength on and one
  off, click Save. PASS: toast "Worker saved" appears.
  Navigate away and return to detail. PASS: edited
  Phone, Bio, and strengths persist.
- [ ] **AA9a** From an AI worker detail, click Edit,
  change Description, leave Auth Token blank (placeholder
  reads "Leave blank to keep current token"), click Save.
  PASS: toast "AI worker saved" fires; on reopen the
  masked token is unchanged. Click Edit again, type a new
  token, Save. PASS: on reopen the masked-token last 4
  chars reflect the new value.
- [ ] **AA10** Navigate to Organization. Click the
  page-level Edit button (a single button at the page
  header, not per-card), change Domain (e.g.
  `acmecorp.io`), click Save. PASS: success toast
  "Organization saved" appears.
- [ ] **AA11** Navigate away, return to Organization.
  PASS: edited Domain persists with saved value, card is
  back in read mode.
- [ ] **AA-Obj** On the Organization page, locate the
  Objectives box. Click `+ Add objective` five times,
  creating in order: "Revenue Growth", "Cost Reduction",
  "Customer Satisfaction", "Team Wellbeing", "Operational
  Efficiency". PASS: all five appear in the active list
  in the order created. End-state delivered to Phase 2:
  5 active objectives — required by Agent-E's K9–K23
  scoring lifecycle, which has a read-dependency on the
  Organization Objectives produced here.

### AA4. Create Ideas

- [ ] **AA12** Navigate to Ideas. Click "Create Idea". Fill in title, problem, solution, and outcome for "AI-Powered Customer Segmentation". Click "Submit Idea". PASS: idea appears on ideas list.
- [ ] **AA13** Navigate to the new idea's detail page. Click "Edit". Verify title and text fields (problem, solution, outcome) are editable. Click "Save". PASS: toast confirms save, all fields persist.
- [ ] **AA14** Repeat creation and field entry for all 11 ideas matching mock data titles. PASS: ideas list shows all 11 with correct titles.

### AA5. Submit Ideas for Review

- [ ] **AA15** Navigate to idea #1 detail (status: active). Click "Submit for Review". PASS: status changes to "In Review", button disappears.
- [ ] **AA16** Submit ideas 1, 4, 7, 8, 9, 10, 11 for review (matching mock data statuses). PASS: each transitions from active to in-review.
- [ ] **AA17** Navigate to Ideas list and filter by "In Review" status badge. PASS: the 7 submitted ideas appear.

### AA7. Approve Ideas & Convert to Projects

- [ ] **AA18** On Ideas list, filter by "In Review". Click idea #1. PASS: navigates to idea detail with approval footer.
- [ ] **AA19** Click "Approve". PASS: idea status changes to approved, confirmation shown.
- [ ] **AA20** Approve idea #4 as well (it was submitted for review in AA16). Leave others in their current status. PASS: statuses match mock data (2 approved, rest in-review/active).
- [ ] **AA21** Navigate to approved idea #1. Click "Convert". PASS: conversion form loads with 5 required fields (Project Name, Start Date, Target End Date, Cost, Impact). No Project Lead field — the team data model has been retired.
- [ ] **AA22** Fill all required fields: Project Name, Start Date, Target End Date, Cost, Impact. Click "Create Project". PASS: navigates to project detail for the new project.
- [ ] **AA23** On project detail, click "Edit". Set fields (title, description, status, start date, end date, cost baseline, impact baseline) to match mock data. Save. PASS: project data persists.
- [ ] **AA24** Approve remaining ideas (7, 8, 9, 10) from Ideas list (filter by "In Review"), then convert all 6 approved ideas to projects. PASS: Projects list shows all 6 with correct status and progress.

### AA9. Create Flows

- [ ] **AA25** Navigate to Projects. Click into
  project #1 detail (status: approved). PASS:
  a "Flows" section is visible showing "No
  flows yet" empty state and a "New Flow"
  button. Non-approved projects show an info
  badge "Approve to add flows" instead of
  the button, and empty state reads "Flow
  creation limited to approved projects only".
- [ ] **AA26** Click "New Flow". PASS: navigates
  to the flow designer page. The SVG canvas
  shows two nodes: "Create" (start, top-left with
  green border) and "Archive" (end, bottom-right
  with red 3-px border) connected by no edges.
  Toolbar shows Undo, Redo, Delete (trash icon),
  Auto Layout, Zoom −/+,
  Copy Mermaid, Export. Changes auto-save
  (no explicit Save button).
- [ ] **AA27** Drag the port circle on the start
  node into empty canvas past 20 pixels. PASS:
  during the drag a ghost "New State" card
  follows the cursor along with a faint bezier
  preview. On release, a new node appears at the
  drop position with a blue border,
  auto-connected from the start by an edge with
  a default name. The start node is also
  draggable by its body.
  (The node-creation + auto-edge logic — including
  the start-node-single-outgoing rule — is now
  covered by `tests/flow-operations.test.ts`
  (`performAddNodeAtPosition` + `performAddEdge`).
  This browser case remains BLOCKED for the port-
  drag gesture itself per the MCP pointer-capture
  limitation; if the gesture cannot be driven,
  validate end-state via direct JSON injection per
  the CLAUDE.md workaround.)
- [ ] **AA28** Double-click the new blue-bordered
  node. PASS: properties panel appears with a
  "State Properties" title and close button on
  the right, then a `<fieldset>` labeled "Workers"
  containing two groups — HUMANS and AIs — each
  with a labeled checkbox per worker (no checkbox
  ticked yet), then State Name input, Description
  input, empty Fields list, and outgoing
  transitions. The node gets a gold glow selection
  effect on the canvas.
- [ ] **AA29** Edit the state name in the
  properties panel to "Data Capture". PASS: the
  node label updates on the canvas immediately
  (auto-saves via 800ms debounce).
- [ ] **AA30** Double-click the edge between
  start and "Data Capture". PASS: no properties
  panel opens — the outgoing edge from Create is
  intentionally not interactive. The edge has no
  name label visible on the canvas, just a plain
  blue arrow.
- [ ] **AA31** Drag from "Data Capture"'s port
  into empty canvas past 20 pixels to create a
  new middle node; rename it "Review" via its
  properties panel. Rename the new edge
  "submit".
  (The add-node-at-position + auto-edge logic is
  now covered by `tests/flow-operations.test.ts`.
  This browser case remains BLOCKED for the port-
  drag gesture per the MCP pointer-capture
  limitation — validate end-state via JSON
  injection per the CLAUDE.md workaround.)
- [ ] **AA32** Hold Shift and drag from "Review"
  onto "Data Capture". PASS: during the drag the
  preview redraws as a dashed-orange curved
  bezier because a forward path "Data Capture" →
  "Review" already exists, and the reachability
  check recognises the release would close a
  loop. Release to create the cycle edge; rename
  it "needs revision". Hold Shift and drag from
  "Review" onto "Archive". PASS: preview is a
  solid-blue curved bezier (no return path).
  Release to create the edge; rename it
  "approve".
  (The connection-validation rules this would
  check — no edge to a start node, none from an
  end node, no duplicate, start-node-single-
  outgoing, and the cycle-vs-forward
  classification via the reachability check — are
  now covered by `tests/flow-operations.test.ts`
  (`performAddEdge`). This browser case remains
  BLOCKED for the shift-drag gesture itself per
  the MCP pointer-capture limitation.)
- [ ] **AA33** In the "Data Capture" properties
  panel, click "+ Add Field". Enter name "Company
  Name", type "text", check "Required". PASS:
  field appears in the fields list with a "text"
  badge and a red asterisk (*) required indicator.
  (The add-field logic is now covered by
  `tests/flow-operations.test.ts` (`performAddField`)
  — this case verifies the panel form and the
  fields-list rendering only.)
- [ ] **AA34** Add more fields to "Data Capture":
  Contact Email (email, required), Industry (select
  with options "Technology, Finance, Healthcare"),
  Company Logo (image). PASS: all fields appear
  with correct type badges.
- [ ] **AA35** Wait for auto-save (800ms debounce).
  Navigate away and back. PASS: all nodes, edges,
  and fields persist.

### AA10. Verify Dashboard

- [ ] **AA36** Navigate to Dashboard. PASS: gauge
  cards (Time, Cost, Impact) show aggregated values
  computed from the entered project data.
- [ ] **AA37** Header stats reflect entered data
  counts (ideas, projects, flows). PASS:
  counts are non-zero and match.

### AA11. Edit & Verify Cycle

- [ ] **AA38** Edit idea #1: change title. Save,
  navigate to ideas list, return to detail. PASS:
  changed title persists.
- [ ] **AA39** Edit project #1: change description.
  Save, navigate away, return. PASS: changed
  description persists.
- [ ] **AA40** Edit flow: navigate to flow
  designer, rename a state (auto-saves). Navigate
  away, return. PASS: changed state name persists.
- [ ] **AA41** Edit human worker: navigate to a human
  worker's detail page, click Edit, change phone number,
  Save. Navigate away, return. PASS: changed phone
  persists.
- [ ] **AA42** Edit organization: in the General
  Information card, change Domain. Save, navigate
  away, return. PASS: changed Domain persists.

### AA12. Snapshot Round-Trip

- [ ] **AA43** Navigate to Snapshots. Click
  "Download Snapshot". PASS: JSON file downloads
  with all manually-entered data. In **serial
  mode** continue the round-trip: Click "Create
  Pristine Environment", confirm. PASS: all data
  wiped. Click "Upload Snapshot", select the
  downloaded file. PASS: all data restored.
  Spot-check 3 pages to confirm data matches. In
  **parallel mode** stop after the download step
  to preserve the Phase 2 baseline — the wipe +
  upload round-trip is exercised again at I26
  (Phase 3) and G34 (Phase 4) on a different
  baseline. (Snapshot serialization/validation,
  the quota pre-flight, and wipe-on-fail are
  covered by
  `tests/snapshot-import-validation.test.ts`,
  `tests/snapshot-quota.test.ts`, and
  `tests/snapshot-wipe-on-fail.test.ts` — this
  case verifies the download/upload UI affordance
  and the end-to-end page-level restore.)

---

## B. Entry Pages

### Landing Page (`landing/`)

- [ ] **B1** Page renders with marketing hero content, feature sections, and call-to-action buttons, then auto-redirects to `dashboard/index.html` after ~2 seconds. PASS: layout renders briefly, redirect occurs.
- [ ] **B2** "Start Free Trial" (hero CTA) and "Get Started" (navbar CTA) are present and navigate to `auth/index.html` if clicked before the auto-redirect. PASS: buttons exist with correct target.
- [ ] **B3** "Sign In" button is present and navigates to `auth/index.html` if clicked before the auto-redirect. PASS: button exists with correct target.

### Auth Page (`auth/`)

- [ ] **B4** Page loads in **Sign In** mode by default. PASS: title is "Welcome back", submit button reads "Sign in →".
- [ ] **B5** On desktop (≥1024px), left panel shows branded marketing stats (10K+ Active Users, 98% Satisfaction, 50+ Integrations). PASS: two-column layout visible.
- [ ] **B6** Submit with empty fields. PASS: "Email is required" error appears below email input; input gets error styling.
- [ ] **B7** Enter `notanemail` in email, leave password empty. PASS: "Please enter a valid email address" error on email.
- [ ] **B8** Enter `test@example.com`, password `123`. PASS: "Password must be at least 6 characters" error on password.
- [ ] **B9** Enter `test@example.com`, password `password123`, click "Sign in →". PASS: button shows spinner briefly, then navigates to `dashboard/index.html`.
- [ ] **B10** Click the "Sign up" button (positioned next to the static "Don't have an account?" label — the label is not itself the toggle; the adjacent button is). PASS: switches to Sign Up mode — title changes to "Get started", "Company name (optional)" field appears, submit reads "Create account" with an SVG arrow icon (not a literal "→" character).
- [ ] **B11** Fill valid email + password (≥6 chars) in Sign Up mode, click "Create account →". PASS: toast "Welcome to Fusion AI! Your account has been created." appears, then navigates to `dashboard/index.html` after a brief delay (the dedicated onboarding page has been retired — sign-up routes straight to the dashboard).

### Auth Validation Edge Cases

- [ ] **B12** In Sign In mode, enter valid email, valid password, then clear email and submit. PASS: email error reappears.
- [ ] **B13** Toggle between Sign In and Sign Up modes multiple times. PASS: form resets cleanly each time, no layout glitches.
- [ ] **B14** Footer shows "By continuing, you agree to our Terms of Service and Privacy Policy." PASS: text is visible.

---

## C. Core: Dashboard

- [ ] **C1** Navigate to `dashboard/`. PASS: page loads with sidebar, header, and main content area.
- [ ] **C2** Sidebar shows flat navigation
  links in this order: Dashboard, Ideas,
  Projects, Flows, Workbox, Organization,
  Workers, Billing, Snapshots, Design System.
  PASS: all 10 links present, in order, and
  styled. (Teams, People, Roles, Crews,
  Company, Activity Feed, and Profile sidebar
  entries have been retired — the current
  user's detail is reachable via the sidebar
  account chip and the header greeting; humans
  and AIs both live on the Workers page.)
- [ ] **C3** Header shows search bar, greeting
  ("Good {morning/afternoon/evening}, Tony
  Stark" — varies by time of day), company
  stats ("Stark Industries · 11 Ideas ·
  6 Projects · 1 Flows"), and theme toggle.
  PASS: elements visible and styled.
- [ ] **C4** Dashboard renders 4 surfaces in order: Time
  gauge, Cost gauge, Portfolio Impact card (bipolar arc,
  post-b2c0684), Aggregate Objectives box (full-width row
  below, post-b2c0684). PASS: all 4 render with baseline
  and current values; the 2 gauges show concentric arcs;
  the Portfolio Impact card shows its bipolar arc; the
  Aggregates box shows per-objective rows.
- [ ] **C5** Sidebar navigation links all function correctly. PASS: clicking a sidebar link navigates to the expected page.
- [ ] **C6** Scroll the page. PASS: sidebar stays fixed, main content scrolls independently.
- [ ] **C7** Check that seed data populates all 4 dashboard
  surfaces (2 gauges + Portfolio Impact card + Aggregate
  Objectives box). PASS: no "No data" empty states on
  initial load against the Phase 1 baseline (10 humans,
  4 AIs, 11 ideas, 6 projects, 1 flow, 5 objectives).

---

## D. Core: Ideas Workflow

### Ideas List (`ideas/`)

- [ ] **D1** Navigate to `ideas/`. PASS: list shows 11 ideas as cards, each with a drag-handle grip, title, status badge, and (for approved ideas) a Convert button. Ideas represent the problem-and-proposed-solution shape and do not carry time/cost/impact estimates; those fields live on projects created by conversion.
- [ ] **D2** Each idea row shows a status badge
  (Active, In Review, Approved, Promoted, Sent
  Back, or Archived). PASS: badges render with
  distinct colors.
- [ ] **D3** Click an idea row/title. PASS: navigates to the idea's detail or scoring page with the correct `ideaId` parameter.
- [ ] **D4** "New Idea" or "Create Idea" button is visible. PASS: clicking it navigates to `ideas/create.html`.

### Idea Create Form (`ideas/create.html`)

- [ ] **D5** Page loads showing a single-page form with six fields: Title, Problem Statement, Target Users, Proposed Solution, Expected Outcome, Success Metrics. PASS: all six fields visible.
- [ ] **D6** "Submit Idea" button is disabled when any required field is empty. PASS: button is visually disabled and not clickable.
- [ ] **D7** Fill in all required fields (Title,
  Problem Statement, Proposed Solution,
  Expected Outcome). PASS: "Submit Idea" button becomes enabled.
- [ ] **D8** Click "Submit Idea". PASS: navigates to `ideas/index.html`.
- [ ] **D9** Click "Cancel". PASS: navigates to `ideas/` list.

### Idea Detail (`ideas/detail.html?ideaId=1`)

- [ ] **D10** Navigate to `ideas/detail.html?ideaId=1`. PASS: page loads with idea title, status badge, and "Submitted by [name] @ [date/time]" in the header.
- [ ] **D11** Page displays one card: Problem & Solution (Problem Statement,
  Target Users, Proposed Solution, Expected
  Outcome, Success Metrics). PASS: all fields populated. No Details or Estimates cards.
- [ ] **D12** Click "Edit" button. PASS: text fields become editable inputs/textareas, Save and Cancel buttons appear, Edit button hides.
- [ ] **D13** Modify a field (e.g. Problem Statement or Expected Outcome), click "Save". PASS: toast "Idea saved" appears, page returns to view mode with updated data.

### Idea Detail — Edit & Actions

- [ ] **D14** Click "Edit", then "Cancel". PASS: returns to view mode with original data unchanged.
- [ ] **D15** For an idea in "in_review"
  status: clicking the card navigates to
  `ideas/detail.html` page with approval
  footer (Approve / Send Back).
- [ ] **D16** For a convertible idea: "Convert" action button is visible. PASS: clicking it navigates to `ideas/convert.html` page.
- [ ] **D17** Navigate to `ideas/detail.html?ideaId=999` (non-existent). PASS: page handles gracefully — shows error state, no unhandled JS exception.

### Idea Detail — Submit for Review

- [ ] **D18** Navigate to an idea with status "active". PASS: "Submit for Review" button is visible in the header area.
- [ ] **D19** Click "Submit for Review". PASS: status changes to "In Review", button disappears, status badge updates.

### Idea Detail — Sent Back Re-Submit

- [ ] **D20** Navigate to an idea with status "sent-back" (after a reviewer sends it back). PASS: "Submit for Review" button is visible, allowing re-submission.
- [ ] **D21** Click "Edit", modify a field, click "Save". PASS: idea updates. Click "Submit for Review". PASS: status changes to "In Review".

### Idea Convert (`ideas/convert.html`)

- [ ] **D22** Navigate to `ideas/convert.html?ideaId=<id>` for a convertible idea. PASS: page loads with conversion form showing 5 required fields: Project Name, Start Date, Target End Date, Cost, Impact. Sticky sidebar shows "Problem & Solution" with title, problem, solution, and expected outcome. (No Project Lead field — that selector and its underlying TeamEntity have been retired.)
- [ ] **D23** With required fields empty, "Create Project" button is disabled and progress bar shows 0/5. Fill fields one at a time. PASS: progress bar increments with each field, checkmarks appear next to completed fields, button enables only when all 5 required fields are filled.
- [ ] **D24** Fill all required fields (progress bar reaches 100%), click "Create Project". PASS: navigates to project detail page for the newly created project.

### Idea Status Filtering (`ideas/index.html`)

- [ ] **D25** Navigate to `ideas/index.html`. PASS: status badges appear showing each status present in the data (e.g., Active, In Review, Approved).
- [ ] **D26** Click a status badge. PASS: list filters to show only ideas with that status, badge is highlighted, others are dimmed, count updates.
- [ ] **D27** Click the same badge again. PASS: filter clears, all ideas shown, all badges at full opacity.
- [ ] **D28** Click a different badge. PASS: filter switches to the new status.

### Idea Detail — Approval Actions

- [ ] **D29** Navigate to `ideas/detail.html?ideaId=7` (in-review idea). PASS: page loads with idea details and sticky approval footer showing Send Back / Approve.
- [ ] **D30** Click "Approve". PASS: success toast, navigates to ideas list, idea status is now "approved".
- [ ] **D31** Click "Send Back". PASS: dialog opens asking for feedback. Confirm. PASS: idea status changes to "sent-back", navigates to ideas list.
- [ ] **D32** Navigate to idea detail for a non-in-review idea. PASS: no approval footer is shown.

### Ideas Workflow Integration

- [ ] **D33** After creating an idea and converting it to a project, navigate back to `ideas/`. PASS: the ideas list still loads correctly with seed data.
- [ ] **D34** Navigate from ideas list → idea convert → back button. PASS: navigates to ideas list.
- [ ] **D35** Navigate to `ideas/convert.html?ideaId=999` (non-existent). PASS: page handles gracefully — shows empty/error state, no unhandled JS exception.

### Ideas List — Drag-reorder

- [ ] **D36** On `ideas/index.html`, press and hold on an idea row then
  drag it upward past another row's midpoint. PASS: during the drag a
  hysteresis indicator appears at the target drop position, the
  dragged row follows the pointer, and on release the ideas list
  reorders in place. Reload the page — new order persists.
- [ ] **D37** During a drag, hover slowly across the midpoint of a
  neighbouring row. PASS: the drop indicator line only flips to the
  new target once the pointer crosses the hysteresis threshold, not
  on the first pixel over the midpoint.

---

## E. Core: Projects

### Projects List (`projects/`)

- [ ] **E1** Navigate to `projects/`. PASS: table/list shows 6 seeded projects with title, status, and progress. Each project card shows three metrics (time, cost, impact). Em-dash ("—") substitutes for the entire metric when its **baseline (denominator) is missing**; a zero current value over a non-zero baseline renders as `0d / 213d`, `$0k / $120k`, or `0 / 85` — not em-dash. Em-dash signals "no baseline to compare against," not "zero current value."
- [ ] **E2** Click a status filter badge (e.g. "Active"). PASS: project list filters to show only projects with that status. Click the same badge again or "All". PASS: full list returns.
- [ ] **E3** Click a project row. PASS: navigates to `projects/detail.html?projectId=<id>`.

### Project Detail (`projects/detail.html?projectId=1`)

- [ ] **E4** Page loads with project summary
  card (description, dates, progress bar) and
  baseline vs. current metrics. PASS: all cards
  render with data. Baseline/current metrics
  show em dash when values are zero or missing.
- [ ] **E5** Sidebar shows the Flows section
  (Team card has been retired with the team
  data model). PASS: no Team card on the
  project sidebar.
- [ ] **E6** Flows section shows linked flows with
  node/edge counts. For approved projects, a "New
  Flow" button is visible. For non-approved
  projects, an info badge "Approve to add flows"
  appears instead and empty state reads "Flow
  creation limited to approved projects only".
  PASS: correct UI for project status.
- [ ] **E7** On an approved project, click "New
  Flow" button. PASS: a "New Flow" dialog opens
  with a Flow Name input and Create/Cancel
  buttons. Enter a name and click Create. PASS:
  a new flow is created and the browser
  navigates to the flow designer page. The new
  flow is associated with the current project.

### Project Detail — Edit Mode

- [ ] **E8** Click "Edit" button on project detail. PASS: fields become editable inputs/textareas, Save and Cancel buttons appear.
- [ ] **E9** Modify a field, click "Save". PASS: project saves successfully, returns to view mode with updated data.
- [ ] **E10** Click "Edit", then "Cancel". PASS: returns to view mode with original data unchanged.

### Projects List — Drag-reorder

- [ ] **E11** On `projects/index.html`, press and hold on a project
  card then drag it to a new position. PASS: drop indicator appears,
  card follows the pointer, and on release the projects list
  reorders. Reload the page — new order persists.

---

## F. Tools

### Flow List (`flows/`)

- [ ] **F1** Navigate to `flows/`. PASS: page shows
  flow cards with name, description, project
  name badge, and state/transition counts.
- [ ] **F2** Type in the search input (if present).
  PASS: filters flow cards by name or
  description in real-time.
- [ ] **F3** Click a flow card. PASS: navigates
  to `flows/detail.html?flowId=<id>`.

### Flow Import

(Mermaid parse/serialize round-trip is covered by
`tests/mermaid.test.ts` and ZIP read/write by
`tests/zip-guards.test.ts` — the cases below verify the import
dialog, the file-upload affordance, and that the imported flow
opens and renders.)

- [ ] **F4** Click "Import Flow" button on the flows list page. PASS: import dialog opens with a file upload input and a project selector dropdown.
- [ ] **F5** Select a `.mmd` file via the file input and choose a project from the dropdown. Click "Import". PASS: flow is created, toast confirms import, and browser navigates to the flow designer for the imported flow.
- [ ] **F6** Repeat with a `.zip` file exported from a previous flow. PASS: imported flow renders with nodes, edges, and fields visible (round-trip fidelity is covered by `tests/mermaid.test.ts` + `tests/zip-guards.test.ts`).

### Flow Designer (`flows/detail.html?flowId=...`)

- [ ] **F7** Navigate to a flow designer page.
  PASS: page wears the standard sidebar + top-bar
  layout (formerly standalone) — left sidebar with
  the global nav, top bar with search/greeting/
  organization stats/theme toggle, and the flow
  designer occupying the remaining content area.
  Toolbar runs vertically along the left edge of
  the canvas (inside the content area, not the
  global sidebar) with Undo/Redo, Zoom −/+,
  Copy Mermaid, Export, and Delete (trash icon)
  arranged top-to-bottom. The header above the
  canvas hosts the Back button and three header
  switches (Locked, Auto Layout, Auto Fit). SVG
  canvas to the right of the toolbar with dot
  grid background showing the flow graph. When
  Auto Fit is on, conflicting interactions (drag,
  pan, zoom buttons, panel pan) are gated with a
  fire-and-toast "blocked" message rather than
  being silently absorbed; the user either turns
  Auto Fit off or accepts the constraint. Changes
  auto-save (no explicit Save button).
- [ ] **F8** Nodes display correctly: start node
  has green border with its name centered in the
  card and no subtitle, standard nodes have blue
  border with field count subtitle, complete node
  has a red 3-px border with its name centered
  in the card and no subtitle.
- [ ] **F9** Edges display correctly: forward
  edges are solid blue lines with arrow markers
  and named labels. Cycle edges — those that
  close a loop because a return path from target
  back to source already exists in the graph —
  are dashed orange with a warning arrow. Sibling
  transitions between nodes that have no return
  path render as solid blue even when they share
  a level.
- [ ] **F10** Connection ports (small circles) are
  visible on every middle node when the flow is
  unlocked. Create and Archive nodes show a port
  only when they have no connected edges yet —
  per `canShowPort` in `web-app/app/flow-graph.ts`,
  ports render when not locked AND (not a
  start/complete node OR that special node has no
  connections). When the flow is locked, no node
  shows a port. Each port sits on the longest open
  perimeter gap of its node, not always the right
  side. Hover over a port. PASS: cursor changes
  to crosshair and a browser tooltip reads "Click
  and drag to create a new node attached here.
  Hold Shift to connect to an existing node
  instead."
- [ ] **F11** Click a node. PASS: node gets gold
  glow selection effect. Double-click the node.
  PASS: properties panel appears with the
  "State Properties" title and close button on
  the right (regular nodes only — Create/Archive
  nodes still show their kind title), then a
  Workers fieldset (HUMANS / AIs checkbox
  groups), then state name, description, form
  fields list, and outgoing transitions.
- [ ] **F12** Pan so a node sits near the right
  edge of the canvas, then double-click it. PASS:
  the properties panel slides out from the
  toolbar edge over ~200ms and the canvas
  re-centers so the node sits at the visual center
  of the canvas region not covered by the panel.
- [ ] **F13** While the panel is open, double-click
  a different node. PASS: panel content updates to
  the new selection and the canvas re-centers on
  it.
- [ ] **F14** Enable Auto Fit, then double-click a
  node. PASS: panel opens and the canvas re-fits to
  the panel-aware visible region (no toast, no
  blocking — Auto Fit handles the re-fit via
  `withFitReconciled`'s `panelOffsetPx`). Turn Auto
  Fit off and double-click again. PASS: panel opens
  and the canvas pans to keep the node visible, and
  the previous viewBox is saved for restoration when
  the panel closes.
- [ ] **F15** Drag from a middle node's port into
  empty canvas past 20 pixels, without holding
  Shift. PASS: during the drag a faint bezier
  preview plus a "New State" ghost card track the
  cursor. On release, a new middle node is
  created at the drop position and
  auto-connected from the source node with a
  default edge name.
  (The node-creation + auto-edge logic is now
  covered by `tests/flow-operations.test.ts`
  (`performAddNodeAtPosition` + `performAddEdge`).
  This browser case remains BLOCKED for the port-
  drag gesture itself per the MCP pointer-capture
  limitation.)
- [ ] **F16** Drag a standard node to a new
  position. PASS: node follows the pointer and
  can be placed freely on the canvas.
- [ ] **F17** Drag the start node. PASS: it moves
  freely like any standard node (start and
  complete nodes are both draggable; Auto Layout
  restores them to upper-left and lower-right
  respectively when invoked). Clicking the start
  node's port still initiates a drag-from-start
  to create a new state.
- [ ] **F18** Toggle the Auto Layout header
  switch. PASS:
  all nodes reposition based on their rank from
  start. Create is placed top-left, Archive
  bottom-right, others arranged by graph depth.
- [ ] **F19** Hold Shift and drag from a middle
  node's port over another middle node, then
  release. PASS: during the drag the preview
  re-draws from a ghosted grey straight line
  (when the cursor is over empty canvas) into a
  curved bezier with an arrowhead the moment the
  cursor enters a valid target node. On release
  over the target, a new edge is created with a
  default name. No "New State" ghost card is
  shown while Shift is held.
  (Applies to F19–F23: the connection-validation
  rules these would check — no edge to a start
  node, none from an end node, no duplicate edge,
  start-node-single-outgoing, and the cycle-vs-
  forward classification via the reachability
  check — are now covered by
  `tests/flow-operations.test.ts` (`performAddEdge`,
  including the noop branch for a release in empty
  canvas). F19–F23 remain BLOCKED for the shift-
  drag gesture itself per the MCP pointer-capture
  limitation; the FSM preview transitions are also
  exercised by `tests/flow-fsm-reduce.test.ts`.)
- [ ] **F20** Shift-drag forward (earlier node →
  later node). PASS: the curved preview is solid
  blue while over the target. The committed edge
  matches the preview exactly.
- [ ] **F21** Shift-drag backward (later node →
  earlier node). PASS: the curved preview is
  dashed orange with a warning arrow while over
  the target — the reachability check recognises
  that target → … → source already exists. The
  committed cycle edge matches the preview.
- [ ] **F22** Shift-drag and release in empty
  canvas (no node under cursor). PASS: the grey
  straight-line preview disappears and nothing
  happens — no edge, no new node.
- [ ] **F23** Begin a plain drag from a port (no
  Shift). While the mouse remains stationary,
  press and hold Shift. PASS: without any mouse
  movement the ghost "New State" card disappears
  and the preview collapses to the grey line (or
  curved bezier if the cursor is already over a
  target). Release Shift — the ghost card
  returns. Release the mouse with Shift held to
  create an edge, or without Shift to create a
  node.
- [ ] **F24** Double-click a node, edit its name in
  the properties panel. PASS: the node label
  updates on the SVG canvas immediately (changes
  auto-save after 800ms debounce).
- [ ] **F25** Double-click a node, click "+ Add
  Field". Enter field name, select type from
  dropdown, toggle required. PASS: field appears
  in the fields list with lowercase type badge
  (e.g. "text") and red asterisk (*) if required.
- [ ] **F26** Click an edge to select it (gold glow).
  Double-click to open properties panel. PASS:
  panel shows transition name, description,
  from/to state names. Edit the name. PASS: label
  updates on the canvas.
- [ ] **F27** Select a non-start/non-complete node,
  click the Delete (trash) button in toolbar.
  PASS: node and all connected edges are removed.
- [ ] **F28** Select an edge, click the Delete
  (trash) button in toolbar. PASS: edge is
  removed from the canvas.
- [ ] **F29** Click "Zoom +" and "Zoom -" in
  toolbar. PASS: canvas zooms in and out smoothly.
  Toggle the Auto Fit header switch on. PASS:
  canvas adjusts to show all nodes.
- [ ] **F30** Edit a node name via the properties
  panel, wait 1 second for auto-save. Navigate
  away and return to the designer. PASS: all
  nodes, edges, fields, and positions persist.
- [ ] **F31** Navigate to
  `flows/detail.html?flowId=nonexistent`. PASS:
  page handles gracefully — shows error state,
  no unhandled JS exception.

### Flow Designer — Undo/Redo

(The undo/redo version-stack semantics — apply the previous
version, advance the redo cursor, clear the redo stack on a new
action, no-op at the ends of the stack, the persisted
`FLOW_VERSION_CAP` trimming — are covered by
`tests/flow-operations.test.ts` (`performUndo` / `performRedo`)
and `tests/adapters-flow-versions.test.ts`. The cases below
verify the toolbar buttons, the keyboard shortcuts, the disabled
states, and that the canvas re-renders after each step.)

- [ ] **F32** After adding a state, click the Undo
  toolbar button. PASS: the state and its
  connecting edge are removed. Redo button
  becomes enabled.
- [ ] **F33** Click the Redo toolbar button. PASS:
  the state and edge reappear.
- [ ] **F34** After moving a node, press Cmd+Z (Mac)
  or Ctrl+Z. PASS: node returns to its previous
  position.
- [ ] **F35** After deleting a state, undo. PASS:
  the state and all its connected edges are
  restored.
- [ ] **F36** Undo and Redo buttons are disabled
  when their respective stacks are empty. PASS:
  buttons show disabled state initially.
- [ ] **F37** Perform an action, undo, then perform
  a new action. PASS: the redo stack is cleared
  (redo button disabled).

### Flow Designer — Keyboard Shortcuts

- [ ] **F38** Press Delete or Backspace with a node
  or edge selected (not focused in an input).
  PASS: selected item is deleted.
- [ ] **F39** Press Cmd+Z / Ctrl+Z to undo, press
  Cmd+Shift+Z / Ctrl+Shift+Z to redo. PASS:
  keyboard shortcuts match toolbar button
  behavior.

### Flow Designer — Additional Coverage

- [ ] **F40** Toggle the Locked checkbox in the designer header.
  PASS: connection ports disappear from all middle nodes, the
  Delete toolbar button becomes disabled, and opening a properties
  panel shows fields as read-only (inputs `disabled`, every
  checkbox in the Workers fieldset also `disabled` and
  unresponsive to clicks). Auto Layout remains enabled because
  it only repositions nodes without changing structure. Visual
  confirmation: nodes render with gold strokes regardless of
  type (Create, Archive, Regular), edges render with gold
  strokes (cycles remain dashed), edge-label backgrounds gain
  gold strokes, and the dot-grid background renders unchanged
  from its unlocked appearance. Untoggle Locked: ports return,
  the Delete button re-enables, fields become editable, the
  Workers checkboxes become interactive again, and per-type
  colors return (Create green, Archive red, Regular blue,
  Cycle amber).
- [ ] **F41** With a non-trivial flow loaded, click "Copy Mermaid"
  in the toolbar. PASS: toast confirms the clipboard copy, and the
  clipboard holds Mermaid flowchart syntax for the current graph.
  (Round-trip correctness — `generateMermaid` → `parseMermaid`
  preserving nodes, edges, and field definitions — is covered by
  `tests/mermaid.test.ts`; this case verifies the toolbar action
  and the clipboard write.)
- [ ] **F42** Click "Export" in the toolbar. PASS: a `.zip` file
  downloads. Unzip the archive — it contains `flow.mmd` (Mermaid
  source), `flow.json` (graph with node positions), and a
  human-readable `flow.txt`. (ZIP read/write correctness is covered
  by `tests/zip-guards.test.ts`.)
- [ ] **F43** On `flows/index.html` click "Import Flow", select a
  `.mmd` file previously exported from a known flow, choose a
  project, and submit. PASS: the imported flow opens in the designer
  and renders nodes, edges, and fields. (Structural fidelity of the
  mermaid round-trip is covered by `tests/mermaid.test.ts`; this
  case verifies the import dialog and that the designer opens on the
  imported flow.)
- [ ] **F44** Repeat F43 with a `.zip` archive. PASS: the imported
  flow renders with node positions preserved (not auto-laid-out).
  (ZIP round-trip is covered by `tests/zip-guards.test.ts`; this
  case verifies the `.zip` import path through the dialog and the
  preserved-position rendering.)
- [ ] **F45** Make 11 edits in the flow designer (e.g. rename 11
  nodes one at a time, waiting for each auto-save). PASS: the
  persistent undo history retains at most 10 versions (inspect
  `fusion-ai:flow_versions` in DevTools — at most 10 rows for this
  `flow_id`; the oldest has been hard-deleted). (The
  `FLOW_VERSION_CAP` trimming logic itself is covered by
  `tests/adapters-flow-versions.test.ts`; this case verifies it
  end-to-end through the designer's auto-save.)
- [ ] **F46** Edit a flow (rename a state), let auto-save complete.
  Navigate away from the designer to `flows/index.html`. Re-open the
  same flow. Click Undo. PASS: the rename reverts — the undo history
  survived navigation because versions are persisted to the schema,
  not held in memory.

### Space Toggle (Pan Mode)

- [ ] **F47** With the canvas focused, tap the spacebar once.
  PASS: a primary-colored outline appears around the canvas; the
  cursor becomes `grab` over canvas, nodes, and edges.
- [ ] **F48** With pan mode on, tap the spacebar a second time.
  PASS: the outline disappears and the cursor returns to its
  default state.
- [ ] **F49** With pan mode on, drag the canvas, release, then
  drag again. PASS: both drags pan the viewport — pan mode
  persists across multiple drags until toggled off.
- [ ] **F50** Hold the spacebar down for two seconds without
  releasing. PASS: pan mode toggles on exactly once; browser
  auto-repeat does not chatter the toggle.
- [ ] **F51** Begin dragging a node. While the drag is in flight,
  tap the spacebar. PASS: the drag completes unchanged; pan mode
  state is unchanged when the drag ends.
- [ ] **F52** Begin a marquee selection on empty canvas. While the
  marquee is in flight, tap the spacebar. PASS: the marquee
  continues; pan mode state is unchanged when pointer-up
  resolves.
- [ ] **F53** Shift-drag from a node port to begin a connect
  gesture. While connecting, tap the spacebar. PASS: the connect
  gesture continues; pan mode state is unchanged at pointer-up.
- [ ] **F54** With pan mode on and a pan drag in flight, tap the
  spacebar mid-drag. PASS: the pan drag continues; pan mode
  state is unchanged until the drag ends.
- [ ] **F55** Toggle Auto-Fit on. With pan mode off, tap the
  spacebar. PASS: an error toast appears ("Disable Auto-Fit to
  change the view"); pan mode stays off.
- [ ] **F56** With pan mode on, toggle Auto-Fit on, then tap the
  spacebar. PASS: pan mode turns off cleanly with no toast —
  exiting pan mode is always permitted.
- [ ] **F57** Focus a text input (e.g. node name in the panel).
  Tap the spacebar. PASS: a literal space character is inserted
  into the input; pan mode state is unchanged.

### Workers Selector (Node Panel)

- [ ] **F58** Open a regular-node properties panel. PASS:
  the Workers fieldset is the first body block, with a
  "Workers" legend, a HUMANS group containing one
  labeled `<input type="checkbox" data-worker-id="<id>">`
  per active human (alphabetized by full name), and an
  AIs group containing one checkbox per AI worker
  (alphabetized by name). When the checkbox list overflows
  the panel height, the fieldset scrolls inside its own
  region.
- [ ] **F59** Tick one human checkbox and one AI checkbox.
  Reload the page and reopen the same node panel. PASS:
  the same two checkboxes are still ticked. Inspect
  `localStorage['fusion-ai:flows']` — the node carries
  `workerIds: [<humanId>, <aiId>]`.
- [ ] **F60** Untick one of the two checkboxes. Reload the
  page and reopen the panel. PASS: only the remaining
  ticked worker persists in `workerIds`.
- [ ] **F61** Untick all checkboxes so `workerIds` is `[]`.
  Reload the page. PASS: every checkbox in the panel is
  unticked. The node now displays the danger badge per
  F73.
- [ ] **F62** Lock the flow via the toolbar Locked switch.
  Open a regular-node panel. PASS: every checkbox in the
  Workers fieldset is rendered with the `disabled`
  attribute; clicking does nothing.
- [ ] **F63** Open a Start-node panel. PASS: the header
  shows the "Create" title and close button — no
  Workers fieldset (Create nodes never assign workers).
- [ ] **F64** Open an End-node panel. PASS: the header
  shows the "Archive" title and close button — no
  Workers fieldset.
- [ ] **F65** Open an edge panel. PASS: the header shows
  "Transition Properties" title and close button — no
  Workers fieldset.
- [ ] **F66** Inspect `localStorage['fusion-ai:flow_versions']`
  before and after a `workerIds` change. PASS: a new
  version row appears for the flow after the change
  (worker assignment participates in versioning).
- [ ] **F67** Tick one checkbox in the Workers fieldset,
  then press Cmd+Z (Mac) / Ctrl+Z (Win/Linux). PASS: the
  checkbox unticks — `workerIds` changes are undoable
  like name/description changes.

### Field Editor (Node Panel)

- [ ] **F68** Single-select a regular node (not Create/Archive)
  to open the properties panel. Click "+ Add Field". PASS:
  the field editor form appears below the button — name
  input, type select, required checkbox, options textarea,
  and an "Add" button are visible inside the panel.
  (Regression for the captured-presenter bug at
  `detail.ts:1006`: this exact click used to do nothing
  because the handler closed over a presenter captured at
  init time, which had no selection.)
- [ ] **F69** Continuing from F68, type "Email" in the name
  input, change type to "email", check Required. Click
  Add. PASS: a row "Email" with an "email" type badge and
  a red asterisk appears in the fields list. The form
  remains visible so additional fields can be added.
- [ ] **F70** Continuing from F69, click the delete control
  on the "Email" field row. PASS: the row disappears from
  the fields list.
- [ ] **F71** Lock the flow via the toolbar checkbox.
  Single-select a regular node and click "+ Add Field".
  PASS: a "Flow is locked" toast appears; the field
  editor form is NOT injected into the panel.
- [ ] **F72** Single-select a regular node. Tick one
  worker checkbox in the Workers fieldset. Click "+ Add
  Field" in the same panel. PASS: the field editor form
  appears. (Regression: a `workerIds` commit replaces the
  presenter, so a click handler that captured a stale
  presenter would have acted on the pre-commit snapshot —
  this case proves the handler reads the current presenter
  at click time.)
- [ ] **F73 — Hazard severity rendering.** On a regular
  (non-start, non-complete) node, vary the worker count
  and outgoing-edge count and confirm the bottom-left
  badge:
    - **0 workers** → red octagon (`iconNoEntry`,
      `.flow-node-danger`). Hover → tooltip
      "Workers required".
    - **0 outgoing edges** (regardless of worker count) →
      red octagon, tooltip "Dead end (no outgoing edges)"
      when `workerIds.length > 0`.
    - **1 worker AND ≥1 outgoing edge** → yellow triangle
      (`iconAlertTriangle`, `.flow-node-warning`). Hover →
      tooltip "Single worker assigned (no backup)".
    - **≥2 workers AND ≥1 outgoing edge** → no badge.
  Confirm the start node and the complete node never
  display a badge regardless of state.
- [ ] **F74** With the Properties panel closed,
  confirm the flow canvas fills the content area
  to the right of the global sidebar (panel-aware
  fit honors `PANEL_WIDTH_PX`). Open the panel,
  pan the canvas, then close the panel via the X.
  PASS: pan/zoom/auto-fit/panel-toggle interactions
  read the *content-area* clientWidth, not the
  full viewport — the global sidebar does not
  steal canvas space.

---

## F2. Workbox

### AA13. Workbox Source Flow

- [ ] **AA-WB-SETUP** Create one Workbox-only flow named `WB Test Flow` with three nodes: Create → Capture (text + select fields) → Archive (`is_complete: true`). This flow is mutated only by Agent-F2. Agent-F2's WO creation reads from this flow, not from any Agent-F flow.

### Workbox Inbox (`workbox/`)

- [ ] **WB1** Navigate to `workbox/`. PASS:
  page shows "Workbox" title, subtitle "Your
  work order inbox", Active/Archive tabs, and
  a "+ Create Work Order" button.
- [ ] **WB2** With no work orders, the Active
  tab shows an empty state with mail icon and
  "No Active Work Orders Yet" message.
- [ ] **WB3** Click the Archive tab. PASS: tab
  switches to show archive list (empty state
  initially).

### Workbox — Create Work Order

- [ ] **WB4** Click "+ Create Work Order". PASS:
  a dropdown opens with up to two labeled
  sections — `READY` (clickable rows, one per
  publishable flow including `WB Test Flow`) and
  `NOT READY` (disabled rows for any flow with
  zero-worker or dead-end nodes; each carries a
  red octagon icon and a subtitle "1 node needs
  attention" or "N nodes need attention"). Hover
  a `NOT READY` row. PASS: cursor stays default
  (no `pointer`), `aria-disabled="true"` is
  present, no `data-flow-id` attribute.
- [ ] **WB4a** Click a `NOT READY` row. PASS:
  nothing happens — the dropdown stays open, no
  navigation occurs (the click handler ignores
  rows without `data-flow-id`).
- [ ] **WB5** Click `WB Test Flow` from the
  `READY` section. PASS: work order is created,
  browser navigates to the action screen at the
  first post-start state ("Capture"). Display ID
  (8-char hex) is visible in the header.
- [ ] **WB5a** Edit `WB Test Flow` to remove the
  outgoing edge from `Capture` (creating a dead
  end). Return to Workbox, open the Create Work
  Order dropdown. PASS: `WB Test Flow` now
  appears in the `NOT READY` section with
  subtitle "1 node needs attention". Restore the
  edge and verify it returns to `READY`.
- [ ] **WB5b — Server-side gate.** With `WB Test
  Flow` in a non-ready state, drive
  `postWorkOrderCreation` directly via DevTools
  console (`await
  postWorkOrderCreation(createRequestContext(),
  { flow_id: '<id>' })`). PASS: a thrown error
  surfaces with message containing "flow not
  ready" — defense in depth even if the picker
  is bypassed.

### Workbox — Action Screen (`workbox/detail.html`)

- [ ] **WB6** The action screen shows: back button
  (icon-only), flow name, display ID, current
  state badge, and dynamically rendered fields
  matching the current node's field definitions
  from the flow graph.
- [ ] **WB7** Field types render correctly: text
  inputs, textareas, selects, number inputs,
  date inputs, file inputs, checkboxes, radio
  buttons as appropriate for each field type
  in the flow definition.
- [ ] **WB8** Transition buttons appear below
  the fields, one per outgoing edge from the
  current node, labeled with the edge name.
- [ ] **WB9** A "Release Work Order" button is
  visible,
  separate from transition buttons.
- [ ] **WB10** A collapsible History section
  shows all transitions with from/to state
  names, user name, and relative timestamp.

### Workbox — Transitions

- [ ] **WB11** Fill in required fields and click
  a transition button. PASS: transition is
  recorded, work order moves to the next state,
  browser navigates back to the inbox. The work
  order appears in the Active tab (unclaimed).
- [ ] **WB12** Click the work order row in the
  Active tab. PASS: work order is claimed and
  browser navigates to the action screen
  showing the new state's fields.
- [ ] **WB13** Click "Release Work Order". PASS:
  a single click soft-deletes the active claim
  and the browser navigates to the inbox, where
  the work order reappears in the Active tab.

### Workbox — Completion

- [ ] **WB14** Transition a work order to the
  completion node (is_complete=true). PASS:
  work order moves to the Archive tab. It no
  longer appears in Active.
- [ ] **WB15** Click a completed work order in
  the Archive tab. PASS: action screen shows
  read-only view with history but no fields
  or transition buttons.

### Workbox — Data Integrity

- [ ] **WB16** After creating and transitioning
  a work order, check localStorage. PASS:
  `work_orders` table has 1 row with `display_id`
  and `flow_graph` JSON. The `states` table has
  one row per transition with `entity_id` =
  work-order id, `state` = the target node id (a
  base62 token), `worker_id` = the actor, and
  `at` = RFC-3339 Zulu. Per-field values written
  by the transition land in `state_field_values`
  rows referencing the state event by
  `state_event_id`.
- [ ] **WB17** Navigate away from the action
  screen and return. PASS: all data persists
  correctly across page navigation.

### Workbox — Concurrency & Integrity

- [ ] **WB18** Open the same unclaimed work order in two browser
  tabs. In tab 1, click the row to claim it. In tab 2, attempt the
  same. PASS: tab 2 either navigates to a read-only/already-claimed
  view or the claim is rejected — and the `fusion-ai:states` log
  contains at most one live `'claimed'` event for this work
  order's `entity_id` (a stale prior claim is superseded by a
  materialized `'claim_expired'` event, never overwritten in
  place).
- [ ] **WB19** After transitioning a work order through at
  least two states, read `fusion-ai:states` from DevTools and
  filter to `entity_id` = this work order's id. PASS: each
  non-claim event has the immutable shape `{id, entity_id,
  state, worker_id, at}`, with `state` carrying the target
  node's base62 id — the field values themselves live in the
  `state_field_values` join table per Codd 1NF, referencing
  the parent event by `state_event_id`. Verify no app code
  path mutates an existing event row — the states log is
  append-only.

### Workbox — All-See-All Visibility

Every authenticated user sees every active and archived
work order regardless of node assignment. There is no
per-user visibility filter.

- [ ] **WB20** As the demo user, navigate to `workbox/`.
  Active tab. PASS: every active (non-completed,
  non-claimed-by-other) work order is listed regardless
  of its current node's `workerIds` — including nodes
  assigned only to AI workers and nodes with zero
  workers (which carry the danger badge in the designer
  but are still visible in the inbox).
- [ ] **WB21** Switch to the Archive tab. PASS: every
  completed work order is listed regardless of which
  worker(s) the final transition referenced.
- [ ] **WB22** Inspect `web-app/app/presenters/workbox-
  inbox.ts`. PASS: `buildInboxItems` takes
  `(workOrders, transitions, claims, workerMap, mode)`
  with no scope parameter. The presenter exports nothing
  related to per-user visibility — the workbox shows all
  work orders to all users by construction.

---

## FS. Flow Statistics (Agent-F2 read-only domain)

**Mock-data blast radius:** the flow-statistics work added ~38
work orders to "Customer Onboarding" and ~6 to a second flow,
plus their flow-work-order join rows and transition chains.
Workbox cases (WB1–WB19) and dashboard counts re-baseline
against the parallel-protocol's "greater-than-or-equal-N"
tolerance; expected counts in those sections are now lower
bounds, not equalities.

**MCP note:** hover/click on SVG `<g>` works with synthetic
events on this page (no pointer-capture FSM, unlike
`flows/detail`), so FS4 / FS5 / FS7 are directly drivable by
the claude-in-chrome MCP.

### Flow Statistics Page (`flows/stats.html`)

- [ ] **FS1** From `flows/index`, click a flow card's chart
  icon → lands on `flows/stats.html?flowId=<id>`. The page
  renders the heat-tinted SVG canvas, a path stepper, and a
  legend gradient bar. No left toolbar, no slide-in props
  panel, no connection ports, no marquee. The cursor over a
  node is `pointer` (clicking is allowed); no port-drag
  affordance appears.
- [ ] **FS2** From `flows/detail`, click the Stats button in
  the header → same stats page. The "Designer" / back button
  returns to `flows/detail.html?flowId=<id>` (and preserves
  `projectId` if set).
- [ ] **FS3** Node tints span the ramp on the flagship flow
  ("Customer Onboarding"): Data Capture is yellow/red (hot),
  Review is warm, Create/Archive carry the cool (or no-data)
  tint. Node faces show the em-dash on Create and Archive and
  a value like `8.5m` / `2.1d` on regular nodes.
- [ ] **FS4** Hover a node → a read-only stat card pops near
  it with: % of flow time, avg/median/p90 durations, visits /
  distinct WOs / WIP, ~N/wk throughput, loop-back rate, clan
  size + active producers, top producer (name + % of clan avg
  + % of node's work, with "(not in current clan)" iff
  applicable). For a branch node, `next` shows the per-edge
  split. The card has NO inputs and NO Save button.
  Mouse-out → card hides.
- [ ] **FS5** Click a node → the card pins (stays open on
  mouse-out). Click empty canvas → unpins. Click another
  node → re-pins to it.
- [ ] **FS6 — Hazard severity rendering on the stats
  canvas.** The stats renderer reads `n.workerHazard`
  emitted by `flow-stats-aggregate.ts`. Confirm:
    - **Zero workers** → red octagon (`iconNoEntry`,
      `.flow-stats-node-danger`); tooltip "Workers
      required".
    - **Zero outgoing edges** (non-Archive node) → red octagon;
      tooltip "Dead end (no outgoing edges)".
    - **One worker AND ≥1 outgoing edge** → yellow triangle
      (`iconAlertTriangle`, `.flow-stats-node-warning`);
      tooltip "Single worker assigned (no backup)".
    - **≥2 workers AND ≥1 outgoing edge** → no badge.
  Create and Archive never display a badge. The
  card subtitle shows the assigned workers' names joined
  by ", " (or "Unassigned" if `workerIds` is empty).
- [ ] **FS7** Path stepper: `Path 1 of M, X% of N work
  orders` with prev/next controls. Clicking next advances;
  the selected path's nodes + edges get an accent stroke and
  off-path elements dim to ~28% opacity. The highlight does
  NOT pulse or animate (deliberately distinct from the
  editor's selection glow). At the last visible path, next is
  disabled (or, if there's a rest bucket, advances to
  "+N rarer paths, combined Z%" which highlights nothing).
- [ ] **FS8** Dark-mode toggle persists across navigation to
  the stats page; the heat tints and the card remain legible
  in both themes. The face number text contrasts adequately
  at all heat levels.
- [ ] **FS9** Data-shape regression: heat fractions sum to
  ~100% across non-special nodes on the flagship flow. WIP
  counts in the card match the WOs currently sitting in each
  node (cross-check against the Workbox). Direct navigation
  to `flows/stats.html` with no `flowId` redirects to
  `flows/index.html`.

---

## G. Admin Pages

### Retired pages

> The standalone Teams, People, Roles, Crews, Profile,
> Company, and Activity Feed pages have all been removed.
> Worker administration (humans + AI workers) now lives on
> the unified Workers page — see G11 onward. Cases G1–G8,
> G15–G18, G25–G29 and the former K/L sections (Roles,
> Crews) are no longer part of the plan.

### Organization (`organization/index.html`)

- [ ] **G9** Navigate to `organization/index.html`. PASS:
  page wears the standard sidebar + top-bar layout. Shows
  the page header "Organization", a General Information
  card at the top with read-only Organization Name and
  Domain plus an Edit button, then the overview card
  (plan info, health badge, seats stats), the Usage
  Overview card with progress bars, and the Security &
  Administration card linking to Workers and Billing.
  (Overview gauge values are hardcoded placeholders —
  verify the page renders without error; numeric accuracy
  will be addressed when wired to live tables.)
- [ ] **G10** In the General Information card, click Edit.
  PASS: page header swaps Edit for Save/Cancel; the card
  body switches the read-only fields to two inputs
  prefilled with the current Organization Name and Domain.
  Health score (92, "excellent") still renders in the
  overview card below.

### Workers list (`workers/index.html`)

- [ ] **G11** Navigate to `workers/index.html` (reachable
  via the "Workers" sidebar entry). PASS: page header reads
  "Manage Workers" with a subtitle showing the human and AI
  counts (e.g. "10 humans, 4 AIs"). A `+ Add Worker` button
  on the right opens the kind-picker dialog. Below the
  header sit a search input and three filter chips (All /
  Humans / AIs, with All pressed by default). The list
  table groups workers under HUMANS first then AIs, each
  group showing avatar/name, title (humans) or provider
  (AIs), department (humans) or masked auth token (AIs),
  and a status badge (humans only).
- [ ] **G12** Click the sidebar account chip (lower-left).
  PASS: navigates to the current human worker's
  `worker-detail` page (`?workerId=<id>`). Click the
  header greeting ("Good {time-of-day}, {name}"). PASS:
  also navigates to the current human's `worker-detail`
  page.
- [ ] **G13** Type in the search input. PASS: filters the
  list by name (humans) or name + provider (AIs) in
  real-time. Click the Humans filter chip. PASS: only the
  HUMANS group is visible. Click AIs. PASS: only the AIs
  group is visible. Click All. PASS: both groups return.
- [ ] **G14** Click `+ Add Worker`. PASS: dialog opens with
  the Kind toggle defaulting to Human, the Human form
  visible, and the AI form hidden. Switch the toggle to
  AI. PASS: the Human form hides, the AI form appears
  with the security warning (yellow text starting "⚠ Auth
  tokens are stored unencrypted...").
- [ ] **G14a** With Kind=AI selected, leave the Auth Token
  field empty and click Create. PASS: the form is rejected
  client-side (the input is `required`/`aria-required`); no
  POST fires. Fill all four AI fields with valid values and
  click Create. PASS: toast confirms; the new AI appears in
  the AIs group.

### Worker detail — Human (`workers/detail.html?workerId=<hw_*>`)

- [ ] **G19** From `workers/index.html`, click any human
  worker's row. PASS: navigates to `worker-detail`. Read
  mode shows avatar (initials), name + status badge,
  title · department subtitle, Personal Information card
  (First Name, Last Name, Email, Phone, Title, Department,
  Bio), Working Styles card (4-axis dimensions), and
  Strengths card.
- [ ] **G20** Click Edit. PASS: header swaps Edit for
  Cancel/Save; Personal Information card switches to
  inputs (First/Last Name text, Email email-input, Phone
  text, Title text, Department select, Status select, Bio
  textarea); Strengths card switches to a tag picker.
  Working Styles card stays read-only.
- [ ] **G21** Edit Phone and Bio, toggle one strength on
  and one off, change Status from Active to Pending,
  click Save. PASS: toast "Worker saved" appears. Navigate
  away (e.g. to Dashboard) and return. PASS: all edits
  persist; the row on `workers/index.html` reflects the new
  status badge.
- [ ] **G22** Click Edit, change a field, press `Escape`.
  PASS: edits discarded, view returns to read mode.
- [ ] **G23** Click Edit, change a text field, press
  `Enter` while focused on the input. PASS: save fires
  (toast "Worker saved").
- [ ] **G23a** From `worker-detail`, click the back button.
  PASS: returns to `workers/index.html`.

### Worker detail — AI (`workers/detail.html?workerId=<ai_*>`)

- [ ] **G24** From `workers/index.html`, click any AI
  worker's row. PASS: navigates to `worker-detail`. Read
  mode shows the AI Worker card (Name, Provider,
  Description) with an inline Auth Token section showing
  the masked token (last 4 chars only, e.g. `sk-...XXXX`)
  rendered in monospace.
- [ ] **G24a** Click Edit. PASS: identity fields become
  inputs (Name text, Provider text, Description textarea);
  the Auth Token field becomes a `type="password"` input
  with placeholder "Leave blank to keep current token" and
  the security-warning paragraph below. Save with the token
  field blank. PASS: toast "AI worker saved"; on reopen the
  masked token is unchanged.
- [ ] **G24b** Click Edit again, type a new token, click
  Save. PASS: toast "AI worker saved"; on reopen the
  masked token's last 4 chars match the new value.

### Snapshots (`snapshots/`) — Phase 4 (Run These Last)

**Phase 4 — Snapshot lifecycle & objective wipe.** Cases
G30–G35 (snapshot lifecycle) and K8 (DevTools localStorage
wipe → Organization empty-state check → mock-data restore)
all destroy and restore the shared database. They MUST run
alone in tab 0 after Phase 3 completes — never concurrent
with Phase 2.

(Snapshot serialization, per-row import-validation, the quota
pre-flight, column-level compression, and wipe-on-fail are
covered by `tests/snapshot-import-validation.test.ts`,
`tests/snapshot-quota.test.ts`, `tests/snapshot-wipe-on-fail.test.ts`,
and `tests/db-localstorage-compression.test.ts`. The cases below
verify the four operation cards, the file-picker affordance, the
post-operation redirect, and that pages render against the
restored data.)

- [ ] **G30** Navigate to `snapshots/`. PASS: shows 4 operation cards (Create Pristine Environment, Wipe and Load Mock Data, Download Snapshot, Upload Snapshot). The Upload Snapshot card hosts a hidden `<input type="file" id="upload-input">` that the card's button triggers.
- [ ] **G31** Click "Download Snapshot". PASS: browser downloads `fusion-ai-snapshot-YYYY-MM-DD.json`. File contains valid JSON with entity data.
- [ ] **G32** Click "Create Pristine Environment", confirm
  the dialog. PASS: redirects to `dashboard/index.html`.
  Dashboard renders with zeroed-out metrics (empty
  database). Every table in `TABLE_NAMES` is present as
  an empty array EXCEPT `fusion-ai:workers` and
  `fusion-ai:organization`, which `postBootstrap`
  bootstrap-seeds after the pristine wipe — `workers`
  holds the current user (Tony Stark), `organization`
  holds Stark Industries. Empty-array tables persisted
  via column-compression appear as a `gz1:H4sI…`
  sentinel rather than the literal `[]` string; the
  `db-localstorage` adapter decodes them transparently.
  The full table set is the constant `TABLE_NAMES` in
  `api/db.ts`;
  cross-check against that. No tables outside that list
  appear under any `fusion-ai:*` key.
- [ ] **G33** Click "Wipe and Load Mock Data". PASS: redirects to `dashboard/index.html`. Navigate to `ideas/` — 11 ideas are back.
- [ ] **G34** Return to `snapshots/`, wipe data, then use "Upload Snapshot" file input and select the previously downloaded JSON file. PASS: redirects to `dashboard/index.html`. Data matches the snapshot.

### Snapshot & User Lifecycle — Error/Edge Cases

- [ ] **G35** On `snapshots/`, click "Upload Snapshot" and select a
  malformed JSON file (e.g. truncated mid-object). PASS: a toast or
  inline error reports the upload failed with a human-readable
  message; existing data in localStorage is untouched (verify via
  DevTools that no fusion-ai:* keys were overwritten or cleared).
  Note: malformed JSON is rejected at parse time — BEFORE any
  write — so the wipe-on-fail path is NOT exercised by this case.
  Wipe-on-fail fires for the rarer scenario where parse succeeds
  but a per-row validator throws mid-write; that path is covered
  by `tests/snapshot-wipe-on-fail.test.ts`. The pre-parse
  rejection logic and the wipe-on-fail behavior are covered
  by `tests/snapshot-import-validation.test.ts` and
  `tests/snapshot-wipe-on-fail.test.ts` — this case verifies the
  error toast/inline-error surfaces in the UI.)
- [ ] **G36** Worker lifecycle is recorded in the `states`
  event log via `archiveHumanWorker` / `archiveAIWorker`,
  which write a terminal `'archived'` state event for the
  worker's `entity_id`. The unified terminal vocabulary is
  shared across both worker kinds per Commandment III
  (Uniformity). Verify by inspecting `fusion-ai:states` in
  DevTools after the operation: a row appears with
  `entity_id` = the worker's id, `state` = `'archived'`,
  `worker_id` = the actor, and the worker row in
  `workers` / `ai_workers` itself is unchanged — the
  states log carries the lifecycle stage, not a column on
  the entity. The Archived badge text ("Archived") and
  reduced-opacity row styling reflect the state on render.

### Billing (`billing/`) — STUB

Billing is a placeholder page. `init()` is empty and
the body is hand-written static HTML. These tests
verify the page loads and the sidebar nav link works
— functional billing tests will be added when the
feature is implemented.

- [ ] **G37** Click "Billing" in the sidebar. PASS:
  browser navigates to `billing/index.html`. The page
  renders without console errors. Sidebar highlights
  the Billing link as active. No runtime JS errors
  from the empty `init()`.

### Organization General Information — Edit Cycle

- [ ] **G38** On `organization/index.html`, click
  Edit on the General Information card. Modify the
  Domain to a new value. Click Cancel. PASS: card
  returns to read mode, Domain shows the original
  (unmodified) value, no toast fires.
- [ ] **G39** Click Edit again. Modify Domain.
  Press `Escape`. PASS: card returns to read mode,
  Domain shows the original value (Escape behaves
  identically to Cancel; same code path as the
  Worker Detail edit cycle).
- [ ] **G40** Click Edit. Modify both Organization
  Name and Domain. Click Save. PASS: toast
  "Organization saved" fires at top-center,
  card returns to read mode showing the new
  values. Reload the page. PASS: new values
  persist (round-tripped through `PUT
  /api/organization`). Inspect localStorage:
  `fusion-ai:organization` row has the updated
  `name` and `domain` fields alongside the
  unchanged plan/seats/billing fields.

---

## H. Reference & System

- [ ] **H1** Navigate to `design-system/`. PASS: component gallery renders showing buttons, badges, cards, form elements, toasts, and other UI components from the design system.
- [ ] **H2** Navigate to `not-found/`. PASS: 404 page renders with a message and a link back to the dashboard or landing page.

---

## I. Cross-Cutting Concerns

### Theme

- [ ] **I1** Click the theme toggle (sun/moon icon) in the header, select "Dark". PASS: page switches to dark theme — background darkens, text lightens, CSS custom properties update.
- [ ] **I2** Navigate to another page. PASS: dark theme persists across navigation.
- [ ] **I3** Select "Light" theme. PASS: page returns to light theme.
- [ ] **I4** Select "System" theme. PASS: theme follows OS preference (matches `prefers-color-scheme`).
- [ ] **I5** Reload the page. PASS: theme choice persists (stored in `localStorage` key `fusion-theme`).
- [ ] **I6** Open the app in a second browser tab. Change theme in the first tab. PASS: second tab updates to the new theme without manual reload (cross-tab sync via StorageEvent).

### Sidebar

- [ ] **I7** Click the sidebar collapse button. PASS: sidebar collapses to icon-only view, main content area expands.
- [ ] **I8** Navigate to another page. PASS:
  collapsed state persists (stored in
  `localStorage` key
  `fusion-sidebar-collapsed`).
- [ ] **I9** Click the expand button. PASS: sidebar returns to full width with labels.

### Mobile Responsive

- [ ] **I10 — Mobile breakpoint** (NOT MCP-driven — `resize_window` does not change the CSS viewport). Verify by source: read `web-app/app/styles/responsive.css` and confirm `@media (max-width: 767px)` rules toggle the desktop sidebar (`.sidebar` → `display: none`) and reveal the mobile drawer. PASS = rules present and well-formed.
- [ ] **I11** Tap/click the hamburger menu. PASS: mobile sidebar sheet slides in from the left with navigation links.
- [ ] **I12** Tap/click the backdrop or a nav link. PASS: mobile sidebar closes.
- [ ] **I13** Tap a navigation link in the mobile sidebar. PASS: navigates to the target page and mobile sidebar closes.
- [ ] **I14** Open the mobile sidebar, press `Escape`. PASS: sidebar closes.
- [ ] **I15** Open the mobile sidebar, press `Tab` repeatedly. PASS: focus cycles through focusable elements inside the sidebar without escaping to the page behind it. `Shift+Tab` at the first element wraps to the last.

### Command Palette

- [ ] **I16** Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux). PASS: command palette overlay appears with search input focused.
- [ ] **I17** Type a search term (e.g. "ideas"). PASS: filtered results appear. Select a result — navigates to the corresponding page.
- [ ] **I18** Press `Escape`. PASS: command palette closes.
- [ ] **I19** Open command palette, type a search term. Use `Down Arrow` and `Up Arrow` to navigate results. PASS: active result highlight moves with arrow keys. Press `Enter`. PASS: navigates to the highlighted result.
- [ ] **I20** Open command palette with an empty search field. PASS: results list shows up to 12 items from the combined index, grouped by category (Pages, Ideas, Projects, Workers) with category headers — when the dataset is sparse enough for multiple categories to fit in 12 items, multiple groups appear; otherwise a single group is shown. Type a multi-category term (e.g. "dashboard") that matches across groups. PASS: results regroup under multiple category headers. Type a term that matches no results. PASS: result list is empty or shows a no-results message.

### Loading States

- [ ] **I21** Navigate to a data-dependent page with mock data loaded. PASS: loading skeleton (card-grid, card-list, or detail pattern) appears briefly before content renders.
- [ ] **I22** If an error occurs inside a `withLoadingState()` fetch path (e.g. a data-dependent page hits a thrown adapter error after the database initialized successfully), the error state with "Try Again" retry button is shown. PASS: clicking retry re-attempts data loading. (Note: errors surfaced from `initDatabase` itself — e.g. corrupted localStorage that fails before the page renders — show a separate "Failed to initialize database" error UI via `handleDatabaseError`, without a retry button. Both are valid error states for different layers.)

### Toasts

- [ ] **I23** Trigger a toast (e.g. save an idea, or use DB Admin reload). PASS: toast appears at top-center of the viewport (fixed to `top: var(--space-4); left: 50%; translateX(-50%)`), auto-dismisses after ~6 seconds with fade-out. (Toast position was migrated from bottom-right to top-center.)
- [ ] **I24** While a toast is visible, click its close button (×). PASS: toast dismisses immediately without waiting for auto-dismiss timer.
- [ ] **I25** Trigger multiple toasts in rapid succession (e.g. save an idea repeatedly). PASS: toasts stack visibly with the *newest at the top*, older ones flowing downward (`prepend` ordering, not `appendChild`). Up to 5 visible. When a 6th toast arrives, the *oldest* — at the bottom of the stack — is removed.

### Snapshot Round-Trip

- [ ] **I26** Download a snapshot, wipe data (Create Pristine), upload the snapshot. PASS: all data restored correctly — spot-check 3 pages to confirm content matches pre-wipe state. (Snapshot serialization/validation/compression is covered by `tests/snapshot-import-validation.test.ts`, `tests/snapshot-quota.test.ts`, `tests/snapshot-wipe-on-fail.test.ts`, and `tests/db-localstorage-compression.test.ts`; this case verifies the download → wipe → upload UI flow end-to-end.)

### General

- [ ] **I27** Check DevTools Console after navigating through 5+ different pages. PASS: no unhandled JavaScript errors (warnings and info messages from browser extensions are acceptable).

### Sidebar Cross-Tab Sync

- [ ] **I28** Open the app in two tabs. In tab 1 collapse the
  sidebar. PASS: tab 2 reflects the collapsed state without manual
  reload (cross-tab sync via StorageEvent on
  `fusion-sidebar-collapsed`).

---

## K. Objectives & Scoring

Owner agents: Agent-G (K1–K6 in Phase 2, K8 in Phase 4),
Agent-E (K7, K9–K23, K30), Agent-CH (K27–K29). Mutation
domain delta:

- Agent-G adds: `objectives`, `objective_revisions`,
  `deprecated`
- Agent-E adds: `project_objective_baseline_scores`,
  `project_objective_actual_scores`
- Agent-CH stays read-only

### K1–K6 — Organization Objectives box (Agent-G, Phase 2)

K7 has been reassigned to Agent-E and appears at the end of
the K30 subsection. K8 has been moved to Phase 4 alongside
G30–G35 (snapshot lifecycle) and is documented in the
Snapshots section below — it MUST NOT run in Phase 2
because it wipes localStorage, which is shared across the
seven Phase 2 agents.

**K1.** Open Organization page; confirm Objectives box
renders below the existing Overview/Usage/Admin cards with
5 seeded active objectives in position order. PASS if all
5 names display.

**K2.** Click `+ Add objective`; confirm modal opens. Enter
name "Test Objective" and description "Test desc"; click
Add. PASS if the new objective appears at the bottom of the
active list.

**K3.** Click `Edit` on an active objective; confirm modal
opens pre-filled. Change the name; click Save. PASS if the
list re-renders with the new name.

**K4.** Click `Deprecate` on an active objective; confirm
dialog opens. Confirm. PASS if the objective moves from
active to the Deprecated sub-section, with strikethrough.

**K5.** Click `Reactivate` on a deprecated objective; PASS
if it returns to the active list.

**K6.** Drag an objective to a new position. PASS if the
new position persists across a page reload.

**K8.** **Phase 4 case** — runs alone alongside G30–G35
after Phase 2 and Phase 3 complete. Catastrophic if run
in Phase 2 because it wipes localStorage, which is shared
across all seven Phase 2 agents.

Empty state: wipe localStorage via DevTools
(Application > Local Storage > Clear All), then navigate
to the Organization page. PASS if the empty-state copy
"No objectives yet. Add one to get started." renders
(or the bootstrap redirects to the snapshots page per the
existing missing-schema rule). Restore via mock data
afterward.

### K9–K18 — Project detail action bar + Score + Approve (Agent-E)

**K9.** Open a `submitted` project; confirm action bar shows
the existing buttons (no Score yet — until status is
under-review).

**K10.** Transition status to `under-review` via the edit
form. PASS if `Score` button appears in the action bar.

**K11.** Click `Approve`; PASS if disabled with tooltip
"N objectives unscored" (matching the count of active
objectives).

**K12.** Click `Score`; PASS if modal opens with one slider
per active objective, all rendering visibly unset with
"Score required" hint.

**K13.** Drag two of the sliders to non-zero values; click
Save baselines. PASS if modal closes and the read-only
Objectives section on the page shows two baseline-scored
rows; Approve button **still** disabled because remaining
objectives unscored.

**K14.** Reopen Score modal; PASS if previously-set sliders
are pre-filled with their values; un-set sliders remain
visibly unset.

**K15.** Drag remaining sliders; save. PASS if Approve
button enables.

**K16.** Click Approve; confirm dialog opens. Confirm. PASS
if project status flips to `approved` and the action bar
re-renders with `Log measurement` / `Complete` / `View
history` buttons.

**K17.** Verify negative-score path: open a different
under-review project; in Score modal, drag one slider to
the far left (-100). Save. PASS if the project history
modal (open via View history later, once approved) shows
the negative score in red.

**K18.** Verify "no-payload" save: open Score modal on a
fully-scored project; don't move any slider; click Save
baselines. PASS if no new event rows are written (verify
via console: `localStorage.getItem(
'fusion-ai:project_objective_baseline_scores')` count
unchanged).

### K19–K23 — Log measurement + Complete (Agent-E)

**K19.** Open an `approved` project; click `Log measurement`;
PASS if modal opens with sliders pre-filled with baseline
values (no prior actuals) and a caption "Baseline: X · Last
actual: none yet."

**K20.** Drag one slider; click Save measurement. PASS if
the modal closes and the read-only Objectives section's
actual column updates for that objective.

**K21.** Click Log measurement again; PASS if the moved
slider now pre-fills with its latest actual value, caption
shows "Last actual: ... (date)."

**K22.** Click Complete on an approved project that lacks
actuals for some objectives; PASS if button is disabled
with tooltip listing missing objectives.

**K23.** Log measurements for every objective; click
Complete; confirm. PASS if status flips to `completed`.

### K24–K26 — Projects list Projected Impact column (Agent-E)

**K24.** Open Projects list; PASS if new column "Projected
Impact" renders for each row. Pre-approval projects with
no scores show "—"; scored projects show signed value.

**K25.** Sort by Projected Impact descending; PASS if rows
re-order accordingly (most-positive first).

**K26.** Filter to `under-review` status + sort by Projected
Impact descending; PASS if the result is the "review queue
ranked by impact" workflow we designed.

### K27–K29 — Dashboard Portfolio Impact + Aggregates (Agent-CH)

**K27.** Open dashboard; PASS if four cards render: Time,
Cost, Portfolio Impact (new bipolar arc), Aggregate
Objectives box (new full-width row below).

**K28.** Inspect the Portfolio Impact gauge. PASS if:
- The arc has muted background visible at all values
- For a net-positive portfolio, value arcs sweep right and
  use green tones
- For a net-negative portfolio, value arcs sweep left and
  use red tones
- The "actual" tick is visually distinct from the baseline
  area (thinner / different opacity)

**K29.** From another tab, log a measurement on an approved
project. PASS if the dashboard cards update within ~1
second (StorageEvent + scoreChanges propagation).

### K30 + K7 — Project history modal & temporal name resolution (Agent-E)

K7 runs LAST in Agent-E's block, after K30. K7 verifies the
temporal-name-resolution invariant that K30 only describes;
it has a cross-agent prerequisite on K3 (Agent-G's objective
rename in Phase 2). The orchestrator embeds the polling
contract in Agent-E's dispatch prompt.

**K30.** Open an approved project's View history modal.
PASS if:
- Events render in chronological order
- Each row shows date, event kind, objective name (as it
  was at the event's moment), and detail
- After an objective rename (K3), historical events still
  display the OLD name; events after the rename show the
  NEW name
- Baseline revisions appear as their own event rows (not
  collapsed)

**K7.** After K30 has run AND Agent-G's K3 has executed
(verify via
`localStorage.getItem('fusion-ai:objective_revisions')` —
≥1 row with a `name` change confirms K3 ran), reopen the
project's history modal. PASS if events that predate the
K3 edit display the OLD objective name, not the new one
(temporal name resolution). If after 10 minutes
`objective_revisions` shows no rename, mark K7 BLOCKED
with reason "no K3 rename to verify against — Agent-G did
not produce the prerequisite in time".

---

## J. Teardown

- [ ] **J1** Stop the HTTP server started in A3. PASS: process terminates.
- [ ] **J2** Remove the build directory (`rm -rf /tmp/fusion-test` or equivalent). PASS: directory removed.
- [ ] **J3** Verify the ZIP file remains on `~/Desktop` for archival. PASS: `fusion-ai-<sha>.zip` exists.

---

## Summary Format

The run produces a single conversational summary in the
following format. This is the contract `## How to invoke`
references. The doc itself is NOT mutated by the run.

```
# Test Plan Run — <ISO-8601 timestamp, Zulu>

Build SHA: <git rev-parse --short HEAD>  (clean | dirty: N files)
Mode: parallel-agents | serial

## Automated (AT)
- AT1 tsc: PASS (0 diagnostics)
- AT2 ./test: PASS (N/N, 0 fail, Xs)
- AT3 ./validate: PASS (lint clean)

## Manual Browser Regression
Total: <N> cases — PASS X · BLOCKED Y · FAIL Z

| Phase / Agent | Sections          | Pass | Blocked | Fail |
|---------------|-------------------|-----:|--------:|-----:|
| Preflight     | A1–A5             |    5 |       0 |    0 |
| Phase-1       | AA1–AA43+subs     |    X |       Y |    Z |
| Agent-B       | B1–B14            |   14 |       0 |    0 |
| Agent-CH      | C1–C7 + H1–H2     |    9 |       0 |    0 |
| Agent-D       | D1–D37            |    X |       Y |    Z |
| Agent-E       | E1–E11            |   11 |       0 |    0 |
| Agent-F       | F1–F74 + FS1–FS9  |    X |       Y |    Z |
| Agent-F2      | WB1–WB22 + subs   |   25 |       0 |    0 |
| Agent-G       | G9–14,19–24,36–40 |    X |       0 |    0 |
| Phase-3       | I1–I28            |    X |       Y |    Z |
| Phase-4       | G30–G35           |    6 |       0 |    0 |
| Teardown      | J1–J3             |    3 |       0 |    0 |

## BLOCKED detail (known MCP limitations — NOT failures)
- <case ID>: <one-line reason>

## FAIL detail
(none) | <case ID>: <one-line symptom>

## Drift Candidates
| Case | Mode | Symptom | Likely cause |
|------|------|---------|--------------|
(none) | ... | ... | ...
```

A fully green run with no drift produces zero rows in FAIL
and Drift Candidates, a one-line BLOCKED list, and fits in
under 50 lines.

`BLOCKED` is reserved for known MCP environmental limits
(pointer-capture gestures, `resize_window`, file I/O).
`FAIL` is for real regressions. A case that "mostly passes
but one subassertion drifts" is scored PASS with the drift
noted in the Drift Candidates table — the agent surfaces;
the user adjudicates.

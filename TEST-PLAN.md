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
`performAddAttributeRef` / `performRemoveAttributeRef` / `performUndo` /
`performRedo`, including no-edge-to-a-start-node, none-from-an-
end-node, no-duplicate-edge, start-node-single-outgoing, and the
lock/noop/commit-error branches); the flow version and query
adapters (`tests/adapters-flow-versions.test.ts`,
`tests/adapters-flow-queries.test.ts`); the workbox inbox
aggregation (`tests/workbox-inbox.test.ts`); the mermaid round-trip
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

> SUPERSEDED (2026-06) by the per-origin recipe below — see
> "Per-origin parallel run — validated operational recipe." The
> shared-one-IndexedDB model in this subsection is what caused
> the documented connection-concurrency lockups; the validated
> run gives each agent its OWN origin (distinct port), so the
> entity mutation-domain partitioning here is no longer needed.
> Kept for historical context only.

Agents execute the plan in six phases to fit within context and
time budgets while keeping per-entity mutation domains disjoint:

1. **Phase 0 — Preflight** (main): `./validate`, `./build` to
   produce the distribution ZIP, `./build --no-zip` for the test
   server, start HTTP server, open tab 0. Covers A1–A5.
2. **Phase 1 — Data setup** (one agent, serial): AA1–AA43 in
   tab 0. Creates pristine environment, members (humans + AIs),
   ideas, projects, one flow. Populates the shared database
   that Phase 2 verifies.
3. **Phase 2 — Parallel verification** (7 agents concurrent,
   each in its own tab, no shared tabs):
   - Agent-B — Entry pages (EXCLUDING Sidebar Sign-out, which
     is identity-wide — deferred per "Parallel session &
     connection isolation")
   - Agent-CH — Dashboard + Reference (read-only)
   - Agent-D — Ideas
   - Agent-E — Projects
   - Agent-F — Flows (includes hazard severity, flow-publish
     gate)
   - Agent-F2 — Workbox (includes Create-Work-Order picker
     READY / NOT READY split) + Records (section R)
   - Agent-G — Admin (Members page, Member detail (human + AI),
     Identities (list + detail + providers + tokens),
     Organization, Snapshots, Billing). The retired Teams /
     Roles / Crews / Activity Feed pages have no cases.
4. **Phase 3 — Cross-cutting** (one agent, alone): I1–I30.
   Mutates global UI state (theme, sidebar, command palette) —
   no concurrent agents.
5. **Phase 4 — Snapshot lifecycle + persistence tier** (one
   agent, alone): G30–G35 and L1–L9 (IndexedDB persistence).
   Wipes and reloads the database — strictly last before
   teardown.
6. **Phase 5 — Teardown** (main): stop HTTP server, remove
   build directory, verify distribution ZIP remains, aggregate
   results.

#### Entity mutation domain scoping

Phase 2 agents share one IndexedDB database. Post-Phase-
Final there are only three tables (`clients`, `requests`,
`responses`); every product write appends pairs only. Agents
own **disjoint pair-address families** (URI prefixes), not
entity tables — the historical table names below name the
ADDRESS family each agent mutates:

| Agent | Mutation domain (pair-address families) |
|---|---|
| Agent-B | creates one human member via signup (identity + membership + human-member addresses) |
| Agent-D | `ideas` document + idea lifecycle state pairs |
| Agent-E | `projects` document pairs (plus one flow via the project-detail New Flow path) |
| Agent-F | `flows` document + undo operation pairs (graphDelta/revivals live in the flow document body) |
| Agent-F2 | `work-orders` (claim/transition ops), work-order state pairs, field-values folded into transitions, plus its own private flow document pairs |
| Agent-G | roster + identity spine + tenancy addresses: `members` / `human-members` / `ai-members`, `memberships`, `invitations`, `role-grants`, `organizations`, `identities` (+ credentials / pii / token-revocations / default-organization). All GETs derive from the message ledger; invitation grant membership-dedup via `membershipExistsFor`; WP8 self-revoke still inside this agent |
| Agent-CH | none (read-only) |

`identity_tokens` addresses stay un-domained: grant,
rotation, and revocation append message pairs only (row
store retired Phase 13 Task 9 with `authorization_codes`).
`identity_default_organizations` stays un-domained because
its read (`identityDefaultOrganization`) is shared by the
authz fence itself.

Agent-F2 owns its source flow because `postWorkOrderCreation`
freezes `flow_graph` into the work-order document pair at
creation time. If Agent-F edits the shared flow
concurrently, the captured snapshot reflects mid-edit
state, not a clean baseline.

Because a sibling tab's commit posts a scoped notification
event (BroadcastChannel) naming the organization/identity it
touched — or a full-refresh event — and triggers a refresh,
cross-boundary assertions use `≥ N` or "displayed-count
matches the current database at read time" framing rather
than frozen expected values. Agent-CH's dashboard count
checks are non-zero + consistency, not numeric equality.

**Shared pair-plane appends are safe.** Several agents append
to `requests`/`responses` at once — Agent-D (idea lifecycle),
Agent-E (project lifecycle), Agent-G (member lifecycle), and
Agent-F2 (work-order transitions and claims). On IndexedDB an
append is an O(1) per-row `objectStore.put`, so concurrent
appends from sibling tabs both survive (CLAUDE.md § Gotchas —
"Cross-tab writes are safe"). Re-read tolerantly (`≥ N`) for
timing rather than asserting exact pair counts.

Post-Phase-Final + states-address retirement: every
states-backed surface (workbox inbox, flow-stats, dashboard,
members roster, idea/project/record/objective state badges +
history views) reads the five-source union from the message
ledger (`deriveStates` / `deriveStatesFor`). There is no
`states` table and no `/states/:id` write address. Lifecycle
writes are document-trio PUTs
(ideas/projects/records/flows/objectives/members) and named
ops (work-order create/claim/transition/release,
invitations). The ownership fence
(`resolveOwningOrganization`) makes a foreign org's
`entity_id` 404 on `GET /entity-states/:id/history`. Also
closed: WP1 and the records hard-delete forgery channel.
Write-ownership fence preserves foreign-id PUT/DELETE 404
bytes on org-scoped families.

**Retired routes — no browser cases.** These addresses have
zero product callers; a manual pass need not open them.
Automated pins cover the status bytes:
- every verb on `/states/:id` → router 404 (address deleted;
  the old 405-because-PUT-survives case is gone)
- `GET /entity-states/:id` (current) → router 404
- `PUT|DELETE /states/:id/field-values/:fvid` → router 404
  (collection `GET /states/:id/field-values` SURVIVES,
  derived single-source transition fold; live writes ride
  the transition fold only)
- `GET|POST|PUT|DELETE /flows/:id/versions[...]` → router 404
  (table DELETED at Phase Final; F66 is MOOT — see F66)

Browser residual (not a phase abort): full interactive
chrome for undo/redo visual + cross-tab remains useful
(Phase 14 lesson); wire contracts covered by the security
suite + HTTP page smoke.

#### Parallel session & connection isolation

Write-table partitioning (above) keeps *data* writes
disjoint, but three resources are shared per **origin**, not
per tab, and the mutation-domain table does not fence them.
A Phase-2 run that ignores them collapses:

- **`fusion-ai:authorization`** is one localStorage key
  per origin. Every agent that logs in as the same identity
  in the same origin overwrites the prior agent's credential
  blob (last write wins); a sibling tab's silent refresh
  then reads a stranger's tokens
  (`web-app/app/adapters/session-credentials.ts`).
- **`fusion-ai:active-organization-id`** is likewise one per-origin key, so
  concurrent org switches race the same slot.
- **Sign-out is identity-wide.** `postSessionLogout` calls
  `postIdentityLogoutEverywhere` — a coarse server-side
  revoke of EVERY token for the identity. One agent's
  sign-out revokes every other agent that shares that
  identity (`web-app/app/adapters/session-logout.ts`).
- **IndexedDB connection concurrency.** ~9 concurrent
  connections to the single `fusion-ai` database wedge it: a
  schema-mutating open (wipe / mock-data seed / snapshot
  import — all call `deleteSchema`) blocks behind the other
  open connections, and the blocked `indexedDB.open` never
  resolves until every origin tab closes.

**Primary strategy — one origin per agent (distinct ports).**
Serve the same build on one port per Phase-2 agent (8080,
8081, …); each agent drives its own port. An origin is
scheme+host+**port**, so each agent gets a private
localStorage (credentials, active-org) AND a private
`fusion-ai` database — including its own revocation ledger,
so a sign-out in one origin cannot revoke another's tokens,
and connection counts stay at 1–2 per database. Phase 1
seeds :8080 and **exports a snapshot**; each Phase-2 agent
**imports that snapshot** into its own origin before logging
in, so every agent verifies byte-identical data. The shared
HMAC signing key (a client constant) makes the imported
credentials' logins valid in every origin.

**Fallback strategy — serial for session-bound sections.**
When per-origin serving is impractical, run the
member/session-dependent sections (D, E, F2, G, the command
palette, Phase 3, Phase 4) in ONE tab serially after Phase 1,
keeping parallelism only for genuinely independent or
read-only work. Simpler, slower, equally correct.

**Hard invariants (either mode).**

1. **No concurrent sign-out.** The Sidebar Sign-out case
   (Agent-B's domain) revokes the shared identity. Move it
   out of the parallel window — run it last, alone, in its
   own origin/tab — never while a sibling shares the
   identity.
2. **One credential writer per origin at a time.** Only one
   login (or refresh) may write `fusion-ai:authorization`
   per origin; per-origin isolation makes this automatic.
3. **Schema mutations need exclusive origin access.** Any
   wipe / seed / snapshot import (`deleteSchema`) runs with
   no other tab open on that origin. Phase 4 already honors
   this by running alone; extend the rule to any in-run
   snapshot import (Agent-G's Snapshots cases).

Recovery no longer scrubs a live credential on an unscoped
401 — `recoverSession` re-installs and re-scopes instead —
which softens the clobber blast radius but does not remove
the shared-key races; the isolation rules above remain
required.

#### Per-origin parallel run — validated operational recipe

This is THE default protocol. It ran the full plan as concurrent
agents (2026-06) with per-port isolation and ZERO shared-DB
lockups — seven sections fanned out at once, none wedged.

1. **Build once, serve many.** `TMPDIR=/tmp/claude ./build
   --no-zip /tmp/claude/fusion-test/` ONCE, then one static
   server per agent, each on its own port, all serving that ONE
   dir: `python3 -m http.server <port> --directory
   /tmp/claude/fusion-test` (8080, 8081, …). Servers serve
   static files only; the API + IndexedDB run in-browser and are
   partitioned by origin — so one build feeds every port and
   isolation comes from the port, not from separate file trees
   or rebuilds. (Do NOT use `./serve` per agent — it rebuilds
   each call and runs in the foreground.)
2. **Grant host permission FIRST — hard prerequisite.** The
   Claude-in-Chrome extension gates navigation per ORIGIN. An
   unattended subagent CANNOT approve the side-panel prompt, so
   a never-visited port returns "Permission denied by user" and
   the agent blocks before it can load anything. Before
   dispatching, a human grants the extension access to
   `http://localhost` (chrome://extensions → the extension →
   Details → Site access → On all sites), or approves each
   port's prompt once. This is the single most common cause of a
   stalled parallel run.
3. **One origin per agent, tab-scoped tools only.** Each agent
   calls `tabs_context_mcp({createIfEmpty:true})`, creates ONE
   tab via `tabs_create_mcp`, and confines all work to it. Use
   only tab-scoped tools (navigate, find, javascript_tool,
   get_page_text, read_page, form_input, browser_batch, and
   `computer` with a `ref`). NEVER coordinate-based clicks or
   screenshots — those are display-global and collide across
   concurrent agents.
4. **Each agent self-seeds its origin.** snapshots → "Wipe and
   Load Mock Data" → Confirm → capture the revealed credentials
   → "I have saved it — continue". This clears any stale
   per-origin storage from prior sessions AND guarantees a known
   IndexedDB seed. There is NO auto-seed — a fresh/empty origin
   redirects to snapshots by design (an empty active IndexedDB,
   regardless of any leftover `fusion-ai:*` localStorage from an
   old LocalStorage-backend run).
5. **Sign in as the ADMIN for admin-only surfaces.** The
   reveal lists a password for EVERY login-capable person,
   including emily.rodriguez@company.com — a seeded
   `member`-role human who reads org-scoped content fine but
   403s on admin-only writes (members, identities,
   organization, snapshots; deny-by-default authz). For any
   section touching those admin surfaces, sign in as
   `demo@example.com` (Tony Stark, admin in both orgs). The
   reveal lists its password.
6. **No orphan tab on a port you intend to wipe.** A lingering
   tab holding an IndexedDB connection blocks the next wipe's
   `deleteSchema` (the connection-concurrency hazard). Give each
   wave fresh ports, or close prior tabs first. The MCP tab
   group also rotates between turns — re-fetch IDs with
   `tabs_context_mcp` rather than reusing stale ones.

#### Known MCP limitations

- **Flow designer gestures** (port drag, shift-drag to connect,
  marquee select): synthetic PointerEvents do not reliably
  drive the `flow-interactions.ts` state machines because they
  use pointer-capture semantics. Affected tests include
  AA27–AA34, F15, F19–F23. The list-row drag-reorders
  (E11 projects, D36/D37 ideas) are EXEMPT — they share
  `drag-reorder.ts`, which uses native HTML5 drag-and-drop
  on the `.drag-handle`, NOT pointer-capture, so they are
  driveable. Work around the gesture cases by
  validating end-state via pair-plane fixtures (PUT a
  flow document pair through the gate, or inspect the
  `requests`/`responses` stores for the flow's
  `uri_prefix`/`uri_id`), then reloading and verifying
  render. When the fixture succeeds and the SVG renders
  the expected end state, the case is **PASS** with the
  note `verified via pair fixture` — NOT BLOCKED.
  `BLOCKED` is reserved for cases where neither gesture
  nor fixture produces a verifiable end state.
- **`resize_window`** does not change the CSS viewport;
  responsive tests at specific widths (I10) cannot be driven.
  Inspect `layout.css` manually to verify the mobile-breakpoint
  media queries (the show/hide of the desktop sidebar/header).
- **`prefers-reduced-motion`** cannot be emulated via the MCP;
  the behavioral tier of the reduced-motion view-transition
  test (I30) cannot be driven. Verify by source instead:
  confirm the `::view-transition-*` neutralizing rule in
  `base.css` / `responsive.css` (PASS = rule present). Observe
  true suppression manually with OS reduced-motion enabled.
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
- **`javascript_tool` async/await blocked by CSP**: the app
  ships `script-src 'self'` with no `unsafe-eval`, so the
  tool's async/IIFE wrapper throws `await is not defined`.
  Read IndexedDB with a callback-built `Promise` (no `await`
  keyword) and call `db.close()` before resolving — a
  dangling read connection blocks the snapshot reset's
  `deleteSchema` (delete+reopen) and wedges the renderer
  (the documented IndexedDB connection-concurrency hazard).
- **`getBoundingClientRect` ≠ click coordinates**: a ~1.19×
  CSS-px ↔ screenshot-px scale exists on the driven tab.
  Click by the coordinates seen in a screenshot, never by
  `getBoundingClientRect` (its larger CSS-px values miss).
- **List pages populate slowly (5–14s)**: org-scoped list
  reads re-derive each entity's lifecycle from the full
  `states` log, so cards can take 5–14s to paint (Flows is
  slowest). Wait ≥14s and assert the container's
  `childCount` / `data-*-card` count — never an early
  screenshot, which shows a skeleton or blank mid-render and
  reads as a false "empty list".
- **First post-reload mouse click often only focuses**: a
  page's `init()` wires button handlers asynchronously, so a
  click landing before init merely focuses the control with
  no dialog. Use the element's `.click()` or re-click once
  init has settled.

#### Serial single-tester mode

The same TEST-PLAN.md runs serially by one human in one browser
following document order (A → AA → B → C → D → E → F → F2 → FS
→ G → H → I → K → R → L → J). The agent-scoped mutation domains and
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
| AA. Data Entry Workflow | 49 |
| B. Entry Pages | 29 |
| C. Core: Dashboard | 7 |
| D. Core: Ideas Workflow | 38 |
| E. Core: Projects | 12 |
| F. Tools | 75 |
| F2. Workbox | 26 |
| FS. Flow Statistics | 9 |
| G. Admin Pages | 44 |
| H. Reference & System | 2 |
| I. Cross-Cutting Concerns | 30 |
| J. Teardown | 3 |
| K. Objectives & Scoring | 30 |
| R. Records | 19 |
| L. IndexedDB Persistence Tier | 9 |
| **Total** | **390** |

### Combined Totals (CLI + Browser)

The per-section table above counts browser-regression cases
only. Combined with the CLI automated suite:

| Layer                  | Cases    |
|------------------------|---------:|
| CLI automated tests    |     1660 |
| Browser regression     |      390 |
| **Combined TOTAL**     | **2050** |

CLI count = most recent `./validate` (AT2) report — the main
`tests/*.test.ts` suite plus the `tests/tz/*.test.ts` timezone
suite; the number grows as tests land in either glob. Browser
count = the per-section table above. Update both numbers when
either side changes.

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
`PASS = 2050, FAIL = 0, BLOCKED ≤ k, DEFERRED ≤ j, DRIFT = 0`,
where the six status counts sum to **Combined TOTAL** (2050).
`BLOCKED ≠ FAIL` and `DRIFT ≠ FAIL` — only `FAIL` indicates a
regression.

---

## AT. Automated Test Suite

The automated layer is the gate. Any AT failure aborts the
run before A1's build. The single canonical invocation is
`./validate`, which composes all three sub-steps.

- [ ] **AT1** Run `npx tsc --noEmit -p web-app/app/tsconfig.json`. PASS: exits 0; no diagnostics emitted.
- [ ] **AT2** Run `./test` (delegates to `TZ=UTC node --test --strip-types tests/*.test.ts` for the main suite, then `TZ=Pacific/Honolulu node --test --strip-types tests/tz/*.test.ts` for the timezone suite). PASS: exits 0; the runner's final summary reports `pass N` with `fail 0` for both suites.
- [ ] **AT3** Run `./validate`. PASS: exits 0 (composes AT1+AT2 plus the 78-char awk lint over `api/`, `web-app/`, `tests/`, `shared/`, the root `.md` files, and the build scripts, then the `generate-schema-svg --check` SCHEMA.svg-drift gate). Any long-line violation prints `FILE:LINE: N chars` to stderr and fails the script.

---

## A. Build & Setup

- [ ] **A1** Run `./build` from a clean working directory. PASS: exits 0, prints no errors, creates `~/Desktop/fusion-ai-<sha>.zip`.
- [ ] **A2** Run `./build --no-zip /tmp/fusion-test/`. PASS: `/tmp/fusion-test/` contains `assets/app.js`, `assets/styles.css`, `assets/` (*.woff2 fonts), 18 page directories (`auth`, `billing`, `dashboard`, `design-system`, `flows`, `ideas`, `identities`, `identity-providers`, `identity-tokens`, `invitations`, `landing`, `members`, `not-found`, `organization`, `projects`, `records`, `snapshots`, `workbox`) with 29 HTML page files (including `flows/stats.html`, `records/detail.html`, `identities/index.html`, `identities/detail.html`, `identity-providers/index.html`, `identity-tokens/index.html`, and `invitations/index.html`), plus root `index.html`.
- [ ] **A3** Start an HTTP server from the build directory (`cd /tmp/fusion-test/ && python3 -m http.server 8080`). PASS: server starts without errors.
- [ ] **A4** Open `http://localhost:8080/` in the test browser. PASS: redirects to `snapshots/index.html` when no data exists, or `landing/index.html` (which auto-redirects to `dashboard/index.html` after ~2 seconds) when data has been loaded.
- [ ] **A5** Open DevTools Console and confirm no JavaScript errors on initial load. PASS: console is clean (warnings from browser extensions are acceptable).

---

## AA. Data Entry Workflow

This section populates a pristine environment with all data
through the UI. Each step creates data that later steps depend
on. Run these in order.

### AA1. Create Pristine Environment

- [ ] **AA1** Navigate to `snapshots/`. Click "Create Pristine Environment" and confirm the wipe dialog. PASS: any pre-existing data is wiped and the minimal bootstrap is seeded (verify via AA2/AA3), then the page surfaces a one-time "Save your demo sign-ins" panel (the seeded admin credential, shown once and never stored) gated by an "I have saved it — continue" button. The demo auto-login is retired, so creation no longer redirects straight to the dashboard — sign in with the surfaced credential to reach it.
- [ ] **AA2** Open DevTools → Application → IndexedDB → `fusion-ai`, verify an object store for every table listed in `TABLE_NAMES` (`api/db.ts` — exactly three: `clients`, `requests`, `responses`) plus the `__schema__` marker. Bootstrap data lives as message pairs in `requests`/`responses` (EXPECTED bootstrap pair count 13; demo seed 1506). Pre-Final origins may also show inert orphan stores from deleted tables — ignore those; they are unread. Verify derived state via the app (or by reading pair fixtures), not a `states` object store.
- [ ] **AA3** Verify bootstrap data exists: user "Tony Stark" (id: `current`), organization "Stark Industries" (domain `acmecorp.com`). `OrganizationEntity` has no plan field — its quota fields are `seats`, `projects_limit`, `ideas_limit`.

### AA2. Create Members

- [ ] **AA4** Navigate to Members (sidebar). Click "+ Add
  Member". PASS: dialog opens with a Kind toggle (Human /
  AI, Human selected by default), a Human form below
  showing Name, Email, Title, Department,
  Phone, Bio, and an AI form (hidden by default) with
  Name, a Model pulldown (grouped by provider, no
  default selection), Description, and a Skill Focus
  textarea — no Auth Token field or security warning.
- [ ] **AA5** With Human selected, fill all fields for
  "Sarah Chen" (Title: Project Lead, Department:
  Operations). Click Create. PASS: toast confirms
  creation; the member is written but does NOT appear in
  the membership-derived roster. NOTE (deferred
  auto-membership): Add
  Member creates an IDENTITY + member detail row but no
  membership/org binding — that binding now arrives only
  via the invitation flow (V1/V4). So a freshly Added
  human is NOT yet in the org roster derived from
  `memberships`; the Members-list grouping you see here
  is the page's own member listing, not the membership
  roster. New-identity auto-membership on creation is
  DEFERRED, so this gap is EXPECTED, not a failure.
- [ ] **AA6** Repeat for all 10 humans: Sarah Chen, Mike
  Thompson, Jessica Park, David Martinez, Emily Rodriguez
  (pending), Alex Kim, Marcus Johnson, David Kim, Lisa
  Wang, James Miller (archived). PASS: all 10 are written
  but, per the deferred note, do NOT appear in the
  membership-derived roster. NOTE
  (deferred auto-membership): as in AA5, Add Member binds
  no org membership — the org-binding now comes via
  invitation (V1/V4). Each freshly Added human is NOT yet
  in the `memberships`-derived roster until invited and
  accepted; that DEFERRED path is expected.
- [ ] **AA7** Reload the Members page. PASS: the roster
  is membership-derived, so the freshly Added humans (no
  membership) do NOT re-render — only seeded and invited+
  accepted members do. Same deferred path as AA5.
- [ ] **AA7a** Click "+ Add Member", switch the Kind
  toggle to AI. PASS: the Human form hides and the AI
  form appears. Fill Name, pick a Model, fill
  Description and Skill Focus. PASS: Create is blocked
  until a Model is chosen; once chosen, click Create →
  toast confirms and the AI is written to `ai_members`;
  like a freshly Added human it binds no membership, so it
  does NOT appear in the roster.
  Repeat for 4 AIs matching mock data (Claude Opus 4.8,
  Claude Sonnet 4.6, GPT-5.5, Grok 4.3).

### AA3. Member Detail & Organization

- [ ] **AA8** On Members, click the current user's row.
  PASS: navigates to `member-detail` for that human. Read
  mode shows avatar, name, status badge, title •
  department subtitle, Personal Information card (Name,
  Email, Phone, Title, Department, Bio),
  Working Styles card, and Strengths card.
- [ ] **AA8a** From the Members list, click any AI
  member's row. PASS: navigates to `member-detail` for
  that AI. Read mode shows the AI identity card (Name,
  Model as "{name} — {provider}", Description) and a
  Skill Focus row; there is no Auth Token row.
- [ ] **AA9** From the human member detail, click Edit,
  change Phone and Bio, toggle one strength on and one
  off, click Save. PASS: toast "Member saved" appears.
  Navigate away and return to detail. PASS: edited
  Phone, Bio, and strengths persist.
- [ ] **AA9a** From an AI member detail, click Edit,
  change Description and Skill Focus, and pick a
  different Model from the pulldown (grouped by
  provider, current model pre-selected), click Save.
  PASS: toast "AI member saved" fires; on reopen the
  edited Description, Skill Focus, and Model persist.
  There is no Auth Token field.
- [ ] **AA10** Navigate to Organization. Click the
  page-level Edit button (a single button at the page
  header, not per-card), change Domain (e.g.
  `acmecorp.io`), click Save. PASS: success toast
  "Organization saved" appears.
- [ ] **AA11** Navigate away, return to Organization.
  PASS: edited Domain persists with saved value, card is
  back in read mode.
- [ ] **AA-Obj** On the Organization page, locate the
  Objectives box. Click `+ Add objective` four times,
  creating in order: "Lower expenses", "Increase incomes",
  "Raise customer NPS", "Improve employee morale". PASS:
  all four appear in the active list in the order created.
  End-state delivered to Phase 2: 4 active objectives —
  required by Agent-E's K9–K23 scoring lifecycle, which
  has a read-dependency on the Organization Objectives
  produced here.

### AA4. Create Ideas

- [ ] **AA12** Navigate to Ideas. Click "Create Idea". Fill in title, problem, solution, and outcome for "AI-Powered Customer Segmentation". Click "Submit Idea". PASS: idea appears on ideas list.
- [ ] **AA13** Navigate to the new idea's detail page. Click "Edit". Verify title and text fields (problem, solution, outcome) are editable. Click "Save". PASS: toast confirms save, all fields persist.
- [ ] **AA14** Repeat creation and field entry for all 11 ideas matching mock data titles. PASS: ideas list shows all 11 with correct titles.

### AA5. Submit Ideas for Review

- [ ] **AA15** Navigate to idea #1 detail (status: active). Click "Submit for Review". PASS: status changes to "In Review", button disappears.
- [ ] **AA16** Submit ideas 1, 4, 7, 8, 9, 10, 11 for review (matching mock data statuses). PASS: each transitions from active to in_review.
- [ ] **AA17** Navigate to Ideas list and filter by "In Review" status badge. PASS: the 7 submitted ideas appear.

### AA7. Approve Ideas & Convert to Projects

- [ ] **AA18** On Ideas list, filter by "In Review". Click idea #1. PASS: navigates to idea detail with Send Back / Approve buttons in the header next to Edit.
- [ ] **AA19** Click "Approve". PASS: idea status changes to approved, confirmation shown.
- [ ] **AA20** Approve idea #4 as well (it was submitted for review in AA16). Leave others in their current status. PASS: statuses match mock data (2 approved, rest in_review/active).
- [ ] **AA21** Navigate to approved idea #1. Click "Convert". PASS: conversion form loads with 4 required fields (Project Name, Time (days), Cost, Success Criteria) — there is no Impact field — plus a Scores box holding one required baseline slider per active objective.
- [ ] **AA22** Fill the 4 required fields (Project Name, Time (days), Cost, Success Criteria) and drag every objective baseline slider in the Scores box. PASS: Create Project stays disabled until all required fields AND all baselines are set, then enables; clicking it navigates to project detail for the new project (the baselines commit atomically with project creation).
- [ ] **AA22a** On the Convert form before scoring, every baseline slider in the Scores box reads as pending, not zero: the slider is dimmed (~50% opacity) and its value shows an em-dash "—" in muted text (unscored is genuine absence — no score row is written — not a measured 0). PASS: dragging a slider clears only that row's pending styling (full opacity, a signed value such as "+51", a green check by the label) while untouched rows stay dimmed, and Create Project stays disabled until all four objectives are scored.
- [ ] **AA23** On project detail, click "Edit". Set fields (title, description, status, start date, end date, cost baseline) to match mock data. Save. PASS: project data persists. (Impact is no longer a directly-editable field — it is derived read-only from the objective baseline scores.)
- [ ] **AA24** Approve remaining ideas (7, 8, 9, 10) from Ideas list (filter by "In Review"), then convert all 6 approved ideas to projects. PASS: Projects list shows all 6 with correct status and progress.

### AA8. Score and Approve Projects

- [ ] **AA24a** From the Projects list, click into project #1 (the first converted project, status `submitted`). Click Edit, change Status to `under_review`, Save. PASS: toast confirms. The objectives section's baseline sliders are now editable INLINE (no Score button, no modal); because this project was converted through the UI its baselines were committed at convert time, so the Approve button is already enabled. (To exercise the unscored→score flow, use a project created WITHOUT baselines: move each baseline slider off its initial value and click Save, watching Approve enable only once every objective is scored.) Click Approve; confirm. PASS: status flips to `approved`; the action bar re-renders with `Archive` / `View history`, and the per-objective actual sliders become editable. The project is now eligible for the New Flow gate in AA25. (Without approving, projects remain at `submitted` and the New Flow button stays hidden behind the `Approve to add flows` info badge.)

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
  Toolbar shows Undo, Redo, Zoom −/+, Copy Mermaid,
  Export ZIP, and Delete (trash icon); the header above
  the canvas hosts the Locked, Auto Layout, and Auto
  Fit switches. Changes auto-save
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
  the right, then a `<fieldset>` labeled "Members"
  containing two groups — HUMANS and AIs — each
  with a labeled checkbox per member (no checkbox
  ticked yet), then a Name input, a Task Instructions
  textarea, an empty Attributes list, and outgoing
  transitions. The node gets a gold glow selection
  effect on the canvas.
  (Properties panel double-click is BLOCKED per the
  MCP pointer-capture limitation; validate end-state
  via pair fixture on the flow document address
  (`requests`/`responses`) per the protocol workaround.)
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
  panel, open the "Attributes" fieldset. Click the
  "+ Add Attribute…" dropdown. PASS: the picker
  lists available record attributes pre-defined
  in the bound Record. Select an attribute (e.g.
  "Company Name"). PASS: the attribute appears in
  the attributes list with mode (Editable /
  Read-only) and required toggles plus a remove
  control. (The add-attribute logic is covered by
  `tests/flow-operations.test.ts`
  (`performAddAttributeRef`) — this case verifies
  the picker rendering and attribute-binding UI
  only.)
- [ ] **AA34** Add more attributes to "Data
  Capture": select 2–3 attributes from the
  picker, each with a distinct mode (Editable /
  Read-only) and required toggle. PASS: all
  attributes appear in the list with correct
  mode (Editable / Read-only) and toggle state.
- [ ] **AA35** Wait for auto-save (800ms debounce).
  Navigate away and back. PASS: all nodes, edges,
  and attributes persist.

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
- [ ] **AA41** Edit human member: navigate to a human
  member's detail page, click Edit, change phone number,
  Save. Navigate away, return. PASS: changed phone
  persists.
- [ ] **AA42** Edit organization: click the page-level
  Edit button, change Domain in the overview card. Save,
  navigate away, return. PASS: changed Domain persists.

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

> Note: the demo auto-login is RETIRED. Gated pages now require a signed-in session — after seeding (Create Pristine Environment / Load Mock Data), sign in with the surfaced admin credentials before exercising gated pages. Cases below that "navigate to `dashboard`" assume a valid sign-in.

- [ ] **B4** Page loads in **Sign In** mode by default. PASS: title is "Welcome back", submit button reads "Sign in" with an SVG arrow icon (matching the Sign Up button's "Create account" affordance per B10).
- [ ] **B5** On desktop (≥1024px), left panel shows branded marketing stats (10K+ Active Users, 98% Satisfaction, 50+ Integrations). PASS: two-column layout visible.
- [ ] **B6** Submit with empty fields. PASS: "Email is required" error appears below email input; input gets error styling.
- [ ] **B7** Enter `notanemail` in email, leave password empty. PASS: "Please enter a valid email address" error on email.
- [ ] **B8** Enter `test@example.com`, password `123`. PASS: "Password must be at least 6 characters" error on password.
- [ ] **B9** Enter the seeded admin credentials (`demo@example.com` + the password revealed at seed time), click "Sign in". PASS: button shows spinner briefly, then navigates to `dashboard/index.html`. Auto-login is retired, so an unseeded credential is rejected with "Invalid email or password.".
- [ ] **B10** Click the "Sign up" button (positioned next to the static "Don't have an account?" label — the label is not itself the toggle; the adjacent button is). PASS: switches to Sign Up mode — title changes to "Get started", "Company name (optional)" field appears, submit reads "Create account" with an SVG arrow icon (not a literal "→" character).
- [ ] **B11** Fill valid email + password (≥6 chars) in Sign Up mode, click "Create account →". PASS: toast "Sign-up is coming soon — sign in with a seeded account." appears, the form flips to **Sign In** mode (title "Welcome back"), and NO navigation occurs — the demo no longer mock-establishes a session (real sign-up is SP-6; minting a bare mock with no refresh token would bounce on reload and could admit anyone to the seeded admin's data).

### Auth Validation Edge Cases

- [ ] **B12** In Sign In mode, enter valid email, valid password, then clear email and submit. PASS: email error reappears.
- [ ] **B13** Toggle between Sign In and Sign Up modes multiple times. PASS: form resets cleanly each time, no layout glitches.
- [ ] **B14** Footer shows "By continuing, you agree to our Terms of Service and Privacy Policy." PASS: text is visible.

### Auth Session & Redirect

- [ ] **B15** With no stored credential (sign out, or delete the `localStorage` key `fusion-ai:authorization`), open `dashboard/index.html` directly. PASS: bounced to `auth/index.html?return=dashboard` (the Sign In page), not the dashboard.
- [ ] **B16** From the B15 bounce, sign in with the seeded admin credentials. PASS: lands on `dashboard/index.html` — the `?return=` target, not a generic default.
- [ ] **B17** With no credential, open `flows/detail.html?flowId=<id>` directly. PASS: bounced to `auth` with the flow preserved in `?return=`; after signing in, lands back on that exact flow with `flowId` intact.
- [ ] **B18** After signing in on the dashboard, reload (Cmd-R). PASS: stays authenticated on the dashboard — no bounce to `auth` (the credential persisted across the hard-reload).
- [ ] **B19** With no credential, open each exempt page in turn — `landing/`, `auth/`, `not-found/`, `design-system/`, `snapshots/`. PASS: each renders normally with NO redirect to `auth` (public surface + bootstrap plane are gate-exempt).
- [ ] **B20** After signing in, close the tab, then reopen `dashboard/index.html` in a new tab. PASS: still authenticated — no bounce (the credential lives in `localStorage`, not tab memory).
- [ ] **B21** Silent refresh: after signing in, in DevTools replace the stored `access_token` with an expired JWT (keep the live `refresh_token`), then navigate to `members/`. PASS: the page loads with no bounce and no error card — the dead access token was refreshed transparently.
- [ ] **B22** Both tokens dead: replace BOTH `access_token` and `refresh_token` with expired JWTs, then open `dashboard/`. PASS: bounced once to `auth?return=dashboard` — no retry loop, no console error storm.

> Note: `snapshots/` is intentionally an UNAUTHENTICATED plane — its import/bootstrap routes are BEARER-exempt and can wipe the store. It stays gate-exempt by design so a wiped-DB user can reach recovery; acceptable only because the store is single-user and client-side (B19 covers it).

### Sidebar Sign-out

- [ ] **B23** On any gated page (e.g. dashboard), click "Sign out" in the sidebar. PASS: `fusion-ai:authorization` is removed from `localStorage`, a revocation row is recorded, and the page navigates to `auth`; pressing Back to the protected page bounces again to `auth`.
- [ ] **B24** Open the app in two tabs (both signed in). Click "Sign out" in tab A, then trigger a fetch in tab B (navigate within it). PASS: tab B's next request 401s against the shared revocation ledger and bounces to `auth` — eventual cross-tab convergence, no corruption.

### Zero-membership landing (org gate)

> Setup for B25–B29: these exercise the boot/login org gate that lands a ZERO-membership identity on its pending invitations (accepting one grants the first membership and unblocks every org-scoped route). The seed gives every login-capable identity a membership, so create the zero-membership state via pair fixtures (the B21 precedent): sign in as a single-org seeded member, then append a DELETE-shaped membership document pair (and clear any default-organization pairs) for that identity through the gate or by inserting matching `requests`/`responses` rows — do NOT poke a retired `memberships` table. `getOrganizations` is fenced to the derived membership ledger, so the identity now reaches no org. Their login credential is untouched.

- [ ] **B25** From the zero-membership state, sign out, then sign in again with that member's credentials. PASS: lands directly on `invitations/index.html` — NOT the `?return=` target and NOT the dashboard "Something went wrong" card; no flash of the dashboard shell (the auth-page short-circuit decides before the first navigation). Sidebar renders the member chip from token claims with NO org switcher.
- [ ] **B26** From the zero-membership state while signed in, open `dashboard/index.html` (or any org-gated page) directly and reload (Cmd-R). PASS: redirected to `invitations/index.html` by the boot org gate — no dashboard error card, no retry loop (the returning-user path, not just fresh login).
- [ ] **B27** As the zero-membership identity, land on `invitations/index.html`. PASS: the page renders and STAYS — no redirect loop (the gate's self-guard exempts the invitations page); it shows pending invitations, or the "No invitations." empty state when none exist.
- [ ] **B28** Restore the deleted membership row (or repeat with an untouched seeded member), then sign in. PASS: lands on the `?return=` target / dashboard as before — the org gate does not fire for an identity that reaches an org (B16/B18 unaffected by the new gate).
- [ ] **B29** As the zero-membership identity, open an auth-EXEMPT page (`snapshots/`, `design-system/`). PASS: renders normally with NO redirect to invitations — the org gate guards only auth-gated pages; exempt pages degrade to the unscoped sidebar (B19 unaffected).

---

## C. Core: Dashboard

- [ ] **C1** Navigate to `dashboard/`. PASS: page loads with sidebar, header, and main content area.
- [ ] **C2** Sidebar shows flat navigation
  links in this order: Dashboard,
  Organization, Ideas, Projects, Records,
  Flows, Workbox, Members, Identities, Billing,
  Snapshots, Design System. PASS: all 12 links present,
  in order, and styled. Source of truth:
  `PAGE_REGISTRY` (entries with
  `inSidebarNav: true`) in
  `web-app/app/page-registry.ts`.
  (Teams, People, Roles, Crews, Company,
  Activity Feed, and Profile sidebar entries
  have been retired — the current user's
  detail is reachable via the sidebar account/
  member chip (the old header greeting that also
  linked to it has been removed); humans and AIs
  both live on the Members page.)
- [ ] **C3** Header shows search bar, company
  stats ("Stark Industries · N Ideas ·
  M Projects · K Flows" — the counts track the
  current working data and change as you create
  or convert, so don't assert exact numbers),
  and theme toggle. PASS: elements visible and
  styled. The old "Good {morning/afternoon/
  evening}, {name}" greeting and the top-bar org
  `<select>` have both been REMOVED; the top bar
  shows neither. (The org switcher moved to the
  sidebar footer — see G36; the pending-invitations
  bell may appear at the top bar — see V3.)
- [ ] **C4** Dashboard renders 4 surfaces in order: three
  visually-equivalent arc-gauge cards (Time and Cost are
  ratio arc-gauges — a single ratio-filled semicircle; Impact
  is a bipolar arc — left/right split from a center apex; all
  three share the same card chrome) and a full-width Aggregate
  Objectives box below. PASS: all 4 render with baseline and
  current values; the Time and Cost cards each show a ratio
  arc and the Impact card shows a bipolar arc; the Objectives
  box shows one row per objective, each with a small bipolar
  arc gauge and a sparkline trendline.
- [ ] **C5** Sidebar navigation links all function correctly. PASS: clicking a sidebar link navigates to the expected page.
- [ ] **C6** Scroll the page. PASS: sidebar stays fixed, main content scrolls independently.
- [ ] **C7** Check that seed data populates all 4 dashboard
  surfaces (three arc-gauge cards + Aggregate Objectives
  box). PASS: no "No data" empty states on a fresh
  mock-data load against the Phase 1 baseline. NOTE: the
  mock seed now spans TWO orgs (Stark Industries + Wayne
  Enterprises; the demo admin belongs to both) and the
  dashboard is scoped to the ACTIVE org, so its header and
  gauges show that org's slice — not global totals. Counts
  are tolerant lower bounds, not equalities (the seed
  grows): for active-org Stark expect ~6 ideas, ~16
  projects, ~4 flows, 4 objectives, plus the roster (6
  humans — 5 single-org seeded members + Tony Stark, the
  both-org admin; the System member authors seed events but
  is excluded from the roster — and 4 AIs).
  Global raw mock totals are larger (~11 ideas, ~17
  projects, ~5 flows across both orgs).

---

## D. Core: Ideas Workflow

### Ideas List (`ideas/`)

- [ ] **D1** Navigate to `ideas/`. PASS: list shows the active org's ideas as cards (≈6 for Stark on the mock seed — the list is org-scoped, so this is a tolerant lower bound, not the global 11; note the org-scoped reads can take 5–8s to paint, so wait for the cards before asserting empty), each with a drag-handle grip, title, status badge, and (for approved ideas) a Convert button. Ideas represent the problem-and-proposed-solution shape and do not carry time/cost/impact estimates; those fields live on projects created by conversion.
- [ ] **D2** Each idea row shows a lifecycle status badge (Active, In Review, Approved, Promoted, Sent Back, or Archived); an active idea missing a required field also shows a single "Incomplete" readiness pill (warning tone) derived from required-field presence — ready ideas and non-active ideas show no pill. PASS: the status badge always renders, and the Incomplete pill appears only on active, not-ready ideas.
- [ ] **D3** Click an idea row/title. PASS: navigates to the idea's detail or scoring page with the correct `ideaId` parameter.
- [ ] **D4** "New Idea" or "Create Idea" button is visible. PASS: clicking it navigates to `ideas/create.html`.

### Idea Create Form (`ideas/create.html`)

- [ ] **D5** Page loads showing a single-page form with six conversationally-labeled fields: "Give your idea a clear title" (Title), "What problem does this solve?" (Problem Statement), "Who will benefit from this?" (Target Users), "How would you solve this?" (Proposed Solution), "What outcome do you expect?" (Expected Outcome), "How would you measure success?" (Success Metrics). The parenthetical identity is the field id; the prompt is the visible label. PASS: all six fields visible.
- [ ] **D6** "Submit Idea" button is disabled when any required field is empty. PASS: button is visually disabled and not clickable.
- [ ] **D7** Fill in all required fields (Title,
  Problem Statement, Proposed Solution,
  Expected Outcome). PASS: "Submit Idea" button becomes enabled.
- [ ] **D8** Click "Submit Idea". PASS: navigates to `ideas/index.html`.
- [ ] **D9** Click "Cancel". PASS: navigates to `ideas/` list.

### Idea Detail (`ideas/detail.html?ideaId=<id>`)

- [ ] **D10** Navigate to `ideas/detail.html?ideaId=<id>` (a real base62 id from the Ideas list). PASS: page loads with idea title, status badge, and "Submitted by [name] @ [date/time]" in the header.
- [ ] **D11** Page displays one card: Problem & Solution (Problem Statement,
  Target Users, Proposed Solution, Expected
  Outcome, Success Metrics). PASS: all fields populated. No Details or Estimates cards.
- [ ] **D12** Click "Edit" button. PASS: text fields become editable inputs/textareas, Save and Cancel buttons appear, Edit button hides.
- [ ] **D13** Modify a field (e.g. Problem Statement or Expected Outcome), click "Save". PASS: toast "Idea saved" appears, page returns to view mode with updated data.

### Idea Detail — Edit & Actions

- [ ] **D14** Click "Edit", then "Cancel". PASS: returns to view mode with original data unchanged.
- [ ] **D15** For an idea in "in_review"
  status: clicking the card navigates to
  `ideas/detail.html` with Send Back /
  Approve buttons in the header next to Edit.
- [ ] **D16** For a convertible idea: "Convert" action button is visible. PASS: clicking it navigates to `ideas/convert.html` page.
- [ ] **D17** Navigate to `ideas/detail.html?ideaId=999` (non-existent). PASS: page handles gracefully — shows error state, no unhandled JS exception.

### Idea Detail — Submit for Review

- [ ] **D18** Navigate to an idea with status "active". PASS: "Submit for Review" button is visible in the header area.
- [ ] **D19** Click "Submit for Review". PASS: toast "Submitted for review", navigates to the ideas list, and the idea's status badge there now reads "In Review".

### Idea Detail — Sent Back Re-Submit

- [ ] **D20** Navigate to an idea with status "sent_back" (after a reviewer sends it back). PASS: "Submit for Review" button is visible, allowing re-submission.
- [ ] **D21** Click "Edit", modify a field, click "Save". PASS: idea updates. Click "Submit for Review". PASS: navigates to the ideas list with the idea now "In Review".

### Idea Convert (`ideas/convert.html`)

- [ ] **D22** Navigate to `ideas/convert.html?ideaId=<id>` for a convertible idea. PASS: page loads with conversion form showing 4 required fields: Project Name, Time (days), Cost, Success Criteria (it maps to the project description). There is no Impact field. A Scores box renders one required baseline slider per active objective. Sticky sidebar shows the idea summary (Title, Problem Statement, Target Users, Proposed Solution, Expected Outcome, Success Metrics). Source of truth: `REQUIRED_FIELDS` in `web-app/app/presenters/idea-conversion.ts`.
- [ ] **D23** With required fields empty, "Create Project" is disabled and the progress bar shows 0/N where N = 4 + one per active objective (e.g. 0/8 with 4 objectives). Fill fields and drag baseline sliders one at a time. PASS: the bar increments with each required field AND each baseline, checkmarks appear next to completed items, and the button enables only when all required fields AND all baselines are set. Success Criteria is required — filling it advances the bar.
- [ ] **D24** Fill every required field and baseline (the progress bar reaches its max, e.g. 8/8), click "Create Project". PASS: navigates to project detail page for the newly created project.

### Idea Status Filtering (`ideas/index.html`)

- [ ] **D25** Navigate to `ideas/index.html`. PASS: status badges appear showing each status present in the data (e.g., Active, In Review, Approved).
- [ ] **D26** Click a status badge. PASS: list filters to show only ideas with that status, badge is highlighted, others are dimmed, count updates.
- [ ] **D27** Click the same badge again. PASS: filter clears, all ideas shown, all badges at full opacity.
- [ ] **D28** Click a different badge. PASS: filter switches to the new status.

### Idea Detail — Approval Actions

- [ ] **D29** Navigate to `ideas/detail.html?ideaId=<id>` for an in_review idea (entity ids are base62 tokens, not sequential integers — copy a real id from the Ideas list). PASS: page loads with idea details and Send Back / Approve buttons in the header next to Edit.
- [ ] **D30** Click "Approve". PASS: success toast, navigates to ideas list, idea status is now "approved".
- [ ] **D31** Click "Send Back". PASS: confirm dialog opens. Confirm. PASS: idea status changes to "sent_back", navigates to ideas list.
- [ ] **D32** Navigate to idea detail for a non-in_review idea. PASS: no Send Back / Approve buttons are shown.
- [ ] **D32a** On an in_review idea, click "Edit". PASS: the header shows only Cancel / Save — no Send Back, Approve, Submit, or Convert. Click Cancel: the read header (Send Back / Approve / Edit) returns.

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

- [ ] **E1** Navigate to `projects/`. PASS: list shows the active org's projects (≈16 for Stark on the mock seed — the list is org-scoped, so this is a tolerant lower bound, not the old fixed 6; org-scoped reads can take ~4–5s to paint, so wait for the cards before asserting empty) with title, status, and progress. Each project card shows three metrics (time, cost, impact). Em-dash ("—") substitutes for the entire metric when its **baseline (denominator) is missing**; a zero current value over a non-zero baseline renders as `0d / 213d`, `$0k / $120k`, or `0 / 85 pts` — not em-dash. Em-dash signals "no baseline to compare against," not "zero current value." When the current is missing but the baseline is present, the half-em-dash form (e.g. `— / 46 pts`) renders the absent current side only — distinct from full em-dash (both absent) and from `0d / 213d` (zero current over present baseline).
- [ ] **E2** Click a status filter badge (e.g. "Approved"). PASS: project list filters to show only projects with that status. Click the same badge again. PASS: full list returns.
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
- [ ] **E10a** On a project whose state shows action-bar buttons (`submitted` → Approve / Decline / Send back, or `approved` → Archive / View history), click "Edit". PASS: those action-bar buttons are hidden; only the State select, editable fields, and Cancel / Save remain. Click Cancel: the action-bar buttons reappear.

### Projects List — Drag-reorder

- [ ] **E11** On `projects/index.html`, press and hold on a project
  card then drag it to a new position. PASS: drop indicator appears,
  card follows the pointer, and on release the projects list
  reorders. Reload the page — new order persists.

---

## F. Tools

### Flow List (`flows/`)

- [ ] **F1** Navigate to `flows/`. PASS: page shows
  flow cards with name, project name badge, and
  state/transition counts.
- [ ] **F2** Type in the flow-list search input. PASS:
  filters flow cards by name in real-time. NOTE:
  `flows/index.html` currently renders no flow-list filter
  input — this case is vacuously satisfied (N/A) until one
  is added.
- [ ] **F3** Click a flow card. PASS: navigates
  to `flows/detail.html?flowId=<id>`.

### Flow Import

(Mermaid parse/serialize round-trip is covered by
`tests/mermaid.test.ts` and ZIP read/write by
`tests/zip-guards.test.ts` — the cases below verify the import
dialog, the file-upload affordance, and that the imported flow
opens and renders.)

- [ ] **F4** Click "Import Flow" button on the flows list page. PASS: import dialog opens with a project selector dropdown and a "Choose File" button (the file input is hidden and triggered by that button).
- [ ] **F5** Choose a project from the dropdown, click "Choose File", and select a `.mmd` file — selecting the file imports it directly (no separate confirm button). PASS: flow is created, toast confirms import, and browser navigates to the flow designer for the imported flow.
- [ ] **F6** Repeat with a `.zip` file exported from a previous flow. PASS: imported flow renders with nodes, edges, and attributes visible (round-trip fidelity is covered by `tests/mermaid.test.ts` + `tests/zip-guards.test.ts`).

### Flow Designer (`flows/detail.html?flowId=...`)

- [ ] **F7** Navigate to a flow designer page.
  PASS: page wears the standard sidebar + top-bar
  layout (formerly standalone) — left sidebar with
  the global nav, top bar with search/
  organization stats/theme toggle (no greeting —
  it has been removed), and the flow
  designer occupying the remaining content area.
  Toolbar runs vertically along the left edge of
  the canvas (inside the content area, not the
  global sidebar) with Undo/Redo, Zoom −/+,
  Copy Mermaid, Export ZIP, and Delete (trash icon)
  arranged top-to-bottom. The header above the
  canvas hosts the Back button, a Stats button, and
  three header switches (Locked, Auto Layout, Auto Fit). SVG
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
  border with attribute count subtitle, complete
  node has a red 3-px border with its name centered
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
  Members fieldset (HUMANS / AIs checkbox
  groups), then state name, a Task Instructions
  textarea, the attributes list, and outgoing
  transitions.
  (Properties panel double-click is BLOCKED per the
  MCP pointer-capture limitation; validate end-state
  via pair fixture on the flow document address per
  the protocol workaround.)
- [ ] **F12** Pan so a node sits near the right
  edge of the canvas, then double-click it. PASS:
  the properties panel slides out from the
  toolbar edge over ~200ms and the canvas
  re-centers so the node sits at the visual center
  of the canvas region not covered by the panel.
  (Properties panel double-click is BLOCKED per the
  MCP pointer-capture limitation; validate end-state
  via pair fixture on the flow document address per
  the protocol workaround.)
- [ ] **F13** While the panel is open, double-click
  a different node. PASS: panel content updates to
  the new selection and the canvas re-centers on
  it.
- [ ] **F14** Enable Auto Fit, then double-click a
  node. PASS: panel opens and the canvas re-fits to
  the panel-aware visible region (no toast, no
  blocking — Auto Fit handles the re-fit via
  `fitBoxToCanvas`'s `panelOffsetPx`). Turn Auto
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
- [ ] **F25** Double-click a node to open the
  properties panel. In the "Attributes" fieldset,
  click the "+ Add Attribute…" dropdown. PASS:
  the picker lists available record attributes.
  Select one. PASS: the attribute appears in the
  attributes list with mode (Editable / Read-only)
  and required toggles plus a remove control.
- [ ] **F26** Click an edge to select it (gold glow).
  Double-click to open properties panel. PASS:
  panel shows transition name, from/to state names.
  Edit the name. PASS: label updates on the canvas.
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
  nodes, edges, attributes, and positions persist.
- [ ] **F31** Navigate to
  `flows/detail.html?flowId=nonexistent`. PASS:
  page handles gracefully — shows error state,
  no unhandled JS exception.

### Flow Designer — Undo/Redo

(Undo is undo-as-replay (Phase 14 Task 8): the server
resolves the restore target by replaying the flow's own
document-pair history against its own undo operation-pair
history (stack+pointer — a second consecutive undo goes
FURTHER back rather than oscillating; a save after an
undo-undo truncates the abandoned branch). This cursor
algorithm, redo's in-memory stack, exhaustion as a graceful
no-op, and the 412-retry-then-fresh-resolve on a save racing
an undo are covered by `tests/flow-undo-cursor.test.ts` and
`tests/flow-operations.test.ts` (`performUndo` /
`performRedo`). `flow_versions` no longer receives any write
on this path — Phase 15 Task 7 RETIRED the versions routes
(router 404); the table remains until Phase Final. The cases
below verify the toolbar buttons, the keyboard shortcuts,
the disabled states, and that the canvas re-renders after
each step.)

- [ ] **F32** After adding a state, click the Undo
  toolbar button. PASS: the state and its
  connecting edge are removed. Redo button
  becomes enabled.
- [ ] **F33** Click the Redo toolbar button. PASS:
  the state and edge reappear.
- [ ] **F34** On a non-auto-layout flow, after moving a
  node, press Cmd+Z (Mac) or Ctrl+Z. PASS: node returns
  to its previous position, pixel-identical (see F37b for
  the auto-layout exception to this promise).
- [ ] **F35** After deleting a state, undo. PASS:
  the state and all its connected edges are
  restored.
- [ ] **F36** Undo and Redo buttons are disabled
  when their respective stacks are empty. PASS:
  buttons show disabled state initially.
- [ ] **F37** Perform an action, undo, then perform
  a new action. PASS: the redo stack is cleared
  (redo button disabled).
- [ ] **F37a** Open the same flow in two tabs. In tab A, edit
  a node name and let auto-save complete. In tab B (which
  still shows the pre-edit head), click Undo immediately.
  PASS: nothing looks wrong — no error toast, no stuck
  spinner, no console error surfaces to the user. Under the
  hood the stale-basis undo collides with tab A's save (HTTP
  412) and the client silently retries with a freshly
  resolved target against the new head — the 412-retry is
  invisible to the tester by design.
- [ ] **F37b** On a flow with Auto Layout ON, add a node
  (which auto-lays-out the graph), then Undo. PASS: the
  canvas restores to the pre-edit graph. Now make ANY new
  edit (e.g. rename a node). PASS: node positions may
  re-flow to the auto-layout orientation on this next edit —
  this is expected, not a regression (the server-resolved
  restore is canvas-less; auto-layout re-computes positions
  on its own next content change). Pixel-identical restores
  are only promised for non-auto-layout (manually-positioned)
  flows, per F34.

### Flow Designer — Keyboard Shortcuts

- [ ] **F38** Press Delete or Backspace with a node
  or edge selected (not focused in an input).
  PASS: selected item is deleted.
- [ ] **F39** Press Cmd+Z / Ctrl+Z to undo, press
  Cmd+Shift+Z / Ctrl+Shift+Z to redo. PASS:
  keyboard shortcuts match toolbar button
  behavior.

### Flow Designer — Additional Coverage

- [ ] **F40** Toggle the Locked switch in the designer header.
  PASS: connection ports disappear from all middle nodes, the
  Delete toolbar button becomes disabled, and opening a properties
  panel shows panel controls as read-only (inputs `disabled`, every
  checkbox in the Members fieldset also `disabled` and
  unresponsive to clicks). Auto Layout remains enabled because
  it only repositions nodes without changing structure. Visual
  confirmation: nodes render with gold strokes regardless of
  type (Create, Archive, Regular), edges render with gold
  strokes (cycles remain dashed), edge-label backgrounds gain
  gold strokes, and the dot-grid background renders unchanged
  from its unlocked appearance. Untoggle Locked: ports return,
  the Delete button re-enables, panel controls become editable, the
  Members checkboxes become interactive again, and per-type
  colors return (Create green, Archive red, Regular blue,
  Cycle amber).
- [ ] **F41** With a non-trivial flow loaded, click "Copy Mermaid"
  in the toolbar. PASS: toast confirms the clipboard copy, and the
  clipboard holds Mermaid flowchart syntax for the current graph.
  (Round-trip correctness — `generateMermaid` → `parseMermaid`
  preserving nodes, edges, and attribute references — is covered by
  `tests/mermaid.test.ts`; this case verifies the toolbar action
  and the clipboard write.)
- [ ] **F42** Click "Export ZIP" in the toolbar. PASS: a `.zip` file
  downloads. Unzip the archive — it contains `flow.mmd` (Mermaid
  source), `flow.json` (graph with node positions), `sidecar.json`,
  and a human-readable `flow.txt`. (ZIP read/write correctness is covered
  by `tests/zip-guards.test.ts`.)
- [ ] **F43** On `flows/index.html` click "Import Flow", select a
  `.mmd` file previously exported from a known flow, choose a
  project, and submit. PASS: the imported flow opens in the designer
  and renders nodes, edges, and attributes. (Structural fidelity of the
  mermaid round-trip is covered by `tests/mermaid.test.ts`; this
  case verifies the import dialog and that the designer opens on the
  imported flow.)
- [ ] **F44** Repeat F43 with a `.zip` archive. PASS: the imported
  flow renders with node positions preserved (not auto-laid-out).
  (ZIP round-trip is covered by `tests/zip-guards.test.ts`; this
  case verifies the `.zip` import path through the dialog and the
  preserved-position rendering.)
- [ ] **F45** Make 11 edits in the flow designer (e.g. rename 11
  nodes one at a time, waiting for each auto-save), then click
  Undo 11 times in a row. PASS: every one of the 11 edits
  reverts in order — undo history is NO LONGER capped at 10
  (Phase 14 Task 8 retired the `FLOW_VERSION_CAP` trim from the
  live path; undo now walks the flow's own full document-pair
  history). The `flow_versions` store is DELETED (Phase
  Final) — there is nothing to inspect; the flow's own
  document-pair history in `requests`/`responses` is the
  sole undo source.
- [ ] **F46** Edit a flow (rename a state), let auto-save complete.
  Navigate away from the designer to `flows/index.html`. Re-open the
  same flow. Click Undo. PASS: the rename reverts — the undo history
  survived navigation because it is the flow's own message-pair
  history, persisted to the schema, not held in memory. Unlike
  before Phase 14, this persistence has no 10-edit bound (see F45).

### Flow Designer — Flow Tags (API-only, no UI this phase)

(No manual browser case — Step 0 (Phase 14 Task 9) elected
API-ONLY: no designer affordance lands this phase. The
automated suite (`tests/api-flow-tags.test.ts`,
`tests/api-organization-isolation.test.ts`'s "nested
flows/:id/tags" fence case) is the sole coverage: PUT/GET/
DELETE lifecycle, Response-ID pinning survives further flow
saves, marked delete, member-tier authorization, two-tag
concurrency, and the org fence. Revisit this note if/when a
designer "tag current" action lands.)

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

### Members Selector (Node Panel)

- [ ] **F58** Open a regular-node properties panel. PASS:
  the Members fieldset is the first body block, with a
  "Members" legend, a HUMANS group containing one
  labeled `<input type="checkbox" data-member-id="<id>">`
  per active human (alphabetized by full name), and an
  AIs group containing one checkbox per AI member
  (alphabetized by name). When the checkbox list overflows
  the panel height, the fieldset scrolls inside its own
  region.
- [ ] **F59** Tick one human checkbox and one AI checkbox.
  Reload the page and reopen the same node panel. PASS:
  the same two checkboxes are still ticked. Inspect the
  flow's head document pair in `requests`/`responses`
  (DevTools → Application → IndexedDB → `fusion-ai`) —
  the stored graphDelta / graph body carries
  `memberIds: [<humanId>, <aiId>]` on that node.
- [ ] **F60** Untick one of the two checkboxes. Reload the
  page and reopen the panel. PASS: only the remaining
  ticked member persists in `memberIds`.
- [ ] **F61** Untick all checkboxes so `memberIds` is `[]`.
  Reload the page. PASS: every checkbox in the panel is
  unticked. The node now displays the danger badge per
  F73.
- [ ] **F62** Lock the flow via the designer-header Locked switch.
  Open a regular-node panel. PASS: every checkbox in the
  Members fieldset is rendered with the `disabled`
  attribute; clicking does nothing.
- [ ] **F63** Open a Start-node panel. PASS: the header
  shows the "Create" title and close button — no
  Members fieldset (Create nodes never assign members).
- [ ] **F64** Open an End-node panel. PASS: the header
  shows the "Archive" title and close button — no
  Members fieldset.
- [ ] **F65** Open an edge panel. PASS: the header shows
  "Transition Properties" title and close button — no
  Members fieldset.
- [ ] **F66** MOOT (Phase Final). The `flow_versions` table and
  object store are DELETED; there is nothing to inspect.
  Member assignment is captured only in the flow's own
  document-pair history (`requests`/`responses`). Confirm
  via pair fixtures or F67: a `memberIds` change is still
  undoable through that history.
- [ ] **F67** Tick one checkbox in the Members fieldset,
  then press Cmd+Z (Mac) / Ctrl+Z (Win/Linux). PASS: the
  checkbox unticks — `memberIds` changes are undoable
  like name changes.

### Attribute Editor (Node Panel)

- [ ] **F68** Double-click a regular node (not Create/Archive)
  to open the properties panel. In the "Attributes"
  fieldset, click the "+ Add Attribute…" dropdown. PASS:
  the picker lists available record attributes
  pre-defined in the bound Record (the picker is
  populated from `record_attributes`).
  (Regression for the captured-presenter bug in the
  attribute-picker handler: this exact click used to do
  nothing because the handler closed over a presenter
  captured at init time, which had no selection.)
- [ ] **F69** Continuing from F68, select an attribute
  from the picker (e.g. "Contact Email"). PASS: the row
  "Contact Email" appears in the list with mode (Editable /
  Read-only) and required toggles. The dropdown
  remains available so additional attributes can be
  added.
- [ ] **F70** Continuing from F69, click the remove ("×")
  control on the "Contact Email" attribute row. PASS: the row
  disappears from the attributes list.
- [ ] **F71** Lock the flow via the designer-header Locked switch.
  Double-click a regular node. Click the disabled
  "+ Add Attribute…" dropdown in the Attributes
  fieldset. PASS: nothing happens — no panel change,
  no toast, no attribute row appended (a disabled
  `<select>` does not fire `change`).
- [ ] **F72** Double-click a regular node. Tick one
  member checkbox in the Members fieldset. Click the
  "+ Add Attribute…" dropdown in the same panel. PASS:
  the dropdown remains functional and lists available
  attributes. (Regression: a `memberIds` commit
  replaces the presenter, so a click handler that
  captured a stale presenter would have acted on the
  pre-commit snapshot — this case proves the handler
  reads the current presenter at click time.)
- [ ] **F73 — Hazard severity rendering.** On a regular
  (non-start, non-complete) node, vary the member count
  and outgoing-edge count and confirm the bottom-left
  badge:
    - **0 members** → red no-entry sign (`iconNoEntry`,
      `.flow-node-danger`). Hover → tooltip
      "Members required".
    - **0 outgoing edges** (regardless of member count) →
      red no-entry sign, tooltip "Dead end (no outgoing edges)"
      when `memberIds.length > 0`.
    - **1 member AND ≥1 outgoing edge** → yellow triangle
      (`iconAlertTriangle`, `.flow-node-warning`). Hover →
      tooltip "Single member assigned (no backup)".
    - **≥2 members AND ≥1 outgoing edge** → no badge.
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
- [ ] **F75** Open a flow whose layout routes edges beyond the node bounding box — the seeded "Layout Test: Proposal Review Cycle" is one (its long back-edges arc above the top row and dip well below the bottom row) — with Auto Fit on. PASS: the whole graph, including the edge curves and waypoints that bow past the outermost nodes, sits inside the canvas with margin; nothing clips at any edge (the prior bug sliced the bottom routing). Then toggle Auto Fit off then on, add then delete an edge, and undo. PASS: every re-fit re-frames the full *drawn* content (curves included), never just the node rectangles — the camera measures the rendered SVG (`.flow-content` `getBBox`), not node positions.

---

## F2. Workbox

### AA13. Workbox Source Flow

- [ ] **AA-WB-SETUP** Create one Workbox-only flow named `WB Test Flow` with three nodes: Create → Capture (text + select attributes) → Archive (`isArchive: true`). This flow is mutated only by Agent-F2. Agent-F2's WO creation reads from this flow, not from any Agent-F flow.

### Workbox Inbox (`workbox/`)

- [ ] **WB1** Navigate to `workbox/`. PASS:
  page shows "Workbox" title, subtitle "Your
  work order inbox", Active/Archive tabs, and
  a "+ Create Work Order" button.
- [ ] **WB2** With no work orders, the Active
  tab shows an empty state with mail icon and
  "No Active Work Orders Yet" message. The mock
  seed has active work orders, so verify against
  an org with none, or by component source.
- [ ] **WB3** Click the Archive tab. PASS: tab
  switches to show archive list (empty state
  initially).

### Workbox — Create Work Order

- [ ] **WB4** Click "+ Create Work Order". PASS:
  a dropdown opens with up to two labeled
  sections — `READY` (clickable rows, one per
  publishable flow including `WB Test Flow`) and
  `NOT READY` (disabled rows for any flow with
  zero-member or dead-end nodes; each carries a
  red no-entry icon and a subtitle "1 node needs
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
- [ ] **WB5b — Server-side gate.** The server-side
  gate is covered by
  `tests/adapters-flow-publish.test.ts`
  (`validateFlowForCreation` + `getFlowsForCreation`).
  No manual browser verification needed; this case
  PASSES by virtue of the automated coverage — the
  production IIFE bundle does not expose
  `postWorkOrderCreation` on the console, so a
  DevTools-driven verification is not available
  against the deployed build.

### Workbox — Action Screen (`workbox/detail.html`)

- [ ] **WB6** The action screen shows: back button
  (icon-only), flow name, display ID, current
  state badge, and dynamically rendered attributes
  matching the current node's attribute references
  from the flow graph.
- [ ] **WB7** Attribute types render correctly: text
  inputs, selects, number inputs, date inputs,
  checkboxes, and radio buttons as appropriate for each
  attribute type in the flow definition.
- [ ] **WB8** Transition buttons appear below
  the attributes, one per outgoing edge from the
  current node, labeled with the edge name.
- [ ] **WB9** A "Release Work Order" button is
  visible,
  separate from transition buttons.
- [ ] **WB10** A collapsible History section
  shows all transitions with from/to state
  names, user name, and relative timestamp.

### Workbox — Transitions

- [ ] **WB11** Fill in required attributes and click
  a transition button. PASS: transition is
  recorded, work order moves to the next state,
  browser navigates back to the inbox. The work
  order appears in the Active tab (unclaimed).
- [ ] **WB12** Click the work order row in the
  Active tab. PASS: work order is claimed and
  browser navigates to the action screen
  showing the new state's attributes.
- [ ] **WB13** Click "Release Work Order". PASS:
  a single click posts `POST
  work-orders/:id/release` (204), soft-releases
  the active claim, and the browser navigates to
  the inbox, where the work order reappears in the
  Active tab.
- [ ] **WB13a — Claim → unclaim → reclaim.** From
  the Active tab, click the same work order again
  (claim). PASS: action screen opens under the
  caller's claim. Click "Release Work Order"
  (unclaim via the release op). PASS: back on the
  Active tab unclaimed. Click the row a third time
  (reclaim). PASS: claim succeeds again; the pair
  plane carries the sequence
  `claimed` → `claim_released` → `claimed` under
  the `(at, id)` order for this work order's
  `entity_id` (inspect via
  `GET /entity-states/:id/history` or the matching
  op pairs). No `/states/:id` write is involved.

### Workbox — Completion

- [ ] **WB14** Transition a work order to the
  completion (Archive) node (its `isArchive` is
  true). PASS:
  work order moves to the Archive tab. It no
  longer appears in Active.
- [ ] **WB15** Click a completed work order in
  the Archive tab. PASS: action screen shows
  read-only view with history but no attributes
  or transition buttons.

### Workbox — Data Integrity

- [ ] **WB16** After creating and transitioning
  a work order, inspect `requests`/`responses` (or
  derived `GET /entity-states/:id/history` and
  `GET /states/:id/field-values`). PASS: the work-
  order document pair head carries `display_id` and
  `flow_graph` JSON; each transition is a
  `work-orders/:id/transition` operation pair whose
  body names the target node (base62) and folds
  per-field values into `fieldValues: [{id,
  fields}]` — no `states` or `state_field_values`
  tables, and no leaf pairs. Derived history shows
  one non-claim event per transition with
  `entity_id` = work-order id, `state` = target
  node id, `member_id` = the actor, `at` =
  RFC-3339 Zulu; field-values derive from the
  transition fold only
  (`stateFieldValuesForStateEvent`).
- [ ] **WB17** Navigate away from the action
  screen and return. PASS: all data persists
  correctly across page navigation.

### Workbox — Concurrency & Integrity

- [ ] **WB18** Open the same unclaimed work order in two browser
  tabs. In tab 1, click the row to claim it. In tab 2, attempt the
  same. PASS: tab 2 either navigates to a read-only/already-claimed
  view or the claim is rejected — and the pair plane carries at
  most one live `'claimed'` event for this work order's
  `entity_id` under the `(at, id)` reduction (a stale prior claim
  is superseded by a `'claim_expired'` event, never overwritten
  in place). Inspect via `requests`/`responses` or derived
  `GET /entity-states/:id/history`.
- [ ] **WB19** After transitioning a work order through at
  least two states, read the derived history
  (`GET /entity-states/:id/history` or the matching pairs in
  `requests`/`responses`) for this work order's id. PASS: each
  non-claim event has the immutable shape `{id, entity_id,
  state, member_id, at}`, with `state` carrying the target
  node's base62 id — field values derive from the
  transition-fold only (`stateFieldValuesForStateEvent`),
  referencing the parent event by `state_event_id`. Verify no
  app code path mutates an existing pair — the message plane is
  append-only.

### Workbox — All-See-All Visibility

Every authenticated user sees every active and archived
work order regardless of node assignment. There is no
per-user visibility filter.

- [ ] **WB20** As the demo user, navigate to `workbox/`.
  Active tab. PASS: every active (non-completed,
  non-claimed-by-other) work order is listed regardless
  of its current node's `memberIds` — including nodes
  assigned only to AI members and nodes with zero
  members (which carry the danger badge in the designer
  but are still visible in the inbox).
- [ ] **WB21** Switch to the Archive tab. PASS: every
  completed work order is listed regardless of which
  member(s) the final transition referenced.
- [ ] **WB22** Inspect `web-app/app/presenters/workbox-
  inbox.ts`. PASS: `buildInboxItems` takes
  `(workOrders, transitions, claims, memberMap, mode)`
  with no scope parameter. The presenter exports nothing
  related to per-user visibility — the workbox shows all
  work orders to all users by construction.

---

## FS. Flow Statistics (Agent-F2 read-only domain)

**Mock-data blast radius:** the flow-statistics work added ~38
work orders to "Customer Onboarding" and ~6 to a second flow,
plus their flow-work-order join rows and transition chains.
Workbox cases (WB1–WB22) and dashboard counts re-baseline
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
  canvas.** The stats renderer reads `n.memberHazard`
  emitted by `flow-stats-aggregate.ts`. Confirm:
    - **Zero members** → red no-entry sign (`iconNoEntry`,
      `.flow-stats-node-danger`); tooltip "Members
      required".
    - **Zero outgoing edges** (non-Archive node) → red no-entry sign;
      tooltip "Dead end (no outgoing edges)".
    - **One member AND ≥1 outgoing edge** → yellow triangle
      (`iconAlertTriangle`, `.flow-stats-node-warning`);
      tooltip "Single member assigned (no backup)".
    - **≥2 members AND ≥1 outgoing edge** → no badge.
  Create and Archive never display a badge. The
  card subtitle shows the assigned members' names joined
  by ", " (or "Unassigned" if `memberIds` is empty).
- [ ] **FS7** Path stepper: `Path 1 of M · X% of N work
  orders` with prev/next controls. Clicking next advances;
  the selected path's nodes + edges get an accent stroke and
  off-path elements dim to ~30% opacity. The highlight does
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
> Member administration (humans + AI members) now lives on
> the unified Members page — see G11 onward. Cases G1–G8,
> G15–G18, G27–G29 and the former K/L sections (Roles,
> Crews) are no longer part of the plan.

### Organization (`organization/index.html`)

- [ ] **G9** Navigate to `organization/index.html`. PASS:
  page wears the standard sidebar + top-bar layout. Shows
  the page header "Organization" with an Edit button, then
  an Overview card holding the org identity (read-only
  Organization Name and Domain) above a four-cell stat grid
  (Active People, Projects, Ideas, Next Billing — no health
  badge), then the Objectives box, then the Usage Overview
  card with progress bars. There is no separate General
  Information card — the read-only Name/Domain live in the
  Overview card and Edit lives in the page header — and no
  longer a Security & Administration card; Members and
  Billing are reached from the sidebar. (Overview/usage
  values are placeholders — verify the page renders
  without error; numeric accuracy arrives when wired to
  live tables.)
- [ ] **G10** In the page header, click Edit.
  PASS: page header swaps Edit for Save/Cancel; the
  Overview card's identity region switches the read-only
  Name/Domain to two inputs prefilled with the current
  Organization Name and Domain.
  (There is no health score — the retired 92/"excellent"
  badge has been removed.)
- [ ] **V8 — Organization "Sent invitations" section + Revoke
  (admin)** As an org admin with ≥1 outstanding invitation
  granted (V1), on `organization/index.html` confirm a "Sent
  invitations" section (`#sent-invitations-box`, h2 "Sent
  invitations") appears below the cards, listing one row per
  PENDING org invitation (`#sent-invitations-list`) — each row
  shows the invitee EMAIL, an "Invited {date}" sub-line, a
  state badge, and a Revoke button. PASS: the section is
  VISIBLE only when the admin read succeeds (it boots hidden
  and reveals on success). Click Revoke on a row. PASS: an
  "Invitation revoked" toast fires and the row leaves the
  pending list (a 'revoked' event supersedes the pending; the
  invitation row persists as audit, and the invitee's pending
  list — V3/V4 — no longer shows it). With no outstanding
  invitations, the list shows "No outstanding invitations."
  Revoke is idempotent (re-revoke → 204). Source:
  `web-app/organization/index.ts` (`renderSentInvitations` /
  `onSentInvitationClick`), `SentInvitationsPresenter`,
  `revokeInvitation`.
- [ ] **V9 — Sent-invitations section is admin-only** Sign in
  as a NON-admin member and open `organization/index.html`.
  PASS: the admin Sent-invitations read fails (403 "forbidden:
  listing sent invitations requires an admin role") and the
  section stays HIDDEN — the read rejects before the reveal
  line, so the box never un-hides, and no Revoke affordance is
  offered to a non-admin. (Pairs with V7's grant/revoke 403s.)
  Source: `sentInvitations` admin guard in
  `api/invitations-domain.ts`.

### Members list (`members/index.html`)

- [ ] **G11** Navigate to `members/index.html` (reachable
  via the "Members" sidebar entry). PASS: page header reads
  "Members" with a static subtitle "Manage humans and AIs
  in your organization" (no count display — header text is
  static, populated counts live in the sidebar header and
  the table grouping). A `+ Add Member` button
  on the right opens the kind-picker dialog. Below the
  header sit a search input and three filter chips (All /
  Humans / AIs, with All pressed by default). The list
  table groups members under HUMANS first then AIs, each
  group showing avatar/name, title (humans) or the
  model name (AIs), department (humans only), and a
  status badge (humans only).
- [ ] **G12** Click the sidebar member chip (lower-left:
  name/avatar in the sidebar footer). PASS: navigates to
  the current human member's `member-detail` page
  (`?memberId=<id>`). (The old header greeting that also
  linked to the profile has been removed — the sidebar
  member chip is now the only "click → profile"
  affordance. Source: `web-app/app/sidebar-member.ts`.)
- [ ] **G13** Type in the search input. PASS: filters the
  list by name (and description) in real-time; AI
  members no longer match on provider/model (accepted
  regression). Click the Humans filter chip. PASS: only the
  HUMANS group is visible. Click AIs. PASS: only the AIs
  group is visible. Click All. PASS: both groups return.
- [ ] **G14** Click `+ Add Member`. PASS: dialog opens with
  the Kind toggle defaulting to Human, the Human form
  visible, and the AI form hidden. Switch the toggle to
  AI. PASS: the Human form hides, the AI form appears
  with a Model pulldown and a Skill Focus textarea; no
  Auth Token field or security warning. NOTE (deferred
  auto-membership): Add Member creates an identity (and
  member detail row) but NO org membership — the org-
  binding now comes via the "Invite member" flow (V1) and
  the invitee accepting (V4). A freshly Added member is
  therefore not yet in the membership-derived org roster;
  that DEFERRED path is expected, not a regression.
  "Invite member" (V1) is the separate button that grants
  the binding.
- [ ] **G14a** With Kind=AI selected, leave the Model
  pulldown on its placeholder and click Create. PASS: a
  toast "Model is required" fires and no POST happens.
  Pick a Model, fill the other AI fields, click Create.
  PASS: toast confirms and the AI is written to `ai_members`;
  it does NOT appear in the roster, as auto-membership is
  deferred (same as G14).

### Membership invitations (V) — Members "Invite member"

> The invitation flow is the org-binding path that "Add
> Member" no longer performs (see the deferred-auto-membership
> note on AA5/AA6/G14). An admin invites an EXISTING identity
> by email → a pending invitation; the invitee reads it on
> `invitations/` (reached via the top-bar bell) and Accepts
> (writes a real membership in the invitation's org) or
> Declines; an admin can Revoke an outstanding one from the
> Organization page. DEFERRED (not built): new-identity auto-
> membership on creation, and email delivery. Sources:
> `web-app/members/index.ts` (`handleInviteSubmit`),
> `web-app/app/adapters/invitations.ts`,
> `api/invitations-domain.ts` (`grantInvitation` /
> `acceptInvitation` / `declineInvitation`
> / `revokeInvitation`), `web-app/invitations/`,
> `web-app/app/invitations-indicator.ts`.

- [ ] **V1 — Invite by email grants a pending invitation** On
  `members/index.html` as an org admin (Tony Stark on Stark
  Industries after G33), click `+ Invite member` (`#invite-
  member-btn`, mail icon). PASS: the `invite-member` dialog
  opens with a single Email input (`#invite-email`), helper
  text "Invite an existing person to this organization", a
  Cancel and a "Send invitation" submit (`#invite-member-
  submit`). Enter the email of an EXISTING identity who is NOT
  yet a Stark member (e.g. a Wayne-only seeded human's email).
  Click "Send invitation". PASS: an "Invitation sent" toast
  fires, the dialog closes, and the email field is cleared.
  The grant is idempotent — sending the same email again while
  still pending returns the same pending invitation (no
  duplicate, no error). Source: `handleInviteSubmit`,
  `postInvitationGrant`, `grantInvitation`.
- [ ] **V2 — Invite rejects empty / unknown / already-member**
  Open the Invite dialog. Submit with the Email blank → an
  "Email is required" toast and no POST. Submit an email that
  matches NO identity → an inline email-field error "No
  identity found for that email." (the adapter maps the 404 to
  a 'no-identity' outcome — no toast). Submit the email of
  someone ALREADY a member of the active org → an inline
  email-field error "Already a member of this organization."
  (the 409 maps to an 'already-member' outcome). The "Failed
  to invite: …" toast fires only on an unexpected server fault.
  In all three the dialog stays usable and no pending
  invitation is created. Source: `setInviteEmailError` in
  `web-app/members/index.ts`; `grantInvitation` guards in
  `api/invitations-domain.ts`.
- [ ] **V3 — Top-bar pending-invitations bell → invitations
  page** As an identity with ≥1 pending invitation (the V1
  invitee, signed in), confirm the top bar shows a bell
  (`#invitations-bell`) with a count badge (`#invitations-
  badge`) equal to the number of pending invitations. PASS:
  the bell is VISIBLE only when pending ≥ 1 — an identity with
  zero pending invitations shows NO bell (the host carries
  `hidden`; it is never an empty bell). Click the bell. PASS:
  navigates to `invitations/index.html`. The read is identity-
  scoped (the invitation facade fences by the verified caller),
  so the bell works even for a member with no admin role.
  Source: `web-app/app/invitations-indicator.ts`
  (`mutateInvitationsBell`), `component-top-bar.html`.
- [ ] **V4 — Accept writes a membership; invitee becomes
  multi-org** On `invitations/index.html` (page header
  "Invitations", subtitle "Organizations inviting you to
  join"), confirm `#invitations-list` shows one card per
  PENDING invitation — org name, an "Invited by {name} ·
  {date}" sub-line, a state badge, and Accept / Decline
  buttons. Click Accept on the V1 invitation. PASS: an
  "Invitation accepted" toast fires and the row leaves the
  pending list. A REAL membership is now written in the
  INVITATION's org (Stark), so the invitee becomes multi-org:
  reload any sidebar-layout page and the sidebar footer now
  shows the org `<select>` (G36) listing both their original
  org and Stark. Accept is idempotent — a re-accept is a 204
  no-op, no duplicate membership. Source:
  `postInvitationAcceptance`, `acceptInvitation` (atomic
  `memberships.put` + `states.postEvent` 'accepted' event).
- [ ] **V5 — Decline appends declined, writes no membership**
  As an invitee with a fresh pending invitation, on
  `invitations/` click Decline. PASS: an "Invitation declined"
  toast fires, the row leaves the pending list, and NO
  membership is written (the declined org does NOT appear in
  the sidebar switcher and its rows stay unreachable). With no
  pending invitations remaining, the list shows the empty
  state "No invitations." and the top-bar bell disappears
  (V3). Decline is idempotent (re-decline → 204). Source:
  `postInvitationDecline`, `declineInvitation`.
- [ ] **V6 — Org fence: a pending invite is invisible until
  accepted** While the V1 invitation is still PENDING (before
  V4), confirm the org fence holds: the invitee is NOT in the
  inviting org's Members roster (the roster derives from
  `memberships`, and no membership exists yet), and the
  inviting org is NOT reachable by the invitee — it does not
  appear in their sidebar org `<select>` and boot will not
  scope a token to it (a pending invitation grants no
  membership). Only after Accept (V4) does the membership
  appear and the org become reachable. PASS: pending ⇒ not in
  roster, not reachable; accepted ⇒ both. Source: the org
  fence (`db-org-scoped`/`store-org-scoped`), `acceptInvitation`.
- [ ] **V7 — Authz: non-admin grant/revoke rejected; invitee
  may still read & accept** Sign in as a NON-admin member of
  an org (a seeded human with no admin role). PASS: any
  attempt to grant — POST `invitations` (the path behind the
  Invite dialog) — is rejected with "forbidden: granting an
  invitation requires an admin role" (403), and the
  Organization page's Sent-invitations admin read fails and
  the section stays hidden (V8), so no Revoke is offered; a
  forced revoke POST is rejected with "forbidden: revoking an
  invitation requires an admin role" (403). YET the SAME role-
  less identity, when it is the INVITEE, CAN read its own
  invitations (the bell + `invitations/` work — the read is
  identity-scoped, not admin-gated) and CAN Accept/Decline its
  own invitation (V4/V5). PASS: grant/revoke require admin;
  read/accept/decline require only being the invitee. Source:
  the explicit guards in `grantInvitation` / `revokeInvitation`
  vs. the un-admin-gated invitee read/accept/decline paths.

### Member detail — Human (`members/detail.html?memberId=<hw_*>`)

- [ ] **G19** From `members/index.html`, click any human
  member's row. PASS: navigates to `member-detail`. Read
  mode shows avatar (initials), name + status badge,
  title • department subtitle, Personal Information card
  (Name, Email, Phone, Title, Department,
  Bio), Working Styles card (4-axis dimensions surfaced
  under presentation labels Mover / Shaker / Prover /
  Maker, backed by data keys `driver` / `analytical` /
  `expressive` / `amiable`), and Strengths card.
- [ ] **G20** Click Edit. PASS: header swaps Edit for
  Cancel/Save; Personal Information card switches to
  inputs (Name text, Email email-input, Phone
  text, Title text, Department select, State select with
  HTML id `member-state` per the `MEMBER_STATES`
  alphabet, Bio textarea); Strengths card switches to a
  tag picker. Working Styles card stays read-only.
- [ ] **G21** Edit Phone and Bio, toggle one strength on
  and one off, change State from Active to Pending,
  click Save. PASS: toast "Member saved" appears. Navigate
  away (e.g. to Dashboard) and return. PASS: all edits
  persist; the row on `members/index.html` reflects the new
  state badge.
- [ ] **G22** Click Edit, change a field, press `Escape`.
  PASS: edits discarded, view returns to read mode.
- [ ] **G23** Click Edit, change a text field, press
  `Enter` while focused on the input. PASS: save fires
  (toast "Member saved").
- [ ] **G23a** From `member-detail`, click the back button.
  PASS: returns to `members/index.html`.

### Member detail — AI (`members/detail.html?memberId=<ai_*>`)

- [ ] **G24** From `members/index.html`, click any AI
  member's row. PASS: navigates to `member-detail`. Read
  mode shows the AI Member card (Name, Model as
  "{name} — {provider}", Description, Skill Focus);
  there is no Auth Token section.
- [ ] **G24a** Click Edit. PASS: identity fields become
  inputs (Name text, Model pulldown grouped by provider
  with the current model pre-selected, Description
  textarea, Skill Focus textarea); there is no Auth Token
  field. Change Description and Skill Focus, click Save.
  PASS: toast "AI member saved"; on reopen the edits
  persist.
- [ ] **G24b** Click Edit again, pick a different Model
  from the pulldown, click Save. PASS: toast "AI member
  saved"; on reopen the read view shows the new model as
  "{name} — {provider}".

### Identities (list & detail) (`identities/`, `identities/detail.html`)

- [ ] **G43** Navigate to `identities/index.html` (or click "Identities" in the sidebar). PASS: the header reads "Identities" with an "Add Identity" button (`#add-identity-btn`); `#identity-list` renders one `.card[data-identity-id]` per identity — a person row shows an initials avatar + name + email sub-line + a "Person" badge; a service row shows a shield avatar plus either the AI member's name + description (a named service) or "Service account" + "—" (an unnamed/bare-credential service), then a "Service" badge. With mock data seeded and the demo admin's active organization (Stark), the identity-pii fence (viaMembership, need-to-know) hides the five org-2-only persons: the list renders 6 named person rows (Emily Rodriguez, Sarah Chen, Lisa Wang, Marcus Johnson, Tony Stark, Jessica Park), 5 "Identity without PII" person rows (the org-2-only members: David Martinez, Alex Kim, Mike Thompson, David Kim, James), and 5 service rows, including the system service identity. An empty roster renders "No identities yet." Source: `web-app/identities/index.ts`, `web-app/app/presenters/identity-list.ts` (`IdentityRosterPresenter`).
- [ ] **G44** Click "Add Identity". PASS: the `add-identity` dialog opens with a Kind toggle (Person checked by default / Service). With Person selected, the person form (`#add-identity-person-form`) shows Name/Email/Phone/Bio inputs; fill Name + Email, click "Create" (`#add-identity-submit`) → two sequential requests (POST `identities` `{id, kind}`, then PUT `identities/:id/pii` carrying the PII fields), an "Identity added" toast, the dialog closes, and the new person appears in the roster (name + email); a second-hop failure toasts a partial-state message naming the PII-less identity rather than a blanket create failure. Re-open the dialog and click the "Service" radio → the person form hides and the service form (`#svc-secret`, "Client Secret") shows; enter a secret, Create → a "Service identity added" toast, the dialog closes, and a new "Service"-badged row appears. Submitting Person with an empty Name or Email shows "Name and email are required" and keeps the dialog open. Source: `web-app/identities/index.ts` (`handleAddIdentitySubmit` / `submitPersonForm` / `submitServiceForm`).
- [ ] **G45** From the roster, click a person row (`.card[data-identity-id]`). PASS: navigates to `identities/detail.html?identityId=<id>`, which renders the back button (`#identity-back-btn`), the name + a kind badge + the id, a "Personal Information" card (Name/Email/Phone/Bio — each empty field rendered as "—" via `DISPLAY_ABSENT`), a "Connections" card (Identity Providers / Tokens buttons), and — for a person — an "Erase PII" button (`#identity-erase-btn`). A service identity instead shows a "Credentials" card and NO erase button (only persons carry erasable PII). Source: `web-app/identities/index.ts` (`onListClick`), `web-app/identities/detail.ts`, `web-app/app/presenters/identity-detail.ts`.
- [ ] **G46** On a person's detail page, click "Erase PII" (`#identity-erase-btn`) to open the native `<dialog id="confirm-erase-dialog">` (`role="alertdialog"`, title "Erase personal information?", body "The identity itself survives; only its personal information is erased."); confirm via the `data-action="confirm-erase"` button. PASS: `deleteIdentityPii` runs, a "Personal information erased" toast appears, and the view re-renders in place — the name becomes "Identity without PII" (`IDENTITY_WITHOUT_PII_NAME`) and Email/Phone/Bio all read "—" (`DISPLAY_ABSENT`); the identity row still exists in the roster (erasure splices `identity_pii` only, leaving the identity and every `member_id` reference intact). The erasure is ledger-deep: the erased name/email/phone/bio values now appear in zero stored `requests`/`responses` messages and zero `identity_pii` rows — `/pii` is the message plane's single-slot hard-delete zone, where supersession and erasure alike physically remove prior pairs, and the surviving pair at the address is the bodyless DELETE tombstone. Named residuals outside this guarantee: pre-phase pairs in existing databases, exported snapshots, the localStorage session-credentials JWT's name claim, and replay resurrection of a retained pre-erasure PUT. Cancel/Escape (`data-dialog-cancel="confirm-erase"`) leaves the PII unchanged. Source: `web-app/identities/detail.ts` (`performErase` → `deleteIdentityPii`). MCP note: drive the native `<dialog>` directly — no `window.confirm` stub needed.

### Identity tokens & providers (`identity-tokens/`, `identity-providers/`)

- [ ] **G25** Navigate to `identity-tokens/index.html?identityId=current` (or open an identity from `identities/` and click its "Tokens" link). PASS: the "Tokens — Refresh-token chains for this identity" page renders one card per chain, each showing the chain id, the event jti, `parent: —` for a root event (or the parent jti for a rotated one), an `issued`/`rotated`/`revoked` badge, and a LOCAL-time stamp; an identity with no tokens shows "No tokens." The presenter consumes the adapter's camelCase `TokenEvent` domain shape (`jti`, `parentJti`, `action`, `at`) — a snake_case storage leak would render `parent: undefined` instead of `parent: —`. Source: `web-app/app/adapters/identity-tokens.ts` (`TokenEvent`), `web-app/app/presenters/identity-tokens.ts`.
- [ ] **G26** Navigate to `identity-providers/index.html?identityId=current` (or the identity's "Providers" link). PASS: the "Identity Providers — External sign-in links for this identity" page renders one card per link/unlink event (provider name + the `providerSubject` + a `linked`/`unlinked` badge + local-time stamp), or "No linked providers." for an identity with none (the seeded `current` logs in by password, so its providers list is empty). The presenter consumes the adapter's camelCase `ProviderEvent` shape (`provider`, `providerSubject`, `action`, `at`). Source: `web-app/app/adapters/identity-providers.ts` (`ProviderEvent`), `web-app/app/presenters/identity-providers.ts`.

### Snapshots (`snapshots/`) — Phase 4 (Run These Last)

**Phase 4 — Snapshot lifecycle & objective wipe.** Cases
G30–G35 (snapshot lifecycle) and K8 (DevTools IndexedDB
wipe → Organization empty-state check → mock-data restore)
all destroy and restore the shared database. They MUST run
alone in tab 0 after Phase 3 completes — never concurrent
with Phase 2.

(Snapshot serialization, per-row import-validation, the quota
pre-flight, the localStorage tier's column compression, and
atomic import are covered by `tests/snapshot-import-validation.test.ts`,
`tests/snapshot-quota.test.ts`, `tests/snapshot-wipe-on-fail.test.ts`
(now atomic-rollback, not wipe-on-fail), and
`tests/db-localstorage-compression.test.ts`. The cases below
verify the four operation cards, the file-picker affordance, the
post-operation redirect, and that pages render against the
restored data.)

- [ ] **G30** Navigate to `snapshots/`. PASS: shows 4 operation cards (Download Snapshot, Upload Snapshot, Wipe and Load Mock Data, Create Pristine Environment). The Upload Snapshot card renders a `<button id="upload-btn">` and a separate hidden `<input type="file" id="upload-input" class="hidden">`; the button forwards its click to the input in JS (`importInput.click()`).
- [ ] **G31** Click "Download Snapshot". PASS: browser downloads `fusion-ai-snapshot-YYYY-MM-DD.json`. File contains valid JSON with entity data.
- [ ] **G32** Click "Create Pristine Environment", confirm
  the dialog. PASS: the page does NOT navigate immediately — it
  first renders the one-time demo-credentials reveal panel (a
  `.credential-reveal` warning panel titled "Save your demo
  sign-ins", listing the seeded sign-in(s) — for the empty
  bootstrap only Tony Stark / `current` — in a monospace
  `.credential-reveal-box`, with a "Copy all" button and an "I
  have saved it — continue" button). Clicking "Copy all" copies
  the credentials and toasts "Credentials copied". Click "I have
  saved it — continue" → redirects to `dashboard/index.html`.
  Dashboard renders with zeroed-out metrics (empty
  database except for the required bootstrap seed). Empty
  bootstrap seeds only org `'1'` (Stark Industries) as
  **14 message pairs** (absolute) covering System + Tony
  Stark identity/PII/credentials/membership/role-grant/
  organization/state events — derived reads, not entity
  tables. `clients` is empty (sentinel). NOTE: pristine
  seeds NO Records. Source of truth: `postBootstrap` in
  `api/mock-data.ts`. IndexedDB stores each row as an
  object — no `gz1` compression — and the `__schema__`
  marker store holds one row. The full table set is
  `TABLE_NAMES` in `api/db.ts` (three survivors); no
  object stores outside that list (plus `__schema__`)
  appear on a post-Final origin (pre-Final orphans may
  linger inert — gate 6).
- [ ] **G33** Click "Wipe and Load Mock Data", then Confirm the dialog. PASS: a confirm dialog (`#confirm-wipe-dialog`, titled "Confirm Action") appears first warning the wipe cannot be undone — Cancel aborts with no change; on Confirm the page renders the one-time demo-credentials reveal panel (`.credential-reveal`, titled "Save your demo sign-ins") listing EVERY login-capable seeded identity's email + fresh password in the monospace `.credential-reveal-box`, one credential per line, with a "Copy all" button. (Mock data seeds two orgs — `'1'` Stark Industries and `'2'` Wayne Enterprises — so the list spans both orgs' seeded humans; Tony Stark / `current` is the multi-org admin.) The page does NOT navigate until "I have saved it — continue" is clicked; clicking it redirects to `dashboard/index.html`. Navigate to `ideas/` — Stark's 6 ideas are back (the seed plants 11 ideas total, split across both orgs via `assignOrg`; the org fence shows only the active org's).
- [ ] **G34** Return to `snapshots/`, wipe data, then use "Upload Snapshot" file input and select the previously downloaded JSON file. PASS: redirects to `dashboard/index.html`. Data matches the snapshot.
- [ ] **G36 — Sidebar org-switcher (multi-org user)** After "Wipe and Load Mock Data" (G33) seeds two orgs and boot signs in as the multi-org admin Tony Stark (`current`), the SIDEBAR FOOTER (not the top bar) shows an inline native org `<select>` (`.org-switcher`, inside `#sidebar-org-switcher` / `#mobile-sidebar-org-switcher`) next to the member chip — it appears ONLY because the user can reach ≥2 orgs (`shouldShowOrgSwitcher`). PASS: the select lists "Stark Industries" and "Wayne Enterprises" with Stark active; the plain org-name text line in the chip is cleared so the org is not named twice. Note the Members and Ideas lists for Stark. Select "Wayne Enterprises" → the page does a FULL reload and re-scopes: Members shows Wayne's roster and Ideas shows Wayne's ideas (org-fenced — Stark's rows are no longer visible). Reload the page again WITHOUT changing the select → the selection persists (Wayne stays active; the choice is stored under `fusion-ai:active-organization-id` and boot re-exchanges a scoped token from it). A single-org seeded user, by contrast, sees NO `<select>` in the sidebar — just the org name as PLAIN TEXT in the chip. The top bar shows neither the switcher nor a greeting; its only org-aware affordance is the pending-invitations bell (V3). Source of truth: `web-app/app/org-switcher.ts`, `web-app/app/sidebar-member.ts`, `web-app/app/adapters/org-session.ts`, `web-app/app/core.ts::scopeBootToActiveOrg`. (This case requires the two-org mock-data seed, so it runs in Phase 4 alongside G30–G35 — never concurrently with Phase 2 agents.)

### Snapshot & User Lifecycle — Error/Edge Cases

- [ ] **G35** On `snapshots/`, click "Upload Snapshot" and select a
  malformed JSON file (e.g. truncated mid-object). PASS: a toast or
  inline error reports the upload failed with a human-readable
  message; existing data is untouched (verify via DevTools that
  the IndexedDB object stores were not overwritten or cleared).
  Note: malformed JSON is rejected at parse time — BEFORE the
  import transaction opens — so no data is touched. A
  parse-success but validator-throw is rejected at the gate too;
  and on IndexedDB the clear+put runs in one transaction, so even
  a mid-write failure aborts whole, leaving prior data intact
  (atomic import replaced wipe-on-fail). Covered by
  `tests/snapshot-import-validation.test.ts` and
  `tests/snapshot-wipe-on-fail.test.ts` (now atomic-rollback) —
  this case verifies the error toast/inline-error surfaces in the
  UI.)
- [ ] **G41** Member lifecycle is recorded on the pair
  plane. On a member detail page (human OR AI), click
  Edit, change the State select (active / pending /
  archived), and Save. PASS: the chosen state is written
  via `postHumanMemberStateChange` /
  `postAIMemberStateChange` — both kinds expose the same
  State select and share the 3-value vocabulary per
  Commandment III (Uniformity). The write is a
  `members/:id` document-trio PUT (not a `/states/:id`
  event-append). Verify via
  `GET /entity-states/:id/history` or the matching
  `members/:id` document pairs in `requests`/`responses`:
  an event with `entity_id` = the member's id,
  `state` = the chosen value, `member_id` = the actor
  appears — lifecycle is not a column on a member row.
  After reload the member's badge text and styling
  reflect the persisted state.
- [ ] **G37 — Boot recovery from a missing schema** With the app loaded, open DevTools → Application → IndexedDB and delete the `fusion-ai` database (or clear the `__schema__` store). Reload a schema-requiring page (e.g. `dashboard/index.html`). PASS: boot reopens a fresh empty database, `hasSchema()` is false, and `core.ts` REDIRECTS to `snapshots/index.html` with the "Your database is empty." banner and the four recovery cards (Download Snapshot / Upload Snapshot / Wipe and Load Mock Data / Create Pristine) — never the terminal "Failed to initialize database" dead-end. Afterward, Wipe and Load Mock Data to restore a healthy DB before continuing. (Unlike the old localStorage tier, IndexedDB object stores always exist post-upgrade, so a hand-corrupted "partial table" shape is no longer reproducible; a genuinely missing store arises only on a schema version bump, where boot throws `MissingTableError` and `redirectIfMissingTable` routes to `snapshots/index.html?missing-table=<name>` with the matching "The schema is missing the \"<name>\" table" banner.) Source: `web-app/app/core.ts` (`redirectIfMissingTable` + the `initDatabase()` catch), `web-app/app/adapters/snapshots.ts` (`getHasAnyHumanMembers`), `web-app/snapshots/index.ts` (`mutateMissingTableBanner`).

### Billing (`billing/`) — STUB

Billing is a placeholder page. `init()` is empty and
the body is hand-written static HTML. These tests
verify the page loads and the sidebar nav link works
— functional billing tests will be added when the
feature is implemented.

- [ ] **G42** Click "Billing" in the sidebar. PASS:
  browser navigates to `billing/index.html`. The page
  renders without console errors. Sidebar highlights
  the Billing link as active. No runtime JS errors
  from the empty `init()`.

### Organization General Information — Edit Cycle

- [ ] **G38** On `organization/index.html`, click
  Edit in the page header. Modify the
  Domain to a new value. Click Cancel. PASS: card
  returns to read mode, Domain shows the original
  (unmodified) value, no toast fires.
- [ ] **G39** Click Edit again. Modify Domain.
  Press `Escape`. PASS: card returns to read mode,
  Domain shows the original value (Escape behaves
  identically to Cancel; same code path as the
  Member Detail edit cycle).
- [ ] **G40** Click Edit. Modify both Organization
  Name and Domain. Click Save. PASS: toast
  "Organization saved" fires at top-center,
  card returns to read mode showing the new
  values. Reload the page. PASS: new values
  persist (round-tripped through `PUT
  /api/organizations/<id>`). Inspect the `organizations`
  store (IndexedDB): the org row has the updated
  `name` and `domain` fields alongside the unchanged
  `seats`, `projects_limit`, `ideas_limit`, and
  `next_billing` fields.

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
- [ ] **I5** Reload the page. PASS: theme choice persists (stored in `localStorage` key `fusion-ai:theme`).
- [ ] **I6** Open the app in a second browser tab. Change theme in the first tab. PASS: second tab updates to the new theme without manual reload (cross-tab sync via StorageEvent).

### Sidebar

- [ ] **I7** Click the sidebar collapse button. PASS: sidebar collapses to icon-only view, main content area expands.
- [ ] **I8** Navigate to another page. PASS:
  collapsed state persists (stored in
  `localStorage` key
  `fusion-ai:sidebar-collapsed`).
- [ ] **I9** Click the expand button. PASS: sidebar returns to full width with labels.

### Mobile Responsive

- [ ] **I10 — Mobile breakpoint** (NOT MCP-driven — `resize_window` does not change the CSS viewport). Verify by source: read `web-app/app/styles/layout.css` and confirm the `@media (max-width: 767px)` block (lines 296–306) hides the desktop sidebar (`.sidebar` → `display: none`), and that the mobile drawer is revealed by `.mobile-header`'s default `display: flex` (line 271) being suppressed only under `@media (min-width: 768px)` (lines 285–290). PASS = both rule sets present and well-formed.
- [ ] **I11** Tap/click the hamburger menu. PASS: mobile sidebar sheet slides in from the left with navigation links.
- [ ] **I12** Tap/click the backdrop or a nav link. PASS: mobile sidebar closes.
- [ ] **I13** Tap a navigation link in the mobile sidebar. PASS: navigates to the target page and mobile sidebar closes. (Note: the drawer closes implicitly via page navigation — the next page loads in default-hidden state. No explicit close-on-link-click handler is required; navigation is the close trigger.)
- [ ] **I14** Open the mobile sidebar, press `Escape`. PASS: sidebar closes.
- [ ] **I15** Open the mobile sidebar, press `Tab` repeatedly. PASS: focus cycles through focusable elements inside the sidebar without escaping to the page behind it. `Shift+Tab` at the first element wraps to the last.

### Command Palette

- [ ] **I16** Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux). PASS: command palette overlay appears with search input focused.
- [ ] **I17** Type a search term (e.g. "ideas"). PASS: filtered results appear. Select a result — navigates to the corresponding page.
- [ ] **I18** Press `Escape`. PASS: command palette closes.
- [ ] **I19** Open command palette, type a search term. Use `Down Arrow` and `Up Arrow` to navigate results. PASS: active result highlight moves with arrow keys. Press `Enter`. PASS: navigates to the highlighted result.
- [ ] **I20** Open command palette with an empty search field. PASS: results list shows up to 12 items from the combined index, grouped by category (Ideas, Projects, Members, Pages) with category headers — when the dataset is sparse enough for multiple categories to fit in 12 items, multiple groups appear; otherwise a single group is shown. Type a multi-category term (e.g. "a", which matches across Pages / Ideas / Projects / Members) that matches across groups. PASS: results regroup under multiple category headers. Type a term that matches no results. PASS: result list is empty or shows a no-results message.

### Loading States

- [ ] **I21** Navigate to a data-dependent page with mock data loaded. PASS: loading skeleton (card-grid, card-list, or detail pattern) appears briefly before content renders.
- [ ] **I22** If an error occurs inside a `loadInto()` fetch path (e.g. a data-dependent page hits a thrown adapter error after the database initialized successfully), the error state with "Try Again" retry button is shown. PASS: clicking retry re-attempts data loading. (Note: errors surfaced from `initDatabase` itself — e.g. a failed IndexedDB open/version error before the page renders — show a separate "Failed to initialize database" error UI via `handleDatabaseError`, without a retry button. Both are valid error states for different layers.)

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
  `fusion-ai:sidebar-collapsed`).

### Accessibility

- [ ] **I29 — Skip link & `<main>` landmark** From a fresh load of any sidebar-layout page, press `Tab` once. PASS: the first focusable element is a "Skip to main content" link (visually hidden until focused via the `.skip-link` translateY rule in `base.css`); pressing `Enter` moves focus past the sidebar and top-bar into the page body. Then confirm via `read_page`/`javascript_tool` that the content wrapper is a `<main id="main-content">` landmark (not a bare `<div class="page-content">`) and that the composed shell (`web-app/app/components-layout.html`) contains exactly one `<main>`. `Tab`/keyboard is MCP-driveable (see I15), so this is a PASS/FAIL case — not BLOCKED. Guards WCAG 2.4.1 Bypass Blocks (Level A).
- [ ] **I30 — Reduced-motion view-transition guard** (behavioral drive BLOCKED — `prefers-reduced-motion` cannot be emulated via the MCP, the same class of limit as `resize_window`/I10). Structural verification is authoritative and PASS-able: read the `@media (prefers-reduced-motion: reduce)` block in `base.css` (it sits beside the `::view-transition-*` rules there), and confirm a rule neutralizes the page-content transition under reduced motion (e.g. `::view-transition-group(*)` / `::view-transition-old/new(*)` set `animation: none`) — the universal `*, *::before, *::after` reset does NOT reach view-transition pseudo-elements, which live in a separate tree rooted at `::view-transition`. PASS = the neutralizing rule is present and well-formed. Behavioral tier (BLOCKED): confirming `fade-in-up`'s `translateY` slide (`utilities.css:138`) is actually suppressed on navigation requires a human with OS-level reduced-motion enabled. Guards WCAG 2.3.3 Animation from Interactions (AAA).

---

## K. Objectives & Scoring

Owner agents: Agent-G (K1–K6 in Phase 2, K8 in Phase 4),
Agent-E (K7, K9–K23, K30), Agent-CH (K27–K29). Mutation
domain delta:

- Agent-G adds: `objectives`, `objective_revisions`
  (archive/reactivate append a `state` event to the shared
  `states` log — no separate `archived` table)
- Agent-E adds: `project_objective_baseline_scores`,
  `project_objective_actual_scores`
- Agent-CH stays read-only

### K1–K6 — Organization Objectives box (Agent-G, Phase 2)

K7 has been reassigned to Agent-E and appears at the end of
the K30 subsection. K8 has been moved to Phase 4 alongside
G30–G35 (snapshot lifecycle) and is documented in the
Snapshots section below — it MUST NOT run in Phase 2
because it wipes the database, which is shared across the
seven Phase 2 agents.

**K1.** Open Organization page; confirm Objectives box
renders between the Overview and Usage cards with
4 seeded active objectives in position order. PASS if all
4 names display.

**K2.** Click `+ Add objective`; confirm modal opens. Enter
name "Test Objective" and description "Test desc"; click
Add. PASS if the new objective appears at the bottom of the
active list.

**K3.** Click `Edit` on an active objective; confirm modal
opens pre-filled. Change the name; click Save. PASS if the
list re-renders with the new name.

**K4.** Click `Archive` on an active objective; confirm
dialog opens. Confirm. PASS if the objective moves from
active to the Archived sub-section, with strikethrough.

**K5.** Click `Reactivate` on a archived objective; PASS
if it returns to the active list.

**K6.** Drag an objective to a new position. PASS if the
new position persists across a page reload.

**K8.** **Phase 4 case** — runs alone alongside G30–G35
after Phase 2 and Phase 3 complete. Catastrophic if run
in Phase 2 because it wipes the database, which is shared
across all seven Phase 2 agents.

Empty state: wipe the database via DevTools (Application >
IndexedDB > delete `fusion-ai`), then navigate
to the Organization page. PASS if the empty-state copy
"No objectives yet. Add one to get started." renders
(or the bootstrap redirects to the snapshots page per the
existing missing-schema rule). Restore via mock data
afterward.

### K9–K18 — Project detail: inline scoring + Approve (Agent-E)

The Score and Log-measurement MODALS are retired. Baseline
and actual scores are edited INLINE in
`#project-objectives-section`: each `.project-objective-row`
carries EITHER a `.baseline-slider` (before approval) OR an
`.actual-slider` (once approved) — mutually exclusive, selected
by project state — with one shared `Save`
(`data-action="save-objectives"`) button that enables only
when a slider moves off its `data-initial-value`. Precondition
note (TALLY.7): a project converted through the UI arrives at
`submitted` ALREADY baseline-scored (convert requires a
baseline per active objective), so to exercise the
unscored→score→approve path you need a project created
WITHOUT baselines (converted when no objectives existed, or
seeded directly).

**K9.** Open a `submitted` project; confirm the action bar
shows Edit plus the review actions (Approve / Decline / Send
back) and no View history (it appears only once approved or
archived), and the objective rows' baseline sliders are
editable inline (baseline editing is open across the
pre-approval states submitted/under_review/sent_back).

**K10.** Transition status to `under_review` via the edit
form. PASS if the baseline sliders remain editable inline —
there is NO Score button and NO modal.

**K11.** With baselines unscored, the `Approve` button is
disabled with a tooltip prefixed "Set a baseline score
before approving:" followed by the comma-joined names of the
unscored objectives (e.g. "Increase incomes, Raise customer
NPS"); each name falls back to its objective id when no name
is known. The convert-time gating STILL HOLDS even
though the modal is gone.

**K12.** Inspect the objective rows; PASS if each shows a
baseline slider inline in the section (no modal opens), at
its current or unset value.

**K13.** Drag two baseline sliders to non-zero values; PASS
if the shared `Save` button enables (dirty-tracked). Click
Save. PASS if the rows show the saved baselines and Approve
is **still** disabled because remaining objectives are
unscored.

**K14.** After save, PASS if the moved sliders' `Save`
button disables again (each slider's `data-initial-value`
resets to the saved value) and saved values persist on
re-render.

**K15.** Drag the remaining baseline sliders; Save. PASS if
the Approve button enables once every active objective has a
baseline.

**K16.** Click Approve; confirm dialog opens. Confirm. PASS
if status flips to `approved` and the action bar re-renders
with `Archive` / `View history`; the row `.actual-slider`s
become editable inline.

**K17.** Negative-score path: on an under_review project,
drag a baseline slider to the far left (-100). Save. PASS if
the saved value persists as a signed value (e.g. −100) and
View history (once approved) shows the negative score.

**K18.** "No-payload" save: with no slider moved off its
`data-initial-value`, the `Save` button stays disabled and
no new rows are written to the
`project_objective_baseline_scores` store (count
unchanged via console).

### K19–K23 — Inline actual measurement + Archive (Agent-E)

**K19.** Open an `approved` project; PASS if the objective
rows' `.actual-slider`s are editable inline (there is no Log
measurement modal), pre-filled from the latest actual or
from the baseline when no actual exists yet.

**K20.** Drag one actual slider; click `Save`. PASS if the
row's actual value updates (persisted via
`postProjectActualMeasurement`) and the Save button
re-disables.

**K21.** Re-render the page; PASS if the moved actual slider
pre-fills with its latest actual value.

**K22.** The terminal action is `Archive`, not "Complete",
and the terminal state is `archived`, not `completed` —
there is no `completed` value in `PROJECT_STATES`. Click
Archive; PASS if a confirmation dialog opens.

**K23.** Confirm the archive. PASS if status flips to
`archived` and the action bar reflects the archived
project.

### K24–K26 — Projects list Projected Impact column (Agent-E)

**K24.** Open Projects list; PASS if the Projected Impact
column renders a value for each row — unscored / pre-approval
projects show "—"; scored projects show a signed value.
NOTE: the column header carries no visible text label (the
"Projected Impact" name is not rendered in the header row),
so identify the column by its position/content, not header
text.

**K25.** Sort by Projected Impact descending; PASS if rows
re-order accordingly (most-positive first).

**K26.** Filter to `under_review` status + sort by Projected
Impact descending; PASS if the result is the "review queue
ranked by impact" workflow we designed.

### K27–K29 — Dashboard Impact + Aggregates (Agent-CH)

**K27.** Open dashboard; PASS if four surfaces render: three
arc-gauge cards sharing one card shell (Time and Cost are ratio
arc-gauges; Impact is a bipolar arc) and an Aggregate Objectives
box (full-width row below).

**K28.** Inspect the Impact gauge. PASS if:
- The arc has muted background visible at all values
- For a net-positive portfolio, value arcs sweep right and
  use green tones
- For a net-negative portfolio, value arcs sweep left and
  use red tones
- The "actual" tick is visually distinct from the baseline
  area (thinner / different opacity)

**K29.** From another tab, log a measurement on an approved
project. PASS if the Aggregate Objectives box updates within
~1 second (BroadcastChannel + scoreChanges propagation); the
three arc-gauge cards refresh only on full page load.

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
(verify the `objective_revisions` store in IndexedDB holds
≥1 row with a `name` change, confirming K3 ran), reopen the
project's history modal. PASS if events that predate the
K3 edit display the OLD objective name, not the new one
(temporal name resolution). If after 10 minutes
`objective_revisions` shows no rename, mark K7 BLOCKED
with reason "no K3 rename to verify against — Agent-G did
not produce the prerequisite in time".

---

## R. Records

Sidebar entry plus list/detail pages, attribute editor with
constraint sub-editor, flow binding, per-node attribute
panel, and the property-test gate.

Owner agent: Agent-F2 (Phase 2). The property-test gate
(R13–R14a) rides Agent-F2's own work orders, and the record
CRUD adds `records`, `record_attributes`, `flow_records` to
its mutation domain — disjoint from every other agent, so no
write-domain collision.

- [ ] **R1** Sidebar shows a Records entry; click navigates
  to `records/`. PASS: under the active org (Stark, org 1)
  the list renders the Customer Profile Record; Project
  Brief is seeded under org 2 and is correctly hidden here.
- [ ] **R2** Click "+ Add Record" → navigates to a create
  page (`records/create.html`) with Name and Description
  fields (not a dialog). Type values, click Create.
  PASS: new Record appears at the bottom of the list and the
  app navigates to its detail page.
- [ ] **R3** Open Customer Profile detail. PASS: read mode
  shows name + description + attribute table sorted by
  sort_order + Bound flows (Customer Onboarding, Lead-to-
  Close) + Work orders using this Record list.
- [ ] **R4** Click Edit. PASS: edit mode renders name input,
  description textarea, and one editable row per attribute
  with name input, type picker, options textarea (for
  select-typed), and constraint editor.
- [ ] **R5** Type a name into the pending-attribute input,
  then click "+ Add Attribute". PASS: a row is appended with
  default type `text`; an empty-name click is a no-op.
- [ ] **R6** Change a text attribute to `select`. PASS: the
  options textarea appears; the constraint picker offers
  only kinds applicable to `select` (i.e. nothing in the
  toy).
- [ ] **R6a** Add an attribute and change its type to `radio`. PASS: the type picker offers `radio` alongside text/number/select/date/checkbox, and selecting it reveals the same "Options (one per line)" textarea that `select` shows; `checkbox` and the scalar types show no options field.
- [ ] **R6b** Give a `select` or `radio` attribute zero options and click Save. PASS: the save is rejected — a "Failed to save Record" toast appears and the editor stays open, because the API validator requires at least one option for choice fields (the gate, not merely a disabled button). Add one or more options and Save; PASS: it persists and read mode shows the attribute's type.
- [ ] **R7** Add a `regex` constraint on a text attribute,
  set the pattern. PASS: constraint row appears with the
  pattern editable; the picker no longer offers `regex`
  for that attribute (toy implementation may always offer
  it — accept).
- [ ] **R8** Drag-reorder attributes — toy may not yet
  support; MARK BLOCKED if so.
- [ ] **R9** Remove an attribute via its trash button.
  PASS: row removed from the editor; not persisted until
  Save.
- [ ] **R10** Click Save. PASS: returns to read mode; the
  list reflects the new attribute set and constraint
  summaries.
- [ ] **R10a** Save a Record edit and watch the toast. PASS: exactly one "Record saved" toast appears — never a stack — and re-entrant saves are guarded (clicking Save repeatedly does not fire multiple saves or stack toasts). NOTE: the original 5-stacked-toast defect needed a slow save to open the race; the multi-attribute write is now a single batched table write, so the window is effectively closed and exercising the race deterministically may require artificially throttling storage.
- [ ] **R11** Open a flow (Customer Onboarding). PASS: flow
  header shows `Record: Customer Profile` dropdown
  selected.
- [ ] **R12** Open the Data Capture node panel. PASS: each
  ref row shows attribute name + Editable/Read-only picker
  + Required checkbox + remove (×) button; picker dropdown
  lists unreferenced attributes only.
- [ ] **R13** From workbox, open the gate-violation work
  order (`#gate0001`). PASS: current node is Data Capture;
  the action screen shows Company Name and Contact Email
  inputs (fillable path); empty submit is blocked — the
  page-module empty-required pre-check toasts "Please fill
  all required attributes" before the POST. The typed
  gate (`validateRecordTransition` on CURRENT-node refs)
  is the durable covenant; CLI pins it; constraint
  failures still surface via
  `WorkboxDetailPresenter.buildViolations` banner.
- [ ] **R14** Fill Company Name + Contact Email, click
  submit. PASS: transition succeeds; work order advances
  to Review (does NOT demand Reviewer Notes — that is
  current-node only when leaving Review).
- [ ] **R14a** When a node references a `radio`-typed Record attribute, the workbox work-order detail renders it as a radio group — one `<input type="radio">` per option, all sharing the attribute name so only one is selectable — rather than a dropdown; selecting an option and transitioning records that value. NOTE: seeded mock data predates `radio`, so add a radio attribute, reference it Editable on a working node, and create a work order to exercise this.
- [ ] **R15** Archive a Record from its detail page (if a
  control exists in the toy) or via the snapshot wipe.
  PASS: lifecycle state reads `archived`; the list page
  excludes the row from active counts.

## L. IndexedDB Persistence Tier

Backend: `api/backend-indexeddb.ts`. No Node test (no fake-IDB, zero devDeps) — verified in-browser via the Chrome MCP. Serve: `TMPDIR=/tmp/claude ./serve 8080`.

Owner: Phase 4 (alone, after Phase 2). L1–L9 reopen, wipe, and reseed the `fusion-ai` database, so they need exclusive DB access alongside G30–G35 — never concurrently with the seven Phase 2 agents.

- [ ] **L1** Boot creates the database. Inspect `indexedDB.databases()` on the dashboard. PASS: `fusion-ai@v1` with 4 object stores (3 tables in `TABLE_NAMES` — `clients`, `requests`, `responses` — plus `__schema__`). Pre-Final origins may also list inert orphan stores.
- [ ] **L2** Missing-schema route. Open the dashboard against an empty database. PASS: it redirects to the Snapshots page.
- [ ] **L3** Atomic seed. Click "Wipe and Load Mock Data". PASS: the `__schema__` marker and pair rows persist; the dashboard renders the seeded org (1506 pairs absolute).
- [ ] **L4** Persistence across reload. Reload the dashboard. PASS: it renders the seeded data without re-routing to Snapshots.
- [ ] **L5** Cross-tab append survives (lost-update fix). From two connections (two tabs), append distinct pairs concurrently (e.g. two lifecycle state changes). PASS: both pairs survive (count grows by 2) — the old localStorage clobber is gone.
- [ ] **L6** Cross-tab refresh. Commit a write in one of two open tabs. PASS: a `BroadcastChannel('fusion-ai:data')` message carrying a scoped notification event (organization/identity ids, or a full-refresh event) reaches the other tab; the poster is not echoed (no self-refresh).
- [ ] **L7** Atomic import. The clear+put import runs in one `IDBTransaction`. PASS: a rejected import leaves prior data intact (no corruption). A real pre-Final v2 snapshot REJECTS with `SnapshotVersionMismatchError`.
- [ ] **L8** Quota pre-flight. PASS: an oversize snapshot rejects with `SnapshotTooLargeError` before any write (also `tests/snapshot-quota.test.ts`).
- [ ] **L9** Bare-DB self-heal. On a 404 path (no app connection), run `indexedDB.deleteDatabase('fusion-ai')` then `indexedDB.open('fusion-ai', 1)` with NO `onupgradeneeded` handler — forging a v1 DB with 0 object stores and no `__schema__` — then load a real page. PASS: `open()` (`api/backend-indexeddb.ts`) sees the missing `__schema__` store, deletes and reopens so the upgrade rebuilds all 4 stores (3 tables + `__schema__`), and the app boots to the graceful empty-state (Snapshots route + working "Wipe and Load Mock Data"), NOT a "Failed to initialize database" dead-end.

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
| Agent-B       | B1–B29 (less B23–B24) | 27 |       0 |    0 |
| Agent-CH      | C1–C7 + H1–H2     |    9 |       0 |    0 |
| Agent-D       | D1–D37            |    X |       Y |    Z |
| Agent-E       | E1–E11            |   11 |       0 |    0 |
| Agent-F       | F1–F75 + FS1–FS9  |    X |       Y |    Z |
| Agent-F2      | WB1–WB22 + subs, R1–R15 | X |    0 |    0 |
| Agent-G       | G9–14,19–26,36–46 |    X |       0 |    0 |
| Phase-3       | I1–I30            |    X |       Y |    Z |
| Phase-4       | G30–G35 + L1–L9   |    X |       0 |    0 |
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

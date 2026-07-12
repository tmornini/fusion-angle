# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code)
when working with code in this repository.

## Build & Dev Commands

### Commands

```bash
./test                 # Run automated tests
./validate             # Type-check + tests + lint (works on dirty tree)
./build                # Compile, bundle, minify, ZIP to ~/Desktop/
./build --no-zip dir/  # Bundle to dir/ without zipping (for testing)
./build dir/           # ZIP to dir/ instead of ~/Desktop/
./build --help         # Show usage
./serve [port]         # Build + start HTTP server (default 8080)
./measure              # Page-load benchmark (needs Chrome)
./measure --check      # Fail if medians exceed budgets
./measure --record     # Append one line to measure-history.jsonl
./measure --write-budgets  # mean+1.5σ budgets (full sweep)
./measure --budget-sigmas N  # σ multiplier (default 1.5)
./measure --pages a,b  # Subset of PAGE_REGISTRY keys
./measure --runs N     # Runs per page (default 5)
```

**Commit before building.** `./build` requires a clean
working directory. Run `./validate` to catch type errors
and lint issues; commit; then build.

For local test-as-you-go:

```bash
./serve 8080
# open http://localhost:8080/landing/index.html
```

### Sandbox invocation

When running under the Claude Code sandbox, the default
fails because `/tmp/` is not writable. Use this invocation
instead:

```bash
TMPDIR=/tmp/claude ./serve 8080
# open http://localhost:8080/landing/index.html
```

`TMPDIR=/tmp/claude` redirects `./serve`'s temp build dir
into the sandbox-allowed path.
`localhost` is reachable from the sandbox, so the Chrome MCP
tools can drive the page normally.

### Validate semantics

`./validate` runs `tsc --noEmit` (type checking), then
`./test` (automated tests against pure modules and the
`api/`, `adapters/`, and `presenters/` layers, via `node
--test --strip-types tests/*.test.ts`), then enforces a
78-character maximum line length on all `.ts`, `.html`, and
`.css` files (excluding `compose.ts`) and on every `.md`
file at the repo root except [TEST-PLAN.md](TEST-PLAN.md)
and [API-TREE.md](API-TREE.md) — both exempted because their
entries are meant to scan as one self-contained line. Finally
it runs the
`generate-schema-svg --check` gate, which fails on
`SCHEMA.svg` drift from the schema of record (`api/db.ts` +
`api/types.ts`).

For what each test layer covers, see `## Testing`.

### Measurement

`./measure` is a headless-Chrome page-load benchmark. It is
**not** part of `./validate` — it needs Chrome and takes
minutes (a full 29-page × 5-run sweep is several minutes).

Run deliberately: before builds/releases; after adapter,
derive, or presenter changes; at migration milestones with
`--record`.

Budgets live in `measure-budgets.json` (repo root) — per
`PAGE_REGISTRY` page `readyMs` ceiling. Calibrate with
`--write-budgets` (full registry only): each budget is
`ceil(mean + k×sampleσ)` of that page's run samples
(`k` defaults to 1.5 via `--budget-sigmas`). `--check`
gates **median** readyMs against those ceilings. Budgets
are a **per-machine-class local dev gate**, not a CI
absolute. Use enough `--runs` (e.g. 30) for a stable σ.

History lives in `measure-history.jsonl` — appended only by
`--record`. Longitudinal record across the Postgres
migration.

In-app instrumentation always ships: `page-performance.ts`
marks boot/fetch/render phases; one `page-performance` info
log fires after ready (default log level `warn` keeps
consoles quiet).

Clean tree required (same as `./build` — measures committed
bytes). Sandbox: `TMPDIR=/tmp/claude ./measure ...`. Chrome
binary: `$CHROME`, or the macOS default Google Chrome path.

Design:
`docs/superpowers/specs/2026-07-12-page-
performance-measurement-design.md`.

## TypeScript

Target: **ES2024** · Strict mode with
`noUncheckedIndexedAccess`. Config at
`web-app/app/tsconfig.json`. The `compose.ts` and
`generate-schema-svg.ts` build scripts are excluded from
type checking (they run in Node).

## Architecture

**Vanilla TypeScript** with zero runtime dependencies.
Enterprise innovation management platform with modules for
ideas, projects, members, flows, and workbox, plus a
dashboard and flow statistics.
Every page is a standalone HTML file served via HTTP. The
code also supports `file:///` protocol locally, but testing
is HTTP-only.

### Key Layers

- **HTML Composition.** `web-app/app/compose.ts` assembles
  `components-layout.html` + `component-*.html` + each page's
  `index.html` into composed standalones in a temp build dir.
  Standalone pages skip the layout wrap but still have their
  `{{PAGE_CSS_LINKS}}` placeholder filled from `cssBundles`
  before they are written.
- **Navigation.** `<a href>` between pages. `navigateTo(page,
  params?)` builds relative URLs.
- **Page Detection.** `<html data-page="dashboard">` →
  `PAGE_REGISTRY` lookup → page module's `init()`.
- **Source = Output Alignment.** `PAGE_REGISTRY` declares
  `sourceDir` and `sourceFile`. Both `compose.ts` and
  `navigateTo()` resolve output as
  `{sourceDir}/{sourceFile}.html` — the file you edit is the
  file the browser loads.
- **Auth.** Real OAuth 2.1 spine. `/authentication/token`
  (grant dispatch) + `/authentication/authorize` (password
  loop) mint/verify HMAC-SHA256 JWTs (`api/access-token.ts`);
  a Bearer gate in `handleRequest` enforces them. The
  `authorization_code` grant is TTL-bound, client-bound, and
  PKCE-verified when authorize carries a `code_challenge`
  (soft-optional when omitted — password-loop demo residual;
  hard PKCE is a server-tier residual). A client is a
  kind-'service' identity + a registration facet
  (`identities/:id/registration`, admin-realm, kind-gated);
  `grantClientCredentials` derives it pre-token, and
  authorization_code redemption stamps `act.sub` with the
  acting client. Token lifecycle (issue/rotate/revoke) lives
  only as message-pair events now — `identity_tokens` and
  `authorization_codes` are RETIRED tables (Phase 13 Task 9);
  the `identity_token_revocations` ledger and PBKDF2 password
  hashing back the gate too. Every per-request check —
  revocation, the tenancy fence, roles — derives fresh from
  the pair plane, never a snapshot the token claim itself
  carries. The HMAC key is client-shipped, so isolation is
  demo-grade until the server tier. The snapshot plane
  (`BOOTSTRAP_ROUTES`) is intentionally auth-free dev-tier —
  removed or re-gated when the Postgres server tier lands; see
  [ARCHITECTURE.md](ARCHITECTURE.md) § Server-tier deploy
  blockers.
- **Tenancy.** Every authenticated request runs org-scoped
  on the **pair plane**. `fenceRequest` completes the vessel
  with organization, live memberships, and roles from the
  VERIFIED token claim (never the path); handlers receive
  `ctx.base` — there is no `organizationScopedAdapter`.
  Surviving stores are global; tenancy rides `uri_prefix`.
  A flat (un-exchanged) token resolves its org via
  `identityDefaultOrganization`: the identity's SET default
  org (`identity_default_organizations` ledger, latest
  wins), else its PRIMARY membership org, else a 403 — there
  is no global default. Membership and roles derive fresh
  every request (`callerOrganizationIds` →
  `deriveMembershipsForIdentity`; `deriveRoleGrants`), so a
  revoked grant loses access on the very next request.
  Org-scoped PUT/DELETE hit the write-ownership fence
  (`writeOwnershipFenceFor` → `resolveGlobalOwner`) so a
  foreign id 403s rather than genesis-ing in the caller's
  namespace; genuine absence still 404s (or genesis on
  PUT). Authentication runs before the no-match 404 —
  unauthenticated callers get 401 on any non-exempt path
  (including unknown and retired routes), never a route-
  topology oracle. `organizations` is the tenant root;
  `memberships` joins identity↔org; the members roster is
  derived. A membership pair is created when an invitee
  ACCEPTS an invitation (the only live membership write;
  `web-app/app/adapters/invitations.ts` + the `invitations`
  facade) — accept stamps the INVITATION's org, not the
  caller's active org. Per-org roles via
  `currentRolesForInOrganization`. See
  [SCHEMA.md](SCHEMA.md) / [ARCHITECTURE.md](ARCHITECTURE.md).
- **Data.** REST-style API (`api/`) over IndexedDB. Adapters
  in `web-app/app/adapters/` shape pages from pair-plane
  derives. The live flow graph is pair-plane only:
  `graphDelta` / `revivals` in the flow document body feed
  `deriveFlowGraphStates`; GET reassemblies
  `FlowWithGraph`. A work order freezes its own
  `flow_graph` inside the work-order document pair. Flow
  undo resolves its restore target from the flow's own
  document-pair history (Phase 14 Task 8). Phase 15 retired
  the `flows/:id/versions[...]` routes (and the zero-caller
  `GET states/:id` / `GET entity-states/:id` /
  `PUT|DELETE states/:id/field-values/:fvid` families) —
  all states retirements are router 404. Phase Final DELETED
  the graph/version tables with the rest of the row plane.
  Ownership fences and field-values visibility resolve on
  the pair plane (`resolveOwningOrganization`,
  `stateEventVisibilityFor`). Flow tags
  (`flows/:id/tags/:name`) are the first document family that
  never had a backing table; post-Final every family shares
  that posture.
- **Presentation.** Presenters in `web-app/app/presenters/` emit
  `SafeHtml`.
- **Database.** IndexedDB (`api/backend-indexeddb.ts`): one
  object store per table (`keyPath: 'id'`) plus a `__schema__`
  marker store, at version 1. `TABLE_NAMES` is two:
  `requests`, `responses` — the pure message plane, both on
  `HistoryEntityStore`. Every store op crosses the
  `StorageBackend` transaction seam (`api/db.ts`) — a real
  `IDBTransaction` that commits on `oncomplete` and aborts on a
  thrown body. The memory + localStorage backends simulate the
  same transaction (buffer then flush) for the automated suite
  and the demo tier. Domain state derives from the message
  plane; alphabets live in `api/types.ts` /
  [SCHEMA.md](SCHEMA.md).
- **State.** Module-level vars + pub-sub for theme, mobile,
  auth, sidebar.

For deeper detail: layers, patterns, and conventions in
[ARCHITECTURE.md](ARCHITECTURE.md) (which links the Flow
Designer canvas, [FLOW-CANVAS.md](FLOW-CANVAS.md)); storage
shapes and the state alphabets in [SCHEMA.md](SCHEMA.md); UI
tokens, theming, and CSS architecture in
[DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## UI & Styling

### CSS-first styling

All styling lives in `web-app/app/styles/`. Do not use inline
`style="..."` strings except:

1. **Dynamic per-element values.** Progress widths, fill
   percentages, heat intensities — passed via CSS custom
   properties: `style="--progress-fill:${value}%"` consumed
   by a CSS rule reading `var(--progress-fill, 0%)`; the
   flow-stats heat ramp uses the same pattern with per-node
   `style="--heat-t:${0..1}"` — see
   [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) § Heat ramp. The
   value is **data**; the colors stay in the design system.
2. **Bootstrap fallbacks.** `database-init.ts` uses these
   for error UI before CSS may have loaded; marked with a
   file-header comment.

The variant pattern is `data-tone` / `data-level` attributes on
a base class. The TS enum and the CSS attribute selector share
one source of truth.

When extending CSS: `components-X.css` for patterns used by
3+ pages (one file per family — buttons, cards, dialog, etc.),
`pages-X.css` for page-scoped patterns (each page declares its
bundles in `cssBundles` per `page-registry.ts`), `utilities.css`
for single-property primitives. Do not use raw hex colors;
use `hsl(var(--token))`. See
[DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) § 12 CSS Architecture
for the full cascade order, per-page bundle mechanism, and
decision tree.

### Component Library

All UI components are vanilla HTML/CSS with ARIA attributes,
defined as CSS classes in `web-app/app/styles/` and helper
functions across `web-app/app/` modules. No external
component library.

**Dialog pattern.** Native `<dialog>` driven by `openDialog(id)`
/ `closeDialog(id)` from `core.ts`. The element is
`id="{id}-dialog"` with `class="dialog"` (and `aria-labelledby`
to its title); `openDialog` calls `showModal()` — the platform
supplies the top-layer focus trap, the `::backdrop`, and Escape
(the `cancel` event) — and `closeDialog` calls `close()`. No
backdrop div, no `hidden`/`aria-hidden`. Open and cancel
controls carry `data-dialog-open="{id}"` /
`data-dialog-cancel="{id}"`; each page routes its clicks through
`handleDialogClick(target, e)` (from `core.ts`), which opens,
closes, and light-dismisses by those attributes — one voice
across every dialog. Submit/confirm stay page-specific (a
`#{id}-submit` listener or a `data-*-action`).

**Tab pattern.** Use `initTabs('[data-tab]', '.tab-panel',
'active')` from `core.ts` — the third arg is the active-state
class. Tab buttons use `data-tab="{name}"` attribute, panels
use `id="tab-{name}"`.

### Design System

See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). Key invariant: do
not use raw hex colors in CSS; use `hsl(var(--token))`.
Icons are ~70 inline SVG functions in
`web-app/app/icons.ts`.

**Heat ramp.** See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) § Heat ramp.

### Mobile Responsiveness

CSS media queries in `web-app/app/styles/layout.css` show/hide
desktop vs mobile header and sidebar; `responsive.css` carries
the grid-column and visibility utility overrides plus the
reduced-motion block. Mobile sidebar uses Sheet (slide-in
drawer) toggled by JS. Breakpoints: sm 640px, md 768px,
lg 1024px, xl 1280px.

## Project Structure

`api/` — the server REST/DB-schema handlers (currently
in-browser): REST routing, DB adapter interface, mock data,
validators, plus the auth/authz/tenancy spine:
`authentication.ts` (OAuth grants), `access-token.ts` (JWT
mint/verify), `authorization.ts` (per-org roles), the
pair-plane org fence (`fenceRequest` / `ctx.base` —
`db-organization-scoped` / `store-organization-scoped`
DELETED with Phase Final), and the identity/organizations/
memberships stores.
`shared/` — code that crosses the client/server chasm, imported
by both `api/` and `web-app/`: the HTTP wire schema
(`http-message/`, with its own `types.ts`) plus pure cross-chasm
utilities (`base64url.ts`, `crypto-safe-base62.ts`,
`password-hash.ts`, `ledger-reduction.ts`, `error-helpers.ts`).
The dependency is one-way: `shared/` NEVER imports `api/`.
`web-app/app/` — all source (TypeScript + CSS), with
subdirectories `adapters/` (data-access + platform shims, both
kinds share the folder), `presenters/` (presenter classes
producing `SafeHtml`), and `styles/` (cascade-ordered CSS
modules); `organization-switcher.ts` is the sidebar-footer org
`<select>` (multi-org only) and `core.ts` scopes boot to the
active org. `adapters/invitations.ts` is the invitation
adapter; the top-bar pending-invitations bell lives in
`invitations-indicator.ts`.
`web-app/{dashboard,organization,ideas,projects,flows,members,`
`invitations,identities,...}/` — page directories registered
in `PAGE_REGISTRY` (sidebar-layout + standalone). The
`identities` surface (list, detail, providers, tokens) shares
the `identities` sidebar key; `invitations/` is the invitee's
own pending-invitations page (reached via the top-bar bell,
sharing the `members` sidebar key). `billing/` is a stub.

The composition root is `web-app/app/adapters/init.ts`. Run `ls`
or read file headers — both are more current than this document
will ever be.

## Build

`./build` requires a clean working directory. Output is a ZIP at
`~/Desktop/`. Use `./build --help` for options. The build script
itself is the source of truth for what gets composed, bundled,
and copied — read it, don't read this section.

## Testing

Two layers, both zero-dependency.

### Automated tests

Node's built-in `node:test` runner with `--strip-types`,
no test-framework dependency (the only devDependencies are
`esbuild` and `typescript`, for ./build and ./validate).
Tests cover pure modules, flow-edit business logic
(`tests/flow-operations.test.ts`), every data adapter
(including `adapters-members-union.test.ts` and
`adapters-flow-publish.test.ts`), workbox inbox, mermaid
round-trip, in-browser ZIP, snapshot import-validation /
quota / atomic-import / v2-reject / v3 round-trip, the
memory + localStorage transaction backends, the tx runners
and view, the commit batch route, api routing, navigation,
mock-data validity (pair count 1506 / bootstrap 13 absolute;
the mock-data fingerprint file retired with the clients
table), client registration facet + derive, the two-tier
hazard predicate (`flow-graph-hazard.test.ts`), presenter
SafeHtml, flow-stats pure math + adapter + presenter,
`duration-units`, and the invitation lifecycle.
Phase 14 cores: `drift-phase14-cores-parity.test.ts`,
`drift-state-field-values.test.ts`,
`pin-invitation-write-path-parity.test.ts`,
`flow-undo-cursor.test.ts`, `api-flow-tags.test.ts`.
Phase 15 cores: `drift-phase15-cores-parity.test.ts`,
`api-states-ownership-fence.test.ts` (re-scoped to
retirement pins; every verb on `/states/:id` is a router
404 for authenticated callers). Phase Final adds the
write-ownership fence pin
(`api-write-ownership-fence.test.ts`); store/decorator unit
tests and dual-write shadow-ledger row oracles retired with
their subjects. Honest HTTP status covenant pins:
`api-unauthenticated-route-ordering.test.ts` (401 before
404), foreign-org 403 body pins across fence/isolation/
drift suites, field-values 200/403/404 three-way. See
`tests/` for the current set.
`api/db-memory.ts` provides an in-memory `DbAdapter` so
adapter and api-layer tests run without `localStorage`.

Run via `./validate` (which also type-checks and lints) or
`./test`, which pins `TZ=UTC` for the main suite and
`TZ=Pacific/Honolulu` for the timezone suite in `tests/tz/`
(excluded from the non-recursive main glob).

### Manual browser regression

UI behavior runs against [TEST-PLAN.md](TEST-PLAN.md),
driven either by a single human tester
serially or by Claude Code agents in parallel via the
`claude-in-chrome` MCP. Anything DOM-driven (gestures, layout,
visual rendering) lives here; where a manual case is the
browser counterpart of an automated area it carries an inline
pointer at the test file. Pure transitions, flow-edit logic,
adapters, presenter output, and API routing live in the
automated suite. The six-phase agent protocol, the per-entity
mutation-domain table, the `StorageEvent` tolerance patterns,
and the known MCP limitations (flow-designer gesture
pointer-capture, `resize_window`, file I/O, kill EPERM) live
in [TEST-PLAN.md](TEST-PLAN.md) § Protocol — CLAUDE.md does
not duplicate them.

### Orchestration

When an agent runs the full test plan (CLI + browser),
`./validate` is the gate: a failing type-check, test, or
line-length lint ABORTS the run automatically. Do not ask
whether to continue — the bundle is built from the same
source, so a failing CLI suite makes the browser run
meaningless. Report the failure, stop, await fix.

The full evidence-based audit — one indoctrinated agent per
scripture section, whole repository, report-only — is the
runbook in [AUDIT.md](AUDIT.md); the abort rule above does not
apply to it (RED is the audit's first finding).

## Gotchas

- **`noUncheckedIndexedAccess`.** tsconfig enables this —
  array/object index access returns `T | undefined`,
  requiring explicit `!` assertions or guards.
- **ES2024 target.** No transpilation. Native
  `Object.groupBy()`, `Map.groupBy()` are available. Assumes
  modern browser.
- **Cross-tab theme sync.** `state.ts` listens to
  `StorageEvent` and syncs theme changes across browser tabs
  automatically.
- **Non-critical writes logged at warn.** localStorage writes
  for theme and sidebar state are wrapped in try/catch that
  log at `warn` level — quota errors don't break the app but
  are observable via the logger.
- **Snapshots replace, not merge.** Import clears every table
  and writes the snapshot rows in ONE transaction (`tx.clear`
  + `tx.put` over `TABLE_NAMES`); pristine/mock-data seeding
  wipes via `deleteSchema` first. On IndexedDB the clear+put
  is a genuine atomic commit.
- **Snapshot quota pre-flight.** `putSnapshotFromFile`
  consults `navigator.storage.estimate()` and rejects with
  `SnapshotTooLargeError` if `file.size` exceeds half of
  `quota - usage` (the import doubles peak memory while
  parsing). Falls back to treating 5 MB as the available
  quota when `navigator.storage.estimate()` is unavailable,
  so the effective file-size cap is half of that (2.5 MB)
  after the same 0.5 headroom ratio is applied.
- **Snapshot import is atomic (wipe-on-fail retired).** On
  IndexedDB the clear+put runs in one `IDBTransaction` — it
  commits whole or aborts whole, so a failed import leaves
  prior data intact with no manual wipe. Validators run at the
  gate (`parseAndValidateSnapshot`, `scanForRetiredKeys`,
  quota pre-flight) BEFORE the transaction. The simulated
  localStorage tier rolls back logic errors the same way, but
  its multi-key flush is still not OS-atomic on a mid-write
  quota error — the one gap IndexedDB closes.
- **Snapshot version gate.** Every export is stamped with
  `SNAPSHOT_SCHEMA_VERSION` (`api/db.ts`, currently **5**) at
  the reserved key `__schema_version__`. Every import REJECTS
  an absent or mismatched version SERVER-side
  (`parseAndValidateSnapshot`, `SnapshotVersionMismatchError`)
  — before the atomicity above ever runs. ASYMMETRIC: it only
  closes "a new build imports an old export"; an old build's
  importer ignores the unknown key and imports anyway. The
  constant bumps whenever `TABLE_NAMES` shrinks or a family's
  derivation shape would strand an older export — Phase 13
  Task 9 (identity_tokens + authorization_codes) was 1→2;
  Phase Final Stage B (doomed entity tables deleted) is 2→3;
  states-address retirement is 3→4 (address retirement, not a
  `TABLE_NAMES` shrink — pre-retirement v3 exports still
  carry `states/:id` pairs no derive source reads); the
  clients elimination (last entity table) is 4→5. A
  pre-retirement v3 export is rejected by a post-retirement
  import.
- **`file:///` protocol.** Page URLs use relative paths.
  Code supports `file:///` locally but testing is HTTP-only.
- **View Transition aborts.** rapid programmatic navigation
  surfaces both `AbortError: Transition was skipped` and
  `InvalidStateError: Transition was aborted...` lines in
  console — Chromium throws both classes for the same root
  cause. Browser-internal (no app code calls
  `startViewTransition`); no app impact.
- **Lifecycle is append-only on the pair plane.** An
  entity's current state is the latest derived event on its
  `entity_id` under the `(at, id)` total order. Reversal is
  a *new* event with the new state, not an edit of a prior
  pair. Surviving HTTP surface (reads only): `GET /states`
  (five-source derived union),
  `GET /entity-states/:id/history` (derived + pair-plane
  ownership fence), `GET /states/:id/field-values` (derived
  collection, transition-fold single-source). Lifecycle
  writes are document-trio PUTs
  (ideas/projects/records/flows/objectives/members) and
  named ops (work-order create/claim/transition/release,
  invitations) — every verb on `/states/:id` is router 404;
  `stateEventCollisionFromPairs` is gone. The `states`
  table, `StateStore`, and `EntityStore` are DELETED
  (Phase Final). Document DELETE is a marked tombstone
  pair; the sole physical hard-delete is PII erasure on the
  message plane.
- **Cross-tab writes are safe (lost-update hazard closed).**
  IndexedDB gives each tab its own connection to one shared
  database, and a pair append is an O(1) `objectStore.put`
  per row on `requests`/`responses` — concurrent tabs both
  survive (verified in-browser; H8 app-wide write queue is
  the accepted single-user cost). A successful write posts a
  scoped `NotificationEvent` (organization/identity ids, or
  a full-refresh event) over a `BroadcastChannel`
  (`adapters/broadcast-channel.ts`); a subscriber refreshes
  when the event names its active organization or its own
  identity, or is a full event. The poster is never echoed,
  so it does not double-refresh. Theme/sidebar still sync
  over `StorageEvent` (they stay in localStorage).
- **IndexedDB auto-commit constraint.** An `IDBTransaction`
  lives only while it has pending requests; awaiting any
  NON-IDB promise inside a `transaction(…)` body (a timer,
  fetch, gzip, HMAC) yields to a macrotask and the transaction
  commits early. So every `transaction(…)` body awaits ONLY
  row ops — validators, crypto, and compression run OUTSIDE
  the tx. Sync compute between row ops is fine.
- **Field values reference record attributes by id** in the
  pair-plane body (`attribute_id` → a record-attribute
  document id), never a table named `attributes`. See
  [SCHEMA.md](SCHEMA.md) and
  `api/derive-state-field-values.ts`.

## Commits

Commit completed, tested work. Do not ask.

Going-forward discipline (the Office of the Commit is the full
doctrine):

- One concern per commit — tiny, semantically contiguous.
- Subject: a single line ≈50 chars, present-tense imperative,
  no prose body beyond the mandated `Co-Authored-By` trailer.
- Never move/rename and change content in the same commit.
- Linear history — rebase and fast-forward, never merge.

## Worktrees

Do not use git worktrees. Work directly in the main checkout.
Worktrees fragment review surface, hide state from the
working tree, and add ceremony without buying isolation that
small focused commits don't already provide.

## Subagents

Subagents inherit no scripture and read no CLAUDE.md by
default. Every subagent prompt MUST begin with the literal
phrase `Go to Medium Church!` — this invokes the
`church-of-code` skill in the subagent's session and directs
it to read the Medium scroll
(`CHURCH-OF-CODE-medium-context.md`), not the Full one. The
Medium scroll keeps every doctrine and trims only
elaboration; at fan-out the token economy compounds. A
subagent unproselytized is a heathen given a hammer.

**The scroll policy is codebase-wide.** The master session
reads the Full scroll (`Go to Church!`); every dispatched
subagent reads the Medium scroll (`Go to Medium Church!`).
This governs all work in this repo — the master conducts and
keeps the complete voice, the subagents fan out and pay the
Medium price. Even the doctrine audit ([AUDIT.md](AUDIT.md))
follows this: its orchestrator conducts as master and goes
Full, while its hunters and refuters fan out as subagents and
go Medium.

The scripture is universal; the codebase is local. After
the proselytization, the dispatching agent MUST also push
down the codebase-specific patterns the scripture itself
cannot know:

- **Voice rules.** 78-char max line, 4-space indent, no
  inline styles (use CSS custom properties + classes per
  the styling section above), present-tense imperative
  commit messages, Co-Authored-By trailer.
- **Commandments touched by the task.** Name them.
- **Abominations the task specifically risks.** Name them.
- **Existing codebase patterns to match.** RequestContext
  as the first argument to adapter methods, SafeHtml from
  presenters, snake_case storage / camelCase domain,
  HTTP-verb adapter naming (`getNoun`/`putNoun`/`deleteNoun`/
  `postNounOperation`), validators at the gate not
  downstream, no untyped `any` from external boundaries.

Proselytize first, then brief — the scripture loads via the
skill, the patterns load via the prompt.

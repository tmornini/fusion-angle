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
file at the repo root except [TEST-PLAN.md](TEST-PLAN.md) — exempted
because each test case bullet is meant to scan as one
self-contained line. Finally it runs the
`generate-schema-svg --check` gate, which fails on
`SCHEMA.svg` drift from the schema of record (`api/db.ts` +
`api/types.ts`).

For what each test layer covers, see `## Testing`.

## TypeScript

Target: **ES2024** · Strict mode with
`noUncheckedIndexedAccess`. Config at
`web-app/app/tsconfig.json`. The `compose.ts` build script
is excluded from type checking (it runs in Node).

## Architecture

**Vanilla TypeScript** with zero runtime dependencies.
Enterprise innovation management platform with modules for
ideas, projects, members, flows, workbox, and analytics.
Every page is a standalone HTML file served via HTTP. The
code also supports `file:///` protocol locally, but testing
is HTTP-only.

### Key Layers

- **HTML Composition.** `web-app/app/compose.ts` assembles
  `components-layout.html` + `component-*.html` + each page's
  `index.html` into composed standalones in a temp build dir.
  Standalone pages are copied directly.
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
  a Bearer gate in `handleRequest` enforces them, backed by
  token-lifecycle + revocation ledgers and PBKDF2 password
  hashing. The HMAC key is client-shipped, so isolation is
  demo-grade until the server tier.
- **Tenancy.** Every authenticated request runs org-scoped:
  `handleRequest` wraps the adapter in `orgScopedAdapter`
  bound to the org from the VERIFIED token claim (never the
  path). A flat (un-exchanged) token resolves its org via
  `identityDefaultOrg`: the identity's SET default org
  (`identity_default_orgs` ledger, latest wins), else its
  PRIMARY membership org, else a 403 — there is no global
  default. `organizations` is the tenant root; `memberships`
  joins identity↔org; the members roster is derived from that
  ledger. A `memberships` row is created when an invitee
  ACCEPTS an `invitations` grant (the only live membership
  write; `web-app/app/adapters/invitations.ts` + the
  `invitations` facade in `api/api.ts`) — accept stamps the
  INVITATION's org, not the caller's active org. Per-org roles
  via `currentRolesForInOrg`. See [SCHEMA.md](SCHEMA.md) /
  [ARCHITECTURE.md](ARCHITECTURE.md).
- **Data.** REST-style API (`api/`) over IndexedDB. Adapters
  in `web-app/app/adapters/` shape rows for pages.
- **Presentation.** Presenters in `web-app/app/presenters/` emit
  `SafeHtml`.
- **Database.** IndexedDB (`api/backend-indexeddb.ts`): one
  object store per table (`keyPath: 'id'`) plus a `__schema__`
  marker store, at version 1. Every store op crosses the
  `StorageBackend` transaction seam (`api/db.ts`) — a real
  `IDBTransaction` that commits on `oncomplete` and aborts on a
  thrown body. The memory + localStorage backends simulate the
  same transaction (buffer then flush) for the automated suite
  and the demo tier. The `states` table is the unified
  append-only event log — storage truth and the state
  alphabets in [SCHEMA.md](SCHEMA.md).
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

**Dialog pattern.** Use `openDialog(id)` / `closeDialog(id)`
from `core.ts`. Requires matching HTML elements:
`id="{id}-backdrop"` (with `class="dialog-backdrop hidden"`)
and `id="{id}-dialog"` (with `class="dialog hidden"
aria-hidden="true"`). Helpers manage visibility, ARIA
attributes, and focus.

**Tab pattern.** Use `initTabs('[data-tab]', '.tab-panel')`
from `core.ts`. Tab buttons use `data-tab="{name}"`
attribute, panels use `id="tab-{name}"`.

### Design System

See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). Key invariant: do
not use raw hex colors in CSS; use `hsl(var(--token))`.
Icons are ~100 inline SVG functions in
`web-app/app/icons.ts`.

**Heat ramp.** See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) § Heat ramp.

### Mobile Responsiveness

CSS media queries in `web-app/app/styles/responsive.css`
show/hide desktop vs mobile header and sidebar. Mobile
sidebar uses Sheet (slide-in drawer) toggled by JS.
Breakpoints: sm 640px, md 768px, lg 1024px, xl 1280px.

## Project Structure

`api/` — REST routing, DB adapter interface, mock data,
validators, plus the auth/authz/tenancy spine:
`authentication.ts` (OAuth grants), `access-token.ts` (JWT
mint/verify), `authorization.ts` (per-org roles),
`db-org-scoped.ts` / `store-org-scoped.ts` (the org fence),
and the identity/organizations/memberships stores.
`web-app/app/` — all source (TypeScript + CSS), with
subdirectories `adapters/` (data-access + platform shims, both
kinds share the folder), `presenters/` (presenter classes
producing `SafeHtml`), and `styles/` (cascade-ordered CSS
modules); `org-switcher.ts` is the sidebar-footer org
`<select>` (multi-org only) and `core.ts` scopes boot to the
active org. `invitations.ts` is the invitation adapter; the
top-bar pending-invitations bell lives in
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
no devDependencies. Tests cover
pure modules, flow-edit business logic and the connection-
validation rules (`tests/flow-operations.test.ts`), the flow
version/query adapters, every data adapter (including
`adapters-members-union.test.ts` for the member union seam
and `adapters-flow-publish.test.ts` for
`validateFlowForCreation` / `getFlowsForCreation`), the
workbox inbox aggregation, the mermaid round-trip,
in-browser ZIP, snapshot import-validation/quota/atomic-import,
the memory + localStorage transaction backends
(`backend-tx-memory`, `backend-tx-localstorage`), the tx
runners and view, the org-fence-in-tx, the commit batch route,
api routing, navigation, mock-data validity, the two-tier
hazard predicate (`tests/flow-graph-hazard.test.ts` covers
`shouldShowMemberHazard`), and the SafeHtml output of the
presenters (`presenter-member-detail.test.ts` checks the AI
variant renders its model and skill focus); the
automated suite also covers `flow-stats-aggregate`
(pure heat / sojourn / path /
clan math), `adapters-flow-stats` (the read-only adapter
via `MemoryDbAdapter`), `presenter-flow-stats` (the SafeHtml
shape — including the *absence* of editor affordances), and
`duration-units` (the compact ascending-unit duration
formatter), and the invitation lifecycle
(`adapters-invitations.test.ts` for grant/accept/decline/
revoke + derive-from-states, `api-invitations-fence.test.ts`
for the org fence + authz, `presenter-invitation-list.test.ts`
for the SafeHtml) — see `tests/` for the current set.
`api/db-memory.ts` provides an in-memory `DbAdapter` so
adapter and api-layer tests run without `localStorage`.

Run via `./validate` (which also type-checks and lints) or
directly: `node --test --strip-types tests/*.test.ts`.

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
  parsing). Falls back to a 5 MB hard cap when
  `navigator.storage.estimate()` is unavailable.
- **Snapshot import is atomic (wipe-on-fail retired).** On
  IndexedDB the clear+put runs in one `IDBTransaction` — it
  commits whole or aborts whole, so a failed import leaves
  prior data intact with no manual wipe. Validators run at the
  gate (`parseAndValidateSnapshot`, `scanForRetiredKeys`,
  quota pre-flight) BEFORE the transaction. The simulated
  localStorage tier rolls back logic errors the same way, but
  its multi-key flush is still not OS-atomic on a mid-write
  quota error — the one gap IndexedDB closes.
- **`file:///` protocol.** Page URLs use relative paths.
  Code supports `file:///` locally but testing is HTTP-only.
- **View Transition aborts.** rapid programmatic navigation
  surfaces both `AbortError: Transition was skipped` and
  `InvalidStateError: Transition was aborted...` lines in
  console — Chromium throws both classes for the same root
  cause. Browser-internal (no app code calls
  `startViewTransition`); no app impact.
- **The states log is append-only by convention.**
  `StateStore.postEvent` only appends; the table never deletes.
  An entity's lifecycle reads as the latest event on its
  `entity_id`. Reversal is a *new* event with the new state,
  not an edit of the prior row. The split between
  entity-lifecycle event (state log) and relationship-row
  splice (`EntityStore.delete` on relationship rows like
  `state_field_values`) is the seam — read
  `api/store-entity.ts` and `api/store-state.ts` together to
  see both halves.
- **Cross-tab writes are safe (lost-update hazard closed).**
  IndexedDB gives each tab its own connection to one shared
  database, and an append is an O(1) `objectStore.put`, not a
  whole-table rewrite — so two tabs appending to `states`
  concurrently both survive (verified in-browser). A
  successful readwrite commit posts the touched table names
  over a `BroadcastChannel` (`adapters/broadcast-channel.ts`)
  so other tabs refresh; the poster is never echoed, so it
  does not double-refresh. Theme/sidebar still sync over
  `StorageEvent` (they stay in localStorage).
- **IndexedDB auto-commit constraint.** An `IDBTransaction`
  lives only while it has pending requests; awaiting any
  NON-IDB promise inside a `transaction(…)` body (a timer,
  fetch, gzip, HMAC) yields to a macrotask and the transaction
  commits early. So every `transaction(…)` body awaits ONLY
  row ops — validators, crypto, and compression run OUTSIDE
  the tx. Sync compute between row ops is fine.
- **`state_field_values.field_id` references
  `record_attributes.id`.** the column name predates Records
  and stays until a second non-Record consumer arrives. The
  semantic note lives in [SCHEMA.md](SCHEMA.md) §
  state_field_values.

## Commits

Commit completed, tested work. Do not ask.

## Worktrees

Do not use git worktrees. Work directly in the main checkout.
Worktrees fragment review surface, hide state from the
working tree, and add ceremony without buying isolation that
small focused commits don't already provide.

## Subagents

Subagents inherit no scripture and read no CLAUDE.md by
default. Every subagent prompt MUST begin with the literal
phrase `Go to Church!` — this invokes the `church-of-code`
skill in the subagent's session, loading the full scripture
before the work begins. A subagent unproselytized is a
heathen given a hammer.

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

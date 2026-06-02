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
./serve <port>         # Build + start local HTTP server on <port>
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

When running under the Claude Code sandbox, the defaults
above fail two ways: `/tmp/` is not writable, and the tsx IPC
pipe used by the `npx tsx` step inside `./build` lands in
`$TMPDIR/tsx-501/…` which is outside the sandbox's allowed
Unix-socket path (`/tmp/claude/tsx-501`). Use this invocation
instead:

```bash
TMPDIR=/tmp/claude ./serve 8080
# open http://localhost:8080/landing/index.html
```

`TMPDIR=/tmp/claude` redirects both tsx's IPC socket and
`./serve`'s temp build dir into the sandbox-allowed path.
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
self-contained line.

For what each test layer covers, see `## Testing`.

## TypeScript

Target: **ES2024** · Strict mode with
`noUncheckedIndexedAccess`. Config at
`web-app/app/tsconfig.json`. The `compose.ts` build script
is excluded from type checking (it runs in Node).

## Architecture

**Vanilla TypeScript** with zero runtime dependencies.
Enterprise innovation management platform with modules for
ideas, projects, workers, flows, workbox, and analytics.
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
- **Auth.** Mock, returns `demo@example.com`.
- **Data.** REST-style API (`api/`) over localStorage. Adapters
  in `web-app/app/adapters/` shape rows for pages.
- **Presentation.** Presenters in `web-app/app/presenters/` emit
  `SafeHtml`.
- **Database.** localStorage with JSON serialization; each
  table is a `fusion-ai:tableName` key. The `states` table is
  the unified append-only event log — storage truth and the
  state alphabets in [SCHEMA.md](SCHEMA.md).
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
validators. `web-app/app/` — all source (TypeScript + CSS), with
subdirectories `adapters/` (data-access + platform shims, both
kinds share the folder), `presenters/` (presenter classes
producing `SafeHtml`), and `styles/` (cascade-ordered CSS
modules).
`web-app/{dashboard,workbox,ideas,projects,flows,workers,...}/`
— page directories registered in `PAGE_REGISTRY` (sidebar-layout
+ standalone). `billing/` is a stub.

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
`adapters-workers-union.test.ts` for the worker union seam
and `adapters-flow-publish.test.ts` for
`validateFlowForCreation` / `getFlowsForCreation`), the
workbox inbox aggregation, the mermaid round-trip,
in-browser ZIP, snapshot import-validation/quota/wipe-on-fail,
api routing, navigation, mock-data validity, the two-tier
hazard predicate (`tests/flow-graph-hazard.test.ts` covers
`shouldShowWorkerHazard`), and the SafeHtml output of the
presenters (`presenter-worker-detail.test.ts` checks the AI
variant renders its model and skill focus); the
automated suite also covers `flow-stats-aggregate`
(pure heat / sojourn / path /
clan math), `adapters-flow-stats` (the read-only adapter
via `MemoryDbAdapter`), `presenter-flow-stats` (the SafeHtml
shape — including the *absence* of editor affordances), and
`duration-units` (the compact ascending-unit duration
formatter) — see `tests/` for the current set.
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

## Gotchas

- **`noUncheckedIndexedAccess`.** tsconfig enables this —
  array/object index access returns `T | undefined`,
  requiring explicit `!` assertions or guards.
- **ES2024 target.** No transpilation. Native
  `Object.groupBy()`, `Map.groupBy()` are available. Assumes
  modern browser.
- **`withLoadingState()` returns null.** Returns `null` on
  error AND when data is empty with an `emptyState` config —
  callers must check for null before using the result.
- **Cross-tab theme sync.** `state.ts` listens to
  `StorageEvent` and syncs theme changes across browser tabs
  automatically.
- **Non-critical writes logged at warn.** localStorage writes
  for theme and sidebar state are wrapped in try/catch that
  log at `warn` level — quota errors don't break the app but
  are observable via the logger.
- **Snapshots wipe-first.** All snapshot operations
  (pristine, mock data, import) call
  `DELETE('snapshots/schema')` before writing — there is no
  merge, only replace.
- **Snapshot quota pre-flight.** `putSnapshotFromFile`
  consults `navigator.storage.estimate()` and rejects with
  `SnapshotTooLargeError` if `file.size` exceeds half of
  `quota - usage` (the import doubles peak memory while
  parsing). Falls back to a 5 MB hard cap when
  `navigator.storage.estimate()` is unavailable.
- **Snapshot wipe-on-fail.** With pre-flight quota checks +
  per-row validation + column-level compression, mid-write
  failure is rare; when it does happen, `importSnapshot`
  wipes every `fusion-ai:<table>` key so the next bootstrap
  detects no schema and routes the user to the snapshots
  page to re-import. No backup, no sentinel, no rollback —
  real atomicity arrives with Postgres.
- **`file:///` protocol.** Navigation detects file protocol
  and skips link prefetching. Page URLs use relative paths.
  Code supports `file:///` locally but testing is HTTP-only.
- **View Transition aborts.** rapid programmatic navigation
  surfaces both `AbortError: Transition was skipped` and
  `InvalidStateError: Transition was aborted...` lines in
  console — Chromium throws both classes for the same root
  cause. Browser-internal (no app code calls
  `startViewTransition`); no app impact.
- **The states log is append-only by convention.**
  `StateStore.record` only appends; the table never deletes.
  An entity's lifecycle reads as the latest event on its
  `entity_id`. Reversal is a *new* event with the new state,
  not an edit of the prior row. The split between
  entity-lifecycle event (state log) and relationship-row
  splice (`EntityStore.delete` on relationship rows like
  `state_field_values`) is the seam — read
  `api/store-entity.ts` and `api/store-state.ts` together to
  see both halves.
- **Cross-tab writes to the states log can lose updates.**
  Each browser tab builds its own `LocalStorageDbAdapter`, so
  the per-store serializer (`createSerializer`) only orders
  writes *within* one tab. Two tabs — or parallel browser
  agents — writing the shared `fusion-ai:states` key
  concurrently both read v0; the second `setItem` overwrites
  the first. Within one tab there is no race (proven by the
  green `concurrent puts to same store` test in
  `db-localstorage-compression.test.ts`). An in-memory mutex
  cannot fix this — the tabs share no heap — so only a
  browser-mediated lock (Web Locks) or the Postgres tier can.
  Parallel test agents must treat the states log as a
  shared-write hazard. Real atomicity arrives with Postgres.
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
  as the only argument to adapter methods, SafeHtml from
  presenters, snake_case storage / camelCase domain,
  HTTP-verb adapter naming (`getNoun`/`putNoun`/`deleteNoun`/
  `postNounOperation`), validators at the gate not
  downstream, no untyped `any` from external boundaries.

Proselytize first, then brief — the scripture loads via the
skill, the patterns load via the prompt.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Alignment

**Match the codebase's voice, or change the codebase.** A better
pattern earns its place by replacing every site of the old one —
never by living beside it. One codebase, one voice. The snowflake
is a sin against Uniformity (Commandment III).

## Build & Dev Commands

```bash
./test                 # Run automated tests
./validate             # Type-check + tests + lint (works on dirty tree)
./build                # Compile, bundle, minify, ZIP to ~/Desktop/
./build --no-zip dir/  # Bundle to dir/ without zipping (for testing)
./build dir/           # ZIP to dir/ instead of ~/Desktop/
./build --help         # Show usage
./serve <port>         # Build + start local HTTP server on <port>
```

**Always commit before building.** `./build` requires a clean working directory. Use `./validate` to catch type errors and lint issues before committing, then commit, then build.

**Build and test locally:**

```bash
./serve 8080
# open http://localhost:8080/landing/index.html
```

**When running under the Claude Code sandbox**, the defaults above fail two ways: `/tmp/` is not writable, and the tsx IPC pipe used by the `npx tsx` step inside `./build` lands in `$TMPDIR/tsx-501/…` which is outside the sandbox's allowed Unix-socket path (`/tmp/claude/tsx-501`). Use this invocation instead:

```bash
TMPDIR=/tmp/claude ./serve 8080
# open http://localhost:8080/landing/index.html
```

`TMPDIR=/tmp/claude` redirects both tsx's IPC socket and `./serve`'s temp build dir into the sandbox-allowed path. `localhost` is reachable from the sandbox, so the Chrome MCP tools can drive the page normally.

`./validate` runs `tsc --noEmit` (type checking), then `./test` (automated tests against pure modules and the `api/`/`adapters/` layer, via `node --test --strip-types tests/*.test.ts`), then enforces 78-character maximum line length on all `.ts`, `.html`, and `.css` files (excluding `compose.ts`).

Automated tests cover pure modules and adapter behavior; UI behavior is still covered by the manual browser regression protocol — see `## Testing` below.

## TypeScript

Target: **ES2024** · Strict mode with `noUncheckedIndexedAccess`. Config at `web-app/app/tsconfig.json`. The `compose.ts` build script is excluded from type checking (it runs in Node).

## Architecture

**Vanilla TypeScript** with zero runtime dependencies. Enterprise innovation management platform with modules for ideas, projects, teams, flows, workbox, and analytics. Every page is a standalone HTML file served via HTTP. The code also supports `file:///` protocol locally, but testing is HTTP-only.

### Key Layers

- **HTML Composition**: `web-app/app/compose.ts` assembles
  `components-layout.html` + `component-*.html` + each page's
  `index.html` into composed standalones in a temp build dir.
  Standalone pages are copied directly.
- **Navigation**: `<a href>` between pages. `navigateTo(page,
  params?)` builds relative URLs.
- **Page Detection**: `<html data-page="dashboard">` →
  `PAGE_REGISTRY` lookup → page module's `init()`.
- **Source = Output Alignment**: `PAGE_REGISTRY` declares
  `sourceDir` and `sourceFile`. Both `compose.ts` and
  `navigateTo()` resolve output as
  `{sourceDir}/{sourceFile}.html` — the file you edit is the
  file the browser loads.
- **Auth**: Mock, returns `demo@example.com`.
- **Data**: REST-style API (`api/`) over localStorage. Adapters
  in `web-app/app/adapters/` shape rows for pages.
- **Presentation**: Presenters in `web-app/app/presenters/` emit
  `SafeHtml`.
- **Database**: localStorage with JSON serialization. Each table
  is a `fusion-ai:tableName` key. Deletion uses a single
  `fusion-ai:deleted` tombstone table; entity rows never carry
  `deleted_at`. History stores hard-delete via splice. When no
  schema exists, non-entry pages redirect to snapshots.
- **State**: Module-level vars + pub-sub for theme, mobile, auth,
  sidebar.
- **Durations**: Persisted in seconds; UI displays days via
  `durationInDays(seconds)`.

### Flow Canvas

The Flow Designer (`flows/detail.html`) renders an SVG canvas
with pan, marquee, drag, and edge connection. Layers:
`flow-layout.ts` (Sugiyama layout), `flow-graph.ts` (SVG render),
`flow-interactions.ts` (pointer/keyboard state machines —
discriminated unions, pan needs Space+mousedown),
`mermaid-{generate,parse}.ts` (round-trip text format),
`zip.ts` (in-browser ZIP). Integration point:
`adapters/flow-export.ts`.

### API Layer (`/api`)

`api/types.ts` (row types + shared aliases), `api/db.ts`
(`DbAdapter` interface), `api/db-localstorage.ts` (production
impl), `api/db-memory.ts` (test impl), `api/api.ts` (pure HTTP
routing — `GET/PUT/DELETE/POST` helpers, **no module-level
adapter; threaded explicitly**), `api/mock-data.ts`,
`api/validators.ts`. The `DbAdapter` interface is the migration
seam to Postgres.

The composition root is `web-app/app/adapters/init.ts`.
`createFetchContext()` defaults to the LocalStorage adapter;
tests pass `createFetchContext(db)` with a `MemoryDbAdapter`.

### Page Module Pattern

Every entry in `PAGE_REGISTRY` declares both `sourceDir` and `sourceFile` explicitly (e.g., `flow-detail` → `web-app/flows/detail.ts` + `web-app/flows/detail.html`). The most common values are `index`, `detail`, `create`, `convert`, and the named `organization/` files (`users`, `activity-feed`, `onboarding`). Each page module exports:
- `init(): Promise<void>` — fetches data, populates DOM placeholders, binds event listeners

Sidebar-layout pages have `index.html` containing page content that gets composed with the layout template. Standalone pages have a complete hand-written `index.html` with a `<div id="page-root">` that `init()` renders into.

### Presenter Pattern

Presenters in `web-app/app/presenters/` are immutable view
objects: constructor takes the full data shape, methods return
`SafeHtml`. Page modules instantiate them and inject the result
into the DOM — presenters never touch the DOM, never fetch,
never mutate.

Editable detail views split into two presenters: a read presenter
(takes the entity) and an `*Edit` presenter (takes entity + draft
shape). The page module owns a `PageState` discriminated union
(`{kind: 'reading'} | {kind: 'editing', draft}`) and constructs
the appropriate one per render. This pattern applies to `Idea`,
`Profile`, `Company`, and `ProjectDetail`.

`presenters/index.ts` is the barrel; page modules import from
`'../app/presenters'`. `WorkboxDetailPresenter` uses a public
`buildPage()` orchestrating private `#build*` helpers; the rest
expose `build*` directly.

### Import Conventions

Page modules import directly from source modules, not through a barrel:

```typescript
import { $ } from '../app/dom';
import { html, setHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import { buildSkeleton, buildErrorState } from '../app/loading-states';
import { iconPlus, iconTrash } from '../app/icons';
import { navigateTo, openDialog, closeDialog } from '../app/core';
```

`core.ts` re-exports from `format.ts`, `navigation.ts`, and `dialog.ts` so page modules can import `navigateTo`, `initials`, `durationInDays`, `formatDateTime`, `formatCompactCurrency`, `SECONDS_PER_DAY`, `openDialog`, `closeDialog`, `initTabs` from `'../app/core'`. The `adapters/` directory retains its barrel re-export (`adapters/index.ts`).

**Page modules never import from `api/api.ts`** — all data access (reads and writes) goes through the adapter layer (`adapters/`). Only adapter modules import from the API layer directly.

### Naming Conventions

- `mutate*` — finds existing DOM and updates it (side-effecting,
  distinct from `build*` which constructs and returns)
- `toneFor*` / `levelFor*` — return string enums consumed as
  `data-tone` / `data-level` attribute values (replaces older
  `styleFor*` inline-style pattern)
- `assert*` — Telling-shape validators in `api/types.ts` and
  `api/validators.ts` that take a raw value and return a typed
  value or throw. The `is*` type-guards remain for legitimate
  type-narrowing call sites.
- Adapter functions use **domain nouns** (`getIdea`, not
  `getIdeaEntity`) — return type already communicates shape.

### Adapter Conventions

- **`userName(userMap, userId: Id)`** throws on both missing and
  unknown userId. Optional user references must branch at the
  call site (`leadRow ? userName(...) : ''`) — never overload
  `userName` with a fallback. UI renders `'—'` via
  `DISPLAY_ABSENT` for legitimately absent values. Never use
  magic strings like `'Unknown'`.
- **`FetchContext` is the only I/O surface.** Every data-access
  adapter takes `ctx: FetchContext` first and uses
  `ctx.GET/PUT/DELETE/POST/commit`. The standalone `GET/PUT/...`
  exports in `api/api.ts` are the transport `ctx` delegates to —
  adapters never import them directly. A ctx executes against an
  immutable snapshot: `ctx.getUserMap()`, `ctx.getIdeaRows()`,
  etc. are memoized for its lifetime so multiple adapter calls
  see the same view.
- **Platform-shim vs data-access adapters share `adapters/`.**
  Data-access adapters (`ideas.ts`, `flow-queries.ts`, etc.)
  fetch entity data through `ctx`. Platform shims
  (`clipboard.ts`, `viewport.ts`, `location.ts`,
  `crypto-safe-base62.ts`, etc.) wrap browser primitives so the
  app speaks one voice. Tiny shims are not a smell — they are
  the divorce point.

### Dark Mode

CSS custom properties on `:root` (light) and `[data-theme="dark"]` (dark). Toggle persists to `localStorage` and carries across page navigation. Supports system preference detection via `prefers-color-scheme`.

## UI & Styling

### CSS-first styling

All styling lives in `web-app/app/styles/`. Inline `style="..."`
strings are forbidden except:

1. **Dynamic per-element values** (progress widths, fill
   percentages) — passed via CSS custom properties:
   `style="--progress-fill:${value}%"` consumed by a CSS rule
   reading `var(--progress-fill, 0%)`. The value is **data**,
   not styling.
2. **Bootstrap fallbacks** in `database-init.ts` — error UI
   before CSS may have loaded, marked with a file-header
   comment.

The variant pattern is `data-tone` / `data-level` attributes on
a base class. The TS enum and the CSS attribute selector share
one source of truth.

When extending CSS: components.css for patterns appearing in 3+
files; pages.css for page-scoped patterns; utilities.css for
single-property primitives. Never use raw hex colors — always
`hsl(var(--token))`.

### Component Library

All UI components are vanilla HTML/CSS with ARIA attributes, defined as CSS classes in `web-app/app/styles/` and helper functions across `web-app/app/` modules. No external component library.

**Dialog pattern**: Use `openDialog(id)` / `closeDialog(id)` from `core.ts`. Requires matching HTML elements: `id="{id}-backdrop"` (with `class="dialog-backdrop hidden"`) and `id="{id}-dialog"` (with `class="dialog hidden" aria-hidden="true"`). Helpers manage visibility, ARIA attributes, and focus.

**Tab pattern**: Use `initTabs('[data-tab]', '.tab-panel')` from `core.ts`. Tab buttons use `data-tab="{name}"` attribute, panels use `id="tab-{name}"`.

### Design System

See `DESIGN-SYSTEM.md`. Key invariant: never use raw hex colors
in CSS — always `hsl(var(--token))`. Icons are ~100 inline SVG
functions in `web-app/app/icons.ts`.

### Mobile Responsiveness

CSS media queries in `web-app/app/styles/responsive.css` show/hide desktop vs mobile header and sidebar. Mobile sidebar uses Sheet (slide-in drawer) toggled by JS. Breakpoints: sm 640px, md 768px, lg 1024px, xl 1280px.

## Project Structure

`api/` — REST routing, DB adapter interface, mock data,
validators. `web-app/app/` — all source (TypeScript + CSS), with
subdirectories `adapters/` (data-access + platform shims, both
kinds share the folder), `presenters/` (presenter classes
producing `SafeHtml`), and `styles/` (cascade-ordered CSS
modules). `web-app/{dashboard,workbox,ideas,projects,flows,...}/`
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

Two layers, both zero-dependency:

**Automated tests** (Node's built-in `node:test` runner with
`--strip-types`, no devDependencies). Tests cover pure modules,
adapters, and api routing — see `tests/` for the current set.
`api/db-memory.ts` provides an in-memory `DbAdapter` so adapter
and api-layer tests run without `localStorage`.

Run via `./validate` (which also type-checks and lints) or
directly: `node --test --strip-types tests/*.test.ts`.

**Manual browser regression** for UI behavior: a pass against
`TEST-PLAN.md` (254 cases), driven either by a single human
tester serially or by Claude Code agents in parallel via the
`claude-in-chrome` MCP. Anything DOM-driven (gestures, layout,
visual rendering) lives here. Pure transitions, adapters, and
API routing live in the automated suite.

### Six-phase parallel protocol

Agents execute the plan in six phases to fit within context and
time budgets while keeping per-entity mutation domains disjoint:

1. **Phase 0 — Preflight** (main): `./validate`, `./build` to
   produce the distribution ZIP, `./build --no-zip` for the test
   server, start HTTP server, open tab 0. Covers A1–A5.
2. **Phase 1 — Data setup** (one agent, serial): AA1–AA43 in
   tab 0. Creates pristine environment, users, ideas, projects,
   one flow. Populates the shared database that Phase 2
   verifies.
3. **Phase 2 — Parallel verification** (7 agents concurrent,
   each in its own tab, no shared tabs):
   - Agent-B — Entry pages (B1–B16)
   - Agent-CH — Dashboard + Reference (C1–C7, H1–H2), read-only
   - Agent-D — Ideas (D1–D37)
   - Agent-E — Projects (E1–E11)
   - Agent-F — Flows (F1–F46)
   - Agent-F2 — Workbox (WB1–WB19)
   - Agent-G — Admin (G1–G29, G36–G37; skip G30–G35)
4. **Phase 3 — Cross-cutting** (one agent, alone): I1–I28.
   Mutates global UI state (theme, sidebar, command palette) —
   no concurrent agents.
5. **Phase 4 — Snapshot lifecycle** (one agent, alone):
   G30–G35. Wipes and reloads the database — strictly last
   before teardown.
6. **Phase 5 — Teardown** (main): stop HTTP server, remove
   build directory, verify distribution ZIP remains, aggregate
   results.

### Entity mutation domain scoping

Phase 2 agents share one localStorage but each owns a disjoint
subset of tables:

| Agent | Mutation domain |
|---|---|
| Agent-B | creates one user via signup |
| Agent-D | `ideas` |
| Agent-E | `projects` (plus one flow via E7) |
| Agent-F | `flows`, `flow_versions` |
| Agent-F2 | `work_orders`, `work_order_transitions`, `work_order_claims`, plus its own private flow in `flows`/`flow_versions` |
| Agent-G | `users`, `teams`, `profile`, `company` |
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

### Known MCP limitations

- **Flow designer gestures** (port drag, shift-drag to connect,
  marquee select): synthetic PointerEvents do not reliably
  drive the `flow-interactions.ts` state machines because they
  use pointer-capture semantics. Affected tests include
  AA27–AA34, F15, F19–F23, D36, D37, E11. Work around by
  validating end-state via direct JSON injection into
  `fusion-ai:flows`, then reloading and verifying render. Mark
  BLOCKED if neither path confirms behavior.
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

### Serial single-tester mode

The same TEST-PLAN.md runs serially by one human in one browser
following document order (A → AA → B → C → D → E → F → F2 → G
→ H → I → J). The agent-scoped mutation domains and tolerance
patterns apply only to the parallel run.

## Gotchas

- **`noUncheckedIndexedAccess`**: tsconfig enables this — array/object index access returns `T | undefined`, requiring explicit `!` assertions or guards.
- **ES2024 target**: No transpilation. Native `Object.groupBy()`, `Map.groupBy()` are available. Assumes modern browser.
- **`withLoadingState()` returns null**: Returns `null` on error AND when data is empty with an `emptyState` config — callers must check for null before using the result.
- **Cross-tab theme sync**: `state.ts` listens to `StorageEvent` and syncs theme changes across browser tabs automatically.
- **Non-critical writes logged at warn**: localStorage writes for theme and sidebar state are wrapped in try/catch that log at `warn` level — quota errors don't break the app but are observable via the logger.
- **Snapshots wipe-first**: All snapshot operations (pristine, mock data, import) call `DELETE('snapshots/schema')` before writing — there is no merge, only replace.
- **Snapshot quota pre-flight**: `putSnapshotFromFile` consults `navigator.storage.estimate()` and rejects with `SnapshotTooLargeError` if `file.size` exceeds half of `quota - usage` (the import doubles peak memory while parsing). Falls back to a 5 MB hard cap when `navigator.storage.estimate()` is unavailable.
- **Snapshot wipe-on-fail**: With pre-flight quota checks + per-row validation + column-level compression, mid-write failure is rare; when it does happen, `importSnapshot` wipes every `fusion-ai:<table>` key so the next bootstrap detects no schema and routes the user to the snapshots page to re-import. No backup, no sentinel, no rollback — real atomicity arrives with Postgres.
- **Availability thresholds**: `AVAILABILITY_HIGH = 70`, `AVAILABILITY_LOW = 40`.
- **`file:///` protocol**: Navigation detects file protocol and skips link prefetching. Page URLs use relative paths. Code supports `file:///` locally but testing is HTTP-only.
- **View Transition aborts**: rapid programmatic navigation surfaces `InvalidStateError` lines in console. Browser-internal (no app code calls `startViewTransition`); no app impact.

## Worktrees

Use `/tmp/claude` as the worktree directory for isolated feature work.

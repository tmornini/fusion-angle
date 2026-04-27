# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
./validate             # Type-check + lint (works on dirty tree)
./build                # Compile, bundle, minify, ZIP to ~/Desktop/
./build --no-zip dir/  # Bundle to dir/ without zipping (for testing)
./build dir/           # ZIP to dir/ instead of ~/Desktop/
./build --help         # Show usage
```

**Always commit before building.** `./build` requires a clean working directory. Use `./validate` to catch type errors and lint issues before committing, then commit, then build.

**Build and test locally:**

```bash
./build --no-zip /tmp/fusion-test/
cd /tmp/fusion-test/ && python3 -m http.server 8080
# open http://localhost:8080/landing/index.html
```

**When running under the Claude Code sandbox**, the defaults above fail two ways: `/tmp/` is not writable, and the tsx IPC pipe used by the `npx tsx` step inside `./build` lands in `$TMPDIR/tsx-501/…` which is outside the sandbox's allowed Unix-socket path (`/tmp/claude/tsx-501`). Use this invocation instead:

```bash
TMPDIR=/tmp/claude ./build --no-zip ~/Desktop/fusion-test/
cd ~/Desktop/fusion-test/ && python3 -m http.server 8080
# open http://localhost:8080/landing/index.html
```

`~/Desktop/` is in the sandbox write allowlist; `TMPDIR=/tmp/claude` redirects tsx's IPC socket into the allowed path. `localhost` is reachable from the sandbox, so the Chrome MCP tools can drive the page normally.

`./validate` runs `tsc --noEmit` (type checking) then enforces 78-character maximum line length on all `.ts`, `.html`, and `.css` files (excluding `compose.ts`).

No unit test framework is configured; see `## Testing` below for the manual browser regression protocol.

## TypeScript

Target: **ES2024** · Strict mode with `noUncheckedIndexedAccess`. Config at `web-app/app/tsconfig.json`. The `compose.ts` build script is excluded from type checking (it runs in Node).

## Architecture

**Vanilla TypeScript** with zero runtime dependencies.
This is an enterprise innovation management platform
with modules for ideas, projects, teams, flows,
workbox, and analytics. Every page is a standalone HTML file
served via HTTP. The code also supports `file:///`
protocol locally, but testing is HTTP-only.

### Key Layers

- **HTML Composition**: A build step
  (`web-app/app/compose.ts`) assembles
  `web-app/app/components-layout.html` (layout
  skeleton) with `component-*.html` files and each
  page's `index.html` to produce standalone composed
  `index.html` files in a temp build directory.
  5 standalone pages have hand-written HTML
  that is copied directly to the build output.
- **Navigation**: Standard `<a href>` links between pages. Parameterized pages use query strings (`?ideaId=1`). `navigateTo(page, params?)` helper constructs relative URLs for programmatic navigation.
- **Layout**: Sidebar-layout pages share a layout template with sidebar, header, search, and theme toggle. Mobile layout uses CSS media queries (not JS) to swap between desktop sidebar and mobile drawer.
- **Page Detection**: `page-registry.ts` defines `PAGE_REGISTRY` mapping page names to `'sidebar'` or `'standalone'` layout type. `<html data-page="dashboard">` attribute is read by JS on `DOMContentLoaded` to dispatch to the correct page module's `init()`. Pages with `sourceDir` in `PAGE_REGISTRY` have source files at a different path than their page name.
- **Source = Output Alignment**: Build output paths always use the registry's `sourceDir` and `sourceFile` (both are required fields on `PageEntry`). Both `compose.ts` and `navigateTo()` resolve output as `{sourceDir}/{sourceFile}.html`. So a page registered as `flow-detail` with `sourceDir: 'flows'` and `sourceFile: 'detail'` produces output at `flows/detail.html`, and `navigateTo('idea-detail')` generates `../ideas/detail.html` because `idea-detail` has `sourceDir: 'ideas'`, `sourceFile: 'detail'`. This keeps the developer's mental model simple: the file you edit is the file the browser loads.
- **Auth**: Mock auth returning `demo@example.com`.
- **Data**: REST-style API layer (`api/`) backed by localStorage. The `web-app/app/adapters/` directory contains adapter functions across 16 modules (with barrel re-export) that call `GET()`/`PUT()`/`POST()` and convert normalized DB rows into the denormalized shapes pages expect.
- **Presentation**: The `web-app/app/presenters/` directory contains 15 presenter classes across 13 files (with barrel re-export) that wrap adapter-returned shapes and emit `SafeHtml`. Page modules instantiate presenters and call `build*` methods on them to produce markup — keeping rendering logic out of page modules and out of adapters.
- **Database**: localStorage with JSON serialization, persisted across page navigations. Each table is stored as a `fusion-ai:tableName` key containing a JSON array of row objects. Deletion is recorded in a single `fusion-ai:deleted` tombstone table whose rows are `{id, deleted_at}` — entity rows themselves never carry a `deleted_at` column. `EntityStore.getAll()`/`getById()` filter against `deleted.allDeletedIds()`; `EntityStore.delete(id)` writes a tombstone row. History stores (`flow_versions`) hard-delete via splice. When no schema exists (no `fusion-ai:*` keys in localStorage), non-entry pages redirect to snapshots so users can initialize the environment. A snapshots page provides create pristine environment, wipe and load mock data, upload snapshot, and download snapshot operations.
- **State**: Simple module-level variables + pub-sub pattern for theme (persisted to localStorage), mobile detection (matchMedia), auth, and sidebar state.
- **Durations**: All numeric durations are persisted in seconds. UI displays days via `durationInDays(seconds)` from `format.ts`.

### Flow Canvas

The "Flow Designer" page (`flows/detail.html`) renders an SVG canvas of a flow graph with pan, marquee selection, drag, and edge connection. Layers:

- **`flow-layout.ts`** — Sugiyama-style layered layout (`computeLayout()`), aspect-aware scaling, reachability and adjacency helpers. Exports node-size constants used by the renderer.
- **`flow-graph.ts`** — Pure SVG renderer that consumes a laid-out graph and emits nodes (ports, label boxes, start/complete decorations) and bezier edges (with bidirectional spread and dashed cycles).
- **`flow-interactions.ts`** — Discriminated-union state machines (`Selection`, `DragMode`, `ConnectMode`, `PanMode`, `MarqueeMode`) that the page module wires to pointer and keyboard events. Pan requires Space + mousedown.
- **`mermaid-generate.ts` / `mermaid-parse.ts`** — Round-trip between `FlowGraph` and Mermaid flowchart / stateDiagram text. Used by `adapters/flow-export.ts`.
- **`zip.ts`** — Minimal in-browser ZIP (DEFLATE + CRC-32) used to package a flow as a downloadable bundle.

`adapters/flow-export.ts` is the integration point: it calls `generateMermaid`, `parseMermaid`, `buildZip`, `getZipEntries`, `computeLayout`, and `computeEdgeLabelWidth` to produce `getFlowMermaid`, `getFlowZip`, `postFlowFromMermaid`, and `postFlowFromZip`.

### API Layer (`/api`)

The API layer is a set of TypeScript modules that provide a REST-style interface to the database:

- **`api/types.ts`** — Row types (snake_case) matching
  schema, shared type aliases (`Id`,
  `ConfidenceLevel`, `IdeaStatus`),
  `User` class wrapping `UserEntity`, and `toBool`
  utility
- **`api/db.ts`** — `DbAdapter` interface with `EntityStore<T>` and `SingletonStore<T>` patterns, plus `hasSchema()`/`createSchema()` lifecycle methods
- **`api/db-localstorage.ts`** — localStorage implementation with JSON serialization
- **`api/api.ts`** — `GET(resource)` / `PUT(resource, body)` / `DELETE(resource)` / `POST(resource, body)` URL routing
- **`api/mock-data.ts`** — Mock data seed payload + apply helper

The `DbAdapter` interface is designed for easy migration to Postgres or other backends — implement the same interface and swap the import.

### Page Module Pattern

Every entry in `PAGE_REGISTRY` declares both `sourceDir` and `sourceFile` explicitly (e.g., `flow-detail` → `web-app/flows/detail.ts` + `web-app/flows/detail.html`). The most common values are `index`, `detail`, `create`, `convert`, and the named `organization/` files (`users`, `activity-feed`, `onboarding`). Each page module exports:
- `init(): Promise<void>` — fetches data, populates DOM placeholders, binds event listeners

Sidebar-layout pages have `index.html` containing page content that gets composed with the layout template. Standalone pages have a complete hand-written `index.html` with a `<div id="page-root">` that `init()` renders into.

### Presenter Pattern

Presenters live in `web-app/app/presenters/` and wrap
adapter-returned shapes to produce `SafeHtml`. They are
the single place where rendering logic lives: page
modules fetch data via adapters, instantiate the
relevant presenter, and call `build*` methods on it to
generate the markup the page injects into the DOM.

- **Construction**: every presenter takes its full
  data shape in the constructor and is immutable.
  Example: `new IdeaPresenter(idea)` wraps an `Idea`
  and exposes `buildStatusBadge()`, `idForLink()`,
  `positionSortKey()`, etc. State transitions
  construct a *new* presenter — never mutate an
  existing one.
- **Edit mode is a separate presenter**: entities
  with editable detail views split into two
  classes — `IdeaPresenter` (read view, takes the
  entity) and `IdeaEditPresenter` (edit view, takes
  the entity plus a draft shape). The page module
  owns a `PageState` discriminated union
  (`{kind: 'reading'} | {kind: 'editing', draft}`)
  and constructs the appropriate presenter on each
  render. The same pattern applies to `Profile`,
  `Company`, and `ProjectDetail`.
- **No state beyond construction args**: presenters
  are pure view objects. They never fetch data, never
  mutate, and never touch the DOM directly. Page
  modules are responsible for the DOM; presenters are
  responsible for the HTML they hand over.
  *Exception:* `FlowDesignerPresenter` retains an
  internal `#state: DesignerState` field. The
  state's mutation surface has been narrowed
  significantly: every named transition lives in
  `flow-designer-actions.ts` as a pure `apply*`
  function (`applyMoveNodes`, `applyDragPreview`,
  `applyToggleLock`, `applyUpdateFlowName`,
  `applyAddNode`, `applyAddEdge`, `applyDeleteNodes`,
  `applyDeleteEdge`, `applyUpdateNode`,
  `applyUpdateEdge`, `applyAddField`,
  `applyDeleteField`, `applyAutoLayout`,
  `applyPanToRevealSelected`,
  `applyPanelTransition`); `FlowHistory` is an
  immutable value with free transition functions;
  `zoomToFit` in `flow-interactions.ts` returns a
  fresh `{ zoom, viewBox }` rather than mutating in
  place; the gesture FSM uses an `onPanelRequest`
  callback rather than mutating panel state. The
  remaining presenter methods are short adapters
  that call a pure transition and copy the result
  back into `#state`. Full type-level immutability
  (a `FlowSnapshot` constructor argument with the
  presenter reconstructed per render) remains
  pending — it would be a structural rewrite rather
  than a behavioral one, and needs manual
  regression coverage (F1–F46) that includes
  drag/connect/marquee gestures that synthetic
  PointerEvents cannot reliably drive.
- **Barrel**: `presenters/index.ts` re-exports every
  presenter class. Page modules import via
  `from '../app/presenters'`.
- **Shared helpers**: `presenters/ordered-keys.ts` is
  an internal helper used by several presenters; it is
  not itself a presenter and is not re-exported from
  the barrel.
- **File list** (presenter classes across the
  presenter files): `account`, `activity`, `flow`,
  `flow-designer`, `gauge`, `idea` (exports
  `IdeaPresenter` + `IdeaEditPresenter` +
  `IdeaListPresenter`), `idea-conversion`,
  `idea-create`, `profile` (exports `ProfilePresenter`
  + `ProfileEditPresenter`), `project` (exports
  `ProjectPresenter` + `ProjectListPresenter`),
  `project-detail` (exports
  `ProjectDetailPresenter` + `ProjectDetailEditPresenter`),
  `company` (exports `CompanyPresenter` +
  `CompanyEditPresenter`), `user`, `working-styles`,
  `workbox-inbox`, plus `index` (barrel),
  `ordered-keys` (helper), and `flow-designer-view`
  (helper for the flow designer page, exporting
  `build*` functions).

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

- `build*` — construct and return a value (data structure, HTML, chart)
- `mutate*` — find existing DOM element(s) and update their content (side-effecting)
- `init*` — set up event listeners and initial behavior
- `toneFor*` / `levelFor*` — map a status/value to a string enum (`'success' | 'warning' | 'error'` etc.) used as a `data-tone` or `data-level` attribute value. Replaces the older `styleFor*` pattern that returned inline-style strings.
- `compute*` — pure calculation returning a derived value
- `get*` — adapter functions that fetch and transform data (reads)
- `put*` — adapter functions that write entity data (writes)
- Adapter function names use **domain nouns** (`getIdea`, `putProject`), never internal type names like `Entity` — the return type already communicates the shape
- `deleteSchema`, `postSchemaCreation`, `postMockDataLoad`, `postBootstrap`, `putSnapshot`, `getSnapshot`, `getDataPresent` — snapshot lifecycle operations in `adapters/snapshots.ts`
- Boolean variables: `is*`, `has*`, `needs*` (use the prefix that reads naturally in English)
- Config objects: `Record<StatusType, { label, className }>` in `api/types.ts`

### Adapter Conventions

- **User-name resolution**: `userName(userMap, userId: Id)` throws on both missing and unknown userId. Parameter type is `Id`, not `Id | undefined` — a missing required reference is a bug, not a presentation case. Optional user references (a project with no lead yet, a work order with no transitions) must be modeled at the call site by branching on the upstream absence (`leadRow ? userName(...) : ''`), not by overloading `userName` with two policies. UI renders `'\u2014'` (em dash) via `DISPLAY_ABSENT` for legitimately absent values that the type system admits. Never use magical fallback strings like `'Unknown'`.
- **Absent values**: Use `null` for semantically absent values in adapter return types (e.g., `confidence: ConfidenceLevel | null`). Persisted noun entities never use `null`.
- **No module-level adapter caching**: Adapters never hold long-lived caches (`cachedUserMap` etc.). Module-level state introduces cross-request leakage and contradicts the "share memory by communicating" article of faith.
- **Request-scoped immutability via `FetchContext`**: A page-module `init()` may construct a `FetchContext` and thread it through multiple adapter calls so the *whole process executes against an immutable snapshot* of the underlying data. Motivation is idempotency and atomicity (Commandments VII and X), not performance: a process that reads `'users'` twice could see different data if another tab writes between the reads, breaking process atomicity. `ctx.getUserMap()` snapshots once and reuses; the ctx is constructed per request and discarded — never module-level. Adapters that need user data accept an optional `ctx?: FetchContext`; when omitted, they fetch fresh (backward-compatible default). When the backend migrates from localStorage to Postgres, this also avoids redundant database round-trips for free.
- **Shared helpers**: `adapters/shared.ts` exports cross-module utilities (`getUserMap`, `userName`, `getCurrentUser`, `AuthContext`, `FetchContext`, `createFetchContext`).

### Dark Mode

CSS custom properties on `:root` (light) and `[data-theme="dark"]` (dark). Toggle persists to `localStorage` and carries across page navigation. Supports system preference detection via `prefers-color-scheme`.

## UI & Styling

### CSS-first styling (no inline `style=""` strings)

All visual styling lives in CSS files under `web-app/app/styles/`. TypeScript presenters and page modules emit semantic class names plus `data-*` attributes for variants. Inline `style="..."` strings are forbidden except for two narrow cases:

1. **Dynamic per-element values** — values computed at render time from entity data (progress bar widths, animation durations, fill percentages). These pass via CSS custom properties: `style="--progress-fill:${value}%"` consumed by a CSS rule that reads `var(--progress-fill, 0%)`. The value is **data**, not styling.
2. **Bootstrap fallbacks** — `database-init.ts` shows an error UI when the app fails to bootstrap and CSS may not have loaded. Inline styles are intentional there. A file-header comment marks the exception.

The **theme/variant pattern** is `data-tone` or `data-level` attributes on a base class:

```typescript
// presenter
return html`<div class="icon-box" data-tone="${tone}">...</div>`;
```

```css
/* components.css */
.icon-box[data-tone="primary"] { background: ...; }
.icon-box[data-tone="success"] { background: ...; }
```

`tone` comes from a `toneFor*` / `levelFor*` helper that returns a string enum. The TS type system and the CSS attribute selectors share a single source of truth: the enum values.

When migrating or extending visual code:

- **Look for an existing utility first** (`.flex`, `.gap-4`, `.mb-5`, `.text-sm`, `.bg-primary`, `.shadow-lg`).
- **Look for an existing component class** (`.card`, `.icon-box`, `.avatar`, `.status-dot`, `.legend-cell`, `.action-card`, `.stat-cell`, `.pill[data-tone]`).
- **Add to `components.css`** when a pattern appears in 3+ files. Group with sibling classes and modifiers.
- **Add to `pages.css`** in a numbered section when the pattern is page-scoped (only used by one feature).
- **Add to `utilities.css`** for new single-property primitives.
- **Never use raw hex colors** in new CSS rules — always `hsl(var(--token))`. The token system is the single source of truth for color.
- **Demonstrating the design system**: `design-system/index.ts` consumes the **same** `.bg-*`, `.shadow-*`, `.text-*` classes that production code uses. There is no parallel demonstration-only style universe — if `--primary` changes, every `.bg-primary` instance updates including the swatch on the design-system page.

### Component Library

All UI components are vanilla HTML/CSS with ARIA attributes, defined as CSS classes in `web-app/app/styles/` and helper functions across `web-app/app/` modules. No external component library.

**Dialog pattern**: Use `openDialog(id)` / `closeDialog(id)` from `core.ts`. Requires matching HTML elements: `id="{id}-backdrop"` (with `class="dialog-backdrop hidden"`) and `id="{id}-dialog"` (with `class="dialog hidden" aria-hidden="true"`). Helpers manage visibility, ARIA attributes, and focus.

**Tab pattern**: Use `initTabs('[data-tab]', '.tab-panel')` from `core.ts`. Tab buttons use `data-tab="{name}"` attribute, panels use `id="tab-{name}"`.

### Design System

Full spec in `DESIGN-SYSTEM.md`. Key constraints:

- **Colors**: Primary Blue `#4B6CA1`, Primary Yellow `#FDD31D`. Never use pure black `#000` — all grays are blue-tinted. All colors defined as CSS custom properties.
- **Typography**: Display = IBM Plex Sans, Body = Inter, Mono = IBM Plex Mono. Self-hosted woff2 files at `web-app/assets/*.woff2`.
- **Spacing**: 8px grid system.
- **Icons**: ~100 inline SVG functions in `web-app/app/icons.ts`. Each returns a `SafeHtml` value: `iconSparkles(size, cssClass)`. Pages import icons directly from `icons.ts`.
- **Toasts**: `showToast(message, variant)` function with auto-dismiss.
- **Charts**: SVG rendering functions in `web-app/app/charts.ts` (bar, line, donut, area).
- **Dark mode**: CSS custom properties with `data-theme` attribute.

### Mobile Responsiveness

CSS media queries in `web-app/app/styles/responsive.css` show/hide desktop vs mobile header and sidebar. Mobile sidebar uses Sheet (slide-in drawer) toggled by JS. Breakpoints: sm 640px, md 768px, lg 1024px, xl 1280px.

## Project Structure

```
package.json                  # Project config (zero runtime dependencies)
build                         # Executable build script

api/
  types.ts                    # Row types (snake_case), shared type aliases (Id, ConfidenceLevel, IdeaStatus), User class, toBool
  db.ts                       # DbAdapter interface (EntityStore, SingletonStore, hasSchema, createSchema), EntityNotFound
  db-localstorage.ts          # localStorage implementation with JSON serialization
  api.ts                      # GET/PUT/DELETE/POST URL routing
  mock-data.ts                # Mock data seed payload
  validators.ts               # JSON validators for Risk[], StoredGraph, WorkOrderFlowGraph, transition values

web-app/
  index.html                  # Redirects to landing/index.html
  app/                        # All source code (TypeScript + CSS)
    tsconfig.json             # TypeScript config
    components-layout.html     # Layout skeleton with component placeholders
    component-*.html          # UI components (sidebar, top-bar, mobile-header, mobile-sidebar)
    compose.ts                # Build-time script: layout + page → composed index.html
    core.ts                   # DOMContentLoaded bootstrap + re-exports from format.ts, navigation.ts, dialog.ts
    database-init.ts          # initDatabase(), handleDatabaseError()
    page-loader.ts            # Page module registry, loadAndInitPage(), handlePageLoadError()
    page-registry.ts          # PAGE_REGISTRY: maps page names → sidebar/standalone classification + sourceDir/sourceFile overrides
    format.ts                 # initials(), durationInDays(), formatCompactCurrency(), formatDateTime(), SECONDS_PER_DAY, DISPLAY_ABSENT
    layout.ts                 # Sidebar collapse/expand + initSidebarLayout() orchestrator
    theme-toggle.ts           # Theme toggle icon, dropdown init
    sidebar-user.ts           # Sidebar user info fetch and display
    nav-highlight.ts          # Active nav item highlighting
    nav-items.ts              # SIDEBAR_NAV_ITEMS + buildSidebarNavItemsHtml(), single source of truth for sidebar links
    mobile-drawer.ts          # Mobile sidebar drawer behavior
    header-info.ts            # Header greeting and stats
    navigation.ts             # navigateTo(), getPageName(), URL construction, link prefetch
    dialog.ts                 # openDialog(), closeDialog(), initTabs() dialog/tab helpers
    icons.ts                  # ~100 SVG icon functions and lookup map
    state.ts                  # AppState, theme, mobile detection, pub-sub
    preferences-store.ts      # localStorage adapter for user preferences (theme, sidebar, log-level)
    channels.ts               # createChannel<T>() pub/sub for cross-page change notifications
    charts.ts                 # SVG chart rendering (bar, line, donut, area)
    command-palette.ts        # Cmd+K search overlay with keyboard navigation
    dom.ts                    # querySelector wrappers ($, $$, $required, $input, $select, $textarea), attr(), populateIcons(), initToggleGroup(), bindEnterToClick()
    drag-reorder.ts           # initDragReorder() pointer-driven list reordering with hysteresis indicator
    flow-graph.ts             # SVG renderer for flow canvas (nodes, ports, bezier edges, label boxes)
    flow-history.ts           # FlowHistory class: tracks undo/redo stack for the flow designer page
    flow-interactions.ts      # Pointer/keyboard state machines: selection, drag, connect, pan, marquee
    flow-layout.ts            # Sugiyama-style layered graph layout (computeLayout, NODE_WIDTH, reachability)
    mermaid-generate.ts       # generateMermaid(graph): serialize FlowGraph to Mermaid flowchart text
    mermaid-parse.ts          # parseMermaid(text): parse Mermaid flowchart/stateDiagram into ParsedFlowchart
    zip.ts                    # In-browser ZIP build/read (DEFLATE + CRC-32) for flow export/import
    toast.ts                  # showToast() auto-dismiss notifications
    logger.ts                 # Lightweight logger using preferences-store for log-level
    safe-html.ts              # SafeHtml class, html tagged template, trusted(), setHtml()
    loading-states.ts         # Loading skeletons, error states, empty states, withLoadingState()
    adapters/                 # adapter functions across 16 modules (API → frontend shapes)
      index.ts                # Barrel re-export
      shared.ts               # getUserMap, userName, getCurrentUser, AuthContext
      dashboard.ts            # getDashboardGauges, getDashboardStats, etc.
      ideas.ts                # getIdeas, getIdeaDetail, getIdeaForConversion, getIdea, putIdea, putIdeaSubmission
      projects.ts             # getProjects, getProjectById, putProject, putProjectTeamMember
      teams.ts                # getTeamMembers, getManagedUsers
      flows.ts                # Barrel re-export from flow-* modules
      flow-queries.ts         # getFlows, getFlowsByProject, getFlowGraph + graph types
      flow-mutations.ts       # postFlowCreation, postNodeAddition, postEdgeConnection, postFieldAddition, putFlow, putGraph, putGraphSilent, putNode, putWfEdge, putField
      flow-deletions.ts       # deleteNode, deleteEdge, deleteField
      flow-versions.ts        # postFlowVersion, getFlowVersions, getLatestFlowVersion, deleteFlowVersion, putFlowFromVersion (persistent undo history)
      flow-export.ts          # getFlowMermaid, getFlowZip, postFlowFromMermaid, postFlowFromZip
      workbox-queries.ts      # getWorkboxItems, getWorkboxActive, getWorkboxArchive, getWorkboxItem, getFlowsForCreation
      workbox-mutations.ts    # postWorkOrderCreation, postWorkOrderTransition, postWorkOrderClaim, putWorkOrder
      workbox-deletions.ts    # deleteWorkOrderClaim
      admin.ts                # getAccount, getProfile, getCompany, getActivityFeed
      snapshots.ts            # deleteSchema, postSchemaCreation, postMockDataLoad, postBootstrap, putSnapshot, getSnapshot, getDataPresent
    presenters/               # 15 presenter classes across 13 files (adapter shapes → SafeHtml)
      index.ts                # Barrel re-export
      ordered-keys.ts         # Internal helper (not a presenter)
      account.ts              # AccountPresenter
      activity.ts             # ActivityPresenter
      flow.ts                 # FlowPresenter
      flow-designer.ts        # FlowDesignerPresenter (flow canvas page)
      gauge.ts                # GaugePresenter (dashboard gauges, receiver-style)
      idea.ts                 # IdeaPresenter, IdeaListPresenter
      idea-conversion.ts      # IdeaConversionPresenter (idea → project flow)
      idea-create.ts          # IdeaCreatePresenter
      profile.ts              # ProfilePresenter
      project.ts              # ProjectPresenter, ProjectListPresenter
      project-detail.ts       # ProjectDetailPresenter
      company.ts              # CompanyPresenter
      user.ts                 # UserPresenter
    styles/                   # CSS modules (cascade-ordered) — build inputs
      fonts.css               # @font-face declarations
      tokens.css              # :root custom properties (light mode)
      dark-mode.css           # [data-theme="dark"] overrides
      base.css                # Reset, typography, focus/selection
      components.css          # Buttons, inputs, cards, badges, tables, etc.
      layout.css              # Sidebar layout, header, named grid classes
      utilities.css           # Utility classes and animations
      responsive.css          # Media queries and reduced motion
      pages.css               # Page-specific styles
      command-palette.css     # Command palette styles
  assets/                     # Static files — copied as-is to build output
    favicon.ico               # Application favicon
    *.woff2                   # 9 self-hosted font files (IBM Plex Sans, Inter, IBM Plex Mono)

  # Pages — 24 entries in PAGE_REGISTRY (19 sidebar-layout + 5 standalone). Most page directories hold multiple pages (e.g., flows/index + flows/detail).
  dashboard/                # Dashboard with gauge cards
  workbox/                  # Work order inbox + detail
  ideas/                    # Ideas list + detail, create, convert (named files)
  projects/                 # Projects list + detail (named files)
  flows/                    # Flow list + detail (detail.ts/detail.html)
  organization/             # Account overview, users, activity-feed, onboarding (named files)
  teams/                    # Team roster and member management
  profile/                  # Profile settings
  company/                  # Company name and domain
  billing/                  # Billing page — STUB (init() is empty; page renders a placeholder)
  snapshots/                # Snapshots (wipe, reload, upload/download snapshots)
  design-system/            # Component gallery
  landing/                  # Landing page (standalone)
  auth/                     # Login/signup (standalone)
  not-found/                # 404 page (standalone)

SCHEMA.md                     # Database schema (19 tables, columns, types, defaults)
DESIGN-SYSTEM.md              # Design system specification
TEST-PLAN.md                  # Human-executable test plan (254 cases)
```

Most pages use `index.ts` + `index.html`. Pages with
`sourceFile` in `PAGE_REGISTRY` use named files (e.g.,
`detail.ts` + `detail.html`). Build output goes to a
temp directory -- no build artifacts in the repo.

## Build

Build steps (requires clean git working directory):
1. Composes HTML pages: runs `web-app/app/compose.ts` to assemble `components-layout.html` with `component-*.html` files and each sidebar-layout page's HTML file, producing 18 composed files in the build directory. Respects `sourceDir` and `sourceFile` for both input resolution and output placement. Exits with error if any page is missing.
2. Copies 5 standalone pages (`auth`, `landing`, `onboarding`, `not-found`, `flow-detail`) — also handled by `compose.ts`, which uses `copyFileSync` for standalone entries instead of templating
3. Bundles TypeScript into a single IIFE (`assets/app.js`) via esbuild into the build directory
4. Concatenates CSS modules in cascade order and minifies via esbuild into `assets/styles.css`, copies `*.woff2` and `favicon.ico` to the build directory
5. Creates a distribution ZIP (`fusion-ai-<sha>.zip`) at the output path (default `~/Desktop/`), or skips zipping with `--no-zip`

CLI options: `./build [--no-zip] [path/]`. The trailing `/` on the path argument is required. Default output is `~/Desktop/`. With `--no-zip`, the bundle directory is kept for direct serving via HTTP.

No build artifacts are created in the repo — build output goes to `/tmp/` by default.

## Testing

The codebase honors the Office of Verification through
a manual browser regression protocol rather than an
executable test runner — a deliberate trade-off between
toolchain minimalism (zero runtime *and* test
dependencies) and verification automation. A future
scroll may introduce Node's built-in test runner for
the `api/` and `adapters/` layers (highest leverage;
validates the boundary doctrine).

No unit test framework is configured. Testing is a manual browser
regression pass against `TEST-PLAN.md` (254 cases), driven either
by a single human tester serially or by Claude Code agents in
parallel via the `claude-in-chrome` MCP.

### Six-phase parallel protocol

Agents execute the plan in six phases to fit within context and
time budgets while keeping per-entity mutation domains disjoint:

1. **Phase 0 — Preflight** (main): `./validate`, `./build` to
   produce the distribution ZIP, `./build --no-zip` for the test
   server, start HTTP server, open tab 0. Covers A1–A5.
2. **Phase 1 — Data setup** (one agent, serial): AA1–AA43 in
   tab 0. Creates pristine environment, users, ideas, projects,
   one flow. Populates the shared database that Phase 2 verifies.
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
| Agent-F2 | `work_orders`, `work_order_transitions`, `work_order_claims` |
| Agent-G | `users`, `teams`, `profile`, `company` |
| Agent-CH | none (read-only) |

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
- **Availability thresholds**: `AVAILABILITY_HIGH = 70`, `AVAILABILITY_LOW = 40`.
- **`file:///` protocol**: Navigation detects file protocol and skips link prefetching. Page URLs use relative paths. Code supports `file:///` locally but testing is HTTP-only.

## Worktrees

Use `/tmp/claude` as the worktree directory for isolated feature work.

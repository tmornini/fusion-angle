# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**All work must follow [CHURCH-OF-CODE.md](CHURCH-OF-CODE.md)** — read it before making changes.

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

`./validate` runs `tsc --noEmit` (type checking) then enforces 78-character maximum line length on all `.ts`, `.html`, and `.css` files (excluding `compose.ts`).

No test framework is configured.

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
  4 standalone pages have hand-written `index.html`
  that are copied directly to the build output.
- **Navigation**: Standard `<a href>` links between pages. Parameterized pages use query strings (`?ideaId=1`). `navigateTo(page, params?)` helper constructs relative URLs for programmatic navigation.
- **Layout**: Sidebar-layout pages share a layout template with sidebar, header, search, and theme toggle. Mobile layout uses CSS media queries (not JS) to swap between desktop sidebar and mobile drawer.
- **Page Detection**: `page-registry.ts` defines `PAGE_REGISTRY` mapping page names to `'sidebar'` or `'standalone'` layout type. `<html data-page="dashboard">` attribute is read by JS on `DOMContentLoaded` to dispatch to the correct page module's `init()`. Pages with `sourceDir` in `PAGE_REGISTRY` have source files at a different path than their page name.
- **Source = Output Alignment**: Build output paths
  always use `sourceDir` when present -- both
  `compose.ts` and `navigateTo()` resolve output
  directory as `sourceDir || pageName`. This means a
  page at `web-app/flows/detail.html` produces output
  at `flows/detail.html`, and `navigateTo('account')`
  generates `../organization/index.html` because
  account's `sourceDir` is `'organization'`. The
  `sourceFile` property enables named files (e.g.,
  `detail.html`) alongside the default `index.html`
  convention. This keeps the developer's mental model
  simple: the file you edit is the file the browser
  loads.
- **Auth**: Mock auth returning `demo@example.com`.
- **Data**: REST-style API layer (`api/`) backed by localStorage. The `web-app/app/adapters/` directory contains ~30 adapter functions (split into domain modules with barrel re-export) that call `GET()`/`PUT()`/`POST()` and convert normalized DB rows into the denormalized shapes pages expect.
- **Database**: localStorage with JSON serialization, persisted across page navigations. Each table is stored as a `fusion-ai:tableName` key containing a JSON array of row objects. When no schema exists (no `fusion-ai:*` keys in localStorage), non-entry pages redirect to snapshots so users can initialize the environment. A snapshots page provides create pristine environment, wipe and load mock data, upload snapshot, and download snapshot operations.
- **State**: Simple module-level variables + pub-sub pattern for theme (persisted to localStorage), mobile detection (matchMedia), auth, and sidebar state.
- **Durations**: All numeric durations are persisted in seconds. UI displays days via `durationInDays(seconds)` from `format.ts`.

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
- **`api/seed.ts`** — Mock data seeding function

The `DbAdapter` interface is designed for easy migration to Postgres or other backends — implement the same interface and swap the import.

### Page Module Pattern

Page folders contain `index.ts` and `index.html` by
default. When `sourceFile` is set in `PAGE_REGISTRY`,
the page uses `{sourceFile}.ts` and
`{sourceFile}.html` instead (e.g.,
`flows/detail.ts` + `flows/detail.html`). Each page
module exports:
- `init(): Promise<void>` — fetches data, populates DOM placeholders, binds event listeners

Sidebar-layout pages have `index.html` containing page content that gets composed with the layout template. Standalone pages have a complete hand-written `index.html` with a `<div id="page-root">` that `init()` renders into.

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
- `styleFor*` — map a status/value to a CSS inline style string
- `compute*` — pure calculation returning a derived value
- `get*` — adapter functions that fetch and transform data (reads)
- `put*` — adapter functions that write entity data (writes)
- Adapter function names use **domain nouns** (`getIdea`, `putProject`), never internal type names like `Entity` — the return type already communicates the shape
- `deleteSchema`, `postSchemaCreation`, `postMockDataLoad`, `postBootstrap`, `putSnapshot`, `getSnapshot`, `hasData` — snapshot lifecycle operations in `adapters/snapshots.ts`
- Boolean variables: `is*`, `has*`, `needs*` (use the prefix that reads naturally in English)
- Config objects: `Record<StatusType, { label, className }>` in `api/types.ts`

### Adapter Conventions

- **User-name fallback**: When a user ID can't resolve to a name, return `''` (empty string). UI renders `'\u2014'` (em dash) for display. Never use magical fallback strings like `'Unknown'`.
- **Absent values**: Use `null` for semantically absent values in adapter return types (e.g., `confidence: ConfidenceLevel | null`). Persisted noun entities never use `null`.
- **No adapter caching**: Each adapter function fetches its own data directly via `getUserMap()`. No `cachedUserMap` or `prefetched*` parameters — simplicity over micro-optimization of localStorage reads.
- **Shared types**: The `Metric` interface (`{ id, name, target, unit, current }`) is defined in `helpers.ts` and used across adapters.

### Dark Mode

CSS custom properties on `:root` (light) and `[data-theme="dark"]` (dark). Toggle persists to `localStorage` and carries across page navigation. Supports system preference detection via `prefers-color-scheme`.

## UI & Styling

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
- **Toasts**: `showToast(message, type)` function with auto-dismiss.
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
  seed.ts                     # Mock data seeding

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
    mobile-drawer.ts          # Mobile sidebar drawer behavior
    header-info.ts            # Header greeting and stats
    navigation.ts             # navigateTo(), getPageName(), URL construction, link prefetch
    dialog.ts                 # openDialog(), closeDialog(), initTabs() dialog/tab helpers
    icons.ts                  # ~100 SVG icon functions and lookup map
    state.ts                  # AppState, theme, mobile detection, pub-sub
    preferences-store.ts      # localStorage adapter for user preferences (theme, sidebar, log-level)
    charts.ts                 # SVG chart rendering (bar, line, donut, area)
    command-palette.ts        # Cmd+K search overlay with keyboard navigation
    dom.ts                    # querySelector wrappers ($, $$, $required, $input, $select, $textarea), attr(), populateIcons(), initToggleGroup(), bindEnterToClick()
    toast.ts                  # showToast() auto-dismiss notifications
    logger.ts                 # Lightweight logger using preferences-store for log-level
    safe-html.ts              # SafeHtml class, html tagged template, trusted(), setHtml()
    loading-states.ts         # Loading skeletons, error states, empty states, withLoadingState()
    adapters/                 # ~30 adapter functions (API → frontend shapes)
      index.ts                # Barrel re-export
      helpers.ts              # getUserMap, userName, parseJson
      shared.ts               # getCurrentUser
      dashboard.ts            # getDashboardGauges, getDashboardStats, etc.
      ideas.ts                # getIdeas, getIdeaDetail, getIdeaForConversion, getIdea, putIdea, putIdeaSubmission
      projects.ts             # getProjects, getProjectById, putProject, putProjectTeamMember
      teams.ts                # getTeamMembers, getManagedUsers
      flows.ts                # Barrel re-export from flow-* modules
      flow-queries.ts         # getFlows, getFlowsByProject, getFlowGraph + graph types
      flow-mutations.ts       # postFlowCreation, postNodeAddition, postEdgeConnection, postFieldAddition, putFlow, putNode, putWfEdge, putField
      flow-deletions.ts       # deleteNode/Edge/Field + capture functions for undo
      flow-undo-adapter.ts    # executeUndoSteps
      flow-export.ts          # getFlowMermaid, getFlowZip, postFlowFromMermaid, postFlowFromZip
      workbox.ts              # getWorkboxItems, getWorkboxItem, postWorkOrderCreation, postWorkOrderTransition, postWorkOrderClaim, deleteWorkOrderClaim
      admin.ts                # getAccount, getProfile, getCompanySettings, getActivityFeed
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

  # Pages — 25 pages across page directories (most use index.ts + index.html; some use sourceFile naming)
  dashboard/                # Dashboard with gauge cards
  workbox/                  # Work order inbox + detail
  ideas/                    # Ideas list + detail, create, convert (named files)
  projects/                 # Projects list + detail (named files)
  flows/                    # Flow list + detail (detail.ts/detail.html)
  organization/             # Account overview, users, teams, activity-feed, onboarding (named files)
  profile/                  # Profile settings
  settings/                 # Company settings
  snapshots/                # Snapshots (wipe, reload, upload/download snapshots)
  design-system/            # Component gallery
  landing/                  # Landing page (standalone)
  auth/                     # Login/signup (standalone)
  not-found/                # 404 page (standalone)

SCHEMA.md                     # Database schema (17 tables, columns, types, defaults)
DESIGN-SYSTEM.md              # Design system specification
TEST-PLAN.md                  # Human-executable test plan (176 cases)
```

Most pages use `index.ts` + `index.html`. Pages with
`sourceFile` in `PAGE_REGISTRY` use named files (e.g.,
`detail.ts` + `detail.html`). Build output goes to a
temp directory -- no build artifacts in the repo.

## Build

Build steps (requires clean git working directory):
1. Composes HTML pages: runs `web-app/app/compose.ts` to assemble `components-layout.html` with `component-*.html` files and each sidebar-layout page's HTML file, producing 22 composed files in the build directory. Respects `sourceFile` for both input resolution and output placement. Exits with error if any page is missing.
2. Copies 4 standalone pages' `index.html` to the
   build directory
3. Bundles TypeScript into a single IIFE (`assets/app.js`) via esbuild into the build directory
4. Concatenates CSS modules in cascade order and minifies via esbuild into `assets/styles.css`, copies `*.woff2` and `favicon.ico` to the build directory
5. Creates a distribution ZIP (`fusion-ai-<sha>.zip`) at the output path (default `~/Desktop/`), or skips zipping with `--no-zip`

CLI options: `./build [--no-zip] [path/]`. The trailing `/` on the path argument is required. Default output is `~/Desktop/`. With `--no-zip`, the bundle directory is kept for direct serving via HTTP.

No build artifacts are created in the repo — build output goes to `/tmp/` by default.

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

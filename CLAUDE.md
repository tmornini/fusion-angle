# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
./build                # Compile, bundle, minify, and create distribution ZIP
```

No test framework is configured.

## TypeScript

Target: **ES2024** · Strict mode with `noUncheckedIndexedAccess`. Config at `web-app/app/tsconfig.json`. The `compose.ts` build script is excluded from type checking (it runs in Node).

## Architecture

**Vanilla TypeScript** with zero runtime dependencies. This is an enterprise innovation management platform with modules for ideas, projects, teams, and analytics (Edge, Crunch, Flow). Every page is a standalone HTML file that works via both HTTP server and `file:///` protocol.

### Key Layers

- **HTML Composition**: A build step (`web-app/app/compose.ts`) merges `web-app/app/layout.html` (shared sidebar/header) with each page's `index.html` to produce standalone composed `index.html` files in a temp build directory. 7 standalone pages have hand-written `index.html` that are copied directly to the build output.
- **Navigation**: Standard `<a href>` links between pages. Parameterized pages use query strings (`?ideaId=1`). `navigateTo(page, params?)` helper constructs relative URLs for programmatic navigation.
- **Layout**: Sidebar-layout pages share a layout template with sidebar, header, search, and theme toggle. Mobile layout uses CSS media queries (not JS) to swap between desktop sidebar and mobile drawer.
- **Page Detection**: `page-registry.ts` defines `PAGE_REGISTRY` mapping page names to `'sidebar'` or `'standalone'` layout type. `<html data-page="dashboard">` attribute is read by JS on `DOMContentLoaded` to dispatch to the correct page module's `init()`.
- **Auth**: Mock auth returning `demo@example.com`.
- **Data**: REST-style API layer (`api/`) backed by localStorage. The `web-app/app/adapters/` directory contains ~30 adapter functions (split into domain modules with barrel re-export) that call `GET()`/`PUT()`/`POST()` and convert normalized DB rows into the denormalized shapes pages expect.
- **Database**: localStorage with JSON serialization, persisted across page navigations. Each table is stored as a `fusion-ai:tableName` key containing a JSON array of row objects. When no schema exists (no `fusion-ai:*` keys in localStorage), non-entry pages redirect to snapshots so users can initialize the environment. A snapshots page provides create pristine environment, wipe and load mock data, upload snapshot, and download snapshot operations.
- **State**: Simple module-level variables + pub-sub pattern for theme (persisted to localStorage), mobile detection (matchMedia), auth, and sidebar state.
- **Durations**: All numeric durations are persisted in seconds. UI displays days via `durationInDays(seconds)` from `format.ts`.

### API Layer (`/api`)

The API layer is a set of TypeScript modules that provide a REST-style interface to the database:

- **`api/types.ts`** — Row types (snake_case) matching schema, shared type aliases (`Id`, `ConfidenceLevel`, `PriorityLevel`, `EdgeStatus`, `IdeaStatus`), `User` class wrapping `UserEntity`, and `toBool` utility
- **`api/db.ts`** — `DbAdapter` interface with `EntityStore<T>` and `SingletonStore<T>` patterns, plus `hasSchema()`/`createSchema()` lifecycle methods
- **`api/db-localstorage.ts`** — localStorage implementation with JSON serialization
- **`api/api.ts`** — `GET(resource)` / `PUT(resource, body)` / `DELETE(resource)` / `POST(resource, body)` URL routing
- **`api/seed.ts`** — Mock data seeding function

The `DbAdapter` interface is designed for easy migration to Postgres or other backends — implement the same interface and swap the import.

### Page Module Pattern

All page folders uniformly contain `index.ts` and `index.html`. Each `index.ts` exports:
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

`core.ts` re-exports from `format.ts`, `navigation.ts`, and `dialog.ts` so page modules can import `navigateTo`, `initials`, `styleForScore`, `openDialog`, `closeDialog`, `initTabs` from `'../app/core'`. The `adapters/` directory retains its barrel re-export (`adapters/index.ts`).

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
- `deleteSchema`, `createSchema`, `loadMockData`, `importSnapshot`, `exportSnapshot` — snapshot lifecycle operations in `adapters/snapshots.ts`
- Boolean variables: `is*`, `has*`, `needs*` (use the prefix that reads naturally in English)
- Config objects: `Record<StatusType, { label, className }>` in `config.ts`

### Adapter Conventions

- **User-name fallback**: When a user ID can't resolve to a name, return `'Unknown'` (never empty string).
- **Absent values**: Use `null` for semantically absent values (e.g., `confidence: ConfidenceLevel | null`), not empty string.
- **Shared userMap**: When a page calls multiple adapter functions that need user names, call `buildUserMap()` once and pass it via the `cachedUserMap` parameter to avoid redundant localStorage deserialization.
- **Shared types**: The `Metric` interface (`{ id, name, target, unit, current }`) is defined in `helpers.ts` and used across adapters. `PriorityLevel` (computed from score) is distinct from `ConfidenceLevel` (user-selected).

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
  types.ts                    # Row types (snake_case), shared type aliases (Id, ConfidenceLevel, PriorityLevel, EdgeStatus, IdeaStatus), User class, toBool
  db.ts                       # DbAdapter interface (EntityStore, SingletonStore, hasSchema, createSchema)
  db-localstorage.ts          # localStorage implementation with JSON serialization
  api.ts                      # GET/PUT/DELETE/POST URL routing
  seed.ts                     # Mock data seeding

web-app/
  index.html                  # Redirects to landing/index.html
  app/                        # All source code (TypeScript + CSS)
    tsconfig.json             # TypeScript config
    layout.html               # Shared sidebar layout template (sidebar, header)
    compose.ts                # Build-time script: layout + page → composed index.html
    core.ts                   # Page dispatch + re-exports from format.ts, layout.ts, navigation.ts, dialog.ts
    page-registry.ts          # PAGE_REGISTRY: maps page names → sidebar/standalone classification
    format.ts                 # initials(), styleForScore() formatting utilities
    layout.ts                 # Sidebar layout initialization and sidebar behavior
    navigation.ts             # navigateTo(), getPageName(), URL construction, link prefetch
    dialog.ts                 # openDialog(), closeDialog(), initTabs() dialog/tab helpers
    icons.ts                  # ~100 SVG icon functions and lookup map
    state.ts                  # AppState, theme, mobile detection, pub-sub
    charts.ts                 # SVG chart rendering (bar, line, donut, area)
    command-palette.ts        # Cmd+K search overlay with keyboard navigation
    dom.ts                    # querySelector wrappers ($, $$) and escapeHtml
    toast.ts                  # showToast() auto-dismiss notifications
    config.ts                 # edgeStatusConfig mapping
    safe-html.ts              # SafeHtml class, html tagged template, trusted(), setHtml()
    loading-states.ts         # Loading skeletons, error states, empty states, withLoadingState()
    adapters/                 # ~30 adapter functions (API → frontend shapes)
      index.ts                # Barrel re-export
      helpers.ts              # buildUserMap, parseJson, getEdgeDataByIdeaId, getEdgeDataWithConfidence, shared Metric type
      shared.ts               # getCurrentUser
      dashboard.ts            # getDashboardGauges, getDashboardStats, etc.
      ideas.ts                # getIdeas, getReviewQueue, getIdeaForConversion, getIdeaForApproval, getEdgeForApproval
      projects.ts             # getProjects, getProjectById, getProjectForEngineering, getClarificationsByProjectId
      teams.ts                # getTeamMembers, getManagedUsers
      edges.ts                # getIdeaForEdge, getEdgeList
      tools.ts                # getCrunchColumns, getFlow
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

  # Pages — 25 page directories, each with index.ts + index.html
  dashboard/                # Dashboard with gauge cards
  ideas/                    # Ideas list
  idea-create/              # Multi-step idea wizard (standalone)
  idea-convert/             # Idea-to-project conversion (standalone)
  idea-review-queue/        # Review queue
  approval-detail/          # Review decision page (standalone)
  projects/                 # Projects list
  project-detail/           # Project detail (tabbed)
  engineering-requirements/ # Engineering requirements
  edge/                     # Edge definition (per-idea)
  edge-list/                # Edge list view
  crunch/                   # Data labeling tool
  flow/                     # Process documentation
  team/                     # Team roster
  account/                  # Account overview
  profile/                  # Profile settings
  company-settings/         # Company settings
  manage-users/             # User administration
  activity-feed/            # Activity feed
  snapshots/                # Snapshots (wipe, reload, upload/download snapshots)
  design-system/            # Component gallery
  landing/                  # Landing page (standalone)
  auth/                     # Login/signup (standalone)
  onboarding/               # Welcome screen (standalone)
  not-found/                # 404 page (standalone)

SCHEMA.md                     # Database schema (19 tables, columns, types, defaults)
DESIGN-SYSTEM.md              # Design system specification
TEST-PLAN.md                  # Human-executable test plan (146 cases)
```

Each page directory contains `index.ts` + `index.html`. Build output goes to a temp directory — no build artifacts in the repo.

## Build

Build steps (requires clean git working directory):
1. Composes HTML pages: runs `web-app/app/compose.ts` to merge `layout.html` with each sidebar-layout page's `index.html`, producing 19 composed files in a temp build directory. Exits with error if any page is missing.
2. Copies 7 standalone pages' `index.html` to the build directory
3. Bundles TypeScript into a single IIFE (`assets/app.js`) via esbuild into the build directory
4. Concatenates CSS modules in cascade order and minifies via esbuild into `assets/styles.css`, copies `*.woff2` and `favicon.ico` to the build directory
5. Creates a distribution ZIP (`fusion-ai-<sha>.zip`) on `~/Desktop`

No build artifacts are created in the repo — everything is assembled in `/tmp/`.

## Gotchas

- **`noUncheckedIndexedAccess`**: tsconfig enables this — array/object index access returns `T | undefined`, requiring explicit `!` assertions or guards.
- **ES2024 target**: No transpilation. Native `Object.groupBy()`, `Map.groupBy()` are available. Assumes modern browser.
- **`withLoadingState()` returns null**: Returns `null` on error AND when data is empty with an `emptyState` config — callers must check for null before using the result.
- **Cross-tab theme sync**: `state.ts` listens to `StorageEvent` and syncs theme changes across browser tabs automatically.
- **Non-critical writes swallowed**: localStorage writes for theme and sidebar state are wrapped in try/catch with empty catch — quota errors don't break the app.
- **Snapshots wipe-first**: All snapshot operations (pristine, mock data, import) call `DELETE('snapshots/schema')` before writing — there is no merge, only replace.
- **Score thresholds**: `SCORE_THRESHOLD_HIGH = 80` and `SCORE_THRESHOLD_MEDIUM = 60` in `api/types.ts` determine `PriorityLevel` computation.
- **`file:///` protocol**: Navigation detects file protocol and skips link prefetching. All page URLs use `../pageName/index.html` relative paths.

## Worktrees

Use `/tmp/claude` as the worktree directory for isolated feature work.

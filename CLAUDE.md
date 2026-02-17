# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
./build              # Compile, bundle, minify, and create distribution ZIP
```

No test framework is configured.

## Architecture

**Vanilla TypeScript** with zero runtime browser dependencies. This is an enterprise innovation management platform with modules for ideas, projects, teams, and analytics (Edge, Crunch, Flow). Every page is a standalone HTML file that works via both HTTP server and `file://` (double-click any `index.html`).

### Key Layers

- **HTML Composition**: A build step (`site/compose.ts`) merges `site/layout.html` (shared sidebar/header) with each page's `index.html` to produce standalone composed `index.html` files in a temp build directory. 8 standalone pages have hand-written `index.html` that are copied directly to the build output.
- **Navigation**: Standard `<a href>` links between pages. Parameterized pages use query strings (`?ideaId=1`). `navigateTo(page, params?)` helper constructs relative URLs for programmatic navigation.
- **Layout**: Dashboard pages share a layout template with sidebar, header, search, notifications, and theme toggle. Mobile layout uses CSS media queries (not JS) to swap between desktop sidebar and mobile drawer.
- **Page Detection**: `<html data-page="dashboard">` attribute is read by JS on `DOMContentLoaded` to dispatch to the correct page module's `init()`.
- **Auth**: Mock auth returning `demo@example.com`.
- **Data**: All mock data is in `site/data.ts` with ~27 async functions returning Promises — ready for API replacement.
- **State**: Simple module-level variables + pub-sub pattern for theme (persisted to localStorage), mobile detection (matchMedia), auth, and sidebar state.

### Page Module Pattern

All page folders uniformly contain `index.ts` and `index.html`. Each `index.ts` exports:
- `init(): Promise<void>` — fetches data, populates DOM placeholders, binds event listeners

Dashboard pages have `index.html` containing page content that gets composed with the layout template. Standalone pages have a complete hand-written `index.html` with a `<div id="page-root">` that `init()` renders into.

### Dark Mode

CSS custom properties on `:root` (light) and `[data-theme="dark"]` (dark). Toggle persists to `localStorage` and carries across page navigation. Supports system preference detection via `prefers-color-scheme`.

## UI & Styling

### Component Library

All UI components are vanilla HTML/CSS with ARIA attributes, defined as CSS classes in `site/style.css` and helper functions in `site/script.ts`. No external component library.

### Design System

Full spec in `DESIGN-SYSTEM.md`. Key constraints:

- **Colors**: Primary Blue `#4B6CA1`, Primary Yellow `#FDD31D`. Never use pure black `#000` — all grays are blue-tinted. All colors defined as CSS custom properties.
- **Typography**: Display = IBM Plex Sans, Body = Inter, Mono = IBM Plex Mono. Self-hosted woff2 files in `site/fonts/`.
- **Spacing**: 8px grid system.
- **Icons**: ~80+ inline SVG functions in `site/script.ts`. Each returns an SVG string: `iconSparkles(size, cssClass)`.
- **Toasts**: `showToast(message, type)` function with auto-dismiss.
- **Charts**: SVG rendering functions in `site/charts.ts` (bar, line, donut, area).
- **Dark mode**: CSS custom properties with `data-theme` attribute.

### Mobile Responsiveness

CSS media queries in `site/style.css` show/hide desktop vs mobile header and sidebar. Mobile sidebar uses Sheet (slide-in drawer) toggled by JS. Breakpoints: sm 640px, md 768px, lg 1024px, xl 1280px.

## Project Structure

```
index.html                    # Redirects to landing/index.html
site/
  layout.html                 # Shared dashboard layout template (sidebar, header)
  compose.ts                  # Build-time script: layout + page → composed index.html
  style.css                   # All CSS: tokens, components, layouts, utilities
  script.ts                   # Page dispatch, state, icons, navigation, layout behavior
  data.ts                     # ~27 async mock data functions + all interfaces
  charts.ts                   # SVG chart rendering (bar, line, donut, area)
  fonts/                      # Self-hosted woff2 files

# Core pages — ideas, projects, and related workflows
core/
  dashboard/                  # Dashboard with gauge cards
  ideas/                      # Ideas list
  idea-create/                # Multi-step idea wizard (standalone)
  idea-scoring/               # AI scoring display (standalone)
  idea-convert/               # Idea-to-project conversion (standalone)
  idea-review-queue/          # Review queue
  approval-detail/            # Review decision page (standalone)
  projects/                   # Projects list
  project-detail/             # Project detail (tabbed)
  engineering-requirements/   # Engineering requirements

# Tools — Edge, Crunch, Flow analytics
tools/
  edge/                       # Edge definition (per-idea)
  edge-list/                  # Edge list view
  crunch/                     # Data labeling tool
  flow/                       # Process documentation

# Admin — account, team, and settings
admin/
  team/                       # Team roster
  account/                    # Account overview
  profile/                    # Profile settings
  company-settings/           # Company settings
  manage-users/               # User administration
  activity-feed/              # Activity feed
  notification-settings/      # Notification preferences

# Reference
reference/
  design-system/              # Component gallery

# Entry — public-facing pages
entry/
  landing/                    # Landing page (standalone)
  auth/                       # Login/signup (standalone)
  onboarding/                 # Welcome screen (standalone)

# System
system/
  not-found/                  # 404 page (standalone)

build                         # Executable build script
tsconfig.json                 # TypeScript config
DESIGN-SYSTEM.md              # Design system specification
```

Each page directory contains `index.ts` + `index.html`. Build output goes to a temp directory — no build artifacts in the repo.

## Build

The `build` script requires a clean git working directory (no uncommitted changes), then:
1. Composes HTML pages: runs `site/compose.ts` to merge `layout.html` with each dashboard page's `index.html`, producing 18 composed files in a temp build directory
2. Copies 8 standalone pages' `index.html` to the build directory
3. Bundles TypeScript into a single IIFE (`site/app.js`) via esbuild into the build directory
4. Copies static assets (`site/style.css`, `site/fonts/`, `index.html`) to the build directory
5. Creates a distribution ZIP (`fusion-ai-<sha>.zip`) on `~/Desktop`

No build artifacts are created in the repo — everything is assembled in `/tmp/`.

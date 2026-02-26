# Fusion AI

Enterprise innovation management platform for capturing ideas, defining business cases, and tracking projects through approval and execution.

## Overview

Vanilla TypeScript with zero runtime dependencies. Uses localStorage for in-browser data persistence. Every page is a standalone HTML file that works via both HTTP server and `file:///` protocol.

### Modules

- **Ideas** — submit, score, and review innovation ideas
- **Edge** — define business outcomes, metrics, and expected impact
- **Crunch** — data labeling and evidence gathering
- **Flow** — process documentation and workflow management
- **Projects** — track approved ideas through execution
- **Teams** — team roster and assignments
- **Account** — organization settings, users, billing, and activity
- **DB Admin** — database management (wipe, reload, upload/download snapshots)

## Getting Started

```sh
git clone <repo-url>
cd fusion-ai
```

Preview locally:

```sh
python3 -m http.server 8080
# then open http://localhost:8080/web-app/entry/landing/index.html
```

## Build

```sh
./build
```

Requires a clean git working directory. The build:
1. Composes dashboard pages by merging `web-app/site/layout.html` with each page's `index.html`
2. Bundles TypeScript via esbuild into a single JS file
3. Bundles and minifies CSS via esbuild into style.css, copies fonts/ and favicon.ico
4. Produces a distribution ZIP named `fusion-ai-<sha>.zip`

## Tech Stack

- TypeScript (vanilla, no framework)
- localStorage with JSON serialization (zero runtime dependencies)
- REST-style API layer (`api/`) with `DbAdapter` interface
- Build-time HTML composition (shared layout + per-page content)
- CSS custom properties with light/dark theme support
- Standard `<a href>` navigation between standalone HTML pages
- SVG charts (bar, line, donut, area)
- Command palette (Cmd+K) with keyboard navigation
- ~100 inline SVG icons
- Self-hosted IBM Plex Sans, Inter, and IBM Plex Mono fonts

## Architecture

```
api/          # Database abstraction, localStorage implementation, REST routing, seed data
web-app/      # Frontend pages, styles, scripts, layout templates
  site/       # Shared CSS, TypeScript, HTML layout, fonts
  core/       # Ideas, projects, and related workflows
  tools/      # Edge, Crunch, Flow analytics
  admin/      # Account, team, settings, snapshots
  entry/      # Landing, auth, onboarding
  reference/  # Design system component gallery
  system/     # 404 page
```

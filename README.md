# Fusion AI

Enterprise innovation management platform for capturing ideas, defining business cases, and tracking projects through approval and execution.

## Overview

Vanilla TypeScript with zero runtime dependencies. Uses localStorage for in-browser data persistence. Every page is a standalone HTML file served via HTTP.

### Modules

- **Ideas** — submit, score, and review innovation ideas
- **Flow** — process documentation and flow management
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
# then open http://localhost:8080/web-app/landing/index.html
```

## Build

```sh
./build
```

Requires a clean git working directory. The build:
1. Composes sidebar-layout pages by assembling `web-app/app/components-layout.html` with `component-*.html` files and each page's `index.html`
2. Bundles TypeScript via esbuild into a single JS file
3. Bundles and minifies CSS via esbuild into styles.css, copies *.woff2 and favicon.ico
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


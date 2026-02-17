# Fusion AI

Enterprise innovation management platform for capturing ideas, defining business cases, and tracking projects through approval and execution.

## Overview

Vanilla TypeScript with zero runtime browser dependencies. Every page is a standalone HTML file — open any `index.html` directly in a browser or serve via any HTTP server.

### Modules

- **Ideas** — submit, score, and review innovation ideas
- **Edge** — define business outcomes, metrics, and expected impact
- **Crunch** — data labeling and evidence gathering
- **Flow** — process documentation and workflow management
- **Projects** — track approved ideas through execution
- **Teams** — team roster and assignments
- **Account** — organization settings, users, billing, and activity

## Getting Started

```sh
git clone <repo-url>
cd fusion-ai
npm install
```

Preview locally:

```sh
python3 -m http.server 8080
# then open http://localhost:8080/landing/index.html
```

Or open any page's `index.html` directly in a browser (`file://`).

## Build

```sh
./build
```

Requires a clean git working directory. The build:
1. Composes dashboard pages by merging `site/layout.html` with each page's `index.html`
2. Bundles TypeScript via esbuild into a single JS file
3. Produces a distribution ZIP named `fusion-ai-<sha>.zip`

## Tech Stack

- TypeScript (vanilla, no framework)
- Build-time HTML composition (shared layout + per-page content)
- CSS custom properties with light/dark theme support
- Standard `<a href>` navigation between standalone HTML pages
- SVG charts (bar, line, donut, area)
- 80+ inline SVG icons
- Self-hosted IBM Plex Sans, Inter, and IBM Plex Mono fonts

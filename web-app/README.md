# Web App

Frontend application containing all pages and shared infrastructure for the Fusion AI platform.

## Directory Structure

| Directory | Contents | Pages |
|-----------|----------|-------|
| `site/` | Shared CSS, TypeScript, HTML layout, fonts | — |
| `core/` | Ideas, projects, and related workflows | 10 |
| `tools/` | Edge, Crunch, Flow analytics | 4 |
| `admin/` | Account, team, settings, database ops | 8 |
| `entry/` | Landing, auth, onboarding | 3 |
| `reference/` | Developer reference (design system gallery) | 1 |
| `system/` | System utilities (404 page) | 1 |

## Page Types

- **Composed** — `index.html` contains only page content; at build time, `site/compose.ts` merges it with `site/layout.html` to produce a complete HTML file with sidebar, header, search, and theme toggle
- **Standalone** — `index.html` is a complete hand-written HTML file with `<div id="page-root">` that `init()` renders into

## Entry Point

`index.html` at the web-app root redirects to `landing/index.html`.

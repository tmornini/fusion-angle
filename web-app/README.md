# Web App

**Parent:** [fusion-ai](../README.md)

Frontend application containing all pages and shared infrastructure for the Fusion AI platform.

## Directory Structure

| Directory | Contents |
|-----------|----------|
| [`app/`](app/README.md) | Shared CSS, TypeScript, HTML layout, adapters |
| [`assets/`](assets/README.md) | Static files: fonts (*.woff2), favicon |

27 pages at the top level, each containing `index.ts` + `index.html`.

## Page Types

- **Composed** — `index.html` contains only page content; at build time, `app/compose.ts` assembles it with `app/components-layout.html` and `component-*.html` files to produce a complete HTML file with sidebar, header, search, and theme toggle
- **Standalone** — `index.html` is a complete hand-written HTML file with `<div id="page-root">` that `init()` renders into

## Entry Point

`index.html` at the web-app root redirects to `landing/index.html`.

## Pages (27)

| Page | Type | Description |
|------|------|-------------|
| [account](administration/) | composed | Account overview |
| [activity-feed](teams/activity-feed.ts) | composed | Activity feed |
| approval-detail | standalone | Review decision page (in `ideas/`) |
| [auth](auth/README.md) | standalone | Login/signup |
| [settings](settings/README.md) | composed | Company settings |
| [crunch](crunch/README.md) | composed | Data labeling tool |
| [dashboard](dashboard/README.md) | composed | Dashboard with gauge cards |
| [design-system](design-system/README.md) | composed | Component gallery |
| [edge](edge/README.md) | composed | Edge definition (per-idea) |
| [edge-list](edge/list.ts) | composed | Edge list view |
| [engineering-requirements](projects/engineering-requirements.ts) | composed | Engineering requirements |
| [flow](flow/README.md) | composed | Process documentation |
| flow-detail | composed | Process detail view (in `flow/`) |
| [idea-convert](ideas/convert.ts) | standalone | Idea-to-project conversion |
| [idea-create](ideas/create.ts) | standalone | Multi-step idea wizard |
| idea-detail | composed | Idea detail view (in `ideas/`) |
| [idea-review-queue](ideas/review-queue.ts) | composed | Review queue |
| [ideas](ideas/README.md) | composed | Ideas list |
| [landing](landing/README.md) | standalone | Landing page |
| [manage-users](administration/manage-users.ts) | composed | User administration |
| [not-found](not-found/README.md) | standalone | 404 page |
| [onboarding](onboarding/README.md) | standalone | Welcome screen |
| [profile](profile/README.md) | composed | Profile settings |
| project-detail | composed | Project detail view (in `projects/`) |
| [projects](projects/README.md) | composed | Projects list + detail (named files) |
| [snapshots](snapshots/README.md) | composed | Database snapshots |
| [teams](teams/README.md) | composed | Team roster |

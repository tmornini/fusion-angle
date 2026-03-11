# Web App

**Parent:** [fusion-ai](../README.md)

Frontend application containing all pages and shared infrastructure for the Fusion AI platform.

## Directory Structure

| Directory | Contents |
|-----------|----------|
| [`app/`](app/README.md) | Shared CSS, TypeScript, HTML layout, adapters |
| [`assets/`](assets/README.md) | Static files: fonts (*.woff2), favicon |

25 page directories at the top level, each containing `index.ts` + `index.html`.

## Page Types

- **Composed** — `index.html` contains only page content; at build time, `app/compose.ts` merges it with `app/layout.html` to produce a complete HTML file with sidebar, header, search, and theme toggle
- **Standalone** — `index.html` is a complete hand-written HTML file with `<div id="page-root">` that `init()` renders into

## Entry Point

`index.html` at the web-app root redirects to `landing/index.html`.

## Pages (25)

| Page | Type | Description |
|------|------|-------------|
| [account](account/README.md) | composed | Account overview |
| [activity-feed](activity-feed/README.md) | composed | Activity feed |
| [approval-detail](approval-detail/README.md) | standalone | Review decision page |
| [auth](auth/README.md) | standalone | Login/signup |
| [company-settings](company-settings/README.md) | composed | Company settings |
| [crunch](crunch/README.md) | composed | Data labeling tool |
| [dashboard](dashboard/README.md) | composed | Dashboard with gauge cards |
| [design-system](design-system/README.md) | composed | Component gallery |
| [edge](edge/README.md) | composed | Edge definition (per-idea) |
| [edge-list](edge-list/README.md) | composed | Edge list view |
| [engineering-requirements](engineering-requirements/README.md) | composed | Engineering requirements |
| [flow](flow/README.md) | composed | Process documentation |
| [idea-convert](idea-convert/README.md) | standalone | Idea-to-project conversion |
| [idea-create](idea-create/README.md) | standalone | Multi-step idea wizard |
| [idea-review-queue](idea-review-queue/README.md) | composed | Review queue |
| [ideas](ideas/README.md) | composed | Ideas list |
| [landing](landing/README.md) | standalone | Landing page |
| [manage-users](manage-users/README.md) | composed | User administration |
| [not-found](not-found/README.md) | standalone | 404 page |
| [onboarding](onboarding/README.md) | standalone | Welcome screen |
| [profile](profile/README.md) | composed | Profile settings |
| [project-detail](project-detail/README.md) | composed | Project detail (tabbed) |
| [projects](projects/README.md) | composed | Projects list |
| [snapshots](snapshots/README.md) | composed | Database snapshots |
| [team](team/README.md) | composed | Team roster |

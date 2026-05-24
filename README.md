# Fusion AI

Enterprise innovation management platform for capturing ideas,
defining business cases, and tracking projects through approval
and execution.

## Modules

- **Ideas** — submit, score, and review innovation ideas
- **Flow** — process documentation, flow management, and per-node
  throughput heat map (`flows/stats`)
- **Projects** — track approved ideas through execution
- **Account** — organization settings, users, and billing
- **DB Admin** — database management
  (wipe, reload, upload/download snapshots)

## Getting Started

```sh
git clone <repo-url>
cd fusion-ai
```

Everything operational — build, test, conventions — lives in `CLAUDE.md`.

## Tech Stack

- TypeScript on ES2024, strict mode, zero runtime dependencies
- Build-time HTML composition (shared layout + per-page content)
- CSS custom properties with light/dark theme support
- SVG charts and ~100 inline SVG icons
- Command palette (Cmd+K) with keyboard navigation
- Self-hosted IBM Plex Sans, Inter, and IBM Plex Mono fonts

## Development

All code adheres to the
[`church-of-code`](https://github.com/The-Church-of-Code/church-of-code)
doctrine. Install the plugin into Claude Code:

```
/plugin marketplace add The-Church-of-Code/church-of-code
/plugin install church-of-code@church-of-code-marketplace
```

The maintainer starts every Claude Code session with:

```
claude --effort max 'Go to Church!'
```

Full reasoning effort, doctrine loaded first, then work.

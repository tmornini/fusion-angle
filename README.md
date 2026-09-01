# Fusion Angle

Enterprise innovation management platform for capturing ideas,
defining business cases, and tracking projects through approval
and execution.

## Modules

- **Ideas** — submit, review, and promote innovation ideas
- **Flow** — process documentation, flow management, and per-node
  throughput heat map (`flows/stats`)
- **Projects** — track approved ideas through execution
- **Records** — named data shapes bound to flows and work
  orders
- **Workbox** — claim and transition work orders through
  a flow
- **Identities** — people and service identities, their external
  provider links, and access tokens
- **Account** — organization settings, members, and billing;
  members join by email invitation (accept writes the
  seat; an admin may revoke a pending invite)

The demo is multi-organization: loading mock data seeds two
orgs (Stark Industries and Wayne Enterprises) with a sidebar
org-switcher for the multi-org user. Operator seed prints
sign-in credentials once on stdout from
`./postgres-seed --mock-data`.

**Demo-grade security.** `./build` emits one artifact:
`fusion-angle-server-${SHA}.zip` (Node + Postgres, pages and
API on one origin, `JWT_HMAC_SIGNING_KEY` from the
environment). See [ARCHITECTURE.md](ARCHITECTURE.md)
`## One origin, one ZIP`.

## Getting Started

```sh
curl -fsSL https://deno.land/install.sh | sh -s v2.9.6
git clone <repo-url>
cd fusion-angle
npm ci
```

[Deno](https://deno.com) 2.9.6 runs `./validate`,
`./test`, `./test-postgres`, and both generators,
resolving its own dependencies from `deno.json` and
`deno.lock`.

`npm ci` installs esbuild and postgres.js 3.4.9 at the
exact versions pinned in `package-lock.json`, for
`./build`, `build-lib`, `./test-browser`, and `./crank`.
The ZIP bundles postgres.js into `server.mjs`
(`api/postgres-client.ts` is the only importer) — the
named exception. The unzipped artifact needs no
`npm install`.

## Docs

| Doc | What |
|---|---|
| AGENTS.md | commands, gates, invariants |
| ARCHITECTURE.md | layers, tenancy, KNOWN seams |
| SCHEMA.md | the one table |
| API.md | dispatch and compositions |
| DESIGN-SYSTEM.md | tokens and CSS |
| FLOW-CANVAS.md | designer canvas |
| AUDIT.md | doctrine audit |
| COST-ESTIMATION.md | pre-AI replacement-cost runbook |
| TEST-PLAN.md | three layers; the serial walk |
| TODO.md | critical path, later work, sequencing |

## Tech Stack

- TypeScript on ES2024, strict mode
- Build-time HTML composition (shared layout + per-page content)
- CSS custom properties with light/dark theme support
- SVG charts and ~70 inline SVG icons
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

Full reasoning effort, doctrine loaded first, then work. The
master reads the Full scroll; dispatched subagents read the
Medium scroll (`Go to Medium Church!`) — see AGENTS.md
§ Subagents.

## How we got here

This file used to narrate how the product grew. It is now
the front door: product, modules, clone path, and pointers.

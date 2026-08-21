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
environment). A1–A6 are
disposed as named in [ARCHITECTURE.md](ARCHITECTURE.md)
§ Demo server tier.

## Getting Started

```sh
git clone <repo-url>
cd fusion-angle
npm ci
```

`npm ci` installs the build toolchain (tsc, esbuild) and
postgres.js 3.4.9 at the exact versions pinned in
`package-lock.json`. The ZIP bundles postgres.js into
`server.mjs` (`api/postgres-client.ts` is the only
importer) — the named exception. The unzipped artifact
needs no `npm install`.

Everything operational — build, test, conventions — lives
in [CLAUDE.md](CLAUDE.md); the manual browser regression plan
is [TEST-PLAN.md](TEST-PLAN.md). Architecture, schema, and
design system: [ARCHITECTURE.md](ARCHITECTURE.md) (with
[FLOW-CANVAS.md](FLOW-CANVAS.md)), [SCHEMA.md](SCHEMA.md),
[DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). Audit runbook:
[AUDIT.md](AUDIT.md).

## Tech Stack

- TypeScript on ES2024, strict mode. Zero runtime
  dependencies except postgres.js 3.4.9 bundled into
  the server ZIP (`api/postgres-client.ts` only)
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
Medium scroll (`Go to Medium Church!`) — see CLAUDE.md
§ Subagents.

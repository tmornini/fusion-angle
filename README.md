# Fusion AI

Enterprise innovation management platform for capturing ideas,
defining business cases, and tracking projects through approval
and execution.

## Modules

- **Ideas** — submit, score, and review innovation ideas
- **Flow** — process documentation, flow management, and per-node
  throughput heat map (`flows/stats`)
- **Projects** — track approved ideas through execution
- **Identities** — people and service identities, their external
  provider links, and access tokens
- **Account** — organization settings, users, and billing;
  members join by email invitation (accept creates the
  membership; an admin may revoke a pending invite)
- **DB Admin** — database management
  (wipe, reload, upload/download snapshots)

The demo is multi-organization: loading mock data seeds two
orgs (Stark Industries and Wayne Enterprises) with a header
org-switcher for the multi-org user, and surfaces one-time
demo sign-in credentials on the Snapshots page after a
wipe-and-load.

**Demo-grade security.** The whole stack — OAuth spine
included — runs in the browser, and the JWT HMAC signing key
ships inside the bundle (`api/access-token.ts`), so any party
holding the bundle can mint a valid token. No client-side
mitigation exists or is possible; the auth tier demonstrates
the real wire format and gate logic without providing real
isolation until a server tier holds the key. The full seam
checklist is in [ARCHITECTURE.md](ARCHITECTURE.md)
§ Server-tier deploy blockers.

## Getting Started

```sh
git clone <repo-url>
cd fusion-ai
npm ci
```

`npm ci` installs the build toolchain (tsc, esbuild) at the
exact versions pinned in `package-lock.json`. The toolchain
is dev-only: the shipped bundle keeps zero runtime
dependencies.

Everything operational — build, test, conventions — lives
in [CLAUDE.md](CLAUDE.md); the manual browser regression plan
is [TEST-PLAN.md](TEST-PLAN.md). Architecture, schema, and
design system: [ARCHITECTURE.md](ARCHITECTURE.md) (with
[FLOW-CANVAS.md](FLOW-CANVAS.md)), [SCHEMA.md](SCHEMA.md),
[DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). Audit runbook:
[AUDIT.md](AUDIT.md).

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

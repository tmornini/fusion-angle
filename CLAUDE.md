# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code)
when working with code in this repository.

## Build & Dev Commands

### Commands

```bash
./test                 # Run automated tests (memory backend)
./validate             # Type-check + tests + lint (works on dirty tree)
./build                # Server ZIP to ~/Desktop/
./build --no-zip dir/  # server-core + server.mjs to dir/
./build dir/           # Server ZIP to dir/ instead of ~/Desktop/
./build --help         # Show usage
./serve [port]         # Build + node server.mjs (default 8080)
./wipe-render-postgres TOKEN --pristine|--mockdata  # Wipe Render PG; reseed
./measure              # Full ceremony (record+budgets+25+viz)
./measure --help       # Show usage
./measure --check      # Fail if medians exceed budgets
./measure --record     # Append history (full registry only)
./measure --write-budgets  # mean+1.5σ budgets (full sweep)
./measure --budget-sigmas N  # σ multiplier (default 1.5)
./measure --pages a,b  # Subset of PAGE_REGISTRY keys
./measure --runs N     # Runs per page (default 25)
./measure --visualize  # History HTML from disk (no Chrome)
./measure --profile    # API counts + residual (default 4 pages, 1 run)
./measure --base-url URL  # Hit a running origin (needs --password)
```

**Commit before building.** `./build` and `./serve`
(which runs `./build`) require a clean working directory.
Run `./validate` to catch type errors and lint issues;
commit; then build or serve.

`./serve` and a local `./measure` sweep need
`POSTGRES_URL` and `JWT_HMAC_SIGNING_KEY`. `./serve`
[port] is `HTTP_SERVER_PORT`. For local test-as-you-go:

```bash
export POSTGRES_URL=...
export JWT_HMAC_SIGNING_KEY=...
./serve 8080
# open http://localhost:8080/landing/index.html
```

### Sandbox invocation

When running under the Claude Code sandbox, the default
fails because `/tmp/` is not writable. Use this invocation
instead:

```bash
TMPDIR=/tmp/claude ./serve 8080
# open http://localhost:8080/landing/index.html
```

`TMPDIR=/tmp/claude` redirects `./serve`'s temp build dir
into the sandbox-allowed path.
`localhost` is reachable from the sandbox, so the Chrome MCP
tools can drive the page normally.

### Validate semantics

`./validate` runs `tsc --noEmit` (type checking), then
`./test` (two passes: `TZ=UTC` on `tests/*.test.ts`, then
`TZ=Pacific/Honolulu` on `tests/tz/*.test.ts`; the main
glob is non-recursive so it excludes `tests/tz/`; covers
pure modules and the `api/`, `adapters/`, and `presenters/`
layers via `node --test --strip-types`), then enforces a
78-character maximum line length on all `.ts`, `.html`, and
`.css` files (excluding `compose.ts`), on every `.md` file
at the repo root except [TEST-PLAN.md](TEST-PLAN.md)
(exempted because its entries are meant to scan as one
self-contained line), and on the root scripts `build`,
`serve`, `test`, `validate`, `generate-schema-svg`,
`generate-api-documentation`, `measure`, and
`wipe-render-postgres`. It then rejects the `org`
abbreviation in identifiers under `api/`, `web-app/`,
`tests/`, and `shared/` (`.ts`/`.html`/`.css`; `compose.ts`
exempt) — forms matching `org[A-Z]`, camel/Pascal
`…Org…`/`Org…`/`…Orgs…`/`Orgs…`, `_ORG` (word-end or
`_`/`digit` after), and `ORG_`/`ORG`+digit fail; prose,
URLs, and CSS class names may keep the short form. Finally
it runs the
`generate-schema-svg --check` gate, which fails on
`SCHEMA.svg` drift from the schema of record (`api/db.ts` +
`api/types.ts`), then the
`generate-api-documentation --check` gate, which fails on
`API.svg` / room drift from `routes[]`.

For what each test layer covers, see `## Testing`.

### Measurement

`./measure` is a headless-Chrome page-load benchmark. It is
**not** part of `./validate` — it needs Chrome and takes
minutes (a full 29-page × 25-run ceremony is several
minutes).

**Bare `./measure`** is the full ceremony: `--record` +
`--write-budgets` + `--runs 25` + `--visualize` over the
full `PAGE_REGISTRY` (clean tree required). Explicit
`./measure --runs N` alone is measure + report only
(no history/budget write). `--record` and
`--write-budgets` each require a full registry sweep
(omit `--pages`).

Run deliberately: before builds/releases; after adapter,
derive, or presenter changes; at migration milestones
(bare `./measure` or `--record` on a full sweep).

Stats (median/min/max readyMs, phase medians, and
`--write-budgets` mean+σ) drop the top and bottom 10%
of samples (`ceil(n×0.10)` per tail). Default
`--runs 25` drops three samples per tail
(`ceil(25×0.10)=3`).

Budgets live in `measurements/budgets.json` — per
`PAGE_REGISTRY` page `readyMs` ceiling. Calibrate with
`--write-budgets` (full registry only): each budget is
`ceil(mean + k×sampleσ)` of that page's **trimmed**
samples (`k` defaults to 1.5 via `--budget-sigmas`).
`--check` gates **median** readyMs against those
ceilings. Budgets are a **per-machine-class local dev
gate**, not a CI absolute.

History lives in `measurements/history.jsonl` —
appended only by `--record` (full registry only).
Longitudinal record across the Postgres migration.

`--visualize` regenerates
`measurements/page-load-times-broken-in-ichat.html` from
committed history + budgets (self-contained HTML). The
HTML opens on a **system dashboard** (mean ready trend,
movers, budget pressure, phase mix, all-pages table);
per-page Layout B is drill-down. Trend points show
tooltips (SHA, UTC date, value, runs); drag point→point
sets the Start/End window. Bare `./measure --visualize`
skips the clean-tree gate and Chrome. Bare `./measure`
(ceremony) regenerates viz after record. With an explicit
measure run, pass `--visualize` to regenerate after
success; without `--record`, a note says that this run is
not in history. Missing history or budgets is a hard fail.
Not part of `./validate`. Phase rollup treats
`boot:page-init` as **residual** wall time after nested
`fetch:*` / `render:*` (no double-count in the stacked
bar).

`--profile` prints per-ready API request counts (method +
resource, id segments collapsed to `:id`) plus page-init
residual attribution. Default pages:
organization, workbox, workbox-detail, projects; default
`--runs 1`. Override with `--pages` / `--runs`. Browser-only
hit log in `page-request-profile.ts` (no-op under Node).

In-app instrumentation always ships: `page-performance.ts`
marks boot/fetch/render phases; one `page-performance` info
log fires after ready (default log level `warn` keeps
consoles quiet).

Clean tree required for measure sweeps (same as `./build`
— measures committed bytes); bare `--visualize` alone is
exempt. Bare `./measure` builds `--no-zip` and spawns
`node server.mjs --seed-mock-data` (needs `POSTGRES_URL`
and `JWT_HMAC_SIGNING_KEY`). `--base-url URL` hits a
running origin instead (requires `--password` or
`MEASURE_PASSWORD`; skips seed). Sandbox:
`TMPDIR=/tmp/claude ./measure ...`. Chrome binary:
`$CHROME`, or the macOS default Google Chrome path.

Design:
`docs/superpowers/specs/2026-07-12-page-
performance-measurement-design.md`,
`docs/superpowers/specs/2026-07-12-measure-
visualize-design.md`,
`docs/superpowers/specs/2026-08-08-measure-viz-
dashboard-design.md`.

## TypeScript

Target: **ES2024** · Strict mode with
`noUncheckedIndexedAccess`. Config at
`web-app/app/tsconfig.json`. The `compose.ts`,
`generate-schema-svg.ts`,
`generate-api-documentation.ts`, `measure.ts`, and
`measure-viz.ts` Node entrypoints are excluded from
type checking (they run in Node).

## Architecture

**Vanilla TypeScript.** One ZIP:
`fusion-ai-server-${SHA}.zip`. postgres.js 3.4.9 is
bundled behind `api/postgres-client.ts` only (named
exception). The client entry is
`web-app/app/server-core.ts` (fetch facade). The
process is `server/boot.ts` / `server.mjs`.
Enterprise innovation management platform with modules for
ideas, projects, members, flows, and workbox, plus a
dashboard and flow statistics.
Every page is a standalone HTML file served by
`node server.mjs` on one origin. Testing is HTTP-only.

### Key Layers

- **HTML Composition.** `web-app/app/compose.ts` assembles
  `components-layout.html` + `component-*.html` + each
  registry page's `{sourceDir}/{sourceFile}.html` into
  composed standalones in a temp build dir.
  Standalone pages skip the layout wrap but still have their
  `{{PAGE_CSS_LINKS}}` placeholder filled from `cssBundles`
  before they are written.
- **Navigation.** `<a href>` between pages. `navigateTo(page,
  params?)` builds relative URLs.
- **Page Detection.** `<html data-page="dashboard">` →
  `PAGE_REGISTRY` lookup → page module's `init()`.
- **Source = Output Alignment.** `PAGE_REGISTRY` declares
  `sourceDir` and `sourceFile`. Both `compose.ts` and
  `navigateTo()` resolve output as
  `{sourceDir}/{sourceFile}.html` — the file you edit is the
  file the browser loads.
- **Auth.** Real OAuth 2.1 spine.
  `/api/authentication/token` (grant dispatch) +
  `/api/authentication/authorize` (password loop)
  mint/verify HMAC-SHA256 JWTs (`api/access-token.ts`);
  a Bearer gate in `handleRequest` enforces them. The
  `authorization_code` grant is TTL-bound, client-bound, and
  PKCE S256-verified. Authorize without S256 is rejected.
  The client sends S256. A client is a kind-'service'
  identity + a registration facet
  (`identities/:id/registration`, admin-realm, kind-gated);
  `grantClientCredentials` derives it pre-token, and
  authorization_code redemption stamps `act.sub` with the
  acting client. Token lifecycle (issue/rotate/revoke) lives
  only as message-pair events now — `identity_tokens` and
  `authorization_codes` are RETIRED tables (Phase 13 Task 9);
  the `identity_token_revocations` ledger backs the gate.
  New passwords hash with scrypt; PBKDF2 still verifies,
  then rehashes. There is no `SIGNING_KEY_MATERIAL`.
  `JWT_HMAC_SIGNING_KEY` is required. Refresh is an
  HttpOnly cookie (`Path=/api/authentication`); token
  JSON has no `refresh_token`; cookie-session access
  is memory-only. 401 classes:
  `invalid_token` / `invalid_client` / `invalid_grant`.
  Membership, roles, and revocation ride claim snapshots
  (NAMED COVENANT: bite at next mint/refresh/exchange or
  access TTL ≤ 15 min), not live pair-plane re-reads.
  Ownership and default-organization fences stay
  pair-plane. See [ARCHITECTURE.md](ARCHITECTURE.md)
  § Demo server tier.
- **Tenancy.** Every authenticated request runs org-scoped
  on the **pair plane**. `fenceRequest` completes the vessel
  with organization, live memberships, and roles from the
  VERIFIED token claim (never the path); handlers receive
  `ctx.base` — there is no `organizationScopedAdapter`.
  Surviving stores are global; tenancy rides
  `uri_collection`. A flat (un-exchanged) token
  resolves its org via
  `identityDefaultOrganization`: the identity's SET
  default organization (pair-plane
  `/identities/:id/default-organization` document) if
  that organization is a live seat, else PRIMARY
  (earliest remaining join `at`, lex id on tie), else a
  403 — there is no global default. Membership and
  roles come from access-token claims (baked at mint
  from membership `type`; gate projects for the
  fenced org). NAMED
  COVENANT: de-membership / demotion / revocation bite at
  next mint/refresh/exchange or access TTL (≤ 15 min), not
  the very next request. Ownership fences stay pair-plane.
  Org-scoped PUT/DELETE hit the write authorizer
  (`writeAuthorizerFor` → `resolveGlobalOwner`) so a
  foreign id 403s rather than genesis-ing in the caller's
  namespace; genuine absence still 404s (or genesis on
  PUT). Authentication runs before the no-match 404 —
  unauthenticated callers get 401 on any non-exempt path
  (including unknown and retired routes), never a route-
  topology oracle. `organizations` is the tenant root;
  seats join identity↔org; the members roster is
  seats + ai-agents. A seat pair is created when an
  invitee ACCEPTS an invitation (the product path;
  `web-app/app/adapters/invitations.ts` + the
  `invitations` facade) — accept stamps the
  INVITATION's org, not the caller's active org.
  Per-org roles via `projectClaimRolesForOrganization`.
  See [SCHEMA.md](SCHEMA.md) /
  [ARCHITECTURE.md](ARCHITECTURE.md).
- **Data.** REST-style API (`api/`) over Postgres.
  The page talks `fetch` (`adapters/http-facade.ts`).
  Adapters in `web-app/app/adapters/` shape pages from
  pair-plane derives. The live flow graph is pair-plane
  only: GET reassembles `FlowWithGraph` from the
  document body's `graph` field; `graphDelta` /
  `revivals` are write-side sidecars. A work order
  freezes its own `flow_graph` inside the work-order
  document pair. Flow undo resolves its restore target
  from the flow's own document-pair history (Phase 14
  Task 8). Lifecycle history is per-entity GET
  (`GET organizations/:id/<family>/:id/versions/`
  for ideas / projects / record-types / flows /
  objectives; work-orders stay
  `GET organizations/:id/work-orders/:id/history`; plus
  `GET .../record-types/:type/instances/:id/versions`
  for value revisions) — wire `(at, id)` DESC; work-
  order routes fold `field_values` inline. Ideas /
  projects / record-types / objectives GET rows keep
  domain `state` and do not embed `state_at` /
  `state_event_id`. Flat `/records` and
  `/record-attributes` are RETIRED (router 404). Phase
  15 retired table-backed `flows/:id/versions[...]`
  writes; pair-chain GET is live. Instance public PUT
  is 405; PATCH creates. Zero-caller shared
  event-append / current-state-alias / nested
  field-values families — all router 404.
  Phase Final DELETED the graph/version tables with the
  rest of the row plane. Ownership fences resolve on
  the pair plane (`resolveOwningOrganization`,
  `stateEventVisibilityFor` for RESTRICT). Flow tags
  (`flows/:id/tags/:name`) are the first document family
  that never had a backing table; post-Final every family
  shares that posture.
- **Presentation.** Presenters in `web-app/app/presenters/` emit
  `SafeHtml`.
- **Database.** Product: Postgres
  (`api/backend-postgres.ts`, DDL in
  `api/schema-postgres.ts`) — BYTEA Latin-1;
  postgres.js 3.4.9 behind `api/postgres-client.ts`
  only. Required env (never logged): `POSTGRES_URL`,
  `JWT_HMAC_SIGNING_KEY`, `HTTP_SERVER_PORT`. Tests:
  memory (`api/backend-memory.ts` / `api/db-memory.ts`).
  There is no IndexedDB or localStorage **data**
  backend. Theme and sidebar still use localStorage.
  `TABLE_NAMES` is two: `requests`, `responses` — the
  pure message plane, both on `HistoryEntityStore`.
  Every store op crosses the `StorageBackend`
  transaction seam (`api/db.ts`). The memory backend
  simulates the same transaction (buffer then flush)
  for `./test` / `./validate`. Domain state derives
  from the message plane; alphabets live in
  `api/types.ts` / [SCHEMA.md](SCHEMA.md).
- **State.** Module-level vars + pub-sub for theme, mobile,
  auth, sidebar.

For deeper detail: layers, patterns, and conventions in
[ARCHITECTURE.md](ARCHITECTURE.md) (which links the Flow
Designer canvas, [FLOW-CANVAS.md](FLOW-CANVAS.md)); storage
shapes and the state alphabets in [SCHEMA.md](SCHEMA.md); UI
tokens, theming, and CSS architecture in
[DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## UI & Styling

### CSS-first styling

All styling lives in `web-app/app/styles/`. Do not use inline
`style="..."` strings except:

1. **Dynamic per-element values.** Progress widths, fill
   percentages, heat intensities — passed via CSS custom
   properties: `style="--progress-fill:${value}%"` consumed
   by a CSS rule reading `var(--progress-fill, 0%)`; the
   flow-stats heat ramp uses the same pattern with per-node
   `style="--heat-t:${0..1}"` — see
   [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) § Heat ramp. The
   value is **data**; the colors stay in the design system.
2. **Measure-viz HTML.** `measure-viz.ts` writes the self-
   contained history dashboard with inline bar widths and
   swatch backgrounds (no app CSS cascade).

The variant pattern is `data-tone` / `data-level` attributes on
a base class. The TS enum and the CSS attribute selector share
one source of truth.

When extending CSS: `components-X.css` for patterns used by
3+ pages (one file per family — buttons, cards, dialog, etc.),
`pages-X.css` for page-scoped patterns (each page declares its
bundles in `cssBundles` per `page-registry.ts`), `utilities.css`
for single-property primitives. Do not use raw hex colors;
use `hsl(var(--token))`. See
[DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) § 12 CSS Architecture
for the full cascade order, per-page bundle mechanism, and
decision tree.

### Component Library

All UI components are vanilla HTML/CSS with ARIA attributes,
defined as CSS classes in `web-app/app/styles/` and helper
functions across `web-app/app/` modules. No external
component library.

**Dialog pattern.** Native `<dialog>` driven by `openDialog(id)`
/ `closeDialog(id)` from `dialog.ts`. The element is
`id="{id}-dialog"` with `class="dialog"` (and `aria-labelledby`
to its title); `openDialog` calls `showModal()` — the platform
supplies the top-layer focus trap, the `::backdrop`, and Escape
(the `cancel` event) — and `closeDialog` calls `close()`. No
backdrop div, no `hidden`/`aria-hidden`. Open and cancel
controls carry `data-dialog-open="{id}"` /
`data-dialog-cancel="{id}"`; each page routes its clicks through
`handleDialogClick(target, e)` (from `dialog.ts`), which opens,
closes, and light-dismisses by those attributes — one voice
across every dialog. Submit/confirm stay page-specific (a
`#{id}-submit` listener or a `data-*-action`).

**Tab pattern.** Use `initTabs('[data-tab]', '.tab-panel',
'active')` from `dialog.ts` — the third arg is the
active-state class. Tab buttons use `data-tab="{name}"`
attribute, panels use `id="tab-{name}"`.

### Design System

See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). Key invariant: do
not use raw hex colors in CSS; use `hsl(var(--token))`.
Icons are ~70 inline SVG functions in
`web-app/app/icons.ts`.

**Heat ramp.** See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) § Heat ramp.

### Mobile Responsiveness

CSS media queries in `web-app/app/styles/layout.css` show/hide
desktop vs mobile header and sidebar; `responsive.css` carries
the grid-column and visibility utility overrides plus the
reduced-motion block. Mobile sidebar uses Sheet (slide-in
drawer) toggled by JS. Breakpoints: sm 640px, md 768px,
lg 1024px, xl 1280px.

## Project Structure

`api/` — the server REST/DB-schema handlers (Node +
Postgres on the product path; memory in `./test`):
REST routing, DB adapter interface, mock data,
validators, plus the auth/authz/tenancy spine:
`authentication.ts` (OAuth grants), `access-token.ts` (JWT
mint/verify), `authorization.ts` (per-org roles), the
pair-plane org fence (`fenceRequest` / `ctx.base` —
`db-organization-scoped` / `store-organization-scoped`
DELETED with Phase Final), and pair-plane identity
derives (`derive-identity-spine.ts`,
`derive-organizations.ts`,
`derive-memberships.ts`).
`shared/` — code that crosses the client/server chasm, imported
by both `api/` and `web-app/`: the HTTP wire schema
(`http-message/`, with its own `types.ts`) plus pure cross-chasm
utilities (`base64url.ts`, `crypto-safe-base62.ts`,
`digest.ts`, `password-hash.ts`, `ledger-reduction.ts`,
`error-helpers.ts`).
The dependency is one-way: `shared/` NEVER imports `api/`.
`web-app/app/` — all source (TypeScript + CSS), with
subdirectories `adapters/` (data-access + platform shims, both
kinds share the folder), `presenters/` (presenter classes
producing `SafeHtml`), and `styles/` (cascade-ordered CSS
modules); `organization-switcher.ts` is the sidebar-footer org
`<select>` (multi-org only) and `app-boot.ts` scopes boot
to the active org. `adapters/invitations.ts` is the
invitation adapter; the top-bar pending-invitations bell
lives in `invitations-indicator.ts`.
`web-app/{dashboard,organization,ideas,projects,flows,members,`
`invitations,identities,...}/` — page directories registered
in `PAGE_REGISTRY` (sidebar-layout + standalone). The
`identities` surface (list, detail, providers, tokens) shares
the `identities` sidebar key; `invitations/` is the invitee's
own pending-invitations page (reached via the top-bar bell,
sharing the `members` sidebar key). `billing/` is a stub.

`server/` — Node boot, HTTP adapter, scrypt, seed flags,
auth throttle (`server/boot.ts` is the process).
Product composition root: `web-app/app/server-core.ts`
(fetch facade). Test composition root:
`web-app/app/adapters/init.ts` (memory). Run `ls` or
read file headers — both are more current than this
document will ever be.

## Build

`./build` requires a clean working directory. Output is
one ZIP at `~/Desktop/`: `fusion-ai-server-${SHA}.zip`.
`--no-zip` writes the server-core bundle and `server.mjs`
to a directory (what `./serve` uses). Use `./build --help`
for options. The build script itself is the source of
truth for what gets composed, bundled, and copied — read
it, don't read this section. The client-graph metafile
must not contain `SIGNING_KEY_MATERIAL`,
`backend-indexeddb`, or token mint
(`api/access-token.ts`).

## Testing

Two layers, both zero-dependency.

### Automated tests

Node's built-in `node:test` runner with `--strip-types`,
no test-framework dependency (devDependencies are
`esbuild`, `typescript`, and `postgres` 3.4.9 —
postgres.js is bundled into `server.mjs`, never
imported by application code).
Tests cover pure modules, flow-edit business logic
(`tests/flow-operations.test.ts`), every data adapter
(including `adapters-members-union.test.ts` and
`adapters-flow-publish.test.ts`), workbox inbox, mermaid
round-trip, in-browser ZIP (flow export, `zip.ts`), the
memory transaction backend, the tx runners and view, the
commit batch route, api routing, navigation, mock-data
validity (pair count 1448 / bootstrap 8 absolute; the
mock-data fingerprint file retired with the clients
table), client registration facet + derive, the two-tier
hazard predicate (`flow-graph-hazard.test.ts`), presenter
SafeHtml, flow-stats pure math + adapter + presenter,
`duration-units`, and the invitation lifecycle.
Phase 14 cores: `drift-phase14-cores-parity.test.ts`,
`drift-state-field-values.test.ts` (RESTRICT fold parity),
`pin-invitation-write-path-parity.test.ts`,
`flow-undo-cursor.test.ts`, `api-flow-tags.test.ts`.
Phase 15 cores: `drift-phase15-cores-parity.test.ts`,
`api-history-ownership-fence.test.ts` (family-history
ownership fence; own-org 200 / foreign 403). States-URI
elimination pins: `api-work-order-history.test.ts` (per-id
DESC, inline `field_values`; bulk 404),
`api-entity-history-routes.test.ts` (trio-family per-id),
`api-members-history.test.ts`,
`api-objective-history.test.ts` (per-id; bulk 404). Phase
Final adds the write authorizer pin
(`api-write-authorizer.test.ts`); organization-scoped
store/decorator tests and dual-write shadow-ledger row
oracles retired with their subjects; HistoryEntityStore
validation tests remain
(`tests/store-entity-validation.test.ts`). Honest HTTP
status covenant pins:
`api-unauthenticated-route-ordering.test.ts` (401
before 404), foreign-org 403 body pins across
fence/isolation/drift suites, work-order history
foreign/absent miss postures. See `tests/` for the
current set.
`api/db-memory.ts` provides an in-memory `DbAdapter` so
adapter and api-layer tests run without Postgres.

Run via `./validate` (which also type-checks and lints) or
`./test`, which pins `TZ=UTC` for the main suite and
`TZ=Pacific/Honolulu` for the timezone suite in `tests/tz/`
(excluded from the non-recursive main glob).

### Manual browser regression

UI behavior runs against [TEST-PLAN.md](TEST-PLAN.md),
driven either by a single human tester
serially or by Claude Code agents in parallel via the
`claude-in-chrome` MCP. Anything DOM-driven (gestures, layout,
visual rendering) lives here; where a manual case is the
browser counterpart of an automated area it carries an inline
pointer at the test file. Pure transitions, flow-edit logic,
adapters, presenter output, and API routing live in the
automated suite. The six-phase agent protocol, the per-entity
mutation-domain table, the `StorageEvent` tolerance patterns,
and the known MCP limitations (flow-designer gesture
pointer-capture, `resize_window`, file I/O, kill EPERM) live
in [TEST-PLAN.md](TEST-PLAN.md) § Protocol — CLAUDE.md does
not duplicate them.

### Orchestration

When an agent runs the full test plan (CLI + browser),
`./validate` is the gate: a failing type-check, test, or
line-length lint ABORTS the run automatically. Do not ask
whether to continue — the bundle is built from the same
source, so a failing CLI suite makes the browser run
meaningless. Report the failure, stop, await fix.

The full evidence-based audit — one indoctrinated agent per
scripture section, whole repository, report-only — is the
runbook in [AUDIT.md](AUDIT.md); the abort rule above does not
apply to it (RED is the audit's first finding).

## Gotchas

- **`noUncheckedIndexedAccess`.** tsconfig enables this —
  array/object index access returns `T | undefined`,
  requiring explicit `!` assertions or guards.
- **ES2024 target.** No transpilation. Native
  `Object.groupBy()`, `Map.groupBy()` are available. Assumes
  modern browser.
- **Cross-tab theme sync.** `state.ts` listens to
  `StorageEvent` and syncs theme changes across browser tabs
  automatically.
- **Non-critical writes logged at warn.** localStorage writes
  for theme and sidebar state are wrapped in try/catch that
  log at `warn` level — quota errors don't break the app but
  are observable via the logger.
- **Operator seed is below HTTP.**
  `--seed-bootstrap` and `--seed-mock-data`
  call `postBootstrap` / `postMockDataLoad`
  in-process on an empty database and print
  credentials once on stderr. They stamp
  `schema_marker` last so a failed seed
  reads as empty. There is no HTTP
  dump/restore.
- **HTTP only.** Page URLs use relative paths.
  Pages are `/ideas/` or `/ideas/index.html`.
  The API is `/api/…`. The product is
  `node server.mjs` on one origin. Testing is
  HTTP-only.
- **View Transition aborts.** rapid programmatic navigation
  surfaces both `AbortError: Transition was skipped` and
  `InvalidStateError: Transition was aborted...` lines in
  console — Chromium throws both classes for the same root
  cause. Browser-internal (no app code calls
  `startViewTransition`); no app impact.
- **Lifecycle is append-only on the pair plane.** An
  entity's current state is the latest derived event on its
  `entity_id` under the `(at, id)` total order. Reversal is
  a *new* event with the new state, not an edit of a prior
  pair. Surviving HTTP surface (reads only, per-entity
  history + one value-history, wire DESC):
  `GET organizations/:id/<family>/:id/versions/` for
  ideas / projects / record-types / flows / objectives;
  work-orders stay
  `GET organizations/:id/work-orders/:id/history`
  (org-nested empty → foreign 403 / absent 404),
  work-order `field_values` folded **inline** on the WO
  history route (no successor field-values GET), and
  instance value-revision history at
  `GET .../record-types/:type/instances/:id/versions`
  (`{at, etag, values}` DESC by current read ACL). Entity
  GET rows for ideas / projects / record-types /
  objectives keep domain `state` and do not embed
  `state_at` / `state_event_id`.
  Lifecycle writes are document-trio PUTs
  (ideas/projects/record-types/flows/objectives)
  and named ops (work-order create/claim/transition/
  release, invitations); instance public PUT is 405;
  values ride PATCH / DELETE tombstone — every
  verb on the retired shared event-append address and
  flat `/records` / `/record-attributes` is router 404;
  `stateEventCollisionFromPairs` is gone. The `states`
  table and `StateStore` class are DELETED (Phase Final);
  `EntityStore` remains as the store interface implemented
  by `HistoryEntityStore` on the message plane. Document
  DELETE is a marked tombstone pair; the sole physical
  hard-delete is PII erasure on the message plane.
- **Same-tab refresh; other browsers stale until
  navigation.** A successful write in this tab
  notifies via module pub-sub
  (`ideaChanges.notify()` and siblings) and posts
  a scoped BroadcastChannel event
  (`fusion-ai:data`) so other same-origin windows
  of this browser refresh. Writes
  `pg_notify('fusion_events', …)` on the server;
  there is no LISTEN and no SSE client. A second
  browser stays stale until navigation.
  Theme/sidebar still sync over `StorageEvent`
  (they stay in localStorage).
- **Transaction bodies await only row ops.** Every
  `transaction(…)` body awaits ONLY row ops —
  validators, crypto, hash, `serializeWire`, and scrypt
  run OUTSIDE the tx. Sync compute between row ops is
  fine. Nested `view.transaction` re-enters the same
  tx; its tables must be a subset of the outer set.
- **Field values reference record attributes by id** in the
  pair-plane body (`attribute_id` → a record-attribute
  document id), never a table named `attributes`. See
  [SCHEMA.md](SCHEMA.md) and
  `api/derive-state-field-values.ts`.

## Commits

Commit completed, tested work. Do not ask.

Going-forward discipline (the Office of the Commit is the full
doctrine):

- One concern per commit — tiny, semantically contiguous.
- Subject: a single line ≈50 chars, present-tense imperative,
  no prose body beyond the mandated `Co-Authored-By` trailer.
- Never move/rename and change content in the same commit.
- Linear history — rebase and fast-forward, never merge.

## Worktrees

Do not use git worktrees. Work directly in the main checkout.
Worktrees fragment review surface, hide state from the
working tree, and add ceremony without buying isolation that
small focused commits don't already provide.

## Subagents

Subagents inherit no scripture and read no CLAUDE.md by
default. Every subagent prompt MUST begin with the literal
phrase `Go to Medium Church!` — this invokes the
`church-of-code` skill in the subagent's session and directs
it to read the Medium scroll
(`CHURCH-OF-CODE-medium-context.md`), not the Full one. The
Medium scroll keeps every doctrine and trims only
elaboration; at fan-out the token economy compounds. A
subagent unproselytized is a heathen given a hammer.

**The scroll policy is codebase-wide.** The master session
reads the Full scroll (`Go to Church!`); every dispatched
subagent reads the Medium scroll (`Go to Medium Church!`).
This governs all work in this repo — the master conducts and
keeps the complete voice, the subagents fan out and pay the
Medium price. Even the doctrine audit ([AUDIT.md](AUDIT.md))
follows this: its orchestrator conducts as master and goes
Full, while its hunters and refuters fan out as subagents and
go Medium.

The scripture is universal; the codebase is local. After
the proselytization, the dispatching agent MUST also push
down the codebase-specific patterns the scripture itself
cannot know:

- **Voice rules.** 78-char max line, 4-space indent, no
  inline styles (use CSS custom properties + classes per
  the styling section above), present-tense imperative
  commit messages, Co-Authored-By trailer.
- **Commandments touched by the task.** Name them.
- **Abominations the task specifically risks.** Name them.
- **Existing codebase patterns to match.** RequestContext
  as the first argument to adapter methods, SafeHtml from
  presenters, snake_case storage / camelCase domain,
  HTTP-verb adapter naming (`getNoun`/`putNoun`/`deleteNoun`/
  `postNounOperation`), validators at the gate not
  downstream, no untyped `any` from external boundaries.

Proselytize first, then brief — the scripture loads via the
skill, the patterns load via the prompt.

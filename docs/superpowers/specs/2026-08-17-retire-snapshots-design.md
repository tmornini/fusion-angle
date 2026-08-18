# Retire Snapshots — Design

Date: 2026-08-17
Status: draft (brainstorm 2026-08-17; awaiting user review)

## Context

Pointing a browser at `fusionangle.com` or `fusionangle.ai`
paints the snapshots page for a moment. That paint is not a
live database miss. Product boot already hardcodes
`hasSchema: true`. The apex `/` serves a blank `index.html`
that runs `root-redirect.js`. That script reads localStorage
`fusion.schema-present`. Unset (first visit, incognito,
cleared storage) is treated as "no data" and sends the
browser to `snapshots/index.html`. The snapshots HTML
paints. Then `server-core` boots, treats the page as
auth-gated, and bounces away.

Snapshots were the IndexedDB-era first-run wizard and
ledger dump/restore. The product is a Postgres origin that
refuses to listen without `schema_marker`. The page, the
boot bounce, and the HTTP plane are one friend. We are
saying goodbye.

## User decisions

1. **Transport only (cut A).** The page, boot hops, and
   HTTP `/snapshots/*` plane go. Operator
   `--seed-bootstrap` / `--seed-mock-data` and
   `mock-data.ts` stay. Those birth a database.
2. **Apex `/` always opens auth.** No schema branch. No
   cookie probe. No new `/authentication` door. Landing
   stays at `/landing/index.html`.
3. **Landing's two-second dashboard shove dies.** The
   page stays until the visitor clicks through.
4. **No named snapshot statuses.** The global gate is
   unchanged: no bearer on a non-exempt path is 401,
   including unknown paths. A bearer on a miss is 404.
   Snapshot-named 401 pins die with the suites.

Superseded in brainstorm: session-aware apex (landing if
unsigned, dashboard if cookie live). Abandoned so `/`
opens no new door and flashes no product page.

## Non-goals

- Do not delete operator seed flags or `mock-data.ts`.
- Do not delete in-process `hasSchema`,
  `postSchemaCreation`, or `deleteSchema`.
- Do not widen the refresh cookie off
  `Path=/authentication`.
- Do not add `/authentication/continue` or any other
  session-oracle route.
- Do not rename homonyms: token claim snapshots, flow
  graph snapshots, `presenter.snapshot()`.
- Do not rewrite measure history. Old `snapshots` rows
  stay on disk as a record of the dead page.

## Design

### A. What dies

The snapshots *transport*:

- `web-app/snapshots/` (page HTML and module)
- `web-app/app/styles/pages-snapshots.css`
- `PAGE_REGISTRY.snapshots` (sidebar item, command
  palette keywords, measure page key)
- `root-redirect.ts` schema branch (destination becomes
  always `auth/index.html`)
- `bootApp` hop to snapshots when `!hasSchema`
- `redirectIfMissingTable` and
  `recoverMissingTable`
- Client `requiresSchema` flag (only consumer was that
  hop)
- `web-app/app/adapters/schema-marker.ts` and the
  `fusion.schema-present` preference
- `web-app/app/adapters/snapshots.ts` and its export
- `api/snapshot-validator.ts`
- `web-app/app/presenters/credential-reveal.ts` and
  `pages-snapshots` credential-reveal CSS
- Route registrations: `snapshots/schema`,
  `snapshots/mock-data`, `snapshots/bootstrap`,
  `snapshots/import`
- `BOOTSTRAP_ROUTES` and the write-notification arm
  that posted `kind: 'full'` because a snapshot
  replaced the store
- `DbAdapter.getSnapshot` / `putSnapshot`
- Import pre-flight: `scanForRetiredKeys`, quota
  check, `SNAPSHOT_IMPORT_LOCK_NAME`,
  `SNAPSHOT_EXPORT_ISOLATION`

They are gone. They are not a retired-but-named
surface.

### B. What stays

Operator birth, below HTTP:

- `server/seed.ts` flags `--seed-bootstrap` and
  `--seed-mock-data`
- `api/mock-data.ts` and `api/mock-data/`
- `postMockDataLoad` / `postBootstrap` called
  in-process
- Seeded credentials printed once on stderr
- `hasSchema` / `postSchemaCreation` / `deleteSchema`
- Server refuse-to-listen without `schema_marker`

This app has no public signup. Bootstrap plants the
first admin and first organization. Mock data is the
demo garden tests and `./measure` eat. Neither is the
friend we are burying.

### C. Apex and landing

`/` stays a blank document plus `root-redirect.js`.
The script always `putLocation('auth/index.html')`.
No localStorage read. Auth does not bounce a live
session; a signed-in visitor who hits `/` sees the
login form and stays. That is accepted.

Landing remains a separate public page. `init` drops
the `AUTO_REDIRECT_MS` timeout that sent everyone to
the dashboard after two seconds. Sign-in buttons keep
`putLocation('../auth/index.html')`. The landing logo
already points at `../index.html`; after this change
that hop lands on auth. That is accepted.

### D. Boot and failure

Delete the client schema-gate: `requiresSchema`,
`BootOptions.hasSchema`, `BootOptions.recoverMissingTable`,
`redirectIfMissingTable`, and `putSchemaPresent`.
`bootApp()` takes no schema options. Product
`server-core` just calls it.

A missing table is a failed page.
`handlePageLoadError` already paints the retry state.
Sidebar chrome that branched on client `hasSchema`
branches on authentication only: the product never
boots without a marker.

Server boot is unchanged. No marker, no listen.
`initAdapter()` may still return
`adapter.hasSchema()` for tests; that is the
in-process backend method, not the deleted
localStorage marker.

Public pages stay exempt only via `requiresAuth:
false` (landing, auth, not-found, design-system).

### E. HTTP

The four registrations leave the route table.
`BOOTSTRAP_ROUTES` leaves `request-auth.ts` and
`api.ts`. Authorization comments that name snapshots
as a special case go.

Status is the global gate, not a snapshot courtesy:

- Unsigned caller, any non-exempt path, including a
  path that never existed → 401
- Bearer on a miss → 404

`GET /snapshots/schema` is then indistinguishable from
`GET /no-such-door`. Do not keep a test that names
snapshots to pin that.

Seed no longer has an HTTP face. `./measure` and local
`./serve --seed-mock-data` keep calling the operator
flag.

### F. Tests, docs, measure

Delete snapshot-named suites:

- `tests/adapters-snapshots.test.ts`
- `tests/api-server-tier-snapshots.test.ts`
- `tests/snapshot-import-validation.test.ts`
- `tests/snapshot-import-identity-validation.test.ts`
- `tests/snapshot-quota.test.ts`
- `tests/snapshot-wipe-on-fail.test.ts`
- `tests/snapshot-mock-data-round-trip.test.ts`
- `tests/snapshot-retired-prefixes.test.ts`
- `tests/snapshot-pre-break.test.ts`

Rewrite or drop cases that only exist to drive
`PUT /snapshots/import` or adapter
`getSnapshot`/`putSnapshot` (`store-acceptance`
loud-reject, `pg-races` import lock, `api.test`
mock-data-over-HTTP, `pair-write-coverage` listing
`BOOTSTRAP_ROUTES`, `authorization.test` /
`api-token-gate.test.ts` /
`api-unauthenticated-route-ordering.test.ts`
snapshot-named pins). Keep a generic unknown-path
401 pin that does not say "snapshots".

Keep seed suites: `mock-data-*.test.ts`, `pg-seed`,
operator-flag tests. They call `postMockDataLoad` /
`postBootstrap` in-process.

TEST-PLAN: drop G30–G35, AA1, I26, SV5, and the
snapshots clauses of A2 / A4 / B19 / B29. A2 page
count becomes 17 directories / 28 HTML pages. A4: `/`
hops to `auth/index.html` always.

Scripture loses the snapshot plane: `CLAUDE.md`,
`API.md`, `API-TREE.md`, `ARCHITECTURE.md`,
`SCHEMA.md`, `README.md`, `DESIGN-SYSTEM.md`.
Operator seed and `schema_marker` stay described as
birth, not as a user verb.

Measure: drop the `snapshots` key from
`measurements/budgets.json`. Do not rewrite
`history.jsonl`. The registry no longer lists the
page, so new sweeps do not measure it.

## Out of scope later

A later change may send `/` to landing, or hop a live
cookie session to dashboard. That is a new door or a
new flash, and a new spec. This funeral does not open
it.

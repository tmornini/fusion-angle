# Page Performance Measurement — Design

Date: 2026-07-12
Status: approved (brainstorm 2026-07-12; all user gates passed)

## Context

The app is heading to permanent on-server deployment with a
Postgres backend replacing the in-browser IndexedDB tier. Page
load and render time must be measured and tracked now so
performance does not degrade unnoticed through the migration.

TEST-PLAN.md documents org-scoped list pages taking 5–14 s to
paint (Flows worst). Today that is only a "wait longer"
tolerance note — not a gate, not a trend line, not a per-phase
split that would tell a migration engineer whether fetch or
render regressed.

The instrumentation and harness land before the server tier so
the same measures feed a local benchmark gate now and RUM later.

## User decisions

1. **Both, phased** — instrument the app once; consume twice
   (local benchmark gate now, RUM when the server tier lands).
2. **Zero-dep CDP harness** — no Playwright; Node's built-in
   WebSocket speaks Chrome DevTools Protocol to
   `chrome --headless=new`.
3. **Budget gate + history** — committed per-page budgets,
   `--check` fails loudly (drift-gate posture); committed JSONL
   history appended by `--record`.
4. **Tool name is `./measure`** (not `./perf`).

## Design

### A. In-app instrumentation — always on, ships in bundle

New module `web-app/app/page-performance.ts` wrapping
`performance.mark` / `performance.measure` (platform primitive;
precedent: `debouncer.ts` uses `performance.now()` + logger).

#### Boot phase marks

`core.ts` DOMContentLoaded orchestrator marks each phase
boundary it already owns. Measure names are wire-stable:

- `boot:db-open`
- `boot:schema-gate`
- `boot:auth-gate`
- `boot:organization-scope`
- `boot:sidebar-chrome`
- `boot:command-palette`
- `boot:module-import`
- `boot:page-init`

#### Module load vs page init

`page-loader.ts` splits `entry.loader()` (module import) from
`mod.init()` (page init) so the two boot measures above stay
distinct.

#### Fetch vs render (migration-critical)

`loadInto()` measures:

- `fetch:${container.id}` around `cfg.fetch()` — adapter time
  (IndexedDB now, Postgres later)
- `render:${container.id}` around `cfg.onData` — presenter +
  setHtml

This split is the migration signal: a server-tier change that
moves latency into the network must not hide inside a single
"page ready" number.

#### Ready sentinel and structured log

When boot completes (after `initPageModule` resolves), record
`page:ready` spanning `timeOrigin` → now, then emit ONE
structured log line via `logger.ts` at `info` level, context
`'page-performance'`, fields:

- `page`
- `readyMs`
- each phase ms
- `ttfbMs` + `domContentLoadedMs` from
  `PerformanceNavigationTiming`

Default log level is `warn`, so ordinary consoles stay quiet;
raising level surfaces the line for ad-hoc inspection.

#### Invariants

- No try/catch wrapping (Sin of Internal Defense); platform
  primitives only.
- Instrumentation never alters boot semantics — marks only, no
  awaits added.
- Aborted boots (auth redirect, schema bounce, page error)
  never record `page:ready` — the harness treats a missing
  sentinel as a loud failure.

### B. `./measure` harness — zero-dep CDP

#### Entry points

Root wrapper `./measure` (7-line bash, exact pattern of
`./generate-schema-svg`):

```bash
node --strip-types web-app/app/measure.ts "$@"
```

`web-app/app/measure.ts` — Node-only CDP driver, added to
`tsconfig.json` `exclude` alongside `compose.ts` and
`generate-schema-svg.ts`.

Pure logic in `web-app/app/measure-core.ts` — type-checked,
unit-tested:

- median
- budget comparison (over / under / page-missing-from-budgets /
  budget-for-unknown-page → all failures)
- history-line shaping
- report formatting

#### Flow

1. **Build.** `./build --no-zip "$TMP/"` (trailing slash
   required; clean tree required; temp dir under
   `${TMPDIR:-/tmp}` per sandbox convention
   `TMPDIR=/tmp/claude`).
2. **Serve.** Spawn `python3 -m http.server PORT --directory`.
3. **Launch Chrome.** `$CHROME` env else macOS default path;
   flags `--headless=new`, `--remote-debugging-port` (parse
   `DevToolsActivePort` in throwaway `--user-data-dir`); fail
   loudly if Chrome is absent.
4. **CDP.** Node's global WebSocket (Node ≥22; repo runs v26).
5. **Seed.** Navigate `snapshots/index.html`, click
   `#reload-btn`, confirm `#confirm-wipe-submit`, poll for
   `#credential-continue-btn`, scrape credentials for
   `demo@example.com` (Tony Stark — multi-org), click continue.
6. **Login.** Navigate `auth/index.html`, fill `#email` +
   `#password`, click `#submit-btn`, await hard navigation.
7. **Detail-URL discovery.** Load each list page once, wait
   `page:ready`, scrape first `a[href*="detail"]` for
   idea / project / flow / record / member / identity /
   workbox-detail. Derive flow-stats and idea-convert from
   scraped ids.
8. **Sweep.** For every `PAGE_REGISTRY` page (import under
   Node — side-effect-free; 29 pages today, never hardcoded),
   load N times (default 5). Navigate, await `page:ready` via
   `Runtime.evaluate`, harvest measures + navigation timing as
   JSON. Bounded timeout → loud failure naming the page.
9. **Report.** Page × min / median / max `readyMs` + phase
   medians, as a table.

#### Flags

| Flag | Effect |
| --- | --- |
| (none) | Measure + report only |
| `--check` | Fail if any median readyMs exceeds budget |
| `--record` | Append one JSONL history line |
| `--pages a,b,c` | Restrict to named registry keys |
| `--runs N` | Override default run count (5) |

Bare `./measure` = measure + report only.

#### Cleanup

Cleanup in `finally`: kill Chrome + http.server, rm temp dirs.
Every failure is named; nothing is swallowed.

### C. Budget gate — `measurements/budgets.json`

Shape:

```json
{
  "<registry key>": { "readyMs": <number> }
}
```

`--check` gates median `readyMs` per page only; phases are
recorded but not gated (v1). Exit 1 lists every offender.

Missing budget for a measured page OR budget for a nonexistent
page is failure — both-ways drift (same posture as SCHEMA.svg
`--check`).

Initial calibration: first accepted run's medians × 2.0 slack,
rounded up to clean values. Budgets are per-machine-class
(local dev gate); docs say so honestly. They are not a
cross-machine SLA.

### D. History — `measurements/history.jsonl`

Appended ONLY by `--record`. One line per recorded sweep:

```json
{
  "at": "<ISO timestamp>",
  "sha": "<git HEAD>",
  "machine": {
    "platform": "...",
    "arch": "...",
    "cpuModel": "...",
    "cpuCount": 0
  },
  "runs": 5,
  "pages": {
    "<key>": {
      "readyMs": 0,
      "phases": { "...": 0 }
    }
  }
}
```

JSONL sits outside the 78-char lint's file set (repo-root `.md`
lint; this is `.jsonl`).

### E. Workflow integration

NOT part of `./validate` — needs Chrome, takes minutes. Run
deliberately:

- before builds / releases
- after adapter / derive / presenter changes
- at migration milestones with `--record`

CLAUDE.md gains a short `./measure` section (commands, when to
run, budget/history files). TEST-PLAN.md is untouched — the
harness is a CLI gate, not a manual browser case.

### F. Server-tier seam (designed for, NOT built — YAGNI)

`page-performance.ts` is the future RUM source; a sink adapter
and Server-Timing header come later. Nothing is built now; the
module boundary permits a sink without rewiring boot marks.

## Sequencing (implementation, not this commit)

One concern per commit; pure-core tests green before the
harness lands.

1. `page-performance.ts` + boot / page-loader / loadInto marks
   + ready log.
2. `measure-core.ts` + unit tests (median, budgets, history
   shape, report).
3. `./measure` wrapper + `measure.ts` CDP driver + seed/login/
   discovery/sweep.
4. Initial `measurements/budgets.json` from first
   accepted run (mean + k×sampleσ; k defaults to 1.5)
   slack; wire `--check` / `--record`.
5. CLAUDE.md `./measure` section.

## Verification

- Unit tests for `measure-core.ts` (median edge cases; every
  budget failure mode; history line shape; report table).
- Manual: `./measure` produces a full-page table after seed +
  login; aborted boot (e.g. kill mid-sweep) fails loudly with
  the page name.
- `./measure --check` exits 1 when a budget is deliberately
  lowered below a measured median; exits 0 when budgets hold.
- `./measure --record` appends exactly one JSONL line; bare
  `./measure` does not touch history.
- Missing budget / orphan budget both fail `--check`.
- Cleanup leaves no orphan Chrome or python server processes.

## Out of scope

- Playwright or any browser-automation dependency.
- Wiring `./measure` into `./validate`.
- Phase-level budget gates (v1 gates `readyMs` only).
- RUM sink, Server-Timing headers, or any server-tier
  collector (module boundary only).
- TEST-PLAN.md changes.
- Cross-machine / CI budget enforcement (budgets are local
  machine-class gates).

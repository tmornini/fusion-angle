# AGENTS.md

This file guides coding agents working in this repository.
Claude Code reads it through `CLAUDE.md`, a one-line
`@AGENTS.md` import stub.

```bash
./test                 # Run automated tests (memory backend)
./validate             # Type-check + tests + lint (works on dirty tree)
./build                # Server ZIP to ~/Desktop/
./build --no-zip dir/  # server-core + server.mjs to dir/
./build dir/           # Server ZIP to dir/ instead of ~/Desktop/
./build --help         # Show usage
./serve [port]         # Build + node server.mjs (default 8080)
./postgres-seed --postgres local --bootstrap|--mock-data|--test-plan-slices
./postgres-seed --postgres render TOKEN \
    --bootstrap|--mock-data|--test-plan-slices
./postgres-wipe --postgres render TOKEN
./postgres-wipe --postgres local
./postgres-seed --postgres compose \
    --bootstrap|--mock-data|--test-plan-slices
docker compose build       # image of the committed tree
docker compose up --wait   # postgres:18 + server, 127.0.0.1:8080
docker compose down        # stop; the database dies with it
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
[port] is `HTTP_SERVER_PORT`.

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

## Gates

`./validate` composes `tsc --noEmit`, then `./test` (two
TZ passes: `TZ=UTC` on `tests/*.test.ts`, then
`TZ=Pacific/Honolulu` on `tests/tz/*.test.ts`), then
78-character lint, the `org` identifier ban under `api/`,
`web-app/`, `tests/`, and `shared/`, then
`generate-schema-svg --check` and
`generate-api-documentation --check`. Clean tree for
`./build` and `./measure`.

When an agent runs the full test plan (CLI + browser),
`./validate` is the gate: a failing type-check, test, or
line-length lint ABORTS the run automatically. Do not ask
whether to continue — the bundle is built from the same
source, so a failing CLI suite makes the browser run
meaningless. Report the failure, stop, await fix.

`./measure` is not part of `./validate`; it needs
Chrome. Full ceremony: `--record` + `--write-budgets`
+ `--runs 25` + `--visualize`. `--check` gates
median readyMs against `measurements/budgets.json`.
`--base-url` hits a running origin (needs `--password`).
See `./measure --help` for flags.

```
docs/superpowers/specs/2026-07-12-page-performance-measurement-design.md
docs/superpowers/specs/2026-07-12-measure-visualize-design.md
docs/superpowers/specs/2026-08-08-measure-viz-dashboard-design.md
```

## Commit

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

Subagents inherit no scripture and read no AGENTS.md by
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
  DESIGN-SYSTEM.md), present-tense imperative
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

## Where things live

- `api/` — REST, derives, validators, auth/tenancy
- `docs/` — superpowers specs and plans
- `measurements/` — budgets, history, measure-viz
- `server/` — boot, HTTP adapter, seed/wipe, throttle
- `shared/` — wire schema + utilities; never imports `api/`
- `tests/` — `node:test` (memory; `tests/tz/` TZ pass)
- `web-app/` — pages, adapters, presenters, CSS

Run `ls`.

## Invariants that bite

### Tenancy and the named covenant

Org rides the VERIFIED token claim, never the path.
De-membership, demotion, and revocation bite at next
mint, refresh, or exchange, or access TTL (≤ 15 min).
See [ARCHITECTURE.md](ARCHITECTURE.md) `## Tenancy`.

### Write authorizer 403s before genesis

Org-scoped PUT / DELETE hit `writeAuthorizerFor` so a
foreign id 403s rather than genesis-ing in the caller's
namespace. Genuine absence still 404s. See
`api/write-authorizer.ts`.

### HTTP only

Page URLs use relative paths (`/ideas/` or
`/ideas/index.html`). The API is `/api/…`. One origin
(`node server.mjs`). Testing is HTTP-only.

### Operator seed and wipe

`./postgres-seed` runs in-process on an empty database
and refuses a non-empty one. `./postgres-wipe` drops
the message plane; it does not seed.

### Same-tab refresh; other browsers stale

A successful write notifies this tab via pub-sub and
posts `fusion-angle:data` so other same-origin windows
refresh. There is no LISTEN and no SSE client. A
second browser stays stale until navigation.

### Field values reference attributes by id

The message-plane body stores `attribute_id` as a
record-attribute document id, never a table named
`attributes`. See `api/derive-state-field-values.ts`.

### `noUncheckedIndexedAccess`

tsconfig enables this — array / object index access
returns `T | undefined`, requiring a `!` or a guard.

### Required env is never logged

`POSTGRES_URL`, `JWT_HMAC_SIGNING_KEY`, and
`HTTP_SERVER_PORT` are required. Never log them.

### Transaction bodies await only row ops

Every `transaction(…)` body awaits ONLY row ops —
validators, crypto, hash, `serializeWire`, and scrypt
run OUTSIDE the tx. Sync compute between row ops is
fine. Nested `view.transaction` re-enters the same
tx; its tables must be a subset of the outer set.
A transaction holds its pooled connection and its
advisory locks for its whole body; the memory backend
serializes whole transactions, so a long body stalls
every other op.

## Read next

| Doc | Go there for |
|---|---|
| README.md | product sentence, modules |
| ARCHITECTURE.md | vessel, tenancy, residuals, do-not-resurrect |
| SCHEMA.md | the one table, secrets, PII erasure |
| API.md | dispatch, compositions, seed count |
| DESIGN-SYSTEM.md | tokens, heat ramp, breakpoints, CSS |
| FLOW-CANVAS.md | canvas FSM, camera MUST NOTs, hazards |
| AUDIT.md | doctrine audit runbook |
| TEST-PLAN.md | browser regression, Protocol |

## How we got here

This was a Claude-only file that every migration
appended pins to. It is now a cross-tool router
behind the `CLAUDE.md` stub: commands, gates, and
pointers. The maps live in the docs named above.

# AGENTS.md

This file guides coding agents working in this repository.
Claude Code reads it through `CLAUDE.md`, a one-line
`@AGENTS.md` import stub.

```bash
./test                 # Run automated tests (memory backend)
./test-browser         # Layer 2's browser half; needs Chrome
./test-all             # Layer 2: ./validate + ./test-browser
./validate             # deno check + tests + lint (dirty ok; SHA skips)
./build                # executable ZIP to ~/Desktop/
./build --no-zip dir/  # fusion-angle + site/ to dir/
./build dir/           # executable ZIP to dir/ instead of ~/Desktop/
./build --help         # Show usage
./crank --mock-data|--bootstrap port
./serve dir/ port      # ./fusion-angle serve from dir/
./postgres-seed --postgres local --bootstrap|--mock-data
./postgres-seed --postgres render TOKEN \
    --bootstrap|--mock-data
./postgres-wipe --postgres render TOKEN
./postgres-wipe --postgres local
./postgres-seed --postgres compose \
    --bootstrap|--mock-data
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

Deno 2.9.6 runs `./validate`, `./test`, `./test-postgres`,
`./build`, `./test-browser`, `./crank`, and both
generators.

**Commit before building.** `./build` and `./crank`
require a clean working directory.
Run `./validate` to catch type errors and lint issues;
commit; then build or crank.

`./serve` and a local `./measure` sweep need
`POSTGRES_URL` and `JWT_HMAC_SIGNING_KEY` already
set. `./serve dir/ port` sets `HTTP_SERVER_PORT`
from `port`. `./crank` mints those for its children.

When running under the Claude Code sandbox, the default
fails because `/tmp/` is not writable. Use this invocation
instead:

```bash
TMPDIR=/tmp/claude ./crank --mock-data 8080
# open http://localhost:8080/landing/index.html
```

`TMPDIR=/tmp/claude` redirects `./crank`'s temp
bundle into the sandbox-allowed path.
`localhost` is reachable from the sandbox, so the
Chrome MCP tools can drive the page normally.

The sandbox cannot write `~/Library/Caches/deno`
either, so `export DENO_DIR="$TMPDIR/deno-dir"` before
any `deno` command and before `./validate`. Both are
agent-environment accommodations, never baked into a
repo script: the operator's machine writes both
defaults.

## Gates

`./validate` composes `deno check --frozen api shared
server tests web-app`, then `./test` — `deno test
--frozen --parallel --no-check` with three preloads,
in two TZ passes: `TZ=UTC` on `tests/*.test.ts`, then
`TZ=Pacific/Honolulu` on `tests/tz/*.test.ts` — then
78-character lint of code and scripts (not `.md`),
the `org` identifier ban under `api/`,
`web-app/`, `tests/`, and `shared/`, then
`generate-schema-svg --check` and
`generate-api-documentation --check`, both `deno run`.
Clean tree for `./build`, `./crank`, and `./measure`.

`./test` takes 9.6 s where Node took 16.2 s.
`--no-check` costs nothing: `deno check` has already
covered `tests/`.

`./test-browser` needs Chrome (`CHROME` or
`CHROME_DEBUG_URL`); it bundles with `deno bundle`
into `$TMPDIR` on any tree and runs
`tests/browser/*.test.ts` under `deno test` serially.
It is not part of `./validate`; `./crank` runs it
after `./test-postgres`.

Three layers verify this product. Layer 1 is `./validate`,
the gate on every commit. Layer 2 is `./test-all` —
Layer 1 then `./test-browser` — the operator's gate before
`./build`, a deploy, or a walk. Layer 3 is the serial walk
(`./crank --mock-data 8080`, then one explorer through
TEST-PLAN.md); it is exploration and gates nothing. A
browser observation changes product only through a red
test at Layer 1 or Layer 2: a product commit may cite a
TEST-PLAN mitigation stub only when its `Reproduced by`
names a red test.

`./measure` is not part of `./validate`; it needs
Chrome. Full ceremony: `--record` + `--write-budgets`
+ `--runs 25` + `--visualize`. `--check` gates
median readyMs against `measurements/budgets.json`.
`--base-url` hits a running origin (needs `--password`).
See `./measure --help` for flags.

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

Every spec rides its own worktree — spec, plan, and each
execution commit — created once the slug is known and
before the first file. The slug names branch, directory,
plan (`<slug>.md`), and spec (`<slug>-design.md`).

```bash
git worktree add .worktrees/<slug> -b <slug>
cd .worktrees/<slug>
git rebase master     # amend until every commit is green
./validate            # ./test-all before a build or walk
cd -                  # the main checkout
git merge --ff-only <slug>
git worktree remove .worktrees/<slug> && git branch -d <slug>
```

`.worktrees/` is gitignored. Red on the branch is fine;
red on landing is not. `--ff-only` fails if master moved
— rebase again; `-d` refuses stranded work. Never `-D`,
never force-push: rebase rewrites hashes, so branches
stay local. One worker per worktree; master owns 8080.

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
Full, while its explorer, auditors, and refuters fan out as
subagents and go Medium.

The scripture is universal; the codebase is local. After
the proselytization, the dispatching agent MUST also push
down the codebase-specific patterns the scripture itself
cannot know:

- **Voice rules.** 78-char max line in files
  `./validate` still lints, 4-space indent, no
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

Subagents work in the dispatching agent's worktree and never
create their own — never pass the Agent tool `isolation`.

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
(the `fusion-angle` executable). Testing is HTTP-only.

### Operator seed and wipe

The `fusion-angle` executable has three verbs: `serve`,
`seed`, and `wipe`. `./postgres-seed` runs in-process
on an empty database and refuses a non-empty one.
`./postgres-wipe` drops the message plane; it does
not seed.

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

deno.json enables this — array / object index access
returns `T | undefined`, requiring a `!` or a guard.

### One type universe, no browser fence

`deno.json` is the only project: `strict`, DOM plus
`deno.ns`, `verbatimModuleSyntax`, `erasableSyntaxOnly`.
The `deno check --frozen api shared server tests
web-app` roots succeed the root project's `include`. The
browser project's `exclude` registry has no successor,
and neither does the fence it served.

Ambient Node globals unlock per INVOCATION, not per
file: one `node:` specifier anywhere in the checked
graph gives `process` to every file in that check, and a
type-only `import type … from 'node:fs'` is enough.
`npm:` does not unlock — `npm:postgres` and the bare
`postgres` mapping both still reject `process`.
`web-app` carries six `node:` importers of its own, so
`deno check … web-app` passes a file whose only line
is `process.env.HOME`. Nothing under `web-app/` is
type-fenced against `process` today, and `Deno.*` never
was: `deno.ns` sits in the lib array.
`tests/browser-fence.test.ts` checks a hermetically
isolated file, so it passes whatever the real property
is — a green run is not evidence of a fence.

The browser is what catches a stray `process` or `Deno.*`
in client code now — a runtime `ReferenceError` that
`./test-browser` (Layer 2) and the walk (Layer 3) see
only on a path they exercise. TODO.md carries the oracle
for a gate that would restore the fence.

`erasableSyntaxOnly` and `verbatimModuleSyntax` are what
`node --strip-types` requires at runtime, and `deno check`
enforces both — an enum or namespace is TS1294. The gate
binds them. `./postgres-seed --postgres local` and
`./postgres-wipe --postgres local` still exec
`node --strip-types`; `postgres-lib`'s JSON helpers still
run `node -e`.

### `localStorage` is real under Deno

Deno ships a live Web Storage global whose store
persists across processes, so assigning
`globalThis.localStorage` is ignored.
`tests/local-storage-stub.ts` installs the writable
in-memory fake the tests then stub. `./test` loads it
as a `--preload`, not an import.

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
| ARCHITECTURE.md | tenancy, KNOWN seams, do-not-resurrect |
| SCHEMA.md | the one table, secrets, PII erasure |
| API.md | dispatch, compositions, seed count |
| DESIGN-SYSTEM.md | tokens, heat ramp, breakpoints, CSS |
| FLOW-CANVAS.md | canvas FSM, camera MUST NOTs, hazards |
| AUDIT.md | doctrine audit runbook |
| COST-ESTIMATION.md | pre-AI replacement-cost runbook |
| TEST-PLAN.md | three layers; the serial walk |
| TODO.md | critical path, later work, sequencing |

## How we got here

A Claude-only file that every migration appended
pins to; now a cross-tool router behind the
`CLAUDE.md` stub. Maps live in the docs above.

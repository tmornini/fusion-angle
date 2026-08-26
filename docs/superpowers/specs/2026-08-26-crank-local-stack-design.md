# Crank: local stack glue

## Problem

Local Postgres-backed work is a ceremony: invent
`POSTGRES_PASSWORD`, `JWT_HMAC_SIGNING_KEY`,
`POSTGRES_URL`, and `HTTP_SERVER_PORT`; start Docker;
wipe; seed; serve. `docker compose up --wait` also
starts the compose `server` on 8080 — a second origin
next to `./serve` or TEST-PLAN **A3** (wipe, seed,
start `node server.mjs` from the **A2** bundle).
`./serve` currently builds. Required env is never
defaulted and never logged, yet nothing mints it.
TEST-PLAN How to invoke still tells the master to set
those vars by hand.

## Goals

- One root glue script, `./crank`, that owns the
  local stack and leaves no run trace.
- `./serve` only listens. `./build` still builds.
  `./postgres-seed` and `./postgres-wipe` stay; crank
  depends on them.
- One `./validate` per crank, before any build.
- TEST-PLAN **A3** is subsumed, not replaced. **A1**
  (`./build` → Desktop ZIP) and **A2** (unzip that
  ZIP, or `./build --no-zip` into a temp dir, and
  assert the bundle) stay ZIP inventory.
- Markdown is not a 78-character gate.

## Non-goals

- Rewriting historical `docs/superpowers/` specs and
  plans.
- `docker rmi` of `postgres:18`.
- Deleting **A1**'s Desktop ZIP.
- Changing `compose.yaml`'s `server` service. Crank
  does not start it. Investigation of postgres-only
  `docker compose up` lives in TODO.md `## Later
  work`.
- Sourced env / `eval "$(./crank)"`. Crank is
  executed. Secrets never enter the parent shell.

## Command

```
./crank --mock-data|--test-plan-slices|--bootstrap port
./serve dir/ port
```

Exactly one seed mode, same exclusivity as
`./postgres-seed`. Port is required. No default.
`HTTP_SERVER_PORT` is required env and is never
defaulted.

`./serve dir/ port`: `dir/` required (trailing slash,
same as `./build`). Requires `POSTGRES_URL` and
`JWT_HMAC_SIGNING_KEY` already set. Sets
`HTTP_SERVER_PORT` from `port`. Runs `node server.mjs`
from `dir/`. Does not build, does not mktemp, does not
trap-clean the bundle.

`./build --no-zip` help names `./crank`, not
`./serve`.

## Sequence

`./crank` is executed, never sourced. Secrets live in
that process and its children. Never logged, never
written to a file.

1. Parse argv. Missing mode, two modes, missing port,
   unknown flag → usage on stderr, exit 1, nothing
   started. `--help` → usage, exit 0.
2. `./validate`. Red aborts. No Docker, no temp dir.
   `./validate` already composes tsc + `./test` +
   remaining gates. Crank does not call those again.
   `./build` and `./serve` do not grow a validate.
3. Mint `POSTGRES_PASSWORD`, `JWT_HMAC_SIGNING_KEY`,
   `HTTP_SERVER_PORT` (the argv port), and
   `POSTGRES_URL`
   (`postgres://fusion:…@127.0.0.1:5432/fusion`).
   Random password and signing key.
4. Install EXIT / INT / TERM trap **before** Docker
   comes up.
5. `docker compose up -d --wait` **postgres only**.
   Not the compose `server`.
6. `./test-postgres` (TEST-PLAN **AT4**: with
   `POSTGRES_URL` set, run `./test-postgres`; it
   creates and drops its own `fusion_test_*` schema).
   Folded into crank because secrets never leave
   crank's process. Red → trap.
7. `./build --no-zip` into a temp dir. Clean tree,
   same as today. `./validate` allows dirty; build
   does not. A dirty tree can pass validate and die
   here; trap still downs Postgres.
8. `./postgres-wipe --postgres local` then
   `./postgres-seed --postgres local` with the mode
   flag. Seed still prints sign-ins once on stdout.
9. `./serve dir/ port` — listen only, blocks.
10. Trap: stop `./serve` if it started;
    `docker compose down --remove-orphans` so the
    compose project's containers are **removed**, not
    left `Exited`; `rm -rf` the temp bundle. No
    `.env`, no leftover container, no leftover
    compose network. No `docker rmi`. No delete of
    **A1**'s Desktop ZIP. `compose down` on a
    never-started stack must not fail the trap.

Crank never echoes `POSTGRES_URL`,
`POSTGRES_PASSWORD`, or `JWT_HMAC_SIGNING_KEY` — not
on success, not in errors. Seed's one-shot stdout is
the only place credentials print.

## TEST-PLAN protocol

How to invoke stops minting env by hand. The master
starts `./crank --test-plan-slices port` (serial:
`--mock-data`) as the origin, reads the seed reveal
from crank's stdout, grants Chrome `http://localhost`,
then hunts as today. The cookie-jar warning stays.

**A1** and **A2** stay ZIP inventory. They run before
crank so the tree is already clean for crank's own
`--no-zip`.

**A3** is crank. PASS: process listens; seed stdout
has the reveal (serial: mock humans; parallel:
14-slice TSV). Listen stdout still has no passwords.

**AT1–AT3** (tsc, `./test`, `./validate`) are crank's
one `./validate`. How to invoke does not run AT and
then crank.

**AT4** is step 6 of crank.

**J1** (stop the `server.mjs` started in A3) and
**J2** (remove the build directory) are crank's EXIT
trap. **J3** (Desktop ZIP remains) stays.

## Tests

No Docker in `./test`. Argv is the covenant:

- `./crank` and `./serve` with no args, missing port,
  missing mode, or two modes: exit 1, usage on
  stderr, no Docker.
- `--help`: exit 0.
- `./serve` with a path that lacks a trailing `/`:
  exit 1.
- A source pin: `serve` does not invoke `./build`.

Full crank is TEST-PLAN How to invoke, not the memory
suite.

## Docs and gates

- `AGENTS.md` command list: `./crank`, and
  `./serve dir/ port` (no build, no default port).
  The `TMPDIR` sandbox note moves from `./serve` to
  `./crank` (crank owns the temp bundle). Clean-tree
  before building names `./build` and `./crank`, not
  `./serve`.
- TEST-PLAN How to invoke: crank as above; drop "set
  the env vars by hand."
- `./validate` line-length list includes `crank`.

## Markdown is not a line-length gate

`./validate` today awks root `*.md` except
`TEST-PLAN.md` at 78 characters. Stop. Drop that
`find` from `validate`. Keep the 78-character awk on
`api/`, `web-app/`, `tests/`, `shared/`, `server/`
`*.ts|html|css` (compose.ts still exempt) and on the
root scripts / `Dockerfile` / `compose.yaml` /
`.dockerignore`.

Root-doc **line-count** ceilings stay.

Living markdown stops calling markdown a 78-character
gate:

- `AGENTS.md` Gates: 78-character lint is code and
  scripts, not `.md`. Subagent voice rules: 78-char
  max line applies to files `./validate` still lints,
  not markdown.
- TEST-PLAN **AT3** (`./validate`): drop "root `.md`
  files except `TEST-PLAN.md`" from the awk
  description.
- Do not rewrite historical `docs/superpowers/`
  specs and plans.
- DESIGN-SYSTEM.md's "78-char max" on CSS files
  stays — that is code lint, not markdown.

## Out of scope, named

Postgres-only compose vs starting `server` is a
TODO.md later-work investigation, not this ship.

# Docker deploy: one image, one `./deploy`, one `./test`

- Date: 2026-09-04
- Status: approved design, pre-plan
- Worktree: `.worktrees/docker-deploy`
- Branch / slug: `docker-deploy`
- Floor: production is already Docker
  (`042de5e5`). This spec does not switch
  runtimes. It makes the next local walk and
  the next Render deploy the same mechanical
  path, closing
  `docs/superpowers/specs/2026-09-03-render-docker-deploy-issues.md`.
- Approach: bash `./deploy` replaces `./crank`;
  `bin/` holds uncommon scripts; `./test` is
  the only test and validation entry; wipe is
  a public-schema reset; Render speaks the
  `render` CLI only.

Declined: a Deno CLI for glue; host `deno run`
seed/wipe against a URL; laptop seed against
Render's external connection string; combining
Render image-place with reseed; `HTTP_SERVER_PORT`
beside `PORT`; bare `docker compose build` as
an operator path; `FA_URL`; pointing
`./test postgres` at an arbitrary `POSTGRES_URL`.

## Problem

The first Docker deploy shipped. The operator
path did not. Credentials, `http_json` vs the
CLI, compose parse-time secrets, an empty
public schema vs the boot gate, and seed/wipe
jobs that needed the Docker image already live
turned a named-sha deploy into a session of
seams.

Local and Render are cousins, not twins.
`./crank` brings up compose postgres only,
then host `./build --no-zip` and host
`./serve`. The compose `server` service
already builds the image Render runs and is
never started. A TEST-PLAN walk can be green
while the production image is unexercised.

`PORT` and `HTTP_SERVER_PORT` are two names
for one listen port. Render injects `PORT`;
the Dockerfile copies it. Operators mix argv
and exported env.

Root holds daily gates and rare guns in one
pile. `./validate`, `./test-all`,
`./test-browser`, `./test-postgres`,
`./postgres-seed`, and `./postgres-wipe` are
separate verbs for one job.

## Goals

- One runtime image and `CMD` for the local
  walk origin and for Render.
- One operator command, `./deploy`, for local
  serve and for Render image-place or reseed.
- One test command, `./test`, for every suite
  and for Layer 1 / Layer 2 combinations.
- Operators pass arguments. Root bash assigns
  required env for children. Humans do not
  export `POSTGRES_URL`, `JWT_HMAC_SIGNING_KEY`,
  or `PORT` for a walk or a Render deploy.
- Inadvertent Render data loss from tests,
  `--local`, and image-place is highly
  unlikely. Render reseed remains a
  TOKEN-gated schema drop on purpose.
- `TODO.md` names every item this spec leaves
  out that is not already there.

## Non-goals

Named out of the 2026-09-01 runtime switch
and the 2026-09-03 issues ledger; still out
of product code here. This spec's docs commit
adds Later-work bullets where TODO.md does
not already name them (see Out of scope).

- `render.yaml` Blueprint
- `GET /status` (critical path item 5)
- `TRUSTED_PROXY_HOPS` (item 10; KNOWN seam)
- Tightening the Postgres `0.0.0.0/0`
  `ipAllowList` (policy; not named in TODO.md
  today)
- A dependency-warm Docker layer
- Diagnosing the old Node 500 on `/` (process
  gone; not later work)

## Decision

Local TEST-PLAN origin is compose `server` —
the same image and `CMD` Render runs. Host
`bin/serve` stays ZIP inventory (A1/A2), not
the walk origin.

`./deploy` is the only command that starts
that origin or talks to Render. `./crank` is
deleted.

`./test` is the only test and validation
entry. `./validate` and `./test-all` are
deleted.

Wipe is `DROP SCHEMA public CASCADE`,
recreate `public`, re-grant. The table-list
wipe goes away.

Render uses the `render` CLI only.
`postgres-lib`'s `http_json` is not the
deploy, seed, or wipe path.

## Design

### 1. Operator surface — `./deploy`

Two required choices:

```
./deploy {--local PORT | --render TOKEN}
         {--postgres mock-data|bootstrap
          | --commit SHA}
```

`--local PORT` or `--render TOKEN`, never
both. `--postgres mock-data` or
`--postgres bootstrap` is the data choice.
`--commit SHA` is the image choice.

`--postgres` on `./deploy` means the seed
mode (`mock-data` or `bootstrap`), not a
place. The guns keep
`--postgres local|render` as the place.

**Legal**

- `--local PORT --postgres mock-data|bootstrap`
  — walk origin.
- `--render TOKEN --commit SHA` — place that
  image. No data.
- `--render TOKEN --postgres mock-data|bootstrap`
  — reseed. No image-place.

**Refuse (usage, exit 1, no network, no
Docker)**

- `--local` plus `--commit`
- `--commit` plus `--postgres`
- missing either choice
- two seed modes
- `--postgres local|compose|render` on
  `./deploy`

`--help` / `-h` prints usage, exit 0.

`./deploy` never pushes. `--commit SHA` must
appear on `origin/master` (`git ls-remote
origin refs/heads/master`). Else STOP.
`ssh-add` stays on the operator's machine.
Auto-deploy stays off.

TOKEN is the Render API key on argv, as the
guns already take. `./deploy --render`
exports `RENDER_API_KEY` from TOKEN, requires
`render` on `PATH`, and STOPs if
`~/.render/cli.yaml` is expired. Subagents
never run `./deploy --render`.

`--postgres mock-data|bootstrap` is the
**what**. `--local` / `--render` is the
**where**. Seed modes are not Render-only.

### 2. Configuration: argv in, env out

Operators pass arguments. Root bash assigns
env. The binary still reads env (Docker and
Render have no other injection).

The one listen name is `PORT`.
`HTTP_SERVER_PORT` is deleted.
`fusion-angle serve` requires `PORT`,
`POSTGRES_URL`, `JWT_HMAC_SIGNING_KEY`.
postgres.js reads `PGPORT`, not `PORT`; the
rename does not hit that flock.

- `./deploy --local PORT` exports `PORT` from
  argv, mints `POSTGRES_PASSWORD` and
  `JWT_HMAC_SIGNING_KEY`, assigns host
  `POSTGRES_URL` to loopback `:5432`. Compose
  keeps hostname `postgres`. Never log
  secrets. No `.env` file.
- `./deploy --render TOKEN` exports
  `RENDER_API_KEY` from TOKEN.
- `bin/serve dir/ port` exports `PORT` from
  argv. `POSTGRES_URL` and
  `JWT_HMAC_SIGNING_KEY` must already be in
  that process (ZIP hatch; this tool does not
  mint).
- Guns read env as children. They are not
  operator config.

`TRUSTED_PROXY_HOPS` stays Render dashboard
env (out of scope).

### 3. Local sequence

`--local PORT --postgres mock-data|bootstrap`
replaces `./crank`. Trap installed before
Docker.

1. Argv, including the refuses above.
2. `./test validate`. Red aborts. No Docker.
3. `./test postgres`. Own Docker Postgres,
   own teardown (see §6). Not the walk
   database.
4. `./test browser`. In-process memory
   origin. Not compose.
5. Mint walk secrets. `docker compose up -d
   --wait postgres`.
6. `docker compose build`.
7. `bin/postgres-wipe --postgres local` then
   `bin/postgres-seed --postgres local
   --mock-data|--bootstrap`. Deploy maps
   `--postgres mock-data` → `--mock-data`.
8. `docker compose up -d --wait server`.
   Health fetches `/` on `PORT`.
   `schema_marker` exists because step 7 ran
   first.
9. Block until interrupt. Trap: `compose down
   --remove-orphans`, no leftover network, no
   `.env`, no `docker rmi`.

No host `bin/build --no-zip` for the walk.
No `bin/serve` for the walk. The process on
`PORT` is compose `server`.

Container `PORT` is the argv port. Host
publish is `127.0.0.1:$PORT:$PORT`.
TEST-PLAN's `8080` is the usual value, not a
unique special case.

Two Postgres lifetimes, never overlapping.
The walk stack is empty until wipe/seed.

`./deploy --local` does not run TEST-PLAN.
It starts the origin. The walk is a later
human step against that origin.

### 4. Render sequence

Discover exactly one Postgres and one web
service, as the guns do today, via the CLI.
Not Docker → STOP. No laptop seed/wipe. If
`render jobs` cannot run the image verbs,
STOP. No fallback to the external URL.

**Place:** `--render TOKEN --commit SHA`

1. `ls-remote` shows SHA on
   `refs/heads/master`. Else STOP.
2. `render deploys create "$SERVICE_ID"
   --commit SHA --wait --confirm -o json`.
   `--clear-cache` omitted (`do_not_clear`).
3. `--wait` non-zero on `update_failed` /
   `build_failed` is a STOP. No Deno poll
   loop.
4. Domain oracles: apex `/` 200,
   `/landing/index.html` 200,
   `/api/organizations` 401; `www` 301 to
   apex.
5. Print the revoke reminder. Do not revoke.

**Reseed:** `--render TOKEN --postgres
mock-data|bootstrap`

1. Same credential and runtime checks.
2. `bin/postgres-wipe --postgres render
   TOKEN` then `bin/postgres-seed
   --postgres render TOKEN --mock-data|
   --bootstrap`.
3. Seed's existing restart after reveal
   stays.
4. No `--commit`. No deploy.

The live process will error across wipe until
seed and restart. That is expected.

### 5. Guns, wipe, CLI

`bin/postgres-wipe` and `bin/postgres-seed`
stay the named guns. `./deploy` execs them.
They source `bin/postgres-lib`.

**Targets.** `--postgres local|render` only.
`--postgres compose` is gone. Host `deno run`
against loopback is gone.

- `local`: `docker compose run` of the image
  (`wipe` / `seed`). Needs compose env
  already set (deploy did that). Seed still
  takes `--mock-data|--bootstrap`.
- `render`: `render jobs create` and
  `render logs`, not `http_json` / curl.
  TOKEN is the API key on argv. Exactly one
  Postgres, one web service. Live runtime
  not Docker → STOP. `render jobs create`
  has no `--wait`; poll with `render jobs`
  get, same timeouts as today
  (`WIPE_TIMEOUT_SEC`, `REVEAL_TIMEOUT_SEC`).

If a needed Render call has no CLI verb,
STOP and name it. Do not fall back to curl.

**Compose services.** `seed` already exists
(profile `seed`, entrypoint
`./render-out/fusion-angle seed`). Add a
matching `wipe` service (profile `wipe`,
entrypoint `./render-out/fusion-angle wipe`).
Both `POSTGRES_URL` only unless seed already
needs the signing key (it does not).

**Wipe SQL.** `POSTGRES_DROP_SCHEMA` becomes
`DROP SCHEMA public CASCADE`,
`CREATE SCHEMA public`, re-grant. Table-list
wipe is deleted. Tests that pin the old SQL
follow. Seed's emptiness check is then the
truth.

**Boot gate unchanged.** No `schema_marker`
→ refuse to listen. Serve does not seed.

### 6. `./test` dispatcher

Root `./test` is the only test and validation
entry. Unknown suite: usage, exit 1.

**Primitives**

| Command | Means |
|---|---|
| `./test` / `./test memory` | Memory suite (today's `./test`) |
| `./test check` | `deno check --frozen api shared server tests web-app` |
| `./test lint` | 78-char, org-identifier, retired vocab, later-work home, TEST-PLAN pin paths |
| `./test schema` | `bin/generate-schema-svg --check` |
| `./test api-docs` | `bin/generate-api-documentation --check` |
| `./test postgres` | AT4. Always Docker Postgres |
| `./test browser` | AT5. Chrome, in-process memory origin |

**Combinations** (named, not primitives)

| Command | Means |
|---|---|
| `./test validate` | `check` + `memory` + `lint` + `schema` + `api-docs`. SHA skip on a clean HEAD. Today's `./validate`. |
| `./test validate browser` | Layer 2. Today's `./test-all`. |

Named on one line, run in that order.
`./test validate postgres` is legal and is
not what `./deploy --local` uses (deploy
runs them as separate invocations so
postgres's Docker does not overlap the walk
stack).

SHA skip applies only to the `validate`
combination, not to a primitive run alone.
The stamp file is
`most-recently-validated-sha` in the shared
git dir; its contents are that SHA. Tests
that must not touch the real stamp overlay
`MOST_RECENTLY_VALIDATED_SHA_PATH` (path to
the stamp file) and
`WORKING_TREE_PORCELAIN` (stand-in for
`git status --porcelain`). There is no
`validate-ok` and no `VALIDATE_OK`.

**`./test postgres`.** Always a Docker
Postgres. Mint a password, `compose up`
postgres only, assign loopback
`POSTGRES_URL` internally, run the seven
`pg-*.test.ts` files, trap `compose down`.
Do not read an ambient `POSTGRES_URL`.
No Docker → STOP. Private compose project
name `fusion-test-postgres-$$` so it cannot
collide with `./deploy --local`.
The operator never points this at Render.

**`./test browser`.** Unchanged in kind:
in-process memory origin, Chrome. Not the
walk stack. Not Render.

**`./test` / `./test validate`.** No Docker.
`./deploy` argv pins in the memory suite
use a docker stub, as `crank-cli` does
today. Full `./deploy --local` is not a
test.

Deleted root commands: `./validate`,
`./test-all`, `./test-browser`,
`./test-postgres`.

### 7. Tree layout

**Root:** `./test` `./deploy`
`Dockerfile` `compose.yaml` `deno.json`
`deno.lock`. Docs stay.

**`bin/`:** `build` `build-lib` `serve`
`measure` `postgres-seed` `postgres-wipe`
`postgres-lib` `generate-schema-svg`
`generate-api-documentation` `test-browser`
`test-postgres`

`./test` dispatches; `bin/test-browser` and
`bin/test-postgres` are the implementations.
`./test validate`'s other primitives run in
the dispatcher (or tiny helpers next to it,
not extra root commands).

Callers: Dockerfile `bin/build --no-zip`.
`./test schema` / `./test api-docs` call
`bin/generate-* --check`. `./deploy` calls
`bin/postgres-wipe` and `bin/postgres-seed`.
`bin/measure` still names `bin/build` and
`bin/postgres-seed` in `--allow-run`.

Rename commits first, then behavior.

### 8. Product and compose

**Dockerfile `CMD`:**
`cd render-out && exec ./fusion-angle serve`.
No `HTTP_SERVER_PORT=$PORT` copy. Render
already injects `PORT`. Still no `ARG`.

**compose.yaml:** `:?required` stays. Bare
`docker compose build` is not an operator
path; `./deploy` mints first. `server`
takes `PORT` from the environment. Publish
`127.0.0.1:$PORT:$PORT`. Healthcheck reads
`PORT`.

**`bin/measure`** spawns with `PORT`, not
`HTTP_SERVER_PORT`.

### 9. Tests

Memory `./test` has no Docker.

**CLI (replace `crank-cli`):** `./deploy`
with no args, missing a choice,
`--local`+`--commit`, `--commit`+`--postgres`,
two seed modes, unknown flags: exit 1,
usage, stub docker not called. `--help`
exits 0. Source pin: local path calls
`bin/postgres-wipe` / `bin/postgres-seed
--postgres local`; never `bin/serve`; never
`HTTP_SERVER_PORT`.

**`./test` dispatcher:** unknown suite →
usage. `validate` is the combination. Gone
names (`./validate`, `./test-all`,
`./crank`) do not appear as live commands.

**Product:** `POSTGRES_DROP_SCHEMA` pins the
schema drop + recreate + grant. Boot /
`bin/serve` / `bin/measure` require `PORT`.
`fusion-angle-live-name` `ROOT_FILES` and
the lint file list follow root vs `bin/`.
`./test`'s `--allow-run` names `./deploy`,
`./test`, `bin/serve` — not `./crank` /
`./validate`.

**Inadvertent Render destruction.** Tests,
`--local`, and `--commit` never take a path
to Render data. Ambient `POSTGRES_URL` is
not a targeting gun. Host `deno run` wipe
and seed are gone. The remaining Render
data path is `--render TOKEN --postgres
mock-data|bootstrap` and
`bin/postgres-wipe --postgres render TOKEN`
— TOKEN-gated, on purpose.

### 10. Docs

**AGENTS.md.** Command block is `./test`
(with suites) and `./deploy`. Drop
`./crank`, `./validate`, `./test-all`,
`./test-browser`, `./test-postgres`, root
`./build` / `./serve` / `./postgres-*`.
Point ZIP and generators at `bin/`. Gates:
Layer 1 is `./test validate`; Layer 2 is
`./test validate browser`; Layer 3 is
`./deploy --local 8080 --postgres mock-data`
then the walk. `HTTP_SERVER_PORT` → `PORT`.
Bare `docker compose build` is not an
operator path. Subagents never run
`./deploy --render`.

**TEST-PLAN.md.** How to invoke:
`./deploy --local 8080 --postgres mock-data`.
A3 is that command (process listens; seed
reveal on stdout). AT1–AT3 are
`./test validate`. AT4 is `./test postgres`
(own Docker, not the walk DB). AT5 is
`./test browser`. J1/J2 are deploy's trap.
A1/A2 stay ZIP inventory via `bin/build`
and `bin/serve`.

**ARCHITECTURE.md.** Record `PORT`,
Dockerfile `CMD` with no env copy, wipe as
public-schema reset, `./deploy` as the
operator path, compose `:?required` (deploy
mints first). Leave the 24.7 s Docker
build figure unless this work measures
again.

**README.md.** Getting started and seed/build
lines follow the same names.

**SCHEMA.md.** The pair-plane wipe sentence
becomes the public-schema reset. **API.md**
only if it restates that wipe.

**TODO.md.** Add Later-work bullets for
`render.yaml`, the explicit `0.0.0.0/0`
`ipAllowList`, and the dependency-warm
Docker layer, each with an oracle.
`/status` (item 5) and `TRUSTED_PROXY_HOPS`
(item 10) already exist. Do not add the
old Node 500.

## Hazards

- Render reseed is a TOKEN-gated schema
  drop. A mistaken `--render TOKEN
  --postgres mock-data` empties public.
  Image-place cannot wipe. Tests and
  `--local` cannot see Render.
- `git ls-remote` still needs the operator's
  `ssh-add`. `./deploy` never pushes.
- Live Render serve errors across wipe until
  seed + restart.
- `:?required` remains; only `./deploy`
  mints before compose.
- Lint, `ROOT_FILES`, and `--allow-run`
  lists must follow the tree or Layer 1
  goes red.
- Private compose project for
  `./test postgres` must not share
  `./deploy --local`'s project name.

## Out of scope, named

- **`render.yaml`** — Blueprint as a second
  source of truth for the dashboard service.
  Add a Later-work bullet. Oracle: a
  committed `render.yaml` that matches the
  live service without a dashboard PATCH.
- **`/status`** — already critical path
  item 5. Health stays `/`. This spec does
  not listen without `schema_marker`.
- **`TRUSTED_PROXY_HOPS`** — already item
  10. Leave the dashboard var. Do not
  default it.
- **`0.0.0.0/0` allowlist** — how the laptop
  reseed reached the external URL. This spec
  deletes that path. Tightening the list is
  item-10 policy. Add an explicit Later-work
  bullet (item 10 never names
  `ipAllowList`). Oracle: Render connection
  info `ipAllowList` does not contain
  `0.0.0.0/0`.
- **Dependency-warm Docker layer** —
  `COPY . .` busts later layers; `deno
  compile` fetches `denort`. Cold-build
  reliability is not the problem. Add a
  Later-work bullet. Oracle: a measured
  cold Render Docker build, then a layer
  that caches `deno.json` / `deno.lock` /
  `denort` only if that number is the
  bottleneck.
- **Old Node 500 on `/`** — replaced, not
  diagnosed. Do not add to TODO.md.

## Commit sequence

One concern each. Never move and change in
the same commit.

1. This spec.
2. The plan.
3. Rename into `bin/` only. Update callers
   that break (Dockerfile, lint lists,
   `measure` `--allow-run`,
   `fusion-angle-live-name`).
4. `./test` dispatcher. Delete `./validate`
   and `./test-all`. Combinations
   `validate` and `validate browser`. SHA
   skip on `validate`. `./test postgres`
   owns Docker Postgres.
5. `HTTP_SERVER_PORT` → `PORT` (binary,
   tests, `bin/serve`, `bin/measure`,
   Dockerfile `CMD`, compose).
6. Wipe SQL → schema drop + recreate +
   grant. Compose `wipe` service.
7. Guns: `--postgres local` is compose run;
   `--postgres compose` and host `deno run`
   go; Render path is the `render` CLI.
8. `./deploy`. Delete `./crank`.
9. Docs (AGENTS, TEST-PLAN, ARCHITECTURE,
   README, SCHEMA.md).
10. TODO.md Later-work bullets:
    `render.yaml`, explicit `0.0.0.0/0`
    allowlist, dependency-warm layer.

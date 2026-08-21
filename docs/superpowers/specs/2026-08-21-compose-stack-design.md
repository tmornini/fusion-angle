# Compose Stack — Design

Date: 2026-08-21
Status: draft (brainstorm 2026-08-21; approved in chat;
awaiting the user's review of this written spec). Spec
only; no implementation lives in this document.

This scroll stands beside
[the 2026-08-20 seed design](2026-08-20-postgres-seed-design.md),
which made seeding a tool of its own and named Render's
build and start commands. Nothing there changes. What is
added here is a way to run that same deployable — the
`./build` bundle under Node 24, a Postgres, and the seed
as a one-off job — on the workstation, under Docker
Compose, for as long as one test session needs it.

## The Goal

Before a push to Render, prove the artifact Render will
run: the `render-out/` bundle, booted by Render's start
line, under Render's Node, against a Postgres the app
did not seed itself, with the environment contract
Render supplies. Today that proof is only available on
Render. `./serve` runs the bundle on host Node 26 against
whatever Postgres `POSTGRES_URL` names; it is the
development loop, not the deployable.

The stack is local and short-lived by decision: brought
up for a session, torn down after. It also serves as an
origin for TEST-PLAN agents and `./measure --base-url`,
and as a Postgres for `./test-postgres`.

This is a development tool for a disposable demo. It
guards no durability.

## Context

What exists, and what the stack must honor:

- Render builds with `npm ci` then
  `./build --no-zip render-out/`, and starts with
  `cd render-out && HTTP_SERVER_PORT=$PORT node server.mjs`.
  Render injects `PORT`; the operator sets `POSTGRES_URL`
  (the INTERNAL string) and `JWT_HMAC_SIGNING_KEY`. A
  proxy fronts the service (`TRUSTED_PROXY_HOPS`). One
  replica. UTC. Render's default Node is 24 (LTS); the
  repository pins no Node version.
- Render seeds by a one-off job on the web service:
  `node --strip-types server/postgres-seed.ts MODE`, run
  from the checkout with its `node_modules`, inheriting
  `POSTGRES_URL`.
- `./build` refuses a dirty tree (`git status
  --porcelain`), composes pages, bundles `server-core`,
  and bundles `server/boot.ts` into `server.mjs` with
  postgres.js inside. `--no-zip` writes the bundle to a
  directory. It needs `git`, `node`, `npx`, and coreutils.
- `server/boot.ts` reads `POSTGRES_URL`,
  `JWT_HMAC_SIGNING_KEY`, `HTTP_SERVER_PORT`, and optional
  `TRUSTED_PROXY_HOPS`; proves UTF8; refuses legacy
  message tables; refuses a missing `schema_marker`
  (`schema_marker absent; seed with ./postgres-seed`);
  then listens on all interfaces (`listen(port)` with no
  host). `SIGTERM` closes the listener with a 10 s drain
  (`DRAIN_TIMEOUT_MS`), ends the pool, exits 0. The static
  root is `server.mjs`'s own directory. There is no
  health route; `GET /` serves `index.html`.
- `server/seed.ts` refuses a non-empty database
  (`pairs` or `schema_marker` populated).
- The refresh cookie's `Secure` flag follows the request
  origin; `http://localhost` needs no TLS.
- `./postgres-seed --postgres local` asserts a loopback
  `POSTGRES_URL` host and runs the seed on host Node.
  `--postgres render` posts the job over Render's API.
  The target switch is `render|local`.
- `./test-postgres` runs the five `tests/pg-*.test.ts`
  files against `POSTGRES_URL`, each in its own schema
  (`SCHEMA_NAME` + suffix), created and dropped per file.
  `pg-boot` never listens.
- `./measure --base-url URL --password SECRET` benchmarks
  a running origin and skips the seed. `measurements/
  history.jsonl` was recorded by the host spawn path
  against a disk-backed local Postgres.
- CLAUDE.md's cold start runs `docker run … postgres:17`
  on the host and `./serve` against it.
- `./validate` lints 78 columns on a named list of root
  scripts; `tests/fusion-angle-live-name.test.ts` scans a
  `ROOT_FILES` list for the retired product name.
- `docs/` is gitignored; specs are tracked by
  `git add -f`.
- The Claude Code sandbox cannot reach
  `/var/run/docker.sock`; Docker commands run from the
  user's terminal (`!` prefix) unless the socket is
  allowed.
- Docker 29 and Compose v5 are installed. The official
  `postgres:18` image is 18.6; its `PGDATA` is
  `/var/lib/postgresql/18/docker` and its declared volume
  is `/var/lib/postgresql` (the `/data` path of ≤ 17 is
  gone). The full `node:24` image ships `git`;
  `node:24-slim` does not, and ships neither `curl` nor
  `wget`.

## The Decisions

Each was put to the user and answered.

1. **Purpose: exercise the deployable.** Boot the
   `./build` bundle under Node 24 with Postgres 18 and
   the production environment contract, seeded by a
   one-off job. The stack must also serve TEST-PLAN and
   `./measure --base-url`, and host `./test-postgres`.
   Always local; always short-lived.
2. **Postgres 18.** `postgres:18` (18.6 today).
3. **Node 24** — LTS and Render's default. No
   `.node-version` is added: the default already matches,
   and the omission is deliberate.
4. **Secrets from the shell.** `POSTGRES_PASSWORD` and
   `JWT_HMAC_SIGNING_KEY` are required environment
   variables, enforced by compose's `${VAR:?}`. No `.env`,
   no template, no default. The server container's
   environment matches Render's contract: `PORT`
   injected, `POSTGRES_URL` one full URL,
   `JWT_HMAC_SIGNING_KEY` set by the operator,
   `TRUSTED_PROXY_HOPS` unset because no proxy exists.
5. **Approach C.** A multi-stage Dockerfile builds from
   the committed tree inside Node 24 (Render's build
   step, verbatim); compose is the only orchestration;
   and `./postgres-seed` gains a third target,
   `--postgres compose`, in this change.
6. **tmpfs, not disk.** Speed over storage parity. The
   two divergences are named below and documented.

## Non-goals

- No change to `./build`, `./serve`, `./postgres-wipe`,
  `postgres-lib`, `./measure`, `./test-postgres`, or any
  `api/`, `server/`, `shared/`, `web-app/` module.
- No `.node-version`, `engines`, or Render config change.
- No reverse proxy, TLS, or `TRUSTED_PROXY_HOPS`.
- No `linux/amd64` pin. Apple Silicon builds arm64;
  nothing in the app is architecture-sensitive.
- No compose target for `postgres-wipe`:
  `docker compose down` is the wipe.
- No automatic seed on `up`. Seed mode is an argument,
  never a default.
- No persistent volume, no `restart:` policy, no
  replicas.
- No new test file. Root scripts have no bash harness;
  the seed and wipe specs set that precedent.
- Not touched here, named as follow-ups: the cold-start
  `postgres:17` line (one voice: 18), and
  `postgres-wipe`'s DROP list, which predates the pairs
  flip (`442f4397`) and leaves `pairs` behind so that
  wipe → seed now refuses.

## Files

| Path | Status | Role |
|---|---|---|
| `Dockerfile` | new | `builder` and `runtime` stages |
| `compose.yaml` | new | `postgres`, `server`, `seed` |
| `.dockerignore` | new | gitignored paths only |
| `postgres-seed` | edit | target `compose` |
| `validate` | edit | lint the three files |
| `tests/fusion-angle-live-name.test.ts` | edit | scan the three files |
| `CLAUDE.md` | edit | commands, `### Compose stack`, validate list |

## `.dockerignore`

```
.DS_Store
node_modules/
.claude/
.superpowers/
```

Exactly the gitignored paths, minus `docs/`. The build
context must carry `.git` and every tracked file: the
builder runs `./build`, whose clean-tree check runs
`git status --porcelain` inside the image. Excluding a
tracked path (`docs/` holds tracked specs) would show
as deletions and the build would rightly refuse.
Untracked-but-ignored files under `docs/` ride along
harmlessly. `node_modules/` is excluded so the `npm ci`
layer, not the host, supplies it.

## `Dockerfile`

```dockerfile
FROM node:24 AS builder
WORKDIR /srv
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN ./build --no-zip render-out/

FROM node:24-slim AS runtime
WORKDIR /srv
COPY --from=builder /srv/render-out ./render-out
USER node
CMD ["sh", "-c", \
    "cd render-out && HTTP_SERVER_PORT=$PORT exec node server.mjs"]
```

- **`builder` is Render's build step.** `npm ci` is a
  layer keyed on the lockfile. `COPY . .` brings the
  committed tree and `.git`. `./build` runs unchanged —
  including its refusal of a dirty tree, so the only
  images that can exist are images of a commit. The
  full `node:24` image is used because it ships `git`.
  The stage runs as root; `COPY` makes root the owner,
  so git raises no ownership objection. `render-out/`
  is created after the check, inside the image only.
- **`runtime` is Render's start line plus `exec`.**
  Render's literal command is
  `cd render-out && HTTP_SERVER_PORT=$PORT node server.mjs`.
  Under `sh -c`, the shell is PID 1 and does not
  forward `SIGTERM`; `docker stop` would bypass
  `boot.ts`'s drain and SIGKILL at the grace period.
  `exec` replaces the shell with Node; the handler
  `boot.ts` already installs receives the signal. One
  word of divergence, named. `$PORT` is expanded by the
  shell at run time, not by Docker at build time.
- `PORT` is the platform-injected variable, as on
  Render; compose injects it. `USER node` is the least
  privilege the image offers; the runtime holds only
  `render-out/`, read by a user that cannot write it.
  The server writes nothing to disk.
- The `CMD` uses `\` continuation to keep 78 columns.

## `compose.yaml`

```yaml
x-postgres-url: &postgres-url
    postgres://fusion:${POSTGRES_PASSWORD:?required}@postgres/fusion

services:
    postgres:
        image: postgres:18
        environment:
            POSTGRES_USER: fusion
            POSTGRES_DB: fusion
            POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?required}
        tmpfs:
            - /var/lib/postgresql
        ports:
            - 127.0.0.1:5432:5432
        healthcheck:
            test:
                - CMD
                - pg_isready
                - -h
                - 127.0.0.1
                - -U
                - fusion
                - -d
                - fusion
            interval: 2s
            timeout: 2s
            retries: 15

    server:
        build:
            context: .
            target: runtime
        depends_on:
            postgres:
                condition: service_healthy
        environment:
            PORT: "8080"
            POSTGRES_URL: *postgres-url
            JWT_HMAC_SIGNING_KEY: ${JWT_HMAC_SIGNING_KEY:?required}
        ports:
            - 127.0.0.1:8080:8080
        stop_grace_period: 15s
        healthcheck:
            test:
                - CMD
                - node
                - -e
                - >-
                  fetch('http://127.0.0.1:' + process.env.PORT + '/')
                  .then((r) => process.exit(r.ok ? 0 : 1),
                  () => process.exit(1))
            interval: 2s
            timeout: 2s
            retries: 15
            start_period: 5s

    seed:
        build:
            context: .
            target: builder
        profiles:
            - seed
        depends_on:
            postgres:
                condition: service_healthy
        environment:
            POSTGRES_URL: *postgres-url
        entrypoint:
            - node
            - --strip-types
            - server/postgres-seed.ts
```

Decisions the file embodies:

- **Secrets.** `${VAR:?required}` refuses before any
  container starts, naming the variable. One password,
  one anchored URL, one place to be wrong. The URL
  scheme supplies port 5432; the password must be
  URL-safe (the docs say so and give a recipe). The
  host-side `POSTGRES_URL` for `./test-postgres` is
  `postgres://fusion:$POSTGRES_PASSWORD@localhost:5432/fusion`.
- **Loopback only** on both published ports. The LAN
  never sees the stack. Inside the Docker network the
  server reaches Postgres at `postgres:5432`.
- **tmpfs at `/var/lib/postgresql`** — the 18 image's
  volume root, covering its `PGDATA`. A mount at the
  declared volume path means no anonymous volume is
  created; `docker compose down` leaves nothing behind.
  Postgres's own configuration is untouched: the
  divergence is in storage, not settings.
- **`pg_isready -h 127.0.0.1`**, not the socket. The
  image's init phase runs a temporary server reachable
  on the socket only; a socket probe reports ready
  before the real server listens on TCP.
- **`stop_grace_period: 15s`.** Compose's default grace
  is 10 s, equal to `DRAIN_TIMEOUT_MS`; a full drain
  could be SIGKILLed at the wire. 15 s makes exit 0 a
  guarantee, not a race.
- **Server healthcheck** probes `GET /` (static; boot
  already gated on the database before listening), so
  `docker compose up --wait` means *listening* — what a
  TEST-PLAN agent or `./measure --base-url` needs before
  its first request. It is a `node -e fetch(...)`
  reading `PORT` from the environment, because the slim
  image has no `curl` or `wget`, and adding one for a
  probe is a dependency for ceremony. The folded scalar
  joins its lines with spaces; the result is one valid
  expression.
- **`seed` under a profile** so `up` never starts it.
  `docker compose run --rm seed --mock-data` activates
  the profile implicitly, starts `postgres` and waits
  for it to be healthy, appends the mode to the
  entrypoint — the literal Render job command — prints
  the credentials on stdout, and removes the container.
  No arguments prints the program's own usage error.
- **No `restart:`** on any service. A server that
  refuses to boot stays down and visible.

## `./postgres-seed --postgres compose`

The target switch becomes `render|local|compose`. The
`compose` target:

- takes no TOKEN (a TOKEN is "unexpected argument", as
  for `local`);
- reads neither `POSTGRES_URL` nor asserts loopback —
  compose assembles the container URL from
  `POSTGRES_PASSWORD`;
- requires `docker` on PATH, checked the way `node` and
  `curl` are, and does not require host `node`;
- ends in
  `exec docker compose -f "$ROOT/compose.yaml" run --rm seed "$MODE"`
  so it works from any working directory — `-f` makes
  the file's directory the project directory, so the
  build context `.` resolves to the repository root;
- leaves a missing `POSTGRES_PASSWORD` to compose's own
  error. Compose is the gate; the script does not
  validate twice.

Ordering inside the script: parse → validate flags →
`compose` branch (docker check, `exec`) → `node` check →
`local` branch → `curl` check → `render` branch.

Usage text (under 78 columns):

```
Usage: ./postgres-seed --postgres local
       --bootstrap|--mock-data|--test-plan-slices
       ./postgres-seed --postgres render TOKEN
       --bootstrap|--mock-data|--test-plan-slices
       ./postgres-seed --postgres compose
       --bootstrap|--mock-data|--test-plan-slices

Seed an empty Postgres. --postgres is
required and has no default. --postgres render
needs TOKEN (the confirmation). --postgres local
uses POSTGRES_URL (loopback only); it takes no
TOKEN. --postgres compose seeds the compose
stack; it takes no TOKEN and reads
POSTGRES_PASSWORD through compose.yaml.

Options:
  --postgres render|local|compose   Target (required)
  --bootstrap   Seed bootstrap identities
  --mock-data   Seed mock data
  --test-plan-slices   Seed TEST-PLAN slices
  --help       Show this help message

render: TOKEN must see exactly one Postgres and
one web service. HTTP only (curl).
local: assert loopback, then
node --strip-types server/postgres-seed.ts.
compose: docker compose run --rm seed MODE — the
Render job command inside the builder image.
Development gun.
```

`measure-cli.test.ts` pins the host spawn path at
`--postgres local`; it is untouched.

## Invocation Summary

```bash
export POSTGRES_PASSWORD=$(openssl rand -hex 16)
export JWT_HMAC_SIGNING_KEY=$(openssl rand -hex 32)
docker compose build
./postgres-seed --postgres compose --mock-data
docker compose up --wait
# open http://localhost:8080/landing/index.html
docker compose down
```

`docker compose run --rm seed --mock-data` is the same
seed without the wrapper. `docker compose up` in the
foreground streams the server's JSON log lines.

## The Environment Contract

- `PORT` — Render: injected by the platform. Compose:
  `"8080"` in `server.environment`.
- `HTTP_SERVER_PORT` — both: `=$PORT` in the start line.
- `POSTGRES_URL` — Render: the INTERNAL string, set by
  the operator. Compose: the anchored URL built from
  `POSTGRES_PASSWORD`.
- `JWT_HMAC_SIGNING_KEY` — Render: set by the operator.
  Compose: `${JWT_HMAC_SIGNING_KEY:?required}` from the
  shell.
- `TRUSTED_PROXY_HOPS` — Render: set; a proxy fronts the
  service. Compose: unset; no proxy exists.
- `TZ` — both: unset (UTC).

The app reads nothing else.

## Divergences, Named

1. **`exec` in the start line** — so `SIGTERM` reaches
   Node. Behavior on Render is the platform's concern;
   here it is ours.
2. **tmpfs: restart is a wipe.** A tmpfs lives as long
   as its container. `docker compose stop postgres` then
   `start`, or `restart postgres`, returns an empty
   cluster: initdb runs again, no `schema_marker`, the
   server refuses to boot — or, if already running, its
   next query meets an undefined table and answers a
   loud 500. The stack's life is `up → use → down`.
3. **tmpfs: latency.** Commit cost is near zero.
   `./measure --base-url` against the stack reads faster
   than `measurements/history.jsonl`, which was recorded
   against disk. Compose measure runs are smoke, never
   history; `--record` belongs to the host spawn path
   and already requires it.
4. **No proxy.** `TRUSTED_PROXY_HOPS` unset. Setting it
   would trust `X-Forwarded-For` from the Docker bridge
   with nothing in front to write it. The auth throttle
   keys every host client as one peer, as it does under
   `./serve`.
5. **`node:24-slim` runtime.** Render's runtime has the
   build toolchain on disk; the app uses none of it.
6. **arm64 on Apple Silicon.** Render is x86-64.

What does not diverge: SQL semantics, isolation,
advisory locks, `statement_timeout`, `pg_notify`, UTF8,
the DDL, data checksums, the marker gate, the bundle
bytes, the start line's shape, the seed command.

## Failure, Handled With Grace

Every exit visible; none swallowed.

- **Dirty tree.** `./build` refuses in the builder;
  `docker compose build` fails with "working directory
  is not clean".
- **A secret unset.** Compose refuses before any
  container starts: `required variable
  POSTGRES_PASSWORD is missing a value: required`.
- **`up` before seed.** The server exits 1 with
  `schema_marker absent; seed with ./postgres-seed`; no
  restart policy, so it stays down and visible;
  `up --wait` returns non-zero.
- **Seed on a non-empty database.** The seed exits 1
  with `database is not empty; refuse to seed`. Then
  `down`, `up`, seed.
- **`restart postgres`.** An empty cluster: boot
  refuses, or a running server answers a loud 500 on an
  undefined table.
- **Port 8080 or 5432 busy.** Docker's bind error on
  `up`; stop `./serve` or the cold-start
  `fusion-postgres`.
- **`stop` / `down`.** `SIGTERM` → drain ≤ 10 s → exit
  0; `Exited (0)`, never 137.
- **Healthcheck never healthy.** `up --wait` fails after
  the retries (about 35 s); a failure, never a hang.
- **A password that is not URL-safe.** postgres.js
  rejects the URL; boot refuses with `boot failed` (the
  message never echoes a URL). Use the recipe.

## Documentation

**CLAUDE.md**, three edits.

1. `### Commands`, beside the seed and wipe lines:

   ```bash
   ./postgres-seed --postgres compose \
       --bootstrap|--mock-data|--test-plan-slices
   docker compose build       # image of the committed tree
   docker compose up --wait   # postgres:18 + server, 127.0.0.1:8080
   docker compose down        # stop; the database dies with it
   ```

2. A new `### Compose stack` subsection after
   `### Cold start`, carrying: the purpose (the
   deployable under Node 24 and Postgres 18; local and
   short-lived; also an origin for TEST-PLAN agents and
   `./measure --base-url`, and a Postgres for
   `./test-postgres`); the two required shell variables
   with the `openssl rand -hex` recipe and the URL-safe
   note; the invocation summary; the environment
   contract in one sentence (`PORT` → `HTTP_SERVER_PORT`
   through Render's start line plus `exec`;
   `TRUSTED_PROXY_HOPS` unset); the host-side
   `POSTGRES_URL` for `./test-postgres`; the
   `./measure --base-url http://127.0.0.1:8080 --password`
   form with "smoke, never `--record`"; "restarting
   `postgres` empties the database"; the port conflicts
   with `./serve` and `fusion-postgres`; and the sandbox
   note — the Docker socket is outside the Claude sandbox,
   so run these with the `!` prefix.

3. `### Validate semantics`: the sentence enumerating
   the 78-column root scripts gains `Dockerfile`,
   `compose.yaml`, and `.dockerignore`.

ARCHITECTURE.md, README.md, TEST-PLAN.md are untouched.
README already sends everything operational to CLAUDE.md.

## The Gates

- `validate`: the awk list gains
  `Dockerfile compose.yaml .dockerignore`.
- `tests/fusion-angle-live-name.test.ts`: `ROOT_FILES`
  gains the same three names.

Rule: every new root file joins both gates.

## Verification

**Automated.** `./validate` — type-check, both test
passes, the 78-column lint now covering the three files,
the live-name scan now covering them, the SVG and API
drift gates. Every commit below is green under it.

**Manual**, on a clean tree, from the user's terminal or
from the session once `/var/run/docker.sock` is allowed.
Chrome MCP drives step 3 from the session either way.

1. `docker compose build` → both targets build.
   `touch x && docker compose build` → refuses with the
   clean-tree message. `rm x`.
2. `env -u POSTGRES_PASSWORD docker compose config` →
   the `:?` error. Export both secrets;
   `./postgres-seed --postgres compose --mock-data` →
   the reveal header and credentials on stdout,
   `seeded` on stderr.
3. `docker compose up --wait -d` → exit 0;
   `curl -sI http://127.0.0.1:8080/` → 200; sign in at
   `/landing/index.html` with the revealed credentials;
   the dashboard renders.
4. `docker compose stop server` → `docker compose ps -a`
   shows `Exited (0)`, not 137.
5. Against the stack's Postgres:

   ```bash
   POSTGRES_URL=postgres://fusion:$POSTGRES_PASSWORD@localhost:5432/fusion \
       ./test-postgres
   ```

   → green.
6. A smoke run:

   ```bash
   ./measure --base-url http://127.0.0.1:8080 \
       --password "$PW" --runs 1 --pages organization
   ```

   → completes; numbers discarded.
7. `docker compose down` → `docker volume ls` shows
   nothing new; `docker compose up --wait` without
   seeding → the server refuses with
   `schema_marker absent`, `--wait` non-zero; `down`.

Step 1 is the one that proves the in-image git check;
step 2 proves `run` honors the health condition; step 4
proves `exec`.

## The Office of the Commit, Observed

One concern per commit, each green under `./validate`:

1. `Add compose stack spec` — this file, `git add -f`.
2. `Add .dockerignore`
3. `Add the server Dockerfile`
4. `Add the compose stack`
5. `Add --postgres compose to postgres-seed`
6. `Gate the container files` — `validate`,
   `ROOT_FILES`, and the CLAUDE.md validate sentence.
7. `Document the compose stack` — CLAUDE.md commands
   and the subsection.

Commits 2–4 add files the gates do not yet name; they
pass. Commit 6 names them; they must already be under 78
columns and free of the retired name.

## Risks

- **The in-image `git status` is not clean** for a
  reason invisible on the host (mode, case, an ignore
  rule). Verification step 1 catches it on the first
  build. The remedy is in `.dockerignore` or the context,
  never in `./build`.
- **`pg_isready -h 127.0.0.1` during init.** If the 18
  image's temporary server also listens on TCP, the
  probe is early and the seed's first connection may be
  refused once. Step 2 shows it; the remedy is a
  `start_period` on the Postgres healthcheck.
- **tmpfs under `/var/lib/postgresql` on 18.** The
  entrypoint must create `18/docker` under a root-owned
  tmpfs and chown it. The ≤ 17 `/data` pattern is
  common; 18's path is newer. Step 2 shows it.
- **`run` on a profiled service with `depends_on`
  conditions.** Expected to activate the profile and
  wait for health. Step 2 shows it.
- **Memory.** Data and WAL live in RAM; `max_wal_size`
  defaults to 1 GB and Docker caps a tmpfs at half of
  host RAM. Mock data is 1448 pairs; `./test-postgres`
  creates and drops small schemas.

## Later, Not Now

- Cold start: `postgres:17` → `postgres:18` in CLAUDE.md,
  one voice with the stack.
- `postgres-wipe`: add `DROP TABLE IF EXISTS pairs` so
  wipe → seed works again after `442f4397`.
- `./postgres-wipe --postgres compose` is not planned;
  `down` is the wipe.
- A `.node-version`, if Render's default ever moves.

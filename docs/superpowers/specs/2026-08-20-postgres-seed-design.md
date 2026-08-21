# Postgres Seed — Design

Date: 2026-08-20
Status: approved in brainstorm (2026-08-20); awaiting the
user's review of this written spec. Spec only; no
implementation lives in this document.

This scroll succeeds
[the 2026-08-20 wipe-postgres design](2026-08-20-wipe-postgres-design.md)
and [the 2026-08-19 Render design](2026-08-19-wipe-render-postgres-design.md).
Both remain the record of the shapes they describe. What
changes here is where seeding lives: it leaves the server
process and becomes a tool of its own.

## The Goal

`node server.mjs` seeds today. Handed `--seed-bootstrap`,
`--seed-mock-data`, or `--seed-test-plan-slices`, `boot()`
proves the encoding, applies the DDL, seeds an empty
database, prints the credential reveal on stderr, stamps
`schema_marker`, and only then listens. Every consumer of
a seed — `./wipe-postgres`, `./measure`, the Render start
command, TEST-PLAN A3 and K8 — reaches it by starting the
server and reading its stderr.

After this change the server neither seeds nor writes
schema. It proves the encoding, proves the marker, and
listens — or refuses, legibly. Seeding is
`./postgres-seed`: one program, run from the checkout on
the workstation or as a one-off job on Render. Wiping is
`./postgres-wipe`, which only drops. Each tool does one
thing. A `./wipe-and-seed` composer may be added later if
the need is felt; it is not built here.

These remain development guns for a disposable demo. They
guard no durability.

## Context

What exists, and who leans on it:

- `server/seed.ts` owns flag parsing, the emptiness check
  (`requests`, `responses`, and `schema_marker` all
  empty), the serial scrypt hasher, the reveal formatting
  (header `Save your demo sign-ins — shown once; copy them
  now.` then `username<TAB>password` lines, or
  `section<TAB>field<TAB>value` lines for slices), and
  `applySeedFlag`.
- `server/boot.ts` holds the entry gates — `requiredEnv`,
  `assertUtf8`, `applyDdl`, `hasSchemaMarker`,
  `assertSchemaMarker`, the pool timeouts, and
  `bootErrorMessage`, an allowlist that can never echo a
  URL — and calls the seed between DDL and the marker.
- `api/mock-data.ts` (`postBootstrap`, `postMockDataLoad`)
  and `api/test-plan-slices.ts` (`postTestPlanSlices`) are
  the seed bodies. Each calls `adapter.ensureTables`,
  which on Postgres applies the same idempotent DDL, and
  each stamps the marker LAST so a failed seed reads as
  empty.
- `api/errors-postgres.ts` already names a missing table
  by SQLSTATE `42P01`.
- `./wipe-postgres` (local) builds, spawns
  `server.mjs --seed-*`, polls its stderr for the reveal,
  and kills the child. (render) relies on the live start
  command `node server.mjs --seed-mock-data ||
  node server.mjs` to seed on restart, or posts a
  bootstrap job, cancels it after the reveal, and restarts.
  It ends by trying to revoke the API key against guessed
  endpoints.
- `web-app/app/measure.ts` spawns
  `server.mjs --seed-mock-data`, reads the demo password
  from stderr (`passwordFromSeedReveal`), and benchmarks
  that same process. `measure-cli.ts` pins the flag.
- TEST-PLAN.md A3 starts the server with a seed flag; K8
  reseeds by restarting it; SV1 pins the stderr reveal.
- Docs that teach the flags: CLAUDE.md, ARCHITECTURE.md,
  API.md, SCHEMA.md, README.md. `api/db.ts`'s
  `MissingTableError` names them in a 500 body.
- `server/` is outside `tsc`'s include set; its modules
  are typed by `node --strip-types` and the tests.
- Render's build already runs `./build`, which runs
  `node --strip-types web-app/app/compose.ts`: Render's
  Node runs TypeScript source. Render's `npm ci` installs
  `postgres` (a devDependency); the existing wipe job
  imports it from the checkout's `node_modules`.
- The repository has no Docker convention and documents
  no way to provision a Postgres. Every tool speaks to the
  database through `POSTGRES_URL` and nothing else.

## The Decisions

Each was put to the user and answered.

1. **Render seeds explicitly.** The start command becomes
   `cd render-out && HTTP_SERVER_PORT=$PORT
   node server.mjs`. A fresh or wiped Render database is
   seeded by a one-off job that runs `postgres-seed` from
   the checkout. Both modes share one ceremony; no job is
   ever cancelled.
2. **The tool runs TypeScript source.** `./postgres-seed`
   is a bash wrapper over
   `node --strip-types server/postgres-seed.ts`, the
   `./measure` pattern. No build, no clean-tree gate to
   seed locally. The ZIP stays server-only.
3. **Wipe is drop-only.** `./postgres-wipe` no longer
   seeds. `./wipe-and-seed` may come later.
4. **Mode flags are `--bootstrap`, `--mock-data`,
   `--test-plan-slices`** — the server's words minus the
   `seed-` prefix, matching `SeedMode` and the `api/`
   entrypoints. `--pristine` and `--mockdata` retire.
5. **The Render plumbing lives once**, in a sourced bash
   library both tools read.
6. **Names are `postgres-seed`, `postgres-wipe`,
   `postgres-lib`.** The family sorts together.
7. **Layout B.** The entry gates move out of `boot.ts`
   into `server/postgres-gate.ts` (a pure move).
   `server/seed.ts` stays the seed library.
   `server/postgres-seed.ts` is the main module. `boot.ts`
   and `postgres-seed.ts` share the gates and never import
   each other.
8. **Only `postgres-seed` writes DDL.** The server never
   runs `POSTGRES_SCHEMA` again; it only verifies the
   marker. A deploy that changes an index reaches an
   existing database through wipe and seed.
9. **Neither tool revokes the Render API key.**
   `try_revoke` is deleted. Both tools end with the
   dashboard reminder.
10. **No role or database creation.** Provisioning is the
    platform's act (below). The tools begin at
    `POSTGRES_URL`.
11. **The repo documents the cold start**, including one
    concrete `docker run` line.

## Provisioning and Cold Start

Three layers, each trusting the one below only through a
gate.

**Layer 1 — provisioning: a role, a database, a password,
a `POSTGRES_URL`.** The platform does this; the repo never
has and will not start. The role must own the database —
Postgres 15 no longer grants `CREATE` on `public` to
everyone, and the owner keeps it. The role must never hold
`CREATEROLE` or superuser for any code path of ours; a
credential that can create roles is a secret nothing here
needs.

**Layer 2 — schema and data: `./postgres-seed`.** Creates
the tables, the `message_body` function, and the indexes;
seeds; stamps the marker. Its UTF8 gate is where a badly
provisioned database (`SQL_ASCII`) is caught, before any
write. A role that cannot `CREATE` fails the DDL with
`42501`; the failure surfaces with its SQLSTATE and is
never swallowed.

**Layer 3 — rows only: `node server.mjs`.**

The cold-start rite, from an empty Postgres server to a
listening app:

*Local, a brand-new Postgres server in Docker.*

```
docker run -d --name fusion-postgres \
    -e POSTGRES_USER=fusion \
    -e POSTGRES_PASSWORD=<secret> \
    -e POSTGRES_DB=fusion \
    -p 5432:5432 postgres:17
export POSTGRES_URL=postgres://fusion:<secret>@localhost:5432/fusion
export JWT_HMAC_SIGNING_KEY=<random>
./postgres-seed --postgres local --mock-data
./serve 8080
```

The image's entrypoint runs `initdb` (UTF8 from its default
locale) and creates the role and database; that is the
whole of layer 1.

*Render, a brand-new Render Postgres.* Create the Postgres
in the dashboard (or `POST /v1/postgres`); Render creates
the cluster, the database, its owning role and password.
On the web service set `POSTGRES_URL` to the INTERNAL
connection string, set `JWT_HMAC_SIGNING_KEY`, and set the
start command to
`cd render-out && HTTP_SERVER_PORT=$PORT node server.mjs`.
Deploy. The service refuses to listen with
`schema_marker absent; seed with ./postgres-seed` —
expected and loud. From the workstation run
`./postgres-seed --postgres render TOKEN --mock-data`; it
seeds through a job, prints the credential lines, and
restarts the service.

*Anywhere else.* A DBA runs `createuser fusion` (with a
password) and `createdb -O fusion -E UTF8 fusion` once.
Then `./postgres-seed --postgres local …` on that host, or
through an `ssh -L 5432:localhost:5432` tunnel, which
satisfies the loopback guard honestly. The repo's targets
stay `render` and `local`; this path is one sentence of
documentation, not a feature.

## The Server After

`boot()` is env → connect → `assertUtf8` →
`assertSchemaMarker` → listen.

- **No seed.** `server/seed.ts` is no longer imported by
  `boot.ts`. `readSeedMode` and `applySeedFlag` are
  deleted. `boot(env)` takes no argv.
- **No DDL.** `applyDdl` leaves `boot.ts`. The marker gate
  treats SQLSTATE `42P01` on `SELECT "only" FROM
  schema_marker` exactly as it treats no row, and refuses
  with one re-voiced message:
  `schema_marker absent; seed with ./postgres-seed`
  (the `MISSING_MARKER` constant keeps its name). The
  `42P01` predicate is exported from
  `api/errors-postgres.ts` as one small function so the
  wire layer and the gate speak of a missing relation in
  one voice.
- **No arguments.** Any argv beyond the script is refused
  before connecting:
  `server.mjs takes no arguments; seed with
  ./postgres-seed`. An operator who passes a retired flag
  is told, not silently obeyed.
- `bootErrorMessage` forgets `SEED_NONEMPTY` and
  `SEED_EXCLUSIVE_FLAGS`; its allowlist is `UTF8_REQUIRED`,
  `MISSING_MARKER`, the no-arguments message, and the env
  messages.
- The `listening` line on stdout is unchanged.

The current Render start command's `|| node server.mjs`
fallback keeps the service alive across the deploy: the
first half is refused for its argument, the second half
listens. The dashboard edit is therefore not
order-critical.

## `server/postgres-seed.ts` — The Program

The main module, guarded by the same `isMainModule()`
rite as `boot.ts`.

1. **Argv.** Exactly one of `--bootstrap`, `--mock-data`,
   `--test-plan-slices`. `--help` / `-h` prints usage on
   stdout and exits 0 before touching env or network.
   None, two, or an unknown argument: usage on stderr,
   exit 1. The parser (`parseSeedArgv`, in
   `server/seed.ts`) returns `ok` / `help` / `error` like
   `parseMeasureArgv`; the exclusivity message becomes
   `use exactly one of --bootstrap, --mock-data, or
   --test-plan-slices`.
2. **Env.** `POSTGRES_URL` only, via `requiredEnv`. The
   seeder hashes passwords; it never mints a token, so
   `JWT_HMAC_SIGNING_KEY` is not demanded. If it reads
   secrets, prove that it needs them.
3. **Connect** with `STATEMENT_TIMEOUT_MS` and
   `POOL_ACQUIRE_TIMEOUT_MS` from the gate module.
4. **Gates.** `assertUtf8`; then DDL through
   `adapter.ensureTables(TABLE_NAMES)`; then
   `assertEmptyDatabase`. DDL runs BEFORE the emptiness
   check on purpose: a half-dropped schema is repaired by
   `IF NOT EXISTS` and still refused if any surviving table
   holds rows. The seeder owns the schema; applying it
   idempotently before deciding is its job.
5. **Seed** through the existing `seedEmptyDatabase` /
   `postTestPlanSlices` with the serial hasher. The seed
   bodies stamp the marker last, as today.
6. **Reveal on stdout.** The header and the TSV lines,
   bytes unchanged from today's stderr reveal. One info
   line on stderr after success — `{"at", "level":"info",
   "message":"seeded", "mode"}` — carries no secret.
7. **Errors on stderr** as one JSON line through a safe
   filter of the `bootErrorMessage` kind: the allowlisted
   messages verbatim (`UTF8_REQUIRED`, `SEED_NONEMPTY`,
   the exclusivity message, `missing required env
   POSTGRES_URL`); anything else as `seed failed` plus a
   `code` field when the fault carries a SQLSTATE or errno.
   The URL is never echoed. Exit 1.
8. `sql.end()` in `finally`. The faithful are accountable
   for every handle they open.

`server/seed.ts` keeps `isDatabaseEmpty`,
`assertEmptyDatabase`, `serialPasswordHasher`,
`formatSeededCredentials`,
`formatTestPlanSliceCredentials`, `seedEmptyDatabase`, and
gains `parseSeedArgv` and the runner that `applySeedFlag`
becomes (`seedPostgres(sql, adapter, mode, options)`; a
mode is now required, never `undefined`). The three
`SEED_*_FLAG` constants are re-voiced to the new spellings.

`server/postgres-gate.ts` receives, by pure move from
`boot.ts`: `requiredEnv`, `EnvBag`, `assertUtf8`,
`hasSchemaMarker`, `assertSchemaMarker`,
`STATEMENT_TIMEOUT_MS`, `POOL_ACQUIRE_TIMEOUT_MS`,
`UTF8_REQUIRED`, `MISSING_MARKER`, and the safe-message
filter. Commit 4 then teaches that filter to take its
allowlist as an argument, so boot and seed share one
never-echo-the-URL rule. `boot.ts` keeps `readListenEnv`, `ListenEnv`,
`boot`, `RunningHttp`, and main.

## `./postgres-seed` — The Wrapper

```
./postgres-seed --postgres local --<mode>
./postgres-seed --postgres render TOKEN --<mode>
```

`<mode>` is `bootstrap`, `mock-data`, or `test-plan-slices`.

Bash, `set -euo pipefail`, the shape of every root script.
`--postgres` is required and has no default; `render`
takes a positional `TOKEN` and `local` refuses one, as the
wipe already rules. The wrapper validates that exactly one
mode flag is present before any environment or network
work; the program validates again at its own edge.

**`--postgres local`.** `assert_loopback_postgres_url`
(from the lib): `POSTGRES_URL` set, host `localhost`,
`127.0.0.1`, or `[::1]`. Then
`exec node --strip-types server/postgres-seed.ts <mode>`.
stdout passes through untouched; the exit code is the
program's.

**`--postgres render TOKEN`.** Copy the token into
`RENDER_API_KEY`; never echo it, never write it to disk.
Then:

1. `discover_render_ids`: exactly one Postgres and one
   web service visible to the token, or refuse with names
   and ids.
2. Post a job whose `startCommand` is
   `node --strip-types server/postgres-seed.ts <mode>`.
   The job runs in the checkout with Render's own
   `POSTGRES_URL`; the loopback guard is the wrapper's,
   not the program's, so the internal host passes.
3. `wait_for_job` until `succeeded`, polling every
   `POLL_SEC` for at most `REVEAL_TIMEOUT_SEC` (180 s).
   `failed`, `canceled`, or timeout: exit 1 with the job
   id and status.
4. `fetch_logs` for the job since the recorded start,
   `flatten_render_logs` to lines, `print_reveal_lines`:
   from the header line through the last line containing a
   tab — the same bytes a local run prints. Header absent:
   exit 10. No tab-bearing line after it: exit 11.
5. `POST /services/{id}/restart`.
6. Print the dashboard reminder for the key. Exit 0.

The markdown table of the wipe retires. It never fit the
three-column slices reveal, and `./measure` parses the
TSV. One format, every mode, both targets.

## `./postgres-wipe` — Drop-Only

```
./postgres-wipe --postgres render TOKEN
./postgres-wipe --postgres local
```

`--pristine`, `--mockdata`, the build step, the seed child,
the cancel dance, the restart, and `try_revoke` all go.

**local.** `assert_loopback_postgres_url`, then
`bash -c "$WIPE_START"` — the same four `DROP … IF EXISTS`
statements as `DROP_SCHEMA`. Exit 0. No `./build`; a wipe
no longer needs a clean tree.

**render.** `discover_render_ids`; post the wipe job;
`wait_for_job` until `succeeded` (120 s); exit 0. No
restart: the running service answers a loud 500
`missing table` until seeded, which ARCHITECTURE already
names as the posture. The script's last lines say
`seed with ./postgres-seed --postgres render TOKEN
--<mode>` and the dashboard reminder.

The drop stays non-transactional, as it is today. That is
a pre-existing shape; changing it is not this request.

## `postgres-lib`

One file at the repo root, sourced by both tools, not
executable, 78 columns, in `./validate`'s awk list and in
`ROOT_FILES`. Moved verbatim from today's `wipe-postgres`
where a function already exists:

- Constants: `API`, `WIPE_TIMEOUT_SEC`,
  `REVEAL_TIMEOUT_SEC`, `POLL_SEC`, `REVEAL_HEADER`,
  `DASHBOARD_KEYS`.
- Render HTTP: `fail_http`, `http_json`, `write_job_body`,
  `start_rfc3339`, `fetch_logs`, `flatten_render_logs`.
- `discover_render_ids` — the inline account-discovery
  node script, now a function that sets `OWNER_ID` and
  `SERVICE_ID`.
- `job_id_from` and `job_status_from` — the two node
  snippets the wipe repeats today; the seed job is the
  third caller, so they rise.
- `wait_for_job JOB_ID TIMEOUT_SEC LABEL` — poll to
  `succeeded`; exit 1 on `failed`, `canceled`, or timeout.
- `print_reveal_lines FILE` — the successor of
  `print_credential_table`; exits 10 / 11 as before.
- `assert_loopback_postgres_url` — today's
  `assert_local_env` minus its `JWT_HMAC_SIGNING_KEY`
  demand.
- `WIPE_START`.

Each script keeps its own arg loop, its own `mktemp -d`
and `EXIT` trap, and its own ceremony. The lib holds
functions, not control flow.

## `./measure`

Step 2 of `measure.ts` becomes two steps:

1. `execFile('./postgres-seed', ['--postgres', 'local',
   '--mock-data'])` from the repo root with the measure
   env, bounded by the existing 120 s seed budget. The
   demo password comes from its stdout through the
   unchanged `passwordFromSeedReveal`; a missing line is
   an error naming the demo email. A non-zero exit reports
   `lastJsonLogMessage(stderr)`, falling back to the
   trimmed stderr.
2. Spawn `node server.mjs` with no arguments in the build
   directory and `pollUntil` it answers `/` (ok or 404),
   under its own readiness bound.

`measure-cli.ts`: `MEASURE_SEED_FLAG` retires;
`measureServerArgs()` returns `['server.mjs']`;
`MEASURE_SEED_COMMAND` (`./postgres-seed`) and
`measureSeedArgs()` (`['--postgres', 'local',
'--mock-data']`) are pinned. The usage text says
`--base-url … Skips the seed.` `./measure` still needs
both env vars; the server does.

## Wire Text

`MissingTableError` (`api/db.ts`) — a 500 body — becomes
`Schema is missing table "x". Seed with ./postgres-seed.`
Its own commit, because it is wire-visible.

## Tests

No new test file for the bash tools (`build`, `serve`, and
the wipe have none). The covenants that change are
re-pinned where they live:

- `tests/pg-boot.test.ts`: gates import from
  `postgres-gate`; `hasSchemaMarker` returns false when
  the fake client throws `{ code: '42P01' }`;
  `bootErrorMessage` maps `SEED_NONEMPTY` to
  `boot failed`; `boot` refuses argv before connecting;
  `applyDdl` pins retire with the function.
- `tests/pg-seed.test.ts`: `parseSeedArgv` pins — one
  flag, none, two, unknown, help; the `applySeedFlag` run
  pins re-voiced to `seedPostgres` (fake client plus the
  memory adapter, as now); the live Postgres case keeps,
  preparing its schema through `ensureTables`; the seed
  error filter never echoes a URL.
- `tests/measure-cli.test.ts`: the new command pins.
- `tests/fusion-angle-live-name.test.ts`: `ROOT_FILES`
  names `postgres-lib`, `postgres-seed`, `postgres-wipe`.
- `api/errors-postgres.ts`: the exported `42P01`
  predicate gets a pin beside the mapper's.

## Documentation

- CLAUDE.md: the command list (`./postgres-seed` two
  lines, `./postgres-wipe` two lines); the test-as-you-go
  snippet gains the seed line before `./serve`; a new
  **Cold start** paragraph with the Docker line, the
  Render steps, and the one-sentence "anywhere else"; the
  Validate paragraph's root-script list; the Measurement
  paragraph; the Database bullet; the Gotcha "Operator
  seed is below HTTP" re-voiced to name the tool.
- ARCHITECTURE.md: Server process (no seed, no DDL, no
  argv, the marker message); the `./measure` paragraph;
  A2 and A5; the wire-covenant seed note; the
  "(or a successful seed)" clause.
- API.md §1.2, §3.26 / §3.27 operator-flag sentences,
  §5.3. SCHEMA.md's timestamp-recovery line. README.md's
  reveal sentence.
- TEST-PLAN.md: A3 serial and parallel become seed then
  `node server.mjs`; "stderr credential map" becomes
  stdout; SV1's PASS text; the AA preamble; K8 becomes
  stop → `postgres-wipe` → `postgres-seed --bootstrap` →
  start, then the reverse restore with `--mock-data`; the
  Protocol summaries and the environment block; in-case
  mentions of the retired flags. The historical six-phase
  note stays as history.
- The 2026-08-19 and 2026-08-20 specs and plans stand
  untouched.

## Render Operator Steps (Outside the Repo)

1. Deploy this change.
2. Set the start command to
   `cd render-out && HTTP_SERVER_PORT=$PORT node server.mjs`.
3. If the database is empty:
   `./postgres-seed --postgres render TOKEN --mock-data`.
4. Thereafter a reset is `./postgres-wipe --postgres
   render TOKEN` followed by `./postgres-seed --postgres
   render TOKEN --<mode>`.

## Invocation Summary

| Command | Does |
| --- | --- |
| `postgres-seed --postgres local --<mode>` | guard loopback; seed |
| `postgres-seed --postgres render TOKEN --<mode>` | job; reveal; restart |
| `postgres-wipe --postgres local` | guard loopback; drop |
| `postgres-wipe --postgres render TOKEN` | wipe job |
| `node server.mjs` | verify marker; listen |

## Failure, Handled With Grace

`postgres-seed`:

| Condition | Exit | Output |
| --- | --- | --- |
| `--help` / `-h` | 0 | usage; no env, no network |
| usage error (wrapper or program) | 1 | message + usage, stderr |
| `local`: `POSTGRES_URL` unset or non-loopback | 1 | variable name only |
| encoding not UTF8 | 1 | `Postgres server_encoding must be UTF8` |
| DDL or seed fault | 1 | `seed failed` + `code`; never the URL |
| database not empty | 1 | `database is not empty; refuse to seed` |
| `render`: not one Postgres + one service | 1 | names and ids |
| `render`: job failed / canceled / 180 s | 1 | job id and status |
| `render`: reveal absent in job logs | 10 / 11 | header / rows missing |
| `render`: restart refused | 1 | Render HTTP status |

`postgres-wipe`:

| Condition | Exit | Output |
| --- | --- | --- |
| `--help` / `-h` | 0 | usage |
| usage error | 1 | message + usage, stderr |
| `local`: env missing or non-loopback | 1 | variable name only |
| `local`: drop fails | 1 | Node's error text |
| `render`: not one Postgres + one service | 1 | names and ids |
| `render`: wipe job failed / canceled / 120 s | 1 | job id and status |

`node server.mjs`:

| Condition | Exit | Output |
| --- | --- | --- |
| any argument | 1 | the no-arguments message |
| marker row or table absent | 1 | the marker message |

## The Office of the Commit, Observed

Twelve commits; each passes `./validate` alone; each is
one concern. Nothing depends on server seeding by the
time it is removed.

1. `Rename wipe-postgres to postgres-wipe` — `git mv` and
   the places that name it (`validate`, `ROOT_FILES`,
   CLAUDE.md, its usage line). No behaviour change.
2. `Extract postgres-lib from postgres-wipe` — move the
   functions; the wipe sources them. No behaviour change.
3. `Move the boot gates to postgres-gate` — pure move;
   test imports follow.
4. `Add postgres-seed` — `server/postgres-seed.ts`,
   `parseSeedArgv`, the wrapper's `local` target, the
   tests, the CLAUDE.md command line. The server still
   seeds at this commit; both vocabularies coexist for
   exactly one commit.
5. `Seed ./measure through postgres-seed`.
6. `Make postgres-wipe drop-only`.
7. `Add --postgres render to postgres-seed`.
8. `Stop seeding from server.mjs` — no seed, no argv,
   `readSeedMode` / `applySeedFlag` deleted, the old flags
   retired, tests re-pinned.
9. `Stop applying DDL from server.mjs` — `applyDdl`
   deleted, the `42P01` predicate exported and used, the
   marker message re-voiced.
10. `Point MissingTableError at postgres-seed`.
11. `Document the Postgres tools` — CLAUDE.md (including
    Cold start), ARCHITECTURE.md, API.md, SCHEMA.md,
    README.md.
12. `Seed TEST-PLAN through postgres-seed`.

The Render start command is edited after commit 8 is
deployed; the `||` fallback tolerates either order.

## Measure or Be Silent

- `./validate` after every commit.
- The offline argument matrix for both tools: `--help`;
  no `--postgres`; `--postgres` without a value;
  `--postgres foo`; `local` with a positional; `render`
  without `TOKEN`; for the seed, none and two mode flags
  and an unknown flag; `local` with `POSTGRES_URL` unset
  and with a non-loopback host.
- A live local cycle against the Docker Postgres:
  `./postgres-wipe --postgres local`, then
  `./postgres-seed --postgres local` in each of the three
  modes in turn (wiping between), each printing the
  reveal on stdout; after each, `./serve` listens and the
  credentials sign in.
- `node server.mjs` against an empty database refuses
  with the marker message; with an argument, with the
  no-arguments message.
- `./measure --pages dashboard --runs 1` end to end.
- `./test-postgres`.
- The Render path cannot be exercised from the sandbox;
  it is verified by reading the diff and by the offline
  matrix, and the final report says exactly that.

## What We Shall Not Build

- No role or database creation; provisioning is the
  platform's, and the tools begin at `POSTGRES_URL`.
- No `./wipe-and-seed` now.
- No Docker dependency in any script; the Docker line is
  documentation.
- No key revoke.
- No change to the Render IP allow-list.
- No bash test files.
- No transactional drop; the wipe's shape is unchanged.
- No `seed.mjs` in the build; the ZIP stays server-only.

## Later, Not Now

- `./wipe-and-seed`, if the two-command reset proves
  tiresome.
- A transactional drop in `postgres-wipe`.
- Casting the development guns out once the product is no
  longer a disposable demo.

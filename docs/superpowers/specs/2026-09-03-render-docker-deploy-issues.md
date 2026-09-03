# Render Docker deploy: issues to brainstorm

- Date: 2026-09-03
- Status: issue ledger, pre-brainstorm
- Source session: executed
  `docs/superpowers/specs/2026-09-01-render-docker-runtime-design.md`
  and its plan. Production is live on Docker at
  `042de5e5` (`dep-dacfgcojo6nc7381asu0`). This
  file does not propose a fix. It names what
  broke, in enough detail that a new session
  can design without re-deriving the facts.

The 2026-09-01 spec and plan assumed a thin
operator path: one API key file, `postgres-lib`
`http_json`, one in-place runtime PATCH, one
named-sha deploy, two doc commits. The deploy
shipped. The path was not thin. Almost every
wave hit a seam the plan did not name.

## What shipped, so a new session knows the
floor

- Service `srv-da0vkntbedkc73bn3i70`, owner
  `tea-da0vfju1egvs739l610g`, Postgres
  `dpg-da4cqaqfngtc7395njs0-a`.
- Runtime patched `node` → `docker` in place.
  Auto-deploy stayed `off`. Health check `/`.
- `origin/master` was `c25cd8c3` at the start
  (722 local commits ahead). Operator pushed
  `c25cd8c3..042de5e5`. Docs later landed at
  `efb5c933` and were not pushed in-session.
- First Docker deploy of `042de5e5`
  (`dep-dacf8j95efls73e7nq4g`) was
  `update_failed` in 43 s.
- After a ground-up reseed, second deploy
  (`dep-dacfgcojo6nc7381asu0`) went `live`.
  `listening` on port 10000.
  `BUILD_SECONDS=24.717982` (layers cached
  from the failed attempt). Domain oracles
  held: apex `/` 200, `/landing/index.html`
  200, `/api/organizations` 401; `www` 301
  to apex.
- `NODE_VERSION` deleted afterward. Three
  keys remain: `POSTGRES_URL`,
  `JWT_HMAC_SIGNING_KEY`,
  `TRUSTED_PROXY_HOPS`. No redeploy.
- API key at `~/render-api-key` was revoked
  (401) and the file removed.

## Issue 1 — Three Render auth surfaces, two
dead

The plan's only credential was
`~/render-api-key`, mode 600, 32 bytes.

The Render CLI (`/opt/homebrew/bin/render`,
v2.26.0) was installed and was the tool that
finally created and waited on deploys. It was
not in the plan. `render whoami` without the
file key returned `unauthorized`.
`~/.render/cli.yaml` held a workspace
(`tea-da0vfju1egvs739l610g`) whose `api.key`
had `expires_at` 2026-08-26T04:11:51Z — dead
before this session. Exporting
`RENDER_API_KEY` from the file key made the
CLI work.

A new session should treat "the Render
credential" as at least: the file key, the
CLI yaml key plus expiry, and the dashboard
login used to mint both. The plan's
"revoke the file key when the work closes"
does not touch the CLI yaml.

## Issue 2 — The plan's HTTP adapter was
unusable from the controller shell

`postgres-lib`'s `http_json` calls `curl` by
unqualified name. In the controller shell,
with `RENDER_API_KEY` exported, that lookup
failed instantly: `http_json:20: command not
found: curl`. `/usr/bin/curl` existed.
`command -v curl` succeeded in a subshell
that did not export the key. Wrapping
`curl() { /usr/bin/curl "$@"; }` and pinning
`PATH=/usr/bin:/bin:...` made `http_json`
work. Unwrapped `curl` in a later domain
oracle also 127'd.

A subagent could call Render; the controller
often could not, until the wrapper. The plan
said: if `api.render.com` is sandbox-denied,
hand the block to the operator and never
retry the denied host. The failure mode was
not a sandbox_violations block. It was a
missing `curl` on PATH in the same process
that held the secret. That sent work into
subagents the plan had reserved for
read-only discovery.

## Issue 3 — Subagents did not use the CLI
and burned the deploy wave

Task 5 was dispatched to a subagent with the
plan's `http_json` poll loop. It ran ~5.5
minutes, 27 tool calls, 2 errors, and had
not POSTed a deploy when killed. No deploy
of `042de5e5` existed afterward. The
operator named it a clown car and pointed at
the CLI.

The working T5 was:

```
export RENDER_API_KEY="$(< ~/render-api-key)"
render deploys create "$SERVICE_ID" \
    --commit "$DEPLOY_SHA" \
    --wait --confirm -o json
```

`--clear-cache` was omitted (`do_not_clear`).
`--wait` exits non-zero on
`update_failed` / `build_failed`. JSON on
stdout named `id`, `status`, `createdAt`,
`finishedAt`. That is the plan's poll loop
and Deno seconds-arithmetic in one flag, and
the plan never mentioned it.

`render deploys list`, `render logs`,
`render jobs create`, `render postgres list`,
and `render psql` also exist.
`render psql` needs a `psql` binary; this
machine did not have one on PATH.
`render jobs create` has no `--wait`.
`render env` is not a command.

## Issue 4 — GitHub SSH was off until
ssh-add; origin check is load-bearing

Task 1 Step 1's `git ls-remote origin
refs/heads/master` failed:
`Permission denied (publickey)`. The
controller saw the same until the operator
ran `ssh-add`. Local `origin/master` still
read `c25cd8c3` from the last fetch, which
is not the live remote. The plan treats a
remote head other than `c25cd8c3` as a STOP
(premises changed). After ssh-add, the
remote was still `c25cd8c3`. The push later
was `c25cd8c3..042de5e5`.

## Issue 5 — `docker compose build` cannot
parse compose.yaml without runtime secrets

Task 2's oracle is literally
`docker compose build`. compose.yaml
interpolates `${POSTGRES_PASSWORD:?required}`
and `${JWT_HMAC_SIGNING_KEY:?required}` at
file-parse time, including for `build`. The
Dockerfile declares no `ARG`; the secrets
are not build inputs. Bare
`docker compose build` failed interpolation
before any image work.

The session minted both in a subshell the
way `./crank` does, never printed them, wrote
no `.env`. Seed sits behind compose profile
`seed`, so default-profile `docker compose
build` only built `fusion-angle-server`.
`docker compose --profile seed build` then
tagged `fusion-angle-seed` from cache.

ARCHITECTURE.md still says
`docker compose build` is ~13s. This run's
server image printed
`Executable created: fusion-angle
(111065440 bytes)` and finished in ~9 s with
warm layers.

## Issue 6 — Spec oracles vs the live
service

Task 1's expected `startCommand` was
`node server.mjs`. The live command was
`cd render-out && HTTP_SERVER_PORT=$PORT
node server.mjs --seed-mock-data ||
HTTP_SERVER_PORT=$PORT node server.mjs`.
The plan STOPs only on a third runtime or
auto-deploy not `off`. Recorded, not a STOP.
That longer command is what the Node
instance actually ran, including a
`--seed-mock-data` fallback the spec did
not know about.

`deploys?limit=5` returned five
`build_failed` of `c25cd8c3` and no `live`.
The live deploy was the eighth:
`dep-da20e0dg1s2s73ddkna0` at `971df2a1`
(2026-08-18). Seven failed retries of the
pushed-but-unbuildable native commit sat on
top. `limit=5` cannot confirm the spec's
"production serves 971df2a1" premise.
`limit=20` could.

Build log on the first Docker deploy opened
with: "It looks like we don't have access
to your repo, but we'll try to clone it
anyway." The clone of `042de5e5` succeeded.
The warning is unexplained.

## Issue 7 — schema_marker vs an empty
public schema (the actual outage)

The spec said seed and wipe are not
exercised because the production database
is populated. The new binary's boot gate
(`server/postgres-gate.ts`) refuses without
a `schema_marker` row. The old Node process
did not enforce that gate.

App log on `dep-dacf8j95efls73e7nq4g`:

```
schema_marker absent; seed with ./postgres-seed
==> Exited with status 1
```

Status `update_failed`, not `build_failed`.
The image built and started. The process
exited 1. The previous instance kept
serving `/` 200. Rollback was inaction, as
the spec said.

A later `SELECT tablename FROM pg_tables
WHERE schemaname = 'public'` over the
external connection returned no rows.
Public was empty. "Production is populated"
was false for the schema the new binary
reads. Whether the old Node stored rows in
another schema, another database, or simply
served a static `/` off an empty plane was
not established. `/` 200 does not prove a
seeded message plane.

## Issue 8 — Operator wipe/seed jobs cannot
run until Docker is already live

`./postgres-wipe --postgres render TOKEN`
and `./postgres-seed --postgres render
TOKEN --mock-data` POST one-off jobs whose
`startCommand` is
`./render-out/fusion-angle wipe` and
`./render-out/fusion-angle seed --mock-data`.
Those binaries exist in the Docker image
(`WORKDIR /srv`, `CMD` execs
`./fusion-angle serve` from `render-out`).
They do not exist on the Node image that
was still live.

`render jobs create … --start-command
"./render-out/fusion-angle wipe"` created
`job-dacfao2jnfac73cc2pt0`, which went
`failed` in ~11 s. `render logs
--resources job-…` returned empty in every
direction and type tried. No stderr, no
"no such file". The job JSON had
`startedAt` and `finishedAt` and nothing
else useful.

Chicken-egg: the Docker boot gate needs
`schema_marker`; putting `schema_marker` on
Render via the blessed job path needs the
Docker image to be the job's runtime; the
Docker image is not the job's runtime until
a deploy is live.

`./postgres-wipe --postgres local` and
`./postgres-seed --postgres local` assert
loopback on `POSTGRES_URL` in the bash
wrapper. They will not aim at Render. The
`.ts` verbs themselves have no loopback
check. Direct `deno run server/postgres-seed.ts`
is the gun the wrappers exist to keep
holstered.

## Issue 9 — Two Postgres URLs, only one
resolves from a laptop

The web service's `POSTGRES_URL` env var
uses the internal hostname
`dpg-da4cqaqfngtc7395njs0-a` (98 bytes).
`getaddrinfo ENOTFOUND` from the laptop.

`GET /postgres/{id}/connection-info` returns
`internalConnectionString` (98 bytes) and
`externalConnectionString` (130 bytes), plus
`password`. The external URL is what a
laptop can speak. `ipAllowList` includes
`0.0.0.0/0` (already a named TODO hazard).

Connecting with the external URL without
TLS failed: `PostgresError: SSL/TLS
required`. Appending `sslmode=require`
worked. `connectPostgres` does not set SSL
itself; it passes the URL to `postgres.js`.

The reseed that unblocked boot was therefore
not the operator scripts. It was: read
connection-info, write the external URL to a
mode-600 temp file, `DROP SCHEMA public
CASCADE` / `CREATE SCHEMA public` /
`GRANT ALL …`, then
`deno run --frozen server/postgres-seed.ts
--mock-data` with the postgres-seed
`--allow-env` list. Serial scrypt on mock
identities took ~503 s. Reveal printed once.
Temp files unlinked afterward.

The operator asked for a ground-up reseed
and said this is pre-production, and that
it is not guaranteed to be once-only.
`POSTGRES_DROP_SCHEMA` (the wipe verb) only
drops `message_pairs`, leftover `pairs`,
`responses`, `requests`, `schema_marker`,
and `message_body(bytea)`. It is not a
schema drop. An empty public schema made
the distinction moot this time. A database
with extra tables would not have been
emptied by wipe, and seed's emptiness check
only looks at `message_pairs` and
`schema_marker` after `ensureTables`.

## Issue 10 — Deno `--allow-env` is a trap
on the first postgres.js connect

A stdin Deno program allowed only
`POSTGRES_URL` and died:
`NotCapable: Requires env access to
"PGPORT"`. `postgres.js` reads a flock of
`PG*` names at parse time. The
`postgres-seed` / `postgres-wipe` wrappers
already list them. Any new one-off Deno
against Postgres must copy that list, not
invent a shorter one.

## Issue 11 — Plan ceremony vs operator
git

Task 3's written block was three
confirmations plus push plus a fourth
`ls-remote`. The operator's actual work is:
confirm origin/master is an ancestor of
local master, then `git push`. Git already
refuses a non-fast-forward without
`--force`. The extra lines were the plan's
oracles, not the work. The operator pushed
once, with the expected
`c25cd8c3..042de5e5  master -> master`.

The controller never pushed, including the
four doc commits after landing. Those still
need `git push origin master`
(`042de5e5..efb5c933`) if that has not
happened since.

## Issue 12 — Plan stale against master
before execution

The worktree was two commits (spec, plan)
on merge-base `7f98026a`. Master had moved
60 commits. `TODO.md` line numbers in the
plan (1306–1330, expect 1354 lines) were
wrong; the bullet was at 1242–1266 on a
1290-line file. The plan already said to
`grep -n` if the numbers differ. Wave 0
recaptured `DEPLOY_SHA` as `042de5e5`.
Rebase of spec+plan onto master was clean
because those files did not exist on
master.

`git rev-list --count c25cd8c3..master` was
722, still ≥ the plan's 662.

## Issue 13 — Cached second deploy hides
the build-log oracle

Task 6 wants builder-stage lines,
runtime-stage lines, and
`Executable created: fusion-angle (…
bytes)` in the deploy's build log. The
live deploy reused every layer from the
failed one (`COPY . .` CACHED,
`./build --no-zip render-out/` CACHED).
This deploy's log does not reprint
`Executable created`. The `listening`
line and domain oracles still held. A
build-time measurement of 24.7 s is the
cache-hit path, not the cold Render Docker
build the build-artifact spec wanted
measured. The cold attempt is the failed
deploy's log, which did run apt-get and
was cut off in the first log pull before
`Executable created`.

## Issue 14 — Per-block `go` vs "finish"

The plan: operator steps need per-block
`go`; never blanket. The session needed
`go` for T2, T4, T5, then "go finish this
thing" for T7–T11. T10 (dashboard revoke)
cannot be done from the agent. The file
key was proven dead (401) and removed
only after the operator said it was
revoked.

## What a new session is being asked to
think about

Not "how to switch Render to Docker" —
that is done. The open problem is the
operator path:

- Which credential, which tool (CLI vs
  `http_json` vs `./postgres-seed
  --postgres render`), and how they
  fail closed together.
- How to seed or wipe a Render database
  when the live image is not the image
  that contains `fusion-angle`, or when
  public is empty, or when the only
  reachable URL is the external one with
  TLS.
- How Layer-2 / compose oracles should
  be invoked on a compose file that
  interpolates runtime secrets at parse
  time.
- How not to send a production deploy
  into a subagent that does not know the
  CLI exists.

Out of scope then, still out of scope:
`render.yaml`, `/status`,
`TRUSTED_PROXY_HOPS`, the `0.0.0.0/0`
allowlist, a dependency-warm Docker
layer, diagnosing the old Node 500.

# Render: switch the web service to the Docker runtime

- Date: 2026-09-01
- Status: approved design, pre-plan
- Approach: in-place runtime switch on the existing
  service. Declined: a native-runtime build that
  curl-installs Deno (a second build recipe, living
  only in the dashboard); a `render.yaml` Blueprint
  (a separate concern, named below).

## Problem

Render still runs the retired Node runtime. Its build
command is `npm ci --include=dev && git checkout -- .
&& ./build --no-zip ./render-out/` and its start
command `node server.mjs`; neither `package.json` nor
`server.mjs` exists on master. The Dockerfile that
compose exercises is the build recipe master has.

Read-only discovery through the Render API on
2026-09-01 corrected the premises the TODO entry
recorded:

- Render's runtime is editable after creation:
  dashboard Settings → Build → Source → Edit, or
  `PATCH /v1/services/{id}` with
  `serviceDetails.runtime`. No new service, no
  domain move, no env var copy.
- master has never been pushed past `c25cd8c3`. The
  local branch carries 662 unpushed commits; Render's
  last fetched commit is `c25cd8c3`. Every red deploy
  is Render retrying that commit, where `./build`
  still ran `./validate`, whose Postgres race tests
  found the build-time `POSTGRES_URL`, ran against the
  production database in a throwaway schema, and
  failed on assertions. `npm ci` never ran on master.
- Auto-deploy is off (`autoDeployTrigger=off`).
- Env vars: `POSTGRES_URL`, `JWT_HMAC_SIGNING_KEY`,
  `TRUSTED_PROXY_HOPS`, and `NODE_VERSION`. The last
  dies with the runtime.
- One web service, one Postgres (version 18, created
  2026-08-21), four verified custom domains:
  `fusionangle.com`, `fusionangle.ai`, and their
  `www` redirects. Health check path `/`. Plan
  starter, region Oregon.

Production serves the 2026-08-18 Node deploy
(`971df2a1`): both apex domains 200, `www` → apex
301, `/api/organizations` 401 without a token, and
an intermittent 500 on `/` from that old code.

## Decision

Switch the existing service to the Docker runtime in
place, deploy master's pushed head by commit sha,
verify over the custom domains, then record the
outcome. Product code, tests, Dockerfile, and
compose.yaml are untouched.

## Design

### 0. Credentials

The operator's Render API key lives at
`~/render-api-key`, mode 600, outside the repo. Every
request reads it from that file inside the
`Authorization` header; it is never printed, never
copied into the repo or a commit. Env var listings
print keys only. The operator revokes the key when
the work closes, the convention `postgres-lib`
already prints.

### 1. Push

The operator pushes master. Auto-deploy is off, so
the push deploys nothing. Every step below names the
pushed sha explicitly; none relies on "latest on
branch".

### 2. Runtime patch

Read the service first. Patch only when the runtime
is `node`; exit clean when it is already `docker`;
stop on anything else.

```json
{"serviceDetails":{"runtime":"docker",
 "envSpecificDetails":{"dockerfilePath":"./Dockerfile",
 "dockerContext":".","dockerCommand":""}}}
```

An empty `dockerCommand` runs the image `CMD`, which
maps Render's `PORT` (10000) onto `HTTP_SERVER_PORT`
and execs `./fusion-angle serve`. Build and start
commands cease to exist with the runtime. Env vars
are untouched. Health check path stays `/`.
Auto-deploy stays off: TEST-PLAN.md makes Layer 2 the
operator's gate before a deploy, and an explicit
deploy call is that gate made literal. The patch
does not deploy by itself.

### 3. Deploy

`POST /v1/services/{id}/deploys` with
`{"clearCache":"do_not_clear","commitId":"<sha>"}`.
Poll `GET …/deploys/{deployId}` every 15 s until
`live`; stop on `build_failed`, `update_failed`,
`canceled`, `pre_deploy_failed`, or `deactivated`;
cap at 30 min. Render keeps the current deploy
serving until the new one passes the health check, so
a failure changes nothing in production and the
report names the failing step.

### 4. Verify

- Build log: both stages run, `Executable created`
  appears, and the elapsed time from the deploy's
  `createdAt` to `finishedAt` is recorded.
- `GET /` is 200 on `fusionangle.com` and
  `fusionangle.ai`; `/landing/index.html` is 200;
  `/api/organizations` is 401.
- The app log carries the `listening` JSON line with
  Render's port.
- Seed and wipe are not exercised: the production
  database is populated. Their job command
  `./render-out/fusion-angle …` resolves by
  construction — the Dockerfile sets `WORKDIR /srv`
  and copies `render-out` beneath it.

### 5. Cleanup on Render

Delete `NODE_VERSION` through
`DELETE /v1/services/{id}/env-vars/NODE_VERSION` once
the Docker deploy is live. The operator revokes the
API key.

### 6. Docs

- TODO.md: remove the Render bullet. The work is
  done, not reshaped; the close protocol applies. No
  Sequencing line references it.
- ARCHITECTURE.md, the paragraph "Render builds from
  the Dockerfile": add that the existing service
  switched runtime in place (Render's runtime is
  editable after creation); the measured Render
  Docker build time, closing the build-artifact
  spec's "measured at the first deploy" risk; and
  that the Docker build runs no tests and sees no env
  vars, unlike the retired native build.

## Hazards

- `.git` in Render's Docker build context is
  undocumented. `./build`'s clean-tree gate passes
  either way: a fresh clone prints nothing, and a
  missing `.git` fails `git status` inside the `if`
  condition, which `set -e` does not trap, leaving
  the substitution empty. `git rev-parse` runs only
  on the ZIP path.
- Render translates a Docker service's env vars into
  build arguments. The Dockerfile declares no `ARG`,
  so no RUN step can see them. Keep it that way.
- Build time: `COPY . .` invalidates every later layer
  on each commit, and `deno compile` fetches `denort`
  each build. Measured at this deploy; a
  dependency-warm layer is a later, measured change.
- The image runs as `USER deno`; `Deno.serve` binds
  every interface by default; the service's detected
  port is 10000.
- Starter-plan memory holds the Node instance today;
  the compiled binary is the same program. Watch the
  first hours.
- The dashboard may not offer Docker in its runtime
  dialog for a native-born service. The API is the
  path used.

## Rollback

Patching `runtime` back to `node` with the old
commands restores the configuration, but that runtime
cannot build master. The real rollback is inaction:
the 2026-08-18 deploy stays live until a Docker
deploy passes the health check.

## Out of scope, named

- A `render.yaml` Blueprint holding the dashboard
  configuration.
- The `/status` health endpoint (TODO item 5).
- The `TRUSTED_PROXY_HOPS` throttle seam and the
  database's `0.0.0.0/0` allowlist (TODO item 10).
- The intermittent 500 on `/` in the old Node deploy:
  replaced, not diagnosed.

## Commit sequence

1. This spec.
2. The plan.
3. After the deploy is live: the ARCHITECTURE.md
   record.
4. Remove the TODO bullet.

Push, patch, deploy, verify, the env var delete, and
the key revocation are operator steps, not commits;
the plan names each with its oracle.

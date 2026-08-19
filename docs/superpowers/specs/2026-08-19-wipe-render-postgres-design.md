# Wipe Render Postgres — Design

Date: 2026-08-19
Status: draft (brainstorm 2026-08-19; awaiting user
review)
Spec-only. No implementation in this document.

## Goal

Make the operator wipe we ran by hand a single root
script: empty the Render Postgres instance and seed it
again, either pristine (bootstrap) or mock-data.

This script is a development gun. It will be removed
before the system is judged fit for purpose. It does
not protect durability.

## Context

The live start command is:

```
cd render-out && HTTP_SERVER_PORT=$PORT \
  node server.mjs --seed-mock-data \
  || HTTP_SERVER_PORT=$PORT node server.mjs
```

`--seed-mock-data` and `--seed-bootstrap` each refuse
a non-empty database. They are two complete loads, not
layers. Mock-data does not call bootstrap. They share
some names (`current`, system identity, Stark) and
some PII text; they are not byte-identical and cannot
be stacked.

`./build` does not copy root scripts. The ZIP and
`render-out/` hold composed pages, `assets/`, and
`server.mjs`. The wipe script stays on the
workstation and talks to the Render HTTP API.

External `psql` / postgres.js against the Render
hostname needs an IP allow-list entry. The Postgres
allow-list is empty. A one-off job on the web service
uses the inherited internal `POSTGRES_URL` and does
not touch that list.

Render has no public “delete this API key” endpoint.

## User decisions

1. **Name:** `./wipe-render-postgres`.
2. **Token is the first argument** and is the
   confirmation. No prompt. No `--confirm`.
3. **Exactly one Postgres and one web service**
   visible to the token, or refuse. No name
   preference. No extra id flags.
4. **HTTP only.** `curl` + the token. No `render`
   CLI.
5. **`--pristine` and `--mockdata` are exclusive.**
   One of the two is required.
6. **Ceremony:** wipe job, then seed via the live
   start command (mock-data) or a bootstrap job
   plus restart (pristine).
7. **After a successful credential table,** try to
   revoke the API key. Failure is a warning. The
   wipe still exits 0.
8. **Match the other root scripts.** Same shebang,
   `set -euo pipefail`, 78-column lines, `--help`,
   CLAUDE.md line, `./validate` line-length list.
   Add `measure` to that list in the same edit so
   the family matches.

## Non-goals

- Do not add the script to `./build` or `render-out`.
- Do not mutate the Postgres IP allow-list.
- Do not call `postBootstrap` then `postMockDataLoad`.
- Do not change the Render start command.
- Do not require the `render` CLI.
- Do not add a confirmation prompt.
- Do not add a new test file for this script.
- Do not treat a failed key revoke as a failed wipe.
- Do not log, echo, or write the token to a file.

## Invocation

- `TOKEN --pristine` — wipe, seed bootstrap.
- `TOKEN --mockdata` — wipe, seed mock-data.
- `TOKEN` alone — usage error. One flag required.
- both flags — usage error. Exclusive.
- `--help` — usage. Exit 0. No token.

Flag order does not matter. Unknown args are a usage
error. `--help` / `-h` do not require a token.

## Ceremony

Bash, same voice as `./serve`. Base URL
`https://api.render.com/v1`. Header
`Authorization: Bearer <token>`. Copy the token into
`RENDER_API_KEY` for `curl`. Never put it on a query
string, never echo it, never write it to a file.

1. `GET /postgres` and `GET /services`. Count
   Postgres instances and `type=web_service`.
   Refuse unless each count is exactly one. Print
   the names and ids seen on refuse.
2. `POST /services/{id}/jobs` with a start command
   that runs the official drop against
   `process.env.POSTGRES_URL`:

   ```
   DROP TABLE IF EXISTS responses;
   DROP TABLE IF EXISTS requests;
   DROP TABLE IF EXISTS schema_marker;
   DROP FUNCTION IF EXISTS message_body(bytea);
   ```

   That is `PostgresBackend`'s `DROP_SCHEMA`. The
   job imports `postgres` from the checkout's
   `node_modules` (Render `npm ci` already put it
   there). Poll until `succeeded`. Timeout
   2 minutes.
3. Seed, then leave only the web service listening.

   **`--mockdata`.** `POST /services/{id}/restart`.
   Empty database → start command's
   `--seed-mock-data` runs → listen. Poll **service**
   logs for `Save your demo sign-ins`.

   **`--pristine`.** A restart on an empty database
   would mock-seed. So: `POST /services/{id}/jobs`
   with

   ```
   cd render-out && HTTP_SERVER_PORT=8080 \
     node server.mjs --seed-bootstrap
   ```

   Poll **job** logs for the reveal header. Cancel
   that job (it listens after seed). Then restart
   the web service. Non-empty → `--seed-mock-data`
   refuses → `|| node server.mjs` listens.
4. Parse the username/password lines after the
   reveal header. Print a markdown table on stdout.
5. Try to revoke the API key (below). Then exit 0.

Reveal header missing for 3 minutes after the seed
step: exit 1. Do not wipe again.

## Key revoke (best effort)

After the table prints, try to revoke the token
just used. Render documents no such endpoint.
The script tries `DELETE` (and if needed `POST`)
on plausible paths under `/v1/` (for example
`/v1/api-keys/current`). Any non-success prints
one warning to stderr: revoke it in the Render
dashboard account settings, with that URL. Exit
0 either way. Never print the token in the
warning.

## Failure handling

- `--help` / `-h` — exit 0. No network.
- Missing token, missing flag, both flags,
  unknown args — exit 1. Usage on stderr.
- Render 401 / 404 / 429 / 5xx — exit 1.
  Status + error `message` only.
- Not exactly one Postgres or one web
  service — exit 1. Print names and ids.
  No wipe.
- Wipe job failed, canceled, or 2-minute
  timeout — exit 1. Job id and status.
  No restart.
- Seed job failed or timed out
  (pristine) — exit 1. Job id and status.
- Reveal header absent for 3 minutes —
  exit 1. Do not wipe again.
- Key revoke fails — exit 0. Warning
  only.

`set -euo pipefail`. JSON lives under `mktemp` and
is deleted on `EXIT`.

## Shape, lint, docs

- `#!/bin/bash` and `set -euo pipefail`.
- 78-character lines, four-space indent.
- `--help` / `-h` print usage and exit 0.
- Usage errors to stderr, exit 1.
- One line in the CLAUDE.md command list.
- Add `wipe-render-postgres` and `measure` to
  `./validate`'s root-script line-length `awk`
  list (`measure` is a root script and is
  missing today).
- No new test file. `./serve` and `./build` have
  none. Seed exclusivity stays in
  `tests/pg-seed.test.ts` for the in-process
  flags.

## Out of scope later

Removing this script when the product is no
longer a disposable demo.

# Wipe Postgres — Design

Date: 2026-08-20
Status: draft, awaiting the user's review. Spec only;
no implementation lives in this document.

This scroll extends
[the 2026-08-19 design](2026-08-19-wipe-render-postgres-design.md).
That document remains the covenant for the Render
ceremony; not one step of it changes here. What
changes is the script's name, and the number of
databases it may be pointed at: two.

## The Goal

There comes a time, my friends, when the hand-run
reset of the local database can no longer be
endured. We have a script that empties the Render
Postgres and seeds it again. We run the same product
against a Postgres on this very machine — a Docker
container — and we reset *that* one by hand, with
`psql` and memory and hope.

No more. One script, one required flag —
`--postgres render` or `--postgres local` — and one
name that tells the truth: `./wipe-postgres`. The
word "render" described the script once. It does
not describe it now, and Confucius has taught us
what follows when names are not correct.

It remains a development gun. It guards no
durability. It will be cast out before the system
is judged fit for purpose.

## On the Wall and the Workstation

Hear first why the two targets cannot share one
transport.

The Render Postgres stands behind a wall: its IP
allow-list is empty, and nothing on a workstation
may open a connection to it. So the Render wipe
does not connect. It posts a one-off job to the web
service — the job inherits the service's own
`POSTGRES_URL` — and it reads the seed's credential
reveal back out of Render's logs API. That is the
ceremony of 2026-08-19, and it is correct.

The local Postgres has no wall. And the workstation
already holds everything the Render job borrows:
the checkout; `postgres` in `node_modules`, a
devDependency; `./build`; and the very environment
`./serve` demands. What the job does from afar, the
workstation may simply do.

Now witness the drop. The Render job's
`startCommand` is already a complete shell line —
`node --input-type=module -e "…"` — that imports
`postgres`, reads `POSTGRES_URL`, and drops
`responses`, `requests`, `schema_marker`, and
`message_body(bytea)`: the four statements of
`DROP_SCHEMA` in `api/backend-postgres.ts`. Run that
same string under `bash -c`, and you have the local
drop. One program. Two launchers. The list of the
dropped is written once, as Generality demands —
for once the better way is found, it must rise to
replace every similar site, never rest beside them.

And the seed? The server already performs it.
`boot()` in `server/boot.ts` proves the encoding,
applies the DDL, runs whichever seed flag it was
handed — refusing, as it should, a database that is
not empty — stamps `schema_marker`, and only then
listens. The reveal — the header
`Save your demo sign-ins — shown once; copy them
now.` and the `username<TAB>password` lines beneath
it — is written to stderr *before* the port binds.
By the moment we can read it, the seed is durable,
whether or not the listen that follows succeeds.
`measure.ts` already seeds a local database by this
exact rite: build `--no-zip`, spawn
`node server.mjs --seed-mock-data`, read stderr,
tear the process down. We follow the rite already
established. One codebase, one voice.

One more fact, and it is an absence: this repository
has no Docker convention. No compose file. No
container name. No page of documentation. Every
script that touches the local database — `serve`,
`test-postgres`, `measure` — speaks to it through
`POSTGRES_URL` and through nothing else.

## The Decisions

1. **The name is `./wipe-postgres`.** Call a thing a
   thing, in all things.

2. **`--postgres render|local` is required, and it
   has no default.** A default here would choose a
   database to destroy while the operator's back was
   turned — the Sin of Default Values at its most
   expensive. The flag is the operator naming the
   target aloud. Its value is a separate argument,
   as `./measure --pages a,b` already speaks.

3. **`local` means whatever `POSTGRES_URL` names.**
   The script does not know that Docker exists. No
   `docker` binary, no container name, no liveness
   check. Every sibling script reaches the local
   database by this one contract; we will not
   invent a second for one tool. Never generalize
   before exploratory duplication — and never
   specialize before there is anything to
   specialize for.

4. **`render` keeps its positional `TOKEN`** — the
   token is the confirmation, as before. `local`
   takes no positional argument at all, and to hand
   it one is a usage error. A token can never be
   delivered to the wrong target by accident.

5. **`local` accepts only a loopback host.** The
   URL's hostname must be `localhost`, `127.0.0.1`,
   or `[::1]` (the URL parser's spelling of `::1`).
   We validate at every edge, and the environment
   is an edge — the voice of the shell is
   frequently corrupt. This is what gives the word
   "local" teeth: the flag cannot be aimed at
   anything remote. If your container answers to
   another name, strike this decision; nothing else
   leans on it.

6. **`local` seeds from the built artifact.** The
   script runs `./build --no-zip` into its own temp
   directory and spawns `node server.mjs` with the
   seed flag. This inherits `./build`'s clean-tree
   rule, and we accept it gladly: `./serve`, the
   next thing the operator runs, keeps the same
   rule, so no new discipline is asked. Commit
   before you build — the artifact is the product of
   state, and state must be saved. I weighed running
   `server/boot.ts` under `node --strip-types` to
   skip the build, and I cast it out: it would be a
   second way of starting the server that no script
   uses, and `server.mjs` is the artifact we
   actually deploy.

7. **Rename first; change behaviour after.** The
   rename commit moves the file and touches the
   places that name it — nothing more. Never move or
   rename and change content in the same commit.
   The history shall read as a rename, not a
   rewrite.

8. **The same shape as every root script.** Bash,
   `set -euo pipefail`, seventy-eight columns,
   four-space indent, `--help`, a CLAUDE.md line,
   and a seat in `./validate`'s line-length list.

## What We Shall Not Build

The agent bearing gifts nobody asked for is still
bearing gifts nobody asked for.

- No Docker dependency of any kind.
- No change to the Render ceremony, the Render start
  command, or the IP allow-list.
- No new test file. `./serve` and `./build` have
  none; the in-process seed covenants are already
  pinned in `tests/pg-seed.test.ts`.
- No confirmation prompt.
- `TOKEN` and `POSTGRES_URL` are never logged,
  echoed, or written to disk. We guard the
  threshold of trust.
- The 2026-08-19 spec and plan stand untouched;
  they are the record of the Render-only shape.
- README.md stands untouched; it never named the
  script.

## Invocation

```
./wipe-postgres --postgres render TOKEN --pristine|--mockdata
./wipe-postgres --postgres local --pristine|--mockdata
```

`--pristine` seeds bootstrap; `--mockdata` seeds
mock data; exactly one is required. `--help` / `-h`
prints usage and exits 0, touching neither network
nor environment. Flag order does not matter.

Usage errors — message and usage on stderr, exit 1:
`--postgres` missing; `--postgres` with no value; a
value other than `render` or `local`; `TOKEN`
missing with `render`; any positional argument with
`local`; neither or both of the seed flags; any
unknown argument.

Environment errors for `local` — exit 1, naming the
variable and never its value: `POSTGRES_URL` unset
or empty; `JWT_HMAC_SIGNING_KEY` unset or empty;
`POSTGRES_URL` with a non-loopback host.
`JWT_HMAC_SIGNING_KEY` is demanded because `boot()`
demands it, even when it only seeds.

`render` ignores both variables; its jobs inherit
Render's own.

## The Render Ceremony

Unchanged, now entered through `--postgres render`:
list the account's Postgres instances and web
services and refuse unless there is exactly one of
each; post the wipe job; seed by restarting the
service (`--mockdata`), or by running a bootstrap
job, cancelling it after the reveal, and restarting
(`--pristine`); poll the logs for the reveal; print
the table; try to revoke the API key; exit 0.

## The Local Ceremony

1. **Drop.** Run `bash -c "$WIPE_START"` from the
   repo root with `POSTGRES_URL` in the environment.
   `WIPE_START` is the exact string the Render job
   would have received; Node resolves `postgres`
   from the checkout's `node_modules`. Should it
   fail — connection refused, bad credentials — the
   script exits 1 with Node's error text. We do not
   swallow it.

2. **Build.** `./build --no-zip "$TMP/build/"`.
   `./build` enforces the clean tree and proclaims
   its own failures; if it fails we exit 1 before
   any seed is attempted.

3. **Seed.** Ask Node's `net` module for a free
   loopback port — the rite `freePort()` in
   `measure.ts` already performs — then spawn
   `HTTP_SERVER_PORT=<port> node server.mjs
   --seed-bootstrap` (or `--seed-mock-data`) inside
   `$TMP/build`, stdout discarded, stderr captured
   to `$TMP/seed.err`. The child always receives its
   own port; an `HTTP_SERVER_PORT` in the operator's
   shell is ignored.

4. **Wait for the reveal.** Poll `$TMP/seed.err`
   every `POLL_SEC` (5 s) for at most
   `REVEAL_TIMEOUT_SEC` (180 s) — the Render path's
   own constants. Success is the header and at
   least one `username<TAB>password` line beneath
   it. Should the child exit first, exit 1 with the
   `message` of its last JSON log line — for
   example, `Postgres server_encoding must be UTF8`.
   The failure surfaces with its story.

   Yes, my friends, this is polling. We are humble
   enough to know that a child process's stderr
   file does not ring a bell; the Render path polls
   its logs for the same reason. Should they require
   us to poll, poll we must.

5. **Tear down and report.** Send the child
   `SIGTERM`; `boot()` installs a graceful close.
   If it still lives after `POLL_SEC`, `SIGKILL`.
   Print the markdown credential table on stdout.
   Exit 0. There is no key to revoke.

Should the reveal not appear within
`REVEAL_TIMEOUT_SEC`: terminate the child, exit 1,
and never wipe a second time on a timeout.

## One Voice

What the two paths share, they share by name:

- `WIPE_START` — one program string, posted as a
  Render job's `startCommand` or run under
  `bash -c`.
- `print_credential_table` — takes text lines (the
  header, then `username<TAB>password` rows) and
  prints the markdown table. Today it parses
  Render's logs JSON directly. After this change the
  Render path flattens `logs[].message` into lines
  first, and the local path hands it `$TMP/seed.err`
  untouched. Its exit codes stand: 10 when the
  header is absent, 11 when the header is present
  and no row follows.
- `REVEAL_HEADER`, `REVEAL_TIMEOUT_SEC`, `POLL_SEC`.

## Failure, Handled With Grace

Degrade visibly rather than corrupt silently.

| Condition | Exit | Output |
| --- | --- | --- |
| `--help` / `-h` | 0 | usage; no network |
| any usage error | 1 | message + usage on stderr |
| `local` env missing or non-loopback | 1 | variable name only |
| `local` drop fails | 1 | Node's error text |
| `local` build fails | 1 | `./build`'s own error |
| `local` child exits before reveal | 1 | last JSON `message` |
| reveal absent after 180 s | 1 | timeout; child killed; no second wipe |
| any Render failure | 1 | as the 2026-08-19 spec names it |
| Render key revoke fails | 0 | warning only |

`set -euo pipefail` throughout. Everything the
script writes, the build included, lives under one
`mktemp -d` directory released on `EXIT`; the seed
child is killed on `EXIT` as well. The faithful are
accountable for every handle they open.

## The Office of the Commit, Observed

Every commit passes `./validate` by itself. Each is
one concern, a single line, present tense.

1. `Rename wipe-render-postgres to wipe-postgres` —
   `git mv` and the places that name the file:
   `validate`'s awk list, `ROOT_FILES` in
   `tests/fusion-angle-live-name.test.ts`, both
   CLAUDE.md mentions, and the script's own usage
   line. No behaviour change.
2. `Parse the reveal from text lines` — the
   `print_credential_table` refactor; the Render
   path flattens its logs to lines before the call.
   No behaviour change.
3. `Require --postgres render in wipe-postgres` —
   the flag, its validation, the positional rules.
   This commit accepts `render` alone, and its
   usage text confesses exactly that.
4. `Add --postgres local to wipe-postgres` — the
   local ceremony, the loopback guard, and the new
   CLAUDE.md command lines.

## Measure or Be Silent

- `./validate` after every commit: the line-length
  list, the `ROOT_FILES` pin, tsc, the suite.
- An offline argument matrix: `--help`; no
  `--postgres`; `--postgres` with no value;
  `--postgres foo`; `--postgres local TOKEN`;
  `--postgres render` without `TOKEN`; neither and
  both seed flags; `--postgres local` with
  `POSTGRES_URL` unset; `--postgres local` with a
  non-loopback host.
- A live run against the Docker Postgres:
  `--postgres local --mockdata`, then
  `--postgres local --pristine`. After each,
  `schema_marker` holds its row and `./serve`
  listens. This needs `POSTGRES_URL` and
  `JWT_HMAC_SIGNING_KEY` in the session.
- The Render path cannot be exercised from the
  sandbox; `api.render.com` is beyond its gates. It
  is verified by reading the diff and by the offline
  matrix, and the final report will say exactly
  that. We do not declare; we witness.

## Documentation and Lint

- CLAUDE.md gains two command-list lines, one per
  target, and `wipe-postgres` replaces
  `wipe-render-postgres` in the `./validate`
  paragraph.
- `./validate`'s awk list names `wipe-postgres`.
- No new test file.

## Later, Not Now

- Casting the script out once the product is no
  longer a disposable demo.
- A Docker liveness check, should the repository
  ever adopt a container convention.

*So let it compile. So let it deploy. So let it run
smoothly. So you can rest.*

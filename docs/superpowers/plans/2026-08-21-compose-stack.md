# Compose Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development **with the
> wave DAG below** (not strictly serial). Steps use
> checkbox (`- [ ]`) syntax for tracking. Every
> dispatched subagent prompt MUST begin with
> `Go to Medium Church!` (CLAUDE.md scroll policy).
> Do not use git worktrees. Wrap lines at 78
> characters. 4-space indent. Present-tense
> imperative commits with
> `Co-Authored-By: Grok 4.6 <grok@x.ai>`.
> **No new test file.** Root scripts have no bash
> harness; the seed and wipe specs set that
> precedent. `./validate` after every commit.
> Commits 1–3 add files the gates do not yet
> name; they must already be under 78 columns
> and free of `Fusion AI` / `fusion-ai`.

**Goal:** Run the Render deployable on the
workstation under Docker Compose: Node 24,
Postgres 18, Render's environment contract,
seeded by a one-off job.

**Architecture:** Multi-stage Dockerfile. The
`builder` stage is Render's build step
(`npm ci` then `./build --no-zip render-out/`)
inside `node:24`. The `runtime` stage is
Render's start line plus `exec`, on
`node:24-slim`. Compose orchestrates
`postgres`, `server`, and a profiled `seed`.
`./postgres-seed` gains `--postgres compose`,
which `exec`s `docker compose run --rm seed`.
tmpfs at `/var/lib/postgresql`; loopback-only
ports; secrets from the shell via `${VAR:?}`.

**Tech Stack:** Docker 29, Compose v5,
`postgres:18`, `node:24` / `node:24-slim`,
bash (`set -euo pipefail`). No new TypeScript.
No `.env`. No `.node-version`.

**Spec:**
`docs/superpowers/specs/2026-08-21-compose-stack-design.md`
(SHA `e300e99e`, already committed as
`Add compose stack spec`). Do not edit it.

---

## Dependency analysis

The spec's Office of the Commit is already a
partial order. The analysis below is what that
order *depends on*, so parallel work does not
fight the same files or skip a read of a file
that does not yet exist.

### Nodes (remaining work)

Spec commit 1 (`Add compose stack spec`) is
done. Remaining:

| Task | Spec commit | Kind |
| --- | --- | --- |
| 1 | 2 | create `.dockerignore` |
| 2 | 3 | create `Dockerfile` |
| 3 | 4 | create `compose.yaml` |
| 4 | 5 | edit `postgres-seed` |
| 5 | 6 | gates (see file map) |
| 6 | 7 | docs (see file map) |
| 7 | — | live matrix, no commit |

### Edges (why, not just that)

- **T1, T2, T3, T4 share no files.** Authorship
  is independent. Stage names (`builder`,
  `runtime`), the `seed` service, and the
  `-f "$ROOT/compose.yaml"` path are named in
  the spec; do not wait to read a sibling's
  working copy.
- **T5 reads T1+T2+T3.** `ROOT_FILES` uses
  `readFileSync`; the awk list opens the three
  files. If they are absent the gate crashes,
  not fails cleanly. T5 does *not* read T4.
- **T6 writes `CLAUDE.md` after T5.** Same
  file. T6 also documents T4's new target, so
  T4 must have landed (the command must exist
  on HEAD when the docs describe it).
- **T7 needs a clean tree of T1–T6.** The
  in-image `./build` runs `git status
  --porcelain`. Uncommitted siblings fail the
  build. Docker socket required.

There is no authorship edge T1→T2. `.dockerignore`
affects `COPY . .` at *build* time, which is
T7, not T2's write.

There is no edge onto `./build`, `./serve`,
`postgres-lib`, `./postgres-wipe`,
`./test-postgres`, `./measure`, or any
`api/` / `server/` / `shared/` / `web-app/`
module. The spec forbids those edits.

### DAG

```
T1 .dockerignore ──┐
T2 Dockerfile     ─┼─► T5 gates ─► T6 docs ─► T7 verify
T3 compose.yaml   ─┘         ▲
T4 postgres-seed ────────────┘
```

```
Wave 0 (parallel):  T1 dockerignore  T2 Dockerfile
                    T3 compose.yaml  T4 seed-compose
Wave 1 (after T1+T2+T3): T5 gates
Wave 2 (after T4+T5):    T6 docs
Wave 3 (orchestrator):   T7 live matrix (no commit)
```

T5 may start as soon as T1–T3 are committed,
even if T4 is still in review. T6 waits for
both T4 and T5. If T4 finishes before T5,
hold T6 for Wave 2.

Commit in **spec order** (T1 before T2 before
T3 before T4 before T5 before T6), each with
`./validate`, even when a later task finished
authoring first.

### Why this is the efficient cut

Serial is seven steps. The real constraints
are three files that must exist before they
are named, one `CLAUDE.md` writer at a time,
and a clean-tree Docker build at the end.
Everything else is width. Wave 0 is four
disjoint writes; that is the only fan-out
the file map permits.

### Models

| Task | Role | Why |
| --- | --- | --- |
| 1 | fast | five-line ignore file |
| 2 | fast | Dockerfile verbatim from spec |
| 3 | standard | compose.yaml; health, tmpfs, `:?` |
| 4 | standard | bash reorder; TOKEN; usage |
| 5 | fast | three list additions |
| 6 | standard | CLAUDE.md 78-col prose |
| 7 | orchestrator | Docker + Chrome; no subagent |

### Same-tree rule

Work on this checkout. No worktree. No
branch. Do not tell a subagent to read this
plan file — paste the full task text into
the prompt.

Parallel implementers MUST have disjoint
file sets (table above). They MUST NOT
`git commit`. The orchestrator `git add`s
each task's files and commits in spec order
after both reviews pass.

Serial tasks (Wave 1, Wave 2) MAY commit
themselves after `./validate`.

**Per implementer in a wave:**

1. Dispatch `general-purpose` implementers
   for every ready task in the wave, in
   parallel. Prompt starts with
   `Go to Medium Church!`.
2. On all `DONE`, dispatch spec reviewers
   (read-only) in parallel, one per task.
3. On spec ✅, dispatch code-quality
   reviewers in parallel.
4. Fix loops: re-dispatch that task's
   implementer; re-review until both ✅.
5. Orchestrator commits finished tasks in
   spec order, each with `./validate`. Then
   open the next wave.

**Spec review before quality review**, per
task.

Do not run `docker compose build` in Wave 0.
Sibling uncommitted files dirty the tree and
the in-image `./build` will refuse. Docker
is T7.

### Every implementer prompt also carries

- Voice: 78-char max, 4-space indent,
  present-tense imperative commit,
  `Co-Authored-By: Grok 4.6 <grok@x.ai>`.
- Commandments: Reliability, Uniformity,
  Clarity, Idempotency (`down` is the wipe),
  Simplicity.
- Abominations: Unbidden Helper Code (no
  new tests, no wipe compose target, no
  `.env`, no `.node-version`, no health
  route, no `curl` in the runtime image),
  Default Values (no secret defaults, no
  seed-mode default, no `restart:`),
  Swallowed Failures, Magical Values.
- Secrets: never log, echo, or write
  `POSTGRES_PASSWORD`, `POSTGRES_URL`, or
  `JWT_HMAC_SIGNING_KEY`. Compose's
  `${VAR:?}` is the gate.
- Patterns: bash voice of `postgres-seed`
  (`command -v X`, `exec`); YAML 4-space
  indent as in the spec; CLAUDE.md wrap at
  78.
- Work on this checkout. No worktree. No
  branch.
- Exclusive files only. Do not "fix" a
  neighbour file. Do not commit in a
  parallel wave.

---

## Do not touch

- The spec
  (`docs/superpowers/specs/2026-08-21-compose-stack-design.md`)
- `./build`, `./serve`, `./postgres-wipe`,
  `postgres-lib`, `./measure`,
  `./test-postgres`
- Any file under `api/`, `server/`,
  `shared/`, `web-app/`
- `.node-version`, `package.json`
  `engines`, Render config
- `ARCHITECTURE.md`, `README.md`,
  `TEST-PLAN.md`
- Cold-start `postgres:17` (follow-up)
- `postgres-wipe`'s DROP list (follow-up)
- `tests/measure-cli.test.ts`

---

## File map

### Create

- `.dockerignore` (T1)
- `Dockerfile` (T2)
- `compose.yaml` (T3)

### Modify by task (exclusive sets)

- T1: `.dockerignore`
- T2: `Dockerfile`
- T3: `compose.yaml`
- T4: `postgres-seed`
- T5: `validate`;
  `tests/fusion-angle-live-name.test.ts`;
  `CLAUDE.md` Validate-semantics list only
- T6: `CLAUDE.md` Commands + new
  `### Compose stack` after Cold start.
  Do not touch T5's Validate sentence.
- T7: none

---

## Pins (all tasks)

**Ignore file (byte-identical, trailing
newlines as shown):**

```
.DS_Store
node_modules/
.claude/
.superpowers/
```

Exactly the gitignored paths minus `docs/`.
Do not add `docs/`. Do not add `render-out/`.
The builder runs `./build`, whose clean-tree
check needs `.git` and every tracked file.

**Dockerfile stages:** `builder` (full
`node:24`), `runtime` (`node:24-slim`).
`USER node` only on runtime. `CMD` uses
`exec` so `SIGTERM` reaches `boot.ts`.

**Compose service names:** `postgres`,
`server`, `seed`. Profile on `seed`: `seed`.
Postgres image: `postgres:18`. tmpfs:
`/var/lib/postgresql`. Ports: `127.0.0.1:5432:5432`
and `127.0.0.1:8080:8080`.
`stop_grace_period: 15s` on `server` only.
No `restart:` on any service.

**Secrets.** `${POSTGRES_PASSWORD:?required}`
and `${JWT_HMAC_SIGNING_KEY:?required}`.
Compose interpolates the *whole* file, so
both must be in the shell for any
`docker compose` command, including `run
seed`. Hex from `openssl rand` is URL-safe.

**Seed target switch:**
`render|local|compose`. `compose` takes no
TOKEN (unexpected argument, as for
`local`). Ordering inside `postgres-seed`:
parse → validate flags → `compose` branch
(docker check, `exec`) → `node` check →
`local` branch → `curl` check → `render`
branch. Host `node` is not required for
`compose`.

**`exec` line (T4):**

```
exec docker compose -f "$ROOT/compose.yaml" \
    run --rm seed "$MODE"
```

`-f` makes the file's directory the project
directory, so `.` is the repository root
from any cwd. `$MODE` is already
`--bootstrap` / `--mock-data` /
`--test-plan-slices`.

**Commit subjects (exact):**

1. `Add .dockerignore`
2. `Add the server Dockerfile`
3. `Add the compose stack`
4. `Add --postgres compose to postgres-seed`
5. `Gate the container files`
6. `Document the compose stack`

**Trailer:**

```
Co-Authored-By: Grok 4.6 <grok@x.ai>
```

**78-column check** (T1–T3, before the
files join the awk list):

```bash
awk 'length > 78 {
    printf "%s:%d: %d chars\n", FILENAME, FNR, length
}' FILE
```

Expected: empty. Also:

```bash
grep -nE 'Fusion AI|fusion-ai' FILE
```

Expected: no matches.

---

### Task 1: Add .dockerignore

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Write the file**

```
.DS_Store
node_modules/
.claude/
.superpowers/
```

Four lines, each a gitignored path, `docs/`
omitted on purpose. Trailing newline at EOF.

- [ ] **Step 2: 78-column and live-name
  check**

```bash
awk 'length > 78 {
    printf "%s:%d: %d chars\n", FILENAME, FNR, length
}' .dockerignore
grep -nE 'Fusion AI|fusion-ai' .dockerignore || true
```

Expected: no awk output; no grep hits.

- [ ] **Step 3: `./validate`**

Expected: PASS. This file is not in the awk
list yet.

- [ ] **Step 4: Commit** (orchestrator;
  Wave 0)

```bash
git add .dockerignore
git commit -m "$(cat <<'EOF'
Add .dockerignore

Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

---

### Task 2: Add the server Dockerfile

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Write the file**
  (verbatim, including the `CMD`
  continuation)

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

Do not add `HEALTHCHECK`, `EXPOSE`,
`curl`, or a non-root user on `builder`.
`COPY . .` must follow `npm ci` so the
lockfile layer stays cacheable. `exec` is
the one named divergence from Render's
start line; do not drop it.

- [ ] **Step 2: 78-column and live-name
  check**

```bash
awk 'length > 78 {
    printf "%s:%d: %d chars\n", FILENAME, FNR, length
}' Dockerfile
grep -nE 'Fusion AI|fusion-ai' Dockerfile || true
```

Expected: no awk output; no grep hits. The
`CMD` continuation exists so the second
line stays under 78.

- [ ] **Step 3: `./validate`**

Expected: PASS. This file is not in the awk
list yet.

- [ ] **Step 4: Commit** (orchestrator;
  Wave 0)

```bash
git add Dockerfile
git commit -m "$(cat <<'EOF'
Add the server Dockerfile

Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

---

### Task 3: Add the compose stack

**Files:**
- Create: `compose.yaml`

- [ ] **Step 1: Write the file**
  (verbatim, 4-space indent)

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

Do not add `restart:`, a volume, a
`healthcheck` `start_period` on postgres
(that is a later remedy, not the first
cut), `TRUSTED_PROXY_HOPS`, or a `seed`
`JWT_HMAC_SIGNING_KEY`. The folded scalar
joins with spaces and is one valid
expression. `pg_isready` must use
`-h 127.0.0.1`, not the unix socket.

- [ ] **Step 2: 78-column and live-name
  check**

```bash
awk 'length > 78 {
    printf "%s:%d: %d chars\n", FILENAME, FNR, length
}' compose.yaml
grep -nE 'Fusion AI|fusion-ai' compose.yaml || true
```

Expected: no awk output; no grep hits.

- [ ] **Step 3: `./validate`**

Expected: PASS. This file is not in the awk
list yet.

- [ ] **Step 4: Commit** (orchestrator;
  Wave 0)

```bash
git add compose.yaml
git commit -m "$(cat <<'EOF'
Add the compose stack

Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

---

### Task 4: Add --postgres compose to
postgres-seed

**Files:**
- Modify: `postgres-seed`

Do not run `docker compose` in this task.
Flag parsing is the covenant you can prove
without the socket. The `exec` path is T7.

- [ ] **Step 1: Replace `usage()`**

The current here-doc (lines 8–32) becomes:

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

Keep the `cat <<'USAGE'` / `USAGE` wrappers.
The compose sentence uses an em dash
(U+2014), same as the reveal header.

- [ ] **Step 2: Accept `compose` as a
  target; reject its TOKEN**

The target `case` currently:

```
    render|local)
        ;;
    *)
        echo "Error: --postgres must be render" \
            "or local" >&2
```

Replace with:

```
    render|local|compose)
        ;;
    *)
        echo "Error: --postgres must be render," \
            "local, or compose" >&2
        usage >&2
        exit 1
        ;;
```

The `local` TOKEN guard currently:

```
if [ "$POSTGRES_TARGET" = "local" ] \
    && [ -n "$TOKEN" ]; then
    echo "Error: unexpected argument" >&2
    usage >&2
    exit 1
fi
```

Replace with:

```
if [ "$POSTGRES_TARGET" = "local" \
    -o "$POSTGRES_TARGET" = "compose" ] \
    && [ -n "$TOKEN" ]; then
    echo "Error: unexpected argument" >&2
    usage >&2
    exit 1
fi
```

Leave the `render` TOKEN-required block
unchanged.

- [ ] **Step 3: `compose` branch before
  the `node` check**

After `MODE` is assigned and *before*
`command -v node`, insert:

```
if [ "$POSTGRES_TARGET" = "compose" ]; then
    if ! command -v docker >/dev/null; then
        echo "Error: docker is required" >&2
        exit 1
    fi
    ROOT="$(cd "$(dirname "$0")" && pwd)"
    exec docker compose -f "$ROOT/compose.yaml" \
        run --rm seed "$MODE"
fi
```

The `node` check, `local` branch, `curl`
check, and `render` branch stay as they
are, in that order, after this block.

Do not validate `POSTGRES_PASSWORD` in the
script. Do not `assert_loopback_postgres_url`
on compose. Do not require host `node` on
this path.

- [ ] **Step 4: Prove the parser without
  Docker**

```bash
./postgres-seed --help
```

Expected: exit 0; stdout contains
`--postgres compose` and
`render|local|compose`.

```bash
./postgres-seed --postgres compose; echo EXIT:$?
```

Expected: stderr `exactly one of --bootstrap`;
exit 1; no `docker` invocation (mode check
is first).

```bash
./postgres-seed --postgres compose TOKEN \
    --mock-data; echo EXIT:$?
```

Expected: stderr `unexpected argument`;
exit 1.

```bash
./postgres-seed --postgres bogus --mock-data; \
    echo EXIT:$?
```

Expected: stderr `render, local, or compose`;
exit 1.

- [ ] **Step 5: `./validate`**

Expected: PASS. `postgres-seed` is already
in the awk list; every new line must be
≤ 78.

- [ ] **Step 6: Commit** (orchestrator;
  Wave 0)

```bash
git add postgres-seed
git commit -m "$(cat <<'EOF'
Add --postgres compose to postgres-seed

Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

---

### Task 5: Gate the container files

**Files:**
- Modify: `validate` (awk list)
- Modify: `tests/fusion-angle-live-name.test.ts`
  (`ROOT_FILES`)
- Modify: `CLAUDE.md` (Validate-semantics
  root-script list only)

T1–T3 must already be on disk. Do not edit
the Commands block or add `### Compose
stack` — that is T6.

- [ ] **Step 1: Add the three names to
  `validate`**

Current awk invocation:

```
    awk "$AWK_LINT" build serve test test-postgres \
        validate generate-schema-svg \
        generate-api-documentation measure \
        postgres-wipe postgres-lib postgres-seed
```

Replace with:

```
    awk "$AWK_LINT" build serve test test-postgres \
        validate generate-schema-svg \
        generate-api-documentation measure \
        postgres-wipe postgres-lib postgres-seed \
        Dockerfile compose.yaml .dockerignore
```

Do not add `test-postgres` to CLAUDE.md
here (it is already in the awk list and
absent from the prose; that is a different
concern).

- [ ] **Step 2: Add the three names to
  `ROOT_FILES`**

In `tests/fusion-angle-live-name.test.ts`,
after `'postgres-seed',` insert:

```
    'Dockerfile',
    'compose.yaml',
    '.dockerignore',
```

Keep `'generate-schema-svg',` where it is.
Do not add `test-postgres`.

- [ ] **Step 3: Name them in CLAUDE.md
  Validate semantics**

The sentence that currently ends:

```
`postgres-lib`, `postgres-seed`, and
`postgres-wipe`. It then rejects the `org`
```

becomes:

```
`postgres-lib`, `postgres-seed`,
`postgres-wipe`, `Dockerfile`, `compose.yaml`,
and `.dockerignore`. It then rejects the `org`
```

Only that list. Do not retouch Commands.

- [ ] **Step 4: `./validate`**

Expected: PASS. This is the first commit
that lints the three new files and scans
them for the retired product name. If it
fails on line length, the fix is in T1–T3's
files, not a gate exemption.

- [ ] **Step 5: Commit** (serial; MAY be
  the implementer)

```bash
git add validate \
    tests/fusion-angle-live-name.test.ts \
    CLAUDE.md
git commit -m "$(cat <<'EOF'
Gate the container files

Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

---

### Task 6: Document the compose stack

**Files:**
- Modify: `CLAUDE.md` (Commands + new
  subsection). Do not touch the Validate
  sentence T5 wrote.

- [ ] **Step 1: Commands, beside seed
  and wipe**

In `### Commands`, after the two
`./postgres-seed` lines and the two
`./postgres-wipe` lines, insert:

```
./postgres-seed --postgres compose \
    --bootstrap|--mock-data|--test-plan-slices
docker compose build       # image of the committed tree
docker compose up --wait   # postgres:18 + server, 127.0.0.1:8080
docker compose down        # stop; the database dies with it
```

Keep the fence as bash. Every line ≤ 78.

- [ ] **Step 2: Add `### Compose stack`
  after `### Cold start`**

Insert the subsection between the end of
`### Cold start` (the `ssh -L` paragraph)
and `### Validate semantics`. Full text:

````
### Compose stack

Local, short-lived proof of the deployable:
the `./build` bundle under Node 24,
Postgres 18, and Render's environment
contract. Also an origin for TEST-PLAN
agents and `./measure --base-url`, and a
Postgres for `./test-postgres`.

Required in the shell (hex is URL-safe):

```bash
export POSTGRES_PASSWORD=$(openssl rand -hex 16)
export JWT_HMAC_SIGNING_KEY=$(openssl rand -hex 32)
```

```bash
docker compose build
./postgres-seed --postgres compose --mock-data
docker compose up --wait
# open http://localhost:8080/landing/index.html
docker compose down
```

`PORT` is `"8080"` in the server service;
the start line sets `HTTP_SERVER_PORT=$PORT`
and `exec`s Node so `SIGTERM` reaches
`boot.ts`. `TRUSTED_PROXY_HOPS` is unset:
no proxy sits in front.

Host `POSTGRES_URL` for `./test-postgres`:

`postgres://fusion:$POSTGRES_PASSWORD@localhost:5432/fusion`

Smoke `./measure` against the stack; never
`--record` (history is the host spawn path):

```bash
./measure --base-url http://127.0.0.1:8080 \
    --password "$PW" --runs 1 --pages organization
```

Restarting `postgres` empties the database
(tmpfs). Ports 8080 and 5432 conflict with
`./serve` and the cold-start
`fusion-postgres` container.

The Docker socket is outside the Claude
sandbox. Run these commands with the `!`
prefix, or from a terminal that can reach
`/var/run/docker.sock`.
````

Do not change ARCHITECTURE.md, README.md,
or TEST-PLAN.md. Do not rewrite Cold start's
`postgres:17` (follow-up).

- [ ] **Step 3: `./validate`**

Expected: PASS. CLAUDE.md is in the 78-col
markdown pass.

- [ ] **Step 4: Commit** (serial; MAY be
  the implementer)

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
Document the compose stack

Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

---

### Task 7: Live matrix (orchestrator)

No commit. No subagent. Needs
`/var/run/docker.sock` (user terminal, or
`!` prefix). Working tree must be clean.
Stop `./serve` and `fusion-postgres` first
if they hold 8080 or 5432.

Export once (hex is URL-safe):

```bash
export POSTGRES_PASSWORD=$(openssl rand -hex 16)
export JWT_HMAC_SIGNING_KEY=$(openssl rand -hex 32)
```

Do not print the values into the session
log if you can avoid it. The seed reveal
prints demo sign-ins on stdout; that is
the intended secret surface.

- [ ] **Step 1: In-image git check**

```bash
docker compose build
```

Expected: `builder` and `runtime` both
build. Then:

```bash
touch x && docker compose build; echo EXIT:$?
rm x
```

Expected: non-zero; stderr contains
`working directory is not clean`.

- [ ] **Step 2: Secrets gate + seed**

```bash
env -u POSTGRES_PASSWORD docker compose config
```

Expected: `required variable POSTGRES_PASSWORD
is missing a value: required` (or Compose's
equivalent `:?` wording). Then:

```bash
./postgres-seed --postgres compose --mock-data
```

Expected: reveal header and credentials on
stdout; `seeded` on stderr; exit 0. This is
the first proof that `run` waits for
`postgres` healthy and that tmpfs initdb
on 18 works.

- [ ] **Step 3: Up, curl, sign-in**

```bash
docker compose up --wait -d
curl -sI http://127.0.0.1:8080/
```

Expected: `up --wait` exit 0; curl `HTTP/1.1
200`. Chrome MCP: open
`http://localhost:8080/landing/index.html`,
sign in with the revealed credentials, confirm
the dashboard renders.

- [ ] **Step 4: Drain via `exec`**

```bash
docker compose stop server
docker compose ps -a
```

Expected: server `Exited (0)`, never 137.

- [ ] **Step 5: `./test-postgres` against
  the stack**

```bash
POSTGRES_URL=postgres://fusion:$POSTGRES_PASSWORD@localhost:5432/fusion \
    ./test-postgres
```

Expected: green.

- [ ] **Step 6: Smoke measure (discard)**

Use the password from the seed reveal,
not `JWT_HMAC_SIGNING_KEY`.

```bash
./measure --base-url http://127.0.0.1:8080 \
    --password "$PW" --runs 1 --pages organization
```

Expected: completes. Do not `--record`.

- [ ] **Step 7: Down is the wipe; unseeded
  up refuses**

```bash
docker compose down
docker volume ls
docker compose up --wait; echo EXIT:$?
docker compose down
```

Expected: `volume ls` shows nothing new
from this stack; unseeded `up --wait`
non-zero; server logs
`schema_marker absent; seed with ./postgres-seed`.

Tear down whatever remains. Do not commit.

---

## Self-review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| `.dockerignore` | T1 |
| `Dockerfile` | T2 |
| `compose.yaml` | T3 |
| `./postgres-seed --postgres compose` | T4 |
| Gates (`validate`, `ROOT_FILES`, CLAUDE.md list) | T5 |
| CLAUDE.md Commands + `### Compose stack` | T6 |
| Verification 1–7 | T7 |
| Office of the Commit 2–7 | T1–T6 subjects |
| Non-goals / Later, not now | Do not touch |

**Placeholder scan:** none. File bodies are
the spec's bytes. Parser checks in T4 are
concrete commands with expected stderr.

**Type consistency:** stage names `builder`
/ `runtime`; services `postgres` / `server`
/ `seed`; target `compose`; `$MODE` values
`--bootstrap` / `--mock-data` /
`--test-plan-slices`; secrets
`POSTGRES_PASSWORD` and
`JWT_HMAC_SIGNING_KEY`. T4's `exec` line
matches T3's `seed` service and T6's
invocation.

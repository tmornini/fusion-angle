# Docker Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this spec's worktree (AGENTS.md
> § Worktrees). The plan is a dependency graph: dispatch
> by the graph, not by the numbering. One committing
> subagent at a time (the skill forbids parallel
> implementers). Spec commit order is a valid
> topological sort.

**Goal:** One image and `CMD` for the local walk origin
and for Render; one operator command `./deploy`; one
test entry `./test`; wipe is a public-schema reset;
Render talks through the `render` CLI only.

**Architecture:** Nine execution commits after this
plan. First retarget the later-home lint master's
`cfafb32e` left red. Then rename scripts into `bin/`
with no behavior change. Then the dispatcher, the
`PORT` rename, the wipe SQL, the guns, `./deploy`,
docs, and the three Later-work bullets. Host
`bin/serve` stays ZIP inventory. The walk origin is
compose `server`.

**Tech Stack:** Bash, Deno 2.9.6, Docker Compose,
`render` CLI v2.26.0, Deno.test + `@std/assert`.

**Spec:**
`docs/superpowers/specs/2026-09-04-docker-deploy-design.md`

## Global Constraints

- **Worktree.** Commits land in
  `.worktrees/docker-deploy` on branch `docker-deploy`.
  Floor after rebase: `cfafb32e` (`Add Critical
  functionality path`) plus the three spec commits.
  Never commit on `master`.
- **Floor lint is red.** `cfafb32e` renamed
  `## Critical path` to `## Critical product path` and
  split Later work into `## Critical functionality
  path` plus a new `## Later work`. `validate` still
  greps `^## Critical path` (count must be 1). Count
  is 0. Task 1 retargets that grep. Do not revert the
  headings.
- **Rename then behavior.** Never move/rename and
  change behavior in the same commit. Path-string
  updates that keep a moved script running (ROOT,
  Dockerfile, lint lists, `--allow-run`, spawn paths)
  belong to the rename commit. They are the rename.
- **Relocatable ROOT.** Every script in `bin/` that
  today assumes it lives at repo root uses:

```bash
BIN="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$BIN/.." && pwd)"
```

  Sibling sources stay `$BIN/…`. Repo-relative paths
  (`server/…`, `web-app/…`, `tests/…`, `deno.json`,
  `compose.yaml`) stay `$ROOT/…`. Scripts that bundle
  or test `cd "$ROOT"` first. `postgres-lib` stays a
  sibling of the guns.
- **`:?required` stays.** Bare `docker compose build`
  is not an operator path. `./deploy` mints first.
  `./test postgres` mints too, because compose parses
  the whole file, including `JWT_HMAC_SIGNING_KEY`.
- **Memory `./test` has no Docker.** Full
  `./deploy --local` is not a test. Render paths are
  source-pinned; tests never hold a TOKEN and never
  call `api.render.com`.
- **Subagents never run `./deploy --render`.**
- **`HTTP_SERVER_PORT` dies in Task 4.** postgres.js
  still reads `PGPORT`, not `PORT`.
- **Commit discipline.** One concern; subject a
  single present-tense imperative line of ≈50 chars;
  trailer `Co-Authored-By: Grok 4.6 <noreply@x.ai>`;
  never move and change behavior together; rebase,
  then fast-forward. Never force-push.
- **Voice.** 78-char max in files `./test lint` still
  lints, 4-space indent. Markdown prose matches its
  neighbors. `TODO.md` Later-work bullets wrap like
  the `exists()` bullet (≈66).
- **TDD.** Behavior tasks write the failing test
  first, watch it fail, then implement. Rename and
  heading-grep tasks fail the existing pin or lint
  first.
- **Out of scope.** `render.yaml`, `GET /status`,
  `TRUSTED_PROXY_HOPS`, tightening `ipAllowList`, a
  dependency-warm layer, diagnosing the old Node 500.
  Task 9 names the first, fourth, and fifth as Later
  work. Do not add the Node 500.

## Dispatch Protocol

`AGENTS.md § Subagents` binds every dispatch.

1. Every subagent prompt MUST begin with
   `Go to Medium Church!`
2. Then push down:
   - **Voice.** 78-char lines, 4-space indent,
     present-tense imperative subjects, the trailer
     above.
   - **Commandments touched.** I Reliability (Layer 1
     green after Task 1), II Security (TOKEN on argv,
     never logged, never in `.env`), III Uniformity
     (`PORT` is the one listen name; `--postgres` on
     `./deploy` is the seed mode, on the guns is the
     place), V Clarity, VII Idempotency (`./deploy
     --commit` places; reseed is a separate
     invocation), VIII Simplicity (one dispatcher, no
     Deno CLI for glue).
   - **Abominations risked.** Unbidden Helper Code —
     no extra root commands, no `FA_URL`, no
     `validate-ok`. Foreign Tongues — no `http_json`
     on the Render path. Swallowed Failures — a
     missing `render` verb STOPs and names it; no
     curl fallback. Premature Optimization — no
     dependency-warm layer. Default Values — no
     `${VAR:-}` for required secrets. Magical Values
     — timeouts stay `WIPE_TIMEOUT_SEC`,
     `REVEAL_TIMEOUT_SEC`, `POLL_SEC`.
   - **Patterns.** `RequestContext` is not in this
     work. Guns source `bin/postgres-lib`. JSON
     projections are inline `deno run --frozen` on
     stdin, never `jq`. Errors are `Error: …` on
     stderr, exit 1. Tests that spawn scripts use
     `Deno.Command` with a docker stub on PATH and
     blank `POSTGRES_URL` / `JWT_HMAC_SIGNING_KEY`.
3. Subagents work in this worktree. Never pass
   `isolation: "worktree"`.
4. **Who commits.** The implementer commits. Reviewers
   do not. One committing subagent at a time.
5. **Models.** Mechanical (Task 1, Task 9): cheaper
   tier. Integration (Tasks 2–8): standard. Reviews
   and the final whole-branch review: most capable
   available.
6. **Parallelism.** The graph names what is unblocked.
   Do not dispatch two implementers at once. Tasks 8
   and 9 are file-disjoint (`AGENTS.md`/`TEST-PLAN.md`/
   `ARCHITECTURE.md`/`README.md`/`SCHEMA.md` vs
   `TODO.md`) and may share one dispatch with two
   commits, like the runtime-switch plan's T8+T9.
7. **Sandbox.** `export DENO_DIR="$TMPDIR/deno-dir"`
   before `deno` / `./test`. `TMPDIR=/tmp/claude` if
   `/tmp` is not writable. Chrome and
   `./test browser` stay with the operator when the
   sandbox cannot bind Chrome's socket.

## Dependency Graph

```dot
digraph docker_deploy {
    rankdir=LR;
    T1 [label="T1 later-home lint"];
    T2 [label="T2 rename into bin/"];
    T3 [label="T3 ./test dispatcher"];
    T4 [label="T4 PORT"];
    T5 [label="T5 wipe SQL + wipe service"];
    T6 [label="T6 guns CLI"];
    T7 [label="T7 ./deploy"];
    T8 [label="T8 docs"];
    T9 [label="T9 TODO Later work"];
    T1 -> T2;
    T2 -> T3;
    T2 -> T4;
    T2 -> T5;
    T4 -> T5;
    T5 -> T6;
    T3 -> T7;
    T4 -> T7;
    T6 -> T7;
    T7 -> T8;
    T7 -> T9;
}
```

Serial execution order (spec commit sequence plus the
floor repair): T1, T2, T3, T4, T5, T6, T7, T8, T9.
T3 and T4 are file-disjoint after T2; SDD still
serializes them. T4 before T5 because both edit
`compose.yaml`. T8 and T9 may batch.

| Wave | Task | Unblocks |
|---|---|---|
| 1 | T1 later-home lint | T2 |
| 2 | T2 rename into `bin/` | T3, T4, T5 |
| 3 | T3 `./test` dispatcher | T7 |
| 4 | T4 `PORT` | T5, T7 |
| 5 | T5 wipe SQL + compose `wipe` | T6 |
| 6 | T6 guns | T7 |
| 7 | T7 `./deploy` | T8, T9 |
| 8 | T8 docs, T9 TODO | — |

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `validate` | later-home grep, then deleted | 1, 3 |
| `bin/build`, `bin/build-lib`, `bin/serve`, `bin/measure`, `bin/postgres-seed`, `bin/postgres-wipe`, `bin/postgres-lib`, `bin/generate-schema-svg`, `bin/generate-api-documentation`, `bin/test-browser`, `bin/test-postgres` | moved operator scripts | 2 |
| `test` | dispatcher | 3 |
| `test-all` | deleted | 3 |
| `bin/test-postgres` | owns Docker Postgres | 3 |
| `server/boot.ts`, `server/postgres-gate.ts` | listen env `PORT` | 4 |
| `Dockerfile` | `CMD` with no env copy | 4 |
| `compose.yaml` | `PORT` publish; `wipe` profile | 4, 5 |
| `api/backend-postgres.ts` | `POSTGRES_DROP_SCHEMA` | 5 |
| `bin/postgres-lib` | `render` CLI, not `http_json` | 6 |
| `bin/postgres-seed`, `bin/postgres-wipe` | `local` = compose run; drop `compose` | 6 |
| `deploy` | operator entry | 7 |
| `crank` | deleted | 7 |
| `AGENTS.md`, `TEST-PLAN.md`, `ARCHITECTURE.md`, `README.md`, `SCHEMA.md` | names | 8 |
| `TODO.md` `## Later work` | three bullets | 9 |
| `tests/test-cli.test.ts` | dispatcher pins | 3 |
| `tests/deploy-cli.test.ts` | deploy argv + source pins | 7 |
| `tests/validate-cli.test.ts` | deleted with `./validate` | 3 |
| `tests/crank-cli.test.ts` | deleted with `./crank` | 7 |
| `tests/postgres-gun-cli.test.ts` | gun argv + source pins | 6 |

## Spec Coverage

| Spec section | Task |
|---|---|
| Floor lint after `cfafb32e` | 1 |
| §7 Tree layout, rename first | 2 |
| §6 `./test` dispatcher, SHA skip overlays, delete `./validate` / `./test-all` / `./test-browser` / `./test-postgres` as root commands | 3 |
| §2 `PORT`; §8 Dockerfile `CMD`, compose publish, `bin/measure` | 4 |
| §5 Wipe SQL; compose `wipe` service | 5 |
| §5 Guns: `local` is compose run; `compose` gone; Render is `render` CLI | 6 |
| §1 `./deploy`; §3 local sequence; §4 Render sequence; delete `./crank` | 7 |
| §10 Docs | 8 |
| §10 TODO.md Later-work bullets; Out of scope | 9 |
| Inadvertent Render destruction | 3, 6, 7 tests |
| `render jobs get` is not a CLI verb | 6 (poll via `jobs list`) |

---

### Task 1: Retarget the later-home lint

**Files:**
- Modify: `validate:117-121`

**Depends on:** nothing. **Unblocks:** Task 2.

Master's `cfafb32e` renamed the heading. This commit
changes only the grep that now fails. Do not rename
TODO.md headings back.

- [ ] **Step 1: Confirm the lint is red**

```bash
grep -c '^## Critical path' TODO.md || true
# 0
./validate
```

Expected: exit 1, stderr contains
`TODO.md: '## Critical path' count must be 1`.

- [ ] **Step 2: Retarget the grep**

In `validate`, replace the heading string only:

```bash
if [ "$(grep -c '^## Critical product path' TODO.md)" \
    != "1" ]; then
    LATER_HOME_FAIL="${LATER_HOME_FAIL}\
TODO.md: '## Critical product path' count must be 1
"
fi
```

Do not add a `## Critical functionality path` gate.
`## Later work` still exists in TODO.md; ARCHITECTURE.md
must still have zero of that heading.

- [ ] **Step 3: Confirm Layer 1 is green**

```bash
./validate
```

Expected: exit 0. If SHA skip fires (`already
validated …`), force a full run with the overlay
this script still names (Task 3 renames it):

```bash
VALIDATE_PORCELAIN=x ./validate
```

Expected: full Layer 1, exit 0.

- [ ] **Step 4: Commit**

```bash
git add validate
git commit -m "Retarget the later-home lint heading"
```

---

### Task 2: Rename operator scripts into `bin/`

**Files:**
- Create: `bin/` (directory)
- Move: `build`, `build-lib`, `serve`, `measure`,
  `postgres-seed`, `postgres-wipe`, `postgres-lib`,
  `generate-schema-svg`, `generate-api-documentation`,
  `test-browser`, `test-postgres` → `bin/`
- Modify: `Dockerfile` (`./build` → `./bin/build`)
- Modify: `validate` awk lint list
- Modify: `test` `--allow-run` (`./serve` → `./bin/serve`)
- Modify: `crank` (calls into `bin/`)
- Modify: `test-all` (`./test-browser` → `./bin/test-browser`)
- Modify: `tests/fusion-angle-live-name.test.ts` `ROOT_FILES`
- Modify: `tests/serve-cli.test.ts` spawn path
- Modify: `tests/crank-cli.test.ts` source pins
- Modify: `tests/measure-cli.test.ts` `MEASURE_SEED_COMMAND`
- Modify: `web-app/app/measure-cli.ts` `MEASURE_SEED_COMMAND`
- Modify: every moved script's ROOT (relocatable)

**Depends on:** Task 1. **Unblocks:** Tasks 3, 4, 5.

Behavior is unchanged: `bin/test-postgres` still
requires `POSTGRES_URL`. `bin/postgres-seed --postgres
compose` still exists. `./validate` still exists.

- [ ] **Step 1: Write the failing path pins**

In `tests/fusion-angle-live-name.test.ts`, replace
`ROOT_FILES` with:

```typescript
const ROOT_FILES = [
    'README.md',
    'AGENTS.md',
    'CLAUDE.md',
    'TEST-PLAN.md',
    'ARCHITECTURE.md',
    'DESIGN-SYSTEM.md',
    'SCHEMA.md',
    'API.md',
    'AUDIT.md',
    'bin/build',
    'bin/serve',
    'validate',
    'test',
    'bin/measure',
    'deno.json',
    'bin/postgres-wipe',
    'bin/postgres-lib',
    'bin/postgres-seed',
    'Dockerfile',
    'compose.yaml',
    '.dockerignore',
    'bin/generate-schema-svg',
    'bin/generate-api-documentation',
] as const;
```

In `tests/serve-cli.test.ts`, spawn `./bin/serve`
instead of `./serve`. Usage regex stays
`/Usage: \.\/serve/` until Task 8 (help text may still
say `./serve` until docs; the script's usage is
`./serve` today). After the move, update usage to
`./bin/serve` in the same commit — that is the path.

In `web-app/app/measure-cli.ts`:

```typescript
export const MEASURE_SEED_COMMAND = './bin/postgres-seed';
```

In `tests/measure-cli.test.ts` the pin becomes
`'./bin/postgres-seed'`.

In `tests/crank-cli.test.ts` source pin, the live
commands become `./bin/build --no-zip`,
`./bin/test-postgres`, `./bin/postgres-wipe --postgres
local`, `./bin/postgres-seed --postgres local`,
`./bin/serve `. `./validate` stays.

Run:

```bash
./test
```

Expected: FAIL — `bin/build` missing and/or spawn
`./bin/serve` fails, measure pin fails, crank source
pins fail.

- [ ] **Step 2: `git mv` into `bin/`**

```bash
mkdir -p bin
git mv build bin/build
git mv build-lib bin/build-lib
git mv serve bin/serve
git mv measure bin/measure
git mv postgres-seed bin/postgres-seed
git mv postgres-wipe bin/postgres-wipe
git mv postgres-lib bin/postgres-lib
git mv generate-schema-svg bin/generate-schema-svg
git mv generate-api-documentation \
    bin/generate-api-documentation
git mv test-browser bin/test-browser
git mv test-postgres bin/test-postgres
```

- [ ] **Step 3: Relocatable ROOT in every moved script**

`bin/build` today:

```bash
source "$(dirname "$0")/build-lib"
# …
ROOT="$(cd "$(dirname "$0")" && pwd)"
```

After the move `$ROOT/deno.json` and
`$ROOT/server/main.ts` are wrong. Change to:

```bash
BIN="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$BIN/.." && pwd)"
source "$BIN/build-lib"
# git status, bundle_client, compile: cwd must be ROOT
cd "$ROOT"
# later ROOT uses stay $ROOT/deno.json and
# $ROOT/server/main.ts
```

`bin/build-lib` comment: sourced from repo root after
the caller `cd "$ROOT"`. Relative `web-app/app/…`
paths keep working.

`bin/test-browser` today `cd`s to its own directory.
Change to `cd "$ROOT"` and `source "$BIN/build-lib"`.
The deno test glob `tests/browser/*.test.ts` is
repo-relative.

`bin/test-postgres`: `cd "$ROOT"` then the existing
`deno test` invocation. Still requires `POSTGRES_URL`.

`bin/generate-schema-svg` and
`bin/generate-api-documentation`: `cd "$ROOT"` then
the existing `deno run` (those paths are
repo-relative).

`bin/measure`: `cd "$ROOT"` then `deno run … web-app/app/measure.ts`. Comment `--allow-run` list:
`./bin/build`, `./bin/postgres-seed`.

`bin/postgres-wipe` / `bin/postgres-seed`:

```bash
. "$(dirname "$0")/postgres-lib"
# …
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
```

Local `deno run` still uses `$ROOT/server/postgres-wipe.ts`
(behavior unchanged until Task 6). Compose path uses
`$ROOT/compose.yaml`.

`bin/serve`: no ROOT to the tree; usage line becomes
`Usage: ./bin/serve dir/ port`. Export remains
`HTTP_SERVER_PORT` until Task 4.

- [ ] **Step 4: Callers**

`Dockerfile`:

```
RUN ./bin/build --no-zip render-out/
```

`validate` awk list: replace the root script names
that moved with `bin/…`. Keep `test`, `test-all`,
`validate`, `crank` at root. Keep `deno.json`,
`Dockerfile`, `compose.yaml`, `.dockerignore`.

`validate`'s `./generate-schema-svg --check` and
`./generate-api-documentation --check` become
`./bin/generate-schema-svg --check` and
`./bin/generate-api-documentation --check`.

`test` `--allow-run=`:

```
--allow-run=deno,./bin/serve,./crank,sh,./validate
```

Keep `./crank` and `./validate` until Tasks 3 and 7
delete those tests.

`crank`: `./validate` stays. `./test-postgres` →
`./bin/test-postgres`. `./build --no-zip` →
`./bin/build --no-zip`. `./postgres-wipe` /
`./postgres-seed` / `./serve` → `./bin/…`.

`test-all`: `./bin/test-browser`.

`bin/postgres-wipe` usage still says `./postgres-wipe`
until Task 6/8. Do not rewrite gun help in this
commit except where a path would 127.

- [ ] **Step 5: Run tests**

```bash
./test
VALIDATE_PORCELAIN=x ./validate
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Move operator scripts into bin/"
```

Subject ≈38 chars. The diff is the rename plus the
path updates above. No dispatcher, no `PORT`, no wipe
SQL.

---

### Task 3: `./test` dispatcher

**Files:**
- Modify: `test` (becomes the dispatcher)
- Modify: `bin/test-postgres` (owns Docker Postgres)
- Delete: `validate`, `test-all`
- Create: `tests/test-cli.test.ts`
- Delete: `tests/validate-cli.test.ts`
- Modify: `tests/fusion-angle-live-name.test.ts`
  (drop `validate` from `ROOT_FILES`)
- Modify: `test` `--allow-run` (drop `./validate`;
  keep `./crank` until Task 7)
- Modify: `crank` (`./validate` → `./test validate`;
  `./bin/test-postgres` → `./test postgres`;
  `./bin/test-browser` stays until Task 7 deletes
  crank — crank currently calls test-postgres and
  test-browser as scripts. After this task the public
  names are `./test postgres` and `./test browser`.
  Update crank to those so the still-living `./crank`
  is not a liar. That is caller repair for the
  deleted root commands, not `./deploy`.)

**Depends on:** Task 2. **Unblocks:** Task 7.

- [ ] **Step 1: Write failing dispatcher tests**

Create `tests/test-cli.test.ts`:

```typescript
import {
    assert,
    assertMatch,
    assertNotMatch,
    assertStrictEquals,
} from '@std/assert';
import { join } from '@std/path';

function headSha(): string {
    const output = new Deno.Command('sh', {
        args: ['-c', 'git rev-parse HEAD'],
    }).outputSync();
    const decoder = new TextDecoder();
    if (!output.success) {
        throw new Error(
            'git rev-parse HEAD failed: '
            + decoder.decode(output.stderr),
        );
    }
    return decoder.decode(output.stdout).trim();
}

async function runTest(
    args: string[],
    env: Record<string, string> = {},
): Promise<{
    readonly status: number;
    readonly stdout: string;
    readonly stderr: string;
}> {
    const output = await new Deno.Command('./test', {
        args,
        signal: AbortSignal.timeout(4000),
        env: {
            POSTGRES_URL: '',
            JWT_HMAC_SIGNING_KEY: '',
            ...env,
        },
    }).output();
    const decoder = new TextDecoder();
    return {
        status: output.code,
        stdout: decoder.decode(output.stdout),
        stderr: decoder.decode(output.stderr),
    };
}

Deno.test('test unknown suite exits 1 with usage',
async () => {
    const result = await runTest(['bogus']);
    assertStrictEquals(result.status, 1);
    assertMatch(result.stderr, /Usage: \.\/test/);
});

Deno.test('test validate skips when HEAD already passed',
async () => {
    const stamp = join(
        Deno.makeTempDirSync({
            prefix: 'most-recently-validated-sha-',
        }),
        'most-recently-validated-sha',
    );
    Deno.writeTextFileSync(stamp, `${headSha()}\n`);
    const result = await runTest(['validate'], {
        MOST_RECENTLY_VALIDATED_SHA_PATH: stamp,
        WORKING_TREE_PORCELAIN: '',
    });
    assertStrictEquals(result.status, 0);
    assertMatch(
        result.stdout,
        /already validated [0-9a-f]{40}/,
    );
});

Deno.test('test memory does not SHA-skip', () => {
    const src = Deno.readTextFileSync('test');
    const skipAt = src.indexOf('already validated');
    const memoryAt = src.indexOf('run_memory()');
    assert(skipAt >= 0, 'skip message missing');
    assert(memoryAt >= 0, 'run_memory missing');
    assert(
        src.includes('MOST_RECENTLY_VALIDATED_SHA_PATH'),
    );
    assertNotMatch(
        src,
        /VALIDATE_OK|validate-ok/,
    );
});

Deno.test('test dispatcher names combinations', () => {
    const src = Deno.readTextFileSync('test');
    assertMatch(src, /validate browser/);
    assertNotMatch(src, /VALIDATE_OK/);
    assertNotMatch(src, /validate-ok/);
});
```

The `test memory does not SHA-skip` test as written
is a source pin, not a spawn of the full memory
suite (that is `./test` itself). Keep it a source
pin so it finishes inside the 4s timeout.

Delete `tests/validate-cli.test.ts` in Step 3 with
the implementation (it spawns `./validate`).

Run:

```bash
./test
```

Expected: FAIL — `./test` does not take `bogus` as a
suite (it ignores args and runs the memory suite, or
errors differently), no SHA overlay names, spawn of
`./test validate` does not skip.

- [ ] **Step 2: Implement the dispatcher**

Replace `test` with this script. Wrap at 78. Keep the
memory-suite comment about TZ and sanitizers.

```bash
#!/bin/bash
set -euo pipefail

usage() {
    cat <<'USAGE'
Usage: ./test [memory]
       ./test check
       ./test lint
       ./test schema
       ./test api-docs
       ./test postgres
       ./test browser
       ./test validate
       ./test validate browser
       ./test validate postgres
USAGE
}

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

run_memory() {
    export JWT_HMAC_SIGNING_KEY="${JWT_HMAC_SIGNING_KEY:-test-hmac-signing-key}"
    DENO_TEST=(
        deno test --frozen --parallel --no-check
        --sanitize-ops --sanitize-resources
        --allow-env --allow-read --allow-write
        --allow-net
        --allow-run=deno,./bin/serve,./crank,sh,./test
        --preload ./tests/hmac-test-key.ts
        --preload ./tests/local-storage-stub.ts
        --preload ./tests/session-storage-stub.ts
    )
    TZ=UTC "${DENO_TEST[@]}" tests/*.test.ts
    TZ=Pacific/Honolulu "${DENO_TEST[@]}" \
        tests/tz/*.test.ts
}

run_check() {
    deno --version
    deno check --frozen api shared server tests web-app
}

run_lint() {
    AWK_LINT='length > 78 {
        printf "%s:%d: %d chars\n", FILENAME, FNR, length
    }'
    LONG_LINES=$( {
        find api web-app tests shared server -type f \
            \( -name '*.ts' -o -name '*.html' \
               -o -name '*.css' \) \
            ! -path 'web-app/app/compose.ts' \
            -exec awk "$AWK_LINT" {} +
        awk "$AWK_LINT" test crank \
            bin/build bin/build-lib bin/serve \
            bin/test-postgres bin/test-browser \
            bin/generate-schema-svg \
            bin/generate-api-documentation \
            bin/measure bin/postgres-wipe \
            bin/postgres-lib bin/postgres-seed \
            deno.json Dockerfile compose.yaml \
            .dockerignore
    } )
```

Do not awk `deploy` yet — it does not exist until
Task 7. Do not awk `validate` or `test-all` — this
task deletes them. Task 7 adds `deploy` and drops
`crank`.

Copy the rest of `run_lint` from `validate`: org
abbrev, retired vocab, later-home, TEST-PLAN pin
paths. Later-home already uses Task 1's heading:

```bash
    if [ "$(grep -c '^## Critical product path' TODO.md)" \
        != "1" ]; then
```

`run_schema`: `./bin/generate-schema-svg --check`
`run_api_docs`: `./bin/generate-api-documentation --check`

`run_validate`:

```bash
run_validate() {
    local stamp porcelain head_sha
    stamp="${MOST_RECENTLY_VALIDATED_SHA_PATH:-$(
        git rev-parse --git-common-dir
    )/most-recently-validated-sha}"
    head_sha=$(git rev-parse HEAD)
    porcelain="${WORKING_TREE_PORCELAIN-$(git status --porcelain)}"
    if [ -z "$porcelain" ] \
        && [ -f "$stamp" ] \
        && [ "$(tr -d '[:space:]' < "$stamp")" = "$head_sha" ]
    then
        echo "already validated $head_sha"
        exit 0
    fi
    run_check
    run_memory
    run_lint
    run_schema
    run_api_docs
    if [ -z "$porcelain" ]; then
        printf '%s\n' "$head_sha" > "$stamp"
    fi
}
```

SHA skip applies only here, never in `run_memory`
alone.

Dispatcher:

```bash
case "${1:-memory}" in
    --help|-h)
        usage
        exit 0
        ;;
    memory)
        if [ $# -gt 1 ]; then
            echo "Error: unexpected argument: $2" >&2
            usage >&2
            exit 1
        fi
        run_memory
        ;;
    check|lint|schema|api-docs|postgres|browser)
        if [ $# -ne 1 ]; then
            echo "Error: unexpected argument" >&2
            usage >&2
            exit 1
        fi
        case "$1" in
            check) run_check ;;
            lint) run_lint ;;
            schema) run_schema ;;
            api-docs) run_api_docs ;;
            postgres) exec "$ROOT/bin/test-postgres" ;;
            browser) exec "$ROOT/bin/test-browser" ;;
        esac
        ;;
    validate)
        shift
        if [ $# -eq 0 ]; then
            run_validate
        elif [ $# -eq 1 ] && [ "$1" = "browser" ]; then
            run_validate
            exec "$ROOT/bin/test-browser"
        elif [ $# -eq 1 ] && [ "$1" = "postgres" ]; then
            run_validate
            exec "$ROOT/bin/test-postgres"
        else
            echo "Error: unknown suite" >&2
            usage >&2
            exit 1
        fi
        ;;
    *)
        echo "Error: unknown suite: $1" >&2
        usage >&2
        exit 1
        ;;
esac
```

`./test` with no args is `memory`.

- [ ] **Step 3: `bin/test-postgres` owns Docker**

Replace `bin/test-postgres` with:

```bash
#!/bin/bash
set -euo pipefail

BIN="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$BIN/.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null; then
    echo "Error: docker is required" >&2
    exit 1
fi

POSTGRES_PASSWORD="$(openssl rand -hex 16)"
JWT_HMAC_SIGNING_KEY="$(openssl rand -hex 32)"
export POSTGRES_PASSWORD
export JWT_HMAC_SIGNING_KEY
# Do not read an ambient POSTGRES_URL. Assign after
# mint. Compose interpolates JWT at parse time.
POSTGRES_URL="postgres://fusion:${POSTGRES_PASSWORD}"
POSTGRES_URL="${POSTGRES_URL}@127.0.0.1:5432/fusion"
export POSTGRES_URL

PROJECT="fusion-test-postgres-$$"
CLEANED=""
cleanup() {
    if [ -n "${CLEANED:-}" ]; then
        return
    fi
    CLEANED=1
    docker compose -p "$PROJECT" \
        down --remove-orphans || true
}
trap cleanup EXIT INT TERM

docker compose -p "$PROJECT" up -d --wait postgres

export SCHEMA_NAME="fusion_test_$(date +%s)_$$"
DENO_PG_TEST=(
    deno test --frozen --no-check
    --sanitize-ops --sanitize-resources
    --allow-env --allow-read --allow-net --allow-run
)
TZ=UTC "${DENO_PG_TEST[@]}" \
    tests/pg-acceptance.test.ts \
    tests/pg-races.test.ts \
    tests/pg-boot.test.ts \
    tests/pg-seed.test.ts \
    tests/pg-explain.test.ts \
    tests/pg-identifier-order.test.ts \
    tests/schema-lifecycle.test.ts
```

Never log the password. Project name must not be the
compose default (directory basename).

- [ ] **Step 4: Delete `./validate` and `./test-all`**

`git rm validate test-all tests/validate-cli.test.ts`

Drop `validate` from `ROOT_FILES`.

Update `crank` to `./test validate`, `./test postgres`,
`./test browser` so the still-present crank is not
calling deleted names. Source pins in
`tests/crank-cli.test.ts` follow.

- [ ] **Step 5: Run tests**

```bash
./test
WORKING_TREE_PORCELAIN=x ./test validate
```

Expected: memory suite PASS; `./test bogus` exit 1;
`./test validate` skip overlay PASS; full validate
PASS. `./validate` and `./test-all` are not found.

Do not run `./test postgres` in the sandbox if Docker
is unavailable; that is AT4, operator-gated. The
implementer runs it when Docker is present:

```bash
./test postgres
```

Expected: own compose project comes up, seven files
pass, trap removes the project. `docker compose ls`
shows no leftover `fusion-test-postgres-*`.

- [ ] **Step 6: Commit**

```bash
git commit -m "Dispatch tests through ./test"
```

---

### Task 4: `HTTP_SERVER_PORT` → `PORT`

**Files:**
- Modify: `server/boot.ts` `readListenEnv`
- Modify: `server/postgres-gate.ts` `safeErrorMessage`
  prefix `PORT `
- Modify: `tests/pg-boot.test.ts` (every
  `HTTP_SERVER_PORT` → `PORT` in env bags and
  expected messages)
- Modify: `tests/server-main.test.ts` env
- Modify: `bin/serve` (export `PORT`, usage)
- Modify: `bin/build` `--allow-env=…PORT…`
- Modify: `web-app/app/measure.ts` spawn env
- Modify: `Dockerfile` `CMD`
- Modify: `compose.yaml` `server` `PORT` and publish
- Modify: `tests/serve-cli.test.ts` if it pins
  `HTTP_SERVER_PORT`

**Depends on:** Task 2. **Unblocks:** Tasks 5, 7.
**Must precede Task 5** (shared `compose.yaml`).

Do not touch `PGPORT`. Do not add `HTTP_SERVER_PORT`
as an alias.

- [ ] **Step 1: Write the failing product pins**

In `tests/pg-boot.test.ts`, change
`readListenEnv requires the three secrets` and
`readListenEnv reads by name, never the bag` so
every key and every error string is `PORT`:

```typescript
        Error, 'missing required env PORT',
// …
        Error, 'PORT must be an integer',
// …
    assertEquals(seen.sort(), [
        'JWT_HMAC_SIGNING_KEY',
        'PORT',
        'POSTGRES_URL',
        'TRUSTED_PROXY_HOPS',
    ]);
```

`boot refuses argv before connecting` env bag uses
`PORT: '8080'`.

`tests/server-main.test.ts` spawn env uses `PORT`.

Run `./test`. Expected: FAIL — `readListenEnv` still
requires `HTTP_SERVER_PORT`.

- [ ] **Step 2: Implement**

`server/boot.ts`:

```typescript
    const portRaw = requiredEnvBy('PORT', read);
    const port = Number(portRaw);
    if (!Number.isInteger(port)
        || port < 1
        || port > 65535) {
        throw new Error(
            'PORT must be an integer 1-65535',
        );
    }
```

`server/postgres-gate.ts` `safeErrorMessage`:

```typescript
    if (error.message.startsWith(
        'PORT ',
    )) {
        return error.message;
    }
```

`bin/serve`: `export PORT="$PORT"` (argv already
named `PORT`). Usage: `port   PORT (required; no
default)`. Requires `POSTGRES_URL` and
`JWT_HMAC_SIGNING_KEY` already in the process.

`bin/build` compile `--allow-env=` list: replace
`HTTP_SERVER_PORT` with `PORT`.

`web-app/app/measure.ts` spawn env:

```typescript
                        PORT: String(port),
```

`Dockerfile`:

```
CMD ["sh", "-c", \
    "cd render-out && exec ./fusion-angle serve"]
```

No `HTTP_SERVER_PORT=$PORT`. Still no `ARG`.

`compose.yaml` `server`:

```yaml
        environment:
            PORT: ${PORT:?required}
            POSTGRES_URL: *postgres-url
            JWT_HMAC_SIGNING_KEY: ${JWT_HMAC_SIGNING_KEY:?required}
        ports:
            - 127.0.0.1:${PORT:?required}:${PORT:?required}
```

Healthcheck already reads `PORT`.

- [ ] **Step 3: Run tests**

```bash
./test
WORKING_TREE_PORCELAIN=x ./test validate
```

Expected: PASS. `grep -rn HTTP_SERVER_PORT --include='*.ts'
--include='*.yaml' server web-app tests compose.yaml
Dockerfile bin` is empty except historical docs and
this plan/spec. Product code is clean.

- [ ] **Step 4: Commit**

```bash
git commit -m "Rename HTTP_SERVER_PORT to PORT"
```

---

### Task 5: Wipe SQL and compose `wipe` service

**Files:**
- Modify: `api/backend-postgres.ts` `POSTGRES_DROP_SCHEMA`
- Modify: `tests/backend-postgres.test.ts` both drop
  pins
- Modify: `compose.yaml` add `wipe` service

**Depends on:** Tasks 2 and 4. **Unblocks:** Task 6.

The constant is the wipe. `deleteSchema` and
`wipePostgres` already `unsafe` it. Do not hardcode
the role name `fusion` — Render's role is not
`fusion`. `CURRENT_USER` is the connected role.

```typescript
export const POSTGRES_DROP_SCHEMA =
    'DROP SCHEMA public CASCADE;\n'
    + 'CREATE SCHEMA public;\n'
    + 'GRANT ALL ON SCHEMA public TO CURRENT_USER;\n'
    + 'GRANT ALL ON SCHEMA public TO public;';
```

- [ ] **Step 1: Write the failing pins**

Replace
`POSTGRES_DROP_SCHEMA drops message_pairs first` and
`deleteSchema drops tables, function, marker` with:

```typescript
Deno.test('POSTGRES_DROP_SCHEMA drops schema public',
() => {
    assertStrictEquals(
        POSTGRES_DROP_SCHEMA,
        'DROP SCHEMA public CASCADE;\n'
        + 'CREATE SCHEMA public;\n'
        + 'GRANT ALL ON SCHEMA public TO CURRENT_USER;\n'
        + 'GRANT ALL ON SCHEMA public TO public;',
    );
});

Deno.test('deleteSchema unsafes POSTGRES_DROP_SCHEMA',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.deleteSchema();
    assertStrictEquals(
        fake.calls[0]!.text,
        POSTGRES_DROP_SCHEMA,
    );
});
```

`tests/postgres-wipe.test.ts` already asserts
`wipePostgres` unsafes the constant — it follows.

Run `./test`. Expected: FAIL — constant is still the
table list.

- [ ] **Step 2: Change the constant**

Set `POSTGRES_DROP_SCHEMA` to the four statements
above. No other wipe SQL.

- [ ] **Step 3: Compose `wipe` service**

Add, matching `seed`:

```yaml
    wipe:
        build:
            context: .
            target: runtime
        profiles:
            - wipe
        depends_on:
            postgres:
                condition: service_healthy
        environment:
            POSTGRES_URL: *postgres-url
        entrypoint:
            - ./render-out/fusion-angle
            - wipe
```

`POSTGRES_URL` only. No signing key.

- [ ] **Step 4: Run tests**

```bash
./test
WORKING_TREE_PORCELAIN=x ./test validate
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "Wipe by dropping schema public"
```

---

### Task 6: Guns through compose and `render`

**Files:**
- Modify: `bin/postgres-wipe`
- Modify: `bin/postgres-seed`
- Modify: `bin/postgres-lib`
- Create: `tests/postgres-gun-cli.test.ts`

**Depends on:** Task 5. **Unblocks:** Task 7.

`--postgres local|render` only. `--postgres compose`
is gone. Host `deno run` against loopback is gone.
Render is the `render` CLI. `http_json` is not the
deploy, seed, or wipe path — delete it and its
callers in this file when nothing else remains
(`fail_http`, `fetch_logs` curl, HTTP
`wait_for_job`, HTTP `discover_render_ids`).

`render` CLI v2.26.0 verbs that exist:

- `render postgres list -o json`
- `render services -o json`
- `render jobs create SERVICE_ID --start-command CMD
  --confirm -o json`
- `render jobs list SERVICE_ID -o json`
- `render logs --resources ID --start TIME
  --direction forward --limit 100 -o json`
- `render restart SERVICE_ID --confirm -o json`
- `render deploys create SERVICE_ID --commit SHA
  --wait --confirm -o json` (Task 7 uses this)

There is **no** `render jobs get`. Spec said poll
with `jobs get`. Poll with `render jobs list
"$SERVICE_ID" -o json` and select the created id.
If the list JSON cannot yield that job's status,
STOP: `Error: render jobs get is not a CLI verb;
list cannot poll`. Do not curl.

If `render services -o json` has no runtime field,
STOP and name it. Live runtime not `docker` → STOP.
Exactly one Postgres, one web service, else STOP.

- [ ] **Step 1: Write failing gun pins**

Create `tests/postgres-gun-cli.test.ts`. Spawn
`./bin/postgres-wipe` and `./bin/postgres-seed` with
a docker stub and a `render` stub on PATH (same
stamp pattern as `crank-cli`). Cases:

- `--postgres compose` (wipe and seed) → exit 1,
  usage, stub docker not called, stub render not
  called
- `--postgres local` on wipe with TOKEN → exit 1
- seed missing `--mock-data|--bootstrap` → exit 1
- `--help` → exit 0
- source pin wipe local path:
  `docker compose` + `run --rm wipe`; never
  `deno run`; never `--postgres compose`
- source pin seed local path:
  `docker compose` + `run --rm seed`; never
  `deno run`; never `--postgres compose`
- source pin render path: `render jobs create`,
  `render jobs list`, `render logs`, `command -v
  render`; never `http_json`; never `curl` as the
  Render transport

Run `./test`. Expected: FAIL — compose target still
legal; local still `deno run`; render still
`http_json`.

- [ ] **Step 2: Local is compose run**

`bin/postgres-wipe` local branch:

```bash
if [ "$POSTGRES_TARGET" = "local" ]; then
    if ! command -v docker >/dev/null; then
        echo "Error: docker is required" >&2
        exit 1
    fi
    exec docker compose -f "$ROOT/compose.yaml" \
        run --rm wipe
fi
```

No `assert_loopback_postgres_url`. No host
`deno run`. Needs compose env already set (deploy
did that).

`bin/postgres-seed` local branch:

```bash
if [ "$POSTGRES_TARGET" = "local" ]; then
    if ! command -v docker >/dev/null; then
        echo "Error: docker is required" >&2
        exit 1
    fi
    exec docker compose -f "$ROOT/compose.yaml" \
        run --rm seed "$MODE"
fi
```

Delete the `compose` target entirely (parser
`render|local` only).

- [ ] **Step 3: Render is the CLI**

In `bin/postgres-lib`, replace discovery, wait, and
logs.

`assert_render_cli` (called from both guns and, in
Task 7, `./deploy --render`):

- `command -v render` or STOP `Error: render is
  required`
- `~/.render/cli.yaml` exists or STOP
- parse an `expires_at` RFC-3339 zulu via a tiny
  Deno stdin program (no YAML library; grep the
  timestamp). If missing or `Date.now() >= Date.parse(exp)`,
  STOP `Error: ~/.render/cli.yaml is expired`
- TOKEN is already in `RENDER_API_KEY`

`discover_render_ids`:

```bash
render postgres list -o json > "$TMP/postgres.json"
render services -o json > "$TMP/services.json"
```

Then a Deno program: unwrap array-or-object shapes
until one Postgres id and one web-service id remain.
Read runtime; must equal `docker`. Print
`OWNER_ID\nSERVICE_ID\n`. Unexpected shape → STOP
and name the missing field. Never call
`api.render.com` via curl.

`wait_for_job JOB_ID TIMEOUT LABEL`:

```bash
render jobs list "$SERVICE_ID" -o json \
    > "$TMP/${label}-status.json"
```

Find `JOB_ID`. `succeeded` returns.
`failed|canceled` STOP. Loop `POLL_SEC` until
`TIMEOUT`. Same `WIPE_TIMEOUT_SEC` /
`REVEAL_TIMEOUT_SEC` as today.

Wipe render body:

```bash
render jobs create "$SERVICE_ID" \
    --start-command "./render-out/fusion-angle wipe" \
    --confirm -o json > "$TMP/wipe-created.json"
```

Parse job id with the existing `job_id_from` if the
CLI JSON still has `.id`; if the shape differs,
adapt the Deno projection to the CLI, not to curl.

Seed render body: start command
`./render-out/fusion-angle seed ${MODE}`, then
`wait_for_job`, then

```bash
render logs --resources "$JOB_ID" \
    --start "$SEED_START" \
    --direction forward --limit 100 \
    -o json > "$TMP/logs.json"
```

Flatten messages with a Deno program (CLI JSON will
not match the old `{ logs: [{ message }] }`
necessarily — adapt, STOP if messages cannot be
found). `print_reveal_lines` stays. Then

```bash
render restart "$SERVICE_ID" --confirm -o json
```

Revoke reminder stays. Do not revoke.

- [ ] **Step 4: Run tests**

```bash
./test
WORKING_TREE_PORCELAIN=x ./test validate
```

Expected: PASS. `grep -n http_json bin/postgres-lib
bin/postgres-seed bin/postgres-wipe` is empty.

- [ ] **Step 5: Commit**

```bash
git commit -m "Run guns through compose and render"
```

---

### Task 7: `./deploy`; delete `./crank`

**Files:**
- Create: `deploy`
- Create: `tests/deploy-cli.test.ts`
- Delete: `crank`, `tests/crank-cli.test.ts`
- Modify: `test` `--allow-run` (`./deploy` instead of
  `./crank`; add `deploy` to the lint awk list)
- Modify: `tests/fusion-angle-live-name.test.ts`
  (`deploy` in `ROOT_FILES` if we scan it — add
  `'deploy'`)

**Depends on:** Tasks 3, 4, 6. **Unblocks:** Tasks 8, 9.

Subagents never run `./deploy --render`. Tests cover
argv, refuses, source pins, docker stub. They do not
place an image.

- [ ] **Step 1: Write failing CLI tests**

Create `tests/deploy-cli.test.ts` on the
`crank-cli` stub pattern (`pathWithDockerStub`,
blank secrets, 4s timeout). Spawn `./deploy`.

Cases (all stub docker not called, except we never
reach Docker on these):

- no args → exit 1, `/Usage: \.\/deploy/`
- `--local 8080` without `--postgres` → exit 1
- `--postgres mock-data` without where → exit 1
- `--local 8080 --commit abc` → exit 1
- `--render tok --commit abc --postgres mock-data`
  → exit 1
- `--local 8080 --postgres mock-data --postgres
  bootstrap` → exit 1 (`exclusive` / two seed modes)
- `--local 8080 --postgres local` → exit 1 (place
  is not a seed mode)
- `--local 8080 --postgres compose` → exit 1
- `--local 8080 --postgres render` → exit 1
- unknown flag → exit 1
- `--help` / `-h` → exit 0, usage on stdout

Source pin `deploy source owns the local stack`:

```typescript
Deno.test('deploy source owns the local stack', () => {
    const src = Deno.readTextFileSync('deploy');
    assertMatch(src, /\.\/test validate/);
    assertMatch(src, /\.\/test postgres/);
    assertMatch(src, /\.\/test browser/);
    assertMatch(
        src,
        /docker compose up -d --wait postgres/,
    );
    assertMatch(src, /docker compose build/);
    assertMatch(
        src,
        /bin\/postgres-wipe --postgres local/,
    );
    assertMatch(
        src,
        /bin\/postgres-seed --postgres local/,
    );
    assertMatch(
        src,
        /docker compose up -d --wait server/,
    );
    assertNotMatch(src, /bin\/serve/);
    assertNotMatch(src, /bin\/build --no-zip/);
    assertNotMatch(src, /HTTP_SERVER_PORT/);
    assertNotMatch(src, /echo \$POSTGRES_URL/);
    assertNotMatch(src, /echo \$POSTGRES_PASSWORD/);
    assertNotMatch(src, /echo \$JWT_HMAC_SIGNING_KEY/);
    const trapAt = src.indexOf('trap ');
    const upAt = src.indexOf(
        'docker compose up -d --wait postgres',
    );
    assert(trapAt >= 0, 'trap missing');
    assert(upAt >= 0, 'compose up missing');
    assert(trapAt < upAt, 'trap after Docker');
});
```

Source pin Render path: `git ls-remote origin
refs/heads/master`, `render deploys create`,
`--wait --confirm -o json`, no `--clear-cache`,
`command -v render`, never `http_json`.

Run `./test`. Expected: FAIL — `./deploy` missing.

- [ ] **Step 2: Implement `./deploy`**

```bash
#!/bin/bash
set -euo pipefail

usage() {
    cat <<'USAGE'
Usage: ./deploy {--local PORT | --render TOKEN}
                {--postgres mock-data|bootstrap
                 | --commit SHA}
USAGE
}

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

LOCAL_PORT=""
RENDER_TOKEN=""
COMMIT_SHA=""
BOOTSTRAP=false
MOCK_DATA=false

while [ $# -gt 0 ]; do
    case "$1" in
        --help|-h)
            usage
            exit 0
            ;;
        --local)
            if [ $# -lt 2 ]; then
                echo "Error: --local requires PORT" >&2
                usage >&2
                exit 1
            fi
            LOCAL_PORT="$2"
            shift 2
            ;;
        --render)
            if [ $# -lt 2 ]; then
                echo "Error: --render requires TOKEN" >&2
                usage >&2
                exit 1
            fi
            RENDER_TOKEN="$2"
            shift 2
            ;;
        --commit)
            if [ $# -lt 2 ]; then
                echo "Error: --commit requires SHA" >&2
                usage >&2
                exit 1
            fi
            COMMIT_SHA="$2"
            shift 2
            ;;
        --postgres)
            if [ $# -lt 2 ]; then
                echo "Error: --postgres requires" \
                    "a value" >&2
                usage >&2
                exit 1
            fi
            case "$2" in
                mock-data) MOCK_DATA=true ;;
                bootstrap) BOOTSTRAP=true ;;
                *)
                    echo "Error: --postgres must be" \
                        "mock-data or bootstrap" >&2
                    usage >&2
                    exit 1
                    ;;
            esac
            shift 2
            ;;
        -*)
            echo "Error: unknown argument: $1" >&2
            usage >&2
            exit 1
            ;;
        *)
            echo "Error: unexpected argument:" \
                "$1" >&2
            usage >&2
            exit 1
            ;;
    esac
done
```

Refuses (usage, exit 1, no Docker, no network),
each with an `Error:` line:

- both `--local` and `--render`, or neither
- `--local` plus `--commit`
- `--commit` plus `--postgres`
- `--render` without `--commit` and without
  `--postgres`
- `--local` without `--postgres`
- two seed modes
- `--postgres` values other than
  `mock-data|bootstrap` (already rejected in parse)

`--local PORT --postgres mock-data|bootstrap`:

1. Trap installed **before** Docker.
2. `./test validate` — red aborts, no Docker.
3. `./test postgres` — own project, own teardown.
4. `./test browser`.
5. Mint `POSTGRES_PASSWORD` (openssl rand -hex 16)
   and `JWT_HMAC_SIGNING_KEY` (openssl rand -hex 32).
   `export PORT="$LOCAL_PORT"`. Host
   `POSTGRES_URL=postgres://fusion:${POSTGRES_PASSWORD}@127.0.0.1:5432/fusion`.
   Never log secrets. No `.env`.
6. `docker compose up -d --wait postgres`
7. `docker compose build`
8. `bin/postgres-wipe --postgres local` then
   `bin/postgres-seed --postgres local --mock-data`
   or `--bootstrap` (map deploy's
   `--postgres mock-data` → `--mock-data`).
9. `docker compose up -d --wait server`. Health is
   compose's. `/` is reachable because seed ran.
10. `wait` until interrupt.

Cleanup trap: `docker compose down --remove-orphans`.
No leftover network. No `.env`. No `docker rmi`.
Idempotent (`CLEANED` guard, like crank).

`--render TOKEN --commit SHA`:

1. `export RENDER_API_KEY="$RENDER_TOKEN"`; unset
   TOKEN.
2. Source `bin/postgres-lib`. `assert_render_cli`.
3. `REMOTE=$(git ls-remote origin refs/heads/master
   | awk '{print $1}')`. If `"$REMOTE" !=
   "$COMMIT_SHA"`, STOP `Error: SHA is not
   origin/master`. Full 40-hex. Never push.
   `ssh-add` is the operator's.
4. `discover_render_ids`. Runtime not docker → STOP.
5. `render deploys create "$SERVICE_ID" --commit
   "$COMMIT_SHA" --wait --confirm -o json`. No
   `--clear-cache`. Non-zero on
   `update_failed`/`build_failed` is a STOP.
6. Domain oracles (curl `-sS -o /dev/null -w`):

```bash
for host in fusionangle.com fusionangle.ai; do
    for path in / /landing/index.html \
        /api/organizations; do
        curl -sS -o /dev/null \
            -w "${host} ${path} %{http_code}\n" \
            "https://${host}${path}"
    done
done
for host in www.fusionangle.com \
    www.fusionangle.ai; do
    curl -sS -o /dev/null \
        -w "${host} / %{http_code} %{redirect_url}\n" \
        "https://${host}/"
done
```

   Expected: apex `/` 200, `/landing/index.html`
   200, `/api/organizations` 401; `www` 301 to
   apex. Any miss is a STOP.
7. Print the revoke reminder. Do not revoke.

`--render TOKEN --postgres mock-data|bootstrap`:

1. Same credential and runtime checks.
2. `bin/postgres-wipe --postgres render "$RENDER_API_KEY"`
   then `bin/postgres-seed --postgres render
   "$RENDER_API_KEY" --mock-data|--bootstrap`.
3. Seed's restart stays inside the gun.
4. No `--commit`. No deploy.

chmod +x deploy.

- [ ] **Step 3: Delete crank**

`git rm crank tests/crank-cli.test.ts`

`--allow-run=deno,./bin/serve,./deploy,sh,./test`

Lint awk list: add `deploy`, drop `crank`.

`ROOT_FILES`: add `'deploy'`.

- [ ] **Step 4: Run tests**

```bash
./test
WORKING_TREE_PORCELAIN=x ./test validate
```

Expected: PASS. `./crank` is not found.
`./deploy --help` exit 0.

- [ ] **Step 5: Commit**

```bash
git commit -m "Replace crank with ./deploy"
```

---

### Task 8: Docs

**Files:**
- Modify: `AGENTS.md` command block, gates, env
  names, worktree `./validate` line, subagent
  "never `./deploy --render`"
- Modify: `TEST-PLAN.md` walk table, Invocation, A1–A3,
  AT1–AT5, J1/J2
- Modify: `ARCHITECTURE.md` required env `PORT`,
  Dockerfile `CMD` with no env copy, wipe as public
  schema reset, `./deploy` as the operator path,
  compose `:?required` (deploy mints first). Leave
  the 24.7 s Docker build figure.
- Modify: `README.md` getting started / seed / build
  names
- Modify: `SCHEMA.md` operator-tools wipe sentence
- Not `API.md` (it does not restate wipe)

**Depends on:** Task 7. **Unblocks:** nothing.
**File-disjoint from Task 9.**

Markdown wrap matches each file's neighbors.
`ARCHITECTURE.md` ≤ 58. No deferral prose in
ARCHITECTURE (`later work`, `(later)`, `not built`,
`coming soon`, `later session`, `will be added when`)
— Later work lives in TODO.md. Point at TODO.md if
needed.

- [ ] **Step 1: AGENTS.md command block**

Replace the opening bash fence with:

```bash
./test                 # memory suite
./test validate        # Layer 1 (SHA skip on clean HEAD)
./test validate browser  # Layer 2
./test postgres        # AT4; own Docker Postgres
./test browser         # AT5; Chrome, in-process memory
./test check|lint|schema|api-docs
./deploy --local PORT --postgres mock-data|bootstrap
./deploy --render TOKEN --commit SHA
./deploy --render TOKEN --postgres mock-data|bootstrap
./bin/build            # executable ZIP to ~/Desktop/
./bin/build --no-zip dir/
./bin/serve dir/ port  # ZIP hatch; PORT from argv
./bin/postgres-seed --postgres local --mock-data|--bootstrap
./bin/postgres-wipe --postgres local
./bin/measure
```

Do not list bare `docker compose build` as an
operator path. Do not list `./crank`, `./validate`,
`./test-all`, root `./build` / `./serve` /
`./postgres-*`.

Gates: Layer 1 is `./test validate`; Layer 2 is
`./test validate browser`; Layer 3 is
`./deploy --local 8080 --postgres mock-data` then
the walk. `HTTP_SERVER_PORT` → `PORT`. Subagents
never run `./deploy --render`. Worktree snippet's
`./validate` becomes `./test validate`.

- [ ] **Step 2: TEST-PLAN.md**

Walk table:

| Layer | Command | Standing |
|---|---|---|
| 1 | `./test validate` | Gate: every commit |
| 2 | `./test validate browser` | Gate: before a build, a deploy, or a walk; `./deploy --local` enforces it |
| 3 | `./deploy --local 8080 --postgres mock-data` then the walk | Exploration |

Invocation: do not set `POSTGRES_URL`,
`JWT_HMAC_SIGNING_KEY`, or `PORT` by hand —
`./deploy --local` mints them.

A3 is `./deploy --local 8080 --postgres mock-data`
(process listens; seed reveal on stdout). A1/A2 stay
ZIP inventory via `bin/build` and `bin/serve`.

AT1–AT3 are `./test validate`. AT4 is
`./test postgres` (own Docker, not the walk DB).
AT5 is `./test browser`. J1/J2 are deploy's trap
(`compose down --remove-orphans`; no temp bundle —
there is no host `--no-zip` dir). J2's "crank's temp
bundle" becomes: no leftover compose project, no
`.env`. J3 ZIP archival stays (A1).

- [ ] **Step 3: ARCHITECTURE.md, README.md, SCHEMA.md**

Required env: `POSTGRES_URL`, `JWT_HMAC_SIGNING_KEY`,
`PORT`. Wrappers: `bin/postgres-seed`,
`bin/postgres-wipe`. Missing marker sentence may
keep `seed with ./postgres-seed` as the verb name
inside the binary, or say `bin/postgres-seed` —
match the operator path (`bin/postgres-seed`).
Dockerfile `CMD` is
`cd render-out && exec ./fusion-angle serve` with no
env copy. Wipe is `DROP SCHEMA public CASCADE`,
recreate, re-grant. `./deploy` mints before compose
because `:?required` remains.

README getting-started paragraph: Deno runs
`./test`, `./test validate`, `./bin/build`,
`./test browser`, `./bin/measure`, the generators.
`./deploy` composes the walk origin.
`./bin/serve` execs the binary.

SCHEMA.md Operator tools: wipe is the public-schema
reset (`POSTGRES_DROP_SCHEMA`) and does not seed.

- [ ] **Step 4: Run Layer 1**

```bash
WORKING_TREE_PORCELAIN=x ./test validate
```

Expected: PASS (later-home, TEST-PLAN pin paths,
78-char on scripts).

- [ ] **Step 5: Commit**

```bash
git commit -m "Document the Docker deploy path"
```

---

### Task 9: TODO.md Later-work bullets

**Files:**
- Modify: `TODO.md` under `## Later work` (the
  heading at the current line 316, **not**
  `## Critical functionality path`)

**Depends on:** Task 7. **File-disjoint from Task 8.**

Do not add `/status` or `TRUSTED_PROXY_HOPS` (already
critical product path items 5 and 10). Do not add
the old Node 500. Do not touch
`## Critical product path`.

- [ ] **Step 1: Append three bullets**

Insert immediately after `## Later work` (before the
`exists()` helper bullet), wrap like neighbors:

```markdown
- `render.yaml` Blueprint as a second source of
  truth for the dashboard service. Oracle: a
  committed `render.yaml` that matches the live
  service without a dashboard PATCH.
- Render Postgres `ipAllowList` still contains
  `0.0.0.0/0`. This repo's laptop reseed path to
  the external URL is gone; tightening the list
  is item-10 policy (item 10 never names
  `ipAllowList`). Oracle: Render connection info
  `ipAllowList` does not contain `0.0.0.0/0`.
- Dependency-warm Docker layer. `COPY . .` busts
  later layers; `deno compile` fetches `denort`.
  Cold-build reliability is not the problem.
  Oracle: a measured cold Render Docker build,
  then a layer that caches `deno.json` /
  `deno.lock` / `denort` only if that number is
  the bottleneck.
```

- [ ] **Step 2: Run Layer 1**

```bash
WORKING_TREE_PORCELAIN=x ./test validate
```

Expected: PASS. `grep -c '^## Later work' TODO.md`
is 1. ARCHITECTURE.md still 0. No deferral prose
leaked into ARCHITECTURE.md.

- [ ] **Step 3: Commit**

```bash
git commit -m "Name later Docker deploy work"
```

---

## After Task 9

Controller: `WORKING_TREE_PORCELAIN=x ./test validate`.
Ask the operator for `./test validate browser` (Chrome)
and, when they want a walk origin,
`./deploy --local 8080 --postgres mock-data`.
Then `superpowers:finishing-a-development-branch`.
Land with `git merge --ff-only docker-deploy` from
the main checkout. Never `-D`, never force-push.
)

# Crank Local Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.
>
> This plan is a **dependency DAG for subagents**.
> Fan out inside a wave. Do not serialize independent
> shards. Do not use git worktrees (repo rule). Agents
> share one working tree and MUST stay file-disjoint
> inside a wave. Subagents write and test; they do not
> `git add` or commit — parallel committers race the
> index. The orchestrator commits after each wave
> joins, one concern per commit.
>
> Spec:
> `docs/superpowers/specs/2026-08-26-crank-local-stack-design.md`

**Goal:** One executed `./crank` owns the local stack
(validate, mint, postgres-only compose, AT4, `--no-zip`
bundle, wipe, seed, listen) and leaves no run trace;
`./serve` only listens.

**Architecture:** Argv is the memory-suite covenant
(`spawnSync`, no Docker). Full crank is TEST-PLAN How
to invoke. Secrets live in crank's process and its
children — never logged, never written, never sourced
into the parent shell. The EXIT/INT/TERM trap stops
serve, `docker compose down --remove-orphans`, and
`rm -rf` the temp bundle. `compose.yaml`'s `server`
service does not start.

**Tech Stack:** bash root scripts, `node:test` +
`spawnSync` for argv and source pins, Docker Compose
postgres service, existing `./validate` / `./build` /
`./postgres-wipe` / `./postgres-seed` / `./test-postgres`.

---

## Why this DAG

The spec is one glue feature, not three products. One
plan. File ownership is the parallelization primitive.

- `serve` must listen-only before `crank` calls
  `./serve dir/ port`.
- `validate` is touched twice: drop the root-`.md`
  78-character `find` (Wave 0), then add `crank` to
  the script awk list (Wave 1, after `crank` exists —
  awk on a missing file fails).
- `AGENTS.md` and `TEST-PLAN.md` name crank; they
  wait until the script is on disk so the prose is
  not a lie.
- `build` help is file-disjoint from serve and crank.

Peak concurrency is **3** (Wave 0). Wave 1 is **1**.
Wave 2 is **2**.

```mermaid
flowchart TB
    subgraph W0["Wave 0 — 3 writers — file-disjoint"]
        V[V drop md 78-char find]
        S[S serve listens only]
        B[B no-zip help names crank]
        V --- S --- B
    end

    subgraph W1["Wave 1 — 1 writer — needs V and S"]
        C[C crank + tests + awk list]
    end

    subgraph W2["Wave 2 — 2 writers — file-disjoint"]
        A[A AGENTS.md router]
        T[T TEST-PLAN protocol]
        A --- T
    end

    W0 --> W1
    W1 --> W2
```

Commit order after each wave joins (`./validate`
green each time):

- Wave 0: V, then S, then B
- Wave 1: C
- Wave 2: A, then T

---

## How to run this DAG

The orchestrator (this session, Full scroll)
dispatches. Subagents do not read this file for
scope — the orchestrator pastes the **Shared
prompt**, the agent's **Files**, and the task
body.

Every subagent prompt begins with
`Go to Medium Church!` then the Shared prompt.

Waves do not overlap. Uncommitted work from wave
N must become green commits before wave N+1
starts. Inside a wave, agents stay file-disjoint.

Do not use git worktrees. Do not dispatch two
agents that write the same path.

After a wave joins:

1. Spec-review the diff against the spec section
   named in the task.
2. Code-quality review (78-char on files
   `./validate` still lints, trap order, no
   secret echo, no unbidden files).
3. Run the task's targeted tests, then
   `./validate`.
4. Commit per the task's message. Trailer only:

```
Co-Authored-By: Grok 4.6 <noreply@x.ai>
```

---

## Shared prompt (every subagent)

```
Go to Medium Church!

Then read AGENTS.md at
/Users/tmornini/code/fusion-angle/AGENTS.md
in full.

Then:

- Voice: 78-char max line in files `./validate`
  still lints (`api/`, `web-app/`, `tests/`,
  `shared/`, `server/` `*.ts|html|css` except
  compose.ts; root scripts; Dockerfile;
  compose.yaml; .dockerignore). 4-space indent.
  Final newline. No trailing whitespace. No
  inline styles. Present-tense imperative
  commit subjects are the orchestrator's job —
  you do not commit.
- Commandments: Reliability, Security,
  Uniformity, Clarity, Idempotency, Simplicity.
- Abominations this work risks: Resource
  Abandonment (trap must stop serve, down
  compose, rm the temp bundle), Default Values
  (no default port), Swallowed Failures (do not
  hide validate/build/seed red; `|| true` is
  only for compose down on a never-started
  stack), Unbidden Helper Code, Magical Values,
  Test Weakening, Foreign Tongues.
- Patterns: argv exclusivity copied from
  `./postgres-seed`; trailing slash copied from
  `./build`; required env never logged
  (`POSTGRES_URL`, `POSTGRES_PASSWORD`,
  `JWT_HMAC_SIGNING_KEY`); HTTP-verb script
  names already exist (`postgres-seed`,
  `postgres-wipe`) — call them, do not wrap
  them; source pins copied from
  `tests/server-zip-metafile.test.ts`;
  `spawnSync` children get an explicit `env`
  that does NOT inherit the test runner's
  `JWT_HMAC_SIGNING_KEY`.
- TDD: write the failing test first, run it,
  implement, run it green. No Docker in
  `./test`.
- Do not git add. Do not commit. Do not run
  `./validate` (orchestrator does). Do not use
  worktrees.
- Do not touch files outside the assigned list.
- Do not rewrite docs/superpowers/ specs or
  plans. Do not change `compose.yaml`. Do not
  `docker rmi`. Do not delete the A1 Desktop
  ZIP. Do not source crank. Do not eval crank.
- Return: files touched, tests run and their
  PASS/FAIL, anything skipped and why.
```

---

## File map

- Modify: `validate` — drop the root-`.md`
  78-character `find`; later add `crank` to the
  root-script awk list. Keep the 78-character
  awk on `api/` `web-app/` `tests/` `shared/`
  `server/` `*.ts|html|css` (compose.ts exempt)
  and on root scripts / `Dockerfile` /
  `compose.yaml` / `.dockerignore`. Root-doc
  **line-count** ceilings stay. Retired-vocab
  and later-work greps over root `.md` stay.
- Modify: `serve` — `./serve dir/ port` only.
  No default port, no `mktemp`, no `./build`,
  no trap-clean of a bundle. Requires
  `POSTGRES_URL` and `JWT_HMAC_SIGNING_KEY`.
  Sets `HTTP_SERVER_PORT` from `port`. Runs
  `node server.mjs` from `dir/`.
- Modify: `build` — `--no-zip` help names
  `./crank`, not `./serve`.
- Create: `crank` (mode 100755) — executed glue.
- Create: `tests/serve-cli.test.ts` — argv +
  source pin.
- Create: `tests/validate-lint.test.ts` — source
  pin that the 78-character block does not awk
  root markdown; Wave 1 adds the crank pin.
- Create: `tests/crank-cli.test.ts` — argv +
  source pins (postgres-only up, trap before
  Docker, no secret echo).
- Modify: `tests/server-zip-metafile.test.ts` —
  `--no-zip` help names crank.
- Modify: `AGENTS.md` — command list, clean-tree
  names `./build` and `./crank`, TMPDIR sandbox
  note moves to crank, Gates 78-character lint
  is code and scripts not `.md`, subagent voice
  78-char applies to files `./validate` still
  lints.
- Modify: `TEST-PLAN.md` — How to invoke,
  Protocol, AT preamble + AT3 awk description,
  A3, J1/J2, Known MCP J1/J2, SV operator
  prerequisites.
- Keep: `compose.yaml` (do not change the
  `server` service). `./postgres-seed` and
  `./postgres-wipe` stay. `./measure` stays.
  Historical `docs/superpowers/` specs and
  plans stay. DESIGN-SYSTEM.md CSS 78-char
  rule stays. TODO.md postgres-only compose
  investigation stays (already named).

---

### Task V: Drop markdown from the 78-character lint

**Wave:** 0
**Depends on:** nothing
**Files:**
- Modify: `validate`
- Create: `tests/validate-lint.test.ts`

- [ ] **Step 1: Write the failing source pin**

Create `tests/validate-lint.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const VALIDATE = readFileSync('validate', 'utf8');

function longLineBlock(src: string): string {
    const start = src.indexOf('LONG_LINES=');
    const end = src.indexOf('DOC_LINE_FAIL=');
    assert.ok(start >= 0, 'LONG_LINES missing');
    assert.ok(end > start, 'DOC_LINE_FAIL missing');
    return src.slice(start, end);
}

test('validate does not lint root markdown', () => {
    const block = longLineBlock(VALIDATE);
    assert.doesNotMatch(block, /-name '\*\.md'/);
    assert.doesNotMatch(
        block,
        /TEST-PLAN\.md/,
    );
});
```

- [ ] **Step 2: Run the pin and confirm it fails**

Run:

```bash
TZ=UTC node --strip-types --test \
    tests/validate-lint.test.ts
```

Expected: FAIL — the `LONG_LINES` block still
`find`s root `*.md` except `TEST-PLAN.md`.

- [ ] **Step 3: Drop the root-`.md` find**

In `validate`, delete only these three lines
inside the `LONG_LINES=$( { ... } )` group
(leave the `api web-app tests shared server`
find and the root-script `awk`):

```
    find . -maxdepth 1 -type f -name '*.md' \
        ! -name 'TEST-PLAN.md' \
        -exec awk "$AWK_LINT" {} +
```

Do not add `crank` to the awk list in this
task (`crank` does not exist yet). Do not
touch the retired-vocab `find` over root
`.md`. Do not touch the later-work `find`.
Do not touch `DOC_LINE_FAIL` ceilings.

The awk list stays:

```bash
    awk "$AWK_LINT" build serve test test-postgres \
        validate generate-schema-svg \
        generate-api-documentation measure \
        postgres-wipe postgres-lib postgres-seed \
        Dockerfile compose.yaml .dockerignore
```

- [ ] **Step 4: Re-run the pin and confirm it passes**

Run:

```bash
TZ=UTC node --strip-types --test \
    tests/validate-lint.test.ts
```

Expected: PASS.

- [ ] **Step 5: Stop. Do not commit.**

Orchestrator commit after Wave 0 joins:

```
Drop markdown from the 78-character lint
```

---

### Task S: Make serve listen without building

**Wave:** 0
**Depends on:** nothing
**Files:**
- Modify: `serve`
- Create: `tests/serve-cli.test.ts`

- [ ] **Step 1: Write the failing argv tests**

Create `tests/serve-cli.test.ts`. Children must
not inherit the test runner's
`JWT_HMAC_SIGNING_KEY`.

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function pathWithDockerStub(stamp: string): string {
    const dir = mkdtempSync(
        join(tmpdir(), 'fusion-docker-stub-'),
    );
    writeFileSync(
        join(dir, 'docker'),
        '#!/bin/bash\n'
        + `printf x >> "${stamp}"\n`
        + 'exit 99\n',
        { mode: 0o755 },
    );
    return `${dir}:${process.env['PATH'] ?? ''}`;
}

function runServe(
    args: string[],
    extraEnv: NodeJS.ProcessEnv = {},
): ReturnType<typeof spawnSync> {
    const stamp = join(
        mkdtempSync(join(tmpdir(), 'fusion-stamp-')),
        'called',
    );
    const result = spawnSync('./serve', args, {
        encoding: 'utf8',
        timeout: 4000,
        env: {
            PATH: pathWithDockerStub(stamp),
            HOME: process.env['HOME'] ?? '',
            TMPDIR: process.env['TMPDIR'] ?? '/tmp',
            ...extraEnv,
        },
    });
    return Object.assign(result, { stamp });
}

test('serve with no args exits 1 with usage', () => {
    const result = runServe([]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/serve/);
    assert.equal(
        existsSync(result.stamp) &&
            readFileSync(result.stamp, 'utf8')
                .length > 0,
        false,
    );
});

test('serve missing port exits 1 with usage', () => {
    const result = runServe(['bundle/']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/serve/);
});

test('serve dir without trailing slash exits 1',
() => {
    const result = runServe(['bundle', '8080']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/serve/);
});

test('serve --help exits 0', () => {
    const result = runServe(['--help']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: \.\/serve/);
});

test('serve missing POSTGRES_URL exits 1', () => {
    const result = runServe(['bundle/', '8080']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /POSTGRES_URL/);
});

test('serve missing JWT exits 1', () => {
    const result = runServe(['bundle/', '8080'], {
        POSTGRES_URL: 'postgres://fusion@127.0.0.1/x',
    });
    assert.equal(result.status, 1);
    assert.match(
        result.stderr,
        /JWT_HMAC_SIGNING_KEY/,
    );
});

test('serve does not invoke ./build', () => {
    const src = readFileSync('serve', 'utf8');
    assert.doesNotMatch(src, /\.\/build/);
    assert.match(src, /node server\.mjs/);
    assert.doesNotMatch(src, /DEFAULT_PORT/);
    assert.doesNotMatch(src, /mktemp/);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```bash
TZ=UTC node --strip-types --test \
    tests/serve-cli.test.ts
```

Expected: FAIL — current `./serve [port]` defaults
the port, calls `./build`, and has no `--help`.

- [ ] **Step 3: Rewrite `serve`**

Replace `serve` in full. Keep mode 100755.
`--help` to stdout exit 0; errors to stderr
exit 1. No default port. No `mktemp`. No
`./build`. No bundle trap.

```bash
#!/bin/bash
set -euo pipefail

usage() {
    cat <<'USAGE'
Usage: ./serve dir/ port
  dir/   Bundle directory (trailing / required)
  port   HTTP_SERVER_PORT (required; no default)
  Requires POSTGRES_URL and JWT_HMAC_SIGNING_KEY.
USAGE
}

if [ $# -eq 1 ] && { [ "$1" = "--help" ] \
    || [ "$1" = "-h" ]; }; then
    usage
    exit 0
fi

if [ $# -ne 2 ]; then
    usage >&2
    exit 1
fi

DIR="$1"
PORT="$2"

case "$DIR" in
    */)
        ;;
    *)
        echo "Error: dir/ requires a trailing /" >&2
        usage >&2
        exit 1
        ;;
esac

if [ -z "${POSTGRES_URL:-}" ]; then
    echo "Error: missing required env POSTGRES_URL" >&2
    exit 1
fi
if [ -z "${JWT_HMAC_SIGNING_KEY:-}" ]; then
    echo "Error: missing required env" \
        "JWT_HMAC_SIGNING_KEY" >&2
    exit 1
fi

export HTTP_SERVER_PORT="$PORT"

echo
echo "Serving on http://localhost:$PORT/"
cd "$DIR" && exec node server.mjs
```

`exec` is correct here: serve is not the glue
and does not own Docker or a temp bundle.
Crank (Task C) must NOT exec serve — crank
owns the trap.

Do not log `POSTGRES_URL` or
`JWT_HMAC_SIGNING_KEY`.

- [ ] **Step 4: Re-run the tests and confirm they pass**

Run:

```bash
TZ=UTC node --strip-types --test \
    tests/serve-cli.test.ts
```

Expected: PASS. Every case returns before
`node server.mjs` (no `server.mjs` in `bundle/`).

- [ ] **Step 5: Stop. Do not commit.**

Orchestrator commit after Wave 0 joins:

```
Make serve listen without building
```

---

### Task B: Name crank in the no-zip help

**Wave:** 0
**Depends on:** nothing
**Files:**
- Modify: `build`
- Modify: `tests/server-zip-metafile.test.ts`

- [ ] **Step 1: Write the failing help pin**

Append to `tests/server-zip-metafile.test.ts`
(keep the existing tests). `BUILD_SCRIPT` is
already `readFileSync('build', 'utf8')`.

```typescript
test('build --no-zip help names crank', () => {
    assert.match(
        BUILD_SCRIPT,
        /server-core \+ server\.mjs — for \.\/crank/,
    );
    assert.doesNotMatch(
        BUILD_SCRIPT,
        /for \.\/serve/,
    );
});
```

- [ ] **Step 2: Run the pin and confirm it fails**

Run:

```bash
TZ=UTC node --strip-types --test \
    tests/server-zip-metafile.test.ts
```

Expected: FAIL — help still says `for ./serve`.

- [ ] **Step 3: Change one help line in `build`**

In the `usage()` heredoc, replace

```
             (server-core + server.mjs — for ./serve)
```

with

```
             (server-core + server.mjs — for ./crank)
```

Do not change compose, dest, or emit behavior.

- [ ] **Step 4: Re-run the pin and confirm it passes**

Run:

```bash
TZ=UTC node --strip-types --test \
    tests/server-zip-metafile.test.ts
```

Expected: PASS (existing ZIP/metafile pins still
green).

- [ ] **Step 5: Stop. Do not commit.**

Orchestrator commit after Wave 0 joins:

```
Name crank in the no-zip help
```

---

### Task C: Add crank to own the local stack

**Wave:** 1
**Depends on:** V (validate is free), S (serve
signature is `dir/ port`)
**Files:**
- Create: `crank` (mode 100755)
- Create: `tests/crank-cli.test.ts`
- Modify: `validate` (add `crank` to the awk list)
- Modify: `tests/validate-lint.test.ts` (pin crank)

- [ ] **Step 1: Write the failing argv and source pins**

Create `tests/crank-cli.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function pathWithDockerStub(stamp: string): string {
    const dir = mkdtempSync(
        join(tmpdir(), 'fusion-docker-stub-'),
    );
    writeFileSync(
        join(dir, 'docker'),
        '#!/bin/bash\n'
        + `printf x >> "${stamp}"\n`
        + 'exit 99\n',
        { mode: 0o755 },
    );
    return `${dir}:${process.env['PATH'] ?? ''}`;
}

function runCrank(
    args: string[],
): ReturnType<typeof spawnSync> {
    const stamp = join(
        mkdtempSync(join(tmpdir(), 'fusion-stamp-')),
        'called',
    );
    const result = spawnSync('./crank', args, {
        encoding: 'utf8',
        timeout: 4000,
        env: {
            PATH: pathWithDockerStub(stamp),
            HOME: process.env['HOME'] ?? '',
            TMPDIR: process.env['TMPDIR'] ?? '/tmp',
        },
    });
    return Object.assign(result, { stamp });
}

function dockerCalled(stamp: string): boolean {
    return existsSync(stamp)
        && readFileSync(stamp, 'utf8').length > 0;
}

test('crank with no args exits 1 with usage', () => {
    const result = runCrank([]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/crank/);
    assert.equal(dockerCalled(result.stamp), false);
});

test('crank missing port exits 1 with usage', () => {
    const result = runCrank(['--mock-data']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/crank/);
    assert.equal(dockerCalled(result.stamp), false);
});

test('crank missing mode exits 1 with usage', () => {
    const result = runCrank(['8080']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/crank/);
    assert.equal(dockerCalled(result.stamp), false);
});

test('crank two modes exits 1 with usage', () => {
    const result = runCrank([
        '--mock-data',
        '--bootstrap',
        '8080',
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/crank/);
    assert.match(result.stderr, /exclusive/);
    assert.equal(dockerCalled(result.stamp), false);
});

test('crank unknown flag exits 1 with usage', () => {
    const result = runCrank(['--bogus', '8080']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: \.\/crank/);
    assert.equal(dockerCalled(result.stamp), false);
});

test('crank --help exits 0', () => {
    const result = runCrank(['--help']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: \.\/crank/);
    assert.equal(dockerCalled(result.stamp), false);
});

test('crank source owns the local stack', () => {
    const src = readFileSync('crank', 'utf8');
    assert.match(src, /\.\/validate/);
    assert.match(
        src,
        /docker compose up -d --wait postgres/,
    );
    assert.match(src, /\.\/test-postgres/);
    assert.match(src, /\.\/build --no-zip/);
    assert.match(
        src,
        /\.\/postgres-wipe --postgres local/,
    );
    assert.match(
        src,
        /\.\/postgres-seed --postgres local/,
    );
    assert.match(src, /\.\/serve /);
    assert.doesNotMatch(
        src,
        /docker compose up -d --wait["\n]*$/,
    );
    assert.doesNotMatch(src, /echo \$POSTGRES_URL/);
    assert.doesNotMatch(
        src,
        /echo \$POSTGRES_PASSWORD/,
    );
    assert.doesNotMatch(
        src,
        /echo \$JWT_HMAC_SIGNING_KEY/,
    );
    const trapAt = src.indexOf('trap ');
    const upAt = src.indexOf(
        'docker compose up -d --wait postgres',
    );
    assert.ok(trapAt >= 0, 'trap missing');
    assert.ok(upAt >= 0, 'compose up missing');
    assert.ok(trapAt < upAt, 'trap after Docker');
});
```

Append to `tests/validate-lint.test.ts`:

```typescript
test('validate lints crank', () => {
    assert.match(
        longLineBlock(VALIDATE),
        /\bcrank\b/,
    );
});
```

`VALIDATE` is read at import time — after
`validate` is edited, the same test process
that already imported the old source would
see the old string. That is fine: each
`node --test` run is a fresh process. Do
not cache across files.

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```bash
TZ=UTC node --strip-types --test \
    tests/crank-cli.test.ts \
    tests/validate-lint.test.ts
```

Expected: FAIL — `./crank` missing (`ENOENT` or
`does not provide`); validate-lint's new pin
fails because the awk list has no `crank`. The
Wave 0 pin `validate does not lint root
markdown` still PASSes.

- [ ] **Step 3: Write `crank` and chmod +x**

Create `crank`. Then `chmod +x crank` so git
records `100755`.

Parse argv first. `--help` / `-h` → usage
stdout, exit 0, nothing started. Missing mode,
two modes, missing port, unknown flag → usage
stderr, exit 1, nothing started. Exactly one
of `--bootstrap` / `--mock-data` /
`--test-plan-slices`, same exclusivity copy
as `./postgres-seed`. Port is required. No
default.

Then `./validate`. Red aborts. No Docker, no
temp dir, no trap yet.

Then mint:

```bash
POSTGRES_PASSWORD="$(openssl rand -hex 16)"
JWT_HMAC_SIGNING_KEY="$(openssl rand -hex 32)"
export POSTGRES_PASSWORD
export JWT_HMAC_SIGNING_KEY
export HTTP_SERVER_PORT="$PORT"
export POSTGRES_URL="postgres://fusion:${POSTGRES_PASSWORD}@127.0.0.1:5432/fusion"
```

Hex is URL-safe; do not echo these. Compose
interpolates `JWT_HMAC_SIGNING_KEY` for the
unstarted `server` service when it loads
`compose.yaml`, so JWT must be exported
before `docker compose up` even though crank
does not start `server`.

Then install the trap **before** Docker:

```bash
BUILD_DIR=""
SERVE_PID=""
CLEANED=""

cleanup() {
    if [ -n "${CLEANED:-}" ]; then
        return
    fi
    CLEANED=1
    if [ -n "${SERVE_PID:-}" ]; then
        kill "$SERVE_PID" 2>/dev/null || true
        wait "$SERVE_PID" 2>/dev/null || true
    fi
    docker compose down --remove-orphans || true
    if [ -n "${BUILD_DIR:-}" ]; then
        rm -rf "$BUILD_DIR"
    fi
}
trap cleanup EXIT INT TERM
```

`|| true` on `compose down` so a never-started
stack does not fail the trap. Do not
`docker rmi`. Do not delete `~/Desktop` ZIPs.

Then, in order:

```bash
docker compose up -d --wait postgres
./test-postgres
BUILD_DIR="$(mktemp -d \
    "${TMPDIR:-/tmp}/fusion-crank.XXXXXX")"
./build --no-zip "${BUILD_DIR}/"
./postgres-wipe --postgres local
./postgres-seed --postgres local "$MODE"
./serve "${BUILD_DIR}/" "$PORT" &
SERVE_PID=$!
wait "$SERVE_PID"
```

Do **not** `exec ./serve` — the trap must run.
Do **not** start the compose `server` service.
Seed's stdout is the only credential reveal;
crank must not redirect it away. Listen
stdout still has no passwords.

Full script:

```bash
#!/bin/bash
set -euo pipefail

usage() {
    cat <<'USAGE'
Usage: ./crank --mock-data|--test-plan-slices|--bootstrap port
USAGE
}

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

BOOTSTRAP=false
MOCK_DATA=false
TEST_PLAN_SLICES=false
PORT=""

while [ $# -gt 0 ]; do
    case "$1" in
        --help|-h)
            usage
            exit 0
            ;;
        --bootstrap)
            BOOTSTRAP=true
            shift
            ;;
        --mock-data)
            MOCK_DATA=true
            shift
            ;;
        --test-plan-slices)
            TEST_PLAN_SLICES=true
            shift
            ;;
        -*)
            echo "Error: unknown argument: $1" >&2
            usage >&2
            exit 1
            ;;
        *)
            if [ -n "$PORT" ]; then
                echo "Error: unexpected argument:" \
                    "$1" >&2
                usage >&2
                exit 1
            fi
            PORT="$1"
            shift
            ;;
    esac
done

MODE_COUNT=0
if [ "$BOOTSTRAP" = true ]; then
    MODE_COUNT=$((MODE_COUNT + 1))
fi
if [ "$MOCK_DATA" = true ]; then
    MODE_COUNT=$((MODE_COUNT + 1))
fi
if [ "$TEST_PLAN_SLICES" = true ]; then
    MODE_COUNT=$((MODE_COUNT + 1))
fi

if [ "$MODE_COUNT" -gt 1 ]; then
    echo "Error: --bootstrap, --mock-data, and" \
        "--test-plan-slices are exclusive" >&2
    usage >&2
    exit 1
fi

if [ "$MODE_COUNT" -eq 0 ]; then
    echo "Error: exactly one of --bootstrap," \
        "--mock-data, or --test-plan-slices" \
        "is required" >&2
    usage >&2
    exit 1
fi

if [ -z "$PORT" ]; then
    echo "Error: port is required" >&2
    usage >&2
    exit 1
fi

if [ "$BOOTSTRAP" = true ]; then
    MODE='--bootstrap'
elif [ "$MOCK_DATA" = true ]; then
    MODE='--mock-data'
else
    MODE='--test-plan-slices'
fi

./validate

POSTGRES_PASSWORD="$(openssl rand -hex 16)"
JWT_HMAC_SIGNING_KEY="$(openssl rand -hex 32)"
export POSTGRES_PASSWORD
export JWT_HMAC_SIGNING_KEY
export HTTP_SERVER_PORT="$PORT"
export POSTGRES_URL="postgres://fusion:${POSTGRES_PASSWORD}@127.0.0.1:5432/fusion"

BUILD_DIR=""
SERVE_PID=""
CLEANED=""

cleanup() {
    if [ -n "${CLEANED:-}" ]; then
        return
    fi
    CLEANED=1
    if [ -n "${SERVE_PID:-}" ]; then
        kill "$SERVE_PID" 2>/dev/null || true
        wait "$SERVE_PID" 2>/dev/null || true
    fi
    docker compose down --remove-orphans || true
    if [ -n "${BUILD_DIR:-}" ]; then
        rm -rf "$BUILD_DIR"
    fi
}
trap cleanup EXIT INT TERM

docker compose up -d --wait postgres
./test-postgres
BUILD_DIR="$(mktemp -d \
    "${TMPDIR:-/tmp}/fusion-crank.XXXXXX")"
./build --no-zip "${BUILD_DIR}/"
./postgres-wipe --postgres local
./postgres-seed --postgres local "$MODE"
./serve "${BUILD_DIR}/" "$PORT" &
SERVE_PID=$!
wait "$SERVE_PID"
```

Every line in this file must be ≤ 78 characters
except the usage heredoc line if it must name
the three flags on one usage line — wrap usage
if needed:

```
Usage: ./crank --mock-data|--test-plan-slices|--bootstrap port
```

is 67 characters. Fine.

- [ ] **Step 4: Add `crank` to the validate awk list**

In `validate`, change the root-script awk to:

```bash
    awk "$AWK_LINT" build serve test test-postgres \
        validate generate-schema-svg \
        generate-api-documentation measure \
        postgres-wipe postgres-lib postgres-seed \
        crank \
        Dockerfile compose.yaml .dockerignore
```

- [ ] **Step 5: Re-run the tests and confirm they pass**

Run:

```bash
TZ=UTC node --strip-types --test \
    tests/crank-cli.test.ts \
    tests/validate-lint.test.ts \
    tests/serve-cli.test.ts
```

Expected: PASS. Argv cases return before
`./validate` and before Docker (timeout 4s
would fail if validate ran). `--help` and
usage errors must not call `./validate`.

If an argv-error test hangs or runs tsc, the
script is parsing after work — fix parse so
usage returns first.

- [ ] **Step 6: Stop. Do not commit.**

Orchestrator: `git add --chmod=+x crank` if
the index would otherwise record a non-
executable. Commit:

```
Add crank to own the local stack
```

---

### Task A: Document crank in the command list

**Wave:** 2
**Depends on:** C (`./crank` exists)
**Files:**
- Modify: `AGENTS.md`

Stay under the `AGENTS.md 300` line-count
ceiling (today 243).

- [ ] **Step 1: Replace the command block**

In the opening fence, replace

```
./serve [port]         # Build + node server.mjs (default 8080)
```

with

```
./crank --mock-data|--test-plan-slices|--bootstrap port
./serve dir/ port      # node server.mjs from dir/ (no build)
```

Leave `./postgres-seed`, `./postgres-wipe`,
`docker compose`, and `./measure` lines as they
are. `docker compose up --wait` still documents
the compose file's full stack (postgres +
server); crank does not start `server`. Do not
rewrite that compose line into a postgres-only
up — that investigation lives in TODO.md.

- [ ] **Step 2: Replace the clean-tree and env notes**

Replace

```
**Commit before building.** `./build` and `./serve`
(which runs `./build`) require a clean working directory.
Run `./validate` to catch type errors and lint issues;
commit; then build or serve.

`./serve` and a local `./measure` sweep need
`POSTGRES_URL` and `JWT_HMAC_SIGNING_KEY`. `./serve`
[port] is `HTTP_SERVER_PORT`.
```

with

```
**Commit before building.** `./build` and `./crank`
require a clean working directory.
Run `./validate` to catch type errors and lint issues;
commit; then build or crank.

`./serve` and a local `./measure` sweep need
`POSTGRES_URL` and `JWT_HMAC_SIGNING_KEY` already
set. `./serve dir/ port` sets `HTTP_SERVER_PORT`
from `port`. `./crank` mints those for its children.
```

- [ ] **Step 3: Move the TMPDIR sandbox note to crank**

Replace

```bash
TMPDIR=/tmp/claude ./serve 8080
# open http://localhost:8080/landing/index.html
```

and the sentence that `TMPDIR` redirects
`./serve`'s temp build dir, with:

```bash
TMPDIR=/tmp/claude ./crank --mock-data 8080
# open http://localhost:8080/landing/index.html
```

```
`TMPDIR=/tmp/claude` redirects `./crank`'s temp
bundle into the sandbox-allowed path.
`localhost` is reachable from the sandbox, so the
Chrome MCP tools can drive the page normally.
```

- [ ] **Step 4: Gates — 78-character lint is not markdown**

In `## Gates`, replace "78-character lint" so
the paragraph names code and scripts, not `.md`.
Keep tsc, `./test` TZ passes, `org` ban,
`generate-schema-svg --check`,
`generate-api-documentation --check`. Keep
"Clean tree for `./build` and `./measure`."
Add `./crank` next to `./build` as a clean-tree
consumer.

Replace

```
78-character lint, the `org` identifier ban under `api/`,
`web-app/`, `tests/`, and `shared/`, then
```

with

```
78-character lint of code and scripts (not `.md`),
the `org` identifier ban under `api/`,
`web-app/`, `tests/`, and `shared/`, then
```

and in the TEST-PLAN abort paragraph, keep
"line-length lint" as the code/scripts lint.

Replace

```
Clean tree for
`./build` and `./measure`.
```

with

```
Clean tree for
`./build`, `./crank`, and `./measure`.
```

- [ ] **Step 5: Subagent voice rules**

Replace

```
- **Voice rules.** 78-char max line, 4-space indent, no
  inline styles (use CSS custom properties + classes per
  DESIGN-SYSTEM.md), present-tense imperative
  commit messages, Co-Authored-By trailer.
```

with

```
- **Voice rules.** 78-char max line in files
  `./validate` still lints, 4-space indent, no
  inline styles (use CSS custom properties + classes per
  DESIGN-SYSTEM.md), present-tense imperative
  commit messages, Co-Authored-By trailer.
```

Do not rewrite DESIGN-SYSTEM.md. Its "78-char
max" on CSS files is code lint and stays.

Do not mention `./serve` as a builder anywhere
left in this file. Confirm with:

```bash
grep -n 'serve' AGENTS.md
```

Expected: command list `./serve dir/ port`,
env note that serve needs secrets already set,
no "serve builds", no `./serve [port]`, no
TMPDIR on serve.

- [ ] **Step 6: Stop. Do not commit.**

Orchestrator: `wc -l AGENTS.md` must be ≤ 300.
Commit:

```
Document crank in the command list
```

---

### Task T: Fold A3 and AT into crank

**Wave:** 2
**Depends on:** C (`./crank` exists)
**Files:**
- Modify: `TEST-PLAN.md`

Do not rewrite historical `docs/superpowers/`
specs or plans. Do not flip checkboxes.

- [ ] **Step 1: Rewrite `### How to invoke`**

Replace the env-by-hand sentence and the
numbered master list so the master does **not**
run AT and then crank. Cookie-jar warning stays.
A1 and A2 stay ZIP inventory before crank.

The opening becomes:

```
### How to invoke

Beware the use of parallelism due to the single
cookie-jar. Use a fresh local Postgres via Docker.
Do not set `POSTGRES_URL`, `JWT_HMAC_SIGNING_KEY`,
or `HTTP_SERVER_PORT` by hand — `./crank` mints
them for its children and never prints them.

When the user says "run the test plan", the master
session:

1. Reads this document's `### Protocol` — required
   context. Default is the section DAG below.
2. Executes **A1** and **A2** (ZIP inventory) so
   the tree is already clean for crank's
   `./build --no-zip`.
3. Starts `./crank --test-plan-slices port`
   (serial: `./crank --mock-data port`) as the
   origin. Crank runs `./validate` (AT1–AT3),
   mints secrets, brings postgres up, runs
   `./test-postgres` (AT4), builds `--no-zip`
   into a temp dir, wipes, seeds, and listens.
   Read the seed reveal from crank's stdout.
   Red validate aborts with no Docker. Red AT4
   or later hits the trap.
4. Grants Chrome origin `http://localhost`
   **before** dispatch.
5. Parallel: this MCP has no isolated
   contexts — one Chrome profile, one
   cookie jar, one selected page. One
   hunter per `parallel: yes` section
   (14), each with that section's `##`
   body only and that slice's
   credentials. The master dispatches
   them **one at a time**, joining each
   before the next. Each hunter begins
   by deleting site data for the origin
   so the shared jar carries no previous
   hunter's refresh cookie. The CLI belt
   is the parallel layer. Serial: one
   tenant, document order, headers not
   consulted.
6. Joins in document order. Then K8 (process lock),
   then J. Stopping crank IS J1 and J2
   (EXIT trap). J3 stays (Desktop ZIP remains).
   Then the canonical `## Summary Format` plus
   one mitigation-spec path per FAIL cluster. The
   master does not patch FAILs and does not
   re-dispatch.
```

Keep the paragraphs after the list
("This document is the complete regression
contract…" through "Sandbox EPERM on `kill` is
not BLOCKED: J1 uses the harness task stop.")
except J1 now stops **crank**, not a bare
`server.mjs`. Change "J1 uses the harness
task stop" to name crank.

- [ ] **Step 2: Rewrite Protocol serial / parallel A3**

Replace the two bullets that spell wipe/seed/
`node server.mjs` so they name crank. A1–A2
stay. Grant Chrome before hunters stays.

Serial bullet A3 clause becomes
`./crank --mock-data port` (this pin **is**
SV1). Keep the rest of the serial rules
(one process, one mock tenant, one cookie
jar, K8 inside K, J, no garden rows).

Parallel bullet A3 clause becomes
`./crank --test-plan-slices port`. Capture
the stdout credential map. Keep hunter
serialization, stolen-tab rule, K8, J.

DAG edges: drop `AT → A` as a master step.
AT lives inside crank. Keep

```
- `A` → every `parallel: yes` section
- those → `global_lock: process` (K8, then J)
```

Failure table: `AT red` still aborts (crank
exits before Docker). `A3 seed fail` still
aborts. `J1 stop fails` still defers J2 if
the origin is still up.

- [ ] **Step 3: Known MCP J1 / J2**

Replace the `kill` syscall bullet so J1 stops
the **crank** process A3 started (harness-
native task stop, not `kill`). PASS when
that process exits; the trap stops serve,
downs compose, removes the temp bundle.

Replace the Phase 5 J2 bullet: J2 is the
trap's `rm -rf` of crank's temp bundle,
verified after crank has exited. J2 is
DEFERRED only when crank/serve is still up.
Do not `rm` a still-running bundle.

- [ ] **Step 4: AT preamble and AT3 awk text**

In `## AT. Automated Test Suite`, replace the
paragraph that says AT4 is additional and
before A1. New voice:

```
The automated layer is crank's gate, not a
master step before A1. AT1–AT3 are crank's one
`./validate`. AT4 is crank step 6
(`./test-postgres` after postgres is up). How
to invoke does not run AT and then crank.
Abort on any AT red.
```

Keep the four case bodies. In **AT3**, drop
"the root `.md` files except `TEST-PLAN.md`"
from the awk description. Add `crank` to the
root-scripts list next to `serve`. Keep
`api/`, `web-app/`, `tests/`, `shared/`,
`server/` `*.ts|html|css` with `compose.ts`
exempt, org-abbreviation lint, schema-svg
check, api-documentation check.

In **AT4**, replace "With `POSTGRES_URL` set
(A3 requires it)" / "before A1" with: crank
sets `POSTGRES_URL` and runs `./test-postgres`
after postgres is up and before
`./build --no-zip`. PASS: exits 0, `fail 0`.
`./validate` stays Postgres-free.

- [ ] **Step 5: Rewrite A3**

Replace the **A3** case so A3 **is** crank.
PASS: process listens; seed stdout has the
reveal (serial: mock humans; parallel:
14-slice TSV); listen stdout still has no
passwords.

```
- [ ] **A3** `./crank --mock-data port` (serial)
  or `./crank --test-plan-slices port`
  (parallel). Crank validates, mints secrets,
  starts postgres only, runs `./test-postgres`,
  `./build --no-zip` into a temp dir, wipes,
  seeds, and listens. Empty is the wipe step,
  not a human prerequisite. Secrets never
  print (seed's one-shot stdout is the only
  reveal).

  - **Serial (`--serial`):**
    `./crank --mock-data port`.
    PASS: process listens; seed stdout
    prints `Save your demo sign-ins —
    shown once; copy them now.` plus
    one `username<TAB>password` line
    per seeded human (including
    `demo@example.com` and
    `sarah.chen@company.com`); listen
    stdout has no passwords; seed does
    not travel over HTTP. This pin
    **is** SV1.
  - **Parallel (default):**
    `./crank --test-plan-slices port`.
    PASS: process listens; seed stdout
    prints the same reveal header plus
    TSV `section<TAB>field<TAB>value`
    rows covering all 14 parallel
    sections (AA's admin is
    `demo@example.com`; B names
    `seat_*` and `flow_id`; F2 names
    `flow_id`; G names
    `org2_*`, `unseated_*`,
    `member_*`, `erasable_*`;
    SV names `seat_*`);
    listen stdout has no passwords;
    seed does not travel over HTTP. If
    a section cannot run from its
    minimum fixtures, A3 FAIL — do not
    dispatch hunters. This pin **is**
    SV1 on the parallel path (listen +
    stdout reveal); the SV hunter
    skips SV1.
```

Keep **A1** and **A2** verbatim (ZIP
inventory). Keep **A4** / **A5**.

- [ ] **Step 6: Rewrite J1 / J2**

```
- [ ] **J1** Stop the `./crank` process started
  in A3 via the harness-native task stop (not
  `kill`). PASS: process terminates; the trap
  stopped `./serve`. Sandbox EPERM on `kill`
  is not a reason to mark this BLOCKED.
- [ ] **J2** After J1 PASS, verify crank's temp
  bundle is gone (trap `rm -rf`). PASS:
  directory removed. DEFERRED only if crank
  is still up.
- [ ] **J3** Verify the ZIP file remains on
  `~/Desktop` for archival. PASS:
  `fusion-angle-server-${SHA}.zip` exists.
```

- [ ] **Step 7: SV operator prerequisites**

Replace the bullets that tell the operator to
set env by hand and to wipe/seed/`node
server.mjs`. New voice: A3 is crank; the SV
hunter still skips SV1 and does not re-seed;
credentials print once on stdout; one mint
process. Do not tell SV to mint env.

Keep SV1 "Satisfied by A3". Keep SV2–SV10.

- [ ] **Step 8: Grep leftovers**

```bash
grep -n 'set the env\|by hand\|./serve \[port\]' \
    TEST-PLAN.md
grep -n 'node server.mjs' TEST-PLAN.md
```

How to invoke, Protocol, A3, J, and SV
operator prerequisites must not tell the
master to mint env or to start
`node server.mjs` beside crank. Mentions of
`node server.mjs` inside product-behavior
cases (what the origin *is*) may stay.
`server.mjs` as the process inside the
bundle is still true.

- [ ] **Step 9: Stop. Do not commit.**

Orchestrator commit:

```
Fold A3 and AT into crank
```

---

## Orchestrator wave checklist

After Wave 0 join, before commits:

```bash
TZ=UTC node --strip-types --test \
    tests/validate-lint.test.ts \
    tests/serve-cli.test.ts \
    tests/server-zip-metafile.test.ts
./validate
```

Commits: V, S, B (paths named in those tasks
only).

After Wave 1 join:

```bash
TZ=UTC node --strip-types --test \
    tests/crank-cli.test.ts \
    tests/validate-lint.test.ts \
    tests/serve-cli.test.ts
git ls-files -s crank   # expect 100755
./validate
```

Commit: C. Confirm `crank` never prints
`POSTGRES_URL` / `POSTGRES_PASSWORD` /
`JWT_HMAC_SIGNING_KEY` (source pin already
asserts). Confirm `compose.yaml` is untouched.

After Wave 2 join:

```bash
grep -n 'TMPDIR' AGENTS.md   # crank, not serve
./validate                   # AGENTS.md ≤ 300
```

Commits: A, T.

Do not run full crank in this plan's
verification. Full crank is TEST-PLAN How to
invoke.

---

## Spec coverage

| Spec section | Task |
|---|---|
| Command `./crank … port` | C |
| Command `./serve dir/ port` | S |
| `./build --no-zip` help names crank | B |
| Sequence 1 argv | C tests |
| Sequence 2 `./validate` once | C |
| Sequence 3 mint, never log | C |
| Sequence 4 trap before Docker | C |
| Sequence 5 postgres only | C |
| Sequence 6 `./test-postgres` | C |
| Sequence 7 `./build --no-zip` temp | C |
| Sequence 8 wipe then seed | C |
| Sequence 9 serve blocks | C |
| Sequence 10 trap cleanup | C |
| TEST-PLAN How to invoke / A3 / AT / J | T |
| Tests argv + serve source pin | S, C |
| AGENTS.md command list, TMPDIR, Gates | A |
| Markdown is not a 78-character gate | V, A, T |
| DESIGN-SYSTEM CSS 78-char stays | (no edit) |
| No historical spec/plan rewrite | (no edit) |
| No compose `server` change | (no edit) |
| No `docker rmi`, no A1 ZIP delete | C trap |
| Out of scope: postgres-only compose | TODO.md already |

---

## Type consistency

- Serve usage: `./serve dir/ port`
- Crank usage: `./crank --mock-data|--test-plan-slices|--bootstrap port`
- Mode flags: `--bootstrap`, `--mock-data`,
  `--test-plan-slices` (same names as
  `./postgres-seed`)
- Temp dir prefix: `fusion-crank.`
- Compose service started: `postgres`
- Trap signals: EXIT, INT, TERM
- Serve does not call `./build`
- Crank does not `exec` serve

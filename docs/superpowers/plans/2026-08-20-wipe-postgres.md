# Wipe Postgres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Every dispatched subagent prompt MUST begin
> with `Go to Medium Church!` (CLAUDE.md scroll policy).
> Do not use git worktrees. Wrap lines at 78 characters.
> 4-space indent. Present-tense imperative commits with
> `Co-Authored-By: Grok 4.6 <grok@x.ai>`.
> **No new test file** — the spec forbids one (`./serve`
> and `./build` have none). Do not add
> `tests/wipe-postgres.test.ts`. Verify with `./validate`
> after every commit and the Task 5 offline matrix.

**Goal:** One root script, `./wipe-postgres`, empties
either the Render Postgres or the workstation
`POSTGRES_URL` database and seeds it again
(`--pristine` or `--mockdata`).

**Architecture:** Rename the existing Render gun, then
teach it a required `--postgres render|local` flag with
no default. `render` keeps the 2026-08-19 HTTP ceremony
byte-identical in effect. `local` runs the same
`WIPE_START` string under `bash -c`, then
`./build --no-zip` plus `node server.mjs` with the
seed flag — the rite `measure.ts` already uses. One
`print_credential_table` that reads text lines serves
both paths. No Docker. No new TypeScript. No new test
file.

**Tech Stack:** `#!/bin/bash`, `set -euo pipefail`,
`curl` (render only), Node (`postgres` from
`node_modules`, `node:net` for a free port, JSON
parse). No `jq`. No `docker` binary.

**Spec:**
`docs/superpowers/specs/2026-08-20-wipe-postgres-design.md`

The 2026-08-19 spec and plan remain the record of the
Render-only shape. Do not edit them.

---

## Subagent execution (efficiency)

Four commits all mutate the same script. Implementers
MUST be serial. Parallel implementers will clobber
each other. Do not use worktrees. Do not tell a
subagent to read this plan file — paste the full
task text into the prompt.

**Allowed parallelism:** none across Tasks 1–4.
Spec review, then quality review, then the next
implementer. Spec review before quality review.

**Per task:**

1. Dispatch one `general-purpose` implementer with
   the full task text, the scene, and the pins below.
   Prompt starts with `Go to Medium Church!`.
2. On `DONE`, dispatch a spec reviewer (read-only)
   with the task requirements and the diff.
3. On spec ✅, dispatch a code-quality reviewer.
4. Fix loops: re-dispatch an implementer with the
   findings; re-review until both ✅.
5. Mark the task complete. Next task.

**Models:**

| Task | Role | Why |
| --- | --- | --- |
| 1 | fast | `git mv` + string replace |
| 2 | standard | Node snippet refactor |
| 3 | standard | argv parser, render-only |
| 4 | most capable | local ceremony + process |
| 5 | orchestrator | env + secrets; no subagent |

**Every implementer prompt also carries:**

- Voice: 78-char max, 4-space indent, no inline
  styles (N/A), present-tense imperative commit,
  `Co-Authored-By: Grok 4.6 <grok@x.ai>`.
- Commandments touched: Reliability, Uniformity,
  Idempotency, Generality, Atomicity (trap releases
  TMP and the seed child).
- Abominations to refuse: Default Values (no
  `--postgres` default), Unbidden Helper Code (no
  extra files, no Docker, no prompt), Swallowed
  Failures, Resource Abandonment, Magical Values
  (keep named `POLL_SEC` / `REVEAL_TIMEOUT_SEC`).
- Patterns: match the existing bash voice
  (`echo "Error: …" \` wrapped lines, Node
  `--input-type=module` snippets). HTTP-verb
  adapter naming is N/A. Never log, echo, or write
  `TOKEN`, `POSTGRES_URL`, or
  `JWT_HMAC_SIGNING_KEY`.
- `./validate` must pass before the commit.
- Work on this checkout. No worktree. No branch.

---

## Do not touch

- The Render ceremony's HTTP steps, start commands,
  poll intervals, or revoke warning
- `WIPE_START`'s four DROP statements (same string
  both launchers)
- `README.md`
- `docs/superpowers/specs/2026-08-19-wipe-render-postgres-design.md`
- `docs/superpowers/plans/2026-08-19-wipe-render-postgres.md`
- `tests/pg-seed.test.ts`
- Any new test file
- A confirmation prompt or `--confirm`
- A `--postgres` default
- Docker, compose files, container names, liveness
  checks
- Logging, echoing, or writing `TOKEN`,
  `POSTGRES_URL`, or `JWT_HMAC_SIGNING_KEY`
- `./build`, `render-out/`, the live start command
- The Postgres IP allow-list

---

## File map

### Rename

- `wipe-render-postgres` → `wipe-postgres`
  (Task 1: `git mv` so the commit is a rename)

### Modify

- `wipe-postgres` — usage (Task 1), text-line
  reveal parse (Task 2), `--postgres render`
  (Task 3), `--postgres local` (Task 4)
- `validate` — awk list name (Task 1)
- `tests/fusion-angle-live-name.test.ts` —
  `ROOT_FILES` entry (Task 1)
- `CLAUDE.md` — command-list name + validate
  paragraph (Task 1); two command-list lines
  (Task 4)

### Do not create

- `tests/wipe-postgres.test.ts`
- Any file under `render-out/` or the ZIP

---

## Pins (all tasks)

**Reveal header** (byte-identical, em dash U+2014):

```
Save your demo sign-ins — shown once; copy them now.
```

**Constants already in the script (do not rename):**
`API`, `WIPE_TIMEOUT_SEC=120`,
`REVEAL_TIMEOUT_SEC=180`, `POLL_SEC=5`,
`REVEAL_HEADER`, `DASHBOARD_KEYS`.

**`print_credential_table` exit codes (stand):**
10 header absent; 11 header present, no pair rows.

**Loopback hostnames** (Node `URL.hostname`, exact):
`localhost`, `127.0.0.1`, `[::1]`.

**Commit subjects (exact, no body beyond trailer):**

1. `Rename wipe-render-postgres to wipe-postgres`
2. `Parse the reveal from text lines`
3. `Require --postgres render in wipe-postgres`
4. `Add --postgres local to wipe-postgres`

**Trailer on every commit:**

```
Co-Authored-By: Grok 4.6 <grok@x.ai>
```

---

### Task 1: Rename wipe-render-postgres to wipe-postgres

**Files:**
- Rename: `wipe-render-postgres` → `wipe-postgres`
- Modify: `wipe-postgres` (usage line only)
- Modify: `validate` (awk list)
- Modify: `tests/fusion-angle-live-name.test.ts`
  (`ROOT_FILES`)
- Modify: `CLAUDE.md` (command list + validate
  paragraph)

No behaviour change. The history must read as a
rename (`git mv`), not a copy plus delete.

- [ ] **Step 1: Rename the file**

```bash
git mv wipe-render-postgres wipe-postgres
```

Confirm `git status` shows a rename, not add+delete.

- [ ] **Step 2: Point the usage line at the new name**

In `wipe-postgres`, the usage here-doc first line
is today:

```
Usage: ./wipe-render-postgres TOKEN --pristine|--mockdata
```

Change only that name:

```
Usage: ./wipe-postgres TOKEN --pristine|--mockdata
```

Do not change flags, TOKEN rules, or the ceremony.

- [ ] **Step 3: Point lint and the live-name pin**

`validate` awk list, the last name on the command:

```
    awk "$AWK_LINT" build serve test test-postgres \
        validate generate-schema-svg \
        generate-api-documentation measure \
        wipe-postgres
```

`tests/fusion-angle-live-name.test.ts` `ROOT_FILES`
entry `'wipe-render-postgres'` becomes
`'wipe-postgres'` (same position in the array).

- [ ] **Step 4: Point CLAUDE.md**

Command list (keep the comment):

```
./wipe-postgres TOKEN --pristine|--mockdata  # Wipe Render PG; reseed
```

Validate-semantics sentence: replace
`` `wipe-render-postgres` `` with `` `wipe-postgres` ``.
The wrapping stays:

```
`generate-api-documentation`, `measure`, and
`wipe-postgres`. It then rejects the `org`
```

Do not add a second command-list line yet.

- [ ] **Step 5: Smoke the rename**

```bash
./wipe-postgres --help
```

Expected: exit 0, usage names `./wipe-postgres`,
no network.

`rg wipe-render-postgres` must hit only the
untouched 2026-08-19 spec and plan (and this plan's
historical mentions). Product code, `validate`,
`CLAUDE.md`, and `ROOT_FILES` must not.

- [ ] **Step 6: Validate and commit**

```bash
./validate
git add wipe-postgres validate CLAUDE.md \
    tests/fusion-angle-live-name.test.ts
git commit -m "$(cat <<'EOF'
Rename wipe-render-postgres to wipe-postgres

Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

`git show --stat` must list a rename of the script.
`./validate` green.

---

### Task 2: Parse the reveal from text lines

**Files:**
- Modify: `wipe-postgres` (`print_credential_table`,
  a flatten helper, `wait_for_reveal` call site)

No behaviour change for the operator. Render still
polls `/logs`. The table still prints the same
markdown. Exit 10/11 stand.

Today `print_credential_table` JSON-parses Render
logs inside the function. After this commit it
reads a UTF-8 text file of lines. The Render path
flattens `logs[].message` (split on `\n`) into
`$TMP/logs.txt` before the call.

- [ ] **Step 1: Replace `print_credential_table`**

Keep the comment above it:

```
# Prints the markdown table to stdout.
# Exit 10 if the header is absent.
# Exit 11 if the header is present but no pairs.
```

Replace the function body with:

```bash
print_credential_table() {
    local file="$1"
    node --input-type=module -e '
        import { readFileSync } from "node:fs";
        import { argv, stdout, exit } from
            "node:process";
        const header = argv[2];
        const text = readFileSync(argv[1], "utf8");
        const lines = text.split("\n");
        const idx = lines.findIndex(
            (line) => line.includes(header),
        );
        if (idx < 0) exit(10);
        const rows = [];
        for (const line of lines.slice(idx + 1)) {
            const tab = line.indexOf("\t");
            if (tab <= 0) continue;
            const user = line.slice(0, tab);
            const pass = line.slice(tab + 1);
            if (user === "" || pass === "") continue;
            if (pass.includes("\t")) continue;
            rows.push([user, pass]);
        }
        if (rows.length === 0) exit(11);
        const cell = (value) =>
            value.split("|").join("\\|");
        stdout.write("| username | password |\n");
        stdout.write("| --- | --- |\n");
        for (const [user, pass] of rows) {
            stdout.write(
                "| "
                + cell(user)
                + " | "
                + cell(pass)
                + " |\n",
            );
        }
    ' "$file" "$REVEAL_HEADER"
}
```

- [ ] **Step 2: Add `flatten_render_logs`**

Place it immediately above `print_credential_table`.
Match the existing Node-snippet voice.

```bash
# Flatten Render logs JSON to one text line per
# logs[].message, splitting each message on \n.
flatten_render_logs() {
    local src="$1"
    local dest="$2"
    node --input-type=module -e '
        import { readFileSync, writeFileSync } from
            "node:fs";
        import { argv } from "node:process";
        const data = JSON.parse(
            readFileSync(argv[1], "utf8"),
        );
        const logs = Array.isArray(data.logs)
            ? data.logs
            : [];
        const lines = [];
        for (const entry of logs) {
            const message = entry && entry.message;
            const text = typeof message === "string"
                ? message
                : "";
            for (const line of text.split("\n")) {
                lines.push(line);
            }
        }
        writeFileSync(argv[2], lines.join("\n"));
    ' "$src" "$dest"
}
```

- [ ] **Step 3: Point `wait_for_reveal` at the text file**

Today:

```bash
        fetch_logs "$OWNER_ID" "$resource" \
            "$SEED_START" "$TMP/logs.json"
        if print_credential_table \
            "$TMP/logs.json" \
            > "$TMP/table.md"; then
            return 0
        fi
```

Replace with:

```bash
        fetch_logs "$OWNER_ID" "$resource" \
            "$SEED_START" "$TMP/logs.json"
        flatten_render_logs \
            "$TMP/logs.json" "$TMP/logs.txt"
        if print_credential_table \
            "$TMP/logs.txt" \
            > "$TMP/table.md"; then
            return 0
        fi
```

Do not change poll interval, timeout, job-status
handling, or the table path `$TMP/table.md`.

- [ ] **Step 4: Offline check that parsing still works**

Write a throwaway file (do not commit it):

```bash
TMP=$(mktemp)
printf '%s\n\n%s\t%s\n' \
    'Save your demo sign-ins — shown once; copy them now.' \
    'demo' 'secret' > "$TMP"
# Source only the function by running the node
# snippet the same way: invoke the script's help
# still works, then run the node block against $TMP
# by extracting print_credential_table via a tiny
# copy. Simpler: run node with the new snippet.
```

The implementer may instead run this Node check,
which is the new function's body:

```bash
node --input-type=module -e '
    import { readFileSync, writeFileSync } from
        "node:fs";
    import { argv, stdout, exit } from
        "node:process";
    const header = argv[2];
    const text = readFileSync(argv[1], "utf8");
    const lines = text.split("\n");
    const idx = lines.findIndex(
        (line) => line.includes(header),
    );
    if (idx < 0) exit(10);
    const rows = [];
    for (const line of lines.slice(idx + 1)) {
        const tab = line.indexOf("\t");
        if (tab <= 0) continue;
        const user = line.slice(0, tab);
        const pass = line.slice(tab + 1);
        if (user === "" || pass === "") continue;
        if (pass.includes("\t")) continue;
        rows.push([user, pass]);
    }
    if (rows.length === 0) exit(11);
    stdout.write("| username | password |\n");
    stdout.write("| --- | --- |\n");
    for (const [user, pass] of rows) {
        stdout.write(
            "| " + user + " | " + pass + " |\n",
        );
    }
' /tmp/wipe-reveal-check.txt \
    "Save your demo sign-ins — shown once; copy them now."
```

Create `/tmp/wipe-reveal-check.txt` first with the
header, a blank line, and `demo<TAB>secret`.
Expected stdout:

```
| username | password |
| --- | --- |
| demo | secret |
```

Exit 0. A file with only the header exits 11. A
file with no header exits 10. Delete the temp file.
Do not add this check to the repo.

- [ ] **Step 5: Validate and commit**

```bash
./wipe-postgres --help
./validate
git add wipe-postgres
git commit -m "$(cat <<'EOF'
Parse the reveal from text lines

Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

`--help` still exits 0. No Render HTTP. `./validate`
green.

---

### Task 3: Require `--postgres render`

**Files:**
- Modify: `wipe-postgres` (usage, argv parse,
  positional rules)

This commit accepts `render` alone. Usage confesses
exactly that. `local` is a usage error. TOKEN is
still required. Flag order does not matter. The
value is a separate argument (`--postgres render`),
not `--postgres=render` (`--postgres=render` is
unknown).

Replace the `for arg in "$@"` loop with `while` /
`shift` so `--postgres` can consume the next word.
That is how `./measure --pages a,b` speaks.

- [ ] **Step 1: Replace `usage`**

```bash
usage() {
    cat <<'USAGE'
Usage: ./wipe-postgres --postgres render TOKEN --pristine|--mockdata

Wipe the single Render Postgres instance visible
to TOKEN, then seed it again. --postgres render
is required. TOKEN is the confirmation. No prompt.

Options:
  --postgres render   Target (required)
  --pristine   Seed --seed-bootstrap, then listen
  --mockdata   Restart so --seed-mock-data runs
  --help       Show this help message

TOKEN must see exactly one Postgres and one web
service. HTTP only (curl). Development gun.
USAGE
}
```

Every usage line must be ≤78 characters. The first
line is 67.

- [ ] **Step 2: Replace argv parse and checks**

Keep `PRISTINE` / `MOCKDATA` exclusive checks.
Add `POSTGRES_TARGET`. TOKEN is required because
the only legal target is `render`.

Replace from `TOKEN=''` through the
`if [ -z "$TOKEN" ]` block with:

```bash
POSTGRES_TARGET=''
TOKEN=''
PRISTINE=false
MOCKDATA=false

while [ $# -gt 0 ]; do
    case "$1" in
        --help|-h)
            usage
            exit 0
            ;;
        --postgres)
            if [ $# -lt 2 ]; then
                echo "Error: --postgres requires" \
                    "a value" >&2
                usage >&2
                exit 1
            fi
            POSTGRES_TARGET="$2"
            shift 2
            ;;
        --pristine)
            PRISTINE=true
            shift
            ;;
        --mockdata)
            MOCKDATA=true
            shift
            ;;
        -*)
            echo "Error: unknown argument: $1" >&2
            usage >&2
            exit 1
            ;;
        *)
            if [ -n "$TOKEN" ]; then
                echo "Error: unexpected argument:" \
                    "$1" >&2
                usage >&2
                exit 1
            fi
            TOKEN="$1"
            shift
            ;;
    esac
done

if [ "$PRISTINE" = true ] \
    && [ "$MOCKDATA" = true ]; then
    echo "Error: --pristine and --mockdata" \
        "are exclusive" >&2
    usage >&2
    exit 1
fi

if [ "$PRISTINE" = false ] \
    && [ "$MOCKDATA" = false ]; then
    echo "Error: exactly one of --pristine or" \
        "--mockdata is required" >&2
    usage >&2
    exit 1
fi

case "$POSTGRES_TARGET" in
    '')
        echo "Error: --postgres is required" >&2
        usage >&2
        exit 1
        ;;
    render)
        ;;
    *)
        echo "Error: --postgres must be render" >&2
        usage >&2
        exit 1
        ;;
esac

if [ -z "$TOKEN" ]; then
    echo "Error: TOKEN is required" >&2
    usage >&2
    exit 1
fi
```

Leave the `curl` / `node` checks, `RENDER_API_KEY`
export, TMP trap, and the whole Render ceremony
untouched.

- [ ] **Step 3: Offline argv matrix (render-only)**

Run from the repo root. Each command must print a
message and usage on stderr (except `--help`).
None may call `api.render.com`.

| Command | Exit | stderr contains |
| --- | --- | --- |
| `./wipe-postgres --help` | 0 | `Usage: ./wipe-postgres --postgres render` |
| `./wipe-postgres -h` | 0 | same |
| `./wipe-postgres --mockdata` | 1 | `--postgres is required` |
| `./wipe-postgres --postgres` | 1 | `--postgres requires a value` |
| `./wipe-postgres --postgres foo --mockdata` | 1 | `--postgres must be render` |
| `./wipe-postgres --postgres local --mockdata` | 1 | `--postgres must be render` |
| `./wipe-postgres --postgres render --mockdata` | 1 | `TOKEN is required` |
| `./wipe-postgres --postgres render T` | 1 | `exactly one of --pristine or` |
| `./wipe-postgres --postgres render T --pristine --mockdata` | 1 | `are exclusive` |
| `./wipe-postgres --postgres=render T --mockdata` | 1 | `unknown argument` |
| `./wipe-postgres --postgres render T extra --mockdata` | 1 | `unexpected argument` |

`--help` / `-h` exit 0 even with env unset. A
legal invocation is
`./wipe-postgres --postgres render T --mockdata`
(flag order free:
`--mockdata --postgres render T` is also legal).
Do not run a legal invocation in this task — it
would hit Render.

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add wipe-postgres
git commit -m "$(cat <<'EOF'
Require --postgres render in wipe-postgres

Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

Do not change CLAUDE.md in this commit. The
command-list still shows the Task 1 usage; Task 4
rewrites it when `local` exists.

---

### Task 4: Add `--postgres local`

**Files:**
- Modify: `wipe-postgres` (usage, `local` in the
  target case, env/loopback guards, shared
  `WIPE_START`, local drop/build/seed/teardown,
  trap kills the seed child, curl is render-only)
- Modify: `CLAUDE.md` (two command-list lines)

This is the local ceremony. Render's HTTP steps
stay as they are. `local` takes no positional
argument; handing it one is a usage error.

- [ ] **Step 1: Replace `usage` for both targets**

```bash
usage() {
    cat <<'USAGE'
Usage: ./wipe-postgres --postgres render TOKEN --pristine|--mockdata
       ./wipe-postgres --postgres local --pristine|--mockdata

Wipe Postgres and seed it again. --postgres is
required and has no default. --postgres render
needs TOKEN (the confirmation). --postgres local
uses POSTGRES_URL (loopback only) and
JWT_HMAC_SIGNING_KEY; it takes no TOKEN.

Options:
  --postgres render|local   Target (required)
  --pristine   Seed --seed-bootstrap
  --mockdata   Seed --seed-mock-data
  --help       Show this help message

render: TOKEN must see exactly one Postgres and
one web service. HTTP only (curl).
local: drop, build, seed node server.mjs.
Development gun.
USAGE
}
```

- [ ] **Step 2: Accept `local`; positional rules split**

Change the `POSTGRES_TARGET` case to:

```bash
case "$POSTGRES_TARGET" in
    '')
        echo "Error: --postgres is required" >&2
        usage >&2
        exit 1
        ;;
    render|local)
        ;;
    *)
        echo "Error: --postgres must be render" \
            "or local" >&2
        usage >&2
        exit 1
        ;;
esac

if [ "$POSTGRES_TARGET" = "render" ] \
    && [ -z "$TOKEN" ]; then
    echo "Error: TOKEN is required" >&2
    usage >&2
    exit 1
fi

if [ "$POSTGRES_TARGET" = "local" ] \
    && [ -n "$TOKEN" ]; then
    echo "Error: unexpected argument:" \
        "$TOKEN" >&2
    usage >&2
    exit 1
fi
```

- [ ] **Step 3: Gate curl and the API key on render**

Today `curl` is required and `TOKEN` is copied to
`RENDER_API_KEY` for every run. After this commit
those belong to `render` only. `node` stays global.

Replace the curl check plus the export with:

```bash
if ! command -v node >/dev/null; then
    echo "Error: node is required" >&2
    exit 1
fi

if [ "$POSTGRES_TARGET" = "render" ]; then
    if ! command -v curl >/dev/null; then
        echo "Error: curl is required" >&2
        exit 1
    fi
    export RENDER_API_KEY="$TOKEN"
    unset TOKEN
fi
```

Delete the old standalone `curl` and `node`
checks so neither is duplicated.

- [ ] **Step 4: Trap must kill the seed child**

Initialize `SEED_PID=''` next to the other globals
(after the flags, before parse is fine).

Replace

```bash
TMP=$(mktemp -d \
    "${TMPDIR:-/tmp}/fusion-wipe.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
```

with a cleanup that releases both handles. Define
`stop_seed_child` before the trap (place it with
the other helpers):

```bash
stop_seed_child() {
    if [ -z "${SEED_PID:-}" ]; then
        return 0
    fi
    kill -TERM "$SEED_PID" 2>/dev/null || true
    if kill -0 "$SEED_PID" 2>/dev/null; then
        sleep "$POLL_SEC"
        kill -KILL "$SEED_PID" 2>/dev/null || true
    fi
    wait "$SEED_PID" 2>/dev/null || true
    SEED_PID=''
}

cleanup() {
    stop_seed_child
    rm -rf "$TMP"
}
```

Then:

```bash
TMP=$(mktemp -d \
    "${TMPDIR:-/tmp}/fusion-wipe.XXXXXX")
trap cleanup EXIT
```

On the render path `SEED_PID` stays empty and
`stop_seed_child` is a no-op.

- [ ] **Step 5: Lift `WIPE_START` so both paths share it**

Today `WIPE_START` is assigned after the Render
inventory. Cut that assignment (the double-quoted
Node one-liner plus `tr '\n' ' '`) and paste it
once, after TMP exists and before the local/render
branch. Do not change the four DROP statements.
Do not put `RENDER_API_KEY` or `POSTGRES_URL` into
the string; the job and `bash -c` inherit
`POSTGRES_URL`.

The render path then uses the already-built
`WIPE_START` in `write_job_body`. Delete the
old assignment so it is not duplicated.

- [ ] **Step 6: Local helpers**

Place these with the other functions (after
`print_credential_table` is fine). Every line
≤78 characters.

```bash
assert_local_env() {
    if [ -z "${POSTGRES_URL:-}" ]; then
        echo "Error: missing required env" \
            "POSTGRES_URL" >&2
        exit 1
    fi
    if [ -z "${JWT_HMAC_SIGNING_KEY:-}" ]; then
        echo "Error: missing required env" \
            "JWT_HMAC_SIGNING_KEY" >&2
        exit 1
    fi
    local host
    host=$(node --input-type=module -e '
        const url = process.env.POSTGRES_URL
            ?? "";
        if (url === "") process.exit(2);
        try {
            process.stdout.write(
                new URL(url).hostname,
            );
        } catch {
            process.exit(3);
        }
    ') || {
        echo "Error: POSTGRES_URL host is not" \
            "loopback" >&2
        exit 1
    }
    case "$host" in
        localhost|127.0.0.1|'[::1]')
            ;;
        *)
            echo "Error: POSTGRES_URL host is" \
                "not loopback" >&2
            exit 1
            ;;
    esac
}

free_loopback_port() {
    node --input-type=module -e '
        import { createServer } from "node:net";
        const s = createServer();
        s.listen(0, "127.0.0.1", () => {
            const addr = s.address();
            if (
                addr === null
                || typeof addr === "string"
            ) {
                s.close();
                process.exit(1);
            }
            const port = addr.port;
            s.close(() => {
                process.stdout.write(String(port));
            });
        });
        s.on("error", () => process.exit(1));
    '
}

last_json_message() {
    local file="$1"
    node --input-type=module -e '
        import { readFileSync } from "node:fs";
        import { argv, stdout } from
            "node:process";
        let text = "";
        try {
            text = readFileSync(argv[1], "utf8");
        } catch {
            text = "";
        }
        let last = "";
        for (const line of text.split("\n")) {
            if (line === "") continue;
            try {
                const json = JSON.parse(line);
                if (
                    json
                    && typeof json.message
                        === "string"
                ) {
                    last = json.message;
                }
            } catch {
                // seed reveal is not JSON
            }
        }
        stdout.write(last);
    ' "$file"
}

wait_local_reveal() {
    local started=$SECONDS
    while [ $((SECONDS - started)) -lt \
        "$REVEAL_TIMEOUT_SEC" ]; do
        if print_credential_table \
            "$TMP/seed.err" \
            > "$TMP/table.md"; then
            return 0
        fi
        if ! kill -0 "$SEED_PID" 2>/dev/null; then
            wait "$SEED_PID" 2>/dev/null || true
            local msg
            msg=$(last_json_message \
                "$TMP/seed.err")
            if [ -n "$msg" ]; then
                echo "Error: ${msg}" >&2
            else
                echo "Error: seed child exited" \
                    "before reveal" >&2
            fi
            exit 1
        fi
        sleep "$POLL_SEC"
    done
    echo "Error: seed reveal header missing after" \
        "${REVEAL_TIMEOUT_SEC}s" >&2
    stop_seed_child
    exit 1
}

wipe_local() {
    assert_local_env
    bash -c "$WIPE_START"
    ./build --no-zip "$TMP/build/"
    local port
    port=$(free_loopback_port)
    local seed_flag
    if [ "$PRISTINE" = true ]; then
        seed_flag='--seed-bootstrap'
    else
        seed_flag='--seed-mock-data'
    fi
    (
        cd "$TMP/build" || exit 1
        HTTP_SERVER_PORT="$port" exec \
            node server.mjs "$seed_flag"
    ) </dev/null >/dev/null 2>"$TMP/seed.err" &
    SEED_PID=$!
    wait_local_reveal
    stop_seed_child
    cat "$TMP/table.md"
}
```

Check reveal **before** child-death so a listen
failure after a durable seed still prints the
table. Timeout kills the child and exits 1; it
does not drop again.

`HTTP_SERVER_PORT` is set only on the child
command line. An `HTTP_SERVER_PORT` in the
operator's shell is ignored. `exec` makes
`SEED_PID` the Node process that `boot()`
binds SIGTERM on, not a leftover subshell.

`bash -c "$WIPE_START"` runs from the repo root so
`import postgres` resolves `node_modules`. Do not
`cd` first.

If the drop fails, Node's error text is the
script's stderr (`set -e`). Do not swallow it.

If `./build` fails, it proclaims its own error;
the script exits 1 before spawn.

- [ ] **Step 7: Branch before Render HTTP**

Immediately after `WIPE_START` is collapsed to one
line, and **before** `write_job_body` / inventory:

```bash
if [ "$POSTGRES_TARGET" = "local" ]; then
    wipe_local
    exit 0
fi
```

The rest of the file is the existing Render
ceremony. Do not restart it. Do not revoke a key
on the local path (there is none).

- [ ] **Step 8: Two CLAUDE.md command-list lines**

Replace the single wipe line with:

```
./wipe-postgres --postgres render TOKEN --pristine|--mockdata
./wipe-postgres --postgres local --pristine|--mockdata
```

Leave the validate-semantics `wipe-postgres` name
from Task 1. Do not mention Docker.

- [ ] **Step 9: Offline matrix (full)**

| Command | Exit | stderr contains |
| --- | --- | --- |
| `./wipe-postgres --help` | 0 | both usage lines; no network |
| `./wipe-postgres --mockdata` | 1 | `--postgres is required` |
| `./wipe-postgres --postgres` | 1 | `--postgres requires a value` |
| `./wipe-postgres --postgres foo --mockdata` | 1 | `must be render or local` |
| `./wipe-postgres --postgres local TOKEN --mockdata` | 1 | `unexpected argument` |
| `./wipe-postgres --postgres render --mockdata` | 1 | `TOKEN is required` |
| `./wipe-postgres --postgres local` | 1 | `exactly one of --pristine or` |
| `./wipe-postgres --postgres local --pristine --mockdata` | 1 | `are exclusive` |
| `env -u POSTGRES_URL JWT_HMAC_SIGNING_KEY=x ./wipe-postgres --postgres local --pristine` | 1 | `missing required env POSTGRES_URL` |
| `POSTGRES_URL=postgres://example.com/db JWT_HMAC_SIGNING_KEY=x ./wipe-postgres --postgres local --pristine` | 1 | `POSTGRES_URL host is not loopback` |
| `POSTGRES_URL=postgres://127.0.0.1/db env -u JWT_HMAC_SIGNING_KEY ./wipe-postgres --postgres local --pristine` | 1 | `missing required env JWT_HMAC_SIGNING_KEY` |

The non-loopback and missing-env cases must not
drop, build, or connect. stderr must not contain
the URL, the key, or `example.com` from our
echoes (Node is not launched for missing env; for
non-loopback Node parses the URL and prints only
the hostname to a local variable, then we echo
the variable name).

`--help` with both env vars unset still exits 0.

- [ ] **Step 10: Validate and commit**

```bash
./validate
git add wipe-postgres CLAUDE.md
git commit -m "$(cat <<'EOF'
Add --postgres local to wipe-postgres

Co-Authored-By: Grok 4.6 <grok@x.ai>
EOF
)"
```

Working tree must be clean after this commit:
Task 5's live run inherits `./build`'s clean-tree
rule.

---

### Task 5: Witness (orchestrator, not a subagent)

No code change. No commit. The orchestrator runs
this. A subagent must not hold `POSTGRES_URL` or
`JWT_HMAC_SIGNING_KEY` in a prompt.

- [ ] **Step 1: Re-run the Task 4 offline matrix**

Confirm every row. `--help` does not create
`$TMP` network calls.

- [ ] **Step 2: Live local, if the session has env**

Requires `POSTGRES_URL` (loopback) and
`JWT_HMAC_SIGNING_KEY`. If either is missing, skip
and say so — do not invent a URL.

Working tree must be clean (`./build`).

```bash
./wipe-postgres --postgres local --mockdata
```

Expected: markdown credential table on stdout,
exit 0. Then, without printing the URL:

```bash
node --input-type=module -e '
    import postgres from "postgres";
    const url = process.env.POSTGRES_URL;
    if (!url) throw new Error("missing POSTGRES_URL");
    const sql = postgres(url, { max: 1 });
    const rows = await sql.unsafe(
        "SELECT 1 FROM schema_marker",
    );
    if (rows.length !== 1) {
        throw new Error("schema_marker missing");
    }
    await sql.end();
'
```

Then `./serve` must listen. Spawn it on a free
port, wait for the listening JSON on stdout, then
SIGTERM. Do not leave a server running.

Repeat with `--pristine`. After that run,
`schema_marker` still holds its row and `./serve`
still listens.

- [ ] **Step 3: Render path**

Do not call `api.render.com` from the sandbox.
Witness by reading the diff: inventory, wipe job,
seed restart/job, log poll, table, revoke attempt
are still there and still entered only through
`--postgres render`. The final report must say
the Render path was not live-exercised.

---

## Self-review (spec coverage)

| Spec requirement | Task |
| --- | --- |
| Name `./wipe-postgres` | 1 |
| `--postgres render\|local` required, no default | 3, 4 |
| `local` is whatever `POSTGRES_URL` names | 4 |
| `render` keeps positional TOKEN; `local` refuses one | 3, 4 |
| Loopback host only | 4 |
| Local seeds from `./build --no-zip` + `server.mjs` | 4 |
| Rename first; behaviour after | 1 then 2–4 |
| Root-script shape, `--help`, validate list | 1, all |
| No Docker, no new test file, no prompt | Do not touch |
| TOKEN / URL / key never logged by us | 4 pins |
| 2026-08-19 spec/plan and README untouched | Do not touch |
| Render ceremony unchanged in effect | 3 wraps, 4 branches |
| Local drop / build / seed / poll / teardown | 4 |
| Shared `WIPE_START`, text-line table, constants | 2, 4 |
| Failure table | 3, 4, 5 |
| TMP + seed child released on EXIT | 4 |
| Four named commits | 1–4 |
| Offline matrix + live local + honest Render gap | 5 |
| CLAUDE.md two lines + validate name | 1, 4 |
| Later/not-now (cast out, Docker check) | omitted |

No placeholders. No "similar to Task N" without
the code. Types/names: `POSTGRES_TARGET`,
`flatten_render_logs`, `assert_local_env`,
`free_loopback_port`, `last_json_message`,
`wait_local_reveal`, `wipe_local`,
`stop_seed_child`, `SEED_PID` — used under those
names only.

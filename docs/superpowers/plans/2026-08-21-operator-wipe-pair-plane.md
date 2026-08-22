# Operator Wipe Pair Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Operator wipe drops the live pair plane (`pairs`)
plus retired leftovers from one exported SQL string, and
TEST-PLAN A3 wipes then seeds then listens.

**Architecture:** Export the existing `DROP_SCHEMA` string
from `api/backend-postgres.ts` as `POSTGRES_DROP_SCHEMA`.
`deleteSchema`, local wipe (`server/postgres-wipe.ts`), and
the Render job `startCommand` builder all consume that
string. Seed still refuses a non-empty database. Two guns
stay two guns.

**Tech Stack:** TypeScript (ES2024, `node --strip-types`),
postgres.js behind `api/postgres-client.ts`, bash operator
scripts, `node:test`.

---

## File map

- Modify: `api/backend-postgres.ts` — export
  `POSTGRES_DROP_SCHEMA`; `deleteSchema` uses it.
- Create: `server/postgres-wipe.ts` — local wipe entry
  (`unsafe` of that string, then `end`) and
  `renderWipeStartCommand()` that embeds the same string
  in a self-contained `node -e` one-liner.
- Modify: `postgres-wipe` — local path matches seed
  (`node --strip-types server/postgres-wipe.ts`); Render
  job command is built from `renderWipeStartCommand()`.
- Modify: `postgres-lib` — delete `WIPE_START`; no drop
  list in bash.
- Modify: `tests/backend-postgres.test.ts` — pin the
  exported drop list (`pairs` first); keep
  `deleteSchema drops tables, function, marker`.
- Create: `tests/postgres-wipe.test.ts` — pin local
  `wipePostgres` runs `unsafe` of the export; pin Render
  builder embeds `JSON.stringify(POSTGRES_DROP_SCHEMA)`.
- Keep: `tests/pg-seed.test.ts` nonempty refuse (no
  change).
- Modify: `TEST-PLAN.md` — How-to invoke, Protocol, A3,
  SV operator prerequisites, Historical note.
- Modify: `CLAUDE.md` and `postgres-wipe` usage — wipe
  drops the pair plane plus retired leftovers and the
  marker; it does not seed.

---

### Task 1: Export POSTGRES_DROP_SCHEMA

**Files:**
- Modify: `api/backend-postgres.ts:28-33` and
  `deleteSchema` (`:116-122`)
- Test: `tests/backend-postgres.test.ts`

- [ ] **Step 1: Write the failing exact-list pin**

Add this test after
`deleteSchema drops tables, function, marker` in
`tests/backend-postgres.test.ts`. Import
`POSTGRES_DROP_SCHEMA` from
`../api/backend-postgres.ts`.

```typescript
test('POSTGRES_DROP_SCHEMA drops pairs first', () => {
    assert.equal(
        POSTGRES_DROP_SCHEMA,
        'DROP TABLE IF EXISTS pairs;\n'
        + 'DROP TABLE IF EXISTS responses;\n'
        + 'DROP TABLE IF EXISTS requests;\n'
        + 'DROP TABLE IF EXISTS schema_marker;\n'
        + 'DROP FUNCTION IF EXISTS message_body(bytea);',
    );
});
```

Keep the existing `deleteSchema drops tables, function,
marker` test. After the export lands, that test still
passes because `deleteSchema` runs the same SQL.

- [ ] **Step 2: Run the pin and confirm it fails**

Run:

```bash
node --test --strip-types \
    tests/backend-postgres.test.ts
```

Expected: FAIL — `POSTGRES_DROP_SCHEMA` is not exported
(`does not provide an export named
'POSTGRES_DROP_SCHEMA'`).

- [ ] **Step 3: Export the existing string**

In `api/backend-postgres.ts`, rename `DROP_SCHEMA` to
`POSTGRES_DROP_SCHEMA` and export it. Do not change the
SQL or the order.

```typescript
export const POSTGRES_DROP_SCHEMA =
    'DROP TABLE IF EXISTS pairs;\n'
    + 'DROP TABLE IF EXISTS responses;\n'
    + 'DROP TABLE IF EXISTS requests;\n'
    + 'DROP TABLE IF EXISTS schema_marker;\n'
    + 'DROP FUNCTION IF EXISTS message_body(bytea);';
```

In `deleteSchema`, use the export:

```typescript
await this.#sql.unsafe(POSTGRES_DROP_SCHEMA);
```

Add `POSTGRES_DROP_SCHEMA` to the import in
`tests/backend-postgres.test.ts`:

```typescript
import {
    POSTGRES_DROP_SCHEMA,
    PostgresBackend,
} from '../api/backend-postgres.ts';
```

- [ ] **Step 4: Run tests and confirm they pass**

Run:

```bash
node --test --strip-types \
    tests/backend-postgres.test.ts
```

Expected: PASS, including both
`deleteSchema drops tables, function, marker` and
`POSTGRES_DROP_SCHEMA drops pairs first`.

- [ ] **Step 5: Commit**

```bash
git add api/backend-postgres.ts \
    tests/backend-postgres.test.ts
git commit -m "Export POSTGRES_DROP_SCHEMA drop list

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task 2: Local wipe entry and Render builder

**Files:**
- Create: `server/postgres-wipe.ts`
- Create: `tests/postgres-wipe.test.ts`

Local wipe is `wipePostgres(sql)`:
`sql.unsafe(POSTGRES_DROP_SCHEMA)`. The CLI connects with
`POSTGRES_URL`, calls that, and `end()`s. No seed, no DDL
create, no credential print.

Render's deployed image is `server.mjs`, not TypeScript
sources. `renderWipeStartCommand()` returns a
self-contained `node --input-type=module -e '...'`
one-liner whose script contains
`JSON.stringify(POSTGRES_DROP_SCHEMA)` as the
`unsafe` argument. The job command must contain the
exact exported SQL text. Do not retype table names.

`--print-start-command` prints that one-liner and
exits. Missing `POSTGRES_URL` fails via `requiredEnv`
as today. Drop statements are `IF EXISTS`; a
never-seeded database is a successful no-op.

- [ ] **Step 1: Write the failing operator-wipe pins**

Create `tests/postgres-wipe.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POSTGRES_DROP_SCHEMA } from
    '../api/backend-postgres.ts';
import type { SqlClient } from
    '../api/postgres-client.ts';
import {
    renderWipeStartCommand,
    wipePostgres,
} from '../server/postgres-wipe.ts';

function fakeClient(): {
    readonly sql: SqlClient;
    readonly texts: string[];
} {
    const texts: string[] = [];
    const sql: SqlClient = {
        query: <T>(
            _strings: TemplateStringsArray,
            ..._values: unknown[]
        ) => Promise.resolve([] as T[]),
        begin: async (fn) => fn(sql),
        unsafe: async <T>(query: string) => {
            texts.push(query);
            return [] as T[];
        },
        end: async () => {},
    };
    return { sql, texts };
}

test('wipePostgres unsafes POSTGRES_DROP_SCHEMA',
async () => {
    const fake = fakeClient();
    await wipePostgres(fake.sql);
    assert.deepEqual(fake.texts, [
        POSTGRES_DROP_SCHEMA,
    ]);
});

test('render wipe command embeds the drop list',
() => {
    const command = renderWipeStartCommand();
    assert.match(
        command,
        /^node --input-type=module -e /,
    );
    assert.ok(
        command.includes(
            JSON.stringify(POSTGRES_DROP_SCHEMA),
        ),
        'startCommand must embed POSTGRES_DROP_SCHEMA',
    );
    assert.equal(
        command.includes('DROP TABLE IF EXISTS pairs'),
        true,
    );
    assert.equal(command.includes('\n'), false);
});
```

- [ ] **Step 2: Run the pins and confirm they fail**

Run:

```bash
node --test --strip-types tests/postgres-wipe.test.ts
```

Expected: FAIL — `server/postgres-wipe.ts` does not
exist.

- [ ] **Step 3: Write the wipe module**

Create `server/postgres-wipe.ts`. Mirror
`server/postgres-seed.ts` for `isMainModule`,
`requiredEnv`, `connectPostgres`, and
`safeErrorMessage`. Keep every line ≤ 78 characters.

```typescript
// Operator wipe. Drops the pair plane and leftover
// retired objects. Node-only. No seed.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POSTGRES_DROP_SCHEMA } from
    '../api/backend-postgres.ts';
import {
    connectPostgres,
    type SqlClient,
} from '../api/postgres-client.ts';
import {
    POOL_ACQUIRE_TIMEOUT_MS,
    STATEMENT_TIMEOUT_MS,
    requiredEnv,
    safeErrorMessage,
} from './postgres-gate.ts';

const USAGE =
    'Usage: postgres-wipe [--print-start-command]\n';
const PRINT_START = '--print-start-command';
const WIPE_FAILED = 'wipe failed';

export async function wipePostgres(
    sql: SqlClient,
): Promise<void> {
    await sql.unsafe(POSTGRES_DROP_SCHEMA);
}

export function renderWipeStartCommand(): string {
    const script =
        "import postgres from 'postgres';"
        + 'const url = process.env.POSTGRES_URL;'
        + 'if (!url) throw new Error('
        + "'missing POSTGRES_URL');"
        + 'const sql = postgres(url, { max: 1 });'
        + 'await sql.unsafe('
        + JSON.stringify(POSTGRES_DROP_SCHEMA)
        + ');'
        + 'await sql.end();';
    return 'node --input-type=module -e '
        + JSON.stringify(script);
}

export function wipeErrorMessage(
    error: unknown,
): string {
    return safeErrorMessage(
        error,
        new Set(),
        WIPE_FAILED,
    );
}

function isMainModule(): boolean {
    const invoked = process.argv[1];
    if (invoked === undefined) return false;
    return resolve(invoked)
        === fileURLToPath(import.meta.url);
}

async function run(
    argv: readonly string[],
): Promise<void> {
    if (argv.includes('--help')
        || argv.includes('-h')) {
        process.stdout.write(USAGE);
        return;
    }
    if (argv.includes(PRINT_START)) {
        process.stdout.write(renderWipeStartCommand());
        return;
    }
    const postgresUrl = requiredEnv('POSTGRES_URL');
    const sql = connectPostgres(
        postgresUrl,
        {
            statementTimeoutMs: STATEMENT_TIMEOUT_MS,
            acquireTimeoutMs: POOL_ACQUIRE_TIMEOUT_MS,
        },
    );
    try {
        await wipePostgres(sql);
    } finally {
        await sql.end();
    }
}

if (isMainModule()) {
    run(process.argv).catch((error: unknown) => {
        process.stderr.write(
            JSON.stringify({
                at: new Date().toISOString(),
                level: 'error',
                message: wipeErrorMessage(error),
            }) + '\n',
        );
        process.exit(1);
    });
}
```

`safeErrorMessage` already surfaces
`missing required env POSTGRES_URL` without echoing the
URL. Do not log `POSTGRES_URL`.

- [ ] **Step 4: Run the pins and confirm they pass**

Run:

```bash
node --test --strip-types tests/postgres-wipe.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/postgres-wipe.ts tests/postgres-wipe.test.ts
git commit -m "Add operator pair-plane wipe entry

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task 3: Wire postgres-wipe and postgres-lib

**Files:**
- Modify: `postgres-wipe`
- Modify: `postgres-lib`

`WIPE_START` currently hardcodes drops of `responses`,
`requests`, `schema_marker`, and `message_body`, and
leaves `pairs`. Delete that list. Local wipe must match
seed: after the loopback assert, run
`node --strip-types server/postgres-wipe.ts`. Render
builds the job command at job-creation time from
`--print-start-command`. Usage must say wipe drops the
pair plane (`pairs`) plus retired leftovers and the
marker, and does not seed.

- [ ] **Step 1: Remove WIPE_START from postgres-lib**

Delete lines 11–26 of `postgres-lib` (the
`WIPE_START=...` assignment and the `tr '\n' ' '`
collapse). Leave `WIPE_TIMEOUT_SEC` and the rest of the
file. `write_job_body` stays; the wipe script will pass
it a command built from TypeScript.

- [ ] **Step 2: Point local and Render wipe at the export**

In `postgres-wipe`, update usage so the first prose
block reads:

```
Drop the pair plane (pairs), retired leftovers
(responses, requests), schema_marker, and
message_body. Does not seed. --postgres is
required and has no default. --postgres render
needs TOKEN (the confirmation). --postgres local
uses POSTGRES_URL (loopback only); it takes no
TOKEN.
```

And the local blurb:

```
local: drop. No seed. Development gun.
```

Replace the local branch:

```bash
if [ "$POSTGRES_TARGET" = "local" ]; then
    assert_loopback_postgres_url
    ROOT="$(cd "$(dirname "$0")" && pwd)"
    exec node --strip-types \
        "$ROOT/server/postgres-wipe.ts"
fi
```

In the Render branch, after `discover_render_ids` and
before `write_job_body`, build the command:

```bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
WIPE_START=$(node --strip-types \
    "$ROOT/server/postgres-wipe.ts" \
    --print-start-command)
write_job_body "$TMP/wipe-job.json" "$WIPE_START"
```

Keep TOKEN discovery, `wait_for_job`, and the
"seed with ./postgres-seed" stderr hint unchanged.

Confirm `postgres-lib` contains no
`DROP TABLE` / `DROP FUNCTION` strings.

- [ ] **Step 3: Smoke the print-start-command path**

Run:

```bash
node --strip-types server/postgres-wipe.ts \
    --print-start-command
```

Expected: one line starting with
`node --input-type=module -e ` that includes
`DROP TABLE IF EXISTS pairs` and does not include a
raw newline in the command body.

`./postgres-wipe --help` must mention the pair plane
and "Does not seed".

- [ ] **Step 4: Commit**

```bash
git add postgres-wipe postgres-lib
git commit -m "Wire wipe scripts to drop-list export

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task 4: TEST-PLAN A3 wipes then seeds

**Files:**
- Modify: `TEST-PLAN.md`

Empty is no longer a human prerequisite. Master
preflight, after AT and A1–A2:

1. `./postgres-wipe --postgres local`
2. Serial: `./postgres-seed --postgres local
   --mock-data`. Parallel (default):
   `./postgres-seed --postgres local
   --test-plan-slices`
3. `node server.mjs` from the A2 directory

Hunters still do not re-seed. K8 shape is unchanged
(stop → wipe → `--bootstrap` → start → stop → wipe →
`--mock-data` → start). Serial AA's optional
wipe-then-bootstrap is unchanged.

Strike Historical note “Operator seed wipes the whole
database.” Seed never wipes. K8 is
`global_lock: process` because **wipe** replaces the
shared database.

- [ ] **Step 1: Update How to invoke step 3**

Replace the A3 sentences in `### How to invoke`
(currently seed then `node server.mjs` with no wipe)
so parallel A3 is wipe, then
`--test-plan-slices`, then `node server.mjs`, and
serial A3 is wipe, then `--mock-data`, then
`node server.mjs`.

- [ ] **Step 2: Update Protocol serial and parallel**

In `### Protocol`, serial A3 currently says
`./postgres-seed --postgres local --mock-data` then
`node server.mjs` on an empty database. Parallel A3
currently says seed `--test-plan-slices` then listen.

Prefix both with `./postgres-wipe --postgres local`.
Remove “on an empty database” as an unstated operator
step; wipe is the step.

Keep “Hunters do not create tenants and do not
re-seed.” Keep K8 as wipe/reseed of the shared DB
after join.

- [ ] **Step 3: Update A3 case text**

Replace the A3 lead-in (currently “against an **empty**
Postgres. Seed from the checkout, then start…”) with
wipe then seed then listen. Keep the serial vs
parallel seed flags, stdout reveal pins, and “this pin
**is** SV1”.

A3 must name:

```
./postgres-wipe --postgres local
```

then the mode seed, then `node server.mjs` from the A2
directory. Env (`POSTGRES_URL`,
`JWT_HMAC_SIGNING_KEY`, `HTTP_SERVER_PORT`) stays
required.

- [ ] **Step 4: Update SV operator prerequisites**

Replace:

```
- Empty database; seed serial A3 with
  `./postgres-seed --postgres local --mock-data`
  then `node server.mjs`, and parallel A3 with
  `./postgres-seed --postgres local
  --test-plan-slices` then `node server.mjs`.
```

with wipe then the same seeds then listen. The SV
hunter still skips SV1 and does not re-seed.

- [ ] **Step 5: Strike the Historical seed-wipes line**

Replace:

```
- Operator seed wipes the whole database (why K8
  is `global_lock: process`).
```

with:

```
- Operator wipe replaces the shared database (why
  K8 is `global_lock: process`). Seed never wipes.
```

Do not change K8 case steps (already wipe then
`--bootstrap` then wipe then `--mock-data`). Do not
change serial AA's optional wipe-then-bootstrap. Do
not change hunter contract text “Do not re-seed.”

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Make TEST-PLAN A3 wipe then seed

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task 5: Document operator wipe

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Name what wipe drops**

In `CLAUDE.md` Gotchas, after **Operator seed is below
HTTP.**, add a sibling bullet (78-char wrap):

```
- **Operator wipe drops the pair plane.**
  `./postgres-wipe` (`--postgres local` or
  `--postgres render TOKEN`) runs
  `POSTGRES_DROP_SCHEMA`: `pairs` first, then
  retired `responses` / `requests`, then
  `schema_marker`, then `message_body(bytea)`.
  It does not seed. Seed still refuses a
  non-empty database.
```

Do not add `--force` / `--pristine`. Do not fold wipe
into seed. Do not mention compose as a
`./postgres-wipe` target.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Document pair-plane operator wipe

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task 6: Validate

**Files:** none new

- [ ] **Step 1: Run the targeted suite**

```bash
node --test --strip-types \
    tests/backend-postgres.test.ts \
    tests/postgres-wipe.test.ts \
    tests/pg-seed.test.ts
```

Expected: PASS. `pg-seed.test.ts` still refuses a
nonempty database and a marker row.

- [ ] **Step 2: Run ./validate**

```bash
./validate
```

Expected: exit 0. Line-length lint includes
`postgres-wipe` and `postgres-lib`. No `org`
abbreviation hits. New tests counted in the suite.

- [ ] **Step 3: Fix any lint or type failure, then
      re-run ./validate until green.**

If a commit is required for a lint wrap, keep it one
concern (wrap lines) and use:

```
Wrap wipe files to seventy-eight columns
```

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| Export `POSTGRES_DROP_SCHEMA`; order unchanged | 1 |
| `deleteSchema` uses that string | 1 |
| Pin drop list, `pairs` first | 1 |
| Keep `deleteSchema drops tables…` | 1 |
| Local wipe TS entry, `unsafe` of export | 2 |
| Render `startCommand` embeds the export | 2 |
| `WIPE_START` no hardcoded table names | 3 |
| Local path `node --strip-types` like seed | 3 |
| Seed unchanged; nonempty refuse kept | 6 (existing tests) |
| TEST-PLAN How-to / Protocol / A3 / SV | 4 |
| Historical note: seed never wipes | 4 |
| Hunters do not re-seed; K8 shape same | 4 (no edit) |
| CLAUDE.md + wipe usage: drops pairs, no seed | 3 + 5 |
| No `--force` / `--pristine` / wipe-in-seed | none (non-goal) |

## Type consistency

- Export name is `POSTGRES_DROP_SCHEMA` everywhere
  (backend, wipe module, tests).
- Local helper is `wipePostgres`.
- Render builder is `renderWipeStartCommand`.
- Print flag is `--print-start-command`.

# Whole-Tree Type Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement
> this plan task-by-task. Fresh subagent per mechanical
> task; two-stage review (spec compliance, then code
> quality) after each. Fan-out tasks (5, 8, 9, 10) are
> implemented by the master session: it measures,
> partitions, dispatches Medium-Church subagents, waits,
> re-measures, and commits, then the two reviewers run
> on that family commit. Every subagent prompt begins
> with the literal phrase `Go to Medium Church!`. Do
> not use git worktrees (AGENTS.md). Work on master.

**Goal:** Type-check the whole tree under a root
superset `tsconfig.json` (`types: ["node"]`) plus the
existing browser subset (`types: []`), drive 699
diagnostics to 0 by family, then flip `./validate`.

**Architecture:** One option set at the repo root;
the browser config `extends` it and overrides only
`types: []`. `@types/node` 24.13.3 is types-only.
Remediation is one diagnostic family per commit,
least judgment first. Root `tsc` stays out of
`./validate` until it is green.

**Tech Stack:** TypeScript 6.0.3, `@types/node`
24.13.3, `npx tsc --noEmit`, `node:test` under
`node --strip-types`, Bash. No other new dependency.

**Spec:**
`docs/superpowers/specs/2026-08-28-whole-tree-type-check-design.md`

## Global Constraints

- **Base:** master at `afb16a4f` (or later, if
  linear). Work on master; never branch, never
  merge, never push. No worktrees.
- **Pause:** do not interleave file-by-file with
  the verification-tiers plan. Land this item at
  that plan's next pause, before its Task 12
  (`tests/browser-globals.ts`) and Task 13 (`req()`
  helpers). Preferred pause: after Task 4 (current
  HEAD). If that plan has moved past Task 4, wait
  until its next pause still before Task 12.
- **One concern per commit.** Subject ≈50 chars,
  present-tense imperative, no body prose. Every
  commit message ends with exactly this trailer
  line:
  `Co-Authored-By: Grok 4.6 <noreply@x.ai>`
- **Never move and change content in one commit.**
- **`./validate` green before every commit.** Until
  Task 14, that is still only the *browser* tsc
  line. After Task 14 it is both projects.
- **78-character lines, 4-space indent** in every
  file the lint covers.
- **Finding rule.** A completed fixture, a supplied
  argument, or a newly executing line that turns a
  test red is a finding. Two exits: fix the code to
  the covenant the test names, or delete the test
  because its covenant was wrong — each as its own
  commit, red test as evidence. A finding whose
  fix is not confined to the test's subject
  **BLOCKED**: pause for its own brainstorm. Do not
  paper over.
- **Families never interleave within a commit.**
- **Counts are a snapshot** (699 at `afb16a4f`, 196
  files). Re-measure at the start of every family
  task. The idioms are the contract.
- **Frozen:** dated specs and plans before this
  one. Do not edit the verification-tiers spec or
  plan except as that plan itself names.

## File Structure

- Create: `tsconfig.json` (root superset)
- Create: `tests/tsconfig-covenants.test.ts`
- Modify: `package.json`, `package-lock.json`
- Modify: `web-app/app/tsconfig.json` (extends +
  `types: []`; keep `include`/`exclude`)
- Modify: `validate` (root tsc line ahead of
  browser line)
- Modify: `AGENTS.md` (Gates + Two type universes)
- Modify: `TEST-PLAN.md` (AT1)
- Modify: Node-only file banners (re-grep)
- Modify: `TODO.md` (Close protocol)
- Modify: tests (and `server/boot.ts`,
  `web-app/app/measure.ts`) per family; re-measure
  names the files

## Fan-out protocol (Tasks 5, 8, 9, 10)

The master session is the implementer.

1. Re-measure:
   `npx --no-install tsc --noEmit -p tsconfig.json --pretty false`
   Parse `error TS####` lines. Keep only this
   family's codes (the task names them). Group by
   file.
2. Partition files into batches of at most 20
   files. Prefer prefix groups (`tests/adapters-*`,
   `tests/api-*`, `tests/drift-*`, `tests/derive-*`,
   remainder).
3. Dispatch one general-purpose subagent per batch,
   **in parallel only when the batches share no
   files**. Each prompt MUST begin with
   `Go to Medium Church!` and then:

```
Voice: 78-char lines in linted files, 4-space
indent, present-tense imperative commits (you do
not commit; the master does).

Commandments: III Uniformity, IV Logic, V Clarity,
VIII Simplicity. You execute this family only.

Abominations this family risks: Test Weakening
(never rewrite an expectation to match failing
code), Unbidden Helper Code, Premature
Generalization, Default Values (`?? ''`,
`value || 0`), Internal Defense.

Finding rule: [paste from Global Constraints].

Idiom: [paste this task's idiom and examples].

Files (only these):
[paths]

Do not touch other files. Do not commit. Report:
files changed, diagnostics you believe cleared,
any finding (red test) with the test name and
whether the fix is confined to the test's subject.
Status: DONE | DONE_WITH_CONCERNS | BLOCKED |
NEEDS_CONTEXT.
```

4. If any subagent reports BLOCKED or a finding
   whose fix is not confined to the test, stop and
   handle per the finding rule. Do not continue the
   family.
5. Re-measure. This family's codes must be 0. If
   not, re-dispatch the remaining files.
6. `./validate` (browser tsc + tests + lint).
7. One commit for the whole family.
8. Spec-compliance reviewer, then code-quality
   reviewer, on that commit.

## Measure helper

At the start of every family, and after each
fan-out wave:

```bash
npx --no-install tsc --noEmit -p tsconfig.json \
    --pretty false > "$TMPDIR/tsc.txt" || true
python3 - <<'PY'
import re, collections, os
p = os.environ.get("TMPDIR", "/tmp") + "/tsc.txt"
codes = collections.Counter()
files = collections.Counter()
for line in open(p):
    m = re.match(r"^(.+\.ts)\((\d+),\d+\): error (TS\d+):", line)
    if not m:
        continue
    path, ln, code = m.group(1), m.group(2), m.group(3)
    codes[code] += 1
    files[path] += 1
print("total", sum(codes.values()), "files", len(files))
for c, n in codes.most_common():
    print(f"{c} {n}")
PY
```

Expected at Task 2 after configs land: 699 total
(or the re-measured number). Expected at Task 14:
0.

---

### Task 1: Add `@types/node` 24.13.3

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install the types package exact**

```bash
npm install --save-dev --save-exact @types/node@24.13.3
```

Expected: `package.json` `devDependencies` gains
`"@types/node": "24.13.3"` beside `esbuild`,
`postgres`, `typescript`. Lockfile follows.
Dockerfile `npm ci` will pick it up as types only.

- [ ] **Step 2: Validate**

Run: `./validate`
Expected: exit 0. Browser tsc still does not see
`@types/node` (no `types` key yet; TS 6 defaults
`types` to `[]`).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add @types/node 24.13.3"
```

---

### Task 2: Root tsconfig and browser extends

**Files:**
- Create: `tsconfig.json`
- Modify: `web-app/app/tsconfig.json`
- Temp artifacts: `$TMPDIR/wt-before/` (not
  committed)

Root is red after this task. It is not yet in
`./validate`.

- [ ] **Step 1: Capture artifact baseline**

Tree must be clean (`./build` requires it).

```bash
BEFORE="$TMPDIR/wt-before"
rm -rf "$BEFORE"
./build --no-zip "$BEFORE"
ls "$BEFORE/server.mjs" \
    "$BEFORE/assets/app.js" \
    "$BEFORE/assets/theme-init.js" \
    "$BEFORE/assets/root-redirect.js"
```

Expected: four files present. Keep `$BEFORE` until
Task 14's `cmp`. Record the absolute path in the
implementer report.

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
    "compilerOptions": {
        "target": "ES2024",
        "module": "ES2022",
        "moduleResolution": "bundler",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "resolveJsonModule": true,
        "isolatedModules": true,
        "allowImportingTsExtensions": true,
        "noEmit": true,
        "noFallthroughCasesInSwitch": true,
        "noUncheckedIndexedAccess": true,
        "noImplicitReturns": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true,
        "exactOptionalPropertyTypes": true,
        "lib": ["ES2024", "DOM", "DOM.Iterable"],
        "verbatimModuleSyntax": true,
        "erasableSyntaxOnly": true,
        "types": ["node"]
    },
    "include": [
        "api/**/*.ts",
        "server/**/*.ts",
        "shared/**/*.ts",
        "tests/**/*.ts",
        "web-app/**/*.ts"
    ]
}
```

No `exclude`. Four-space indent.

- [ ] **Step 3: Point the browser config at it**

Replace `web-app/app/tsconfig.json` with:

```json
{
    "extends": "../../tsconfig.json",
    "compilerOptions": {
        "types": []
    },
    "include": [
        "./**/*.ts",
        "../**/*.ts",
        "../../api/**/*.ts",
        "../../shared/**/*.ts"
    ],
    "exclude": [
        "./compose.ts",
        "./generate-schema-svg.ts",
        "./generate-api-documentation.ts",
        "./measure.ts",
        "./measure-viz.ts",
        "./cdp-client.ts",
        "./browser-drive.ts"
    ]
}
```

The `include` and `exclude` lists are the current
ones, wrapped. Do not add or drop exclude entries.
The only compilerOptions key is `types`.

- [ ] **Step 4: Confirm both projects' shapes**

```bash
show() {
    npx --no-install tsc --showConfig -p "$1" \
        | python3 -c '
import sys, json
c = json.load(sys.stdin)["compilerOptions"]
print(c.get("types"),
      c.get("verbatimModuleSyntax"),
      c.get("erasableSyntaxOnly"))
'
}
show tsconfig.json
show web-app/app/tsconfig.json
npx --no-install tsc --noEmit -p tsconfig.json \
    --pretty false 2>&1 | python3 -c "
import sys,re,collections
c=collections.Counter()
n=0
for line in sys.stdin:
    m=re.search(r'error (TS\d+):', line)
    if m:
        c[m.group(1)] += 1; n += 1
print('total', n)
print(dict(c))
"
npx --no-install tsc --noEmit \
    -p web-app/app/tsconfig.json
```

Expected: root showConfig prints
`['node'] True True`. Browser showConfig prints
`[] True True`. Root total ≈ 699 (snapshot at
`afb16a4f`: TS6133 320, TS2345 115, TS2554 48,
TS2339 34, TS2379 33, TS2578 31, TS6192 26,
TS2740 25, TS2322 21, TS2741 16, TS2353 9,
TS2739 8, TS18046 3, TS2304 2, TS18048 2,
TS2367 2, TS2459 1, TS2375 1, TS2352 1,
TS2783 1). Browser tsc exits 0.

- [ ] **Step 5: Validate (browser gate still)**

Run: `./validate`
Expected: exit 0. `validate` still has only the
browser tsc line.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json web-app/app/tsconfig.json
git commit -m "Add a root tsconfig the browser extends"
```

---

### Task 3: Covenant pin

**Files:**
- Create: `tests/tsconfig-covenants.test.ts`

The test must itself be type-clean under the root
project (it lands in `tests/**/*.ts`). Use
`String(stdout)+String(stderr)` so `encoding: 'utf8'`
overload drift cannot add a diagnostic.

- [ ] **Step 1: Write the failing-then-passing test**

The configs already exist, so this test is green on
arrival. That is acceptable: it pins an invariant
that later edits can break, not a feature under
construction.

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
    mkdtempSync, writeFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function tsc(args: string[]): {
    status: number | null;
    out: string;
} {
    const result = spawnSync(
        'npx',
        ['--no-install', 'tsc', ...args],
        { encoding: 'utf8', timeout: 60_000 },
    );
    return {
        status: result.status,
        out: String(result.stdout)
            + String(result.stderr),
    };
}

function optionsOf(project: string): {
    types?: string[];
    verbatimModuleSyntax?: boolean;
    erasableSyntaxOnly?: boolean;
} {
    const result = tsc(['--showConfig', '-p', project]);
    assert.equal(result.status, 0, result.out);
    const parsed = JSON.parse(result.out) as {
        compilerOptions: {
            types?: string[];
            verbatimModuleSyntax?: boolean;
            erasableSyntaxOnly?: boolean;
        };
    };
    return parsed.compilerOptions;
}

test('root config is the Node+DOM superset', () => {
    const options = optionsOf('tsconfig.json');
    assert.deepEqual(options.types, ['node']);
    assert.equal(options.verbatimModuleSyntax, true);
    assert.equal(options.erasableSyntaxOnly, true);
});

test('browser config is the pure subset', () => {
    const options = optionsOf(
        'web-app/app/tsconfig.json',
    );
    assert.deepEqual(options.types, []);
    assert.equal(options.verbatimModuleSyntax, true);
    assert.equal(options.erasableSyntaxOnly, true);
});

test('browser project rejects process (TS2591)', () => {
    const dir = mkdtempSync(
        join(tmpdir(), 'tsc-purity-'),
    );
    try {
        writeFileSync(
            join(dir, 'leak.ts'),
            'process.exit(0);\n',
        );
        writeFileSync(
            join(dir, 'tsconfig.json'),
            JSON.stringify({
                extends: join(
                    process.cwd(),
                    'web-app/app/tsconfig.json',
                ),
                include: ['./leak.ts'],
            }),
        );
        const result = tsc([
            '--noEmit', '-p', join(dir, 'tsconfig.json'),
        ]);
        assert.notEqual(result.status, 0);
        assert.match(result.out, /TS2591/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
```

Wrap any line that would exceed 78 characters.

- [ ] **Step 2: Run the new test**

```bash
TZ=UTC node --strip-types \
    --import ./tests/hmac-test-key.ts \
    --test tests/tsconfig-covenants.test.ts
```

Expected: 3/3 pass. Runtime ~1 s.

- [ ] **Step 3: Validate**

Run: `./validate`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add tests/tsconfig-covenants.test.ts
git commit -m "Pin the two type-check universes"
```

---

### Task 4: Re-measure and record the family map

No commit. The master runs the measure helper and
writes the live counts into the Task 5–13 reports.
If a family has 0 remaining at its turn, skip its
commit and note the skip.

Snapshot at `afb16a4f` (do not treat as the live
list):

| family | codes | n |
|---|---|---|
| dead code | TS6133, TS6192 | 346 |
| stale expect | TS2578 | 31 |
| undefined names | TS2304 | 2 |
| fixture drift | TS2345, TS2741, TS2322, | ~205 |
| | TS2353, TS2739, TS2339* | |
| arity | TS2554 | 48 |
| absence | TS2379, TS2375 | 35 |
| DOM stubs | TS2740 | 25 |
| narrowing | TS18046, TS18048, TS2367, | ~12 + CLI |
| | TS2459, TS2352, TS2783, | |
| | plus crank/serve spawnSync | |
| | TS2345/TS2339 | |
| measure.ts | remaining TS2339 there | 2 after sleep dies |

\*Fixture TS2339 excludes `web-app/app/measure.ts`
and the crank/serve `stamp` sites.

- [ ] **Step 1: Run the measure helper**

- [ ] **Step 2: Confirm browser `./validate` still green**

---

### Task 5: Dead code (fan-out)

**Codes:** TS6133, TS6192.
**Files:** re-measure; snapshot is 140 files, all
under `tests/` except `web-app/app/measure.ts:76`
(`sleep` unused).

**Idiom:** Delete unused imports, unused locals,
and whole unused import declarations. If the unused
value is an observation of the subject (a response,
a derived head) and the test's title claims it, add
the assertion the title promises; otherwise delete.

Example — unused import and unused helper, delete
(from `tests/adapters-admin.test.ts` at probe):

Before:

```ts
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWriteMessagePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';
```

`formWriteMessagePair`, `TEST_OPERATION_ID`, and
`seedMembership` (the function at line 132 that
calls undefined `seedSeat`) were unused. Delete
the unused imports and the unused function. Do
not import `seedSeat` to keep a dead helper alive.

Example — observation the title claims, assert:

If a test is named `'returns the archived head'`
and `head` is unused, add
`assert.equal(head.state, 'archived')` (or whatever
the title names). Do not invent assertions the
title does not claim.

- [ ] **Step 1: Fan-out per the protocol**

Suggested batches (re-partition from the live
list): `tests/adapters-*`, `tests/api-*`,
`tests/drift-*`, `tests/derive-*`, remainder
including `web-app/app/measure.ts`.

- [ ] **Step 2: Re-measure**

Expected: TS6133 0, TS6192 0. Other codes may
drop (a deleted unused helper can take a TS2304
with it).

- [ ] **Step 3: Validate and commit**

```bash
./validate
git add -u
git commit -m "Delete unused names the root tsc sees"
```

Stage only files this family changed. No
`git add -A`.

---

### Task 6: Stale `@ts-expect-error`

**Codes:** TS2578.
**Files:** re-measure; snapshot 26 files, 31
directives. Pair with Task 11: deleting a
directive may surface TS2740 on the next line;
leave that for Task 11. This commit only removes
unused directives.

**Idiom:** Delete the unused `// @ts-expect-error`
line. Do not replace it with a cast here.

Snapshot files (re-grep; do not treat as frozen):
`tests/adapters-http-facade.test.ts` (5),
`tests/adapters-shared-recovery.test.ts` (2),
and one each in
`tests/adapters-invitations.test.ts`,
`tests/adapters-preferences.test.ts`,
`tests/adapters-refresh-mutex.test.ts`,
`tests/adapters-session-credentials.test.ts`,
`tests/adapters-session-logout.test.ts`,
`tests/auth-redirect-login.test.ts`,
`tests/flows-detail-canvas-focus.test.ts`,
`tests/flows-detail-shortcuts.test.ts`,
`tests/members-detail-reduce.test.ts`,
`tests/navigation.test.ts`,
`tests/page-load-error.test.ts`,
`tests/presenter-barrel.test.ts`,
`tests/presenter-identity-detail.test.ts`,
`tests/presenter-identity-list.test.ts`,
`tests/presenter-identity-providers.test.ts`,
`tests/presenter-identity-tokens.test.ts`,
`tests/presenter-invitation-list.test.ts`,
`tests/presenter-member-detail.test.ts`,
`tests/presenter-project-detail-impact.test.ts`,
`tests/presenter-project-patch.test.ts`,
`tests/presenter-projects-list-column.test.ts`,
`tests/presenter-projects-organization.test.ts`,
`tests/projects-detail-reduce.test.ts`,
`tests/slices-invitation-lifecycle.test.ts`.

- [ ] **Step 1: Delete every unused directive**

- [ ] **Step 2: Re-measure**

Expected: TS2578 0.

- [ ] **Step 3: Validate and commit**

```bash
./validate
git add -u
git commit -m "Drop unused @ts-expect-error directives"
```

---

### Task 7: Undefined names

**Codes:** TS2304.
**Files:** re-measure. Snapshot:

- `tests/adapters-admin.test.ts:142` `seedSeat`
- `tests/adapters-invitations.test.ts:815` `sarah`

**Idiom:** Add the import or the correct existing
name so the line executes. Do not stub. What
happens next is a finding.

`seedSeat`: if Task 5 deleted unused
`seedMembership`, this site is gone — skip it.
If it remains, import from the module that exports
it:

```ts
import { seedSeat } from './root-admin-fixture.ts';
```

`seedSeat` signature (`tests/root-admin-fixture.ts`):

```ts
export async function seedSeat(
    db: DbAdapter,
    organization: Id,
    identityId: Id,
    type: 'admin' | 'member',
    at: string = '2020-01-01T00:00:00.000000Z',
): Promise<void>
```

`sarah`: there is no `sarah` in scope. The
recording context spreads
`toccYYkLEABmlbpHJalgtQ` and must delegate to
that context's POST:

```ts
return toccYYkLEABmlbpHJalgtQ.POST(
    resource, body,
);
```

Run that test. If it goes red, finding rule.

- [ ] **Step 1: Re-measure TS2304; fix remaining sites**

- [ ] **Step 2: Run the touched tests**

```bash
TZ=UTC node --strip-types \
    --import ./tests/hmac-test-key.ts \
    --test tests/adapters-admin.test.ts \
        tests/adapters-invitations.test.ts
```

Expected: pass, or a finding handled per the rule.

- [ ] **Step 3: Validate and commit**

```bash
./validate
git add -u
git commit -m "Define the two names root tsc cannot see"
```

If both sites were already gone, skip the commit.

---

### Task 8: Fixture drift (fan-out)

**Codes:** TS2345, TS2741, TS2322, TS2353, TS2739,
and TS2339 except:
- `web-app/app/measure.ts`
- `tests/crank-cli.test.ts`
- `tests/serve-cli.test.ts`

**Idiom:** Complete each literal to the entity's
true shape through the shared builders in
`tests/*-fixtures.ts` (and
`tests/root-admin-fixture.ts`,
`tests/member-fixtures.ts`,
`tests/identity-fixtures.ts`,
`tests/http-fixtures.ts`,
`tests/context-fixtures.ts`,
`tests/token-fixtures.ts`). Never `as Entity`,
never `Partial<Entity>`, never widening the
production type to fit the test.

Example — missing lifecycle fields on an idea
body. `tests/test-fixtures.ts` already has
`ideaBody` for the minus-id minus-trio shape.
If the callee now requires `IdeaEntity`
including `state` / `state_at` / `state_event_id`,
compose through a local complete builder that
spreads `ideaBody(...)` and adds the real
lifecycle values the entity carries today. Do
not mark those fields optional on `IdeaEntity`.

Example — extra property (TS2353): drop
`description` from a `GraphNode` literal, or
`createdAt` from a `FlowGraph` literal. Do not
widen `GraphNode`.

Example — missing `id` on a relation row
(TS2345): add `id: generateIdentifier()` (or the
fixture's existing id helper), never `as`.

- [ ] **Step 1: Fan-out per the protocol**

- [ ] **Step 2: Re-measure**

Expected: those codes 0 except the excluded
measure/CLI sites.

- [ ] **Step 3: Validate and commit**

```bash
./validate
git add -u
git commit -m "Complete fixtures to the entity shapes"
```

---

### Task 9: Arity (fan-out)

**Codes:** TS2554.
**Files:** re-measure; snapshot 16 files, 48
errors (`tests/derive-record-instances.test.ts` 6,
`tests/document-family.test.ts` 6, others 1–4).

**Idiom:** Pass the real argument, or drop the
extra. Read the callee. If the callee ignored
the missing/extra argument on that path, nothing
changes at runtime. If it read `undefined`,
finding.

- [ ] **Step 1: Fan-out per the protocol**

- [ ] **Step 2: Re-measure**

Expected: TS2554 0.

- [ ] **Step 3: Validate and commit**

```bash
./validate
git add -u
git commit -m "Pass the arity each callee declares"
```

---

### Task 10: Absence, not undefined (fan-out)

**Codes:** TS2379, TS2375.
**Files:** re-measure; snapshot 34 files including
`server/boot.ts:122` and `tests/pair-write-coverage.test.ts:93`.
Most are test-local `req()` helpers.

**Idiom:** Conditional spread where an optional
*parameter* becomes an optional *property*. Never
widen the property to `| undefined`.

`tests/http-fixtures.ts` `apiRequest` input:

```ts
export function apiRequest(input: {
    readonly method: string;
    readonly path: string;
    readonly token?: string;
    readonly body?: unknown;
    readonly operationId?: string;
    readonly headers?: Readonly<Record<string, string>>;
}): Request
```

Broken `req()` (TS2379):

```ts
function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    headers?: Record<string, string>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        headers,
        operationId: TEST_OPERATION_ID,
    });
}
```

Fixed:

```ts
function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    headers?: Record<string, string>,
): Request {
    return apiRequest({
        method,
        path,
        ...(token !== undefined ? { token } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(headers !== undefined
            ? { headers } : {}),
        operationId: TEST_OPERATION_ID,
    });
}
```

`server/boot.ts` `listenHttp` options include
`trustedProxyHops?: string`. `listenEnv.trustedProxyHops`
is `string | undefined`. Spread:

```ts
const listener = await listenHttp({
    adapter,
    staticRoot: staticRootFromMeta(),
    port: listenEnv.port,
    ...(listenEnv.trustedProxyHops !== undefined
        ? {
            trustedProxyHops:
                listenEnv.trustedProxyHops,
        }
        : {}),
});
```

Do not change `HttpListenOptions` to accept
`undefined`.

- [ ] **Step 1: Fan-out per the protocol**

Include `server/boot.ts` in its own one-file
batch (product file; review with extra care).

- [ ] **Step 2: Re-measure**

Expected: TS2379 0, TS2375 0.

- [ ] **Step 3: Validate and commit**

```bash
./validate
git add -u
git commit -m "Spread optional properties only when present"
```

---

### Task 11: DOM stubs

**Codes:** TS2740.
**Files:** re-measure; snapshot 21 files, 25
errors. Same files Task 6 stripped of directives.

**Idiom:** One cast at construction,
`as unknown as Document` (or `Window`,
`HTMLElement`, `Location`, `Storage`). Never a
directive.

Before (after Task 6 the directive is already
gone, leaving TS2740):

```ts
globalThis.document = {
    documentElement: {
        getAttribute: () => 'dashboard',
    },
};
```

After:

```ts
globalThis.document = {
    documentElement: {
        getAttribute: () => 'dashboard',
    },
} as unknown as Document;
```

Same pattern for `globalThis.window`,
`globalThis.location`, element stubs. One cast
per assignment, at the assignment.

- [ ] **Step 1: Cast each remaining stub**

Small enough for one implementer subagent.

- [ ] **Step 2: Re-measure**

Expected: TS2740 0.

- [ ] **Step 3: Validate and commit**

```bash
./validate
git add -u
git commit -m "Cast DOM stubs at construction"
```

---

### Task 12: Narrowing and the singletons

**Codes and sites** (re-measure; skip any already
0):

1. `tests/api-objective-document.test.ts:429-431`
   — `after` is `unknown`. Narrow through the
   document shape the test already fetched, not
   `as Objective`. Read the handler's return.
   If it is `unknown`, decode:

```ts
if (
    typeof after !== 'object'
    || after === null
    || !('state' in after)
    || !('position' in after)
) {
    throw new Error('expected document body');
}
assert.equal(after.state, 'archived');
assert.equal(after.position, 99);
assert.equal('state_at' in after, false);
```

   `noUncheckedIndexedAccess` does not apply to
   `in`-narrowed properties on `object`; if tsc
   still complains, read the value through a
   narrowed local, never `as Objective`.

2. `tests/drift-states.test.ts:533` — index
   guard. `prev.at` / `cur.at` possibly
   undefined. Guard before compare:

```ts
const prevAt = prev.at;
const curAt = cur.at;
if (prevAt === undefined || curAt === undefined) {
    throw new Error('state row missing at');
}
```

   Then compare `prevAt` and `curAt`.

3. `tests/pg-boot.test.ts:144` — `'code' in e`
   instead of the overlapping cast:

```ts
const err = new Error('undefined_table');
Object.assign(err, { code: '42P01' });
```

   Or set via a narrowed alias. The `as { code:
   string }` overlapping conversion (TS2352) goes.
   `hasSchemaMarker` reads `code` from the
   rejected query; keep the runtime the same.

4. `tests/api-entity-history-routes.test.ts:313`
   and `tests/api-work-order-history.test.ts:322`
   — impossible literal comparison (TS2367). Dead
   branches. Findings: delete the dead branch, or
   fix the comparison to the values the test
   actually has. Do not `as string` to silence it.

5. `tests/presenter-flow-stats.test.ts:16` —
   duplicated `id` (TS2783). Spread first, then
   the fields that must win, and do not name `id`
   twice:

```ts
const node = (
    over: Partial<NodeStat> & { id: string },
): NodeStat => ({
    displayName: over.id.toUpperCase(),
    isCreate: false,
    isArchive: false,
    positionX: 0,
    positionY: 0,
    outgoingEdgeIds: [],
    heatPct: 0,
    heatT: 0,
    avgSeconds: null,
    medianSeconds: null,
    p90Seconds: null,
    visitsInWindow: 0,
    distinctWorkOrders: 0,
    currentlyHere: 0,
    throughputPerWeek: 0,
    revisitRatePct: 0,
    clanSize: 0,
    activeProducerCount: 0,
    topProducer: null,
    assignmentLabel: 'Unassigned',
    memberHazard: null,
    branchSplit: [],
    ...over,
});
```

   Keep the rest of the `NodeStat` defaults that
   the file already names. The point is one `id`,
   from `...over`.

6. `tests/adapters-members.test.ts:15` — import
   `HumanMember` from the module that exports it:

```ts
import {
    type HumanMember,
} from '../web-app/app/adapters/members.ts';
```

   Not from `presenters/member.ts` (it imports
   `HumanMember` and does not re-export it).

7. `tests/crank-cli.test.ts` and
   `tests/serve-cli.test.ts` — `spawnSync` with
   `encoding: 'utf8'` must return
   `SpawnSyncReturns<string>`, and `stamp` must
   be on the type:

```ts
import {
    spawnSync,
    type SpawnSyncReturns,
} from 'node:child_process';

type Spawned = SpawnSyncReturns<string> & {
    stamp: string;
};

function runCrank(args: string[]): Spawned {
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
```

   Same shape for `runServe` in
   `tests/serve-cli.test.ts`. If the `encoding: 'utf8'`
   overload still will not pick `string`, pass
   `encoding: 'utf8' as const`.

- [ ] **Step 1: Apply each singleton idiom**

One implementer subagent. Do not bundle leftover
fixture codes into this commit.

- [ ] **Step 2: Run the touched tests**

```bash
TZ=UTC node --strip-types \
    --import ./tests/hmac-test-key.ts \
    --test tests/api-objective-document.test.ts \
        tests/drift-states.test.ts \
        tests/pg-boot.test.ts \
        tests/api-entity-history-routes.test.ts \
        tests/api-work-order-history.test.ts \
        tests/presenter-flow-stats.test.ts \
        tests/adapters-members.test.ts \
        tests/crank-cli.test.ts \
        tests/serve-cli.test.ts
```

Expected: pass, or findings per the rule.

- [ ] **Step 3: Re-measure, validate, commit**

Expected remaining root errors: only
`web-app/app/measure.ts` TS2339 (two).

```bash
./validate
git add -u
git commit -m "Narrow the remaining singleton errors"
```

---

### Task 13: Narrow measure.ts budget offenders

**Files:**
- Modify: `web-app/app/measure.ts`

`sleep` was unused (Task 5). Remaining: lines
that read `o.medianReadyMs` on a union of
`BudgetOffender` and `{ page, reason:
"unknown-page", budgetReadyMs }` without
`medianReadyMs`.

`BudgetOffender` (`web-app/app/measure-core.ts`):

```ts
export type BudgetOffender = {
    page: string;
    reason:
        | 'over-budget'
        | 'missing-budget'
        | 'unknown-page';
    medianReadyMs?: number;
    budgetReadyMs?: number;
};
```

**Idiom:** Do not widen `BudgetOffender`. Build
the stale-key objects as `BudgetOffender` values
(they already have `reason: 'unknown-page'`).
Then `offenders` is `BudgetOffender[]` and
`medianReadyMs` is an optional property, read
after a presence check — which the file already
does. The failure is the extra object type in
the array. Annotate the stale-key map:

```ts
const staleOffenders: BudgetOffender[] =
    staleBudgetKeys.map((page) => ({
        page,
        reason: 'unknown-page',
        budgetReadyMs: budgets[page]!.readyMs,
    }));
const offenders: BudgetOffender[] = [
    ...staleOffenders,
    ...(verdict.ok ? [] : verdict.offenders),
];
```

Then `o.medianReadyMs !== undefined` is legal
under `exactOptionalPropertyTypes` because the
property is optional on the type, not
`| undefined` from a missing key on a different
object type.

Do not add `medianReadyMs: undefined` to the
stale-key objects.

- [ ] **Step 1: Type the offenders array**

- [ ] **Step 2: Re-measure**

Expected: root tsc total 0.

```bash
npx --no-install tsc --noEmit -p tsconfig.json
npx --no-install tsc --noEmit \
    -p web-app/app/tsconfig.json
```

Both exit 0.

- [ ] **Step 3: Validate and commit**

```bash
./validate
git add web-app/app/measure.ts
git commit -m "Narrow measure budget offenders by reason"
```

---

### Task 14: Flip the gate

**Files:**
- Modify: `validate`
- Modify: `AGENTS.md` (Gates paragraph only)

Same commit: the gate and the Gates paragraph
that describes it.

- [ ] **Step 1: Add the root tsc line**

`validate` today begins:

```bash
npx --no-install tsc --noEmit -p web-app/app/tsconfig.json

./test
```

Replace the tsc line with two:

```bash
npx --no-install tsc --noEmit -p tsconfig.json
npx --no-install tsc --noEmit -p web-app/app/tsconfig.json

./test
```

- [ ] **Step 2: Name both projects in AGENTS.md Gates**

Replace the sentence that says
`` `./validate` composes `tsc --noEmit`, then
`./test` `` with:

```
`./validate` composes `tsc --noEmit -p tsconfig.json`
(the whole tree, Node + DOM) then `tsc --noEmit -p
web-app/app/tsconfig.json` (the browser subset,
`types: []`), then `./test` (two
```

Keep the rest of the Gates paragraph. Wrap at 78.
AGENTS.md ceiling is 300 lines; it is 247 today.
This edit must stay under 300 (`wc -l AGENTS.md`).

- [ ] **Step 3: Validate**

Run: `./validate`
Expected: exit 0. Both tsc lines run. `./test`
includes `tests/tsconfig-covenants.test.ts`.

- [ ] **Step 4: Artifact identity**

```bash
AFTER="$TMPDIR/wt-after"
rm -rf "$AFTER"
./build --no-zip "$AFTER"
cmp "$TMPDIR/wt-before/server.mjs" "$AFTER/server.mjs"
cmp "$TMPDIR/wt-before/assets/app.js" "$AFTER/assets/app.js"
cmp "$TMPDIR/wt-before/assets/theme-init.js" \
    "$AFTER/assets/theme-init.js"
cmp "$TMPDIR/wt-before/assets/root-redirect.js" \
    "$AFTER/assets/root-redirect.js"
```

Expected: all four `cmp` silent, exit 0. If
`$TMPDIR/wt-before` was lost, rebuild from the
commit before Task 2 (`git stash` not needed;
`git worktree` forbidden) by checking those four
files out of a `./build --no-zip` at that SHA in
a temp copy, or re-run Task 2 Step 1's command
against that SHA in `$TMPDIR` via
`git archive`. Any difference is explained before
this commit lands, or the commit is wrong.

- [ ] **Step 5: Commit**

```bash
git add validate AGENTS.md
git commit -m "Type-check the whole tree in validate"
```

---

### Task 15: Two type universes invariant

**Files:**
- Modify: `AGENTS.md` (Invariants that bite)

- [ ] **Step 1: Add the invariant after
  `noUncheckedIndexedAccess`**

Insert, wrapping at 78:

```
### Two type universes

The root `tsconfig.json` is the superset and the
editor's catch-all (`types: ["node"]`, DOM lib,
`verbatimModuleSyntax`, `erasableSyntaxOnly`).
`web-app/app/tsconfig.json` extends it and
overrides only `types: []` — the pure browser
subset. A Node-only module goes on that file's
`exclude` list and nowhere else; missing from the
list fails the browser project on `node:` imports.
`erasableSyntaxOnly` and `verbatimModuleSyntax`
are what `node --strip-types` requires at runtime,
enforced at `tsc`.
```

The existing `noUncheckedIndexedAccess` entry's
"tsconfig enables this" stays true.

- [ ] **Step 2: Confirm the ceiling**

```bash
wc -l AGENTS.md
```

Expected: ≤ 300.

- [ ] **Step 3: Validate and commit**

```bash
./validate
git add AGENTS.md
git commit -m "Document the two type-check universes"
```

---

### Task 16: TEST-PLAN AT1 names both commands

**Files:**
- Modify: `TEST-PLAN.md`

- [ ] **Step 1: Replace the AT1 line**

Today AT1 names only
`npx tsc --noEmit -p web-app/app/tsconfig.json`.

Replace with two commands, wrapped at 78:

```
- [ ] **AT1** Run `npx tsc --noEmit -p tsconfig.json`,
  then `npx tsc --noEmit -p web-app/app/tsconfig.json`.
  PASS: both exit 0; no diagnostics emitted.
```

- [ ] **Step 2: Validate and commit**

`TEST-PLAN.md` is exempt from the root-doc line
ceiling. `./validate` still runs.

```bash
./validate
git add TEST-PLAN.md
git commit -m "Name both tsc projects in AT1"
```

---

### Task 17: Stale Node-only banners

**Files:** re-grep at execution:

```bash
grep -nE 'excluded from tsc|no @types/node' \
    server/*.ts web-app/app/*.ts
```

Known at spec time (line numbers drift):
`web-app/app/browser-drive.ts`,
`web-app/app/cdp-client.ts`,
`web-app/app/generate-api-documentation.ts`,
`web-app/app/measure-viz.ts`,
`web-app/app/measure.ts`,
`server/http-server.ts`,
`server/boot.ts`,
`server/scrypt-hash.ts`.

**Idiom:** The *why* survives ("Node APIs; on the
browser exclude list"). The false clause
("excluded from tsc (no `@types/node`)") goes.
Do not touch `api/document-family.ts` or
`api/routes.ts` type-only-import comments.

Examples:

`server/boot.ts` banner becomes:

```ts
// Fail-fast boot. Argv → env → pool → UTF8 →
// marker → listen. No DDL; seed with
// ./postgres-seed.
// One mint process: do not run two of these.
// Node-only; on the browser exclude list.
```

`server/http-server.ts`:

```ts
// Node-only HTTP adapter. node:http → Request →
// handleRequest → ServerResponse. Static files from
// composed output. On the browser exclude list.
```

`server/scrypt-hash.ts`:

```ts
// Node-only scrypt hasher. Isolated so the client
// bundle never statically imports node:crypto. On
// the browser exclude list. boot() registers
// hasher + derive.
```

`web-app/app/generate-api-documentation.ts`:

```ts
// Dev tooling, like generate-schema-svg.ts: run
// with `node --strip-types`, Node APIs, on the
// browser exclude list, kept under the 78-char
// lint.
```

`cdp-client.ts` / `browser-drive.ts` / `measure.ts`
/ `measure-viz.ts`: keep "Node-only" / "Node APIs";
replace "Excluded from (browser) tsc (no
`@types/node`)" with "On the browser exclude list".

- [ ] **Step 1: Re-grep and rewrite every hit**

- [ ] **Step 2: Validate and commit**

```bash
./validate
git add -u
git commit -m "Drop the false excluded-from-tsc banners"
```

---

### Task 18: Close TODO.md item 1

**Files:**
- Modify: `TODO.md`

Close protocol: remove the bullet, renumber,
shift Sequencing, drop the stale later-work
clause. No KNOWN seam, no AUDIT.md `m`.

- [ ] **Step 1: Critical path count and item 1**

"Thirteen items" → "Twelve items".

Delete the whole item-1 paragraph (Type-check the
whole tree … types-only.).

Renumber former 2–13 to 1–12. Internal
cross-references inside those items that say
"Item N" also shift by one (item 5's health probe
consumed by former 11, etc. — read each item).

- [ ] **Step 2: Sequencing arrows**

Today:

```
- 9 → 7 (the chat clause consumes chats)
- 5 → 11 (the health probe consumes `/status`)
- Item 3's token-at-rest hashing
```

After the shift:

```
- 8 → 6 (the chat clause consumes chats)
- 4 → 10 (the health probe consumes `/status`)
- Item 2's token-at-rest hashing
```

- [ ] **Step 3: Later-work browser-config bullet**

Today ends:

```
Three live references (`validate`, TEST-PLAN.md AT1,
the critical-path item) plus the tiers plan's path
```

Drop "the critical-path item". The live
references are `validate`, TEST-PLAN.md AT1, and
the tiers plan's path. AGENTS.md now also names
`web-app/app/tsconfig.json` in Gates and the new
invariant — mention those if they are now live
references, still under the 500-line ceiling
(TODO.md is 490 today).

- [ ] **Step 4: Confirm ceilings**

```bash
wc -l TODO.md AGENTS.md
```

Expected: TODO.md ≤ 500, AGENTS.md ≤ 300.

- [ ] **Step 5: Validate and commit**

```bash
./validate
git add TODO.md
git commit -m "Close whole-tree type checking"
```

---

### Task 19: Final checkpoint

- [ ] **Step 1: Both tsc projects zero**

```bash
npx --no-install tsc --noEmit -p tsconfig.json
npx --no-install tsc --noEmit \
    -p web-app/app/tsconfig.json
./validate
```

Expected: all three exit 0.

- [ ] **Step 2: Covenant tests still pass**

```bash
TZ=UTC node --strip-types \
    --import ./tests/hmac-test-key.ts \
    --test tests/tsconfig-covenants.test.ts
```

Expected: 3/3.

- [ ] **Step 3: Artifact identity (repeat Task 14
  cmp if `$TMPDIR/wt-before` still exists)**

- [ ] **Step 4: Final code-quality review of the
  whole series**

Dispatch a code-quality reviewer over
`git log --oneline afb16a4f..HEAD` with
BASE_SHA=`afb16a4f` (or the SHA this plan started
from) and HEAD_SHA=`HEAD`. Fix Critical and
Important issues. Do not start verification-tiers
Task 12 until this review is clean.

---

## Subagent briefing (every dispatch)

First line of every prompt:

```
Go to Medium Church!
```

Then push down:

- Voice: 78-char max in linted files, 4-space
  indent, present-tense imperative commit subjects
  ≈50 chars, Co-Authored-By trailer (master
  commits; implementers of fan-out batches do not).
- Commandments this work touches: I Reliability
  (the gate), III Uniformity, V Clarity, VIII
  Simplicity.
- Abominations: Test Weakening, Unbidden Helper
  Code, Default Values, Internal Defense,
  Premature Generalization.
- Patterns: `RequestContext` first on adapters;
  snake_case storage / camelCase domain; no
  untyped `any` from external boundaries;
  `exactOptionalPropertyTypes` means absence is
  the absence of the key.
- Work on master. No worktrees. No push.

## Self-review (spec coverage)

| Spec requirement | Task |
|---|---|
| `@types/node` 24.13.3 exact | 1 |
| Root `tsconfig.json` + browser `extends` / `types: []` | 2 |
| Artifact baseline before configs | 2.1 |
| Covenant pin (showConfig + TS2591) | 3 |
| Re-measure; families not counts | 4 |
| Dead code idiom + fan-out | 5 |
| Stale `@ts-expect-error` | 6 |
| Undefined names + finding rule | 7 |
| Fixture drift, no `as Entity` | 8 |
| Arity | 9 |
| Absence via conditional spread; `boot.ts` | 10 |
| DOM stubs, one cast | 11 |
| Narrowing singletons + spawnSync | 12 |
| measure.ts offender union | 13 |
| Flip validate + Gates paragraph | 14 |
| Artifact cmp at flip | 14.4 |
| Two type universes invariant | 15 |
| TEST-PLAN AT1 | 16 |
| Stale banners; leave type-only comments | 17 |
| TODO.md Close protocol | 18 |
| Sequencing vs tiers Tasks 12–13 | Global |
| Non-goals (tsc -b, engines, Deno, | none |
| DOM-free server, move tools, rename | |
| browser config) | |

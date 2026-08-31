# Deno Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this spec's worktree (AGENTS.md
> § Worktrees).

**Goal:** Retire Node from this repository. Deno 2.9.5 runs
the gates, builds one self-contained executable, serves the
product, drives the tooling, runs the suite, and — if the
gate in Part 6 opens — talks to Postgres without an `npm:`
specifier.

**Architecture:** Six parts, one per spec, strictly
sequential. Part 1 moves `./validate` and `./test` to Deno
while every artifact stays Node. Part 2 replaces the ZIP of
`server.mjs` with one `deno compile` binary and deletes
`package.json`. Part 3 ports `server/` from `node:http` to
`Deno.serve`. Part 4 ports the seven Node-only modules under
`web-app/app/` and `postgres-lib`'s eight inline programs.
Part 5 converts 408 test files from `node:test` to
`Deno.test`. Part 6 is optional and opens only if its
decision gate says so. Each part ends green: `./validate`,
`./test-postgres`, and `./test-all` all pass before the next
part begins.

**Tech Stack:** Deno 2.9.5 (`deno check`, `deno test`,
`deno bundle`, `deno compile`, `deno info`, `deno eval`),
TypeScript ES2024 strict, Bash, `npm:postgres@3.4.9`,
`jsr:@std/path`, `jsr:@std/assert`, `jsr:@std/testing`,
Docker (`denoland/deno:2.9.5`), Postgres 18.

**Spec:** six scrolls, read in this order — each part of this
plan names its own:

1. `docs/superpowers/specs/2026-08-21-deno-toolchain-design.md`
2. `docs/superpowers/specs/2026-08-21-deno-build-artifact-design.md`
3. `docs/superpowers/specs/2026-08-21-deno-server-idiom-design.md`
4. `docs/superpowers/specs/2026-08-21-deno-tooling-idiom-design.md`
5. `docs/superpowers/specs/2026-08-21-deno-test-idiom-design.md`
6. `docs/superpowers/specs/2026-08-21-deno-postgres-driver-design.md`

The roadmap the six specs inherit left with the `docs/`
cleanout and lives only in history:

```sh
git show 9620d38c:docs/superpowers/specs/\
2026-08-21-deno-migration-roadmap-design.md
```

## Global Constraints

- **Base:** master at `e1cbeac9`. Ride a worktree; never
  merge, never push (AGENTS.md § Worktrees).
- **Deno 2.9.5, pinned.** Every `deno` invocation in a root
  script passes `--frozen`. Never `-A`; permissions are
  always named.
- **The oracle.** Measured at `e1cbeac9` under Node
  v26.7.0, `./test`:

  | Suite | tests | pass | fail | skipped | duration |
  |---|--:|--:|--:|--:|--:|
  | `tests/*.test.ts` (TZ=UTC) | 3476 | 3469 | 0 | 7 | 17.2 s |
  | `tests/tz/*.test.ts` (Honolulu) | 8 | 8 | 0 | 0 | 0.16 s |

  Under Deno the skipped tests report as **ignored** and the
  summary reads `ok | 3469 passed | 0 failed | 7 ignored`.
  A count that moves is a finding, never a rounding. Task 1
  re-measures and any later task that changes the counts
  must name which tests moved and why.
  `./test-browser`'s ten files are green at `e1cbeac9` and
  must stay green.
- **One concern per commit.** Subject one line, ≈50 chars,
  present-tense imperative, no body prose. Every commit
  message ends with exactly these two trailer lines:

  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
  ```

- **Never move and change content in one commit.**
- **`./validate` green before every commit.** Its
  composition changes as this plan runs; the current
  composition is always what `validate` itself says.
- **78-character lines, 4-space indent** in every file the
  lint covers (`api/`, `web-app/`, `tests/`, `shared/`,
  `server/` `*.ts|html|css`, plus the root scripts named in
  `validate`). `web-app/app/compose.ts` is excluded from the
  lint by path and stays so. Markdown is NOT line-linted;
  AGENTS.md carries a 300-line ceiling (281 today) and
  README.md 150. TODO.md and TEST-PLAN.md are exempt.
- **`deno.json` joins the 78-character lint; `deno.lock` is
  generated and exempt.**
- **Required env is never logged:** `POSTGRES_URL`,
  `JWT_HMAC_SIGNING_KEY`, `HTTP_SERVER_PORT`.
- **The `org` identifier ban** holds under `api/`,
  `web-app/`, `tests/`, and `shared/`. Write
  `organization`.
- **`./test-browser`, `./test-all`, `./crank`, and
  `docker compose` cannot run inside the Claude Code
  sandbox** — Chrome cannot `bind()` its ProcessSingleton
  socket and Docker is outside. Never invoke them from a
  subagent. Where this plan needs their output, the
  controller asks the operator to run `! ./test-all` (or the
  named command) and reads the result from the
  conversation.
- **`./crank` in the sandbox needs `TMPDIR=/tmp/claude`.**
- **Subagent proselytization (AGENTS.md § Subagents).**
  Every dispatch prompt this plan produces MUST begin with
  the literal phrase `Go to Medium Church!` — the Medium
  scroll, never the Full one — followed by the
  codebase-specific patterns the scripture cannot know: the
  voice rules above, the commandments the task touches, the
  abominations it risks, and the existing patterns to match
  (RequestContext first, SafeHtml from presenters,
  snake_case storage / camelCase domain, HTTP-verb adapter
  naming, validators at the gate, no untyped `any` at a
  boundary).
- **Frozen:** every dated file under
  `docs/superpowers/specs/` and `docs/superpowers/plans/`
  (except this one) is byte-identical when this plan
  finishes. Do not edit them.
- **Node stays until its part retires it.** Part 1 leaves
  Node required by `./build`, `build-lib`, `./test-browser`,
  `./test-all`, `./crank`, `./serve`, `./measure`,
  `./postgres-seed`, `./postgres-wipe`, and `postgres-lib`.
  Part 2 retires the first six; Part 4 retires the rest.
  Never claim Node is gone before the part that removes it.

## Rulings this plan makes

Specs 2 through 6 are outlines. Each carries a
`## Decisions Deferred to This Spec's Brainstorm` section
and an `## Open Items` list. Those brainstorms did not
happen. Rather than write tasks that pretend the questions
are settled, this plan does two things: it **rules** on each
deferred decision here, in the open, and it turns each open
item into a **probe task** placed ahead of the work that
consumes it.

A ruling is a decision made without its brainstorm. Each is
listed with what it costs if wrong so the reader can undo
it.

| # | Ruling | Cost if wrong |
|---|---|---|
| R1 | **Spec 2, operator tools:** one `fusion-angle` binary whose first argument selects `serve`, `seed`, or `wipe`. The spec recommends this; the ZIP becomes `fusion-angle-${SHA}.zip` and is self-sufficient (unzip, seed, serve). | Three compiles and three ~100 MB binaries instead of one. Task 21's dispatcher and Task 22's ZIP name are re-cut; nothing else moves. |
| R2 | **Spec 2, runtime image:** `denoland/deno:2.9.5` for both stages. The spec recommends this; the healthcheck cannot lie about the runtime. | A larger runtime image. Swap to `debian:bookworm-slim` plus `curl` and re-cut the healthcheck — Task 25 only. |
| R3 | **Spec 3, the 500 body:** an explicit `onError` handler, never `Deno.serve`'s default. `http-server.test.ts` pins `{"error":"internal error"}` with `Cache-Control: no-store`; a framework default is not a covenant. | None. The explicit handler is strictly more controlled than the default. |
| R4 | **Spec 3, the navigate tests:** `http-static-directory-index.test.ts` keeps `node:http` until Part 5. `Sec-*` is a forbidden request header name, so `fetch` cannot set `sec-fetch-mode`. Task 29 probes it; if Deno permits it, the change is Part 5's, not Part 3's. | One test file ports a part later than it could have. |
| R5 | **Spec 4, `jsr:@std/path`:** adopt it — the repository's first `jsr:` dependency, pinned in the import map and `deno.lock`. `measure.ts` and `cdp-client.ts` do real path work (`join`, `dirname`, `resolve`, `extname`, `relative`); hand-rolled `URL` arithmetic for `relative` and `extname` is string code nobody asked for. | One dependency. Removing it means hand-rolling five helpers in one module. |
| R6 | **Spec 5, codemod commits:** one commit per test family, each green. The spec recommends this. The families measured at `e1cbeac9` are `api-*` 109, `adapters-*` 50, `flow-*` 26, `presenter-*` 24, `http-*` 17, `drift-*` 16, `mock-*` 13, `derive-*` 13, `validators-*` 6, `pg-*` 6, `backend-*` 5, and 111 unprefixed. | Eleven review surfaces instead of one. Reversible by squashing. |
| R7 | **Spec 5, `hmac-test-key.ts`:** survives as a preload. Converting 400 files to import it explicitly is churn against a preload that already works under both runtimes. | The preload stays where an explicit import would have been clearer. One later commit converts it. |
| R8 | **Spec 6, whether at all:** not pre-committed. Task 56 is a decision gate with named criteria, run after Part 5. If it says no, this plan ends at Task 55 and the spec stays an outline. | None. The gate is the spec's own instruction. |
| R9 | **TODO.md placement:** the migration appends as critical-path **item 13**, and one `## Sequencing` line records that it runs ahead of items 1–12. Items are NOT renumbered: `## Sequencing` cross-references items by number (`8 → 6`, `5 → 10`, `Item 3's token-at-rest hashing`), and inserting at position 1 would silently break all three. | The critical path reads in an order it is not executed in, corrected only by the Sequencing line. A renumber pass touching `## Sequencing` undoes it. |

---

## The Node-to-Deno mapping

Tasks 32, 33, 38, 39, 40, 41, 42, 43, and 51 each name this
section. **Read it in full** — it is the whole of the
mechanical port, and a task's brief does not repeat it.

### Files

| From | To |
|---|---|
| `readFileSync(p, 'utf8')` | `Deno.readTextFileSync(p)` |
| `writeFileSync(p, s)` | `Deno.writeTextFileSync(p, s)` |
| `existsSync(p)` | a helper: `try { Deno.statSync(p); return true } catch { return false }` |
| `mkdirSync(p, { recursive: true })` | `Deno.mkdirSync(p, { recursive: true })` |
| `readdirSync(p)` | `[...Deno.readDirSync(p)].map((e) => e.name)` |
| `statSync(p)` | `Deno.statSync(p)` — note `isFile` is a **property**, not a method |
| `rmSync(p, { recursive: true })` | `Deno.removeSync(p, { recursive: true })` |
| `cpSync(a, b, { recursive: true })` | `@std/fs`'s `copySync`, added to the import map and pinned |
| `createReadStream(p)` | `(await Deno.open(p, { read: true })).readable` |

**Catch the named error, never every error.**
`Deno.readTextFileSync` throws `Deno.errors.NotFound` for an
absent file. Catch that type. A bare `catch` here swallows a
permission fault and reports it as a missing file — the Sin
of the Greedy Catch, and a fault you cannot name is a fault
you cannot handle.

### Paths

`node:path` → `@std/path`: `join`, `dirname`, `resolve`,
`extname`, `relative`. `node:url`'s `fileURLToPath` →
`@std/path`'s `fromFileUrl`; `pathToFileURL` → `toFileUrl`.
For a module's own directory, `import.meta.dirname` replaces
the `dirname(fileURLToPath(import.meta.url))` dance.

### Process

| From | To |
|---|---|
| `process.env.X` / `process.env['X']` | `Deno.env.get('X')` — **by name**; `Deno.env.toObject()` is forbidden under a scoped `--allow-env` |
| `process.argv.slice(2)` | `Deno.args` — already sliced |
| `process.argv[1]` (an `isMainModule`/`isCliEntry` match) | `import.meta.main` |
| `process.stdout.write(s)` | `Deno.stdout.writeSync(enc.encode(s))` |
| `process.stderr.write(s)` | `Deno.stderr.writeSync(enc.encode(s))` |
| `process.exit(n)` | `Deno.exit(n)` |
| `process.exitCode = n` | `Deno.exitCode = n` |
| `process.kill(-pid, sig)` | `Deno.kill(-pid, sig)` |

Declare **one** `const enc = new TextEncoder();` per module
that writes — one small writer per file. `console` is never
used for machine output: these are JSON log lines, and a
`console.log` prefix would corrupt them.

### Operating system and process spawning

| From | To |
|---|---|
| `cpus().length` | `navigator.hardwareConcurrency` |
| `platform()` | `Deno.build.os` |
| `arch()` | `Deno.build.arch` |
| `tmpdir()` + the `TMPDIR` fallback chain | `Deno.makeTempDirSync()` |
| `createServer()` free-port dance (`node:net`) | `Deno.listen({ port: 0 })`, read `addr.port`, **close it** |
| `spawn(cmd, args, opts)` | `new Deno.Command(cmd, { args, ... }).spawn()` |
| `execFile(cmd, args)` + `promisify` | `await new Deno.Command(cmd, { args }).output()` |
| `spawnSync(cmd, args)` | `new Deno.Command(cmd, { args }).outputSync()` |

**Two traps, both silent:**

- `Deno.build.os` returns `'darwin'` / `'linux'` /
  `'windows'` where `platform()` returned `'darwin'` /
  `'linux'` / `'win32'`. Check **every** comparison. A
  `=== 'win32'` that quietly becomes false is a fallacy,
  not an off-by-one — the fourth commandment's distinction
  exactly.
- `Deno.Command`'s `env` **replaces** the environment rather
  than extending it. Pass everything the child needs,
  `PATH` included.

`Deno.Command`'s `output()` returns `stdout` and `stderr` as
`Uint8Array`; decode with a `TextDecoder`.

---

# Part 1 — Toolchain

**Spec:** `docs/superpowers/specs/2026-08-21-deno-toolchain-design.md`

`./validate` runs with Node absent. `./build`, `build-lib`,
`./test-browser`, `./serve`, `./measure`, and the seed keep
Node until Part 2.

---

### Task 1: Install Deno 2.9.5 and record the Node oracle

**Files:** none. This task commits nothing. Its deliverable
is two recorded measurements every later task reads.

**Interfaces:**
- Consumes: nothing.
- Produces: `deno` on `PATH` at exactly 2.9.5, and the
  Node baseline counts written into the task report.

**This task needs the operator.** Installing a toolchain
reaches the network and writes outside the repository. The
controller asks the operator to run the install with `!`
and reads the result from the conversation; the subagent
does not install it.

- [ ] **Step 1: Confirm Deno is absent, then install it**

```bash
deno --version 2>/dev/null || echo "DENO ABSENT"
```

If absent, the operator runs:

```bash
curl -fsSL https://deno.land/install.sh | sh -s v2.9.5
```

- [ ] **Step 2: Verify the exact version**

Run: `deno --version`
Expected: the first line reads `deno 2.9.5` exactly. A
different patch is a BLOCKED report, not a shrug — every
measurement in this plan is against 2.9.5.

- [ ] **Step 3: Record the Node oracle**

```bash
./test 2>&1 | grep -E '^ℹ (tests|pass|fail|skipped|duration_ms)'
```

Expected, and what the report must contain verbatim:

```
ℹ tests 3476
ℹ pass 3469
ℹ fail 0
ℹ skipped 7
ℹ duration_ms 17210.856625      (yours will differ)
ℹ tests 8
ℹ pass 8
ℹ fail 0
ℹ skipped 0
```

If `tests` is not 3476 or `pass` is not 3469, STOP and
report: the tree moved since this plan was written, and the
oracle in Global Constraints must be re-cut before any task
proceeds.

- [ ] **Step 4: Record the Node wall time**

```bash
{ time ./test > /dev/null 2>&1 ; } 2>&1 | grep real
```

Write the figure into the report. Task 15 puts it in
AGENTS.md beside Deno's.

**No commit.** Report DONE with both measurements.

---

### Task 2: Put the Deno migration on TODO.md's critical path

**Files:**
- Modify: `TODO.md` (`## Critical path` intro line 8 and its
  tail; the `## Later work` Deno bullet at 304–307;
  `## Sequencing` at 1205)

**Interfaces:**
- Consumes: nothing.
- Produces: TODO.md item 13. No later task reads it; the
  final documentation task of the last part that runs
  removes it, per `## Close protocol`.

Later work has one home, and `./validate` gates it: the
`## Critical path` heading must appear exactly once in
TODO.md, and no other root doc may defer work in prose. The
existing bullet under `## Later work` moves — it does not
get copied.

- [ ] **Step 1: Read the three sites**

```bash
sed -n '6,10p;302,308p;1203,1208p' TODO.md
```

You will see the critical path's intro ("Twelve items, in
this order"), the `## Later work` bullet beginning "The Deno
migration as one block", and the `## Sequencing` bullet "The
Deno specs run strictly 1 → 6".

- [ ] **Step 2: Change the count in the intro**

Change `Twelve items, in this order` to
`Thirteen items, in this order`.

- [ ] **Step 3: Delete the `## Later work` bullet**

Delete these four lines exactly (TODO.md 304–307):

```
- The Deno migration as one block — six specs, strict
  1 → 6, 3 and 4 may swap after Spec 2's measurements,
  Spec 6 optional (the measurements after Spec 5
  decide); the roadmap is `9620d38c`
```

- [ ] **Step 4: Append item 13 to `## Critical path`**

Append after item 12, before the `## Later work` heading:

```markdown
13. Retire Node — the Deno migration, six specs run
    strictly 1 → 6 (3 and 4 may swap after Spec 2's
    measurements; Spec 6 is optional and opens only if
    its decision gate says so). Spec 1 moves `./validate`
    and `./test` to Deno 2.9.5; Spec 2 replaces the
    `server.mjs` ZIP with one `deno compile` binary and
    deletes `package.json`; Spec 3 puts `server/` on
    `Deno.serve`; Spec 4 ports the seven Node-only
    modules under `web-app/app/` and `postgres-lib`'s
    eight inline programs; Spec 5 moves 408 test files
    to `Deno.test`; Spec 6 would replace
    `npm:postgres@3.4.9` with `jsr:@db/postgres`. The
    six specs are `docs/superpowers/specs/2026-08-21-deno-*`;
    the plan is
    `docs/superpowers/plans/2026-08-30-deno-migration.md`;
    the roadmap they inherit is `9620d38c`. Oracle: the
    suite counts hold at every step — 3469 passing,
    7 ignored, `tests/tz/` 8, `./test-browser` ten files
    green.
```

- [ ] **Step 5: Add the sequencing line**

In `## Sequencing`, replace:

```
- The Deno specs run strictly 1 → 6 (3 and 4 may swap
  after Spec 2's measurements; Spec 6 optional)
```

with:

```
- The Deno specs run strictly 1 → 6 (3 and 4 may swap
  after Spec 2's measurements; Spec 6 optional)
- Item 13 runs ahead of items 1–12 — the toolchain moves
  before the product changes, so every later item is
  written once, in the new idiom. The numbering is
  positional, not chronological; renumbering would break
  this section's references to items 3, 5, 6, 8, and 10
```

- [ ] **Step 6: Verify the single-home gate still passes**

```bash
grep -c '^## Critical path' TODO.md
grep -c 'Deno migration as one block' TODO.md
./validate
```

Expected: `1`, then `0`, then `./validate` exits 0.

- [ ] **Step 7: Commit**

```bash
git add TODO.md
git commit -m "$(cat <<'MSG'
Put the Deno migration on the critical path

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 3: Add `deno.json` and `deno.lock`, and probe the tree

**Files:**
- Create: `deno.json`
- Create: `deno.lock` (generated by `deno install`)
- Modify: `validate` (the second `awk "$AWK_LINT"` list)

**Interfaces:**
- Consumes: Deno 2.9.5 from Task 1.
- Produces: the import map (`postgres`, `esbuild`) and the
  compiler options every later `deno` invocation resolves
  against. **Also produces four measurements** Tasks 6, 9,
  12, and 13 consume — record all four in the report even
  when the answer is "no diagnostics".

- [ ] **Step 1: Write `deno.json`**

Create `deno.json` with exactly this content:

```json
{
    "nodeModulesDir": "none",
    "imports": {
        "postgres": "npm:postgres@3.4.9",
        "esbuild": "npm:esbuild@0.28.0"
    },
    "compilerOptions": {
        "strict": true,
        "lib": ["es2024", "dom", "dom.iterable", "deno.ns"],
        "noFallthroughCasesInSwitch": true,
        "noUncheckedIndexedAccess": true,
        "noImplicitReturns": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true,
        "exactOptionalPropertyTypes": true,
        "verbatimModuleSyntax": true,
        "erasableSyntaxOnly": true
    }
}
```

The root `tsconfig.json` also sets `target`, `module`,
`moduleResolution`, `esModuleInterop`, `skipLibCheck`,
`forceConsistentCasingInFileNames`, `resolveJsonModule`,
`isolatedModules`, `allowImportingTsExtensions`, and
`noEmit`. All ten are implied by Deno's resolver and
transpiler, which accept only explicit specifiers and never
emit. Do not carry them over.

- [ ] **Step 2: Generate the lock**

```bash
deno install
git status --porcelain
```

Expected: `deno.lock` created; `git status` shows only
`deno.json` and `deno.lock` (plus `TODO.md` already
committed). This is the one step that reaches
`registry.npmjs.org`; every later `deno` call passes
`--frozen`. If `node_modules/` appears, `nodeModulesDir`
was not honored — STOP and report.

- [ ] **Step 3: Add `deno.json` to the 78-character lint**

In `validate`, the second `awk "$AWK_LINT"` invocation lists
the root scripts. Change:

```bash
    awk "$AWK_LINT" build build-lib serve test test-postgres \
        test-browser test-all \
        validate generate-schema-svg \
        generate-api-documentation measure \
        postgres-wipe postgres-lib postgres-seed \
        crank \
        Dockerfile compose.yaml .dockerignore
```

to:

```bash
    awk "$AWK_LINT" build build-lib serve test test-postgres \
        test-browser test-all \
        validate generate-schema-svg \
        generate-api-documentation measure \
        postgres-wipe postgres-lib postgres-seed \
        crank deno.json \
        Dockerfile compose.yaml .dockerignore
```

`deno.lock` is generated and stays out of the list.
`tests/validate-lint.test.ts` pins that the lint block has
no markdown and names `crank`; it is untouched by this
change and must still pass.

- [ ] **Step 4: PROBE A — `deno check` diagnostics**

```bash
deno check --frozen api shared server tests web-app \
    > "$TMPDIR/deno-check.txt" 2>&1; echo "exit=$?"
grep -cE '^(error|TS[0-9]+)' "$TMPDIR/deno-check.txt"
sed -n '1,120p' "$TMPDIR/deno-check.txt"
```

Record the exit code and every distinct diagnostic in the
report, grouped by file. The tree is clean under both `tsc`
projects today, so what appears here is Deno's own
diagnostics — the `deno.ns` lib and its compat typings.
Expected families, from the 2026-08-21 measurement:
`compose.ts`'s two bare builtin imports (Task 4), the 35
extensionless dynamic imports (Task 5), and possibly
`measure.ts:372` and `:416` (Task 6). **Anything outside
those three families is a finding** — name it in the report;
the controller rules on it before Task 4 starts.

- [ ] **Step 5: PROBE B — is `erasableSyntaxOnly` honored?**

Deno reports an unsupported compiler option as a warning,
not a failure. A silently dropped `erasableSyntaxOnly`
leaves erasability unenforced for two parts, while
`node --strip-types` still runs `compose.ts`, the operator
tools, `./measure`, and `./test-browser`.

```bash
grep -in 'unsupported\|unknown\|ignor\|warn' "$TMPDIR/deno-check.txt"
```

Then prove it positively — Deno must reject an enum:

```bash
printf 'enum E { A }\nexport const e = E.A;\n' \
    > "$TMPDIR/erasable-probe.ts"
deno check --frozen "$TMPDIR/erasable-probe.ts" 2>&1 | tail -5
```

Expected: a diagnostic naming `erasableSyntaxOnly`. If it
checks clean, the option is NOT honored — record that as
Probe B = NOT HONORED. It does not block this task; Task 15
names it in AGENTS.md as unenforced until Part 4 retires
`node --strip-types`.

- [ ] **Step 6: PROBE C — the browser fence**

The root `tsconfig.json` sets `types: ["node"]` and
`web-app/app/tsconfig.json` overrides `types: []`, so a
browser-reach file referencing `process` fails TS2591.
Under Deno there is no second project. Measure whether the
fence survives:

```bash
printf 'process.exit(0);\n' > "$TMPDIR/fence-probe.ts"
deno check --frozen "$TMPDIR/fence-probe.ts" 2>&1 | tail -5
```

- **Rejects it** (a TS2591-shaped diagnostic) → Probe C =
  FENCE HOLDS. Task 13 retargets
  `tests/tsconfig-covenants.test.ts`'s browser-fence test to
  spawn `deno check` instead of `tsc`.
- **Accepts it** → Probe C = FENCE LOST (Node globals typed
  everywhere by `deno.ns` plus compat). Task 13 deletes the
  test with the reason in the commit, and Task 15 names the
  fence as lost in AGENTS.md § Two type universes.

- [ ] **Step 7: PROBE D — the suite, cold under Deno**

```bash
export JWT_HMAC_SIGNING_KEY=test-hmac-signing-key
TZ=UTC deno test --frozen --parallel --no-check \
    --allow-env --allow-read --allow-write \
    --allow-net --allow-run \
    --preload ./tests/hmac-test-key.ts \
    tests/*.test.ts 2>&1 | tail -40
```

This runs WITHOUT the `localStorage` preload and WITHOUT
the debouncer fix, so failures are expected. Record the
summary line and every failing test name. The 2026-08-21
measurement was 3320 pass, 5 fail, 5 ignored in 9.7 s, the
five failures all `debouncer.test.ts`'s mock timers.
**Failures outside `debouncer.test.ts` and the
`localStorage` family are a finding** — name them; Tasks 7
and 8 are scoped to those two families only.

- [ ] **Step 8: Verify and commit**

```bash
./validate
```

Expected: exits 0. Nothing in this commit changes what
`./validate` runs — `deno.json` is inert until Task 12 and
the lint list gains one file.

```bash
git add deno.json deno.lock validate
git commit -m "$(cat <<'MSG'
Add deno.json and deno.lock

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

Report all four probes (A, B, C, D) in the report file. The
controller carries C's verdict into Task 13 and B's into
Task 15.

---

### Task 4: Prefix `compose.ts` builtin imports with `node:`

**Files:**
- Modify: `web-app/app/compose.ts:1-9`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing later tasks name. Valid under both
  runtimes; `build-lib` still runs the file under Node until
  Task 17.

`web-app/app/compose.ts` holds the only two bare builtin
imports in the repository. It is excluded from the
78-character lint by path (`! -path
'web-app/app/compose.ts'` in `validate`), so its long lines
stay long.

- [ ] **Step 1: Change both specifiers**

At line 8, change `} from 'fs';` to `} from 'node:fs';`

At line 9, change:

```ts
import { join, dirname, resolve } from 'path';
```

to:

```ts
import { join, dirname, resolve } from 'node:path';
```

- [ ] **Step 2: Prove no bare builtin import remains**

```bash
grep -rnE "from '(fs|path|os|http|url|crypto|net|child_process)'" \
    web-app api shared server tests
```

Expected: no output.

- [ ] **Step 3: Verify under both runtimes**

```bash
deno check --frozen web-app/app/compose.ts 2>&1 | tail -5
D=$(mktemp -d "${TMPDIR:-/tmp}/compose-probe.XXXXXX")
node --strip-types web-app/app/compose.ts "$D" && ls "$D" | head
rm -rf "$D"
./validate
```

Expected: `deno check` reports nothing for this file's
imports; the Node run composes pages into the temp
directory; `./validate` exits 0.

- [ ] **Step 4: Commit**

```bash
git add web-app/app/compose.ts
git commit -m "$(cat <<'MSG'
Prefix compose.ts builtin imports with node:

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 5: Add extensions to the 35 dynamic imports

**Files:**
- Modify: `web-app/app/page-registry.ts` (29 sites)
- Modify: `web-app/app/header-info.ts:17,40`
- Modify: `web-app/app/invitations-indicator.ts:27,39`
- Modify: `web-app/app/sidebar-member.ts:44`
- Modify: `web-app/app/app-boot.ts:85`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing later tasks name. esbuild resolves both
  forms to the same file and inlines them, so
  `assets/app.js` must be **byte-identical** before and
  after. That identity is this task's oracle.

Deno's resolver accepts only explicit specifiers. These 35
are every extensionless dynamic import in the tree.
`sidebar-member.ts:63` already carries `.ts` and is NOT one
of them — do not touch it.

- [ ] **Step 1: Capture the BEFORE bundle**

The tree is clean at Task 4's commit, which `./build`
requires.

```bash
BEFORE=$(mktemp -d "${TMPDIR:-/tmp}/before.XXXXXX")
./build --no-zip "$BEFORE/"
shasum -a 256 "$BEFORE/assets/app.js"
```

Record the digest in the report.

- [ ] **Step 2: Add `.ts` to the 29 `page-registry.ts` loaders**

Every `loader: () => import('../<dir>/<file>')` becomes
`loader: () => import('../<dir>/<file>.ts')`. The 29
targets, in file order:

```
../dashboard/index          ../workbox/index
../organization/index       ../workbox/detail
../ideas/index              ../members/index
../ideas/detail             ../members/detail
../ideas/create             ../invitations/index
../ideas/convert            ../identities/index
../projects/index           ../identities/detail
../projects/detail          ../identity-providers/index
../records/index            ../identity-tokens/index
../records/create           ../billing/index
../records/detail           ../api-documentation/index
../flows/index              ../design-system/index
../flows/detail             ../auth/index
../flows/stats              ../landing/index
                            ../not-found/index
```

Two of them (`../identity-providers/index` and
`../identity-tokens/index`) sit on their own continuation
line after `import(`; they change the same way.

- [ ] **Step 3: Fix the six remaining sites**

| File:line | From | To |
|---|---|---|
| `header-info.ts:17` | `'./adapters'` | `'./adapters/index.ts'` |
| `header-info.ts:40` | `'./safe-html'` | `'./safe-html.ts'` |
| `invitations-indicator.ts:27` | `'./adapters'` | `'./adapters/index.ts'` |
| `invitations-indicator.ts:39` | `'./adapters'` | `'./adapters/index.ts'` |
| `sidebar-member.ts:44` | `'./adapters'` | `'./adapters/index.ts'` |
| `app-boot.ts:85` | `'./command-palette'` | `'./command-palette.ts'` |

`web-app/app/adapters/index.ts` is the directory's entry;
`./adapters` resolved to it implicitly under esbuild and
must name it explicitly under Deno.

- [ ] **Step 4: Prove no extensionless dynamic import remains**

```bash
grep -rn --include='*.ts' "import(" web-app/app \
    | grep -v "\.ts')" | grep -v "\.ts\`" | grep -v "\.ts'$"
```

Expected: no output. (Before the change this printed 36
lines — the 35 plus `sidebar-member.ts:63`, which already
had its extension and prints as a bare `await import(`
continuation. Check any survivor by eye before calling it
done.)

- [ ] **Step 5: Type-check and test**

```bash
deno check --frozen web-app 2>&1 | tail -10
./validate
```

Expected: the 35-site import family is gone from the
`deno check` output; `./validate` exits 0.

- [ ] **Step 6: Commit**

```bash
git add web-app/app
git commit -m "$(cat <<'MSG'
Add extensions to dynamic imports

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

- [ ] **Step 7: Prove `app.js` is byte-identical**

```bash
AFTER=$(mktemp -d "${TMPDIR:-/tmp}/after.XXXXXX")
./build --no-zip "$AFTER/"
cmp "$BEFORE/assets/app.js" "$AFTER/assets/app.js" \
    && echo "IDENTICAL"
rm -rf "$BEFORE" "$AFTER"
```

Expected: `IDENTICAL`. **A difference is a BLOCKED report,
not a shrug** — it means a specifier now resolves to a
different module, and the commit must be revisited before
Task 6 begins.

---

### Task 6: Widen `MeasureEnv` — only if Probe A objected

**Files:**
- Modify: `web-app/app/measure-cli.ts` (the `MeasureEnv`
  alias) — **conditionally**

**Interfaces:**
- Consumes: Task 3's PROBE A output.
- Produces: nothing later tasks name.

**This task may produce no commit.** `measure.ts:372` and
`:416` pass `process.env` (`NodeJS.ProcessEnv`, an index
signature) where `MeasureEnv`, a weak type of three
optional keys, is declared. TypeScript 6.0.3 with
`@types/node` 24.13.3 accepts both sites today; the
2026-08-21 `deno check` did not.

- [ ] **Step 1: Read Probe A's verdict**

Search Task 3's report for diagnostics naming
`measure.ts:372`, `measure.ts:416`, or `MeasureEnv`.

**If Probe A reported none:** do nothing. Report DONE with
"Probe A clean at both sites; no widening. A widening
nobody asked for is unbidden." Skip every remaining step.

- [ ] **Step 2: Widen the alias**

Only if Probe A objected. In `web-app/app/measure-cli.ts`,
replace the `MeasureEnv` declaration with:

```ts
export type MeasureEnv =
    Readonly<Record<string, string | undefined>>;
```

Every reader already treats each key as
`string | undefined`, so no call site and no
`measure-cli` test changes.

- [ ] **Step 3: Verify**

```bash
deno check --frozen web-app/app/measure.ts \
    web-app/app/measure-cli.ts 2>&1 | tail -5
./validate
```

Expected: both diagnostics gone; `./validate` exits 0 with
`tests/measure-cli.test.ts` unchanged and passing.

- [ ] **Step 4: Commit**

```bash
git add web-app/app/measure-cli.ts
git commit -m "$(cat <<'MSG'
Widen MeasureEnv to the env bag shape

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 7: Add the `localStorage` test preload

**Files:**
- Create: `tests/local-storage-stub.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `tests/local-storage-stub.ts`, a preload Task 9
  passes to `deno test` as `--preload
  ./tests/local-storage-stub.ts`. Part 5 keeps it as the
  baseline beneath per-test fixtures.

Deno ships a real Web Storage global: assigning
`globalThis.localStorage` is ignored, `localStorage.setItem
= fn` stores a key, and the store persists across
processes. Thirty of the 37 files that touch `localStorage`
stub it by module-level assignment. Installing a writable
in-memory fake first makes every such stub take effect and
keeps every test off persistent storage. **No test file is
edited by this task.**

- [ ] **Step 1: Write the preload**

Create `tests/local-storage-stub.ts` with exactly this
content. Every line is at or under 78 characters.

```ts
// Preload for ./test. Deno ships a real Web Storage
// global: assigning globalThis.localStorage is ignored,
// `localStorage.setItem = fn` stores a key, and the
// store persists across processes. Thirty-three test
// files stub localStorage by assignment. Installing a
// writable in-memory fake first makes every such stub
// take effect and keeps every test off persistent
// storage. Node-neutral.
const store = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
    value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
        clear: () => {
            store.clear();
        },
        key: () => null,
        get length() {
            return store.size;
        },
    },
    writable: true,
    configurable: true,
});
```

`getItem` returns `null` for an absent key because that is
the Web Storage contract the adapters code against — the
stub speaks the platform's tongue, not a default of its
own. This is not the Sin of Default Values: `null` here is
the specified return, not a fiction of completeness.

- [ ] **Step 2: Prove it is Node-neutral**

```bash
export JWT_HMAC_SIGNING_KEY=test-hmac-signing-key
TZ=UTC node --strip-types \
    --import ./tests/hmac-test-key.ts \
    --import ./tests/local-storage-stub.ts \
    --test tests/theme.test.ts 2>&1 | tail -12
```

Expected: the file passes with the same count it reports
without the preload. Run it once each way and compare.

- [ ] **Step 3: Prove it cures the Deno failures**

```bash
TZ=UTC deno test --frozen --parallel --no-check \
    --allow-env --allow-read --allow-write \
    --allow-net --allow-run \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    tests/*.test.ts 2>&1 | tail -25
```

Expected: every `localStorage`-family failure Probe D
recorded is gone. `debouncer.test.ts` still fails — Task 8
owns it. Record the new summary line.

- [ ] **Step 4: Verify and commit**

```bash
./validate
```

Expected: exits 0. `./test` still runs under Node and does
not load this preload yet.

```bash
git add tests/local-storage-stub.ts
git commit -m "$(cat <<'MSG'
Add the localStorage test preload

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 8: Reset mock timers in the six debouncer tests

**Files:**
- Modify: `tests/debouncer.test.ts` (the six tests beginning
  at lines 17, 35, 52, 70, 87, and 103)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing later tasks name. Part 5 replaces this
  file's timers with `@std/testing/time`'s `FakeTime`; this
  task is what keeps it green in between.

Node resets mock timers at the end of every test. Deno's
compat layer does not, so the second `t.mock.timers.enable`
throws "already enabled". The explicit reset is idempotent
under Node and required under Deno.

- [ ] **Step 1: Add the reset to each of the six tests**

Each test whose body calls `t.mock.timers.enable(…)` gains,
as the **first statement of the test body** — before the
`enable` call:

```ts
        t.after(() => { t.mock.timers.reset(); });
```

Match the file's existing indentation. Six sites; the tests
begin at lines 17, 35, 52, 70, 87, and 103 before the edit.

- [ ] **Step 2: Prove it under Node**

```bash
export JWT_HMAC_SIGNING_KEY=test-hmac-signing-key
node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/debouncer.test.ts 2>&1 | tail -12
```

Expected: the same pass count as before the edit, 0 failed.

- [ ] **Step 3: Prove it under Deno**

```bash
deno test --frozen --no-check \
    --allow-env --allow-read --allow-write \
    --allow-net --allow-run \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    tests/debouncer.test.ts 2>&1 | tail -12
```

Expected: 0 failed. This is the file's first green run
under Deno.

- [ ] **Step 4: Verify and commit**

```bash
./validate
```

Expected: exits 0.

```bash
git add tests/debouncer.test.ts
git commit -m "$(cat <<'MSG'
Reset mock timers in debouncer tests

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 9: Run `./test` under Deno

**Files:**
- Modify: `test` (the whole runner block, lines 4–16)

**Interfaces:**
- Consumes: `tests/local-storage-stub.ts` (Task 7),
  `tests/debouncer.test.ts`'s resets (Task 8).
- Produces: `./test` as a Deno command. Task 10 mirrors its
  flag array without `--parallel` and without preloads;
  Part 2 narrows `--allow-run`; Part 5 turns off
  `--no-check`'s companion assumptions.

- [ ] **Step 1: Replace the runner block**

Keep line 10 (`export JWT_HMAC_SIGNING_KEY=…`) exactly as
it is. Replace the file's body so `test` reads:

```bash
#!/bin/bash
set -euo pipefail

# Instants render in LOCAL time, so date-formatting
# output shifts with the runner's zone — a false prophet
# on a non-UTC machine. Pin UTC for the main suite
# (deterministic), then verify the instant-vs-calendar
# distinction under a fixed offset zone in tests/tz/
# (Honolulu, UTC-10, no DST). The tests/*.test.ts glob
# is non-recursive, so it excludes tests/tz/.
#
# --no-check: deno check covers tests/ in ./validate;
# checking again at run time buys nothing.
# Permissions, named: env (signing key, TZ, POSTGRES_URL
# skips), read (fixtures, scripts, source walkers),
# write (temp dirs for the HTTP tests), net (127.0.0.1
# listeners), run (the metafile test's esbuild binary;
# the serve and crank CLI pins spawn their scripts).
export JWT_HMAC_SIGNING_KEY="${JWT_HMAC_SIGNING_KEY:-test-hmac-signing-key}"
DENO_TEST=(
    deno test --frozen --parallel --no-check
    --allow-env --allow-read --allow-write
    --allow-net --allow-run
    --preload ./tests/hmac-test-key.ts
    --preload ./tests/local-storage-stub.ts
)
TZ=UTC "${DENO_TEST[@]}" tests/*.test.ts
TZ=Pacific/Honolulu "${DENO_TEST[@]}" tests/tz/*.test.ts
```

Never `-A`. The five permissions are named because a
permission you cannot name is a permission you cannot
audit.

- [ ] **Step 2: Run it and match the oracle**

```bash
bash -n test
time ./test 2>&1 | tail -20
```

Expected, from Global Constraints:

```
ok | 3469 passed | 0 failed | 7 ignored
```

for the main suite, and `8 passed | 0 failed` for
`tests/tz/`. Record the wall time — Task 15 puts it in
AGENTS.md beside Node's 17.2 s.

**If any count differs from the oracle, STOP.** Name every
test that moved. Do not weaken a test to reach the number:
when test and code diverge, the code changes.

- [ ] **Step 3: Run it three times and compare**

```bash
for i in 1 2 3; do ./test 2>&1 | grep -E '^(ok|error)' ; done
```

Expected: three identical summary lines. `deno test` runs
every module a worker receives in one isolate, so
module-level state persists from file to file within a
worker — the divergence from Node's process-per-file. A
count that moves between runs is that divergence until
proven otherwise; record it and report DONE_WITH_CONCERNS.

- [ ] **Step 4: Verify and commit**

```bash
./validate
```

Expected: exits 0, now running the suite under Deno.

```bash
git add test
git commit -m "$(cat <<'MSG'
Run tests under Deno

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 10: Run `./test-postgres` under Deno

**Files:**
- Modify: `test-postgres` (lines 8–15)

**Interfaces:**
- Consumes: Task 9's flag vocabulary.
- Produces: `./test-postgres` as a Deno command. Part 6's
  gate runs it against the new driver.

The seven files share one Postgres and run serially today.
**No `--parallel`** — parallelism there is a measurement for
later, not an assumption. **No preloads** — the script
passes no `--import` today and the files bring their own
fixtures.

- [ ] **Step 1: Replace the runner block**

Keep lines 1–7 (the shebang, the `POSTGRES_URL` guard, the
`SCHEMA_NAME` export) exactly. Replace lines 8–15 with:

```bash
# No --parallel: the seven files share one Postgres and
# run serially. No preloads: the files bring their own
# fixtures. Permissions match ./test minus write.
DENO_PG_TEST=(
    deno test --frozen --no-check
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

- [ ] **Step 2: Verify it parses and lints**

```bash
bash -n test-postgres
./validate
```

Expected: silent, then exit 0.

- [ ] **Step 3: Run it against the compose Postgres**

**Docker is outside the sandbox.** The controller asks the
operator to run, with `!`:

```bash
docker compose up --wait postgres
POSTGRES_URL='postgres://fusion:PW@127.0.0.1/fusion' \
    ./test-postgres
```

Expected: seven files pass, 0 failed. If `--allow-write` or
`--allow-sys` is demanded, Deno names the missing permission
in the failure — add exactly that one, with a comment saying
which file demanded it, and re-run.

- [ ] **Step 4: Commit**

```bash
git add test-postgres
git commit -m "$(cat <<'MSG'
Run Postgres tests under Deno

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 11: Run the generators under `deno run`

**Files:**
- Modify: `generate-schema-svg:8`
- Modify: `generate-api-documentation:3-4`

**Interfaces:**
- Consumes: `deno.json` (Task 3).
- Produces: both generators as `deno run` commands.
  `./validate`'s two `--check` gates call them; their byte
  parity against the committed `SCHEMA.svg` and
  `web-app/api-documentation/` is the oracle.

Under `deno run`, `process.argv` is `[deno, script, …args]`
— Node's shape — so each script's `--check` detection and
its `isCliEntry()` match on `argv[1]` hold unchanged. **No
TypeScript in either generator changes in this task.**

- [ ] **Step 1: Find the API generator's output directory**

```bash
grep -rn "api-documentation" web-app/app/generate-api-documentation.ts \
    | grep -iE "write|outdir|path|join" | head
```

Record the exact directory it writes. The `--allow-write`
scope in Step 3 must name it and nothing wider.

- [ ] **Step 2: Rewrite `generate-schema-svg`**

Keep the comment block (lines 4–7). Replace line 8 with:

```bash
deno run --frozen --allow-read --allow-write=SCHEMA.svg \
    web-app/app/generate-schema-svg.ts "$@"
```

- [ ] **Step 3: Rewrite `generate-api-documentation`**

Replace lines 3–4 with the same shape, `--allow-write`
scoped to the directory Step 1 found:

```bash
deno run --frozen --allow-read \
    --allow-write=web-app/api-documentation \
    web-app/app/generate-api-documentation.ts "$@"
```

If Step 1 found a different path, use that path. A wider
scope than the generator writes is a permission you cannot
justify.

- [ ] **Step 4: Prove byte parity both ways**

```bash
shasum -a 256 SCHEMA.svg > "$TMPDIR/svg-before.txt"
./generate-schema-svg --check && echo "SVG CHECK OK"
./generate-api-documentation --check && echo "API CHECK OK"
./generate-schema-svg
./generate-api-documentation
git status --porcelain
shasum -a 256 -c "$TMPDIR/svg-before.txt"
```

Expected: both `--check` gates pass; the two bare
regenerations leave `git status` empty; the digest matches.
A dirty tree here means the Deno run emits different bytes
than Node did — a BLOCKED report, since `./validate` gates
on exactly this parity.

- [ ] **Step 5: Verify and commit**

```bash
grep -c node generate-schema-svg generate-api-documentation
./validate
```

Expected: `0` for both files, then exit 0.

```bash
git add generate-schema-svg generate-api-documentation
git commit -m "$(cat <<'MSG'
Run the generators under Deno

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 12: Type-check with `deno check`

**Files:**
- Modify: `validate:4-5`

**Interfaces:**
- Consumes: Tasks 4, 5, and 6 (the source fixes that make
  the tree check clean).
- Produces: `deno check --frozen api shared server tests
  web-app` as the type gate. Task 14 deletes the two
  `tsconfig.json` files this replaces.

The five roots are exactly what the root `tsconfig.json`
includes today, `tests/` among them.

- [ ] **Step 1: Confirm the tree checks clean first**

```bash
deno check --frozen api shared server tests web-app
echo "exit=$?"
```

Expected: exit 0, no diagnostics. **If anything remains,
STOP and report it** — the gate goes in green or not at
all. Do not add a suppression; Decision 7 of the spec names
three source fixes and no suppression among them.

- [ ] **Step 2: Replace the two `tsc` lines**

In `validate`, replace:

```bash
npx --no-install tsc --noEmit -p tsconfig.json
npx --no-install tsc --noEmit -p web-app/app/tsconfig.json
```

with:

```bash
deno --version
deno check --frozen api shared server tests web-app
```

`deno --version` is evidence, not a gate: the pinned 2.9.5
is visible in every transcript.

- [ ] **Step 3: Verify**

```bash
./validate
```

Expected: exits 0, and the transcript opens with
`deno 2.9.5` followed by a clean `deno check`.

- [ ] **Step 4: Commit**

```bash
git add validate
git commit -m "$(cat <<'MSG'
Type-check with deno check

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 13: Retarget or retire the tsconfig covenant pin

**Files:**
- Modify or Delete: `tests/tsconfig-covenants.test.ts`
  (86 lines; tests at 43, 50, 59)

**Interfaces:**
- Consumes: Task 3's PROBE C verdict.
- Produces: the browser fence either pinned by a test or
  named as lost. Task 15's AGENTS.md § Two type universes
  says which.

The file holds three tests. Two — 'root config is the
Node+DOM superset' (43) and 'browser config is the pure
subset' (50) — spawn `tsc --showConfig` to pin the two
option sets. **Both leave with `tsc`, unconditionally.**
The third — 'browser project rejects process (TS2591)' (59)
— pins the fence, and Probe C decides its fate.

- [ ] **Step 1: Read Probe C's verdict from Task 3's report**

- [ ] **Step 2a: FENCE HOLDS — retarget the third test**

Delete the two `--showConfig` tests and their `tsc` helper.
Rewrite the third to spawn `deno check` on a temporary file
that references `process`, asserting the diagnostic. Keep
the test name. The file's remaining imports must be exactly
what it still uses — `noUnusedLocals` is on.

Then rename the file to match what it now pins:

```bash
git mv tests/tsconfig-covenants.test.ts \
    tests/browser-fence.test.ts
```

**Two commits, never one** — the rename and the content
change never share a commit. Rewrite content first, commit;
then `git mv`, commit.

- [ ] **Step 2b: FENCE LOST — delete the file**

```bash
git rm tests/tsconfig-covenants.test.ts
```

The commit message body is forbidden by the Office of the
Commit, so the reason goes in the subject as far as it
fits, and in AGENTS.md at Task 15. Subject:
`Retire the tsconfig covenant pin`.

- [ ] **Step 3: Check TEST-PLAN.md's pin-path gate**

`./validate` fails if TEST-PLAN.md cites a `tests/…test.ts`
path that no longer exists.

```bash
grep -n 'tsconfig-covenants' TEST-PLAN.md
```

If it appears, update the citation in the same commit — to
`tests/browser-fence.test.ts` under 2a, or remove the
clause under 2b.

- [ ] **Step 4: Verify and commit**

```bash
./validate
```

Expected: exits 0. Under 2a the retargeted test passes;
under 2b the suite's count drops by exactly 3 — record the
new oracle in the report and tell the controller, which
carries it into every later task.

---

### Task 14: Drop `tsc`

**Files:**
- Delete: `tsconfig.json`
- Delete: `web-app/app/tsconfig.json`
- Modify: `package.json`, `package-lock.json` (via npm)

**Interfaces:**
- Consumes: Tasks 12 and 13 — the gate is `deno check` and
  the covenant pin no longer spawns `tsc`.
- Produces: a tree with no TypeScript compiler.
  `package.json` survives for `esbuild` and `postgres`
  until Part 2 deletes it.

- [ ] **Step 1: Prove nothing still calls `tsc`**

```bash
grep -rn 'tsc\b' validate test test-postgres test-browser \
    test-all build build-lib serve crank measure \
    generate-schema-svg generate-api-documentation \
    postgres-seed postgres-wipe postgres-lib \
    Dockerfile compose.yaml tests/ 2>/dev/null
```

Expected: no output. Any hit is a caller Task 13 missed —
fix it first.

- [ ] **Step 2: Delete both project files**

```bash
git rm tsconfig.json web-app/app/tsconfig.json
```

- [ ] **Step 3: Remove the two devDependencies**

```bash
npm uninstall typescript @types/node
```

Expected: `package.json` keeps `esbuild` 0.28.0 and
`postgres` 3.4.9 and nothing else; `package-lock.json` is
rewritten.

- [ ] **Step 4: Verify**

```bash
node -e "const p=require('./package.json');console.log(JSON.stringify(p.devDependencies))"
./validate
```

Expected: the two survivors only, then exit 0. `./build`
and `./test-browser` still work — they need `esbuild`, not
`tsc`.

- [ ] **Step 5: Confirm `./build` still runs under Node**

```bash
git status --porcelain
```

If the tree is dirty from Step 3, commit first (Step 6),
then:

```bash
D=$(mktemp -d "${TMPDIR:-/tmp}/build-probe.XXXXXX")
./build --no-zip "$D/" && ls "$D" && rm -rf "$D"
```

Expected: `server.mjs` and the composed site. Part 2 owns
this script; it must still work until then.

- [ ] **Step 6: Commit**

```bash
git add -A tsconfig.json web-app/app/tsconfig.json \
    package.json package-lock.json
git commit -m "$(cat <<'MSG'
Drop tsc

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 15: Document the Deno toolchain

**Files:**
- Modify: `AGENTS.md` (command block; § Gates 67–78;
  § `noUncheckedIndexedAccess` 221–225; § Two type
  universes 226–246)
- Modify: `README.md` § Getting Started (35–48)
- Modify: `TEST-PLAN.md` (the Layer 1 row at 12; AT1 at
  209; AT2 at 213; AT3 at 215)

**Interfaces:**
- Consumes: Task 9's Deno wall time, Task 13's Probe C
  verdict, Task 3's Probe B verdict.
- Produces: the documented state of Part 1. Part 2's
  documentation task edits the same files again.

**The line ceilings bind.** `./validate` gates AGENTS.md at
300 lines (281 before this task) and README.md at 150. The
§ Two type universes rewrite is what buys the room: 21 lines
become about 8, since there is one universe now.

- [ ] **Step 1: AGENTS.md — the command block**

Add one line stating that Deno 2.9.5 is the toolchain for
`./validate` and `./test`, and that `./build`,
`./test-browser`, and `./crank` still need `npm ci` until
Part 2 lands.

- [ ] **Step 2: AGENTS.md — § Gates**

Replace the two `tsc --noEmit` clauses in the first
paragraph (lines 67–70) with
`deno check --frozen api shared server tests web-app`.
Name `./test` as `deno test --parallel` with the two
preloads and `--no-check`, and both generator gates as
`deno run`. Add the measured wall time from Task 9 beside
Node's 17.2 s baseline.

- [ ] **Step 3: AGENTS.md — § `noUncheckedIndexedAccess`**

Change `tsconfig enables this` to `deno.json enables this`.
The rest of the paragraph stands.

- [ ] **Step 4: AGENTS.md — § Two type universes**

There is one universe now. Replace the whole section with a
short one naming: the `deno check` roots
(`api shared server tests web-app`) as the successor to the
root project's `include`; that the browser file's `exclude`
registry has no successor, because one universe checks the
seven Node-only modules beside everything else; and the
fence's fate from Probe C —

- **FENCE HOLDS:** name the retargeted test
  (`tests/browser-fence.test.ts`) as what pins it.
- **FENCE LOST:** name it as lost beside `deno.ns`, and say
  what catches a stray `process` or `Deno.*` in client code
  instead — the browser, where `./test-browser` (Layer 2)
  and the walk (Layer 3) see it.

If Probe B reported `erasableSyntaxOnly` NOT HONORED, add
one sentence: erasability is unenforced until Part 4 retires
`node --strip-types`, and an enum or namespace introduced
meanwhile surfaces at `./build`, `./test-browser`, or seed
time instead of at `deno check`.

- [ ] **Step 5: AGENTS.md — one new invariant**

Under § Invariants that bite, add a short subsection: under
Deno `localStorage` is a real global that persists across
processes; `tests/local-storage-stub.ts` installs the
writable in-memory fake the tests stub, and it is a preload,
not an import.

- [ ] **Step 6: README.md — § Getting Started**

Today's paragraph says `npm ci` installs tsc. After Task 14
it does not. Rewrite the section to install Deno 2.9.5 and
to say plainly that `npm ci` remains for `./build`,
`build-lib`, and `./test-browser` until Part 2, and what it
still installs (esbuild, postgres.js 3.4.9).

- [ ] **Step 7: TEST-PLAN.md — four sites**

| Site | Change |
|---|---|
| Layer 1 row (line 12) | "both `tsc` projects" → the one `deno check` line |
| AT1 (line 209) | the `npx tsc --noEmit -p tsconfig.json` command → `deno check --frozen api shared server tests web-app` |
| AT2 (line 213) | the delegated command text → the two `deno test` invocations; the PASS wording → `ok \| N passed \| 0 failed \| 7 ignored` |
| AT3 (line 215) | the lint's root-script list gains `deno.json`; the composition names AT1's new command |

AT5 (`./test-browser`) is **untouched** — Part 2 owns it.

- [ ] **Step 8: Verify the ceilings and the gates**

```bash
wc -l AGENTS.md README.md
./validate
```

Expected: AGENTS.md at or under 300, README.md at or under
150, `./validate` exits 0. The later-work single-home gate
also runs here: no root doc but TODO.md and TEST-PLAN.md may
carry deferral prose, so do not write "later" phrasing into
AGENTS.md or README.md.

- [ ] **Step 9: Prove Node is called nowhere in the gate**

```bash
grep -c node validate test test-postgres \
    generate-schema-svg generate-api-documentation
```

Expected: `0` for each of the five files. This is Part 1's
goal, stated as a command.

- [ ] **Step 10: Commit**

```bash
git add AGENTS.md README.md TEST-PLAN.md
git commit -m "$(cat <<'MSG'
Document the Deno toolchain

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

## Part 1 exit gate

Before Part 2 begins, all of these hold. The controller
runs the first three and asks the operator for the rest.

```bash
deno --version                     # 2.9.5
./validate                         # exit 0, Node called nowhere
grep -c node validate test test-postgres \
    generate-schema-svg generate-api-documentation   # 0 ×5
```

- `./test-postgres` against the compose Postgres: seven
  files pass (operator, `!`).
- `./build --no-zip` and `./serve dir/ port` still build and
  boot under Node (operator).
- `./test-browser` still passes under Node — ten files
  green (operator, `!`).
- The oracle holds: `3469 passed | 0 failed | 7 ignored`,
  `tests/tz/` 8 passed. If Task 13 took branch 2b, the
  count is 3 lower and the controller has recorded the new
  oracle.

---

# Part 2 — Build and artifact

**Spec:** `docs/superpowers/specs/2026-08-21-deno-build-artifact-design.md`

`./build` runs on Deno alone and emits one executable: the
composed site embedded, postgres.js embedded, the permission
covenant baked in. `package.json`, `package-lock.json`, and
`node_modules/` leave the repository.

**Ruling R1 applies:** one `fusion-angle` binary whose first
argument selects `serve`, `seed`, or `wipe`. The ZIP becomes
`fusion-angle-${SHA}.zip` and is self-sufficient — unzip,
seed, serve.

**Ruling R2 applies:** `denoland/deno:2.9.5` for both Docker
stages.

---

### Task 16: Probe the Deno build surface

**Files:** none. This task commits nothing. Its deliverable
is seven recorded measurements that Tasks 17–29 consume.

**Interfaces:**
- Consumes: Part 1's `deno.json`, `deno.lock`, and gates.
- Produces: seven verdicts, each named below. Record every
  one in the report even when the answer is the expected
  one — a later task that reads "not measured" must stop.

The spec's `## Open Items` says "the plan's first tasks
verify". This is that task. Each probe names what changes if
the answer is not the expected one.

- [ ] **Step 1: PROBE 1 — is `git` in `denoland/deno:2.9.5`?**

The builder stage runs `./build`, which gates on a clean
tree (`git status --porcelain`) and reads
`git rev-parse --short=7 HEAD` for the ZIP name.

Operator runs, with `!`:

```bash
docker run --rm denoland/deno:2.9.5 \
    sh -c 'git --version || echo "GIT ABSENT"'
```

- **Present** → Task 26's builder stage is as written.
- **Absent** → Task 26's builder stage installs git
  (`apt-get update && apt-get install -y --no-install-recommends
  git`) before `COPY . .`, OR `./build` gains a documented
  `--no-clean-check` path. Prefer installing git: the
  clean-tree gate is doctrine, and a build flag that skips
  it is a hole that stays open.

- [ ] **Step 2: PROBE 2 — does `node:fs` read the compiled FS?**

`server/http-server.ts` serves static files with
`createReadStream` and `stat` from `node:fs`. Part 3
replaces them with `Deno.open`/`Deno.stat`, but Part 2 must
serve from inside the binary first.

```bash
P=$(mktemp -d "${TMPDIR:-/tmp}/fsprobe.XXXXXX")
mkdir -p "$P/site"
printf 'hello from the embedded site\n' > "$P/site/index.html"
cat > "$P/probe.ts" <<'TS'
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(
    new URL('./site/index.html', import.meta.url),
);
const info = await stat(file);
console.log('stat size', info.size, info.isFile());
const chunks: Buffer[] = [];
for await (const c of createReadStream(file)) {
    chunks.push(c as Buffer);
}
console.log('read', Buffer.concat(chunks).toString());
TS
deno compile --frozen --include "$P/site" \
    -o "$P/fsprobe" "$P/probe.ts"
"$P/fsprobe"; echo "exit=$?"
rm -rf "$P"
```

- **Both lines print** → PROBE 2 = NODE:FS READS. Task 17
  leaves `http-server.ts` alone; Part 3 ports it.
- **Either throws** → PROBE 2 = NODE:FS BLIND. Spec 3's
  `Deno.open`/`Deno.stat` static path **comes forward into
  Part 2** as a new task between Tasks 17 and 22, scoped to
  `serveStatic` and `existingStaticFile` only. Report this
  loudly: it changes the shape of Part 2.

- [ ] **Step 3: PROBE 3 — what permissions does the pool demand?**

```bash
P=$(mktemp -d "${TMPDIR:-/tmp}/pgprobe.XXXXXX")
cat > "$P/probe.ts" <<'TS'
import postgres from 'postgres';
const sql = postgres(Deno.env.get('POSTGRES_URL')!, { max: 1 });
console.log(await sql`select 1 as ok`);
await sql.end();
TS
cp deno.json deno.lock "$P/"
deno compile --frozen --config "$P/deno.json" \
    --allow-net --allow-env=POSTGRES_URL \
    -o "$P/pgprobe" "$P/probe.ts"
POSTGRES_URL='postgres://fusion:PW@127.0.0.1/fusion' "$P/pgprobe"
rm -rf "$P"
```

Needs the compose Postgres — operator, with `!`. Deno names
any missing permission in a `NotCapable` error. Record the
**exact** permission list that makes it pass. Task 23's
`deno compile` line uses that list and nothing wider.
`--allow-sys` is the one to watch: `node:net` under compat
may demand it.

- [ ] **Step 4: PROBE 4 — `deno bundle --keep-names` parity**

`assets/app.js` relies on function names surviving
minification, exactly as esbuild's `--keep-names` preserves
them.

```bash
E=$(mktemp -d "${TMPDIR:-/tmp}/names.XXXXXX")
npx --no-install esbuild web-app/app/server-core.ts \
    --bundle --minify --keep-names --target=es2024 \
    --format=iife --outfile="$E/esbuild.js"
deno bundle --frozen --platform browser --format iife \
    --minify --keep-names \
    -o "$E/deno.js" web-app/app/server-core.ts
for f in "$E/esbuild.js" "$E/deno.js"; do
    echo "$f: $(wc -c < "$f") bytes"
done
```

Then compare the surviving names — this is the assertion,
not the byte count:

```bash
for f in "$E/esbuild.js" "$E/deno.js"; do
    grep -oE '\bfunction [A-Za-z_$][A-Za-z0-9_$]*' "$f" \
        | sort -u > "$f.names"
    echo "$f: $(wc -l < "$f.names") names"
done
comm -23 "$E/esbuild.js.names" "$E/deno.js.names" | head -30
rm -rf "$E"
```

- **The `comm` output is empty** → PROBE 4 = PARITY. Task 19
  is as written.
- **Names are missing under Deno** → PROBE 4 = NAMES LOST.
  List them. Byte identity was never the goal, but a name
  the running code reads by `Function.prototype.name` is a
  covenant. Task 19 must then either find the flag that
  restores it or keep esbuild for `app.js` alone — and Part
  2 cannot delete `package.json` in Task 28. Report loudly.

- [ ] **Step 5: PROBE 5 — the binary's start-up time**

Build one binary by hand and time it against
`node server.mjs`. `./measure`'s `boot:*` phases record it
properly in Part 4; this is the coarse figure Task 29
documents.

```bash
D=$(mktemp -d "${TMPDIR:-/tmp}/boottime.XXXXXX")
./build --no-zip "$D/"
{ time (cd "$D" && \
    POSTGRES_URL=... JWT_HMAC_SIGNING_KEY=... \
    HTTP_SERVER_PORT=8099 timeout 10 node server.mjs) ; } 2>&1 \
    | grep real
```

Record it now; re-run against the binary after Task 23 and
record both. A binary materially slower to start than
`node server.mjs` is a finding for Task 29's documentation,
not a blocker.

- [ ] **Step 6: PROBE 6 — the per-test timeout under `deno test`**

`./test-browser` passes `--test-timeout=120000` to
`node --test`. It is the guard that makes a dead CDP socket
fail by name instead of hanging `./crank`. `deno test` has
no such flag.

```bash
deno test --help 2>&1 | grep -iE 'timeout|permit-no'
```

- **A flag exists** → PROBE 6 = FLAG, and name it. Task 21
  uses it.
- **No flag** → PROBE 6 = FIXTURES. Task 21 puts the bound
  in `tests/browser/fixtures.ts` instead: an
  `AbortSignal.timeout(120_000)` (or a `Promise.race`
  against a rejecting timer) around each test body's await,
  so the failure still names the test. **The bound must
  exist somewhere before Task 21 changes the runner line** —
  `./crank` is where a hang costs the whole checkpoint.

- [ ] **Step 7: PROBE 7 — the ten browser pins on `deno bundle`**

This is the deterministic oracle for Tasks 18–20, and it
runs before them so their failures are attributable.

Operator runs, with `!` (Chrome cannot start in the
sandbox). Build a `deno bundle` client by hand into a temp
root, point `FUSION_ANGLE_STATIC_ROOT` at it, and run the
browser suite under **Node** — isolating the bundler change
from the runner change:

```bash
B=$(mktemp -d "${TMPDIR:-/tmp}/denobundle.XXXXXX")
# compose + the four deno bundle invocations from Tasks
# 18-20, written by hand into $B
export FUSION_ANGLE_STATIC_ROOT="$B"
export JWT_HMAC_SIGNING_KEY=test-hmac-signing-key
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test --test-concurrency=1 --test-timeout=120000 \
    tests/browser/*.test.ts 2>&1 | tail -20
```

Record which of the ten files pass. **Ten green is the
precondition for Task 21.** Anything less names a bundler
difference that Tasks 18–20 must close first.

**No commit.** Report DONE with all seven verdicts.

---

### Task 17: Give `boot.ts` a site root and an env reader

**Files:**
- Modify: `server/boot.ts` (lines 7–8, 56–58, 88–92,
  99–147, 160–177)
- Modify: `tests/pg-boot.test.ts` if its `boot(...)` call
  sites change arity

**Interfaces:**
- Consumes: nothing.
- Produces, and later tasks depend on these exact
  signatures:

  ```ts
  export type EnvReader =
      (name: string) => string | undefined;

  export function readListenEnv(
      read: EnvReader,
  ): ListenEnv;

  export function boot(
      read: EnvReader,
      argv: readonly string[],
      staticRoot: string,
  ): Promise<RunningHttp>;

  export function main(
      siteRoot: URL,
      args: readonly string[],
  ): Promise<void>;
  ```

  `main` is the listening block that sits under
  `isMainModule()` today: it boots, writes the `listening`
  JSON line, installs the SIGTERM handler, and on failure
  writes the error line and exits 1. `staticRootFromMeta()`
  and `isMainModule()` are **deleted**.

Reading the environment by name is what lets Task 23 compile
with a scoped `--allow-env`. `Deno.env.toObject()` and
whole-bag reads are forbidden under one: a bag read demands
blanket access to every variable in the process.

- [ ] **Step 1: Write the failing test**

Add to `tests/pg-boot.test.ts`:

```ts
test('readListenEnv reads by name, never the bag', () => {
    const seen: string[] = [];
    const read = (name: string): string | undefined => {
        seen.push(name);
        return {
            POSTGRES_URL: 'postgres://u@h/d',
            JWT_HMAC_SIGNING_KEY: 'k',
            HTTP_SERVER_PORT: '8080',
        }[name];
    };
    const env = readListenEnv(read);
    assert.equal(env.port, 8080);
    assert.equal(env.trustedProxyHops, undefined);
    assert.deepEqual(seen.sort(), [
        'HTTP_SERVER_PORT',
        'JWT_HMAC_SIGNING_KEY',
        'POSTGRES_URL',
        'TRUSTED_PROXY_HOPS',
    ]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `deno test --frozen --no-check --allow-env --allow-read
--allow-net --allow-run tests/pg-boot.test.ts`
Expected: FAIL — `readListenEnv` takes an `EnvBag`, not a
reader.

- [ ] **Step 3: Change `readListenEnv` to the reader**

```ts
export type EnvReader =
    (name: string) => string | undefined;

export function readListenEnv(
    read: EnvReader,
): ListenEnv {
    const postgresUrl = requiredEnvBy('POSTGRES_URL', read);
    const jwtHmacSigningKey = requiredEnvBy(
        'JWT_HMAC_SIGNING_KEY', read,
    );
    const portRaw = requiredEnvBy('HTTP_SERVER_PORT', read);
    const port = Number(portRaw);
    if (!Number.isInteger(port)
        || port < 1
        || port > 65535) {
        throw new Error(
            'HTTP_SERVER_PORT must be an integer 1-65535',
        );
    }
    const hops = read('TRUSTED_PROXY_HOPS');
    return {
        postgresUrl,
        jwtHmacSigningKey,
        port,
        trustedProxyHops:
            hops !== undefined && hops !== ''
                ? hops
                : undefined,
    };
}
```

Add `requiredEnvBy(name, read)` beside `requiredEnv` in
`server/postgres-gate.ts`, raising the same error message
`requiredEnv` raises for a missing name — the message is
pinned by `pg-boot.test.ts`, so read it there and match it
exactly rather than inventing one.

- [ ] **Step 4: Give `boot` its third parameter**

```ts
export async function boot(
    read: EnvReader,
    argv: readonly string[],
    staticRoot: string,
): Promise<RunningHttp> {
```

Delete the default parameter values. Inside, pass
`staticRoot` straight through to `listenHttp` where
`staticRootFromMeta()` was. The `argv.slice(2).length > 0`
gate becomes `argv.length > 0` — `argv` is now the
already-sliced argument list, not `process.argv`. Update
every call site in `pg-boot.test.ts` to match; the fixture
passes a plain array either way.

- [ ] **Step 5: Add `main` and delete the two helpers**

```ts
export async function main(
    siteRoot: URL,
    args: readonly string[],
): Promise<void> {
    const running = await boot(
        (name) => process.env[name],
        args,
        fileURLToPath(siteRoot),
    );
    process.stdout.write(JSON.stringify({
        at: new Date().toISOString(),
        level: 'info',
        message: 'listening',
        port: running.port,
    }) + '\n');
    installSigterm(() => running.close());
}
```

Delete `staticRootFromMeta()`, `isMainModule()`, and the
whole `if (isMainModule()) { … }` block. `main` throws on
failure; Task 22's dispatcher owns the error line and the
exit code, so this function does not catch.

`main` takes `args` rather than reading `process.argv`
itself: Task 22's dispatcher owns argument reading and
`boot` owns the `NO_ARGUMENTS` covenant. Nothing calls
`main` between this task and Task 23's generated entry, so
the signature is written once, in its final shape.

`process.env` stays here for now — Part 3 replaces it with
`Deno.env.get`. That is the seam this task exists to
create.

- [ ] **Step 6: Run the tests**

```bash
./test
./validate
```

Expected: the new test passes; `pg-boot.test.ts` passes with
its updated call sites; the oracle count rises by exactly 1.
Record it.

- [ ] **Step 7: Commit**

```bash
git add server/boot.ts server/postgres-gate.ts \
    tests/pg-boot.test.ts
git commit -m "$(cat <<'MSG'
Read boot env by name and take a site root

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 18: Compose under `deno run` in `build-lib`

**Files:**
- Modify: `build-lib:23`

**Interfaces:**
- Consumes: nothing.
- Produces: `bundle_client` composing under Deno. Both its
  callers — `./build` and `./test-browser` — get it.

Under `deno run`, `process.argv` keeps Node's shape, so
`compose.ts` itself is **unchanged**. Part 4 ports it.

- [ ] **Step 1: Replace the compose line**

In `bundle_client`, replace:

```bash
    node --strip-types web-app/app/compose.ts "$dest"
```

with:

```bash
    deno run --frozen --allow-read \
        --allow-write="$dest" \
        web-app/app/compose.ts "$dest"
```

`--allow-write` is scoped to the destination and nothing
wider. `compose.ts` reads the repository (templates, the
page registry) and writes only into `$dest`.

- [ ] **Step 2: Prove the composed output is identical**

```bash
BEFORE=$(mktemp -d "${TMPDIR:-/tmp}/comp-b.XXXXXX")
AFTER=$(mktemp -d "${TMPDIR:-/tmp}/comp-a.XXXXXX")
git stash
node --strip-types web-app/app/compose.ts "$BEFORE"
git stash pop
deno run --frozen --allow-read --allow-write="$AFTER" \
    web-app/app/compose.ts "$AFTER"
diff -r "$BEFORE" "$AFTER" && echo "COMPOSED OUTPUT IDENTICAL"
rm -rf "$BEFORE" "$AFTER"
```

Expected: `COMPOSED OUTPUT IDENTICAL`. `compose.ts` writes
HTML the browser suite and the walk both read; a difference
here is a product change wearing a build change's clothes.

- [ ] **Step 3: Verify and commit**

```bash
D=$(mktemp -d "${TMPDIR:-/tmp}/bl.XXXXXX")
./build --no-zip "$D/" && ls "$D" "$D/assets" | head -20
rm -rf "$D"
./validate
```

Expected: the build still emits the site and `server.mjs`;
`./validate` exits 0.

```bash
git add build-lib
git commit -m "$(cat <<'MSG'
Compose the site under deno run

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 19: Bundle the three scripts with `deno bundle`

**Files:**
- Modify: `build-lib:26-57` (the `app.js`, `theme-init.js`,
  and `root-redirect.js` esbuild runs)

**Interfaces:**
- Consumes: Task 16's PROBE 4 verdict.
- Produces: `bundle_client` emitting the three scripts
  through `deno bundle`. The `emitted` helper is unchanged
  and still reports each artifact's size.

**Byte identity with esbuild is not a goal.** The oracles
are the DOM, `./test-browser` under real Chrome, the walk,
and `./measure`.

- [ ] **Step 1: Read PROBE 4's verdict**

If PROBE 4 = NAMES LOST, do NOT proceed as written. Report
BLOCKED with the missing names; the controller rules on
whether `app.js` keeps esbuild for one more part (which
also holds `package.json` back in Task 28).

- [ ] **Step 2: Replace the `app.js` run**

```bash
    deno bundle --frozen \
        --platform browser \
        --format iife \
        --minify \
        --keep-names \
        -o "$dest/assets/app.js" \
        web-app/app/server-core.ts
```

- [ ] **Step 3: Replace the two bootstrap runs**

`theme-init.js` and `root-redirect.js` are the pre-app
bootstrap scripts extracted so the page can run under a
strict CSP. Neither needs `--keep-names`:

```bash
    deno bundle --frozen \
        --platform browser \
        --format iife \
        --minify \
        -o "$dest/assets/theme-init.js" \
        web-app/app/theme-init.ts
```

and the same shape for `root-redirect.ts` →
`root-redirect.js`. Keep every `emitted` call exactly where
it is.

- [ ] **Step 4: Verify the three artifacts exist and are non-empty**

```bash
D=$(mktemp -d "${TMPDIR:-/tmp}/b19.XXXXXX")
./build --no-zip "$D/"
for f in app.js theme-init.js root-redirect.js; do
    printf '%s: %s bytes\n' "$f" "$(wc -c < "$D/assets/$f")"
done
```

`emitted` already fails the build on an empty artifact, so a
silent zero cannot pass. Record the three sizes against the
esbuild sizes PROBE 4 measured.

- [ ] **Step 5: Run the browser suite (operator)**

The controller asks the operator to run, with `!`:

```bash
./test-browser
```

Expected: ten files green. `./test-browser` still runs under
Node here — only the bundler changed, so a failure is
attributable to `deno bundle` and nothing else. This
separation is why Task 21 comes after this task and not
before.

- [ ] **Step 6: Verify and commit**

```bash
./validate
```

Expected: exits 0.
`tests/server-zip-metafile.test.ts` still walks the esbuild
metafile at this point and still passes — Task 24 moves it.

```bash
git add build-lib
git commit -m "$(cat <<'MSG'
Bundle the client scripts with deno bundle

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 20: Bundle the CSS with `deno bundle`

**Files:**
- Modify: `build-lib:59-80` (the concatenated `styles.css`
  stream and the `pages-*.css` loop)

**Interfaces:**
- Consumes: Task 19's `deno bundle` idiom.
- Produces: `bundle_client` emitting all CSS through
  `deno bundle`. After this task `build-lib` names esbuild
  nowhere.

esbuild minifies the concatenated stream from **stdin**
today. `deno bundle` takes a file, so the concatenation
lands on disk first — the spec names
`"$dest/styles.concat.css"` — and is removed after.

- [ ] **Step 1: Replace the concatenated bundle**

```bash
    cat web-app/app/styles/tokens.css \
        web-app/app/styles/fonts.css \
        web-app/app/styles/light-mode.css \
        web-app/app/styles/dark-mode.css \
        web-app/app/styles/base.css \
        web-app/app/styles/components-*.css \
        web-app/app/styles/layout.css \
        web-app/app/styles/utilities.css \
        web-app/app/styles/responsive.css \
        web-app/app/styles/command-palette.css \
        > "$dest/styles.concat.css"

    deno bundle --frozen --minify \
        --external '*.woff2' \
        -o "$dest/assets/styles.css" \
        "$dest/styles.concat.css"

    rm -f "$dest/styles.concat.css"

    emitted "Styles created" "$dest/assets/styles.css"
```

The concatenation order is unchanged — it is a cascade, and
reordering it is a design change. `--external '*.woff2'`
keeps the font URLs as written; the files are copied beside
the CSS by the existing `cp` at the end of the function.

**The scratch file must not reach the artifact.** It is
written into `$dest`, not `$dest/assets`, and removed
immediately. Task 24's ZIP-content check is where a stray
`styles.concat.css` would show up.

- [ ] **Step 2: Replace the `pages-*.css` loop**

```bash
    for f in web-app/app/styles/pages-*.css; do
        [ -f "$f" ] || continue
        name=$(basename "$f" .css)
        deno bundle --frozen --minify \
            --external '*.woff2' \
            -o "$dest/assets/$name.css" "$f"
        emitted "Styles created" "$dest/assets/$name.css"
    done
```

- [ ] **Step 3: Prove esbuild is gone from `build-lib`**

```bash
grep -n 'esbuild\|npx' build-lib
```

Expected: no output.

- [ ] **Step 4: Compare the CSS against esbuild's**

```bash
D=$(mktemp -d "${TMPDIR:-/tmp}/b20.XXXXXX")
./build --no-zip "$D/"
ls -la "$D/assets"/*.css
test ! -e "$D/styles.concat.css" && echo "SCRATCH REMOVED"
```

Record each file's size. A CSS bundle materially smaller
than esbuild's is a dropped rule, not a win — spot-check by
grepping for a token you know is in the last concatenated
file:

```bash
grep -c 'command-palette' "$D/assets/styles.css"
rm -rf "$D"
```

Expected: at least 1. The cascade's tail must survive.

- [ ] **Step 5: Run the browser suite (operator)**

```bash
./test-browser
```

Expected: ten files green. The browser suite is where a
dropped CSS rule shows as a layout assertion failure.

- [ ] **Step 6: Verify and commit**

```bash
./validate
```

```bash
git add build-lib
git commit -m "$(cat <<'MSG'
Bundle the styles with deno bundle

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 21: Run `./test-browser` under `deno test`

**Files:**
- Modify: `test-browser:48-52` (the runner block)
- Modify: `tests/browser/fixtures.ts` — only if PROBE 6 =
  FIXTURES

**Interfaces:**
- Consumes: Task 16's PROBE 6 and PROBE 7 verdicts; Tasks
  18–20's `deno bundle` output.
- Produces: `./test-browser` as a Deno command. `./test-all`
  is unchanged. The ten files keep `node:test` until Part 5.

**Precondition: PROBE 7 reported ten green.** If it did not,
this task is blocked on whichever of Tasks 18–20 owns the
difference.

- [ ] **Step 1: Establish the per-test bound**

If PROBE 6 = FLAG, use the flag it named in Step 2.

If PROBE 6 = FIXTURES, this step is the task's first
deliverable: put a 120-second bound in
`tests/browser/fixtures.ts` so a dead CDP socket fails by
name. Write the failing test first —

```ts
test('withAdminPage rejects when the body outruns the bound',
    async () => {
        await assert.rejects(
            () => withAdminPage(async () => {
                await new Promise(() => {});
            }, { timeoutMs: 50 }),
            /timed out/,
        );
    });
```

— then implement the bound as a `Promise.race` against a
rejecting timer whose message names the test, defaulting to
`120_000`. The comment `test-browser` carries today explains
why the bound exists; move that reasoning into the fixture
beside the code that now enforces it.

- [ ] **Step 2: Replace the runner block**

Keep the explanatory comment; it is still true and now
points at wherever the bound lives. Replace the `node`
invocation with:

```bash
TZ=UTC deno test --frozen --no-check \
    --allow-env --allow-read --allow-write \
    --allow-net --allow-run \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    tests/browser/*.test.ts
```

No `--parallel`: the suite is serial by design — one Chrome
per file, one origin per test. `--allow-run` is unscoped
here and only here: Chrome's path is the operator's, given
by `CHROME`. `--allow-env` covers `CHROME`,
`CHROME_DEBUG_URL`, `TMPDIR`, and
`FUSION_ANGLE_STATIC_ROOT`; leave it unscoped only if a
scoped list fails, and say which variable forced it.

- [ ] **Step 3: Run it (operator)**

```bash
./test-browser
```

Expected: ten files green. If PROBE 6 = FIXTURES, also prove
the bound bites — temporarily point `CHROME_DEBUG_URL` at a
closed port and confirm the failure **names a test** rather
than hanging:

```bash
CHROME_DEBUG_URL=ws://127.0.0.1:9/devtools/browser/x \
    ./test-browser 2>&1 | tail -20
```

Expected: a failure naming a test within ~2 minutes, not a
hang. Restore the variable afterward.

- [ ] **Step 4: Prove Node is gone from the script**

```bash
grep -c node test-browser
```

Expected: `0`.

- [ ] **Step 5: Verify and commit**

```bash
./validate
```

```bash
git add test-browser tests/browser/fixtures.ts
git commit -m "$(cat <<'MSG'
Run the browser suite under Deno

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 22: Add the `fusion-angle` dispatcher

**Files:**
- Create: `server/main.ts`
- Create: `tests/server-main.test.ts`
- Modify: `server/postgres-seed.ts` (export the run; delete
  `isMainModule`)
- Modify: `server/postgres-wipe.ts` (export the run; delete
  `isMainModule`)

**Interfaces:**
- Consumes: `main(siteRoot)` from Task 17.
- Produces, and Task 23's generated entry calls exactly
  this:

  ```ts
  export const USAGE: string;
  export function dispatch(
      siteRoot: URL,
      args: readonly string[],
  ): Promise<number>;
  ```

  and from the two operator modules:

  ```ts
  export function seedMain(
      args: readonly string[],
  ): Promise<number>;
  export function wipeMain(
      args: readonly string[],
  ): Promise<number>;
  ```

  Each returns the process exit code and has already
  written its own error line. Each tool keeps its own error
  voice — seed's adds a `code` field for a `seed failed`
  fault, wipe's goes through `wipeErrorMessage`. The
  dispatcher does not flatten them into one.

**Ruling R1 in code.** One binary, three verbs.
`serve` takes no options: `pg-boot.test.ts` and
ARCHITECTURE.md § One origin, one ZIP pin the
`NO_ARGUMENTS` covenant, and this restates it as "no options
on serve" rather than retiring it.

- [ ] **Step 1: Write the failing tests**

Create `tests/server-main.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { USAGE, dispatch } from '../server/main.ts';

const SITE = new URL('file:///nowhere/site/');

test('usage names the three verbs', () => {
    assert.match(USAGE, /serve/);
    assert.match(USAGE, /seed/);
    assert.match(USAGE, /wipe/);
});

test('no verb is exit 2', async () => {
    assert.equal(await dispatch(SITE, []), 2);
});

test('an unknown verb is exit 2', async () => {
    assert.equal(await dispatch(SITE, ['migrate']), 2);
});

test('serve rejects any option', async () => {
    await assert.rejects(
        () => dispatch(SITE, ['serve', '--port', '80']),
        /no arguments/i,
    );
});
```

The `serve` rejection message must be `NO_ARGUMENTS` from
`server/postgres-gate.ts` — read its exact text there and
make the regex match it rather than inventing wording.

- [ ] **Step 2: Run them and watch them fail**

Run: `deno test --frozen --no-check --allow-env
--allow-read --allow-net --allow-run
tests/server-main.test.ts`
Expected: FAIL — `server/main.ts` does not exist.

- [ ] **Step 3: Export the two operator runs**

In `server/postgres-seed.ts`: rename the private
`run(argv)` to `export async function seedMain(args:
readonly string[]): Promise<number>`. It takes the
**already-sliced** argument list — `parseSeedArgv` already
expects that shape, as `tests/pg-seed.test.ts` shows. Move
the whole body of the `if (isMainModule())` catch into it
so it returns `1` after writing its error line and `0` on
success. Delete `isMainModule()`, the `if` block, and the
now-unused `resolve`/`fileURLToPath` imports —
`noUnusedLocals` is on.

Do the same in `server/postgres-wipe.ts`, producing
`wipeMain`. `renderWipeStartCommand()` stays exactly as it
is; Task 27 changes what it returns.

- [ ] **Step 4: Write `server/main.ts`**

```ts
// The one binary. The first argument selects the tool:
// serve | seed | wipe. serve takes no options — the
// NO_ARGUMENTS covenant, restated for the dispatcher.

import { main as serve } from './boot.ts';
import { seedMain } from './postgres-seed.ts';
import { wipeMain } from './postgres-wipe.ts';

export const USAGE =
    'Usage: fusion-angle serve|seed|wipe\n';

export async function dispatch(
    siteRoot: URL,
    args: readonly string[],
): Promise<number> {
    const verb = args[0];
    const rest = args.slice(1);
    if (verb === 'serve') {
        await serve(siteRoot, rest);
        return 0;
    }
    if (verb === 'seed') return seedMain(rest);
    if (verb === 'wipe') return wipeMain(rest);
    process.stderr.write(USAGE);
    return 2;
}
```

`main` already takes `(siteRoot, args)` from Task 17, so
nothing in `boot.ts` changes here. The dispatcher owns
argument reading; `boot` owns the covenant.

- [ ] **Step 5: Run the tests**

```bash
./test
./validate
```

Expected: the four new tests pass; `pg-seed.test.ts` and
the wipe tests still pass. The oracle rises by 4 plus
Task 17's 1. Record it.

- [ ] **Step 6: Commit**

```bash
git add server/main.ts tests/server-main.test.ts \
    server/postgres-seed.ts server/postgres-wipe.ts \
    server/boot.ts
git commit -m "$(cat <<'MSG'
Add the fusion-angle dispatcher

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 23: Compile one executable in `./build`

**Files:**
- Modify: `build:5-20` (usage), `:60-83` (the esbuild
  server run, the `emitted` call, and the ZIP block)

**Interfaces:**
- Consumes: Task 16's PROBE 1 and PROBE 3 verdicts;
  `dispatch` from Task 22.
- Produces: `$BUILD_DIR/fusion-angle`, one executable.
  Tasks 24–27 name it. The ZIP is
  `fusion-angle-${SHA}.zip`.

- [ ] **Step 1: Move the site under `site/`**

`bundle_client "$BUILD_DIR"` writes the ZIP root today. The
compiled entry resolves `./site/` beside itself, so the
build composes into `"$BUILD_DIR/site"`:

```bash
bundle_client "$BUILD_DIR/site"
```

- [ ] **Step 2: Write the generated entry**

Replace the `npx --no-install esbuild server/boot.ts …`
block with:

```bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
cat > "$BUILD_DIR/main.ts" <<ENTRY
import { dispatch } from '${ROOT}/server/main.ts';
Deno.exit(await dispatch(
    new URL('./site/', import.meta.url),
    process.argv.slice(2),
));
ENTRY
```

The heredoc is **unquoted** so `${ROOT}` expands to the
repository's absolute path, as the build script knows it.
This generated file is the only file in the repository that
`deno check` never sees, so it is three lines and holds no
logic. Part 3 changes `process.argv.slice(2)` to
`Deno.args` — one line, in this heredoc.

- [ ] **Step 3: Compile**

```bash
deno compile --frozen --exclude-unused-npm \
    --include "$BUILD_DIR/site" \
    --allow-net \
    --allow-env=POSTGRES_URL,JWT_HMAC_SIGNING_KEY,HTTP_SERVER_PORT,TRUSTED_PROXY_HOPS \
    ${TARGET_FLAG} \
    -o "$BUILD_DIR/fusion-angle" \
    "$BUILD_DIR/main.ts"

emitted "Executable created" "$BUILD_DIR/fusion-angle"
```

Add to `--allow-env` **exactly** what PROBE 3 measured the
driver reads, and add `--allow-sys` only if PROBE 3 showed
it demanded. Nothing wider. `deno compile` type-checks by
default: an unchecked tree cannot produce the artifact.

`emitted` prints `assets/<name>`, which reads wrong for a
root-level binary. Change `emitted`'s echo in `build-lib`
to print the artifact's path relative to the destination
rather than a hardcoded `assets/` prefix, and keep its
empty-artifact refusal exactly as it is. Its pin,
`tests/fusion-angle-mark.test.ts`, reads `build-lib` for
`mark.png` — re-run it.

- [ ] **Step 4: Set the target**

```bash
if [ "$NO_ZIP" = true ]; then
    TARGET_FLAG=""
else
    TARGET_FLAG="--target x86_64-unknown-linux-gnu"
fi
```

The ZIP carries Linux x86_64. `--no-zip` emits the host
target — what `./serve`, `./measure`, and the Docker builder
(Linux, native) consume.

- [ ] **Step 5: Rename the ZIP and drop `server.mjs` from help**

```bash
    SERVER_ZIP="${DEST_DIR}fusion-angle-${SHA}.zip"
```

and in `usage()`, replace `(server-core + server.mjs — for
./crank)` with `(the fusion-angle executable — for
./crank)`. `tests/server-zip-metafile.test.ts` pins both the
ZIP-name pattern and this help line; Task 24 updates it.
**This task and Task 24 must land together or `./validate`
is red** — do the pin edit in Task 24 first if you prefer,
but do not commit a red tree.

- [ ] **Step 6: Build and run the artifact**

```bash
D=$(mktemp -d "${TMPDIR:-/tmp}/b23.XXXXXX")
./build --no-zip "$D/"
ls -la "$D"
"$D/fusion-angle"; echo "exit=$?"
"$D/fusion-angle" migrate; echo "exit=$?"
```

Expected: `$D` holds `fusion-angle`, `main.ts`, and
`site/`; a bare run and an unknown verb both print the usage
and exit 2.

- [ ] **Step 7: Serve from the binary**

```bash
(cd "$D" && POSTGRES_URL="$POSTGRES_URL" \
    JWT_HMAC_SIGNING_KEY=k HTTP_SERVER_PORT=8099 \
    ./fusion-angle serve) &
sleep 2
curl -si http://127.0.0.1:8099/ | head -20
curl -si http://127.0.0.1:8099/landing/index.html | head -5
kill %1
rm -rf "$D"
```

Expected: HTTP 200, `Content-Type: text/html`,
`Cache-Control: no-store`, and the
`Content-Security-Policy` header on both. **The site is
served from inside the binary** — this is PROBE 2's verdict
proved in production shape. If it 404s, PROBE 2 was NODE:FS
BLIND and the `Deno.open` task comes forward.

Needs the compose Postgres; operator, with `!`.

- [ ] **Step 8: Record the start-up time**

Re-run PROBE 5's timing against the binary and record both
figures. Task 29 documents them.

- [ ] **Step 9: Verify and commit**

```bash
grep -n 'esbuild\|npx\|server\.mjs' build build-lib
./validate
```

Expected: no output from the grep; `./validate` exits 0
(with Task 24's pin edit in place).

```bash
git add build build-lib
git commit -m "$(cat <<'MSG'
Compile one executable in ./build

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 24: Walk the client graph with `deno info`

**Files:**
- Modify: `tests/server-zip-metafile.test.ts` (line 4's
  import; test 1 at 40; test 3 at 86–112; test 4 at 114)
- Modify: `deno.json` (drop the `esbuild` import-map entry)
- Modify: `test` (narrow `--allow-run`)

**Interfaces:**
- Consumes: Task 23's ZIP name and help text.
- Produces: the client-graph covenant walked through
  `deno info --json` instead of an esbuild metafile. This
  is the **last importer of esbuild** — Task 28 can delete
  `package.json` only after this task.

The covenant this test keeps is unchanged: no
code-reachable input of `web-app/app/server-core.ts` may
contain `api/access-token.ts` or the four forbidden mint
names. **Only the walker changes.** `FORBIDDEN_INPUTS`,
`FORBIDDEN_SOURCES`, and `clientGraphHits` are untouched,
and test 2 ('client-graph pin matches mint and deleted
names') is untouched — it is the test of the matcher
itself.

- [ ] **Step 1: Update the two script pins**

Test 1 asserts `/fusion-angle-server-\$\{SHA\}\.zip/`.
Change it to `/fusion-angle-\$\{SHA\}\.zip/`. The two
`doesNotMatch` assertions stay.

Test 4 asserts the `--no-zip` help reads `server-core +
server.mjs — for ./crank`. Change it to match Task 23's new
help text — read `build`'s `usage()` and pin what is there,
not what you expect. The `doesNotMatch(/for \.\/serve/)`
assertion stays.

- [ ] **Step 2: Replace the metafile walk**

Delete line 4's `import * as esbuild from 'esbuild';` and
replace test 3's body:

```ts
test(
    'client graph omits token mint and signing key',
    () => {
        const info = spawnSync('deno', [
            'info', '--frozen', '--json',
            'web-app/app/server-core.ts',
        ], { encoding: 'utf8' });
        assert.equal(info.status, 0, info.stderr);
        const graph = JSON.parse(info.stdout) as {
            roots: string[];
            modules: {
                specifier: string;
                dependencies?: {
                    code?: { specifier: string };
                }[];
            }[];
        };
        const bySpecifier = new Map(
            graph.modules.map((m) => [m.specifier, m]),
        );
        const seen = new Set<string>();
        const queue = [...graph.roots];
        while (queue.length > 0) {
            const at = queue.pop()!;
            if (seen.has(at)) continue;
            seen.add(at);
            const mod = bySpecifier.get(at);
            if (mod === undefined) continue;
            for (const dep of mod.dependencies ?? []) {
                if (dep.code === undefined) continue;
                queue.push(dep.code.specifier);
            }
        }
        const hits: string[] = [];
        for (const specifier of seen) {
            if (!specifier.startsWith('file://')) continue;
            const path = relative(
                process.cwd(),
                fileURLToPath(specifier),
            );
            hits.push(...clientGraphHits(
                path, readFileSync(path, 'utf8'),
            ));
        }
        assert.deepEqual(hits, []);
    },
);
```

Add the imports it needs — `spawnSync` from
`node:child_process`, `relative` from `node:path`,
`fileURLToPath` from `node:url`. Part 5 replaces
`spawnSync` with `Deno.Command`.

**`dep.code` only.** A `dep.type` edge is a type-only
import, which never reaches the bundle. Following type
edges would make this pin fail on an
`import type { … } from '../api/access-token.ts'` that
emits nothing — a false positive that would teach the next
reader to weaken the test.

- [ ] **Step 3: Prove the pin still bites**

A test that cannot fail is a comfort object. Prove this one
can:

```bash
cp web-app/app/server-core.ts "$TMPDIR/server-core.bak"
printf "\nexport { mintAccessToken } from '../../api/access-token.ts';\n" \
    >> web-app/app/server-core.ts
./test 2>&1 | grep -A 5 'client graph omits'
cp "$TMPDIR/server-core.bak" web-app/app/server-core.ts
```

Expected: the test FAILS with the forbidden hits listed,
then passes again after the restore. Record both runs.

- [ ] **Step 4: Drop the esbuild import-map entry**

In `deno.json`, remove `"esbuild": "npm:esbuild@0.28.0"`
from `imports`. Then:

```bash
deno install
git diff --stat deno.lock
```

Expected: `deno.lock` loses esbuild and its platform
packages.

- [ ] **Step 5: Narrow `--allow-run` in `./test`**

The suite's `--allow-run` existed for the metafile test's
esbuild binary and for the two CLI pins that spawn scripts.
Scope it to what remains:

```bash
    --allow-run=deno,./serve,./crank
```

Update the comment above `DENO_TEST` to say so. If a test
fails naming a binary this list omits, add that binary and
say which test demanded it — never widen back to unscoped.

- [ ] **Step 6: Verify and commit**

```bash
grep -rn "'esbuild'" tests/ web-app/ server/ api/ shared/
./test
./validate
```

Expected: no importer of esbuild anywhere; the oracle
holds.

```bash
git add tests/server-zip-metafile.test.ts deno.json \
    deno.lock test
git commit -m "$(cat <<'MSG'
Walk the client graph with deno info

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 25: Point `./serve` and `./measure` at the binary

**Files:**
- Modify: `serve:51`
- Modify: `web-app/app/measure-cli.ts:10,22-24`
- Modify: `tests/measure-cli.test.ts:295-296`
- Modify: `tests/serve-cli.test.ts:102`
- Modify: `web-app/app/measure.ts` (the `spawn` call around
  line 596 and its stderr line)

**Interfaces:**
- Consumes: Task 23's `fusion-angle` executable.
- Produces: `MEASURE_SERVER_ENTRY = './fusion-angle'` and
  `measureServerArgs() === ['serve']`. Part 4 replaces
  `spawn` with `Deno.Command` but keeps both.

`./crank` is **unchanged**: it builds `--no-zip` and calls
`./serve`.

- [ ] **Step 1: Write the failing pins**

In `tests/measure-cli.test.ts`, change lines 295–296 to:

```ts
    assert.equal(MEASURE_SERVER_ENTRY, './fusion-angle');
    assert.deepEqual(measureServerArgs(), ['serve']);
```

In `tests/serve-cli.test.ts`, change line 102's
`assert.match(src, /node server\.mjs/)` to:

```ts
    assert.match(src, /exec \.\/fusion-angle serve/);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `./test 2>&1 | tail -20`
Expected: both files FAIL naming `server.mjs`.

- [ ] **Step 3: Change the constants**

In `web-app/app/measure-cli.ts`:

```ts
export const MEASURE_SERVER_ENTRY = './fusion-angle';
```

```ts
export function measureServerArgs(): string[] {
    return ['serve'];
}
```

- [ ] **Step 4: Change the spawn**

In `web-app/app/measure.ts`, the `spawn('node',
measureServerArgs(), …)` call becomes
`spawn(MEASURE_SERVER_ENTRY, measureServerArgs(), …)`, and
the stderr line `Starting node server.mjs on ${baseUrl}`
becomes `Starting ${MEASURE_SERVER_ENTRY} serve on
${baseUrl}`. Import `MEASURE_SERVER_ENTRY` beside
`measureServerArgs` — it is already exported from the same
module.

The `cwd: buildDir` and the three environment variables are
unchanged: the binary reads the same names.

- [ ] **Step 5: Change `./serve`**

Line 51 becomes:

```bash
cd "$DIR" && exec ./fusion-angle serve
```

The `POSTGRES_URL` and `JWT_HMAC_SIGNING_KEY` guards, the
`HTTP_SERVER_PORT` export, and the trailing-slash check are
unchanged.

- [ ] **Step 6: Prove it end to end (operator)**

```bash
D=$(mktemp -d "${TMPDIR:-/tmp}/serve25.XXXXXX")
./build --no-zip "$D/"
POSTGRES_URL="$POSTGRES_URL" JWT_HMAC_SIGNING_KEY=k \
    ./serve "$D/" 8099 &
sleep 2
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8099/
kill %1; rm -rf "$D"
```

Expected: `200`.

- [ ] **Step 7: Verify and commit**

```bash
./test
./validate
```

```bash
git add serve web-app/app/measure-cli.ts \
    web-app/app/measure.ts tests/measure-cli.test.ts \
    tests/serve-cli.test.ts
git commit -m "$(cat <<'MSG'
Serve and measure the compiled binary

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 26: Build and run the image on Deno

**Files:**
- Modify: `Dockerfile` (all 13 lines)
- Modify: `compose.yaml` (the server healthcheck 43–55; the
  `seed` service 57–71)

**Interfaces:**
- Consumes: Task 16's PROBE 1 verdict; Task 23's binary.
- Produces: an image whose runtime stage carries only the
  executable. Task 27 posts Render jobs against the same
  entry.

**Ruling R2 applies:** `denoland/deno:2.9.5` for both
stages. One image family, and the healthcheck cannot lie
about the runtime.

- [ ] **Step 1: Rewrite the Dockerfile**

```dockerfile
FROM denoland/deno:2.9.5 AS builder
WORKDIR /srv
COPY . .
RUN ./build --no-zip render-out/

FROM denoland/deno:2.9.5 AS runtime
WORKDIR /srv
COPY --from=builder /srv/render-out ./render-out
USER deno
CMD ["sh", "-c", \
    "cd render-out && HTTP_SERVER_PORT=$PORT exec ./fusion-angle serve"]
```

If PROBE 1 = GIT ABSENT, insert before `COPY . .`:

```dockerfile
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
```

`./build` gates on a clean tree and reads `git rev-parse`;
installing git is cheaper than a build flag that skips
doctrine.

Every line must be at or under 78 characters —
`./validate` lints the Dockerfile.

- [ ] **Step 2: Rewrite the server healthcheck**

The `node -e` probe becomes:

```yaml
        healthcheck:
            test:
                - CMD
                - deno
                - eval
                - --allow-net
                - --allow-env=PORT
                - >-
                  const r = await fetch('http://127.0.0.1:'
                  + Deno.env.get('PORT') + '/');
                  Deno.exit(r.ok ? 0 : 1);
            interval: 2s
            timeout: 2s
            retries: 15
            start_period: 5s
```

Keep `interval`, `timeout`, `retries`, and `start_period`
exactly as they are. The runtime stage keeps the Deno image
for `sh` and this probe; the binary itself needs neither.

- [ ] **Step 3: Point the `seed` service at the runtime stage**

```yaml
    seed:
        build:
            context: .
            target: runtime
        profiles:
            - seed
        depends_on:
            postgres:
                condition: service_healthy
        environment:
            POSTGRES_URL: *postgres-url
        entrypoint:
            - ./render-out/fusion-angle
            - seed
```

`./postgres-seed --postgres compose` passes the mode flag
after the entrypoint. Check how it invokes the service and
make the two agree — read `postgres-seed`'s compose branch
before writing this, and pin the mode flag where it belongs.
The builder stage is no longer needed for seeding.

- [ ] **Step 4: Build and smoke it (operator)**

Docker is outside the sandbox. The controller asks the
operator to run, with `!`:

```bash
docker compose build
./postgres-seed --postgres compose --mock-data
docker compose up --wait
curl -s -o /dev/null -w '%{http_code}\n' \
    http://127.0.0.1:8080/landing/index.html
docker compose down
```

Expected: the build succeeds, the seed prints credentials
once, `--wait` returns when the healthcheck passes, and the
landing page is `200`. Record the image size and the build
time — Render's build time grows with bundle + compile, and
Task 29 documents it.

- [ ] **Step 5: Verify and commit**

```bash
./validate
```

Expected: exits 0 — the 78-character lint covers both files.

```bash
git add Dockerfile compose.yaml
git commit -m "$(cat <<'MSG'
Build and run the image on Deno

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 27: Post Render jobs against the operator tool

**Files:**
- Modify: `server/postgres-wipe.ts:30-43`
  (`renderWipeStartCommand`)
- Modify: `postgres-seed:186` (the Render job body)
- Modify: `postgres-wipe:127-129` (the `--print-start-command`
  invocation)
- Modify: the wipe tests that pin `renderWipeStartCommand`

**Interfaces:**
- Consumes: Task 26's runtime image.
- Produces: both Render job start commands naming the
  compiled tool. No inline program survives in
  `postgres-lib` for the wipe.

Render moves to the Docker runtime: build from the
Dockerfile, start from its `CMD`. The compose-stack spec's
"no Render config change" is consciously retired here — say
so in Task 29's ARCHITECTURE.md edit.

- [ ] **Step 1: Find the pin**

```bash
grep -rn 'renderWipeStartCommand' tests/ server/ postgres-*
```

Read the assertion before changing the function: it is the
covenant, and it changes with intent, not by accident.

- [ ] **Step 2: Rewrite `renderWipeStartCommand`**

```ts
export function renderWipeStartCommand(): string {
    return './render-out/fusion-angle wipe';
}
```

The whole `node --input-type=module -e` program — the
`postgres` import, the `POSTGRES_URL` read, the
`unsafe(POSTGRES_DROP_SCHEMA)`, the `end()` — is deleted.
`POSTGRES_DROP_SCHEMA` stays imported by `wipePostgres`,
which the compiled `wipe` verb runs. If the import becomes
unused in this module, delete it — `noUnusedLocals` is on.

- [ ] **Step 3: Update the pin to the new command**

Change the assertion to the exact new string. Do not
weaken it to a substring match: the start command is what
Render executes, and a loose pin is a pin that cannot fail.

- [ ] **Step 4: Rewrite the seed job body**

In `postgres-seed`, line 186 writes the job body as
`"node --strip-types server/postgres-seed.ts ${MODE}"`.
Change it to:

```bash
    "./render-out/fusion-angle seed ${MODE}"
```

- [ ] **Step 5: Rewrite the wipe's start-command read**

In `postgres-wipe`, lines 127–129 call
`node --strip-types "$ROOT/server/postgres-wipe.ts"
--print-start-command`. Change `node --strip-types` to
`deno run --frozen --allow-env`, keeping the same script
path and flag. Check what the `--print-start-command` branch
actually reads and scope the permission to that; if it reads
nothing, drop `--allow-env` entirely.

- [ ] **Step 6: Verify**

```bash
./test
./validate
./postgres-seed --help
./postgres-wipe --help
```

Expected: the suite holds; both `--help` texts are still
accurate. **No Render exists in the sandbox**, so the Render
branch is reviewed by `--help` and a dry read of the two job
bodies — say so in the report rather than claiming it ran.

- [ ] **Step 7: Commit**

```bash
git add server/postgres-wipe.ts postgres-seed postgres-wipe \
    tests/
git commit -m "$(cat <<'MSG'
Post Render jobs against the operator tool

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 28: Delete `package.json` and its lock

**Files:**
- Delete: `package.json`, `package-lock.json`,
  `node_modules/`
- Modify: `.gitignore`, `.dockerignore` (drop
  `node_modules/`)
- Modify: `tests/fusion-angle-live-name.test.ts:15-30`
  (`ROOT_FILES`)

**Interfaces:**
- Consumes: Task 24 (the last esbuild importer is gone) and
  Task 26 (the image no longer runs `npm ci`).
- Produces: a repository with no npm surface. `deno.json`
  and `deno.lock` are the only dependency manifests.

**Precondition:** PROBE 4 was PARITY. If `app.js` still
needs esbuild, this task does not run — report BLOCKED and
tell the controller Part 2 ends without it.

- [ ] **Step 1: Prove nothing needs npm**

```bash
grep -rn 'npm ci\|npx\|package\.json\|package-lock\|node_modules' \
    build build-lib serve test test-postgres test-browser \
    test-all crank measure generate-schema-svg \
    generate-api-documentation postgres-seed postgres-wipe \
    postgres-lib Dockerfile compose.yaml .dockerignore \
    tests/ server/ api/ shared/ web-app/ 2>/dev/null
```

Expected: hits only in `.gitignore`, `.dockerignore`, and
`tests/fusion-angle-live-name.test.ts` — the three files
this task edits. **Anything else is a caller that still
needs npm**; fix it before deleting.

- [ ] **Step 2: Update the live-name pin**

`ROOT_FILES` lists the root files the product-name check
walks. Drop `'package-lock.json'` and add `'deno.json'`.
Read the surrounding assertion first: if it also names
`package.json`, drop that too.

- [ ] **Step 3: Delete**

```bash
git rm package.json package-lock.json
rm -rf node_modules
```

- [ ] **Step 4: Drop `node_modules/` from both ignore files**

There is nothing left to ignore. Leaving the line is a
comment about a directory that cannot exist.

- [ ] **Step 5: Verify**

```bash
ls package.json package-lock.json node_modules 2>&1
./test
./validate
```

Expected: three "No such file" lines; the oracle holds;
`./validate` exits 0.

- [ ] **Step 6: Confirm the full artifact path (operator)**

```bash
./build
```

Expected: `fusion-angle-<sha>.zip` on the Desktop. Unzip it
on a Linux host and run `./fusion-angle serve` against a
real Postgres — the boot gates run and the origin serves.
This is the ZIP's covenant: unzip, seed, serve.

- [ ] **Step 7: Commit**

```bash
git add -A package.json package-lock.json .gitignore \
    .dockerignore tests/fusion-angle-live-name.test.ts
git commit -m "$(cat <<'MSG'
Delete package.json and its lock

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 29: Document the build and the artifact

**Files:**
- Modify: `AGENTS.md` (command block; § Gates; § HTTP only;
  § Operator seed and wipe)
- Modify: `README.md` § Modules, § Getting Started
- Modify: `ARCHITECTURE.md` § One origin, one ZIP
- Modify: `TEST-PLAN.md` (A1–A3, AT5, A2's pin, K8)

**Interfaces:**
- Consumes: Task 16's PROBE 5 figures, Task 26's image size
  and build time.
- Produces: the documented state of Part 2.

Each root doc pins the Node artifact by name and moves with
it. `./validate` gates AGENTS.md at 300 lines and README.md
at 150 — check both before committing.

- [ ] **Step 1: Find every surviving mention**

```bash
grep -rn 'server\.mjs\|npm ci\|node_modules\|package\.json\|node server' \
    AGENTS.md README.md ARCHITECTURE.md TEST-PLAN.md \
    SCHEMA.md API.md DESIGN-SYSTEM.md FLOW-CANVAS.md \
    AUDIT.md TODO.md
```

Every hit is a site this task owns. Work the list to empty.

- [ ] **Step 2: AGENTS.md**

- Command block: `./build` emits the executable ZIP;
  `./serve dir/ port` runs `./fusion-angle serve` from
  `dir/`; drop the `npm ci` sentence Part 1 added — Node is
  no longer needed for `./build`, `./test-browser`, or
  `./crank`.
- § Gates: `./test-browser` "bundles into `$TMPDIR`" now
  bundles with `deno bundle` and runs under `deno test`.
- § HTTP only: "One origin (`node server.mjs`)" becomes
  "One origin (the `fusion-angle` executable)".
- § Operator seed and wipe: name the three verbs of the one
  binary.

- [ ] **Step 3: README.md**

§ Modules: the ZIP line and "Node + Postgres" become the
executable and Deno + Postgres. § Getting Started: install
Deno only — the `npm ci` paragraph goes entirely.

- [ ] **Step 4: ARCHITECTURE.md § One origin, one ZIP**

`server.mjs`, the ZIP name, "Node serves", and "postgres.js
bundled" all move: one compiled executable, postgres.js
embedded, the site embedded, the permission covenant baked
in at compile time. Add one sentence retiring the
compose-stack spec's "no Render config change" — Task 27
made Render build from the Dockerfile.

Record PROBE 5's two start-up figures here, both measured,
neither rounded away.

- [ ] **Step 5: TEST-PLAN.md**

A1–A3, AT5, A2's pin, and K8's `node server.mjs` all name
the Node artifact. AT5's command text becomes the `deno
test` line from Task 21.

- [ ] **Step 6: Verify the ceilings and the gates**

```bash
wc -l AGENTS.md README.md ARCHITECTURE.md
./validate
```

Expected: AGENTS.md ≤ 300, README.md ≤ 150,
ARCHITECTURE.md ≤ 450, `./validate` exits 0.

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md README.md ARCHITECTURE.md TEST-PLAN.md
git commit -m "$(cat <<'MSG'
Document the compiled artifact

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

## Part 2 exit gate

```bash
./validate                                  # exit 0
grep -rn 'server\.mjs\|npm\|node_modules' \
    build build-lib serve test test-browser crank \
    measure Dockerfile compose.yaml          # no output
ls package.json package-lock.json node_modules 2>&1  # absent
```

Operator, with `!`:

- `./test-all` — Part 1's `./validate` then
  `./test-browser` on the `deno bundle` output: ten files
  green before any ZIP is cut.
- `./test-postgres` — seven files pass, unchanged.
- The compose smoke: `docker compose build`,
  `./postgres-seed --postgres compose --mock-data`,
  `docker compose up --wait`, the landing page, then
  `./measure --base-url http://127.0.0.1:8080 --password
  "$PW" --runs 1 --pages organization`.
- `./crank --mock-data 8080` end to end: the binary listens
  and the walk's A3 passes against it.
- The ZIP unzips to one executable that runs the boot gates
  on a Linux host.

---

# Part 3 — Server idiom

**Spec:** `docs/superpowers/specs/2026-08-21-deno-server-idiom-design.md`

`server/` speaks Deno. `Deno.serve` serves; `Deno.env`
reads; `Deno.addSignalListener` drains; `Deno.args` is argv.
`node:` imports vanish from the product process except
`node:crypto` scrypt, the one named exception.

**The covenant holds without a changed assertion.**
`http-server.test.ts`, `http-throttle.test.ts`,
`http-static-directory-index.test.ts`, and
`pg-boot.test.ts` pin the HTTP behaviour, and
`tests/browser/fixtures.ts` pins it through real Chrome. If
a port needs one of those assertions changed, that is a
behaviour change wearing a port's clothes — STOP and report
it.

**Ruling R3 applies:** an explicit `onError` handler, never
`Deno.serve`'s default.

**Ruling R4 applies:** `http-static-directory-index.test.ts`
keeps `node:http` until Part 5.

**Permissions do not change in this part.** The binary keeps
`--allow-net` and the scoped `--allow-env` Task 23 measured,
and **still no `--allow-read`**: the site is inside the
binary, and `Deno.open` reads the compiled file system
without one (PROBE 9). `./test-browser` already carries
`--allow-read` and always will — the directory root it
serves is the tests', never the binary's. If any task in
this part finds itself adding a permission to `build`'s
`deno compile` line, that is a finding: report it rather
than widening.

---

### Task 30: Probe the `Deno.serve` surface

**Files:** none. This task commits nothing.

**Interfaces:**
- Consumes: Part 2's binary.
- Produces: four verdicts Task 31 consumes.

- [ ] **Step 1: PROBE 8 — the throttle's address key**

`server/throttle.ts` normalizes an IPv4-mapped IPv6 address
(`::ffff:127.0.0.1` → `127.0.0.1`) from
`req.socket.remoteAddress`. Under `Deno.serve` the peer
arrives as `info.remoteAddr`.

```bash
cat > "$TMPDIR/addr.ts" <<'TS'
const server = Deno.serve(
    { port: 8098, hostname: '127.0.0.1' },
    (_req, info) => {
        const a = info.remoteAddr;
        return new Response(JSON.stringify(a));
    },
);
await new Promise((r) => setTimeout(r, 300));
console.log(await (await fetch('http://127.0.0.1:8098/')).text());
await server.shutdown();
TS
deno run --allow-net "$TMPDIR/addr.ts"
```

Record the exact shape — the field names and whether
`hostname` carries the `::ffff:` prefix. Task 31 feeds
`throttle.limited` from that field. `normalizeAddress` is
pure and unchanged either way; what changes is only what is
handed to it.

- [ ] **Step 2: PROBE 9 — `Deno.open` on the compiled FS**

If PROBE 2 was NODE:FS BLIND, this was already answered in
Part 2. Otherwise measure it now, since Task 31 replaces
`createReadStream` with `Deno.open`:

```bash
P=$(mktemp -d "${TMPDIR:-/tmp}/openprobe.XXXXXX")
mkdir -p "$P/site"
printf 'embedded\n' > "$P/site/index.html"
cat > "$P/probe.ts" <<'TS'
const url = new URL('./site/index.html', import.meta.url);
const info = await Deno.stat(url);
console.log('stat', info.size, info.isFile);
const f = await Deno.open(url, { read: true });
console.log('read', await new Response(f.readable).text());
TS
deno compile --include "$P/site" -o "$P/openprobe" "$P/probe.ts"
"$P/openprobe"; echo "exit=$?"
rm -rf "$P"
```

Expected: both lines print with no `--allow-read`. **If
`Deno.open` cannot read the compiled file system, Part 3
cannot proceed as written** — report BLOCKED; the static
path would have to read into memory at start-up instead of
streaming, which is a design change, not a port.

- [ ] **Step 3: PROBE 10 — the default 500 body**

Ruling R3 says use an explicit handler. Measure the default
anyway, so the ruling is recorded against a fact:

```bash
cat > "$TMPDIR/err.ts" <<'TS'
const server = Deno.serve(
    { port: 8097, hostname: '127.0.0.1' },
    () => { throw new Error('boom'); },
);
await new Promise((r) => setTimeout(r, 300));
const r = await fetch('http://127.0.0.1:8097/');
console.log(r.status, JSON.stringify([...r.headers]));
console.log(JSON.stringify(await r.text()));
await server.shutdown();
TS
deno run --allow-net "$TMPDIR/err.ts"
```

Record the status, headers, and body. `http-server.test.ts`
pins `{"error":"internal error"}` with
`Cache-Control: no-store`; note in the report how far the
default is from that.

- [ ] **Step 4: PROBE 11 — `sec-fetch-mode` through `fetch`**

```bash
cat > "$TMPDIR/sec.ts" <<'TS'
const server = Deno.serve(
    { port: 8096, hostname: '127.0.0.1' },
    (req) => new Response(
        req.headers.get('sec-fetch-mode') ?? 'ABSENT',
    ),
);
await new Promise((r) => setTimeout(r, 300));
const r = await fetch('http://127.0.0.1:8096/', {
    headers: { 'sec-fetch-mode': 'navigate' },
});
console.log('server saw:', await r.text());
await server.shutdown();
TS
deno run --allow-net "$TMPDIR/sec.ts"
```

- **`navigate`** → PROBE 11 = FETCH CAN SET IT. Record it;
  Part 5 uses `fetch` in that test. Ruling R4 still holds
  for Part 3 — the test does not move in this part.
- **`ABSENT`** → PROBE 11 = FORBIDDEN, as the fetch spec
  says. The test keeps `node:http` through Part 5 too, and
  Part 5's Task on Node builtins names it as the one
  survivor with this measurement as the reason.

**No commit.** Report all four verdicts.

---

### Task 31: Serve with `Deno.serve`

**Files:**
- Modify: `server/http-server.ts` (the whole file)

**Interfaces:**
- Consumes: PROBEs 8, 9, 10, 11 from Task 30.
- Produces: `listenHttp(options)` with an **unchanged**
  signature and an unchanged `HttpListener` contract
  (`port`, `close()`). `boot.ts`, the three HTTP test
  files, and `tests/browser/fixtures.ts` do not move.

**This is one task and one commit**, unusually large for
this codebase. The Church wants tiny, semantically
contiguous commits AND every commit on master building and
passing. Those conflict here: there is no half-ported
`http-server.ts` that compiles, because `node:http`'s
`(IncomingMessage, ServerResponse)` and `Deno.serve`'s
`(Request, info) => Response` are different shapes all the
way down. Building wins. Work the steps in order and run
the four pinning test files after each.

- [ ] **Step 1: Read the covenant before changing anything**

```bash
deno test --frozen --no-check --allow-env --allow-read \
    --allow-write --allow-net --allow-run \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    tests/http-server.test.ts tests/http-throttle.test.ts \
    tests/http-static-directory-index.test.ts 2>&1 | tail -8
```

Record the three counts. They are what this task must
reproduce exactly, with no assertion edited.

- [ ] **Step 2: Replace the listener**

```ts
export function listenHttp(
    options: HttpListenOptions,
): Promise<HttpListener> {
    const handle = options.handle ?? handleRequest;
    const log = options.log ?? defaultLog;
    const drainMs = options.drainMs ?? DRAIN_TIMEOUT_MS;
    const throttle = createAuthThrottle(
        options.trustedProxyHops,
    );
    const controller = new AbortController();
    return new Promise((resolveListen, reject) => {
        try {
            const server = Deno.serve({
                port: options.port,
                ...(options.host !== undefined
                    ? { hostname: options.host }
                    : {}),
                signal: controller.signal,
                onListen: (addr) => {
                    resolveListen({
                        port: addr.port,
                        close: () => closeServer(
                            server, controller, drainMs,
                        ),
                    });
                },
                onError: internalError,
            }, (request, info) => dispatch(
                request, info, options, handle, log,
                throttle,
            ));
        } catch (error) {
            reject(error);
        }
    });
}
```

`onListen` gives the bound port — that is how
`port: 0` (the fixtures' ephemeral loopback) still reports
a real port. `onError` is Ruling R3: it returns the pinned
500 body, never Deno's default.

- [ ] **Step 3: Write `internalError` and `closeServer`**

```ts
function internalError(): Response {
    return jsonResponse(
        HTTP_INTERNAL_ERROR,
        { error: 'internal error' },
    );
}

async function closeServer(
    server: Deno.HttpServer,
    controller: AbortController,
    drainMs: number,
): Promise<void> {
    const timer = setTimeout(
        () => { controller.abort(); },
        drainMs,
    );
    try {
        await server.shutdown();
        await server.finished;
    } finally {
        clearTimeout(timer);
    }
}
```

`shutdown()` stops accepting and lets in-flight requests
finish; the timer aborts the serve signal after `drainMs`,
which is what `closeAllConnections()` did. `clearTimeout`
sits in a `finally` because a timer is a resource, and Part
5 turns the sanitizers on.

- [ ] **Step 4: Replace the response writers with one**

Delete `writeJson`, `writeFetchResponse`, and
`incomingToRequest` entirely. Add:

```ts
function jsonResponse(
    status: number,
    body: { readonly error: string },
    extra?: Readonly<Record<string, string>>,
): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type':
                'application/json; charset=utf-8',
            'Cache-Control': NO_STORE,
            ...(extra ?? {}),
        },
    });
}
```

`Content-Length` was set by hand before; `Response` sets it
from the body. Confirm against `http-server.test.ts` —
if it asserts the header, keep setting it explicitly.

- [ ] **Step 5: Read the body from the Request**

`readCappedBody` keeps its three outcomes — `bytes`,
`empty`, `too-large` — and its `Content-Length` pre-check,
now reading `request.headers.get('content-length')` and
then counting through `request.body`'s reader. The 1 MiB
cap (`REQUEST_BODY_MAX_BYTES`) and the 413 beyond it are
unchanged. `Buffer` becomes `Uint8Array` throughout; update
`BodyRead`'s `bytes` field type and `grantTypeOf`'s
argument, which decodes with `new TextDecoder().decode(…)`
instead of `bytes.toString('utf8')`.

- [ ] **Step 6: Serve static files with `Deno.stat` and `Deno.open`**

`serveStatic` returns a `Response` whose body is the file
handle's `readable`. The MIME table, the cache-control
rules, the `.html` CSP header, HEAD (no body), the 405 with
`Allow: GET, HEAD`, the 404, the directory index, the
`/not-found/index.html` navigation fallback, and
`safeStaticPath` (pure — **do not touch it**) are all
unchanged.

On the HEAD path, close the handle: opening a file to
report its size and never closing it is resource
abandonment. Prefer `Deno.stat` alone for HEAD and open
only for GET.

- [ ] **Step 7: Feed the throttle from `info.remoteAddr`**

Use the field PROBE 8 recorded. `normalizeAddress` in
`throttle.ts` is unchanged and still strips the `::ffff:`
prefix; the two forwarded-header reads become
`request.headers.get('forwarded')` and
`request.headers.get('x-forwarded-for')`, which return
`string | null` — map `null` to `undefined` at the call so
`headerLine`'s contract is unchanged.

- [ ] **Step 8: Log through `Deno.stdout`**

```ts
const LOG_ENCODER = new TextEncoder();

function defaultLog(fields: Record<string, unknown>): void {
    Deno.stdout.writeSync(
        LOG_ENCODER.encode(JSON.stringify(fields) + '\n'),
    );
}
```

The `RequestLog` seam and the captured-log assertions are
unchanged. The seven fields — `at`, `level`, `method`,
`path`, `status`, `latencyMs`, `operationId` — and their
`levelFor` mapping are unchanged. Never concatenate a value
into the message.

- [ ] **Step 9: Prove the covenant, assertion for assertion**

```bash
deno test --frozen --no-check --allow-env --allow-read \
    --allow-write --allow-net --allow-run \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    tests/http-server.test.ts tests/http-throttle.test.ts \
    tests/http-static-directory-index.test.ts 2>&1 | tail -8
git diff --stat tests/
```

Expected: the three counts from Step 1, and **`git diff` on
`tests/` is empty**. A changed assertion here means the port
changed behaviour.

- [ ] **Step 10: Prove no `node:` import remains**

```bash
grep -n 'node:' server/http-server.ts
```

Expected: no output.

- [ ] **Step 11: Full verification (operator for the last two)**

```bash
./test
./validate
```

Then, operator with `!`: `./test-browser` (ten files green —
the ported listener under real Chrome) and the compose
smoke.

- [ ] **Step 12: Commit**

```bash
git add server/http-server.ts
git commit -m "$(cat <<'MSG'
Serve with Deno.serve

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 32: Boot with `Deno.env`, `Deno.args`, and signals

**Files:**
- Modify: `server/boot.ts` (imports; `main`;
  `installSigterm`)
- Modify: `build:` the generated `main.ts` heredoc (the
  `process.argv.slice(2)` line from Task 23)

**Interfaces:**
- Consumes: Task 17's `EnvReader` seam and Task 22's
  `main(siteRoot, args)`.
- Produces: `boot.ts` with no `process` reference. The
  `EnvReader` type and every signature stay exactly as
  Task 17 and Task 22 defined them — this task changes only
  what is passed in and how the process exits.

- [ ] **Step 1: Change `main`'s three Node reaches**

```ts
export async function main(
    siteRoot: URL,
    args: readonly string[],
): Promise<void> {
    const running = await boot(
        (name) => Deno.env.get(name),
        args,
        fromFileUrl(siteRoot),
    );
    Deno.stdout.writeSync(new TextEncoder().encode(
        JSON.stringify({
            at: new Date().toISOString(),
            level: 'info',
            message: 'listening',
            port: running.port,
        }) + '\n',
    ));
    installSigterm(() => running.close());
}
```

`fromFileUrl` comes from `jsr:@std/path` — Ruling R5. Part 4
adds it to the import map; if this task runs first, add the
entry here and say so in the commit.

`Deno.env.get(name)` reads **by name**, which is what the
scoped `--allow-env` from Task 23 permits.
`Deno.env.toObject()` is forbidden: a bag read demands
blanket access.

- [ ] **Step 2: Change the signal handler**

```ts
function installSigterm(
    close: () => Promise<void>,
): void {
    Deno.addSignalListener('SIGTERM', () => {
        void close().then(
            () => Deno.exit(0),
            () => Deno.exit(1),
        );
    });
}
```

`process.once` fired once; `Deno.addSignalListener` does
not. `Deno.exit` inside the handler makes a second SIGTERM
moot, so the behaviour matches. If a test pins repeat-signal
behaviour, guard with a module-level `let draining = false`
and say which test demanded it.

- [ ] **Step 3: Change the generated entry**

In `build`'s `main.ts` heredoc, `process.argv.slice(2)`
becomes `Deno.args`.

- [ ] **Step 4: Prove `process` is gone**

```bash
grep -n 'process\.\|node:' server/boot.ts
```

Expected: no output.

- [ ] **Step 5: Verify**

```bash
./test
./validate
D=$(mktemp -d "${TMPDIR:-/tmp}/b32.XXXXXX")
./build --no-zip "$D/"
(cd "$D" && POSTGRES_URL="$POSTGRES_URL" \
    JWT_HMAC_SIGNING_KEY=k HTTP_SERVER_PORT=8095 \
    ./fusion-angle serve) &
sleep 2
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8095/
kill -TERM %1; sleep 1
jobs; rm -rf "$D"
```

Expected: `200`, then the process is gone — SIGTERM drained
and exited 0. The Postgres part needs the operator.

- [ ] **Step 6: Commit**

```bash
git add server/boot.ts build
git commit -m "$(cat <<'MSG'
Boot with Deno env, args, and signals

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 33: Port the operator tools to `Deno.*`

**Files:**
- Modify: `server/postgres-seed.ts`
- Modify: `server/postgres-wipe.ts`

**Interfaces:**
- Consumes: `seedMain(args)` and `wipeMain(args)` from
  Task 22.
- Produces: both tools with no `process` reference. Their
  signatures and their distinct error voices are unchanged.

Two files of the same shape and the same size. **Dispatch
them as one batch, review the diff as one unit** — this is
the same edit twice, not two judgments.

- [ ] **Step 1: Replace the Node reaches in each file**

Read **§ The Node-to-Deno mapping**, § Process, and apply
it. One extra row is specific to these two files:

| From | To |
|---|---|
| `requiredEnv('POSTGRES_URL')` | `requiredEnvBy('POSTGRES_URL', (name) => Deno.env.get(name))` |

`requiredEnvBy` is the reader-shaped sibling Task 17 added
to `server/postgres-gate.ts`.

Both `isMainModule()` functions were deleted in Task 22.
Confirm neither file still imports `resolve` or
`fileURLToPath` for them.

- [ ] **Step 2: Replace the exit codes**

`seedMain` and `wipeMain` already **return** their exit code
rather than calling `process.exit` — Task 22 made that
change. Confirm no `process.exit` survives; the dispatcher
owns exiting.

- [ ] **Step 3: Prove both are clean**

```bash
grep -n 'process\.' server/postgres-seed.ts \
    server/postgres-wipe.ts
grep -rn 'node:' server/postgres-seed.ts \
    server/postgres-wipe.ts
```

Expected: no output from either.

- [ ] **Step 4: Verify (operator for Postgres)**

```bash
./test
./validate
```

Then, operator with `!`:

```bash
docker compose up --wait postgres
./postgres-wipe --postgres local
./postgres-seed --postgres local --bootstrap
./postgres-seed --postgres local --mock-data
```

Expected: the wipe drops the message plane; the bootstrap
seed prints credentials **once** on stdout; the second seed
**refuses** — `./postgres-seed` runs on an empty database
and refuses a non-empty one. That refusal is the covenant,
not a bug.

- [ ] **Step 5: Commit**

```bash
git add server/postgres-seed.ts server/postgres-wipe.ts
git commit -m "$(cat <<'MSG'
Port the operator tools to Deno

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 34: Name the `node:crypto` scrypt exception

**Files:**
- Modify: `server/scrypt-hash.ts` (the header comment)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. This task changes a comment and
  nothing else.

`scrypt-hash.ts` keeps `node:crypto`. It is the one named
exception in the product process, and an exception nobody
wrote down is an exception nobody can retire.

- [ ] **Step 1: Confirm it is the last one**

```bash
grep -rn 'node:' server/ api/ shared/
```

Expected: hits in `server/scrypt-hash.ts` only. **Any other
hit is a file Part 3 missed** — name it in the report; the
controller rules on whether it belongs to Task 31, 32, or
33 before this task commits.

- [ ] **Step 2: Write the header**

Replace the file's opening comment with one that says three
things: that this module imports `node:crypto` deliberately;
**why** — Web Crypto has no scrypt, and neither does Deno's
namespace; and **the day it may leave** — a `Deno` or
`@std` scrypt landing. Keep it at or under 78 characters a
line, and explain the why, never the what.

- [ ] **Step 3: Verify and commit**

```bash
./validate
```

```bash
git add server/scrypt-hash.ts
git commit -m "$(cat <<'MSG'
Name the node:crypto scrypt exception

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 35: Document the server idiom

**Files:**
- Modify: `AGENTS.md` (§ HTTP only; § Invariants that bite)
- Modify: `ARCHITECTURE.md` (the HTTP adapter description)
- Modify: `TEST-PLAN.md` (any case naming `node:http`)

**Interfaces:**
- Consumes: Task 30's four probe verdicts.
- Produces: the documented state of Part 3.

- [ ] **Step 1: Find every mention**

```bash
grep -rn 'node:http\|node:fs\|IncomingMessage\|ServerResponse\|createServer' \
    AGENTS.md README.md ARCHITECTURE.md TEST-PLAN.md \
    SCHEMA.md API.md DESIGN-SYSTEM.md FLOW-CANVAS.md AUDIT.md
```

- [ ] **Step 2: Write the changes**

- **AGENTS.md § HTTP only:** the origin is `Deno.serve`
  inside the compiled binary.
- **AGENTS.md § Invariants that bite:** add one short
  subsection naming `node:crypto` scrypt in
  `server/scrypt-hash.ts` as the one surviving `node:`
  import in the product process, and the condition under
  which it leaves.
- **ARCHITECTURE.md:** the HTTP adapter is `Deno.serve`;
  the drain is `shutdown()` + `finished` with the
  `drainMs` abort; static files stream from `Deno.open`,
  which reads the compiled file system.
- **TEST-PLAN.md:** if PROBE 11 = FORBIDDEN, note that
  `http-static-directory-index.test.ts` keeps `node:http`
  because `Sec-*` is a forbidden `fetch` header — the
  measurement, not the opinion.

- [ ] **Step 3: Verify and commit**

```bash
wc -l AGENTS.md ARCHITECTURE.md
./validate
```

```bash
git add AGENTS.md ARCHITECTURE.md TEST-PLAN.md
git commit -m "$(cat <<'MSG'
Document the Deno server idiom

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

## Part 3 exit gate

```bash
./validate                                  # exit 0
grep -rn 'node:' server/ api/ shared/       # scrypt-hash.ts only
git diff --stat <part-3-base> -- tests/     # only additions, no
                                            # changed assertion in
                                            # the four HTTP pins
```

Operator, with `!`:

- `./test-postgres` — seven files pass.
- `./test-all` — ten browser files green, the ported
  listener under real Chrome.
- The compose smoke and
  `./measure --base-url http://127.0.0.1:8080` — the
  request path, now native.
- `./crank --mock-data 8080`, then the walk's cases that
  exercise navigation, 404s, and static caching (Layer 3),
  and the same against the compose origin.

---

# Part 4 — Tooling idiom

**Spec:** `docs/superpowers/specs/2026-08-21-deno-tooling-idiom-design.md`

The seven Node-only modules under `web-app/app/` —
`compose.ts` (168 lines), `generate-schema-svg.ts` (34),
`generate-api-documentation.ts` (1050), `measure.ts` (961),
`measure-viz.ts` (1847), `cdp-client.ts` (483), and
`browser-drive.ts` (184) — plus `postgres-lib`'s eight
inline programs speak Deno. `process` and `node:` imports
leave `web-app/app/*.ts` and the root scripts.

**Ruling R5 applies:** `jsr:@std/path` is adopted.

`browser-drive.ts` is pure over `cdp-client.ts` with no
Node surface of its own — it needs no task. Confirm that in
Task 44's final sweep rather than assuming it.

---

### Task 36: Probe `Deno.Command` process semantics

**Files:** none. This task commits nothing.

**Interfaces:**
- Consumes: nothing.
- Produces: three verdicts Tasks 41 and 42 consume.

`measure.ts` and `cdp-client.ts` both spawn a **detached**
child and `unref` it, and `killProcessTree` signals the
process **group** (`process.kill(-child.pid, …)`). That is
the risk the spec names, and it is what this probe settles
before either port begins.

- [ ] **Step 1: PROBE 12 — detached child and group kill**

```bash
cat > "$TMPDIR/spawnprobe.ts" <<'TS'
const child = new Deno.Command('sh', {
    args: ['-c', 'sleep 30 & sleep 30 & wait'],
    stdout: 'null', stderr: 'piped',
}).spawn();
console.log('pid', child.pid);
await new Promise((r) => setTimeout(r, 500));
try {
    Deno.kill(-child.pid, 'SIGTERM');
    console.log('GROUP KILL OK');
} catch (e) {
    console.log('GROUP KILL FAILED', String(e));
    child.kill('SIGTERM');
}
await child.status;
console.log('child reaped');
TS
deno run --allow-run "$TMPDIR/spawnprobe.ts"
pgrep -f 'sleep 30' && echo "ORPHANS REMAIN" || echo "NO ORPHANS"
```

- **`GROUP KILL OK` and `NO ORPHANS`** → PROBE 12 = GROUP
  KILL WORKS. `killProcessTree` ports as
  `Deno.kill(-pid, …)`.
- **`GROUP KILL FAILED` or `ORPHANS REMAIN`** → PROBE 12 =
  NO GROUP KILL. Chrome spawns a process tree, and an
  orphaned Chrome per measurement run is a leak that
  `./measure` would accumulate across 25 runs × N pages.
  Task 41 must then kill the tree another way — record what
  the probe showed and let the controller rule before
  Task 41 starts.

- [ ] **Step 2: PROBE 13 — does the parent outlive the child?**

Node's `unref` lets the parent exit while a detached child
keeps running. `./measure` relies on that for the server it
spawns.

```bash
cat > "$TMPDIR/unrefprobe.ts" <<'TS'
const child = new Deno.Command('sh', {
    args: ['-c', 'sleep 5'],
    stdout: 'null', stderr: 'null',
}).spawn();
child.unref();
console.log('parent exiting with child', child.pid);
TS
time deno run --allow-run "$TMPDIR/unrefprobe.ts"
```

Expected: returns immediately, not after 5 s. Record
whether `unref()` exists on `Deno.ChildProcess` at 2.9.5
and whether the parent exits. If it does not, Task 42 keeps
the child referenced and closes it explicitly in a
`finally` — which is better practice anyway, and Part 5's
sanitizers will demand it.

- [ ] **Step 3: PROBE 14 — free port and CPU count**

```bash
cat > "$TMPDIR/portprobe.ts" <<'TS'
const l = Deno.listen({ port: 0 });
console.log('port', (l.addr as Deno.NetAddr).port);
l.close();
console.log('cpus', navigator.hardwareConcurrency);
console.log('os', Deno.build.os, 'arch', Deno.build.arch);
TS
deno run --allow-net "$TMPDIR/portprobe.ts"
```

Expected: a non-zero ephemeral port, a plausible CPU count,
and the host's os/arch. These replace `node:net`'s
`createServer` free-port dance and `node:os`'s `cpus()`,
`platform()`, and `arch()`.

**No commit.** Report all three verdicts.

---

### Task 37: Add `jsr:@std/path` to the import map

**Files:**
- Modify: `deno.json` (`imports`)
- Modify: `deno.lock` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: the specifier `@std/path`, resolving to a
  pinned `jsr:@std/path@<version>`. Tasks 38–43 import
  `join`, `dirname`, `resolve`, `extname`, `relative`, and
  `fromFileUrl` from it.

**Ruling R5 in code.** This is the repository's first `jsr:`
dependency. It is pinned exactly, like every other.

- [ ] **Step 1: Add the entry**

```json
    "imports": {
        "postgres": "npm:postgres@3.4.9",
        "@std/path": "jsr:@std/path@1.1.2"
    },
```

Use the exact version `deno install` resolves — check it in
`deno.lock` after Step 2 and make the two agree. A caret or
a range is not a pin.

- [ ] **Step 2: Lock it**

```bash
deno install
git diff --stat deno.lock
grep -n '@std/path' deno.lock | head -3
```

`jsr.io` is reachable from the sandbox for npm-style
resolution; if it is not, this is the one step the operator
runs with `!`.

- [ ] **Step 3: Prove it imports**

```bash
cat > "$TMPDIR/pathprobe.ts" <<'TS'
import { join, relative, fromFileUrl } from '@std/path';
console.log(join('a', 'b'), relative('/a', '/a/b'));
console.log(fromFileUrl('file:///tmp/x'));
TS
deno run --frozen --config deno.json "$TMPDIR/pathprobe.ts"
```

- [ ] **Step 4: Verify and commit**

```bash
./validate
```

```bash
git add deno.json deno.lock
git commit -m "$(cat <<'MSG'
Add jsr:@std/path to the import map

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 38: Port `compose.ts` to Deno

**Files:**
- Modify: `web-app/app/compose.ts:1-15`
- Modify: `build-lib` (the `deno run` permission flags, if
  the port narrows them)

**Interfaces:**
- Consumes: `@std/path` from Task 37.
- Produces: `compose.ts` with no `node:` import and no
  `process` reference. Its CLI contract — one positional
  output directory, defaulting to the repository root — is
  unchanged.

`compose.ts` is excluded from the 78-character lint by
path. It stays excluded; do not reflow the file.

- [ ] **Step 1: Replace the imports**

```ts
import { join, dirname } from '@std/path';
```

Then apply **§ The Node-to-Deno mapping**, § Files, to the
six `node:fs` calls. `cpSync` is the one that needs
`@std/fs`'s `copySync`: add `@std/fs` to the import map in
the same commit, pinned exactly, and say so in the report —
Ruling R5 covered `@std/path`, not `@std/fs`.

`resolve` is imported today but check whether it is still
used after the port; `noUnusedLocals` is on.

- [ ] **Step 2: Replace the two `process` reaches**

```ts
const ROOT = join(import.meta.dirname!, '..');
const outArg = Deno.args[0];
const OUT = outArg !== undefined ? outArg : ROOT;
```

`import.meta.dirname` replaces the
`dirname(new URL(import.meta.url).pathname)` dance, which
was already wrong on Windows paths. `Deno.args[0]` replaces
`process.argv[2]` — `Deno.args` is already sliced.

- [ ] **Step 3: Prove the composed output is byte-identical**

```bash
BEFORE=$(mktemp -d "${TMPDIR:-/tmp}/c38b.XXXXXX")
AFTER=$(mktemp -d "${TMPDIR:-/tmp}/c38a.XXXXXX")
git stash
deno run --frozen --allow-read --allow-write="$BEFORE" \
    web-app/app/compose.ts "$BEFORE"
git stash pop
deno run --frozen --allow-read --allow-write="$AFTER" \
    web-app/app/compose.ts "$AFTER"
diff -r "$BEFORE" "$AFTER" && echo "IDENTICAL"
rm -rf "$BEFORE" "$AFTER"
```

Expected: `IDENTICAL`. This is the task's oracle: the
composed HTML is what the browser suite and the walk read.

- [ ] **Step 4: Verify and commit**

```bash
grep -n 'node:\|process\.' web-app/app/compose.ts
./validate
```

Expected: no output from the grep, then exit 0. Operator:
`./test-browser`, ten files green.

```bash
git add web-app/app/compose.ts build-lib deno.json deno.lock
git commit -m "$(cat <<'MSG'
Port compose.ts to Deno

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 39: Port both generators to Deno

**Files:**
- Modify: `web-app/app/generate-schema-svg.ts` (34 lines)
- Modify: `web-app/app/generate-api-documentation.ts`
  (1050 lines)

**Interfaces:**
- Consumes: `@std/path` from Task 37.
- Produces: both generators with no `node:` import and no
  `process` reference. `./validate`'s two `--check` gates
  call them unchanged.

**Two files, the same edit, one dispatch — two commits.**
The batch is one review surface; the history keeps one
concern per commit.

**Byte parity is the oracle.** Both generators write files
that are committed to the repository, and `./validate`
fails on drift. A single changed byte fails the gate, which
is exactly the safety net this port needs.

- [ ] **Step 1: Apply the mapping**

Read **§ The Node-to-Deno mapping** in full and apply its
Files, Paths, and Process tables to both generators.

`isCliEntry()` matched `argv[1]` against the module URL
because the script could be imported by a test.
`import.meta.main` says the same thing without the path
arithmetic — but **check each generator's tests first**: if
a test imports the module and asserts `isCliEntry()`
returns false, keep the function and change only its body.

- [ ] **Step 2: Prove byte parity, one generator at a time**

```bash
shasum -a 256 SCHEMA.svg > "$TMPDIR/g39.txt"
find web-app/api-documentation -type f -exec shasum -a 256 {} + \
    >> "$TMPDIR/g39.txt"
./generate-schema-svg
./generate-api-documentation
shasum -a 256 -c "$TMPDIR/g39.txt"
git status --porcelain
```

Expected: every line `OK`, and `git status` empty.

- [ ] **Step 3: Prove the `--check` gates still bite**

A gate that cannot fail is a comfort object:

```bash
printf '\n<!-- drift -->\n' >> SCHEMA.svg
./generate-schema-svg --check; echo "exit=$?"
git checkout SCHEMA.svg
./generate-schema-svg --check; echo "exit=$?"
```

Expected: non-zero, then 0.

- [ ] **Step 4: Verify and commit — twice**

```bash
grep -n 'node:\|process\.' web-app/app/generate-schema-svg.ts
./validate
git add web-app/app/generate-schema-svg.ts
git commit -m "$(cat <<'MSG'
Port the schema generator to Deno

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

Then the same for
`web-app/app/generate-api-documentation.ts` with subject
`Port the API documentation generator to Deno`.

---

### Task 40: Port `measure-viz.ts` to Deno

**Files:**
- Modify: `web-app/app/measure-viz.ts` (1847 lines;
  `node:fs`, `node:path`, no `process`)

**Interfaces:**
- Consumes: `@std/path` from Task 37.
- Produces: `generateMeasureViz(...)` unchanged in
  signature. `measure.ts` calls it for `--visualize`.

This module has **no `process` surface** — it is a library,
not an entry point. The port is **§ The Node-to-Deno
mapping**'s Files and Paths tables and nothing else. Do not
add a CLI to it.

- [ ] **Step 1: Apply the mapping**

Read **§ The Node-to-Deno mapping**, § Files and § Paths,
and apply them. The named-error rule matters here: a
missing history file must not be reported the same way a
permission fault is.

- [ ] **Step 2: Prove the output**

```bash
./measure --visualize
git status --porcelain measurements/
```

`--visualize` reads history from disk and needs no Chrome,
so it runs in the sandbox. Expected: the HTML regenerates.
If the output is committed, `git status` must be empty when
the history has not changed; if it is not committed, the
file appears where the script says it does.

- [ ] **Step 3: Verify and commit**

```bash
grep -n 'node:\|process\.' web-app/app/measure-viz.ts
./validate
```

```bash
git add web-app/app/measure-viz.ts
git commit -m "$(cat <<'MSG'
Port measure-viz.ts to Deno

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 41: Port `cdp-client.ts` to `Deno.Command`

**Files:**
- Modify: `web-app/app/cdp-client.ts` (483 lines; lines
  6–9's imports, 42–43's `process.env.CHROME`, 55–72's
  `killProcessTree`)

**Interfaces:**
- Consumes: Task 36's PROBE 12 and PROBE 13 verdicts;
  `@std/path` from Task 37.
- Produces: `cdp-client.ts` with no `node:` import and no
  `process` reference. `browser-drive.ts` and
  `tests/browser/fixtures.ts` both import it and must not
  change. `killProcessTree`'s exported signature is
  unchanged; only its body moves.

**Two runtimes read this file:** `./measure` and
`./test-browser`. Both must stay green.

- [ ] **Step 1: Read PROBE 12's verdict**

If PROBE 12 = NO GROUP KILL, do not proceed as written.
Report BLOCKED with the probe output: an orphaned Chrome
per run is a leak `./measure` accumulates, and the
controller rules on the replacement before this task
starts.

- [ ] **Step 2: Replace the Chrome launch**

`spawn(chromePath, args, { detached: true, stdio: … })`
becomes:

```ts
const child = new Deno.Command(chromePath, {
    args,
    stdout: 'null',
    stderr: 'piped',
}).spawn();
```

Keep every Chrome flag exactly as it is — the flag list is
tuned for the CDP handshake and the `DevToolsActivePort`
file, and changing one is a behaviour change.

If PROBE 13 showed `unref()` is unavailable or ineffective,
do **not** simulate it. Keep the child referenced and close
it in the existing teardown; a referenced child that is
always closed is better than a detached one that might not
be.

- [ ] **Step 3: Replace `killProcessTree`**

```ts
export function killProcessTree(
    child: Deno.ChildProcess,
): void {
    try {
        Deno.kill(-child.pid, 'SIGTERM');
    } catch {
        child.kill('SIGTERM');
    }
    // … the existing SIGKILL escalation, same shape
}
```

The existing timing — SIGTERM, wait, SIGKILL — is
unchanged. The `catch` here is narrow and named: a group
kill fails when the child is not a group leader, and the
single-process kill is the correct fallback for exactly
that case. It is not a greedy catch.

Change the parameter type from `ChildProcess` to
`Deno.ChildProcess` and update `browser-drive.ts` and
`tests/browser/fixtures.ts` only if they name the type. If
they do not, they do not change.

- [ ] **Step 4: Replace the remaining three reaches**

Apply **§ The Node-to-Deno mapping** to the four remaining
reaches: `process.env.CHROME`, the `existsSync` +
`readFileSync` pair that reads `DevToolsActivePort`,
`platform()` from `node:os`, and `join` from `node:path`.

The section's **`'win32'` trap** is live in this file — read
that paragraph before you change the platform comparison.

- [ ] **Step 5: Prove it under both runtimes (operator)**

```bash
./test-browser
```

Expected: ten files green — this is `cdp-client.ts`'s
second runtime and the deterministic one.

```bash
./measure --runs 1 --pages organization
pgrep -f 'Google Chrome.*remote-debugging' && echo "ORPHAN" \
    || echo "NO ORPHAN"
```

Expected: the run completes and **no orphan Chrome
survives**. Run it twice and check again — a leak shows on
the second run.

- [ ] **Step 6: Verify and commit**

```bash
grep -n 'node:\|process\.' web-app/app/cdp-client.ts
./validate
```

```bash
git add web-app/app/cdp-client.ts web-app/app/browser-drive.ts \
    tests/browser/fixtures.ts
git commit -m "$(cat <<'MSG'
Port cdp-client.ts to Deno.Command

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 42: Port `measure.ts` to Deno

**Files:**
- Modify: `web-app/app/measure.ts` (961 lines; imports at
  12–33; 33 `process.*` sites; the server `spawn` near 596)
- Modify: `measure` (the wrapper's permission flags)

**Interfaces:**
- Consumes: Task 36's three verdicts; Task 41's ported
  `cdp-client.ts`; Task 25's `MEASURE_SERVER_ENTRY`.
- Produces: `measure.ts` with no `node:` import and no
  `process` reference. `measure-cli.ts` is **pure** and
  does not change.

The largest port in this part. Work it in the order below
and run `deno check` after each group; do not batch the
whole file and hope.

- [ ] **Step 1: `node:child_process` → `Deno.Command`**

Two callers with different shapes:

- The **server** spawn (near line 596) becomes a
  `Deno.Command(MEASURE_SERVER_ENTRY, { args:
  measureServerArgs(), cwd: buildDir, env: {…},
  stdout: 'null', stderr: 'piped' }).spawn()`. `env` under
  `Deno.Command` **replaces** the environment rather than
  extending it unless `clearEnv` is false — read the option
  semantics and pass exactly what the child needs
  (`POSTGRES_URL`, `JWT_HMAC_SIGNING_KEY`,
  `HTTP_SERVER_PORT`, plus `PATH`). A server that boots
  without `PATH` and then cannot resolve anything is the
  failure to expect here.
- `execFile` (git, `./build --no-zip`, the seed) becomes
  `new Deno.Command(cmd, { args }).output()`, whose result
  carries `code`, `stdout`, and `stderr` as bytes. Decode
  with a `TextDecoder`. `promisify` from `node:util` leaves
  with its last caller.

- [ ] **Step 2: `node:net` → `Deno.listen`**

The free-port helper becomes:

```ts
async function freePort(): Promise<number> {
    const listener = Deno.listen({ port: 0 });
    const { port } = listener.addr as Deno.NetAddr;
    listener.close();
    return port;
}
```

The `close()` is not optional — Part 5's sanitizers fail a
test that leaks a listener, and this helper runs under
them.

- [ ] **Step 3: `node:os` → `Deno` globals**

Apply **§ The Node-to-Deno mapping**, § Operating system and
process spawning.

The os/arch **string values differ** from Node's, and they
are written into `measurements/` records that
`measure-viz.ts` reads and that history files already
contain. Decide once and say so in the commit: either map
the new values back to the recorded vocabulary, or record
the new ones and note the discontinuity in the history.
**Do not let two vocabularies into one history file
silently.**

- [ ] **Step 4: `node:fs` and `node:path`**

**§ The Node-to-Deno mapping**, § Files and § Paths.

- [ ] **Step 5: The 33 `process.*` sites**

**§ The Node-to-Deno mapping**, § Process. The `MeasureEnv`
reads go by name — that is what Task 6 may have widened the
alias for.

- [ ] **Step 6: Name the permissions on the wrapper**

In `measure`, replace `node --strip-types
web-app/app/measure.ts "$@"` with a `deno run` naming
exactly what the tool needs: read; write (its temp dir and
`measurements/`); net; run (the binary, `./postgres-seed`,
Chrome, `git`); env. Scope `--allow-write` and
`--allow-run` to those lists; leave `--allow-env` scoped
unless a variable forces otherwise, and say which one did.

- [ ] **Step 7: Prove it end to end (operator)**

```bash
./measure --runs 1 --pages organization
./measure --visualize
./measure --profile
```

Expected: the first seeds, spawns the binary, drives
Chrome, and reports; the second regenerates history HTML
with no Chrome; the third reports API counts. Then check
for orphans as in Task 41.

- [ ] **Step 8: Verify and commit**

```bash
grep -n 'node:\|process\.' web-app/app/measure.ts
grep -c node measure
./test
./validate
```

Expected: no output from the first grep, `0` from the
second.

```bash
git add web-app/app/measure.ts measure
git commit -m "$(cat <<'MSG'
Port measure.ts to Deno

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 43: Port `postgres-lib`'s eight inline programs

**Files:**
- Modify: `postgres-lib` (lines 15, 72, 120, 150, 183, 213,
  233, 283)

**Interfaces:**
- Consumes: nothing.
- Produces: `postgres-lib` with no `node` invocation. This
  is the **last Node caller in the repository**; Task 44's
  sweep proves it.

Eight `node --input-type=module -e` programs: the Render
error-message reader, the job-body writer, the log
flattener, the reveal printer, the loopback host check, the
job-id reader, the job-status reader, and the Render-id
discovery. Each becomes `deno eval` with **the narrowest
permission it needs** — most read one file and write
stdout, so `--allow-read=FILE` and nothing else.

**Eight small edits of one shape — dispatch as one batch,
review as one diff, commit as one concern.**

- [ ] **Step 1: Enumerate them with their permissions**

```bash
grep -n 'node --input-type=module -e' -A 12 postgres-lib \
    > "$TMPDIR/inline-programs.txt"
sed -n '1,200p' "$TMPDIR/inline-programs.txt"
```

For each, write down: what it reads (a file path, an
environment variable, nothing), what it writes (stdout
only, or a file), and therefore its flag list. Put that
table in the report before editing anything.

- [ ] **Step 2: Convert each**

`node --input-type=module -e '<program>'` becomes
`deno eval --frozen <flags> '<program>'`, and inside each
program apply **§ The Node-to-Deno mapping**. Note
`process.argv[2]` → `Deno.args[0]`: `Deno.args` is already
sliced, so the index shifts by two.

`deno eval` takes arguments after the program text, same as
`node -e`. Keep each program's shell quoting exactly as it
is — these are single-quoted heredoc-free strings, and a
quoting change is a silent behaviour change.

- [ ] **Step 3: Prove each one runs**

The Render programs need no Render to be exercised: they
are pure readers over JSON files. Feed each a fixture:

```bash
printf '{"id":"job-abc","status":"succeeded"}' \
    > "$TMPDIR/job.json"
# invoke the job-id reader and the status reader against it
```

Expected: each prints what the shell function expects. Do
this for all eight; a program that is never run is a
program that is never proven.

- [ ] **Step 4: Prove the local paths still work (operator)**

```bash
./postgres-wipe --postgres local
./postgres-seed --postgres local --mock-data
./postgres-seed --help
./postgres-wipe --help
```

Expected: the local wipe and seed work end to end; both
`--help` texts are accurate. The Render branch is reviewed
by `--help` and a dry read — **no Render exists in the
sandbox**, and the report says so rather than claiming a
run.

- [ ] **Step 5: Verify and commit**

```bash
grep -n '\bnode\b' postgres-lib postgres-seed postgres-wipe
./validate
```

Expected: no output.

```bash
git add postgres-lib
git commit -m "$(cat <<'MSG'
Run the operator helpers under deno eval

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 44: Document the tooling idiom

**Files:**
- Modify: `AGENTS.md` (the command block; § Gates)
- Modify: `README.md` if it names Node anywhere
- Modify: `TEST-PLAN.md` (any case naming `node`)

**Interfaces:**
- Consumes: Tasks 38–43.
- Produces: the documented state of Part 4, and the proof
  that Node is gone.

- [ ] **Step 1: The sweep**

```bash
grep -rn '\bnode\b\|node:\|process\.' \
    build build-lib serve test test-postgres test-browser \
    test-all crank measure generate-schema-svg \
    generate-api-documentation postgres-seed postgres-wipe \
    postgres-lib Dockerfile compose.yaml
grep -rn 'node:\|process\.' web-app/app/*.ts server/ api/ shared/
```

Expected: **`server/scrypt-hash.ts` only.** Everything else
is a site Part 4 missed. `browser-drive.ts` should appear
nowhere — confirm that here rather than assuming it.

- [ ] **Step 2: Write the changes**

State plainly in AGENTS.md that Deno 2.9.5 is the only
runtime, that `npm` is not installed and not needed, and
that `node:crypto` scrypt in `server/scrypt-hash.ts` is the
one named import from Node's namespace — with the day it
may leave. Remove any surviving "requires Node" clause from
README.md and TEST-PLAN.md.

- [ ] **Step 3: Verify and commit**

```bash
wc -l AGENTS.md README.md
./validate
```

```bash
git add AGENTS.md README.md TEST-PLAN.md
git commit -m "$(cat <<'MSG'
Document the Deno tooling idiom

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

## Part 4 exit gate

```bash
./validate                                  # exit 0
grep -rn 'node:\|process\.' web-app/app/*.ts server/ api/ \
    shared/                                 # scrypt-hash.ts only
grep -rn '\bnode\b' build build-lib serve test test-postgres \
    test-browser test-all crank measure postgres-lib \
    postgres-seed postgres-wipe             # no output
```

Operator, with `!`:

- `./test-all` — ten browser files green with the ported
  `cdp-client.ts` under real Chrome.
- `./generate-schema-svg --check` and
  `./generate-api-documentation --check` — byte parity.
- `./measure --runs 1 --pages organization` end to end, and
  a bare `./measure --visualize`.
- `./postgres-seed --postgres local --mock-data` and
  `./postgres-wipe --postgres local` against the compose
  Postgres.
- No orphan Chrome after two `./measure` runs.

---

# Part 5 — Test idiom

**Spec:** `docs/superpowers/specs/2026-08-21-deno-test-idiom-design.md`

The 408 test files speak Deno: `Deno.test` and
`jsr:@std/assert` replace `node:test` and `node:assert`;
per-test fixtures that restore replace module-level stubs;
the resource and op sanitizers are on.

**The counts are the oracle, before and after.** Whatever
`./test` reports at the start of this part is what it
reports at the end, adjusted only by tests this plan
explicitly added (Tasks 17, 22, and possibly 21) or removed
(Task 13, branch 2b). A count that moves for any other
reason is a finding.

**Ruling R6 applies:** one commit per family, each green.
The families measured at `e1cbeac9`:

| Family | Files | Family | Files |
|---|--:|---|--:|
| `api-*` | 109 | `mock-*` | 13 |
| `adapters-*` | 50 | `derive-*` | 13 |
| `flow-*` | 26 | `validators-*` | 6 |
| `presenter-*` | 24 | `pg-*` | 6 |
| `http-*` | 17 | `backend-*` | 5 |
| `drift-*` | 16 | unprefixed | 111 |

Plus `tests/tz/` (2) and `tests/browser/` (10).

**Ruling R7 applies:** `tests/hmac-test-key.ts` survives as
a preload.

---

### Task 45: Write the codemod and convert `validators-*`

**Files:**
- Create:
  `.superpowers/sdd/2026-08-30-deno-migration/codemod.ts` —
  **not committed**. That directory is this plan's
  git-ignored SDD workspace; the controller gets its path
  from the subagent-driven-development skill's
  `scripts/sdd-workspace <this plan file>` and passes it in
  the dispatch as `WORKSPACE`.
- Modify: `tests/validators-*.test.ts` (6 files)

**Interfaces:**
- Consumes: `jsr:@std/assert`, added to the import map in
  this task.
- Produces: the codemod script (in the workspace, its path
  named in the report) and the proof that it works on the
  smallest family. Tasks 46–47 run the same script.

`validators-*` is the proving ground: six files, no hooks,
no timers, no `localStorage`, no Node builtins. If the
codemod is wrong, it is wrong here where the diff is
readable.

- [ ] **Step 1: Add `@std/assert` to the import map**

```json
        "@std/assert": "jsr:@std/assert@1.0.14"
```

Use the exact version `deno install` resolves. Run
`deno install` and commit `deno.json` and `deno.lock`
**first**, as its own commit, subject
`Add jsr:@std/assert to the import map`.

- [ ] **Step 2: Write the codemod**

It rewrites, per file:

- `import { test } from 'node:test';` → removed
- `import assert from 'node:assert/strict';` and
  `import { strict as assert } from 'node:assert';` →
  removed
- `test(` at the start of a line → `Deno.test(`
- the assertion vocabulary, per this table:

  | From | To |
  |---|---|
  | `assert.equal` | `assertStrictEquals` |
  | `assert.deepEqual` | `assertEquals` |
  | `assert.ok` | `assert` |
  | `assert.match` | `assertMatch` |
  | `assert.doesNotMatch` | `assertNotMatch` |
  | `assert.notEqual` | `assertNotStrictEquals` |
  | `assert.notDeepEqual` | `assertNotEquals` |
  | `assert.fail` | `fail` |
  | `assert.rejects` | `assertRejects` |
  | `assert.throws` | `assertThrows` |

- a generated `import { … } from '@std/assert';` naming
  exactly the helpers the rewritten file uses, and no
  others — `noUnusedLocals` is on and `deno check` covers
  `tests/`.

**The codemod does NOT rewrite** regular-expression
matchers on `throws`/`rejects`. `@std/assert`'s
`assertThrows(fn, ErrorClass?, msgIncludes?)` takes a
**substring**, not a regular expression, and Node's
`assert.throws(fn, /re/)` is common here. The codemod
**lists** every such site and leaves the source untouched;
Step 4 rewrites them by hand.

- [ ] **Step 3: Run it on the family and read the diff**

```bash
deno run --allow-read --allow-write \
    "$WORKSPACE/codemod.ts" tests/validators-*.test.ts
git diff --stat tests/
git diff tests/validators-request.test.ts | head -60
```

Read one whole file's diff by eye before trusting the rest.

- [ ] **Step 4: Rewrite the regex matchers by hand**

For each site the codemod listed:

- If the pattern is a **literal substring** (`/missing id/`)
  → `assertThrows(fn, Error, 'missing id')`.
- If it is a **real pattern** (anchors, classes,
  alternation) → 

  ```ts
  const err = assertThrows(fn) as Error;
  assertMatch(err.message, /the original pattern/);
  ```

  `assertThrows` returns the thrown value, so nothing is
  lost. **Never loosen a pattern to make it fit the
  substring form** — that is weakening the test, and the
  covenant is the assertion, not the convenience.

- [ ] **Step 5: Check and run**

```bash
deno check --frozen tests
./test
```

Expected: `deno check` clean over `tests/`, and the family's
tests pass with the **same count** they had before. Compare
per file:

```bash
deno test --frozen --no-check --allow-env --allow-read \
    --allow-write --allow-net --allow-run \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    tests/validators-*.test.ts 2>&1 | tail -5
```

- [ ] **Step 6: Watch for the honest failures**

`assertEquals` and Node's `deepStrictEqual` differ at the
edges — prototypes, `-0`, `NaN`. A test that passed by
accident may now fail by honesty. **Each such failure is a
finding, fixed per case**, and the fix is in the assertion's
subject or the assertion's precision — never in deleting
the case.

- [ ] **Step 7: Commit**

```bash
git add tests/validators-*.test.ts
git commit -m "$(cat <<'MSG'
Convert the validators tests to Deno.test

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

Report the codemod's workspace path and the list of regex
sites it could not rewrite, so Tasks 46–47 expect them.

---

### Task 46: Convert the eight mechanical families

**Files:**
- Modify: `tests/api-*.test.ts` (109),
  `tests/adapters-*.test.ts` (50),
  `tests/flow-*.test.ts` (26),
  `tests/presenter-*.test.ts` (24),
  `tests/http-*.test.ts` (17),
  `tests/drift-*.test.ts` (16),
  `tests/mock-*.test.ts` (13),
  `tests/derive-*.test.ts` (13),
  `tests/backend-*.test.ts` (5)

**Interfaces:**
- Consumes: Task 45's codemod and its regex-site list.
- Produces: 273 files on `Deno.test`. No hooks, no timers,
  no `localStorage` fixtures — those are Tasks 48–50.

**Nine commits, one dispatch.** Same edit, nine times; one
review surface, nine commits so the history stays
one-concern.

**`http-*` carries Ruling R4's exception.**
`http-static-directory-index.test.ts` keeps its `node:http`
request — Task 51 owns that file's builtins. The codemod
still converts its `test(` and assertions.

- [ ] **Step 1: For each family, in this order**

`backend-*` (5), `mock-*` (13), `derive-*` (13),
`drift-*` (16), `http-*` (17), `presenter-*` (24),
`flow-*` (26), `adapters-*` (50), `api-*` (109) — smallest
first, so a codemod defect surfaces on a small diff.

```bash
deno run --allow-read --allow-write \
    "$WORKSPACE/codemod.ts" tests/<family>-*.test.ts
# hand-rewrite the regex sites the codemod listed
deno check --frozen tests
deno test --frozen --no-check --allow-env --allow-read \
    --allow-write --allow-net --allow-run \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    tests/<family>-*.test.ts 2>&1 | tail -5
```

Expected per family: `deno check` clean, and the family's
pass count **identical** to what it was before the
conversion. Record both numbers per family in the report.

- [ ] **Step 2: Commit each family**

```bash
git add tests/<family>-*.test.ts
git commit -m "$(cat <<'MSG'
Convert the <family> tests to Deno.test

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

- [ ] **Step 3: Run the whole suite after the last family**

```bash
./test
./validate
```

Expected: the oracle, unchanged.

---

### Task 47: Convert the 111 unprefixed files and `tests/tz/`

**Files:**
- Modify: every `tests/*.test.ts` not matched by a family
  prefix (111), and `tests/tz/*.test.ts` (2)

**Interfaces:**
- Consumes: Task 45's codemod.
- Produces: every file under `tests/` on `Deno.test` except
  the specials Tasks 48–51 own.

**Exclude these from the codemod run** — they have their own
tasks and converting them here would collide:

- `tests/debouncer.test.ts` (Task 49, timers)
- `tests/pg-*.test.ts` and `tests/schema-lifecycle.test.ts`
  (Task 48, hooks — already converted as the `pg-*` family
  only for their `test(` calls, not their hooks)
- the 33 `localStorage` stubbers (Task 50)
- the 27 Node-builtin users (Task 51)

A file may be in more than one of those lists. **Convert its
`test(` and assertions here; leave its special surface for
its own task.** Say in the report which files you left
partially converted, so the later task expects them.

- [ ] **Step 1: Build the file list**

```bash
ls tests/*.test.ts | grep -vE \
    '/(api|adapters|flow|presenter|http|drift|mock|derive|validators|pg|backend)-' \
    > "$TMPDIR/unprefixed.txt"
wc -l "$TMPDIR/unprefixed.txt"
```

Expected: 111.

- [ ] **Step 2: Convert in three batches of about 37**

A 111-file diff is not a review surface. Three commits,
each green:

```bash
deno run --allow-read --allow-write \
    "$WORKSPACE/codemod.ts" $(sed -n '1,37p' "$TMPDIR/unprefixed.txt")
deno check --frozen tests
./test
```

Then commit with subject
`Convert the first unprefixed tests to Deno.test`, and the
same for the second and third batches.

- [ ] **Step 3: Convert `tests/tz/`**

```bash
deno run --allow-read --allow-write \
    "$WORKSPACE/codemod.ts" tests/tz/*.test.ts
./test
```

Expected: `8 passed | 0 failed` under Honolulu. Commit with
subject `Convert the timezone tests to Deno.test`.

- [ ] **Step 4: Verify**

```bash
grep -rln "node:test\|node:assert" tests/*.test.ts tests/tz/ \
    | sort > "$TMPDIR/remaining.txt"
cat "$TMPDIR/remaining.txt"
./test
./validate
```

Expected: only the files Tasks 48–51 own remain, and the
oracle holds. Put that list in the report.

---

### Task 48: Move the seven hook files to `@std/testing/bdd`

**Files:**
- Modify: `tests/pg-acceptance.test.ts`,
  `tests/pg-races.test.ts`, `tests/pg-explain.test.ts`,
  `tests/pg-seed.test.ts`,
  `tests/pg-identifier-order.test.ts`,
  `tests/schema-lifecycle.test.ts`
- Modify: `deno.json` (add `@std/testing`)

**Interfaces:**
- Consumes: Task 46's `pg-*` conversion.
- Produces: six files using `describe`/`beforeAll`/
  `afterAll`. `tests/browser/fixtures.ts`'s `useBrowser()`
  is the seventh and belongs to Task 52.

`node:test`'s `before`/`after` have no `Deno.test`
equivalent. Two shapes are available, and the spec says
**decide per file by what the fixture needs**:

- **`describe` + `beforeAll`/`afterAll`** when the setup is
  shared across many independent tests. This is the shape
  for all six here: each opens one Postgres connection and
  a schema for the whole file.
- **One `Deno.test` with steps** when the tests are
  genuinely sequential and share mutable state.

- [ ] **Step 1: Add `@std/testing` to the import map**

```json
        "@std/testing": "jsr:@std/testing@1.0.20"
```

Use the version `deno install` resolves. Commit
`deno.json` and `deno.lock` first, subject
`Add jsr:@std/testing to the import map`.

- [ ] **Step 2: Convert one file and prove it (operator)**

Start with `tests/pg-explain.test.ts` — read it first and
pick the smaller of the six if that is not it.

```ts
import {
    describe, it, beforeAll, afterAll,
} from '@std/testing/bdd';

describe('pg explain', () => {
    let sql: SqlClient;
    beforeAll(async () => { /* the existing before body */ });
    afterAll(async () => { /* the existing after body */ });
    it('…', async () => { /* the existing test body */ });
});
```

Every `Deno.test('…')` in the file becomes `it('…')` inside
the `describe`. **The test names do not change** — they are
what `./test-postgres`'s output is read by.

```bash
docker compose up --wait postgres
POSTGRES_URL='…' SCHEMA_NAME="fusion_test_$$" \
    deno test --frozen --no-check --allow-env --allow-read \
    --allow-net --allow-run tests/pg-explain.test.ts
```

Needs the operator. Expected: the same count as before.

- [ ] **Step 3: Convert the remaining five the same way**

One commit per file — six files, six commits, one dispatch.
Subject: `Move the pg explain hooks to @std/testing`, and so
on per file.

- [ ] **Step 4: Verify (operator)**

```bash
./test-postgres
./validate
```

Expected: seven files pass — the six converted plus
`pg-boot.test.ts`, which has no hooks.

---

### Task 49: Move `debouncer.test.ts` to `FakeTime`

**Files:**
- Modify: `tests/debouncer.test.ts` (the six timer tests)

**Interfaces:**
- Consumes: `@std/testing` from Task 48.
- Produces: `debouncer.test.ts` with no `t.mock.timers`.
  Task 8's `t.after(() => { t.mock.timers.reset(); })`
  lines are deleted with the mechanism they guarded.

- [ ] **Step 1: Convert one test and run it**

```ts
import { FakeTime } from '@std/testing/time';

Deno.test('debounces within the window', () => {
    using time = new FakeTime();
    // the existing body, with:
    //   t.mock.timers.enable({ apis: ['setTimeout'] })  → gone
    //   t.mock.timers.tick(799)  → time.tick(799)
    //   t.after(… reset …)       → gone
});
```

`using` calls `restore()` at scope exit — including on a
throw — which is what makes the six tests independent. If
the file's TypeScript target rejects `using`, declare
`const time = new FakeTime();` and `try { … } finally {
time.restore(); }`. **The restore is not optional**: Task 54
turns the sanitizers on, and a leaked fake clock fails the
next test in the same isolate.

```bash
deno test --frozen --no-check --allow-env --allow-read \
    --allow-write --allow-net --allow-run \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    tests/debouncer.test.ts 2>&1 | tail -10
```

- [ ] **Step 2: Convert the remaining five**

The `tick` values — 799, 1, 800, 800, 800, 800, 800 — are
the covenant of the 800 ms window. **Copy them exactly.** A
changed tick is a changed test.

- [ ] **Step 3: Prove the file is independent of order**

```bash
deno test --frozen --no-check --allow-env --allow-read \
    --allow-write --allow-net --allow-run \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --shuffle tests/debouncer.test.ts 2>&1 | tail -6
```

Expected: all six pass in any order. Each test is an
isolated world; a test that leans on another lies about
what it proves.

- [ ] **Step 4: Verify and commit**

```bash
./test
./validate
```

```bash
git add tests/debouncer.test.ts
git commit -m "$(cat <<'MSG'
Move the debouncer tests to FakeTime

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 50: Replace the `localStorage` stubs with fixtures

**Files:**
- Create: `tests/fixtures/local-storage.ts`
- Create: `tests/fixtures/console-capture.ts` (or move the
  existing `tests/console-capture.ts` pattern under
  `tests/fixtures/`)
- Modify: the 33 files that stub `localStorage` (30 at
  module level)

**Interfaces:**
- Consumes: `tests/local-storage-stub.ts` (Task 7), which
  **stays** as the baseline preload.
- Produces:

  ```ts
  export function withLocalStorage<T>(
      fake: Partial<Storage>,
      body: () => T,
  ): T;
  export async function withLocalStorageAsync<T>(
      fake: Partial<Storage>,
      body: () => Promise<T>,
  ): Promise<T>;
  ```

  Each installs the fake, runs the body, and restores the
  previous value in a `finally`.

A module-level stub is shared mutable state across every
test in the worker's isolate. Under `deno test` there is no
process boundary to clean it up, so the stub leaks from file
to file. The fixture is what closes that.

- [ ] **Step 1: Write the fixture and its test**

```ts
// tests/fixtures/local-storage.ts
export function withLocalStorage<T>(
    fake: Partial<Storage>,
    body: () => T,
): T {
    const previous = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
        value: fake,
        writable: true,
        configurable: true,
    });
    try {
        return body();
    } finally {
        Object.defineProperty(globalThis, 'localStorage', {
            value: previous,
            writable: true,
            configurable: true,
        });
    }
}
```

Write the async sibling the same way. Write a test that
proves the restore happens **even when the body throws** —
that is the whole point of the fixture, and an untested
`finally` is a `finally` nobody has run.

- [ ] **Step 2: Convert in four batches**

Thirty-three files is not a review surface. Four commits of
eight or nine, each green:

```bash
deno check --frozen tests
./test
```

Each module-level `globalThis.localStorage = { … }` becomes
a per-test `withLocalStorage({ … }, () => { … })` around the
body that needed it. **Do not leave the module-level
assignment beside the fixture call** — two mechanisms for
one job is the state without an owner the sixth commandment
names.

- [ ] **Step 3: Prove order-independence**

```bash
deno test --frozen --no-check --allow-env --allow-read \
    --allow-write --allow-net --allow-run \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --shuffle tests/*.test.ts 2>&1 | tail -6
```

Expected: the oracle, in any order. **This is the
divergence Part 1 named** — module-level state persisting
across files within a worker — and this is the task that
closes it. Run it three times.

- [ ] **Step 4: Verify**

```bash
grep -rn 'globalThis.localStorage =' tests/
./test
./validate
```

Expected: no output from the grep; the oracle holds.

---

### Task 51: Take Node builtins out of the 27 test files

**Files:**
- Modify: the 27 files importing `node:fs`, `node:path`,
  `node:os`, `node:http`, `node:url`, `node:crypto`,
  `node:buffer`, or `node:child_process`

**Interfaces:**
- Consumes: Task 30's PROBE 11 verdict; `@std/path` from
  Task 37.
- Produces: `tests/` with at most one `node:` import — and
  the report names it.

- [ ] **Step 1: Build the list**

```bash
grep -rln "from 'node:" tests/*.test.ts tests/tz/*.test.ts \
    | sort > "$TMPDIR/builtins.txt"
wc -l "$TMPDIR/builtins.txt"
grep -rn "from 'node:" tests/*.test.ts | sed "s/.*from '//;s/'.*//" \
    | sort | uniq -c | sort -rn
```

Expected: 27 files. Record the per-module histogram.

- [ ] **Step 2: Apply the mapping**

| From | To |
|---|---|
| `node:fs`, `node:os` | **§ The Node-to-Deno mapping** — `tmpdir()` becomes `Deno.makeTempDirSync()` |
| `node:path` | `@std/path` |
| `node:url` | `fromFileUrl`/`toFileUrl` from `@std/path` |
| `node:crypto`'s `createHash('sha256')` in `design-system-render.test.ts` | `sha256Hex` from `shared/digest.ts` |
| `node:buffer` in `backend-postgres.test.ts` | `Uint8Array` |
| `spawnSync` in `serve-cli.test.ts`, `crank-cli.test.ts`, `server-zip-metafile.test.ts` | `new Deno.Command(cmd, { args }).outputSync()` |
| `process.env` in `browser-origin.test.ts` | `Deno.env.get` |
| `node:http.request` in `http-static-directory-index.test.ts` | **PROBE 11 decides** |

`shared/digest.ts`'s `sha256Hex` already exists and is the
product's own hasher — using it in the test also means the
test and the product agree on the digest.

- [ ] **Step 3: Resolve the `sec-fetch-mode` file**

- **PROBE 11 = FETCH CAN SET IT** → convert
  `http-static-directory-index.test.ts` to `fetch`, and
  assert the same statuses and headers it asserts today.
- **PROBE 11 = FORBIDDEN** → the file **keeps
  `node:http`**, and its header comment says why: `Sec-*`
  is a forbidden request header name, so `fetch` cannot set
  `sec-fetch-mode`, and the navigation path needs it. Name
  the file in the report as the one survivor. Ruling R4
  becomes permanent, with the measurement as its reason.

- [ ] **Step 4: Convert in three batches**

Nine files a commit, each green:

```bash
deno check --frozen tests
./test
./validate
```

- [ ] **Step 5: Verify**

```bash
grep -rln "from 'node:" tests/*.test.ts tests/tz/*.test.ts
```

Expected: at most
`tests/http-static-directory-index.test.ts`, and only under
PROBE 11 = FORBIDDEN.

---

### Task 52: Convert the browser suite

**Files:**
- Modify: `tests/browser/*.test.ts` (10 files)
- Modify: `tests/browser/fixtures.ts` (`useBrowser()`,
  `withAdminPage`)

**Interfaces:**
- Consumes: Tasks 45–51; Task 21's per-test bound.
- Produces: the ten browser files on `Deno.test`,
  sanitizer-clean.

**This suite holds real resources**: one Chrome per file
through `useBrowser()`, one browser context per test
through `withAdminPage`, an in-process `listenHttp` per
test, a CDP socket throughout. Task 54 turns the sanitizers
on, and they will see every one of them.

- [ ] **Step 1: Convert `fixtures.ts`'s hooks**

`useBrowser()`'s `before`/`after` become
`beforeAll`/`afterAll` from `@std/testing/bdd`, which means
each browser test file becomes a `describe`. Convert one
file first and run it (operator) before doing the rest.

- [ ] **Step 2: Prove every resource closes**

`useBrowser()`'s teardown closes Chrome and the CDP socket;
`withAdminPage`'s nested `finally` closes the context and
the origin. Read both and confirm each acquisition has a
matching release **in a `finally`**, not on the happy path.
Where one does not, that is the leak — fix it here, before
Task 54 makes it a failure.

- [ ] **Step 3: Convert the ten files**

One commit per file is ten commits for a mechanical
conversion; **two commits of five** is the right surface
here — the files are the same shape and the fixture is what
carries the risk.

- [ ] **Step 4: Verify (operator)**

```bash
./test-browser
```

Expected: ten files green. Then prove the bound still bites,
as in Task 21 Step 3.

---

### Task 53: Turn the seven skips into `ignore`

**Files:**
- Modify: the seven Postgres-gated tests

**Interfaces:**
- Consumes: Tasks 45–47.
- Produces: the summary still reading `7 ignored`.

- [ ] **Step 1: Find them**

```bash
grep -rn 'skip\|SKIP' tests/*.test.ts | grep -i postgres
grep -rn '{ *skip' tests/*.test.ts
```

Seven tests skip when `POSTGRES_URL` is unset. Read what
each one's condition actually is before rewriting it.

- [ ] **Step 2: Convert each**

```ts
Deno.test({
    name: 'the existing name, unchanged',
    ignore: Deno.env.get('POSTGRES_URL') === undefined,
    fn: async () => { /* the existing body */ },
});
```

The **name does not change** — it is what the summary and
TEST-PLAN read.

- [ ] **Step 3: Verify both ways**

```bash
./test 2>&1 | grep -E 'ignored'
POSTGRES_URL='postgres://fusion:PW@127.0.0.1/fusion' \
    ./test 2>&1 | grep -E 'ignored|passed'
```

Expected: `7 ignored` without the variable; 7 fewer ignored
and 7 more passed with it (operator, needs Postgres up).
A skip that ignores unconditionally is a test that cannot
fail — prove the condition works both ways.

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "$(cat <<'MSG'
Gate the Postgres tests with ignore

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 54: Turn the sanitizers on

**Files:**
- Modify: `test` (drop the sanitizer defaults if any were
  disabled), `test-postgres`, `test-browser`
- Modify: whichever test files leak

**Interfaces:**
- Consumes: Tasks 45–53.
- Produces: the suite running with the resource and op
  sanitizers on. This is Part 5's real deliverable —
  everything before it was vocabulary.

`deno test` enables `sanitizeResources` and `sanitizeOps`
by default. If any earlier task disabled them to get a
family green, this task is where that debt is paid.

- [ ] **Step 1: Find every suppression**

```bash
grep -rn 'sanitizeResources\|sanitizeOps\|sanitizeExit' tests/
```

Expected at this point: **none**. Every hit is a leak
somebody hid. List them all.

- [ ] **Step 2: Fix the leak, never the sanitizer**

For each: find the resource that is not closed — a listener,
a file handle, a timer, a fetch body, a Postgres connection
— and close it in a `finally`. **The fix is the leak.**
`sanitizeResources: false` is permitted only with a named
reason in a comment beside it saying what leaks and why it
cannot be closed, and the reason must survive a reviewer
reading it.

- [ ] **Step 3: Run everything with them on**

```bash
./test
./test 2>&1 | grep -iE 'leak|sanitiz'
```

Then, operator: `./test-postgres` and `./test-browser`.

Expected: the oracle, no sanitizer diagnostics anywhere.

- [ ] **Step 4: Record the wall time**

```bash
{ time ./test > /dev/null 2>&1 ; } 2>&1 | grep real
```

Compare against Part 1's Deno figure and Node's 17.2 s
baseline. Task 55 documents all three.

- [ ] **Step 5: Commit**

```bash
git add tests/ test test-postgres test-browser
git commit -m "$(cat <<'MSG'
Run the suite with the sanitizers on

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 55: Document the test idiom

**Files:**
- Modify: `AGENTS.md` (§ Gates; § Where things live)
- Modify: `TEST-PLAN.md` (AT2's command and PASS wording;
  AT5)

**Interfaces:**
- Consumes: Task 54's wall time.
- Produces: the documented state of Part 5.

- [ ] **Step 1: Write the changes**

- **AGENTS.md § Gates:** the suite is `Deno.test` with
  `@std/assert`, the sanitizers on, two preloads, and the
  two TZ passes. Record the wall time beside Node's 17.2 s
  and Part 1's compat figure — three numbers, all measured.
- **AGENTS.md § Where things live:** `tests/` gains
  `tests/fixtures/`; say what it holds.
- **TEST-PLAN.md AT2:** the command and the PASS wording.
- **TEST-PLAN.md AT5:** the browser suite under
  `Deno.test`, sanitizers on.

- [ ] **Step 2: Verify and commit**

```bash
wc -l AGENTS.md
./validate
```

```bash
git add AGENTS.md TEST-PLAN.md
git commit -m "$(cat <<'MSG'
Document the Deno test idiom

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

## Part 5 exit gate

```bash
./validate                                   # exit 0
grep -rln "node:test\|node:assert" tests/    # no output
grep -rn 'sanitizeResources\|sanitizeOps' tests/  # none, or
                                             # each with a
                                             # named reason
./test 2>&1 | tail -3                        # the oracle
```

Operator, with `!`:

- `./test-postgres` — seven files pass.
- `./test-all` — ten browser files green under `Deno.test`,
  sanitizers on.
- Three `./test --shuffle` runs with identical counts.

---

# Part 6 — Postgres driver (optional)

**Spec:** `docs/superpowers/specs/2026-08-21-deno-postgres-driver-design.md`

`jsr:@db/postgres` replaces `npm:postgres@3.4.9` behind
`api/postgres-client.ts`. The last `npm:` specifier and the
last `node:net`/`node:tls` compat leave the product process.
Nothing above `SqlClient` notices.

**Ruling R8 applies.** The spec marks this part optional and
says "the measurements after Spec 5 decide". Task 56 is that
decision, with its criteria written down. **If Task 56 says
no, this plan ends there** and Part 6's spec stays an
outline — that is a complete outcome, not a failure.

---

### Task 56: The go/no-go gate

**Files:** none. This task commits nothing except a ledger
entry.

**Interfaces:**
- Consumes: Part 5's exit gate.
- Produces: a recorded GO or NO-GO with the evidence for it.

The controller runs this task itself rather than dispatching
it: it is a judgment over the whole branch, and the criteria
below are the whole of it.

- [ ] **Step 1: Gather the four measurements**

```bash
grep -rn 'npm:' deno.json deno.lock | head
grep -rn 'node:net\|node:tls' deno.lock | head
./measure --check
./measure --profile
```

Record: (a) how many `npm:` specifiers remain — it should
be exactly one, `postgres`; (b) whether `./measure --check`
passes against the committed budgets; (c) the current phase
mix.

- [ ] **Step 2: Answer the five questions, in writing**

1. **Is `npm:postgres` the last `npm:` specifier?** If
   something else still needs npm compat, removing this one
   buys none of the stated goal. → NO-GO until that lands.
2. **Is `@db/postgres` still pre-1.0?** The driver was
   pre-1.0 when the spec was written, and postgres.js is
   mature and already fully insulated behind `SqlClient`.
   A pre-1.0 driver under the product's only datastore is a
   bet on someone else's trajectory. → Weight heavily
   toward NO-GO.
3. **Does anything above `SqlClient` reach the driver?**
   Grep for it. If the insulation is real, the cost of
   *keeping* postgres.js is one `npm:` specifier and
   nothing else. → That is a small cost.
4. **Do `./measure`'s budgets have headroom?** Prepared
   statements and pipelining differ between drivers.
   Without headroom, a latency regression fails `--check`
   and the work unwinds. → NO-GO without headroom.
5. **Is `jsr.io` reachable for a real evaluation?** It is
   not reachable from the Claude sandbox; every probe of
   `@db/postgres` runs outside it, on the operator's
   machine. → If the operator cannot run Task 57, NO-GO.

- [ ] **Step 3: Record the decision**

Write into the ledger:

```
Task 56: Ruling: Part 6 <GO|NO-GO> — <the deciding
question and its answer> — cost if wrong: <one line>
```

**NO-GO:** stop here. Report the plan complete through
Part 5, name Part 6 as consciously not taken and why, and
leave `## Later work` in TODO.md holding the option with
this ruling as its reason.

**GO:** continue to Task 57.

---

### Task 57: Probe `@db/postgres` (operator, outside the sandbox)

**Files:** none. This task commits nothing.

**Interfaces:**
- Consumes: Task 56's GO.
- Produces: five verdicts Tasks 58–61 consume.

**`jsr.io` is unreachable from the Claude sandbox.** Every
step here runs on the operator's machine with `!`.

- [ ] **Step 1: Pin a version and check the API shape**

```bash
deno add jsr:@db/postgres
deno doc jsr:@db/postgres 2>&1 | head -60
```

Record the exact version and whether these exist: `Pool`,
`Pool.connect()`, `queryObject<T>` as a tagged template,
`queryArray(text)`, `createTransaction(name, options)` with
`begin`/`commit`/`rollback`/`savepoint`, and `pool.end()`.

- [ ] **Step 2: PROBE 15 — startup options and the statement timeout**

`connectPostgres` sets `statement_timeout` as a **connection
parameter** today. Determine whether the driver passes
startup options.

- **It does** → Task 58 sets it there.
- **It does not** → Task 58 issues `SET statement_timeout`
  on acquire. Note that this is per-connection state that
  must be reapplied when the pool hands out a recycled
  connection — a per-acquire `SET`, not a per-pool one.

- [ ] **Step 3: PROBE 16 — muting notices**

postgres.js takes `onnotice: () => {}`. Find the
equivalent. If there is none, record what the driver does
with notices and where they land — the JSON log line is
this product's only machine-readable output and an
unstructured notice in it is a corruption.

- [ ] **Step 4: PROBE 17 — the error shape**

```sql
-- provoke a unique violation and a undefined_table
```

Record the thrown value's shape: `PostgresError`, its
`fields.code`, and how `mapPostgresError` and
`isUndefinedTable` in `api/errors-postgres.ts` would read
it.

- [ ] **Step 5: PROBE 18 — BYTEA and savepoints**

Round-trip a BYTEA value and record whether it arrives as
`Uint8Array` (postgres.js gives a `Buffer`, which
`latin1OfBytea` duck-types). Then open a transaction,
open a nested one, and confirm the nested one is a
**savepoint** and not a second transaction —
`pg-races.test.ts` is that covenant.

- [ ] **Step 6: PROBE 19 — the environment allowlist**

Compile a probe with `--allow-env` scoped to nothing and
add names one at a time until it boots. Record the final
list. postgres.js reads 22 `PG*` names; the point of this
part is that the new list is shorter, and an unmeasured
claim of "shorter" is worth nothing.

**No commit.** Report all five verdicts.

---

### Task 58: Absorb the driver behind `SqlClient`

**Files:**
- Modify: `api/postgres-client.ts` (all 105 lines)
- Modify: `deno.json`, `deno.lock`

**Interfaces:**
- Consumes: Task 57's PROBEs 15, 16, 18.
- Produces: `SqlClient` — `query`, `begin`, `unsafe`,
  `end` — **unchanged in signature**. `connectPostgres(url,
  { statementTimeoutMs, acquireTimeoutMs })` unchanged.
  Nothing above this file changes.

Two consumers move with the adapter without being edited,
because they reach the driver only through
`connectPostgres`: `server/postgres-wipe.ts` (the compiled
`wipe` verb, which runs `POSTGRES_DROP_SCHEMA` through
`unsafe`) and the seven `./test-postgres` files. **Confirm
that** in Step 1's grep rather than assuming it — if either
names the driver directly, the insulation was never real.

This file is the adapter, and this task is what an adapter
is for. If any file outside it needs a change, the
insulation was not real — report that, loudly, because it
is a finding about the architecture, not about the driver.

- [ ] **Step 1: Prove the insulation first**

```bash
grep -rn "from 'postgres'\|npm:postgres" \
    api/ server/ shared/ web-app/ tests/
```

Expected: `api/postgres-client.ts` only. Anything else is a
site that must be routed through the adapter **before** the
driver changes.

- [ ] **Step 2: Swap the import map entry**

```json
        "@db/postgres": "jsr:@db/postgres@<the pinned version>"
```

and remove `"postgres": "npm:postgres@3.4.9"`. Then
`deno install`.

- [ ] **Step 3: Rewrite the wrapper**

| `SqlClient` method | New implementation |
|---|---|
| `query` | `queryObject<T>` with the tagged template |
| `begin` | `createTransaction(name, { isolation_level })`, then `begin`/`commit`/`rollback`; a **nested** `begin` becomes `savepoint` |
| `unsafe` | `queryArray(text)` |
| `end` | `pool.end()` |

`connectPostgres` builds `Pool(config, POOL_MAX, true)`.
`POOL_MAX` comes from `api/advisory-lock.ts` and does not
move. The acquire timeout becomes a race around
`pool.connect()`; the statement timeout goes where PROBE 15
said.

The transaction-name argument `createTransaction` requires
has no counterpart in postgres.js. Generate it
deterministically and document the scheme in a comment —
two concurrent transactions with the same name is a fault
the driver will report at the worst moment.

- [ ] **Step 4: Verify (operator)**

```bash
./test                 # backend-postgres.test.ts fakes
                       # SqlClient and is driver-free
./test-postgres        # the seven live files
./validate
```

Expected: all green. `pg-races.test.ts` is the savepoint
covenant and `pg-acceptance.test.ts` the transaction one —
read their failures carefully if they come, because
"transaction and savepoint semantics differ in detail" is
this part's named risk.

- [ ] **Step 5: Commit**

```bash
git add api/postgres-client.ts deno.json deno.lock
git commit -m "$(cat <<'MSG'
Absorb the @db/postgres driver

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 59: Map the new driver's errors

**Files:**
- Modify: `api/errors-postgres.ts` (139 lines)
- Modify: `tests/errors-postgres.test.ts`

**Interfaces:**
- Consumes: Task 57's PROBE 17.
- Produces: `mapPostgresError` and `isUndefinedTable`
  reading the new shape. **Both predicates' contracts are
  unchanged** — the SQLSTATE codes they map are the
  covenant.

- [ ] **Step 1: Write the failing test first**

`errors-postgres.test.ts` pins the mapping against the old
driver's error shape. **Add the new shape beside the old**,
per the spec — do not replace it until the old driver is
gone, and it is gone as of Task 58, so the old cases become
the regression net for one commit and then leave in the
same task.

Write a case per SQLSTATE the file maps today. Read them
out of `api/errors-postgres.ts` rather than guessing:

```bash
grep -n "'[0-9A-Z]\{5\}'" api/errors-postgres.ts
```

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Read the code from `fields.code`**

The old shape and the new one differ in where the SQLSTATE
lives. Change **only** the extraction; the mapping from
code to predicate is the covenant and does not move.

- [ ] **Step 4: Verify and commit (operator for `./test-postgres`)**

```bash
./test
./test-postgres
./validate
```

```bash
git add api/errors-postgres.ts tests/errors-postgres.test.ts
git commit -m "$(cat <<'MSG'
Map the new driver's error shape

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 60: Take `Buffer` out of `latin1OfBytea`

**Files:**
- Modify: `api/backend-postgres.ts` (`latin1OfBytea` and
  the `Octets` type)
- Modify: `tests/backend-postgres.test.ts`

**Interfaces:**
- Consumes: Task 57's PROBE 18.
- Produces: `latin1OfBytea` accepting `Uint8Array` only.

**Precondition: PROBE 18 said BYTEA arrives as
`Uint8Array`.** If it said otherwise, this task does not
run — report it; the duck-typing branch stays and Task 62
documents why.

- [ ] **Step 1: Write the failing test**

Assert `latin1OfBytea` on a `Uint8Array` and assert the
`Buffer` branch is gone — read the existing test first and
extend it rather than replacing it.

- [ ] **Step 2: Delete the branch**

The `Buffer` duck-typing branch goes. `Octets` narrows to
`Uint8Array`. Every caller already passes what the driver
returns.

- [ ] **Step 3: Verify and commit (operator)**

```bash
./test
./test-postgres
./validate
```

```bash
git add api/backend-postgres.ts tests/backend-postgres.test.ts
git commit -m "$(cat <<'MSG'
Read BYTEA as Uint8Array only

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 61: Shrink the environment allowlist

**Files:**
- Modify: `build` (the `--allow-env` list on
  `deno compile`)

**Interfaces:**
- Consumes: Task 57's PROBE 19.
- Produces: a compiled binary whose `--allow-env` names
  only what it reads.

postgres.js read 22 `PG*` names. This task is where the
smaller list is **proved**, not asserted.

- [ ] **Step 1: Compile with the measured list**

Set `--allow-env` to PROBE 19's list plus the four the
product itself reads (`POSTGRES_URL`,
`JWT_HMAC_SIGNING_KEY`, `HTTP_SERVER_PORT`,
`TRUSTED_PROXY_HOPS`).

- [ ] **Step 2: Boot it and drive it (operator)**

```bash
D=$(mktemp -d "${TMPDIR:-/tmp}/b61.XXXXXX")
./build --no-zip "$D/"
(cd "$D" && POSTGRES_URL="$POSTGRES_URL" \
    JWT_HMAC_SIGNING_KEY=k HTTP_SERVER_PORT=8094 \
    ./fusion-angle serve) &
sleep 2
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8094/
curl -s -o /dev/null -w '%{http_code}\n' \
    http://127.0.0.1:8094/api/status
kill %1; rm -rf "$D"
```

Expected: no `NotCapable` in the log and both requests
succeed. **Exercise a write path too** — a read-only smoke
does not open every connection the pool will open. Run
`./measure --runs 1 --pages organization` against it.

- [ ] **Step 3: Record the before and after**

Write both lists into the report — 22 names against the
new count. The claim of this part is that the list shrinks;
the report is where it is shown.

- [ ] **Step 4: Commit**

```bash
git add build
git commit -m "$(cat <<'MSG'
Shrink the binary's environment allowlist

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

### Task 62: Document the driver change

**Files:**
- Modify: `ARCHITECTURE.md`, `SCHEMA.md`, `README.md`,
  `AGENTS.md` — wherever postgres.js is named

**Interfaces:**
- Consumes: Tasks 58–61.
- Produces: the documented state of Part 6.

- [ ] **Step 1: Find every mention**

```bash
grep -rn 'postgres\.js\|postgres@3\|npm:' *.md deno.json
```

- [ ] **Step 2: Write the changes**

Name the driver, its pinned version, and the environment
list. Record `./measure`'s phase mix against the last
postgres.js record — the spec says `./measure` is the
arbiter of the latency question, so the number belongs in
the document, not in a commit message.

If PROBE 18 kept the `Buffer` branch alive, say so and say
why.

- [ ] **Step 3: Verify and commit**

```bash
wc -l AGENTS.md README.md ARCHITECTURE.md SCHEMA.md
./validate
```

```bash
git add ARCHITECTURE.md SCHEMA.md README.md AGENTS.md
git commit -m "$(cat <<'MSG'
Document the @db/postgres driver

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

## Part 6 exit gate

```bash
./validate                          # exit 0
grep -rn 'npm:' deno.json deno.lock # no output
```

Operator, with `!`:

- `./test-postgres` — the acceptance, races, boot, seed,
  explain, identifier-order, and schema-lifecycle suites.
- `./measure` full ceremony, and `--check` against the
  committed budgets; the phase mix compared with the last
  postgres.js record.
- The compose smoke and the binary's boot gates under the
  shrunken allowlist.

---

# Part 7 — Close

### Task 63: Close TODO.md item 13

**Files:**
- Modify: `TODO.md` (`## Critical path` intro and item 13;
  `## Sequencing`)

**Interfaces:**
- Consumes: the exit gate of the last part that ran —
  Part 6 under a GO, Part 5 under a NO-GO.
- Produces: TODO.md with the migration removed or reduced
  to what did not ship.

TODO.md's `## Close protocol` says an item leaves the file
by shipping. This is that step, and it is a task rather
than an afterthought because a backlog that keeps shipped
work is a backlog nobody trusts.

- [ ] **Step 1: Decide what leaves**

- **Part 6 ran (GO):** the whole of item 13 leaves.
  `Thirteen items` returns to `Twelve items`, and both
  `## Sequencing` lines about the Deno specs go.
- **Part 6 did not run (NO-GO):** item 13 leaves the
  critical path, and a single `## Later work` bullet takes
  its place naming Spec 6 alone, with Task 56's ruling as
  its reason and its oracle. The `## Sequencing` line about
  items 1–12 goes; keep nothing that refers to a Deno spec
  that shipped.

- [ ] **Step 2: Make the edits**

Whichever branch, `## Critical path`'s intro count must
match the number of items beneath it, and the
`## Sequencing` references to items 3, 5, 6, 8, and 10 must
still resolve — Ruling R9 avoided a renumber precisely so
this step is a deletion and nothing more.

- [ ] **Step 3: Verify the single-home gate**

```bash
grep -c '^## Critical path' TODO.md
grep -n 'Deno' TODO.md
sed -n '6,9p' TODO.md
./validate
```

Expected: `1`; the surviving Deno lines are only those the
chosen branch keeps; the intro's count matches the items;
`./validate` exits 0.

- [ ] **Step 4: Commit**

```bash
git add TODO.md
git commit -m "$(cat <<'MSG'
Close the Deno migration on the critical path

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hvb8sEcpCFeXwxRnVwpR88
MSG
)"
```

---

# Execution notes

## Task inventory

| Part | Tasks | Commits | Gate |
|---|---|--:|---|
| 1 Toolchain | 1–15 | 13–14 | `./validate` with Node called nowhere |
| 2 Build and artifact | 16–29 | 12–13 | one executable; no `package.json` |
| 3 Server idiom | 30–35 | 5 | `node:` only in `scrypt-hash.ts` |
| 4 Tooling idiom | 36–44 | 9–10 | no `node` in any root script |
| 5 Test idiom | 45–55 | ~25 | sanitizers on, oracle held |
| 6 Postgres driver | 56–62 | 0 or 5 | no `npm:` specifier |
| 7 Close | 63 | 1 | TODO.md item 13 closed |

Tasks 1, 16, 30, 36, 56, and 57 commit nothing — they are
measurement tasks whose deliverable is a recorded verdict.
**Do not skip them because they produce no diff.** Every
task that consumes one names it, and a task that reads
"not measured" must report BLOCKED rather than assume.

## The probe ledger

Nineteen probes, each consumed by a named task. The
controller carries every verdict forward in the ledger:

| Probe | Question | Consumed by |
|---|---|---|
| A | `deno check` diagnostics | 4, 5, 6 |
| B | `erasableSyntaxOnly` honored? | 15 |
| C | the browser fence | 13, 15 |
| D | the suite, cold under Deno | 7, 8 |
| 1 | `git` in the Deno image | 26 |
| 2 | `node:fs` on the compiled FS | 17, 23 |
| 3 | the pool's permissions | 23 |
| 4 | `deno bundle --keep-names` parity | 19, 28 |
| 5 | binary start-up time | 29 |
| 6 | `deno test`'s per-test bound | 21 |
| 7 | ten browser pins on `deno bundle` | 21 |
| 8 | the throttle's address key | 31 |
| 9 | `Deno.open` on the compiled FS | 31 |
| 10 | the default 500 body | 31 |
| 11 | `sec-fetch-mode` through `fetch` | 35, 51 |
| 12 | detached child and group kill | 41 |
| 13 | does the parent outlive the child | 42 |
| 14 | free port and CPU count | 42 |
| 15–19 | the `@db/postgres` surface | 58, 59, 60, 61 |

## What stops execution

Per superpowers:subagent-driven-development, four things
stop the controller: an irreversible or destructive
operation; a security-sensitive action; a side effect
outside this checkout that norms say to ask about first;
and a plan so broken that every path forward is a guess.

In this plan, that means:

- **Ask before:** any `git push`; any Render API call
  (`./postgres-seed --postgres render`,
  `./postgres-wipe --postgres render`) — those touch a live
  deployment; deleting `node_modules/` is fine, deleting a
  database is not.
- **Report BLOCKED, do not guess:** PROBE 2 = NODE:FS
  BLIND, PROBE 4 = NAMES LOST, PROBE 7 with fewer than ten
  green, PROBE 9 failing, PROBE 12 = NO GROUP KILL. Each
  changes a part's shape, and the controller rules on it
  with the probe output in hand.
- **STOP on a moved oracle:** any task whose test counts
  differ from the oracle without a named cause. The counts
  are the covenant.

## The operator's steps

These cannot run in the Claude Code sandbox and are asked
of the operator with `!`:

- Installing Deno (Task 1).
- Anything running Chrome: `./test-browser`, `./test-all`,
  `./measure` with pages, `./crank` (Task 16 PROBE 7,
  Tasks 19, 20, 21, 41, 42, 52).
- Anything running Docker: the compose smoke,
  `./test-postgres` against the compose Postgres
  (Tasks 10, 16 PROBEs 1 and 3, 26, 33, 43, 48, 58–61).
- `jsr.io` reachability for `@db/postgres` (Task 57).
- `./crank` inside the sandbox, if attempted at all, needs
  `TMPDIR=/tmp/claude`.

## Order and swaps

Parts run 1 → 6. The spec's roadmap permits **Parts 3 and 4
to swap** after Part 2's measurements — they touch disjoint
files (`server/` against `web-app/app/` plus
`postgres-lib`) and neither consumes the other's output.
Nothing else in this plan may be reordered:

- Part 2 needs Part 1's `deno.json` and gates.
- Part 3 needs Part 2's compiled binary to serve from.
- Part 4 needs Part 2's binary for `./measure` to spawn.
- Part 5 needs Parts 3 and 4 so the test files it rewrites
  are not moving underneath it.
- Part 6 needs Part 5's measurements to decide at all.

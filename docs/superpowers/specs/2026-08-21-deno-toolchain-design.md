# Deno Toolchain — Design

Date: 2026-08-21
Status: draft (brainstorm 2026-08-21; approved in chat;
awaiting the user's review of this written spec). Spec
only; no implementation lives in this document.

This scroll is Spec 1 of
[the Deno migration roadmap](2026-08-21-deno-migration-roadmap-design.md).
The roadmap holds the goals, the evidence, and the
decisions every spec inherits; this scroll holds what
changes in this step and nothing that belongs to a later
one.

## The Goal

Run `./validate` with Node absent: type-checking, the
automated test suite, and the two generator gates move
to Deno 2.9.5, while `./build`, `./serve`, `./measure`,
and the seed keep Node for exactly one more spec.

The suite does not change its idiom. 371 files keep
`node:test` and `node:assert` and run through Deno's
compat layer; the test counts are the oracle —
3329 tests, 3324 passing, 5 skipped, the same numbers
Node reports today.

## Context

- `./validate` runs `npx --no-install tsc --noEmit -p
  web-app/app/tsconfig.json`, then `./test`, the
  line-length and vocabulary lints, then
  `./generate-schema-svg --check` and
  `./generate-api-documentation --check` — both
  `node --strip-types` wrappers.
- `./test` runs `node --strip-types --import
  ./tests/hmac-test-key.ts --test tests/*.test.ts` under
  `TZ=UTC`, then `tests/tz/*.test.ts` under
  `TZ=Pacific/Honolulu`. `./test-postgres` runs five
  `pg-*` files serially with `SCHEMA_NAME` set.
- `web-app/app/tsconfig.json` includes `web-app/**`,
  `api/**`, `shared/**` and excludes the five
  entrypoints. `server/` and `tests/` are not checked.
- Measured (roadmap § What Was Measured): under Deno
  with named permissions and a `localStorage` preload,
  the unchanged suite is 3320 pass, 5 fail, 5 ignored in
  9.7 s. The five failures are `debouncer.test.ts`'s
  mock timers. `deno check` over the new surface finds
  six errors outside `tests/` and one extensionless
  import family of 35 sites.
- `tests/server-zip-metafile.test.ts` imports `esbuild`
  to walk the client graph; that stays until Spec 2
  replaces it with `deno info`.
- `web-app/app/compose.ts` imports `fs` and `path` with
  no `node:` prefix — the only two such imports.

## The Decisions

1. **`deno.json` at the repository root** carries the
   import map, the compiler options, and
   `nodeModulesDir: "none"`. No tasks, no fmt, no lint.
2. **`deno.lock`** is committed, created once by
   `deno install`, and enforced by `--frozen` on every
   `deno` invocation in a root script.
3. **`deno check --frozen api shared server web-app`**
   is the type gate. `tests/` is not checked (Spec 5).
   `server/` and the five entrypoints are checked for
   the first time.
4. **`deno test --parallel --no-check`** runs the suite
   with two preloads and five named permissions —
   `--allow-env --allow-read --allow-write --allow-net
   --allow-run` — never `-A`. `--no-check` is explicit
   and commented: the tests are type-checked in Spec 5.
5. **`tests/local-storage-stub.ts`** is a preload that
   installs a writable in-memory `localStorage` through
   `Object.defineProperty`. The 25 stubbing test files
   are not edited.
6. **`debouncer.test.ts`** gains
   `t.after(() => { t.mock.timers.reset(); });` as the
   first statement of each of its six timer tests.
7. **Five source fixes cure the six type errors**, none
   a suppression: one in `server/boot.ts`, two in
   `measure.ts`/`measure-cli.ts`, the two `node:`
   prefixes in `compose.ts`, and the 35 import
   extensions (which also cure
   `invitations-indicator.ts:41`).
8. **The generators run under `deno run`** so that
   `./validate` calls Node nowhere. Their `--check`
   parity against the committed `SCHEMA.svg` and
   `web-app/api-documentation/` is the oracle.
9. **`tsc` leaves.** `web-app/app/tsconfig.json` is
   deleted; `typescript` leaves `devDependencies`.
   `package.json` stays for esbuild and postgres.js
   until Spec 2.
10. **The 78-column lint gains `deno.json`.**
    `deno.lock` is generated and exempt.

## Non-goals

- No change to `./build`, `./serve`, `./measure`,
  `./postgres-seed`, `./postgres-wipe`, `postgres-lib`,
  `Dockerfile`, `compose.yaml`, or Render.
- No test file changes beyond `debouncer.test.ts`.
- No port of `server/` or the entrypoints to `Deno.*`;
  `process` and `node:` imports stay where they are.
- No type-checking of `tests/`.
- No `jsr:` dependency.

## Files

Added: `deno.json`, `deno.lock`,
`tests/local-storage-stub.ts`.

Changed: `validate`, `test`, `test-postgres`,
`generate-schema-svg`, `generate-api-documentation`;
`server/boot.ts`, `web-app/app/measure.ts`,
`web-app/app/measure-cli.ts`, `web-app/app/compose.ts`;
`web-app/app/page-registry.ts`, `header-info.ts`,
`invitations-indicator.ts`, `sidebar-member.ts`,
`app-boot.ts`; `tests/debouncer.test.ts`;
`package.json`, `package-lock.json`; `CLAUDE.md`,
`README.md`, `TEST-PLAN.md`.

Removed: `web-app/app/tsconfig.json`.

## `deno.json`

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
        "exactOptionalPropertyTypes": true
    }
}
```

What the tsconfig had and this drops, and why:
`target`, `module`, `moduleResolution`,
`esModuleInterop`, `skipLibCheck`,
`forceConsistentCasingInFileNames`,
`resolveJsonModule`, `isolatedModules`,
`allowImportingTsExtensions`, `noEmit` — all implied by
Deno's resolver and transpiler, which accept only
explicit specifiers and never emit. `include` and
`exclude` become the directories named on the
`deno check` line.

The `esbuild` entry exists for one importer,
`tests/server-zip-metafile.test.ts`, and leaves with it
in Spec 2. `deno.ns` types the `Deno` namespace for every
file, including browser code that must never use it; no
file uses it before Spec 3, and a stray `Deno.*` in
client code would fail in the browser where TEST-PLAN
sees it. Named, not gated.

## `deno.lock`

Created once by `deno install`, which resolves the
import map and records integrity hashes for
`npm:postgres@3.4.9` and `npm:esbuild@0.28.0` (and
esbuild's platform packages). Every `deno` call in the
root scripts passes `--frozen`: a drifted import map
fails loudly instead of rewriting the lock. This is the
`npm ci` discipline, kept.

## `tests/local-storage-stub.ts`

```ts
// Preload for ./test. Deno ships a real Web Storage
// global: assigning globalThis.localStorage is ignored,
// `localStorage.setItem = fn` stores a key, and the
// store persists across processes. Twenty-five test
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

`getItem` returns `null` for an absent key because that
is the Web Storage contract the adapters code against —
the stub speaks the platform's tongue, not a default of
its own. Measured: with this preload the five
`localStorage` failures vanish under Deno, module-level
and per-test stubs both take effect, and the same file
passes 4/4 under Node.

## `./test`

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
# --no-check: the tests are not type-checked until the
# test idiom spec; deno check covers the product tree.
# Permissions, named: env (signing key, TZ, POSTGRES_URL
# skips), read (fixtures, scripts, source walkers),
# write (temp dirs for the HTTP tests), net (127.0.0.1
# listeners), run (the metafile test's esbuild binary).
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

The existing `JWT_HMAC_SIGNING_KEY` line is unchanged.
`--allow-run` leaves with the esbuild import in Spec 2.

## `./test-postgres`

Its own array with the same flags and permissions, but
without `--parallel` (the five files share one Postgres
and today run serially; parallelism there is a
measurement for later, not an assumption) and without
preloads (today's script passes no `--import`; the
`pg-*` files bring their own fixtures), over the five
`pg-*` files with `SCHEMA_NAME` exported as today.

## `./validate`

The `npx --no-install tsc` line becomes:

```bash
deno --version
deno check --frozen api shared server web-app
```

`deno --version` is evidence, not a gate: the pinned
2.9.5 is visible in every transcript. The awk
line-length list gains `deno.json`. Nothing else in the
script moves.

## The generators

`generate-schema-svg` and `generate-api-documentation`
replace `node --strip-types` with

```bash
deno run --frozen --allow-read --allow-write=SCHEMA.svg \
    web-app/app/generate-schema-svg.ts "$@"
```

and the API generator's write scoped to its output
directory. Under `deno run`, `process.argv` is
`[deno, script, …args]`, so the scripts' `--check`
detection and the `isCliEntry()` match on `argv[1]` hold
unchanged. The `--check` gates compare bytes against the
committed outputs; byte parity is therefore proven on
every `./validate`.

## Source fixes

1. **`server/boot.ts:122`** — `trustedProxyHops:
   string | undefined` is passed into an optional
   `string` property. Conditional spread:

   ```ts
   const listener = await listenHttp({
       adapter,
       staticRoot: staticRootFromMeta(),
       port: listenEnv.port,
       ...(listenEnv.trustedProxyHops !== undefined
           ? { trustedProxyHops: listenEnv.trustedProxyHops }
           : {}),
   });
   ```

2. **`measure.ts:886` and `:930`** — `process.env`
   (`NodeJS.ProcessEnv`, an index signature) has no
   property in common with the weak type `MeasureEnv`.
   `measure-cli.ts` widens the alias:

   ```ts
   export type MeasureEnv =
       Readonly<Record<string, string | undefined>>;
   ```

   Every reader already treats each key as
   `string | undefined`; the call sites and the
   `measure-cli` tests are unchanged.

3. **`measure.ts:1355`** — the stale-budget offenders
   are spread into an untyped array whose
   `'unknown-page'` arm lacks `medianReadyMs`. Annotate
   the array: `const offenders: BudgetOffender[] = […]`,
   importing the type from `measure-core.ts`. The arm's
   shape already satisfies it.

4. **`compose.ts`** — `'fs'` becomes `'node:fs'` and
   `'path'` becomes `'node:path'`. Valid under both
   runtimes; `./build` still runs it under Node.

5. **Thirty-five dynamic imports gain extensions.**
   `page-registry.ts` (29): every
   `import('../<dir>/<file>')` becomes
   `import('../<dir>/<file>.ts')`. `header-info.ts:17`,
   `invitations-indicator.ts:27` and `:39`,
   `sidebar-member.ts:44`: `'./adapters'` becomes
   `'./adapters/index.ts'`. `header-info.ts:40`:
   `'./safe-html'` becomes `'./safe-html.ts'`.
   `app-boot.ts:83`: `'./command-palette'` becomes
   `'./command-palette.ts'`. esbuild resolves both
   forms to the same file and inlines them, so
   `assets/app.js` is byte-identical before and after —
   the plan diffs it to prove so.

## `tests/debouncer.test.ts`

Each of the six tests that calls
`t.mock.timers.enable(…)` gains, as its first statement,
`t.after(() => { t.mock.timers.reset(); });`. Node
already resets mock timers at the end of every test;
the explicit reset is idempotent there and required
under Deno's compat, where the second `enable` throws
"already enabled". Measured 4/4 under both runtimes.

## Removals

- `web-app/app/tsconfig.json` is deleted.
- `npm uninstall typescript` removes the devDependency
  and rewrites `package-lock.json`. `esbuild` and
  `postgres` remain until Spec 2.

## Documentation

- **CLAUDE.md** — § Commands: a line stating Deno 2.9.5
  is the toolchain for `./validate` and `./test`, and
  that `./build` still needs `npm ci` until the build
  spec lands. § Validate semantics: `deno check --frozen
  api shared server web-app` replaces the tsc sentence;
  the test sentence names `deno test --parallel`, the
  two preloads, and `--no-check`. § TypeScript:
  `deno.json` replaces the tsconfig path; the five
  entrypoints are no longer "excluded from type
  checking" — they are checked. § Testing / Automated
  tests: the runner sentence. § Gotchas: one entry —
  under Deno `localStorage` is a real global; the
  preload installs the fake the tests stub.
- **README.md** — § Getting Started: install Deno 2.9.5;
  `npm ci` remains for `./build` until Spec 2, stated
  plainly.
- **TEST-PLAN.md** — AT2's command text and its PASS
  wording (`N passed | 0 failed`).
- **ARCHITECTURE.md** — no change; it describes the
  server process, which this spec does not touch.

## The Gates

After this spec, `./validate` is: `deno --version`;
`deno check` over `api shared server web-app`; `./test`
(Deno, two suites); the line-length, `org`, and retired
vocabulary lints; `./generate-schema-svg --check` and
`./generate-api-documentation --check` under
`deno run`. Node is called nowhere in it.

Node remains required by `./build`, `./serve`,
`./measure`, `./postgres-seed`, `./postgres-wipe`, and
`postgres-lib` — named here, retired in Specs 2 and 4.

## Divergences, Named

- **No per-file process.** Node runs each test file in
  its own process; `deno test` runs every module a
  worker receives in one isolate. Module-level state —
  the 25 `localStorage` stubs, the preload's store —
  persists from file to file within a worker. The
  measured runs are stable (three runs, identical
  counts); Spec 5 closes the gap with per-test fixtures
  that restore. A flake that appears only under
  `--parallel` is this divergence until proven
  otherwise.
- Skipped tests report as "ignored"; the summary line
  reads `ok | N passed | 0 failed | 5 ignored`.
- `TZ` is honored (measured: 8/8 under Honolulu).
- `--no-check` means a test file with a type error still
  runs. Today's tsc never saw the tests either; nothing
  is lost, and Spec 5 gains it.

## Verification

1. `deno --version` prints 2.9.5.
2. `deno install` writes `deno.lock`; `git status` shows
   only the lock and `deno.json`.
3. `./build --no-zip "$DIR/"` before and after the
   import-extension commit: `cmp` on `assets/app.js`
   reports identical.
4. `./validate` exits 0. The transcript shows `deno
   check` with no diagnostics, `ok | 3324 passed |
   0 failed | 5 ignored` for the main suite, `ok |
   8 passed | 0 failed` for `tests/tz/`, and both
   generator gates up to date.
5. The main suite's wall time is recorded in CLAUDE.md's
   testing section beside Node's 33.5 s baseline.
6. `./test-postgres` against the compose Postgres
   (Docker is outside the sandbox; the user runs it with
   `!`): five files pass.
7. `grep -c node validate test test-postgres
   generate-schema-svg generate-api-documentation`
   reports 0 for each.
8. `./serve` still builds and boots under Node.

## The Office of the Commit, Observed

Fourteen commits, each building and passing:

1. Add deno.json and deno.lock
2. Prefix compose.ts builtin imports with node:
3. Add extensions to dynamic imports
4. Fix boot.ts optional proxy-hops property
5. Widen MeasureEnv to the env bag shape
6. Type stale-budget offenders as BudgetOffender
7. Add the localStorage test preload
8. Reset mock timers in debouncer tests
9. Run tests under Deno
10. Run Postgres tests under Deno
11. Run the generators under Deno
12. Type-check with deno check
13. Drop tsc
14. Document the Deno toolchain

Commits 1 to 8 are inert or Node-valid; 9 needs 7 and 8;
12 needs 1 to 6; 11 needs 1.

## Risks

- A compat gap beyond the two known ones appears only at
  runtime; the suite is the detector, and the counts are
  the covenant.
- `deno install` needs the npm registry once; `--frozen`
  thereafter. The sandbox reaches `registry.npmjs.org`.
- A later Deno patch release may type `@types/node`
  differently and surface new diagnostics in
  `measure.ts`; the pin bounds it until Spec 4 removes
  `process` from the file.

## Later, Not Now

- `./build` on Deno and the end of `package.json`
  (Spec 2).
- `process` and `node:` out of the entrypoints (Spec 4).
- `tests/` type-checked and on `Deno.test` (Spec 5).

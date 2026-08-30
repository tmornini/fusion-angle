# Deno Toolchain — Design

Date: 2026-08-21
Status: draft (brainstorm 2026-08-21; approved in chat;
awaiting the user's review of this written spec;
reconciled 2026-08-23 against the tree at `eaa73075`
and again 2026-08-30 against `c6d078c3`, 367 commits
on from the spec's first commit — every count and line
number below is from that tree). Spec only; no
implementation lives in this document.

This scroll is Spec 1 of the Deno migration roadmap.
The roadmap holds the goals, the evidence, and the
decisions every spec inherits; this scroll holds what
changes in this step and nothing that belongs to a later
one. The roadmap scroll left with the `docs/` cleanout
(`0e1b8538`) and was not restored with the six specs
(`ee4b7331`); read it from history:

```sh
git show 9620d38c:docs/superpowers/specs/\
2026-08-21-deno-migration-roadmap-design.md
```

## The Goal

Run `./validate` with Node absent: type-checking, the
automated test suite, and the two generator gates move
to Deno 2.9.5, while `./build`, `build-lib`,
`./test-browser`, `./serve`, `./measure`, and the seed
keep Node for exactly one more spec.

The suite does not change its idiom. The 398 files
`./test` runs keep `node:test` and `node:assert` and
run through Deno's compat layer; the test counts are
the oracle — what Node reports at the plan's first
commit. At `c6d078c3` that is 3476 tests, 3469
passing, 7 skipped, plus 8 in `tests/tz/` (Node
v26.7.0, 16.9 s). The ten files under
`tests/browser/` are `./test-browser`'s (Layer 2) and
stay on Node until Spec 2 moves the client bundle they
serve.

## Context

- `./validate` runs `npx --no-install tsc --noEmit -p
  tsconfig.json` (the whole tree, `types: ["node"]`),
  then the same over `web-app/app/tsconfig.json` (the
  browser subset, `types: []`), then `./test`, the
  line-length lint, the root-doc line-count gate, the
  `org` and retired-vocabulary lints, the later-work
  homing gate, the TEST-PLAN pin-path gate, then
  `./generate-schema-svg --check` and
  `./generate-api-documentation --check` — both
  `node --strip-types` wrappers.
- `./test` runs `node --strip-types --import
  ./tests/hmac-test-key.ts --test tests/*.test.ts` under
  `TZ=UTC`, then `tests/tz/*.test.ts` under
  `TZ=Pacific/Honolulu`. `./test-postgres` runs seven
  files serially with `SCHEMA_NAME` set — six `pg-*`
  files and `tests/schema-lifecycle.test.ts`.
  `./test-browser` (Layer 2; `./test-all` is
  `./validate` then it) sources `build-lib`, bundles
  the client into `$TMPDIR` with esbuild, exports
  `FUSION_ANGLE_STATIC_ROOT`, and runs
  `tests/browser/*.test.ts` under `node --test
  --test-concurrency=1 --test-timeout=120000` against
  real Chrome. `./crank` runs `./validate`,
  `./test-postgres`, and `./test-browser` before it
  builds and serves.
- Two `tsc` projects since 2026-08-29 (`4da3c1a8`; the
  design is `2026-08-28-whole-tree-type-check-design.md`).
  The root `tsconfig.json` holds the one option set —
  the seventeen the browser file had, plus
  `verbatimModuleSyntax`, `erasableSyntaxOnly`, and
  `types: ["node"]` — and includes `api`, `server`,
  `shared`, `tests`, and `web-app`: the whole tree is
  checked, `tests/` included, and it is clean.
  `web-app/app/tsconfig.json` extends it, overrides
  only `types: []`, includes `web-app/**`, `api/**`,
  `shared/**`, and excludes the seven Node-only
  modules — the five entrypoints plus `cdp-client.ts`
  and `browser-drive.ts`.
  `tests/tsconfig-covenants.test.ts` spawns `tsc
  --showConfig` to pin both option sets and proves the
  browser fence: a file extending the browser project
  that references `process` fails TS2591.
  `@types/node` 24.13.3 and `typescript` 6.0.3 are the
  devDependencies that carry this.
- Measured (roadmap § What Was Measured, against the
  2026-08-21 tree): under Deno with named permissions
  and a `localStorage` preload, the then-unchanged suite
  was 3320 pass, 5 fail, 5 ignored in 9.7 s. The five
  failures were `debouncer.test.ts`'s mock timers.
  `deno check` over the new surface found six errors
  outside `tests/` and one extensionless import family
  of 35 sites. At `c6d078c3` the 35 sites are still
  present; of the six error sites, the whole-tree `tsc`
  pass cured two (`boot.ts`'s optional property,
  `ccb3d056`; the offenders array, `06e5f8e0`), the
  `MeasureEnv` pair now passes `tsc` and awaits Deno's
  verdict, and `compose.ts`'s bare imports remain
  (re-cited below). The plan's first task re-runs the
  suite and `deno check` and records today's counts.
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
3. **`deno check --frozen api shared server tests
   web-app`** is the type gate — the five roots the
   root `tsconfig.json` includes today, `tests/` among
   them. The tree enters this spec clean under `tsc`;
   what `deno check` adds is Deno's own diagnostics
   (the `deno.ns` lib, compat typings), and the plan's
   first task counts them. The browser fence
   (`types: []`, TS2591 on `process`) has no second
   project under Deno; Decision 9 names its fate.
4. **`deno test --parallel --no-check`** runs the suite
   with two preloads and five named permissions —
   `--allow-env --allow-read --allow-write --allow-net
   --allow-run` — never `-A`. `--no-check` is explicit
   and commented: Decision 3 already checked `tests/`;
   checking again at run time buys nothing.
5. **`tests/local-storage-stub.ts`** is a preload that
   installs a writable in-memory `localStorage` through
   `Object.defineProperty`. The 33 stubbing test files
   are not edited.
6. **`debouncer.test.ts`** gains
   `t.after(() => { t.mock.timers.reset(); });` as the
   first statement of each of its six timer tests.
7. **Three source fixes cure the remaining type
   errors**, none a suppression: the two `node:`
   prefixes in `compose.ts`, the 35 import extensions
   (which also cure `invitations-indicator.ts:41`), and
   — only if `deno check` still objects — the
   `MeasureEnv` widening in `measure-cli.ts`. The
   `boot.ts` and offenders fixes landed with the
   whole-tree `tsc` pass.
8. **The generators run under `deno run`** so that
   `./validate` calls Node nowhere. Their `--check`
   parity against the committed `SCHEMA.svg` and
   `web-app/api-documentation/` is the oracle.
9. **`tsc` leaves.** Both `tsconfig.json` files are
   deleted; `typescript` and `@types/node` leave
   `devDependencies`. `package.json` stays for esbuild
   and postgres.js until Spec 2. The two `--showConfig`
   pins in `tests/tsconfig-covenants.test.ts` leave
   with `tsc`; its browser-fence pin is retargeted or
   retired by measurement — the plan's first task runs
   `deno check` over a browser-reach file that
   references `process`. If Deno rejects it, the test
   spawns `deno check` on that file instead of `tsc`
   and the fence stays pinned; if Deno accepts it (the
   Node globals typed everywhere), the test is deleted
   with the reason in the commit, and AGENTS.md
   § Two type universes names the fence as lost beside
   `deno.ns` — a stray `process` in client code then
   fails in the browser, where `./test-browser` and the
   walk see it.
10. **The 78-column lint gains `deno.json`.**
    `deno.lock` is generated and exempt.
    `tests/validate-lint.test.ts` pins the lint block
    (no markdown; `crank` present) and is untouched.

## Non-goals

- No change to `./build`, `build-lib`, `./test-browser`,
  `./test-all`, `./crank`, `./serve`, `./measure`,
  `./postgres-seed`, `./postgres-wipe`, `postgres-lib`,
  `Dockerfile`, `compose.yaml`, or Render.
  `./test-browser` needs `build-lib`'s esbuild bundle;
  it moves in Spec 2 with the bundle.
- No test file changes beyond `debouncer.test.ts` and
  `tests/tsconfig-covenants.test.ts` (Decision 9).
- No port of `server/` or the entrypoints to `Deno.*`;
  `process` and `node:` imports stay where they are.
- No `jsr:` dependency.

## Files

Added: `deno.json`, `deno.lock`,
`tests/local-storage-stub.ts`.

Changed: `validate`, `test`, `test-postgres`,
`generate-schema-svg`, `generate-api-documentation`;
`web-app/app/compose.ts`, and `measure-cli.ts` if
Deno still objects; `web-app/app/page-registry.ts`,
`header-info.ts`, `invitations-indicator.ts`,
`sidebar-member.ts`, `app-boot.ts`;
`tests/debouncer.test.ts`,
`tests/tsconfig-covenants.test.ts`; `package.json`,
`package-lock.json`; `AGENTS.md`, `README.md`,
`TEST-PLAN.md`.

Removed: `tsconfig.json`, `web-app/app/tsconfig.json`;
`tests/tsconfig-covenants.test.ts` if Decision 9's
measurement retires it.

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
        "exactOptionalPropertyTypes": true,
        "verbatimModuleSyntax": true,
        "erasableSyntaxOnly": true
    }
}
```

What the root tsconfig has and this drops, and why:
`target`, `module`, `moduleResolution`,
`esModuleInterop`, `skipLibCheck`,
`forceConsistentCasingInFileNames`,
`resolveJsonModule`, `isolatedModules`,
`allowImportingTsExtensions`, `noEmit` — all implied by
Deno's resolver and transpiler, which accept only
explicit specifiers and never emit. `include` becomes
the directories named on the `deno check` line; the
browser file's `exclude` list has no successor, because
one universe checks the seven Node-only modules beside
everything else.

`verbatimModuleSyntax` and `erasableSyntaxOnly` stay:
`node --strip-types` still runs `compose.ts`, the
operator tools, `./measure`, and `./test-browser` until
Specs 2 and 4, and erasability is enforced where the
tree is checked, not where it runs. Deno reports an
unsupported compiler option as a warning, not a
failure, so the plan's first task reads the `deno
check` transcript for one; a silently dropped option
would leave erasability unenforced for two specs.

`types: ["node"]` against the browser file's
`types: []` — the two universes — has no one-file
counterpart. Whether a workspace member `deno.json`
under `web-app/` can narrow `lib` for the browser reach
is Decision 9's first measurement; until it answers,
the fence is named, not gated, exactly as `deno.ns`
below.

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

The existing `JWT_HMAC_SIGNING_KEY` line is unchanged.
`--allow-run` narrows in Spec 2 when the esbuild import
leaves; `serve-cli.test.ts` and `crank-cli.test.ts`
keep it for the scripts they spawn.

## `./test-postgres`

Its own array with the same flags and permissions, but
without `--parallel` (the seven files share one
Postgres and today run serially; parallelism there is a
measurement for later, not an assumption) and without
preloads (today's script passes no `--import`; the
files bring their own fixtures), over the seven files
the script lists today with `SCHEMA_NAME` exported as
today.

## `./validate`

The two `npx --no-install tsc` lines become:

```bash
deno --version
deno check --frozen api shared server tests web-app
```

`deno --version` is evidence, not a gate: the pinned
2.9.5 is visible in every transcript. The awk
line-length list gains `deno.json`. The root-doc
line-count gate, the `org` lint, the
retired-vocabulary lint, the later-work homing gate,
and the TEST-PLAN pin-path gate do not move.

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

1. **`measure.ts:372` and `:416`** — `process.env`
   (`NodeJS.ProcessEnv`, an index signature) is passed
   where `MeasureEnv`, a weak type of three optional
   keys, is declared. The root `tsc` (TypeScript
   6.0.3, `@types/node` 24.13.3) accepts both sites
   today; the 2026-08-21 `deno check` did not. If Deno
   2.9.5 still objects, `measure-cli.ts` widens the
   alias:

   ```ts
   export type MeasureEnv =
       Readonly<Record<string, string | undefined>>;
   ```

   Every reader already treats each key as
   `string | undefined`; the call sites and the
   `measure-cli` tests are unchanged. If Deno accepts
   the sites, nothing changes — a widening nobody
   asked for is unbidden.

2. **`compose.ts`** — `'fs'` becomes `'node:fs'` and
   `'path'` becomes `'node:path'`. Valid under both
   runtimes; `build-lib` still runs it under Node.

3. **Thirty-five dynamic imports gain extensions.**
   `page-registry.ts` (29): every
   `import('../<dir>/<file>')` becomes
   `import('../<dir>/<file>.ts')`. `header-info.ts:17`,
   `invitations-indicator.ts:27` and `:39`,
   `sidebar-member.ts:44`: `'./adapters'` becomes
   `'./adapters/index.ts'`. `header-info.ts:40`:
   `'./safe-html'` becomes `'./safe-html.ts'`.
   `app-boot.ts:85`: `'./command-palette'` becomes
   `'./command-palette.ts'`. esbuild resolves both
   forms to the same file and inlines them, so
   `assets/app.js` is byte-identical before and after —
   the plan diffs it to prove so.

Already cured at `c6d078c3`: `server/boot.ts:126`
spreads `trustedProxyHops` only when present
(`ccb3d056`), and `measure.ts:831` annotates the
offenders array as `BudgetOffender[]` (`06e5f8e0`) —
the whole-tree `tsc` pass met the same diagnostics
first.

## `tests/debouncer.test.ts`

Each of the six tests that calls
`t.mock.timers.enable(…)` gains, as its first statement,
`t.after(() => { t.mock.timers.reset(); });`. Node
already resets mock timers at the end of every test;
the explicit reset is idempotent there and required
under Deno's compat, where the second `enable` throws
"already enabled". Measured 4/4 under both runtimes.

## Removals

- `tsconfig.json` and `web-app/app/tsconfig.json` are
  deleted.
- `npm uninstall typescript @types/node` removes both
  devDependencies and rewrites `package-lock.json`.
  `esbuild` and `postgres` remain until Spec 2.

## Documentation

The root docs were rewritten after this spec was
drafted: `CLAUDE.md` is now a one-line `@AGENTS.md`
stub, and `AGENTS.md` is a thin router that `./validate`
gates at 300 lines (README.md at 150). AGENTS.md sits
at 281 today; the edits below must trim as much as
they add. The targets name today's headings.

- **AGENTS.md** — the command block: a line stating
  Deno 2.9.5 is the toolchain for `./validate` and
  `./test`, and that `./build`, `./test-browser`, and
  `./crank` still need `npm ci` until the build spec
  lands. § Gates: `deno check --frozen api shared
  server tests web-app` replaces the two `tsc
  --noEmit` clauses; the `./test` clause names
  `deno test --parallel`, the two preloads, and
  `--no-check`; the generator gates are named as
  `deno run`. § Invariants that bite,
  `noUncheckedIndexedAccess`: "tsconfig enables this"
  becomes "`deno.json` enables this"; § Two type
  universes becomes one universe — the `deno check`
  roots succeed the `exclude` registry, and the
  fence's fate is Decision 9's. One new invariant:
  under Deno `localStorage` is a real global; the
  preload installs the fake the tests stub.
- **README.md** — § Getting Started: install Deno
  2.9.5; `npm ci` remains for `./build` until Spec 2,
  stated plainly (today's paragraph says `npm ci`
  installs tsc; after this spec it does not).
- **TEST-PLAN.md** — § The walk's Layer 1 row and AT1
  (both name the two `tsc` projects) become the one
  `deno check` line; AT2's command text and its PASS
  wording (`N passed | 0 failed | 7 ignored`); AT3's
  lint list gains `deno.json`. AT5 (`./test-browser`)
  is untouched until Spec 2.
- **ARCHITECTURE.md** — no change; § One origin, one
  ZIP describes the server process, which this spec
  does not touch.

## The Gates

After this spec, `./validate` is: `deno --version`;
`deno check` over `api shared server tests web-app`;
`./test` (Deno, two suites); the line-length lint, the
root-doc line-count gate, the `org` and
retired-vocabulary lints, the later-work homing gate,
the TEST-PLAN pin-path gate;
`./generate-schema-svg --check` and
`./generate-api-documentation --check` under
`deno run`. Node is called nowhere in it.

Node remains required by `./build`, `build-lib`,
`./test-browser` (so `./test-all` and `./crank`),
`./serve`, `./measure`, `./postgres-seed`,
`./postgres-wipe`, and `postgres-lib` — named here,
retired in Specs 2 and 4.

## Divergences, Named

- **No per-file process.** Node runs each test file in
  its own process; `deno test` runs every module a
  worker receives in one isolate. Module-level state —
  the 30 module-level `localStorage` stubs, the
  preload's store —
  persists from file to file within a worker. The
  measured runs are stable (three runs, identical
  counts); Spec 5 closes the gap with per-test fixtures
  that restore. A flake that appears only under
  `--parallel` is this divergence until proven
  otherwise.
- Skipped tests report as "ignored"; the summary line
  reads `ok | N passed | 0 failed | 7 ignored`.
- `TZ` is honored (measured: 8/8 under Honolulu).
- `--no-check` means `deno test` itself skips the type
  check; `deno check tests` in `./validate` is where
  the tests are checked, as the root `tsc` checks them
  today. Nothing is lost.

## Verification

1. `deno --version` prints 2.9.5.
2. `deno install` writes `deno.lock`; `git status` shows
   only the lock and `deno.json`.
3. `./build --no-zip "$DIR/"` before and after the
   import-extension commit: `cmp` on `assets/app.js`
   reports identical.
4. `./validate` exits 0. The transcript shows `deno
   check` with no diagnostics, `ok | 3469 passed |
   0 failed | 7 ignored` for the main suite (the
   `c6d078c3` counts; the oracle is whatever Node
   reported at the plan's first commit), `ok |
   8 passed | 0 failed` for `tests/tz/`, and both
   generator gates up to date.
5. The main suite's wall time is recorded in AGENTS.md
   § Gates beside Node's baseline (16.9 s at
   `c6d078c3`, v26.7.0).
6. `./test-postgres` against the compose Postgres
   (Docker is outside the sandbox; the user runs it with
   `!`): seven files pass.
7. `grep -c node validate test test-postgres
   generate-schema-svg generate-api-documentation`
   reports 0 for each.
8. `./build --no-zip` and `./serve dir/ port` still
   build and boot under Node; `./test-browser` still
   passes under Node.
9. `tests/tsconfig-covenants.test.ts` either passes
   against `deno check` or is gone, per Decision 9's
   measurement; AGENTS.md § Two type universes says
   which.

## The Office of the Commit, Observed

Thirteen commits, each building and passing:

1. Add deno.json and deno.lock
2. Prefix compose.ts builtin imports with node:
3. Add extensions to dynamic imports
4. Widen MeasureEnv to the env bag shape (only if
   `deno check` objects; otherwise it does not exist)
5. Add the localStorage test preload
6. Reset mock timers in debouncer tests
7. Run tests under Deno
8. Run Postgres tests under Deno
9. Run the generators under Deno
10. Type-check with deno check
11. Retarget or retire the tsconfig covenant pin
12. Drop tsc
13. Document the Deno toolchain

Commits 1 to 6 are inert or Node-valid; 7 needs 5 and 6;
10 needs 1 to 4; 9 needs 1; 12 needs 10 and 11.

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
- Deno may not honor `erasableSyntaxOnly`. Until Spec 4
  retires `node --strip-types`, an enum or namespace
  introduced meanwhile would surface at `./build`,
  `./test-browser`, or seed time instead of at `deno
  check`; the first-task transcript check bounds it.

## Later, Not Now

- `./build`, `build-lib`, and `./test-browser` on Deno
  and the end of `package.json` (Spec 2).
- `process` and `node:` out of the entrypoints,
  `cdp-client.ts`, and `browser-drive.ts` (Spec 4).
- `tests/` on `Deno.test` (Spec 5).

# Deno Test Idiom — Design (outline)

Date: 2026-08-21
Status: outline (authored beside the roadmap on
2026-08-21; reconciled 2026-08-23 against the tree at
`eaa73075` and again 2026-08-30 at `c6d078c3`;
re-validated against the tree and brainstormed to full
depth before its implementation plan). Spec only; no
implementation lives here.

This scroll is Spec 5 of the Deno migration roadmap
and follows
[Spec 4, Tooling idiom](2026-08-21-deno-tooling-idiom-design.md).
The roadmap scroll left with the `docs/` cleanout
(`0e1b8538`) and was not restored with the six specs
(`ee4b7331`); read it from history:

```sh
git show 9620d38c:docs/superpowers/specs/\
2026-08-21-deno-migration-roadmap-design.md
```

## The Goal

The 408 test files speak Deno: `Deno.test` and
`jsr:@std/assert` replace `node:test` and
`node:assert`; per-test fixtures that restore replace
module-level stubs; the resource and op sanitizers are
on. The counts are the oracle, before and after — at
`c6d078c3`, 3476 tests, 3469 passing, 7 ignored, plus
8 in `tests/tz/`, plus `./test-browser`'s ten files
green.

## Context

- 408 files (396 in `tests/`, 2 in `tests/tz/`, 10 in
  `tests/browser/`); 407 import `node:test` (`test`,
  and `before`/`after` in five of the six `pg-*`
  files, `schema-lifecycle.test.ts`, and
  `tests/browser/fixtures.ts`'s `useBrowser()`) and
  406 import `node:assert` (`strict as assert` or
  `assert/strict`); `store-acceptance-memory.test.ts`
  and `pg-acceptance.test.ts` reach the rest through
  `store-acceptance.ts`. Twenty-seven also use
  `node:fs`, `path`, `os`, `http`, `url`, `crypto`,
  `buffer`, or `child_process` — `serve-cli`,
  `crank-cli`, and `tsconfig-covenants` spawn scripts
  with `spawnSync`; `browser-origin` and the browser
  fixtures read `process.env` (`FUSION_ANGLE_STATIC_ROOT`,
  `TMPDIR`, `CHROME_DEBUG_URL`).
- `debouncer.test.ts` uses `t.mock.timers`; 33 files
  stub `localStorage` by assignment (30 at module
  level); the preloads from Spec 1 (`hmac-test-key.ts`,
  `local-storage-stub.ts`) run before every file.
- `deno check` over `tests/` reported 657 errors on
  2026-08-21: 328 unused imports or locals, the rest
  fixture-shape drift. The whole-tree `tsc` pass
  (2026-08-28/29, the seventeen options plus
  `types: ["node"]`) retired that family — unused names
  deleted, fixtures completed to the entity shapes —
  and `tests/` has been in the type gate since; Spec 1
  carries it into `deno check`. What this spec's
  codemod introduces is what the gate will name.
- `@std/assert`'s `assertThrows(fn, ErrorClass?,
  msgIncludes?)` takes a substring, not a regular
  expression; Node's `assert.throws(fn, /re/)` is common
  here.
- The browser family runs under `./test-browser`
  (Spec 2 put it on `deno test`): one Chrome per file
  through `useBrowser()`, one browser context per test
  through `withAdminPage`, an in-process `listenHttp`
  per test, serial, and — under Node — a 120 s
  per-test timeout. Its CDP socket and Chrome child
  are resources the sanitizers will see.

## The Decisions

1. **A codemod, run once, not committed**, rewrites the
   mechanical surface: `test(` → `Deno.test(`; the
   import lines; the assertion vocabulary —
   `assert.equal` → `assertStrictEquals`,
   `assert.deepEqual` → `assertEquals`, `assert.ok` →
   `assert`, `assert.match` → `assertMatch`,
   `assert.doesNotMatch` → `assertNotMatch`,
   `assert.notEqual` → `assertNotStrictEquals`,
   `assert.notDeepEqual` → `assertNotEquals`,
   `assert.fail` → `fail`, `assert.rejects` →
   `assertRejects`, `assert.throws` → `assertThrows`.
   Regular-expression matchers on `throws`/`rejects`
   are rewritten by hand to `assertThrows` plus
   `assertMatch` on the caught error's message, or to
   the substring form when the pattern is a literal.
2. **Hooks:** the six files' and `useBrowser()`'s
   `before`/`after` become
   `jsr:@std/testing/bdd`'s `beforeAll`/`afterAll`
   inside a `describe`, or a single `Deno.test` with
   steps — decided per file by what the fixture needs.
3. **Timers:** `debouncer.test.ts` moves to
   `jsr:@std/testing/time`'s `FakeTime` with
   `using`/`restore`.
4. **Fixtures replace stubs.** A `tests/fixtures/`
   module offers `withLocalStorage(fake, body)` and
   `withConsoleCapture` (the existing
   `console-capture.ts` pattern), each restoring in
   `finally`. The `localStorage` assignments in 33
   files become per-test calls;
   `local-storage-stub.ts` stays as the baseline
   preload so no test can reach persistent storage.
5. **Node builtins in tests:** `Deno.*` and `@std/path`
   replace `node:fs`/`path`/`os`/`url`; `fetch` replaces
   `node:http.request` where Spec 3 proved it can;
   `shared/digest.ts`'s `sha256Hex` replaces
   `node:crypto`'s `createHash` in
   `design-system-render.test.ts`; `Uint8Array` replaces
   `node:buffer` in `backend-postgres.test.ts`;
   `Deno.Command` replaces `spawnSync` in the three CLI
   pins; `Deno.env.get` replaces `process.env` in
   `browser-origin.test.ts` and the browser fixtures.
6. **Sanitizers on.** A leaked listener or timer fails
   its test; the fix is the leak, never
   `sanitizeResources: false` without a named reason.
   The browser fixtures hold a CDP socket and a
   detached Chrome per file and an origin per test;
   `useBrowser()`'s teardown and `withAdminPage`'s
   nested `finally` are where they close, and a test
   that leaks a context fails by name.
7. **`tests/` stays in `deno check`** (Spec 1's gate,
   inherited from the whole-tree `tsc` pass) and
   `--no-check` stays on `deno test`; the codemod's
   output checks clean before each family's commit —
   nothing is suppressed.
8. **Skips** become `{ ignore: <condition> }` on the
   seven Postgres-gated tests so the summary still reads
   `7 ignored`.

## Decisions Deferred to This Spec's Brainstorm

- One commit per codemod pass across all files, or one
  commit per test family (`api-*`, `adapters-*`,
  `presenter-*`, …). Recommendation: per family, each
  green, so review surfaces stay readable.
- Whether the `hmac-test-key.ts` preload survives or
  becomes an explicit fixture import in the files that
  mint.
- Where the browser suite's per-test bound lives under
  `Deno.test` (Spec 2 put it in the fixtures or found a
  flag), and whether serial order is the plain absence
  of `--parallel` or one `deno test` per file.

## The Gates

- `./validate` — `deno check` over `tests/` clean;
  `./test` reports `3469 passed | 0 failed | 7 ignored`
  (the `c6d078c3` counts) and `8 passed`, with the
  sanitizers on.
- `./test-all` — `./test-browser`'s ten files green
  under `Deno.test`, sanitizers on.
- `./test-postgres` against the compose Postgres
  (`./crank` brings it up).
- Wall time recorded against Spec 1's measured Deno
  figure (9.7 s on 2026-08-21; re-measured by Spec 1's
  plan; Node's is 16.9 s at `c6d078c3`).

## Risks

- `assertEquals` and Node's `deepStrictEqual` differ at
  the edges (prototypes, `-0`, `NaN`); a test that
  passed by accident may fail by honesty. The counts
  catch it; the fix is per case.
- Sanitizers surface resource leaks the Node suite
  tolerated; each is a finding, not a flake.

# Deno Test Idiom — Design (outline)

Date: 2026-08-21
Status: outline (authored beside the roadmap on
2026-08-21; re-validated against the tree and
brainstormed to full depth before its implementation
plan). Spec only; no implementation lives here.

This scroll is Spec 5 of
[the Deno migration roadmap](2026-08-21-deno-migration-roadmap-design.md)
and follows
[Spec 4, Tooling idiom](2026-08-21-deno-tooling-idiom-design.md).

## The Goal

The 371 test files speak Deno: `Deno.test` and
`jsr:@std/assert` replace `node:test` and
`node:assert`; `tests/` joins `deno check`; per-test
fixtures that restore replace module-level stubs; the
resource and op sanitizers are on. The counts are the
oracle: 3329 tests, 3324 passing, 5 ignored, before and
after.

## Context

- 371 files import `node:test` (`test`, and `before`/
  `after` in the five `pg-*` files) and `node:assert`
  (`strict as assert` or `assert/strict`). Fifteen also
  use `node:fs`, `path`, `os`, `http`, `crypto`, or
  `buffer`.
- `debouncer.test.ts` uses `t.mock.timers`; 25 files
  stub `localStorage` at module level; the preloads from
  Spec 1 (`hmac-test-key.ts`, `local-storage-stub.ts`)
  run before every file.
- `deno check` over `tests/` reports 657 errors today:
  328 unused imports or locals, the rest fixture-shape
  drift (`access-token.test.ts` rows without `id`,
  `adapters-admin.test.ts` entities without `state`,
  and kin).
- `@std/assert`'s `assertThrows(fn, ErrorClass?,
  msgIncludes?)` takes a substring, not a regular
  expression; Node's `assert.throws(fn, /re/)` is common
  here.

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
2. **Hooks:** the `pg-*` files' `before`/`after` become
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
   `finally`. The 25 module-level `globalThis.
   localStorage =` assignments become per-test calls;
   `local-storage-stub.ts` stays as the baseline
   preload so no test can reach persistent storage.
5. **Node builtins in tests:** `Deno.*` and `@std/path`
   replace `node:fs`/`path`/`os`; `fetch` replaces
   `node:http.request` where Spec 3 proved it can;
   `shared/digest.ts`'s `sha256Hex` replaces
   `node:crypto`'s `createHash`; `Uint8Array` replaces
   `node:buffer` in `backend-postgres.test.ts`.
6. **Sanitizers on.** A leaked listener or timer fails
   its test; the fix is the leak, never
   `sanitizeResources: false` without a named reason.
7. **`tests/` joins `deno check`:** `--no-check` leaves
   `./test`; `deno check tests` joins `./validate`; the
   657 are fixed — unused imports deleted, fixture
   shapes completed — not suppressed.
8. **Skips** become `{ ignore: <condition> }` on the
   five Postgres-gated tests so the summary still reads
   `5 ignored`.

## Decisions Deferred to This Spec's Brainstorm

- One commit per codemod pass across all files, or one
  commit per test family (`api-*`, `adapters-*`,
  `presenter-*`, …). Recommendation: per family, each
  green, so review surfaces stay readable.
- Whether the `hmac-test-key.ts` preload survives or
  becomes an explicit fixture import in the files that
  mint.

## The Gates

- `./validate` — `deno check` over `tests/` clean;
  `./test` reports `3324 passed | 0 failed | 5 ignored`
  and `8 passed`, with the sanitizers on.
- `./test-postgres` against the compose Postgres.
- Wall time recorded against Spec 1's 9.7 s.

## Risks

- `assertEquals` and Node's `deepStrictEqual` differ at
  the edges (prototypes, `-0`, `NaN`); a test that
  passed by accident may fail by honesty. The counts
  catch it; the fix is per case.
- Sanitizers surface resource leaks the Node suite
  tolerated; each is a finding, not a flake.

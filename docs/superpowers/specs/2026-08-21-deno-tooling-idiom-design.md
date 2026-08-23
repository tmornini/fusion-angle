# Deno Tooling Idiom — Design (outline)

Date: 2026-08-21
Status: outline (authored beside the roadmap on
2026-08-21; re-validated against the tree and
brainstormed to full depth before its implementation
plan). Spec only; no implementation lives here.

This scroll is Spec 4 of
[the Deno migration roadmap](2026-08-21-deno-migration-roadmap-design.md)
and follows
[Spec 3, Server idiom](2026-08-21-deno-server-idiom-design.md).

## The Goal

The five entrypoints — `compose.ts`,
`generate-schema-svg.ts`,
`generate-api-documentation.ts`, `measure.ts`,
`measure-viz.ts` — and `postgres-lib`'s nine inline
programs speak Deno. `process` and `node:` imports leave
`web-app/app/*.ts` and the root scripts.

## Context

- `measure.ts` uses `node:child_process` (`spawn`,
  `execFile` for the server, the seed, Chrome, and git),
  `node:net` (a free port), `node:os` (`cpus`,
  `platform`, `arch`, `tmpdir`), `node:fs`,
  `node:path`, `node:util`'s `promisify`, and
  `process.env`/`argv`/`stdout`/`stderr`/`exitCode`.
- `measure-viz.ts`, both generators, and `compose.ts`
  use `node:fs`, `node:path`, `import.meta.url`, and
  `process.argv`/`exit`/`stdout`/`stderr`.
- `postgres-lib` runs `node --input-type=module -e`
  nine times: JSON extraction from Render API replies,
  the loopback host check, the log flattener, the
  reveal printer, and the inline wipe (which Spec 2
  replaced with the operator tool).
- After Spec 1 the entrypoints are type-checked; after
  Spec 2 `measure.ts` spawns the binary.

## The Decisions

1. **Process:** `Deno.Command` replaces `spawn` and
   `execFile`; `Deno.listen({ port: 0 })` yields the
   free port; `navigator.hardwareConcurrency`,
   `Deno.build.os`, and `Deno.build.arch` replace
   `node:os`; `Deno.makeTempDirSync` replaces the
   `TMPDIR` fallback chain; `Deno.exit` and
   `Deno.exitCode` replace `process.exit`/`exitCode`.
2. **Files:** `Deno.readTextFileSync`,
   `writeTextFileSync`, `mkdirSync`, `readDirSync`,
   `removeSync`, `statSync`; `import.meta.dirname` for
   the repository root in `compose.ts`.
3. **Paths:** `jsr:@std/path` for `join`, `dirname`,
   `resolve`, `extname`, `relative` — the repository's
   first `jsr:` dependency, pinned in the import map and
   `deno.lock`.
4. **Streams:** `Deno.stdout.writeSync` and
   `Deno.stderr.writeSync` through one small writer in
   each file; `console` is not used for machine output.
5. **Arguments and environment:** `Deno.args`;
   `Deno.env.get('CHROME')`, `Deno.env.get('TMPDIR')`,
   and the `MeasureEnv` reads by name.
6. **`postgres-lib`:** each `node -e` program becomes
   `deno eval` with the narrowest permission it needs
   (`--allow-read=FILE`, `--allow-env=POSTGRES_URL`);
   `Deno.args`, `Deno.readTextFileSync`, `Deno.stdout`.
7. **Permissions on the wrappers:** `./measure` names
   read, write (its temp dir and `measurements/`), net,
   run (the binary, `./postgres-seed`, Chrome, `git`),
   env; the generators keep Spec 1's flags.

## Decisions Deferred to This Spec's Brainstorm

- Whether `jsr:@std/path` is worth the first `jsr:`
  dependency or `URL` arithmetic suffices for the
  handful of joins outside `measure.ts`.

## The Gates

- `./validate` — the entrypoints are type-checked with
  no `node:` or `process` reference left.
- `./generate-schema-svg --check` and
  `./generate-api-documentation --check` — byte parity
  with the committed outputs.
- `./measure --runs 1 --pages organization` end to end
  (seed, spawn, Chrome, report), and a bare `./measure
  --visualize`.
- `./postgres-seed --postgres local --mock-data` and
  `./postgres-wipe --postgres local` against the compose
  Postgres. The Render branch is reviewed by `--help`
  and a dry read; no Render exists in the sandbox.

## Risks

- `Deno.Command` with `detached`-style semantics for the
  measured server; `measure.ts` today `unref`s a
  detached child. The plan measures the replacement.

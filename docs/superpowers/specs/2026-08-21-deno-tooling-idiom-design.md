# Deno Tooling Idiom — Design (outline)

Date: 2026-08-21
Status: outline (authored beside the roadmap on
2026-08-21; reconciled 2026-08-23 against the tree at
`eaa73075` and again 2026-08-30 at `c6d078c3`;
re-validated against the tree and brainstormed to full
depth before its implementation plan). Spec only; no
implementation lives here.

This scroll is Spec 4 of the Deno migration roadmap
and follows
[Spec 3, Server idiom](2026-08-21-deno-server-idiom-design.md).
The roadmap scroll left with the `docs/` cleanout
(`0e1b8538`) and was not restored with the six specs
(`ee4b7331`); read it from history:

```sh
git show 9620d38c:docs/superpowers/specs/\
2026-08-21-deno-migration-roadmap-design.md
```

## The Goal

The seven Node-only modules under `web-app/app/` — the
five entrypoints `compose.ts`,
`generate-schema-svg.ts`,
`generate-api-documentation.ts`, `measure.ts`,
`measure-viz.ts`, plus `cdp-client.ts` and
`browser-drive.ts` (the browser tsconfig's `exclude`
list, which Spec 1 deletes; this sentence is the
roll-call after that) — and `postgres-lib`'s eight
inline programs speak Deno. `process` and `node:`
imports leave `web-app/app/*.ts` and the root scripts.

## Context

- `measure.ts` (961 lines at `c6d078c3`) uses
  `node:child_process` (`spawn` for the server;
  `execFile` for git, `./build --no-zip`, and the
  seed), `node:net` (a free port), `node:os` (`cpus`,
  `platform`, `arch`, `tmpdir`), `node:fs`,
  `node:path`, `node:util`'s `promisify`, and
  `process.env`/`argv`/`stdout`/`stderr`/`exitCode`
  (33 sites). The CDP transport and Chrome launcher
  left it for `cdp-client.ts` (`474ca62e`,
  `8cad9e86`): `node:child_process` (`spawn` detached
  and `unref`'d; `killProcessTree` signals the process
  group), `node:fs` (the `DevToolsActivePort` file),
  `node:os` (`platform`), `node:path`, and
  `process.env.CHROME`. The UI drive helpers left for
  `browser-drive.ts` (`20a6f845`), pure over
  `cdp-client.ts` with no Node surface of its own.
  `tests/browser/fixtures.ts` imports both;
  `./test-browser` is their second caller.
- Both generators and `compose.ts` use `node:fs`,
  `node:path` (not the schema generator), and
  `process.argv`/`exit`/`stdout`/`stderr`;
  `compose.ts` alone reads `import.meta.url`, for the
  repository root. `measure-viz.ts` is a library
  `measure.ts` calls for `--visualize`: `node:fs`,
  `node:path`, no `process`.
- `postgres-lib` runs `node --input-type=module -e`
  eight times: the Render error-message reader, the
  job-body writer, the log flattener, the reveal
  printer, the loopback host check, the job-id and
  job-status readers, and the Render-id discovery. The
  inline wipe already left for `server/postgres-wipe.ts`
  (Spec 2 turns its `node -e` Render start command into
  the operator tool).
- After Spec 1 the seven modules are type-checked under
  `deno check` (the root `tsc` already checks them
  today); after Spec 2 `measure.ts` spawns the binary
  and `./test-browser` runs `cdp-client.ts` under
  `deno test`.

## The Decisions

1. **Process:** `Deno.Command` replaces `spawn` and
   `execFile` in `measure.ts` and `cdp-client.ts` —
   the detached, `unref`'d server and Chrome children
   and the process-group kill are the Risk below;
   `Deno.listen({ port: 0 })` yields the free port;
   `navigator.hardwareConcurrency`, `Deno.build.os`,
   and `Deno.build.arch` replace `node:os`;
   `Deno.makeTempDirSync` replaces the `TMPDIR`
   fallback chain; `Deno.exit` and `Deno.exitCode`
   replace `process.exit`/`exitCode`.
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
   env; the generators keep Spec 1's flags;
   `./test-browser` keeps Spec 2's — it is
   `cdp-client.ts`'s second runtime and must stay green.

## Decisions Deferred to This Spec's Brainstorm

- Whether `jsr:@std/path` is worth the first `jsr:`
  dependency or `URL` arithmetic suffices for the
  handful of joins outside `measure.ts`.

## The Gates

- `./validate` — the seven modules are type-checked
  with no `node:` or `process` reference left.
- `./test-browser` — the ported `cdp-client.ts` and
  `browser-drive.ts` under real Chrome, ten files
  green (Layer 2, `./test-all`).
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
  measured server and for Chrome; `measure.ts` and
  `cdp-client.ts` today `unref` detached children, and
  `killProcessTree` signals the process group. The plan
  measures the replacement.

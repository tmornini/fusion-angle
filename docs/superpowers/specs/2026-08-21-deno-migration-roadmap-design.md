# Deno Migration — Roadmap Design

Date: 2026-08-21
Status: draft (brainstorm 2026-08-21; approved in chat;
awaiting the user's review of this written roadmap).
Spec only; no implementation lives in this document.

This scroll governs six sub-specs. It holds the goals,
the evidence, and the decisions every sub-spec inherits.
Each sub-spec stands beside it and repeats none of it:

1. [Toolchain](2026-08-21-deno-toolchain-design.md)
2. [Build and artifact](2026-08-21-deno-build-artifact-design.md)
3. [Server idiom](2026-08-21-deno-server-idiom-design.md)
4. [Tooling idiom](2026-08-21-deno-tooling-idiom-design.md)
5. [Test idiom](2026-08-21-deno-test-idiom-design.md)
6. [Postgres driver](2026-08-21-deno-postgres-driver-design.md)

## The Goal

Replace Node.js with Deno 2.9.5 as the runtime and the
toolchain of this repository, for the three reasons the
user named as success:

1. **Toolchain consolidation.** One binary replaces
   `node`, `npm`, `tsc`, and `esbuild`. `deno check`
   types the whole product tree — including `server/`
   and the five dev entrypoints `tsc` has never seen.
2. **Permission model.** The deployed process carries an
   explicit least-privilege covenant — the network, the
   named environment variables, nothing else — compiled
   into the executable.
3. **Single-binary artifact.** `deno compile` emits one
   executable with the composed site embedded. The ZIP
   carries a binary, not a runtime requirement.

"Zero npm" was not named as a goal. It arrives anyway:
after Spec 2, Deno itself fetches postgres.js as
`npm:postgres@3.4.9`, and `package.json`,
`package-lock.json`, and `node_modules/` are deleted.

## Context

Where Node lives today (the tree at `e27deb7a`):

- **The core is runtime-neutral.** `api/`, `shared/`,
  and `web-app/app/` (minus five entrypoints) use Web
  `Request`/`Response`, Web Crypto, `TextEncoder`, and
  `URL`. `Buffer` appears once, duck-typed in
  `api/backend-postgres.ts` with an `Octets` fallback.
- **The edges are Node.** `server/http-server.ts` (638
  lines translating `node:http` to `Request` and
  `Response`), `server/boot.ts` (`process.*`, SIGTERM,
  an `import.meta.url` main-module check),
  `server/scrypt-hash.ts` (`node:crypto` scrypt), and
  `server/postgres-seed.ts`.
- **Five dev entrypoints** — `compose.ts`,
  `generate-schema-svg.ts`,
  `generate-api-documentation.ts`, `measure.ts`,
  `measure-viz.ts` — are excluded from `tsc` because
  there is no `@types/node`.
- **Scripts.** `node --strip-types` in `build`, `test`,
  `test-postgres`, `measure`, both `generate-*`, and
  `postgres-seed`; `npx esbuild` six times in `build`;
  nine inline `node -e` programs in `postgres-lib`;
  `node:24` in `Dockerfile` and `compose.yaml`; Render's
  start line `cd render-out && HTTP_SERVER_PORT=$PORT
  node server.mjs` on the native Node runtime.
- **Tests.** 371 files on `node:test` + `node:assert`;
  15 also use `node:fs`, `path`, `os`, `http`, `crypto`,
  or `buffer`; one `--import ./tests/hmac-test-key.ts`
  preload; 25 files stub `localStorage` by assignment.
- **Dependencies.** Runtime: postgres.js 3.4.9 (the
  package ships no Deno build). Dev: esbuild 0.28.0 and
  typescript 6.0.3.
- **The type-check surface** is `web-app/**`, `api/**`,
  and `shared/**` minus the five entrypoints. Neither
  `server/` nor `tests/` has ever been type-checked.

## What Was Measured

Deno 2.9.5 (aarch64-apple-darwin, installed from the
`deno` npm package into a scratch directory) against the
tree on 2026-08-21. Node v26.7.0 is the baseline. Deno
embeds TypeScript 6.0.3 — the version `package.json`
pins.

- Unchanged suite under `deno test` through `node:test`
  compat: 3314 pass, 10 fail, 5 ignored; 1m11s serial.
  With `--parallel`: 9.7 s wall. Node: 33.5 s wall.
- Same run with named permissions and a `localStorage`
  preload: 3320 pass, 5 fail — all five are
  `debouncer.test.ts`, whose `t.mock.timers` Deno does
  not reset between tests. `t.after` plus
  `t.mock.timers.reset()` cures it under both runtimes.
- `tests/tz/` under `TZ=Pacific/Honolulu`: 8 pass.
- `deno check` over all 696 files: 662 errors — 657 in
  `tests/` (328 are unused imports), one in
  `server/boot.ts:122` (a real
  `exactOptionalPropertyTypes` violation), four in
  `measure.ts`, one in `invitations-indicator.ts:41`
  caused by `import('./adapters')`.
- Extensionless dynamic imports: 35 sites in 5 files.
  Deno resolves only explicit specifiers.
- `deno bundle` for the client app (iife, minify,
  keep-names): 543,236 bytes; esbuild: 544,882. The CSS
  stream with `--external '*.woff2'`: 55,949 bytes;
  esbuild: 55,919. `deno bundle` prints "experimental"
  and fetches esbuild 0.25.5 on first use.
- `deno info --json` separates code edges from type
  edges. `api/access-token.ts` reaches the client graph
  only through a type edge from `api/request-context.ts`;
  the code-reachable set is 165 modules.
- `deno compile`: host binary 70 MB with postgres.js
  embedded (`--exclude-unused-npm`); Linux x86_64
  cross-compile 104 MB, from macOS. `--include <dir>`
  embeds a directory, readable through
  `new URL(…, import.meta.url)` with no `--allow-read`.
  Compile type-checks by default.
- Inside the binary: `import.meta.main` is true;
  `Deno.args` holds only user arguments;
  `process.argv` is `[binary, binary, …args]`, so the
  `isMainModule()` comparison with `import.meta.url` can
  never match. The real `boot()` ran every gate with the
  exact messages and exit 1.
- Under a scoped `--allow-env`, reading an unlisted
  variable throws `NotCapable`; `Deno.env.toObject()`
  throws outright. postgres.js reads `PGAPPNAME`,
  `PGTARGETSESSIONATTRS`, and `PG<OPTION>` for every
  option default it is not handed (`PGSSL` first), plus
  `PGHOST`, `PGPORT`, `PGUSER`, `PGUSERNAME`,
  `PGDATABASE`, `PGPASSWORD` when the URL omits a part.
- `node:crypto` scrypt at the product's parameters:
  198 ms. `Deno.serve`, `Deno.Command`,
  `Deno.addSignalListener`, and `deno test --preload`
  are present; `--preload` runs in every `--parallel`
  worker (16/16 across four files).
- Deno's `localStorage` is a real Web Storage global:
  assignment to `globalThis.localStorage` is ignored,
  `localStorage.setItem = fn` stores a key, and the
  store persists across processes.
  `Object.defineProperty` replaces it.

## The Decisions

1. **Approach: compat-first, idiom-later.** Specs 1
   and 2 flip the toolchain and the artifact while
   `node:` imports keep working through Deno's compat
   layer; the unchanged suite and the compose smoke are
   the oracle of each flip. Specs 3 to 5 port idioms one
   layer at a time, behavior pinned before each port.
2. **Deno 2.9.5, pinned.** The Dockerfile image tag pins
   it; CLAUDE.md states it; `./validate` prints
   `deno --version` in every run. No version gate in the
   scripts.
3. **`deno.json` at the root is the only toolchain
   config.** The import map carries `postgres` →
   `npm:postgres@3.4.9` (exact, no caret).
   `compilerOptions` mirror today's tsconfig; `lib` is
   `es2024`, `dom`, `dom.iterable`, `deno.ns`;
   `nodeModulesDir` is `none`; `deno.lock` is committed;
   every `deno` call in a root script passes `--frozen`.
4. **Not adopted:** `deno fmt`, `deno lint`,
   `deno task`. The 78-column lint and the root shell
   scripts remain the one voice.
5. **The type-check surface** becomes `api`, `shared`,
   `server`, and `web-app` — today's surface plus what
   was blind. `tests/` joins in Spec 5.
6. **Tests keep `node:test` and `node:assert`** through
   Spec 4, run by `deno test --parallel`. Spec 5 ports
   them to `Deno.test` and `@std/assert`.
7. **Artifact.** `deno compile`; the composed site is
   embedded with `--include`; the baked permissions are
   `--allow-net` and an `--allow-env=` list naming the
   four product variables and postgres.js's reads — no
   read, write, run, or sys. The ZIP carries the Linux
   x86_64 binary; `./build --no-zip dir/` emits the host
   target for `./serve` and `./measure`.
8. **Render** moves to the Docker runtime. One-off jobs
   call compiled operator tools inside the image.
9. **Driver.** `npm:postgres@3.4.9` through Spec 5;
   `jsr:@db/postgres` is Spec 6, behind `SqlClient`.
10. **Named compat survivors** after the idiom specs:
    `node:crypto` scrypt (Web Crypto has none), and
    postgres.js's `node:net` and `node:tls` until
    Spec 6.

## The Six Specs

Each has its own scroll, plan, and commit series. Each
leaves master green under `./validate` and, where it
touches the artifact, under the compose smoke.

1. **Toolchain.** `deno.json`, `deno check`,
   `deno test`, the generators under `deno run`, the six
   type errors fixed, 35 import extensions, the
   `localStorage` preload, the timer resets. `./build` stays on npm for
   one spec. Written in full.
2. **Build and artifact.** `deno run`, `deno bundle`,
   `deno compile`; the embedded site; Dockerfile and
   compose on `denoland/deno:2.9.5`; Render on Docker;
   the metafile pin over `deno info`; `package.json`
   retired. Outline.
3. **Server idiom.** `Deno.serve` replaces the
   `node:http` adapter; `Deno.env`, signals, `Deno.args`.
   Outline.
4. **Tooling idiom.** The five entrypoints and
   `postgres-lib` speak `Deno.*` and `deno eval`.
   Outline.
5. **Test idiom.** 371 files to `Deno.test` and
   `@std/assert`; `tests/` joins `deno check`. Outline.
6. **Postgres driver** (optional). `jsr:@db/postgres`
   behind `SqlClient`, gated by `./test-postgres`.
   Outline.

Ordering is strict: 1 → 2 → 3 → 4 → 5 → 6. Specs 3 and 4
may swap if the measurements after Spec 2 argue for it.
Each outline is re-validated against the tree and
brainstormed to full depth before its implementation
plan is written; outlines name decisions they defer and
the recommendation for each.

## Non-goals

- No change to the HTTP API, the pages, the schema, or
  the message plane.
- No Deno Deploy, no Deno KV, no HTTP/2, no TLS in the
  process (the proxy terminates it).
- No `deno fmt` reformat of any file.
- No driver change before Spec 6.
- No feature rides along. The diff of each spec matches
  its story.

## The Environment Contract (end state)

The binary reads, by name:

- `POSTGRES_URL`, `JWT_HMAC_SIGNING_KEY`,
  `HTTP_SERVER_PORT` — required, never logged.
- `TRUSTED_PROXY_HOPS` — optional.
- postgres.js's names, permitted so that its defaults
  read as unset instead of throwing: `PGHOST`, `PGPORT`,
  `PGUSER`, `PGUSERNAME`, `PGPASSWORD`, `PGDATABASE`,
  `PGAPPNAME`, `PGTARGETSESSIONATTRS`, `PGMAX`, `PGSSL`,
  `PGSSLNEGOTIATION`, `PGIDLE_TIMEOUT`,
  `PGCONNECT_TIMEOUT`, `PGMAX_LIFETIME`,
  `PGMAX_PIPELINE`, `PGBACKOFF`, `PGKEEP_ALIVE`,
  `PGPREPARE`, `PGDEBUG`, `PGFETCH_TYPES`,
  `PGPUBLICATIONS`, `PGTARGET_SESSION_ATTRS`. Spec 6
  shrinks this list to what `@db/postgres` reads.

`PORT` → `HTTP_SERVER_PORT` stays a one-line `sh -c` in
the container command, as today.

## Risks, Named

- `deno bundle` prints "experimental"; its flags may
  move between Deno releases. The pin bounds this; the
  escape hatch is `npm:esbuild` with the same flags.
- Between Spec 2 and Spec 3 the compiled binary serves
  HTTP through `node:http` compat. Boot is proven; the
  request path is gated by the compose smoke and
  `./measure --base-url` before Spec 2 lands.
- `node:test` compat fidelity is depended on until
  Spec 5. Two gaps are known and worked around: the
  timer-mock reset and the `localStorage` global.
- Binary size: 70 MB host, 104 MB Linux. The ZIP grows
  from kilobytes to tens of megabytes.
- Render's Docker runtime builds the image on every
  deploy. The Linux `denort` is native there; no
  cross-compile download.
- `jsr.io` is unreachable from the Claude sandbox;
  Spec 6 is probed only outside it.
- Developer Deno versions drift; only the image pins.
  `./validate` prints the version so drift is visible
  in every log.

## Later, Not Now

- Scoping `--allow-net` to the Postgres host and the
  listen port — deployment data, not in the binary.
- Token-at-rest hashing, LISTEN/NOTIFY, and the other
  residuals in ARCHITECTURE.md are untouched.
- A `deno compile --self-extracting` variant if binary
  start-up time ever measures as a problem.

# Deno Build and Artifact — Design (outline)

Date: 2026-08-21
Status: outline (authored beside the roadmap on
2026-08-21; reconciled 2026-08-23 against the tree at
`eaa73075`; re-validated against the tree and
brainstormed to full depth before its implementation
plan). Spec only; no implementation lives here.

This scroll is Spec 2 of the Deno migration roadmap
and follows
[Spec 1, Toolchain](2026-08-21-deno-toolchain-design.md).
The roadmap scroll left with the `docs/` cleanout
(`0e1b8538`) and was not restored with the six specs
(`ee4b7331`); read it from history:

```sh
git show 9620d38c:docs/superpowers/specs/\
2026-08-21-deno-migration-roadmap-design.md
```

## The Goal

`./build` runs on Deno alone and emits one executable:
the composed site embedded, postgres.js embedded, the
permission covenant baked in. `./serve` and `./measure`
run that executable. The Docker image and Render run it.
`package.json`, `package-lock.json`, and `node_modules/`
leave the repository.

## Context

- `./build` today: the clean-tree gate; `node
  --strip-types compose.ts`; six `npx esbuild` runs —
  `app.js` (iife, minify, keep-names, es2024),
  `theme-init.js`, `root-redirect.js`, `styles.css`
  from a concatenated stream with `--loader=css
  --minify`, every `pages-*.css`, and `server.mjs`
  (`--platform=node --format=esm`); copies of fonts,
  `index.html`, favicons, `mark.png`; a ZIP named
  `fusion-angle-server-${SHA}.zip`.
- Pins that move with the build:
  `tests/server-zip-metafile.test.ts` (ZIP name, the
  `server-core.ts` entry, the esbuild metafile
  client-graph pin), `tests/fusion-angle-mark.test.ts`
  (reads `build` for `mark.png`),
  `tests/measure-cli.test.ts` (`server.mjs` entry and
  spawn args), `tests/pg-boot.test.ts` (argv fixture),
  `tests/fusion-angle-live-name.test.ts` (walks
  `package-lock.json`).
- `measure.ts` spawns `node server.mjs` through
  `measureServerArgs()`. `server/postgres-wipe.ts` is
  the operator wipe already: `./postgres-wipe
  --postgres local` runs it under `node --strip-types`,
  and for Render its `renderWipeStartCommand()` prints
  a `node -e` program (importing `postgres`) as the
  job's `startCommand`. `./postgres-seed` has three
  modes — `--bootstrap`, `--mock-data`,
  `--test-plan-slices` — and a `compose` target that
  runs the `seed` service.
- Measured: `deno bundle` output sizes equal esbuild's;
  `--format iife`, `--minify`, `--keep-names`, and
  `--external '*.woff2'` work; `deno compile` embeds
  `npm:postgres` and a `--include` directory; the
  included directory is readable through
  `new URL(…, import.meta.url)` without `--allow-read`;
  cross-compile to Linux x86_64 works from macOS;
  `import.meta.main` is true in the binary;
  `isMainModule()` never is.

## The Decisions

1. **`./build` stays bash** and keeps the clean-tree
   gate, the `emitted` voice, and `--no-zip`.
2. **Composition:** `deno run --frozen --allow-read
   --allow-write="$BUILD_DIR" web-app/app/compose.ts
   "$BUILD_DIR/site"`. Under `deno run`, `process.argv`
   keeps Node's shape, so `compose.ts` is unchanged here
   and ported in Spec 4.
3. **Bundles:** `deno bundle --frozen --platform browser
   --format iife --minify` for `theme-init.js` and
   `root-redirect.js`, plus `--keep-names` for `app.js`.
   CSS: the same concatenation written to
   `"$BUILD_DIR/styles.concat.css"`, then `deno bundle
   --minify --external '*.woff2'`; each `pages-*.css`
   likewise. Byte identity with esbuild is not a goal;
   the DOM, TEST-PLAN, and `./measure` are the oracles.
4. **The site layout:** `"$BUILD_DIR/site/"` holds what
   the ZIP root holds today — `index.html`, the composed
   pages, `assets/`.
5. **The entry is written by the build.** `./build`
   writes `"$BUILD_DIR/main.ts"`:

   ```ts
   import { main } from '/abs/repo/server/boot.ts';
   await main(new URL('./site/', import.meta.url));
   ```

   The import is the repository's absolute path, as the
   build script knows it (`$ROOT`).
   `server/boot.ts` exports `main(siteRoot: URL)` — the
   listening block that today sits under
   `isMainModule()` — and `boot(env, argv, staticRoot)`
   gains its third parameter. `staticRootFromMeta()` and
   `isMainModule()` are deleted. The included directory
   keeps its absolute build path inside the binary's
   file system, so `./site/` resolves beside `main.ts`.
6. **Environment by name.** `boot` reads its four
   variables by name (an `EnvReader`, `(name) =>
   string | undefined`, defaulting to `process.env`
   access per name); `Deno.env.toObject()` and whole-bag
   reads are forbidden under a scoped `--allow-env`.
7. **Compile:**

   ```bash
   deno compile --frozen --exclude-unused-npm \
       --include "$BUILD_DIR/site" \
       --allow-net \
       --allow-env=<the roadmap's list> \
       [--target x86_64-unknown-linux-gnu] \
       -o "$BUILD_DIR/<binary>" "$BUILD_DIR/main.ts"
   ```

   Compile type-checks by default; an unchecked tree
   cannot produce the artifact.
8. **Targets.** The ZIP carries Linux x86_64;
   `./build --no-zip dir/` emits the host target, which
   is what `./serve`, `./measure`, and the Docker
   builder (Linux, native) consume.
9. **Metafile pin** — `tests/server-zip-metafile.test.ts`
   walks `deno info --json web-app/app/server-core.ts`
   by code edges only (type edges excluded) and asserts
   `api/access-token.ts` and the forbidden mint names
   are absent from the code-reachable inputs. The
   `esbuild` import-map entry leaves with the old pin;
   the test gains `--allow-run=deno` in `./test`'s
   permission list and `--allow-run` otherwise drops.
10. **`./serve`** builds `--no-zip` and `exec`s the
    binary with `HTTP_SERVER_PORT` as today.
    **`./measure`** spawns the binary directly;
    `MEASURE_SERVER_ENTRY` names it and
    `measureServerArgs()` returns `[]`; the pin updates.
11. **Dockerfile.** Builder `FROM denoland/deno:2.9.5`,
    `COPY . .`, `RUN ./build --no-zip render-out/`.
    Runtime `FROM denoland/deno:2.9.5`, the binary
    copied in, `USER deno`, `CMD ["sh", "-c",
    "HTTP_SERVER_PORT=$PORT exec ./<binary>"]`. The
    runtime stage keeps the Deno image for `sh` and a
    `deno eval` healthcheck; the binary itself needs
    neither.
12. **compose.yaml.** The server healthcheck becomes
    `deno eval --allow-net --allow-env=PORT …`; the
    `seed` service targets `runtime` and runs the
    operator tool; the builder is no longer needed for
    seeding.
13. **Render** moves to the Docker runtime: build from
    the Dockerfile, start from its `CMD`. `postgres-seed
    --postgres render` posts a job whose `startCommand`
    is the operator tool; `postgres-wipe` likewise —
    `renderWipeStartCommand()` names the tool instead
    of rendering a `node -e` program. The compose-stack
    spec's "no Render config change" (that scroll now
    lives only in history, before `0e1b8538`) is
    consciously retired here.
14. **`package.json`, `package-lock.json`,
    `node_modules/`** are deleted; `.gitignore` and
    `.dockerignore` drop `node_modules/`;
    `fusion-angle-live-name.test.ts`'s file list drops
    `package-lock.json` and gains `deno.json`; README's
    Getting Started installs Deno only.
15. **Root docs.** The root docs were rewritten after
    this outline; each pins the Node artifact by name
    and moves with it: AGENTS.md's command block
    (`./build`, `./serve`, the `TMPDIR` sandbox note)
    and § Operator seed and wipe; README.md § Modules
    (the ZIP line) and § Getting Started (the `npm ci`
    paragraph); ARCHITECTURE.md § One origin, one ZIP
    (`server.mjs`, the ZIP name, "Node serves",
    postgres.js bundled); TEST-PLAN.md A1–A3 and the
    other `server.mjs` / `node server.mjs` lines (18
    today). `./validate` gates AGENTS.md at 300 lines
    and README.md at 150.

## Decisions Deferred to This Spec's Brainstorm

- **Operator tools: three binaries or one dispatcher.**
  (a) `fusion-angle-server`, `fusion-angle-seed`,
  `fusion-angle-wipe` — each ~100 MB, three compiles.
  (b) One `fusion-angle` binary whose first argument
  selects `serve`, `seed`, or `wipe`; `serve` takes no
  options, restating the `NO_ARGUMENTS` covenant
  (`server/postgres-gate.ts`, pinned by
  `pg-boot.test.ts` and ARCHITECTURE.md § One origin,
  one ZIP) as "no options on serve". Recommendation:
  (b) — one binary, a self-sufficient ZIP (unzip, seed,
  serve), and a ZIP renamed `fusion-angle-${SHA}.zip`.
  `server/postgres-wipe.ts` (`POSTGRES_DROP_SCHEMA`
  from `api/backend-postgres.ts`) already exists as the
  wipe entry; either way it becomes the compiled `wipe`,
  and `postgres-lib` keeps no inline program for it.
- **Runtime image:** `denoland/deno:2.9.5` (decision 11)
  against `debian:bookworm-slim` plus `curl` for the
  healthcheck. Recommendation: the Deno image — one
  image family, and the healthcheck cannot lie about the
  runtime.

## Open Items (the plan's first tasks verify)

- Whether `git` is present in `denoland/deno:2.9.5`; the
  clean-tree gate and `git rev-parse` need it in the
  builder.
- Whether `node:fs` (`createReadStream`, `stat`) reads
  from the compiled file system; if not, Spec 3's
  `Deno.open` static path comes forward into this spec.
- Any `--allow-sys` that postgres.js or `node:net`
  demand under compat; Deno names the missing permission
  on failure.
- That `--keep-names` under `deno bundle` preserves the
  function names `app.js` relies on, as esbuild's does.
- The binary's start-up time against `node server.mjs`;
  `./measure`'s `boot:*` phases record it.

## The Gates

- `./validate` (Spec 1's), plus `deno compile`'s own
  type check.
- The compose smoke: `docker compose build`,
  `./postgres-seed --postgres compose --mock-data`,
  `docker compose up --wait`, the landing page, and
  `./measure --base-url http://127.0.0.1:8080 --password
  "$PW" --runs 1 --pages organization`.
- `./test-postgres`, unchanged.
- The ZIP unzips to one executable that runs the boot
  gates on a Linux host.

## Risks

- `deno bundle` is experimental; `--keep-names` parity
  is an open item above.
- `node:http` serves inside the binary through compat
  until Spec 3; the compose smoke gates it.
- Render's Docker build time grows (bundle + compile);
  measured at the first deploy.

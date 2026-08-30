# Deno Build and Artifact — Design (outline)

Date: 2026-08-21
Status: outline (authored beside the roadmap on
2026-08-21; reconciled 2026-08-23 against the tree at
`eaa73075` and again 2026-08-30 at `c6d078c3`;
re-validated against the tree and brainstormed to full
depth before its implementation plan). Spec only; no
implementation lives here.

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

- `./build` today: the clean-tree gate, then
  `build-lib`'s `bundle_client` (sourced; `28836ad9`,
  `83d18b38`) — `node --strip-types compose.ts` and
  five `npx esbuild` runs: `app.js` (iife, minify,
  keep-names, es2024), `theme-init.js`,
  `root-redirect.js`, `styles.css` from a concatenated
  stream with `--loader=css --minify`, every
  `pages-*.css`; copies of fonts, `index.html`,
  favicons, `mark.png` — then the sixth esbuild run,
  `server.mjs` (`--platform=node --format=esm`), and a
  ZIP named `fusion-angle-server-${SHA}.zip`.
  `./test-browser` sources the same `build-lib` and
  serves `bundle_client`'s output from `$TMPDIR` to
  real Chrome through an in-process `listenHttp`
  (`tests/browser/fixtures.ts` reads
  `FUSION_ANGLE_STATIC_ROOT`); `./test-all` is
  `./validate` then `./test-browser`.
- Pins that move with the build:
  `tests/server-zip-metafile.test.ts` (ZIP name, the
  `server-core.ts` entry in `build-lib`, the esbuild
  metafile client-graph pin, and `build`'s `--no-zip`
  help naming `server.mjs` and `./crank`),
  `tests/fusion-angle-mark.test.ts` (reads `build-lib`
  for `mark.png`), `tests/measure-cli.test.ts`
  (`MEASURE_SERVER_ENTRY` is `server.mjs`;
  `measureServerArgs()` is `['server.mjs']`),
  `tests/serve-cli.test.ts` (`serve` runs `node
  server.mjs` and never `./build`),
  `tests/crank-cli.test.ts` (`crank` owns the local
  stack), `tests/pg-boot.test.ts` (argv fixture),
  `tests/fusion-angle-live-name.test.ts` (walks
  `package-lock.json`).
- `measure.ts` spawns `node server.mjs` through
  `measureServerArgs()`. `./serve dir/ port` no longer
  builds (`ae590dab`): it `exec`s `node server.mjs` in
  `dir/`. `./crank --mock-data|--bootstrap port`
  (`0f289810`) owns the local stack: `./validate`,
  minted secrets, the compose Postgres alone,
  `./test-postgres`, `./test-browser`, `./build
  --no-zip` into a temp dir, wipe, seed, `./serve`.
  `server/postgres-wipe.ts` is the operator wipe
  already: `./postgres-wipe --postgres local` runs it
  under `node --strip-types`, and for Render its
  `renderWipeStartCommand()` prints a `node -e`
  program (importing `postgres`) as the job's
  `startCommand`. `./postgres-seed` has two modes —
  `--bootstrap`, `--mock-data` (`--test-plan-slices`
  left with the slice seeder, `8bd9defb`) — and a
  `compose` target that runs the `seed` service.
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

1. **`./build` and `build-lib` stay bash.** `./build`
   keeps the clean-tree gate and `--no-zip`;
   `build-lib` keeps `bundle_client` and the `emitted`
   voice; `./test-browser` keeps sourcing it.
2. **Composition,** inside `bundle_client`: `deno run
   --frozen --allow-read --allow-write="$dest"
   web-app/app/compose.ts "$dest"` — `"$BUILD_DIR/site"`
   under `./build`, the `$TMPDIR` bundle under
   `./test-browser`. Under `deno run`, `process.argv`
   keeps Node's shape, so `compose.ts` is unchanged here
   and ported in Spec 4.
3. **Bundles,** inside `bundle_client`: `deno bundle
   --frozen --platform browser --format iife --minify`
   for `theme-init.js` and `root-redirect.js`, plus
   `--keep-names` for `app.js`. CSS: the same
   concatenation written to `"$dest/styles.concat.css"`,
   then `deno bundle --minify --external '*.woff2'`;
   each `pages-*.css` likewise. Byte identity with
   esbuild is not a goal; the DOM, `./test-browser` (the
   same bundle under real Chrome — the deterministic
   oracle), the walk, and `./measure` are the oracles.
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
   its `--no-zip` help pin follows the new help text.
   `./test`'s `--allow-run` narrows to what the suite
   still spawns — `deno` here, `./serve` and `./crank`
   in their CLI pins.
10. **`./serve dir/ port`** `exec`s the binary in
    `dir/` with `HTTP_SERVER_PORT` as today; its pin
    (`serve-cli.test.ts`) names the binary instead of
    `node server.mjs`. **`./crank`** is unchanged: it
    builds `--no-zip` and calls `./serve`.
    **`./measure`** spawns the binary directly;
    `MEASURE_SERVER_ENTRY` names it and
    `measureServerArgs()` returns `[]`; the pin updates.
    **`./test-browser`** runs `bundle_client` (now
    `deno bundle`), then `tests/browser/*.test.ts` under
    `deno test --frozen --no-check` with Spec 1's
    preload and permissions, serially (no
    `--parallel`), `--allow-run` unscoped (Chrome's path
    is the operator's), and `--allow-env` covering
    `CHROME`, `CHROME_DEBUG_URL`, `TMPDIR`, and
    `FUSION_ANGLE_STATIC_ROOT`; the files keep
    `node:test` until Spec 5. `./test-all` is
    unchanged.
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
    (`./build --no-zip`, `./serve` — "node server.mjs
    from dir/" — `./crank`, the `TMPDIR` sandbox note),
    § Gates (`./test-browser` "bundles into `$TMPDIR`"),
    § HTTP only ("One origin (`node server.mjs`)"), and
    § Operator seed and wipe; README.md § Modules (the
    ZIP line, "Node + Postgres") and § Getting Started
    (the `npm ci` paragraph); ARCHITECTURE.md § One
    origin, one ZIP (`server.mjs`, the ZIP name, "Node
    serves", postgres.js bundled); TEST-PLAN.md A1–A3,
    AT5, and the three other `server.mjs` lines (A2's
    pin and K8's `node server.mjs`). `./validate` gates
    AGENTS.md at 300 lines (281 today) and README.md at
    150.

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
- `node --test`'s `--test-timeout=120000` — the guard
  `./test-browser` carries so a dead CDP socket fails
  by name instead of hanging `./crank` — has no
  `deno test` flag. Where the bound lives under Deno
  (the fixtures, or an option the plan finds) is
  verified before the runner line changes.
- That the `deno bundle` output keeps the ten browser
  pins green — the deterministic check on
  `--keep-names` parity and the CSS concatenation,
  ahead of the walk.

## The Gates

- `./validate` (Spec 1's), plus `deno compile`'s own
  type check.
- The compose smoke: `docker compose build`,
  `./postgres-seed --postgres compose --mock-data`,
  `docker compose up --wait`, the landing page, and
  `./measure --base-url http://127.0.0.1:8080 --password
  "$PW" --runs 1 --pages organization`.
- `./test-all`: Spec 1's `./validate`, then
  `./test-browser` on the `deno bundle` output — ten
  files green before the ZIP is cut.
- `./crank --mock-data 8080` end to end: the binary
  listens, and the walk's A3 passes against it.
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

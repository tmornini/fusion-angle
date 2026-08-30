# Deno Server Idiom — Design (outline)

Date: 2026-08-21
Status: outline (authored beside the roadmap on
2026-08-21; reconciled 2026-08-23 against the tree at
`eaa73075` and again 2026-08-30 at `c6d078c3`;
re-validated against the tree and brainstormed to full
depth before its implementation plan). Spec only; no
implementation lives here.

This scroll is Spec 3 of the Deno migration roadmap
and follows
[Spec 2, Build and artifact](2026-08-21-deno-build-artifact-design.md).
The roadmap scroll left with the `docs/` cleanout
(`0e1b8538`) and was not restored with the six specs
(`ee4b7331`); read it from history:

```sh
git show 9620d38c:docs/superpowers/specs/\
2026-08-21-deno-migration-roadmap-design.md
```

## The Goal

`server/` speaks Deno. `Deno.serve` serves; `Deno.env`
reads; `Deno.addSignalListener` drains; `Deno.args` is
argv. `node:` imports vanish from the product process
except `node:crypto` scrypt, the one named exception.
The HTTP covenant pinned by `http-server.test.ts`,
`http-throttle.test.ts`,
`http-static-directory-index.test.ts`, and
`pg-boot.test.ts` holds without a changed assertion —
and so does the one `tests/browser/fixtures.ts` pins
through real Chrome.

## Context

`server/http-server.ts` owns: the 1 MiB body cap
(`Content-Length` pre-check, then a counted read, 413
beyond); the `/api/` mount strip into
`handleRequest(adapter, Request)`; the auth throttle
keyed by the socket address, honoring `Forwarded` and
`X-Forwarded-For` only behind `TRUSTED_PROXY_HOPS`;
static files (the MIME table, `Cache-Control` no-store
against immutable for hashed names, HEAD, 405 with
`Allow`, directory index, `/not-found/index.html` for
navigations, the traversal guard); the
`Content-Security-Policy` header on every HTML
response (`CONTENT_SECURITY_POLICY`, nine directives —
the page metas were dropped for it, so the port must
send it or the pages run without a policy); JSON error
bodies; one JSON log line per request (`at`, `level`,
`method`, `path`, `status`, `latencyMs`,
`operationId`); a 10 s drain on close, then
`closeAllConnections`.

`server/boot.ts` owns the gates (argv, env, UTF-8, no
legacy message tables, the schema marker), SIGTERM →
close → exit, and the JSON stdout/stderr lines.
`server/postgres-seed.ts` and `server/postgres-wipe.ts`
are the operator tools, each with its own
`isMainModule()`, `process.argv`, and `process.stdout`.
`throttle.ts`, `seed.ts`, and `postgres-gate.ts` are
runtime-neutral apart from `postgres-gate.ts`'s
`process.env` default.

`listenHttp` has a fifth consumer since 2026-08-28
(`28836ad9`): `tests/browser/fixtures.ts`'s
`startOrigin()` listens on `host: '127.0.0.1'`,
`port: 0`, the memory adapter seeded by
`postMockDataLoad`, and a `staticRoot` read from
`FUSION_ANGLE_STATIC_ROOT` — the client bundle
`./test-browser` wrote to `$TMPDIR`. The ten browser
files ride it under real Chrome, and
`tests/browser-origin.test.ts` (in `./test`) proves
the origin serves the seeded API. Spec 2 moves
`./test-browser` to `deno test`; this spec ports the
listener beneath it.

Deno offers `Deno.serve({ port, hostname, onListen,
signal })` with a handler `(request, info)` where
`info.remoteAddr` carries the peer; `server.shutdown()`
and `server.finished` for the drain; `Deno.stat` and
`Deno.open` whose `readable` streams into a `Response`.
Measured in the spike: `Deno.readTextFile` reads the
compiled file system; `Deno.open` is assumed and
verified first.

## The Decisions

1. **`listenHttp(options)` keeps its signature** and the
   `HttpListener` contract (`port`, `close()`), so
   `boot.ts`, the three HTTP test files, and
   `tests/browser/fixtures.ts` do not move. `host` and
   `port: 0` (the fixtures' ephemeral loopback) map
   onto `Deno.serve`'s `hostname` and `port`, and
   `listener.port` reads the bound port from
   `onListen`.
2. **The handler is `(request: Request, info) =>
   Promise<Response>`.** `incomingToRequest`,
   `writeFetchResponse`, and `writeJson`'s
   `ServerResponse` plumbing are deleted;
   `readCappedBody` reads `request.body` with the same
   three outcomes (`bytes`, `empty`, `too-large`).
3. **Static serving:** `Deno.stat` plus `Deno.open`
   streaming, the same MIME table, cache-control rules,
   404/405/HEAD semantics, and `safeStaticPath` (pure,
   unchanged). One path serves both roots — the
   compiled file system in the binary and the real
   directory `./test-browser` hands the fixtures; the
   browser suite gates the directory, the compose smoke
   the binary.
4. **Drain:** `server.shutdown()`, a timer that aborts
   the serve signal after `drainMs`, and `close()`
   resolving on `server.finished`.
5. **Logging:** JSON lines through a `TextEncoder` and
   `Deno.stdout.writeSync`; the `RequestLog` seam and
   the test's captured-log assertions are unchanged.
6. **`boot.ts`:** the `EnvReader` from Spec 2 becomes
   `Deno.env.get`; argv is `Deno.args` and the
   no-arguments gate becomes `Deno.args.length > 0`
   (the `pg-boot` fixture passes a plain array either
   way); SIGTERM through `Deno.addSignalListener`; exit
   through `Deno.exit`.
7. **`postgres-seed.ts` and `postgres-wipe.ts`**
   receive the same treatment: `Deno.args`,
   `Deno.env.get`, `Deno.stdout`; their
   `isMainModule()` checks become `import.meta.main`
   (Spec 2 made them compiled operator tools).
8. **`scrypt-hash.ts` keeps `node:crypto`**; its header
   names the reason (Web Crypto has no scrypt) and the
   day it may leave (a `Deno` or `@std` scrypt).
9. **Permissions are unchanged** — `--allow-net` and the
   env list. Still no `--allow-read`: the site is in the
   binary. (`./test-browser` already carries
   `--allow-read`; the directory root is the tests',
   never the binary's.)

## Decisions Deferred to This Spec's Brainstorm

- Whether `Deno.serve`'s default `onError` or an
  explicit handler produces the current
  `{"error":"internal error"}` 500 body with
  `Cache-Control: no-store`.
- Whether the tests that send `sec-fetch-mode:
  navigate` through `node:http.request`
  (`http-static-directory-index.test.ts`) can use
  `fetch` under Deno (forbidden-header rules), or keep
  `node:http` until Spec 5.

## Open Items

- `Deno.open` on compiled-file-system paths.
- The throttle's address key under `Deno.serve`
  (`info.remoteAddr.hostname`) against the
  `::ffff:`-mapped form `throttle.ts` normalizes today.

## The Gates

- `./validate`; `./test-postgres`; `./test-browser` —
  the ported listener under real Chrome, ten files
  green (Layer 2, `./test-all`).
- The compose smoke and `./measure --base-url` (the
  request path, now native).
- The walk's cases that exercise navigation, 404s, and
  static caching (Layer 3, `./crank --mock-data 8080`),
  and the same against the compose origin.

## Risks

- A behavior the `node:http` adapter had and no test
  names. The four test files and the browser suite are
  the covenant (`http-server.test.ts` pins the CSP
  header); what they do not pin, the compose smoke and
  the walk must.

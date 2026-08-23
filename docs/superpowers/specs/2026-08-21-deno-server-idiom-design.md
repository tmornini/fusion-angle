# Deno Server Idiom — Design (outline)

Date: 2026-08-21
Status: outline (authored beside the roadmap on
2026-08-21; re-validated against the tree and
brainstormed to full depth before its implementation
plan). Spec only; no implementation lives here.

This scroll is Spec 3 of
[the Deno migration roadmap](2026-08-21-deno-migration-roadmap-design.md)
and follows
[Spec 2, Build and artifact](2026-08-21-deno-build-artifact-design.md).

## The Goal

`server/` speaks Deno. `Deno.serve` serves; `Deno.env`
reads; `Deno.addSignalListener` drains; `Deno.args` is
argv. `node:` imports vanish from the product process
except `node:crypto` scrypt, the one named exception.
The HTTP covenant pinned by `http-server.test.ts`,
`http-throttle.test.ts`,
`http-static-directory-index.test.ts`, and
`pg-boot.test.ts` holds without a changed assertion.

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
navigations, the traversal guard); JSON error bodies;
one JSON log line per request (`at`, `level`, `method`,
`path`, `status`, `latencyMs`, `operationId`); a 10 s
drain on close, then `closeAllConnections`.

`server/boot.ts` owns the gates, SIGTERM → close → exit,
and the JSON stdout/stderr lines. `throttle.ts`,
`seed.ts`, and `postgres-gate.ts` are runtime-neutral
apart from `postgres-gate.ts`'s `process.env` default.

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
   `boot.ts` and the four test files do not move.
2. **The handler is `(request: Request, info) =>
   Promise<Response>`.** `incomingToRequest`,
   `writeFetchResponse`, and `writeJson`'s
   `ServerResponse` plumbing are deleted;
   `readCappedBody` reads `request.body` with the same
   three outcomes (`bytes`, `empty`, `too-large`).
3. **Static serving:** `Deno.stat` plus `Deno.open`
   streaming, the same MIME table, cache-control rules,
   404/405/HEAD semantics, and `safeStaticPath` (pure,
   unchanged).
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
7. **`postgres-seed.ts`** receives the same treatment:
   `Deno.args`, `Deno.env.get`, `Deno.stdout`.
8. **`scrypt-hash.ts` keeps `node:crypto`**; its header
   names the reason (Web Crypto has no scrypt) and the
   day it may leave (a `Deno` or `@std` scrypt).
9. **Permissions are unchanged** — `--allow-net` and the
   env list. Still no `--allow-read`: the site is in the
   binary.

## Decisions Deferred to This Spec's Brainstorm

- Whether `Deno.serve`'s default `onError` or an
  explicit handler produces the current
  `{"error":"internal error"}` 500 body with
  `Cache-Control: no-store`.
- Whether the two tests that send
  `sec-fetch-mode: navigate` through `node:http.request`
  can use `fetch` under Deno (forbidden-header rules),
  or keep `node:http` until Spec 5.

## Open Items

- `Deno.open` on compiled-file-system paths.
- The throttle's address key under `Deno.serve`
  (`info.remoteAddr.hostname`) against the
  `::ffff:`-mapped form `throttle.ts` normalizes today.

## The Gates

- `./validate`; `./test-postgres`.
- The compose smoke and `./measure --base-url` (the
  request path, now native).
- TEST-PLAN slices that exercise navigation, 404s, and
  static caching, run against the compose origin.

## Risks

- A behavior the `node:http` adapter had and no test
  names. The four test files are the covenant; what they
  do not pin, the compose smoke and TEST-PLAN must.

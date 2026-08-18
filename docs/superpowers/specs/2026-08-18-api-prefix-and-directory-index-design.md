# API Prefix and Directory Index — Design

Date: 2026-08-18
Status: accepted

Vocabulary: **organization** (never “org”),
**collection** (directory GET, trailing `/`),
**item**, **mount** (`/api/`, the HTTP door).
This file is spec, not an implementation plan.

## Context

One origin serves pages and the REST API. There
is no `/api/` prefix. The client calls
`fetch(origin + '/' + resource)`. Extension-less
paths fall through to `handleRequest`. So
`GET /ideas/` is the ideas **collection resource**
(unsigned `fetch` is 401 JSON), while the ideas
**page** is `/ideas/index.html`. A human leftover
path (`/no-such-page`) hits the API and paints
`{ "error": "invalid_token" }`.

Directory-index HTML exists only for
`/api-documentation/…`. `GET /ideas/` does not
serve `ideas/index.html`. That is two voices for
the same shape of URL.

The four-entry-and-notify work added a navigate
arm that serves `not-found/index.html` and
excluded `/authentication` so grants still reach
the API. That exclusion is a symptom: grants and
pages share a URI space.

## User decisions

1. **Every API call lives under `/api/`.** Pages
   never share that prefix. The door strips `/api`
   and hands the remainder to `handleRequest`.
2. **A trailing slash is a directory GET.** Serve
   `{path}index.html` if that file exists, else
   404. `/ideas/` serves `ideas/index.html`.
   `/assets/` and `/api-documentation/post/` 404
   for the same reason: no `index.html`.
3. **Slashless `/ideas` is a miss.** Not a second
   spelling, not a redirect, not an assumption
   that they meant `/ideas/`.
4. **File extension is not a routing rule.** It
   may inform `Content-Type` after we have decided
   to serve a file. Classification is existence
   plus the rules below.
5. **`assets/` is not a page directory.** No
   `index.html` there. `GET /assets/` is a miss.
6. **`http-server.ts` stays in `server/`.** It is
   the HTTP door, not API domain. `api/` never
   imports `node:http`.
7. **The route table stays unprefixed.** `/api`
   is the door's mount, not a domain noun. Routes
   remain `organizations/:id/ideas` and
   `authentication/token`. Baking `api/` into
   `route()` would put HTTP plumbing in the
   resource language.
8. **No third-party static server.** Node has no
   `node:static`. The platform is `node:http` +
   `node:fs`. `serveStatic` in `http-server.ts`
   is already the prenup. Do not marry
   `express.static` / `sirv` / `serve-static`.
9. **Collection GET inside api-docs 404s** when
   that prefix has no `index.html`. Do not
   generate listing indexes for the 70 intermediate
   `api-documentation/` rooms.
10. **Cookie `Path` moves with the grant** to
    `/api/authentication`. `Path=/authentication`
    would not attach to
    `POST /api/authentication/token`.
11. **Park the leftover-review nits** from the
    four-entry run until this partition lands.
    Product-page name `snapshots` stays out of
    new fixtures; unknown pages are
    `no-such-page`.

## Non-goals

- Do not move `http-server.ts`, `boot.ts`,
  `seed.ts`, or `scrypt-hash.ts` into `api/`.
- Do not put `api/` in `route()` patterns or in
  `AUTHENTICATION_ROUTES`.
- Do not add an `index.html` under `assets/`.
- Do not generate api-docs prefix listings.
- Do not redirect slashless collection URLs.
- Do not introduce a third-party static-file
  package.
- Do not rename token-claim snapshots, flow-graph
  snapshots, or `presenter.snapshot()`.
- Do not implement the parked four-entry review
  nits in this change.
- Do not widen the refresh cookie past
  `/api/authentication` (not `/api`, not `/`).

## Design

### A. One origin, two mounts

| Request | Result |
|---|---|
| `/` | directory GET of root → `index.html` |
| `/ideas/` | `ideas/index.html` |
| `/ideas/index.html` | same file |
| `/ideas` | miss |
| `/ideas/detail.html` | detail page |
| `/api/organizations/:id/ideas` | API collection |
| `/api/authentication/token` | grant |
| `/assets/` | miss (no `index.html`) |
| `/assets/inter-400.woff2` | that file |
| `/api-documentation/post/` | miss (no `index.html`) |
| `/api-documentation/` | `api-documentation/index.html` |

A miss is one leftover-path rule: document
navigation (`GET` + `Sec-Fetch-Mode: navigate`)
serves `not-found/index.html` when that file
exists; any other miss is 404 JSON
`{ "error": "Not found" }`. Never
`invalid_token` on a non-`/api/` path.

Unsigned `fetch('/api/organizations/:id/ideas')`
stays 401 JSON (401 before 404 on the API).
Unsigned `fetch('/ideas/')` is **200 HTML**, not
401. The pin `'/ideas/ does not become a static
hit'` reverses.

### B. Dispatch (only `server/http-server.ts`)

Order is load-bearing:

1. Path is `/` → treat as directory GET of root
   (`/index.html`).
2. Path starts with `/api/` → strip the `/api`
   prefix, pass the remainder to `handleRequest`.
   Bare `/api` (no trailing segment) is a miss,
   not a strip of everything.
3. Path ends with `/` → if `{path}index.html` is
   an existing file under the static root, serve
   it; else miss.
4. Else if `{path}` is an existing file under the
   static root (`safeStaticPath` + `stat` is-file),
   serve it.
5. Else miss.

`STATIC_EXTENSIONS` is not a classifier. A
Content-Type map may still key off the suffix
after the door has decided to serve a file.

`/api-documentation` is not a special case. It
is step 3 or 4 like every other directory or
file. `/api-documentation` without a slash is a
miss (no such file); `/api-documentation/`
serves `index.html`.

`isAuthenticationPath` on the navigate arm
dies. Grants live under `/api/` and never enter
the static miss path.

Throttle and grant-type sniffing run **after**
the strip, on the resource path, so
`isAuthTokenPath` / `isAuthThrottlePath` keep
seeing `authentication/token`. They do not grow
an `api` segment.

### C. The prenup

`serveStatic` (read stream, MIME, cache-control)
stays the owned wrapper over `node:fs`. If
`http-server.ts` is too loud, extract that helper
beside it in `server/`. Do not import a static
framework.

`safeStaticPath` remains the jail: no `..`, no
escape from the composed root.

### D. Client and cookie

`createHttpFacade` fetches
`origin + '/api/' + resource`. Resources stay
`organizations/:id/ideas` and
`authentication/token`.

`probeRefreshSession` POSTs
`/api/authentication/token` (`credentials:
'same-origin'`, still through
`runSingleFlightRefresh`).

`REFRESH_COOKIE_PATH` becomes
`/api/authentication`. Same narrow grant prefix,
new mount. Not `/api`. Not `/`.

### E. Elevation and scripture

`generate-api-documentation` draws and documents
the **wire**: `/api/` plus the route pattern.
Rooms on disk stay under
`web-app/api-documentation/` (that folder is a
page tree, not the API mount). `./validate`
`--check` fails if `API.svg` / rooms omit the
prefix.

`TEST-PLAN.md` and `CLAUDE.md` say: pages are
`/ideas/` or `/ideas/index.html`; the API is
`/api/…`; the refresh cookie is
`Path=/api/authentication`.

New tests use `no-such-page`, never the retired
product name `snapshots`.

### F. Layers

- `api/` — route table, `handleRequest`, grants,
  derives, stores. Unprefixed resources.
- `shared/` — the chasm. Never imports `api/`.
- `server/` — process and HTTP door. The only
  place that knows the `/api/` mount (plus the
  cookie path string in `api/authentication.ts`,
  which must match the grant URL the browser
  will call).
- `web-app/app/adapters/http-facade.ts` and
  `apex-destination.ts` — prepend `/api/` at the
  client prenup.

`server/throttle.ts` keeps matching
`authentication` + `token`/`authorize` on the
**stripped** path. It does not learn `/api`.

### G. What this retires from four-entry Task 3

The document-navigation arm that served
`not-found` for every non-auth, non-static GET
is replaced by the miss rule in §B. Leftover
human paths still get `not-found/index.html`.
They no longer need an `/authentication`
exclusion.

## Covenant changes (tests that must flip)

- `GET /ideas/` unsigned, no navigate → **200
  HTML** (`ideas/index.html`), not 401 JSON.
- `GET /ideas` → miss (404 JSON, or not-found
  HTML if navigate).
- `GET /api/organizations/:id/ideas` unsigned
  `fetch` → 401 JSON (401 before 404).
- `POST /api/authentication/token` is the
  refresh grant; cookie `Path=/api/authentication`.
- `GET /assets/` → miss.
- `GET /api-documentation/post/` → miss.
- `GET /api-documentation/` → 200 HTML.
- HTTP integration tests that hit `listenHttp`
  for grants or product resources use `/api/…`.
- `handleRequest` unit tests keep unprefixed
  paths.

## Self-review

- No TBD / later / “handle edge cases”.
- `/api` is the mount; routes stay resources.
- Directory miss is one reason: no `index.html`.
- Slashless is not a directory GET.
- Extension is not a classifier.
- Cookie path moves with the grant, not wider.
- Four-entry nits are named as parked, not
  forgotten.

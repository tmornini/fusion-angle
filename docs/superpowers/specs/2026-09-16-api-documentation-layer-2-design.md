# In-place API documentation rooms

- Date: 2026-09-16
- Status: brainstormed in conversation; awaiting
  review
- Worktree:
  `.worktrees/2026-09-16-api-documentation-layer-2`
- Base: master at `dba777d7`
- Ships: in-place hash-routed rooms on the
  `api-documentation` page; generated catalog and
  importable SVG; Layer 2 coverage of the whole
  tree; TEST-PLAN B19 and a walk case for the
  circle click
- Leaves: generated HTML room files as a
  `--check` artifact; live `/api/` comparison;
  PAGE_REGISTRY entries per room

## Problem

`/api-documentation/` is one PAGE_REGISTRY page
(`requiresAuth: false`, sidebar title API). Its
body is an `<object type="image/svg+xml"
data="API.svg">`. Filled circles in that SVG
link to generated verb rooms
(`get/ai-agents/index.html` and the rest of the
tree). A click navigates **inside the object**.
The object then refuses HTML, so the pane goes
blank. The room files on disk are not empty —
they have `h1` / `h2` / `pre` — but Chrome never
shows them in the product chrome.

Layer 1 already gates generator drift
(`generate-api-documentation --check`) and
PAGE_REGISTRY (29 HTML pages, including
`api-documentation/index.html`). TEST-PLAN pins
the tree via AT3, A2 (rooms are not
PAGE_REGISTRY pages), and C2 (sidebar label
API). No Layer 2 case opens
`/api-documentation/` or asserts a circle click
paints a room. B19 lists public pages as
`landing/`, `auth/`, `not-found/`,
`design-system/` and omits `api-documentation`
even though `tests/page-registry.test.ts`
already names it public.

## Goals

- Stay on `/api-documentation/`. A filled-circle
  click swaps the elevation for an app-styled
  room. A status link swaps to that status.
  Back walks status → room → elevation.
- A hash names the view (`#get/ai-agents`,
  `#statuses/200`). Empty hash is the
  elevation. Refresh and share restore that
  view. Browser Back walks hash history.
- Rooms look like the rest of the product
  (tokens, no inline styles).
- The browser never imports `api/routes.ts`.
  The route table stays the surface of record
  via the generator.
- Layer 2 walks every catalog hash and pins the
  circle-click path so the pane cannot go blank
  again.
- Boot does not fetch. The SVG is imported.

## Non-goals

- Comparing a room to a live `/api/` response.
- Retiring the generated HTML room files.
- One PAGE_REGISTRY entry per room, or composing
  those files into the SPA shell.
- HTTP 404 or 5xx for an unknown hash (the
  server never sees `#…`).
- A runtime `fetch` of `API.svg`.
- Changing `./bin/measure` budgets except as a
  follow-up if `readyMs` moves.

## Decisions

1. **In-place on the one page.** Not a
   standalone HTML document. Not a `pushState`
   to the room file path (refresh would serve
   the generated HTML, a different product).
2. **Hash, not a frozen URL.** Empty hash =
   elevation. `#` + catalog id = that room or
   status.
3. **Status links in-place too.** Same painter,
   `#statuses/200`.
4. **App-styled presenter.** Catalog in, SafeHtml
   out. The presenter does not parse the HTML
   room files.
5. **Generated catalog + importable SVG.**
   `generate-api-documentation` writes `rooms.ts`
   and `elevation.ts` next to `API.svg`.
   `index.ts` imports both. `--check` byte-twins
   the generated tree, including those modules.
   `KEPT_ROOT_NAMES` is `index.html`, `index.ts`,
   and `presenter.ts` (hand-written; the
   generator must not delete it). `compose.ts`
   copies `API.svg` and the HTML rooms only —
   skip every `.ts` file, or the site would
   ship TypeScript sources.
6. **Unknown hash is an in-pane miss**, not
   `/not-found/`, not an HTTP 404.
7. **HTML rooms remain.** Layer 1 `--check` and
   static serving stay. Chrome, the sidebar, and
   Layer 2 use only `/api-documentation/` plus a
   hash.

## Hash

`location.hash` without the leading `#` is the
catalog id. Exact match. A trailing slash is a
miss.

| View | Hash id | Example |
|---|---|---|
| Elevation | `''` | `/api-documentation/index.html` or `…#` |
| Verb room | `roomPathOf` minus `/index.html` | `#get/ai-agents` |
| Status | `statuses/` + code | `#statuses/200` |

SVG `<a href>` values become `#get/ai-agents`
(not `get/ai-agents/index.html`). Presenter
status links are `#statuses/200`.

`roomPathOf` still returns
`get/ai-agents/index.html` for the HTML file
tree. A new helper `roomHashOf` is the id.

## Catalog

Generated `web-app/api-documentation/rooms.ts`.
Never hand-edited. Passes `./test lint` (78-col).

```ts
export interface ApiDocRoom {
    readonly hash: string;
    readonly verb: string;
    readonly uri: string;
    readonly body: string;
    readonly headers: readonly string[];
    readonly statuses: readonly string[];
}

export interface ApiDocStatus {
    readonly hash: string;
    readonly code: string;
    readonly body: string;
}

export const API_DOC_ROOMS: readonly ApiDocRoom[];
export const API_DOC_STATUSES: readonly ApiDocStatus[];
```

- `verb` is uppercase (`GET`).
- `uri` is the wire URI (`/api/ai-agents/`).
- `body` is `'none'` or the formatted JSON
  already used by `verbRoomHtml`.
- `headers` is the same list `verbRoomHtml`
  paints (Authorization unless the grant
  routes, Operation-ID, If-Match on locked
  PUT). The generator computes it; the
  presenter does not re-derive grant / lock
  rules.
- `statuses` are the code strings for that
  verb.
- Status `body` is `'empty'` or formatted JSON,
  matching `statusRoomHtml`.

One room per offered verb. One status per
`STATUS_DOCUMENTS` entry. Sort is deterministic
(same as today's file tree).

## SVG module

Generated `web-app/api-documentation/elevation.ts`:

```ts
export const API_ELEVATION_SVG: string;
```

The string equals `svgOf(routes)` — the same
bytes as `API.svg` (already a lone `<svg>…</svg>`,
no XML declaration). Emit as joined short string
literals so the file passes 78-col lint. Do not
`JSON.stringify` the whole SVG on one line.

`index.ts` inserts it with `trusted` + `setHtml`
into `#api-elevation`. No `fetch`.

## Page mounts

`web-app/api-documentation/index.html` (kept,
hand-edited) replaces the `<object>` with:

```html
<div class="api-documentation">
    <div id="api-elevation"></div>
    <div id="api-room" hidden></div>
</div>
```

`#api-room` holds an in-page Back control
(owned by `index.ts`, present for room, status,
and miss) and a child the presenter fills.
Toggle the `hidden` attribute: elevation shown
⇔ room hidden.

## Boot and paint

`init()` is synchronous after module import
(catalog + SVG are static imports). It:

1. `setHtml(#api-elevation, trusted(API_ELEVATION_SVG))`.
2. Listens for `hashchange`.
3. Paints the current hash once.
4. Returns. `page:ready` therefore means the
   elevation or the room is already in the
   pane.

Paint:

- Empty hash: show elevation, hide room.
- Catalog room: hide elevation, show room,
  presenter `roomHtml`.
- Catalog status: hide elevation, show room,
  presenter `statusHtml`.
- Else: hide elevation, show room, presenter
  `unknownHtml`. Heading names the miss. In-page
  Back restores the elevation (`location.hash =
  ''` when there is no in-page previous hash).

The catalog is the only presenter input.

## Back

Browser Back is native hash history. No extra
`pushState`. Circle and status clicks are
ordinary hash links, so they already push.

In-page Back:

- If this document recorded a previous hash
  during this load (a `hashchange` after boot),
  `history.back()`.
- Else `location.hash = ''` (cold open of a
  shared room must not leave the site).

The control label is `Back`, not always
“Elevation”, because a status Back returns to
its room.

## Presenter and CSS

`web-app/api-documentation/presenter.ts`:

- `roomHtml(room): SafeHtml` — heading
  `{verb} {uri}`, Request body, Headers,
  Status links as `#statuses/{code}`.
- `statusHtml(status): SafeHtml` — heading
  is the code; body is `empty` or the JSON.
- `unknownHtml(hash): SafeHtml` — visible miss
  (no Back control; `index.ts` owns that).

Use `html` tagged templates and existing type
classes. No inline styles. No `innerHTML` of
untrusted strings.

`pages-api-documentation.css`:

- `#api-elevation svg { width: 100%; height: auto; }`
- Room spacing, heading, `pre` / lists using
  tokens (`background`, `foreground`, `muted`,
  `border`, radii). Matches the rest of the
  product, not Times-on-white generated HTML.

## Errors

- Unknown hash: in-pane miss (above). Not HTTP
  404. Not `/not-found/`.
- Missing SVG at generate time: `--check` fails.
  No runtime SVG error path.
- Any other `init` throw: existing
  `handlePageLoadError` (“this page failed to
  load” + Try Again).
- Direct navigation to a generated HTML file is
  unchanged (static HTML, or 404 JSON if the
  path is missing). Not the product UI.

## Layer 1 tests

Keep the existing HTML-room and `--check`
assertions. Add:

- `--check` tree includes `rooms.ts` and
  `elevation.ts`.
- `API_ELEVATION_SVG === svgOf(routes)`.
- Every offered verb has a room; every
  `STATUS_DOCUMENTS` code has a status.
- `room.hash === roomHashOf(verb, segments)`.
- SVG `<a href>` values are `#` + that hash.
- Presenter: a fixture room paints the heading,
  body, headers, and status hashes; a fixture
  status paints code and body; `unknownHtml`
  is non-empty.

Update the generator test that currently
asserts `roomPathOf('get', identities) ===
'get/identities/index.html'` — that path
remains the HTML file. New tests cover
`roomHashOf` → `get/identities` and the SVG
href `#get/identities`.

## Layer 2 tests

`tests/browser/api-documentation.test.ts`.
Public page, **no sign-in**: `startOrigin` +
`newPage`, same shape as
`tests/browser/sign-in.test.ts`, not
`withAdminPage`.

`registryUrl(origin.baseUrl, 'api-documentation')`
is the elevation. Append `#get/ai-agents` (etc.)
for a direct hash.

1. **Boot.** Navigate, `page.ready('api-documentation')`.
   `#api-elevation svg` exists. No `object`.
   `#api-room` is hidden. Heading of the
   elevation is the SVG, not a blank pane.
2. **Circle click.** `page.click` a filled
   circle’s `<a>` in `#api-elevation`. Hash
   becomes that room. `#api-room h1` is visible
   (`checkVisibility`) and equals the catalog
   title. `#api-elevation` is hidden. This is
   the blank-page pin.
3. **Status and Back.** From that room, click a
   status hash link. Status heading visible.
   `history.back()` restores the room heading.
   Back again restores the elevation (SVG
   visible, room hidden).
4. **Direct hash.** Navigate to
   `registryUrl(...) + '#get/ai-agents'`. After
   `page:ready`, the room heading is already
   visible (init painted before ready).
5. **Entire tree.** One test: boot once, then
   for every `API_DOC_ROOMS` and
   `API_DOC_STATUSES` entry set
   `location.hash` (no full reload) and wait
   until `#api-room h1` is visible and equals
   that entry’s title (`{verb} {uri}` or the
   status code). Import the catalog in the test
   file. Do not `fetch` `/api/`.
6. **Unknown hash.** Navigate with
   `#not-a-room`. Miss heading visible,
   non-empty. Not a blank pane. Not
   `/not-found/`.

## TEST-PLAN

- **B19** add `api-documentation/` to the public
  page list. Pin the new Layer 2 boot test
  (no redirect to `auth`) in addition to the
  existing PAGE_REGISTRY pin.
- New walk case after **C2** (sidebar already
  names API): open API, elevation visible,
  click a filled circle, room heading visible
  and non-empty. Pin: the Layer 2 circle-click
  test.

## File map

| File | Change |
|---|---|
| `web-app/app/generate-api-documentation.ts` | `roomHashOf`; hash hrefs in SVG; emit `rooms.ts` + `elevation.ts`; `KEPT_ROOT_NAMES` adds `presenter.ts`; headers on the catalog |
| `web-app/app/compose.ts` | skip `.ts` when copying the api-documentation tree |
| `web-app/api-documentation/rooms.ts` | generated catalog |
| `web-app/api-documentation/elevation.ts` | generated SVG string |
| `web-app/api-documentation/API.svg` | same bytes as today except circle `href`s are hashes |
| `web-app/api-documentation/index.html` | mounts; no `<object>` |
| `web-app/api-documentation/index.ts` | import, inline, hash paint, Back |
| `web-app/api-documentation/presenter.ts` | SafeHtml rooms / statuses / miss (kept) |
| `web-app/app/styles/pages-api-documentation.css` | elevation + room |
| `tests/api-documentation-generator.test.ts` | hash hrefs, catalog, SVG module |
| `tests/api-documentation-presenter.test.ts` | presenter unit tests |
| `tests/browser/api-documentation.test.ts` | Layer 2 |
| `TEST-PLAN.md` | B19; C2 follow-on walk case |

HTML verb/status files stay generated with
relative file hrefs. They are not the Chrome
path.

## TDD order

1. Layer 2 boot / circle-click / unknown-hash
   tests (DOM only, no catalog import) go red
   against today’s `<object>` embedding.
2. Generator tests for `roomHashOf`, catalog
   emit, and `elevation.ts` go red, then the
   generator writes those files.
3. Presenter unit tests, then presenter +
   `init` + mounts. Layer 2 boot/click turn
   green.
4. Entire-tree Layer 2 test imports
   `rooms.ts` (the module now exists) and
   walks every hash.
5. TEST-PLAN prose (B19, C2 follow-on).

`./test validate` after each commit.
`./test validate browser` before merge to
master.

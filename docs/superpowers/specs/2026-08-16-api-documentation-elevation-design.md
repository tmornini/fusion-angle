# API Documentation Elevation — Design

Date: 2026-08-16
Status: draft (brainstorm 2026-08-16; awaiting user review)

## Context

`API-TREE.md` is a migration ledger wearing a path costume.
RECONCILED banners, dual-read footnotes, retired flats, and
"is this a POST?" sit on the same lines as live doors. A
consumer cannot take in the HTTP surface the way
`SCHEMA.svg` lets them take in the two tables.

The replacement is a generated elevation plus a statically
served folder of documents. The picture cannot lie. The
rooms behind each verb are one click away. Every status
code is one shape.

## User decisions

1. **SVG**, not a markdown tree.
2. **Live endpoints only.** Retired paths stay in tests
   and `API.md`, not on the drawing.
3. **One URI per line**, full path.
4. **Collections end in `/`.** The live HTTP matches
   that slash. `GET /identities` (no slash) is a miss.
5. **Generated from the route table**, SCHEMA.svg rite.
   `./validate` fails on drift. No hand-inked SVG. No
   separate layout file.
6. **One `API.svg`**, not a forest.
7. Legend says **item or operation**, never "op".
8. **Verb columns** to the left of every URI: one box
   per verb the table offers. A black circle means that
   verb is wired. Empty box means it is not.
9. Each **offered** verb links to a document for that
   verb + URI (fake body, headers, status codes).
10. Each **status code** links to one document for that
    code. Every endpoint that can return it uses that
    shape.
11. The series lives as a **static tree** under
    `web-app/api-documentation/`, served like
    `web-app/design-system/` (public, same origin, in
    the ZIP). Status pages live under `statuses/`.

There is no `web-app/design-document/`. The sibling
that already ships that way is `design-system`.

## Design

### A. What the consumer opens

`web-app/api-documentation/index.html` is generated
with the rest of the tree and registered as a public
PAGE_REGISTRY page (`requiresAuth: false`). Compose
puts it in the ZIP at
`/api-documentation/index.html`. It embeds `API.svg`
as an `<object>` (or inline), never as
`<img src>` — SVG `<a href>` is dead inside an
image.

`API.svg` is the elevation. Wings are first-path-segment
groups. Inside a wing: verb boxes, then the URI,
8.5px monospace, one line each.

`API-TREE.md` is deleted. The `./validate` line-length
exemption that names it is removed with the file.

Root `API.md` stays the implementer catalog (POST
composition, pair formation). The generated HTML is
the consumer surface. A later plan may fold `API.md`
into the folder; this plan does not.

### B. Classification and the trailing slash

The generator reads live patterns from `api/routes.ts`
and the two side-channel routers
(`api/invitations-domain.ts`,
`api/organization-requests.ts`). Retired patterns are
absent because they are absent from those tables.

A route is a **collection** when it lists many of a
thing: GET returns an array, and a sibling item route
exists under it. Drawn and served with a trailing `/`
(`/identities/`, `/identities/:id/tokens/`).

A route is an **item** when the last segment is a
single id or a singleton facet (`/identities/:id`,
`/identities/:id/pii`). No trailing slash.

A route is an **operation** when it is a named verb on
an item (`/ideas/:id/conversion`,
`/identities/:id/tokens/:jti/rotation`). No trailing
slash.

A family with no collection (token-revocations today)
has no collection line.

The same classification drives the HTTP change.
Collection `route()` patterns and every adapter, test,
and docs string that calls them grow the trailing `/`.
`matchRoute` does not alias the slashless spelling.
Authenticated `GET /identities` is 404.
`GET /identities/` is the live collection.

### C. Verb columns

The live table offers five verbs: GET, PUT, POST,
PATCH, DELETE. Every line has those five boxes, in
that order. Each column has one color (design-system
tokens, not raw hex in committed CSS). A filled black
circle means that verb is registered on that pattern.
An empty box means it is not.

The generator takes verbs from the route object's
`get` / `put` / `post` / `patch` / `delete` keys, not
from `MEMBER_VERBS`. The drawing shows what the route
table offers, not who may call it.

### D. Links

SVG `<a href>` wraps each filled circle. The target is
the verb page for that combination, a relative URL
inside the same folder.

Internal `#fragment` links only work inside one SVG.
Verb write-ups and status write-ups are sibling HTML,
not fragments of the drawing.

GitHub's image preview will not click. Opening
`/api-documentation/index.html` on the Node origin
will.

### E. Static tree

```
web-app/api-documentation/
  index.html
  API.svg
  get/identities/index.html
  get/identities/id/index.html
  get/identities/id/pii/index.html
  put/identities/id/pii/index.html
  post/identities/id/tokens/jti/rotation/index.html
  statuses/200/index.html
  statuses/401/index.html
  statuses/403/index.html
  statuses/404/index.html
```

Verb directories are lowercase HTTP methods.
`:param` segments become the param name without the
colon (`id`, `jti`, `sid`). Collection URIs end in a
directory (the trailing slash).

`statuses/` is the English plural. Not `status/`. Not
"statii".

Each verb page holds: the verb + URI, a fake request
body or "none", the headers that matter, and links to
every status that combination can return.

Each `statuses/<code>/index.html` holds the one JSON
(or empty) shape that status always has. Every verb
page that can return 401 points at the same 401 page.
We do not invent a new 401 body per route.

`PAGE_REGISTRY` registers `api-documentation` as
public (`requiresAuth: false`), like `design-system`.
The generator writes `index.html`, `API.svg`, every
verb page, and every status page. The build copies
the whole tree into the ZIP so relative links
resolve on the same origin.

### F. Generator and drift gate

`generate-api-documentation` (sibling of
`generate-schema-svg`) writes `API.svg` and the HTML
tree from the live route table and side-channel
routers. Status-code pages come from a single table of
shapes (one entry per status we actually return).

`./validate` runs `generate-api-documentation --check`
and fails if any committed file in
`web-app/api-documentation/` is not byte-identical to
a fresh generate.

SVG is not prose. Generated HTML wraps at 78 characters
where the formatter can; the drift check is bytes, not
aesthetics.

### G. Tests

Pins, not pixels:

- A known collection is drawn and served with `/`.
- A known item and a known operation are drawn and
  served without `/`.
- A family with no collection has no collection line.
- A retired pattern is absent from `API.svg` and from
  the HTML tree.
- Authenticated `GET /identities` is 404;
  `GET /identities/` is 200 (or whatever the live
  collection status is).
- A filled GET circle's `href` resolves to
  `get/identities/index.html` (and siblings).
- Two routes that 401 both link to `statuses/401/`.
- Offering a sixth verb without adding a sixth column
  fails the generator (column count is the verb
  alphabet).

Adapters and fixtures move with the slash in the same
plan.

### H. Out of scope

- Retired flats on the drawing
- TARGET-STATE wishes (`/identities/:id/notifications`)
- HTML *page* paths (`identity-providers/index.html`)
- Authz / member-tier coloring
- Folding `API.md` into the generated tree
- Changing `SCHEMA.svg`
- Making GitHub's SVG image preview clickable

## Risks

- Trailing-slash HTTP is a wide string change
  (routes, adapters, tests, `API.md`). It is load-bearing
  for the picture. One plan, one voice.
- Classify-from-handlers can mis-label a singleton GET
  that returns an array. The pin list names the known
  families; a mis-class is a test failure, not a guess
  left in the SVG.
- `compose.ts` today writes only PAGE_REGISTRY
  `sourceFile.html`. The build must copy the rest of
  `api-documentation/` or those rooms 404 on the ZIP.

## Success

A consumer opens `/api-documentation/index.html`, sees
the building, clicks a circle, reads the fake body and
the status list, clicks `401`, and sees the one 401
shape. They never read RECONCILED. `./validate` fails
if the drawing or a room drifts from the route table.

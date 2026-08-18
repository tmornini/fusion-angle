# API Documentation Elevation — Design

Date: 2026-08-16
Revised: 2026-08-18
Status: draft (interview 2026-08-16–18; awaiting
user review of this file)

Vocabulary: **organization** (never “org”),
**collection** (bucket, trailing `/`), **item**,
**operation**, **etag** (path token on a snapshot
door). This file is spec, not an implementation
plan.

## Context

`API-TREE.md` is a migration ledger wearing a path
costume. RECONCILED banners, dual-read footnotes,
retired flats, and “is this a POST?” sit on the same
lines as live doors. A consumer cannot take in the
HTTP surface the way `SCHEMA.svg` lets them take in
the two tables.

The replacement is a generated elevation plus a
statically served folder of documents. The picture
cannot lie because it is generated from the route
table, and the route table is the whole live
surface.

## User decisions

1. **SVG**, not a markdown tree. One `API.svg`.
2. **Live endpoints only.** Retired paths stay in
   tests and `API.md`, not on the drawing.
3. **One URI per line**, full path.
4. **Collections end in `/`.** The live HTTP matches
   that slash. Wrong slash is a miss.
5. **Generated from the route table**, SCHEMA.svg
   rite. `./validate` fails on drift. No hand-inked
   SVG. No separate layout file. No side-channel
   reader: if it is not on `routes[]`, it does not
   exist.
6. Legend says **item or operation**, never “op”.
7. **Verb columns** to the left of every URI: GET,
   PUT, POST, PATCH, DELETE. A black circle means
   that verb is a key on the route object. Empty box
   means it is not. Not `MEMBER_VERBS`.
8. Each **offered** verb links to a document for
   that verb + URI (fake body from the gate
   validator, headers that matter, status codes
   declared on the route or handler).
9. Each **status code** links to one document.
   Every endpoint that can return it uses that
   shape.
10. The series lives under
    `web-app/api-documentation/`, served like
    `design-system` (public, same origin, in the
    ZIP). Status pages live under `statuses/`.
11. Only `/api-documentation/index.html` is a
    composed `PAGE_REGISTRY` page (sidebar, public,
    in the nav). Verb rooms and status rooms are
    bare documents.

There is no `web-app/design-document/`.

## Laws

### The table is the surface

`handleRequest` matches `routes[]` and dispatches.
There is no pre-match if-tree for invitations,
the slashless organizations list,
default-organization, or authentication POST.
Those doors are `route()` rows with the verbs
they offer.

`route('authentication/token', {})` is a lie. It
grows a real `post` key. Same for authorize.

There is no catch-all organization facade. An
unmatched `/organizations/:id/…` is a miss, not a
rewrite onto a flat path. `/organizations/:id/identities`
and `/organizations/:id/authentication/token` are
not doors.

### Slash

`matchRoute` does not alias the slash. After
`pathname` split, a trailing `/` is significant.

- Collection with `/` — live.
- Collection without `/` — 404 (once
  authenticated; unsigned is still 401).
- Item or operation with `/` — 404.
- Item or operation without `/` — live.

Static docs rhyme: a collection directory serves
`index.html`. That is the rooms tree, not
`matchRoute`.

### Collection, item, operation

A **collection** is a bucket. Items live at
`…/collection/:id`. `GET …/collection/` returns
some or all items (query string may filter;
almost unused today). A document whose body is
an array is still a document, not a collection.

An **item** is one thing or a singleton facet
(`/identities/:id`, `/identities/:id/pii`). No
trailing slash.

An **operation** is a named verb on an item
(`…/ideas/:id/conversion`,
`…/tokens/:jti/rotation`). No trailing slash.
Invitation accept / decline / revoke are **not**
operations; see Invitations.

### Versions

Every normal item in this spec offers:

- `GET …/:id/versions/` — array of the **same
  shape** as one element of `GET …/collection/`.
- `GET …/:id/versions/:etag` — one snapshot.
  The path token is the strong ETag (today’s
  `:version` column hash). Honest name:
  `:etag`.

### Membership and “mine”

Membership is how an organization **authorizes**
an identity. It is not a bond between two
identities.

Anything that means “this identity’s” lives
under `/identities/:id/…`.

### No `GET /organizations/`

That collection GET does not exist. The list of
organizations that have authorized an identity
is `GET /identities/:id/organizations/`.

The organization **document** is
`GET|PUT /organizations/:id` plus the versions
pair. Two seats are two authorizations of one
document. The document is not a child of an
identity, so it is not stored under one.

### Trio

Trio (`state_at`, `state_event_id` stamped on
the document) dies on ideas, projects,
objectives, and record-types. Those fields are
ledger facts (the pair, the etag, `./versions/`).
Domain `state` may stay on the body when it
names the thing (`submitted`, invitation
`pending`).

Do not add trio to identities, ai-agents,
organizations, members, or invitations.

Flow trio and work-order history wait; see
Deferred.

## HTTP surface this spec moves

### Normal collections (this spec)

```
GET          …/collection/
GET|PUT      …/collection/:id
GET          …/collection/:id/versions/
GET          …/collection/:id/versions/:etag
```

| Family | Collection | Notes |
|---|---|---|
| identities | `/identities/` | Global. Already almost this; add slash, versions list, rename snapshot to `:etag`. |
| ai-agents | `/ai-agents/` | Same. |
| members | `/organizations/:id/members/` | Seat. `DELETE` stays. Add versions pair. |
| invitations (send) | `/organizations/:id/invitations/` | Admin of `:id`. `POST` grants. |
| invitations (receive) | `/identities/:id/invitations/` | Self or admin. Invitee has no seat yet, so they cannot use the organization nest. |
| identity → organizations | `/identities/:id/organizations/` | Inverse of seats. Not a second organization document. |

One invitation is one document (storage prefix
may stay `/invitations/`). Two HTTP nestings
are filters and authorization, not two
documents. No `/sent`. No
`POST …/acceptance|decline|revocation`.
`POST` on the sending collection grants
(`pending`). `PUT` on the item is the
transition: identity nest may set `accepted` or
`declined` from `pending`; organization nest
may set `revoked` from `pending`; otherwise
403 / 409. `./versions/` on **both** nestings.

### Organization item (no root list)

```
GET|PUT  /organizations/:id
GET      /organizations/:id/versions/
GET      /organizations/:id/versions/:etag
```

No `GET /organizations/`. Create remains PUT on
id if that is today’s genesis.

### Organization-nested product families

Delete the flat HTTP doors `/ideas`,
`/projects`, `/flows`, `/objectives`,
`/work-orders`, `/record-types`, and their
children. They live only at
`/organizations/:id/…`. Flow **trio and
version payload** stay as they are (Deferred).
Only the path prefix moves.

The token’s organization must equal the path
organization or the response is 403 with the
existing fixed body. The handler never takes
the tenant from the path; `uri_collection`
uses the fenced token organization. The path
segment is a check, not a selector.

`GET /ideas/` is not a thing.

Ideas, projects, objectives, record-types:
drop `state_at` and `state_event_id` from the
document. `GET …/:id/versions/` becomes an
array of the collection item shape. Keep
domain `state` where it is a field of the
thing.

### Auth and facets

`POST /authentication/token` and
`POST /authentication/authorize` are table
routes with a `post` key. Pair formation may
stay inside the grant; the offer is on the
table.

`GET|PUT /identities/:id/default-organization`
is a table route (singleton item). Same
self-only guard as today.

PII, credentials, tokens, providers, token-
revocations stay facets / ledgers under the
identity. This spec does not invent a
collection GET for token-revocations.
`:rid` is the revocation event’s id.

### Deleted in this spec

- Catch-all facade rematch.
- Flat organization-nested HTTP.
- `GET /invitations/sent` (and any
  `/received`).
- Named invitation POST operations.
- Unscoped `GET /invitations/` meaning “mine”.
- Unscoped `GET /organizations/` and the
  slashless side-channel list.
- Bulk `GET …/work-orders/history` (every
  work-order event in the organization).
- Bulk `GET …/objectives/versions`.
- `API-TREE.md` and its `./validate`
  line-length exemption.

Callers of those bulks (workbox inbox) use
the per-item door. Work-order per-item stays
`GET …/work-orders/:id/history` until
Deferred.

## Elevation

### What the consumer opens

`web-app/api-documentation/index.html` is
generated and registered as a public
`PAGE_REGISTRY` page (`requiresAuth: false`,
sidebar, `inSidebarNav: true`), like
`design-system`. Compose puts it in the ZIP at
`/api-documentation/index.html`. It embeds
`API.svg` as an `<object>` (or inline), never
as `<img src>` — SVG `<a href>` is dead inside
an image.

`API.svg` is the elevation. Wings are
first-path-segment groups. Inside a wing: verb
boxes, then the URI, 8.5px monospace, one line
each.

`/identities/:id/invitations/` sits in the
identities wing. `/organizations/:id/invitations/`
sits in the organizations wing. Same document,
two lines, one rule.

`API.md` stays the implementer catalog. Folding
it into the folder is out of scope.

### Verb columns and links

Five boxes, GET PUT POST PATCH DELETE. Filled
circle links to the verb room, a relative URL
in the same folder. Status links go to
`statuses/<code>/`. GitHub’s image preview
will not click. The Node origin will.

### Static tree

```
web-app/api-documentation/
  index.html
  API.svg
  get/identities/index.html
  get/identities/id/index.html
  get/identities/id/versions/index.html
  get/identities/id/versions/etag/index.html
  get/organizations/id/ideas/index.html
  post/organizations/id/invitations/index.html
  get/identities/id/invitations/index.html
  statuses/200/index.html
  statuses/401/index.html
```

Verb directories are lowercase HTTP methods.
`:param` segments become the name without the
colon. Collection URIs end in a directory.
`statuses/` is the English plural.

Each verb page: verb + URI, fake request body
or “none” (from the validator that already
sits at the gate), headers that matter, links
to every status that combination declares.

Each `statuses/<code>/index.html` is the one
JSON (or empty) shape that status always has.

The generator writes the whole tree. The build
copies it into the ZIP. `compose.ts` today
writes only `PAGE_REGISTRY` `sourceFile.html`;
the rest of the folder must be copied or the
rooms 404.

### Generator and drift gate

`generate-api-documentation` (sibling of
`generate-schema-svg`) reads `routes[]` only.
Status-code pages come from the declared
status alphabet (one entry per status we
actually return). `--check` requires
byte-identity with a fresh generate.
`./validate` runs that check.

A sixth verb without a sixth column fails the
generator.

### Tests (pins, not pixels)

- A known collection is drawn and served with
  `/`. Slashless collection is 404 when
  authenticated.
- A known item and a known operation are
  drawn and served without `/`. Trailing
  slash on either is 404.
- A retired pattern is absent.
- A filled circle’s `href` resolves to the
  matching room.
- Two routes that 401 both link to
  `statuses/401/`.
- Empty `route('authentication/token', {})`
  cannot survive: the table offers POST.
- `/organizations/:id/identities` is 404
  (authenticated).
- `GET /organizations` and
  `GET /organizations/` are not a live
  collection.
- `GET /identities/:id/organizations/` is
  the authorized-organization list.
- Invitation `/sent` and named POST
  operations are absent. `PUT` on each nest
  is the transition.
- Ideas document JSON has no `state_at` or
  `state_event_id`.
- Work-order per-item history is still
  `/history`, not `/versions/`.
- Flow trio is untouched.

Adapters and fixtures move with the slash and
the new paths in the same implementation
work.

## Deferred

One later bundle (not this spec):

1. **Work-order and flow work.** Work orders
   have neither `./versions/` nor
   `./versions/:etag`. Per-item `/history`
   stays until that payload is the collection
   item shape (today it is `StateEntity` plus
   `field_values`, and a different `state`
   alphabet). Flow trio and flow version
   work wait here too.
2. **Other missing version pairs** this spec
   does not name (credentials, tokens, tags,
   scores, …) unless a family is listed
   above as a normal collection.
3. Folding `API.md` into the generated tree.
4. Query filters beyond invitation `state`
   if a caller needs them.

## Out of scope

- Retired flats on the drawing
- TARGET-STATE wishes
  (`/identities/:id/notifications`)
- HTML *page* paths
  (`identity-providers/index.html`)
- Authz / member-tier coloring on the SVG
- Changing `SCHEMA.svg`
- Making GitHub’s SVG image preview
  clickable
- Doing the deferred bundle

## Risks

- Trailing-slash HTTP plus path moves
  (flats → `/organizations/:id/…`,
  invitations dual-nest, identity →
  organizations) is a wide string change.
  The picture is generated from the table,
  so the table must move first.
- `GET …/:id/versions/` changing from
  `StateEntity[]` to the collection item
  shape on ideas / projects / objectives /
  record-types will break callers of the
  old list. Those callers move in this
  spec.
- `compose.ts` must copy the rooms tree or
  the ZIP 404s the rooms.

## Success

A consumer opens `/api-documentation/index.html`,
sees the building, clicks a circle, reads the
fake body and the status list, clicks `401`,
and sees the one 401 shape. They never read
RECONCILED.

The table matches the drawing. Wrong slash
misses. Flat `/ideas` misses. The facade
cannot invent a door. Trio metadata is gone
from the families this spec names.
`./validate` fails if the drawing or a room
drifts from the route table.

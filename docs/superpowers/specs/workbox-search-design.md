# Workbox search

Branch and worktree `workbox-search`.

## Intent

A person in the workbox finds a work order by typing any
fragment of anything they know about it — a word of the
flow name, a misspelled state name, the eight-hex
display id, a UUID pasted from a URL, a value on the
record the work order is bound to. One search box sits
over both workbox lists and narrows them together.

Search moves to the server. The server already enforces
who may read what, and it already holds every field a
search must look at, so the browser loads nothing extra
to search and can match nothing it could not read.

One matcher serves every search in the app: a
Levenshtein-tolerant word matcher, written fresh for
this repository. The top-bar search, the workbox, and
the Members page all use it.

## Prerequisite

The work-orders GETs serve each head whole
(`reader: { sees: 'whole' }`), including
`events[].field_values`, so a value the attribute rule
hides on the record instance GET reaches the caller
through `/work-orders/`. That leak is fixed first, as
its own unit, before this one plans. This unit's
work-orders QUERY then serves heads through the fixed
reader.

## Goals

- A shared matcher in `shared/`, built on a Levenshtein
  distance function written here (there is none in the
  repository; the React-era lockfiles carried one only
  as a transitive dependency).
- `QUERY` (RFC 10008) on three resources:
  - `/api/organizations/:id` — the top bar (the
    organization document's existing path; it has no
    trailing slash, and `matchRoute` counts segments);
  - `/api/organizations/:id/work-orders/` — the workbox;
  - `/api/organizations/:id/memberships/` — the Members
    page.
- A search box on the workbox page, between the
  "Workbox" title and "+ Create Work Order".
- The Members page filter switches from its in-browser
  substring match to the memberships `QUERY`.
- The top bar switches from its in-browser substring
  match to the organization-root `QUERY` for its data,
  and to the shared matcher for its page names.
- Every id is searchable: each entity's own id and every
  id it joins to.
- On a phone the workbox lists stack with "claimed by
  me" on top.
- Two TODO.md entries (see "TODO.md").

## Non-goals

- New entity kinds in the top bar. It searches what it
  searches today — ideas, projects, members, pages. The
  expansion to every authorized entity, flows included,
  is a TODO.md entry.
- Searching field NAMES (attribute names). Only values
  and ids.
- Phone drag. TODO.md entry.
- Persisting the query in the URL.
- Server-side search of pages. Pages are the app's own
  registry, not stored data; the browser matches them
  with the shared matcher.

## Anti-goals

- A search that matches on a field the caller's GET of
  the same resource would not show them. That is a
  cross-tenant or cross-role oracle: a non-empty result
  for "salary 90000" discloses a value the caller cannot
  read. Search sees exactly what the matching GET would
  serve — the organization fence, membership roles, the
  attribute rule on record values (the instance GETs'
  `instanceReader` → `keptValues` with `rolesCanRead`,
  `api/served-response.ts:241-262`), and PII erasure on
  members. Where a searched field comes from a GET other
  than the queried resource's own, that field obeys the
  rule of the GET that serves it.
- A typo-blind search. "aproval" must find "Approval".
- A fuzzy search that loses exact hits. Anything a
  case-insensitive substring search finds today, the new
  search still finds.

## The matcher

`shared/` holds two pure functions and their tests.

- `levenshteinDistance(a, b)` — the classic edit
  distance (insert, delete, substitute; unit cost). Pure,
  no options.
- A matcher that scores one query against one item's
  searchable text.

Rules, as agreed:

- Lowercase both sides. Split the query and the item text
  into words on whitespace and punctuation. Ids are words
  too: a UUID splits at its hyphens, so a pasted whole
  UUID and any of its groups both match.
- A query word matches an item word when the item word
  starts with it (prefix), or when their Levenshtein
  distance is within the word's tolerance: 1 edit for a
  short query word, 2 for a longer one.
- Every query word must match some item word, or the item
  does not match.
- Rank: an item whose words all match exactly or by
  prefix ranks above one that needed an edit; fewer total
  edits rank higher.
- Whatever a case-insensitive substring search on the
  same text finds still matches. A query word found as a
  substring of the item text matches with zero edits.
- An empty or whitespace-only query matches nothing at
  the matcher; callers treat an empty query as "no
  filter" and never call it.

Left to the builder: the short/long word length cut
(name it as a constant), the tie-break after edit count
(stable by the resource's own GET order is the default),
and the tokenizer's exact punctuation set.

## The QUERY method

RFC 10008 defines `QUERY`: safe, idempotent, with a
request body. `Deno.serve` and `fetch` both carry it —
a probe (`Deno.serve` echoing `r.method` and the body;
`fetch(…, { method: 'QUERY', body })`) answered
`200 QUERY {"q":"a"}`. `SEARCH` is WebDAV's (RFC 5323)
and is not used.

- Request: `Content-Type: application/json`, body
  `{ "q": "<text>" }`. A missing or non-string `q`, or a
  non-object body, is 400 at the gate, as a malformed
  write body is today. The request needs a bearer, like
  the GET of the same resource. The URL's query string
  means what it means on the GET (memberships keeps
  `?state=accepted|removed`, default accepted).
- Response (my call): exactly a collection GET's
  format — `multipart/mixed`, one stored response per
  matching head, served through the same reader, in
  best-match order; 204 when nothing matches
  (`api/head-reads.ts` `servedCollection`). The client
  parses each part into an `HttpMessage` as
  `GETCollection` does, so `toWorkOrder` and the
  membership parsing apply unchanged, and a drag on a
  search result latches the message it holds.
- The organization root answers the same format with
  parts of several kinds; each part's stored response
  carries its own document path, which names its kind.
  Parts are grouped by kind in the palette's order
  (ideas, projects, members), best first within each.
  The organization route's own `select` answers only
  the organization document, so this QUERY gets its own
  selection over the idea, project, and member
  collections.
- `Cache-Control` matches the GET of the same resource.
- Authorization is the GET's: the organization fence in
  `api/api.ts` (foreign path 403), membership roles, and
  the per-family read rules. A QUERY never discloses
  more than the GET.
- API.md and the generated API documentation
  (`./test api-docs`) list the three QUERY routes.

The route table's existing `query` slot
(`api/routes.ts`, `Route.query`) parses a GET's query
string into a `ViewQuery`; it is not this. The new
handler takes another name. Where a route's `select`
already selects the searched heads (memberships, work
orders), the QUERY reuses it for the fence and the
selection, then joins what the search text needs and
filters and orders with the matcher, so the fence is
not written twice.

The client gains a transport verb for QUERY beside its
`GETCollection`, and domain verbs that follow the
repository's adapter naming, one per resource. The
builder names them; `RequestContext` is the first
argument. No transport verb takes an `AbortSignal`
today (`client/request-context.ts`); the page drops a
stale answer (a sequence number per search) rather than
widening the transport (my call).

## What each resource searches

Every id is searchable — the entity's own id and every
id it joins to — and every field a person might search
by.

**Work order** (`/work-orders/`):

- id (UUID) and display id (the 8-hex SHA-256 prefix
  shown as `#a7c3e1f9`);
- the flow it was created from: the name frozen into
  its `flow_graph` (what the card shows), and the flow's
  id and current name through the
  `flows/:id/work-orders/` join (the work order stores
  no flow id);
- current state: node id, state name, task
  instructions;
- the last transition's member id and name, and the
  claimant's member id and name when claimed;
- the bound record, when bound: record type id, instance
  id, and every value the caller may read.

**Membership** (`/memberships/`): its own id, the member
id, the identity id, kind, membership state, role, and
everything the Members page shows and searches today
(`client/members-union.ts:46-145`,
`shared/types.ts:738, 838, 886`): a human's name and
email (unless erased) and profile title and department;
an AI or service member's name and description. The
memberships GET's own join carries only
`identity_kind`, `invitee_name`, and `invitee_email`
(`api/invitations-domain.ts:490-521`), so the QUERY
joins the `ai-agents/`, `services/`, PII, and
`identities/:id` documents, each field under the rule
of the GET that serves it — a title the caller's
`identities/:id` GET would refuse is not searched.

**Organization root**: the idea, project, and member
fields the top bar carries today (`ideaToSearchItem`,
`projectToSearchItem`, `humanMemberToSearchItem` in
`web-app/app/command-palette.ts`), plus every id each
one carries and joins to. It searches every member,
not the first six humans with a department the palette
indexes today (`client/members.ts:177-192`) (my call).

The builder audits each entity's representation and
lists, in the plan, the fields it adds; anything a
person would type to find that thing belongs.

## The workbox page

Layout (approved in mockups):

- The page header becomes three columns: "Workbox"
  left, the search box centered, the button right. The
  box is centered on the page — over the gap between
  the two lists — and is 30rem wide, 1.5× the top bar's
  20rem.
- The box reuses the top bar's classes:
  `.search-wrapper`, `.search-icon`, `.search-input`
  (`web-app/app/styles/layout.css:169-192`), as the
  Members page does. Width comes from a class, never an
  inline style.
- Below the mobile breakpoint the box takes its own
  full-width row under the title and button, and the
  lists stack with "Work Orders claimed by me" above
  "Work Orders available to me". The reading and tab
  order follows the visual order at each width. CSS
  order cannot move tab order and the DOM puts
  "available" first, so the page moves the claimed card
  ahead of it on a `matchMedia` change at the mobile
  breakpoint and back above it (my call).
- The input has an accessible name ("Search work
  orders").

Behavior:

- Empty box: the lists are exactly today's lists, in
  today's orders, from today's GET (`buildInboxItems`
  sorts available by time ascending, claimed by
  position, archived by time descending,
  `web-app/app/presenters/workbox-inbox.ts:285-320`).
- Typing: after a short pause the page sends one QUERY;
  an answer to an older search is dropped. The page
  splits the answer into "available to me" and the right
  list by the same membership rules `buildInboxItems`
  applies, but keeps the QUERY's best-match order rather
  than re-sorting, so both lists narrow at once.
- The right list filters whichever of Active and
  Archived by Me is pressed; switching keeps the text.
- Order while filtering: best match first, not dragged
  order.
- Drag while filtering: a drag BETWEEN the lists (claim,
  release) still works. A drag WITHIN a list does not
  reorder; the card stays where its match puts it.
  Clearing the box restores dragged order.
- A claim by drag while filtering takes the bottom of
  the FULL claimed order (after the highest position
  held), not a slot among the visible subset, whose
  positions are out of order (my call). After the drop
  the page re-runs the QUERY to repaint.
- No matches in a list: it says "No work orders match
  “…”" instead of the plain empty copy.
- Escape in the box, or deleting the text, clears the
  filter.
- A work-order change in this tab (the existing
  `subscribeWorkOrderChanges` bell) re-runs the current
  QUERY when the box has text, and today's GET when it
  is empty.
- A failed QUERY shows the page's existing error
  treatment for a failed load; it never shows the
  unfiltered lists as if they were results.

## The Members page

`#member-search` sends the memberships QUERY instead of
filtering `membersState` in the browser. The kind chips
(All, human, AI, service) and the accepted/removed
toggle still filter, applied to the QUERY's answer. The
`matchesSearch` methods on the member row presenters and
`applyManagedMembersSearch`'s substring path retire.
The page's sections (You, Humans, AIs, Services) stay;
within each, results order best match first while the
box has text (my call). With the removed toggle on, the
QUERY carries `?state=removed`, as the GET does.

## The top bar

The command palette's data comes from the
organization-root QUERY; its page names match through
the shared matcher in the browser. `searchItems`'
substring filter retires. Results stay grouped by
category in today's order (ideas, projects, members,
pages), best first within each group, so no score need
cross the wire. With an empty query the palette shows
what it shows today, from the GETs it uses today
(`command-palette.ts:266-275, 304-334`).

## TODO.md

Add to "Later work":

1. Top-bar search over every entity the caller is
   authorized for — flows, work orders, record types,
   records, and whatever else the API serves — through
   the organization-root QUERY, every field and id.
2. Phone drag in the workbox. On a touch screen a
   finger moving over a card scrolls the page and the
   browser cancels the drag (`pointercancel`):
   `web-app/app/workbox-inbox-drag.ts` uses pointer
   events with no `touch-action` and no long-press, and
   nothing scrolls the page while dragging, so a card low
   in "available to me" cannot reach "claimed by me" at
   the top. Needs press-and-hold to pick up and edge
   auto-scroll. (Read from the code; not yet observed on
   a device.)

## Verification

- `shared/` matcher and distance: unit tests on the
  rules above — prefix, 1- and 2-edit tolerance, every
  word required, substring superset, ranking.
- Each QUERY route: memory-suite tests through the HTTP
  surface — matches, ranking, 400 on a bad body, 403 on
  a foreign path, and no match on a field the caller's
  GET would hide (an ACL-hidden record value, an erased
  member's email).
- `./test postgres` carries the routes on the Postgres
  backend.
- `./test browser`: the workbox box narrows both lists,
  clears on Escape, and the Members box narrows the
  roster.

## Left to the builder

- Names: the QUERY route slot, client verbs, constants.
- The word-length cut for 1 vs 2 edits.
- The typing pause length.
- The organization-root response envelope.
- Where the three-column header CSS lives
  (`pages-workbox.css` or the shared layout sheet), per
  DESIGN-SYSTEM.md.

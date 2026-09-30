# A head read serves the stored response

- Date: 2026-09-30
- Status: design and its nine writing-time calls
  confirmed by the owner, pre-plan
- Worktree: `.worktrees/head-reads`
- Base: `ledger-store` at `c1bbc724`
- Ships: every read of a head served as its stored
  response through one function, a collection as
  `multipart/mixed` of those responses, a deleted
  document answering 410, the skip walk, the client
  keeping each response whole as `HttpMessage<T>`,
  and every write from a held message latched
- Defers: version and history reads, the four
  invitation reads, and `former-members/` (item 1's
  fourth spec, where the ARCHITECTURE covenant
  lands); work-order events as a sub-collection
  (its fifth); the retries bullet; writes to a
  deleted name
- Witness: `measurements/probes/mock-data/head-etag.ts`;
  `./test` timed before and after; the operator's
  before-and-after `./bin/measure --record
  --visualize`, gating nothing

## Problem

A head's stored response is the document's whole
state since state by PUT, and no read serves it.
Seventy-four routes carry a GET. Twelve go through
two functions that take the stored response apart:
a document GET keeps the body octets and rebuilds
three headers, dropping `operation-id` on purpose
(`streamGetFromStored`, `api/message-pair.ts:710-737`),
and a collection GET parses every head into an array
of bodies and serializes the array again
(`entitiesOf`, `api/message-store.ts:59-68`;
`api/api.ts:1752-1767`). The other sixty-two run a
handler that derives an object and hands it to
`Response.json` (`api/api.ts:992`). A third function
already serves a stored head nearly whole, and only
the write path calls it (`responseFromHead`,
`api/message-pair.ts:645-681`). A fourth transforms a
body through a callback any handler may supply
(`projectedResponse`, `:1404-1419`).

The reads disagree about what a head says. A flow's
GET adds a field stored nowhere and drops five that
are (`api/derive-flows.ts:100-118`). A credential's
drops `secret`. The default organization's drops
`id`. A head whose body says `deleted` answers 200
for ideas, projects, and objectives and 404 for
flows and record types. Nine collections order by
id, six by stamp, one by a body field.

The client then parts what is left. `unwrapResponse`
keeps the body and `etagFromHeader` picks one header
(`client/http-facade.ts:92-111`, `:133-148`), so the
transport needs ten methods to say which parts a
caller wants, and a second copy of both lives in
`api/api.ts` for tests (`:1550-1585`, `:1788-1803`).
No list item carries an `etag`, so eight calls read a
document only to learn its tag, and twenty PUTs send
no `If-Match` and overwrite whatever is stored.

This is item 1's third spec (`TODO.md:455-642`): the
read side of heads.

## Axiom

A read serves what was stored, and whoever holds a
response holds all of it.

## Decisions

1. **ONE function serves a head.** It takes the
   head's stored response, this transmission's
   `date` and `request-id`, and the reader's roles
   with the family's declared read roles, and
   returns the response as wire text: the status
   line 200, the two lines substituted, every other
   stored line kept — `etag`, `content-type`,
   `operation-id` — and the body octets untouched
   unless the projection drops a field. It is
   `servedResponse`, in `api/served-response.ts`,
   and it transforms a body only by calling
   `projectedBody`, beside it.
   `streamGetFromStored`, `responseFromHead`, and
   `projectedResponse` retire into the two. §2.

2. **Selection may be computed; a part may not.** A
   collection chooses its heads by path, join,
   filter, or union. Each part is the response that
   head's document GET serves. No read adds, drops,
   or renames a field, the projection excepted. §1.

3. **Projection is declared, never coded.** The
   function takes data, which fields and which
   roles, never a callback. Two forms exist: a
   record instance's `values`, read roles by
   attribute as today, and a top-level key with its
   read roles. A key whose read roles are empty is
   served to no reader, admin included; that is
   `secret` on a credential. Write answers go
   through the same function. §3.

4. **A collection is `multipart/mixed`**, each part
   `application/http; msgtype=response`, the
   boundary a fresh UUID, framed by `content-length`
   and never by scanning, ordered `response_at, id`
   in every collection. An empty collection answers
   204. §4.

5. **A deleted document is Gone.** A DELETE head,
   and a head whose body says state `deleted` in a
   family that declares a lifecycle, answer 410 on
   GET after the fence and are no part of a
   collection, in every family. Writes to a deleted
   name are unchanged. §5.

6. **The skip walk reads a collection's heads** on
   Postgres, one probe per document, under an
   `EXPLAIN` pin. The memory backend is untouched.
   §6.

7. **`HttpMessage<T>` is the whole response on the
   client.** The class in `shared/http-message`
   gains a type parameter for its decoded body,
   defaulting to `unknown`, and `Body` gains the
   one conversion its family lacks: a page reads
   `message.body().toValue()`. No wrapper class
   exists, the message gains no accessor, and
   `Unit` names no identifier. §7.

8. **The transport keeps the message whole.** One
   method per verb, each returning an
   `HttpMessage<T>`, one for a collection returning
   an array of them through the splitter, and the
   credential doors' POST. It reads bytes, never
   text. An error carries the response it was
   answered. §8.

9. **What crosses into the app is a message or
   holds one.** A verb returns the message, or a
   value built from one that keeps it. The three
   shapes that cross today are not unified. §9.

10. **Every write from a held message latches.** A
    write verb takes the message the page holds,
    and the transport reads the tag from it. The
    app never holds an entity-tag as a string. The
    calls that read only to learn a tag retire. §9.

11. **Undo asks the ledger.** The designer reads
    `…/flows/:id/versions/` and shows Undo when it
    answers more than one row. §10.

12. **Tests run the client's one path.** The
    in-process transport is a `fetch` that calls
    `handleRequest`; the copy of the transport in
    `api/api.ts` retires. §11.

13. **A census pins what is still parted.** One
    test names the thirty GET routes that still
    answer handler JSON. The covenant
    `## A response is one unit` lands with the spec
    that empties that list, its approved wording
    unchanged, and not here. §12.

14. **`ETag` stays on a PUT response.** RFC 9110
    §9.3.4 withholds a validator from a PUT whose
    stored representation differs from what was
    sent, to keep a client from taking its own
    bytes for the representation. The response
    carries the representation, so the tag names
    what was sent back.

15. **Carried in, and not reopened.** Item 0's
    canonical form and credential hoist. State by
    PUT's whole state by family, its three attempt
    classes, its former, and its no-op. The client
    spec's layout, instance, and oracle. The bell
    per inserted row. The retries bullet's two
    recovery layers.

## Found on the base

1. **Seventy-four GET routes, twelve stream-served.**
   Six documents and six collections take the
   stream path (`api/api.ts:974-990`); sixty-two run
   a handler (`:992`). None reads a query parameter
   and none paginates: matching uses the pathname
   alone.
2. **Four functions shape a served body.**
   `streamGetFromStored`, `responseFromHead`,
   `entitiesOf`, and `projectedResponse`, the last
   over a callback type (`StateProjection`,
   `api/message-pair.ts:1005`).
3. **Every head a read could serve names itself.**
   On the seeded memory ledger, 2,317 pairs and 579
   PUT heads: all 579 carry a body, 578 carry their
   own pair id in the stored `etag` line, and 578
   carry a `content-type`
   (`measurements/probes/mock-data/head-etag.ts`).
   The head that names another pair is a work
   order's `binding/`, whose response answers the
   parent's state; the head with no `content-type`
   is `/migrations/0000-root`. No GET serves
   either.
4. **The seed holds no deleted document.** Zero
   DELETE heads and zero heads whose body says
   `deleted`, by the same probe. Every tombstone
   test builds its own.
5. **A handler's body differs from the stored body
   by key order.** A handler emits `id` first
   through `Response.json`; the store sorts keys.
   Values agree. No test compares octets on those
   routes, so nothing pins either order.
6. **Three answers to a deleted head.** A stream
   family serves a state-`deleted` head 200 and
   lists it (`tests/drift-projects.test.ts:326-427`);
   flows and record types answer 404 and omit it
   (`documentIsTombstone`,
   `api/derive-documents.ts:164-170`); a retired
   record instance answers 410
   (`api/routes.ts:3501-3513`). State by PUT's
   finding 16 cites `api/api.ts:2054-2066` for the
   first; the code is at `:1730-1750`.
7. **Most handler reads read every pair at the
   path** and reduce in memory (`getCollectionPairs`
   then `deriveDocumentsAt`,
   `api/derive-documents.ts:124-145`), where the
   stream path reads heads.
8. **Three orders.** Six stream collections order
   by `response_at, id`; nine nested collections by
   id; the members list by the seat body's `at`.
9. **The gate already requires `Operation-ID` on
   every request**, GET included
   (`api/api.ts:463-478`). `TODO.md:412-414` says
   it skips reads and cites `requireOperationId`,
   which does not exist. Item 1's four
   `api/backend-postgres.ts` cites have drifted:
   the collection head read is at `:545-574`.
10. **The import-graph oracle exists and exempts
    nothing** (`tests/client-import-graph.test.ts`).
    The client imports nothing from
    `shared/http-message/` today.
11. **The test transport has diverged.** Its
    `unwrapResponse` lifts `refresh_token` out of
    `Set-Cookie` into the parsed body
    (`api/api.ts:1556-1571`); the client's does
    not. About 45 test files call its verbs
    directly.
12. **The client holds no bytes.** It reads every
    body with `response.text()`
    (`client/http-facade.ts:96`); the library's
    wire is a Latin-1 string, one char per octet
    (`shared/http-message/wire-codec.ts:29-31`).
13. **Eight reads exist for a tag alone.** Idea
    conversion, three invitation transitions, the
    record-type edit, the work-order binding, the
    claim release, and flow undo read a document
    and use nothing but its `ETag`. Twenty of 31
    client PUTs send no `If-Match`.
14. **One list carries per-item tags, in the
    body.** The instances collection adds `etag`
    to each row (`api/routes.ts:4952`), read at
    `client/record-instances.ts:105-108`.
15. **Two things the server sends have no reader.**
    `Authorization-Limited-Attributes`
    (`api/api.ts:354-360`) and the GET of
    `work-orders/:id/claim`: the client PUTs and
    DELETEs there and never reads.
16. **`hasUndoHistory` replaced a read.** The
    designer fetched the flow's versions until the
    old `flow_versions` table stopped being written
    (`web-app/flows/detail.ts:1642-1648`). The
    route it would read derives from the ledger
    now: one row per distinct `state_event_id`
    (`documentLifecycleEvents`,
    `api/derive-documents.ts:185-207`), and every
    save mints one (`client/flow-mutations.ts:471`).
17. **The providers read falls back to a prefix
    nothing writes.** `deriveIdentityProvider`
    reads the legacy flat `/identity-providers/`
    (`api/derive-identity-spine.ts:232`); nothing
    under `api/mock-data/` writes there.
18. **RFC 2046 §5.1.1 requires one body part.** A
    `multipart/mixed` with none is not a message.
19. **The structured-field parser reads a leading
    digit as a number**
    (`shared/http-message/structured-fields.ts:164`),
    and a UUID may begin with one, so the boundary
    parameter needs a reader of its own.
20. **`Body` converts to everything but its own
    value.** `toWire()` and `toJson()` mean the
    whole message
    (`shared/http-message/http-message.ts:85-99`);
    `body()` returns a `Body`, which has
    `toBytes()`, `toText()`, `toBase64()`,
    `toNumber()`, `toBoolean()`, and `toDate()`
    (`shared/http-message/body.ts:53-162`) and
    nothing that returns the decoded object or
    array. `decoded()` returns a wrapper that
    answers dotted-path queries, and only tests
    call it. All six product call sites of `body()`
    write `exists()` then `JSON.parse(toText())` by
    hand (`api/derive-documents.ts:37-45`;
    `api/message-store.ts:52-57`; four in
    `api/message-pair.ts`).
21. **A flow is judged deleted by a walk, not by
    its head.** `deriveFlow` reduces every pair's
    client-minted `state_at` and takes the latest
    (`api/derive-flows.ts:269-277`;
    `currentDocumentState`,
    `api/derive-documents.ts:248-252`). The head's
    body carries the same three fields since state
    by PUT, and the two agree unless a later pair
    carries an earlier stamp.

## Out of scope

- Version and history reads, the four invitation
  reads, and `former-members/`: item 1's fourth
  spec. They need the wire to say who wrote a pair,
  when, and what it superseded, and three of the
  invitation fields are PII read across the
  membership fence, which item 2 owns.
- The covenant `## A response is one unit`: it
  lands with that spec.
- Work-order events as a sub-collection of an
  immutable document type: item 1's fifth spec.
  This spec treats `events` as a key of the
  work-order head and rules nothing on it.
- The retries bullet: what a refused save looks
  like, timeouts, and an error body that is not
  JSON.
- The `Gone for every document` bullet's write
  half: whether a deleted name may be written
  again.
- Unifying the three shapes the client hands the
  app; pagination; compression at the origin.
- Creates by PUT of a fresh id: they hold no
  message and stay as state by PUT left them.

## Sequence

Every commit is green when it lands, and a
collection's wire cannot change apart from its
reader, so a family's routes and the verb that
reads them change in one commit.

1. **The library.** The multipart joiner and
   splitter; `HttpMessage<T>` and
   `Body<T>.toValue()`.
2. **The function.** `servedResponse`; the three
   it replaces retire; write answers use it.
3. **Tombstones.** The 410 ladder, both kinds,
   every family.
4. **The transport.** One method per verb, bytes,
   errors carrying their response; the in-process
   `fetch`; the copy in `api/api.ts` retires.
5. **Families.** Each family's GETs serve stored
   responses and its verbs return messages; the
   claim GET and the tag-only reads retire; writes
   latch.
6. **The walk.** The skip walk and its pin.
7. **Docs.**

## 1. The per-route audit

Every GET route on this base, by what this spec
does with it. Lines are the route's in
`api/routes.ts`.

**A. Documents that serve their head: 21.**

| Route | Line | Today | Changes |
|---|---|---|---|
| `identities/:id` | 3721 | stream | lines |
| `ai-agents/:id` | 3756 | stream | lines |
| `…/work-orders/:id` | 4516 | stream | lines |
| `…/ideas/:id` | 5395 | stream | lines, 410 |
| `…/projects/:id` | 5405 | stream | lines, 410 |
| `…/objectives/:id` | 5491 | stream | lines, 410 |
| `identities/:id/default-organization` | 3729 | drops `id` | body gains `id` |
| `identities/:id/pii` | 3782 | handler | key order, 410 |
| `identities/:id/credentials/:cid` | 3902 | drops `secret` | projection |
| `identities/:id/registration` | 3941 | handler | key order, 410 |
| `identities/:id/token-revocations/:rid` | 3974 | handler | key order |
| `identities/:id/tokens/:jti` | 4025 | handler | key order |
| `identities/:id/providers/:eid` | 4132 | two prefixes | nested prefix only |
| `…/flows/:id` | 4394 | adds one, drops five | stored body, 410 |
| `…/record-types/:id` | 4726 | handler | key order, 410 |
| `…/attributes/:id` | 4854 | handler | key order, 410 |
| `…/instances/:id` | 5063 | projected | projection in the function |
| `…/flows/:id/records/:frid` | 5129 | handler | key order, 410 |
| `…/flows/:id/tags/:name` | 5181 | handler | key order, 410 |
| `organizations/:id` | 5208 | handler | key order |
| `…/members/:identity-id` | 5295 | handler | key order, 410 |

"Lines" is the header set of §2. "Key order" is
finding 5: the wire carries the stored octets, keys
sorted, where a handler sent `id` first.

**B. Collections of heads: 22.**

| Route | Line | Selection | Order today |
|---|---|---|---|
| `identities/` | 3633 | path | stamp |
| `ai-agents/` | 3755 | path | stamp |
| `…/ideas/` | 4166 | path | stamp |
| `…/projects/` | 4291 | path | stamp |
| `…/work-orders/` | 4504 | path | stamp |
| `…/objectives/` | 5419 | path | stamp |
| `identities/:id/organizations/` | 3733 | organization heads the identity holds a seat in | id |
| `identities/:id/credentials/` | 3859 | path | id |
| `identities/:id/tokens/` | 4016 | path | id |
| `identities/:id/providers/` | 4128 | path | id |
| `…/ideas/:id/submissions/` | 4301 | path | id |
| `…/flows/` | 4312 | path | stamp |
| `…/projects/:id/flows/` | 4458 | path | id |
| `…/flows/:id/work-orders/` | 4617 | path | id |
| `…/record-types/` | 4649 | path | stamp |
| `…/attributes/` | 4827 | path | id |
| `…/instances/` | 4928 | path | id |
| `…/flows/:id/records/` | 5122 | path | id |
| `…/members/` | 5289 | path | body `at` |
| `…/objectives/:id/revisions/` | 5508 | path | id |
| `…/objective-baseline-scores/` | 5552 | path | id |
| `…/objective-actual-scores/` | 5577 | path | id |

Every one excludes tombstones (§5) and orders by
`response_at, id` (§4). One selects by join, and
its parts are still the responses
`organizations/:id` serves.

**C. Retired: 1.** `…/work-orders/:id/claim`
(4524). It serves a sub-object of the work-order
head with a 404 that depends on the clock, and
finding 15 says nothing reads it. The work-order
response carries `claim`. Its PUT and DELETE stay.

**D. Still parted, by the census: 30.**

- Ten version lists and ten version items:
  identities, ai-agents, ideas, projects,
  objectives, record types, organizations, members,
  and invitations on both nests.
- `…/flows/:id/versions/` and its item (4409,
  4410); `…/instances/:id/versions` and its item
  (4966, 5001).
- `…/work-orders/:id/history` (4597).
- The four invitation reads (3739, 3742, 5257,
  5261) and `…/former-members/` (5283).

## 2. The one function

**Shape.** `servedResponse` takes the stored
response as the Latin-1 string the row holds, the
transmission (`date`, an IMF-fixdate, and
`requestId`), and the reader (the roles the gate
fenced, and the family's declared read roles). It
returns the response as a Latin-1 string in the
canonical form. It reads no clock, no row, and no
database: its caller hands it everything.

**What it does to the stored message.**

| Part | Served |
|---|---|
| status line | `HTTP/1.1 200 `, whatever was stored |
| `date` | this transmission's |
| `request-id` | this transmission's |
| `etag` | as stored: the head pair's id |
| `operation-id` | as stored: the write that made this state |
| `content-type` | as stored |
| every other stored line | as stored |
| `content-length` | as stored, or recomputed when the projection dropped a field |
| body | the stored octets, or the projection's |

**What it never sees.** A read is built from the
`response` column alone. The lines hoisted into
`response_secrets` are never spliced back: a token
revocation's stored `set-cookie` reaches no reader.

**A document GET** reads the head, takes the
ladder of §5, and answers the function's output as
the HTTP response: status, lines, and body octets,
built from bytes and never re-encoded from text.
`finish` sets the same `request-id` on the way out
(`api/api.ts:430-438`); the two agree by
construction, since the gate hands the function
the id `finish` uses.

**A collection GET** calls the function once per
selected head with one transmission, so every part
carries the same `date` and `request-id`, then
joins the parts (§4).

**A write's answer.** A landed write answers the
response it just formed, its body through
`projectedBody` for the requester and nothing else
changed: its status, its lines, and its credential
lines are its own. A no-op answers the head through
`servedResponse`, as `responseFromHead` does today.
State by PUT's `StateProjection` callback and its
`unprojected` constant
(`api/message-pair.ts:1005`, `:1058`) retire: a
write names its family, and the family's
declaration is the projection.

**One head, one response.** For a given head,
transmission, and reader, the document GET's
message and the collection's part are equal, line
for line and octet for octet.

## 3. Projection

**The rule.** `projectedBody` is the only place a
body is transformed. It drops fields the reader may
not read and does nothing else: it adds no field,
renames none, and reorders none. `servedResponse`
calls it for a read and a no-op; a landed write
calls it for its answer. Nothing else does.

**Two declared forms.**

- **Values by attribute.** A record instance's
  `values` entries are kept when the reader's roles
  may read the entry's attribute, by `rolesCanRead`
  (`api/attribute-acl.ts:33-41`), admin bypass
  included, as today. The caller loads the
  attribute schema (`loadAttributeSchemaById`,
  `api/routes.ts:874`) and hands it in. An
  attribute absent from the schema is unreadable.
- **Keys by role.** A family declares read roles
  for a top-level key. A key is kept when the
  reader holds one of them. Empty read roles admit
  no reader, and no bypass applies. One
  declaration exists: a credential's `secret`,
  with none, declared beside the family's patterns
  in `api/family-registry.ts`. Item 2 removes it
  when the hash leaves the body.

**Bytes.** When the projection drops nothing, the
function returns the stored octets, untouched and
never re-serialized. When it drops a field, it
parses the body preserving number text
(`parsePreservingNumbers`,
`shared/http-message/json-numbers.ts:31`), removes
the field, serializes with sorted keys as the
store does, and recomputes `content-length`.

**The tag.** Every projection of one head carries
the head's `etag`. It names the state the reader
acted on, which is what `If-Match` needs.

**What retires.** Six call sites of
`projectReadableValues` on the read and answer
paths (`api/routes.ts:3444`, `:4944`, `:4989`,
`:5029`, `:5096`; `api/api.ts:343`) reduce to the
function and to the two version reads the census
keeps. `withoutSecret` (`api/routes.ts:675-680`)
retires. `Authorization-Limited-Attributes` is no
longer sent: it would be a fourth line, and
finding 15 says nothing reads it. `instanceAdvertised`
and `limitedHeaders` (`api/api.ts:326-360`) retire
with it.

**A credential write's answer** is projected like
any other, so it no longer returns `secret` to the
writer who sent it.

## 4. A collection

**The message.**

```
HTTP/1.1 200
content-length: <octets>
content-type: multipart/mixed; boundary=<uuid>
date: <this transmission's>
request-id: <this transmission's>

--<uuid>
content-type: application/http; msgtype=response

HTTP/1.1 200
content-length: <octets>
content-type: application/json
date: <this transmission's>
etag: "<head pair id>"
operation-id: <the write's>
request-id: <this transmission's>

<body octets>
--<uuid>--
```

Line ends are CRLF, and each status line ends in
the space before an empty reason phrase. The
boundary is
`crypto.randomUUID()`, minted per response: 36
characters of RFC 2046 §5.1.1's alphabet, under its
70. The collection carries no `etag`: it is not a
document and has no one state to name.

**Empty.** A collection that selects no head
answers 204 with `date` and `request-id` and no
body (finding 18; RFC 9110 §15.3.5).

**The joiner and the splitter** live in
`shared/http-message/multipart.ts`, beside the
parser every part goes through. The joiner takes
the parts as wire strings and a boundary and
returns the body; it does not scan a part for the
boundary. The splitter takes the `content-type`
value and the body, reads the boundary parameter
with a reader of its own (finding 19), and then,
for each part: the delimiter line, the part's own
header lines to a blank line, the message's head
to a blank line, and exactly `content-length`
octets of body, after which the next delimiter
must follow. A part with no `content-length` has
no body. Anything else is an `HttpMessageError`.
Framed so, a body that contained the boundary
could not split a part.

**Order.** Every collection serves its heads by
`response_at, id` of the head pair, ascending, the
order the six stream collections serve today. An
edit therefore moves a document to the end. The
sixteen collections that order otherwise change
(finding 8). The plan reads each consumer of
those sixteen and names any that relied on the old
order; a consumer that needs an order sorts for
itself, as the objectives and attributes lists
already do.

**Selection.** A collection at a path selects the
live heads there (§5, §6). `identities/:id/organizations/`
selects the organization heads the identity holds
a live seat in. The providers collection and
document read the nested prefix alone (finding
17). The plan confirms no writer of the flat
prefix remains before the fallback goes.

**Size.** Item 1's figures stand: a part costs 293
bytes over a bare body, 215 of them the stored
response's own lines, and lists grow 33% in all.
Every part now carries one `request-id`, so that
line compresses where the probe's random one did
not.

## 5. Tombstones

**The rule.** A deleted document is never served
and never listed. Two heads are deleted: a DELETE
head, and a PUT head whose body says state
`deleted` in a family whose wiring declares
`lifecycle: 'state'` (`api/document-family.ts:108`).

**The ladder**, for a document GET, in order:

1. The fence, as today: a request the fence
   refuses answers 403 before any head is judged,
   so a foreign organization's deleted document
   answers what its live one does, and a 410 never
   reveals that it existed
   (`api/routes.ts:3498-3500`).
2. No head: 404.
3. A deleted head: 410 Gone (RFC 9110 §15.5.11).
4. Otherwise the response of §2.

**What changes.** Ideas, projects, and objectives
stop serving and listing a state-`deleted` head.
Flows and record types answer 410 where they
answer 404. Every document with a DELETE route
answers 410 for a DELETE head where it answers
404: PII, registration, record types, attributes,
flow records, flow tags, and member seats. The
record instance is unchanged; it is the model.

**Flows are judged by their head.** Finding 21's
walk stops deciding whether a flow's GET is
served; the head's body decides, as in every other
lifecycle family. The walk stays for the versions
route and for undo until item 11.

**The client.** Three verbs read a 404 as absence
of something that may have been deleted, and read
a 410 the same way: `getMemberPii`
(`client/identities.ts:137`), `fillHumanMemberPii`
(`client/members-union.ts:111`), and
`getClientRegistration` (`client/identities.ts:208`).
A filter that can no longer exclude anything goes:
`getProjects` drops its not-deleted filter
(`client/projects.ts:56-62`). `ideaIsVisible`
stays, since it also hides archived ideas.

**Writes.** Unchanged. A state-`deleted` document
can still be written by a PUT that names no tag or
the right one, and nothing in the app un-deletes.
The `Gone for every document` bullet decides
whether it should be refused.

## 6. The skip walk

**The read.** `getCollectionHeadPairs` on Postgres
becomes item 1's recursive query over
`fa_message_pairs_document`
(`api/schema-postgres.ts:225-226`): ask the index
for the first name at the path, then the next name
after the last, and read one head per name. It
keeps the PUT heads, as today's outer filter does,
and sorts them by `response_at, id`. It replaces the `DISTINCT ON`
(`api/backend-postgres.ts:545-574`), whose cost is
every version of every document at the path. The
probe is `measurements/probes/succession/p3-time.sh`.

**Figures**, item 1's, on 18.6: 200 documents at
10, 250, and 2,500 versions read 0.51, 30.63, and
130.71 ms by `DISTINCT ON` and 1.11, 1.43, and 1.93
by the walk. The walk loses where documents are
many and shallow, 4.54 ms against 39.48 at 10,000
documents of one version, and breaks even near 15
to 20 versions a document.

**The pin.** `./test postgres` pins the plan:
index scans of `fa_message_pairs_document`, no
sequential scan, no sort beneath the walk. It
replaces the `DISTINCT ON` pin at
`tests/pg-explain.test.ts:422-446`.

**The memory backend** is untouched
(`api/backend-buffer-tx.ts:165-185`), and
`tests/store-acceptance.ts:446-486` keeps the two
backends equal.

**More reads use it.** The handler reads of §1
that read every pair at a path to find heads
(finding 7) read heads instead: through
`getCollectionHeadPairs` for a collection,
`getHeadPair` for a document.

## 7. `HttpMessage<T>`

**The type.** `HttpMessage` gains one type
parameter, the type of its decoded body:
`HttpMessage<T = unknown>`. Every use today
compiles unchanged. `fromWire`, `fromModel`, and
`fromJson` take the parameter from their caller,
as `GET<T>` does today: the client asserts the
type at the wire and trusts it after.

**The conversion.** `body()` returns `Body<T>`, and
`Body<T>` gains `toValue(): T`: the body decoded by
its `content-type`, the whole value where
`toNumber()`, `toBoolean()`, and `toDate()` return
a leaf. It is named for the form that comes out,
as its siblings are. "Content" is RFC 9110 §6.4's
word for the octets, which `toBytes()` returns, so
it names nothing here. On an absent body
`toValue()` throws, as every accessor on `Body`
does: asking a 204 for its value is a bug.

**The message gains no accessor.** Its own
`to…()` methods project the whole message;
everything about the body stays behind `body()`.
The six call sites of finding 20 are not
rewritten here.

**Nothing else.** The transport reads a status
through `query('status')` and a tag through
`query('header.etag')`, both there today. The app
reads neither (§9).

## 8. The transport

**Methods.** `HttpFacade` goes from ten methods
to seven and `RequestContext` from eleven
(`client/http-facade.ts:19-90`;
`client/request-context.ts:135-197`):

| Method | Returns |
|---|---|
| `GET<T>(resource)` | `HttpMessage<T>` |
| `GETCollection<T>(resource)` | `HttpMessage<T>[]` |
| `PUT<T>(resource, body, latch?)` | `HttpMessage<T>` |
| `PATCH<T>(resource, body, latch)` | `HttpMessage<T>` |
| `POST<T>(resource, body, latch?)` | `HttpMessage<T>` |
| `DELETE(resource, latch?)` | `HttpMessage` |
| `POSTUnauthenticated<T>(resource, body)` | `HttpMessage<T>` |

`GETWithEtag`, `PUTWithEtag`, `PATCHWithEtag`,
`DELETEWithEtag`, and `POSTWithHeaders` retire.
`postForHeaders` becomes `POSTUnauthenticated`: it
sends no bearer, takes no recovery, and answers
whatever the server answered, as today; its old
name promised a part.

**A latch** is the messages a write derives from,
or the declaration that it creates. The transport
builds `If-Match` from their `etag` lines, as
received, and `If-None-Match: *` for a declared
create. `requiredEtag` and the string form of
`ifMatchField` (`client/request-context.ts:95-114`)
retire.

**Bytes.** The transport reads `arrayBuffer()`. A
document's message is built from the response's
status, its header lines, and those octets. A
collection's body becomes a Latin-1 string through
`Octets` and goes to the splitter; a 204 is an
empty array.

**Errors.** `unwrapResponse` and `etagFromHeader`
retire. A response that is not 2xx throws
`UnauthorizedError` on 401 and `RequestError`
otherwise, as today, and each carries the message
it was answered as `response`. Its text is the
content's `error` as today; what a body that is
not JSON does stays with the retries bullet.

**Recovery** is untouched: `exchangeOnce` and
`withAuthRecovery` keep their two layers.

## 9. The app

**What a verb returns.** A message, an array of
messages, or a value built from one that holds it.
Nothing returns a body beside a tag.

- A verb that returns a wire row today returns the
  message: `getIdeaEntity` answers
  `HttpMessage<IdeaEntity>`.
- A domain class or a camelCase value is built
  from a message and keeps it: `Idea`, `Project`,
  `RecordModel`, `WorkOrder`, `RecordInstance`.
  `RecordInstance` loses its `etag` field and the
  body `etag` it copied (finding 14).
- A composite names its messages: the ideas
  list's tuple drops `entity` and its `idea`
  holds the message
  (`client/ideas.ts:108-113`).

**Presenters** read from what they are given. One
that takes a wire row takes the message and reads
`body().toValue()`. One that takes a domain value
is unchanged.

**Every write from a held message latches.** A
write to a document the caller read takes that
message:

- The eleven that latch today pass the message in
  place of a tag.
- The twenty that send none divide in two. A
  write to a document the caller read latches: the
  saves, reorders, and state changes of ideas,
  projects, record types, organizations,
  identities and their PII, AI members, and
  registrations. A create by PUT of a fresh id
  holds no message and stays as it is. The plan
  sorts all twenty by site.
- A refused save throws the `RequestError` it
  throws today for any refusal, status 412. What
  the user sees is the retries bullet's.

**A write answers the new head.** A write verb
returns the message the write was answered with.
A page that goes on holding the document replaces
its message with that one, so a second write
latches on the new head without waiting for the
bell's refetch.

**Tag-only reads retire** where the caller holds
the message: idea conversion
(`client/ideas.ts:357-361`), the record-type edit
(`client/records.ts:268`), the work-order binding
(`client/work-orders-mutations.ts:414-416`), the
claim release
(`client/work-orders-deletions.ts:17-19`), and flow
undo (`web-app/app/flow-operations.ts:744-745`).
Each verb takes the message. The three invitation
transitions keep their read: invitation reads are
in the census.

**Reads before a write that use the body** stay
reads, and pass their message on as the latch,
unless the caller already holds one: the
objective, project, and work-order position and
state writes, the claim, the transition, and the
flow save.

## 10. Undo

`FlowWithGraph` loses `hasUndoHistory`
(`shared/types.ts:1114-1117`); the server no longer
computes it. A flow's GET serves the stored head,
so its body gains the five keys the handler
dropped: `state`, `state_at`, `state_event_id`,
`graphDelta`, and `revivals`. The client reads the
fields it read before.

A new verb, `getFlowVersions`, reads
`…/flows/:id/versions/`. The designer calls it
beside its five reads at load
(`web-app/flows/detail.ts:1656-1668`) and again
after an undo, and seeds `buildFlowHistorySnapshot`
with whether it answered more than one row. That
route is in the census and answers JSON until the
fourth spec.

## 11. Tests' transport

`tests/in-page-facade.ts` builds the real
transport, `createHttpFacade(origin, fetch)`, over
a `fetch` that awaits the adapter's simulated
latency and calls `handleRequest`. The verbs in
`api/api.ts` (`GET` through `postForHeaders`,
`:1805-2021`) and their `unwrapResponse`,
`facadeHeaders`, and `etagFromHeader` retire; the
`ClientFacadeAdapter` type stays. The test files
that call those verbs call a helper in `tests/`
over the same in-process `fetch`, which returns
the message. A test that read `refresh_token` from
a parsed body reads the `set-cookie` line.

## 12. The census

`tests/parted-reads.test.ts` walks the route table
and asserts that the GET routes not served by §2
are exactly the thirty of §1 D, by pattern. A GET
route added with a handler that answers JSON fails
it. The fourth spec removes patterns until the
list is empty, and the commit that empties it adds
`## A response is one unit` to ARCHITECTURE.md
with the file references item 1 names.

## Error and wire

| Status | When |
|---|---|
| 200 | a document GET of a live head; a collection that selects at least one |
| 204 | a collection that selects none |
| 403 | a request the fence refuses, whatever the head |
| 404 | a name never written |
| 410 | a deleted document: a DELETE head, or a state-`deleted` head in a lifecycle family |
| 405 | GET `…/work-orders/:id/claim` |

A 2xx read carries `date` and `request-id` of this
transmission. A document carries its head's
`etag` and `operation-id`. Refusals keep today's
`{ error }` body.

Three lines change on every converted document
GET: `operation-id` appears, `content-type` is the
stored line, and the body's keys are sorted.

## Testing

Layer 1 in `tests/`, then `./test postgres`. Layer
2 (`./test browser`) and `./bin/measure` need
Chrome: the operator runs each and tees it to a
file under `.worktrees/head-reads/.superpowers/`.

New pins:

- The joiner and the splitter: a round trip; a
  body of non-ASCII text; a body that contains the
  boundary; a part with no body; and each
  malformed shape refused.
- `servedResponse`: the lines a read serves and
  the lines it must not. `etag`, `operation-id`,
  and `content-type` as stored; `date` and
  `request-id` this transmission's; no credential
  line; an unprojected body equal to the stored
  octets; a projected one with its
  `content-length` true.
- Every head a read serves names itself: the
  probe's invariant over the seeded ledger, for
  every family of §1.
- One head, one response: for every family, the
  collection's part equals the document GET's
  message.
- The ladder, per family: 410 for a deleted
  document of the reader's organization, 403 for
  a foreign one, 404 for a name never written, and
  no part in the collection. Both kinds of deleted
  head.
- An empty collection answers 204.
- Every collection orders by `response_at, id`.
- A credential's `secret` reaches no reader, admin
  included, on a GET, in a collection, or in a
  write's answer.
- The transport over a scripted `fetch`: a
  document as a message, a collection through the
  splitter, octets not text, a 204 as an empty
  array, an error carrying its response.
- The latch: every write from a held message
  sends its tag, and each retired tag-only read is
  gone, by counting requests.
- The oracle stays green with the client
  importing `shared/http-message/`.
- The census.
- `./test postgres`: the walk's plan.

Standing pins that change, because the covenant
they named changed: the id-ordered collection
assertions; flows' and record types' 404 on a
state-`deleted` head, and every family's 404 on a
DELETE head; the tombstone served 200
(`tests/drift-projects.test.ts:326-427`,
`tests/drift-ideas.test.ts:402-427`);
`Operation-ID` absent on a GET
(`tests/api-idea-document.test.ts:312-319`); list
bodies read as arrays; the instance row's body
`etag` and the limited-attributes header
(`tests/api-instances-read.test.ts`); the claim
GET; `hasUndoHistory`; and the `DISTINCT ON` pin.
The plan names each file. No assertion is removed
to make a test pass: each is rewritten to the new
truth or deleted with the behavior it named.

## Docs that change when this ships

- API.md: reads, the collection's media type, the
  status table, the claim GET.
- The generated API documentation, through its
  generator and `./test api-docs`.
- AGENTS.md: `### Follow the RFCs` says a deleted
  document answers 410, not only a retired
  instance; `## Subagents` says a client verb
  returns an `HttpMessage`.
- ARCHITECTURE.md: `## Derivation` where it
  describes how a read is served. No covenant.
- TODO.md: item 1 names what landed and the two
  specs that follow; finding 9's stale cites are
  corrected; a bullet for the three shapes the
  client hands the app; the `Gone for every
  document` bullet records that reads are done.
- `measurements/probes/README.md`: done, with the
  probe.

## For the next brainstorms

The fourth spec, version and history reads,
inherits:

- The census, and the covenant it triggers.
- The question three reads share: how the wire
  says who wrote a pair, when, and what it
  superseded. A version row's `at` and `member_id`,
  an invitation's inviter, and a former member's
  `at` are all envelope columns, and `date` is one
  of the two lines a read substitutes.
- The invitation names that are PII read across
  the fence, with item 2.
- `getFlowVersions`, which answers JSON until
  then, and the three invitation transitions that
  still read for a tag.
- The two version reads that still call
  `projectReadableValues`.

The fifth spec, work-order events, inherits
`…/work-orders/:id/history` as a collection to
build once.

The retries bullet inherits the 412 a latched save
now answers, and errors that carry their response.

Later work inherits the three shapes the client
hands the app, and whether a collection's order
should be the client's to ask for.

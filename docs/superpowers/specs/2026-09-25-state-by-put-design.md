# State arrives by PUT

- Date: 2026-09-25
- Status: awaiting review, pre-plan
- Worktree: `.worktrees/ledger-store`
- Base: `ledger-store` at `667d601d`
- Ships: every state-changing write landing its
  state in a PUT head, the conditional judged at the
  gate by presence and at the statement by value,
  one former for sibling writes, derivation reading
  `response`, requests stored as received or not at
  all, and the client's latches where a write
  derives from a head
- Defers: the response as one unit (item 1's third
  spec), the retries bullet, the latched-write
  alignment, and the four cross-document checks
  that close before their statement
- Witness: `measurements/probes/seed/shape.ts` and
  `./test` timed before and after; nothing else is
  measured

## Problem

A document's state lives in three places today, and
its head is the least of them. The instance revision
stores `{ values }` and puts the instance's identity
in its request (`api/routes.ts:3983-4001`). The
work order's fields are one document, its claim a
second, its binding a third, and its lifecycle a
replay of the create's, the claims', the releases',
and the transitions' request bodies
(`api/derive-states.ts:891-951`). The token's
lifecycle is a fold over every event of its jti with
a rank for co-stamped rows (`api/identity-tokens.ts:
20-50`). Nine seams read the `request` column, and
no derive reads `response` but the stream families'
GET (`api/derive-documents.ts:95`, `:159`;
`api/document-family.ts:396`, `:473`;
`api/routes.ts:1034-1035`, `:5387`, `:5607`;
`api/derive-states.ts:615`; `api/api.ts:1211-1220`).

The ledger already judges writes by their response
bodies: sameness is byte equality of them
(`shared/ledger-statement.ts:231-240`;
`api/ledger-statement-sql.ts:153-159`), and the head
is selected among them. Every route that stores
nothing there therefore misjudges. The
default-organization stores an empty body, so a PUT
naming another organization matches the first and
lands nothing (`api/routes.ts:3450-3452`;
`api/organization-requests.ts:96-131`). The binding
stores an empty body, so a rebind matches and its
409 rests on a read outside the statement
(`api/routes.ts:2585-2608`). Two racing first binds
answer 201 and 200, and the second binder's binding
is gone.

Latches are judged in five places. The gate infers a
genesis by reading the head (`api/api.ts:933-935`),
keeps a six-outcome table for flows (`:1020-1070`),
a latched arm for undo (`:845-1019`), and a table of
its own for the instance PATCH (`:1071-1198`); the
instance handlers read the head twice more
(`api/routes.ts:3941-3960`, `:4003-4016`) and wrap
the create's read and statement in a transaction
(`:3880-3906`). The client latches in three files
(`web-app/app/adapters/record-instances.ts:176`,
`flow-mutations.ts:526-536`,
`work-orders-mutations.ts:406-412`), and the
transition's latch names the instance, never the
work order (`api/routes.ts:2425-2444`).

The third spec, the response as one unit, can serve
only what responses already say, and derivation can
leave `request` only once work orders and tokens put
their whole state in a head. This is item 1's
second spec (`TODO.md:447-703`): the write side,
before the read side.

## Axiom

A head is its document's whole state, and only the
statement judges a latch.

## Decisions

1. **After any write, the head of each document it
   changed is a PUT pair whose response body is
   that document's whole state**, `id` first, the
   object its GET derive yields, formed by the
   family's `entityOf` over the merged state.
   Where the write's path names the document, its
   own response says the whole state. Where it
   names a sub-resource or an operation, a
   synthesized sibling PUT of the parent lands in
   the same statement. The seed spec's sixth
   finding is this defect class and closes here
   (`docs/superpowers/specs/2026-09-23-ledger-seed-design.md:269-284`).

2. **Three headers, three attempt classes, and
   nothing else.** `If-Match` naming a head is
   in-order; `If-None-Match: *` is genesis; neither
   is blind, for PUT alone. The gate checks
   presence and form per route and verb, from a
   field the write specs gain, and never reads a
   head to decide a latch. The statement judges the
   value: a nil latch is stale when a live PUT head
   exists and lands otherwise. The `genesis` attempt
   class retires; the row's nil latch says it.
   Fourteen parameters stay. §2.

3. **A create declares itself.** The client
   declares a create by PUT or PATCH of an id it
   minted with `If-None-Match: *`, required for the
   instance PATCH; a taken live name answers 412
   (RFC 9110 §13.1.2). A POST create names its
   document in its body, the handler declares the
   document row's genesis, a taken name answers
   409, and the 201 carries `Location`. The instance
   create's verb does not change. §2.

4. **One former.** `runStateWrite` in
   `api/message-pair.ts`, beside `runWrite`, takes
   the received pair, its siblings with their whole
   states and conditions, and a projection, forms
   each sibling with zero request bytes and a
   whole-state response, completes the received
   pair's response, runs one statement, and maps the
   answer. Every class C, D, and E write rides it.
   §3.

5. **Whole state, by family.** Organizations and
   token documents move `id` first. The
   default-organization, the instance revision, the
   flow, and the work order say more. The five
   create POSTs and every class C operation answer
   the created or parent document's state. §4.

6. **Work orders: one head, five operations.** A
   version carries the fields, `state`, the
   binding, `claim`, and `events`, the lifecycle
   events it recorded. Create, claim, release,
   transition, and binding each land one version.
   History is the version chain. The replayer
   retires. A latched operation's `If-Match` names
   the head of every document it derives from, one
   entity-tag each. Claim expiry is one clock. §5.

7. **Tokens: head selection replaces the fold.**
   The head of `tokens/<jti>` is the token's state;
   the rank retires; `parent_jti` rides the issued
   event. Rotation, revocation, and the grants
   carry no client latch; their event rows latch on
   the heads the handler read in its transaction,
   and the handlers act on the former's answer. §6.

8. **Derivation reads `response`.** One parser,
   `bodyOf`, over `pair.response`; the four version
   and revision reads follow; the operation decoder,
   the request-side sameness pre-check, and the
   gate's same-body fast path retire. A handler that
   forms several siblings omits those equal to
   their heads, byte for byte. §7.

9. **`request` holds what was received, or
   nothing.** Every synthesized former stores zero
   request bytes, the seed's rows included, closing
   the message plane's Decision 6 list
   (`docs/superpowers/specs/2026-09-23-message-plane-design.md:191-210`).
   §8.

10. **The client latches what derives from a
    head.** Class C operations and the instance
    update, the class B PUTs, and the read-then-PUT
    calls that merge on the client; it declares the
    instance create. Whole-state PUTs from a form
    and creates by PUT of a fresh id stay as they
    are. Where a page holds no etag it reads first.
    §9.

11. **A no-op stores nothing and answers 200 with
    the head**, projected for the requester. Stale
    is decided before matched, as item 0 left it,
    and the latched-write bullet becomes a change
    to the classifier alone. §10.

12. **The wire follows the RFCs.** 428, 412, 409,
    201, 200, 204, and 400 as Error and wire says,
    with `If-Match` and `If-None-Match` evaluated in
    RFC 9110 §13.2.2's order when both are sent. The
    empty-body PUT arm retires: a PUT with no body
    is the validator's 400. The work-order
    validator's optional `organization_id` retires.

13. **Carried in, and not reopened.** Item 0's
    decisions: the succession index as the only
    write enforcement, fourteen parameters per row,
    the status a landed PUT stores, the credential
    hoist into `secret`, the code document and its
    latched DELETE, the seed's one transaction and
    its rehearsal. The client spec's layout, its
    instance, and its oracle. The retries bullet and
    the two-layer recovery. The bell per inserted
    row.

## Found on the base

1. **Nothing reads a write spec's `status`.** The
   gate reads `successBody` alone
   (`api/api.ts:936-942`); the former stores 201
   for every non-DELETE pair
   (`api/message-pair.ts:321-323`); the statement
   overlays 200 over a live PUT head
   (`shared/ledger-statement.ts:258-274`). Twelve
   entries say 204 (`api/routes.ts:3168`, `:3213`,
   `:3234`, `:3237`, `:3451` among them) and the
   tests pin 201
   (`tests/api-work-order-binding.test.ts:163`;
   `tests/api-work-order-transition-instance.test.ts:387`).
2. **An empty stored body makes sameness
   degenerate.** The default-organization, the
   binding, and the transition store empty bodies;
   the claim and the create POSTs store echoes. The
   binding's 409 and the claim's are decided by
   reads before the statement
   (`api/routes.ts:2585-2600`, `:2110-2115`).
3. **A composed refusal names a header nobody
   sent.** A succession conflict on a composed
   statement answers 412 "If-Match does not match"
   (`shared/ledger-statement.ts:159-163`) on routes
   that take none: creates, conversion, invitations,
   rotation.
4. **Two handlers report success over a refused
   statement.** `rotateRefreshJti` returns
   `rotate` without reading the answer
   (`api/authentication.ts:896-903`), and the
   refresh grant returns `ok` over the refused wire
   the gate then serves.
5. **Verify, close, then write.** Undo's re-read
   (`api/routes.ts:1678-1702`), the flow latch
   re-check (`:1560-1573`), the invitation
   transitions (`api/invitations-domain.ts:713-738`,
   `:809-821`, `:891-913`), the seat probe of the
   default-organization
   (`api/organization-requests.ts:118-127`), and
   revocation (`api/authentication.ts:1003-1031`)
   each verify in a read transaction that closes
   before the statement. So do four checks that
   count across documents: the last admin seat
   (`api/routes.ts:5882-5901`), the record-type
   RESTRICT (`:5333-5351`), the attribute RESTRICT
   (`:5488-5498`), and the instance placement
   RESTRICT (`:3699-3728`). Comments at `:5321-5325`,
   `:1136-1143`, and `:1732` say they share a
   transaction; they do not.
6. **A body may name its own organization.** The
   work-order validator admits `organization_id`
   (`api/validators.ts:1854-1857`), the request is
   stored as received, and the GET spreads the
   stored body over the fenced value
   (`api/routes.ts:414-418`), so the wire shows the
   writer's value. The seed writes the key
   (`api/mock-data/seed-message-pairs.ts:924-929`).
7. **The replay fast path is gone.** No lookup by
   request hash exists; `REPLAY_EXEMPT_ROUTE_PATTERNS`
   (`api/message-pair.ts:1329-1343`) has one test
   consumer (`tests/pair-write-coverage.test.ts:113`),
   `DOCUMENT_CLASS_ROUTE_PATTERNS` (`:1344-1397`) has
   none, and comments at `api/api.ts:1021`, `:1071`,
   `:1539` and `api/authentication.ts:801-808`
   describe it. Nothing at the gate reads a request
   to serve a stored response.
8. **The no-op instance PATCH already answers 200
   and stores nothing** with a current latch
   (`tests/api-instances-create.test.ts:575-614`).
   Item 1's "appends a version and answers 201" is
   stale.
9. **The flow undo already joins on the operation
   id** (`api/derive-flows.ts:278-280`, `:305-312`);
   the store spec's landing moved it, and no
   `request_at` remains in that file. Item 1's
   clause is done.
10. **Three client files latch; no
    `If-None-Match` exists anywhere.** Of 34 client
    PUTs one carries `If-Match`, `putFlow`. The two
    position PUTs and the archive read then PUT
    unlatched (`web-app/app/adapters/projects.ts:297-335`;
    `objectives.ts:364-405`).
11. **Flows' sidecars live in requests only.**
    `flowStoredEntityOf` drops `graphDelta` and
    `revivals` (`api/derive-flows.ts:117-146`);
    the graph bindings (`:437`), the undo target
    (`:325-337`), and the attribute RESTRICT
    (`api/record-attribute-refs.ts:116-118`) read
    them from the request.
12. **Token events already store the whole row**,
    `id` last (`api/message-pair.ts:437-470`;
    `api/derive-identity-tokens.ts:37-44`). What is
    missing is head selection: the fold reduces
    every event by `at` with a rank
    (`api/identity-tokens.ts:20-50`).
13. **The transition latches the instance.** The
    client's tag is the instance's
    (`web-app/app/adapters/work-orders-mutations.ts:406-412`),
    the handler compares it to the instance head
    (`api/routes.ts:2425-2444`), and a pure move
    sends none (`:415-420`; server `:2331-2341`).
14. **A duplicate create supersedes silently.**
    Flows, objectives, record types, and identities
    land a POST whose id exists with a different
    body as a blind successor; the same body answers
    200 with the head. Conversion probes nothing: a
    missing idea lands as a fresh document under the
    caller's organization (`api/routes.ts:4702-4712`).
15. **The empty-body PUT arm** stores a
    validator-free empty head for any wired PUT
    (`api/api.ts:1262-1312`;
    `tests/api-write-status.test.ts:330-361`).
16. **The stream families' GET serves a tombstone
    as 200** (`api/api.ts:2054-2066`;
    `tests/drift-projects.test.ts:326-427`). The
    read side; the third spec's.
17. **Comments name absent code**:
    `appendMessagePairOnce` (nine), `sendWriteResponse`
    (`api/routes.ts:3448-3449`),
    `postWorkOrderReleaseOp`
    (`api/derive-states.ts:505`, `:709`, `:819`),
    `coordinateWrite`, `MEMBERS_WIRING`
    (`api/routes.ts:493`), and `getPairByRequestHash`.
18. **No read-only POST exists.** Every POST in the
    table stores on its success path
    (`api/routes.ts:4062-6217`); item 1's second kind
    is empty here.

## Out of scope

- The response as one unit: the two read shapes
  (`streamGetFromStored`, `api/message-pair.ts:672`;
  `streamStoredCollectionGet`, `api/api.ts:2121`),
  the skip walk, `multipart/mixed`, projection's
  move into the one read function, the client
  keeping responses whole, and the ARCHITECTURE
  covenant.
- The retries bullet (`TODO.md:1296`): one policy,
  timeouts, the 5xx trio, unknown-outcome POSTs.
  This spec adds no retry.
- The latched-write bullet (`TODO.md:1343`): whether
  a stale latch may answer 2xx. §10 narrows it.
- The four counting checks of Found 5: a
  Later-work bullet with the oracle named.
- The credential PUT that stores a secret unhashed
  (`api/routes.ts:3002-3020`): item 2's.
- Client-minted stamps that drive primary-org
  resolution and the revocation comparison; the
  seat authorizer that probes its own prefix.
- Flows' event walk (item 11), recording claim
  expiry (item 13), the fence (item 2), the marker
  (item 3).

## Sequence

1. **The statement.** The nil latch on both
   backends; the `genesis` attempt retires; the
   refusal mapping by declarer.
2. **The former.** `runStateWrite`, unit-tested
   against the memory backend.
3. **The gate.** The conditional field on the write
   specs; presence and form only; the five latch
   reads, the same-body path, and the empty-body arm
   retire; the three sets retire.
4. **Whole state.** Organizations, tokens, the
   default-organization, instances, flows.
5. **Work orders.** The version body, the five
   operations through the former, history from the
   chain, the replayer retires.
6. **Tokens.** Class E through the former; rotation
   and revocation act on the answer; `parent_jti`.
7. **Creates and operations.** The five POST
   creates, conversion, the record-type edit,
   invitations, and undo through the former;
   `Location` on the 201s.
8. **Derivation.** `bodyOf`; the version reads;
   the decoder and the pre-check retire; the oracle.
9. **Requests.** The synthesized formers and the
   seed store zero bytes; the shape re-pinned.
10. **The client**, after the client spec lands.
11. **Docs.**

## 1. The per-route audit

Every write route on this base, by class under
this spec. Counts are routes.

**A. Document PUT, whole state, conditional
optional.** 24 routes whose path names the document
and whose stored response is the whole state with
`id` first: `identities/:id`, `ai-agents/:id`,
ideas, projects, objectives (`documentPutHandler`,
`api/document-family.ts:307-315`; bodies
`:676-714`), submissions (`api/routes.ts:1388-1411`),
the two joins (`:4951-4981`, `:2655-2677`), flow
records (`:2687-2731`), flow tags (`:2741-2752`),
revisions (`:6080-6098`), both score families
(`:2764-2816`), record types (`:1316-1340`),
attributes (`:5452-5466`), pii (`:2927-2947`),
credentials (`:3002-3020`), registration
(`:3030-3048`), providers (`:3082-3115`), token
revocations (`:4406-4443`), seats (`:2824-2842`),
and token documents (`:4457-4500`). Three exceptions
the response must fix: organizations store `id`
last (`api/derive-organizations.ts:73-80`), token
documents store `id` last, and the
default-organization stores an empty body. A PUT
here is blind with no header, in-order with
`If-Match`, genesis with `If-None-Match: *`.

**B. Document PUT, conditional required.** Flows,
locked today (`api/family-registry.ts:43-47`;
`api/api.ts:1020-1070`), and work orders
(`api/routes.ts:2626-2647`), which join them: a PUT
with neither header answers 428. Work orders join
because their head carries the claim, the binding,
the node, and the version's events, so a PUT of the
fields derives from the head. Flows' response gains
`graphDelta` and `revivals`.

**C. In-order operation, sibling PUT of the
parent.** The instance update
(`api/routes.ts:3914-4021`); the work-order claim
(`:2044-2142`), release (`:2140-2156`), transition
(`:2290-2527`), and binding (`:2538-2609`); flow
undo (`:1594-1715`); idea conversion (`:4652-4771`);
the record-type edit (`:839-941`, `:1144-1217`);
invitation accept and decline
(`api/invitations-domain.ts:633-837`) and revoke
(`:839-929`). Each carries `If-Match` naming the
parent's head, answers 428 without it, and lands a
version of the parent in the same statement. Today
the instance update, the value-bearing transition,
and undo latch; the rest write blind, and the
invitations read their state in a transaction that
closes before the write.

**D. Named create by POST.** `identities/`
(`api/routes.ts:4063-4144`), `flows/`
(`:4794-4876`), `work-orders/` (`:4991-5128`),
`objectives/` (`:5987-6039`), the record-type
create (`:5282-5311`), and the invitation grant
(`api/invitations-domain.ts:397-531`): the client
mints the id, the handler declares the document
row's genesis, and a taken name answers 409. The
instance create (`api/routes.ts:3826-3907`) is the
one client-declared genesis and answers 412 on a
live name.

**E. Credential-conditioned operations.** Token
rotation (`api/authentication.ts:824-908`),
revocation (`:984-1046`), and the two grants
(`api/api.ts:1653-1772`; `api/authentication.ts:
1554-1591`, `:1827-1862`). No client latch; the
presented credential is the precondition, and the
event rows latch on the heads the handler read
inside its transaction. The grants' own responses
stay what OAuth defines.

**F. Document DELETE.** Nine routes, blind, with
the existence and fence probe kept: pii,
registration, the project-flow join, flow records,
flow tags, record types and attributes with their
RESTRICT scans, seats with the last-admin check, and
instances with tombstone-wins
(`api/routes.ts:3670-3729`). Release is the
exception and sits in C.

**Responses that must say more.** Eleven shapes
change: the default-organization's empty body; the
instance revision's bare `{ values }`; the instance
PATCH's delta echo (`:3309-3327`); the work-order
document and its four operations' empty or echoed
bodies (`:3217-3238`); the flow's dropped sidecars;
the token documents' key order and the issued
event's missing predecessor; organizations' key
order; and the five create POSTs' echoes or empty
bodies (`:3198-3204`, `:3217-3223`, `:3251-3257`,
`:3356-3358`, `:3403`), which become the created
document's state.

## 2. The conditional

Three wire forms map onto the statement's three
attempt classes (`shared/ledger-statement.ts:16-20`).

| Header | Class | The row's `if_match` |
|---|---|---|
| `If-Match: "<etag>"` | in-order | that head's id |
| `If-None-Match: *` | genesis | the nil id |
| neither | blind | null |

**Who must send what.** Class C operations and the
instance update require `If-Match`. Class B
document PUTs require one of the two. The instance
create requires `If-None-Match: *`. Class A document
PUTs and every DELETE take either or neither. Class
D POST creates and class E operations take none.
Both headers are evaluated in RFC 9110 §13.2.2's
order, `If-Match` first, and with `*` beside a named
tag one of them fails, so the answer is 412.

**The gate checks presence and form, never value.**
Per route and verb, before any pair forms: a
required conditional that is absent answers 428
(RFC 6585 §3), and one that is malformed answers
400, storing nothing. The class lives in the write
specs (`api/routes.ts:3154`), one field per entry,
and replaces `LATCHED_OPERATION_ROUTE_PATTERNS`
(`api/message-pair.ts:1239-1242`), the registry's
`concurrency` (`api/family-registry.ts:23`), and the
two dead sets. The `status` field leaves. With that,
every read the gate makes to decide a latch
retires: the inferred genesis (`api/api.ts:933-935`),
the locked six-outcome table (`:1020-1070`), the
latched-operation head read (`:851-872`), the
instance PATCH table (`:1071-1198`), and the
same-body fast path (`:1199-1261`). The handlers'
own pre-checks retire with them: the instance
update's two (`api/routes.ts:3941-3960`,
`:4003-4016`), the create's transaction wrapper
(`:3880-3906`), the claim's (`:2097-2109`), undo's
re-read (`:1678-1702`), and the flow latch re-check
(`:1560-1573`).

**The statement judges the value.** Its per-row
latch already refuses a wrong head
(`shared/ledger-statement.ts:225-230`;
`api/ledger-statement-sql.ts:146-152`). It gains one
branch: a nil latch is stale when a live PUT head
exists and lands otherwise, superseding a tombstone
or the nil id; the head's method is already beside
its id in both reads (`shared/ledger-statement.ts:
62-68`; `api/ledger-statement-sql.ts:72-80`). The
`genesis` attempt class retires: `stampFor`,
`supersedesOf`, and `overlaidPrefix` already answer
the same for a null head, and the leading bind keeps
blind, in-order, and composed. `attemptFor`
(`api/message-pair.ts:771-787`) no longer returns
it; a pair's `genesis` flag becomes its row's nil
latch in `ifMatchOf` (`:1069-1104`). Fourteen
parameters stay.

**Refusals say what happened.** A stale latch is
412. A succession conflict
(`api/schema-postgres.ts:217-219`;
`api/backend-memory.ts:209-220`) is 412 when the
refused row's latch was the client's, an `If-Match`
or a declared genesis, and 409 when the handler
declared the genesis for a POST create. Blind keeps
its three retries and then 409
(`shared/ledger-statement.ts:149-157`). The body
names the document and the fact.

**Tombstones.** A declared genesis over a DELETE
head lands as 201, the RFC's "no current
representation". Instances keep tombstone-wins:
their create reads the head once and answers 409 on
a tombstone, a family rule stated as one, not the
ledger's.

## 3. The former

One function in `api/message-pair.ts` beside
`runWrite` (`:789-849`), `runStateWrite`, through
which every class C, D, and E write lands. It
imports nothing from the routes, because the
handler hands it the state already formed by its
family's `entityOf`.

**Inputs.** The received pair, formed by the gate
without a response; a list of siblings, each a
document as path and name, its whole state with
`id` first, and its condition, in-order on a named
head or genesis, declared by the client or by the
handler; a DELETE sibling carries no state; and a
projection for the requester's view,
`projectReadableValues` (`api/attribute-acl.ts:
77-94`) for instances and identity elsewhere. The
first sibling is the parent, the document the route
hangs off. With no siblings the received pair is
the document's own version, a PUT whose state the
handler completed from the head, which is how the
work-order PUT rides it.

**What it forms.** Per sibling, through
`formWriteMessagePair` (`api/message-pair.ts:
262-360`): method PUT or DELETE; `emptyRequest`
(`:306-307`), so zero request bytes; a response
formed whole: status 201, which the statement
overlays to 200 over a live PUT head; `date` for
splicing; `etag` naming the sibling's own id
(`:326`); the received pair's `operation-id`
and `request-id`; `content-type` and
`content-length` from the body
(`api/message-form.ts:66-92`); the state as body.
The latch rides the row: `latchedHeadMessagePairId`
for in-order, the nil latch for genesis. Then it
completes the received pair's response: 201 for a
genesis and 200 otherwise, the same lines, `etag`
naming the parent sibling, `Location` on a POST
create, and the parent's state projected as body.
The former mints both ids, so nothing looks a
sibling up afterward. That completion is the one
place a pair's response is written after formation;
the gate forms the received pair knowing it will be,
and a write spec whose route lands siblings has no
`successBody`. The post-dispatch etag replacement
for instances (`api/api.ts:1580-1597`) retires,
since the completed response already names the head.

**The statement.** One `runWrite` over the received
row and every sibling, composed. The received row
carries no latch of its own, generalizing the rule
`ifMatchOf` keeps for a composed POST
(`api/message-pair.ts:1081-1086`); its siblings
judge. Sameness runs per row as today, so an
unchanged parent reports matched and nothing lands.

**The answer.** Land: the received pair's completed
response. Matched: the head's stored response
through `responseFromHead` (`:607-643`), projected
for the requester, as 200 with the head's etag.
Stale: 412. Refused: 412 or 409 by §2. The bells
stay one per inserted row (`:964-971`).

## 4. Whole state, by family

**The rule.** A document's whole state is the
object its GET derive yields today: `id` first,
then every field the validator admits in the
validator's order, with the fenced ids stamped by
the server and nothing the server does not know.
One function per family forms it, the family's
`entityOf` over the merged state, so a sibling and
a GET agree byte for byte
(`api/routes.ts:3161-3167`). Byte equality is the
sameness test, so key order is part of the
contract. No live ledger migrates: every deployment
seeds fresh, so a changed order costs nothing
stored. Were a live ledger to exist, each document's
next same-state write would land one phantom
version, once.

**What changes**, family by family:

- **Organizations** move `id` first
  (`api/derive-organizations.ts:73-80`).
- **Token documents** move `id` first
  (`api/derive-identity-tokens.ts:37-44`), and an
  `issued` event born of a rotation carries
  `parent_jti`, the jti it succeeded; a root carries
  none.
- **Default-organization** stores
  `{ id, organization_id }` with the identity's id,
  the singleton shape pii and registration use
  (`api/derive-identity-spine.ts:85-93`, `:434-445`),
  in place of nothing.
- **Instance revisions** store the GET's shape,
  `{ id, organization_id, record_type_id, values }`
  (`api/routes.ts:5655-5662`) with every value, in
  place of bare `{ values }`. The PATCH's own
  response is that shape projected. The versions
  list and the version GET (`:5542-5616`) read it.
- **Flows** add `graphDelta` and `revivals` after
  the lifecycle trio in `flowStoredEntityOf`
  (`api/derive-flows.ts:117-146`). GET keeps
  dropping them and stamping `hasUndoHistory`
  (`:93-110`); whether the unit carries either is
  the third spec's.
- **Work orders** gain what four documents and a
  replay compose today: `state`, the binding as
  today's two keys, absent when unbound, `claim`,
  absent when unclaimed, and `events`. §5.
- **The five create POSTs** answer the created
  document's state in place of an echo or nothing.
- **Class C operations** answer the parent's state
  in place of an echo or nothing: the work order
  for claim, release, transition, and binding; the
  flow for undo; the idea for conversion; the type
  for the record-type edit; the invitation for
  accept, decline, and revoke, which already store
  the whole invitation on the document
  (`api/invitations-domain.ts:575-603`).
- **Token operations** answer a token document's
  state: the successor's for rotation, the
  presented jti's for revocation.

**Two exceptions, stated.** The grants keep OAuth's
response (`api/authentication.ts:311-343`); their
token-event siblings carry the state. Credentials
keep the PHC hash in both bodies as today; item 2
owns secrets.

## 5. Work orders

**The version body.** Beside `display_id`,
`flow_graph`, and `position`
(`api/validators.ts:1864-1868`), a version carries
`state`, the current node; the binding as
`instance_id` and `record_type_id`, absent when
unbound, today's GET keys (`api/routes.ts:5140-5148`);
`claim` as `{ member_id, at, expires_at }`, absent
when unclaimed, the claim GET's shape (`:5170-5173`);
and `events`, the lifecycle events this version
recorded, each `{ id, state, member_id, at,
field_values }` in today's history-row shape
(`api/types.ts:408-443`). A version records the
events that led from its predecessor to it, never
the whole history, so no version caches earlier
ones.

**The five operations**, each landing one version
through the former:

- **Create.** A genesis version: `state` is the
  post-start node, `claim` is the creator with
  expiry from the graph's lock timeout, no binding,
  and `events` holds the three births with the
  client's ids and stamps
  (`web-app/app/adapters/work-orders-mutations.ts:
  190-203`; `api/validators.ts:3737`). The
  join sibling stays (`api/routes.ts:5070-5084`). The
  synthesized claim pair at `claim/` (`:5090-5110`)
  retires, because the head carries the claim.
- **Claim.** In-order on the work order. `claim`
  becomes the requester; `events` holds
  `claim_expired` for a prior claim that lapsed,
  authored by the prior claimant
  (`api/derive-states.ts:761-770`), then `claimed`.
  A foreign live claim answers 409 from the head the
  handler reads to merge. The same claimant
  resending lands nothing.
- **Release.** In-order, on the DELETE of `claim/`.
  `claim` is absent; `events` holds
  `claim_released`, its id the version's own and its
  stamp the request's arrival, as the non-legacy
  replay does today (`:834-839`). A release with no
  live claim lands nothing.
- **Transition.** In-order. `state` becomes the
  target node; `events` holds the transition with
  its `field_values` (`:1101-1136`), and
  `claim_released` when the body releases
  (`:800-816`). A value-bearing transition lands a
  second sibling, the instance revision, on the
  instance head.
- **Binding.** In-order. The two keys are set; no
  event, as today. A rebind to another instance
  answers 409 from the head.

**Two heads, two tags.** A latched operation's
`If-Match` names the head of every document it
derives from, one entity-tag each, as RFC 9110
§13.1.1's list form permits. The former matches
each tag to a document it read. A value-bearing
transition sends the work order's and the
instance's; a pure move sends the work order's
alone. A missing tag is 428, with the body naming
the document; a tag naming no head the operation
derives from is 412. The alternative, the instance's
tag as a body field beside `set` and `clear`, is
refused so that preconditions ride one header on
every route.

**Reads.** GET is the head, today's keys plus the
three new ones. The claim GET is the head's `claim`
or 404. The list is heads. History is the version
chain: every PUT version's `events` in order, newest
first (`getDocumentHistory`). The replayer
(`api/derive-states.ts:891-951`), the operation
decoder and its prefix walk (`:555-629`), the
four-prefix claim read (`:982-1054`), the claim and
binding readers (`:1240-1327`), the lock-timeout
walk (`:672-704`), the three appliers (`:729-870`),
and the legacy release prefix (`:994-998`) retire.
Claim expiry is decided at read from `expires_at`
against the request's stamp, one clock where there
were two (`api/routes.ts:2091-2096` against
`api/derive-states.ts:658-665`); recording it is
item 13's.

**The PUT.** Class B: the handler reads the head,
forms the whole state from the request's three
fields and the head's facets, records no event, and
the received pair is the version. The validator's
optional `organization_id` (`api/validators.ts:
1854-1857`) retires, and a body carrying it answers
400.

**The seed** writes its work orders directly
(`api/mock-data.ts:868-895`) and now carries the
whole state, births included.

## 6. Tokens

**What is already there.** Each token event pair
stores the token's whole row: `jti`, `identity_id`,
`action`, `chain_id`, `at`, and `id`
(`api/message-pair.ts:437-470`). What is not there
is head selection. The fold reduces every event of
a jti by `at` with a fail-closed rank
(`api/identity-tokens.ts:20-50`), and the chain's
shape is recomputed from all rows on every read
(`api/authentication.ts:666-691`).

**Head selection replaces the fold.** The head of
`tokens/<jti>` is the token's state. Its `action`
answers `isTokenRevoked` (`api/identity-tokens.ts:
81-86`) and the rotation plan's liveness
(`:187-227`); its `chain_id` and `identity_id`
answer the two lookups (`:54-61`, `:92-99`); the
collection's heads filtered by `chain_id` answer the
chain's jti set (`:65-74`). The rank retires because
succession orders events: two events of one jti
cannot both be heads, and an event latched on the
head it read is refused when the head moved, which
is the case the rank guarded. The lineage parent
(`:112-136`) becomes `parent_jti` on the issued
event's state, and the derivation retires.
`deriveIdentityTokenEventsForJti`
(`api/derive-identity-tokens.ts:100-116`) becomes a
head read.

**How the events land.** Class E: no client latch.
An `issued` event for a new jti is a
handler-declared genesis. A `rotated` or `revoked`
event is in-order on the head the handler read
inside its transaction. Rotation keeps its one
transaction and its divergence retry
(`api/authentication.ts:838-895`), and a refused
statement is a divergence: re-read, re-plan, three
attempts. Revocation adopts the same shape, closing
its verify-then-write gap (`:1003-1031`). Both act
on the former's answer, so a refusal is never
reported as a rotation. The grants change only in
that their event siblings ride the former: the code
document and its latched DELETE from item 0 stand
(`:1391-1405`, `:1507-1527`).

**Two documents stay separate.** The identity's
`token-revocations/` is its own family, class A;
the revocation reason's first read
(`:621-651`) is unchanged and its second read
becomes the jti's head. The admin PUT of
`tokens/:jti` can still rewrite a head, as today.

**Wire.** `id` first on the token document. Rotation
answers the successor's state, revocation the
presented jti's. The identity-tokens page reads
`parent_jti` instead of deriving parents
(`web-app/app/adapters/identity-tokens.ts:56-86`).

## 7. Derivation leaves `request`

**The rule.** After this spec nothing derives from
the `request` column. The covenant's last sentence
becomes true here; the covenant itself lands whole
with the third spec.

**One parser.** `requestBodyOf`
(`api/derive-documents.ts:37-45`) parses any wire,
so it becomes `bodyOf` and is applied to
`pair.response`. Its two callers there, the document
walk (`:95`) and the head reader (`:159`), are the
funnel every family derive runs through. The
instance revision reader
(`api/derive-record-instances.ts:78-106`) and the
four version and revision reads that parse
`found.request` directly
(`api/document-family.ts:396`, `:473`;
`api/routes.ts:5387`, `:5607`) read
`found.response`. The author and the stamp keep
coming from `requester_identity_id` and
`response_at`.

**What retires.** The operation decoder and its
prefix walk, with the replayer (§5). The
request-side sameness pre-check `requestDiffers`
and its structural comparator
(`api/routes.ts:1025-1082`) with its three callers'
row filtering (`:1090-1097`, `:1479-1484`,
`:1965-1973`). The gate's same-body PUT fast path
(`api/api.ts:1199-1261`), which compares request
octets and re-reads the head in a transaction of
its own; the statement's matched answers in its
place.

**Composed writes and the pre-check's job.** The
pre-check existed because one matched row
suppresses a whole statement
(`shared/ledger-statement.ts:243-256`), and a
composed edit that changes one attribute of three
must not be suppressed by the two it left alone.
The former keeps that job on the statement's own
terms: a handler that forms several siblings omits
any whose state equals its head's stored body, byte
for byte, the head it already read to merge. With
none left it stores nothing and answers the
parent's head, as a no-op does. A create resent
whole still reports matched from the statement and
stores nothing, receipt included, which is the
store's rule (`docs/superpowers/specs/2026-09-23-ledger-store-design.md:341-423`)
and the right one: a create with a different join
is not a create.

## 8. Requests: received, or nothing

**The rule.** `request` holds what was received,
or nothing. A live request stays stored as it
arrived, credential lines hoisted as today
(`api/message-pair.ts:304-317`). Every synthesized
former stores zero request bytes, which closes the
message plane's Decision 6 list in full: the
document siblings (`api/routes.ts:3615-3653`), the
token events (`api/message-pair.ts:437-470`), the
invitation's document and the seat it grants
(`api/invitations-domain.ts:575-603`, `:698-710`),
the assertion ticket
(`api/authentication.ts:1341-1362`), the credential
rehash (`:1772-1811`), and the seed. The former's
`emptyRequest` path (`api/message-pair.ts:306-307`)
becomes the only path for a synthesized pair.

**What that retires.** The synthesized request line
that carries the instance revision's `If-Match`
today (`api/routes.ts:3997-4000`), since the latch
rides the row. The "zero-byte request has no
`If-Match`" branch of `ifMatchOf`
(`api/message-pair.ts:1093-1094`) becomes the norm.

**The seed.** The landing already strips the
`request-id` line from every rehearsed row
(`api/ledger-seed.ts:116-135`, applied at
`:328`); it now also empties the row's request.
The statement hashes what it stores, so the request
hash follows, and depths and predecessors are
untouched. The rehearsal (`:288-304`) is unchanged
in shape: it runs the live ops, which now form what
§3 through §6 say. Its calls gain what the routes
require: the instance chain's genesis declares
itself, the value-bearing transitions latch both
heads (`api/mock-data.ts:474-493`), the
default-organization lands its state, the two direct
work-order writes carry the whole state with births,
and every seeded body drops `organization_id`.

**The shape moves.** Each seeded transition now
lands a work-order version, and the create's
synthesized claim pair is gone, so the pair count,
the operation-id count, and the depths change from
the seed spec's 1,453 / 1,450 / 1,451, 1, 1
(`docs/superpowers/specs/2026-09-23-ledger-seed-design.md:597-608`),
and API.md's 1,455 with the root. The plan
re-measures with `measurements/probes/seed/shape.ts`
and pins the new numbers where the old ones are
pinned (`tests/mock-data-pairs.test.ts`).

**SCHEMA.md** says a pair is the request bytes plus
the response bytes (`SCHEMA.md:11-12`); it will say
the request as received, or nothing.

## 9. The client

**Paths.** Client call sites are cited at today's
paths and lines. The client spec moves them to
`client/`, whole where the move is a `git mv`
(`docs/superpowers/specs/2026-09-24-packageable-client-design.md`,
Decision 9), and the plan re-cites the files its
Decision 4 splits. The plan executes after the
client lands.

**The rule.** The client latches what derives from a
head, and declares the one create that must. Where a
page holds no etag, it reads first, until the third
spec's units carry one per list item. Whole-state
PUTs from a form and creates by PUT of a fresh id
stay as they are; the form-edit hazard, one user's
PUT overwriting another's unseen change, goes to the
third spec's handoff.

**The transport.** `GETWithEtag`, `PUTWithEtag`,
`PATCHWithEtag`, and `POSTWithHeaders` exist
(`web-app/app/adapters/shared.ts:89-135`). `DELETE`
gains header fields and returns the etag, since a
release names the work order's head and answers its
state.

**Latch on the head held.** `putFlow`
(`flow-mutations.ts:515-552`) and undo
(`web-app/app/flow-operations.ts:727-772`) already
do. Joining them: the work-order edit
(`work-orders-mutations.ts:446-461`), claim
(`:473-502`, which already reads the work order),
release (`work-orders-deletions.ts:11-20`), binding
(`:428-444`), and transition (`:259-424`); the
position PUTs and the archive, which already read
first (`projects.ts:297-335`; `objectives.ts:
364-405`); conversion, on the idea (`ideas.ts:
331-392`); the record-type composed edit, on the
type (`records.ts:236-275`); invitation accept,
decline, and revoke, on the invitation
(`invitations.ts:203-223`, `:304-337`).

**Declare a create.** The instance create
(`record-instances.ts:137-152`) sends
`If-None-Match: *`; its verb does not change.

**Two calls change shape.** The value-bearing
transition sends two entity-tags, the work order's
and the instance's, where it sends the instance's
alone today (`work-orders-mutations.ts:406-412`);
the pure move sends the work order's where it sends
none (`:415-420`). The instance PATCH result's body
is the merged state projected, so the record detail
page (`web-app/records/detail.ts:624-629`) renders
from the answer instead of its delta.

**Refusals.** A 412 surfaces as today: the two flow
loops absorb theirs (`flow-mutations.ts:516-556`;
`flow-operations.ts:756-767`), and every other call
throws it as `RequestError`, as the instance PATCH
does now (`record-instances.ts:154`). The retries
bullet unifies that later. A 428 never reaches a
correct client; a 400 for a malformed tag is a bug.

**Unchanged.** The six POST creates, the grants and
refreshes, the DELETEs of documents, the same-tab
bell, the composition roots, and the client spec's
oracle: nothing here imports outside `client/` and
`shared/`.

## 10. The no-op, and the 412

**The no-op.** A write whose sibling's state equals
the head's, byte for byte, stores nothing at all,
receipt included, and answers 200 with the head's
response, projected for the requester, carrying the
head's etag. That is item 0's rule for a PUT,
applied to every write through the former; the
instance PATCH already does it
(`tests/api-instances-create.test.ts:575-614`). A
composed write's handler omits the unchanged
siblings first, per §7.

**One judge of a latch.** For every route this spec
converts, the statement alone judges a latch's
value: the gate checks presence and form, the
handlers' pre-checks retire, and the sibling carries
the client's latch. A stale latch is 412 from one
place, and a 412 sends the client back to read;
nothing re-fills the predecessor around a stale
body, and only the blind PUT retries on the server,
as before.

**What that does to the latched-write bullet.** The
message plane's Decision 2 refused the RFC 9110
§13.1.1 alignment, a 2xx when the head already holds
the requested state, because both head reads would
widen and the gate and the handler would each have
to match the new answer
(`docs/superpowers/specs/2026-09-23-message-plane-design.md:122-146`).
After this spec there is no gate or handler check to
match. The alignment becomes one branch in the
classifier, in both backends
(`shared/ledger-statement.ts:216-241`;
`api/ledger-statement-sql.ts:142-163`), and nothing
else moves. This spec takes no position on it and
keeps stale before matched. It hands the bullet one
more case that the same rule covers: a create
resent after a lost response is a declared genesis
whose head holds its state and supersedes the nil
id, so the bullet's narrowest reading answers it 200
with no special case.

## Error and wire

| Status | When |
|---|---|
| 428 | a required conditional absent, or a tag missing for a document the operation derives from; the body names the document (RFC 6585 §3) |
| 400 | a malformed entity-tag (RFC 9110 §15.5.1); a body with `organization_id`; a PUT with no body |
| 412 | a stale `If-Match`; a declared genesis on a live head; both headers sent; a tag naming no head the operation derives from (§13.1.1, §13.1.2, §13.2.2) |
| 409 | a POST create's taken name; an instance name that is retired (§15.5.10) |
| 201 | a genesis, own pair and sibling alike; a POST create's 201 carries `Location` (§15.3.2, §9.3.4) |
| 200 | a successor; a no-op |
| 204 | a document DELETE, unchanged (§9.3.5) |

Refusal bodies keep today's `{ error }` shape and
name the document and the fact. A landed answer's
`etag` names the parent sibling; `operation-id` and
`request-id` ride as today. The wire the client sees
changes where §4 and §9 say and nowhere else.

Both backends gain the classifier's one nil branch;
the statement keeps fourteen parameters; `genesis`
leaves the leading bind's vocabulary.

One deviation stands, inherited. RFC 9110 §9.3.4
forbids a validator such as `ETag` on a successful
PUT response unless the stored representation is
byte-identical to what the client sent; ours never
is, since the server stamps ids and orders keys, and
every document PUT has answered with an `ETag` since
item 0. The rule guards a client that mistakes its
own bytes for the representation; once the response
carries the representation, the deviation is letter
only. This spec adds no PUT that did not already
answer so, and hands the question to the third spec,
which defines the unit.

## Testing

Layer 1 in `tests/`. Layer 2 covers the pages that
write through changed calls: record detail, the
workbox, invitations, the organization switcher.
`./test postgres` pins the SQL nil branch and the
refusal mapping on the table.

Standing pins that change:

- `tests/ledger-store.test.ts:329` (genesis lands
  on nil) and `:765` (a second genesis answers 409):
  the class retires; the nil latch pins both.
- `tests/api-instances-create.test.ts:616` (two
  creates racing, 201 then 428): 412.
- `tests/api-write-status.test.ts:330-361` (the
  empty-body PUT arm): 400.
- `tests/api-flow-document.test.ts:410-486` (the
  locked table's genesis without a header): 428.
- `tests/api-work-order-*.test.ts` status and
  history-shape pins; `tests/derive-states-work-orders.test.ts`
  and `tests/derive-work-order-lifecycle-for.test.ts`:
  history from the chain.
- `tests/identity-tokens-reduce.test.ts`: the rank
  retires; head selection pins the same answers.
- `tests/ledger-seed.test.ts`, `tests/pg-ledger-seed.test.ts`,
  `tests/mock-seed.test.ts`, `tests/mock-data-pairs.test.ts`,
  `tests/drift-*.test.ts`: the seed's shape and
  request bytes.
- `tests/pair-write-coverage.test.ts:113`: the sets
  retire.
- `tests/api-identity-token-rotation.test.ts`: a
  refused rotation is not a rotation.

New pins:

- The conditional per class: absent 428, malformed
  400, both 412, with the memory backend's execution
  counter showing one statement and no pre-read.
- A declared genesis over a tombstone: 201
  elsewhere, 409 for an instance.
- A succession refusal: 409 when the handler
  declared, 412 when the client did.
- The former: zero request bytes on a sibling, the
  whole state as body, the parent's etag on the own
  response, one operation id across the statement,
  `Location` on a POST create's 201.
- A restricted requester's no-op PATCH answers only
  readable values.
- Work orders: each operation lands one version;
  history equals the chain; three births from one
  create; one expiry clock; the two-tag transition's
  428 and 412; two racing binds answer 201 and 412.
- Tokens: head selection equals today's fold over
  the seeded tokens; `parent_jti`; a refused
  rotation answers a refusal.
- The oracle: a test walks `api/` for a reader of
  `.request` and finds none outside the formers, the
  backends, the seed, and the gate's hoist.
- The seed's shape and `./test`, measured before
  and after.

## Docs that change when this ships

- ARCHITECTURE.md `## Derivation` (`:178-195`),
  `## Records` (`:215-238`), `## Work orders`
  (`:239-257`).
- API.md `## Two PUT classes` (`:129-169`), which
  becomes the conditional classes;
  `## Compositions worth knowing` (`:170-245`);
  `## Seed pair formation` (`:256-262`).
- SCHEMA.md `## The one table` (`:11-12`).
- TODO.md: item 1's clauses this spec closes, the
  default-organization defect, a Later-work bullet
  for the four counting checks with the
  advisory-lock oracle, and a note on the
  latched-write bullet that the alignment is now
  classifier-only.
- TEST-PLAN.md gains the walk cases.

## For the next brainstorms

The third spec inherits:

- `bodyOf`, and `responseFromHead` as the seed of
  the one read function.
- Projection's home, today five sites and the
  former's answer.
- The work-order head's new keys, flows' sidecars,
  and `hasUndoHistory`, on the unit or off it.
- Per-item etags in lists, and with them the blanket
  client rule and the form-edit hazard §9 leaves.
- The stream GET's tombstone served as 200.
- `operation-id` on reads.
- The `ETag` on a PUT response, RFC 9110 §9.3.4.

The latched-write bullet inherits the
classifier-only alignment and the resent-create
case.

Later work inherits:

- The four counting checks that close before their
  statement, with the oracle: two writers race the
  last admin seat, a record-type DELETE against an
  instance create, an attribute DELETE against a
  flow PUT, an instance DELETE against a binding,
  under one write transaction and the
  organization's advisory lock.
- The credential PUT that stores a secret unhashed.
- The client-minted stamps that drive primary-org
  resolution and the revocation comparison.
- The seat authorizer that probes its own prefix.
- The comments that name absent code, joining the
  eleven the bullet already names.

Item 2 inherits the credential and code bodies.
Item 11 inherits the flow walk, now from responses.
Item 13 inherits recording claim expiry.

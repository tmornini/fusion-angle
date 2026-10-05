# A work order's history is its versions

- Date: 2026-10-04
- Status: design confirmed by the owner section by
  section, pre-plan
- Worktree: `.worktrees/work-order-events`, branch
  `work-order-events` (AGENTS.md § Worktrees, with
  `membership-and-versions` in place of `master`)
- Base: `membership-and-versions` at `2acbc87a` (the
  fourth spec's tip measure cited)
- Lands: `git -C .worktrees/membership-and-versions
  merge --ff-only work-order-events`, on the owner's
  word, while `membership-and-versions` is unlanded;
  if it has landed, rebase onto where it landed and
  fast-forward there. `master` stays at
  `origin/master`. Cleanup after landing, in this
  order: (1) the owner runs `git worktree remove
  .worktrees/work-order-events` from the main
  checkout, since the sandbox cannot delete a
  worktree; (2) then `git -C <the landing worktree>
  branch -d work-order-events`, never from the main
  checkout. Never `-D`.
- Ships: a work order born with its node, every
  version saying where it is and how it got there;
  the seed creating through the live POST; work-order
  `versions/` and `versions/:etag` as stored
  responses; a client that reads the present from the
  head and the past from `versions/`; the census
  empty, the covenant written, the handler-JSON GET
  slot retired
- Defers: immutable document types (a `## Later
  work` bullet aimed at the join documents); the
  flow-stats fan-out; everything item 2 onward owns
- Witness: `./test` at the tip, medians of three,
  against 112.8 s; the seed's pair count and stored
  bytes, base and tip; the operator's
  `./bin/measure --record --visualize` at the tip
  only, against `7d34749` (`measurements/history.jsonl`),
  gating nothing

## Problem

One GET route still answers handler JSON:
`organizations/:id/work-orders/:id/history`
(`tests/parted-reads.test.ts`). `workOrderHistoryFor`
(`api/derive-states.ts:544-567`) reads every PUT the
work order stored, flattens each version's `events`,
and answers the rows newest first, each carrying an
`entity_id` the path already names.

The events are already stored where a stored
response can serve them. State by PUT made every
operation land a whole version whose body carries the
events that version recorded (`events`,
`api/work-order-version.ts`); history is
`versions.flatMap(v => v.events)` reversed
(`historyOf`, `:320-325`). The fold is a read over
exactly the chain `versions/` serves for seven other
families.

The client re-derives from that history what the head
already says. `currentNodeIdFromHistory` finds the
node the head names in `state`;
`activeClaimFromHistory` judges a claim against the
client's clock and `at + lockTimeout`, where the head
carries `claim.expires_at` minted by the server
(`client/work-orders-queries.ts:330-385`). The workbox
inbox reads one history per work order to learn the
claim, the node, and the last transition's author and
time (`web-app/workbox/index.ts:193-240`). The
transition write and its validator each read a whole
history to learn the current node
(`client/work-orders-mutations.ts:248-253`,
`client/record-transitions.ts:144-153`).

What the head does not say, nothing stores in one
place: who moved the work order into its node, and
when, lives only in the events of whichever earlier
version recorded the move.

And a work order may exist with no node. The document
PUT creates one when no head exists
(`postWorkOrderDocumentOp`, `fieldsVersion`'s no-head
branch, `api/routes.ts:2283-2307`), and the seed
creates every work order that way before replaying
its traces. Every reader treats the result as a fault
inside the walls: the inbox throws "has no
transitions", the detail page and the gate throw "no
current node", and `currentNodeIdFor` falls back to
the create node (`api/routes.ts:1818-1832`).

This is item 1's fifth spec (`TODO.md:455-557`).

## Axiom

A work order is born with its node; every version
says where the work order is and how it got there;
its history is its versions, served as stored.

## Decisions

1. **History is `versions/`.** `…/work-orders/:id/
   versions/` and `…/versions/:etag` serve stored PUT
   responses, as for every versioned family.
   `…/history` retires. §3.
2. **Events stay in the version that recorded them.**
   No event documents; TODO item 1's sub-collection
   plan is replaced by this spec. §3.
3. **Every version carries `state` and `transition`.**
   `transition: { member_id, at }` names the move into
   the current node; both keys are required. §1.
4. **Creation is the POST alone.** The document PUT
   supersedes and never creates; on an absent work
   order it answers 404, 403 when foreign. §1.
5. **The seed creates through the live POST.** Births
   are the trace's first two events and a creator's
   claim, at the trace's own times. §2.
6. **The client reads the present from the head.**
   Node, claim, and last transition from the head;
   `versions/` only where a timeline is shown. §4.
7. **Absence gets a name at the adapter.** The twin's
   `claim` is `{ state: 'unclaimed' } | { state:
   'claimed', … }`; `nodeId` and `transition` are
   required. `ClaimStatus`'s discriminant becomes
   `state`. §4.
8. **Chain order is the order.** The client's fold
   keeps the ledger's chain order; `projectTransitions`
   drops its `(at, id)` sort. §4.
9. **The census empties, then the slot goes.** The
   commit that retires `/history` empties `PARTED` and
   lands `## A response is one unit`; the next retires
   `Route.get`. §5.
10. **Server folds no history.** `workOrderHistoryFor`,
    `workOrderLifecycleStatesFor`, `workOrderVersionsFor`,
    and `historyOf` retire; tests read through
    `versions/`. §3.
11. **Immutable document types go to later work,**
    aimed at the join documents. §5.

## Found on the base

1. **The traces fit the create.** Across the seed's
   145 work orders and 861 trace events
   (`api/mock-data/work-orders.ts`,
   `api/mock-data/lead-to-close-flow.ts`), every
   trace has at least two events; the first is its
   graph's `isCreate` node; the first two share a
   member; each work order has exactly one flow join,
   at the first event's `at`. In 144 of 145 the second
   event is later than the first: the work order
   sojourns in its create node. The create takes each
   birth's `at` from `stateEventAts` and requires no
   equality (`api/validators.ts:3582-3663`).
2. **The create births three.** `createdVersion`
   (`api/work-order-version.ts:114-145`) takes start,
   post-start, and the creator's claim; `births[1]`
   is the node the work order sits at. The live
   client sends three `nowUtc()` stamps
   (`client/work-orders-mutations.ts:168-182`).
3. **The inbox's cost is its fan-out.** At `7d34749`
   (medians of 25) the workbox is ready in 141.5 ms,
   118.0 ms of it `fetch:active-list`; the detail page
   fetches in 30.2 ms and the members list in 16.0 ms.
4. **Version reads are generic.**
   `documentVersionsSelectRoute` and
   `documentVersionSelectRoute`
   (`api/document-family.ts:345-410`) serve every PUT,
   oldest first, and the PUT a tag names; a POST is
   not a version. `WORK_ORDERS_WIRING` is
   `'stateless'` with no DELETE, so no work order is
   Gone.
5. **The history derives have test callers only,**
   bar the route. `workOrderLifecycleStatesFor` is
   read by fifteen test files; five client helpers
   (`getWorkOrderCurrentNodeId`,
   `getWorkOrderActiveClaim`,
   `getActiveClaimsByWorkOrder`,
   `getWorkOrderTransitionEvents`,
   `getTransitionEventsByWorkOrder`) by tests alone.
6. **The join documents rewrite.**
   `postFlowWorkOrderDocumentOp` and
   `postFlowRecordDocumentOp` (`api/routes.ts:
   2313-2360`) land a PUT with no latch, so a second
   PUT at a join's name replaces which work order or
   record it joins, and when.

## Out of scope

- Immutable document types: a `## Later work` bullet
  (§5).
- Flow-stats reading `versions/` per work order: it
  charts whole timelines; a collection-wide read is
  its own question.
- An etag in `transition`: a version names its own
  etag in its stored `etag` line, and no reader
  fetches the version a transition landed in.
- The create's `states[2]` is not checked to be
  `'claimed'`; the retries bullet; the decode
  reductions; pagination.

## Sequence

Every commit is green when it lands; each step makes
the next possible, so no commit carries a
compatibility shim.

1. **The seed creates through the POST** (§2).
2. **The document PUT supersedes only** (§1).
3. **The `transition` facet, required** — writers,
   validator, both types — and the create-node
   fallback's retirement (§1).
4. **The `versions/` routes** (§3).
5. **`WorkOrderEventEntity`** replaces the history
   row type in `shared/`; the version's
   `WorkOrderEvent` becomes it.
6. **`ClaimStatus`'s discriminant to `state`,** a
   rename alone.
7. **The twin's three fields** (§4).
8. **Readers move, one per commit:** inbox, detail,
   transition write, validator, flow-stats.
9. **Client helpers without a reader retire.**
10. **`/history` retires;** the census empties; the
    covenant lands (§5).
11. **The `get` slot retires** (§5).
12. **Oracle tests read through `versions/`.**
13. **The server folds retire** (§3).
14. **Docs.**

## 1. The version is born with its node

**The facet.** `transition: { member_id, at }` sits
after `state` in the version's key order (`ordered()`,
Interpretation K). `state` and `transition` move from
`WORK_ORDER_VERSION_OPTIONAL` to
`WORK_ORDER_VERSION_KEYS` (`api/validators.ts:
1599-1608`); `validateWorkOrderTransitionFact` takes
only `member_id` (an identifier) and `at` (a
timestamp), as `validateWorkOrderClaimFact` does.
`WorkOrderVersion` and `shared/types.ts`
`WorkOrderEntity` gain both as required.

**Its writers.** `createdVersion` sets it from
`births[1]` and the creator; `transitionedVersion`
from the moving event's member and `at`, whether the
claim is kept or released. Claim, release, bind, and
the fields PUT carry it through the head's spread,
unchanged.

**Creation is the POST.** `postWorkOrderDocumentOp`
reads the head through `requireWorkOrderHead` first:
an absent work order is `missedReadError`'s 404, a
foreign one 403 (the write authorizer already fences
the path). A present one lands `fieldsVersion(head,
fields)` under today's latch rules, unchanged — no
`If-Match` becomes required; a client's
`If-None-Match: *` on it is the statement's 412.
`fieldsVersion` loses its no-head branch.

**Preconditions on an absent work order are
ignored.** RFC 9110 §13.2.1: a server MUST ignore
received preconditions when its response without them
would not be 2xx or 412. Today an unconditional PUT
at a never-written id is a 201 genesis, so an
`If-Match` there is evaluated and fails, 412. Once the
PUT cannot create, the unconditional answer is 404, so
`If-Match` and `If-None-Match` are both ignored and
the answer is 404 — as `workOrderOperation` already
answers claim, release, bind, and transition
(`api/routes.ts:1703-1710`). AGENTS.md's "even for an
id never written" holds where a PUT can create; it
gains that qualifier.

**Internal defense retires.** `currentNodeIdFor`'s
fallback to the create node goes: a version names its
node. The client's "has no transitions" and "no
current node" throws go with §4.

## 2. The seed creates through the POST

Each seeded work order is one `POST …/work-orders/`
invocation, requested by its trace's first member:

| Field | Value |
|---|---|
| `id`, `workOrder` | the work order and its fields |
| `flowWorkOrderId`, `flowWorkOrder` | its one flow join |
| `states` | `[trace[0].state, trace[1].state, 'claimed']` |
| `stateEventAts` | `[trace[0].at, trace[1].at, trace[1].at]` |
| `stateEventIds` | `[trace[0].id, trace[1].id, <claim id>]` |

The claim id is hand-authored, one per work order,
deterministic as the seed's others. The claim's `at`
equals the post-start birth's, so the version's chain
order stays monotonic in time; its `expires_at` is
historical, so every seeded claim has lapsed and no
reader judges it held.

The rest of each trace replays through
`postSeedWorkOrderTransitionOp` from `trace[2]`, as
today. WO01's value-bearing chain and its binding are
unchanged.

Retired from the seed: the work-order document-PUT
invocations, the separate flow-join PUT invocations,
and the transition invocations for each trace's first
two events. The fingerprint and pair-count pins are
rewritten to the new truth; the seed comment at
`api/mock-data/seed-message-pairs.ts:1745-1756`, which
explains why the seed avoided the create, goes.

## 3. Version reads

Beside `organizations/:id/work-orders/:id`:
`documentVersionsSelectRoute(WORK_ORDERS_WIRING)` and
`documentVersionSelectRoute(WORK_ORDERS_WIRING)`.
Every part's body is a whole version, its own
`events` with their `field_values` included.
Member-tier GET on `/work-orders` admits both by
segment prefix, as it admits `/history` today. The
fence, the 403/404 ladder, and the three envelope
lines are the generic route's.

Retired: the `/history` route and `workOrderHistoryFor`;
`WorkOrderHistoryEventEntity`; the comments naming
`/history` at `api/routes.ts:4528` and `:5443`. Then,
once tests read through `versions/`:
`workOrderLifecycleStatesFor`, `workOrderVersionsFor`,
and `historyOf`, which nothing else reads.
`TransitionFieldValueEntity` stays: events carry it.

The wire changes from a newest-first JSON array of
event rows to oldest-first stored responses. Both
clients are ours, and §4 moves them before the route
goes.

## 4. The client

**The wire type.** `WorkOrderEntity` gains `state`,
`transition: { member_id, at }`, and `events:
WorkOrderEventEntity[]`; `claim?` keeps its `?`,
since an absent key is absence on the wire.
`WorkOrderEventEntity` is `{ id, state, member_id,
at, field_values }`.

**The twin.** `toWorkOrder` adds, none optional:

- `nodeId: Id` from `state`;
- `transition: { memberId, at }`;
- `claim: { state: 'unclaimed' } | { state: 'claimed',
  memberId, at, expiresAt }`.

The claim's discriminant is its `state`: one claim at
different moments, not different sorts of thing.
Claimed now is `claim.state === 'claimed' &&
!isExpiresAtPassed(claim.expiresAt)`. The
presenter's `ClaimStatus`
(`web-app/app/presenters/workbox-detail.ts:174`,
`:283`) takes `state` as its discriminant too.

**Timelines.** `getWorkOrderVersions(ctx, id)` is
`GETCollection` of `…/versions/`, as `getFlowVersions`
is. `workOrderEventsOf(versions)` flattens `events`
in chain order, oldest first. `projectTransitions`
and the field-values grouping take those events;
`projectTransitions` keeps chain order, since two
events can share an `at` (§2's claim birth does).

| Reader | Reads |
|---|---|
| Workbox inbox | heads only: `nodeId`, `claim`, `transition` |
| Workbox detail | the head; `versions/` for the timeline and field values by event |
| `postWorkOrderTransition` | the held twin's `nodeId`; no history |
| `validateRecordTransition` | the head; no history |
| Flow-stats | `versions/` per work order, for whole timelines |

Retired: `getWorkOrderHistory`; `getWorkOrderHistories`
(a `versions/` fan-in serves flow-stats);
`currentNodeIdFromHistory`; `activeClaimFromHistory`;
`transitionEventsFromHistory`; the five helpers only
tests read (Found 5); the `lockTimeoutByWo` maps; the
"has no transitions" and "no current node" throws.

## 5. The census, the covenant, and the slot

**The commit that retires `/history`** deletes its
route row, so no route defines `get`, and sets
`PARTED` to `[]` in `tests/parted-reads.test.ts`,
whose header then says the list is empty. For that
commit the test still fails if any route adds a
`get`. The same commit adds `## A response is one
unit` to ARCHITECTURE.md in TODO item 1's approved
wording, with the two file references it promises:
`servedResponse` and the client's multipart splitter.
It drops "One GET route still answers handler JSON"
(`ARCHITECTURE.md:222-225`) and pins `/history` as a
router 404 in the do-not-resurrect list.

**The next commit** removes `get` from `Route` and
`route(…)` and the handler-JSON branch of
`api/api.ts` (`:1018-1040`): a GET selects or is 405.
`row.get` no longer type-checks, so
`tests/parted-reads.test.ts` is deleted; `deno check`
holds the covenant from here. `GetHandler` stays for
`documentGetHandler` and
`documentCollectionGetHandler`.

**Immutable document types** leave item 1 for a
`## Later work` bullet: a family declares itself
immutable where it declares its conditional; every
write is a genesis under the never-written latch, so a
second write at a written name stores nothing (412
for a client's declaration, 409 for a handler's) and
a retired name answers 410; DELETE answers 405; only
erasure removes pairs. Its consumer is the join
documents (Found 6). Oracle: a second PUT at a
written join name stores nothing and answers 409 or
412.

## Error and wire

| Status | When |
|---|---|
| 200 | a work order, its `versions/`, a version; a fields PUT equal to the head |
| 201 | a create; a fields PUT that lands |
| 403 | the fence; a foreign work order on any route |
| 404 | a document PUT, claim, bind, or transition on a work order never created, whatever its preconditions (RFC 9110 §13.2.1); a tag naming no PUT; `…/history` |
| 405 | a GET on a route that selects nothing |
| 409 | a resent create |
| 412 | a latched write whose head has moved; `If-None-Match: *` on a work order that exists |

Every 2xx read carries the envelope's three lines.
Refusals keep today's `{ error }` body. No work order
is 410.

## Testing

Layer 1 in `tests/`, then `./test postgres`. Layer 2
(`./test validate browser`) and `./bin/measure` need
Chrome: the operator runs each and tees it under
`.worktrees/work-order-events/.superpowers/`.

New pins, each red before its change:

- A document PUT on an absent work order is 404 and
  stores nothing — bare, with `If-Match`, and with
  `If-None-Match: *` alike; on a foreign one, 403.
- `validateWorkOrderVersion` refuses a version
  without `state` or without `transition`, and a
  `transition` with any other key.
- `createdVersion` sets `transition` from
  `births[1]`; `transitionedVersion` from its event,
  kept and released alike; the other operations
  carry it unchanged (`tests/work-order-version.test.ts`).
- The history oracle
  (`tests/work-order-history-oracle.test.ts`):
  every seeded work order's events equal
  `tests/fixtures/work-order-histories.json`'s rows
  with exactly one `claimed` birth added at
  `trace[1].at`, and nothing else changed. The
  fixture file is not regenerated.
- `…/versions/` and `…/versions/:etag`: stored
  responses, oldest first; 403 foreign, 404 absent,
  404 for a tag naming no PUT
  (`tests/api-versions-etag.test.ts`'s pattern).
- The inbox issues no `versions/` request
  (`tests/fixtures/recording-fetch.ts`).
- `toWorkOrder` maps `nodeId` and `transition`, and an
  absent `claim` to `{ state: 'unclaimed' }`.
- `projectTransitions` keeps chain order for two
  events at one `at`.
- `GET …/history` is a router 404.

The thirteen test files that read
`workOrderLifecycleStatesFor` as an oracle read
through `tests/fixtures/work-order-events.ts`, which
GETs `…/versions/` and folds with the client's
`workOrderEventsOf`.
`tests/derive-work-order-lifecycle-for.test.ts` and
the work-order case of
`tests/drift-phase14-cores-parity.test.ts` are deleted
with the function they named.

Standing pins that change are rewritten to the new
truth or deleted with the behavior they named, never
weakened: the seed's fingerprint and pair counts;
tests asserting a node-less work order or a
document-PUT genesis; tests of the retired client
helpers; tests of history rows' `entity_id` and
newest-first order; `tests/api-work-order-history*.test.ts`
and `tests/api-entity-history-routes.test.ts`. The
plan names each file.

## Docs that change when this ships

- ARCHITECTURE.md: `## A response is one unit`; the
  handler-JSON sentence goes; the do-not-resurrect
  pin (§5).
- AGENTS.md `### Follow the RFCs`: an `If-Match` on a
  never-written id is 412 where a PUT can create it;
  where only a POST creates, the unconditional 404
  stands (RFC 9110 §13.2.1, §1).
- API.md: step 8 (`:73-85`) — a GET selects or is
  405; the work-order routes and the status table.
- The generated API documentation, through its
  generator and `./test api-docs`.
- FLOW-CANVAS.md `:252-253`: history becomes the
  `versions/` read.
- TEST-PLAN.md: the work-order history cases
  (`:4434-4600`) read `versions/` and the head; B19
  and C2's documentation hashes lose
  `get/organizations/id/work-orders/id/history` and
  gain the two `versions` hashes.
- TODO.md: item 1's fifth-spec paragraph
  (`:534-557`) gives way to this spec's citation and
  its tip figures; item 1 stays listed until items
  0–3 deploy, as item 0 does; the immutable document
  types bullet in `## Later work` (§5).

## For the next brainstorms

Item 2 begins with item 1 complete: every GET serves
a stored response, and the type system says so.

Whoever takes the join documents inherits immutable
document types and Found 6.

Flow-stats keeps one `versions/` read per work order;
a collection-wide versions read, if measured into
existence, is its question.

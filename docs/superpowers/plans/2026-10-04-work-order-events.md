# Work-Order History as Its Versions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this spec's worktree (AGENTS.md
> § Worktrees, with `membership-and-versions` in place of
> `master`): `.worktrees/work-order-events`, branch
> `work-order-events`, cut from `membership-and-versions`
> at `2acbc87a`, rebased (owner, 2026-10-05) onto
> `membership-and-versions` at `ed1fac5c`, and carrying
> the spec, `fb94bd53`, and this plan. Do not create a
> worktree. Do not land. Do not rebase. Do not merge,
> force-push, or delete a branch.
> The branch lands by `git -C .worktrees/membership-and-versions
> merge --ff-only work-order-events`, on the owner's word,
> and not before (Task 26). `master` stays at
> `origin/master`; nothing here moves it. The plan is a
> dependency graph: dispatch by the graph, not by the
> numbering. One worker. Every subagent shares this one
> worktree, so dispatch serially in topological order; the
> graph records why the order holds, and is not a license
> to run tasks in parallel.

> **For the dispatching orchestrator (AGENTS.md
> § Subagents):** every subagent prompt MUST begin with
> the literal phrase `Go to Medium Church!`, then push
> down: the 78-char lint on code and scripts (not `.md`),
> 4-space indent, spell `organization` (never the `org`
> abbreviation as an identifier), present-tense-imperative
> ~50-char commit subjects with the trailer below, Author
> stays Tom Mornini (do not pass `--author`), the
> commandments and abominations each task names (Global
> Constraints, then the task's own **Doctrine** line), and
> the codebase patterns: RequestContext first, a client
> verb returns an `HttpMessage` or keeps one, a write from
> a held message latches on it, SafeHtml from presenters,
> snake_case storage / camelCase domain, HTTP-verb naming
> (`getNoun`/`putNoun`/`deleteNoun`/`postNounOperation`),
> validators at the gate, no untyped `any`. Execution is
> superpowers:subagent-driven-development. **coder**
> implements every task. **planner** reviews: a
> spec-compliance review, then a code-quality review, each
> a fresh planner, before the next task starts. A small
> fix round goes to a coder and is then re-reviewed by a
> fresh planner. The **architect** takes a task only
> after a coder has failed its fix round. Pass no model
> override and no `isolation`. Subagents never run
> `./deploy`, `./bin/measure`, or `./test browser`;
> Chrome is the operator's. Master owns 8080. One concern
> per commit. A fix of a task's unpushed tip may
> `git commit --amend` only while that commit is still the
> tip and still one concern. Never amend any other commit.
> Never rebase, merge, force-push, or delete a branch.

**Goal:** A work order is born with its node; every
version says where the work order is and how it got
there; its history is its versions, served as stored —
and with that, every GET in the product serves a stored
response, and the type system says so.

**Architecture:** The seed moves to the live create
first, then the document PUT stops creating, so every
stored version is born with a node and the `transition`
facet can be required. The `versions/` routes land beside
`/history`. The client's twin learns node, transition, and
claim from the head; each reader moves off history one
commit at a time; the client helpers with no reader
retire. Then `/history` retires (the census empties and
the covenant lands), the `get` slot retires, the oracle
tests read through `versions/`, and the server's folds
retire. Docs last.

**Tech Stack:** Deno 2.9.6, TypeScript strict under
`deno.json` (`noUncheckedIndexedAccess`,
`verbatimModuleSyntax`, `erasableSyntaxOnly`),
`Deno.test` + `@std/assert`, the memory backend for
Layer 1, Docker Postgres for `./test postgres`. No new
dependencies.

**Spec:**
`docs/superpowers/specs/2026-10-04-work-order-events-design.md`
(commit `fb94bd53`). Read it whole first; its decisions are
settled. The owner confirmed it section by section, and on
2026-10-05 settled Interpretation A below.

**Worktree:** `.worktrees/work-order-events` on branch
`work-order-events`. Every `file:line` in this plan is at
`ed1fac5c` plus the spec. The base's eight commits past
`2acbc87a` touch no `api/` or `shared/` file, so the seed
and every server cite are as at `2acbc87a`; the spec's own
line cites are at `2acbc87a`, and its TEST-PLAN cites sit
six lines lower here. A task
that finds a cite moved re-finds it by its quoted text; a
cite whose text is gone is a stop (Interpretation F).

---

## Global Constraints

- **Scope.** The spec's Decisions 1–11 and its Sequence
  1–14. Out of scope, as the spec says: immutable
  document types (a `## Later work` bullet only, Task 23);
  flow-stats reading a collection-wide versions view; an
  etag in `transition`; checking the create's `states[2]`
  is `'claimed'`; the retries bullet; the decode
  reductions; pagination.
- **Settled (do not reopen).** History is `versions/`;
  events stay in the version that recorded them; every
  version carries `state` and `transition: { member_id,
  at }`; creation is the POST alone; the seed creates
  through the live POST; the client reads the present
  from the head; the twin's claim is `{ state:
  'unclaimed' } | { state: 'claimed', … }`; chain order
  is the order; the census empties, then the slot goes;
  the server folds no history.
- **Green.** `./test validate` is green on every commit
  that lands on this branch. A red test is a step inside
  a task; the commit after the change is green. A route's
  wire never changes apart from its readers: the commit
  that changes an answer changes every client verb and
  test that reads it.
- **No assertion is weakened.** A standing pin a task
  names changes exactly as the task says: rewritten to
  the new truth, or deleted with the behavior it named.
  A pin a task does not name that goes red is a stop
  (Interpretation F).
- **Renames and moves stand alone.** Never a move or a
  rename in the same commit as a content change.
  `ClaimStatus`'s `kind` → `state` is its own commit
  (Task 8); the inbox read's extraction is its own commit
  (Task 10).
- **One concern per commit.** Subject ≈50 characters,
  present-tense imperative, no body beyond the trailer.
  This session's trailer is:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
```

  A later session uses its own harness's lines. Author
  remains `Tom Mornini`.
- **Voice.** 78-character lines in `api/`, `client/`,
  `shared/`, `server/`, `web-app/`, `tests/`, `bin/`, and
  scripts (not `.md`). Four-space indent. Spell
  `organization`. Comments say why, never what. No inline
  styles.
- **Commandments.** I Reliability: no reader trusts a
  history to say what the head says; a version the store
  holds always names its node. II Security: the fence and
  the write authorizer answer before any head is judged;
  a foreign work order is 403 on every route. III
  Uniformity: one versions read for every family; one
  claim vocabulary (`state`). IV Logic: chain order is
  the order; `at` ties are not broken by id. V Clarity:
  absence gets a name at the adapter. VI Immutability: a
  served version is the stored octets. VII Idempotency: a
  resent create is 409 and stores nothing; a PUT never
  creates. VIII Simplicity: no compatibility shim; each
  step makes the next possible. IX Generality: the better
  way replaces every similar site — every history reader.
  XI, XII: `./test` and the operator's measure are
  recorded at the tip, gating nothing.
- **Abominations.** Internal Defense (the "has no
  transitions" and "no current node" throws and the
  create-node fallback retire: a version names its node);
  Null and Default Values (absence of a claim is
  `{ state: 'unclaimed' }`, never `null` or a `??`);
  Test Weakening (Interpretation F); Unbidden Helper Code
  (no helper, fixture, or pin beyond what a task names);
  Premature Optimization (flow-stats keeps one `versions/`
  read per work order; no cache); Foreign Tongues (no
  `entity_id` on an event: the path names the work order).
- **Sandbox.** Before any `deno`, `./test`, or `./bin/*`:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
```

- **Layer 1, one file** (append `--filter "/…/"` to run a
  subset; a `--filter` unwrapped by `/…/` is a substring):

```bash
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write --allow-net \
    --allow-run=deno,./bin/serve,./deploy,sh,./test \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    tests/FILE.test.ts
```

  Below, "run one file" means this command with that
  file.
- **Type check fast:** `deno check --frozen api client
  shared server tests web-app`.
- **Layer 1, the gate:** `./test validate`.
- **Postgres and Chrome** are the operator's (Task 24).
- **Races.** TODO.md names the suites that race under
  `--parallel`. A trip gets one re-run, named in the
  task's report by its test title. A second failure, or
  any other failure, is real.
- **API documentation.** `./test validate` runs
  `generate-api-documentation --check`. A task that adds
  or retires a route runs `./bin/generate-api-documentation`
  and commits `web-app/api-documentation/` in the same
  commit.
- **Scratch files** go under `$TMPDIR/<task>-<name>`.

---

## Interpretations this plan fixes

The owner settled A. The rest resolve places where the
spec and the base meet; overrule any before dispatch.

**(A) A bare PUT on an absent work order stays 428
(owner, 2026-10-05).** The spec's §1 premise that "today
an unconditional PUT at a never-written id is a 201
genesis" does not hold at the base: the route's class is
`required` (`api/routes.ts:2862`), and the gate's
`preconditionRefusal` (`api/api.ts:294-299`) answers 428
to a PUT with neither header before any handler runs
(`tests/api-work-order-document.test.ts:486`). So: a PUT
with neither header answers 428, as today, on any id; a
PUT with `If-Match` or `If-None-Match: *` on a work order
never created answers 404 and stores nothing (the handler
reads the head first and throws `missedReadError`); on a
foreign one, 403 (the write authorizer). The spec's
§ Testing pin reads "with `If-Match`, and with
`If-None-Match: *` alike; bare, 428", and its error table's
404 row reads "a conditional document PUT". AGENTS.md's
`### Follow the RFCs` gains the qualifier in those words
(Task 23).

**(B) TEST-PLAN B19 and C2 carry no documentation
hash.** The spec's docs list says they lose
`get/organizations/id/work-orders/id/history`; neither
case names a hash, and the one hash-walking test
(`tests/browser/api-documentation.test.ts:279`) iterates
the generated `API_DOC_ROOMS`. Regenerating the docs
(Tasks 6 and 18) is the whole change. Task 23 edits no
B19 or C2 line.

**(C) `workOrderHistoryFor` retires with the folds.**
§3 groups it with the route, but nine test files besides
the route's own call it as an oracle until Tasks 20–21
move them. It retires in Task 22 with
`workOrderLifecycleStatesFor`, `workOrderVersionsFor`,
`historyOf`, and its row type `WorkOrderHistoryEventEntity`
— where Decision 10 and Sequence 13 put the folds. Task 18
retires the route row alone.

**(D) `ClaimStatus` lives in the client.** It is defined
at `client/work-orders-queries.ts:41-47`; the presenter
uses it (`web-app/app/presenters/workbox-detail.ts:174`,
`:241-249`, `:283`). The rename touches those, the page
(`web-app/workbox/detail.ts:263-264`, `:584-587`), and
`tests/presenter-workbox-detail.test.ts:838-877`.

**(E) The claim id.** Each seeded work order's birth
claim id is `seedIdentifier(\`seed-work-order-${id}-claimed\`)`
— the precedent is a seeded member's initial state event,
`seedIdentifier(\`seed-member-${m.id}-active\`)`
(`api/mock-data/seed-message-pairs.ts:1031`). The mnemonic
is hand-authored per work order; the hash makes it
deterministic, and it draws nothing from the generator's
`rng` (`api/mock-data/flow-workload.ts`), whose stream
would otherwise shift every later generated id and `at`.
Appendix A lists all 145 ids, computed on the seed at
`2acbc87a` (unchanged at `ed1fac5c`): all
distinct, none equal to any trace event id. In 66 of 145
work orders the claim id sorts before `trace[1].id` in
identifier order, so any `(at, id)` reader orders those
two events against the chain; that is Decision 8's case,
and WO01's (`oFyLhsd2EDgP4un8UY0H-A` after
`MvMOuqIfTHLyUnlPdOROQA`) is not among them.

**(F) Stop condition.** A standing pin a task does not
name that goes red: stop, report BLOCKED with the test's
title and message, and do not edit the pin. A pin a task
names changes exactly as the task says. A title that
contradicts its rewritten assertion is corrected in the
same edit. A cite whose quoted text is gone is a stop.

**(G) Test work orders are born through the POST
(Task 2).** Twenty-four test files create a work order
through the document PUT's genesis. Before the PUT stops
creating, they move, unchanged in purpose, onto one
fixture that POSTs the create. Its births reproduce the
node each test's work order sat at before its first
assertion, and its `claim` input says whether the
creator's birth claim is released: `'released'` gives
the unclaimed work order those tests modelled (a fresh
claim then lands `['claimed']` alone, as today).

**(H) The fields and the version are two types (Task
4).** `WorkOrderEntity` names today both the five fields
(seed rows, `validateWorkOrderEntity`'s result,
`WorkOrderDocumentBody`) and the GET's whole version.
Before the version's facets become required, the fields
get their own name, `WorkOrderFieldsEntity`, and
`WorkOrderEntity` extends it — a type split with no
behavior change, in its own commit.

**(I) Where the clock judges a claim.** "Claimed now is
`claim.state === 'claimed' &&
!isExpiresAtPassed(claim.expiresAt)`" is judged by the
page that reads the twin (the inbox rows, the detail
page), never by a presenter and never by a client
helper: each page already holds the clock today
(`activeClaimFromHistory`'s `msSinceUtc`). Two sites,
duplicated without shame (IX).

**(J) The inbox read gets a module (Task 10).** The spec
pins "the inbox issues no `versions/` request"; the read
lives inside the page module (`fetchInboxRows`,
`web-app/workbox/index.ts:193-241`), which a test cannot
drive without a DOM. Task 10 extracts it, unchanged, to
`web-app/app/workbox-inbox-rows.ts` as `getInboxRows`
(the precedent: `web-app/app/flow-stats.ts`'s
`getFlowStats`); Task 11 changes it under the red pin.

**(K) Chain order lands after its last sorting caller
(Task 16).** `projectTransitions`' `(at, id)` sort is
what turns flow-stats' newest-first history into
ascending order. It drops only once every caller passes
chain order: after the inbox stops calling it (Task 11),
the detail feeds it `versions/` (Task 12), and flow-stats
does (Task 15).

**(L) The doc generator's 410 on work-order versions.**
`statusCodesFor` lists 410 on every select version route
of a wired family (`web-app/app/generate-api-documentation.ts:695-707`),
because the version ladder answers Gone for a DELETE head
of any lifecycle; identities and AI agents, stateless and
with no DELETE on their item route, rely on that rule. The
work-order version rooms will list 410 by the same rule,
though no route writes a work-order DELETE. The spec's "no
work order is 410" holds of behavior (Task 6 pins it: a
work order's versions never answer 410). The generator is
not special-cased. Overrule to exclude `work-orders`.

**(M) The history fixture is born with its first test
reader (Task 18).** `tests/fixtures/work-order-events.ts`
— GET `…/versions/`, fold with the client's
`workOrderEventsOf` — first serves the HTTP `/history`
tests Task 18 moves; Tasks 20–21 then move the derive
oracles onto it, as Sequence 12 says.

---

## File structure

| File | Responsibility | Tasks |
|---|---|---|
| `api/mock-data/seed-message-pairs.ts` | the seed's create bodies, claim ids, traces | 1 |
| `api/mock-data.ts` | the rehearsal creates through the POST | 1 |
| `api/routes.ts` | `postWorkOrderCreationOp` exported; the document PUT supersedes; the fallback retires; the `versions/` rows; `/history` retires; `Route.get` retires | 1, 3, 5, 6, 18, 19 |
| `api/work-order-version.ts` | `transition`; `fieldsVersion` needs a head; `WorkOrderEvent` → `WorkOrderEventEntity`; `historyOf` retires | 3, 5, 7, 22 |
| `api/validators.ts` | `state` and `transition` required | 5, 7 |
| `api/derive-states.ts` | the folds retire | 22 |
| `api/api.ts`, `api/route-surface.ts` | the handler-JSON GET branch retires | 19 |
| `shared/types.ts` | `WorkOrderFieldsEntity`; `state`, `transition`, `events`; `WorkOrderEventEntity`; the history row type retires | 4, 5, 7, 22 |
| `client/work-orders-queries.ts` | the twin; `getWorkOrderVersions`, `workOrderEventsOf`; chain order; helpers retire | 8, 9, 12, 16, 17 |
| `client/work-orders-mutations.ts`, `client/record-transitions.ts` | the transition gate reads the head | 13, 14 |
| `web-app/app/workbox-inbox-rows.ts` (new) | the inbox's read | 10, 11 |
| `web-app/workbox/index.ts`, `web-app/app/presenters/workbox-inbox.ts` | inbox from heads | 10, 11 |
| `web-app/workbox/detail.ts`, `web-app/app/presenters/workbox-detail.ts` | detail from head and `versions/` | 8, 12 |
| `web-app/app/flow-stats.ts` | `versions/` per work order | 15 |
| `tests/work-order-fixtures.ts` (new) | `seedCreatedWorkOrder`: a test work order born through the POST | 2 |
| `tests/fixtures/work-order-events.ts` (new) | `getWorkOrderEvents`: GET `versions/`, fold | 18, 20, 21 |
| `tests/api-work-order-versions.test.ts` (new) | the two routes' pins | 6 |
| `tests/work-order-twin.test.ts` (new) | `toWorkOrder`'s three fields | 9 |
| `tests/parted-reads.test.ts` | emptied, then deleted | 18, 19 |
| docs | ARCHITECTURE (covenant at 18), AGENTS, API, FLOW-CANVAS, TEST-PLAN, TODO | 18, 23, 25 |

---

## Context an implementer must know

- **The version.** `api/work-order-version.ts`: a
  `WorkOrderVersion` is the fields plus `state`,
  binding, `claim`, and the `events` this version
  recorded; `ordered()` fixes key order
  (Interpretation K of the state-by-PUT plan). Builders:
  `createdVersion` (three births; `births[1]` is the node),
  `fieldsVersion`, `claimedVersion`, `releasedVersion`,
  `transitionedVersion`, `boundVersion`. Each reads a head
  and returns the next version; the statement judges the
  latch.
- **The handlers** (`api/routes.ts`):
  `postWorkOrderCreationOp` `:1616-1681` (the create: one
  statement, the work-order PUT and the flow join as
  genesis siblings of the received POST);
  `workOrderOperation` `:1692-1745` (claim, release,
  bind: head or `missedReadError`, then latch);
  `requireWorkOrderHead` `:2044-2061`;
  `landWorkOrderTransition` `:1936-2011`;
  `postWorkOrderTransitionOp` `:2070-2175`;
  `postSeedWorkOrderTransitionOp` `:2183-2218`;
  `postWorkOrderDocumentOp` `:2282-2305`;
  `currentNodeIdFor` `:1817-1830`, read at `:1859` and
  `:3290`. Routes `:4422-4501`.
- **Reads.** `workOrderHeadFor` (`api/derive-states.ts:477-493`)
  validates the stored head through
  `validateWorkOrderVersion` (`api/validators.ts:1695-1745`).
  The generic version routes are
  `documentVersionsSelectRoute` /
  `documentVersionSelectRoute` (`api/document-family.ts:345-410`):
  every PUT oldest first, a POST is never a version.
- **The client.** `ctx.GET`, `ctx.GETCollection`,
  `ctx.PUT(resource, body, latch?)`, `ctx.POST`,
  `ctx.DELETE`; a message's lines read as
  `message.query('header.etag').toText()`. `client/index.ts`
  re-exports `client/work-orders-queries.ts` with
  `export *`, so a retired export leaves `client/index.ts`
  untouched.
- **Tests.** `seedAdminSchema(db)` (`tests/test-fixtures.ts:19`);
  `organizationToken(sub?, organization?)` and `DEV_TOKEN`
  (`tests/token-fixtures.ts:42`, `:140`); `apiRequest`,
  `partsOf`, `messageOfResponse`, `pairIdOf`
  (`tests/http-fixtures.ts`); `inPageContext(db, token)`
  and `recordedContext(db, token)` → `{ ctx, sent }`
  (`tests/in-page-facade.ts:81`, `:95`), whose `sent` rows
  carry `method`, `path`, `ifMatch`, `ifNoneMatch`, `body`
  (`tests/fixtures/recording-fetch.ts`);
  `responseMessage(body)` (`tests/fixtures/response-message.ts`).
  Admin `XXZruirZyAOoRpNxaDnpSA`; Stark
  `AjdvjuECVZEgZoFajaIEkg`; Wayne `BBjWJsjYIDkTRKIIPrzWRw`.
- **Grep on macOS.** `git grep -E` has no `\b`; use
  `git grep -P`.

### The base, measured at `2acbc87a` plus the spec

The base's eight later commits (`ed1fac5c`) change no
`api/` or `shared/` file, so these figures are the base's.

- 145 seeded work orders (45 hand-authored, 100
  generated), 145 joins, 861 trace events. Every trace has
  ≥ 2 events in `(at, id)` order; `trace[0]` is the
  graph's `isCreate` node in all 145; `trace[0]` and
  `trace[1]` share a member in all 145; each work order has
  one join, at `trace[0].at`; `trace[1].at > trace[0].at`
  in 144. The array order of each trace equals its
  `(at, id)` order.
- The latest `trace[1].at` is `gate0001`'s
  (`eOlNZpGQfmCdpSFWXGkzFQ`, `daysFromNow(-1, 10, 0)`,
  `api/mock-data/work-orders.ts:2549`): its birth claim
  expires at `daysFromNow(-1, 18, 0)`, six hours before the
  seed's `now` (the start of today's UTC day). Every
  seeded birth claim has lapsed.
- One live create stores three rows: the received POST at
  `/organizations/<o>/work-orders/` (name = the id), the
  work-order PUT there, and the join PUT at
  `/organizations/<o>/flows/<f>/work-orders/`.
- Seed rows by kind at the base: PUT `…/work-orders/` 1007
  (145 document geneses + 861 transition versions + 1
  binding); POST `…/work-orders/:id/transition/` 861; PUT
  `…/flows/:id/work-orders/` 145; PUT
  `…/work-orders/:id/binding/` 1. Total pairs 2317.
- Stored characters (`request.length + response.length`
  summed over every seeded pair, one char per octet):
  **6,244,233**.
- The deepest seeded chain is `zOSyhzfDZMJDhZPsOvFwRg`,
  14 events; the next are 9.

---

## Review Focus

Five conditions the spec implies that no named pin
exercises; each names the task whose added test pins it.

1. **A seeded work order is claimed for the first time
   after the seed.** Its creator's birth claim has lapsed.
   Expected: the claim lands, recording `claim_expired`
   (authored by the creator) then `claimed`, and no 409.
   Task 1 adds
   `'claiming a seeded work order expires its birth claim'`
   to `tests/mock-data-pairs.test.ts`.
2. **A client resends `If-None-Match: *` to a work order
   that exists** (a retried create from an old client).
   Expected: 412, nothing stored, and the head unchanged —
   never a second version. Task 3.
3. **Two transitions land at one `at`** (a fast double
   move; the seed's claim birth ties `trace[1]` in every
   work order). Expected: the detail's timeline and
   flow-stats keep chain order. Task 16's pin, and Task 12
   asserts the detail timeline in chain order.
4. **One work order's `versions/` read fails mid-fan-in
   on flow-stats.** Expected: `getFlowStats` rejects with
   no sibling read still in flight (the covenant
   `2f338fb3` pinned for the first wave). Task 15 adds
   `'a rejected versions read leaves none in flight'` to
   `tests/adapters-flow-stats.test.ts`.
5. **A member (non-admin) opens a work order's timeline.**
   Expected: `versions/` answers 200 to a member of the
   work order's organization, as `/history` did. Task 6
   adds `'a member reads a work order\'s versions'`.

---

## Dependency graph

```text
T1 seed via POST ──┐
T2 tests via POST ─┴─ T3 PUT supersedes ─┐
T4 fields type ──────────────────────────┴─ T5 transition
T5 ─┬─ T6 versions/ routes ─────────┐
    ├─ T7 event entity ─────────────┤
    └─ T9 twin ◄── T8 ClaimStatus   │
T9 + T10 inbox module ── T11 inbox  │
T6 + T7 + T9 ── T12 detail ─────────┤
T9 ── T13 transition write ── T14 validator
T12 ── T15 flow-stats
T11 + T12 + T15 ── T16 chain order
T11 + T12 + T13 + T14 + T15 ── T17 helpers retire
T6 + T17 ── T18 /history retires ─┬─ T19 get slot
                                  ├─ T20 lifecycle oracles
                                  └─ T21 history oracles
T20 + T21 ── T22 folds retire
T16 + T19 + T22 ── T23 docs ── T24 gate ── T25 measure
T25 ── T26 report and wait
```

| Task | Depends on | Unblocks | Why the edge holds |
|---|---|---|---|
| T1 seed via POST | — | T3 | the seed is the largest document-PUT creator |
| T2 tests via POST | — | T3 | 24 test files create through the PUT |
| T3 PUT supersedes | T1, T2 | T5 | no version is born without a node after it |
| T4 fields type | — | T5 | the fields must not be typed as a whole version |
| T5 transition | T3, T4 | T6, T7, T9 | `state` and `transition` can be required |
| T6 versions/ routes | T5 | T12, T18 | the detail and the fixture read them |
| T7 event entity | T5 | T12 | `workOrderEventsOf` returns it |
| T8 ClaimStatus rename | — | T9 | the twin's claim and the status speak `state` |
| T9 twin | T5, T8 | T11, T12, T13 | readers read `nodeId`, `claim`, `transition` |
| T10 inbox module | — | T11 | the inbox's red pin needs a callable read |
| T11 inbox | T9, T10 | T16, T17 | — |
| T12 detail | T6, T7, T9 | T15, T16, T17 | brings `getWorkOrderVersions`, `workOrderEventsOf` |
| T13 transition write | T9 | T14, T17 | changes `recordTransitionViolationsFrom`'s input |
| T14 validator | T13 | T17 | — |
| T15 flow-stats | T12 | T16, T17 | uses T12's verbs |
| T16 chain order | T11, T12, T15 | T23 | no caller relies on the sort after T15 |
| T17 helpers retire | T11–T15 | T18 | no client reader of `/history` remains |
| T18 /history retires | T6, T17 | T19, T20, T21 | the census empties; the fixture lands |
| T19 get slot | T18 | T23 | no route defines `get` |
| T20 lifecycle oracles | T18 | T22 | uses the fixture |
| T21 history oracles | T18 | T22 | uses the fixture |
| T22 folds retire | T20, T21 | T23 | no caller remains |
| T23 docs | T16, T19, T22 | T24 | every passage true at its commit |
| T24 gate | T23 | T25 | — |
| T25 measure | T24 | T26 | — |
| T26 report | T25 | — | landing is the owner's word |

**Dispatch order** (serial, one worker): numeric —
T1, T2, …, T26 — which respects every edge.

**Critical path** (14 tasks): T1 → T3 → T5 → T6 → T12
→ T15 → T17 → T18 → T21 → T22 → T23 → T24 → T25 → T26
(T9 → T13 → T14 → T17 is as long).

**Shared files** (three or more tasks):

| File | Tasks |
|---|---|
| `api/routes.ts` | 1, 3, 5, 6, 18, 19 |
| `client/work-orders-queries.ts` | 8, 9, 12, 16, 17 |
| `shared/types.ts` | 4, 5, 7, 22 |
| `tests/mock-data-pairs.test.ts` | 1, 5, 20 |
| `tests/adapters-work-orders.test.ts` | 2, 17, 20 |
| `tests/presenter-workbox-detail.test.ts` | 5, 7, 8, 9, 12 |
| `web-app/api-documentation/` | 6, 18 |

---

## Task 1: Seed work orders through the create

**Agent:** coder.

**Spec:** Decision 5; §2; Found 1; Sequence 1;
§ Testing (the history oracle; the seed's pins).
Interpretation E.

**Doctrine:** I Reliability (the seed lands what the live
create lands); III Uniformity (one create, the live one);
VII Idempotency (a seeded create is a genesis). Risks:
Test Weakening (the oracle's fixture is not regenerated);
Unbidden Helper Code (three seed functions, no more).

**Files:**
- Modify: `api/routes.ts:1616` (export
  `postWorkOrderCreationOp`)
- Modify: `api/mock-data/seed-message-pairs.ts` (new
  `workOrderClaimEventId`, `seedWorkOrderTraces`,
  `workOrderCreateSeedBody`; the invocation loops at
  `:1381-1398`, `:1689-1785`; the comments at `:90-100`,
  `:935-942`, `:1746-1758`)
- Modify: `api/mock-data.ts:550-595` (`postWorkOrderChainsIn`),
  `:976-1050` (the second wave), imports `:15-25`,
  `:115-125`
- Modify (pins): `tests/work-order-history-oracle.test.ts`,
  `tests/mock-data-pairs.test.ts` (`:110-162`, `:560-586`,
  `:630-737`), `tests/ledger-seed.test.ts` (`:809-838`,
  `:985-1031`), `tests/drift-states.test.ts:510-522`,
  `tests/api-transition-legacy-cut.test.ts:40` (comment)

**Interfaces:**
- Produces, in `api/mock-data/seed-message-pairs.ts`:

```ts
export function workOrderClaimEventId(workOrderId: Id): Id;
export function seedWorkOrderTraces(
    events: readonly StateEntity[],
): ReadonlyMap<Id, readonly StateEntity[]>;
export function workOrderCreateSeedBody(
    row: Omit<WorkOrderEntity, 'organization_id'>
        & { readonly organization_id?: string },
    join: FlowWorkOrderEntity,
    trace: readonly StateEntity[],
): Record<string, unknown>;
```

- Produces: `postWorkOrderCreationOp` exported from
  `api/routes.ts` with today's signature `(db, body, actor,
  messagePair, organization)`.

- [ ] **Step 1: Write the oracle's red**

Rewrite `tests/work-order-history-oracle.test.ts` so each
expected history gains exactly one `claimed` birth. The
fixture file `tests/fixtures/work-order-histories.json` is
read as today and never written. History is newest first,
so the birth sits immediately after `trace[2]` and before
`trace[1]` — at index `rows.length - 2`.

```ts
import { workOrderClaimEventId } from
    '../api/mock-data/seed-message-pairs.ts';

// The create births three (spec §2): the trace's first two
// events and its creator's claim at the second's moment.
// Newest first, the claim sits just above the second.
function withClaimBirth(
    rows: ReadonlyArray<WorkOrderHistoryEventEntity>,
): WorkOrderHistoryEventEntity[] {
    const start = rows.at(-1)!;
    const node = rows.at(-2)!;
    return [
        ...rows.slice(0, -2),
        {
            id: workOrderClaimEventId(start.entity_id),
            entity_id: start.entity_id,
            state: 'claimed',
            member_id: start.member_id,
            at: node.at,
            field_values: [],
        },
        node,
        start,
    ];
}

const expected = Object.fromEntries(
    Object.entries(fixture.histories).map(
        ([key, rows]) => [
            key, withClaimBirth(rows.map(shiftedRow)),
        ],
    ),
);
```

Rename the test `'every seeded work order keeps its
history, born with its claim'`. Add a second test in the
same file:

```ts
Deno.test('every seeded history holds exactly one claimed'
+ ' birth, at its second event', async () => {
    const db = memoryDbAdapter();
    await postMockDataLoad(db, {
        hashPassword: testHashPassword,
    });
    for (const [key, rows] of Object.entries(expected)) {
        const [organization, workOrder] = key.split('/');
        const actual = await workOrderHistoryFor(
            db, organization!, workOrder!,
        );
        const births = actual.filter(
            (row) => row.state === 'claimed',
        );
        assertEquals(births.length, 1, key);
        assertEquals(births[0]!.at, rows.at(-2)!.at, key);
    }
});
```

- [ ] **Step 2: Rewrite the seed's standing pins (red)**

In `tests/mock-data-pairs.test.ts`:
- `:162`: `EXPECTED_MESSAGE_PAIR_COUNT = 1882` (2317 −
  435: per work order the document PUT, the join PUT, and
  two transitions' four rows give way to one create's
  three rows). Rewrite the count's comment
  (`:110-112`, `:139-142`): "+ 145 work-order creates (each
  its received POST, the work order's first version, and
  its flow join) + 1138 trace pairs (861 events less each
  work order's two births and WO01's two value-bearing
  events, each its received POST and the work order's
  version)". Correct `:632` "211 hand-authored" to 212.
- `:560-586`: the row is
  `requests.find(r => r.name === firstWorkOrder.id &&
  r.method === 'PUT')`; its path stays
  `/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/`; its
  body keys are `['claim', 'display_id', 'events',
  'flow_graph', 'id', 'organization_id', 'position',
  'state']`.
- `:661-691`: `buildWorkOrderStateEvents()[0]` now rides
  its work order's create. Rename the test `'a seeded work
  order\'s first trace event rides its create pair'`;
  `row.path` is `/organizations/${STARK_ORGANIZATION}/work-orders/`
  and `row.method` is `'POST'`; the event-key and state
  assertions stay.
- `:693-737`: assertions stay; replace the comment at
  `:711-717` with: "Index 0 rides its work order's create,
  requested by the trace's first member; index 2 is the
  same work order's third event, a transition by another
  member, so only a per-event requester matches both."
- Add:

```ts
Deno.test('the seed mints one distinct claim birth per'
+ ' work order', () => {
    const traces = [
        ...buildWorkOrderStateEvents(),
        ...buildLeadToCloseWorkload().stateEvents,
    ];
    const eventIds = new Set(traces.map((e) => e.id));
    const ids = [
        ...buildWorkOrders(),
        ...buildLeadToCloseWorkload().workOrders,
    ].map((wo) => workOrderClaimEventId(wo.id));
    assertStrictEquals(new Set(ids).size, 145);
    assertEquals(ids.filter((id) => eventIds.has(id)), []);
    assertStrictEquals(
        workOrderClaimEventId('xqcXYHXBJJXcLkRYkRngKA'),
        'oFyLhsd2EDgP4un8UY0H-A',
    );
});

Deno.test('claiming a seeded work order expires its birth'
+ ' claim', async () => {
    const db = await seededMockDb();
    const path = '/organizations/' + STARK_ORGANIZATION
        + '/work-orders/xqcXYHXBJJXcLkRYkRngKA';
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
    );
    const head = await handleRequest(db, apiRequest({
        method: 'GET', path, token,
    }));
    const tag = head.headers.get('etag')!;
    await head.body?.cancel();
    const at = nowUtc();
    const claimed = await handleRequest(db, apiRequest({
        method: 'PUT', path: path + '/claim', token,
        headers: { 'If-Match': tag },
        body: {
            claimEventId: generateIdentifier(),
            claimAt: at,
            expireEventId: generateIdentifier(),
            expireAt: at,
        },
    }));
    assertStrictEquals(claimed.status, 200);
    const version = (await messageOfResponse(claimed))
        .body().toValue() as {
            events: { state: string, member_id: string }[],
        };
    assertEquals(version.events.map((e) => e.state), [
        'claim_expired', 'claimed',
    ]);
    assertStrictEquals(
        version.events[0]!.member_id,
        'MQFcPtrZPIGjMCRAXtZUnA',
    );
});
```

(WO01's creator is Sarah, `MQFcPtrZPIGjMCRAXtZUnA`,
`api/mock-data/work-orders.ts:40-41`. Use a fresh
`seededMockDb()` (`tests/mock-seed.ts:54`) — not
`sharedMockDb()` — because the test writes. The claim
body's keys are `validateWorkOrderClaimBody`'s,
`api/validators.ts:3963-3969`. The file gains imports of
`handleRequest`, `apiRequest`, `messageOfResponse`,
`organizationToken`, `seededMockDb`, `nowUtc`,
`generateIdentifier`, `buildLeadToCloseWorkload`, and
`workOrderClaimEventId` where it lacks them.)

In `tests/ledger-seed.test.ts`:
- `:809-821`: the title says `thirteen statements`;
  `statementExecutions()` is `13` (the deepest chain, 14
  events, is now one create and twelve transitions); the
  comment says "thirteen versions".
- `:1006-1008`: WO01's value-bearing transitions sit at
  depths `[3, 4]` (create, binding, Review, Complete); the
  comment says "third and fourth".

In `tests/drift-states.test.ts:510-522`: WO01's lifecycle
length is `5`; the comment says "its 4-event hand-authored
trace and its claim birth".

In `tests/api-transition-legacy-cut.test.ts:40`: "~859
pure-moves" becomes "569 pure moves".

- [ ] **Step 3: Watch the red**

Run one file for each of `tests/work-order-history-oracle.test.ts`,
`tests/mock-data-pairs.test.ts`, `tests/ledger-seed.test.ts`,
`tests/drift-states.test.ts`. Expected FAIL: the first
two files do not load, because `workOrderClaimEventId` is
not exported yet — that is their red. Then temporarily
stub the export (`export function workOrderClaimEventId(
id: Id): Id { return seedIdentifier('seed-work-order-' +
id + '-claimed'); }` in `api/mock-data/seed-message-pairs.ts`,
the same body Step 5 lands) and re-run: the oracle fails
(no `claimed` row), the count (2317 against 1882), the
first work-order pair's keys, the first trace pair's path,
and the expiry test (`['claimed']` alone); the claim-id
test passes. `tests/ledger-seed.test.ts` fails 15 against
13 and `[5, 6]` against `[3, 4]`;
`tests/drift-states.test.ts` 4 against 5. A pin that
passes, or fails for another reason, is a stop.

- [ ] **Step 4: Export the create**

`api/routes.ts:1616`: `async function postWorkOrderCreationOp(`
becomes `export async function postWorkOrderCreationOp(`.

- [ ] **Step 5: Add the three seed functions**

In `api/mock-data/seed-message-pairs.ts`, beside
`workOrderDocumentSeedBody` (`:906-920`), import
`byAtThenIdAscending` from `../../shared/identifier.ts` if
it is not imported, and add:

```ts
// A seeded work order's birth claim id: minted from its
// work order's id, as a seeded member's initial state
// event is from its member's (spec §2).
export function workOrderClaimEventId(workOrderId: Id): Id {
    return seedIdentifier(
        `seed-work-order-${workOrderId}-claimed`,
    );
}

// Each seeded work order's trace in (at, id) order, the
// order its events land in.
export function seedWorkOrderTraces(
    events: readonly StateEntity[],
): ReadonlyMap<Id, readonly StateEntity[]> {
    const traces = Map.groupBy(
        events, (event) => event.entity_id,
    );
    return new Map([...traces].map(([id, trace]) => [
        id, trace.toSorted(byAtThenIdAscending),
    ]));
}

// The live POST work-orders/ body this work order's birth
// would have carried (spec §2): its fields, its one flow
// join, and three births — the trace's first two events
// and its creator's claim at the second's moment, which
// keeps the version's chain monotonic in time.
export function workOrderCreateSeedBody(
    row: Omit<WorkOrderEntity, 'organization_id'>
        & { readonly organization_id?: string },
    join: FlowWorkOrderEntity,
    trace: readonly StateEntity[],
): Record<string, unknown> {
    const start = trace[0]!;
    const node = trace[1]!;
    return {
        id: row.id,
        workOrder: workOrderDocumentSeedBody(row),
        flowWorkOrderId: join.id,
        flowWorkOrder: flowWorkOrderJoinSeedBody(join),
        stateEventIds: [
            start.id, node.id, workOrderClaimEventId(row.id),
        ],
        stateEventAts: [start.at, node.at, node.at],
        states: [start.state, node.state, 'claimed'],
    };
}
```

Update the comment above `transitionSeedBody`
(`:935-942`): its last sentence becomes "release is null —
a trace's moves keep its creator's lapsed birth claim."

- [ ] **Step 6: One create invocation per work order**

In `buildMockDataInvocations`:
- Replace `workOrderFirstEventMemberId` and its loop
  (`:1381-1398`) with:

```ts
    const workOrderTraces = seedWorkOrderTraces([
        ...workOrderStateEvents,
        ...leadToCloseWorkload.stateEvents,
    ]);
    const joinByWorkOrder = new Map([
        ...flowWorkOrderJoins,
        ...leadToCloseWorkload.flowWorkOrders,
    ].map((join) => [join.work_order_id, join]));
```

- Replace the two loops at `:1689-1745` (the document
  PUTs and the join PUTs) and their comment with:

```ts
    // Each seeded work order is born through the live POST
    // (spec §2), requested by its trace's first member: its
    // first version and its flow join land as the create's
    // siblings, so no document PUT or join PUT is seeded.
    for (
        const wo of [
            ...workOrders, ...leadToCloseWorkload.workOrders,
        ]
    ) {
        const trace = workOrderTraces.get(wo.id)!;
        const key = seedMessagePairKey('work-orders', wo.id);
        invocations.push({
            key,
            routePattern: 'organizations/:id/work-orders/',
            idParams: [STARK_ORGANIZATION],
            op: true,
            organization: STARK_ORGANIZATION,
            requesterIdentityId: trace[0]!.member_id,
            body: workOrderCreateSeedBody(
                wo, joinByWorkOrder.get(wo.id)!, trace,
            ),
            operation: key,
        });
    }
```

- In the transition loop (`:1746-1785`): replace its
  comment's "NOT creation ops … 3-event." with "Each
  trace's first two events are births its create
  carries, so the moves start at its third." and skip
  births:

```ts
    for (const trace of workOrderTraces.values()) {
        for (const event of trace.slice(2)) {
            if (
                VALUE_BEARING_TRANSITION_EVENT_IDS.has(
                    event.id,
                )
            ) {
                continue;
            }
            // … the existing push, unchanged
        }
    }
```

  (`traceEvents` goes.) Update the header comment at
  `:90-100` and `:1344-1350` ("work-orders, flow-work-orders,
  the work-order historical traces" → "work-order creates,
  the work-order historical traces from each third
  event").

- [ ] **Step 7: The rehearsal creates through the POST**

In `api/mock-data.ts`:
- Import `postWorkOrderCreationOp` from `./routes.ts`, and
  `workOrderCreateSeedBody`, `seedWorkOrderTraces` from
  `./mock-data/seed-message-pairs.ts`; drop
  `postWorkOrderDocumentOp`, `postFlowWorkOrderDocumentOp`,
  `workOrderDocumentSeedBody`, `flowWorkOrderJoinSeedBody`
  imports that no longer have a reader here.
- In the second wave (`:976-1050`), replace the four maps
  (`mockWorkOrders` document PUTs, `mockFlowWorkOrders`
  join PUTs, and the lead-to-close pair of each) with one:

```ts
        ...[
            ...mockWorkOrders,
            ...leadToCloseData.workOrders,
        ].map((wo) => {
            const trace = workOrderTraces.get(wo.id)!;
            return postWorkOrderCreationOp(
                adapter,
                workOrderCreateSeedBody(
                    wo, joinByWorkOrder.get(wo.id)!, trace,
                ),
                trace[0]!.member_id,
                requireMessagePair(
                    messagePairs,
                    seedMessagePairKey('work-orders', wo.id),
                ),
                STARK_ORGANIZATION,
            );
        }),
```

  with, above the `await Promise.all([` of that wave:

```ts
    const workOrderTraces = seedWorkOrderTraces([
        ...mockStateEvents, ...leadToCloseData.stateEvents,
    ]);
    const joinByWorkOrder = new Map([
        ...mockFlowWorkOrders,
        ...leadToCloseData.flowWorkOrders,
    ].map((join) => [join.work_order_id, join]));
```

- In `postWorkOrderChainsIn` (`:550-595`): take
  `traces: ReadonlyMap<Id, readonly StateEntity[]>` in
  place of `events`, and replay `trace.slice(2)`; its
  comment gains "from each trace's third event: the
  create carries the first two". The call at `:1118`
  passes `workOrderTraces`.

- [ ] **Step 8: Watch the green**

Re-run the four files of Step 3. Expected: PASS. Then run
one file each for `tests/mock-data-valid.test.ts`,
`tests/mock-data-instance-chain.test.ts`,
`tests/mock-data-records.test.ts`,
`tests/mock-data-lead-to-close.test.ts`,
`tests/mock-data-stats-window.test.ts`,
`tests/drift-work-orders.test.ts`: PASS unchanged (each
reads seeded work orders; none pins what changed).

- [ ] **Step 9: Validate and commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add api/routes.ts api/mock-data.ts \
    api/mock-data/seed-message-pairs.ts \
    tests/work-order-history-oracle.test.ts \
    tests/mock-data-pairs.test.ts tests/ledger-seed.test.ts \
    tests/drift-states.test.ts \
    tests/api-transition-legacy-cut.test.ts
git commit -m "$(cat <<'EOF'
Seed work orders through the create

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 10: Reviews.** Spec-compliance (fresh
planner): the fixture JSON is byte-identical
(`git diff --stat ed1fac5c -- tests/fixtures/`
is empty); no `rng` draw added; one invocation per work
order; the count is 1882. Code-quality (fresh planner).

---

## Task 2: Create test work orders through the POST

**Agent:** coder.

**Spec:** Decision 4 (prepares it); § Testing ("tests
asserting … a document-PUT genesis"). Interpretation G.

**Doctrine:** III Uniformity (one way to make a work
order); IX Generality (24 instances: the fixture earns
itself). Risks: Test Weakening (each test keeps its
subject; only how its work order is born changes);
Unbidden Helper Code (one fixture function).

No product file changes; every test stays green
throughout. The only assertions that change are counts of
a work order's history or pairs that the three births
(and, for `'released'`, the release version) now add.

**Files:**
- Create: `tests/work-order-fixtures.ts`
- Modify (each helper or call named, nothing else):
  - `tests/api-transition-legacy-cut.test.ts:110` (`seededDb`)
  - `tests/api-instance-delete-restrict.test.ts:174` (`seedWorkOrder`)
  - `tests/api-work-orders-get-class.test.ts:123` (`seedWorkOrder`)
  - `tests/drift-state-field-values.test.ts:83` (`seededDb`)
  - `tests/api-work-order-claim.test.ts:106` (`seededDb`), `:534`
  - `tests/api-work-order-release.test.ts:97` (`seededDb`)
  - `tests/api-work-order-transition.test.ts:71` (`seededDb`)
  - `tests/api-transition-required-exit.test.ts:300` (`seedWorkOrder`)
  - `tests/api-work-order-transition-instance.test.ts:297` (`seedWorkOrder`)
  - `tests/api-work-order-binding.test.ts:190` (`seedWorkOrder`)
  - `tests/api-foreign-op-403.test.ts:79`, `:118`, `:148`
  - `tests/drift-phase15-cores-parity.test.ts:257`, `:310`
  - `tests/drift-work-orders.test.ts:811`
  - `tests/drift-states.test.ts:820` (case 4c)
  - `tests/derive-states-work-orders.test.ts:216`, `:244`, `:317`, `:477`
  - `tests/adapters-work-orders.test.ts:294` (`seedBareWorkOrder`)
  - `tests/adapters-record-transitions.test.ts:108` (`seedWorkOrder`)
  - `tests/adapters-flow-records.test.ts:54` (`seedWorkOrder`)
  - `tests/adapters-flow-stats.test.ts:306`, `:315`, `:472`
  - `tests/api-organization-isolation.test.ts:462` (`seedChain`)
  - `tests/shadow-ledger-invariants.test.ts:313` — **stays**:
    it pins the entity-PUT hash path of a genesis; Task 3
    rewrites it
  - `tests/api-work-order-document.test.ts` — **stays**: its
    genesis pins are Task 3's subject

**Interfaces:**
- Produces, in `tests/work-order-fixtures.ts`:

```ts
export type WorkOrderSeed = {
    readonly organization: Id,
    readonly id: Id,
    readonly fields: {
        readonly display_id: string,
        readonly flow_graph: Record<string, unknown>,
        readonly position: number,
    },
    readonly flowId: Id,
    // The create node, then the node the work order sits
    // at (spec §1: births[1] is its node).
    readonly births: readonly [string, string],
    readonly at: string,
    readonly token: string,
    // 'released' frees the creator's birth claim.
    readonly claim: 'kept' | 'released',
};
export async function seedCreatedWorkOrder(
    db: DbAdapter,
    seed: WorkOrderSeed,
): Promise<HttpMessage<WorkOrderEntity>>;
```

- [ ] **Step 1: Write the fixture**

```ts
import { assertStrictEquals } from '@std/assert';
import type { DbAdapter } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import type { Id, WorkOrderEntity } from '../shared/types.ts';
import { generateIdentifier } from '../shared/identifier.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { apiRequest, messageOfResponse } from
    './http-fixtures.ts';

// A test work order is born the one way a work order is
// born: the live create, three births and its flow join in
// one statement (spec Decision 4). The head it answers is
// the message a later write latches.
export async function seedCreatedWorkOrder(
    db: DbAdapter,
    seed: WorkOrderSeed,
): Promise<HttpMessage<WorkOrderEntity>> {
    const collection = '/organizations/'
        + seed.organization + '/work-orders/';
    const created = await handleRequest(db, apiRequest({
        method: 'POST',
        path: collection,
        token: seed.token,
        body: {
            id: seed.id,
            workOrder: seed.fields,
            flowWorkOrderId: generateIdentifier(),
            flowWorkOrder: {
                flow_id: seed.flowId,
                work_order_id: seed.id,
                at: seed.at,
            },
            stateEventIds: [
                generateIdentifier(),
                generateIdentifier(),
                generateIdentifier(),
            ],
            stateEventAts: [seed.at, seed.at, seed.at],
            states: [...seed.births, 'claimed'],
        },
    }));
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    const head = await headOf(db, collection + seed.id, seed);
    if (seed.claim === 'kept') {
        return head;
    }
    const released = await handleRequest(db, apiRequest({
        method: 'DELETE',
        path: collection + seed.id + '/claim',
        token: seed.token,
        headers: {
            'If-Match': head.query('header.etag').toText(),
        },
    }));
    assertStrictEquals(released.status, 200);
    return await messageOfResponse<WorkOrderEntity>(
        released,
    );
}

async function headOf(
    db: DbAdapter,
    path: string,
    seed: WorkOrderSeed,
): Promise<HttpMessage<WorkOrderEntity>> {
    const read = await handleRequest(db, apiRequest({
        method: 'GET', path, token: seed.token,
    }));
    assertStrictEquals(read.status, 200);
    return await messageOfResponse<WorkOrderEntity>(read);
}
```

Check `messageOfResponse`'s generic signature
(`tests/http-fixtures.ts:265`) and match it; if it takes
no type parameter, cast the returned message's body type
at the one return site with a comment saying why.

- [ ] **Step 2: Move each named site onto the fixture**

The rule, applied site by site:
- **Births.** If the old site PUT a genesis and then
  POSTed a transition into node X before its first
  assertion, `births` is `[<the graph's isCreate node id>,
  X]` and that transition call goes. If it PUT a genesis
  and asserted at once (the work order sat at its graph's
  create node through the fallback), `births` is
  `[create, create]`. A graph with no nodes (the sites at
  `api-transition-legacy-cut`, `api-work-order-transition-instance`,
  `api-work-order-binding`, `adapters-flow-stats`) takes
  two fresh `generateIdentifier()` node ids, as constants.
- **Claim.** `'released'` everywhere, except where the
  test's subject is the creator holding a claim
  (`tests/drift-phase15-cores-parity.test.ts:310` asserts
  the fresh head has no claim, then claims: `'released'`
  keeps "no live claim"; rewrite its assertion to read
  `claim === undefined` on the released head).
- **at.** The site's own timestamp constant where it had
  one, else `nowUtc()`.
- **Counts.** A pin counting a work order's events, rows,
  or pairs gains the births (3) and, for `'released'`, the
  release (1 event, one version). Name each changed count
  in the commit's review notes.
- **Client sites** (`adapters-*`) call `seedCreatedWorkOrder(db,
  …)` with the same token their `inPageContext` holds, and
  re-read the work order through the client when the test
  then holds a `WorkOrder` (`getWorkOrder(ctx, id)`).

- [ ] **Step 3: Run each moved file**

Run one file for each modified test file. Expected: PASS.
A pin that goes red for any reason other than the counts
rule above is a stop.

- [ ] **Step 4: Validate and commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add tests/
git commit -m "$(cat <<'EOF'
Create test work orders through the POST

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 5: Reviews.** Spec-compliance: read every hit
of `git grep -n "'creates'" -- tests` and `git grep -niP
"if-none-match'?:\s*'\*'" -- tests`; none that writes a
work order remains outside
`tests/api-work-order-document.test.ts` and
`tests/shadow-ledger-invariants.test.ts`; no product file
changed. Code-quality: each site kept its subject.

---

## Task 3: Answer 404 to a PUT on an absent work order

**Agent:** coder.

**Spec:** Decision 4; §1 (Creation is the POST;
Preconditions on an absent work order); `## Error and
wire`; § Testing (the PUT on an absent work order).
Interpretation A.

**Doctrine:** VII Idempotency (a PUT supersedes; only the
POST creates); II Security (foreign is 403 before any
head is judged); IV Logic (the RFC's ignored
preconditions). Risks: Internal Defense (`fieldsVersion`
loses its no-head branch; the handler reads the head
once).

**Files:**
- Modify: `api/routes.ts:2278-2305` (`postWorkOrderDocumentOp`)
- Modify: `api/work-order-version.ts:156-172` (`fieldsVersion`)
- Modify (pins): `tests/api-work-order-document.test.ts`
  (`:179-223`, `:225-260`, `:630-660`), `tests/work-order-version.test.ts:75-84`,
  `tests/shadow-ledger-invariants.test.ts:310-321`
- Modify: `tests/mock-data-valid.test.ts:166-176` (its local
  wiring copy keeps `postWorkOrderDocumentOp`; no change
  unless the type check says so)

- [ ] **Step 1: Write the red pins**

In `tests/api-work-order-document.test.ts`, add (its
`freshDb`, `ENTITY_PREFIX`, `documentFields`, `DEV_TOKEN`
are already defined):

```ts
for (const [label, headers] of [
    ['If-Match', { 'If-Match': '"' + generateIdentifier()
        + '"' }],
    ['If-None-Match: *', { 'If-None-Match': '*' }],
] as const) {
    Deno.test('a work-order PUT with ' + label
    + ' on an absent work order is 404', async () => {
        const db = await freshDb();
        const before = (await db.messagePairs.getAll())
            .length;
        const res = await handleRequest(db, apiRequest({
            method: 'PUT',
            path: ENTITY_PREFIX + generateIdentifier(),
            token: DEV_TOKEN,
            headers,
            body: documentFields(),
        }));
        assertStrictEquals(res.status, 404);
        await res.body?.cancel();
        assertStrictEquals(
            (await db.messagePairs.getAll()).length, before,
        );
    });
}

Deno.test('a work-order PUT on a foreign work order is'
+ ' 403', async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    await seedCreatedWorkOrder(db, {
        organization: 'AjdvjuECVZEgZoFajaIEkg', id,
        fields: documentFields(),
        flowId: generateIdentifier(),
        births: [NODE_START, NODE_FINISH],
        at: nowUtc(),
        token: DEV_TOKEN,
        claim: 'kept',
    });
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/BBjWJsjYIDkTRKIIPrzWRw'
            + '/work-orders/' + id,
        token: await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA',
            'BBjWJsjYIDkTRKIIPrzWRw',
        ),
        headers: { 'If-None-Match': '*' },
        body: documentFields(),
    }));
    assertStrictEquals(res.status, 403);
    await res.body?.cancel();
});

Deno.test('If-None-Match: * on a work order that exists is'
+ ' 412 and stores nothing', async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const head = await seedCreatedWorkOrder(db, {
        organization: 'AjdvjuECVZEgZoFajaIEkg', id,
        fields: documentFields(),
        flowId: generateIdentifier(),
        births: [NODE_START, NODE_FINISH],
        at: nowUtc(),
        token: DEV_TOKEN,
        claim: 'kept',
    });
    const before = (await db.messagePairs.getAll()).length;
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: ENTITY_PREFIX + id,
        token: DEV_TOKEN,
        headers: { 'If-None-Match': '*' },
        body: { ...documentFields(), position: 9 },
    }));
    assertStrictEquals(res.status, 412);
    await res.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
    const after = await handleRequest(db, apiRequest({
        method: 'GET', path: ENTITY_PREFIX + id,
        token: DEV_TOKEN,
    }));
    assertStrictEquals(
        after.headers.get('etag'),
        head.query('header.etag').toText(),
    );
    await after.body?.cancel();
});
```

Rewrite the standing pins:
- `:179-223` (`postWorkOrderDocumentOp` with no head
  stores a stateless genesis) → `'the document op refuses
  an absent work order'`: `assertRejects(() =>
  postWorkOrderDocumentOp(…same args…), EntityNotFoundError)`
  and nothing stored.
- `:225-250` (genesis, then a same-body resend under the
  head's tag) → create `WO_RESEND` through
  `seedCreatedWorkOrder` (`'kept'`, `fields: body`), then
  the same-body PUT under the head's tag: its answer's
  body equals the head's (`assertEquals`), and the pair
  count, `4` today (the schema's rows and the genesis),
  becomes `6` (the schema's rows and the create's three):
  the fields equal the head's, so the statement matches
  and stores nothing (Decision 11). The title keeps
  "converges".
- `:630-660` (`If-None-Match: *` on a fresh id is 201) is
  deleted with the behavior it named: the 404 pins above
  replace it.
- `:486` (bare is 428) stays unchanged (Interpretation A).
- `:118` (`organization_id` in the body is 400) stays: the
  body validator runs before the head read.

In `tests/work-order-version.test.ts:75-84`, `'a version
born by PUT has no state'` is deleted with the behavior.

In `tests/shadow-ledger-invariants.test.ts:310-321`, the
entity-PUT leg creates its work order through
`seedCreatedWorkOrder` (`'kept'`) first and then PUTs with
`If-Match` on the head, asserting 201 as today; its
comment says "the entity-PUT hash path of a superseding
PUT".

- [ ] **Step 2: Watch the red**

Run one file each for `tests/api-work-order-document.test.ts`,
`tests/work-order-version.test.ts`,
`tests/shadow-ledger-invariants.test.ts`. Expected FAIL:
the `If-None-Match: *` 404 pin (201 today), the `If-Match`
404 pin (412 today: the statement judges a tag naming no
head), and the op rejection (it stores a genesis). The
403, 412, resend, and shadow-ledger pins pass already
(the write authorizer, the statement, and a create they
now make first); they guard what must stay.

- [ ] **Step 3: The PUT reads its head first**

`api/routes.ts`:

```ts
// Work-order document PUT (§1): the request's fields over
// the head's facets, with no event of its own. Only the
// POST creates, so an absent work order is the head read's
// miss (404, or 403 when foreign) whatever its
// preconditions (RFC 9110 §13.2.1). Its own tag latches
// it; If-None-Match: * on a work order that exists is the
// statement's 412.
export async function postWorkOrderDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair: MessagePair | undefined,
    organization: Id | undefined,
): Promise<void> {
    const org = requireOrganization(organization);
    const fields = validateWorkOrderDocumentBody(
        withoutId(body),
    ).entity;
    const head = await requireWorkOrderHead(db, org, id);
    await runStateWrite(db, {
        kind: 'own',
        received: requirePair(messagePair),
        state: fieldsVersion(head.version, fields),
    });
}
```

`api/work-order-version.ts`:

```ts
// The PUT (§5): the request's fields over the head's
// facets, no event. Fields equal to the head's are the
// head, so the statement matches and nothing lands
// (Decision 11).
export function fieldsVersion(
    head: WorkOrderVersion,
    fields: WorkOrderFields,
): WorkOrderVersion {
    if (sameFields(head, fields)) {
        return head;
    }
    return ordered({ ...head, ...fields, events: [] });
}
```

- [ ] **Step 4: Watch the green; validate; commit**

Re-run the three files: PASS. Then:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add api/routes.ts api/work-order-version.ts \
    tests/api-work-order-document.test.ts \
    tests/work-order-version.test.ts \
    tests/shadow-ledger-invariants.test.ts
git commit -m "$(cat <<'EOF'
Answer 404 to a PUT on an absent work order

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 5: Reviews.** Spec-compliance: bare stays
428; both conditionals on absent are 404 storing nothing;
foreign 403; exists + `If-None-Match: *` is 412. Code
quality: one head read; no no-head branch survives.

---

## Task 4: Name a work order's fields apart from its version

**Agent:** coder.

**Spec:** Sequence 3 (prepares "both types").
Interpretation H.

**Doctrine:** III Uniformity (a name per thing); V
Clarity. A type split with no behavior change — no red
test; the gate is `deno check`.

**Files:**
- Modify: `shared/types.ts:1273-1289`
- Modify (type names only): `api/mock-data/flow-workload.ts:2`,
  `:62`, `:102`; `api/mock-data/work-orders.ts:2`, `:105`;
  `api/mock-data/seed-message-pairs.ts:129`, `:914` and the
  `workOrderCreateSeedBody` signature (Task 1);
  `api/validators.ts:29`, `:1530-1532`, `:1562`;
  `tests/mock-data-valid.test.ts:80`, `:567`

- [ ] **Step 1: Split the type**

```ts
// A work order's own fields: what the seed authors and a
// document PUT writes.
export interface WorkOrderFieldsEntity {
    id: Id;
    organization_id: Id;
    display_id: string;
    flow_graph: Record<string, unknown>;
    position: number;
}

// A work order's stored version, as a GET serves it.
export interface WorkOrderEntity extends WorkOrderFieldsEntity {
    // GET embed when bound (absent when unbound).
    instance_id?: Id;
    record_type_id?: Id;
    // The head's claim (absent when unclaimed); "claimed
    // now" is judged against expires_at at read.
    claim?: {
        member_id: Id;
        at: string;
        expires_at: string;
    };
}
```

- [ ] **Step 2: Retype every fields-only site**

Each file listed above names `WorkOrderEntity` where it
means the fields; it names `WorkOrderFieldsEntity`
instead. Nothing else changes. `deno check --frozen api
client shared server tests web-app` is clean.

- [ ] **Step 3: Validate and commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add shared/types.ts api/ tests/mock-data-valid.test.ts
git commit -m "$(cat <<'EOF'
Name a work order's fields apart from its version

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 4: Reviews.** Spec-compliance: no runtime
line changed (`git show --stat`, read the diff). Code
quality: every remaining `WorkOrderEntity` reader means a
whole version.

---

## Task 5: Record the move into each version's node

**Agent:** coder.

**Spec:** Decision 3; §1 (The facet; Its writers;
Internal defense retires); Sequence 3; § Testing (the
validator; the builders).

**Doctrine:** I Reliability (a version names its node);
V Clarity (absence is never a key's absence here); Risks:
Internal Defense (the create-node fallback goes); Null
(neither key is optional).

**Files:**
- Modify: `api/work-order-version.ts` (`WorkOrderTransition`,
  `WorkOrderVersion`, `ordered`, `createdVersion`,
  `transitionedVersion`)
- Modify: `api/validators.ts:1599-1745`
- Modify: `api/routes.ts:1817-1830` (delete
  `currentNodeIdFor`), `:1856-1866`, `:3255-3305`
- Modify: `shared/types.ts` (`WorkOrderEntity` gains
  `state`, `transition`)
- Modify (pins): `tests/work-order-version.test.ts`,
  `tests/validators.test.ts`,
  `tests/api-work-orders-create.test.ts:256`,
  `tests/api-work-order-document.test.ts:362`, `:612`,
  `tests/mock-data-pairs.test.ts:580-585`,
  `tests/presenter-workbox-detail.test.ts:136-152`

**Interfaces:**
- Produces, in `api/work-order-version.ts`:

```ts
export type WorkOrderTransition = {
    readonly member_id: Id,
    readonly at: string,
};
// WorkOrderVersion: `state: string` and
// `transition: WorkOrderTransition` both required.
```

- Produces, in `shared/types.ts`, on `WorkOrderEntity`:
  `state: Id;` and `transition: { member_id: Id; at:
  string; };` (required, after `position`).

- [ ] **Step 1: Write the red pins**

`tests/work-order-version.test.ts`:
- `'a created version holds three births and a claim'`:
  keys become `['id', 'organization_id', 'display_id',
  'flow_graph', 'position', 'state', 'transition',
  'claim', 'events']`; add
  `assertEquals(version.transition, { member_id: ALICE,
  at: T1 })`.
- Add:

```ts
Deno.test('a transition records its move, kept or'
+ ' released', () => {
    for (const release of [
        { kind: 'kept' } as const,
        { kind: 'released', id: 'r1', at: T2 } as const,
    ]) {
        const moved = transitionedVersion(created(), {
            eventId: 't1', targetState: 'node-2',
            member: BOB, at: T2, fieldValueEntities: [],
            release,
        });
        assertEquals(moved.transition, {
            member_id: BOB, at: T2,
        });
    }
});

Deno.test('claim, release, bind, and fields carry the'
+ ' transition', () => {
    const head = created();
    const claimed = claimedVersion(head, {
        member: BOB, claimEventId: 'c1', claimAt: EXPIRES,
        expireEventId: 'x1', expireAt: EXPIRES,
        expiresAt: '2026-09-25T10:10:02.000000Z',
        now: EXPIRES,
    });
    assertStrictEquals(claimed.kind, 'claimed');
    if (claimed.kind !== 'claimed') return;
    const bound = boundVersion(head, 'i1', 'rt1');
    assertStrictEquals(bound.kind, 'bound');
    if (bound.kind !== 'bound') return;
    for (const version of [
        claimed.version,
        releasedVersion(head, {
            eventId: 'r1', member: ALICE, at: T2, now: T2,
        }),
        bound.version,
        fieldsVersion(head, { ...FIELDS, position: 2 }),
    ]) {
        assertEquals(version.transition, head.transition);
    }
});
```

`tests/validators.test.ts` (append):

```ts
function storedWorkOrderVersion(): Record<string, unknown> {
    return {
        id: 'xqcXYHXBJJXcLkRYkRngKA',
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        display_id: 'WO-1',
        flow_graph: {
            name: 'g', lockTimeout: 300,
            nodes: [], edges: [],
        },
        position: 1,
        state: 'node-1',
        transition: {
            member_id: 'XXZruirZyAOoRpNxaDnpSA',
            at: '2026-09-25T10:00:01.000000Z',
        },
        events: [],
    };
}

Deno.test('validateWorkOrderVersion requires state and'
+ ' transition', () => {
    validateWorkOrderVersion(storedWorkOrderVersion());
    for (const key of ['state', 'transition']) {
        const { [key]: _gone, ...rest } =
            storedWorkOrderVersion();
        assertThrows(
            () => validateWorkOrderVersion(rest),
            ValidationError,
        );
    }
});

Deno.test('validateWorkOrderVersion refuses a transition'
+ ' with any other key', () => {
    assertThrows(() => validateWorkOrderVersion({
        ...storedWorkOrderVersion(),
        transition: {
            member_id: 'XXZruirZyAOoRpNxaDnpSA',
            at: '2026-09-25T10:00:01.000000Z',
            etag: 'x',
        },
    }), ValidationError);
});
```

(Import `validateWorkOrderVersion` and `ValidationError`
where the file already imports validators; match its
`assertThrows` import.)

Standing pins rewritten:
- `tests/api-work-orders-create.test.ts:256`: the exact
  create response gains `transition: { member_id:
  'XXZruirZyAOoRpNxaDnpSA', at: <stateEventAts[1]> }`
  after `state`.
- `tests/api-work-order-document.test.ts:362`, `:612`:
  the literals gain the head's `transition`.
- `tests/mock-data-pairs.test.ts:580-585`: the key list
  gains `'transition'`.
- `tests/presenter-workbox-detail.test.ts:136-152`
  (`makeWorkOrder`): the message body gains `state:
  graph.nodes[0]!.id` and `transition: { member_id:
  'pjQzgITAPDQVyvCVpzpIfQ', at: '2026-04-01T12:00:00.000000Z'
  }`.

- [ ] **Step 2: Watch the red**

Run one file each for `tests/work-order-version.test.ts`
and `tests/validators.test.ts`. Expected FAIL: the key
list, `version.transition` undefined, and the validator
accepting a body without `state`/`transition`.

- [ ] **Step 3: The facet and its writers**

`api/work-order-version.ts`: add `WorkOrderTransition`;
in `WorkOrderVersion`, `readonly state: string` and
`readonly transition: WorkOrderTransition` (no `?`). In
`ordered()`, replace the `state` spread with:

```ts
        state: version.state,
        transition: version.transition,
```

`createdVersion` adds `transition: { member_id:
input.creator, at: node.at }` after `state`.
`transitionedVersion` adds `transition: { member_id:
input.member, at: input.at }` in both branches. Every
other builder spreads the head, so carries it. Update the
file's header comment: "A work order's whole state (§5):
its fields, its node and the move into it, its binding,
its claim, and the events this version recorded."

`api/validators.ts`:

```ts
const WORK_ORDER_VERSION_KEYS: readonly string[] = [
    'id', 'organization_id', 'display_id', 'flow_graph',
    'position', 'state', 'transition', 'events',
];

// Absent until a binding or a claim sets them; never null
// (Interpretation K).
const WORK_ORDER_VERSION_OPTIONAL: readonly string[] = [
    'instance_id', 'record_type_id', 'claim',
];

const WORK_ORDER_TRANSITION_FACT_KEYS: readonly string[] = [
    'member_id', 'at',
];

function validateWorkOrderTransitionFact(
    value: unknown,
): WorkOrderTransition {
    const label = 'WorkOrderVersion.transition';
    const transition = asObject(value, label);
    assertOnlyKeys(
        transition, WORK_ORDER_TRANSITION_FACT_KEYS, label,
    );
    return {
        member_id: pickIdentifier(transition, 'member_id'),
        at: validateTimestampField(transition, 'at', label),
    };
}
```

In `validateWorkOrderVersion`, replace the conditional
`state` spread with `state: pickString(body, 'state'),
transition: validateWorkOrderTransitionFact(
body['transition']),`. Import `WorkOrderTransition` beside
the file's other `work-order-version.ts` type imports.

`shared/types.ts` `WorkOrderEntity` gains, after its
`extends`:

```ts
    // The node the work order sits at, and who moved it
    // there, when (spec §1).
    state: Id;
    transition: {
        member_id: Id;
        at: string;
    };
```

- [ ] **Step 4: The fallback retires**

Delete `currentNodeIdFor` and its comment
(`api/routes.ts:1817-1830`). In
`assertRequiredAttributesAtExit`, `const nodeId =
version.state;` and delete its `undefined` return. In
`inFlightPlacementBlockersFor`, `const nodeId =
head.version.state;`, delete its `undefined` check and
the comment sentence "A WO with no transition yet sits at
its graph's isCreate node." (`:3259-3260`).

- [ ] **Step 5: Watch the green; validate; commit**

Re-run the two files, then
`tests/api-transition-required-exit.test.ts`,
`tests/api-instance-delete-restrict.test.ts`: PASS. Then:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add api/ shared/types.ts tests/
git commit -m "$(cat <<'EOF'
Record the move into each version's node

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 6: Reviews.** Spec-compliance: `transition`
sits after `state`; the create takes `births[1]`'s `at`
and the creator; both transition branches set it; the
fallback is gone. Code-quality: no `?` on either key.

---

## Task 6: Serve work-order versions as stored

**Agent:** coder.

**Spec:** Decision 1; §3 (Version reads); Found 4;
Sequence 4; `## Error and wire`; § Testing (the two
routes). Interpretation L.

**Doctrine:** III Uniformity (the generic routes, as for
seven families); VI Immutability (a part is the stored
version); II Security (403 foreign before any head).
Risks: Premature Generalization (no work-order-specific
selector).

**Files:**
- Modify: `api/routes.ts:4434-4437` (two rows after
  `organizations/:id/work-orders/:id`)
- Create: `tests/api-work-order-versions.test.ts`
- Modify (pins): `tests/api-versions-etag.test.ts:92-106`,
  `:152-246` (the two lists), `tests/api-work-orders-get-class.test.ts:369-399`,
  `tests/api-documentation-generator.test.ts:345-410`
  (`carries` list)
- Regenerate: `web-app/api-documentation/`

- [ ] **Step 1: Write the red pins**

`tests/api-work-order-versions.test.ts`:

```ts
import { assertEquals, assertStrictEquals } from
    '@std/assert';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { validateWorkOrderVersion } from
    '../api/validators.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedCreatedWorkOrder } from './work-order-fixtures.ts';
import {
    apiRequest, messageOfResponse, partsOf,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { DEFAULT_LOCK_TIMEOUT, nowUtc } from
    '../shared/types.ts';
import type { WorkOrderEntity } from '../shared/types.ts';

const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const WAYNE = 'BBjWJsjYIDkTRKIIPrzWRw';
const ADMIN = 'XXZruirZyAOoRpNxaDnpSA';
const START = generateIdentifier();
const NEXT = generateIdentifier();

function fields(position: number) {
    return {
        display_id: 'WO-V',
        flow_graph: {
            name: 'Versions', lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [], edges: [],
        },
        position,
    };
}

async function twoVersions() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken(ADMIN, STARK);
    const id = generateIdentifier();
    const head = await seedCreatedWorkOrder(db, {
        organization: STARK, id, fields: fields(1),
        flowId: generateIdentifier(),
        births: [START, NEXT], at: nowUtc(), token,
        claim: 'kept',
    });
    const path = '/organizations/' + STARK
        + '/work-orders/' + id;
    const moved = await handleRequest(db, apiRequest({
        method: 'PUT', path, token,
        headers: {
            'If-Match': head.query('header.etag').toText(),
        },
        body: fields(2),
    }));
    assertStrictEquals(moved.status, 201);
    await moved.body?.cancel();
    return { db, token, id, path };
}

Deno.test('a work order lists its versions oldest first,'
+ ' each part the version its tag serves', async () => {
    const { db, token, path } = await twoVersions();
    const list = await handleRequest(db, apiRequest({
        method: 'GET', path: path + '/versions/', token,
    }));
    assertStrictEquals(list.status, 200);
    const parts = await partsOf<WorkOrderEntity>(list);
    assertEquals(
        parts.map((part) => part.body().toValue().position),
        [1, 2],
    );
    for (const part of parts) {
        validateWorkOrderVersion(
            part.body().toValue() as unknown as
                Record<string, unknown>,
        );
        const tag = part.query('header.etag').toText()
            .slice(1, -1);
        const item = await handleRequest(db, apiRequest({
            method: 'GET',
            path: path + '/versions/' + tag, token,
        }));
        assertStrictEquals(item.status, 200);
        const served = await messageOfResponse(item);
        assertStrictEquals(
            served.withFieldDeleted('date')
                .withFieldDeleted('request-id').toWire(),
            part.withFieldDeleted('date')
                .withFieldDeleted('request-id').toWire(),
        );
    }
});

Deno.test('a foreign work order\'s versions answer 403',
async () => {
    const { db, id } = await twoVersions();
    const token = await organizationToken(ADMIN, WAYNE);
    for (const suffix of [
        '/versions/', '/versions/' + generateIdentifier(),
    ]) {
        const res = await handleRequest(db, apiRequest({
            method: 'GET',
            path: '/organizations/' + WAYNE
                + '/work-orders/' + id + suffix,
            token,
        }));
        assertStrictEquals(res.status, 403, suffix);
        await res.body?.cancel();
    }
});

Deno.test('an absent work order\'s versions answer 404',
async () => {
    const { db, token } = await twoVersions();
    const path = '/organizations/' + STARK
        + '/work-orders/' + generateIdentifier();
    for (const suffix of [
        '/versions/', '/versions/' + generateIdentifier(),
    ]) {
        const res = await handleRequest(db, apiRequest({
            method: 'GET', path: path + suffix, token,
        }));
        assertStrictEquals(res.status, 404, suffix);
        await res.body?.cancel();
    }
});

Deno.test('a tag naming no PUT of the work order answers'
+ ' 404', async () => {
    const first = await twoVersions();
    const other = await seedCreatedWorkOrder(first.db, {
        organization: STARK, id: generateIdentifier(),
        fields: fields(3), flowId: generateIdentifier(),
        births: [START, NEXT], at: nowUtc(),
        token: first.token, claim: 'kept',
    });
    const res = await handleRequest(first.db, apiRequest({
        method: 'GET',
        path: first.path + '/versions/'
            + other.query('header.etag').toText()
                .slice(1, -1),
        token: first.token,
    }));
    assertStrictEquals(res.status, 404);
    await res.body?.cancel();
});

Deno.test('a member reads a work order\'s versions',
async () => {
    const { db, path } = await twoVersions();
    const member = await organizationToken(
        'MQFcPtrZPIGjMCRAXtZUnA', STARK,
    );
    const res = await handleRequest(db, apiRequest({
        method: 'GET', path: path + '/versions/',
        token: member,
    }));
    assertStrictEquals(res.status, 200);
    await res.body?.cancel();
});
```

(The gate reads claims, not seats:
`organizationToken` mints `member:<organization>` for any
identity but the admin, `tests/token-fixtures.ts:11-17`.)

Standing pins rewritten:
- `tests/api-versions-etag.test.ts:92-106` → `'work-order
  versions sit beside /history'`: both `…/history` and
  `…/versions/` match (Task 18 flips `/history` to null).
- `:152-246`: `lists` gains
  `'/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/xdaJyuuPyHfffCGLhqDrOQ/versions/'`
  and `snapshots` the same with
  `'versions/YiJPbufDpkyrZcZCYbUJpg'`.
- `tests/api-work-orders-get-class.test.ts:369-399` →
  `'work-order versions are stored parts beside
  /history'`: `/history` 200 (until Task 18); `/versions/`
  200 with one part; the slashless `/versions` 404; the
  bulk leg unchanged.
- `tests/api-documentation-generator.test.ts`, the
  `carries` list: add
  `'/organizations/:id/work-orders/:id/versions/:etag'`.

- [ ] **Step 2: Watch the red**

Run one file each for the four test files. Expected FAIL:
every versions request 404s (no route), the two match
lists, the get-class `versions/` leg, and the `carries`
entry (no room).

- [ ] **Step 3: The two rows**

`api/routes.ts`, after the `organizations/:id/work-orders/:id`
row:

```ts
    // A work order's history is its versions (spec §3):
    // every PUT, oldest first, each as stored; the
    // create's received POST is not a version.
    documentVersionsSelectRoute(WORK_ORDERS_WIRING),
    documentVersionSelectRoute(WORK_ORDERS_WIRING),
```

Run `./bin/generate-api-documentation`. The two new rooms
list 200, 401, 403, 404, and 410 (Interpretation L).

- [ ] **Step 4: Watch the green; validate; commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add api/routes.ts web-app/api-documentation/ tests/
git commit -m "$(cat <<'EOF'
Serve work-order versions as stored

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 5: Reviews.** Spec-compliance: the generic
routes, no new selector; `/history` untouched. Code
quality.

---

## Task 7: Name a work-order event on the wire

**Agent:** coder.

**Spec:** §4 (The wire type); Sequence 5.

**Doctrine:** III Uniformity (one event type on both
sides of the wire); V Clarity. A type change with no
behavior change — no red test; the gate is `deno check`.

**Files:**
- Modify: `shared/types.ts` (new `WorkOrderEventEntity`
  beside `TransitionFieldValueEntity`, `:439-457`;
  `WorkOrderEntity` gains `events`)
- Modify: `api/work-order-version.ts:22-28` (delete
  `WorkOrderEvent`; every use names
  `WorkOrderEventEntity`), `api/validators.ts`
  (`validateWorkOrderEvent`'s return type)
- Modify: `tests/presenter-workbox-detail.test.ts`
  (`makeWorkOrder`'s body gains `events: []`)

- [ ] **Step 1: The type**

```ts
// One event a work-order version recorded (spec §4): a
// move into a node, or a claim's birth, release, or
// expiry. The path names its work order.
export interface WorkOrderEventEntity {
    readonly id: Id;
    readonly state: string;
    readonly member_id: Id;
    readonly at: string;
    readonly field_values:
        readonly TransitionFieldValueEntity[];
}
```

`WorkOrderEntity` gains `events: WorkOrderEventEntity[];`
after `transition`. `WorkOrderHistoryEventEntity` stays
until Task 22 (Interpretation C).

- [ ] **Step 2: The version's event becomes it**

Delete `WorkOrderEvent` from `api/work-order-version.ts`;
import `WorkOrderEventEntity` from `../shared/types.ts`
and use it for `WorkOrderVersion.events`, `event()`'s
return, and `historyOf`'s. In `api/validators.ts`,
`validateWorkOrderEvent` returns `WorkOrderEventEntity`;
drop the `WorkOrderEvent` import. `git grep -n
"WorkOrderEvent\b"` is empty.

- [ ] **Step 3: Validate and commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add shared/types.ts api/ tests/
git commit -m "$(cat <<'EOF'
Name a work-order event on the wire

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 4: Reviews.** Spec-compliance: the five
keys exactly; no `entity_id`. Code quality.

---

## Task 8: Rename ClaimStatus's kind to state

**Agent:** coder.

**Spec:** Decision 7; §4 (The twin's discriminant);
Sequence 6. Interpretation D.

**Doctrine:** III Uniformity (one claim at different
moments; its discriminant is its `state`). A rename alone.

**Files:**
- Modify: `client/work-orders-queries.ts:41-47`
- Modify: `web-app/app/presenters/workbox-detail.ts:241-249`
- Modify: `web-app/workbox/detail.ts:263-264`, `:584-587`
- Modify: `tests/presenter-workbox-detail.test.ts:838-877`

- [ ] **Step 1: Rename**

`kind: 'unclaimed'` → `state: 'unclaimed'`; `kind:
'claimed'` → `state: 'claimed'`; every `.kind` read of a
`ClaimStatus` → `.state`. `tests/work-order-version.test.ts`'s
`change.kind` reads a `ClaimChange`, not a
`ClaimStatus`: leave it.

- [ ] **Step 2: Validate and commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add client/work-orders-queries.ts web-app/ \
    tests/presenter-workbox-detail.test.ts
git commit -m "$(cat <<'EOF'
Rename ClaimStatus's kind to state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 3: Reviews.** Spec-compliance: the diff is
the rename and nothing else. Code quality.

---

## Task 9: Give the twin its node, transition, and claim

**Agent:** coder.

**Spec:** Decisions 6, 7; §4 (The twin); Sequence 7;
§ Testing (`toWorkOrder`).

**Doctrine:** V Clarity (absence gets a name at the
adapter); the adapter is the divorce point (snake_case
in, camelCase out). Risks: Null (`claim` is never
`null`); Default Values.

**Files:**
- Modify: `client/work-orders-queries.ts:92-132`
- Create: `tests/work-order-twin.test.ts`
- Modify: `tests/presenter-workbox-detail.test.ts:136-152`
  (`makeWorkOrder` sets the three fields)

**Interfaces:**
- Produces:

```ts
export type WorkOrderClaim =
    | { readonly state: 'unclaimed' }
    | {
        readonly state: 'claimed',
        readonly memberId: Id,
        readonly at: string,
        readonly expiresAt: string,
    };
// WorkOrder gains:
//     nodeId: Id;
//     transition: { readonly memberId: Id;
//         readonly at: string };
//     claim: WorkOrderClaim;
```

- [ ] **Step 1: Write the red pins**

`tests/work-order-twin.test.ts`:

```ts
import { assertEquals, assertStrictEquals } from
    '@std/assert';
import { toWorkOrder } from
    '../client/work-orders-queries.ts';
import { responseMessage } from
    './fixtures/response-message.ts';
import type { WorkOrderEntity } from '../shared/types.ts';

const AT = '2026-10-01T09:00:00.000000Z';

function entity(): WorkOrderEntity {
    return {
        id: 'xqcXYHXBJJXcLkRYkRngKA',
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        display_id: 'WO-1',
        flow_graph: {
            name: 'g', lockTimeout: 300, nodes: [], edges: [],
        },
        position: 1,
        state: 'KWpWgeKhKyoyBDEymUgcmg',
        transition: {
            member_id: 'MQFcPtrZPIGjMCRAXtZUnA', at: AT,
        },
        events: [],
    };
}

Deno.test('the twin names its node and the move into it',
() => {
    const twin = toWorkOrder(responseMessage(entity()));
    assertStrictEquals(twin.nodeId, 'KWpWgeKhKyoyBDEymUgcmg');
    assertEquals(twin.transition, {
        memberId: 'MQFcPtrZPIGjMCRAXtZUnA', at: AT,
    });
});

Deno.test('an absent claim is unclaimed', () => {
    assertEquals(
        toWorkOrder(responseMessage(entity())).claim,
        { state: 'unclaimed' },
    );
});

Deno.test('a stored claim is claimed, in camelCase', () => {
    const twin = toWorkOrder(responseMessage({
        ...entity(),
        claim: {
            member_id: 'XXZruirZyAOoRpNxaDnpSA',
            at: AT,
            expires_at: '2026-10-01T09:05:00.000000Z',
        },
    }));
    assertEquals(twin.claim, {
        state: 'claimed',
        memberId: 'XXZruirZyAOoRpNxaDnpSA',
        at: AT,
        expiresAt: '2026-10-01T09:05:00.000000Z',
    });
});
```

(Match `responseMessage`'s signature in
`tests/fixtures/response-message.ts`; it is the factory
`tests/adapters-flow-stats.test.ts` uses.)

- [ ] **Step 2: Watch the red**

Run one file. Expected FAIL: `nodeId`, `transition`, and
`claim` are undefined.

- [ ] **Step 3: The twin**

In `client/work-orders-queries.ts`, add `WorkOrderClaim`
above `WorkOrder`; `WorkOrder` gains `nodeId: Id;`,
`transition: { readonly memberId: Id; readonly at:
string };`, `claim: WorkOrderClaim;` after `position`. In
`toWorkOrder`'s `out`:

```ts
        nodeId: entity.state,
        transition: {
            memberId: entity.transition.member_id,
            at: entity.transition.at,
        },
        claim: entity.claim === undefined
            ? { state: 'unclaimed' }
            : {
                state: 'claimed',
                memberId: entity.claim.member_id,
                at: entity.claim.at,
                expiresAt: entity.claim.expires_at,
            },
```

`tests/presenter-workbox-detail.test.ts`'s `makeWorkOrder`
sets `nodeId: graph.nodes[0]!.id`, `transition: {
memberId: 'pjQzgITAPDQVyvCVpzpIfQ', at:
'2026-04-01T12:00:00.000000Z' }`, `claim: { state:
'unclaimed' }`, before `...overrides`.

- [ ] **Step 4: Watch the green; validate; commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add client/work-orders-queries.ts tests/
git commit -m "$(cat <<'EOF'
Give the twin its node, transition, and claim

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 5: Reviews.** Spec-compliance: none of the
three optional; the claim's discriminant is `state`. Code
quality.

---

## Task 10: Read the inbox rows in their own module

**Agent:** coder.

**Spec:** § Testing (the inbox issues no `versions/`
request) — prepares it. Interpretation J.

**Doctrine:** VIII Simplicity. An extraction with no
behavior change: the function body moves verbatim; the
page keeps its own `inboxRows` assignment.

**Files:**
- Create: `web-app/app/workbox-inbox-rows.ts`
- Modify: `web-app/workbox/index.ts:183-241`

- [ ] **Step 1: Move**

`web-app/app/workbox-inbox-rows.ts` exports `InboxRows`
(the interface at `web-app/workbox/index.ts:183-190`,
verbatim) and `getInboxRows(ctx: RequestContext):
Promise<InboxRows>` — `fetchInboxRows`' body verbatim
(`:193-241`), ending `return { workOrders,
transitionsByWo, activeClaimsByWo, memberMap };` in place
of the module-global assignment. It imports what that
body imports, from the same modules. In the page:

```ts
async function fetchInboxRows(
    ctx: RequestContext,
): Promise<InboxRows> {
    inboxRows = await getInboxRows(ctx);
    return inboxRows;
}
```

with `InboxRows` and `getInboxRows` imported from
`../app/workbox-inbox-rows.ts`, and the imports only the
moved body used removed.

- [ ] **Step 2: Validate and commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add web-app/app/workbox-inbox-rows.ts \
    web-app/workbox/index.ts
git commit -m "$(cat <<'EOF'
Read the inbox rows in their own module

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 3: Reviews.** Spec-compliance: `git diff -M
--color-moved` shows the body moved unchanged. Code
quality.

---

## Task 11: Read the inbox from the heads

**Agent:** coder.

**Spec:** Decision 6; §4 (the reader table: inbox reads
heads only); Found 3; Sequence 8 (inbox); § Testing (no
`versions/` request). Interpretation I.

**Doctrine:** XII Performance (no fan-out: one collection
read); I Reliability (the server's `expires_at`, not the
client's arithmetic). Risks: Internal Defense ("has no
transitions" goes); Premature Optimization (no cache).

**Files:**
- Modify: `web-app/app/workbox-inbox-rows.ts`
- Modify: `web-app/app/presenters/workbox-inbox.ts:188-260`
  (`buildInboxItems`)
- Modify: `web-app/workbox/index.ts` (`buildItems`)
- Modify (pins): `tests/workbox-inbox.test.ts` (`:29-30`,
  `:155-212` `WoTables`/`collectTables`, `:216-226`, every
  `buildInboxItems` call, `:404` the "has no transitions"
  test)

**Interfaces:**
- `InboxRows` becomes `{ workOrders: WorkOrder[];
  activeClaimsByWo: Map<Id, ActiveClaim>; memberMap:
  Map<string, Member> }`.
- `buildInboxItems(workOrders, activeClaimsByWo,
  memberMap, mode): InboxItem[]`.

- [ ] **Step 1: Write the red pins**

In `tests/workbox-inbox.test.ts`, add:

```ts
Deno.test('the inbox reads heads only', async () => {
    const { db } = await setupOneWorkOrder();
    const { ctx, sent } = recordedContext(
        db, await organizationToken(),
    );
    await getInboxRows(ctx);
    assertEquals(
        sent.filter((request) =>
            /\/work-orders\/[^/]+\//.test(request.path)),
        [],
    );
});
```

and rewrite `collectTables` to return `getInboxRows(ctx)`
(the page's own read) and the `buildInboxItems` calls to
`buildInboxItems(t.workOrders, t.activeClaimsByWo,
t.memberMap, mode)`. The test at `:404` (a work order with
no transitions throws) is deleted with the behavior: a
head always names its node. Add:

```ts
Deno.test('an inbox item names the head\'s node and last'
+ ' mover', async () => {
    const { tables, woId } = await setupOneWorkOrder();
    const t = await tables();
    const wo = t.workOrders.find((w) => w.id === woId)!;
    const [item] = buildInboxItems(
        [wo], t.activeClaimsByWo, t.memberMap, 'active',
    );
    const node = wo.flowGraph.nodes.find(
        (n) => n.id === wo.nodeId,
    )!;
    assertStrictEquals(item!.stateName, node.name);
    assertStrictEquals(
        item!.lastTransitionedAt, wo.transition.at,
    );
});
```

- [ ] **Step 2: Watch the red**

Run one file. Expected FAIL: `'the inbox reads heads
only'` sees one `…/history` GET per work order; the new
item test fails to type-check at the call (four
arguments) — run with `--no-check` as the one-file
command does; it then fails on `stateName`.

- [ ] **Step 3: Read heads**

`web-app/app/workbox-inbox-rows.ts`:

```ts
// The inbox reads heads only (spec §4): each work order's
// node, last move, and claim ride its head, so one
// collection read serves every row.
export async function getInboxRows(
    ctx: RequestContext,
): Promise<InboxRows> {
    const [workOrders, memberMap] = await Promise.all([
        getWorkOrders(ctx),
        getMemberMap(ctx),
    ]);
    const activeClaimsByWo = new Map<Id, ActiveClaim>();
    for (const wo of workOrders) {
        if (
            wo.claim.state === 'claimed'
            && !isExpiresAtPassed(wo.claim.expiresAt)
        ) {
            activeClaimsByWo.set(wo.id, {
                memberId: wo.claim.memberId,
                at: wo.claim.at,
            });
        }
    }
    return { workOrders, activeClaimsByWo, memberMap };
}
```

(`isExpiresAtPassed` from `../../shared/work-order-claims.ts`;
`ActiveClaim` from the presenter module, where it is
declared.) `buildInboxItems` drops `transitionsByWo`;
the current node is `fg.nodes.find(n => n.id ===
wo.nodeId)` (keep the "references unknown node" throw,
reworded to name the head); `transitionerName` is
`memberName(memberMap, wo.transition.memberId)`;
`lastTransitionedAt` is `wo.transition.at`. The page's
`buildItems` passes `rows.activeClaimsByWo`. Delete the
"has no transitions" throw and the `sorted` / `lastTransition`
locals.

- [ ] **Step 4: Watch the green; validate; commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add web-app/ tests/workbox-inbox.test.ts
git commit -m "$(cat <<'EOF'
Read the inbox from the heads

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 5: Reviews.** Spec-compliance: no history
and no `versions/` read; the `lockTimeoutByWo` map is
gone; the claim judged against `expiresAt`. Code quality.

---

## Task 12: Read the detail's timeline from versions

**Agent:** coder.

**Spec:** Decisions 1, 6, 8; §4 (Timelines; the reader
table: detail reads the head, `versions/` for the
timeline and field values by event); Sequence 8 (detail).
Interpretation I.

**Doctrine:** III Uniformity (`versions/` as for every
family); V Clarity. Risks: Internal Defense ("no
transitions" goes from `findCurrentNode`).

**Files:**
- Modify: `client/work-orders-queries.ts` (new
  `getWorkOrderVersions`, `workOrderEventsOf`;
  `fieldValuesByEventFromHistory` and `projectTransitions`
  take `readonly WorkOrderEventEntity[]`)
- Modify: `web-app/workbox/detail.ts:350-380`
- Modify: `web-app/app/presenters/workbox-detail.ts:221-238`,
  `:761-786` (`findCurrentNode` retires)
- Modify (pins): `tests/presenter-workbox-detail.test.ts`
  (every `new WorkboxDetailPresenter` whose node came from
  the last transition)
- Modify: `tests/adapters-work-orders.test.ts` (add the
  verb pins)

**Interfaces:**

```ts
export async function getWorkOrderVersions(
    ctx: RequestContext,
    id: Id,
): Promise<HttpMessage<WorkOrderEntity>[]>;
// Every version's events, in chain order, oldest first.
export function workOrderEventsOf(
    versions: readonly HttpMessage<WorkOrderEntity>[],
): WorkOrderEventEntity[];
```

- [ ] **Step 1: Write the red pins**

`tests/adapters-work-orders.test.ts`, beside its other
reads (its `setupDb`, `seedFlow`, `buildLinearGraph`,
`createWorkOrder`, `seedRelease`, `START_NODE`, and
`MIDDLE_NODE`, `:107-316`, are the setup; the live client
create births `[START_NODE, MIDDLE_NODE, 'claimed']`):

```ts
Deno.test('a work order\'s events fold from its versions in'
+ ' chain order', async () => {
    const { db, ctx } = await setupDb();
    await seedFlow(
        db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph(),
    );
    const id = await createWorkOrder(
        ctx, 'ZOousbbnzpqlxJExVAruYQ',
    );
    await seedRelease(ctx, id);
    const versions = await getWorkOrderVersions(ctx, id);
    assertStrictEquals(versions.length, 2);
    assertEquals(
        workOrderEventsOf(versions).map((e) => e.state),
        [START_NODE, MIDDLE_NODE, 'claimed',
            'claim_released'],
    );
});
```

`tests/presenter-workbox-detail.test.ts` (its
`makeFlowGraph` has nodes `n-1` and `n-2`; `makePresenter`
`:211-275` defaults every other argument):

```ts
Deno.test('the detail reads its node from the head', () => {
    const graph = makeFlowGraph();
    const presenter = makePresenter({
        graph,
        workOrder: makeWorkOrder(graph, { nodeId: 'n-2' }),
        transitions: [],
    });
    assertStrictEquals(presenter.currentNodeId(), 'n-2');
});
```

- [ ] **Step 2: Watch the red**

Run both files. Expected FAIL: the verbs are not exported
(the adapters file fails to load); the presenter throws
"work order has no transitions".

- [ ] **Step 3: The verbs**

`client/work-orders-queries.ts`, under `/* ── Reads */`:

```ts
// GET work-orders/:id/versions/: every version the work
// order stored, oldest first, each the stored response.
export async function getWorkOrderVersions(
    ctx: RequestContext,
    id: Id,
): Promise<HttpMessage<WorkOrderEntity>[]> {
    return await ctx.GETCollection<WorkOrderEntity>(
        organizationItem(ctx, 'work-orders', id)
            + '/versions/',
    );
}

// A work order's events, in chain order: each version
// carries the events it recorded, and versions arrive
// oldest first.
export function workOrderEventsOf(
    versions: readonly HttpMessage<WorkOrderEntity>[],
): WorkOrderEventEntity[] {
    return versions.flatMap(
        (version) => version.body().toValue().events,
    );
}
```

`fieldValuesByEventFromHistory` and `projectTransitions`
take `readonly WorkOrderEventEntity[]` (their bodies read
only `id`, `state`, `member_id`, `at`, `field_values`).
`projectTransitions`' sort stays until Task 16.

- [ ] **Step 4: The detail page and presenter**

`web-app/workbox/detail.ts` `loadPresenter`: wave 1 reads
`getWorkOrder` and `getWorkOrderVersions(ctx,
workOrderId)` in place of `getWorkOrderHistory`; then

```ts
    // The present is the head; the timeline is the
    // versions' events in chain order (spec §4).
    const events = workOrderEventsOf(versions);
    const transitions = projectTransitions(
        workOrderId, events,
    );
    const fieldValuesByEvent =
        fieldValuesByEventFromHistory(events);
    const activeClaim =
        workOrder.claim.state === 'claimed'
        && !isExpiresAtPassed(workOrder.claim.expiresAt)
            ? {
                memberId: workOrder.claim.memberId,
                at: workOrder.claim.at,
            }
            : null;
```

The presenter's `#currentNode` is
`this.#flowGraph.nodes.find((n) => n.id ===
workOrder.nodeId)`, throwing `'invariant violated: the
head names unknown node ' + workOrder.nodeId` when
absent. `findCurrentNode` is deleted.

Rewrite the presenter pins that set a node through their
last transition: each passes `nodeId` through
`makeWorkOrder(graph, { nodeId: … })` equal to the node
its last transition named. A pin whose subject was "the
last transition decides the node" is deleted with that
behavior; name it in the review notes.

- [ ] **Step 5: Watch the green; validate; commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add client/work-orders-queries.ts web-app/ tests/
git commit -m "$(cat <<'EOF'
Read the detail's timeline from versions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 6: Reviews.** Spec-compliance: the page reads
the head and `versions/`; no history read. Code quality.

---

## Task 13: Gate the transition write on the held node

**Agent:** coder.

**Spec:** Decision 6; §4 (`postWorkOrderTransition`: the
held twin's `nodeId`; no history); Sequence 8
(transition write).

**Doctrine:** I Reliability (gate the node the operator
saw, the held head); XII (one read fewer). Risks:
Internal Defense.

**Files:**
- Modify: `client/record-transitions.ts:56-75`
  (`recordTransitionViolationsFrom` takes `currentNodeId:
  Id` in place of `history`), `:135-167`
- Modify: `client/work-orders-mutations.ts:240-315`
- Modify (pins): `tests/adapters-work-orders.test.ts` (new
  pin). No test calls `recordTransitionViolationsFrom`
  directly; its two callers are the product's.

- [ ] **Step 1: Write the red pin**

`tests/adapters-work-orders.test.ts` (the setup of
`'postWorkOrderTransition succeeds when no live claim
exists'`, `:651-683`):

```ts
Deno.test('a transition reads no history', async () => {
    const { db, ctx } = await setupDb();
    await seedFlow(
        db, 'ZOousbbnzpqlxJExVAruYQ', buildLinearGraph(),
    );
    const woId = await createWorkOrder(
        ctx, 'ZOousbbnzpqlxJExVAruYQ',
    );
    const held = await getWorkOrder(ctx, woId);
    const recorded = recordedContext(
        db, await organizationToken(),
    );
    await postWorkOrderTransition(recorded.ctx, {
        workOrder: held,
        edgeId: EDGE_MIDDLE_FINISH,
        values: {},
    });
    assertEquals(
        recorded.sent.filter(
            (r) => r.path.endsWith('/history'),
        ),
        [],
    );
});
```

(Import `recordedContext` from `./in-page-facade.ts`.)

- [ ] **Step 2: Watch the red**

Run both files. Expected FAIL: one `…/history` GET.

- [ ] **Step 3: The held node**

`recordTransitionViolationsFrom(workOrderId, flowGraph,
currentNodeId, attributes, pendingValues, storedValues)`:
delete its `currentNodeIdFromHistory` call and "no current
node" throw. `postWorkOrderTransition`'s wave 1 reads only
`getRecordForWorkOrder`; it passes `workOrder.nodeId`.
`validateRecordTransition` keeps reading history for one
commit and passes the node it reads:

```ts
    const currentNodeId =
        currentNodeIdFromHistory(history);
    if (currentNodeId === null) {
        throw new Error(
            'work order has no current node: '
            + workOrderId,
        );
    }
```

(Task 14 removes this.)

- [ ] **Step 4: Watch the green; validate; commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add client/ tests/
git commit -m "$(cat <<'EOF'
Gate the transition write on the held node

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 5: Reviews.** Spec-compliance: no history
read in the write. Code quality.

---

## Task 14: Validate a transition against the head

**Agent:** coder.

**Spec:** §4 (`validateRecordTransition`: the head; no
history); Sequence 8 (validator).

**Doctrine:** as Task 13.

**Files:**
- Modify: `client/record-transitions.ts:135-167`
- Modify (pins): `tests/adapters-record-transitions.test.ts`
  (new pin)

- [ ] **Step 1: Write the red pin**

In `tests/adapters-record-transitions.test.ts`, with the
setup of `'validateRecordTransition returns an empty array
for a flow with no record binding'` (`:271-296`):

```ts
Deno.test('validateRecordTransition reads the head, no'
+ ' history', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedSystemMember(db);
    const flowGraph = buildFlowGraph(
        [
            buildNode(CREATE_NODE, [], { isCreate: true }),
            buildNode(TARGET_NODE),
        ],
        [buildEdge(EDGE_1, CREATE_NODE, TARGET_NODE)],
    );
    await seedWorkOrder(db, WO_ID, flowGraph, CREATE_NODE);
    const { ctx, sent } = recordedContext(
        db, await organizationToken(),
    );
    await validateRecordTransition(
        ctx, WO_ID, new Map(), new Map(),
    );
    assertEquals(
        sent.filter((r) => r.path.endsWith('/history')),
        [],
    );
});
```

(`seedWorkOrder` here is the file's own helper, `:108`,
which Task 2 moved onto the create. Import
`recordedContext` from `./in-page-facade.ts`.)

- [ ] **Step 2: Watch the red.** Run one file: FAIL (one
`…/history` GET).

- [ ] **Step 3: Read the head**

`validateRecordTransition`'s wave 1 reads
`getWorkOrder(ctx, workOrderId)` and
`getRecordForWorkOrder`; it passes `workOrder.flowGraph`
and `workOrder.nodeId`. Delete Task 13's interim
`currentNodeIdFromHistory` block and the now-unused
imports.

- [ ] **Step 4: Watch the green; validate; commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add client/record-transitions.ts tests/
git commit -m "$(cat <<'EOF'
Validate a transition against the head

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 5: Reviews.** Spec-compliance; code quality.

---

## Task 15: Chart flow stats from versions

**Agent:** coder.

**Spec:** §4 (Flow-stats: `versions/` per work order, for
whole timelines); Out of scope (no collection-wide read);
Sequence 8 (flow-stats). Review Focus 4.

**Doctrine:** IX Generality (one versions read); the
settled-reads covenant of `2f338fb3`. Risks: Premature
Optimization (no collection read, no cache).

**Files:**
- Modify: `web-app/app/flow-stats.ts:50-71`
- Modify (pins): `tests/adapters-flow-stats.test.ts:184-280`
  (the mock ctx), new pin

- [ ] **Step 1: Write the red pins**

In `'getFlowStats does not GET work-orders/'`
(`:184-280`): the mock's `GET` loses its `/history`
branch; its `GETCollection` answers `[]` for a path ending
`/versions/` in place of `/history`; the two closing
asserts read `'/work-orders/w-join/versions/'` (present)
and `'/work-orders/w-coll/versions/'` (absent). Rename it
`'getFlowStats reads each joined work order\'s versions'`.

Add, after `'a rejected getFlowStats leaves none of its
reads in flight'` and in its shape:

```ts
Deno.test('a rejected versions read leaves none in flight',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const flowId = generateIdentifier();
    const built = buildTestGraph();
    await seedFlow(
        inPageContext(db, token), flowId, 'Stats',
        built.graph,
    );
    const [failing, other] = [
        generateIdentifier(), generateIdentifier(),
    ];
    for (const [position, id] of [failing, other].entries()) {
        await seedCreatedWorkOrder(db, {
            organization: 'AjdvjuECVZEgZoFajaIEkg', id,
            fields: {
                display_id: 'WO-' + position,
                flow_graph: {
                    name: 'Stats', lockTimeout: 0,
                    nodes: [], edges: [],
                },
                position,
            },
            flowId,
            births: [built.createId, built.activeId],
            at: daysAgo(1), token, claim: 'kept',
        });
    }
    const inner = inProcessFetch(db);
    let inFlight = 0;
    let releaseHeld = (): void => {};
    const held = new Promise<void>((resolve) => {
        releaseHeld = resolve;
    });
    const fetch: typeof globalThis.fetch = async (
        input, init,
    ) => {
        const path = new URL(new Request(input, init).url)
            .pathname;
        inFlight += 1;
        try {
            if (path.endsWith(failing + '/versions/')) {
                throw new TypeError('network down');
            }
            if (path.endsWith('/versions/')) await held;
            return await inner(input, init);
        } finally {
            inFlight -= 1;
            if (path.endsWith(failing + '/versions/')) {
                releaseHeld();
            }
        }
    };
    const ctx = createAppClient(
        createHttpFacade(IN_PROCESS_ORIGIN, fetch),
    ).requestContext(await organizationToken());
    const inFlightAtRejection = await getFlowStats(
        ctx, flowId, Date.now(),
    ).then(
        () => { throw new Error('expected a rejection'); },
        () => inFlight,
    );
    assertStrictEquals(inFlightAtRejection, 0);
});
```

(`buildTestGraph`, `seedFlow`, and `daysAgo` are the
file's, `:83-160`; the create's join ties each work order
to `flowId`; `other` is the sibling the fetch holds until
`failing` has rejected.)

- [ ] **Step 2: Watch the red.** Run one file: FAIL (the
paths are `/history`; the in-flight count is the held
sibling).

- [ ] **Step 3: Versions per work order**

`web-app/app/flow-stats.ts`:

```ts
    // One versions read per joined work order (spec §4);
    // every read settles before this call does.
    const ids = [...new Set(
        fwoRows.map(r => r.body().toValue().work_order_id),
    )];
    const reads = await Promise.allSettled(
        ids.map((id) => getWorkOrderVersions(ctx, id)),
    );
    const transitions: TransitionEvent[] = [];
    for (const [index, read] of reads.entries()) {
        if (read.status === 'rejected') {
            throw read.reason;
        }
        transitions.push(...projectTransitions(
            ids[index]!, workOrderEventsOf(read.value),
        ));
    }
```

replacing `:52-71` (`histories`, `woIds`, the loop). The
imports swap `getWorkOrderHistories` for
`getWorkOrderVersions`, `workOrderEventsOf`.

- [ ] **Step 4: Watch the green; validate; commit**

Run `tests/adapters-flow-stats.test.ts`,
`tests/mock-data-lead-to-close.test.ts`,
`tests/mock-data-stats-window.test.ts`: PASS. Then:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add web-app/app/flow-stats.ts \
    tests/adapters-flow-stats.test.ts
git commit -m "$(cat <<'EOF'
Chart flow stats from versions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 5: Reviews.** Spec-compliance: one versions
read per joined work order; all settle. Code quality.

---

## Task 16: Keep chain order in projectTransitions

**Agent:** coder.

**Spec:** Decision 8; §4 (`projectTransitions` keeps chain
order, since two events can share an `at`); § Testing.
Interpretation K. Review Focus 3.

**Doctrine:** IV Logic (an `at` tie is not ordered by
id); VI Immutability (the ledger's order).

**Files:**
- Modify: `client/work-orders-queries.ts:221-256`
- Modify (pins): `tests/adapters-work-orders.test.ts` (new
  pin)

- [ ] **Step 1: Write the red pin**

```ts
Deno.test('projectTransitions keeps chain order for two'
+ ' events at one at', () => {
    const at = '2026-01-01T00:00:00.000000Z';
    const event = (id: string, state: string) => ({
        id, state, member_id: 'XXZruirZyAOoRpNxaDnpSA', at,
        field_values: [],
    });
    const moves = projectTransitions('wo', [
        event('z-first', 'n-1'),
        event('a-second', 'n-2'),
    ]);
    assertEquals(moves.map((m) => m.id), [
        'z-first', 'a-second',
    ]);
    assertEquals(moves.map((m) => m.toNodeId), [
        'n-1', 'n-2',
    ]);
});
```

- [ ] **Step 2: Watch the red.** FAIL: the `(at, id)`
sort puts `a-second` first.

- [ ] **Step 3: Drop the sort**

`const transitions = events.filter(ev =>
!isClaimState(ev.state));` and the comment: "Chain order
is the order (spec Decision 8): the ledger's, oldest first.
Two events can share an `at`." Remove the
`byAtThenIdAscending` import if unused.

- [ ] **Step 4: Watch the green; validate; commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add client/work-orders-queries.ts \
    tests/adapters-work-orders.test.ts
git commit -m "$(cat <<'EOF'
Keep chain order in projectTransitions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 5: Reviews.** Spec-compliance: every caller
passes chain order (`git grep -n projectTransitions`).
Code quality.

---

## Task 17: Retire the client's history helpers

**Agent:** coder.

**Spec:** §4 (Retired); Found 5; Sequence 9.

**Doctrine:** VIII Simplicity; Unbidden Helper Code (dead
helpers go). Risks: Test Weakening (a test that used a
helper as an oracle for another behavior reads the twin
instead; only a test whose subject is the helper goes).

**Files:**
- Modify: `client/work-orders-queries.ts` (delete
  `getWorkOrderHistories`, `getActiveClaimsByWorkOrder`,
  `getTransitionEventsByWorkOrder`, `getWorkOrderHistory`,
  `currentNodeIdFromHistory`, `getWorkOrderCurrentNodeId`,
  `activeClaimFromHistory`, `getWorkOrderActiveClaim`,
  `transitionEventsFromHistory`,
  `getWorkOrderTransitionEvents`; the
  `WorkOrderHistoryEventEntity` import)
- Modify: `web-app/app/flow-stats-aggregate.ts:185`
  (comment: "as the head's `state` reads it")
- Delete: `tests/adapters-work-order-histories.test.ts`
- Modify: `tests/adapters-work-orders.test.ts:54-57`, `:622`,
  `:627`, `:639`, `:644`, `:674`, `:805`, `:831`, `:859`,
  `:930`, `:975`, `:1161`, `:1181`, `:1232`, `:1260-1270`,
  `:1290`
- Modify: `tests/workbox-inbox.test.ts` (any remaining
  import of a retired helper)

- [ ] **Step 1: Rewrite the readers**

In `tests/adapters-work-orders.test.ts`:
- `getWorkOrderCurrentNodeId(ctx, id)` →
  `(await getWorkOrder(ctx, id)).nodeId`.
- `getWorkOrderActiveClaim(ctx, id, lockTimeout)` → the
  twin's claim judged as the pages judge it: `const c =
  (await getWorkOrder(ctx, id)).claim; c.state ===
  'claimed' && !isExpiresAtPassed(c.expiresAt)` — an
  assertion of `null` becomes `false`; of `{ memberId }`
  becomes `true` plus `c.memberId`.
- `getWorkOrderTransitionEvents(ctx, id)` (`:674`) →
  `projectTransitions(id, workOrderEventsOf(await
  getWorkOrderVersions(ctx, id)))`.
- `getActiveClaimsByWorkOrder` (`:1232`): its test's
  subject is the helper; delete the test.
- `:1260-1270` (raw `GET …/history`, one `claim_released`)
  → `workOrderEventsOf(await getWorkOrderVersions(ctx,
  id)).filter((e) => e.state === 'claim_released')` has
  length 1.

- [ ] **Step 2: Delete the helpers; validate; commit**

`git grep -nP "getWorkOrderHistor|currentNodeIdFromHistory|activeClaimFromHistory|transitionEventsFromHistory|getWorkOrderCurrentNodeId|getWorkOrderActiveClaim|getActiveClaimsByWorkOrder|getWorkOrderTransitionEvents|getTransitionEventsByWorkOrder"
-- api client shared web-app tests` is empty.

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add -A client/ web-app/ tests/
git commit -m "$(cat <<'EOF'
Retire the client's history helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 3: Reviews.** Spec-compliance: each
rewritten test keeps its subject; only the helper's own
tests are gone. Code quality.

---

## Task 18: Retire the work-order history route

**Agent:** coder.

**Spec:** Decisions 1, 9; §3 (Retired: the route; the
comments at `api/routes.ts:4528`, `:5443`); §5 (The
commit that retires `/history`); Sequence 10; § Testing
(`GET …/history` is a router 404). Interpretations C, M.

**Doctrine:** III Uniformity (every GET serves a stored
response); V Clarity (the covenant written). Risks: Test
Weakening (a `/history` route test either becomes a
`versions/` test of the same subject or is deleted with
the route).

**Files:**
- Modify: `api/routes.ts:4487-4501` (delete the row and
  its comment), `:4526-4529`, `:5442-5446` (comments), the
  `workOrderHistoryFor` import (`:257`)
- Modify: `api/derive-states.ts:38-39`, `:541-543`, `:621`
  (comments naming the route; the function stays,
  Interpretation C)
- Modify: `api/authorization.ts:139` (comment)
- Modify: `tests/parted-reads.test.ts` (`PARTED = []`; the
  header)
- Modify: `ARCHITECTURE.md:221-226`, `## Do not resurrect`
  (`:424-449`), and a new `## A response is one unit`
- Create: `tests/fixtures/work-order-events.ts`
- Modify (pins):
  - `tests/api-work-order-history.test.ts` — keep the file
    (ARCHITECTURE cites it); keep its bulk-404 test
    (`:397`); delete every other test; add the router-404
    pin below
  - `tests/drift-phase15-cores-parity.test.ts:1301-1380`
    (`/history` own/foreign/absent → `versions/`)
  - `tests/drift-state-field-values.test.ts:152-190`
    (route-vs-derive parity: deleted with the route),
    `:233` (field values in identifier order → read the
    event's `field_values` through the fixture)
  - `tests/drift-states.test.ts:346` (per-item count →
    `versions/`), `:429-508` (case 2: `/history` against
    `entityHistory().toReversed()` → the fixture's events
    against `entityHistory()`, chain order; its `(at, id)`
    DESC loop for the work-order family goes with the
    reversal)
  - `tests/api-organization-isolation.test.ts:1071-1135`
    (→ `versions/`; foreign 403 or 404 as the generic
    route answers it: read once, pin that)
  - `tests/api-versions-etag.test.ts:92-106` (`/history`
    matches nothing)
  - `tests/api-work-orders-get-class.test.ts:369-399`
    (`/history` 404)
  - `tests/api-documentation-generator.test.ts:384-385`
    (the `omits` entry goes)
- Regenerate: `web-app/api-documentation/`

**Interfaces:**
- Produces, in `tests/fixtures/work-order-events.ts`:

```ts
export async function getWorkOrderEvents(
    db: DbAdapter,
    token: string,
    organization: Id,
    workOrderId: Id,
): Promise<WorkOrderEventEntity[]>;
```

- [ ] **Step 1: The fixture**

```ts
import { assertStrictEquals } from '@std/assert';
import type { DbAdapter } from '../../api/db.ts';
import { handleRequest } from '../../api/api.ts';
import { workOrderEventsOf } from
    '../../client/work-orders-queries.ts';
import type {
    Id, WorkOrderEntity, WorkOrderEventEntity,
} from '../../shared/types.ts';
import { apiRequest, partsOf } from '../http-fixtures.ts';

// A work order's history, as the product reads it (spec
// §3): its versions' events, in chain order.
export async function getWorkOrderEvents(
    db: DbAdapter,
    token: string,
    organization: Id,
    workOrderId: Id,
): Promise<WorkOrderEventEntity[]> {
    const res = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/organizations/' + organization
            + '/work-orders/' + workOrderId + '/versions/',
        token,
    }));
    assertStrictEquals(
        res.status, 200,
        'versions of ' + organization + '/' + workOrderId,
    );
    return workOrderEventsOf(
        await partsOf<WorkOrderEntity>(res),
    );
}
```

- [ ] **Step 2: Write the red pins**

`tests/api-work-order-history.test.ts`:

```ts
Deno.test('a work order\'s /history is a router 404',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = DEV_TOKEN;
    const id = generateIdentifier();
    await seedCreatedWorkOrder(db, {
        organization: 'AjdvjuECVZEgZoFajaIEkg', id,
        fields: {
            display_id: 'WO-H',
            flow_graph: flowGraph(),
            position: 1,
        },
        flowId: FLOW_ID,
        births: [NODE_START, NODE_MIDDLE], at: nowUtc(),
        token, claim: 'kept',
    });
    const res = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/work-orders/' + id + '/history',
        token,
    }));
    assertStrictEquals(res.status, 404);
    await res.body?.cancel();
});
```

(`flowGraph`, `NODE_START`, `NODE_MIDDLE`, `FLOW_ID` are
the file's own, `:40-80`; import `seedCreatedWorkOrder`
from `./work-order-fixtures.ts`.)

`tests/parted-reads.test.ts`:

```ts
// The GET routes that answer handler JSON instead of the
// stored response. The list is empty: every GET serves a
// stored response (ARCHITECTURE.md § A response is one
// unit). Until the get slot retires, a route that adds a
// `get` fails here.
const PARTED: string[] = [];
```

Rewrite the other named pins as listed under Files.

- [ ] **Step 3: Watch the red.** Run the named files:
FAIL on the router 404 (200 today), the census (one
route still defines `get`), and the flipped matches.

- [ ] **Step 4: Retire the route; land the covenant**

Delete the route row and its comment; reword the comments
listed under Files to name `versions/`; regenerate the API
documentation. In ARCHITECTURE.md:
- Delete the sentence at `:221-225` ("One GET route still
  answers handler JSON: … (`tests/parted-reads.test.ts`).")
  so `:226` follows `:220` directly.
- Add `## A response is one unit` after `## Derivation`,
  in TODO item 1's approved wording verbatim
  (`TODO.md:500-531`, the quoted paragraph from "The API,
  the client, and the application treat a response" to
  "never from `request`."), then: "The one read function
  is `servedResponse` (`api/served-response.ts:74`); the
  client's splitter is `splitParts`
  (`shared/http-message/multipart.ts:90`), which the
  collection GET calls (`client/http-facade.ts:390`)."
- In `## Do not resurrect`, before `## How we got here`:

```markdown
- a work order's `/history` — answers handler JSON;
  history is `versions/`
  `tests/api-work-order-history.test.ts` ('a work order's
  /history is a router 404')
```

  (Match the list's entry format: read the entries at
  `:441-448` and follow them.)

- [ ] **Step 5: Watch the green; validate; commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add api/ ARCHITECTURE.md web-app/api-documentation/ \
    tests/
git commit -m "$(cat <<'EOF'
Retire the work-order history route

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 6: Reviews.** Spec-compliance: `PARTED` is
`[]` and the census test still fails if a route adds
`get`; the covenant is verbatim with its two file
references; the do-not-resurrect pin names the 404 test.
Code quality.

---

## Task 19: Retire the handler-JSON GET slot

**Agent:** coder.

**Spec:** Decision 9; §5 (The next commit); Sequence 11.

**Doctrine:** III Uniformity (a GET selects or is 405);
the type system holds the covenant. Risks: Test
Weakening (the dispatch probes keep their subject:
routing, not handler JSON).

**Files:**
- Modify: `api/routes.ts:540-560` (the `GetHandler`
  comment: it now serves only `documentGetHandler` and
  `documentCollectionGetHandler`), `:648-679` (`Route`,
  `route`: no `get`)
- Modify: `api/api.ts:1018-1040` (a GET with no `select`
  is 405), `:1223` (comment)
- Modify: `api/route-surface.ts:9-11`, `:33-36`
  (`GET_SERVERS` is `['select']`; or `offeredVerbs` reads
  `row.select` for `'get'`)
- Delete: `tests/parted-reads.test.ts`
- Modify (pins): `tests/api-auth-table-offer.test.ts:13`
  (delete the `row.get` line), `tests/api-identifier-route-gate.test.ts:34`
  (`route.select !== undefined` alone),
  `tests/api-invitation-nests.test.ts:75`, `:83`, `:94`,
  `:102` (delete the four `route.get` lines),
  `tests/api-dispatch-inversion.test.ts:28-48`, `:70-90`
  (probes `select` an empty collection; the matched probe
  answers 204, the unauthenticated one 401),
  `tests/route-surface.test.ts:43`, `:52` (`select` in
  place of `get`)

- [ ] **Step 1: Write the red pin**

`tests/api-dispatch-inversion.test.ts`'s first probe:

```ts
        const probe = route(
            'organizations/:organization-id/XpBeHmMjsWMQXipgvzBjqA',
            {
                select: async () => ({
                    kind: 'collection',
                    heads: [],
                    lifecycle: 'stateless',
                    reader: { sees: 'whole' },
                }),
            },
        );
```

asserting `res.status === 204`; and a new test:

```ts
Deno.test('a GET on a route that selects nothing is 405',
async () => {
    const probe = route(
        'organizations/:organization-id/YpBeHmMjsWMQXipgvzBjqA',
        { put: async () => {} },
    );
    routes.push(probe);
    try {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const res = await handleRequest(db, req(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/'
                + 'YpBeHmMjsWMQXipgvzBjqA',
            await organizationToken(),
        ));
        assertStrictEquals(res.status, 405);
        await res.body?.cancel();
    } finally {
        routes.splice(routes.indexOf(probe), 1);
    }
});
```

(Match `HeadSelection`'s `collection` arm,
`api/head-reads.ts:46-51`, and `PutHandler`'s signature.)

- [ ] **Step 2: Watch the red.** The new 405 test passes
already (no `get`); it guards what must stay. The rewritten
probe passes too. The red is the type check: after Step 3
removes the slot, `deno check` fails on every `row.get`
named above until Step 4 — run `deno check --frozen api
client shared server tests web-app` after Step 3 and see
those errors, and only those.

- [ ] **Step 3: Remove the slot**

`Route` and `route(…)` lose `get?`; `api/api.ts`'s GET
arm keeps the `select` branch, then answers 405 with
today's body; the `matched.get` call and the
`Response.json(result)` branch go. `route-surface.ts`
offers `'get'` when `row.select !== undefined`.

- [ ] **Step 4: Fix the named sites; delete the census;
validate; commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
git rm tests/parted-reads.test.ts
./test validate
git add api/ tests/
git commit -m "$(cat <<'EOF'
Retire the handler-JSON GET slot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 5: Reviews.** Spec-compliance: `GetHandler`
stays for its two users; no route defines `get`. Code
quality.

---

## Task 20: Read lifecycle oracles through versions

**Agent:** coder.

**Spec:** Decision 10; § Testing (the thirteen files read
through `tests/fixtures/work-order-events.ts`; the two
deletions); Sequence 12.

**Doctrine:** Office of Verification (test at the highest
level: the HTTP read the product uses). Risks: Test
Weakening (each pin keeps its subject; only its oracle
changes).

**Files (every `workOrderLifecycleStatesFor` caller):**
- `tests/adapters-work-orders.test.ts`
- `tests/api-transition-legacy-cut.test.ts`
- `tests/api-work-order-claim.test.ts`
- `tests/api-work-order-release.test.ts`
- `tests/api-work-order-transition.test.ts`
- `tests/api-work-orders-create.test.ts`
- `tests/derive-states-union.test.ts`
- `tests/derive-states-work-orders.test.ts`
- `tests/drift-states.test.ts`
- `tests/drift-work-orders.test.ts`
- `tests/mock-data-pairs.test.ts`
- `tests/mock-data-records.test.ts`
- `tests/mock-data-valid.test.ts`
- Delete: `tests/derive-work-order-lifecycle-for.test.ts`
- Modify: `tests/drift-phase14-cores-parity.test.ts`
  (delete its work-order case)

- [ ] **Step 1: The rule**

`workOrderLifecycleStatesFor(db, organization, id)` →
`getWorkOrderEvents(db, token, organization, id)` with a
token of that organization the test already holds (or
`await organizationToken('XXZruirZyAOoRpNxaDnpSA',
organization)`). The rows lose `entity_id` and gain
`field_values`; order is chain order, as the lifecycle's
was. A pin that read `entity_id` reads the work order id
the call named. A seeded read uses `seededMockDb()` /
`sharedMockDb()` as the test does.

- [ ] **Step 2: Apply, run each file, validate, commit**

Run one file for each listed file: PASS. Then:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add -A tests/
git commit -m "$(cat <<'EOF'
Read lifecycle oracles through versions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

`git grep -n workOrderLifecycleStatesFor -- tests` is
empty.

- [ ] **Step 3: Reviews.** Spec-compliance: thirteen files
moved, two deletions, no assertion weakened. Code quality.

---

## Task 21: Read history oracles through versions

**Agent:** coder.

**Spec:** Decision 10; § Testing (the history oracle: the
fixture not regenerated; exactly one `claimed` birth at
`trace[1].at`); Sequence 12. Interpretation C.

**Doctrine:** as Task 20.

**Files (every remaining `workOrderHistoryFor` caller):**
- `tests/work-order-history-oracle.test.ts`
- `tests/api-work-order-history-shapes.test.ts`
- `tests/api-work-order-transition.test.ts`
- `tests/drift-phase15-cores-parity.test.ts:1385-1421`
- `tests/drift-states.test.ts:1272`
- `tests/mock-data-instance-chain.test.ts:164`
- `tests/mock-data-records.test.ts:315`
- `tests/mock-data-valid.test.ts:528`

- [ ] **Step 1: The history oracle**

`tests/work-order-history-oracle.test.ts` reads through
the fixture. `tests/fixtures/work-order-histories.json` is
not regenerated (`git diff ed1fac5c --
tests/fixtures/work-order-histories.json` stays empty).
Its rows are newest first and carry `entity_id`; the
events are chain order and do not:

```ts
// The fixture's rows, newest first, as chain-order
// events: oldest first, the path naming the work order,
// and the create's claim birth at the second event's
// moment (spec §2).
function expectedEvents(
    rows: ReadonlyArray<WorkOrderHistoryRow>,
): WorkOrderEventEntity[] {
    const events = rows.toReversed().map(
        ({ entity_id: _path, ...event }) => event,
    );
    const [start, node, ...moves] = events;
    return [
        start!,
        node!,
        {
            id: workOrderClaimEventId(rows[0]!.entity_id),
            state: 'claimed',
            member_id: start!.member_id,
            at: node!.at,
            field_values: [],
        },
        ...moves,
    ];
}
```

where `WorkOrderHistoryRow` is a local type for the
fixture's row shape (`WorkOrderEventEntity & { entity_id:
Id }`), declared in the test — the shared
`WorkOrderHistoryEventEntity` goes in Task 22. The two
tests (Task 1's names) assert
`assertEquals(await getWorkOrderEvents(db, token,
organization, workOrder), expectedEvents(shifted))` and
exactly one `claimed` event per work order whose `at` is
the second event's.

- [ ] **Step 2: The other callers**

`workOrderHistoryFor(db, organization, id)` →
`getWorkOrderEvents(db, token, organization, id)`. Rows
lose `entity_id`; order becomes chain order (oldest
first): a pin that read `rows[0]` as newest reads
`.at(-1)`; a pin of `(at, id)` DESC order
(`tests/api-work-order-history-shapes.test.ts:447`)
becomes a pin of chain order — each event's `at` is not
before its predecessor's. A derive-level "rejects for an
absent id" (`tests/api-work-order-transition.test.ts:345`,
`tests/drift-phase15-cores-parity.test.ts:1385-1421`)
asserts the `versions/` read's 404 or 403 directly with
`handleRequest`.

- [ ] **Step 3: Run each file, validate, commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add tests/
git commit -m "$(cat <<'EOF'
Read history oracles through versions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

`git grep -n workOrderHistoryFor -- tests` is empty.

- [ ] **Step 4: Reviews.** Spec-compliance: the JSON is
unregenerated; one birth per work order at `trace[1].at`;
nothing else changed. Code quality.

---

## Task 22: Retire the server's history folds

**Agent:** coder.

**Spec:** Decision 10; §3 (Then, once tests read through
`versions/`); Sequence 13. Interpretation C.

**Doctrine:** VIII Simplicity; the ledger is derived by
the read, not folded by the server.

**Files:**
- Modify: `api/derive-states.ts` (delete
  `workOrderVersionsFor` `:505-519`,
  `workOrderLifecycleStatesFor` `:521-538`,
  `workOrderHistoryFor` `:540-568`; the
  `WorkOrderHistoryEventEntity` and `historyOf` imports;
  the comment at `:47-49` and `:615-622` naming them)
- Modify: `api/work-order-version.ts:318-325` (delete
  `historyOf`; the header comment's "History is the chain
  of versions" stays)
- Modify: `shared/types.ts:451-457` (delete
  `WorkOrderHistoryEventEntity`), `:427-429` (the
  `StateEntity.etag` field stays — `api/derive-documents.ts:220`
  reads it in `stateHistoryFrom`; its comment becomes "A
  document lifecycle row may carry it. Value is that
  revision's pair id.")
- Modify: `tests/work-order-version.test.ts:184-194`
  (delete `'history is every version\'s events, newest
  first'`)

- [ ] **Step 1: Delete; validate; commit**

`git grep -nP "workOrderHistoryFor|workOrderLifecycleStatesFor|workOrderVersionsFor|historyOf|WorkOrderHistoryEventEntity"
-- api client shared web-app tests` is empty.

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add api/ shared/types.ts tests/work-order-version.test.ts
git commit -m "$(cat <<'EOF'
Retire the server's history folds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 2: Reviews.** Spec-compliance:
`TransitionFieldValueEntity` stays (events carry it);
`versionOf` and `workOrderHeadFor` stay. Code quality.

---

## Task 23: Describe history as versions in the docs

**Agent:** coder.

**Spec:** `## Docs that change when this ships`;
`## For the next brainstorms`; §5 (Immutable document
types). Interpretations A, B.

**Doctrine:** V Clarity (no passage states what is not
true at this commit).

**Files and passages:**
- `AGENTS.md` `### Follow the RFCs` (`:284-292`): after
  "even for an id never written (RFC 9110 §13.1.1)",
  insert "where a PUT can create it; where only a POST
  creates — a work order — a conditional PUT on an absent
  one answers 404, its preconditions ignored (§13.2.1),
  and a PUT with neither precondition answers 428".
- `API.md`: step 8 (`:73-84`): "A GET route selects heads
  (`select`, `api/head-reads.ts`) and the gate serves them
  (`api/served-response.ts`), or answers 405." —
  deleting the handler-JSON clause; `:165-168` gains the
  work-order versions; the work-order operations paragraph
  (`:382-391`) gains "The document PUT supersedes only; a
  work order is born by `POST …/work-orders/`. History is
  `…/work-orders/:id/versions/`."; the 404 rung
  (`:194-198`) gains "a conditional work-order PUT on a
  work order never created"; `:484-486`
  `EXPECTED_MESSAGE_PAIR_COUNT = 1882`.
- `ARCHITECTURE.md` `## Work orders` `:352-353`: "History
  is the version chain: every version's `events`, read
  through `versions/` in chain order." (The covenant
  landed in Task 18.)
- `FLOW-CANVAS.md:250-254`: "derived from each joined work
  order's `versions/` in chain order
  (`getWorkOrderVersions`, `workOrderEventsOf`)".
- `TEST-PLAN.md`: WB16's pin (`:4440-4443`) and WB19's
  (`:4489-4492`) cite `tests/api-work-order-versions.test.ts`
  'a work order lists its versions oldest first, each
  part the version its tag serves'; `:4417` "Derived WO
  history is chain order, oldest first (`versions/`)";
  WB13a `:4470`, WB19 `:4481`, WB18 `:4606` read
  "`GET work-orders/:id/versions/`"; WB13a gains that the
  first claim of a seeded work order records
  `claim_expired` for its creator's lapsed birth claim,
  then `claimed`. No B19 or C2 edit (Interpretation B).
- `TODO.md`:
  - item 1's census sentence (`:481-483`) → "The census
    emptied with the fifth spec."; the fifth-spec
    paragraph (`:495-557`) gives way to: "The fifth landed
    (`docs/superpowers/specs/2026-10-04-work-order-events-design.md`):
    a work order's history is its versions; every GET
    serves a stored response, and the type system says
    so (`ARCHITECTURE.md` § A response is one unit)." —
    Task 25 adds its figures; item 1 stays listed until
    items 0–3 deploy.
  - `:1558`, `:1569-1574` (the slash bullet: delete — the
    route is gone), `:2712-2715` (one route stays parted →
    none).
  - `## Later work` gains, in the section's bullet format:

```markdown
- Immutable document types. A family declares itself
  immutable where it declares its conditional; every
  write is a genesis under the never-written latch, so a
  second write at a written name stores nothing (412 for
  a client's declaration, 409 for a handler's) and a
  retired name answers 410; DELETE answers 405; only
  erasure removes pairs. Its consumer is the join
  documents: `postFlowWorkOrderDocumentOp` and
  `postFlowRecordDocumentOp` (`api/routes.ts`) land a PUT
  with no latch, so a second PUT at a join's name replaces
  what it joins. Oracle: a second PUT at a written join
  name stores nothing and answers 409 or 412.
```

- [ ] **Step 1:** edit each passage; `./test validate`
green; commit:

```bash
git add AGENTS.md API.md ARCHITECTURE.md FLOW-CANVAS.md \
    TEST-PLAN.md TODO.md
git commit -m "$(cat <<'EOF'
Describe history as versions in the docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

- [ ] **Step 2: Reviews.** Spec-compliance: every listed
doc passage; nothing claims what is not true at this
commit. Code quality (prose).

---

## Task 24: Gate

**Agent:** orchestrator, with the operator.

- [ ] **Step 1: Layer 1.** `./test validate`: green, or
`already validated <sha>` on the clean head.
- [ ] **Step 2: Postgres.** Ask the operator to run, from
the main checkout:

```bash
cd .worktrees/work-order-events
./test postgres 2>&1 | tee .superpowers/postgres-task-24.txt
```

Read the file: green, `tests/pg-ledger-seed.test.ts` and
`tests/pg-seed.test.ts` included.
- [ ] **Step 3: Layer 2.** Ask the operator for:

```bash
cd .worktrees/work-order-events
./test validate browser 2>&1 \
    | tee .superpowers/browser-task-24.txt
```

Read the file: green, `tests/browser/workbox-transition.test.ts`
and `tests/browser/api-documentation.test.ts` included. A
red is fixed by a task-shaped commit (red test first)
before this task closes.
- [ ] **Step 4: What must be gone.**

```bash
git grep -nP "/history|workOrderHistoryFor|workOrderLifecycleStatesFor|historyOf|WorkOrderHistoryEventEntity|getWorkOrderHistor|activeClaimFromHistory|currentNodeIdFromHistory|get\?:|PARTED" \
    -- api client shared server web-app tests \
    ':!web-app/api-documentation'
```

Expected hits, each read: other families' retired
`/history` 404 pins (`tests/api-entity-history-routes.test.ts`,
`tests/api-flows-versions-retired.test.ts`); the bulk
`work-orders/history` 400/404 pins
(`tests/drift-states.test.ts:310`,
`tests/api-work-order-history.test.ts`,
`tests/api-versions-etag.test.ts:118-131`); the router-404
pin of Task 18; `tests/measure-profile-core.test.ts:45-47`
(a path string for a generic canonicalizer, not a
request); comments that say a route is retired. Any other
hit is a stop. `get?:` matches nothing in `api/`.
No commit.

---

## Task 25: Measure the tip

**Agent:** orchestrator, with the operator.

**Spec:** header `Witness`.

- [ ] **Step 1: `./test`, three runs**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
for run in 1 2 3; do
    /usr/bin/time -p -o "$TMPDIR/woe-tip-$run.time" \
        ./test > "$TMPDIR/woe-tip-$run.log" 2>&1
    echo "tip $run: exit $?"
done
grep -H real "$TMPDIR"/woe-tip-*.time
```

Record the median `real`, one decimal, against 112.8 s.
A red run is reported with its failing test and replaced
by one more run.

- [ ] **Step 2: The seed's pairs and stored bytes**

Write `$TMPDIR/woe-seed-shape.test.ts`:

```ts
import { memoryDbAdapter } from
    '<worktree>/api/db-memory.ts';
import { postMockDataLoad } from
    '<worktree>/api/mock-data.ts';
import { testHashPassword } from
    '<worktree>/tests/mock-seed.ts';

Deno.test('seed shape', async () => {
    const db = memoryDbAdapter();
    await postMockDataLoad(db, {
        hashPassword: testHashPassword,
    });
    const pairs = await db.messagePairs.getAll();
    console.log('pairs', pairs.length);
    console.log('stored', pairs.reduce(
        (n, pair) => n + pair.request.length
            + pair.response.length, 0,
    ));
});
```

(`<worktree>` is this worktree's absolute path.) Run it
with the one-file command. Record pairs and stored
characters against the base: **2317** and **6,244,233**
(the seed at `2acbc87a`, the same script).
Expected pairs: 1882.

- [ ] **Step 3: The operator's measure, tip only**

The tree must be clean. Ask the operator to run, once:

```bash
cd .worktrees/work-order-events
./bin/measure --record --visualize \
    2>&1 | tee .superpowers/measure-tip.txt
```

No `--write-budgets`, no `--check`, no before-sweep.
Read the file, then compare the tip row in
`measurements/history.jsonl` with `7d34749`'s (medians
of 25): dashboard, ideas, projects, records, flows,
workbox (and its `fetch:active-list`, 118.0 ms at
`7d34749`), the workbox detail fetch (30.2 ms), members,
identities, organization.

- [ ] **Step 4: Record**

Commit the measurement files the operator's run wrote:

```bash
git status --short   # the measurement files only
./test validate
git add measurements/
git commit -m "$(cat <<'EOF'
Record the work-order events tip measure

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

Then add to TODO item 1's progress, after Task 23's
sentence: "`./test` 112.8 s → <tip> s (medians of three);
seed pairs 2,317 → <tip>, stored bytes 6,244,233 →
<tip>; readyMs per list page, `7d34749` → tip (medians
of 25, `measurements/history.jsonl`): <page> <a> → <b>,
…; workbox `fetch:active-list` 118.0 → <b>." Then:

```bash
./test validate
git add TODO.md
git commit -m "$(cat <<'EOF'
Record work-order events' times

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BZy6y26HzzsvAJ24Kq4aGk
EOF
)"
```

If the operator cannot run Chrome, say so (a named driver
limit gets one attempt), record the `./test` and seed
figures alone, and say the readyMs comparison is absent.

---

## Task 26: Report and wait

**Agent:** orchestrator.

- [ ] **Step 1: Report.** The two medians, the seed's
pairs and bytes, the measure table against `7d34749`,
every race trip by title, every pin rewritten or deleted
by file, every stop, and every interpretation overruled.
- [ ] **Step 2: Wait for the owner's word.** Do not land.
Landing is the owner's call. When given, per the spec's
header:

```bash
git -C .worktrees/membership-and-versions log --oneline \
    membership-and-versions..work-order-events
git -C .worktrees/membership-and-versions merge --ff-only \
    work-order-events
```

If `membership-and-versions` has landed, the owner names
where it landed; rebase onto it and fast-forward there.
Cleanup after landing, in this order: (1) the owner runs
`git worktree remove .worktrees/work-order-events` from
the main checkout; (2) then `git -C <the landing
worktree> branch -d work-order-events`, never from the
main checkout. Never `-D`. `master` does not move.

---

## Spec coverage

| Spec | Task |
|---|---|
| Axiom | the whole graph |
| Decision 1, history is `versions/` | T6, T12, T15, T18 |
| Decision 2, events stay in their version | T7, T12 (no event documents); T23 (TODO) |
| Decision 3, `state` and `transition` required | T4, T5 |
| Decision 4, creation is the POST alone | T2, T3; Interpretation A |
| Decision 5, the seed creates through the POST | T1 |
| Decision 6, the present from the head | T9, T11, T12, T13, T14 |
| Decision 7, absence named; `ClaimStatus` → `state` | T8, T9 |
| Decision 8, chain order | T12, T16 |
| Decision 9, census empties, then the slot | T18, T19 |
| Decision 10, server folds no history | T20, T21, T22; Interpretation C |
| Decision 11, immutable types to later work | T23 |
| Found 1 (traces fit the create) | Context (measured); T1 |
| Found 2 (the create births three) | T1, T2, T5 |
| Found 3 (the inbox's fan-out) | T11; T25 (measured) |
| Found 4 (version reads are generic) | T6 |
| Found 5 (test-only derives and helpers) | T17, T20, T22 |
| Found 6 (join documents rewrite) | T23 (later-work bullet) |
| `## Out of scope` | Global Constraints (Scope) |
| Sequence 1 | T1 |
| Sequence 2 | T2, T3 |
| Sequence 3 | T4, T5 |
| Sequence 4 | T6 |
| Sequence 5 | T7 |
| Sequence 6 | T8 |
| Sequence 7 | T9 |
| Sequence 8 (inbox, detail, write, validator, flow-stats) | T10–T11, T12, T13, T14, T15 (and T16) |
| Sequence 9 | T17 |
| Sequence 10 | T18 |
| Sequence 11 | T19 |
| Sequence 12 | T20, T21 |
| Sequence 13 | T22 |
| Sequence 14 | T23 |
| §1 the facet, its writers | T5 |
| §1 creation is the POST; preconditions ignored | T3; Interpretation A |
| §1 internal defense retires | T5 (server), T11–T14 (client) |
| §2 the seed | T1; Interpretation E; Appendix A |
| §3 version reads; retirements | T6, T18, T22 |
| §4 wire type, twin, timelines, reader table, retirements | T7, T9, T11–T17 |
| §5 census, covenant, slot; immutable types | T18, T19, T23 |
| `## Error and wire` | T3 (403/404/412/428), T6 (200/403/404), T18 (404 `/history`), T19 (405) |
| § Testing, new pins | T1 (oracle), T3 (PUT), T5 (validator, builders), T6 (versions), T9 (twin), T11 (inbox), T16 (chain order), T18 (router 404) |
| § Testing, the thirteen oracle files and two deletions | T20 |
| § Testing, standing pins | T1, T2, T3, T5, T6, T12, T17, T18, T19, T21 |
| `## Docs that change` | T18 (ARCHITECTURE covenant), T23; Interpretation B |
| Witness | T25 |
| `## For the next brainstorms` | T23 (TODO) |

---

## Appendix A: the 145 claim birth ids

`workOrderClaimEventId(id)` =
`seedIdentifier('seed-work-order-' + id + '-claimed')`,
computed on the seed at `2acbc87a`. H = hand-authored
(`api/mock-data/work-orders.ts`, `buildWorkOrders()`
order), G = generated (`buildLeadToCloseWorkload()
.workOrders` order).

| # | Work order | Claim birth id |
|---|---|---|
| H001 | `xqcXYHXBJJXcLkRYkRngKA` | `oFyLhsd2EDgP4un8UY0H-A` |
| H002 | `krzCXtfVNOLvbGcYnSrhng` | `L7h2RUMjnyxKtLYLrfNYBA` |
| H003 | `uxTjfwTdFboxQRRfLQBfjA` | `MmNu5CC9_lkMOuVvwgpBhg` |
| H004 | `JwjCJbRVYCGojtDDMbFISw` | `jOOh9DCoNKgm87ieGr8LuQ` |
| H005 | `VdkdxziHStBwGlqXMplgzg` | `z1MNhzQeZk20ACdtwxiPAQ` |
| H006 | `SEHtXAFBwzspwfqzUgLOGg` | `9r_qJ4WNPdGWoXLYA87SvA` |
| H007 | `EXifLeJkIZYAFlniPDbnyw` | `5CYXr8DqRdZj8GVtXoSGKg` |
| H008 | `XNCcLuvJJIMafjqfDQcysA` | `ig6CXGVKk6H7OPnisBWCzQ` |
| H009 | `kuHSbxoxnsegYoJpuziaIA` | `jySuzX6F-OKXJYUyzMeWIw` |
| H010 | `ZIKwhTVQUmZbzpUElPynGg` | `5S6Ywtzu3bFTZlXIzD4Q9Q` |
| H011 | `eGKKhdvQWwAgjMJCmOiWsg` | `W3bna4Q7NvG4fTtch2tYcQ` |
| H012 | `kwfRAQskBMDhxupBJSXBXg` | `N1GXQlVHGSLdP420CMu1yg` |
| H013 | `FPRJDMIESNrhvDpngiVgAA` | `boBaA8BSL74sZO3JVTGblw` |
| H014 | `HEEYmJQUuZTwpwZwEvDHIA` | `AkRUvlV0QuRDTfnVp_SYRw` |
| H015 | `AgBUgTINNElBAvqwWMUegw` | `IQG2bxsMvZAWoIYSZkENog` |
| H016 | `SwOSfDtxXEdmGGuHaNzXAQ` | `vautbnSDwWa9WjhHcWzdoQ` |
| H017 | `swamOcwhrDmLKzRKlqunFw` | `-dUgbg-cO8j-w8DBX4txYA` |
| H018 | `TRzdRYgxAuHFJsJxdGtngw` | `7ArZlrSdRgs8WBEVAOTEIg` |
| H019 | `QfOuwFUXrsWqHFnJgTSDCg` | `M0bmVqhZQp_KsguT-A1agA` |
| H020 | `GJyTGedIrFfonBxkniEylA` | `ruwm02mBMEm7cwWQDS0byg` |
| H021 | `BqOPvRjANCSRrdRwRGbyUw` | `sitGfHwHWmSbAtq4VcTtnw` |
| H022 | `UegjcqnhNlWGJMWYjRMgCQ` | `UBb2Fs-Pu1gYrzzDgfoZLQ` |
| H023 | `QtuoBiqabeXfgMIMUgMUaQ` | `IE53HMcH5ycpU28xukom_A` |
| H024 | `NQLhTgeebJflEfLNiIKRbw` | `q5MpbrRDO4GTK4pfQMa3jw` |
| H025 | `FEDdQbmpanDFVZdPnUbwWg` | `WKxySbburKq8s19jYx3f6A` |
| H026 | `OAvDqHdtlzUeHVxrxlcFgg` | `PYRtSpOtYTvzIpYuNxXncg` |
| H027 | `yuPIkpaXrJNwIzfKMytkfg` | `jw2G8ToVXVlZbMWHd7cf4w` |
| H028 | `xiekvzKePoUXMiQlySGHag` | `Lkc1DOe6RU_X9Vn9DDavZg` |
| H029 | `BRDKCttpdvJSFqPxmPEAxg` | `HuT3QHKWoTV5xkRMNzF0PQ` |
| H030 | `gButmqAicxcpsNuiTYQNKA` | `cUxgW7JRvk8wBUe3cV3a6g` |
| H031 | `AbRcGuaSMFbUfPAexnegfw` | `SgoBRMTdeus_bCChppTVDg` |
| H032 | `nTIlwHvYCLLpcgDPpZfJsw` | `Res6wc79_TsbejgK4TlIIw` |
| H033 | `HxoTWjMKYqZWVZZGzxYjXA` | `EnL9ImCGlqD2UjRHTDKgJA` |
| H034 | `qMXousWjIHczNUwqWDGsXg` | `p_IMOM1UFqh5QXs5OwTGjA` |
| H035 | `JSKYLSrCcNBvfdHXrPNOWw` | `CVYzp_ezIH3cfjbvrUZkVA` |
| H036 | `zvwXWNSafFwBskEQVfnfaw` | `w0b1IaX3xyVNcqTOKX0N3w` |
| H037 | `DELkFWgEyhoqyuyrbnQuEA` | `-c7dxKhNM0Np-FoUMgAhWQ` |
| H038 | `GybPgWucvmsPHNwjNAyOiw` | `UfHX-CoycmbuMtlTbPr4xw` |
| H039 | `fCGVSSzsRHDgDLvPXbYkDw` | `tPTfZASzZWzgkfEzgg98pQ` |
| H040 | `MMbQqbhcKfHVHWhnsjIqnA` | `3wypnD4_7fNyb2hx0uZrsA` |
| H041 | `oqpwipJxpRbKzypGkStjjw` | `WhO8zfE0EIObMZjb9IDpgw` |
| H042 | `TMRENIJdzgBtLiMyuxUkNg` | `4qYCpBO5SvVoJIIOr_Lm8w` |
| H043 | `zOSyhzfDZMJDhZPsOvFwRg` | `_qpB2Lti6atyiVezzxe9aw` |
| H044 | `FCEBEWzmelSFTOlqcZsbdQ` | `INIqTMQI99KqTKPt_2HhQg` |
| H045 | `eOlNZpGQfmCdpSFWXGkzFQ` | `27vdKpbyxsH2-20CV8VsJQ` |
| G001 | `gbDG1lm8HjEGXu4-MlZbNw` | `8mCnpAfGKZoqiY8HhoHAYg` |
| G002 | `w2DVk4jcGz-x9l4vr9ef0w` | `-bKjXtzMWHXA0lNohkhEgA` |
| G003 | `9LZs2YPANzPqsiK8a1zi8w` | `e5rHr0sC1IzhOFQGfvSfbA` |
| G004 | `SwTAhkjP5mmmPRA3-NEGFw` | `M_wQVAmlxwgStcksztr5ww` |
| G005 | `8CJgpv1_aeqNfAyMayRngw` | `DTpuI2hpXc9j5krE3p0NNw` |
| G006 | `ZRTd6g8X1GuwZYIssvaftQ` | `mziilPHPQEPcQXa7eLSy3A` |
| G007 | `7RsBVaKEKEJ9yGShMnGUcw` | `QQ88rQjUEeS43ZgNT_gFHw` |
| G008 | `yxfYCd_CnLb3DqJA-e8onQ` | `zUqnvjTVGzzI6WTMscqhcw` |
| G009 | `K4C5B-KmQtxKYMHJWoojsg` | `NOC28oPpS8wppasaeZfHbg` |
| G010 | `XeJ8bRbfaKC8rhCozytAPg` | `i2dh1VP-Cg3D71Ne6N9_4Q` |
| G011 | `OjG9sho218JbCy26LltQcg` | `v_T9ch7ZvWdwrbgWrxjPew` |
| G012 | `kNKTOTbr_Ysbv-ih-MchPA` | `7d-XQF5kc0FFbnC0cltNOQ` |
| G013 | `dSzt0nGtqMDJ_QSol2bOEA` | `1I_HHjCAyPp-iMozRYxAVA` |
| G014 | `_zpUUDOvqupXlsDfZ7_4FA` | `YPrGR68D964feANE3it1BA` |
| G015 | `Yx81KMlW6ejIwQ7m-eWcGw` | `uuGEepbbK2acnOT8dFlS9Q` |
| G016 | `lJCb6H0BLqqHMQNBLyfBkg` | `_z1BxdqW-uqvnGfgH93A6g` |
| G017 | `-WP52vRG2DiTTT3dNglMIA` | `DwQOF2lS5V6DzElp4VxM2Q` |
| G018 | `ehokK-8huKgxY9WWaEzkMw` | `oL_Rc4GQ5vd_mD5hEf4hlg` |
| G019 | `IZeu7pZPRCOS5UD0VqSPeA` | `DiJGPsfYsTuxz_dyB2wK3Q` |
| G020 | `wix9pYrW5_Qi0L_6aFaipw` | `JXbJ55ytkO3XRNQ6YnGO_Q` |
| G021 | `Occ6c3v-vUmi5wCbI3MsvQ` | `mIlHBD7HyfjfDsi1yU1JAw` |
| G022 | `ppQX_q9nbTbb5a1ngxsQ5w` | `Y0qLsTZlALXBBYgxu3yPXQ` |
| G023 | `l6XS_BPMNjn2T8rr3OHiJg` | `N7MBCmZR6Ws9uvyJ87kzHA` |
| G024 | `pCQN0zVDkEbtHr0az9JCag` | `u6Jexq-kHgmGCSe1vcoA-Q` |
| G025 | `Ml2u0EVik_2wW9EZMLgnNQ` | `apMZp13LjXkdpRnNrqHhdw` |
| G026 | `BzN3b2yAY6bK-2gTRScT0Q` | `26-uMZL35dc0Zp6GbsWL4g` |
| G027 | `HIaQG_xzjruJ9VMNaGFsTA` | `ON-9qlC5suaeDorMeA_HAA` |
| G028 | `GrWr9SzeA3rAcd56oqVOEw` | `gIuLtOx3-bZi7_8Hn1ni4w` |
| G029 | `EdkglTTa3Oa_9JwCeEbKAg` | `ei7Ort8qTYsmosqip3x71Q` |
| G030 | `mzj8HNYnL8-XRbwtJmVsjA` | `7hE9Jom7m0TRofSoCCspWQ` |
| G031 | `7JfMIAyoM4a9WlDGxjlz8g` | `iqGJNCl627tKYq9fgDb6eQ` |
| G032 | `NGprx1mMNo9konne_toviA` | `Ph6eLLTgNvoPsXnTmMkW0Q` |
| G033 | `81L7_-JcF8dr_Yw92EYfCw` | `tVaOFLITTfCgEG2chZ0XPw` |
| G034 | `i06uOcxY4P31bzilTcmuqQ` | `eQn0qv04oQGPzSD-l6lbfg` |
| G035 | `J3A0UO7zbiBNFZD9BQqX_Q` | `qUq_t79-LPtXDBWlSzdaAA` |
| G036 | `6QRKwbfDhL9JM13UKl6a3g` | `ZIInQCEsCYvp5eK7QUUCSg` |
| G037 | `m794wNj0pxjEwAB6J_5RJg` | `8BJpLQ7YhBWoBKcFePylAw` |
| G038 | `hpJ6OSUZw46H6UiV-mc1LQ` | `4S8-AM_eJOXfHlarPtRESA` |
| G039 | `ntbzrfJDnVuP4ljm--boaA` | `5T870o5RypUHy2UVtmNfbA` |
| G040 | `1sQWf7DXDYxo_4IZoHS0OQ` | `IYeqQUJah5EzBBLKaB0HnQ` |
| G041 | `rEg2iMNsQB1lqRPjMm2UzQ` | `VAVH-jD3ImtuFLDvBbfDMA` |
| G042 | `mfx45-ER-xjyt16KL1y-4A` | `0eC-dguKrqMwIPLUHRg89w` |
| G043 | `TUnLE3G3dj3fgOfFnYmeiw` | `ZJw0HnUM36SugrI1uCUQLQ` |
| G044 | `E_ykHvuoh6oWCNauVXQcxw` | `WAitlcCnzWaBvMCzMYO7qw` |
| G045 | `g0MEtmNOlgVAFFriF8Ssqw` | `N_QCFVJO0Sw940BXmb3nFw` |
| G046 | `cPkib_oeYhxSRA2hBbYISQ` | `NPUGiYN5_-yCWPU5WqaQIA` |
| G047 | `_d8K0NM7strDcOKj_433UA` | `jyeqbmpOwByOSL8n0ocmjA` |
| G048 | `I7_JSoN4zDQicyXiHEjbEQ` | `fs0emm8L28vl6PUwNL0mgw` |
| G049 | `YaPHA9emJLgpXMEkebkFnw` | `DURDo6qethF9mMXaEb5jeA` |
| G050 | `uCqna2OESbIU8VeH6GYBgw` | `mpOHne-AAY0Vj_A0kg0PHQ` |
| G051 | `7HImckrUQ0L51EsY6Gvweg` | `6vW5tvaBvcDl8fJOFJc8oQ` |
| G052 | `cu96PR67Z3CbhpQVytM2IQ` | `3hkCnj6Qskm0ikbDm5llqQ` |
| G053 | `6MXrbPft5xRNaa2Jc19Xfw` | `C-1UeEKRNCMCYCqWkT-ATQ` |
| G054 | `XTO1NpcddLFuP-feM793wg` | `Cvyo0wm4gJtqRAvB0x791A` |
| G055 | `_AorRuzzpuBPhOQo0KVLcA` | `r4gmDtyFok_FIXuDQeWJXQ` |
| G056 | `A1_rzU-ga-0Sy0Cyu-A5WA` | `rYwUlJfJnnoU3k8NPAYAWQ` |
| G057 | `TLOLE890KtxgN_onebz3zA` | `vNhq0isa0FQMiTnRbAWG1w` |
| G058 | `OrQk3QuSHwk3XyomvMLZsQ` | `orJ1DY7IPsmLD5sRV0gVNQ` |
| G059 | `_M2Kr2zO8RP5N8SlX3HU9Q` | `T6_iZR_ogEwUbrEcJbcJtw` |
| G060 | `rj4dCltUMC3fqsbR4rABjw` | `QJ3EBchzmts4zdYhV_yn6g` |
| G061 | `q0-uBNQZzsI_pSw2xN0R3g` | `Vi03E5ecvqtR9o4WtGZh5Q` |
| G062 | `pU-tEQQZTxTM-NEHhKuLdg` | `gCV0oFJA88Y0Vb50rdicFA` |
| G063 | `aSSuRwXNMfkxJeNhaU9y4Q` | `zH-Wi2Nz2Sr7RAEvyhOpHg` |
| G064 | `jhn5QO90EUc4SHnjWBT__w` | `N3TK3KDOYIUq8J5vSDxOGw` |
| G065 | `IJsei1q6wyN-kOXZ6vKang` | `V2SPgPyaNagDC9mBdUIA6w` |
| G066 | `YCb3Vu3kQu7Xm_mGg8neAg` | `n9RGE9WWVMTfwH1ZOwmcNg` |
| G067 | `HQZP2kAx-4_ewQ3eEg1bFw` | `YW0caUWL8vhuQe-ONXvVGQ` |
| G068 | `zEUF7L1zroRaUqxV8PZKLg` | `BQET3jbSortqrK-VgIx5pA` |
| G069 | `LSxJzYAAPzfmFuKxtNfkuA` | `qyFup1cCuBj-0TBHBBHtVw` |
| G070 | `Dd9LxZafroY-Oe-HPuuY4w` | `Lzuqvh6eif1O-C4cO6eJUA` |
| G071 | `Ov4g04xAyLEDw4s9GRgnJA` | `8zusEF0HmVfXQRrodQOmHg` |
| G072 | `QBcZYyM39cCMLodVsDt2Zg` | `_lMnZjgpSh6FWtSoXNP3Fg` |
| G073 | `a2sNzfp6wvkaz7ixZaJEMA` | `mZnABP-qCanEoIJrQaMZpw` |
| G074 | `cMsj5OTSIc6rKt0W8IyCoA` | `qLyb-8rLE_cuQOCJ2Qn2Pw` |
| G075 | `ILeS1Z1MQ7MXGwr9Jv1vGQ` | `xVdCjbXeJIFATswmnQ4HIA` |
| G076 | `qeUXKqLkHT9pLcu8ZdDGiA` | `Z32kVjW4qMB3LyT9RzxEnA` |
| G077 | `AhssoP4go4-qE5iBnkd0Nw` | `ck_IUDUyqFZmFV8Q9VvOrQ` |
| G078 | `tdtvYC-bVsOkXyQJY5VqHQ` | `lxcthwou0iLtY5L3-MTtyg` |
| G079 | `gVlKS64PUlB6pUdj_Hm3NQ` | `Fxx3uuA3mLz2KlhF9_Otlg` |
| G080 | `1AA6WxiHabCmzSgilIJqLg` | `q0VR-epvuyV-H1epNLuagA` |
| G081 | `6QvHdo7ol5NjV8MnKuhxCw` | `duNuBcKgyS3knoArfWN91Q` |
| G082 | `X3BSanpYDQX9PzaDq3SQQA` | `c_Zat1_uTdG98bxgKQQ_dw` |
| G083 | `Ev0bFKQjCXrwCXe7NjT28Q` | `Dcn4XFp38Fxm2BWUkoHB7w` |
| G084 | `miWqBueu16fdpTN2Gew3qQ` | `t33agNIWEO_31x9u3sh3lQ` |
| G085 | `BYyXgxlYdTpNXKP8S2lYlw` | `C0YviDN0thRFkStI1zNAyA` |
| G086 | `ngyP7P-7xY3EMrihtBe0dw` | `DA_UbyMOn445661PJw0u2Q` |
| G087 | `CNQD1bjST_4qHxJdZU-lIQ` | `kyiH_rGRzvTkFo_CCeynQg` |
| G088 | `A44gHDSR44cVklpPKBD5_A` | `jfi8GtOi4UdislUUPNeddg` |
| G089 | `sxQaJFjKBKvqvsauLxpJzw` | `IZyo5E8BL0JrUwb78Vy9tg` |
| G090 | `5wfjIGd_33TizqWb6Megtg` | `OTaGXxAl_x4vSa5Z9nARyg` |
| G091 | `V8CFBLqROD5a-FsqYRzxUg` | `9fae6Aln29AReufIYSIQRw` |
| G092 | `SXdTclYe0i6KjH7aGTsFWg` | `PK6Q2l1r17vZHhdBPu4p-Q` |
| G093 | `ZNRqLwAByfVlrOMCBgLmdA` | `Dg--QIY6cgrrPNQSzYP5ZA` |
| G094 | `CQPy6T3x7rsgvdgoX2Ybwg` | `PDbI6iaGUEVjagsZ2TkjXg` |
| G095 | `I2NynfO_lsXwSCM379dKcg` | `bwtstzxXRwTH4WHQsGmvrQ` |
| G096 | `-SkkQahhwMD_amc2sFbE1w` | `qZuNCWQpoCM_aRbtr7UmkQ` |
| G097 | `0p_ufwx0YRIi8w5iYCqczw` | `Y7PDKmQBrRDnoW66s_QYoA` |
| G098 | `usDyiPhJ8a2puxd_L4EK6A` | `jLgHOPXTRJyiyHah7pSYGw` |
| G099 | `s0u3Y2qg6Nkmia5Yr4ATgw` | `C8KMSLUFDP7kCkyF0oOZTg` |
| G100 | `UU-x4isgywOHmaNcTnnN9g` | `1SqIEAsZPSBpeQjGRBAtzg` |

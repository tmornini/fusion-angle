# Work-Order Events Follow-Ups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this plan's worktree (AGENTS.md
> § Worktrees, with `membership-and-versions` in place of
> `master`): `.worktrees/work-order-events-follow-ups`,
> branch `work-order-events-follow-ups`, cut from
> `membership-and-versions` at `5e507612` and carrying
> this plan. Do not create another worktree. Do not land.
> Do not rebase. Do not merge, force-push, or delete a
> branch. The branch joins `membership-and-versions` by
> `git -C .worktrees/membership-and-versions merge
> --ff-only work-order-events-follow-ups`, on the owner's
> word, and not before (Task 35). `master` stays where it
> is; nothing here moves it. One worker. Every subagent
> shares this one worktree, so dispatch serially in the
> order below.

> **For the dispatching orchestrator (AGENTS.md
> § Subagents):** every subagent prompt MUST begin with
> the literal phrase `Go to Medium Church!`, then push
> down: the 78-char lint on code and scripts (not `.md`,
> though this repo wraps `.md` at 78 too), 4-space indent,
> spell `organization` (never `org` as an identifier),
> present-tense-imperative ~50-char commit subjects with
> the trailers below, Author stays Tom Mornini (do not
> pass `--author`), the commandments and abominations
> each task names (its **Doctrine** line), and the
> codebase patterns: RequestContext first, SafeHtml from
> presenters, snake_case storage / camelCase domain,
> HTTP-verb naming (`getNoun`/`putNoun`/`deleteNoun`/
> `postNounOperation`), validators at the gate, no
> untyped `any`. **coder** implements every task.
> **planner** reviews each task (spec compliance, then
> code quality) before the next starts. Pass no model
> override and no `isolation`. Subagents never run
> `./deploy`, `./bin/measure`, or `./test browser`;
> Chrome is the operator's. Master owns 8080. One concern
> per commit. A fix of the unpushed tip may
> `git commit --amend` only while that commit is still
> the tip and still one concern. Never amend any other
> commit.

**Goal:** Close the nine follow-ups of the final review
of the work-order events work — wrong docs, retired-code
leftovers, naming, two type gaps, and three latent
behaviors — as thirty-five tiny commits, each green,
before `membership-and-versions` lands.

**Origin:** a read-only walkthrough of the review's
follow-ups, one decision each, with the owner (2026-10-05).
Every claim below was verified against `5e507612`. Line
numbers drift as commits land: re-find each by symbol
before editing, and report any claim that no longer holds
instead of forcing the edit.

## Global Constraints

- **Gates.** `./test validate` before every commit.
  Under the Claude Code sandbox, `export
  DENO_DIR="$TMPDIR/deno-dir"` first. `./test validate
  browser` once, at Task 35. A markdown-only commit still
  runs `./test validate`.
- **Commit.** One concern per commit. Subject: one line,
  about 50 characters, present-tense imperative, no body.
  Trailers, verbatim, after one blank line:

  ```
  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Qs2M5CqYLmFP9crbWhEfjx
  ```

- **Never move or rename and change content in one
  commit.** Every rename task below is rename-only.
- **A red test first, inside the commit.** A behavior task
  writes its failing pin, sees it red, makes it green,
  and commits both once. No commit lands red.
- **Pins never weaken.** A test edit here either keeps
  its assertion's strength (a rename, an example swap)
  or strengthens it (Task 29), or deletes a pin whose
  every assertion survives elsewhere (Task 17).
- **A browser observation changes product only through a
  red test** (AGENTS.md § Gates). Tasks 24, 25, 27, 32
  each carry their own.
- **No wire change.** Nothing here alters a response
  byte. `./test schema` and `./test api-docs` stay green
  untouched.

## Decisions (the owner's rulings)

| # | Ruling | Tasks |
|---|---|---|
| 1 | Split the two uses of `at`: display never sorts; flow-stats takes `completed` from the chain-last node and sorts a COPY by `at` for sojourn durations only. One skew pin each. | 24-26 |
| 2 | An unplaced head renders a visibly degraded inbox row instead of blanking the inbox. Server guard stays. `TODO.md` names the skipped check; gate validation is its own later spec. | 32-33 |
| 3 | Correct the docs to say foreign id 404 / foreign path 403. No product change. | 1-3 |
| 4 | `TransitionFieldValueEntity` becomes a union; a clear renders as "cleared". | 27-29 |
| 5 | Un-export four over-exported symbols. | 8-10 |
| 6 | Delete one dead function, one orphan comment; fix or reword six comments; collapse one header. | 11-16, 34 |
| 7 | Delete one duplicate pin. | 17 |
| 8 | Six wording nits. | 4-7 |
| 9 | Renames a, c; derive b; readonly d; extract e as `isClaimedAndUnlapsed` / `isClaimUnlapsedAt`. | 18-23, 30-31 |

## Order and dependencies

Risk-ascending. Same-file collisions fix the order inside
a phase: `presenters/workbox-detail.ts` (1 before 4),
`client/work-orders-queries.ts` (5, then 4, then 9e),
`tests/adapters-work-orders.test.ts` (9a, then 9e),
`TODO.md` (1, then 2).

| Phase | Tasks | Kind |
|---|---|---|
| A | 1-7 | docs and comment text |
| B | 8-17 | un-exports, deletions, comment fixes |
| C | 18-21 (with 20b) | rename-only |
| D | 22-23 | type-only |
| E | 24-33 | behavior, each with a pin |
| F | 34 | header collapse |
| G | 35 | gate and handoff |

## Open Questions for the reviewer

These are the plan's own doubts. Resolve each in review
or leave it flagged; none blocks the other tasks.

- **O-1. The degraded row's link.** Task 32 renders an
  unplaced head in the inbox, but its card links to the
  detail page, whose presenter throws on the same head
  (`presenters/workbox-detail.ts`, "invariant violated:
  the head names unknown node"). The owner ruled on the
  inbox only. Either the row stays unlinked, or the
  detail page degrades too (a second, unscoped change).
  Task 32 defaults to an unlinked row.
- **O-2. Is the write authorizer inert?** All six
  patterns in `WRITE_AUTHORIZERS` are organization-nested
  and probe the caller's own collection, so by reading,
  `assertWritableInOrganization` cannot throw for any of
  them. Task 1 verifies this first. If true, the docs say
  so, and a later spec decides whether to delete it.
- **O-3. Which order is `pathNodeIds`?** Task 24 keeps
  `pathNodeIds` in chain order (a path taken is the
  chain). Its consumers were not read. Task 24 step 1
  reads them first.
- **O-4. Which inbox tab holds an unplaced row?** Task
  32 shows it in Active only; it is never Complete
  because completion is unknowable.
- **O-5. Size.** Thirty-five commits before landing is a
  long wait. The owner chose it; a split at the end of
  Phase C (tasks 1-21: no behavior) is a safe seam.
- **O-6. `validateWorkOrderEntity` is test-only.** Task
  20 renames it. Deleting it, with its six tests, is
  not planned.

---

## Phase A — docs and comment text

### Task 1 — State what foreign ids and paths answer

**Files:** `AGENTS.md` (`### Write authorizer 403s before
genesis`), `ARCHITECTURE.md` (`## Tenancy`, the
`writeAuthorizerFor` paragraph), `API.md` (step 6 of the
dispatch list). Read, and fix only if they repeat the
claim: `API.md` step 8 ("403 for a foreign owner, 404
otherwise"), `TEST-PLAN.md` near the isolation case that
says "nested foreign GET 403s".

**Doctrine:** V Clarity (say what is true); II Security
(RFC 9110 §15.5.4 hides existence).

- [ ] **Step 1: Verify.** In `api/derive-states.ts` read
  `ownerProbeCollection` and `resolveGlobalOwner`; in
  `api/write-authorizer.ts` read `WRITE_AUTHORIZERS`.
  Confirm: every registered pattern is organization-
  nested, the probe path is the bound organization's, so
  the owner is `null` or the bound organization.
  `tests/api-write-authorizer.test.ts` (foreign-id PUT
  geneses, 201) and `tests/api-foreign-op-403.test.ts`
  (foreign op is 404) pin the results. Run
  `deno test --frozen --no-check
  tests/api-write-authorizer.test.ts
  tests/api-foreign-op-403.test.ts`. Record in the commit
  report whether O-2 holds.
- [ ] **Step 2: Rewrite the `AGENTS.md` section.** Rename
  the heading and body to this, wrapped at 78:

  ```
  ### Foreign ids 404; foreign paths 403

  The same id at two organizations is two documents.
  Under the caller's own path another organization's
  document does not exist: a foreign-id PUT is the
  caller's own genesis (201), and a foreign-id DELETE,
  claim, release, bind, or transition is 404 (RFC 9110
  §15.5.4 lets a server hide existence, so no
  cross-tenant oracle). A foreign PATH is 403 at the
  organization fence in `api/api.ts`. The organization
  document is the one disclosure: a GET on a real
  organization the caller is no member of is 403, an
  absent one 404. See `api/write-authorizer.ts`.
  ```

  If O-2 holds, add one sentence: `writeAuthorizerFor`
  probes only the caller's own collection, so the fence,
  not the authorizer, is the gate.
- [ ] **Step 3: Mirror it** in `ARCHITECTURE.md` (the
  paragraph at `writeAuthorizerFor` ... "Read isolation:
  foreign 403, absent 404") and `API.md` step 6 ("foreign
  403 before pair crypto"). Same facts, their voice.
- [ ] **Step 4: Grep** `git grep -n "Write authorizer 403s"`
  and fix any link to the old heading.
- [ ] **Step 5:** `./test validate`; commit.

**Commit:** `State what foreign ids and paths answer`

### Task 2 — Correct the write-authorizer header comment

**Files:** `api/write-authorizer.ts` (lines 8-13 at the
tip: "this document has a live PUT the caller may not have
→ ForeignOrganizationError (HTTP 403)"). Also the same
claim in the `api/api.ts` comment above
`writeAuthorizerFor` ("foreign → ForeignOrganizationError
(HTTP 403)").

**Doctrine:** the Office of Commentary (a comment says
why, and what is true).

- [ ] Rewrite both comments to the Task 1 facts: owner-
  null genesis proceeds; an owner other than the bound
  organization is the only 403, and it can arise only if
  a probe sees another organization's pair.
- [ ] `./test validate`; commit.

**Commit:** `Correct the write authorizer's comments`

### Task 3 — Rename a stale test title

**Files:** `tests/api-write-authorizer.test.ts` (the test
titled `foreign-id DELETE nested record-types is 204`;
its body asserts 404).

**Doctrine:** III Uniformity. Rename-only.

- [ ] Change `is 204` to `is 404` in the title. Touch
  nothing else.
- [ ] `./test validate`; commit.

**Commit:** `Title the foreign DELETE pin by its 404`

### Task 4 — Fix the spec's status rows

**Files:** `docs/superpowers/specs/2026-10-04-work-order-
events-design.md`, the status table (lines 431, 434, 435
at the tip).

**Doctrine:** V Clarity; the table must agree with the
spec's own prose (lines 266-272) and the gate
(`api/api.ts`, `preconditionRefusal`).

- [ ] **404 row:** `a claim, bind, or transition on one
  never created` becomes `a claim, release (DELETE
  …/claim), bind, or transition on one never created`.
- [ ] **428 row:** `a PUT, claim, bind, or transition with
  no precondition` becomes `a PUT, claim, release, bind,
  or transition with no precondition`. Confirm release
  is `in-order` (`api/routes.ts`, the `…/claim` pattern)
  and that `api/api.ts` answers an in-order route with no
  header 428. If no test pins an unconditional release,
  say so in the report.
- [ ] **412 row:** `If-None-Match: *` on a work order that
  exists becomes `If-None-Match: *` on a work-order
  document PUT whose work order exists; on the in-order
  routes (claim, release, bind, transition) it is 400.
- [ ] `./test validate`; commit.

**Commit:** `Fix the spec's 404, 412, and 428 rows`

### Task 5 — Cite RFC 6585 for 428

**Files:** `AGENTS.md` (§ Follow the RFCs; the clause
"a PUT with neither precondition answers 428").

- [ ] Add `(RFC 6585 §3)` after "428". `API.md` already
  cites it.
- [ ] `./test validate`; commit.

**Commit:** `Cite RFC 6585 for the 428 clause`

### Task 6 — Rewrap one ARCHITECTURE line

**Files:** `ARCHITECTURE.md` line 373 (84 characters).

- [ ] Measure with characters, not bytes (`awk length`
  counts bytes and flags lines that are fine). Rewrap
  that paragraph's lines to 78. Touch nothing else.
  `TODO.md:481` is 65 characters: leave it.
- [ ] `./test validate`; commit.

**Commit:** `Rewrap an over-long ARCHITECTURE line`

### Task 7 — Fix WB19b's status

**Files:** `TEST-PLAN.md`, case WB19b (about lines 4566-
4596): "a Save with the held etag is 201" and the pin title
"held If-Match PATCH is 201".

- [ ] Both become 200. The pin is
  `tests/api-work-order-transition-instance.test.ts`,
  titled `… held If-Match PATCH is 200`, asserting 200.
  A PATCH of an existing instance updates; only the
  create is 201.
- [ ] `./test validate`; commit.

**Commit:** `Correct WB19b's held-etag PATCH to 200`

---

## Phase B — un-exports, deletions, comment fixes

### Task 8 — Un-export a join-document op

**Files:** `api/routes.ts` (`postFlowWorkOrderDocumentOp`).

**Doctrine:** VIII Simplicity; the Sin of Coupling (the
import surface shrinks to what is used).

- [ ] Confirm `git grep -nw postFlowWorkOrderDocumentOp
  -- . ':!docs'` shows only the definition, its use in the
  `flows/:id/work-orders/:woid` route, comments, and
  `TODO.md`. Drop `export`. The function stays: it is a
  live route handler.
- [ ] `./test validate`; commit.

**Commit:** `Unexport the flow work-order document op`

### Task 9 — Un-export two seed bodies

**Files:** `api/mock-data/seed-message-pairs.ts`
(`workOrderDocumentSeedBody`, `flowWorkOrderJoinSeedBody`).

- [ ] Same check; both are used only by
  `workOrderCreateSeedBody` in the same file. Drop
  `export` from both.
- [ ] `./test validate`; commit.

**Commit:** `Unexport the seed body builders`

### Task 10 — Un-export the flow-graph wrapper

**Files:** `client/work-orders-queries.ts`
(`validateWorkOrderFlowGraph`).

- [ ] Same check; its only caller is `toWorkOrder`. Drop
  `export`. Keep the wrapper (it names the label).
- [ ] `./test validate`; commit.

**Commit:** `Unexport the work-order flow graph check`

### Task 11 — Delete the dead collection get handler

**Files:** `api/document-family.ts`
(`documentCollectionGetHandler` and the comment above it,
lines 412-446 at the tip). Comments naming it in
`api/routes.ts` (lines 420, 554).

**Doctrine:** VIII Simplicity; XII Performance ("no code
is faster than no code"); the Office of Commentary.

- [ ] Confirm zero callers: `git grep -nw
  documentCollectionGetHandler -- api tests`. The last
  callers left in `9e9c3a82`. Delete the function and its
  comment. Reword or delete the two `routes.ts` comments
  that name it so none points at a missing function.
  Remove any import that becomes unused.
- [ ] `./test validate`; commit.

**Commit:** `Delete the unused collection get handler`

### Task 12 — Delete an orphan comment

**Files:** `api/routes.ts` (the comment "GET is FLIPPED
(Task 8): derived via documentCollectionGetHandler …"
above the `organizations/:id/invitations/` route).

- [ ] The memberships routes were retired in `8f23fb31`.
  Delete the comment; keep the "Invitation send nest"
  comment under it.
- [ ] `./test validate`; commit.

**Commit:** `Delete the comment on a retired GET`

### Task 13 — Fix a stale path in a comment

**Files:** `api/mock-data/seed-kit.ts` line 22
(`web-app/app/adapters/flow-stats.ts`).

- [ ] The file is `web-app/app/flow-stats.ts`; `adapters/`
  holds no such file. Fix the path.
- [ ] `./test validate`; commit.

**Commit:** `Point the seed clock comment at flow-stats`

### Task 14 — Reword the ordering comment

**Files:** `client/work-orders-mutations.ts` (the comment
at about 334-338: "transitionAt < release.at must hold
in the at-ordered ledger (latest at = current state)").

**Doctrine:** IV Logic (the claim must be true).

- [ ] The ledger is chain-ordered (spec Decision 8). Say
  the route emits the transition event before the release
  event, so the release's `at` follows the transition's
  `at` along the chain, and that both mints stay
  await-free before the POST. Drop "latest at = current
  state".
- [ ] `./test validate`; commit.

**Commit:** `Reword the transition mint-order comment`

### Task 15 — Fix the matchRoute attribution

**Files:** `api/routes.ts` (about 4047-4049) and
`api/api.ts` (about 1205-1208).

- [ ] `matchRoute` returns a match or `null`. The 404
  comes from the caller on `null`; the 405 from the
  handler-absent check. Keep the true half ("the table
  offers POST so the generator advertises the verb") and
  re-attribute or drop the status clause in both places.
- [ ] `./test validate`; commit.

**Commit:** `Attribute the 404 and 405 to their sources`

### Task 16 — Swap a retired example path

**Files:** `tests/measure-profile-core.test.ts` (about
45-47: `work-orders/${id}/history` →
`work-orders/:id/history`).

- [ ] `/history` is a retired route (the versions route
  replaced it). Read `canonicalizeResource`
  (`web-app/app/measure-profile-core.ts`); if it is
  generic over id-shaped segments, swap both strings to
  `/versions`. The assertion keeps its kind. If it
  special-cases a segment, stop and report.
- [ ] `./test validate`; commit.

**Commit:** `Canonicalize a live work-order path in a pin`

### Task 17 — Delete a duplicate pin

**Files:** `tests/drift-phase15-cores-parity.test.ts`:
delete `work-order versions events: own field_values,
foreign owner probe 404, absent 404` (about 1375-1445)
and the then-unused `GHOST_P15_VIS` (line 79).

**Doctrine:** the Sin of Test Weakening: allowed only
because every assertion survives.

- [ ] Re-confirm the survivors: `work-order versions GET:
  200/404 two-way …` in the same file asserts the same
  three legs (own `field_values` ids, foreign 404 with
  `Not found: work_orders/<id>`, absent 404);
  `tests/api-organization-isolation.test.ts` pins the own
  and foreign legs on `versions/` too. If a deleted
  assertion has no survivor, stop and report.
- [ ] `./test validate`; commit.

**Commit:** `Delete a duplicate versions 404 pin`

---

## Phase C — rename-only

### Task 18 — Name the released seed

**Files:** `tests/adapters-work-orders.test.ts`
(`seedBareWorkOrder`: definition and two call sites).

- [ ] Rename to `seedReleasedWorkOrder` (it seeds with
  `claim: 'released'`, like its sibling `seedRelease`).
  Rename only.
- [ ] `./test validate`; commit.

**Commit:** `Name the released work-order seed`

### Task 19 — Suffix the event validator

**Files:** `api/validators.ts` (`validateWorkOrderEvent`,
private, one caller).

- [ ] Rename to `validateWorkOrderEventEntity`, as every
  other validator names the entity it returns.
- [ ] `./test validate`; commit.

**Commit:** `Name the work-order event validator`

### Task 20 — Name the fields validator

**Files:** `api/validators.ts`
(`validateWorkOrderEntity`), `tests/validators.test.ts`
(its references, about six tests), the comment at
`validators.ts` near `validateWorkOrderDocumentBody`.

- [ ] Rename to `validateWorkOrderFieldsEntity`: it
  validates the fields body (the trio plus
  `organization_id`) and returns
  `Omit<WorkOrderFieldsEntity, 'id'>`, not a
  `WorkOrderEntity`. Update the references and the
  comment that names it. Rename only; leave the stale
  sentence near `validators.ts:3594` for Task 20b.
- [ ] `./test validate`; commit.

**Commit:** `Name the work-order fields validator`

### Task 20b — Correct the stale re-validation comment

**Files:** `api/validators.ts` (the comment near the
create body: "the work_orders store stamps organization_id
… and re-validates through validateWorkOrderEntity AFTER
the stamp").

- [ ] No store re-validates through it; the function has
  no production caller. Reword to what is true, or delete
  the clause.
- [ ] `./test validate`; commit.

**Commit:** `Correct a stale validator comment`

### Task 21 — Name the unlapsed-at predicate

**Files:** `api/work-order-version.ts` (`isClaimLive`:
definition, two callers), `tests/work-order-version.test.ts`
(import and two calls), prose: `ARCHITECTURE.md` (about
line 384), `TODO.md` (about lines 1084 and 3291).

**Doctrine:** III Uniformity; "call a thing a thing".

- [ ] Rename `isClaimLive(claim, now)` to
  `isClaimUnlapsedAt(claim, now)`. It tests one fact:
  `now` precedes `expires_at`. Presence on the head is
  the caller's. Rename only; update the three prose
  mentions in the same commit.
- [ ] `./test validate`; commit.

**Commit:** `Name the claim-unlapsed-at predicate`

---

## Phase D — type-only

### Task 22 — Derive the work-order fields

**Files:** `api/work-order-version.ts` (`WorkOrderFields`).

- [ ] Replace the literal trio with
  `Readonly<Omit<WorkOrderFieldsEntity, 'id' |
  'organization_id'>>`, imported from `shared/types.ts`.
  One source of truth for the trio. `validators.ts`
  (`WorkOrderDocumentBody`) may use the alias in place of
  its own `Omit<…>`; do that only if it type-checks
  unchanged, else leave it.
- [ ] `deno check --frozen api client shared server tests
  web-app`; `./test validate`; commit.

**Commit:** `Derive WorkOrderFields from its entity`

### Task 23 — Make the events array readonly

**Files:** `shared/types.ts` (`WorkOrderEntity.events`).

- [ ] `events: WorkOrderEventEntity[]` becomes
  `readonly events: readonly WorkOrderEventEntity[]`,
  matching `WorkOrderVersion` and the all-readonly event.
  A grep found no mutation of it; the compiler is the
  proof. If `deno check` reports a write, stop and report
  it: that is a finding, not an edit to force through.
- [ ] `./test validate`; commit.

**Commit:** `Make a work order's events readonly`

---

## Phase E — behavior, each with a pin

### Task 24 — Complete a run by its chain-last node

**Files:** `web-app/app/flow-stats-aggregate.ts`
(`reconstructRuns`), `tests/flow-stats-aggregate.test.ts`.

**Doctrine:** IV Logic; VI Immutability (do not mutate
the input array).

- [ ] **Step 1: Read** every consumer of `pathNodeIds`
  and `completed` (`git grep -n "pathNodeIds\|\.completed"
  -- web-app tests`). Settle O-3: `pathNodeIds` stays in
  chain order unless a consumer needs `at` order, then
  report.
- [ ] **Step 2: Red pin.** A work order whose chain is
  create, Review, Archive, with the Archive move carrying
  an `at` EARLIER than the Review move's. Assert
  `completed` is `true` (the head's `state` is Archive)
  and every sojourn has `exitMs >= enterMs`. Today the
  `at`-sorted last node is Review, so `completed` is
  `false`.
- [ ] **Step 3: Implement.** Iterate the transitions in
  the chain order they arrive in for `lastNode`,
  `pathNodeIds`, and the dropped-node pass. Sort a COPY
  by `at` (`toSorted`) only to compute `enterMs` /
  `exitMs`, so a skew never gives a negative duration.
  `completed` is the chain-last node's `isArchive`.
- [ ] **Step 4: Rewrite the covenant comment** (the
  "only while `at` order is chain order" block): a run is
  completed when the chain-last node is Archive, which is
  the head's `state`; `at` orders sojourn durations only,
  the browser mints `transitionAt`, and the server never
  compares it with the head.
- [ ] `./test validate`; commit.

**Commit:** `Complete a run by its chain-last node`

### Task 25 — Show history in chain order

**Files:** `web-app/app/presenters/workbox-detail.ts` (the
constructor's `sorted` copy and `buildHistory`'s
`sortedTransitions` parameter),
`tests/presenter-workbox-detail.test.ts`.

**Doctrine:** the display shows the ledger's order;
`web-app/workbox/detail.ts` already hands the events over
"in chain order (spec §4)", and
`client/work-orders-queries.ts` `projectTransitions`
promises it.

- [ ] **Red pin:** transitions in chain order whose second
  move carries an earlier `at` than the first. Assert the
  history entries come out in chain order.
- [ ] **Implement:** delete the `sort` by `at`; pass
  `transitions` straight to `buildHistory`; rename the
  parameter `sortedTransitions` to `transitions`.
- [ ] `./test validate`; commit.

**Commit:** `Show a work order's history in chain order`

### Task 26 — Retire the skew bullet

**Files:** `TODO.md` (the bullet "Chain order stops at
`projectTransitions`. The browser mints `transitionAt` …
Two downstream sorts still order by …", about line 3248).

- [ ] Tasks 24 and 25 resolved what it describes. Remove
  the bullet, or, if it also names an open item (the
  server never comparing `transitionAt` with the head),
  keep only that sentence with an oracle.
- [ ] `./test validate`; commit.

**Commit:** `Retire the downstream-sort skew bullet`

### Task 27 — Type a cleared field value as cleared

**Files:** `shared/types.ts`
(`TransitionFieldValueEntity`),
`client/work-orders-queries.ts`
(`fieldValuesByEventFromHistory`, `StateFieldValue`),
`web-app/app/presenters/workbox-detail.ts`
(`HistoryFieldValue`, `buildHistory`, and the view's
`#buildHistoryEntry`),
`tests/presenter-workbox-detail.test.ts`.

**Doctrine:** the Sin of Null / Default Values: a clear
is modeled as a clear, never `value: ''` or `undefined`
typed as `string`. Model absence at the call site.

One commit, because the type change and its consumers
must compile together.

- [ ] **Red pin first:** a history event with a cleared
  attribute renders the attribute name followed by the
  word `cleared`, not an empty span.
- [ ] **Type:**

  ```ts
  export type TransitionFieldValueEntity =
      | {
          id: Id;
          attribute_id: Id;
          value: string;
      }
      | {
          id: Id;
          attribute_id: Id;
          readonly cleared: true;
      };
  ```

  Keep the wire bytes: a set row carries `value`; a clear
  row carries `cleared: true` and no `value`.
- [ ] **Consumers:** `StateFieldValue` and
  `HistoryFieldValue` become the same shape of union;
  `fieldValuesByEventFromHistory` narrows with
  `'cleared' in fv`; the history render prints `cleared`
  for a clear and the value for a set (SafeHtml, no
  inline style, an existing class from DESIGN-SYSTEM.md).
- [ ] `./test validate`; commit.

**Commit:** `Type and show a cleared field value`

### Task 28 — Drop the two construction casts

**Files:** `api/routes.ts` (`deltaFieldValueEntities`,
`as TransitionFieldValueEntity`), `api/validators.ts`
(`validateTransitionFieldValueEntity`, the same cast).

- [ ] With the union in place the object literals
  type-check without `as`. Remove both casts.
- [ ] `./test validate`; commit.

**Commit:** `Drop the field value entity casts`

### Task 29 — Drop the unknown asserts

**Files:** `tests/api-work-order-history-shapes.test.ts`
(the two `assertEquals<unknown>` calls, about lines 320
and 401).

**Doctrine:** this strengthens the pins: the compiler now
checks the expected rows against the real type.

- [ ] Remove `<unknown>` from both. If a literal fails to
  type-check, the literal was wrong: fix the literal,
  never the type.
- [ ] `./test validate`; commit.

**Commit:** `Type-check the field value history pins`

### Task 30 — Name one claim predicate

**Files:** `client/work-orders-queries.ts` (next to
`WorkOrderClaim`), `web-app/app/workbox-inbox-rows.ts`
(about 32-34), `web-app/workbox/detail.ts` (about
390-391).

**Doctrine:** IX Generality: eight sites is a pattern,
and the better way must replace every site. "Call a thing
a thing."

- [ ] Add, with a one-line why-comment defining it (a
  claim is on the head and `expires_at` has not passed):

  ```ts
  export function isClaimedAndUnlapsed(
      claim: WorkOrderClaim,
  ): claim is Extract<
      WorkOrderClaim, { state: 'claimed' }
  > {
      return claim.state === 'claimed'
          && !isExpiresAtPassed(claim.expiresAt);
  }
  ```

  Export it from `client/index.ts` if that is how its
  neighbors reach the web app.
- [ ] Replace the two production sites. Behavior is
  unchanged; the existing tests are the proof.
- [ ] `./test validate`; commit.

**Commit:** `Name the claimed-and-unlapsed predicate`

### Task 31 — Convert the six test sites

**Files:** `tests/adapters-work-orders.test.ts` (six
`x.state === 'claimed' && !isExpiresAtPassed(x.expiresAt)`
expressions, about lines 638, 654, 1007, 1198, 1221,
1266).

- [ ] Replace each with `isClaimedAndUnlapsed(x)`. Keep
  every assertion's polarity and message. Drop an import
  only if it becomes unused.
- [ ] `./test validate`; commit.

**Commit:** `Use the claim predicate in the adapter tests`

### Task 32 — Render an unplaced head as a degraded row

**Files:** `web-app/app/presenters/workbox-inbox.ts`
(`InboxItem`, `buildInboxItems`, `#buildRow`),
`tests/workbox-inbox.test.ts`. Read DESIGN-SYSTEM.md for
the badge and token classes.

**Doctrine:** I Reliability; degrade visibly rather than
corrupt silently (We handle failure with grace); the Sin
of Null (a sum type, not a flag).

- [ ] **Red pin:** a head whose `state` names no node in
  its `flow_graph`, among healthy heads. Today
  `buildInboxItems` throws and the whole inbox blanks.
  Assert the healthy rows still render and the unplaced
  one appears as a row that says its state is unknown.
- [ ] **Model:** `InboxItem` becomes a union of a placed
  item (today's fields) and an unplaced one (`id`,
  `displayId`, `flowName`, `position`, `transitionerName`,
  `lastTransitionedAt`, `claimedByName`; no `stateName`,
  no `completed`, no `taskInstructions`). No sentinel
  string stands in for the missing node name.
- [ ] **Builder:** when the node is not found, emit the
  unplaced item instead of throwing. It belongs to the
  Active mode only (O-4).
- [ ] **Render:** an unplaced row shows a visible
  "State unknown" badge in an existing warning class,
  keeps the reorder grip the placed rows have, and is NOT
  a link to the detail page (O-1). SafeHtml; no inline
  styles.
- [ ] **Server guard stays:** do not touch
  `assertRequiredAttributesAtExit` in `api/routes.ts`.
- [ ] `./test validate`; commit.

**Commit:** `Render an unplaced head as a degraded row`

### Task 33 — Name the skipped check

**Files:** `TODO.md`.

- [ ] Add one bullet under the nearest gate/validation
  heading: the required-at-exit check
  (`assertRequiredAttributesAtExit`, `api/routes.ts`,
  `if (node === undefined) return;`) skips a head whose
  `state` names no node in its frozen `flow_graph`;
  create and transition never validate nodes against the
  graph; plan gate validation (nodes plus edge, real
  graphs in fixtures) as its own spec. Oracle: a
  transition or create naming a node absent from the
  graph is refused at the gate.
- [ ] `./test validate`; commit.

**Commit:** `Record the unvalidated node gate in TODO`

---

## Phase F — header collapse

### Task 34 — Collapse the seed-pairs header

**Files:** `api/mock-data/seed-message-pairs.ts`
(the leading comment, about lines 1-62).

**Doctrine:** the Office of Commentary: a comment says
why; history lives in git.

- [ ] Replace the phase and Task narrative with a short
  header that says only what is true now: pass 1 forms
  every op-invocation's pair before any transaction;
  pass 2 writes, passing each op its pre-formed pair;
  each body-builder is the one construction used for both
  forming the pair and performing the write, so a stored
  pair cannot drift from what was written. Delete the
  reference to `postWorkOrderDocumentOp`, which does not
  exist, and the "work-order deferral" narrative, which
  no longer holds (work orders seed through
  `workOrderCreateSeedBody` and transition bodies).
- [ ] This commit is comment text only; its diff must
  touch no code line. `./test validate`; commit.

**Commit:** `Collapse the seed pairs header comment`

---

## Phase G — gate and handoff

### Task 35 — Gate and report (no commit)

- [ ] `./test validate` green at the tip.
- [ ] `./test validate browser` green. This needs Chrome
  (`CHROME` or `CHROME_DEBUG_URL`); if the sandbox cannot
  reach it, stop and ask the owner to run
  `! ./test validate browser`.
- [ ] `git log --oneline 5e507612..HEAD`: confirm every
  commit is one line, about 50 characters, with both
  trailers, and none mixes a rename with content.
- [ ] Report: commit count, anything a task flagged
  instead of forcing (O-1 through O-6), and whether the
  authorizer is inert (O-2).
- [ ] Do NOT merge. Wait for the owner's word, then:
  `git -C .worktrees/membership-and-versions merge
  --ff-only work-order-events-follow-ups`, then
  `git worktree remove .worktrees/work-order-events-
  follow-ups && git branch -d work-order-events-
  follow-ups`. Never `-D`.

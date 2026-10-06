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
> --ff-only work-order-events-follow-ups` twice, each time
> on the owner's word and not before: after Phase D (Task
> 35a) and at the end (Task 35). `master` stays where it
> is; nothing here moves it. One worker. Every subagent
> shares this one worktree, so dispatch serially in the
> order below.

> **For the dispatching orchestrator (AGENTS.md
> § Subagents):** every subagent prompt MUST begin with
> the literal phrase `Go to Medium Church!` and tell the
> subagent to read the Medium scroll file in full first,
> then push down: the 78-char lint on code and scripts
> (not `.md`, though this repo wraps `.md` at 78 too),
> 4-space indent, no inline styles (CSS custom properties
> and classes per DESIGN-SYSTEM.md), spell `organization`
> (never `org` as an identifier), present-tense-imperative
> ~50-char commit subjects with the trailers below, Author
> stays Tom Mornini (do not pass `--author`), the
> commandments and abominations each task names (its
> **Doctrine** line, or its phase's default), and the
> codebase patterns: RequestContext as the first argument
> to client verbs; a client verb returns an `HttpMessage`,
> an array of them, or a value that keeps one (TODO.md's
> three-shapes aggregates excepted); a write from a held
> message takes the message it latches; SafeHtml from
> presenters; snake_case storage / camelCase domain;
> HTTP-verb naming (`getNoun`/`putNoun`/`deleteNoun`/
> `postNounOperation`); validators at the gate; no untyped
> `any`. **coder** implements every task.
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
leftovers, naming, two type gaps, three latent
behaviors, and two inert checks — as forty-four tiny
commits, each green, landing on `membership-and-versions`
in two batches (thirty-three, then eleven).

**Origin:** a read-only walkthrough of the review's
follow-ups, one decision each, with the owner (2026-10-05).
A read-only review of this plan corrected its claims
against `5e507612` and folded in the owner's rulings
(Tasks 11, 24, 32; O-2 through O-7; Tasks 21b and 21c;
the retired-instance read); a
step that cites a measurement took it on a scratch export
of `5e507612`. Line numbers drift as commits land:
re-find each by symbol before editing, and report any
claim that no longer holds instead of forcing the edit.

## Global Constraints

- **Gates.** `./test validate` before every commit.
  Under the Claude Code sandbox, `export
  DENO_DIR="$TMPDIR/deno-dir"` first. `./test validate
  browser` at each landing (Tasks 35a and 35). A
  markdown-only commit still runs `./test validate`.
- **Commit.** One concern per commit. Subject: one line,
  about 50 characters, present-tense imperative, no body.
  Trailers: the executing session's harness lines,
  verbatim, after one blank line (a `Co-Authored-By`
  naming the model that wrote the commit, and that
  session's `Claude-Session`). Never copy another
  session's lines (the owner's standing ruling).
- **Never move or rename and change content in one
  commit.** Every rename task below is rename-only (25a,
  21b, and 21c included).
- **A red test first, inside the commit.** A behavior task
  writes its failing pin, sees it red, makes it green,
  and commits both once. No commit lands red. Tasks 7a,
  7b, and 7c change no response: the foreign-id and
  retired-instance pins staying green are their proof.
  A new pin of existing behavior (Task 20) passes on
  arrival, so it proves it can fail against a scratch
  mutation first.
- **Pins never weaken.** A test edit here either keeps
  its assertion's strength (a rename, an example swap)
  or strengthens it (Tasks 27, 29), or deletes a pin
  whose every assertion survives elsewhere (Tasks 17,
  17b, 20c), or deletes a pin whose subject the same
  commit deletes (Task 7b: the authorizer map's shape).
- **A browser observation changes product only through a
  red test** (AGENTS.md § Gates). Tasks 24, 25b, 27, 32
  each carry their own.
- **No wire change.** Nothing here alters a response
  byte. `./test schema` and `./test api-docs` stay green
  untouched.
- **Source sweeps.** The G7 sweep in
  `tests/api-transition-legacy-cut.test.ts` requires the
  files under `api/`, `client/`, `shared/`, and
  `web-app/app/` that match `fieldValues` to equal its
  named exceptions exactly: never add the word to another
  file, and never remove a named exception's last hit.

## Decisions (the owner's rulings)

| # | Ruling | Tasks |
|---|---|---|
| 1 | Split the two uses of `at`: display never sorts; flow-stats walks the chain with no sort, takes `completed` from the chain-last node, and floors each sojourn's exit at its own entry (review ruling; replaces "sorts a COPY by `at`"). One skew pin each. | 24, 25a, 25b, 26 |
| 2 | An unplaced head renders a static, visibly degraded inbox row (no link, no grip; review ruling) instead of blanking the inbox. Server guard stays. `TODO.md` names the skipped check; gate validation is its own later spec. | 32-33 |
| 3 | Correct the docs to say foreign id 404 / foreign path 403. Delete the inert write authorizer (O-2 ruling) and answer a retired instance's 410 without its inert probe (review ruling); no response changes. | 1, 2b, 3, 7a, 7b, 7c, 21b, 21c |
| 4 | `TransitionFieldValueEntity` becomes a union; a clear renders as "cleared". | 27-29 |
| 5 | Un-export four over-exported symbols. | 8-10 |
| 6 | Correct one test-only function's stale comments and record its retirement (review ruling: eleven test files call it); delete one orphan comment; fix or reword six comments; collapse one header. | 11, 11b, 12-16, 34 |
| 7 | Delete one duplicate pin. | 17 |
| 8 | Six wording nits. | 4-7 |
| 9 | Renames a, c, except the fields validator, whose pins move onto the live gate before it is deleted (O-6 ruling); derive b; readonly d; extract e as `isClaimedAndUnlapsed` / `isClaimUnlapsedAt`. | 18-23 (with 20b, 20c), 30-31 |
| 10 | Delete an assertion that cannot fail (O-7 ruling). | 17b |

## Order and dependencies

Risk-ascending. Same-file collisions fix the order (task
numbers): `presenters/workbox-detail.ts` (25a, 25b, then
27), `client/work-orders-queries.ts` (10, 27, then 30),
`client/work-orders-mutations.ts` (14, then 30),
`tests/adapters-work-orders.test.ts` (18, then 31),
`tests/api-write-authorizer.test.ts` (3, 7b, then the 21b
rename), `tests/api-foreign-op-403.test.ts` (7b, then the
21c rename), `tests/api-history-ownership-fence.test.ts`
(2b, 7b, then 21b), `api/validators.ts` (19, 20b, 20c,
then 28), `TODO.md` (11b, 21, 26, then 33).

Two landings (owner ruling, O-5): Phases A through D
change no behavior and land first (Task 35a); Phase E
lands second (Task 35), each behind its own
`./test validate browser`.

| Phase | Tasks | Kind |
|---|---|---|
| A | 1, 2b, 3-7 | docs and comment text |
| A2 | 7a-7c | delete two inert checks (no response change) |
| B | 8-17 (with 11b, 17b), then 34 | un-exports, deletions, comment fixes |
| C | 18, 19, 20b, 20, 20c, 21, 21b, 21c | rename-only, except 20b (a comment fix) and 20 then 20c (pin, then delete, the dead fields validator) |
| D | 22-23 | type-only |
| L1 | 35a | gate and first landing (no commit) |
| E | 24, 25a, 25b, 26-33 | behavior, each with a pin (25a is rename-only) |
| G | 35 | gate and second landing |

Phase defaults, for a task with no **Doctrine** line of
its own: A, V Clarity and the Office of Commentary (risks
the Sin of Obscurity); B, VIII Simplicity and the Office
of Commentary (risks Unbidden Helper Code: touch only the
named lines); C, III Uniformity and the Office of the
Commit (rename-only); D, III Uniformity and VI
Immutability (risks Premature Generalization: derive only
what has one source); E, IV Logic and V Clarity.

## Open Questions for the reviewer

These were the plan's own doubts. The review resolved
each, with the owner's rulings; none is open.

- **O-1 (closed). The degraded row's link.** Owner
  ruling: the unplaced row is static, with no
  `data-work-order-card`, no link, and no grip (Task 32).
  The page's `onRowClick` (`web-app/workbox/index.ts`)
  navigates any `[data-work-order-card]`, and
  `initDragReorder` drags only those, so a static row
  can be neither clicked through nor dragged. The detail
  page still throws on an unplaced head, now reachable
  only by URL; Task 33's TODO bullet names the cause.
- **O-2 (closed). The write authorizer is inert.** For
  all six `WRITE_AUTHORIZERS` patterns,
  `assertWritableInOrganization` probes
  `/organizations/<caller>/<family>/` (every family is
  organization-nested) and both backends match that path
  exactly, so the owner is null or the caller and the
  403 cannot fire. The fence and path-built storage
  isolate tenants; the authorizer backstops neither (it
  reads the token organization's collection, not the one
  written). Owner ruling: delete it here, Tasks 7a and
  7b. No response changes: with both applied in a scratch
  copy the memory suite passed 4139 of 4140 (test-cli's
  git SHA skip fails identically on the unmodified copy
  outside git) and the TZ pass 8 of 8.
- **O-3 (closed). `pathNodeIds` is chain order.** Its
  readers are the WIP pass (its last element must be the
  head's `state`), the path buckets (consecutive pairs
  resolve the edges walked), and the paths
  `presenters/flow-stats.ts` renders; none needs `at`
  order. Owner ruling: no sort at all (Task 24).
- **O-4 (closed). Active only.** The Archive tab means
  completed, which an unplaced head cannot know; Active
  keeps it visible for repair (Task 32). The review
  concurs.
- **O-5 (closed). Size.** Owner ruling: two landings,
  split after Phase D. Task 34 (comment only) moves into
  Phase B, so landing 1 is thirty-three commits with no
  behavior change (Task 35a) and landing 2 is Phase E's
  eleven (Task 35), each behind its own `./test validate
  browser`. Phase E's behavior tasks then face the
  browser suite alone.
- **O-6 (closed). `validateWorkOrderEntity` is
  test-only.** Owner ruling: pin, then delete, instead of
  Task 20's old rename. It shares every field check with
  the live gate, `validateWorkOrderDocumentBody`; two of
  its five tests already survive there, and Task 20 pins
  the other three (a non-number position rejects; a
  legacy `flowId` is tolerated; a JSON-string
  `flow_graph` rejects). Task 20c then deletes it.
- **O-7 (closed). A vacuous pin.** Owner ruling: delete
  it in this plan (Task 17b).
  `assert(derived.length >= 0)` cannot fail, and the next
  line pins the exact state sequence, so nothing weakens.

---

## Phase A — docs and comment text

### Task 1 — State what foreign ids and paths answer

**Files:** `AGENTS.md` (`### Write authorizer 403s before
genesis`), `ARCHITECTURE.md` (`## Tenancy`, the
`writeAuthorizerFor` paragraph), `SCHEMA.md` (item 8:
"The fence and the write authorizer … enforce
organization."). Leave `API.md` step 8 (true: a
selector's miss is 403 for a foreign owner on the global
plane) and `TEST-PLAN.md`'s "nested foreign GET 403s"
(true: a foreign identity's PII, a global-plane read).
`API.md` step 6 is Task 7a's.

**Doctrine:** V Clarity (say what is true); II Security
(RFC 9110 §15.5.4 hides existence).

- [ ] **Step 1: Verify** the pins hold today:
  `tests/api-write-authorizer.test.ts` (a foreign-id PUT
  geneses, 201; a foreign-id DELETE is 404) and
  `tests/api-foreign-op-403.test.ts` (a foreign-id
  claim, release, transition, or undo is 404). Run them
  with the suite's flags (a bare `deno test` fails at
  `tests/hmac-test-key.ts`; 8 passed in review):

  ```
  JWT_HMAC_SIGNING_KEY=test-hmac-signing-key deno test --frozen --no-check --allow-env --allow-read --allow-write --allow-net --preload ./tests/hmac-test-key.ts --preload ./tests/local-storage-stub.ts --preload ./tests/session-storage-stub.ts --preload ./tests/worker-name-prefix.ts tests/api-write-authorizer.test.ts tests/api-foreign-op-403.test.ts
  ```
- [ ] **Step 2: Rewrite the `AGENTS.md` section.** Rename
  the heading and body to this. It names no authorizer,
  so it stays true before and after Task 7a:

  ```
  ### Foreign ids 404; foreign paths 403

  The same id at two organizations is two documents.
  Under the caller's own path another organization's
  document does not exist. Where a PUT may create, a
  foreign-id PUT is the caller's own genesis (201, under
  the route's create precondition); where only a POST
  creates (a work order), a conditional PUT on a foreign
  id is 404. A foreign-id DELETE, claim, release, bind,
  or transition is 404 (RFC 9110 §15.5.4 lets a server
  hide existence, so no cross-tenant oracle). A foreign
  PATH is 403 at the organization fence in `api/api.ts`,
  and so is a membership name whose organization half is
  not the path's. Global-plane reads disclose an owner: a
  GET on a real organization the caller is no member of
  is 403 (an absent one 404), and so is a GET of a
  foreign identity's PII or credentials. The fence is the
  gate.
  ```
- [ ] **Step 3: Mirror it.** In `ARCHITECTURE.md`, replace
  "`writeAuthorizerFor` (`api/write-authorizer.ts`) 403s a
  foreign-id PUT/DELETE/PATCH before genesis in the
  caller's namespace. Read isolation: foreign 403, absent
  404." with the text below; keep the "Path
  `:organization-id` …" sentences after it.

  ```
  A foreign id under the caller's own organization path
  is absent there: a write geneses or 404s, a read 404s.
  Global-plane reads (an organization document, an
  identity's PII or credentials) answer a foreign owner
  403, an absent one 404.
  ```

  In `SCHEMA.md` item 8, "The fence and the write
  authorizer (`api/write-authorizer.ts`) enforce
  organization." becomes "The fence enforces
  organization."
- [ ] **Step 4:** `git grep -n -i "write authorizer 403s"`
  hits only `AGENTS.md` and two historical records
  (`docs/superpowers/specs/2026-09-16-landing-pilot-design.md`,
  `docs/superpowers/plans/2026-10-05-walk-green.md`),
  which stay as written; no anchor link exists.
- [ ] **Step 5:** `./test validate`; commit.

**Commit:** `State what foreign ids and paths answer`

### Task 2 — (dropped)

Its two comments (`api/write-authorizer.ts`'s header and
the `api/api.ts` comment above the `writeAuthorizerFor(`
call) go with the code in Tasks 7a and 7b (O-2).

### Task 2b — Correct the read-path miss comments

**Files:** `api/derive-states.ts` (the 403-vs-404 probe
comment above `ROLE_GRANTS_URI_PREFIX`, and
`missedReadError`'s header), `api/document-family.ts`
(three comments: the organization-nested miss path,
`documentSelect`, `documentVersionsSelectRoute`),
`api/derive-flow-records.ts` and `api/derive-flow-tags.ts`
(the parent-flow probe comments),
`tests/api-history-ownership-fence.test.ts` (header: "403
only when this document has a live PUT the caller may not
have").

**Doctrine:** V Clarity; the Office of Commentary.

- [ ] Each says a foreign id 403s. `missedReadError`
  probes the bound organization's own collection
  (`resolveGlobalOwner` → `ownerProbeCollection`), so for
  an organization-nested family a foreign id 404s
  (`tests/drift-ideas.test.ts`, 'a foreign-org idea id
  404s on GET'); only the global plane (organizations,
  invitations, role grants) can 403. Say so in each.
  Comment-only; no `fieldValues` token (G7). The
  retired-instance read's comments are Task 7c's.
- [ ] `./test validate`; commit.

**Commit:** `Correct the read-path miss comments`

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
  or transition with no precondition`. Release is
  `in-order` (`api/routes.ts`, the `…/claim` pattern) and
  `api/api.ts` answers an in-order route with no header
  428 (both confirmed in review).
- [ ] **412 row:** `If-None-Match: *` on a work order that
  exists becomes `If-None-Match: *` on a work-order
  document PUT whose work order exists.
- [ ] **New 400 row**, between the 201 and 403 rows
  (`api/api.ts` answers an in-order route carrying
  `If-None-Match` 400 before any read):

  ```
  | 400 | a malformed body; `If-None-Match` on claim, release, bind, or transition (in-order routes take only `If-Match`) |
  ```
- [ ] Report: no pin covers a bare release or bind (428).
  The claim's 428 (`tests/api-work-order-claim.test.ts`,
  'a claim without If-Match is 428') and the
  transition's
  (`tests/api-work-order-transition-instance.test.ts`,
  'value-bearing missing If-Match → 428') are pinned;
  `If-None-Match` on an in-order route is pinned only on
  flows undo (`tests/write-conditional.test.ts`).
- [ ] `./test validate`; commit.

**Commit:** `Fix the spec's 400, 404, 412, and 428 rows`

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
  `TODO.md:481` is 63 characters (65 bytes): leave it.
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

## Phase A2 — delete the inert write authorizer

### Task 7a — Stop calling the write authorizer

**Files:** `api/api.ts` (`handleRequest`: the comment
"Pre-write ownership authorizer for the 9 org-scoped
families…" and the `if (isWrite && hasWriteHandler …)`
block below it; the import from `./write-authorizer.ts`),
`API.md` (step 6).

**Doctrine:** II Security (the fence is the gate); XII
Performance ("no code is faster than no code"); the Sin
of Internal Defense (a check inside the wall that cannot
fire).

- [ ] Delete the comment, the block, and the import.
  Keep the `try`: the shadow-ledger pair now opens it.
  `isWrite`, `hasWriteHandler`, `bearerExempt`,
  `effective`, and `params` keep other readers (no
  TS6133).
- [ ] `API.md` step 6: `**Region B + write authorizer.**`
  becomes `**Region B.**`; delete "`writeAuthorizerFor` on
  org-scoped PUT/DELETE: owner-null is genesis; foreign
  403 before pair crypto."
- [ ] No red pin: no response changes (O-2). The proof is
  the foreign-id pins staying green
  (`tests/api-write-authorizer.test.ts`,
  `tests/api-foreign-op-403.test.ts`, and
  `tests/api-work-order-document.test.ts`'s own-path
  foreign-id PUT 404) and the fence's 403 pins.
- [ ] `./test validate`; commit.

**Commit:** `Stop calling the inert write authorizer`

### Task 7b — Delete the write authorizer

**Files:** `api/write-authorizer.ts` (delete),
`tests/api-patch-verb.test.ts`, and every comment or test
title naming it as live: `api/request-auth.ts`,
`api/routes.ts` (three comments),
`tests/api-foreign-op-403.test.ts`,
`tests/api-history-ownership-fence.test.ts`,
`tests/api-record-types-write.test.ts`,
`tests/api-write-authorizer.test.ts`.

**Doctrine:** VIII Simplicity; the Office of Commentary;
the Sin of Test Weakening (the one deleted pin asserts the
deleted map's shape; the behavior it guarded stays
pinned).

- [ ] `git rm api/write-authorizer.ts`.
- [ ] `tests/api-patch-verb.test.ts`: delete the test
  'writeAuthorizerFor includes PATCH on
  organizations/:id/ideas/:id', its import, `assertEquals`
  from the `@std/assert` import (its only reader goes;
  TS6133 otherwise), and the header sentence
  "writeAuthorizerFor must include PATCH so a future flat
  PATCH cannot bypass the ownership fence."
- [ ] Reword, so nothing names it as live:
  `api/request-auth.ts` "Ownership fences (write
  authorizer / resolveGlobalOwner)" → "Ownership probes
  (resolveGlobalOwner)"; `api/routes.ts` "(no org
  nesting, no write authorizer)" → "(no org nesting)",
  "No WRITE_AUTHORIZERS (deep sub-family — parent type
  404 + path org gate)." → "A deep sub-family: parent
  type 404 + path org gate.", and drop the second "No
  WRITE_AUTHORIZERS (deep sub-family)."; the
  foreign-op-403 header ends "and flow undo. A miss at
  this document is 404."; the history-ownership-fence
  header's "Write-authorizer pins" → "Foreign-id write
  pins"; the record-types-write header's "write
  authorizer," → "foreign-id genesis," and its title
  'PUT foreign type id under own org path geneses
  (write authorizer)' loses "(write authorizer)" (title
  only); the api-write-authorizer header becomes "Foreign
  ids under the caller's own path: the same id at two
  organizations is two documents. A foreign-id PUT
  geneses here; a foreign-id DELETE never written here is
  404."
- [ ] Leave history as written: ARCHITECTURE.md
  `## How we got here`, COST-ESTIMATION.md's first-run
  table, and `docs/`.
- [ ] `./test validate`; commit.

**Commit:** `Delete the inert write authorizer`

### Task 7c — Answer a retired instance 410 directly

**Files:** `api/routes.ts` (`retiredInstanceError` and its
four callers: `postInstancePatchOp` and the
`INSTANCE_VERSIONS_PATTERN`, `INSTANCE_VERSION_PATTERN`,
and `INSTANCE_DETAIL_PATTERN` selects).

**Doctrine:** XII Performance ("no code is faster than no
code"); the Sin of Internal Defense; V Clarity (no comment
promises an impossible 403).

Owner ruling (review): the four sites run the owner probe
before a retired instance's 410, so that "a foreign
retired instance answers 403". It cannot: the instance
was found under the caller's own path, and the probe
searches the caller's own record-types collection, so it
can name no foreign owner, and every site answers
`410 Gone: record_instances/<id>`.

- [ ] At all four sites, `throw await
  retiredInstanceError(…)` becomes `throw new
  RetiredEntityError('record_instances', instanceId)`,
  the object the probe returns today.
- [ ] Delete `retiredInstanceError` and its comment.
  Delete the three selects' "The gate's own 410 would
  skip the owner probe, and a foreign retired instance
  must answer 403." (the code says it: a DELETE head is
  Gone). The versions route's "A tombstone is Gone only
  after the owner probe, so a foreign retired instance
  stays 403." becomes "A tombstone is Gone."
- [ ] No red pin: no response changes. The proof is the
  retired-instance pins staying green
  (`tests/api-instances-read.test.ts`,
  `tests/api-instances-history.test.ts`,
  `tests/api-instances-patch.test.ts`,
  `tests/api-instances-delete.test.ts`: 55 passed in
  review, and the full suite 4140 of 4141, the one
  failure environmental).
- [ ] `./test validate`; commit.

**Commit:** `Answer a retired instance 410 without a probe`

---

## Phase B — un-exports, deletions, comment fixes

### Task 8 — Un-export a join-document op

**Files:** `api/routes.ts` (`postFlowWorkOrderDocumentOp`).

**Doctrine:** VIII Simplicity; Interface Segregation (a
module exports what its callers use).

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

### Task 11 — Correct the collection get handler's comment

**Files:** `api/document-family.ts` (the comment above
`documentCollectionGetHandler`, 412-418 at the tip),
`api/routes.ts` (the objectives wiring comment, 419-422).

**Doctrine:** V Clarity; the Office of Commentary.

- [ ] Keep the function (owner ruling): no route serves
  it, but eleven test files read a family's list through
  it, below the gate (`git grep -lw
  documentCollectionGetHandler -- tests`); deleting it is
  TS2305 in each. Its last product callers left in
  `38728ea0`. Replace the comment above it, which names a
  `route('flows')` pairing that no longer exists, with:

  ```
  // The generic per-family list derivation: a family's live
  // heads as wire entities, oldest first, a 'state' tombstone
  // omitted. No route serves it (a collection GET selects);
  // the derive, drift, and mock-data tests read a family's
  // entities through it, below the gate.
  ```
- [ ] In `api/routes.ts` delete the false sentence "The
  generic GET machinery (documentGetHandler/
  documentCollectionGetHandler) this entityOf serves flips
  onto objectives: GET objectives/:id and GET objectives
  ride it." (objectives GET selects: `collectionSelect`,
  `documentSelect`) and rewrap the paragraph. Leave
  553-554 ("GetHandler serves only …"), which is true.
  Leave 5170-5175: Task 12 owns it.
- [ ] `./test validate`; commit.

**Commit:** `Correct the collection get handler's comment`

### Task 11b — Record the test-only list oracles in TODO

**Files:** `TODO.md` (append to `## Later work`).

**Doctrine:** V Clarity (later work has one home).

- [ ] Append one bullet in that section's form (a lead
  sentence, `path` evidence, a closing inline `Oracle:`):
  `documentCollectionGetHandler` and `documentGetHandler`
  (`api/document-family.ts`) and the `GetHandler` type
  (`api/routes.ts`) serve no route; eleven test files
  read families through them below the gate. Move those
  reads onto the live read path, each moved assertion at
  least as strong, then delete all three. Oracle: `git
  grep -nw` finds none of the three names under `api/` or
  `tests/`.
- [ ] `./test validate`; commit.

**Commit:** `Record the test-only list oracles in TODO`

### Task 12 — Delete an orphan comment

**Files:** `api/routes.ts` (the comment "GET is FLIPPED
(Task 8): derived via documentCollectionGetHandler …"
above the `organizations/:id/invitations/` route, lines
5170-5175 at the tip; Task 11 leaves it).

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

- [ ] The ledger is chain-ordered (spec Decision 8), and
  nothing on the server compares `release.at` with
  `transitionAt`; `nowUtc` is strictly monotonic within a
  realm (`shared/types.ts`). Replace the five comment
  lines with exactly these five (`TODO.md` cites the next
  line, `:339`; this file is no G7 exception, so no
  `fieldValues` token):

  ```
      // Mint transitionAt first: the route records the move
      // and then the release in one version's events, and
      // nowUtc is strictly monotonic, so the release's `at`
      // follows the move's. Both mints stay await-free before
      // the POST.
  ```
- [ ] `./test validate`; commit.

**Commit:** `Reword the transition mint-order comment`

### Task 15 — Fix the matchRoute attribution

**Files:** `api/routes.ts` (about 4047-4049) and
`api/api.ts` (about 1205-1208).

- [ ] `matchRoute` returns a match or `null`. On `null`,
  `dispatched` (`api/api.ts`) answers 401 to an
  unauthenticated caller, else 404; a matched route
  without the verb's handler answers 405 in its own arm.
  In `api/routes.ts` the comment ends:

  ```
      // offers POST so the generator advertises the verb.
      // matchRoute matches both patterns or returns null;
      // api.ts answers a null match 404 (401 before auth) and
      // a matched route without the verb's handler 405.
  ```

  In `api/api.ts` replace the lines from "`matched.post`
  runs (matchRoute still matches" through "DELETE find no
  handler). The" with these; "seed carries everything"
  stays below them:

  ```
                  // `matched.post` runs. matchRoute returns null
                  // for an unknown path, which `dispatched` answers
                  // before any arm (401 unauthenticated, else 404);
                  // a non-POST verb 405s in its own arm: a GET has
                  // no select, and PUT, PATCH, and DELETE find no
                  // handler. The
  ```
- [ ] `./test validate`; commit.

**Commit:** `Attribute the 404 and 405 to their sources`

### Task 16 — Swap a retired example path

**Files:** `tests/measure-profile-core.test.ts` (about
45-47: `work-orders/${id}/history` →
`work-orders/:id/history`).

- [ ] `/history` is a retired route (the versions route
  replaced it). `canonicalizeResource`
  (`web-app/app/measure-profile-core.ts`) is generic over
  id-shaped segments (confirmed in review) and keeps a
  trailing slash. The live route is `…/versions/`, so
  `` `work-orders/${id}/history` `` becomes
  `` `work-orders/${id}/versions/` `` and
  `'work-orders/:id/history'` becomes
  `'work-orders/:id/versions/'`. The assertion keeps its
  kind.
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

### Task 17b — Delete an assertion that cannot fail

**Files:** `tests/derive-states-work-orders.test.ts` ('a
claim, then a claim past lockTimeout supersedes with
claim_expired + claimed').

**Doctrine:** the Office of Verification (a test that
cannot fail is a comfort object); the Sin of Test
Weakening (nothing weakens: the next line pins the exact
state sequence, and so the length).

- [ ] Delete `assert(derived.length >= 0); // Phase Final
  Task 2: row plane empty` (owner ruling, O-7), and drop
  `assert` from the `@std/assert` import: it is the only
  use (TS6133 otherwise).
- [ ] `./test validate`; commit.

**Commit:** `Delete an assertion that cannot fail`

### Task 34 — Collapse the seed-pairs header

Moved here from the former Phase F (owner ruling, O-5):
it is comment-only, so it lands in the first batch.

**Files:** `api/mock-data/seed-message-pairs.ts`
(the leading comment, lines 1-114).

**Doctrine:** the Office of Commentary: a comment says
why; history lives in git.

- [ ] Replace the phase and Task narrative with this
  header, which says only what is true now (the review
  corrected three claims: `postWorkOrderDocumentOp`
  exists, though the seed no longer calls it; a few
  pairs form inside the rehearsal; the header ends at
  line 114):

  ```
  // Seed message pairs for both seed paths (postMockDataLoad
  // and postBootstrap in ../mock-data.ts). Forming a pair is
  // async crypto, which a transaction body never awaits
  // (AGENTS.md § Transaction bodies await only row ops), so
  // a seed runs in two passes. Pass 1 forms the pairs here,
  // before any transaction opens. Pass 2 rehearses the live
  // ops on a scratch backend, passing each op its pre-formed
  // pair, and postSeedLanding lands the rehearsed statements
  // in one transaction. The pairs that latch a head the
  // rehearsal itself writes (formInstanceBindingSeedPair,
  // formInstanceTransitionSeedPair) form inside it instead:
  // the rehearsal is AGENTS.md's named exception.
  //
  // A body-builder here is the one construction its family
  // uses both to form the pair and to perform the write, so
  // that stored pair cannot drift from what was written.
  ```

  It drops the reference to `postWorkOrderDocumentOp`,
  which the seed no longer calls (work orders are born
  through `postWorkOrderCreationOp`), and the "work-order
  deferral" narrative, which no longer holds. Keep at
  least one `fieldValues` hit in the file (G7).
- [ ] This commit is comment text only; its diff must
  touch no code line. `./test validate`; commit.

**Commit:** `Collapse the seed pairs header comment`

---

## Phase C — renames, and the dead fields validator

### Task 18 — Name the released seed

**Files:** `tests/adapters-work-orders.test.ts`
(`seedBareWorkOrder`: definition and two call sites).

- [ ] Rename to `seedReleasedWorkOrder` (it seeds through
  `seedCreatedWorkOrder` with `claim: 'released'`; its
  neighbor `seedRelease` releases an existing claim).
  Rename only.
- [ ] `./test validate`; commit.

**Commit:** `Name the released work-order seed`

### Task 19 — Suffix the event validator

**Files:** `api/validators.ts` (`validateWorkOrderEvent`,
private, one caller).

- [ ] Rename to `validateWorkOrderEventEntity`, so its
  name is validate + the type it returns
  (`WorkOrderEventEntity`), as its neighbor
  `validateTransitionFieldValueEntity`'s is.
- [ ] `./test validate`; commit.

**Commit:** `Name the work-order event validator`

### Task 20b — Correct the stale re-validation comment

Runs before Tasks 20 and 20c, so the deletion meets no
create-body comment that names the function.

**Files:** `api/validators.ts` (the comment above
`validateWorkOrderCreateBody`: "the work_orders store
stamps organization_id … and re-validates through
validateWorkOrderEntity AFTER the stamp").

- [ ] No store re-validates through it; the function has
  no production caller. The route gates the fields
  through `validateWorkOrderDocumentBody`, stamps
  `organization_id` from the verified token, and gates
  the join through `validateFlowWorkOrderEntity`.
  Replace the comment with:

  ```
  // The HTTP-body gate for POST /work-orders: the work order,
  // its flow_work_orders join, and THREE initial state events
  // (start, post-start, claimed), written atomically. The
  // facet fields are NOT validated here: the route gates
  // them through validateWorkOrderDocumentBody and stamps
  // organization_id from the verified token (so the body
  // OMITS organization_id), and gates the join through
  // validateFlowWorkOrderEntity. The three event ids and
  // states ride parallel arrays, applied IN ORDER; authorship of
  // every event is stamped from the verified caller in the route,
  // never the body. The arrays must be equal length and exactly
  // three — the create's fixed event count.
  ```
- [ ] `./test validate`; commit.

**Commit:** `Correct a stale validator comment`

### Task 20 — Pin the shared field checks on the live gate

Owner ruling (O-6): pin, then delete, the dead fields
validator instead of renaming it.

**Files:** `tests/api-work-order-document.test.ts` (section
"1. validateWorkOrderDocumentBody").

**Doctrine:** the Office of Verification (pin the gate the
checks really run at); the Sin of Test Weakening (Task 20c
deletes the old pins only because each survives here).

- [ ] `validateWorkOrderEntity` has no production caller,
  but its five tests (`tests/validators.test.ts`) pin
  checks it shares with `validateWorkOrderDocumentBody`
  (the same `asObject`, `asWorkOrderFlowGraph`,
  `pickString`, and `pickNumber` calls). Two already
  survive on the gate: 'validateWorkOrderDocumentBody
  accepts the entity fields with organization_id absent'
  asserts the whole entity equals its input, native
  `flow_graph` included. Add the other three on the gate,
  each built from `documentFields()`: a non-number
  `position` throws "expected finite number for
  position"; a legacy `flow_graph` still carrying
  `flowId` is accepted; a JSON-string `flow_graph` throws
  "expected object for flow_graph".
- [ ] They pin existing behavior, so they pass on
  arrival: prove each can fail by breaking the line it
  guards in a scratch edit, seeing it red, and restoring.
- [ ] `./test validate`; commit.

**Commit:** `Pin the work-order field checks on the gate`

### Task 20c — Delete the dead fields validator

**Files:** `api/validators.ts` (`validateWorkOrderEntity`,
`WORK_ORDER_BODY_KEYS`, and the sentence in
`validateWorkOrderDocumentBody`'s comment that names it),
`tests/validators.test.ts` (its five tests, its import,
and the `validWorkOrder`, `F_LEGACY`, and
`ORGANIZATION_1` constants only they read).

**Doctrine:** VIII Simplicity; the Sin of Test Weakening
(every deleted assertion survives on the live gate:
Task 20 and the gate's accept test).

- [ ] Delete the function, `WORK_ORDER_BODY_KEYS` (its
  only reader), the five tests, the import, and the three
  constants (each read only by the deleted tests; TS6133
  otherwise). Keep `DEFAULT_LOCK_TIMEOUT`: another test
  reads it.
- [ ] In `validateWorkOrderDocumentBody`'s comment, delete
  "Entity fields are picked directly rather than
  delegated to validateWorkOrderEntity — that function
  REQUIRES organization_id, which this body never
  carries." and rewrap.
- [ ] `git grep -nw validateWorkOrderEntity -- . ':!docs'`
  is empty.
- [ ] `./test validate`; commit.

**Commit:** `Delete the dead work-order fields validator`

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

### Task 21b — Name the foreign-id write pins by their subject

**Files:** `tests/api-write-authorizer.test.ts` →
`tests/api-foreign-id-writes.test.ts`, and the two
citations of its path: `ARCHITECTURE.md` (`## Do not
resurrect`, the "org-scoped decorator stores" line) and
the header of `tests/api-history-ownership-fence.test.ts`
("Foreign-id write pins live in api-write-authorizer.").

**Doctrine:** III Uniformity ("call a thing a thing": the
file pins foreign-id writes under the caller's own path,
and the module it was named for is gone); the Office of
the Commit (never move or rename and change content in
one commit).

- [ ] `git mv tests/api-write-authorizer.test.ts
  tests/api-foreign-id-writes.test.ts`. The file's bytes
  do not change (Task 7b already rewrote its header);
  `git show --stat HEAD` must report the rename at 100%
  similarity.
- [ ] Update the two citations to the new path (the
  history-fence header names it bare:
  `api-foreign-id-writes`). Leave `docs/`: historical
  plans and specs cite the old path as it was.
- [ ] Confirm `git grep -n api-write-authorizer -- .
  ':!docs'` is empty. TEST-PLAN.md cites no such path,
  so the path lint is unaffected, and `tests/*.test.ts`
  still globs the file.
- [ ] `./test validate`; commit.

**Commit:** `Name the foreign-id write pins by their subject`

### Task 21c — Name the foreign-id op pins by their subject

**Files:** `tests/api-foreign-op-403.test.ts` →
`tests/api-foreign-id-ops.test.ts`.

**Doctrine:** III Uniformity (its four pins, a claim,
release, transition, and flow undo on another
organization's id under the caller's own path, each
assert 404; the name says 403); the Office of the Commit
(rename-only).

- [ ] `git mv tests/api-foreign-op-403.test.ts
  tests/api-foreign-id-ops.test.ts`. The file's bytes do
  not change (Task 7b already rewrote its header); `git
  show --stat HEAD` must report the rename at 100%
  similarity.
- [ ] Confirm no live file cites the old path:
  `git grep -n foreign-op-403 -- . ':!docs'` is empty
  (only historical plans in `docs/` cite it, and they
  stay as written). TEST-PLAN.md cites no such path, and
  `tests/*.test.ts` still globs the file.
- [ ] `./test validate`; commit.

**Commit:** `Name the foreign-id op pins by their subject`

---

## Phase D — type-only

### Task 22 — Derive the work-order fields

**Files:** `api/work-order-version.ts` (`WorkOrderFields`).

- [ ] Replace the three literal fields with
  `Readonly<Omit<WorkOrderFieldsEntity, 'id' |
  'organization_id'>>`, imported from `shared/types.ts`
  (it compiled clean in review). One source of truth for
  the three fields. Leave `WorkOrderDocumentBody`
  (`validators.ts`) as it is: the old condition ("only if
  it type-checks unchanged") could never fail, since a
  readonly property assigns both ways.
- [ ] `deno check --frozen api client shared server tests
  web-app`; `./test validate`; commit.

**Commit:** `Derive WorkOrderFields from its entity`

### Task 23 — Make the events array readonly

**Files:** `shared/types.ts` (`WorkOrderEntity.events`).

- [ ] `events: WorkOrderEventEntity[]` becomes
  `readonly events: readonly WorkOrderEventEntity[]`,
  matching `WorkOrderVersion` and the all-readonly event.
  A grep found no mutation of it, and it compiled clean
  in review; the compiler is the proof. If `deno check`
  reports a write, stop and report it: that is a finding,
  not an edit to force through.
- [ ] `./test validate`; commit.

**Commit:** `Make a work order's events readonly`

---

## Landing 1 — gate and handoff (no commit)

### Task 35a — Gate and land Phases A through D

- [ ] `./test validate` green at the tip.
- [ ] `./test validate browser` green. This needs Chrome
  (`CHROME` or `CHROME_DEBUG_URL`); if the sandbox cannot
  reach it, stop and ask the owner to run
  `! ./test validate browser`.
- [ ] `git log --oneline 5e507612..HEAD`: the plan's own
  commits, then thirty-three task commits, each one line,
  about 50 characters, with both trailers; none mixes a
  rename with content (21b and 21c show 100%
  similarity).
- [ ] Report: the count, and anything a task flagged
  instead of forcing.
- [ ] Do NOT merge. Wait for the owner's word, then:
  `git -C .worktrees/membership-and-versions merge
  --ff-only work-order-events-follow-ups`; if it fails
  because `membership-and-versions` moved, stop and ask
  (never rebase without the owner's word). Keep the
  worktree and the branch: Phase E continues on them.
  Record the landed tip: Task 35 counts from it.

---

## Phase E — behavior, each with a pin

### Task 24 — Complete a run by its chain-last node

**Files:** `web-app/app/flow-stats-aggregate.ts`
(`reconstructRuns`), `tests/flow-stats-aggregate.test.ts`.

**Doctrine:** IV Logic (the chain, not the clock, orders
a run); We derive from the ledger (one order, never a
second one re-sorted from `at`).

Owner ruling (review): walk the chain with no sort, and
floor each sojourn's exit at its own entry. A sorted copy
by `at` was measured to leave a phantom: an archived run
kept an open-ended sojourn at Review (3600 s, 33% heat in
the pin's fixture) that grows with `nowMs`.

- [ ] **Step 1 (settled, O-3):** `pathNodeIds` stays in
  chain order. Its readers are the WIP pass (its last
  element must be the head's `state`), the path buckets
  (consecutive pairs resolve the edges walked), and the
  paths `presenters/flow-stats.ts` renders.
- [ ] **Step 2: Red pin**, through `buildFlowStats`
  (`completed` and the sojourns are module-private):
  `makeFixture()`, one work order whose chain is
  creation → `c` and `c`→`a` at 4 h ago, `a`→`b` at 1 h
  ago, and `b`→`z` at 2 h ago (the Archive move's clock
  runs behind). Assert `completedWorkOrderCount` 1,
  `incompleteWorkOrderCount` 0, `b`'s `currentlyHere` 0,
  the one path entry's `nodeIds` `['c','a','b','z']` and
  `edgeIds` `['YiJPbufDpkyrZcZCYbUJpg','e2','e3']`, `a`'s
  `avgSeconds` 10800, and `b`'s `avgSeconds` null. Today
  (measured): completed 0, incomplete 1, `b` here now 1,
  no path entry, `a` 7200, `b` 3600.
- [ ] **Step 3: Implement.** Delete the per-work-order
  `ts.sort` by `at`: walk the transitions in the order
  they arrive, which is chain order
  (`projectTransitions`). A sojourn's exit is the next
  move's `at` floored at its own entry,
  `Math.max(enterMs, Date.parse(nextT.at))`, so a skewed
  clock gives a zero-length sojourn, never a negative
  one; only the chain-last node runs open-ended to
  `nowMs`. `completed` stays the last resolved node's
  `isArchive`, now the chain-last's. All 20 existing
  tests in the file stay green (measured).
- [ ] **Step 4: Rewrite the covenant comment** (the
  "only while `at` order is chain order" block): a run is
  completed when its chain-last node is Archive, the
  head's `state`; `at` only measures sojourns; the
  browser mints `transitionAt` and the server never
  compares it with the head, so a skewed exit is floored
  at its entry.
- [ ] `./test validate`; commit.

**Commit:** `Complete a run by its chain-last node`

### Task 25a — Name the history builder's transitions

**Files:** `web-app/app/presenters/workbox-detail.ts`
(`buildHistory`'s `sortedTransitions` parameter).

- [ ] Rename the parameter `sortedTransitions` to
  `transitions` (its declaration and its one use).
  Rename only: the caller still passes the sorted copy,
  which is still transitions; Task 25b changes what it
  passes.
- [ ] `./test validate`; commit.

**Commit:** `Name the history builder's transitions`

### Task 25b — Show history in chain order

**Files:** `web-app/app/presenters/workbox-detail.ts` (the
constructor's `sorted` copy),
`tests/presenter-workbox-detail.test.ts`.

**Doctrine:** IV Logic; We derive from the ledger (the
display shows the chain's order;
`web-app/workbox/detail.ts` already hands the events over
"in chain order (spec §4)", and
`client/work-orders-queries.ts` `projectTransitions`
promises it).

- [ ] **Red pin:** the page lists history newest-first,
  so read the rendered order. Creation `t-1` (12:00, Ada
  Park), `t-2` `n-1`→`n-2` (14:00, Ada Park), `t-3`
  `n-2`→`n-3` (13:00, Bo Park: the second move's clock
  runs behind), the head at `n-3`; assert
  `out.indexOf('Bo Park') < out.indexOf('Ada Park')`.
  Today Ada's entry renders first (measured: Ada at 2859,
  Bo at 3816).
- [ ] **Implement:** delete the constructor's `sorted`
  copy; pass `transitions` straight to `buildHistory`.
- [ ] `./test validate`; commit.

**Commit:** `Show a work order's history in chain order`

### Task 26 — Retire the skew bullet

**Files:** `TODO.md` (the bullet "Chain order stops at
`projectTransitions`. The browser mints `transitionAt` …
Two downstream sorts still order by …", near the end of
`## Later work`).

**Doctrine:** V Clarity (TODO.md lists only open work).

- [ ] Tasks 24 and 25b resolved the two sorts it names:
  delete the bullet. Its other half (the server never
  compares `transitionAt` with the head's
  `transition.at`) moves into Task 33's gate bullet, so
  one later spec owns every transition-gate check.
- [ ] `./test validate`; commit.

**Commit:** `Retire the downstream-sort skew bullet`

### Task 27 — Type a cleared field value as cleared

**Files:** `shared/types.ts`
(`TransitionFieldValueEntity`),
`client/work-orders-queries.ts`
(`HistoryFieldValue`, `StateFieldValue`,
`fieldValuesByEventFromHistory`),
`web-app/app/presenters/workbox-detail.ts`
(`buildHistory` and the view's `#buildHistoryEntry`),
`tests/presenter-workbox-detail.test.ts`,
`tests/mock-data-valid.test.ts` (the seed SFV pin reads
`fv.value`).

**Doctrine:** the Sin of Null / Default Values: a clear
is modeled as a clear, never `value: ''` or `undefined`
typed as `string`. Model absence at the call site.

One commit, because the type change and its consumers
must compile together. In review the union alone broke
exactly `client/work-orders-queries.ts` and
`tests/mock-data-valid.test.ts`; with all the files
above, `deno check` was clean and the affected suites
passed.

- [ ] **Red pin first:** build the cleared row through
  `fieldValuesByEventFromHistory` (an event whose
  `field_values` holds `{ id, attribute_id, cleared:
  true }`), pass the map to the presenter, and assert the
  history renders the attribute's name followed by
  `cleared`. Today it renders `>Notes</span> <span></span>`
  (measured). The event literal type-checks only once the
  union lands, so see it red with `--no-check`.
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
  `'cleared' in fv`; the history render prints a clear as
  `<span class="text-muted italic">cleared</span>` (both
  classes exist in `web-app/app/styles/utilities.css`) and
  a set as its value (SafeHtml, no inline style).
- [ ] **The other reader:** 'mock-data derived seed SFV
  pairs pass validator' (`tests/mock-data-valid.test.ts`)
  reads `fv.value` from every seeded event. Narrow it
  with an assertion, never a skip: `assert(!('cleared' in
  fv), 'a seeded field value is a set row');` before the
  validator call. A `continue` would weaken the pin.
- [ ] `./test validate`; commit.

**Commit:** `Type and show a cleared field value`

### Task 28 — Drop the two construction casts

**Files:** `api/routes.ts` (`deltaFieldValueEntities`,
`as TransitionFieldValueEntity`), `api/validators.ts`
(`validateTransitionFieldValueEntity`, the same cast).

**Doctrine:** III Uniformity (a literal states its own
type); risks the Sin of Cleverness (an `as` silences the
checker).

- [ ] Remove both casts. In `deltaFieldValueEntities`
  annotate the clear map's callback instead, or
  `cleared: true` widens to `boolean` (the spread-then-
  `sort` array literal gets no contextual type; TS2322 in
  review): `...clear.map((attributeId):
  TransitionFieldValueEntity => ({ … }))`. The
  validator's literal needs nothing: its `return` is
  typed by the signature. Both compiled clean in review.
- [ ] `./test validate`; commit.

**Commit:** `Drop the field value entity casts`

### Task 29 — Drop the unknown asserts

**Files:** `tests/api-work-order-history-shapes.test.ts`
(the two `assertEquals<unknown>` calls, about lines 320
and 401).

**Doctrine:** the Office of Verification: the compiler
now checks the expected rows against the real type, a
strengthening. In review the removal compiled only after
Task 27.

- [ ] Remove `<unknown>` from both. If a literal fails to
  type-check, the literal was wrong: fix the literal,
  never the type.
- [ ] `./test validate`; commit.

**Commit:** `Type-check the field value history pins`

### Task 30 — Name one claim predicate

**Files:** `client/work-orders-queries.ts` (next to
`WorkOrderClaim`, and its `../shared/work-order-claims.ts`
import), `web-app/app/workbox-inbox-rows.ts` (about
32-34), `web-app/workbox/detail.ts` (about 390-391),
`client/work-orders-mutations.ts` (`hasLiveClaim`).

**Doctrine:** IX Generality: the judgment is spelled at
ten sites; the nine over the domain claim or its message
take the predicate (three here, six in Task 31), and the
better way must replace every site. "Call a thing a
thing."

- [ ] Add it, adding `isExpiresAtPassed` to the existing
  `../shared/work-order-claims.ts` import, with this
  why-comment:

  ```ts
  // Judged by this browser's clock; the server judges a
  // held claim by its request stamp (isClaimUnlapsedAt).
  export function isClaimedAndUnlapsed(
      claim: WorkOrderClaim,
  ): claim is Extract<
      WorkOrderClaim, { state: 'claimed' }
  > {
      return claim.state === 'claimed'
          && !isExpiresAtPassed(claim.expiresAt);
  }
  ```

  `client/index.ts` re-exports the module (`export *`),
  so it needs no edit; the web app imports the predicate
  through its existing `'../../client/index.ts'` blocks.
- [ ] Replace the two web-app sites and drop
  `isExpiresAtPassed` from each file's imports, where it
  then has no reader (TS6133 otherwise; measured in
  review).
- [ ] Replace the third production site,
  `client/work-orders-mutations.ts`'s `hasLiveClaim`, with
  `isClaimedAndUnlapsed(workOrder.claim) &&
  workOrder.claim.memberId === ctx.identity.id`
  (`toWorkOrder` builds `claim` from the same message),
  and drop `isExpiresAtPassed` from that file's imports.
  `tests/work-order-fixtures.ts` judges a raw response's
  storage claim, a different shape: it stays.
- [ ] Behavior is unchanged; the existing tests are the
  proof. `./test validate`; commit.

**Commit:** `Name the claimed-and-unlapsed predicate`

### Task 31 — Convert the six test sites

**Files:** `tests/adapters-work-orders.test.ts` (six
`x.state === 'claimed' && !isExpiresAtPassed(x.expiresAt)`
expressions, about lines 638, 654, 1007, 1198, 1221,
1266).

**Doctrine:** IX Generality (the six test sites); the
Sin of Test Weakening (keep each assertion's polarity and
message).

- [ ] Replace each with `isClaimedAndUnlapsed(x)`. All
  six stay un-negated: polarity lives in the surrounding
  `assert` / `assertStrictEquals(…, false)`. Keep every
  assertion and message. Import the predicate in the
  existing `'../client/work-orders-queries.ts'` block,
  and delete the `isExpiresAtPassed` import from
  `'../shared/work-order-claims.ts'`, which then has no
  reader (TS6133 otherwise).
- [ ] `./test validate`; commit.

**Commit:** `Use the claim predicate in the adapter tests`

### Task 32 — Render an unplaced head as a degraded row

**Files:** `web-app/app/presenters/workbox-inbox.ts`
(`InboxItem`, `buildInboxItems`, `#buildRow`),
`tests/workbox-inbox.test.ts`. Read DESIGN-SYSTEM.md for
the badge and token classes.

**Doctrine:** I Reliability; degrade visibly rather than
corrupt silently, and keep an impossible state inside its
row, never cascading across the inbox (We handle failure
with grace); the Sin of Null (a sum type, not a flag).

Owner ruling (review): the unplaced row is static. The
page's `onRowClick` (`web-app/workbox/index.ts`) sends a
click anywhere on a `[data-work-order-card]` to the
detail page, which throws on this head, and
`initDragReorder` drags only such cards; so the row
carries no card attribute, no link, and no grip.

- [ ] **Red pin:** one placed and one unplaced work order
  (its `nodeId` names no node in its `flowGraph`). Today
  `buildInboxItems` throws ("invariant violated: the head
  of work order … references unknown node …", measured),
  so the page's load fails and the inbox blanks. Assert
  it returns both items in Active mode, and that
  `renderList` on a stub element (an `innerHTML` setter
  that captures, as `tests/presenter-members.test.ts`
  does) renders the placed row as today and the unplaced
  row with "State unknown" and none of
  `data-work-order-card`, `href=`, `drag-handle`, or
  `cursor-pointer`. No inbox row is rendered at Layer 1
  today; this pin is the first.
- [ ] **Model:** `InboxItem` becomes a union of a placed
  item (today's fields) and an unplaced one (`id`,
  `displayId`, `flowName`, `position`, `transitionerName`,
  `lastTransitionedAt`, `claimedByName`; no `stateName`,
  no `completed`, no `taskInstructions`). No sentinel
  string stands in for the missing node name.
- [ ] **Builder:** when the node is not found, emit the
  unplaced item in Active mode and skip it in Archived
  mode (O-4), instead of throwing.
- [ ] **Render:** an unplaced row is a static card: a
  "State unknown" `badge badge-warning`, the flow name,
  `#displayId`, from, and time; no `data-work-order-card`
  (so `onRowClick` never navigates it and
  `initDragReorder` never drags it), no link, no grip, no
  `cursor-pointer`. SafeHtml; no inline styles.
- [ ] **Server guard stays:** do not touch
  `assertRequiredAttributesAtExit` in `api/routes.ts`.
- [ ] `./test validate`; commit.

**Commit:** `Render an unplaced head as a degraded row`

### Task 33 — Name the skipped check

**Files:** `TODO.md` (append to `## Later work`).

**Doctrine:** V Clarity (later work has one home); I
Reliability (name the gap the degraded row only
contains).

- [ ] Append one bullet at the end of `## Later work`
  (TODO.md has only `##` headings; none is about gates),
  in that section's form: a lead sentence, `path`
  evidence, a closing inline `Oracle:`. Content: the
  required-at-exit check (`assertRequiredAttributesAtExit`,
  `api/routes.ts`) returns when the head's `state` names
  no node in its frozen `flow_graph`; neither gate checks
  nodes: create checks `states` only as non-empty strings
  (`validateWorkOrderCreateBody`), and transition checks
  `targetState` only as non-empty, with no edge from the
  head's `state` (`validateWorkOrderInstanceTransitionBody`,
  `postWorkOrderTransitionOp`), and never compares the
  browser-minted `transitionAt` with the head's
  `transition.at` (moved here from Task 26's bullet).
  Plan gate validation (node, edge, and `transitionAt`;
  real graphs in fixtures) as its own spec; it decides
  whether a skewed `transitionAt` is refused or clamped.
  Oracle: a create or transition naming a node absent
  from the graph, or a transition with no edge from the
  head's `state`, is refused at the gate.
- [ ] `./test validate`; commit.

**Commit:** `Record the unvalidated node gate in TODO`

---

## Phase G — gate and handoff

### Task 35 — Gate and land Phase E (no commit)

- [ ] `./test validate` green at the tip.
- [ ] `./test validate browser` green. This needs Chrome
  (`CHROME` or `CHROME_DEBUG_URL`); if the sandbox cannot
  reach it, stop and ask the owner to run
  `! ./test validate browser`.
- [ ] `git log --oneline <the tip Task 35a landed>..HEAD`:
  eleven commits, each one line, about 50 characters,
  with both trailers; none mixes a rename with content
  (25a touches only the parameter's name).
- [ ] Report: the commit count (eleven; forty-four in
  all), and anything a task flagged instead of forcing.
- [ ] Do NOT merge. Wait for the owner's word, then:
  `git -C .worktrees/membership-and-versions merge
  --ff-only work-order-events-follow-ups`; if it fails
  because `membership-and-versions` moved, stop and ask
  (never rebase without the owner's word). Then
  `git worktree remove .worktrees/work-order-events-
  follow-ups && git branch -d work-order-events-
  follow-ups`. Never `-D`.

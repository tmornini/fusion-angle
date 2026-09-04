# Critical functionality path — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this spec's worktree (AGENTS.md
> § Worktrees).

> **For the dispatching orchestrator (AGENTS.md § Subagents):**
> every subagent prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then push down: the 78-char lint on
> code/scripts (not `.md`), 4-space indent, no inline styles
> (CSS custom properties + classes per DESIGN-SYSTEM.md), the
> `org` identifier ban (never `orgId`/`myOrg`-style camelCase —
> spell `organization`), present-tense-imperative ~50-char
> commit subjects with the mandated trailer, TDD at Layer 1
> (red before green in every commit that changes behavior),
> the Sin of Test Weakening (when test and code diverge, the
> code changes — except where THIS plan names a covenant the
> spec itself rewrote), the Sin of Unbidden Helper Code (each
> task's diff is its story — nothing more), the Sin of Default
> Values (Decision 4: absence is modeled at the call site,
> never `??`'d in a helper), and the codebase patterns named
> under "Context an implementer must know". Subagents work in
> this worktree and never create their own — never pass the
> Agent tool `isolation`. One worker at a time: every task
> commits into one branch.

**Goal:** Ship the seventeen `## Critical functionality path`
bullets TODO.md carries — the remint behind the refresh
mutex, the signing key out of seed and wipe, replay and
lost-append answering 200, a fresh operation id per test
request, role keys required at the nested attribute gate,
re-init failures reaching the page error state, honest
absent profiles and no fabricated dimension scores, the last
admin seat guarded and every other seat removable from
member detail, a pausing toast, a no-op rename that leaves
history alone, the marquee rect always built, the seed
anchored to today, three pins that land green, and the docs
that leave with them — one concern per commit, each commit
removing its own TODO bullet.

**Architecture:** No schema change. One wire-contract change
(a replayed write answers 200 with the original ETag — the
same-body PUT shape the contract already speaks). Every
product change stays inside the files its bullet names or
their exact sibling (Decision 2). Behavior changes land
red-then-green at Layer 1; the three pins that land green
prove they can fail by a named mutation (Decision 8). The
membership-scoped profile leaves this path for the product
path as item 4 (Decision 1); the two bullets that waited on
it take their honest absent shapes now. Docs leave by the
Close protocol: the product-path item and the GPU move land
first, the narrowed bullets last.

**Tech Stack:** Deno 2.9.6, TypeScript strict under
`deno.json`, `Deno.test` + `@std/assert` + `@std/testing/time`
(`FakeTime`), the memory backend, the in-page HTTP facade,
the repo's own `./validate` gate. No new dependencies.

**Spec:**
`docs/superpowers/specs/2026-09-04-critical-functionality-path-design.md`

**Worktree:** `.worktrees/2026-09-04-critical-functionality-path`
on branch `2026-09-04-critical-functionality-path`, based on
master `cfafb32e`; the spec is its one commit (`fb421d74`).
This is the second run: the first was interrupted before any
execution commit, so the branch holds exactly the spec commit
and every task below starts from it. Every line number below
is at `cfafb32e` unless a task says otherwise — earlier tasks
in the same file shift later ones, so locate by the quoted
text, not the number.

## Global Constraints

- Lint: 78-char max line on code and scripts (NOT `.md`);
  4-space indent; trailing newline; no trailing whitespace.
- Identifier ban: no camelCase `org` abbreviation
  (`org[A-Z]`, `xOrg…`, `Org[A-Z]` forms). Spell
  `organization`. (`api/routes.ts` already carries a few
  `org` locals; do not add any, do not rename existing ones.)
- Commits: one concern each; subject ≈50 chars,
  present-tense imperative, no body prose; end every commit
  message with exactly these two trailer lines:

  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
  ```

- `./validate` must be green before every commit. Under the
  Claude Code sandbox: `export DENO_DIR="$TMPDIR/deno-dir"`
  first (AGENTS.md). It runs `deno check --frozen api shared
  server tests web-app`, `./test` (UTC pass on
  `tests/*.test.ts`, Honolulu pass on `tests/tz/*.test.ts`),
  the 78-char lint, the `org` ban, `generate-schema-svg
  --check`, `generate-api-documentation --check`.
- Layer 2 (`./test-browser`) is NOT in `./validate`. Task 24
  must keep `tests/browser/toasts.test.ts` green; run
  `./test-browser` before that commit and `./test-all` before
  the fast-forward. It needs Chrome (`CHROME` or
  `CHROME_DEBUG_URL`); if Chrome cannot launch in the sandbox,
  say so in the task report and do NOT claim Layer 2 green.
- Scope rule (spec § Decisions 2): an item touches only the
  files its bullet names or their exact sibling; no
  re-wrapping, re-formatting, or comment-tidying outside the
  lines a task changes.
- TODO.md Close protocol: each product commit removes its own
  `## Critical functionality path` bullet, or its clause of a
  shared one, in the SAME commit. Line-number drift in bullets
  that stay is not corrected (Task 29 narrows two, nothing
  else moves).
- Red before green: every task that changes behavior runs its
  new or extended test and shows the failure BEFORE the
  product edit. Where the spec rewrote a covenant (a replay
  answers 200; role keys are required), the OLD test's
  assertion is the thing that was wrong and this plan names
  the exact rewrite — that is Beck's "delete the test because
  the covenant was wrong", never a weakening.
- Tests never import `TEST_OPERATION_ID`. Tasks 1-10 may
  still see it in the tree; a NEW test written by any task
  calls `apiRequest({...})` without `operationId` (it mints)
  or passes its own `generateIdentifier()`. Task 11 deletes
  the export; nothing may reintroduce it.
- Counts are MEASURED: the seed pins (`1453` message pairs,
  `92` actual documents) must stay green unchanged through
  Task 13 and Task 28; a red pin there means the product edit
  is wrong, not the pin.
- Root-doc ceilings: TODO.md and TEST-PLAN.md are exempt;
  API.md, ARCHITECTURE.md, and AGENTS.md change one passage
  each (Tasks 8, 23, 3).
- Nothing under `web-app/app/*.ts` may read `process` or
  `Deno.*` — the browser is what catches it (AGENTS.md).

## Measured against the spec (read at `cfafb32e`)

The spec was read against source before this plan was
written. These findings change a task's shape; each is applied
at its task:

- **Two more tests pin the very stamping item 8 removes.**
  `tests/validators-attribute-acl.test.ts` (three "create …
  stamps" tests at `:34-84`) and
  `tests/api-nested-attributes.test.ts:174-210` ('PUT create
  no ACL keys → 200; GET shows stamped
  DEFAULT_ATTRIBUTE_ACL_ROLES') assert the covenant Decision 6
  rewrites. Task 13 rewrites them to the required-keys
  covenant (absence → 400 / `ValidationError`); their
  presence is the spec's own red, not a regression.
- **Create and replace become one validator.** Once both
  keys are required on create, `validateAttributeDocument`'s
  two modes are byte-identical, and the nested PUT's
  `hasHead` read (`api/routes.ts:5304-5310`) exists only to
  pick between them. Task 13 collapses to one exported
  `validateAttributeDocument(body)` and deletes the
  `hasHead` derive; `nestedAttributeWireOf`'s branch at
  `:1041-1043` collapses the same way. Two names for one
  function would be a Uniformity sin; a dead derive an
  Obscurity one.
- **The replay assertion lives in twelve places, not ten.**
  Beyond the spec's ten files, `tests/store-acceptance.ts:
  226-249` ('exact retry keeps status') asserts 201 on the
  resend, and `tests/api-record-attribute-document.test.ts:
  552-589` compares the two `Response` objects with
  `assertEquals(first, second)` — a status flip fails it.
  Task 8 flips both. The sweep in Task 8 Step 4 catches any
  thirteenth.
- **The byte-identity list has an eighteenth file.**
  `tests/api-record-attribute-document.test.ts:571-572`
  passes `[['operation-id', TEST_OPERATION_ID]]` by hand to
  both PUTs. Task 10 gives it a minted shared id like the
  other twenty.
- **127 files import the shared id, not 121.** The sweep is
  mechanical either way; Task 11's grep is the count that
  matters, and it must end at zero.
- **The remint race is not deterministic under
  `Promise.all`.** The memory backend serializes
  transactions, so whether the facade's refresh is still in
  flight when the remint reads the stored credential is an
  interleaving accident. Task 7 therefore carries two kinds
  of pin: a deterministic one in
  `tests/adapters-invitations.test.ts` that latches the mutex
  with a refresh the test releases by hand (red on the
  parent: the remint POSTs while the flight is open), and the
  spec's race in `tests/adapters-shared-recovery.test.ts` as
  the covenant (green or red as the interleaving falls; the
  task records which).
- **The remint check needs the accepted organization.**
  "`principalFromToken` must list the accepted organization"
  needs its id; the adapter has only the invitation id.
  `postInvitationAcceptance` gains a third parameter,
  `organizationId`; its one caller
  (`web-app/invitations/index.ts:76`) already holds the
  invitation row (`organizationId`). The two existing remint
  tests stub the grant with the literal `'reminted-access'`,
  which is not a JWT; they now return a real
  `reachableToken(…)` listing Wayne.
- **`tests/api-membership-liveness.test.ts` deletes the only
  admin seat.** `adminDb()` seeds the root admin alone and two
  tests delete that seat (`:76-101`). Under Task 20's guard
  that is a 409. Its fixture gains a second admin seat; the
  assertions do not move (spec § Hazards).
- **The page cannot be driven at Layer 1 for item 19's
  third pin.** `commit()` and `pageState` are module-private
  in `web-app/flows/detail.ts`; the "flows-detail-shortcuts
  harness" is the precedent of a pure reducer exported from
  the page (`reduceDesignerShortcut`). Task 26 exports
  `commitDebouncedEdit(held, next, commitEdit)` — tell, don't
  ask: the continuation runs only when `next !== held` — and
  the three debounced sites call it. No result type, no
  debouncer cancel, no existence check at fire.
- **Item 22's root set is twenty non-markdown files, not
  nineteen** (`ls -p | grep -v /` less `.md`, plus
  `.dockerignore`). The test enumerates the directory rather
  than a list, so the count never drifts.
- **`buildFlowPutBody` lives at
  `web-app/app/adapters/flow-mutations.ts:394-434`**, and
  `commit()`'s history advance is `web-app/flows/detail.ts:
  235-237`. Same code, corrected cites.
- **The seed anchor pin lands green today** (81 days from
  the anchor, inside the ninety-day window). It is red from
  2026-09-13. Task 28 proves failability by the named
  mutation (an anchor 120 days back).
- **Item 7's "pair count grows by two" cannot hold for a
  document PUT.** A same-body PUT answers 200 without
  appending by design (API.md's ladder, `api/api.ts:
  1418-1428`), whatever its operation id, so two identical
  PUTs leave one pair under a shared id AND under fresh
  ones. The covenant the item states — a fresh id per
  request defeats the request-hash dedupe — needs a write
  the ledger would otherwise serve: an instance CREATE over
  a live instance is 409 when it reaches the domain and a
  replayed 201/200 when it does not. Task 12 pins that.

## Dependency graph

Task numbers are the spec's commit numbers (Task N = commit
N). Task 0 commits this plan. An arrow reads "must land
before". Tasks with no incoming arrow may run in any order
relative to each other; **execution is serial** — one worker,
one worktree, one branch (AGENTS.md) — so the graph decides
what to dispatch next and what a failure blocks, never
parallel commits.

```
Task 0 (plan)
  ├── 1 (profile → product path)   ┐ docs, either order,
  ├── 2 (GPU note → Later work)    ┘ before everything
  ├── 3 (wrappers exec deno pin)
  ├── 4 (constraint picker pin)
  ├── 5 (key out of wipe) ── 6 (key out of seed)
  ├── 7 (remint behind in-flight refresh)
  ├── 8 (replay → 200) ─┬─ 9 (lost append → 200)
  │                     └─ 10 (explicit shared ids)
  │                            └─ 11 (fresh id per request)
  │                                   └─ 12 (append pin)
  ├── 13 (role keys required)
  ├── 14 (re-init → error state) ── 15 (silent-subscribe pin)
  ├── 16 (absent profile)
  ├── 17 (extract create draft) ── 18 (no fabricated scores)
  ├── 19 (empty working-styles note)
  ├── 20 (last-admin guard) ── 21 (seat adapter)
  │                               └── 22 (Remove on detail)
  │                                      └── 23 (page wiring)
  ├── 24 (toast pause)
  ├── 25 (rename miss leaves history) ── 26 (skip no-op commit)
  ├── 27 (marquee rect always)
  └── 28 (seed anchor)
                     29 (narrow the leftover bullets) — LAST
```

Edges the spec states: 1, 2 first; 8 → 9; 8 → 10 → 11 → 12;
14 → 15; 17 → 18; 20 → 21 → 22 → 23; 25 → 26; 29 last. Edges
this plan adds: 5 → 6 (one wrapper pin file each, same
shape — 6 reads 5's diff); 0 before all. Task 13 is
independent of 8-12 but shares
`tests/api-instances-create.test.ts` with 10 and 11 — land
13 either before 10 or after 11 to keep each diff its own
story. Task 11 rewrites 127 files; every task after it must
leave `grep -rn TEST_OPERATION_ID tests/` empty.

Recommended dispatch order (a topological sort that keeps
each file's edits contiguous): 0, 1, 2, 3, 4, 5, 6, 7, 13, 8,
9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
25, 26, 27, 28, 29.

## Context an implementer must know (verified against source)

- **Run one test file:**

  ```bash
  export DENO_DIR="$TMPDIR/deno-dir"
  export JWT_HMAC_SIGNING_KEY=test-hmac-signing-key
  TZ=UTC deno test --frozen --no-check \
      --sanitize-ops --sanitize-resources \
      --allow-env --allow-read --allow-write \
      --allow-net \
      --allow-run=deno,./serve,./crank,sh,./validate \
      --preload ./tests/hmac-test-key.ts \
      --preload ./tests/local-storage-stub.ts \
      --preload ./tests/session-storage-stub.ts \
      --filter 'SUBSTRING' \
      tests/FILE.test.ts
  ```

  `./test` is the two-pass whole suite; `./validate` wraps it.
  A `--filter` narrows to tests whose name contains the
  substring. `--no-check` means a type error shows up only in
  `deno check` — run `./validate` before every commit.
- **The write gate** (`api/api.ts`): `formWriteMessagePair`
  (`:934-969`) hashes the whole request wire, Operation-ID
  header folded in (`api/message-pair.ts:192-231`), and mints
  the pair id (`:214`). The pre-transaction fast path
  (`:982-1030`) serves a stored pair by `requestHash` through
  `sendWriteResponse(replay, method, appended)`
  (`message-pair.ts:609-623`: DELETE → 204, `appended` →
  201, else 200). The post-transaction lookup (`:1661-1677`)
  re-reads the pair by hash and sends it. `appendMessagePair`
  (`message-pair.ts:689-700`) is the in-transaction append:
  it skips silently when a pair with the same hash already
  exists and returns void. The same-body PUT site passes
  `false` at `api/api.ts:1424-1426`.
- **Test request shape:** `apiRequest({ method, path, token,
  body, operationId?, headers? })` (`tests/http-fixtures.ts:
  36-68`) mints a fresh `operation-id` header for any
  non-GET/HEAD when `operationId` is omitted and no
  `operation-id` header is given. Every `req()` helper today
  pins `operationId: TEST_OPERATION_ID`.
- **Attribute ACL:** `validateAttributeDocument(body, mode)`
  (`api/validators.ts:2976-3054`) admits `read_roles` /
  `write_roles` as optional on `'create'`
  (`NESTED_ATTRIBUTE_CORE_KEYS` + `NESTED_ATTRIBUTE_ACL_KEYS`
  as the optional set) and stamps `DEFAULT_ATTRIBUTE_ACL_ROLES`
  (`api/types.ts:42`, `['member', 'admin']`); `'replace'`
  requires both (`NESTED_ATTRIBUTE_DOCUMENT_BODY_KEYS`). The
  nested PUT (`api/routes.ts:5301-5327`) validates then
  appends the gate's pair formed from the RAW wire, so a
  keyless create stores no keys. `attributeSchemaOf`
  (`:978-1000`) synthesizes `[]` for a missing array;
  `rolesCanWrite` (`api/attribute-acl.ts:390-398`) then admits
  nobody but admin. `recordAttributeDocumentBodyOf`
  (`:832-856`) stamps defaults for the composed record-type
  create and the seed — unchanged. `pickStringArray(body,
  key)` (`validators.ts:555`) throws when the key is absent;
  `pickString` is already imported in `routes.ts:87`.
- **Channels:** `subscribeOnce(subscribe, fn)`
  (`web-app/app/channels.ts:146-154`) runs `void fn()` inside
  the first bell; four pages pass `init` from
  `emptyState.onEmpty`. `loadInto` (`loading-states.ts:
  210-272`) owns fetch failures (error state + Try Again →
  `cfg.retry`); faults outside its `try` — `$required`
  (`ideas/index.ts:43-45` runs before `loadInto`),
  `sessionContext()`, the `onData` renderers — escape.
  `handlePageLoadError(pageName, err)` (`page-loader.ts:
  41-79`) bounces `UnauthorizedError` to login, logs, renders
  `buildErrorState(…, 'Try Again')` into `.page-content` or
  `#page-root`, and wires `location.reload()`. `PAGE_REGISTRY`
  loads pages by dynamic `import()`, so a page importing
  `page-loader.ts` is not a cycle.
- **The ideas-empty-subscribe shape**
  (`tests/ideas-empty-subscribe.test.ts`): stub `window`,
  `MutationObserver`, `document` on `globalThis` BEFORE any
  web-app import (the module graph reads theme/session state
  at load); `await import('./in-page-facade.ts')` registers
  the in-process HTTP facade; `initAdapter(() => db)` then
  `putSessionToken(await organizationToken())`;
  `document.querySelector` serves element stubs by selector;
  a cross-tab bell is `new BroadcastChannel('fusion-angle:
  data').postMessage({ kind: 'full' })`; wait on a condition
  with a deadline; `deleteNotificationChannel()` and
  `delete` every stub in `finally`. `unhandledrejection` is
  captured on `globalThis` with `preventDefault()`
  (`tests/command-palette-init.test.ts:42-72`).
- **Members:** `HumanMember(parent, profile, pii)`
  (`api/types.ts:699-760`); `HumanProfile` is `{ present:
  true, title, department, strengths, team_dimensions } |
  { present: false }` (`:688-697`) and every consumer
  branches on `present`. `getHumanMemberMap`
  (`web-app/app/adapters/members.ts:113-134`) reads the seats
  collection (`MembershipEntity[]`, each with `identity_id`
  and `type: 'admin' | 'member'`) and builds rows with
  `emptyPersonProfile()` (`:48-56`, the `present: true`
  fiction) — sites `:105` and `:127`. `postHumanMemberCreation`
  (`:222-248`) takes a `HumanMemberDraft` (`:39-46`).
  `ctx.DELETE(resource)` exists (`adapters/shared.ts:146`);
  `deleteIdentityPii` (`adapters/identities.ts:169-175`) is
  the shape: DELETE then `notify()`.
- **Member detail:** `HumanMemberDetailPresenter(member)`
  (`presenters/human-member-detail.ts:531-584`) renders a
  shell with `.member-title-slot`, `.member-actions-slot`,
  `.member-cards-slot` and fills them via `mutateSlot`;
  `buildReadonlyActionButtons()` (`:488-499`) is the Edit
  button. `web-app/members/detail.ts` holds page state in
  module-level `let`s (`state`, `pageContainer`), builds the
  presenter in `buildPresenter()`, and dispatches clicks on
  `data-member-action`. `web-app/members/detail.html` is one
  `<div id="member-detail-content">`. Dialogs
  (`web-app/app/dialog.ts`): `openDialog(id)` / `closeDialog(
  id)` act on `#<id>-dialog`; `handleDialogClick(target, e)`
  drives `data-dialog-open` / `data-dialog-cancel` and the
  backdrop click, returning true when the click was a dialog
  control. The alertdialog markup is
  `web-app/identities/detail.html:3-28`. `iconTrash` exists
  (`icons.ts:565`).
- **Seat DELETE:** `route(ORGANIZATION_MEMBER_DETAIL_PATTERN,
  { …, delete: (db, _p, _actor, messagePair) => db.transaction(
  MESSAGE_TABLES, async (view) => { if (messagePair !==
  undefined) await appendMessagePair(view, messagePair); }) })`
  (`api/routes.ts:5729-5748`). `DeleteHandler` receives
  `(adapter, params, actor, messagePair, organization, roles)`
  (`:636-643`). `deriveOrganizationMemberSeats(dbOrView,
  organization)` (`api/derive-memberships.ts:198-211`) yields
  `MembershipEntity[]` with `type`; it accepts a transaction
  view (the `membershipExistsFor` precedent, `:181-196`).
  `ApiError(message, status)` and `HTTP_CONFLICT` are both
  imported in `routes.ts` (`:134`, `:139`). The
  invitations-domain pattern (`api/invitations-domain.ts:
  668-691`) sets a flag inside the transaction and throws the
  `ApiError` after it — nothing but row ops awaits inside.
- **Session refresh:** `runSingleFlightRefresh(refresh)`
  (`web-app/app/adapters/session-refresh-mutex.ts:47-58`)
  latches `inFlight` synchronously and joins a second caller
  to it; `runLocked` (`:60-82`) returns a peer tab's
  broadcast token (`peerAccess`) without POSTing when one
  arrived. `postSessionRefresh(ctx, refreshToken)`
  (`adapters/session-refresh.ts:18-34`) POSTs the grant and
  returns `SessionCredentials`; `getSessionCredentials()` is
  `null` in cookie mode and for honest absence
  (`session-credentials.ts:51-67`). The remint
  (`adapters/invitations.ts:214-250`) calls
  `postSessionRefresh` bare. `principalFromToken(token)`
  (`shared/access-token-decode.ts`) yields `{ id, roles,
  name, organization?, organizations? }`. Token fixtures:
  `organizationToken(sub, organization)`,
  `reachableToken(sub, organizations)`, `expiredToken()`
  (`tests/token-fixtures.ts`).
- **Flow designer:** `withNodeNamed`, `withNodeTaskInstructions`,
  `withEdgeNamed` (`presenters/flow-designer.ts:808-888`) end
  in `#queueSave(next)` + `#noteMutation()` unconditionally;
  `applyUpdateNode` / `applyUpdateEdge`
  (`flow-designer-actions.ts:196-217`) are bare `map`s. The
  no-op idiom is `return this.#snapshot;` (`:738, 741, 762,
  767`). `snapshot()` (`:462-464`) and `history()` (`:221-223`)
  are public. `FlowHistorySnapshot` is `{ hasUndoHistory,
  redoStack }`; `recordFlowMutation()` empties the redo stack;
  `appendToRedoStack(s, version)` grows it; `canRedoFlowEdits(s)`
  reads it (`web-app/app/flow-history.ts`). `commit(next,
  { advanceHistory })` (`flows/detail.ts:231-246`) advances
  history at `:235-237`; the three debounced sites are
  `:1375-1418`; the page's pure reducers
  (`reduceDesignerShortcut`, `isDesignerEditableTarget`) are
  exported at `:1971-2000` and tested in
  `tests/flows-detail-shortcuts.test.ts`.
- **Marquee:** `buildGraphSvg(nodes, edges, vbX, vbY, vbW,
  vbH, selection, isLocked, isConnecting, marqueeRect,
  edgeWaypoints, connectPreview)` (`flow-graph.ts:1267`)
  emits `.flow-marquee` only for a non-null rect
  (`:1369-1378`) and places it after `.flow-content`
  (`:1413`); `.flow-grid-bg`, `.flow-grid-dots`,
  `.flow-connect-preview` are unconditional. `mustFind`
  (`flow-gesture-render.ts:59-71`) throws on absence;
  `renderMarqueeFrame` (`:236-250`) returns before the lookup
  when there is no draw rect. CSS
  `pages-flow-detail.css:110-117` is unchanged.
- **Toast:** `paintToast` (`web-app/app/toast.ts:107-137`)
  creates the element via `document.createElement`, prepends
  it, and discards `setTimeout(closeToast, TOAST_DURATION_MS)`
  at `:136`; `makeToastCloser` (`:71-92`) is idempotent.
  `FakeTime` from `@std/testing/time` fakes `setTimeout`,
  `clearTimeout`, and `Date.now()`; `tests/debouncer.test.ts`
  is the shape (`using time = new FakeTime(); time.tick(ms)`).
- **Seed clock:** `api/mock-data/seed-kit.ts:24` `export
  const now = new Date('2026-06-15T00:00:00.000Z')`;
  `daysFromNow` (`:30-49`) and `dateOnly` (`:55-64`) compute
  in UTC from it. `getFlowStats(ctx, flowId, nowMs)`
  (`web-app/app/adapters/flow-stats.ts:23-30`) windows ninety
  days (`:69`); `tests/mock-data-lead-to-close.test.ts:32-46`
  is the seeded-stats shape (`seededMockDb()`, `deriveFlows(
  db, organization).find(f => f.name === …)`).
- **TEST-PLAN pin edits** keep the existing voice: a pin lists
  `tests/<file>.test.ts '<exact test name>' (decides …)`
  clauses separated by semicolons, then `exploratory — …` for
  what only the walk observes. Quote test names exactly as
  the `Deno.test(...)` string concatenation spells them.

---

### Task 0: Commit this plan

**Files:**
- Create: `docs/superpowers/plans/2026-09-04-critical-functionality-path.md`

- [ ] **Step 1: Commit the plan as written**

```bash
git add docs/superpowers/plans/2026-09-04-critical-functionality-path.md
git commit -m "$(cat <<'MSG'
Plan the critical functionality path

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

No `./validate` needed: markdown only.

---

### Task 1: Add the membership profile to the product path (spec item 26)

Docs only; independent of every other commit; lands first
(with Task 2, either order).

**Files:**
- Modify: `TODO.md` `## Critical product path` (`:6-182`),
  `## Sequencing` (`:1240-1254`), the identity-scoped
  spelling at `:1158-1160`

**Interfaces:** none.

- [ ] **Step 1: The header counts thirteen**

Replace `TODO.md:8`:

```
Twelve items, in this order — each its own brainstorm →
```

with:

```
Thirteen items, in this order — each its own brainstorm →
```

- [ ] **Step 2: Insert item 4 after item 3**

Item 3 ends at `:64` (`   (owner call).`). Insert directly
after it:

```
4. The membership profile — an organization-side profile
   per SEAT, so the identity "Tony Stark, CEO" holding a
   contractor seat elsewhere appears there as
   "contractor": the document shape (keys on the seat
   body, or a nested facet under the seat mirroring
   `identities/:id/pii` — the brainstorm decides), its
   validator, derive, seed, the roster and detail reads,
   and the Members page's edit. Replaces the
   one-profile-per-identity covenant at
   `api/types.ts:1301-1303`; the seed already carries the
   contradiction (the admin holds two seats with one
   title). Lands before items 7 and 8, whose designer
   roster and AI seats read it; the roster-profile and
   `DEFAULT_DIM` bullets took their honest absent shapes
   in the critical functionality path and this item
   replaces absence with the read.
```

- [ ] **Step 3: Renumber items 4-12 to 5-13 and fix their cross-references**

Change each list marker in place: `4. Cachability` → `5.
Cachability`, `5. `/status`` → `6.`, `6. Re-implement
workbox` → `7.`, `7. Headless AI worker` → `8.`, `8. Chats`
→ `9.`, `9. Genericity` → `10.`, `10. Production readiness`
→ `11.`, `11. Fewer JSON` → `12.`, `12. Simulated latency`
→ `13.`. Then the three in-text references:

In the `/status` item (now 6): `Item 10's health probe.` →
`Item 11's health probe.`

In the workbox item (now 7): `(consumes item 8)` →
`(consumes item 9)`.

In the production-readiness item (now 11): `Consumes item
5.` → `Consumes item 6.`

- [ ] **Step 4: Sequencing**

Replace `TODO.md:1242-1243`:

```
- 8 → 6 (the chat clause consumes chats)
- 5 → 10 (the health probe consumes `/status`)
```

with:

```
- 9 → 7 (the chat clause consumes chats)
- 6 → 11 (the health probe consumes `/status`)
```

Replace `:1248-1249`:

```
- The profile document precedes the roster-profile and
  `DEFAULT_DIM` bullets
```

with:

```
- Item 4 precedes routing the roster through the profile
```

- [ ] **Step 5: The Later-work spelling is membership-scoped**

Replace `TODO.md:1158-1160`:

```
- Profile as its own document,
  `identities/:id/profile`, 404 = no profile — closes
  whole-or-none — `tests/api-identity-document.test.ts`
```

with:

```
- Profile as its own document under the seat,
  `organizations/:id/members/:identity-id/profile`, 404 =
  no profile — closes whole-or-none — critical product
  path item 4; `tests/api-identity-document.test.ts`
```

- [ ] **Step 6: Verify the numbering is dense and the refs resolve**

```bash
sed -n '/^## Critical product path/,/^## Critical functionality path/p' TODO.md \
    | grep -nE "^[0-9]+\. " | cut -d: -f2 | cut -d. -f1 | tr '\n' ' '; echo
grep -n "Item 11's health probe\|consumes item 9\|Consumes item 6\|9 → 7\|6 → 11\|Item 4 precedes" TODO.md
```

Expected: `1 2 3 4 5 6 7 8 9 10 11 12 13` and five lines.

- [ ] **Step 7: Validate and commit**

```bash
./validate
git add TODO.md
git commit -m "$(cat <<'MSG'
Add the membership profile to the product path

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 2: Move the GPU note to Later work (spec item 25)

Docs only. A verbatim move — no content change in this
commit.

**Files:**
- Modify: `TODO.md` (`:265-273` leaves `## Critical
  functionality path`; the same nine lines land at the end
  of `## Later work`, before `## Sequencing`)

**Interfaces:** none.

- [ ] **Step 1: Cut the bullet**

Delete these nine lines from `## Critical functionality path`
verbatim:

```
- GPU flag in the Layer 2 launcher — `launchChrome`
  no longer passes `--disable-gpu` (cargo cult under
  `--headless=new`; it was required only by old
  headless on Windows). Its one real effect was
  forcing software compositing, which made runs more
  alike across machines. Dropped UNVERIFIED —
  `./test-browser` has run green on one machine
  (2026-08-28). Restore it if two machines disagree.
  Oracle: `./test-browser` green on two machines
```

- [ ] **Step 2: Paste it as the last bullet of `## Later work`**

Directly before the blank line that precedes `## Sequencing`,
append the same nine lines byte for byte.

- [ ] **Step 3: Verify the move**

```bash
grep -n "GPU flag in the Layer 2 launcher" TODO.md
```

Expected: exactly one hit, at a line greater than the
`## Later work` header's and less than `## Sequencing`'s.
`git diff --stat` shows `+9 -9` in TODO.md only.

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add TODO.md
git commit -m "$(cat <<'MSG'
Move the GPU note to Later work

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 3: Pin the operator wrappers to deno (spec item 22)

Lands green; failability by the named mutation.

**Files:**
- Create: `tests/root-scripts-exec-deno.test.ts`
- Modify: `AGENTS.md:52-53` (one clause), `TODO.md`
  (`:274-280` bullet removed)

**Interfaces:** none.

- [ ] **Step 1: Write the test**

`tests/root-scripts-exec-deno.test.ts`:

```ts
import { assertEquals } from '@std/assert';

// Every operator script at the repository root execs deno
// or a deno-compiled binary; none invokes node, npm, or
// npx. The set is read from the directory, never listed, so
// a wrapper added tomorrow is covered the day it lands.
// Markdown is prose about the runtimes and is exempt;
// directories are other pins' trees. A binary file (a null
// byte) is never decoded as text. The match is invocation-
// shaped: the word at a line start or after a shell
// separator, followed by whitespace — `npm:postgres` in the
// lock and `--exclude-unused-npm` in build are not
// invocations.
const INVOCATION = /(^|[\s|;&(])(node|npm|npx)\s/m;

function rootFiles(): string[] {
    const names: string[] = [];
    for (const entry of Deno.readDirSync('.')) {
        if (!entry.isFile) continue;
        if (entry.name.endsWith('.md')) continue;
        names.push(entry.name);
    }
    return names.sort();
}

function invokesNode(path: string): boolean {
    const buf = Deno.readFileSync(path);
    if (buf.includes(0)) {
        return false;
    }
    return INVOCATION.test(new TextDecoder().decode(buf));
}

Deno.test('no root script invokes node, npm, or npx', () => {
    const files = rootFiles();
    assertEquals(
        files.filter(invokesNode), [],
    );
    assertEquals(
        files.includes('postgres-lib')
        && files.includes('postgres-seed')
        && files.includes('postgres-wipe'),
        true,
        'the three postgres wrappers are in the walk',
    );
});
```

- [ ] **Step 2: Run it green, then prove it can fail**

Run the single-file command with
`tests/root-scripts-exec-deno.test.ts`. Expected: PASS.

Mutation: append one line `node x.js` to `serve`; re-run.
Expected: FAIL with `["serve"]` in the diff. Then
`git checkout serve` and re-run: PASS. Record both results
in the task report.

- [ ] **Step 3: AGENTS.md cites the pin**

Replace `AGENTS.md:52-53`:

```
the browser is the other, and runs the pages. No script
invokes `node` or `npm`; there is no `package.json` and no
```

with:

```
the browser is the other, and runs the pages. No script
invokes `node` or `npm` (pinned by
`tests/root-scripts-exec-deno.test.ts`); there is no
`package.json` and no
```

- [ ] **Step 4: Remove the TODO bullet**

Delete from `## Critical functionality path`:

```
- Nothing asserts that the operator wrappers exec `deno`
  rather than `node`; coverage today is a grep run by
  hand. `tests/fusion-angle-live-name.test.ts` already
  walks the same root-file list for forbidden strings, so
  the shape exists. Oracle: a test asserting no `node`
  invocation in `postgres-lib`, `postgres-seed`,
  `postgres-wipe`.
```

- [ ] **Step 5: Validate and commit**

```bash
./validate
git add tests/root-scripts-exec-deno.test.ts AGENTS.md TODO.md
git commit -m "$(cat <<'MSG'
Pin the operator wrappers to deno

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 4: Pin the constraint picker's kinds by type (spec item 23)

Lands green; failability by the named mutation. Removes no
TODO bullet — Task 29 rewrites the R6/R7 bullet.

**Files:**
- Modify: `tests/presenter-record-detail.test.ts` (imports
  `:1-6`; three tests appended)

**Interfaces:**
- Consumes: `allowedConstraintKinds(t: AttributeType):
  Constraint['kind'][]` and `RecordDetailEditPresenter(draft:
  RecordDetailDraft, pendingAttributeName: string).buildPage()`
  from `web-app/app/presenters/record-detail.ts:635-909`.

- [ ] **Step 1: Extend the imports**

Replace `tests/presenter-record-detail.test.ts:1-4`:

```ts
import { assertMatch, assertNotMatch } from '@std/assert';
import {
    RecordDetailPresenter,
} from '../web-app/app/presenters/record-detail.ts';
```

with:

```ts
import {
    assertEquals,
    assertMatch,
    assertNotMatch,
} from '@std/assert';
import {
    RecordDetailPresenter,
    RecordDetailEditPresenter,
    allowedConstraintKinds,
    type AttributeDraft,
} from '../web-app/app/presenters/record-detail.ts';
```

- [ ] **Step 2: Append the three pins**

At the end of the file:

```ts
function editPageWith(attribute: AttributeDraft): string {
    return new RecordDetailEditPresenter(
        {
            name: 'Account Review',
            description: 'Quarterly review subject',
            attributes: [attribute],
        },
        '',
    ).buildPage().toString();
}

Deno.test(
    'allowedConstraintKinds offers regex to text, the'
    + ' range pair to number and date, and nothing else',
    () => {
        assertEquals(allowedConstraintKinds('text'), ['regex']);
        assertEquals(
            allowedConstraintKinds('number'),
            ['range_min', 'range_max'],
        );
        assertEquals(
            allowedConstraintKinds('date'),
            ['range_min', 'range_max'],
        );
        assertEquals(allowedConstraintKinds('select'), []);
        assertEquals(allowedConstraintKinds('radio'), []);
        assertEquals(allowedConstraintKinds('checkbox'), []);
    },
);

Deno.test(
    'a text attribute already holding a regex still'
    + ' offers regex in the picker',
    () => {
        const page = editPageWith({
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            name: 'Code',
            attributeType: 'text',
            sortOrder: 0,
            options: [],
            constraints: [
                { kind: 'regex', pattern: '^[A-Z]+$' },
            ],
        });
        assertMatch(page, /data-action="constraint-kind"/);
        assertMatch(page, /<option\s+value="regex"/);
    },
);

Deno.test(
    'a select attribute renders no constraint picker',
    () => {
        const page = editPageWith({
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            name: 'Tier',
            attributeType: 'select',
            sortOrder: 0,
            options: ['Gold', 'Silver'],
            constraints: [],
        });
        assertNotMatch(page, /data-action="constraint-kind"/);
    },
);
```

- [ ] **Step 3: Run green, then prove failability**

Single-file run on `tests/presenter-record-detail.test.ts`.
Expected: PASS (3 new).

Mutation: in `record-detail.ts:904` change `if (t === 'text')
return ['regex'];` to `if (t === 'text') return [];`; re-run.
Expected: the first and second new tests FAIL. Revert with
`git checkout web-app/app/presenters/record-detail.ts`;
re-run: PASS. Record both in the report.

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add tests/presenter-record-detail.test.ts
git commit -m "$(cat <<'MSG'
Pin the constraint picker's kinds by type

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 5: Drop the signing key from the wipe allow-env (spec item 2, wipe half)

**Files:**
- Modify: `postgres-wipe:109`
- Modify: `tests/postgres-wipe.test.ts` (one test appended;
  its `@std/assert` import gains `assertMatch`,
  `assertNotMatch` if absent)
- Modify: `TODO.md` (`:190-192`, one clause)

**Interfaces:** none.

- [ ] **Step 1: Write the failing pin**

Append to `tests/postgres-wipe.test.ts` (add `assertMatch`
and `assertNotMatch` to its `@std/assert` import if they are
not already there):

```ts
// The wipe drops tables; it mints and verifies nothing, so
// the signing key has no reader in its module graph. A
// narrowed allow-env fails loud under deno run (NotCapable
// through access-token.ts's optional chain), never silent.
Deno.test('the wipe wrapper runs without the signing key',
() => {
    const src = Deno.readTextFileSync('postgres-wipe');
    assertMatch(src, /--allow-env=POSTGRES_URL,/);
    assertNotMatch(src, /JWT_HMAC_SIGNING_KEY/);
});
```

- [ ] **Step 2: Run it red**

Single-file run on `tests/postgres-wipe.test.ts --filter
'without the signing key'`. Expected: FAIL (the source still
names the key).

- [ ] **Step 3: Narrow the allow-env**

Replace `postgres-wipe:109`:

```
PGTARGET_SESSION_ATTRS,PGAPPNAME,PGTARGETSESSIONATTRS,JWT_HMAC_SIGNING_KEY \
```

with:

```
PGTARGET_SESSION_ATTRS,PGAPPNAME,PGTARGETSESSIONATTRS \
```

Touch no `PG*` name.

- [ ] **Step 4: Run it green**

Same command. Expected: PASS. `grep -n JWT postgres-wipe`
prints nothing.

- [ ] **Step 5: Strike the wipe clause from the TODO bullet**

In `## Critical functionality path`, replace:

```
- `JWT_HMAC_SIGNING_KEY` may not belong in the local
  seed/wipe `--allow-env` (`postgres-seed:168`,
  `postgres-wipe:109`). `api/access-token.ts` IS in the
```

with:

```
- `JWT_HMAC_SIGNING_KEY` may not belong in the local
  seed `--allow-env` (`postgres-seed:168`).
  `api/access-token.ts` IS in the
```

- [ ] **Step 6: Validate and commit**

```bash
./validate
git add postgres-wipe tests/postgres-wipe.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Drop the signing key from the wipe allow-env

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 6: Drop the signing key from the seed allow-env (spec item 2, seed half)

**Files:**
- Modify: `postgres-seed:168`
- Modify: `tests/pg-seed.test.ts` (two tests appended)
- Modify: `TODO.md` (the bullet at `:190-202` deleted)

**Interfaces:**
- Consumes: `seedPostgres(sql, adapter, mode, options)`
  (`server/seed.ts:184`), `fakeClient(rows)` and
  `testHashPassword` already in the file.

- [ ] **Step 1: Write the seed's oracle and the source pin**

Append to `tests/pg-seed.test.ts`:

```ts
// The seed's oracle: neither mode reads the environment.
// A Deno.test permission set denies what it omits, so
// `env: false` is the whole environment gone; the memory
// path does no I/O, and access-token.ts's signingKey()
// memoizes only when something mints — nothing here does,
// so a key read cannot be masked by an earlier test.
Deno.test({
    name: 'seedPostgres needs no environment in either mode',
    permissions: { env: false },
    fn: async () => {
        for (const mode of ['bootstrap', 'mock-data'] as const) {
            const db = memoryDbAdapter();
            const empty = fakeClient([{
                message_pairs: false,
                marker: false,
            }]);
            await seedPostgres(
                empty.sql, db, mode, {
                    hashPassword: testHashPassword,
                    write: () => {},
                },
            );
            assertStrictEquals(await db.hasSchema(), true);
        }
    },
});

Deno.test('the seed wrapper runs without the signing key',
() => {
    const src = Deno.readTextFileSync('postgres-seed');
    assertMatch(src, /--allow-env=POSTGRES_URL,/);
    assertNotMatch(src, /JWT_HMAC_SIGNING_KEY/);
});
```

- [ ] **Step 2: Run: the oracle is green, the source pin red**

Single-file run on `tests/pg-seed.test.ts`. Expected: the
`permissions` test PASSES (the seed never read the key — that
is the measurement the bullet asked for); the source pin
FAILS. If the `permissions` test fails with `NotCapable`,
STOP: the seed reads the environment somewhere, the bullet's
premise is false, and the task report says where the read is
(the stack names it).

Failability of the green oracle: temporarily insert
`Deno.env.get('JWT_HMAC_SIGNING_KEY');` as the first line of
`seedPostgres` in `server/seed.ts`; re-run. Expected: FAIL
with `NotCapable`. `git checkout server/seed.ts`; re-run:
PASS. Record it.

- [ ] **Step 3: Narrow the allow-env**

Replace `postgres-seed:168`:

```
PGTARGET_SESSION_ATTRS,PGAPPNAME,PGTARGETSESSIONATTRS,JWT_HMAC_SIGNING_KEY \
```

with:

```
PGTARGET_SESSION_ATTRS,PGAPPNAME,PGTARGETSESSIONATTRS \
```

`build:97-101` keeps the key — one binary serves.

- [ ] **Step 4: Run green**

Same command. Expected: PASS.

- [ ] **Step 5: Delete the TODO bullet**

Delete the whole bullet that begins
``- `JWT_HMAC_SIGNING_KEY` may not belong in the local``
(as rewritten by Task 5) through
``  --bootstrap` that never reads it.``.

- [ ] **Step 6: Validate and commit**

```bash
./validate
git add postgres-seed tests/pg-seed.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Drop the signing key from the seed allow-env

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 7: Serialize the remint behind in-flight refreshes (spec item 1)

**Files:**
- Modify: `web-app/app/adapters/session-refresh-mutex.ts`
  (one export added after `runSingleFlightRefresh`)
- Modify: `web-app/app/adapters/invitations.ts` (imports;
  `postInvitationAcceptance` `:198-215`;
  `remintSessionClaims` and `postRemintRefresh` `:217-250`)
- Modify: `web-app/invitations/index.ts:74-78` (the caller)
- Modify: `tests/adapters-invitations.test.ts` (imports; the
  two remint tests `:826-923`; three tests appended)
- Modify: `tests/adapters-shared-recovery.test.ts` (imports;
  one test appended)
- Modify: `TODO.md` (`:187-189` deleted)

**Interfaces:**
- Produces: `runRefreshAfterInFlight(refresh: () =>
  Promise<string | null>): Promise<string | null>` in
  `session-refresh-mutex.ts`; `postInvitationAcceptance(ctx,
  id, organizationId: Id)` — the third parameter is new.

- [ ] **Step 1: Write the deterministic pin (red)**

In `tests/adapters-invitations.test.ts`, extend the imports:

```ts
import {
    organizationToken,
    reachableToken,
} from './token-fixtures.ts';
```

(replacing the bare `organizationToken` import at `:38`),
and add:

```ts
import {
    runSingleFlightRefresh,
    deleteRefreshChannel,
} from '../web-app/app/adapters/session-refresh-mutex.ts';
```

Append this test:

```ts
// The remint FOLLOWS an in-flight facade refresh. Latch the
// mutex with a grant only the test can settle, start the
// accept, and prove the remint has not presented a jti
// while the flight is open; settle, and it runs once.
Deno.test('the remint waits for an in-flight facade refresh',
() => withLocalStorageAsync(freshStorage(), async () => {
    setCookieSession(true);
    try {
        const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        await postInvitationGrant(tony, 'sarah@x.com');
        const inv = (await deriveInvitations(db))[0]!;
        const sarah = await ctxOn(db
            , 'toccYYkLEABmlbpHJalgtQ', 'AjdvjuECVZEgZoFajaIEkg');
        const minted = await reachableToken(
            'toccYYkLEABmlbpHJalgtQ',
            ['AjdvjuECVZEgZoFajaIEkg', 'BBjWJsjYIDkTRKIIPrzWRw'],
        );
        let settleFacade!: () => void;
        const facadeFlight = runSingleFlightRefresh(
            () => new Promise<string | null>((resolve) => {
                settleFacade = () => resolve(minted);
            }),
        );
        const refreshBodies: unknown[] = [];
        const recording: RequestContext = {
            ...sarah,
            POST: async <T>(
                resource: string,
                body: Record<string, unknown>,
            ): Promise<T> => {
                if (resource === 'authentication/token') {
                    refreshBodies.push(body);
                    return {
                        access_token: minted,
                        token_type: 'Bearer',
                        expires_in: 900,
                    } as T;
                }
                return sarah.POST(resource, body);
            },
        };
        const accepting = postInvitationAcceptance(
            recording, inv.id, 'BBjWJsjYIDkTRKIIPrzWRw',
        );
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setImmediate(r));
        }
        assertStrictEquals(
            refreshBodies.length, 0,
            'the remint must not present a jti while a'
            + ' refresh is in flight',
        );
        settleFacade();
        await facadeFlight;
        await accepting;
        assertStrictEquals(refreshBodies.length, 1);
        assertStrictEquals(getSessionToken(), minted);
    } finally {
        setCookieSession(false);
        deleteSessionToken();
        deleteRefreshChannel();
    }
}));
```

- [ ] **Step 2: Run it red**

Single-file run on `tests/adapters-invitations.test.ts
--filter 'waits for an in-flight'`. Expected: FAIL — a type
error at `deno check` (three arguments to
`postInvitationAcceptance`) is the compile-time red; with
`--no-check` the runtime red is `refreshBodies.length` being
1 at the first assertion. Either is the failure this task
fixes; record which you saw.

- [ ] **Step 3: The mutex gains a follow-the-flight export**

In `web-app/app/adapters/session-refresh-mutex.ts`, after
`runSingleFlightRefresh` (`:47-58`) add:

```ts
// A refresh that FOLLOWS any in-flight refresh instead of
// joining it. The remint after an invitation accept bakes
// roles from a seat the joined flight may predate, and two
// callers presenting one refresh jti brand the loser a
// replay and revoke the chain. Wait for the flight to
// settle either way — its outcome is the joiners' to
// handle — then latch a flight of our own, so a 401 that
// lands meanwhile joins THIS one.
export async function runRefreshAfterInFlight(
    refresh: () => Promise<string | null>,
): Promise<string | null> {
    if (inFlight !== null) {
        await Promise.allSettled([inFlight]);
    }
    return runSingleFlightRefresh(refresh);
}
```

- [ ] **Step 4: The remint rides it**

In `web-app/app/adapters/invitations.ts`, extend the imports:

```ts
import { postSessionRefresh } from './session-refresh.ts';
import {
    runRefreshAfterInFlight,
} from './session-refresh-mutex.ts';
import { putSessionToken } from './session-token.ts';
import {
    principalFromToken,
} from '../../../shared/access-token-decode.ts';
```

Replace `postInvitationAcceptance` through the end of
`postRemintRefresh` (`:192-250`) with:

```ts
// Accept an invitation — the server writes the membership in the
// invitation's org (type:"member") and appends 'accepted' in one
// atomic batch. Then remint via the refresh grant so the access
// token gains the new member:O claim (roles bake only at mint).
// The committed seat's bell rings either way.
export async function postInvitationAcceptance(
    ctx: RequestContext,
    id: Id,
    organizationId: Id,
): Promise<void> {
    await ctx.PUT(
        'identities/' + ctx.identity.id
            + '/invitations/' + id,
        {
            state: 'accepted',
            membershipId: generateIdentifier(),
            eventId: generateIdentifier(),
            at: nowUtc(),
        },
    );
    try {
        await remintSessionClaims(ctx, organizationId);
    } finally {
        invitationChanges.notify();
    }
}

// Re-bake access-token roles from live memberships. The grant
// rides AFTER any in-flight facade refresh — one jti presented
// twice is replay, and replay revokes the chain — and the token
// it yields must list the accepted organization: a peer tab's
// broadcast can serve the mutex a token minted before the seat.
// One more grant, then a named failure. Two attempts, no loop.
// A refresh that fails after the accept committed is named,
// never swallowed — the page renders it. A 401 is the
// recovery layer's to recover.
async function remintSessionClaims(
    ctx: RequestContext,
    organizationId: Id,
): Promise<void> {
    if (!isCookieSession() && getSessionCredentials() === null) {
        return;
    }
    const first = await postRemintRefresh(ctx);
    if (listsOrganization(first, organizationId)) {
        return;
    }
    const second = await postRemintRefresh(ctx);
    if (listsOrganization(second, organizationId)) {
        return;
    }
    throw new SessionRemintFailedError(new Error(
        'the re-minted token does not list ' + organizationId,
    ));
}

function listsOrganization(
    accessToken: string,
    organizationId: Id,
): boolean {
    const principal = principalFromToken(accessToken);
    if (principal.organization === organizationId) {
        return true;
    }
    return principal.organizations !== undefined
        && principal.organizations.includes(organizationId);
}

// The one try: it wraps only the refresh grant. The stored
// refresh token is read INSIDE the flight, after any earlier
// flight has rotated it.
async function postRemintRefresh(
    ctx: RequestContext,
): Promise<string> {
    let access: string | null;
    try {
        access = await runRefreshAfterInFlight(async () => {
            const creds = await postSessionRefresh(
                ctx, storedRefreshToken(),
            );
            putSessionCredentials(creds);
            return creds.accessToken;
        });
    } catch (err) {
        throw new SessionRemintFailedError(err);
    }
    if (access === null) {
        throw new SessionRemintFailedError(new Error(
            'the refresh grant yielded no access token',
        ));
    }
    putSessionToken(access);
    return access;
}

function storedRefreshToken(): string {
    if (isCookieSession()) {
        return '';
    }
    const stored = getSessionCredentials();
    if (stored === null) {
        throw new Error('no session credentials to re-mint');
    }
    return stored.refreshToken;
}
```

- [ ] **Step 5: The page passes the invitation's organization**

Replace `web-app/invitations/index.ts:74-78`:

```ts
        if (action === 'accept') {
            await postInvitationAcceptance(
                sessionContext(), id);
            showToast('Invitation accepted', 'success');
```

with:

```ts
        if (action === 'accept') {
            const invitation = pending.find(
                inv => inv.id === id,
            );
            if (invitation === undefined) return;
            await postInvitationAcceptance(
                sessionContext(), id,
                invitation.organizationId,
            );
            showToast('Invitation accepted', 'success');
```

(`pending` is the page's pending-invitation list, each row
carrying `id` and `organizationId` — confirm the field name
at `web-app/app/adapters/invitations.ts:50` before editing.)

- [ ] **Step 6: The two existing remint tests speak the new covenant**

In `tests/adapters-invitations.test.ts` `'cookie-session
accept remints via refresh POST'` (`:826-868`):

- before `const refreshBodies`, add
  ```ts
        const minted = await reachableToken(
            'toccYYkLEABmlbpHJalgtQ',
            ['AjdvjuECVZEgZoFajaIEkg', 'BBjWJsjYIDkTRKIIPrzWRw'],
        );
  ```
- `access_token: 'reminted-access',` → `access_token: minted,`
- `await postInvitationAcceptance(recording, inv.id);` →
  `await postInvitationAcceptance(recording, inv.id,
  'BBjWJsjYIDkTRKIIPrzWRw');`
- `assertStrictEquals(getSessionToken(), 'reminted-access');`
  → `assertStrictEquals(getSessionToken(), minted);`
- the `finally` gains `deleteRefreshChannel();` after
  `deleteSessionToken();`.

In `'a failed re-mint after accept surfaces, seat kept'`
(`:870-923`): the accept call gains the third argument
`'BBjWJsjYIDkTRKIIPrzWRw'`; the `finally` gains
`deleteRefreshChannel();`.

- [ ] **Step 7: Pin the two attempts**

Append to `tests/adapters-invitations.test.ts`:

```ts
// A peer tab's broadcast can hand the mutex a token minted
// before the seat: the remint runs once more, then stops.
Deno.test('a re-minted token without the seat earns one more'
+ ' attempt',
() => withLocalStorageAsync(freshStorage(), async () => {
    setCookieSession(true);
    try {
        const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        await postInvitationGrant(tony, 'sarah@x.com');
        const inv = (await deriveInvitations(db))[0]!;
        const sarah = await ctxOn(db
            , 'toccYYkLEABmlbpHJalgtQ', 'AjdvjuECVZEgZoFajaIEkg');
        const stale = await reachableToken(
            'toccYYkLEABmlbpHJalgtQ', ['AjdvjuECVZEgZoFajaIEkg'],
        );
        const fresh = await reachableToken(
            'toccYYkLEABmlbpHJalgtQ',
            ['AjdvjuECVZEgZoFajaIEkg', 'BBjWJsjYIDkTRKIIPrzWRw'],
        );
        const tokens = [stale, fresh];
        const refreshBodies: unknown[] = [];
        const recording: RequestContext = {
            ...sarah,
            POST: async <T>(
                resource: string,
                body: Record<string, unknown>,
            ): Promise<T> => {
                if (resource === 'authentication/token') {
                    refreshBodies.push(body);
                    return {
                        access_token: tokens[refreshBodies.length - 1],
                        token_type: 'Bearer',
                        expires_in: 900,
                    } as T;
                }
                return sarah.POST(resource, body);
            },
        };
        await postInvitationAcceptance(
            recording, inv.id, 'BBjWJsjYIDkTRKIIPrzWRw',
        );
        assertStrictEquals(refreshBodies.length, 2);
        assertStrictEquals(getSessionToken(), fresh);
    } finally {
        setCookieSession(false);
        deleteSessionToken();
        deleteRefreshChannel();
    }
}));

Deno.test('two re-minted tokens without the seat surface a'
+ ' named failure',
() => withLocalStorageAsync(freshStorage(), async () => {
    setCookieSession(true);
    try {
        const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
            , 'BBjWJsjYIDkTRKIIPrzWRw');
        await postInvitationGrant(tony, 'sarah@x.com');
        const inv = (await deriveInvitations(db))[0]!;
        const sarah = await ctxOn(db
            , 'toccYYkLEABmlbpHJalgtQ', 'AjdvjuECVZEgZoFajaIEkg');
        const stale = await reachableToken(
            'toccYYkLEABmlbpHJalgtQ', ['AjdvjuECVZEgZoFajaIEkg'],
        );
        const refreshBodies: unknown[] = [];
        const recording: RequestContext = {
            ...sarah,
            POST: async <T>(
                resource: string,
                body: Record<string, unknown>,
            ): Promise<T> => {
                if (resource === 'authentication/token') {
                    refreshBodies.push(body);
                    return {
                        access_token: stale,
                        token_type: 'Bearer',
                        expires_in: 900,
                    } as T;
                }
                return sarah.POST(resource, body);
            },
        };
        const err = await assertRejects(
            () => postInvitationAcceptance(
                recording, inv.id, 'BBjWJsjYIDkTRKIIPrzWRw',
            ),
        ) as Error;
        assertInstanceOf(err, SessionRemintFailedError);
        assertStrictEquals(refreshBodies.length, 2);
    } finally {
        setCookieSession(false);
        deleteSessionToken();
        deleteRefreshChannel();
    }
}));
```

- [ ] **Step 8: The spec's race, as the covenant**

In `tests/adapters-shared-recovery.test.ts`, add imports:

```ts
import { apiRequest } from './http-fixtures.ts';
import { seedIdentityPii } from './identity-fixtures.ts';
import {
    postInvitationAcceptance,
} from '../web-app/app/adapters/invitations.ts';
```

(`refreshTokenFromSetCookie` is already imported from
`http-fixtures.ts` — merge into that import.) Append:

```ts
// Two recovering contexts race: a reader whose access token
// is dead (its 401 opens the facade refresh) and an acceptor
// whose token is live (its remint follows). Both would once
// present the same refresh jti; the loser was a replay and
// the chain was revoked. The remint now follows the flight.
Deno.test('a concurrent facade refresh and remint present'
+ ' one jti each',
() => withLocalStorageAsync(freshStorage(), async () => {
    const db = await freshDb();
    const wayneAdmin = 'toccYYkLEABmlbpHJalgtQ';
    await seedOrganizationDocumentMessagePair(
        db, ORGANIZATION_B, ORGANIZATION_B,
    );
    await seedSeat(
        db, ORGANIZATION_B, wayneAdmin, 'admin',
        '2026-06-04T00:00:00.000000Z',
    );
    await seedIdentityPii(db, 'XXZruirZyAOoRpNxaDnpSA', {
        name: 'Tony', email: 'demo@example.com',
        phone: '', bio: '',
    });
    const invitationId = generateIdentifier();
    const granted = await handleRequest(db, apiRequest({
        method: 'POST',
        path: '/organizations/' + ORGANIZATION_B
            + '/invitations/',
        token: await organizationToken(
            wayneAdmin, ORGANIZATION_B,
        ),
        body: {
            email: 'demo@example.com',
            invitationId,
            grantEventId: generateIdentifier(),
            grantAt: '2026-06-04T00:00:01.000000Z',
        },
    }));
    assertStrictEquals(granted.status, 200);
    const pair = await issuePair(db);
    putSessionCredentials({
        accessToken: pair.access_token,
        refreshToken: pair.refresh_token,
    });
    const deadA = await expiredOrganizationToken(ORGANIZATION_A);
    putSessionToken(deadA);
    const reader = createRecoveringRequestContext(db, deadA);
    const acceptor = createRecoveringRequestContext(
        db,
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_A,
        ),
    );
    const [members] = await Promise.all([
        reader.GET('organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'members/'),
        postInvitationAcceptance(
            acceptor, invitationId, ORGANIZATION_B,
        ),
    ]);
    assert(Array.isArray(members));
    // Assert on `revoked`, not `rotated`: the loser was a
    // replay, so the rotation count was already one.
    const revoked = (await deriveIdentityTokens(db))
        .filter(row => row.action === 'revoked');
    assertStrictEquals(revoked.length, 0);
    assertNotStrictEquals(getSessionCredentials(), null);
}));
```

`seedOrganizationDocumentMessagePair`, `seedSeat`,
`issuePair`, `expiredOrganizationToken`, `ORGANIZATION_A/B`,
`freshDb`, and `deriveIdentityTokens` are already in the
file. If the grant answers other than 200, read
`api/invitations-domain.ts`'s grant op for the shape it wants
and adjust the body — do not weaken the status assertion to
a range.

- [ ] **Step 9: Run everything green; record the race's colour on the parent**

Single-file runs on `tests/adapters-invitations.test.ts` and
`tests/adapters-shared-recovery.test.ts`. Expected: PASS.

Then learn whether the race reproduced on the parent, without
the stash (it is shared across worktrees — never use it):

```bash
git diff web-app/app/adapters > "$TMPDIR/task7.patch"
git checkout web-app/app/adapters/session-refresh-mutex.ts \
    web-app/app/adapters/invitations.ts
# single-file run: tests/adapters-shared-recovery.test.ts
#   --filter 'one jti each'   → note PASS or FAIL
git apply "$TMPDIR/task7.patch"
```

Record the race test's colour on the parent in the task
report. The deterministic pin (Step 1) is the red this commit
is judged on; the race is the spec's covenant either way.

- [ ] **Step 10: Remove the TODO bullet**

Delete from `## Critical functionality path`:

```
- The re-mint refresh is not single-flighted with the
  facade's cookie refresh —
  `web-app/app/adapters/shared.ts:463-464`
```

- [ ] **Step 11: Validate and commit**

```bash
./validate
git add web-app/app/adapters/session-refresh-mutex.ts \
    web-app/app/adapters/invitations.ts \
    web-app/invitations/index.ts \
    tests/adapters-invitations.test.ts \
    tests/adapters-shared-recovery.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Serialize the remint behind in-flight refreshes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 8: Answer 200 on a replayed write (spec item 3)

ONE commit: the token, twelve test files, two test names,
and API.md move together — the tree is red between any two.

**Files:**
- Modify: `api/api.ts:987-989` (`true` → `false`)
- Modify: `tests/api-write-status.test.ts:199-218`,
  `tests/api-instances-patch.test.ts:902`,
  `tests/api-instances-precedence.test.ts:542`,
  `tests/api-pii-tombstone.test.ts:230, :260`,
  `tests/api-work-order-transition-instance.test.ts:1068-1069, :1095`,
  `tests/api-work-order-binding.test.ts:559-560, :571`,
  `tests/document-family.test.ts:636`,
  `tests/api-instances-create.test.ts:548, :567`,
  `tests/api-flow-document.test.ts:523`,
  `tests/drift-roster.test.ts:803`,
  `tests/store-acceptance.ts:243`,
  `tests/api-record-attribute-document.test.ts:585`
- Modify: `API.md:64-65, 69-72, 76-77, 99-100, 103`
- Modify: `TODO.md` (`:211-227`, the gate clause)

**Interfaces:** none new. The contract: a byte-identical
replay answers 200 with the ORIGINAL Response-ID, ETag, and
Date (the ETag attachment at `api/api.ts:1024-1027` is
unchanged). DELETE replays ride the 204 arm and do not move.

- [ ] **Step 1: Write the red pin**

In `tests/api-write-status.test.ts` replace `:199` and `:218`:

```ts
Deno.test('exact retry returns the original 201',
```
→
```ts
Deno.test('exact retry returns the original as 200',
```

and

```ts
    assertStrictEquals(second.status, 201);
```
→
```ts
    assertStrictEquals(second.status, 200);
```

(the Operation-ID, Response-ID, and body assertions that
follow stay). Single-file run with `--filter 'exact retry'`.
Expected: FAIL (201).

- [ ] **Step 2: Pass `false` at the replay branch**

Replace `api/api.ts:987-989`:

```ts
                    const response = sendWriteResponse(
                        replay, method, true,
                    );
```

with:

```ts
                    const response = sendWriteResponse(
                        replay, method, false,
                    );
```

Re-run Step 1's filter. Expected: PASS.

- [ ] **Step 3: Flip the eleven other replay assertions**

Each is a byte-identical resend of a PUT/PATCH/POST; each
`201` becomes `200`; nothing else in those tests moves:

- `tests/api-instances-patch.test.ts:902`
  `assertStrictEquals(replay.status, 201);` → `200`. Its
  name already says `200 REPLAY`.
- `tests/api-instances-precedence.test.ts:542` (the
  "Control: byte-identical resend of first still replays")
  `replay.status, 201` → `200`.
- `tests/api-pii-tombstone.test.ts:230` and `:260`
  `resend.status, 201` → `200`.
- `tests/api-work-order-transition-instance.test.ts:1068-1069`
  name `'byte-identical resend → 204 replay, no second '` →
  `'byte-identical resend → 200 replay, no second '`; `:1095`
  `replay.status, 201` → `200`.
- `tests/api-work-order-binding.test.ts:559-560` name
  `'re-bind same pair byte-identically → 201'` → `→ 200`;
  `:571` `second.status, 201` → `200`.
- `tests/document-family.test.ts:636` `resend.status, 201`
  → `200`.
- `tests/api-instances-create.test.ts:548` name
  `'byte-identical PATCH create resend → 201 replay'` →
  `→ 200 replay`; `:567` `second.status, 201` → `200`.
- `tests/api-flow-document.test.ts:523` `second.status, 201`
  → `200`.
- `tests/drift-roster.test.ts:803` `second.status, 201` →
  `200`.
- `tests/store-acceptance.ts:243` (`'exact retry keeps
  status'`) `second.status, 201` → `200`; rename the test
  `': exact retry replays as 200'`.
- `tests/api-record-attribute-document.test.ts:585` replace
  `assertEquals(first, second);` with:

  ```ts
    assertStrictEquals(first.status, 201);
    assertStrictEquals(second.status, 200);
    assertStrictEquals(
        second.headers.get('Response-ID'),
        first.headers.get('Response-ID'),
    );
  ```

- [ ] **Step 4: Sweep for a thirteenth**

```bash
./test 2>&1 | tail -40
```

Every remaining failure must be a byte-identical resend
asserting 201; move it to 200 and add the file to the commit.
A failure that is NOT a replay (a second, different write
answering 200) is a discovery — STOP and report it; do not
edit its assertion.

- [ ] **Step 5: API.md — the ladder's 200 line gains "replay"**

Replace `API.md:64-65`:

```
emit Response-ID. Replay returns the original,
including Date. If-Match is the sole conflict
```

with:

```
emit Response-ID. A byte-identical replay answers 200
with the original — Response-ID, ETag, and Date. If-Match
is the sole conflict
```

Replace `:69-72`:

```
`sendWriteResponse` sets send-time status: 201 if this
request appended a pair (PUT/PATCH/POST), 200 if it
stored nothing, DELETE 204. The stored start-line stays
GET-shaped 200 / DELETE 204.
```

with:

```
`sendWriteResponse` sets send-time status: 201 if this
request appended a pair (PUT/PATCH/POST), 200 if it
stored nothing (a same-body PUT, or a replay served from
the ledger), DELETE 204. The stored start-line stays
GET-shaped 200 / DELETE 204.
```

Replace `:76-77`:

```
- **200** — same-body document PUT (no append); stored
  PUT start-line
```

with:

```
- **200** — same-body document PUT (no append); a
  byte-identical replay of any PUT/PATCH/POST; stored
  PUT start-line
```

Replace `:99-100`:

```
- **simple** — same-body as live head → 200, no append;
  first append 201
```

with:

```
- **simple** — same-body as live head → 200, no append;
  first append 201; byte-identical replay → 200
```

Replace `:101-103`:

```
- **locked** — live family is flows only. If-Match
  quoted identifier. live+absent → 428; live+≠ head → 412;
  genesis with no If-Match → 201
```

with:

```
- **locked** — live family is flows only. If-Match
  quoted identifier. live+absent → 428; live+≠ head → 412;
  genesis with no If-Match → 201; byte-identical replay →
  200 before the ladder
```

- [ ] **Step 6: Strike the gate clause from the TODO bullet**

Replace the bullet at `TODO.md:211-227`:

```
- A replay is indistinguishable from a creation. The
  gate's replay branch renders a previously-stored
  pair but passes `appended: true`
  (`api/api.ts:1013-1015`), so `sendWriteResponse`
  (`api/message-pair.ts:610-624`) answers 201 exactly
  as the genuine create did. THE FIX IS WIRING, NOT
  DELETION: pass `false` there. The 200 branch is not
  dead — the unchanged-live-PUT site already passes
  `false` (`api/api.ts:1412-1413`), which is both the
  proof the distinction was designed and the precedent
  for the repair; an item reading "remove the 200
  branch" would be exactly backwards. Below the gate,
  the same blindness: `appendMessagePair` skips a
  duplicate `request_hash` silently by its own comment
  (`api/message-pair.ts:686-701`), and the composed
  operation wrapping it still answers 201 however many
  inner pairs actually landed
```

with:

```
- Below the gate, a replay is indistinguishable from a
  creation: `appendMessagePair` skips a duplicate
  `request_hash` silently by its own comment
  (`api/message-pair.ts:686-701`), and the composed
  operation wrapping it still answers 201 however many
  inner pairs actually landed
```

- [ ] **Step 7: Validate and commit**

```bash
./validate
git add api/api.ts API.md TODO.md tests/
git commit -m "$(cat <<'MSG'
Answer 200 on a replayed write

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 9: Answer 200 when the race lost the append (spec item 4)

**Files:**
- Modify: `api/api.ts:1675-1677`
- Modify: `tests/api-write-status.test.ts` (import
  `MESSAGE_TABLES`; one test appended)
- Modify: `TODO.md` (the bullet Task 8 left, narrowed to the
  composed-op sentence)

**Interfaces:** none new. Zero callers change;
`appendMessagePair` stays void.

- [ ] **Step 1: Write the pin**

In `tests/api-write-status.test.ts` add
`import { MESSAGE_TABLES } from '../api/db.ts';` and append:

```ts
// Two byte-identical writes race. The pre-transaction fast
// path sees no pair for either; the memory backend serializes
// the two transactions; the second's appendMessagePair finds
// the first's hash and skips. The gate's post-transaction
// lookup then reads the FIRST request's pair — stored.id is
// not this request's pair id — and must answer 200: exactly
// one 201, one 200, one pair. A transaction held open before
// both requests forces both past the fast path.
Deno.test('a write that lost the append race answers 200',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const body = ideaDocument('Raced', 'ev-ws-race');
    const path = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
        + 'rAcEdWrItEIdEaAaAaAaAw';
    let release!: () => void;
    const held = db.transaction(
        MESSAGE_TABLES,
        () => new Promise<void>((resolve) => {
            release = resolve;
        }),
    );
    const first = handleRequest(db, req('PUT', path, token, body));
    const second = handleRequest(db, req('PUT', path, token, body));
    for (let i = 0; i < 5; i++) {
        await new Promise(r => setImmediate(r));
    }
    release();
    await held;
    const [a, b] = await Promise.all([first, second]);
    assertEquals([a.status, b.status].sort(), [200, 201]);
    assertStrictEquals(
        a.headers.get('Response-ID'),
        b.headers.get('Response-ID'),
    );
    assertStrictEquals(
        await pairsAt(db, IDEA_PREFIX, 'rAcEdWrItEIdEaAaAaAaAw'),
        1,
    );
});
```

(`freshDb`, `req`, `ideaDocument`, `pairsAt`, `IDEA_PREFIX`
already exist in the file; add `assertEquals` to the
`@std/assert` import. Replace the literal idea id with a
fresh `generateIdentifier()` output if `isIdentifier` rejects
it — the gate validates the path id.)

- [ ] **Step 2: Run it red**

Single-file run `--filter 'lost the append race'`. Expected:
FAIL — `[201, 201]`. If it PASSES on the parent, the second
request was served from the pre-transaction fast path (Task
8 already made it 200) and this branch was not exercised:
extend the held window (`i < 25`) and re-run; if it still
passes, report exactly that with the two Response-ID values
and STOP — the branch is unreachable on this backend and the
product edit needs a different reproduction.

- [ ] **Step 3: Compare the pair ids**

Replace `api/api.ts:1675-1677`:

```ts
                    const response = sendWriteResponse(
                        stored, 'PUT', true,
                    );
```

with:

```ts
                    // The pair by hash is THIS request's iff
                    // its id matches; a concurrent twin that
                    // landed first leaves this one a 200.
                    const response = sendWriteResponse(
                        stored, 'PUT',
                        stored.id === messagePair.id,
                    );
```

Re-run the filter. Expected: PASS.

- [ ] **Step 4: Narrow the TODO bullet to the composed-op residue**

Replace the bullet Task 8 left with:

```
- An inner pair of a composed operation skipped while
  the top-level pair landed still answers 201:
  `appendMessagePair` returns void and the gate never
  holds inner hashes (`api/message-pair.ts:686-701`)
```

- [ ] **Step 5: Validate and commit**

```bash
./validate
git add api/api.ts tests/api-write-status.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Answer 200 when the race lost the append

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 10: Give byte-identity tests an explicit shared id (spec item 5)

Green throughout. Prepares Task 11: once helpers mint, a test
that depends on two requests deduplicating must say so with
one id it minted itself.

**Files:**
- Modify (each file's `req()` helper, then the named tests):
  `tests/api-write-status.test.ts`,
  `tests/api-instances-patch.test.ts`,
  `tests/api-instances-precedence.test.ts`,
  `tests/api-pii-tombstone.test.ts`,
  `tests/api-work-order-transition-instance.test.ts`,
  `tests/api-work-order-binding.test.ts`,
  `tests/api-instances-create.test.ts`,
  `tests/api-flow-document.test.ts`,
  `tests/drift-roster.test.ts`,
  `tests/api-instances-delete.test.ts`,
  `tests/api-record-types-write.test.ts`,
  `tests/api-instance-delete-restrict.test.ts`,
  `tests/api-idea-document.test.ts`,
  `tests/api-project-document.test.ts`,
  `tests/api-record-document.test.ts`,
  `tests/api-invitations-fence.test.ts`,
  `tests/store-acceptance.ts` (helper already takes the id),
  `tests/api-record-attribute-document.test.ts` (hand-built
  header)

**Interfaces:**
- Produces: every listed `req()` gains a trailing
  `operationId?: string` parameter (the
  `tests/store-acceptance.ts:21-38` shape).

- [ ] **Step 1: Extend each `req()` helper**

In each of the sixteen `.test.ts` files above, the local
`req()` gains a trailing optional parameter and threads it.
Example, `tests/api-write-status.test.ts:46-62`:

```ts
function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    headers?: Readonly<Record<string, string>>,
    operationId?: string,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(headers !== undefined
            ? { headers } : {}),
        operationId: operationId ?? TEST_OPERATION_ID,
    });
}
```

Files whose `req()` has no headers parameter
(`api-pii-tombstone`, `drift-roster`, `api-invitations-fence`,
`api-idea-document`, `api-project-document`,
`api-record-document`, `api-instances-delete`,
`api-record-types-write`, `api-instance-delete-restrict` —
confirm each by reading it) gain `operationId?: string`
directly after `body`. Add `import { generateIdentifier }
from '../shared/identifier.ts';` where absent.

- [ ] **Step 2: Each byte-identity test mints one id and passes it to both requests**

The tests (grep each file for `byte-identical`, `resend`,
`replay`, `converges`, `Idempotent`): both requests of the
pair get the same minted id. Example,
`tests/api-write-status.test.ts` 'exact retry returns the
original as 200':

```ts
    const operationId = generateIdentifier();
    const first = await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'yggAqfvrChBmrMfrOilSUg', token, body,
            undefined, operationId),
    );
    …
    const second = await handleRequest(
        db, req('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'yggAqfvrChBmrMfrOilSUg', token, body,
            undefined, operationId),
    );
```

The race pin from Task 9 is a byte-identical pair too — it
gets the id. The same-body 200 test above it (`:170-197`)
does NOT: with a fresh id per request it exercises the
same-body PUT path for the first time — under the shared id
the ledger had been serving it as a replay, the false green
the spec describes. The sites the spec names: `api-instances-patch:853`,
`api-instances-precedence:496` (the control replay only —
the first two requests differ by If-Match), `api-pii-tombstone
:214` and `:238`, `api-work-order-transition-instance:1068`,
`api-work-order-binding:559`, `api-instances-create:548`,
`api-flow-document:498`, `drift-roster:784`,
`api-instances-delete:343`, `api-record-types-write:356`,
`api-instance-delete-restrict:373`, `api-idea-document:145`,
`api-project-document:141`, `api-record-document:306`, the
four `api-invitations-fence` replays (`:348`, `:385`, `:436`,
`:485` — the replayed pair in each, not the grant that
precedes it), `store-acceptance` 'exact retry replays as 200'
(`req('PUT', …, token, body, undefined, operationId)`), and
`api-record-attribute-document:571-572`:

```ts
    const operationId = generateIdentifier();
    const opHeaders: readonly (readonly [string, string])[] =
        [['operation-id', operationId]];
```

`document-family.test.ts` clones one `Request`; it needs
nothing.

- [ ] **Step 3: Run the whole suite green**

```bash
./test
```

Expected: PASS, every file. Nothing red: the helpers still
default to the shared id.

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add tests/
git commit -m "$(cat <<'MSG'
Give byte-identity tests an explicit shared id

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 11: Mint a fresh operation id per test request (spec item 6)

Mechanical; 127 files. Lands after Task 8, so any test that
silently relied on dedupe answers 200 where it asserted 201 —
that red is the discovery, not a regression; fix its ids
(Task 10's shape), never its assertion.

**Files:**
- Modify: `tests/http-fixtures.ts:10-12` (export deleted)
- Modify: every file `grep -rl TEST_OPERATION_ID tests/`
  names (127 at `cfafb32e`)
- Modify: `tests/store-acceptance.ts:36`,
  `tests/api-record-types-composed-op.test.ts:436-442`
  (comment deleted)
- Modify: `TODO.md` (`:297-309` deleted)

**Interfaces:**
- Produces: `apiRequest` mints for every helper; no test
  names a shared id.

- [ ] **Step 1: The sixteen extended helpers stop defaulting**

In each `req()` Task 10 touched, replace

```ts
        operationId: operationId ?? TEST_OPERATION_ID,
```

with

```ts
        ...(operationId !== undefined ? { operationId } : {}),
```

and in `tests/store-acceptance.ts:36` the same.

- [ ] **Step 2: Every other helper drops the pinned line**

```bash
grep -rl "operationId: TEST_OPERATION_ID," tests/ \
    | xargs sed -i '' '/^ *operationId: TEST_OPERATION_ID,$/d'
```

Then the import lists:

```bash
grep -rl "TEST_OPERATION_ID" tests/ \
    | xargs sed -i '' \
        -e 's/apiRequest, TEST_OPERATION_ID,/apiRequest,/' \
        -e 's/apiRequest, TEST_OPERATION_ID, /apiRequest, /' \
        -e '/^    TEST_OPERATION_ID,$/d'
grep -rn "TEST_OPERATION_ID" tests/
```

The remaining hits are the hand sites; treat each:

- `import { TEST_OPERATION_ID } from './http-fixtures.ts';`
  (whole-line imports, e.g. `api-membership-liveness`,
  `adapters-members-union`, `adapters-invitations`,
  `api-record-attribute-document`): delete the line; add
  `import { generateIdentifier } from
  '../shared/identifier.ts';` if the file lacks it.
- `'operation-id': TEST_OPERATION_ID,` inside a literal
  `headers` object (`api-authz-gate:71`,
  `api-identity-default-organization:61, 169, 194, 215`,
  `adapters-invitations:273`, `api-membership-liveness:33,
  49`): → `'operation-id': generateIdentifier(),`.
- `operationId: TEST_OPERATION_ID,` inside a
  `formWriteMessagePair({…})` input (`member-fixtures.ts:117,
  148, 178`, `message-pair.test.ts:27, 48, 82, 108, 146`,
  `adapters-members-union:288`): → `operationId:
  generateIdentifier(),`.
- `tests/api-operation-id.test.ts` 'public PUT with
  Operation-ID stores both columns' (`:100-…`): mint
  `const operationId = generateIdentifier();` at the top of
  the test, pass it, and assert the response header and the
  stored row's `operation_id` against it.
- `tests/api-record-types-composed-op.test.ts:436-442`:
  delete the seven-line comment that begins `// A fresh
  operationId (not req()'s shared`; the
  `operationId: generateIdentifier(),` line stays.
- `tests/http-fixtures.ts:10-12`: delete the comment and
  the export.

- [ ] **Step 3: The grep is empty; the check is green**

```bash
grep -rn "TEST_OPERATION_ID" . --include='*.ts' \
    --exclude-dir=.worktrees --exclude-dir=.git
export DENO_DIR="$TMPDIR/deno-dir"
deno check --frozen api shared server tests web-app
```

Expected: no grep output; the check passes (an unused
`generateIdentifier` import or a leftover name is a check
error — fix it).

- [ ] **Step 4: Run the suite; every red is a dedupe reliance**

```bash
./test 2>&1 | tail -60
```

A failing test here issued two byte-identical requests and
relied on the second being served from the ledger. Give it
a minted shared id (Task 10 Step 2's shape). NEVER edit its
assertion. List every such test in the task report with its
file — each is a false green the shared id had been hiding.

- [ ] **Step 5: Remove the TODO bullet**

Delete from `## Critical functionality path`:

```
- A shared test operation id can produce false greens.
  `tests/http-fixtures.ts:12` exports one hardcoded
  `TEST_OPERATION_ID`; 126 test files use it, 101
  through a local `req()` helper that pins it.
  `apiRequest` already mints a fresh identifier when
  `operationId` is omitted; the helpers still pass the
  shared id. Because `appendMessagePair` dedupes on
  `request_hash`, a test issuing two byte-identical
  requests has the second silently dropped — which
  made a security test in the run-four remediation
  pass against unfixed code until it was caught.
  Oracle:
  `tests/api-record-types-composed-op.test.ts:436-442`
```

- [ ] **Step 6: Validate and commit**

```bash
./validate
git add tests/ TODO.md
git commit -m "$(cat <<'MSG'
Mint a fresh operation id per test request

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 12: Pin that identical test writes each append (spec item 7)

The pin lands after Task 11; it proves failability by the
named mutation. The observable differs from the spec's
"grows by two": a same-body document PUT answers 200 without
appending by design (API.md ladder), so a second identical
PUT never appends whatever its id. An instance CREATE is the
honest oracle: served from the ledger under a shared id, it
reaches the domain under a fresh one and answers 409.

**Files:**
- Modify: `tests/api-operation-id.test.ts` (imports; one
  test appended)

**Interfaces:**
- Consumes: `organizationToken(identity, organization)`,
  `seedAdminSchema(db)`, `handleRequest`, `apiRequest`.

- [ ] **Step 1: Write the pin**

Extend the imports of `tests/api-operation-id.test.ts`:

```ts
import { DEV_TOKEN, organizationToken } from
    './token-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
```

Append:

```ts
// Two helper-shaped writes with identical method, path, and
// body are two requests: apiRequest mints an operation id
// for each, the hashes differ, and the second reaches the
// domain — here an instance create over a live instance,
// which the handler refuses (409) rather than the ledger
// serving the first's stored 201.
Deno.test('identical helper-shaped writes each reach the'
+ ' domain',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const organization = 'AjdvjuECVZEgZoFajaIEkg';
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', organization,
    );
    const typeId = generateIdentifier();
    const typeDetail = '/organizations/' + organization
        + '/record-types/' + typeId;
    const created = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: typeDetail,
        token: admin,
        body: {
            name: 'Rental',
            description: 'Rental desc',
            position: 1,
            state: 'active',
        },
    }));
    assertStrictEquals(created.status, 201);
    const instanceDetail = typeDetail + '/instances/'
        + generateIdentifier();
    const write = (): Request => apiRequest({
        method: 'PATCH',
        path: instanceDetail,
        token: admin,
        body: { set: [] },
    });
    const first = await handleRequest(db, write());
    const second = await handleRequest(db, write());
    assertStrictEquals(first.status, 201);
    assertStrictEquals(second.status, 409);
});
```

- [ ] **Step 2: Run green, then prove it can fail**

Single-file run `--filter 'each reach the domain'`. Expected:
PASS.

Mutation: hoist `const operationId = generateIdentifier();`
above `write` and add `operationId,` to its `apiRequest`
input; re-run. Expected: FAIL — the second answers 200 (the
ledger served the first's pair). Remove the mutation; PASS.
Record both.

- [ ] **Step 3: Validate and commit**

```bash
./validate
git add tests/api-operation-id.test.ts
git commit -m "$(cat <<'MSG'
Pin that identical test writes each append

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 13: Require role keys on the nested attribute create (spec item 8)

Decision 6: validate at the gate; the read-side synthesis
goes rather than becoming a fallback. Create and replace
become one validator.

**Files:**
- Modify: `api/validators.ts:2924-3066` (the nested
  attribute validator; two key constants deleted)
- Modify: `api/routes.ts:75-76` (import), `:87` (add
  `pickStringArray`), `:975-1000` (`attributeSchemaOf`),
  `:1040-1043` (`nestedAttributeWireOf`), `:5301-5327` (the
  nested PUT)
- Modify: `tests/validators-attribute-acl.test.ts`,
  `tests/api-nested-attributes.test.ts:174-210`,
  `tests/api-record-attribute-document.test.ts:564-570`,
  `tests/api-instances-create.test.ts` (two tests appended)
- Modify: `TODO.md` (`:281-289` deleted)

**Interfaces:**
- Produces: `validateAttributeDocument(body: Record<string,
  unknown>): AttributeDocument` — the only nested attribute
  validator; `validateAttributeDocumentCreate` and
  `validateAttributeDocumentReplace` are deleted.

- [ ] **Step 1: Write the red pin**

Append to `tests/api-instances-create.test.ts`:

```ts
// The measured 403: an admin's keyless nested create stored
// no role keys, attributeSchemaOf read [] for both, and a
// member's value write was forbidden. The gate now refuses
// the keyless create; a keyed one lets the member write.
Deno.test('an admin keyless nested attribute create is 400',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    const put = await handleRequest(db, req(
        'PUT', ATTRS + ATTR_ID, adminToken, {
            name: 'Title',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
        },
    ));
    assertStrictEquals(put.status, 400);
    assertEquals(await put.json(), {
        error: 'missing required key "read_roles"'
            + ' for AttributeDocumentBody',
    });
});

Deno.test('a keyed nested create lets a member write its'
+ ' value',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    const res = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, memberToken,
        setBody([{ attribute_id: ATTR_ID, value: 'Hello' }]),
    ));
    assertStrictEquals(res.status, 201);
});
```

Single-file run `--filter 'keyless nested'`. Expected: FAIL
(201). If the error text differs only in which key
`assertOnlyKeys` names first, the product decides — read
`assertOnlyKeys` and pin the key it reports.

- [ ] **Step 2: One validator, both keys required**

In `api/validators.ts`, replace the comment at `:2924-2929`
through the end of `validateAttributeDocumentReplace`
(`:3062-3066`) with:

```ts
// Nested attribute document under a record-type address
// (Task 6). No record_id — parentage is the URI. Both ACL
// keys are required on create and replace alike: the nested
// PUT appends the wire it was given, so a keyless head would
// store no roles and read as nobody-but-admin. Role strings
// are free non-empty strings; [] is legal (admins only via
// bypass).
export const NESTED_ATTRIBUTE_DOCUMENT_BODY_KEYS = [
    'name', 'attribute_type', 'sort_order',
    'options', 'constraints',
    'read_roles', 'write_roles',
] as const;

export interface AttributeDocument {
```

(keep the interface body exactly as it is), then replace
`validateAttributeDocument(body, mode)` and the two exported
wrappers with:

```ts
export function validateAttributeDocument(
    body: Record<string, unknown>,
): AttributeDocument {
    const label = 'AttributeDocumentBody';
    assertOnlyKeys(
        body,
        NESTED_ATTRIBUTE_DOCUMENT_BODY_KEYS,
        label,
    );
    const name = pickString(body, 'name');
    if (name === '') {
        throw new ValidationError(
            label + '.name must be non-empty',
        );
    }
    const attributeType = asAttributeType(
        body['attribute_type'],
        label + '.attribute_type',
    );
    const constraintsArr = asArray(
        body['constraints'], 'constraints',
    );
    const constraints = constraintsArr.map(
        (item, i) => {
            const constraint = asConstraint(
                item,
                'constraints[' + i + ']',
            );
            assertConstraintAppliesTo(
                constraint.kind,
                attributeType,
                'constraints[' + i + ']',
            );
            return constraint;
        },
    );
    const options = pickStringArray(body, 'options');
    if (
        (attributeType === 'select'
            || attributeType === 'radio')
        && options.length === 0
    ) {
        throw new ValidationError(
            label + '.options'
            + ' must list at least one option'
            + " for attribute_type '"
            + attributeType + "'",
        );
    }
    return {
        name,
        attribute_type: attributeType,
        sort_order: pickNumber(body, 'sort_order'),
        options,
        constraints,
        read_roles: pickNonEmptyStringArray(
            body, 'read_roles', label,
        ),
        write_roles: pickNonEmptyStringArray(
            body, 'write_roles', label,
        ),
    };
}
```

Delete `NESTED_ATTRIBUTE_CORE_KEYS` and
`NESTED_ATTRIBUTE_ACL_KEYS` (`:2936-2943`) — confirm with
`grep -n "NESTED_ATTRIBUTE_CORE_KEYS\|NESTED_ATTRIBUTE_ACL_KEYS"
api/ tests/` that nothing else reads them. The
`DEFAULT_ATTRIBUTE_ACL_ROLES` import stays: the flat
`validateRecordAttributeDocumentBody` (`:2896-2905`) still
stamps it for the composed create.

- [ ] **Step 3: The routes read both keys as present**

`api/routes.ts:75-76`: replace the two imports with
`validateAttributeDocument,`; at `:87` add `pickStringArray,`
beside `pickString,`.

Replace `attributeSchemaOf` (`:975-1000`) with:

```ts
// Live attribute heads → AttributeSchemaRow map for
// instance ACL + value gates (Tasks 15/17). Roles and
// type fields ride the stored nested document body; a
// head without its role arrays is a breach proclaimed
// here, never a case handled.
function attributeSchemaOf(
    id: string,
    body: Record<string, unknown>,
): AttributeSchemaRow {
    const optionsRaw = body['options'];
    const constraintsRaw = body['constraints'];
    return {
        id,
        name: pickString(body, 'name'),
        attributeType: pickString(
            body, 'attribute_type',
        ) as AttributeType,
        options: Array.isArray(optionsRaw)
            ? optionsRaw as string[]
            : [],
        constraints: Array.isArray(constraintsRaw)
            ? constraintsRaw as Constraint[]
            : [],
        readRoles: pickStringArray(body, 'read_roles'),
        writeRoles: pickStringArray(body, 'write_roles'),
    };
}
```

Replace `:1040-1043` in `nestedAttributeWireOf`:

```ts
    const raw = withoutId(requestBody);
    const entity =
        'read_roles' in raw && 'write_roles' in raw
            ? validateAttributeDocumentReplace(raw)
            : validateAttributeDocumentCreate(raw);
```

with:

```ts
    const entity = validateAttributeDocument(
        withoutId(requestBody),
    );
```

Replace the nested PUT (`:5301-5327`):

```ts
        put: async (db, p, body, _actor, messagePair) => {
            const org = param(p, 0);
            const typeId = param(p, 1);
            const attrId = param(p, 2);
            await requireRecordTypeExists(db, org, typeId);
            const prefix = attributesUriPrefix(org, typeId);
            const messagePairs = await db.messagePairs.getAllWhere(
                'uri_collection', prefix,
            );
            const hasHead = deriveDocumentsAt(
                messagePairs, prefix,
            ).has(attrId);
            const raw = withoutId(body);
            if (hasHead) {
                validateAttributeDocumentReplace(raw);
            } else {
                validateAttributeDocumentCreate(raw);
            }
            return db.transaction(
```

with:

```ts
        put: async (db, p, body, _actor, messagePair) => {
            const org = param(p, 0);
            const typeId = param(p, 1);
            await requireRecordTypeExists(db, org, typeId);
            validateAttributeDocument(withoutId(body));
            return db.transaction(
```

(the transaction body below is unchanged). Re-run Step 1's
filter. Expected: PASS.

- [ ] **Step 4: The validator tests speak the required-keys covenant**

In `tests/validators-attribute-acl.test.ts`: the import
becomes `validateAttributeDocument` alone; every
`validateAttributeDocumentCreate(` and
`validateAttributeDocumentReplace(` call becomes
`validateAttributeDocument(`. Replace the `// -- create`
section's four tests (`:32-84`) with:

```ts
// -- both ACL keys are required -------------------------

Deno.test('omitting both ACL keys is rejected', () => {
    const err = assertThrows(
        () => validateAttributeDocument(coreFields()),
    ) as Error;
    assertInstanceOf(err, ValidationError);
    assertStrictEquals(
        err.message,
        'missing required key "read_roles"'
        + ' for AttributeDocumentBody',
    );
});

Deno.test('read_roles: [] with write_roles given is'
+ ' admins-only on read', () => {
    const out = validateAttributeDocument(
        coreFields({ read_roles: [], write_roles: ['member'] }),
    );
    assertEquals(out.read_roles, []);
    assertEquals(out.write_roles, ['member']);
});

Deno.test('rejects read_roles with an empty string', () => {
    const err = assertThrows(
        () => validateAttributeDocument(
            coreFields({
                read_roles: [''],
                write_roles: ['member'],
            }),
        ),
    ) as Error;
    assertInstanceOf(err, ValidationError);
    assertMatch(err.message, /non-empty/);
});

Deno.test('write_roles without read_roles is rejected',
() => {
    const err = assertThrows(
        () => validateAttributeDocument(
            coreFields({ write_roles: ['member'] }),
        ),
    ) as Error;
    assertInstanceOf(err, ValidationError);
    assertStrictEquals(
        err.message,
        'missing required key "read_roles"'
        + ' for AttributeDocumentBody',
    );
});
```

Keep 'create rejects unknown key record_id' but give its
body both keys (`coreFields({ record_id: '…', read_roles:
['member'], write_roles: ['member'] })`) so the unexpected
key is what fails. The `// -- replace` tests below stay as
they are apart from the renamed call. The
`DEFAULT_ATTRIBUTE_ACL_ROLES` import goes if nothing in the
file reads it any more.

- [ ] **Step 5: The nested-attributes HTTP test and the document test**

Replace `tests/api-nested-attributes.test.ts:174-210` (the
test 'PUT create no ACL keys → 200; GET shows stamped
DEFAULT_ATTRIBUTE_ACL_ROLES') with:

```ts
Deno.test('PUT create without ACL keys → 400; nothing stored',
async () => {
    const { db, adminToken } = await adminDb();
    await putLiveType(db, adminToken);
    const put = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, attrCore(),
    ));
    assertStrictEquals(put.status, 400);
    assertEquals(await put.json(), {
        error: 'missing required key "read_roles"'
            + ' for AttributeDocumentBody',
    });
    const get = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assertStrictEquals(get.status, 404);
});
```

Run that file. Any OTHER test in it that creates an
attribute with a keyless `attrCore()` as a fixture step gains
`read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES], write_roles:
[...DEFAULT_ATTRIBUTE_ACL_ROLES]` in that fixture; its
assertions do not move.

In `tests/api-record-attribute-document.test.ts:564-570` the
`body` gains:

```ts
        read_roles: ['member', 'admin'],
        write_roles: ['member', 'admin'],
```

- [ ] **Step 6: The seed pins and the docs generator hold**

```bash
./test 2>&1 | tail -30
grep -rn "1453\|EXPECTED_MESSAGE_PAIR_COUNT" tests/mock-data-pairs.test.ts | head -3
```

Expected: the suite is green including the `1453` and `92`
pins (the seed stamps through
`recordAttributeDocumentBodyOf`, untouched) and
`generate-api-documentation --check` in `./validate` (its
example carries both keys already).

- [ ] **Step 7: Remove the TODO bullet**

Delete from `## Critical functionality path`:

```
- Absence and emptiness are conflated in attribute ACL
  derivation. `attributeSchemaOf` synthesizes
  `readRoles: []` both for a head that deliberately
  stores an empty array and for one carrying no role
  keys at all (`api/routes.ts:1000-1005`), because the
  nested attribute PUT appends the raw wire body
  rather than the validator's normalized document
  (`api/routes.ts:5307-5333`; the default-stamping it
  discards is `api/validators.ts:3042-3054`)
```

- [ ] **Step 8: Validate and commit**

```bash
./validate
git add api/validators.ts api/routes.ts tests/ TODO.md
git commit -m "$(cat <<'MSG'
Require role keys on the nested attribute create

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 14: Hand re-init failures to the page error state (spec item 9)

**Files:**
- Modify: `web-app/app/channels.ts:138-154` (`subscribeOnce`
  gains a required third parameter)
- Modify: `web-app/records/index.ts:68-70`,
  `web-app/projects/index.ts:92-94`,
  `web-app/ideas/index.ts:68-70`,
  `web-app/flows/index.ts:110-112` (each caller; each file
  imports `handlePageLoadError`)
- Modify: `tests/channels.test.ts:94-120` (two tests gain the
  argument; one test appended)
- Create: `tests/ideas-empty-reinit-error.test.ts`
- Modify: `TODO.md` (`:252-259` deleted)

**Interfaces:**
- Produces: `subscribeOnce(subscribe, fn, onError: (err:
  unknown) => void): void`. `subscribeOnce` learns nothing
  about pages; the caller passes
  `err => handlePageLoadError('<page>', err)`.

- [ ] **Step 1: Write the red pin**

`tests/ideas-empty-reinit-error.test.ts`:

```ts
import { assert, assertEquals, assertStrictEquals } from
    '@std/assert';
import './hmac-test-key.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';

const CHANNEL_NAME = 'fusion-angle:data';
const MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';

// A re-init that fails OUTSIDE loadInto's fetch — here
// `$required('#ideas-list')` on the second boot — must reach
// the page error state with Try Again, exactly as a first
// boot's failure does through handlePageLoadError, and must
// never leak to the global unhandledrejection handler. Stubs
// land before any web-app import — the module graph reads
// theme/session state at load.

function makeListStub(): {
    innerHTML: string;
    id: string;
    addEventListener: () => void;
    querySelector: () => null;
    querySelectorAll: () => never[];
    insertAdjacentElement: () => void;
} {
    return {
        innerHTML: '',
        id: 'ideas-list',
        addEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
        insertAdjacentElement: () => {},
    };
}

function makeCreateButtonStub(): {
    classList: {
        add: (c: string) => void;
        remove: (c: string) => void;
        contains: (c: string) => boolean;
    };
    addEventListener: () => void;
} {
    const classes = new Set<string>();
    return {
        classList: {
            add: (c: string) => { classes.add(c); },
            remove: (c: string) => { classes.delete(c); },
            contains: (c: string) => classes.has(c),
        },
        addEventListener: () => {},
    };
}

Deno.test(
    'a failed empty-page re-init renders the error state,'
    + ' not an unhandled rejection',
    () => withLocalStorageAsync(
        (() => {
            const storage = new Map<string, string>();
            return {
                getItem: (k: string) =>
                    storage.get(k) ?? null,
                setItem: (k: string, v: string) => {
                    storage.set(k, v);
                },
                removeItem: (k: string) => {
                    storage.delete(k);
                },
            };
        })(),
        async () => {
        const g = globalThis as Record<string, unknown>;
        const listStub = makeListStub();
        const createButton = makeCreateButtonStub();
        // After the first boot, the list element is gone:
        // the second init's $required throws before
        // loadInto ever runs. The error state renders into
        // .page-content, which the stub serves as the same
        // list element so the assertion can read it.
        let listGone = false;
        g['window'] = {
            matchMedia: () => ({
                matches: false,
                addEventListener: () => {},
                removeEventListener: () => {},
            }),
            addEventListener: () => {},
        };
        g['MutationObserver'] = class {
            observe(): void {}
        };
        g['document'] = {
            addEventListener: () => {},
            createElement: () => ({
                className: '',
                setAttribute: () => {},
            }),
            querySelector: (sel: string) => {
                if (sel === '#ideas-list') {
                    return listGone ? null : listStub;
                }
                if (sel === '.page-content') return listStub;
                if (sel === '#create-idea-btn') {
                    return createButton;
                }
                return null;
            },
        };
        const unhandled: unknown[] = [];
        const onRejection = (
            event: PromiseRejectionEvent,
        ) => {
            event.preventDefault();
            unhandled.push(event.reason);
        };
        globalThis.addEventListener(
            'unhandledrejection', onRejection,
        );
        try {
            await import('./in-page-facade.ts');
            const { initAdapter, putSessionToken } =
                await import(
                    '../web-app/app/adapters/init.ts'
                );
            const db = memoryDbAdapter();
            await seedAdminSchema(db);
            await seedHumanMember(db, MEMBER_ID, 'Demo Test');
            assertStrictEquals(
                await initAdapter(() => db), true,
            );
            putSessionToken(await organizationToken());
            const { init } = await import(
                '../web-app/ideas/index.ts'
            );
            await init();
            assert(
                listStub.innerHTML.includes('No Ideas Yet'),
                'precondition: empty state rendered',
            );
            listGone = true;
            const poster = new BroadcastChannel(CHANNEL_NAME);
            poster.postMessage({ kind: 'full' });
            const deadline = Date.now() + 5000;
            while (
                !listStub.innerHTML.includes('Try Again')
                && Date.now() < deadline
            ) {
                await new Promise(r => setImmediate(r));
            }
            poster.close();
            assertEquals(
                unhandled, [],
                'the re-init failure must not leak to the'
                + ' global handler',
            );
            assert(
                listStub.innerHTML.includes('Try Again'),
                'the failed re-init must render the page'
                + ' error state',
            );
        } finally {
            globalThis.removeEventListener(
                'unhandledrejection', onRejection,
            );
            const { deleteNotificationChannel } =
                await import(
                    '../web-app/app/adapters/broadcast-channel.ts'
                );
            deleteNotificationChannel();
            delete g['window'];
            delete g['MutationObserver'];
            delete g['document'];
        }
    }),
);
```

- [ ] **Step 2: Run it red**

Single-file run on `tests/ideas-empty-reinit-error.test.ts`.
Expected: FAIL — `unhandled` holds one error (the `$required`
rejection reached the global handler) and no `Try Again`
rendered. It takes the five-second deadline to fail; that is
the parent's shape, not the test's.

- [ ] **Step 3: `subscribeOnce` takes the error handler**

Replace `web-app/app/channels.ts:138-154`:

```ts
// One-shot subscription: the first event tears the
// subscription down, then runs fn. Serves the empty
// list pages (SV8b): an empty initial load wires no
// steady-state subscriber, so the first change bell
// re-runs init — which either wires the steady state
// (data now) or re-renders empty and re-arms. Teardown
// precedes fn, so the steady-state subscription fn
// wires never coexists with the one-shot. fn runs
// synchronously inside the bell; a throw or a rejection
// reaches onError — the caller decides what a failed
// re-init looks like, never the global handler's toast.
export function subscribeOnce(
    subscribe: (fn: () => void) => () => void,
    fn: () => void | Promise<void>,
    onError: (err: unknown) => void,
): void {
    const unsubscribe = subscribe(() => {
        unsubscribe();
        new Promise<void>((resolve) => {
            resolve(fn());
        }).catch(onError);
    });
}
```

- [ ] **Step 4: The four callers hand the page's own recovery**

Each page adds `import { handlePageLoadError } from
'../app/page-loader.ts';` beside its `subscribeOnce` import
and passes the handler:

`web-app/records/index.ts:68-70`:

```ts
                subscribeOnce(
                    subscribeRecordChanges, init,
                    err => handlePageLoadError('records', err),
                );
```

`web-app/projects/index.ts:92-94`:

```ts
                subscribeOnce(
                    subscribeProjectChanges, init,
                    err => handlePageLoadError('projects', err),
                );
```

`web-app/ideas/index.ts:68-70`:

```ts
                subscribeOnce(
                    subscribeIdeaChanges, init,
                    err => handlePageLoadError('ideas', err),
                );
```

`web-app/flows/index.ts:110-112`:

```ts
                subscribeOnce(
                    subscribeFlowChanges, init,
                    err => handlePageLoadError('flows', err),
                );
```

Re-run Step 2. Expected: PASS (well inside the deadline).

- [ ] **Step 5: The channel tests gain the argument and a pin of their own**

In `tests/channels.test.ts:94-120`, both `subscribeOnce`
calls gain a recording third argument, and each test asserts
it stayed empty:

```ts
Deno.test('subscribeOnce delivers exactly once', () => {
    const ch = createChannel<void>();
    let calls = 0;
    const errors: unknown[] = [];
    subscribeOnce(ch.subscribe, () => {
        calls += 1;
    }, err => { errors.push(err); });
    ch.send();
    ch.send();
    assertStrictEquals(calls, 1);
    assertEquals(errors, []);
});
```

(the same shape for 'subscribeOnce tears down before fn
runs'). Append:

```ts
Deno.test(
    'subscribeOnce hands a throwing or rejecting fn to onError',
    async () => {
        const ch = createChannel<void>();
        const errors: unknown[] = [];
        subscribeOnce(ch.subscribe, () => {
            throw new Error('sync');
        }, err => { errors.push(err); });
        ch.send();
        subscribeOnce(
            ch.subscribe,
            () => Promise.reject(new Error('async')),
            err => { errors.push(err); },
        );
        ch.send();
        await new Promise(r => setImmediate(r));
        assertEquals(
            errors.map(e => (e as Error).message),
            ['sync', 'async'],
        );
    },
);
```

- [ ] **Step 6: Remove the TODO bullet**

Delete from `## Critical functionality path`:

```
- A re-init failure degrades weaker than a first-boot one:
  `subscribeOnce`'s `void fn()` lets the rejection reach the
  global `unhandledrejection` handler, which logs and
  toasts — but first boot gets `handlePageLoadError`'s full
  error state with a Try Again button. Toast-only, no retry
  — `web-app/app/channels.ts:152`,
  `web-app/app/page-loader.ts:41-75`,
  `web-app/app/error-helpers.ts:41-57`
```

- [ ] **Step 7: Validate and commit**

```bash
./validate
git add web-app/app/channels.ts web-app/records/index.ts \
    web-app/projects/index.ts web-app/ideas/index.ts \
    web-app/flows/index.ts tests/channels.test.ts \
    tests/ideas-empty-reinit-error.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Hand re-init failures to the page error state

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 15: Pin every adapter channel silent until a bell (spec item 21)

Lands green; takes Task 14's three-argument signature.
Self-updating: reads the adapter index for every
`subscribe<Entity>Changes` export.

**Files:**
- Create: `tests/adapters-subscribe-silent.test.ts`
- Modify: `TODO.md` (`:260-264` deleted)

**Interfaces:**
- Consumes: `subscribeOnce(subscribe, fn, onError)`;
  every `web-app/app/adapters/index.ts` export matching
  `/^subscribe\w+Changes$/` (thirteen at `cfafb32e`).

- [ ] **Step 1: Write the test**

```ts
import { assert, assertEquals, assertStrictEquals } from
    '@std/assert';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';

const NULL_STORAGE: Partial<Storage> = {
    getItem: () => null,
    setItem: () => {},
};

// Every subscribe<Entity>Changes delegates to
// createSubscriptionChannel → createChannel, whose subscribe
// only adds to a Set: nothing fires until a bell.
// subscribeOnce's `const unsubscribe = subscribe(...)` would
// be a TDZ ReferenceError under a synchronous replay, so
// this pin reads every such export from the adapter index —
// a fourteenth is covered the day it lands. Stubs land
// before the import: the module graph reads theme/session
// state at load.
Deno.test(
    'every adapter subscription is silent until a bell',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const g = globalThis as Record<string, unknown>;
        g['window'] = {
            matchMedia: () => ({
                matches: false,
                addEventListener: () => {},
                removeEventListener: () => {},
            }),
            addEventListener: () => {},
        };
        g['document'] = { addEventListener: () => {} };
        try {
            const adapters = await import(
                '../web-app/app/adapters/index.ts'
            ) as Record<string, unknown>;
            const { subscribeOnce } = await import(
                '../web-app/app/channels.ts'
            );
            const names = Object.keys(adapters)
                .filter(name => /^subscribe\w+Changes$/.test(name))
                .sort();
            assert(names.length > 0, 'no subscriptions found');
            for (const name of names) {
                const subscribe = adapters[name] as (
                    fn: () => void,
                ) => () => void;
                let fired = false;
                const errors: unknown[] = [];
                subscribeOnce(
                    subscribe,
                    () => { fired = true; },
                    err => { errors.push(err); },
                );
                assertStrictEquals(
                    fired, false, name + ' fired before a bell',
                );
                assertEquals(errors, [], name + ' errored');
            }
        } finally {
            const { deleteNotificationChannel } = await import(
                '../web-app/app/adapters/broadcast-channel.ts'
            );
            deleteNotificationChannel();
            delete g['window'];
            delete g['document'];
        }
    }),
);
```

- [ ] **Step 2: Run green, then prove failability**

Single-file run. Expected: PASS; add a temporary
`console.log(names.length)` if you want to see thirteen, and
remove it before committing.

Mutation: in `web-app/app/channels.ts`
`createSubscriptionChannel`'s returned `subscribe`, replace
`subscribe: (fn) => channel.subscribe(fn),` with
`subscribe: (fn) => { fn(); return channel.subscribe(fn); },`
(a synchronous replay). Re-run. Expected: FAIL — the first
name throws a `ReferenceError` (TDZ on `unsubscribe`) or
sets `fired`. `git checkout web-app/app/channels.ts`; PASS.
Record both.

- [ ] **Step 3: Remove the TODO bullet**

Delete from `## Critical functionality path`:

```
- `subscribeOnce`'s `const unsubscribe = subscribe(...)`
  would throw a TDZ ReferenceError if any `subscribe` fired
  its callback synchronously; all thirteen
  `subscribe<Entity>Changes` delegate to `createChannel`,
  so it is inert — guard only if that changes
```

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add tests/adapters-subscribe-silent.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Pin every adapter channel silent until a bell

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 16: Report an absent roster profile as absent (spec item 10)

**Files:**
- Modify: `web-app/app/adapters/members.ts:48-56` (helper
  deleted), `:105`, `:127`
- Modify: `tests/adapters-members-union.test.ts` (one test
  appended)
- Modify: `TODO.md` (`:206-208` deleted)

**Interfaces:** none new. `HumanProfile`'s `{ present:
false }` branch is the shape; every consumer already
branches on it.

- [ ] **Step 1: Write the red pin**

Append to `tests/adapters-members-union.test.ts`:

```ts
// A seat whose identity document carries no profile is an
// absent profile — never a present one full of empty
// strings. The roster fill (fillHumanMemberProfile) is what
// turns absence into a read; before it, the row says so.
Deno.test(
    'a seat whose identity has no profile reads as absent',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db, ctx } = await adminContext();
        const id = generateIdentifier();
        await ctx.PUT('identities/' + id, { kind: 'person' });
        const { seedSeat } = await import(
            './root-admin-fixture.ts'
        );
        await seedSeat(
            db, 'AjdvjuECVZEgZoFajaIEkg', id, 'member',
        );
        const row = (await getMembers(ctx)).find(
            m => m.idForLink() === id,
        );
        assert(row !== undefined && isHumanMember(row));
        assertStrictEquals(row.profile().present, false);
    }),
);
```

Single-file run `--filter 'reads as absent'`. Expected: FAIL
(`present` is `true`).

- [ ] **Step 2: Absence at both call sites; delete the helper**

In `web-app/app/adapters/members.ts` delete `:48-56`
(`emptyPersonProfile`), and replace both call sites:

`:105` (in `buildHumanMemberMap`):

```ts
            new HumanMember(
                seatedHumanParent(seat.identity_id),
                { present: false },
                { erased: true },
            ),
```

`:127` (in `getHumanMemberMap`):

```ts
                new HumanMember(
                    seatedHumanParent(id),
                    { present: false },
                    pii,
                ),
```

Re-run. Expected: PASS. Run the whole `./test` — the members
page fills profiles before rendering and the dashboard's
`featuredHumanMembers` already treated an empty department
as absent, so nothing else moves; if a presenter test goes
red, it was reading the fiction — report it, do not restore
the helper.

- [ ] **Step 3: Remove the TODO bullet**

Delete from `## Critical functionality path`:

```
- Roster rows carry a fabricated empty profile
  (`emptyPersonProfile`) —
  `web-app/app/adapters/members.ts:48`
```

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add web-app/app/adapters/members.ts \
    tests/adapters-members-union.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Report an absent roster profile as absent

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 17: Extract the human member create draft (spec item 11)

Refactor only, behind the existing green tests. `DEFAULT_DIM`
moves verbatim with the step; Task 18 deletes it.

**Files:**
- Modify: `web-app/app/presenters/human-member-detail.ts`
  (after `humanMemberPatchFromDraft`, `:115`)
- Modify: `web-app/app/presenters/index.ts:78-86` (export
  list)
- Modify: `web-app/members/index.ts:52` (constant deleted),
  `:459-478` (`submitHumanForm` calls the step)

**Interfaces:**
- Produces: `HumanMemberCreationDraft` and
  `humanMemberCreationFromDraft(draft): HumanMemberDraft` from
  `presenters/human-member-detail.ts`, re-exported from
  `presenters/index.ts`.

- [ ] **Step 1: The pure step**

In `web-app/app/presenters/human-member-detail.ts`, directly
after `humanMemberPatchFromDraft` (`:103-115`) add:

```ts
const DEFAULT_DIM = 50;

// The Add Member dialog's fields, as the roster collects
// them.
export interface HumanMemberCreationDraft {
    name: string;
    email: string;
    title: string;
    department: string;
    phone: string;
    bio: string;
}

// The create body from the dialog's draft — the sibling of
// humanMemberPatchFromDraft for the roster's Add Member.
export function humanMemberCreationFromDraft(
    draft: HumanMemberCreationDraft,
): HumanMemberDraft {
    return {
        name: draft.name,
        email: draft.email,
        title: draft.title,
        department: draft.department,
        strengths: [],
        team_dimensions: {
            driver: DEFAULT_DIM,
            analytical: DEFAULT_DIM,
            expressive: DEFAULT_DIM,
            amiable: DEFAULT_DIM,
        },
        phone: draft.phone,
        bio: draft.bio,
    };
}
```

(`HumanMemberDraft` is already imported as a type at `:23`.)

In `web-app/app/presenters/index.ts:78-86` add
`humanMemberCreationFromDraft,` after
`humanMemberPatchFromDraft,` and `type
HumanMemberCreationDraft,` after `type
HumanMemberDraftFields,`.

- [ ] **Step 2: The page calls the step**

In `web-app/members/index.ts`: delete `:52` (`const
DEFAULT_DIM = 50;` and its following blank line); add
`humanMemberCreationFromDraft,` to the `presenters/index.ts`
import (`:42-50`); replace `:459-478` in `submitHumanForm`:

```ts
    try {
        await postHumanMemberCreation(
            ctx,
            id,
            trimStrings({
                name,
                email,
                title,
                department: dept,
                strengths: [],
                team_dimensions: {
                    driver: DEFAULT_DIM,
                    analytical: DEFAULT_DIM,
                    expressive: DEFAULT_DIM,
                    amiable: DEFAULT_DIM,
                },
                phone,
                bio,
            }),
        );
```

with:

```ts
    try {
        await postHumanMemberCreation(
            ctx,
            id,
            trimStrings(humanMemberCreationFromDraft({
                name,
                email,
                title,
                department: dept,
                phone,
                bio,
            })),
        );
```

- [ ] **Step 3: Green throughout**

```bash
./validate
```

Expected: PASS with no test change. `grep -rn DEFAULT_DIM
web-app/` finds only the presenter file.

- [ ] **Step 4: Commit**

```bash
git add web-app/app/presenters/human-member-detail.ts \
    web-app/app/presenters/index.ts web-app/members/index.ts
git commit -m "$(cat <<'MSG'
Extract the human member create draft

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 18: Stop fabricating dimension scores on Add Member (spec item 12)

**Files:**
- Modify: `web-app/app/presenters/human-member-detail.ts`
  (`DEFAULT_DIM` deleted; `team_dimensions: {}`)
- Modify: `tests/presenter-member-detail.test.ts` (import;
  one test appended)
- Modify: `TODO.md` (`:209-210` deleted)

**Interfaces:** none new. `team_dimensions: {}` is what
`pickStringNumberRecord` (`api/validators.ts:565-577`) admits
and what `WorkingStylesPresenter.buildRows` renders as zero
rows; omitting the key is not admissible while title and
department ride the same whole-or-none PUT
(`validators.ts:800-812`).

- [ ] **Step 1: Write the red pin**

In `tests/presenter-member-detail.test.ts` add
`assertEquals` to the `@std/assert` import and
`humanMemberCreationFromDraft` to the
`human-member-detail.ts` import. Append:

```ts
// No page collects an assessment, so a fresh member records
// none: an empty map renders as zero rows, never as four
// fabricated 50% scores.
Deno.test('a fresh creation draft records no dimension scores',
() => {
    const body = humanMemberCreationFromDraft({
        name: 'Ada',
        email: 'ada@example.com',
        title: 'Engineer',
        department: 'Product',
        phone: '',
        bio: '',
    });
    assertEquals(body.team_dimensions, {});
    assertEquals(body.strengths, []);
});
```

Single-file run `--filter 'no dimension scores'`. Expected:
FAIL (four keys at 50).

- [ ] **Step 2: Delete the constant; record absence**

In `web-app/app/presenters/human-member-detail.ts` delete
`const DEFAULT_DIM = 50;` and its blank line, and replace the
`team_dimensions` literal in `humanMemberCreationFromDraft`:

```ts
        strengths: [],
        // No page collects an assessment, so none is
        // recorded — an empty map, never a fabricated
        // score.
        team_dimensions: {},
```

Re-run. Expected: PASS.

- [ ] **Step 3: Remove the TODO bullet**

Delete from `## Critical functionality path`:

```
- `DEFAULT_DIM` stands in for an assessment that never
  happened — `web-app/members/index.ts:52`
```

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add web-app/app/presenters/human-member-detail.ts \
    tests/presenter-member-detail.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Stop fabricating dimension scores on Add Member

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 19: Say why an empty working-styles card is empty (spec item 13)

**Files:**
- Modify: `web-app/app/presenters/working-styles.ts:1-13`
  (import), `:81-95` (`buildRows`)
- Modify: `tests/presenter-misc.test.ts` (one test appended
  beside the `WorkingStylesPresenter` tests, `:574-660`)

**Interfaces:**
- Consumes: `mutedEmptyNote(message): SafeHtml`
  (`presenters/empty-note.ts:6`).

- [ ] **Step 1: Write the red pin**

Append to `tests/presenter-misc.test.ts` after the last
`WorkingStylesPresenter` test:

```ts
Deno.test(
    'WorkingStylesPresenter says why an empty map renders'
    + ' no rows',
    () => {
        const out = new WorkingStylesPresenter({})
            .buildRows().toString();
        assertMatch(out, /No working-styles assessment yet\./);
        assertStrictEquals(/user-dim-row/.test(out), false);
    },
);
```

Single-file run `--filter 'says why'`. Expected: FAIL (empty
string).

- [ ] **Step 2: Render the note**

In `web-app/app/presenters/working-styles.ts` add
`import { mutedEmptyNote } from './empty-note.ts';` after the
adapters import, and replace `buildRows` (`:81-95`):

```ts
    buildRows(): SafeHtml {
        const entries = ORDER
            .filter(
                key => key in this.#dimensions,
            )
            .map(key => [
                key,
                this.#dimensions[key]!,
            ] as [DimensionKey, number]);
        if (entries.length === 0) {
            return mutedEmptyNote(
                'No working-styles assessment yet.',
            );
        }
        return html`${entries.map(
            ([key, value]) => this.#buildRow(
                key, value,
            ),
        )}`;
    }
```

Re-run. Expected: PASS.

- [ ] **Step 3: Validate and commit**

```bash
./validate
git add web-app/app/presenters/working-styles.ts \
    tests/presenter-misc.test.ts
git commit -m "$(cat <<'MSG'
Say why an empty working-styles card is empty

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 20: Refuse to remove the last admin seat (spec item 14)

Decision 7: guards live in the API. The actor is authorized;
the organization's state forbids — 409 `HTTP_CONFLICT`, not
the self-only revocation guard's 403 (that is for the wrong
actor). Self-removal by any other admin is allowed; access
ends at the next mint, refresh, or expiry
(`ARCHITECTURE.md:122-127`).

**Files:**
- Modify: `api/routes.ts:5739-5748` (the seat DELETE
  handler)
- Modify: `tests/api-organization-member-seat.test.ts` (two
  tests appended)
- Modify: `tests/api-membership-liveness.test.ts:58-63`
  (`adminDb()` gains a second admin seat; import `seedSeat`)

**Interfaces:** none new. The error body is `{ error: 'the
last admin seat cannot be removed' }`.

- [ ] **Step 1: Write the red pins**

Append to `tests/api-organization-member-seat.test.ts`:

```ts
// Decision 7: the last admin seat cannot be removed. The
// actor is authorized; the organization's state forbids —
// 409, the domain conflict, never the wrong-actor 403.
Deno.test('the last admin seat refuses removal', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', 'AjdvjuECVZEgZoFajaIEkg');
    const path = '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
        + 'XXZruirZyAOoRpNxaDnpSA';
    const refused = await handleRequest(db, req(
        'DELETE', path, admin,
    ));
    assertStrictEquals(refused.status, 409);
    assertEquals(await refused.json(), {
        error: 'the last admin seat cannot be removed',
    });
    const still = await handleRequest(db, req(
        'GET', path, admin,
    ));
    assertStrictEquals(still.status, 200);
});

Deno.test('an admin seat beside another admin is removable,'
+ ' the actor\'s own included',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const second = generateIdentifier();
    await seedSeat(
        db, 'AjdvjuECVZEgZoFajaIEkg', second, 'admin', AT,
    );
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', 'AjdvjuECVZEgZoFajaIEkg');
    const own = '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
        + 'XXZruirZyAOoRpNxaDnpSA';
    const removed = await handleRequest(db, req(
        'DELETE', own, admin,
    ));
    assertStrictEquals(removed.status, 204);
    const gone = await handleRequest(db, req(
        'GET', own, admin,
    ));
    assertStrictEquals(gone.status, 404);
    // The seat that remains is now the last admin.
    const last = await handleRequest(db, req(
        'DELETE',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/members/' + second,
        admin,
    ));
    assertStrictEquals(last.status, 409);
});
```

(`seedSeat`, `generateIdentifier`, `AT`, `req`,
`seedAdminSchema`, `organizationToken` are already in the
file.) Single-file run `--filter 'admin seat'`. Expected:
both FAIL (204 where 409 is expected).

- [ ] **Step 2: Guard inside the transaction, refuse after it**

Replace `api/routes.ts:5739-5748`:

```ts
        delete: (db, _p, _actor, messagePair) => {
            return db.transaction(
                MESSAGE_TABLES,
                async (view) => {
                    if (messagePair !== undefined) {
                        await appendMessagePair(view, messagePair);
                    }
                },
            );
        },
```

with:

```ts
        // The last admin seat cannot be removed: the actor
        // is authorized, the organization's state forbids.
        // The admin seats are derived INSIDE the transaction
        // — a row op — so two concurrent removals cannot
        // each see the other's seat; the refusal is thrown
        // after it, the invitations-domain shape.
        delete: async (
            db, p, _actor, messagePair, organization,
        ) => {
            const fenced = requireOrganization(organization);
            const identityId = param(p, 1);
            let lastAdmin = false;
            await db.transaction(
                MESSAGE_TABLES,
                async (view) => {
                    const admins = (
                        await deriveOrganizationMemberSeats(
                            view, fenced,
                        )
                    ).filter(seat => seat.type === 'admin');
                    if (
                        admins.length === 1
                        && admins[0]!.identity_id === identityId
                    ) {
                        lastAdmin = true;
                        return;
                    }
                    if (messagePair !== undefined) {
                        await appendMessagePair(view, messagePair);
                    }
                },
            );
            if (lastAdmin) {
                throw new ApiError(
                    'the last admin seat cannot be removed',
                    HTTP_CONFLICT,
                );
            }
        },
```

Re-run Step 1. Expected: PASS. If the 409 body's `error`
text is wrapped differently by the gate, read
`handleRequest`'s `ApiError` mapping and pin what it emits —
the status is the covenant.

- [ ] **Step 3: The liveness fixture gains a second admin**

In `tests/api-membership-liveness.test.ts` add `seedSeat` to
the `./root-admin-fixture.ts` import and replace `:58-63`:

```ts
async function adminDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedRootAdmin(db);
    return db;
}
```

with:

```ts
// A second admin seat: the tests below remove the root
// admin's seat to prove the claim-based fence, and the last
// admin seat refuses removal (Task 20 of the critical
// functionality path).
const SECOND_ADMIN_ID = 'uTGrEpVpODbNhDhDVdWeqQ';

async function adminDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedRootAdmin(db);
    await seedSeat(
        db, 'AjdvjuECVZEgZoFajaIEkg', SECOND_ADMIN_ID, 'admin',
    );
    return db;
}
```

Run the whole suite:

```bash
./test 2>&1 | tail -30
```

Expected: PASS — the four pins the spec names hold
(`api-organization-member-seat:265-300` deletes a member
seat; `api-membership-document:210` deletes a member seat;
`api-write-authorizer:210` deletes a foreign member seat →
404). Any other red is a fixture deleting an only admin —
give it a second admin the same way; the assertion does not
move.

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add api/routes.ts tests/api-organization-member-seat.test.ts \
    tests/api-membership-liveness.test.ts
git commit -m "$(cat <<'MSG'
Refuse to remove the last admin seat

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 21: Add the seat removal adapter (spec item 15)

The seat's DELETE, and the admin-seat read the UI's mirror
of the guard needs — both under HTTP-verb naming.

**Files:**
- Modify: `web-app/app/adapters/members.ts` (two exports
  appended after `postHumanMemberCreation`, `:248`)
- Modify: `tests/adapters-members.test.ts` (imports; two
  tests appended)

**Interfaces:**
- Produces: `deleteHumanMemberSeat(ctx: RequestContext, id:
  MemberId): Promise<void>` — DELETE then
  `humanMemberChanges.notify()`; `getAdminSeatIds(ctx:
  RequestContext): Promise<MemberId[]>` — the identity ids
  of the organization's admin seats.

- [ ] **Step 1: Write the red pins**

In `tests/adapters-members.test.ts` extend the imports:

```ts
import { assertEquals, assertRejects, assertStrictEquals } from
    '@std/assert';
import { deriveMembershipsForIdentity } from
    '../api/derive-memberships.ts';
import {
    RequestError,
    HTTP_NOT_FOUND,
} from '../api/http-errors.ts';
import {
    postHumanMemberCreation,
    featuredHumanMembers,
    getHumanMemberProfile,
    deleteHumanMemberSeat,
    getAdminSeatIds,
    type HumanMember,
    type HumanMemberDraft,
} from '../web-app/app/adapters/members.ts';
```

Append:

```ts
Deno.test('deleteHumanMemberSeat removes the seat', async () => {
    const { db, ctx } = await adminContext();
    const id = generateIdentifier();
    await seedHumanMember(db, id, 'Leaving Member');
    await deleteHumanMemberSeat(ctx, id);
    const err = await assertRejects(
        () => ctx.GET(
            'organizations/AjdvjuECVZEgZoFajaIEkg/members/' + id,
        ),
    ) as Error;
    assert(err instanceof RequestError);
    assertStrictEquals(err.status, HTTP_NOT_FOUND);
    assertEquals(await deriveMembershipsForIdentity(db, id), []);
});

Deno.test('getAdminSeatIds lists the admin seats only',
async () => {
    const { db, ctx } = await adminContext();
    const member = generateIdentifier();
    await seedHumanMember(db, member, 'Plain Member');
    assertEquals(
        await getAdminSeatIds(ctx),
        ['XXZruirZyAOoRpNxaDnpSA'],
    );
});
```

(add `assert` to the `@std/assert` import.) Single-file run.
Expected: FAIL at `deno check` (the two names do not exist);
under `--no-check`, a `TypeError` at the call.

- [ ] **Step 2: The adapter**

Append to `web-app/app/adapters/members.ts` after
`postHumanMemberCreation`:

```ts
// The seat's own DELETE — the identity survives; only its
// place in this organization goes. The API refuses the last
// admin seat (409); the page mirrors that guard through
// getAdminSeatIds below rather than discovering it here.
export async function deleteHumanMemberSeat(
    ctx: RequestContext,
    id: MemberId,
): Promise<void> {
    await ctx.DELETE(seatsCollection(ctx) + id);
    humanMemberChanges.notify();
}

export async function getAdminSeatIds(
    ctx: RequestContext,
): Promise<MemberId[]> {
    const seats = await ctx.GET<MembershipEntity[]>(
        seatsCollection(ctx),
    );
    return seats
        .filter(seat => seat.type === 'admin')
        .map(seat => seat.identity_id);
}
```

Re-run. Expected: PASS.

- [ ] **Step 3: Validate and commit**

```bash
./validate
git add web-app/app/adapters/members.ts tests/adapters-members.test.ts
git commit -m "$(cat <<'MSG'
Add the seat removal adapter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 22: Render Remove on member detail (spec item 16)

The actions slot gains Remove beside Back and Edit, hidden
for the last admin seat and shown for every other, the
viewer's own included; the confirm is the
`role="alertdialog"` pattern; its copy says access ends at
the next token refresh.

**Files:**
- Modify: `web-app/app/presenters/human-member-detail.ts`
  (imports `:10-21`; `buildReadonlyActionButtons` `:488-499`;
  the presenter constructor and `renderUpdate` `:531-584`;
  two exports added)
- Modify: `web-app/app/presenters/index.ts:78-86`
- Modify: `tests/presenter-member-detail.test.ts` (every
  `new HumanMemberDetailPresenter(` gains the second
  argument; four tests appended)

**Interfaces:**
- Produces: `interface SeatRemoval { readonly removable:
  boolean; readonly isSelf: boolean }`; `seatRemovalOf(
  adminSeatIds: readonly string[], memberId: string,
  viewerId: string): SeatRemoval`;
  `new HumanMemberDetailPresenter(member, removal:
  SeatRemoval)`. Markup: `#member-remove-btn` with
  `data-dialog-open="confirm-remove"`;
  `#confirm-remove-dialog` (`role="alertdialog"`) whose
  confirm button carries
  `data-member-action="confirm-remove"` and whose cancel
  carries `data-dialog-cancel="confirm-remove"`.

- [ ] **Step 1: Write the red pins**

In `tests/presenter-member-detail.test.ts` add
`assertEquals` to the `@std/assert` import and
`seatRemovalOf, type SeatRemoval` to the
`human-member-detail.ts` import. After `makeAIMember()` add:

```ts
const REMOVABLE: SeatRemoval = {
    removable: true, isSelf: false,
};
```

Give every existing `new HumanMemberDetailPresenter(
makeHumanMember())` the second argument `REMOVABLE` (the
edit presenter's constructor is unchanged). Append:

```ts
Deno.test(
    'a removable seat renders Remove and its confirm dialog',
    () => {
        const rec = makeRecordingContainer();
        new HumanMemberDetailPresenter(
            makeHumanMember(), REMOVABLE,
        ).renderShell(rec.container);
        const out = rec.allHtml();
        assertMatch(out, /id="member-remove-btn"/);
        assertMatch(out, /data-dialog-open="confirm-remove"/);
        assertMatch(out, /id="confirm-remove-dialog"/);
        assertMatch(out, /role="alertdialog"/);
        assertMatch(out, /data-member-action="confirm-remove"/);
        assertMatch(out, /data-dialog-cancel="confirm-remove"/);
        assertMatch(out, /next token refresh/);
        assertMatch(out, /Their access/);
    },
);

Deno.test('the viewer\'s own seat says so in the dialog', () => {
    const rec = makeRecordingContainer();
    new HumanMemberDetailPresenter(
        makeHumanMember(), { removable: true, isSelf: true },
    ).renderShell(rec.container);
    assertMatch(rec.allHtml(), /You lose access/);
});

Deno.test('the last admin seat offers no Remove', () => {
    const rec = makeRecordingContainer();
    new HumanMemberDetailPresenter(
        makeHumanMember(), { removable: false, isSelf: true },
    ).renderShell(rec.container);
    const out = rec.allHtml();
    assertStrictEquals(out.includes('confirm-remove'), false);
    assertStrictEquals(out.includes('member-remove-btn'), false);
    // Edit is still there.
    assertMatch(out, /data-member-action="edit"/);
});

Deno.test('seatRemovalOf mirrors the last-admin guard', () => {
    assertEquals(
        seatRemovalOf(['a'], 'a', 'b'),
        { removable: false, isSelf: false },
    );
    assertEquals(
        seatRemovalOf(['a', 'b'], 'a', 'a'),
        { removable: true, isSelf: true },
    );
    assertEquals(
        seatRemovalOf(['a'], 'b', 'b'),
        { removable: true, isSelf: true },
    );
    assertEquals(
        seatRemovalOf([], 'b', 'a'),
        { removable: true, isSelf: false },
    );
});
```

Single-file run. Expected: FAIL (`deno check`: the second
constructor argument and the two names; `--no-check`: no
`member-remove-btn` in the markup).

- [ ] **Step 2: The removal shape and the affordance**

In `web-app/app/presenters/human-member-detail.ts` add
`iconTrash,` to the `../icons.ts` import. After
`humanMemberCreationFromDraft` (Task 17's addition) add:

```ts
// Whether this seat may be removed from member detail, and
// whose it is — the dialog's copy differs for the viewer's
// own seat. The API refuses the last admin seat (409); the
// page mirrors the guard by not offering the button.
export interface SeatRemoval {
    readonly removable: boolean;
    readonly isSelf: boolean;
}

export function seatRemovalOf(
    adminSeatIds: readonly string[],
    memberId: string,
    viewerId: string,
): SeatRemoval {
    const lastAdmin = adminSeatIds.length === 1
        && adminSeatIds[0] === memberId;
    return {
        removable: !lastAdmin,
        isSelf: viewerId === memberId,
    };
}
```

Replace `buildReadonlyActionButtons` (`:488-499`):

```ts
function buildReadonlyActionButtons(
    removal: SeatRemoval,
): SafeHtml {
    return html`
        <button
            class="${
                'btn btn-outline gap-2'
            }"
            id="member-edit-btn"
            data-member-action="edit">
            ${iconEdit(ICON_SIZE.base, '')} Edit
        </button>
        ${buildRemoveAffordance(removal)}`;
}

// Remove and its confirm, the identities page's alertdialog
// shape (web-app/identities/detail.html). Rendered inside
// the page container so the page's own click delegate
// drives open, cancel, and backdrop through
// handleDialogClick. Absent for the last admin seat.
function buildRemoveAffordance(
    removal: SeatRemoval,
): SafeHtml {
    if (!removal.removable) {
        return html``;
    }
    const consequence = removal.isSelf
        ? 'You lose access to this organization at your'
            + ' next token refresh.'
        : 'Their access to this organization ends at'
            + ' their next token refresh.';
    return html`
        <button
            class="${
                'btn btn-destructive gap-2'
            }"
            id="member-remove-btn"
            data-dialog-open="confirm-remove">
            ${iconTrash(ICON_SIZE.base, '')} Remove
        </button>
        <dialog id="confirm-remove-dialog"
            class="dialog dialog-narrow"
            role="alertdialog"
            aria-labelledby="confirm-remove-title"
            aria-describedby="confirm-remove-message">
            <div class="dialog-header">
                <h3 id="confirm-remove-title"
                    class="dialog-title">
                    Remove this member?</h3>
            </div>
            <p id="confirm-remove-message"
                class="text-sm text-muted">
                ${consequence}
            </p>
            <div class="dialog-footer">
                <button class="btn btn-outline"
                    data-dialog-cancel="confirm-remove">
                    Cancel
                </button>
                <button class="btn btn-destructive"
                    data-member-action="confirm-remove">
                    Remove
                </button>
            </div>
        </dialog>`;
}
```

In `HumanMemberDetailPresenter` (`:531-584`):

```ts
export class HumanMemberDetailPresenter {
    readonly #member: HumanMember;
    readonly #removal: SeatRemoval;

    constructor(member: HumanMember, removal: SeatRemoval) {
        this.#member = member;
        this.#removal = removal;
    }
```

and in `renderUpdate`:

```ts
        mutateSlot(
            container,
            '.member-actions-slot',
            buildReadonlyActionButtons(this.#removal),
        );
```

In `web-app/app/presenters/index.ts:78-86` add
`seatRemovalOf,` and `type SeatRemoval,` to the export list.

- [ ] **Step 3: The page compiles again**

`deno check` now names `web-app/members/detail.ts:95-97`
(`new HumanMemberDetailPresenter(state.member)`). The page
must resolve the removal shape to construct the presenter,
so that resolution lands here, true and complete; the click
that the button and dialog need is Task 23's story. In
`web-app/members/detail.ts` add `seatRemovalOf, type
SeatRemoval` to the `presenters/index.ts` import and
`getAdminSeatIds` to the adapters import; add after
`let pageContainer`:

```ts
let removal: SeatRemoval | null = null;

function removalOf(): SeatRemoval {
    if (removal === null) {
        throw new Error('seat removal not resolved');
    }
    return removal;
}
```

change `buildPresenter`'s human reading branch to
`new HumanMemberDetailPresenter(state.member, removalOf())`,
and resolve it in `init`'s `loadInto`:

```ts
    const ctx = sessionContext();
    await loadInto({
        container,
        skeleton: buildSkeleton('detail', 4),
        fetch: async () => ({
            member: await loadMemberByEitherKind(memberId),
            adminSeatIds: await getAdminSeatIds(ctx),
        }),
        retry: () => init(params),
        onData: ({ member, adminSeatIds }) => {
            if (!member) {
                navigateTo('members');
                return;
            }
            removal = seatRemovalOf(
                adminSeatIds, memberId, ctx.identity.id,
            );
```

(the rest of `onData` is unchanged). The click that the
button and dialog need is Task 23's story; until then the
button opens nothing, which `./validate` cannot see and the
walk is not running.

Re-run Step 1. Expected: PASS. `./validate` green.

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add web-app/app/presenters/human-member-detail.ts \
    web-app/app/presenters/index.ts web-app/members/detail.ts \
    tests/presenter-member-detail.test.ts
git commit -m "$(cat <<'MSG'
Render Remove on member detail

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 23: Wire member removal on the detail page (spec item 17)

**Files:**
- Modify: `web-app/members/detail.ts` (imports; `refresh`
  `:241-249`; `onClick` `:265-275`; `performRemove` added)
- Modify: `TEST-PLAN.md:1414` (setup paragraph), B28
  (`:1453-1465`)
- Modify: `ARCHITECTURE.md:137-142` (one sentence)
- Modify: `TODO.md` (`:290-296` deleted)

**Interfaces:**
- Consumes: `deleteHumanMemberSeat(ctx, id)`,
  `getAdminSeatIds(ctx)`, `closeDialog(id)`,
  `handleDialogClick(target, e)`.

- [ ] **Step 1: Wire the clicks and the removal**

In `web-app/members/detail.ts` add
`deleteHumanMemberSeat,` to the adapters import and

```ts
import {
    closeDialog,
    handleDialogClick,
} from '../app/dialog.ts';
```

Replace `refresh` (`:241-249`):

```ts
async function refresh(
    memberId: string,
): Promise<void> {
    if (!pageContainer || !state) return;
    const ctx = sessionContext();
    const fresh = await loadMemberByEitherKind(
        memberId,
    );
    removal = seatRemovalOf(
        await getAdminSeatIds(ctx), memberId, ctx.identity.id,
    );
    state = reduceRefresh(state, fresh);
    rerender();
}
```

In `onClick` (`:255-275`), directly after `if (!target)
return;`:

```ts
    // The Remove dialog lives inside the container, so its
    // open, cancel, and backdrop clicks arrive here — one
    // voice with every other dialog surface.
    if (handleDialogClick(target, e)) return;
```

and after the `save` branch:

```ts
    if (action === 'confirm-remove') {
        closeDialog('confirm-remove');
        void performRemove();
        return;
    }
```

Add after `handleSave`:

```ts
async function performRemove(): Promise<void> {
    if (!state || state.variant !== 'human') return;
    const ctx = sessionContext();
    const memberId = state.member.idForLink();
    try {
        await deleteHumanMemberSeat(ctx, memberId);
    } catch (err) {
        reportFault(ctx, 'Failed to remove member', err);
        return;
    }
    showToast('Member removed', 'success');
    navigateTo('members');
}
```

- [ ] **Step 2: TEST-PLAN — B28 regains its restore branch; the setup names the live path**

In the setup paragraph (`TEST-PLAN.md:1414`), after the
sentence ending `to enter the zero-membership state.` insert:

```
Member detail's Remove strips any seat but the last admin's live, so a zero-membership identity can also be MADE: remove a seeded single-seat member's seat, then sign in as them.
```

Replace B28 (`:1453-1465`):

```
- [ ] **B28** Sign in as an untouched seeded member (any non-Riley credential from crank stdout, e.g. the demo admin), then load a gated page. PASS: lands on the `?return=` target / dashboard as before — the org gate does not fire for an identity that reaches an org (B16/B18 unaffected by the new gate). After PASS, sign back in as Riley for B29.
  Pin: exploratory — the live landing on the target;
       no test exercises `resolveOrganizationGate`
       with a non-empty organization list against a
       page other than `invitations`, so nothing
       today decides that the gate passes a
       non-empty-org identity through on an ordinary
       gated page like `dashboard` (the only cited
       assertion for a non-empty list uses
       `invitations` as the page, so it cannot tell
       "fires for any page" from "fires only for
       invitations" apart)
```

with:

```
- [ ] **B28** As the demo admin, open a seeded single-seat member's detail page (one no later case names), click Remove, confirm in the alertdialog (its copy says access ends at the next token refresh). PASS: a "Member removed" toast, the roster no longer lists them. Sign in as that member. PASS: lands on `invitations/index.html` — the gate fires for a made orphan exactly as for the seeded one. Then sign in as an untouched seeded member (e.g. the demo admin) and load a gated page. PASS: lands on the `?return=` target / dashboard as before — the org gate does not fire for an identity that reaches an org (B16/B18 unaffected). Also confirm the demo admin's own detail page shows Remove (another admin seat exists in the seed) and that no Remove appears where an organization has one admin. After PASS, sign back in as Riley for B29.
  Pin: tests/api-organization-member-seat.test.ts
       'the last admin seat refuses removal' (decides
       the guard) and 'an admin seat beside another
       admin is removable, the actor's own included'
       (decides self-removal); tests/presenter-member-detail.test.ts
       'a removable seat renders Remove and its
       confirm dialog' and 'the last admin seat offers
       no Remove' (decide the affordance);
       tests/adapters-members.test.ts
       'deleteHumanMemberSeat removes the seat'
       (decides the wire DELETE); exploratory — the
       live removal, the made orphan's landing, and
       the untouched member's landing on the target;
       no test exercises `resolveOrganizationGate`
       with a non-empty organization list against a
       page other than `invitations`
```

Confirm the seed carries a second Stark admin before writing
"another admin seat exists in the seed" — `grep -n "'admin'"
api/mock-data/members.ts api/mock-data/seed-constants.ts`; if
the demo admin is Stark's only admin, drop that clause and
say instead "the demo admin's own detail page shows no
Remove — it is Stark's only admin seat".

- [ ] **Step 3: ARCHITECTURE.md — one removal sentence**

Replace `ARCHITECTURE.md:140-142`:

```
`"member"`. The members roster is seats plus `/ai-agents`
(not members, not identities). The system member is the
constant `SYSTEM_MEMBER_ID` (`api/types.ts`), not a seat.
```

with:

```
`"member"`. The members roster is seats plus `/ai-agents`
(not members, not identities). Member detail removes a
seat by its DELETE; the last admin seat refuses (409), and
a removed member's access ends at the next mint, refresh,
or expiry per the named covenant. The system member is the
constant `SYSTEM_MEMBER_ID` (`api/types.ts`), not a seat.
```

- [ ] **Step 4: Remove the TODO bullet**

Delete from `## Critical functionality path`:

```
- Member-removal affordance under members/identities —
  zero-membership is seed-produced today (Riley Okafor);
  no page deletes a membership row. Oracle: removing a
  member's last seat lands that identity on
  `invitations/index.html` at next boot (TEST-PLAN
  B25–B29 driven live); restores B28's original
  "restore the deleted membership row" branch
```

- [ ] **Step 5: Validate and commit**

```bash
./validate
git add web-app/members/detail.ts TEST-PLAN.md ARCHITECTURE.md TODO.md
git commit -m "$(cat <<'MSG'
Wire member removal on the detail page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

The live landing on `invitations/index.html` stays Layer 3.

---

### Task 24: Pause a toast under pointer or focus (spec item 18)

**Files:**
- Modify: `web-app/app/toast.ts:135-137` (the discarded
  timer becomes `armAutoDismiss`)
- Create: `tests/toast-pause.test.ts`
- Modify: `TEST-PLAN.md:5866-5868` (I23 gains the pause)
- Modify: `TODO.md` (`:310` deleted)

**Interfaces:** none new. A paused toast still counts toward
`MAX_TOASTS` and can still be evicted — the cap stays a
bound; `tests/browser/toasts.test.ts:55-69` holds.

- [ ] **Step 1: Write the red pin**

`tests/toast-pause.test.ts`:

```ts
import { assertStrictEquals } from '@std/assert';
import { FakeTime } from '@std/testing/time';
import { showToast } from '../web-app/app/toast.ts';

// A DOM stub that records listeners and classes per
// element. FakeTime owns setTimeout, clearTimeout, and
// Date.now; nothing here stubs a timer.
type Listener = () => void;

interface ElementStub {
    className: string;
    id: string;
    textContent: string;
    children: ElementStub[];
    lastElementChild: ElementStub | null;
    classes: Set<string>;
    listeners: Map<string, Listener[]>;
    classList: { add: (c: string) => void };
    setAttribute: () => void;
    addEventListener: (type: string, fn: Listener) => void;
    prepend: (child: ElementStub) => void;
    appendChild: (child: ElementStub) => void;
    remove: () => void;
}

function element(): ElementStub {
    const node: ElementStub = {
        className: '',
        id: '',
        textContent: '',
        children: [],
        lastElementChild: null,
        classes: new Set<string>(),
        listeners: new Map<string, Listener[]>(),
        classList: {
            add: (c: string) => { node.classes.add(c); },
        },
        setAttribute: () => {},
        addEventListener: (type, fn) => {
            const fns = node.listeners.get(type);
            if (fns === undefined) {
                node.listeners.set(type, [fn]);
                return;
            }
            fns.push(fn);
        },
        prepend: (child) => { node.children.unshift(child); },
        appendChild: (child) => { node.children.push(child); },
        remove: () => {},
    };
    return node;
}

function fire(node: ElementStub, type: string): void {
    const fns = node.listeners.get(type);
    if (fns === undefined) {
        throw new Error('no listener for ' + type);
    }
    for (const fn of fns) fn();
}

function installDom(): {
    toast: () => ElementStub;
    uninstall: () => void;
} {
    const g = globalThis as Record<string, unknown>;
    const previousDocument = g['document'];
    const previousSession = g['sessionStorage'];
    const created: ElementStub[] = [];
    g['document'] = {
        getElementById: () => null,
        createElement: () => {
            const node = element();
            created.push(node);
            return node;
        },
        body: element(),
    };
    g['sessionStorage'] = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
    };
    return {
        toast: () => {
            const node = created.find(
                n => n.className.startsWith('toast '),
            );
            if (node === undefined) {
                throw new Error('no toast painted');
            }
            return node;
        },
        uninstall: () => {
            g['document'] = previousDocument;
            g['sessionStorage'] = previousSession;
        },
    };
}

function closing(node: ElementStub): boolean {
    return node.classes.has('toast--closing');
}

Deno.test(
    'a toast pauses its auto-dismiss under the pointer and'
    + ' resumes with the remainder on leave',
    () => {
        using time = new FakeTime();
        const dom = installDom();
        try {
            showToast('Saved', 'success');
            const toast = dom.toast();
            time.tick(4000);
            fire(toast, 'mouseenter');
            time.tick(6000);
            assertStrictEquals(closing(toast), false);
            fire(toast, 'mouseleave');
            time.tick(1999);
            assertStrictEquals(closing(toast), false);
            time.tick(1);
            assertStrictEquals(closing(toast), true);
        } finally {
            dom.uninstall();
        }
    },
);

Deno.test(
    'a toast pauses under focus and resumes on focusout',
    () => {
        using time = new FakeTime();
        const dom = installDom();
        try {
            showToast('Saved', 'success');
            const toast = dom.toast();
            fire(toast, 'focusin');
            time.tick(6000);
            assertStrictEquals(closing(toast), false);
            fire(toast, 'focusout');
            time.tick(6000);
            assertStrictEquals(closing(toast), true);
        } finally {
            dom.uninstall();
        }
    },
);

Deno.test(
    'a toast stays paused while either pointer or focus'
    + ' remains',
    () => {
        using time = new FakeTime();
        const dom = installDom();
        try {
            showToast('Saved', 'success');
            const toast = dom.toast();
            fire(toast, 'mouseenter');
            fire(toast, 'focusin');
            fire(toast, 'mouseleave');
            time.tick(6000);
            assertStrictEquals(closing(toast), false);
            fire(toast, 'focusout');
            time.tick(6000);
            assertStrictEquals(closing(toast), true);
        } finally {
            dom.uninstall();
        }
    },
);
```

Single-file run. Expected: FAIL — `fire` throws `no listener
for mouseenter` (the parent registers none).

- [ ] **Step 2: Arm, pause, resume**

Replace `web-app/app/toast.ts:135-137`:

```ts
    container.prepend(toast);
    setTimeout(closeToast, TOAST_DURATION_MS);
}
```

with:

```ts
    container.prepend(toast);
    armAutoDismiss(toast, closeToast);
}

// The auto-dismiss pauses while the pointer or focus rests
// on the toast and resumes with the remainder on leave —
// either presence holds it. A paused toast still counts
// toward MAX_TOASTS and can still be evicted: the cap stays
// a bound.
function armAutoDismiss(
    toast: HTMLElement,
    close: () => void,
): void {
    let remainingMs = TOAST_DURATION_MS;
    let armedAt = Date.now();
    let timer: number | undefined = setTimeout(
        close, remainingMs,
    );
    let pointerOver = false;
    let focusWithin = false;
    const pause = (): void => {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
        remainingMs -= Date.now() - armedAt;
    };
    const resume = (): void => {
        if (timer !== undefined) return;
        armedAt = Date.now();
        timer = setTimeout(close, remainingMs);
    };
    const settle = (): void => {
        if (pointerOver || focusWithin) {
            pause();
        } else {
            resume();
        }
    };
    toast.addEventListener('mouseenter', () => {
        pointerOver = true;
        settle();
    });
    toast.addEventListener('mouseleave', () => {
        pointerOver = false;
        settle();
    });
    toast.addEventListener('focusin', () => {
        focusWithin = true;
        settle();
    });
    toast.addEventListener('focusout', () => {
        focusWithin = false;
        settle();
    });
}
```

Re-run. Expected: PASS (3). Also run
`tests/toast-pending.test.ts` — its `installDom` stub records
no listeners and must still pass (`addEventListener: () =>
{}`).

- [ ] **Step 3: Layer 2 holds**

```bash
./test-browser
```

Expected: `tests/browser/toasts.test.ts` green, 'the stack
caps at five toasts' included. If Chrome cannot launch, say
so in the report; do not claim it.

- [ ] **Step 4: TEST-PLAN I23 gains the pause**

Replace `TEST-PLAN.md:5866-5868`:

```
- [ ] **I23** Trigger a toast (e.g. save an idea). PASS: toast appears at top-center of the viewport (fixed to `top: var(--space-4); left: 50%; translateX(-50%)`), auto-dismisses after ~6 seconds with fade-out. (Toast position was migrated from bottom-right to top-center.)
  Pin: exploratory — the live position, the
       ~6-second auto-dismiss, and the fade
```

with:

```
- [ ] **I23** Trigger a toast (e.g. save an idea). PASS: toast appears at top-center of the viewport (fixed to `top: var(--space-4); left: 50%; translateX(-50%)`), auto-dismisses after ~6 seconds with fade-out. Hover the toast before it dismisses: it stays while the pointer rests on it and resumes the remaining time on leave; Tab into its close button and it stays the same way. (Toast position was migrated from bottom-right to top-center.)
  Pin: tests/toast-pause.test.ts 'a toast pauses its
       auto-dismiss under the pointer and resumes with
       the remainder on leave' and 'a toast pauses
       under focus and resumes on focusout' (decide the
       pause and the remainder); exploratory — the live
       position, the ~6-second auto-dismiss, and the
       fade
```

- [ ] **Step 5: Remove the TODO bullet**

Delete `- Toast pause on hover and focus` from
`## Critical functionality path`.

- [ ] **Step 6: Validate and commit**

```bash
./validate
git add web-app/app/toast.ts tests/toast-pause.test.ts \
    TEST-PLAN.md TODO.md
git commit -m "$(cat <<'MSG'
Pause a toast under pointer or focus

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 25: Leave history alone when a rename finds no target (spec item 19, presenter half)

On a miss the three methods return `this.#snapshot` — the
no-op idiom — and neither queue nor note.

**Files:**
- Modify: `web-app/app/presenters/flow-designer.ts:808-888`
  (three methods; two private predicates added)
- Modify: `tests/flow-designer-presenter.test.ts` (imports;
  three tests appended)
- Modify: `tests/flow-designer-open.test.ts` (one test
  appended)
- Modify: `TODO.md` (`:228-238` narrowed to the page half)

**Interfaces:** none new. `withNodeNamed`,
`withNodeTaskInstructions`, `withEdgeNamed` return the held
snapshot (same object) on a miss.

- [ ] **Step 1: Write the red pins**

In `tests/flow-designer-presenter.test.ts` extend the
`flow-history.ts` import:

```ts
import {
    appendToRedoStack,
    buildFlowHistorySnapshot,
    canRedoFlowEdits,
    type FlowVersion,
} from '../web-app/app/flow-history.ts';
```

Append:

```ts
// A target deleted during the 800 ms debounce is a miss:
// the presenter hands back the snapshot it holds, queues no
// save, and clears no redo.
function redoOfOne(): ReturnType<typeof appendToRedoStack> {
    const version: FlowVersion = {
        id: 'vErSiOnOnEaAaAaAaAaAaw',
        flowId: emptyGraph.id,
        name: 'Test Flow',
        isLocked: false,
        isAutoLayout: false,
        isAutoFit: false,
        lockTimeout: 0,
        nodes: [],
        edges: [],
        createdAt: '2026-01-01T00:00:00.000000Z',
    };
    return appendToRedoStack(
        buildFlowHistorySnapshot(true), version,
    );
}

Deno.test(
    'withNodeNamed on a missing node returns the held'
    + ' snapshot and keeps the redo stack',
    () => {
        const snap = buildInitialFlowSnapshot(
            { ...emptyGraph, nodes: [node('a')] },
            800, 600, [], [], [],
        );
        const presenter = new FlowDesignerPresenter(
            snap, 800, 600, redoOfOne(),
        );
        const next = presenter.withNodeNamed('missing', 'typed');
        assertStrictEquals(next, presenter.snapshot());
        assertStrictEquals(
            canRedoFlowEdits(presenter.history()), true,
        );
    },
);

Deno.test(
    'withNodeTaskInstructions on a missing node keeps the'
    + ' redo stack',
    () => {
        const snap = buildInitialFlowSnapshot(
            { ...emptyGraph, nodes: [node('a')] },
            800, 600, [], [], [],
        );
        const presenter = new FlowDesignerPresenter(
            snap, 800, 600, redoOfOne(),
        );
        const next = presenter
            .withNodeTaskInstructions('missing', 'do it');
        assertStrictEquals(next, presenter.snapshot());
        assertStrictEquals(
            canRedoFlowEdits(presenter.history()), true,
        );
    },
);

Deno.test(
    'withEdgeNamed on a missing edge keeps the redo stack',
    () => {
        const snap = buildInitialFlowSnapshot(
            { ...emptyGraph, nodes: [node('a'), node('b')] },
            800, 600, [], [], [],
        );
        const presenter = new FlowDesignerPresenter(
            snap, 800, 600, redoOfOne(),
        );
        const next = presenter.withEdgeNamed('missing', 'go');
        assertStrictEquals(next, presenter.snapshot());
        assertStrictEquals(
            canRedoFlowEdits(presenter.history()), true,
        );
    },
);
```

In `tests/flow-designer-open.test.ts`, after 'opening a flow
does not append pairs' (`:160-…`), append a test of the same
shape whose tail is:

```ts
Deno.test(
    'a rename with no target appends no pair',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await freshDb();
        putClientFacade(wrapInPageAdapter(db));
        putSessionToken(DEV_TOKEN);
        const flowId = generateIdentifier();
        await createFlow(db, DEV_TOKEN, flowId);
        const ctx = createRequestContext(db, DEV_TOKEN);
        const graph = await getFlowGraph(ctx, flowId);
        const snap = buildInitialFlowSnapshot(
            graph, CANVAS_W, CANVAS_H, [], [], [],
        );
        const presenter = new FlowDesignerPresenter(
            snap, CANVAS_W, CANVAS_H,
            buildFlowHistorySnapshot(graph.hasUndoHistory),
        );
        const n = await flowDocumentPairCount(db, flowId);
        presenter.withNodeNamed('missing', 'typed');
        await enqueueFlowSave(flowId, async () => undefined);
        assertStrictEquals(
            await flowDocumentPairCount(db, flowId), n,
        );
    }),
);
```

(`freshDb`, `createFlow`, `NULL_STORAGE`,
`flowDocumentPairCount`, `CANVAS_W/H` are already in the
file.) Single-file runs. Expected: the three presenter pins
FAIL (`canRedoFlowEdits` false — `recordFlowMutation` emptied
the stack); the open-test pin FAILS (`n + 1` — the phantom
PUT was stored: `buildFlowPutBody` mints a fresh trio, so
the octets differ and the ledger keeps it).

- [ ] **Step 2: A miss is the no-op idiom**

In `web-app/app/presenters/flow-designer.ts`, before
`withNodeNamed` (`:808`) add:

```ts
    // A target deleted during the debounce is a miss: the
    // snapshot the presenter holds, no save, no history
    // note — the same idiom as the locked guard.
    #hasNode(nodeId: string): boolean {
        return this.#snapshot.nodes.some(
            n => n.id === nodeId,
        );
    }

    #hasEdge(edgeId: string): boolean {
        return this.#snapshot.edges.some(
            e => e.id === edgeId,
        );
    }
```

and in each of the three methods, directly after the
`#guardLocked()` return:

`withNodeNamed` and `withNodeTaskInstructions`:

```ts
        if (!this.#hasNode(nodeId)) {
            return this.#snapshot;
        }
```

`withEdgeNamed`:

```ts
        if (!this.#hasEdge(edgeId)) {
            return this.#snapshot;
        }
```

`applyUpdateNode` / `applyUpdateEdge` stay bare maps. Re-run
both files. Expected: PASS.

- [ ] **Step 3: Narrow the TODO bullet to the page half**

Replace the bullet at `TODO.md:228-238`:

```
- A panel rename whose target is deleted during the
  800 ms debounce still saves and still clears redo.
  `withNodeNamed`, `withNodeTaskInstructions`, and
  `withEdgeNamed` fire `#queueSave` and `#noteMutation`
  unconditionally, so an `applyUpdateNode` that matches
  nothing still ships a phantom idempotent PUT and a
  spurious redo clear — a disclosed trade-off, not a
  regression. Oracle:
  `web-app/app/presenters/flow-designer.ts:808-885`;
  the debounced schedules are
  `web-app/flows/detail.ts:1349-1391`
```

with:

```
- A panel rename whose target is deleted during the
  800 ms debounce still advances history: the presenter
  now hands back its held snapshot on a miss, but the
  page's three debounced schedules still `commit()` it,
  and `commit()` records a mutation. Oracle:
  `web-app/flows/detail.ts:1375-1418`, `:235-237`
```

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add web-app/app/presenters/flow-designer.ts \
    tests/flow-designer-presenter.test.ts \
    tests/flow-designer-open.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Leave history alone when a rename finds no target

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 26: Skip the commit when a debounced edit changed nothing (spec item 19, page half)

`commit()`'s own history advance (`:235-237`) must not fire
for a miss — the live redo clear is commit's, not the
presenter's. No result type, no debouncer cancel, no
existence check at fire: the page compares the returned
snapshot to the one the presenter holds and tells a
continuation to commit.

**Files:**
- Modify: `web-app/flows/detail.ts:1375-1418` (three sites);
  one export added beside `reduceDesignerShortcut` (`:1971`)
- Modify: `tests/flows-detail-shortcuts.test.ts` (import; one
  test appended)
- Modify: `TODO.md` (the bullet Task 25 left, deleted)

**Interfaces:**
- Produces: `commitDebouncedEdit(held: FlowSnapshot, next:
  FlowSnapshot, commitEdit: (snapshot: FlowSnapshot) => void):
  void` exported from `web-app/flows/detail.ts`.

- [ ] **Step 1: Write the red pin**

In `tests/flows-detail-shortcuts.test.ts` add
`commitDebouncedEdit,` to the `../web-app/flows/detail.ts`
import and a type import for `FlowSnapshot` from the module
`web-app/flows/detail.ts` imports it from (`grep -n
"FlowSnapshot" web-app/flows/detail.ts | head -3` names it).
Append:

```ts
// A debounced edit that found no target hands back the
// snapshot the presenter holds; the page must not commit
// it — commit() would advance history for nothing.
Deno.test('a debounced edit that changed nothing does not'
+ ' commit; one that did commits once', () => {
    const held = {} as FlowSnapshot;
    const committed: FlowSnapshot[] = [];
    commitDebouncedEdit(
        held, held, snapshot => { committed.push(snapshot); },
    );
    assertStrictEquals(committed.length, 0);
    const next = { ...held };
    commitDebouncedEdit(
        held, next, snapshot => { committed.push(snapshot); },
    );
    assertStrictEquals(committed.length, 1);
    assertStrictEquals(committed[0], next);
});
```

Single-file run. Expected: FAIL (`commitDebouncedEdit` is not
exported).

- [ ] **Step 2: The pure step and the three sites**

In `web-app/flows/detail.ts`, directly before
`reduceDesignerShortcut` (`:1971`) add:

```ts
// A debounced property edit commits only when the
// presenter produced a new snapshot. A miss — the target
// deleted during the debounce — hands back the snapshot
// the presenter already holds; commit() would rebuild,
// save through the presenter's own queue, and advance
// history for nothing. Tell, don't ask: the caller says
// what a commit is, and it runs only for a change.
export function commitDebouncedEdit(
    held: FlowSnapshot,
    next: FlowSnapshot,
    commitEdit: (snapshot: FlowSnapshot) => void,
): void {
    if (next === held) return;
    commitEdit(next);
}
```

Replace the three schedules (`:1375-1418`):

```ts
            if (id === 'prop-node-name') {
                const nodeId = pageState
                    .presenter().selectedNodeId();
                if (nodeId === null) return;
                pageState.saveDebouncer().schedule(
                    () => {
                        const presenter = pageState.presenter();
                        commitDebouncedEdit(
                            presenter.snapshot(),
                            presenter.withNodeNamed(
                                nodeId, value,
                            ),
                            next => commit(
                                next, { advanceHistory: true },
                            ),
                        );
                    },
                );
            } else if (
                id === 'prop-node-instructions'
            ) {
                const nodeId = pageState
                    .presenter().selectedNodeId();
                if (nodeId === null) return;
                pageState.saveDebouncer().schedule(
                    () => {
                        const presenter = pageState.presenter();
                        commitDebouncedEdit(
                            presenter.snapshot(),
                            presenter.withNodeTaskInstructions(
                                nodeId, value,
                            ),
                            next => commit(
                                next, { advanceHistory: true },
                            ),
                        );
                    },
                );
            } else if (
                id === 'prop-edge-name'
            ) {
                const edgeId = pageState
                    .presenter().selectedEdgeId();
                if (edgeId === null) return;
                pageState.saveDebouncer().schedule(
                    () => {
                        const presenter = pageState.presenter();
                        commitDebouncedEdit(
                            presenter.snapshot(),
                            presenter.withEdgeNamed(
                                edgeId, value,
                            ),
                            next => commit(
                                next, { advanceHistory: true },
                            ),
                        );
                    },
                );
            }
```

The presenter is read once at fire time, as before — every
`commit()` constructs a new one. Re-run. Expected: PASS.

- [ ] **Step 3: Delete the TODO bullet**

Delete the bullet Task 25 left (`- A panel rename whose
target is deleted during the` … `:235-237``).

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add web-app/flows/detail.ts \
    tests/flows-detail-shortcuts.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Skip the commit when a debounced edit changed nothing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 27: Emit the marquee rect on every canvas build (spec item 20)

Decision 9: no reproduction. The fix makes the lookup
uniform with its three unconditional siblings, which closes
the class of failure under any interleaving. The FSM keeps
extent; CSS `:110-117` and FLOW-CANVAS.md's frozen-snapshot
rule (`:67-69`) are untouched.

**Files:**
- Modify: `web-app/app/flow-graph.ts:1369-1378`
- Create: `tests/flow-graph-marquee.test.ts`
- Modify: `TODO.md` (`:239-251` deleted)

**Interfaces:** none new. `.flow-marquee` is always present;
zero-sized at the origin when `marqueeRect` is null.

- [ ] **Step 1: Write the red pin**

`tests/flow-graph-marquee.test.ts`:

```ts
import { assertMatch } from '@std/assert';
import { buildGraphSvg } from
    '../web-app/app/flow-graph.ts';
import type { GraphNode } from '../api/types.ts';

function node(id: string): GraphNode {
    return {
        id,
        name: 'N',
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds: [],
        attributes: [],
        taskInstructions: '',
    };
}

function render(
    marqueeRect: { x: number; y: number; w: number; h: number }
        | null,
): string {
    return buildGraphSvg(
        [node('a')],
        [],
        0, 0, 800, 600,
        { kind: 'none' },
        false, false, marqueeRect,
        new Map(),
        '',
    ).toString();
}

// The marquee rect is always built — zero-sized when idle
// — so a gesture frame that lands on a rebuild from the
// idle snapshot finds its target, the same unconditional
// presence as .flow-grid-bg, .flow-grid-dots, and
// .flow-connect-preview.
Deno.test('an idle canvas still carries the marquee rect',
() => {
    const svg = render(null);
    assertMatch(svg, /class="flow-marquee"/);
    assertMatch(
        svg,
        /<rect x="0" y="0" width="0" height="0" aria-hidden="true" class="flow-marquee"\/>/,
    );
});

Deno.test('a selecting canvas carries the drawn rect', () => {
    const svg = render({ x: 10, y: 20, w: 30, h: 40 });
    assertMatch(
        svg,
        /<rect x="10" y="20" width="30" height="40" aria-hidden="true" class="flow-marquee"\/>/,
    );
});
```

(The `selection` argument's shape is
`tests/flow-graph-locked.test.ts:63`'s `{ kind: 'none' }`;
match that file's call exactly.) Single-file run. Expected:
the first test FAILS (no `flow-marquee` in the idle markup).

- [ ] **Step 2: Emit it always**

Replace `web-app/app/flow-graph.ts:1369-1378`:

```ts
    let marqueeMarkup = '';
    if (marqueeRect) {
        marqueeMarkup = '<rect'
            + ` x="${marqueeRect.x}"`
            + ` y="${marqueeRect.y}"`
            + ` width="${marqueeRect.w}"`
            + ` height="${marqueeRect.h}"`
            + ' aria-hidden="true"'
            + ' class="flow-marquee"/>';
    }
```

with:

```ts
    // Always in the markup, zero-sized when idle, so a
    // gesture frame landing on a rebuild from the idle
    // snapshot finds its target (flow-gesture-render.ts
    // mustFind) — the same unconditional presence as the
    // grid and the connect-preview layer.
    const marquee = marqueeRect === null
        ? IDLE_MARQUEE_RECT
        : marqueeRect;
    const marqueeMarkup = '<rect'
        + ` x="${marquee.x}"`
        + ` y="${marquee.y}"`
        + ` width="${marquee.w}"`
        + ` height="${marquee.h}"`
        + ' aria-hidden="true"'
        + ' class="flow-marquee"/>';
```

and add, at module scope near `buildGrid` (`:385`):

```ts
const IDLE_MARQUEE_RECT = { x: 0, y: 0, w: 0, h: 0 };
```

Re-run. Expected: PASS. Run `tests/flow-graph-locked.test.ts`,
`tests/flow-graph-geometry.test.ts`, `tests/flow-graph-xss.test.ts`
too — none asserts the rect's absence; if one does, it was
pinning the defect and the task report names it.

- [ ] **Step 3: Remove the TODO bullet**

Delete from `## Critical functionality path`:

```
- `mustFind` throws `gesture frame target missing:
  .flow-marquee` when a selecting-gesture rAF paints an
  SVG rebuilt without the rect. `renderMarqueeFrame`
  (`web-app/app/flow-gesture-render.ts`) looks up
  `.flow-marquee`; `buildGraphSvg` emits that rect only
  while `marqueeRect` is set. Mid-gesture rAF skips
  commit, so a resize `update()` rebuilds from the idle
  snapshot and omits the rect while `bindInteractions`
  still holds selecting state. Not global:
  `bindInteractions` is called only from
  `web-app/flows/detail.ts`, and Billing's `init()` is
  empty. TEST-PLAN.md G42's Billing console observation
  is not a Billing listener
```

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add web-app/app/flow-graph.ts tests/flow-graph-marquee.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Emit the marquee rect on every canvas build

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 28: Anchor the mock seed to its UTC day (spec item 24)

Decision 3: the cliff is real — the stats window is ninety
days and 2026-09-13 is nine days out. The pin lands green
today and proves failability by mutation.

**Files:**
- Modify: `api/mock-data/seed-kit.ts:1-5, 20-24`
- Create: `tests/mock-data-stats-window.test.ts`
- Modify: `TODO.md` (`:203-205` deleted; `:473-475`'s
  stale-cite clause; `:1250-1251` Sequencing hold)

**Interfaces:** `now` stays a `Date` export; its value is
the start of the current UTC day.

- [ ] **Step 1: Confirm nothing compares a seeded instant to a literal**

```bash
grep -rln "2026-06-15" tests/ api/ web-app/ | cat
grep -rn "from '../api/mock-data/seed-kit.ts'\|from './seed-kit.ts'" tests/ api/ | cut -d: -f1 | sort -u
```

Expected: no file names the anchor's date; the importers
are the five the spec counts plus the seed modules, and none
of the tests among them asserts a literal date — read each
`now` use (`tests/mock-data-lead-to-close.test.ts:45` passes
`now.getTime()` through; `tests/tz/` imports none). A test
that DID pin a literal seeded date would be the false
prophet — report it before moving on.

- [ ] **Step 2: Write the pin**

`tests/mock-data-stats-window.test.ts`:

```ts
import { assert } from '@std/assert';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import { getFlowStats } from
    '../web-app/app/adapters/flow-stats.ts';
import { deriveFlows } from '../api/derive-flows.ts';
import { seededMockDb } from './mock-seed.ts';

const FLOW_NAME = 'Customer Onboarding';

// The seed follows the calendar: whatever day it is seeded,
// Customer Onboarding's closed sojourns fall inside the
// ninety-day stats window measured from the wall clock. A
// fixed anchor clips every one of them to zero ninety days
// on — the 2026-09-13 cliff this pin retires for good.
Deno.test(
    'the seeded Customer Onboarding flow has completed work'
    + ' inside the live stats window',
    async () => {
        const db = await seededMockDb();
        const flow = (
            await deriveFlows(db, 'AjdvjuECVZEgZoFajaIEkg')
        ).find(f => f.name === FLOW_NAME);
        assert(flow !== undefined, FLOW_NAME + ' not seeded');
        const ctx = createRequestContext(
            db, await organizationToken(),
        );
        const { model } = await getFlowStats(
            ctx, flow.id, Date.now(),
        );
        assert(
            model.completedWorkOrderCount > 0,
            'no completed work order inside the window',
        );
    },
);
```

Single-file run. Expected: PASS today (the fixed anchor is
81 days back). If it FAILS, today is past the cliff and the
pin is the spec's red — proceed to Step 3 either way.

- [ ] **Step 3: The seed's clock is today's UTC day**

Replace `api/mock-data/seed-kit.ts:1-5`:

```ts
// Shared seed primitives for the mock-data composition: one
// clock, one PRNG, one id alphabet. These are pure and draw-order
// preserving — the per-entity seed modules thread the same rng
// through them so the seeded world stays byte-for-byte stable
// (pinned by tests/mock-data-fingerprint.test.ts).
```

with:

```ts
// Shared seed primitives for the mock-data composition: one
// clock, one PRNG, one id alphabet. These are pure and draw-order
// preserving — the per-entity seed modules thread the same rng
// through them so two seeds on one day are byte-for-byte alike.
```

Replace `:20-24`:

```ts
// A FIXED anchor, never the wall clock: date-derived seed ids
// (objective scores embed scoredAt) must not drift across UTC
// days, or the fingerprint becomes a false prophet. Bump
// deliberately to refresh how current the demo dates look.
export const now = new Date('2026-06-15T00:00:00.000Z');
```

with:

```ts
// The seed's clock is the start of the current UTC day —
// day-quantized, so the Honolulu pass and a same-day re-seed
// agree — and current, so the ninety-day stats window
// (web-app/app/adapters/flow-stats.ts) always holds the
// seeded sojourns: every seeded instant sits at or before
// this anchor, and a fixed one clips them all to zero ninety
// days on. Date-derived seed ids follow the day; nothing
// under tests/ hashes the seed.
export const now = startOfUtcDay(new Date());

function startOfUtcDay(instant: Date): Date {
    return new Date(Date.UTC(
        instant.getUTCFullYear(),
        instant.getUTCMonth(),
        instant.getUTCDate(),
    ));
}
```

Run the whole suite:

```bash
./test 2>&1 | tail -30
```

Expected: PASS in both passes — the `1453` and `92` pins are
op-counts and hash draws, not dated ids; the Honolulu pass
sees the same UTC day.

- [ ] **Step 4: Prove the pin can fail**

Mutation: `export const now = startOfUtcDay(new Date(
Date.now() - 120 * 86_400_000));`. Re-run
`tests/mock-data-stats-window.test.ts`. Expected: FAIL
(`completedWorkOrderCount` is 0). `git checkout
api/mock-data/seed-kit.ts` and re-apply Step 3 (or `git
apply` a patch saved before the mutation). PASS. Record both.

- [ ] **Step 5: TODO — three edits**

Delete from `## Critical functionality path`:

```
- Mock seed's fixed 2026-06-15 anchor — after
  2026-09-13 serial-mode FS3 carries in-flight heat
  only
```

In the Later-work bullet at `:466-483` replace:

```
  the states row half is stripped; `api/mock-data/seed-kit.ts`
  cites `tests/mock-data-fingerprint.test.ts`, which is
  gone. The run-four remediation's Evidence
```

with:

```
  the states row half is stripped. The run-four
  remediation's Evidence
```

Delete from `## Sequencing`:

```
- The mock-seed anchor bullet activates after
  2026-09-13
```

- [ ] **Step 6: Validate and commit**

```bash
./validate
git add api/mock-data/seed-kit.ts tests/mock-data-stats-window.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Anchor the mock seed to its UTC day

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

### Task 29: Narrow the bullets this sweep leaves (spec item 27)

Docs only; LAST. After it, `## Critical functionality path`
holds exactly two bullets.

**Files:**
- Modify: `TODO.md` `## Critical functionality path` (the
  replay residue Task 9 left; the R6/R7 bullet)

**Interfaces:** none.

- [ ] **Step 1: The replay residue, in the spec's words**

Replace the bullet Task 9 left:

```
- An inner pair of a composed operation skipped while
  the top-level pair landed still answers 201:
  `appendMessagePair` returns void and the gate never
  holds inner hashes (`api/message-pair.ts:686-701`)
```

with:

```
- An inner pair of a composed operation skipped while
  the top-level pair landed answers 201;
  `appendMessagePair` returns void and the gate never
  holds inner hashes (`api/message-pair.ts:686-701`).
  Oracle: a composed create whose inner hash collides
  with an earlier pair
```

- [ ] **Step 2: R6/R7, measured**

Replace:

```
- The run-four remediation's remaining seams — R6 and
  R7, whose "toy" clauses need a Layer 3 observation
  before any rewrite. G9's staleness was the corrupted
  test name, restored by the small-items sweep
```

with:

```
- The run-four remediation's remaining seams — R6 and
  R7. R6 holds in a stronger form: no picker renders for
  `select`. R7's primary clause is false: `regex` is
  always offered and a second pick adds a second row
  (`web-app/app/presenters/record-detail.ts:838-871,
  901-909`; `api/validators.ts:2759-2775` accepts
  duplicates). The walk decides whether that is a
  defect; the pin
  (`tests/presenter-record-detail.test.ts`) makes any
  rewrite honest. G9's staleness was the corrupted test
  name, restored by the small-items sweep
```

- [ ] **Step 3: Read the section once**

```bash
sed -n '/^## Critical functionality path/,/^## Later work/p' TODO.md
```

Expected: the header, its one-line intro, exactly two
bullets (the residue and R6/R7), then `## Later work`. Any
other bullet is a task that did not close its own — go back
to that task's step, do not strike it here.

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add TODO.md
git commit -m "$(cat <<'MSG'
Narrow the bullets this sweep leaves

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MaA1DP4svCwSeMxHCEpAFN
MSG
)"
```

---

## Completion checklist (whole plan)

- [ ] 30 commits on `2026-09-04-critical-functionality-path`
  after the spec commit (`fb421d74`): the plan, then the
  spec's 29 in a topological order of the graph, each
  subject ≈50 chars with the two trailer lines.
- [ ] `git log --oneline master..HEAD` shows one concern per
  commit; no commit both moves and changes content (Task 2
  is a verbatim move; Task 17 moves `DEFAULT_DIM` verbatim
  and Task 18 deletes it).
- [ ] `./validate` green on every commit (`git rebase master`
  first if master moved; amend until every commit is green).
- [ ] `./test-all` green at the tip — Layer 1 plus
  `./test-browser` with `toasts.test.ts` (the cap test)
  passing. If Chrome cannot launch, report exactly that; do
  not fast-forward on an unrun Layer 2.
- [ ] `grep -rn "TEST_OPERATION_ID" . --include='*.ts'
  --exclude-dir=.worktrees --exclude-dir=.git` is empty.
- [ ] `grep -rn "validateAttributeDocumentCreate\|validateAttributeDocumentReplace\|emptyPersonProfile\|DEFAULT_DIM\|NESTED_ATTRIBUTE_CORE_KEYS" api/ web-app/ tests/`
  is empty.
- [ ] `grep -n "JWT_HMAC_SIGNING_KEY" postgres-seed postgres-wipe`
  is empty; `build:101` still names it.
- [ ] `EXPECTED_MESSAGE_PAIR_COUNT = 1453` and the `92`
  actuals pin are byte-identical to master.
- [ ] Every pin that landed green (Tasks 3, 4, 6, 12, 15,
  28) has its mutation's red recorded in a task report.
- [ ] TODO.md: `## Critical product path` counts thirteen
  with item 4 the membership profile; `## Critical
  functionality path` holds exactly the replay residue and
  the R6/R7 bullet; the GPU note sits last under `## Later
  work`; `## Sequencing` names `9 → 7`, `6 → 11`, and
  `Item 4 precedes routing the roster through the profile`,
  and no longer holds the anchor date.
- [ ] TEST-PLAN.md: B28 carries the removal branch and its
  pins; the B25–B29 setup names the live removal path; I23
  names the pause pins. Nothing else in the file changed.
- [ ] API.md, ARCHITECTURE.md, AGENTS.md each changed one
  passage (replay 200; seat removal sentence; the wrapper
  pin cite).
- [ ] Land: from the main checkout, `git merge --ff-only
  2026-09-04-critical-functionality-path`, then
  `git worktree remove
  .worktrees/2026-09-04-critical-functionality-path &&
  git branch -d 2026-09-04-critical-functionality-path`
  (AGENTS.md § Worktrees).

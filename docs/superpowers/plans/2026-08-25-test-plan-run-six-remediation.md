# Test-Plan Run Six Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Remediate the seven FAIL clusters from the
2026-08-25 TEST-PLAN run — the Workbox Active tab silently
emptying under live claims (F2/WB5a), the blank/missing
objective lifecycle rows in project history (K/K30), the
empty-list pages that never subscribe to cross-tab updates
(SV/SV8b), the silent idea-create no-op (AA14), the two
stale-form-state bugs (AA-Obj, B13), and the AA slice's
missing Record fixture (AA33/AA34) — and record the
latent defects the investigation surfaced in TODO.md.

**Architecture:** Fifteen tasks, one commit each, executed
by one implementer subagent at a time in dependency order
on the main checkout (no worktrees, no branches — master
only, linear history). Code changes ride TDD (red pin →
fix → green) wherever a node-testable seam exists; two
DOM-wiring fixes (Tasks 11, 12) follow the repo's
established no-CLI-test precedent for page wiring and are
witnessed by the next browser run. Doc wording rides the
commit of the change that makes it true.

**Tech Stack:** TypeScript ES2024 strict
(`node --strip-types`), `node:test` on the memory backend,
no frameworks. Gate: `./validate` (tsc, two-TZ test
passes, 78-char lint, `org` identifier ban, retired-vocab
lint, doc line-count ceilings, later-work single-home
gate, SVG/API doc drift checks).

**Spec:** The seven mitigation stubs under
`docs/superpowers/test-plan-mitigations/` (committed by
Task 1):
`2026-08-25-AA-AA-Obj.md`, `2026-08-25-AA-AA14.md`,
`2026-08-25-AA-AA33.md`, `2026-08-25-B-B13.md`,
`2026-08-25-F2-WB5a.md`, `2026-08-25-K-K30.md`,
`2026-08-25-SV-SV8b.md` — plus the Rulings below, which
record where six read-only investigations corrected or
sharpened a stub's suspected mechanism. Where a stub and a
Ruling disagree, the Ruling wins: each one was verified in
source (WB5a by controlled experiment against the memory
backend).

## Global Constraints

Copied from AGENTS.md and the run-four precedent; every
task's requirements include these.

- **Base:** master at `cad3f1d5` (the run's build SHA).
  Work directly on master; never branch, never merge,
  never push. No worktrees.
- **One concern per commit.** Subject ≈50 chars,
  present-tense imperative, no body prose. Every commit
  message ends with exactly these two trailer lines:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  and `Claude-Session: <executing session URL>` (this
  planning session:
  https://claude.ai/code/session_013fwTVgN4TTfNt9Wzire6u5
  — an executing session substitutes its own URL).
- **`./validate` green before every commit.** It works on
  a dirty tree, so run it BEFORE `git commit`. A red
  gate aborts the task — fix before committing.
- **Voice:** 78-char max lines in every file `./validate`
  lints (`*.ts`, `*.html`, `*.css` under `api/`,
  `web-app/`, `tests/`, `shared/`, `server/`, and every
  root `*.md` except TEST-PLAN.md); 4-space indent; no
  trailing whitespace; final newline; no inline styles
  (CSS custom properties + classes); no `org`
  abbreviation in identifiers — always `organization`.
- **Tests:** red before green where a task says red;
  never weaken an existing assertion (covenant flips are
  enumerated in Rulings 3 — nowhere else). Single-file
  run:
  `TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \`
  `node --strip-types --import ./tests/hmac-test-key.ts \`
  `--test tests/<file>.test.ts`
  Full suite: `./test`. `tsc` does NOT type-check
  `tests/` (tsconfig include stops at `web-app/`, `api/`,
  `shared/`), so a changed arity is red at RUNTIME under
  `--strip-types`, not at `tsc`.
- **Counts that move exactly once:**
  `EXPECTED_SLICE_MESSAGE_PAIRS` 509 → 514
  (`tests/test-plan-slices.test.ts:48`, Task 13, nowhere
  else). **Never touch** `EXPECTED_MESSAGE_PAIR_COUNT`
  or any garden/mock-seed count.
- **Never edit** dated specs or plans under
  `docs/superpowers/` (AUDIT.md: "history after the
  run") — including the seven mitigation stubs after
  Task 1 commits them. This plan file is the one
  exception: executors tick its checkboxes while it sits
  untracked, and Task 15 commits it.
- **This plan file is committed up front** (owner call,
  2026-08-25, superseding the run-four
  untracked-during-execution lifecycle). Executors tick
  checkboxes in the tracked file as they work; Task 15
  commits the fully ticked state. No task in this plan
  builds or serves. Browser re-verification of every fix
  belongs to the next TEST-PLAN run.
- **Doctrine riders on every task:** validators at the
  gate, never downstream; SafeHtml from presenters
  (`html` tagged templates / `trusted`); RequestContext
  as the first argument to adapter calls; snake_case
  wire, camelCase domain; HTTP-verb adapter naming
  (`getNoun` / `putNoun` / `deleteNoun` /
  `postNounOperation`); no untyped `any` from external
  boundaries; transaction bodies await only row ops
  (validators, crypto, `serializeWire` run OUTSIDE the
  tx).

## Rulings

Where this plan resolves a stub ambiguity or corrects a
stub's suspected mechanism, the resolution is recorded
here; tasks argue from these.

1. **WB5a's mechanism is the claim filter, not graph
   staleness.** The stub suspected a
   `buildInboxItems`/`transitionsByWo` derivation going
   stale after edge delete+undo. A controlled experiment
   through the real adapters refuted that: node and edge
   ids SURVIVE delete+undo (`putFlow` upserts by existing
   id and tombstones the missing edge;
   `POST flows/:id/undo` replays the target body's graph
   verbatim, reviving the same edge id), work-order
   graphs are frozen at creation and immune to flow
   edits, and every work order derives a correct item
   when claims are ignored. The observed 0-item Active
   tab is `isClaimedAndUnfinished` silently `continue`-ing
   every claimed, unfinished work order out of BOTH tabs
   (`web-app/app/presenters/workbox-inbox.ts`) — and
   every work order on that flow held a live 8-hour
   claim: creation auto-claims
   (`states: [start, postStart, 'claimed']` in
   `work-orders-mutations.ts`), the detail page claims on
   load with no release on navigation, and the hunter's
   own verify-via-direct-URL step re-claimed each one.
   The fix (Task 3) restores the invariant *an unarchived
   work order is always visible in the Active inbox* by
   REPRESENTING claims ("In progress — {name}" badge)
   instead of vanishing them. WB5a's own case text
   mandates this reading: "the Workbox Active tab
   continues showing every unclaimed/in-progress work
   order". The narrower hide-only-foreign-claims variant
   would still hide others' in-progress work and is
   rejected. Task 2 additionally pins the refuted
   hypothesis (delete+undo integrity) so an id-rewriting
   regression can never masquerade as this bug again.
2. **K30 is three gaps across two layers, not a typo'd
   kind string.** (a) The objectives `/versions/` wire
   emits `{id, organization_id, position, state}` only —
   no `at`, no `member_id` — so the renderer HAS no facts
   to print; (b) neither the adapter filter
   (`state === 'archived'` per VERSION, not per
   transition) nor the presenter union can represent a
   reactivation at all — the API ledger records the
   transition and every layer above discards it; the
   per-version filter also mints phantom duplicate
   archivals from echo PUTs; (c) archival rows are
   segregated and appended after all dated rows,
   violating K30's chronological covenant. Fix chain
   (Tasks 4–6), bottom-up along the covenant
   `api/types.ts` already documents ("Ledger facts (at,
   event id) live on the pair / etag / versions list"):
   stamp `etag` / `at` / `member_id` on versions index
   rows for the snapshot families uniformly (flows keep
   their StateEntity branch untouched); replace the
   archival stream with a transition-detecting
   `getObjectiveLifecycleEvents`; render both kinds as
   dated rows that THROW on a missing definition exactly
   as baseline/actual do — degrade visibly, never to
   em-dashes.
3. **Covenant flips — the complete list.** Three existing
   pins codify the defects and legitimately invert; no
   other existing assertion may change:
   - `tests/workbox-inbox.test.ts` "buildInboxItems hides
     a work order with an active claim that is not yet
     finished" — DELETED and replaced by a
     visibility-with-claimant pin (Task 3). WB5a's case
     text is the higher covenant.
   - `tests/presenter-idea.test.ts`
     "IdeaCreatePresenter.render disables the submit
     button while the draft is empty" — flips to "keeps
     submit clickable" (Task 10). AA14's case text is the
     higher covenant: a mute disabled button is the
     Swallowed-Failure mechanism itself.
   - `tests/presenter-project-score-history.test.ts`
     "archival event row labels the archive" — DELETED
     and replaced by three strictly stronger pins (dated
     archival row, reactivation row, chronological
     interleave) in Task 6. The old test asserted only
     the label string — the weak covenant that let blank
     rows ship.
   In each case the replacement asserts strictly more
   than the original. This is the spec changing, not the
   test bending to failing code.
4. **AA33 resolves seed-side (stub option a).** The
   record-creation UI is covered once, in R (R2–R10);
   grafting ~6 gesture-heavy duplicate steps into AA
   duplicates that coverage. The codebase already voted:
   `SLICE_ENTITY_IDS` reserves `aa-record-customer`,
   `aa-attr-1`, `aa-attr-2`, `aa-state-record-customer`
   with zero call sites — the fixture was anticipated.
   Three attributes are seeded, not two: AA33 consumes
   one pick and AA34 says "select 2–3" more. A record
   must also be BOUND for the picker to list attributes
   (`web-app/flows/detail.ts:1599-1604` fetches
   attributes only for `boundRecordId`), and the binding
   cannot be seeded — AA's flow is minted in the UI at
   AA26 — so AA33's case text gains one prerequisite
   sentence: bind via the designer header's "Record:"
   dropdown (the R11/R12-exercised path). Both ride
   Task 13, one commit.
5. **SV8b resolves via a one-shot armed in `onEmpty`.**
   Exactly four sites are affected — ideas, records,
   projects, flows: the card-list pages that pair
   `emptyState` with subscribe-inside-the-`onData`
   continuation (full 18-site survey in Task 9). Moving
   subscribe into `init` stacks subscriptions on every
   Try-Again retry (all four use `retry: init`) and
   needs scattered guards; an always-fires `loadInto`
   lifecycle hook bakes that same re-entrancy footgun
   into the shared abstraction (`loadInto` re-runs by
   design). Instead: `subscribeOnce` in
   `web-app/app/channels.ts` (Task 8); each page's
   `onEmpty` arms a one-shot that re-runs `init` on the
   first change bell (Task 9). The empty branch is
   reachable only when nothing was wired, so exactly one
   live subscription exists at all times, by
   construction. `loadInto` itself is untouched.
6. **The versions-row stamp is family-generic by
   design.** Task 4 stamps `etag`/`at`/`member_id` inside
   the one shared `versionSnapshotsAt`, so ideas,
   projects, record-types, and work-orders versions rows
   gain the fields alongside objectives. That is the
   Uniformity commandment, the documented ledger-facts
   covenant, and the smaller diff; existing wire tests
   for those families assert by property access and are
   unaffected (verified). Flows' StateEntity branch
   (which already carries `etag`) is untouched.
7. **The stubs are committed, then never edited, never
   deleted.** Run-four committed its stubs (`88d4e4f8`)
   and later deleted them under an explicit spec mandate;
   run five left no such mandate and neither does this
   run. The stubs are this campaign's binding spec — they
   stay tracked so the plan's Spec pointer stays live.
8. **Discovered latents are recorded, not fixed.** The
   investigations surfaced six adjacent defects/warts
   outside the seven-stub scope (identities dialog stale
   fields; flows/stats has no change subscription;
   ideas/records header create button never returns
   after an empty→populated live transition; the 8-hour
   claim-on-load UX; the G/V5 plan ambiguity; the G42
   stray marquee listener). Fixing any of them here
   violates the diff-matches-the-story article; TODO.md
   is the sanctioned single home (the `./validate`
   later-work gate). Task 14 records them.

## Dependency graph

### Tasks

| # | Task | Primary files | Model |
|---|---|---|---|
| 1 | Commit the seven mitigation stubs | docs/superpowers/test-plan-mitigations/ | haiku |
| 2 | Pin inbox derivation across edge delete+undo | tests/workbox-inbox.test.ts | sonnet |
| 3 | Claimed work orders stay visible in Active | presenters/workbox-inbox.ts, its test | opus |
| 4 | Versions index rows carry pair facts | api/document-family.ts, wire test | sonnet |
| 5 | Objective lifecycle event stream | adapters/objectives.ts, its test | sonnet |
| 6 | History renders lifecycle rows | project-score-history.ts, projects/detail.ts | opus |
| 7 | Pin loadInto's branch contract | tests/loading-states.test.ts (new) | sonnet |
| 8 | subscribeOnce channel helper | app/channels.ts, tests/channels.test.ts | sonnet |
| 9 | Empty list pages re-init on the first bell | 4 list pages, new page-level test | opus |
| 10 | Idea create speaks its validation | idea-create.ts, ideas/create.ts, test | sonnet |
| 11 | Clear add-objective fields on dialog open | organization/index.ts | haiku |
| 12 | Clear auth field errors on mode toggle | auth/index.ts | haiku |
| 13 | Seed the AA slice Customer Profile record | api/test-plan-slices.ts, its test, TEST-PLAN | opus |
| 14 | Record discovered latents in TODO.md | TODO.md | haiku |
| 15 | Commit the completed plan | this file | haiku |

### Edges

Legend: **S** = semantic (output consumed / correctness
order), **F** = file collision (same file, serialize),
**O** = ordering for history readability (soft).

```
1 →everything (O: the spec enters history first)
2 →3  (F: tests/workbox-inbox.test.ts; S: 3's fix must
       not disturb what 2 pins)
4 →5  (S: 5 consumes the at/member_id fields 4 stamps)
5 →6  (S: 6 consumes getObjectiveLifecycleEvents;
       F: adapters/objectives.ts, its test)
7 →9  (O: 9 leans on the branch contract 7 pins)
8 →9  (S: 9 consumes subscribeOnce)
3 →14, 9→14 (O: TODO wording assumes those fixes shipped)
14→15 (O: the plan's last box ticks after 14)
```

### Waves (levelization over S+F edges)

Execution is SEQUENTIAL — one implementer at a time (the
subagent-driven-development rule: never dispatch parallel
implementers; AGENTS.md forbids worktrees, so there is
exactly one working tree). Waves state ORDERING FREEDOM,
not concurrency: tasks in the same wave touch disjoint
files and may run in any order; when a task stalls in a
fix loop, pick any other unblocked task instead of
waiting.

| Wave | Tasks |
|---|---|
| A | 1 |
| B | 2, 4, 7, 8, 10, 11, 12, 13 |
| C | 3, 5, 9 |
| D | 6 |
| E | 14 |
| F | 15 |

The default order (1, 2, 3, … 15) is one valid
topological sort — use it unless a stall forces a detour.
Safe detours from the two chains (2→3, 4→5→6): Tasks 7→8,
10, 11, 12, 13 touch disjoint files throughout.

### Execution protocol

1. Follow superpowers:subagent-driven-development: fresh
   implementer per task, task review (spec + quality) per
   task, scoped re-reviews, final whole-branch review
   (model: opus) over `cad3f1d5..HEAD`.
2. One implementer at a time. A review may overlap the
   NEXT task's dispatch only if the reviewed task's
   commit is already on master and the next task touches
   none of the same files (the edges above answer that).
3. Each task ends: `./validate` green → commit with the
   task's message + trailers → tick the task's boxes
   here.
4. Doc-only tasks (1, 14, 15) still run `./validate` —
   the line-count, lint, vocabulary, and later-work
   gates bite on docs.

## Subagent briefing (repo law — read before dispatching)

Every implementer AND reviewer dispatch prompt MUST begin
with the literal phrase `Go to Medium Church!` — it loads
the church-of-code skill's Medium scroll in the
subagent's session. A subagent unproselytized is a
heathen given a hammer. After the invocation, the
dispatch pushes down what the scripture cannot know:

- **Voice:** 78-char max line, 4-space indent, no inline
  styles (CSS custom properties + classes), present-tense
  imperative ~50-char commit subject, the two trailer
  lines from Global Constraints.
- **Commandments touched:** each task's brief carries its
  "Doctrine" line — name them.
- **Abominations risked:** same line — name them.
- **Patterns to match:** RequestContext as the first
  argument to adapter calls; SafeHtml from presenters
  (`html` tagged templates / `trusted`); snake_case wire,
  camelCase domain; HTTP-verb adapter naming
  (`getNoun` / `putNoun` / `postNounOperation`);
  validators at the gate, never downstream; transaction
  bodies await only row ops; no untyped `any` from
  external boundaries; `noUncheckedIndexedAccess` is on —
  index access returns `T | undefined`, so a `!` or a
  guard follows every indexed read.

---

### Task 1: Commit the seven mitigation stubs

**Doctrine:** the Office of the Commit (ABC — what isn't
committed cannot be restored); risks nothing.

**Files:**
- Commit (already on disk, untracked):
  `docs/superpowers/test-plan-mitigations/`
  `2026-08-25-AA-AA-Obj.md`, `2026-08-25-AA-AA14.md`,
  `2026-08-25-AA-AA33.md`, `2026-08-25-B-B13.md`,
  `2026-08-25-F2-WB5a.md`, `2026-08-25-K-K30.md`,
  `2026-08-25-SV-SV8b.md`

**EXECUTED by the planning session, 2026-08-25 — commit
`80ff87b4`. The boxes below record that execution;
implementers start at Task 2.**

**Interfaces:**
- Consumes: nothing.
- Produces: the campaign's binding spec, in history —
  every later task cites these paths.

- [x] **Step 1: Verify the seven files and only those**

Run: `git status --short docs/superpowers/`
Expected: exactly
`?? docs/superpowers/test-plan-mitigations/` (this plan
file is committed separately — the stubs commit carries
only the seven specs).

Run: `ls docs/superpowers/test-plan-mitigations/`
Expected: exactly the seven `2026-08-25-*.md` files.

- [x] **Step 2: Validate**

Run: `./validate`
Expected: green (docs under `docs/` are not linted, but
the gate must be green before every commit).

- [x] **Step 3: Commit**

```bash
git add docs/superpowers/test-plan-mitigations
git commit -m "Add run-six FAIL mitigation specs" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    -m "Claude-Session: <executing session URL>"
```

---

### Task 2: Pin inbox derivation across edge delete+undo

**Doctrine:** Commandments I (Reliability), IV (Logic);
risks the Sin of Test Weakening (touch NO existing test)
and Unbidden Helper Code (one green guard, no fixture
framework).

This is a GREEN guard, committed alone: it pins the
mechanism Ruling 1 refuted (graph identity survives edge
delete+undo, so the inbox derivation keeps working) so an
id-rewriting regression can never reproduce WB5a's
symptom through the graph path. It must pass as written;
if it fails, STOP — Ruling 1's premise is wrong for this
tree, report and await the master.

**Files:**
- Test: `tests/workbox-inbox.test.ts` (append one test;
  extend two import lists)

**Interfaces:**
- Consumes: `setupOneWorkOrder()`, `buildLinearGraph()`,
  module consts `E2` and the flow id
  `'ZOousbbnzpqlxJExVAruYQ'`, `putFlow`,
  `postWorkOrderCreation`, `buildInboxItems`,
  `DEFAULT_LOCK_TIMEOUT`, `generateIdentifier` — all
  already imported by the file — plus two NEW imports:
  `organizationItem` (add to the existing
  `'../web-app/app/adapters/shared.ts'` import beside
  `createRequestContext`) and `nowUtc` (find its export
  with `grep -rn "export function nowUtc" shared/ api/`
  and import from that module, matching how
  `web-app/app/flow-operations.ts` imports it).
- Produces: the test
  `'buildInboxItems keeps deriving after an edge delete
  and undo restore the graph'`. Task 3 appends beside it
  and must leave it untouched.

- [x] **Step 1: Append the green guard**

Append to `tests/workbox-inbox.test.ts` (after the last
test), and add the two imports named above:

```ts
test(
    'buildInboxItems keeps deriving after an'
    + ' edge delete and undo restore the graph',
    async () => {
        const { ctx, tables } =
            await setupOneWorkOrder();
        const graph = buildLinearGraph();
        // Delete the N_MIDDLE -> N_FINISH edge
        // the way the designer toolbar does: a
        // putFlow whose graph omits it.
        await putFlow(
            ctx, 'ZOousbbnzpqlxJExVAruYQ',
            {
                name: 'Test flow',
                isLocked: false,
                isAutoLayout: true,
                isAutoFit: true,
                lockTimeout: DEFAULT_LOCK_TIMEOUT,
                nodes: graph.nodes,
                edges: graph.edges.filter(
                    e => e.id !== E2,
                ),
            },
        );
        // Undo the way performUndo does: the
        // named POST flows/:id/undo replay (the
        // server restores the prior body's graph
        // verbatim, same edge id).
        await ctx.POST(
            organizationItem(
                ctx, 'flows',
                'ZOousbbnzpqlxJExVAruYQ',
            ) + '/undo',
            {
                eventId: generateIdentifier(),
                at: nowUtc(),
            },
        );
        // A work order born AFTER the restore —
        // WB5a's most damning witness.
        await postWorkOrderCreation(ctx, {
            workOrderId: generateIdentifier(),
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        const {
            workOrders, transitionsByWo, memberMap,
        } = await tables();
        assert.equal(workOrders.length, 2);
        // Claims ignored: the graph-derivation
        // path alone. Both work orders derive.
        const items = buildInboxItems(
            workOrders, transitionsByWo,
            new Map(), memberMap, 'active',
        );
        assert.equal(items.length, 2);
    },
);
```

- [x] **Step 2: Run the file — the guard passes as
  written**

Run: `TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \`
`node --strip-types --import ./tests/hmac-test-key.ts \`
`--test tests/workbox-inbox.test.ts`
Expected: ALL tests pass, including the new one. If the
new test FAILS, stop and report (see preamble above).

- [x] **Step 3: Validate and commit**

Run: `./validate` — green.

```bash
git add tests/workbox-inbox.test.ts
git commit -m "Pin inbox derivation across edge undo" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    -m "Claude-Session: <executing session URL>"
```

---

### Task 3: Claimed work orders stay visible in Active

**Doctrine:** Commandments I (Reliability — a live inbox
must never silently empty), V (Clarity); fixes a standing
Swallowed Failure (the bare `continue` drops claimed
work into an invisible third bucket); risks the Sin of
Test Weakening — governed by Ruling 3: exactly one test
is deleted-and-replaced, nothing else changes.

Restores the invariant: *an unarchived work order is
always visible in exactly one workbox tab.* The presenter
already receives `activeClaimsByWo` and `memberMap`;
today it reduces them to a boolean and vanishes the item.
Represent instead.

**Files:**
- Modify: `web-app/app/presenters/workbox-inbox.ts`
- Test: `tests/workbox-inbox.test.ts` (delete one test,
  add one, strengthen one)

**Interfaces:**
- Consumes: `memberName(memberMap, memberId):
  string | null` (already imported by the presenter);
  the existing `badge badge-warning` class
  (`web-app/app/styles/components-badges.css:68` — no CSS
  change).
- Produces: `InboxItem` gains
  `claimedByName: string | null` (matching
  `transitionerName`'s established null-for-presentation
  voice). `buildInboxItems`'s signature is UNCHANGED.
  No later task consumes the new field.

- [x] **Step 1: Replace the hide pin with the red
  visibility pin**

In `tests/workbox-inbox.test.ts`, DELETE the test
`'buildInboxItems hides a work order with an active
claim that is not yet finished'` (currently at ~:279-300)
in its entirety, and add in its place:

```ts
test(
    'buildInboxItems surfaces a claimed,'
    + ' unfinished work order as an active item'
    + ' naming its claimant',
    async () => {
        const { tables } =
            await setupOneWorkOrder();
        const {
            workOrders, transitionsByWo,
            activeClaimsByWo, memberMap,
        } = await tables();
        // postWorkOrderCreation already minted a
        // fresh claim event, so it is active.
        assert.equal(activeClaimsByWo.size, 1);
        const items = buildInboxItems(
            workOrders, transitionsByWo,
            activeClaimsByWo, memberMap, 'active',
        );
        assert.equal(items.length, 1);
        assert.equal(
            items[0]!.claimedByName, 'Demo Test',
        );
    },
);
```

Also STRENGTHEN the existing test
`'buildInboxItems surfaces an unclaimed, in-progress
work order as an active item'` by appending one
assertion after its last one:

```ts
        assert.equal(item.claimedByName, null);
```

- [x] **Step 2: Run the file — red exactly where
  expected**

Run: `TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \`
`node --strip-types --import ./tests/hmac-test-key.ts \`
`--test tests/workbox-inbox.test.ts`
Expected: the new visibility test FAILS (0 items — the
claim filter drops it); the strengthened test FAILS at
runtime (`claimedByName` is `undefined`, not `null`);
Task 2's guard and every other test still pass.

- [x] **Step 3: Fix the presenter**

In `web-app/app/presenters/workbox-inbox.ts`:

(a) DELETE the `isClaimedAndUnfinished` function
(lines ~22-27) entirely.

(b) In `InboxItem`, after
`transitionerName: string | null;` add:

```ts
    claimedByName: string | null;
```

(c) Replace the `ActiveClaim` doc comment ("The inbox
does not care which member holds it — only whether one
is held.") with:

```ts
// An active claim resolved from the states log for one
// work order. The inbox names the claim-holder on the
// item it renders — a claimed work order is shown, never
// hidden.
```

(d) In `buildInboxItems`, replace the block

```ts
        const hasActiveClaim =
            activeClaimsByWo.has(wo.id);
        if (isClaimedAndUnfinished(
            hasActiveClaim, completed,
        )) continue;
        if (!itemMatchesMode(mode, completed))
            continue;
```

with

```ts
        const activeClaim =
            activeClaimsByWo.get(wo.id);
        if (!itemMatchesMode(mode, completed))
            continue;
```

and in the `items.push({ ... })` literal, after the
`transitionerName` field add:

```ts
            claimedByName: activeClaim
                ? memberName(
                    memberMap,
                    activeClaim.memberId,
                )
                : null,
```

(e) In `#buildRow`, after the `const badge = ...`
ternary add:

```ts
        const claimedBadge =
            !item.completed && item.claimedByName
                ? html`<span
                    class="badge badge-warning"
                    >In progress — ${
                        item.claimedByName
                    }</span>`
                : html``;
```

and interpolate it in the row markup immediately after
`${badge}`:

```ts
                        ${badge}
                        ${claimedBadge}
```

- [x] **Step 4: Run the file — green across the board**

Same single-file run as Step 2.
Expected: every test passes — the new visibility pin,
the strengthened unclaimed pin (`claimedByName: null`),
Task 2's guard, and the untouched archived-mode tests
(a claimed unfinished item still stays out of
`'archived'` mode via `itemMatchesMode`).

- [x] **Step 5: Validate and commit**

Run: `./validate` — green (tsc type-checks the presenter;
the deleted helper must leave no unused imports).

```bash
git add web-app/app/presenters/workbox-inbox.ts \
    tests/workbox-inbox.test.ts
git commit -m "Show claimed work orders in the Active tab" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    -m "Claude-Session: <executing session URL>"
```

---

### Task 4: Versions index rows carry pair facts

**Doctrine:** Commandments I (Reliability), III
(Uniformity — one stamp in the one shared derivation);
serves the documented covenant ("Ledger facts (at, event
id) live on the pair / etag / versions list",
`api/types.ts:904-916`); risks Premature Generalization's
inverse — an objectives-only special case would be the
sin; the generic stamp is the smaller diff (Ruling 6).

**Files:**
- Modify: `api/document-family.ts` (`versionSnapshotsAt`,
  ~:437-459)
- Modify: `api/routes.ts` (stale comment ~:5861-5862)
- Test: `tests/api-entity-history-routes.test.ts`
  (extend the objectives DESC test, ~:999-1025)

**Interfaces:**
- Consumes: `DocumentMessagePair.at` and
  `.requesterIdentityId` (`api/derive-documents.ts:55-62`
  — already on every decoded pair).
- Produces: every snapshot-family versions index row
  (ideas, projects, objectives, record-types,
  work-orders) carries `etag` (the pair id), `at`, and
  `member_id` alongside the entity fields. Task 5's
  adapter retype (`ObjectiveVersionRow`) names exactly
  these three wire fields. Flows' StateEntity branch is
  untouched.

- [x] **Step 1: Extend the wire pin — red**

In `tests/api-entity-history-routes.test.ts`, in the test
`'GET organizations/:id/objectives/:id/versions: 200 DESC
current-first'`, widen the row type and append
assertions, so the body reads:

```ts
        const rows = await res.json() as {
            id: string;
            state: string;
            etag: string;
            at: string;
            member_id: string;
        }[];
        assert.equal(rows.length, 2);
        assert.equal(rows[0]!.id, id);
        assert.equal(rows[0]!.state, 'archived');
        assert.equal(rows[1]!.id, id);
        assert.equal(rows[1]!.state, 'active');
        assert.equal('state_at' in rows[0]!, false);
        assert.equal(typeof rows[0]!.etag, 'string');
        assert.notEqual(rows[0]!.etag, '');
        assert.notEqual(
            rows[0]!.etag, rows[1]!.etag,
        );
        assert.ok(rows[0]!.at >= rows[1]!.at);
        assert.notEqual(rows[0]!.member_id, '');
        assert.equal(
            rows[0]!.member_id, rows[1]!.member_id,
        );
```

(The `'state_at' in rows[0]!` assertion is KEPT — the new
field is `at`, the StateEntity spelling; `state_at` stays
banned from this wire.)

- [x] **Step 2: Run the file — red on the new
  assertions**

Run: `TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \`
`node --strip-types --import ./tests/hmac-test-key.ts \`
`--test tests/api-entity-history-routes.test.ts`
Expected: exactly this test fails (`etag` is
`undefined`); everything else passes.

- [x] **Step 3: Stamp the pair facts**

In `api/document-family.ts`, change `versionSnapshotsAt`:
the `toEntity` parameter type goes from
`(document: DerivedDocument) => unknown` to
`(document: DerivedDocument) => object` (every wiring
`entityOf` returns an object literal, so the closure in
`documentVersionListHandler` needs no change), and the
push becomes a spread-plus-stamp:

```ts
export async function versionSnapshotsAt(
    db: DbAdapter,
    prefix: string,
    id: Id,
    toEntity: (document: DerivedDocument) => object,
): Promise<unknown[]> {
    const stored = await messageStore(db).getMessagePairs(
        prefix, id,
    );
    const messagePairs = documentMessagePairsAt(
        stored, prefix,
    ).filter((messagePair) => messagePair.uriId === id);
    const snapshots: unknown[] = [];
    for (const messagePair of messagePairs.toReversed()) {
        if (messagePair.method !== PUT_METHOD) continue;
        snapshots.push({
            ...toEntity({
                uriId: id,
                messagePairId: messagePair.id,
                method: messagePair.method,
                body: messagePair.body,
            }),
            etag: messagePair.id,
            at: messagePair.at,
            member_id: messagePair.requesterIdentityId,
        });
    }
    return snapshots;
}
```

- [x] **Step 4: Correct the stale route comment**

In `api/routes.ts` (~:5861-5862), replace

```ts
    // GET objectives/:id/versions/: StateEntity[] DESC;
    // empty → missedReadError('objectives').
```

with

```ts
    // GET objectives/:id/versions/: entityOf snapshots
    // DESC, each stamped with the pair facts (etag, at,
    // member_id); empty → missedReadError('objectives').
```

- [x] **Step 5: Run the file, then the suite — green**

Single-file run from Step 2: the extended test passes.
Run: `./test`
Expected: green — the sibling family versions tests
(ideas :254, projects :427, record-types :569) assert by
property access and tolerate the new fields; flows tests
ride the untouched StateEntity branch.

- [x] **Step 6: Validate and commit**

Run: `./validate` — green. If
`generate-api-documentation --check` reports drift
(routes[] doc derivation is not expected to see this
internal change, but the gate is the witness), run
`./generate-api-documentation` and include the
regenerated output in this same commit — the doc rides
the change that makes it true.

```bash
git add api/document-family.ts api/routes.ts \
    tests/api-entity-history-routes.test.ts
git commit -m "Stamp pair facts on versions index rows" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    -m "Claude-Session: <executing session URL>"
```

---

### Task 5: Objective lifecycle event stream

**Doctrine:** Commandments III (Uniformity — the adapter
is the divorce point: snake_case wire in, camelCase
domain out), IV (Logic — a per-TRANSITION walk, not the
per-version filter that mints phantom duplicates);
risks Test Weakening (the old archival test is NOT
touched here — it dies with its function in Task 6).

Adds the transition-detecting stream BESIDE the old
`getObjectiveArchivalEvents` (still consumed by
`projects/detail.ts` until Task 6 switches it — every
master commit compiles green).

**Files:**
- Modify: `web-app/app/adapters/objectives.ts`
- Test: `tests/adapters-objectives.test.ts` (two new
  tests)

**Interfaces:**
- Consumes: the `etag`/`at`/`member_id` wire fields
  Task 4 stamps; `getObjectiveHistories` (retyped in
  place, same name).
- Produces (Task 6 consumes exactly these):

```ts
export interface ObjectiveVersionRow
    extends ObjectiveEntity {
    etag: string;
    at: string;
    member_id: Id;
}

export interface ObjectiveLifecycleEvent {
    objectiveId: ObjectiveId;
    kind: 'archival' | 'reactivation';
    memberId: Id;
    at: string;
}

export async function getObjectiveLifecycleEvents(
    ctx: RequestContext,
): Promise<ObjectiveLifecycleEvent[]>
```

- [x] **Step 1: Write the two red pins**

Append to `tests/adapters-objectives.test.ts`, beside the
existing archival-stream test (whose imports —
`seedAdminSchema`, `seedCurrentMember`, `ctxFor`,
`postObjectiveCreation`, `postObjectiveArchival`,
`postObjectiveReactivation` — it reuses; add
`getObjectiveLifecycleEvents` to the adapter import list
and `organizationItem` from
`'../web-app/app/adapters/shared.ts'`):

```ts
test(
    'getObjectiveLifecycleEvents streams dated'
    + ' transitions oldest-first',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctxFor(db),
            'ohqxgUBEaFQwYbXsonRPmg',
            'Rev', 'd', 0,
        );
        await postObjectiveArchival(
            ctxFor(db), 'ohqxgUBEaFQwYbXsonRPmg',
        );
        await postObjectiveReactivation(
            ctxFor(db), 'ohqxgUBEaFQwYbXsonRPmg',
        );
        await postObjectiveArchival(
            ctxFor(db), 'ohqxgUBEaFQwYbXsonRPmg',
        );
        const events =
            await getObjectiveLifecycleEvents(ctx);
        assert.deepEqual(
            events.map(e => e.kind),
            [
                'archival',
                'reactivation',
                'archival',
            ],
        );
        for (const e of events) {
            assert.equal(
                e.objectiveId,
                'ohqxgUBEaFQwYbXsonRPmg',
            );
            assert.notEqual(e.memberId, '');
            assert.notEqual(e.at, '');
        }
        assert.ok(events[0]!.at <= events[1]!.at);
        assert.ok(events[1]!.at <= events[2]!.at);
    },
);

test(
    'a position echo while archived adds no'
    + ' lifecycle event',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctxFor(db),
            'ohqxgUBEaFQwYbXsonRPmg',
            'Rev', 'd', 0,
        );
        await postObjectiveArchival(
            ctxFor(db), 'ohqxgUBEaFQwYbXsonRPmg',
        );
        // The wire putObjectivePosition drives: a
        // position PUT re-sending the standing
        // state. It must collapse, not mint a
        // phantom archival.
        await ctx.PUT(
            organizationItem(
                ctx, 'objectives',
                'ohqxgUBEaFQwYbXsonRPmg',
            ),
            {
                position: 3,
                state: 'archived',
            },
        );
        const events =
            await getObjectiveLifecycleEvents(ctx);
        assert.equal(events.length, 1);
        assert.equal(events[0]!.kind, 'archival');
    },
);
```

- [x] **Step 2: Run the file — red**

Run: `TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \`
`node --strip-types --import ./tests/hmac-test-key.ts \`
`--test tests/adapters-objectives.test.ts`
Expected: the FILE fails at import — the named import
`getObjectiveLifecycleEvents` does not exist yet, which
is this step's red. (An ESM named-import miss fails the
whole file, not just the new tests; the rest of the
suite is untouched.)

- [x] **Step 3: Retype the histories door, add the
  stream**

In `web-app/app/adapters/objectives.ts`:

(a) Immediately above `getObjectiveHistories`, add the
honest row type, and retype the door (the stale "Versions
carry no member or at" clause dies here):

```ts
// A versions index row: the entity snapshot plus the
// pair facts the list stamps on every row (etag is the
// message-pair id).
export interface ObjectiveVersionRow
    extends ObjectiveEntity {
    etag: string;
    at: string;
    member_id: Id;
}
```

In `getObjectiveHistories`, change the return type to
`Promise<Map<Id, ObjectiveVersionRow[]>>` and the inner
fetch to `ctx.GET<ObjectiveVersionRow[]>(...)`; update
its doc comment's "Rows are collection-item shape (state,
not StateEntity). Source for the archival stream." to
"Rows are entity snapshots stamped with pair facts.
Source for the lifecycle stream."

(b) After `getObjectiveArchivalEvents` (which stays,
untouched, until Task 6), add:

```ts
export interface ObjectiveLifecycleEvent {
    objectiveId: ObjectiveId;
    kind: 'archival' | 'reactivation';
    memberId: Id;
    at: string;
}

// One event per lifecycle TRANSITION, walked oldest-
// first per objective: archived after non-archived is an
// archival; non-archived after archived is a
// reactivation. Echo versions (a position PUT re-sending
// the standing state) collapse; genesis-active is never
// an event. Consumed by the project score-history
// presenter.
export async function getObjectiveLifecycleEvents(
    ctx: RequestContext,
): Promise<ObjectiveLifecycleEvent[]> {
    const histories =
        await getObjectiveHistories(ctx);
    const events: ObjectiveLifecycleEvent[] = [];
    for (
        const [objectiveId, versions] of histories
    ) {
        let previous: string | undefined;
        for (const row of versions.toReversed()) {
            const transition =
                row.state === 'archived'
                    ? previous !== 'archived'
                    : previous === 'archived';
            if (transition) {
                events.push({
                    objectiveId,
                    kind:
                        row.state === 'archived'
                            ? 'archival'
                            : 'reactivation',
                    memberId: row.member_id,
                    at: row.at,
                });
            }
            previous = row.state;
        }
    }
    return events;
}
```

(The wire lists versions newest-first — Task 4's DESC —
so `toReversed()` walks oldest-first. On the genesis row
`previous` is `undefined`: an active genesis matches
neither arm's condition-for-event; an archived genesis
would truthfully be an archival.)

- [x] **Step 4: Run the file — green**

Single-file run from Step 2. Expected: all tests pass,
including the untouched
`'getObjectiveArchivalEvents streams archived history
rows only'` (the retype is source-compatible: it reads
only `row.state`).

- [x] **Step 5: Validate and commit**

Run: `./validate` — green.

```bash
git add web-app/app/adapters/objectives.ts \
    tests/adapters-objectives.test.ts
git commit -m "Add objective lifecycle event stream" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    -m "Claude-Session: <executing session URL>"
```

---

### Task 6: History renders lifecycle rows

**Doctrine:** Commandments I (Reliability — an audit
trail must never go quietly blank), IV (Logic — one
chronological sort, no segregated tail), V (Clarity);
fixes a Swallowed Failure (em-dash resignation) by
degrading VISIBLY (throw on a missing definition, exactly
as baseline/actual do); the generalization replaces every
similar site — the old archival stream, its interface,
and its weak pin all die here, never resting beside the
new voice. Test Weakening is governed by Ruling 3 (the
one enumerated flip); the two adapter-test deletions
remove tests of a deleted function.

**Files:**
- Modify:
  `web-app/app/presenters/project-score-history.ts`
- Modify: `web-app/projects/detail.ts` (:51, :928-933,
  :940-942, :972-977)
- Modify: `web-app/app/adapters/objectives.ts` (delete
  `ObjectiveArchivalEvent` + `getObjectiveArchivalEvents`)
- Test:
  `tests/presenter-project-score-history.test.ts`
  (fixture retype, three new tests, one deletion)
- Test: `tests/adapters-objectives.test.ts` (delete the
  old stream test; drop unused imports)

**Interfaces:**
- Consumes: `ObjectiveLifecycleEvent` and
  `getObjectiveLifecycleEvents` from Task 5.
- Produces: `ProjectScoreHistoryPresenter`'s fourth
  constructor parameter becomes
  `lifecycle: ObjectiveLifecycleEvent[]` (was
  `archivals: ObjectiveArchivalEvent[]`). The barrel
  re-export in `web-app/app/presenters/index.ts` is
  name-based and unaffected. No later task consumes
  this.

- [x] **Step 1: Rework the presenter-test fixtures and
  write the three red pins**

In `tests/presenter-project-score-history.test.ts`:

(a) Replace the empty-archivals fixture

```ts
const archivals: {
    objectiveId: string;
}[] = [];
```

with

```ts
const lifecycle: {
    objectiveId: string;
    kind: 'archival' | 'reactivation';
    memberId: string;
    at: string;
}[] = [];
```

and mechanically rename the `archivals` positional
argument to `lifecycle` at every
`new ProjectScoreHistoryPresenter(...)` call site in the
file.

(b) DELETE the test
`'archival event row labels the archive'` (the weak
label-only covenant — Ruling 3).

(c) Append three tests (the `whoName` map already
resolves `'xdaJyuuPyHfffCGLhqDrOQ'` → `'Sarah Lee'`; the
file-level `resolver` resolves names from `revisions`:
`'Drive Growth'` at any time ≥ 2026-03-18, and the
`html.split('<tr>')` row-slicing keeps assertions scoped
to one row; ordering asserts use `datetime="` markers,
which are zulu strings and TZ-immune):

```ts
test(
    'archival row shows date, who, and objective'
    + ' name',
    () => {
        const p = new ProjectScoreHistoryPresenter(
            [], [], revisions,
            [{
                objectiveId:
                    'ohqxgUBEaFQwYbXsonRPmg',
                kind: 'archival',
                memberId:
                    'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-01T10:00:00.000000Z',
            }],
            resolver, whoName,
        );
        const html = p.buildBody().toString();
        const row = html.split('<tr>').find(
            r => r.includes('Objective archived'),
        );
        assert.ok(row, 'archival row missing');
        assert.ok(row.includes(
            'datetime="2026-05-01T10:00:00.000000Z"',
        ));
        assert.ok(row.includes('Sarah Lee'));
        assert.ok(row.includes('Drive Growth'));
        assert.ok(row.includes('archived'));
        assert.ok(
            !row.includes('—'),
            'no em-dash resignation',
        );
    },
);

test(
    'reactivation renders its own dated row',
    () => {
        const p = new ProjectScoreHistoryPresenter(
            [], [], revisions,
            [{
                objectiveId:
                    'ohqxgUBEaFQwYbXsonRPmg',
                kind: 'reactivation',
                memberId:
                    'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-02T10:00:00.000000Z',
            }],
            resolver, whoName,
        );
        const html = p.buildBody().toString();
        const row = html.split('<tr>').find(
            r => r.includes(
                'Objective reactivated',
            ),
        );
        assert.ok(row, 'reactivation row missing');
        assert.ok(row.includes(
            'datetime="2026-05-02T10:00:00.000000Z"',
        ));
        assert.ok(row.includes('Sarah Lee'));
        assert.ok(row.includes('Drive Growth'));
        assert.ok(row.includes('reactivated'));
    },
);

test(
    'lifecycle rows interleave chronologically',
    () => {
        const p = new ProjectScoreHistoryPresenter(
            baselines, [], revisions,
            [{
                objectiveId:
                    'ohqxgUBEaFQwYbXsonRPmg',
                kind: 'archival',
                memberId:
                    'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-03-03T00:00:00.000000Z',
            }],
            resolver, whoName,
        );
        const html = p.buildBody().toString();
        const first = html.indexOf(
            'datetime="2026-03-01',
        );
        const mid = html.indexOf(
            'datetime="2026-03-03',
        );
        const last = html.indexOf(
            'datetime="2026-03-05',
        );
        assert.ok(first >= 0 && mid >= 0
            && last >= 0);
        assert.ok(
            first < mid && mid < last,
            'archival must sort between the'
            + ' baselines, not trail the table',
        );
    },
);
```

- [x] **Step 2: Run the file — red exactly on the three
  new tests**

Run: `TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \`
`node --strip-types --import ./tests/hmac-test-key.ts \`
`--test tests/presenter-project-score-history.test.ts`
Expected: the archival-row test fails (em-dashes, no
date), the reactivation test fails (no row), the
interleave test fails (archival trails the table); the
renamed-fixture tests all still pass (the presenter's
runtime only reads `kind`/`objectiveId` off today's
events, and the empty `lifecycle` array changes
nothing).

- [x] **Step 3: Reshape the presenter**

In `web-app/app/presenters/project-score-history.ts`:

(a) Replace the adapter type import:
`ObjectiveArchivalEvent` → `ObjectiveLifecycleEvent`
(same module path).

(b) Replace the event model — the `DatedEvent` union
gains the two lifecycle kinds and the undated `Event`
wrapper dies:

```ts
type DatedEvent =
    | { kind: 'baseline'; at: string; memberId: Id;
        objectiveId: ObjectiveId; score: number }
    | { kind: 'actual'; at: string; memberId: Id;
        objectiveId: ObjectiveId; score: number }
    | { kind: 'revision'; at: string; memberId: Id;
        objectiveId: ObjectiveId; name: string }
    | { kind: 'archival'; at: string; memberId: Id;
        objectiveId: ObjectiveId }
    | { kind: 'reactivation'; at: string;
        memberId: Id; objectiveId: ObjectiveId };
```

(c) Rename the field and constructor parameter:
`#archivals: ObjectiveArchivalEvent[]` →
`#lifecycle: ObjectiveLifecycleEvent[]`; fourth ctor
param `archivals` → `lifecycle`.

(d) `#mergedEvents(): DatedEvent[]` — replace the
archival push-loop and the dated/archival segregation
with one push-loop and one sort; the tail of the method
becomes:

```ts
        for (const d of this.#lifecycle) {
            events.push({
                kind: d.kind,
                at: d.at,
                memberId: d.memberId,
                objectiveId: d.objectiveId,
            });
        }
        events.sort(
            (a, b) => a.at.localeCompare(b.at),
        );
        return events;
```

(with `events` now typed `DatedEvent[]` at its
declaration, and the `dated`/`archivals` local arrays
deleted).

(e) `#row(e: DatedEvent)` — DELETE the leading em-dash
branch (`if (e.kind === 'archival') { ... DISPLAY_ABSENT
... }`) entirely, and add two cases to the switch, each
resolving the definition and THROWING on a miss exactly
as `baseline` does (the no-default switch stays, so
tsc's exhaustiveness makes any future unhandled kind a
compile error, not a blank row):

```ts
            case 'archival': {
                const def = this.#resolver(
                    e.objectiveId, e.at,
                );
                if (!def) {
                    throw new Error(
                        `objective definition missing `
                        + `for ${e.objectiveId} at `
                        + `${e.at}`,
                    );
                }
                return html`<tr>
                    ${dateCell}
                    ${whoCell}
                    <td>Objective archived</td>
                    <td>${def.name}</td>
                    <td>archived</td>
                </tr>`;
            }
            case 'reactivation': {
                const def = this.#resolver(
                    e.objectiveId, e.at,
                );
                if (!def) {
                    throw new Error(
                        `objective definition missing `
                        + `for ${e.objectiveId} at `
                        + `${e.at}`,
                    );
                }
                return html`<tr>
                    ${dateCell}
                    ${whoCell}
                    <td>Objective reactivated</td>
                    <td>${def.name}</td>
                    <td>reactivated</td>
                </tr>`;
            }
```

If `DISPLAY_ABSENT` is now unread in this module, delete
its import (tsc `noUnusedLocals` is the witness).

- [x] **Step 4: Switch the page, delete the old stream**

(a) In `web-app/projects/detail.ts`: at :51 import
`getObjectiveLifecycleEvents` instead of
`getObjectiveArchivalEvents`; in `openHistoryModal`
(:928-933) call it in the same `Promise.all` slot,
renaming the destructured local `allArchivals` →
`allLifecycle`; rename the filtered local `archivals` →
`lifecycle` (:940-942) — the filter's
`d => baselineObjIds.has(d.objectiveId)` predicate is
unchanged — and pass `lifecycle` to the presenter
(:972-977).

(b) In `web-app/app/adapters/objectives.ts`: DELETE the
`ObjectiveArchivalEvent` interface and
`getObjectiveArchivalEvents` (its replacement has risen;
the old site must not rest beside it).

(c) In `tests/adapters-objectives.test.ts`: DELETE the
test `'getObjectiveArchivalEvents streams archived
history rows only'` (it tests a deleted function; its
histories-shape assertions live on in Task 5's stream
tests) and remove `getObjectiveArchivalEvents` from the
import list (keep `getObjectiveHistories` only if still
imported by a remaining test — otherwise drop it too).

- [x] **Step 5: Run both files, then the suite — green**

Run the presenter test file (Step 2 command): all pass,
including the three new pins.
Run the adapter test file: all pass.
Run: `./test` — green (`grep -rn
"getObjectiveArchivalEvents" web-app/ tests/` must
return nothing).

- [x] **Step 6: Validate and commit**

Run: `./validate` — green.

```bash
git add web-app/app/presenters/project-score-history.ts \
    web-app/projects/detail.ts \
    web-app/app/adapters/objectives.ts \
    tests/presenter-project-score-history.test.ts \
    tests/adapters-objectives.test.ts
git commit -m "Render objective lifecycle history rows" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    -m "Claude-Session: <executing session URL>"
```

---

### Task 7: Pin loadInto's branch contract

**Doctrine:** the Office of Verification (pin the
input→output contract the SV8b fix rides on, before
riding it); risks Unbidden Helper Code (three pins, one
stub helper, nothing more). GREEN pins — they codify
today's correct branch behavior, which Task 9's fix
depends on and must not disturb.

**Files:**
- Test: `tests/loading-states.test.ts` (new file)

**Interfaces:**
- Consumes: `loadInto` from
  `web-app/app/loading-states.ts`; `html` from
  `web-app/app/safe-html.ts`.
- Produces: the pinned contract — empty ⇒ `onEmpty`
  called and `onData` NOT; data ⇒ `onData` called and
  `onEmpty` NOT; rejecting fetch ⇒ neither. Task 9's
  page fix rides the first arm.

- [x] **Step 1: Write the new test file**

Create `tests/loading-states.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { loadInto } from
    '../web-app/app/loading-states.ts';
import { html } from '../web-app/app/safe-html.ts';

// A structural stand-in for the container element:
// loadInto touches only innerHTML (via setHtml), id
// (measure names), and querySelector (error-path
// retry lookup).
function makeStubEl(): {
    innerHTML: string;
    id: string;
    querySelector: () => null;
} {
    return {
        innerHTML: '',
        id: 'stub-list',
        querySelector: () => null,
    };
}

test(
    'an empty fetch renders the empty state and'
    + ' calls onEmpty, never onData',
    async () => {
        const el = makeStubEl();
        let emptied = 0;
        let dataCalls = 0;
        await loadInto({
            container:
                el as unknown as HTMLElement,
            skeleton: html`skeleton`,
            fetch: () => Promise.resolve([]),
            emptyState: {
                icon: html``,
                title: 'No Widgets Yet',
                description: 'none',
                onEmpty: () => { emptied += 1; },
            },
            onData: () => { dataCalls += 1; },
        });
        assert.equal(emptied, 1);
        assert.equal(dataCalls, 0);
        assert.ok(
            el.innerHTML.includes(
                'No Widgets Yet',
            ),
        );
    },
);

test(
    'a non-empty fetch calls onData, never'
    + ' onEmpty',
    async () => {
        const el = makeStubEl();
        let emptied = 0;
        let received: number[] | null = null;
        await loadInto({
            container:
                el as unknown as HTMLElement,
            skeleton: html`skeleton`,
            fetch: () => Promise.resolve([1]),
            emptyState: {
                icon: html``,
                title: 'No Widgets Yet',
                description: 'none',
                onEmpty: () => { emptied += 1; },
            },
            onData: (data) => {
                received = data;
            },
        });
        assert.equal(emptied, 0);
        assert.deepEqual(received, [1]);
    },
);

test(
    'a rejecting fetch renders the error state'
    + ' and calls neither hook',
    async () => {
        const el = makeStubEl();
        let emptied = 0;
        let dataCalls = 0;
        await loadInto({
            container:
                el as unknown as HTMLElement,
            skeleton: html`skeleton`,
            fetch: () => Promise.reject(
                new Error('boom'),
            ),
            emptyState: {
                icon: html``,
                title: 'No Widgets Yet',
                description: 'none',
                onEmpty: () => { emptied += 1; },
            },
            onData: () => { dataCalls += 1; },
        });
        assert.equal(emptied, 0);
        assert.equal(dataCalls, 0);
        assert.ok(
            el.innerHTML.includes('Try Again'),
        );
    },
);
```

- [x] **Step 2: Run the file — green as written**

Run: `TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \`
`node --strip-types --import ./tests/hmac-test-key.ts \`
`--test tests/loading-states.test.ts`
Expected: all three pass. If the IMPORT itself fails on a
missing browser global (an import-chain module touching
`localStorage`/`window`/`document` at load), prepend the
established stub preamble from
`tests/presenter-project-score-history.test.ts:9-27`
(stub the three globals, then switch the two imports to
dynamic `await import(...)`) — the in-tree pattern for
exactly this.

- [x] **Step 3: Validate and commit**

Run: `./validate` — green.

```bash
git add tests/loading-states.test.ts
git commit -m "Pin loadInto branch contract" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    -m "Claude-Session: <executing session URL>"
```

---

### Task 8: subscribeOnce channel helper

**Doctrine:** Commandments VIII (Simplicity — ten lines,
no flags), IX (Generality — the pattern spoke at four
sites; the mechanism generalizes once, in channels.ts,
where subscriptions live); risks Premature
Generalization (nothing beyond the one-shot ships) and
Shared Mutable State (none: the closure owns its own
unsubscribe).

**Files:**
- Modify: `web-app/app/channels.ts` (append)
- Test: `tests/channels.test.ts` (two tests, appended
  after the `createChannel` block, before the
  BroadcastChannel section)

**Interfaces:**
- Consumes: the `subscribe(fn) => unsubscribe` shape
  shared by `Channel<void>` and every
  `subscribe<Entity>Changes` adapter export.
- Produces (Task 9 consumes exactly this):

```ts
export function subscribeOnce(
    subscribe: (fn: () => void) => () => void,
    fn: () => void | Promise<void>,
): void
```

- [x] **Step 1: Write the two red pins**

Append to `tests/channels.test.ts` after the
`createChannel` tests (add `subscribeOnce` to the
existing `'../web-app/app/channels.ts'` import):

```ts
test('subscribeOnce delivers exactly once', () => {
    const ch = createChannel<void>();
    let calls = 0;
    subscribeOnce(ch.subscribe, () => {
        calls += 1;
    });
    ch.send();
    ch.send();
    assert.equal(calls, 1);
});

test(
    'subscribeOnce tears down before fn runs',
    () => {
        const ch = createChannel<void>();
        let calls = 0;
        subscribeOnce(ch.subscribe, () => {
            calls += 1;
            // A send from inside fn must not
            // recurse: the one-shot is already
            // gone.
            ch.send();
        });
        ch.send();
        assert.equal(calls, 1);
    },
);
```

- [x] **Step 2: Run the file — red**

Run: `TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \`
`node --strip-types --import ./tests/hmac-test-key.ts \`
`--test tests/channels.test.ts`
Expected: the FILE fails at import — the named import
`subscribeOnce` does not exist yet, which is this step's
red. (An ESM named-import miss fails the whole file; the
rest of the suite is untouched.)

- [x] **Step 3: Implement**

Append to `web-app/app/channels.ts`:

```ts
// One-shot subscription: the first event tears the
// subscription down, then runs fn. Serves the empty
// list pages (SV8b): an empty initial load wires no
// steady-state subscriber, so the first change bell
// re-runs init — which either wires the steady state
// (data now) or re-renders empty and re-arms. Teardown
// precedes fn, so the steady-state subscription fn
// wires never coexists with the one-shot.
export function subscribeOnce(
    subscribe: (fn: () => void) => () => void,
    fn: () => void | Promise<void>,
): void {
    const unsubscribe = subscribe(() => {
        unsubscribe();
        void fn();
    });
}
```

- [x] **Step 4: Run the file — green**

Same run as Step 2. Expected: all pass.

- [x] **Step 5: Validate and commit**

Run: `./validate` — green.

```bash
git add web-app/app/channels.ts tests/channels.test.ts
git commit -m "Add subscribeOnce channel helper" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    -m "Claude-Session: <executing session URL>"
```

---

### Task 9: Empty list pages re-init on the first bell

**Doctrine:** Commandments I (Reliability), III
(Uniformity — one idiom, four identical arms), IX
(Generality past three instances); the Office of
Verification (the pin rides the page's real boot path at
the highest node-testable level); risks Scattered
Context and Shared Mutable State — both avoided: no
flags, no moved subscriptions, the one-shot owns itself.

The 18-site survey behind Ruling 5 (verified in source;
re-verify with `grep -rn "loadInto" web-app/ | grep -v
app/loading-states`): AFFECTED — `ideas/index.ts:47`,
`records/index.ts:47`, `projects/index.ts:65`,
`flows/index.ts:88` (emptyState + subscribe inside the
onData continuation). Safe by placement —
`workbox/index.ts` (subscribes in init after both
loadIntos), `records/detail.ts` (subscribes in init).
Structurally immune (no `emptyState`, or object payload
so the `Array.isArray` empty-branch never fires) —
members, identities, identity-providers,
identity-tokens, invitations, dashboard, and the five
detail pages. `flows/stats.ts` has no subscription at
all — recorded in Task 14, NOT fixed here.

**Files:**
- Modify: `web-app/ideas/index.ts` (onEmpty, ~:63-67)
- Modify: `web-app/records/index.ts` (onEmpty, ~:61-66)
- Modify: `web-app/projects/index.ts` (emptyState,
  ~:81-91)
- Modify: `web-app/flows/index.ts` (emptyState,
  ~:95-108)
- Test: `tests/ideas-empty-subscribe.test.ts` (new file)

**Interfaces:**
- Consumes: `subscribeOnce` (Task 8); each page's own
  `subscribe<Entity>Changes` and hoisted `init`;
  `tests/in-page-facade.ts`, `initAdapter` +
  `putSessionToken`
  (`web-app/app/adapters/init.ts`), `createRequestContext`
  + `organizationItem`
  (`web-app/app/adapters/shared.ts`),
  `organizationToken` (`tests/token-fixtures.ts`),
  `seedAdminSchema` (`tests/test-fixtures.ts`),
  `seedHumanMember` (`tests/member-fixtures.ts`).
- Produces: the four pages live-update from a cold empty
  list. No later task consumes this.

- [x] **Step 1: Write the page-level red pin**

Create `tests/ideas-empty-subscribe.test.ts`. The recipe
is `tests/command-palette-init.test.ts` (stub globals →
in-page facade → dynamic imports → drain) plus
`tests/channels.test.ts` (real Node BroadcastChannel +
setImmediate drain). The idea is written with a RAW
`ctx.PUT` — not the `putIdea` adapter — so the same-tab
notify path stays silent and only the cross-tab bell can
wake the page:

```ts
import './hmac-test-key.ts';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const CHANNEL_NAME = 'fusion-angle:data';

// SV8b: a list page whose initial fetch is EMPTY must
// still hear the cross-tab fusion-angle:data bell and
// come alive. Stubs land before any web-app import —
// the module graph reads theme/session state at load.

function makeListStub(): {
    innerHTML: string;
    id: string;
    addEventListener: () => void;
    querySelector: () => null;
    querySelectorAll: () => never[];
} {
    return {
        innerHTML: '',
        id: 'ideas-list',
        addEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
    };
}

test(
    'an empty initial ideas load still subscribes'
    + ' to cross-tab changes',
    async () => {
        const g = globalThis as Record<
            string, unknown
        >;
        const listStub = makeListStub();
        const storage = new Map<string, string>();
        g['localStorage'] = {
            getItem: (k: string) =>
                storage.get(k) ?? null,
            setItem: (k: string, v: string) => {
                storage.set(k, v);
            },
            removeItem: (k: string) => {
                storage.delete(k);
            },
        };
        g['window'] = {
            matchMedia: () => ({
                matches: false,
                addEventListener: () => {},
                removeEventListener: () => {},
            }),
            addEventListener: () => {},
        };
        g['document'] = {
            addEventListener: () => {},
            querySelector: (sel: string) =>
                sel === '#ideas-list'
                    ? listStub
                    : null,
        };
        try {
            await import('./in-page-facade.ts');
            const { initAdapter, putSessionToken } =
                await import(
                    '../web-app/app/adapters/init.ts'
                );
            const db = memoryDbAdapter();
            await seedAdminSchema(db);
            await seedHumanMember(
                db, 'XXZruirZyAOoRpNxaDnpSA',
                'Demo Test',
            );
            const hasSchema = await initAdapter(
                () => db,
            );
            assert.equal(hasSchema, true);
            putSessionToken(
                await organizationToken(),
            );
            const { init } = await import(
                '../web-app/ideas/index.ts'
            );
            await init();
            assert.ok(
                listStub.innerHTML.includes(
                    'No Ideas Yet',
                ),
                'precondition: empty state'
                + ' rendered',
            );
            // Another tab writes an idea. The raw
            // ctx.PUT is the wire putIdea drives,
            // minus the same-tab notify — so only
            // the BroadcastChannel below can wake
            // this page.
            const {
                createRequestContext,
                organizationItem,
            } = await import(
                '../web-app/app/adapters/shared.ts'
            );
            const ctx = createRequestContext(
                db, await organizationToken(),
            );
            await ctx.PUT(
                organizationItem(
                    ctx, 'ideas',
                    generateIdentifier(),
                ),
                {
                    title: 'Cross-tab idea',
                    problem_statement: 'p',
                    target_users: '',
                    proposed_solution: 's',
                    expected_outcome: 'o',
                    success_metrics: '',
                    position: 1,
                    state: 'active',
                },
            );
            const poster = new BroadcastChannel(
                CHANNEL_NAME,
            );
            poster.postMessage({ kind: 'full' });
            // BroadcastChannel delivery and the
            // re-run init's fetch/render pipeline
            // are asynchronous; drain generously.
            for (let i = 0; i < 25; i++) {
                await new Promise(
                    r => setImmediate(r),
                );
            }
            poster.close();
            assert.ok(
                listStub.innerHTML.includes(
                    'Cross-tab idea',
                ),
                'the empty page must re-init on'
                + ' the first cross-tab bell',
            );
        } finally {
            delete g['localStorage'];
            delete g['window'];
            delete g['document'];
        }
    },
);
```

- [x] **Step 2: Run the file — red on the final
  assertion**

Run: `TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \`
`node --strip-types --import ./tests/hmac-test-key.ts \`
`--test tests/ideas-empty-subscribe.test.ts`
Expected: the empty-state precondition PASSES; the final
assertion FAILS (the page never subscribed — SV8b
exactly). If instead the IMPORT or the precondition
fails, fix the stub surface first (a module in the page's
import graph touched a global the stub lacks — extend the
stub to the established trio's shape, nothing more) —
the test must reach the final assertion red before any
page code changes.

- [x] **Step 3: Arm the one-shot on all four pages**

(a) `web-app/ideas/index.ts` — add to the import block
`import { subscribeOnce } from '../app/channels.ts';`
and extend `onEmpty`:

```ts
            onEmpty: () => {
                $(
                    '#create-idea-btn', document,
                )?.remove();
                subscribeOnce(
                    subscribeIdeaChanges, init,
                );
            },
```

(b) `web-app/records/index.ts` — same import; extend
`onEmpty`:

```ts
            onEmpty: () => {
                $(
                    '#create-record-btn',
                    document,
                )?.remove();
                subscribeOnce(
                    subscribeRecordChanges, init,
                );
            },
```

(c) `web-app/projects/index.ts` — same import; the
emptyState gains an `onEmpty` (only the creation bell
can make an empty list non-empty; the score/objective
bells cannot):

```ts
            onEmpty: () => {
                subscribeOnce(
                    subscribeProjectChanges, init,
                );
            },
```

(d) `web-app/flows/index.ts` — same import (path
`'../app/channels.ts'`); the emptyState gains:

```ts
            onEmpty: () => {
                subscribeOnce(
                    subscribeFlowChanges, init,
                );
            },
```

In each file `init` is a hoisted function declaration —
referencing it inside its own `loadInto` config is
sound. An empty→still-empty re-init re-renders the empty
panel and re-arms a fresh one-shot: the loop IS the arc.
The already-removed create button re-`remove()`s as a
`?.` no-op.

- [x] **Step 4: Run the file — green; then the suite**

Single-file run from Step 2: both assertions pass.
Run: `./test` — green.

- [x] **Step 5: Validate and commit**

Run: `./validate` — green.

```bash
git add web-app/ideas/index.ts \
    web-app/records/index.ts \
    web-app/projects/index.ts \
    web-app/flows/index.ts \
    tests/ideas-empty-subscribe.test.ts
git commit -m "Arm empty list pages with one-shot bell" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    -m "Claude-Session: <executing session URL>"
```

---

### Task 10: Idea create speaks its validation

**Doctrine:** Commandments I (Reliability), V (Clarity —
a rejected submit must say so); fixes a Swallowed Failure
at the UI gate (the mute `disabled` + CSS
`pointer-events: none` swallow every interaction before
any handler runs; the Enter path dies identically —
`click()` on a disabled control is a spec'd no-op);
validators at the gate (ONE guard, at the submit edge);
risks Test Weakening — governed by Ruling 3 (the one
enumerated flip). Do NOT extend the completeness rule to
Who/Success: `ideaCreateDraftIsComplete`'s four-field
truth table is AA12's covenant
(`tests/presenter-idea.test.ts:742-770`) and stays
untouched — the server accepts empty strings for all six
fields, so this is purely a client UX gate.

**Files:**
- Modify: `web-app/app/presenters/idea-create.ts`
  (:46-49, :137-141)
- Modify: `web-app/ideas/create.ts` (the submit handler,
  `mutateSubmitButton`, the input-listener block)
- Test: `tests/presenter-idea.test.ts` (:772-785 flips)

**Interfaces:**
- Consumes: `showToast(message, variant)` from
  `web-app/app/toast.ts` (the dominant guard idiom —
  `web-app/records/create.ts:46-52` is the sibling
  precedent); `ideaCreateDraftIsComplete` (unchanged).
- Produces: nothing later tasks consume.

- [x] **Step 1: Flip the presenter pin — red**

In `tests/presenter-idea.test.ts`, replace the test
`'IdeaCreatePresenter.render disables the submit button
while the draft is empty'` (:772-785) with:

```ts
test(
    'IdeaCreatePresenter.render keeps submit'
    + ' clickable while the draft is empty',
    () => {
        const out = new IdeaCreatePresenter(
            EMPTY_IDEA_CREATE_DRAFT,
        ).render().toString();
        assert.match(out, /New Idea/);
        assert.match(out, /Describe Your Idea/);
        assert.match(out, /Submit Idea/);
        assert.ok(
            !out.includes('disabled'),
            'the gate must speak, not mute:'
            + ' an incomplete submit surfaces a'
            + ' toast at the click handler',
        );
        assert.ok(!out.includes('undefined'));
    },
);
```

Leave the adjacent
`'render enables submit and echoes draft values...'`
test untouched — a complete draft renders enabled before
and after this change.

- [x] **Step 2: Run the file — red on the flipped pin**

Run: `TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \`
`node --strip-types --import ./tests/hmac-test-key.ts \`
`--test tests/presenter-idea.test.ts`
Expected: exactly the flipped test fails (render still
emits `disabled`); the four-field truth-table test and
all others pass.

- [x] **Step 3: Un-mute the presenter**

In `web-app/app/presenters/idea-create.ts`:

(a) DELETE the computation at :46-49:

```ts
        const isArchive =
            ideaCreateDraftIsComplete(
                this.#draft,
            );
```

(b) DELETE the interpolation at :137-141 (the button
attribute block), so the submit button markup carries no
`disabled` line:

```ts
                ${trusted(
                    isArchive
                        ? ''
                        : 'disabled',
                )}
```

If `trusted` (or `ideaCreateDraftIsComplete`) is now
unread in this module, delete it from the import list —
`./validate`'s tsc pass is the witness.

- [x] **Step 4: Guard the submit handler; retire the
  mute machinery**

In `web-app/ideas/create.ts`:

(a) Add `import { showToast } from '../app/toast.ts';`
to the import block.

(b) DELETE the `mutateSubmitButton` function whole.

(c) DELETE the input-listener block in `bindEvents`
(the `const selector = ...` through the
`$$(selector, document).forEach(...)` statement): its
only work was re-reading the form into `formState` and
re-minting `disabled`; the click handler re-reads the
DOM itself at its first line. KEEP `bindEnterToClick` —
Enter now reaches an enabled button whose guard speaks.

(d) In the `'#idea-create-step-next'` click handler,
after `formState = readFormFromDom();` and before
`const ctx = sessionContext();`, insert the guard:

```ts
                if (
                    !ideaCreateDraftIsComplete(
                        formState,
                    )
                ) {
                    showToast(
                        'Title, problem,'
                            + ' solution, and'
                            + ' outcome are'
                            + ' required',
                        'error',
                    );
                    return;
                }
```

(`ideaCreateDraftIsComplete` is already imported by this
page for `mutateSubmitButton`; keep that import.)

- [x] **Step 5: Run the file — green; then the suite**

Single-file run from Step 2: all pass.
Run: `./test` — green.

- [x] **Step 6: Validate and commit**

Run: `./validate` — green.

```bash
git add web-app/app/presenters/idea-create.ts \
    web-app/ideas/create.ts \
    tests/presenter-idea.test.ts
git commit -m "Toast the incomplete idea-create submit" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    -m "Claude-Session: <executing session URL>"
```

---

### Task 11: Clear add-objective fields on dialog open

**Doctrine:** Commandment III (Uniformity — assign-on-
open is this page's own idiom: the edit-objective and
confirm-archive arms both write their fields before
`openDialog`); risks Unbidden Helper Code (NO dialog.ts
reset hook, NO shared helper — two same-page dialogs do
not meet the rule of three; the identities sibling is
Task 14's TODO line, not this diff).

The Add Objective dialog is static page HTML outside the
re-rendered container, has no `<form>` element, and
native `HTMLDialogElement.close()` resets nothing — so
whatever was last typed is still there at the next
`showModal()`. Assign-on-open heals every stale path:
prior success, Cancel, Escape, backdrop.

No node seam exists for page DOM wiring (no jsdom; the
established precedent — `7014fcbc`, `01d00bc0` — ships
such fixes with `./validate` alone). The witness is
TEST-PLAN.md AA-Obj (~:646) on the next browser run.

**Files:**
- Modify: `web-app/organization/index.ts` (:226-227)

**Interfaces:**
- Consumes: the page's own `$(...) as HTMLInputElement`
  cast voice (:236-247).
- Produces: nothing later tasks consume.

- [x] **Step 1: Assign-on-open**

In `web-app/organization/index.ts`, replace the bare arm

```ts
    if (action === 'add-objective') {
        openDialog('add-objective');
```

with

```ts
    if (action === 'add-objective') {
        ($(
            '#add-obj-name', document,
        ) as HTMLInputElement).value = '';
        ($(
            '#add-obj-description', document,
        ) as HTMLTextAreaElement).value = '';
        openDialog('add-objective');
```

(the `} else if (` chain continues unchanged).

- [x] **Step 2: Validate and commit**

Run: `./validate` — green.

```bash
git add web-app/organization/index.ts
git commit -m "Clear add-objective fields on dialog open" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    -m "Claude-Session: <executing session URL>"
```

---

### Task 12: Clear auth field errors on mode toggle

**Doctrine:** Commandments I (Reliability), III
(Uniformity — the clear voice is codified in
`web-app/members/index.ts:294-311`: remove `input-error`,
empty the text, add `hidden`); risks nothing new — this
is a two-character-class typo plus a hide-without-clear,
congenital since commit `7014fcbc`.

The toggle handler removes a class named `'error'`; the
submit handler adds `'input-error'` (the only red-border
rule, `components-inputs.css:27`). So the border
survives every toggle, and the error `<p>`s keep their
stale text behind `display: none`. `form.reset()`
(already in the handler) covers the values;
`aria-invalid` removal is already correct.

No node seam (same precedent as Task 11). The witness is
TEST-PLAN.md B13 (~:1073, "form resets cleanly each
time") on the next browser run.

**Files:**
- Modify: `web-app/auth/index.ts` (:494-511)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing later tasks consume.

- [x] **Step 1: Fix the class names, clear the text**

In the toggle handler in `web-app/auth/index.ts`,
replace

```ts
            emailInput.classList.remove(
                'error',
            );
            passwordInput.classList.remove(
                'error',
            );
```

with

```ts
            emailInput.classList.remove(
                'input-error',
            );
            passwordInput.classList.remove(
                'input-error',
            );
```

and replace

```ts
            emailError.classList.add(
                'hidden',
            );
            passwordError.classList.add(
                'hidden',
            );
```

with

```ts
            emailError.textContent = '';
            emailError.classList.add(
                'hidden',
            );
            passwordError.textContent = '';
            passwordError.classList.add(
                'hidden',
            );
```

(the `aria-invalid` removals between them stay exactly
as they are).

- [x] **Step 2: Validate and commit**

Run: `./validate` — green.

```bash
git add web-app/auth/index.ts
git commit -m "Clear auth field errors on mode toggle" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    -m "Claude-Session: <executing session URL>"
```

---

### Task 13: Seed the AA slice Customer Profile record

**Doctrine:** Commandments III (Uniformity — the fixture
speaks `formRExtras`' no-binding voice and the mock
garden's attribute shapes), IX (copy the established
slice pattern); the transaction invariant (forming and
validation OUTSIDE the tx, row ops inside — the former
runs before `adapter.transaction`, only
`postRecordWriteOp` runs within); risks Unbidden Helper
Code (three plain text attributes, no constraints, no
flow, no binding, no instance — nothing AA33/AA34 does
not need).

Ruling 4 carries the argument. The reserved ids
(`api/test-plan-slices.ts:205-208`) finally get their
call sites; one new id (`aa-attr-3`) joins them
(`seedHashKey` falls back to the id itself, so no
preimage entry is needed — `seed-hash-preimage.ts`
:1286-1290).

**Files:**
- Modify: `api/test-plan-slices.ts` (SLICE_ENTITY_IDS
  ~:207; new `formAaRecord` beside `formRExtras`
  ~:1816; a form call after the reveals literal ~:3381;
  a write inside the tx after `postBootstrapIn` ~:3548)
- Test: `tests/test-plan-slices.test.ts` (:48 count; one
  new test beside `'garden slices seed Customer
  Profile'` ~:427)
- Modify: `TEST-PLAN.md` (AA33's Parallel paragraph,
  ~:962)

**Interfaces:**
- Consumes: `sliceEntityId`, `formSeedMessagePair`,
  `seedMessagePairKey`, `RECORD_TYPES_COLLECTION_PATTERN`,
  `RECORD_TYPE_DETAIL_PATTERN`,
  `ATTRIBUTE_DETAIL_PATTERN`, `validateRecordWriteBody`,
  `recordDocumentBodyOf`,
  `recordAttributeDocumentBodyOf`, `MessagePair`,
  `RecordWriteMessagePairs`, `STARK_ORGANIZATION`,
  `postRecordWriteOp`, `SYSTEM_MEMBER_ID` — every one
  already imported/defined in `api/test-plan-slices.ts`.
- Produces: the AA tenant owns one record, "Customer
  Profile", with attributes "Company Name", "Contact
  Email", "Contact Phone" (all `text`). No later task
  consumes this.

- [x] **Step 1: Extend the count and write the red pin**

In `tests/test-plan-slices.test.ts`:

(a) `:48`: `EXPECTED_SLICE_MESSAGE_PAIRS = 509` → `514`
(operation + document + 3 attribute PUTs).

(b) Beside `'garden slices seed Customer Profile'`
(~:427), add:

```ts
test('AA slice seeds the Customer Profile record',
async () => {
    const { db, reveal } = await seeded();
    const aa = reveal.find(
        (row) => row.section === 'AA',
    );
    assert.ok(aa);
    const records =
        await deriveRecordTypeCollection(
            db, aa.organizationId,
        );
    assert.equal(records.length, 1);
    assert.equal(
        records[0]!.name, 'Customer Profile',
    );
    const requests =
        await db.messagePairs.getAll();
    const attributes = deriveDocumentsAt(
        requests,
        canonicalUriCollection(
            aa.organizationId,
            '/record-types/'
                + sliceEntityId(
                    'aa-record-customer',
                )
                + '/attributes/',
        ),
    );
    assert.equal(attributes.size, 3);
});
```

(every import it needs — `deriveRecordTypeCollection`,
`deriveDocumentsAt`, `canonicalUriCollection`,
`sliceEntityId` — is already in the file's import block).

- [x] **Step 2: Run the file — red in two places**

Run: `TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \`
`node --strip-types --import ./tests/hmac-test-key.ts \`
`--test tests/test-plan-slices.test.ts`
Expected: the new AA test fails (`records.length` is 0)
and `'slice seed pair count is pinned'` fails (509
pairs ≠ 514); everything else passes.

- [x] **Step 3: Mint the third attribute id**

In `api/test-plan-slices.ts`, after the `'aa-attr-2'`
line (~:207), add:

```ts
    'aa-attr-3': 'kWpAaAttrPhoneSeedIdZg',
```

then verify uniqueness:
`grep -c "kWpAaAttrPhoneSeedIdZg" api/ -r` → exactly 1
(and confirm the literal is 22 chars, the id alphabet of
its neighbors). If the grep finds a collision, mint a
fresh 22-char `[A-Za-z0-9_-]` literal and re-check.

- [x] **Step 4: Form the record**

In `api/test-plan-slices.ts`, immediately after the
`formRExtras` function's closing brace, add:

```ts
type AaRecordWrites = {
    readonly body: Record<string, unknown>;
    readonly messagePairs: RecordWriteMessagePairs;
};

// AA33/AA34's fixture: the Customer Profile record
// with three text attributes, so the flow-state
// Attributes picker has options once AA33 binds the
// record via the designer header's "Record:" dropdown.
// No flow binding — AA's flow is minted in the UI at
// AA26, so its id does not exist at seed time.
async function formAaRecord(
    requestAt: string,
): Promise<AaRecordWrites> {
    const organizationId = STARK_ORGANIZATION;
    const adminId = 'XXZruirZyAOoRpNxaDnpSA';
    const recordId =
        sliceEntityId('aa-record-customer');
    const attributeRows = [
        {
            id: sliceEntityId('aa-attr-1'),
            name: 'Company Name',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
            record_id: recordId,
            organization_id: organizationId,
        },
        {
            id: sliceEntityId('aa-attr-2'),
            name: 'Contact Email',
            attribute_type: 'text',
            sort_order: 2,
            options: [],
            constraints: [],
            record_id: recordId,
            organization_id: organizationId,
        },
        {
            id: sliceEntityId('aa-attr-3'),
            name: 'Contact Phone',
            attribute_type: 'text',
            sort_order: 3,
            options: [],
            constraints: [],
            record_id: recordId,
            organization_id: organizationId,
        },
    ];
    const body: Record<string, unknown> = {
        kind: 'create',
        id: recordId,
        record: {
            organization_id: organizationId,
            name: 'Customer Profile',
            description:
                'AA33/AA34 attribute-picker'
                + ' fixture; no case edits it.',
            position: 1,
        },
        attributes: attributeRows,
        initialState: 'active',
        initialStateEventId: sliceEntityId(
            'aa-state-record-customer',
        ),
        initialStateAt: requestAt,
    };
    const validated = validateRecordWriteBody(body);
    const operation = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                RECORD_TYPES_COLLECTION_PATTERN,
                recordId,
            ),
            routePattern:
                RECORD_TYPES_COLLECTION_PATTERN,
            idParams: [organizationId],
            op: true,
            organization: organizationId,
            requesterIdentityId: adminId,
            body,
        },
        requestAt,
    );
    const document = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                RECORD_TYPE_DETAIL_PATTERN,
                recordId,
            ),
            routePattern: RECORD_TYPE_DETAIL_PATTERN,
            idParams: [organizationId, recordId],
            organization: organizationId,
            requesterIdentityId: adminId,
            body: recordDocumentBodyOf(validated),
        },
        requestAt,
    );
    const attributePuts: MessagePair[] = [];
    for (const attribute of attributeRows) {
        attributePuts.push(await formSeedMessagePair(
            {
                key: seedMessagePairKey(
                    ATTRIBUTE_DETAIL_PATTERN,
                    attribute.id,
                ),
                routePattern:
                    ATTRIBUTE_DETAIL_PATTERN,
                idParams: [
                    organizationId,
                    recordId,
                    attribute.id,
                ],
                organization: organizationId,
                requesterIdentityId: adminId,
                body: recordAttributeDocumentBodyOf(
                    attribute as unknown as
                        Record<string, unknown>,
                ),
            },
            requestAt,
        ));
    }
    return {
        body,
        messagePairs: {
            operation,
            document,
            attributePuts,
            attributeDeletes: [],
        },
    };
}
```

(The `as unknown as Record<string, unknown>` cast is the
file's own established idiom at the same call —
`formRecordBindingMessagePairs`'s attribute loop.)

- [x] **Step 5: Form outside the tx, write inside it**

In `postTestPlanSlices`:

(a) After the `reveals` literal closes (~:3381), add:

```ts
    const aaRecord = await formAaRecord(requestAt);
```

(b) Inside the transaction body, immediately after the
`await postBootstrapIn(...)` call (~:3548), add:

```ts
            await postRecordWriteOp(
                view,
                aaRecord.body,
                SYSTEM_MEMBER_ID,
                aaRecord.messagePairs,
            );
```

- [x] **Step 6: Run the file — green; then the suite**

Single-file run from Step 2. Expected: all pass — the
new AA test, the flipped count pin at 514, the
hash-uniqueness pin, and `'AA is bootstrap current +
org 1'` / `'AA and thin slices seed no ideas'` (ideas
only — a record does not trip them).
Run: `./test` — green.
Also: `grep -rn "slice" tests/pg-*.test.ts` — if any
postgres-pass test pins AA slice contents or the pair
count, extend it in this same commit (`./test-postgres`
verifies where a local postgres is available; the memory
suite is the gate either way).

- [x] **Step 7: Document the bind prerequisite**

In TEST-PLAN.md's AA33 case (~:962), the Parallel
paragraph currently opens:

> Parallel: In the "Data Capture" properties panel, open
> the "Attributes" fieldset.

Reword the opening so it reads:

> Parallel: In the flow header, set the "Record:"
> dropdown to "Customer Profile" (seeded in the AA
> slice). Then in the "Data Capture" properties panel,
> open the "Attributes" fieldset.

— continuing with the existing text unchanged (the
picker sources ONLY the bound record —
`web-app/flows/detail.ts:1599-1604` — so the bind step
is the case's own precondition). TEST-PLAN.md is exempt
from the 78-char lint; match the file's local wrap.

- [x] **Step 8: Validate and commit**

Run: `./validate` — green.

```bash
git add api/test-plan-slices.ts \
    tests/test-plan-slices.test.ts TEST-PLAN.md
git commit -m "Seed AA slice Customer Profile record" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    -m "Claude-Session: <executing session URL>"
```

---

### Task 14: Record discovered latents in TODO.md

**Doctrine:** the diff-matches-the-story article (fixing
any of these here would be Unbidden Helper Code); the
later-work single-home gate in `./validate` makes
TODO.md the only lawful shelf. TODO.md is 351 lines
against a 450 ceiling — six bullets fit.

**Files:**
- Modify: `TODO.md` (`## Later work`, append bullets)

**Interfaces:**
- Consumes: Ruling 8 and the run report's two flagged
  observations.
- Produces: nothing later tasks consume.

- [x] **Step 1: Append the bullets**

Append to `## Later work` (matching its terse
bullet-with-oracle voice, ≤78-char lines):

```markdown
- The add-identity dialog never clears its fields —
  AA-Obj's stale-state sibling —
  `web-app/identities/index.ts:213-281`
- `flows/stats.ts` wires no change subscription; the
  stats page stays stale until navigation
- The empty-state `onEmpty` removes the header create
  button irreversibly; a live empty→populated re-init
  (run-six Task 9) leaves the list without its header
  CTA — hide, don't remove —
  `web-app/ideas/index.ts`, `web-app/records/index.ts`
- Claim-on-load with no release-on-leave plus the
  8-hour `DEFAULT_LOCK_TIMEOUT` turns a drive-by
  work-order view into an 8-hour claim
  (run-six Task 3 renders it; the UX remains) —
  `web-app/workbox/detail.ts:583-593`,
  `api/types.ts:1007`
- G/V5 needs a cross-slice identity to verify Decline,
  or the case text should sanction any invited
  identity — plan defect vs hunter slip, unresolved —
  TEST-PLAN.md G/V5
- Intermittent "flow-marquee" console exceptions on
  non-canvas pages (Billing) — a flow-canvas gesture
  listener may be bound globally — TEST-PLAN.md G42
  observation
```

- [x] **Step 2: Validate and commit**

Run: `./validate` — green (the later-work gate accepts
TODO.md content; the line-count ceiling holds at
≤450).

```bash
git add TODO.md
git commit -m "Record run-six discovered latents" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    -m "Claude-Session: <executing session URL>"
```

---

### Task 15: Commit the completed plan

**Doctrine:** the Office of the Commit; the plan was
committed up front (owner call — Global Constraints), so
this commit records the fully ticked state.

**Files:**
- Commit:
  `docs/superpowers/plans/`
  `2026-08-25-test-plan-run-six-remediation.md`

**Interfaces:**
- Consumes: every prior task's ticked boxes.
- Produces: the campaign's history is complete.

- [x] **Step 1: Verify every box above is ticked**

Every `- [ ]` in Tasks 1-14 reads `- [x]`. Any unticked
box is unfinished work — finish it or report why, before
this task.

- [x] **Step 2: Verify the tree**

Run: `git status --short`
Expected: only this plan file, modified (its ticked
boxes). Run `./validate` one final time — green.

- [x] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-08-25-test-plan-run-six-remediation.md
git commit -m "Commit completed run-six plan" \
    -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" \
    -m "Claude-Session: <executing session URL>"
```

---

## After the campaign

Browser witnesses for every fix land with the next
TEST-PLAN run (TODO.md critical-path item 5): AA-Obj,
AA14, AA33/AA34, B13, F2/WB5a, K/K30, SV8b all re-run
there. Nothing in this plan builds, serves, or drives a
browser.

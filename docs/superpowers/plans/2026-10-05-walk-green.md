# Walk Green (ed1fac5c) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this worktree. Do not create one. Do
> not land. Do not rebase onto master. Do not merge,
> force-push, or delete a branch. One worker.
> Subagents work here and never pass the Agent tool
> `isolation`.

> **For the dispatching orchestrator:** every subagent
> prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then push down: the 78-char
> lint on code and scripts (not `.md`), 4-space indent,
> no inline styles, spell `organization` (never the org
> abbreviation as an identifier), present-tense
> imperative ~50-char commit subjects with no body
> beyond the trailer, the commandments and
> abominations each task names, and the patterns under
> Global Constraints. Subagents never run `./deploy`,
> `./bin/build`, `./bin/measure`, seed, or wipe.
> Task 8 belongs to the orchestrator alone.

**Goal:** After this plan, a fresh TEST-PLAN walk of
this branch scores PASS on every case, with I22's
BLOCKED the only non-PASS line.

**Architecture:** Three product defects get a red test
at the lowest layer that can express them, then a fix:
the workbox Release button binds only while the page's
last paint showed a live claim (WB23); a refused
invitation accept is neither re-read nor repainted
(V10); and the flow canvas moves its camera at
pointer-down, under the gesture in flight (AA32, F19).
Everything else is a TEST-PLAN correction whose pin
already matches the product: WB18, WB22, and SV3; the
walk order WB19a and WB19b need; and a driving note
for the native model `<select>` (G14a, G24b). I22
stays BLOCKED by its own driving note.

**Tech Stack:** Deno 2.9.6, TypeScript strict under
`deno.json`, `Deno.test` + `@std/assert`, the CDP
Layer 2 harness in `tests/browser/`. No new
dependencies.

**Spec:** No design doc. This plan argues from the
walk checkpoint `/tmp/fusion-angle-walk-ed1fac5c.txt`,
the two stubs
`docs/superpowers/test-plan-mitigations/2026-10-05-F2-WB23.md`
and `…/2026-10-05-V-V10.md`, and `TEST-PLAN.md` from
`## The walk` through `## Summary Format`. Cites are
at `ed1fac5c`. A cite that moved is re-found by its
quoted text. A cite whose text is gone is a stop.

**Worktree:** `.worktrees/membership-and-versions`,
branch `membership-and-versions`, HEAD `ed1fac5c` with
the two stubs untracked when this plan was written.

---

## Classification of the twelve

| # | Case | Walk | Class | Task |
|---|---|---|---|---|
| 1 | WB23 | FAIL | product defect (UI) | 2 |
| 2 | V10 | FAIL | product defect (client + UI) | 3, 4 |
| 3 | WB18 | DRIFT | doc: drive needs two members | 6c |
| 4 | WB22 | DRIFT | doc: parameter names | 6a |
| 5 | SV3 | DRIFT | doc: token JSON shape | 6b |
| 6 | WB19a | DEFERRED | walk order; product matches | 6d |
| 7 | WB19b | DEFERRED | walk order; product matches | 6d |
| 8 | AA32 | BLOCKED | product defect (camera) | 5 |
| 9 | F19 | BLOCKED | product defect (camera) | 5 |
| 10 | G14a | BLOCKED | driver limit; native select | 6e |
| 11 | G24b | BLOCKED | driver limit; native select | 6e |
| 12 | I22 | BLOCKED | stays BLOCKED (excluded) | — |

### Evidence per item

**1. WB23 — product defect.** `web-app/workbox/detail.ts`
`initUnclaimButton` (`:255-288`) returns before it
binds the click when `detail.claimStatus().kind !==
'claimed'` (`:263-264`). The presenter still renders
`#unclaim-btn` whenever the order is not archived
(`web-app/app/presenters/workbox-detail.ts:340-346`).
Tab 1's release rings `notifyWorkOrderChanges()`
(`client/work-orders-deletions.ts:25`), which reaches
tab 2 over the same-origin bus
(`client/channels.ts:147-152`). Tab 2's subscription
(`detail.ts:616-620`) runs `refreshDetail`
(`:523-547`), which repaints with no live claim. The
new button has no listener, so the click sends no
DELETE, shows no toast, and stays on the page. That is
exactly the walk's observation. Even a bound button
latches the held message (`detail.ts:270-272`), not
the head at the click. The server half already
matches: `tests/api-work-order-release.test.ts` 'a
release with no live claim answers the head' (`:291`)
decides the 200 no-op that stores nothing. No Layer 1
harness drives a page's click listener, so the red
test is Layer 2.

WB23's claim clause ("a second claim renews the
holder's claim") is doc drift. `init` claims on open
only when the caller holds no live claim
(`detail.ts:583-601`). A holder's second open
therefore appends nothing, which is what WB18's walk
line observed. Renewing on every open would add
`claimed` rows on every return to the screen, and
WB13a's pinned `claimed → claim_released → claimed`
history would stop holding.

The transition clause already holds in one cookie jar.
The bus refresh re-runs `loadPresenter`, so the second
tab's transition latches the refreshed work order
(`detail.ts:169`) and the refreshed `heldInstance`
(`:464`). Task 2 corrects the claim clause and leaves
the transition clause to the walk.

**2. V10 — product defect.** `web-app/invitations/index.ts`
`onListClick` (`:63-99`) calls
`postInvitationAcceptance`. That function
(`client/invitations.ts:172-188`) PUTs latched on the
held pending message. After the revoke the server
answers 412, which the pin
`tests/api-invitation-document.test.ts` 'a stale
invitation tag is 412' (`:654-677`) decides. The PUT
throws a bare `RequestError`, and the page's catch
(`:91-96`) only toasts `Failed: …`. Nothing re-reads,
and `notifyMembershipChanges()` never runs on the
failure path, so the comment at `:97-98` does not hold
there. The invitee can read the revoked document:
`GET identities/:id/invitations/:membership-id` goes
through `getInvitationOnIdentityNest`
(`api/invitations-domain.ts:405-422`), whose
`visibleHead(…, 'identity')` (`:369-382`) filters by
state only on the organization nest. The presenter
already paints a non-pending row with its badge and no
actions (`web-app/app/presenters/invitation-list.ts`
`buildInviteeRow`). The page reads pending only
(`index.ts:34-36`, `:57-59`), so "the revoked state on
reload" in V10's Pin clause is doc drift. Task 4
corrects it.

**3. WB18 — doc drift.** The inbox row click only
navigates. `init` skips the claim for the holder
(`detail.ts:583-601`), so a second tab in the same jar
is the same member and appends nothing. The 409 pin,
'a live claim by another member is a 409'
(`tests/api-work-order-claim.test.ts:179`), needs a
second member. Members may claim
(`api/authorization.ts` `MEMBER_VERBS`
`'/organizations/:id/work-orders'`). A second member's
open PUTs the claim (`detail.ts:585-593`), gets 409
`work order is already claimed` ('a foreign live claim
is 409 from the head', `:566`), and `loadInto` paints
the error state with that message and Try Again
(`web-app/app/loading-states.ts:218-244`). The cited
pin 'two-actor contention: exactly one claimed event
lands and exactly one request gets the byte-exact 409
body — never which actor wins' does not exist. The
real test is 'two-actor contention: the second claim
on a stale tag is 412 and exactly one claimed event
lands' (`:370-372`).

**4. WB22 — doc drift.**
`web-app/app/presenters/workbox-inbox.ts:188-197`
takes `(workOrders, transitionsByWo, activeClaimsByWo,
memberMap, mode)`. Its exports (`:44`, `:57`, `:63`,
`:68`, `:188`) are `InboxItem`, `InboxMode`,
`ActiveClaim`, `WorkboxInboxPresenter`, and
`buildInboxItems`. TEST-PLAN.md:4656 names the old
parameters.

**5. SV3 — doc drift.** The pin
`tests/api-authentication-token.test.ts` 'token JSON
has no refresh_token; Set-Cookie is HttpOnly'
(`:393-417`) asserts `body['access_token']` is
`undefined` (`:407`) and that `Authentication-Info`
carries `access_token="` (`:408-411`). The product
matches the pin. The PASS line is wrong.

**6–7. WB19a, WB19b — walk order only.** TEST-PLAN
already lists WB19a and WB19b before WB14
(`TEST-PLAN.md:4499`, `:4531`, `:4570`), but the
explorer drove WB14 first. The recovery already
matches the PASS lines. A 412 goes to `recoverFrom412`
(`detail.ts:195-207`, `:226-253`), which sets
`conflictNotice`, re-runs `loadPresenter` (re-GETting
the instance), repaints, and toasts
`INSTANCE_CONFLICT_NOTICE` ('This instance changed
underneath you — values refreshed; re-apply your
edit', `web-app/app/presenters/record-detail.ts:76-78`)
with kind `'warning'`. It does not retry. The
presenter paints the notice with `data-tone="warning"
role="status"` (`workbox-detail.ts:348-357`). Instance
PATCHes ring no workbox bell, so the stale screen
really is stale. No code change: Task 6d makes WB14
refuse to run before them.

**8–9. AA32, F19 — product defect, one root.** A port
press emits `request-update` with a connecting state
(`web-app/app/flow-fsm-reduce.ts:130-162`) and
selects the source node (`:134-139`). A body press
enters `drag.kind === 'dragging'` (`:208-229`). Both
make `isGestureActive` true (`:680-687`). The page
callback (`web-app/flows/detail.ts:1044-1081`) takes
the narrow rAF path only when both the previous and
the next state are active (`:1048-1057`). At gesture
start it therefore runs the full path:
`reconcileFitFromDom()` (`:1065`, which re-fits under
Auto Fit, `:766-788`) and then, when the selection
changed while the panel is open, `withSelectionCentered()`
(`:1071-1080`), which pans unconditionally
(`web-app/app/presenters/flow-designer.ts:719-725`).
The camera moves at pointer-down.

- **AA32:** AA31 left the panel open on the edge
  rename, and the press on Review's port changed the
  selection, so the camera re-centred. The walk's
  viewBox jump `-505 -214.75 → -391 -267` is a pure
  translation.
- **F19:** F18's Auto Layout switch commits through
  plain `commit` (`detail.ts:936-942`), which leaves
  the provisional node-bounds fit. The next
  `reconcileFitFromDom` re-fits to the drawn bbox, and
  that was F19's port press. F20 and F21 passed
  because the camera had already settled.

The release then hit-tests a moved world and misses.
Draft→Triage is a free pair: Draft
(`api/mock-data/flows.ts:656`) has one outgoing edge
and Triage (`:678`) one incoming, both through Submit.
A Shift release over nothing emits neither add-edge
nor add-node (`flow-fsm-reduce.ts` `finishConnect`),
which is correct. The muted line was the product
seeing Shift with no node under the pointer. FLOW-CANVAS.md
(`:101-107`) prescribes the centering but never says
when. Task 5 makes the camera hold from pointer-down
to pointer-up.

**10–11. G14a, G24b — driver limit, product correct.**
Both Model controls are native `<select>`s:
`web-app/members/index.html:256-262`, filled
synchronously at boot (`web-app/members/index.ts:115-124`),
and `buildEditableModel`
(`web-app/app/presenters/ai-member-detail.ts:287-301`).
Both are built by `buildModelOptgroups` (`:269-284`)
from the static `PROVIDER_MODELS`
(`api/provider-models.ts`, 9 models). No CSS under
`web-app/` sets `appearance`, `::picker`, or
`base-select`, and no keydown handler intercepts
arrows on these selects. On macOS Chrome an arrow on
a focused `<select>` opens an OS menu. That menu is
outside the renderer, so CDP neither paints it nor
drives it, which is exactly what both lines saw. G24b's
`h` matches no label. The PASS lines need no custom
widget, and AA7a PASSed on the same select in this
walk. Task 6e adds a driving note.

**12. I22 — excluded, stays BLOCKED.**
`web-app/app/loading-states.ts:210-244` (`loadInto`)
paints `buildErrorState(…, 'Try Again')` on a
rejected fetch and binds `cfg.retry` to the button.
`tests/loading-states.test.ts` 'a rejecting fetch
renders the error state and calls neither hook'
(`:79-81`) pins it. The case's own text says to
record BLOCKED when no fault occurs naturally. No
product hole exists, so no fault injector is
invented.

## Out of scope

Do not implement any of these. Each is named so its
absence is deliberate.

- `postInvitationDecline` has the same stale-latch
  412 shape as accept. V10 names accept only.
- After a refused accept the top-bar bell keeps its
  count until navigation. Notifying would re-run the
  page's pending-only refresh and drop the row V10
  must show.
- `detail.ts:195-206` sends every 412 into the
  instance-conflict recovery, including a stale
  work-order tag on a pure move. `conflictNotice` is
  module state that outlives a refresh.
- The Auto Layout switch commits without
  `commitAndFit` (`detail.ts:936-942`). The
  ResizeObserver path (`detail.ts:1786-1802`) has no
  gesture guard. The panel callback re-fits at a
  double-click's second press. The presenter mutates
  the FSM's aliased viewBox in place
  (`flow-designer.ts:489-490`, `:1018-1021`).
- `clearAddMemberFields` (`web-app/members/index.ts`)
  does not reset `#ai-model`.
- A Layer 1 pin for a G24b model change.
- Any change to the transition latch in
  `detail.ts:160-179`. The comment at `:66-68` forbids
  a submit-time instance GET.

## Global Constraints

- Deno only. `./test validate` is the Layer 1 gate on
  every commit. A browser proof is `./test browser`
  (Layer 2), never a walk.
- Red test first for every product change. Watch it
  fail for the reason this plan names before you write
  the fix.
- 78-character lines in every file `./test lint`
  lints (code and scripts, not `.md`). 4-space indent.
  No inline styles.
- Commit subject: one line, present-tense imperative,
  about 50 characters, no body. End every message
  with the Co-Authored-By trailer naming the model
  that wrote the commit. For a Claude Opus 5.5
  session that is
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  Author stays the repository's configured user. Do
  not pass `--author`.
- One concern per commit. Never move or rename and
  change content in the same commit. A test and the
  fix it proves land in one commit, so every commit is
  green.
- Organization comes from the verified token. The
  write authorizer 403s before genesis. Validators sit
  at the gate. `RequestContext` is the first argument
  to a client verb. A client verb returns an
  `HttpMessage`, or a value that keeps one. A write
  from a held message latches that message. Presenters
  return `SafeHtml`. Storage is snake_case, the domain
  camelCase.
- A transaction body awaits only row operations.
- Never log `POSTGRES_URL`, `JWT_HMAC_SIGNING_KEY`, or
  `PORT`.
- `export DENO_DIR="$TMPDIR/deno-dir"` before any
  `deno`, `./test`, `./bin/build`, or `./deploy`. That
  is an agent accommodation. Never bake it into a repo
  script.
- `./test browser` needs Chrome (`CHROME` or
  `CHROME_DEBUG_URL`). Under the Claude Code sandbox
  Chrome could not start while this plan was written
  (`Chrome DevToolsActivePort timed out after
  15000ms`). Run Layer 2 where Chrome can launch, or
  point `CHROME_DEBUG_URL` at a running Chrome. If
  neither is possible, stop and ask the owner. Never
  skip a Layer 2 red or green step.
- Do not weaken a green assertion to make a run or a
  walk line pass.
- A product commit cites no stub. A stub's
  `Reproduced by` names its red test in a separate
  commit after the fix lands.
- Single-file Layer 1 runs use this command, with the
  file substituted:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check \
--allow-env --allow-read --allow-write --allow-net \
--preload ./tests/hmac-test-key.ts \
--preload ./tests/local-storage-stub.ts \
--preload ./tests/session-storage-stub.ts \
--preload ./tests/worker-name-prefix.ts \
tests/adapters-invitations.test.ts
```

## Review Focus

1. **Retarget centering after a click.** With the panel
   open, clicking another node must still centre it,
   now on release instead of at press. Task 5 Step 1
   adds the guard test 'a node click under an open
   panel centers it on release (F13)' before the fix.
2. **A refused accept re-reads the fresh tag.** The
   repainted row must hold the re-read head, so a
   later action latches the current tag, not the stale
   one. Task 3's test asserts `err.current`'s etag
   differs from the stale one's.
3. **A Release in a tab whose paint shows no live
   claim.** The click must still DELETE, get the 200
   no-op, toast, and land on the inbox. Task 2's Layer
   2 test drives exactly this, with the button
   repainted unclaimed before the click.
4. **The press must not move the camera even when
   Auto Fit's provisional fit is stale.** Task 5's F19
   test asserts the viewBox is unchanged across the
   press right after F18's toggles.
5. **The release lands on the node the user aimed
   at.** Both Task 5 tests compute the target before
   the press, as a person would, and assert one more
   edge and no new node.

---

## Graph

Task 1 runs first, and only after the owner picks an
execution mode. Tasks 2, 3, 5, and 6 are independent
of each other. Task 4 needs Task 3. One worker, so run
them in this order: 2, 3, 4, 5, 6. Task 7 runs after
all of them. Task 8 runs after Task 7, and only on a
clean tree, by the orchestrator.

Each product task follows the same cycle:

1. Write the failing test.
2. Watch it fail for the reason named here.
3. Write the minimal fix.
4. Watch it pass.
5. Run `./test validate`, and `./test browser` for a
   Layer 2 test.
6. Make one commit.

A spec-compliance review and then a code-quality
review follow, each by a fresh planner, before the
next task starts.

---

## Task 1: Commit the stubs and this plan

**Files:**
- Commit: `docs/superpowers/test-plan-mitigations/2026-10-05-F2-WB23.md`
- Commit: `docs/superpowers/test-plan-mitigations/2026-10-05-V-V10.md`
- Commit: `docs/superpowers/plans/2026-10-05-walk-green.md`

**Interfaces:** none.

- [ ] **Step 1: Confirm the tree**

Run: `git status --short`
Expected: exactly the two stub files and this plan,
untracked.

- [ ] **Step 2: Commit the stubs unchanged**

```bash
git add docs/superpowers/test-plan-mitigations/2026-10-05-F2-WB23.md \
docs/superpowers/test-plan-mitigations/2026-10-05-V-V10.md
git commit -m "Record the ed1fac5c walk's two failure stubs" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Commit this plan**

```bash
git add docs/superpowers/plans/2026-10-05-walk-green.md
git commit -m "Plan the ed1fac5c walk remedies" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Release from the head read at the click (WB23)

Commandments: Reliability, Idempotency, Logic.
Abominations: Swallowed Failures (keep `reportFault`),
Greedy Catch (one call inside the `try`), Internal
Defense (no new guard on claim state).

**Files:**
- Test: `tests/browser/workbox-transition.test.ts`
  (append)
- Modify: `web-app/workbox/detail.ts:255-288`
- Modify: `docs/superpowers/test-plan-mitigations/2026-10-05-F2-WB23.md`
- Modify: `TEST-PLAN.md` (WB23 item, from line 4665)

**Interfaces:**
- Consumes: `getWorkOrder(ctx: RequestContext, id:
  string): Promise<WorkOrder>` and
  `deleteWorkOrderClaim(ctx: RequestContext, held:
  WorkOrder): Promise<WorkOrder>`, both already
  imported in `detail.ts` from `../../client/index.ts`.
  Also `WorkboxDetailPresenter#idValue(): string`.
- Produces: the module-private `async function
  deleteWorkOrderClaimAtHead(ctx: RequestContext,
  workOrderId: string): Promise<void>` in
  `web-app/workbox/detail.ts`.

- [ ] **Step 1: Write the failing Layer 2 test**

Append to `tests/browser/workbox-transition.test.ts`.
The file already imports `assert`, `useBrowser`,
`withAdminPage`, `type Page`, and `registryUrl`, and
defines `createOnboardingWorkOrder`. `browser` is the
file's `useBrowser()`.

```ts
Deno.test(
    'a second tab releases after the first released'
    + ' (WB23)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await createOnboardingWorkOrder(
                    page, origin.baseUrl,
                );
                const id = await page.evaluate<string>(
                    `new URLSearchParams(location.search)`
                    + `.get('id')`,
                );
                // Same browser context, same cookie jar,
                // same member: disposed with the page.
                const other = await browser.get()
                    .newPageIn(page.contextId);
                await other.navigate(registryUrl(
                    origin.baseUrl, 'workbox-detail',
                    'id=' + id,
                ));
                await other.ready('workbox-detail');
                await other.waitFor('#unclaim-btn');
                await other.evaluate(
                    `document.querySelector(`
                    + `'#unclaim-btn').dataset.stale`
                    + ` = 'true'`,
                );
                await page.click('#unclaim-btn');
                await page.until(
                    `location.pathname.endsWith(`
                    + `'/workbox/index.html')`,
                    'first tab in the inbox',
                );
                // The release rings the same-origin bus;
                // the second tab repaints with no live
                // claim, so its button is a fresh node.
                await other.until(
                    `document.querySelector(`
                    + `'#unclaim-btn')?.dataset.stale`
                    + ` === undefined`,
                    'second tab repainted',
                );
                await other.click('#unclaim-btn');
                await other.until(
                    `location.pathname.endsWith(`
                    + `'/workbox/index.html')`,
                    'second tab in the inbox',
                );
                assert(
                    await other.until<boolean>(
                        `[...document.querySelectorAll(`
                        + `'.toast')].some(t =>`
                        + ` t.textContent.includes(`
                        + `'Work order released'))`,
                        'Work order released toast',
                    ),
                );
            },
        );
    },
);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `export DENO_DIR="$TMPDIR/deno-dir"; ./test browser`

Expected: this test FAILs with `second tab in the
inbox` timing out. The repainted button has no
listener (`detail.ts:263-264`), so the click sends
nothing. Every other browser test passes. Record
`git rev-parse --short HEAD` as the red SHA for Step
7. If it fails for any other reason, stop and report.

- [ ] **Step 3: Write the fix**

In `web-app/workbox/detail.ts`, replace
`initUnclaimButton` (`:255-288`) with:

```ts
function initUnclaimButton(
    container: HTMLElement,
    detail: WorkboxDetailPresenter,
): void {
    const btn = $(
        '#unclaim-btn', container,
    );
    if (!btn) return;
    btn.addEventListener(
        'click',
        async () => {
            const ctx = sessionContext();
            try {
                await deleteWorkOrderClaimAtHead(
                    ctx, detail.idValue(),
                );
            } catch (err) {
                reportFault(
                    ctx,
                    'Failed to release work order',
                    err,
                );
                return;
            }
            showToast(
                'Work order released',
                'success',
            );
            navigateTo('workbox');
        },
    );
}

// A release judges the work order as it stands at the
// click, not as this tab last painted it: a claim that
// another tab already released answers 200 and stores
// nothing.
async function deleteWorkOrderClaimAtHead(
    ctx: RequestContext,
    workOrderId: string,
): Promise<void> {
    await deleteWorkOrderClaim(
        ctx, await getWorkOrder(ctx, workOrderId),
    );
}
```

- [ ] **Step 4: Run Layer 1 and Layer 2 and watch them
  pass**

Run: `export DENO_DIR="$TMPDIR/deno-dir"; ./test validate`
Expected: exit 0.

Run: `./test browser`
Expected: exit 0, `0 failed`, including 'a second tab
releases after the first released (WB23)'.

- [ ] **Step 5: Commit**

```bash
git add tests/browser/workbox-transition.test.ts \
web-app/workbox/detail.ts
git commit -m "Release a claim from the head read at the click" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Name the red test in the stub**

In `docs/superpowers/test-plan-mitigations/2026-10-05-F2-WB23.md`,
replace these lines:

```
- Reproduced by: not reproduced — the release
  race has no red test at ed1fac5c. The cited
  pin decides racing transitions, not this
  click that sent nothing.
```

with these, putting Step 2's red SHA in place of
`<red-sha>`:

```
- Reproduced by:
  tests/browser/workbox-transition.test.ts 'a
  second tab releases after the first released
  (WB23)' red at <red-sha>
```

- [ ] **Step 7: Commit the stub**

```bash
git add docs/superpowers/test-plan-mitigations/2026-10-05-F2-WB23.md
git commit -m "Reproduce WB23 on the second-tab release test" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Rewrite WB23 in TEST-PLAN.md**

Replace the WB23 item: from its line
`- [ ] **WB23** Claim, release, and transition a work`
through the line `       refusal, and the reload`.
The replacement is:

```
- [ ] **WB23** Claim, release, and transition a work
  order in two tabs of one cookie jar: act in the
  first tab, then act on the same work order in the
  second without reloading it. PASS: the second tab's
  action is judged against the first tab's result
  rather than refused. Claim: the second tab, opened
  on the holder's live claim, shows the holder's
  editable screen and appends no second claim (the
  action screen claims on open only when the caller
  holds no live claim). Release: after the first tab
  releases, the second tab has repainted (a write
  rings the same-origin bus); its Release reads the
  work order's head at the click and DELETEs
  `work-orders/:id/claim` latched on it — a 200 no-op
  that stores nothing — then toasts "Work order
  released" and lands on the inbox. Transition: after
  the first tab transitions, the second tab has
  repainted at the new state, and its transition
  latches that head and lands. A value-bearing
  transition sent over a changed instance shows the
  412 refusal (WB19a's recovery). A reload shows the
  result.
  Pin: tests/browser/workbox-transition.test.ts 'a
       second tab releases after the first released
       (WB23)' (decides the second tab's Release sends
       the DELETE, toasts, and lands on the inbox);
       tests/api-work-order-release.test.ts 'a release
       with no live claim answers the head' (decides
       the 200 no-op stores nothing);
       tests/api-work-order-transition-instance.test.ts
       'racing value-bearing transitions land once'
       (decides that of two transitions latched on one
       head, one lands and the other answers 412 with
       nothing stored); exploratory — the claim and
       transition halves, and the reload
```

- [ ] **Step 9: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Rewrite WB23 around the second-tab release" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Raise a stale accept as the invitation now stands (V10, client)

Commandments: Reliability, Clarity, Idempotency.
Abominations: Swallowed Failures (a 412 is re-raised
as a named refusal, never dropped), Greedy Catch (the
`try` holds the PUT alone), Default Values.

**Files:**
- Test: `tests/adapters-invitations.test.ts` (import
  plus one test after 'accept after revoke is
  rejected, no membership', `:718-743`)
- Modify: `client/invitations.ts:13-17` (import),
  after `:99-101` (new reader), after `:156-165`
  (new error), `:172-188` (accept)

**Interfaces:**
- Consumes: `RequestContext.GET<T>(resource: string):
  Promise<HttpMessage<T>>`, `inviteeViewOf`,
  `invitationPath`, and `HTTP_PRECONDITION_FAILED`
  (`shared/http-errors.ts:65`).
- Produces, exported from `client/invitations.ts` and
  re-exported by `client/index.ts`'s `export *`:

```ts
export class InvitationChangedError extends Error {
    readonly current: InvitationView;
    constructor(current: InvitationView);
}
```

  `postInvitationAcceptance(ctx, invitation)` keeps
  its signature. On a 412 it rejects with
  `InvitationChangedError`, whose `current` is the
  re-read invitation. Every other fault is rethrown
  unchanged.

- [ ] **Step 1: Write the failing test**

In `tests/adapters-invitations.test.ts`, add
`InvitationChangedError,` to the import list from
`'../client/invitations.ts'` (`:58-69`), directly
after `getSentInvitations,`. Then add this test
directly after 'accept after revoke is rejected, no
membership':

```ts
Deno.test('a stale accept refuses with the invitation'
+ ' as it stands',
() => withLocalStorageAsync(freshStorage(), async () => {
    const { db } = await ctxFor('XXZruirZyAOoRpNxaDnpSA'
        , WAYNE);
    const tony = await ctxOn(db, 'XXZruirZyAOoRpNxaDnpSA'
        , WAYNE);
    await postInvitationGrant(tony, 'sarah@x.com');
    const inv = await invitationOf(db, WAYNE, SARAH);
    const sarah = await ctxOn(db, SARAH
        , 'AjdvjuECVZEgZoFajaIEkg');
    // Held before the revoke, as the invitee's open
    // page holds it.
    const stale = await heldInvitee(sarah, inv.id);
    await postInvitationRevocation(
        tony, await heldSent(tony, inv.id),
    );
    const err = await assertRejects(
        () => postInvitationAcceptance(sarah, stale),
        InvitationChangedError,
    );
    assertStrictEquals(err.current.id, inv.id);
    assertStrictEquals(err.current.state, 'revoked');
    assert(
        err.current.message.query('header.etag').toText()
        !== stale.message.query('header.etag').toText(),
        'the refusal carries the fresh head',
    );
    const wayne = (await deriveMembershipsAll(db))
        .filter(m => m.identity_id === SARAH
            && m.organization_id === WAYNE);
    assertStrictEquals(wayne.length, 0);
}));
```

- [ ] **Step 2: Run it and watch it fail**

Run the single-file Layer 1 command from Global
Constraints on `tests/adapters-invitations.test.ts`.

Expected: the file FAILs to load with `The requested
module '../client/invitations.ts' does not provide an
export named 'InvitationChangedError'`. Record `git
rev-parse --short HEAD` as the red SHA for Task 4.

- [ ] **Step 3: Write the fix**

In `client/invitations.ts`, extend the import at
`:13-17`:

```ts
import {
    RequestError,
    HTTP_NOT_FOUND,
    HTTP_CONFLICT,
    HTTP_PRECONDITION_FAILED,
} from '../shared/http-errors.ts';
```

Directly after `invitationPath` (`:99-101`), add:

```ts
// One invitation as the invitee sees it now — the head
// a refused answer is judged against.
async function getInvitation(
    ctx: RequestContext,
    id: Id,
): Promise<InvitationView> {
    return inviteeViewOf(await ctx.GET<MembershipEntity>(
        invitationPath(ctx, id),
    ));
}
```

Directly after `SessionRemintFailedError`
(`:156-165`), add:

```ts
// An answer latched on a head that has since moved. The
// server stored nothing; `current` is the invitation as
// it stands, for the page to hold in place of the row
// it answered.
export class InvitationChangedError extends Error {
    readonly current: InvitationView;

    constructor(current: InvitationView) {
        super(
            'the invitation changed before the answer'
            + ' landed; it is now ' + current.state,
        );
        this.current = current;
    }
}
```

Replace `postInvitationAcceptance` (`:172-188`) with:

```ts
export async function postInvitationAcceptance(
    ctx: RequestContext,
    invitation: InvitationView,
): Promise<void> {
    const organizationId = invitation.message
        .body().toValue().organization_id;
    try {
        await ctx.PUT(
            invitationPath(ctx, invitation.id),
            { state: 'accepted', at: nowUtc() },
            [invitation.message],
        );
    } catch (err) {
        // A 412 names a head past the held one: read it
        // and raise it as the refusal. Any other fault
        // is its own.
        if (
            !(err instanceof RequestError)
            || err.status !== HTTP_PRECONDITION_FAILED
        ) {
            throw err;
        }
        throw new InvitationChangedError(
            await getInvitation(ctx, invitation.id),
        );
    }
    try {
        await remintSessionClaims(ctx, organizationId);
    } finally {
        notifyMembershipChanges();
    }
}
```

Keep the doc comment above the function as it is.

- [ ] **Step 4: Run it and watch it pass**

Run the single-file command again.
Expected: `ok`, including 'a stale accept refuses with
the invitation as it stands' and 'accept after revoke
is rejected, no membership' (still 409).

Run: `export DENO_DIR="$TMPDIR/deno-dir"; ./test validate`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/adapters-invitations.test.ts \
client/invitations.ts
git commit -m "Raise a stale accept as the invitation now stands" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: Paint a refused accept's row as it stands (V10, page)

Commandments: Uniformity (the held list names what it
holds), Reliability, Clarity. Abominations: Swallowed
Failures, Greedy Catch.

**Files:**
- Modify: `web-app/invitations/index.ts`
- Create: `tests/browser/invitations.test.ts`
- Modify: `docs/superpowers/test-plan-mitigations/2026-10-05-V-V10.md`
- Modify: `TEST-PLAN.md` (V10 item, from line 5401)

**Interfaces:**
- Consumes: `InvitationChangedError` (Task 3),
  `InvitationListPresenter`, and `showToast(message:
  string, variant: 'success' | 'error' | 'warning' |
  …)`.
- Produces: no new exports.

- [ ] **Step 1: Rename the held rows (pure rename)**

In `web-app/invitations/index.ts`, rename the
module-level `pending` to `invitations` at every use
(`:24`, `:39`, `:52`, `:57`, `:73`). Change nothing
else.

Run: `export DENO_DIR="$TMPDIR/deno-dir"; ./test validate`
Expected: exit 0.

```bash
git add web-app/invitations/index.ts
git commit -m "Name the invitee's held rows for what they hold" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Write the failing Layer 2 test**

Create `tests/browser/invitations.test.ts`:

```ts
import { assert, assertStrictEquals } from '@std/assert';
import { handleRequest } from '../../api/api.ts';
import { nowUtc } from '../../shared/types.ts';
import { STARK_ORGANIZATION } from
    '../../api/mock-data/seed-constants.ts';
import { membershipNameOf } from
    '../../shared/membership-name.ts';
import { apiRequest } from '../http-fixtures.ts';
import {
    adminToken, signIn, startOrigin, useBrowser,
    withTimeout,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
// A seeded Wayne-only human: Stark can invite him.
const DAVID_EMAIL = 'david.martinez@company.com';
const DAVID = 'DAjUkaBUIZbXSQeoLDZEXQ';
const INVITATIONS =
    `/organizations/${STARK_ORGANIZATION}/invitations/`;
const ACCEPT = '[data-invitation-action="accept"]';

Deno.test('an accept over a revoke paints the row'
+ ' revoked (V10)', async () => {
    await withTimeout((async () => {
        // One try per acquisition, so a later failure
        // still releases the earlier resource.
        const origin = await startOrigin();
        try {
            const granted = await handleRequest(
                origin.db, apiRequest({
                    method: 'POST',
                    path: INVITATIONS,
                    token: await adminToken(),
                    body: {
                        email: DAVID_EMAIL,
                        grantAt: nowUtc(),
                    },
                }),
            );
            assertStrictEquals(granted.status, 201);
            await granted.body?.cancel();
            const etag = granted.headers.get('etag');
            assert(etag !== null);
            const page = await browser.get().newPage();
            try {
                await signIn(page, origin, DAVID_EMAIL);
                await page.navigate(registryUrl(
                    origin.baseUrl, 'invitations',
                ));
                await page.ready('invitations');
                await page.waitFor(ACCEPT);
                // The admin revokes while the invitee's
                // page still holds the pending head.
                const revoked = await handleRequest(
                    origin.db, apiRequest({
                        method: 'PUT',
                        path: INVITATIONS
                            + membershipNameOf(
                                STARK_ORGANIZATION, DAVID,
                            ),
                        token: await adminToken(),
                        body: {
                            state: 'revoked',
                            at: nowUtc(),
                        },
                        headers: { 'If-Match': etag },
                    }),
                );
                assertStrictEquals(revoked.status, 200);
                await revoked.body?.cancel();
                await page.click(ACCEPT);
                await page.until(
                    `document.querySelector(`
                    + `'#invitations-list').textContent`
                    + `.includes('Revoked')`,
                    'row painted revoked',
                );
                assertStrictEquals(
                    await page.evaluate<number>(
                        `document.querySelectorAll(`
                        + `'[data-invitation-action]')`
                        + `.length`,
                    ),
                    0,
                );
                assert(
                    await page.until<boolean>(
                        `[...document.querySelectorAll(`
                        + `'.toast')].some(t =>`
                        + ` t.textContent.includes(`
                        + `'This invitation changed'))`,
                        'changed toast',
                    ),
                );
            } finally {
                await browser.get()
                    .disposeContext(page.contextId);
            }
        } finally {
            await origin.close();
        }
    })(), 'V10 revoked accept');
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `export DENO_DIR="$TMPDIR/deno-dir"; ./test browser`

Expected: this test FAILs with `row painted revoked`
timing out. Task 3's client raises
`InvitationChangedError`, but the page's catch only
toasts `Failed: …` and repaints nothing. Every other
browser test passes. Record `git rev-parse --short
HEAD` as the Layer 2 red SHA. If it fails before the
click (sign-in, `invitations` ready, or the 201/200
asserts), stop and report: the premise about the seed
is then wrong.

- [ ] **Step 4: Write the fix**

In `web-app/invitations/index.ts`, add
`InvitationChangedError,` to the import from
`'../../client/index.ts'`, directly after
`getInvitations,`. Add this below the
`const { signal } = createPageAbort();` line:

```ts
const INVITATION_CHANGED_NOTICE =
    'This invitation changed — your answer did not land';
```

Replace the `catch` block of `onListClick` (`:91-96`)
with:

```ts
    } catch (err) {
        if (err instanceof InvitationChangedError) {
            repaintChanged(err.current);
            return;
        }
        log.error(
            'invitation action failed', 'invitations', err);
        showToast(
            'Failed: ' + extractErrorMessage(err), 'error');
    }
```

Add this function after `onListClick`:

```ts
// A refused answer repaints its row as it now stands —
// revoked, declined, or pending at a fresh tag — in
// place. The pending-only list drops it on the next
// read.
function repaintChanged(current: InvitationView): void {
    invitations = invitations.map(
        inv => inv.id === current.id ? current : inv,
    );
    rerender();
    showToast(INVITATION_CHANGED_NOTICE, 'warning');
}
```

- [ ] **Step 5: Run Layer 1 and Layer 2 and watch them
  pass**

Run: `./test validate`
Expected: exit 0.

Run: `./test browser`
Expected: exit 0, `0 failed`, including 'an accept
over a revoke paints the row revoked (V10)'.

- [ ] **Step 6: Commit**

```bash
git add tests/browser/invitations.test.ts \
web-app/invitations/index.ts
git commit -m "Paint a refused accept's row as it now stands" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Name the red tests in the stub**

In `docs/superpowers/test-plan-mitigations/2026-10-05-V-V10.md`,
replace these lines:

```
- Reproduced by: not reproduced — no red test
  at ed1fac5c asserts that the invitations list
  paints revoked after that 412.
```

with these, filling in Task 3 Step 2's red SHA and
this task's Step 3 red SHA:

```
- Reproduced by:
  tests/adapters-invitations.test.ts 'a stale
  accept refuses with the invitation as it
  stands' red at <task-3-red-sha>;
  tests/browser/invitations.test.ts 'an accept
  over a revoke paints the row revoked (V10)'
  red at <task-4-red-sha>
```

```bash
git add docs/superpowers/test-plan-mitigations/2026-10-05-V-V10.md
git commit -m "Reproduce V10 on the revoked-accept tests" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Correct V10 in TEST-PLAN.md**

In the V10 item, replace:

```
  click Accept on it in the second without reloading. PASS: the
  accept refuses; the list shows it revoked.
  Pin: tests/api-invitation-document.test.ts 'a stale
       invitation tag is 412' (decides that an accept
       latched on the head before a revoke answers 412
       and stores nothing); exploratory — the rendered
       refusal and the revoked state on reload
```

with:

```
  click Accept on it in the second without reloading. PASS: the
  accept refuses (PUT 412); the page re-reads the
  invitation and repaints its row in place with the
  Revoked badge and no Accept or Decline, and a
  warning toast reads "This invitation changed — your
  answer did not land". The list asks for pending
  invitations only, so a reload drops the row.
  Pin: tests/api-invitation-document.test.ts 'a stale
       invitation tag is 412' (decides that an accept
       latched on the head before a revoke answers 412
       and stores nothing);
       tests/adapters-invitations.test.ts 'a stale
       accept refuses with the invitation as it stands'
       (decides the refusal carries the re-read revoked
       invitation at its fresh tag);
       tests/browser/invitations.test.ts 'an accept
       over a revoke paints the row revoked (V10)'
       (decides the repaint and the toast);
       exploratory — the two-jar drive itself
```

```bash
git add TEST-PLAN.md
git commit -m "Pin V10 on the revoked-accept tests" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Hold the camera still under a gesture (AA32, F19)

Commandments: Reliability, Immutability (the camera
the user aimed through does not change under them),
Logic. Abominations: Shared Mutable State (add no new
module state; the gesture-start selection lives on
`PageState`), Internal Defense.

**Files:**
- Test: `tests/browser/canvas-gestures.test.ts`
  (imports, helpers, three tests)
- Modify: `web-app/flows/detail.ts` (`PageState`,
  `:107-168`; the `request-update` callback,
  `:1044-1081`)
- Modify: `FLOW-CANVAS.md` (`:101-107`)
- Modify: `TEST-PLAN.md` (AA32 and F19 Pin clauses)

**Interfaces:**
- Consumes: `isGestureActive(state: FsmState):
  boolean` (already imported in `detail.ts:63`),
  `FlowDesignerPresenter#selectedNodeId(): string |
  null`, and `#interactionState()`.
- Produces, on `PageState` in `web-app/flows/detail.ts`:
  `gestureStartSelected(): string | null` and
  `setGestureStartSelected(id: string | null): void`.

- [ ] **Step 1: Add the F13 guard test (green before
  and after)**

In `tests/browser/canvas-gestures.test.ts`, change the
`./fixtures.ts` import to:

```ts
import {
    SHIFT, useBrowser, withAdminPage, type Page,
    type Point,
} from './fixtures.ts';
```

Add these below `const browser = useBrowser();`:

```ts
const PANEL = '.flow-props-panel';
const VIEWBOX =
    `document.querySelector('${CANVAS}')`
    + `.getAttribute('viewBox')`;

// The properties panel covers the canvas's left edge;
// a point under it lands on the panel, not the node.
async function assertClearOfPanel(
    page: Page, pt: Point,
): Promise<void> {
    const panel = await page.rect(PANEL);
    assert(
        pt.x > panel.x + panel.width,
        `x ${pt.x} sits under the properties panel`,
    );
}
```

Append:

```ts
Deno.test('a node click under an open panel centers it'
+ ' on release (F13)', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        const review = await nodeIdNamed(page, 'Review');
        const capture = await nodeIdNamed(
            page, 'Data Capture',
        );
        await doubleClick(page, nodeSelector(review));
        await page.waitFor(PANEL);
        const before = await page.evaluate<string>(VIEWBOX);
        const body = await page.center(
            nodeSelector(capture),
        );
        await assertClearOfPanel(page, body);
        await page.press(body);
        await page.release(body);
        await page.until(
            `${VIEWBOX} !== ${JSON.stringify(before)}`,
            'camera centred on Data Capture',
        );
    });
});
```

Run: `export DENO_DIR="$TMPDIR/deno-dir"; ./test browser`
Expected: exit 0. This test passes today, because the
centering runs at press. It guards the retarget
through the fix. If `assertClearOfPanel` fails, stop
and report the layout.

```bash
git add tests/browser/canvas-gestures.test.ts
git commit -m "Pin F13's centering on a click's release" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Write the two failing tests**

Append to `tests/browser/canvas-gestures.test.ts`:

```ts
Deno.test('a port press under an open panel holds the'
+ ' camera (AA32)', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        const nodes = await nodeCount(page);
        const edges = await edgeCount(page);
        const review = await nodeIdNamed(page, 'Review');
        const capture = await nodeIdNamed(
            page, 'Data Capture',
        );
        const archive = await nodeIdNamed(page, 'Archive');
        // The panel opens on Review; the press then moves
        // the selection to Data Capture, as AA31 → AA32.
        await doubleClick(page, nodeSelector(review));
        await page.waitFor(PANEL);
        const before = await page.evaluate<string>(VIEWBOX);
        // Aimed before the press, as a person aims.
        const port = await page.center(
            portSelector(capture),
        );
        const target = await page.center(
            nodeSelector(archive),
        );
        await assertClearOfPanel(page, port);
        await assertClearOfPanel(page, target);
        await page.keyDown('Shift');
        await page.press(port, SHIFT);
        assertStrictEquals(
            await page.evaluate<string>(VIEWBOX), before,
        );
        await page.move({
            x: (port.x + target.x) / 2,
            y: (port.y + target.y) / 2,
        }, SHIFT);
        await page.move(target, SHIFT);
        await page.release(target, SHIFT);
        await page.keyUp('Shift');
        await page.until(
            `document.querySelectorAll('${EDGE}').length`
            + ` === ${edges + 1}`,
            'one more edge',
        );
        assertStrictEquals(await nodeCount(page), nodes);
    });
});

Deno.test('a port press after Auto Layout toggles holds'
+ ' the camera (F19)', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, LAYOUT_TEST);
        // F18: off, then on — the second leaves the
        // provisional node-bounds fit.
        await page.click('#flow-auto-layout-switch');
        await page.click('#flow-auto-layout-switch');
        const nodes = await nodeCount(page);
        const edges = await edgeCount(page);
        const draft = await nodeIdNamed(page, 'Draft');
        const triage = await nodeIdNamed(page, 'Triage');
        const before = await page.evaluate<string>(VIEWBOX);
        const port = await page.center(portSelector(draft));
        const target = await page.center(
            nodeSelector(triage),
        );
        await page.keyDown('Shift');
        await page.press(port, SHIFT);
        assertStrictEquals(
            await page.evaluate<string>(VIEWBOX), before,
        );
        await page.move({
            x: (port.x + target.x) / 2,
            y: (port.y + target.y) / 2,
        }, SHIFT);
        await page.move(target, SHIFT);
        await page.release(target, SHIFT);
        await page.keyUp('Shift');
        await page.until(
            `document.querySelectorAll('${EDGE}').length`
            + ` === ${edges + 1}`,
            'one more edge',
        );
        assertStrictEquals(await nodeCount(page), nodes);
    });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `./test browser`

Expected:
- 'a port press under an open panel holds the camera
  (AA32)' FAILs at the first `assertStrictEquals`
  after the press. The viewBox differs because
  `withSelectionCentered` panned at press.
- 'a port press after Auto Layout toggles holds the
  camera (F19)' FAILs at the same assertion, because
  `reconcileFitFromDom` re-fitted at press.
- Everything else passes, the F13 guard included.

If the F19 test passes here, its trigger is not the
provisional fit. In that case stop, do not commit that
test, and report the before and after viewBox strings
to the owner. If the AA32 test fails anywhere other
than that assertion, stop and report.

- [ ] **Step 4: Write the fix**

In `web-app/flows/detail.ts`, add this to `PageState`
directly after `setPresenter` (`:164-168`):

```ts
    // The selection a gesture started from. The
    // camera holds still until pointer-up, so the
    // gesture end centres against this, not against
    // the start commit's own selection.
    #gestureStartSelected: string | null = null;

    gestureStartSelected(): string | null {
        return this.#gestureStartSelected;
    }

    setGestureStartSelected(id: string | null): void {
        this.#gestureStartSelected = id;
    }
```

Replace the first callback passed to
`bindInteractions` (`:1044-1081`) with:

```ts
        (next) => {
            // Mid-gesture updates paint narrowly under
            // rAF; gesture boundaries (and everything
            // else) take the full commit path.
            const wasActive = isGestureActive(
                pageState.presenter()
                    .interactionState(),
            );
            if (wasActive && isGestureActive(next)) {
                scheduleGestureFrame(next);
                return;
            }
            cancelGestureFrame();
            if (isGestureActive(next)) {
                // Gesture start: no camera move until
                // pointer-up — a release hit-tests the
                // node the user aimed at through this
                // camera.
                pageState.setGestureStartSelected(
                    pageState.presenter()
                        .selectedNodeId(),
                );
                commit(
                    pageState.presenter()
                        .withInteractionState(next),
                );
                return;
            }
            const prevSelected = wasActive
                ? pageState.gestureStartSelected()
                : pageState.presenter().selectedNodeId();
            commit(
                pageState.presenter()
                    .withInteractionState(next),
            );
            reconcileFitFromDom();
            const nowSelected = pageState
                .presenter().selectedNodeId();
            const isPanelOpen = pageState
                .presenter().snapshot()
                .isPanelOpen;
            if (
                prevSelected !== nowSelected
                && nowSelected !== null
                && isPanelOpen
            ) {
                commit(
                    pageState.presenter()
                        .withSelectionCentered(),
                );
            }
        },
```

In `FLOW-CANVAS.md`, replace the paragraph:

```
The detail-page `request-update` callback runs
`reconcileFitFromDom` after `withInteractionState` so
the auto-fit viewBox is the final state, not stomped by
the FSM's frozen viewBox; on selection change while the
panel is open, it then runs `withSelectionCentered` to
pan the newly selected node to the visible canvas center
(zoom unchanged).
```

with:

```
The detail-page `request-update` callback MUST NOT move
the camera from pointer-down to pointer-up: a release
hit-tests the node under the pointer, so a camera moved
under an in-flight gesture misses the node the user
aimed at. At gesture start it commits
`withInteractionState` and nothing else, and keeps the
selection the gesture started from. Every other update,
gesture end included, runs `reconcileFitFromDom` after
`withInteractionState` so the auto-fit viewBox is the
final state, not stomped by the FSM's frozen viewBox;
when the selection differs from the one before the
update (at gesture end, the one the gesture started
from) while the panel is open, it then runs
`withSelectionCentered` to pan the newly selected node
to the visible canvas center (zoom unchanged).
```

- [ ] **Step 5: Run Layer 1 and Layer 2 and watch them
  pass**

Run: `./test validate`
Expected: exit 0.

Run: `./test browser`
Expected: exit 0, `0 failed`. That includes the AA32,
F19, and F13 tests, and every existing
`canvas-gestures`, `canvas-pan`, and `canvas-keyboard`
test.

- [ ] **Step 6: Commit**

```bash
git add tests/browser/canvas-gestures.test.ts \
web-app/flows/detail.ts FLOW-CANVAS.md
git commit -m "Hold the camera still under a gesture in flight" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Pin AA32 and F19 in TEST-PLAN.md**

In the AA32 item, replace:

```
       two attribute refs (AA32/AA33/AA34)';
       exploratory — the live
       dashed-orange vs. solid-blue preview rendering
```

with:

```
       two attribute refs (AA32/AA33/AA34)';
       tests/browser/canvas-gestures.test.ts 'a port
       press under an open panel holds the camera
       (AA32)' (decides the camera holds from
       pointer-down to pointer-up with the panel open
       on another selection, so the release lands on
       the node aimed at); exploratory — the live
       dashed-orange vs. solid-blue preview rendering
```

In the F19 item, replace:

```
       edge' (decides the same through a real compositor
       drag: one more edge, no new node); exploratory — the
       grey-line-to-bezier preview transition
```

with:

```
       edge' (decides the same through a real compositor
       drag: one more edge, no new node);
       tests/browser/canvas-gestures.test.ts 'a port
       press after Auto Layout toggles holds the camera
       (F19)' (decides the press after F18's toggles
       moves no camera and the release lands on
       Triage); exploratory — the
       grey-line-to-bezier preview transition
```

```bash
git add TEST-PLAN.md
git commit -m "Pin AA32 and F19 on the camera-hold tests" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Correct the document drift and the walk order

Each sub-step is one commit to `TEST-PLAN.md` only.
Commandments: Clarity, Uniformity. Abominations:
Obscurity. No product file changes. Run `./test
validate` before each commit (expected exit 0; it
does not lint `.md`).

**Files:** `TEST-PLAN.md` only.

**Interfaces:** none.

- [ ] **6a: WB22's parameter names**

Replace the line:

```
  `(workOrders, transitions, claims, memberMap, mode)`
```

with:

```
  `(workOrders, transitionsByWo, activeClaimsByWo,
  memberMap, mode)`
```

```bash
git add TEST-PLAN.md
git commit -m "Name buildInboxItems' real parameters in WB22" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **6b: SV3's token JSON**

In the SV3 item, replace:

```
  key and no `refresh_token`; the sign-in token
  response JSON has `access_token` and no
  `refresh_token`. Access is memory-only; refresh
  is the cookie.
  Pin: tests/api-authentication-token.test.ts 'token
       JSON has no refresh_token; Set-Cookie is
       HttpOnly'; exploratory — the `Secure`
```

with:

```
  key and no `refresh_token`; the sign-in token
  response JSON carries `token_type` and
  `expires_in` and neither `access_token` nor
  `refresh_token`; the access token rides the
  `Authentication-Info` response header as
  `access_token="…"`. Access is memory-only;
  refresh is the cookie.
  Pin: tests/api-authentication-token.test.ts 'token
       JSON has no refresh_token; Set-Cookie is
       HttpOnly' (also decides the JSON carries no
       `access_token` and `Authentication-Info`
       does); exploratory — the `Secure`
```

```bash
git add TEST-PLAN.md
git commit -m "Correct SV3's token JSON to the pinned shape" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **6c: WB18 with two members**

Replace the WB18 item, from its line
`- [ ] **WB18** Open the same unclaimed work order in two`
through the line
`       read-only/already-claimed view specifically`,
with:

```
- [ ] **WB18** Open the same unclaimed work order as
  two members in two cookie jars: Tony Stark in the
  walk's tab, and Sarah Chen in a second jar minted
  as SV6 does (Driving notes, SV6/SV7/SV10). In
  Tony's tab, click the row to claim it. In Sarah's,
  open the same row. PASS: Sarah's claim is rejected
  — `PUT work-orders/:id/claim` answers 409 `work
  order is already claimed`, and her action screen
  shows the error state carrying that message with
  Try Again — and the message plane carries one live
  `'claimed'` event for this work order's
  `entity_id`, Tony's, under the `(at, id)` reduction
  (a stale prior claim is superseded by a
  `'claim_expired'` event, never overwritten in
  place). Inspect via derived `GET
  work-orders/:id/history` (DESC; claim rows carry
  `field_values: []`). Two tabs of one jar are one
  member: the second opens the holder's editable
  screen and appends no claim (WB23's claim half).
  Pin: tests/api-work-order-claim.test.ts 'a live claim by
       another member is a 409';
       tests/api-work-order-claim.test.ts 'a foreign
       live claim is 409 from the head' (decides the
       409 body and that nothing is stored);
       tests/api-work-order-claim.test.ts 'two-actor
       contention: the second claim on a stale tag is
       412 and exactly one claimed event lands';
       tests/api-work-order-claim.test.ts 'an expired claim
       is superseded atomically' (the general
       never-overwritten-in-place invariant, though this
       specific live drive is unlikely to trigger an
       actual expiry); exploratory — Sarah's rendered
       refusal
```

```bash
git add TEST-PLAN.md
git commit -m "Drive WB18 with two members in two jars" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **6d: WB14 waits for WB19a and WB19b**

Replace the line:

```
- [ ] **WB14** Transition a work order to the completion
```

with:

```
- [ ] **WB14** Drive WB14 only after WB19a and WB19b
  have scored lines in the checkpoint: this case
  archives their subject. If either has no line yet,
  drive it now, then come back. Transition a work
  order to the completion
```

```bash
git add TEST-PLAN.md
git commit -m "Drive WB19a and WB19b before WB14 archives them" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **6e: Drive the native model select**

Replace:

```
  not SV7. SV10's stale-until-navigation residual
  is PASS, not FAIL.

### Scoring
```

with:

```
  not SV7. SV10's stale-until-navigation residual
  is PASS, not FAIL.
- Native `<select>` (AA7a, G14a, G24b — the AI Model
  pulldown, `#ai-model`): on macOS its open menu is
  an OS menu the compositor neither paints nor
  drives, so arrow keys sent to it move nothing.
  Never click the select and never send ArrowUp or
  ArrowDown to it. Focus it by selector
  (`.focus()`), then send one printable key as CDP
  `Input.dispatchKeyEvent` `keyDown` with `key` and
  `text` set, then `keyUp`: typeahead on a closed
  select commits the first option whose label starts
  with that letter and fires `input` and `change`.
  `g` selects GPT-5.5 (`EurcZoFcUOmQiKURwJQvJQ`) from
  the placeholder and from Claude Sonnet 4.6. Read
  `#ai-model`'s `value` to confirm. If it did not
  change, set it with `js()` — `value` to the id,
  then dispatch a bubbling `change` — which is not
  an API fetch. If a menu is already open, click
  outside it; never send Escape, which cancels the
  edit on member detail and closes the Add Member
  dialog.

### Scoring
```

In the G14a item, replace:

```
  Pick a Model, fill the other AI fields, click Create.
```

with:

```
  Pick a Model (Driving notes: native `<select>`),
  fill the other AI fields, click Create.
```

In the G24b item, replace:

```
  from the pulldown, click Save. PASS: toast "AI member
```

with:

```
  from the pulldown (Driving notes: native `<select>`;
  `g` picks GPT-5.5), click Save. PASS: toast "AI member
```

```bash
git add TEST-PLAN.md
git commit -m "Drive the native model select by typeahead" \
-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Layer 2 gate on the finished branch

**Files:** none.

**Interfaces:** none.

- [ ] **Step 1: Confirm a clean tree**

Run: `git status --short`
Expected: no output.

- [ ] **Step 2: Run Layer 1 then Layer 2**

Run: `export DENO_DIR="$TMPDIR/deno-dir"; ./test validate browser`
Expected: exit 0. The browser pass reports `0 failed`
and includes the four new Layer 2 tests from Tasks 2,
4, and 5. If anything is red, stop. Do not start Task
8.

- [ ] **Step 3: Confirm each new pin exists by name**

```bash
grep -n "a second tab releases after the first released" \
tests/browser/workbox-transition.test.ts
grep -n "a stale accept refuses with the invitation" \
tests/adapters-invitations.test.ts
grep -n "an accept over a revoke paints the row" \
tests/browser/invitations.test.ts
grep -n "a node click under an open panel centers it" \
tests/browser/canvas-gestures.test.ts
grep -n "a port press under an open panel holds the" \
tests/browser/canvas-gestures.test.ts
grep -n "a port press after Auto Layout toggles holds" \
tests/browser/canvas-gestures.test.ts
```

Expected: one hit each.

---

## Task 8: Acceptance walk (orchestrator only)

The orchestrator runs this as the TEST-PLAN master
after Tasks 1–7 are committed and the tree is clean.
No implementer edits code during it. The master does
not drive the product and does not patch. Any finding
becomes a stub, never a fix inside this task.

**Files:** none in the repository. The checkpoint
lives at `/tmp/fusion-angle-walk-<sha>.txt`.

**Interfaces:** the explorer prompt in TEST-PLAN.md
`### The explorer prompt`, copied verbatim with the
seed reveal's sign-ins. Because the walk runs in this
worktree, substitute this worktree's `AGENTS.md` path
for the main checkout's.

- [ ] **Step 1: Preconditions**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
git status --short
git rev-parse --short HEAD
```

Expected: no status output. Note the SHA. The
browser-use plugin (MCP `browser-use`, or the
`browser-use` CLI) must be available. Otherwise refuse
the walk, as TEST-PLAN `### Invocation` says. Do not
fall back to Claude-in-Chrome.

- [ ] **Step 2: A1 and A2**

Run: `./bin/build`
Expected: the executable ZIP lands on `~/Desktop/`.
Inventory it per A2.

- [ ] **Step 3: A3 (SV1)**

Run: `./deploy --local 8080 --postgres mock-data`
from this worktree. If another checkout holds 8080,
use a free port, and read every `localhost:8080` in
TEST-PLAN as that port. Deploy runs Layer 1, `./test
postgres`, and `./test browser` before it serves. Red
anywhere aborts the walk. Read the seed reveal from
stdout once.

- [ ] **Step 4: Dispatch explorers**

Create `/tmp/fusion-angle-walk-<sha>.txt` empty, with
the SHA from Step 1. Dispatch explorers, one at a
time, until every case from A4 through the end of
`## SV`, except K8, has a scored line. A return with
missing IDs gets the next explorer at once, with the
remaining IDs. Do not re-seed. Do not repeat Setup.

- [ ] **Step 5: Check acceptance**

```bash
SHA=$(git rev-parse --short HEAD)
CP=/tmp/fusion-angle-walk-$SHA.txt
grep -vE '^[A-Za-z][A-Za-z0-9-]* PASS ' "$CP"
for id in WB23 V10 WB18 WB22 SV3 WB19a WB19b \
AA32 F19 G14a G24b; do
grep -qE "^$id PASS " "$CP" || echo "NOT PASS: $id"
done
```

Expected: the first command prints exactly one line,
beginning `I22 BLOCKED`. The loop prints nothing.
Any other output means the plan's goal is not met.
Write the summary (`## Summary Format`) and one stub
per FAIL cluster, as TEST-PLAN directs. Report each
non-PASS line to the owner. Do not patch inside this
task.

- [ ] **Step 6: Close out**

Write the summary per `## Summary Format`. Then run
K8, then J1–J3, as `### The master's steps` 4–5
direct.

---

## Self-check against the twelve

| # | Case | Covered by | Proof that it turns PASS |
|---|---|---|---|
| 1 | WB23 | Task 2 | Layer 2 red→green; WB23 rewritten |
| 2 | V10 | Tasks 3, 4 | Layer 1 and Layer 2 red→green; V10 pin corrected |
| 3 | WB18 | Task 6c | drive names two members; the 409 is pinned |
| 4 | WB22 | Task 6a | names match `workbox-inbox.ts:188-197` |
| 5 | SV3 | Task 6b | PASS line matches the pin's `:406-411` |
| 6 | WB19a | Task 6d | WB14 gated; recovery matches `detail.ts:226-253` |
| 7 | WB19b | Task 6d | same gate; same recovery |
| 8 | AA32 | Task 5 | Layer 2 red→green: camera holds at press |
| 9 | F19 | Task 5 | Layer 2 red→green; stop rule if not red |
| 10 | G14a | Task 6e | driving note; native select proven above |
| 11 | G24b | Task 6e | driving note; `g` → GPT-5.5 |
| 12 | I22 | excluded | `loading-states.ts:210-244` plus pin; BLOCKED by its own note |

The pins this plan keeps green, and does not edit:
- 'racing value-bearing transitions land once'
- 'a stale invitation tag is 412'
- 'shift-drag from port onto different node emits
  add-edge (AA32/F19)'
- 'Shift-drag adds an edge and Review accepts two
  attribute refs (AA32/AA33/AA34)'
- 'a shift drag from a port onto a node commits an
  edge'
- 'token JSON has no refresh_token; Set-Cookie is
  HttpOnly'
- 'a rejecting fetch renders the error state and
  calls neither hook'
- 'accept after revoke is rejected, no membership'
- 'a release with no live claim answers the head'
- 'a live claim by another member is a 409'

# F29 zoomed viewBox — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this plan's worktree (AGENTS.md §
> Worktrees).

**Goal:** Turn the 29 Sep walk's F29 FAIL into a red
Layer 2 test. Then land the one product change it
demands: deleting the open panel's selection closes the
panel through its transition, so a later empty-canvas
click restores no stale camera.

**Architecture:** The reducer pin stays green because the
reducer is right. The defect is in the page. Deleting the
selected edge or node leaves `isPanelOpen: true` behind
an empty selection. The panel then paints nothing, but
its `savedViewBox` survives. The next empty-canvas
pointer-down emits `open-panel false`, and
`withPanelOpen(false)` restores that saved camera. The
fix routes both delete handlers through the sanctioned
panel transition. Two Layer 2 tests read
`svg.getAttribute('viewBox')`, the only layer that can
express this. The presenter paints whatever snapshot the
page hands it, and the ghost-open snapshot exists only
in `web-app/flows/detail.ts`.

**Tech Stack:** Deno 2.9.6, TypeScript strict,
`Deno.test` + `@std/assert`, Chrome CDP through
`tests/browser/fixtures.ts` under `./test browser`.

**Spec:** no design doc. The spec is the frozen stub
`docs/superpowers/test-plan-mitigations/2026-09-29-F-F29.md`
(committed to master by Task 0), plus TEST-PLAN F29.
FLOW-CANVAS.md `## Camera rules` and `## The FSM seam`
are the contract.

**Worktree:** `.worktrees/2026-09-29-f29-zoomed-viewbox`
on branch `2026-09-29-f29-zoomed-viewbox`, base
`a6af68a6`. Task 0 rebases it onto master.

---

## How the walk got its number

This was traced in planning and never driven, since the
sandbox blocks Chrome launch. Every step is read from
source at `a6af68a6`:

1. F26 "Back on Layout Test" reloads the flow with Auto
   Fit OFF, which F14 persisted. Load builds
   `buildInteractionState(800, 600)`. Then
   `withCanvasSize(910, 549)` rescales it in place at
   zoom 1.0 about the origin, giving
   `-455 -274.5 910 549`.
2. F26 double-clicks an edge. With Auto Fit off,
   `applyPanelTransition` → `panelJustOpened` saves that
   load camera into `savedViewBox`.
3. F27 and F28 delete the selection from the toolbar.
   `handleDeleteSelectedNodes` / `…Edge`
   (`web-app/flows/detail.ts:351-416`) commit
   `selection: none` but never touch `isPanelOpen`.
   `#buildPropsPanel` paints nothing for an empty
   selection, so the panel vanishes while the snapshot
   still says open and still holds the save.
4. F29 toggles Auto Fit, zooms in (×0.717), zooms out,
   and clicks empty canvas. `onCanvasPointerDown` emits
   `open-panel false` first. `withPanelOpen(false)` →
   `panelJustClosed` restores the saved load camera:
   `-455 -274.5 910 549`, the "wrap pixel box" in the
   stub.

The reducer pin `'empty canvas click keeps a zoomed
viewBox'` stays green, and must: the reducer never runs
the panel transition.

## Global Constraints

- Work only in this worktree. Task 0 is the one master
  commit pair, shared by all four 29 Sep plans. Never
  `-D`. Never force-push. Never merge; rebase onto
  master, then `git merge --ff-only`.
- One concern per commit. Subject ≈50 chars,
  present-tense imperative, no body. Trailer: the
  mandated `Co-Authored-By: Claude Opus 5.5
  <noreply@anthropic.com>`, plus any `Claude-Session:`
  line the executing harness mandates.
- A product change lands ONLY in the commit that turns
  a test watched red at Layer 1 or Layer 2 green. Every
  commit is green at Layer 1: `--ff-only` lands the
  whole history. A red Layer 2 test stays uncommitted
  until its fix goes in with it.
- Dated stubs stay frozen. The only edit this plan
  makes to `2026-09-29-F-F29.md` is replacing its
  `Reproduced by` line, in its own commit, after the
  test is seen red and before the product commit. Never
  edit any older stub.
- Do not weaken a green test. The reducer pin, the F14
  pin, and the F26/F28 pins stay as they are.
- Under the Claude Code sandbox, before any `deno`,
  `./test`, or `./bin/*`:
  `export DENO_DIR="$TMPDIR/deno-dir"`.
- Layer 2 needs Chrome (`CHROME` or `CHROME_DEBUG_URL`).
  Under the Claude Code sandbox, `Browser.launch` times
  out ("Chrome DevToolsActivePort timed out after
  15000ms"). Run `./test browser` where Chrome can
  launch, or point `CHROME_DEBUG_URL` at a running
  Chrome. `./test browser` has no single-file form: it
  runs every `tests/browser/*.test.ts` serially (~60 s).
- Voice: 78-char max in `.ts` under `api/ web-app/
  tests/ shared/ server/`; 4-space indent; no inline
  styles; no `org` identifier abbreviation.
- Patterns: the page commits through `commit()`, and the
  presenter owns camera transitions
  (`withPanelOpen`). Never set `isPanelOpen` by hand in
  a snapshot literal: that is the defect.
- Commandments in play: Reliability, since the camera
  must not jump to a stale save. Immutability: "Why did
  THAT happen?" is exactly the walk's question.
  Simplicity: one helper, two call sites.
- Abominations to refuse: Test Weakening, Internal
  Defense (no "if the panel is really open" guard around
  the transition), Unbidden Helper Code (do not reroute
  the three existing inline close sites), and Premature
  Generalization.
- Layer 1, one file:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write --allow-net \
    --allow-run=deno,./bin/serve,./deploy,sh,./test,./bin/postgres-wipe,./bin/postgres-seed \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    --filter 'SUBSTRING' tests/FILE.test.ts
```

- Layer 1, the gate: `./test validate`. Baseline at
  `a6af68a6`: `./test` prints
  `ok | 3622 passed | 0 failed | 8 ignored`, then
  `ok | 8 passed | 0 failed`.
- Layer 2: `./test browser`. Baseline at `a6af68a6`: 43
  tests, `fail 0` (the walk's `./deploy --local` ran it
  green).

## Review Focus

These are the inputs most likely to bite that no new
test drives. Each names what already covers it.

1. **Deleting with the panel closed**, as in F28's own
   single-click flow. `closePanel()` runs a transition
   that returns null, and the snapshot is unchanged
   apart from `isPanelOpen: false`. Pinned by
   `tests/browser/canvas-gestures.test.ts` 'an edge
   selection enables Delete and removes the edge (F28)',
   which the full `./test browser` run in Tasks 2 and 3
   keeps green.
2. **Deleting under Auto Fit ON with the panel open.**
   `applyPanelTransition` returns null under Auto Fit.
   The panel closes and the handler's existing
   `commitAndFit` re-fits without `PANEL_WIDTH_PX`. The
   null branch is pinned by
   `tests/flow-designer-actions.test.ts`
   'applyPanelTransition saves the viewBox on open'. The
   re-fit is the unchanged `commitAndFit`.
3. **The Delete key instead of the toolbar button.**
   `bindKeyboardShortcuts` calls the same
   `handleDeleteSelected`, so both new tests exercise it
   through the shared handlers.
4. **A single click on another node right after the
   delete.** Before the fix the ghost-open panel
   re-appeared for it; the walk saw the edge panel come
   back in F28. After the fix `isPanelOpen` is false, so
   a single click selects without opening. Reviewer
   check: read `#buildPropsPanel`'s gate.
5. **Two other doors to the same stale save**, out of
   scope and filed in TODO by Task 5.
   `handleAddNodeAtPosition` writes
   `isPanelOpen: false` by hand, and
   `refreshFlowFromServer` drops the panel when a
   cross-tab edit removes its selection. Neither routes
   through `withPanelOpen`.

---

## File structure

| File | Role |
|---|---|
| `tests/browser/canvas-pan.test.ts` | two F29 tests + their helpers |
| `docs/superpowers/test-plan-mitigations/2026-09-29-F-F29.md` | `Reproduced by` line only |
| `web-app/flows/detail.ts` | `closePanel()`; both delete handlers call it |
| `TEST-PLAN.md` | F29 Pin clause names the two tests |
| `TODO.md` | drop the F29 sub-bullet; file the two sibling doors |

---

### Task 0: Record the stubs and the tracking on master (shared)

All four 29 Sep plans carry this task verbatim. Whichever
plan executes first does Steps 2 and 3. The others find
both commits on master and only do Step 4.

- [ ] **Step 1: Check what master already has**

```bash
cd /Users/tmornini/code/fusion-angle
git status --short docs/superpowers/test-plan-mitigations/
grep -n "The 29 Sep walk's mitigations" TODO.md
```

If the three `2026-09-29-*.md` stubs print as `??`, do
Step 2. If `grep` prints nothing, do Step 3. Otherwise
go to Step 4.

- [ ] **Step 2: Commit the three stubs, docs-only, on
  master**

Read each stub first and commit it byte-for-byte as the
walk left it. Its Observed, Expected, and Pin lines
never change.

```bash
cd /Users/tmornini/code/fusion-angle
git add \
    docs/superpowers/test-plan-mitigations/2026-09-29-F-F29.md \
    docs/superpowers/test-plan-mitigations/2026-09-29-I-I21.md \
    docs/superpowers/test-plan-mitigations/2026-09-29-K-K17.md
git commit -F - <<'EOF'
Record 29 Sep TEST-PLAN FAIL stubs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 3: Track the four plans in TODO.md, on
  master**

In `TODO.md`, `## Critical functionality path`, replace:

```
  rewrite honest. G9's staleness was the corrupted test
  name, restored by the small-items sweep

## Later work
```

with:

```
  rewrite honest. G9's staleness was the corrupted test
  name, restored by the small-items sweep
- The 29 Sep walk's mitigations — one plan and
  worktree each, the plan on its branch as
  `docs/superpowers/plans/<slug>.md`; a sub-bullet
  leaves when its branch lands, and the last one out
  takes this line with it
  - F29, `2026-09-29-f29-zoomed-viewbox` — deleting
    the open panel's node or edge leaves the panel open
    behind an empty selection, so the next empty-canvas
    click restores the viewBox the panel saved on open
    (`docs/superpowers/test-plan-mitigations/2026-09-29-F-F29.md`).
    Oracle: `tests/browser/canvas-pan.test.ts` 'An
    empty-canvas click after deleting the open edge
    keeps the zoomed viewBox (F29)' green
  - I21, `2026-09-29-i21-members-skeleton` — the
    members skeleton the walk did not see while its
    organization GETs were paused
    (`docs/superpowers/test-plan-mitigations/2026-09-29-I-I21.md`).
    Oracle: `tests/members-pending-skeleton.test.ts`
    'members paints the table skeleton while its GETs
    are held (I21)' lands, red or green
  - K17, `2026-09-29-k17-signed-objective-score` — an
    approved objectives row reads "—" where its saved
    −100 baseline belongs
    (`docs/superpowers/test-plan-mitigations/2026-09-29-K-K17.md`).
    Oracle: `tests/presenter-project-objectives.test.ts`
    'approved row with no actual reads its signed
    baseline (K17)' green
  - TEST-PLAN drift, `2026-09-29-walk-drift` — AT2,
    AT4, A2, F9, F21, G36, and K26 still describe
    behavior the walk did not see. Oracle: each case
    reads as the 29 Sep walk and the re-count saw

## Later work
```

```bash
cd /Users/tmornini/code/fusion-angle
git add TODO.md
git commit -F - <<'EOF'
Track the 29 Sep walk mitigations in TODO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Markdown only: no `./test validate`.

- [ ] **Step 4: Rebase this worktree onto master**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-09-29-f29-zoomed-viewbox
git rebase master
ls docs/superpowers/test-plan-mitigations/2026-09-29-F-F29.md
```

Expected: the rebase succeeds and `ls` prints the path.

---

### Task 1: Commit this plan

**Files:**
- Create: `docs/superpowers/plans/2026-09-29-f29-zoomed-viewbox.md`

- [x] **Step 1: Commit the plan as written**, subject
  `Plan the F29 zoomed-viewBox mitigation`. Done in the
  planning session. Markdown only.

---

### Task 2: Close the panel when its edge is deleted

**Files:**
- Test: `tests/browser/canvas-pan.test.ts`: imports
  (lines 1-8), new helpers after the `PANEL_ABSENT`
  constant (lines 17-19), new test appended at the end
- Modify: `docs/superpowers/test-plan-mitigations/2026-09-29-F-F29.md`,
  the `Reproduced by` line only
- Modify: `web-app/flows/detail.ts`: `closePanel()`
  after `commitAndFit` (line 766), and the edge handler
  (lines 384-416)

**Interfaces:**
- Consumes: `pageState.panelStateRef()`,
  `pageState.presenter().withPanelOpen(false)`, and
  `commit()`, all existing in `web-app/flows/detail.ts`
- Produces: `function closePanel(): void` in
  `web-app/flows/detail.ts`, which Task 3 calls. Also, in
  `tests/browser/canvas-pan.test.ts`: `VIEWBOX_OF`,
  `DELETE_SELECTED`, and
  `assertEmptyClickKeepsZoom(page: Page): Promise<void>`,
  which Task 3 reuses

- [ ] **Step 1: Write the failing test**

In `tests/browser/canvas-pan.test.ts`, replace the
import block:

```ts
import { assertStrictEquals } from '@std/assert';
import {
    stays, useBrowser, withAdminPage, type Page,
} from './fixtures.ts';
import {
    CANVAS, ONBOARDING, WRAP, openFlow,
    doubleClick, nodeIdNamed, nodeSelector,
} from './canvas.ts';
```

with:

```ts
import { assertStrictEquals } from '@std/assert';
import {
    stays, useBrowser, withAdminPage,
    type Page, type Point,
} from './fixtures.ts';
import {
    CANVAS, EDGE, LAYOUT_TEST, ONBOARDING, WRAP,
    openFlow, doubleClick, edgeCount, edgeLabelSelector,
    nodeIdNamed, nodeSelector,
} from './canvas.ts';
```

After the existing constant

```ts
const PANEL_ABSENT =
    `document.querySelector('.flow-props-panel')`
    + ` === null`;
```

insert:

```ts
const VIEWBOX_OF =
    `document.querySelector('${CANVAS}')`
    + `.getAttribute('viewBox')`;
const ZOOM_IN = '[data-action="zoom-in"]';
const DELETE_SELECTED = '[data-action="delete-selected"]';
const EMPTY_INSET_PX = 20;

// A canvas point with nothing under it: the four inset
// corners, first empty one wins. A node or edge under
// the point would make the click a selection, not the
// empty-canvas case.
async function emptyCanvasPoint(
    page: Page,
): Promise<Point> {
    const svg = await page.rect(CANVAS);
    const left = svg.x + EMPTY_INSET_PX;
    const right = svg.x + svg.width - EMPTY_INSET_PX;
    const top = svg.y + EMPTY_INSET_PX;
    const bottom = svg.y + svg.height - EMPTY_INSET_PX;
    const corners: Point[] = [
        { x: right, y: top },
        { x: left, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
    ];
    for (const pt of corners) {
        const isEmpty = await page.evaluate<boolean>(
            `(() => {
                const el = document.elementFromPoint(
                    ${pt.x}, ${pt.y});
                return el !== null
                    && el.closest('${CANVAS}') !== null
                    && el.closest(
                        '[data-node-id], [data-edge-id]',
                    ) === null;
            })()`,
        );
        if (isEmpty) return pt;
    }
    throw new Error('no empty canvas corner');
}

// Zoom in once, then click empty canvas: the click
// must leave the zoomed camera exactly where it was.
async function assertEmptyClickKeepsZoom(
    page: Page,
): Promise<void> {
    const before = await page.evaluate<string | null>(
        VIEWBOX_OF,
    );
    await page.click(ZOOM_IN);
    await page.until(
        `${VIEWBOX_OF} !== ${JSON.stringify(before)}`,
        'viewBox zoomed',
    );
    const zoomed = await page.evaluate<string | null>(
        VIEWBOX_OF,
    );
    const pt = await emptyCanvasPoint(page);
    await page.press(pt);
    await page.release(pt);
    assertStrictEquals(
        await page.evaluate<string | null>(VIEWBOX_OF),
        zoomed,
    );
}
```

Append at the end of the file:

```ts

Deno.test(
    'An empty-canvas click after deleting the open'
    + ' edge keeps the zoomed viewBox (F29)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, LAYOUT_TEST,
                );
                await page.click(AUTO_FIT);
                const label = edgeLabelSelector();
                await page.waitFor(label);
                const edges = await edgeCount(page);
                await doubleClick(page, label);
                await page.waitFor('.flow-props-panel');
                await page.click(DELETE_SELECTED);
                await page.until(
                    `document.querySelectorAll('${EDGE}')`
                    + `.length === ${edges - 1}`,
                    'one fewer edge',
                );
                await page.until(
                    PANEL_ABSENT, 'panel gone',
                );
                await assertEmptyClickKeepsZoom(page);
            },
        );
    },
);
```

Why one zoom-in rather than F29's in-then-out: a single
step guarantees the zoomed camera's width differs from
any camera saved before it. An in-then-out pair can land
back on the saved camera and pass by coincidence.

- [ ] **Step 2: Run it and record the red**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-09-29-f29-zoomed-viewbox
export DENO_DIR="$TMPDIR/deno-dir"
git rev-parse --short HEAD
deno check --frozen tests/browser/canvas-pan.test.ts
./test browser 2>&1 | tee "$TMPDIR/f29-red.log" | tail -30
```

Expected:
- `deno check` prints nothing after `Check …`.
- Exactly one failure, the new test, with:

```
An empty-canvas click after deleting the open edge keeps the zoomed viewBox (F29) ... FAILED
error: AssertionError: Values are not strictly equal.
    [Diff] Actual / Expected
-   "<the pre-open camera>"
+   "<the zoomed camera>"
```

The Actual string is the camera saved when the edge
panel opened, the seed fit after Auto Fit was switched
off. Its width is 1.1× the Expected width's.
- The summary reads `FAILED | 43 passed | 1 failed`.

Record the SHA that `git rev-parse` printed. Step 3
writes it. If anything else fails, or the new test
passes, stop: the trace above is wrong, and no product
change may follow.

- [ ] **Step 3: Name the red test in the stub (its own
  commit)**

In `docs/superpowers/test-plan-mitigations/2026-09-29-F-F29.md`,
replace:

```
- Reproduced by:
  not reproduced — tests/flow-fsm-reduce.test.ts
  'empty canvas click keeps a zoomed viewBox'
  stayed green at a6af68a6; the live svg
  attribute became the wrap pixel box
```

with the following, where `RED_SHA` is the SHA recorded
in Step 2:

```
- Reproduced by:
  tests/browser/canvas-pan.test.ts 'An empty-canvas
  click after deleting the open edge keeps the
  zoomed viewBox (F29)' red at RED_SHA
```

Commit the stub alone. The red test stays uncommitted.

```bash
git add docs/superpowers/test-plan-mitigations/2026-09-29-F-F29.md
git commit -F - <<'EOF'
Name the F29 red test in its stub

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git status --short
```

Expected: `git status` shows only
` M tests/browser/canvas-pan.test.ts`.

- [ ] **Step 4: Write the minimal implementation**

In `web-app/flows/detail.ts`, after:

```ts
function commitAndFit(
    next: FlowSnapshot,
    opts?: { advanceHistory?: boolean },
): void {
    commit(next, opts);
    reconcileFitFromDom();
}
```

insert:

```ts

// A deleted selection leaves the panel nothing to show.
// Close it through its transition, so the viewBox it
// saved on open is restored and cleared here rather
// than handed to the next empty-canvas click (F29).
function closePanel(): void {
    pageState.panelStateRef().open = false;
    commit(
        pageState.presenter().withPanelOpen(false),
    );
}
```

In `handleDeleteSelectedEdge`, replace:

```ts
        edges: current.edges.filter(
            e => e.id !== op.edgeId,
        ),
        interaction: {
            ...current.interaction,
            selection: { kind: 'none' },
        },
    };
    commit(next, {
        advanceHistory: op.advanceHistory,
    });
    commitAndFit(
```

with:

```ts
        edges: current.edges.filter(
            e => e.id !== op.edgeId,
        ),
        interaction: {
            ...current.interaction,
            selection: { kind: 'none' },
        },
    };
    commit(next, {
        advanceHistory: op.advanceHistory,
    });
    closePanel();
    commitAndFit(
```

- [ ] **Step 5: Run it green**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test browser 2>&1 | tail -5
./test validate 2>&1 | tail -5
```

Expected: `./test browser` ends `ok | 44 passed |
0 failed`. `./test validate` exits 0, with
`ok | 3622 passed | 0 failed | 8 ignored` and
`ok | 8 passed | 0 failed`, or master's re-count if
master moved. Also confirm the reducer pin is untouched
and green (Layer 1 one-file command,
`--filter 'empty canvas click keeps a zoomed viewBox'
tests/flow-fsm-reduce.test.ts`). Expected
`ok | 1 passed | 0 failed`.

- [ ] **Step 6: Commit the test and the fix together**

```bash
git add tests/browser/canvas-pan.test.ts web-app/flows/detail.ts
git commit -F - <<'EOF'
Close the panel when its edge is deleted

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Close the panel when its node is deleted

F27 walked this door before F28 did. It is the same
ghost-open panel through `handleDeleteSelectedNodes`.
It needs its own red test, because it changes its own
product lines. The stub already names Task 2's red
test, so no stub edit here.

**Files:**
- Test: `tests/browser/canvas-pan.test.ts`: two import
  names, one test appended
- Modify: `web-app/flows/detail.ts`, the node handler
  (lines 351-382)

**Interfaces:**
- Consumes: `closePanel()` from Task 2;
  `assertEmptyClickKeepsZoom`, `DELETE_SELECTED`,
  `PANEL_ABSENT`, and `AUTO_FIT` in the test file
- Produces: nothing later tasks call

- [ ] **Step 1: Write the failing test**

In the `./canvas.ts` import of
`tests/browser/canvas-pan.test.ts`, replace:

```ts
import {
    CANVAS, EDGE, LAYOUT_TEST, ONBOARDING, WRAP,
    openFlow, doubleClick, edgeCount, edgeLabelSelector,
    nodeIdNamed, nodeSelector,
} from './canvas.ts';
```

with:

```ts
import {
    CANVAS, EDGE, LAYOUT_TEST, NODE, ONBOARDING, WRAP,
    openFlow, doubleClick, edgeCount, edgeLabelSelector,
    nodeCount, nodeIdNamed, nodeSelector,
} from './canvas.ts';
```

Append at the end of the file:

```ts

Deno.test(
    'An empty-canvas click after deleting the open'
    + ' node keeps the zoomed viewBox (F29)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, LAYOUT_TEST,
                );
                await page.click(AUTO_FIT);
                const panelA = await nodeIdNamed(
                    page, 'Panel A',
                );
                const nodes = await nodeCount(page);
                await doubleClick(
                    page, nodeSelector(panelA),
                );
                await page.waitFor('.flow-props-panel');
                await page.click(DELETE_SELECTED);
                await page.until(
                    `document.querySelectorAll('${NODE}')`
                    + `.length === ${nodes - 1}`,
                    'one fewer node',
                );
                await page.until(
                    PANEL_ABSENT, 'panel gone',
                );
                await assertEmptyClickKeepsZoom(page);
            },
        );
    },
);
```

"Panel A" is F27's safe pick: a middle node, neither
Create nor Archive.

- [ ] **Step 2: Run it and record the red**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
deno check --frozen tests/browser/canvas-pan.test.ts
./test browser 2>&1 | tee "$TMPDIR/f29-node-red.log" | tail -30
```

Expected: exactly one failure, the new node test, with
the same `AssertionError: Values are not strictly
equal.` diff shape as Task 2 Step 2. Summary:
`FAILED | 44 passed | 1 failed`. If it passes, stop and
revert the test: the node handler would not be the
defect, and no product change may follow.

- [ ] **Step 3: Write the minimal implementation**

In `handleDeleteSelectedNodes`, replace:

```ts
        nodes: op.nodes,
        edges: op.edges,
        interaction: {
            ...current.interaction,
            selection: { kind: 'none' },
        },
    };
    commit(next, {
        advanceHistory: op.advanceHistory,
    });
    commitAndFit(
```

with:

```ts
        nodes: op.nodes,
        edges: op.edges,
        interaction: {
            ...current.interaction,
            selection: { kind: 'none' },
        },
    };
    commit(next, {
        advanceHistory: op.advanceHistory,
    });
    closePanel();
    commitAndFit(
```

- [ ] **Step 4: Run it green**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test browser 2>&1 | tail -5
./test validate 2>&1 | tail -5
```

Expected: `ok | 45 passed | 0 failed`, and
`./test validate` exits 0.

- [ ] **Step 5: Commit**

```bash
git add tests/browser/canvas-pan.test.ts web-app/flows/detail.ts
git commit -F - <<'EOF'
Close the panel when its node is deleted

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Name the F29 canvas pins in TEST-PLAN

**Files:**
- Modify: `TEST-PLAN.md`, the F29 Pin clause only
  (lines 3073-3076 at `a6af68a6`)

- [ ] **Step 1: Edit the Pin clause**

Replace:

```
       wheel path carries a test); tests/flow-fsm-reduce.test.ts
       'empty canvas click keeps a zoomed viewBox'
       (decides pointer-down + pointer-up on empty
       canvas leaves viewBox and zoom untouched)
```

with:

```
       wheel path carries a test); tests/flow-fsm-reduce.test.ts
       'empty canvas click keeps a zoomed viewBox'
       (decides pointer-down + pointer-up on empty
       canvas leaves viewBox and zoom untouched);
       tests/browser/canvas-pan.test.ts 'An empty-canvas
       click after deleting the open edge keeps the
       zoomed viewBox (F29)' and its node twin (decide
       that deleting the open panel's selection closes
       the panel, so the click restores no viewBox the
       panel saved on open)
```

- [ ] **Step 2: Commit**

```bash
git add TEST-PLAN.md
git commit -F - <<'EOF'
Name the F29 canvas pins in TEST-PLAN

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Markdown only: no `./test validate`.

---

### Task 5: Retire F29 from TODO and file its siblings

**Files:**
- Modify: `TODO.md`, `## Critical functionality path`

- [ ] **Step 1: Drop the F29 sub-bullet**

Remove these lines, which Task 0 added:

```
  - F29, `2026-09-29-f29-zoomed-viewbox` — deleting
    the open panel's node or edge leaves the panel open
    behind an empty selection, so the next empty-canvas
    click restores the viewBox the panel saved on open
    (`docs/superpowers/test-plan-mitigations/2026-09-29-F-F29.md`).
    Oracle: `tests/browser/canvas-pan.test.ts` 'An
    empty-canvas click after deleting the open edge
    keeps the zoomed viewBox (F29)' green
```

If it is the last sub-bullet under "The 29 Sep walk's
mitigations", remove that parent bullet's five lines
too.

```bash
git add TODO.md
git commit -F - <<'EOF'
Drop the landed F29 item from TODO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 2: File the two sibling doors**

Insert this bullet directly above `## Later work`,
after the last bullet of `## Critical functionality
path`, with one blank line before the heading:

```
- A panel closed outside `withPanelOpen` keeps the
  viewBox it saved on open, so the next empty-canvas
  click or delete restores a stale camera — F29's
  defect through two more doors in
  `web-app/flows/detail.ts`: `handleAddNodeAtPosition`
  writes `isPanelOpen: false` by hand, and
  `refreshFlowFromServer` drops the panel when a
  cross-tab edit removes its selection. Oracle: a
  Layer 2 test in `tests/browser/canvas-pan.test.ts`
  that opens a node's panel with Auto Fit off,
  port-drags a new node, zooms in once, and clicks
  empty canvas — red today, green once both doors
  call `closePanel()`
```

```bash
git add TODO.md
git commit -F - <<'EOF'
File F29's two sibling panel doors in TODO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Land

- [ ] **Step 1: Rebase and gate**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-09-29-f29-zoomed-viewbox
git rebase master
export DENO_DIR="$TMPDIR/deno-dir"
./test validate browser 2>&1 | tail -8
```

`TODO.md` and `TEST-PLAN.md` may conflict with a sibling
29 Sep plan that landed first. Keep every sibling's
lines and drop only this plan's own. If rebase rewrote
anything, amend until every commit is green (AGENTS.md
§ Worktrees).

Expected: `./test validate browser` exits 0.

- [ ] **Step 2: Fast-forward master and clean up**

```bash
cd /Users/tmornini/code/fusion-angle
git merge --ff-only 2026-09-29-f29-zoomed-viewbox
git worktree remove .worktrees/2026-09-29-f29-zoomed-viewbox
git branch -d 2026-09-29-f29-zoomed-viewbox
```

If `--ff-only` refuses, master moved: return to Step 1.
Never `-D`. Never push with force.

---

## Out of scope

- The Auto-Fit refusal toast (F29's first half), which
  already passed.
- `handleAddNodeAtPosition`, `refreshFlowFromServer`,
  and the Auto-Fit-on close that keeps a save
  (`applyPanelTransition` returns null under Auto
  Fit). All are named, not fixed; Task 5 files the
  first two with their oracle.
- Rerouting the three existing inline close sites
  (close button, Escape, `onPanelRequest`) through
  `closePanel()`. That is a separate, proposed change.
- No walk, no `./deploy`, no `./deploy --render`.

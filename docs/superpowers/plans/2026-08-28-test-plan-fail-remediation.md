# Test-Plan 2026-08-28 FAIL Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking. Do not use git worktrees
> (AGENTS.md). Work on master.

**Goal:** Make the 2026-08-28 TEST-PLAN FAIL cluster
and the WB4 / WB19b DRIFT candidates pass on the next
run — dragged rows follow the pointer, Shift-connect
survives compositor `shiftKey: false`, Tab from the
canvas SVG enters the node/edge ring, undo of a
Members tick leaves the panel open, and F13 / F35 /
F37b / F50 / F55 / F57 / F68–F72 / WB16 / WB4 /
WB19b drive notes name the product that exists.

**Architecture:** Eight tasks, one commit each, on
master (no worktrees, no branches, linear history).
Product changes ride TDD (red pin → fix → green).
TEST-PLAN wording rides one commit after the product
pins, so the document describes what is already
true. Dated mitigation stubs stay frozen.

**Tech Stack:** TypeScript ES2024 strict
(`node --strip-types`), `node:test` on the memory
backend, no frameworks. Gate: `./validate` (tsc, two-TZ
tests, 78-char lint, `org` ban, retired-vocab lint,
doc line-count ceilings, later-work single-home gate,
SVG/API doc drift checks).

**Spec:**
`docs/superpowers/specs/2026-08-28-test-plan-fail-remediation-design.md`
(committed at `2d4deb07`). Frozen stubs at `615d0be`:
`docs/superpowers/test-plan-mitigations/2026-08-28-d-d36.md`,
`2026-08-28-f-f13.md`,
`2026-08-28-f2-wb16.md`.
Where a stub and the spec Ruling disagree, the spec
wins.

## Global Constraints

- **Base:** master at `2d4deb07` (design spec). Work
  directly on master; never branch, never merge,
  never push. No worktrees.
- **One concern per commit.** Subject ≈50 chars,
  present-tense imperative, no body prose. Every
  commit message ends with exactly this trailer
  line:
  `Co-Authored-By: Grok 4.6 <noreply@x.ai>`
- **`./validate` green before every commit.** It
  works on a dirty tree. A red gate aborts the task
  — fix before committing.
- **Voice:** 78-char max lines in every file
  `./validate` lints; 4-space indent; no trailing
  whitespace; final newline. `drag-reorder.ts`
  already uses inline styles for the indicator and
  opacity — match that voice for `transform`.
  Elsewhere: no new inline styles. No `org`
  abbreviation in identifiers — always
  `organization`.
- **Tests:** red before green where a task says
  red; never weaken an existing assertion.
  Single-file run:
  `TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \`
  `node --strip-types --import ./tests/hmac-test-key.ts \`
  `--test tests/<file>.test.ts`
  Full suite: `./test`. `tsc` does not type-check
  `tests/` (include stops at `web-app/`, `api/`,
  `shared/`).
- **Never edit** dated specs, plans, or mitigation
  stubs under `docs/superpowers/` except this plan
  file. The three stubs at `615d0be` stay frozen.
  The 2026-08-27 plan and stubs stay frozen too.
- **Never touch** `EXPECTED_SLICE_MESSAGE_PAIRS`,
  `EXPECTED_MESSAGE_PAIR_COUNT`, or garden/mock-seed
  counts. No third F-slice record attribute.
- **This plan file is committed up front (Task 1).**
  Executors tick checkboxes in the tracked file.
  Task 8 commits the fully ticked state. No task
  builds or serves. Browser re-verification belongs
  to the next TEST-PLAN run (`TODO.md` item 5).
- **Doctrine riders:** validators at the gate;
  SafeHtml from presenters; RequestContext first
  argument; snake_case wire / camelCase domain;
  HTTP-verb adapter naming; no untyped `any` from
  external boundaries; transaction bodies await
  only row ops; `noUncheckedIndexedAccess` — index
  access is `T | undefined`.

## Rulings

1. **D36/E11/K6 — the dragged row never follows.**
   Pointer capture, hysteresis indicator, and
   persist-on-`pointerup` stay. The captured card
   must write `style.transform` =
   `translateY(Npx)` on each `pointermove`
   (`N = clientY - startClientY`). Transform does
   not affect layout, so drop-index geometry stays
   the snapshot. Clear transform and opacity on
   `pointerup` / `pointercancel` before
   `onReorder`. Extract `followTranslateY` next to
   the position helpers. No ghost clone. No
   `z-index` unless a later hunter still reports
   no follow *with* `transform` set.

2. **F19/F20/F23 — pointermove stomps keyboard
   Shift.** The interaction layer owns whether
   Shift is held. `keydown` / `keyup` on Shift set
   `shiftHeld`. Every pointer FSM input's
   `isShift` is `pointerIsShift(shiftHeld,
   eventShiftKey)` = `shiftHeld || eventShiftKey`.
   Keep dispatching `shift-key` while connecting
   so a stationary pointer still hides the ghost
   (F23). Do not OR sticky-on inside the FSM. Do
   not add a reduce test that documents the old
   stomp. Do not remove `button` from
   `isFormFocused`.

3. **F38/F38a/F38b/F57a — Tab from the SVG leaves
   the ring.** `nextCanvasTabIndex` treats
   `current < 0` as SVG-entry: Tab → `0`,
   Shift+Tab → `length - 1`. `length < 1` and
   `current >= length` stay no-ops. `handleTab`
   already runs when `wrap.contains(active)`.
   Focusing the first node fires `focusin` →
   `canvas-focus` → selection → `aria-current`.
   Do not steal Tab that started outside the wrap.

4. **F67 — undo always closes the panel, and a
   checkbox swallows Cmd+Z.** `applyServerGraph`
   keeps the current selection and `isPanelOpen`
   when every selected node id still exists in
   `graph.nodes` (or the selected edge id still
   exists in `graph.edges`). Otherwise selection
   `none` and `isPanelOpen: false`. Redo uses the
   same helper. Exhaustion (`hasUndoHistory`
   false) already returns `snap` unchanged.
   `isDesignerEditableTarget` is true for
   textarea, select, and texty inputs; false for
   checkbox / radio / button / submit / reset.
   `bindKeyboardShortcuts` uses it for
   `isEditableFocused`. Do not reuse
   `selectionStillPresent` in `flows/detail.ts`
   — that helper keeps marquee survivors on
   notify refresh; undo requires *every* selected
   id to exist.

5. **F68–F72, F13, F35, F37b, F50, F55, F57,
   WB16, WB4, WB19b — drive, not product.** One
   contiguous TEST-PLAN edit. No new cases. No
   seed change. F68 uses F15's New State and
   Company Name / Industry. WB16 asserts against
   a bind-through-WB11 Performance snapshot.

## File structure

| File | Responsibility |
|---|---|
| `docs/superpowers/plans/2026-08-28-test-plan-fail-remediation.md` | This plan (Task 1, Task 8) |
| `web-app/app/drag-reorder-positions.ts` | `followTranslateY` |
| `web-app/app/drag-reorder.ts` | Apply `translateY` during capture |
| `tests/drag-reorder.test.ts` | Pin `followTranslateY` |
| `web-app/app/flow-interactions.ts` | `shiftHeld`; `pointerIsShift`; Tab from SVG |
| `tests/flow-interactions-shift.test.ts` | Pin `pointerIsShift` |
| `tests/flow-canvas-tab.test.ts` | SVG-entry Tab |
| `web-app/app/flow-operations.ts` | `applyServerGraph` keeps live selection |
| `tests/flow-operations.test.ts` | Undo keeps panel |
| `web-app/flows/detail.ts` | `isDesignerEditableTarget` |
| `tests/flows-detail-shortcuts.test.ts` | Checkbox is not editable |
| `TEST-PLAN.md` | Drive notes in Task 7 |

## Dependency graph

| # | Task | Primary files |
|---|---|---|
| 1 | Commit this plan | `docs/superpowers/plans/` |
| 2 | Drag-row `translateY` follow | `drag-reorder*.ts`, tests |
| 3 | Window-tracked Shift | `flow-interactions.ts`, new test |
| 4 | Tab from canvas SVG | `flow-interactions.ts`, tab test |
| 5 | Undo keeps live selection | `flow-operations.ts`, tests |
| 6 | Checkbox is not editable | `flows/detail.ts`, shortcut tests |
| 7 | Correct TEST-PLAN drive notes | `TEST-PLAN.md` |
| 8 | Commit the completed plan | this file |

```
1 → everything (O: plan enters history first)
2, 3, 5, 6 are disjoint (any order in wave B)
3 → 4 (S: both edit flow-interactions.ts)
2 → 7, 4 → 7, 5 → 7, 6 → 7
    (S: Task 7 wording is true only after those pins)
7 → 8
```

Waves: A = 1; B = 2, 3, 5, 6; C = 4 after 3; D = 7;
E = 8. Default order is 1…8. One implementer at a
time (SDD forbids parallel implementers).

### Execution protocol

1. Follow superpowers:subagent-driven-development:
   fresh implementer per task, spec-compliance
   review, then code-quality review.
2. One implementer at a time. No worktrees. No
   branches. No push.
3. Each task ends: `./validate` green → commit with
   the task's message + trailer → tick boxes here.
4. Every implementer AND reviewer prompt begins
   with the literal phrase `Go to Medium Church!`
   then the Voice / Commandments / Abominations /
   Patterns from AGENTS.md (RequestContext first,
   SafeHtml, snake_case wire, HTTP-verb adapters,
   validators at the gate, no `any`, 78-char
   lines, 4-space indent).
5. Subagents follow TDD when the task says red
   before green.
6. Do not dispatch an implementer for Task 4 until
   Task 3 is committed (same file).

---

### Task 1: Commit this plan

**Doctrine:** Office of the Commit (ABC). Risks
nothing.

**Files:**
- Create:
  `docs/superpowers/plans/2026-08-28-test-plan-fail-remediation.md`
  (this document)

- [x] **Step 1: Confirm the plan is on disk**

This file is already at
`docs/superpowers/plans/2026-08-28-test-plan-fail-remediation.md`.
Do not add a prose body beyond what is already in
the document.

- [x] **Step 2: Validate**

Run: `./validate`
Expected: green.

- [x] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-08-28-test-plan-fail-remediation.md
git commit -m "Add 2026-08-28 FAIL remediation plan" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 2: Dragged row follows the pointer

**Doctrine:** Commandments I (Reliability), V
(Clarity), XII (Performance — transform is paint,
not layout). Risks Premature Optimization (no
`z-index` until measured), Unbidden Helper (no
ghost clone), Magical Values (name the translate
helper).

**Files:**
- Modify: `web-app/app/drag-reorder-positions.ts`
- Modify: `web-app/app/drag-reorder.ts`
- Modify: `tests/drag-reorder.test.ts`

- [x] **Step 1: Write the failing pins**

Append to `tests/drag-reorder.test.ts`. Import
`followTranslateY` from
`../web-app/app/drag-reorder-positions.ts`
alongside the existing named imports.

```ts
test(
    'followTranslateY writes translateY of the'
    + ' pointer delta',
    () => {
        assert.equal(
            followTranslateY(100, 130),
            'translateY(30px)',
        );
        assert.equal(
            followTranslateY(100, 70),
            'translateY(-30px)',
        );
        assert.equal(
            followTranslateY(50, 50),
            'translateY(0px)',
        );
    },
);
```

- [x] **Step 2: Run the test to verify it fails**

Run:
```bash
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
node --strip-types --import ./tests/hmac-test-key.ts \
--test tests/drag-reorder.test.ts
```
Expected: FAIL — `followTranslateY` is not
exported.

- [x] **Step 3: Implement `followTranslateY`**

Add at the bottom of
`web-app/app/drag-reorder-positions.ts`:

```ts
export function followTranslateY(
    startClientY: number,
    clientY: number,
): string {
    return 'translateY('
        + (clientY - startClientY)
        + 'px)';
}
```

- [x] **Step 4: Wire follow into `initDragReorder`**

In `web-app/app/drag-reorder.ts`:

1. Import `followTranslateY` from
   `./drag-reorder-positions.ts`.
2. Extend the active `DragState` with
   `startClientY: number` and
   `card: HTMLElement`.
3. On `pointerdown`, after
   `setPointerCapture`, store
   `startClientY: e.clientY` and `card`. Keep
   setting `card.style.opacity = DRAGGING_OPACITY`.
4. Every other `kind: 'active'` reconstruction
   (`clearIndicator`, the `dropIndex` rects
   cache, the `pointermove` indicator update)
   must copy `startClientY` and `card` from
   the current `drag`.
5. On `pointermove`, **before** the same-idx
   early return, write
   `drag.card.style.transform =
   followTranslateY(drag.startClientY,
   e.clientY)`. The early return must not skip
   follow — a hysteresis hold still moves the
   card.
6. On `pointerup` and `pointercancel`, clear
   `drag.card.style.transform` and all cards'
   `opacity` **before** `onReorder` (pointerup)
   or idle (both). Capture `card` / `id` /
   `idx` into locals before setting
   `drag = { kind: 'idle' }`.

`pointerdown` active assignment:

```ts
drag = {
    kind: 'active',
    id,
    indicator: null,
    idx: null,
    rects: null,
    startClientY: e.clientY,
    card,
};
card.style.opacity =
    DRAGGING_OPACITY;
```

`pointermove` follow, then indicator:

```ts
if (drag.kind !== 'active')
    return;
drag.card.style.transform =
    followTranslateY(
        drag.startClientY,
        e.clientY,
    );
const newIdx = dropIndex(
    e.clientY,
    drag.idx,
);
if (
    newIdx === drag.idx
    && drag.indicator
) {
    return;
}
```

`pointerup` cleanup (before `onReorder`):

```ts
const draggedId = drag.id;
const committedIdx =
    drag.idx ?? dropIndex(
        e.clientY, null,
    );
const card = drag.card;
clearIndicator();
card.style.transform = '';
drag = { kind: 'idle' };
const items = cards();
const newPos = computeNewPosition(
    positionsOf(items),
    committedIdx,
);
for (const c of items) {
    c.style.opacity = '';
}
onReorder(draggedId, newPos);
```

`pointercancel`:

```ts
if (drag.kind !== 'active')
    return;
const card = drag.card;
clearIndicator();
card.style.transform = '';
drag = { kind: 'idle' };
for (const c of cards()) {
    c.style.opacity = '';
}
```

Do not set `draggable`. Do not add a ghost
clone. Do not set `z-index`. Keyboard arrows
stay untouched.

- [x] **Step 5: Run the pin and `./validate`**

Run the single-file test from Step 2.
Expected: PASS.

Run: `./validate`
Expected: green.

- [x] **Step 6: Commit**

```bash
git add web-app/app/drag-reorder-positions.ts \
    web-app/app/drag-reorder.ts \
    tests/drag-reorder.test.ts
git commit -m "Follow dragged list rows with translateY" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 3: Window-tracked Shift for connect

**Doctrine:** Commandments I (Reliability), III
(Uniformity), V (Clarity). Risks Internal Defense
(do not OR sticky-on inside the FSM), Unbidden
Helper (do not remove `button` from
`isFormFocused`), Test Weakening (do not add a
reduce test that documents the old stomp).

**Files:**
- Create: `tests/flow-interactions-shift.test.ts`
- Modify: `web-app/app/flow-interactions.ts`

- [x] **Step 1: Write the failing pin**

Create `tests/flow-interactions-shift.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { pointerIsShift } from
    '../web-app/app/flow-interactions.ts';

test(
    'pointerIsShift is true when the window'
    + ' tracks Shift even if the pointer event'
    + ' reports false',
    () => {
        assert.equal(
            pointerIsShift(true, false),
            true,
        );
    },
);

test(
    'pointerIsShift is true when the pointer'
    + ' event reports Shift',
    () => {
        assert.equal(
            pointerIsShift(false, true),
            true,
        );
        assert.equal(
            pointerIsShift(true, true),
            true,
        );
    },
);

test(
    'pointerIsShift is false when neither'
    + ' source is Shift',
    () => {
        assert.equal(
            pointerIsShift(false, false),
            false,
        );
    },
);
```

Do **not** add a `flow-fsm-reduce` test that
shows connecting `pointer-move` copying
`input.isShift` over a prior `shift-key`. The
caller will pass `true`. The existing F23
`shift-key` scenario in
`tests/flow-fsm-scenarios.test.ts` stays.

- [x] **Step 2: Run the test to verify it fails**

Run:
```bash
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
node --strip-types --import ./tests/hmac-test-key.ts \
--test tests/flow-interactions-shift.test.ts
```
Expected: FAIL — `pointerIsShift` is not
exported.

- [x] **Step 3: Export `pointerIsShift`**

In `web-app/app/flow-interactions.ts`, next to
`nextCanvasTabIndex`:

```ts
export function pointerIsShift(
    shiftHeld: boolean,
    eventShiftKey: boolean,
): boolean {
    return shiftHeld || eventShiftKey;
}
```

- [x] **Step 4: Own Shift in `bindInteractions`**

Inside `bindInteractions`, next to
`let gestureRect`:

```ts
let shiftHeld = false;
```

Replace every pointer FSM `isShift: e.shiftKey`
with:

```ts
isShift: pointerIsShift(
    shiftHeld, e.shiftKey,
),
```

There are three: `pointer-down-on-node`,
`pointer-move`, `pointer-up`.

Change `handleShift` so keydown sets the flag
and keyup clears it, and keep dispatching
`shift-key` (F23 stationary pointer):

```ts
const handleShift = (
    ke: KeyboardEvent,
): void => {
    if (ke.key !== 'Shift') return;
    shiftHeld = ke.type === 'keydown';
    dispatch({
        kind: 'shift-key',
        isShift: pointerIsShift(
            shiftHeld, ke.shiftKey,
        ),
    });
};
```

Do not change `onShiftKey` in
`flow-fsm-reduce.ts`. Do not change connecting
`pointer-move`'s `isShift: input.isShift`
copy. Do not remove `button` from
`isFormFocused`. Do not add a `blur` listener.

- [x] **Step 5: Run the pin and `./validate`**

Run the single-file test from Step 2.
Expected: PASS.

Run: `./validate`
Expected: green.

- [x] **Step 6: Commit**

```bash
git add tests/flow-interactions-shift.test.ts \
    web-app/app/flow-interactions.ts
git commit -m "Track Shift on window for connect" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 4: Tab from the canvas SVG enters the ring

**Doctrine:** Commandments I (Reliability), V
(Clarity), VIII (Simplicity). Risks Coupling
(do not steal Tab that started outside
`wrap` — `handleTab` already returns unless
`wrap.contains(active)`), Test Weakening (rewrite
the `current === -1` no-op into the SVG-entry
covenant; keep `length === 0` and
`current >= length`).

**Depends on:** Task 3 (same file).

**Files:**
- Modify: `tests/flow-canvas-tab.test.ts`
- Modify: `web-app/app/flow-interactions.ts`
  (`nextCanvasTabIndex` only)

- [x] **Step 1: Rewrite the failing / new pins**

In `tests/flow-canvas-tab.test.ts`, replace the
combined `'Tab outside the canvas ring is a
no-op'` test with three tests. Keep the wrap /
walk / lone-item tests unchanged.

```ts
test(
    'Tab from the canvas SVG enters the first'
    + ' item',
    () => {
        assert.equal(
            nextCanvasTabIndex(4, -1, false),
            0,
        );
        assert.equal(
            nextCanvasTabIndex(1, -1, false),
            0,
        );
    },
);

test(
    'Shift+Tab from the canvas SVG enters the'
    + ' last item',
    () => {
        assert.equal(
            nextCanvasTabIndex(4, -1, true),
            3,
        );
        assert.equal(
            nextCanvasTabIndex(1, -1, true),
            0,
        );
    },
);

test(
    'Tab outside the canvas ring is a no-op',
    () => {
        assert.equal(
            nextCanvasTabIndex(0, 0, false),
            null,
        );
        assert.equal(
            nextCanvasTabIndex(0, -1, false),
            null,
        );
        assert.equal(
            nextCanvasTabIndex(4, 4, false),
            null,
        );
    },
);
```

- [x] **Step 2: Run the test to verify the SVG-entry
  cases fail**

Run:
```bash
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
node --strip-types --import ./tests/hmac-test-key.ts \
--test tests/flow-canvas-tab.test.ts
```
Expected: FAIL on `nextCanvasTabIndex(4, -1,
false)` — current code returns `null`.

- [x] **Step 3: Implement SVG-entry**

Replace `nextCanvasTabIndex` in
`web-app/app/flow-interactions.ts`:

```ts
export function nextCanvasTabIndex(
    length: number,
    current: number,
    shift: boolean,
): number | null {
    if (length < 1) return null;
    if (current < 0) {
        return shift ? length - 1 : 0;
    }
    if (current >= length) {
        return null;
    }
    if (shift) {
        return current === 0
            ? length - 1
            : current - 1;
    }
    return current === length - 1
        ? 0
        : current + 1;
}
```

Do not change `handleTab`. It already
`preventDefault`s when `nextIdx !== null` and
focuses `items[nextIdx]`. `indexOf(active)` is
`-1` when focus is on `svg.flow-canvas`.
Do not change `isFormFocused`.

- [x] **Step 4: Run the pin and `./validate`**

Run the single-file test from Step 2.
Expected: PASS.

Run: `./validate`
Expected: green.

- [x] **Step 5: Commit**

```bash
git add tests/flow-canvas-tab.test.ts \
    web-app/app/flow-interactions.ts
git commit -m "Tab from canvas SVG into the ring" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 5: Undo keeps a live selection

**Doctrine:** Commandments I (Reliability), VI
(Immutability — restore is a new snapshot), V
(Clarity). Risks Internal Defense (do not
resurrect a deleted id — existence is the whole
guard), Coupling (do not reuse
`selectionStillPresent`; that keeps marquee
survivors on notify refresh).

**Files:**
- Modify: `tests/flow-operations.test.ts`
- Modify: `web-app/app/flow-operations.ts`

- [x] **Step 1: Write the failing pins**

In `tests/flow-operations.test.ts`, after the
existing `'performUndo: restores the previous
save…'` test, add two tests. Reuse
`setupFlow`, `seedCurrentGraph`, `snapFrom`,
`withNodeSelection`, `buildGraph`,
`buildNode`, `NODE_A`, `NODE_B`, `NODE_C`,
`buildFlowHistorySnapshot`, `performUndo`,
`createRequestContext`, `DEV_TOKEN`.

The human id matches `setupFlow`'s
`seedHumanMember` argument
`XXZruirZyAOoRpNxaDnpSA`. Repeat the literal
in the test; do not hoist or refactor
`setupFlow`.

```ts
test(
    'performUndo: keeps the panel open on a'
    + ' surviving node and restores memberIds',
    async () => {
        const { db, ctx } = await setupFlow();
        const humanId =
            'XXZruirZyAOoRpNxaDnpSA';
        await seedCurrentGraph(ctx, [
            buildNode(NODE_A, {
                memberIds: [],
            }),
            buildNode(NODE_B),
        ]);
        const currentNodes = [
            buildNode(NODE_A, {
                memberIds: [humanId],
            }),
            buildNode(NODE_B),
        ];
        await seedCurrentGraph(
            ctx, currentNodes,
        );
        const snap = {
            ...withNodeSelection(
                snapFrom(
                    buildGraph(currentNodes),
                ),
                NODE_A,
            ),
            isPanelOpen: true,
        };
        const op = await performUndo(
            createRequestContext(
                db, DEV_TOKEN,
            ),
            snap,
            buildFlowHistorySnapshot(true),
        );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(
            op.freshSnap.isPanelOpen, true,
        );
        const sel =
            op.freshSnap.interaction.selection;
        assert.equal(sel.kind, 'nodes');
        if (sel.kind !== 'nodes') return;
        assert.equal(sel.nodeIds.size, 1);
        assert.equal(
            sel.nodeIds.has(NODE_A), true,
        );
        const restored = op.freshSnap.nodes
            .find(n => n.id === NODE_A);
        assert.ok(restored);
        assert.deepEqual(
            restored!.memberIds, [],
        );
    },
);

test(
    'performUndo: closes the panel when the'
    + ' selected node is gone',
    async () => {
        const { db, ctx } = await setupFlow();
        await seedCurrentGraph(ctx, [
            buildNode(NODE_A),
            buildNode(NODE_B),
        ]);
        const currentNodes = [
            buildNode(NODE_A),
            buildNode(NODE_B),
            buildNode(NODE_C),
        ];
        await seedCurrentGraph(
            ctx, currentNodes,
        );
        const snap = {
            ...withNodeSelection(
                snapFrom(
                    buildGraph(currentNodes),
                ),
                NODE_C,
            ),
            isPanelOpen: true,
        };
        const op = await performUndo(
            createRequestContext(
                db, DEV_TOKEN,
            ),
            snap,
            buildFlowHistorySnapshot(true),
        );
        assert.equal(op.kind, 'ok');
        if (op.kind !== 'ok') return;
        assert.equal(
            op.freshSnap.isPanelOpen, false,
        );
        assert.equal(
            op.freshSnap.interaction
                .selection.kind,
            'none',
        );
    },
);
```

Do not weaken the existing
`performUndo: restores the previous save`
assertions.

- [x] **Step 2: Run the new tests to verify they
  fail**

Run:
```bash
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
node --strip-types --import ./tests/hmac-test-key.ts \
--test tests/flow-operations.test.ts
```
Expected: FAIL — `freshSnap.isPanelOpen` is
`false` on the surviving-node case (today
`applyServerGraph` always closes).

- [x] **Step 3: Keep live selection in
  `applyServerGraph`**

Replace `applyServerGraph` in
`web-app/app/flow-operations.ts`. Keep it
unexported. Redo already calls it.

```ts
function selectionSurvivesRestore(
    selection: FlowSnapshot[
        'interaction'
    ]['selection'],
    nodes: readonly GraphNode[],
    edges: readonly GraphEdge[],
): boolean {
    if (selection.kind === 'edge') {
        return edges.some(
            e => e.id === selection.edgeId,
        );
    }
    if (selection.kind !== 'nodes') {
        return false;
    }
    if (selection.nodeIds.size === 0) {
        return false;
    }
    const ids = new Set(
        nodes.map(n => n.id),
    );
    for (const id of selection.nodeIds) {
        if (!ids.has(id)) return false;
    }
    return true;
}

function applyServerGraph(
    snap: FlowSnapshot,
    graph: {
        name: string;
        isLocked: boolean;
        isAutoLayout: boolean;
        isAutoFit: boolean;
        lockTimeout: number;
        nodes: GraphNode[];
        edges: GraphEdge[];
    },
): FlowSnapshot {
    const keep = selectionSurvivesRestore(
        snap.interaction.selection,
        graph.nodes,
        graph.edges,
    );
    return {
        ...snap,
        flowName: graph.name,
        isLocked: graph.isLocked,
        isAutoLayout: graph.isAutoLayout,
        isAutoFit: graph.isAutoFit,
        lockTimeout: graph.lockTimeout,
        nodes: graph.nodes,
        edges: graph.edges,
        isPanelOpen: keep
            ? snap.isPanelOpen
            : false,
        interaction: {
            ...snap.interaction,
            selection: keep
                ? snap.interaction.selection
                : { kind: 'none' },
        },
    };
}
```

Do not import or call `selectionStillPresent`
from `flows/detail.ts`. Do not export
`applyServerGraph`. Do not change
`performUndo`'s exhaustion branch.

- [x] **Step 4: Run the pins and `./validate`**

Run the single-file test from Step 2.
Expected: PASS, including the pre-existing
undo/redo tests.

Run: `./validate`
Expected: green.

- [x] **Step 5: Commit**

```bash
git add tests/flow-operations.test.ts \
    web-app/app/flow-operations.ts
git commit -m "Keep live selection after undo restore" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 6: Cmd+Z from a Members checkbox is undo

**Doctrine:** Commandments I (Reliability), III
(Uniformity), V (Clarity). Risks Default Values
(do not treat every `HTMLInputElement` as
editable), Unbidden Helper (do not invent a
shortcut framework).

**Files:**
- Modify: `tests/flows-detail-shortcuts.test.ts`
- Modify: `web-app/flows/detail.ts`

- [x] **Step 1: Stub constructors and write the
  failing pins**

`flows-detail-shortcuts.test.ts` already stubs
`localStorage` / `window` / `document` before
the dynamic import. Add constructor stubs on
`globalThis` **with those stubs**, before the
`await import`.

```ts
class FakeInput {
    readonly type: string;
    constructor(type: string) {
        this.type = type;
    }
}
class FakeTextArea {}
class FakeSelect {}
const g = globalThis as Record<
    string, unknown
>;
g.HTMLInputElement = FakeInput;
g.HTMLTextAreaElement = FakeTextArea;
g.HTMLSelectElement = FakeSelect;
```

Extend the dynamic import:

```ts
const {
    reduceDesignerShortcut,
    isDesignerEditableTarget,
} = await import(
    '../web-app/flows/detail.ts'
);
```

Append:

```ts
test(
    'a Members checkbox is not an editable'
    + ' target',
    () => {
        assert.equal(
            isDesignerEditableTarget(
                new FakeInput('checkbox'),
            ),
            false,
        );
        assert.equal(
            isDesignerEditableTarget(
                new FakeInput('radio'),
            ),
            false,
        );
        assert.equal(
            isDesignerEditableTarget(
                new FakeInput('button'),
            ),
            false,
        );
        assert.equal(
            isDesignerEditableTarget(
                new FakeInput('submit'),
            ),
            false,
        );
        assert.equal(
            isDesignerEditableTarget(
                new FakeInput('reset'),
            ),
            false,
        );
    },
);

test(
    'texty inputs, textarea, and select are'
    + ' editable targets',
    () => {
        assert.equal(
            isDesignerEditableTarget(
                new FakeInput('text'),
            ),
            true,
        );
        assert.equal(
            isDesignerEditableTarget(
                new FakeInput('password'),
            ),
            true,
        );
        assert.equal(
            isDesignerEditableTarget(
                new FakeTextArea(),
            ),
            true,
        );
        assert.equal(
            isDesignerEditableTarget(
                new FakeSelect(),
            ),
            true,
        );
    },
);

test(
    'null is not an editable target',
    () => {
        assert.equal(
            isDesignerEditableTarget(null),
            false,
        );
    },
);
```

Leave the existing
`'the chord honors an editable target'` test
unchanged — it still feeds
`isEditableFocused: true` into
`reduceDesignerShortcut`.

- [x] **Step 2: Run the test to verify it fails**

Run:
```bash
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
node --strip-types --import ./tests/hmac-test-key.ts \
--test tests/flows-detail-shortcuts.test.ts
```
Expected: FAIL — `isDesignerEditableTarget` is
not exported.

- [x] **Step 3: Export `isDesignerEditableTarget`
  and use it**

In `web-app/flows/detail.ts`, next to
`reduceDesignerShortcut`:

```ts
export function isDesignerEditableTarget(
    active: EventTarget | null,
): boolean {
    if (
        active instanceof HTMLTextAreaElement
        || active instanceof HTMLSelectElement
    ) {
        return true;
    }
    if (
        !(active instanceof HTMLInputElement)
    ) {
        return false;
    }
    const type = active.type;
    if (
        type === 'checkbox'
        || type === 'radio'
        || type === 'button'
        || type === 'submit'
        || type === 'reset'
    ) {
        return false;
    }
    return true;
}
```

In `bindKeyboardShortcuts`, replace the three
`instanceof` checks that compute
`isEditableFocused` with:

```ts
isEditableFocused:
    isDesignerEditableTarget(active),
```

Do not change `reduceDesignerShortcut`. Do not
change Delete / Escape behavior.

- [x] **Step 4: Run the pin and `./validate`**

Run the single-file test from Step 2.
Expected: PASS.

Run: `./validate`
Expected: green.

- [x] **Step 5: Commit**

```bash
git add tests/flows-detail-shortcuts.test.ts \
    web-app/flows/detail.ts
git commit -m "Undo from a focused Members checkbox" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 7: Correct TEST-PLAN drive notes

**Doctrine:** Commandment V (Clarity). Risks
Unbidden Helper (no extra cases), Test Weakening
(do not retire a FAIL; rewrite drive so the
covenant is testable). TEST-PLAN.md is exempt
from 78-char lint; still wrap like the
surrounding cases.

**Depends on:** Tasks 2, 4, 5, 6 (wording is
true only after those pins).

**Files:**
- Modify: `TEST-PLAN.md` only. One contiguous
  edit pass. Do not add cases. Do not change
  seed. Do not edit Protocol except the WB16
  hunter-probe sentence named below. D36/E11
  Protocol already says the row follows the
  pointer.

- [x] **Step 1: F13**

Replace the F13 case body with:

While the panel is open, drive two compositor
`pointerdown`s on a different node within 400
ms (there is no `dblclick` listener), same as
F11. PASS: panel content updates to the new
node and the canvas re-centers on it.

- [x] **Step 2: F27 and F35**

**F27:** After the existing sentence, add: If
F15 already created a New State, delete a
*different* intermediate (Capture or Review),
not that New State — F68–F72 need it.

**F35:** Replace the drive with: Toolbar
Delete (`data-action="delete-selected"`) on a
non-Create / non-Archive node, same as F27.
Wait until that node is gone, then Undo. Do
not use Backspace unless F38's `aria-current`
is already true. PASS stays: the state and all
its connected edges are restored.

- [x] **Step 3: F37b and F50**

**F37b:** After "On a flow with Auto Layout
ON,", add: add via F15's plain port-drag (no
Shift). Wait until node count + 1, then Undo.

**F50:** After the hold-two-seconds sentence,
add: The first Space `keydown` must have
`repeat: false`; hold may auto-repeat after
that.

- [x] **Step 4: F38 / F38a / F55 / F57 / F67**

**F38 / F38a:** Keep `js()` `.focus()` on a
`.flow-node` as a valid drive. Add: Tab
through chrome now lands on `svg.flow-canvas`,
then the first `.flow-node` or `.flow-edge`
— that is PASS, not a skip. Wait for
`aria-current="true"` before Delete /
Backspace (F38) or Enter (F38b) / Space
(F57a).

**F55:** Keep focus `svg.flow-canvas` / no
`pointerdown`. Add: if F29 just toasted the
same Auto-Fit message, wait out
`WHEEL_TOAST_COOLDOWN_MS` (2000) before the
Space that must toast again.

**F57:** Unchanged in substance (focus
`#prop-node-name`, not a node).

**F67:** After ticking the checkbox, wait for
the `memberIds` PUT (`SAVE_DELAY_MS` 800 ms)
before Cmd+Z / Ctrl+Z. PASS: the panel stays
open on that node and the checkbox unticks.

- [x] **Step 5: F68–F72**

Rewrite the cluster so every case opens F15's
New State — not Capture, not Review, not
Create/Archive. Drive two compositor
`pointerdown`s within 400 ms (no `dblclick`
listener), same as F13.

The picker lists leftover record attributes
(Company Name and/or Industry). F69 selects
**Company Name**, not Contact Email. F70
removes the Company Name row. F71 / F72 use
the same New State. F72 ticks a Members
checkbox on that New State, then opens the
picker.

Do not mention Contact Email in F68–F72.

- [x] **Step 6: WB4, WB16, WB19b**

**WB4:** After the Parallel READY sentence,
add: Parallel READY containing WB Test Flow
with an empty NOT READY list at this step is
PASS. Do not fail for a missing NOT READY row.

**WB16:** Replace the opening "On this same
load's network log — do not navigate again"
with: Snapshot Performance resource entries
from bind through WB11 submit. WB16 asserts
against that snapshot. Never a later
`getEntries()` and never `js()` `fetch`. Keep
the rest of the PASS shape (binding PUT,
transition POST, history GET).

In Protocol **Hunter probe discipline**,
replace "WB16 reads the work-order history
from the network log, never a hand `fetch`"
with: WB16 asserts against a Performance
snapshot taken from bind through WB11 submit,
never a later `getEntries()` and never `js()`
`fetch`.

**WB19b:** Keep the value-bearing converse.
Add: Review is read-only; do not drive the
converse there. The converse is a
value-bearing instance Save, not a pure
Review→Archive move.

- [x] **Step 7: Validate and commit**

Run: `./validate`
Expected: green.

```bash
git add TEST-PLAN.md
git commit -m "Correct TEST-PLAN 2026-08-28 drive notes" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 8: Commit the completed plan

**Doctrine:** Office of the Commit. Tick every
box in this file that the prior tasks completed,
then commit.

**Files:**
- Modify:
  `docs/superpowers/plans/2026-08-28-test-plan-fail-remediation.md`

- [x] **Step 1: Tick remaining boxes** including
  this task's after the commit is prepared.

- [x] **Step 2: Validate**

Run: `./validate`
Expected: green.

- [x] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-08-28-test-plan-fail-remediation.md
git commit -m "Complete 2026-08-28 FAIL remediation plan" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

## Self-review

- Spec coverage: D36/E11/K6 follow → Task 2.
  F19/F20/F23 Shift → Task 3. F38/F38a/F38b/F57a
  Tab → Task 4. F67 panel → Task 5. F67 checkbox
  chord → Task 6. F13/F27/F35/F37b/F50/F38/F55/
  F57/F67 wait/F68–F72/WB4/WB16/WB19b drive →
  Task 7. Dated stubs unmodified. No seed change.
  No `EXPECTED_SLICE_MESSAGE_PAIRS` change.
- No TBD/TODO placeholders in tasks.
- Types: `followTranslateY`, `pointerIsShift`,
  `nextCanvasTabIndex`, `selectionSurvivesRestore`,
  `isDesignerEditableTarget` used consistently.
- `selectionStillPresent` is named so Task 5 does
  not "unify" it with undo's every-id guard.
- Task 4 waits for Task 3 (same file).
- Protocol D36/E11 already require follow; Task 7
  does not rewrite that paragraph.

# 2026-09-02 TEST-PLAN Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Remediate the 2026-09-02 TEST-PLAN walk at FULL
scope plus Layer 2 harness: correct document drift, land
the two confirmed product defects behind red tests, pin
`buildAttributeRefRow`, and add compositor-level Layer 2
reproductions for every driver-suspected FAIL.

**Architecture:** Doc-only commits first (no tests). Then
TDD: Layer 1 pin for the zero-delta click, Layer 2 CDP
test for F12 Space-steal, Layer 1 characterization pin
for R12, then Layer 2 reproductions that either close a
driver artifact (green, no product commit) or become a
real bug (red → fix → green). Dated 2026-09-02 mitigation
stubs stay frozen.

**Tech Stack:** Deno 2.9.6, TypeScript strict, `@std/assert`,
CDP via `tests/browser/fixtures.ts`. Layer 1 `./validate`;
Layer 2 `./test-browser` (needs Chrome).

**Sources:** walk analysis and brief live in the walk
worktree at `.worktrees/2026-09-02-test-plan-walk`
(`docs/superpowers/plans/2026-09-02-test-plan-walk-analysis.md`,
`docs/superpowers/plans/2026-09-02-test-plan-remediation-brief.md`).
Product SHA walked: `04372ead`.

---

## File structure

| File | Role |
|---|---|
| `TEST-PLAN.md` | Drift, scoring, driving notes, pin lines |
| `FLOW-CANVAS.md` | Space-vs-Enter covenant (with F12) |
| `TODO.md` | Deferred / driver-only leftovers |
| `web-app/app/flow-fsm-reduce.ts` | Zero-delta `onPointerUp` |
| `web-app/app/flow-interactions.ts` | Enter-only `canvas-key-activate` |
| `tests/flow-fsm-scenarios.test.ts` | Zero-delta Layer 1 pin |
| `tests/presenter-misc.test.ts` | `buildAttributeRefRow` Layer 1 pin |
| `tests/browser/canvas.ts` | `doubleClick` / `doubleClickAt` |
| `tests/browser/canvas-pan.test.ts` | F12, F14 Layer 2 |
| `tests/browser/canvas-gestures.test.ts` | F23, F26, F28, F37b, AA Layer 2 |

Never edit `docs/superpowers/test-plan-mitigations/2026-09-02-*.md`.

---

## Global constraints

- Work in `.worktrees/2026-09-02-test-plan-remediation`
  on branch `2026-09-02-test-plan-remediation`. Never
  commit on master. Never `-D`. Never force-push.
- One concern per commit. Subject ≈50 chars,
  present-tense imperative. Trailer exactly:
  `Co-Authored-By: Grok 4.6 <noreply@x.ai>`
- Product changes land ONLY behind a red test at
  Layer 1 (`./validate`) or Layer 2 (`./test-browser`).
- `./validate` green before every commit. It works on
  a dirty tree.
- Voice: 78-char max in linted files (`.md` exempt),
  4-space indent, no inline styles, no `org` identifier.
- TDD: watch the new test fail for the named reason
  before writing product code. A pin of existing
  behavior that is already green is the R12 decision
  (characterization), not a TDD violation.
- Layer 2 reproductions: if the new CDP test PASSES,
  the walk FAIL was a driver artifact — commit the
  test, no product change. If it FAILS, it is a real
  bug — fix red → green in that task before moving on.
- Layer 1 single-file:

```bash
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

- Layer 2: `./test-browser` (bundles client, needs
  Chrome). Do not add a new runner.
- Commandments in play: Reliability, Uniformity,
  Clarity, Idempotency (zero-delta is not an edit),
  Simplicity. Abominations to refuse: Unbidden Helper
  Code, Test Weakening, Premature Generalization,
  asking-not-telling in the FSM.
- Patterns: RequestContext first; SafeHtml from
  presenters; snake_case storage / camelCase domain;
  HTTP-verb adapter names; validators at the gate;
  `noUncheckedIndexedAccess`.

---

### Task 1: Commit this plan

**Files:**
- Create: `docs/superpowers/plans/2026-09-02-test-plan-remediation.md`

- [x] **Step 1: Commit the plan as written**

```bash
git add docs/superpowers/plans/2026-09-02-test-plan-remediation.md
git commit -m "Plan the 2026-09-02 TEST-PLAN remediation"
```

No `./validate` needed: markdown only.

---

### Task 2: Driving notes and scoring

**Files:**
- Modify: `TEST-PLAN.md` Driving notes (~124–171) and
  Scoring (~173–179)

Doc only. No tests.

- [x] **Step 1: Extend the Shift-drag note and add F37b / AA33**

Replace the existing Shift-drag bullet (~152–155):

```
- Shift-drag (AA32/F19): if the compositor does not
  deliver Shift on pointer-up, the FSM emits add-node
  instead of add-edge. Record BLOCKED naming that; do
  not FAIL. Layer 1 and Layer 2 pins decide add-edge.
```

with:

```
- Shift-drag (AA32/F19/F23): if the compositor does not
  deliver Shift on pointer-up, the FSM emits add-node
  instead of add-edge. Record BLOCKED naming that; do
  not FAIL. Layer 1 and Layer 2 pins decide add-edge.
  F23's mid-gesture Shift is the same compositor limit.
- AA33/AA34: DEFERRED on AA32 when AA32's stray
  "New State" nodes re-flow the graph and a
  double-click misses Data Capture.
- F37b: after F37a opens a second tab (born hidden),
  re-activate tab A and confirm
  `document.visibilityState === 'visible'` before
  the port-drag. Driving the hidden tab is BLOCKED,
  not FAIL.
```

After the Scoring table (~179), add:

```
Walk-specific: F23 scores BLOCKED like AA32 when
Shift is missing on pointer-up. AA33/AA34 score
DEFERRED on AA32 when stray nodes block targeting.
```

- [x] **Step 2: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Note compositor BLOCKED and DEFERRED scores"
```

---

### Task 3: E10a hide mechanism and A3 human count

**Files:**
- Modify: `TEST-PLAN.md` E10a (~2194–2201) and A3 pin
  (~316–317)

Doc only. `tests/pg-seed.test.ts` already asserts 12
tab-separated human lines. `#project-review-actions`
gains class `.hidden` (`display: none` in
`web-app/app/styles/utilities.css:108`), not the HTML
`hidden` attribute (`web-app/projects/detail.ts:238-246`).

- [x] **Step 1: Correct E10a observable**

Replace:

```
  Observable: `#project-review-actions` /
  `#project-lifecycle-actions` carry `hidden`
  while the inner `.action-bar` keeps its own
  `display:flex`. The objectives section and
  flows sidebar stay visible in edit mode.
```

with:

```
  Observable: `#project-review-actions` /
  `#project-lifecycle-actions` gain the
  `.hidden` class (`display: none` from
  utilities.css), not the HTML `hidden`
  attribute. The inner `.action-bar` keeps
  `display:flex`. The objectives section and
  flows sidebar stay visible in edit mode.
```

- [x] **Step 2: Correct A3 pin count**

Replace:

```
       `sarah.chen@company.com` are specifically
       among the 11 printed lines (the test
       counts lines, not names)
```

with:

```
       `sarah.chen@company.com` are specifically
       among the 12 printed lines, including
       Riley Okafor (the test counts lines, not
       names)
```

- [x] **Step 3: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Correct E10a hide and A3 human count"
```

---

### Task 4: R13/R14 bind-first and WB19a restore

**Files:**
- Modify: `TEST-PLAN.md` R13 (~6432–6458), R14
  (~6460–6471), WB19a (~4133–4152), R16 (~6504–6517)

Doc only. The API refuses a value-bearing transition
on an unbound work order with `ValidationError` →
HTTP 400 (`api/routes.ts` / `api/api.ts`). WB10b
already disables unbound inputs. WB19a mutates the
only seeded Customer Profile instance
(`SEED_INSTANCE_ID`, Company Name "Acme Corp").
Do not seed a second instance (that would move
message-pair counts). Restore after WB19a instead.

- [x] **Step 1: Rewrite R13 to bind-first reality**

Replace the R13 PASS paragraph with:

```
- [x] **R13** From workbox, open the gate-violation work
  order (`#gate0001`, `eOlNZpGQfmCdpSFWXGkzFQ`) at Data
  Capture, unbound. PASS: current node is Data Capture;
  every attribute input is disabled/readonly behind the
  bind prompt (WB10b) — there is no fillable-while-unbound
  path. The typed gate (`validateRecordTransition` on
  CURRENT-node refs) is the durable covenant; CLI pins
  it; constraint failures still surface via
  `WorkboxDetailPresenter.buildViolations` banner. Only
  WO01 (`a7c3e1f9`) is instance-bound — do not bind
  `#gate0001` here (the seeded Customer Profile instance,
  Acme, already has values set).
```

Keep the existing Pin block.

- [x] **Step 2: Rewrite R14 to bind then submit**

Replace the R14 PASS paragraph with:

```
- [x] **R14** Bind `#gate0001` to the seeded Customer
  Profile instance (Company Name "Acme Corp") via the
  bind picker — an existing instance, never a minted
  one — then fill Company Name + Contact Email and
  click submit. PASS: transition succeeds; work order
  advances to Review (does NOT demand Reviewer Notes —
  that is current-node only when leaving Review). A
  value-bearing transition while still unbound is
  refused with 400 (`ValidationError` →
  `HTTP_BAD_REQUEST`), not 409; 409 is rebind.
```

Keep the existing Pin block.

- [x] **Step 3: Instruct WB19a to restore Acme Corp**

After WB19a's PASS paragraph (before its Pin), add:

```
  After PASS, restore the mutated instance's
  Company Name to "Acme Corp" (and any other
  field this case changed). WB19a overwrites
  the only seeded Customer Profile instance;
  R14's bind picker and R16's instance list
  read that value.
```

- [x] **Step 4: Point R16 at the restored seed**

In R16's PASS paragraph, after "Company Name
\"Acme Corp\"", add:

```
  WB19a must have restored that name; a leftover
  "Walk Co B" is this walk's hygiene failure, not
  a missing seed.
```

- [x] **Step 5: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Align R13/R14/R16 to bind-first seed"
```

---

### Task 5: Zero-delta node click (Layer 1)

**Files:**
- Test: `tests/flow-fsm-scenarios.test.ts` (append after
  the existing `'drag node emits move-nodes…'` test
  around line 610)
- Modify: `web-app/app/flow-fsm-reduce.ts` `onPointerUp`
  drag branch (~462–494)

A pointer-down then pointer-up at the same `svgX`/`svgY`
currently emits `move-nodes` with unchanged positions.
`withNodesMoved` then PUTs and advances undo. A click
is not an edit.

- [x] **Step 1: Write the failing test**

Append to `tests/flow-fsm-scenarios.test.ts`:

```typescript
Deno.test(
    'zero-delta node click emits no move-nodes',
    () => {
        const startPositions = new Map([
            ['n1', { x: 100, y: 100 }],
        ]);
        const r = drive(buildState(), [
            {
                kind: 'pointer-down-on-node',
                nodeId: 'n1',
                isPort: false,
                isDraggable: true,
                isShift: false,
                isMeta: false,
                isLocked: false,
                svgX: 110, svgY: 110,
                now: 1000,
                selectedPositions: startPositions,
            },
            {
                kind: 'pointer-up',
                svgX: 110, svgY: 110,
                clientX: 0, clientY: 0,
                isShift: false,
                hoverNodeId: 'n1',
                fromNodePosition: null,
                allNodes: [],
            },
        ]);
        assertStrictEquals(r.state.drag.kind, 'idle');
        assertStrictEquals(
            findAction(r.actions, 'move-nodes'),
            undefined,
        );
        assert(findAction(
            r.actions, 'release-pointer',
        ));
        assertStrictEquals(
            r.state.selection.kind, 'nodes',
        );
        if (r.state.selection.kind === 'nodes') {
            assert(r.state.selection.nodeIds.has('n1'));
        }
    },
);
```

- [x] **Step 2: Run it and watch it fail**

```bash
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
    deno test --frozen --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write --allow-net \
    --allow-run=deno,./serve,./crank,sh,./validate \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    --filter 'zero-delta node click' \
    tests/flow-fsm-scenarios.test.ts
```

Expected: FAIL because `findAction(..., 'move-nodes')`
is a `move-nodes` action with `updates[0] = {nodeId:'n1',
x:100, y:100}`, not `undefined`.

If it passes, the bug is already gone — stop and
re-read `onPointerUp`. Do not "fix" a green test.

- [x] **Step 3: Minimal fix**

In `web-app/app/flow-fsm-reduce.ts` `onPointerUp`,
inside the `state.drag.kind === 'dragging'` branch,
after computing `dx`/`dy` and **before** building
`updates`, idle the drag with no `move-nodes` when
both deltas are 0:

```typescript
    if (state.drag.kind === 'dragging') {
        const dx =
            state.drag.currentPointerX
            - state.drag.startPointerX;
        const dy =
            state.drag.currentPointerY
            - state.drag.startPointerY;
        const next: FsmState = {
            ...state,
            drag: { kind: 'idle' },
        };
        if (dx === 0 && dy === 0) {
            return {
                state: next,
                actions: [
                    { kind: 'release-pointer' },
                    {
                        kind: 'request-update',
                        state: next,
                    },
                ],
            };
        }
        const updates: {
            nodeId: string;
            x: number;
            y: number;
        }[] = [];
        for (const [
            id, init,
        ] of state.drag.initialPositions) {
            updates.push({
                nodeId: id,
                x: init.x + dx,
                y: init.y + dy,
            });
        }
        return {
            state: next,
            actions: [
                { kind: 'move-nodes', updates },
                { kind: 'release-pointer' },
                { kind: 'request-update', state: next },
            ],
        };
    }
```

Do not guard `withNodesMoved`. The FSM is the
covenant site. Leave the existing nonzero drag tests
untouched.

- [x] **Step 4: Re-run the filter — PASS. Then `./validate`.**

- [x] **Step 5: Commit**

```bash
git add tests/flow-fsm-scenarios.test.ts \
    web-app/app/flow-fsm-reduce.ts
git commit -m "Skip move-nodes on a zero-delta click"
```

---

### Task 6: F12 Space-steal (Layer 2)

**Files:**
- Test: `tests/browser/canvas-pan.test.ts`
- Modify: `web-app/app/flow-interactions.ts` document
  `keydown` listener (~869–900) and `handleSpace`
  comment (~820–822)
- Modify: `FLOW-CANVAS.md` Layers / pan paragraph
- Modify: `TEST-PLAN.md` F12 Pin line

Covenant: Space toggles pan whenever the canvas OR a
node/edge in it has focus; Enter opens the panel.
Nodes carry `role="button"`; overriding ARIA
Space-as-activate is deliberate.

- [x] **Step 1: Write the failing Layer 2 test**

Add imports in `canvas-pan.test.ts`: `stays` from
`./fixtures.ts`; `nodeIdNamed`, `nodeSelector` from
`./canvas.ts`.

Append:

```typescript
const STAY_MS = 600;
const PANEL_ABSENT =
    `document.querySelector('.flow-props-panel')`
    + ` === null`;

Deno.test(
    'Space on a focused node toggles pan off'
    + ' and does not open the panel (F12)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, ONBOARDING,
                );
                await page.click(AUTO_FIT);
                await focusCanvas(page);
                await page.key(' ');
                await page.until(
                    PAN_ON, 'pan cursor on',
                );
                const review = await nodeIdNamed(
                    page, 'Review',
                );
                await page.evaluate(
                    `document.querySelector(${
                        JSON.stringify(
                            nodeSelector(review),
                        )
                    }).focus()`,
                );
                await page.key(' ');
                await page.until(
                    `!(${PAN_ON})`,
                    'pan cursor off',
                );
                await stays(
                    page, PANEL_ABSENT, STAY_MS,
                );
            },
        );
    },
);
```

Keep existing tests. Wrap at 78 chars.

- [x] **Step 2: Run `./test-browser` and watch F12 fail**

Expected: pan stays on and/or `.flow-props-panel`
appears, so `until('pan cursor off')` times out or
`stays` throws. Root: document listener
`preventDefault`s Space for a focused node; window
`handleSpace` sees `defaultPrevented` and returns.

If it PASSES, re-read the listener — do not "fix"
a green test.

- [x] **Step 3: Minimal fix**

In `web-app/app/flow-interactions.ts`, gate the
document listener on Enter only:

```typescript
    document.addEventListener(
        'keydown',
        (e) => {
            if (e.key !== 'Enter') return;
            const active =
                document.activeElement;
            if (
                !(active instanceof Element)
            ) return;
            if (
                !wrap.contains(active)
            ) return;
            const nodeId = ancestorAttr(
                active, 'data-node-id',
            );
            const edgeId = ancestorAttr(
                active, 'data-edge-id',
            );
            if (!nodeId && !edgeId) return;
            e.preventDefault();
            dispatch({
                kind:
                    'canvas-key-activate',
                nodeId,
                edgeId,
            });
        },
        { signal },
    );
```

Update `handleSpace`'s comment to:

```
        // a focused node or edge claims Enter,
        // not Space; Space falls through so pan
        // still toggles
```

In `FLOW-CANVAS.md`, after "Pan toggles via Space:
one tap on, one tap off;" add:

```
  Space toggles pan whenever the canvas or a
  node/edge inside it has focus. Enter opens
  the properties panel for the focused node
  or edge. Nodes carry `role="button"`; this
  overrides the ARIA Space-as-activate default
  deliberately — pan is the canvas Space
  binding.
```

On F12's Pin line in `TEST-PLAN.md`, add:

```
       tests/browser/canvas-pan.test.ts
       'Space on a focused node toggles pan off
       and does not open the panel (F12)';
```

Do not change `isFormFocused`. Do not remove
`role="button"` from nodes.

- [x] **Step 4: `./test-browser` PASS, then `./validate`.**

Existing `canvas-keyboard` Enter-opens must stay green.

- [x] **Step 5: Commit**

```bash
git add tests/browser/canvas-pan.test.ts \
    web-app/app/flow-interactions.ts \
    FLOW-CANVAS.md TEST-PLAN.md
git commit -m "Let Space toggle pan when a node is focused"
```

---

### Task 7: R12 `buildAttributeRefRow` Layer 1 pin

**Files:**
- Test: `tests/presenter-misc.test.ts`
- Modify: `TEST-PLAN.md` R12 Pin (~6429–6431)
- No product change unless the pin is red

This is a characterization pin. Green ⇒ R12 was a
driver artifact (panel never opened). Red ⇒ presenter
bug, fix red → green in this task.

- [x] **Step 1: Add the pin tests**

Import `buildAttributeRefRow` next to the existing
`buildNodePanel` import. Import type `RecordAttribute`
from `../web-app/app/adapters/index.ts` and type
`NodeAttribute` from `../api/types.ts` (add to the
existing `GraphNode` import).

Append after the `buildNodePanel renders outgoing
transitions` test:

```typescript
function makeRecordAttribute(
    over: Partial<RecordAttribute> = {},
): RecordAttribute {
    return {
        id: 'attr-company',
        organizationId: 'AjdvjuECVZEgZoFajaIEkg',
        recordId: 'rbfHGatkwQzGZJVXKJEeyw',
        name: 'Company Name',
        attributeType: 'text',
        sortOrder: 0,
        options: [],
        constraints: [],
        readRoles: ['member', 'admin'],
        writeRoles: ['member', 'admin'],
        ...over,
    };
}

Deno.test(
    'buildAttributeRefRow renders name, mode,'
    + ' required, and remove (R12)',
    () => {
        const ref: NodeAttribute = {
            attributeId: 'attr-company',
            mode: 'readonly',
            isRequired: true,
        };
        const out = buildAttributeRefRow(
            ref, makeRecordAttribute(), false,
        ).toString();
        assertMatch(
            out, /class="[^"]*flow-attribute-ref-row/,
        );
        assertMatch(
            out, /data-attribute-id="attr-company"/,
        );
        assertMatch(out, /Company Name/);
        assertMatch(
            out,
            /data-action="update-attribute-mode"/,
        );
        assertMatch(
            out,
            /<option value="readonly"[^>]*selected/,
        );
        assertMatch(
            out,
            /data-action="update-attribute-required"[^>]*checked/,
        );
        assertMatch(
            out,
            /data-action="remove-attribute-ref"/,
        );
        assertNotMatch(out, / disabled/);
    },
);

Deno.test(
    'buildAttributeRefRow disables controls'
    + ' when the flow is locked (R12)',
    () => {
        const ref: NodeAttribute = {
            attributeId: 'attr-company',
            mode: 'editable',
            isRequired: false,
        };
        const out = buildAttributeRefRow(
            ref, makeRecordAttribute(), true,
        ).toString();
        assertMatch(
            out,
            /data-action="update-attribute-mode"[^>]*disabled/,
        );
        assertMatch(
            out,
            /data-action="update-attribute-required"[^>]*disabled/,
        );
        assertMatch(
            out,
            /data-action="remove-attribute-ref"[^>]*disabled/,
        );
    },
);

Deno.test(
    'buildNodePanel picker lists only'
    + ' unreferenced attributes (R12)',
    () => {
        const referenced = makeRecordAttribute({
            id: 'attr-company',
            name: 'Company Name',
        });
        const free = makeRecordAttribute({
            id: 'attr-industry',
            name: 'Industry',
        });
        const node = makeNode({
            attributes: [{
                attributeId: 'attr-company',
                mode: 'editable',
                isRequired: true,
            }],
        });
        const out = buildNodePanel(
            node, [], false, [], [],
            [referenced, free],
        ).toString();
        assertMatch(
            out, /data-attribute-id="attr-company"/,
        );
        assertMatch(
            out,
            /id="prop-node-attribute-picker"/,
        );
        assertMatch(
            out,
            /<option value="attr-industry"/,
        );
        assertNotMatch(
            out,
            /<option value="attr-company"/,
        );
    },
);
```

`attributeType: 'text'` must satisfy `AttributeType`.
If `deno check` rejects, import the type and use a
`satisfies` or a value the union already names.

Wrap any assertion regex that would exceed 78 chars.

- [x] **Step 2: Run the filter**

```bash
# same deno test invocation as Task 5
--filter 'R12' tests/presenter-misc.test.ts
```

**If GREEN:** R12 is driver-only. Update TEST-PLAN.md
R12 Pin from "carries no CLI test today" to name these
three tests. Skip product code. Go to Step 4.

**If RED:** the presenter is wrong. Fix
`buildAttributeRefRow` / `buildNodePanel` minimally
until green. Do not weaken the assertions.

- [x] **Step 3: `./validate`.**

- [x] **Step 4: Commit**

```bash
git add tests/presenter-misc.test.ts TEST-PLAN.md
# plus presenter files only if Step 2 was red
git commit -m "Pin buildAttributeRefRow node-panel markup"
```

---

### Task 8: `doubleClick` helper, F26, F28 (Layer 2)

**Files:**
- Modify: `tests/browser/canvas.ts`
- Modify: `tests/browser/canvas-gestures.test.ts`
- Modify: `TEST-PLAN.md` F26 / F28 Pin lines

Customer Onboarding's bbox-center misses a bezier.
Target the edge **label rect** (`.flow-edge rect`).
Layout Test: `'Layout Test: Proposal Review Cycle'`.

- [x] **Step 1: Add helpers to `tests/browser/canvas.ts`**

Import type `Point` from `./fixtures.ts` (Page is
already imported).

```typescript
export const LAYOUT_TEST =
    'Layout Test: Proposal Review Cycle';

export async function doubleClick(
    page: Page, selector: string,
): Promise<void> {
    const p = await page.center(selector);
    await doubleClickAt(page, p);
}

export async function doubleClickAt(
    page: Page, pt: Point,
): Promise<void> {
    await page.press(pt);
    await page.release(pt);
    await page.press(pt);
    await page.release(pt);
}

export function edgeLabelSelector(): string {
    return `${EDGE} rect`;
}
```

No product file changes in this step.

- [x] **Step 2: Write F26 and F28 tests**

Append to `tests/browser/canvas-gestures.test.ts`.
Import `doubleClick`, `doubleClickAt`, `LAYOUT_TEST`,
`edgeLabelSelector` from `./canvas.ts`.

```typescript
Deno.test(
    'an edge-label click selects and a double-click'
    + ' opens Transition Properties (F26)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, LAYOUT_TEST,
                );
                const label = edgeLabelSelector();
                await page.waitFor(label);
                await page.click(label);
                await page.until(
                    `document.querySelector(`
                    + `'${EDGE}[aria-current="true"]')`
                    + ` !== null`,
                    'edge selected',
                );
                await doubleClick(page, label);
                await page.waitFor('.flow-props-panel');
                const title = await page.evaluate<
                    string | null
                >(
                    `document.querySelector(`
                    + `'.flow-props-panel h3')`
                    + `?.textContent ?? null`,
                );
                assert(
                    (title ?? '').includes(
                        'Transition Properties',
                    ),
                    `panel title was ${title}`,
                );
            },
        );
    },
);

Deno.test(
    'an edge selection enables Delete and'
    + ' removes the edge (F28)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, LAYOUT_TEST,
                );
                const label = edgeLabelSelector();
                await page.waitFor(label);
                const before = await edgeCount(page);
                await page.click(label);
                await page.until(
                    `document.querySelector(`
                    + `'${EDGE}[aria-current="true"]')`
                    + ` !== null`,
                    'edge selected',
                );
                const disabled =
                    await page.evaluate<boolean>(
                        `document.querySelector(`
                        + `'[data-action="delete-selected"]')`
                        + `?.hasAttribute('disabled')`
                        + ` === true`,
                    );
                assertStrictEquals(disabled, false);
                await page.click(
                    '[data-action="delete-selected"]',
                );
                await page.until(
                    `document.querySelectorAll(`
                    + `'${EDGE}').length === ${
                        before - 1
                    }`,
                    'one fewer edge',
                );
            },
        );
    },
);
```

- [x] **Step 3: `./test-browser`**

**If both PASS:** walk F26/F28 were mis-hits. Commit
the tests. Update TEST-PLAN F26/F28 Pin lines to name
them. No product change.

**If either FAILS:** it is a product bug. Reproduce
the failure, write nothing extra, fix red → green
(likely hit-target or `#canDelete`). Do not weaken
the test.

- [x] **Step 4: `./validate`. Commit.**

```bash
git add tests/browser/canvas.ts \
    tests/browser/canvas-gestures.test.ts TEST-PLAN.md
git commit -m "Drive edge select, panel, and delete in CDP"
```

---

### Task 9: F23 mid-drag Shift (Layer 2)

**Files:**
- Modify: `tests/browser/canvas-gestures.test.ts`
- Modify: `TEST-PLAN.md` F23 Pin line

Customer Onboarding already has Review→Archive and
Review→Data Capture. The absent pair is Data Capture
→ Archive (same pair the existing shift-drag test
uses). This test starts **without** Shift and holds
it mid-gesture.

- [x] **Step 1: Write the test**

```typescript
Deno.test(
    'Shift held mid port-drag commits an edge'
    + ' and adds no node (F23)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, ONBOARDING,
                );
                const nodes = await nodeCount(page);
                const edges = await edgeCount(page);
                const capture = await nodeIdNamed(
                    page, 'Data Capture',
                );
                const archive = await nodeIdNamed(
                    page, 'Archive',
                );
                const port = await page.center(
                    portSelector(capture),
                );
                const target = await page.center(
                    nodeSelector(archive),
                );
                await page.press(port);
                await page.move({
                    x: port.x
                        + (target.x - port.x) * 0.4,
                    y: port.y
                        + (target.y - port.y) * 0.4,
                });
                await page.keyDown('Shift');
                await page.move(target, SHIFT);
                await page.release(target, SHIFT);
                await page.keyUp('Shift');
                await page.until(
                    `document.querySelectorAll(`
                    + `'${EDGE}').length === ${
                        edges + 1
                    }`,
                    'one more edge',
                );
                assertStrictEquals(
                    await nodeCount(page), nodes,
                );
            },
        );
    },
);
```

`SHIFT` is already imported in this file.

- [x] **Step 2: `./test-browser`**

**PASS:** product honors mid-drag Shift when the
compositor actually holds it. Walk F23 stays BLOCKED
at the compositor; this pin decides the product.
Commit the test.

**FAIL (extra node, no edge):** product does not
honor mid-drag Shift. That is a real bug — fix
`shift-key` / `finishConnect` red → green.

- [x] **Step 3: Update F23 Pin, `./validate`, commit**

```bash
git commit -m "Hold Shift mid port-drag to commit an edge"
```

---

### Task 10: F14 zoom then panel close (Layer 2)

**Files:**
- Modify: `tests/browser/canvas-pan.test.ts`
- Modify: `TEST-PLAN.md` F14 Pin line

Uses `doubleClick` from Task 8.

- [x] **Step 1: Write the test**

Import `doubleClick`, `nodeIdNamed`, `nodeSelector`
(F12 already added `nodeIdNamed` / `nodeSelector`).

```typescript
Deno.test(
    'Zoom-in viewBox survives panel open and close'
    + ' with Auto Fit off (F14)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, ONBOARDING,
                );
                await page.click(AUTO_FIT);
                const viewBoxOf =
                    `document.querySelector('${CANVAS}')`
                    + `.getAttribute('viewBox')`;
                const before = await page.evaluate<
                    string | null
                >(viewBoxOf);
                await page.click(
                    '[data-action="zoom-in"]',
                );
                await page.until(
                    `${viewBoxOf} !== ${
                        JSON.stringify(before)
                    }`,
                    'viewBox zoomed',
                );
                const zoomed = await page.evaluate<
                    string | null
                >(viewBoxOf);
                const review = await nodeIdNamed(
                    page, 'Review',
                );
                await doubleClick(
                    page, nodeSelector(review),
                );
                await page.waitFor('.flow-props-panel');
                await page.click(
                    '[data-action="close-panel"]',
                );
                await page.until(
                    `document.querySelector(`
                    + `'.flow-props-panel') === null`,
                    'panel closed',
                );
                assertStrictEquals(
                    await page.evaluate<string | null>(
                        viewBoxOf,
                    ),
                    zoomed,
                );
            },
        );
    },
);
```

- [x] **Step 2: `./test-browser`**

**PASS:** camera code is clean; walk F14 was a missed
Zoom-in click. Commit the test.

**FAIL:** if viewBox never changes after Zoom-in, the
click missed in CDP too — fix the selector
(`[data-action="zoom-in"]` is the toolbar button in
`buildToolbar`). If it changes then fails to restore,
that is a camera bug — fix `applyPanelTransition`
red → green.

- [x] **Step 3: Pin line, `./validate`, commit**

```bash
git commit -m "Restore viewBox after zoom then panel close"
```

---

### Task 11: F37b auto-layout port-drag + Undo (Layer 2)

**Files:**
- Modify: `tests/browser/canvas-gestures.test.ts`
- Modify: `TEST-PLAN.md` F37b Pin line

Customer Onboarding seeds `is_auto_layout: true`.
Fixtures always drive the attached visible page, so
this removes the hidden-tab hypothesis.

- [x] **Step 1: Write the test**

```typescript
Deno.test(
    'plain port-drag on an auto-layout flow adds a'
    + ' node and Undo restores (F37b)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, ONBOARDING,
                );
                const nodes = await nodeCount(page);
                const review = await nodeIdNamed(
                    page, 'Review',
                );
                const port = await page.center(
                    portSelector(review),
                );
                const svg = await page.rect(CANVAS);
                await page.drag(port, {
                    x: svg.x + svg.width * 0.5,
                    y: svg.y + svg.height * 0.92,
                });
                await page.until(
                    `document.querySelectorAll(`
                    + `'${NODE}').length === ${
                        nodes + 1
                    }`,
                    'one more node',
                );
                await page.click(
                    '[data-action="undo"]',
                );
                await page.until(
                    `document.querySelectorAll(`
                    + `'${NODE}').length === ${
                        nodes
                    }`,
                    'undo restored node count',
                );
            },
        );
    },
);
```

- [x] **Step 2: `./test-browser`**

**PASS:** walk F37b was the hidden second tab. Commit.

**FAIL:** product bug on auto-layout add-node / undo.
Fix red → green. `add-node` has no Auto-Layout branch
today; a failure here is new evidence.

- [x] **Step 3: Pin line, `./validate`, commit**

```bash
git commit -m "Undo a port-drag node on an auto-layout flow"
```

---

### Task 12: AA32/AA33/AA34 compositor writes (Layer 2)

**Files:**
- Modify: `tests/browser/canvas-gestures.test.ts`
- Modify: `TEST-PLAN.md` AA32/AA33/AA34 Pin lines

Seeded Customer Onboarding already has Review→Data
Capture (cycle) and Review→Archive (forward), so those
pairs cannot be added again. Drive the absent pair
Data Capture → Archive with Shift held (AA32
mechanism). Data Capture has one free attribute; Review
has seven. Add two refs on **Review** (F25's reason)
with distinct mode/required.

- [x] **Step 1: Write the test**

```typescript
Deno.test(
    'Shift-drag adds an edge and Review accepts'
    + ' two attribute refs (AA32/AA33/AA34)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, ONBOARDING,
                );
                const nodes = await nodeCount(page);
                const edges = await edgeCount(page);
                const capture = await nodeIdNamed(
                    page, 'Data Capture',
                );
                const archive = await nodeIdNamed(
                    page, 'Archive',
                );
                const review = await nodeIdNamed(
                    page, 'Review',
                );
                const port = await page.center(
                    portSelector(capture),
                );
                const target = await page.center(
                    nodeSelector(archive),
                );
                await page.keyDown('Shift');
                await page.drag(
                    port, target, { modifiers: SHIFT },
                );
                await page.keyUp('Shift');
                await page.until(
                    `document.querySelectorAll(`
                    + `'${EDGE}').length === ${
                        edges + 1
                    }`,
                    'one more edge',
                );
                assertStrictEquals(
                    await nodeCount(page), nodes,
                );
                await doubleClick(
                    page, nodeSelector(review),
                );
                await page.waitFor(
                    '#prop-node-attribute-picker',
                );
                const ids = await page.evaluate<
                    string[]
                >(
                    `[...document.querySelectorAll(`
                    + `'#prop-node-attribute-picker`
                    + ` option')].map(o => o.value)`
                    + `.filter(Boolean)`,
                );
                assert(ids.length >= 2, 'two free attrs');
                const first = ids[0]!;
                const second = ids[1]!;
                await page.evaluate(
                    `(() => {
                        const s = document.querySelector(
                            '#prop-node-attribute-picker');
                        s.value = ${JSON.stringify(first)};
                        s.dispatchEvent(new Event(
                            'change', { bubbles: true }));
                    })()`,
                );
                await page.waitFor(
                    `.flow-attribute-ref-row`
                    + `[data-attribute-id="${first}"]`,
                );
                await page.evaluate(
                    `(() => {
                        const s = document.querySelector(
                            '#prop-node-attribute-picker');
                        s.value = ${
                            JSON.stringify(second)
                        };
                        s.dispatchEvent(new Event(
                            'change', { bubbles: true }));
                    })()`,
                );
                await page.waitFor(
                    `.flow-attribute-ref-row`
                    + `[data-attribute-id="${second}"]`,
                );
                await page.evaluate(
                    `(() => {
                        const sel = document.querySelector(
                            '.flow-attribute-ref-row`
                    + `[data-attribute-id="${first}"]`
                    + ` [data-action="update-attribute-mode"]');
                        sel.value = 'readonly';
                        sel.dispatchEvent(new Event(
                            'change', { bubbles: true }));
                        const box = document.querySelector(
                            '.flow-attribute-ref-row`
                    + `[data-attribute-id="${second}"]`
                    + ` [data-action="update-attribute-required"]');
                        box.checked = true;
                        box.dispatchEvent(new Event(
                            'change', { bubbles: true }));
                    })()`,
                );
                const mode = await page.until<string>(
                    `document.querySelector(`
                    + `'.flow-attribute-ref-row`
                    + `[data-attribute-id="${first}"]`
                    + ` [data-action="update-attribute-mode"]')`
                    + `?.value`,
                    'mode readonly',
                );
                const required =
                    await page.evaluate<boolean>(
                        `document.querySelector(`
                        + `'.flow-attribute-ref-row`
                        + `[data-attribute-id="${second}"]`
                        + ` [data-action="update-attribute-required"]')`
                        + `?.checked === true`,
                    );
                assertStrictEquals(mode, 'readonly');
                assertStrictEquals(required, true);
            },
        );
    },
);
```

Fix template-string quoting so the evaluate strings
are valid JS and every source line stays ≤78 chars.
If a quoted selector cannot wrap, split with `+`.

- [x] **Step 2: `./test-browser`**

**PASS:** attribute-ref writes land on Review; Shift
edge write lands. Walk AA33/AA34 stay DEFERRED on
AA32 targeting; this pin decides the writes. Commit.

**FAIL:** product bug on add-edge or add-attribute-ref
under compositor input. Fix red → green.

- [x] **Step 3: Pin lines, `./validate`, commit**

```bash
git commit -m "Shift-drag an edge and add attribute refs"
```

---

### Task 13: TODO.md triage

**Files:**
- Modify: `TODO.md` `## Later work`

Do not edit dated 2026-09-02 stubs. Implementation
tracking lives here.

- [x] **Step 1: Append later-work bullets**

Add, each with an oracle:

```
- 2026-09-02 walk F23/AA32: compositor cannot hold
  Shift across a mouse gesture. Layer 1 pins and
  `tests/browser/canvas-gestures.test.ts` 'Shift held
  mid port-drag…' decide the product. Score BLOCKED
  when Shift is missing on pointer-up —
  TEST-PLAN.md Driving notes
- 2026-09-02 walk AA33/AA34: DEFERRED on AA32 stray
  nodes. Attribute-ref writes: Task 7 pin + Task 12
  CDP test
- 2026-09-02 walk F37b: re-activate tab A after F37a;
  Layer 2 pin
  `tests/browser/canvas-gestures.test.ts` 'plain
  port-drag on an auto-layout flow…'
- 2026-09-02 walk R12: driver (panel never opened)
  once `buildAttributeRefRow` Layer 1 pin is green;
  if that pin was red, this bullet is deleted by
  the product fix
```

Adjust the R12 bullet to match Task 7's actual
outcome (green pin vs product fix).

- [x] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "Triage the 2026-09-02 walk leftovers"
```

---

### Task 14: Tick the plan and land the gate

**Files:**
- Modify: this plan (check every `- [ ]` that shipped)

- [x] **Step 1: Tick completed steps in this plan.**

- [x] **Step 2: `./validate` then `./test-all`.**

`./test-all` is `./validate` + `./test-browser`.
Chrome required. Dirty tree is fine for validate;
`./test-all` before a walk/build.

- [x] **Step 3: Commit the ticked plan**

```bash
git add docs/superpowers/plans/2026-09-02-test-plan-remediation.md
git commit -m "Tick the 2026-09-02 remediation plan"
```

- [x] **Step 4: Land when master has not moved**

```bash
cd /Users/tmornini/code/fusion-angle
git merge --ff-only 2026-09-02-test-plan-remediation
```

Do not `git worktree remove` or `git branch -d`
unless the operator asks. `--ff-only` fails if
master moved — rebase the worktree and retry.

---

## Self-review

1. **Spec coverage (brief §9):** Task 2–4 = doc
   corrections §8. Task 5 = zero-delta. Task 6 = F12.
   Task 7 = R12 pin. Tasks 8–12 = doubleClick + §6
   Layer 2. Task 4 = R16/WB19a restore (no second
   instance). Task 13–14 = TODO + gates.
2. **Placeholders:** none. Every test is full source.
3. **Frozen stubs:** never listed under Files.
4. **Type names:** `FsmInput` `pointer-down-on-node` /
   `pointer-up`, `buildAttributeRefRow(ref, attribute,
   isLocked)`, `SHIFT = 8`, `stays(page, expr, ms)`,
   `LAYOUT_TEST` as the seeded Layout Test name.

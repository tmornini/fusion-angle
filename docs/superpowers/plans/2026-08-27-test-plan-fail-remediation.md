# Test-Plan FAIL Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Make the 2026-08-27 TEST-PLAN FAIL cluster
and the A2 drift candidate pass on the next run — persist
status-transition toasts across `navigateTo`, complete
list reorder under compositor mouse, pin the WB19b /
I6 / A2 covenants, and rewrite the F-cluster drive notes
so hunters exercise the product that already exists.

**Architecture:** Eight tasks, one commit each, on master
(no worktrees, no branches, linear history). Product
changes ride TDD (red pin → fix → green). TEST-PLAN
wording rides one commit after the product pins, so the
document describes what is already true. Dated mitigation
stubs stay frozen.

**Tech Stack:** TypeScript ES2024 strict
(`node --strip-types`), `node:test` on the memory
backend, no frameworks. Gate: `./validate` (tsc, two-TZ
tests, 78-char lint, `org` ban, retired-vocab lint, doc
line-count ceilings, later-work single-home gate,
SVG/API doc drift checks).

**Spec:** The five mitigation stubs (already committed at
`5755b6e7`):
`docs/superpowers/test-plan-mitigations/2026-08-27-D-D19.md`,
`2026-08-27-E-E11.md`,
`2026-08-27-F-F16.md`,
`2026-08-27-F2-WB19b.md`,
`2026-08-27-I-I6.md`
plus A2 as reported. Where a stub and a Ruling
disagree, the Ruling wins.

## Global Constraints

- **Base:** master at `5755b6e7` (mitigation-stub
  commit). Work directly on master; never branch, never
  merge, never push. No worktrees.
- **One concern per commit.** Subject ≈50 chars,
  present-tense imperative, no body prose. Every commit
  message ends with exactly this trailer line:
  `Co-Authored-By: Grok 4.6 <noreply@x.ai>`
- **`./validate` green before every commit.** It works on
  a dirty tree. A red gate aborts the task — fix before
  committing.
- **Voice:** 78-char max lines in every file `./validate`
  lints; 4-space indent; no trailing whitespace; final
  newline; no inline styles; no `org` abbreviation in
  identifiers — always `organization`.
- **Tests:** red before green where a task says red;
  never weaken an existing assertion. Single-file run:
  `TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \`
  `node --strip-types --import ./tests/hmac-test-key.ts \`
  `--test tests/<file>.test.ts`
  Full suite: `./test`. `tsc` does not type-check
  `tests/` (include stops at `web-app/`, `api/`,
  `shared/`).
- **Never edit** dated specs or plans under
  `docs/superpowers/` except this plan file. The five
  stubs at `5755b6e7` stay frozen. The F-F1 stolen-
  session stub and the 2026-08-26 F45/F56 stubs stay
  frozen too.
- **Never touch** `EXPECTED_SLICE_MESSAGE_PAIRS`,
  `EXPECTED_MESSAGE_PAIR_COUNT`, or garden/mock-seed
  counts.
- **This plan file is committed up front** (Task 1).
  Executors tick checkboxes in the tracked file. Task 8
  commits the fully ticked state. No task builds or
  serves. Browser re-verification belongs to the next
  TEST-PLAN run.
- **Doctrine riders:** validators at the gate; SafeHtml
  from presenters; RequestContext first argument;
  snake_case wire / camelCase domain; HTTP-verb adapter
  naming; no untyped `any` from external boundaries;
  transaction bodies await only row ops;
  `noUncheckedIndexedAccess` — index access is
  `T | undefined`.

## Rulings

1. **D19/D30 are a product bug.**
   `web-app/ideas/detail.ts` `transitionIdea` calls
   `showToast` then `navigateTo('ideas')`. `navigateTo`
   is `window.location.href` (`adapters/location.ts`
   `putLocation`). The toast lives on `document.body`
   and dies with the page. The list badges flipped
   because the write landed. Fix: persist the pending
   toast in `sessionStorage` (same tab, survives
   `location.href`, not a cross-tab StorageEvent) and
   replay it in `bootApp`. Clear on dismiss so a toast
   that already played does not revive on the next
   unrelated navigation. Members/flows/workbox
   toast-then-navigate sites inherit this for free —
   Uniformity, not extra scope.

2. **E11 is HTML5 DnD without a drop.**
   `initDragReorder` sets `draggable="true"` and
   commits only on the `drop` event. TEST-PLAN Protocol
   already calls E11 compositor-mouse driveable.
   Compositor pointerdown on a draggable card starts
   native DnD far enough to paint opacity 0.4 and the
   indicator, then CDP never fires `drop`, so there is
   no PUT and order stays `1.75/2/3`. D36/D37/K6 share
   this module; Protocol currently exempts them as
   synthetic-DataTransfer. Convert `initDragReorder` to
   pointer capture (`pointerdown` on `.drag-handle`,
   `pointermove` for the indicator, `pointerup` for
   `onReorder`). Do not set `draggable`. Keyboard
   arrows stay. D36/D37/K6 become compositor-driveable
   too; Task 7 drops the synthetic-DT exemption.

3. **F-F1 (stolen D Admin chip on the F CDP) is a
   driver stub, not this campaign.** Several F FAILs
   may have been that session. This plan still
   remediates the product and TEST-PLAN gaps that would
   fail on a clean F Admin session. Do not "fix"
   hunter isolation here.

4. **F16/F34 are live-transform vs Auto Layout snap.**
   F-slice seed (`api/test-plan-slices.ts` flow body)
   is `is_auto_layout: true`, `is_auto_fit: true`,
   `is_locked: false`. Node body-drag starts on
   pointerdown (`onNodePointerDown`) and
   `renderDragFrame` writes `transform` under rAF.
   Drop with Auto Layout on re-lays out (F17). F16's
   PASS is the transform following the pointer DURING
   the drag, not the post-drop layout. F34 already
   requires a non-auto-layout flow. Task 7 writes that
   drive note. No canvas FSM change.

5. **F25 empty picker is the F-slice fixture.**
   Capture and Review already reference both
   `f-attr-1` and `f-attr-2`.
   `buildNodePanel` lists only unbound attributes and
   disables the select when none remain. Create and
   Archive have empty `attributes` arrays — pick those
   (or a New State from F15). Do not unbind Capture;
   work orders need those required attrs. Task 7 only.

6. **F26 has no `dblclick` listener.** The FSM opens
   the panel on a second `pointer-down-on-edge` within
   `DBLCLICK_MS` (400). Drive two compositor
   pointerdowns, same as F11. Task 7 only.

7. **F38/F38a Tab is chrome-first, not missing
   tabindex.** Nodes already render
   `tabindex="0"` and `aria-current="true"` on
   selection; `focusin` dispatches `canvas-focus`.
   Tab from the document start walks the sidebar
   first. Drive: focus a `.flow-node`, assert
   `aria-current`, then Tab to the next node. Task 7
   only.

8. **F40 gold is `--accent-text` on
   `.flow-canvas-locked`.** Seed starts unlocked.
   First toggle must lock (ports hidden, stroke
   `hsl(var(--accent-text))` — hue 48). F53
   "flow locked, no ports" is the F40 cascade. Task 7
   names the class, not a CSS `gold` literal.

9. **F45's 11-step undo is already pinned.**
   `tests/flow-undo-cursor.test.ts` `'undo cursor:
   eleven saves walk eleven undos — N10 back to
   genesis, no cap'` exists. `nowUtc` is strictly
   monotonic per realm, so the request_at Set cannot
   collapse two edits. The hunter skipped the walk.
   Task 7 restates: wait for the canvas name to
   change, not merely HTTP 201 (already in the case).
   **Do not change `resolveFlowUndoTarget`.**

10. **F46 is the same drive as F45.** Opening a flow
    does not `#queueSave` (`withLayoutReconciled` is
    camera/layout only). Undo history is the flow's
    own pairs. If a clean F Admin session still leaves
    names after Undo, that is a NEW product bug —
    stop and report; do not pre-write an API patch.

11. **F47–F57 Space is focus, not a broken FSM.**
    `handleSpace` is window `keydown`; it returns
    before `preventDefault` when `isFormFocused()`
    (input/textarea/select/**button**/a). After
    clicking Auto-Fit, focus stays on that `button`,
    so Space activates the switch and never
    `space-toggle` — no pan, no Disable Auto-Fit
    toast. F56 already forbids a canvas click to move
    focus (that starts a pan). F47/F55 inherit: focus
    `svg.flow-canvas` via Tab or `js()` with no
    `pointerdown` on the canvas, then send Space.
    Mid-gesture Space is already a no-op in
    `onSpaceToggle` (`tests/flow-fsm-reduce.test.ts`).
    F51/F52 fail when the compositor never entered
    `dragging`/`selecting` (see Ruling 4). F57:
    `#prop-node-name` is an `input`; `isFormFocused`
    is true; do not `preventDefault`. Drive with the
    input actually focused. Task 7 only. **Do not
    remove `button` from `isFormFocused`.**

12. **WB19b stub rewrote the covenant.** TEST-PLAN
    converse is a **value-bearing** transition then a
    stale instance PATCH → 412. A pure Review→Archive
    move forbids If-Match and does not append an
    instance revision, so a held etag still matches
    and Save 201s. That 201 is correct. Do not 412 a
    pure-move aftermath. Pin both directions in CLI;
    Task 7 names "value-bearing" in the converse
    sentence and forbids using a pure Archive as the
    converse.

13. **I6 OS live-update is the `change` event.**
    `initListeners` already `subscribeMediaQuery`s
    `(prefers-color-scheme: dark)` and applies when
    preference is `system`. Cross-tab StorageEvent
    already updates `data-theme` and the icon (pinned
    in `tests/state-theme-icon.test.ts`). CDP
    `Emulation.setEmulatedMedia` updates
    `matchMedia.matches` without dispatching
    `change`. Polling is the Sin of Polling. Pin the
    change-event path. Task 7: after emulate, the
    hunter dispatches
    `new MediaQueryListEvent('change', { matches })`
    or uses a real OS toggle. The System **glyph**
    stays the monitor; `data-theme` flips.

14. **A2 is 29 PAGE_REGISTRY HTML files.**
    `PAGE_REGISTRY` has 29 entries including
    `api-documentation/index.html`. Root
    `web-app/index.html` is extra ("plus root"). Verb/
    status rooms under `api-documentation/` are not
    the 29. The hunter counted root inside the 29,
    then added the api-doc index to get 30. Pin
    `Object.keys(PAGE_REGISTRY).length === 29` and
    that the set of `sourceDir/sourceFile.html`
    includes `api-documentation/index.html`. Task 7
    says the 29 do not include root.

15. **No F canvas product commit this campaign**
    except what Task 3's shared reorder module
    already is. F45/F46/F16/F25/F26/F38/F40/F47–F57
    are Rulings 3–11. If a Task 7 drive note would
    describe a lie, stop — the Ruling was wrong.

## File structure

| File | Responsibility |
|---|---|
| `docs/superpowers/plans/2026-08-27-test-plan-fail-remediation.md` | This plan (Task 1, Task 8) |
| `web-app/app/storage-keys.ts` | `STORAGE_KEY_PENDING_TOAST` |
| `web-app/app/toast.ts` | Persist, replay, clear |
| `web-app/app/app-boot.ts` | Replay at boot |
| `tests/toast-pending.test.ts` | Red pin for persist+replay |
| `tests/fusion-angle-identifiers.test.ts` | Key string pin |
| `web-app/app/drag-reorder.ts` | Pointer capture reorder |
| `tests/api-work-order-transition-instance.test.ts` | WB19b etag pin |
| `tests/state-theme-icon.test.ts` | I6 change-event pin |
| `tests/page-registry.test.ts` | A2 count pin |
| `TEST-PLAN.md` | Drive notes + A2 count |

## Dependency graph

| # | Task | Primary files |
|---|---|---|
| 1 | Commit this plan | `docs/superpowers/plans/` |
| 2 | Persist toasts across navigation | `toast.ts`, `app-boot.ts`, tests |
| 3 | Pointer-driven list reorder | `drag-reorder.ts` |
| 4 | Pin pure-move vs instance etag | `api-work-order-transition-instance.test.ts` |
| 5 | Pin system theme on media change | `state-theme-icon.test.ts` |
| 6 | Pin PAGE_REGISTRY HTML count | `page-registry.test.ts` |
| 7 | Correct TEST-PLAN drive and counts | `TEST-PLAN.md` |
| 8 | Commit the completed plan | this file |

```
1 → everything (O: plan enters history first)
2, 3, 4, 5, 6 are disjoint (any order in wave B)
2 → 7, 3 → 7, 4 → 7, 5 → 7, 6 → 7
    (S: Task 7 wording is true only after those pins)
7 → 8
```

Waves: A = 1; B = 2,3,4,5,6; C = 7; D = 8.
Default order is 1…8.

### Execution protocol

1. Follow superpowers:subagent-driven-development:
   fresh implementer per task, review per task.
2. One implementer at a time. No worktrees.
3. Each task ends: `./validate` green → commit with
   the task's message + trailer → tick boxes here.
4. Every implementer AND reviewer prompt begins with
   the literal phrase `Go to Medium Church!` then the
   Voice / Commandments / Abominations / Patterns
   from AGENTS.md (RequestContext first, SafeHtml,
   snake_case wire, HTTP-verb adapters, validators
   at the gate, no `any`, 78-char lines).

---

### Task 1: Commit this plan

**Doctrine:** Office of the Commit (ABC). Risks
nothing.

**Files:**
- Create:
  `docs/superpowers/plans/2026-08-27-test-plan-fail-remediation.md`
  (copy of this document)

- [x] **Step 1: Copy the plan into docs/**

Copy this session plan file to
`docs/superpowers/plans/2026-08-27-test-plan-fail-remediation.md`
if it is not already there. Do not add a prose body
beyond what is already in the document.

- [x] **Step 2: Validate**

Run: `./validate`
Expected: green.

- [x] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-08-27-test-plan-fail-remediation.md
git commit -m "Add FAIL-cluster remediation plan" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 2: Persist toasts across navigation

**Doctrine:** Commandments I (Reliability), III
(Uniformity), V (Clarity). Risks Unbidden Helper
(no toast framework), Swallowed Failures (corrupt
pending JSON must throw, not vanish), Default
Values (no silent `?? ''`).

**Files:**
- Modify: `web-app/app/storage-keys.ts`
- Modify: `web-app/app/toast.ts`
- Modify: `web-app/app/app-boot.ts`
- Modify: `tests/fusion-angle-identifiers.test.ts`
- Create: `tests/toast-pending.test.ts`

**Interfaces:**
- Consumes: existing `showToast(message, variant)`.
- Produces: `replayPendingToast()`; pending key
  `fusion-angle:pending-toast`. `bootApp` calls
  replay after `initListeners`.

- [x] **Step 1: Write the failing tests**

Append to `tests/fusion-angle-identifiers.test.ts`
inside the existing `'storage keys use the
fusion-angle prefix'` test, after the log-level
assertion:

```typescript
    assert.equal(
        STORAGE_KEY_PENDING_TOAST,
        'fusion-angle:pending-toast',
    );
```

Add the import of `STORAGE_KEY_PENDING_TOAST`.

Create `tests/toast-pending.test.ts`:

```typescript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    STORAGE_KEY_PENDING_TOAST,
} from '../web-app/app/storage-keys.ts';
import {
    showToast,
    replayPendingToast,
} from '../web-app/app/toast.ts';

type Store = {
    getItem: (k: string) => string | null;
    setItem: (k: string, v: string) => void;
    removeItem: (k: string) => void;
};

function installDom(): {
    store: Map<string, string>;
    messages: string[];
} {
    const store = new Map<string, string>();
    const messages: string[] = [];
    const g = globalThis as Record<string, unknown>;
    const session: Store = {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => { store.set(k, v); },
        removeItem: (k) => { store.delete(k); },
    };
    g.sessionStorage = session;
    const bodyChildren: unknown[] = [];
    function el(tag: string): Record<string, unknown> {
        const node: Record<string, unknown> = {
            tagName: tag.toUpperCase(),
            className: '',
            children: [] as unknown[],
            lastElementChild: null,
            style: {},
            textContent: '',
            setAttribute: () => {},
            addEventListener: () => {},
            prepend(child: { textContent?: string }) {
                (node.children as unknown[]).unshift(
                    child,
                );
                if (typeof child.textContent === 'string'
                    && child.className === undefined
                ) {
                    messages.push(child.textContent);
                }
                const msg = (child as {
                    children?: { textContent?: string }[];
                }).children?.[0];
                if (msg?.textContent) {
                    messages.push(msg.textContent);
                }
            },
            appendChild(child: unknown) {
                (node.children as unknown[]).push(child);
                return child;
            },
            remove() {},
        };
        return node;
    }
    let container: Record<string, unknown> | null = null;
    g.document = {
        getElementById: (id: string) =>
            id === 'toast-container' ? container : null,
        createElement: (tag: string) => el(tag),
        body: {
            appendChild(child: Record<string, unknown>) {
                container = child;
                bodyChildren.push(child);
                return child;
            },
        },
    };
    return { store, messages };
}

test(
    'showToast writes a pending session payload',
    () => {
        const g =
            globalThis as Record<string, unknown>;
        const { store } = installDom();
        try {
            showToast('Submitted for review', 'success');
            const raw = store.get(
                STORAGE_KEY_PENDING_TOAST,
            );
            assert.ok(raw);
            const parsed = JSON.parse(raw!) as {
                message: string;
                variant: string;
                at: string;
            };
            assert.equal(
                parsed.message,
                'Submitted for review',
            );
            assert.equal(parsed.variant, 'success');
            assert.match(
                parsed.at,
                /^\d{4}-\d{2}-\d{2}T.*Z$/,
            );
        } finally {
            delete g.sessionStorage;
            delete g.document;
        }
    },
);

test(
    'replayPendingToast restores the toast once',
    () => {
        const g =
            globalThis as Record<string, unknown>;
        const { store, messages } = installDom();
        try {
            store.set(
                STORAGE_KEY_PENDING_TOAST,
                JSON.stringify({
                    message: 'Idea approved successfully',
                    variant: 'success',
                    at: '2026-08-27T00:00:00.000000Z',
                }),
            );
            replayPendingToast();
            assert.equal(
                store.has(STORAGE_KEY_PENDING_TOAST),
                false,
            );
            assert.ok(
                messages.includes(
                    'Idea approved successfully',
                ),
            );
            const again = messages.length;
            replayPendingToast();
            assert.equal(messages.length, again);
        } finally {
            delete g.sessionStorage;
            delete g.document;
        }
    },
);
```

The prepend mock above is brittle on child shape.
Adjust the mock so `showToast`'s
`msgSpan.textContent` is what `messages` records:
have `appendChild` on the toast push the child's
`textContent` when `className === 'toast-message'`.
Keep the assertions. Do not mock `setTimeout` away
if the closer would clear storage mid-test — stub
`setTimeout` as `() => 0` so the closer does not
run during the persist assertion.

- [x] **Step 2: Run tests to verify they fail**

Run:
```
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
node --strip-types --import ./tests/hmac-test-key.ts \
--test tests/toast-pending.test.ts \
tests/fusion-angle-identifiers.test.ts
```
Expected: FAIL — `STORAGE_KEY_PENDING_TOAST` is
not exported; `replayPendingToast` is not exported.

- [x] **Step 3: Minimal implementation**

`web-app/app/storage-keys.ts` — add:

```typescript
export const STORAGE_KEY_PENDING_TOAST =
    'fusion-angle:pending-toast';
```

`web-app/app/toast.ts` — keep `MAX_TOASTS`,
duration, closer. Add persist + replay. The closer
must clear the pending key so a finished toast does
not revive on the next navigation.

```typescript
import {
    STORAGE_KEY_PENDING_TOAST,
} from './storage-keys.ts';

type ToastVariant =
    | 'success'
    | 'error'
    | 'warning'
    | 'info';

const TOAST_VARIANTS: ReadonlySet<string> = new Set([
    'success', 'error', 'warning', 'info',
]);

function sessionStore(): Storage | null {
    if (typeof sessionStorage === 'undefined') {
        return null;
    }
    return sessionStorage;
}

function isToastVariant(
    v: string,
): v is ToastVariant {
    return TOAST_VARIANTS.has(v);
}

function persistPending(
    message: string,
    variant: ToastVariant,
): void {
    const store = sessionStore();
    if (store === null) return;
    const payload = JSON.stringify({
        message,
        variant,
        at: new Date().toISOString()
            .replace(/Z$/, '000Z'),
    });
    try {
        store.setItem(
            STORAGE_KEY_PENDING_TOAST, payload,
        );
    } catch {
        // Quota: the live toast still shows; the
        // next page simply will not replay.
    }
}

function clearPending(): void {
    sessionStore()?.removeItem(
        STORAGE_KEY_PENDING_TOAST,
    );
}

function paintToast(
    message: string,
    variant: ToastVariant,
): void {
    // existing ensureContainer + element build,
    // but closeToast must call clearPending()
    // before/with the closer.
}

export function showToast(
    message: string,
    variant: ToastVariant,
): void {
    persistPending(message, variant);
    paintToast(message, variant);
}

export function replayPendingToast(): void {
    const store = sessionStore();
    if (store === null) return;
    const raw = store.getItem(
        STORAGE_KEY_PENDING_TOAST,
    );
    if (raw === null) return;
    store.removeItem(STORAGE_KEY_PENDING_TOAST);
    const parsed: unknown = JSON.parse(raw);
    if (
        parsed === null
        || typeof parsed !== 'object'
        || !('message' in parsed)
        || !('variant' in parsed)
        || typeof parsed.message !== 'string'
        || typeof parsed.variant !== 'string'
        || !isToastVariant(parsed.variant)
    ) {
        throw new Error(
            'corrupt pending toast',
        );
    }
    showToast(parsed.message, parsed.variant);
}
```

Keep `makeToastCloser` / `ensureContainer` /
duration behavior. Wire `clearPending` into the
closer's first line so dismiss and timeout both
consume the pending payload.

`new Date().toISOString()` is millisecond Zulu,
not `nowUtc`'s 6-digit width — that helper lives
in `api/` and `toast.ts` must not import `api/`.
Millisecond Zulu is RFC-3339 enough for a pending
UI envelope. Do not invent a second clock.

`web-app/app/app-boot.ts` — in `bootApp`, after
`initListeners()`:

```typescript
    initState();
    initListeners();
    replayPendingToast();
```

Import `replayPendingToast` from `./toast.ts`.

- [x] **Step 4: Run tests to verify they pass**

Same command as Step 2. Expected: PASS.

- [x] **Step 5: Validate and commit**

Run: `./validate`
Expected: green.

```bash
git add web-app/app/storage-keys.ts \
    web-app/app/toast.ts \
    web-app/app/app-boot.ts \
    tests/toast-pending.test.ts \
    tests/fusion-angle-identifiers.test.ts
git commit -m "Persist toasts across navigation" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 3: Pointer-driven list reorder

**Doctrine:** Commandments I (Reliability), VII
(Idempotency — drop is one PUT), III (Uniformity —
one reorder module). Risks Premature Generalization
(do not write a second reorder FSM), Unbidden
Helper, Coupling (no new library).

**Files:**
- Modify: `web-app/app/drag-reorder.ts`
- Test: `tests/drag-reorder.test.ts` (positions
  math unchanged; run it green; do not weaken)

**Interfaces:**
- Consumes: `computeNewPosition`, `dropIndex`,
  `initDragReorder(container, cardSelector,
  idAttribute, onReorder)`.
- Produces: the same `onReorder(id, newPosition)`
  on pointerup. No `draggable` attribute. Keyboard
  ArrowUp/ArrowDown path unchanged.

- [x] **Step 1: Confirm the positions suite is green**

Run:
```
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
node --strip-types --import ./tests/hmac-test-key.ts \
--test tests/drag-reorder.test.ts
```
Expected: PASS. This is the covenant Task 3 must
not break. There is no jsdom pin for the pointer
wiring — next TEST-PLAN run witnesses E11 (run-six
precedent for DOM wiring).

- [x] **Step 2: Replace HTML5 DnD with pointer capture**

In `web-app/app/drag-reorder.ts`:

- Delete `pointerTarget`.
- Delete the `dragstart` / `dragover` / `dragleave`
  / `drop` / `dragend` listeners.
- Delete `setDraggable` and its call. The
  `MutationObserver` keeps `restoreFocus` only
  (`childList: true`).
- On `pointerdown`: if `e.button !== 0`, return.
  Require `.drag-handle` via `closest`. Require
  the card. Read `idAttribute` (throw if missing,
  same as today). `e.preventDefault()`.
  `(e.target as Element)`'s card
  `setPointerCapture(e.pointerId)`. Set
  `drag = { kind: 'active', id, indicator: null,
  idx: null, rects: null }`. Opacity
  `DRAGGING_OPACITY`.
- On `pointermove`: if not `active`, return. Reuse
  existing `dropIndex` + indicator insert (copy
  the current `dragover` body, using `e.clientY`).
- On `pointerup`: if not `active`, return. Commit
  exactly as today's `drop` handler:
  `committedIdx = drag.idx ?? dropIndex(e.clientY,
  null)`, `clearIndicator`, idle, restore opacity,
  `onReorder(id, computeNewPosition(...))`.
- On `pointercancel`: clear indicator, idle,
  restore opacity, do **not** call `onReorder`.

Do not add a drag-distance threshold — today's
HTML5 path had none. Do not skip `onReorder` when
the slot is unchanged — today's `drop` did not.

Keep `buildIndicator`, `clearIndicator`,
`positionsOf`, `dropIndex`, the keyboard handler,
`restoreFocus`, `INDICATOR_*`, `DRAGGING_OPACITY`.

`onReorder` stays `(id, newPosition) => void`.
Callers that pass `async` functions stay as they
are (ignored Promise, same as today).

- [x] **Step 3: Re-run the positions suite**

Same command as Step 1. Expected: PASS.

- [x] **Step 4: Validate and commit**

Run: `./validate`

```bash
git add web-app/app/drag-reorder.ts
git commit -m "Drive list reorder with pointer events" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 4: Pin pure-move vs instance etag

**Doctrine:** Commandments I, VII (Idempotency of
a held etag after a pure move). Risks Test
Weakening (add pins, do not edit the 412
value-bearing tests), Internal Defense (do not
412 a non-conflict).

**Files:**
- Modify:
  `tests/api-work-order-transition-instance.test.ts`
  (append two tests after the existing
  `'pure move WITH If-Match → 400'` test ~line 630)

- [x] **Step 1: Write the failing tests (they should
  actually be GREEN — these pin current law)**

If either is red, STOP. Ruling 12's premise is
wrong for this tree; report and await the master.
Do not "fix" the API to 412.

```typescript
test(
    'pure move does not advance instance etag; '
    + 'held If-Match PATCH is 201',
    async () => {
        const { db, adminToken, etag } =
            await seededBound();
        const move = await handleRequest(db, req(
            'POST', TRANSITION, adminToken,
            pureMoveBody('te-pure-etag'),
        ));
        assert.equal(move.status, 201);
        const patch = await handleRequest(db, req(
            'PATCH', INSTANCE_DETAIL, adminToken,
            {
                set: [
                    {
                        attribute_id: ATTR_ID,
                        value: 'AfterPure',
                    },
                ],
            },
            { [IF_MATCH_HEADER]: etag },
        ));
        assert.equal(patch.status, 201);
    },
);

test(
    'value-bearing transition then stale instance '
    + 'PATCH is 412',
    async () => {
        const { db, adminToken, etag } =
            await seededBound();
        const tx = await handleRequest(db, req(
            'POST', TRANSITION, adminToken,
            valueBody({
                eventId: 'te-val-etag',
                set: [
                    {
                        attribute_id: ATTR_ID,
                        value: 'ViaTx',
                    },
                ],
            }),
            { [IF_MATCH_HEADER]: etag },
        ));
        assert.equal(tx.status, 201);
        const patch = await handleRequest(db, req(
            'PATCH', INSTANCE_DETAIL, adminToken,
            {
                set: [
                    {
                        attribute_id: ATTR_ID,
                        value: 'Stale',
                    },
                ],
            },
            { [IF_MATCH_HEADER]: etag },
        ));
        assert.equal(patch.status, 412);
    },
);
```

`INSTANCE_DETAIL`, `ATTR_ID`, `TRANSITION`,
`seededBound`, `pureMoveBody`, `valueBody`,
`IF_MATCH_HEADER` are already in the file.

- [x] **Step 2: Run the file**

```
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
node --strip-types --import ./tests/hmac-test-key.ts \
--test tests/api-work-order-transition-instance.test.ts
```
Expected: PASS, including the two new tests.
Red on the first new test → STOP (Ruling 12).

- [x] **Step 3: Validate and commit**

Run: `./validate`

```bash
git add tests/api-work-order-transition-instance.test.ts
git commit -m "Pin pure-move instance etag covenant" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 5: Pin system theme on media change

**Doctrine:** Commandments I, V. Risks Polling
(do not add a timer), Unbidden Helper.

**Files:**
- Modify: `tests/state-theme-icon.test.ts`

- [x] **Step 1: Write the test**

Append. This pin is GREEN if Ruling 13 is true
(`initListeners` already subscribes to `change`).
If red, STOP and report — do not poll.

```typescript
test(
    'a prefers-color-scheme change event applies '
    + 'data-theme while preference is system',
    () => {
        const g =
            globalThis as Record<string, unknown>;
        const attrs: Record<string, string> = {};
        const mediaListeners: Array<
            (e: { matches: boolean }) => void
        > = [];
        let matches = false;
        g.localStorage = {
            getItem: () => null,
            setItem: () => {},
        };
        g.document = {
            documentElement: {
                setAttribute: (
                    name: string, value: string,
                ) => { attrs[name] = value; },
                classList: { toggle: () => {} },
            },
            querySelector: () => null,
        };
        g.window = {
            addEventListener: () => {},
            removeEventListener: () => {},
            matchMedia: () => ({
                get matches() { return matches; },
                addEventListener: (
                    type: string,
                    handler: (e: {
                        matches: boolean;
                    }) => void,
                ) => {
                    if (type === 'change') {
                        mediaListeners.push(handler);
                    }
                },
                removeEventListener: () => {},
            }),
        };
        try {
            initListeners();
            persistThemePreference('system');
            assert.equal(attrs['data-theme'], 'light');
            assert.equal(mediaListeners.length, 1);
            matches = true;
            mediaListeners[0]!({ matches: true });
            assert.equal(attrs['data-theme'], 'dark');
        } finally {
            delete g.localStorage;
            delete g.document;
            delete g.window;
        }
    },
);
```

`persistThemePreference` and `initListeners` are
already imported from `state.ts` in this file.

- [x] **Step 2: Run**

```
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
node --strip-types --import ./tests/hmac-test-key.ts \
--test tests/state-theme-icon.test.ts
```
Expected: PASS. Red → STOP (Ruling 13).

- [x] **Step 3: Validate and commit**

```bash
git add tests/state-theme-icon.test.ts
git commit -m "Pin system theme media-change path" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 6: Pin PAGE_REGISTRY HTML page count

**Doctrine:** Commandment III (Uniformity of the
A2 count). Risks Magical Values (the 29 is named
once in the test, matching A2).

**Files:**
- Modify: `tests/page-registry.test.ts`

- [x] **Step 1: Write the test**

```typescript
test(
    'PAGE_REGISTRY is 29 HTML page files including '
    + 'the api-documentation index',
    () => {
        const keys = Object.keys(PAGE_REGISTRY);
        assert.equal(keys.length, 29);
        const files = new Set(
            Object.values(PAGE_REGISTRY).map(
                (e) =>
                    e.sourceDir + '/'
                    + e.sourceFile + '.html',
            ),
        );
        assert.equal(files.size, 29);
        assert.equal(
            files.has('api-documentation/index.html'),
            true,
        );
        assert.equal(
            files.has('index.html'),
            false,
        );
    },
);
```

- [x] **Step 2: Run**

```
TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \
node --strip-types --import ./tests/hmac-test-key.ts \
--test tests/page-registry.test.ts
```
Expected: PASS. Red → STOP (Ruling 14); do not
invent a 30th PAGE_REGISTRY entry.

- [x] **Step 3: Validate and commit**

```bash
git add tests/page-registry.test.ts
git commit -m "Pin PAGE_REGISTRY to 29 HTML pages" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 7: Correct TEST-PLAN drive and counts

**Doctrine:** Commandment V (Clarity). Risks
Unbidden Helper (no extra cases), Test Weakening
(do not retire a FAIL; rewrite drive so the
covenant is testable).

**Files:**
- Modify: `TEST-PLAN.md` only. TEST-PLAN.md is
  exempt from 78-char lint; still wrap like the
  surrounding cases.

- [x] **Step 1: A2 count sentence**

In **A2**, after "with 29 HTML page files
(including `api-documentation/index.html`, …)",
keep the rooms exclusion. Add one sentence:

The 29 are the `PAGE_REGISTRY` HTML files; do
**not** count root `index.html` inside the 29
(it stays the separate "plus root `index.html`");
do **not** count verb/status rooms.

- [x] **Step 2: Protocol list-row reorders**

Replace the paragraph that says E11 is
compositor-driveable and D36/D37/K6 need
synthetic DataTransfer with: E11, D36, D37, and
K6 are compositor-mouse driveable (pointer
capture on `.drag-handle`, not HTML5 `drop`).
Window ≥768 CSS px; filter All; verify by reload.

- [x] **Step 3: D19/D30**

D19 already says toast then list. Add: the toast
is still visible on the ideas list after
navigation (it survives `navigateTo`). D30: the
success toast (`Idea approved successfully`) is
visible on the list the same way.

- [x] **Step 4: F drive notes** (one contiguous
  edit pass, do not add cases)

- **F16:** PASS is the node's `transform` following
  the pointer **during** the drag (rAF). F-slice
  Auto Layout starts ON — drop may snap (F17).
  For a resting free placement see F34 (toggle
  Auto Layout off first; F18's first toggle is
  that off).
- **F25:** Open a node that does not already
  reference every record attribute. On the F
  slice that is Create, Archive, or a New State
  — not Capture or Review (both already bind
  Company Name and Industry; an empty picker
  there is correct).
- **F26:** Drive two compositor `pointerdown`s on
  the edge within 400 ms (there is no `dblclick`
  listener), same as F11.
- **F38 / F38a:** Focus a `.flow-node` (Tab through
  chrome, or `js()` `.focus()` on the node), then
  assert `aria-current="true"`. Next Tab moves to
  the next node/edge, never the page top.
- **F40:** Seed starts unlocked. First toggle
  locks: ports gone, `svg.flow-canvas` has
  `flow-canvas-locked`, strokes
  `hsl(var(--accent-text))`. Do not look for a
  CSS keyword `gold`.
- **F45 / F46:** The 11-step walk is required, not
  optional. After each Undo click, wait for the
  **canvas name/graph to change**, not merely
  HTTP 201 (exhaustion 201 with no canvas change
  is F36). F46: after list round-trip, Undo must
  revert the rename the same way.
- **F47 / F55:** After touching Auto-Fit (or any
  header switch), do **not** leave focus on that
  `button` — Space would activate it. Focus
  `svg.flow-canvas` via Tab or `js()` with **no**
  `pointerdown` on the canvas (F56's trap), then
  send Space. Seed Auto-Fit is ON: Space then
  toasts "Disable Auto-Fit to change the view"
  and pan stays off (F55). Toggle Auto-Fit **off**
  before F47–F49 pan.
- **F51 / F52 / F53:** Require an in-flight
  gesture (`dragging` / marquee / connect). Space
  mid-gesture must not toggle pan. F53 needs the
  flow unlocked (ports visible); do not start
  from a locked canvas.
- **F57:** Focus `#prop-node-name` (the input,
  not a node). Space inserts a space character;
  pan unchanged.

- [x] **Step 5: WB19b converse**

Replace the converse sentence so it cannot be
read as a pure Archive:

Conversely, after a successful **value-bearing**
transition (set/clear + If-Match — serial Review
fills Reviewer Notes), a stale instance Save on
record detail 412s and recovers. A **pure move**
(no set/clear, no If-Match) does not advance the
instance etag; a Save with the held etag is 201,
not a FAIL.

- [x] **Step 6: I6 OS clause**

Keep the StorageEvent sentence. Replace the OS
sentence with: an OS `prefers-color-scheme`
change while preference is System fires the
`MediaQueryList` `change` event and updates
`data-theme` without reload; the toggle glyph
stays the system icon. CDP
`Emulation.setEmulatedMedia` that mutates
`matches` without `change` is not this case —
after emulate, dispatch
`new MediaQueryListEvent('change', { matches:
mq.matches })` on the query, or use a real OS
toggle.

- [x] **Step 7: Validate and commit**

Run: `./validate`

```bash
git add TEST-PLAN.md
git commit -m "Correct TEST-PLAN FAIL drive notes" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 8: Commit the completed plan

**Doctrine:** Office of the Commit. Tick every
box in this file that the prior tasks completed,
then commit.

**Files:**
- Modify:
  `docs/superpowers/plans/2026-08-27-test-plan-fail-remediation.md`

- [x] **Step 1: Tick remaining boxes** including
  this task's after the commit is prepared.

- [x] **Step 2: Validate**

Run: `./validate`

- [x] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-08-27-test-plan-fail-remediation.md
git commit -m "Complete FAIL-cluster remediation plan" \
    -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

## Self-review

- Spec coverage: D19/D30 → Task 2 + Task 7.
  E11 → Task 3 + Task 7. F cluster → Rulings
  3–11 + Task 7 (no canvas product commit).
  WB19b → Task 4 + Task 7. I6 → Task 5 + Task 7.
  A2 → Task 6 + Task 7.
- No TBD/TODO placeholders in tasks.
- Types: `ToastVariant`, `STORAGE_KEY_PENDING_TOAST`,
  `replayPendingToast` used consistently.
- Stub suspected layers that were wrong (WB19b
  API, I6 UI polling, F UI) are overridden by
  Rulings, not by silent disagreement.

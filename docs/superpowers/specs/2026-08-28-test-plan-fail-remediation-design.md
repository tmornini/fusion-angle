# Test-plan 2026-08-28 FAIL remediation

The 2026-08-28 parallel TEST-PLAN run (build SHA
`078af60`, clean at A1; mitigation stubs later at
`615d0be`) reported AT green and 22 browser FAILs in
three clusters (D36/E11; F13…F72; WB16) plus two
DRIFT candidates (WB4, WB19b). Yesterday's campaign
(`docs/superpowers/plans/2026-08-27-test-plan-fail-remediation.md`)
shipped pointer-capture reorder and F drive notes.
This run used those notes. Chip stayed F Admin. The
remaining FAILs that are product are gaps the drive
notes papered over; the rest are hunter aim or a
drained network log.

Dated stubs stay frozen:

- `docs/superpowers/test-plan-mitigations/2026-08-28-d-d36.md`
- `docs/superpowers/test-plan-mitigations/2026-08-28-f-f13.md`
- `docs/superpowers/test-plan-mitigations/2026-08-28-f2-wb16.md`

Where a stub and a Ruling disagree, the Ruling wins.

Owner decisions taken in the brainstorm: mixed
rulings (product where source lies; TEST-PLAN where
the hunter aimed at the wrong node or read a drained
log). No third F-slice attribute. No
`EXPECTED_SLICE_MESSAGE_PAIRS` change.

## Problem

Each FAIL and DRIFT reduces to one mechanism,
verified in source unless noted:

1. **The dragged row never follows.** `initDragReorder`
   (`web-app/app/drag-reorder.ts`) captures the
   pointer, sets opacity 0.4, paints the hysteresis
   indicator, and commits `onReorder` on pointerup.
   It never writes `transform`. D36/E11 observed
   exactly that (`transform: none`) and still saw
   the new order persist across reload. TEST-PLAN
   D36/E11 require the row to follow the pointer.
   D37 hysteresis already passed. K6 shares the
   module.
2. **Pointermove stomps keyboard Shift.** Window
   `shift-key` (`flow-interactions.ts` `handleShift`,
   `flow-fsm-reduce.ts` `onShiftKey`) sets
   `connect.isShift`. Connecting `pointer-move`
   then writes `isShift: input.isShift` from the
   pointer event (`flow-fsm-reduce.ts` around the
   connecting branch). Compositor pointer events
   typically carry `shiftKey: false`. Jitter
   pointermoves restore the New State ghost. Shift
   held *before* pointerdown is also lost:
   `onShiftKey` no-ops unless already connecting,
   so F19 depends on `e.shiftKey` on pointerdown.
   F19, F20, F23.
3. **Tab from the SVG leaves the ring.** Yesterday
   made `svg.flow-canvas` a tab stop (Space pan
   without a canvas `pointerdown`). `handleTab`
   only wraps `.flow-node, .flow-edge`. Focus on
   the SVG yields `indexOf(active) === -1`;
   `nextCanvasTabIndex` returns null for
   `current < 0` (`tests/flow-canvas-tab.test.ts`
   pins that as a no-op). Tab leaves the canvas.
   No `aria-current`. Enter / Space-as-activate /
   Backspace have no selection. F38, F38a, F38b,
   F57a.
4. **Undo always closes the panel.**
   `applyServerGraph` (`flow-operations.ts`) sets
   `isPanelOpen: false` and `selection: { kind:
   'none' }` on every successful undo/redo. F67
   ticks a Members checkbox then Cmd+Z: the panel
   closes, so the unticked box is unobservable.
   Separately, `bindKeyboardShortcuts` treats every
   `HTMLInputElement` as editable, so a focused
   checkbox swallows Cmd+Z.
5. **F68–F72 name the wrong node and the wrong
   attribute.** The F-slice record has two
   attributes (Company Name, Industry). Capture
   and Review already bind both. Create and
   Archive panels have no picker (`isSpecial` in
   `buildNodePanel`). Only F15's New State can
   add. F69 names "Contact Email" — AA's fixture,
   not F's. Hunter opened Capture. F25 already
   passed on New State; F68 re-aimed at Capture.
6. **F13/F26 are two pointerdowns, not `dblclick`.**
   The FSM opens the panel on a second
   `pointer-down-on-node` / `pointer-down-on-edge`
   within `DBLCLICK_MS` (400). There is no
   `dblclick` listener. F26 already says this; F13
   does not. A completed single click on another
   node while the panel is open already updates
   panel content on pointerup.
7. **F35/F37b/F50/F55/F57 are drive.** Toolbar
   delete already removes an intermediate node
   (F27 not in FAIL; `performDeleteSelectedNodes`
   no-ops Create/Archive). Add is F15 port-drag
   (F15 not in FAIL). `handleSpace` already ignores
   `ke.repeat`. F55/F57 still require focus off the
   Auto-Fit `button` and onto `#prop-node-name`.
8. **WB16 reads a drained log.** The binding PUT
   happens at bind, before WB11 submit. WB16 sits
   on the same load as WB11 and forbids a later
   navigation, but the hunter read Performance
   after the buffer had dropped the PUT. Transition
   POST and history GET were present.
9. **WB4 / WB19b are DRIFT.** Parallel READY lists
   WB Test Flow with `notReady.length === 0` at
   that step. WB19b's converse is a value-bearing
   Save; Review is read-only, so that Save is not
   driveable. Not FAILs.

## Goals

- List reorder: the captured card's `transform`
  tracks the pointer during the gesture; drop
  indicator and persist-on-reload stay.
- Shift-connect: holding Shift, including mid-drag
  with a stationary pointer, hides the New State
  ghost and commits an edge on a valid target.
- Tab from `svg.flow-canvas` enters the node/edge
  ring; `aria-current` pairs; Enter opens the
  panel; Space on a focused node opens the panel.
- Undo of a Members tick leaves the panel open on
  that node with the checkbox unticked. Cmd+Z
  works while a checkbox is focused.
- TEST-PLAN names the F15 New State and Company
  Name / Industry for F68–F72; F13 two
  pointerdowns; WB16 the bind-through-WB11 log
  snapshot; F35 toolbar Delete.
- CLI pins for every product change.
- `./validate` green. Dated stubs frozen.

## Non-goals

- A third F-slice record attribute. Pair counts
  stay. F68 uses F15's New State.
- Returning HTML5 DnD. Pointer capture stays.
- Rewriting the canvas FSM beyond Shift ownership
  and Tab-from-SVG.
- Re-running the browser plan. This spec prepares
  it; the run is `TODO.md` item 5.
- Editing dated specs, plans, or mitigation stubs.
- Product changes for WB16, WB4, WB19b, F13
  panel-update-on-single-click, F26, F35, F37b,
  F50, F55, F57.

## Design

### 1. Drag follow (D36, E11, K6)

Keep pointer capture, the snapshot `rects`, the
indicator, and `onReorder` on pointerup.

Extend the active `DragState` with the pointer's
`startClientY` and the captured card. On each
`pointermove`, set the card's
`style.transform` to `translateY(Npx)` where N is
`clientY - startClientY`. Transform does not affect
layout, so drop-index geometry stays the snapshot.
On `pointerup` and `pointercancel`, clear
`transform` and opacity before `onReorder`.

Extract `followTranslateY(startClientY, clientY):
string` next to the position helpers. Pin it in
`tests/drag-reorder.test.ts`. Do not introduce a
ghost clone. Match this file's existing inline
style voice (indicator and opacity already live
there).

### 2. Window-tracked Shift (F19, F20, F23)

The interaction layer owns whether Shift is held.
`keydown` / `keyup` on Shift set a `shiftHeld`
flag. Extract `pointerIsShift(shiftHeld,
eventShiftKey): boolean` as `shiftHeld ||
eventShiftKey`. Every pointer FSM input's
`isShift` is that result. Keep dispatching
`shift-key` while connecting so a stationary
pointer still hides the ghost (F23).

The FSM connecting `pointer-move` still copies
`input.isShift` into `connect.isShift`. It does
not change. Do not OR sticky-on inside the FSM.
A compositor pointer event with `shiftKey: false`
cannot stomp once the caller passes `true` from
`shiftHeld`.

Pin `pointerIsShift` next to the existing FSM
`shift-key` tests. Do not add a reduce test that
documents the old stomp.

Do not remove `button` from `isFormFocused`.

### 3. Tab from the SVG (F38, F38a, F38b, F57a)

`nextCanvasTabIndex(length, current, shift)`:

- `length < 1` → `null` (unchanged).
- `current < 0` (focus on the SVG, inside the
  wrap, not on a node or edge): Tab → `0`;
  Shift+Tab → `length - 1`.
- `current >= length` → `null` (unchanged).
- Otherwise wrap among items (unchanged).

`handleTab` already runs when `wrap.contains
(active)`; the SVG qualifies. `indexOf(active)`
is `-1`; the new branch enters the ring and
`preventDefault`s. Focusing the first node fires
`focusin` → `canvas-focus` → selection →
`aria-current`. Enter / Space-as-activate /
Backspace then have a selection.

Rewrite the `tests/flow-canvas-tab.test.ts` case
that pins `current === -1` as a no-op: it becomes
the SVG-entry covenant. Keep the `length === 0`
and `current >= length` no-ops.

Drive notes stay: hunters may `js()` `.focus()` a
`.flow-node` and wait for `aria-current`. Tab
through chrome now lands on the SVG, then the
first node — that is PASS, not a skip.

### 4. Undo keeps a live selection (F67)

`applyServerGraph` no longer blindly closes the
panel.

- If the current selection is nodes and every id
  still exists in `graph.nodes`, keep that
  selection. Keep `isPanelOpen` as it was.
- If the current selection is an edge and that id
  still exists in `graph.edges`, same.
- Otherwise `selection: none` and
  `isPanelOpen: false` (deleted subject).

Redo uses the same helper. Exhaustion
(`hasUndoHistory` false) already returns `snap`
unchanged.

`isDesignerEditableTarget(active)` is true for
textarea, select, and texty `HTMLInputElement`
(`type` not `checkbox`, `radio`, `button`,
`submit`, `reset`). False for a Members checkbox.
`bindKeyboardShortcuts` uses it for
`isEditableFocused`. Pin in
`tests/flows-detail-shortcuts.test.ts`.

Pin `performUndo` with the panel open on a node
that survives the restore: `freshSnap.isPanelOpen`
true and the same node still selected, with
restored `memberIds`. Do not weaken the existing
undo-restores-graph assertions.

TEST-PLAN F67: wait for the `memberIds` PUT
(`SAVE_DELAY_MS` 800 ms) before Cmd+Z.

### 5. TEST-PLAN drive notes

One contiguous edit pass. Do not add cases. Do not
change seed.

- **F13:** Drive two compositor `pointerdown`s on
  the other node within 400 ms (no `dblclick`
  listener), same as F11. PASS: panel content is
  the new node; canvas re-centers.
- **F35:** Toolbar Delete (`data-action=
  "delete-selected"`) on a non-Create / non-Archive
  node, same as F27. Wait until that node is gone,
  then Undo. Do not use Backspace unless F38's
  `aria-current` is already true.
- **F37b:** Add via F15's plain port-drag (no
  Shift). Wait until node count + 1, then Undo.
- **F50:** The first Space `keydown` must have
  `repeat: false`; hold may auto-repeat after that.
- **F55 / F57:** Unchanged in substance (focus
  `svg.flow-canvas` / `#prop-node-name`). F55: if
  F29 just toasted the same Auto-Fit message, wait
  out `WHEEL_TOAST_COOLDOWN_MS` (2000).
- **F68–F72:** Open F15's New State — not Capture,
  not Review, not Create/Archive. The picker lists
  leftover record attributes (Company Name and/or
  Industry). F69 selects Company Name, not Contact
  Email. F27 must not delete that New State; delete
  a different intermediate if F27 needs a victim.
- **WB16:** Snapshot Performance resource entries
  from bind through WB11 submit. WB16 asserts
  against that snapshot. Never a later
  `getEntries()` and never `js()` `fetch`.
- **WB4 (drift):** Parallel READY containing WB
  Test Flow with an empty NOT READY list at this
  step is PASS. Do not fail for a missing NOT
  READY row.
- **WB19b (drift):** The converse is a
  value-bearing instance Save, not a pure
  Review→Archive move. Review is read-only; do not
  drive the converse there.

Protocol already says D36/E11 follow the pointer.
No Protocol change beyond what §1 makes true.

## File structure

| File | Responsibility |
|---|---|
| `web-app/app/drag-reorder.ts` | Follow `translateY` during capture |
| `tests/drag-reorder.test.ts` | Pin `followTranslateY` |
| `web-app/app/flow-interactions.ts` | `shiftHeld`; `pointerIsShift`; Tab from SVG |
| `tests/flow-interactions-shift.test.ts` | Pin `pointerIsShift` |
| `tests/flow-canvas-tab.test.ts` | SVG-entry Tab |
| `web-app/app/flow-operations.ts` | `applyServerGraph` keeps live selection |
| `tests/flow-operations.test.ts` | Undo keeps panel |
| `web-app/flows/detail.ts` | `isDesignerEditableTarget` |
| `tests/flows-detail-shortcuts.test.ts` | Checkbox is not editable |
| `TEST-PLAN.md` | Drive notes in §5 |

## Success criteria

- `./validate` green after every product commit.
- D36/E11: a pointermove writes `translateY` on
  the captured card; pointerup clears it and
  persists order (existing persist path).
- F19/F23: Shift held via key events hides the
  New State ghost even when pointer events report
  `shiftKey: false`.
- F38a: Tab from the canvas SVG focuses the first
  `.flow-node` or `.flow-edge` and pairs
  `aria-current`.
- F67: undo of a surviving node's `memberIds`
  leaves the panel open; Cmd+Z from a checkbox
  is undo.
- F68–F72 and WB16 are executable as written.
- Mitigation stubs at `615d0be` are unmodified.

## Risks

- A transformed row can paint under a later
  sibling. If the hunter still reports no follow
  with `transform` set, raise `z-index` on the
  captured card in the same inline voice — only
  after that measurement.
- `applyServerGraph` keeping selection must not
  resurrect a deleted id. The existence check is
  the whole guard.
- Tab-from-SVG must not steal Tab that started
  outside the wrap. `handleTab` already returns
  unless `wrap.contains(active)`.

# Test-plan run four remediation: columns, camera, focus, TODO

## Problem

The 2026-08-23 TEST-PLAN run (parallel mode, slice seed;
build `9a9bb14e`, the last commit before the stubs landed —
the summary line itself is not in the tree) reported five
FAIL clusters over nine cases (F18; F29; F37 + F45; F38 +
F39; R15) and three DRIFT candidates (A3 TSV, C4, R21; the
summary table listed two). Run three's remediation
(`2026-08-23-test-plan-run-three-remediation-design.md`)
shipped in full; every FAIL here is new. The five hunter
stubs under `docs/superpowers/test-plan-mitigations/` are
tracked this time (`88d4e4f8`).

Each FAIL and DRIFT reduces to one mechanism, verified in
source and reproduced on the memory backend or by pure call
unless noted:

1. **Rank rides x; y is a median.** `computeLayout`
   (`web-app/app/flow-layout.ts:140-228`) maps rank to a
   column (`xByLayer`, `:791-810`) and sets y by four
   iterations of median-of-neighbours (`forwardPassLayer`
   `:868-900`, `backwardPassLayer` `:902-915`, intent at
   `:702-707`), so on the fanned Layout Test Create sits at
   its one child's row and Archive at the median of
   Rejected and Approved — the hunter's y=−32 and y=228
   exactly. "Create top-left, Archive bottom-right" entered
   the plan at `f59ef319` against the BFS diagonal layout
   that did it; `a735a7de` replaced that layout nine days
   later. The only placement law in source is the relative
   mirror (`fitToCanvas`, `:1052-1053`) and `5c7c0914`'s
   test that Archive is last in the rightmost column
   (`tests/flow-layout.test.ts:223-267`). The ruled
   covenant — within-column order for the two special
   nodes — fails today on both halves: `assignLayers`
   seeds Kahn's queue in input order (`:483-487`),
   `reduceCrossings` keeps a zero-crossing order
   (`:680-699`), and nothing moves Create to index 0 (there
   is a `placeArchiveLast`, `:262-275`, and no
   `placeCreateFirst`); when `flipY` fires (`:1053`,
   `:1084-1088`) every column inverts and Archive leads
   its column. Fuzz over 3000 shuffled DAGs: Create-first
   fails in 1907 of 2963 graphs with a column-mate,
   Archive-last in 171 of 1817 — all 171 with the mirror.
   The seeded flow starts with Auto Layout ON
   (`api/mock-data/flows.ts:648`), so the hunter's first
   toggle moved nothing. F18.
2. **Two cameras.** A toolbar zoom produces a new
   interaction state the presenter renders
   (`applyButtonZoom`, `web-app/app/flow-interactions.ts:
   781-815`; `viewBox` written at `flow-graph.ts:1388`) —
   the click DOES change `viewBox`. But `bindInteractions`
   keeps its own `currentState` (`:352`, advanced only at
   `:451`) and the push updates `{isAutoFit, isLocked}`
   alone (`:752-754`, `FlowGestureContext` `:60-63`). The
   next `pointerdown` reduces from the pre-zoom camera and,
   idle, takes the full commit (`web-app/flows/detail.ts:
   905-921`) — the zoom is gone; `reconcileFitFromDom`
   recovers it only with Auto Fit ON (`:654`). Break:
   `4f4239e1`. A second stomper: every commit's presenter
   starts `#needsFit = true` (`presenters/flow-designer.ts:
   216`) and `withCanvasSize` fits on first call regardless
   of `isAutoFit` (`:1010-1014`), fired by the
   ResizeObserver (`detail.ts:1614-1633`) on every frame of
   the sidebar transition. Same seam: after a delete the
   FSM's stale selection makes `getNodePosition`'s
   `.find(…)!` throw on the next node press
   (`flow-designer.ts:488-491`). F29.
3. **The debounced edit is not bound to its target.** The
   ledger is sound: the cursor truncates the abandoned
   branch (`api/derive-flows.ts:299`), the history read is
   unbounded (`:271-275`), `FLOW_VERSION_CAP` survives only
   in the plan, and eleven saves walk eleven undos. Redo is
   client-only (ARCHITECTURE.md `## Do not resurrect`;
   `tests/api-flows-verb-gaps.test.ts:111-118`), cleared
   only by `recordFlowMutation()` (`flow-history.ts:
   48-54`). A panel rename schedules a closure capturing
   only `value` on `Debouncer(SAVE_DELAY_MS = 800)`
   (`detail.ts:90, 98-99, 1277-1305`; `410b30a7`); the
   target resolves at fire time from
   `#singleSelectedNodeId()` (`flow-designer.ts:814-816`).
   `commit()` sets P1 then `update()` flushes FIRST
   (`:586`), renders P1 (`:587`), and writes P1's history
   back (`:591`). A commit within 800 ms of the last
   keystroke — clicking the canvas to confirm — flushes
   re-entrantly: selection none → `withNodeNamed` returns
   `this.#snapshot` (no save, no `#noteMutation`), the
   inner commit clears the stack, the outer `update(P1)`
   repaints Redo ENABLED and resurrects it; selection B →
   B takes A's name. Names typed ~850 ms apart straddle
   the 800 ms window — the plan names neither the interval
   nor the observable. F37, F45.
4. **Focus is not selection, and dies on every rebuild.**
   Selection is written by four reducers and the page's
   post-add select; no `focus`/`focusin` listener exists in
   the designer. Nodes and edges are `role="button"
   tabindex="0"` (`flow-graph.ts:583-599, 930-946`;
   `2cacdbf0`); Tab → Enter/Space dispatches
   `canvas-key-activate` (`flow-interactions.ts:719-748`;
   `68ceb3dd`), which selects and opens the panel; Tab →
   Delete is a silent no-op (`handleDeleteSelected`,
   `detail.ts:346-354`, after `preventDefault` at
   `:1845`). A trusted click cannot leave a node focused
   and unselected: the `pointerdown` commit replaces the
   `<svg>` synchronously (`flow-designer.ts:718-727`), so
   the hit `<g>` is detached before focus lands. Every
   rebuild detaches the focused element; nothing restores
   it. Space on a focused node both activates it and
   toggles pan (`:701-717`; `isFormFocused` `:308-323`
   tests tagName only). `canvas-key-activate` has zero
   tests. F38.
5. **The redo chord is unsatisfiable.** `detail.ts:
   1849-1864`: `e.key === 'z' && e.shiftKey` — Shift
   yields `'Z'` on every keyboard; Caps Lock drops Cmd+Z
   likewise. Verbatim since `1e9d50bf`. The chord also has
   no editable-target guard (the Delete branch has one,
   `:1833-1842`): Cmd+Z in the panel's Name input fires a
   graph undo over the input's own. F39.
6. **The archive control never shipped.** `RECORD_STATES`
   has `archived` (`api/types.ts:124-128`); the gate
   accepts any member (`validators.ts:2735-2738`); the
   derive hides only `deleted` (`derive-record-types.ts:
   105, 146-150`); `postRecordStateChange` exists and is
   pinned (`web-app/app/adapters/records.ts:298-314`;
   `tests/adapters-records.test.ts:227-262`); the badge
   config and the list's `['active','archived']` chips
   exist (`presenters/record-list.ts:254-263`). Page
   callers: none. `a8b0a1bd` wrote R15 and a consumer-less
   `archiveRecord`; `627118ba` deleted the adapter and the
   plan stood. "Active counts" never existed — the chips
   carry no numeral. R15.
7. **The reveal writer lacks two entries.** The G row
   carries `erasableUsername` / `erasablePassword`
   (`api/test-plan-slices.ts:135-136, 3212-3214`;
   `fillPasswords` `:3094-3111`); `SLICE_REVEAL_FIELDS`
   (`server/seed.ts:174-199`) ends at `memberPassword` then
   `flowId`. `736781ea6` touched every file but this one;
   `tests/test-plan-slices.test.ts:247-253` pins the
   object, not the TSV. A3.
8. **The CSS is the covenant.** `.objective-aggregates-card
   { width: calc((100% - 2 * var(--space-6)) / 3); }`
   (`components-metrics.css:84-89`; `responsive.css:26`
   restores `auto` under 768px) is `0f03bee8` (2026-05-31,
   "Match Objectives card width to one gauge column"), the
   survivor of a same-day trio. The plan's "full-width" is
   `4e839500` (2026-05-15). At a 1280px window the
   workspace is 960px and `(960 − 48) / 3 = 304`. Ruled:
   one column. C4.
9. **R21 has no subject, and the composed edit resets
   ACLs.** `r-org` holds one seat (`test-plan-slices.ts:
   625`); Customer Profile's two attributes carry the open
   default (`:2401-2421`). The ACL is real and pinned
   (`api/attribute-acl.ts:25-43`; `projectInstanceFields`,
   `presenters/record-detail.ts:88-121`). Customer Profile
   cannot host the fixture: `formRecordWriteMessagePairs`
   (`api/routes.ts:857-908`) re-PUTs every attribute
   through `recordAttributeDocumentBodyOf` (`:829-852`),
   which stamps `DEFAULT_ATTRIBUTE_ACL_ROLES` whenever the
   body carries none — and the composed body never can
   (`RECORD_ATTRIBUTE_BODY_KEYS`, `validators.ts:
   2743-2747`). Reproduced through `handleRequest`: nested
   PUT restricts to `['admin']` → composed rename of a
   sibling → GET reads `['member','admin']`. An admin's
   restriction lifted by a rename is Commandment II. R21.

Under those mechanisms the investigation found that later
work has no home: ARCHITECTURE.md `## Later work` holds
seventeen bullets, six unimplemented Deno specs carry their
own deferred decisions (ordered only in git history,
`9620d38c`), twelve code comments name real work, TEST-PLAN
carries four future-work sentences, and the five run-four
stubs sit pending — kept in sync by nothing.

## Goals

- The ruled canvas covenants in code and pinned: Create
  heads its column and Archive ends its; a toolbar zoom
  survives the next pointer and the next resize; a debounced
  edit lands on the node it was typed for; focus selects
  and survives a rebuild; every chord fires.
- A Record archives from its detail page in the sibling
  voice.
- Seeds that give every case its subject: `erasable_*` in
  the G reveal; an R member seat and an ACL record no case
  edits.
- The composed record edit never touches an ACL.
- TEST-PLAN true for this seed and this MCP: F17, F18, F29,
  F36, F37, F38 (+ F38a, F38b, F57a), F39, F45, C4, K27,
  R1, R15, R21, the undo preamble, three Known-MCP bullets.
- `TODO.md`: the single home for later work, the twelve
  critical-path items first and in order, everything else
  migrated from ARCHITECTURE.md, the Deno specs, the code
  comments, and TEST-PLAN, with sequencing and a gate.
- The tree free of absorbed stubs.

## Non-goals

- Re-running the browser plan. This spec prepares it; the
  run is `TODO.md` item 5.
- Corner placement for Create and Archive, or any change to
  coordinates, `fitToCanvas`, the serpentine, or the mirror.
- One zoom voice (routing the buttons through the FSM) —
  `TODO.md` item 9.
- A two-way selection seam (the page's selection writes
  behind the FSM) — `TODO.md` item 6.
- A record reactivate control, a lifecycle transition table,
  or a binding guard on archived records.
- Roles in the composed write body; the client still
  cannot send them.
- Full width for the Objectives card; the collapsed
  sparkline track is later work.
- Editing dated specs and plans (`AUDIT.md:42-44`); moving
  `## KNOWN seams` or `## Do not resurrect` out of
  ARCHITECTURE.md (`AUDIT.md:253-262` counts the seams).
- Cleaning the stale-history comments; `TODO.md` names the
  pass.
- Touching `EXPECTED_MESSAGE_PAIR_COUNT = 1448` or
  `PROJECT_GARDEN`.

## Design

### 1. Layout: Create heads its column, Archive ends its (F18)

`placeCreateFirst` beside `placeArchiveLast`
(`flow-layout.ts:262-275`), the same ten-line shape, moving
the create node to index 0 of the one layer that holds it;
the call at `:164-166` becomes
`placeArchiveLast(placeCreateFirst(reduceCrossings(…),
nodes), nodes)`. With Create leading the sweeps, `sp.y >
ep.y` no longer arises where a column has mates, so the
mirror stops inverting populated columns (fuzz: 0/2963 and
0/1817, zero mirror firings). Touches no coordinates, no
`fitToCanvas`, no snake, no caller; no seeded flow moves
(each has Create as its sole root).

Pins, `tests/flow-layout.test.ts` on the `lin()` pattern
(`:127-136`), with an in-test `columnOf(positions, id)`:
Create heads its column when an orphan precedes it (`[o, s,
a, z]`, `s→a→z`) — red; Create heads its column beside a
second root (`[r, s, a, x, d, z]`, `r→x→d`) — red, with
Archive ending `{d, z}` green; Archive ends its column when
the mirror would fire (`[r, s, x, a1, a2, m, z]`, `r→x→m,
s→a1→z, s→a2`) — red; a wrapped chain keeps Create leftmost
past an orphan (`[o, s, a, b, c, d, z]`, 1400×740) — red.
The `:223-267` case stays green. A green guard beside
`tests/adapters-flow-queries.test.ts:495-521`: the Layout
Test lays out with Create at min x, Archive at max x,
`create.y <= archive.y`, and both strictly inside the y
range — the covenant the plan now states.

TEST-PLAN F18 (`:1221-1225`): toggle twice — the seed
starts ON; one column per rank (one row per rank when the
graph is taller than wide), others by depth; Create heads
the first column and Archive ends the last — never below or
above a column-mate; the columns, not the corners; on a fan
(Layout Test) both sit mid-height; a chain wraps into a
serpentine (Customer Onboarding, Lead-to-Close) — Create
leads the top row, Archive ends the last, bottom-left on an
even row count. F17's parenthetical (`:1216-1218`): with
Auto Layout on the drop re-lays out; Create returns to the
head of the first column, Archive to the foot of the last.

### 2. Camera: the FSM reduces from the committed camera (F29)

`FlowGestureContext` (`flow-interactions.ts:60-63`) gains
`interaction: InteractionState`; `buildGestureContext()`
(`flow-designer.ts:333-341`) supplies
`this.#snapshot.interaction`; the push (`:752-754`) sets
`context = next` and, when `!isGestureActive(currentState)`,
`currentState = next.interaction` — the FSM owns the camera
during a gesture, the page between gestures; at a gesture
boundary the pushed object is the FSM's own result, a
no-op. This also retires the stale-selection throw after a
delete. The `state` parameter of `bindInteractions` becomes
redundant; dropping it is its own commit.

Second commit: `withCanvasSize` (`flow-designer.ts:
1010-1014`) fits only when `isAutoFit`, else the existing
center-rescale branch; `onFlowLoaded` keeps its explicit
first fit. The page-level `#needsFit` (`detail.ts:160,
215-221`), written and never read, is deleted.

Pins, `tests/flow-designer-presenter.test.ts` on
`buildPresenterWithNodes(false)`: after `withZoomedIn()` the
zoom differs and a presenter built from the zoomed snapshot
reports `buildGestureContext().interaction ===
zoomed.interaction` — red today (`interaction` absent); a
green companion pins `withZoomedIn` +0.1 and the viewBox
scaled by prev/next about the center, `withZoomedOut` the
reverse; `withCanvasSize` on a non-auto-fit presenter keeps
its zoom — red today. The push-side re-seed needs an
`SVGSVGElement`; the browser run is its oracle.

FLOW-CANVAS.md `## The FSM seam`: one sentence — the page
pushes the committed interaction state back in the gesture
context after every commit, so a gesture reduces from the
committed camera.

TEST-PLAN F29 (`:1293-1298`): the seed loads with Auto Fit
ON — Zoom in toasts `Disable Auto-Fit to change the view`
and `viewBox` stands (F7's gate); toggle Auto Fit OFF; Zoom
in then Zoom out, re-querying `svg.flow-canvas` after each
click (every commit rebuilds the `<svg>`); PASS: width and
height shrink then restore (zoom ±0.1, clamp 0.25–2.0);
click the empty canvas once — `viewBox` keeps the zoomed
value; toggle Auto Fit ON — re-fits to all nodes. "Smoothly"
leaves. Known-MCP bullet: the canvas `<svg>` is replaced on
every commit; probe by fresh query, never a held reference.

### 3. Undo: the debounced edit is bound to its target (F37, F45)

The `input` handlers at `detail.ts:1277-1305` read
`pageState.presenter().selectedNodeId()` /
`selectedEdgeId()` (`flow-designer.ts:428-440`) at schedule
time, return on null, and schedule
`pageState.presenter().withNodeNamed(nodeId, value)`. The
presenter's `withNodeNamed(nodeId, name)`,
`withNodeTaskInstructions(nodeId, text)`, and
`withEdgeNamed(edgeId, name)` take the id and lose the
selection lookup and the `return this.#snapshot` early
returns (`:814-816, 836-838, 880-885`). The presenter is
still resolved at fire time — the stale-presenter lesson
(`tests/flow-designer-presenter.test.ts:310-315`) holds;
only the id is captured. With the rename always applied,
`#noteMutation` always runs and `:591` reads a cleared
stack.

Second commit: `update()` (`detail.ts:584-592`) renders
`pageState.presenter()` after the flush, not its argument,
so a rename flushed mid-commit paints instead of waiting for
the next commit.

Pins, `tests/flow-designer-presenter.test.ts` beside
`:284-308`: a presenter whose selection is `{B}` (and one
whose selection is none) given `withNodeNamed(A, 'typed')`
yields A `'typed'` and B unchanged; `withEdgeNamed` with
selection none likewise. Red today: the arity fails `tsc`
(the `./validate` gate). A green depth pin on
`tests/flow-undo-cursor.test.ts`: eleven saves, eleven
undos, N10 → genesis — F45 written down.

TEST-PLAN: the preamble (`:1308-1326`) says redo is
client-only, cleared by `recordFlowMutation` on every
committed content edit; F36 (`:1339-1341`) notes Undo may
stay enabled at exhaustion (`hasUndoHistory` is `pairs >
1`, `derive-flows.ts:108`) and the click is a server no-op;
F37 (`:1343-1345`): let the new action's `PUT /api/
organizations/:id/flows/:id` land — a panel rename saves
`SAVE_DELAY_MS` = 800 ms after the last keystroke; do not
click the canvas or another node before the PUT; F45
(`:1420-1429`): after each name wait for that PUT in the
network log (≥ 800 ms idle) before selecting the next node;
the `FLOW_VERSION_CAP` / `flow_versions` history shrinks to
one sentence.

### 4. Keyboard: chords fire; focus is selection and survives (F39, F38)

Seven commits, order load-bearing.

1. Pin `canvas-key-activate` — `tests/flow-fsm-reduce.test.
   ts` after `:500`, the `buildState` / `findAction` idiom:
   Enter on a focused node selects it with `open-panel` and
   `request-update`; the edge twin. Green; tests only.
2. Decide designer shortcuts in a pure reducer —
   `detail.ts` exports `reduceDesignerShortcut({ key,
   metaKey, ctrlKey, shiftKey, isEditableFocused,
   isPanelOpen }) → 'escape' | 'delete' | 'undo' | 'redo' |
   null` (the `members/detail.ts` `reduceSave` precedent);
   the listener becomes a thin adapter computing
   `isEditableFocused` from the three `instanceof` checks.
   The key test is Shift-insensitive on `e.key` (`'z'` or
   `'Z'`; not `e.code` — `KeyZ` is AZERTY's W); the chord
   honors `isEditableFocused` as Delete does. Pin, new
   `tests/flows-detail-shortcuts.test.ts` on the
   `members-detail-reduce` stub pattern: `{key:'Z',
   metaKey, shiftKey}` → `'redo'`; `{key:'z', metaKey}` →
   `'undo'`; Caps-Lock `{key:'Z', metaKey}` → `'undo'`;
   `{key:'z', ctrlKey, shiftKey}` → `'redo'`; `{key:'z',
   metaKey, isEditableFocused}` → `null`; `{key:'Delete',
   isEditableFocused}` → `null`; `{key:'Delete'}` →
   `'delete'`. Red: the export does not exist.
3. Add `canvas-focus` to the FSM — `flow-fsm-types.ts:
   96-100` gains `{ kind: 'canvas-focus'; nodeId: string |
   null; edgeId: string | null; isRenderedSelected:
   boolean }`, the `space-toggle` / `isFormFocused` shape:
   the listener reports a DOM fact, the reducer decides.
   `onCanvasFocus` after `onCanvasKeyActivate`
   (`flow-fsm-reduce.ts:738-790`): mid-gesture → no-op (the
   `onSpaceToggle` guard, `:684-686`); `isRenderedSelected`
   → no-op (the loop-breaker); else single-select the node
   or edge with `request-update` only — focus is the
   keyboard's click, Enter stays its double-click. The
   guard reads the rendered `aria-current`, not the FSM's
   selection, because the page writes selection behind the
   FSM (`detail.ts:557-563, 372-376, 405-409, 1751-1760`)
   and `aria-current` IS the presenter's selection
   (`flow-graph.ts:1322-1323, 580-581`). Five pins in
   `tests/flow-fsm-reduce.test.ts`: unselected node →
   `{nodes:[id]}` + `request-update`, no `open-panel`;
   rendered-selected → same state, no actions; dragging →
   ignored; edge → `{kind:'edge'}`; a foreign multi-
   selection collapses to the focused node. Red: the kind
   is unknown. Inert without a dispatcher.
4. Restore canvas focus across rebuilds — `update()`
   captures `canvasFocusOf(document.activeElement, wrap)`
   before `renderUpdate` and calls `restoreCanvasFocus(
   focus, wrap)` after; both exported from the page module.
   `CanvasFocus = { kind: 'node' | 'edge'; id }`.
   `canvasFocusOf` is null unless `wrap.contains(active)`
   and the ancestor walk finds `data-node-id` /
   `data-edge-id` — the panel, the name input, a
   `<dialog>`, and `<body>` yield null, nothing is stolen.
   `restoreCanvasFocus` iterates `querySelectorAll(
   '[data-node-id]')` / `'[data-edge-id]'` (the
   `elementsByAttr` idiom, `flow-gesture-render.ts:72-86`)
   and, on an `SVGElement`, calls `focus({ preventScroll:
   true })` — the wrap is `overflow: hidden`
   (`pages-flow-detail.css:119-133`) and a bare `focus()`
   scrolls against the viewBox camera. The previously
   focused id, never `aria-current`; a deleted id finds
   nothing and focus stays on `<body>`. Pins, new
   `tests/flows-detail-canvas-focus.test.ts` with
   `globalThis.SVGElement = class {}` beside the existing
   stubs: `canvasFocusOf` on a `<text>` child → `{node}`,
   an edge → `{edge}`, null / outside / the wrap itself →
   null; `restoreCanvasFocus` calls `focus` once with
   `{ preventScroll: true }` on the matching id, zero times
   for a missing id or null. Red: the exports do not exist.
5. Promote canvas focus to selection — a `focusin` listener
   on `wrap` beside the pointer listeners (`flow-
   interactions.ts:457, 555, 604, 662`), typed through
   `instanceof Element`, discovering ids with `ancestorAttr`
   (`:267-279`) and sampling `aria-current` the same way.
   MUST follow commit 4: promotion without restore drops
   every Tab to the document top. Traced: Tab → `focusin`
   → `request-update` → full commit → capture → `setHtml`
   → restore → nested `focusin` with `isRenderedSelected:
   true` → no-op → `reconcileFitFromDom` → with the panel
   open, `withSelectionCentered` pans as a click does. The
   Enter path's `open-panel` before `request-update` costs
   one extra commit and terminates on the next rebuild.
6. Leave Space to the item it activated — `handleSpace`
   (`:701-717`) returns on `ke.repeat || ke.
   defaultPrevented`; the activation listener already
   `preventDefault`s (`:741`) and `document` listeners run
   before `window` on the bubble path. `isFormFocused`
   untouched; F57 holds.
7. Document keyboard selection — TEST-PLAN F38
   (`:1368-1370`): Tab until a node shows the focus
   outline — it also takes the selection (glow,
   `aria-current="true"`), panel closed; Delete or
   Backspace deletes it, focus on `<body>`. New F38a: Tab
   again moves to the next node or edge, never the page
   top; selection follows; with the panel open the camera
   pans, zoom unchanged; Tab across a marquee group keeps
   the group. New F38b: Tab to a node, Enter — its panel
   opens and the node keeps focus through the re-render;
   Escape closes and focus stays. A mouse click selects
   without keeping focus. F39 (`:1371-1374`): with Undo
   enabled, Cmd+Z / Ctrl+Z matches Undo; without a node
   click between, Cmd+Shift+Z / Ctrl+Shift+Z (`key: 'Z'`)
   matches Redo. New F57a after F57 (`:1485-1488`): Tab to
   a node, tap Space — panel opens, pan stays off.
   Known-MCP bullets: chords carry the browser's `key`
   (Shift uppercases); `el.focus()` selects like Tab while
   `el.click()` fires no `pointerdown` and selects nothing.
   FLOW-CANVAS.md `## Layers` and `## The FSM seam`: focus
   promotes to selection via `canvas-focus`; the page
   restores canvas focus after every rebuild in `update()`.

### 5. Product: a Record archives from its detail page (R15)

Two commits in the sibling voice (objectives dialog
`web-app/organization/index.html:80-106`, `index.ts:
249-257, 412-423`; projects `projects/detail.html:25-44`,
`detail.ts:358-383`); the plan copy rides §9.

Presenter. `presenters/record-detail.ts:492-497` wraps Edit
in `<div class="flex gap-2">`; before it, when
`this.#view.record.isActive()` (`api/types.ts:1623-1629`,
its first caller), `<button id="record-archive-btn"
class="btn btn-outline" data-dialog-open="confirm-archive">`
with `iconArchive(ICON_SIZE.base, '')` and the text Archive.
Pin, new `tests/presenter-record-detail.test.ts` on
`tests/presenter-project-action-bar.test.ts:44-64`: an
active record's HTML matches `data-dialog-open="confirm-
archive"` and `Active`; an archived record's matches
neither the button nor `Active` and matches `Archived`.
Red today: the markup ends at `#record-edit-btn`.

Dialog and wiring. `records/detail.html` gains `<dialog
id="confirm-archive-dialog" class="dialog dialog-narrow"
role="alertdialog">` in the `:5-30` shape — title "Archive
Record?", `data-dialog-cancel="confirm-archive"`, a
`btn btn-primary` `data-action="confirm-archive"` Archive
(reversible at the gate; not destructive). `onDocumentClick`
(`records/detail.ts:272-298`) gains, after
`handleDialogClick`, a `[data-action="confirm-archive"]`
branch: `closeDialog('confirm-archive'); void
handleArchive(root);`. `handleArchive`: return unless
`pageState.kind === 'reading'`; `const entity = await
getRecord(ctx, recordId)` (the list page's reorder already
takes this hop, `index.ts:131-143`); one `try` around
`postRecordStateChange(ctx, entity, 'archived')`, `catch` →
`reportFault(ctx, 'Failed to archive Record', err)`; then
`showToast('Record archived', 'success')`. No `load(root)`:
the `:104-108` subscriber re-renders the badge. Imports
from the adapter barrel (`adapters/index.ts:38`). No client
guard on bindings or instances — nothing downstream reads
record lifecycle, and ideas and projects carry none.

Not touched: server, validators, derive, adapter, list
page, `RECORD_STATE_CONFIG`, the instances section, flow
binding, seed.

TEST-PLAN R15 (`:2778-2781`): open the R2-created Record's
detail — never Customer Profile (R16–R21 read it); click
Archive; confirm in the house dialog; PASS: "Record
archived" toast, the header badge reads Archived and the
button is gone; on `records/` the card reads Archived, an
Archived chip appears beside Active, and toggling the
Active chip hides the card; there are no numeric counts.

### 6. Seed: an R member seat and an ACL subject (R21)

`formRExtras(organizationId, adminId, requestAt)` beside
`formKExtras`, called from a `section === 'R'` branch beside
K's (`test-plan-slices.ts:3237`). It returns `{ member,
record: { body, messagePairs }, attributePuts }`.

Seat: `formExtraIdentity(sliceEntityId('r-member'), 'R
Member', 'r-member@test-plan.example', requestAt,
organizationId)` — `formSvExtras`' shape (`:1124-1136`);
pushed through `extras` → `writeExtraIdentity` (`:1905`);
the recipient pushed and the reveal spread with
`memberUsername` / `memberPassword` in G's form
(`:3190-3215`), so the existing `SLICE_REVEAL_FIELDS` prints
`R member_username` / `R member_password`.

Record: `Account Review` (`r-record-review`, `position: 2`),
a composed create with `attributes: []`, `initialState:
'active'`, `initialStateEventId: r-state-record-review`,
through `validateRecordWriteBody` → op pair at
`RECORD_TYPES_COLLECTION_PATTERN` + document pair at
`RECORD_TYPE_DETAIL_PATTERN` — `formRecordBindingMessage
Pairs` (`:2101-2147`) duplicated without the attribute and
binding halves, the second instance. Written after the
gardens as the F2 loop does: `postRecordWriteOp(view, body,
SYSTEM_MEMBER_ID, { operation, document, attributePuts: [],
attributeDeletes: [] })` (`:3353-3365`).

Attributes: two nested-PUT pairs from `formSeedMessagePair`
at `ATTRIBUTE_DETAIL_PATTERN` with `idParams:
[organizationId, recordId, id]` — the `attributePuts` shape
(`:2148-2170`) — both role arrays spelled, never stamped:
`Owner Notes` (`r-attr-review-notes`, `attribute_type:
'text'`, `sort_order: 1`, `read_roles: [...DEFAULT_
ATTRIBUTE_ACL_ROLES]`, `write_roles: ['admin']`) → member
read-only; `Credit Limit` (`r-attr-review-limit`,
`sort_order: 2`, `read_roles: ['admin']`, `write_roles:
['admin']`) → member omitted. Each validates through the
route's own spec at formation (`nestedAttributeWireOf`,
`routes.ts:1011-1025`). Appended after the record with
`appendMessagePair` (`:3373-3375`). Ledger: create an empty
type, PUT an attribute, PUT an attribute — three operation
ids, what an operator does today.

`SLICE_ENTITY_IDS`: `r-member`, `r-record-review`,
`r-state-record-review`, `r-attr-review-notes`,
`r-attr-review-limit` — five `generateIdentifier()` mints,
the `857ac8cd` way. Pairs 4 + 2 + 2 = 8: `tests/test-plan-
slices.test.ts:48` 499 → 507; "garden slices seed Customer
Profile" (`:427-449`) gains `section === 'R' ? 2 : 1` and
finds Customer Profile by name; `tests/pg-seed.test.ts:
342-345` drops `'R'` from `omitExtras` and adds an `rMember`
match beside `gMember`.

Pin, new `tests/slices-acl-projection.test.ts` on
`tests/slices-record-binding.test.ts:28-42`: seed;
`deriveMembershipsForIdentity(db, sliceEntityId('r-
member'))` is one seat, `type === 'member'`, in `r-org`;
`claimToken` as the member; `getRecordAttributesByRecord(
ctx, sliceEntityId('r-record-review'))` lists both;
`projectInstanceFields(…, projectClaimRolesForOrganization(
roles, organization))` deep-equals `[{ notes, readonly }]`
by id and access; as `r-admin`, both `writable`. Red today:
`sliceEntityId('r-member')` throws.

Not touched: `formGarden`, `formRecordBindingMessagePairs`,
`validateRecordAttributeEntity`, Customer Profile and its
graph — R3–R14, R16–R20, and WB keep their subjects.

TEST-PLAN R1 (`:2706-2707`): Parallel: Customer Profile and
Account Review (the R21 subject; never edit it). R21
(`:2806-2812`): on Account Review — as the R admin, New
instance: Owner Notes and Credit Limit both render
`data-access="writable"`; sign in as `member_*`, open the
instance: Owner Notes renders `data-access="readonly"`,
Credit Limit is absent (`read_roles: ['admin']`); PASS:
projection matches held roles; no ACL UI on this page (ACLs
are set only by `PUT …/attributes/:id`). Serial: set the
roles by the nested PUT on a record no case edits.

### 7. Gate: the composed edit carries each ACL forward

`formRecordWriteMessagePairs` (`api/routes.ts:857-908`)
runs before the transaction (`:5118-5131`). For `b.kind ===
'edit'` it loads `loadAttributeSchemaById(db, organization,
b.id)` once (`:985-1008`, the instance gates' own read);
each attribute whose id is present takes that row's
`readRoles` / `writeRoles` as `read_roles` / `write_roles`
into the body handed to `recordAttributeDocumentBodyOf`,
which keeps arrays it is given (`:844-851`); a new attribute
keeps the default. Covenant: an ACL is set only by the
nested attribute PUT; the composed edit never touches it.
The validator's key set is unchanged — the client still
cannot send roles, correctly. Its header comment (`:825-
828`) says so.

Pin, `tests/api-record-types-composed-op.test.ts` beside
the `:294` edit case: composed create with two attributes →
nested PUT restricting one to `['admin']` both ways →
composed edit renaming the other → GET shows the restricted
one still `['admin']` and the renamed one the default. Red
today: the GET reads `['member','admin']`.

### 8. Seed: the G reveal prints `erasable_*` (A3)

`server/seed.ts:197`, after the `memberPassword` entry and
before `flowId`: `{ key: 'erasableUsername', field:
'erasable_username' }` and `{ key: 'erasablePassword',
field: 'erasable_password' }`. Nothing in `api/`; pair count
unchanged.

Pins, `tests/pg-seed.test.ts`: the TSV case (`:245`) gives
the G row `erasableUsername` / `erasablePassword` and asserts
`/^G\terasable_username\t…$/m` and `/^G\terasable_password\t
…$/m`; the omit-absent case (`:316`) adds `'erasable_
password'` to `extraPasswords` (`:337-341`) and a
`gErasable` match beside `gMember` (`:376-382`) of length
≥ 16. Red today: no `erasable_` row prints. TEST-PLAN: none;
`:464` already says `erasable_*`.

### 9. TEST-PLAN corrections

One commit for drift; wording a product change makes true
rides with that change (§1–§6).

- C4 (`:879-880`): "and a full-width Objectives box below"
  → "and, below the grid, an Objectives box one gauge
  column wide (`.objective-aggregates-card`,
  `calc((100% − 2·--space-6) / 3)`; full width only under
  768px; card title "Objectives")". K27 (`:2633`): "(full-
  width row below; …)" → "(below the grid, one gauge column
  wide; …)". Pin, green before and after, on the
  `tests/fusion-angle-mark.test.ts:40-50` shape:
  `components-metrics.css` matches the width rule and
  `responsive.css` matches `.objective-aggregates-card {
  width: auto; }` inside the `max-width: 767px` block.
- Summary (`:336-358`): F. Tools 77 → 80 (F38a, F38b,
  F57a); Total 398 → 401; the green-run line follows.
- The three Known-MCP bullets (§2, §4).
- Protocol (`:2963-2964`): "Implementing those specs is a
  later session" → "…is tracked in `TODO.md`".
- The four future-work sentences become `see TODO.md`
  pointers: `:2095` (email delivery), `:2307-2313`
  (billing), `:1450-1451` (flow-tag designer UI), `:800`
  (SP-6). Conditional case notes (F2, R6–R8) stay.

### 10. `TODO.md`: the single home for later work

A root document, 78-char lines, under the retired-vocabulary
lint and a new `TODO.md` row in `./validate`'s line-count
table (`validate:46-55`) at the table's own rule — written
size × 1.5, rounded up to the nearest 50. Four commits: (a) move —
`TODO.md` is born holding ARCHITECTURE.md `## Later work`
(`:261-304`) verbatim under `## Later work`, and
ARCHITECTURE.md loses the section, nothing else; (b)
pointers — `AGENTS.md:229` drops "later work" and the `##
Read next` table gains `| TODO.md | critical path, later
work, sequencing |`; `README.md:55`'s table gains the same
row; the close protocol from `2026-08-22-known-seams-later-
work-design.md:200-213` is restated in `TODO.md`, not
edited there; (c) content — the critical path, the merges,
the new items, sequencing; (d) gate. `## KNOWN seams` and
`## Do not resurrect` stay in ARCHITECTURE.md.

`## Critical path` — twelve items, in this order, each a
brainstorm → spec → plan → ship cycle, implemented
sequentially; merged bullets keep their oracles and leave
`## Later work`:

1. Remove the lifecycle trio — `state` / `state_at` /
   `state_event_id` folded into every document body
   (Decision 7): the reduction `api/derive-documents.ts:
   148-157`, the stamp `document-family.ts:118`, every
   derive (`derive-ideas.ts:54, 83`, `derive-projects.ts:
   39, 70`, `derive-flows.ts:75`), the seeds (`seed-
   message-pairs.ts:733, 913`), the validators' trio-key
   gates; lifecycle becomes its own event rows. Merged: no
   lifecycle transition table at any gate.
2. Credentials out of the message; views for the app —
   hoist `Authenticate:` (ideally the only plaintext
   credential path) into its own column; a view that omits
   it and omits deleted rows; a schema-owner role and
   view-only application roles (read-only, write-only,
   read-write), none able to read the column. Merged: L7
   token-at-rest hashing (closes KNOWN seam "A raw dump
   still has verbatim auth messages" — `tests/api-shadow-
   ledger-auth.test.ts`); L8 two-role views (`tests/
   backend-postgres.test.ts:391`); L4 physical PII erasure
   (closes "Erased PII persists as superseded pairs" —
   `tests/api-pii-tombstone.test.ts`); `api/mock-data.ts:
   151-152`'s in-band plaintext comment (owner call).
3. Cachability — headers, `HEAD`, conditional requests, and
   the rest; the brainstorm presents its questions from
   most to least desirable. Start: `server/http-server.ts`
   `NO_STORE` and `CONTENT_SECURITY_POLICY`.
4. `/status` — `{ up: boolean, components: { postgres:
   boolean } }`; `up` is true when every component is;
   built for more components. Item 10's health probe.
5. Execute TEST-PLAN.md with up to 48 subagents — after
   this spec ships; the Protocol's one-profile, hunters-
   in-turn contract is revisited for 48. Merged: the five
   run-four stubs (absorbed here).
6. Re-implement workbox, work orders, and flows — nodes →
   processes; process kinds: record modification
   (current), external process synchronization (new),
   directed cyclic graph (flow and sub-flow), directed
   cyclic graph (sub-graph); a chat on every record and
   work order (consumes item 8). Merged: L1 READY gate on
   dangling refs (`tests/adapters-flow-publish.test.ts`);
   L6 locked verbs not executed (`tests/family-registry.
   test.ts`); the flow-tag designer UI (`TEST-PLAN.md:
   1441-1451`); F6's ZIP import not rebinding `flow_
   records` (`:1100`); the canvas seams this spec leaves —
   page selection writes behind the FSM (`detail.ts:
   557-563, 372-376, 405-409, 1751-1760`), in-place
   `viewBox` mutation (`flow-designer.ts:537-538, 555-559,
   1022-1025, 1051-1053`), `hasUndoHistory` as `pairs > 1`
   (`derive-flows.ts:108`), rotation only on the toggle
   path (`flow-layout.ts:1008-1013`), the mirror trigger.
7. Headless AI worker — a server-side process that watches
   each AI process-worker's workbox, claims, assembles the
   record definition, the attribute values (which —
   decided in the brainstorm), the node instructions, and
   whatever else serves, asks the model to follow them
   precisely, and applies the reply: attribute updates in
   record-PATCH form and the outgoing edge. API-only.
   Merged: L11 roster seat naming an AI agent (`tests/
   family-registry.test.ts:112-113`); FLOW-CANVAS.md
   `:124-126` display-only AI checkboxes; `withNodeTask
   Instructions` already stores the instructions.
8. Chats at `/api/chats` — attachable to any document at
   `/…/:collection/:id/chat` with as little ceremony as
   the plane allows.
9. Genericity — DRY, even once (the indulgence); spec away
   every nit. Merged: L9 `putRecordInstance` PATCHes (name
   lie — `tests/adapters-record-instances.test.ts`,
   `tests/api-instances-create.test.ts`); L10 same-body
   PATCH appends 201 (`tests/api-instances-create.test.ts:
   585-586`); L16 member detail's redundant GET trio
   (`web-app/members/detail.ts`); two zoom implementations
   and two constant sets (`flow-fsm-reduce.ts:630-654`,
   `flow-interactions.ts:781-815`, `:12-14`, `:16-18`);
   `#noteMutation` / `history()` beside `advanceHistory`
   (`flow-designer.ts:223-229`); four hand-kept copies of
   the reveal key set (`test-plan-slices.ts:121-138,
   3085-3112`, `seed.ts:174-199`, `pg-seed.test.ts:
   337-341`); the second instances this spec adds
   (`formRExtras`' record create, `canvasFocusOf`'s walk);
   `flow-graph-diff.ts:16-26`; the dead `FK_SPECIAL` map
   (`schema-svg.ts:100-110` — remove the comment at
   `:100-110` when done); `callerOrganizationIds`, zero
   callers (`request-auth.ts:189-197` — remove the comment
   when done); the test-only `deriveRecordStateHistory`
   alias (`derive-record-types.ts:185-189` — remove the
   comment when done); the `#flowDesc` stub (`presenters/
   flow-stats.ts:414-417` — remove the comment when done);
   `toRecordAttribute`'s `??` ACL default (`adapters/
   record-attributes.ts:76-79`) and the two readings of an
   absent role array (`routes.ts:953-981` vs `:839-851`);
   the nested key-set follow-on (`validators.ts:705-713` —
   remove the comment when done); `handleSpace` dispatching
   `isFormFocused: false` unconditionally; Delete's
   `preventDefault` with nothing selected.
10. Production readiness, repository and Render — block
    cross-environment connections, high-availability app
    and Postgres, and the rest. Merged: the single-mint-
    process KNOWN seam's precondition — record the claim-
    expiry decision as its own event before any multi-
    process deployment (`derive-states.ts:811-823` — remove
    the comment when done); the `TRUSTED_PROXY_HOPS`
    throttle seam (`tests/http-throttle.test.ts`); stale-
    until-navigation once there are processes to notify
    (`tests/advisory-lock.test.ts`). Consumes item 4.
11. Fewer JSON parse/stringify — byte-stream header
    setting, mechanical sympathy and simplicity for the
    processor; measured first (`./measure --profile`).
    Merged: the deferred content-coding seams (`shared/
    http-message/body.ts:76-79`, `content-coding.ts:5-7`).
12. Simulated latency by environment — when
    `FUSION_ANGLE_ENVIRONMENT` is exactly `local` and
    `FUSION_ANGLE_LATENCY` is a millisecond count, both
    present and non-empty, every API request takes the
    existing log-normal sampler (`api/latency.ts:18-40`)
    with `mu = ln(FUSION_ANGLE_LATENCY)`; otherwise the
    no-op. Merged: the shim's "both presets pass a no-op
    today" (`api/latency.ts:1-5`, `db-backed.ts:31-32`,
    `api.ts:2133-2134` — revise the comments when done).

`## Later work` — off the critical path, each with its
oracle: L2 one client 401-recovery voice (`tests/adapters-
http-facade.test.ts`); L3 toast pause on hover and focus;
L5 the mock seed's 2026-06-15 anchor (after 2026-09-13
serial FS3 carries in-flight heat only); L12 profile as its
own document (`tests/api-identity-document.test.ts`) → L13
fabricated roster profiles (`adapters/members.ts:48`) and
L14 `DEFAULT_DIM` (`members/index.ts:52`); L15 the re-mint
refresh not single-flighted (`adapters/shared.ts:463-464`);
L17 `./measure` harvesting error-page timings (`measure.
ts`); the cross-party delegation ledger (`authentication.
ts:884-886`; `tests/api-authentication-token.test.ts:678`);
passkey, provider-IdP, and corporate-OIDC ceremonies
(`:1595-1597`; `tests/api-authentication-authorize.test.ts:
225`); per-client multi-audience, DPoP `cnf`, jti reuse
detection (`types.ts:508-510`; `shared/access-token-
decode.ts:30-31`); SP-6 sign-up (`web-app/auth/index.ts:
655-663`); billing (`web-app/billing/`); invitation email
delivery; the `≥ N` doc debt (`TEST-PLAN.md:131-132`);
attribute drag-reorder (R8); this spec's remaining seams —
the Objectives sparkline track collapses at 304px
(`components-metrics.css:80-82`), archived records in the
flow-header dropdown (`flows/detail.ts:1320-1343`), Edit
rendered for members on record detail (`record-detail.ts:
492-497`), the binding PUT not probing record existence
(`routes.ts:5559-5562`), R12 without a positive subject,
stale G9 / R6 / R7 notes; the Deno migration as one block
— six specs, strict 1 → 6, 3 and 4 may swap after Spec 2's
measurements, Spec 6 optional ("the measurements after
Spec 5 decide"), the roadmap at `9620d38c`; stale-history
comment cleanup as one item (about 35 code and 32 test
comments that describe a past state as present — the
enumeration is the Evidence). Every code-comment item ends
"remove the comment at `file:line` when done".

`## Sequencing` — the edges: 8 → 6's chat clause; 4 → 10;
L7 and L4 close their KNOWN seams (the closer removes both
bullets in one commit); L12 → L13, L14; L5's date; the Deno
order; `derive-states.ts:811-823` before any multi-process
deployment. `## Close protocol` — the pin flips red → fix
the test → remove the bullet → remove the named comment →
for a KNOWN seam, remove the ARCHITECTURE.md bullet in the
same commit → AUDIT's `m` is the new count.

Gate (d), in `./validate`'s lint block beside the retired
vocabulary — no test greps a doc: `grep -c '^## Later work'
ARCHITECTURE.md` is 0; `grep -c '^## KNOWN seams'
ARCHITECTURE.md` is 1; `grep -c '^## Critical path' TODO.md`
is 1; the root docs except `TODO.md` and TEST-PLAN.md match
none of `later work|\(later\)|not built|coming soon|later
session|will be added when` — today `AGENTS.md:229` alone,
which (b) rewrites.

### 11. Housekeeping

The five files under `docs/superpowers/test-plan-
mitigations/` are absorbed here and removed by commit (they
are tracked, `88d4e4f8`). The Protocol line is §9's. The
run-four plan, when written, stays untracked and is removed
when it ships.

## Testing

Every new test runs under `./test` on memory in both TZ
passes; none needs Chrome or Postgres. Red before green:

- §1: red — an orphan ahead of Create heads the column; the
  mirror puts Archive first; a wrapped chain starts on the
  orphan. The Layout Test guard: green before and after.
- §2: red — the gesture context carries no `interaction`;
  `withCanvasSize` re-fits a non-auto-fit presenter.
- §3: red — `tsc` rejects the arity; under `--strip-types`
  B takes A's name. The depth pin: green before and after.
- §4: commit 1 green; commit 2 red — no export, and lifted
  verbatim the redo and Caps-Lock cases stay red; commit 3
  red — unknown kind; commit 4 red — no exports.
- §5: red — no `confirm-archive` in the markup.
- §6: red — `sliceEntityId('r-member')` throws.
- §7: red — the restricted attribute reads the default.
- §8: red — no `erasable_` row.
- §9: the CSS scan green before and after.
- §10: the gate red until (a) and (b) land; green after.
- `./validate` green after every commit; the slice pair
  count moves 499 → 507 and nowhere else; 1448 never moves;
  the browser count 398 → 401.

## Commits

One concern each, present-tense imperative, about fifty
characters, rebase and fast-forward, trailer lines
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
`Claude-Session: …`. Pins land with the change that greens
them; move-only commits carry nothing else. Order: spec; §1;
§2 context → `withCanvasSize` → drop the `state` parameter;
§3 bind → render post-flush; §4 one through seven; §5
presenter → dialog and wiring; §6; §7; §8; §9; §10 move →
pointers → content → gate; §11. About twenty-five.

## Evidence

The run-four mitigation stubs (`88d4e4f8`, absorbed here,
then removed); six investigator reports and two follow-ups
with reproductions under the session scratchpad
(`f18-repro-db.ts`, `f18-covenant*.ts`, `f18-fuzz.ts`,
`f29-repro.ts`, `f29-seams.ts`, `undo-redo-repro.test.ts`,
`repro-keydown.ts`, `repro-fsm.ts`, `repro-click-clears-
redo.ts`, `r15-repro.test.ts`, `repro-a.ts`, `repro-c.ts`,
`repro-c2.ts`) — never committed; the future-work inventory
over the tree at `88d4e4f8`; commits `f59ef319` (the corner
sentence), `a735a7de` (Sugiyama), `3ed3c57b` (the mirror),
`ba2261b9` (median centering), `5c7c0914` (Archive last in
its column), `143a8df1` / `4f4239e1` / `b9806901` (the
shared camera and its loss), `410b30a7` / `8ab5a41d` (the
unbound closure and the history write-back), `1e9d50bf`
(the chord), `2cacdbf0` / `68ceb3dd` (tabindex and key
activation), `a8b0a1bd` / `627118ba` / `dc743b47` (R15, the
adapter's life and death, the chips), `736781ea6` /
`19dfb8621` (G Erasable and the reveal writer), `0f03bee8`
/ `4e839500` (the column width and the copy), `9620d38c`
(the Deno roadmap).

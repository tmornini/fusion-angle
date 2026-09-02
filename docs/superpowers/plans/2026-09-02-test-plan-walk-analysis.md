# TEST-PLAN Walk 2026-09-02 — Root-Cause Analysis

> **Standing record.** This is the complete forensic analysis
> of the ten FAILs (plus the BLOCKED / DRIFT context) from the
> 2026-09-02 TEST-PLAN walk. It is written so NOTHING has to
> be re-derived: every conclusion carries the evidence and the
> code location that supports it.
>
> **Companion:** `2026-09-02-test-plan-remediation-brief.md`
> turns these findings into a plan. This file is the "why";
> the brief is the "what to do".
>
> **Product SHA analyzed:** `04372ead` (clean).
> **Walk worktree:** `.worktrees/2026-09-02-test-plan-walk`.

---

## Headline

**There is no single root cause under the ten FAILs, and the
walk was not run in parallel.** The failures resolve into two
systemic clusters, two genuine product defects, and one
document-ordering bug:

- **Cluster A — the gesture-driving layer (driver):** F23,
  AA32, AA33, AA34, F26, F28, F14, F37b, R12. Compositor and
  tab-visibility limits of the `browser-use` driver, not
  product faults. Every Layer 1 pin for these is green.
- **Cluster B — the records chain is document-order
  (seed/plan):** R14, R16. One seeded instance, mutated
  mid-walk, read downstream under its new value.
- **Confirmed product defect #1:** F12 — a focused node steals
  the Space keypress so pan mode never toggles off.
- **Confirmed product defect #2 (found by code review, not the
  walk):** a zero-delta node click queues a save and pollutes
  undo history.
- **Document drift:** E10a, A3 pin, and the R13/R14 "fillable
  while unbound" text.

---

## 1. Evidence the walk was serial, single-jar

The suspected "parallel execution / shared cookie jar" cause
is ruled out by three independent signals.

1. **One daemon, not many.**
   `~/.config/browser-harness/runtime/` held a single Sep-2
   socket pair, `bu-default.sock` / `bu-default.pid`, created
   04:59. The prior (Aug 29) walk had left a dozen NAMED
   per-section daemons (`bu-tp-aa`, `bu-tp-f`, `bu-tp-f2`, …).
   Named-daemon mode is the ONLY `browser-use` mode that
   shares one Chrome across clients; it was not used. One
   client, one cookie jar, one origin.

2. **No auth signature on any failure.** Not one FAIL shows a
   429, an auth-page bounce, or a wrong-identity sidebar chip.
   A shared-jar or token race would leave exactly those marks.

3. **The one tab hiccup was serial, not concurrent.**
   `~/.config/browser-harness/tmp/bu-default.log` is six lines
   long and contains a single `stale session … re-attaching`
   event that landed on
   `flows/detail.html?flowId=DDUhYDIRInXtIrRraxcyHQ` (the
   Layout Test flow). That is a tab-visibility recovery during
   the F section, not two clients contending. "A later
   explorer pass" in the summary is a second SERIAL pass, not
   a concurrent one.

---

## 2. The driver's input model (why Cluster A fails)

Read from the installed `browser-use` source
(`browser_harness/helpers.py`, `daemon.py`):

- **A click is press + release at a point, with no move**
  (`click_at_xy` → `Input.dispatchMouseEvent` mousePressed
  then mouseReleased). There is no drag helper.
- **A key press is key-down then key-up, back to back**
  (`press_key`). Nothing can HOLD a modifier across a mouse
  gesture from the high-level API.
- **New tabs are born hidden** (`new_tab` →
  `Target.createTarget … background: true`).
- **Stale-session recovery on the default daemon attaches to
  the first listed real page**, not necessarily the visible
  one (`attach_first_page`).

On the product side (`web-app/app/flow-fsm-reduce.ts`,
`flow-interactions.ts`):

- A double-click is **two pointerdowns on ONE element id
  within `DBLCLICK_MS` (400 ms)**, with no canvas pointerdown
  between them. There is no `dblclick` listener.
- Shift is honored from the pointer event OR from window
  key-tracking (`pointerIsShift(shiftHeld, e.shiftKey)`), and
  is forgotten on key-up.
- The `<svg>` is REPLACED on every commit — a gesture must
  query it fresh.

---

## 3. Cluster A — per-case reasoning (driver)

### F23, AA32 — Shift not delivered on pointer-up
`finishConnect` (`flow-fsm-reduce.ts`) emits `add-edge` only
when `input.isShift && hoverNodeId`; otherwise it emits
`add-node`. The driver releases Shift before pointer-up, so
the release reads as a plain drag → `add-node`. This is the
exact limit the TEST-PLAN driving notes prescribe BLOCKED
for. AA32 was scored BLOCKED; **F23 should be BLOCKED too, not
FAIL.** Layer 1 pins (`shift-drag … emits add-edge`) are
green.

### AA33, AA34 — mis-target after AA32's stray nodes
Both recurred (08-27, 08-28, 09-02) immediately after AA32
left stray "New State" nodes on an auto-layout flow. The
double-click opened Review's panel instead of Data Capture's
— a targeting miss after the graph re-flowed, not a
write-path fault. **Disposition: DEFERRED on AA32.** Layer 1
pins (`performAddAttributeRef`, `applyUpdateAttributeMode`,
`applyUpdateAttributeRequired`) are green.

### F26, F28 — edge selection mis-hit
No product rule forbids either. Confirmed in code:

- The edge is a `<g data-edge-id>` carrying a WIDE TRANSPARENT
  hit `<path>` (`stroke="transparent"`,
  `stroke-width=HIT_TARGET_WIDTH`) plus the visible path
  (`flow-graph.ts`).
- `#canDelete()` (`presenters/flow-designer.ts`) returns
  `true` when `sel.kind === 'edge'`.

So "Delete stayed disabled / panel didn't open" means the
selection was NOT an edge when the toolbar was clicked: the
click missed the curve (the `<g>` bbox center need not lie on
the bezier) or fell on canvas, which clears selection.
**Driver mis-hit; confirm by Layer 2 re-drive.**

### F14 — the Zoom-in click never took
`viewBox` "collapsed to the wrap 910×549 / 1102×549" is the
UNTOUCHED IDENTITY camera, not a camera bug:

- `.flow-props-panel` is `position: absolute`
  (`pages-flow-detail.css`), so opening it does NOT resize the
  `.flow-canvas-wrap`.
- `withAutoFitToggled` only re-fits when toggling Auto Fit ON;
  turning it OFF leaves the camera alone.
- `reconcileFitFromDom` no-ops when Auto Fit is off.

A `viewBox` equal to the wrap at zoom 1 therefore means the
Zoom-in click never registered — a missed gesture. Camera code
is clean. **Confirm by Layer 2 re-drive.**

### F37b — driven on the hidden second tab
Recurs on every walk, always right after F37a opens a SECOND
tab (born hidden). The plan never re-activates tab A. On the
product side, the connect port renders regardless of Auto
Layout (`canShowPort` ignores `isAutoLayout`) and `add-node`
has no Auto-Layout branch, so the code offers no
Auto-Layout-specific reason for "port-drag adds no node".
**Leading hypothesis: driven on the hidden tab. Confirm by a
visible-page Layer 2 re-drive.**

### R12 — needs a Layer 1 pin to decide
Gold glow proves the first pointerdown landed. The
node-panel ref-row markup exists only when the panel is open
(`flow-designer-view.ts` `buildAttributeRefRow`), so "no ref
rows" most economically means "no panel". There is **no Layer
1 pin for `buildAttributeRefRow` today.** Writing that pin is
the deciding move: green ⇒ R12 is a driver artifact; red ⇒ a
real presenter bug.

---

## 4. Cluster B — the records chain is document-order

The seed holds **exactly one** Customer Profile instance:
`SEED_INSTANCE_ID = 'inst01W001CustProfAcme1'`, Company Name
**"Acme Corp"**, bound to WO01
(`xqcXYHXBJJXcLkRYkRngKA`). Source:
`api/mock-data/seed-message-pairs.ts` (~lines 532–560, the
`mockStateFieldValues` block) and `api/mock-data/work-orders.ts`.

WB11 can bind only that instance. WB19a's two-tab 412 case
then MUTATES it ("Walk Co B"). Downstream, in document order:

- **R16** reads a renamed instance — the seeded "Acme Corp"
  Company Name is gone.
- **R14**'s bind picker shows the renamed value, so "Acme" is
  absent as the case's text expects.

This is deterministic and serial; nothing parallel is
involved. Two further points:

- **R14's unbound-submit refusal is the product WORKING.** The
  API refuses a value-bearing transition on an unbound work
  order — `ValidationError('work order has no instance
  binding')` in `api/routes.ts`, mapped to **400** in
  `api/api.ts` (`ValidationError → HTTP_BAD_REQUEST`). WB10b
  already documents that unbound inputs are disabled behind a
  bind prompt. The R13/R14 "fillable while unbound" text
  PREDATES instance binding → **drift**. The explorer reported
  409, but the mapping gives 400. R14's real PASS line (the WO
  sitting at Review) was never checked.

---

## 5. Confirmed product defect #1 — F12 Space-steal

**A real mouse reproduces this. The F12 PASS line is
unreachable as written.**

**Mechanism (confirmed in `flow-interactions.ts` +
`flow-graph.ts`):**

1. Nodes render with `role="button"` and `tabindex="0"`
   (`NODE_ROLE`, `FOCUSABLE_TABINDEX`). In pan mode a
   pointerdown on a node is `startPanFromNode`, and the
   pointerdown's default focus is NOT prevented, so the node
   takes DOM focus.
2. Two Space keydown listeners exist, both bubble-phase:
   - `handleSpace` on **window**: `if (ke.defaultPrevented)
     return; if (isFormFocused()) return; ke.preventDefault();
     dispatch('space-toggle')`.
   - the activation listener on **document**: for a focused
     node/edge and `key === 'Enter' || key === ' '`, it calls
     `e.preventDefault(); dispatch('canvas-key-activate')`
     (which opens the panel).
3. In the bubble phase the DOCUMENT listener fires before the
   WINDOW listener. It preventDefaults Space, so `handleSpace`
   then sees `defaultPrevented === true` and returns. The pan
   toggle is swallowed; the panel opens instead.

Result: after a pan-mode node interaction leaves a node
focused, "tap Space to exit pan" opens the panel and never
toggles pan off, so the subsequent double-click just pans.
`isFormFocused()` returns false for an SVG `<g>` (it lists
input/textarea/select/button/a/contenteditable by tagName), so
that guard does not save it.

**Covenant to encode:** Space toggles pan mode whenever the
canvas OR any node/edge in it has focus; Enter opens the
panel. This matches the existing tests (`canvas-keyboard`
tests Enter-opens; `canvas-pan` tests Space-toggles from a
focused canvas). Nodes carry `role="button"`, so Space-as-
activate is the ARIA default; overriding it for the pan toggle
is a DELIBERATE decision to state in the spec and ratify at
review.

**Fix:** gate the document activation listener on `Enter`
only. Let Space fall through with NO `preventDefault`, so the
window `handleSpace` toggles pan. Minimal and local; it only
changes node/edge-focused Space (canvas-focused Space already
flows to `handleSpace`).

**Red test (Layer 2):** pan on (Auto Fit off, focus canvas,
Space); focus a node; press Space; assert `.flow-pan-cursor`
is REMOVED and `.flow-props-panel` did NOT appear (use
`stays()` for the negative).

**Files:** `web-app/app/flow-interactions.ts` (document
keydown Enter/Space block). Test: `tests/browser/canvas-pan*`.

---

## 6. Confirmed product defect #2 — zero-delta node click

**Found by code review, not the walk.** A plain selection
click on a draggable node writes to the server and pollutes
undo history.

**Mechanism (confirmed in `flow-fsm-reduce.ts`,
`presenters/flow-designer.ts`, `flows/detail.ts`):**

1. `onNodePointerDown` (non-pan, non-port, draggable,
   unlocked) enters `drag` state with `initialPositions` for
   the selected set.
2. `onPointerUp`'s drag branch computes `dx`/`dy`. On a bare
   click both are 0, yet it STILL pushes a `move-nodes` action
   with an update per selected node (unchanged positions).
3. The page routes `move-nodes` to
   `commitAndFit(withNodesMoved(updates), {advanceHistory:true})`.
   `withNodesMoved` sees `updates.length > 0`, so it
   `#queueSave` (a PUT) and `#noteMutation` (records undo
   history).

So clicking to SELECT a node emits a spurious PUT and advances
the undo stack. A click is not an edit.

**Fix:** in `onPointerUp`'s drag branch, when `dx === 0 && dy
=== 0`, emit no `move-nodes` (still `release-pointer` +
`request-update`). The FSM is the correct covenant site.

**Red test (Layer 1):** dispatch `pointer-down-on-node` then
`pointer-up` at IDENTICAL `svgX`/`svgY`; assert the emitted
actions contain no `move-nodes` (and that a nonzero delta
still emits one).

**Files:** `web-app/app/flow-fsm-reduce.ts` `onPointerUp`.
Test: `tests/flow-fsm-scenarios.test.ts`.

---

## 7. Disposition table

| Case | Walk | Layer | Root cause | Disposition | Red test? |
|---|---|---|---|---|---|
| F23 | FAIL | driver | Shift not held to pointer-up | Rescore BLOCKED (like AA32) | no |
| AA32 | BLOCKED | driver | same | Keep BLOCKED; add note | no |
| AA33 | FAIL | driver | mis-target after AA32 strays | Rescore DEFERRED on AA32 | no |
| AA34 | FAIL | driver | same | Rescore DEFERRED on AA32 | no |
| F26 | FAIL | driver | edge hit-target mis-hit | Layer 2 re-drive; pins green | Layer 2 (repro) |
| F28 | FAIL | driver | edge selection lost before Delete | Layer 2 re-drive; pins green | Layer 2 (repro) |
| F14 | FAIL | driver | Zoom-in click missed | Layer 2 re-drive; camera clean | Layer 2 (repro) |
| F37b | FAIL | driver | driven on hidden 2nd tab | Visible Layer 2 re-drive | Layer 2 (repro) |
| R12 | FAIL | UI? | panel likely never opened | Write Layer 1 pin to decide | Layer 1 (decides) |
| F12 | (in F FAILs) | **product** | Space stolen by focused node | Red test → fix | **Layer 2** |
| zero-delta | (code review) | **product** | click emits move+save+history | Red test → fix | **Layer 1** |
| R14 | FAIL | doc/seed | unbound refusal is correct; text stale; R16 mutation | Doc fix + seed/order fix | no |
| R16 | FAIL | seed/plan | WB19a overwrote the only instance | Restore or seed 2nd instance | no |
| E10a | DRIFT | doc | hides via display:none not hidden | Doc fix | no |
| A3 pin | DRIFT | doc | 12 human lines, pin says 11 | Doc fix | no |

"Red test?" names the LOWEST layer that can express the
covenant. "repro" tests confirm driver-vs-product: green ⇒
driver artifact, close the case; red ⇒ real bug, fix it.

---

## 8. Confirmed-in-code reference (nothing to re-derive)

- `web-app/app/flow-fsm-reduce.ts` — `DBLCLICK_MS=400`,
  `MIN_DRAG_DISTANCE=20`, `ZOOM_STEP=0.1`, clamp 0.25–2.0;
  `onNodePointerDown` `isDbl` + drag setup; `onPointerUp` drag
  branch emits `move-nodes` at any delta; `finishConnect`
  Shift⇒add-edge else dist>threshold & !overNode ⇒ add-node.
- `web-app/app/flow-interactions.ts` — `pointerIsShift`;
  window `handleSpace` (defaultPrevented / isFormFocused
  guards); document Enter/Space activation listener;
  `isFormFocused()` tag list.
- `web-app/app/flow-graph.ts` — `NODE_ROLE='button'`,
  `EDGE_ROLE='button'`, `FOCUSABLE_TABINDEX='0'`; edge
  transparent `hitPath`; `canShowPort` ignores `isAutoLayout`.
- `web-app/app/presenters/flow-designer.ts` — `#canDelete()`
  true for edge selection; `withNodesMoved` saves + notes
  mutation when `updates.length>0`; `getNodePosition`
  `isDraggable:true`; `withAutoFitToggled` re-fits only when
  turning ON; `PANEL_WIDTH_PX=288`.
- `web-app/flows/detail.ts` — move-nodes ⇒
  `commitAndFit(withNodesMoved…, {advanceHistory:true})`;
  `reconcileFitFromDom` no-ops when Auto Fit off.
- `web-app/app/styles/pages-flow-detail.css` —
  `.flow-props-panel { position:absolute }` (does not resize
  the wrap).
- `api/routes.ts` / `api/api.ts` — unbound value-bearing
  transition ⇒ `ValidationError` ⇒ 400; bind rebind ⇒ 409.
- `api/mock-data/seed-message-pairs.ts` — single
  `SEED_INSTANCE_ID` "Acme Corp" bound to WO01.
- Driver: `~/.config/browser-harness/runtime/bu-default.*`
  (Sep 2 04:59), `…/tmp/bu-default.log` (6 lines, one stale
  re-attach on the Layout Test flow);
  `browser_harness/helpers.py` `click_at_xy` / `press_key` /
  `new_tab`; `daemon.py` `attach_first_page`.

---

## 9. Open questions (settled only by execution)

- **F14, F26, F28, F37b:** confirmed driver-vs-product only by
  a VISIBLE-page Layer 2 re-drive. The analysis says driver;
  the test proves it. If any re-drive fails, it becomes a real
  bug to fix red→green.
- **R12:** decided by the new `buildAttributeRefRow` Layer 1
  pin. Green ⇒ driver; red ⇒ presenter fix.
- **F12 covenant:** "Space is the pan toggle even when a node
  is focused" overrides the ARIA button default. Ratify at
  review before landing the fix.

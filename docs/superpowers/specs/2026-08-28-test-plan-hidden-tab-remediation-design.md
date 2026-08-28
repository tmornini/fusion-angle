# Test-plan 2026-08-28 hidden-tab remediation

The second 2026-08-28 parallel TEST-PLAN run (build
SHA `b7c11c2`, clean at A1/A3; stubs at `4924941`)
reported AT green, 358 browser PASS, and 39 FAILs in
three clusters: AA27–AA35 + AA40, F16…F67 (28 cases),
and WB16. Every stub names the driver. This spec
reproduces the mechanism outside the product and
rules all three clusters drive, not product.

Dated stubs stay frozen:

- `docs/superpowers/test-plan-mitigations/2026-08-28-aa-AA27.md`
- `docs/superpowers/test-plan-mitigations/2026-08-28-f-F16.md`
- `docs/superpowers/test-plan-mitigations/2026-08-28-f2-wb16.md`

Where a stub and a Ruling disagree, the Ruling wins.

## Problem

1. **A hidden tab delays every `mouseMoved` past the
   daemon's timeout.** All fourteen hunters share one
   Chrome; `new_tab()` creates its target with
   `background: true`, so a hunter's tab is visible
   only if something activated it. Chrome aligns
   `mousemove` / `pointermove` delivery to the
   animation frame. A hidden tab paints no frame, so
   a CDP `Input.dispatchMouseEvent` of type
   `mouseMoved` is queued and delivered about five
   seconds later (Chrome's fallback) or when the next
   discrete input event arrives. browser-use's
   `_send` reads the daemon socket with a 5.0 s
   timeout (`helpers.py`, `ipc.connect(NAME,
   timeout=5.0)`), so the helper raises
   `TimeoutError` a few milliseconds before the move
   lands. `mousePressed`, `mouseReleased`, and key
   events are discrete and land at once.

   Measured 2026-08-28 on a bare `data:` page (four
   `pointer*` listeners and a rAF counter — no
   product code), two tabs in one Chrome:

   | Tab | press | move | move | release | rAF/400ms |
   |---|---|---|---|---|---|
   | hidden | 16 ms | 5.001 s timeout | 5.001 s timeout | 4 ms | 0 |
   | visible | 4 ms | 8 ms | 8 ms | 2 ms | 49 |

   The hidden page's own log shows each move arriving
   ~5.0 s after it was sent. A gesture left in flight
   on a hidden tab completed normally once the tab
   was activated (move 11 ms, release 3 ms).

2. **A helper that raises mid-gesture poisons the
   tab.** The hunter's script aborts on the first
   `TimeoutError` and never sends `mouseReleased`.
   The canvas FSM stays in `dragging` / `connecting`
   with pointer capture on the wrap (`capture-pointer`
   in `flow-fsm-reduce.ts`), so later toolbar clicks
   never reach their buttons, Space is ignored by
   design (`isGestureActive`), and Tab / undo / redo
   read as product FAILs. That is the whole F16–F67
   cascade and AA28–AA40. The live gesture paint
   (`scheduleGestureFrame`, rAF) cannot be observed
   on a hidden tab either, so F16's PASS is
   unobservable there even when the commit lands.

3. **AA27's "unconnected New State" is not a product
   path.** `performAddNodeAtPosition` builds the node
   and its auto-edge and commits both in one
   `commitFlowMutation` → one `putFlow`. No `api/`
   path drops an edge. The observation was made
   through a poisoned session; the next run
   re-observes it on a visible tab.

4. **WB16 snapshots too early and reads the wrong
   source.** The hunter hooked `fetch` and dumped
   `performance.getEntries()` at fetch *start*, before
   the transition POST could become a resource entry;
   WB11's success then navigates to the inbox, which
   destroys the detail document's buffer. Resource
   timing entries carry neither request body nor
   headers, so the covenant WB16 names (instance
   shape, strong `If-Match`) is unverifiable from
   that source at all. The daemon's own CDP network
   events carry both, and the hunter saw the correct
   shape there ("same-window log later had
   instance-shape POST + If-Match, no
   `fieldValues`"). The 08-28 morning stub failed the
   other way: `wait_for_network_idle()` drains and
   discards the daemon's 500-event ring, so the
   binding PUT was gone by submit.

5. **The macOS "Allow remote debugging?" sheet is a
   run hazard, not this mechanism.** Each named
   daemon's first CDP connection raises one; the
   daemon holds its handshake up to 45 s
   (`LOCAL_HANDSHAKE_TIMEOUT`) then fails
   `permission-blocked`. The operator reports several
   sheets left unanswered for minutes during this
   run. The hidden-tab delay above reproduces with
   the sheet already answered, so the sheet is not
   the cause of the gesture FAILs; an unanswered one
   stalls or crashes that hunter (section FAIL, not
   product).

## Goals

- Every compositor-mouse gesture (port drag,
  shift-connect, body drag, marquee, pan, list-row
  drag) runs on the visible tab, and a stray
  `TimeoutError` never leaves a gesture in flight.
- WB16 asserts against the daemon's accumulated
  network events, never a drained ring and never
  Performance.
- The hunter prompt carries the visible-tab rule
  (hunters read only their section and the prompt,
  never the Protocol).
- The Protocol records the mechanism and the sheet.
- `./validate` green. Dated stubs frozen.

## Non-goals

- Product changes. rAF-driven gesture paint and
  the mid-gesture Space guard are correct for a
  user; a user cannot gesture on a hidden tab.
- Synthetic `dispatchEvent` pointer events as a
  substitute for compositor mouse.
- A second Chrome process or window per hunter.
- Re-running the browser plan. This spec prepares
  it; the run is `TODO.md` item 5.
- Editing dated specs, plans, or mitigation stubs.

## Design

### 1. Visible tab for continuous mouse

Hunter prompt template: before every compositor-
mouse gesture call `activate_tab(current_tab())`
and confirm `document.visibilityState === 'visible'`;
never activate for anything else. If a `mouseMoved`
still raises `TimeoutError` (a sibling hunter
activated its tab mid-gesture), send `mouseReleased`
at the same point first — it always lands and ends
the gesture — then re-activate and retry that
gesture once. Verify state before scoring.

`activate_tab` is the browser-use skill's own
sanctioned exception ("a page demonstrably pauses
rendering while hidden"); the canvas does.

Protocol § Browser-use driving gains one bullet
naming the mechanism and the measurement. AA27,
F16, D36, E11, and K6 gain one sentence pointing at
the prompt rule.

### 2. WB16 reads the accumulated network log

Before the bind, and after every step through
WB11's inbox landing, the hunter appends
`drain_events()` to its own list (the ring holds
500 events; `drain_events` empties it). No
`wait_for_network_idle()` inside that window. Filter
`Network.requestWillBeSent` on the attached
`session_id`; pair `requestId` with
`Network.responseReceived` for status. Assert the
binding PUT 201, the transition POST 201 whose
`request.postData` is the instance shape with a
strong `If-Match` in `request.headers`, and the
history GET. The Protocol probe sentence changes to
match. PASS shape unchanged.

### 3. The remote-debugging sheet

Protocol § Browser-use driving gains one bullet:
one sheet per daemon connection; answer each at
once or run `browser-use mac-approve`; a 45 s
silence fails that daemon `permission-blocked`;
the sheet does not touch input dispatch.

## File structure

| File | Responsibility |
|---|---|
| `TEST-PLAN.md` | Prompt rule; Protocol bullets; AA27 / F16 / D36 / E11 / K6 pointers; WB16 drive |

## Success criteria

- On the next parallel run, AA27–AA35, F15–F23,
  F34, F49, F51–F54 report no `TimeoutError`, and
  no F case fails for a gesture still in flight.
- F16 observes `transform` following the pointer
  during the drag on the visible tab.
- AA27 re-observes node plus auto-edge after reload.
- WB16 asserts the PUT, the instance-shape POST with
  `If-Match`, and the history GET from the hunter's
  accumulated events.
- Stubs at `4924941` are unmodified.

## Risks

- Two gesture hunters (AA, F) can still activate
  against each other mid-gesture. The release-then-
  retry rule bounds the damage to one retried
  gesture; a second collision is FAIL with a note,
  not a product bug.
- `activate_tab` steals the operator's visible tab
  during a run. The run already assumes an
  unattended Chrome.

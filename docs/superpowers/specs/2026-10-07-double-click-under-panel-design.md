# 0j — a double-click under an open panel lands where a person aimed

- Date: 2026-10-07
- Status: design confirmed by the owner section by
  section, pre-plan
- Item: TODO.md 0j, as the 0a branch filed it (`2f1f8558`)
- Worktree: `.worktrees/2026-10-07-double-click-under-panel`,
  branch `2026-10-07-double-click-under-panel`
- Base: `2026-10-06-walk-recipes` at `ddfc1cb6`, stacked:
  0j's bullet and F13's walk text exist only there
- Lands: after `todo-triage` and `2026-10-06-walk-recipes`,
  in that order, at the owner's call. Rebase onto `master`,
  run `./test validate browser`, then `git merge --ff-only
  2026-10-07-double-click-under-panel` from the main
  checkout, `git worktree remove
  .worktrees/2026-10-07-double-click-under-panel`, and `git
  branch -d 2026-10-07-double-click-under-panel`. Never `-D`
- Sequence: TODO.md lists 0j after the ledger's one deploy
  (0e–0i), and `## Sequencing` names it nowhere. The owner
  asked for it ahead of that order on 2026-10-07
- Ships: the reducer counts a second press at the first
  press's screen point as a press on the element just
  pressed, so a double-click under an open panel keeps the
  panel on its node; one Layer 2 test and a set of Layer 1
  scenarios pin it; FLOW-CANVAS.md names the rule; TODO.md
  closes 0j and files item 11's re-fit as its own entry;
  F13's walk text follows
- Leaves: item 11's "panel callback re-fitting at a
  double-click's second press" (its own `## Later work`
  entry after this ships); touch and pen tuning of the
  slop
- Oracle: the red Layer 2 test (two presses at one point
  on a second node under an open panel leave the panel
  open on it) turns green with the center-on-release pin
  still green, and the next walk scores F13 PASS (the
  owner's Layer 3 check)

## Problem

With the properties panel open, a click on another node
selects it and, at gesture end, centers it
(`web-app/flows/detail.ts:1086-1108`; FLOW-CANVAS.md
`## Camera rules`). A double-click's first release
therefore slides the node from under its second press.
That press meets empty canvas, whose pointerdown clears
`lastClick` and the selection, starts a marquee, and emits
`open-panel: false`
(`web-app/app/flow-fsm-reduce.ts:56-102`) — or another
node, which takes the selection and the panel. The
reducer's double-click is "two presses on one element id
inside `DBLCLICK_MS`" (`:15`, `:120-124`); the camera move
defeats the id test. A person aims at a point, not at an
id: this is the defect 0a's F13 recipe found by pressing
twice at one point, which the 8e834e76 walk had passed only
by re-aiming between the presses.

The owner's constraints: no timer to dodge the window (the
4 Oct plan refuses one, `docs/superpowers/plans/test-plan-walk-2026-10-04.md:93`
and Task 8's "do not add a timer"); the pin 'a node click
under an open panel centers it on release (F13)'
(`tests/browser/canvas-gestures.test.ts`) stays green;
FLOW-CANVAS.md `## Camera rules` hold for every gesture,
including the MUST NOT that the camera moves between
pointer-down and pointer-up (with Auto Fit on, a matching
press that starts no gesture re-fits through
`reconcileFitFromDom`, the debt § 4 files); the red Layer
2 test comes first.

A deferred centering would need a timer (no event is
guaranteed to follow a single click), so the window cannot
be won by holding the camera still. The second press has
to be recognized where it lands.

## Decisions

The owner confirmed each, in order.

1. Path: architectural. A written spec, then a plan, then
   subagent-driven execution; no spec before the design
   sections were confirmed.
2. Scope: the lost second press only. Item 11's "panel
   callback re-fitting at a double-click's second press"
   stays out of 0j; it moves out of item 11 into its
   own `## Later work` entry (§ 4), and F13 keeps its
   "Auto Fit must be off" precondition.
3. Approach: the reducer owns the rule. It already owns
   "what a double-click is" (the element id and the time);
   the point joins them in `FsmState`, so the adapter
   gains no state. Rejected: the adapter retargeting a
   press before it dispatches (a second source for
   `lastClick.time`, the 400 ms constant crossing into the
   adapter, the rule split in two); hit-testing against the
   pre-centering camera (more state, and it leans on the
   in-place `viewBox` mutation item 11 already lists).
4. The rule: a press is the second press of the last click
   when it comes inside `DBLCLICK_MS` and either lands on
   the same element (today's rule) or lands within
   `DBLCLICK_SLOP_PX` (4, straight-line, client pixels) of
   where that click landed, whatever is under the pointer
   now, provided that element is still in the FSM's
   selection
   (a keyboard delete or a page-side selection write leaves
   a stale `lastClick`, and a stale one must not open a
   panel). This is the OS rule (time and distance) plus
   today's same-element extension. The still-selected
   condition arose while writing this spec; the owner's
   review of the written spec is its gate.
5. A matching press that lands somewhere else runs the
   existing double-click path on the first press's element
   and starts no gesture.
6. Tests: red first as a process, not a commit; every
   commit stays green.
7. Docs: FLOW-CANVAS.md gets the rule; TODO.md and
   TEST-PLAN.md follow the close protocol.

## Found on the base

- The reducer's double-click: `isDbl` in `onNodePointerDown`
  (`flow-fsm-reduce.ts:120-124`) and `onEdgePointerDown`
  (`:304-308`) compares the pressed id with `lastClick.id`
  and the time with `DBLCLICK_MS` (`:15`). Node and edge
  ids share `lastClick.id`. `onCanvasPointerDown` resets
  `lastClick` to `none` (`:84`).
- `LastClick` is `{ kind: 'none' } | { kind: 'clicked'; id;
  time }` (`web-app/app/flow-interactions.ts:122-128`). The
  press inputs are in `web-app/app/flow-fsm-types.ts`
  (`:28-55`): the node press carries `svgX`, `svgY`, `now`
  and no client point; the edge press carries `now`; the
  canvas press carries `clientX`, `clientY` and no `now`.
- The adapter builds all four dispatches from the
  `pointerdown` event (`flow-interactions.ts:571`, `:599`,
  `:627`, `:636`; `:571` is the pan-mode canvas press).
- The page centers a changed selection on every update
  that is not a gesture start or a mid-gesture frame
  (gesture end, a keyboard focus, a press that starts no
  gesture), never at gesture start
  (`web-app/flows/detail.ts:1062-1108`), and runs the panel
  callback `(open) => ...` (`:1110-1117`), which commits
  `withPanelOpen` and `reconcileFitFromDom()`.
- A press that starts no gesture reaches the page as a
  `request-update` whose state is not a gesture: the
  non-gesture path commits it, runs `reconcileFitFromDom()`
  (`:1093`), reads `prevSelected` and `nowSelected`, and
  centers only when they differ, the panel is open, and a
  node is selected.
- Pins: 'double-click n1 then double-click n2 retargets
  panel and selection to n2 (F13 retarget)' and 'second
  click beyond DBLCLICK window does not open panel (F13
  negative)' (`tests/flow-fsm-scenarios.test.ts`); 'a node
  click under an open panel centers it on release (F13)'
  (`tests/browser/canvas-gestures.test.ts`).
- The Layer 2 helper `doubleClickAt` already sends the
  gesture one point, read once: press, release, press,
  release (`tests/browser/canvas.ts:114-121`).
- No Layer 1 test dispatches the adapter's `pointerdown`.

## Out of scope

- Item 11's re-fit at the second press (filed apart, § 4).
- Any change to center-on-release, `applyPanToRevealSelected`,
  or the Camera rules' MUST NOTs.
- Touch and pen: 4 px is the mouse figure. A larger slop for
  coarse pointers is a later entry if the walk asks for it.
- The Layer 3 walk. The next walk's F13 PASS is the owner's
  check.

## 1. The rule

A press is the second press of the last click when it
arrives within `DBLCLICK_MS` of that click and either:

- (a) lands on the same element — today's rule, unchanged
  and still free of any distance limit; or
- (b) lands within `DBLCLICK_SLOP_PX` of the client point of
  that click, whatever is under the pointer now: empty
  canvas, another node, or an edge — provided that
  click's element is still in the FSM's selection.

Case (b) is what 0j adds. The first release's centering can
slide the node away from the pointer; it cannot move the
point the user aimed at.

A (b) press runs the existing double-click path on the
first press's element: `open-panel: true`, the selection
stays, `lastClick` refreshes (same id, new time and point).
It does not clear the selection, start a marquee, select or
drag the node that slid under the pointer, or start a
connect gesture. Pan mode is checked first and is
unchanged (the adapter sends every pan-mode press as a
canvas press). A third press inside the window of the second
chains the same way.

`LastClick.clicked` gains the point; the press inputs gain
the fields they lack:

```ts
// web-app/app/flow-interactions.ts
export type LastClick =
    | { kind: 'none' }
    | {
        kind: 'clicked';
        id: string;
        time: number;
        clientX: number;
        clientY: number;
    };
```

```ts
// web-app/app/flow-fsm-types.ts: added fields only
| { kind: 'pointer-down-on-canvas'; /* ... */ now: number }
| { kind: 'pointer-down-on-node'; /* ... */
    clientX: number; clientY: number }
| { kind: 'pointer-down-on-edge'; /* ... */
    clientX: number; clientY: number }
```

The adapter fills them from the event: `e.clientX`,
`e.clientY`, and `Date.now()` for the canvas press (both
canvas dispatches, the pan-mode one included). Nothing is
stored outside `FsmState`; there is no timer.

## 2. The reducer

One pure helper and one constructor, beside `DBLCLICK_MS`:

```ts
const DBLCLICK_SLOP_PX = 4;

type Clicked = Extract<LastClick, { kind: 'clicked' }>;

function isStillSelected(
    selection: Selection,
    id: string,
): boolean {
    return selection.kind === 'nodes'
        ? selection.nodeIds.has(id)
        : selection.kind === 'edge'
            && selection.edgeId === id;
}

function isSecondPressNear(
    state: FsmState,
    now: number,
    clientX: number,
    clientY: number,
): state is FsmState & { lastClick: Clicked } {
    const last = state.lastClick;
    return last.kind === 'clicked'
        && now - last.time < DBLCLICK_MS
        && Math.hypot(
            clientX - last.clientX,
            clientY - last.clientY,
        ) <= DBLCLICK_SLOP_PX
        && isStillSelected(state.selection, last.id);
}

function secondPressOf(
    state: FsmState & { lastClick: Clicked },
    input: {
        now: number;
        clientX: number;
        clientY: number;
    },
): FsmResult {
    const next: FsmState = {
        ...state,
        lastClick: {
            ...state.lastClick,
            time: input.now,
            clientX: input.clientX,
            clientY: input.clientY,
        },
    };
    return {
        state: next,
        actions: [
            { kind: 'open-panel', open: true },
            { kind: 'request-update', state: next },
        ],
    };
}
```

Three entry points call it first: the canvas and node
presses right after their pan-mode checks; the edge press,
which has none (the adapter sends every pan-mode press as a
canvas press, `flow-interactions.ts:568-578`), at its top:

- `onCanvasPointerDown`: if `isSecondPressNear(state,
  input.now, input.clientX, input.clientY)`, return
  `secondPressOf(state, input)`. Otherwise today's path:
  clear the selection, start the marquee, emit
  `open-panel: false`.
- `onNodePointerDown`: if the press is near and
  `state.lastClick.id !== input.nodeId`, return
  `secondPressOf`. The same-node path is untouched, so every
  existing node pin keeps its meaning. (The `lastClick` the
  node and edge paths write gained `clientX` and `clientY`
  in commit 3.)
- `onEdgePointerDown`: the same as the node.

`secondPressOf` emits no `capture-pointer` and sets no
drag, connect, or marquee state: it begins no gesture, so
the release is a no-op (`onPointerUp` falls through to
`{ state, actions: [] }`), and the page's non-gesture path
sees no selection change, so it never centers a second
time. With Auto Fit off that path moves no camera; with it
on, its `reconcileFitFromDom()` re-fits, as the panel
callback already does (§ 4 files both). A matching
press is decided before the port, locked,
and drag branches, so it can never start a connect or a drag
on the node that slid under the pointer. If `last` is an
edge, the matching press opens the edge's panel; the
selection is already that edge.

Known cost, as in every OS: two deliberate clicks on
different things inside 400 ms and 4 px read as a
double-click, and so does a press, a quick drag, and a
press back at the first press's point inside 400 ms on a
still-selected element (`lastClick` holds the press point,
and a drag does not clear it, as today's id rule ignores
movement too).

## 3. Testing

Red first as a process: the Layer 2 test is written and run
alone before any product change, and its failure recorded
(the second press lands on empty canvas and the panel
closes, `open-panel: false`). Every commit stays green (the
Office of the Commit), so the red test is committed with
the fix, not before it.

Layer 2, `tests/browser/canvas-gestures.test.ts`, beside the
center-on-release pin:

- 'a double-click on a second node under an open panel
  keeps the panel on it (F13)'. Open Customer Onboarding,
  double-click Review (the panel opens), read the center of
  Data Capture's body (`.flow-node[...] > rect`, as F13
  aims) once, send `doubleClickAt` it. Expect the
  panel still open and `#prop-node-name`'s `value` equal to
  'Data Capture'. Before pressing, assert that the node's
  body is clear of the panel and does not contain the
  center of the part of `svg.flow-canvas` right of
  `.flow-props-panel` (F13's own aim rule), so the test can
  neither pass vacuously nor fail for the wrong reason. If
  Data Capture holds that center in the seeded layout, the
  test names another regular node.

Layer 1, `tests/flow-fsm-scenarios.test.ts` (new
scenarios; the reducer is pure, so each is a short
drive of inputs):

1. A canvas press at the first press's client point inside
   the window: `open-panel: true`, no `open-panel: false`,
   the selection stays, no marquee, `lastClick` refreshed.
2. A node press (another node, slid under the pointer) at
   that point: the same; the other node is not selected and
   not dragged.
3. An edge press at that point: the same.
4. A canvas press 5 px away (inside the window): today's
   path, `open-panel: false`, selection cleared. A press at
   exactly 4 px (dx 4, dy 0) still matches.
5. A canvas press at 400 ms (and at 399): at 400, today's
   path; at 399, the match.
6. A press on the same node beyond the slop inside the
   window is still a double-click (the id rule).
7. Pan mode ignores the rule: the press starts a pan.
8. A (b) press on another node's port, or on another
   locked node, starts no connect and no drag.
9. A press at the point inside the window, after the
   element left the selection (a stale `lastClick`), is
   today's path: no `open-panel: true`.

Existing pins keep their meaning: their 25 press literals
(18 node, 4 canvas, 3 edge; one of them the `downInput`
helper at `tests/flow-fsm-reduce.test.ts:664`, and four
more presses spread from them) and one `LastClick` literal
(`tests/flow-designer-presenter.test.ts:62-66`) gain client
points (and `now` on canvas presses). No existing fixture
presses two elements inside the window, so none changes
what it tests; new scenarios place distinct elements more
than 4 px apart. The type checker guards the
adapter's wiring (the new fields are required); the Layer 2
test proves it end to end, since no Layer 1 test drives the
adapter's `pointerdown`.

## 4. Docs and close

FLOW-CANVAS.md `## Camera rules` gains one last paragraph,
after the `request-update` MUST NOT: a double-click is two
presses inside `DBLCLICK_MS` on one element, or whose client
points lie within `DBLCLICK_SLOP_PX` (4 px) of one another
while the first press's element is still in the FSM's
selection, even after centering has slid the node from
under the pointer; the matching press runs the
double-click path on the first press's element and starts
no gesture.

TODO.md, one commit each:

- File the re-fit issue as its own `## Later work` entry
  and move the clause out of item 11: the `(open) => ...`
  callback in `web-app/flows/detail.ts` (`:1110-1117`) runs
  `reconcileFitFromDom()`, and so does the `request-update`
  callback (`:1093`) for a press that starts no gesture, so
  with Auto Fit on the camera re-fits at a double-click's
  second press, against the Camera rules; TEST-PLAN F13
  says "Auto Fit must be off"
  because of it. The entry follows the file's shape (the
  problem, the evidence, the fix, an `Oracle:` clause with
  no closing period) and its ranking rule: after "Four
  panel doors are unpinned.", before "A flow loaded with
  Auto Fit off".
- Close 0j: remove its bullet; drop the intro's 0j clause
  (`…(0i); and F13's double-click under an open panel (0j).
  Then…` reads `…(0i). Then…`); "Eighteen items" becomes
  "Seventeen". The `## Later work` entry that restores the
  intro's last "then" goes with the clause, as its text
  says. `## Sequencing` never named 0j. The close
  protocol's pin-flip, comment, and KNOWN-seam steps do not
  apply: nothing pinned the defect and no comment names 0j.

TEST-PLAN.md, a separate doc commit: a green Layer 2 test
now decides the double-click, and Scoring's FAIL row admits
only an observation no green Layer 1/2 pin decides
(TEST-PLAN.md `### Scoring`'s table and the paragraph under
it), so a delivered one-point double-click that misses
scores BLOCKED, naming the driver, unless that pin is red.
F13's "FAIL, not BLOCKED" sentence and Scoring's F13 line
change accordingly, and its Pin names the new test instead
of "TODO.md 0j owns". F13's aim rule and one-point drive
stay (they keep the walk's F13 from passing vacuously).
The new text spells "center", as the open spelling entry
asks.

Unchanged: AGENTS.md, ARCHITECTURE.md (no KNOWN seam moves,
so AUDIT.md's `m` holds), DESIGN-SYSTEM.md, and the 4 Oct
plan.

## Sequence

One concern per commit, each green at Layer 1 (Layer 2 is
run at commits 3 and 4 and at the tip):

| # | Commit | Touches |
|---|---|---|
| 1 | Specify 0j's double-click under an open panel | this spec |
| 2 | Plan 0j's double-click under an open panel | the plan |
| 3 | Carry the press point and time | types, adapter, the reducer's two `lastClick` writes, fixtures |
| 4 | Match a second press by its point | reducer, Layer 1, Layer 2 |
| 5 | Name the double-click rule in FLOW-CANVAS.md | FLOW-CANVAS.md |
| 6 | File item 11's re-fit as its own entry | TODO.md |
| 7 | Close 0j | TODO.md |
| 8 | Pin F13 to the double-click fix | TEST-PLAN.md |

Commit 3 changes no behavior: it adds the fields, wires the
adapter, writes the point into `lastClick` (nothing reads
it yet), and updates the fixtures. Commit 4 adds the rule
with its tests; the red Layer 2 test goes green there.

## Testing

- `./test validate` exits 0 on every commit; its counts
  rise at commit 4 by the new Layer 1 scenarios (the plan
  names the lines). Under the Claude Code sandbox,
  `export DENO_DIR="$TMPDIR/deno-dir"` first.
- `./test validate browser` exits 0 at commits 3 and 4 and
  at the tip, adding one Layer 2 test at commit 4.
  Chrome through `CHROME` or
  `CHROME_DEBUG_URL`; if it cannot launch in the sandbox,
  the work stops there and says so.
- The center-on-release pin and every `canvas-gestures`,
  `canvas-keyboard`, and `canvas-pan` test stay green.
- No walk, no deploy, no `./bin/build`, no `./bin/measure`.

## Docs that change when this ships

- FLOW-CANVAS.md: `## Camera rules`.
- TODO.md: 0j removed, the critical path's intro, one
  `## Later work` entry added, one removed, item 11's
  clause moved.
- TEST-PLAN.md: F13's body, Pin, and Scoring line.
- Unchanged: AGENTS.md, ARCHITECTURE.md, DESIGN-SYSTEM.md,
  AUDIT.md, and the 4 Oct plan.

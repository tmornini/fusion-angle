# 0a — walk recipes for I22, F13, AA32, and C6

- Date: 2026-10-06
- Status: design confirmed by the owner section by
  section, pre-plan
- Item: TODO.md 0a, as filed on `todo-triage` at
  `7c3c4bfc`
- Worktree: `.worktrees/2026-10-06-walk-recipes`,
  branch `2026-10-06-walk-recipes`
- Base: `todo-triage` at `1e0941c5`, which is `master`
  (`8e834e76`) plus the triage
- Lands: after `todo-triage`, a fast-forward of
  `master` today. Rebase onto `master`, run
  `./test validate`, then `git merge --ff-only
  2026-10-06-walk-recipes` from the main checkout,
  `git worktree remove
  .worktrees/2026-10-06-walk-recipes`, and `git branch
  -d 2026-10-06-walk-recipes`. Never `-D`
- Ships: TEST-PLAN.md recipes for I22 (a forced
  fault), F13 (a one-point double-click), AA32 (a
  port-aimed Shift-drag), and C6 (a scripted scroll),
  with their driving-note and Scoring lines; TODO.md
  0j filed; 0a closed
- Leaves: F13's product fix (0j); 0b and 0c
- Supersedes: Task 9 of
  `docs/superpowers/plans/test-plan-walk-2026-10-04.md`,
  which stays as written
- Oracle: the next walk scores I22, AA32, and C6 PASS
  and F13 FAIL naming 0j — none BLOCKED

## Problem

0a asks for recipes a hidden, CDP-driven tab can
execute for AA32, C6, F13, and I22, each case's text
taken from the 4 Oct plan's Task 9. Its oracle: the
next walk scores each PASS or FAIL, never BLOCKED.

0a was filed at 15:02 on 6 Oct, while the walk of
`8e834e76` ran. That walk finished at 17:51
(`/tmp/fusion-angle-walk-8e834e76.txt`, ephemeral) and
scored:

| Case | Score | Its line |
|---|---|---|
| AA32 | PASS | after walk-green's camera hold landed |
| C6 | PASS | the document scrolled exactly 400 px — 0a's `scrollTo`, improvised |
| F13 | PASS | "second press 35ms later at the post-pan point" |
| I22 | BLOCKED | "no loadInto fault occurred naturally" |

Three of four already meet the oracle, but the case
text still leaves their drives to the explorer. Two
cases need more than text.

The "hidden tab" is the 4 Oct walk's: its tab sat
under a display shield, `visibilityState` hidden,
where CDP wheel and mouse input timed out. Walks since
keep the tab visible, and the explorer prompt demands
it before every gesture. C6's recipe needs no
compositor input and I22's one click; AA32 still
needs a visible tab, because its preview paints under
`requestAnimationFrame`.

**I22** says the explorer has no way to force the
fault. It does: I21, in the same walk, pauses CDP
`Fetch`, and it PASSed on `ed1fac5c` and `8e834e76`.
Walk-green ruled that no fault injector is invented
(`docs/superpowers/plans/2026-10-05-walk-green.md:263-272`).
That ruling is about product code; a fault the driver
injects through `Fetch` touches none.

**F13** passed by re-aiming. With the panel open, a
click on another node centres it at gesture end
(`web-app/flows/detail.ts:1086-1108`), and the
centring always pans (`withSelectionCentered`,
`web-app/app/presenters/flow-designer.ts:719-725`). A
double-click's first release therefore slides the node
from under its second press. A person presses twice at
one point: the second press meets empty canvas, whose
pointerdown emits `open-panel: false`
(`web-app/app/flow-fsm-reduce.ts:97`) and closes the
panel — or another node, which takes the panel. This
is the 4 Oct plan's Task 8 defect, moved from the
press to the release. Nothing pins it: walk-green's
Layer 2 pin clicks once
(`tests/browser/canvas-gestures.test.ts:451-473`), and
the FSM pins name element ids. TEST-PLAN's
double-click is "two pointerdowns on one element id"
(`TEST-PLAN.md:192-193`), which is what a person does
in every case but F13, the one whose camera moves
between the presses.

## Decisions

The owner confirmed each, in order.

1. Scope: all four cases, doc-only — chosen over I22
   alone, over F13 re-aiming, and over F13 with its
   fix.
2. F13 drives one point, the way a person
   double-clicks, so the walk can FAIL it honestly.
   Its fix is 0j's.
3. Only F13 takes the one-point drive. Every other
   double-click (AA33, F11, F12, F14, …) keeps the
   element-id drive, so each tests its own covenant
   instead of failing on 0j's defect.
4. 0j sits after 0i on the critical product path:
   inside the release, and below 0d's cross-tenant
   credential hole and the deploy chain by harm
   averted.
5. Each case carries its whole recipe, as I21 does.
   `### Driving notes` changes only where a mechanism
   is shared (the Shift-drag aim, AA32/F19/F23) or
   excepted (the double-click, F13), plus one clause
   on I21's `Fetch` bullet. Scoring's walk-specific
   list repeats each scoring rule a case states, as it
   already does for I21. Rejected: a driving note per
   mechanism (three of the four serve one case), and
   committed browser-use scripts (a second language,
   no adapter, unbidden).
6. I22 faults the ideas collection GET.
7. C6 scrolls to the bottom and measures, and checks
   that neither `html` nor `body` hides vertical
   overflow.
8. No Layer 2 tests: the 4 Oct plan's ruling for AA32,
   C6, and I22 stands, and F13's red test is 0j's.
9. The 4 Oct plan stays as written; this spec
   supersedes its Task 9.

## Found on the base

### I22's path

- `getIdeas` (`client/ideas.ts:127-164`) issues the
  collection GET `organizations/<id>/ideas/`
  (`organizationCollection`,
  `client/request-context.ts:122-129`). Its member map
  and each idea's `…/submissions/` do not end in
  `/ideas/`, so one pattern matches one request.
- `answered()` (`client/http-facade.ts:116-130`) throws,
  on any non-2xx, a `RequestError` whose message is
  `<body.error> (<url>)`. A 401 refreshes instead
  (`exchangeOnce`, `:311-356`); nothing retries a 5xx.
- `loadInto` (`web-app/app/loading-states.ts:210-272`)
  catches and paints `buildErrorState` — "Something
  went wrong", the message, and `[data-retry-btn]`
  (`:141-157`) — then binds `retry` to the button and
  focuses it (`:237-246`).
- The ideas page passes `retry: init`
  (`web-app/ideas/index.ts:58`), so Try Again re-runs
  the whole load into `#ideas-list`
  (`web-app/ideas/index.html:32`), whose cards carry
  `data-idea-card` (`web-app/app/presenters/idea.ts:609`).
- No service worker stands between the page and the
  network.
- I22's Pin stubs the container with a `querySelector`
  that returns `null` (`tests/loading-states.test.ts:10-20`),
  so Layer 1 never runs the retry binding or the focus.

### F13's path

- Gesture start commits the interaction state alone;
  gesture end centres a changed selection while the
  panel is open (`web-app/flows/detail.ts:1071-1108`;
  FLOW-CANVAS.md:101-115).
- `withSelectionCentered` pans whenever the panel is
  open (`web-app/app/presenters/flow-designer.ts:719-725`,
  `:465-491`; `applyPanToRevealSelected`,
  `web-app/app/flow-designer-actions.ts:359-379`).
- A double-click is two node pointerdowns on one id
  inside `DBLCLICK_MS` (`web-app/app/flow-fsm-reduce.ts:15`,
  `:120-124`). A canvas pointerdown clears the
  selection and emits `open-panel: false` (`:56-102`).
- The pins: 'double-click n1 then double-click n2
  retargets panel and selection to n2 (F13 retarget)'
  (`tests/flow-fsm-scenarios.test.ts:469-471`); 'second
  click beyond DBLCLICK window does not open panel
  (F13 negative)' (`:428-430`);
  'applyPanToRevealSelected centers a node, else null'
  (`tests/flow-designer-actions.test.ts:368`); 'a node
  click under an open panel centers it on release
  (F13)' (`tests/browser/canvas-gestures.test.ts:451-473`).

### AA32's and C6's targets

- The port is a 5-unit circle, `[data-connect-port]`,
  inside the node's `.flow-node` group
  (`web-app/app/flow-graph.ts:82`, `:537-555`), on the
  widest gap of the perimeter (`:220-270`). The group's
  `aria-label` is the node's name (`:590-596`); its
  first `rect` is the `NODE_WIDTH`×`NODE_HEIGHT` body,
  160×64 (`web-app/app/flow-layout.ts:23-24`).
- The Shift preview's path carries `stroke-dasharray`
  exactly when `wouldBeCycle` holds
  (`buildEdgePreviewPath`, `web-app/app/flow-graph.ts:969-1046`;
  its Shift branch, `:1072-1099`).
- The camera holds from press to release
  (FLOW-CANVAS.md:101-115), so a drop point read
  before the press stays true.
- `.main-content` sets no overflow
  (`web-app/app/styles/layout.css:145-151`); `.sidebar`
  is `position: fixed` (`:10-23`) and renders as
  `#desktop-sidebar` (`web-app/app/component-sidebar.html:4`);
  the main column is `#main-content`
  (`web-app/app/components-layout.html:51`).
- `html` and `body` set no overflow
  (`web-app/app/styles/base.css:9-26`); flow-stats
  hides it on purpose
  (`web-app/app/styles/pages-flow-stats.css:15-20`).
  A scripted `scrollTo` still moves a root whose
  overflow is hidden; a person's wheel does not.

### What Layer 1 reads

`./test lint` (`test:67`) fails on a `tests/…` path
TEST-PLAN.md cites that does not exist (`:207-228`), on
retired storage vocabulary in a root `.md`
(`:128-143`), and on a TODO.md whose `## Critical
product path` count is not one (`:180-184`).
`tests/test-plan-apple-menu.test.ts` and
`tests/fusion-angle-live-name.test.ts` parse
TEST-PLAN.md. Lint checks cited paths, never cited
test names.

## Out of scope

- F13's fix (0j), and item 11's "panel callback
  re-fitting at a double-click's second press", which
  0j's brainstorm weighs.
- 0b's moorings (F37a, R22, WB22) and 0c's AT2 count.
- A Layer 2 pin for I22's retry, or any other test
  code.
- I22's `retry: init` calling `bindCrossTab()` again
  and re-adding the create button's listener: no case
  observes either.
- The other double-click cases' drives.

## 1. I22 — a forced fault

Replace I22 (`TEST-PLAN.md:6265-6271`) with:

```
- [ ] **I22** Force a `loadInto()` fault on `ideas/`.
  Before navigating, `Fetch.enable` with one pattern,
  `*://localhost:*/api/organizations/*/ideas/` — the
  collection GET `getIdeas` makes inside `loadInto`.
  Never `/api/authentication/*`, and never a 401: a
  401 drives refresh, not the error state. Answer the
  `Fetch.requestPaused` with `Fetch.fulfillRequest`:
  `responseCode` 500, `responseHeaders`
  `[{name: 'content-type', value: 'application/json'}]`,
  `body` `eyJlcnJvciI6IndhbGstZm9yY2VkIGZhdWx0In0=`
  (base64 of `{"error":"walk-forced fault"}`). PASS:
  `#ideas-list` shows "Something went wrong", text
  containing "walk-forced fault", and a "Try Again"
  `[data-retry-btn]` that is `document.activeElement`.
  Then `Fetch.disable` and click Try Again at its
  box-model center. PASS: a second GET of `…/ideas/`
  answers 200 and `[data-idea-card]` cards replace
  the error state. BLOCKED only if `Fetch.enable` or
  `Fetch.fulfillRequest` itself is refused.
  Pin: tests/loading-states.test.ts 'a rejecting
       fetch renders the error state and calls
       neither hook' (decides a rejected fetch
       renders "Try Again" and calls neither
       `onEmpty` nor `onData`); exploratory — the
       live forced fault, the button's focus, and
       the retry's re-fetch
```

The skeleton bullet in `### Driving notes`
(`TEST-PLAN.md:199-208`) gains, after its I21
sentences:

```
  I22 also enables `Fetch` before its navigation, on
  its own narrower pattern, and answers its one
  paused GET with a 500 instead of continuing it.
```

`### Scoring`'s walk-specific list gains, after the I21
line (`TEST-PLAN.md:394-396`):

```
I22 with the 500 fulfilled: a missing error state,
message, focus, or re-fetch is FAIL of the
exploratory half. BLOCKED only if `Fetch` itself
refuses.
```

## 2. F13 — one point, two presses

Replace F13 (`TEST-PLAN.md:2791-2808`) with:

```
- [ ] **F13** While the panel is open, double-click a
  *different* node the way a person does: one point,
  two presses. Pick a regular node: Create and Archive
  panels have no `#prop-node-name`. Aim before the
  press: read the center of
  `.flow-node[aria-label="<name>"] > rect` once —
  the `NODE_WIDTH`×`NODE_HEIGHT` body, not the label
  `text` or the `g`, whose box includes the port —
  and `document.elementFromPoint` there must resolve
  `.closest('.flow-node')` to that node. A point under
  `.flow-props-panel` lands on the panel, so a
  pre-press miss is re-aimed, not scored. Then send
  both press/release pairs to that point
  inside `DBLCLICK_MS`, never re-reading it between
  them. PASS: after the second press the panel is
  still open, `#prop-node-name` reads the
  double-clicked node's name, and the canvas has
  re-centred on it. A second press that lands off the
  node because the first release moved the camera is
  FAIL, not BLOCKED: the gesture was delivered.
  Pin: tests/flow-fsm-scenarios.test.ts 'double-click n1
       then double-click n2 retargets panel and selection
       to n2 (F13 retarget)' (decides the selection
       collapses to the second node and the last open-panel
       action is open=true);
       tests/flow-fsm-scenarios.test.ts 'second click
       beyond DBLCLICK window does not open panel (F13
       negative)' (decides that a real double-click window
       exists — a second press far enough out opens no
       panel; the test brackets the window with its own
       literals rather than reading `DBLCLICK_MS`);
       tests/flow-designer-actions.test.ts
       'applyPanToRevealSelected centers a node, else
       null'; tests/browser/canvas-gestures.test.ts 'a
       node click under an open panel centers it on
       release (F13)' (decides a single click under an
       open panel centres the clicked node on release —
       the move a one-point double-click's second press
       meets); exploratory — the one-point double-click,
       which TODO.md 0j owns until a red Layer 2 test
       pins it, and the live retarget paint
```

The double-click bullet in `### Driving notes`
(`TEST-PLAN.md:192-193`) gains:

```
  F13 alone sends both presses to one point read
  before the first, as a person does: under an open
  panel the first release centres the node, so a
  re-read would chase it.
```

F11 (`TEST-PLAN.md:2743-2745`) reads "every later
double-click in F uses the same drive"; it becomes
"every later double-click in F uses the same drive;
F13 names its own".

`### Scoring`'s walk-specific list gains, after the I22
line:

```
F13's second press off the node after the first
release centred it: FAIL, not BLOCKED (TODO.md 0j).
```

The next walk scores F13 FAIL until 0j lands; 0a's
oracle allows it. The Pin's pointer to 0j tells the
master the finding is filed, so its FAIL stub links
0j rather than opening a fresh investigation.

## 3. AA32 and C6

Both already PASS; their text now names the drive the
walk used. The source is the 4 Oct plan's Task 9,
brought to today's code.

Replace AA32's body (`TEST-PLAN.md:1198-1211`), keeping
its Pin line (`:1212-1236`) unchanged — it already
names walk-green's camera-hold pin:

```
- [ ] **AA32** Hold Shift and drag from "Review"'s port
  onto "Data Capture". Aim by selector, before the
  press: the press point is the center of
  `.flow-node[aria-label="Review"] [data-connect-port]`'s
  `getBoundingClientRect()`, and
  `document.elementFromPoint` there must resolve
  `.closest('[data-connect-port]')`; the drop point is
  the center of
  `.flow-node[aria-label="Data Capture"] > rect`.
  Confirm `document.visibilityState === 'visible'`
  (the preview paints under `requestAnimationFrame`).
  Drive: `Input.dispatchKeyEvent` `rawKeyDown` Shift
  (code `ShiftLeft`, vk 16, modifiers 8);
  `mousePressed` at the press point (modifiers 8);
  eight `mouseMoved` steps to the drop point
  (`buttons` 1, modifiers 8). PASS: before release,
  `.flow-connect-preview path` carries
  `stroke-dasharray` — the dashed-orange curved bezier
  — because a forward path "Data Capture" → "Review"
  already exists and the release would close a loop.
  `mouseReleased` (modifiers 8), then `keyUp` Shift.
  PASS: `.flow-edge` count +1, `.flow-node` count
  unchanged. Rename the edge "needs revision". Repeat
  onto `.flow-node[aria-label="Archive"] > rect`,
  re-aiming both points. PASS: the preview path has
  no `stroke-dasharray` (solid blue, no return path);
  release adds one edge and no node. Rename it
  "approve". A pre-press `elementFromPoint` miss is
  re-aimed, not scored. BLOCKED only if Shift is not
  observed on release (a node is added instead),
  naming that.
```

Replace the Shift-drag bullet in `### Driving notes`
(`TEST-PLAN.md:229-233`) with:

```
- Shift-drag (AA32/F19/F23): press at the center of
  the port circle's bounding box (`[data-connect-port]`),
  never an eyeballed node edge; verify with
  `elementFromPoint` first. A miss is a body-drag or
  marquee, not Shift. The camera holds from press to
  release, so a drop point read before the press stays
  true. If Shift is not delivered on pointer-up the
  FSM emits add-node; record BLOCKED naming that.
  Layer 1 and Layer 2 pins decide add-edge. F23's
  mid-gesture Shift is the same compositor limit.
```

Replace C6's first line (`TEST-PLAN.md:1732`), keeping
its Pin line (`:1733-1734`) unchanged, with:

```
- [ ] **C6** Scroll the dashboard at 1280×800. PASS:
  the sidebar stays fixed while the main content
  scrolls under it. The window is the scroller —
  `.main-content` sets no overflow and `.sidebar` is
  `position: fixed` — and CDP wheel and key scrolls
  stall on a tab that is not composited, so drive
  with `Runtime.evaluate`: read `#main-content`'s
  `getBoundingClientRect().top` as t, then
  `window.scrollTo(0, document.documentElement.scrollHeight)`
  and read `window.scrollY` as d. PASS: d > 0;
  neither `html` nor `body` computes `overflow-y:
  hidden`; `#desktop-sidebar`'s rect `top` is still 0;
  `#main-content`'s rect `top` is t − d. Restore with
  `window.scrollTo(0, 0)`.
```

Two departures from Task 9: the scroll goes to the
bottom and measures d, because the dashboard's height
follows the data; and the `overflow-y` clause keeps a
scripted scroll from passing a page a person's wheel
could not move.

## 4. TODO.md

File 0j after 0i, before F13's commit cites it:

```
- **0j.** A double-click under an open panel lands
  where a person aimed. With the properties panel
  open, a click on another node selects it and, on
  release, centres it (`web-app/flows/detail.ts:1099-1108`;
  FLOW-CANVAS.md prescribes the centring, and
  `tests/browser/canvas-gestures.test.ts` 'a node
  click under an open panel centers it on release
  (F13)' pins it). A double-click's first release
  therefore slides the node from under its second
  press, which meets empty canvas — `open-panel:
  false` closes the panel
  (`web-app/app/flow-fsm-reduce.ts:97`) — or another
  node, which takes the panel. The walk's element-id
  drive re-aims between the presses, which is how F13
  passed on `8e834e76`. The brainstorm decides how a
  single click still centres while a double-click
  holds still — the 4 Oct plan refused a timer
  (Cleverness) — and whether item 11's "panel callback
  re-fitting at a double-click's second press" rides
  along. Oracle: a red Layer 2 test — two presses at
  one point on a second node under an open panel
  leave the panel open on it — turns green with the
  centre-on-release pin still green, and the next walk
  scores F13 PASS
```

In the same commit the critical path's intro
(`TODO.md:17-31`) reads "Nineteen items" and names 0j
after 0i: "…and the wipe and reseed that ships them
(0i); then F13's double-click under an open panel
(0j)."

Close 0a by the Close protocol: remove its bullet
(`TODO.md:33-60`). No pin flips, no code comment names
it, and it closes no KNOWN seam. In the same commit
the intro returns to "Eighteen items", "the walk's
remaining recipes and moorings and their count
(0a–0c)" becomes "the walk's remaining moorings and
their count (0b–0c)", and `## Sequencing`'s "0a, 0b →
0c: the count follows the remedies" becomes "0b → 0c:
the count follows the moorings". 0c's "after 0a and
0b" stays: an item's number is its name, and it
outlives the item.

## Sequence

One concern per commit, each green at Layer 1:

| # | Commit | Touches |
|---|---|---|
| 1 | Specify the 0a walk recipes | this spec |
| 2 | Plan the 0a walk recipes | the plan |
| 3 | File F13's one-point double-click as 0j | TODO.md |
| 4 | Force I22's fault with Fetch | I22, I21's bullet, Scoring |
| 5 | Drive F13 at one point as a person does | F13, the double-click bullet, F11, Scoring |
| 5a | Amend the 0a spec and plan to aim F13 | this spec, the plan |
| 5b | Aim F13 clear of the properties panel | F13 |
| 6 | Aim AA32's Shift-drag at the port | AA32, the Shift-drag bullet |
| 7 | Drive C6's scroll by script | C6 |
| 8 | Close 0a's walk recipes | TODO.md |

Commit 3 precedes commit 5, so F13's pointer to 0j
never names nothing, and 0j's text holds on both
sides of commit 5: it cites the walk that passed F13,
not F13's text. Commit 5's Scoring line lands after
commit 4's I22 line.

Commits 5a and 5b answer Task 5's review. F13's
one-point drive did not say where to aim: a press
under the properties panel lands on the panel, and
Create and Archive panels have no `#prop-node-name`,
so a mis-aim would score FAIL and point at 0j. 5a
amends this spec and the plan once; 5b lands the
amended F13, which is the text in § 2 above.

## Testing

- `./test validate` exits 0 on every commit, Markdown
  included: Layer 1 reads both documents (`### What
  Layer 1 reads`). Under the Claude Code sandbox,
  `export DENO_DIR="$TMPDIR/deno-dir"` first.
- Lint checks cited paths, not names. Before commits 4
  and 5, `grep` finds each cited Pin name in its file;
  the five are confirmed on the base (`### I22's
  path`, `### F13's path`).
- Each `file:line` cite in new TEST-PLAN.md or TODO.md
  text is re-checked against the tree at its commit.
- No Layer 2 run: no product or test code changes.
- The oracle is the next walk, which gates nothing:
  I22, AA32, and C6 PASS; F13 FAIL naming 0j; none
  BLOCKED.

## Docs that change when this ships

- TEST-PLAN.md: I22, F13, F11, AA32, and C6; the
  double-click, skeleton, and Shift-drag bullets in
  `### Driving notes`; two lines in `### Scoring`. No
  case is added or removed, so `## Summary`'s counts
  hold.
- TODO.md: 0j filed, 0a removed, the critical path's
  intro, and `## Sequencing`.
- Unchanged: AGENTS.md, ARCHITECTURE.md (no KNOWN seam
  moves, so AUDIT.md's `m` holds), FLOW-CANVAS.md, and
  the 4 Oct plan.

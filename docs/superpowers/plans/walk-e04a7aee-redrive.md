# The F52 re-drive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Correct the hit-test in Task C1 Step 2 of
`docs/superpowers/plans/walk-e04a7aee-fixes.md` and
re-drive F52 once with it.

**Architecture:** One bounded re-drive on 8081, then a
driving note only if that re-drive scores BLOCKED. The
new Step 2 tests the condition the canvas `pointerdown`
handler uses to start a marquee. It no longer tests for
one guessed element. No product, test, or TEST-PLAN.md
case text changes.

**Tech Stack:** `./deploy --local`, CDP
`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`,
and `Runtime.evaluate` for the reads.

**Spec:** None. The plan argues from the scored line in
`/tmp/claude-501/fusion-angle-redrive-4b332f58.txt`, from
the old plan's Tasks C1 and C3, and from the code cited
under Findings.

## Scope

| Case | Re-drive score | Resolution here |
|---|---|---|
| F52 | BLOCKED at C1 Step 2 | Task R1 replaces C1; R2 on a BLOCKED |
| F75 | PASS | out of scope |

Task R1 replaces the old Task C1 for F52. The old plan's
Task C3 is replaced by Task R2. Its F52 bullet described a
marquee that was never delivered, and the 4b332f58
re-drive never got that far. Its F75 bullet does not
apply, because F75 passed. The old plan stays as
committed. TEST-PLAN.md is not re-run.

## Findings this plan rests on

1. **The old check could never pass.** `buildGrid`
   emits `rect.flow-grid-bg` and then
   `rect.flow-grid-dots`, both sized to the viewBox
   (`web-app/app/flow-graph.ts:388-406`), ahead of
   `.flow-content` (`:1413-1417`). `syncViewport` keeps
   both rects sized to the viewBox on every gesture
   frame (`web-app/app/flow-gesture-render.ts:89-118`).
   The viewBox always shares the canvas aspect ratio, so
   `xMidYMid meet` never letterboxes
   (`web-app/app/flow-interactions.ts:244-250`,
   FLOW-CANVAS.md:72-76). No CSS rule turns off
   pointer events on either grid rect. In CSS, only
   `.flow-marquee` has `pointer-events: none`
   (`web-app/app/styles/pages-flow-detail.css:110-117`).
   So every point on the canvas background hit-tests to
   `rect.flow-grid-dots`, the later-painted rect, and
   never to `svg.flow-canvas` itself.
2. **What counts as empty background.** The
   `pointerdown` listener sits on `.flow-canvas-wrap`
   (`web-app/app/flow-interactions.ts:548-651`). The wrap
   holds only `.flow-canvas-host`
   (`web-app/app/presenters/flow-designer.ts:585-587`).
   The listener checks three things in order, after
   `liveSvg()` (`:452-459`). With pan mode on, the press
   starts a pan (`:570-581`). If `ancestorAttr(target,
   'data-node-id')` finds a node, the press is a node
   press (`:583-624`). If `ancestorAttr(target,
   'data-edge-id')` finds an edge, it is an edge press
   (`:626-638`). Any other target dispatches
   `pointer-down-on-canvas` (`:641-649`).
   `ancestorAttr` walks `parentElement` looking for the
   attribute (`:270-282`). With pan mode off and no
   recent node or edge click, `onCanvasPointerDown`
   sets `marquee: { kind: 'selecting' }` and captures
   the pointer (`web-app/app/flow-fsm-reduce.ts:112-166`,
   the second-press branch at `:138-145` needs a
   `lastClick` from a node or edge, `:28-48` and
   `:399-405`). So the background
   is any point that hits inside `svg.flow-canvas` with
   no `[data-node-id]` or `[data-edge-id]` ancestor.
3. **The point exists, and the explorer already has
   it.** At P = (341,222), the 4b332f58 re-drive hit
   `rect.flow-grid-dots`. That hit satisfies the
   corrected check, so P is kept as it is: the canvas
   rect read fresh, plus (4, 4). The green Layer 2 pin
   'a marquee on empty canvas selects the nodes it
   encloses' presses at this same inset
   (`tests/browser/canvas-gestures.test.ts:116-136`,
   `:121-125`). The explorer does not search for a
   point. If P fails the corrected check, R1 scores
   BLOCKED and stops.

The code does not rule out marquee-from-background.

## Global Constraints

- Base: `walk-e04a7aee-redrive` at `4b332f58`, plus this
  plan's commit. Nothing lands on `master` or
  `next-release` without the owner's word. Never push,
  force-push, or `-D`. The explorer never rebases.
- The master owns 8080. The re-drive deploys on 8081.
- One attempt. A miss is scored, not retried.
- If the gesture is delivered and then a check
  disagrees, score FAIL. The master files a dated stub
  whose `Reproduced by` reads `not reproduced — {driver
  or environment reason}` (TEST-PLAN.md:7780-7797). Its
  red test belongs to a new plan.
- No pin is edited, loosened, or deleted. No test,
  product file, or TEST-PLAN.md case text changes.
- Only the master writes driving notes
  (TEST-PLAN.md:444-446).
- Run `export DENO_DIR="$TMPDIR/deno-dir"` before
  `./deploy` or `./test`. Never log `POSTGRES_URL`,
  `JWT_HMAC_SIGNING_KEY`, or `PORT`, and never set them
  by hand.
- One concern per commit. The subject is about 50
  characters, in the present-tense imperative. The only
  body is
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  Stage by path only.
- Prose says "organization admin", never bare "admin".
- Lines are 78 characters at most.

## Commandments kept, abominations refused

- **I. Reliability / IV. Logic.** Step 2 tests the
  predicate the handler runs, not a stand-in that is
  never true.
- **V. Clarity.** Every BLOCKED line names the step and
  the element hit.
- **VIII. Simplicity / the Article "execute the
  request".** This plan corrects one check and drives
  one case. It does not search for points, add a
  Layer 2 test, or touch F75.
- Refused: **Test Weakening** (no pin moves), **a
  browser note treated as proof** (a FAIL stub reads
  "not reproduced"), and **Unbidden Helper Code** (no
  fixture, script, or helper).

## Review Focus

1. **P lands on a node or edge.** If the seed's layout
   puts content under the inset, Step 2 scores BLOCKED
   and names that element. It is not FAIL, and the
   explorer does not search for another point.
2. **A stale canvas.** The `<svg>` is replaced on every
   commit, so every read queries
   `.flow-canvas-wrap svg.flow-canvas` fresh (Driving
   notes, TEST-PLAN.md:192-193).

---

### Task R1: Re-drive F52 with the corrected hit-test

Replaces old Task C1 for F52. This is an explorer task.
It makes no commit.

The tree must be clean at this plan's commit. Then run:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./deploy --local 8081 --postgres mock-data
```

Sign in as `demo@example.com` from the stdout
credentials. Every mouse event is
`Input.dispatchMouseEvent` with `button: 'left'`, and
every move carries `buttons: 1`
(`tests/browser/fixtures.ts:222-259`). Write the scored
line to `$TMPDIR/fusion-angle-redrive-<HEAD short
SHA>.txt` in the walk's format:
`F52 PASS|FAIL|BLOCKED — <date> re-drive on <sha>
(R1 Step n): <note>`.

- [ ] **Step 1:** Open "Layout Test: Proposal Review
  Cycle" and turn Auto Fit off. Focus
  `svg.flow-canvas` with `.focus()`, per F47 and the
  Driving notes, with no canvas click. Confirm that
  `.flow-canvas-wrap` lacks `flow-pan-cursor`
  (`web-app/app/flow-interactions.ts:446-450,
  506-515`).
- [ ] **Step 2: Confirm P is empty background.** Read
  the rect of `.flow-canvas-wrap svg.flow-canvas`
  fresh. Let P = (x + 4, y + 4) and Q = the rect's
  center. Evaluate this, with P substituted:

```js
(() => {
    const canvas = document.querySelector(
        '.flow-canvas-wrap svg.flow-canvas');
    const hit = document.elementFromPoint(PX, PY);
    const name = hit === null ? 'null'
        : hit.tagName + '.' + hit.getAttribute('class');
    const background = hit !== null
        && hit.closest('svg.flow-canvas') === canvas
        && hit.closest('[data-node-id], [data-edge-id]')
            === null;
    return { background, name };
})()
```

  Expected: `background: true`. Record `name`. Per
  Finding 1, it is `rect.flow-grid-dots`. If
  `background` is false, score BLOCKED with "R1 Step 2:
  P hit `<name>`, not empty canvas background; no press
  sent". Then stop and go to R2.
- [ ] **Step 3:** Press at P. Send four moves along
  P→Q, at i/8 of the way for i = 1..4. Read the
  `width` attribute of `.flow-marquee`. If it is 0,
  score BLOCKED with "R1 Step 3: press on empty
  background at P, `buttons: 1` moves; `.flow-marquee`
  width stayed 0". Release at the last move point, then
  stop and go to R2.
- [ ] **Step 4:** Record the marquee width W4. Send
  Space the way `Page.key(' ')` does: keyDown then
  keyUp, key `' '`, code `Space`, vk 32. Send moves 5..8 to Q,
  read the width W8, then release at Q.
- [ ] **Step 5: Score.** PASS when W8 > W4, the wrap
  still lacks `flow-pan-cursor` after release, and at
  least one `.flow-node[aria-current="true"]` exists.
  The gesture was delivered at Step 3, so if any of
  these fails, score FAIL. The master then files
  `docs/superpowers/test-plan-mitigations/<date>-F-F52.md`
  in the TEST-PLAN.md:7780-7797 format, with Pin copied
  from F52 (TEST-PLAN.md:3947-3955), Suspected layer
  `UI`, and `Reproduced by: not reproduced — Layer 3
  re-drive only; no red test yet`. The master commits
  it with the subject `Add the F52 mid-marquee Space
  stub`.

### Task R2: Note the F52 drive limit (master only)

Runs only if R1 scored BLOCKED. It replaces the old
Task C3. Only the master edits it; an explorer never does
(TEST-PLAN.md:444-446).

**Files:** `TEST-PLAN.md` § Driving notes (`:187` on).
Append after the last bullet.

- [ ] **Step 1:** Add the one bullet that names the
  step R1 blocked at, with `<date>`, `<sha>`, and
  `<name>` taken from the scored line:
  - Step 2: `- F52: the canvas inset (x + 4, y + 4) hit
    <name>, not empty canvas background, on the <date>
    re-drive on <sha>, so no marquee press was sent; score
    BLOCKED on one attempt — the reducer and scenario
    pins decide it.`
  - Step 3: `- F52: CDP delivered no in-flight marquee
    on the <date> re-drive on <sha> (a press on empty
    background at the canvas inset, then \`buttons: 1\`
    moves); score BLOCKED on one attempt — the reducer
    and scenario pins decide it.`

  Neither bullet cites the 4b332f58 re-drive's Step 2
  BLOCKED. That result came from the old check, not
  from a driver limit (Finding 1).
- [ ] **Step 2:** Run `./test validate`. Expected:
  PASS. Then commit `TEST-PLAN.md` only, with the
  subject `Note the F52 marquee drive limit`.

If R1 scores PASS, neither R2 nor any stub makes a
commit.

---

## Finish

- [ ] The scored F52 line is in
  `$TMPDIR/fusion-angle-redrive-<HEAD short SHA>.txt`,
  and the 8081 stack is down (`./deploy` takes compose
  down on exit).
- [ ] Report F52 as PASS, FAIL (with the stub path), or
  BLOCKED (with the step and the R2 commit). Nothing
  lands without the owner's word.

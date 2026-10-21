# The e04a7aee walk resolutions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Resolve every BLOCKED case (F52, F75), every
FAIL (FS4, G43, G47), and every drift candidate from
the Layer 3 walk of `e04a7aee` ("Correct the
person-retire roster oracle"). The evidence is
`/tmp/fusion-angle-walk-e04a7aee.txt`.

**Architecture:** There are three PR-sized units, each
on its own worktree off `next-release`, plus one
handoff. FS4 is the only product change: a red Layer 2
test, then the stub's `Reproduced by`, then one CSS
line. G43 is a docs-only rewrite of the case to the
identity fence that a decided spec and green pins
already hold. F52 and F75 each get one bounded
re-drive, and a driving note only if that re-drive
also fails to deliver the gesture. G47 stays FAIL until
`service-members`, the follow-up its case names, lands.

**Tech Stack:** Deno 2.9.6, `Deno.test` with
`@std/assert`, the Layer 2 CDP fixtures in
`tests/browser/fixtures.ts`, and plain CSS under
`web-app/app/styles/`.

**Spec:** None. The plan argues from the walk evidence,
from the three stubs under
`docs/superpowers/test-plan-mitigations/2026-10-20-*`,
and from `docs/superpowers/specs/2026-10-08-admin-scope-design.md`
(decision 2, §1 Reach, §7) for G43 and G47.

## Scope

| Case | Walk score | Resolution | Unit |
|---|---|---|---|
| F52 | BLOCKED | one bounded re-drive, else driving note | C |
| F75 | BLOCKED | one bounded re-drive, else driving note | C |
| FS4 | FAIL | red Layer 2 test, stub, CSS fix | A |
| G43 | FAIL | case rewritten to the identity fence (owner's ruling) | B |
| G47 | FAIL | stays FAIL until `service-members` lands | D (handoff) |
| AA30 | DEFERRED | out of scope | — |

**Drift candidates: none.** The walk scored none, and
this plan adds none. G43 is resolved by the owner's
ruling on 2026-10-21: rewrite the case, because the
product matches a decided spec and green pins (see
Unit B). It stays a FAIL resolution, not a drift
candidate.

TEST-PLAN.md is not re-run. Only the undelivered half
of F52 and F75 is driven again, once each.

## Findings this plan rests on

- **FS4.** `web-app/flows/stats.ts:89-91` sets
  `--card-x`/`--card-y` to the node's center, and
  `.flow-stats-card` (`web-app/app/styles/pages-flow-stats.css:242-260`)
  puts its left edge there. The card covers the
  node's right half. The pointer then hit-tests the
  card, `mouseout` on the node clears `hoveredNodeId`
  (`stats.ts:191-206`), and the card hides. The card
  has no inputs and no Save by contract (FS4), so
  nothing on it needs the pointer.
- **G43.** `GET identities/` lists only identities that
  hold an accepted membership in the claim organization
  (`api/routes.ts:3518-3543`, landed in `cf06fbee`). That
  is admin-scope decision 2 and §1 Reach. It is pinned
  green by `tests/api-identity-fence.test.ts` 'GET
  identities/ lists only the claim organization' and
  `tests/adapters-identity-roster.test.ts`
  'getIdentityRoster omits a membership-less person' and
  'getIdentityRoster omits a membership-less service'.
  The walk observed exactly this: six accepted Stark
  seats. The case text predates the fence.
- **G47.** Admin-scope §7 records that a service holds
  no membership, so every `identities/<service>/` route
  answers 403. The branch `service-members` (24 commits
  ahead of `next-release` and 2 behind; its spec is
  `service-members-design.md`) is the follow-up the case
  names. Its pin 'an organization admin reaches a
  service member identity (G47)' in
  `tests/api-service-members.test.ts` landed red at
  `e7a13d10` and green at `fa2a3162`. Its Task 37
  rewrites G47.
- **F52 / F75.** Layer 2 delivers both gestures through
  CDP today: `tests/browser/canvas-gestures.test.ts` 'a
  marquee on empty canvas selects the nodes it encloses'
  and 'a shift drag from a port onto a node commits an
  edge'. Their recipe (`Page.drag`,
  `tests/browser/fixtures.ts:251-266`) is a press, eight
  `mouseMoved` events carrying `buttons: 1`, and a
  release. The re-drives below copy that recipe. Why
  the walk's drags missed is not known. These are
  hypotheses only: a move without `buttons: 1`, a press
  that was not on bare canvas, or a release that was
  not over the target.

## Global Constraints

- Base every worktree on `next-release` at `6dff90b3`.
  Units land on `next-release` by `--ff-only`, on the
  owner's word. Never push, never force-push, never
  `-D`.
- One concern per commit. Subject is one line, present
  tense, about 50 characters. The only body is
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  Commit with
  `git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- Stage by path only. Never `git add -A` or `-a`.
- Run `export DENO_DIR="$TMPDIR/deno-dir"` before any
  `deno`, `./test`, or `./deploy`.
- Never log, echo, or print `POSTGRES_URL`,
  `JWT_HMAC_SIGNING_KEY`, or `PORT`. `./deploy --local`
  mints them. Never set them by hand.
- Master owns 8080, so re-drives deploy on 8081.
- No pin is edited, loosened, or deleted. A Pin clause
  in TEST-PLAN.md may gain or lose a citation. The
  tests themselves stay untouched.
- No product commit until its red test is committed
  and the stub's `Reproduced by` names it at that SHA.
- In a stub, only the `Reproduced by` field changes.
  Every other field stays frozen (TEST-PLAN.md
  § Mitigation specs).
- Lines are 78 characters at most in linted files, with
  4-space indent and no inline styles.
- Subagent prompts begin `Go to Medium Church!` (AGENTS.md
  § Subagents). Never pass `isolation`. Never run
  `./deploy --render`.

## Commandments kept, abominations refused

Kept:
- **I. Reliability.** A fix lands only behind a test
  that was red first.
- **IV. Logic.** G43's observed roster equals what the
  spec decided. Treating it as a product bug would be a
  fallacy, so the document changes, not the fence.
- **V. Clarity.** Each stub's `Reproduced by` says
  exactly what proves the case.
- **VIII. Simplicity.** FS4 is one declaration.
- The Article "We execute the request": no Layer 2
  tests for F52 or F75, and no fix to the card's `top`
  calc.
- The Offices of Verification (FS4 is tested at the
  highest layer that can see hit-testing) and of the
  Commit (one concern per commit, linear history).

Refused:
- **Test Weakening.** No assertion or pin is touched.
  G43 moves to the pins that decide it. It does not
  bend a pin to fit the page.
- **A fix without a failing test.** A3 is gated on A1
  being red. If A1 does not go red, Unit A stops.
- **A browser note treated as proof.** No commit cites
  the walk line. A product commit cites a stub only
  once that stub names the red test.
- **Unbidden Helper Code.** The only fixture addition
  is `Page.hover`, which A1 cannot be written without.

## Review Focus

1. **A click on a pinned card.** The click now lands on
   the node or canvas beneath it. A node re-pins, and
   empty canvas unpins. FS5's line already reads that
   way. The reviewer checks it against the
   `stats.ts:248-293` click handler. No new test (that
   would be scope creep).
2. **The bottom sheet below 768px**
   (`components-dialog.css:32-41`). `pointer-events:
   none` also applies there. The card has no overflow
   scroll and no controls, so nothing is lost. The
   reviewer confirms that no `overflow` rule exists.
3. **A hover point the card does not cover.** A1 hovers
   at 75% of the node's width, where today's card lies.
   If the seeded geometry leaves that point clear, A1
   is green, and Unit A stops and reports. Searching
   for a point that goes red is tuning the test to the
   bug. The owner rules on any other point.
4. **The G43 census after AA5 and B28.** The rewritten
   line must name the seats conditionally, the way the
   old line did, so a walk that skips AA5 still scores
   PASS.
5. **Rebase overlap with `service-members`.** That
   branch's Task 36 also edits G43. Unit B lands first,
   and the handoff says so.

---

## DAG

```
P (plan, this worktree)
├── A  fs4-stats-card-hover    A1 → A2 → A3 → A4
├── B  g43-fenced-roster       B1 → B2
├── C  walk-e04a7aee-redrive   C1 ∥ C2 → (C3 only if BLOCKED)
└── D  handoff → service-members (after B lands)
```

A, B, and C are independent once P lands. Each one
rebases onto `next-release` before it lands. A, B, and
C touch disjoint TEST-PLAN.md regions (FS4, G43 and its
setup line, and Driving notes), so a rebase that
conflicts means the base moved under it. Stop and
report.

### Task P: Land this plan

**Files:** `docs/superpowers/plans/walk-e04a7aee-fixes.md`
(this worktree, `.worktrees/walk-e04a7aee-fixes`, branch
`walk-e04a7aee-fixes`).

- [ ] **Step 1:** On the owner's approval only, commit
  the plan with subject `Add the e04a7aee walk
  resolutions plan`.

---

## Unit A: FS4, the stats card under hover

Worktree:
`git worktree add .worktrees/fs4-stats-card-hover -b fs4-stats-card-hover next-release`

### Task A1: Pin a stats card that holds under hover (red)

**Files:**
- Create: `tests/browser/flow-stats.test.ts`
- Modify: `tests/browser/fixtures.ts` (add `Page.hover`
  beside `Page.move`, `:233-240`)

**Interfaces:**
- Produces: `Page.hover(pt: Point): Promise<unknown>`.
  It sends one `Input.dispatchMouseEvent` with
  `type: 'mouseMoved'`, `button: 'none'`, `buttons: 0`,
  and no modifiers. That is a hover, not a drag.
- Consumes: `withAdminPage`, `stays`, `useBrowser`
  (`fixtures.ts`), `flowIdNamed`, `flowGraph`,
  `ONBOARDING` (`canvas.ts`), and `registryUrl`
  (`web-app/app/browser-drive.ts`). The page key is
  `'flow-stats'` (`web-app/app/page-registry.ts:192`).

- [ ] **Step 1: Write the test**

```ts
const CARD_HOLD_MS = 500;
const CARD_SHOWN = `!document.querySelector(`
    + `'#flow-stats-card').classList.contains('hidden')`;

Deno.test('a hovered stats node keeps its card open',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const flowId = await flowIdNamed(origin, ONBOARDING);
        const review = (await flowGraph(origin, flowId))
            .graph.nodes.find((n) => n.name === 'Review');
        assert(review);
        await page.navigate(registryUrl(
            origin.baseUrl, 'flow-stats', `flowId=${flowId}`,
        ));
        await page.ready('flow-stats');
        const node = `#flow-stats [data-node-id="${review.id}"]`;
        await page.waitFor(node);
        const r = await page.rect(node);
        const at = { x: r.x + r.width * 0.75,
            y: r.y + r.height / 2 };
        await page.hover(at);
        await page.until(CARD_SHOWN, 'card shown');
        assertStrictEquals(await page.evaluate<string | null>(
            `document.elementFromPoint(${at.x}, ${at.y})`
            + `?.closest('[data-node-id]')`
            + `?.getAttribute('data-node-id') ?? null`,
        ), review.id);
        await stays(page, CARD_SHOWN, CARD_HOLD_MS);
    });
});
```

- [ ] **Step 2: Run it red**

Run: `./test browser` (or the one file under the same
flags). Expected: FAIL. Either `elementFromPoint`
resolves to the card, so the strict-equal reads `null`
against Review's id, or 'card shown' or `stays` fails
because the card hid. Record the failing SHA.

**Gate:** If it passes, STOP. Do not commit A3. Report
to the owner that FS4 is not reproduced at Layer 2, and
leave the stub's `Reproduced by` as is.

- [ ] **Step 3: Check Layer 1 stays green.** Run
  `./test validate`. Expected: PASS. The new file is
  Layer 2 only, and `deno check` covers it.
- [ ] **Step 4: Commit** `tests/browser/flow-stats.test.ts`
  and `tests/browser/fixtures.ts` with subject
  `Pin a stats card that holds under hover`.

### Task A2: Name the FS4 reproduction

**Files:** `docs/superpowers/test-plan-mitigations/2026-10-20-FS-FS4.md`
(the `Reproduced by` field only).

- [ ] **Step 1:** Replace the field's value with
  `tests/browser/flow-stats.test.ts 'a hovered stats
  node keeps its card open' red at <A1 SHA>`, wrapped
  the way the other fields are.
- [ ] **Step 2: Commit** with subject
  `Name the FS4 hover reproduction`.

### Task A3: Let the stats card pass the pointer through

**Files:** `web-app/app/styles/pages-flow-stats.css:242-260`

- [ ] **Step 1:** Add `pointer-events: none;` to the
  `.flow-stats-card` rule, with a one-line why-comment
  (the card is read-only, so the node beneath stays the
  hover target). Touch nothing else: not
  `--card-x`/`--card-y`, the `top` calc, or `stats.ts`.
- [ ] **Step 2:** Run `./test validate browser`.
  Expected: PASS, with A1 green and every other Layer 2
  test unchanged.
- [ ] **Step 3: Commit** with subject
  `Let the stats card pass the pointer through`. This
  commit may cite
  `docs/superpowers/test-plan-mitigations/2026-10-20-FS-FS4.md`.
  The subject stays one line, so the cite lives in the
  PR description, not the body.

### Task A4: Cite the hover pin in FS4 and TODO

**Files:** `TEST-PLAN.md:4995-5013` (FS4's Pin clause)
and `TODO.md:2161-2165` (the FS4 hover sub-bullet).

- [ ] **Step 1:** Add this citation to FS4's Pin:
  `tests/browser/flow-stats.test.ts 'a hovered stats
  node keeps its card open' (decides the card shows
  and stays open while the pointer rests on the node,
  and that the node, not the card, takes the hit)`.
  The exploratory clause narrows to "the mouse-out hide,
  and the card's lack of inputs and a Save button".
- [ ] **Step 2:** In TODO.md, the sub-bullet "The hover
  and mouse-out wiring …" keeps only its mouse-out and
  no-inputs halves.
- [ ] **Step 3:** Run `./test validate`, then commit
  both files with subject `Cite the stats hover pin in
  FS4`.

---

## Unit B: G43, the roster under the identity fence

Worktree:
`git worktree add .worktrees/g43-fenced-roster -b g43-fenced-roster next-release`

This unit is docs only. No product file and no test file
changes.

### Task B1: Rewrite G43 to the fenced roster

**Files:** `TEST-PLAN.md:5259-5303` (G43) and
`TEST-PLAN.md:1639` (the B25–B29 setup line).

- [ ] **Step 1: Rewrite G43's PASS line.** Keep the
  header, the `#add-identity-btn`, the
  `.card[data-identity-id]` row anatomy for a person,
  the `getIdentityRoster` / Ops Assistant sentence, the
  empty state, and the Source. Replace the census with
  this. For Stark admin Tony, the list is one person
  row for each identity that holds an accepted Stark
  membership: Emily Rodriguez, Sarah Chen, Lisa Wang,
  Marcus Johnson, Tony Stark, and Jessica Park. Jordan
  Rivera is added if AA5's create held, and any seat an
  earlier case removed drops out (B28 removes Lisa
  Wang). Riley Okafor holds no membership and the
  Wayne-only members hold no Stark seat, so the
  identity fence lists neither, and no "Identity
  without PII" row stands in for them. No service row
  appears, because a service holds no membership
  (G47). Drop the service-row anatomy sentence.
- [ ] **Step 2: Rewrite G43's Pin.**
  - Add `tests/api-identity-fence.test.ts 'GET
    identities/ lists only the claim organization'`
    (decides the list is the claim organization's
    accepted seats).
  - Add `tests/adapters-identity-roster.test.ts
    'getIdentityRoster omits a membership-less person'`
    (decides Riley's absence).
  - Add `tests/adapters-identity-roster.test.ts
    'getIdentityRoster omits a membership-less service'`
    (decides there is no service row).
  - Keep `tests/presenter-identity-list.test.ts` 'person
    row shows name, email, and Person badge' and
    'renders an empty state when no identities'.
  - Drop the citations that decide rows G43 no longer
    shows: 'unnamed service redacts to a label, not the
    id', 'erased person falls back to the named
    constant', and `tests/api-organization-isolation.test.ts`
    'flat identity-pii is 404; nested foreign GET 403s'.
    Those tests are untouched.
  - The exploratory half becomes "the live named-row
    census".
- [ ] **Step 3:** At `:1639`, "leave it pending for the
  rest of the walk (G43, V8)" becomes "(V8)". G43 no
  longer reads Riley.
- [ ] **Step 4:** Run `./test validate`, then commit
  with subject `Rewrite G43 to the fenced roster`.

### Task B2: Name the G43 correction in its stub

**Files:** `docs/superpowers/test-plan-mitigations/2026-10-20-G-G43.md`
(the `Reproduced by` field only).

- [ ] **Step 1:** The value becomes `doc — G43 rewritten
  to the claim organization's accepted seats (owner
  ruling 2026-10-21); the fence is pinned by
  tests/api-identity-fence.test.ts 'GET identities/
  lists only the claim organization'`. That is the
  stub format's `doc —` arm (TEST-PLAN.md § Mitigation
  specs).
- [ ] **Step 2: Commit** with subject
  `Name the G43 roster correction`.

---

## Unit C: F52 and F75, one bounded re-drive each

Worktree:
`git worktree add .worktrees/walk-e04a7aee-redrive -b walk-e04a7aee-redrive next-release`

The tree must be clean. Then run:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./deploy --local 8081 --postgres mock-data
```

`./deploy` runs Layer 2 first. Sign in as
`demo@example.com` from the stdout credentials. Write
each scored line, in the walk's format, to
`$TMPDIR/fusion-angle-redrive-<HEAD short SHA>.txt`.
Each case gets one attempt, and only the undelivered
half is driven. Every CDP mouse event below is
`Input.dispatchMouseEvent` with `button: 'left'`. Moves
carry `buttons: 1`.

### Task C1: Re-drive F52 (a mid-marquee Space)

- [ ] **Step 1:** Open "Layout Test: Proposal Review
  Cycle" and turn Auto Fit off. Focus `svg.flow-canvas`
  per F47 and Driving notes, and confirm the wrap lacks
  `flow-pan-cursor`.
- [ ] **Step 2:** Read the canvas rect fresh. Let
  P = (x + 4, y + 4) and Q = the rect's center.
  Confirm `document.elementFromPoint(P)` is the
  `svg.flow-canvas` element itself. If it is not, score
  BLOCKED naming the hit element and stop.
- [ ] **Step 3:** Press at P. Send four moves along the
  segment P→Q (i/8 of the way, for i = 1..4). Read
  `.flow-marquee`'s width. If it is 0, score BLOCKED
  ("in-flight marquee not delivered by the Layer 2
  recipe"), stop, and go to C3.
- [ ] **Step 4:** Send Space the way `Page.key(' ')`
  does (keyDown then keyUp, key `' '`, code `Space`,
  vk 32). Send moves 5..8 to Q, then release at Q.
- [ ] **Step 5: Score.** PASS when the marquee width
  grew after Space, the wrap still lacks
  `flow-pan-cursor` after release, and at least one
  `.flow-node[aria-current="true"]` exists. If the
  gesture was delivered and either check fails, score
  FAIL and file a dated stub whose `Reproduced by` is
  "not reproduced". Its red Layer 2 test is a new plan,
  not this one.

### Task C2: Re-drive F75's re-fit half (add, delete, undo)

- [ ] **Step 1:** Open Layout Test with Auto Fit on. Use
  the driving notes' Shift-drag recipe. The walk's
  target, "New State", does not exist on a fresh seed,
  so the pair is Submit → Archive. The seed has no such
  edge (Submit's only outgoing edge is `submitted` →
  Triage).
- [ ] **Step 2:** Read Submit's `[data-connect-port]`
  center S and Archive's `.flow-node` center T, and the
  `.flow-edge` count E. Confirm `elementFromPoint(S)` is
  inside the port. Confirm
  `elementFromPoint(T).closest('[data-node-id]')` is
  Archive. Score a miss on either as BLOCKED, naming it.
- [ ] **Step 3:** keyDown Shift (key `Shift`, code
  `ShiftLeft`, vk 16, modifiers 8). Press at S with
  modifiers 8. Send eight moves to T with modifiers 8.
  Confirm the preview is the bezier, not the "New State"
  ghost. Release at T with modifiers 8, then keyUp
  Shift with modifiers 0.
- [ ] **Step 4:** Wait up to 5 s for the `.flow-edge`
  count to reach E + 1. If it does not, score BLOCKED
  ("Shift-drag add not delivered by the Layer 2
  recipe"), stop, and go to C3.
- [ ] **Step 5:** After the add, after a Delete of that
  edge (select it by its label, then press Delete), and
  after Cmd+Z (key `z`, modifiers 4), read
  `.flow-content` `getBBox()` against the canvas
  `viewBox`. Record all four margins each time.
- [ ] **Step 6: Score.** PASS when each of the three
  frames contains the bbox with a positive margin on
  all four sides. If the gesture was delivered and a
  frame clips, score FAIL and file a dated stub, as in
  C1 Step 5.

### Task C3: Record a durable driver limit (only on a repeat BLOCKED)

**Files:** `TEST-PLAN.md` § Driving notes (`:187` on),
added by the master only (TEST-PLAN.md:444-446).

- [ ] **Step 1:** For each case C1 or C2 scored BLOCKED,
  add one bullet:
  - F52: `- F52: CDP delivered no in-flight marquee on
    e04a7aee or on the <date> re-drive (canvas-inset
    press, \`buttons: 1\` moves); score BLOCKED on one
    attempt — the reducer and scenario pins decide it.`
  - F75: `- F75: the Shift-drag add was not delivered on
    e04a7aee or on the <date> re-drive (Submit port →
    Archive, recipe above); score its re-fit half
    BLOCKED on one attempt — the zoom-to-fit and
    presenter pins decide it.`
- [ ] **Step 2:** Run `./test validate`, then commit one
  bullet per commit, with subjects `Note the F52 marquee
  drive limit` and `Note the F75 Shift-drag drive
  limit`.

If both re-drives score PASS or FAIL, Unit C makes no
commit, and `git branch -d` removes the branch.

---

## Unit D: G47, leave FAIL until `service-members`

**Decision:** G47 stays FAIL on `next-release`. Its
follow-up is the branch `service-members`, which gives
services a membership. That branch already carries the
red-then-green pin 'an organization admin reaches a
service member identity (G47)'. Its Task 37 deletes the
failing preamble and re-aims the case at a
members-page service. Nothing in this plan edits G47's
PASS line. The G47 stub keeps "not reproduced" here,
because the red test is not on `next-release`, and a
SHA from that branch changes when it rebases.

Handoff lines for the `service-members` conductor. This
plan does not edit that worktree.

1. After Unit B lands, rebase onto `next-release`.
   Task 36's G43 bullet then amends the rewritten G43.
   Service rows appear only for seated services: every
   AI and service member.
2. Check Task 36's claim that the system identity
   (`NIL_IDENTIFIER`) lists. Spec decision 10 gives the
   system identity no membership, so the fence would
   omit it.
3. In Task 37, set the G47 stub's `Reproduced by` to
   `tests/api-service-members.test.ts 'an organization
   admin reaches a service member identity (G47)' red
   at <rebased SHA of "Pin the statement's AI and
   service kinds">`.

---

## Finish

- [ ] Every unit's last commit passes `./test validate`.
  Unit A also passes `./test validate browser`.
- [ ] Each worktree is removed and its branch deleted
  with `-d` after landing.
- [ ] Report each case's final state: FS4 fixed, G43
  rewritten, G47 FAIL pending `service-members`, and F52
  and F75 each PASS, FAIL (new stub), or BLOCKED with a
  driving note.

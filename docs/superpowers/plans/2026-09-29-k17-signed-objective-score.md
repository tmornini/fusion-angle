# K17 signed objective score — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this plan's worktree (AGENTS.md §
> Worktrees).

**Goal:** Turn the 29 Sep walk's K17 FAIL into a red
presenter test. Then land the one-line product change it
demands: an approved objectives row reads its saved
baseline as a signed value (−100) where it now reads
"—".

**Architecture:** K16 approves the project, so at K17
`ProjectObjectivesPresenter` renders the Actual slider in
place of the Baseline one. That slider's thumb is
pre-filled from the baseline: `value="-100"`, which is
K19's covenant. Its `.slider-value` readout, though,
prints `formatSigned(actual.score)` only when an actual
exists, and "—" otherwise. The small bipolar gauge
receives the baseline's `display` text but never paints
it; only `GaugePresenter`'s large legend does. So after
approval the saved −100 appears nowhere on the row as
text. The fix makes the Actual readout mirror its thumb,
as `web-app/projects/detail.ts`'s input handler already
does while dragging. The test sits in the presenter,
Layer 1, because the presenter paints the row.

**Tech Stack:** Deno 2.9.6, TypeScript strict,
`Deno.test` + `@std/assert`.

**Spec:** no design doc. The spec is the frozen stub
`docs/superpowers/test-plan-mitigations/2026-09-29-K-K17.md`
(committed to master by Task 0), plus TEST-PLAN K13,
K17, and K19.

**Worktree:** `.worktrees/2026-09-29-k17-signed-objective-score`
on branch `2026-09-29-k17-signed-objective-score`, base
`a6af68a6`. Task 0 rebases it onto master.

---

## What planning saw

The test in Task 2 was dry-run against `a6af68a6` and
then reverted. It type-checks, has no line over 78, and
is red with:

```
approved row with no actual reads its signed baseline (K17) ... FAILED
error: AssertionError: Values are not strictly equal.
    [Diff] Actual / Expected
-   —
+   −100
FAILED | 0 passed | 1 failed | 11 filtered out
```

The history pin `tests/presenter-project-score-history.test.ts`
'negative score TD carries data-tone="error"' is green
at `a6af68a6`. This plan never touches it.

## Global Constraints

- Work only in this worktree. Task 0 is the one master
  commit pair, shared by all four 29 Sep plans. Never
  `-D`. Never force-push. Never merge; rebase onto
  master, then `git merge --ff-only`.
- One concern per commit. Subject ≈50 chars,
  present-tense imperative, no body. Trailer: the
  mandated `Co-Authored-By: Claude Opus 5.5
  <noreply@anthropic.com>`, plus any `Claude-Session:`
  line the executing harness mandates.
- A product change lands ONLY in the commit that turns
  a test watched red green. Every commit is green at
  Layer 1: the red test stays uncommitted until its fix
  goes in with it.
- Dated stubs stay frozen. The only edit this plan
  makes to `2026-09-29-K-K17.md` is replacing its
  `Reproduced by` line, in its own commit, after the
  test is seen red and before the product commit. Never
  edit an older stub.
- Do not weaken a green test. Every existing test in
  `tests/presenter-project-objectives.test.ts` and the
  history pin stay as they are.
- The product's minus is U+2212 (`formatSigned` in
  `web-app/app/scoring-format.ts`). The test names it
  rather than typing a glyph that reads like `-`.
- Under the Claude Code sandbox, before any `deno`,
  `./test`, or `./bin/*`:
  `export DENO_DIR="$TMPDIR/deno-dir"`.
- Voice: 78-char max in `.ts` under `api/ web-app/
  tests/ shared/ server/`; 4-space indent; no inline
  styles; SafeHtml from presenters; no `org` identifier
  abbreviation.
- Commandments in play: Clarity, since the row must say
  what was saved. Uniformity: the readout means "the
  thumb's value" in both branches and in the drag
  handler. Logic: "—" means no saved value, never "no
  actual yet"; the caption already says "none yet".
- Abominations to refuse: Test Weakening; Default Values
  (no `?? 0` feeding the readout; absence stays "—");
  Unbidden Helper Code (no gauge legend and no new
  caption, since the readout already exists).
- Layer 1, one file:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write --allow-net \
    --allow-run=deno,./bin/serve,./deploy,sh,./test,./bin/postgres-wipe,./bin/postgres-seed \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    --filter 'SUBSTRING' tests/FILE.test.ts
```

- Layer 1, the gate: `./test validate`. Baseline at
  `a6af68a6`: `./test` prints
  `ok | 3622 passed | 0 failed | 8 ignored`, then
  `ok | 8 passed | 0 failed`.

## Review Focus

1. **An approved row with an actual.** The readout
   shows the actual (`formatSigned(actValue)` with
   `actValue = actual.score`). Pinned by 'shows latest
   actual with sign'.
2. **An approved row with no baseline.** The slider is
   disabled and the readout stays "—". This is the new
   test's `o2` assertion.
3. **An approved row whose saved baseline is 0.** It
   now reads "0" where it read "—". That is correct: 0
   is a measured score, and unscored is absence
   (TEST-PLAN AA22a). Reviewer check: `formatSigned(0)`
   returns `'0'`.
4. **Pre-approval rows** (submitted, under_review,
   sent_back, declined, archived). The Baseline branch
   is untouched. Pinned by 'renders one row per active
   objective' (`+50`) and the slider-visibility tests.
5. **The drag readout.** `web-app/projects/detail.ts`
   writes `sign + String(v)`, an ASCII `-100`, while
   dragging. That is out of scope here; Task 4 files it.

---

## File structure

| File | Role |
|---|---|
| `tests/presenter-project-objectives.test.ts` | import `assertStrictEquals`; `sliderReadout` helper; the K17 test |
| `docs/superpowers/test-plan-mitigations/2026-09-29-K-K17.md` | `Reproduced by` line only |
| `web-app/app/presenters/project-objectives.ts` | `actualReadout` (after line 141); the Actual `.slider-value` (lines 210-215) |
| `TEST-PLAN.md` | K17 Pin clause names the new test |
| `TODO.md` | drop the K17 sub-bullet; file the ASCII drag readout |

---

### Task 0: Record the stubs and the tracking on master (shared)

All four 29 Sep plans carry this task verbatim. Whichever
plan executes first does Steps 2 and 3. The others find
both commits on master and only do Step 4.

- [ ] **Step 1: Check what master already has**

```bash
cd /Users/tmornini/code/fusion-angle
git status --short docs/superpowers/test-plan-mitigations/
grep -n "The 29 Sep walk's mitigations" TODO.md
```

If the three `2026-09-29-*.md` stubs print as `??`, do
Step 2. If `grep` prints nothing, do Step 3. Otherwise
go to Step 4.

- [ ] **Step 2: Commit the three stubs, docs-only, on
  master**

Read each stub first and commit it byte-for-byte as the
walk left it. Its Observed, Expected, and Pin lines
never change.

```bash
cd /Users/tmornini/code/fusion-angle
git add \
    docs/superpowers/test-plan-mitigations/2026-09-29-F-F29.md \
    docs/superpowers/test-plan-mitigations/2026-09-29-I-I21.md \
    docs/superpowers/test-plan-mitigations/2026-09-29-K-K17.md
git commit -F - <<'EOF'
Record 29 Sep TEST-PLAN FAIL stubs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 3: Track the four plans in TODO.md, on
  master**

In `TODO.md`, `## Critical functionality path`, replace:

```
  rewrite honest. G9's staleness was the corrupted test
  name, restored by the small-items sweep

## Later work
```

with:

```
  rewrite honest. G9's staleness was the corrupted test
  name, restored by the small-items sweep
- The 29 Sep walk's mitigations — one plan and
  worktree each, the plan on its branch as
  `docs/superpowers/plans/<slug>.md`; a sub-bullet
  leaves when its branch lands, and the last one out
  takes this line with it
  - F29, `2026-09-29-f29-zoomed-viewbox` — deleting
    the open panel's node or edge leaves the panel open
    behind an empty selection, so the next empty-canvas
    click restores the viewBox the panel saved on open
    (`docs/superpowers/test-plan-mitigations/2026-09-29-F-F29.md`).
    Oracle: `tests/browser/canvas-pan.test.ts` 'An
    empty-canvas click after deleting the open edge
    keeps the zoomed viewBox (F29)' green
  - I21, `2026-09-29-i21-members-skeleton` — the
    members skeleton the walk did not see while its
    organization GETs were paused
    (`docs/superpowers/test-plan-mitigations/2026-09-29-I-I21.md`).
    Oracle: `tests/members-pending-skeleton.test.ts`
    'members paints the table skeleton while its GETs
    are held (I21)' lands, red or green
  - K17, `2026-09-29-k17-signed-objective-score` — an
    approved objectives row reads "—" where its saved
    −100 baseline belongs
    (`docs/superpowers/test-plan-mitigations/2026-09-29-K-K17.md`).
    Oracle: `tests/presenter-project-objectives.test.ts`
    'approved row with no actual reads its signed
    baseline (K17)' green
  - TEST-PLAN drift, `2026-09-29-walk-drift` — AT2,
    AT4, A2, F9, F21, G36, and K26 still describe
    behavior the walk did not see. Oracle: each case
    reads as the 29 Sep walk and the re-count saw

## Later work
```

```bash
cd /Users/tmornini/code/fusion-angle
git add TODO.md
git commit -F - <<'EOF'
Track the 29 Sep walk mitigations in TODO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Markdown only: no `./test validate`.

- [ ] **Step 4: Rebase this worktree onto master**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-09-29-k17-signed-objective-score
git rebase master
ls docs/superpowers/test-plan-mitigations/2026-09-29-K-K17.md
```

Expected: the rebase succeeds and `ls` prints the path.

---

### Task 1: Commit this plan

**Files:**
- Create: `docs/superpowers/plans/2026-09-29-k17-signed-objective-score.md`

- [x] **Step 1: Commit the plan as written**, subject
  `Plan the K17 signed-objective mitigation`. Done in
  the planning session. Markdown only.

---

### Task 2: Read the pre-filled actual as a signed value

**Files:**
- Test: `tests/presenter-project-objectives.test.ts`:
  line 1 import, plus a helper and a test appended after
  line 279
- Modify: `docs/superpowers/test-plan-mitigations/2026-09-29-K-K17.md`,
  the `Reproduced by` line only
- Modify: `web-app/app/presenters/project-objectives.ts`:
  after line 141, and lines 210-215

**Interfaces:**
- Consumes: `ProjectObjectivesPresenter(activeObjectives,
  defs, latestBaselines, latestActuals, state)`, and the
  file's existing `activeObjs` (ids
  `ohqxgUBEaFQwYbXsonRPmg`, `o2`) and `defs` fixtures
- Produces: `sliderReadout(html: string, objectiveId:
  string): string | undefined`, local to the test file.
  Also the test name Tasks 3 and 4 cite

- [ ] **Step 1: Write the failing test**

In `tests/presenter-project-objectives.test.ts`, replace
line 1:

```ts
import { assert } from '@std/assert';
```

with:

```ts
import { assert, assertStrictEquals } from '@std/assert';
```

Append at the end of the file:

```ts

const MINUS_SIGN = '−';
const EM_DASH = '—';

// The row's `.slider-value`, the readout beside its live
// slider.
function sliderReadout(
    html: string, objectiveId: string,
): string | undefined {
    const row = html.match(new RegExp(
        `data-objective-id="${objectiveId}"`
        + '[\\s\\S]*?<span class="slider-value">'
        + '\\s*([^<]*?)\\s*</span>',
    ));
    return row?.[1];
}

Deno.test(
    'approved row with no actual reads its signed'
    + ' baseline (K17)',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'pnXmXrxOWayANgDLdCjuBw'
               , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
           memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
           score: -100,
           at: '2026-05-14T00:00:00.000000Z' }],
        [],
        'approved',
    );
    const html = p.buildSection().toString();
    assertStrictEquals(
        sliderReadout(html, 'ohqxgUBEaFQwYbXsonRPmg'),
        MINUS_SIGN + '100',
    );
    assertStrictEquals(
        sliderReadout(html, 'o2'),
        EM_DASH,
    );
});
```

The first row is Raise customer NPS's shape at K17:
baseline −100, approved, no actual yet. The second, `o2`,
has no baseline, so its disabled slider must still read
"—".

- [ ] **Step 2: Run it and record the red**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-09-29-k17-signed-objective-score
export DENO_DIR="$TMPDIR/deno-dir"
git rev-parse --short HEAD
deno check --frozen tests/presenter-project-objectives.test.ts
```

Then the Layer 1 one-file command with
`--filter 'K17' tests/presenter-project-objectives.test.ts`.

Expected, as in planning:

```
approved row with no actual reads its signed baseline (K17) ... FAILED
error: AssertionError: Values are not strictly equal.
    [Diff] Actual / Expected
-   —
+   −100
FAILED | 0 passed | 1 failed | 11 filtered out
```

Record the SHA that `git rev-parse` printed. If the test
passes, stop: no product change may follow.

- [ ] **Step 3: Name the red test in the stub (its own
  commit)**

In `docs/superpowers/test-plan-mitigations/2026-09-29-K-K17.md`,
replace:

```
- Reproduced by:
  not reproduced — the history pin stayed green
  at a6af68a6; no red test covers the signed
  value on the objectives row
```

with the following, where `RED_SHA` is the SHA recorded
in Step 2:

```
- Reproduced by:
  tests/presenter-project-objectives.test.ts
  'approved row with no actual reads its signed
  baseline (K17)' red at RED_SHA
```

```bash
git add docs/superpowers/test-plan-mitigations/2026-09-29-K-K17.md
git commit -F - <<'EOF'
Name the K17 red test in its stub

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git status --short
```

Expected: only
` M tests/presenter-project-objectives.test.ts`.

- [ ] **Step 4: Write the minimal implementation**

In `web-app/app/presenters/project-objectives.ts`,
replace:

```ts
        const baseValue = baseline?.score ?? 0;
        const actValue = actual?.score ?? baseValue;
```

with:

```ts
        const baseValue = baseline?.score ?? 0;
        const actValue = actual?.score ?? baseValue;
        // The Actual readout mirrors its thumb, which the
        // baseline pre-fills until an actual lands; only a
        // row with neither reads as absent.
        const actualReadout =
            actual !== undefined || baseline !== undefined
                ? formatSigned(actValue)
                : '—';
```

Then replace the Actual branch's readout:

```ts
                        <span class="slider-value">
                            ${actual !== undefined
                                ? formatSigned(
                                    actual.score)
                                : '—'}
                        </span>
```

with:

```ts
                        <span class="slider-value">
                            ${actualReadout}
                        </span>
```

Leave the Baseline branch's readout (line 243 onward)
untouched.

- [ ] **Step 5: Run it green**

Layer 1 one-file command on the whole file:
`tests/presenter-project-objectives.test.ts` with no
`--filter`. Expected: `ok | 12 passed | 0 failed`.
Then the history pin, unchanged:
`--filter 'negative score TD'
tests/presenter-project-score-history.test.ts`.
Expected: `ok | 1 passed | 0 failed`. Then:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate 2>&1 | tail -6
```

Expected: exit 0; `ok | 3623 passed | 0 failed |
8 ignored`, then `ok | 8 passed | 0 failed`.

- [ ] **Step 6: Commit the test and the fix together**

```bash
git add tests/presenter-project-objectives.test.ts \
    web-app/app/presenters/project-objectives.ts
git commit -F - <<'EOF'
Read the pre-filled actual as a signed value

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Name the K17 readout pin in TEST-PLAN

**Files:**
- Modify: `TEST-PLAN.md`, the K17 Pin clause only
  (lines 6419-6422 at `a6af68a6`)

- [ ] **Step 1: Edit the Pin clause**

Replace:

```
  Pin: tests/presenter-project-score-history.test.ts
       'negative score TD carries data-tone="error"';
       exploratory — the live persistence of the signed
       value on the objectives screen itself
```

with:

```
  Pin: tests/presenter-project-score-history.test.ts
       'negative score TD carries data-tone="error"';
       tests/presenter-project-objectives.test.ts
       'approved row with no actual reads its signed
       baseline (K17)' (decides the approved row's
       readout shows the saved baseline as a signed −100
       until an actual lands); exploratory — the live
       persistence of the signed value across K13's save
       and K16's approval
```

- [ ] **Step 2: Commit**

```bash
git add TEST-PLAN.md
git commit -F - <<'EOF'
Name the K17 readout pin in TEST-PLAN

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Markdown only: no `./test validate`.

---

### Task 4: Retire K17 from TODO; file the drag readout

**Files:**
- Modify: `TODO.md`, `## Critical functionality path`

- [ ] **Step 1: Drop the K17 tracking sub-bullet**

Remove these lines, which Task 0 added:

```
  - K17, `2026-09-29-k17-signed-objective-score` — an
    approved objectives row reads "—" where its saved
    −100 baseline belongs
    (`docs/superpowers/test-plan-mitigations/2026-09-29-K-K17.md`).
    Oracle: `tests/presenter-project-objectives.test.ts`
    'approved row with no actual reads its signed
    baseline (K17)' green
```

If it is the last sub-bullet under "The 29 Sep walk's
mitigations", remove that parent bullet's five lines
too.

```bash
git add TODO.md
git commit -F - <<'EOF'
Drop the landed K17 item from TODO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 2: File the ASCII drag readout**

Insert this bullet directly above `## Later work`,
after the last bullet of `## Critical functionality
path`, with one blank line before the heading:

```
- A dragged objective slider's readout speaks a second
  voice: `web-app/projects/detail.ts`'s input handler
  writes `sign + String(v)` (ASCII `-100`) where the
  presenter paints `formatSigned`'s U+2212 `−100`, so
  K13's row reads `-100` until the save re-renders it.
  Oracle: a Layer 2 test that drags a `.baseline-slider`
  to its minimum and reads `.slider-value` as
  `formatSigned(-100)`
```

```bash
git add TODO.md
git commit -F - <<'EOF'
File the ASCII slider readout in TODO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Land

- [ ] **Step 1: Rebase and gate**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-09-29-k17-signed-objective-score
git rebase master
export DENO_DIR="$TMPDIR/deno-dir"
./test validate 2>&1 | tail -6
```

`TODO.md` and `TEST-PLAN.md` may conflict with a sibling
29 Sep plan that landed first. Keep every sibling's
lines and drop only this plan's own. Amend until every
commit is green.

Expected: exit 0.

- [ ] **Step 2: Fast-forward master and clean up**

```bash
cd /Users/tmornini/code/fusion-angle
git merge --ff-only 2026-09-29-k17-signed-objective-score
git worktree remove .worktrees/2026-09-29-k17-signed-objective-score
git branch -d 2026-09-29-k17-signed-objective-score
```

If `--ff-only` refuses, return to Step 1. Never `-D`.

---

## Out of scope

- `tests/presenter-project-score-history.test.ts` and
  its history modal, which already pass K17's second
  half.
- A legend or caption for the small bipolar gauge's
  `display` text.
- The drag handler's ASCII minus, filed by Task 4.
- No walk, no `./deploy`, no `./deploy --render`.

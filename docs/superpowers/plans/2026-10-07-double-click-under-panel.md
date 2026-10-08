# 0j Double-Click Under an Open Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking. Ride this worktree. Do not
> create one. Do not rebase, merge, land, push,
> force-push, or delete a branch. One worker. Subagents
> work here and never pass the Agent tool `isolation`.

> **For the dispatching orchestrator:** every subagent
> prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then push down: the voice
> rules (78-char lint on code and scripts, which covers
> this plan's code, not `.md`; 4-space indent; no inline
> styles; present-tense imperative ~50-char commit
> subjects, no body, then the trailers under Global
> Constraints), the commandments and abominations the
> task names, the AGENTS.md § Subagents patterns (quoted
> in Global Constraints), and a base precondition (HEAD
> is the SHA the dispatch names and `git status --short`
> is empty, else STOP). Subagents work in
> `/Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel`,
> never pass the Agent tool `isolation`, and never run
> `./deploy` in any form, `./bin/build`,
> `./bin/measure`, `./bin/postgres-seed`,
> `./bin/postgres-wipe`, or any seed or wipe verb. No
> walk. Layer 2 is authorised: `./test browser`,
> `./test validate browser`, and the one-test command
> under Global Constraints.
>
> Task 0 is yours, before any dispatch. Then, per task,
> in order, before the next task starts:
>
> 1. Implementer: a fresh agent of the type the task
>    names (`coder` for Tasks 3, 5, 6, 7, and 8, whose
>    code or text this plan holds in full; `planner` for
>    Task 4, which needs Chrome and judgment).
> 2. Spec-compliance review: a fresh agent of type
>    `planner`.
> 3. Quality review: another fresh agent of type
>    `planner`, who walks each rule the task touches for
>    false matches and false misses.
>
> After Task 8: a fresh agent of type `architect`
> reviews `ddfc1cb6..HEAD` against the spec. Pass no
> model override to any dispatch.
>
> A reviewer's finding is fixed by a fresh agent of the
> task's implementer type that amends the task's own
> commit (`git commit --amend --no-edit`; the branch is
> local), re-runs the task's gates, and is reviewed
> again by a fresh `planner` of the same kind. A finding
> that says the spec is wrong is not fixed: STOP and
> report it to the owner. If Chrome cannot launch, STOP
> where the plan says and report; do not work around it.

**Goal:** a second press inside `DBLCLICK_MS` that lands
within `DBLCLICK_SLOP_PX` (4 client px) of the first,
while the first press's element is still in the FSM's
selection, runs that element's double-click and starts
no gesture, so a double-click under an open panel keeps
the panel on the node a person aimed at; FLOW-CANVAS.md,
TODO.md, and TEST-PLAN.md follow.

**Architecture:** the reducer owns the rule. Task 3
carries the press's client point and time into the FSM
(types, the adapter's four `pointerdown` dispatches, the
reducer's two `lastClick` writes, the fixtures) and
changes no behavior. Task 4 adds `isSecondPressNear`
and `secondPressOf` to `web-app/app/flow-fsm-reduce.ts`
and calls them first in the canvas, node, and edge
presses, with red Layer 2 and Layer 1 tests first as a
process. Tasks 5 through 8 are one doc commit each.
Nothing is stored outside `FsmState`; there is no
timer.

**Tech Stack:** Deno 2.9.6, TypeScript (`strict`,
`noUncheckedIndexedAccess`, `erasableSyntaxOnly`,
`verbatimModuleSyntax`), `@std/assert`, Chrome over CDP
for Layer 2.

**Spec:** `docs/superpowers/specs/2026-10-07-double-click-under-panel-design.md`
(commit 1, `15f66b17`). The spec is the source of truth:
its § 1-2 code is the product code below, its § 3
scenarios are Task 4's tests, its § 4 is Tasks 5-8, and
its `## Sequence` rows 3-8 are this plan's tasks. Its
line cites say where to look on `ddfc1cb6`; they are not
edit addresses. Rule (b)'s still-selected condition
(Decision 4), which arose while the spec was written,
was confirmed by the owner on 2026-10-07 ("Keep the
still-selected condition"); this plan implements it as
written. The owner also ruled, the same day, "Swap
Tasks 7 and 8. Fix the spelling.": this plan pins F13
(Task 7) before it closes 0j (Task 8), the reverse of
the spec's `## Sequence` rows 7 and 8, so TEST-PLAN.md
never cites a removed 0j; and Task 8 also corrects
TODO.md's British-spelling entry, which names 0j and
counts a TEST-PLAN.md line Task 7 removes. The owner's
word outranks the spec's order.

**Worktree:** `.worktrees/2026-10-07-double-click-under-panel`,
branch `2026-10-07-double-click-under-panel`, stacked on
`2026-10-06-walk-recipes` at `ddfc1cb6` (on
`todo-triage`'s `1e0941c5`, on `master`'s `8e834e76`).
Commit 1 is the spec, commit 2 this plan.

**Out of bounds:** the spec, this plan,
`docs/superpowers/plans/test-plan-walk-2026-10-04.md`,
AGENTS.md, ARCHITECTURE.md, AUDIT.md, DESIGN-SYSTEM.md,
`web-app/flows/detail.ts`, and every file a task does
not name. If the spec is wrong, STOP and report.

---

## Global Constraints

- Sandbox, before any `deno` command, `./test`, or
  `./test browser`:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
```

- Code edits are exact string replacements with the
  Edit tool. Every old text below is quoted in full and
  was proved unique by a dry run on a plain copy of
  this worktree; the Edit tool refuses a non-unique old
  text, and if it does, STOP and report (never widen
  it). The one scripted edit (Task 3 Step 13) is a Deno
  program the plan gives in full.
- Doc edits are exact string replacements with the
  Edit tool, never `sed`, never a line number. Before
  each, run the step's `grep -cF -e` anchor (expected
  `1`). Any other count: STOP and report.
- Copy every block verbatim, character for character,
  indentation included. Never paraphrase TODO.md,
  TEST-PLAN.md, or FLOW-CANVAS.md text; never rewrap.
- Touch nothing the task does not name: no reflow, no
  drive-by fix, no helper the task does not give.
- Voice: the 78-character lint (`./test lint`) covers
  every `.ts` line this plan adds; 4-space indent; no
  inline styles; no untyped `any`;
  `noUncheckedIndexedAccess` is on (an index read is
  `T | undefined`).
- Gate before every commit, with a 600000 ms timeout:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate > "$TMPDIR/0j-gate.log" 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' "$TMPDIR/0j-gate.log" \
    | grep -E '^(ok|FAILED) \|'
```

  Expected: `exit 0`, then the task's line (Task 3:
  `ok | 4141 passed | 0 failed | 11 ignored`; Tasks 4
  through 8: `ok | 4150 passed | 0 failed | 11
  ignored`), then the timezone pass `ok | 8 passed | 0
  failed`; about 1m35s. The tree is dirty when it runs,
  so the SHA skip never fires. Any other count: STOP
  and report.
- Layer 2, the whole suite: it bundles the client into
  `$TMPDIR`, starts an in-process memory origin, and
  runs `tests/browser/*.test.ts` serially, about 5
  minutes. `bin/test-browser` finds Chrome:
  `CHROME_DEBUG_URL` (a running Chrome's browser
  WebSocket URL) if set, else `CHROME` (a binary or a
  `.app` bundle), else `/Applications/Google Chrome.app`.

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test browser > "$TMPDIR/0j-l2.log" 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' "$TMPDIR/0j-l2.log" \
    | grep -E '^(ok|FAILED) \|'
```

- Layer 2, one test in `tests/browser/canvas-gestures.test.ts`
  (`FILTER` is a substring of the test name; the
  environment is the one `bin/test-browser` sets):

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
export DENO_DIR="$TMPDIR/deno-dir"
FILTER='keeps the panel on it'
bash -c '
set -uo pipefail
source bin/build-lib
B=$(mktemp -d "$TMPDIR/fusion-browser.XXXXXX")
bundle_client "$B" > /dev/null
export FUSION_ANGLE_STATIC_ROOT="$B"
if [ -z "${CHROME_DEBUG_URL:-}" ]; then
    export CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
fi
export JWT_HMAC_SIGNING_KEY=test-hmac-signing-key
TZ=UTC deno test --frozen --no-check \
    --sanitize-resources \
    --allow-env --allow-read --allow-write \
    --allow-net --allow-run \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --filter "$1" tests/browser/canvas-gestures.test.ts
rc=$?
rm -rf "$B"
exit $rc
' _ "$FILTER" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' \
    | grep -E '\.\.\. (ok|FAILED)|^(ok|FAILED) \||rror'
```

- Layer 1, chosen files, with the flags `./test` passes
  (`FILES` names them):

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
export DENO_DIR="$TMPDIR/deno-dir"
FILES='tests/flow-fsm-scenarios.test.ts'
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write --allow-net \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    --preload ./tests/worker-name-prefix.ts \
    $FILES 2>&1 | sed 's/\x1b\[[0-9;]*m//g' \
    | grep -E '\.\.\. (ok|FAILED)|^(ok|FAILED) \|'
```

- If Chrome cannot launch (every file fails with
  `Chrome DevToolsActivePort timed out after 15000ms`,
  as it does under the Claude Code sandbox on
  2026-10-07), STOP at that step and report it. Do not
  patch the harness, the sandbox, or a test. The owner
  may run the step outside the sandbox or set
  `CHROME_DEBUG_URL`.
- Commit message: one subject line (the task's exact
  subject), no body, a blank line, the Co-Authored-By
  trailer naming the model that writes the commit (a
  `coder` runs Sonnet, a `planner` Opus; if the session
  says another model, name that one), then the
  `Claude-Session:` line the executing session's
  attribution reminder gives, if it gives one. The
  blocks below print `SESSION_LINE` where that line
  goes: substitute it, or delete the line if the
  reminder gives none. Shape:

```bash
git commit -F - <<'MSG'
<exact subject>

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
SESSION_LINE
MSG
```

- Author stays the repository's configured user. Do not
  pass `--author`. Stage only the files the task names,
  by path. Never bare `git stash`.
- AGENTS.md § Subagents patterns, pushed down to every
  subagent: RequestContext as the first argument to
  client verbs; a client verb returns an `HttpMessage`,
  an array of them, or a value that keeps one (the
  aggregates TODO.md's three-shapes bullet names
  excepted); a write from a held message takes the
  message it latches; SafeHtml from presenters;
  snake_case storage / camelCase domain; HTTP-verb
  adapter naming (`getNoun`/`putNoun`/`deleteNoun`/
  `postNounOperation`); validators at the gate, not
  downstream; no untyped `any` from external
  boundaries.
- Commandments every task touches: Reliability, Logic,
  Clarity, Uniformity. Abominations every task risks:
  Test Weakening, Cleverness, Unbidden Helper Code,
  Premature Generalization.

## Review Focus

The spec's traps. Every reviewer checks each one its
task touches.

1. **No timer.** Nothing in the diff calls
   `setTimeout`, `setInterval`, or
   `requestAnimationFrame`, or holds the camera to dodge
   the window (the 4 Oct plan's Cleverness line). The
   rule reads only `FsmState` and the press input; the
   adapter gains no state.
2. **The same-node path is byte-identical.** In
   `onNodePointerDown` and `onEdgePointerDown`, every
   line from `const isDbl =` to the function's end is
   the base's, plus only the two `clientX`/`clientY`
   lines Task 3 adds to `lastClick`; the new guard
   returns before it only when the pressed id differs
   from `lastClick.id`. `git diff ddfc1cb6 --
   web-app/app/flow-fsm-reduce.ts` removes no line.
3. **A matching press starts no gesture.**
   `secondPressOf` emits exactly `open-panel: true` and
   `request-update`, no `capture-pointer`, and sets no
   drag, connect, marquee, or pan; it is decided before
   the port, locked, and drag branches, so the node that
   slid under the pointer is neither selected, dragged,
   nor connected. Task 4's scenarios 2, 3, and 8 pin it.
4. **The still-selected condition.** A matching press
   also needs the first press's element in
   `state.selection` (`isStillSelected`); a stale
   `lastClick` (a Delete, a Meta toggle, a page-side
   selection write) takes today's path. Scenario 9 pins
   the page-side and the Meta-toggle paths. The owner
   confirmed the clause on 2026-10-07.
5. **Center-on-release and the Camera rules hold.**
   'a node click under an open panel centers it on
   release (F13)' stays green at Tasks 3 and 4 and at
   the tip; no `web-app/flows/detail.ts` line changes;
   with Auto Fit off a matching press moves no camera,
   and with it on its re-fit is the debt Task 6 files,
   not behavior to fix here.
6. **Fixtures keep their meaning.** Task 3 gives each
   node press a client point equal to its svg point
   (distinct elements in one fixture stay more than 4 px
   apart: the retarget pin's n1 and n2 are 200 apart),
   each canvas press `now: 1000` (every canvas fixture
   starts from `lastClick: none`), and each edge press
   `clientX: 0, clientY: 0`. No assertion, time, id, or
   other field changes.
7. **Red first, as a process.** Task 4's report shows
   the Layer 2 test run alone and failing with the
   panel's name reading `null`, and the scenarios
   failing `FAILED | 19 passed | 6 failed` with the six
   names Task 4 Step 10 lists, both before any product
   edit. The red tests are committed with the fix, never
   alone.
8. **The TODO.md moves are exact.** Task 6 moves item
   11's clause into one new `## Later work` entry
   between "Four panel doors are unpinned." and "A flow
   loaded with Auto Fit off"; Task 8 removes the 0j
   bullet, the intro's 0j clause, and the intro-cue
   entry, says "Seventeen", and in the British-spelling
   entry drops the sentence naming 0j and counts 22
   TEST-PLAN.md lines (Task 7 removes one "centred").
   Nothing else in TODO.md moves.
9. **F13's Scoring follows the Scoring table.** With
   the Layer 2 pin green, a delivered one-point pair
   that misses is BLOCKED, naming the driver (the FAIL
   row admits only an observation no green pin
   decides); F13's body sentence, its Pin, and
   Scoring's F13 line say the same.
10. **Nothing loosens a Pin.** Every existing PASS
    clause, Pin name, selector, and assertion stays;
    F13's aim rule, one-point drive, press array, and
    "Auto Fit must be off" stay; the only Pin change is
    F13's exploratory clause becoming the new test.

---

## Graph

Commit 1 (`15f66b17`, the spec) and commit 2 (this
plan, "Plan 0j's double-click under an open panel")
precede execution. Task 0 (the Layer 2 baseline, no
commit) runs first. Tasks then run strictly in order
3, 4, 5, 6, 7, 8, one commit each:

| Task | Commit subject | Agent | Files |
|---|---|---|---|
| 3 | Carry the press point and time | `coder` | `web-app/app/flow-interactions.ts`, `web-app/app/flow-fsm-types.ts`, `web-app/app/flow-fsm-reduce.ts`, `tests/flow-fsm-reduce.test.ts`, `tests/flow-fsm-scenarios.test.ts`, `tests/flow-designer-presenter.test.ts` |
| 4 | Match a second press by its point | `planner` | `web-app/app/flow-fsm-types.ts`, `web-app/app/flow-fsm-reduce.ts`, `tests/flow-fsm-scenarios.test.ts`, `tests/browser/canvas-gestures.test.ts` |
| 5 | Name the double-click rule in FLOW-CANVAS.md | `coder` | `FLOW-CANVAS.md` |
| 6 | File item 11's re-fit as its own entry | `coder` | `TODO.md` |
| 7 | Pin F13 to the double-click fix | `coder` | `TEST-PLAN.md` |
| 8 | Close 0j | `coder` | `TODO.md` |

Task 4 consumes Task 3's fields. Task 5 cites Task 4's
`DBLCLICK_SLOP_PX` and `isSecondPressNear`. Task 7 cites
Task 4's Layer 2 test name, and removes TEST-PLAN.md's
two "TODO.md 0j" cites before Task 8 removes 0j, so no
commit cites a removed item; Task 8's spelling-entry
count (22) counts Task 7's TEST-PLAN.md. Tasks 6 and 8
both edit TODO.md in disjoint regions: Task 6's anchors
do not occur in the text Task 8 removes, and Task 8's
anchors do not occur in Task 6's new entry. Tasks 5 and
7 each touch one file no other task touches.

Each code task's cycle: write the failing test (or, in
Task 3, the type that fails the check), run it red,
write the code, run it green, gate, commit. Each doc
task's cycle: confirm each anchor occurs exactly once,
apply each Edit, run the Check block, gate, show `git
diff --stat`, commit. Then the two reviews, then the
next task.

---

## Task 0: Record the Layer 2 baseline

**Owner:** the orchestrator, before any dispatch. No
commit.

The planning session could not record it: under the
Claude Code sandbox on 2026-10-07, `./test browser` at
`58d26973` (the spec's first form, docs-only above
`ddfc1cb6`) ended `FAILED | 0 passed | 19 failed
(4m50s)`, every file failing in `Browser.launch` with
`Chrome DevToolsActivePort timed out after 15000ms`;
Chrome's own stderr read `FATAL:base/mac/mac_util.mm:379
... Operation not permitted`.

The owner then ran it outside the sandbox on
2026-10-07: `ok | 50 passed | 0 failed (2m0s)`. The
ledger's `Task 0: complete` line holds it; when that
line exists, skip Step 2 and carry the line forward.

- [ ] **Step 1: Confirm the base**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
git status --short
git log --oneline -3
```

Expected: a clean tree; the tip is "Plan 0j's
double-click under an open panel", then "Specify 0j's
double-click under an open panel", then `ddfc1cb6 Join
the two short lines in 0j`.

- [ ] **Step 2: Run Layer 2 once**

Run the whole-suite command under Global Constraints.

Expected: `exit 0` and `ok | 50 passed | 0 failed`
(19 files; the suite holds 50 `Deno.test` cases at
`ddfc1cb6`). Write the exact line to the ledger as the
Layer 2 baseline; Tasks 3 and 4 compare against it. If
every file fails with `Chrome DevToolsActivePort timed
out`, STOP and report that Chrome cannot launch here;
dispatch nothing. If some tests fail on a launched
Chrome, STOP and report them: Task 4 cannot prove its
red against a red base.

---

## Task 3: Carry the press point and time

**Commit subject:** `Carry the press point and time`

**Agent:** `coder`. **Base:** commit 2 (this plan).

Commandments: Reliability, Uniformity, Logic.
Abominations: Test Weakening (no assertion, time, id,
or other fixture field changes), Unbidden Helper Code
(no test added; nothing reads the new fields yet),
Default Values (every new field is required; no `?`,
no `?? 0`).

**Files:**
- Modify: `web-app/app/flow-interactions.ts` (the
  `LastClick` type; the `pointerdown` listener's four
  `dispatch` calls)
- Modify: `web-app/app/flow-fsm-types.ts` (the three
  press members of `FsmInput`)
- Modify: `web-app/app/flow-fsm-reduce.ts` (the
  `lastClick` written by `onNodePointerDown` and by
  `onEdgePointerDown`)
- Modify: `tests/flow-fsm-reduce.test.ts` (5 node and 2
  canvas press literals, the `downInput` helper among
  them)
- Modify: `tests/flow-fsm-scenarios.test.ts` (13 node, 3
  edge, and 2 canvas press literals; four more presses
  spread from them need no edit)
- Modify: `tests/flow-designer-presenter.test.ts` (one
  `lastClick: { kind: 'clicked' … }` literal)

**Interfaces:**
- Consumes: the base (`ddfc1cb6`); no earlier task.
- Produces, for Task 4: `LastClick`'s `clicked` member is
  `{ kind: 'clicked'; id: string; time: number;
  clientX: number; clientY: number }`;
  `pointer-down-on-canvas` gains `now: number`;
  `pointer-down-on-node` and `pointer-down-on-edge` gain
  `clientX: number; clientY: number`; the adapter fills
  them from the event (`e.clientX`, `e.clientY`,
  `Date.now()`); both reducer `lastClick` writes carry
  `clientX: input.clientX, clientY: input.clientY`. No
  earlier commit on this branch wrote these lines; Task
  4 rewrites none of them.

The failing "test" of this task is the type check:
the new fields are required, so `deno check` rejects
every construction site that lacks them, and Step 11
proves the fixture list complete before Steps 12-13
fill it.

- [ ] **Step 1: Edit — `LastClick.clicked` gains the point**

File: `web-app/app/flow-interactions.ts`

Old text:

```ts
export type LastClick =
    | { kind: 'none' }
    | {
        kind: 'clicked';
        id: string;
        time: number;
    };
```

New text:

```ts
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

- [ ] **Step 2: Edit — the canvas press gains `now`**

File: `web-app/app/flow-fsm-types.ts`

Old text:

```ts
        kind: 'pointer-down-on-canvas';
        svgX: number;
        svgY: number;
        clientX: number;
        clientY: number;
    }
```

New text:

```ts
        kind: 'pointer-down-on-canvas';
        svgX: number;
        svgY: number;
        clientX: number;
        clientY: number;
        now: number;
    }
```

- [ ] **Step 3: Edit — the node press gains the client point**

File: `web-app/app/flow-fsm-types.ts`

Old text:

```ts
        isLocked: boolean;
        svgX: number;
        svgY: number;
        now: number;
```

New text:

```ts
        isLocked: boolean;
        svgX: number;
        svgY: number;
        clientX: number;
        clientY: number;
        now: number;
```

- [ ] **Step 4: Edit — the edge press gains the client point**

File: `web-app/app/flow-fsm-types.ts`

Old text:

```ts
        kind: 'pointer-down-on-edge';
        edgeId: string;
        now: number;
```

New text:

```ts
        kind: 'pointer-down-on-edge';
        edgeId: string;
        now: number;
        clientX: number;
        clientY: number;
```

- [ ] **Step 5: Edit — the adapter's pan-mode canvas press sends `now`**

File: `web-app/app/flow-interactions.ts`

Old text:

```ts
                    clientX: e.clientX,
                    clientY: e.clientY,
                });
                return;
            }

            const nodeId = ancestorAttr(
```

New text:

```ts
                    clientX: e.clientX,
                    clientY: e.clientY,
                    now: Date.now(),
                });
                return;
            }

            const nodeId = ancestorAttr(
```

- [ ] **Step 6: Edit — the adapter's node press sends the client point**

File: `web-app/app/flow-interactions.ts`

Old text:

```ts
                    svgY: svgPt.y,
                    now: Date.now(),
                    selectedPositions:
```

New text:

```ts
                    svgY: svgPt.y,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    now: Date.now(),
                    selectedPositions:
```

- [ ] **Step 7: Edit — the adapter's edge press sends the client point**

File: `web-app/app/flow-interactions.ts`

Old text:

```ts
                    edgeId,
                    now: Date.now(),
                });
```

New text:

```ts
                    edgeId,
                    now: Date.now(),
                    clientX: e.clientX,
                    clientY: e.clientY,
                });
```

- [ ] **Step 8: Edit — the adapter's canvas press sends `now`**

File: `web-app/app/flow-interactions.ts`

Old text:

```ts
                clientX: e.clientX,
                clientY: e.clientY,
            });
        },
        { signal },
    );
```

New text:

```ts
                clientX: e.clientX,
                clientY: e.clientY,
                now: Date.now(),
            });
        },
        { signal },
    );
```

- [ ] **Step 9: Edit — the node path's `lastClick` keeps the point**

File: `web-app/app/flow-fsm-reduce.ts`

Old text:

```ts
    const lastClick = {
        kind: 'clicked' as const,
        id: input.nodeId,
        time: input.now,
    };
```

New text:

```ts
    const lastClick = {
        kind: 'clicked' as const,
        id: input.nodeId,
        time: input.now,
        clientX: input.clientX,
        clientY: input.clientY,
    };
```

- [ ] **Step 10: Edit — the edge path's `lastClick` keeps the point**

File: `web-app/app/flow-fsm-reduce.ts`

Old text:

```ts
        lastClick: {
            kind: 'clicked',
            id: input.edgeId,
            time: input.now,
        },
```

New text:

```ts
        lastClick: {
            kind: 'clicked',
            id: input.edgeId,
            time: input.now,
            clientX: input.clientX,
            clientY: input.clientY,
        },
```

- [ ] **Step 11: Run the check red**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
export DENO_DIR="$TMPDIR/deno-dir"
deno check --frozen api client shared server tests web-app \
    2>&1 | sed 's/\x1b\[[0-9;]*m//g' > "$TMPDIR/0j-check.log"
grep -E '^Found' "$TMPDIR/0j-check.log"
grep -oE 'at file://[^:]+' "$TMPDIR/0j-check.log" \
    | sed 's|.*/fusion-angle/.worktrees/[^/]*/||' \
    | sort | uniq -c
```

Expected: `Found 30 errors.`, and the locations:

```text
   1 tests/flow-designer-presenter.test.ts
   7 tests/flow-fsm-reduce.test.ts
  22 tests/flow-fsm-scenarios.test.ts
   4 web-app/app/flow-fsm-types.ts
   1 web-app/app/flow-interactions.ts
```

The five product lines are TypeScript's "the expected
type comes from" notes pointing at the types; every
error is in the three test files. Any error in a
product file, or another count: STOP and report.

- [ ] **Step 12: Edit — the presenter fixture's `LastClick` gains a point**

File: `tests/flow-designer-presenter.test.ts`

Old text:

```ts
            lastClick: {
                kind: 'clicked',
                id: 'n1',
                time: 1000,
            },
```

New text:

```ts
            lastClick: {
                kind: 'clicked',
                id: 'n1',
                time: 1000,
                clientX: 0,
                clientY: 0,
            },
```

- [ ] **Step 13: Give every press literal its point**

Write the one-off Deno program to `$TMPDIR` (not the
repo) and run it from the worktree. After each node
press's `svgX: A, svgY: B,` line it inserts `clientX: A,
clientY: B,`; after each edge press's `edgeId:` line,
`clientX: 0, clientY: 0,`; after each canvas press's
`clientX: …, clientY: …,` line, `now: 1000,`, each at
that line's indent. It handles the one-line (`kind:
'pointer-down-on-node',`) and the two-line (`kind:` then
`'pointer-down-on-node',`) forms, and throws on a press
it cannot finish.

```bash
cat > "$TMPDIR/0j-add-press-points.ts" <<'TS'
// One-off fixture edit for 0j Task 3; lives in $TMPDIR.
// After every node press's `svgX: A, svgY: B,` line it
// inserts `clientX: A, clientY: B,`; after every edge
// press's `edgeId: …,` line, `clientX: 0, clientY: 0,`;
// after every canvas press's `clientX: …, clientY: …,`
// line, `now: 1000,`. Prints one count per file and kind.
const FILES = [
    'tests/flow-fsm-reduce.test.ts',
    'tests/flow-fsm-scenarios.test.ts',
];
const KIND = /kind:\s*$|kind: 'pointer-down-on-(node|edge|canvas)',/;
for (const file of FILES) {
    const lines = Deno.readTextFileSync(file).split('\n');
    const out: string[] = [];
    const counts = { node: 0, edge: 0, canvas: 0 };
    let pending: 'node' | 'edge' | 'canvas' | null = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        out.push(line);
        const m = line.match(KIND);
        if (m) {
            const kind = m[1]
                ?? lines[i + 1]?.match(
                    /^\s*'pointer-down-on-(node|edge|canvas)',/,
                )?.[1];
            if (kind === 'node' || kind === 'edge'
                || kind === 'canvas') {
                if (pending !== null) {
                    throw new Error(`${file}:${i + 1} nested`);
                }
                pending = kind;
            }
            continue;
        }
        if (pending === null) continue;
        const indent = line.match(/^\s*/)![0];
        if (pending === 'node') {
            const svg = line.match(
                /^\s*svgX: ([^,]+), svgY: ([^,]+),$/,
            );
            if (svg) {
                out.push(`${indent}clientX: ${svg[1]},`
                    + ` clientY: ${svg[2]},`);
                counts.node++;
                pending = null;
            }
        } else if (pending === 'edge') {
            if (/^\s*edgeId: /.test(line)) {
                out.push(`${indent}clientX: 0, clientY: 0,`);
                counts.edge++;
                pending = null;
            }
        } else if (/^\s*clientX: [^,]+, clientY: [^,]+,$/
            .test(line)) {
            out.push(`${indent}now: 1000,`);
            counts.canvas++;
            pending = null;
        }
    }
    if (pending !== null) throw new Error(`${file}: unmatched`);
    Deno.writeTextFileSync(file, out.join('\n'));
    console.log(file, JSON.stringify(counts));
}
TS
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
export DENO_DIR="$TMPDIR/deno-dir"
deno run --allow-read=tests --allow-write=tests \
    "$TMPDIR/0j-add-press-points.ts"
```

Expected, exactly:

```text
tests/flow-fsm-reduce.test.ts {"node":5,"edge":0,"canvas":2}
tests/flow-fsm-scenarios.test.ts {"node":13,"edge":3,"canvas":2}
```

- [ ] **Step 14: Run the check green**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
export DENO_DIR="$TMPDIR/deno-dir"
deno check --frozen api client shared server tests web-app \
    > /dev/null 2>&1
echo "check exit $?"
git diff --stat
```

Expected: `check exit 0`; `--stat` lists exactly the
six files under **Files**. Task 3 only inserts lines:

```bash
git diff --numstat
```

Expected: six rows, each with `0` in its second
(deletions) column.

- [ ] **Step 15: Run the FSM files green**

Run the Layer 1 chosen-files command under Global
Constraints with:

```bash
FILES='tests/flow-fsm-reduce.test.ts tests/flow-fsm-scenarios.test.ts tests/flow-designer-presenter.test.ts'
```

Expected: every case `... ok` and `ok | 68 passed | 0
failed`.

- [ ] **Step 16: Gate**

Run the gate under Global Constraints (600000 ms
timeout). Expected: `exit 0`, `ok | 4141 passed | 0
failed | 11 ignored`, `ok | 8 passed | 0 failed`.

- [ ] **Step 17: Layer 2**

Run the whole-suite Layer 2 command under Global
Constraints. Expected: `exit 0` and the baseline line
Task 0 recorded (`ok | 50 passed | 0 failed`). If Chrome
cannot launch, STOP and report.

- [ ] **Step 18: Commit**

```bash
git diff --stat
git add web-app/app/flow-interactions.ts
git add web-app/app/flow-fsm-types.ts
git add web-app/app/flow-fsm-reduce.ts
git add tests/flow-fsm-reduce.test.ts
git add tests/flow-fsm-scenarios.test.ts
git add tests/flow-designer-presenter.test.ts
git commit -F - <<'MSG'
Carry the press point and time

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
SESSION_LINE
MSG
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing.

---

## Task 4: Match a second press by its point

**Commit subject:** `Match a second press by its point`

**Agent:** `planner` (it runs Chrome and judges the red
run). **Base:** Task 3's commit.

Commandments: Reliability, Logic, Clarity, Uniformity,
Simplicity. Abominations: Cleverness (no timer, no
camera hold), Test Weakening (no existing test or
assertion edited), Unbidden Helper Code (only the
builders and two assertions the scenarios share; no
Layer 2 helper), Premature Generalization (one
predicate, one constructor; no rule object, no
options), Internal Defense (no guard beyond the four
clauses of `isSecondPressNear`).

**Files:**
- Modify: `web-app/app/flow-fsm-types.ts` (re-export
  `LastClick` beside `Selection`)
- Modify: `web-app/app/flow-fsm-reduce.ts` (import
  `LastClick`; `DBLCLICK_SLOP_PX`; `Clicked`,
  `isStillSelected`, `isSecondPressNear`,
  `secondPressOf`; a guard in `onCanvasPointerDown`,
  `onNodePointerDown`, `onEdgePointerDown`)
- Test: `tests/browser/canvas-gestures.test.ts` (one
  Layer 2 test after 'a node click under an open panel
  centers it on release (F13)')
- Test: `tests/flow-fsm-scenarios.test.ts` (builders,
  two shared assertions, nine scenarios)

**Interfaces:**
- Consumes, from Task 3: `LastClick.clicked.clientX`
  and `.clientY`; `pointer-down-on-canvas.now`;
  `pointer-down-on-node` and `pointer-down-on-edge`
  `.clientX` and `.clientY`; both reducer `lastClick`
  writes carrying the point.
- Produces: `DBLCLICK_SLOP_PX = 4` and
  `isSecondPressNear(state, now, clientX, clientY):
  state is FsmState & { lastClick: Clicked }` in
  `web-app/app/flow-fsm-reduce.ts` (both module-private;
  Task 5's paragraph names them); `secondPressOf(state,
  input): FsmResult`; the Layer 2 test named 'a
  double-click on a second node under an open panel
  keeps the panel on it (F13)' (Task 7's Pin cites it
  verbatim). No earlier commit on this branch wrote
  these lines; no later task rewrites them.

The rule, from spec § 1-2: a press is the second press
of the last click when it arrives within `DBLCLICK_MS`
of that click and either (a) lands on the same element
(today's rule, untouched) or (b) lands within
`DBLCLICK_SLOP_PX` of that click's client point,
whatever is under the pointer, provided that click's
element is still in the FSM's selection. A (b) press
runs `secondPressOf`: `open-panel: true`, the selection
stays, `lastClick` refreshes (same id, new time and
point), no gesture.

- [ ] **Step 0: Confirm Chrome launches here**

Task 0's ledger line must exist. If Task 0 stopped on
Chrome, this task does not start.

- [ ] **Step 1: Edit — the browser test imports `stays`**

File: `tests/browser/canvas-gestures.test.ts`

Old text:

```ts
    SHIFT, useBrowser, withAdminPage, type Page,
    type Point,
} from './fixtures.ts';
```

New text:

```ts
    SHIFT, stays, useBrowser, withAdminPage, type Page,
    type Point,
} from './fixtures.ts';
```

- [ ] **Step 2: Edit — the browser test imports `doubleClickAt`**

File: `tests/browser/canvas-gestures.test.ts`

Old text:

```ts
    doubleClick, edgeCount, edgeLabelSelector,
```

New text:

```ts
    doubleClick, doubleClickAt, edgeCount,
    edgeLabelSelector,
```

- [ ] **Step 3: Edit — the panel's node-name probe and its stay window**

File: `tests/browser/canvas-gestures.test.ts`

Old text:

```ts
const PANEL = '.flow-props-panel';
const VIEWBOX =
    `document.querySelector('${CANVAS}')`
    + `.getAttribute('viewBox')`;
```

New text:

```ts
const PANEL = '.flow-props-panel';
const VIEWBOX =
    `document.querySelector('${CANVAS}')`
    + `.getAttribute('viewBox')`;
// The open panel's node name, or null with no panel.
const PANEL_NODE_NAME =
    `document.querySelector('${PANEL}') === null ? null`
    + ` : document.querySelector('#prop-node-name')`
    + `?.value ?? null`;
const STAY_MS = 600;
```

- [ ] **Step 4: Edit — the new Layer 2 test, after the center-on-release pin**

File: `tests/browser/canvas-gestures.test.ts`

Old text:

```ts
            'camera centred on Data Capture',
        );
    });
});
```

New text:

```ts
            'camera centred on Data Capture',
        );
    });
});

Deno.test('a double-click on a second node under an open'
+ ' panel keeps the panel on it (F13)', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        const review = await nodeIdNamed(page, 'Review');
        const capture = await nodeIdNamed(
            page, 'Data Capture',
        );
        await doubleClick(page, nodeSelector(review));
        await page.waitFor(PANEL);
        // Aimed once, at the body: the `g`'s box holds the
        // port. A body holding the center of the canvas
        // right of the panel barely moves at the first
        // release, so the second press could not miss it.
        const bodySelector = `${nodeSelector(capture)} > rect`;
        const body = await page.center(bodySelector);
        await assertClearOfPanel(page, body);
        const canvas = await page.rect(CANVAS);
        const panel = await page.rect(PANEL);
        const left = Math.max(
            canvas.x, panel.x + panel.width,
        );
        const cx = (left + canvas.x + canvas.width) / 2;
        const cy = canvas.y + canvas.height / 2;
        const box = await page.rect(bodySelector);
        assert(
            cx < box.x || cx > box.x + box.width
                || cy < box.y || cy > box.y + box.height,
            `Data Capture holds the visible center`
            + ` (${cx}, ${cy})`,
        );
        await doubleClickAt(page, body);
        await stays(page, PANEL_NODE_NAME, STAY_MS);
        assertStrictEquals(
            await page.evaluate<string | null>(
                PANEL_NODE_NAME,
            ),
            'Data Capture',
        );
    });
});
```

- [ ] **Step 5: Run the Layer 2 test red**

Run the one-test Layer 2 command under Global
Constraints with `FILTER='keeps the panel on it'`.

Expected: `a double-click on a second node under an
open panel keeps the panel on it (F13) ... FAILED`,
failing at `stays` with `… changed: Data Capture ->
null` or at the final `assertStrictEquals` with
`Actual: null` against `Expected: "Data Capture"`: the
second press met empty canvas and closed the panel.
Record the exact failure text in the report. If it
fails anywhere else (the aim assertions, a selector, a
timeout before the double-click) or passes, STOP and
report: the test would be red for the wrong reason or
not red at all.

- [ ] **Step 6: Edit — the scenarios import `assertEquals`**

File: `tests/flow-fsm-scenarios.test.ts`

Old text:

```ts
import { assert, assertStrictEquals } from '@std/assert';
```

New text:

```ts
import {
    assert, assertEquals, assertStrictEquals,
} from '@std/assert';
```

- [ ] **Step 7: Edit — the scenarios import `FsmResult`**

File: `tests/flow-fsm-scenarios.test.ts`

Old text:

```ts
    FsmInput,
    Action,
    NodeWithPos,
} from '../web-app/app/flow-fsm-types.ts';
```

New text:

```ts
    FsmInput,
    FsmResult,
    Action,
    NodeWithPos,
} from '../web-app/app/flow-fsm-types.ts';
```

- [ ] **Step 8: Edit — the scenario builders and assertions, after `drive`**

File: `tests/flow-fsm-scenarios.test.ts`

Old text:

```ts
        out.push(...r.actions);
    }
    return { state: s, actions: out };
}
```

New text:

```ts
        out.push(...r.actions);
    }
    return { state: s, actions: out };
}

const PRESS_AT_MS = 1000;
const PRESS_X = 300;
const PRESS_Y = 200;
const SLOP_PX = 4;
const BEYOND_SLOP_PX = 5;
const FAR_PX = 40;
const LAST_INSIDE_MS = 399;
const FIRST_OUTSIDE_MS = 400;
const CHAINED_MS = 350;

type NodePress = Extract<
    FsmInput, { kind: 'pointer-down-on-node' }
>;

function nodePress(
    nodeId: string,
    now: number,
    clientX: number,
    clientY: number,
): NodePress {
    return {
        kind: 'pointer-down-on-node',
        nodeId,
        isPort: false,
        isDraggable: true,
        isShift: false,
        isMeta: false,
        isLocked: false,
        svgX: clientX, svgY: clientY,
        clientX, clientY,
        now,
        selectedPositions: new Map([
            [nodeId, { x: 0, y: 0 }],
        ]),
    };
}

function canvasPress(
    now: number,
    clientX: number,
    clientY: number,
): FsmInput {
    return {
        kind: 'pointer-down-on-canvas',
        svgX: clientX, svgY: clientY,
        clientX, clientY,
        now,
    };
}

function edgePress(
    edgeId: string,
    now: number,
    clientX: number,
    clientY: number,
): FsmInput {
    return {
        kind: 'pointer-down-on-edge',
        edgeId,
        now,
        clientX, clientY,
    };
}

function releaseAt(
    clientX: number,
    clientY: number,
): FsmInput {
    return {
        kind: 'pointer-up',
        svgX: clientX, svgY: clientY,
        clientX, clientY,
        isShift: false,
        hoverNodeId: null,
        fromNodePosition: null,
        allNodes: [],
    };
}

// The first click of a double-click: n1 pressed and
// released at PRESS_X, PRESS_Y, so n1 is selected.
function afterFirstClickOnN1(): FsmState {
    return drive(buildState(), [
        nodePress('n1', PRESS_AT_MS, PRESS_X, PRESS_Y),
        releaseAt(PRESS_X, PRESS_Y),
    ]).state;
}

// Rule (b): the press runs n1's double-click and
// starts no gesture.
function assertSecondPressOfN1(
    r: FsmResult,
    now: number,
    clientX: number,
    clientY: number,
): void {
    const panels = findActions(r.actions, 'open-panel');
    assertStrictEquals(panels.length, 1);
    assertStrictEquals(panels[0]?.open, true);
    assertStrictEquals(
        findAction(r.actions, 'capture-pointer'),
        undefined,
    );
    assertStrictEquals(r.state.selection.kind, 'nodes');
    if (r.state.selection.kind === 'nodes') {
        assertEquals(
            [...r.state.selection.nodeIds], ['n1'],
        );
    }
    assertStrictEquals(r.state.drag.kind, 'idle');
    assertStrictEquals(r.state.connect.kind, 'idle');
    assertStrictEquals(r.state.marquee.kind, 'idle');
    assertStrictEquals(r.state.pan.kind, 'idle');
    assertEquals(r.state.lastClick, {
        kind: 'clicked', id: 'n1', time: now,
        clientX, clientY,
    });
}

// Today's canvas press: the selection clears, a
// marquee starts, and the panel closes.
function assertCanvasClick(r: FsmResult): void {
    const panels = findActions(r.actions, 'open-panel');
    assertStrictEquals(panels.length, 1);
    assertStrictEquals(panels[0]?.open, false);
    assertStrictEquals(r.state.selection.kind, 'none');
    assertStrictEquals(r.state.marquee.kind, 'selecting');
}
```

- [ ] **Step 9: Edit — the nine scenarios, at the end of the file**

File: `tests/flow-fsm-scenarios.test.ts`

Old text:

```ts
        assertStrictEquals(r.state.marquee.kind, 'idle');
        assertStrictEquals(
            r.state.selection.kind, 'none',
        );
    },
);
```

New text:

```ts
        assertStrictEquals(r.state.marquee.kind, 'idle');
        assertStrictEquals(
            r.state.selection.kind, 'none',
        );
    },
);

Deno.test(
    'a canvas press at the first press point inside'
    + ' the window is the second press (F13)',
    () => {
        const second = reduceFsm(
            afterFirstClickOnN1(),
            canvasPress(
                PRESS_AT_MS + DBLCLICK_WITHIN_MS,
                PRESS_X, PRESS_Y,
            ),
        );
        assertSecondPressOfN1(
            second, PRESS_AT_MS + DBLCLICK_WITHIN_MS,
            PRESS_X, PRESS_Y,
        );
        const thirdAt =
            PRESS_AT_MS + DBLCLICK_WITHIN_MS + CHAINED_MS;
        const third = reduceFsm(
            second.state,
            canvasPress(thirdAt, PRESS_X, PRESS_Y),
        );
        assertSecondPressOfN1(
            third, thirdAt, PRESS_X, PRESS_Y,
        );
    },
);

Deno.test(
    'a press on a node slid under the first press point'
    + ' neither selects nor drags it (F13)',
    () => {
        const r = reduceFsm(
            afterFirstClickOnN1(),
            nodePress(
                'n2', PRESS_AT_MS + DBLCLICK_WITHIN_MS,
                PRESS_X, PRESS_Y,
            ),
        );
        assertSecondPressOfN1(
            r, PRESS_AT_MS + DBLCLICK_WITHIN_MS,
            PRESS_X, PRESS_Y,
        );
    },
);

Deno.test(
    'an edge press at the first press point inside'
    + ' the window is the second press (F13)',
    () => {
        const r = reduceFsm(
            afterFirstClickOnN1(),
            edgePress(
                'e1', PRESS_AT_MS + DBLCLICK_WITHIN_MS,
                PRESS_X, PRESS_Y,
            ),
        );
        assertSecondPressOfN1(
            r, PRESS_AT_MS + DBLCLICK_WITHIN_MS,
            PRESS_X, PRESS_Y,
        );
    },
);

Deno.test(
    'a press 4 px from the first press point matches'
    + ' and one 5 px away does not (F13 slop)',
    () => {
        const at = PRESS_AT_MS + DBLCLICK_WITHIN_MS;
        assertSecondPressOfN1(
            reduceFsm(
                afterFirstClickOnN1(),
                canvasPress(
                    at, PRESS_X + SLOP_PX, PRESS_Y,
                ),
            ),
            at, PRESS_X + SLOP_PX, PRESS_Y,
        );
        assertCanvasClick(
            reduceFsm(
                afterFirstClickOnN1(),
                canvasPress(
                    at, PRESS_X + BEYOND_SLOP_PX, PRESS_Y,
                ),
            ),
        );
    },
);

Deno.test(
    'a press at the first press point 399 ms later'
    + ' matches and 400 ms later does not (F13 window)',
    () => {
        const inside = PRESS_AT_MS + LAST_INSIDE_MS;
        assertSecondPressOfN1(
            reduceFsm(
                afterFirstClickOnN1(),
                canvasPress(inside, PRESS_X, PRESS_Y),
            ),
            inside, PRESS_X, PRESS_Y,
        );
        assertCanvasClick(
            reduceFsm(
                afterFirstClickOnN1(),
                canvasPress(
                    PRESS_AT_MS + FIRST_OUTSIDE_MS,
                    PRESS_X, PRESS_Y,
                ),
            ),
        );
    },
);

Deno.test(
    'a second press on the same node beyond the slop'
    + ' is still its double-click (F13 same node)',
    () => {
        const r = reduceFsm(
            afterFirstClickOnN1(),
            nodePress(
                'n1', PRESS_AT_MS + DBLCLICK_WITHIN_MS,
                PRESS_X + FAR_PX, PRESS_Y,
            ),
        );
        const panels = findActions(r.actions, 'open-panel');
        assertStrictEquals(panels.length, 1);
        assertStrictEquals(panels[0]?.open, true);
        assertStrictEquals(r.state.drag.kind, 'dragging');
        assert(findAction(r.actions, 'capture-pointer'));
    },
);

Deno.test(
    'pan mode pans at the first press point inside'
    + ' the window (F13 pan)',
    () => {
        const panning: FsmState = {
            ...afterFirstClickOnN1(),
            isPanMode: true,
        };
        const at = PRESS_AT_MS + DBLCLICK_WITHIN_MS;
        const presses = [
            canvasPress(at, PRESS_X, PRESS_Y),
            nodePress('n2', at, PRESS_X, PRESS_Y),
        ];
        for (const press of presses) {
            const r = reduceFsm(panning, press);
            assertStrictEquals(r.state.pan.kind, 'panning');
            assertStrictEquals(
                findAction(r.actions, 'open-panel'),
                undefined,
            );
        }
    },
);

Deno.test(
    'a second press on another node port or locked'
    + ' node starts no connect and no drag (F13)',
    () => {
        const at = PRESS_AT_MS + DBLCLICK_WITHIN_MS;
        const press = nodePress('n2', at, PRESS_X, PRESS_Y);
        const inputs = [
            { ...press, isPort: true },
            { ...press, isLocked: true },
        ];
        for (const input of inputs) {
            assertSecondPressOfN1(
                reduceFsm(afterFirstClickOnN1(), input),
                at, PRESS_X, PRESS_Y,
            );
        }
    },
);

Deno.test(
    'a press at the point after the node left the'
    + ' selection is a canvas click (F13 stale)',
    () => {
        const at = PRESS_AT_MS + DBLCLICK_WITHIN_MS;
        const deleted: FsmState = {
            ...afterFirstClickOnN1(),
            selection: { kind: 'none' },
        };
        assertCanvasClick(reduceFsm(
            deleted, canvasPress(at, PRESS_X, PRESS_Y),
        ));
        const toggledOff = drive(buildState(), [
            nodePress(
                'n1', PRESS_AT_MS - FIRST_OUTSIDE_MS,
                PRESS_X, PRESS_Y,
            ),
            releaseAt(PRESS_X, PRESS_Y),
            {
                ...nodePress(
                    'n1', PRESS_AT_MS, PRESS_X, PRESS_Y,
                ),
                isMeta: true,
            },
            releaseAt(PRESS_X, PRESS_Y),
        ]).state;
        assertStrictEquals(
            toggledOff.selection.kind, 'none',
        );
        assertCanvasClick(reduceFsm(
            toggledOff, canvasPress(at, PRESS_X, PRESS_Y),
        ));
    },
);
```

- [ ] **Step 10: Run the scenarios red**

Run the Layer 1 chosen-files command under Global
Constraints with
`FILES='tests/flow-fsm-scenarios.test.ts'`.

Expected: `FAILED | 19 passed | 6 failed`, every base
case `... ok`, and these six `... FAILED` (each an
`AssertionError: Values are not strictly equal`):

```text
a canvas press at the first press point inside the window is the second press (F13)
a press on a node slid under the first press point neither selects nor drags it (F13)
an edge press at the first press point inside the window is the second press (F13)
a press 4 px from the first press point matches and one 5 px away does not (F13 slop)
a press at the first press point 399 ms later matches and 400 ms later does not (F13 window)
a second press on another node port or locked node starts no connect and no drag (F13)
```

These three pass already, because they pin today's
behavior: 'a second press on the same node beyond the
slop is still its double-click (F13 same node)', 'pan
mode pans at the first press point inside the window
(F13 pan)', and 'a press at the point after the node
left the selection is a canvas click (F13 stale)'. Any
other split: STOP and report.

- [ ] **Step 11: Edit — `flow-fsm-types.ts` re-exports `LastClick`**

File: `web-app/app/flow-fsm-types.ts`

Old text:

```ts
import type {
    InteractionState,
    Selection,
} from './flow-interactions.ts';

export type FsmState = InteractionState;
export type { Selection };
```

New text:

```ts
import type {
    InteractionState,
    LastClick,
    Selection,
} from './flow-interactions.ts';

export type FsmState = InteractionState;
export type { LastClick, Selection };
```

- [ ] **Step 12: Edit — the reducer imports `LastClick`**

File: `web-app/app/flow-fsm-reduce.ts`

Old text:

```ts
    Action,
    Selection,
} from './flow-fsm-types.ts';
```

New text:

```ts
    Action,
    LastClick,
    Selection,
} from './flow-fsm-types.ts';
```

- [ ] **Step 13: Edit — `DBLCLICK_SLOP_PX` beside `DBLCLICK_MS`**

File: `web-app/app/flow-fsm-reduce.ts`

Old text:

```ts
const DBLCLICK_MS = 400;
```

New text:

```ts
const DBLCLICK_MS = 400;
const DBLCLICK_SLOP_PX = 4;
```

- [ ] **Step 14: Edit — the rule's helpers, after the constants**

File: `web-app/app/flow-fsm-reduce.ts`

Old text:

```ts
const AUTOFIT_TOAST_MSG =
    'Disable Auto-Fit to change the view';
```

New text:

```ts
const AUTOFIT_TOAST_MSG =
    'Disable Auto-Fit to change the view';

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

- [ ] **Step 15: Edit — the canvas press checks the rule after pan mode**

File: `web-app/app/flow-fsm-reduce.ts`

Old text:

```ts
            ],
        };
    }
    const next: FsmState = {
        ...state,
        lastClick: { kind: 'none' },
```

New text:

```ts
            ],
        };
    }
    if (
        isSecondPressNear(
            state, input.now,
            input.clientX, input.clientY,
        )
    ) {
        return secondPressOf(state, input);
    }
    const next: FsmState = {
        ...state,
        lastClick: { kind: 'none' },
```

- [ ] **Step 16: Edit — the node press checks the rule after pan mode**

File: `web-app/app/flow-fsm-reduce.ts`

Old text:

```ts
    if (state.isPanMode) {
        return startPanFromNode(state, input);
    }
    const isDbl =
```

New text:

```ts
    if (state.isPanMode) {
        return startPanFromNode(state, input);
    }
    if (
        isSecondPressNear(
            state, input.now,
            input.clientX, input.clientY,
        )
        && state.lastClick.id !== input.nodeId
    ) {
        return secondPressOf(state, input);
    }
    const isDbl =
```

- [ ] **Step 17: Edit — the edge press checks the rule first**

File: `web-app/app/flow-fsm-reduce.ts`

Old text:

```ts
        kind: 'pointer-down-on-edge';
    }>,
): FsmResult {
    const isDbl =
```

New text:

```ts
        kind: 'pointer-down-on-edge';
    }>,
): FsmResult {
    if (
        isSecondPressNear(
            state, input.now,
            input.clientX, input.clientY,
        )
        && state.lastClick.id !== input.edgeId
    ) {
        return secondPressOf(state, input);
    }
    const isDbl =
```

- [ ] **Step 18: Run the check**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
export DENO_DIR="$TMPDIR/deno-dir"
deno check --frozen api client shared server tests web-app \
    > /dev/null 2>&1
echo "check exit $?"
```

Expected: `check exit 0`.

- [ ] **Step 19: Run the scenarios green**

Run the Layer 1 chosen-files command with
`FILES='tests/flow-fsm-scenarios.test.ts'`, then with:

```bash
FILES='tests/flow-fsm-reduce.test.ts tests/flow-fsm-scenarios.test.ts tests/flow-designer-presenter.test.ts'
```

Expected: `ok | 25 passed | 0 failed`, then `ok | 77
passed | 0 failed`.

- [ ] **Step 20: Run the Layer 2 tests green**

Run the one-test Layer 2 command with
`FILTER='keeps the panel on it'`, then with
`FILTER='centers it'`.

Expected: `... ok` and `ok | 1 passed | 0 failed`
each time (the second is 'a node click under an open
panel centers it on release (F13)').

- [ ] **Step 21: Gate**

Run the gate under Global Constraints (600000 ms
timeout). Expected: `exit 0`, `ok | 4150 passed | 0
failed | 11 ignored`, `ok | 8 passed | 0 failed`.

- [ ] **Step 22: Layer 2**

Run the whole-suite Layer 2 command. Expected: `exit 0`
and one more passed case than Task 0's baseline
(`ok | 51 passed | 0 failed`).

- [ ] **Step 23: Self-check the rule**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
git diff ddfc1cb6 --numstat -- web-app/app/flow-fsm-reduce.ts
git diff -U0 -- web-app/app/flow-fsm-reduce.ts \
    | grep -cE -e '^-[^-]'
grep -nE 'setTimeout|setInterval|requestAnimationFrame' \
    web-app/app/flow-fsm-reduce.ts web-app/app/flow-interactions.ts
```

Expected: the numstat's deletions column is `0`; the
count is `0`; the last `grep` prints nothing.

- [ ] **Step 24: Commit**

```bash
git diff --stat
git add web-app/app/flow-fsm-types.ts
git add web-app/app/flow-fsm-reduce.ts
git add tests/flow-fsm-scenarios.test.ts
git add tests/browser/canvas-gestures.test.ts
git commit -F - <<'MSG'
Match a second press by its point

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
SESSION_LINE
MSG
git status --short
git log --oneline -1
```

Expected: `git status --short` prints nothing.

---

## Task 5: Name the double-click rule in FLOW-CANVAS.md

**Commit subject:** `Name the double-click rule in FLOW-CANVAS.md`

**Agent:** `coder`. **Base:** Task 4's commit.

Commandments: Clarity, Uniformity. Abominations: Obscurity (the paragraph names the rule's three clauses and its code), Unbidden Helper Code (no other FLOW-CANVAS.md edit).

**Files:**
- Modify: `FLOW-CANVAS.md` (`## Camera rules`: one last paragraph)

**Interfaces:**
- Consumes: Task 4's `DBLCLICK_SLOP_PX` and
  `isSecondPressNear` in `web-app/app/flow-fsm-reduce.ts`.
- Produces: the paragraph. It follows the
  `request-update` MUST NOT paragraph, written by
  `e5a14f72` ("Hold the camera still under a gesture
  in flight"), which it leaves untouched; no later
  task rewrites it. The deferral-prose lint
  (`./test lint`) reads root `.md` files: the
  paragraph uses none of its words.

- [ ] **Step 0: Confirm the anchors**

Each anchor is checked again, in its own step, just
before its Edit (an earlier Edit can change a count).
Run them all once here:

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
grep -cF -e 'to the visible canvas center (zoom unchanged).' FLOW-CANVAS.md
```

Expected: `1` on every line. Any other count: STOP and
report.

- [ ] **Step 1: Edit — `## Camera rules` ends with the double-click rule**

File: `FLOW-CANVAS.md`. Anchor (expected `1`):

```bash
grep -cF -e 'to the visible canvas center (zoom unchanged).' FLOW-CANVAS.md
```

Old text:

```text
`withSelectionCentered` to pan the newly selected node
to the visible canvas center (zoom unchanged).
```

New text:

```text
`withSelectionCentered` to pan the newly selected node
to the visible canvas center (zoom unchanged).

A double-click is two presses inside `DBLCLICK_MS` on
one element, or two presses inside it whose client
points lie within `DBLCLICK_SLOP_PX` (4 px) of one
another while the first press's element is still in the
FSM's selection, even after centering has slid the node
from under the pointer (`isSecondPressNear` in
`web-app/app/flow-fsm-reduce.ts`). The matching press
runs the double-click path on the first press's element
and starts no gesture: it emits `open-panel: true`,
keeps the selection, and captures no pointer, so its
release is a no-op and the page does not center again.
```

- [ ] **Step 2: Check**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
grep -c 'DBLCLICK_SLOP_PX' FLOW-CANVAS.md
awk '/^## Camera rules/{f=1;next} f&&/^## /{print; exit}' \
    FLOW-CANVAS.md
grep -n -A1 'release is a no-op and the page does not' \
    FLOW-CANVAS.md
grep -n 'isSecondPressNear\|DBLCLICK_SLOP_PX = 4' \
    web-app/app/flow-fsm-reduce.ts
```

Expected: `1`; `## Special nodes` (the section still
ends where it did); `127:release is a no-op and the page
does not center again.` then `128-` (the blank line
before `## Special nodes`); `17:const DBLCLICK_SLOP_PX =
4;` and four `isSecondPressNear` lines (`34:function
isSecondPressNear(`, then `139:`, `185:`, and `380:`,
each `        isSecondPressNear(`).

- [ ] **Step 3: Gate**

Run the gate under Global Constraints (600000 ms
timeout). Expected: `exit 0`, `ok | 4150 passed | 0
failed | 11 ignored`, `ok | 8 passed | 0 failed`.

- [ ] **Step 4: Commit**

```bash
git diff --stat
git add FLOW-CANVAS.md
git commit -F - <<'MSG'
Name the double-click rule in FLOW-CANVAS.md

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
SESSION_LINE
MSG
git status --short
git log --oneline -1
```

Expected: `--stat` shows `FLOW-CANVAS.md` only;
`git status --short` prints nothing.

---

## Task 6: File item 11's re-fit as its own entry

**Commit subject:** `File item 11's re-fit as its own entry`

**Agent:** `coder`. **Base:** Task 5's commit.

Commandments: Clarity, Uniformity, Logic. Abominations: Unbidden Helper Code (no fix to the re-fit, no other TODO.md edit), Obscurity (the entry names both callbacks and their lines).

**Files:**
- Modify: `TODO.md` (item 11's clause; one new
  `## Later work` entry)

**Interfaces:**
- Consumes: the base's item 11 clause (written by
  `d765d663` "Mark critical path items by stable
  number" and `ca3dea39` "Keep only future work on
  the product path") and the base's `## Later work`
  neighbors, "Four panel doors are unpinned."
  (`ee553a5c`) and "A flow loaded with Auto Fit
  off" (`d3489e81`, "Keep only future work in later
  work's first part"), neither of which changes.
- Produces: the entry "A double-click's second press
  re-fits the camera under Auto Fit.", the debt Task
  8's F13 text leaves standing ("Auto Fit must be
  off"). Task 8 edits TODO.md in other regions and
  rewrites neither.

- [ ] **Step 0: Confirm the anchors**

Each anchor is checked again, in its own step, just
before its Edit (an earlier Edit can change a count).
Run them all once here:

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
grep -cF -e '  (`web-app/app/adapters/resize-observer.ts`), and the' TODO.md
grep -cF -e '- A flow loaded with Auto Fit off does not fit on' TODO.md
```

Expected: `1` on every line. Any other count: STOP and
report.

- [ ] **Step 1: Edit — item 11 drops the re-fit clause**

File: `TODO.md`. Anchor (expected `1`):

```bash
grep -cF -e '  (`web-app/app/adapters/resize-observer.ts`), and the' TODO.md
```

Old text:

```text
  without `commitAndFit` (`web-app/flows/detail.ts:946-956`),
  the resize path with no gesture guard
  (`web-app/app/adapters/resize-observer.ts`), and the
  panel callback re-fitting at a double-click's second
  press; rotation only on the
```

New text:

```text
  without `commitAndFit` (`web-app/flows/detail.ts:946-956`)
  and the resize path with no gesture guard
  (`web-app/app/adapters/resize-observer.ts`);
  rotation only on the
```

- [ ] **Step 2: Edit — file the re-fit before "A flow loaded with Auto Fit off"**

File: `TODO.md`. Anchor (expected `1`):

```bash
grep -cF -e '- A flow loaded with Auto Fit off does not fit on' TODO.md
```

Old text:

```text
- A flow loaded with Auto Fit off does not fit on
```

New text:

```text
- A double-click's second press re-fits the camera
  under Auto Fit. The panel callback `(open) => ...`
  (`web-app/flows/detail.ts:1110-1117`) runs
  `reconcileFitFromDom()`, and so does the
  `request-update` callback (`:1093`) for a press that
  starts no gesture, as a second press matched by its
  point does. With Auto Fit on, the second press re-fits
  between pointer-down and pointer-up, against
  FLOW-CANVAS.md `## Camera rules`, and undoes the first
  release's centering; TEST-PLAN F13 turns Auto Fit off
  because of it. Oracle: a Layer 2 test in
  `tests/browser/canvas-gestures.test.ts` with Auto Fit
  on — the `viewBox` after a double-click on a second
  node under an open panel equals the one its first
  release left — and F13 no longer turns Auto Fit off
- A flow loaded with Auto Fit off does not fit on
```

- [ ] **Step 3: Check**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
grep -c 'panel callback re-fitting' TODO.md
grep -n -B1 -e "- A double-click's second press re-fits" TODO.md
grep -n -A1 -e 'release left — and F13 no longer turns' TODO.md
grep -n 'resize-observer.ts`);' TODO.md
sed -n '1093p;1110,1117p' web-app/flows/detail.ts
```

Expected: `0` (the 0j bullet quotes the clause across
a line break); `1582-  camera` (the end of "Four panel
doors are unpinned.") then `1583:- A double-click's
second press re-fits the camera`; `1597:  release left —
and F13 no longer turns Auto Fit off` then `1598-- A flow
loaded with Auto Fit off does not fit on`;
``845:  (`web-app/app/adapters/resize-observer.ts`);``;
then the nine `detail.ts` lines: `:1093` is
`            reconcileFitFromDom();` (the `request-update`
callback) and `:1110-1117` is the `(open) => {` callback,
`panelStateRef.open = open;`, the `withPanelOpen(open)`
commit, `reconcileFitFromDom();`, `},`.

- [ ] **Step 4: Gate**

Run the gate under Global Constraints (600000 ms
timeout). Expected: `exit 0`, `ok | 4150 passed | 0
failed | 11 ignored`, `ok | 8 passed | 0 failed`.

- [ ] **Step 5: Commit**

```bash
git diff --stat
git add TODO.md
git commit -F - <<'MSG'
File item 11's re-fit as its own entry

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
SESSION_LINE
MSG
git status --short
git log --oneline -1
```

Expected: `--stat` shows `TODO.md` only;
`git status --short` prints nothing.

---

## Task 7: Pin F13 to the double-click fix

**Commit subject:** `Pin F13 to the double-click fix`

**Agent:** `coder`. **Base:** Task 6's commit.

Commandments: Clarity, Uniformity, Logic. Abominations: Test Weakening (F13's aim rule, one-point drive, press array, PASS clauses, and "Auto Fit must be off" stay; no Pin name is dropped), Unbidden Helper Code (the Driving notes and F11 do not change; no other British spelling is touched).

**Files:**
- Modify: `TEST-PLAN.md` (F13's FAIL sentence, F13's
  Pin, Scoring's F13 line)

**Interfaces:**
- Consumes: Task 4's test name 'a double-click on a
  second node under an open panel keeps the panel on
  it (F13)'; Task 6's entry, the reason F13 keeps
  "Auto Fit must be off" (this task leaves that
  sentence alone); F13's FAIL sentence (`3e76c923`
  "Tighten F13's timing rule and centering test",
  `93afc52d` "Drive F13 at one point as a person
  does"), its Pin clause (`93afc52d`), and Scoring's
  F13 line (`93afc52d`, `7bc85d13` "Specify F13's
  press array, reads, and Auto Fit").
- Produces, for Task 8: a TEST-PLAN.md that no longer
  cites "TODO.md 0j", so Task 8 can close 0j with no
  dangling cite; and one fewer British-spelling line
  (the Scoring line's "centred" goes), so TEST-PLAN.md
  spells British in 22 lines, the count Task 8 writes
  into TODO.md's spelling entry.

- [ ] **Step 0: Confirm the anchors**

Each anchor is checked again, in its own step, just
before its Edit (an earlier Edit can change a count).
Run them all once here:

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
grep -cF -e '  A second press that lands off the' TEST-PLAN.md
grep -cF -e '       which TODO.md 0j owns until a red Layer 2 test' TEST-PLAN.md
grep -cF -e "F13's second press off the node after the first" TEST-PLAN.md
```

Expected: `1` on every line. Any other count: STOP and
report.

- [ ] **Step 1: Edit — F13's FAIL sentence**

File: `TEST-PLAN.md`. Anchor (expected `1`):

```bash
grep -cF -e '  A second press that lands off the' TEST-PLAN.md
```

Old text:

```text
  A second press that lands off the
  node because the first release moved the camera is
  FAIL, not BLOCKED: the gesture was delivered.
```

New text:

```text
  A second press inside `DBLCLICK_MS` and within 4 px
  of the first is the double-click even when the first
  release slid the node from under it; with its Layer 2
  pin green, a delivered pair that misses is BLOCKED,
  naming the driver, not FAIL.
```

- [ ] **Step 2: Edit — F13's Pin names the new test**

File: `TEST-PLAN.md`. Anchor (expected `1`):

```bash
grep -cF -e '       which TODO.md 0j owns until a red Layer 2 test' TEST-PLAN.md
```

Old text:

```text
       meets); exploratory — the one-point double-click,
       which TODO.md 0j owns until a red Layer 2 test
       pins it, and the live retarget paint
```

New text:

```text
       meets); tests/browser/canvas-gestures.test.ts 'a
       double-click on a second node under an open panel
       keeps the panel on it (F13)' (decides two presses
       at one point on a second node under an open panel
       leave the panel open on it); exploratory — the
       live retarget paint
```

- [ ] **Step 3: Edit — Scoring's F13 line**

File: `TEST-PLAN.md`. Anchor (expected `1`):

```bash
grep -cF -e "F13's second press off the node after the first" TEST-PLAN.md
```

Old text:

```text
F13's second press off the node after the first
release centred it, both presses less than
`DBLCLICK_MS` apart: FAIL, not BLOCKED (TODO.md 0j).
Anything but exactly two presses that close is
BLOCKED, naming the driver, whatever the second
press hit.
```

New text:

```text
F13's one-point double-click, both presses less than
`DBLCLICK_MS` apart: its Layer 2 pin decides it, so a
second press off the node is BLOCKED, naming the
driver, unless that pin is red. Anything but exactly
two presses that close is BLOCKED, naming the driver,
whatever the second press hit.
```

- [ ] **Step 4: Check**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
grep -n '0j' TEST-PLAN.md
grep -c 'FAIL, not BLOCKED: the gesture was delivered' TEST-PLAN.md
grep -n 'keeps the panel on it (F13)' TEST-PLAN.md
grep -n "keeps the panel on it (F13)'" \
    tests/browser/canvas-gestures.test.ts
grep -n -A1 "F13's one-point double-click, both presses" \
    TEST-PLAN.md
grep -i -e centre -e colour -e labelled -e neighbour \
    -e honour -e recognis TEST-PLAN.md | wc -l
```

Expected: nothing; `0`; one TEST-PLAN.md line (the
Pin); one test line (`+ ' panel keeps the panel on it
(F13)', async () => {`); the new Scoring line and
`` `DBLCLICK_MS` apart: its Layer 2 pin decides it, so
a ``; `22` (it was 23; `wc` may pad it with spaces).

- [ ] **Step 5: Gate**

Run the gate under Global Constraints (600000 ms
timeout). Expected: `exit 0`, `ok | 4150 passed | 0
failed | 11 ignored`, `ok | 8 passed | 0 failed`.

- [ ] **Step 6: Commit**

```bash
git diff --stat
git add TEST-PLAN.md
git commit -F - <<'MSG'
Pin F13 to the double-click fix

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
SESSION_LINE
MSG
git status --short
git log --oneline -1
```

Expected: `--stat` shows `TEST-PLAN.md` only;
`git status --short` prints nothing.

---

## Task 8: Close 0j

**Commit subject:** `Close 0j`

**Agent:** `coder`. **Base:** Task 7's commit.

Commandments: Clarity, Uniformity. Abominations: Unbidden Helper Code (the spelling entry is corrected, not worked: no British word changes; the close protocol's pin-flip, comment, and KNOWN-seam steps do not apply), Obscurity.

**Files:**
- Modify: `TODO.md` (the count, the intro's 0j
  clause, the 0j bullet, the intro-cue `## Later work`
  entry, the British-spelling entry's count and its
  sentence naming 0j)

**Interfaces:**
- Consumes: Task 7's TEST-PLAN.md (no "TODO.md 0j"
  cite; 22 British-spelling lines); Task 6's TODO.md,
  whose new entry and item 11 this task leaves as they
  are; "Eighteen items" (`68ec2560`, "Close 0a's walk
  recipes"); the intro's 0j clause (`2f1f8558` "File
  F13's one-point double-click as 0j", `a3e998af`
  "Tidy 0j, the intro, and 0c's pointer"); the 0j
  bullet (`2f1f8558`, `93933fb5` "Align 0j with what
  F13's Layer 2 test decides", `a3e998af`, `ddfc1cb6`
  "Join the two short lines in 0j"); the intro-cue
  entry and the spelling entry (both `646f16d7` "File
  two wording cleanups in TODO.md Later work"); the
  intro-cue entry's oracle ("or no longer names 0j")
  is met.
- Produces: a critical path of seventeen items and a
  TODO.md that names 0j nowhere. No later task.

- [ ] **Step 0: Confirm the anchors**

Each anchor is checked again, in its own step, just
before its Edit (an earlier Edit can change a count).
Run them all once here:

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
grep -cF -e 'Eighteen items, in this order — each its own brainstorm' TODO.md
grep -cF -e "and reseed that ships them (0i); and F13's" TODO.md
grep -cF -e '- **0j.** A double-click under an open panel lands' TODO.md
grep -cF -e '- The Critical product path intro lost a cue. Its last' TODO.md
grep -cF -e "  23 lines. The 0a branch's 9f already made 0j say" TODO.md
```

Expected: `1` on every line. Any other count: STOP and
report.

- [ ] **Step 1: Edit — the count**

File: `TODO.md`. Anchor (expected `1`):

```bash
grep -cF -e 'Eighteen items, in this order — each its own brainstorm' TODO.md
```

Old text:

```text
Eighteen items, in this order — each its own brainstorm
```

New text:

```text
Seventeen items, in this order — each its own brainstorm
```

- [ ] **Step 2: Edit — the intro drops its 0j clause**

File: `TODO.md`. Anchor (expected `1`):

```bash
grep -cF -e "and reseed that ships them (0i); and F13's" TODO.md
```

Old text:

```text
and reseed that ships them (0i); and F13's
double-click under an open panel (0j). Then what a pilot
```

New text:

```text
and reseed that ships them (0i). Then what a pilot
```

- [ ] **Step 3: Edit — remove the 0j bullet**

File: `TODO.md`. Anchor (expected `1`):

```bash
grep -cF -e '- **0j.** A double-click under an open panel lands' TODO.md
```

Old text:

```text
- **0j.** A double-click under an open panel lands
  where a person aimed. With the properties panel
  open, a click on another node selects it and, on
  release, centers it (`web-app/flows/detail.ts:1099-1108`;
  FLOW-CANVAS.md prescribes the centering, and
  `tests/browser/canvas-gestures.test.ts` 'a node
  click under an open panel centers it on release
  (F13)' decides only that the camera moves). A
  double-click's first release therefore slides the
  node from under its second press, which meets
  empty canvas — `open-panel: false` closes the panel
  (`web-app/app/flow-fsm-reduce.ts:97`) — or another
  node, which takes the panel. The walk's element-id
  drive re-aims between the presses, which is how F13
  passed on `8e834e76`. The brainstorm decides how a
  single click still centers while a double-click
  holds still — the 4 Oct plan refused a timer
  (Cleverness) — and whether item 11's "panel callback
  re-fitting at a double-click's second press" rides
  along. Oracle: a red Layer 2 test — two presses at
  one point on a second node under an open panel
  leave the panel open on it — turns green with the
  center-on-release pin still green, and the next walk
  scores F13 PASS
- **4.** `/status` — `{ up: boolean, components: { postgres:
```

New text:

```text
- **4.** `/status` — `{ up: boolean, components: { postgres:
```

- [ ] **Step 4: Edit — remove the intro-cue entry**

File: `TODO.md`. Anchor (expected `1`):

```bash
grep -cF -e '- The Critical product path intro lost a cue. Its last' TODO.md
```

Old text:

```text
- The Critical product path intro lost a cue. Its last
  "then" before 0j became "and" in the 0a branch's 9f,
  as the spec required, so "...(0i); and F13's
  double-click under an open panel (0j)" reads as
  though 0j rides the ledger's one deploy. "Eighteen
  items, in this order" and `## Sequencing` still hold
  the order (nothing there names 0j), so nothing
  breaks; closing 0j removes the clause and this entry
  with it. Restore "then". Oracle: the intro reads
  "...(0i); then F13's double-click under an open panel
  (0j)." or no longer names 0j
- Test-only list oracles. `documentCollectionGetHandler` and
```

New text:

```text
- Test-only list oracles. `documentCollectionGetHandler` and
```

- [ ] **Step 5: Edit — the spelling entry counts 22 lines and drops 0j**

File: `TODO.md`. Anchor (expected `1`):

```bash
grep -cF -e "  23 lines. The 0a branch's 9f already made 0j say" TODO.md
```

Old text:

```text
  labelled, neighbouring, honoured, and recognises in
  23 lines. The 0a branch's 9f already made 0j say
  "center". Say "color", "center" (and its forms),
```

New text:

```text
  labelled, neighbouring, honoured, and recognises in
  22 lines. Say "color", "center" (and its forms),
```

- [ ] **Step 6: Check**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
grep -n 'items, in this order' TODO.md
grep -n 'and reseed that ships them (0i)' TODO.md
grep -c '^- \*\*0j\.\*\*' TODO.md
grep -c '0j' TODO.md
grep -c 'The Critical product path intro lost a cue' TODO.md
grep -n -B1 -e '- \*\*4\.\*\* `/status`' TODO.md
grep -n -A1 'labelled, neighbouring, honoured, and' TODO.md
grep -i -e centre -e colour -e labelled -e neighbour \
    -e honour -e recognis TEST-PLAN.md | wc -l
```

Expected: `17:Seventeen items, in this order — each its
own brainstorm`; `26:and reseed that ships them (0i).
Then what a pilot`; `0`; `0`; `0`; the line before item 4
is 0i's ``  store's landing, and holds
`/migrations/0000-root` ``; the spelling entry's two
lines, `2890:  labelled, neighbouring, honoured, and
recognises in` then `2891-  22 lines. Say "color",
"center" (and its forms),`; `22` (`wc` may pad it), the
count the entry now states.

- [ ] **Step 7: Gate**

Run the gate under Global Constraints (600000 ms
timeout). Expected: `exit 0`, `ok | 4150 passed | 0
failed | 11 ignored`, `ok | 8 passed | 0 failed`.

- [ ] **Step 8: Commit**

```bash
git diff --stat
git add TODO.md
git commit -F - <<'MSG'
Close 0j

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
SESSION_LINE
MSG
git status --short
git log --oneline -1
```

Expected: `--stat` shows `TODO.md` only;
`git status --short` prints nothing.

---

## Reviews

### Per-task spec-compliance review (fresh `planner`)

Brief: `Go to Medium Church!`, the voice rules, the
task's commandments and abominations, the AGENTS.md
§ Subagents patterns, this worktree, the base
precondition (HEAD is the task's commit, the tree is
clean), no `isolation`, no `./deploy`, `./bin/build`,
`./bin/measure`, seed, or wipe, no walk. Read-only.
Then:

- `git show --stat HEAD` touches exactly the task's
  **Files**; `git log -1 --format=%B` is the exact
  subject, a blank line, the Co-Authored-By trailer,
  and the Claude-Session line if the session gives
  one, with no body.
- Every added line in `git show HEAD` equals the plan's
  new text, character for character, and for Tasks 3
  and 4 the spec's § 1-2 code. Every removed line is the
  plan's old text. Nothing else moved. For Task 3, every
  added fixture line follows Step 13's rule (the node
  press's own svg values; `0, 0` on an edge; `now:
  1000` on a canvas press).
- Task 4's report carries both red runs (Step 5's
  failure text, Step 10's six names and `19 passed | 6
  failed`) before any product edit, and both green
  runs; Tasks 3 and 4 report the Layer 2 line.
- The gate lines the task names, re-run once here.
- The Review Focus lines the task touches hold.

### Per-task quality review (fresh `planner`)

Same brief. Then read the changed region in context,
and WALK each rule the task touches for false matches
and false misses, writing each walk down:

- Tasks 3 and 4: for rule (b), trace these through the
  committed reducer, each to the actions and state it
  yields: the F13 case (canvas under the point; another
  node under it; an edge under it); a panel-closed
  double-click; the same node beyond the slop; the same
  point at 400 ms and at 399 ms; another node within 4
  px; pan mode (the adapter sends every pan-mode press
  as a canvas press); a port and a locked node; Shift
  and Meta multi-select (Meta toggling the node off); a
  stale `lastClick` after a Delete, an undo, or a
  page-side selection write; a drag, then a press near
  the drag's first point inside 400 ms (it matches, the
  spec's known cost); marquee and connect gestures;
  keyboard activation (`canvas-key-activate`,
  `canvas-focus`, which do not touch `lastClick`); a
  third press chaining. Name any false match or miss
  the spec does not list as a known cost.
- Task 4: the Layer 2 test aims once at the `> rect`
  body, asserts it is clear of the panel and does not
  hold the visible center, sends `doubleClickAt`, and
  decides by `stays` and a final read; it can neither
  pass with the panel closed nor fail for a reason
  other than the panel.
- Doc tasks: list nesting and continuation indent render
  as the neighbors do; TEST-PLAN.md's F13 still starts
  `- [ ] **F13**`; no paraphrase crept in; each cited
  `file:line` holds at HEAD; F13's Scoring change
  follows the Scoring table (`### Scoring`'s FAIL row
  and the paragraph under it).
- `./test validate` ran before the commit with the
  task's lines. A finding that the spec itself is wrong
  is reported, not fixed.

### Whole-branch review (fresh `architect`, after Task 8)

Same brief, read-only. Review `git log --oneline
ddfc1cb6..HEAD` and `git diff ddfc1cb6..HEAD` against
the spec:

- Eight commits, in order: "Specify 0j's double-click
  under an open panel", "Plan 0j's double-click under
  an open panel", "Carry the press point and time",
  "Match a second press by its point", "Name the
  double-click rule in FLOW-CANVAS.md", "File item 11's
  re-fit as its own entry", "Pin F13 to the double-click
  fix", "Close 0j" (the owner's order, 2026-10-07).
- No commit's TEST-PLAN.md cites a removed TODO.md item:
  `git grep -n '0j' <commit> -- TEST-PLAN.md` is empty
  at "Pin F13 to the double-click fix" and every later
  commit.
- The spec's § 1-2 code lands verbatim in
  `web-app/app/flow-fsm-reduce.ts`; `git diff
  ddfc1cb6..HEAD -- web-app/app/flow-fsm-reduce.ts`
  removes no line; `web-app/flows/detail.ts`, AGENTS.md,
  ARCHITECTURE.md, AUDIT.md, DESIGN-SYSTEM.md, and
  `docs/superpowers/plans/test-plan-walk-2026-10-04.md`
  are unchanged (`git diff --stat ddfc1cb6..HEAD --
  <them>` is empty).
- All ten Review Focus lines hold at HEAD; walk rule
  (b) once more across the whole diff.
- The spec and this plan are unchanged since commit 2
  (`git log --oneline <commit 2>..HEAD -- <both>` is
  empty).
- Run the gate once at HEAD with a fresh stamp, so the
  SHA skip cannot fire, and Layer 2 once:

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
export DENO_DIR="$TMPDIR/deno-dir"
export MOST_RECENTLY_VALIDATED_SHA_PATH="$TMPDIR/0j-architect-sha"
rm -f "$MOST_RECENTLY_VALIDATED_SHA_PATH"
./test validate browser > "$TMPDIR/0j-architect.log" 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' "$TMPDIR/0j-architect.log" \
    | grep -E '^(ok|FAILED) \|'
```

  Expected: `exit 0`; `ok | 4150 passed | 0 failed | 11
  ignored`, `ok | 8 passed | 0 failed`, then the Layer 2
  line `ok | 51 passed | 0 failed` (Task 0's baseline
  plus one).

---

## Hand-back (orchestrator)

- [ ] **Step 1: Final gate at the tip**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-10-07-double-click-under-panel
export DENO_DIR="$TMPDIR/deno-dir"
git status --short
git log --oneline ddfc1cb6..HEAD
./test validate > "$TMPDIR/0j-tip.log" 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' "$TMPDIR/0j-tip.log" \
    | grep -E '^(ok|FAILED) \||already validated'
```

Expected: a clean tree; eight commits; `exit 0`, and
either the two gate lines (`ok | 4150 passed | 0 failed
| 11 ignored`, `ok | 8 passed | 0 failed`) or `already
validated <tip SHA>` when the last commit's gate stamped
it.

- [ ] **Step 2: Report and stop**

Report to the owner: the tip SHA; both gate lines; the
Layer 2 baseline and tip lines; Task 4's two red
failure texts; the architect's verdict; every ledger
`Ruling:`; and any open item a review raised.
Do not rebase, merge, or land. Landing waits on
`todo-triage` and `2026-10-06-walk-recipes`, in that
order, and is the owner's call.

# 0a Walk Recipes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking. Ride this worktree. Do not
> create one. Do not rebase, merge, land, force-push,
> or delete a branch. One worker. Subagents work here
> and never pass the Agent tool `isolation`.

> **For the dispatching orchestrator:** every subagent
> prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then push down: the voice
> rules (78-char lint on code and scripts, not `.md`;
> 4-space indent; no inline styles; present-tense
> imperative ~50-char commit subjects, no body, then
> the trailers under Global Constraints), the
> commandments and abominations the task names, and
> the AGENTS.md § Subagents patterns (quoted in
> Global Constraints). Subagents work in
> `/Users/tmornini/code/fusion-angle/.worktrees/2026-10-06-walk-recipes`,
> never pass the Agent tool `isolation`, and never
> run `./deploy`, `./bin/build`, `./bin/measure`,
> `./bin/postgres-seed`, `./bin/postgres-wipe`, or
> any seed or wipe verb. No Layer 2 run, no walk.
>
> Per task, in order, before the next task starts:
>
> 1. Implementer: a fresh agent of type `coder`.
> 2. Spec-compliance review: a fresh agent of type
>    `planner`.
> 3. Quality review: another fresh agent of type
>    `planner`.
>
> After Task 9f: a fresh agent of type `architect`
> reviews `1e0941c5..HEAD` against the spec. Pass no
> model override to any dispatch.
>
> A reviewer's finding is fixed by a fresh `coder`
> that amends the task's own commit
> (`git commit --amend --no-edit`, the branch is
> local), re-runs `./test validate`, and is reviewed
> again by a fresh `planner` of the same kind. A
> finding that says the spec is wrong is not fixed:
> STOP and report it to the owner.

**Goal:** TEST-PLAN.md carries executable walk
recipes for I22, F13, AA32, and C6, with their
driving-note and Scoring lines; TODO.md files 0j and
closes 0a.

**Architecture:** Doc-only. Fourteen task commits, each
an exact string replacement with the Edit tool on
`TODO.md` or `TEST-PLAN.md`, each green at Layer 1.
0j lands before F13's text cites it; 0a closes in Task
8. Tasks 5b, 6b, and 8b amend F13's aim, AA32's aim, and
0b's plan pointer after Tasks 5, 6, and 8 were
reviewed; commits 5a, 6a, and 8a, which amended this
plan and the spec, precede them. Tasks 9b through 9f
tighten the recipes' wording after the whole-branch
review; commit 9a, which amended this plan and the
spec, precedes them. With the spec, the plan, and the
four amendments, the branch carries twenty commits.

**Tech Stack:** Markdown. Layer 1 (`./test validate`,
Deno 2.9.6) is the gate, because it lints both files.

**Spec:** `docs/superpowers/specs/2026-10-06-walk-recipes-design.md`
(owner-approved). The spec is the source of truth.
Its `## Sequence` is this plan's task list, and its
code blocks are the exact text the tasks land. Its
line cites say where to look on `8fb66783`. They are
not edit addresses.

**Worktree:** `.worktrees/2026-10-06-walk-recipes`,
branch `2026-10-06-walk-recipes`, cut from
`todo-triage`'s `1e0941c5`; spec at `8fb66783`.

**Out of bounds:** the spec, this plan, and
`docs/superpowers/plans/test-plan-walk-2026-10-04.md`.
None is edited, except by the owner's word of
2026-10-07: "apply all" lets each "a" commit (5a, 6a,
8a, and any later one) amend the spec and this plan
once to answer an Important review finding, and "Fix the
Minor notes" lets 9a do so for the Minor ones. If the
spec is wrong in any other way, STOP and report.

---

## Global Constraints

- Edits are exact string replacements with the Edit
  tool, never `sed`, never a line number. Each Edit's
  old text is quoted in full below. Before each Edit,
  confirm its anchor line occurs exactly once with the
  `grep -cF` the step gives (expected `1`). Any other
  count: STOP and report; do not improvise.
- Copy every new-text block verbatim: character for
  character, indentation and backticks included.
  Never paraphrase TEST-PLAN.md or TODO.md text. Never
  rewrap a block.
- Touch nothing the task does not name. No reflow of
  neighbouring lines, no drive-by fixes.
- Run `./test validate` before every commit, this
  Markdown included: `./test lint` fails on a
  `tests/…` path TEST-PLAN.md cites that does not
  exist, on retired storage vocabulary in a root
  `.md`, and on a TODO.md whose `## Critical product
  path` count is not one; and
  `tests/test-plan-apple-menu.test.ts` and
  `tests/fusion-angle-live-name.test.ts` parse
  TEST-PLAN.md. Under the Claude Code sandbox, first:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
```

- Expected gate, unchanged on every commit (no test
  code changes, so the count must not move):
  `ok | 4141 passed | 0 failed | 11 ignored`, then
  the timezone pass `ok | 8 passed | 0 failed`, exit
  0, about 1m40s. Run it with a 600000 ms timeout.
  Any other count: STOP and report.
- Commit message: one subject line (the task's exact
  subject), no body, then a blank line, then the
  Co-Authored-By trailer naming the model that wrote
  the commit, then this session's Claude-Session line.
  A `coder` runs Sonnet; if the session says another
  model, name that one. The commit blocks below print the
  planning session's Claude-Session line; at execution the
  orchestrator substitutes its own, as the owner directed
  on 2026-10-07 (the commits after `5cccaa60` carry
  `session_018uFFAapWhN6H85dJyVj5cm`, and Tasks 5b, 6b,
  8b, and 9b through 9f print it already). Use exactly
  this shape:

```bash
git commit -F - <<'EOF'
<exact subject>

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014jFgSaA7ABoNqEDzB6WGmu
EOF
```

- Author stays the repository's configured user. Do
  not pass `--author`. Stage only the one file the
  task names (`git add TODO.md` or
  `git add TEST-PLAN.md`).
- AGENTS.md § Subagents patterns, pushed down to every
  subagent (this plan touches no code, so they bound
  any reviewer's judgment rather than an edit):
  RequestContext as the first argument to client
  verbs; a client verb returns an `HttpMessage`, an
  array of them, or a value that keeps one (the
  aggregates TODO.md's three-shapes bullet names
  excepted); a write from a held message takes the
  message it latches; SafeHtml from presenters;
  snake_case storage / camelCase domain; HTTP-verb
  adapter naming (`getNoun`/`putNoun`/`deleteNoun`/
  `postNounOperation`); validators at the gate, not
  downstream; no untyped `any` from external
  boundaries.

## Review Focus

The spec's traps. Every reviewer checks each one
that its task touches.

1. **F13 alone takes the one-point drive.** The
   double-click bullet's general drive (two
   pointerdowns on one element id) stays; only F13
   and its added bullet lines name one point. F11
   says "F13 names its own"; AA33, F12, F14, and the
   rest are untouched.
2. **I22's Fetch pattern is narrower than I21's.**
   I22's is `*://localhost:*/api/organizations/*/ideas/`;
   I21's `*://localhost:*/api/organizations/*` stays
   as it is. I22 fulfills a 500; I21 continues.
3. **C6 keeps its `overflow-y` clause.** "neither
   `html` nor `body` computes `overflow-y: hidden`"
   must survive the copy; after Task 9e the clause also
   rules out `overflow-y: clip`.
4. **0j's text cites the walk, not F13's text.** It
   says the element-id drive "is how F13 passed on
   `8e834e76`". It must read true both before and
   after Task 5.
5. **The intro count.** "Nineteen items" after Task
   3; "Eighteen items" after Task 8.
6. **Sequencing.** After Task 8 it reads
   "- 0b → 0c: the count follows the moorings".
7. **`## Summary`'s counts do not change.** No case
   is added or removed: the table still totals 404,
   I is 30, F is 80, AA is 46, C is 7.
8. **F13 is aimed before it is pressed.** After Task
   5b, F13 names a regular node (never Create or
   Archive) and requires `document.elementFromPoint`
   to resolve the target before the first press; a
   pre-press miss is re-aimed, not scored. Its
   FAIL-not-BLOCKED sentence and its Pin stay.
9. **AA32 is aimed at both ends and reads Shift before
   release.** After Task 6b, AA32 requires
   `document.elementFromPoint` to resolve the drop
   target as well as the press point, and its BLOCKED
   clause is the ghost "New State" card in the preview
   (Shift lost), not "a node is added instead". Its PASS
   clauses and its Pin stay.
10. **0b names the plan it cites.** After Task 8b, 0b
    says "Task 10 of
    `docs/superpowers/plans/test-plan-walk-2026-10-04.md`"
    where it said "the same plan"; after Task 9f, 0c
    names it too, so neither bullet depends on the
    other's surviving. `## Sequencing` stays as Task 8
    left it, and the intro changes only its last "then"
    to "and" (Task 9f).
11. **The wording pass loosens nothing.** After Tasks 9b
    through 9f, every PASS clause, Pin, selector, and
    count stays as it was; the new sentences only add an
    observation, a probe, a precedence, or an honest
    BLOCKED or re-aim cue.

---

## Graph

Commit 1 (`8fb66783`, the spec) and commit 2 (this
plan, "Plan the 0a walk recipes") precede execution.
Tasks run strictly in order 3, 4, 5, 5b, 6, 6b, 7, 8, 8b,
9b, 9c, 9d, 9e, 9f. Commits 5a, 6a, 8a, and 9a are not
tasks: each amended this plan and the spec once, after a
review (5a before Task 5b, 6a before Task 6b, 8a before
Task 8b, 9a before Tasks 9b through 9f). Task 3
precedes Task 5, so F13's pointer to 0j never names
nothing. Task 5's Scoring line anchors on Task 4's
I22 line. Task 5b anchors on Task 5's F13 text.
Task 6b anchors on Task 6's AA32 and Shift-drag text.
Task 8 anchors on Task 3's "Nineteen". Task 8b anchors
on Task 8's 0b line. Task 9b anchors on Task 4's I22
text; 9c on Task 5b's and Task 5's F13 text; 9d on
Task 6's and Task 6b's AA32 and Shift-drag text; 9e on
Task 7's C6 text; 9f on Task 3's 0j and intro and on
the 0c line the base carries. The five touch disjoint
regions.

Each task's cycle:

1. Confirm each anchor occurs exactly once.
2. Apply each Edit.
3. Run the task's checks (cites, Pin names).
4. Run `./test validate`.
5. Show `git diff --stat` (one file) and commit.

Then the two reviews, then the next task.

---

## Task 3: File F13's one-point double-click as 0j

**Commit subject:** `File F13's one-point double-click as 0j`

Commandments: Clarity, Uniformity, Logic.
Abominations: Obscurity, Unbidden Helper Code (no
other TODO.md edit).

**Files:**
- Modify: `TODO.md` (critical path intro; insert 0j
  after 0i, before item 4)

**Interfaces:**
- Consumes: nothing.
- Produces: TODO.md item 0j (Task 5's F13 Pin and
  Scoring line cite "TODO.md 0j"); the intro's
  "Nineteen items" (Task 8's anchor). Task 9f tidies
  0j's spelling and the intro's last "then".

- [ ] **Step 1: Confirm the anchors**

```bash
grep -cF 'Eighteen items, in this order — each its own brainstorm' TODO.md
grep -cF 'and reseed that ships them (0i). Then what a pilot' TODO.md
grep -cF '- **4.** `/status` — `{ up: boolean, components: { postgres:' TODO.md
grep -c '^- \*\*0j\.\*\*' TODO.md
```

Expected: `1`, `1`, `1`, `0`.

- [ ] **Step 2: Edit 3a — the count**

Old text:

```text
Eighteen items, in this order — each its own brainstorm
```

New text:

```text
Nineteen items, in this order — each its own brainstorm
```

- [ ] **Step 3: Edit 3b — the intro names 0j after 0i**

Old text:

```text
(0f), `FA_GIT_SHA` (0g), migrations (0h), and the wipe
and reseed that ships them (0i). Then what a pilot
tenant needs (4–7), the process engine and its AI
```

New text:

```text
(0f), `FA_GIT_SHA` (0g), migrations (0h), and the wipe
and reseed that ships them (0i); then F13's
double-click under an open panel (0j). Then what a pilot
tenant needs (4–7), the process engine and its AI
```

- [ ] **Step 4: Edit 3c — file 0j immediately before item 4**

Old text:

```text
- **4.** `/status` — `{ up: boolean, components: { postgres:
```

New text:

```text
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
- **4.** `/status` — `{ up: boolean, components: { postgres:
```

- [ ] **Step 5: Check placement, count, and cites**

```bash
grep -n -B2 '^- \*\*0j\.\*\*' TODO.md
grep -n 'items, in this order' TODO.md
sed -n '1099,1108p' web-app/flows/detail.ts
sed -n '97p' web-app/app/flow-fsm-reduce.ts
grep -n "a node click under an open panel centers it" \
    tests/browser/canvas-gestures.test.ts
grep -n "+ ' on release (F13)'" tests/browser/canvas-gestures.test.ts
```

Expected: the two lines before 0j are 0i's last
lines, ending "store's landing, and holds
`/migrations/0000-root`"; the intro reads
"Nineteen items"; `detail.ts:1099-1108` is the
`if (prevSelected !== nowSelected && nowSelected
!== null && isPanelOpen) { commit(…withSelectionCentered()…); }`
block, opening `if (` and closing `}`;
`flow-fsm-reduce.ts:97` is
`{ kind: 'open-panel', open: false },`; the Pin name
is found at `:451` and its tail at `:452`. Any
mismatch: STOP and report.

- [ ] **Step 6: Gate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: `ok | 4141 passed | 0 failed | 11 ignored`,
timezone `ok | 8 passed | 0 failed`, exit 0.

- [ ] **Step 7: Commit**

```bash
git diff --stat
git add TODO.md
git commit -F - <<'EOF'
File F13's one-point double-click as 0j

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014jFgSaA7ABoNqEDzB6WGmu
EOF
```

Expected `--stat`: `TODO.md` only.

---

## Task 4: Force I22's fault with Fetch

**Commit subject:** `Force I22's fault with Fetch`

Commandments: Reliability (the walk scores honestly),
Clarity, Logic. Abominations: Test Weakening (I22's
PASS clauses and its narrow BLOCKED stay as written),
Obscurity, Unbidden Helper Code.

**Files:**
- Modify: `TEST-PLAN.md` (I22; the skeleton bullet in
  `### Driving notes`; `### Scoring`'s walk-specific
  list)

**Interfaces:**
- Consumes: nothing.
- Produces: the Scoring line ending "exploratory
  half. BLOCKED only if `Fetch` itself\nrefuses."
  (Task 5 inserts F13's line after it). Task 9b
  tightens I22's case and that line.

- [ ] **Step 1: Confirm the anchors**

```bash
grep -cF '**I22** If an error occurs inside a `loadInto()`' TEST-PLAN.md
grep -cF '       live retry click re-attempting the load' TEST-PLAN.md
grep -cF '  place is FAIL of the exploratory half.' TEST-PLAN.md
grep -cF '- Reduced motion is `Emulation.setEmulatedMedia`.' TEST-PLAN.md
grep -cF 'I21 skeleton miss without the Fetch pause:' TEST-PLAN.md
grep -cF 'SV7 when SV6 did not produce a second jar:' TEST-PLAN.md
```

Expected: six `1`s.

- [ ] **Step 2: Edit 4a — replace I22**

Old text (the whole case, its Pin included):

```text
- [ ] **I22** If an error occurs inside a `loadInto()` fetch path (e.g. a data-dependent page hits a thrown adapter error after the database initialized successfully), the error state with "Try Again" retry button is shown. PASS: clicking retry re-attempts data loading. The explorer has no way to force this fault live; if none occurs naturally, record BLOCKED naming that reason — an honest BLOCKED costs nothing.
  Pin: tests/loading-states.test.ts 'a rejecting
       fetch renders the error state and calls
       neither hook' (a rejected fetch renders a
       "Try Again" control and calls neither
       `onEmpty` nor `onData`); exploratory — the
       live retry click re-attempting the load
```

New text:

```text
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

- [ ] **Step 3: Edit 4b — the skeleton bullet gains I22's sentences after I21's**

Old text:

```text
  pause is BLOCKED. A miss with the pause in
  place is FAIL of the exploratory half.
- Reduced motion is `Emulation.setEmulatedMedia`.
```

New text:

```text
  pause is BLOCKED. A miss with the pause in
  place is FAIL of the exploratory half.
  I22 also enables `Fetch` before its navigation, on
  its own narrower pattern, and answers its one
  paused GET with a 500 instead of continuing it.
- Reduced motion is `Emulation.setEmulatedMedia`.
```

- [ ] **Step 4: Edit 4c — Scoring gains I22's line after I21's**

Old text:

```text
I21 skeleton miss without the Fetch pause:
BLOCKED naming that. A miss with the pause in
place is FAIL of the exploratory half.
SV7 when SV6 did not produce a second jar:
```

New text:

```text
I21 skeleton miss without the Fetch pause:
BLOCKED naming that. A miss with the pause in
place is FAIL of the exploratory half.
I22 with the 500 fulfilled: a missing error state,
message, focus, or re-fetch is FAIL of the
exploratory half. BLOCKED only if `Fetch` itself
refuses.
SV7 when SV6 did not produce a second jar:
```

- [ ] **Step 5: Check the Pin name and the cites**

Lint checks cited paths, not names. The name wraps
across two source lines, so grep each half:

```bash
grep -n "'a rejecting fetch renders the error state'" \
    tests/loading-states.test.ts
grep -n "+ ' and calls neither hook'," tests/loading-states.test.ts
grep -n '\*\*I22\*\*' TEST-PLAN.md
grep -n '`\*://localhost:\*/api/organizations/\*`' TEST-PLAN.md
```

Expected: the halves at `:80` and `:81`; one
`**I22**` case; I21's broad pattern still twice, as
on `8fb66783` — the skeleton bullet and I21's own
case. The new text carries no
`file:line` cite; confirm it still names no line:

```bash
git diff -U0 TEST-PLAN.md | grep '^+' | grep -E '\.(ts|md|html|css):[0-9]'
```

Expected: no output.

- [ ] **Step 6: Gate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: `ok | 4141 passed | 0 failed | 11 ignored`,
timezone `ok | 8 passed | 0 failed`, exit 0.

- [ ] **Step 7: Commit**

```bash
git diff --stat
git add TEST-PLAN.md
git commit -F - <<'EOF'
Force I22's fault with Fetch

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014jFgSaA7ABoNqEDzB6WGmu
EOF
```

Expected `--stat`: `TEST-PLAN.md` only.

---

## Task 5: Drive F13 at one point as a person does

**Commit subject:** `Drive F13 at one point as a person does`

Commandments: Reliability (F13 can now FAIL
honestly), Logic, Clarity, Uniformity.
Abominations: Test Weakening (the FAIL-not-BLOCKED
rule stays), Unbidden Helper Code (no other
double-click case changes), Obscurity.

**Files:**
- Modify: `TEST-PLAN.md` (F13; the double-click bullet
  in `### Driving notes`; F11; `### Scoring`)

**Interfaces:**
- Consumes: TODO.md 0j (Task 3); Task 4's I22 Scoring
  line.
- Produces: F13's text, which Task 5b amends.

- [ ] **Step 1: Confirm the anchors**

```bash
grep -cF '*different* node (F11'"'"'s drive). PASS: panel content' TEST-PLAN.md
grep -cF '       null'"'"'; exploratory — the live retarget paint' TEST-PLAN.md
grep -cF '  one element id inside `DBLCLICK_MS` (400).' TEST-PLAN.md
grep -cF '  in F uses the same drive. PASS: the' TEST-PLAN.md
grep -cF 'exploratory half. BLOCKED only if `Fetch` itself' TEST-PLAN.md
grep -c '^- \*\*0j\.\*\*' TODO.md
```

Expected: six `1`s.

- [ ] **Step 2: Edit 5a — replace F13**

Old text (the whole case, its Pin included):

```text
- [ ] **F13** While the panel is open, double-click a
  *different* node (F11's drive). PASS: panel content
  retargets to the
  new node and the canvas re-centres on it.
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
       null'; exploratory — the live retarget paint
```

New text:

```text
- [ ] **F13** While the panel is open, double-click a
  *different* node the way a person does: one point,
  two presses. Read the center of
  `.flow-node[aria-label="<name>"] > rect` once —
  the `NODE_WIDTH`×`NODE_HEIGHT` body, not the label
  `text` or the `g`, whose box includes the port —
  and send both press/release pairs to that point
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

- [ ] **Step 3: Edit 5b — the double-click bullet gains F13's exception**

Old text:

```text
- There is no `dblclick` listener: send two pointerdowns on
  one element id inside `DBLCLICK_MS` (400).
```

New text:

```text
- There is no `dblclick` listener: send two pointerdowns on
  one element id inside `DBLCLICK_MS` (400).
  F13 alone sends both presses to one point read
  before the first, as a person does: under an open
  panel the first release centres the node, so a
  re-read would chase it.
```

- [ ] **Step 4: Edit 5c — F11 names F13's exception**

"every later double-click" ends one line and "in F
uses the same drive" starts the next
(TEST-PLAN.md:2744-2745 on `8fb66783`). Replace both
lines.

Old text:

```text
  are in `### Driving notes`, and every later double-click
  in F uses the same drive. PASS: the
```

New text:

```text
  are in `### Driving notes`, and every later double-click
  in F uses the same drive; F13 names its own. PASS: the
```

- [ ] **Step 5: Edit 5d — Scoring gains F13's line after I22's**

Old text:

```text
exploratory half. BLOCKED only if `Fetch` itself
refuses.
SV7 when SV6 did not produce a second jar:
```

New text:

```text
exploratory half. BLOCKED only if `Fetch` itself
refuses.
F13's second press off the node after the first
release centred it: FAIL, not BLOCKED (TODO.md 0j).
SV7 when SV6 did not produce a second jar:
```

- [ ] **Step 6: Check the Pin names and the cites**

Lint checks cited paths, not names. Every name wraps
across two source lines, so grep each half:

```bash
grep -n "'double-click n1 then double-click n2 retargets'" \
    tests/flow-fsm-scenarios.test.ts
grep -n "+ ' panel and selection to n2 (F13 retarget)'," \
    tests/flow-fsm-scenarios.test.ts
grep -n "'second click beyond DBLCLICK window does not'" \
    tests/flow-fsm-scenarios.test.ts
grep -n "+ ' open panel (F13 negative)'," \
    tests/flow-fsm-scenarios.test.ts
grep -n "'applyPanToRevealSelected centers a node, else null'" \
    tests/flow-designer-actions.test.ts
grep -n "'a node click under an open panel centers it'" \
    tests/browser/canvas-gestures.test.ts
grep -n "+ ' on release (F13)'" tests/browser/canvas-gestures.test.ts
```

Expected, on `8fb66783`: `:470`/`:471`, `:429`/`:430`,
`:368`, `:451`/`:452`. Each grep finds exactly one
line. Then confirm the double-click scope and that
the new text names no line:

```bash
grep -n 'F13 names its own' TEST-PLAN.md
grep -n 'F13 alone sends both presses' TEST-PLAN.md
grep -n '^- \*\*0j\.\*\*' TODO.md
git diff -U0 TEST-PLAN.md | grep '^+' | grep -E '\.(ts|md|html|css):[0-9]'
```

Expected: one hit each for the first three; no
output from the last.

- [ ] **Step 7: Gate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: `ok | 4141 passed | 0 failed | 11 ignored`,
timezone `ok | 8 passed | 0 failed`, exit 0.

- [ ] **Step 8: Commit**

```bash
git diff --stat
git add TEST-PLAN.md
git commit -F - <<'EOF'
Drive F13 at one point as a person does

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014jFgSaA7ABoNqEDzB6WGmu
EOF
```

Expected `--stat`: `TEST-PLAN.md` only.

---

## Task 5b: Aim F13 clear of the properties panel

**Commit subject:** `Aim F13 clear of the properties panel`

Commandments: Reliability (a mis-aimed press cannot score FAIL), Clarity,
Logic, Uniformity (AA32's aim wording).
Abominations: Test Weakening (F13's FAIL-not-BLOCKED sentence and its Pin
stay as written), Unbidden Helper Code (no other case, bullet, or Scoring
line changes), Obscurity.

**Files:**
- Modify: `TEST-PLAN.md` (F13's body; its Pin kept)

**Interfaces:**
- Consumes: Task 5's F13 text, as committed in `93afc52d`.
- Produces: F13's text, which Task 9c tightens.

- [ ] **Step 1: Confirm the anchors**

```bash
grep -cF -e '- [ ] **F13** While the panel is open, double-click a' TEST-PLAN.md
grep -cF -e '  two presses. Read the center of' TEST-PLAN.md
grep -cF -e 'FAIL, not BLOCKED: the gesture was delivered.' TEST-PLAN.md
```

Expected: `1`, `1`, `1`. The `-e` is needed: the first pattern begins with
`-`, which grep otherwise reads as an option.

- [ ] **Step 2: Edit 5b — F13's body**

Old text (F13's body; its Pin follows and stays):

```text
- [ ] **F13** While the panel is open, double-click a
  *different* node the way a person does: one point,
  two presses. Read the center of
  `.flow-node[aria-label="<name>"] > rect` once —
  the `NODE_WIDTH`×`NODE_HEIGHT` body, not the label
  `text` or the `g`, whose box includes the port —
  and send both press/release pairs to that point
  inside `DBLCLICK_MS`, never re-reading it between
  them. PASS: after the second press the panel is
  still open, `#prop-node-name` reads the
  double-clicked node's name, and the canvas has
  re-centred on it. A second press that lands off the
  node because the first release moved the camera is
  FAIL, not BLOCKED: the gesture was delivered.
```

New text:

```text
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
```

- [ ] **Step 3: Check the case, the class, and the cites**

```bash
grep -c '\*\*F13\*\*' TEST-PLAN.md
grep -n 'flow-props-panel' web-app/app/styles/pages-flow-detail.css | head -1
grep -n 'const PANEL' tests/browser/canvas-gestures.test.ts
git diff -U0 TEST-PLAN.md | grep '^-' | grep -c 'Pin:'
git diff -U0 TEST-PLAN.md | grep '^+' | grep -E '\.(ts|md|html|css):[0-9]'
```

Expected: `1`; the class's rule in `pages-flow-detail.css`;
`const PANEL = '.flow-props-panel';`; `0` removed Pin lines; no output
from the last. Any mismatch: STOP and report.

- [ ] **Step 4: Gate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: `ok | 4141 passed | 0 failed | 11 ignored`, timezone
`ok | 8 passed | 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git diff --stat
git add TEST-PLAN.md
git commit -F - <<'EOF'
Aim F13 clear of the properties panel

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018uFFAapWhN6H85dJyVj5cm
EOF
```

Expected `--stat`: `TEST-PLAN.md` only.

---

## Task 6: Aim AA32's Shift-drag at the port

**Commit subject:** `Aim AA32's Shift-drag at the port`

Commandments: Clarity, Logic, Uniformity.
Abominations: Obscurity, Unbidden Helper Code (AA32's
Pin stays byte-for-byte; F19 and F23 are untouched).

**Files:**
- Modify: `TEST-PLAN.md` (AA32's body, its Pin kept;
  the Shift-drag bullet in `### Driving notes`)

**Interfaces:**
- Consumes: nothing.
- Produces: AA32's body and the Shift-drag bullet,
  which Task 6b amends.

- [ ] **Step 1: Confirm the anchors**

```bash
grep -cF '- [ ] **AA32** Hold Shift and drag from "Review" onto' TEST-PLAN.md
grep -cF '  costs nothing. Do not FAIL the compositor.' TEST-PLAN.md
grep -cF '- Shift-drag (AA32/F19/F23): if the compositor does not' TEST-PLAN.md
```

Expected: three `1`s.

- [ ] **Step 2: Edit 6a — replace AA32's body, keeping its Pin**

The old text ends at the line before
`  Pin: tests/flow-cycle-edges.test.ts 'a back-edge to`,
which stays.

Old text:

```text
- [ ] **AA32** Hold Shift and drag from "Review" onto
  "Data Capture". PASS: during the drag the preview
  redraws as a dashed-orange curved bezier because a
  forward path "Data Capture" → "Review" already
  exists, and the reachability check recognises the
  release would close a loop. Release to create the
  cycle edge; rename it "needs revision". Hold Shift
  and drag from "Review" onto "Archive". PASS: preview
  is a solid-blue curved bezier (no return path).
  Release to create the edge; rename it "approve".
  Drive the shift-drag with compositor mouse. If Shift
  is not observed (release still port-add-node),
  record BLOCKED naming that — an honest BLOCKED
  costs nothing. Do not FAIL the compositor.
```

New text:

```text
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

- [ ] **Step 3: Edit 6b — replace the Shift-drag bullet**

Old text:

```text
- Shift-drag (AA32/F19/F23): if the compositor does not
  deliver Shift on pointer-up, the FSM emits add-node
  instead of add-edge. Record BLOCKED naming that; do
  not FAIL. Layer 1 and Layer 2 pins decide add-edge.
  F23's mid-gesture Shift is the same compositor limit.
```

New text:

```text
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

- [ ] **Step 4: Check the Pin survived and no line cites**

```bash
grep -n -A1 'naming that\.$' TEST-PLAN.md | grep -F "Pin: tests/flow-cycle-edges.test.ts 'a back-edge to"
git diff -U0 TEST-PLAN.md | grep '^-' | grep -c 'Pin:'
git diff -U0 TEST-PLAN.md | grep '^+' | grep -E '\.(ts|md|html|css):[0-9]'
```

Expected: one hit (AA32's Pin follows its new last
line); `0` removed Pin lines; no output.

- [ ] **Step 5: Gate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: `ok | 4141 passed | 0 failed | 11 ignored`,
timezone `ok | 8 passed | 0 failed`, exit 0.

- [ ] **Step 6: Commit**

```bash
git diff --stat
git add TEST-PLAN.md
git commit -F - <<'EOF'
Aim AA32's Shift-drag at the port

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014jFgSaA7ABoNqEDzB6WGmu
EOF
```

Expected `--stat`: `TEST-PLAN.md` only.

---

## Task 6b: Aim AA32's drop and fix its BLOCKED cue

**Commit subject:** `Aim AA32's drop and fix its BLOCKED cue`

Commandments: Reliability (a mis-aimed drop or a lost Shift
cannot score FAIL), Clarity, Logic, Uniformity (F13's aim
wording; F19's and F23's "ghost card").
Abominations: Test Weakening (AA32's PASS clauses and its Pin
stay as written), Unbidden Helper Code (no other case,
bullet, or Scoring line changes), Obscurity.

**Files:**
- Modify: `TEST-PLAN.md` (AA32's body, its Pin kept; the
  Shift-drag bullet in `### Driving notes`)

**Interfaces:**
- Consumes: Task 6's AA32 and Shift-drag text, as committed in
  `20beded1`.
- Produces: AA32's body and the Shift-drag bullet,
  which Task 9d tightens.

- [ ] **Step 1: Confirm the anchors**

```bash
grep -cF '  `.flow-node[aria-label="Data Capture"] > rect`.' TEST-PLAN.md
grep -cF '  observed on release (a node is added instead),' TEST-PLAN.md
grep -cF '  true. If Shift is not delivered on pointer-up the' TEST-PLAN.md
```

Expected: `1`, `1`, `1`.

- [ ] **Step 2: Edit 6b-1 — AA32's drop point is aim-checked**

Old text:

```text
  `.flow-node[aria-label="Data Capture"] > rect`.
  Confirm `document.visibilityState === 'visible'`
```

New text:

```text
  `.flow-node[aria-label="Data Capture"] > rect`, and
  `document.elementFromPoint` there must resolve
  `.closest('.flow-node')` to that node.
  Confirm `document.visibilityState === 'visible'`
```

- [ ] **Step 3: Edit 6b-2 — AA32's BLOCKED cue is the ghost card**

Old text:

```text
  observed on release (a node is added instead),
  naming that.
```

New text:

```text
  observed: before release the preview shows a ghost
  "New State" card, not the bezier, naming that.
```

- [ ] **Step 4: Edit 6b-3 — the Shift-drag bullet names the same cue**

Old text:

```text
  true. If Shift is not delivered on pointer-up the
  FSM emits add-node; record BLOCKED naming that.
```

New text:

```text
  true. If Shift is not delivered, the preview shows a
  ghost "New State" card, not a bezier; a release off a
  node then emits add-node, one over a node adds
  nothing. Record BLOCKED naming that.
```

- [ ] **Step 5: Check the Pin, the case, the cue, and the cites**

```bash
grep -n -A1 'naming that\.$' TEST-PLAN.md | grep -F "Pin: tests/flow-cycle-edges.test.ts 'a back-edge to"
grep -c '\*\*AA32\*\*' TEST-PLAN.md
grep -nF 'New State</text>' web-app/app/flow-graph.ts
git diff -U0 TEST-PLAN.md | grep '^-' | grep -c 'Pin:'
git diff -U0 TEST-PLAN.md | grep '^+' | grep -E '\.(ts|md|html|css):[0-9]'
```

Expected: one hit (AA32's Pin follows its new last line); `1`;
one hit, the ghost node's `New State</text>` in `flow-graph.ts`;
`0` removed Pin lines; no output from the last. Any mismatch:
STOP and report.

- [ ] **Step 6: Gate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: `ok | 4141 passed | 0 failed | 11 ignored`, timezone
`ok | 8 passed | 0 failed`, exit 0.

- [ ] **Step 7: Commit**

```bash
git diff --stat
git add TEST-PLAN.md
git commit -F - <<'EOF'
Aim AA32's drop and fix its BLOCKED cue

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018uFFAapWhN6H85dJyVj5cm
EOF
```

Expected `--stat`: `TEST-PLAN.md` only.

---

## Task 7: Drive C6's scroll by script

**Commit subject:** `Drive C6's scroll by script`

Commandments: Clarity, Logic, Reliability (a scripted
scroll must not pass a page a person's wheel could
not move). Abominations: Test Weakening (keep the
`overflow-y` clause), Unbidden Helper Code (C6's Pin
stays).

**Files:**
- Modify: `TEST-PLAN.md` (C6's first line; its Pin
  kept)

**Interfaces:**
- Consumes: nothing.
- Produces: C6's text, which Task 9e tightens.

- [ ] **Step 1: Confirm the anchor**

```bash
grep -cF '- [ ] **C6** Scroll the page. PASS: sidebar stays fixed, main content scrolls independently.' TEST-PLAN.md
```

Expected: `1`.

- [ ] **Step 2: Edit 7a — replace C6's first line**

Old text (one line; the Pin lines after it stay):

```text
- [ ] **C6** Scroll the page. PASS: sidebar stays fixed, main content scrolls independently.
```

New text:

```text
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

- [ ] **Step 3: Check the Pin and the clause**

```bash
grep -n -A2 '`window.scrollTo(0, 0)`\.$' TEST-PLAN.md
grep -c 'neither `html` nor `body` computes `overflow-y:' TEST-PLAN.md
git diff -U0 TEST-PLAN.md | grep '^+' | grep -E '\.(ts|md|html|css):[0-9]'
```

Expected: the two lines after the new text are
`  Pin: exploratory — the sidebar's fixed position`
and `       while the main content scrolls`; `1`; no
output.

- [ ] **Step 4: Gate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: `ok | 4141 passed | 0 failed | 11 ignored`,
timezone `ok | 8 passed | 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git diff --stat
git add TEST-PLAN.md
git commit -F - <<'EOF'
Drive C6's scroll by script

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014jFgSaA7ABoNqEDzB6WGmu
EOF
```

Expected `--stat`: `TEST-PLAN.md` only.

---

## Task 8: Close 0a's walk recipes

**Commit subject:** `Close 0a's walk recipes`

Commandments: Clarity, Uniformity. Abominations:
Obscurity, Unbidden Helper Code (0c's "after 0a and
0b" stays: an item's number is its name, and it
outlives the item).

Close protocol: remove 0a's bullet. No pin flips, no
code comment names it, and it closes no KNOWN seam,
so ARCHITECTURE.md and AUDIT.md's `m` hold.

**Files:**
- Modify: `TODO.md` (remove 0a; the intro; `##
  Sequencing`)

**Interfaces:**
- Consumes: Task 3's "Nineteen items".
- Produces: the head of the list (0b), whose plan
  pointer Task 8b names.

- [ ] **Step 1: Confirm the anchors**

```bash
grep -cF '- **0a.** Recipes a hidden, CDP-driven tab can execute' TODO.md
grep -cF 'next walk scores each of the four PASS or FAIL, never' TODO.md
grep -cF 'Nineteen items, in this order — each its own brainstorm' TODO.md
grep -cF 'recipes and moorings and their count (0a–0c); admins' TODO.md
grep -cF '- 0a, 0b → 0c: the count follows the remedies' TODO.md
```

Expected: five `1`s.

- [ ] **Step 2: Edit 8a — remove 0a's bullet**

Old text (0a whole, then 0b's first line, which
stays):

```text
- **0a.** Recipes a hidden, CDP-driven tab can execute
  for AA32, C6, F13, and I22; Task 9 of
  `docs/superpowers/plans/test-plan-walk-2026-10-04.md`
  holds each case's text. AA32: the port is a 5-unit
  circle on the node's widest perimeter gap
  (`web-app/app/flow-graph.ts:220-270`), not its
  right-middle, and a press that misses it starts a
  body-drag or a marquee, so the case aims by selector
  at `[data-connect-port]`'s center, confirmed by
  `document.elementFromPoint`, and drops on the target
  node's `> rect`. C6: the window is the scroller —
  `.main-content` sets no overflow
  (`web-app/app/styles/layout.css:145-151`) and the
  sidebar is fixed — and CDP wheel and key input stall
  on a tab that is not composited, so the case scrolls
  with `window.scrollTo` through `Runtime.evaluate` and
  reads the rects. F13: the double-click aims at the
  node's body (`.flow-node[aria-label="<name>"] > rect`),
  not its label or group, and the case names its Layer
  2 pin, 'a node click under an open panel centers it
  on release (F13)'
  (`tests/browser/canvas-gestures.test.ts:451`). I22: a
  CDP `Fetch` pattern answers the ideas collection GET
  with a 500 — never `/api/authentication/*`, and never
  a 401, which drives refresh instead — so the error
  state and its Try Again are driven live. Oracle: the
  next walk scores each of the four PASS or FAIL, never
  BLOCKED
- **0b.** F37a, R22, and WB22 moored to the product;
```

New text:

```text
- **0b.** F37a, R22, and WB22 moored to the product;
```

- [ ] **Step 3: Edit 8b — the count returns to eighteen**

Old text:

```text
Nineteen items, in this order — each its own brainstorm
```

New text:

```text
Eighteen items, in this order — each its own brainstorm
```

- [ ] **Step 4: Edit 8c — the walk's remaining items**

Old text:

```text
The 0-items finish the release: the walk's remaining
recipes and moorings and their count (0a–0c); admins
```

New text:

```text
The 0-items finish the release: the walk's remaining
moorings and their count (0b–0c); admins
```

- [ ] **Step 5: Edit 8d — Sequencing**

Old text:

```text
- 0a, 0b → 0c: the count follows the remedies
```

New text:

```text
- 0b → 0c: the count follows the moorings
```

- [ ] **Step 6: Check the close**

```bash
grep -n '\b0a\b' TODO.md
grep -n 'items, in this order' TODO.md
grep -n -A1 'the walk'"'"'s remaining$' TODO.md
grep -n 'count follows the' TODO.md
grep -n '^- \*\*0[a-j]\.\*\*' TODO.md
grep -rnE '\b(item|TODO\.md) 0a\b' api client shared server web-app tests bin test deploy *.md
```

Expected: the first prints only 0c's line
(`- **0c.** AT2's count, current: after 0a and 0b,
run`); "Eighteen items"; "moorings and their count
(0b–0c); admins"; `- 0b → 0c: the count follows the
moorings`; items 0b through 0j, in order, with no 0a;
the last prints nothing outside `docs/` (it does not
search `docs/`, whose specs and plans keep their
history).

- [ ] **Step 7: Gate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: `ok | 4141 passed | 0 failed | 11 ignored`,
timezone `ok | 8 passed | 0 failed`, exit 0.

- [ ] **Step 8: Commit**

```bash
git diff --stat
git add TODO.md
git commit -F - <<'EOF'
Close 0a's walk recipes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014jFgSaA7ABoNqEDzB6WGmu
EOF
```

Expected `--stat`: `TODO.md` only.

---

## Task 8b: Name the plan that 0b cites

**Commit subject:** `Name the plan that 0b cites`

Commandments: Clarity, Uniformity.
Abominations: Obscurity (a pointer to nothing was the
defect), Unbidden Helper Code (0c, the intro, `##
Sequencing`, and every other line stay as Task 8 left
them).

**Files:**
- Modify: `TODO.md` (0b's second line)

**Interfaces:**
- Consumes: Task 8's TODO.md, where 0b opens the list, as
  committed in `68ec2560`.
- Produces: 0b's plan pointer; Task 9f gives 0c one too.

- [ ] **Step 1: Confirm the anchors**

```bash
grep -cF '  Task 10 of the same plan holds' TODO.md
grep -cF 'Task 11 of the same plan.' TODO.md
grep -cF 'test-plan-walk-2026-10-04' TODO.md
```

Expected: `1`, `1`, `0`.

- [ ] **Step 2: Edit 8b-1 — 0b names its plan**

Old text:

```text
- **0b.** F37a, R22, and WB22 moored to the product;
  Task 10 of the same plan holds F37a's and R22's text.
```

New text:

```text
- **0b.** F37a, R22, and WB22 moored to the product;
  Task 10 of
  `docs/superpowers/plans/test-plan-walk-2026-10-04.md`
  holds F37a's and R22's text.
```

- [ ] **Step 3: Check the plan exists and 0c still reads back**

```bash
grep -cF 'test-plan-walk-2026-10-04' TODO.md
grep -nE '^### Task (10|11):' docs/superpowers/plans/test-plan-walk-2026-10-04.md
grep -cF 'Task 11 of the same plan.' TODO.md
git diff -U0 TODO.md | grep '^+' | grep -E '\.(ts|md|html|css):[0-9]'
```

Expected: `1`; the two headings, `### Task 10: Moor F37a,
WB18, WB22, R22, SV3` and `### Task 11: Gates and AT2`;
`1`; no output. Any mismatch: STOP and report.

- [ ] **Step 4: Gate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: `ok | 4141 passed | 0 failed | 11 ignored`, timezone
`ok | 8 passed | 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git diff --stat
git add TODO.md
git commit -F - <<'EOF'
Name the plan that 0b cites

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018uFFAapWhN6H85dJyVj5cm
EOF
```

Expected `--stat`: `TODO.md` only.

---

## Task 9b: Tighten I22's fault recipe

**Commit subject:** `Tighten I22's fault recipe`

Commandments: Clarity, Logic, Reliability (an explorer must
  not stall on the paused GET, and must know where to read
  the 200).
Abominations: Test Weakening (I22's PASS clauses, its narrow
  BLOCKED, and its Pin stay as written), Unbidden Helper Code
  (no other case or Scoring line changes), Obscurity.

**Files:**
- Modify: `TEST-PLAN.md` (I22's body, its Pin kept; I22's line
  in `### Scoring`)

**Interfaces:**
- Consumes: Task 4's I22 text and Scoring line, as committed in
  `eb6304b2`.
- Produces: nothing later tasks read.

- [ ] **Step 1: Confirm the anchors**

```bash
grep -cF '401 drives refresh, not the error state. Answer the' TEST-PLAN.md
grep -cF 'answers 200 and `[data-idea-card]` cards replace' TEST-PLAN.md
grep -cF 'message, focus, or re-fetch is FAIL of the' TEST-PLAN.md
```

Expected: three `1`s.

- [ ] **Step 2: Edit 9b-1 — I22 does not wait for load before answering**

Old text:

```text
  401 drives refresh, not the error state. Answer the
  `Fetch.requestPaused` with `Fetch.fulfillRequest`:
```

New text:

```text
  401 drives refresh, not the error state. Do not
  `wait_for_load` before answering. Answer the
  `Fetch.requestPaused` with `Fetch.fulfillRequest`:
```

- [ ] **Step 3: Edit 9b-2 — I22 names where the 200 is read**

Old text:

```text
  box-model center. PASS: a second GET of `…/ideas/`
  answers 200 and `[data-idea-card]` cards replace
  the error state. BLOCKED only if `Fetch.enable` or
  `Fetch.fulfillRequest` itself is refused.
```

New text:

```text
  box-model center. PASS: a second GET of `…/ideas/`
  answers 200 (its `responseStatus` in
  `performance.getEntriesByType('resource')`) and
  `[data-idea-card]` cards replace the error state.
  BLOCKED only if `Fetch.enable` or
  `Fetch.fulfillRequest` itself is refused.
```

- [ ] **Step 4: Edit 9b-3 — Scoring's I22 line counts the cards**

Old text:

```text
I22 with the 500 fulfilled: a missing error state,
message, focus, or re-fetch is FAIL of the
exploratory half. BLOCKED only if `Fetch` itself
refuses.
```

New text:

```text
I22 with the 500 fulfilled: a missing error state,
message, focus, re-fetch, or card replacement is
FAIL of the exploratory half. BLOCKED only if
`Fetch` itself refuses.
```

- [ ] **Step 5: Check the case, its Pin, and the cites**

```bash
grep -c '\*\*I22\*\*' TEST-PLAN.md
grep -n -A1 'is refused\.$' TEST-PLAN.md | grep -F "Pin: tests/loading-states.test.ts 'a rejecting"
git diff -U0 TEST-PLAN.md | grep '^-' | grep -c 'Pin:'
git diff -U0 TEST-PLAN.md | grep '^+' | grep -E '\.(ts|md|html|css):[0-9]'
```

Expected: `1`; one hit (I22's Pin follows its last line); `0` removed
Pin lines; no output from the last. Any mismatch: STOP and report.

- [ ] **Step 6: Gate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: `ok | 4141 passed | 0 failed | 11 ignored`, timezone
`ok | 8 passed | 0 failed`, exit 0.

- [ ] **Step 7: Commit**

```bash
git diff --stat
git add TEST-PLAN.md
git commit -F - <<'EOF'
Tighten I22's fault recipe

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018uFFAapWhN6H85dJyVj5cm
EOF
```

Expected `--stat`: `TEST-PLAN.md` only.

---

## Task 9c: Tighten F13's one-point recipe

**Commit subject:** `Tighten F13's one-point recipe`

Commandments: Clarity, Logic, Reliability (a late second press
  or an unread input must not become a false FAIL).
Abominations: Test Weakening (F13's FAIL-not-BLOCKED sentence
  and its Pin names stay as written), Unbidden Helper Code (no
  other case, bullet, or Scoring line changes), Obscurity.

**Files:**
- Modify: `TEST-PLAN.md` (F13's body; its Pin kept except the last
  parenthetical of its browser-test name)

**Interfaces:**
- Consumes: Task 5b's F13 text, as committed in `296789da`, and
  the F13 lines Task 5 left standing, as committed in
  `93afc52d`.
- Produces: nothing later tasks read.

- [ ] **Step 1: Confirm the anchors**

```bash
grep -cF 'panels have no `#prop-node-name`. Aim before the' TEST-PLAN.md
grep -cF 'pre-press miss is re-aimed, not scored. Then send' TEST-PLAN.md
grep -cF 'them. PASS: after the second press the panel is' TEST-PLAN.md
grep -cF 'open panel centres the clicked node on release' TEST-PLAN.md
```

Expected: four `1`s.

- [ ] **Step 2: Edit 9c-1 — F13 aims before the first press**

Old text:

```text
  panels have no `#prop-node-name`. Aim before the
  press: read the center of
```

New text:

```text
  panels have no `#prop-node-name`. Aim before the
  first press: read the center of
```

- [ ] **Step 3: Edit 9c-2 — F13 says how to re-aim**

Old text:

```text
  `.flow-props-panel` lands on the panel, so a
  pre-press miss is re-aimed, not scored. Then send
```

New text:

```text
  `.flow-props-panel` lands on the panel, so a
  pre-press miss is re-aimed at another regular
  node clear of the panel, not scored. Then send
```

- [ ] **Step 4: Edit 9c-3 — F13 records press times, reads the input's value, and names how re-centring is seen**

Old text:

```text
  inside `DBLCLICK_MS`, never re-reading it between
  them. PASS: after the second press the panel is
  still open, `#prop-node-name` reads the
  double-clicked node's name, and the canvas has
  re-centred on it. A second press that lands off the
```

New text:

```text
  inside `DBLCLICK_MS`, never re-reading it between
  them. Record both press times: a longer gap is
  not a double-click, so it is re-sent, not scored.
  PASS: after the second press the panel is
  still open, `#prop-node-name`'s `value` is the
  double-clicked node's name, and the canvas has
  re-centred on it (its `viewBox`, read per the
  Driving notes). A second press that lands off the
```

- [ ] **Step 5: Edit 9c-4 — F13's Pin says what the browser test decides**

Old text:

```text
       release (F13)' (decides a single click under an
       open panel centres the clicked node on release —
       the move a one-point double-click's second press
```

New text:

```text
       release (F13)' (decides the camera moves when a
       single click under an open panel releases — the
       move a one-point double-click's second press
```

- [ ] **Step 6: Check the case, its Pin, and the cites**

```bash
grep -c '\*\*F13\*\*' TEST-PLAN.md
grep -n -A1 'the gesture was delivered\.$' TEST-PLAN.md | grep -F 'Pin: tests/flow-fsm-scenarios.test.ts'
git diff -U0 TEST-PLAN.md | grep '^-' | grep -c 'Pin:'
git diff -U0 TEST-PLAN.md | grep '^+' | grep -E '\.(ts|md|html|css):[0-9]'
```

Expected: `1`; one hit (F13's Pin follows its last line); `0` removed
Pin lines; no output from the last. Any mismatch: STOP and report.

- [ ] **Step 7: Gate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: `ok | 4141 passed | 0 failed | 11 ignored`, timezone
`ok | 8 passed | 0 failed`, exit 0.

- [ ] **Step 8: Commit**

```bash
git diff --stat
git add TEST-PLAN.md
git commit -F - <<'EOF'
Tighten F13's one-point recipe

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018uFFAapWhN6H85dJyVj5cm
EOF
```

Expected `--stat`: `TEST-PLAN.md` only.

---

## Task 9d: Tighten AA32's Shift-drag recipe

**Commit subject:** `Tighten AA32's Shift-drag recipe`

Commandments: Clarity, Logic, Reliability (a lost Shift is
  BLOCKED, never FAIL; a read before the frame paints must not
  decide), Uniformity ("ghost card" everywhere).
Abominations: Test Weakening (AA32's PASS clauses and its Pin
  stay as written; Scoring's F23 line is not touched),
  Unbidden Helper Code (no other case, bullet, or Scoring
  line changes), Obscurity.

**Files:**
- Modify: `TEST-PLAN.md` (AA32's body, its Pin kept; the Shift-drag
  bullet in `### Driving notes`)

**Interfaces:**
- Consumes: Task 6's AA32 text, as committed in `20beded1`, and
  Task 6b's BLOCKED rule and Shift-drag bullet, as
  committed in `c26d914e`.
- Produces: nothing later tasks read.

- [ ] **Step 1: Confirm the anchors**

```bash
grep -cF '(code `ShiftLeft`, vk 16, modifiers 8);' TEST-PLAN.md
grep -cF '`mouseReleased` (modifiers 8), then `keyUp` Shift.' TEST-PLAN.md
grep -cF 'no `stroke-dasharray` (solid blue, no return path);' TEST-PLAN.md
grep -cF 're-aimed, not scored. BLOCKED only if Shift is not' TEST-PLAN.md
grep -cF 'ghost "New State" card, not a bezier; a release off a' TEST-PLAN.md
```

Expected: five `1`s.

- [ ] **Step 2: Edit 9d-1 — AA32 reads one frame after the last move and names the CDP fields**

Old text:

```text
  Confirm `document.visibilityState === 'visible'`
  (the preview paints under `requestAnimationFrame`).
  Drive: `Input.dispatchKeyEvent` `rawKeyDown` Shift
  (code `ShiftLeft`, vk 16, modifiers 8);
  `mousePressed` at the press point (modifiers 8);
  eight `mouseMoved` steps to the drop point
  (`buttons` 1, modifiers 8). PASS: before release,
```

New text:

```text
  Confirm `document.visibilityState === 'visible'`
  (the preview paints under `requestAnimationFrame`,
  so read the preview one frame after the last move).
  Drive: `Input.dispatchKeyEvent` `rawKeyDown` Shift
  (`key` `Shift`, code `ShiftLeft`, vk 16, modifiers 8);
  `mousePressed` at the press point (`button` `left`,
  `clickCount` 1, modifiers 8); eight `mouseMoved`
  steps to the drop point (`buttons` 1, modifiers 8).
  PASS: before release,
```

- [ ] **Step 3: Edit 9d-2 — AA32 releases at the drop point**

Old text:

```text
  `mouseReleased` (modifiers 8), then `keyUp` Shift.
```

New text:

```text
  `mouseReleased` at the drop point (`button` `left`,
  modifiers 8), then `keyUp` Shift.
```

- [ ] **Step 4: Edit 9d-3 — AA32's Archive leg also rules out the ghost card**

Old text:

```text
  re-aiming both points. PASS: the preview path has
  no `stroke-dasharray` (solid blue, no return path);
  release adds one edge and no node. Rename it
```

New text:

```text
  re-aiming both points. PASS: the preview path has
  no `stroke-dasharray` (solid blue, no return path)
  and no ghost card; release adds one edge and no
  node. Rename it
```

- [ ] **Step 5: Edit 9d-4 — AA32's BLOCKED rule is BLOCKED, not FAIL, and names the probe**

Old text:

```text
  re-aimed, not scored. BLOCKED only if Shift is not
  observed: before release the preview shows a ghost
  "New State" card, not the bezier, naming that.
```

New text:

```text
  re-aimed, not scored. BLOCKED, not FAIL, only if
  Shift is not observed: before release the preview
  layer's text reads "New State" (a ghost card), not
  the bezier, naming that.
```

- [ ] **Step 6: Edit 9d-5 — the Shift-drag bullet names the same probe and the drag minimum**

Old text:

```text
  true. If Shift is not delivered, the preview shows a
  ghost "New State" card, not a bezier; a release off a
  node then emits add-node, one over a node adds
  nothing. Record BLOCKED naming that.
```

New text:

```text
  true. If Shift is not delivered, the preview layer's
  text reads "New State" (a ghost card), not the edge
  bezier; a release off a node, more than 20 canvas
  units (`MIN_DRAG_DISTANCE`) from the node's right-edge
  midpoint, then emits add-node, one over a node adds
  nothing. Record BLOCKED naming that.
```

- [ ] **Step 7: Check the Pin, the case, the cue, and the cites**

```bash
grep -n -A1 'naming that\.$' TEST-PLAN.md | grep -F "Pin: tests/flow-cycle-edges.test.ts 'a back-edge to"
grep -c '\*\*AA32\*\*' TEST-PLAN.md
grep -c 'text reads "New State" (a ghost card)' TEST-PLAN.md
git diff -U0 TEST-PLAN.md | grep -c 'F23 scores'
git diff -U0 TEST-PLAN.md | grep '^-' | grep -c 'Pin:'
git diff -U0 TEST-PLAN.md | grep '^+' | grep -E '\.(ts|md|html|css):[0-9]'
```

Expected: one hit (AA32's Pin follows its last line); `1`; `2` (the
case and the bullet); `0` (Scoring's F23 line is not in the
diff); `0` removed Pin lines; no output from the last. Any mismatch: STOP and report.

- [ ] **Step 8: Gate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: `ok | 4141 passed | 0 failed | 11 ignored`, timezone
`ok | 8 passed | 0 failed`, exit 0.

- [ ] **Step 9: Commit**

```bash
git diff --stat
git add TEST-PLAN.md
git commit -F - <<'EOF'
Tighten AA32's Shift-drag recipe

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018uFFAapWhN6H85dJyVj5cm
EOF
```

Expected `--stat`: `TEST-PLAN.md` only.

---

## Task 9e: Tighten C6's scripted scroll

**Commit subject:** `Tighten C6's scripted scroll`

Commandments: Clarity, Logic, Reliability (a page that cannot
  scroll is BLOCKED, never a false FAIL; `clip` blocks a wheel
  as `hidden` does).
Abominations: Test Weakening (the `overflow-y: hidden` clause
  stays, and `clip` joins it), Unbidden Helper Code (C6's Pin
  stays), Obscurity.

**Files:**
- Modify: `TEST-PLAN.md` (C6's first lines; its Pin kept)

**Interfaces:**
- Consumes: Task 7's C6 text, as committed in `d040ffbc`.
- Produces: nothing later tasks read.

- [ ] **Step 1: Confirm the anchors**

```bash
grep -cF 'scrolls under it. The window is the scroller —' TEST-PLAN.md
grep -cF '`getBoundingClientRect().top` as t, then' TEST-PLAN.md
grep -cF 'neither `html` nor `body` computes `overflow-y:' TEST-PLAN.md
```

Expected: three `1`s.

- [ ] **Step 2: Edit 9e-1 — C6's content scrolls beside the sidebar**

Old text:

```text
  scrolls under it. The window is the scroller —
```

New text:

```text
  scrolls beside it. The window is the scroller —
```

- [ ] **Step 3: Edit 9e-2 — C6 names the element, not two near-homonyms**

Old text:

```text
  with `Runtime.evaluate`: read `#main-content`'s
  `getBoundingClientRect().top` as t, then
```

New text:

```text
  with `Runtime.evaluate`: read
  `<main id="main-content">`'s
  `getBoundingClientRect().top` as t, then
```

- [ ] **Step 4: Edit 9e-3 — C6's overflow guard covers clip, and a page that fits is BLOCKED**

Old text:

```text
  neither `html` nor `body` computes `overflow-y:
  hidden`; `#desktop-sidebar`'s rect `top` is still 0;
  `#main-content`'s rect `top` is t − d. Restore with
  `window.scrollTo(0, 0)`.
```

New text:

```text
  neither `html` nor `body` computes `overflow-y:
  hidden` or `overflow-y: clip`; `#desktop-sidebar`'s
  rect `top` is still 0; `#main-content`'s rect `top`
  is t − d. If d = 0 and `<main id="main-content">`'s
  rect `bottom` is at most `window.innerHeight`, the
  page fits the window: BLOCKED, not FAIL, naming
  that. Restore with `window.scrollTo(0, 0)`.
```

- [ ] **Step 5: Check the Pin and the clause**

```bash
grep -n -A2 '`window.scrollTo(0, 0)`\.$' TEST-PLAN.md
grep -c 'neither `html` nor `body` computes `overflow-y:' TEST-PLAN.md
grep -c 'overflow-y: clip' TEST-PLAN.md
grep -c 'rect `bottom` is at most `window.innerHeight`' TEST-PLAN.md
git diff -U0 TEST-PLAN.md | grep '^+' | grep -E '\.(ts|md|html|css):[0-9]'
```

Expected: the two lines after the new text are
`  Pin: exploratory — the sidebar's fixed position` and
`       while the main content scrolls`; `1`; `1`; `1`; no
output. Any mismatch: STOP and report.

- [ ] **Step 6: Gate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: `ok | 4141 passed | 0 failed | 11 ignored`, timezone
`ok | 8 passed | 0 failed`, exit 0.

- [ ] **Step 7: Commit**

```bash
git diff --stat
git add TEST-PLAN.md
git commit -F - <<'EOF'
Tighten C6's scripted scroll

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018uFFAapWhN6H85dJyVj5cm
EOF
```

Expected `--stat`: `TEST-PLAN.md` only.

---

## Task 9f: Tidy 0j, the intro, and 0c's pointer

**Commit subject:** `Tidy 0j, the intro, and 0c's pointer`

Commandments: Clarity, Uniformity (one spelling inside 0j; each
  bullet names what it cites).
Abominations: Unbidden Helper Code (no other TODO.md line
  changes; 0c's "after 0a and 0b" stays), Obscurity.

**Files:**
- Modify: `TODO.md` (the critical path's intro; 0c; 0j)

**Interfaces:**
- Consumes: Task 3's 0j and intro, as committed in `2f1f8558`,
  and 0c's tail, as the branch base `1e0941c5` carries it.
- Produces: nothing later tasks read.

- [ ] **Step 1: Confirm the anchors**

```bash
grep -cF 'double-click under an open panel (0j). Then what a pilot' TODO.md
grep -cF 'Task 11 of the same plan.' TODO.md
grep -cF 'FLOW-CANVAS.md prescribes the centring, and' TODO.md
grep -cF 'single click still centres while a double-click' TODO.md
grep -cF 'centre-on-release pin still green, and the next walk' TODO.md
```

Expected: five `1`s.

- [ ] **Step 2: Edit 9f-1 — the intro's last then becomes and**

Old text:

```text
and reseed that ships them (0i); then F13's
double-click under an open panel (0j). Then what a pilot
```

New text:

```text
and reseed that ships them (0i); and F13's
double-click under an open panel (0j). Then what a pilot
```

- [ ] **Step 3: Edit 9f-2 — 0c names its plan**

Old text:

```text
  and its main suite's line; Task 11 of the same plan.
  Oracle: AT2 names the latest Layer 2 run's count
```

New text:

```text
  and its main suite's line; Task 11 of
  `docs/superpowers/plans/test-plan-walk-2026-10-04.md`.
  Oracle: AT2 names the latest Layer 2 run's count
```

- [ ] **Step 4: Edit 9f-3 — 0j spells center and centering**

Old text:

```text
  release, centres it (`web-app/flows/detail.ts:1099-1108`;
  FLOW-CANVAS.md prescribes the centring, and
```

New text:

```text
  release, centers it (`web-app/flows/detail.ts:1099-1108`;
  FLOW-CANVAS.md prescribes the centering, and
```

- [ ] **Step 5: Edit 9f-4 — 0j spells centers**

Old text:

```text
  single click still centres while a double-click
```

New text:

```text
  single click still centers while a double-click
```

- [ ] **Step 6: Edit 9f-5 — 0j spells center-on-release**

Old text:

```text
  centre-on-release pin still green, and the next walk
```

New text:

```text
  center-on-release pin still green, and the next walk
```

- [ ] **Step 7: Check the pointers, the spelling, and the intro**

```bash
grep -c 'test-plan-walk-2026-10-04' TODO.md
grep -c 'the same plan' TODO.md
sed -n '/^- \*\*0j\.\*\*/,/^- \*\*4\.\*\*/p' TODO.md | grep -c -E 'centre|centring'
grep -n 'items, in this order' TODO.md
git diff -U0 TODO.md | grep '^[+-]' | grep -E '\.(ts|md|html|css):[0-9]'
```

Expected: `2`; `0`; `0`; "Eighteen items"; exactly two lines from the
last, the old and the new `release, cent… it` line of 0j,
each carrying the unchanged cite `web-app/flows/detail.ts:1099-1108`. Any mismatch: STOP and report.

- [ ] **Step 8: Gate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: `ok | 4141 passed | 0 failed | 11 ignored`, timezone
`ok | 8 passed | 0 failed`, exit 0.

- [ ] **Step 9: Commit**

```bash
git diff --stat
git add TODO.md
git commit -F - <<'EOF'
Tidy 0j, the intro, and 0c's pointer

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018uFFAapWhN6H85dJyVj5cm
EOF
```

Expected `--stat`: `TODO.md` only.

---

## Reviews

### Per-task spec-compliance review (fresh `planner`)

Brief: `Go to Medium Church!`, the voice rules, the
task's commandments and abominations, the AGENTS.md
§ Subagents patterns, this worktree, no `isolation`,
no `./deploy`, `./bin/build`, `./bin/measure`, seed,
or wipe. Then:

- `git show --stat HEAD` touches only the task's
  file; `git log -1 --format=%B` is the exact
  subject, a blank line, the Co-Authored-By trailer,
  and the Claude-Session line, with no body.
- Every added line in `git show HEAD` equals the
  plan's new text and the spec's code block,
  character for character. Every removed line is
  the plan's old text. Nothing else moved.
- Each `file:line` cite in the new text holds at
  HEAD (Task 3: `web-app/flows/detail.ts:1099-1108`,
  `web-app/app/flow-fsm-reduce.ts:97`; Tasks 4–9f add
  none, though 9f's rewritten 0j line keeps the first
  of Task 3's).
- The Review Focus lines the task touches hold.

### Per-task quality review (fresh `planner`)

Same brief. Then read the changed region in context:
list nesting and continuation indent render as the
neighbouring cases do; the case still starts
`- [ ] **ID**` so `caseBlock` in
`tests/test-plan-apple-menu.test.ts` finds it; the
drive is executable by a CDP explorer as written;
no paraphrase crept into TEST-PLAN.md or TODO.md;
`./test validate` was run before the commit with the
baseline counts. A finding that the spec itself is
wrong is reported, not fixed.

### Whole-branch review (fresh `architect`, after Task 9f)

Same brief. Review `git log --oneline 1e0941c5..HEAD`
and `git diff 1e0941c5..HEAD` against the spec:

- Twenty commits, in the spec's `## Sequence` order,
  each subject exact: "Specify the 0a walk recipes",
  "Plan the 0a walk recipes", "File F13's one-point
  double-click as 0j", "Force I22's fault with
  Fetch", "Drive F13 at one point as a person does",
  "Amend the 0a spec and plan to aim F13", "Aim F13
  clear of the properties panel", "Aim AA32's
  Shift-drag at the port", "Amend the 0a spec and plan
  to aim AA32", "Aim AA32's drop and fix its BLOCKED
  cue", "Drive C6's scroll by script", "Close 0a's
  walk recipes", "Amend the 0a spec and plan to name
  0b's plan", "Name the plan that 0b cites", "Amend
  the 0a spec and plan for the Minor notes", "Tighten
  I22's fault recipe", "Tighten F13's one-point
  recipe", "Tighten AA32's Shift-drag recipe",
  "Tighten C6's scripted scroll", "Tidy 0j, the
  intro, and 0c's pointer".
- Every spec code block lands verbatim, as the
  amendments left it; F11 reads "every later
  double-click in F uses the same drive; F13 names its
  own".
- All eleven Review Focus lines hold at HEAD.
- `## Summary` is unchanged by the diff.
- The spec and this plan changed four times after
  commit 2, in commits 5a, 6a, 8a, and 9a (`git log
  --oneline 5cccaa60..HEAD -- <both paths>` lists only
  them), and
  `docs/superpowers/plans/test-plan-walk-2026-10-04.md`
  is unchanged since `8fb66783`
  (`git diff 8fb66783..HEAD -- <it>` is empty).
- `./test validate` at HEAD gives the baseline lines.

---

## Hand-back (orchestrator)

- [ ] **Step 1: Final gate at the tip**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
git status --short
git log --oneline 1e0941c5..HEAD
./test validate
```

Expected: a clean tree; twenty commits; `ok | 4141
passed | 0 failed | 11 ignored` and timezone
`ok | 8 passed | 0 failed`.

- [ ] **Step 2: Report and stop**

Report to the owner: the tip SHA, both gate lines,
and the architect's verdict. Do not rebase, merge,
or land. Landing waits on `todo-triage`, and it is
the owner's call.

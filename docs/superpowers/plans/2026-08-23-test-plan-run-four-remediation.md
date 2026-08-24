# Test-Plan Run Four Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Remediate the five FAIL clusters and three DRIFT
candidates from the 2026-08-23 TEST-PLAN run — layout
column covenants, the two-camera stomp, unbound debounced
edits, keyboard focus/selection/chords, the missing Record
archive control, the R21/A3 seed gaps, the composed-edit
ACL reset — correct TEST-PLAN drift, and make `TODO.md`
the single gated home for later work.

**Architecture:** Twenty-four tasks, one commit each
(~24 commits), executed by one implementer subagent at a
time in dependency order on the main checkout (no
worktrees, no branches — master only, linear history).
Code changes ride TDD (red pin → fix → green); doc-wording
changes ride the commit of the change that makes them
true; drift-only doc changes are one commit (Task 19).

**Tech Stack:** TypeScript ES2024 strict (`node
--strip-types`), `node:test` on the memory backend, no
frameworks. Gate: `./validate` (tsc, two-TZ test passes,
78-char lint, `org` ban, retired-vocab lint, doc
line-count ceilings, SVG/API doc drift checks).

**Spec:**
`docs/superpowers/specs/2026-08-23-test-plan-run-four-remediation-design.md`
— the binding authority; this plan argues from it.
Conflicts resolve against the spec, then against the
Rulings section below (which records where this plan
already resolved a spec ambiguity).

## Global Constraints

Copied from the spec and AGENTS.md; every task's
requirements include these.

- **Base:** master at `c1b89a8a` (the spec commit). Work
  directly on master; never branch, never merge, never
  push. Rebase-and-fast-forward discipline is moot for
  linear local commits — just never create a merge.
- **One concern per commit.** Subject ≈50 chars,
  present-tense imperative, no body prose. Every commit
  message ends with exactly these two trailer lines:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  and `Claude-Session: <executing session URL>` (this
  session:
  `https://claude.ai/code/session_01D9eFhFk4BgVzRLceGqQNY3`).
- **`./validate` green after every commit.** It aborts
  the task on red — fix before committing. It works on a
  dirty tree, so run it BEFORE `git commit`.
- **Voice:** 78-char max lines in every file `./validate`
  lints (all `*.ts`, `*.html`, `*.css` under `api/`,
  `web-app/`, `tests/`, `shared/`, `server/`, and every
  root `*.md` except `TEST-PLAN.md`); 4-space indent; no
  trailing whitespace; final newline. No `org`
  abbreviation in identifiers — always `organization`.
- **Tests:** red before green where the spec says red;
  never weaken an existing assertion. Single-file run:
  `TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \`
  `node --strip-types --import ./tests/hmac-test-key.ts \`
  `--test tests/<file>.test.ts`
  Full suite: `./test`. `tsc` does NOT type-check
  `tests/` (the tsconfig include stops at `web-app/`,
  `api/`, `shared/`), so "red today" for a changed arity
  means red at RUNTIME under `--strip-types`.
- **Counts that move exactly once:**
  `EXPECTED_SLICE_MESSAGE_PAIRS` 499 → 507 (Task 16,
  nowhere else). TEST-PLAN browser total 398 → 401 and
  F. Tools 77 → 80 (Task 19). **Never touch**
  `EXPECTED_MESSAGE_PAIR_COUNT = 1448` or
  `PROJECT_GARDEN`.
- **Never edit** dated specs or plans under
  `docs/superpowers/` (AUDIT.md:42-44) — including the
  spec this plan implements. Exception: Task 24 deletes
  the five files under
  `docs/superpowers/test-plan-mitigations/` (mandated by
  the spec's §11).
- **This plan file stays untracked** (spec §11): never
  `git add docs/superpowers/plans/2026-08-23-test-plan-`
  `run-four-remediation.md`. While it sits untracked,
  `./build` / `./serve` refuse (dirty-tree check) — that
  is expected; no task in this plan builds.
- **Spec non-goals — do not do these:** no corner
  placement or coordinate changes in layout; no FSM
  routing of the toolbar zoom buttons; no two-way
  selection seam; no record reactivate control,
  transition table, or archived-binding guard; no roles
  in the composed write body (validator key set
  unchanged); no full-width Objectives card; no
  `## KNOWN seams` / `## Do not resurrect` moves out of
  ARCHITECTURE.md; no stale-history comment cleanup.

## Dependency graph

### Tasks

| # | Task (spec §) | Primary files | Model |
|---|---|---|---|
| 1 | Layout: Create heads, Archive ends (§1) | flow-layout.ts, its tests, TEST-PLAN | sonnet |
| 2 | Gesture context carries interaction (§2) | flow-interactions.ts, flow-designer.ts, FLOW-CANVAS | sonnet |
| 3 | withCanvasSize fits only under Auto Fit (§2) | flow-designer.ts, flows/detail.ts, TEST-PLAN | sonnet |
| 4 | Drop bindInteractions state param (§2) | flow-interactions.ts, flows/detail.ts | haiku |
| 5 | Bind debounced edits to their ids (§3) | flows/detail.ts, flow-designer.ts, TEST-PLAN | sonnet |
| 6 | update() renders the flushed presenter (§3) | flows/detail.ts | haiku |
| 7 | Pin canvas-key-activate (§4.1) | tests/flow-fsm-reduce.test.ts | haiku |
| 8 | reduceDesignerShortcut (§4.2) | flows/detail.ts, new test | sonnet |
| 9 | canvas-focus FSM input (§4.3) | flow-fsm-types.ts, flow-fsm-reduce.ts, tests | sonnet |
| 10 | Focus capture/restore across rebuilds (§4.4) | flows/detail.ts, new test | sonnet |
| 11 | focusin promotes to selection (§4.5) | flow-interactions.ts | sonnet |
| 12 | Space defers to the activated item (§4.6) | flow-interactions.ts | haiku |
| 13 | Document keyboard selection (§4.7) | TEST-PLAN, FLOW-CANVAS | sonnet |
| 14 | Archive button on record detail (§5) | presenters/record-detail.ts, new test | sonnet |
| 15 | Archive dialog and wiring (§5) | records/detail.html, records/detail.ts | sonnet |
| 16 | R seed: member seat + ACL subject (§6) | api/test-plan-slices.ts, tests, TEST-PLAN | opus |
| 17 | Composed edit carries ACLs forward (§7) | api/routes.ts, its test | sonnet |
| 18 | G reveal prints erasable_* (§8) | server/seed.ts, tests/pg-seed.test.ts | haiku |
| 19 | TEST-PLAN drift + CSS pin (§9) | TEST-PLAN.md, new test | sonnet |
| 20 | TODO.md move (§10a) | TODO.md, ARCHITECTURE.md | haiku |
| 21 | Doc-router pointers (§10b) | AGENTS.md, README.md, TODO.md | sonnet |
| 22 | TODO critical path + sequencing (§10c) | TODO.md | opus |
| 23 | Later-work gate in validate (§10d) | validate | sonnet |
| 24 | Remove absorbed stubs (§11) | docs/superpowers/test-plan-mitigations/ | haiku |

### Edges

Legend: **S** = semantic (output consumed / correctness
order), **F** = file collision (same file, serialize),
**O** = spec's commit order (history readability; soft).

```
2 →3 (F: flow-designer.ts, its test file; O)
2 →4 (S: the param is redundant only after 2)
3 →4 (F: flows/detail.ts)
4 →5 (F: flows/detail.ts, flow-designer.ts)
5 →6 (S: 6 renders what 5's flush now applies)
6 →8 (F: flows/detail.ts)
7 →9 (F: tests/flow-fsm-reduce.test.ts; O)
8 →10 (F: flows/detail.ts)
6 →10 (S: both reshape update())
9 →11 (S: the input kind must exist to dispatch)
10→11 (S: spec MUST — promotion without restore drops
       every Tab to the document top)
4 →11 (F: flow-interactions.ts)
11→12 (F: flow-interactions.ts; O)
12→13 (S: 13 documents 8–12's behavior)
8 →13 (S: F39 copy describes the reducer)
2 →13 (F: FLOW-CANVAS.md)
14→15 (S: the dialog serves 14's button)
1 →19, 3→19, 5→19, 16→19 (F: TEST-PLAN.md)
13→19 (S: the Summary counts 13's new cases)
15→19 (S: R15 copy describes the shipped control)
16→18 (F: tests/pg-seed.test.ts; O)
20→21 (S: pointers name the file 20 creates)
21→22 (F: TODO.md)
19→22 (S: 22 re-derives file:line refs against the
       post-churn tree)
20→23, 21→23, 22→23 (S: the gate asserts their output)
22→24 (S: TODO item 5 names the absorption first)
```

### Waves (levelization over S+F edges)

Execution is SEQUENTIAL — one implementer at a time (the
subagent-driven-development rule: never dispatch parallel
implementers; and AGENTS.md forbids worktrees, so there is
exactly one working tree). The waves state ORDERING
FREEDOM, not concurrency: tasks in the same wave touch
disjoint files and may run in any order; when a task
stalls in a fix loop, pick any other unblocked task
instead of waiting.

| Wave | Tasks |
|---|---|
| A | 1, 2, 7, 14, 16, 17, 20 |
| B | 3, 9, 15, 18, 21 |
| C | 4 |
| D | 5 |
| E | 6 |
| F | 8 |
| G | 10 |
| H | 11 |
| I | 12 |
| J | 13 |
| K | 19 |
| L | 22 |
| M | 23, 24 |

The default order (1, 2, 3, … 24) is one valid
topological sort and matches the spec's Commits section —
use it unless a stall forces a detour. Stall fallbacks
from the canvas chain (2–13): Tasks 1, 14→15, 16→18, 17,
20→21 are always safe detours.

### Execution protocol

1. Follow superpowers:subagent-driven-development: ledger
   at the plan workspace, task briefs via
   `scripts/task-brief`, fresh implementer per task, task
   review (spec + quality) per task, scoped re-reviews,
   final whole-branch review (model: opus) over
   `c1b89a8a..HEAD`.
2. One implementer at a time. Reviews may overlap the
   NEXT task's dispatch only if the reviewed task's
   commit is already on master and the next task does not
   touch the same files (the graph above answers that).
3. Each task ends: `./validate` green → commit with the
   task's message + trailers → ledger line.
4. Doc-only tasks (13, 19, 20, 21, 22, 24) still run
   `./validate` — the line-count, lint, and vocabulary
   gates bite on docs.

## Subagent briefing (repo law — read before dispatching)

Every implementer AND reviewer dispatch prompt MUST begin
with the literal phrase `Go to Medium Church!` — it loads
the church-of-code skill's Medium scroll in the
subagent's session. A subagent unproselytized is a
heathen given a hammer. After the invocation, the
dispatch pushes down what the scripture cannot know:

- **Voice:** 78-char max line, 4-space indent, no inline
  styles (CSS custom properties + classes), present-tense
  imperative ~50-char commit subject, the two trailer
  lines from Global Constraints.
- **Commandments touched:** name them per task (each
  task's brief carries a "Doctrine" line).
- **Abominations risked:** name them per task (same
  line).
- **Patterns to match:** RequestContext as the first
  argument to adapter calls; SafeHtml from presenters
  (`html` tagged templates / `trusted`); snake_case wire,
  camelCase domain; HTTP-verb adapter naming
  (`getNoun` / `putNoun` / `postNounOperation`);
  validators at the gate, never downstream; transaction
  bodies await only row ops; `noUncheckedIndexedAccess`
  (index access needs `!` or a guard);
  `noUnusedLocals` / `noUnusedParameters` are ON.
- **Report contract:** per the SDD implementer template
  (report file + short status message). Implementers
  never dispatch subagents.

## Rulings baked into this plan

Recorded here so executors do not re-litigate; each is
reviewable in the diff it shapes.

1. **Known-MCP bullet ownership.** The spec lists the
   three Known-MCP bullets under §2, §4.7, AND §9. Single
   owner each: the `<svg>`-replaced bullet lands in
   Task 3 (with F29), the chord-`key` and
   `focus()`-selects bullets in Task 13. Task 19 verifies
   all three exist and adds any missing.
2. **Presenter `#needsFit` is deleted.** "Fits only when
   `isAutoFit`" makes the field unread; leaving it would
   be dead state. Consequence (spec-consistent): a flow
   loaded with Auto Fit OFF starts at zoom 1 centered on
   the origin (auto-layout output is origin-centered)
   instead of a one-time fit. "onFlowLoaded keeps its
   explicit first fit" = its existing
   `withCanvasSize` → `withLayoutReconciled` →
   `reconcileFitFromDom` sequence is untouched.
3. **`handleArchive()` takes no parameter.** The spec
   writes `handleArchive(root)`, but the body never uses
   `root` (no `load(root)` — the subscriber re-renders)
   and `noUnusedParameters` would reject it.
4. **The §10d gate carves out pointer rows.** The spec
   mandates AGENTS.md/README.md rows containing the words
   "later work" AND a gate rejecting "later work" in root
   docs. Resolution: the gate pipes findings through
   `grep -v 'TODO.md'` — a line pointing AT the home is
   not deferral prose (the retired-vocab block's own
   `grep -v 'in-browser ZIP'` precedent).
5. **`update()` loses its `presenter` parameter in
   Task 6.** Rendering `pageState.presenter()` makes the
   argument a lie and `noUnusedParameters` rejects it;
   both call sites shrink in the same commit.
6. **Line refs inside TODO.md content (Task 22) are
   re-derived at execution time** for files this plan
   touches; refs into untouched files keep the spec's
   numbers. Task 22 carries the anchor table.
7. **§3's presenter pins live in
   `tests/flow-designer-presenter.test.ts`** as the spec
   says: verified empirically that the save path's
   rejection is pre-absorbed by `enqueueFlowSave`'s
   chain handler, so no facade setup is needed and no
   unhandled rejection escapes.
8. **The eleven-undo depth pin asserts 201 + name per
   step** and `genesis` on the eleventh — the undo route
   returns 201 for every replayed restore including the
   genesis document; 204 is reserved for undoing past
   genesis (existing exhaustion test).

---

### Task 1: Layout — Create heads its column, Archive ends its (§1)

**Doctrine:** Commandments I (Reliability), IV (Logic);
risks the Sin of Test Weakening (never touch the existing
21 layout tests) and Premature Generalization (mirror
`placeArchiveLast`'s ten-line shape exactly; no generic
"pin node at index" helper).

**Files:**
- Modify: `web-app/app/flow-layout.ts` (call site ~:164,
  new function beside `placeArchiveLast` ~:262)
- Test: `tests/flow-layout.test.ts` (append four cases)
- Test: `tests/adapters-flow-queries.test.ts` (append one
  green guard beside the `:495-521` Layout Test case)
- Modify: `TEST-PLAN.md` F17 (~:1215-1221) and F18
  (~:1222-1226)

**Interfaces:**
- Consumes: `placeArchiveLast(layers, nodes)`,
  `reduceCrossings(...)`, the `lin()` test helper
  (`tests/flow-layout.test.ts:127-136`),
  `seededMockDb()` + `getFlowGraph` +
  `LAYOUT_TEST_FLOW_ID = 'DDUhYDIRInXtIrRraxcyHQ'`
  (`tests/adapters-flow-queries.test.ts`).
- Produces: `placeCreateFirst(layers, nodes): Layers`
  (module-private; order-only, moves no pixels). No later
  task consumes it.

- [ ] **Step 1: Write the four red pins**

Append to `tests/flow-layout.test.ts` (after the last
test). `columnOf` is in-test, not exported:

```ts
function columnOf(
    positions: Map<string, { x: number; y: number }>,
    id: string,
): string[] {
    const x = positions.get(id)!.x;
    return [...positions.entries()]
        .filter(([, p]) => Math.abs(p.x - x) < 0.5)
        .toSorted((a, b) => a[1].y - b[1].y)
        .map(([memberId]) => memberId);
}

function edge(fromId: string, toId: string) {
    return { fromId, toId, labelWidth: 0 };
}

test(
    'computeLayout: Create heads its column when an'
    + ' orphan precedes it in input order',
    () => {
        const r = computeLayout({
            nodes: [
                lin('o'),
                lin('s', { start: true }),
                lin('a'),
                lin('z', { complete: true }),
            ],
            edges: [edge('s', 'a'), edge('a', 'z')],
            canvasWidth: 0, canvasHeight: 0,
        });
        assert.equal(
            columnOf(r.positions, 's')[0], 's',
            'Create heads its column',
        );
    },
);

test(
    'computeLayout: Create heads its column beside a'
    + ' second root, and Archive ends its',
    () => {
        const r = computeLayout({
            nodes: [
                lin('r'),
                lin('s', { start: true }),
                lin('a'),
                lin('x'),
                lin('d'),
                lin('z', { complete: true }),
            ],
            edges: [
                edge('r', 'x'), edge('x', 'd'),
                edge('s', 'a'), edge('a', 'z'),
            ],
            canvasWidth: 0, canvasHeight: 0,
        });
        assert.equal(
            columnOf(r.positions, 's')[0], 's',
            'Create heads its column',
        );
        assert.equal(
            columnOf(r.positions, 'z').at(-1), 'z',
            'Archive ends its column',
        );
    },
);

test(
    'computeLayout: Archive ends its column when the'
    + ' relative mirror would fire',
    () => {
        const r = computeLayout({
            nodes: [
                lin('r'),
                lin('s', { start: true }),
                lin('x'),
                lin('a1'),
                lin('a2'),
                lin('m'),
                lin('z', { complete: true }),
            ],
            edges: [
                edge('r', 'x'), edge('x', 'm'),
                edge('s', 'a1'), edge('a1', 'z'),
                edge('s', 'a2'),
            ],
            canvasWidth: 0, canvasHeight: 0,
        });
        assert.equal(
            columnOf(r.positions, 'z').at(-1), 'z',
            'Archive ends its column under the mirror',
        );
    },
);

test(
    'computeLayout: a wrapped chain keeps Create'
    + ' leftmost past an orphan',
    () => {
        const r = computeLayout({
            nodes: [
                lin('o'),
                lin('s', { start: true }),
                lin('a'),
                lin('b'),
                lin('c'),
                lin('d'),
                lin('z', { complete: true }),
            ],
            edges: [
                edge('s', 'a'), edge('a', 'b'),
                edge('b', 'c'), edge('c', 'd'),
                edge('d', 'z'),
            ],
            canvasWidth: 1400, canvasHeight: 740,
        });
        let minX = Infinity;
        for (const p of r.positions.values()) {
            if (p.x < minX) minX = p.x;
        }
        assert.equal(
            r.positions.get('s')!.x, minX,
            'Create leads the serpentine',
        );
    },
);
```

- [ ] **Step 2: Run the layout tests — expect exactly the
  four new cases red**

Run: `TZ=UTC JWT_HMAC_SIGNING_KEY=test-hmac-signing-key \`
`node --strip-types --import ./tests/hmac-test-key.ts \`
`--test tests/flow-layout.test.ts`
Expected: 21 pass, 4 fail — verified failures today:
case 1 head is `'o'`, case 2 head is `'r'`, case 3 tail
is `'m'` (z sits at y −32 vs m at 228), case 4 Create at
x −190 while the orphan holds −410.

- [ ] **Step 3: Implement `placeCreateFirst`**

In `web-app/app/flow-layout.ts`, directly above
`placeArchiveLast` (~:262), the same ten-line shape:

```ts
// Create is the root; ordering it first within its
// (first) layer heads the leftmost column, so the
// mirror's `sp.y > ep.y` no longer arises where a
// column has mates. This shapes the order the
// coordinate pass consumes; it moves no final pixels.
function placeCreateFirst(
    layers: Layers,
    nodes: readonly LayoutInput[],
): Layers {
    const create = nodes.find(n => n.isCreate);
    if (!create) return layers;
    return layers.map(layer => {
        if (!layer.includes(create.id)) return layer;
        return [
            create.id,
            ...layer.filter(id => id !== create.id),
        ];
    });
}
```

Change the call at ~:164-166 from

```ts
    const ordered = placeArchiveLast(
        reduceCrossings(aug.layers, aug.edges), nodes,
    );
```

to

```ts
    const ordered = placeArchiveLast(
        placeCreateFirst(
            reduceCrossings(aug.layers, aug.edges),
            nodes,
        ),
        nodes,
    );
```

Touch NOTHING else: no coordinates, no `fitToCanvas`, no
snake, no caller. (Fuzz evidence from the spec: 0/2963
Create-first misses, 0/1817 Archive-last misses, zero
mirror firings after this change.)

- [ ] **Step 4: Run the layout tests — all green**

Same command as Step 2. Expected: 25/25 pass (the
existing 21 stay green — verified against a patched
scratch copy during planning).

- [ ] **Step 5: Add the green Layout Test guard**

Append to `tests/adapters-flow-queries.test.ts`, beside
the `getFlowGraph lays out an auto-layout flow` case
(which already imports `seededMockDb`, `getFlowGraph`,
`createRequestContext`, `organizationToken`, and defines
`LAYOUT_TEST_FLOW_ID`):

```ts
test(
    'the Layout Test flow keeps the ruled covenant:'
    + ' Create min x, Archive max x, inside the y range',
    async () => {
        const db = await seededMockDb();
        const g = await getFlowGraph(
            createRequestContext(
                db, await organizationToken(),
            ),
            LAYOUT_TEST_FLOW_ID,
        );
        const xs = g.nodes.map(n => n.positionX);
        const ys = g.nodes.map(n => n.positionY);
        const start = g.nodes.find(n => n.isCreate)!;
        const end = g.nodes.find(n => n.isArchive)!;
        assert.equal(
            start.positionX, Math.min(...xs),
            'Create at min x',
        );
        assert.equal(
            end.positionX, Math.max(...xs),
            'Archive at max x',
        );
        assert.ok(
            start.positionY <= end.positionY,
            'Create never below Archive',
        );
        assert.ok(
            start.positionY > Math.min(...ys)
            || end.positionY < Math.max(...ys),
            'on a fan the pair sits inside the y range,'
            + ' not pinned to the corners',
        );
    },
);
```

Run: the single-file command against
`tests/adapters-flow-queries.test.ts`. Expected: green
before AND after Step 3 (run it once now to prove green —
if red, STOP and report; the guard is wrong, not the
tree).

- [ ] **Step 6: Reword TEST-PLAN F17 and F18**

In `TEST-PLAN.md`, replace the F17 case:

```
- [ ] **F17** Drag the start node. PASS: it moves
  freely like any standard node (start and
  complete nodes are both draggable; Auto Layout
  restores them to upper-left and lower-right
  respectively when invoked). Clicking the start
  node's port still initiates a drag-from-start
  to create a new state.
```

with:

```
- [ ] **F17** Drag the start node. PASS: it moves
  freely like any standard node (start and
  complete nodes are both draggable; with Auto
  Layout on, the drop re-lays out — Create
  returns to the head of the first column,
  Archive to the foot of the last). Clicking
  the start node's port still initiates a
  drag-from-start to create a new state.
```

Replace the F18 case:

```
- [ ] **F18** Toggle the Auto Layout header
  switch. PASS:
  all nodes reposition based on their rank from
  start. Create is placed top-left, Archive
  bottom-right, others arranged by graph depth.
```

with:

```
- [ ] **F18** Toggle the Auto Layout header
  switch twice (the seed starts ON — the first
  toggle turns it off and moves nothing). PASS:
  all nodes reposition by rank from start — one
  column per rank (one row per rank when the
  graph is taller than wide), others by graph
  depth. Create heads the first column and
  Archive ends the last — never above or below
  a column-mate; the covenant is the columns,
  not the corners. On a fan (Layout Test) both
  sit mid-height. A long chain wraps into a
  serpentine (Customer Onboarding,
  Lead-to-Close): Create leads the top row and
  Archive ends the last — bottom-left on an
  even row count.
```

- [ ] **Step 7: Validate and commit**

Run: `./validate` — expect green.

```bash
git add web-app/app/flow-layout.ts \
    tests/flow-layout.test.ts \
    tests/adapters-flow-queries.test.ts TEST-PLAN.md
git commit -m "Head Create's column in the auto layout"
```

(Trailer lines per Global Constraints — every commit in
this plan; not restated again.)

### Task 2: Camera — the gesture context carries the committed interaction (§2)

**Doctrine:** Commandments I, VI (Immutability — the FSM
still reduces immutably; the page pushes a NEW committed
state, no shared mutable state); risks the Sin of
Scattered Context (the camera lived in two places — this
task rejoins the baton).

**Files:**
- Modify: `web-app/app/flow-interactions.ts`
  (`FlowGestureContext` ~:60-63, `currentState` ~:352,
  the returned push closure ~:752-755)
- Modify: `web-app/app/presenters/flow-designer.ts`
  (`buildGestureContext` ~:333-341)
- Test: `tests/flow-designer-presenter.test.ts` (two
  cases after `buildPresenterWithNodes`)
- Modify: `FLOW-CANVAS.md` `## The FSM seam`

**Interfaces:**
- Consumes: `InteractionState`
  (`flow-interactions.ts:160-170`), `isGestureActive`
  (`flow-fsm-reduce.ts:666-673`, already imported by
  flow-interactions.ts), `buildPresenterWithNodes(bool)`
  (`tests/flow-designer-presenter.test.ts:133-151`).
- Produces: `FlowGestureContext.interaction:
  InteractionState` — Task 4 initializes `currentState`
  from it; the page's existing
  `update()` → `pushGestureContext(buildGestureContext())`
  needs NO page change (it already pushes after every
  commit).

- [ ] **Step 1: Write the red pin**

Append to `tests/flow-designer-presenter.test.ts`:

```ts
test(
    'buildGestureContext carries the committed'
    + ' interaction (the FSM reduces from it)',
    () => {
        const presenter =
            buildPresenterWithNodes(false);
        const zoomed = presenter.withZoomedIn();
        assert.notEqual(
            zoomed.interaction.zoom,
            presenter.snapshot().interaction.zoom,
        );
        const next = new FlowDesignerPresenter(
            zoomed, 1200, 800,
            buildFlowHistorySnapshot(false),
        );
        assert.equal(
            next.buildGestureContext().interaction,
            zoomed.interaction,
        );
    },
);
```

- [ ] **Step 2: Run — expect the new case red**

Run the single-file command against
`tests/flow-designer-presenter.test.ts`.
Expected: the new case fails (`interaction` is
`undefined` on today's two-field context); every existing
case passes.

- [ ] **Step 3: Write the green companion pin**

Append (this one passes before AND after — it pins the
zoom math the F29 case narrates):

```ts
test(
    'withZoomedIn steps +0.1 scaling the viewBox about'
    + ' its center; withZoomedOut reverses it',
    () => {
        const presenter =
            buildPresenterWithNodes(false);
        const before =
            presenter.snapshot().interaction;
        const cx = before.viewBox.x
            + before.viewBox.w / 2;
        const cy = before.viewBox.y
            + before.viewBox.h / 2;
        const zoomed = presenter.withZoomedIn();
        const vb = zoomed.interaction.viewBox;
        const ratio =
            before.zoom / zoomed.interaction.zoom;
        assert.ok(
            Math.abs(zoomed.interaction.zoom - 1.1)
                < 1e-9,
        );
        assert.ok(
            Math.abs(vb.w - before.viewBox.w * ratio)
                < 1e-9,
        );
        assert.ok(
            Math.abs(vb.h - before.viewBox.h * ratio)
                < 1e-9,
        );
        assert.ok(
            Math.abs(vb.x + vb.w / 2 - cx) < 1e-9,
        );
        assert.ok(
            Math.abs(vb.y + vb.h / 2 - cy) < 1e-9,
        );
        const back = new FlowDesignerPresenter(
            zoomed, 1200, 800,
            buildFlowHistorySnapshot(false),
        ).withZoomedOut();
        assert.ok(
            Math.abs(back.interaction.zoom - 1.0)
                < 1e-9,
        );
        assert.ok(
            Math.abs(
                back.interaction.viewBox.w
                    - before.viewBox.w,
            ) < 1e-9,
        );
    },
);
```

Run the file: expect this case green already, the Step 1
case still red.

- [ ] **Step 4: Implement**

`web-app/app/flow-interactions.ts` — the context type
(~:60-63):

```ts
export type FlowGestureContext = Readonly<{
    isAutoFit: boolean;
    isLocked: boolean;
    interaction: InteractionState;
}>;
```

The push closure at the end of `bindInteractions`
(~:752-755) becomes:

```ts
    return (next) => {
        context = next;
        if (!isGestureActive(currentState)) {
            currentState = next.interaction;
        }
    };
```

(The FSM owns the camera during a gesture, the page
between gestures; at a gesture boundary the pushed object
is the FSM's own result, so the assignment is a no-op.
This also retires the stale-selection `.find(…)!` throw
after a delete: the next `pointerdown` reduces from the
committed state whose selection is `none`, so
`buildSelectedPositions` never looks up a deleted id.)

`web-app/app/presenters/flow-designer.ts` —
`buildGestureContext` (~:333-341):

```ts
    buildGestureContext(
    ): FlowGestureContext {
        return {
            isAutoFit:
                this.#snapshot.isAutoFit,
            isLocked:
                this.#snapshot.isLocked,
            interaction:
                this.#snapshot.interaction,
        };
    }
```

- [ ] **Step 5: Run — both new cases green, tsc clean**

Run the single-file command; then
`npx --no-install tsc --noEmit -p web-app/app/tsconfig.json`.
Expected: file all green; tsc clean (the only
construction site of `FlowGestureContext` is the
presenter, already updated; `detail.ts` only forwards the
type).

- [ ] **Step 6: One sentence in FLOW-CANVAS.md**

Extend `## The FSM seam` (whose text ends "…the single
sanctioned seam, no shared mutable state.") with one
sentence:

```
After every commit the page pushes the committed
interaction state back in the gesture context, so a
gesture reduces from the committed camera.
```

- [ ] **Step 7: Validate and commit**

Run `./validate`; expect green.

```bash
git add web-app/app/flow-interactions.ts \
    web-app/app/presenters/flow-designer.ts \
    tests/flow-designer-presenter.test.ts FLOW-CANVAS.md
git commit -m "Reduce gestures from the committed camera"
```

### Task 3: Camera — withCanvasSize fits only under Auto Fit (§2)

**Doctrine:** Commandment VI; slays a Sin of Default
Values cousin (`#needsFit = true` on every construction
was a hidden default that stomped user state); risks the
Sin of Unbidden Helper Code (delete the dead page-level
`#needsFit`; do NOT add a replacement flag).

**Files:**
- Modify: `web-app/app/presenters/flow-designer.ts`
  (`#needsFit` field ~:182/:216, `withCanvasSize`
  ~:1005-1026)
- Modify: `web-app/flows/detail.ts` (delete the
  page-level `#needsFit` ~:160, ~:215-221, and its three
  `setNeedsFit` calls ~:1532, ~:1604, ~:1625)
- Test: `tests/flow-designer-presenter.test.ts` (one red
  case)
- Modify: `TEST-PLAN.md` F29 (~:1293-1298) + one
  Known-MCP bullet

**Interfaces:**
- Consumes: Task 2's `buildPresenterWithNodes(false)` +
  `withZoomedIn` pins.
- Produces: `withCanvasSize(w, h)` semantics — Auto Fit
  ON: re-fit to nodes; OFF: center-rescale preserving
  zoom. `onFlowLoaded`'s
  `withCanvasSize → commit(withLayoutReconciled()) →
  reconcileFitFromDom()` sequence is UNTOUCHED
  (Ruling 2).

- [ ] **Step 1: Write the red pin**

Append to `tests/flow-designer-presenter.test.ts`:

```ts
test(
    'withCanvasSize keeps a non-auto-fit presenter\'s'
    + ' zoom — a resize never re-fits the camera',
    () => {
        const presenter =
            buildPresenterWithNodes(false);
        const zoomed = presenter.withZoomedIn();
        const next = new FlowDesignerPresenter(
            zoomed, 1200, 800,
            buildFlowHistorySnapshot(false),
        );
        const resized = next.withCanvasSize(1000, 700);
        assert.ok(
            Math.abs(resized.interaction.zoom - 1.1)
                < 1e-9,
            'zoom survives the resize',
        );
        assert.ok(
            Math.abs(
                resized.interaction.viewBox.w
                    - 1000 / 1.1,
            ) < 1e-9,
            'viewBox rescales about the center',
        );
    },
);
```

- [ ] **Step 2: Run — expect red**

Run the single-file command. Expected: the new case fails
(today the fresh presenter's `#needsFit` forces
`#applyZoomToFit`, so zoom is the fit value, not 1.1).

- [ ] **Step 3: Implement**

`web-app/app/presenters/flow-designer.ts`:

1. Delete the field declaration `#needsFit: boolean;`
   (~:182) and the constructor line
   `this.#needsFit = true;` (~:216).
2. `withCanvasSize` (~:1005): replace the `#needsFit`
   branch —

```ts
    withCanvasSize(
        w: number, h: number,
    ): FlowSnapshot {
        this.#canvasW = w;
        this.#canvasH = h;
        if (this.#snapshot.isAutoFit) {
            this.#applyZoomToFit(this.#snapshot);
            return this.#snapshot;
        }
        const vb =
            this.#snapshot.interaction
                .viewBox;
        const centerX = vb.x + vb.w / 2;
        const centerY = vb.y + vb.h / 2;
        const z =
            this.#snapshot.interaction.zoom;
        vb.w = w / z;
        vb.h = h / z;
        vb.x = centerX - vb.w / 2;
        vb.y = centerY - vb.h / 2;
        return this.#snapshot;
    }
```

`web-app/flows/detail.ts` — delete the page-level
`#needsFit` (written, never read):

1. Field `#needsFit: boolean = true;` (~:160).
2. Accessors `needsFit()` and `setNeedsFit()`
   (~:215-221).
3. The three call lines `pageState.setNeedsFit(true);`
   (~:1532), `pageState.setNeedsFit(false);` (~:1604),
   `pageState.setNeedsFit(true);` (~:1625) — the lines
   only; their surrounding blocks stay.

- [ ] **Step 4: Run — green; tsc clean**

Run the single-file command (all green including Tasks
1-2's cases), then
`npx --no-install tsc --noEmit -p web-app/app/tsconfig.json`
(clean — `noUnusedLocals` proves nothing else read the
deleted members; `tests/flow-designer-open.test.ts` still
passes because its presenter is auto-fit-false and only
asserts pair counts, not the camera — run `./test` in
Step 6 to prove it).

- [ ] **Step 5: Reword TEST-PLAN F29 and add the
  Known-MCP bullet**

Replace the F29 case (current text):

```
- [ ] **F29** Click the Zoom in and Zoom out
  toolbar controls (icon-only buttons;
  `title` / `aria-label` "Zoom in" / "Zoom out").
  PASS: canvas zooms in and out smoothly.
  Toggle the Auto Fit header switch on. PASS:
  canvas adjusts to show all nodes.
```

with:

```
- [ ] **F29** The seed loads with Auto Fit ON:
  click Zoom in (icon-only buttons; `title` /
  `aria-label` "Zoom in" / "Zoom out") — an
  error toast "Disable Auto-Fit to change the
  view" appears and `viewBox` stands (F7's
  gate). Toggle Auto Fit OFF. Click Zoom in,
  then Zoom out, re-querying `svg.flow-canvas`
  after each click (every commit rebuilds the
  `<svg>`). PASS: `viewBox` width and height
  shrink then restore (zoom steps ±0.1,
  clamped 0.25–2.0). Click the empty canvas
  once — `viewBox` keeps the zoomed value.
  Toggle Auto Fit ON — the canvas re-fits to
  all nodes.
```

In `#### Known MCP limitations`, after the
"**Keyboard events**" bullet, insert:

```
- **The canvas `<svg>` is replaced on every commit**:
  probe `svg.flow-canvas` by fresh query after every
  click, never through a held element reference.
```

- [ ] **Step 6: Validate and commit**

Run `./validate`; expect green.

```bash
git add web-app/app/presenters/flow-designer.ts \
    web-app/flows/detail.ts \
    tests/flow-designer-presenter.test.ts TEST-PLAN.md
git commit -m "Fit on canvas size only under Auto Fit"
```

### Task 4: Camera — drop bindInteractions' redundant state parameter (§2)

**Doctrine:** Commandment V (Clarity — a parameter that
lies about where state comes from); the diff is exactly
the parameter's removal (Article: execute the request,
not the request plus improvements).

**Files:**
- Modify: `web-app/app/flow-interactions.ts`
  (`bindInteractions` signature ~:325-352)
- Modify: `web-app/flows/detail.ts`
  (`bindCanvasInteractions` ~:896-900)

**Interfaces:**
- Consumes: Task 2's `FlowGestureContext.interaction`.
- Produces: `bindInteractions(wrap, onUpdate,
  onPanelRequest, onNodesDragEnd, onEdgeCreated,
  onNodeCreated, getNodePosition, getAllNodes,
  initialContext, signal)` — 10 params, `state` gone.
  Single caller updated in the same commit.

- [ ] **Step 1: Implement**

`web-app/app/flow-interactions.ts`: delete the
`state: InteractionState,` parameter (second position);
change the initialization at ~:352 from
`let currentState: InteractionState = state;` to:

```ts
    let currentState: InteractionState =
        initialContext.interaction;
```

`web-app/flows/detail.ts` (`bindCanvasInteractions`):
delete the two lines

```ts
    const state =
        presenter.interactionState();
```

and remove the `state,` argument line from the
`bindInteractions(` call (the `wrap,` line is then
followed directly by the `(next) => {` callback). Keep
`presenter.interactionState()` itself — the onUpdate
callback still calls it on the live presenter.

- [ ] **Step 2: tsc + tests green**

Run
`npx --no-install tsc --noEmit -p web-app/app/tsconfig.json`
(the arity change surfaces any missed caller; there is
exactly one), then `./test`. Expected: both clean.

- [ ] **Step 3: Validate and commit**

Run `./validate`; expect green.

```bash
git add web-app/app/flow-interactions.ts \
    web-app/flows/detail.ts
git commit -m "Drop bindInteractions state parameter"
```

### Task 5: Undo — the debounced edit is bound to its target (§3)

**Doctrine:** Commandment I; slays a Sin of Asking, Not
Telling variant (the closure re-asked "who is selected?"
at fire time — now the id travels with the intent); risks
the Sin of Test Weakening (do not touch
`tests/flow-designer-presenter.test.ts:310-315`'s
stale-presenter lesson — the PRESENTER is still resolved
at fire time; only the id is captured).

**Files:**
- Modify: `web-app/flows/detail.ts` (the panel `input`
  handler ~:1277-1305)
- Modify: `web-app/app/presenters/flow-designer.ts`
  (`withNodeNamed` ~:808, `withNodeTaskInstructions`
  ~:830, `withEdgeNamed` ~:874)
- Test: `tests/flow-designer-presenter.test.ts` (three
  red cases)
- Test: `tests/flow-undo-cursor.test.ts` (one green depth
  pin, appended at end)
- Modify: `TEST-PLAN.md` undo preamble (~:1308-1326),
  F36 (~:1339-1341), F37 (~:1343-1345), F45 (~:1420-1429)

**Interfaces:**
- Consumes: `applyUpdateNode(nodes, nodeId, patch)` /
  `applyUpdateEdge(edges, edgeId, patch)`
  (`flow-designer-actions.ts:196-216`),
  `selectedNodeId()` / `selectedEdgeId()`
  (`flow-designer.ts:428-440`), the undo-cursor test
  helpers `freshDb` / `createFlow` / `save` / `undo` /
  `currentGraphName` (`tests/flow-undo-cursor.test.ts`).
- Produces: `withNodeNamed(nodeId: string, name: string)`,
  `withNodeTaskInstructions(nodeId: string, text:
  string)`, `withEdgeNamed(edgeId: string, name: string)`
  — id-first, no selection lookup, no
  `return this.#snapshot` absent-selection early return
  (the `#guardLocked()` early return STAYS).
  `withNodeMemberIds` is NOT touched.

- [ ] **Step 1: Write the three red pins**

Append to `tests/flow-designer-presenter.test.ts`:

```ts
test(
    'withNodeNamed(id, name) renames that node even'
    + ' when the selection has moved to another',
    () => {
        const graph = {
            ...emptyGraph,
            nodes: [node('a'), node('b')],
        };
        const snap = buildInitialFlowSnapshot(
            graph, 800, 600, [], [], [],
        );
        const selectedB = {
            ...snap,
            interaction: {
                ...snap.interaction,
                selection: {
                    kind: 'nodes' as const,
                    nodeIds: new Set(['b']),
                },
            },
        };
        const presenter = new FlowDesignerPresenter(
            selectedB, 800, 600,
            buildFlowHistorySnapshot(false),
        );
        const next = presenter
            .withNodeNamed('a', 'typed');
        assert.equal(
            next.nodes.find(n => n.id === 'a')!.name,
            'typed',
        );
        assert.equal(
            next.nodes.find(n => n.id === 'b')!.name,
            'B',
        );
    },
);

test(
    'withNodeNamed(id, name) applies with no selection'
    + ' at all — the flush is bound to its target',
    () => {
        const graph = {
            ...emptyGraph,
            nodes: [node('a')],
        };
        const snap = buildInitialFlowSnapshot(
            graph, 800, 600, [], [], [],
        );
        const presenter = new FlowDesignerPresenter(
            snap, 800, 600,
            buildFlowHistorySnapshot(false),
        );
        const next = presenter
            .withNodeNamed('a', 'typed');
        assert.equal(
            next.nodes.find(n => n.id === 'a')!.name,
            'typed',
        );
    },
);

test(
    'withEdgeNamed(id, name) applies with no selection',
    () => {
        const graph = {
            ...emptyGraph,
            nodes: [node('a'), node('b')],
            edges: [{
                id: 'e1',
                name: 'go',
                fromNodeId: 'a',
                toNodeId: 'b',
            }],
        };
        const snap = buildInitialFlowSnapshot(
            graph, 800, 600, [], [], [],
        );
        const presenter = new FlowDesignerPresenter(
            snap, 800, 600,
            buildFlowHistorySnapshot(false),
        );
        const next = presenter
            .withEdgeNamed('e1', 'renamed');
        assert.equal(
            next.edges.find(e => e.id === 'e1')!.name,
            'renamed',
        );
    },
);
```

- [ ] **Step 2: Run — expect the three new cases red**

Run the single-file command against
`tests/flow-designer-presenter.test.ts`. Expected: with
today's one-argument methods the second argument is
ignored, so case 1 renames B to `'a'` (red), case 2 and 3
return the snapshot unchanged (red). No unhandled
rejection escapes — `enqueueFlowSave` pre-absorbs the
facade-less save (Ruling 7).

- [ ] **Step 3: Implement the presenter arity**

In `web-app/app/presenters/flow-designer.ts`, the three
methods take the id and lose the selection lookup and the
absent-selection early return (`#guardLocked` stays;
`#queueSave` and `#noteMutation` stay):

```ts
    withNodeNamed(
        nodeId: string,
        name: string,
    ): FlowSnapshot {
        if (this.#guardLocked()) {
            return this.#snapshot;
        }
        const next: FlowSnapshot = {
            ...this.#snapshot,
            nodes: applyUpdateNode(
                this.#snapshot.nodes,
                nodeId,
                { name: name.trim() },
            ),
        };
        this.#queueSave(next);
        this.#noteMutation();
        return next;
    }

    withNodeTaskInstructions(
        nodeId: string,
        text: string,
    ): FlowSnapshot {
        if (this.#guardLocked()) {
            return this.#snapshot;
        }
        const next: FlowSnapshot = {
            ...this.#snapshot,
            nodes: applyUpdateNode(
                this.#snapshot.nodes,
                nodeId,
                { taskInstructions: text },
            ),
        };
        this.#queueSave(next);
        this.#noteMutation();
        return next;
    }
```

and

```ts
    withEdgeNamed(
        edgeId: string,
        name: string,
    ): FlowSnapshot {
        if (this.#guardLocked()) {
            return this.#snapshot;
        }
        const next: FlowSnapshot = {
            ...this.#snapshot,
            edges: applyUpdateEdge(
                this.#snapshot.edges,
                edgeId,
                { name: name.trim() },
            ),
        };
        this.#queueSave(next);
        this.#noteMutation();
        return next;
    }
```

- [ ] **Step 4: Implement the schedule-time id capture**

In `web-app/flows/detail.ts`, the panel `input` handler
(~:1277-1305) reads the selected id AT SCHEDULE TIME,
returns on null, and captures only the id — the presenter
is still resolved at fire time:

```ts
            if (id === 'prop-node-name') {
                const nodeId = pageState
                    .presenter().selectedNodeId();
                if (nodeId === null) return;
                pageState.saveDebouncer().schedule(
                    () => commit(
                        pageState.presenter()
                            .withNodeNamed(
                                nodeId, value,
                            ),
                        { advanceHistory: true },
                    ),
                );
            } else if (
                id === 'prop-node-instructions'
            ) {
                const nodeId = pageState
                    .presenter().selectedNodeId();
                if (nodeId === null) return;
                pageState.saveDebouncer().schedule(
                    () => commit(
                        pageState.presenter()
                            .withNodeTaskInstructions(
                                nodeId, value,
                            ),
                        { advanceHistory: true },
                    ),
                );
            } else if (
                id === 'prop-edge-name'
            ) {
                const edgeId = pageState
                    .presenter().selectedEdgeId();
                if (edgeId === null) return;
                pageState.saveDebouncer().schedule(
                    () => commit(
                        pageState.presenter()
                            .withEdgeNamed(
                                edgeId, value,
                            ),
                        { advanceHistory: true },
                    ),
                );
            }
```

- [ ] **Step 5: Run — green; then the green depth pin**

Run the presenter test file (all green), then append to
`tests/flow-undo-cursor.test.ts` (uses its existing
helpers; green before and after — F45 written down):

```ts
test(
    'undo cursor: eleven saves walk eleven undos —'
    + ' N10 back to genesis, no cap',
    async () => {
        const db = await freshDb();
        const token = await organizationToken();
        const flowId = generateIdentifier();
        await createFlow(db, token, flowId);
        for (let i = 1; i <= 11; i++) {
            await save(
                db, token, flowId, 'N' + i,
                generateIdentifier(),
            );
        }
        for (let i = 10; i >= 1; i--) {
            const res = await undo(
                db, token, flowId,
                generateIdentifier(), AT,
            );
            assert.equal(res.status, 201);
            assert.equal(
                await currentGraphName(
                    db, token, flowId,
                ),
                'N' + i,
            );
        }
        const last = await undo(
            db, token, flowId,
            generateIdentifier(), AT,
        );
        assert.equal(last.status, 201);
        assert.equal(
            await currentGraphName(
                db, token, flowId,
            ),
            'genesis',
        );
    },
);
```

Run the single-file command against
`tests/flow-undo-cursor.test.ts` — all green.

- [ ] **Step 6: Reword TEST-PLAN**

Four edits:

1. Undo preamble: after the sentence ending "…a save
   after an undo-undo truncates the abandoned branch)."
   insert:

```
Redo is client-only — an in-memory stack
(`web-app/app/flow-history.ts`) cleared by
`recordFlowMutation()` on every committed content edit.
```

2. F36 — replace:

```
- [ ] **F36** Undo and Redo buttons are disabled
  when their respective stacks are empty. PASS:
  buttons show disabled state initially.
```

   with:

```
- [ ] **F36** Undo and Redo buttons are disabled
  when their respective stacks are empty. PASS:
  buttons show disabled state initially. (Undo
  may stay enabled at exhaustion —
  `hasUndoHistory` is `pairs > 1`
  (`api/derive-flows.ts`) — and the click is a
  graceful server no-op.)
```

3. F37 — replace:

```
- [ ] **F37** Perform an action, undo, then perform
  a new action. PASS: the redo stack is cleared
  (redo button disabled).
```

   with:

```
- [ ] **F37** Perform an action, undo, then perform
  a new action; let the new action's
  `PUT /api/organizations/:id/flows/:id` land —
  a panel rename saves `SAVE_DELAY_MS` = 800 ms
  after the last keystroke; do not click the
  canvas or another node before the PUT. PASS:
  the redo stack is cleared (redo button
  disabled).
```

4. F45 — replace the whole case (currently ten lines
   about `FLOW_VERSION_CAP` history) with:

```
- [ ] **F45** Rename 11 nodes one at a time; after each
  name, wait for that flow's `PUT /api/organizations/
  :id/flows/:id` in the network log (the save fires
  `SAVE_DELAY_MS` = 800 ms after the last keystroke)
  before selecting the next node. Then click Undo 11
  times in a row. PASS: every one of the 11 renames
  reverts in order — undo walks the flow's own full
  document-message-pair history (`FLOW_VERSION_CAP`
  and `flow_versions` are retired; there is no
  10-edit bound).
```

- [ ] **Step 7: Validate and commit**

Run `./validate`; expect green.

```bash
git add web-app/flows/detail.ts \
    web-app/app/presenters/flow-designer.ts \
    tests/flow-designer-presenter.test.ts \
    tests/flow-undo-cursor.test.ts TEST-PLAN.md
git commit -m "Bind debounced panel edits to their ids"
```

### Task 6: Undo — update() renders the flushed presenter (§3)

**Doctrine:** Commandment VI (the argument was a stale
value masquerading as current state); Ruling 5 (the
parameter goes with it).

**Files:**
- Modify: `web-app/flows/detail.ts` (`update` ~:581-592
  and its two call sites: `commit` ~:248, the resize
  subscriber ~:1628-1630)

**Interfaces:**
- Consumes: nothing new.
- Produces: `update(container: HTMLElement): void` —
  always renders `pageState.presenter()` AFTER the flush.
  Task 10 wraps this exact function with focus
  capture/restore.

- [ ] **Step 1: Implement**

Replace `update` (~:581-592):

```ts
function update(container: HTMLElement): void {
    pageState.saveDebouncer().flush();
    const presenter = pageState.presenter();
    presenter.renderUpdate(container);
    pageState.pushGestureContext(
        presenter.buildGestureContext(),
    );
    pageState.setHistory(presenter.history());
}
```

(The flush may run a scheduled rename, which calls
`commit(...)` re-entrantly and REPLACES
`pageState.presenter()` — reading the presenter after the
flush paints the rename now instead of waiting for the
next commit, and writes the post-mutation history back.)

Call sites: in `commit(...)` change
`update(pageState.container(), presenter);` to
`update(pageState.container());` and in the
`subscribeResize` handler change
`update(container, pageState.presenter());` to
`update(container);`.

- [ ] **Step 2: tsc + tests green**

Run
`npx --no-install tsc --noEmit -p web-app/app/tsconfig.json`
then `./test`. Expected: clean (the arity change proves
no third call site).

- [ ] **Step 3: Validate and commit**

Run `./validate`; expect green.

```bash
git add web-app/flows/detail.ts
git commit -m "Render the flushed presenter in update"
```

### Task 7: Keyboard — pin canvas-key-activate (§4 commit 1)

**Doctrine:** Office of Verification (the reducer had
zero tests); tests only — production code untouched.

**Files:**
- Test: `tests/flow-fsm-reduce.test.ts` (append two
  cases at the end)

**Interfaces:**
- Consumes: `buildState` / `findAction`
  (`tests/flow-fsm-reduce.test.ts:12-38`), `reduceFsm`.
- Produces: nothing (green pins guarding Task 9's
  neighborhood).

- [ ] **Step 1: Write the two pins**

```ts
test(
    'canvas-key-activate on a node single-selects it,'
    + ' opens the panel, and requests an update',
    () => {
        const state = buildState();
        const r = reduceFsm(state, {
            kind: 'canvas-key-activate',
            nodeId: 'n1',
            edgeId: null,
        });
        assert.equal(
            r.state.selection.kind, 'nodes',
        );
        if (r.state.selection.kind === 'nodes') {
            assert.deepEqual(
                [...r.state.selection.nodeIds],
                ['n1'],
            );
        }
        const open = findAction(
            r.actions, 'open-panel',
        );
        assert.equal(open?.open, true);
        const update = findAction(
            r.actions, 'request-update',
        );
        assert.ok(update);
        assert.equal(update.state, r.state);
    },
);

test(
    'canvas-key-activate on an edge selects the edge'
    + ' and opens the panel',
    () => {
        const state = buildState();
        const r = reduceFsm(state, {
            kind: 'canvas-key-activate',
            nodeId: null,
            edgeId: 'e1',
        });
        assert.equal(
            r.state.selection.kind, 'edge',
        );
        if (r.state.selection.kind === 'edge') {
            assert.equal(
                r.state.selection.edgeId, 'e1',
            );
        }
        const open = findAction(
            r.actions, 'open-panel',
        );
        assert.equal(open?.open, true);
        assert.ok(findAction(
            r.actions, 'request-update',
        ));
    },
);
```

- [ ] **Step 2: Run — green**

Run the single-file command against
`tests/flow-fsm-reduce.test.ts`. Expected: all green
(these pin EXISTING behavior; if red, STOP — the tree
disagrees with the spec's reading of
`onCanvasKeyActivate`).

- [ ] **Step 3: Validate and commit**

Run `./validate`; expect green.

```bash
git add tests/flow-fsm-reduce.test.ts
git commit -m "Pin canvas-key-activate reducer behavior"
```

### Task 8: Keyboard — decide designer shortcuts in a pure reducer (§4 commit 2)

**Doctrine:** Commandment IV (the Shift-uppercase chord
was a fallacy: `key === 'z' && shiftKey` is unsatisfiable
— Shift yields `'Z'`); Article "process first" (the
decision is a pure function; the listener is a thin
adapter); risks the Sin of Foreign Tongues (use `e.key`,
never `e.code` — `KeyZ` is AZERTY's W).

**Files:**
- Modify: `web-app/flows/detail.ts`
  (`bindKeyboardShortcuts` ~:1810-1866; new exported
  reducer above it)
- Create: `tests/flows-detail-shortcuts.test.ts`

**Interfaces:**
- Consumes: the `members/detail.ts` `reduceSave`
  precedent (an exported pure reducer on a page module);
  the `tests/members-detail-reduce.test.ts` stub pattern
  (localStorage/window/document stubs, then dynamic
  `await import`). Verified during planning: those three
  stubs are sufficient to import
  `web-app/flows/detail.ts` under node.
- Produces:
  `export type DesignerShortcut = 'escape' | 'delete' |
  'undo' | 'redo';`
  `export interface DesignerShortcutInput { readonly
  key: string; readonly metaKey: boolean; readonly
  ctrlKey: boolean; readonly shiftKey: boolean; readonly
  isEditableFocused: boolean; readonly isPanelOpen:
  boolean; }`
  `export function reduceDesignerShortcut(input:
  DesignerShortcutInput): DesignerShortcut | null` —
  Task 13's F39 copy describes this contract.

- [ ] **Step 1: Write the failing test file**

Create `tests/flows-detail-shortcuts.test.ts`:

```ts
// state.ts (transitively imported via the adapters ->
// presenters) reads localStorage and window / document
// at module-eval time, which Node lacks. Stub before
// any import, then load the page-module reducer with
// dynamic import() so the stubs are in place. Same
// pattern as members-detail-reduce.
// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};
// @ts-expect-error — Node global stub
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
};
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type {
    DesignerShortcutInput,
} from '../web-app/flows/detail.ts';

const { reduceDesignerShortcut } = await import(
    '../web-app/flows/detail.ts'
);

function chord(
    overrides: Partial<DesignerShortcutInput>,
): DesignerShortcutInput {
    return {
        key: '',
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        isEditableFocused: false,
        isPanelOpen: false,
        ...overrides,
    };
}

test('Cmd+Shift+Z arrives as key Z and is redo', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'Z', metaKey: true, shiftKey: true,
        })),
        'redo',
    );
});

test('Cmd+z is undo', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'z', metaKey: true,
        })),
        'undo',
    );
});

test('Caps-Lock Cmd+Z (no shift) is still undo', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'Z', metaKey: true,
        })),
        'undo',
    );
});

test('Ctrl+Shift+z is redo', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'z', ctrlKey: true, shiftKey: true,
        })),
        'redo',
    );
});

test('the chord honors an editable target', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'z', metaKey: true,
            isEditableFocused: true,
        })),
        null,
    );
});

test('Delete in an editable target is null', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'Delete', isEditableFocused: true,
        })),
        null,
    );
});

test('Delete with canvas focus deletes', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'Delete',
        })),
        'delete',
    );
});

test('Escape closes only an open panel', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'Escape', isPanelOpen: true,
        })),
        'escape',
    );
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'Escape',
        })),
        null,
    );
});
```

- [ ] **Step 2: Run — expect red**

Run the single-file command against
`tests/flows-detail-shortcuts.test.ts`. Expected: the
dynamic import resolves but `reduceDesignerShortcut` is
`undefined` — every case throws (the export does not
exist).

- [ ] **Step 3: Implement the reducer and thin the
  listener**

In `web-app/flows/detail.ts`, directly above
`bindKeyboardShortcuts`:

```ts
export type DesignerShortcut =
    | 'escape'
    | 'delete'
    | 'undo'
    | 'redo';

export interface DesignerShortcutInput {
    readonly key: string;
    readonly metaKey: boolean;
    readonly ctrlKey: boolean;
    readonly shiftKey: boolean;
    readonly isEditableFocused: boolean;
    readonly isPanelOpen: boolean;
}

export function reduceDesignerShortcut(
    input: DesignerShortcutInput,
): DesignerShortcut | null {
    if (input.key === 'Escape') {
        return input.isPanelOpen ? 'escape' : null;
    }
    if (
        input.key === 'Delete'
        || input.key === 'Backspace'
    ) {
        return input.isEditableFocused
            ? null : 'delete';
    }
    if (!input.metaKey && !input.ctrlKey) return null;
    if (input.key !== 'z' && input.key !== 'Z') {
        return null;
    }
    if (input.isEditableFocused) return null;
    return input.shiftKey ? 'redo' : 'undo';
}
```

Replace the keydown listener body inside
`bindKeyboardShortcuts` with the thin adapter (the three
`instanceof` checks compute `isEditableFocused`; the
reducer decides):

```ts
    document.addEventListener(
        'keydown',
        (e: KeyboardEvent) => {
            const active = document.activeElement;
            const shortcut = reduceDesignerShortcut({
                key: e.key,
                metaKey: e.metaKey,
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                isEditableFocused:
                    active instanceof HTMLInputElement
                    || active instanceof
                        HTMLTextAreaElement
                    || active instanceof
                        HTMLSelectElement,
                isPanelOpen: panelStateRef.open,
            });
            if (shortcut === null) return;
            e.preventDefault();
            if (shortcut === 'escape') {
                panelStateRef.open = false;
                commit(
                    pageState.presenter()
                        .withPanelOpen(false),
                );
                reconcileFitFromDom();
            } else if (shortcut === 'delete') {
                void handleDeleteSelected();
            } else if (shortcut === 'undo') {
                void handleUndo();
            } else {
                void handleRedo();
            }
        },
        { signal },
    );
```

- [ ] **Step 4: Run — green; tsc clean**

Run the test file (8/8 green), then
`npx --no-install tsc --noEmit -p web-app/app/tsconfig.json`.

- [ ] **Step 5: Validate and commit**

Run `./validate`; expect green.

```bash
git add web-app/flows/detail.ts \
    tests/flows-detail-shortcuts.test.ts
git commit -m "Decide designer shortcuts in a reducer"
```

### Task 9: Keyboard — add canvas-focus to the FSM (§4 commit 3)

**Doctrine:** Article "the listener reports a DOM fact,
the reducer decides" (the `space-toggle` /
`isFormFocused` shape); the new input is INERT until
Task 11 dispatches it.

**Files:**
- Modify: `web-app/app/flow-fsm-types.ts` (`FsmInput`
  union, after `canvas-key-activate` ~:96-100)
- Modify: `web-app/app/flow-fsm-reduce.ts` (dispatch
  switch ~:24-51; `onCanvasFocus` after
  `onCanvasKeyActivate` ~:738-790)
- Test: `tests/flow-fsm-reduce.test.ts` (five cases)

**Interfaces:**
- Consumes: `isGestureActive` (same module), Task 7's
  test placement.
- Produces: FsmInput member
  `{ kind: 'canvas-focus'; nodeId: string | null;
  edgeId: string | null; isRenderedSelected: boolean }`
  — Task 11 dispatches it; `isRenderedSelected` is the
  loop-breaker (the listener samples the RENDERED
  `aria-current`, because the page writes selection
  behind the FSM and `aria-current` IS the presenter's
  selection).

- [ ] **Step 1: Write the five red pins**

Append to `tests/flow-fsm-reduce.test.ts`:

```ts
test(
    'canvas-focus on an unselected node single-selects'
    + ' it with request-update and no open-panel',
    () => {
        const state = buildState();
        const r = reduceFsm(state, {
            kind: 'canvas-focus',
            nodeId: 'n1',
            edgeId: null,
            isRenderedSelected: false,
        });
        assert.equal(
            r.state.selection.kind, 'nodes',
        );
        if (r.state.selection.kind === 'nodes') {
            assert.deepEqual(
                [...r.state.selection.nodeIds],
                ['n1'],
            );
        }
        assert.ok(findAction(
            r.actions, 'request-update',
        ));
        assert.equal(
            findAction(r.actions, 'open-panel'),
            undefined,
        );
    },
);

test(
    'canvas-focus on a rendered-selected item is a'
    + ' no-op (the promotion loop-breaker)',
    () => {
        const state = buildState({
            selection: {
                kind: 'nodes',
                nodeIds: new Set(['n1']),
            },
        });
        const r = reduceFsm(state, {
            kind: 'canvas-focus',
            nodeId: 'n1',
            edgeId: null,
            isRenderedSelected: true,
        });
        assert.equal(r.state, state);
        assert.equal(r.actions.length, 0);
    },
);

test(
    'canvas-focus mid-gesture is ignored',
    () => {
        const state = buildState({
            drag: {
                kind: 'dragging',
                anchorNodeId: 'n1',
                startPointerX: 0,
                startPointerY: 0,
                currentPointerX: 50,
                currentPointerY: 30,
                initialPositions: new Map([
                    ['n1', { x: 0, y: 0 }],
                ]),
            },
        });
        const r = reduceFsm(state, {
            kind: 'canvas-focus',
            nodeId: 'n2',
            edgeId: null,
            isRenderedSelected: false,
        });
        assert.equal(r.state, state);
        assert.equal(r.actions.length, 0);
    },
);

test(
    'canvas-focus on an edge selects the edge',
    () => {
        const state = buildState();
        const r = reduceFsm(state, {
            kind: 'canvas-focus',
            nodeId: null,
            edgeId: 'e1',
            isRenderedSelected: false,
        });
        assert.equal(
            r.state.selection.kind, 'edge',
        );
        if (r.state.selection.kind === 'edge') {
            assert.equal(
                r.state.selection.edgeId, 'e1',
            );
        }
        assert.ok(findAction(
            r.actions, 'request-update',
        ));
    },
);

test(
    'canvas-focus collapses a foreign multi-selection'
    + ' to the focused node',
    () => {
        const state = buildState({
            selection: {
                kind: 'nodes',
                nodeIds: new Set(['n2', 'n3']),
            },
        });
        const r = reduceFsm(state, {
            kind: 'canvas-focus',
            nodeId: 'n1',
            edgeId: null,
            isRenderedSelected: false,
        });
        assert.equal(
            r.state.selection.kind, 'nodes',
        );
        if (r.state.selection.kind === 'nodes') {
            assert.deepEqual(
                [...r.state.selection.nodeIds],
                ['n1'],
            );
        }
    },
);
```

- [ ] **Step 2: Run — expect red**

Run the single-file command against
`tests/flow-fsm-reduce.test.ts`. Expected: the five new
cases fail — the kind is unknown, so `reduceFsm` falls
off its exhaustive switch and returns `undefined`
(`r.state` throws). Task 7's two cases stay green.

- [ ] **Step 3: Implement**

`web-app/app/flow-fsm-types.ts` — append to the
`FsmInput` union after the `canvas-key-activate` member:

```ts
    | {
        kind: 'canvas-focus';
        nodeId: string | null;
        edgeId: string | null;
        isRenderedSelected: boolean;
    };
```

`web-app/app/flow-fsm-reduce.ts` — the dispatch switch
gains:

```ts
        case 'canvas-focus':
            return onCanvasFocus(state, input);
```

and after `onCanvasKeyActivate`:

```ts
// Focus is the keyboard's click: promote it to a single
// selection with request-update only — Enter stays the
// double-click (open-panel lives in canvas-key-activate).
// isRenderedSelected reads the RENDERED aria-current,
// not this FSM's selection, because the page writes
// selection behind the FSM; it breaks the
// focus -> commit -> restore -> focusin loop.
function onCanvasFocus(
    state: FsmState,
    input: Extract<FsmInput, {
        kind: 'canvas-focus';
    }>,
): FsmResult {
    if (isGestureActive(state)) {
        return { state, actions: [] };
    }
    if (input.isRenderedSelected) {
        return { state, actions: [] };
    }
    if (input.nodeId) {
        const next: FsmState = {
            ...state,
            selection: {
                kind: 'nodes',
                nodeIds: new Set([
                    input.nodeId,
                ]),
            },
        };
        return {
            state: next,
            actions: [
                {
                    kind: 'request-update',
                    state: next,
                },
            ],
        };
    }
    if (input.edgeId) {
        const next: FsmState = {
            ...state,
            selection: {
                kind: 'edge',
                edgeId: input.edgeId,
            },
        };
        return {
            state: next,
            actions: [
                {
                    kind: 'request-update',
                    state: next,
                },
            ],
        };
    }
    return { state, actions: [] };
}
```

- [ ] **Step 4: Run — green; tsc clean**

Run the test file, then
`npx --no-install tsc --noEmit -p web-app/app/tsconfig.json`
(the exhaustive switch in `reduceFsm` compiles only with
the new case present).

- [ ] **Step 5: Validate and commit**

Run `./validate`; expect green.

```bash
git add web-app/app/flow-fsm-types.ts \
    web-app/app/flow-fsm-reduce.ts \
    tests/flow-fsm-reduce.test.ts
git commit -m "Add canvas-focus input to the flow FSM"
```

### Task 10: Keyboard — restore canvas focus across rebuilds (§4 commit 4)

**Doctrine:** Commandment I (every rebuild detached the
focused element; nothing restored it); Office of the
Interface (keyboard navigation is a gate of entry, not
polish); risks the Sin of Internal Defense (no "just in
case" re-checks — a deleted id simply finds nothing and
focus stays on `<body>`).

**Files:**
- Modify: `web-app/flows/detail.ts` (two exports; wrap
  `renderUpdate` inside `update()`)
- Create: `tests/flows-detail-canvas-focus.test.ts`

**Interfaces:**
- Consumes: Task 6's `update(container)`; the
  `elementsByAttr` idiom
  (`flow-gesture-render.ts:72-86`); `$` from
  `../app/dom.ts` (already imported).
- Produces:
  `export type CanvasFocus = { readonly kind: 'node' |
  'edge'; readonly id: string };`
  `export function canvasFocusOf(active: Element | null,
  wrap: Element): CanvasFocus | null;`
  `export function restoreCanvasFocus(focus: CanvasFocus
  | null, wrap: Element): void;`
  Task 11 depends on this restore existing (promotion
  without restore drops every Tab to the document top).

- [ ] **Step 1: Write the failing test file**

Create `tests/flows-detail-canvas-focus.test.ts`:

```ts
// Same module-eval stubs as flows-detail-shortcuts,
// plus SVGElement: restoreCanvasFocus type-tests
// candidates with `instanceof SVGElement` before
// calling focus(). The fake class IS the stub, so its
// instances pass the check.
// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};
// @ts-expect-error — Node global stub
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
};
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

class FakeSvgElement {
    readonly attrs: Record<string, string>;
    parentElement:
        | FakeSvgElement
        | FakeWrap
        | null = null;
    focusCalls: Array<{ preventScroll: boolean }> = [];

    constructor(attrs: Record<string, string>) {
        this.attrs = attrs;
    }

    getAttribute(name: string): string | null {
        const value = this.attrs[name];
        return value === undefined ? null : value;
    }

    focus(options: { preventScroll: boolean }): void {
        this.focusCalls.push(options);
    }
}

class FakeWrap {
    nodes: FakeSvgElement[] = [];
    edges: FakeSvgElement[] = [];
    parentElement: null = null;

    getAttribute(_name: string): string | null {
        return null;
    }

    contains(el: unknown): boolean {
        let current = el as {
            parentElement: unknown;
        } | null;
        while (current) {
            if (current === this) return true;
            current = current.parentElement as {
                parentElement: unknown;
            } | null;
        }
        return false;
    }

    querySelectorAll(
        selector: string,
    ): FakeSvgElement[] {
        return selector === '[data-node-id]'
            ? this.nodes
            : this.edges;
    }
}

// @ts-expect-error — Node global stub
globalThis.SVGElement = FakeSvgElement;

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const { canvasFocusOf, restoreCanvasFocus } =
    await import('../web-app/flows/detail.ts');

function asElement(value: unknown): Element {
    return value as Element;
}

function wrapWithNode(): {
    wrap: FakeWrap;
    g: FakeSvgElement;
    text: FakeSvgElement;
} {
    const wrap = new FakeWrap();
    const g = new FakeSvgElement({
        'data-node-id': 'n1',
    });
    g.parentElement = wrap;
    const text = new FakeSvgElement({});
    text.parentElement = g;
    wrap.nodes = [g];
    return { wrap, g, text };
}

test(
    'canvasFocusOf finds the node id from a <text>'
    + ' child inside the wrap',
    () => {
        const { wrap, text } = wrapWithNode();
        assert.deepEqual(
            canvasFocusOf(
                asElement(text), asElement(wrap),
            ),
            { kind: 'node', id: 'n1' },
        );
    },
);

test('canvasFocusOf finds an edge id', () => {
    const wrap = new FakeWrap();
    const g = new FakeSvgElement({
        'data-edge-id': 'e1',
    });
    g.parentElement = wrap;
    wrap.edges = [g];
    assert.deepEqual(
        canvasFocusOf(
            asElement(g), asElement(wrap),
        ),
        { kind: 'edge', id: 'e1' },
    );
});

test(
    'canvasFocusOf yields null for null, an outside'
    + ' element, and the wrap itself',
    () => {
        const { wrap } = wrapWithNode();
        assert.equal(
            canvasFocusOf(null, asElement(wrap)),
            null,
        );
        const outside = new FakeSvgElement({
            'data-node-id': 'n9',
        });
        assert.equal(
            canvasFocusOf(
                asElement(outside), asElement(wrap),
            ),
            null,
        );
        assert.equal(
            canvasFocusOf(
                asElement(wrap), asElement(wrap),
            ),
            null,
        );
    },
);

test(
    'restoreCanvasFocus focuses the matching id once'
    + ' with preventScroll',
    () => {
        const wrap = new FakeWrap();
        const other = new FakeSvgElement({
            'data-node-id': 'n0',
        });
        const target = new FakeSvgElement({
            'data-node-id': 'n1',
        });
        wrap.nodes = [other, target];
        restoreCanvasFocus(
            { kind: 'node', id: 'n1' },
            asElement(wrap),
        );
        assert.deepEqual(
            target.focusCalls,
            [{ preventScroll: true }],
        );
        assert.equal(other.focusCalls.length, 0);
    },
);

test(
    'restoreCanvasFocus is inert for a missing id and'
    + ' for null',
    () => {
        const wrap = new FakeWrap();
        const survivor = new FakeSvgElement({
            'data-node-id': 'n0',
        });
        wrap.nodes = [survivor];
        restoreCanvasFocus(
            { kind: 'node', id: 'gone' },
            asElement(wrap),
        );
        restoreCanvasFocus(null, asElement(wrap));
        assert.equal(survivor.focusCalls.length, 0);
    },
);
```

- [ ] **Step 2: Run — expect red**

Run the single-file command against
`tests/flows-detail-canvas-focus.test.ts`. Expected: the
exports do not exist — every case throws.

- [ ] **Step 3: Implement**

In `web-app/flows/detail.ts`, above `update()`:

```ts
export type CanvasFocus = {
    readonly kind: 'node' | 'edge';
    readonly id: string;
};

// The previously focused CANVAS item, if any. Null
// unless the active element sits inside the wrap and
// an ancestor carries data-node-id / data-edge-id —
// the panel, the name input, a <dialog>, and <body>
// all yield null, so nothing is stolen from them.
export function canvasFocusOf(
    active: Element | null,
    wrap: Element,
): CanvasFocus | null {
    if (
        active === null
        || active === wrap
        || !wrap.contains(active)
    ) {
        return null;
    }
    let current: Element | null = active;
    while (current && current !== wrap) {
        const nodeId =
            current.getAttribute('data-node-id');
        if (nodeId !== null) {
            return { kind: 'node', id: nodeId };
        }
        const edgeId =
            current.getAttribute('data-edge-id');
        if (edgeId !== null) {
            return { kind: 'edge', id: edgeId };
        }
        current = current.parentElement;
    }
    return null;
}

// Re-focus the same id in the rebuilt canvas — the
// previously FOCUSED id, never aria-current. A deleted
// id finds nothing and focus stays on <body>. The wrap
// is overflow: hidden, so a bare focus() would scroll
// the wrap against the viewBox camera — preventScroll
// is load-bearing.
export function restoreCanvasFocus(
    focus: CanvasFocus | null,
    wrap: Element,
): void {
    if (focus === null) return;
    const attrName = focus.kind === 'node'
        ? 'data-node-id'
        : 'data-edge-id';
    const els = wrap.querySelectorAll(
        '[' + attrName + ']',
    );
    for (const el of els) {
        if (
            el.getAttribute(attrName) !== focus.id
        ) {
            continue;
        }
        if (el instanceof SVGElement) {
            el.focus({ preventScroll: true });
        }
        return;
    }
}
```

Wrap the render inside `update()` (from Task 6):

```ts
function update(container: HTMLElement): void {
    pageState.saveDebouncer().flush();
    const presenter = pageState.presenter();
    const wrap = $(
        '.flow-canvas-wrap', container,
    );
    const focus = wrap === null
        ? null
        : canvasFocusOf(
            document.activeElement, wrap,
        );
    presenter.renderUpdate(container);
    if (wrap !== null) {
        restoreCanvasFocus(focus, wrap);
    }
    pageState.pushGestureContext(
        presenter.buildGestureContext(),
    );
    pageState.setHistory(presenter.history());
}
```

(The wrap itself survives every rebuild —
`renderUpdate` replaces `.flow-canvas-host`'s CONTENT
inside it — so capture-before / restore-after brackets
exactly the subtree that gets detached.)

- [ ] **Step 4: Run — green; tsc clean**

Run the test file (5/5), then
`npx --no-install tsc --noEmit -p web-app/app/tsconfig.json`.

- [ ] **Step 5: Validate and commit**

Run `./validate`; expect green.

```bash
git add web-app/flows/detail.ts \
    tests/flows-detail-canvas-focus.test.ts
git commit -m "Restore canvas focus across rebuilds"
```

### Task 11: Keyboard — focusin promotes to selection (§4 commit 5)

**Doctrine:** Article "the listener reports a DOM fact,
the reducer decides"; MUST land after Task 10 — promotion
without restore drops every Tab to the document top (the
commit rebuild detaches the focused element).

**Files:**
- Modify: `web-app/app/flow-interactions.ts` (one
  `focusin` listener on `wrap`, placed after the `wheel`
  listener, before `handleShift`)

**Interfaces:**
- Consumes: Task 9's `canvas-focus` input; `ancestorAttr`
  (`flow-interactions.ts:267-279`); the module's
  `dispatch`.
- Produces: the live promotion path. Traced contract
  (for the reviewer, not code): Tab → `focusin` →
  `request-update` → full commit → capture → `setHtml`
  → restore → nested `focusin` with
  `isRenderedSelected: true` → no-op →
  `reconcileFitFromDom`; with the panel open,
  `withSelectionCentered` pans as a click does. No unit
  test — the reducer is pinned (Task 9) and the DOM loop
  is the browser run's oracle (F38a/F38b).

- [ ] **Step 1: Implement**

In `bindInteractions`, after the `wheel` listener block:

```ts
    wrap.addEventListener(
        'focusin',
        (e) => {
            const target = e.target;
            if (
                !(target instanceof Element)
            ) return;
            const nodeId = ancestorAttr(
                target, 'data-node-id',
            );
            const edgeId = ancestorAttr(
                target, 'data-edge-id',
            );
            if (!nodeId && !edgeId) return;
            const isRenderedSelected =
                ancestorAttr(
                    target, 'aria-current',
                ) === 'true';
            dispatch({
                kind: 'canvas-focus',
                nodeId,
                edgeId,
                isRenderedSelected,
            });
        },
        { signal },
    );
```

- [ ] **Step 2: tsc + full suite green**

Run
`npx --no-install tsc --noEmit -p web-app/app/tsconfig.json`
then `./test`. Expected: clean.

- [ ] **Step 3: Validate and commit**

Run `./validate`; expect green.

```bash
git add web-app/app/flow-interactions.ts
git commit -m "Promote canvas focus to selection"
```

### Task 12: Keyboard — Space defers to the item it activated (§4 commit 6)

**Doctrine:** Commandment IV (two listeners both claiming
Space is a fallacy of ownership; `defaultPrevented` is
the platform's own arbitration). `isFormFocused` is NOT
touched — F57 holds.

**Files:**
- Modify: `web-app/app/flow-interactions.ts`
  (`handleSpace`, ~:699-712)

**Interfaces:**
- Consumes: the activation listener's existing
  `e.preventDefault()` (~:741); `document` keydown
  listeners run before `window` ones on the bubble path,
  so the guard sees the claim.
- Produces: Space on a focused node activates it WITHOUT
  toggling pan (browser case F57a).

- [ ] **Step 1: Implement**

In `handleSpace`, after the existing
`if (ke.repeat) return;` line, add:

```ts
        // the activation listener (document phase)
        // claims Space for a focused node or edge
        if (ke.defaultPrevented) return;
```

- [ ] **Step 2: Full suite green**

Run `./test`. Expected: clean (the space-toggle reducer
pins are input-level and unaffected).

- [ ] **Step 3: Validate and commit**

Run `./validate`; expect green.

```bash
git add web-app/app/flow-interactions.ts
git commit -m "Leave Space to the item it activated"
```

### Task 13: Keyboard — document keyboard selection (§4 commit 7)

**Doctrine:** Commandment V — docs only; every sentence
below is made true by Tasks 8–12.

**Files:**
- Modify: `TEST-PLAN.md` (F38 ~:1368-1370, F39
  ~:1371-1374, new F38a/F38b after F38, new F57a after
  F57 ~:1486-1489; two Known-MCP bullets)
- Modify: `FLOW-CANVAS.md` (`## Layers` bullet,
  `## The FSM seam` sentence)

**Interfaces:**
- Consumes: Tasks 8–12 shipped behavior.
- Produces: the three new cases Task 19 counts
  (F38a, F38b, F57a: 77 → 80).

- [ ] **Step 1: Replace F38 and F39, insert F38a/F38b**

Replace:

```
- [ ] **F38** Press Delete or Backspace with a node
  or edge selected (not focused in an input).
  PASS: selected item is deleted.
- [ ] **F39** Press Cmd+Z / Ctrl+Z to undo, press
  Cmd+Shift+Z / Ctrl+Shift+Z to redo. PASS:
  keyboard shortcuts match toolbar button
  behavior.
```

with:

```
- [ ] **F38** Tab until a node shows the focus
  outline — it also takes the selection (glow,
  `aria-current="true"`), panel closed. Press
  Delete or Backspace. PASS: the focused node
  is deleted; focus lands on `<body>`.
- [ ] **F38a** Tab again: focus moves to the next
  node or edge, never the page top; selection
  follows the focus. With the panel open the
  camera pans to reveal the selection, zoom
  unchanged. Tab across a marquee-selected
  group keeps the group selected. PASS: focus
  and selection stay paired through every
  re-render.
- [ ] **F38b** Tab to a node, press Enter — its
  panel opens and the node keeps focus through
  the re-render; Escape closes the panel and
  focus stays on the node. A mouse click
  selects without keeping focus. PASS:
  keyboard focus survives open and close.
- [ ] **F39** With Undo enabled, press Cmd+Z /
  Ctrl+Z — it matches the Undo toolbar button.
  Without a node click in between, press
  Cmd+Shift+Z / Ctrl+Shift+Z (the browser
  reports `key: 'Z'`) — it matches Redo. PASS:
  keyboard shortcuts match toolbar button
  behavior.
```

- [ ] **Step 2: Insert F57a after F57**

After the F57 case (`Focus a text input …`), insert:

```
- [ ] **F57a** Tab to a node, tap Space. PASS: the
  node's panel opens (Space activates the
  focused item); pan mode stays off.
```

- [ ] **Step 3: Two Known-MCP bullets**

In `#### Known MCP limitations`, after Task 3's
`<svg>`-replacement bullet, insert:

```
- **Chords carry the browser's `key`**: Shift
  uppercases (Cmd+Shift+Z arrives as `key: 'Z'`);
  match chords Shift-insensitively.
- **On canvas nodes and edges, `el.focus()` selects
  like Tab** (the `focusin` promotion) while
  `el.click()` fires no `pointerdown` and selects
  nothing — drive canvas selection with real pointer
  events or `.focus()`.
```

- [ ] **Step 4: FLOW-CANVAS.md**

In `## Layers`, extend the `flow-interactions.ts` bullet
(ends "…the toggle is ignored mid-gesture") with
"; focus promotes to selection via `canvas-focus`".
In `## The FSM seam`, append one sentence after Task 2's:

```
The page restores canvas focus after every rebuild in
`update()` (`canvasFocusOf` / `restoreCanvasFocus`).
```

- [ ] **Step 5: Validate and commit**

Run `./validate`; expect green (FLOW-CANVAS.md stays
under its 300-line ceiling).

```bash
git add TEST-PLAN.md FLOW-CANVAS.md
git commit -m "Document keyboard selection in TEST-PLAN"
```

### Task 14: Product — the record detail offers Archive (§5)

**Doctrine:** Commandment III (Uniformity — the sibling
voice: the objectives and projects archive controls);
risks the Sin of Unbidden Helper Code (NO reactivate
control, NO client lifecycle guard — nothing downstream
reads record lifecycle).

**Files:**
- Modify: `web-app/app/presenters/record-detail.ts`
  (imports; the Edit button block ~:491-497)
- Create: `tests/presenter-record-detail.test.ts`

**Interfaces:**
- Consumes: `RecordModel.isActive()`
  (`api/types.ts:1623-1625`, its FIRST caller),
  `iconArchive(ICON_SIZE.base, '')`
  (`web-app/app/icons.ts:480`), `trusted` (already
  imported).
- Produces: `<button id="record-archive-btn"
  class="btn btn-outline"
  data-dialog-open="confirm-archive">` rendered only for
  an active record — Task 15's dialog answers the
  `data-dialog-open` (the shared `handleDialogClick`
  opens `#confirm-archive-dialog` by convention).

- [ ] **Step 1: Write the failing test file**

Create `tests/presenter-record-detail.test.ts` (the
`tests/presenter-project-action-bar.test.ts:44-64`
shape — construct, render, match):

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    RecordDetailPresenter,
} from '../web-app/app/presenters/record-detail.ts';
import { RecordModel } from '../api/types.ts';
import type { RecordState } from '../api/types.ts';

function pageFor(state: RecordState): string {
    const model = new RecordModel(
        {
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            organization_id:
                'AjdvjuECVZEgZoFajaIEkg',
            name: 'Account Review',
            description: 'Quarterly review subject',
            position: 1,
            state,
        },
        { state },
    );
    return new RecordDetailPresenter({
        record: model,
        attributes: [],
        boundFlows: [],
        workOrders: [],
        instances: {
            instances: [],
            editing: null,
        },
    }).buildPage().toString();
}

test(
    'an active record offers Archive through the'
    + ' house dialog',
    () => {
        const html = pageFor('active');
        assert.match(
            html,
            /data-dialog-open="confirm-archive"/,
        );
        assert.match(
            html, /id="record-archive-btn"/,
        );
        assert.match(html, /Active/);
    },
);

test(
    'an archived record hides Archive and reads'
    + ' Archived',
    () => {
        const html = pageFor('archived');
        assert.doesNotMatch(
            html,
            /data-dialog-open="confirm-archive"/,
        );
        assert.doesNotMatch(html, /Active/);
        assert.match(html, /Archived/);
    },
);
```

- [ ] **Step 2: Run — expect red**

Run the single-file command against
`tests/presenter-record-detail.test.ts`. Expected: case 1
fails (the markup ends at `#record-edit-btn`); case 2
passes already (verified during planning: the archived
render contains no stray "Active" text) — that half is a
guard, not a pin.

- [ ] **Step 3: Implement**

In `web-app/app/presenters/record-detail.ts`:

1. Add `iconArchive` to the `../icons.ts` import list.
2. Replace the Edit button block (~:491-497):

```ts
                <div class="flex gap-2">
                    ${this.#buildArchiveButton()}
                    <button
                        id="record-edit-btn"
                        class="btn btn-primary">
                        ${iconEdit(ICON_SIZE.base, '')}
                        Edit
                    </button>
                </div>
```

3. Add the builder beside the other private builders:

```ts
    #buildArchiveButton(): SafeHtml {
        if (!this.#view.record.isActive()) {
            return trusted('');
        }
        return html`<button
            id="record-archive-btn"
            class="btn btn-outline"
            data-dialog-open="confirm-archive">
            ${iconArchive(ICON_SIZE.base, '')}
            Archive
        </button>`;
    }
```

- [ ] **Step 4: Run — green; tsc clean**

Run the test file (2/2), then
`npx --no-install tsc --noEmit -p web-app/app/tsconfig.json`.

- [ ] **Step 5: Validate and commit**

Run `./validate`; expect green.

```bash
git add web-app/app/presenters/record-detail.ts \
    tests/presenter-record-detail.test.ts
git commit -m "Offer Archive on an active record detail"
```

### Task 15: Product — the archive dialog and wiring (§5)

**Doctrine:** Commandment III (the records page's own
`confirm-delete-instance` dialog shape; the projects /
objectives confirm-archive voice); Article "insulation
through adapters" (`postRecordStateChange` is the pinned
adapter — `tests/adapters-records.test.ts:227-262` —
this task only calls it). NOT touched: server,
validators, derive, adapter, list page,
`RECORD_STATE_CONFIG`, the instances section, flow
binding, seed.

**Files:**
- Modify: `web-app/records/detail.html` (one `<dialog>`)
- Modify: `web-app/records/detail.ts` (imports;
  `onDocumentClick` branch; `handleArchive`)

**Interfaces:**
- Consumes: Task 14's `data-dialog-open` button;
  `handleDialogClick` / `closeDialog`
  (`web-app/app/dialog.ts`); `getRecord` /
  `postRecordStateChange` from the adapter barrel
  (`web-app/app/adapters/index.ts` re-exports
  `records.ts`); the page's `subscribeRecordChanges`
  reload (`records/detail.ts:104-108`) — `putRecord`
  notifies, so the badge re-renders without `load(root)`.
- Produces: the R15 flow end-to-end; Task 19 words it.

- [ ] **Step 1: Add the dialog**

In `web-app/records/detail.html`, after the
`confirm-delete-instance-dialog` `</dialog>`:

```html
<dialog id="confirm-archive-dialog"
    class="dialog dialog-narrow"
    role="alertdialog"
    aria-labelledby="confirm-archive-title"
    aria-describedby="confirm-archive-message">
    <div class="dialog-header">
        <h3 id="confirm-archive-title"
            class="dialog-title">
            Archive Record?</h3>
    </div>
    <p id="confirm-archive-message"
        class="text-sm text-muted">
        The Record leaves the Active list; its
        instances and history stay readable.
    </p>
    <div class="dialog-footer">
        <button class="btn btn-outline"
            data-dialog-cancel="confirm-archive">
            Cancel
        </button>
        <button class="btn btn-primary"
            data-action="confirm-archive">
            Archive
        </button>
    </div>
</dialog>
```

(`btn btn-primary`, not destructive — archiving is
reversible at the gate.)

- [ ] **Step 2: Wire the click and the handler**

In `web-app/records/detail.ts`:

1. Add `getRecord,` and `postRecordStateChange,` to the
   `'../app/adapters/index.ts'` import list.
2. In `onDocumentClick`, AFTER the `handleDialogClick`
   early return and after the existing
   `confirm-delete-instance` branch:

```ts
    const archive = target.closest(
        '[data-action="confirm-archive"]',
    );
    if (archive) {
        closeDialog('confirm-archive');
        void handleArchive();
    }
```

3. Beside `handleDeleteInstance`:

```ts
async function handleArchive(): Promise<void> {
    if (pageState.kind !== 'reading') return;
    if (!recordId) return;
    const ctx = sessionContext();
    const entity = await getRecord(ctx, recordId);
    try {
        await postRecordStateChange(
            ctx, entity, 'archived',
        );
    } catch (err) {
        reportFault(
            ctx, 'Failed to archive Record', err,
        );
        return;
    }
    showToast('Record archived', 'success');
}
```

No `load(root)` — the `subscribeRecordChanges`
subscriber re-renders the badge (and Task 14's presenter
then drops the button). No client guard on bindings or
instances.

- [ ] **Step 3: tsc + full suite green**

Run
`npx --no-install tsc --noEmit -p web-app/app/tsconfig.json`
then `./test`. Expected: clean.

- [ ] **Step 4: Validate and commit**

Run `./validate`; expect green.

```bash
git add web-app/records/detail.html \
    web-app/records/detail.ts
git commit -m "Wire the record archive confirm dialog"
```

### Task 16: Seed — an R member seat and an ACL subject (§6)

**Doctrine:** Commandment II (R21 verifies the ACL
covenant — the seed must give it a subject no case
edits); Article "validate at every edge" (every formed
pair rides the route's own spec:
`formSeedMessagePair` at `ATTRIBUTE_DETAIL_PATTERN`
resolves its response through `nestedAttributeWireOf`,
so an invalid attribute body throws at formation);
risks the Sin of Magical Values (the five new slice ids
are minted once and named in `SLICE_ENTITY_IDS`).
NOT touched: `formGarden`,
`formRecordBindingMessagePairs`,
`validateRecordAttributeEntity`, Customer Profile and
its graph — R3–R14, R16–R20, and WB keep their subjects.

**Files:**
- Modify: `api/test-plan-slices.ts` (five
  `SLICE_ENTITY_IDS` entries; `RExtras` type +
  `formRExtras` beside `formKExtras`; an `R` branch in
  the section chain ~:3237; a write loop in the
  transaction after the `f2Flows` loop ~:3352-3376)
- Modify: `tests/test-plan-slices.test.ts` (:48 pair
  count; the Customer Profile garden case ~:427-449)
- Modify: `tests/pg-seed.test.ts` (`omitExtras`
  ~:342-345; an `rMember` match ~:376-382)
- Create: `tests/slices-acl-projection.test.ts`
- Modify: `TEST-PLAN.md` R1 (~:2700-2707) and R21
  (~:2806-2812)

**Interfaces:**
- Consumes: `formExtraIdentity(identityId, name, email,
  requestAt, seatOrganizationId)` (~:918),
  `formSeedMessagePair` / `seedMessagePairKey`,
  `validateRecordWriteBody`, `recordDocumentBodyOf`,
  `postRecordWriteOp(view, body, SYSTEM_MEMBER_ID,
  messagePairs)`, `appendMessagePair`,
  `RECORD_TYPES_COLLECTION_PATTERN` /
  `RECORD_TYPE_DETAIL_PATTERN` /
  `ATTRIBUTE_DETAIL_PATTERN`,
  `DEFAULT_ATTRIBUTE_ACL_ROLES` (add to the
  `./types.ts` import list — currently not imported by
  this file), `sliceEntityId`.
- Produces: slice ids `r-member`, `r-record-review`,
  `r-state-record-review`, `r-attr-review-notes`,
  `r-attr-review-limit`; the reveal rows
  `R member_username` / `R member_password` (the
  EXISTING `SLICE_REVEAL_FIELDS` prints them — no
  server/seed.ts change here); pair count 499 → 507
  (member identity + pii + seat + credential = 4,
  record operation + document = 2, attribute PUTs = 2).

- [ ] **Step 1: Write the failing projection test**

Create `tests/slices-acl-projection.test.ts` (the
`tests/slices-record-binding.test.ts:28-42` shape —
seed, claim, adapter reads):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import {
    postTestPlanSlices, sliceEntityId,
} from '../api/test-plan-slices.ts';
import { testHashPassword } from './mock-seed.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { claimToken } from './token-fixtures.ts';
import { getRecordAttributesByRecord } from
    '../web-app/app/adapters/record-attributes.ts';
import { deriveMembershipsForIdentity } from
    '../api/derive-memberships.ts';
import { projectInstanceFields } from
    '../web-app/app/presenters/record-detail.ts';
import { projectClaimRolesForOrganization } from
    '../api/authorization.ts';

test(
    'the R seed gives R21 its member seat and its'
    + ' ACL subject',
    async () => {
        const db = memoryDbAdapter();
        await postTestPlanSlices(
            db, { hashPassword: testHashPassword },
        );
        const organization = sliceEntityId('r-org');
        const memberId = sliceEntityId('r-member');
        const seats =
            await deriveMembershipsForIdentity(
                db, memberId,
            );
        assert.equal(seats.length, 1);
        assert.equal(seats[0]!.type, 'member');
        assert.equal(
            seats[0]!.organization_id, organization,
        );
        const memberRoles = [
            'member:' + organization,
        ];
        const ctx = createRequestContext(
            db,
            await claimToken({
                sub: memberId,
                organization,
                organizations: [organization],
                roles: memberRoles,
            }),
        );
        const recordId =
            sliceEntityId('r-record-review');
        const attributes =
            await getRecordAttributesByRecord(
                ctx, recordId,
            );
        assert.deepEqual(
            attributes.map((a) => a.id),
            [
                sliceEntityId('r-attr-review-notes'),
                sliceEntityId('r-attr-review-limit'),
            ],
        );
        const memberFields = projectInstanceFields(
            attributes,
            new Map(),
            projectClaimRolesForOrganization(
                memberRoles, organization,
            ),
        );
        assert.deepEqual(
            memberFields.map((f) => ({
                attributeId: f.attributeId,
                access: f.access,
            })),
            [{
                attributeId: sliceEntityId(
                    'r-attr-review-notes',
                ),
                access: 'readonly',
            }],
        );
        const adminFields = projectInstanceFields(
            attributes,
            new Map(),
            projectClaimRolesForOrganization(
                ['admin:' + organization],
                organization,
            ),
        );
        assert.deepEqual(
            adminFields.map((f) => f.access),
            ['writable', 'writable'],
        );
    },
);
```

- [ ] **Step 2: Run — expect red**

Run the single-file command against
`tests/slices-acl-projection.test.ts`. Expected:
`sliceEntityId('r-member')` throws
`no slice id for r-member`.

- [ ] **Step 3: Add the five slice ids**

Append to `SLICE_ENTITY_IDS` after
`'r-wo-archive-move'` (five ids minted once via
`generateIdentifier()` while writing this plan — the
`857ac8cd` way; paste them verbatim):

```ts
    'r-member': 'GIo3puu_xoFWELY0Dsdklg',
    'r-record-review': 'YibTo-BhicvsQvsyJxaW_A',
    'r-state-record-review': 'EKEYE6Rc0Pxwaf0aXWyttQ',
    'r-attr-review-notes': 'k6_pWZzmIyk1Z2nTGjW7lQ',
    'r-attr-review-limit': 'IZz4eActXfrcP9kHSnCbqQ',
```

(Literal ids, never computed at seed time.)

- [ ] **Step 4: Implement `formRExtras` and its writes**

In `api/test-plan-slices.ts`:

1. Import `DEFAULT_ATTRIBUTE_ACL_ROLES` from
   `'./types.ts'` (extend the existing import).
2. Beside `formKExtras` (after it):

```ts
type RExtras = {
    readonly member: ExtraIdentity;
    readonly record: {
        readonly body: Record<string, unknown>;
        readonly messagePairs:
            RecordWriteMessagePairs;
    };
    readonly attributePuts: readonly MessagePair[];
};

// The R21 subject: a second R record type carrying two
// explicit-ACL attributes, seeded as an operator would
// write it today — create an empty type, PUT an
// attribute, PUT an attribute (three operation ids).
// Roles are spelled, never stamped. Customer Profile
// cannot host this: R16–R20 edit it, and the composed
// edit path is R21's very subject.
async function formRExtras(
    organizationId: string,
    adminId: string,
    requestAt: string,
): Promise<RExtras> {
    const member = await formExtraIdentity(
        sliceEntityId('r-member'),
        'R Member',
        'r-member@test-plan.example',
        requestAt,
        organizationId,
    );
    const recordId =
        sliceEntityId('r-record-review');
    const body: Record<string, unknown> = {
        kind: 'create',
        id: recordId,
        record: {
            organization_id: organizationId,
            name: 'Account Review',
            description:
                'ACL projection subject (R21);'
                + ' no case edits it.',
            position: 2,
        },
        attributes: [],
        initialState: 'active',
        initialStateEventId:
            sliceEntityId('r-state-record-review'),
        initialStateAt: requestAt,
    };
    const validated = validateRecordWriteBody(body);
    const operation = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                RECORD_TYPES_COLLECTION_PATTERN,
                recordId,
            ),
            routePattern:
                RECORD_TYPES_COLLECTION_PATTERN,
            idParams: [organizationId],
            op: true,
            organization: organizationId,
            requesterIdentityId: adminId,
            body,
        },
        requestAt,
    );
    const document = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                RECORD_TYPE_DETAIL_PATTERN,
                recordId,
            ),
            routePattern:
                RECORD_TYPE_DETAIL_PATTERN,
            idParams: [organizationId, recordId],
            organization: organizationId,
            requesterIdentityId: adminId,
            body: recordDocumentBodyOf(validated),
        },
        requestAt,
    );
    const attributeRows = [
        {
            id: sliceEntityId(
                'r-attr-review-notes',
            ),
            body: {
                name: 'Owner Notes',
                attribute_type: 'text',
                sort_order: 1,
                options: [],
                constraints: [],
                read_roles: [
                    ...DEFAULT_ATTRIBUTE_ACL_ROLES,
                ],
                write_roles: ['admin'],
            },
        },
        {
            id: sliceEntityId(
                'r-attr-review-limit',
            ),
            body: {
                name: 'Credit Limit',
                attribute_type: 'text',
                sort_order: 2,
                options: [],
                constraints: [],
                read_roles: ['admin'],
                write_roles: ['admin'],
            },
        },
    ];
    const attributePuts: MessagePair[] = [];
    for (const row of attributeRows) {
        attributePuts.push(
            await formSeedMessagePair(
                {
                    key: seedMessagePairKey(
                        ATTRIBUTE_DETAIL_PATTERN,
                        row.id,
                    ),
                    routePattern:
                        ATTRIBUTE_DETAIL_PATTERN,
                    idParams: [
                        organizationId,
                        recordId,
                        row.id,
                    ],
                    organization: organizationId,
                    requesterIdentityId: adminId,
                    body: row.body,
                },
                requestAt,
            ),
        );
    }
    return {
        member,
        record: {
            body,
            messagePairs: {
                operation,
                document,
                attributePuts: [],
                attributeDeletes: [],
            },
        },
        attributePuts,
    };
}
```

   (The nested-PUT pairs form at
   `ATTRIBUTE_DETAIL_PATTERN`, whose seed response spec
   runs `nestedAttributeWireOf` — the route's own gate —
   so each body validates at formation. The record's
   `messagePairs.attributePuts` is EMPTY: the create
   carries no attributes; the two PUTs append as their
   own pairs, the operator's three-operation ledger.)

3. Declare the collector beside `kReviews`
   (~:3146): `const rSubjects: RExtras[] = [];`
4. Add the branch after the `section === 'K'` arm:

```ts
        } else if (section === 'R') {
            const extra = await formRExtras(
                slice.organizationId,
                slice.adminId,
                requestAt,
            );
            rSubjects.push(extra);
            extras.push({
                identities: [extra.member],
            });
            recipients.push({
                identityId:
                    sliceEntityId('r-member'),
                email:
                    'r-member@test-plan.example',
            });
            reveal = {
                ...reveal,
                memberUsername:
                    'r-member@test-plan.example',
                memberPassword: '',
            };
```

5. In the transaction, after the `f2Flows` loop:

```ts
            for (const extra of rSubjects) {
                await postRecordWriteOp(
                    view,
                    extra.record.body,
                    SYSTEM_MEMBER_ID,
                    extra.record.messagePairs,
                );
                for (
                    const pair
                    of extra.attributePuts
                ) {
                    await appendMessagePair(
                        view, pair,
                    );
                }
            }
```

- [ ] **Step 5: Run the projection test — green**

Run `tests/slices-acl-projection.test.ts`. Expected:
green.

- [ ] **Step 6: Move the counts and the sibling tests**

1. `tests/test-plan-slices.test.ts:48`:
   `const EXPECTED_SLICE_MESSAGE_PAIRS = 499;` → `507`.
2. The `'garden slices seed Customer Profile'` case:
   replace its two assertions

```ts
        assert.equal(
            records.length, 1, section,
        );
        assert.equal(
            records[0]!.name,
            'Customer Profile',
            section,
        );
```

   with

```ts
        assert.equal(
            records.length,
            section === 'R' ? 2 : 1,
            section,
        );
        assert.ok(
            records.some(
                (r) => r.name === 'Customer Profile',
            ),
            section,
        );
```

3. `tests/pg-seed.test.ts`: drop `'R'` from the
   `omitExtras` array, and beside the `gMember` match
   add:

```ts
    const rMember = text.match(
        /^R\tmember_password\t(.+)$/m,
    );
    assert.ok(rMember);
    assert.ok(
        (rMember[1] ?? '').length >= 16,
    );
```

- [ ] **Step 7: Run the moved suites**

Run `tests/test-plan-slices.test.ts`,
`tests/pg-seed.test.ts`, and
`tests/slices-record-binding.test.ts` (the R garden must
be untouched). Expected: all green. If the pair count
lands anywhere but 507, STOP — the seed wrote more or
less than 4 + 2 + 2 new pairs; do not chase the count by
editing the assertion.

- [ ] **Step 8: Reword TEST-PLAN R1 and R21**

R1 — replace its final sentence, currently:

```
  Parallel
  (A3 `--test-plan-slices`): Customer Profile only.
```

with:

```
  Parallel (A3 `--test-plan-slices`): Customer
  Profile and Account Review (the R21 subject;
  never edit it).
```

R21 — replace the whole case with:

```
- [ ] **R21** ACL projection (member vs admin) on
  Account Review. As the R admin, click New instance:
  Owner Notes and Credit Limit both render
  `data-access="writable"`. Sign in as the R
  `member_*` credentials, open the instance: Owner
  Notes renders `data-access="readonly"`; Credit
  Limit is absent (`read_roles: ['admin']`). PASS:
  projection matches held roles; no ACL editing UI on
  this page (ACLs are set only by
  `PUT …/attributes/:id`). Serial (A3 `--mock-data`):
  set the roles by the nested PUT on a record no case
  edits.
```

- [ ] **Step 9: Validate and commit**

Run `./validate`; expect green.

```bash
git add api/test-plan-slices.ts \
    tests/test-plan-slices.test.ts \
    tests/pg-seed.test.ts \
    tests/slices-acl-projection.test.ts TEST-PLAN.md
git commit -m "Seed an R member seat and ACL subject"
```

### Task 17: Gate — the composed edit carries each ACL forward (§7)

**Doctrine:** Commandment II (an admin's restriction
lifted by a rename is a broken covenant); Article
"validate at the gates" (the validator's key set is
UNCHANGED — the client still cannot send roles,
correctly); risks the Sin of the Cache (no ACL cache —
one read of the stored heads per edit, the instance
gates' own read).

**Files:**
- Modify: `api/routes.ts` (`recordAttributeDocumentBodyOf`
  header comment ~:825-828; `formRecordWriteMessagePairs`
  ~:857-908)
- Test: `tests/api-record-types-composed-op.test.ts`
  (one case beside the ~:294 edit case)

**Interfaces:**
- Consumes: `loadAttributeSchemaById(db, organization,
  b.id)` (~:985-1008) — runs BEFORE the transaction
  (`formRecordWriteMessagePairs` is called outside
  `postRecordWriteOp`'s tx at ~:5118-5131), so the
  await-only-row-ops covenant holds.
- Produces: composed-edit semantics — an attribute id
  already stored keeps its stored `read_roles` /
  `write_roles`; a NEW attribute keeps the default. The
  ONLY writer of an ACL is the nested attribute PUT.

- [ ] **Step 1: Write the failing test**

Append to `tests/api-record-types-composed-op.test.ts`
(reusing `adminDb`, `req`, `COLLECTION`, `DETAIL`,
`ATTR_DETAIL`, `TYPE_ID`, `ATTR_ID`, `createBody`,
`generateIdentifier`, `AT`, `ORGANIZATION`):

```ts
test('composed edit carries each stored ACL forward '
+ '— a rename never resets a restriction',
async () => {
    const { db, adminToken } = await adminDb();
    const attr2Id = generateIdentifier();
    const body = createBody(TYPE_ID, ATTR_ID, 'Asset');
    (body['attributes'] as unknown[]).push({
        id: attr2Id,
        organization_id: ORGANIZATION,
        record_id: TYPE_ID,
        name: 'Notes',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
    });
    const create = await handleRequest(db, req(
        'POST', COLLECTION, adminToken, body,
    ));
    assert.equal(create.status, 201);

    const restrict = await handleRequest(db, req(
        'PUT', ATTR_DETAIL, adminToken, {
            name: 'Priority',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
            read_roles: ['admin'],
            write_roles: ['admin'],
        },
    ));
    assert.equal(restrict.status, 201);

    const edit = await handleRequest(db, req(
        'POST', COLLECTION, adminToken, {
            kind: 'edit',
            id: TYPE_ID,
            record: {
                organization_id: ORGANIZATION,
                name: 'Asset',
                description: 'Asset desc',
                position: 1,
            },
            attributes: [
                {
                    id: ATTR_ID,
                    organization_id: ORGANIZATION,
                    record_id: TYPE_ID,
                    name: 'Priority',
                    attribute_type: 'text',
                    sort_order: 0,
                    options: [],
                    constraints: [],
                },
                {
                    id: attr2Id,
                    organization_id: ORGANIZATION,
                    record_id: TYPE_ID,
                    name: 'Notes v2',
                    attribute_type: 'text',
                    sort_order: 1,
                    options: [],
                    constraints: [],
                },
            ],
            state: 'active',
            removedAttributeIds: [],
        },
    ));
    assert.equal(edit.status, 201);

    const restricted = await handleRequest(db, req(
        'GET', ATTR_DETAIL, adminToken,
    ));
    assert.equal(restricted.status, 200);
    const restrictedRow =
        await restricted.json() as {
            read_roles: string[];
            write_roles: string[];
        };
    assert.deepEqual(
        restrictedRow.read_roles, ['admin'],
    );
    assert.deepEqual(
        restrictedRow.write_roles, ['admin'],
    );

    const renamed = await handleRequest(db, req(
        'GET',
        DETAIL + '/attributes/' + attr2Id,
        adminToken,
    ));
    assert.equal(renamed.status, 200);
    const renamedRow = await renamed.json() as {
        name: string;
        read_roles: string[];
        write_roles: string[];
    };
    assert.equal(renamedRow.name, 'Notes v2');
    assert.deepEqual(
        renamedRow.read_roles,
        ['member', 'admin'],
    );
    assert.deepEqual(
        renamedRow.write_roles,
        ['member', 'admin'],
    );
});
```

- [ ] **Step 2: Run — expect red**

Run the single-file command against
`tests/api-record-types-composed-op.test.ts`. Expected:
the new case fails at `restrictedRow.read_roles` —
today's composed edit re-PUTs every attribute through
`recordAttributeDocumentBodyOf`, which stamps
`DEFAULT_ATTRIBUTE_ACL_ROLES` because the composed body
can never carry roles (`RECORD_ATTRIBUTE_BODY_KEYS`),
so the GET reads `['member','admin']`.

- [ ] **Step 3: Implement**

In `api/routes.ts`, `formRecordWriteMessagePairs`: load
the stored heads once for an edit, and hand each
already-present attribute its stored arrays (which
`recordAttributeDocumentBodyOf` keeps — it only stamps
when the body carries none):

```ts
    // Covenant: an ACL is set only by the nested
    // attribute PUT; the composed edit carries each
    // stored ACL forward, and a new attribute takes
    // the default. The composed body can never carry
    // roles (the validator's key set — correctly).
    const storedAcl = b.kind === 'edit'
        ? await loadAttributeSchemaById(
            db, organization, b.id,
        )
        : undefined;
    const attributePuts = await Promise.all(
        b.attributes.map(async (attr) => {
            const stored = storedAcl?.get(attr.id);
            const raw = attr as unknown as
                Record<string, unknown>;
            const attributeBody =
                recordAttributeDocumentBodyOf(
                    stored === undefined
                        ? raw
                        : {
                            ...raw,
                            read_roles: [
                                ...stored.readRoles,
                            ],
                            write_roles: [
                                ...stored.writeRoles,
                            ],
                        },
                );
            return formDocumentMessagePairFor(db, {
                routePattern:
                    ATTRIBUTE_DETAIL_PATTERN,
                params: [
                    organization, b.id, attr.id,
                ],
                body: attributeBody,
                requesterIdentityId: actor,
                requestAt: messagePair.requestAt,
                operationId: messagePair.operationId,
                organization,
            });
        }),
    );
```

Rewrite `recordAttributeDocumentBodyOf`'s header comment
(~:825-828) to state the covenant:

```ts
// Nested attribute storage body: strip id /
// organization_id / record_id (parentage is the URI
// under the type). ACL arrays pass through when given;
// DEFAULT_ATTRIBUTE_ACL_ROLES stamps only a body that
// carries none — a genuinely NEW attribute. The
// composed edit hands each existing attribute its
// stored arrays (formRecordWriteMessagePairs), so the
// nested attribute PUT stays the only ACL writer.
```

- [ ] **Step 4: Run — green**

Run the test file. Expected: all cases green (the
RESTRICT-409, member-403, and forged-org cases prove the
edit path still validates; the new case proves the
carry-forward).

- [ ] **Step 5: Validate and commit**

Run `./validate`; expect green.

```bash
git add api/routes.ts \
    tests/api-record-types-composed-op.test.ts
git commit -m "Carry stored ACLs through composed edit"
```

### Task 18: Seed — the G reveal prints erasable_* (§8)

**Doctrine:** Commandment I (A3's reveal must name every
credential the plan's cases use); two entries, nothing in
`api/`, pair count unchanged.

**Files:**
- Modify: `server/seed.ts` (`SLICE_REVEAL_FIELDS`,
  after the `memberPassword` entry, before `flowId`
  ~:197)
- Modify: `tests/pg-seed.test.ts` (the TSV case ~:246;
  the omit-absent case ~:316)

**Interfaces:**
- Consumes: `TestPlanSliceReveal.erasableUsername` /
  `.erasablePassword` (already typed and filled —
  `api/test-plan-slices.ts:135-136, 3212-3214`,
  `fillPasswords`).
- Produces: `G\terasable_username\t…` and
  `G\terasable_password\t…` TSV rows.

- [ ] **Step 1: Extend the two tests (red)**

In `tests/pg-seed.test.ts`:

1. The `'formatTestPlanSliceCredentials is TSV'` case:
   give its G object two more fields —

```ts
            erasableUsername:
                'g-erasable@test-plan.example',
            erasablePassword: 'secret-g-e',
```

   and two more assertions beside the G matches:

```ts
    assert.match(
        text,
        /^G\terasable_username\tg-erasable@/m,
    );
    assert.match(
        text,
        /^G\terasable_password\tsecret-g-e$/m,
    );
```

2. The `'slice credential map omits absent extras'`
   case: add `'erasable_password',` to the
   `extraPasswords` array, and beside the `gMember`
   match add:

```ts
    const gErasable = text.match(
        /^G\terasable_password\t(.+)$/m,
    );
    assert.ok(gErasable);
    assert.ok(
        (gErasable[1] ?? '').length >= 16,
    );
```

- [ ] **Step 2: Run — expect red**

Run the single-file command against
`tests/pg-seed.test.ts`. Expected: the two amended cases
fail — no `erasable_` row prints (the writer's field
table ends at `member_password` then `flow_id`).

- [ ] **Step 3: Implement**

In `server/seed.ts`, `SLICE_REVEAL_FIELDS`, after the
`memberPassword` entry and before `flowId`:

```ts
    { key: 'erasableUsername',
        field: 'erasable_username' },
    { key: 'erasablePassword',
        field: 'erasable_password' },
```

- [ ] **Step 4: Run — green**

Run `tests/pg-seed.test.ts`. Expected: all green.
TEST-PLAN needs nothing — its A3 wording already says
`erasable_*`.

- [ ] **Step 5: Validate and commit**

Run `./validate`; expect green.

```bash
git add server/seed.ts tests/pg-seed.test.ts
git commit -m "Print erasable credentials in G reveal"
```

### Task 19: TEST-PLAN corrections — drift in one commit (§9)

**Doctrine:** Commandment V (the plan must state what the
tree does); Office of Verification (the CSS covenant gets
a pin so the copy cannot drift again). Wording that a
PRODUCT change made true already rode Tasks 1–16; this
commit is drift only.

**Files:**
- Modify: `TEST-PLAN.md` (C4 ~:875-884, K27 ~:2628-2633,
  Summary ~:347/:357/:362/:384/:386, Protocol
  ~:2963-2964, four future-work pointers ~:800, ~:1450,
  ~:2095, ~:2309-2311)
- Create: `tests/objectives-card-width.test.ts`

**Interfaces:**
- Consumes: Tasks 13 and 15 landed (the counts and the
  R15 copy below describe their output); the three
  Known-MCP bullets from Tasks 3 and 13 (verify present;
  author any missing — Ruling 1).
- Produces: browser count 398 → 401 everywhere it is
  written.

- [ ] **Step 1: The CSS pin (green before and after)**

Create `tests/objectives-card-width.test.ts` (the
`tests/fusion-angle-mark.test.ts:40-50` shape):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// C4 / K27 covenant: the Objectives box is one gauge
// column wide on desktop and full-width only under
// 768px. The TEST-PLAN copy states it; this pin keeps
// the CSS honest.

test('the Objectives card is one gauge column wide',
() => {
    const src = readFileSync(
        'web-app/app/styles/components-metrics.css',
        'utf8',
    );
    const rule = '.objective-aggregates-card {\n'
        + '    width:'
        + ' calc((100% - 2 * var(--space-6)) / 3);';
    assert.ok(src.includes(rule));
});

test('the Objectives card is full-width under 768px',
() => {
    const src = readFileSync(
        'web-app/app/styles/responsive.css',
        'utf8',
    );
    const media = src.indexOf(
        '@media (max-width: 767px) {',
    );
    const auto = src.indexOf(
        '.objective-aggregates-card'
        + ' { width: auto; }',
    );
    const close = src.indexOf('\n}', media);
    assert.ok(media >= 0);
    assert.ok(auto > media);
    assert.ok(auto < close);
});
```

Run the single-file command against it. Expected: green
NOW (before any TEST-PLAN edit) — if red, STOP: the CSS
moved and the ruled covenant needs re-reading, not a
looser pin.

- [ ] **Step 2: C4 and K27**

C4: replace

```
  share the same card chrome) and a full-width Objectives
  box below (card title "Objectives"). PASS:
```

with

```
  share the same card chrome) and, below the grid, an
  Objectives box one gauge column wide
  (`.objective-aggregates-card`,
  `calc((100% - 2 * var(--space-6)) / 3)`; full width
  only under 768px; card title "Objectives"). PASS:
```

K27: replace `(full-width row below; card title
"Objectives")` with `(below the grid, one gauge column
wide; card title "Objectives")` — keep the rest of the
sentence.

- [ ] **Step 3: The counts**

Five sites, one number each:
1. Summary table: `| F. Tools | 77 |` → `| F. Tools |
   80 |` (F38a, F38b, F57a).
2. Summary table: `| **Total** | **398** |` →
   `| **Total** | **401** |`.
3. Combined Totals prose: `cases only (398).` →
   `cases only (401).`
4. The green-run line:
   `PASS = AT2 + 398,` → `PASS = AT2 + 401,`.
5. Its follow-up: `sum to AT2 + 398.` →
   `sum to AT2 + 401.`
Then `grep -n '398' TEST-PLAN.md` — expect ZERO hits.

- [ ] **Step 4: R15**

Replace the R15 case (currently "Archive a Record from
its detail page (if a control exists in the toy)…")
with:

```
- [ ] **R15** Open the R2-created Record's detail
  page — never Customer Profile (R16–R21 read it).
  Click Archive; confirm in the house dialog
  (`data-dialog-open="confirm-archive"`). PASS: a
  "Record archived" toast appears, the header badge
  reads Archived, and the Archive button is gone. On
  `records/` the card reads Archived, an Archived
  chip appears beside Active, and toggling the
  Active chip hides the card. There are no numeric
  counts on the chips.
```

- [ ] **Step 5: Protocol and the four pointers**

Five one-for-one text swaps (old → new; backticks are
literal TEST-PLAN markdown):

1. Protocol (~:2963-2964).
   Old: "Implementing those specs is a later session."
   New: "Implementing those specs is tracked in
   [backtick]TODO.md[backtick]."
2. B11 (~:800).
   Old: "(real sign-up is SP-6;"
   New: "(real sign-up is SP-6 — see
   [backtick]TODO.md[backtick];"
   — the rest of the parenthetical stays.
3. Invitations note (~:2095).
   Old: "DEFERRED (not built): email delivery."
   New: "DEFERRED: email delivery (see
   [backtick]TODO.md[backtick])."
4. Billing stub (~:2309-2311).
   Old: "These tests verify the page loads and the
   sidebar nav link works — functional billing tests
   will be added when the feature is implemented."
   New: "These tests verify the page loads and the
   sidebar nav link works; functional billing is
   tracked in [backtick]TODO.md[backtick]."
5. Flow tags (~:1450-1451).
   Old: "Revisit this note if/when a designer "tag
   current" action lands.)"
   New: "A designer "tag current" action is tracked in
   [backtick]TODO.md[backtick].)"

Write a real backtick wherever [backtick] appears.
Conditional case notes (F2, R6–R8) STAY.

- [ ] **Step 6: Verify the three Known-MCP bullets**

`grep -n 'replaced on every commit\|Chords carry\|selects like Tab' TEST-PLAN.md`
— expect three hits (Tasks 3 and 13). Author any missing
one from those tasks' Step texts.

- [ ] **Step 7: Validate and commit**

Run `./validate`; expect green.

```bash
git add TEST-PLAN.md tests/objectives-card-width.test.ts
git commit -m "Correct TEST-PLAN drift for run four"
```

### Task 20: TODO.md — the move (§10a)

**Doctrine:** Office of the Commit — a MOVE commit
carries nothing else: the section travels verbatim; the
only new bytes are the `# TODO` title line and a blank
line.

**Files:**
- Create: `TODO.md`
- Modify: `ARCHITECTURE.md` (delete `## Later work`,
  ~:261-303 — the heading through the last bullet,
  leaving `## Do not resurrect` adjacent to the KNOWN
  seams tail)

**Interfaces:**
- Consumes: nothing.
- Produces: `TODO.md` exists with `## Later work`
  holding the seventeen bullets VERBATIM; Task 21 points
  at it; Task 22 reshapes it. (No `validate` change yet:
  the line-count table is an explicit list, so an
  unlisted `TODO.md` passes; Task 23 adds its row.)

- [ ] **Step 1: Implement**

`TODO.md` (new file):

```
# TODO

## Later work

<the seventeen bullets, byte-for-byte from
ARCHITECTURE.md — copy, do not retype>
```

`ARCHITECTURE.md`: delete from the `## Later work`
heading line through the final bullet line (`— \`web-app/
app/measure.ts\``), plus the blank line separating it
from `## Do not resurrect`, so exactly one blank line
remains between the AUDIT.md sentence and
`## Do not resurrect`. Nothing else changes.

Verify the move is pure — the section must be
byte-identical to what HEAD held:

```bash
diff \
    <(sed -n '/^## Later work/,$p' TODO.md) \
    <(git show HEAD:ARCHITECTURE.md \
        | sed -n \
        '/^## Later work/,/^## Do not resurrect/p' \
        | sed '$d' | sed '${/^$/d;}')
```

Expected: no output. `git diff --stat` shows exactly the
two files.

- [ ] **Step 2: Validate and commit**

Run `./validate`; expect green (ARCHITECTURE.md drops
~44 lines below its 450 ceiling; root-md lint covers
TODO.md's 78-char lines — verbatim bullets already
comply).

```bash
git add TODO.md ARCHITECTURE.md
git commit -m "Move later work into TODO.md"
```

### Task 21: TODO.md — the pointers (§10b)

**Doctrine:** Commandment III (the router tables name
every map); the close protocol is RESTATED here — the
dated spec it comes from is never edited.

**Files:**
- Modify: `AGENTS.md` (the `## Read next` table)
- Modify: `README.md` (the `## Docs` table)
- Modify: `TODO.md` (append `## Close protocol`)

**Interfaces:**
- Consumes: Task 20's `TODO.md`.
- Produces: the pointer rows Task 23's gate carves out
  (Ruling 4); the close protocol Task 22 keeps as the
  file's last section.

- [ ] **Step 1: Implement**

1. `AGENTS.md` `## Read next`: change the
   ARCHITECTURE.md row to
   `| ARCHITECTURE.md | tenancy, KNOWN seams,
   do-not-resurrect |` and append after the TEST-PLAN.md
   row:
   `| TODO.md | critical path, later work, sequencing |`
2. `README.md` `## Docs`: append the same row after the
   TEST-PLAN.md row.
3. `TODO.md`: append:

```
## Close protocol

The pin flips red → fix the test to the new truth (or
delete it if the old incomplete behavior is gone) →
remove the bullet here → remove the named comment at
its `file:line` → for a KNOWN seam, remove the
ARCHITECTURE.md bullet in the same commit → AUDIT.md's
`m` is the new seam count.
```

- [ ] **Step 2: Validate and commit**

Run `./validate`; expect green (AGENTS.md stays under
300 lines; README.md under 150).

```bash
git add AGENTS.md README.md TODO.md
git commit -m "Point the doc router at TODO.md"
```

### Task 22: TODO.md — the critical path, merges, and sequencing (§10c)

**Doctrine:** Commandment V; risks the Sin of Magical
Values in reverse — every `file:line` in this content
must be TRUE AT HEAD. Files this plan touched have
shifted; the anchor table below re-derives them. Refs
into untouched files keep the spec's numbers.

**Files:**
- Modify: `TODO.md` (insert `## Critical path` before
  `## Later work`; rewrite `## Later work`; insert
  `## Sequencing` before `## Close protocol`)

**Interfaces:**
- Consumes: Tasks 20–21's file; the whole tree at
  Task 19's head (for line-ref re-derivation).
- Produces: the gated shape Task 23 asserts
  (`## Critical path` exactly once) and the item-5
  absorption sentence Task 24 relies on.

**Anchor table** — re-derive these refs at HEAD with
`grep -n` before writing them (files touched by Tasks
1–19); every other ref below is verbatim from the spec
and its file is untouched:

| Ref to re-derive | grep anchor |
|---|---|
| flows/detail.ts selection-writing sites | `selection: {` — the four handler sites: delete-nodes, delete-edge, add-node, and the flow-changes subscriber |
| flow-designer.ts in-place viewBox mutations | `vb.x =` — the four method sites: panToRevealSelected, handlePanelTransition, withCanvasSize, applyFitToBox |
| flow-layout.ts rotation lines | `graphLandscape !== canvasLandscape` |
| flow-fsm-reduce.ts wheel-zoom block | `const prevZoom = state.zoom;` |
| flow-interactions.ts button zoom | `function applyButtonZoom` |
| flow-interactions.ts zoom constants | `const MIN_ZOOM` |
| flow-designer.ts noteMutation | `#noteMutation(): void` |
| derive-flows.ts hasUndoHistory | `hasUndoHistory: (messagePairCount` |
| test-plan-slices.ts reveal keys | `erasableUsername` |
| seed.ts reveal writer | `SLICE_REVEAL_FIELDS` |
| pg-seed.test.ts key-set copy | `extraPasswords = [` |
| routes.ts absent-role readings | `attributeSchemaOf` / `recordAttributeDocumentBodyOf` |
| records/detail flow-header dropdown | `renderBindingSlot` |
| record-detail.ts Edit for members | `id="record-edit-btn"` |
| routes.ts binding PUT | `postFlowRecordDocumentOp(` under the flow-records route |
| TEST-PLAN flow-tag note | `tag current` |
| TEST-PLAN F6 ZIP note | `does **not** rebind` |
| TEST-PLAN doc debt | `doc debt` |
| FLOW-CANVAS AI checkboxes | `display-only` |

- [ ] **Step 1: Write the content**

Replace `TODO.md`'s body so the file reads: `# TODO`,
an intro couplet, `## Critical path`, `## Later work`,
`## Sequencing`, `## Close protocol` (Task 21's text,
unchanged). Full content (refs marked `@` come from the
anchor table):

```
# TODO

The single home for later work. An item leaves this
file by shipping; `## Close protocol` is the exit.

## Critical path

Twelve items, in this order — each its own brainstorm →
spec → plan → ship cycle, implemented sequentially. A
"Merged:" clause names bullets absorbed from
`## Later work`; they keep their oracles.

1. Remove the lifecycle trio — fold `state` /
   `state_at` / `state_event_id` out of every document
   body (Decision 7): the reduction
   (`api/derive-documents.ts:148-157`), the stamp
   (`api/document-family.ts:118`), every derive
   (`api/derive-ideas.ts:54, 83`,
   `api/derive-projects.ts:39, 70`,
   `api/derive-flows.ts:75`), the seeds
   (`api/mock-data/seed-message-pairs.ts:733, 913`),
   and the validators' trio-key gates; lifecycle
   becomes its own event rows. Merged: no lifecycle
   transition table at any gate.
2. Credentials out of the message; views for the app —
   hoist `Authenticate:` (ideally the only plaintext
   credential path) into its own column; a view that
   omits it and omits deleted rows; a schema-owner
   role and view-only application roles (read-only,
   write-only, read-write), none able to read the
   column. Merged: token-at-rest hashing (closes KNOWN
   seam "A raw dump still has verbatim auth
   messages" — `tests/api-shadow-ledger-auth.test.ts`);
   two-role views
   (`tests/backend-postgres.test.ts:391`); physical
   PII erasure (closes KNOWN seam "Erased PII persists
   as superseded pairs" —
   `tests/api-pii-tombstone.test.ts`); the in-band
   plaintext comment at `api/mock-data.ts:151-152`
   (owner call).
3. Cachability — headers, `HEAD`, conditional
   requests, and the rest; the brainstorm presents its
   questions from most to least desirable. Start:
   `server/http-server.ts` `NO_STORE` and
   `CONTENT_SECURITY_POLICY`.
4. `/status` — `{ up: boolean, components: {
   postgres: boolean } }`; `up` is true when every
   component is; built for more components. Item 10's
   health probe.
5. Execute TEST-PLAN.md with up to 48 subagents —
   after the run-four remediation ships; the
   Protocol's one-profile, hunters-in-turn contract is
   revisited for 48. Merged: the five run-four
   mitigation stubs (absorbed by the remediation
   spec).
6. Re-implement workbox, work orders, and flows —
   nodes become processes; process kinds: record
   modification (current), external process
   synchronization (new), directed cyclic graph (flow
   and sub-flow), directed cyclic graph (sub-graph); a
   chat on every record and work order (consumes item
   8). Merged: READY gate on dangling refs
   (`tests/adapters-flow-publish.test.ts`); locked
   verbs not executed
   (`tests/family-registry.test.ts`); the flow-tag
   designer UI (`TEST-PLAN.md:@`); F6's ZIP import not
   rebinding `flow_records` (`TEST-PLAN.md:@`); the
   canvas seams the remediation leaves — page
   selection writes behind the FSM
   (`web-app/flows/detail.ts:@`, the four
   selection-writing sites), in-place `viewBox`
   mutation
   (`web-app/app/presenters/flow-designer.ts:@`),
   `hasUndoHistory` as `pairs > 1`
   (`api/derive-flows.ts:@`), rotation only on the
   toggle path (`web-app/app/flow-layout.ts:@`), and
   the mirror trigger.
7. Headless AI worker — a server-side process that
   watches each AI process-worker's workbox, claims,
   assembles the record definition, the attribute
   values (which — decided in the brainstorm), the
   node instructions, and whatever else serves, asks
   the model to follow them precisely, and applies the
   reply: attribute updates in record-PATCH form and
   the outgoing edge. API-only. Merged: roster seat
   naming an AI agent
   (`tests/family-registry.test.ts:112-113`);
   FLOW-CANVAS.md's display-only AI checkboxes
   (`FLOW-CANVAS.md:@`); `withNodeTaskInstructions`
   already stores the instructions.
8. Chats at `/api/chats` — attachable to any document
   at `/…/:collection/:id/chat` with as little
   ceremony as the plane allows.
9. Genericity — DRY, even once (the indulgence); spec
   away every nit. Merged: `putRecordInstance` PATCHes
   (name lie —
   `tests/adapters-record-instances.test.ts`,
   `tests/api-instances-create.test.ts`); same-body
   PATCH appends 201
   (`tests/api-instances-create.test.ts:585-586`);
   member detail's redundant GET trio
   (`web-app/members/detail.ts`); two zoom
   implementations and two constant sets
   (`web-app/app/flow-fsm-reduce.ts:@`,
   `web-app/app/flow-interactions.ts:@`);
   `#noteMutation` / `history()` beside
   `advanceHistory`
   (`web-app/app/presenters/flow-designer.ts:@`); four
   hand-kept copies of the reveal key set
   (`api/test-plan-slices.ts:@`, `server/seed.ts:@`,
   `tests/pg-seed.test.ts:@`); the second instances
   the remediation added (`formRExtras`' record
   create, `canvasFocusOf`'s walk); the undo path's
   duplicated pure helpers
   (`api/flow-graph-diff.ts:16-26`); the dead
   `FK_SPECIAL` map
   (`web-app/app/schema-svg.ts:100-110` — remove the
   comment at `schema-svg.ts:100-110` when done);
   `callerOrganizationIds`, zero callers
   (`api/request-auth.ts:189-197` — remove the comment
   at `request-auth.ts:189-191` when done); the
   test-only `deriveRecordStateHistory` alias
   (`api/derive-record-types.ts:185-189` — remove the
   comment at `derive-record-types.ts:185-189` when
   done); the `#flowDesc` stub
   (`web-app/app/presenters/flow-stats.ts:414-417` —
   remove the comment at `flow-stats.ts:414-415` when
   done); `toRecordAttribute`'s `??` ACL default
   (`web-app/app/adapters/record-attributes.ts:76-79`)
   and the two readings of an absent role array
   (`api/routes.ts:@` — `attributeSchemaOf` vs
   `recordAttributeDocumentBodyOf`); the nested
   key-set follow-on (`api/validators.ts:705-713` —
   remove the comment at `validators.ts:705-713` when
   done); `handleSpace` dispatching
   `isFormFocused: false` unconditionally; Delete's
   `preventDefault` with nothing selected.
10. Production readiness, repository and Render —
    block cross-environment connections,
    high-availability app and Postgres, and the rest.
    Merged: the single-mint-process KNOWN seam's
    precondition — record the claim-expiry decision as
    its own event before any multi-process deployment
    (`api/derive-states.ts:811-823` — remove the
    comment at `derive-states.ts:811-823` when done);
    the `TRUSTED_PROXY_HOPS` throttle seam
    (`tests/http-throttle.test.ts`);
    stale-until-navigation once there are processes to
    notify (`tests/advisory-lock.test.ts`). Consumes
    item 4.
11. Fewer JSON parse/stringify — byte-stream header
    setting, mechanical sympathy and simplicity for
    the processor; measured first
    (`./measure --profile`). Merged: the deferred
    content-coding seams
    (`shared/http-message/body.ts:76-79` and
    `shared/http-message/content-coding.ts:5-7` —
    revise both comments when done).
12. Simulated latency by environment — when
    `FUSION_ANGLE_ENVIRONMENT` is exactly `local` and
    `FUSION_ANGLE_LATENCY` is a millisecond count,
    both present and non-empty, every API request
    takes the existing log-normal sampler
    (`api/latency.ts:18-40`) with
    `mu = ln(FUSION_ANGLE_LATENCY)`; otherwise the
    no-op. Merged: the shim's "both presets pass a
    no-op today" (`api/latency.ts:1-5`,
    `api/db-backed.ts:31-32`, `api/api.ts:2133-2134` —
    revise the three comments when done).

## Later work

Off the critical path; each with its oracle.

- One client 401-recovery voice through
  `redirectToLogin()` with `?return=` —
  `tests/adapters-http-facade.test.ts`
- Toast pause on hover and focus
- Mock seed's fixed 2026-06-15 anchor — after
  2026-09-13 serial-mode FS3 carries in-flight heat
  only
- Profile as its own document,
  `identities/:id/profile`, 404 = no profile — closes
  whole-or-none — `tests/api-identity-document.test.ts`
- Roster rows carry a fabricated empty profile
  (`emptyPersonProfile`) —
  `web-app/app/adapters/members.ts:48`
- `DEFAULT_DIM` stands in for an assessment that never
  happened — `web-app/members/index.ts:52`
- The re-mint refresh is not single-flighted with the
  facade's cookie refresh —
  `web-app/app/adapters/shared.ts:463-464`
- `./measure` harvests error-page timings;
  `page:ready` carries no status —
  `web-app/app/measure.ts`
- The cross-party delegation ledger
  (`api/authentication.ts:884-886`;
  `tests/api-authentication-token.test.ts:678`)
- Passkey, provider-IdP, and corporate-OIDC ceremonies
  (`api/authentication.ts:1595-1597`;
  `tests/api-authentication-authorize.test.ts:225`)
- Per-client multi-audience, DPoP `cnf`, jti reuse
  detection (`api/types.ts:508-510`;
  `shared/access-token-decode.ts:30-31`)
- SP-6 sign-up (`web-app/auth/index.ts:655-663`)
- Billing (`web-app/billing/`)
- Invitation email delivery
- The `≥ N` doc debt (`TEST-PLAN.md:@`)
- Attribute drag-reorder (TEST-PLAN R8)
- The run-four remediation's remaining seams — the
  Objectives sparkline track collapses at 304px
  (`web-app/app/styles/components-metrics.css:80-82`);
  archived records in the flow-header dropdown
  (`web-app/flows/detail.ts:@`, `renderBindingSlot`);
  Edit rendered for members on record detail
  (`web-app/app/presenters/record-detail.ts:@`); the
  binding PUT not probing record existence
  (`api/routes.ts:@`); R12 without a positive subject;
  stale G9 / R6 / R7 notes
- The Deno migration as one block — six specs, strict
  1 → 6, 3 and 4 may swap after Spec 2's measurements,
  Spec 6 optional (the measurements after Spec 5
  decide); the roadmap is `9620d38c`
- Stale-history comment cleanup as one pass — about 35
  code and 32 test comments describe a past state as
  present; the enumeration is the run-four
  remediation's Evidence

## Sequencing

- 8 → 6 (the chat clause consumes chats)
- 4 → 10 (the health probe consumes `/status`)
- Item 2's token-at-rest hashing and physical PII
  erasure close their KNOWN seams — the closer removes
  the ARCHITECTURE.md bullet and this file's line in
  one commit
- The profile document precedes the roster-profile and
  `DEFAULT_DIM` bullets
- The mock-seed anchor bullet activates after
  2026-09-13
- The Deno specs run strictly 1 → 6 (3 and 4 may swap
  after Spec 2's measurements; Spec 6 optional)
- `api/derive-states.ts:811-823` (claim-expiry as its
  own event) lands before any multi-process deployment
```

- [ ] **Step 2: Re-derive every `@` ref**

Run the anchor table's greps; replace each `:@` with the
real `:N` or `:N-M` at HEAD. Then spot-verify five
verbatim refs (`sed -n '<n>p' <file>`) — e.g.
`api/derive-documents.ts:148-157`,
`api/latency.ts:18-40` — to prove the untouched-file
assumption. A ref that no longer matches its anchor is
a STOP: report, do not guess.

- [ ] **Step 3: Validate and commit**

Run `./validate`; expect green (TODO.md is root-linted:
78-char lines, retired-vocabulary scan — the content
above avoids the banned compounds).

```bash
git add TODO.md
git commit -m "Write the TODO critical path"
```

### Task 23: The gate — later work has one home (§10d)

**Doctrine:** Office of Verification (a covenant without
a gate is a wish); the gate is SHELL in `./validate` —
no test greps a doc.

**Files:**
- Modify: `validate` (a block after the retired-vocab
  block; one row in the line-count table)

**Interfaces:**
- Consumes: Tasks 20–22's shape; Ruling 4's carve-out.
- Produces: the standing gate.

- [ ] **Step 1: Implement**

1. Line-count table: compute
   `LINES=$(wc -l < TODO.md)`; ceiling = LINES × 1.5
   rounded UP to the nearest 50
   (`echo $(( ( (LINES * 3 / 2) + 49 ) / 50 * 50 ))`).
   Add the literal row `TODO.md <ceiling>` to the
   heredoc table in `validate` (e.g. a 210-line file →
   `TODO.md 350`).
2. After the retired-vocab block, insert:

```bash
# Later work has one home (run-four remediation §10):
# the section lives in TODO.md and nowhere else, and no
# other root doc defers work in prose. Rows that POINT
# at TODO.md are the sanctioned exception (the
# in-browser-ZIP precedent above).
LATER_HOME_FAIL=
if [ "$(grep -c '^## Later work' ARCHITECTURE.md)" \
    != "0" ]; then
    LATER_HOME_FAIL="${LATER_HOME_FAIL}\
ARCHITECTURE.md: '## Later work' count must be 0
"
fi
if [ "$(grep -c '^## KNOWN seams' ARCHITECTURE.md)" \
    != "1" ]; then
    LATER_HOME_FAIL="${LATER_HOME_FAIL}\
ARCHITECTURE.md: '## KNOWN seams' count must be 1
"
fi
if [ "$(grep -c '^## Critical path' TODO.md)" \
    != "1" ]; then
    LATER_HOME_FAIL="${LATER_HOME_FAIL}\
TODO.md: '## Critical path' count must be 1
"
fi
LATER_PATTERN='later work|\(later\)|not built'
LATER_PATTERN="$LATER_PATTERN|coming soon"
LATER_PATTERN="$LATER_PATTERN|later session"
LATER_PATTERN="$LATER_PATTERN|will be added when"
DEFERRAL_PROSE=$(
    find . -maxdepth 1 -type f -name '*.md' \
        ! -name 'TODO.md' ! -name 'TEST-PLAN.md' \
        -exec grep -nEi "$LATER_PATTERN" {} + \
        2>/dev/null \
    | grep -v 'TODO.md' || true
)

if [ -n "${LATER_HOME_FAIL}${DEFERRAL_PROSE}" ]; then
    echo "Error: later work must live in TODO.md:" >&2
    printf '%s' "${LATER_HOME_FAIL}" >&2
    if [ -n "${DEFERRAL_PROSE}" ]; then
        echo "${DEFERRAL_PROSE}" >&2
    fi
    exit 1
fi
```

- [ ] **Step 2: Prove the gate bites, then passes**

Red probe (no commit): temporarily append a line
`later work test` to `README.md`, run `./validate`,
expect the new error; revert the probe
(`git checkout -- README.md`). Then run `./validate` on
the clean tree — green end to end.

- [ ] **Step 3: Commit**

```bash
git add validate
git commit -m "Gate later-work homing in validate"
```

### Task 24: Housekeeping — remove the absorbed stubs (§11)

**Doctrine:** Office of the Commit (a delete-only
commit); the stubs are tracked (`88d4e4f8`) and absorbed
by the spec + TODO item 5.

**Files:**
- Delete: `docs/superpowers/test-plan-mitigations/`
  (all five files: `2026-08-23-F-F18.md`,
  `2026-08-23-F-F29.md`, `2026-08-23-F-F37.md`,
  `2026-08-23-F-F38.md`, `2026-08-23-R-R15.md`)

**Interfaces:**
- Consumes: Task 22's item-5 absorption sentence.
- Produces: a tree free of absorbed stubs. The
  TEST-PLAN Protocol still NAMES the directory for
  future runs ("Do not create the directory until the
  first cluster exists") — that text stays.

- [ ] **Step 1: Implement**

```bash
git rm docs/superpowers/test-plan-mitigations/*.md
```

(Removes the directory with its last files.)

- [ ] **Step 2: Validate and commit**

Run `./validate`; expect green. Confirm this plan file
is still untracked (`git status --porcelain` shows only
`?? docs/superpowers/plans/…`; it is deleted by hand
when the work ships, per the spec's §11).

```bash
git commit -m "Remove absorbed run-four stubs"
```

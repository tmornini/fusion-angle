# TEST-PLAN Walk Remediation — Handoff Brief

> **Purpose:** everything a fresh session needs to WRITE the
> remediation plan for the 2026-09-02 TEST-PLAN walk, with no
> prior context. This is the brief, not the plan. The new
> session reads this, then authors the plan and executes it.
>
> **Scope chosen by the operator:** FULL + Layer 2 harness —
> doc corrections, red-test-first fixes for the two confirmed
> product defects, the missing R12 Layer 1 pin, AND Layer 2
> CDP reproductions that turn each driver-suspected case into
> a standing test.
>
> This brief is model-agnostic. The root-cause analysis and
> the two confirmed defects were derived by reading the code;
> they do not depend on which model finishes the work.
>
> **Full analysis (read first):** the complete root-cause
> record — evidence, per-case reasoning, the two defect
> mechanisms, and the disposition table — lives in the
> companion file
> `docs/superpowers/plans/2026-09-02-test-plan-walk-analysis.md`.
> This brief assumes its conclusions and does not repeat the
> evidence.

---

## 0. How to use this brief

1. Read it top to bottom once.
2. Read `AGENTS.md` (repo root) — it is binding doctrine. The
   Church of Code scripture and worktree discipline govern
   every step.
3. Create a worktree for this remediation (see §7).
4. Author the plan with the `superpowers:writing-plans`
   discipline (bite-sized TDD tasks, real code, no
   placeholders), saved to
   `docs/superpowers/plans/2026-09-02-test-plan-remediation.md`.
5. Execute red-test-first. A product change lands ONLY behind
   a red test at Layer 1 (`./validate`) or Layer 2
   (`./test-browser`).

---

## 1. Context

- **Repo:** fusion-angle. Deno-only server + browser client,
  one type universe, memory + Postgres backends.
- **Product SHA walked:** `04372ead` (clean).
- **Walk worktree/branch:** `.worktrees/2026-09-02-test-plan-walk`
  on `2026-09-02-test-plan-walk`. The frozen mitigation stubs
  are commit `e5f32f3` on that branch.
- **The walk is Layer 3.** It is exploration and GATES
  NOTHING. A browser observation changes product only through
  a red test at Layer 1 or Layer 2.
- **Walk result:** 401 cases — 381 PASS, 10 FAIL, 8 BLOCKED,
  1 DEFERRED, 1 DRIFT.
- **Driver:** the `browser-use` plugin (CDP over a Chrome
  remote-debug WebSocket). Its input primitives matter to the
  analysis (see §3).

### The ten FAILs
AA33, F12, F14, F23, F26, F28, F37b, R12, R14, R16.

### BLOCKEDs of note
AA32 (Shift not delivered on pointer-up), B21 (in-memory
access JWT not replaceable without js()), WB16 (nav dropped
the POST), I21, I22, SV6/SV7/SV10 (driver offered no second
context — but the harness DOES support two contexts; see §3).

### DRIFT candidates
E10a (action bars hide via `display:none`, not `hidden`),
A3 pin (seed printed 12 human lines incl. Riley; pin text
still says 11).

### The frozen stubs (do NOT rewrite)
`docs/superpowers/test-plan-mitigations/2026-09-02-*.md`
(AA33, F12, F23, F26, F37b, R12, R14, R16). Dated stubs stay
frozen. Implementing them is tracked in `TODO.md`.

---

## 2. Root-cause analysis (the headline)

> Full evidence, per-case reasoning, and the disposition
> table are in the companion analysis file
> `2026-09-02-test-plan-walk-analysis.md`. This section is the
> summary.

**There is no single root cause, and the walk was not
parallel.** Evidence against a shared-jar / concurrency
cause:

- One `browser-use` daemon socket (`bu-default`) was created
  on Sep 2, against a dozen named per-section daemons the
  prior walk left. One client, one cookie jar, one origin.
- No case carries an auth signature: no 429, no auth-page
  bounce, no wrong-identity sidebar chip.
- The daemon log shows ONE "stale session, re-attaching"
  event that landed on the Layout Test flow tab — a
  tab-visibility hiccup during F, not concurrency. "A later
  explorer pass" in the summary is a second SERIAL pass.

The ten FAILs fall into two systemic clusters plus two
genuine defects and one doc-order bug.

### Cluster A — the gesture-driving layer (driver)
The `browser-use` compositor cannot hold a modifier across a
mouse gesture (key-down and key-up fire back to back), new
tabs are born hidden (`background: true`), and stale-session
recovery attaches to the first listed page, not the visible
one. On the product side a double-click is two pointerdowns
on one element id within `DBLCLICK_MS` (400 ms).

- **F23, AA32:** Shift not down at pointer-up → FSM emits
  add-node instead of add-edge. This is the driver limit the
  driving notes already say to record BLOCKED. AA32 was
  scored BLOCKED; F23 should be too, not FAIL. Layer 1 pins
  are green.
- **AA33, AA34:** recurred right after AA32 left stray "New
  State" nodes on an auto-layout flow; the double-click
  opened Review's panel (mis-target after re-flow). Should be
  DEFERRED on AA32, not FAIL. Layer 1 pins decide the writes.
- **F26, F28:** no product rule forbids them. The edge is a
  `<g data-edge-id>` with a wide TRANSPARENT hit path, and
  `#canDelete()` returns true for an edge selection. So
  "Delete disabled / panel didn't open" means the selection
  was not an edge when the toolbar was clicked — a mis-hit,
  not a product bug. Confirm by Layer 2 re-drive (§6).
- **F14:** a viewBox equal to the wrap at zoom 1 is the
  UNTOUCHED identity camera. The props panel is
  `position:absolute` (does not resize the wrap), and Auto
  Fit off leaves the camera alone. So the Zoom-in click never
  took effect — a missed gesture. Camera code is clean.
- **F37b:** recurs immediately after F37a opens a SECOND tab.
  That tab is born hidden and the plan never re-activates tab
  A. Ports render regardless of Auto Layout, and `add-node`
  has no Auto-Layout branch, so the code offers no
  Auto-Layout-specific failure. Leading hypothesis: driven on
  the hidden tab.
- **R12:** gold glow proves the first pointerdown landed. The
  node-panel markup exists only when the panel is open, so
  "no ref rows" most economically means "no panel." There is
  no Layer 1 pin for `buildAttributeRefRow` today. Write that
  pin first (§5) — it decides whether any product fault
  remains.

### Cluster B — the records chain is document-order (seed/plan)
The seed holds EXACTLY ONE Customer Profile instance ("Acme
Corp"), bound to WO01. WB11 binds only it; WB19a mutates it
("Walk Co B"). So:

- **R16** later reads a renamed instance ("Acme Corp"
  overwritten).
- **R14**'s bind picker lacks "Acme" (it now shows the
  renamed value).

Deterministic in document order; nothing parallel. Also:

- **R14**'s unbound submit refusal is the PRODUCT WORKING:
  the API refuses a value-bearing transition on an unbound
  work order, and WB10b already says unbound inputs are
  disabled behind a bind prompt. The R13/R14 "fillable while
  unbound" text PREDATES instance binding → drift. The
  explorer wrote 409 but the mapping gives 400
  (`ValidationError → HTTP_BAD_REQUEST` in `api/api.ts`).
  R14's real PASS line (WO sitting at Review) was never
  checked.

---

## 3. Layer 2 harness reference (for real test code)

The plan's Layer 2 tests must match these EXISTING idioms.

- **Runner:** `./test-browser` bundles the client into
  `$TMPDIR`, runs `tests/browser/*.test.ts` serially against
  an in-process memory-backend origin. Needs Chrome (`CHROME`
  or `CHROME_DEBUG_URL`). Not part of `./validate`; `./crank`
  runs it after `./test-postgres`. `--sanitize-resources`
  only (one CDP socket per file in `beforeAll`).
- **`tests/browser/fixtures.ts`:**
  - `useBrowser()` → `{ get(): Browser }`, one Chrome per
    file via `Deno.test.beforeAll/afterAll`.
  - `withAdminPage(browser, async (page, origin) => { … })`
    — fresh context per test, admin signed in, 120 s bound.
  - `SHIFT = 8` (CDP modifier bit).
  - `stays(page, expr, windowMs)` — bounded NEGATIVE
    assertion (expression keeps its first value). Use for
    "panel did NOT open" / "no node added".
  - `Page` API: `navigate`, `ready(label)`, `waitFor(sel)`,
    `until<T>(expr,label,timeoutMs)`, `evaluate<T>(expr)`,
    `rect(sel,i)`, `center(sel,i)`, `click(sel)`,
    `press(pt,mods)`, `move(pt,mods)`, `release(pt,mods)`,
    `drag(from,to,{steps,modifiers})`, `keyDown/keyUp/key`.
- **`tests/browser/canvas.ts` helpers:** `CANVAS`
  (`svg.flow-canvas`), `WRAP` (`.flow-canvas-wrap`), `NODE`
  (`.flow-node`), `EDGE` (`.flow-edge`), `ONBOARDING`
  (`'Customer Onboarding'`), `openFlow(page,origin,name)
  →flowId`, `nodeIdNamed`, `nodeCount`, `edgeCount`,
  `portSelector(nodeId)`, `nodeSelector(nodeId)`,
  `flowGraph(origin,flowId)`.
- **Existing canvas tests to imitate:** `canvas-gestures`,
  `canvas-keyboard`, `canvas-pan`.
- **No double-click helper exists.** Add one to `canvas.ts`:
  two `press`/`release` pairs on one node/edge center inside
  400 ms (two back-to-back `page.click(sel)` land within the
  window; the FSM reads `Date.now()`).
- **Product canvas facts:** `DBLCLICK_MS = 400`;
  `MIN_DRAG_DISTANCE = 20`; the `<svg>` is REPLACED on every
  commit (query fresh before each gesture); the edge's bbox
  center may miss the bezier — target the edge label or a
  path midpoint via `getPointAtLength`.

---

## 4. Confirmed product defect #1 — F12 Space-steal

**This is a real bug a real mouse reproduces.** The F12 PASS
line is unreachable as written.

**Mechanism:** In pan mode, a pointerdown on a node focuses
it (node has `role="button"`, `tabindex="0"`; the pointerdown
default focus is not prevented). The document-phase keydown
listener in `web-app/app/flow-interactions.ts` handles BOTH
Enter AND Space for a focused node/edge: it dispatches
`canvas-key-activate` (opens the panel) and calls
`e.preventDefault()`. It is on `document`; the pan-toggle
`handleSpace` is on `window`. In the bubble phase document
fires before window, so `handleSpace` sees
`ke.defaultPrevented === true` and early-returns. Result:
Space never toggles pan off; the panel opens instead (and in
the F12 sequence pan stays on, so the "double-click" just
pans).

**Covenant to encode:** Space toggles pan mode whenever the
canvas OR any node/edge in it has focus; Enter opens the
panel. This matches the existing tests (`canvas-keyboard`
tests Enter-opens; `canvas-pan` tests Space-toggles from a
focused canvas). Nodes carry `role="button"`, so Space-as-
activate is the ARIA default; overriding it in favor of the
pan toggle is a DELIBERATE design decision to state in the
spec (and confirm at review).

**Fix:** in the document keydown activation listener, gate
`canvas-key-activate` on `Enter` only. Let Space fall through
with NO `preventDefault`, so the window `handleSpace` toggles
pan. (`isFormFocused()` returns false for an SVG node, so
`handleSpace` proceeds.)

**Red test (Layer 2, `tests/browser/`):**
1. `openFlow` Customer Onboarding; click `#flow-auto-fit-switch`
   off; focus the canvas; `page.key(' ')`; wait for
   `.flow-pan-cursor` present (pan on).
2. Focus a node (`nodeSelector(...)` → `.focus()` via
   `evaluate`).
3. `page.key(' ')`.
4. Assert pan turned OFF (`.flow-pan-cursor` removed) and the
   node panel did NOT open (`stays()` on
   `!document.querySelector('.flow-props-panel')`).

**Files:** `web-app/app/flow-interactions.ts` (document
keydown Enter/Space activation block). Test: extend
`tests/browser/canvas-pan.test.ts` or add
`tests/browser/canvas-pan-focus.test.ts`.

---

## 5. Confirmed product defect #2 — zero-delta node click

**Found by code review, not the walk. In scope per the
chosen option.** A plain selection click on a draggable node
writes to the server and pollutes undo history.

**Mechanism:** `onNodePointerDown` (non-pan, non-port,
draggable, unlocked) enters drag state with `initialPositions`
for the selected set. `onPointerUp`'s drag branch computes
`dx`/`dy`; on a bare click both are 0, but it STILL emits
`move-nodes` with an update per selected node (same
positions). The page routes that to
`commitAndFit(withNodesMoved(updates), {advanceHistory:true})`.
`withNodesMoved` sees `updates.length > 0`, so it `#queueSave`
(a PUT) and `#noteMutation` (records undo history). A click
is not an edit.

**Fix:** in `onPointerUp`'s drag branch
(`web-app/app/flow-fsm-reduce.ts`), when `dx === 0 && dy === 0`
emit no `move-nodes` action (still `release-pointer` +
`request-update`). Prefer the FSM as the covenant site over
guarding `withNodesMoved`.

**Red test (Layer 1, `tests/flow-fsm-*.test.ts`):** dispatch
`pointer-down-on-node` then `pointer-up` at IDENTICAL
`svgX`/`svgY`; assert the emitted actions contain no
`move-nodes` (and that a nonzero delta still does). Pin lives
in the FSM scenario suite.

**Files:** `web-app/app/flow-fsm-reduce.ts` `onPointerUp`.
Test: `tests/flow-fsm-scenarios.test.ts` (or the fsm-reduce
suite).

---

## 6. Layer 2 reproductions for the driver-suspected cases

For each, write a Layer 2 CDP test that drives the REAL
gesture. If it PASSES, the walk FAIL was a driver artifact —
document it and close the case (no product commit). If it
FAILS, it is a real product bug → fix red→green.

- **F23** — plain port-drag, then hold Shift mid-gesture
  (interleave `keyDown('Shift')` between `move` steps, pass
  `modifiers: SHIFT` to later moves), release with Shift held
  → expect one add-edge, zero add-node. (Tests whether the
  product honors a mid-drag Shift; the compositor limit is
  separate.)
- **F26 / F28** — select an edge (single click on the edge
  label/path midpoint), then double-click for the panel
  (F26) and toolbar-Delete for removal (F28). Add the
  `doubleClick` helper. Assert edge selection enables Delete
  and opens Transition Properties.
- **F14** — Auto Fit off, click Zoom in, read `viewBox`
  (must differ from the identity camera), double-click a
  node, close panel, assert `viewBox` restored to the
  post-zoom value.
- **F37b** — Auto Layout on, plain port-drag, assert
  `nodeCount` rises by one, Undo restores. (Drive on a
  visible page — the fixtures always drive the attached
  context, so this removes the hidden-tab hypothesis.)
- **AA32 / AA33 / AA34** — Shift-drag Review→Data Capture
  (cycle edge) and Review→Archive (forward edge) with
  `modifiers: SHIFT`; then bind a Record and add attribute
  refs to Data Capture with distinct mode/required. Assert
  edge and attribute-ref writes land on the right nodes.

Every one of these has GREEN Layer 1 pins already; the Layer
2 tests add the compositor-level covenant the pins cannot
express.

---

## 7. Doctrine constraints (bind the whole plan)

- **Red-test rule:** product changes only via a red test at
  Layer 1 or Layer 2. A product commit may cite a mitigation
  stub only when its `Reproduced by` names a red test.
- **Frozen stubs:** never edit the dated `2026-09-02-*.md`
  mitigation stubs. Track implementation in `TODO.md`.
- **Worktree per spec:**
  ```bash
  git worktree add .worktrees/2026-09-02-test-plan-remediation \
      -b 2026-09-02-test-plan-remediation master
  cd .worktrees/2026-09-02-test-plan-remediation
  # … work, rebase on master, keep every commit green …
  cd - && git merge --ff-only 2026-09-02-test-plan-remediation
  ```
  Slug names branch, dir, plan (`<slug>.md`), spec
  (`<slug>-design.md`). Never `-D`, never force-push, linear
  history.
- **Church of Code:** binding. Master session `Go to Church!`
  (Full scroll); every dispatched subagent prompt MUST begin
  `Go to Medium Church!` (Medium scroll).
- **Voice:** 78-char lines in linted files (`.md` is exempt),
  4-space indent, no inline styles (CSS custom properties +
  classes per DESIGN-SYSTEM.md), present-tense imperative
  commit subjects ≈50 chars, `Co-Authored-By` trailer, ONE
  concern per commit, never move/rename + change content in
  one commit.
- **Codebase patterns:** RequestContext is the first arg to
  adapter methods; SafeHtml from presenters; snake_case
  storage / camelCase domain; HTTP-verb adapter naming
  (`getNoun`/`putNoun`/`deleteNoun`/`postNounOperation`);
  validators at the gate; no untyped `any` at boundaries;
  `noUncheckedIndexedAccess` (index access is `T | undefined`).
- **Sandbox (agent env only):** `export TMPDIR=/tmp/claude`
  and `export DENO_DIR="$TMPDIR/deno-dir"` before any `deno`,
  `./validate`, `./test`, `./test-browser`, or `./crank`.
  Never bake these into repo scripts.
- **Gates:** `./validate` (Layer 1) on every commit;
  `./test-all` (Layer 2) before a build/deploy/walk.

---

## 8. Doc corrections (exact TEST-PLAN.md locations)

These are DOC changes (DRIFT / plan drift), NOT product
commits — no red test required.

- **E10a** (~line 2194): action bars hide via `display:none`,
  not `hidden`. Correct the expectation to match the CSS.
- **A3 pin** (~lines 295, 6637): seed prints 12 human lines
  (incl. Riley); pin text says 11. Update the count.
- **R13** (~line 6425) and **R14** (~line 6460): "fillable
  while unbound" / empty-submit-before-bind predates instance
  binding. Align to bind-first reality (WB10b), and note the
  refusal status is 400, not 409.
- **R16** (~line 6504) / **WB19a** (~line 4133): WB19a must
  not overwrite the ONLY seeded Customer Profile instance's
  Company Name ("Acme Corp"). Either restore it after WB19a,
  or seed a SECOND instance so R16/R14 read the seed as
  documented. (Seed lives in
  `api/mock-data/seed-message-pairs.ts` ~line 532–560,
  `SEED_INSTANCE_ID = inst01W001CustProfAcme1`, bound to WO01
  `xqcXYHXBJJXcLkRYkRngKA`.)
- **Driving notes** (~lines 124–171): add F23 (BLOCKED like
  AA32 when Shift is not delivered on pointer-up), AA33/AA34
  (DEFERRED on AA32 when its stray nodes block targeting),
  F37b (re-activate tab A after F37a opens the second tab).
- **Scoring guidance:** F23 → BLOCKED; AA33/AA34 → DEFERRED.

---

## 9. Recommended plan shape (scope = FULL + Layer 2 harness)

Order tasks so each ends with an independently testable
deliverable. Fold setup into the task that needs it.

1. **Doc corrections** (§8). One commit per coherent group.
   No tests.
2. **Zero-delta node click** (§5): Layer 1 pin red → fix →
   green → commit.
3. **F12 Space-steal** (§4): Layer 2 CDP test red → fix →
   green → commit.
4. **R12** (§2, §5): write the missing `buildAttributeRefRow`
   Layer 1 pin. Green → R12 is driver-only, note in TODO.
   Red → fix red→green.
5. **`doubleClick` helper** in `tests/browser/canvas.ts`
   (needed by F26/F28), then the Layer 2 reproductions (§6):
   F23, F26, F28, F14, F37b, AA32/AA33/AA34. Each: test →
   pass-and-close OR fix red→green.
6. **R16 / WB19a** seed-or-ordering fix (§8) so the records
   chain reads as documented.
7. **TODO.md triage** for anything deferred; then `./validate`
   and `./test-all`; land via `git merge --ff-only`.

---

## 10. Kickoff prompt for the new session

Paste this to start:

```
Read docs/superpowers/plans/2026-09-02-test-plan-remediation-brief.md
in full, then read AGENTS.md.

You are remediating the 2026-09-02 TEST-PLAN walk. The brief
carries the root-cause analysis, the two confirmed product
defects with their fixes, the Layer 2 harness reference, the
doc-correction line numbers, and the binding doctrine.

Scope: FULL + Layer 2 harness (brief §9).

Create the remediation worktree (brief §7), then author the
plan at docs/superpowers/plans/2026-09-02-test-plan-remediation.md
using bite-sized TDD tasks with real code — no placeholders.
Product changes land ONLY behind a red test at Layer 1
(./validate) or Layer 2 (./test-browser). Do not edit the
frozen dated mitigation stubs. Then execute the plan, keeping
every commit green.
```

---

## 11. One caution carried from this session

A broad `[cyber]` dual-use classifier flagged a message in the
original session and auto-switched the model mid-work (the
security-adjacent code here — JWT, HMAC key, scrypt, cookie
refresh, plus the CDP/process-tree harness internals — is the
likely trigger). It did not block the task, but it is worth
knowing if you continue in a Claude session: `/config`
controls model-switch behavior, `/feedback` tunes the
classifier, and approved organizations can use Mythos 5.1
(the unmitigated equivalent). This has no bearing on the
technical work above.

# Walk 62291ec findings hygiene — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this worktree. Do not create one. Do
> not rebase, merge, land, force-push, or delete a
> branch. One worker. Subagents never pass isolation,
> never run `./deploy`, `./bin/build`, `./bin/measure`,
> seed, or wipe.

> **For the dispatching orchestrator:** every subagent
> prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then voice rules, the
> commandments and abominations the task names, and
> the AGENTS.md Subagents patterns. Per task, serial:
> implementer (`coder`) → spec-compliance reviewer
> (`planner`) → quality reviewer (`planner`). After
> the last task, `architect` reviews the range against
> the spec. A reviewer's finding is fixed by a fresh
> `coder` that amends the task's own commit (branch is
> local). A finding that the spec is wrong is STOP.

**Goal:** Rewrite TEST-PLAN.md so the next walk of
`62291ec` scores the same facts honestly, retire the
invented-stats TODO.md bullet, refresh bind-at-creation,
and file two later-work bullets. FAIL is empty. No
product.

**Architecture:** Markdown hygiene only. One concern
per commit. TEST-PLAN clusters first (D37, Scoring plus
WB11/WB16, R14, B1, B5), then TODO.md (retire
invented-stats, refresh bind-at-creation, add the
classed drop-indicator, add the seeded bound Data
Capture work order). Bind-at-creation, `.list-drop-indicator`,
and the seed row stay later work. No new Deno tests.
No mitigation stub. No historical-spec rewrite. No
edit to `tests/browser/workbox-transition.test.ts`.

**Tech Stack:** Markdown. Gate is `./test` and
`./test validate`. Never pytest, node, or npm. Lint
skips `.md`. SHA skip on clean HEAD is fine.

**Spec:**
`docs/superpowers/specs/2026-10-31-walk-62291ec-findings-design.md`
at `bfd35d384`. Walk HEAD `62291ecf1`. The spec is the
oracle. A cite that moved is re-found by its quoted
text. A cite whose text is gone is STOP.

**Worktree:**
`/Users/tmornini/code/fusion-angle/.worktrees/2026-10-31-browser-workbox-tests`
on branch `2026-10-31-browser-workbox-tests`. This plan
is committed in the planning session. Execution starts
at Task 1.

---

## File map

- `TEST-PLAN.md` — D37 driving note; Scoring line for
  live unbound 400 → BLOCKED; WB11 driving note; WB16
  PASS (drop submit-time binding PUT); R14 driving
  note and case; B1 PASS and pins; B5 PASS and pin.
- `TODO.md` — remove the invented-stats bullet under
  `## Critical functionality path`; refresh bind-at-creation;
  add classed drop-indicator later-work; add seeded
  bound Data Capture later-work.

Do not touch: any file under `api/`, `client/`,
`server/`, `shared/`, `web-app/`, `tests/`, historical
specs under `docs/superpowers/specs/` other than
reading the oracle, `tests/browser/workbox-transition.test.ts`,
seed rows, or `buildIndicator` in
`web-app/app/drag-reorder.ts`.

## Sequence

1. Task 1 — D37 driving note.
2. Task 2 — Scoring + WB11 driving note + WB16 PASS.
3. Task 3 — R14 driving note and case.
4. Task 4 — B1 PASS and pins.
5. Task 5 — B5 PASS and pin.
6. Task 6 — retire invented-stats.
7. Task 7 — refresh bind-at-creation.
8. Task 8 — add classed drop-indicator later-work.
9. Task 9 — add seeded bound Data Capture later-work.
10. Architect reviews `Task 1` through `Task 9`
    against the spec. No commit.

Quoted old text is at `bfd35d384` plus this plan.
Later tasks match the quoted text, not line numbers:
Task 1 inserts above F12 and shifts every later
TEST-PLAN line.

## Global Constraints

- Deno only. After each commit: `export
  DENO_DIR="$TMPDIR/deno-dir"` then `./test validate`.
  Expected: exit 0. SHA skip on clean HEAD is fine.
  Lint skips `.md`. No `./test browser`, postgres,
  deploy, build, measure, seed, or wipe.
- No new Deno tests. TDD does not apply. Markdown
  only.
- 78-character max line in files `./test lint` still
  lints (code and scripts; `.md` is exempt). 4-space
  indent. No inline styles.
- Commit subjects: present-tense imperative, ~50
  chars, no `feat:` prefix, no prose body, trailer
  `Co-Authored-By: Grok 4.7 <noreply@x.ai>`. Author
  stays the repository's configured user. Do not pass
  `--author`.
- One concern per commit. Never move or rename and
  change content in the same commit.
- Confirm each Old block occurs once in the target
  file before replacing. Copy New verbatim. Never
  `sed`. Never paraphrase.
- `grant` is a verb. Prose names a person
  "organization admin" or "operator". The role string
  `admin` and membership type `'admin'` stay.
- Do not land, rebase, merge, force-push, or delete a
  branch. One worker. Subagents inherit no isolation
  and never create a worktree.
- A live unbound 400 is BLOCKED while the pins are
  green, not FAIL.
- D37's PASS line and Pin stay. WB11's PASS line and
  Pin stay. WB19 / WB19a / WB19b / WB14 / WB15 PASS
  lines stay. Layer 1 pins on WB16 stay, including
  `tests/api-work-order-binding.test.ts`.
- The controller writes no product code. The
  implementer edits only the file the task names.

## Orchestrator dispatch

Every subagent prompt begins with the literal phrase
`Go to Medium Church!`, then:

- Voice: 78-char max in files `./test lint` still
  lints (code and scripts; `.md` is exempt), 4-space
  indent, no inline styles, present-tense imperative
  ~50-char commit subjects with no body beyond the
  trailer `Co-Authored-By: Grok 4.7 <noreply@x.ai>`.
  `grant` is a verb; prose names "organization admin"
  or "operator".
- Commandments and abominations the task names.
- AGENTS.md Subagents patterns: RequestContext as the
  first argument to client verbs, a client verb
  returns an `HttpMessage`, an array of them, or a
  value that keeps one, a write from a held message
  takes the message it latches, SafeHtml from
  presenters, snake_case storage / camelCase domain,
  HTTP-verb adapter naming, validators at the gate,
  no untyped `any` from external boundaries. This
  plan never touches those files; still push them
  down so a heathen does not invent product.
- Subagents work in this worktree. Never pass
  isolation. Never run `./deploy`, `./bin/build`,
  `./bin/measure`, seed, or wipe.
- Per task, serial: implementer (`coder`) with the
  full task text pasted, not "read the plan file" →
  spec-compliance reviewer (`planner`) → quality
  reviewer (`planner`). Start quality review only
  after spec compliance is approved.
- Before Task 1, `git status --short` is empty and
  HEAD is this plan's commit. Else STOP.
- Pass no model override to any dispatch.
- A finding is fixed by a fresh `coder` that amends
  the task's own commit (`git commit --amend --no-edit`
  is a mercy on this local branch). Re-review until
  both reviewers approve. A finding that the spec is
  wrong is STOP.
- After Task 9, dispatch `architect` against the
  range and the spec. No land.

## Spec Coverage

| Spec decision | Task |
|---|---|
| D37 driving note; PASS and Pin stay; no class | 1 |
| Scoring: live WB11/WB16 400 → BLOCKED | 2 |
| WB11 driving note extended; PASS and Pin stay; no Layer 2 test change | 2 |
| WB16: keep arming recipe; drop submit-time binding PUT; missing 200 unbound → BLOCKED; Layer 1 pins stay | 2 |
| DEFERRED WB19, WB19a, WB19b, WB14, WB15 on WB11; PASS lines stay | 2 |
| R14 driving note and case: no seeded bound Data Capture WO; WO01 Archive; BLOCKED if none; 400 not 409; no bind chrome | 3 |
| B1 PASS and pins, including `landing-hero` | 4 |
| B5 PASS and `auth-panel` pin; two-column layout exploratory | 5 |
| TODO.md invented-stats bullet removed; close protocol; no product comment to strip | 6 |
| Bind-at-creation refreshed; `#gate0001` stays unbound; drop `bindGenesisInstance` once create binds | 7 |
| Class the ideas-list drop indicator later-work; name `.list-drop-indicator`; no class this cycle | 8 |
| Seed one bound Data Capture work order later-work; no seed this cycle | 9 |
| Non-goals as product (mitigation stubs, historical specs, landing/auth markup, bind-at-creation product, class, seed row, Layer 2 WB11 test) | unscheduled |
| FAIL empty | no task |

---

### Task 1: Note D37's unclassed drop indicator

**Files:**
- Modify: `TEST-PLAN.md` — `### Driving notes`, the
  compositor-gestures bullet that names D36/D37/K6,
  immediately before the F12 bullet.

**Commandments:** V Clarity, III Uniformity.
**Abominations:** Unbidden Helper Code (do not add a
class), Test Weakening (do not change D37's PASS or
Pin), Premature Generalization.

Leave D37's PASS line and Pin as they are
(`TEST-PLAN.md` Ideas List — Drag-reorder, **D37**).
Do not edit `web-app/app/drag-reorder.ts`. Workbox
`.inbox-drop-indicator` is a different list.

- [ ] **Step 1: Insert the D37 driving note**

In `TEST-PLAN.md` `### Driving notes`, find this
unique neighbour pair and insert the new bullet
between them.

Old:

```
  drag lists; a miss on D36 or K6 is still BLOCKED
  this walk, not a missing product.
- F12: after the pan-mode node drag, Space toggles
```

New:

```
  drag lists; a miss on D36 or K6 is still BLOCKED
  this walk, not a missing product.
- D37: drive with two or more compositor
  `pointermove`s across a neighbour midpoint during a
  D36-style ideas-list drag. The drop indicator is an
  unclassed inline `div`; do not grind a class or a
  tighter step. If the live flip is not witnessed,
  BLOCKED naming the unclassed indicator. The two
  `dropIndex` pins decide the 8px band. Workbox
  `.inbox-drop-indicator` is a different list.
- F12: after the pan-mode node drag, Space toggles
```

Do not change the **D37** case PASS or Pin. Do not
add `list-drop-indicator` anywhere.

- [ ] **Step 2: Validate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: exit 0. Lint skips `.md`.

- [ ] **Step 3: Commit**

```bash
git add TEST-PLAN.md
git commit -F - <<'EOF'
Note D37's unclassed drop indicator

Co-Authored-By: Grok 4.7 <noreply@x.ai>
EOF
```

---

### Task 2: Score unbound WB11 and WB16 as BLOCKED

**Files:**
- Modify: `TEST-PLAN.md` — `### Scoring` walk-specific
  paragraph; `### Driving notes` WB11 bullet; **WB16**
  case PASS. Do not change **WB11** PASS or Pin. Do
  not change `tests/browser/workbox-transition.test.ts`.
  Do not change WB19 / WB19a / WB19b / WB14 / WB15
  PASS lines. Keep the WB11/WB16 arming-recipe bullet
  (the one that starts `WB11/WB16: one explorer's
  turn`). Keep WB16's Layer 1 pins, including
  `tests/api-work-order-binding.test.ts`.

**Commandments:** V Clarity, VII Idempotency.
**Abominations:** Test Weakening, Unbidden Helper
Code, Internal Defense.

Create still birth-claims and still posts unbound.
Bind chrome is gone. The explorer does not `js()` PUT
`…/binding`.

- [ ] **Step 1: Add the Scoring lines**

Old:

```
WB19a/WB19b when the bound WO is already archived:
DEFERRED on WB14. Layer 1 pins decide the 412.
I21 skeleton miss without the Fetch pause:
```

New:

```
WB19a/WB19b when the bound WO is already archived:
DEFERRED on WB14. Layer 1 pins decide the 412.
A live WB11 or WB16 400 for no instance binding
is BLOCKED, not FAIL, while those pins are green.
WB19, WB19a, WB19b, WB14, and WB15 stay DEFERRED
on WB11 until a bound Active WO exists from
WB11–WB13.
I21 skeleton miss without the Fetch pause:
```

- [ ] **Step 2: Extend the WB11 driving note**

Old:

```
- WB11: from a claimed-by-me action screen (create
  still birth-claims, or drag onto claimed-by-me
  first), fill, submit. Opening inspects; bind is
  gone. Layer 2 pin
  tests/browser/workbox-transition.test.ts
  'fill and submit navigates to the inbox
  (WB11)' decides the inbox navigation. WB16's
  read is armed before this `submit`, in the
  same turn (Driving notes, WB11/WB16).
```

New:

```
- WB11: from a claimed-by-me action screen (create
  still birth-claims, or drag onto claimed-by-me
  first), fill, submit. Opening inspects; bind is
  gone. Layer 2 pin
  tests/browser/workbox-transition.test.ts
  'fill and submit navigates to the inbox
  (WB11)' binds a genesis instance via API first,
  then fills; it decides the inbox navigation.
  Drive a bound claimed-by-me Data Capture screen
  when one exists (seeded bound WO, or create after
  bind-at-creation). A live unbound create + fill +
  submit that 400s `work order has no instance
  binding` is BLOCKED, naming unbound create and no
  bind chrome. One attempt. WB16's read is armed
  before this `submit`, in the same turn (Driving
  notes, WB11/WB16).
```

Leave the **WB11** case (`On a claimed-by-me action
screen, fill Company Name…`) and its Pin untouched.

- [ ] **Step 3: Drop the submit-time binding PUT from WB16**

Old:

```
  once, per that note. If the transition POST is
  missing because navigation dropped an unarmed
  buffer, record BLOCKED naming that — an honest
  BLOCKED costs nothing. PASS: the
  binding PUT lands at `work-orders/:id/binding` with
  `{instance_id, record_type_id}` (200); the transition
  POST is `work-orders/:id/transition` (200) whose body
  is the **instance shape** (`targetState`, `instance_id`,
```

New:

```
  once, per that note. If the transition POST is
  missing because navigation dropped an unarmed
  buffer, record BLOCKED naming that — an honest
  BLOCKED costs nothing. A missing 200 because the
  work order is unbound is BLOCKED, same reason as
  WB11. There is no submit-time binding PUT. PASS:
  the transition POST is `work-orders/:id/transition`
  (200) whose body
  is the **instance shape** (`targetState`, `instance_id`,
```

Keep the rest of the WB16 body, the arming recipe
(CDP `Network` or `pagehide` copy), the
`getEntries()` prohibition, and every Pin line.

- [ ] **Step 4: Validate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add TEST-PLAN.md
git commit -F - <<'EOF'
Score unbound WB11 and WB16 as BLOCKED

Co-Authored-By: Grok 4.7 <noreply@x.ai>
EOF
```

---

### Task 3: Block R14 until a bound Data Capture WO

**Files:**
- Modify: `TEST-PLAN.md` — `### Driving notes` R14
  bullet, and the **R14** case under Records. Keep:
  `#gate0001` is unbound; no action-screen picker;
  unbound value-bearing transition is 400, not 409;
  409 is rebind; create birth-claims and does not
  bind. Do not invent bind chrome. Do not change
  **R14a**.

**Commandments:** V Clarity, III Uniformity.
**Abominations:** Unbidden Helper Code, Noun-First
Thinking.

- [ ] **Step 1: Rewrite the R14 driving note**

Old:

```
- R14: `#gate0001` is unbound; bind-at-creation is
  later. There is no action-screen picker. Drive a
  seeded bound WO after a claim drag (or a
  birth-claimed create if that WO is already bound).
  A value-bearing transition while unbound is 400,
  not 409. Opening does not claim.
```

New:

```
- R14: `#gate0001` is unbound; bind-at-creation is
  later. There is no action-screen picker; do not
  invent one. No seeded bound Data Capture work
  order exists; seeded bound WO01 is already
  Archive. Drive a bound claimed-by-me Data Capture
  screen only when one exists (seeded bound WO, or
  create after bind-at-creation). If none exists,
  BLOCKED naming that. A value-bearing transition
  while unbound is 400, not 409; 409 is rebind.
  Create still birth-claims and does not bind.
  Opening does not claim.
```

- [ ] **Step 2: Rewrite the R14 case setup**

Old:

```
- [ ] **R14** `#gate0001` is unbound; bind-at-creation
  is later. There is no action-screen picker; do not
  invent one. Opening inspects. Drive a seeded bound
  WO after a claim drag (or a birth-claimed create if
  that WO is already bound). Fill Company Name +
  Contact Email and click submit. PASS: transition
  succeeds; work order advances to Review (does NOT
  demand Reviewer Notes — that is current-node only
  when leaving Review). A value-bearing transition
  while still unbound is refused with 400
  (`ValidationError` → `HTTP_BAD_REQUEST`), not 409;
  409 is rebind. Create still birth-claims; it does
  not bind.
```

New:

```
- [ ] **R14** `#gate0001` is unbound; bind-at-creation
  is later. There is no action-screen picker; do not
  invent one. Opening inspects. No seeded bound Data
  Capture work order exists; seeded bound WO01 is
  already Archive. Drive a bound claimed-by-me Data
  Capture screen only when one exists. If none
  exists, BLOCKED naming that. Fill Company Name +
  Contact Email and click submit. PASS: transition
  succeeds; work order advances to Review (does NOT
  demand Reviewer Notes — that is current-node only
  when leaving Review). A value-bearing transition
  while still unbound is refused with 400
  (`ValidationError` → `HTTP_BAD_REQUEST`), not 409;
  409 is rebind. Create still birth-claims; it does
  not bind.
```

Keep the R14 Pin block that follows.

- [ ] **Step 3: Validate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add TEST-PLAN.md
git commit -F - <<'EOF'
Block R14 until a bound Data Capture WO

Co-Authored-By: Grok 4.7 <noreply@x.ai>
EOF
```

---

### Task 4: Match B1 to the landing-hero pins

**Files:**
- Modify: `TEST-PLAN.md` — **B1** under
  `### Landing Page (\`landing/\`)`.
  Keep the three stay / no ai-or-pilot pins. Add
  `tests/landing-hero.test.ts` `'landing hero states
  the engine'`. Do not rewrite
  `docs/superpowers/specs/2026-09-16-landing-pilot-design.md`
  or kin. Do not edit landing markup.

**Commandments:** V Clarity, III Uniformity.
**Abominations:** Unbidden Helper Code, Foreign
Tongues.

- [ ] **Step 1: Rewrite B1 PASS and pins**

Old:

```
- [ ] **B1** Page renders the hero ("Fusion Angle is
  your Strategy-to-Change Engine."), the stalls
  paragraph, and the three safety cards, and stays.
  The top bar has no AI or Pilot link, and the page
  has no `#ai` or `#pilot` section. Wait ~3 seconds.
  PASS: still on `landing/index.html`.
  Pin: tests/landing-stay.test.ts 'landing does not
       shove to dashboard'; tests/browser/landing.test.ts
       'unsigned landing stays and signs in';
       tests/landing-stay.test.ts 'landing has no ai
       or pilot section'
```

New:

```
- [ ] **B1** Unsigned `landing/index.html` stays. Hero
  is two lines, "Fusion Angle" then
  "Strategy-to-Change Engine", no "is your". No stalls
  paragraph, no three safety cards, no `#ai`, no
  `#pilot`. Wait ~3 seconds. PASS: still on
  `landing/index.html`.
  Pin: tests/landing-stay.test.ts 'landing does not
       shove to dashboard'; tests/browser/landing.test.ts
       'unsigned landing stays and signs in';
       tests/landing-stay.test.ts 'landing has no ai
       or pilot section';
       tests/landing-hero.test.ts 'landing hero states
       the engine'
```

- [ ] **Step 2: Validate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add TEST-PLAN.md
git commit -F - <<'EOF'
Match B1 to the landing-hero pins

Co-Authored-By: Grok 4.7 <noreply@x.ai>
EOF
```

---

### Task 5: Match B5 to the auth-panel pin

**Files:**
- Modify: `TEST-PLAN.md` — **B5** under
  `### Auth Page (\`auth/\`)`.
  The two-column layout stays exploratory. Do not
  edit `web-app/auth/index.ts`. Do not rewrite
  historical landing specs.

**Commandments:** V Clarity, III Uniformity.
**Abominations:** Default Values (do not restore
`10K+` / `98%` / `50+`), Unbidden Helper Code.

The pin already asserts `0k+` / `0%` /
`>Dissatisfaction<` / `0+` and the absence of
`10K+` / `98%` / `50+` / `>Satisfaction<` in
`tests/auth-panel.test.ts` `'auth panel speaks in the
landing voice'`.

- [ ] **Step 1: Rewrite B5 PASS and pin**

Old:

```
- [ ] **B5** On desktop (≥1024px), left panel shows branded marketing stats (10K+ Active Users, 98% Satisfaction, 50+ Integrations). PASS: two-column layout visible.
  Pin: exploratory — the live two-column layout and
       stat copy
```

New:

```
- [ ] **B5** On desktop (≥1024px), two-column branding
  + form. Left panel stats are `0k+` Active Users,
  `0%` Dissatisfaction, `0+` Integrations. PASS:
  two-column layout visible.
  Pin: tests/auth-panel.test.ts 'auth panel speaks in
       the landing voice' (the `0k+` / `0%` / `0+` /
       `>Dissatisfaction<` assertions and the absence
       of `10K+` / `98%` / `50+` / `>Satisfaction<`);
       exploratory — the live two-column layout
```

- [ ] **Step 2: Validate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add TEST-PLAN.md
git commit -F - <<'EOF'
Match B5 to the auth-panel pin

Co-Authored-By: Grok 4.7 <noreply@x.ai>
EOF
```

---

### Task 6: Retire the invented-stats TODO bullet

**Files:**
- Modify: `TODO.md` — `## Critical functionality path`.
  Remove the invented-stats bullet. Close protocol:
  the pin already states the new truth. There is no
  named product comment to strip;
  `web-app/auth/index.ts` already paints `0k+` / `0%`
  Dissatisfaction / `0+`. Do not edit
  `web-app/auth/index.ts`. Do not edit ARCHITECTURE.md.

**Commandments:** V Clarity, VIII Simplicity.
**Abominations:** Unbidden Helper Code, Default
Values.

- [ ] **Step 1: Delete the invented-stats bullet**

Old:

```
  reaches the live toast's dismiss; one live region,
  not two
- The auth page's left panel shows invented stats —
  "10K+ Active Users", "98% Satisfaction", "50+
  Integrations" (`web-app/auth/index.ts:118-157`,
  TEST-PLAN B5): a comfortable lie to every person who
  signs in. Its own spec.
- The context is the one source of `operation-id`, by
```

New:

```
  reaches the live toast's dismiss; one live region,
  not two
- The context is the one source of `operation-id`, by
```

- [ ] **Step 2: Validate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -F - <<'EOF'
Retire the invented-stats TODO bullet

Co-Authored-By: Grok 4.7 <noreply@x.ai>
EOF
```

---

### Task 7: Refresh bind-at-creation for this walk

**Files:**
- Modify: `TODO.md` — the existing bullet `Bind the
  record instance at work order creation.` under
  `## Critical functionality path`. Keep it. Refresh
  the body. Oracle stays, then add the
  `bindGenesisInstance` drop and `#gate0001` stays
  unbound. Do not edit
  `tests/browser/workbox-transition.test.ts`. Do not
  bind at create. Do not restore `#bindButton`.

**Commandments:** V Clarity, III Uniformity.
**Abominations:** Unbidden Helper Code, Premature
Generalization.

The action-screen Bind instance control is gone
(`WorkboxDetailPresenter` has no `#bindButton`; WB10a
PASS). Create still posts unbound. The Layer 2 WB11
pin's `bindGenesisInstance` is a stopgap.

- [ ] **Step 1: Replace the bind-at-creation body**

Old:

```
- Bind the record instance at work order creation.
  Create today (`createWorkOrderFromFlow`,
  `web-app/app/work-order-creation.ts:18-41`) posts an
  unbound work order; the action screen's Bind instance
  (`WorkboxDetailPresenter.#bindButton`,
  `web-app/app/presenters/workbox-detail.ts:460-473`)
  and `putWorkOrderBinding` attach it later. Bind
  belongs on create. This workbox pass removes the
  action-screen bind control; create still posts an
  unbound work order until this item. Oracle:
  creating a work order requires the instance when the
  flow names a record type; the action screen has no
  bind control.
```

New:

```
- Bind the record instance at work order creation.
  The action-screen Bind instance control is gone
  (`WorkboxDetailPresenter` has no `#bindButton`;
  WB10a PASS); create still posts unbound
  (`createWorkOrderFromFlow` →
  `postWorkOrderCreation`). The Layer 2 WB11 pin's
  `bindGenesisInstance` is a stopgap until this
  item; walk `62291ec` BLOCKED WB11, WB16, and R14
  on that unbound create. Oracle: creating a work
  order requires the instance when the flow names a
  record type; the action screen has no bind
  control. Once create binds, drop
  `bindGenesisInstance` from
  `tests/browser/workbox-transition.test.ts`.
  `#gate0001` stays unbound.
```

- [ ] **Step 2: Validate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -F - <<'EOF'
Refresh bind-at-creation for this walk

Co-Authored-By: Grok 4.7 <noreply@x.ai>
EOF
```

---

### Task 8: File the classed drop-indicator later work

**Files:**
- Modify: `TODO.md` — `## Critical functionality path`.
  Insert the new bullet immediately after the
  bind-at-creation bullet Task 7 wrote. Do not add a
  class to `buildIndicator`. Do not edit
  `web-app/app/drag-reorder.ts`. Workbox inbox already
  paints `.inbox-drop-indicator`; that is a different
  list.

**Commandments:** V Clarity, IX Generality (wait for
the class's own cycle).
**Abominations:** Unbidden Helper Code, Premature
Optimization.

- [ ] **Step 1: Insert the drop-indicator bullet**

Match the bind-at-creation bullet as Task 7 left it,
then the latched-write bullet that follows.

Old (anchor is the last lines of bind-at-creation plus
the next bullet's first line):

```
  `tests/browser/workbox-transition.test.ts`.
  `#gate0001` stays unbound.
- A latched write aligned to RFC 9110 §13.1.1. When
```

New:

```
  `tests/browser/workbox-transition.test.ts`.
  `#gate0001` stays unbound.
- Class the ideas-list drop indicator. Walk `62291ec`
  D37 BLOCKED: `buildIndicator`
  (`web-app/app/drag-reorder.ts`) returns an unclassed
  inline `div`; compositor 4px `pointermove`s could
  not query a hysteresis flip. Workbox inbox already
  paints `.inbox-drop-indicator`. Oracle: the
  `drag-reorder` drop indicator has a class the walk
  can query (name `.list-drop-indicator` unless a
  later brainstorm picks another); a Layer 1 pin
  asserts that class; a later walk can witness D37's
  live flip.
- A latched write aligned to RFC 9110 §13.1.1. When
```

- [ ] **Step 2: Validate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -F - <<'EOF'
File the classed drop-indicator later work

Co-Authored-By: Grok 4.7 <noreply@x.ai>
EOF
```

---

### Task 9: File a seeded bound Data Capture later work

**Files:**
- Modify: `TODO.md` — `## Critical functionality path`.
  Insert the new bullet immediately after the classed
  drop-indicator bullet Task 8 wrote. Do not seed a
  row. Do not edit mock-data. `#gate0001` stays
  unbound. Bind-at-creation consumes the live-create
  half of this item and does not remove `#gate0001`.

**Commandments:** V Clarity, IX Generality.
**Abominations:** Unbidden Helper Code, Premature
Generalization.

- [ ] **Step 1: Insert the seeded bound WO bullet**

Old (anchor is the last lines of the drop-indicator
bullet plus the latched-write bullet):

```
  asserts that class; a later walk can witness D37's
  live flip.
- A latched write aligned to RFC 9110 §13.1.1. When
```

New:

```
  asserts that class; a later walk can witness D37's
  live flip.
- Seed one bound Data Capture work order. Until
  bind-at-creation, live create is unbound, WO01 is
  Archive, and R14/WB11 have no seeded bound Data
  Capture subject. Oracle: the mock seed includes one
  bound Customer Onboarding work order at Data
  Capture that a claim-drag (or a birth-claimed seed
  row) can open; a later walk can fill Company Name
  + Contact Email and submit; `#gate0001` stays
  unbound. Bind-at-creation consumes the live-create
  half of this item and does not remove `#gate0001`.
- A latched write aligned to RFC 9110 §13.1.1. When
```

- [ ] **Step 2: Validate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -F - <<'EOF'
File a seeded bound Data Capture later work

Co-Authored-By: Grok 4.7 <noreply@x.ai>
EOF
```

---

### After Task 9: Architect review

Not a commit. Dispatch `architect` against the range
from Task 1's commit through Task 9's commit, with
the spec as oracle.

The review confirms:

- Every Decisions bullet has a commit.
- Non-goals stayed unscheduled as product.
- FAIL is empty: no mitigation stub, no product, no
  seed row, no class, no Layer 2 WB11 test edit, no
  historical-spec rewrite.
- D37 PASS/Pin, WB11 PASS/Pin, WB16 Layer 1 pins,
  WB19/WB19a/WB19b/WB14/WB15 PASS lines, and
  `#gate0001` unbound all remain.
- A live unbound 400 is BLOCKED while those pins are
  green.

A finding that the spec is wrong is STOP. A finding
that a task missed the spec is a fresh `coder` that
amends that task's own commit, then re-review.

Do not land. Do not rebase. Do not merge. Do not
force-push. Keep the branch and worktree.

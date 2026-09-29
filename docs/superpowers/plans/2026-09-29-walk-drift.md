# 29 Sep TEST-PLAN drift — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this plan's worktree (AGENTS.md §
> Worktrees).

**Goal:** Rewrite the seven TEST-PLAN cases the 29 Sep
walk scored DRIFT (AT2, AT4, A2, F9, F21, G36, K26) to
describe what the walk actually saw. DRIFT means the
document changes, and nothing else does.

**Architecture:** One case per commit. `TEST-PLAN.md` is
the only file edited, apart from the shared tracking
line in `TODO.md`. The counts are re-measured at
execution time, because master may have moved since
`a6af68a6`. Each other rewrite is grounded in source
read at `a6af68a6`, and each task names that source.

**Tech Stack:** Markdown. `./test` and `./test postgres`
for the re-count; `./bin/build --no-zip` to confirm A2's
names.

**Spec:** no design doc. The spec is the 29 Sep walk's
DRIFT lines, as the operator relayed them, and the
source cited per task.

**Worktree:** `.worktrees/2026-09-29-walk-drift` on
branch `2026-09-29-walk-drift`, base `a6af68a6`. Task 0
rebases it onto master.

---

## Facts re-counted in planning (`a6af68a6`)

- `./test` → `ok | 3622 passed | 0 failed | 8 ignored
  (9s)`, then `ok | 8 passed | 0 failed (18ms)`. The
  eight ignored tests are one live-Postgres placeholder
  in each of `tests/pg-acceptance`, `pg-explain`,
  `pg-identifier-order`, `pg-boot`, `pg-races`,
  `pg-standalone-read`, `pg-seed`, and
  `schema-lifecycle` (`*.test.ts`).
- `./test postgres` → `ok | 67 passed | 0 failed (4s)`,
  across the eight files `bin/test-postgres` lists.
  "Seven files" is stale in AT4 and in the Combined
  Totals paragraph, which restates AT2's skip count.
- `bin/build-lib` runs `web-app/app/hash-static.ts`,
  which renames every file under `site/assets/` to
  `<logical>.<first 16 hex of its sha256>.<ext>`: JS
  (with its code-split chunks), CSS, `*.woff2`, and
  SVG. `site/asset-manifest.json` maps each logical name
  to this build's file.
- `web-app/app/flow-cycle-edges.ts`: a cycle edge is a
  depth-first back-edge from the Create node. Layout
  Test's only back-edge is "back to draft" (Revise →
  Draft, `api/mock-data/flows.ts`). "revise" (Decision →
  Revise) is a tree edge.
- `web-app/app/header-info.ts` paints the active org's
  name as the first label of `#header-stats` in the top
  bar.
- AA23 leaves AA22a's converted project `under_review`
  (TEST-PLAN AA36 says so), so K26's filter shows four
  rows. The Projected Impact column paints
  `formatSigned` (`web-app/app/presenters/project.ts`).

## Global Constraints

- Work only in this worktree. Task 0 is the one master
  commit pair, shared by all four 29 Sep plans. Never
  `-D`. Never force-push. Never merge; rebase onto
  master, then `git merge --ff-only`.
- One concern per commit: one case per commit. AT2's
  commit also carries the Combined Totals sentence that
  restates AT2's skip count. Subject ≈50 chars,
  present-tense imperative, no body. Trailer: the
  mandated `Co-Authored-By: Claude Opus 5.5
  <noreply@anthropic.com>`, plus any `Claude-Session:`
  line the executing harness mandates.
- Edit only the case text each task names. Leave every
  Pin test name as it stands, and never weaken a pin to
  make a note true.
- Do not pin one build's hash anywhere.
- Out of scope: D36, D37, WB16, and I22, which were
  BLOCKED on driver limits and are not product defects.
  Also out: I21's probe step (the I21 plan files it as
  an owner call), and F29/K17 Pin clauses (their own
  plans).
- Under the Claude Code sandbox, before any `deno`,
  `./test`, or `./bin/*`:
  `export DENO_DIR="$TMPDIR/deno-dir"`.
- Markdown-only commits skip `./test validate`. The
  78-character lint does not read `.md`.
- Commandments in play: Clarity, since the case says
  what the product does. Uniformity: "primary" and
  "warning" are the design tokens; the colours ride in
  parentheses. Logic: F21's preview and its committed
  edge follow two different rules.

## Review Focus

Documentation only; no product input is exercised.
Reviewer checks, most likely to bite first:

1. **Counts copied from the plan rather than
   re-counted.** Task 2's numbers win over this plan's.
2. **A hash pinned into A2.** Search the diff for
   `[0-9a-f]{16}`. It must be empty.
3. **K26 asserting the walk-created row's slot as a
   PASS condition.** The slot varies by walk, so only
   the three seeded titles' order may gate.
4. **F21 promising the committed edge is always
   solid.** It is solid only when the DFS does not see a
   back-edge, so the text says "may".
5. **G36 naming a Wayne-only account that is not.**
   `mike.thompson@company.com` is TEST-PLAN's own
   Wayne-only example in its V and SV cases.

---

## File structure

| File | Role |
|---|---|
| `TEST-PLAN.md` | AT2 (+ Combined Totals), AT4, A2, F9, F21, G36, K26 |
| `TODO.md` | drop the drift sub-bullet |

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
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-09-29-walk-drift
git rebase master
```

Expected: the rebase succeeds.

---

### Task 1: Commit this plan

**Files:**
- Create: `docs/superpowers/plans/2026-09-29-walk-drift.md`

- [x] **Step 1: Commit the plan as written**, subject
  `Plan the 29 Sep TEST-PLAN drift corrections`. Done
  in the planning session. Markdown only.

---

### Task 2: Re-count before editing

Nothing is committed in this task. Its output feeds
Tasks 3-5.

- [ ] **Step 1: Re-count AT2**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-09-29-walk-drift
export DENO_DIR="$TMPDIR/deno-dir"
./test > "$TMPDIR/at2.log" 2>&1; echo "exit=$?"
sed 's/\x1b\[[0-9;]*m//g' "$TMPDIR/at2.log" \
    | grep -E '^(ok|FAILED) \|'
sed 's/\x1b\[[0-9;]*m//g' "$TMPDIR/at2.log" \
    | grep -c ' \.\.\. ignored'
```

Expected at `a6af68a6`: `exit=0`,
`ok | 3622 passed | 0 failed | 8 ignored (9s)`,
`ok | 8 passed | 0 failed (18ms)`, and `8`. If master
moved, write the numbers this prints wherever Tasks 3
and 4 say 3622, 8, or 67.

- [ ] **Step 2: Re-count AT4** (needs Docker)

```bash
./test postgres > "$TMPDIR/at4.log" 2>&1; echo "exit=$?"
sed 's/\x1b\[[0-9;]*m//g' "$TMPDIR/at4.log" \
    | grep -E '^(ok|FAILED) \|'
grep -c 'tests/.*\.test\.ts' bin/test-postgres
```

Expected: `exit=0`, `ok | 67 passed | 0 failed (4s)`,
and `8` files.

- [ ] **Step 3: Confirm A2's hashed names**

The tree must be clean (`./bin/build` refuses a dirty
one).

```bash
./bin/build --no-zip "$TMPDIR/a2-site/"
ls "$TMPDIR/a2-site/site/assets/" \
    | grep -E '^(app|styles)\.[0-9a-f]{16}\.(js|css)$'
ls "$TMPDIR/a2-site/site/asset-manifest.json"
```

Expected: one `app.<16 hex>.js`, one
`styles.<16 hex>.css`, and the manifest path. If
`./bin/build` cannot run here, `nameWithHash` and
`hashedFileName` in `web-app/app/hash-static.ts` are the
source of truth for the pattern. Note which one you
relied on.

---

### Task 3: AT2's 29 Sep counts

**Files:**
- Modify: `TEST-PLAN.md`: AT2 (line 450) and the
  Combined Totals paragraph (lines 424-427)

- [ ] **Step 1: Edit AT2's PASS clause**

In the AT2 line, replace:

```
today `ok | 3490 passed | 0 failed | 7 ignored` for the main suite and `ok | 8 passed | 0 failed` for the timezone suite.
```

with:

```
on 29 Sep `ok | 3622 passed | 0 failed | 8 ignored` for the main suite and `ok | 8 passed | 0 failed` for the timezone suite. The eight ignored are the live-Postgres placeholders — one in each of the seven `pg-*.test.ts` files and one in `schema-lifecycle.test.ts` — which skip without `POSTGRES_URL`; AT4 runs those files.
```

- [ ] **Step 2: Edit the Combined Totals sentence**

Replace:

```
`tests/tz/*.test.ts` timezone suite; AT2 without
`POSTGRES_URL` skips the seven `pg-*.test.ts` /
`schema-lifecycle.test.ts` stubs, and after AT4 those
seven run. The number grows as tests land in either
```

with:

```
`tests/tz/*.test.ts` timezone suite; AT2 without
`POSTGRES_URL` ignores eight live-Postgres
placeholders — one in each of the seven
`pg-*.test.ts` files and one in
`schema-lifecycle.test.ts` — and AT4 runs those eight
files against its own Postgres. The number grows as
tests land in either
```

- [ ] **Step 3: Commit**

```bash
git add TEST-PLAN.md
git commit -F - <<'EOF'
Record AT2's 29 Sep counts in TEST-PLAN

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: AT4's 67 across eight files

**Files:**
- Modify: `TEST-PLAN.md`, AT4 (lines 454-460)

- [ ] **Step 1: Edit the PASS clause**

Replace:

```
  its own `fusion_test_*` schema. PASS:
  exits 0, `ok | 52 passed | 0 failed`
  across the seven files. `./test validate`
  stays Postgres-free.
```

with:

```
  its own `fusion_test_*` schema. PASS:
  exits 0, `ok | N passed | 0 failed`
  across the eight files `bin/test-postgres`
  names — the seven `pg-*.test.ts` and
  `schema-lifecycle.test.ts`; on 29 Sep
  `ok | 67 passed | 0 failed`.
  `./test validate` stays Postgres-free.
```

- [ ] **Step 2: Commit**

```bash
git add TEST-PLAN.md
git commit -F - <<'EOF'
Record AT4's 67 passes across eight files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: A2's hashed asset names

**Files:**
- Modify: `TEST-PLAN.md`: A2 (line 486) and its Pin
  clause (lines 496-498)

- [ ] **Step 1: Edit the PASS sentence**

In the A2 line, replace:

```
`site/` with `assets/app.js`, `assets/styles.css`, `assets/` (*.woff2 fonts), 18 page directories
```

with:

```
`site/` with content-hashed assets — `assets/app.<hash>.js` (plus its code-split chunks), `assets/styles.<hash>.css`, the `pages-*.<hash>.css` bundles, and the `*.<hash>.woff2` fonts, where each `<hash>` is sixteen lowercase hex digits that change with the file's content, so read a build's names from its `site/asset-manifest.json` rather than expecting fixed ones — 18 page directories
```

- [ ] **Step 2: Edit the Pin clause**

Replace:

```
       directories, the `fusion-angle` executable,
       `site/assets/app.js`, `site/assets/styles.css`,
       the fonts, and the generated verb/status rooms
```

with:

```
       directories, the `fusion-angle` executable,
       the hashed `site/assets/app.<hash>.js` and
       `site/assets/styles.<hash>.css`, the fonts, and
       the generated verb/status rooms
```

- [ ] **Step 3: Verify no hash was pinned, then commit**

```bash
git diff TEST-PLAN.md | grep -E '^\+.*[0-9a-f]{16}' \
    || echo "no pinned hash"
git add TEST-PLAN.md
git commit -F - <<'EOF'
Describe A2's hashed asset names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Expected: `no pinned hash`.

---

### Task 6: F9's single cycle edge

**Files:**
- Modify: `TEST-PLAN.md`, the F9 body (lines 2648-2656).
  Its Pin clause already states the DFS rule and stays.

- [ ] **Step 1: Edit the body**

Replace:

```
- [ ] **F9** On Layout Test — whose "revise" and "back to
  draft" edges close loops — edges render by class:
  forward edges are solid blue lines with arrow markers
  and named labels. Cycle edges, those that close a loop
  because a return path from target back to source already
  exists in the graph, are dashed orange with a warning
  arrow. Sibling transitions between nodes that have no
  return path render solid blue even when they share a
  level.
```

with:

```
- [ ] **F9** On Layout Test, edges render by class.
  Forward edges are solid primary (blue) lines with arrow
  markers and named labels. A cycle edge is a back-edge of
  the depth-first walk from Create — an edge into a node
  still on the walk's current path — and renders dashed
  warning (orange) with a warning arrow. Layout Test has
  exactly one: "back to draft" (Revise → Draft).
  "revise" (Decision → Revise) is a solid primary forward
  edge into that loop, not a cycle edge. Sibling
  transitions between nodes that have no return path
  render solid primary even when they share a level.
```

- [ ] **Step 2: Commit**

```bash
git add TEST-PLAN.md
git commit -F - <<'EOF'
Name back to draft as F9's only cycle edge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: F21's preview and committed edge

**Files:**
- Modify: `TEST-PLAN.md`, F21 (lines 2910-2923)

- [ ] **Step 1: Edit the case**

Replace:

```
- [ ] **F21** Shift-drag backward (later node →
  earlier node). PASS: the curved preview is
  dashed orange with a warning arrow while over
  the target — the reachability check recognises
  that target → … → source already exists. The
  committed cycle edge matches the preview.
  Pin: tests/flow-layout.test.ts 'wouldBeCycle: backward
       edge creates cycle' (decides the reachability check
       flags the backward edge before it is committed);
       tests/flow-cycle-edges.test.ts 'a back-edge to an
       ancestor is a cycle edge' (decides the committed
       edge is classified as a cycle, which is what dashes
       and colours it); exploratory — the painted
       dashed-orange preview
```

with:

```
- [ ] **F21** Shift-drag backward (later node →
  earlier node). PASS: while over the target the
  curved preview is dashed warning (orange) with a
  warning arrow — the preview follows the
  reachability check, which recognises that target →
  … → source already exists. The committed
  Transition follows F9's depth-first back-edge rule
  instead, so it may render solid primary (blue): on
  29 Sep it did, and "back to draft" (Revise → Draft)
  stayed the only dashed cycle edge. The preview and
  the committed edge follow different rules and need
  not match.
  Pin: tests/flow-layout.test.ts 'wouldBeCycle: backward
       edge creates cycle' (decides the reachability check
       that dashes the preview before the edge is
       committed); tests/flow-cycle-edges.test.ts 'a
       back-edge to an ancestor is a cycle edge' (decides
       the committed edge's class by the depth-first
       back-edge rule, which the reachability check does
       not share); exploratory — the painted dashed-orange
       preview and the committed edge's solid paint
```

- [ ] **Step 2: Commit**

```bash
git add TEST-PLAN.md
git commit -F - <<'EOF'
Split F21's preview and committed edge rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: G36's sidebar, chip, and top bar

**Files:**
- Modify: `TEST-PLAN.md`: G36's body (lines 5672-5691)
  and the tail of its Pin clause (lines 5712-5715)

- [ ] **Step 1: Edit the body**

Replace:

```
  default" control (`.org-set-default`); the plain
  org-name text line in the chip is cleared so the org is
  not named twice. Note the Members and Ideas lists for
  Stark. Select "Wayne Enterprises" → the page does a
  FULL reload and re-scopes: Members shows Wayne's
  roster and Ideas shows Wayne's ideas (org-fenced —
  Stark's rows are no longer visible). Reload the page
  again WITHOUT changing the select → the selection
  persists (Wayne stays active; the choice is stored
  under `fusion-angle:active-organization-id` and boot
  re-exchanges a scoped token from it). A single-org
  seeded user, by contrast, sees NO `<select>` in the
  sidebar — just the org name as PLAIN TEXT in the
  chip. The top bar shows neither the switcher nor a
  greeting; its only org-aware affordance is the
  pending-invitations bell (V3). Source of truth:
  `web-app/app/organization-switcher.ts`,
  `web-app/app/sidebar-member.ts`,
  `web-app/app/adapters/organization-session.ts`,
  `web-app/app/app-boot.ts::scopeBootToActiveOrganization`.
```

with:

```
  default" control (`.org-set-default`); the chip names
  only the signed-in person — its org-name line is
  cleared so the org is not named twice. Note the Ideas
  and Members lists for Stark. Select "Wayne
  Enterprises" → the page does a FULL reload onto
  Wayne: Ideas shows Wayne's ideas and Members shows
  Wayne's humans (org-fenced — Stark's rows are no
  longer visible). Reload the page again WITHOUT
  changing the select → Wayne stays active (the choice
  is stored under `fusion-angle:active-organization-id`
  and boot re-exchanges a scoped token from it). A
  Wayne-only member, such as
  `mike.thompson@company.com`, sees NO `<select>` in
  the sidebar — just "Wayne Enterprises" as PLAIN TEXT
  in the chip under their name. The top bar carries
  neither the switcher nor a greeting, yet it still
  names the active org as a read-only stat: the first
  label of its stat strip (`#header-stats`), beside the
  pending-invitations bell (V3). Source of truth:
  `web-app/app/organization-switcher.ts`,
  `web-app/app/sidebar-member.ts`,
  `web-app/app/header-info.ts`,
  `web-app/app/adapters/organization-session.ts`,
  `web-app/app/app-boot.ts::scopeBootToActiveOrganization`.
```

- [ ] **Step 2: Edit the Pin clause's exploratory tail**

Replace:

```
       clause); exploratory — the live full-page reload,
       the plain-text-vs-select rendering for a
       single-org user, and the top bar carrying neither
       switcher nor greeting
```

with:

```
       clause); exploratory — the live full-page reload,
       the plain-text-vs-select rendering for a
       Wayne-only member, and the top bar carrying
       neither switcher nor greeting while its stat strip
       names the org read-only
```

- [ ] **Step 3: Commit**

```bash
git add TEST-PLAN.md
git commit -F - <<'EOF'
Match G36 to the sidebar chip and top bar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: K26's walk-created row

**Files:**
- Modify: `TEST-PLAN.md`: the K26 body (lines 6515-6521)
  and the tail of its Pin clause (lines 6526-6529)

- [ ] **Step 1: Edit the body**

Replace:

```
- [ ] **K26** Filter to `under_review` status + sort by
  Projected Impact descending. Three seeded `under_review`
  mock projects, high first: Workforce Capacity
  Forecasting, Predictive Maintenance System, Employee
  Training Assistant. PASS if those three rows render,
  ranked high first — the "review queue ranked by impact"
  workflow we designed.
```

with:

```
- [ ] **K26** Filter to `under_review` status + sort by
  Projected Impact descending. Four rows render: the
  three seeded `under_review` projects — Workforce
  Capacity Forecasting (+79), Predictive Maintenance
  System (+1), and Employee Training Assistant (no
  baselines, "—") — plus AA22a's converted project,
  which AA23 left `under_review`. PASS if the three
  seeded titles rank high-to-low in that order with
  Employee Training Assistant last, and the converted
  row sits wherever its own projected impact places it.
  That value comes from the baselines this walk dragged
  in AA22 and AA22a, so its slot varies by walk: on
  29 Sep it read +55, between Workforce Capacity
  Forecasting and Predictive Maintenance System. This
  is the "review queue ranked by impact" workflow we
  designed.
```

- [ ] **Step 2: Edit the Pin clause's exploratory tail**

Replace:

```
       exploratory — the live filter-to-`under_review`,
       and that these three seeded projects rank in this
       order (a seed-data fact, not a product covenant a
       unit test should pin)
```

with:

```
       exploratory — the live filter-to-`under_review`,
       that these three seeded projects rank in this
       order (a seed-data fact, not a product covenant a
       unit test should pin), and where AA22a's converted
       row lands among them
```

- [ ] **Step 3: Commit**

```bash
git add TEST-PLAN.md
git commit -F - <<'EOF'
Place the walk-created project in K26

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Retire the drift item from TODO

**Files:**
- Modify: `TODO.md`, `## Critical functionality path`

- [ ] **Step 1: Drop the drift sub-bullet**

Remove these lines, which Task 0 added:

```
  - TEST-PLAN drift, `2026-09-29-walk-drift` — AT2,
    AT4, A2, F9, F21, G36, and K26 still describe
    behavior the walk did not see. Oracle: each case
    reads as the 29 Sep walk and the re-count saw
```

If it is the last sub-bullet under "The 29 Sep walk's
mitigations", remove that parent bullet's five lines
too.

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -F - <<'EOF'
Drop the landed drift item from TODO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 11: Land

- [ ] **Step 1: Rebase and check**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-09-29-walk-drift
git rebase master
git diff master --stat
```

Expected: only `TEST-PLAN.md`, `TODO.md`, and this plan
changed. `TODO.md` may conflict with a sibling 29 Sep
plan that landed first. Keep every sibling's lines and
drop only this plan's own. Markdown only, so no
`./test validate`.

- [ ] **Step 2: Fast-forward master and clean up**

```bash
cd /Users/tmornini/code/fusion-angle
git merge --ff-only 2026-09-29-walk-drift
git worktree remove .worktrees/2026-09-29-walk-drift
git branch -d 2026-09-29-walk-drift
```

If `--ff-only` refuses, return to Step 1. Never `-D`.

---

## Out of scope

- D36, D37, WB16, and I22 (BLOCKED driver limits).
- I21's probe step (owner call, filed by the I21
  plan), and the F29, I21, and K17 Pin clauses (their
  own plans).
- No walk, no `./deploy`, no `./deploy --render`.

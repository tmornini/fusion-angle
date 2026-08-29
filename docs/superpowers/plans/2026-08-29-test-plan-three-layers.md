# Three Layers, One Serial Walk — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Do not use git worktrees (AGENTS.md). Work on
> master.

**Goal:** Replace the fourteen-hunter parallel TEST-PLAN run
with three named verification layers — `./validate` (gate),
`./test-all` (gate), and one explorer's serial walk
(exploration) — and bind every browser observation to a red
test before it may change product.

**Architecture:** Add `./test-all` (Layer 1 then
`./test-browser`). Rewrite TEST-PLAN.md's ~600-line parallel
protocol as one ~150-line `## The walk` section, add AT5, and
restate scoring so BLOCKED is legal again for a driver limit.
Delete the slice seed (`api/test-plan-slices.ts`) and its
twelve tests, re-basing the three tests that borrow its
fixture onto the mock seed. Add a `./validate` check that
every `tests/…test.ts` path cited in TEST-PLAN.md exists.
Then audit all 401 cases section by section — one auditor
per section, one refuter per section — merging the
`Serial:`/`Parallel:` variants into one text and ending every
case with a `Pin:` clause naming its Layer 1/2 test or
`exploratory`.

**Tech Stack:** Bash, TypeScript ES2024 strict under
`node --strip-types` (Node 26), `node:test`, Markdown. No new
dependency.

**Spec:**
`docs/superpowers/specs/2026-08-29-test-plan-three-layers-design.md`
(committed at `9083d1b9`).

## Global Constraints

- **Base:** master at `9083d1b9`. Work on master; never
  branch, never merge, never push, never use a worktree.
- **One concern per commit.** Subject one line, ≈50 chars,
  present-tense imperative, no body prose. Every commit
  message ends with exactly these two trailer lines:

  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01YGbTXswdVpcWaCD4Tihcsq
  ```

- **Never move and change content in one commit.**
- **`./validate` green before every commit.** It composes
  both `tsc` projects, `./test` in two TZ passes, the
  78-character lint over code and the named root scripts,
  the `org` identifier ban, the retired-vocabulary lint, the
  root-doc line ceilings, the later-work single-home gate,
  and the two drift gates (`generate-schema-svg --check`,
  `generate-api-documentation --check`).
- **78-character lines, 4-space indent** in every file the
  lint covers (`api/`, `web-app/`, `tests/`, `shared/`,
  `server/` `*.ts|html|css`, plus the root scripts named in
  `validate`). Markdown is NOT line-linted, but AGENTS.md,
  README.md, SCHEMA.md, and AUDIT.md carry line-count
  ceilings: 300, 150, 200, 400. TEST-PLAN.md and TODO.md are
  exempt from the ceiling.
- **`./test-browser` and `./test-all` cannot run inside the
  Claude Code sandbox** (Chrome cannot `bind()` its
  ProcessSingleton socket there). Never invoke them from a
  subagent. Where this plan needs their output, the master
  asks the operator to run `! ./test-all` and reads the
  result from the conversation.
- **No new dependency.** No Playwright, Puppeteer, jsdom.
- **No product changes.** Every edit is to a script, a test,
  a seed module, or a document. The two product seams the
  rewrite names — the Undo-at-stack-bottom 201
  (`api/derive-flows.ts`) and the first post-reload click
  that only focuses — go to TODO.md, never to code.
- **Frozen:** every dated file under
  `docs/superpowers/specs/`, `docs/superpowers/plans/`
  (except this one), and
  `docs/superpowers/test-plan-mitigations/` is byte-identical
  when this plan finishes. Do not edit them.
- **Retired vocabulary.** The words leave in two waves. Task
  2 clears the protocol block; Tasks 8–24 clear the case
  sections one at a time. Measured on TEST-PLAN.md at
  `9083d1b9`, the counts a task must expect are:

  | Term | Now | After Task 2 | After Task 24 |
  |---|--:|--:|--:|
  | `hunter` (case-insensitive) | 50 | 9 | 0 |
  | `.localhost` | 27 | 5 | 0 |
  | `activate_tab` | 2 | 1 | 1 |
  | `^tenant:`/`^parallel:`/`^global_lock:`/`^depends:` | 68 | 64 | 0 |
  | `Serial:` | 64 | 63 | 0 |
  | `Parallel:` | 59 | 58 | 0 |

  The nine surviving `hunter` lines after Task 2 are in the
  A, AA, F, F2, G, and SV case sections — Tasks 9, 10, 15,
  16, 18, and 24 own them. The five surviving `.localhost`
  lines are all in SV (Task 24). The one surviving
  `activate_tab` is inside the explorer prompt and is
  correct: the explorer activates its one tab. `./validate`
  does not enforce any of this; the task reviewer does.

---

## The audit procedure

Tasks 8 through 24 each audit one TEST-PLAN.md section. The
method is identical for all seventeen; only the section
changes. Each of those tasks names this heading — read it in
full before touching the file.

### What you are given

- **Your section letter** and its heading line in
  `TEST-PLAN.md`. Your section runs from its `## X.` heading
  to the next `## ` heading (or to `## Summary Format`).
- **The inventory file**, a path the dispatch names. It
  lists every test file under `tests/`, `tests/tz/`, and
  `tests/browser/`, each followed by that file's `test('…')`
  names, one per line. It was generated by:

  ```bash
  for f in tests/*.test.ts tests/tz/*.test.ts \
      tests/browser/*.test.ts; do
      echo "=== $f"
      grep -oE "^test\('[^']*'" "$f" | sed "s/^test('/  /"
  done
  ```

### The rule of evidence

A `Pin:` is valid **only if you opened the cited test file
and can quote the assertion that decides this case's PASS
line.** Not the file — the assertion. A test that exercises
a neighboring covenant is not a pin. When no test decides the
PASS line, the pin is `exploratory — <what only a human or a
browser can see>`. Pointing a case at a neighbor is the one
failure this audit exists to prevent.

### The six edits, in order

1. **Drop the header fields.** Delete the four lines
   `tenant: …`, `parallel: …`, `global_lock: …`, and
   `depends: …` that follow your `## X.` heading, and the
   blank line separating them from the prose. Document order
   is the order now; nothing else replaces them.

2. **Rewrite the section preamble.** Delete every sentence
   that exists because of parallelism or hidden tabs: slice
   assignments, `Parallel:` / `Serial:` instructions to the
   section as a whole, "do not restart the process", "do not
   mint garden rows", hunter ordering, alias tables, and any
   reference to another agent's phase. Keep only what a
   single explorer on a fresh `--mock-data` origin needs. If
   nothing survives, the section has no preamble.

   Strip agent-ownership parentheticals from the section and
   subsection headings too: `(Agent-F2 read-only domain)`,
   `(Agent-G, Phase 2)`, `(Agent-E)`, `(Agent-CH)` and their
   kin name hunters that no longer exist. The heading keeps
   its id and its subject and loses the owner.

3. **Merge the variants.** A case carrying both `Serial:`
   and `Parallel:` texts becomes one text:
   - Keep the variant that **exercises the product** —
     usually the create/act variant, not the
     observe-what-the-seed-already-made variant.
   - When both exercise the product equally, keep the
     shorter.
   - Rewrite it on the mock tenant's names:
     `demo@example.com` (Tony Stark), Stark Industries, the
     second organization, and the seeded humans. Never
     `*.localhost`, never `*@test-plan.example`, never a
     slice alias.
   - A case whose `Serial:` text is `N/A` becomes driveable
     on the mock tenant: the walk's database is discarded at
     J, so minting rows is free.
   - Where a later case counted the untouched seed, the
     count becomes `≥ seeded N`. The exact count is a Layer
     1 covenant, not a walk assertion.
   - The words `Serial:` and `Parallel:` must not survive
     anywhere in your section.

4. **Normalize the case form.** Every case is
   `- [ ] **ID** <text>`. Section K alone uses `**K1.**
   <text>` today; convert all thirty of K's cases to the
   checkbox form, keeping the id and the text. No other
   section needs this edit.

5. **Add the `Pin:` clause.** Every case body ends with one
   `Pin:` line (wrapped as needed). A test name, not only a
   file. Several pins join with `;`. The unpinned remainder
   is named after `exploratory —`. The four legal shapes:

   ```
   Pin: tests/flow-operations.test.ts
        'performAddNodeAtPosition: returns node, edge'
   Pin: tests/browser/canvas-gestures.test.ts
        'a port drag onto empty canvas adds a node and its edge'
   Pin: exploratory — the gold glow's appearance
   Pin: tests/api-human-members.test.ts 'PUT replaces the
        strengths list'; exploratory — the chip toggles
   ```

   Cite the **lowest layer that can express the covenant**:
   a reducer, presenter, or adapter test at Layer 1; a CDP
   test under `tests/browser/` at Layer 2. Every path you
   cite must exist — Task 6 adds a `./validate` check that
   fails the build on a missing one.

6. **Place the drive notes.** A product-true driving note
   goes beside the case it serves. Notes that exist only
   because of hidden tabs or fourteen hunters are deleted:
   `activate_tab` before each gesture, stolen-tab paint,
   aliases and why-aliases, two jars on aliases, fourteen
   macOS sheets, the 1.19× screenshot scale, the
   `drain_events` ring discipline, and the 14-hunter DAG.
   The notes that survive are the ones listed under
   `### Driving notes` in `## The walk` — do not duplicate
   those; point at them only if a case needs the reminder.

### What you return

Your commit contains the rewritten section and nothing else.
Your report file additionally carries, under a heading
`## Unpinned but pinnable`, one line per covenant your
section asserts that no test decides today, each naming the
lowest layer that could express it:

```
- **D14** the sent-back re-submit clears the reviewer note —
  Layer 1, a derive test in tests/derive-ideas.test.ts
```

Task 25 consolidates every section's list into one TODO.md
`## Later work` bullet. Do not write TODO.md yourself.

### The refuter

Your task reviewer is the refuter. It re-opens every test
you cited and rejects any pin whose quoted assertion does not
decide the case's PASS line. A rejected pin becomes
`exploratory`. Expect it, and do not pad your pins to look
thorough — an honest `exploratory` costs nothing and a false
pin costs the codebase its map.

---

## Stage 1 — the two gates

### Task 1: Add `./test-all`, the Layer 2 gate

**Files:**
- Create: `test-all`
- Modify: `validate` (the `awk "$AWK_LINT"` script list)
- Modify: `AGENTS.md` (the command block, lines 7–38)

**Interfaces:**
- Consumes: `./validate` and `./test-browser`, both already
  executable at the repository root.
- Produces: `./test-all` — Layer 2. Later tasks and
  documents name it as the operator's gate before `./build`,
  a deploy, or a walk.

- [ ] **Step 1: Write `test-all`**

Create `test-all` with exactly this content. Every line is
at or under 78 characters.

```bash
#!/bin/bash
set -euo pipefail

# Layer 2: ./validate (Layer 1), then the deterministic
# browser suite. Chrome absence is ./test-browser's own
# refusal — this script adds no Chrome discovery of its
# own. Cannot run inside the Claude Code sandbox: Chrome
# cannot bind() its ProcessSingleton socket there.

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

./validate
./test-browser
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x test-all
```

- [ ] **Step 3: Add it to the 78-character lint list**

In `validate`, the second `awk "$AWK_LINT"` invocation
lists the root scripts. Change:

```bash
    awk "$AWK_LINT" build build-lib serve test test-postgres \
        test-browser \
        validate generate-schema-svg \
```

to:

```bash
    awk "$AWK_LINT" build build-lib serve test test-postgres \
        test-browser test-all \
        validate generate-schema-svg \
```

- [ ] **Step 4: Verify the script parses and the lint sees it**

```bash
bash -n test-all
./validate
```

Expected: `bash -n` silent, `./validate` exits 0. Do NOT run
`./test-all` — `./test-browser` cannot start Chrome in the
sandbox.

- [ ] **Step 5: Name it in the AGENTS.md command block**

In the ```` ```bash ```` block that opens AGENTS.md, insert
one line directly after the `./test-browser` line:

```
./test-all             # Layer 2: ./validate + ./test-browser
```

The block's existing alignment puts the `#` at column 24;
match it. AGENTS.md is 276 lines against a 300-line ceiling
— this task may add exactly one line.

- [ ] **Step 6: Re-run validate and commit**

```bash
./validate
git add test-all validate AGENTS.md
git commit -m "Add the test-all Layer 2 gate"
```

Expected: `./validate` exits 0 (its root-doc ceiling check
now sees AGENTS.md at 277 lines).

---

### Task 2: Rewrite TEST-PLAN.md's protocol as the walk

**Files:**
- Modify: `TEST-PLAN.md` (delete lines 5–559; add AT5 to
  `## AT`; rewrite `### Combined Totals`'s outcome table and
  arithmetic; rewrite `## Summary Format` and its stub
  template)
- Modify: `AGENTS.md` (`## Gates`, the router table's
  TEST-PLAN.md row, `## Subagents`, the `./test-browser`
  comment in the command block)
- Modify: `test-browser` (line 4's `Tier 2` becomes
  `Layer 2`)

**Interfaces:**
- Consumes: `./test-all` from Task 1.
- Produces: TEST-PLAN.md's `## The walk` section, whose
  `### Driving notes` list every audit task (8–24) points at
  rather than duplicating; the `Pin:` clause shape those
  tasks fill in; and the mitigation stub template carrying
  `Pin:` and `Reproduced by:`.

**This commit ends the parallel run.** No case text is
edited here — only the protocol around the cases.

- [ ] **Step 1: Read what you are replacing**

```bash
sed -n '1,10p;555,565p' TEST-PLAN.md
```

Confirm line 5 is `### How to invoke`, line 559 is
`run by the master after join.`, line 560 is blank, and line
561 is `## Summary`. If the line numbers differ, find the
same boundaries by content — the region to delete runs from
the `### How to invoke` heading through the last line before
the blank line preceding `## Summary`.

- [ ] **Step 2: Replace lines 5–559 with `## The walk`**

Delete lines 5 through 559 inclusive and put this in their
place. Keep line 1 (`# Fusion Angle — Test Plan`), line 2
(blank), line 3 (the Encoding blockquote), and line 4
(blank) exactly as they are.

````markdown
## The walk

Three layers verify this product. Two are gates. The third
is exploration, and nothing rides on its result.

| Layer | Command | Runs | Standing |
|---|---|---|---|
| 1 | `./validate` | AT1–AT3: both `tsc` projects, `./test` in two TZ passes, the lints, the two drift gates. Chrome-free, Postgres-free | Gate: every commit |
| 2 | `./test-all` | Layer 1, then `./test-browser` (AT5) | Gate: the operator's, before `./build`, a deploy, or a walk; `./crank` enforces it for the walk |
| 3 | "run the test plan" | `./crank --mock-data 8080` — Layer 1, AT4 `./test-postgres`, AT5 — then one explorer walks A4 through SV | Exploration; nothing rides on its result |

**A browser observation changes product only through a red
test at Layer 1 or Layer 2.** The walk finds; the test
proves. A product commit may cite a mitigation stub only
when that stub's `Reproduced by` names a red test. The
ruling is not evidence; the red test is.

### Invocation

Use a fresh local Postgres via Docker. Do not set
`POSTGRES_URL`, `JWT_HMAC_SIGNING_KEY`, or
`HTTP_SERVER_PORT` by hand — `./crank` mints them for its
children and never prints them.

The browser layer is the **browser-use** plugin (MCP
`browser-use`, or CLI `browser-use`). If that plugin is not
connected and the CLI is not on PATH, **refuse the run.** Do
not fall back to Claude-in-Chrome, chrome-devtools MCP, or
source-only workarounds. Canvas gestures, the CSS viewport,
skeletons, reduced-motion, and the two-jar SV cases need a
compositor mouse and a real CSS viewport.

One macOS approval sheet appears per browser-use daemon
connection. Answer it, or run `browser-use mac-approve`
first. A 45-second silence fails the walk before it starts,
not mid-walk.

### The master's steps

1. **A1** `./build` from a clean tree, then **A2** inventory
   the artifact.
2. **A3** `./crank --mock-data 8080`. Crank runs Layer 1,
   `./test-postgres` (AT4), and `./test-browser` (AT5)
   before it serves. Red anywhere aborts the walk — no
   explorer is dispatched. Read the seed reveal from stdout;
   it is shown once. A3 **is** SV1.
3. Dispatch one explorer with the prompt below. A1–A3
   are the master's — they run before the origin exists;
   A4 onward are the explorer's.
4. Receive one line per case. Write the summary
   (`## Summary Format`) and one stub per FAIL cluster.
5. Run **K8** (wipe and reseed — the explorer has returned),
   then **J1–J3**.

The master does not drive the product and does not patch.

### The explorer prompt

Copy this verbatim, substituting the seed reveal's sign-ins.

```
Go to Medium Church!

Then read AGENTS.md at
/Users/tmornini/code/fusion-angle/AGENTS.md in full.

You are the explorer for the Fusion Angle TEST-PLAN walk.

Origin: http://localhost:8080
Admin: {admin_username} / {admin_password}
{the seed reveal's other sign-ins}

Read TEST-PLAN.md from `## The walk` to the end. Every
case from **A4** through the end of `## SV` is yours, in
document order. A1–A3 are the master's. Skip K8 (the master runs it after you return) and
J (the master's teardown).

Refuse if browser-use is not available. Do not fall back
to Claude-in-Chrome or chrome-devtools MCP.

Setup, once: clear this origin's cookies with
`Storage.clearDataForOrigin` (`storageTypes: 'cookies'`);
set `Emulation.setDeviceMetricsOverride` to 1280×800 with
`deviceScaleFactor: 1` (I10–I15 set ≤767 and restore);
open one tab and `activate_tab` it. That tab stays
visible for the whole walk. Open a second tab only where
a case needs one (SV6–SV10, cross-tab cases); activate
whichever tab you are driving; confirm
`document.visibilityState === 'visible'` before every
gesture and every timing assertion.

Drive with compositor mouse and CDP key events. Never
`js()` fetch the API — the bearer is memory-only; read
the network log. Sign-ins are throttled to 5 per 60 s
per client: pace them, and a 429 inside that window is
the product working, not a FAIL.

Do not patch. Do not re-seed. Do not retry the plan.

Return one line per case:
ID PASS|FAIL|BLOCKED|DEFERRED|DRIFT — one-line note.
```

### Driving notes

These are product-true. A case that needs one names it; do
not repeat the note in every case.

- The canvas `<svg>` is replaced on every commit — query it
  fresh before each gesture.
- There is no `dblclick` listener: send two pointerdowns on
  one element id inside `DBLCLICK_MS` (400).
- Chords carry the browser's `key`; Shift uppercases it.
- `.focus()` selects the way Tab does; `.click()` selects
  nothing.
- F56: no canvas click before Space.
- List-row drags are pointer capture on `.drag-handle`.
- Probe for the skeleton before fetches settle.
- Reduced motion is `Emulation.setEmulatedMedia`.
- Downloads are intercepted at `URL.createObjectURL`;
  uploads are built with `DataTransfer`.
- List pages wait on the card count — never screenshot
  early.
- Authentication is throttled to five hits per 60 seconds
  per client, counting `authorize` and `token` together.
- The first click after a reload only focuses the window.
  This is a product seam, filed in TODO.md; drive a second
  click.

### Scoring

| Outcome | Meaning |
|---|---|
| PASS | the PASS line was observed |
| FAIL | the PASS line could not be observed as driven — a finding, not a verdict |
| BLOCKED | a step could not be performed for a named reason outside the product (driver or environment); the reason is the note |
| DEFERRED | a prerequisite case did not produce what this case needs |
| DRIFT | passes in substance; the document or the UI text disagrees — the document changes |

Nothing blocks on any outcome. BLOCKED is allowed for a
driver limit: with no gate riding on the walk, an honest
BLOCKED costs nothing and a dishonest FAIL costs a day. A
durable limit earns the case a one-line driving note, added
by the master.
````

- [ ] **Step 3: Add AT5 and rewrite the AT preface**

In `## AT. Automated Test Suite`, delete the four header
lines (`tenant: none`, `parallel: no`, `global_lock: none`,
`depends: —`) and replace the preface paragraph
("The automated layer is crank's gate…Abort on any AT red.")
with:

```markdown
AT1–AT3 are Layer 1, the one `./validate` crank runs
first. AT5 is Layer 2's browser suite. AT4 is crank's
`./test-postgres`, run after postgres is up. Layer 3
runs all five through `./crank`; the walk never invokes
them separately. Abort on any AT red.
```

Then append AT5 after the existing AT4 case:

```markdown
- [ ] **AT5** Crank runs `./test-browser` after AT4 and
  before `./build --no-zip`. It bundles the client into
  `$TMPDIR` and runs `tests/browser/*.test.ts` serially
  against an in-process origin on the memory backend,
  one Chrome browser context per test. Needs Chrome
  (`CHROME` or `CHROME_DEBUG_URL`). PASS: exits 0,
  `fail 0`. `./test-all` runs AT1–AT3 then AT5.
```

- [ ] **Step 4: Correct the two Summary tables**

In `## Summary`, the sentence after the table reads "A3 **is**
SV1 — counted once, in A. The SV hunter skips SV1." Replace
"The SV hunter skips SV1." with "The explorer skips SV1."
Add AT5 to the AT row: the `AT. Automated Test Suite` count
becomes `5` and the `**Total**` becomes `**401**`.

In `### Combined Totals`, the first sentence's "400 distinct
TEST-PLAN cases" becomes "401 distinct TEST-PLAN cases".

Delete the whole outcome-category table — every row, its
header, and the sentence introducing it — and put this in
its place. `### Scoring` in `## The walk` now defines the
five outcomes, and a definition that sits in two places
with two glosses is the Ninth Commandment's failure: once
the better way is found it must REPLACE every similar site,
never rest beside it. The old table's FAIL row in
particular ("Real regression; investigate | YES") is the
doctrine `## The walk` exists to retire.

```markdown
The five outcomes are defined once, in `## The walk`'s
`### Scoring`. `pending` is the sixth and is not an
outcome: it is the default `- [ ]`, not yet executed.
```

Then delete the whole "A fully green run reports:"
paragraph through "…a missing toy, or a shared alias." —
the summary reports counts; there is no arithmetic to
satisfy.

- [ ] **Step 5: Rewrite `## Summary Format`**

Replace the fenced summary template's `Mode: parallel-agents
| serial` line by deleting it. In the per-section table, add
`Deferred` and `Drift` columns and order all five to match
`### Scoring`'s own order — `Pass | Fail | Blocked |
Deferred | Drift`, which means moving `Blocked` after
`Fail`, not just appending. Three sites name these
outcomes (`### Scoring`, the template's `Total:` line, this
table); all three must read in one order. Change the
`AT` row's count from 4 to 5. **Leave the `K` row at
`29 (skip K8)`** — K8 has its own row of 1 below, so K's
thirty cases are already counted as 29 + 1, and the Cases
column must sum to 401 once AT reads 5.

Add AT5 to the template's `## Automated (AT)` list, after
the AT4 line, so the list and the table row agree:

```markdown
- AT5 ./test-browser: PASS (0 fail)
```

Two survivors of the parallel run also live in this
section and go with it: the `## Drift Candidates` table's
`Mode` column (that is the `parallel | serial` mode the
spec retires) — delete the column and its separator cell,
leaving `| Case | Symptom | Likely cause |`. And the
section preface's sentence "This is the contract
`### How to invoke` references." names a heading you
deleted in Step 2; it becomes "This is the contract
`## The walk` references."

Then replace the
`## BLOCKED detail (K7 process prerequisite only)` heading
with `## BLOCKED detail`, and its bullet's comment with
`- <case ID>: <the reason outside the product> | (none)`.
Delete the "A fully green run with no drift produces…"
paragraph and the two paragraphs after it that define
`BLOCKED` as K7-only and forbid a driver limit; put this in
their place:

```markdown
The summary reports counts. FAIL rows become stubs; there
is no arithmetic to satisfy and no run is "fully green".
`BLOCKED` names a driver or environment limit; `DRIFT`
names a document that must change. Neither is a
regression, and neither blocks.
```

- [ ] **Step 6: Rewrite the mitigation stub template**

In `### Mitigation specs`, replace "After join," with
"After the walk," — a join is what fourteen hunters did.
Replace "The master lists paths in the summary." with "The
master lists paths in the summary. Dated stubs stay
frozen." Then replace the fenced template with:

````markdown
```
# TEST-PLAN mitigation — {section}

- Section: {id}
- Cases: {comma-separated ids}
- Pin: {the case's Pin clause, copied}
- Expected: {from the case PASS line}
- Observed: {explorer note}
- Suspected layer:
  UI | adapter | API | seed | driver | doc
- Reproduced by:
  tests/{file}.test.ts '{test name}' red at {SHA}
  | not reproduced — {driver or environment reason}
  | doc — {the DRIFT correction}
```

**A product commit may cite a stub only when
`Reproduced by` names a red test.** The test sits at the
lowest layer that can express the covenant — a reducer,
presenter, or adapter pin at Layer 1, a CDP test at
Layer 2.
````

- [ ] **Step 7: Verify the retired vocabulary is gone**

```bash
grep -c '\.localhost' TEST-PLAN.md
grep -ci 'hunter' TEST-PLAN.md
grep -c 'activate_tab' TEST-PLAN.md
grep -cE '^(tenant|parallel|global_lock|depends):' TEST-PLAN.md
```

Expected, exactly: `5`, `9`, `1`, `64`.

None of those is zero, and none should be. The words leave
in two waves: you clear the protocol block, and Tasks 8–24
clear the case sections one at a time. Specifically —

- **`.localhost` 5**: all in `## SV`, the two-jar cases
  (Task 24 owns them).
- **`hunter` 9**: in the A, AA, F, F2, G, and SV case
  sections (Tasks 9, 10, 15, 16, 18, 24 own them). You clear
  exactly two: `## Summary`'s "The SV hunter skips SV1"
  (Step 4) and the stub template's `{hunter note}` (Step 6).
  Both are in your steps already. If your count is 11, you
  missed one of those two; if it is 0, you edited case
  sections that are not yours.
- **`activate_tab` 1**: inside the explorer prompt you just
  wrote. Correct — the explorer activates its one tab.
- **`64`**: 68 header-field lines today, minus AT's four,
  which Step 3 removes. The other sixteen sections keep
  theirs until their own audit task.

Do NOT edit a case section to make a count go to zero.
Nothing outside the protocol block, `## AT`, `## Summary`,
`### Combined Totals`, `## Summary Format`, and
`### Mitigation specs` is yours in this task.

- [ ] **Step 8: Update AGENTS.md's Gates, router, and Subagents**

AGENTS.md is at 277 lines against a 300-line ceiling. These
edits REPLACE parallel language; the file must end at 300 or
fewer lines. Verify with `wc -l AGENTS.md` before you commit.

In `## Gates`, replace the paragraph beginning "When an
agent runs the full test plan (CLI + browser)" with:

```markdown
Three layers verify this product. Layer 1 is `./validate`,
the gate on every commit. Layer 2 is `./test-all` —
Layer 1 then `./test-browser` — the operator's gate before
`./build`, a deploy, or a walk. Layer 3 is the serial walk
(`./crank --mock-data 8080`, then one explorer through
TEST-PLAN.md); it is exploration and gates nothing. A
browser observation changes product only through a red
test at Layer 1 or Layer 2: a product commit may cite a
TEST-PLAN mitigation stub only when its `Reproduced by`
names a red test.
```

In the `## Read next` table, change the TEST-PLAN.md row's
"Go there for" cell from `browser regression, Protocol` to
`three layers; the serial walk`.

In `## Subagents`, change "its hunters and refuters fan out
as subagents" to "its explorer, auditors, and refuters fan
out as subagents". Search the whole file for `hunter` and
rewrite every occurrence; `grep -ci hunter AGENTS.md` must
be 0.

Finally, retire the word "Tier". This task renames the
verification vocabulary to Layers, and two comments still
say Tier — the same concept under two names, which is the
Third Commandment's failure. In the AGENTS.md command
block, `./test-browser`'s comment reads
`# Tier 2: headless Chrome vs an in-process origin`;
change it to `# Layer 2's browser half; needs Chrome`,
keeping the `#` at column 24 like its neighbours. And in
the `test-browser` script itself, line 4 opens
`# Tier 2: deterministic browser tests.` — change `Tier 2`
to `Layer 2` there and leave the rest of that comment
alone. `grep -rni '\btier [0-9]' AGENTS.md test-browser`
must then print nothing. (TODO.md's "Tier-2 launcher"
belongs to Task 7, which rewrites that bullet anyway.)

- [ ] **Step 9: Validate and commit**

```bash
./validate
wc -l AGENTS.md
git add TEST-PLAN.md AGENTS.md
git commit -m "Replace the parallel protocol with the walk"
```

Expected: `./validate` exits 0; AGENTS.md ≤ 300 lines.

---

## Stage 2 — retire the parallel apparatus

The spec's commit sequence orders the mode-drop before the
test re-base. That order cannot hold: `tests/pg-seed.test.ts`
imports `formatTestPlanSliceCredentials` from
`server/seed.ts`, so dropping the mode first leaves
`./validate` red, and the Global Constraint says green before
every commit. The tests are re-based first (Task 3), then the
mode goes (Task 4). For the same reason
`tests/api-transition-legacy-cut.test.ts`'s named exception
moves into the deletion commit (Task 5): its assertion is
`assert.deepEqual([...hits].sort(), [...NAMED_EXCEPTIONS].sort())`,
an exact equality, so the entry must leave in the very commit
that deletes the file it names.

### Task 3: Re-base the two tests that borrow the slice seed

**Files:**
- Modify: `tests/api-authentication-token.test.ts` (the test
  `'unseated password grant has no org claims'`, lines
  1059–1218, and the `api/test-plan-slices.ts` import at
  lines 12–14)
- Modify: `tests/pg-seed.test.ts` (the import at line 10 and
  lines 31–32; the `--test-plan-slices` assertion in
  `'parseSeedArgv accepts one mode flag'`; and three whole
  tests)

**Interfaces:**
- Consumes: `seededMockDb` and `testHashPassword` from
  `tests/mock-seed.ts`; `seedPersonIdentity` and
  `seedIdentityCredential` from `tests/identity-fixtures.ts`.
- Produces: a `tests/` tree in which nothing but
  `server/seed.ts`, `server/postgres-seed.ts`, `crank`,
  `postgres-seed`, `tests/slices-*.test.ts`,
  `tests/test-plan-slices.test.ts`, and
  `tests/api-transition-legacy-cut.test.ts` still names the
  slice seed.

**The covenant is unchanged.** Every assertion the re-based
test makes about the product today it must still make. Only
the fixture changes. A test that turns red under the mock
seed is a finding — report it, do not weaken the assertion.

- [ ] **Step 1: Confirm the failing direction**

```bash
grep -rn "formatTestPlanSliceCredentials\|SEED_TEST_PLAN_SLICES_FLAG\|'test-plan-slices'" api server tests shared web-app
```

Expected: hits in `server/seed.ts` and `tests/pg-seed.test.ts`
only. That is the surface this task clears from `tests/`.

- [ ] **Step 2: Re-base the unseated-grant test's fixture**

In `tests/api-authentication-token.test.ts`, delete the
import:

```ts
import {
    postTestPlanSlices, sliceEntityId,
} from '../api/test-plan-slices.ts';
```

and add to the existing `./mock-seed.ts` import line
(`import { testHashPassword } from './mock-seed.ts';`) so it
reads:

```ts
import {
    seededMockDb, testHashPassword,
} from './mock-seed.ts';
```

Add one import beside the existing `./identity-fixtures.ts`
import, so that import block reads:

```ts
import {
    seedClientRegistration,
    seedClientRegistrationTombstone,
    seedIdentityCredential,
    seedPersonIdentity,
} from './identity-fixtures.ts';
```

Then, directly above the test, replace the lone
`const UNSEATED = 'dtmZgnDBlVcoyjxKzlaKgA';` with:

```ts
// A person identity with a password and no seat anywhere,
// minted on top of the mock seed. The slice seed used to
// supply one; the covenant is the token's silence about
// organizations, not where the identity came from.
const UNSEATED = 'dtmZgnDBlVcoyjxKzlaKgA';
const UNSEATED_CREDENTIAL = 'CYr8sAaDTpCQEUSZUqUxOg';
const UNSEATED_EMAIL = 'unseated@example.com';
const UNSEATED_PASSWORD = 'unseated-s3cret';
const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const STARK_ADMIN = 'XXZruirZyAOoRpNxaDnpSA';
```

- [ ] **Step 3: Replace the test's first eighteen lines**

The test opens:

```ts
test('unseated password grant has no org claims',
async () => {
    const db = memoryDbAdapter();
    const reveal = await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    const g = reveal.find(
        (row) => row.section === 'G',
    );
    assert.ok(g);
    const password = g.unseatedPassword;
    assert.ok(
        (password ?? '').length >= 16,
    );
    const gOrganization = g.organizationId;
    const gAdmin = sliceEntityId('g-admin');
    const verifier = 'pkce-verifier-unseated';
```

Replace that opening with:

```ts
test('unseated password grant has no org claims',
async () => {
    const db = await seededMockDb();
    await seedPersonIdentity(db, UNSEATED, {
        name: 'Unseated Person',
        email: UNSEATED_EMAIL,
        phone: '+1 (555) 000-0000',
        bio: 'Invited, not yet seated.',
    });
    await seedIdentityCredential(
        db, UNSEATED, UNSEATED_CREDENTIAL, {
            identity_id: UNSEATED,
            kind: 'password',
            status: 'set',
            secret: await testHashPassword(
                UNSEATED_PASSWORD,
            ),
            at: '2026-06-03T00:00:00.000000Z',
        },
    );
    const password = UNSEATED_PASSWORD;
    const gOrganization = STARK;
    const gAdmin = STARK_ADMIN;
    const verifier = 'pkce-verifier-unseated';
```

The rest of the test body is untouched except for the two
email literals in Step 4 — `gOrganization` and `gAdmin` keep
their names so every later line still compiles.

- [ ] **Step 4: Point the two email literals at the new person**

Two literals in this test read `'g-unseated@test-plan.example'`
— one in the `authorize` body's `username`, one in the
invitation POST body's `email`. Replace both with
`UNSEATED_EMAIL`.

- [ ] **Step 5: Run the test**

```bash
TZ=UTC node --strip-types --test \
    tests/api-authentication-token.test.ts 2>&1 | tail -20
```

Expected: `fail 0`. If the unseated test fails, read the
failure before changing anything — a genuine product finding
is reported, never assertion-weakened.

- [ ] **Step 6: Drop pg-seed's three slice tests**

In `tests/pg-seed.test.ts`:

1. Delete `formatTestPlanSliceCredentials,` from the
   `../server/seed.ts` import list (line 10).
2. Delete the whole import block for the slice module —
   `PARALLEL_SECTIONS` is used only by the third test you
   delete in item 4:

```ts
import {
    PARALLEL_SECTIONS,
    postTestPlanSlices,
} from '../api/test-plan-slices.ts';
```

3. In `'parseSeedArgv accepts one mode flag'`, delete the
   third assertion so the test reads:

```ts
test('parseSeedArgv accepts one mode flag', () => {
    assert.deepEqual(
        parseSeedArgv(['--bootstrap']),
        { kind: 'ok', mode: 'bootstrap' },
    );
    assert.deepEqual(
        parseSeedArgv(['--mock-data']),
        { kind: 'ok', mode: 'mock-data' },
    );
});
```

4. Delete these three tests entirely, each from its `test(`
   line through its closing `});`:
   - `'formatTestPlanSliceCredentials is TSV'`
   - `'slice credential map omits absent extras'`
   - `'slices seed prints the section map'`

5. Remove any import left unused by those deletions
   (`memoryDbAdapter` and `testHashPassword` may still be
   used by other tests in the file — check before deleting).

- [ ] **Step 7: Run pg-seed and the full gate**

```bash
TZ=UTC node --strip-types --test tests/pg-seed.test.ts 2>&1 | tail -10
./validate
```

Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add tests/api-authentication-token.test.ts tests/pg-seed.test.ts
git commit -m "Re-base the borrowing tests on the mock seed"
```

---

### Task 4: Drop the slice seed mode

**Files:**
- Modify: `crank` (usage, flag parsing, mode dispatch)
- Modify: `postgres-seed` (usage, flag parsing, mode
  dispatch)
- Modify: `server/seed.ts` (the flag constant, the
  `SeedMode` union, `parseSeedArgv`, `SLICE_REVEAL_FIELDS`,
  `formatTestPlanSliceCredentials`, the two slice branches,
  the slice import)
- Modify: `server/postgres-seed.ts` (the `USAGE` string)
- Modify: `SCHEMA.md` (`## Operator tools`, line 94)
- Modify: `AGENTS.md` (the `./crank` and `./postgres-seed`
  command lines)

**Interfaces:**
- Consumes: the cleared `tests/` surface from Task 3.
- Produces: `SeedMode = 'bootstrap' | 'mock-data'`. Nothing
  outside `api/test-plan-slices.ts` and its own twelve tests
  imports the slice module after this task.

- [ ] **Step 1: `crank` — two modes**

Change the usage heredoc to:

```bash
Usage: ./crank --mock-data|--bootstrap port
```

Delete the `TEST_PLAN_SLICES=false` initialization, the
`--test-plan-slices)` case arm, the
`if [ "$TEST_PLAN_SLICES" = true ]` mode counter, and change
the two error messages to:

```bash
if [ "$MODE_COUNT" -gt 1 ]; then
    echo "Error: --bootstrap and --mock-data are" \
        "exclusive" >&2
    usage >&2
    exit 1
fi

if [ "$MODE_COUNT" -eq 0 ]; then
    echo "Error: exactly one of --bootstrap or" \
        "--mock-data is required" >&2
    usage >&2
    exit 1
fi
```

Change the mode dispatch to:

```bash
if [ "$BOOTSTRAP" = true ]; then
    MODE='--bootstrap'
else
    MODE='--mock-data'
fi
```

- [ ] **Step 2: `postgres-seed` — two modes**

Change the usage heredoc's three invocation lines to name
`--bootstrap|--mock-data`, delete the
`  --test-plan-slices   Seed TEST-PLAN slices` option line,
delete `TEST_PLAN_SLICES=false`, delete the
`--test-plan-slices)` case arm, delete its mode-counter
block, apply the same two error-message rewrites as Step 1,
and change the mode dispatch to the same two-branch form.

- [ ] **Step 3: `server/seed.ts` — drop the mode**

Delete, in this order:

1. The import block

```ts
import {
    postTestPlanSlices,
    sliceEntityId,
    type TestPlanSliceReveal,
} from '../api/test-plan-slices.ts';
```

2. `export const SEED_TEST_PLAN_SLICES_FLAG =
   '--test-plan-slices';`
3. The `buildMembers` import if it becomes unused (it is
   used only by the slice branch of `seedEmptyDatabase`).
4. `SLICE_REVEAL_FIELDS` and
   `export function formatTestPlanSliceCredentials`, whole.
5. The `test-plan-slices` arm of `parseSeedArgv`'s ternary,
   so it reads:

```ts
        const next =
            a === SEED_BOOTSTRAP_FLAG ? 'bootstrap'
            : a === SEED_MOCK_DATA_FLAG ? 'mock-data'
            : null;
```

6. The slice branch of `seedEmptyDatabase`, so its body is
   the bootstrap branch followed directly by the
   `postMockDataLoad` return.
7. The slice branch of `seedPostgres`, so its body is
   `assertEmptyDatabase`, then `seedEmptyDatabase`, then
   `writeSeededCredentials`.

Change the union to:

```ts
export type SeedMode =
    | 'bootstrap'
    | 'mock-data';
```

and the exclusive-flags message to:

```ts
export const SEED_EXCLUSIVE_FLAGS =
    'use exactly one of --bootstrap or --mock-data';
```

Update the file's opening comment if it names three flags.

- [ ] **Step 4: `server/postgres-seed.ts` — the usage string**

```ts
const USAGE =
    'Usage: postgres-seed --bootstrap|--mock-data\n';
```

- [ ] **Step 5: `SCHEMA.md` — the operator-tools sentence**

Change

```markdown
`./postgres-seed` (`--bootstrap`, `--mock-data`,
`--test-plan-slices`) runs in-process on an empty database
```

to

```markdown
`./postgres-seed` (`--bootstrap`, `--mock-data`) runs
in-process on an empty database
```

- [ ] **Step 6: `AGENTS.md` — the two command lines**

```
./crank --mock-data|--bootstrap port
./postgres-seed --postgres local --bootstrap|--mock-data
./postgres-seed --postgres render TOKEN \
    --bootstrap|--mock-data
./postgres-seed --postgres compose \
    --bootstrap|--mock-data
```

- [ ] **Step 7: Verify the help output and the gate**

```bash
./crank --help
./postgres-seed --help
bash -n crank && bash -n postgres-seed
./validate
```

Expected: both help texts show exactly two modes; `bash -n`
silent; `./validate` exits 0. The `pg-seed.test.ts`
assertion on `SEED_EXCLUSIVE_FLAGS` reads the constant, so
its wording change needs no test edit — confirm by the green
run, not by assumption.

- [ ] **Step 8: Commit**

```bash
git add crank postgres-seed server/seed.ts server/postgres-seed.ts SCHEMA.md AGENTS.md
git commit -m "Drop the test-plan-slices seed mode"
```

---

### Task 5: Delete the slice seeder and its twelve tests

**Files:**
- Delete: `api/test-plan-slices.ts` (3,833 lines)
- Delete: `tests/slices-acl-projection.test.ts`,
  `tests/slices-flow-readiness.test.ts`,
  `tests/slices-flow-stats.test.ts`,
  `tests/slices-idea-positions.test.ts`,
  `tests/slices-invitation-lifecycle.test.ts`,
  `tests/slices-layout-test.test.ts`,
  `tests/slices-page-boot.test.ts`,
  `tests/slices-portfolio-scores.test.ts`,
  `tests/slices-record-binding.test.ts`,
  `tests/slices-review-queue.test.ts`,
  `tests/slices-workbox-action-screen.test.ts`,
  `tests/test-plan-slices.test.ts`
- Modify: `tests/api-transition-legacy-cut.test.ts` (the
  `NAMED_EXCEPTIONS` set and its comment)

**Interfaces:**
- Consumes: the cleared `server/` surface from Task 4.
- Produces: a tree with no slice seed. Task 6's pin-path
  check runs against it.

The `NAMED_EXCEPTIONS` edit rides in THIS commit, not
Task 3's: its assertion is an exact `deepEqual` between the
sweep's hits and the exception set, so the entry must
disappear in the same commit as the file it names.

- [ ] **Step 1: Delete the thirteen files**

```bash
git rm api/test-plan-slices.ts tests/slices-*.test.ts tests/test-plan-slices.test.ts
```

- [ ] **Step 2: Drop the named exception**

In `tests/api-transition-legacy-cut.test.ts`, delete the
comment line

```ts
// test-plan-slices is the parallel-slice seed writer.
```

and the set entry

```ts
    'api/test-plan-slices.ts',
```

so `NAMED_EXCEPTIONS` holds exactly seven paths.

- [ ] **Step 3: Prove nothing still imports it**

```bash
grep -rn 'test-plan-slices\|postTestPlanSlices\|sliceEntityId\|TestPlanSliceReveal' api server tests shared web-app
```

Expected: no output.

- [ ] **Step 4: Run the gate**

```bash
./validate
```

Expected: exits 0. The `fieldValues` sweep in
`api-transition-legacy-cut.test.ts` now compares seven hits
against seven exceptions.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Delete the slice seeder and its tests"
```

---

### Task 6: Gate the TEST-PLAN pin paths in `./validate`

**Files:**
- Modify: `validate` (a new check before
  `./generate-schema-svg --check`)

**Interfaces:**
- Consumes: nothing.
- Produces: a `./validate` that fails when TEST-PLAN.md
  cites a `tests/…test.ts` path that does not exist. Tasks
  8–24 rely on it: they add hundreds of `Pin:` clauses, and
  this check is what keeps the paths honest. Names are the
  audit's judgment; paths are what rot.

- [ ] **Step 1: Confirm today's citations all resolve**

```bash
grep -oE 'tests/[A-Za-z0-9._/-]+\.test\.ts' TEST-PLAN.md | sort -u \
    | while read -r p; do [ -f "$p" ] || echo "MISSING: $p"; done
```

Expected: no output. Eleven distinct paths are cited today
and all eleven exist.

- [ ] **Step 2: Add the check**

Insert this block into `validate`, immediately before the
`# SCHEMA.svg is derived from the schema` comment. Every
line is at or under 78 characters.

```bash
# Every tests/… path TEST-PLAN.md cites must exist. Paths,
# not test names: a name is the audit's judgment, a path is
# what rots when a file is renamed or deleted. The trailing
# `|| true` is this file's idiom for a grep that may
# legitimately match nothing: under `set -euo pipefail` a
# no-match grep would otherwise kill the whole script at
# this assignment, silently and with no diagnostic.
MISSING_PINS=$(
    grep -oE 'tests/[A-Za-z0-9._/-]+\.test\.ts' \
        TEST-PLAN.md \
    | sort -u \
    | while read -r PIN_PATH; do
        [ -f "$PIN_PATH" ] || echo "  ${PIN_PATH}"
    done || true
)

if [ -n "$MISSING_PINS" ]; then
    echo "Error: TEST-PLAN.md cites a missing test:" >&2
    echo "$MISSING_PINS" >&2
    exit 1
fi
```

The `|| true` goes at the END of the pipeline, not after
the `grep`: `||` binds looser than `|`, so
`grep … || true | sort` would parse as `grep …` OR
`(true | sort | …)` — a different program. `RETIRED_VOCAB`
higher up in the same file uses the trailing form for the
same reason.

- [ ] **Step 3: Prove the check fails on a missing path**

```bash
printf '\nPin: tests/no-such-file.test.ts\n' >> TEST-PLAN.md
./validate; echo "exit: $?"
git checkout TEST-PLAN.md
```

Expected: `./validate` prints
`Error: TEST-PLAN.md cites a missing test:` followed by
`  tests/no-such-file.test.ts`, and exits 1. Then
`git checkout` restores the file — confirm with
`git status --short TEST-PLAN.md` printing nothing.

- [ ] **Step 4: Prove it passes on the real file**

```bash
./validate
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add validate
git commit -m "Check TEST-PLAN pin paths in validate"
```

---

### Task 7: Retire the parallel apparatus from the docs

**Files:**
- Modify: `README.md` (the TEST-PLAN.md row, line 61)
- Modify: `AUDIT.md` (its three TEST-PLAN sentences, near
  lines 57, 101, and 309)
- Modify: `TODO.md` (item 6 and the renumbering it forces,
  the `## Sequencing` lines, the stale GPU note, the
  hunter tab-leak bullets)

**Interfaces:**
- Consumes: the new protocol from Task 2.
- Produces: a TODO.md whose critical path has twelve items.
  Task 25 appends the audit's gap list and the two product
  seams to `## Later work`.

- [ ] **Step 1: README.md**

Change

```markdown
| TEST-PLAN.md | browser regression |
```

to

```markdown
| TEST-PLAN.md | three layers; the serial walk |
```

- [ ] **Step 2: AUDIT.md**

Read its three TEST-PLAN sentences:

```bash
grep -n 'TEST-PLAN' AUDIT.md
```

Rewrite only what the new protocol falsifies: any sentence
calling TEST-PLAN.md a browser regression gate becomes one
naming it Layer 3, exploration. Do not touch AUDIT.md's own
procedure. It is 366 lines against a 400-line ceiling.

- [ ] **Step 3: TODO.md — delete critical-path item 6**

Item 6 is "Execute TEST-PLAN.md with up to 48 subagents"
(lines 74–86). The 48-subagent run is what this plan
retires; delete the whole item. Items 1–5 keep their
numbers; items 7 through 13 become 6 through 12.

Every cross-reference in the file has been enumerated for
you. Apply exactly this list — it is complete, and the
three "leave alone" rows are the trap:

| Where | Now | Becomes |
|---|---|---|
| the intro line above item 1 | `Thirteen items, in this order` | `Twelve items, in this order` |
| inside old item 7, wrapped across two lines | `(consumes item 9)` | `(consumes item 8)` |
| inside old item 11 | `Consumes item 5.` | **unchanged** — item 5 keeps its number |
| `## Sequencing` | `- 9 → 7 (the chat clause consumes chats)` | `- 8 → 6 (the chat clause consumes chats)` |
| `## Sequencing` | `- 5 → 11 (the health probe consumes `/status`)` | `- 5 → 10 (…)` — the 5 does NOT move |
| `## Sequencing` | `Item 3's token-at-rest hashing…` | **unchanged** |
| `## Sequencing` | `The Deno specs run strictly 1 → 6 (3 and 4 may swap after Spec 2's measurements; Spec 6 optional)` | **unchanged — these are Deno SPEC numbers, not TODO items** |
| a `## Later work` bullet | `1 → 6, 3 and 4 may swap after Spec 2's measurements` | **unchanged — Deno spec numbers again** |
| a `## Later work` bullet | `` `SCHEMA.md` item 4 `` | **unchanged — a SCHEMA.md item, not a TODO item** |

After renumbering, re-read every line containing a digit
followed by `.` at the start, and every `item` / `→`
occurrence, and confirm each is either in the table above or
genuinely unrelated. A stale pointer is the failure this
step exists to prevent.

- [ ] **Step 4: TODO.md — correct the stale GPU note**

The GPU bullet under `## Later work` reads "Dropped
UNVERIFIED — no `./test-browser` run has happened anywhere
yet." That is false: `./test-browser` ran green on
2026-08-28. Replace that sentence with "Dropped UNVERIFIED —
`./test-browser` has run green on one machine (2026-08-28)."
Leave the Oracle ("`./test-browser` green on two machines")
exactly as it is. In the same bullet, rename "the Tier-2
launcher" to "the Layer 2 launcher" — Task 2 retired the
word Tier everywhere else, and this is its last home.

- [ ] **Step 5: TODO.md — delete the hunter tab-leak bullets**

Delete the `## Later work` bullet beginning "C4 / C7 scored
FAIL on a foreign paint" — it is entirely about hunter tab
leakage and the shared cookie jar, both of which the serial
walk removes. Search the file for every other `hunter`
occurrence and delete or rewrite each; `grep -ci hunter
TODO.md` must be 0 when you finish.

- [ ] **Step 6: Verify the critical path and the gate**

```bash
grep -c '^[0-9]\+\. ' TODO.md
grep -ci 'hunter' TODO.md
./validate
```

Expected: `12`, `0`, and exit 0. `./validate`'s later-work
single-home gate reads `## Critical path` and `## Later work`
— a broken heading fails it.

- [ ] **Step 7: Commit**

```bash
git add README.md AUDIT.md TODO.md
git commit -m "Retire the parallel run from the docs"
```

---

## Stage 3 — the case audit

Seventeen sections, one commit each. Every task follows
`## The audit procedure` above; only the section changes. The
dispatch names the inventory file. Nothing outside the task's own
section may change in its commit.


### Task 8: Audit section AT

**Files:**
- Modify: `TEST-PLAN.md` — the `## AT. Automated Test Suite` section only
  (5 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section AT's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

AT's four header fields and its preface were already rewritten
in Task 2, and AT5 was added there. This task adds only the
`Pin:` clauses. No test decides an AT case — each AT case IS a
layer command — so all five read
`Pin: exploratory — the command is its own witness`.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## AT. Automated Test Suite` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## AT. Automated Test Suite' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-AT.md"
wc -l "$TMPDIR/section-AT.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-AT.md"
grep -c 'Serial:' "$TMPDIR/section-AT.md"
grep -c 'Parallel:' "$TMPDIR/section-AT.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-AT.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-AT.md"
grep -c 'Pin:' "$TMPDIR/section-AT.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 5, then a `Pin:` count of at least
5 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section AT"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
AT asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 9: Audit section A

**Files:**
- Modify: `TEST-PLAN.md` — the `## A. Build & Setup` section only
  (5 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section A's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

A1 and A2 inventory the build artifact; A3 is the crank launch
and **is** SV1. No Layer 1 or Layer 2 test decides a build
inventory, so expect `exploratory` pins here — unless you find a
test that asserts `PAGE_REGISTRY`'s page count, in which case A2
pins to it.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## A. Build & Setup` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## A. Build & Setup' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-A.md"
wc -l "$TMPDIR/section-A.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-A.md"
grep -c 'Serial:' "$TMPDIR/section-A.md"
grep -c 'Parallel:' "$TMPDIR/section-A.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-A.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-A.md"
grep -c 'Pin:' "$TMPDIR/section-A.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 5, then a `Pin:` count of at least
5 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section A"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
A asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 10: Audit section AA

**Files:**
- Modify: `TEST-PLAN.md` — the `## AA. Data Entry Workflow` section only
  (46 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section AA's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

The largest variant-merge in the plan. AA's preamble is almost
entirely parallel-apparatus prose, and many cases carry both a
`Serial:` "the seed already has it" text and a `Parallel:`
"create it" text. Keep the create text — it exercises the
product. AA26 mints the flow that AA27–AA35 (today
`Serial: N/A`) then drive.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## AA. Data Entry Workflow` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## AA. Data Entry Workflow' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-AA.md"
wc -l "$TMPDIR/section-AA.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-AA.md"
grep -c 'Serial:' "$TMPDIR/section-AA.md"
grep -c 'Parallel:' "$TMPDIR/section-AA.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-AA.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-AA.md"
grep -c 'Pin:' "$TMPDIR/section-AA.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 46, then a `Pin:` count of at least
46 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section AA"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
AA asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 11: Audit section B

**Files:**
- Modify: `TEST-PLAN.md` — the `## B. Entry Pages` section only
  (31 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section B's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

B's cases sign in repeatedly. The authentication throttle (five
hits per 60 seconds per client, counting `authorize` and `token`
together) matters here more than anywhere: a case that asserts
the throttle itself keeps its assertion; every other case gets no
throttle language, because `### Driving notes` already carries
the pacing rule.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## B. Entry Pages` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## B. Entry Pages' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-B.md"
wc -l "$TMPDIR/section-B.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-B.md"
grep -c 'Serial:' "$TMPDIR/section-B.md"
grep -c 'Parallel:' "$TMPDIR/section-B.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-B.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-B.md"
grep -c 'Pin:' "$TMPDIR/section-B.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 31, then a `Pin:` count of at least
31 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section B"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
B asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 12: Audit section C

**Files:**
- Modify: `TEST-PLAN.md` — the `## C. Core: Dashboard` section only
  (7 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section C's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

C4 and C7 read dashboard tiles. The 08-27 FAIL on those two was a
foreign paint from a neighbouring hunter's tab, not a product
regression — with one explorer it cannot recur. Pin the derived
numbers to their Layer 1 derive tests where one exists; a tile's
appearance is `exploratory`.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## C. Core: Dashboard` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## C. Core: Dashboard' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-C.md"
wc -l "$TMPDIR/section-C.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-C.md"
grep -c 'Serial:' "$TMPDIR/section-C.md"
grep -c 'Parallel:' "$TMPDIR/section-C.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-C.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-C.md"
grep -c 'Pin:' "$TMPDIR/section-C.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 7, then a `Pin:` count of at least
7 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section C"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
C asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 13: Audit section D

**Files:**
- Modify: `TEST-PLAN.md` — the `## D. Core: Ideas Workflow` section only
  (38 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section D's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

D covers the idea lifecycle end to end: create, submit, send
back, re-submit, approve, convert, filter, and drag-reorder. The
reorder cases have a Layer 2 candidate
(`tests/browser/list-reorder.test.ts`); confirm its assertion
decides the PASS line before citing it.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## D. Core: Ideas Workflow` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## D. Core: Ideas Workflow' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-D.md"
wc -l "$TMPDIR/section-D.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-D.md"
grep -c 'Serial:' "$TMPDIR/section-D.md"
grep -c 'Parallel:' "$TMPDIR/section-D.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-D.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-D.md"
grep -c 'Pin:' "$TMPDIR/section-D.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 38, then a `Pin:` count of at least
38 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section D"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
D asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 14: Audit section E

**Files:**
- Modify: `TEST-PLAN.md` — the `## E. Core: Projects` section only
  (12 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section E's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

E7 is a `New Flow` case the old `Serial:` text forbade ("do not
mint garden rows"). It becomes driveable: the walk's database is
discarded at J.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## E. Core: Projects` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## E. Core: Projects' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-E.md"
wc -l "$TMPDIR/section-E.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-E.md"
grep -c 'Serial:' "$TMPDIR/section-E.md"
grep -c 'Parallel:' "$TMPDIR/section-E.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-E.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-E.md"
grep -c 'Pin:' "$TMPDIR/section-E.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 12, then a `Pin:` count of at least
12 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section E"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
E asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 15: Audit section F

**Files:**
- Modify: `TEST-PLAN.md` — the `## F. Tools` section only
  (80 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section F's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

The biggest section — 80 cases (F1–F75 plus F37a, F37b, F38a,
F38b, F57a) covering the flow designer, its canvas, undo/redo,
keyboard shortcuts, the space toggle, the members selector, and
the attribute editor. Most of the surviving driving notes exist
for these cases; point at `### Driving notes` rather than
repeating them. The canvas cases have Layer 2 candidates under
`tests/browser/canvas-*` and Layer 1 candidates in
`tests/flow-operations.test.ts` and `tests/flow-fsm-reduce.test.ts`
— quote the assertion before citing either.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## F. Tools` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## F. Tools' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-F.md"
wc -l "$TMPDIR/section-F.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-F.md"
grep -c 'Serial:' "$TMPDIR/section-F.md"
grep -c 'Parallel:' "$TMPDIR/section-F.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-F.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-F.md"
grep -c 'Pin:' "$TMPDIR/section-F.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 80, then a `Pin:` count of at least
80 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section F"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
F asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 16: Audit section F2

**Files:**
- Modify: `TEST-PLAN.md` — the `## F2. Workbox` section only
  (31 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section F2's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

F2's transitions and concurrency cases are where the
`fieldValues` retirement lives. Its AA13 case names the source
flow; keep that dependency as prose, not as a `depends:` header.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## F2. Workbox` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## F2. Workbox' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-F2.md"
wc -l "$TMPDIR/section-F2.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-F2.md"
grep -c 'Serial:' "$TMPDIR/section-F2.md"
grep -c 'Parallel:' "$TMPDIR/section-F2.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-F2.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-F2.md"
grep -c 'Pin:' "$TMPDIR/section-F2.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 31, then a `Pin:` count of at least
31 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section F2"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
F2 asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 17: Audit section FS

**Files:**
- Modify: `TEST-PLAN.md` — the `## FS. Flow Statistics (Agent-F2 read-only domain)` section only
  (9 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section FS's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

**Rename the heading** to `## FS. Flow Statistics` — the
parenthetical names a retired hunter's domain. The `## Summary`
table already spells it without the parenthetical, so this rename
makes the two agree.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## FS. Flow Statistics (Agent-F2 read-only domain)` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## FS. Flow Statistics' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-FS.md"
wc -l "$TMPDIR/section-FS.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-FS.md"
grep -c 'Serial:' "$TMPDIR/section-FS.md"
grep -c 'Parallel:' "$TMPDIR/section-FS.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-FS.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-FS.md"
grep -c 'Pin:' "$TMPDIR/section-FS.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 9, then a `Pin:` count of at least
9 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section FS"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
FS asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 18: Audit section G

**Files:**
- Modify: `TEST-PLAN.md` — the `## G. Admin Pages` section only
  (38 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section G's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

G holds the invitation lifecycle (the V cases), the members list,
member detail for humans and AI, identities, the org-switcher,
and the billing stub. Its old text is full of slice aliases
(`g-admin`, `g-unseated@test-plan.example`) — every one becomes a
mock-tenant name.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## G. Admin Pages` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## G. Admin Pages' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-G.md"
wc -l "$TMPDIR/section-G.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-G.md"
grep -c 'Serial:' "$TMPDIR/section-G.md"
grep -c 'Parallel:' "$TMPDIR/section-G.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-G.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-G.md"
grep -c 'Pin:' "$TMPDIR/section-G.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 38, then a `Pin:` count of at least
38 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section G"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
G asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 19: Audit section H

**Files:**
- Modify: `TEST-PLAN.md` — the `## H. Reference & System` section only
  (2 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section H's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

Two cases. The smallest audit in the plan.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## H. Reference & System` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## H. Reference & System' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-H.md"
wc -l "$TMPDIR/section-H.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-H.md"
grep -c 'Serial:' "$TMPDIR/section-H.md"
grep -c 'Parallel:' "$TMPDIR/section-H.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-H.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-H.md"
grep -c 'Pin:' "$TMPDIR/section-H.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 2, then a `Pin:` count of at least
2 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section H"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
H asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 20: Audit section I

**Files:**
- Modify: `TEST-PLAN.md` — the `## I. Cross-Cutting Concerns` section only
  (30 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section I's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

I is where the hidden-tab mechanism bit hardest: I9 (the sidebar
width transition), the toast cases, the loading skeletons, and
I10–I15 (mobile responsive, which set the viewport to ≤767 and
restore it). Those cases keep their assertions — a visible tab
renders, so they can finally be observed. Layer 2 candidates
exist for the sidebar (`tests/browser/sidebar.test.ts`), toasts
(`tests/browser/toasts.test.ts`), reduced motion
(`tests/browser/reduced-motion.test.ts`), and the viewport
(`tests/browser/viewport.test.ts`).

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## I. Cross-Cutting Concerns` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## I. Cross-Cutting Concerns' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-I.md"
wc -l "$TMPDIR/section-I.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-I.md"
grep -c 'Serial:' "$TMPDIR/section-I.md"
grep -c 'Parallel:' "$TMPDIR/section-I.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-I.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-I.md"
grep -c 'Pin:' "$TMPDIR/section-I.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 30, then a `Pin:` count of at least
30 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section I"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
I asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 21: Audit section K

**Files:**
- Modify: `TEST-PLAN.md` — the `## K. Objectives & Scoring` section only
  (30 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section K's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

**K alone needs edit 4 of the procedure.** Its thirty cases are
written `**K1.** <text>`, not `- [ ] **K1** <text>`. Convert
every one, keeping the id and the text verbatim. Until you do,
the plan's success criterion — every `- [ ] **ID**` case carries
a `Pin:` — silently exempts this whole section.

Strip the agent-ownership parentheticals from K's four subsection
headings (`(Agent-G, Phase 2)`, `(Agent-E)`, `(Agent-CH)`) and
delete the section preamble's "Owner agents" paragraph with its
mutation-domain-delta bullets: they partition work across hunters
that no longer exist. Keep K8's own text — the master runs it
after the explorer returns, which `## The walk` step 5 says.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## K. Objectives & Scoring` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## K. Objectives & Scoring' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-K.md"
wc -l "$TMPDIR/section-K.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-K.md"
grep -c 'Serial:' "$TMPDIR/section-K.md"
grep -c 'Parallel:' "$TMPDIR/section-K.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-K.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-K.md"
grep -c 'Pin:' "$TMPDIR/section-K.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 30, then a `Pin:` count of at least
30 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section K"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
K asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 22: Audit section R

**Files:**
- Modify: `TEST-PLAN.md` — the `## R. Records` section only
  (25 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section R's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

R covers the records list and detail, the record-attribute
binding, and field values. `api/derive-state-field-values.ts`
stores `attribute_id` as a record-attribute document id — the
invariant AGENTS.md names — so a pin that claims to decide a
field-value case must assert against that shape.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## R. Records` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## R. Records' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-R.md"
wc -l "$TMPDIR/section-R.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-R.md"
grep -c 'Serial:' "$TMPDIR/section-R.md"
grep -c 'Parallel:' "$TMPDIR/section-R.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-R.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-R.md"
grep -c 'Pin:' "$TMPDIR/section-R.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 25, then a `Pin:` count of at least
25 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section R"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
R asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 23: Audit section J

**Files:**
- Modify: `TEST-PLAN.md` — the `## J. Teardown` section only
  (3 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section J's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

Three cases, all the master's: `## The walk` step 5 runs them
after K8. Say that once in the section preamble and nowhere
else.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## J. Teardown` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## J. Teardown' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-J.md"
wc -l "$TMPDIR/section-J.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-J.md"
grep -c 'Serial:' "$TMPDIR/section-J.md"
grep -c 'Parallel:' "$TMPDIR/section-J.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-J.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-J.md"
grep -c 'Pin:' "$TMPDIR/section-J.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 3, then a `Pin:` count of at least
3 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section J"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
J asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

### Task 24: Audit section SV

**Files:**
- Modify: `TEST-PLAN.md` — the `## SV. Server (Node + Postgres)` section only
  (10 cases)

**Interfaces:**
- Consumes: `## The walk`'s `### Driving notes` and `Pin:` shapes
  (Task 2); the `./validate` pin-path check (Task 6); the
  inventory file whose path the dispatch names.
- Produces: section SV's rewritten case lines, and a
  `## Unpinned but pinnable` list in the report file that Task 25
  consolidates.

SV1 **is** A3 — it is counted in A, and the explorer skips it.
SV6–SV10 are the two-tab cases: the explorer opens a second tab
for them and activates whichever tab it drives. The two-jar
Layer 2 candidate is `tests/browser/two-jars.test.ts`; the
stale-until-navigation residual at the end of the section is a
named seam, not a FAIL, and keeps its text.

- [ ] **Step 1: Read the method**

Read `## The audit procedure` in
`docs/superpowers/plans/2026-08-29-test-plan-three-layers.md` —
from that heading to the next `## ` heading. It is your method in
full. Then read the inventory file the dispatch names.

- [ ] **Step 2: Read your section**

```bash
grep -n '^## ' TEST-PLAN.md
```

Your section runs from `## SV. Server (Node + Postgres)` to the next `## ` heading.
Read every line of it before you edit any of it.

- [ ] **Step 3: Apply the procedure's edits**

Drop the four header fields; rewrite the preamble; merge the
variants onto the mock tenant's names; normalize the case form;
add a `Pin:` to every case under the rule of evidence; place the
surviving drive notes. Nothing outside your section changes.

- [ ] **Step 4: Verify your section**

```bash
awk -v h='## SV. Server (Node + Postgres)' \
    'index($0, h) == 1 { s = 1; next } /^## / { s = 0 } s' \
    TEST-PLAN.md > "$TMPDIR/section-SV.md"
wc -l "$TMPDIR/section-SV.md"
grep -cE '^(tenant|parallel|global_lock|depends):' "$TMPDIR/section-SV.md"
grep -c 'Serial:' "$TMPDIR/section-SV.md"
grep -c 'Parallel:' "$TMPDIR/section-SV.md"
grep -cEi 'hunter|\.localhost' "$TMPDIR/section-SV.md"
grep -c '^- \[ \] \*\*' "$TMPDIR/section-SV.md"
grep -c 'Pin:' "$TMPDIR/section-SV.md"
```

Expected: a non-zero line count (an empty file means the `awk`
heading did not match — fix the heading, not the awk), then `0`,
`0`, `0`, `0`, then 10, then a `Pin:` count of at least
10 (a case may wrap its pin, and a multi-pin case joins its
pins with `;` inside one clause).

- [ ] **Step 5: Run the gate**

```bash
./validate
```

Expected: exits 0. The pin-path check from Task 6 fails the run
if any `tests/…test.ts` path you cited does not exist.

- [ ] **Step 6: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Audit TEST-PLAN section SV"
```

- [ ] **Step 7: Write the gap list to your report file**

Append to the report file the dispatch names, under the heading
`## Unpinned but pinnable`, one line per covenant section
SV asserts that no test decides today, each naming the
lowest layer that could express it. Do not edit TODO.md — Task 25
consolidates every section's list.

---

## Stage 4 — close

### Task 25: File the audit's gaps and the two product seams

**Files:**
- Modify: `TODO.md` (`## Later work`)

**Interfaces:**
- Consumes: the seventeen `## Unpinned but pinnable` lists in
  the Tasks 8–24 report files. The dispatch names every path.
- Produces: nothing later tasks read. This is the last task.

TODO.md is the single home for later work — `./validate`'s
later-home gate enforces it. TODO.md is exempt from the
root-doc line ceiling, so length is not a constraint here;
faithfulness is.

- [ ] **Step 1: Read the seventeen gap lists**

Read every report file the dispatch names, and collect every
line under its `## Unpinned but pinnable` heading.

- [ ] **Step 2: Consolidate one bullet per covenant**

Group the lines by covenant, not by section: two sections
that name the same missing test produce one bullet. Each
bullet names the covenant, the cases that assert it, and the
lowest layer that could express it. Append them under
`## Later work` as a single nested list beneath one lead
bullet:

```markdown
- TEST-PLAN covenants with no test — the 2026-08-29 audit's
  gap list. Each names the lowest layer that could express
  it. The walk observes these; nothing proves them.
  - <covenant> (<case ids>) — Layer <1|2>, <the test file
    that should hold it>
```

Write the actual bullets, one per covenant. Do not summarize
and do not drop a covenant because it looks minor — the gap
list is the audit's whole output beside the pins.

- [ ] **Step 3: File the two product seams**

Append these two bullets under `## Later work`, verbatim:

```markdown
- Undo at the stack bottom returns 201 — `api/derive-flows.ts`
  computes `hasUndoHistory` as `pairs > 1`, so the first undo
  past the bottom is accepted instead of refused. Named by
  the 2026-08-29 three-layers audit; observed in the F
  undo/redo cases. Oracle: a Layer 1 test in
  `tests/flow-operations.test.ts` asserting the bottom-of-stack
  undo is refused.
- The first click after a page reload only focuses the window
  — every driven case must click twice after a reload. Named
  by the 2026-08-29 three-layers audit and carried as a
  driving note in TEST-PLAN.md's `## The walk`. Oracle: a
  Layer 2 test under `tests/browser/` asserting one click
  after reload reaches the element.
```

The first seam is TODO item 7's territory in the pre-audit
numbering; after Task 7's renumbering it sits under item 6.
Do not move it into the critical path — the spec's non-goals
put both seams in `## Later work`, not in code.

- [ ] **Step 4: Verify the gate**

```bash
grep -c '^## Later work' TODO.md
grep -c '^## Critical path' TODO.md
./validate
```

Expected: `1`, `1`, and exit 0.

- [ ] **Step 5: Commit**

```bash
git add TODO.md
git commit -m "File the audit gap list and two seams"
```

---

## The closing checkpoint

Not a task. After Task 25 the master reports to the operator:

1. Every success criterion below, checked and shown.
2. A request that the operator run `! ./test-all` — Chrome
   cannot start inside the Claude Code sandbox, so Layer 2's
   green is the operator's to witness.
3. A request that the operator run one walk under the new
   protocol: `./crank --mock-data 8080`, then dispatch one
   explorer with `## The walk`'s prompt. Its summary and any
   stubs are the first artifacts of Layer 3.

The walk is explicitly a non-goal of this plan. Do not run
it, and do not treat its absence as incomplete work.

## Success criteria

Run these at the end. Every one is a command with an
expected output, not a judgment.

```bash
# 1. Layer 1 green.
./validate; echo "validate: $?"

# 2. The retired vocabulary is gone from TEST-PLAN.md.
grep -c '\.localhost' TEST-PLAN.md
grep -ci 'hunter' TEST-PLAN.md
grep -cE '^(tenant|parallel|global_lock|depends):' TEST-PLAN.md
grep -c 'Serial:' TEST-PLAN.md
grep -c 'Parallel:' TEST-PLAN.md

# 3. Every case carries a Pin, and every cited path exists.
grep -c '^- \[ \] \*\*' TEST-PLAN.md
grep -c '^ *Pin:' TEST-PLAN.md
grep -oE 'tests/[A-Za-z0-9._/-]+\.test\.ts' TEST-PLAN.md \
    | sort -u | while read -r p; do
        [ -f "$p" ] || echo "MISSING: $p"
    done

# 4. The slice seed is gone.
ls api/test-plan-slices.ts 2>&1
grep -rn 'test-plan-slices' api server tests shared web-app
./crank --help
./postgres-seed --help

# 5. The red-test rule is stated in both places.
grep -c 'Reproduced by' TEST-PLAN.md
grep -c 'Reproduced by' AGENTS.md

# 6. TODO.md's critical path has twelve items.
grep -c '^[0-9]\+\. ' TODO.md

# 7. The dated files are byte-identical.
git diff --stat 9083d1b9 -- docs/superpowers/specs \
    docs/superpowers/test-plan-mitigations
git diff --stat 9083d1b9 -- docs/superpowers/plans \
    | grep -v 2026-08-29-test-plan-three-layers

# 8. Layer 2 — the operator runs this one.
# ! ./test-all
```

Expected, in order:

1. `validate: 0`
2. `0`, `0`, `0`, `0`, `0`
3. `402`, at least `402`, and no `MISSING:` line
4. `ls: ... No such file or directory`, no grep output, both
   help texts showing exactly `--mock-data|--bootstrap`
5. `2` or more in TEST-PLAN.md, `1` or more in AGENTS.md
6. `12`
7. no output from either `git diff --stat`
8. the operator's `./test-all` exits 0

Case-count arithmetic: 401 cases before AT5, 402 after —
`## Summary`'s table totals 401 distinct cases, because A3
**is** SV1 and is counted once, in A.

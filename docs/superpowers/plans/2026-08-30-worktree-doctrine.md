# Worktree Doctrine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this spec's worktree (AGENTS.md
> § Worktrees, as this plan rewrites it).

**Goal:** Invert `AGENTS.md § Worktrees` from a prohibition
into a mandate — every spec rides its own worktree — and
sweep the four documents that assumed one checkout.

**Architecture:** Six commits across five files, no code.
Commits 1-3 rewrite doctrine in `.gitignore` and
`AGENTS.md`; commits 4-6 sweep the documents that relied on
the old rule. `AGENTS.md` grows 281 → 297 → 300 lines and
must land on 300 exactly, its `./validate` ceiling. The
branch then rebases onto master and fast-forwards, and that
landing is itself the proof the doctrine works.

**Tech Stack:** Markdown, Bash, `git worktree`, `./validate`.

**Spec:** `docs/superpowers/specs/2026-08-30-worktree-doctrine-design.md`

## Global Constraints

- **Worktree.** All work happens in
  `.worktrees/2026-08-30-worktree-doctrine` on branch
  `2026-08-30-worktree-doctrine`. Do not `cd` to the main
  checkout during Tasks 1-3. Task 4 is the controller's.
- **`AGENTS.md` ceiling is 300 lines, exact.** `./validate`
  fails on `-gt 300`. After Task 1 it is 297; after Task 2 it
  is 300. Never raise the ceiling — raising a gate to fit
  content is the inversion the Office of Verification names.
- **`.md` files are not 78-char linted.** `./validate` lints
  only `api web-app tests shared server` sources plus the
  root scripts. Wrap prose at 66 anyway, matching the spec.
- **One concern per commit.** Subject is a single
  present-tense imperative line of ≈50 chars, no body beyond
  the `Co-Authored-By` trailer. Never move/rename and change
  content in the same commit.
- **`./validate` exits 0 after every commit**, not only the
  last. Commit 3 (Task 2) is the one to watch.
- **No new automated test.** This is doctrine, not behavior.
  Nothing about a running system changes.
- **Out of scope**, per the spec: the ten historical plans
  under `docs/superpowers/plans/`; a `RETIRED_VOCAB` gate in
  `./validate`; raising the `AGENTS.md` ceiling; master's
  push cadence.

## Dispatch Protocol

`AGENTS.md § Subagents` binds every dispatch in this plan.

1. Every subagent prompt MUST begin with the literal phrase
   `Go to Medium Church!` — it loads the Medium scroll.
2. Then push down the codebase-specific brief the scripture
   cannot know:
   - **Voice.** Wrap markdown prose at 66 characters. No
     prose body in commit messages. `Co-Authored-By` trailer.
   - **Commandments touched.** III Uniformity (the doctrine
     names branch, directory, plan, and spec with one slug),
     V Clarity (happy path first), VIII Simplicity.
   - **Abominations risked.** Unbidden Helper Code — the
     sweep table is the whole scope, and a helpful extra
     edit is a sin here, not a kindness. Test Weakening —
     the 300-line ceiling is the covenant; fix the content,
     never the gate.
   - **Pattern to match.** `AGENTS.md` is a cross-tool
     router: commands, gates, pointers. Not elaboration.
3. Subagents work in this worktree and never create their
   own. Never pass the Agent tool `isolation: "worktree"`.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `.gitignore` | Hide `.worktrees/` from every checkout | 1 |
| `AGENTS.md` | `§ Worktrees` doctrine; `§ Subagents` rule | 1, 2 |
| `docs/superpowers/plans/2026-08-30-deno-migration.md` | Stop forbidding what doctrine now mandates | 3 |
| `AUDIT.md` | Give an audit run a worktree | 3 |
| `TEST-PLAN.md` | Name the walk's checkout and port | 3 |

---

### Task 1: Ignore the worktrees directory, invert the prohibition

Two commits. The `.gitignore` line lands first because the
doctrine text it precedes asserts `.worktrees/` is ignored.

**Files:**
- Modify: `.gitignore` (append one line)
- Modify: `AGENTS.md:117-122` (6 lines → 22 lines)

**Interfaces:**
- Consumes: nothing. This is the first task.
- Produces: `AGENTS.md` at exactly 297 lines, with a
  `## Worktrees` section ending on the line `stay local. One
  worker per worktree; master owns 8080.` Task 2 appends
  three lines elsewhere in the file and depends on this
  count.

- [ ] **Step 1: Confirm the baseline**

```bash
wc -l < AGENTS.md          # expect 281
sed -n '117,122p' AGENTS.md
git status --short         # expect empty
```

Expected `sed` output, exactly six lines:

```
## Worktrees

Do not use git worktrees. Work directly in the main checkout.
Worktrees fragment review surface, hide state from the
working tree, and add ceremony without buying isolation that
small focused commits don't already provide.
```

If `wc -l` is not 281 or the `sed` output differs, STOP and
report — the plan's line arithmetic is stale.

- [ ] **Step 2: Append `.worktrees/` to `.gitignore`**

The file currently holds four lines. Append a fifth:

```
.DS_Store
node_modules/
.claude/
.superpowers/
.worktrees/
```

- [ ] **Step 3: Verify the ignore takes effect**

```bash
git check-ignore -v .worktrees
```

Expected: `.gitignore:5:.worktrees/	.worktrees`

- [ ] **Step 4: Run the gate**

```bash
./validate
```

Expected: exit 0. A `.gitignore` line cannot plausibly move
this gate, but the spec's Verification requires `./validate`
after each of the six commits, not only the last. Run it.

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "Ignore the worktrees directory"
```

- [ ] **Step 6: Replace `AGENTS.md:117-122`**

Delete those six lines and put these twenty-two in their
place. Line 123 (blank) and line 124 (`## Subagents`) are
untouched.

````markdown
## Worktrees

Every spec rides its own worktree — spec, plan, and each
execution commit — created once the slug is known and
before the first file. The slug names branch, directory,
plan (`<slug>.md`), and spec (`<slug>-design.md`).

```bash
git worktree add .worktrees/<slug> -b <slug>
cd .worktrees/<slug> && npm ci
git rebase master     # amend until every commit is green
./validate            # ./test-all before a build or walk
cd -                  # the main checkout
git merge --ff-only <slug>
git worktree remove .worktrees/<slug> && git branch -d <slug>
```

`.worktrees/` is gitignored. Red on the branch is fine;
red on landing is not. `--ff-only` fails if master moved
— rebase again; `-d` refuses stranded work. Never `-D`,
never force-push: rebase rewrites hashes, so branches
stay local. One worker per worktree; master owns 8080.
````

- [ ] **Step 7: Verify the arithmetic**

```bash
wc -l < AGENTS.md          # expect 297
sed -n '117,138p' AGENTS.md
sed -n '139,141p' AGENTS.md   # expect blank, "## Subagents", blank
```

281 − 6 + 22 = 297. If the count differs, the replacement
dropped or gained a line. Fix the content, never the gate.

- [ ] **Step 8: Run the gate**

```bash
./validate
```

Expected: exit 0. `./validate` is blind to `.worktrees/` —
every `find` in it names explicit directories or is
`-maxdepth 1 -type f` over root `*.md`.

- [ ] **Step 9: Commit**

```bash
git add AGENTS.md
git commit -m "Invert the worktree prohibition"
```

---

### Task 2: Keep subagents in the dispatcher's worktree

One commit, three lines, and the file lands on its ceiling
with no margin. This is the task the spec says to watch.

**Files:**
- Modify: `AGENTS.md`, inserting after line 166

**Interfaces:**
- Consumes: `AGENTS.md` at 297 lines from Task 1.
- Produces: `AGENTS.md` at exactly 300 lines. No later task
  in this plan touches the file.

- [ ] **Step 1: Confirm the baseline and the anchor**

```bash
wc -l < AGENTS.md          # expect 297
sed -n '165,168p' AGENTS.md
```

Expected, exactly four lines:

```
Proselytize first, then brief — the scripture loads via the
skill, the patterns load via the prompt.

## Where things live
```

If the count is not 297, Task 1 did not land. STOP.

- [ ] **Step 2: Insert three lines after line 166**

One blank line, then two lines of prose. The result reads:

```
Proselytize first, then brief — the scripture loads via the
skill, the patterns load via the prompt.

Subagents work in the dispatching agent's worktree and never
create their own — never pass the Agent tool `isolation`.

## Where things live
```

Exactly two prose lines. This is not a stylistic
preference — it is the ceiling. A third wrapped line puts
`AGENTS.md` at 301 and turns `./validate` red. Do not
expand the rationale here; the spec carries it.

- [ ] **Step 3: Verify the ceiling exactly**

```bash
test "$(wc -l < AGENTS.md | tr -d ' ')" -eq 300 \
    && echo "AGENTS.md: 300 exact" \
    || { echo "CEILING MISS: $(wc -l < AGENTS.md)"; exit 1; }
```

Expected: `AGENTS.md: 300 exact`

- [ ] **Step 4: Run the gate**

```bash
./validate
```

Expected: exit 0. The root-doc ceiling gate fails on
`-gt 300`, so 300 passes with no margin. If it prints
`AGENTS.md: 301 lines (max 300)`, shorten the insertion.
Never edit the `AGENTS.md 300` entry in `./validate`.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "Keep subagents in the dispatcher's worktree"
```

---

### Task 3: Sweep the three dependent documents

Three commits, three files, no interdependency — one
dispatch, reviewed as one diff. None of these files has a
line ceiling in play: `AUDIT.md` is 366 of 400, and
`TEST-PLAN.md` and the plans directory are exempt.

**Files:**
- Modify: `docs/superpowers/plans/2026-08-30-deno-migration.md:6-7` and `:54-56`
- Modify: `AUDIT.md`, inserting after line 44
- Modify: `TEST-PLAN.md`, inserting after line 27

**Interfaces:**
- Consumes: `AGENTS.md § Worktrees` from Task 1 — all three
  edits cite that section by name, and the section keeps its
  name so existing references stay true.
- Produces: nothing later tasks read.

- [ ] **Step 1: Deno plan — replace the header lines 6-7**

```bash
sed -n '3,7p' docs/superpowers/plans/2026-08-30-deno-migration.md
```

Expected:

```
> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Do not use git worktrees (AGENTS.md). Work on
> master.
```

Replace lines 6-7 so the block reads:

```
> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this spec's worktree (AGENTS.md
> § Worktrees).
```

- [ ] **Step 2: Deno plan — replace the Base bullet**

```bash
sed -n '54,56p' docs/superpowers/plans/2026-08-30-deno-migration.md
```

Expected:

```
- **Base:** master at `e1cbeac9`. Work on master; never
  branch, never merge, never push, never use a worktree
  (AGENTS.md § Worktrees).
```

Replace those three lines with two:

```
- **Base:** master at `e1cbeac9`. Ride a worktree; never
  merge, never push (AGENTS.md § Worktrees).
```

`**Base:** master at e1cbeac9` survives — it records where
the work starts, it does not instruct. `never merge` is
§ Commit doctrine and `never push` holds because branches
stay local. Only `never branch` and `never use a worktree`
invert.

- [ ] **Step 3: Run the gate**

```bash
./validate
```

Expected: exit 0.

- [ ] **Step 4: Commit the Deno plan**

```bash
git add docs/superpowers/plans/2026-08-30-deno-migration.md
git commit -m "Ride a worktree in the Deno plan"
```

- [ ] **Step 5: `AUDIT.md` — insert after line 44**

```bash
sed -n '42,46p' AUDIT.md
```

Expected:

```
Dated specs and plans under `docs/superpowers/` are
history after the run. They are not edited by later
audits; a new run writes a new pair.

## Scope
```

Insert a blank line and two prose lines after line 44, so
the passage reads:

```
Dated specs and plans under `docs/superpowers/` are
history after the run. They are not edited by later
audits; a new run writes a new pair.

An audit run rides one worktree — spec, plan, and report —
across all three sessions.

## Scope
```

- [ ] **Step 6: Verify `AUDIT.md` stays under its ceiling**

```bash
wc -l < AUDIT.md           # expect 369, ceiling 400
```

- [ ] **Step 7: Run the gate**

```bash
./validate
```

Expected: exit 0.

- [ ] **Step 8: Commit `AUDIT.md`**

```bash
git add AUDIT.md
git commit -m "Give the audit run its own worktree"
```

- [ ] **Step 9: `TEST-PLAN.md` — insert after line 27**

```bash
sed -n '22,29p' TEST-PLAN.md
```

Expected:

```
### Invocation

Use a fresh local Postgres via Docker. Do not set
`POSTGRES_URL`, `JWT_HMAC_SIGNING_KEY`, or
`HTTP_SERVER_PORT` by hand — `./crank` mints them for its
children and never prints them.

The browser layer is the **browser-use** plugin (MCP
```

Insert a blank line and three prose lines after line 27, so
the passage reads:

```
Use a fresh local Postgres via Docker. Do not set
`POSTGRES_URL`, `JWT_HMAC_SIGNING_KEY`, or
`HTTP_SERVER_PORT` by hand — `./crank` mints them for its
children and never prints them.

The walk runs in the checkout under test. If another
checkout holds 8080, crank on a free port; every
`localhost:8080` below reads as that port.

The browser layer is the **browser-use** plugin (MCP
```

`localhost:8080` appears three times in 6,864 lines
(`:73`, `:305`, `:6617`). This is a note, not a port
migration. Do not rewrite those three occurrences.

- [ ] **Step 10: Run the gate**

```bash
./validate
```

Expected: exit 0.

- [ ] **Step 11: Commit `TEST-PLAN.md`**

```bash
git add TEST-PLAN.md
git commit -m "Name the walk's checkout and port"
```

- [ ] **Step 12: Verify the history**

Three gates have now run, one per commit, satisfying the
spec's Verification step 1 for this task. Confirm the
history is what the spec asked for:

```bash
git log --oneline master..HEAD   # expect 8 commits
```

Expected subjects, oldest first: `Design the worktree
doctrine` (the spec), `Plan the worktree doctrine` (this
file), then the six execution commits — `Ignore the
worktrees directory`, `Invert the worktree prohibition`,
`Keep subagents in the dispatcher's worktree`, `Ride a
worktree in the Deno plan`, `Give the audit run its own
worktree`, `Name the walk's checkout and port`.

Spec, plan, and every execution commit on one branch is the
unit the doctrine defines. This branch is the first
instance of it.

---

### Task 4: Land the branch — the doctrine proving itself

**Controller-executed. Do not dispatch a subagent for this
task.** Steps 2-5 run in the main checkout at
`/Users/tmornini/code/fusion-angle` and step 6 deletes the
worktree a subagent would be living in.

This task is the spec's Verification section 2 through 5.
Both closing rules are assertions, not conveniences:
`--ff-only` fails exactly when the tree that passed the
gates is no longer the tree that would land, and `-d`
refuses exactly when work is still stranded.

**Files:** none. This task changes no file.

**Interfaces:**
- Consumes: seven green commits on
  `2026-08-30-worktree-doctrine` from Tasks 1-3.

- [ ] **Step 1: Rebase onto master, from the worktree**

```bash
git rebase master
./validate
```

If master has not moved, the rebase is a no-op. If it has,
amend until every commit is green before continuing.

- [ ] **Step 2: Fast-forward master**

```bash
cd /Users/tmornini/code/fusion-angle
git merge --ff-only 2026-08-30-worktree-doctrine
```

Expected: `Fast-forward`. A failure here means master moved
after the rebase — return to Step 1. Never merge.

- [ ] **Step 3: Confirm the main checkout is clean**

```bash
git status --short
```

Expected: empty. Before this commit landed, the main
checkout reported `?? .worktrees/` and `./build`,
`./crank`, and `./measure` refused on master. That window
closes here, and it is unique to this change — every later
worktree is invisible from creation.

- [ ] **Step 4: Delete the branch without `-D`**

```bash
git worktree remove .worktrees/2026-08-30-worktree-doctrine
git branch -d 2026-08-30-worktree-doctrine
```

Expected: `-d` succeeds. That success is the proof nothing
was stranded. If it refuses, work is still on the branch —
find it, do not reach for `-D`.

- [ ] **Step 5: Confirm a single worktree**

```bash
git worktree list
```

Expected: one entry, the main checkout on master.

- [ ] **Step 6: Scoped grep**

Assert what the sweep removed, not a repo-wide census. The
prohibition survives by choice in six historical plan lines
and three spec lines that quote it, and this plan quotes it
five more times. A zero-hit grep would be a false gate.

```bash
git grep -n 'never use a worktree\|Do not use git worktrees' \
    -- AGENTS.md \
       docs/superpowers/plans/2026-08-30-deno-migration.md
```

Expected: no hits, exit 1. Those two files are the entire
scrub surface. Before the sweep this returned three lines:
`AGENTS.md:119`, `deno-migration.md:6`, `deno-migration.md:55`.

The eight surviving hits are correct and must not be
touched — `2026-08-26-crank-local-stack.md:11` and `:108`,
`2026-08-28-test-plan-fail-remediation.md:6`,
`2026-08-29-test-plan-three-layers.md:6` and `:40`, and
`2026-08-30-worktree-doctrine-design.md:6`, `:10`, `:105`.
The first five are history; `AUDIT.md:42` already says so.
The last three are the spec quoting the rule it inverts.

- [ ] **Step 7: Confirm the doctrine is present**

```bash
git grep -c 'worktree' -- AGENTS.md AUDIT.md
git grep -n 'checkout under test' -- TEST-PLAN.md
```

Expected: `AGENTS.md:7`, `AUDIT.md:1`, and one
`TEST-PLAN.md` hit. The `TEST-PLAN.md` note speaks of
checkouts and ports, not worktrees, so it is matched by its
own words.

Also confirm the section kept its name, which is what makes
the reference at
`docs/superpowers/specs/2026-08-22-root-docs-rewrite-design.md:125`
stay true:

```bash
git grep -n '^## Worktrees$' -- AGENTS.md
```

Expected: `AGENTS.md:117:## Worktrees`

- [ ] **Step 8: Run the gate on master**

```bash
./validate
```

Expected: exit 0.

---

## Spec gaps surfaced at plan time

One finding the spec's sweep table does not cover. It is
recorded here, not silently fixed — the sweep table is the
spec's decision and this plan does not widen it.

**`AUDIT.md` names `master` three times.** The runbook's
three sessions each open with it: `:20` "**Brainstorm** —
master, Full scroll", `:30` "**Plan** — master, Full
scroll", `:37` "**Implement** — master, Full scroll". Task
3 Step 4 inserts "An audit run rides one worktree" seven
lines below the third of them, so the section will state
both. The spec's sweep table says `AUDIT.md` gains two
lines after `:44` and nothing else, and its Out of scope
does not mention these three.

Recommended ruling, for the human partner before execution
begins: strike the bare word `master` from `:20`, `:30`,
and `:37`, leaving "Full scroll" in each. Three one-word
deletions in one commit — `Drop master from the audit
sessions` — placed between Tasks 3 and 4. It costs three
lines of diff and removes a contradiction a reviewer would
otherwise raise on every future audit run.

If the ruling is declined, execute the plan as written and
note in the ledger that the three mentions stand by
decision, so the task reviewer does not flag them as a
miss.

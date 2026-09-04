# Later-work audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement
> this plan. Tasks 1–8 are parallel Medium-Church
> explorers that write sheets and never edit product
> files. Tasks 9–11 are the controller (Full Church):
> rank, rewrite, commit. Steps use checkbox (`- [ ]`)
> syntax for tracking. Ride this spec's worktree
> (AGENTS.md § Worktrees).

> **For the dispatching orchestrator (AGENTS.md
> § Subagents):** every explorer prompt MUST begin
> with the literal phrase `Go to Medium Church!`,
> then push down the brief under Dispatch Protocol.
> Subagents work in this worktree and never create
> their own — never pass the Agent tool `isolation`.

**Goal:** Validate each of the 54 top-level
`TODO.md` `## Later work` bullets against the tree,
then rewrite that section: Closes removed, Rewrites
corrected, remaining bullets ordered by
doctrine-benefit / cost.

**Architecture:** Eight parallel explorers return
one verdict sheet each. The controller ranks from
the sheets and lands one docs commit. No product
code. No new tests. Nested Unpinned pins ride item
42 as one catalog.

**Tech Stack:** Markdown, git, `./validate` (Deno
2.9.6). Sheets are untracked working files.

**Spec:**
`docs/superpowers/specs/2026-09-02-later-work-audit-design.md`
(commit `1a2b0dac`). Base: master `a1b2b6ae`.

**Worktree:**
`.worktrees/2026-09-02-later-work-audit` on branch
`2026-09-02-later-work-audit`. Absolute path:
`/Users/tmornini/code/fusion-angle/.worktrees/2026-09-02-later-work-audit`.

---

## Global Constraints

- **Worktree only.** All reads and the rewrite
  happen in this worktree. Do not `cd` to the main
  checkout. Do not commit on master. Never `-D`.
  Never force-push.
- **Docs only.** The execution commit may touch
  `TODO.md` `## Later work` and, only when a Close
  sheet names them, a comment at `file:line` and/or
  an `ARCHITECTURE.md` `## KNOWN seams` bullet.
  Critical path, Sequencing, and Close protocol stay
  unless a Close was absorbed into Critical path —
  then strike the Later-work bullet only; do not
  rewrite Critical path.
- **One execution commit** after the plan. Closes,
  rewrites, rank, and named extras ride together.
- **Explorers do not rank and do not edit
  `TODO.md`.** They return sheets.
- **Top-level only.** 54 items. Nested bullets are
  evidence and Rewrite fodder for their parent.
  Unpinned's 143 nested pins are one item, not 143
  ranks.
- **Hold does not chase line numbers.** Drifted
  cites stay on Hold items.
- **Identity is the first line.** Quote it. Do not
  paraphrase.
- **Read the files.** Do not copy the bullet's line
  numbers forward as evidence.
- **`./validate` green before the execution
  commit.** SHA skip is not a pass after the
  rewrite: the tree is dirty, so the stamp cannot
  skip. Markdown is not 78-char linted.
- **Commits.** Subject ≈50 chars, present-tense
  imperative, no body prose. Trailer exactly:

  ```
  Co-Authored-By: Grok 4.6 <noreply@x.ai>
  ```

- **Out of scope:** shipping any Later-work item
  except the list; ranking Unpinned nested pins;
  adding pins; re-running the walk; renaming the
  slug; product code; new tests; a `./validate`
  parser for the list.

## Dispatch Protocol

`AGENTS.md § Subagents` binds every explorer.

1. Every explorer prompt begins with the literal
   phrase `Go to Medium Church!`
2. Then push down:
   - **Voice.** Wrap markdown prose at 66
     characters. Sheets are working files, not
     commits. Explorers do not commit.
   - **Commandments.** I Reliability, II Security,
     V Clarity. Bite facts use those three or
     `none`. Explorers record Bite, they do not
     score.
   - **Abominations.** Unbidden Helper Code — a
     helpful extra edit is a sin. Internal Defense
     — do not "fix" drifted line numbers on a Hold.
     Obscurity — quote the first line; do not
     paraphrase.
   - **Patterns.** Org rides the token, never the
     path. HTTP-verb adapter names. RequestContext
     first. Close protocol is the only exit from
     `TODO.md`. KNOWN seams live in
     `ARCHITECTURE.md`, not in Later work.
3. `cwd` is this worktree. Never pass
   `isolation: "worktree"`.
4. Explorers write only their sheet file under
   `docs/superpowers/plans/later-work-audit-sheets/`.
   Never stage that directory.

## File Structure

| File | Role | Who |
|---|---|---|
| `TODO.md` `## Later work` | the list to validate and rewrite | controller, Task 10 |
| `ARCHITECTURE.md` `## KNOWN seams` | delete a named bullet only when a Close sheet names it | controller, Task 10 |
| named `file:line` comments | delete only when a Close sheet names them | controller, Task 10 |
| `docs/superpowers/plans/later-work-audit-sheets/cluster-N.md` | untracked explorer sheets | explorers, Tasks 1–8 |
| this plan's Task 9 checkboxes | one-line ratio notes | controller, Task 9 |
| spec (already committed) | covenant | — |

Do not edit `TEST-PLAN.md`, `AGENTS.md`,
`AUDIT.md`, Critical path, Sequencing, Close
protocol, or any product file unless a Close sheet
names that exact comment.

## Explorer Contract

Every explorer returns one markdown sheet covering
every item in its cluster and no others.

Sheet path:
`docs/superpowers/plans/later-work-audit-sheets/cluster-N.md`
with `N` in `1`–`8`. Create the directory if
needed. Do not `git add` it.

Per item, exactly this shape:

```
## Item N: "<first line, quoted>"
- Verdict: Hold | Rewrite | Close | Oracle-gone
- Read: files and symbols actually opened
- Evidence: what the tree does now versus what the
  bullet claims (one or two sentences)
- Reason: one line
```

`Oracle-gone` is explorer-only. Use it when the
cited path is missing and you will not guess a new
home. The controller converts it to Close (premise
gone) or Rewrite (gap moved).

If Rewrite, also:

```
- Rewrite: the replacement bullet, full text,
  nested sub-bullets included when they still
  belong
```

The Rewrite value is the full `- …` bullet as it
should appear under `## Later work`, wrapped at 66
characters, including nested `  - ` lines that
still belong.

If Close, also:

```
- Why: shipped | absorbed into Critical path |
  premise gone
- Close extras: none
```

or, when they apply:

```
- Close extras: comment at <file>:<line> "<exact
  comment text>"; KNOWN seam "<exact ARCHITECTURE
  bullet first line>"
```

Invent no extras the tree does not still carry.
A Close extra is a deletion the execution commit
must perform. If there is no named leftover, write
`none`.

If Hold or Rewrite, also (facts, not a score):

```
- Bite: Security | Reliability | Clarity | none
- Commits: 1 | 2–3 | 4+
- Design call: yes | no
```

An item that bites two commandments takes the
higher (Security over Reliability over Clarity).
Unpinned as one catalog is Clarity.

Rules:

- Quote the first line from the cluster list
  below. Do not paraphrase.
- Open the files and symbols. `Read:` lists what
  you opened, not what the bullet cited.
- A Hold does not rewrite drifted line numbers.
- One sheet, every cluster item, no others.
- Item 42 is one verdict. Do not emit 143 nested
  verdicts. Nested pins that are now pinned are
  struck inside that Rewrite. Nested pins that
  remain are not ranked.
- Do not rank. Do not edit `TODO.md`. Do not
  commit.

Verdict guide (not a substitute for reading):

- **Close** when the claim is already true on this
  tree, or the work landed on Critical path, or
  the premise is gone (the gap left with the
  path).
- **Rewrite** when the gap remains but the bullet
  misdescribes the tree (wrong path, stale
  mechanism, nested pins now pinned, oracle
  moved).
- **Hold** when the claim still matches the tree,
  including drifted line numbers.
- **Oracle-gone** when the cited path is missing
  and you cannot name a new home without guessing.

## Ranking Contract (controller only)

Inputs: eight sheets. If a sheet is thin or two
sheets collide, re-read only those oracles and
record the resolution in Task 9. If an explorer
skipped a bullet, fill that row before ranking. No
silent Hold.

Convert every `Oracle-gone` to Close (premise gone)
or Rewrite (gap moved) after that re-read.

What gets a slot: Hold and Rewrite only, scored on
the corrected claim. Close items leave.

Benefit (numerator), highest first:

1. Security (II) — score 3
2. Reliability (I) — score 2
3. Clarity (V) — score 1
4. none — score 0

Cost (denominator):

- Design call = 4, regardless of commit count
- else `4+` commits = 3
- else `2–3` commits = 2
- else `1` commit = 1

Ratio = benefit / cost. Sort descending.

The spec's examples this comparator must honor:

- one-commit Reliability (2/1 = 2.0) beats a
  design-call Security ceremony (3/4 = 0.75)
- one-commit Clarity pin (1/1 = 1.0) beats a
  four-commit feature with no I/II/V bite
  (0/3 = 0)

Equal ratios: the earlier commandment wins. If
still tied, current `TODO.md` order (the Item N
number in this plan).

Write a one-line ratio note per remaining bullet
into Task 9 checkboxes — not into `TODO.md`, and
not as a second committed list.

## Controller execution order

1. Confirm worktree HEAD is `1a2b0dac` plus this
   plan commit, working tree clean except sheets.
2. Dispatch Tasks 1–8 in parallel. Wait for all
   eight sheets.
3. Task 9: coverage check, fill gaps, convert
   Oracle-gone, score, sort, write ratio notes.
4. Task 10: rewrite `## Later work`, apply named
   Close extras.
5. Task 11: verify counts, `./validate`, commit,
   delete the sheets directory.

Do not pause between tasks for a human check
unless BLOCKED.

---

### Task 1: Cluster 1 — Walk and driving (8)

**Files:**
- Create:
  `docs/superpowers/plans/later-work-audit-sheets/cluster-1.md`
- Read: `TODO.md` items 1–7 and 45; `TEST-PLAN.md`
  `## The walk` and `### Driving notes`
  (`TEST-PLAN.md:5-171`);
  `tests/browser/canvas-gestures.test.ts`;
  `tests/browser/canvas-pan.test.ts`;
  `tests/presenter-misc.test.ts`;
  `tests/browser/member-strengths.test.ts`;
  `tests/browser/workbox-transition.test.ts`;
  `docs/superpowers/test-plan-mitigations/2026-09-02-F-F23.md`
  and sibling 2026-09-02 stubs named by the
  bullets.

**Items (quote these first lines):**

1. `A full TEST-PLAN.md walk using serial subagents, so`
2. `2026-09-02 walk F23/AA32: compositor cannot hold`
3. `2026-09-02 walk AA33/AA34: DEFERRED on AA32 stray`
4. `2026-09-02 walk F37b: re-activate tab A after F37a;`
5. `2026-09-02 walk R12: driver (panel never opened).`
6. `2026-09-02 walk F26/F28/F14: compositor mis-hit /`
7. `2026-09-02 second walk AA9/WB11: Layer 2`
45. `The first click after a page reload only focuses the window`

Shared: TEST-PLAN Driving notes already carry
Shift-drag BLOCKED, AA33 DEFERRED, F37b
re-activate, and the first-click focus note.
Item 1's protocol also already lives in
`TEST-PLAN.md` `## The walk`. Read both sides
before Close-vs-Hold: a driving note that still
binds the next walk is not "shipped product."

- [ ] **Step 1: Dispatch the explorer**

Prompt body (controller fills `{WORKTREE}` with
the absolute worktree path):

```
Go to Medium Church!

Then read AGENTS.md at {WORKTREE}/AGENTS.md
§ Subagents and § Where things live.

You are explorer cluster 1 of 8 for the
Later-work audit. cwd is {WORKTREE}. Do not
create a worktree. Do not pass isolation.
Do not edit TODO.md, ARCHITECTURE.md, TEST-PLAN.md,
or any product file. Do not commit. Do not rank.

Write exactly one sheet to
{WORKTREE}/docs/superpowers/plans/later-work-audit-sheets/cluster-1.md
covering items 1, 2, 3, 4, 5, 6, 7, and 45
and no others. Follow the Explorer Contract in
{WORKTREE}/docs/superpowers/plans/2026-09-02-later-work-audit.md
(sheet shape, verdicts, Bite/Commits/Design call,
Oracle-gone, Close extras).

Quote these first lines as identity:

1. "A full TEST-PLAN.md walk using serial subagents, so"
2. "2026-09-02 walk F23/AA32: compositor cannot hold"
3. "2026-09-02 walk AA33/AA34: DEFERRED on AA32 stray"
4. "2026-09-02 walk F37b: re-activate tab A after F37a;"
5. "2026-09-02 walk R12: driver (panel never opened)."
6. "2026-09-02 walk F26/F28/F14: compositor mis-hit /"
7. "2026-09-02 second walk AA9/WB11: Layer 2"
45. "The first click after a page reload only focuses the window"

Start by reading those bullets in TODO.md
(from "## Later work" until "## Sequencing"),
TEST-PLAN.md "## The walk" and "### Driving notes",
and the test files the bullets name. Open the
tests and symbols; do not treat cited line
numbers as evidence.

Return DONE and the sheet path. If you cannot
finish an item, leave it unnamed rather than
silent-Hold, and say which.
```

- [ ] **Step 2: Confirm the sheet**

The sheet exists, has eight `## Item` headings
(1–7, 45), each with Verdict / Read / Evidence /
Reason, plus the extra fields the contract
requires. No other items.

---

### Task 2: Cluster 2 — Identity, auth, billing (12)

**Files:**
- Create:
  `docs/superpowers/plans/later-work-audit-sheets/cluster-2.md`
- Read: `TODO.md` items 10–13, 15–20, 46, 47;
  `tests/api-identity-document.test.ts`;
  `web-app/app/adapters/members.ts`;
  `web-app/members/index.ts`;
  `web-app/app/adapters/shared.ts`;
  `api/authentication.ts`;
  `tests/api-authentication-token.test.ts`;
  `tests/api-authentication-authorize.test.ts`;
  `api/types.ts`;
  `shared/access-token-decode.ts`;
  `web-app/auth/index.ts`;
  `web-app/billing/`;
  `web-app/members/` and identities pages for
  ACL-editing and member-removal affordances.

**Items:**

10. `Profile as its own document,`
11. `Roster rows carry a fabricated empty profile`
12. `` `DEFAULT_DIM` stands in for an assessment that never ``
13. `The re-mint refresh is not single-flighted with the`
15. `The cross-party delegation ledger`
16. `Passkey, provider-IdP, and corporate-OIDC ceremonies`
17. `Per-client multi-audience, DPoP `cnf`, jti reuse`
18. `SP-6 sign-up (`web-app/auth/index.ts:655-663`)`
19. `Billing (`web-app/billing/`)`
20. `Invitation email delivery`
46. `ACL-editing UI for record attributes (`read_roles` /`
47. `Member-removal affordance under members/identities —`

Sequencing still says the profile document
precedes roster-profile and `DEFAULT_DIM`. That
is input to Bite/Commits, not a second list.

- [ ] **Step 1: Dispatch the explorer**

```
Go to Medium Church!

Then read AGENTS.md at {WORKTREE}/AGENTS.md
§ Subagents, § Tenancy, and § Where things live.

You are explorer cluster 2 of 8 for the
Later-work audit. cwd is {WORKTREE}. Do not
create a worktree. Do not pass isolation.
Do not edit TODO.md, ARCHITECTURE.md, TEST-PLAN.md,
or any product file. Do not commit. Do not rank.

Write exactly one sheet to
{WORKTREE}/docs/superpowers/plans/later-work-audit-sheets/cluster-2.md
covering items 10, 11, 12, 13, 15, 16, 17, 18,
19, 20, 46, and 47 and no others. Follow the
Explorer Contract in
{WORKTREE}/docs/superpowers/plans/2026-09-02-later-work-audit.md.

Quote these first lines as identity:

10. "Profile as its own document,"
11. "Roster rows carry a fabricated empty profile"
12. "`DEFAULT_DIM` stands in for an assessment that never"
13. "The re-mint refresh is not single-flighted with the"
15. "The cross-party delegation ledger"
16. "Passkey, provider-IdP, and corporate-OIDC ceremonies"
17. "Per-client multi-audience, DPoP `cnf`, jti reuse"
18. "SP-6 sign-up (`web-app/auth/index.ts:655-663`)"
19. "Billing (`web-app/billing/`)"
20. "Invitation email delivery"
46. "ACL-editing UI for record attributes (`read_roles` /"
47. "Member-removal affordance under members/identities —"

Start from the TODO.md bullets, then open the
cited tests, adapters, and pages. Org rides the
verified token claim, never the path — do not
propose path-scoped tenancy in a Rewrite.
Invitation email delivery has no cited file;
search for send/SMTP/mail before Oracle-gone.

Return DONE and the sheet path.
```

- [ ] **Step 2: Confirm the sheet**

Twelve `## Item` headings (10–13, 15–20, 46, 47).
Contract fields present. No other items.

---

### Task 3: Cluster 3 — Canvas, flow, workbox (5)

**Files:**
- Create:
  `docs/superpowers/plans/later-work-audit-sheets/cluster-3.md`
- Read: `TODO.md` items 21, 27, 28, 31, 32;
  `TEST-PLAN.md` R8 and G42;
  `web-app/app/presenters/flow-designer.ts`;
  `web-app/flows/detail.ts`;
  `web-app/workbox/detail.ts`;
  `api/types.ts`;
  FLOW-CANVAS.md only if a bullet's claim names
  the FSM.

**Items:**

21. `Attribute drag-reorder (TEST-PLAN R8)`
27. `A panel rename whose target is deleted during the`
28. `A flow loaded with Auto Fit OFF no longer fits on`
31. `Claim-on-load with no release-on-leave plus the`
32. `Intermittent "flow-marquee" console exceptions on`

- [ ] **Step 1: Dispatch the explorer**

```
Go to Medium Church!

Then read AGENTS.md at {WORKTREE}/AGENTS.md
§ Subagents and FLOW-CANVAS.md's camera MUST NOTs
only if a bullet names the canvas FSM.

You are explorer cluster 3 of 8 for the
Later-work audit. cwd is {WORKTREE}. Do not
create a worktree. Do not pass isolation.
Do not edit TODO.md, ARCHITECTURE.md, TEST-PLAN.md,
or any product file. Do not commit. Do not rank.

Write exactly one sheet to
{WORKTREE}/docs/superpowers/plans/later-work-audit-sheets/cluster-3.md
covering items 21, 27, 28, 31, and 32 and no
others. Follow the Explorer Contract in
{WORKTREE}/docs/superpowers/plans/2026-09-02-later-work-audit.md.

Quote these first lines as identity:

21. "Attribute drag-reorder (TEST-PLAN R8)"
27. "A panel rename whose target is deleted during the"
28. "A flow loaded with Auto Fit OFF no longer fits on"
31. "Claim-on-load with no release-on-leave plus the"
32. "Intermittent \"flow-marquee\" console exceptions on"

Open the presenter, detail pages, and TEST-PLAN
cases. Confirm whether `#queueSave` still fires
on a no-op rename, whether `withCanvasSize` still
fits only under `isAutoFit`, whether workbox
detail still claims on load with
`DEFAULT_LOCK_TIMEOUT`, and whether a flow-marquee
listener is bound globally (grep `flow-marquee`
and gesture listeners outside `web-app/flows/`).

Return DONE and the sheet path.
```

- [ ] **Step 2: Confirm the sheet**

Five `## Item` headings (21, 27, 28, 31, 32).

---

### Task 4: Cluster 4 — Message plane (4)

**Files:**
- Create:
  `docs/superpowers/plans/later-work-audit-sheets/cluster-4.md`
- Read: `TODO.md` items 24, 25, 26, 30;
  `api/api.ts`;
  `api/message-pair.ts`;
  `tests/http-fixtures.ts`;
  `tests/api-record-types-composed-op.test.ts`;
  `api/routes.ts` (`attributeSchemaOf`, nested
  attribute PUT);
  `api/validators.ts`;
  `SCHEMA.md` item 4.

**Items:**

24. `A replay is indistinguishable from a creation. The`
25. `A shared test operation id can produce false greens.`
26. `Absence and emptiness are conflated in attribute ACL`
30. `Cryptographically verifiable ledger — brainstorm`

Item 24's own text forbids a Rewrite that says
"remove the 200 branch." If the wiring is still
wrong, Hold or Rewrite must keep "THE FIX IS
WIRING, NOT DELETION."

- [ ] **Step 1: Dispatch the explorer**

```
Go to Medium Church!

Then read AGENTS.md at {WORKTREE}/AGENTS.md
§ Subagents, § Field values reference attributes
by id, and SCHEMA.md's secrets / one-table notes.

You are explorer cluster 4 of 8 for the
Later-work audit. cwd is {WORKTREE}. Do not
create a worktree. Do not pass isolation.
Do not edit TODO.md, ARCHITECTURE.md, TEST-PLAN.md,
or any product file. Do not commit. Do not rank.

Write exactly one sheet to
{WORKTREE}/docs/superpowers/plans/later-work-audit-sheets/cluster-4.md
covering items 24, 25, 26, and 30 and no others.
Follow the Explorer Contract in
{WORKTREE}/docs/superpowers/plans/2026-09-02-later-work-audit.md.

Quote these first lines as identity:

24. "A replay is indistinguishable from a creation. The"
25. "A shared test operation id can produce false greens."
26. "Absence and emptiness are conflated in attribute ACL"
30. "Cryptographically verifiable ledger — brainstorm"

Open api/api.ts around sendWriteResponse /
appended, api/message-pair.ts appendMessagePair
and the 200/201 sites, tests/http-fixtures.ts
TEST_OPERATION_ID, attributeSchemaOf, and
SCHEMA.md item 4. For item 24, if the bug
remains, do not Rewrite it into "remove the 200
branch" — the bullet already forbids that.

Return DONE and the sheet path.
```

- [ ] **Step 2: Confirm the sheet**

Four `## Item` headings (24, 25, 26, 30).

---

### Task 5: Cluster 5 — Pub-sub and clocks (4)

**Files:**
- Create:
  `docs/superpowers/plans/later-work-audit-sheets/cluster-5.md`
- Read: `TODO.md` items 33, 34, 35, 37;
  `web-app/app/channels.ts`;
  `web-app/app/page-loader.ts`;
  `web-app/app/error-helpers.ts`;
  `web-app/app/adapters/objectives.ts`;
  `web-app/projects/detail.ts`.

**Items:**

33. `A re-init failure degrades weaker than a first-boot one:`
34. `` `subscribeOnce` guarantees "never two" live subscriptions, ``
35. `Objective lifecycle history compares two clocks:`
37. `` `subscribeOnce`'s `const unsubscribe = subscribe(...)` ``

Same-tab refresh / other browsers stale is
AGENTS.md invariant, not these four items. Do
not Close item 34 because LISTEN is absent.

- [ ] **Step 1: Dispatch the explorer**

```
Go to Medium Church!

Then read AGENTS.md at {WORKTREE}/AGENTS.md
§ Subagents and § Same-tab refresh; other
browsers stale.

You are explorer cluster 5 of 8 for the
Later-work audit. cwd is {WORKTREE}. Do not
create a worktree. Do not pass isolation.
Do not edit TODO.md, ARCHITECTURE.md, TEST-PLAN.md,
or any product file. Do not commit. Do not rank.

Write exactly one sheet to
{WORKTREE}/docs/superpowers/plans/later-work-audit-sheets/cluster-5.md
covering items 33, 34, 35, and 37 and no others.
Follow the Explorer Contract in
{WORKTREE}/docs/superpowers/plans/2026-09-02-later-work-audit.md.

Quote these first lines as identity:

33. "A re-init failure degrades weaker than a first-boot one:"
34. "`subscribeOnce` guarantees \"never two\" live subscriptions,"
35. "Objective lifecycle history compares two clocks:"
37. "`subscribeOnce`'s `const unsubscribe = subscribe(...)`"

Open channels.ts subscribeOnce, page-loader
handlePageLoadError, error-helpers, objectives
adapter revision.at, and projects/detail History
modal. Item 37 is a TDZ hazard that is inert if
every subscribe delegates to createChannel —
confirm that still, do not Close just because
it has not thrown.

Return DONE and the sheet path.
```

- [ ] **Step 2: Confirm the sheet**

Four `## Item` headings (33, 34, 35, 37).

---

### Task 6: Cluster 6 — Type universe and Deno (12)

**Files:**
- Create:
  `docs/superpowers/plans/later-work-audit-sheets/cluster-6.md`
- Read: `TODO.md` items 14, 38–41, 48–54;
  `web-app/app/measure.ts`;
  `web-app/app/measure-core.ts`;
  `web-app/app/measure-viz.ts`;
  `AGENTS.md` § one type universe / `node:crypto`;
  `validate`;
  `test-browser`;
  `tests/browser-fence.test.ts`;
  `tests/browser/fixtures.ts` `launchChrome`;
  `web-app/app/cdp-client.ts`;
  `web-app/app/compose.ts`;
  `web-app/app/generate-api-documentation.ts`;
  `postgres-seed`; `postgres-wipe`; `postgres-lib`;
  `server/scrypt-hash.ts`;
  `deno.json`; `deno.lock`;
  `docs/superpowers/specs/2026-08-21-deno-postgres-driver-design.md`;
  `tests/fusion-angle-live-name.test.ts`.

**Items:**

14. `` `./measure` harvests error-page timings; ``
38. `Node-only modules by directory — once whole-tree type`
39. `A DOM-free server universe — `server/` and the `api/``
40. `The browser tsconfig at `web-app/app/` is the nearest`
41. `GPU flag in the Layer 2 launcher — `launchChrome``
48. `The browser type fence is gone, not weakened. Ambient`
49. `The `exists()` helper is duplicated five times, byte`
50. `` `./measure --record` writes the literal `'unknown'` as ``
51. `` `JWT_HMAC_SIGNING_KEY` may not belong in the local ``
52. `Nothing asserts that the operator wrappers exec `deno``
53. `A pure-TypeScript scrypt would retire the last`
54. `Spec 6 did not run — replacing `npm:postgres@3.4.9``

At plan writing, `web-app/app/tsconfig.json` and
`web-app/tsconfig.json` are both absent. Items 38
and 40 likely hit Oracle-gone. Do not guess a new
home; the controller decides Close vs Rewrite.
`exists()` still has five copies under
`web-app/app/`. `cpuModel: 'unknown'` still sits
at `web-app/app/measure.ts:946`. Re-measure; do
not copy these sentences into Evidence as if you
opened the files.

- [ ] **Step 1: Dispatch the explorer**

```
Go to Medium Church!

Then read AGENTS.md at {WORKTREE}/AGENTS.md
§ Subagents, § node:crypto scrypt, and § One type
universe, no browser fence.

You are explorer cluster 6 of 8 for the
Later-work audit. cwd is {WORKTREE}. Do not
create a worktree. Do not pass isolation.
Do not edit TODO.md, ARCHITECTURE.md, TEST-PLAN.md,
or any product file. Do not commit. Do not rank.

Write exactly one sheet to
{WORKTREE}/docs/superpowers/plans/later-work-audit-sheets/cluster-6.md
covering items 14, 38, 39, 40, 41, 48, 49, 50,
51, 52, 53, and 54 and no others. Follow the
Explorer Contract in
{WORKTREE}/docs/superpowers/plans/2026-09-02-later-work-audit.md.

Quote these first lines as identity:

14. "`./measure` harvests error-page timings;"
38. "Node-only modules by directory — once whole-tree type"
39. "A DOM-free server universe — `server/` and the `api/`"
40. "The browser tsconfig at `web-app/app/` is the nearest"
41. "GPU flag in the Layer 2 launcher — `launchChrome`"
48. "The browser type fence is gone, not weakened. Ambient"
49. "The `exists()` helper is duplicated five times, byte"
50. "`./measure --record` writes the literal `'unknown'` as"
51. "`JWT_HMAC_SIGNING_KEY` may not belong in the local"
52. "Nothing asserts that the operator wrappers exec `deno`"
53. "A pure-TypeScript scrypt would retire the last"
54. "Spec 6 did not run — replacing `npm:postgres@3.4.9`"

Open the files. If web-app/app/tsconfig.json is
gone, Verdict is Oracle-gone — do not invent
deno.json include as a new home. Grep exists(
under web-app/app. Read launchChrome for
--disable-gpu. Read postgres-seed --allow-env.
Read server/scrypt-hash.ts and deno.json npm:
specifiers. Item 54's reopen condition is
@db/postgres 1.0 or measured headroom — check
the locked version, do not Close because Spec 6
already said NO-GO unless that condition now
holds and someone ran it.

Return DONE and the sheet path.
```

- [ ] **Step 2: Confirm the sheet**

Twelve `## Item` headings (14, 38–41, 48–54).

---

### Task 7: Cluster 7 — TEST-PLAN pin catalog (4)

**Files:**
- Create:
  `docs/superpowers/plans/later-work-audit-sheets/cluster-7.md`
- Read: `TODO.md` items 23, 36, 42 (the whole
  nested catalog), 43;
  `TEST-PLAN.md` R6, R7, G9, R12, and the
  thirteen residue ids in item 43 (AA3, B4, B5,
  B12, B13, B14, G22, G23, G23a, G38, G39, G42,
  I27);
  `docs/superpowers/specs/2026-08-23-test-plan-run-four-remediation-design.md`
  only as provenance, not as the living claim;
  the test files nested pins cite.

**Items:**

23. `The run-four remediation's remaining seams — R6 and`
36. `Untested by design after run-six: the records/projects/`
42. `Unpinned but pinnable — TEST-PLAN covenants with no`
43. `The gap list above is the 2026-08-29 audit catalogs'`

Item 42 is one verdict for the catalog. For each
nested pin, search the cited test file or test
name. If a pin now has a deciding test, strike
that nested bullet inside the Rewrite. Nested
pins that remain are not ranked and do not get
their own `## Item`. Count nested pins read vs
struck in Evidence so the controller can see the
work.

- [ ] **Step 1: Dispatch the explorer**

```
Go to Medium Church!

Then read AGENTS.md at {WORKTREE}/AGENTS.md
§ Subagents and TEST-PLAN.md's three-layer
standing table.

You are explorer cluster 7 of 8 for the
Later-work audit. cwd is {WORKTREE}. Do not
create a worktree. Do not pass isolation.
Do not edit TODO.md, ARCHITECTURE.md, TEST-PLAN.md,
or any product file. Do not commit. Do not rank.

Write exactly one sheet to
{WORKTREE}/docs/superpowers/plans/later-work-audit-sheets/cluster-7.md
covering items 23, 36, 42, and 43 and no others.
Follow the Explorer Contract in
{WORKTREE}/docs/superpowers/plans/2026-09-02-later-work-audit.md.

Quote these first lines as identity:

23. "The run-four remediation's remaining seams — R6 and"
36. "Untested by design after run-six: the records/projects/"
42. "Unpinned but pinnable — TEST-PLAN covenants with no"
43. "The gap list above is the 2026-08-29 audit catalogs'"

Item 42 is ONE verdict. Do not emit 143 nested
verdicts. Walk every nested pin under that
bullet in TODO.md. For each, search the cited
test file or quoted test name. Nested pins that
now have a deciding test are struck inside the
Rewrite of item 42. Nested pins that remain stay
nested. Evidence must say how many nested pins
you read and how many you struck.

Item 42 Bite is Clarity. Item 43 is the residue
list of thirteen exploratory cases — check
whether those Pin: clauses still exist in
TEST-PLAN.md and whether any are now pinned.

Return DONE and the sheet path.
```

- [ ] **Step 2: Confirm the sheet**

Four `## Item` headings (23, 36, 42, 43). Item 42
Evidence names nested-pin counts. No per-pin
`## Item` headings.

---

### Task 8: Cluster 8 — Small UX and comments (5)

**Files:**
- Create:
  `docs/superpowers/plans/later-work-audit-sheets/cluster-8.md`
- Read: `TODO.md` items 8, 9, 22, 29, 44;
  `web-app/app/toast.ts`;
  mock-seed date (`api/mock-data.ts` and
  `api/mock-data/`);
  `web-app/ideas/create.ts`;
  `web-app/ideas/convert.ts`;
  `web-app/app/presenters/idea.ts`;
  `web-app/ideas/detail.ts`;
  `docs/superpowers/specs/2026-08-23-test-plan-run-four-remediation-design.md:911-932`
  as provenance only;
  `TODO.md` Critical path "remove the comment at
  … when done" pointers — those stay on Critical
  path, they are not item 29.

**Items:**

8. `Toast pause on hover and focus`
9. `Mock seed's fixed 2026-06-15 anchor — after`
22. `Idea-create toasts an incomplete submit; convert`
29. `Stale-history comment cleanup as one pass — about 35`
44. `The Send Back feedback textarea is discarded.`

Item 9 activates after 2026-09-13 (Sequencing).
Today is 2026-09-04. That is not Close. Hold or
Rewrite may note the activation date. Item 22
names a design call; `Design call: yes` unless
the tree now shares one validation voice. Item 29
re-derives its enumeration by reading; do not
trust the "about 35 / 32" counts — sample enough
to say whether the pass is still needed. Do not
strip Critical path comment pointers.

- [ ] **Step 1: Dispatch the explorer**

```
Go to Medium Church!

Then read AGENTS.md at {WORKTREE}/AGENTS.md
§ Subagents and DESIGN-SYSTEM.md only if a toast
or form voice question needs the tokens.

You are explorer cluster 8 of 8 for the
Later-work audit. cwd is {WORKTREE}. Do not
create a worktree. Do not pass isolation.
Do not edit TODO.md, ARCHITECTURE.md, TEST-PLAN.md,
or any product file. Do not commit. Do not rank.

Write exactly one sheet to
{WORKTREE}/docs/superpowers/plans/later-work-audit-sheets/cluster-8.md
covering items 8, 9, 22, 29, and 44 and no
others. Follow the Explorer Contract in
{WORKTREE}/docs/superpowers/plans/2026-09-02-later-work-audit.md.

Quote these first lines as identity:

8. "Toast pause on hover and focus"
9. "Mock seed's fixed 2026-06-15 anchor — after"
22. "Idea-create toasts an incomplete submit; convert"
29. "Stale-history comment cleanup as one pass — about 35"
44. "The Send Back feedback textarea is discarded."

Open toast.ts for hover/focus pause. Search the
mock seed for 2026-06-15. Compare ideas/create.ts
submit disabling with ideas/convert.ts. Grep
approval-send-back-feedback across web-app, api,
shared, tests, server. For item 29, re-derive by
reading comments that describe a past state as
present; do not copy the 35/32 counts; do not
touch Critical path "remove the comment at …
when done" pointers. Item 9 must not Close for
being before 2026-09-13.

Return DONE and the sheet path.
```

- [ ] **Step 2: Confirm the sheet**

Five `## Item` headings (8, 9, 22, 29, 44).

---

### Task 9: Rank from the sheets (controller)

**Files:**
- Read: the eight sheets under
  `docs/superpowers/plans/later-work-audit-sheets/`
- Modify: this plan's checkboxes below (ratio
  notes). Do not commit the notes as a second
  list. They live only here until the execution
  commit's subject.

Coverage set (every first line, exactly once):

```
1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19
20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35
36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51
52 53 54
```

8+12+5+4+4+12+4+5 = 54.

- [ ] **Step 1: Coverage check**

```bash
python3 - <<'PY'
from pathlib import Path
root = Path("docs/superpowers/plans/later-work-audit-sheets")
ids = []
for p in sorted(root.glob("cluster-*.md")):
    for line in p.read_text().splitlines():
        if line.startswith("## Item "):
            n = line.split(":", 1)[0].split()[2]
            ids.append(int(n))
print("count", len(ids))
print("dupes", sorted({i for i in ids if ids.count(i) > 1}))
missing = [i for i in range(1, 55) if i not in ids]
print("missing", missing)
PY
```

Expected: `count 54`, `dupes []`, `missing []`.
If missing or duplicate, fill or split before
ranking. No silent Hold.

- [ ] **Step 2: Convert Oracle-gone**

For each `Oracle-gone` row, re-read that oracle.
Close if the gap left with the path. Rewrite if
the gap moved (controller writes the replacement
bullet). Record the conversion on the matching
checkbox below.

- [ ] **Step 3: Score remaining items**

Close items leave. For each Hold or Rewrite,
compute ratio = benefit / cost using the Ranking
Contract. Sort descending; break ties by
commandment, then Item N.

- [ ] **Step 4: Write ratio notes**

Fill every remaining item. Strike Closes.

Oracle-gone conversions:

- [ ] Item __: Oracle-gone → Close | Rewrite
      because ________

Closes (leave the list; not ranked):

- [ ] Item __: Close (shipped | absorbed |
      premise gone)

Remaining, ranked (ratio note per bullet):

- [ ] Rank 1: Item __ — Bite __ / cost __ =
      __.__ — ________
- [ ] Rank 2: Item __ — …
- [ ] (continue until remaining = 54 − closes)

Stop only when Close count + remaining count =
54 and the ranked order is the order Task 10
will write.

---

### Task 10: Rewrite `## Later work`

**Files:**
- Modify: `TODO.md` from `## Later work` through
  the blank line before `## Sequencing`
- Modify: `ARCHITECTURE.md` `## KNOWN seams` only
  for seams a Close sheet named
- Modify: named comment `file:line` only for
  extras a Close sheet named

Keep the heading and the intro line:

```
## Later work

Off the critical path; each with its oracle.
```

Then the remaining bullets in Task 9 rank order.
Hold copies the current bullet verbatim, nested
lines included, line numbers unchased. Rewrite
uses the explorer's full replacement text after
the controller checks it against the tree. Close
omits the bullet.

If a Close extra names a comment, delete that
comment (and only that comment) in the same
commit. If it names a KNOWN seam, delete that
ARCHITECTURE.md bullet. Do not invent extras.
Do not rewrite Critical path, Sequencing, or
Close protocol. If Why is "absorbed into
Critical path," strike the Later-work bullet
only.

- [ ] **Step 1: Apply Closes and extras**

Remove Closed bullets from the Later work body.
Apply named extras. Leave Sequencing's
"profile document precedes…" and "mock-seed
anchor… after 2026-09-13" sentences even if
those Later-work bullets were rewritten; only
delete a Sequencing bullet if this spec had
allowed it — it did not. Sequencing stays.

- [ ] **Step 2: Write remaining bullets in rank
  order**

Paste Hold text or Rewrite text for each ranked
item, highest ratio first. Nested Unpinned pins
that remain stay nested under item 42's (possibly
rewritten) parent. Do not promote them.

- [ ] **Step 3: Count**

```bash
python3 - <<'PY'
from pathlib import Path
text = Path("TODO.md").read_text().splitlines()
body, on = [], False
for line in text:
    if line == "## Later work":
        on = True
        continue
    if on and line.startswith("## "):
        break
    if on:
        body.append(line)
top = [ln for ln in body if ln.startswith("- ")]
print("remaining top-level", len(top))
print("intro", body[1] if len(body) > 1 else None)
PY
```

Expected: intro is `Off the critical path; each
with its oracle.` Remaining top-level count
equals Task 9 remaining count. Remaining +
closes = 54.

---

### Task 11: Validate and commit

**Files:**
- The Task 10 diff
- Untracked sheets (never staged)

Subject, ≈50 chars:

```
Rewrite Later work after the audit
```

Trailer:

```
Co-Authored-By: Grok 4.6 <noreply@x.ai>
```

- [ ] **Step 1: Run `./validate`**

The tree is dirty, so the SHA stamp cannot skip.

```bash
./validate
```

Expected: exit 0. If red, the rewrite drifted a
linted file or a named comment deletion broke a
string pin — fix before committing. Markdown-only
TODO.md edits should stay green.

- [ ] **Step 2: Stage only the named docs**

```bash
git add TODO.md
# only if a Close extra named it:
# git add ARCHITECTURE.md
# git add <file with named comment>
git status --short
```

Expected: no
`later-work-audit-sheets/` path. No product file
unless a Close extra named that comment.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
Rewrite Later work after the audit

Co-Authored-By: Grok 4.6 <noreply@x.ai>
EOF
)"
```

- [ ] **Step 4: Delete the sheets**

```bash
rm -rf docs/superpowers/plans/later-work-audit-sheets
git status --short   # expect clean
```

- [ ] **Step 5: Report**

State: remaining count, close count, first five
ranked first-lines, whether any KNOWN seam or
comment was deleted, `./validate` exit, commit
SHA. Do not fast-forward master in this task.
Landing is a later operator choice
(`finishing-a-development-branch`).

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| 54 top-level items, nested ride parent | 1–8 lists; Task 7 Unpinned rule |
| Three verdicts + explorer Oracle-gone | Explorer Contract |
| Clustered explorers, eight parallel | Tasks 1–8 |
| Explorers do not rank or edit TODO.md | Dispatch Protocol; each prompt |
| Master ranks benefit/cost | Task 9 Ranking Contract |
| One execution commit | Task 11 |
| Close extras only when named | Task 10 |
| Hold keeps text, no line-number chase | Task 10 Step 2 |
| Unpinned one verdict; strike now-pinned | Task 7 |
| Oracle-gone → master decides | Task 9 Step 2 |
| Ratio notes in plan checkboxes only | Task 9 Step 4 |
| No product code, no new tests | Global Constraints |
| `./validate` green; SHA skip is not a pass | Task 11 Step 1 |
| Heading and intro line stay | Task 10 |
| Critical path / Sequencing / Close protocol untouched except named KNOWN seam | Task 10 |
| Worktree, no isolation | Dispatch Protocol |

No placeholders. No "similar to Task N" without
the prompt. Item identities are the first lines
at `a1b2b6ae` / `1a2b0dac` (TODO.md unchanged
on this branch).

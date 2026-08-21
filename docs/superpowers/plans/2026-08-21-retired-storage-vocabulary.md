# Retired Storage Vocabulary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development **with the
> wave DAG below** (not strictly serial). Steps use
> checkbox (`- [ ]`) syntax for tracking. Every
> dispatched subagent prompt MUST begin with
> `Go to Medium Church!` (CLAUDE.md scroll policy).
> Do not use git worktrees. Wrap lines at 78
> characters. 4-space indent. Present-tense
> imperative commits with
> `Co-Authored-By: Grok 4.6 <grok@x.ai>`.
> Ring 1 only — comments, docs, test prose, and
> one test literal. No interface, behavior, or
> structural change. No test assertion is weakened.
> `./validate` after every commit. Between commits
> 1 and 12 the hand-grep count must fall
> monotonically.

**Goal:** Re-ground every surviving comment, doc,
and test-prose sentence that still explains a live
rule by a deleted browser-resident storage tier,
then add a `./validate` gate that keeps that
vocabulary out.

**Architecture:** Fourteen linear commits, one
concern each, on this checkout. Up to 50 file-
scoped implementers fan out inside each wave on
disjoint files; the orchestrator alone `git add`s
and commits. Each replacement states what the
seam promises and what enforces it. It never says
"there is no X" about a deleted tier, never names
a deleted backend, and never explains a live rule
by a dead platform.

**Tech Stack:** Comments and docs only. `./validate`
(tsc, `./test`, 78-col lint, `org` lint, SCHEMA.svg
check, API.svg check). The new gate is one `grep`
in `validate`. No new TypeScript, no new tables.

**Spec:**
`docs/superpowers/specs/2026-08-21-retired-storage-vocabulary-design.md`

Do not edit that spec. Do not start Ring 2 or
Ring 3.

---

## Subagent execution (dependency DAG)

Work on this checkout. No worktree. No branch.
Do not tell a subagent to read this plan file —
paste the full task text into the prompt.

**Same-tree rule.** Parallel implementers MUST
have disjoint file sets (tables below). They MUST
NOT `git commit`. The orchestrator `git add`s
each task's files and commits in spec order after
both reviews pass.

**Serial tasks** (one writer on those files) MAY
commit themselves after `./validate` only when
the orchestrator is not mid-wave. Default: the
orchestrator commits.

**Per implementer in a wave:**

1. Dispatch `general-purpose` implementers for
   every ready task in the wave, in parallel.
   Prompt starts with `Go to Medium Church!`.
2. On all `DONE`, dispatch spec reviewers
   (read-only) in parallel, one per task.
3. On spec ✅, dispatch code-quality reviewers
   in parallel.
4. Fix loops: re-dispatch that task's
   implementer; re-review until both ✅.
5. Orchestrator commits finished tasks in
   **spec order** (commit 1 before 2, …), each
   with `./validate` and a hand-grep count.
   Then open the next wave.

**Spec review before quality review**, per task.

This is a vocabulary sweep, not a behavior
change. Do not write a failing production test
first. The RED observation is the hand-grep hit
on the site; the GREEN observation is that site
gone and `./validate` green. The gate itself
joins `validate` as commit 13 so no red commit
lands on master.

**Waves:**

```
Wave 0 (orchestrator):
    re-grep, freeze the acceptance list

Wave 1 (commit 1, F1) — 15 agents, parallel:
    T01..T15  (exclusive derive/test/shared files)

Wave 2 (commit 2, F2) — 10 agents, parallel:
    T16..T25  (T25 is CLAUDE.md gotcha only)

Wave 3 (commit 3, F3) — 1 agent:
    T26 record-attribute-refs.ts

Wave 4 (commit 4, F4) — 2 agents, parallel:
    T27 backend-buffer-tx.ts (F4 paragraph)
    T28 backend-read-isolation.test.ts

Wave 5 (commit 5, F5 api) — 8 agents, parallel
    after Wave 4 (second-pass files already
    finished their first pass):
    T29 db.ts
    T30 db-backed.ts
    T31 backend-memory + serializers
    T32 backend-buffer-tx.ts (F5 paragraph)
        after T27
    T33 pii-hard-delete.ts (delete Cross-tab)
        after T21
    T34 derive-identity-spine F5 + derive-states
        after T07
    T35 api.ts ClientFacadeAdapter after T24
    T36 latency.ts

Wave 6 (commit 6, F5 web-app) — 4 agents:
    T37..T40

Wave 7 (commit 7, F5 tests) — 4 agents:
    T41..T44

Wave 8 (commit 8, metafile) — 2 agents:
    T45 server-zip-metafile.test.ts
    T46 CLAUDE.md Build + ARCHITECTURE.md
        metafile sentence  (after T25)

Wave 9 (commit 9, SCHEMA) — 1 agent:
    T47 SCHEMA.md + ARCHITECTURE.md orphan
        deletions  (after T46)

Wave 10 (commit 10, API.md) — 1 agent:
    T48 API.md

Wave 11 (commit 11, F6 + history) — 1 agent:
    T49 CLAUDE.md Database + ARCHITECTURE.md
        history pointer + scratchpad
        (after T46 and T47)

Wave 12 (commit 12, README + TEST-PLAN) — 1:
    T50 README.md + TEST-PLAN.md

Wave 13 (commit 13, gate) — orchestrator:
    add the grep to validate

Wave 14 (commit 14, SVG) — orchestrator:
    regenerate SCHEMA.svg only if
    `./generate-schema-svg --check` reports
    drift after T29
```

Max parallelism is Wave 1 (15). Agent count is
50 implementers (T01–T50). Reviewers are the
pairs-merge protocol, not extra DAG nodes. The
orchestrator owns Wave 0, every commit, Wave 13,
and Wave 14.

**Models:**

| Task | Role | Why |
| --- | --- | --- |
| T01–T15 | fast | one comment family, one file |
| T16–T24 | fast | F2 canonical drop-in |
| T25 | standard | CLAUDE.md wrap + reason |
| T26 | fast | one paragraph |
| T27–T28 | fast | F4 canonical |
| T29 | standard | many comments, one file |
| T30–T36 | fast | F5 seam comments |
| T37–T44 | fast | F5 web-app / tests |
| T45 | standard | test literal trim |
| T46–T50 | standard | docs, 78-col |
| gate/SVG | orchestrator | last, serial |

**Every implementer prompt also carries:**

- Voice: 78-char max, 4-space indent, present-
  tense imperative commit,
  `Co-Authored-By: Grok 4.6 <grok@x.ai>`.
- Commandments: Reliability (every replacement
  is true of the two surviving backends),
  Uniformity (one canonical sentence per
  family), Clarity (the seam's contract, not a
  deleted platform), Simplicity.
- Abominations: Unbidden Helper Code (no Ring 2
  or Ring 3 organs, no extra files), Test
  Weakening (do not change expected values so
  tests pass — the only allowed test edits are
  comments, the assertion message in
  `db-keyed-read-coverage.test.ts`, and the
  metafile-pin trim), Internal Defense (do not
  add "there is no IndexedDB" denials).
- Patterns: a replacement states what the seam
  promises and what enforces it; `localStorage`
  alone is legal; `in-browser ZIP` is the live
  flow export; `memory tier` is live; product-
  maturity `demo` is live.
- Work on this checkout. No worktree. No branch.
- Exclusive files only. Do not "fix" a neighbour
  file. Do not commit in a parallel wave.
- Re-grep the file for the family's old words
  after the edit. The file must not contain a
  gated token when the task claims DONE, except
  T07/T21/T24/T27 which leave an F5 residue for
  the second pass.

---

## Do not touch

- Ring 2 organs: `{unique: true}`,
  `UniqueConstraintError` (keep the class; only
  its comment changes), `open` / `notify` /
  latency hooks (keep the organs; describe them
  as unused)
- Ring 3 organs: `api/latency.ts` behavior,
  localStorage credential-pair session mode,
  body-borne `refresh_token` fallback
- `TxMode` literals `'readonly'` / `'readwrite'`
- "Demo-tier concession" / "DEMO-TIER POSTURE" /
  "password-loop demo" / ARCHITECTURE.md heading
  "Demo server tier"
- Tests that stub `globalThis.localStorage` for
  the logger
- `docs/superpowers/**`, `measurements/`
- "in-browser ZIP" (live flow export, `zip.ts`)
- `FLOW-CANVAS.md` (carve-out only)
- The spec file itself

---

## Hand-grep (Wave 0 and after every commit)

Run from the repo root. Carve out lines that
contain the live phrase `in-browser ZIP`.

```bash
PATTERN='indexeddb|IDBTransaction|non-IDB|\bIDB\b'
PATTERN="$PATTERN|LocalStorageBackend"
PATTERN="$PATTERN|localStorage (backend|tier|simulated|demo)"
PATTERN="$PATTERN|simulated (backend|tier)s?"
PATTERN="$PATTERN|object stores?|\bPhase B\b|auto-?commit"
PATTERN="$PATTERN|in-browser data|browser[ -]ZIP"
git grep -niE "$PATTERN" \
  -- ':!docs/' ':!validate' ':!measurements/' \
  | grep -v 'in-browser ZIP'
```

Wave 0 freezes this output as the acceptance
list. Spec measured 104 lines / 44 files on
`c8d2f01a` plus `auto-commit` additions; this
tree at plan time printed 108 hits. Re-grep is
the list. After commit 12 the command returns
nothing. After commit 13 `./validate` is the
same grep.

---

## Canonical sentences

Apply verbatim, wrapping at 78. Do not invent a
second wording for the same family.

**F1 definition** (`byIdAscending`):

```
The shared id-lex ordering every document family's list
derivation sorts its final rows by — byte-identical
across families, so it lives here. The order is the
derivation's own: the seam promises rows, never an
order, so no backend's row order is a fact to inherit.
```

**F1 citing:**

```
id-lex ordered (byIdAscending — the derivation's own
order, never the backend's).
```

**F1 H7:**

```
H7: explicit id-lex sort — load-bearing, because the
backend's row order is not a contract and no caller may
inherit it.
```

**F1 keep-own close:** keep the file's own
argument; drop every backend name; close with
`the seam promises rows, never an order.`

**F2 canonical:**

```
formed pre-tx — crypto, hashing, and timers never run
inside an open transaction (CLAUDE.md § Transaction
bodies await only row ops).
```

**F2 Decision 5** (`api/api.ts`):

```
AFTER the route handler's promise resolves — the
transaction has committed.
```

**F2 CLAUDE.md reason** (appended to the gotcha):

```
A transaction holds its pooled connection and its
advisory locks for its whole body; the memory backend
serializes whole transactions, so a long body stalls
every other op.
```

**F3:**

```
RESTRICT is pair-plane only (`pairs` via derive
helpers). An in-tx caller must declare every table it
touches — the transaction scope is the declared set,
and the memory backend rejects an undeclared table on
every test path.
```

**F4:**

```
Reads hand out copies, never the buffered or committed
row objects — the seam's value semantics: Postgres
materializes a fresh row per read, and the test backend
must not be weaker. A caller mutating a fetched row can
never rewrite committed state.
```

**F6:**

```
localStorage holds UI preferences only — theme,
sidebar, log level, active organization id — never
data.
```

**History pointer** (ARCHITECTURE.md § Demo server
tier only):

```
Storage moved server-side in `b1322740`; memory remains
for `./test` / `./validate`.
```

F5 replacements are per-site below; they name
the two backends only inside `api/db.ts`,
`api/db-backed.ts`, `api/backend-*.ts`,
`api/store-serializer.ts`, and
`api/storage-serialize.ts`.

---

## File map

### Modify by task (exclusive sets)

| Task | Files |
| --- | --- |
| T01 | `api/derive-documents.ts` |
| T02 | `api/derive-flow-records.ts` |
| T03 | `api/derive-flow-work-orders.ts` |
| T04 | `api/derive-project-flows.ts` |
| T05 | `api/derive-organizations.ts` |
| T06 | `api/derive-members.ts` |
| T07 | `api/derive-identity-spine.ts` (F1 site only) |
| T08 | `api/derive-objective-revisions.ts` |
| T09 | `api/derive-project-scores.ts` |
| T10 | `tests/api-invitation-document.test.ts` |
| T11 | `tests/drift-identity-tokens.test.ts` |
| T12 | `tests/drift-identities.test.ts` |
| T13 | `api/derive-memberships.ts` |
| T14 | `api/flow-graph-relations.ts` |
| T15 | `shared/ledger-reduction.ts` |
| T16 | `api/message-pair.ts` |
| T17 | `api/authentication.ts` |
| T18 | `api/routes.ts` |
| T19 | `api/mock-data.ts` |
| T20 | `api/mock-data/seed-message-pairs.ts` |
| T21 | `api/pii-hard-delete.ts` (header F2 only) |
| T22 | `api/record-type-refs.ts` |
| T23 | `tests/api-work-order-claim.test.ts` |
| T24 | `api/api.ts` (Decision 5 comment only) |
| T25 | `CLAUDE.md` (gotcha reason only) |
| T26 | `api/record-attribute-refs.ts` |
| T27 | `api/backend-buffer-tx.ts` (second paragraph) |
| T28 | `tests/backend-read-isolation.test.ts` |
| T29 | `api/db.ts` |
| T30 | `api/db-backed.ts` |
| T31 | `api/backend-memory.ts` and both serializers |
| T32 | `api/backend-buffer-tx.ts` (first paragraph) |
| T33 | `api/pii-hard-delete.ts` (delete Cross-tab) |
| T34 | `api/derive-identity-spine.ts` (F5), `api/derive-states.ts` |
| T35 | `api/api.ts` (`ClientFacadeAdapter`) |
| T36 | `api/latency.ts` |
| T37 | `web-app/app/server-core.ts` |
| T38 | `web-app/app/adapters/session-token.ts` |
| T39 | `web-app/app/adapters/session-refresh.ts` |
| T40 | `web-app/app/storage-keys.ts` |
| T41 | `tests/flow-designer-presenter.test.ts` |
| T42 | `tests/command-palette-init.test.ts` |
| T43 | `tests/flow-undo-cursor.test.ts` |
| T44 | `tests/db-keyed-read-coverage.test.ts` |
| T45 | `tests/server-zip-metafile.test.ts` |
| T46 | `CLAUDE.md` Build; `ARCHITECTURE.md` metafile |
| T47 | `SCHEMA.md`, `ARCHITECTURE.md` (orphan-store sentences) |
| T48 | `API.md` |
| T49 | `CLAUDE.md` (Database bullet), `ARCHITECTURE.md` (history + F6) |
| T50 | `README.md`, `TEST-PLAN.md` |
| gate | `validate` (orchestrator) |
| SVG | `SCHEMA.svg` if drift (orchestrator) |

Second-pass files and their first pass:
T32 after T27; T33 after T21; T34 after T07;
T35 after T24; T46 after T25; T47 after T46;
T49 after T46 and T47.

---

## Pins (all tasks)

- Comments and docs only, except T44's assertion
  **message** string and T45's
  `FORBIDDEN_INPUTS` / fixture / title.
- 78-column wrap. `TEST-PLAN.md` is exempt from
  the line-length lint; still do not introduce
  gated words.
- Canonical sentences appear verbatim (modulo
  wrap) at every site the family lists.
- `localStorage` as a scratchpad word is legal.
  Compounds `localStorage backend` / `tier` /
  `simulated` / `demo` are not.
- One historical pointer, in ARCHITECTURE.md
  § Demo server tier, and it is a commit hash.

**Commit subjects (exact):**

1. `Re-ground list ordering on the seam`
2. `Cite row-ops gotcha in pre-tx comments`
3. `Re-ground the declared-table scope comment`
4. `Re-ground copies-on-read on the seam`
5. `Describe the two backends in seam comments`
6. `Retire browser-tier wording in web-app`
7. `Retire browser-tier wording in tests`
8. `Trim the metafile pin to mint and key`
9. `Rewrite Schema of record for two backends`
10. `Re-ground API.md transaction rationale`
11. `State the localStorage scratchpad rule`
12. `Drop retired-tier notes from root docs`
13. `Add retired storage vocabulary gate`
14. `Regenerate SCHEMA.svg after comment edits`
    (omit this commit if `--check` is already
    green after T29)

**Trailer:**

```
Co-Authored-By: Grok 4.6 <grok@x.ai>
```

---

## Shared implementer steps

Every T01–T50 task uses these steps. The task
body supplies the exact replacement.

- [ ] **Step 1: Re-grep this task's files** for
  the family's old words. Confirm the Before
  block still matches. If the pairs merge (or
  later work) moved the line, edit the live
  site; do not hunt by line number.

- [ ] **Step 2: Apply the After block.** Change
  only comments / docs / the named test literal.
  Do not reformat unrelated lines. Wrap at 78.

- [ ] **Step 3: Re-grep the files.** First-pass
  tasks on a second-pass file (T07, T21, T24,
  T27) may still hit F5 words; every other task
  must print no gated token in its files.

- [ ] **Step 4: DONE.** Do not commit. Return
  the file list and a diffstat.

---

## Wave 1 — F1 ordering (T01–T15)

### T01: byIdAscending definition

**Files:** `api/derive-documents.ts`

**Before:**

```
// The shared id-lex ordering (the IndexedDB reference) every
// document family's own list-derivation sorts its final rows
// by — byte-identical across families, so it belongs here
// rather than duplicated per family.
```

**After:**

```
// The shared id-lex ordering every document family's list
// derivation sorts its final rows by — byte-identical
// across families, so it lives here. The order is the
// derivation's own: the seam promises rows, never an
// order, so no backend's row order is a fact to inherit.
```

### T02: derive-flow-records citing

**Files:** `api/derive-flow-records.ts`

**Before:**

```
// id-lex ordered (the IndexedDB reference); a DELETE head
// excludes the row exactly as the old plane's physical splice
// does (parity, not a new mechanism). Serves the live GET
// flows/:id/records route (Phase 6 Task 7).
```

**After:**

```
// id-lex ordered (byIdAscending — the derivation's own
// order, never the backend's); a DELETE head
// excludes the row exactly as the old plane's physical splice
// does (parity, not a new mechanism). Serves the live GET
// flows/:id/records route (Phase 6 Task 7).
```

Do not change the DELETE-head argument.

### T03: derive-flow-work-orders citing

**Files:** `api/derive-flow-work-orders.ts`

**Before:**

```
// id-lex ordered (the IndexedDB reference); a DELETE head
// excludes the row exactly as the old plane's physical splice
// does (parity, not a new mechanism). Serves the live GET
// flows/:id/work-orders route (Phase 5 Task 7).
```

**After:**

```
// id-lex ordered (byIdAscending — the derivation's own
// order, never the backend's); a DELETE head
// excludes the row exactly as the old plane's physical splice
// does (parity, not a new mechanism). Serves the live GET
// flows/:id/work-orders route (Phase 5 Task 7).
```

Do not change the DELETE-head argument.

### T04: derive-project-flows citing

**Files:** `api/derive-project-flows.ts`

**Before:**

```
// id-lex ordered (the IndexedDB reference); a DELETE head
// excludes the row exactly as the old plane's physical splice
// does (parity, not a new mechanism). NOT routed yet (Task 8).
```

**After:**

```
// id-lex ordered (byIdAscending — the derivation's own
// order, never the backend's); a DELETE head
// excludes the row exactly as the old plane's physical splice
// does (parity, not a new mechanism). NOT routed yet (Task 8).
```

Do not change the DELETE-head argument.

### T05: derive-organizations citing

**Files:** `api/derive-organizations.ts`

**Before:**

```
// Every LIVE organization head, id-lex ordered (byIdAscending,
// the IndexedDB reference).
```

**After:**

```
// Every LIVE organization head, id-lex ordered (byIdAscending —
// the derivation's own order, never the backend's).
```

### T06: derive-members citing

**Files:** `api/derive-members.ts`

**Before:**

```
// Every member-parent head, id-lex ordered (byIdAscending, the
// IndexedDB reference — H7: the memory tier's own getAll is
// insertion-ordered, never id-lex, so this sort is load-bearing
// for every caller that compares against it). Trio stamped from
// lifecycle-current (genesis-wins-under-skew).
```

**After:**

```
// Every member-parent head, id-lex ordered (byIdAscending —
// the derivation's own order, never the backend's). Trio
// stamped from lifecycle-current (genesis-wins-under-skew).
```

### T07: derive-identity-spine F1 (leave F5)

**Files:** `api/derive-identity-spine.ts`

Edit only the `deriveIdentityPiiRows` comment.
Leave the `deriveIdentityKind` "demo tier's E13"
sentence for T34.

**Before:**

```
// Every LIVE /pii slot, id-lex ordered (byIdAscending, the
// IndexedDB reference). A DELETE-head slot (an erasure tombstone)
```

**After:**

```
// Every LIVE /pii slot, id-lex ordered (byIdAscending —
// the derivation's own order, never the backend's). A
// DELETE-head slot (an erasure tombstone)
```

Re-wrap the following sentence to 78.

### T08: derive-objective-revisions H7 + citing

**Files:** `api/derive-objective-revisions.ts`

**H7 before:**

```
// H7: id-lex explicit sort (IndexedDB-invisible, memory-tier
// load-bearing — the archived-list raw-order surface and the
// org-page next-position computation are the named pre-existing
// H7-class surfaces; this derivation joins them). The states/:id
```

**H7 after:**

```
// H7: explicit id-lex sort — load-bearing, because the
// backend's row order is not a contract and no caller may
// inherit it. The archived-list raw-order surface and the
// org-page next-position computation are the named
// pre-existing H7-class surfaces; this derivation joins
// them. The states/:id
```

**Citing before:**

```
// id-lex ordered (the IndexedDB reference). Serves the live GET
```

**Citing after:**

```
// id-lex ordered (byIdAscending — the derivation's own
// order, never the backend's). Serves the live GET
```

### T09: derive-project-scores H7 + citing

**Files:** `api/derive-project-scores.ts`

**H7 before:**

```
// H7: id-lex explicit sort (IndexedDB-invisible, memory-tier
// load-bearing — the archived-list raw-order surface and the
// org-page next-position computation are the named pre-existing
// H7-class surfaces; these two derivations join them).
```

**H7 after:**

```
// H7: explicit id-lex sort — load-bearing, because the
// backend's row order is not a contract and no caller may
// inherit it. The archived-list raw-order surface and the
// org-page next-position computation are the named
// pre-existing H7-class surfaces; these two derivations
// join them.
```

**Citing before:**

```
// id-lex ordered (the IndexedDB reference). Serves a future live
```

**Citing after:**

```
// id-lex ordered (byIdAscending — the derivation's own
// order, never the backend's). Serves a future live
```

### T10: invitation-document citing

**Files:** `tests/api-invitation-document.test.ts`

**Before:**

```
    // id-lex ordered (byIdAscending, the IndexedDB reference).
```

**After:**

```
    // id-lex ordered (byIdAscending — the derivation's own
    // order, never the backend's).
```

Do not change the `assert.deepEqual` below it.

### T11: drift-identity-tokens citing

**Files:** `tests/drift-identity-tokens.test.ts`

**Before:**

```
    // The literal id-LAST reconstruction of each PUT body,
    // id-lex sorted (byIdAscending, == IndexedDB's own
    // production getAll order) — the expected wire text,
    // independent of any stored row.
```

**After:**

```
    // The literal id-LAST reconstruction of each PUT body,
    // id-lex ordered (byIdAscending — the derivation's own
    // order, never the backend's) — the expected wire text,
    // independent of any stored row.
```

Do not change `expected`.

### T12: drift-identities H7

**Files:** `tests/drift-identities.test.ts`

**Before:**

```
// H7 (case 9): id-lex explicit sorts (sortById) bind EVERY
// collection assertion below — the memory tier's own getAll/
// getAllWhere is insertion-ordered, while every derived collection
// (api/derive-identity-spine.ts, api/document-family.ts's generic
// handlers alike) sorts byIdAscending by construction. A case that
// skipped the old-plane sort would pass or fail by ACCIDENT of
// insertion order, never by the property it claims to prove.
```

**After:**

```
// H7 (case 9): explicit id-lex sort — load-bearing, because
// the backend's row order is not a contract and no caller
// may inherit it. sortById binds EVERY collection
// assertion below; every derived collection
// (api/derive-identity-spine.ts, api/document-family.ts's
// generic handlers alike) sorts byIdAscending by
// construction. A case that skipped the sort would pass
// or fail by ACCIDENT of insertion order, never by the
// property it claims to prove.
```

### T13: derive-memberships keep-own

**Files:** `api/derive-memberships.ts`

Replace the "OUTPUT ORDER IS DEFINED" paragraph.
Keep Author gate 1, `at` ASCENDING with id
tiebreak, the different-prefixes argument, and
the JWT / test pins. Drop every backend name.

**Before:**

```
// THE OUTPUT ORDER IS DEFINED, NOT ACCIDENTAL (Author gate 1):
// `at` ASCENDING with an id tiebreak — join chronology, backend-
// independent. Neither backend's own row order is a fact to copy:
// the memory tier's getAllWhere is insertion-ordered, IndexedDB's
// is primary-key-ordered, and this derivation's own per-
// organization reads run over DIFFERENT prefixes combined into
// one array — there is no single "the" order to inherit.
```

**After:**

```
// THE OUTPUT ORDER IS DEFINED, NOT ACCIDENTAL (Author gate 1):
// `at` ASCENDING with an id tiebreak — join chronology. This
// derivation's own per-organization reads run over DIFFERENT
// prefixes combined into one array — there is no single "the"
// order to inherit. The seam promises rows, never an order.
```

Keep the `subjectOrganizations` / test-pin
sentences that follow.

### T14: flow-graph-relations keep-own

**Files:** `api/flow-graph-relations.ts`

Keep the client-authored snapshot argument and
the unsorted within-node caveat. Drop IndexedDB
and localStorage. Close with the seam sentence.

**Before:**

```
// The OLD plane's own GET reassembles nodes[]/edges[] from
// flow_nodes/flow_edges via getAllWhere, which returns rows in
// PRIMARY-KEY (id) order on IndexedDB — so the two orders
// already coincide there (H7: invisible on IndexedDB) — but in
// ARRIVAL order on the memory/localStorage tiers, where they
// can diverge (load-bearing there). Re-sorting nodes[]/edges[]
// ascending-id here makes the derived side match the OLD
// plane's IndexedDB behavior byte-exactly regardless of which
// backend actually ran the comparison. Within-node
```

**After:**

```
// Re-sorting nodes[]/edges[] ascending-id here makes the
// derived GET a stable id-lex snapshot of whatever order
// the client serialized. The seam promises rows, never an
// order. Within-node
```

Keep the memberIds[]/attributes[] sentences
that follow.

### T15: ledger-reduction keep-own

**Files:** `shared/ledger-reduction.ts`

**Before:**

```
// on every backend and every row permutation, where iteration
// order (append order on the simulated tiers, primary-key order
// on IndexedDB) is not. Security reducers that must rank equal-
```

**After:**

```
// on every row permutation, where iteration order is not.
// The seam promises rows, never an order. Security
// reducers that must rank equal-
```

Keep the `(at, id)` TOTAL order argument above
and the fail-closed comparator below.

---

## Wave 1 commit

Orchestrator, after T01–T15 both-reviews pass:

```bash
git add api/derive-documents.ts \
    api/derive-flow-records.ts \
    api/derive-flow-work-orders.ts \
    api/derive-project-flows.ts \
    api/derive-organizations.ts \
    api/derive-members.ts \
    api/derive-identity-spine.ts \
    api/derive-objective-revisions.ts \
    api/derive-project-scores.ts \
    api/derive-memberships.ts \
    api/flow-graph-relations.ts \
    shared/ledger-reduction.ts \
    tests/api-invitation-document.test.ts \
    tests/drift-identity-tokens.test.ts \
    tests/drift-identities.test.ts
./validate
# hand-grep; count must drop
git commit -m "Re-ground list ordering on the seam

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

## Wave 2 — F2 row-ops (T16–T25)

Weave the F2 canonical into each site. Keep the
file's own surrounding argument. Replace every
"IndexedDB auto-commit" / "non-IDB" /
"auto-commit constraint" / "auto-commit
discipline" clause. Do not leave `auto-commit`
in these files (the gate matches it).

### T16: message-pair.ts

**Files:** `api/message-pair.ts`

**Header before:**

```
// The shadow-ledger message pair: one `pairs` put. Formed
// pre-tx (all crypto and address resolution happen before a
// transaction opens — the IndexedDB auto-commit constraint
// bars awaiting anything but row ops inside
// `db.transaction`), then appended as the LAST act of the
// domain write's own transaction.
```

**Header after:**

```
// The shadow-ledger message pair: one `pairs` put. Formed
// pre-tx — crypto, hashing, and timers never run
// inside an open transaction (CLAUDE.md § Transaction
// bodies await only row ops). Then appended as the LAST
// act of the domain write's own transaction.
```

**EVENT-APPEND before:**

```
// (formWritePair's own crypto never runs inside an open
// transaction — the auto-commit constraint). EVENT-APPEND, like
```

**EVENT-APPEND after:**

```
// (formWritePair's own crypto never runs inside an open
// transaction — formed pre-tx — crypto, hashing, and
// timers never run inside an open transaction
// (CLAUDE.md § Transaction bodies await only row ops)).
// EVENT-APPEND, like
```

The shorter wrap that still contains the
canonical sentence is preferred:

```
// (formed pre-tx — crypto, hashing, and timers never run
// inside an open transaction (CLAUDE.md § Transaction
// bodies await only row ops)). EVENT-APPEND, like
```

**Response-row `at` note:** it names no gated
word. Leave it. Do not paste the pre-tx
canonical onto a stamp that is minted inside
the transaction — that sentence would be false.

### T17: authentication.ts

**Files:** `api/authentication.ts`

**TokenEventWrite before:**

```
// pair by it (Phase 13 Task 5), so pair formation runs PRE-TX
// only (async crypto — the IndexedDB auto-commit constraint bars
// awaiting anything but row ops inside an open transaction).
```

**After:**

```
// pair by it (Phase 13 Task 5), so pair formation runs
// formed pre-tx — crypto, hashing, and timers never run
// inside an open transaction (CLAUDE.md § Transaction
// bodies await only row ops).
```

Tighten to one grammatical comment:

```
// pair by it (Phase 13 Task 5). Formed pre-tx — crypto,
// hashing, and timers never run inside an open
// transaction (CLAUDE.md § Transaction bodies await only
// row ops).
```

**GATE 3 before:**

```
// sha256 digest, pre-tx always — crypto never runs inside an open
// transaction (the IndexedDB auto-commit constraint every other
// pair-forming call site in this file already honors). It keys
```

**After:**

```
// sha256 digest, pre-tx always — formed pre-tx — crypto,
// hashing, and timers never run inside an open transaction
// (CLAUDE.md § Transaction bodies await only row ops). It
// keys
```

### T18: routes.ts

**Files:** `api/routes.ts`

**Conversion baseline before:**

```
    // PRE-TX — crypto and the head-reads stay outside
    // db.transaction, the IndexedDB auto-commit constraint —
    // then appended as the tx's LAST acts, beside the operation
```

**After:**

```
    // PRE-TX — formed pre-tx — crypto, hashing, and timers
    // never run inside an open transaction (CLAUDE.md §
    // Transaction bodies await only row ops) — then
    // appended as the tx's LAST acts, beside the operation
```

**Admin DELETE before:**

```
        // scan awaits only row ops on the view (auto-commit
        // discipline). Path org is already gate-matched to
```

**After:**

```
        // scan awaits only row ops on the view (CLAUDE.md §
        // Transaction bodies await only row ops). Path org
        // is already gate-matched to
```

The DELETE site does not form pairs; the
canonical citation still applies (row ops
only). Do not force the "formed pre-tx" clause
onto a referrer scan.

### T19: mock-data.ts

**Files:** `api/mock-data.ts`

Three sites. Replace each auto-commit /
non-IDB / IndexedDB clause with F2 canonical.
Keep pass-1 / pass-2 structure.

**Site 1** (`seedHumanCredentials` header)

**Before:**

```
// discarded, never revealed. Both seed paths call this AFTER
// the entity seed commits, NEVER inside it: PBKDF2 hashing is
// async crypto, and awaiting a non-IDB promise inside a
// transaction body auto-commits the IndexedDB transaction
// early (CLAUDE.md § IndexedDB auto-commit). So every hash is
// computed up front, then the credential rows land together in
```

**After:**

```
// discarded, never revealed. Both seed paths call this AFTER
// the entity seed commits, NEVER inside it: PBKDF2 hashing is
// async crypto. Formed pre-tx — crypto, hashing, and timers
// never run inside an open transaction (CLAUDE.md §
// Transaction bodies await only row ops). So every hash is
// computed up front, then the credential rows land together in
```

**Site 2** (`postMockDataLoad` pass 1)

**Before:**

```
    // Pass 1 (no tx): every pair-wired op-invocation's message
    // pair, formed up front — formWritePair's hashing is async
    // crypto, which would auto-commit an IndexedDB transaction
    // early if awaited inside one (CLAUDE.md § the IndexedDB
    // auto-commit constraint). requestAt is minted once, the
    // seed's own arrival moment, and shared by every pair.
```

**After:**

```
    // Pass 1 (no tx): every pair-wired op-invocation's message
    // pair, formed up front — formWritePair's hashing is async
    // crypto. Formed pre-tx — crypto, hashing, and timers
    // never run inside an open transaction (CLAUDE.md §
    // Transaction bodies await only row ops). requestAt is
    // minted once, the seed's own arrival moment, and shared
    // by every pair.
```

**Site 3** (`postBootstrap` pass 1)

**Before:**

```
    // Pass 1 (no tx): the lone 'current' human-member create's
    // bundle, formed up front — see postMockDataLoad's pass 1 for
    // why (formWritePair's hashing is async crypto, which would
    // auto-commit an IndexedDB transaction early if awaited
    // inside one). Bootstrap's body embeds nowUtc() (there is
```

**After:**

```
    // Pass 1 (no tx): the lone 'current' human-member create's
    // bundle, formed up front — see postMockDataLoad's pass 1
    // for why. Formed pre-tx — crypto, hashing, and timers
    // never run inside an open transaction (CLAUDE.md §
    // Transaction bodies await only row ops). Bootstrap's
    // body embeds nowUtc() (there is
```

### T20: seed-message-pairs.ts

**Files:** `api/mock-data/seed-message-pairs.ts`

**Before:**

```
// TABLE_NAMES transaction — an awaited non-IDB promise
// auto-commits an IndexedDB transaction early (CLAUDE.md § the
// IndexedDB auto-commit constraint). So the seed becomes two
```

**After:**

```
// TABLE_NAMES transaction. Formed pre-tx — crypto, hashing,
// and timers never run inside an open transaction
// (CLAUDE.md § Transaction bodies await only row ops). So
// the seed becomes two
```

### T21: pii-hard-delete F2 (leave Cross-tab)

**Files:** `api/pii-hard-delete.ts`

Edit only the "Runs INSIDE the caller's own
transaction" paragraph. Leave the
"Cross-tab note" paragraph for T33.

**Before:**

```
// identity_pii ROW half); row ops only, per the IndexedDB
// auto-commit constraint (a transaction body may await only
// row ops, never crypto or a timer) — `pair` arrives fully
// formed, all crypto done pre-tx (message-pair.ts).
```

**After:**

```
// identity_pii ROW half). Formed pre-tx — crypto, hashing,
// and timers never run inside an open transaction
// (CLAUDE.md § Transaction bodies await only row ops) —
// `pair` arrives fully formed, all crypto done pre-tx
// (message-pair.ts).
```

### T22: record-type-refs.ts

**Files:** `api/record-type-refs.ts`

**Before:**

```
// transaction view; every await is a row op on that view
// (IndexedDB auto-commit discipline — same posture as
// collectAttributeReferrers).
```

**After:**

```
// transaction view; every await is a row op on that view
// (CLAUDE.md § Transaction bodies await only row ops —
// same posture as collectAttributeReferrers).
```

### T23: api-work-order-claim.test.ts

**Files:** `tests/api-work-order-claim.test.ts`

**Before:**

```
// transaction (or to await a non-row-op mid-transaction — the
// CLAUDE.md auto-commit gotcha), this test would catch the
```

**After:**

```
// transaction (or to await a non-row-op mid-transaction —
// CLAUDE.md § Transaction bodies await only row ops), this
// test would catch the
```

Do not change the test body or expectations.

### T24: api.ts Decision 5 (leave ClientFacadeAdapter)

**Files:** `api/api.ts`

**Before:**

```
// The gate-side Decision 5 post: fired once per successful
// write, AFTER the route handler's promise resolves (so on
// IndexedDB the commit has already reached `oncomplete`).
```

**After:**

```
// The gate-side Decision 5 post: fired once per successful
// write, AFTER the route handler's promise resolves — the
// transaction has committed.
```

Leave the `ClientFacadeAdapter` "demo latency
shim" comment for T35.

### T25: CLAUDE.md gotcha reason

**Files:** `CLAUDE.md`

Append the F2 reason sentence to the existing
gotcha. Do not touch the Database bullet or the
Build metafile sentence.

**Before:**

```
- **Transaction bodies await only row ops.** Every
  `transaction(…)` body awaits ONLY row ops —
  validators, crypto, hash, `serializeWire`, and scrypt
  run OUTSIDE the tx. Sync compute between row ops is
  fine. Nested `view.transaction` re-enters the same
  tx; its tables must be a subset of the outer set.
```

**After:**

```
- **Transaction bodies await only row ops.** Every
  `transaction(…)` body awaits ONLY row ops —
  validators, crypto, hash, `serializeWire`, and scrypt
  run OUTSIDE the tx. Sync compute between row ops is
  fine. Nested `view.transaction` re-enters the same
  tx; its tables must be a subset of the outer set.
  A transaction holds its pooled connection and its
  advisory locks for its whole body; the memory backend
  serializes whole transactions, so a long body stalls
  every other op.
```

---

## Wave 2 commit

```bash
git add api/message-pair.ts api/authentication.ts \
    api/routes.ts api/mock-data.ts \
    api/mock-data/seed-message-pairs.ts \
    api/pii-hard-delete.ts api/record-type-refs.ts \
    api/api.ts tests/api-work-order-claim.test.ts \
    CLAUDE.md
./validate
git commit -m "Cite row-ops gotcha in pre-tx comments

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

## Wave 3 — F3 (T26)

### T26: record-attribute-refs.ts

**Files:** `api/record-attribute-refs.ts`

Replace the whole stale paragraph at
`ATTRIBUTE_RESTRICT_TABLES` (it still speaks of
"residual dual-write callers" and "Stage B").

**Before:**

```
// Task 4, Author gate 5) also read the pair plane:
// work-order document heads via the organization-scoped
// work-orders collection prefix, and live node-attribute
// bindings via flowGraphBindingsFromPairs (graphDelta
// attributeEvents + nodeFlowIds). Phase Final Task 2:
// RESTRICT is pair-plane only (pairs via
// derive helpers). The broader table list stays for tx-list
// compatibility with residual dual-write callers until
// Stage B drops the doomed stores. An in-tx caller must
// declare the whole ring — IndexedDB throws on any store a
// transaction did not name.
export const ATTRIBUTE_RESTRICT_TABLES =
    MESSAGE_TABLES;
```

Keep the work-order / graphDelta sentences that
are still true; drop Stage B / dual-write /
IndexedDB. The family canonical is the
RESTRICT + declared-set close:

**After:**

```
// Task 4, Author gate 5) also read the pair plane:
// work-order document heads via the organization-scoped
// work-orders collection prefix, and live node-attribute
// bindings via flowGraphBindingsFromPairs (graphDelta
// attributeEvents + nodeFlowIds). RESTRICT is pair-plane
// only (`pairs` via derive helpers). An in-tx caller must
// declare every table it touches — the transaction scope
// is the declared set, and the memory backend rejects an
// undeclared table on every test path.
export const ATTRIBUTE_RESTRICT_TABLES =
    MESSAGE_TABLES;
```

Do not claim Postgres enforces the declared
set. It does not.

```bash
git add api/record-attribute-refs.ts
./validate
git commit -m "Re-ground the declared-table scope comment

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

## Wave 4 — F4 (T27–T28)

### T27: backend-buffer-tx.ts F4 paragraph

**Files:** `api/backend-buffer-tx.ts`

Edit only the second paragraph ("Reads hand out
shallow copies…"). Leave the first paragraph's
"simulated backends (memory, localStorage)" for
T32.

**Before:**

```
// Reads hand out shallow copies (rows are flat), matching
// IndexedDB's structured-clone-per-read value semantics —
// a caller mutating a fetched row can never reach the
// buffer or the committed store.
```

**After:**

```
// Reads hand out copies, never the buffered or committed
// row objects — the seam's value semantics: Postgres
// materializes a fresh row per read, and the test backend
// must not be weaker. A caller mutating a fetched row can
// never rewrite committed state.
```

### T28: backend-read-isolation.test.ts

**Files:** `tests/backend-read-isolation.test.ts`

**Before:**

```
// Reads must hand out copies, never the buffered or
// committed row objects — IndexedDB structured-clones every
// read, and the simulated tiers must share its value
// semantics. A caller mutating a fetched row must never
// rewrite committed state.
```

**After:**

```
// Reads hand out copies, never the buffered or committed
// row objects — the seam's value semantics: Postgres
// materializes a fresh row per read, and the test backend
// must not be weaker. A caller mutating a fetched row can
// never rewrite committed state.
```

Do not change the tests.

```bash
git add api/backend-buffer-tx.ts \
    tests/backend-read-isolation.test.ts
./validate
git commit -m "Re-ground copies-on-read on the seam

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

## Wave 5 — F5 api (T29–T36)

### T29: db.ts seam comments

**Files:** `api/db.ts`

Replace each listed comment. Do not change
types, methods, or `TABLE_NAMES` contents.

**UniqueConstraintError before:** "A unique-
column collision. IndexedDB raises…" / "three
backends"

**After:**

```
// A unique-column collision on a declared unique column;
// the memory backend scans the declared unique columns
// before buffering. No table declares one today.
// handleRequest maps it to 412.
```

**Tx header before:** "Phase B" / "IndexedDB
transaction; memory + localStorage simulate"

**After:**

```
// The row-granular handle over one transaction. Postgres
// fulfills it with a native transaction; the memory backend
// simulates it (buffer touched tables, flush on success,
// discard on throw).
// `get` returns null for an absent row — absence is
// modeled at the call site, never via a sentinel.
```

Keep `get` returns-null if it is not already
in the new header; do not drop that teaching.
If the two ideas do not fit in one block, put
the absence sentence immediately above
`export interface Tx`.

**hasSchema before:** "simulated backends" /
"IndexedDB by a marker store (its object
stores always exist post-upgrade)"

**After:**

```
    // Schema lifecycle — each backend signals
    // 'schema exists' its own way: memory by table
    // existence, Postgres by the `schema_marker` row.
```

**readTransaction before:** "IndexedDB can run
concurrent readonly scopes; the memory tier
still serializes"

**After:**

```
    // Pure-read sibling of `transaction`; both backends
    // reject a write under it. Nested `readTransaction`
    // joins whatever mode is open so read-your-writes
    // stays intact.
```

**TABLE_NAMES before:** the whole Phase Final /
UNVERSIONED / object stores / orphans paragraph.

**After:**

```
// The tables of the message plane — one, `pairs`.
export const TABLE_NAMES = [
    'pairs',
];
```

Keep the `MESSAGE_TABLES` comment that follows
(it names no gated word).

**TableIndexSpec before:** UNIQUE index /
"Absent keys are unindexed in IndexedDB"

**After:**

```
// A secondary index is a plain column name, or the object
// form declaring `unique: true`. No table declares the
// object form today.
```

**uniqueColumns before:** "IndexedDB
ConstraintError translation and the simulated
tiers' pre-buffer scan"

**After:**

```
// The columns a table declares unique, in TABLE_INDEXES
// order — consumed by the memory backend's pre-buffer
// scan.
```

**TABLE_INDEXES before:** "Index ONLY NOT-NULL
columns — IndexedDB omits a row missing the
keyPath"

**After:**

```
// The columns `getWhere` accepts per table — the
// keyed-read allow-list both backends enforce
// (`assertGetWhereColumn`). Postgres indexes are
// declared in `schema-postgres.ts`.
```

Keep the existing `pairs: ['uri_collection',
'request_hash']` value. The "Tables absent here
are read in full or by primary key" sentence
may stay if it names no gated word.

### T30: db-backed.ts header

**Files:** `api/db-backed.ts`

**Before:** the "third backend, IndexedDB" /
"async tiers (IndexedDB)" header.

**After:**

```
// One adapter over any StorageBackend. The per-backend
// variation rides in the constructor: the backend, a
// latency shim, an open hook, a post-commit hook — both
// presets pass no-ops for the last three today. Schema
// lifecycle delegates to the backend.
```

Keep the HistoryEntityStore sentence that
follows if it names no gated word.

### T31: memory serializer trio

**Files:** `api/backend-memory.ts`,
`api/store-serializer.ts`,
`api/storage-serialize.ts`

**backend-memory.ts `#serialize` before:**
"until the IndexedDB tier (Phase B)"

**After:**

```
    // Orders whole transactions within this backend
    // instance — global ordering, stronger than the
    // per-store mutex it replaces (A2). Cross-process
    // ordering is Postgres's (advisory locks); this
    // serializer orders one memory instance.
```

**store-serializer.ts before:** "simulated
backends (memory, localStorage)" / "until the
IndexedDB tier (Phase B)"

**After:**

```
// A promise-chain serializer that orders whole operations
// through one backend instance. The memory backend wraps
// each transaction in it: without it, two concurrent
// transactions both pre-load a table at v0 and the second
// flush clobbers the first (last writer wins). The chain
// forces each transaction to observe the prior one's
// flush. Cross-process ordering is Postgres's (advisory
// locks); this serializer orders one memory instance.
```

**storage-serialize.ts before:**
`LocalStorageBackend and MemoryStorageBackend`

**After:**

```
// Storage-edge serialization shared by both backends.
// The NOT NULL gate lives here so both Postgres and the
// memory backend reject null/undefined fields
// identically — so the test backend cannot lie about
// what the production gate enforces.
```

### T32: backend-buffer-tx.ts F5 paragraph

**Depends:** T27. **Files:**
`api/backend-buffer-tx.ts`

**Before:**

```
// discarding it. Backend-agnostic by construction — the two
// simulated backends (memory, localStorage) differ only in
// how they fill the buffer (preload) and drain it (flush),
// never in how the buffer is read or written here. The
```

**After:**

```
// discarding it. The memory backend fills and drains this
// buffer; Postgres does not use it. The
```

Keep the NOT-NULL-at-put sentence.

### T33: pii-hard-delete delete Cross-tab

**Depends:** T21. **Files:**
`api/pii-hard-delete.ts`

Delete the whole "Cross-tab note" paragraph
(the localStorage demo tier flush). Keep the
Concurrency note that follows.

### T34: derive-identity-spine F5 + derive-states

**Depends:** T07. **Files:**
`api/derive-identity-spine.ts`,
`api/derive-states.ts`

**deriveIdentityKind before:**

```
// whole-family prefix read matches the demo tier's E13
// posture (deriveIdentityPiiRows reads more).
```

**After:**

```
// whole-family prefix read is the one
// `deriveIdentityPiiRows` already makes.
```

**derive-states.ts before:**

```
// replay holds ONLY under this demo's zero-latency, single-process
// architecture, where the claim body's claimAt and the route's
// real decision instant are, for all practical purposes, the same
// moment; the eventual server tier must record the ACTUAL expiry
// decision as its own event rather than lean on this replay trick.
```

**After** (keep the caveat; drop "demo" and
"eventual server tier"):

```
// replay holds ONLY where `claimAt` and the decision
// instant coincide in one process; a multi-process
// deployment must record the actual expiry decision as
// its own event rather than lean on this replay trick.
```

### T35: api.ts ClientFacadeAdapter

**Depends:** T24. **Files:** `api/api.ts`

**Before:**

```
// What the client verb facade requires of its adapter: the
// unfenced tier's full contract (handleRequest's gate fences
// it per request) plus the segregated demo latency shim the
// facade awaits before each simulated network hop.
```

**After:**

```
// What the client verb facade requires of its adapter: the
// unfenced tier's full contract (handleRequest's gate fences
// it per request) plus the latency shim — both presets pass
// a no-op today.
```

### T36: latency.ts

**Files:** `api/latency.ts`

**Before:**

```
// The demo network-emulation seam, segregated from the
// storage contract (Interface Segregation): only the client
// verb facade awaits it before each simulated network hop —
// no store, decorator, or route handler ever does.
```

**After:**

```
// The latency shim — both presets pass a no-op today —
// segregated from the storage contract (Interface
// Segregation): only the client verb facade awaits it
// before each simulated network hop — no store,
// decorator, or route handler ever does.
```

Do not change `simulateLatency` or the config.

---

## Wave 5 commit

```bash
git add api/db.ts api/db-backed.ts \
    api/backend-memory.ts api/store-serializer.ts \
    api/storage-serialize.ts \
    api/backend-buffer-tx.ts \
    api/pii-hard-delete.ts \
    api/derive-identity-spine.ts \
    api/derive-states.ts api/api.ts api/latency.ts
./validate
git commit -m "Describe the two backends in seam comments

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

Then: `./generate-schema-svg --check`. If it
fails, note it for Wave 14; do not regenerate
inside this commit.

---

## Wave 6 — F5 web-app (T37–T40)

### T37: server-core.ts

**Before:**

```
// in-page API and IndexedDB backend stay off this
// graph. Cookie-session: access token is memory only;
```

**After:**

```
// The in-page test facade stays off this graph.
// Cookie-session: access token is memory only;
```

### T38: session-token.ts

**Before:**

```
// Per-tab bearer holder. No mint, no IndexedDB — the
// browser seed still mints in init.ts; the server entry
// installs a decode-only anonymous stub or a login token.
```

**After:**

```
// Per-tab bearer holder. No mint — the test composition
// root (`adapters/init.ts`) seeds an anonymous token; the
// server entry installs a login token.
```

### T39: session-refresh.ts

**Before:**

```
// and reads the HttpOnly cookie. Browser ZIP still sends the
// stored refresh (body fallback). A terminal 401 surfaces as
```

**After:**

```
// and reads the HttpOnly cookie. The non-cookie session
// mode of the test composition root sends the stored
// refresh in the body. A terminal 401 surfaces as
```

### T40: storage-keys.ts

**Before:**

```
// Client-side localStorage keys. All share the
// fusion-angle: prefix. deleteSchema only removes
// TABLE_NAMES keys, so these UI/session keys
// survive a schema wipe.
```

**After:**

```
// Client-side localStorage keys — UI preferences and the
// test session mode's credential slot. All share the
// `fusion-angle:` prefix. No data lives in localStorage.
```

Drop the deleteSchema / TABLE_NAMES sentence
(it describes a deleted data-tier wipe).

```bash
git add web-app/app/server-core.ts \
    web-app/app/adapters/session-token.ts \
    web-app/app/adapters/session-refresh.ts \
    web-app/app/storage-keys.ts
./validate
git commit -m "Retire browser-tier wording in web-app

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

## Wave 7 — F5 tests (T41–T44)

The true wall is "this file installs no client
facade", never "Node has no IndexedDB".

### T41: flow-designer-presenter.test.ts

**Before:**

```
// load. This test cannot reach #queueSave at all (Node has no
// IndexedDB — see this file's other tests' centered-input
// convention) so it asserts the STRUCTURAL guarantee that
```

**After:**

```
// load. This test cannot reach #queueSave at all (this
// file installs no client facade — see this file's other
// tests' centered-input convention) so it asserts the
// STRUCTURAL guarantee that
```

The file has one IndexedDB site (two lines).
That is the whole task.

### T42: command-palette-init.test.ts

**Before:**

```
// global adapter at a pristine in-memory tier
// (IndexedDB has no Node stub), and asserts the
```

**After:**

```
// global adapter at a pristine in-memory tier
// (this file installs no client facade), and asserts
// the
```

### T43: flow-undo-cursor.test.ts

**Before:**

```
// (FlowDesignerPresenter#queueSave calls sessionContext()
// internally, which requires a real browser IndexedDB
// connection — "IndexedDB has no Node stub, and we add no fake"
// per web-app/app/adapters/init.ts's own comment;
```

**After:**

```
// (FlowDesignerPresenter#queueSave calls sessionContext()
// internally; this file installs no client facade;
```

Keep the rest of the mechanism pin. Re-wrap.

### T44: db-keyed-read-coverage.test.ts

Header and assertion message only. Do not
change `KEYED_READS` or which tests exist.

**Header before:** IndexedDB `index.getAll` /
"memory and localStorage backends cannot
surface this fault"

**Header after:**

```
// Every call-site keyed read in the codebase: a place that
// reads a table by a column via the `getAllWhere(column,
// key)` store method (which lowers to `Tx.getWhere`).
// Every `getAllWhere` literal names a column `getWhere`
// accepts on both backends. This static guard closes
// that contract at ./validate time.
```

Keep the "When you add a getAllWhere…"
manifest paragraph if it names no gated word.

**Assertion message before:** `'IndexedDB read
throws NotFoundError at runtime.'`

**After:** a message that names the allow-list,
for example:

```
            + 'getWhere rejects an undeclared column on '
            + 'both backends.',
```

Do not weaken `assert.ok(cols.includes(column),
…)`.

```bash
git add tests/flow-designer-presenter.test.ts \
    tests/command-palette-init.test.ts \
    tests/flow-undo-cursor.test.ts \
    tests/db-keyed-read-coverage.test.ts
./validate
git commit -m "Retire browser-tier wording in tests

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

## Wave 8 — metafile pin (T45–T46)

### T45: server-zip-metafile.test.ts

**Files:** `tests/server-zip-metafile.test.ts`

1. Drop `'backend-indexeddb'` from
   `FORBIDDEN_INPUTS`. It becomes:

```
const FORBIDDEN_INPUTS = [
    'api/access-token.ts',
] as const;
```

2. Re-point the fixture that fed
   `'api/backend-indexeddb.ts'` /
   `'SIGNING_KEY_MATERIAL'` at a neutral sample
   path. Both fragment kinds must still hit:
   the first `clientGraphHits` call on the live
   `api/access-token.ts` file proves the
   `FORBIDDEN_INPUTS` kind; the second call
   proves the `FORBIDDEN_SOURCES` kind:

```
    assert.deepEqual(
        clientGraphHits(
            'sample/path.ts',
            'SIGNING_KEY_MATERIAL',
        ),
        [
            'sample/path.ts:SIGNING_KEY_MATERIAL',
        ],
    );
```

3. Retitle the third test
   `'client graph omits token mint and signing key'`.
   Do not change the esbuild / metafile
   assertion body.

### T46: CLAUDE.md + ARCHITECTURE.md metafile

**Depends:** T25. **Files:** `CLAUDE.md`,
`ARCHITECTURE.md`

**CLAUDE.md Build before:**

```
must not contain `SIGNING_KEY_MATERIAL`,
`backend-indexeddb`, or token mint
(`api/access-token.ts`).
```

**After:**

```
must not contain `SIGNING_KEY_MATERIAL` or
token mint (`api/access-token.ts`).
```

**ARCHITECTURE.md** § Demo server tier, the
metafile-test sentence only:

**Before:**

```
test forbids `SIGNING_KEY_MATERIAL`,
`backend-indexeddb`, and token mint
(`api/access-token.ts`) in the client graph.
```

**After:**

```
test forbids `SIGNING_KEY_MATERIAL` and token
mint (`api/access-token.ts`) in the client graph.
```

Do not yet drop "no IndexedDB" from the client-
bundle sentence, do not yet write the history
pointer, do not yet delete orphan-store
sentences. Those are T47 / T49.

```bash
git add tests/server-zip-metafile.test.ts \
    CLAUDE.md ARCHITECTURE.md
./validate
git commit -m "Trim the metafile pin to mint and key

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

## Wave 9 — SCHEMA.md (T47)

### T47: Schema of record + orphan echoes

**Depends:** T46. **Files:** `SCHEMA.md`,
`ARCHITECTURE.md`

Re-grep root `*.md` for `Orphan stores`,
`gate 6`, and `leave-inert` before deleting.

Keep:

- ARCHITECTURE.md "Gate 6 **PII leave-inert**
  still stands on the pair plane (erasure
  completeness is pair-plane only)." — that is
  the surviving residual, already in API.md
  § THE ERASURE-COMPLETENESS PIN.
- API.md "Author gate 6e" (invitations
  KEEP-ATOMIC) — different gate.
- Other "orphan" uses (RESTRICT visibility,
  mint-once dialogs, pair balance).

Delete:

- SCHEMA.md the whole **Orphan stores (gate 6)
  — CANONICAL residual statement** paragraph.
- ARCHITECTURE.md "The IndexedDB orphan-store
  residual retired with the yank." (Phase Final
  paragraph).
- ARCHITECTURE.md "Dual-write mechanics are
  GONE. The IndexedDB orphan-store residual
  retired with the yank." — keep "Dual-write
  mechanics are GONE." if it remains true;
  drop only the IndexedDB sentence. In
  § Exit residual that is:

```
Gate 6 **PII leave-inert** still stands on the pair
plane (erasure completeness is pair-plane only).
Dual-write mechanics are GONE.
```

**SCHEMA.md § Schema of record** — replace the
object-store sentence, the localStorage-keys
sentence, and "TypeScript / IndexedDB view"
with:

```
The table is `pairs` in Postgres
(`api/schema-postgres.ts`); the memory backend holds the
same rows in an in-process Map keyed by table name.
Column types match `PairEntity`: TEXT in the TypeScript
view; Postgres stores `request` and `response` as BYTEA
Latin-1.
```

Keep the rest of the section (composites, NOT
NULL, derivations, timestamp width). Wrap at
78. `TABLE_NAMES` may still be named as the
authoritative count.

```bash
git add SCHEMA.md ARCHITECTURE.md
./validate
git commit -m "Rewrite Schema of record for two backends

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

## Wave 10 — API.md (T48)

### T48: API.md F2 + ZIP clauses + residual 3

**Files:** `API.md`

**§ 3.14 undo.** Replace "the IndexedDB
auto-commit constraint bars anything but row
ops inside a transaction" with a citation of
CLAUDE.md § Transaction bodies await only row
ops (F2 canonical, wrapped).

**Authorize-flow clauses — delete these two
sentences:**

- "the browser ZIP still accepts authorize
  without a challenge"
- "The browser ZIP keeps the soft path."

The surrounding sentences then read that
authorize rejects a request without S256, so
redeem always verifies. Example for § 3.8:

**Before:**

```
    server ZIP rejects authorize without S256, so redeem
    always verifies there; the browser ZIP still accepts
    authorize without a challenge) →
```

**After:**

```
    authorize rejects a request without S256, so redeem
    always verifies) →
```

**§ 3.9 before:**

```
  - Server ZIP rejects a request that lacks S256
    (400, no pair) before the credential check. The
    browser ZIP keeps the soft path. The client sends
    S256.
```

**After:**

```
  - Authorize rejects a request without S256
    (400, no pair) before the credential check, so
    redeem always verifies. The client sends S256.
```

**Composed-POST bullet** ("The IndexedDB
auto-commit constraint. An `IDBTransaction`
lives…") becomes:

```
- **Atomicity.** A composed POST's appends commit or roll
  back as one. Re-entering `handleRequest` mid-transaction
  would open a second transaction and split the unit
  (Commandment X), so a handler holding a transaction
  composes store primitives and awaits row ops only
  (CLAUDE.md § Transaction bodies await only row ops).
```

**Seed pass-1 / pass-2** (the
"auto-commit an IndexedDB transaction early"
paragraph) and the **fence-fallback** paragraph
("IndexedDB auto-commit hazard"): take the F2
canonical citation. Keep pair counts and the
PRE-DISPATCH argument. Example fence-fallback:

```
**Why the fence fallback is safe to flip categorically.** It
runs PRE-DISPATCH in `fenceRequest` — never inside a
transaction (CLAUDE.md § Transaction bodies await only row
ops) — and is LATENT-hot: ordinary traffic
```

**Credential pass-1/pass-2** citation
"(CLAUDE.md § the IndexedDB auto-commit
constraint)" becomes
"(CLAUDE.md § Transaction bodies await only
row ops)".

**Erasure residual 3** becomes:

```
3. **The caller's own access token.** Held in memory for
   its lifetime (≤ 15 min), it decodes to the pre-erasure
   name until it expires or is refreshed.
```

Do not mention localStorage here.

```bash
git add API.md
./validate
git commit -m "Re-ground API.md transaction rationale

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

## Wave 11 — F6 + history pointer (T49)

### T49: scratchpad rule and history pointer

**Depends:** T46, T47. **Files:** `CLAUDE.md`,
`ARCHITECTURE.md`

**CLAUDE.md Database bullet before:**

```
  There is no IndexedDB or localStorage **data**
  backend. Theme and sidebar still use localStorage.
```

**After:**

```
  localStorage holds UI preferences only — theme,
  sidebar, log level, active organization id — never
  data.
```

**ARCHITECTURE.md § Demo server tier:**

1. Client-bundle sentence: drop the last item.
   `(no in-page API, no signing key, no IndexedDB)`
   becomes `(no in-page API, no signing key)`.

2. Replace:

```
The yank that deleted the in-browser data tier has
shipped. Memory remains for `./test` / `./validate`.
Theme and sidebar still use localStorage.
```

with:

```
Storage moved server-side in `b1322740`; memory remains
for `./test` / `./validate`.
localStorage holds UI preferences only — theme,
sidebar, log level, active organization id — never
data.
```

§ Storage tiers stands. Do not restate deleted
tiers there.

```bash
git add CLAUDE.md ARCHITECTURE.md
./validate
git commit -m "State the localStorage scratchpad rule

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

## Wave 12 — README + TEST-PLAN (T50)

### T50: drop retired-tier notes

**Files:** `README.md`, `TEST-PLAN.md`

**README.md before:**

```
environment). The in-browser data tier is gone. A1–A6 are
```

**After:**

```
environment). A1–A6 are
```

**TEST-PLAN.md MCP-limitations:** delete
"There is no in-browser data database to
inspect." Keep the CSP `await` bullet.

**TEST-PLAN.md superseded blockquote:** delete
"The retired browser-ZIP origin (`python3 -m
http.server` + in-browser IndexedDB) is gone."
Keep the rest of the blockquote.

**G46 residual list:** replace
"the localStorage session-credentials JWT's
name claim" with the in-memory wording, same
as API.md residual 3:

```
the caller's own access token, held in memory for its
lifetime (≤ 15 min)
```

Fold that phrase into G46's existing residual
list without breaking the one-line case
format. TEST-PLAN.md is exempt from 78-col.

```bash
git add README.md TEST-PLAN.md
./validate
# hand-grep MUST now return nothing outside the
# in-browser ZIP carve-out
git commit -m "Drop retired-tier notes from root docs

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

## Wave 13 — gate (orchestrator)

Insert in `validate` **after** the `org` lint
and **before** the SCHEMA.svg check, in that
file's idiom.

```
# Reject the vocabulary of the retired browser-resident
# storage tiers. `localStorage` alone is legal (UI
# preferences); its backend/tier compounds are not.
# `in-browser ZIP` is the live flow export (zip.ts).
PATTERN='indexeddb|IDBTransaction|non-IDB|\bIDB\b'
PATTERN="$PATTERN|LocalStorageBackend"
PATTERN="$PATTERN|localStorage (backend|tier|simulated|demo)"
PATTERN="$PATTERN|simulated (backend|tier)s?"
PATTERN="$PATTERN|object stores?|\bPhase B\b|auto-?commit"
PATTERN="$PATTERN|in-browser data|browser[ -]ZIP"
RETIRED_VOCAB=$(
    {
        find api shared server tests web-app/app -type f \
            \( -name '*.ts' -o -name '*.html' \
               -o -name '*.css' \) -print0 \
        | xargs -0 grep -nEi "$PATTERN" \
            || true
        find . -maxdepth 1 -type f -name '*.md' \
            -exec grep -nEi "$PATTERN" {} + \
            || true
    } | grep -v 'in-browser ZIP' || true
)

if [ -n "$RETIRED_VOCAB" ]; then
    echo "Error: retired storage-tier vocabulary:" >&2
    echo "$RETIRED_VOCAB" >&2
    exit 1
fi
```

Exclude `docs/`, `measurements/`, and `validate`
itself (the pattern lives in this comment —
those words are why `validate` is excluded).
Carve-out: lines containing `in-browser ZIP`.
Not gated: `demo tier`, `memory tier`.

```bash
# confirm the gate is green on this tree
./validate
git add validate
git commit -m "Add retired storage vocabulary gate

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

If this commit would be red, stop. A site was
missed; fix it in its family, do not weaken
the pattern.

---

## Wave 14 — SCHEMA.svg (orchestrator, conditional)

Only if `./generate-schema-svg --check` failed
after T29 (comment edits in `api/db.ts` can
move the picture).

```bash
./generate-schema-svg
./validate
git add SCHEMA.svg
git commit -m "Regenerate SCHEMA.svg after comment edits

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

If `--check` is already green, skip this
commit.

`API.svg` should not drift (no `routes[]`
change). If it does, stop and investigate —
that is out of scope.

---

## Acceptance

- `./validate` green with the gate in place.
- The Wave 0 hand-grep on the final tree
  returns nothing outside the `in-browser ZIP`
  carve-out.
- Every F1–F6 canonical sentence appears
  verbatim (modulo 78-column wrapping) at
  every site the family lists; no site of a
  family uses a different wording.
- No test assertion is weakened; the only test
  edits are comments, the assertion message in
  `db-keyed-read-coverage.test.ts`, and the
  metafile-pin trim.
- `SCHEMA.svg` and `API.svg` gates green.
- Root `.md` files pass the 78-column lint;
  `TEST-PLAN.md` stays exempt.
- Fourteen (or thirteen, if SVG did not drift)
  linear commits, one concern each.
- Ring 2 and Ring 3 organs unchanged.

---

## Spec coverage (self-review)

| Spec section | Task |
| --- | --- |
| F1 definition / citing / H7 / keep-own | T01–T15 |
| F2 code comments + CLAUDE.md reason | T16–T25 |
| F3 declared-table scope | T26 |
| F4 copies on read | T27–T28 |
| F5 api seam comments | T29–T36 |
| F5 web-app | T37–T40 |
| F5 tests | T41–T44 |
| Metafile pin | T45–T46 |
| SCHEMA.md + orphan echoes | T47 |
| API.md F2 / ZIP / residual 3 | T48 |
| F6 + history pointer | T49 |
| README + TEST-PLAN + G46 | T50 |
| Gate | Wave 13 |
| SCHEMA.svg if drift | Wave 14 |
| Non-goals / Follow-on | Do not touch |
| Invariants (seam / tier / scratchpad) | Canonical texts |

No placeholders. No "similar to Task N"
without the replacement. Second-pass files are
named with their first-pass dependency.

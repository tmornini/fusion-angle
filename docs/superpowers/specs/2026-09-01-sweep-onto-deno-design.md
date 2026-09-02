# Sweep onto Deno: rebase the small-items sweep onto master

- Date: 2026-09-01
- Status: awaiting review, pre-plan
- Worktree: `.worktrees/2026-09-01-small-items-sweep` (the
  sweep's own; this spec rides it — see Decisions)
- Branch: `2026-09-01-small-items-sweep` at `c2a40050`,
  31 commits over master `82dee1d9`
- Target: master at `adaad69a`, 160 commits later, Deno
  2.9.6 replacing Node end to end
- Ships: the same 31 commits rewritten onto the Deno
  master, each green under `./validate`, plus this spec
  and its plan, plus at most one trailing docs commit
- Leaves: every product hunk byte-identical; the sweep's
  spec and plan untouched; master's migration untouched

## Problem

The sweep was reviewed and gated on a Node tree: 26
execution commits and 3 review-fix commits, every test
hunk written for `node:test` and `node:assert`, every gate
run through `tsc` and `node --test`. Master then took the
Deno migration: `Deno.test` suites against `@std/assert`,
`deno check --frozen` in place of the two `tsc` projects,
`deno test` with the op and resource sanitizers on, raw
global stubs replaced by the seams under `tests/fixtures/`,
and a release for the cross-tab channels that tests must
call. A merge simulation shows the two sides overlap in 25
files — 23 tests and the two root docs — with content
conflicts in 12, all tests. The product code the sweep
changed was never touched by the migration and applies as
it is.

The conflicts are shallow in kind and wide in count. Even
the auto-merged test hunks carry `assert.ok`, `assert.equal`,
and friends, so a plain `git rebase master` would produce
a branch whose commits apply cleanly and fail `deno check`.
AGENTS.md forbids that twice over: history is linear and
fast-forwards, and every commit on master is green.

## Decisions

- **The reviewed history survives commit for commit.** The
  31 commits rebase onto master and each is re-expressed in
  the Deno idiom as it lands: same subject, same trailers,
  same concern, green on its own. A fresh re-execution of
  the sweep's plan against the Deno master was considered
  and declined; the product hunks are already reviewed and
  apply cleanly, so only their pins need a new voice.
- **One spec.** Mechanics, the idiom map, the conflict
  policy, sanitizer hygiene, and the docs re-measurement
  are sequential, not independent. A second spec appears
  only if a port exposes a product change, such as a leak
  the sanitizers catch; that change then rides its own
  worktree under the AGENTS.md doctrine, and this rebase
  pauses where it stands.
- **The gate drives the rebase.** `git rebase master --exec
  ./validate` stops at every conflict and after every
  commit that applies cleanly yet fails the Deno gate. A
  worker resolves or ports, re-runs the gate by hand, amends
  with the message unchanged, and continues. Nothing else
  decides which commits need work; the exec does.
- **This spec rides the sweep branch.** AGENTS.md says every
  spec rides its own worktree. This spec's execution IS the
  sweep branch — a fresh worktree would have nothing to
  rebase — so the spec and its plan commit onto the sweep
  branch, in its worktree, before the rebase starts, and
  move with it as docs commits.
- **A safety tag pins the originals.** A local lightweight
  tag on `c2a40050` keeps the reviewed commits reachable by
  name until the fast-forward lands; `git rebase --abort`
  returns to it. The tag is deleted after landing.
- **Master's idiom is the voice; the sweep's intent is the
  invariant.** Where both sides changed a line, the
  resolution starts from master's line and re-applies the
  sweep's change to it. No Node form is ever reintroduced.
- **Product hunks are proven identical, not assumed.** The
  review artifact per range is `git range-diff` of the
  rewritten commits against their originals; only test files
  and the two root docs may show a delta.
- **Docs truth is re-measured, not re-applied.** The sweep's
  docs commits auto-merge, but their claims were measured on
  the Node tree. One task re-runs every measurement on the
  Deno tree after the rebase; drift lands as one trailing
  docs commit, and no drift lands nothing.

## Mechanics

Before anything moves:

```bash
git tag sweep-pre-deno c2a40050
export DENO_DIR="$TMPDIR/deno-dir"    # sandbox only
```

In the sweep's worktree, on its branch:

```bash
GIT_SEQUENCE_EDITOR=true git rebase master --exec ./validate
```

`--exec` appends `./validate` after every pick; git runs it
non-interactively. The rebase stops in exactly two ways:

- **Conflict stop.** A pick fails. The worker resolves each
  conflicted file under the policy below, ports the same
  commit's test hunks under the idiom map, stages, and runs
  `git rebase --continue`; the exec then gates that commit.
- **Exec stop.** The pick applied but `./validate` failed.
  The worker ports the hunks, re-runs `./validate` by hand
  until green — a failed exec is not re-run by git — amends
  with `git commit --amend --no-edit`, and continues.

Invariants at every stop: the commit message is never
edited (subject and both trailers stay byte-identical); the
commit's file set never grows beyond what the original
touched, except that a port may add an import line the
idiom needs; product files are never edited. The three
browser commits (Tasks 10, 11, 15) also run `./test-browser`
before continuing, since the exec gate is Layer 1 only. One
worker drives the rebase at a time; the rebase state lives
in the worktree. A commit that becomes empty after
resolution is a plan defect: stop and report rather than
`--skip`.

## The idiom map

Every rule maps a form the sweep's hunks actually contain
to the form master's sibling files already use. The census
of the sweep's test hunks at `c2a40050`: 8 `assert.ok`, 17
`assert.equal`, 4 `assert.deepEqual`, 2 `assert.match`, 2
`assert.doesNotMatch`, 3 `node:test` imports, 3
`node:assert` imports, 2 raw `localStorage` stubs, 3
`setImmediate` drains.

| Sweep form | Master form |
|---|---|
| `import { test } from 'node:test'`; `test(` | dropped; `Deno.test(` |
| `import { strict as assert } from 'node:assert'`, `import assert from 'node:assert/strict'` | `import { … } from '@std/assert'` — only the names used, wrapped as master wraps |
| `assert.ok(c, msg)` | `assert(c, msg)` |
| `assert.equal(a, b, msg)` (strict) | `assertStrictEquals(a, b, msg)` |
| `assert.deepEqual(a, b, msg)` (strict) | `assertEquals(a, b, msg)` |
| `assert.match(s, re)` / `assert.doesNotMatch(s, re)` | `assertMatch(s, re)` / `assertNotMatch(s, re)` |
| `g['localStorage'] = fake` … `delete g['localStorage']` | body wrapped in `withLocalStorageAsync(fake, …)` from `tests/fixtures/local-storage.ts` |
| `window`, `MutationObserver`, `document` stubs | unchanged: `g[…]` assignments deleted in `finally` |
| a page test whose `init` subscribes | `finally` also `await import('../web-app/app/adapters/broadcast-channel.ts')` and calls `deleteNotificationChannel()` — the one channel `init` opened, after the last assertion |
| `setImmediate` drains | unchanged |
| a browser test | `Deno.test`; `useBrowser()` and `withAdminPage` unchanged; `assertEquals` for the array comparison |
| status-only in-process responses | unchanged, bare |

The three new files port whole, each mirroring its master
sibling in shape: `tests/browser/dialogs.test.ts` follows
`tests/browser/viewport.test.ts`; `tests/flow-stats-subscribe.test.ts`
follows `tests/ideas-empty-subscribe.test.ts`, wrapper and
channel release included; `tests/api-flow-record-binding.test.ts`
follows the head of `tests/api-organization-isolation.test.ts`.
The 78-character lint, the four-space indent, and the `org`
ban are unchanged.

## Conflict policy

One rule: start from master's line, re-apply the sweep's
change to it, then re-run the original task's own
measurement gate, which must match. The seven conflict
stops fall into five classes:

- **Renames over rewritten lines.** Task 7's `r1` in
  `api-flow-tags`, `api-invitations-fence`,
  `derive-record-instances`, `flow-zoom-to-fit`; Task 23's
  alias rename in `adapters-records`, `api-record-document`,
  `drift-records`. Take master's lines, re-run the task's
  own `perl -pi` rename on the file, re-verify the site
  counts (4/18/2/4/2; 16 → 0), re-wrap the one import the
  longer name lengthens.
- **Strengthenings over rewritten assertions.** Task 4's
  tagged cells and Task 5's strict order land on master's
  `assert(...)` lines: `assert(row.includes('<td>archived</td>'))`,
  `assert(row.includes('<td>reactivated</td>'))`,
  `assert(rows[0]!.at > rows[1]!.at)`.
- **Stub-shape edits in a restructured file.** Task 13's
  `makeCreateButtonStub`, the `querySelector` branch, and
  its two assertions go into master's wrapped version of
  the ideas test; Task 2's pre-bell assertion and Task 3's
  stub deletion apply cleanly there and are ported at their
  own stops.
- **A widened test signature.** Task 17's `pageFor(state,
  roles)`, both callers, and the new test in `assertMatch`
  and `assertNotMatch` form.
- **Fixture seeds over rewritten fixtures.** Task 18's
  `seedRecord` in `adapters-flow-records`; the other three
  fixture files apply cleanly and port at the exec stop.

## The commit map

Measured at `c2a40050` against `adaad69a` with
`git merge-tree` per commit. "Conflict" is measured;
"exec" and "pass" are predicted from the idiom census —
the exec decides.

| Commit | Task | Expected stop |
|---|---|---|
| `e4d3a8d3`, `049a7ac5` | spec, plan | pass |
| `be45900f` | 1 | pass (docs auto-merge) |
| `a1de9aed` | 2 | exec (`assert.ok`) |
| `6d12486f` | 3 | pass |
| `345ff238` | 4 | conflict |
| `4dc4162f` | 5 | conflict |
| `3b9a1288` | 6 | pass |
| `c21f31b3` | 7 | conflict, four files |
| `8942a261`, `e2657a82` | 8, 9 | pass |
| `0664bb8f`, `5e0b3a51` | 10, 11 | exec (new file; Layer 2 too) |
| `df7d9bbf` | 12 | exec (new file) |
| `c581a349` | 13 | conflict |
| `484c330f` | 14 | pass |
| `c1180a2d` | 15 | exec (`assert.ok`; Layer 2 too) |
| `4fa09bb0` | 16 | exec (`assert.deepEqual`) |
| `25640abd` | 17 | conflict |
| `4f3b4936` | 18 fixtures | conflict, one file; ports in three |
| `4539e09f` | 18 probe | exec (new file; `assert.equal`) |
| `3d1e808b` … `2842018d` | 19–22 | pass |
| `fbcea1e9` | 23 | conflict, three files |
| `187f42a1` | 24 | pass |
| `71b29876` | 26 | pass (docs auto-merge) |
| `6bbd8f96`, `ce53c5ed`, `c2a40050` | review fixes | pass |

Seven conflict stops, seven predicted exec stops, seventeen
predicted pass-throughs.

## Sanitizer hygiene

Under `--sanitize-ops` every `setImmediate` tick is awaited
and nothing is left pending; the stats page test's post-bell
re-load must finish inside its drain, as the ideas test's
does for the same shape. If a drain proves short under
Deno, the fix is more ticks, never a sleep. Under
`--sanitize-resources` the test's own `BroadcastChannel` is
closed, the process's notification channel is released in
`finally`, the memory adapter holds no OS handle, and
in-process responses are not resources. `./test-browser`
runs with the resource sanitizer only; `withAdminPage`
disposes the origin and the context, and the dialogs test
adds no handle of its own.

## Docs re-verification

After the last commit lands, one task re-runs each claim's
measurement on the Deno tree:

- the eight strike claims of Task 1 (the greps in its
  brief, with the D25 name read across its two literals);
- the six corrections of Task 26: the reveal's printed
  lines, the edit-form test's `toGeneralInfoDraft` call,
  `hasUndoHistory` read by no route, the run-four residue,
  the validation-voices bullet, the stale-history bullet;
- the two remaining "remove the comment at … when done"
  pointers, which master's TODO lists as six before the
  sweep removes four;
- the three TEST-PLAN pins (G9, D26, B24), whose test names
  are already verified unchanged on master;
- the item 6 sentence on the bottom-of-stack undo.

One anchor is known to have shifted: master's seed reveal
test no longer states its line count, so the A3 sentence's
"12 printed lines" is re-derived from what the seed prints
now. Drift lands as one docs commit at the end of the
branch; a claim that still holds is left alone.

## Environment

In the Claude Code sandbox `DENO_DIR` cannot be
`~/Library/Caches/deno`; export `DENO_DIR="$TMPDIR/deno-dir"`
warmed by copying the operator's cache (118 MB at the time
of writing), so `--frozen` runs need no network. That is an
agent accommodation, never a repo script, per AGENTS.md.
Layer 2 attaches to the operator's Chrome through
`CHROME_DEBUG_URL`, because Chrome cannot launch inside the
sandbox. Measured on master in the sandbox: `./validate`
in 15.8 s wall, so the exec gate over 33 commits costs about
nine minutes.

## Verification

- **Per commit:** `./validate` through the exec gate; its
  output is captured to a log that names each commit and
  its result. The three browser commits add `./test-browser`.
- **Per range:** a `git range-diff` of the rewritten commits
  against `sweep-pre-deno`'s originals, written to a file.
  The reviewer judges the port only: product hunks show no
  delta, the map is applied exactly, no assertion loosens,
  messages are byte-identical, the gate evidence is present.
- **At the tip:** `./test-all` against the attached Chrome;
  `git range-diff sweep-pre-deno~31..sweep-pre-deno
  master..HEAD` over the whole branch; the plan's
  completion checklist re-run.
- **Landing:** `git merge --ff-only` from the main checkout,
  then the worktree, the branch, and the tag go.

## Execution

The plan's tasks are commit ranges, driven serially by one
implementer each, whose brief carries the map and the
policy for its commits: setup and the docs pass-through
(the spec, the plan, Task 1, this spec, its plan); Tasks
2–5; 6–9; 10–11; 12; 13–14; 15–17; 18; 19–22; 23–24; 26 and
the review fixes; the docs re-measurement; the tip gates
and hand-off. Each range ends with a review of its
range-diff. The final whole-branch review reads the full
range-diff and the tip's gates. The fast-forward is the
operator's decision.

## Hazards

- **A failed exec is not re-run by git.** The worker must
  re-run `./validate` by hand after amending; continuing on
  a red commit lands red history.
- **The rename sites moved.** Master rewrote the lines the
  `r1` and alias renames touch; re-running the task's own
  `perl` on master's text is the only safe route, and the
  site counts are the proof.
- **The resource sanitizer sees the notification channel.**
  A page test that subscribes and does not call
  `deleteNotificationChannel()` in `finally` fails under
  `deno test`, not under the old runner.
- **`assert.equal` was strict.** The sweep's files imported
  the strict namespace, so `assertStrictEquals` is the
  faithful port; `assertEquals` would loosen it.
- **Amending must not touch the message.** `--no-edit` on
  every amend; a changed subject or trailer is a finding.
- **The docs commits look done and are not.** They merge
  clean; their truth is a separate task.

## Measured, not assumed

Read at `c2a40050` against `adaad69a`:

- 160 commits and 471 files on master since `82dee1d9`;
  25 overlapping files; 12 with content conflicts, all
  tests; both root docs auto-merge.
- 19 of the sweep's commits touch `tests/`; 7 stop on
  conflicts; 3 test files are wholly new.
- The four TEST-PLAN pin names survive on master unchanged.
- Master's TODO still carries all six comment pointers, the
  "11 printed lines" A3 sentence, and the undo bullet the
  sweep folds away; master's `pg-seed` test no longer states
  the reveal's line count.
- The old `tsconfig` already had `noUnusedLocals`,
  `noUnusedParameters`, and `exactOptionalPropertyTypes`;
  `deno.json` adds no strictness the product code has not
  met.
- `./validate` on master runs in the sandbox with the
  copied cache in 15.8 s.

## Out of scope

- Re-executing the sweep's plan against the Deno master.
- Any product change a port exposes; that is its own spec.
- Master's remaining `node:` specifier (`server/scrypt-hash.ts`)
  and anything else the migration left for later.
- Porting tests the sweep did not touch.
- Correcting line-number drift in docs the sweep left
  alone.

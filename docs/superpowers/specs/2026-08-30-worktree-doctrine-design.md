# Worktree doctrine: every spec rides its own branch

## Problem

`AGENTS.md § Worktrees` forbids what this repository now
wants. Its six lines read "Do not use git worktrees. Work
directly in the main checkout," and eleven dated plans
under `docs/superpowers/plans/` repeat the rule in their
own headers and constraint blocks: "Work on master; never
branch, never merge, never push, never use a worktree."

The prohibition costs what it was meant to save. A Layer 3
walk needs `./crank` serving a clean tree; an
implementation in flight needs the same tree dirty. One
checkout cannot be both, so the walk and the work
serialize. The next spec in line is the Deno migration —
319 tasks across six parts — and it would hold the only
checkout hostage for its whole duration.

The inversion is not only a deletion. Documents that never
say "worktree" still assume one checkout: `TEST-PLAN.md`
hands `8080` to the walk as though nothing else could want
it, and `AUDIT.md` describes three sessions that write a
spec, a plan, and a report with no home named for them.
Grep finds the sentences that state the rule. Only reading
finds the sentences that relied on it.

## Decisions

- **Mechanism.** Real `git worktree` directories, not
  branches in the one checkout.
- **Location.** `.worktrees/<slug>` inside the repository.
  Sibling directories are unreachable from the agent
  sandbox; `.claude/` is a tool-specific path and
  `AGENTS.md` is a cross-tool router.
- **Integration.** Rebase, then `--ff-only`. Never merge.
- **Unit.** One worktree per spec, spanning spec, plan,
  and every execution commit.
- **Placement.** `AGENTS.md § Worktrees`, rewritten in
  place. The section keeps its name, so the reference in
  `2026-08-22-root-docs-rewrite-design.md:125` stays true.
- **Old plans.** Only `2026-08-30-deno-migration.md` is
  scrubbed. The ten historical plans stand as written;
  `AUDIT.md:42` already calls them history, and that rule
  needs no carve-out.

## The doctrine

`AGENTS.md:117-122` is replaced by twenty-two lines:

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

Both closing rules are assertions, not conveniences.
`--ff-only` fails exactly when the tree that passed the
gates is no longer the tree that would land. `-d` refuses
exactly when work is still stranded on the branch.

`AGENTS.md:115` — "Linear history — rebase and
fast-forward, never merge" — survives untouched. It is
the general rule; this is the specific mechanic.

## The sweep

| File | Edit |
|---|---|
| `AGENTS.md` | `§ Worktrees` 6 → 22 lines; `§ Subagents` +2 |
| `.gitignore` | `.worktrees/` |
| `2026-08-30-deno-migration.md` | header and Base bullet |
| `AUDIT.md` | +2 after `:44` |
| `TEST-PLAN.md` | +3 after `:27` |

`§ Subagents` gains two lines after "Proselytize first,
then brief": subagents work in the dispatching agent's
worktree and never create their own. The Agent tool takes
`isolation: "worktree"` and would otherwise nest one
inside the worktree the spec rides.

The Deno plan keeps `**Base:** master at e1cbeac9` — that
is a record of where the work starts, not an instruction.
It keeps `never merge` (§ Commit doctrine) and `never
push` (branches stay local). Only `never branch` and
`never use a worktree` invert.

`AUDIT.md` gains: an audit run rides one worktree — spec,
plan, and report. Its three sessions are already a spec →
plan → implement cycle; the runbook only needs to say so.

`TEST-PLAN.md § Invocation` gains: the walk runs in the
checkout under test; if another checkout holds 8080, crank
on a free port and every `localhost:8080` below reads as
that port. `localhost:8080` appears three times in 6,800
lines, so this is a note, not a port migration.

## Sequencing

Six commits, one concern each. Every intermediate state
passes `./validate`.

| # | Subject | `AGENTS.md` after |
|---|---|---|
| 1 | Ignore the worktrees directory | 281 |
| 2 | Invert the worktree prohibition | 297 |
| 3 | Keep subagents in the dispatcher's worktree | 300 |
| 4 | Ride a worktree in the Deno plan | — |
| 5 | Give the audit run its own worktree | — |
| 6 | Name the walk's checkout and port | — |

`AGENTS.md` lands on its 300-line ceiling exactly.
`./validate` fails on `-gt 300`, so it passes with no
margin. The ceiling was not raised: raising a gate to fit
content is the inversion the Office of Verification names.
The next edit to that file must reckon with it.

## Verification

1. `./validate` exits 0 after each of the six commits,
   not only the last. Commit 3 is the one to watch.
2. `git merge --ff-only <slug>` succeeds — proof the tree
   that went green is the tree that landed.
3. `git branch -d <slug>` succeeds without `-D` — proof
   nothing was stranded.
4. `git worktree list` returns to a single entry.
5. Scoped grep. Not zero hits: the ten historical plans
   survive by choice, as do the new section and the
   references pointing at it. Anything else is a miss.

There is no new automated test. This is doctrine, not
behavior; nothing about a running system changes.
`./validate` covers the mechanical half — line ceilings,
wrap width, vocabulary bans — and steps 2 through 4 are
the doctrinal half, proven by executing it.

## Measured, not assumed

Three findings from probing before the design was fixed:

- **The sandbox blocks sibling directories.**
  `mkdir ../fusion-angle-probe` returns "Operation not
  permitted," and policy disables the override. Doctrine
  naming siblings would be doctrine no agent could follow.
- **`./validate` is blind to `.worktrees/`.** Every `find`
  in it names explicit directories (`api web-app tests
  shared server`) or is `-maxdepth 1 -type f` over root
  `*.md`. Both `tsconfig.json` include globs are explicit.
  No gate needed changing. Confirmed by running
  `./validate` inside the worktree: exit 0.
- **The bootstrap dirties the main checkout, once.**
  After `git worktree add`, the main checkout reports
  `?? .worktrees/` and keeps reporting it until the
  fast-forward, because commit 1's `.gitignore` line lands
  on the branch. `./build`, `./crank`, and `./measure`
  refuse on master during that window. This is unique to
  this change; every later worktree is invisible from
  creation.

This spec rides `.worktrees/2026-08-30-worktree-doctrine`,
making it the first work to test the doctrine it writes.

## Out of scope

- The ten historical plans under
  `docs/superpowers/plans/`.
- A `RETIRED_VOCAB` pattern in `./validate` to keep the
  prohibition from returning. Cheap and in this repo's
  idiom — that gate scans root `*.md` at `-maxdepth 1`, so
  the historical plans could not trip it — but not asked
  for. The doctrine holds by convention, as most of
  `AGENTS.md` does.
- Raising the `AGENTS.md` line ceiling.
- Master's push cadence.

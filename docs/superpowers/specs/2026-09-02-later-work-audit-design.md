# Later-work audit: validate, close, rewrite, rank

- Date: 2026-09-04
- Status: awaiting review, pre-plan
- Worktree: `.worktrees/2026-09-02-later-work-audit`
- Branch / slug: `2026-09-02-later-work-audit`
- Base: master at `a1b2b6ae`
- Ships: a rewritten `TODO.md` `## Later work` — Closes
  removed, Rewrites corrected, remaining bullets ordered
  by doctrine-benefit / cost
- Leaves: Critical path, Sequencing, Close protocol,
  product code, new tests, the Unpinned nested pins as
  independent ranks
- Does not ship any Later-work item except the list

The slug stays `2026-09-02-later-work-audit` even though
the calendar has moved. It names the branch, the
worktree directory, the plan, and this spec.

## Problem

`TODO.md` `## Later work` holds 54 top-level bullets
and 143 nested ones. Nested bullets belong to their
parent; Unpinned's catalog is one item, not 143 ranks.
The last sweep that read Later work against the tree
was 2026-09-01 (`2026-09-01-small-items-sweep-design.md`).
Commits have landed since. A backlog that misdescribes
itself is read less, and read less it grows.

The operator asked for a plan that validates each
top-level item against the code, then sorts what
remains by cost/benefit. This spec is that plan's
covenant. Execution is a later choice.

## Goals

- Validate each of the 54 top-level bullets against
  the tree at execution. Nested bullets ride their
  parent.
- Three verdicts: Hold, Rewrite, Close.
- Rewrite `## Later work`: drop Closes via Close
  protocol, replace Rewrite text, keep Hold text
  (including drifted line numbers), sort Hold +
  Rewrite by doctrine-benefit / cost.
- This cycle writes the spec and the plan. Execution
  (the reading pass, the ranking, the `TODO.md`
  commit) waits until the operator picks a runner.

## Non-goals

- Shipping any Later-work item except the list rewrite
- Ranking or closing Unpinned nested pins on their own
- Line-number-only edits on Hold items (they drift
  again)
- Touching Critical path, Sequencing, or Close
  protocol, except a named ARCHITECTURE.md KNOWN-seam
  deletion a Close sheet requires
- Product code, new tests, or a `./validate` parser
  for the list
- Re-running the walk, adding pins, or renaming the
  slug

## Locked choices

1. **Top-level only.** 54 items. Nested bullets are
   evidence and Rewrite fodder for their parent.
2. **Three verdicts, then rewrite Later work.** Hold,
   Rewrite, Close. Then one new `## Later work` body.
3. **Clustered explorers, then one ranking pass.**
   Eight parallel Medium-Church subagents, one cluster
   each. Master (Full Church) scores and rewrites.
   Master does not re-read every oracle unless a sheet
   is thin or two sheets collide.
4. **Ratio of doctrine benefit to cost.** Reliability
   and Security first, then Clarity. Cost is commits
   until Close, plus whether a design call is required.
5. **One execution commit.** Closes, rewrites, and
   rank ride together. Comment and KNOWN-seam
   deletions ride that commit when a Close sheet names
   them.
6. **Explorers do not rank and do not edit `TODO.md`.**
   They return sheets. Master ranks from the sheets.

## Architecture

Two phases.

1. **Explore.** Parallel Medium-Church subagents, one
   per cluster. Each returns a verdict sheet: item,
   verdict, the code actually read, one-line reason,
   and a suggested Rewrite sentence (full bullet)
   when the verdict is Rewrite.
2. **Rank and rewrite.** Master scores benefit
   (Security, Reliability, then Clarity) over cost
   (commits until Close, plus whether a design call
   is required), then rewrites `## Later work` in one
   docs commit.

Subagents work in this worktree and never create
their own — never pass the Agent tool `isolation`.
Every subagent prompt begins with the literal phrase
`Go to Medium Church!`, then pushes down the
codebase patterns named in the plan.

## The clusters

Numbers are the 54 top-level bullets in current
`TODO.md` order at `a1b2b6ae`. Identity is the
bullet's first line. Explorers quote that line on
the sheet.

### 1. Walk and driving (8)

1. A full TEST-PLAN.md walk using serial subagents
2. 2026-09-02 walk F23/AA32: compositor cannot hold
3. 2026-09-02 walk AA33/AA34: DEFERRED on AA32 stray
4. 2026-09-02 walk F37b: re-activate tab A after F37a
5. 2026-09-02 walk R12: driver (panel never opened)
6. 2026-09-02 walk F26/F28/F14: compositor mis-hit
7. 2026-09-02 second walk AA9/WB11: Layer 2
45. The first click after a page reload only focuses
    the window

Shared: TEST-PLAN.md Driving notes and the Layer 2
canvas pins.

### 2. Identity, auth, billing (12)

10. Profile as its own document
11. Roster rows carry a fabricated empty profile
12. `DEFAULT_DIM` stands in for an assessment that
    never happened
13. The re-mint refresh is not single-flighted
15. The cross-party delegation ledger
16. Passkey, provider-IdP, and corporate-OIDC
    ceremonies
17. Per-client multi-audience, DPoP `cnf`, jti reuse
18. SP-6 sign-up
19. Billing
20. Invitation email delivery
46. ACL-editing UI for record attributes
47. Member-removal affordance under
    members/identities

### 3. Canvas, flow, workbox (5)

21. Attribute drag-reorder (TEST-PLAN R8)
27. A panel rename whose target is deleted during
    the 800 ms debounce
28. A flow loaded with Auto Fit OFF no longer fits
    on first paint
31. Claim-on-load with no release-on-leave
32. Intermittent "flow-marquee" console exceptions
    on non-canvas pages

### 4. Message plane (4)

24. A replay is indistinguishable from a creation
25. A shared test operation id can produce false
    greens
26. Absence and emptiness are conflated in
    attribute ACL derivation
30. Cryptographically verifiable ledger

### 5. Pub-sub and clocks (4)

33. A re-init failure degrades weaker than a
    first-boot one
34. `subscribeOnce` guarantees "never two" live
    subscriptions
35. Objective lifecycle history compares two clocks
37. `subscribeOnce`'s `const unsubscribe = subscribe(...)`

### 6. Type universe and Deno (12)

14. `./measure` harvests error-page timings
38. Node-only modules by directory
39. A DOM-free server universe
40. The browser tsconfig at `web-app/app/`
41. GPU flag in the Layer 2 launcher
48. The browser type fence is gone, not weakened
49. The `exists()` helper is duplicated five times
50. `./measure --record` writes the literal
    `'unknown'` as `cpuModel`
51. `JWT_HMAC_SIGNING_KEY` may not belong in the
    local seed/wipe `--allow-env`
52. Nothing asserts that the operator wrappers exec
    `deno`
53. A pure-TypeScript scrypt would retire the last
    product-process `node:` import
54. Spec 6 did not run — replacing `npm:postgres@3.4.9`

### 7. TEST-PLAN pin catalog (4)

23. The run-four remediation's remaining seams
36. Untested by design after run-six
42. Unpinned but pinnable
43. The gap list above is the 2026-08-29 audit
    catalogs' output

Unpinned's 143 nested pins are evidence for that one
verdict, not 143 ranks. Nested pins that are now
pinned are struck inside a Rewrite of item 42. Nested
pins that remain are not ranked.

### 8. Small UX and comments (5)

8. Toast pause on hover and focus
9. Mock seed's fixed 2026-06-15 anchor
22. Idea-create toasts an incomplete submit; convert
    still sets `btn.disabled`
29. Stale-history comment cleanup as one pass
44. The Send Back feedback textarea is discarded

Eight parallel explorers. 8 + 12 + 5 + 4 + 4 + 12 +
4 + 5 = 54.

## Verdict sheet

Each explorer returns one markdown sheet covering
every item in its cluster and no others. Master ranks
from these sheets; it does not re-open every file
unless a sheet is thin or two sheets collide.

Per item:

```
## Item N: "<first line, quoted>"
- Verdict: Hold | Rewrite | Close
- Read: files and symbols actually opened
- Evidence: what the tree does now versus what the
  bullet claims (one or two sentences)
- Reason: one line
```

If Rewrite, also:

```
- Rewrite: the replacement bullet, full text, nested
  sub-bullets included when they still belong
```

If Close, also:

```
- Why: shipped | absorbed into Critical path |
  premise gone
- Close extras: named comment at file:line and/or
  ARCHITECTURE.md KNOWN seam — only when they apply
```

If Hold or Rewrite, also (facts for ranking, not a
score):

```
- Bite: Security | Reliability | Clarity | none
- Commits: 1 | 2–3 | 4+
- Design call: yes | no
```

Rules for explorers:

- Quote the first line. Do not paraphrase the
  identity.
- Read the files and symbols. Do not copy the
  bullet's line numbers forward as evidence.
- A Hold does not "fix" drifted line numbers.
- Explorers do not rank. Explorers do not edit
  `TODO.md`.
- Unpinned: one verdict for the catalog. Do not emit
  143 separate verdicts.
- If the cited path is gone, say "oracle gone". Do
  not guess a new home. Master decides Close
  (premise gone) versus Rewrite (gap moved).

## Ranking

Who ranks: master only. Explorer facts are inputs.
If two sheets collide, master re-reads those oracles
and records the resolution in the plan's task
checkboxes, not as a second list.

Benefit (numerator), highest first:

1. Security (II)
2. Reliability (I)
3. Clarity (V)
4. None of those three — features, ceremonies,
   tooling with no I/II/V bite

An item that bites two commandments takes the
higher. Unpinned as one catalog is Clarity: missing
pins, not a product hole.

Cost (denominator):

- Design call = expensive, regardless of commit
  count
- Then `4+` commits, then `2–3`, then `1`

Ratio: highest benefit per cost first. A one-commit
Reliability wiring beats a design-call Security
ceremony. A one-commit Clarity pin beats a
four-commit feature with no I/II/V bite. Equal
ratios: the earlier commandment wins; if still tied,
current `TODO.md` order.

What gets a slot: Hold and Rewrite only, scored on
the corrected claim. Close items leave; they are not
ranked.

Output: one ordered list that becomes the new
`## Later work` body. Sequencing bullets that still
apply stay under `## Sequencing`; they are not a
second rank. Master writes a one-line ratio note per
remaining bullet into the plan's task checkboxes
during execution — not into `TODO.md`, and not as a
second committed list.

## Rewrite and commits

What changes: only `TODO.md` `## Later work`, plus
Close-protocol extras the sheets name (a comment at
`file:line`, an ARCHITECTURE.md KNOWN seam). Critical
path, Sequencing, and Close protocol stay unless a
Close was absorbed into Critical path and that
Merged clause is now the living claim — then strike
the Later-work bullet only; do not rewrite Critical
path in this cycle.

Close: remove the bullet. If the sheet names a
comment or a KNOWN seam, remove those in the same
commit. Do not invent extras the sheet did not name.

Rewrite: replace the bullet with the explorer's full
replacement text, after master checks it against the
tree. Nested sub-bullets stay under that parent.

Hold: keep the text. Do not chase line numbers.

Order: Closed bullets gone. Remaining bullets in
rubric order, highest ratio first. The heading
`## Later work` and the intro line ("Off the
critical path; each with its oracle.") stay.

This cycle's commits, on branch
`2026-09-02-later-work-audit`:

1. Spec (this file)
2. Plan
3. Execution: one docs commit — the new
   `## Later work` (closes, rewrites, rank). Comment
   and KNOWN-seam deletions ride this commit when a
   Close sheet names them.

No product code. No new tests. `./validate` green
before each commit. SHA skip is not a pass after the
rewrite; run it.

## Failure handling

Thin or contradictory sheets: master re-reads only
those oracles. If an explorer skipped a bullet,
master fills that row before ranking. No silent Hold.

Missing oracle: if the cited path is gone and the
gap is gone with it, that is Close (premise gone).
If the path is gone but the gap moved, that is
Rewrite. Explorers do not guess a new home; they say
"oracle gone" and master decides.

Unpinned: one verdict for the catalog. Nested pins
that are now pinned are struck inside that Rewrite.
Nested pins that remain are not ranked.

## Verification

Docs-only. Before the execution commit:

- Every one of the 54 first-lines appears on exactly
  one sheet
- Close count + remaining count = 54
- Remaining order matches the rubric (one-line ratio
  note per remaining bullet in the execution notes)
- `./validate` green
- No Critical path / Sequencing / Close protocol
  drift unless a named KNOWN-seam Close requires the
  ARCHITECTURE.md edit

## Out of scope at execution

Shipping a Later-work item. Adding pins. Re-running
the walk. Renaming the slug.

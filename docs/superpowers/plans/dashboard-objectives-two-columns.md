# Dashboard Objectives two columns Implementation Plan

**Goal:** On `dashboard/index.html`, widen the Objectives
box from one gauge column to two, so its right edge sits
directly under the Cost card's right edge.

**Architecture:** The gauge grid is
`repeat(3, 1fr)` with a `--space-6` gap. One column is
`(100% - 2 * gap) / 3`; two columns span one gap between
them, so the box is two column widths plus one gap. The
width rule's parent, `#objective-aggregates-card`, is a
block sibling of `.gauge-grid` inside `.workspace`, so
`100%` is the grid's width and the left edges already
align. Under 768px the grid collapses to one column and
the box stays `width: auto`; that rule is untouched.

**Spec:** the owner's request in session; no design
doc — a one-rule layout change.

## Execution ground

- Worktree:
  `/Users/tmornini/code/fusion-angle/.worktrees/dashboard-objectives-two-columns`,
  branch `dashboard-objectives-two-columns`, cut from
  `next-release`.

## Task 1 — two-column width (one commit)

The C4 / K27 covenant pins the width as a CSS string in
`tests/objectives-card-width.test.ts`. The covenant
changes, so the pin changes with it in the same commit.

- [ ] Rename the pin to `'the Objectives card is two gauge
  columns wide'` and expect
  `calc((100% - 2 * var(--space-6)) / 3 * 2`
  `+ var(--space-6));`. Run it: red.
- [ ] In `web-app/app/styles/components-metrics.css`, set
  `.objective-aggregates-card` to that width and reword its
  comment to two columns plus the gap between them.
- [ ] `./test validate`: green.
- [ ] Commit `Widen the Objectives card to two columns`.

## Task 2 — TEST-PLAN copy (one commit)

- [ ] C4: "one gauge column wide" becomes "two gauge
  columns wide, its right edge under Cost's", with the new
  `calc(…)` and the renamed pin.
- [ ] K27: same wording and pin name.
- [ ] Commit `Describe the two-column Objectives box`.

## Task 3 — operator check

- [ ] `./deploy --local 8081 --postgres mock-data`
  (8080 is master's), sign in as `demo@example.com`, and
  open `/dashboard/index.html`. The Objectives box's right
  edge lines up with the Cost card's at desktop widths;
  under 768px it is full width.

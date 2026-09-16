# Apple-menu clicks during the TEST-PLAN walk

- Date: 2026-09-16
- Status: approved for planning
- Worktree: `.worktrees/2026-09-16-apple-menu`
- Base: master at `750c39b0`
- Parent: `05961bc2` (Keep TEST-PLAN focusing
  clicks off the Apple menu)
- Ships: TEST-PLAN names every case whose
  driven click can hit the macOS Apple menu;
  a Layer 1 pin keeps those selectors in the
  document
- Leaves: product layout; a Layer 2 test of
  the first post-reload click (TODO.md)

## Problem

While walking TEST-PLAN.md the macOS About
This Mac sheet opens. `05961bc2` already
named the focusing click after a reload:
top-left of a fullscreen or flush Chrome
window is the Apple menu; the next click
lands on About This Mac, the menu's first
item.

That note covers only the post-reload
focusing click. The walk still *drives*
clicks onto the same screen corner:

| Case | Control | Why it hits |
|---|---|---|
| I7, I9, I28 | `#sidebar-toggle` | the brand *is* collapse/expand, top-left of the sidebar |
| I11, I14, I15 | `#mobile-sidebar-open` | hamburger, top-left of `.mobile-header` |
| B2, B3 | `.navbar-logo` / `#mobile-menu-toggle` | landing chrome at `top: 0; left: 0` if clicked instead of the CTA |
| C5 | `#sidebar-toggle` if taken as home | the brand is not a nav link |

browser-use clicks by screenshot pixel
(`click_at_xy`). The Apple logo and the
product brand share that corner. A
screenshot-xy click there opens the Apple
menu even when the explorer meant the
product control.

## Decisions

1. **No product change.** The overlap is OS
   chrome over a flush or fullscreen window,
   not a layout defect. The three-layers
   spec already sent the first-click-focus
   seam to TODO.md, not to code.
2. **One driving note, cases name it.**
   Broaden the existing note: never click
   the Apple menu; confirm `windowState`
   `normal` and `top` ≥ 80; drive the
   named controls by selector (CDP
   box-model, element center), never
   `click_at_xy` on the screenshot corner.
   The brand is collapse, not home.
3. **Each case above names its selector**
   so a walker who skips the preamble still
   does not click the Apple logo.
4. **Layer 1 pin.** A test reads
   TEST-PLAN.md and asserts those case ids
   still name `#sidebar-toggle` or
   `#mobile-sidebar-open`. No Layer 2
   "About This Mac did not open" test —
   that is OS chrome, not the product.

## File map

| File | Change |
|---|---|
| `TEST-PLAN.md` | setup confirm; driving note; per-case selectors |
| `TODO.md` | the existing first-click item lists the cases |
| `tests/test-plan-apple-menu.test.ts` | Layer 1 pin |

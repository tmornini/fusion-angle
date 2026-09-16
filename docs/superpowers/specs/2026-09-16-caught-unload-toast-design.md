# Caught unload toast — design

- Date: 2026-09-16
- Status: approved for planning
- Worktree:
  `.worktrees/2026-09-16-caught-unload-toast`
- Base: master at `938b8c46`
- Parent:
  `docs/superpowers/specs/2026-09-14-false-failure-navigation-toast-design.md`
- Ships: `reportFault` consults `shouldSurfaceFault`
  with the pagehide latch; Layer 1 pins; Layer 2
  WB11 pin goes green
- Leaves: wrapping every `() => void refresh()`
  subscriber; identities' extra refresh; parsing
  the "Failed to fetch" string

## Problem

WB11's Layer 2 pin
(`tests/browser/workbox-transition.test.ts`
'bind, fill, and submit navigates to the inbox
(WB11)') is red. Submit POSTs, toasts
**Transition complete**, and `navigateTo`s the
inbox. The same-tab notify starts
`refreshDetail`. Navigation aborts that GET as
`TypeError: Failed to fetch`. `refreshDetail`
**catches** it and `reportFault`s. `showToast`
overwrites the pending success payload.
Inbox replay paints
"Work order detail refresh failed: Failed to
fetch". The pin waits for **Transition
complete**.

The 2026-09-14 spec already named this class:
a navigation abort is not a fault. Its
Decision 1 gated the **global**
`error` / `unhandledrejection` floor. A
caught `reportFault` bypasses that floor.
The plan left "wrapping every
`() => void refresh()` subscriber". The
caught path is the hole, not the subscribe
shape.

Reproduced: dump at inbox pathname and at
`page:ready` showed
`toasts: ["Work order detail refresh failed:
Failed to fetch×"]` and `pending: null`.

## Decisions

1. **`reportFault` uses the same predicate as
   the global floor.** If
   `shouldSurfaceFault(err, pageUnloading)` is
   false, return without log or toast. Abort
   and post-`pagehide` faults stay teardown.
   A live `Failed to fetch` still surfaces.
   Do not parse that string.
2. **Hoist the pagehide latch to module
   scope.** `initErrorSurfacing` already
   latches `pagehide` / `pageshow` in a
   closure the caught path cannot see. One
   module flag, both the floor and
   `reportFault` read it. Production boots
   once; tests `pageshow` in `finally`.
3. **Do not change `persistPending`,
   `refreshDetail`'s subscribe, or the
   transition navigate.** Not toasting the
   abort leaves **Transition complete** in
   sessionStorage. Wrapping each subscriber
   is N sites for one covenant.
4. **Pins.** Layer 1: `reportFault` after
   `pagehide` with `TypeError('Failed to
   fetch')` paints no toast; the same fault
   while live does. Layer 2: the existing
   WB11 pin. A product commit may cite
   `docs/superpowers/test-plan-mitigations/2026-09-16-AT-AT5.md`.

## File map

| File | Change |
|---|---|
| `web-app/app/error-helpers.ts` | Module latch; `reportFault` consults it |
| `tests/error-helpers.test.ts` | Layer 1 pins |
| `TODO.md` | Drop the WB11 later-work bullet once Layer 2 is green |

## What this is not

The transition POST is fine. The inbox
navigation is the product. The pending-toast
mechanism is the product. The subscriber is
the product. The bug is toasting teardown
from a catch.

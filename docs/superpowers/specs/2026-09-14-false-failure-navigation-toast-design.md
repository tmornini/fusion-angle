# False-failure toast after a successful write

- Date: 2026-09-14
- Status: approved for planning
- Worktree:
  `.worktrees/2026-09-14-false-failure-navigation-toast`
- Base: master at `2b68e4c2`
- Ships: stay on Members after Add Member (human
  and AI); ignore aborted and unload-time faults
  in the global error floor; Layer 1 pin on the
  surfacing predicate; Layer 2 pin on AA5's live
  toast and roster append
- Leaves: the N+1 roster refresh; identities'
  extra `void refresh` after notify; wrapping
  every `() => void refresh()` subscriber;
  TEST-PLAN AA5's "Quality" department (not a
  select option); AA4's Kind-toggle pin (TODO.md
  already names it)

## Problem

AA5 (the walk called it AA4) creates a member
and toasts a generic failure — "The operation
was aborted." / "Failed to fetch" — while the
person appears in the seat-derived roster.

The three PUTs succeed. `postHumanMemberCreation`
then `notify()`s, which starts a fire-and-forget
`refresh()` (seats + PII + identity per human).
The page toasts **Member added**, closes the
dialog, and `navigateTo('members')` while already
on Members — a full `window.location.href` reload.

The reload aborts the in-flight fetches. The
global `unhandledrejection` handler toasts the
abort raw. `showToast` persists the last toast
into `sessionStorage`; the abort overwrites
**Member added**. Render boots the next page
slowly enough that replay shows the error.
Locally the race is tighter.

Identities already stays on the page: toast,
close dialog, let notify refresh the roster.
Members still reloads itself. AI create is the
same two lines. Member-detail Remove must leave
the page; its in-flight refresh is the same
abort class.

## Decisions

1. **A navigation abort is not a fault.**
   `AbortError` and any rejection after
   `pagehide` are teardown. The global error
   floor must not log or toast them. A live
   `Failed to fetch` (page still showing)
   still surfaces — that is a real network
   fault. Do not parse the "Failed to fetch"
   string.
2. **After a successful Add Member, stay.**
   Toast, close the dialog, do not
   `navigateTo('members')`. Notify already
   refreshes this tab. Do not add identities'
   extra `void refresh(ctx)` — that is a
   second GET of the same roster.
3. **Remove still navigates.** Leaving member
   detail is the right move. Decision 1 covers
   the aborted refresh. `reduceRefresh` already
   keeps current state when the seat is gone.
4. **Do not change `persistPending`.** Not
   toasting the abort leaves the success
   payload in `sessionStorage`. A persist
   filter would be a second mechanism for
   the same fact.
5. **Pins.** Layer 1 owns the surfacing
   predicate (`isAbortFault`,
   `shouldSurfaceFault`). Layer 2 owns AA5:
   success toast, no error toast, the page
   did not reload, Jordan Rivera is in the
   roster, the dialog is closed. The adapter
   write test stays; it never saw this bug.
6. **One worktree, two product commits.**
   Predicate first (defense, every page).
   Stay-on-Members second (source, AA5).
   TEST-PLAN AA5's toast pin moves onto the
   Layer 2 test in the second commit.

## What this is not

The writes are fine. Admin PII PUTs are
allowed. Reusing one `Operation-ID` across
the three PUTs is SCHEMA.md §9 grouping,
not a unique-constraint bug. The memory
adapter test is green because it never
navigates and never fetches.

## File map

| File | Change |
|---|---|
| `web-app/app/error-helpers.ts` | Predicate; `pagehide` latch; floor consults it |
| `tests/error-helpers.test.ts` | Layer 1 pin |
| `web-app/members/index.ts` | Drop both self-`navigateTo`s |
| `tests/browser/member-create.test.ts` | Layer 2 AA5 pin |
| `TEST-PLAN.md` | AA5 toast pin names the Layer 2 test |

## Close

TODO.md's AA4 bullet is the Kind toggle, not
this toast — leave it. No mitigation stub:
the Layer 2 test is the Reproduced-by.

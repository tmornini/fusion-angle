# Workbox claim-drag inbox

Branch and worktree `ui-refinement`.

## Intent

`workbox/index.html` is a personal inbox of two cards.
Unclaimed work sits on the left. This member's live
claims sit on the right. Dragging a row from one card
to the other claims or releases it. Clicking a row
opens the action screen and does not claim.

## Decisions

- Headlines: **Work Orders available to me** and
  **Work Orders claimed by me**.
- Two cards always. No page subtitle.
- Pills **Active** | **Archived by Me** sit on the
  right card. They switch that card's list. The left
  card does not change with the pills.
- Available-to-me is the org pool: every unclaimed or
  released active work order, any node. Assigned-pool
  (current node lists this user) is TODO.md item 11a.
- Someone else's live claim is omitted. Someone else's
  archived work is omitted.
- Available-to-me sorts by last-transition age, oldest
  at the top (`workOrder.transition.at` ascending).
- Claimed-by-me Active is Custom: `position` among this
  member's claimed rows.
- Archived by Me is work this member last transitioned
  onto an `isArchive` node, most recently archived
  first (`transition.at` descending).
- Claim and release are drag-and-drop only. No Claim
  button. No Release button.
- Bind is gone from the action screen. Bind-at-creation
  is later work on the Critical functionality path.
- Opening never claims. Create still navigates to the
  action screen; the new work order is unclaimed, so
  that screen is the unclaimed view.
- Approach B: `drag-reorder` (and
  `drag-reorder-positions`) keep Custom order.
  A transfer helper owns cross-card claim and release.
  The page coordinates which drop is which.

## Non-goals

- Filtering available-to-me by node `memberIds` (11a).
- Binding a record instance at create, or anywhere on
  the action screen.
- A third column for other members' live claims.
- A Priority / Custom toggle.
- Changing claim HTTP (409, If-Match, lapse).
- Keyboard reordering or a non-pointer claim path.
- Putting the right-card pill in a shareable URL
  beyond the existing hash (`#active` / `#archived`).

## Layout

Page title `Workbox`. Create Work Order stays in the
header, same dropdown as today.

Two `.card` columns in one grid. Below `768px` they
stack, available-to-me first. Tokens and classes from
DESIGN-SYSTEM.md. No inline styles.

Left card: `h2` **Work Orders available to me**, then
the list (or empty copy).

Right card: `h2` **Work Orders claimed by me**, pills
to its right in the card header, then the list (or
empty copy). Active is the default. Hash `#archived`
selects Archived by Me. The user-facing word is the
past participle: Archived, never Archive, on this page
(tab data, empty copy, TEST-PLAN names).

Empty copy:

- available-to-me: `No work orders available to me`
- claimed-by-me Active: `No work orders claimed by me`
- Archived by Me: `No work orders archived by me`

## Lists

`buildInboxItems` takes the current member id and
returns three arrays: available, claimed, archived-by-me.
The presenter renders one list. The page calls it for
the left card (available) and the right card (claimed
or archived-by-me). One work order appears in at most
one list.

- **available:** no live claim, current node is not
  `isArchive` (unplaced counts as available).
- **claimed:** live claim whose `memberId` is this
  member, current node is not `isArchive`.
- **archived-by-me:** current node `isArchive`, and
  `workOrder.transition.memberId` is this member.

A live claim is `isClaimedAndUnlapsed` on the head,
the same clock the inbox uses today.

A live claim by another member is in none of the three.
An archived work order whose last transitioner is
another member is in none of the three.

Available-to-me does not show a claimant. Claimed-by-me
does not show "claimed by you" on every row. Row chrome
stays flow name, display id, state (or State unknown),
relative last-transition time.

## Drag

Each work order is in one card. The row is the drag
source. No grip handle on this page. A completed drag
suppresses the following click so it does not open. A
click without a drag opens `workbox-detail`.

A page coordinator (`web-app/app/workbox-inbox-drag.ts`)
captures the pointer. On drop it classifies:

- Source available, destination claimed-by-me Active:
  `putWorkOrderClaim`, then `putWorkOrderPosition` so
  the row lands at the drop index among this member's
  claimed rows.
- Source claimed-by-me Active, destination available:
  `deleteWorkOrderClaim`. Available-to-me ignores drop
  Y and re-slots by `transition.at`.
- Source claimed-by-me Active, destination claimed-by-me
  Active: `putWorkOrderPosition` via the existing
  position helper, neighbors from this member's claimed
  rows only.
- Source available, destination available: no request.
- Any drop onto Archived by Me, or any drop while that
  pill is selected: no request. The row stays.

Optimistic paint, then the request. Failure reloads the
lists and the row returns to its source.

## Action screen

`workbox/detail.ts` does not call `putWorkOrderClaim`
on load.

No Claim button. No Release button (`#unclaim-btn`
goes). No Bind instance button. No bind dialog. No
copy that tells the user to bind. A bound instance may
still identify the record the fields belong to.

Unclaimed (and lapsed): identity, current node, history.
Fields shown with their values, `disabled`. Transition
buttons shown, `disabled`. To work it, the user returns
to Workbox and drags onto claimed-by-me.

Claimed by this member: fields and transitions work as
today, minus bind and release.

Archived: the completed read-only view, as today.

## Errors

409 on claim: another member holds it. Toast. The row
is in neither of this member's cards after reload.

Failed release or position: toast in the same style as
today's `Couldn't save the new order`. The row returns
to claimed-by-me.

Network or 412: reload, toast, row returns to source.

## Docs

`ARCHITECTURE.md` Tenancy workbox paragraph currently
says the workbox shows every active and archived work
order. This page is personal. Rewrite that paragraph
for the inbox; keep all-see-all as item 11's processes
rewrite default, with 11a the assigned pool.

TEST-PLAN WB1–WB3, WB20–WB22, and any claim-on-open or
Archive-tab copy rewrite to this chrome. A product
commit may cite a mitigation stub only when
`Reproduced by` names a red test.

## Units

`buildInboxItems` (or a sibling splitter) lives in
`web-app/app/presenters/workbox-inbox.ts`. It needs the
current member id. Sort is per list, not one
`position` sort for the whole inbox.

```ts
type InboxListKind =
    | 'available'
    | 'claimed'
    | 'archivedByMe';
```

`WorkboxInboxPresenter` renders one list of rows. The
page supplies two list containers. Grip is gone.

`workbox-inbox-drag.ts` owns pointer capture, drop
classification, optimistic move, and the click
suppress. It calls `putWorkOrderClaim` /
`deleteWorkOrderClaim` / `putWorkOrderPosition`. It
does not know about bind or the action screen.

The coordinator calls `computeNewPosition` and
`dropIndex` from `drag-reorder-positions.ts`. Leave
`drag-reorder.ts` in place for any other caller. Do
not teach it claim verbs.

## Tests

Layer 1:

- Split: unclaimed active → available; this member's
  live claim → claimed; this member's archive
  transition → archived-by-me; another member's live
  claim omitted; another member's archive omitted;
  unplaced unclaimed → available.
- Sort: available by `transition.at` ascending; claimed
  by `position`; archived-by-me by `transition.at`
  descending.
- Presenter: two cards, pills on the right, headlines,
  empty copy, no grip, no page subtitle.
- Drag classifier: the five drop cases above.
- Action screen: no claim-on-load; no bind button or
  dialog; no release button; unclaimed fields disabled
  with values; unclaimed transitions disabled; claimed
  fields and transitions enabled.

Layer 2: existing workbox browser files follow the new
chrome (two cards, pills, no claim-on-open). Pin a
real drag only if the harness can drag; the verbs stay
under Layer 1 otherwise.

## Files

- `web-app/workbox/index.html`
- `web-app/workbox/index.ts`
- `web-app/workbox/detail.ts`
- `web-app/app/presenters/workbox-inbox.ts`
- `web-app/app/presenters/workbox-detail.ts`
- `web-app/app/workbox-inbox-drag.ts`
- `web-app/app/workbox-inbox-rows.ts`
- `web-app/app/styles/pages-workbox.css`
- `ARCHITECTURE.md`
- `TEST-PLAN.md`
- `tests/workbox-inbox.test.ts`
- `tests/presenter-workbox-inbox.test.ts`
- `tests/presenter-workbox-detail.test.ts`
- `tests/workbox-inbox-drag.test.ts`
- `tests/browser/workbox-*.test.ts` as needed

## Review

YAGNI: no assigned-pool, no bind-at-create, no third
column, no sort toggle, no grip, no new claim API.

Errors: 409, 412, network, and drops on Archived by Me
are specified. Optimistic paint then reload.

Scope: this inbox and the action-screen claim/bind/
release chrome. One plan. 11a and bind-at-creation stay
on TODO.md.

Consistency: Archived is the past participle everywhere
on this page. One work order, one card. Claim and
release are the same drag, opposite directions.

Commitment: the inbox is personal. Opening inspects.
Working requires a claim, and a claim is a drop onto
Work Orders claimed by me.

# Walk 62291ec findings hygiene

- Date: 2026-10-31
- Status: design confirmed by the owner section by
  section, pre-plan
- Worktree:
  `.worktrees/2026-10-31-browser-workbox-tests`
- Branch: `2026-10-31-browser-workbox-tests`
- HEAD at the walk: `62291ecf1` Bind a genesis
  instance before WB11 submit
- Walk artifacts: `/tmp/fusion-angle-walk-62291ecf.txt`,
  `/tmp/fusion-angle-walk-62291ecf-summary.md`
- Score: 400 cases — PASS 389 · FAIL 0 · BLOCKED 4 ·
  DEFERRED 5 · DRIFT 2
- Leaves: bind-at-creation (TODO.md Critical
  functionality path); a classed ideas-list drop
  indicator; a seeded bound Data Capture work order

## Intent

Findings hygiene for walk `62291ec`. FAIL is empty.
Layer 3 gates nothing. A browser observation changes
product only through a red test at Layer 1 or Layer 2.
No product files, no seed rows, no red test, no
mitigation stub.

This spec rewrites `TEST-PLAN.md` so the next walk
scores the same facts honestly, retires one stale
TODO.md bullet, and files later-work entries for every
desirable non-goal that is not already there.

## Problem

The walk of clean `62291ecf1` found no FAIL. Four
BLOCKED, five DEFERRED, two DRIFT. TEST-PLAN still
describes a landing, auth stats, a submit-time binding
PUT, and a bound Data Capture seed that the pins and
the mock seed do not have.

**D37.** D36 PASSed. Layer 1 already pins the 8px
hysteresis band
(`tests/drag-reorder.test.ts` `dropIndex respects
hysteresis when lastIdx === current slot` and `… when
lastIdx === next slot`). The explorer sent compositor
`pointermove`s every 4px across a neighbour midpoint.
`buildIndicator` in `web-app/app/drag-reorder.ts`
returns an unclassed inline `div`, so the live flip
was not queryable. Scoring already BLOCKs D36/D37 when
the compositor does not deliver the gesture.

**WB11 / WB16 / R14 / DEFERRED.** Create still
birth-claims and still posts an unbound work order
(`createWorkOrderFromFlow` → `postWorkOrderCreation`).
Bind chrome is gone (WB10a PASS). A value-bearing
transition while unbound is 400, not 409. The Layer 2
pin `tests/browser/workbox-transition.test.ts`
`'fill and submit navigates to the inbox (WB11)'`
binds a genesis instance via API first, then fills.
The live create path left the WO unbound; POST
`work-orders/:id/transition` answered 400 `work order
has no instance binding`; no PUT `…/binding`. WB16's
PASS line still expects that PUT on the submit-armed
log. `#gate0001` is unbound by design. Seeded bound
WO01 is already Archive. No seeded bound Data Capture
WO exists. WB19, WB19a, WB19b, WB14, WB15 DEFERred on
a bound Active WO from WB11–WB13.

**B1 / B5.** Unsigned landing stayed on
`landing/index.html`. Hero is “Fusion Angle” /
“Strategy-to-Change Engine”; no stalls, safety cards,
`#ai`, or `#pilot`. Pins already own that
(`tests/landing-hero.test.ts` `'landing hero states
the engine'`; `tests/landing-stay.test.ts` `'landing
does not shove to dashboard'` and `'landing has no ai
or pilot section'`; `tests/browser/landing.test.ts`
`'unsigned landing stays and signs in'`). Auth desktop
two-column layout PASSed in substance; stats paint
`0k+` Active Users, `0%` Dissatisfaction, `0+`
Integrations (`tests/auth-panel.test.ts` `'auth panel
speaks in the landing voice'`). TEST-PLAN B1 still
quotes “Fusion Angle is your Strategy-to-Change
Engine” plus stalls and safety cards. B5 still names
10K+ / 98% Satisfaction / 50+. TODO.md still lists
those invented stats as later work.

## Decisions

### D37 — driving note, keep BLOCKED

Leave D37's PASS line and Pin as they are. Do not add
a class in this spec.

Add a driving note under `### Driving notes`:

- D37: drive with two or more compositor
  `pointermove`s across a neighbour midpoint during a
  D36-style ideas-list drag. The drop indicator is an
  unclassed inline `div`; do not grind a class or a
  tighter step. If the live flip is not witnessed,
  BLOCKED naming the unclassed indicator. The two
  `dropIndex` pins decide the 8px band.

Workbox `.inbox-drop-indicator` is a different list.

### WB cluster — rewrite cases to match the pins

Create still birth-claims and still posts unbound.
Bind chrome is gone. The explorer does not `js()` PUT
`…/binding`; the bearer is memory-only.
Bind-at-creation stays on TODO.md.

**WB11.** PASS line and Pin stay: fill Company Name +
Contact Email, `submit` → Review, POST
`work-orders/:id/transition` 200, inbox, claimed-by-me
Active. Pin: `tests/browser/workbox-transition.test.ts`
`'fill and submit navigates to the inbox (WB11)'`.
Extend the WB11 driving note: that pin binds a genesis
instance via API first. Drive a bound claimed-by-me
Data Capture screen when one exists (seeded bound WO,
or create after bind-at-creation). A live unbound
create + fill + submit that 400s `work order has no
instance binding` is BLOCKED, naming unbound create
and no bind chrome. One attempt. Do not change the
Layer 2 test in this spec.

**WB16.** Same turn as WB11; keep the arming recipe
(CDP `Network` or `pagehide` copy on the action-screen
document before `submit`). Drop the submit-time
binding PUT from the exploratory PASS line. The live
half is the transition POST on that armed log. Layer 1
pins still decide the instance-shape body
(`targetState`, `instance_id`, `record_type_id`,
`set`/`clear` delta, `release`, `transitionAt` — no
`fieldValues` bag) and strong `If-Match`. A missing
200 because the WO is unbound is BLOCKED, same reason
as WB11. A `getEntries()` on the inbox document is
still not this case. Keep the existing Layer 1 pins
(`tests/api-work-order-binding.test.ts`,
`tests/api-work-order-transition-instance.test.ts`).

**R14.** Keep: `#gate0001` is unbound; no
action-screen picker; unbound value-bearing transition
is 400, not 409; 409 is rebind; create birth-claims
and does not bind. Add: no seeded bound Data Capture
work order exists; seeded bound WO01 is already
Archive. Drive a bound claimed-by-me Data Capture
screen only when one exists. If none exists, BLOCKED
naming that. Do not invent bind chrome.

**DEFERRED.** WB19, WB19a, WB19b, WB14, WB15 stay
DEFERRED on WB11 until a bound Active WO exists from
WB11–WB13: bind-at-creation, or the seeded bound Data
Capture WO. Their PASS lines stay.

**Scoring.** Add a walk-specific line: a live WB11 or
WB16 400 for no instance binding is BLOCKED, not FAIL,
while those pins are green.

### B1 / B5 — document matches the pins

**B1.** PASS: unsigned `landing/index.html` stays.
Hero is two lines, “Fusion Angle” then
“Strategy-to-Change Engine”, no “is your”. No stalls
paragraph, no three safety cards, no `#ai`, no
`#pilot`. Wait ~3 seconds; still on
`landing/index.html`. Pins: keep the three stay / no
ai-or-pilot pins; add `tests/landing-hero.test.ts`
`'landing hero states the engine'`.

**B5.** PASS: desktop (≥1024px) two-column branding +
form. Left panel stats are `0k+` Active Users, `0%`
Dissatisfaction, `0+` Integrations. Pin:
`tests/auth-panel.test.ts` `'auth panel speaks in the
landing voice'` (the `0k+` / `0%` / `0+` /
`>Dissatisfaction<` assertions and the absence of
`10K+` / `98%` / `50+` / `>Satisfaction<`). The
two-column layout stays exploratory.

**TODO.md invented stats.** Remove the Critical
functionality path bullet that the auth left panel
shows invented stats (`10K+` Active Users, `98%`
Satisfaction, `50+` Integrations, citing
`web-app/auth/index.ts` and TEST-PLAN B5). Close
protocol: the pin already states the new truth. There
is no named product comment to strip;
`web-app/auth/index.ts` already paints `0k+` / `0%`
Dissatisfaction / `0+`.

Do not rewrite historical specs
(`docs/superpowers/specs/2026-09-16-landing-pilot-design.md`
and kin).

### Non-goals and TODO.md

Non-goals that are not desirable get no TODO entry:
mitigation stubs (FAIL is empty), historical spec
rewrites, landing or auth markup (pins already hold).

Non-goals that are desirable stay or land as later
work under `## Critical functionality path`, each with
an oracle.

**Bind the record instance at work order creation.**
Already filed. Keep it. Refresh the body so it matches
the product this walk saw: the action-screen Bind
instance control is gone (`WorkboxDetailPresenter` has
no `#bindButton`; WB10a PASS); create still posts
unbound; the Layer 2 WB11 pin's `bindGenesisInstance`
is a stopgap until this item; walk `62291ec` BLOCKED
WB11, WB16, and R14 on that unbound create. Oracle
stays: creating a work order requires the instance
when the flow names a record type; the action screen
has no bind control. Add: once create binds, drop
`bindGenesisInstance` from
`tests/browser/workbox-transition.test.ts`.
`#gate0001` stays unbound.

**Class the ideas-list drop indicator.** New. Walk
`62291ec` D37 BLOCKED: `buildIndicator`
(`web-app/app/drag-reorder.ts`) returns an unclassed
inline `div`; compositor 4px `pointermove`s could not
query a hysteresis flip. Workbox inbox already paints
`.inbox-drop-indicator`. Oracle: the `drag-reorder`
drop indicator has a class the walk can query (name
`.list-drop-indicator` unless a later brainstorm
picks another); a Layer 1 pin asserts that class; a
later walk can witness D37's live flip. This spec does
not add the class.

**Seed one bound Data Capture work order.** New.
Until bind-at-creation, live create is unbound, WO01
is Archive, and R14/WB11 have no seeded bound Data
Capture subject. Oracle: the mock seed includes one
bound Customer Onboarding work order at Data Capture
that a claim-drag (or a birth-claimed seed row) can
open; a later walk can fill Company Name + Contact
Email and submit; `#gate0001` stays unbound.
Bind-at-creation consumes the live-create half of
this item and does not remove `#gate0001`. This spec
does not seed the row.

## Files (later implementation)

- `TEST-PLAN.md` — D37 driving note; WB11 / WB16 /
  R14 driving notes and case text; Scoring line for
  live unbound 400 → BLOCKED; B1 and B5 PASS lines
  and pins.
- `TODO.md` — remove the invented-stats bullet;
  refresh the bind-at-creation bullet; add the
  classed drop-indicator bullet; add the seeded bound
  Data Capture bullet.

This session writes only this spec.

## Testing

No new Deno tests in the hygiene commits. After those
markdown commits: `./test validate`. Lint skips
`.md`. No `./test browser`, postgres, deploy, build,
measure, seed, or wipe.

Bind-at-creation, the classed indicator, and the seed
row each start with a red Layer 1 or Layer 2 test in
their own cycle.

## Sequence

1. This spec, committed on
   `2026-10-31-browser-workbox-tests`.
2. A plan, if the owner asks, under
   `docs/superpowers/plans/`.
3. Hygiene commits: `TEST-PLAN.md` then `TODO.md`,
   or one concern per commit as the plan splits them.
4. Bind-at-creation, the classed indicator, and the
   seed row remain later work. No land, rebase, merge,
   or force-push from this spec.

## Review

YAGNI: no product, no seed, no class, no mitigation
stub, no historical-spec rewrite.

Errors: a live unbound 400 is BLOCKED while the pins
are green, not FAIL.

Scope: TEST-PLAN hygiene, one TODO retirement, two
new later-work bullets, one refreshed later-work
bullet.

Consistency: WB10a (no bind chrome), the Layer 2 WB11
API-bind, R14's 400-not-409, landing-hero and
auth-panel pins.

Commitment: Layer 3 finds; Layers 1 and 2 prove.
FAIL empty means no product from this walk.

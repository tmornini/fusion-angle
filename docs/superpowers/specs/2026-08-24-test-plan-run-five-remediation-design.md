# Test-plan run five remediation: serial dual-pin

## Problem

The 2026-08-24 TEST-PLAN run (serial mode, A3
`--mock-data`) reported ten FAIL clusters and two
DRIFT candidates. Run four's remediation
(`2026-08-23-test-plan-run-four-remediation-design.md`)
shipped in full; every FAIL here is new. Seven
hunter stubs under
`docs/superpowers/test-plan-mitigations/` are
untracked. Master did not patch FAILs and did not
re-dispatch.

Each FAIL and DRIFT reduces to one mechanism,
verified in source unless noted:

1. **Serial AA mints a second garden on top of
   mock-data.** A3 is `--mock-data`. AA's preamble
   still allows a wipe to `--bootstrap` and then
   create-from-empty (TEST-PLAN.md `:497-505`).
   AA-Obj adds four objectives that already exist.
   AA14–AA17, AA20, AA24 count as if the tenant
   were empty. AA24 converts the one seeded
   `approved` idea. AA26 and E7 mint READY
   flows. AA6 adds identities. Later serial
   pins assume the A3 garden is still there.
2. **D16 has no Convert leftover.** Convert is
   `state === 'approved'` (`api/types.ts`
   `isConvertible`). The mock seed has one:
   Automated Report Generation
   (`WurwPqXxGtLhRAoCEcPzfQ`). AA24 promotes it
   before D runs. Convert appears only after D30
   Approve. The control itself is sound (list
   card and detail).
3. **F18 still says mid-height.** Run four shipped
   the column covenant: Create min x, Archive max
   x, Create heads its column, Archive ends its.
   The CLI pin
   (`tests/adapters-flow-queries.test.ts`) is
   inside the y-range, not both corners. TEST-PLAN
   F18 still says "On a fan (Layout Test) both sit
   mid-height." The hunter measured screenshot y
   (Create `y=-1095.5`, Archive `y=1031.5`).
4. **F2 case order and MCP probes.** WB4 READY
   grew by AA26 / E7 / extra Onboarding. WB5a
   restored the `submit` edge by canvas drag
   (Known-MCP: pair fixture). WB16 read the
   network log after a later navigation, so the
   transition POST was gone. WB19a/b ran after
   WB14 Archive.
5. **G document order consumes V subjects.** V8
   sits on Organization before V1. V4 Accept
   consumes invitation A. V5 Decline had nothing
   left (or the leftover V8 already revoked). V7
   used `javascript_tool` `fetch` (401: bearer is
   memory-only). G14 Add Member runs before G43,
   so the closed 6+5+1 roster is already open.
6. **K26 names slice ids on serial.** Serial In
   Review is three mock titles, impact-sorted:
   Workforce Capacity Forecasting, Predictive
   Maintenance System, Employee Training
   Assistant. The case still demands
   `k-project-under-review` /
   `k-project-under-review-2`.
7. **C4/C7 and R14 are stolen-tab, not missing
   product.** `formCExtras` scores the C slice.
   Serial C4 already dual-pins seeded scores. R
   `#r1` (`r-wo-capture`) is bound to
   `r-instance-1`; CLI
   `tests/slices-record-binding.test.ts` already
   fill-and-submits to Review (`05a4da62`,
   `0afbc206`). A chip that names another hunter's
   admin, 0/0/1 tiles, empty bind picker, or
   "work order has no instance binding" on that
   subject is the one selected page, not the
   derive.

Owner decisions taken in the brainstorm: serial
AA verifies the mock garden (does not recreate
it, does not wipe to `--bootstrap`); F18 follows
the CLI column pin (drop "mid-height"); C4/C7
and R14 are absorbed in this spec even though
this run did not FAIL them; no product change;
no new seed row.

## Goals

- TEST-PLAN true for both seeds: serial clauses
  verify the mock garden; parallel clauses still
  create-from-empty on slices.
- Named leftovers so a later case cannot consume
  the next case's subject: D16 Convert, V5
  Decline, V8 Revoke, WB19 Active WO, G43 roster
  snapshot, K26 In Review titles.
- Protocol that matches this MCP: no hand-`fetch`,
  pair fixture for graph repair, network log on
  the same load, one selected page, stolen-tab
  named as MCP.
- The tree free of the seven absorbed stubs.

## Non-goals

- Product changes: layout y, Data Capture
  mint+bind, painting grant/revoke 403 in the
  Invite dialog, dashboard derive.
- New seed rows. R14's instance and binding
  already shipped. C scores already ship.
- Corner placement or mid-height placement for
  Create and Archive.
- Re-running the browser plan. This spec prepares
  it; the run is `TODO.md` item 5.
- Editing dated specs and plans (`AUDIT.md`).
- New TEST-PLAN greps in `./validate`.

## Design

### 1. Serial AA verifies the mock garden

Delete the AA preamble that lets serial wipe to
`--bootstrap` (`TEST-PLAN.md`:497-505). Serial A3
`--mock-data` stands through J. Parallel AA stays
bootstrap-slice create-from-empty.

Serial does not mint garden rows: no Add Member,
no Add objective, no Create Idea, no Submit for
Review, no idea Approve, no Convert, no New
Flow (AA26 and E7). Dialog-open cases (AA4, E7
dialog visible) stay. Edits of a seeded subject
(AA9, AA10, AA13) stay. AA24a may approve one
seeded `submitted` project (not an idea, not a
K26 `under_review` title).

Serial vs parallel per case:

- **AA5–AA7a.** Serial: roster already holds
  the 10 humans and 4 AIs; do not Create.
  Parallel: Add them as today.
- **AA-Obj.** Serial: 4 active objectives,
  those four titles, that order; do not Add.
  Parallel: `+ Add objective` four times.
- **AA12.** Serial: open seeded "AI-Powered
  Customer Segmentation"; do not Create.
  Parallel: Create it.
- **AA14.** Serial: Ideas list shows the 11
  mock titles. Parallel: Create the 11.
- **AA15–AA16.** Serial: statuses already
  match the seed; do not Submit. Parallel:
  Submit those ideas.
- **AA17.** Serial: filter In Review, 7
  cards. Parallel: the 7 just submitted.
- **AA18–AA19.** Serial: an `in_review` idea
  shows Send Back / Approve; do not Approve.
  Parallel: Approve #1.
- **AA20.** Serial: 1 `approved` (Automated
  Report Generation), 7 `in_review`, 2
  `active`, 1 `sent_back`. (Today's "2
  approved" is false for the seed.) Parallel:
  Approve #4 as well; statuses match the AA
  walk.
- **AA21–AA24.** Serial: Convert visible on
  the seeded approved idea; do not Convert.
  Projects list is the seeded Stark list
  (~16). Parallel: convert the six as today.
- **AA24a.** Serial: score/approve a seeded
  `submitted` project that is not one of the
  three K26 `under_review` titles. Parallel:
  the first converted project as today.
- **AA25–AA26 and E7.** Serial: an approved
  project already has flows; New Flow dialog
  may open; do not Create. Parallel: New Flow
  as today.

AA26 and E7 are the WB4 extra-READY sources.
Serial must not create a flow.

### 2. D16 leftover Convert

D16 stays before D30. Serial subject: Automated
Report Generation (`WurwPqXxGtLhRAoCEcPzfQ`),
the one seeded `approved`. Convert is on the
list card (`data-idea-convert`) and on detail
(`#idea-convert-btn`). PASS: the control is
visible; clicking it navigates to
`ideas/convert.html`. That click does not
promote (D24 does). Parallel: a slice-garden
`approved` idea, same control.

D30 Approve produces a second `approved`. It is
not D16's subject.

### 3. F18 drop "mid-height"

No layout code change. TEST-PLAN F18
(`:1236-1250`): delete "On a fan (Layout Test)
both sit mid-height." The covenant remains:
Create heads the first column and Archive ends
the last; columns, not corners; Create min x,
Archive max x. Hunter measures laid-out node
positions on `svg.flow-canvas` (`data-node-id`
plus the node's x/y or transform) after the
second Auto Layout toggle, not screenshot y.
CLI pin unchanged.

### 4. F2 Workbox — READY, fixture, log, order

**WB4.** Serial READY stays exact: Customer
Onboarding and Lead-to-Close
(`tests/mock-flow-readiness.test.ts`). After §1,
AA26 and E7 do not mint a third. NOT READY
unchanged (Fusion Angle Flow, Layout Test).
Parallel: `WB Test Flow` in READY as today.

**WB5a.** Known-MCP: no port-drag. Remove the
Capture `submit` edge (serial: Data Capture
`submit`) via pair fixture, reload, assert NOT
READY "1 node needs attention". Restore the
same pair, reload, assert READY. PASS note
`verified via pair fixture`.

**WB16.** Immediately after WB11 (bind +
value-bearing transition). WB11 navigates to
the inbox; the transition POST is still in that
load's network log. Do not navigate again
before reading it. Assert binding PUT,
transition POST (instance shape), history GET.
WB17 is the navigate-away case.

**WB19 / WB19a / WB19b.** All three sit before
WB14 Archive. Subject: the bound Active WO from
WB11–WB13. WB14 archives it afterward. Skipping
because "WO already archived" is FAIL.

### 5. G / V — order, two grants, roster snapshot

Document order becomes the walk:

1. **V1** grant invitation A.
   Serial: `david.martinez@company.com`.
   Parallel: `g-unseated@test-plan.example`.
2. **V2** empty / unknown / already-member
   (does not consume A).
3. **V6** while A is still pending (org fence).
   It sits after V4 today and cannot pass.
4. **V3** bell as invitee A.
5. **V4** Accept A.
6. **V5** grant **B**, then Decline B as that
   invitee. Serial: `alex.kim@company.com`.
   Parallel: `r-member@test-plan.example`
   (seated in r-org, not G).
7. **V8** grant **C** if none pending, then
   Revoke C on Organization → Sent invitations.
   Serial: `mike.thompson@company.com`.
   Parallel: `sv-member@test-plan.example`.
   Move V8 off the Organization block (it sits
   before V1 today) to this position.
8. **V7** member grant/revoke 403; invitee
   read/accept/decline allowed. **V9** stays
   beside V7 (non-admin Sent-invitations stays
   hidden).

**V7 probe.** Sign in as the non-admin. Use the
Invite dialog. Read 403 from the network log.
Never `javascript_tool` `fetch`. Protocol
already forbids it; V7 names the observable.

**G43.** Relocate the case block to immediately
before G14 Add Member (after G13). Serial pin
stays exact: 6 named persons (Emily Rodriguez,
Sarah Chen, Lisa Wang, Marcus Johnson, Tony
Stark, Jessica Park), 5 "Identity without PII"
(David Martinez, Alex Kim, Mike Thompson,
David Kim, James), 1 service. After G14 the
roster grows; do not re-pin the closed count.
Parallel pin unchanged (global roster).

### 6. K26 serial titles, parallel slice ids

Filter In Review + sort Projected Impact
descending.

**Parallel:** `k-project-under-review` (high)
then `k-project-under-review-2` (low), as
today.

**Serial:** three seeded `under_review` mock
projects, high first: Workforce Capacity
Forecasting, Predictive Maintenance System,
Employee Training Assistant. Do not require
slice ids on serial.

K10 / K16 / K23 stay on their own subjects.
They must not archive or approve those three
titles.

### 7. C4 / C7 and R14 — Protocol, not product

**C4 / C7.** `formCExtras` already scores the C
slice. Serial C4 already dual-pins seeded
scores vs "a `—` Impact is a FAIL." This MCP:
one Chrome profile, one selected page. A chip
that names another hunter's admin, 0/0/1
tiles, or `data-empty` rows on C is stolen-tab
paint. Hunter: delete site data, sign in as
this slice's admin, wait ≥14s, assert C4/C7.
If the chip names another section's admin,
BLOCKED (MCP selected-page). Otherwise FAIL.
Do not treat parallel-MCP noise as a product
bug unless a serial C pin fails.

**R14.** CLI already greens fill+submit on
`#r1` (`r-wo-capture` bound to
`r-instance-1`). Serial subject `#gate0001`.
Parallel subject `#r1`. Bind picker "No
instances available" or toast "work order has
no instance binding" on that subject: same
stolen-tab rule as C. No mint+bind. No extra
seed row.

### 8. Protocol, absorb, commits

**TEST-PLAN Protocol** (same commit as the case
text it serves, or one Protocol commit if the
diff is cleaner):

- Never hand-`fetch` the API from
  `javascript_tool`; bearer is memory-only.
  V7 and WB16 read the network log.
- Graph repair (WB5a and the existing
  designer-gesture bullet) is pair fixture +
  reload.
- One selected page. After each hunter: delete
  site data. Stolen-tab rule as §7.
- Serial does not mint garden rows (AA and E7)
  and does not wipe to `--bootstrap`.

**Absorb** all seven files under
`docs/superpowers/test-plan-mitigations/`
(untracked). Protocol line stays: master does
not patch FAILs and does not re-dispatch.

**Tests.** No new product tests. Existing greens
stay green: `tests/mock-flow-readiness.test.ts`,
Layout Test column pin in
`tests/adapters-flow-queries.test.ts`,
`tests/slices-record-binding.test.ts` R14
fill+submit, C/K score extras, page-boot
`getDashboardGauges`. `./validate` after every
commit.

**Commits** (one concern each, present-tense
imperative, about fifty characters, rebase and
fast-forward, Co-Authored-By trailer):

1. This spec.
2. TEST-PLAN serial garden dual-pin (AA
   preamble, AA cases, E7).
3. D16 leftover + F18 drop mid-height.
4. F2 WB4 / WB5a / WB16 / WB19 order.
5. G/V order, V5 grant B, V8 grant C, G43
   before G14, K26 titles.
6. C4/C7 + R14 Protocol notes.
7. Absorb stubs.

The run-five plan, when written, stays
untracked and is removed when it ships.

## Testing

Every existing pin above stays green under
`./test` on memory in both TZ passes; none
needs Chrome or Postgres. No new red-first
product test: this spec changes TEST-PLAN and
deletes stubs.

- §1–§6: TEST-PLAN text. No CLI delta.
- §7: `tests/slices-record-binding.test.ts`
  and dashboard score tests green before and
  after.
- §8: the mitigations directory is empty;
  `./validate` green after every commit.

## Evidence

The seven 2026-08-24 mitigation stubs (absorbed
here, then deleted); hunter FAIL notes (D16,
F18, WB4, WB5a, WB16, WB19a/b, V5, V7, G43,
K26) and DRIFT (AA-Obj, AA14–AA17, AA20,
AA24); `isConvertible` (`api/types.ts`); mock
idea state events
(`api/mock-data/seed-message-pairs.ts`); mock
project titles (`api/mock-data/projects.ts`);
Layout Test CLI pin
(`tests/adapters-flow-queries.test.ts`);
`tests/mock-flow-readiness.test.ts`; V8 before
V1 in TEST-PLAN.md `:2067`; G14 before G43;
R14 bind+submit (`05a4da62`, `0afbc206`,
`tests/slices-record-binding.test.ts`); C4/C7
shelved diagnosis (`b0394cee`).

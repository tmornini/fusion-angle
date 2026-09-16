# 16 Sep walk FAIL mitigations — design

- Date: 2026-09-16
- Status: approved for planning
- Worktree:
  `.worktrees/2026-09-16-walk-fail-mitigations`
- Base: master at `fdd1100b`
- Stubs (frozen, never edited):
  `docs/superpowers/test-plan-mitigations/2026-09-16-D-D1.md`,
  `docs/superpowers/test-plan-mitigations/2026-09-16-F2-WB3.md`,
  `docs/superpowers/test-plan-mitigations/2026-09-16-G-G9.md`,
  `docs/superpowers/test-plan-mitigations/2026-09-16-K-K29.md`
- Ships: a ledger read of an organization's
  former seats; a `FormerMember` kind the name
  resolver paints as **Former member**; Layer 1
  and Layer 2 pins for D1, WB3, G9; Layer 1 and
  Layer 2 pins that decide K29
- Leaves: temporal name resolution (K7/K30's own
  covenant); PII for former members; the deferred
  cases (K1–K7, D2/D3/D18/D19/D25–D28/D33/D36/D37,
  WB15/WB21, G10/V7–V9), which the next walk
  re-runs

## Problem

Two independent findings from the 16 Sep walk.
None of the four stubs names a red test, so today
they are findings, not product commits. This
spec turns each into a red test first.

### The de-seated author cluster (D1, WB3, G9)

`memberName` (`web-app/app/adapters/members-union.ts`)
throws on an id the member map does not hold —
strict by design, and the seed's own comment says
why: strictness caught authors seeded outside the
org. The map is `getMembers` (live seats via
`organizations/:id/members/` plus `ai-agents/`)
plus the system member. A seat removal is a hard
ledger DELETE: `deriveDocumentsAt` drops a
DELETE-head document, so the removed identity
leaves the roster and the map at once.

What it authored does not leave. On the mock seed
Lisa Wang (`RPzLGrWcstxLaHoBcViPLQ`, a single-seat
Stark member) is the `member_id` on 2 idea
submissions, 300 work-order history rows, and 19
score rows. B28 removes her seat. Then:

- D1: `getIdeas` resolves each submission's
  `member_id` through `memberName` and throws —
  the list paints the error card, no idea cards.
- G9: `getOrganizationStats` calls `getIdeas` for
  the Ideas count — the same throw takes the
  whole organization page down (its GETs all
  200).
- WB3: `buildInboxItems` resolves each work
  order's last transitioner and claimant — the
  Archive tab paints the same error card.

Reproduced at the adapter layer on the seed:
`getIdeas` and `getOrganizationStats` both throw
`memberName: unknown member RPzLGrWcstxLaHoBcViPLQ`
after `deleteHumanMemberSeat`; `buildInboxItems`
throws the same for a work order created by a
member who then left. The K30 history modal and
the flow-stats page share the root.

The root is not the strictness. It is that the
map cannot tell "left" from "never existed" —
the ledger knows, and nothing reads it.

### The dashboard Objectives box (K29)

`buildObjectiveAggregates` paints, per objective,
the MEAN of each approved project's latest actual
(`latestPerPair`, then `meanOrUndefined`, which
rounds). The sparkline adds one point per distinct
actual timestamp. The walk saved −44 on Market
Sentiment Analyzer's Lower expenses slider and
looked for the box to move; it read −3 after one
second and after a reload.

Static reading finds the cross-tab bell wired:
`postProjectActualMeasurement` calls
`notifyProjectScoreChange`, whose subscription
channel posts a scoped event on the
`fusion-angle:data` BroadcastChannel; the
dashboard's `subscribeProjectScoreChanges` runs
`renderObjectiveAggregates`, which refetches. Both
halves of the bell already carry Layer 1 pins in
`tests/channels.test.ts` ('notify posts a scoped
event other tabs hear', 'a scoped event naming the
active organization fires'). What carries no pin:
that a new actual on an approved project moves the
aggregate, and that a Save in one same-jar tab
repaints the box in another without a reload.
"Still −3 after reload" points at the data path or
at the expectation (the box paints a mean over
nine projects, never the one score saved), not at
the bell. The tests decide; this spec does not.

## Decisions

1. **Former seats are a ledger read.**
   `GET organizations/:organization-id/former-members/`
   returns every seat at the organization's seats
   prefix whose head pair is a DELETE, as
   `{ id, organization_id, identity_id, at }`. `at`
   is the DELETE pair's own arrival time — the
   moment the seat ended — never the grant time.
   Derived in `api/derive-memberships.ts` beside
   the live seats, from the same
   `documentMessagePairsAt` + `latestByKey`
   primitives `deriveDocumentsAt` uses, keeping
   the DELETE heads it drops. A re-seated identity
   has a PUT head again and leaves the list. The
   path-organization fence in `api/api.ts` covers
   it like every `organizations/` route; the
   member tier (`api/authorization.ts`
   `MEMBER_VERBS`) gains a GET row, because every
   member's name resolver reads it — without the
   row a non-admin would 403 on every page that
   names an author. The generated API docs
   (`./bin/generate-api-documentation`) land with
   the route. This is a current-state derived
   collection of tombstone heads, org-nested — not
   the retired flat `members/:id/versions` history
   plane (ARCHITECTURE.md § Do not resurrect).
2. **`FormerMember` is a fourth `Member` kind.**
   `kind: 'former'`, `idForLink()`, `name()`
   returning `FORMER_MEMBER_NAME` (`Former
   member`), `matchesSearch()` false. It lives in
   `api/types.ts` beside the other three. Only
   `getMemberMap` unions it (one more read in the
   same `Promise.all` — it finishes beside the
   roster reads and costs the critical path
   nothing); `getMembers` and every roster stay
   live seats. No PII read: a removed identity's
   PII is not the organization's to paint, and the
   label is the honest degradation, exactly as
   `Member without PII` is for erasure.
3. **`memberName` stays strict.** An id the map
   does not hold is still a bug, and the existing
   pin ('memberName throws on missing id') stays.
   `memberName` needs no edit: its non-human branch
   already returns `member.name()`.
4. **Pins for the cluster.** Layer 1: the derive
   and its fence (`tests/api-organization-member-seat.test.ts`),
   the member-tier GET (`tests/api-member-tier.test.ts`),
   the root (`tests/adapters-members-union.test.ts`:
   a de-seated member names `Former member`, a
   re-seated one names again, neither is a roster
   row), D1 isolated and D1 on the seed
   (`tests/adapters-ideas.test.ts`), G9
   (`tests/adapters-admin.test.ts`), WB3
   (`tests/workbox-inbox.test.ts`). Layer 2: one new
   file, `tests/browser/former-member.test.ts`,
   removing Lisa Wang's seat through the API on the
   test origin and loading ideas, the workbox
   Archive tab, and the organization page. Every
   Layer 1 pin is watched red for
   `memberName: unknown member` before the product
   change.
5. **K29 is decided by tests, in two layers.**
   Layer 1 (`tests/adapters-project-scoring.test.ts`)
   mirrors the walk on the mock seed: baseline and
   approve Market Sentiment Analyzer (AA24a's
   shape), save −44 on Lower expenses, and assert
   the aggregate equals the recomputed mean over
   approved projects' latest actuals, moved from
   before, with the trendline's last point equal to
   it. Layer 2 (`tests/browser/dashboard-objectives.test.ts`)
   opens the dashboard, opens a second tab in the
   SAME browser context (`newPageIn(page.contextId)`
   — the same cookie jar), saves an actual on a
   seeded approved project, and waits for the
   Lower expenses row to gain one sparkline dot
   with no navigation. Red at either layer is a
   product bug fixed in that task behind that red
   test. Green at both means the walk's FAIL was an
   expectation artifact, and the K29 case text
   gains the sentence that names the mean.
6. **Docs.** ARCHITECTURE.md § Identity, seats,
   invitations names the former-seats read. TEST-PLAN
   K29's Pin line names the two new tests, and the
   `TODO.md` "Unpinned but pinnable" bullet for
   `subscribeProjectScoreChanges` /
   `notifyProjectScoreChange` goes once the Layer 2
   test lands. The dated stubs stay frozen; product
   commits cite the red tests by name.

## File map

| File | Change |
|---|---|
| `api/types.ts` | `FormerSeatEntity`; `FormerMember`, `FORMER_MEMBER_NAME`, `isFormerMember`; `Member` union |
| `api/derive-memberships.ts` | `deriveOrganizationFormerSeats`; generic `byAtThenIdAscending` |
| `api/family-registry.ts` | `ORGANIZATION_FORMER_MEMBERS_COLLECTION_PATTERN` |
| `api/routes.ts` | the former-members GET route |
| `api/authorization.ts` | member-tier GET row |
| `web-app/api-documentation/` | regenerated |
| `web-app/app/adapters/members-union.ts` | `getFormerMembers`; `getMemberMap` union |
| `tests/api-organization-member-seat.test.ts` | derive, removal, re-seat, foreign 403 |
| `tests/api-member-tier.test.ts` | member GET 200 |
| `tests/adapters-members-union.test.ts` | root pin |
| `tests/adapters-ideas.test.ts` | D1 isolated, D1 on the seed |
| `tests/adapters-admin.test.ts` | G9 |
| `tests/workbox-inbox.test.ts` | WB3 |
| `tests/browser/former-member.test.ts` | D1, WB3, G9 at Layer 2 |
| `tests/adapters-project-scoring.test.ts` | K29 data path |
| `tests/browser/dashboard-objectives.test.ts` | K29 two tabs |
| `ARCHITECTURE.md` | former seats sentence |
| `TEST-PLAN.md` | K29 Pin line and the mean |
| `TODO.md` | drop the K29 bullet |

## What this is not

The strict resolver is the product. The live
roster is the product. The hard DELETE is the
product. The bug is a map that forgets what the
ledger remembers. Temporal names (K7/K30) are a
separate covenant. Painting a former member's
name would be a PII decision this spec does not
make. Nothing here touches the deferred cases;
they re-run at the next walk.

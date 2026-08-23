# Test-plan run three remediation: re-mint, subjects, one voice

## Problem

The 2026-08-23 TEST-PLAN run (build `cc052c82`, parallel
mode, slice seed, fourteen hunters one at a time on one
Chrome profile) reported AT green, 345 browser PASS, 5
FAIL, 49 BLOCKED, 3 DRIFT. Run two's remediation
(`2026-08-22-test-plan-run-two-remediation-design.md`)
shipped in full; every FAIL here is new.

Each FAIL and DRIFT reduces to one mechanism, verified in
source and reproduced on the memory backend unless noted:

1. **The re-mint spilled into product source.** `bbcbde8e`
   (2026-08-21, "Re-mint fixtures as canonical identifiers")
   replaced old fixture ids by string. The old ids were
   words — `api/mock-data/seed-hash-preimage.ts` maps
   `AjdvjuECVZEgZoFajaIEkg` to `1`, `UZgNCkZlSJcSaAmAJuSkcw`
   to `a2`, `XXZruirZyAOoRpNxaDnpSA` to `current`,
   `VOoVnUGteBpVZJqRqWZolw` to `assertion-jtis`,
   `JKeRxRPHBGBkzSLrvNpmlg` to `IdentityProviderEntity` —
   so they matched inside SVG path data, an opacity, a
   label, a route segment, three type or function names,
   one variable, and ten comments. Every sidebar page logs
   `<path> attribute d: Expected number` from
   `component-mobile-sidebar.html:120`; the dashboard logs
   `<stop> attribute stop-opacity` from `gauge.ts:313,330`;
   `icons.ts:488,609` break the archive and save icons; the
   stats page would print `<AjdvjuECVZEgZoFajaIEkg/wk`
   (`flow-stats.ts:36`). The empty Impact gauge is clean:
   `bipolarFill(undefined)` emits no fill path and its
   tracks are constant arcs. I27 — the hunter pinned a
   page-chrome error on the gauge.
2. **The workload generator collapses overrun steps onto
   one second, and two derives define "completed".**
   `api/mock-data/flow-workload.ts:199-201` clamps every
   step past `nowMs` to `nowMs - 1000`; `isoFromMs`
   (`seed-kit.ts:173-183`) is second-precision, so one FS
   work order's Review and Archive events share an `at` and
   random ids break the `(at, id)` tie — the ledger reads
   Create → Capture → Archive → Review. Stats
   (`flow-stats-aggregate.ts:182`) call a run completed if
   ANY transition reached Archive; the Workbox
   (`workbox-inbox.ts:206-226`), `currentNodeIdFromHistory`
   (`work-orders-queries.ts:300-307`), and the action screen
   use the LAST event. Measured: stats Review 1 / completed
   11; workbox Active 2 at Review. Deterministic per seed;
   not a `Date.now()` drift. The seam is reachable without
   the seed: the pure-move route has no edge gate
   (`api/routes.ts:2163-2199`) and `transitionAt` is
   client-supplied (`validators.ts:4023`). FS9.
3. **The K slice has one pre-approval project and the walk
   consumes it.** Every garden seeds `PROJECT_GARDEN` =
   submitted / approved / approved-2
   (`api/test-plan-slices.ts:1788-1792`); scores exist only
   for C (`formCExtras`, `:1410-1574`). K10 moves the
   submitted project to under_review, K16 approves it, K23
   archives it. Filter chips render from states PRESENT in
   the rows (`list-choreography.ts:18-21` via
   `project.ts:442-451`), so K26 finds no `under_review`
   chip. Projected Impact is not state-gated
   (`project-scoring.ts:482-549` computes `baselineAvg` for
   every row; `—` only when undefined), so an under_review
   project WITH baselines ranks — the "review queue ranked
   by impact" needs two such rows, which nothing seeds. The
   same gap leaves K17 (an under_review −100 drag) and K29
   ("log a measurement on an approved project", reported
   BLOCKED for want of baselines) without a subject. K26.
4. **The parallel invitee holds no seat.** `acceptInvitation`
   (`api/invitations-domain.ts:658-675`) writes the seat in
   the INVITATION's org; `GET identities/:id/organizations/`
   derives from seats (`organization-requests.ts:30-56`,
   `derive-memberships.ts:144-163`), never from claims; the
   client re-mints through the refresh grant after accept
   (`adapters/invitations.ts:199-237`) and `grantRefresh`
   re-derives orgs from seats (`authentication.ts:851-857`).
   The V1 parallel invitee is `g-unseated`, who has zero
   seats; accepting the g-org invitation yields ONE org, and
   `shouldShowOrganizationSwitcher`
   (`organization-session.ts:39-43`) needs two. Every
   slice's primary org is named "Stark Industries"
   (`test-plan-slices.ts:157`), hence "only Stark".
   Reproduced: pre-accept and refreshed tokens both list one
   org; `g-member` accepting Wayne lists two. Not a stale
   claim. V4.
5. **AA9 names no subject and the wrong selector.** The
   round trip is sound: `saveHumanMember`
   (`web-app/members/detail.ts:450-491`) merges the fetched
   profile with the draft, `putHumanMember`
   (`adapters/members.ts:200-217`) PUTs `strengths`,
   `validators.ts:783-828` keeps them, GET returns them, and
   read mode renders one `.pill-tag-strength` span per
   strength (`human-member-detail.ts:443-454`);
   `.strength-chip[data-strength]` exists only in edit mode.
   AA5/AA6-added humans start with `strengths: []`
   (`members/index.ts:451`); only the seeded admin carries
   three. After Save the page STAYS in edit mode —
   `reduceRefresh` (`detail.ts:207-225`) returns `current`
   while editing and the save handler never reduces — so
   Cancel paints the pre-save snapshot. Not reproduced as a
   product fault. AA9.
6. **`WB Test Flow` has one hop and it is terminal.**
   `formF2Extras` (`test-plan-slices.ts:1202-1267`) seeds
   Create → Capture → Archive with edges `begin` and
   `archive`. A WB5 work order sits in Capture under its
   genesis claim (`work-orders-mutations.ts:126-150`); its
   only transition completes it, so WB11's "next state …
   Active tab" is WB14, and WB12's "new state's attributes"
   has no parallel subject. The mock Customer Onboarding has
   two non-terminal hops. WB11 (DRIFT).
7. **V7 quotes dead copy.** `authorizeRequest`
   (`api/api.ts:620-629`, `request-auth.ts:147-155`,
   `authorization.ts:191-206`) 403s a member's POST or PUT
   on `/organizations/:id/invitations` before any handler,
   with `forbidden: <METHOD> <path> requires a role this
   principal lacks` — the org nest has no `MEMBER_VERBS`
   row. The `requireAdmin` calls in the grant and revoke
   handlers (`invitations-domain.ts:309-313, 375-379`) are
   unreachable over HTTP since `6f552ca1` nested invitations
   (2026-08-18); the two GET-nest guards stay live because
   `MEMBER_VERBS['/organizations/:id'] = ['GET']` wildcards
   the subtree. Revoke is a PUT, not a POST. V7 (DRIFT).
8. **`current` is a stale literal.** It was Tony Stark's
   seeded id (`seed-hash-preimage.ts:1168`) until
   `bbcbde8e`; `40d3dd43` (same day) made every `:id`
   segment 400 unless it is a 22-character identifier
   (`api/api.ts:436-456`, `shared/identifier.ts:11,25`). No
   alias ever existed in code. G25, G26, AA3, and G36 name
   it; `web-app/app/measure.ts:739-756, 789-790, 811-836`
   still falls back to `identityId=current` — one live
   branch, one dead guard, one unreachable arm — and the
   harness never reads HTTP status, so an error page's
   `page:ready` would be harvested as a real timing. G25
   (DRIFT).

Under those mechanisms the investigation found seams that
are not yet failures:

- `remintSessionClaims` (`adapters/invitations.ts:211-236`)
  has three empty catches. An `UnauthorizedError` from the
  refresh grant is swallowed after the recovery layer has
  wiped the token holder and started a bounce, so the next
  `getSessionToken()` dies as an unhandled rejection beside
  a green "Invitation accepted" toast; a network or 500
  failure leaves a silently stale claim for up to 15
  minutes. Under `node:test`, `localStorage` is undefined,
  and the eleven non-cookie accept cases in
  `tests/adapters-invitations.test.ts` and
  `tests/slices-invitation-lifecycle.test.ts` pass only
  because the `:221` catch eats that `TypeError` — the
  non-cookie re-mint path has never executed under test.
- `validateIdentityEntity` (`api/validators.ts:773-828`)
  admits any subset of the four person profile keys, so a
  partial PUT overwrites the document with a partial one;
  `profileOf` (`adapters/members.ts:75-85`) then masks the
  absence as `''` / `[]` / `{}`. The strict validator
  already exists unused (`validateHumanMemberDocumentBody`,
  `:1129`). Siblings in the same file: `emptyPersonProfile`
  (`:46-56`) fabricates a profile for every roster row, and
  `DEFAULT_DIM` (`members/index.ts:52`) writes a 50×4
  assessment that never happened.
- Five `<meta http-equiv="Content-Security-Policy">` blocks
  (`components-layout.html:30-43`, `landing/index.html`,
  `auth/index.html`, `not-found/index.html`,
  `web-app/index.html:6-15`) carry `frame-ancestors`, which
  browsers ignore in meta and log on every load; the server
  sends no CSP header, and a meta governs only from its
  parse point, leaving the earlier `<link>`s ungoverned.
- In serial mode the demo admin's READY list is
  `Lead-to-Close` only: mock Customer Onboarding's Review
  node has `memberIds: []` (`api/mock-data/flows.ts:161`),
  and no `WB Test Flow` exists in mock data, so WB4/WB5 are
  already parallel-only and WB3's "empty state initially"
  is false in serial (105 seeded completed work orders).
- TEST-PLAN pins the CLI count (3321; AT2 now reports 3708
  + 8) and a Combined TOTAL (3719) — a cache kept in sync
  by nothing. AGENTS.md `## Gates` cites three measure
  specs `0e1b8538` deleted. Two executed plans and fourteen
  mitigation specs sit untracked.

## Goals

- The re-mint finished: every clobbered literal, the
  `assertion-jtis` ledger path, the four names, and the
  comments restored, behind grammar pins that fail on any
  token in SVG path data or an opacity.
- One ledger order and one voice for "completed": generated
  work-order steps strictly ascending; stats and Workbox
  agree on where a work order is.
- Seeds that give every failed case its subject: two
  under_review K projects with baselines and baselines on
  the approved one; a Review node in `WB Test Flow`;
  reviewers on mock Customer Onboarding.
- Every seam under the failures closed: a failed re-mint
  surfaces; dead guards gone; a person profile is whole or
  absent and the adapter says which; member detail returns
  to read mode on save; CSP is a header; the measure
  harness has no sentinel.
- TEST-PLAN true for this seed and this MCP in both modes;
  the CLI count un-pinned.
- Later work named with oracles; the tree free of executed
  plans and absorbed mitigation specs.

## Non-goals

- Re-running the browser plan. This spec prepares it.
- A `current` alias, or any value-keyed exception at the
  identifier gate.
- A second 403 voice on the org invitation nest.
- The profile as its own document (`identities/:id/profile`)
  — later work; this spec ships whole-or-none.
- Fetching real profiles for roster rows; replacing
  `DEFAULT_DIM` — later work.
- A preimage-spill scanner test over
  `seed-hash-preimage.ts` — a heuristic; the grammar pins
  cover the user-visible class.
- Touching `PROJECT_GARDEN` (seven gardens) or
  `EXPECTED_MESSAGE_PAIR_COUNT = 1448`.
- Cases BLOCKED by genuine MCP limits; mock seed anchors.

## Design

### 1. Product: the re-mint restored (I27)

Four commits, one kind each.

Literals. `gauge.ts:313,330` `'AjdvjuECVZEgZoFajaIEkg'` →
`'1'`; `icons.ts:488` `'UZgNCkZlSJcSaAmAJuSkcw 2 0 0 0 2-2V8'`
→ `'a2 2 0 0 0 2-2V8'`; `icons.ts:609`
`'UQTJZvCoKlFjEoDlDUwekw 1 0 0 0-1 1v7'` →
`'a1 1 0 0 0-1 1v7'`; `component-mobile-sidebar.html:120`
`UZgNCkZlSJcSaAmAJuSkcw 2 0` → `a2 2 0`;
`flow-stats.ts:31-36` comment and label → `<1/wk`.

Pins, red today: `tests/presenter-misc.test.ts` — every
`stop-opacity` the ratio gauges emit matches
`/^\d+(\.\d+)?$/`; `tests/presenter-gauge.test.ts` — every
`\bd="…"` the empty bipolar gauge emits (note `\b`: `id=`
must not match) matches
`/^[MmZzLlHhVvCcSsQqTtAa0-9 .,eE+-]+$/`; a chrome scan
beside `tests/fusion-angle-display.test.ts` (it already
reads `component-*.html`) over every `<path d>` in the
components and every exported icon in `icons.ts`; the
flow-stats presenter test asserts the sub-1/wk label reads
`<1/wk`.

Ledger path. `api/authentication.ts:1066-1097` — six sites
— `VOoVnUGteBpVZJqRqWZolw` → `assertion-jtis`;
`tests/api-authentication-token.test.ts` follows. Deployment
note: the assertion-jti replay ledger is a message-plane
collection; jtis recorded under the token path are invisible
after the restore for their TTL. Render gets
`./postgres-wipe` before its next seed, as every seed does.

Names, one rename-only commit, `tsc` the proof:
`JKeRxRPHBGBkzSLrvNpmlg` → `IdentityProviderEntity`
(`api/types.ts:603`, `api/routes.ts:40,2940`,
`api/derive-identity-spine.ts:12,264,278,303`,
`web-app/app/adapters/identity-providers.ts:4,42,60`, and
the remaining sites the enumeration lists — seventeen);
`NIjaUmatkDaVBQdIjzUjYg` → `MembershipDocumentBody`
(`api/validators.ts:1989,2000,2011`);
`fekPpDYfJoFZmvUBauTxHA` → `hmacSigningKeyMaterial`
(`api/access-token.ts:29,75`); `ohqxgUBEaFQwYbXsonRPmg` →
`o1` (`web-app/app/measure-viz.ts:962-966`).

Comments, one comment-only commit: `api/derive-states.ts:
1045` (`0/1/2-event`) and `:1462` (`sub-`),
`api/routes.ts:351,415` (`Phase 2/3`, `Task 2/3`) and
`:2392` (`v1`), `api/message-pair.ts:892` (`Task 2/3`),
`api/authorization.ts:74-75` (`f1`, `v1`),
`api/derive-identity-spine.ts:48` (`c1`),
`api/validators.ts:3470` (`sub-`).

The enumeration is the oracle: every 22-character token in
`api/`, `web-app/`, `server/`, `shared/`, and the root docs
outside `api/mock-data/`, `api/test-plan-slices.ts`, and the
preimage map, cross-referenced against
`seed-hash-preimage.ts`. After the four commits every
remaining hit maps to a 22-character preimage or a slice
token (`*-admin`, `*-member`), or is a genuine id in a path
example (`derive-flow-work-orders.ts:20`, `api/mock-data.ts`
organization comments). Tokens that map to `1`, `2`, `a1`,
`a2`, `c1`, `f1`, `v1`, `o1`, `sub-`, `assertion-jtis`, or
a type or function name must be gone.

### 2. Seed and product: one ledger order, one voice (FS9)

Seed. `generateFlowWorkload` (`flow-workload.ts:199-201`)
keeps overrun steps strictly ascending: step `j` of `N`
overrunning steps lands at
`nowMs - (N - j) * MS_PER_SECOND`, a named constant, instead
of `nowMs - 1000` for all. Ids, path weights, and both pair
counts are unchanged; `(at, id)` order equals path order.

Pin, `tests/slices-flow-stats.test.ts`, red today (Review 1
versus 2): build the inbox rows with the page's own fan-in —
`getWorkOrders`, `getWorkOrderHistories`,
`projectTransitions`, `buildInboxItems` — and assert, per
non-special node, `currentlyHere` equals the Active items at
that node, and `incompleteWorkOrderCount` equals the Active
total. `tests/mock-data-lead-to-close.test.ts` asserts every
generated work order's state-event `at` values are strictly
ascending — the same generator feeds the serial seed.

Product, its own commit and pin. `reconstructRuns`
(`flow-stats-aggregate.ts:182`) defines `completed` from the
LAST path node's `isArchive`, as `currentNodeIdFromHistory`
does. Covenant: a run is completed when its current node is
Archive, not when any event ever reached Archive. Pin: a
ledger whose Archive event sorts before a later-id Review
event at the same `at` counts as here-now at Review and not
completed; red today.

### 3. Seed: K scoring subjects (K26, K17, K29)

`formKExtras(organizationId, adminId, requestAt)` beside
`formCExtras`, called from a `section === 'K'` branch beside
C's (`test-plan-slices.ts:3024`). Two projects with
`state: 'under_review'` through `projectSeedBody` and
`formSeedMessagePair` (the `formGarden` pattern,
`:2073-2107`), written with `postProjectDocumentOp` as
`writeGarden` does; four baselines each over `k-obj-1..4`
through `postBaselineScoreDocumentOp` as `cScores` does
(`:3097-3105`), the C loop duplicated without the actuals —
the second instance, not a helper. Scores are explicit
named constants, one project high and one low, so the two
`baselineAvg` values are distinct by construction and
survive K17's single −100 drag. Four ids join
`SLICE_ENTITY_IDS`: `k-project-under-review`,
`k-project-under-review-2`, and their `-state` twins;
baseline ids compose `${project}:${objective}:${at}`
(`:1466`). Pair count 485 → 495.

K29, a second commit: four baselines on `k-project-approved`
by the admin. 495 → 499.

Pins: a new `tests/slices-review-queue.test.ts` on
`tests/slices-portfolio-scores.test.ts` (`claimToken` as
`k-admin`, `getProjectsScoreColumn`): exactly two
under_review K projects, each `baselineCount` 4 of 4 with
defined and distinct `baselineAvg`, the submitted project
undefined; after K29, the approved project scored. Red
today. `tests/test-plan-slices.test.ts:48` moves to the
measured count and the "garden slices seed three projects"
pin (`:356-377`) gains `section === 'K' ? 5 : 3`, the FS
work-order exception's shape (`:519-524`).

Copy: K24 "unscored / pre-approval projects show —" becomes
"unscored projects show —"; K26 names its precondition (two
seeded under_review projects, ranked); K29 loses its
BLOCKED reason.

### 4. Seed: `WB Test Flow` gains Review (WB11–WB14)

`formF2Extras`: a Review node, `f2-node-review`, neither
create nor archive, `memberIds: [adminId]`, both attributes
referenced `readonly` and not required — the garden Review
node's shape (`:2294-2315`); Archive moves right. Edges:
`begin` stays; `f2-edge-capture-archive` is replaced by
`f2-edge-submit` (`submit`, Capture → Review) and
`f2-edge-approve` (`approve`, Review → Archive). The graph
rides inside the existing flow op and document pairs — pair
count unchanged. `tests/slices-flow-readiness.test.ts` stays
green (Review has a member and an outgoing edge).

Pin, `tests/slices-workbox-action-screen.test.ts` (it
already holds the work order and presenter), red today:
exactly one edge leaves `presenter.currentNodeId()`, its
target is not an archive node, and exactly one edge leaves
that node into the archive node.

AA-WB-SETUP says four nodes: Create → Capture (text + select
attributes) → Review (read-only) → Archive. WB11–WB14 text
is unchanged.

### 5. Seed: mock Customer Onboarding is READY (serial)

`api/mock-data/flows.ts:161` Review `memberIds` becomes
`['MQFcPtrZPIGjMCRAXtZUnA', 'CJrglMsNBxOWWfbihHQSeg']` —
Sarah Chen and Emily Rodriguez, the identities the ledger
already shows performing all forty Review exits. Two members
match Data Capture's badge. `EXPECTED_MESSAGE_PAIR_COUNT`
stays 1448: member rows ride inside the flow create
document's `memberEvents` (`seed-message-pairs.ts:898`) and
the work-order `flow_graph` snapshots copy the graph
in-document. Measured on a scratch copy: READY becomes
`[Customer Onboarding, Lead-to-Close]`; the full suite is
green; the six in-flight Customer Onboarding work orders
stay unclaimed and claimable.

Pin, a new `tests/mock-flow-readiness.test.ts` on
`tests/slices-flow-readiness.test.ts` (`sharedMockDb`,
`organizationToken`, `createRequestContext`,
`getFlowsForCreation`): ready names deep-equal
`['Customer Onboarding', 'Lead-to-Close']`; not-ready
deep-equals Fusion Angle Flow (16) and Layout Test: Proposal
Review Cycle (15). Red today.

TEST-PLAN, G43 form: AA-WB-SETUP (serial has no `WB Test
Flow`; the subject is Customer Onboarding); WB3 (serial: the
Archive list holds the 105 seeded completed work orders;
parallel: empty); WB4 (serial READY and NOT READY lists as
pinned); WB5 (serial: Customer Onboarding, post-start "Data
Capture"); WB5a (serial: the `submit` edge from Data
Capture); WB11 (serial: bind an instance, Company Name and
Contact Email, `submit` → Review); WB14 (serial: Reviewer
Notes and `approve`); FS4 (serial: Review's subtitle names
the two reviewers).

### 6. Product: a failed re-mint surfaces

`remintSessionClaims` loses all three catches. Cookie path:
`putSessionToken((await postSessionRefresh(ctx, ''))
.accessToken)`. Otherwise `const stored =
getSessionCredentials(); if (stored === null) return;` —
the typed absence `session-credentials.ts:48-50` already
returns — then refresh and install. One `try` wraps ONLY
`postSessionRefresh`: `catch (err) { throw new
SessionRemintFailedError(err); }`. The class, exported from
the adapter, extends `Error` with the message "invitation
accepted, but the session was not re-minted — sign in again
to see the new organization" and `{ cause }` — the
`HumanMemberPiiIntakeFailedError` shape
(`adapters/members.ts:187-197`). `postInvitationAcceptance`
becomes `await PUT; try { await remintSessionClaims(ctx); }
finally { invitationChanges.notify(); }` — the committed
seat's bell rings either way. The page's existing catch
(`web-app/invitations/index.ts:86-91`) renders the truth
through the one voice: `Failed: …`. Recovery of a 401 stays
the recovery layer's job.

Tests: the Map-backed `globalThis.localStorage` stub
(`tests/adapters-shared-recovery.test.ts:2-20`) at the top
of `tests/adapters-invitations.test.ts` and
`tests/slices-invitation-lifecycle.test.ts` — without it the
honest adapter throws the `TypeError` the catch hid. Nothing
asserts the swallow; nothing is deleted or weakened.

Pin, `tests/adapters-invitations.test.ts` beside the
cookie-session success case (`:763`), red today: a recording
context whose POST to `authentication/token` throws
`UnauthorizedError`; `postInvitationAcceptance` rejects with
`SessionRemintFailedError` whose `cause` is that error; the
seat landed; `getSessionToken()` is unchanged.

### 7. Product: dead admin guards dropped (V7)

`invitations-domain.ts:309-313` and `:375-379` are deleted;
the now-unused `roles` parameters become `_roles`
(`noUnusedParameters`, the `:329` convention).
`requireAdmin` stays for its four live GET callers (`:237`,
`:273`, `:969`, `:998`). No test and no non-HTTP caller
touches the dead sites; nothing is deleted from `tests/`.

Pins, `tests/api-invitations-fence.test.ts`: the existing
member-POST case (`:211-223`) also asserts the body
`forbidden: POST /organizations/<id>/invitations/ requires a
role this principal lacks`; a sibling pins member PUT
`{state:'revoked'}` → 403 with the matching body. Both are
green before and after — they replace the lost
defense-in-depth: a future `MEMBER_VERBS` widening fails a
test.

### 8. Product: a person profile is whole or absent (AA9)

Gate. `validateIdentityEntity`: for `kind === 'person'`, if
any profile key is present, `assertOnlyKeys(body,
[...IDENTITY_BODY_KEYS, ...IDENTITY_PROFILE_KEYS])` then all
four are picked with the same `pickString` /
`pickStringArray` / `pickStringNumberRecord` calls the strict
validator uses (`:1081-1097`), so the 400 bytes match;
otherwise `{ kind }`. Any one to three of the four →
400 `missing required key "x" for IdentityEntity`.
`IdentityEntity` (`api/types.ts:456-466`) becomes a union:
service, person without profile, person with all four — no
`?` per field. Covenant: `PUT identities/:id` carries the
whole profile or none; PUT still overwrites. Every live
writer already sends whole bodies — the detail page, Add
Member, both seeds, `formExtraIdentity` — and `POST
/identities/` genesis writes `{ kind }`, which stays valid:
a person exists before any org-facing profile does.

Adapter and presenter, a second commit. `profileOf` maps
1:1 into `HumanProfile = { present: true, title,
department, strengths, team_dimensions } | { present:
false }` — no `??`; the `members-union.ts:83-91` copy
follows; `HumanMember` (`types.ts:674-731`) holds the union
(its `department()` already speaks present/absent). The
detail presenter seeds a blank draft for an absent profile
exactly as it does for erased PII (`human-member-detail.ts:
83-96`) and read mode renders absence;
`presenters/member.ts:102,114` follow.
`generate-api-documentation.ts:234` shows a full profile;
API.md regenerates. `putHumanMember` is unchanged.

Pins: `tests/api-identity-document.test.ts` — the partial
case (`:396-418`) becomes `{kind:'person', title}` → 400
missing required key; the round trip (`:420-444`) PUTs and
reads a FULL profile; `tests/api-identities.test.ts:27-36`
keeps `{kind:'person'}` valid and adds partial → throws;
`tests/adapters-members.test.ts` — a `{ kind }` document
reads `{ present: false }`, a full document deep-equals 1:1.
`tests/api-organization-isolation.test.ts:749-757` and
`tests/adapters-shared.test.ts:138-141` send whole bodies or
`{ kind }`. Red today: the partial PUT is 201. Storage is
message-plane JSON and GET never re-validates, so a legacy
partial document reads as `{ present: false }` — no
migration.

### 9. Product: member detail returns to read mode (AA9)

`web-app/members/detail.ts` exports `reduceSave(fresh)` —
the reading branch of `reduceRefresh`, which delegates to
it. After the success toast, `saveHumanMember` re-GETs
(`getHumanMember`) and `state = reduceSave(fresh);
rerender()`; a reload failure is `reportFault`ed and leaves
edit mode with the draft intact. `saveAIMember` gets the
same tail with `getAIMember` — two copies in one file, below
the three-trigger. This is the organization and records
voice: four of four sibling detail pages land in read mode
from a fresh GET; member detail is the only one whose
refresh reducer guards `editing`, so the handler must own
the transition. The mid-edit Cancel path stays as the
siblings have it (`next === current`,
`tests/members-detail-reduce.test.ts:41-56` unchanged).

Pin, `tests/members-detail-reduce.test.ts`, red today:
`reduceSave(fresh)` yields `kind === 'reading'` with `member
=== fresh`, and `new HumanMemberDetailPresenter(next.member)
.renderShell(rec)` paints the fresh phone, bio, and strength,
not the stale bio, with `data-member-action="edit"` and no
`data-member-action="save"`.

TEST-PLAN: AA9 and AA9a say the page returns to read mode
showing the edits — no navigation — then reload and confirm
persistence (G40's form); G21, G23, G24a, G24b likewise.

### 10. Product: CSP is a header

`server/http-server.ts` gains `export const
CONTENT_SECURITY_POLICY` beside `NO_STORE`: the nine
directives the four identical metas carry —
`default-src 'self'; script-src 'self'; style-src 'self';
style-src-attr 'unsafe-inline'; font-src 'self'; img-src
'self' data:; frame-ancestors 'none'; base-uri 'self';
form-action 'self'`. `serveStatic` (`:325-369`) sets the
header after `:362` when `ext === '.html'`, before the HEAD
return so HEAD carries it. HTML only: `API.svg` embeds an
inline `<style>` and is its own document under `<object>`;
JSON never becomes a document. The root page's five-directive
subset gains allowances it never exercises. All five metas
are deleted; nothing reads them (`compose.ts` replaces
placeholders only; `build:87-88`'s comment stays true).

Pins, `tests/http-server.test.ts` beside the `HTML is
no-store` case (`:92`): `GET /landing/index.html` carries
the LITERAL string (a typo in the constant must fail); HEAD
the same; `/assets/app.js` and the JSON 404 carry none. A
source scan on the LISTEN pin's shape
(`tests/advisory-lock.test.ts:122-150`): every `*.html`
under `web-app/` (at least thirty) lacks
`Content-Security-Policy`; `server/http-server.ts` has it.
Red today.

TEST-PLAN A5 drops "CSP `frame-ancestors` delivered via meta
and"; the Known-limitations `script-src 'self'` bullet stays
true.

### 11. Product: no sentinel in the measure harness (G25)

`web-app/app/measure.ts`: the identity fallback inside the
roster scrape (`:740-749`) is deleted — the discovery throw
at `:750` then names identity-detail in the sibling voice;
`:789-790` becomes `const q = queryOf(identityDetail);`
(the flow-stats and idea-convert form); `:811-836`, reachable
by nothing, is deleted. About thirty-five lines, no new
branch, no new class. An empty roster now exits 1 with the
named discovery error instead of recording an error page's
timing. Budgets for the identity pages came from real-anchor
runs (history carries the success-only fetch phases);
`--check` is unaffected.

Pin, `tests/measure-cli.test.ts`, a source scan (the module
runs `main()` at load and exports nothing): the source does
not match `identityId=current` or `Tony Stark` and still
matches `Detail URL discovery failed`. Red today.

### 12. TEST-PLAN corrections

One commit for plan drift; wording a product change makes
true rides with that change (§3 copy, §4 and §5 clauses, §9
read mode, §10 A5).

- AA9: the subject is the current user's detail — the
  seeded admin with three strengths (Strategic Planning,
  Data Analysis, Stakeholder Management); never an
  AA5/AA6-added human, which starts empty. Toggle Data
  Analysis off and Agile Methods on; expect three. Read
  mode renders `#member-strengths .pill-tag-strength` spans
  with no `data-strength`; `.strength-chip` is edit-only.
- V4: a Parallel clause — the V1 invitee `g-unseated` holds
  no prior seat, so after Accept `GET
  identities/:id/organizations/` lists ONE org and the
  footer shows it as text with no `<select>` (G36 needs
  two); multi-org is exercised by V7's invitee half (G
  Member accepts Wayne → both listed). Serial stands.
  "(Stark)" becomes "(the invitation's org)".
- V7: the two bodies become the gate's — `forbidden: POST
  /organizations/<orgId>/invitations/ requires a role this
  principal lacks` and `forbidden: PUT /organizations/
  <orgId>/invitations/<invitationId> requires a role this
  principal lacks` (the hunter matches the shape); the
  forced revoke is a PUT `{state: "revoked"}`; Source names
  the absent `MEMBER_VERBS` row (`api/authorization.ts`) and
  `authorizeRequest` (`api/request-auth.ts`); "(V8)" becomes
  "(V9)".
- G25, G26, AA3, G36: `current` leaves. G25 opens from
  `identities/` → detail → "Tokens"
  (`data-identity-link="tokens"`); a non-canonical
  `identityId` 400s at the route gate and an absent one
  bounces to `identities/`.
- Known MCP limitations: a bullet for loading skeletons —
  `navigate` resolves after the page's fetches settle, so
  the skeleton (I21) paints and clears before any probe;
  verify by source; BLOCKED is sanctioned. WB16 points at
  the no-hand-fetch rule: read the history from the network
  log.
- Summary: the Combined table keeps browser = 398 only; the
  CLI count is the AT2 report; a fully green run reports
  `PASS = AT2 + 398, FAIL = 0, BLOCKED ≤ k, DEFERRED ≤ j,
  DRIFT = 0`; "Update both numbers" becomes the browser
  count alone.

### 13. Later work

`ARCHITECTURE.md` `## Later work` gains, each with its
oracle:

- Profile as its own document, `identities/:id/profile`,
  404 = no profile — closes whole-or-none —
  `tests/api-identity-document.test.ts`
- Roster rows carry a fabricated empty profile
  (`emptyPersonProfile`) — `web-app/app/adapters/members.ts`
- `DEFAULT_DIM` stands in for an assessment that never
  happened — `web-app/members/index.ts`
- The re-mint refresh is not single-flighted with the
  facade's cookie refresh — `web-app/app/adapters/shared.ts`
- Member detail's subscriber refresh after save is a
  redundant GET trio — `web-app/members/detail.ts`
- `./measure` harvests error-page timings; `page:ready`
  carries no status — `web-app/app/measure.ts`

### 14. Housekeeping

`docs/superpowers/plans/2026-08-22-known-seams-later-work.md`,
`docs/superpowers/plans/2026-08-22-test-plan-run-two-
remediation.md`, and the fourteen files under
`docs/superpowers/test-plan-mitigations/` are removed (never
tracked; no commit). AGENTS.md `## Gates` drops the three
paths to measure specs `0e1b8538` deleted. The run-three
plan stays untracked and is removed when it ships.

## Testing

Every new test runs under `./test` on memory in both TZ
passes; none needs Chrome or Postgres. Red before green:

- §1 literals: red — a token in `stop-opacity`, in path
  data, and in the throughput label.
- §1 ledger path, names, comments: `tsc` and the existing
  suite; the enumeration empty of word-preimage tokens.
- §2 seed: red — Review 1 versus 2 Active.
- §2 product: red — an out-of-order Archive counts as
  completed.
- §3: red — zero under_review K projects; the approved one
  unscored.
- §4: red — the only hop out of Capture is the archive.
- §5: red — READY is `Lead-to-Close` alone.
- §6: red — the failed refresh is swallowed.
- §7: green before and after — the guard is the gate's.
- §8: red — a partial PUT is 201; `{ kind }` reads as an
  empty profile.
- §9: red — `reduceSave` does not exist.
- §10: red — no header; five metas.
- §11: red — the sentinel is in the source.
- `./validate` green after every commit; the slice pair
  count moves 485 → 495 → 499 and nowhere else; 1448 never
  moves.

## Commits

One concern each, present-tense imperative, about fifty
characters, rebase and fast-forward, trailer lines
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
`Claude-Session: …`. Pins land with the change that greens
them; rename-only and comment-only commits carry nothing
else. Order: spec; §1 literals → ledger path → names →
comments; §2 seed → product; §3 under_review → approved;
§4; §5; §6; §7; §8 gate → adapter; §9; §10 header → metas;
§11; §12; §13; §14 AGENTS.md. About twenty-two.

## Evidence

Run summary of 2026-08-23T06:55:21Z (build `cc052c82`);
hunter mitigation stubs under
`docs/superpowers/test-plan-mitigations/` (absorbed here,
then removed); investigator reproductions on the memory
backend and one `git archive` scratch copy (never
committed); `bbcbde8e` (the re-mint), `40d3dd43` (identifier
gates), `6f552ca1` (nested invitations), `5ade74cb` (the
flat facade and its guard strings), `102a1d64` (G25 written
against the literal id), `4d622fcc` (the measure fallback),
`120f6980` (the CSP meta), `0e1b8538` (the docs clean-out),
`65f048ab` (TEST-PLAN machinery dropped), `9ccdab40` (the
G43 Serial/Parallel precedent).

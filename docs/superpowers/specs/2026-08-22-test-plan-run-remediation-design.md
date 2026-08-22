# Test-plan run remediation: CLI belt, slice seed, member state

## Problem

The 2026-08-22 TEST-PLAN run (build `46af28f`, parallel
mode) reported AT green — `tsc`, `./test` (3338 + 8,
fail 0, skipped 7), `./validate` — and then 67 browser
FAILs, 182 BLOCKED, and 2 DRIFT. The CLI suite passed
while the product, as the browser saw it, did not.

Every FAIL reduces to one of five mechanisms, each
verified in source:

1. **Slice ideas have no submissions.** `formGarden`
   (`api/test-plan-slices.ts`) writes one idea document
   pair per lifecycle state and no submission pair.
   `getIdeas` (`web-app/app/adapters/ideas.ts`) requires
   one submission per idea and throws `Idea has no
   submission`. The Organization page's
   `getOrganizationStats` calls `getIdeas`, so K1
   ("Failed to load organization data") is the same
   fault. D1–D37 and K1–K6 fell; C would have. The mock
   seed writes submissions, so serial mode never saw it.
   `tests/test-plan-slices.test.ts` pins the seed's shape
   (pair count, "four idea states") and never runs a page
   adapter over a slice tenant. The browser was the first
   caller of `getIdeas` on a slice.
2. **Member State is a lying control.** The member detail
   page renders a State select (Active / Pending /
   Archived) and Save toasts "Member saved", but
   `postHumanMemberStateChange` and
   `postAIMemberStateChange` are no-op stubs since
   `8f23fb31` (retire members and memberships routes),
   every read fabricates `state: 'active'`, and no route
   serves a member lifecycle. G21 observed exactly this.
3. **V3–V5 name a mock identity in a slice tenant.** V1's
   example invitee ("a Wayne-only seeded human") does not
   exist in the G slice; the seeded invitee is
   `g-unseated@test-plan.example`. Whether the product
   path also fails is unproven.
4. **AA-WB-SETUP demands pointer-capture gestures.** F2 is
   not a garden section, so the hunter must build a wired
   flow by drag — a documented MCP limitation. WB5–WB19b
   fell behind it.
5. **Parallel browser hunting is unsound on this MCP.**
   The hunter contract assumes `isolatedContext` per
   section; `tabs_create_mcp` takes no parameters.
   Fourteen hunters share one Chrome profile — one
   `refresh_token` jar and one selected page. Sign-ins
   overwrite each other (B9's "C Admin" chip), concurrent
   refreshes trip the refresh-reuse revocation in
   `api/authentication.ts`, and clicks land in foreign
   tabs. That is the BLOCKED mass.

Two DRIFTs: SV3 says `Secure` is set "always, including
`http://localhost`" while `refreshCookieIsSecure` exempts
`localhost`; G43 names the mock roster in a slice tenant.
Smaller doc misses: AA9 looks for checkboxes (the UI is
`.strength-chip[data-strength]` buttons), G46/G47 have
valid slice targets the text does not name, I26 is absent
from the table, and `./test-postgres` — the
Postgres-gated tests AT2 reports as skipped — is outside
the AT gate.

## Goals

- A CLI belt that fails on what the browser failed on:
  every sidebar page's boot reads, for every slice
  tenant, on the memory backend, inside `./test`.
- Slice seed that satisfies the product's invariants:
  submissions per idea; a READY Workbox flow for F2.
- Retire member lifecycle state: the control, the stubs,
  the fabricated trio, the dead write family, the legacy
  derive and seed pairs, the alphabet, the docs.
- TEST-PLAN corrected to the slice seed and to this MCP:
  serial browser hunters, AT4 `./test-postgres`, and the
  drift fixes.
- SV3 settled by measurement, not assertion.

## Non-goals

- Wiring member state onto the pair plane. The back end
  retired it; "pending" is an invitation, "archived" is a
  seat tombstone.
- Changing the lifecycle trio for ideas, projects,
  record-types, objectives, or flows. It stays.
- Re-running the browser plan. This spec prepares it.
- `schema-svg.ts` `FK_SPECIAL` still draws
  `state_event_id → states`, a deleted table. Observed,
  not in scope.

## Design

### 1. Belt: `tests/slices-page-boot.test.ts`

One seed per test (`postTestPlanSlices` on
`memoryDbAdapter()`, `testHashPassword`). For each reveal
row, a request context as that slice's admin:

- AA: `organizationToken()` (bootstrap `current`, org
  `AjdvjuECVZEgZoFajaIEkg`).
- Others: `claimToken({ sub: sliceEntityId(token +
  '-admin'), organization, organizations:
  [organization], roles: ['admin:' + organization] })`
  via `createRequestContext(db, token)`.

A manifest maps every `PAGE_REGISTRY` key with
`layout: 'sidebar'` and `requiresAuth !== false` to the
adapter reads its `init()` performs. List pages read the
collection; detail pages read each row the list returned
(zero rows → zero detail reads, and the list read itself
is the assertion). Pages whose `init()` performs no reads
declare an explicit empty list — absence is the failure,
not emptiness.

- dashboard: `getDashboardGauges`,
  `getObjectiveScoringInputs`,
  `getCurrentObjectiveDefinitions`.
- organization: `getOrganization`, `getOrganizationStats`,
  `getActiveObjectives`, `getObjectives`,
  `getArchivedObjectiveIds`, `getObjectiveStateDetails`,
  `getSentInvitations`.
- ideas, idea-detail: `getIdeas`; per row `getIdea`.
- idea-convert: per approved idea `getIdea`,
  `getOrganization`.
- projects, project-detail: `getProjects`,
  `getProjectsScoreColumn`; per row `getProjectEntity`,
  `getProjectScoring`, `getFlowsByProject`.
- records, record-detail: `getRecords`; per row
  `getRecordModel`, `getRecordAttributesByRecord`,
  `getRecordInstances`, `getWorkOrdersForRecord`,
  `getFlowSummariesForRecord`.
- flows, flow-detail, flow-stats:
  `getFlowsWithProjectNames`, `getProjects`; per row
  `getFlowGraph`, `getFlowStats`; `getHumanMembers`,
  `getAIMembers`, `getRecordEntities`.
- workbox, workbox-detail: `getWorkOrders`,
  `getWorkOrderHistories`, `getMemberMap`,
  `getFlowsForCreation`; per row `getWorkOrder`,
  `getWorkOrderHistory`.
- members, member-detail: `getMembers`,
  `fillHumanMemberPii`; per human `getHumanMember`, per
  agent `getAIMember`.
- invitations: `getInvitations`.
- identities, identity-detail: `getIdentityRoster`; per
  row `getIdentity`, `getMemberPii`, `getServiceFacet`,
  `getIdentityCredentialState`, `getClientRegistration`.
- identity-providers: `getProviderEvents`.
- identity-tokens: `getTokenChainsFor`.
- idea-create, record-create, billing: none (explicit).

The exact read list per page is taken from each page's
`init()` at implementation time; the table is the
contract's shape. One seed per section; one subtest per
page; the assertion is "every read resolves". A
completeness test
fails when a qualifying registry key has no manifest
entry.

AA and the thin slices (B, G, H, I, SV) seed no ideas,
projects, or flows; their pages must boot empty. Those
rows are asserted, not skipped.

Red today: every garden slice (C, D, E, F, FS, K, R)
fails `ideas` and `organization` on `getIdeas`.

### 2. Seed: submissions per garden idea

`formGarden` forms, after each idea pair, a submission
pair at `organizations/:id/ideas/:id/submissions/:sid`
with `{ idea_id, member_id: <admin>, at }`, mirroring
`seed-message-pairs.ts` (`ideas/:id/submissions/:sid`).
Submission ids are `sliceEntityId(token + '-idea-' +
state + '-submission')`, added to `SLICE_ENTITY_IDS`.
`EXPECTED_SLICE_PAIRS` rises by 28 (7 garden sections ×
4 ideas). Greens §1 for D, K, and C.

### 3. Invitation lifecycle over the slice seed

`tests/slices-invitation-lifecycle.test.ts`:

1. G admin (`claimToken`, org `g-org`) —
   `postInvitationGrant(ctx, 'g-unseated@test-plan.example')`
   → `'sent'`.
2. Unseated (`reachableToken(sliceEntityId('g-unseated'),
   [])`, a flat zero-membership token) —
   `getInvitations` → one pending row for `g-org`.
3. Unseated — `postInvitationAcceptance` → `getOrganizations`
   includes `g-org`; re-accept is a no-op.
4. A second grant to the same identity is `'already-member'`;
   to `g-member@test-plan.example` it is
   `'already-member'` too (seated).
5. Fresh grant to the unseated identity from the second
   org (`WlkfISpndVJfICRnWksipQ`, where the G admin also
   holds a seat — an org-2 scoped admin context), then
   `postInvitationDecline` → `getOrganizations` unchanged;
   re-decline is a no-op.

Green ⇒ V3–V5 were doc drift; §7 names the invitee.
Red ⇒ a product fault the browser found and the CLI now
holds; fix it before §7.

### 4. F2: seed `WB Test Flow` READY

`formF2Extras` seeds one flow in the F2 organization the
way the garden seeds `Customer Onboarding` — the create
op pair plus the document pair — without the project-flow
join pair (F2 has no project). Graph: `Create` →
`Capture` → `Archive`; `Capture` carries the F2 admin in
`memberIds` and two attributes (`text`, `select`) so
`validateFlowForCreation` reports no `zero_members` and
no `dead_end`. No work orders: WB1–WB4a's empty inbox
stays empty. The reveal row gains `flowId`.
`EXPECTED_SLICE_PAIRS` rises by 2.

`tests/slices-flow-readiness.test.ts`: as F2 admin,
`getFlowsForCreation` lists `WB Test Flow` under `ready`
and nothing under `notReady`. AA-WB-SETUP becomes a
verification step (§7).

### 5. Retire member lifecycle state

Leaf to root; one concern per commit; `./validate` green
after each:

1. **UI.** Delete `buildEditableState` in
   `presenters/human-member-detail.ts` and
   `presenters/ai-member-detail.ts`; the state badge
   (`presenters/member.ts` `#buildStatusBadge`, the
   title-section badges); `data-member-field="state"`
   handling and the `stateChanged` branch in
   `members/detail.ts`; the `'active'` argument in
   `members/index.ts`; `MEMBER_STATE_CONFIG` and the
   member `STATE_ICONS` in `state-display.ts`.
2. **Type cut.** `MemberEntity` becomes `{ id, type }`;
   `HumanMember`, `AIMember`, `SystemMember` lose the
   state argument, `#state`/`#stateAt`/`#stateEventId`,
   and `isActive`/`isPending`/`isArchived`/`stateValue`/
   `stateAtValue`/`stateEventIdValue`; `MemberStateDetail`
   goes. Fabrication sites: `seatedHumanParent`
   (`adapters/members.ts`), `agentParent`
   (`adapters/ai-members.ts`), `seatedHumanOf` and
   `memberParentOf` (`api/derive-members.ts`);
   `members-union.ts` rows drop `state`;
   `MemberEntityFields` in `api/validators.ts` becomes
   `Omit<MemberEntity, 'id'>`. `api/types.ts` is schema
   of record for `generate-schema-svg --check`, so the
   same commit regenerates `SCHEMA.svg` and corrects
   `SCHEMA.md` ("Members GET rows still embed the
   lifecycle trio" — they never did on the wire; the seat
   routes emit `{ id, organization_id, identity_id, type,
   at }`).
3. **Dead write family.** `postHumanMemberCreationOp`,
   `postAiMemberCreationOp`, `postAiMemberEditOp`,
   `postHumanMemberEditOp`, `memberDocumentBodyOf`,
   `memberDocumentEntityOf`; validators
   `validateHumanMemberCreateBody`,
   `validateAIMemberCreateBody`,
   `validateAIMemberEditBody`,
   `validateHumanMemberEditBody`,
   `validateMemberDocumentBody`, `MemberDocumentBody`;
   `tests/api-member-documents.test.ts` keeps its three
   "retired 404" cases and loses the validator cases;
   `drift-roster.test.ts` loses `MEMBERS_TEST_WIRING`.
4. **Legacy derive and seed.** `deriveMemberStates`,
   `MEMBERS_DOCUMENT_PREFIX`, the mock seed's `members/:id`
   trio pairs and `bootstrapSystemStateEventId`, the
   `state` field in `mock-data/members.ts`; the 1448 / 8
   pair pins and `tests/mock-data-valid.test.ts`,
   `drift-states.test.ts`,
   `drift-phase15-cores-parity.test.ts` retarget. Gate:
   nothing but `deriveMemberStates` reads `/members/`
   (`memberParentOf`'s leftover path leaves with it).
5. **Alphabet.** `MEMBER_STATES`, `MemberState`,
   `isMemberState`, `assertMemberState`; the adapter
   stubs `postHumanMemberStateChange` /
   `postAIMemberStateChange` and the dropped parameters
   `_stateEcho` / `_initialState`; `member-fixtures.ts`
   and `adapters-admin.test.ts` (`seedMember(db, id,
   'pending')`) retarget.
6. **Docs.** `ARCHITECTURE.md` (the State-select
   paragraph), `API.md` §3.4 and its `memberStateEvents`
   passage, TEST-PLAN G21 (the State clause and the badge
   sentence), AA6 ("(pending)", "(archived)"), and every
   other member state badge or select mention. `CLAUDE.md`
   names none.

The belt (§1) runs `members` and `member-detail` across
all fourteen slices after step 2.

### 6. AT4: `./test-postgres`

TEST-PLAN AT gains **AT4**: with `POSTGRES_URL` set (A3
requires it), run `./test-postgres`. The suite creates
and drops its own `fusion_test_*` schema, so it runs
against A3's database before A1. PASS: exits 0, `fail 0`.
`./validate` stays Postgres-free. The Summary table
counts AT as 4; the totals follow.

### 7. TEST-PLAN corrections

- **Protocol.** Remove `isolatedContext` from How to
  invoke (step 5) and the hunter prompt; the Historical
  note keeps it as history. State the fact: this MCP has
  no isolated contexts — one Chrome profile, one cookie
  jar, one selected page. Parallel mode keeps its
  seed and its per-section hunters; the master dispatches
  them **one at a time**, joining each before the next.
  Each hunter begins by deleting site data for the origin
  so the shared jar carries no previous hunter's refresh
  cookie. The CLI belt is the parallel layer.
- **A3.** The reveal text adds "F2 names `flow_id`".
- **AA-WB-SETUP.** Verify the seeded `WB Test Flow`
  (reveal `flow_id`) is READY in Create Work Order; no
  gesture build.
- **AA9, G21.** Name the control: `.strength-chip`
  buttons with `data-strength`, toggled by click.
- **V1.** Parallel mode: invite `unseated_username`.
- **G43.** Parallel expectation: the G roster is the G
  admin, `G Member`, `G Unseated`, one agent, and the
  system service identity; the org-2 PII fence has no
  subjects in the slice.
- **G46 / G47.** Targets: erase `G Member` (never the
  admin); register the system service identity.
- **I26** restored to the table; AA/B/G extra ids
  reconciled to the per-section counts.
- **SV3.** Per §8.

### 8. SV3 by measurement

Sign in on `http://localhost:PORT` and
`http://127.0.0.1:PORT` in Chrome; inspect the jar.

- Both store a `Secure` cookie ⇒ delete
  `refreshCookieIsSecure`; `refreshCookieAttributes`
  always pushes `Secure`; SV3 text stands.
- Either rejects it ⇒ the code stands; SV3's parenthetical
  is corrected to the measured truth.

Recorded in the commit message of whichever change lands.

## Testing

Every new test runs under `./test` on memory in both TZ
passes; none needs Chrome or Postgres. Order is
red-before-green:

- §1 belt: red — garden slices fail `ideas` and
  `organization`; green after §2.
- §3 invitations: unknown — the test decides; green after
  §3 (product fix) or §7 (doc fix).
- §4 readiness: red — F2 has no flow; green after §4.
- §5 retirement: `./validate` green throughout; the
  retargeted tests pin the new truth at each step.
- §6 AT4: seven skipped tests now run; once, on A3's
  database.

## Commits

One concern each, present-tense imperative, ≤ 50 chars,
rebase and fast-forward. Order: §1 test (red) → §2 seed →
§3 test (+ fix if red) → §4 seed + test → §6 TEST-PLAN AT4
→ §5 steps 1–6 → §7 → §8.

## Evidence

Run summary of 2026-08-22T07:24:00Z; hunter mitigation
specs under `docs/superpowers/test-plan-mitigations/`;
`8f23fb31` (stubs, G41 deleted, G21 kept); `076d29d8`
(Postgres uuid columns, outside the AT gate).

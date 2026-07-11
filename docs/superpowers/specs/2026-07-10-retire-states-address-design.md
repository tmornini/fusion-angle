# Retire the /states/ write address

Date: 2026-07-10 · Status: approved · Verified against HEAD f3fa3789

## Context

`PUT /states/:id` is the last live write route on the states address.
Phase 15 retired its read siblings (bare `GET states/:id` is 405 only
because PUT survives); Phase Final deleted the row plane beneath it.
Three client families still ride it through the `postStateEvent`
funnel (`web-app/app/adapters/state-events.ts`): objectives
archive/reactivate, member (human + AI) state changes, and work-order
unclaim. The seed plane independently synthesizes 862 states-address
pairs (860 work-order trace events + 2 system-member genesis events).

The goal: every remaining writer moves to an honest named op or
document path, then the address dies on every verb — route, derive
source, seeds, and response specs. The app is pre-release; no
live-user data migration is owed. Decisions made during design:

- Full address retirement (not route-only): nothing recognizes,
  writes, or seeds `/states/` afterward.
- Members and objectives convert to lifecycle-TRIO document families
  (the ideas/projects/records/flows posture), deliberately retiring
  two documented covenants (see §2/§3).
- Unclaim becomes a named op completing the work-order triad.
- Seeds reshape 1:1 into live op shapes; all count pins re-baseline;
  `SNAPSHOT_SCHEMA_VERSION` bumps 3→4.

The derived states log is the parity oracle throughout: pair shapes
change; the derived events (ids, states, ats, authors) must not —
except where this design deliberately adds objective genesis rows.

## §1 End-state wire surface

| Route | Fate |
| --- | --- |
| `PUT /states/:id` | Deleted with its whole route entry; every verb on the address is a router 404 (the documented 405-because-PUT-survives case disappears) |
| `GET /states` | Survives unchanged (derived collection) |
| `GET /entity-states/:id/history` | Survives unchanged |
| `GET /states/:id/field-values` | Survives unchanged (served by the transition fold alone after §5) |
| `PUT objectives/:id` | Existing route; body widens to carry the trio |
| `PUT members/:id` | Existing live route (`documentPutHandler(MEMBERS_WIRING)`); body widens to carry the trio |
| `POST work-orders/:id/release` | New named op |

Authorization tightening (deliberate, named): today the plain
`member` role can `PUT /states/:id` and transition any entity's
lifecycle at the policy layer. After: member and objective lifecycle
writes are admin-only by construction (`MEMBER_VERBS['/members']` and
the objectives surface already gate non-GET to admin), matching what
the UI enforces; unclaim keeps member-tier access via the release op
(`MEMBER_VERBS['/work-orders']` already includes POST).
`MEMBER_VERBS['/states']` drops PUT, leaving GET.

Notification plane: verified zero-change. `identityTargetsFor`
(`api/notifications.ts`) has no states arm; the replacement routes
inherit the same generic org-scope + actor posting (K29) that the
states route had.

## §2 Objectives → trio family

- `OBJECTIVES_WIRING.lifecycle` flips `'stateless'` → `'trio'`
  (`api/routes.ts`); the generic document-family lifecycle machinery
  (tombstone walk, lifecycle validation branch) activates untouched.
- `validateObjectiveDocumentBody` grows
  `state`/`state_at`/`state_event_id` (mirror
  `validateIdeaDocumentBody`; `OBJECTIVE_STATES` already exists).
  `validateObjectiveCreateBody` gains
  `initialState`/`initialStateEventId`/`initialStateAt` (mirror
  records/AI-member creates). `objectiveDocumentBodyOf` folds the trio
  (mirror `recordDocumentBodyOf`).
- New `api/derive-objectives.ts` with `deriveObjectiveStateHistory`
  (documentPairsAt + documentLifecycleEvents + stateHistoryFrom,
  the derive-ideas.ts shape) joins `trioFamiliesFor` as the fifth
  org-nested trio family.
- Client: `postObjectiveCreation` mints the initial trio
  (`'active'`, `generateCryptoSafeBase62()`, `nowUtc()`).
  `postObjectiveArchival`/`postObjectiveReactivation` stop calling
  `postStateEvent` and PUT `objectives/:id` with
  `{position, state, state_at, state_event_id}`. A new
  `getObjective(ctx, id)` read supplies the current position before
  the PUT (accepted get-then-put race vs. concurrent drag-reorder on
  an admin-only page; objectives concurrency is 'simple').
- Seeds: every seeded objective create body gains the initial trio;
  seeded objectives gain explicit genesis rows in the derived log
  (deliberate growth; pins re-baseline).
- Covenants retired, comments rewritten (never left stale):
  absence-as-active (R2) and the genesis dilemma at
  `api/routes.ts` (OBJECTIVES_WIRING block),
  `api/validators.ts` (objective body comment), and
  `api/derive-states.ts` ("WHY SIX, NOT SEVEN").

## §3 Members → trio family

- `MEMBERS_WIRING.lifecycle` flips to `'trio'`;
  `validateMemberDocumentBody` widens from `{type}` to
  `{type, state, state_at, state_event_id}`.
- Echo-vs-transition is the records contract: the CLIENT sends the
  trio verbatim — echoed on detail edits (it holds the loaded
  member), fresh on state changes. No server-side head lookup:
  `documentLifecycleEvents`' first-occurrence-wins dedup by
  `state_event_id` resolves echoes at derive time, and a
  byte-identical echoed `members/:id` body folds by `message_hash`
  into the existing pair (the memberDocument fold precedent).
- Creation ops (`postHumanMemberCreationOp`,
  `postAiMemberCreationOp`) move `initialState*` off the op body into
  the `members/:id` document pair body (`memberDocumentBodyOf` gains
  trio params). Edit ops echo the current trio into the same pair.
- Client: `postHumanMemberStateChange`/`postAIMemberStateChange`
  repoint from `postStateEvent` to `PUT members/:id` with the full
  trio body (`s.variant` supplies `type`; ids/ats minted as today).
  Save stays decomposed (Phase 10 Task 2 posture): detail, PII, and
  state remain independent honest writes.
- Derive: `deriveMemberGenesis` is REPLACED in its same global-plane
  union slot by a members-trio derivation over `members/:id` document
  history (members are `organizationNested: false`; the new reader is
  global-scoped like the one it replaces — the per-org
  `trioFamiliesFor` machinery is not bent to fit).
- The system member is the third genesis site (no creation op): its
  directly-seeded `members/:id` document pair gains the trio (same
  event id `seed-member-…-active`), in BOTH the mock-data seed and
  the bootstrap mirror; both bare genesis event pairs die.
- The "FREEZE at genesis" refutation comment
  (`api/routes.ts`, MEMBERS_WIRING block) is rewritten — its premise
  (a competing states/:id log) dies with the address.
- Compatibility greens (validated): `MemberState` never collides with
  `DELETED_STATE`, so archived members stay visible; roster verb-gap
  405 pins are unaffected (PUT was never a gap); invitation accept
  never touches member documents.

## §4 Work-order release op

- `POST work-orders/:id/release`, body
  `{releaseEventId, releaseAt}` — camelCase per the op-body
  convention (claim/transition/create precedents).
- `postWorkOrderReleaseOp` mirrors `postWorkOrderClaimOp`'s single
  read-decide-append transaction: live unexpired claim → append the
  pair carrying the `claim_released` event; no live claim →
  idempotent no-op success (204 either way). Release stays open to
  any org member (today's behavior; UI shows Unclaim only when
  claimed).
- Add list (each omission is a silent failure, validated):
  - `WORK_ORDER_RELEASE_PATTERN` beside claim/transition patterns
    (`api/derive-states.ts`);
  - a `'release'` action in `replayWorkOrderOperations` +
    `deriveWorkOrderLifecycle` + `workOrderClaimSourcesFor` (so a
    later reclaim and the claim history see the release);
  - a `'release'` leg in `organizationHasOpBornEvent`
    (`stateEventVisibilityFor`);
  - `WRITE_RESPONSE_SPECS['work-orders/:id/release'] = {status: 204}`;
  - `PAIR_WIRED_ROUTE_PATTERNS` entry (`api/message-pair.ts`) — the
    pair-coverage exit test enforces this.
- New `validateWorkOrderReleaseBody` beside
  `validateWorkOrderClaimBody`.
- Client: `deleteWorkOrderClaim`
  (`web-app/app/adapters/work-orders-deletions.ts`) posts the release
  op with client-minted id/at. Composes with the transition op's
  implicit release through the shared (at, id)-sorted replay.

## §5 Seed reshape

All 862 seeded states-address pairs die; nothing new is invented:

- 860 trace events (212 hand-authored — the "211" comment was stale —
  + 649 generated) become 1:1 `work-orders/:id/transition` op-shaped
  pairs: `transitionEventId` = old event id, `transitionAt` = at,
  `targetState` = node state, requester = the event's own member.
  NOT creation ops: the creation gate's exact-3 `'claimed'`-slot
  semantics do not match historical traces (zero seeded claim
  events; four 2-event in-flight fixtures). No validator relaxed,
  no event invented.
- The 7 `state_field_values` leaf pairs fold into their parent
  transition pairs' `fieldValues` bodies (WO01 Review carries 6,
  Complete carries 1); the leaf pairs and their
  `WRITE_RESPONSE_SPECS['states/:id/field-values/:fvid']` entry die.
- The 2 system-member genesis pairs fold into `members/:id` trios
  (§3). Seeded member/objective creates gain `initialState*`.

## §6 Derive-plane retirement, pins, snapshot

Deleted: `STATES_ADDRESS_PATTERN`, `eventPairStatesFrom`,
`deriveEventPairStates`, `stateEventCollisionFromPairs`,
`WRITE_RESPONSE_SPECS['states/:id']`, `stateEventSeedBody`, the
field-values leaf source (`leafFieldValueCandidates` + its address
pattern), `postStateEvent` (its callers repoint per §2–§4;
`state-events.ts`'s read helpers survive), the `states/:id`
pre-dispatch ownership fence block in `api/api.ts`, and the
route entry itself.

Re-anchored: `stateEventVisibilityFor` (op-born + trio sources only),
`workOrderLifecycleStatesFor` (loses the states-address arm),
`deriveStates`/`deriveStatesFor` unions (objectives trio in, members
trio replacing member genesis, event-pair source out).
`documentStateHeadFor` is a test-only parity helper with zero
production call sites — it loses its states arm or retires with its
tests, decided at implementation.

Pins re-derived empirically after reseed — the derived-log parity
check is field-level equality, not a count. Expected landing zones
(not promises): mock-plane pair count ≈ 1506 (1514 − 860 trace − 1
genesis − 7 leaf + 860 transitions), bootstrap ≈ 13 (its genesis
mirror folds into its members/:id pair). `SNAPSHOT_SCHEMA_VERSION`
3→4
(blanket version reject verified sufficient; `scanForRetiredKeys`
and the client snapshot scanner need nothing).

## §7 Verification

- `./validate` green at every stage boundary (type-check + suite +
  lint + schema gate).
- Derived-log parity: before/after drift assertions on
  `deriveStates`/`deriveStatesFor` output for seeded data — identical
  rows except the deliberate objective genesis additions.
- Live-path checks (browser or api tests): objective archive →
  reactivate round-trip; member state dropdown save (human + AI,
  detail-only save still folds); claim → unclaim → reclaim; claim →
  transition-with-release; `GET /states/:id/field-values` for WO01's
  Review event returns its 6 values.
- Wire pins: every verb on `/states/:id` is 404; release op 204 on
  both branches; retired-covenant tests rewritten, never weakened —
  each old assertion either retires with its subject or is re-pinned
  to the new contract.
- Test blast radius (validated): ~6 objective files, ~9 claim-path
  files, the two dedicated states-route files
  (`api-states-ownership-fence`, `derive-state-event-collision` —
  largely retired with their subject), mock-data pins, drift oracles.

## §8 Staging

Four stages, each leaving `./validate` green; the address dies only
in stage 4. One concern per commit within each stage; doc updates
land as one commit per file at the end (the established retirement
idiom).

1. Objectives trio: validators, wiring flip, derive module, adapters,
   seeds, tests.
2. Members trio: validators, wiring flip, creation/edit op fold,
   derive replacement, system-member seed fold, adapters, tests.
3. Release op: op + route + specs + pair-wiring + derive legs,
   adapter repoint, tests.
4. Address deletion: seed trace/field-values reshape, route entry +
   fence + derive sources + specs + funnel deletions,
   `MEMBER_VERBS['/states']` PUT drop, pin re-baselines, snapshot
   bump, then docs (CLAUDE.md, SCHEMA.md, ARCHITECTURE.md,
   API-TREE.md, TEST-PLAN.md — one commit each).

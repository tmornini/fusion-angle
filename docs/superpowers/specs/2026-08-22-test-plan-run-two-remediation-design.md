# Test-plan run two remediation: boot spine, bound seeds, PII tombstone

## Problem

The second 2026-08-22 TEST-PLAN run (parallel mode, slice
seed, serial hunters on one Chrome profile) reported AT
green and then 35 browser FAILs in nine clusters plus three
DRIFT candidates. Run one's remediation (`2026-08-22-test-
plan-run-remediation-design.md`) had greened the belt; the
belt asserts that every page's reads RESOLVE, and an empty
list resolves. Four clusters sailed through it with their
subject absent or degenerate.

Every FAIL reduces to one of ten mechanisms, each verified
in source and six reproduced on the memory backend:

1. **The fetch facade recovers the password door.**
   `exchangeOnce` (`web-app/app/adapters/http-facade.ts:
   200-232`) exempts only `authentication/token` from
   401-recovery. A wrong password 401s on
   `authentication/authorize`, so the facade POSTs a cookie
   refresh (the `/token` 401 the hunter saw) and then
   `navigateTo('auth')` — a hard reload that resets the
   form before `web-app/auth/index.ts:619-634` can paint
   "Invalid email or password." into `#password-error`.
   The exemption landed in `8284df6a` (2026-08-15) for the
   refresh endpoint and was never widened. B9.
2. **The boot gate abandons the invitations page.**
   `bootOrganizationGate` (`web-app/app/app-boot.ts:
   275-282`) calls `bounceTo('invitations')`, discards its
   result, and returns `null`; on the invitations page
   itself `bootApp` exits before `initSidebarLayout` and
   `initPageModule`. No bell, no list, no request.
   `02dcc5c7` (2026-08-08) rewrote `49201004`'s
   `return !bounceTo('invitations')`. The server is sound:
   the mint omits empty org claims (`api/authentication.ts:
   359-361`), the gate verifies the flat token, and
   `identities/:id/invitations/` is self-or-admin. The
   reported `401 invalid_token` is a bare `fetch` of a root
   `/api/invitations` that does not exist — auth before 404
   with no bearer (`api/api.ts:508-515`). V3–V5, B25, B27.
3. **Opening a flow writes document pairs.** `onFlowLoaded`
   (`web-app/flows/detail.ts:1558, 1609`) runs migrate-to-
   center and `withLayoutReconciled()`; both `#queueSave`
   (`presenters/flow-designer.ts:400-426, 755-807`). An
   auto-layout flow gains two pairs per open, and
   `resolveFlowUndoTarget` (`api/derive-flows.ts:261-312`)
   walks every `flows/:id` pair as a step. Undo after
   navigation reverts the open's noise first. Measured:
   pairs 3 → 5 on open; the rename survives two undos.
   A second trap: undo restores `is_locked` (`api/routes.
   ts:1541`), so history behind any lock-on pair is
   unreachable from a designer that refuses undo while
   locked. F46.
4. **F2's Capture refs resolve to nothing.** `formF2Extras`
   (`api/test-plan-slices.ts:1124-1137`) references
   `f2-node-capture-attr-text` / `-select` — ids that exist
   only in `SLICE_ENTITY_IDS` (`:395-396`). No attribute
   document, no record type, no `flows/:id/records`
   binding. The action screen throws `attribute reference
   points to unknown attributeId` (`presenters/workbox-
   detail.ts:588-599`), the same invariant the server holds
   at the transition gate (`api/record-constraints.ts:
   258-267`). WB5–WB19b.
5. **No garden binds its record.** The slice file contains
   no `records/:frid` pair at all; every garden node
   carries `attributes: []` (`:1702-1724`). Bound lists,
   the designer's Record dropdown, and the Capture gate are
   empty by seed. R3, R11, R13.
6. **Three work orders at one instant.** Each garden WO is
   parked by one transition at the seed's single
   `requestAt` (`:1914-1920`), so Capture and Review hold
   identical open-ended sojourns (`heatT` 0.50 each,
   `flow-stats-aggregate.ts:343-350`), faces show minutes
   since seed, and the one completed run's path is
   `[archive]` with no edges. FS7's "no pulse" is a PASS
   the mitigation stub inverted. FS3, FS7.
7. **Ideas share one position.** Every garden idea clones
   `buildIdeas()[0]` (`:1413-1427`) — `position: 1` — so
   `positionBetween(1, 1) = 1` and most drops re-PUT to the
   tail. Separately, the MCP `computer` drag cannot start a
   native drag session (CDP mouse events never do without
   drag interception), and the Known-MCP-limitations
   "EXEMPT … driveable" bullet was never a recorded PASS.
   The product and its persistence (`putIdea` with
   `position`) are intact. D36, D37.
8. **A hunter probe, not the product.** Project detail
   toggles `hidden` on `#project-review-actions` /
   `#project-lifecycle-actions` while editing (`web-app/
   projects/detail.ts:216-232`, shipped `2235662f`); the
   hunter read the inner `.action-bar`'s own computed
   `display:flex`, which a `display:none` ancestor does not
   change. E10a.
9. **Timing.** Every `showToast` toast carries a live
   `.toast-close` (`web-app/app/toast.ts:76-81`); the 6 s
   auto-dismiss beat the screenshot-click loop. I24.
10. **Erasure retires login.** `authorizePassword` resolves
    the identity only by PII email (`api/authentication.ts:
    1516-1521`); G46 erases `G Member`, the G slice's only
    non-admin human (`:1021-1027`), so V7 after G46 cannot
    sign in. V7.

Drift: the C slice seeds no score pairs, so the Impact
gauge reads `—` and all four Objectives rows are
`data-empty` (C4, C7); the F slice's one flow is a linear
chain with zero cycle edges and no "Layout Test: Proposal
Review Cycle" (F9, F75).

Owner decisions taken in the brainstorm: designer flags are
guards, not undo content; the FS population is about twelve
work orders; PII erasure retiring email login is intended;
READY-gate hardening is later work; and `identities/:id/pii`
becomes an ordinary document family — today every PII write
physically deletes the prior pair (`api/pii-hard-delete.ts:
46-52` → `DELETE FROM message_pairs`, `api/backend-postgres.
ts:508-518`), on PUT and DELETE alike, the one hard delete in
the codebase.

## Goals

- The three product faults fixed behind red-first pins:
  facade credential doors, the invitations boot gate, the
  designer's open-time writes and the undo flag rule.
- Slice seeds that satisfy the product's invariants and give
  every failed case its subject: record-bound flows for the
  gardens and F2, distinct idea positions, the Layout Test
  flow in F, scores in C, a generated FS population, a
  second erasable human in G.
- `identities/:id/pii` append-only like every other family;
  the retained PII recorded as a KNOWN seam with its closer.
- TEST-PLAN corrected to the slice seed and to this MCP:
  hunter probe discipline, a DnD recipe, a toast recipe,
  Serial/Parallel clauses where the slice differs.
- The belt builds the workbox action screen per row.

## Non-goals

- READY-gate rejection of dangling attribute refs and
  designer-unbind pruning (later work).
- Consolidating the two client 401-recovery layers (later
  work).
- Toast pause-on-hover (later work).
- Physical PII erasure — the coming security step closes the
  seam this spec opens.
- A second bound flow in R, mnemonic work-order ids, extra
  FS seats, an F `flow_id` reveal line.
- Re-running the browser plan. This spec prepares it.

## Design

### 1. Product: credential doors are recovery-free (B9)

`http-facade.ts:217` becomes a named predicate,
`isCredentialDoor(resource)`, true for
`authentication/authorize` and `authentication/token` —
the same pair `server/throttle.ts:12-18` names. A credential
door's 401 means "wrong credential", never "stale session";
`exchangeOnce` returns the first response for it.

Pin, `tests/adapters-http-facade.test.ts` (its own
`withMockFetch` and `document`/`window` stubs): a 401
`{error:'invalid_grant'}` on `POST authentication/authorize`
rejects with `UnauthorizedError`, fetches exactly one URL,
and leaves `window.location.href` unchanged. Red today
(`[authorize, token]`, `../auth/index.html`). An adapter-
level sibling pins `postPasswordLogin` over
`createHttpFacade` to `null` with one fetch.

### 2. Product: the invitations page boots unscoped (V3–V5)

`app-boot.ts:275-282`:

```
if (organizations.length > 0) return organizations;
if (bounceTo('invitations')) return null;
return organizations;
```

Boot continues with an empty set on the invitations page;
`initSidebarLayout([])` and `sidebar-member.ts` already
render the zero-membership chip (`layout.ts:103-121`). No
gate changes: the server fence is untouched.

Pin, `tests/boot-organization-gate.test.ts`: export
`bootOrganizationGate`; stub `document.documentElement.
getAttribute` → `'invitations'` (`tests/auth-redirect-login.
test.ts:1-10` precedent); seed `postTestPlanSlices`;
`putClientFacade(wrapInPageAdapter(db))`;
`putSessionToken(await reachableToken(UNSEATED, []))`;
assert the gate returns `[]`, not `null`. Red today. If
`app-boot.ts`'s import graph resists Node, extract the
decision as a pure `resolveOrganizationGate(reachable,
currentPage)` (`credential-resolution.ts` precedent) and pin
that.

Claim parity, one more green-today pin in
`tests/api-authentication-token.test.ts`: the product's
password grant for the unseated slice identity, code
exchange, and Set-Cookie refresh yield a token with neither
`organization` nor `organizations`; `GET identities/:id/
organizations/` is 200 `[]`; after the G admin's grant,
`GET identities/:id/invitations/` is 200 with one pending.
`reachableToken(id, [])` emits `organizations: []`; both
read as none, and the pin says so.

### 3. Product: open writes nothing; flags are guards (F46)

Client. `#runAutoLayout` stops calling `#queueSave` —
reads recompute auto-layout positions on every GET
(`flow-graph-layout.ts:82-119`), the argument `2a03626e`
made for undo. `#computeMigrateToCenter` normalizes the
in-memory snapshot without queueing a save; the next genuine
edit persists the centered positions. Opening a flow is a
GET with no side effects. The auto-layout reconcile after
add/delete (`detail.ts:277, 385, 419, 578`) no longer lands
a second pair per operation, so F32 / F35 / F37b revert in
one click on auto-layout flows.

Server. `is_locked`, `is_auto_layout`, and `is_auto_fit` are
guards: `postFlowUndoOp` (`api/routes.ts:1495-1590`) carries
them from the CURRENT head, never from the target, and
`resolveFlowUndoTarget` pushes a stack step only when a
pair's `(name, graph)` differs from the previous step's —
a flag-only pair is carried, not restored and not counted.
Redo's in-memory stack keeps its shape.

Pins, `tests/flow-undo-cursor.test.ts` and a new
`tests/flow-designer-open.test.ts` on the seam the comments
at `flow-undo-cursor.test.ts:805-836` and
`flow-designer-presenter.test.ts:268-278, 355-373` call
unreachable — `putClientFacade(wrapInPageAdapter(db))` plus
`putSessionToken(DEV_TOKEN)` makes `sessionContext()` live
under `node:test`; those comments are corrected in the same
commit:

- (i) seed, set `isAutoLayout`, `putFlow` a rename, count
  pairs N; build the presenter as `onFlowLoaded` does
  (`withCanvasSize`, `withLayoutReconciled()`, drain
  `enqueueFlowSave`); assert the count is still N (today
  N+2); `performUndo` with empty stacks; assert the name
  reverted (today "Alpha Renamed" survives).
- (ii) rename → `withLockToggled()` twice through fresh
  presenters → open → one undo: the name reverts,
  `isLocked` stays false.
- The "content-invisible save consumes a step" case
  (`:837-888`) retargets to the new rule — a covenant
  changed by owner decision, not a weakened test.

### 4. Seed: one record-bound flow former (WB, R)

`formRecordBindingMessagePairs({ organizationId, adminId,
requestAt, recordId, attributes, flowId, bindingId })` in
`api/test-plan-slices.ts` forms the record-type op and
document (`validateRecordWriteBody`, `recordDocumentBodyOf`),
one attribute PUT per attribute
(`recordAttributeDocumentBodyOf`), and the binding pair at
`organizations/:id/flows/:id/records/:frid` via the exported
`flowRecordJoinSeedBody` (`api/mock-data/seed-message-pairs.
ts:1047`), written through `postRecordWriteOp` and
`postFlowRecordDocumentOp` inside the existing transaction.
The gardens and F2 both call it — two sites in one file plus
the mock is the pattern.

Gardens: Data Capture refs Company Name and Contact Email
(`editable`, `isRequired: true`), Review refs both
`readonly`; seven binding ids `{c,d,e,f,fs,k,r}-flow-record`
join `SLICE_ENTITY_IDS`. F2: Capture refs retarget to the
minted-but-unused `f2-attr-1` (`text`) and `f2-attr-2`
(`select`, with options — `api/validators.ts:2794-2800`);
the two `f2-node-capture-attr-*` slots leave; `f2-flow-
record` and one instance genesis PUT (`f2-instance-1`,
`{ values: [] }`) arrive for WB10a. `EXPECTED_SLICE_MESSAGE_
PAIRS` rises 380 → 393 (+7 bindings; +6 for F2: op, doc,
two attributes, binding, instance).

Pins: `tests/slices-workbox-action-screen.test.ts` — F2
admin, `postWorkOrderCreation` from the reveal `flowId`,
then exactly `workbox/detail.ts:357-366` and `:392-396`,
`new WorkboxDetailPresenter(...)`, `buildPage()`; assert the
binding is non-null, two renderable attributes, a `<select`
in the page, `isBound() === false`, one pickable instance.
Red today with the hunter's message.
`tests/slices-record-binding.test.ts` — R admin;
`getFlowSummariesForRecord` names Customer Onboarding,
`getWorkOrdersForRecord` returns three, `getRecordForFlow`
is the record, WO `r1`'s current node refs resolve through
`getRecordAttributesByRecord`. Red today, three of three.

### 5. Seed: distinct idea positions (D36)

`formGarden` stamps `position: i + 1` per
`IDEA_GARDEN_STATES` index, the `projectPosition` counter's
shape (`:1473-1484`). Pin in `tests/test-plan-slices.test.
ts`: the four positions are distinct. Pair count unchanged.

### 6. Seed: the Layout Test flow in F (F9, F75)

`formFExtras`, on the `formF2Extras` pattern, seeds "Layout
Test: Proposal Review Cycle" from `buildFlows()` picked by
name (the literal at `api/mock-data/flows.ts:640-1025`,
already reused by `work-orders.ts:62-63`), joined to
`f-project-approved-2` so the F1 badge resolves, written
through `postFlowCreationOp` (op, document, join). +3 pairs.
Ids: three canonical `SLICE_ENTITY_IDS` for the flow, the
join, and the state. Pins: the F slice lists two flows; the
Layout Test flow has 17 nodes and 23 edges and
`findCycleEdgeIds` (`web-app/app/flow-cycle-edges.ts`)
yields exactly `{'txieWmAdbSTRDAZIghdvag'}`. The garden
pins that read `flows[0]` select by name.

### 7. Seed: scores in C (C4, C7)

`formCExtras` writes baseline and actual scores for the two
approved C projects across the four objectives via
`buildSeedScoreRows(projects, pools)` (`api/mock-data/
scores.ts:72-190`, third caller) through
`postBaselineScoreDocumentOp` / `postActualScoreDocumentOp`
(`api/routes.ts:2602-2640`). Pair delta measured at
implementation (eight baselines plus the generator's
actuals). Pin: as C admin,
`getPortfolioImpactSummary(ctx).baselineMean` is defined and
every `buildObjectiveAggregates` row has
`projectsBaselineScored === 2`. Red today.

### 8. Seed: a generated FS population (FS3, FS7)

`generateFlowWorkload` (`api/mock-data/flow-workload.ts`)
gains `organizationId` and `nowMs` parameters, no defaults;
`lead-to-close-flow.ts:398` passes `STARK_ORGANIZATION` and
`now.getTime()`, so the mock output and the 1448 pin stand.
The FS garden's flow gains the mock's `needs revision` edge
(Review → Data Capture) so a loop path exists; the other six
gardens keep three edges. For `token === 'fs'` the work-
order list comes from the generator — twelve work orders,
paths happy ≈ 0.7 / loop ≈ 0.15 / in-flight ≈ 0.15, sojourns
Capture 72 h σ 0.8 and Review 18 h σ 0.5, skill admin 1.0,
`nowMs = Date.parse(requestAt)`, a fixed seed — and the
existing doc/join/transition pair-forming turns it into
pairs. Roughly +63 pairs, measured. The three-work-order
garden pin becomes FS-aware.

Pin, `tests/slices-flow-stats.test.ts`: as FS admin,
`getFlowStats(ctx, flowId, nowMs)` has Data Capture `heatT`
greater than Review's, both above zero; at least two path
entries; path one rooted at Create with three or more edges;
`incompleteWorkOrderCount >= 1`. Red today on all four.

### 9. Seed and plan: a second erasable human in G (V7)

`formGExtras` seeds `G Erasable`
(`g-erasable@test-plan.example`) the way it seeds `G
Member`; G46 erases it; V7 keeps `G Member` and runs before
G46; V7's invitee half is granted from the second G
organization, where the G admin also holds a seat. The
reveal names the new identity. Pair delta measured.

### 10. PII erasure is a tombstone

`identities/:id/pii` rejoins `DOCUMENT_CLASS_ROUTE_PATTERNS`
(`api/message-pair.ts:994`): a pre-tx head-read, `Supersedes`
provenance, If-Match like every document.
`postIdentityPiiDocumentOp` and the DELETE closure
(`api/routes.ts:2790, 4068`) call `appendMessagePair`, as
`postIdentityDocumentOp` does. `api/pii-hard-delete.ts` is
deleted. `messagePairs.delete` then has no caller: it leaves
`DbAdapter` (`api/db.ts:119`) and both backends
(`backend-postgres.ts:228-234, 508-518`; memory). Derives
need no change — `deriveDocumentsAt`'s head-absence rule
already reads a DELETE head as erased, and a PUT after it is
live again. The torn-read closure comment in
`derive-identity-spine.ts:53-62` and the hard-delete
comments in `routes.ts` and `message-pair.ts` go; the shared-
transaction read stays.

Tests: `tests/api-pii-hard-delete.test.ts` is renamed
`tests/api-pii-tombstone.test.ts` (rename commit, then
content commit). PUT-PUT leaves two pairs, the head with
`Supersedes`; PUT-DELETE leaves a bodyless DELETE head and an
absent derive; DELETE-PUT is live again at three pairs; the
byte-identical resend cases follow the ordinary document
replay rule; the confinement case becomes "no address
splices": PUT-PUT-DELETE adds exactly three pairs. The
erasure-completeness case (`:255`) inverts into the seam's
pin: the erased name remains in superseded pairs while
`deriveIdentityPiiRows`, the roster, and password login
show none (401 `invalid_grant`). Red first; green after the
append change. Seed pair pins (1448, 380) are untouched —
each seeded identity's PII is written once.

Register. Under ARCHITECTURE's KNOWN register (`## KNOWN
seams` once `2026-08-22-known-seams-later-work-design.md`
has landed; `## Known residuals` until then, moving with it):

```
- Erased PII persists as superseded pairs; derived reads
  and login show none — tests/api-pii-tombstone.test.ts
```

and under Later work:

```
- Physical PII erasure — closes KNOWN seam: Erased PII
  persists as superseded pairs
```

AUDIT's `m` becomes the new bullet count. SCHEMA.md § "PII
erasure — the one hard delete" becomes "PII erasure is a
tombstone": no physical delete exists. TEST-PLAN G46's
"ledger-deep" paragraph becomes the tombstone-head assertion
plus the seam sentence.

### 11. TEST-PLAN corrections

- **Known MCP limitations.** Replace the DnD "EXEMPT …
  driveable" bullet: list-row reorders are not `computer`-
  driveable; drive them synthetically — `pointerdown` on
  `.drag-handle`, a real `DataTransfer`, two or more
  `dragover` samples for D37, then `drop` and `dragend`;
  verify persistence by reload; window at or above 768 CSS
  px, filter All. Add hunter probe discipline: visibility
  via `checkVisibility()` or `getClientRects()`, never a
  descendant's computed `display`; never hand-`fetch` the
  API from `javascript_tool` — the bearer is memory-only,
  read the network log; toasts via one `javascript_tool`
  call on the Members invite dialog's synchronous "Email is
  required" toast, clicking `.toast-close` after the 300 ms
  entrance and asserting detachment inside 3 s.
- **E10a.** Name the observable: the two containers carry
  `hidden` while the inner `.action-bar` keeps its own
  `display:flex`; the objectives section and flows sidebar
  stay visible in edit mode.
- **F46.** State the rule: graph and name are undo content;
  Locked, Auto Layout, and Auto Fit are guards that undo
  never flips and never counts.
- **Serial / Parallel clauses** (the G43 form): C4 and C7
  with the slice's counts and the seeded scores (a `—`
  Impact or a `data-empty` row is a FAIL); R1 (Customer
  Profile only), R3 (Customer Onboarding; `#r1` – `#r3`),
  R13 and R14 (`#r1`); F9 and F75 (open the Layout Test
  flow); FS3 and FS7 (Capture hottest, Review warm, two or
  more paths, path one rooted at Create, `next` enabled;
  the no-pulse sentence stands); V3 (the wire path is
  `identities/:id/invitations/`); V7 (runs before G46; the
  invitee half is granted from the second G organization);
  G46 (target `G Erasable`; tombstone text).
- **A3 reveal.** The G credential map gains the erasable
  identity.

### 12. Belt: the action screen per row

`tests/slices-page-boot.test.ts`'s `workbox-detail` entry
runs wave two (`getRecordAttributesByRecord`,
`getRecordInstances`) and `buildPage()` per row, as
`init()` does. Green on the gardens after §4; it would not
have caught F2 alone (zero rows), so §4's creation pin stays.

### 13. Later work

Named in ARCHITECTURE's Later work, each with its oracle:
READY gate rejects dangling attribute refs and unbind prunes
them (`tests/adapters-flow-publish.test.ts`); one client
401-recovery voice through `redirectToLogin()` with
`?return=` (`tests/adapters-http-facade.test.ts`); toast
pause on hover and focus; physical PII erasure (§10's
closer); the mock seed's fixed 2026-06-15 anchor — after
2026-09-13 serial-mode FS3 carries in-flight heat only.

## Testing

Every new test runs under `./test` on memory in both TZ
passes; none needs Chrome or Postgres. Red before green:

- §1 facade: red — two fetches and a bounce.
- §2 gate: red — `null` on the invitations page.
- §3 open and flags: red — N+2 pairs, name survives, lock
  restored; the wave-two cursor case retargets.
- §4 action screen and binding: red — unknown attributeId;
  empty lists.
- §5 positions: red — four ones.
- §6 Layout Test: red — one flow, no cycle edge.
- §7 scores: red — `baselineMean` undefined.
- §8 stats: red — 0.50 twice, one path, `[archive]`.
- §9 erasable: the seam pin stays green; the plan carries
  the ordering.
- §10 tombstone: red — one pair after PUT-PUT.
- §12 belt: green throughout.
- `./validate` green after every commit.

## Commits

One concern each, present-tense imperative, about fifty
characters, rebase and fast-forward. Pins land red before
the change that greens them. Order: §1 pin → fix; §2 pin →
fix → parity pin; §3 open pin → client fix → flag pin →
server fix → comment corrections; §4 two pins → former +
gardens → F2; §5 pin → positions; §6 pin → extras; §7 pin →
extras; §8 pin → generator parameters → FS edge →
population; §9; §10 rename → tombstone pins → append →
delete module → remove primitive → comments → SCHEMA →
register; §11; §12; §13.

## Evidence

Run summary of 2026-08-22 (build after `b0785ef5`); hunter
mitigation stubs under `docs/superpowers/test-plan-
mitigations/`; investigator reproductions on the memory
backend (scratchpad only, not committed); `8284df6a` (facade
exemption), `02dcc5c7` and `49201004` (boot gate),
`2235662f` and `ee7f8c8a` (E10a shipped with its case),
`e4468210` (F2 flow seed), `645b413f` (garden replica
without the loop edge), `2a03626e` (placeholder positions),
`bbcbde8e` (canonical slice ids), `9ccdab40` (the G43
Serial/Parallel precedent).

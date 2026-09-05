# Critical functionality path: ship the seventeen bullets

- Date: 2026-09-04
- Status: awaiting review, pre-plan
- Worktree: `.worktrees/2026-09-04-critical-functionality-path`
- Base: master at `cfafb32e`
- Ships: fourteen bullets whole; one bullet less a
  narrowed residue; three new pins; one bullet moved
- Leaves: R6/R7 narrowed to its walk; the composed-op
  inner-pair clause narrowed to what the gate cannot see;
  the membership-scoped profile as critical product path
  item 4; the GPU note in Later work

## Problem

`## Critical functionality path` carries seventeen
bullets, each with an oracle, none sequenced, all off the
twelve-item product path. Six readers read every bullet
against `cfafb32e`. Every claim is still true, and seven
are not as described: the marquee bullet's interleaving
was authored by an audit rewrite and the tree does not
support it; the seed-anchor bullet defends a fingerprint
test deleted in July; the re-init bullet overlooks that
the loading helper already owns fetch failures; the
replay sweep's "nine files" are ten; the operation-id
counts drifted; the member-removal API is done and pinned
by four tests; and the rename-after-delete bullet
understates itself — the rename fires synchronously
inside the delete's own rebuild, and two redo clears
fire, not one. One bullet, the ACL conflation, is a live
bug measured end to end: an admin creates an attribute
without role keys, GET shows the defaults, and a member's
value write answers 403.

The bullets also lean on a referent nothing defines. The
Sequencing section says "the profile document precedes
the roster-profile and `DEFAULT_DIM` bullets". The
operator has defined it: an organization-side profile per
MEMBER, so that the identity "Tony Stark, CEO" holding a
contractor seat elsewhere appears there as "contractor".
The tree holds the opposite covenant — one profile per
identity, stated at `api/types.ts:1301-1303` — and the
seed already carries the contradiction: the admin holds
two seats with one title. That profile is a new document
shape with backend and UI work, and it leaves this path
for the product path (Decision 1).

## Decisions

1. **The membership profile is critical product path
   item 4.** It follows item 3 (credentials and views)
   and precedes cachability, so it lands before items 6
   and 7, whose designer roster and AI seats will read
   it. Its shape — keys on the seat body, or a nested
   facet under the seat mirroring `identities/:id/pii` —
   is that item's brainstorm. The two bullets Sequencing
   gated on it take their honest absent shapes now
   (items 8-9); the profile item later replaces absence
   with the read.
2. **Scope rule, inherited from the small-items sweep.**
   An item rides only if it stays inside the files its
   bullet names or their exact sibling, pins at Layer 1
   where a pin is possible, and carries no schema
   decision. The replay flip is a wire-contract change,
   but it is the bullet's own stated fix with a precedent
   site in the tree; it rides.
3. **The seed anchor rides now.** Sequencing held it
   until 2026-09-13 to protect a fingerprint that no
   longer exists. The cliff is real — the stats window
   is ninety days — and nine days out.
4. **Absence is modeled at the call site, never in the
   helper.** `present: false`, an empty dimensions map,
   a 404 for a seat that is gone. No `??`, no sentinel.
5. **The remint serializes after the mutex, it does not
   join it.** Roles bake only at mint; a joined or
   peer-broadcast token may predate the acceptance.
6. **Validate at the gate.** Role keys are required on
   the nested attribute create; the read-side synthesis
   goes rather than becoming a fallback.
7. **Guards live in the API and the UI mirrors them.**
   The last admin seat cannot be removed; self-removal by
   any other admin can.
8. **Pins that land green prove they can fail.** Each is
   run once against a temporary mutation before its
   commit; the plan names the mutation.
9. **No reproduction for the marquee.** The fix makes the
   lookup uniform with its three unconditional siblings,
   which closes the class of failure under any
   interleaving; the browser fixtures capture no
   exceptions today.
10. **TODO.md leaves by the Close protocol.** Each
    shipping commit removes its bullet. Bullets that stay
    are corrected in the final docs commit.

## The items

Line numbers are at `cfafb32e`. "Pin" names the test that
is RED before the commit and GREEN after unless the item
says it lands green.

### Session and operator scripts

1. **Serialize the remint.** `postRemintRefresh`
   (`web-app/app/adapters/invitations.ts:241-250`) calls
   `postSessionRefresh` bare; every other refresh rides
   `runSingleFlightRefresh`
   (`session-refresh-mutex.ts:47-60`). A concurrent
   facade refresh and remint present one jti;
   `planRotation` (`api/identity-tokens.ts:194-225`)
   classifies the loser as reuse and revokes the chain.
   Add a second export beside the first that awaits any
   in-flight refresh, then latches its own; the remint
   rides it. After the mint, `principalFromToken` must
   list the accepted organization; when it does not (a
   peer tab's broadcast short-circuited the mutex), run
   once more, then throw the existing
   `SessionRemintFailedError`. Two attempts, no loop.
   Pin: `tests/adapters-shared-recovery.test.ts`
   neighborhood — two recovering contexts race a GET
   and an acceptance under `Promise.all`; both resolve,
   `deriveIdentityTokens` has zero `revoked` rows,
   credentials survive. Assert on `revoked`, not
   `rotated` — the loser is a replay today, so the
   rotation count is already one. `deleteRefreshChannel()`
   in `afterEach` for the resource sanitizer, and in the
   two existing remint tests that now open the channel.
2. **The signing key leaves seed and wipe.** Delete
   `JWT_HMAC_SIGNING_KEY` from `postgres-seed:168` and
   `postgres-wipe:109`; touch no `PG*` name. Wipe's graph
   is seventeen modules and imports neither
   `access-token` nor `authentication`. The seed's graph
   of 105 holds `access-token.ts` through
   `routes.ts:129-132` → `authentication.ts`, but the
   only callers of the mint and verify paths sit inside
   `authGrantOffered`, the token and authorize POST
   handler; `mock-data.ts` imports neither. Measured
   under `deno run`: a read without `--allow-env` for
   the name throws `NotCapable` through the optional
   chain at `access-token.ts:35` — loud, never silent.
   Pin, the seed's oracle: in `tests/pg-seed.test.ts`,
   `Deno.test({ permissions: { env: false } })` runs
   `seedPostgres` against `memoryDbAdapter()` in both
   modes and resolves. Omitted permission keys are
   denied, not inherited; the memory path does no I/O.
   `signingKeyHandle` (`:68`) memoizes, and that file
   mints nothing, so the test cannot be masked. Second
   pin: `assertNotMatch` on both wrappers' source, the
   `serve-cli` / `crank-cli` shape. `build:97-101` keeps
   the key — one binary serves.

### API

3. **A replay answers 200.** `api/api.ts:987-989` passes
   `true`; `sendWriteResponse`
   (`message-pair.ts:609-624`) picks the status at
   `:617`. Pass `false`, as the same-body PUT site at
   `:1424-1428` already does. The replay branch already
   attaches the ORIGINAL pair id as ETag (`:1024-1027`,
   `:991-1004`), pinned by
   `api-instances-patch.test.ts:904-906`, so 200 with
   the original ETag is the same-body shape the
   contract already speaks. Ten files flip their 201 to
   200: `api-write-status:199-218`,
   `api-instances-patch:853-902` (its name already says
   200), `api-instances-precedence:496-542`,
   `api-pii-tombstone:214-231` and `:238-261`,
   `api-work-order-transition-instance:1068-1095` (its
   name says 204 — corrected to 200),
   `api-work-order-binding:559-571`,
   `document-family:612-636`,
   `api-instances-create:548-567`,
   `api-flow-document:498-523`, `drift-roster:783-803`.
   DELETE replays ride the 204 arm and do not move.
   `API.md:64-65, 69-72, 76-79, 100, 103` move with them
   — the ladder's 200 line gains "replay". One commit:
   the tree is red between any two of these.
4. **The race that lost the append answers 200.**
   `appendMessagePair` (`message-pair.ts:689-701`) skips
   a duplicate `request_hash` at `:697` and returns
   void. `formWriteMessagePair` mints the pair id at
   `:214`; `writeMessagePairRows` puts at that id
   (`:705`); the gate's post-transaction lookup
   (`api/api.ts:1662-1677`) reads the pair by hash and
   passes `true`. Compare: `stored.id ===
   messagePair.id` iff THIS request's pair landed.
   Answer 200 when they differ. Zero callers change;
   `appendMessagePair` stays void. Pin: two
   byte-identical writes under `Promise.all`; exactly
   one 201, one 200, one pair. If the memory backend's
   ordering serves the second from the pre-transaction
   fast path, item 3 already makes it 200 and the test
   holds the covenant without exercising this branch;
   the plan then holds the first transaction open to
   force the in-transaction skip. What this cannot see
   — an inner pair of a composed operation skipped while
   the top-level pair landed — narrows the bullet
   (item 20).
5. **Byte-identity tests take an explicit id.** Twenty
   tests in sixteen files depend on two identical
   requests deduplicating: the ten in item 3 minus
   `document-family` (it clones the request), plus
   `api-instances-delete:349-357`,
   `api-record-types-write:359-372`,
   `api-instance-delete-restrict:379-386`,
   `api-idea-document:151-156`,
   `api-project-document:147-152`,
   `api-record-document:314-322`, and the four
   `api-invitations-fence` replays (`:348-513`). Each
   mints one `generateIdentifier()` and passes it to
   both requests, the shape `api-write-status.test.ts:25-38`
   already accepts. Green throughout.
6. **A fresh operation id per test request.**
   `tests/http-fixtures.ts:12` exports
   `TEST_OPERATION_ID`; 121 test files import it, 97
   through a local `req()` that pins it, 16 elsewhere;
   six fixtures use it, and `store-acceptance.ts:36`
   defaults to it with `??`. The Operation-ID header is
   folded into the hashed request wire
   (`message-pair.ts:195-202, 222-231`;
   `message-form.ts:107-113`), so a fresh id defeats the
   dedupe — `api-instances-create.test.ts:589-602` pins
   exactly that. Drop the argument from every helper and
   fixture so `apiRequest` mints (`http-fixtures.ts:53-57`);
   delete the `??` default; delete the export. The one
   hand workaround, `api-record-types-composed-op.test.ts:436-460`,
   loses its comment. Lands after item 3, so any site
   that silently relied on dedupe goes red by itself.
7. **The pin.** In `tests/api-operation-id.test.ts`: two
   helper-shaped writes with identical method, path, and
   body each append — the pair count grows by two. Red
   before item 6 (grows by one), green after.
8. **Role keys required at the nested attribute gate.**
   `validateAttributeDocumentCreate`
   (`api/validators.ts:2978-2984`) admits `read_roles`
   and `write_roles` as optional and stamps
   `DEFAULT_ATTRIBUTE_ACL_ROLES` (`:3031-3054`); the
   nested PUT (`api/routes.ts:5300-5327`) validates at
   `:5313-5317` but appends the gate's pair formed from
   the raw wire (`api/api.ts:938`), so a keyless head
   stores no keys. `attributeSchemaOf` (`:978-1005`)
   then synthesizes `[]` — nobody but admin bypass
   (`api/attribute-acl.ts:28-42`) — while the GET path
   re-validates and shows the defaults. Move both keys
   from optional to expected; absence is 400; delete the
   `: []` synthesis at `:998-1004`; the keys are read as
   present, and a head without them throws at derive — a
   breach proclaimed, not a case handled. The composed
   record-type create keeps stamping through
   `recordAttributeDocumentBodyOf` (`:832-856`), which
   is the seed's path and the only page path (the web
   adapter never PUTs `/attributes/:id`; grep). The
   1453 pin does not move.
   `tests/api-record-attribute-document.test.ts:174-210`
   PUTs without keys and gains them. Pin: in
   `tests/api-instances-create.test.ts`, an admin's
   keyless nested create answers 400; a keyed create
   followed by a member's value write answers 201 (the
   measured 403). `api/types.ts:38-41`'s comment stays
   true; the validator's optional-keys comment goes.
   Item 9 of the product path keeps the three-readers
   residue and the web adapter's `??`.

### Pages

9. **Re-init failures reach the page error state.**
   `subscribeOnce` (`web-app/app/channels.ts:146-154`)
   runs `void fn()`; its four callers pass `init` from
   `emptyState.onEmpty` (`records/index.ts:68-70`,
   `projects/index.ts:92-94`, `ideas/index.ts:68-70`,
   `flows/index.ts:110-112`). `loadInto`
   (`loading-states.ts:210-272`) already catches fetch
   failures and wires Try Again to `init`; only faults
   outside that try — `$required`, `sessionContext()`,
   the `onData` renderers — reach the global handler's
   toast. Add a required third parameter, the error
   handler; each caller passes
   `err => handlePageLoadError('<page>', err)`
   (`page-loader.ts:41-79`), which renders the error
   state and wires `location.reload()`, first boot's
   own recovery. `subscribeOnce` learns nothing about
   pages. `tests/channels.test.ts:94-120`'s two tests
   gain the argument. Pin: the
   `tests/ideas-empty-subscribe.test.ts` harness with
   the second `init` failing outside the fetch; capture
   `unhandledrejection` with `preventDefault`
   (`command-palette-init.test.ts:42-72`); assert zero
   unhandled and `Try Again` in the list stub.
10. **An absent roster profile is absent.**
    `emptyPersonProfile()`
    (`web-app/app/adapters/members.ts:48-56`) returns
    `present: true` over empty strings, arrays, and
    objects, at `:105` and `:127`. `HumanProfile`'s
    `{ present: false }` branch (`types.ts:688-697`) is
    the honest shape and every consumer already
    branches on it (`member.ts:99-104`,
    `human-member-detail.ts:92-98, 188-190, 527`,
    `types.ts:727-751`). Replace both sites; delete the
    helper. Pin:
    `tests/adapters-members-union.test.ts` — a
    `{ kind: 'person' }` identity with a seat;
    `getMembers(ctx)`; the row's `profile().present` is
    false (true today).
11. **The create draft is a pure step.**
    `submitHumanForm` (`web-app/members/index.ts`)
    builds its PUT body inline; extract the draft-to-body
    step beside `humanMemberPatchFromDraft`
    (`human-member-detail.ts:105-115`), behind the
    existing green tests. Refactor only; item 12's pin
    needs it.
12. **No fabricated dimension scores.** `DEFAULT_DIM =
    50` (`web-app/members/index.ts:52`) writes four 50%
    scores at `:469-474`; no page has a dimension input,
    so no assessment ever happened. `team_dimensions`
    becomes `{}`, which `pickStringNumberRecord`
    (`validators.ts:565-577`) admits and
    `WorkingStylesPresenter.buildRows` renders as zero
    rows; delete the constant. Omitting the key is not
    admissible while title and department ride the same
    whole-or-none PUT (`validators.ts:800-812`). Pin:
    the pure step from item 11 yields `team_dimensions:
    {}` for a fresh draft.
13. **The empty card says why.** `buildRows` (`working-styles.ts:81-95`)
    renders a heading over nothing for `{}`. Render
    `mutedEmptyNote` (`presenters/empty-note.ts:6`) as
    the list presenters do. Pin: the working-styles
    presenter test, empty map → the note's text.
14. **The last admin seat cannot be removed.** `DELETE
    organizations/:organization-id/members/:identity-id`
    (`routes.ts:5739-5748`) is admin-only by deny-default
    (`authorization.ts:145, 179-183`) and pinned by
    `api-organization-member-seat:265-300`,
    `api-membership-document:210`,
    `api-membership-liveness:19-35`,
    `api-write-authorizer:210`. Nothing guards the last
    admin; grep finds only the self-only revocation
    guard (`api.ts:673-681`). Inside the route's
    transaction, before the append: derive the
    organization's admin seats; when the target is the
    only one, refuse with 409 `HTTP_CONFLICT`: the actor
    is authorized and the organization's state forbids.
    The self-only revocation guard's 403 (`api.ts:673-681`)
    is for the wrong actor, not this. Self-removal by
    any other admin is allowed — access ends at the next
    mint, refresh, or expiry (`ARCHITECTURE.md:122-127`).
    Pin: one admin, DELETE own seat → refused, seat
    survives; two admins, DELETE one → 204, `GET` 404.
15. **The seat removal adapter.**
    `deleteHumanMemberSeat(ctx, id)` →
    `ctx.DELETE(seatsCollection(ctx) + id)` then
    `humanMemberChanges.notify()`, the shape of
    `deleteIdentityPii` (`identities.ts:169-175`). Pin:
    `tests/adapters-members.test.ts` — seed a seat, call
    it, the seat GET 404s and
    `deriveMembershipsForIdentity` is empty.
16. **Remove on member detail.** The actions slot
    (`human-member-detail.ts:143-146`) gains Remove
    beside Back and Edit, hidden for the last admin seat
    and shown for every other, the viewer's own included
    — the list already knows the self row
    (`member.ts:57-60`) for the dialog's copy. The confirm
    is the `role="alertdialog"` pattern at
    `identities/detail.html:3-28` /
    `identities/detail.ts:157-166, 210-213`; its copy
    says access ends at the next token refresh. Pin:
    `tests/presenter-member-detail.test.ts` — the button
    and dialog markup render for a removable seat and
    not for the last admin's.
17. **Page wiring.** `members/detail.ts` confirms, calls
    the adapter, navigates to the roster. TEST-PLAN
    B28 (`:1453`) regains the restore branch that
    `c40db03e` dropped; the setup paragraph (`:1414`)
    stops saying "seed-produced"; `ARCHITECTURE.md:135-154`
    gains one removal sentence. The live landing on
    `invitations/index.html` stays Layer 3.
18. **A toast pauses under pointer or focus.**
    `web-app/app/toast.ts:136` discards its
    `setTimeout` id. Per toast: `mouseenter` / `focusin`
    clears the timer and records the remainder;
    `mouseleave` / `focusout` re-arms with it. A paused
    toast still counts toward `MAX_TOASTS` (`:113`) and
    can still be evicted, so the cap stays a bound and
    `tests/browser/toasts.test.ts:55-69` holds. Pin:
    Layer 1 under `FakeTime`, `tests/debouncer.test.ts`'s
    shape — the DOM stub records listeners per element
    and does NOT stub `setTimeout`; show, enter, tick
    6000, no `toast--closing`; leave, tick, closing.
    TEST-PLAN I23 (`:5866`) gains the pause.

### Flow designer

19. **A rename with no target changes nothing.**
    `withNodeNamed` (`presenters/flow-designer.ts:808-826`),
    `withNodeTaskInstructions` (`:828-846`), and
    `withEdgeNamed` (`:870-888`) end in `#queueSave`
    and `#noteMutation` unconditionally;
    `applyUpdateNode` (`flow-designer-actions.ts:196-206`)
    is a bare `map`. The phantom PUT is stored, not
    deduped: `buildFlowPutBody` mints a fresh trio
    (`flow-mutations.ts:424-426`), so the octets differ.
    On a miss the three methods return `this.#snapshot`,
    the no-op idiom at `:812-814, 856, 740-742, 766-768`,
    and neither queue nor note. The page's three
    debounced sites (`flows/detail.ts:1375-1418`) skip
    `commit()` when the returned snapshot is the one the
    presenter holds, so `commit()`'s own history advance
    (`:233-234`) does not fire either — the live clear
    is commit's, not the presenter's. No result type, no
    debouncer cancel, no existence check at fire. Pins:
    `tests/flow-designer-presenter.test.ts` — redo
    stack of one survives `withNodeNamed('missing')`
    (zero today); `flow-designer-open.test.ts:160-213`'s
    shape — pair count unchanged after the miss (+1
    today); `flows-detail-shortcuts.test.ts`'s harness —
    history does not advance.
20. **The marquee rect is always built.** `mustFind`
    (`flow-gesture-render.ts:59-71`) throws when
    `.flow-marquee` is absent; `buildGraphSvg` emits it
    only for a non-null `marqueeRect`
    (`flow-graph.ts:1369-1378, 1413`), while its three
    sibling targets — `.flow-grid-bg`, `.flow-grid-dots`,
    `.flow-connect-preview` — are unconditional
    (`:385-398, 1405-1408, 1414-1417`). Emit it always,
    zero-sized when idle; the FSM keeps extent, CSS
    `:110-117` is unchanged, FLOW-CANVAS.md's frozen
    snapshot rule (`:67-69`) is untouched. Pin:
    `buildGraphSvg` with `marqueeRect: null` contains
    `class="flow-marquee"`, the call shape at
    `tests/flow-graph-locked.test.ts:41`.

### Pins that land green

21. **Subscribe is silent until a bell.** Thirteen
    `subscribe<Entity>Changes` delegate to
    `createSubscriptionChannel` → `createChannel`, whose
    `subscribe` only adds to a Set (`channels.ts:35-42`).
    A test imports `web-app/app/adapters/index.ts`,
    selects every export matching
    `/^subscribe\w+Changes$/`, and asserts
    `subscribeOnce(subscribeX, () => { fired = true }, onError)`
    neither throws nor sets `fired` before returning.
    Self-updating; lands green, after item 9, so it takes
    the three-argument signature. Failability: a temporary
    synchronous replay in one adapter.
22. **The wrappers exec deno.** `grep -w node` over all
    nineteen non-markdown root files finds nothing;
    `npm` finds `build:93`'s `--exclude-unused-npm`. A
    test in `tests/fusion-angle-live-name.test.ts`'s
    shape walks those files for an invocation-shaped
    match, `(^|[\s|;&(])(node|npm|npx)\s`, and asserts
    none; zero whitelist. Lands green; failability: a
    temporary `node x.js` in one wrapper.
    `AGENTS.md:52-53` cites it.
23. **The constraint picker by type.**
    `allowedConstraintKinds`
    (`presenters/record-detail.ts:901-908`) has no test.
    Pin `select` → `[]`, `text` → `['regex']`, `number`
    and `date` → the range pair, and that a text
    attribute already holding a regex still renders
    `<option value="regex">`. Lands green; failability:
    flip one return. Under this pin no later rewrite of
    R7 is Test Weakening.

### The anchor and the notes

24. **The seed clock is the seed's UTC day.**
    `api/mock-data/seed-kit.ts:24` freezes `now` at
    `2026-06-15T00:00:00.000Z`; its comment (`:5, 20-23`)
    defends `tests/mock-data-fingerprint.test.ts`, which
    `6259f392` deleted. Nothing under `tests/` hashes
    the seed; the 1453, the 92 actuals, and the author
    picks are op-counts and hash draws; five tests import
    `now` and follow it. The stats window is ninety days
    (`flow-stats.ts:69`; `flow-stats-aggregate.ts:229-247`)
    and every seeded instant is at or before the anchor,
    so from 2026-09-13 every closed sojourn clips to
    zero. `now` becomes the start of the current UTC day
    — day-quantized, so the Honolulu pass and a same-day
    re-seed are stable; `daysFromNow` and `dateOnly`
    already compute in UTC (`:35-41, 56-60`). The comment
    says the ninety-day reason and stops citing the
    ghost; `TODO.md:474`'s stale-cite line and the
    Sequencing hold both go. Pin, a permanent covenant:
    seed, `getFlowStats(ctx, <Customer Onboarding>,
    Date.now())`, `completedWorkOrderCount > 0`.
25. **The GPU note moves.** `launchChrome`
    (`cdp-client.ts:423-444`) dropped `--disable-gpu` in
    `9423e9d5`; the oracle is a two-machine observation
    no commit can produce. The bullet moves to Later
    work with its restore trigger intact.

### Docs

26. **The profile enters the product path.** A new item
    4 after credentials and views: the membership-scoped
    profile document — shape, validator, derive, seed,
    roster and detail reads, and the Members page's
    edit — with `types.ts:1301-1303`'s covenant named as
    the line it replaces, and `TODO.md:1158-1160`'s
    identity-scoped spelling corrected. Items 4-12
    renumber and the section header's "Twelve items"
    becomes thirteen. Sequencing: "item 4 precedes routing the
    roster through the profile" replaces the profile
    line; "8 → 6" and "5 → 10" become "9 → 7" and
    "6 → 11". Independent of every other commit; lands
    first.
27. **Two bullets narrowed, in the last commit.** The
    replay bullet's residue: "an inner pair of a
    composed operation skipped while the top-level pair
    landed answers 201; `appendMessagePair` returns
    void and the gate never holds inner hashes. Oracle:
    a composed create whose inner hash collides with an
    earlier pair." R6/R7: "R6 holds in a stronger form —
    no picker renders for `select`. R7's primary clause
    is false: `regex` is always offered and a second
    pick adds a second row (`record-detail.ts:901-908,
    968-982`; `validators.ts:2759-2771` accepts
    duplicates). The walk decides whether that is a
    defect; the pin (item 23) makes any rewrite honest."

## Hazards

- **Item 3 is one commit or the tree is red.** The token,
  ten test files, two test names, and API.md move
  together.
- **Item 6 touches 121 files.** Mechanical, but item 5
  MUST land first or twenty tests go red for the wrong
  reason. After item 3, any test that silently relied on
  dedupe answers 200 where it asserted 201 — that red is
  the discovery, not a regression; fix the test's ids,
  never its assertion.
- **The last-admin guard against four pins.** If any of
  `api-organization-member-seat:265-300`,
  `api-membership-document:210`,
  `api-membership-liveness:19-35`,
  `api-write-authorizer:210` deletes an organization's
  only admin seat, its fixture gains a second admin; the
  assertion does not move.
- **The channel signature.** Item 9's required third
  parameter is a compile error at every caller `tsc`
  names: four pages and two channel tests.
- **The remint tests open a channel.** Both existing
  remint tests call `setCookieSession(true)` and will
  open the refresh BroadcastChannel once the remint
  rides the mutex; `deleteRefreshChannel()` in their
  teardown.
- **Item 14's transaction body.** The guard derives
  admin seats inside the transaction; that derive is a
  row op and stays inside. Nothing else awaits.
- **Two names lie today.** The tests at
  `api-instances-patch:853` and
  `api-work-order-transition-instance:1068` say 200 and
  204 while asserting 201; item 3 makes the first true
  and corrects the second.
- **Item 24 and the TZ pass.** `tests/tz/` runs under
  `Pacific/Honolulu`; the anchor is computed in UTC, so
  both passes see one day. A test that compares a seeded
  instant to a local-day boundary would be the false
  prophet; none does today.
- **Items 21-23 land green.** Each commit's plan step
  runs the named mutation first and records the red.
- **Root-doc ceilings.** TODO.md and TEST-PLAN.md are
  exempt; API.md, ARCHITECTURE.md, and AGENTS.md change
  one line each.

## Testing

TDD, Layer 1, red before green in every commit that
changes behavior:

- Items 1-4, 7-10, 12-20, 24 each land with the pin the
  item names, red on the parent commit.
- Items 5-6 are mechanical and green throughout; item 7
  is their pin.
- Item 11 is a refactor behind the existing green
  members tests.
- Items 21-23 land green and prove failability by the
  named mutation.
- Items 25-27 are docs; `./validate` is their gate.
- Layer 2: `tests/browser/toasts.test.ts` must hold
  after item 18; the dialogs test is unchanged.

`./validate` after every commit. `./test-all` before the
fast-forward.

## Commit sequence

One concern per commit; each product commit removes its
TODO.md bullet or its clause. Order within a group is
free except where noted.

| # | Subject | Item |
|---|---|---|
| 1 | Add the membership profile to the product path | 26 |
| 2 | Move the GPU note to Later work | 25 |
| 3 | Pin the operator wrappers to deno | 22 |
| 4 | Pin the constraint picker's kinds by type | 23 |
| 5 | Drop the signing key from the wipe allow-env | 2 |
| 6 | Drop the signing key from the seed allow-env | 2 |
| 7 | Serialize the remint behind in-flight refreshes | 1 |
| 8 | Answer 200 on a replayed write | 3 |
| 9 | Answer 200 when the race lost the append | 4 |
| 10 | Give byte-identity tests an explicit shared id | 5 |
| 11 | Mint a fresh operation id per test request | 6 |
| 12 | Pin that identical test writes each append | 7 |
| 13 | Require role keys on the nested attribute create | 8 |
| 14 | Hand re-init failures to the page error state | 9 |
| 15 | Pin every adapter channel silent until a bell | 21 |
| 16 | Report an absent roster profile as absent | 10 |
| 17 | Extract the human member create draft | 11 |
| 18 | Stop fabricating dimension scores on Add Member | 12 |
| 19 | Say why an empty working-styles card is empty | 13 |
| 20 | Refuse to remove the last admin seat | 14 |
| 21 | Add the seat removal adapter | 15 |
| 22 | Render Remove on member detail | 16 |
| 23 | Wire member removal on the detail page | 17 |
| 24 | Pause a toast under pointer or focus | 18 |
| 25 | Leave history alone when a rename finds no target | 19 |
| 26 | Skip the commit when a debounced edit changed nothing | 19 |
| 27 | Emit the marquee rect on every canvas build | 20 |
| 28 | Anchor the mock seed to its UTC day | 24 |
| 29 | Narrow the bullets this sweep leaves | 27 |

Constraints: 1 and 2 first, in either order; 8 before 9
and before 10; 10 before 11; 11 before 12; 14 before 15;
17 before 18; 20 before 21 before 22 before 23; 25 before
26; 29 last.

## Measured, not assumed

Read at `cfafb32e` before any line was written:

- **The marquee interleaving is unsupported.** The
  marquee's first request-update is emitted at
  pointer-down while the presenter is idle, so it
  commits, and the presenter holds `selecting` for the
  whole gesture; a resize rebuild from that snapshot
  emits the rect. The bullet's mechanism text was
  authored by `727088a8` with no reproduction; the raw
  run-six line was "intermittent flow-marquee console
  exceptions on Billing".
- **The seed's fingerprint is a ghost.** Deleted by
  `6259f392`; the freeze (`4b91627f`) was never bumped;
  no dated score id is cited by any test.
- **Re-init is narrower than stated.** `loadInto` owns
  fetch failures with Try Again; only three fault
  classes leak.
- **The ACL conflation is a live 403**, probed HTTP-only
  against the memory backend through `handleRequest`.
- **The seat DELETE exists and is pinned four times.**
- **Ten files assert 201 on replay**, not nine;
  `drift-states` has no byte-identical resend.
- **121 files, 97 helpers, six fixtures**, not 126 and
  101.
- **A narrowed allow-env fails loud.** `NotCapable`
  through `process?.env?.[…]` under `deno run`; the
  `deno eval` probe was discarded because it grants all.
- **Zero `node` word hits** across nineteen root files.
- **The remint's loser is a replay, not a rotation**;
  `rotations.length === 1` is green today.
- **Two redo clears, not one**, and the rename fires
  inside the delete's `commit()` → `update()` flush.
- **The phantom PUT is stored.** Fresh trio per body;
  `request_hash` covers the whole message.
- **The web app never PUTs the nested attribute route.**
  Attributes are created only through the composed
  record-type POST.
- **Document families are `trio` or `stateless`**
  (`document-family.ts:118-125`); a profile facet is
  stateless, so item 2 of the product path does not
  gate the profile item.

## Out of scope

Candidates read and excluded, each with the reason:

- **The membership-scoped profile.** Product path item 4
  (Decision 1).
- **`{ erased: true }` at `members.ts:106`.** A PII
  placeholder the union fill overwrites — the same sin,
  a different bullet; name it in Later work.
- **The records page's steady-state fire-and-forget**
  (`records/index.ts:116-125`). The same `void` shape
  outside this bullet's four sites.
- **Toast focus reachability and the doubled live
  region.** The container is appended last in tab
  order; `role=status` nests inside `aria-live`.
  Accessibility precondition, unmeasured; Later work.
- **Keyboard undo without `cancelGestureFrame`**
  (`flows/detail.ts:2047`). The one unread candidate for
  a real mid-gesture commit; item 6's property.
- **The three readers of an absent role array** and the
  web adapter's `??`. Item 9's DRY residue.
- **`safeErrorMessage` mapping `NotCapable` to "seed
  failed"** (`postgres-gate.ts:120`). Opaque, but the
  permissions test goes red first.
- **The R6/R7 walk.** The pin lands; the observation is
  Layer 3's.
- **Line-number drift** in bullets that stay.

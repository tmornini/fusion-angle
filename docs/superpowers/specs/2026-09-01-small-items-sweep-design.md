# Small-items sweep: ship the minor Later-work bullets

- Date: 2026-09-01
- Status: awaiting review, pre-plan
- Worktree: `.worktrees/2026-09-01-small-items-sweep`
- Base: master at `82dee1d9`
- Ships: 22 code and test items; strikes eight
  already-done bullets; corrects six that stay; pins
  TEST-PLAN.md D6/D7, D26, and B24
- Leaves: the critical path's sequenced work, the
  Unpinned catalog, and eight candidates excluded for
  cause (Out of scope)

## Problem

TODO.md is 1236 lines. Beside its twelve sequenced
critical-path items and the 690-line Unpinned catalog,
`## Later work` carries some twenty bullets each
closable in one sitting: a comment pointing at the
wrong walk case, two identifiers an old id-scrubber
corrupted, two seed lines for an identity nothing
seeds, one ten-line block copied four times, a dialog
that reopens with last time's text, a page that never
hears the bell. Each is too small to earn its own
brainstorm → spec → plan cycle, and each is skipped
for exactly that reason. So they accumulate.

The clutter costs more than length. Reading every
bullet against master found eight already done, one
pointing at an enumeration that was never committed,
one duplicating a critical-path clause with an oracle
that contradicts TEST-PLAN, two undercounting their own
sites, and eight whose line numbers have drifted. A
backlog that misdescribes itself is read less, and read
less it grows.

## Decisions

- **Scope rule.** An item rides this sweep only if it
  (1) closes in one commit or an obviously contiguous
  pair, (2) stays inside the files its bullet names or
  their exact sibling, (3) pins at Layer 1 where a pin
  is possible, and (4) carries no wire-contract, schema,
  or design decision. Every candidate was read at
  `82dee1d9` before inclusion; the ones that failed the
  rule are named under Out of scope with the reason.
- **Item 9's dead code rides along.** Four of its
  Merged clauses are pure deletions — `FK_SPECIAL`,
  `callerOrganizationIds`, the
  `deriveRecordStateHistory` alias, `#flowDesc` — and
  ship here (items 19-22), leaving item 9's list. Its
  other clauses (DRY across sites, name lies, the
  absent-role readings) stay sequenced. The section's
  text changes twice: item 9's list shrinks by four,
  and item 6's `hasUndoHistory` clause gains a sentence
  (item 24).
- **Unpinned catalog untouched.** Its cheapest entries
  are one-assertion additions and make the next sweep
  of this shape; mixing them in would double this one.
- **Sibling sites ride along, named.** Where the fix's
  exact shape recurs beside the bullet's site — the
  add-member dialog, the four other files carrying the
  `r1` artifact, the third `g`-prefixed name, the
  Archive button beside Edit — the sweep takes the
  sibling too. One codebase, one voice; each extension
  is called out at its item so review can strike it.
- **TODO.md leaves by the Close protocol.** Each
  shipping commit removes its own bullet. Bullets that
  stay but misdescribe themselves are corrected in one
  final docs commit. Line-number drift in bullets that
  stay is not corrected — it drifts again with every
  commit, this sweep's own included.
- **Already-done bullets leave first.** Four explorers
  read all 1236 lines against the tree; eight bullets
  describe work the tree already has. They leave in the
  sweep's first commit — docs only, independent of
  every other commit — with the two TEST-PLAN pins that
  should have named their tests.
- **No new abstractions.** Two `onEmpty` sites, not
  three; a filter where the list is built; a private
  helper only where four copies already spoke.

## The items

Line numbers are at `82dee1d9`. Each item names its
pin; "walk" means TEST-PLAN.md observes it and nothing
else can.

### Tests and comments

1. **The pre-bell assertion.**
   `tests/ideas-empty-subscribe.test.ts:112-118` carries
   its load-bearing claim as a comment: the two raw PUTs
   (:129-154) cannot wake the page; only the bell (:158)
   can. Between the PUTs and the bell, drain the same 25
   ticks the post-bell assert uses (:162-166) and assert
   the list stub does not contain `Cross-tab idea`. The
   final assert and the test name are unchanged, so
   SV8b's pin (`TEST-PLAN.md:6750-6753`) holds and
   strengthens.
2. **The dead stub.** Same file, :68-71: the
   `MutationObserver` double declares `disconnect()`.
   The app's one observer
   (`web-app/app/drag-reorder.ts:390`) never
   disconnects; no test calls it. Delete the line.
3. **Two tagged cells.**
   `tests/presenter-project-score-history.test.ts:225`
   asserts `row.includes('archived')` on a row chosen by
   `r.includes('Objective archived')` — implied, so
   vacuous; :260 likewise for `reactivated`. The
   presenter emits `<td>archived</td>` and
   `<td>reactivated</td>` as the third cell
   (`project-score-history.ts:200-206, :219-225`).
   Assert the tagged forms.
4. **A strict DESC pin.**
   `tests/api-entity-history-routes.test.ts:1027` reads
   `rows[0]!.at >= rows[1]!.at`; the fixture's
   timestamps are distinct literals, so equality can
   never occur. `>=` becomes `>`.
5. **`current/limit`.** The test name at
   `tests/presenter-projects-organization.test.ts:398`
   says `XXZruirZyAOoRpNxaDnpSA/limit`; the scrubber
   replaced the word `current` (the preimage registry
   maps that id to `current`,
   `seed-hash-preimage.ts:1169`). G9's pin quotes the
   name at `TEST-PLAN.md:4465` — not `:4391` as the
   bullet says — and moves in the same commit. Every
   other occurrence of the string is Tony Stark's
   identity id and stays.
6. **`r1`, in five files.** The bullet names four
   sites in `tests/api-invitations-fence.test.ts`
   (:360, :363, :505, :509). The same artifact —
   `rOEPOcVMQdJiiiMuiiEhlg` as an identifier standing
   for `r1`, its sibling `r2` on the next line — is also
   in `tests/flow-fsm-reduce.test.ts:674`,
   `tests/flow-zoom-to-fit.test.ts:175`,
   `tests/derive-record-instances.test.ts:386`, and
   seven `const` sites in `tests/api-flow-tags.test.ts`.
   Rename the identifiers in all five files. The ~45
   same-text string literals are genuine ids and stay;
   a blind replace is destructive. Each rename checks
   its block for a live `r1` first.
7. **Three names, not two.**
   `tests/api-authentication-token.test.ts:1092-1093`
   binds `gOrganization` and `gAdmin`; the bullet omits
   `gAdminToken` (:1179, :1192). All three lose the
   retired Section-G prefix: `starkOrganization`,
   `starkAdmin`, `starkAdminToken` — the tests' own
   idiom (`starkSeed`, `starkToken`, `starkPrefix`).
   Nine lines in one test body; no pin quotes them.
8. **F62.** `tests/flow-designer-presenter.test.ts:353`
   points at TEST-PLAN F51, the space-while-dragging
   case. Locked members is F62 (`TEST-PLAN.md:3534`).
   One token. The comment's "manual" claim is about
   `withNodeMemberIds`'s toast guard, which F62's
   exploratory clause still covers; it stays.

### Web app

9. **Dialogs that reopen clean.** The
   `#add-identity-btn` open handler
   (`web-app/identities/index.ts:154-158`) resets only
   `pendingIdentityId`; neither submit path (:212-252,
   :254-281) clears an input. On open, also clear every
   input the dialog owns (`#id-name`, `#id-email`,
   `#id-phone`, `#id-bio`, `#svc-secret`) — one place,
   covering submit, cancel, and Escape alike. The
   add-member dialog (`web-app/members/index.ts:240-267`)
   has the same omission and takes the same fix; the
   invite dialog beside it (:353) is the one that
   already clears. Pin: Layer 2, one browser test per
   dialog — open, type, cancel, reopen, every field
   empty.
10. **The stats page hears the bell.**
    `web-app/flows/stats.ts` never subscribes; its
    `loadInto` (:106) runs once and the page is stale
    until navigation. Move the call into a `load(host)`
    function; hoist the hover/click `AbortController`
    (:140) to module scope so each load aborts the last;
    after the first `await load(host)`, subscribe with
    `subscribeFlowChanges(() => { void load(host); })`
    (`web-app/app/adapters/flow-mutations.ts:59`), the
    shape of `records/detail.ts:106-110` and
    `flows/detail.ts:1747`. A bell re-renders from the
    server; the selected path and pinned node reset with
    it — the page has no edit mode to protect. Pin:
    Layer 1 in the shape of
    `tests/ideas-empty-subscribe.test.ts` — boot
    `init({ flowId })` under the DOM stub, rename the
    flow by raw PUT, post the bell, drain, assert the
    header name changed.
11. **Hide, don't remove.**
    `web-app/ideas/index.ts:64-71` and
    `web-app/records/index.ts:63-71` `?.remove()` the
    header create button on empty; both buttons live in
    static markup, so a re-init after the first
    cross-tab write leaves the populated list without
    its CTA. `onEmpty` adds `.hidden` (`utilities.css:108`,
    the app's idiom at 31 sites); the populated path
    removes it. Projects and flows never removed theirs
    — two sites, fixed in place. Pin: the ideas test's
    DOM stub serves a `#create-idea-btn` stub; assert
    hidden after the empty render and visible after the
    bell's re-init. Records stays unpinned, as TODO's
    "untested by design" bullet already records.
12. **`#definitionAt`.**
    `web-app/app/presenters/project-score-history.ts`
    resolves-or-throws in four byte-identical ten-line
    blocks (:140, :161, :190, :209). A private
    `#definitionAt(objectiveId, at)` returns the
    definition or throws the same message; each arm
    becomes one line. Net −30 / +8. The presenter test
    drives all four arms and stays green unchanged; item
    3 lands first so the assertions behind the refactor
    are honest.
13. **The aggregates row on a phone.**
    `components-metrics.css:80-82` gives the row
    `140px 110px 1fr`; with the 0.8em gap the fixed
    columns need ~276px, so under `responsive.css`'s
    767px rule the sparkline's `1fr` track collapses on
    narrow phones (the bullet measured 304px). In that
    block — DESIGN-SYSTEM.md assigns grid-column
    overrides to `responsive.css` — the row becomes
    `minmax(0, 1fr) 110px` with
    `.score-row-sparkline { grid-column: 1 / -1 }`:
    label and gauge on one line, sparkline full-width
    beneath. Pin: Layer 2,
    `tests/browser/viewport.test.ts` at 320px — the
    dashboard's `.score-row-sparkline` bounding width is
    greater than zero. Red on master at that width; if
    it is not, the width is wrong, not the pin.
14. **No archived records in the binding dropdown.**
    `renderBindingSlot`
    (`web-app/flows/detail.ts:1423-1455`) sorts every
    record and filters none; `RecordEntity` carries
    `state`. Keep `state !== 'archived'` — and the record
    currently bound, whatever its state, so the
    `<select>` keeps showing the truth and a change event
    cannot silently unbind it. The predicate is an
    exported pure function beside the presenter helpers
    in `flow-designer-view.ts`. Pin: Layer 1 — active
    listed, archived dropped, bound-archived kept.
15. **Edit and Archive for admins.**
    `record-detail.ts:495-500` renders `#record-edit-btn`
    for everyone; Archive beside it (:517-528) is gated
    on state alone. The API keeps every record-type
    mutation admin-only by absence
    (`api/authorization.ts:126-131`), so a member's Edit
    or Archive ends in 403 at Save. `RecordDetailView`
    gains `roles: readonly string[]`; both buttons render
    only when `roles.includes('admin')` — the test
    `projectInstanceFields` already applies (:94) — and
    the page passes `heldRoles()`
    (`records/detail.ts:113`) as it already does for
    instances. Pin: `tests/presenter-record-detail.test.ts`'s
    `pageFor()` gains the field; an admin sees both
    buttons, a member neither.

### API

16. **The binding PUT probes the record.** The
    flow↔record route (`api/routes.ts:5538-5541`) calls
    `postFlowRecordDocumentOp` (:2561-2584), which
    appends without reading `body.record_id`. Mirror its
    sibling `postWorkOrderBindingOp`'s instance probe
    (:2433-2445): inside the transaction, before
    `appendMessagePair`, derive the record head in the
    caller's organization; absent →
    `EntityNotFoundError('records', id)` (404) — never
    `missedReadError`, which would 403 a foreign id and
    create an existence oracle (the sibling's own W1/W7
    note). The op gains `organization`; its three
    callers (`routes.ts:5539`, `mock-data.ts:956`,
    `seed-message-pairs.ts:631`) pass it. API.md's
    ladder already says genuine absence 404s; no doc
    moves. Pin: Layer 1 — a PUT naming an absent record
    is 404 and appends nothing; an existing record still
    binds.
17. **Two dead seed lines.** `api/mock-data.ts:208` (the
    bullet says :204) and
    `api/mock-data/seed-hash-preimage.ts:175` still map
    `dtmZgnDBlVcoyjxKzlaKgA`, the deleted slice seeder's
    'g-unseated' identity. The mapped credential id
    appears nowhere else; the one test naming the
    identity
    (`tests/api-authentication-token.test.ts:1064`)
    mints its own. Delete both. The 1453-pair and
    92-actual pins prove the deletion inert.
18. **Honest snapshot rows.** `versionSnapshotsAt`
    (`api/document-family.ts:442, :449`; the bullet's
    :438/:445 were off at its own commit) declares
    `unknown[]`; every element is a spread `object` plus
    `etag`, `at`, `member_id`. Narrow to
    `Record<string, unknown>[]`, and the re-declaration
    at `api/invitations-domain.ts:882` with it, or the
    wrapper undoes it. Stop there: the true element type
    waits on `entityOf`'s `=> object`, a
    `DocumentFamilyWiring` change; `:692` is the same
    shape and not asked for.

### Critical-path item 9's dead code

Each leaves item 9's Merged list with its "remove the
comment at … when done" note; the comment goes with
the code.

19. **`FK_SPECIAL`.** `web-app/app/schema-svg.ts:99-109`
    keeps a map of `_id` columns whose target table the
    name convention cannot reach, and `fkTarget`
    (:212-213) consults it. The generator draws its
    tables from `DbStores` (`api/db.ts:255-257`), which
    has one store, `messagePairs`; none of the map's
    four keys is a message-pair column, so the lookup
    never hits. Delete the map, its comment, and the two
    lookup lines. Pin: `generate-schema-svg --check` —
    SCHEMA.svg is byte-identical, which `./validate`
    already asserts.
20. **`callerOrganizationIds`.**
    `api/request-auth.ts:189-197` keeps an
    adapter-shaped alias with zero callers; the grep
    finds only its definition. Delete it with its
    comment, and the `DbAdapter` type import at :1,
    which has no other use. Pin: `tsc`.
21. **`deriveRecordStateHistory`.**
    `api/derive-record-types.ts:185-197` is a thin alias
    of `deriveRecordTypeStateHistory` — same signature —
    kept so call sites "keep compiling". Every call site
    is a test: `tests/drift-records.test.ts` (:39, :884,
    :1125), `tests/drift-states.test.ts` (:30, :173),
    `tests/adapters-records.test.ts` (:2, :260, :352),
    `tests/api-record-document.test.ts` (:2, :165, :222,
    :285, :325, and the comment at :139). Point them at
    the real name; delete the alias and its comment.
    Pin: the same tests, green under the name they now
    call.
22. **`#flowDesc`.** `flow-stats.ts:417` is a stub
    returning `''`; `renderShell` (:224-230) writes it
    into `<p class="flow-stats-flow-desc">` (:95), and
    nothing ever fills that slot — the page fills only
    the name (`flows/stats.ts:127`), and neither
    `FlowGraph` (`flow-queries.ts:28`) nor `FlowEntity`
    carries a description. Delete the stub, the `descEl`
    block, the empty `<p>`, and its rule
    (`pages-flow-stats.css:70-74`). `#flowName` stays:
    the page does fill it, and the comment at :414-415
    shrinks to that one stub. Pin: `tsc` and
    `tests/presenter-flow-stats.test.ts`, which renders
    the shell and names no description.

### Docs

23. **D6/D7 pin the toast.** The mitigation stub
    `2026-08-26-d-d6.md` names commit `1eaa6e21`
    deliberate and says: update TEST-PLAN D6/D7 to pin
    the toast on an incomplete submit; do not re-add
    gating to `create.ts`. Do that. The create-vs-convert
    voice question stays in TODO as the design call the
    stub calls it.
24. **Six bullets corrected.** Each stays; each said
    something false:
    - *Stale-history sweep* (:310-313) — the Evidence
      section it cites
      (`…run-four-remediation-design.md:911-932`) lists
      provenance, not comments; the reproductions that
      might have were scratchpad, never committed. Say
      so: the pass must re-derive its enumeration by
      reading, and the seven "remove the comment at …
      when done" pointers are critical-path property,
      not stale.
    - *Undo at the bottom* (:1181-1187) — folded into
      critical-path item 6, which already names
      `hasUndoHistory` as `pairs > 1`. No server route
      reads the flag; the undo route walks the stack
      itself and the 201 is a documented graceful no-op
      (`api/types.ts:1043-1051`). The bullet's oracle —
      a refused bottom-of-stack undo — contradicts
      TEST-PLAN F36/F45, which call that 201 a PASS.
      Item 6's brainstorm resolves it; the clause says
      so.
    - *Run-four seams* (:238-248) — four of its six
      clauses ship here (items 13-16). G9's staleness
      was the corrupted name (item 5); R12's note is
      accurate and its gap is the Unpinned entry. What
      remains is R6/R7, whose "toy" clauses need a
      Layer 3 observation before any rewrite.
    - *Validation voices* (:231-237) — shrinks to the
      design call once item 23 lands.
    - *A3* (:454-460) — its "11 printed lines" are 12
      since `59a25243` seeded the zero-membership
      identity.
    - *G10* (:869-874) — "nothing anywhere exercises
      `toGeneralInfoDraft`" is false since
      `tests/presenter-projects-organization.test.ts:421`
      calls it; the gap — no `value=` assertion — stands.
25. **Eight bullets already done.** Four explorers read
    every bullet against the tree; these describe work
    it already has, and leave with the evidence:
    - *Item 9's second instances* (:130-132) —
      `formRExtras` went with `api/test-plan-slices.ts`
      in `167efe76`; the clause narrows to
      `canvasFocusOf`'s walk.
    - *401 recovery* (:197-199) — `redirectToLogin()`
      (`auth-redirect.ts:60-73`) is the one voice at
      twelve sites; `?return=` is pinned by
      `tests/auth-redirect-url.test.ts`. The landing CTA
      (`landing/index.ts:558`) is a public page's
      sign-in link, not recovery.
    - *G/V5* (:335-338) — `TEST-PLAN.md:4821-4835` names
      `alex.kim@company.com`, Wayne-only, as the
      cross-slice invitee (`5aa9d5a9`).
    - *Compose* (:394-396) — `crank:114` runs
      `docker compose up -d --wait postgres` and never
      the compose server (`0f289810`).
    - *B24* (:534-540) —
      `tests/api-token-exchange-revocation.test.ts`
      'refresh on a logged-out but live jti is the
      revocation, not reuse' (`a01bcf1e`, before the
      audit) is the API test the entry asks for: a
      ledger row plus a logout stamp reject a presented
      credential nowhere near expiry, no cookie in play.
      The entry's literal wording — a live ACCESS token
      401ing — is what `tests/api-token-gate.test.ts`
      pins the design against; the ledger bites at
      refresh. TEST-PLAN B24's "no test isolates the
      ledger check" clause becomes that test's name.
    - *D25* (:610-613) — `tests/presenter-idea.test.ts`
      'IdeaListPresenter.renderBadges omits promoted and
      archived even when those ideas exist'
      (`e6a1d278`); the pin already names it.
    - *D26* (:614-616) — `tests/state-badge.test.ts`
      'stateBadge presses only the active filter chip'
      (`a59812af`, June — an audit miss); TEST-PLAN
      D26's pin still calls the highlight exploratory
      and gains the test's name.
    - *R21* (:1090-1096) —
      `tests/mock-data-records.test.ts` 'Project Brief
      Priority and Approved carry the restricted seed
      ACLs; the rest keep the default' (`5b08f508`); the
      pin already names it, and the entry's premise — no
      custom ACL in the seed — is itself gone.

## Hazards

- **Seed order.** Item 16's probe runs inside the seed
  too; records must land before bindings. The
  `EXPECTED_MESSAGE_PAIR_COUNT = 1453` pin
  (`tests/mock-data-pairs.test.ts:158`) goes red if the
  probe rejects a seed write.
- **An unasserted fixture.**
  `tests/api-organization-isolation.test.ts:512-522`
  PUTs a binding and never checks the status; its
  seeded ids exist, but a silent 404 there would break
  later assertions in that file. Assert it.
- **The `r1` rename.** Five files, identifiers only.
  Grep the block for a live `r1` before each rename; the
  string literals with the same text are ids.
- **A widened view.** Item 15 adds a required field to
  `RecordDetailView`; `tsc` names every constructor, and
  the only one outside the page is `pageFor()` in its
  test.
- **The alias rename.** Item 21 touches four test
  files; only the imported name changes, never an
  assertion.
- **Browser pins.** Items 9 and 13 pin at Layer 2;
  `./validate` does not run them. `./test-all` does, and
  gates the landing.
- **Root-doc ceilings.** TODO.md and TEST-PLAN.md are
  exempt; no other root doc changes.

## Testing

TDD, Layer 1 first, red before green in every commit
that changes behavior:

- Items 1, 3, 4 ARE the tests — each a strengthening
  with no product change, red only if the product is
  already wrong.
- Items 10, 11, 14, 15, 16 add or extend a Layer 1 test
  that is red on master and green after the commit.
- Items 9 and 13 pin at Layer 2 under `tests/browser/`.
- Items 12, 17-22 are refactors and deletions behind
  existing green pins (the presenter tests; 1453 / 92;
  `tsc`; SCHEMA.svg; the four test files that call the
  alias).
- Items 2, 5-8, 23-25 are names, comments, and docs;
  `./validate` is their gate.

`./validate` after every commit. `./test-all` before
the fast-forward.

## Commit sequence

One concern per commit; each product commit removes
its TODO.md bullet, or its clause of a shared one.
Order within a group is free except where noted.

| # | Subject | Item |
|---|---|---|
| 1 | Strike the bullets the tree already shipped | 25 |
| 2 | Assert the raw PUTs leave the empty page asleep | 1 |
| 3 | Drop the dead MutationObserver disconnect stub | 2 |
| 4 | Pin the archival and reactivation cells by tag | 3 |
| 5 | Pin the versions DESC order strictly | 4 |
| 6 | Restore current/limit in the usage-bar test name | 5 |
| 7 | Restore r1 across the scrubbed test locals | 6 |
| 8 | Name the unseated-grant locals after Stark | 7 |
| 9 | Point the locked-members comment at F62 | 8 |
| 10 | Clear the add-identity dialog on open | 9 |
| 11 | Clear the add-member dialog on open | 9 |
| 12 | Subscribe the flow stats page to flow changes | 10 |
| 13 | Hide the create button on empty lists | 11 |
| 14 | Collapse the four definition lookups into one | 12 |
| 15 | Stack the aggregates row on narrow viewports | 13 |
| 16 | Keep archived records out of the binding list | 14 |
| 17 | Render record Edit and Archive for admins only | 15 |
| 18 | Probe record existence on the binding PUT | 16 |
| 19 | Prune the unseated seed entries | 17 |
| 20 | Narrow the version snapshot rows | 18 |
| 21 | Drop the unreachable FK_SPECIAL map | 19 |
| 22 | Drop the callerless organization-ids alias | 20 |
| 23 | Call the type history walk by its own name | 21 |
| 24 | Drop the flow stats description stub | 22 |
| 25 | Pin the toast on an incomplete idea submit | 23 |
| 26 | Correct the Later-work bullets this sweep read | 24 |

Constraints: 1 first and alone; 2 before 13 (same test
file — strengthen, then extend); 4 before 14 (honest
assertions before the refactor behind them); 26 last.

## Measured, not assumed

Read at `82dee1d9` before any line was written:

- **One bullet is done.** Twelve `redirectToLogin()`
  sites, one voice, `?return=` pinned.
- **One enumeration never existed in the tree.** The
  stale-history bullet's Evidence is a provenance list.
- **Eight cites drifted.** Replay `api/api.ts:1013` →
  `:986`; binding PUT `routes.ts:5583` → `:5538`; the
  four copies `:139` → `:140`, ten lines not eleven;
  seed map `:204` → `:208`; snapshot rows `:438` →
  `:442`; DESC pin `:1033` → `:1027`; score-history
  `:224` → `:225`; the G9 pin `:4391` → `:4465`.
- **Two bullets undercount.** `r1` is in five files;
  the `g` prefix has three names.
- **The API already refuses a member's record-type
  write.** Item 15 makes the UI say what the server
  does.
- **`hasUndoHistory` is read by no route.** The undo
  route walks the stack; the flag is the client's
  approximation, documented as such.
- **The replay fix is one token and nine test files.**
  `api/api.ts:988` passes `true`; `api-instances-patch`,
  `api-instances-precedence`, `api-pii-tombstone` (×2),
  `api-work-order-transition-instance`,
  `api-work-order-binding`, `document-family`,
  `drift-states`, and `api-instances-create` (in a test
  NAME) assert 201 on replay, and API.md:69-79's ladder
  has no replay clause.
- **Eight bullets are already done.** One critical-path
  clause, three Later-work bullets, four Unpinned
  entries — two of those, D26 and B24, pinned by tests
  older than the audit that listed them.
- **Two of item 9's four "dead" nits are live by
  grep.** `fkTarget` reads `FK_SPECIAL` and `renderShell`
  calls `#flowDesc()`; both are dead by reach — one
  store, no description field — which their pins prove
  rather than assume.
- **Send Back has nowhere to put feedback.** The idea
  body's key set (`validators.ts:1361-1365`) rejects any
  other key; `StateEntity` (`types.ts:406-415`) carries
  no prose.

## Out of scope

Candidates read and excluded, each with the reason:

- **Replay 201 → 200.** A wire-contract change; nine
  test files and API.md's ladder assert today's 201.
  Its own spec. The bullet stands as written.
- **The composed operation's 201 after a silent skip.**
  `appendMessagePair` returns void, so the wrapper
  (`message-pair.ts:648-660`) cannot know. A design
  change, downstream of the replay decision.
- **Send Back feedback.** No API field; presenter →
  adapter → route → validator → derive, plus a decision
  on where transition prose lives. Its own spec; the
  oracle stays in TODO.
- **Toast pause on hover and focus.** A feature with no
  oracle and open questions (per-toast or stack-wide;
  eviction versus pause). Brainstorm first.
- **`page:ready` status.** The emitter
  (`app-boot.ts:441`) cannot see the error `loadInto`
  swallowed; changing how page init reports outcomes
  touches every page module. Its own spec.
- **Create-vs-convert validation voice.** The
  mitigation stub calls it a design call.
- **The stale-history sweep.** Unbounded without its
  enumeration.
- **R6 / R7 / R12.** R12's note is accurate; R6/R7 need
  a walk. Loosening a case by guess is Test Weakening.
- **The Unpinned catalog.** The next sweep; its
  one-assertion entries (AA28, F38, B28, I30, D26, SV3,
  I2/I5's one-value flip, G26, R17/R19, F34, C2, E3) are
  its natural first cut.
- **Line-number drift** in bullets that stay.
- **`document-family.ts:692`**, the third `unknown[]`.

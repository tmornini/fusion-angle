# TODO

The single home for later work. An item leaves this
file by shipping; `## Close protocol` is the exit.

## Critical path

Twelve items, in this order — each its own brainstorm →
spec → plan → ship cycle, implemented sequentially. A
"Merged:" clause names bullets absorbed from
`## Later work`; they keep their oracles.

1. Restore the genesis-wins-under-skew covenant — five
   drift/derive tests name a clock-skew case they never
   construct, so they pass for the wrong reason.
   `tests/drift-ideas.test.ts:600` ('GET idea trio is
   lifecycle-current under clock skew') seeds a genesis PUT
   at `2026-05-01`, then a later-arriving PUT at
   `2020-01-01`, and asserts the trio keeps the genesis
   `state_at` / `state_event_id`. But its fixture
   `ideaDocument(title, state, stateAt, stateEventId,
   position)` never writes `stateAt` or `stateEventId` into
   the body — the whole-tree type check flagged both unused
   (TS6133), and they now carry the `_` prefix that records
   the omission. No skew is ever built, so nothing the name
   claims is exercised. Same shape in
   `tests/drift-objectives.test.ts:1199`,
   `tests/drift-projects.test.ts:558`,
   `tests/drift-records.test.ts:1093`,
   `tests/drift-states.test.ts:1436`, and
   `tests/derive-projects.test.ts`. Two exits per the Office
   of Verification: make the PUT path accept caller-supplied
   trio values so the skew is real, or rename the tests to
   the arrival-order covenant they actually keep. The first
   is a validator change; neither is confined to one test's
   subject. Found by the whole-tree type check.
2. Remove the lifecycle trio — fold `state` /
   `state_at` / `state_event_id` out of every document
   body (Decision 7): the reduction
   (`api/derive-documents.ts:148-157`), the stamp
   (`api/document-family.ts:118`), every derive
   (`api/derive-ideas.ts:54, 83`,
   `api/derive-projects.ts:39, 70`,
   `api/derive-flows.ts:75`), the seeds
   (`api/mock-data/seed-message-pairs.ts:733, 913`),
   and the validators' trio-key gates; lifecycle
   becomes its own event rows. Merged: no lifecycle
   transition table at any gate.
3. Credentials out of the message; views for the app —
   hoist `Authenticate:` (ideally the only plaintext
   credential path) into its own column; a view that
   omits it and omits deleted rows; a schema-owner
   role and view-only application roles (read-only,
   write-only, read-write), none able to read the
   column. Merged: token-at-rest hashing (closes KNOWN
   seam "A raw dump still has verbatim auth
   messages" — `tests/api-shadow-ledger-auth.test.ts`);
   two-role views
   (`tests/backend-postgres.test.ts:391`); physical
   PII erasure (closes KNOWN seam "Erased PII persists
   as superseded pairs" —
   `tests/api-pii-tombstone.test.ts`); the in-band
   plaintext comment at `api/mock-data.ts:151-152`
   (owner call).
4. Cachability — headers, `HEAD`, conditional
   requests, and the rest; the brainstorm presents its
   questions from most to least desirable. Start:
   `server/http-server.ts` `NO_STORE` and
   `CONTENT_SECURITY_POLICY`.
5. `/status` — `{ up: boolean, components: {
   postgres: boolean } }`; `up` is true when every
   component is; built for more components. Item 10's
   health probe.
6. Re-implement workbox, work orders, and flows —
   nodes become processes; process kinds: record
   modification (current), external process
   synchronization (new), directed cyclic graph (flow
   and sub-flow), directed cyclic graph (sub-graph); a
   chat on every record and work order (consumes item
   8). Merged: READY gate on dangling refs
   (`tests/adapters-flow-publish.test.ts`); locked
   verbs not executed
   (`tests/family-registry.test.ts`); the flow-tag
   designer UI (`TEST-PLAN.md:1510-1511`); F6's ZIP
   import not rebinding `flow_records`
   (`TEST-PLAN.md:1114`); the canvas seams the
   remediation leaves — page selection writes behind
   the FSM, its four selection-writing sites
   (`web-app/flows/detail.ts:369, 403, 559, 1854`),
   in-place `viewBox` mutation at four method sites
   (`web-app/app/presenters/flow-designer.ts:537, 556, 1012, 1042`),
   `hasUndoHistory` as `pairs > 1`
   (`api/derive-flows.ts:108`), rotation only on the
   toggle path (`web-app/app/flow-layout.ts:1032-1037`),
   and the mirror trigger.
7. Headless AI worker — a server-side process that
   watches each AI process-worker's workbox, claims,
   assembles the record definition, the attribute
   values (which — decided in the brainstorm), the
   node instructions, and whatever else serves, asks
   the model to follow them precisely, and applies the
   reply: attribute updates in record-PATCH form and
   the outgoing edge. API-only. Merged: roster seat
   naming an AI agent
   (`tests/family-registry.test.ts:112-113`);
   FLOW-CANVAS.md's display-only AI checkboxes
   (`FLOW-CANVAS.md:130-132`);
   `withNodeTaskInstructions` already stores the
   instructions.
8. Chats at `/api/chats` — attachable to any document
   at `/…/:collection/:id/chat` with as little
   ceremony as the plane allows.
9. Genericity — DRY, even once (the indulgence); spec
   away every nit. Merged: `putRecordInstance` PATCHes
   (name lie —
   `tests/adapters-record-instances.test.ts`,
   `tests/api-instances-create.test.ts`); same-body
   PATCH appends 201
   (`tests/api-instances-create.test.ts:585-586`);
   member detail's redundant GET trio
   (`web-app/members/detail.ts`); two zoom
   implementations and two constant sets
   (`web-app/app/flow-fsm-reduce.ts:12-14, 632-656`,
   `web-app/app/flow-interactions.ts:16-18, 816-850`);
   `#noteMutation` / `history()` beside
   `advanceHistory`
   (`web-app/app/presenters/flow-designer.ts:221-227`);
   the shell's hand-kept copy of the reveal header
   (`postgres-lib:8` against `server/seed.ts:26-27`,
   guarded by no test); the second
   instances the remediation added (`formRExtras`'
   record create, `canvasFocusOf`'s walk); the undo
   path's duplicated pure helpers
   (`api/flow-graph-diff.ts:16-26`); the dead
   `FK_SPECIAL` map
   (`web-app/app/schema-svg.ts:100-110` — remove the
   comment at `schema-svg.ts:100-110` when done);
   `callerOrganizationIds`, zero callers
   (`api/request-auth.ts:189-197` — remove the comment
   at `request-auth.ts:189-191` when done); the
   test-only `deriveRecordStateHistory` alias
   (`api/derive-record-types.ts:185-189` — remove the
   comment at `derive-record-types.ts:185-189` when
   done); the `#flowDesc` stub
   (`web-app/app/presenters/flow-stats.ts:414-417` —
   remove the comment at `flow-stats.ts:414-415` when
   done); `toRecordAttribute`'s `??` ACL default
   (`web-app/app/adapters/record-attributes.ts:76-79`)
   and the two readings of an absent role array
   (`api/routes.ts:843-856, 1000-1005` —
   `recordAttributeDocumentBodyOf` vs
   `attributeSchemaOf`); the nested
   key-set follow-on (`api/validators.ts:705-713` —
   remove the comment at `validators.ts:705-713` when
   done); `handleSpace` dispatching
   `isFormFocused: false` unconditionally; Delete's
   `preventDefault` with nothing selected.
10. Production readiness, repository and Render —
    block cross-environment connections,
    high-availability app and Postgres, and the rest.
    Merged: the single-mint-process KNOWN seam's
    precondition — record the claim-expiry decision as
    its own event before any multi-process deployment
    (`api/derive-states.ts:811-823` — remove the
    comment at `derive-states.ts:811-823` when done);
    the `TRUSTED_PROXY_HOPS` throttle seam
    (`tests/http-throttle.test.ts`);
    stale-until-navigation once there are processes to
    notify (`tests/advisory-lock.test.ts`). Consumes
    item 5.
11. Fewer JSON parse/stringify — byte-stream header
    setting, mechanical sympathy and simplicity for
    the processor; measured first
    (`./measure --profile`). Merged: the deferred
    content-coding seams
    (`shared/http-message/body.ts:76-79` and
    `shared/http-message/content-coding.ts:5-7` —
    revise both comments when done).
12. Simulated latency by environment — when
    `FUSION_ANGLE_ENVIRONMENT` is exactly `local` and
    `FUSION_ANGLE_LATENCY` is a millisecond count,
    both present and non-empty, every API request
    takes the existing log-normal sampler
    (`api/latency.ts:18-40`) with
    `mu = ln(FUSION_ANGLE_LATENCY)`; otherwise the
    no-op. Merged: the shim's "both presets pass a
    no-op today" (`api/latency.ts:1-5`,
    `api/db-backed.ts:31-32`, `api/api.ts:2133-2134` —
    revise the three comments when done).

## Later work

Off the critical path; each with its oracle.

- A full TEST-PLAN.md walk using serial subagents, so
  session context stays short — TEST-PLAN.md `## The walk`
- One client 401-recovery voice through
  `redirectToLogin()` with `?return=` —
  `tests/adapters-http-facade.test.ts`
- Toast pause on hover and focus
- Mock seed's fixed 2026-06-15 anchor — after
  2026-09-13 serial-mode FS3 carries in-flight heat
  only
- Profile as its own document,
  `identities/:id/profile`, 404 = no profile — closes
  whole-or-none — `tests/api-identity-document.test.ts`
- Roster rows carry a fabricated empty profile
  (`emptyPersonProfile`) —
  `web-app/app/adapters/members.ts:48`
- `DEFAULT_DIM` stands in for an assessment that never
  happened — `web-app/members/index.ts:52`
- The re-mint refresh is not single-flighted with the
  facade's cookie refresh —
  `web-app/app/adapters/shared.ts:463-464`
- `./measure` harvests error-page timings;
  `page:ready` carries no status —
  `web-app/app/measure.ts`
- The cross-party delegation ledger
  (`api/authentication.ts:884-886`;
  `tests/api-authentication-token.test.ts:678`)
- Passkey, provider-IdP, and corporate-OIDC ceremonies
  (`api/authentication.ts:1595-1597`;
  `tests/api-authentication-authorize.test.ts:225`)
- Per-client multi-audience, DPoP `cnf`, jti reuse
  detection (`api/types.ts:508-510`;
  `shared/access-token-decode.ts:30-31`)
- SP-6 sign-up (`web-app/auth/index.ts:655-663`)
- Billing (`web-app/billing/`)
- Invitation email delivery
- Attribute drag-reorder (TEST-PLAN R8)
- Idea-create toasts an incomplete submit; convert
  still sets `btn.disabled` — two forms, one
  directory, opposite validation voices
  (`web-app/ideas/create.ts:124`,
  `web-app/ideas/convert.ts:356`;
  `docs/superpowers/test-plan-mitigations/`
  `2026-08-26-d-d6.md`)
- The run-four remediation's remaining seams — the
  Objectives sparkline track collapses at 304px
  (`web-app/app/styles/components-metrics.css:80-82`);
  archived records in the flow-header dropdown
  (`web-app/flows/detail.ts:1391-1402`,
  `renderBindingSlot`); Edit rendered for members on
  record detail
  (`web-app/app/presenters/record-detail.ts:495-500`);
  the binding PUT not probing record existence
  (`api/routes.ts:5583-5586`); R12 without a positive
  subject; stale G9 / R6 / R7 notes
- A replay is indistinguishable from a creation. The
  gate's replay branch renders a previously-stored
  pair but passes `appended: true`
  (`api/api.ts:1013-1015`), so `sendWriteResponse`
  (`api/message-pair.ts:610-624`) answers 201 exactly
  as the genuine create did. THE FIX IS WIRING, NOT
  DELETION: pass `false` there. The 200 branch is not
  dead — the unchanged-live-PUT site already passes
  `false` (`api/api.ts:1412-1413`), which is both the
  proof the distinction was designed and the precedent
  for the repair; an item reading "remove the 200
  branch" would be exactly backwards. Below the gate,
  the same blindness: `appendMessagePair` skips a
  duplicate `request_hash` silently by its own comment
  (`api/message-pair.ts:686-701`), and the composed
  operation wrapping it still answers 201 however many
  inner pairs actually landed
- A shared test operation id can produce false greens.
  `tests/http-fixtures.ts:12` exports one hardcoded
  `TEST_OPERATION_ID`; 135 test files use it, 99
  through a local `req()` helper that pins it. Because
  `appendMessagePair` dedupes on `request_hash`, a
  test issuing two byte-identical requests has the
  second silently dropped — which made a security test
  in the run-four remediation pass against unfixed
  code until it was caught. Oracle:
  `tests/api-record-types-composed-op.test.ts:434-440`
- Absence and emptiness are conflated in attribute ACL
  derivation. `attributeSchemaOf` synthesizes
  `readRoles: []` both for a head that deliberately
  stores an empty array and for one carrying no role
  keys at all (`api/routes.ts:1000-1005`), because the
  nested attribute PUT appends the raw wire body
  rather than the validator's normalized document
  (`api/routes.ts:5307-5333`; the default-stamping it
  discards is `api/validators.ts:3042-3054`)
- A panel rename whose target is deleted during the
  800 ms debounce still saves and still clears redo.
  `withNodeNamed`, `withNodeTaskInstructions`, and
  `withEdgeNamed` fire `#queueSave` and `#noteMutation`
  unconditionally, so an `applyUpdateNode` that matches
  nothing still ships a phantom idempotent PUT and a
  spurious redo clear — a disclosed trade-off, not a
  regression. Oracle:
  `web-app/app/presenters/flow-designer.ts:808-885`;
  the debounced schedules are
  `web-app/flows/detail.ts:1349-1391`
- A flow loaded with Auto Fit OFF no longer fits on
  first paint. `withCanvasSize`
  (`web-app/app/presenters/flow-designer.ts:996-1017`)
  fits only under `isAutoFit`, and the load-time block
  (`web-app/flows/detail.ts:1685-1697`) is the only
  load-time fit — its `reconcileFitFromDom()` returns
  early for the same reason. RECORDED, behavior
  unchanged. The sentence it falsifies is "onFlowLoaded
  keeps its explicit first fit" — the run-four
  remediation design spec, second-commit paragraph
- The Deno migration as one block — six specs, strict
  1 → 6, 3 and 4 may swap after Spec 2's measurements,
  Spec 6 optional (the measurements after Spec 5
  decide); the roadmap is `9620d38c`
- Stale-history comment cleanup as one pass — about 35
  code and 32 test comments describe a past state as
  present; the enumeration is the run-four
  remediation's Evidence
- Cryptographically verifiable ledger — brainstorm
  hash-and-verify (or sign) of stored pairs. The dropped
  `version` column hashed on write and was never checked
  on read. `request_hash` is replay identity, not
  response integrity — `SCHEMA.md` item 4
- The add-identity dialog never clears its fields —
  AA-Obj's stale-state sibling —
  `web-app/identities/index.ts:213-281`
- `flows/stats.ts` wires no change subscription; the
  stats page stays stale until navigation
- The empty-state `onEmpty` removes the header create
  button irreversibly; a live empty→populated re-init
  (run-six Task 9) leaves the list without its header
  CTA — hide, don't remove —
  `web-app/ideas/index.ts`, `web-app/records/index.ts`
- Claim-on-load with no release-on-leave plus the
  8-hour `DEFAULT_LOCK_TIMEOUT` turns a drive-by
  work-order view into an 8-hour claim
  (run-six Task 3 renders it; the UX remains) —
  `web-app/workbox/detail.ts:583-593`,
  `api/types.ts:1007`
- G/V5 needs a cross-slice identity to verify Decline,
  or the case text should sanction any invited
  identity — plan defect vs explorer slip, unresolved —
  TEST-PLAN.md G/V5
- Intermittent "flow-marquee" console exceptions on
  non-canvas pages (Billing) — a flow-canvas gesture
  listener may be bound globally — TEST-PLAN.md G42
  observation
- A re-init failure degrades weaker than a first-boot one:
  `subscribeOnce`'s `void fn()` lets the rejection reach the
  global `unhandledrejection` handler, which logs and
  toasts — but first boot gets `handlePageLoadError`'s full
  error state with a Try Again button. Toast-only, no retry
  — `web-app/app/channels.ts:152`,
  `web-app/app/page-loader.ts:41-75`,
  `web-app/app/error-helpers.ts:41-57`
- `subscribeOnce` guarantees "never two" live subscriptions,
  not "always one": a bell arriving between teardown and
  re-arm is dropped, leaving an empty list page blank — the
  symptom run-six Task 9 fixes. Needs two bells inside one
  fetch window; a pending flag would close it but
  reintroduces the shared state the design avoids —
  `web-app/app/channels.ts:138-154`
- Objective lifecycle history compares two clocks:
  `revision.at` is client-minted while the lifecycle `at`
  is the server-stamped pair fact. A browser clock ahead of
  the server can invert them and throw, so the History
  modal fails to open with an error toast instead of
  rendering —
  `web-app/app/adapters/objectives.ts:311`,
  `web-app/projects/detail.ts:318`
- The resolve-and-throw block in
  `web-app/app/presenters/project-score-history.ts` is four
  identical 11-line copies (:139, :161, :182, :201) — a
  `#definitionAt(objectiveId, at)` helper collapses each
- `tests/ideas-empty-subscribe.test.ts` enforces its
  load-bearing property by comment, not assertion: assert
  the two raw PUTs alone do not wake the page before
  posting the bell
- `tests/presenter-project-score-history.test.ts:224,:259`
  assert substrings the row-selection predicate already
  implies, leaving the detail cell unpinned — assert
  `<td>archived</td>`
- Untested by design after run-six: the records/projects/
  flows `onEmpty` arms (only ideas is pinned), `loadInto`'s
  retry branch, a work order both claimed and completed,
  and the archived-genesis walk
  (`web-app/app/adapters/objectives.ts:190-192`)
- `subscribeOnce`'s `const unsubscribe = subscribe(...)`
  would throw a TDZ ReferenceError if any `subscribe` fired
  its callback synchronously; all thirteen
  `subscribe<Entity>Changes` delegate to `createChannel`,
  so it is inert — guard only if that changes
- Run-six cosmetics, none load-bearing: `unknown[]`
  returns now provably narrower
  (`api/document-family.ts:438,:445`), a non-strict DESC
  pin (`tests/api-entity-history-routes.test.ts:1033`),
  and a dead `disconnect()` stub in
  `tests/ideas-empty-subscribe.test.ts`
- Investigate `docker compose up -d --wait` postgres
  only. Not the compose `server` — that would be a
  second origin (`compose.yaml`)
- Node-only modules by directory — once whole-tree type
  checking ships, the browser tsconfig's `exclude` is
  the last hand-kept registry (seven, growing with the
  tiers plan). Move them out of `web-app/app/` into a
  top-level tools directory so browser membership is by
  rule and the top level names the tools. After the
  tiers plan. Oracle: `web-app/app/tsconfig.json` has
  no `exclude`
- A DOM-free server universe — `server/` and the `api/`
  it reaches type-check only under `lib.dom`, so a
  `document` in server-side code is invisible to `tsc`.
  Measured at `8cad9e86`: `server/` alone under `ES2024`
  + `@types/node` reports 8 errors, all WebCrypto/Fetch
  names that `lib.webworker` carries without `document`
  (`api/client-assertion.ts:29-167`,
  `api/message-pair.ts:540`). A third project over
  `server/` extending the root with
  `lib: ["ES2024", "WebWorker"]`; verify `@types/node`
  coexists. Oracle: a `document` reference in `api/`
  fails `./validate`
- The browser tsconfig at `web-app/app/` is the nearest
  project only for `web-app/app/**`; editors and the
  LSP open `web-app/flows/**` and the other page
  directories under the root superset, where `process`
  resolves. Move it to `web-app/tsconfig.json`. Six
  live references (`validate`, TEST-PLAN.md AT1,
  AGENTS.md's Gates paragraph, AGENTS.md's Two type
  universes invariant, `tests/tsconfig-covenants.test.ts`,
  and this file's own Node-only-modules-by-directory
  Oracle above) plus the tiers plan's path
- GPU flag in the Layer 2 launcher — `launchChrome`
  no longer passes `--disable-gpu` (cargo cult under
  `--headless=new`; it was required only by old
  headless on Windows). Its one real effect was
  forcing software compositing, which made runs more
  alike across machines. Dropped UNVERIFIED —
  `./test-browser` has run green on one machine
  (2026-08-28). Restore it if two machines disagree.
  Oracle: `./test-browser` green on two machines
- Unpinned but pinnable — TEST-PLAN covenants with no
  test, the 2026-08-29 audit's gap list. Each names the
  lowest layer that could express it. The walk observes
  these; nothing proves them. TEST-PLAN.md's "see
  Unpinned but pinnable" references land here.
  - A real `./build` run — its exit code, the ZIP it
    writes, and that ZIP surviving the walk, plus the
    artifact's contents: the 29 `PAGE_REGISTRY` files
    (the eight A2 names, `api-documentation/index.html`
    among them), `server.mjs`, `assets/app.js`,
    `assets/styles.css`, the woff2 fonts, the 18 page
    directories, and the verb/status rooms generated
    separately from `PAGE_REGISTRY` (A1, A2, J3) — Layer
    1, an integration test in the shape of
    `tests/crank-cli.test.ts` that spawns `./build
    --no-zip` into a temp dir; today
    `tests/server-zip-metafile.test.ts` only regex-checks
    the build script's source text
  - The mock-data reveal's 11 printed lines carry
    `demo@example.com` and `sarah.chen@company.com` by
    name, not merely a count of 11 (A3) — Layer 1,
    `tests/pg-seed.test.ts` `'mock-data seed prints every
    human sign-in'`; every `demo@example.com` assertion
    there sits on a `'bootstrap'` call or the synthetic
    formatter test
  - The live root redirect — exactly one transition, and
    a navigated URL that is never `auth/` or `snapshots/`
    (A4) — Layer 2, a CDP test under `tests/browser/`;
    `tests/root-redirect.test.ts` is a source-text regex
    a computed destination would evade
  - No console error and no 501 during a real
    unauthenticated page load (A5) — Layer 2, a CDP test
    capturing console messages and the network log
  - Create Project stays disabled while only SOME active
    objectives are scored (AA22, AA22a) — Layer 1, a
    `conversionIsReady` fixture in
    `tests/presenter-idea.test.ts` with two or more
    objectives partly baselined; today's fixtures are
    N=1, which cannot tell `.every()` from `.some()`, or
    N=2 all scored
  - The Add-Member dialog's Kind toggle, default-Human
    selection, and the AI form's disabled-until-Model
    Create gate (AA4, AA7a) — Layer 1 or 2;
    `bindAddMemberDialog` (`web-app/members/index.ts`)
    carries no test
  - The live seat-derived roster and the Ideas list's
    membership and counts against the real mock seed —
    which humans and which idea titles render on Stark
    (AA6, AA7, AA12, AA14) — Layer 1, a boot-level test
    in the spirit of `tests/mock-flow-readiness.test.ts`
  - The Projects list count after a live idea-to-project
    conversion, seeded 16 plus 1 (AA24) — Layer 1,
    chaining `postIdeaConversion` into
    `getProjects().length` in
    `tests/adapters-projects.test.ts`
  - The flow designer's toolbar and header chrome — Undo,
    Redo, Zoom −/+, Copy Mermaid, Export ZIP, Delete, and
    the Locked / Auto Layout / Auto Fit switches (AA26) —
    Layer 2; no presenter test enumerates these labels
  - Every member unassigned on a brand-new node, the
    `memberIds: []` shape (AA28) — Layer 1, one more
    assertion in `tests/presenter-misc.test.ts`'s
    `'buildNodePanel marks currently assigned member
    checkboxes as checked'`
  - The 800 ms auto-save debounce timing itself (AA29,
    AA40) — Layer 2, measuring the delay between a
    properties-panel edit and the resulting PUT
  - A renamed node's own name surviving a save and reread
    (AA29, AA40, F30) — Layer 1, an assertion on
    `graph.nodes` by id in
    `tests/adapters-flow-mutations.test.ts`'s `'putFlow
    persists every FlowSaveShape field'`
  - The Create-node edge group rendering `data-edge-ref`
    and deliberately no `data-edge-id`, which is what
    keeps it non-interactive (AA30) — Layer 1, a render
    test over `web-app/app/flow-graph.ts:869-882`
  - The attribute list item's rendered mode label
    (Editable / Read-only) and required-toggle state
    (AA33, AA34) — Layer 1, a presenter test on the
    properties panel's attribute-list render; only the
    `performAddAttributeRef` write is tested
  - The landing CTAs carrying `[data-goto-auth]` and
    navigating to `auth/index.html` on click (B2, B3) —
    Layer 2, a browser test on `web-app/landing/`;
    `tests/landing-stay.test.ts` finds the string in the
    page source but ties it to no element
  - The auth form's client-side validation messages —
    "Email is required", "Please enter a valid email
    address", "Password must be at least 6 characters"
    (B6, B7, B8) — Layer 1, by exporting `validateEmail`
    and `validatePassword` from `web-app/auth/index.ts`
  - The exact rejection string "Invalid email or
    password." (B9) — Layer 2;
    `tests/browser/sign-in.test.ts` checks only
    `error.length > 0`
  - The Sign Up mode toggle's title, field, and button
    changes, and the "Sign-up is coming soon" toast with
    no navigation (B10, B11) — Layer 1, the same export
  - A 401 after sign-out being the revocation ledger
    rejecting a presented credential, not merely a
    request with no cookie (B24) — Layer 1, an API test
    that revokes through the ledger while a live access
    token is still in play; the two-jars pin shares one
    cookie jar, so a cleared cookie alone explains its
    bounce
  - `resolveOrganizationGate(nonEmpty, <a gated page
    other than invitations>)` returning the list (B28) —
    Layer 1, one more assertion in
    `tests/boot-organization-gate.test.ts`; a mutation
    proved the old pin false
  - A header landmark and a main-content region rendering
    on `dashboard/` (C1) — Layer 2, extending
    `tests/browser/sidebar.test.ts` or
    `tests/browser/sign-in.test.ts`; the sidebar and the
    dashboard load are pinned, these two are not
  - The sidebar's 12 links in the stated order, labeled
    (C2) — Layer 1, asserting `PAGE_REGISTRY`'s
    `inSidebarNav` titles equal the 12-item order
    verbatim; one exclusion is checked today, never the
    order or the full set
  - The header's search bar, stats tiles, and theme
    toggle, and the retired greeting and org `<select>`
    being truly absent from the live DOM (C3) — Layer 2;
    `mutateHeaderInfo` mutates `document` directly and
    has no pure-function seam
  - The visual order of the four dashboard surfaces and
    the painted dual-concentric and bipolar arcs (C4) —
    Layer 2, reading the rendered SVG arc paths
  - Each sidebar link's click actually navigating to its
    target page (C5) — Layer 2, clicking each
    `PAGE_REGISTRY` sidebar link and reading
    `location.pathname`
  - The sidebar staying fixed while the main content
    scrolls (C6) — Layer 2, reading the sidebar's
    bounding rect before and after a scroll
  - The mock seed's per-org and global entity and roster
    counts landing in their stated bounds — ~6 ideas, ~16
    projects, ~4 flows, 6 humans, 4 AIs, ~11/~17/~5
    globally (C7) — Layer 1, a `sharedMockDb()`-backed
    test beside
    `tests/adapters-dashboard-mock-seed.test.ts`, which
    covers only the Impact and objective baselines
  - The six conversational prompt labels on the create
    form — "Give your idea a clear title" and its five
    siblings (D5) — Layer 1, an assertion on
    `IdeaCreatePresenter`'s rendered label text; the
    cited test reads field values, never the fixed
    strings around them
  - The read-mode Problem & Solution card's exact field
    set and its em-dash-for-empty-optional rendering
    (D11) — Layer 1; `presenter-idea.test.ts` excludes
    `renderShell`/`renderUpdate` by choice, and
    `makeRecordingContainer`
    (`tests/presenter-project-detail-impact.test.ts:30`)
    already renders a DOM-slot shell under Node
  - The Edit → editable-inputs toggle and Cancel
    restoring the original (D12, D14) — Layer 2;
    `handleIdeaActions`'s edit and cancel branches are
    driven by nothing
  - The composed header action-button SET per idea state
    — Send Back / Approve / Edit together for
    `in_review`, only Edit otherwise, and only Cancel /
    Save in edit mode (AA18, D15, D29, D32, D32a) — Layer
    1, a presenter test rendering
    `IdeaPresenter`/`IdeaEditPresenter`'s action slot end
    to end; today only the state predicates
    (`isReviewable`, `canSubmit`, `isConvertible`) are
    unit-tested in isolation
  - A `promoted` idea's badge label reading exactly
    "Promoted", not "Approved" (D24) — Layer 1, a
    `promoted` fixture in `tests/presenter-idea.test.ts`;
    `IDEA_STATE_CONFIG`
    (`web-app/app/presenters/state-display.ts:35`) is
    untested
  - `promoted` and `archived` ideas never getting a
    filter badge even when present (D25) — Layer 1, a
    `renderBadges` fixture including one; only their
    absence from the candidate list is source-confirmed
  - The `aria-pressed="true"` highlight on the selected
    filter badge (D26) — Layer 1, one more assertion on
    the lit case the dimmed test already builds
  - The convert page's error state (D35) — Layer 1;
    `web-app/ideas/convert.ts:96-115` hand-rolls its own
    `buildErrorState` call outside the shared `loadInto`
    helper, and `buildErrorState` has no test anywhere
  - The "New Idea" button, the create-form Cancel, and
    the convert-page back button — each a click then
    `navigateTo` (D4, D9, D34) — Layer 2; no test drives
    any click handler on any ideas page
  - A live drag on any list but projects — the ideas list
    (D36, D37) and an objective row (K6) — and a new
    objective's own "appears at bottom" placement (K2) —
    Layer 2; `tests/browser/list-reorder.test.ts` drags
    `[data-project-card]` and nothing else
  - The org-scoped projects list count landing at its
    stated lower bound with the paint-timing wait honored
    (E1) — Layer 2, waiting on the card count before
    asserting
  - The per-metric absent-placeholder rule — which of
    Time, Cost, and Impact produced the em-dash — on the
    list card's `project-metric-grid`
    (`ProjectPresenter`'s `#buildMetrics`, which no test
    reads) and on the detail page (E1, E4) — Layer 1,
    three fixtures in
    `tests/presenter-projects-organization.test.ts` each
    zeroing one baseline; the only candidate today
    searches the whole rendered shell and finds Impact's
    em-dash whatever Cost holds
  - The live status-badge click and its active/pressed
    styling (E2) — Layer 2
  - Clicking a project row landing on
    `projects/detail.html?projectId=<id>` (E3) — Layer 1,
    a `buildPageUrl('project-detail', { projectId })`
    case in `tests/navigation.test.ts`, whose detail-page
    cases name only `idea-detail` and `idea-create`
  - The project detail page's dates and progress bar
    rendering with data (E4) — Layer 1, extending
    `ProjectDetailPresenter`'s coverage in
    `tests/presenter-projects-organization.test.ts`
  - The absence of a Team card on the project sidebar
    (E5) — Layer 1, an exclusion assertion on
    `ProjectDetailPresenter.renderShell`
  - The "Flow creation limited to approved projects only"
    and "No flows yet" empty-state copy painting for a
    zero-flow project (E6) — Layer 1, asserting that
    paragraph directly; the New-Flow-button test passes
    `flows: []` for both branches and never reads it
  - The New Flow dialog's fields — Flow Name input,
    Create / Cancel — and the live navigation into the
    designer after Create (E7, AA26) — Layer 2, driving
    the dialog on an approved project's detail page
  - The live click swapping read mode for edit mode on
    project detail (E8) — Layer 2
  - The live click-Save round trip on project detail (E9)
    — Layer 2
  - Edit then Cancel restoring the original, unmodified
    data (E10) — Layer 2; the cancel branch is inline in
    `handleProjectActions`, mutating a module-level
    `state` variable, unlike the exported, tested
    `reduceProjectSave`
  - `#project-review-actions` and
    `#project-lifecycle-actions` carrying `hidden` while
    editing and reappearing on Cancel (E10a) — Layer 1;
    no test names either id
  - The drop indicator's appearance and the card
    following the pointer mid-drag (E11) — Layer 2,
    extending `tests/browser/list-reorder.test.ts` past
    the before/after order
  - The import dialog's Project selector, hidden file
    input, and Choose-File trigger (F4) — Layer 1, a
    markup test over `web-app/flows/index.html` in the
    shape of `tests/flow-detail-toast-overflow.test.ts`
  - The ZIP resolution dialog's four shapes — Overwrite,
    Create New, Create, and the description (F6, F44) —
    Layer 1, a pure test of `buildDialogConfig`
    (`web-app/app/adapters/flow-export.ts`), already pure
    and only unexported
  - Which node kind wears which colour, the Archive
    node's red 3-px border, the centred special label,
    and the attribute-count subtitle (F8, F40, AA26) —
    Layer 1, per-node `buildGraphSvg` assertions in
    `tests/flow-graph-locked.test.ts`; `'an unlocked
    canvas keeps per-type strokes'` renders all three
    kinds into one blob and asserts each token appears
    somewhere, so a green-for-red swap survives it, and
    cycle amber (`WARN`,
    `web-app/app/flow-graph.ts:47`) is asserted nowhere
  - The cycle edge's rendered `stroke-dasharray` and
    `url(#flow-arrow-warn)` marker (F9, F21) — Layer 1, a
    `buildGraphSvg` assertion on a graph with a back-edge
  - `canShowPort`'s three-way rule and the port's
    `<title>` copy (F10) — Layer 1, `buildGraphSvg` with
    a wired and an unwired Create node, locked and
    unlocked
  - The connect preview's markup — the "New State" ghost
    card, the grey straight line, and the bezier with its
    arrowhead (F15, F19, F23) — Layer 1,
    `buildConnectPreview` via `buildGraphSvg`
  - Auto Fit's refusal on the zoom BUTTONS (`withZoomedIn`
    / `withZoomedOut` under `isAutoFit`) and the 0.25
    `MIN_ZOOM` clamp (F29) — Layer 1,
    `tests/flow-designer-presenter.test.ts` for the
    buttons (only the wheel path is covered) and
    `tests/flow-fsm-reduce.test.ts` or
    `tests/flow-zoom-to-fit.test.ts` for the clamp
  - The pixel-identical position restore across an undo
    (F34) — Layer 1, asserting `positionX`/`positionY`
    after the undo in `tests/flow-undo-cursor.test.ts`
  - Backspace as a delete chord —
    `reduceDesignerShortcut` handles `Delete ||
    Backspace` in one branch and only `Delete` is
    asserted (F38) — Layer 1, one more `chord({ key:
    'Backspace' })` case in
    `tests/flows-detail-shortcuts.test.ts`
  - The Delete toolbar button's `disabled` attribute
    under lock (`FlowDesignerPresenter#canDelete`) and
    the attribute picker's own `disabled` attribute when
    locked or when nothing is free (F40, F71) — Layer 1,
    `tests/flow-designer-presenter.test.ts` and
    `tests/presenter-misc.test.ts`
  - The "Mermaid copied to clipboard" toast and the
    clipboard write itself (F41) — Layer 2,
    `tests/browser/toasts.test.ts`
  - The real archive round trip — the four-entry manifest
    as a set, `flow.json` and `flow.txt` in particular
    (F42), and members and attribute refs surviving
    `getFlowZip` → `getBackupFromZip` (F6, F44) — Layer
    1, `tests/adapters-flow-export.test.ts`; its own
    tests read back only `flow.mmd` and `sidecar.json`,
    and the members-and-attributes round trip builds its
    backup as an in-memory literal
  - The canvas itself changing after each Undo, as
    distinct from the server state (F45, F46) — Layer 2,
    `tests/browser/canvas-*.test.ts`
  - Pan mode surviving a second drag in one session (F49)
    — Layer 2, `tests/browser/canvas-pan.test.ts`
  - The `if (ke.repeat) return` auto-repeat guard (F50) —
    Layer 1 if it is extracted as a pure predicate beside
    `nextCanvasTabIndex`, Layer 2 otherwise
  - Space on a focused node leaving pan mode off — the
    `defaultPrevented` handshake between the
    document-phase activation listener and the
    window-phase space handler (F57a) — Layer 2,
    `tests/browser/canvas-keyboard.test.ts`
  - The node panel's members fieldset — the alphabetical
    ordering of the HUMANS and AIs groups and the
    `<legend>Members</legend>` text (F58) — Layer 1,
    `tests/presenter-misc.test.ts`
  - The Create and Archive panels' shape — no
    `#prop-node-members`, no
    `#prop-node-attribute-picker` (F63, F64) — Layer 1,
    `assert.doesNotMatch` in
    `tests/presenter-misc.test.ts`
  - The picker filtering out already-referenced
    attributes (F68) — Layer 1, `buildNodePanel` with a
    node that references one of two
  - The rendered hazard badge — `<g
    class="flow-node-danger">` / `.flow-node-warning` and
    its `<title>` copy (F73) — Layer 1, `buildGraphSvg`;
    only the predicate is pinned
  - The Workbox page's title, subtitle, and tab shell
    text (WB1) — Layer 1 or 2; no presenter or browser
    test asserts the shell copy
  - `emptyStateFor`'s rendered copy (WB2) — Layer 1; it
    is unexported page glue in `web-app/workbox/index.ts`
  - The seeded completed-work-order count, 129 of 145
    across `buildWorkOrders()` and
    `buildLeadToCloseWorkload()` (WB3) — Layer 1, an
    exact-count test in the shape of
    `tests/mock-data-objectives.test.ts`, so a seed drift
    goes red instead of surprising a live count
  - The NOT READY row — its subtitle copy and
    `aria-disabled` (Layer 1; the adapter test pins
    `problemCount` and nothing connects that to the page
    glue's rendered string), and the click handler's
    `data-flow-id`-absence guard (Layer 2) (WB4, WB4a)
  - The collapsible toggle interaction and the
    relative-timestamp formatting (WB10) — Layer 2
  - The message plane's append-only invariant — no app
    code path mutates an existing pair (WB16, WB19) —
    Layer 1 in its closest expressible form: a test that
    attempts a mutation through the storage adapter's own
    API and asserts it is refused or impossible
  - Workbox data surviving a page navigation (WB17) —
    Layer 2
  - The second tab's rendered read-only, already-claimed
    view (WB18) — Layer 2
  - The client-side 412 recovery on the WORKBOX action
    screen — re-GET, conflict notice, warning toast, no
    auto-retry (WB19a) — Layer 1 first:
    `WorkboxDetailPresenter`'s own `conflictNotice`
    parameter carries no rendering test, unlike
    `RecordInstancesPresenter`'s; then Layer 2 for the
    live sequence
  - AI-only-member and zero-member node visibility in the
    inbox (WB20) — Layer 1; no fixture in
    `tests/workbox-inbox.test.ts` uses either
  - Archive-tab visibility being independent of which
    members the final transition referenced (WB21) —
    Layer 1; no fixture varies this
  - The stats page shell's absences — no left toolbar, no
    slide-in props panel, no marquee — and the pointer
    cursor over a node (FS1) — Layer 2, reading computed
    cursor style and confirming those elements are absent
    from the DOM; the `buildShell` test asserts what is
    present, never what is not
  - The live Stats-button and back-button navigation and
    the preserved `projectId` (FS2) — Layer 2; the back
    handler is inline in `web-app/flows/stats.ts`
  - The painted colour ramp — yellow/red hot, warm,
    cool/no-data (FS3) — Layer 2, reading the colour
    `--heat-t` resolves to
  - The hover and mouse-out wiring that opens and hides
    the stat card (Layer 2, inline in `flows/stats.ts`),
    and that card carrying no inputs and no Save button
    (Layer 1, over `FlowStatsPresenter.buildCard`'s
    output) (FS4)
  - Review's card subtitle naming its two seeded
    reviewers (FS4) — Layer 1, a `sharedMockDb()`-backed
    `getFlowStats` test on the real Customer Onboarding
    flow; `tests/mock-data-lead-to-close.test.ts` covers
    a different flow
  - The live click-to-pin, click-to-unpin, and re-pin
    transitions (FS5) — Layer 2; pin state is mutated
    inline in the click handler and only the
    `renderCard(container, null)` primitive is tested
  - Data Capture's two seeded members with an outgoing
    edge — the premise beneath FS6's "no triangle on any
    of the four nodes" (FS6) — Layer 1, the same
    `sharedMockDb()`-backed `getFlowStats` assertion FS4
    wants, extended to Data Capture. The composed hazard
    rules are pinned, but the seed shape they rest on was
    READ, not asserted, and
    `tests/mock-flow-readiness.test.ts` pins Customer
    Onboarding READY, which excludes zero-member and
    dead-end nodes but not the one-member `warning` case
  - The live click advancing the stepper, the accent
    stroke, and the dimmed opacity's painted ~30% (FS7) —
    Layer 2
  - The painted contrast of tints and card text in both
    themes (FS8) — Layer 2, toggling dark mode and
    reading computed contrast
  - The redirect to `flows/index.html` when `flowId` is
    absent (Layer 2; `init()` in `web-app/flows/stats.ts`
    is exported but untested) and the "Here now" WIP
    count agreeing with the Workbox's count for the same
    node (Layer 1 or 2, over one fixture) (FS9)
  - The Organization stat grid's "Next Billing" cell, and
    the Projects and Ideas stat CELLS specifically (G9) —
    Layer 1,
    `tests/presenter-projects-organization.test.ts`; the
    cited test decides Active People and a usage bar, and
    Projects and Ideas each render twice
  - The Organization edit form's prefill — the two inputs
    carrying the current Name and Domain as `value`
    attributes (G10) — Layer 1,
    `tests/presenter-projects-organization.test.ts`;
    nothing anywhere exercises `toGeneralInfoDraft`
    (`web-app/app/adapters/admin.ts:58`)
  - The sidebar member chip's click-to-profile navigation
    (G12) — Layer 2; `web-app/app/sidebar-member.ts`
    carries no test, and the browser tests read the
    chip's name only
  - The search match-fields — humans on name, email,
    title, or department; AIs on name or description and
    NOT provider or model (G13) — Layer 1, via
    `HumanMember.matchesSearch`; only "a term narrows the
    sections" is decided today
  - The AI dialog's "Model is required" toast-then-no-POST
    gate (G14, G14a) — Layer 1 or 2; `submitAIForm`
    (`web-app/members/index.ts`) carries no test
  - The Strengths card's read-to-edit tag-picker swap
    (G20) — Layer 1, a `.strength-chip` assertion on
    `HumanMemberDetailEditPresenter`; the cited test
    proves only that no State select renders
  - A Model-field edit persisting (G24b) — Layer 1;
    `aiDraft()` fixes `model` to `firstProviderModel().id`
    in both the seed and the update, so `'putAIMember
    updates the agent document'` never changes it
  - An event's `jti`, `parentJti`, `action`, and `at`
    reaching the presenter through one real adapter call
    (G25) — Layer 1; the adapter test asserts chain
    grouping and event counts only, and the presenter
    test that renders `parentJti` hand-builds its fixture
  - A `linked` provider badge distinct from `unlinked`
    (G26) — Layer 1, a scoped assertion in
    `presenter-identity-providers.test.ts`; `/linked/` is
    satisfied by the substring inside `'unlinked'`
  - The absence of a 3-pair composing POST on a human or
    AI edit (G41) — Layer 1, a spy on `ctx.POST` during
    `putHumanMember`/`putAIMember`; the cited tests prove
    the PUT lands, never that POST stays silent
  - The second-hop `IdentityPiiIntakeFailedError` toast
    and the error class itself (G44) — Layer 1; `grep -rn
    IdentityPiiIntakeFailedError tests/` is empty, though
    the torn-state mechanism it wraps is now pinned
  - The Erase PII button present for a person and absent
    for a service (G45) — Layer 1; neither
    `presenter-identity-detail.test.ts` fixture asserts
    `#identity-erase-btn` either way
  - The sent invitation row's "Invited {date}" sub-line
    and its state badge (V8) — Layer 1,
    `presenter-invitation-list.test.ts`; the
    `SentInvitationsPresenter` test asserts id, email, and
    Revoke only
  - The admin-only 403 on `GET
    organizations/:id/invitations/` for a non-admin caller
    (V9) — Layer 1; confirmed live by probe, but no test
    calls `getSentInvitations` as a non-admin
  - The not-found page's rendered message and link (H2) —
    Layer 2, a CDP test navigating to an unknown route
  - The live dark/light repaint — background, text, CSS
    custom properties — from a toggle click (I1, I3) —
    Layer 2; the CLI tests prove `data-theme` and icon
    state, never that the variables repaint
  - The theme choice actually persisting across a
    navigation or reload (I2, I5, FS8) — Layer 1,
    `tests/state-init.test.ts`; its `matchMedia` stub
    returns `matches: true`, which the module's own
    `'system'` default already satisfies, so the
    assertion holds with `initState()` never called.
    Flipping that one value to `false` closes it
  - `initState` hydrating a VALID stored
    `fusion-angle:sidebar-collapsed` value, and the
    `STORAGE_KEY_SIDEBAR` branch of the shared
    storage-event listener (I8, I28) — Layer 1,
    `tests/state-init.test.ts` (only the corrupt-value
    rejection is tested) and a sidebar sibling of
    `tests/state-theme-icon.test.ts`'s cross-tab test
  - `.mobile-header` going hidden again after the
    viewport is restored to ≥768px (I10) — Layer 2, one
    more assertion beside the `#desktop-sidebar` restore
    check in `tests/browser/viewport.test.ts`
  - The whole mobile drawer — hamburger open, backdrop
    and nav-link close, Escape close, and the Tab focus
    trap (I11–I15) — Layer 2; `initMobileDrawer`
    (`web-app/app/mobile-drawer.ts`) carries no test but
    `tests/browser/viewport.test.ts`'s breakpoint check,
    a different concern
  - The command palette's Cmd+K / Ctrl+K binding, Escape
    close, and arrow-key and Enter navigation (I16, I18,
    I19) — Layer 2; `tests/command-palette-init.test.ts`
    is a does-not-throw smoke test and the key-index
    logic is unexported inside the DOM listeners
  - The loading skeleton before a fetch settles (I21) —
    Layer 2, probing before `wait_for_load`; Layer 1 is
    possible by reading `innerHTML` between calling
    `loadInto` and awaiting it
  - The toast's top-center position and its ~6-second
    auto-dismiss (I23) — Layer 2, reading computed
    position and waiting out `TOAST_DURATION_MS`
  - The newest-on-top `prepend` order and the
    specifically OLDEST toast being the one evicted at
    the cap (I25) — Layer 2; today's browser test raises
    toasts with identical text, so it cannot tell which
    one was removed
  - The skip link's tab order and its focus destination
    on Enter (Layer 2), and the single `<main
    id="main-content">` landmark (Layer 1, a static scan
    of `web-app/app/components-layout.html`) (I29)
  - The wildcard `::view-transition-group(*)` and
    `::view-transition-old/new(*)` selectors carrying
    `animation: none` inside the reduced-motion block
    (I30) — Layer 1, one more `block.includes(...)`
    assertion in `tests/base-css-motion.test.ts`
  - The objectives presenter's render ORDER — the active
    list in position order (K1) and the Archived
    sub-section sitting under Active (K4) — Layer 1,
    `tests/presenter-organization-objectives.test.ts`;
    its assertions are unscoped `.includes()` calls that
    prove presence, not order
  - `postObjectiveRevision`, the rename write (K3) —
    Layer 1; no test anywhere calls it
  - Reactivation returning an objective to the active
    list as a live transition (K5) — Layer 1; the
    presenter fixture feeds static active and archived
    arrays
  - The `sent_back` branch of baseline-slider editability
    (K9) — Layer 1; only `under_review` is exercised,
    though the code path is shared
  - The project action bar's per-state button set —
    Decline and Send back present on `sent_back`, the
    View history button (`data-action="view-history"`)
    present at all (K16, K30) and absent where the case
    says so (K9), and no Score button or modal at
    `under_review` (K10) — Layer 1,
    `tests/presenter-project-action-bar.test.ts`
    fixtures for the states nothing feeds;
    `buildReviewActions` and `buildLifecycleActions` are
    different methods and only some states are covered
  - Dirty-tracking resetting after Save and staying reset
    across a re-render (K14) — Layer 1; no test renders,
    saves, and re-renders in sequence
  - The no-payload-save guard — an unmoved slider never
    calls `postProjectBaselineScoring` (K18) — Layer 1
  - The actual slider's own `value` attribute pre-filling
    with the latest actual (K21) — Layer 1, extracting
    that attribute and asserting on it; `'shows latest
    actual with sign'` searches the whole rendered blob,
    where the ASCII form is a tautology against every
    slider's `min="-100"`
  - The absent visible text label on the column header
    (K24) — Layer 1
  - Green-for-positive and red-for-negative on the gauge
    (K28) — Layer 1, asserting the colour inside each
    side's OWN `<linearGradient>`; the tri-gradient test
    confirms all three stops appear somewhere across four
    gradients, and swapping `gauge.ts:108-110`'s
    assignment keeps the suite green
  - The always-present muted `gauge-arc-track` at every
    value, including zero and undefined, and the actual
    tick's visual distinctness from the baseline area
    (K28) — Layer 1 in `gauge.ts`, or a DESIGN-SYSTEM CSS
    check
  - `subscribeProjectScoreChanges` /
    `notifyProjectScoreChange` (K29) — Layer 2, a two-tab
    BroadcastChannel test
  - The production temporal-name resolver (K7, K30) — an
    inline, unexported closure in
    `web-app/projects/detail.ts` that the presenter's
    fixture hand-duplicates rather than imports; Layer 1
    once it is extracted as a named pure function
  - `RecordListPresenter` and `RecordPresenter`
    (`web-app/app/presenters/record-list.ts`) carry ZERO
    tests — the sidebar Records entry, its live
    navigation, and the org-scoped list's contents,
    Customer Profile visible and Project Brief hidden
    (R1), and the "Record archived" toast
    with the Archived chip beside Active,
    numeric-count-free chips, and the toggle hiding the
    card (R15) — Layer 1, a new
    `tests/presenter-records-list.test.ts`
  - The whole record edit-mode form — name and
    description inputs, per-attribute rows, type picker,
    options textarea, constraint editor, add and remove
    attribute, and the absent drag handle (R4–R9) — Layer
    1; `RecordDetailEditPresenter`, `recordDraftFromView`,
    `allowedConstraintKinds`, and `formatConstraint`
    (`web-app/app/presenters/record-detail.ts`) are all
    exported and all untested
  - Returning to read mode after Save, and the rendered
    constraint summaries (R10) — Layer 1, a new
    `tests/records-detail-reduce.test.ts` mirroring
    `tests/projects-detail-reduce.test.ts`
  - The toast-stack cap and the re-entrant-save guard for
    Record edits specifically (R10a) — Layer 2, a new
    `tests/browser/records.test.ts` in the spirit of
    `tests/browser/toasts.test.ts`
  - The flow header's painted "Record: Customer Profile"
    dropdown and its selected state (R11) — Layer 2
  - The node panel's whole attribute ref-row rendering
    (R12) — Layer 1; `buildAttributeRefRow`
    (`web-app/app/presenters/flow-designer-view.ts`) is
    exported and untested
  - The workbox action screen's empty-required pre-check
    and its toast text (R13) — Layer 1;
    `hasEmptyRequiredAttribute`
    (`web-app/workbox/detail.ts`) is a pure function one
    `export` away from a direct test
  - A radio-option submit recording the chosen value
    through a transition (R14a) — Layer 1, a `radio`-typed
    case in `tests/adapters-record-transitions.test.ts`;
    the option-membership check in
    `api/record-constraints.ts` is exercised by nothing
  - `instanceListItems`
    (`web-app/app/presenters/record-detail.ts:120`) —
    Layer 1, zero tests; it builds the
    id-plus-readable-values projection
    `records/detail.ts:147` reads for R16's Instances
    list
  - The exact conflict-notice text (R17, R19) — Layer 1,
    importing `INSTANCE_CONFLICT_NOTICE` in
    `tests/presenter-record-instances.test.ts` instead of
    asserting a hand-typed literal
  - The mock seed's actual absence of any custom
    attribute ACL (R21) — Layer 1, a
    `read_roles`/`write_roles` default assertion in
    `tests/mock-data-records.test.ts`; without it a
    future seed adding `read_roles: ['admin']` makes
    R21's live default-ACL check read FAIL on healthy
    product with nothing red first
  - `crank`'s termination trap — a signal stopping the
    live `crank` and its child `./serve`, and the temp
    bundle removed afterward (J1, J2) — Layer 1,
    extending `tests/crank-cli.test.ts` past its
    docker-stub early abort
  - The `Secure` cookie attribute (SV3) — Layer 1, one
    `assert.match(cookie, /Secure/i)` in
    `tests/api-authentication-token.test.ts`;
    `api/authentication.ts` sets it and nothing checks it
  - `localStorage` holding neither
    `fusion-angle:authorization` nor `refresh_token`
    during a real cookie session (SV3) — Layer 2, reading
    `localStorage` after sign-in
  - `bootAuthGate`'s cookie-session branch
    (`cookieRefreshAndInstall` / `isCookieSession`)
    firing on a real reload (SV4) — Layer 2, reloading a
    signed-in page and confirming no bounce; only the
    server-side refresh grant is pinned
  - The ideas page's populated-list cross-tab re-render —
    `onIdeasLoaded`'s own `subscribeIdeaChanges` call
    (SV8b) — Layer 1, extending
    `tests/ideas-empty-subscribe.test.ts` with a
    non-empty initial load that still hears the bell;
    only the empty-list re-init branch is decided, and
    the walk never reaches it
  - The pre-navigation staleness itself (SV10) — Layer 2,
    a third test in `tests/browser/two-jars.test.ts`: B
    sits on `ideas/`, A writes, B's DOM is unchanged
    until B navigates
- The gap list above is the 2026-08-29 audit catalogs'
  output, not an exhaustive sweep of TEST-PLAN.md's own
  `exploratory` clauses. Thirteen purely-exploratory
  cases no catalog listed are its known residue — AA3,
  B4, B5, B12, B13, B14, G22, G23, G23a, G38, G39, G42,
  and I27. Several are species already filed above: G22,
  G23, G23a, G38, G39, and G42 each say in their own
  `Pin:` that the page module carries no CLI or browser
  test, exactly as G12 does; I27 is A5's
  console-and-network covenant on a longer path; B4 and
  B14 are static auth-page copy, decidable by the markup
  test F4 wants. F2 is exploratory too and is NOT residue
  — it is retired, PASS vacuously. Once the audit
  workspace is gone, those thirteen `Pin:` clauses in
  TEST-PLAN.md are the only record of them
- The Send Back feedback textarea is discarded.
  `web-app/app/presenters/idea.ts:410-425` renders
  `<textarea id="approval-send-back-feedback">` in the
  Send Back dialog, and `grep -rn
  "approval-send-back-feedback" web-app/ api/ shared/
  tests/ server/` returns zero reads: the confirm path
  (`web-app/ideas/detail.ts:289-296` → `transitionIdea`
  → `postIdeaStateChange`) has no feedback parameter, so
  whatever a reviewer types is thrown away. Found by
  reading, not driving, during the 2026-08-29 audit; no
  TEST-PLAN case claims the feedback survives. Oracle: a
  Layer 1 test asserting the typed feedback reaches the
  transition
- Two corrupted upstream identifiers, from an old
  id-scrubber. One is a test NAME —
  `tests/presenter-projects-organization.test.ts:398`
  says `XXZruirZyAOoRpNxaDnpSA` where it means
  `current/limit` — and a TEST-PLAN pin quotes it
  faithfully (`TEST-PLAN.md:4391`), so the name is fixed
  first and the pin follows in the same commit. The other
  is a local variable standing for `r1` at four sites in
  `tests/api-invitations-fence.test.ts` (:360, :363,
  :505, :509) — `rOEPOcVMQdJiiiMuiiEhlg`, quoted by no
  pin, so it renames alone
- Two locals named for a retired section slice —
  `gOrganization` and `gAdmin`
  (`tests/api-authentication-token.test.ts:1092-1093`)
  carry the old Section-G prefix; Commandment III says
  they read `starkOrganization` and `starkAdmin`. Quoted
  by no pin, so they rename alone
- A stale manual-coverage pointer —
  `tests/flow-designer-presenter.test.ts:352` points its
  comment at "TEST-PLAN F51"; the locked-members case is
  F62
- Two dormant seed map entries still carry the deleted
  slice seeder's identity `dtmZgnDBlVcoyjxKzlaKgA`
  ('g-unseated') — `api/mock-data.ts:204`
  (`SEED_PASSWORD_CREDENTIAL_BY_IDENTITY`) and
  `api/mock-data/seed-hash-preimage.ts:175`. Pruning
  them was out of the three-layers spec's scope
- Undo at the stack bottom returns 201 — `api/derive-flows.ts`
  computes `hasUndoHistory` as `pairs > 1`, so the first undo
  past the bottom is accepted instead of refused. Named by
  the 2026-08-29 three-layers audit; observed in the F
  undo/redo cases. Oracle: a Layer 1 test in
  `tests/flow-operations.test.ts` asserting the bottom-of-stack
  undo is refused.
- The first click after a page reload only focuses the window
  — the focusing click is the viewport center, never the
  top-left brand (that is the Apple menu when Chrome is
  fullscreen or flush with the menu bar; the next click
  opens About This Mac). Then click the intended control
  once. Named by the 2026-08-29 three-layers audit and
  carried as a driving note in TEST-PLAN.md's `## The
  walk`. Oracle: a Layer 2 test under `tests/browser/`
  asserting one click after reload reaches the element.
- ACL-editing UI for record attributes (`read_roles` /
  `write_roles`) — R21's restricted branches are
  seed-produced today; setting an ACL is
  `PUT …/attributes/:id` only, and no page reaches it.
  Oracle: an admin edits an ACL through the UI and a
  member-perspective New-instance form flips live;
  TEST-PLAN R21 gains the write path as a user gesture
- Member-removal affordance under members/identities —
  zero-membership is seed-produced today (Riley Okafor);
  no page deletes a membership row. Oracle: removing a
  member's last seat lands that identity on
  `invitations/index.html` at next boot (TEST-PLAN
  B25–B29 driven live); restores B28's original
  "restore the deleted membership row" branch

## Sequencing

- 8 → 6 (the chat clause consumes chats)
- 5 → 10 (the health probe consumes `/status`)
- Item 3's token-at-rest hashing and physical PII
  erasure close their KNOWN seams — the closer removes
  the ARCHITECTURE.md bullet and this file's line in
  one commit
- The profile document precedes the roster-profile and
  `DEFAULT_DIM` bullets
- The mock-seed anchor bullet activates after
  2026-09-13
- The Deno specs run strictly 1 → 6 (3 and 4 may swap
  after Spec 2's measurements; Spec 6 optional)
- `api/derive-states.ts:811-823` (claim-expiry as its
  own event) lands before any multi-process deployment

## Close protocol

The pin flips red → fix the test to the new truth (or
delete it if the old incomplete behavior is gone) →
remove the bullet here → remove the named comment at
its `file:line` → for a KNOWN seam, remove the
ARCHITECTURE.md bullet in the same commit → AUDIT.md's
`m` is the new seam count.

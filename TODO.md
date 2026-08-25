# TODO

The single home for later work. An item leaves this
file by shipping; `## Close protocol` is the exit.

## Critical path

Twelve items, in this order — each its own brainstorm →
spec → plan → ship cycle, implemented sequentially. A
"Merged:" clause names bullets absorbed from
`## Later work`; they keep their oracles.

1. Remove the lifecycle trio — fold `state` /
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
2. Credentials out of the message; views for the app —
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
3. Cachability — headers, `HEAD`, conditional
   requests, and the rest; the brainstorm presents its
   questions from most to least desirable. Start:
   `server/http-server.ts` `NO_STORE` and
   `CONTENT_SECURITY_POLICY`.
4. `/status` — `{ up: boolean, components: {
   postgres: boolean } }`; `up` is true when every
   component is; built for more components. Item 10's
   health probe.
5. Execute TEST-PLAN.md with up to 48 subagents —
   after the run-four remediation ships; the
   Protocol's one-profile, hunters-in-turn contract is
   revisited for 48. BLOCKING precondition, cleared
   before the run starts: `./validate` is this run's
   automatic abort, and a false prophet in the gating
   suite kills the run spuriously —
   `tests/api-flow-document.test.ts:1038` ("an undo
   racing a save") failed three times (two on Markdown
   diffs), two racers winning where one was expected,
   then passed in isolation and on re-run. Merged: the
   five run-four mitigation stubs (absorbed by the
   remediation spec); the flaky-test bullet.
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
   four hand-kept copies of the reveal key set
   (`api/test-plan-slices.ts:122-139`,
   `server/seed.ts:174-203`,
   `tests/pg-seed.test.ts:348-353`); the second
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
    item 4.
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
- The `≥ N` doc debt (`TEST-PLAN.md:131-132, 185-186`)
- Attribute drag-reorder (TEST-PLAN R8)
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
- C4 / C7 scored FAIL on a foreign paint, not a product
  regression. The failing tiles — 0 ideas, 0 projects,
  1 flow, Impact `—`, no objective rows, a chip naming
  another admin — are the B org's dashboard exactly, and
  B is the hunter joined just before C; the C org
  derives 4 / 3 / 1, +56 / −33, four objectives with
  trendlines (`tests/slices-portfolio-scores.test.ts`).
  Two leak vectors: the previous hunter's tab is still
  the globally selected page, or the HttpOnly
  `refresh_token` survives a JS-side "delete site data"
  so the next hunter's first boot cookie-refreshes as
  the previous admin (B20's own covenant). Shelved
  behind the serial run in flight. The fix is Protocol,
  not product: a hunter preflight — close every MCP tab,
  open one, Sign out if boot lands authenticated, sign
  in, then assert the sidebar chip names this admin and
  the header names this org before any case; the master
  closes a joined hunter's tabs; a data-shape FAIL reads
  the chip in the same `javascript_tool` call and a
  foreign chip is BLOCKED "foreign paint", never FAIL; a
  Known MCP limitations bullet for the shared-jar leak;
  and the C pin extended to `actualMean` and four
  non-empty trendlines. Spec:
  `docs/superpowers/test-plan-mitigations/`
  `2026-08-24-c4-c7-dashboard-gauges.md`
- Cryptographically verifiable ledger — brainstorm
  hash-and-verify (or sign) of stored pairs. The dropped
  `version` column hashed on write and was never checked
  on read. `request_hash` is replay identity, not
  response integrity — `SCHEMA.md` item 4

## Sequencing

- 8 → 6 (the chat clause consumes chats)
- 4 → 10 (the health probe consumes `/status`)
- Item 2's token-at-rest hashing and physical PII
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

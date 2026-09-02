# Small-items sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this spec's worktree (AGENTS.md
> § Worktrees).

> **For the dispatching orchestrator (AGENTS.md § Subagents):**
> every subagent prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then push down: the 78-char lint on
> code/scripts (not `.md`), 4-space indent, no inline styles
> (CSS custom properties + classes per DESIGN-SYSTEM.md), the
> `org` identifier ban (never `orgId`/`myOrg`-style camelCase —
> spell `organization`), present-tense-imperative ~50-char
> commit subjects with the mandated trailer, TDD at Layer 1
> (red before green in every commit that changes behavior),
> the Sin of Test Weakening (when test and code diverge, the
> code changes), the Sin of Unbidden Helper Code (each task's
> diff is its story — nothing more), and the codebase patterns
> named under "Context an implementer must know". Subagents
> work in this worktree and never create their own — never
> pass the Agent tool `isolation`.

**Goal:** Ship the twenty-two minor Later-work items TODO.md
carries — test strengthenings, two dialog resets, a stats page
that hears the bell, a filtered binding dropdown, an admin-only
Edit/Archive, a record-existence probe on the binding PUT, four
dead-code deletions, and the docs that leave with them — one
concern per commit, each commit removing its own TODO bullet.

**Architecture:** No wire-contract, schema, or design change.
Every product change stays inside the files its TODO bullet
names or their exact sibling. Tests strengthen first (items 1,
3, 4 ARE the tests), behavior changes land red-then-green at
Layer 1 where a pin is possible and at Layer 2 (`tests/browser/`)
for the two dialogs and the narrow-viewport row, and the
deletions ride existing green pins (`tsc`, SCHEMA.svg, the seed
counts, the presenter tests). Docs leave by the Close protocol:
already-done bullets first, corrections last.

**Tech Stack:** TypeScript under `node --strip-types`,
`node:test`, CDP browser tests under `./test-browser`, the
repo's own `./validate` gate. No new dependencies.

**Spec:**
`docs/superpowers/specs/2026-09-01-small-items-sweep-design.md`

**Worktree:** `.worktrees/2026-09-01-small-items-sweep` on
branch `2026-09-01-small-items-sweep`, based on master
`82dee1d9`; the spec is its one commit (`e4d3a8d3`). Every
line number below is at `82dee1d9` unless a task says
otherwise — earlier tasks in the same file shift later ones,
so locate by the quoted text, not the number.

## Global Constraints

- Lint: 78-char max line on code and scripts (NOT `.md`);
  4-space indent; trailing newline; no trailing whitespace.
- Identifier ban: no camelCase `org` abbreviation
  (`org[A-Z]`, `xOrg…`, `Org[A-Z]` forms). Spell
  `organization`.
- Commits: one concern each; subject ≈50 chars,
  present-tense imperative, no body prose; end every commit
  message with exactly these two trailer lines:

  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
  ```

- `./validate` must be green before every commit. It runs:
  whole-tree `tsc`, browser-subset `tsc`, `./test` (UTC pass
  on `tests/*.test.ts`, then a Honolulu pass on
  `tests/tz/*.test.ts`), the 78-char lint, the `org` ban,
  `generate-schema-svg --check`,
  `generate-api-documentation --check`.
- Layer 2 (`./test-browser`) is NOT in `./validate`. Tasks
  10, 11, and 15 add browser tests; run `./test-browser`
  before each of those commits, and `./test-all` before the
  fast-forward. `./test-browser` needs Chrome (`CHROME` or
  `CHROME_DEBUG_URL`); if Chrome cannot launch in the sandbox,
  say so in the task report and do NOT claim Layer 2 green.
- Scope rule (spec § Decisions): an item touches only the
  files its bullet names or their exact sibling; no new
  abstraction beyond the two the spec names (`#definitionAt`,
  `bindableRecords`); no re-wrapping, re-formatting, or
  comment-tidying outside the lines a task changes.
- TODO.md Close protocol: each product commit removes its own
  Later-work bullet, or its clause of a shared one, in the
  SAME commit. Line-number drift in bullets that stay is not
  corrected.
- Red before green: every task that changes behavior runs its
  new or extended test and shows the failure BEFORE the
  product edit. A test that is green on master for a behavior
  the task changes is a wrong test — fix the test, never skip
  the red.
- Counts and statuses are MEASURED: the seed pins (`1453`
  message pairs, `92` actual documents) must stay green
  unchanged in Task 18 and Task 19; a red pin there means the
  product edit is wrong, not the pin.
- Root-doc ceilings: TODO.md and TEST-PLAN.md are the only
  root docs that change (the spec exempts them); no other
  root doc moves.

## Measured against the spec (read at `e4d3a8d3`)

The spec was read against source before this plan was
written. Four findings change a task's shape; each is applied
below and named at its task:

- **Item 23 is already shipped.** Commit `b705122a`
  ("Correct TEST-PLAN drift and J1 protocol"), an ancestor of
  `82dee1d9`, rewrote TEST-PLAN D6/D7 to the toast: D6 reads
  "an error toast reads … the button stays clickable (no
  `disabled` attribute — validation is post-click)", D7 says
  "there is no disabled→enabled transition", and the Pin
  clauses name three tests that exist —
  `tests/presenter-idea.test.ts:813` ('ideaCreateDraftIsComplete
  requires title, problem, solution, and outcome'), `:844`
  ('IdeaCreatePresenter.render keeps submit clickable while
  the draft is empty'), `:863` ('IdeaCreatePresenter.render
  enables submit and echoes draft values into the form
  fields'). Spec commit 25 has nothing to ship; Task 25 is
  struck. The "Validation voices" bullet correction (item 24)
  lands in Task 26 exactly as the spec already planned.
- **Item 16 has two callers, not three.**
  `api/mock-data/seed-message-pairs.ts:631` is a comment that
  names `postFlowRecordDocumentOp`; the calls are
  `api/routes.ts:5539` and `api/mock-data.ts:956`. Pass 1 of
  the seed already computes each binding's organization with
  `flowRecordOrganizationFor(join)` (`seed-message-pairs.ts:
  1072-1078`, exported); pass 2 uses the same function so the
  two passes cannot disagree. `buildRecords()` returns rows
  WITHOUT `organization_id`, so a record lookup is not an
  option.
- **The seed's binding writes ride the same `Promise.all` as
  the record writes** (`api/mock-data.ts:750-969`). With the
  probe inside the binding's transaction body, ordering between
  the two waves is an interleaving accident on either backend.
  Task 18 moves the binding writes into a second `await
  Promise.all` after the first resolves; the `1453` pin is the
  proof (spec § Hazards, "Seed order").
- **The `r1` rename is a whole-file rename in each of its five
  files.** Every occurrence of `rOEPOcVMQdJiiiMuiiEhlg` in
  `tests/api-invitations-fence.test.ts` (4),
  `tests/api-flow-tags.test.ts` (18),
  `tests/flow-fsm-reduce.test.ts` (2),
  `tests/flow-zoom-to-fit.test.ts` (4), and
  `tests/derive-record-instances.test.ts` (2) is an identifier;
  none is a string literal; none of the five files has a live
  `r1`. The ~45 string-literal occurrences live in OTHER files
  and stay.

Two spec cites are corrected in passing: the D6 stub's
`Reproduced by` is absent because the stub predates that
format (nothing to do); the `92` pin is
`tests/mock-data-valid.test.ts:336`, not a `mock-data-pairs`
constant.

## Context an implementer must know (verified against source)

- **Run one test file:**

  ```bash
  TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
      --test tests/<name>.test.ts
  ```

  `./test` is the two-pass whole suite; `./validate` wraps it
  with both `tsc` projects and the lints. `./test-browser`
  bundles the client into `$TMPDIR` and runs
  `tests/browser/*.test.ts` serially (all of them — there is
  no single-file mode).
- **The ideas-empty-subscribe shape** (`tests/ideas-empty-
  subscribe.test.ts`): stub `localStorage`, `window`,
  `MutationObserver`, `document` on `globalThis` BEFORE any
  web-app import (the module graph reads theme/session state at
  load); `await import('./in-page-facade.ts')` registers the
  in-process HTTP facade; `initAdapter(() => db)` then
  `putSessionToken(await organizationToken())` seeds the
  session; `document.querySelector` serves element stubs by
  selector; a cross-tab write is a raw `ctx.PUT` (no same-tab
  notify) followed by `new BroadcastChannel('fusion-angle:
  data').postMessage({ kind: 'full' })`; drain 25
  `setImmediate` ticks before asserting; `delete` every stub in
  `finally`. `kind: 'full'` fires every subscription channel
  (`web-app/app/channels.ts:90-94`), so `subscribeFlowChanges`
  hears it exactly as `subscribeIdeaChanges` does.
- **DOM helpers** (`web-app/app/dom.ts`): `$` returns
  `HTMLElement | null`; `$input` / `$textarea` are typed
  `querySelector` casts returning `null` when absent;
  `$required` throws; `setHtml(el, safeHtml)` assigns
  `innerHTML`; `populateIcons` skips a missing selector.
  Pages trust their own static markup with `!`
  (`$input('#id-name', document)!.value`) — match that voice.
- **Dialogs** (`web-app/app/dialog.ts`): every modal is a
  native `<dialog>`; `data-dialog-open="<id>"` /
  `data-dialog-cancel="<id>"` are driven by one delegated
  `handleDialogClick`; the open element is `#<id>-dialog`;
  Escape is the native cancel. The identities page binds its
  own click handler on `#add-identity-btn` (`web-app/
  identities/index.ts:153-158`) beside the delegate; members
  does the same on `#add-member-btn` (`web-app/members/
  index.ts:262-267`).
- **Browser harness** (`tests/browser/fixtures.ts`):
  `useBrowser()` once per file; `withAdminPage(browser.get(),
  async (page, origin) => …)` starts an in-process origin on
  the memory backend seeded with `postMockDataLoad`, signs in
  as `demo@example.com` (Tony Stark, Stark admin), and
  disposes both. `registryUrl(origin.baseUrl, '<key>')` builds
  a page URL from `PAGE_REGISTRY` (`identities`, `members`,
  `dashboard` are keys); `page.ready('<key>')` waits for the
  page's own ready mark; `page.click(sel)` dispatches
  compositor input at the element's centre (inside an open
  modal is fine — `tests/browser/toasts.test.ts` clicks the
  invite dialog's submit); `page.waitFor(sel)` / `page.until(
  expr, label)` poll; `page.evaluate<T>(expr)` runs page JS;
  `page.rect(sel)` returns the bounding rect;
  `page.setViewport(w, h, mobile)` emulates a device.
- **The binding route family** (`api/routes.ts`): a `route()`
  `put` handler receives `(db, p, body, actor, messagePair,
  organization)`; `requireOrganization(organization)` unwraps
  the verified claim (`:5040-5044` is the work-order binding's
  exact shape). Ops run validators pre-tx and await only row
  ops inside `db.transaction(MESSAGE_TABLES, async (view) =>
  …)`. `view.messagePairs.getAllAtAddress(collection, uriId)`
  reads one address; `deriveDocumentsAt(rows, prefix)` reduces
  to `Map<id, DerivedDocument>` with DELETE heads excluded;
  `recordTypesUriPrefix(organization)` is the record-types
  `uri_collection`. All three are already imported in
  `routes.ts` (`:161`, `:179`, and the store on the view).
  `EntityNotFoundError(table, id)` (`api/db.ts:9`) maps to
  404 `{ error: 'Not found: <table>/<id>' }`.
- **The write gate answers 201 on the first append** of a
  document PUT (`tests/api-work-order-binding.test.ts:562`,
  `seedFlowTypeJoin` at `:246-265` asserts 201 on a fresh
  binding), whatever the route's `WRITE_RESPONSE_SPECS`
  status says for the replay branch.
- **`RecordEntity`** (`api/types.ts:1224-1233`): `id`,
  `organization_id`, `name`, `description`, `position`,
  `state` (string; `'archived'` is the lifecycle value).
- **`RecordDetailView`** (`web-app/app/presenters/
  record-detail.ts:436-447`) is built in exactly two places:
  `composeView(...)` in `web-app/records/detail.ts` (`:209-214`
  from a fresh load, `:234-239` on re-render) and `pageFor()`
  in `tests/presenter-record-detail.test.ts:9-32`. `heldRoles()`
  (`records/detail.ts:113-119`) already yields the caller's
  project roles for `projectInstanceFields`.
- **CSS order** (DESIGN-SYSTEM.md): `components-*.css` load
  6th, `responsive.css` 9th, so an equal-specificity rule in
  `responsive.css` wins by order — no `!important`. The
  `@media (max-width: 767px)` block at `web-app/app/styles/
  responsive.css:18-27` is where mobile grid overrides live.
- **TEST-PLAN pin edits** keep the existing voice: a pin lists
  `tests/<file>.test.ts '<exact test name>' (decides …)`
  clauses separated by semicolons, then `exploratory — …` for
  what only the walk observes. Quote test names exactly as the
  `test(...)` string concatenation spells them.

---

### Task 1: Strike the bullets the tree already shipped (spec item 25)

Docs only; independent of every other commit; lands first and
alone.

**Files:**
- Modify: `TODO.md` (eight bullets: `:130-132`, `:197-199`,
  `:335-338`, `:394-396`, `:534-540`, `:610-613`, `:614-616`,
  `:1090-1096`)
- Modify: `TEST-PLAN.md` (the D26 pin at `:1911-1930`, the
  B24 pin at `:1263-1275`)

**Interfaces:** none.

- [ ] **Step 1: Re-verify the eight claims against the tree**

Run each; every line must print a match (a silent grep means
the claim is false — stop and report, do not strike):

```bash
grep -n "'refresh on a logged-out but live jti is the'" \
    tests/api-token-exchange-revocation.test.ts
grep -n "presses only the active filter chip" \
    tests/state-badge.test.ts
grep -n "omits promoted and archived" tests/presenter-idea.test.ts
grep -n "Priority and Approved carry the" \
    tests/mock-data-records.test.ts
grep -rn "redirectToLogin()" web-app/ --include='*.ts' | wc -l
grep -n "alex.kim@company.com" TEST-PLAN.md | head -3
grep -n "docker compose up -d --wait postgres" crank
grep -rn "formRExtras" api/ web-app/ tests/ ; echo "(empty = gone)"
```

Expected: the first four name their tests; `redirectToLogin()`
totals thirteen lines — its definition in
`web-app/app/auth-redirect.ts` plus twelve call sites;
TEST-PLAN names alex.kim under G/V5; `crank` runs
postgres-only compose; `formRExtras` is absent.

- [ ] **Step 2: Narrow critical-path item 9's second-instances clause**

In `TODO.md` under `## Critical path` item 9, replace

```
   guarded by no test); the second
   instances the remediation added (`formRExtras`'
   record create, `canvasFocusOf`'s walk); the undo
```

with

```
   guarded by no test); the second instance the
   remediation added (`canvasFocusOf`'s walk); the undo
```

- [ ] **Step 3: Delete the seven done bullets**

Delete each of these blocks verbatim (each is a whole bullet
or sub-bullet under `## Later work`):

```
- One client 401-recovery voice through
  `redirectToLogin()` with `?return=` —
  `tests/adapters-http-facade.test.ts`
```

```
- G/V5 needs a cross-slice identity to verify Decline,
  or the case text should sanction any invited
  identity — plan defect vs explorer slip, unresolved —
  TEST-PLAN.md G/V5
```

```
- Investigate `docker compose up -d --wait` postgres
  only. Not the compose `server` — that would be a
  second origin (`compose.yaml`)
```

```
  - A 401 after sign-out being the revocation ledger
    rejecting a presented credential, not merely a
    request with no cookie (B24) — Layer 1, an API test
    that revokes through the ledger while a live access
    token is still in play; the two-jars pin shares one
    cookie jar, so a cleared cookie alone explains its
    bounce
```

```
  - `promoted` and `archived` ideas never getting a
    filter badge even when present (D25) — Layer 1, a
    `renderBadges` fixture including one; only their
    absence from the candidate list is source-confirmed
```

```
  - The `aria-pressed="true"` highlight on the selected
    filter badge (D26) — Layer 1, one more assertion on
    the lit case the dimmed test already builds
```

```
  - The mock seed's actual absence of any custom
    attribute ACL (R21) — Layer 1, a
    `read_roles`/`write_roles` default assertion in
    `tests/mock-data-records.test.ts`; without it a
    future seed adding `read_roles: ['admin']` makes
    R21's live default-ACL check read FAIL on healthy
    product with nothing red first
```

- [ ] **Step 4: Name the D26 test in TEST-PLAN.md**

Locate `- [ ] **D26**`. In its Pin clause replace the tail

```
       'IdeaPresenter.buildStateBadge marks the badge
       dimmed when isActive is false' (decides
       `data-dimmed="true"` on the non-selected
       badge — half of D26's dimming clause);
       exploratory — the live `aria-pressed`
       highlight on the selected badge (the same test
       builds the selected/`isActive: true` case and
       checks only `data-dimmed="false"` on it, never
       `aria-pressed`)
```

with

```
       'IdeaPresenter.buildStateBadge marks the badge
       dimmed when isActive is false' (decides
       `data-dimmed="true"` on the non-selected
       badge — half of D26's dimming clause);
       tests/state-badge.test.ts 'stateBadge presses
       only the active filter chip' (decides
       `aria-pressed="true"` on the selected badge and
       `"false"` on every other — the highlight half);
       exploratory — the live click and repaint
```

- [ ] **Step 5: Name the B24 ledger test in TEST-PLAN.md**

Locate `- [ ] **B24**`. Replace its whole Pin clause

```
  Pin: tests/browser/two-jars.test.ts 'two tabs share
       the cookie; sign-out in one bounces the other'
       — the same pin as SV9, which this case
       duplicates almost exactly; exploratory — the
       live in-memory-access-token nuance before
       navigation (same as SV9); also unclaimed: that
       the 401 comes from the shared revocation
       ledger specifically, rather than simply a
       cleared cookie — both tabs share one jar, so
       tab B's cookie is already gone too, and no
       test isolates the ledger check from the
       cookie-absence case
```

with

```
  Pin: tests/browser/two-jars.test.ts 'two tabs share
       the cookie; sign-out in one bounces the other'
       — the same pin as SV9, which this case
       duplicates almost exactly;
       tests/api-token-exchange-revocation.test.ts
       'refresh on a logged-out but live jti is the
       revocation, not reuse' (decides the shared
       ledger itself rejects a presented credential
       nowhere near expiry — a live jti under a logout
       stamp, no cookie in play; the ledger bites at
       refresh, and tests/api-token-gate.test.ts 'a
       logout-everywhere does not kill a live access
       token' pins that a live ACCESS token is not the
       ledger's to refuse before exp); exploratory —
       the live in-memory-access-token nuance before
       navigation (same as SV9)
```

- [ ] **Step 6: Validate and commit**

```bash
./validate
git add TODO.md TEST-PLAN.md
git commit -m "$(cat <<'MSG'
Strike the bullets the tree already shipped

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 2: Assert the raw PUTs leave the empty page asleep (spec item 1)

A strengthening: the test's load-bearing claim moves from a
comment into an assertion. Green on a correct product; red
only if the product already wakes on a bare write. Must land
before Task 13 (same file: strengthen, then extend).

**Files:**
- Modify: `tests/ideas-empty-subscribe.test.ts:154-155`
- Modify: `TODO.md` (the bullet at `:370-373`)

**Interfaces:** none.

- [ ] **Step 1: Insert the pre-bell drain and assertion**

Between the second `ctx.PUT(...)` call (ends `:154` with
`);`) and `const poster = new BroadcastChannel(` insert:

```ts
            // The two PUTs alone must not wake the page:
            // drain as generously as the post-bell assert
            // does, then prove the list is still empty.
            for (let i = 0; i < 25; i++) {
                await new Promise(
                    r => setImmediate(r),
                );
            }
            assert.ok(
                !listStub.innerHTML.includes(
                    'Cross-tab idea',
                ),
                'the raw PUTs alone must not wake'
                + ' the empty page',
            );
```

- [ ] **Step 2: Run the test — expected green (a strengthening)**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/ideas-empty-subscribe.test.ts
```

Expected: 1 pass. If it is RED here, the product wakes on a
bare write — stop and report; do not touch the assertion.

- [ ] **Step 3: Remove the TODO bullet**

Delete from `TODO.md`:

```
- `tests/ideas-empty-subscribe.test.ts` enforces its
  load-bearing property by comment, not assertion: assert
  the two raw PUTs alone do not wake the page before
  posting the bell
```

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add tests/ideas-empty-subscribe.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Assert the raw PUTs leave the empty page asleep

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 3: Drop the dead MutationObserver disconnect stub (spec item 2)

**Files:**
- Modify: `tests/ideas-empty-subscribe.test.ts:68-71`
- Modify: `TODO.md` (the "Run-six cosmetics" bullet at
  `:388-393`)

**Interfaces:** none.

- [ ] **Step 1: Confirm nothing calls the observer's disconnect**

```bash
grep -rn "new MutationObserver" web-app/
grep -rn "\.disconnect()" web-app/ tests/
```

Expected: one observer (`web-app/app/drag-reorder.ts:390`),
which never disconnects; the only `.disconnect()` call is a
ResizeObserver's (`web-app/app/adapters/resize-observer.ts:7`),
whose global the ideas test never stubs, so nothing under test
reaches the MutationObserver stub's `disconnect`.

- [ ] **Step 2: Delete the stub line**

The stub

```ts
        g['MutationObserver'] = class {
            observe(): void {}
            disconnect(): void {}
        };
```

becomes

```ts
        g['MutationObserver'] = class {
            observe(): void {}
        };
```

- [ ] **Step 3: Run the test**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/ideas-empty-subscribe.test.ts
```

Expected: 1 pass.

- [ ] **Step 4: Strike the clause from the TODO bullet**

The bullet

```
- Run-six cosmetics, none load-bearing: `unknown[]`
  returns now provably narrower
  (`api/document-family.ts:438,:445`), a non-strict DESC
  pin (`tests/api-entity-history-routes.test.ts:1033`),
  and a dead `disconnect()` stub in
  `tests/ideas-empty-subscribe.test.ts`
```

becomes

```
- Run-six cosmetics, none load-bearing: `unknown[]`
  returns now provably narrower
  (`api/document-family.ts:438,:445`) and a non-strict
  DESC pin (`tests/api-entity-history-routes.test.ts:1033`)
```

- [ ] **Step 5: Validate and commit**

```bash
./validate
git add tests/ideas-empty-subscribe.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Drop the dead MutationObserver disconnect stub

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 4: Pin the archival and reactivation cells by tag (spec item 3)

`row.includes('archived')` is implied by the row-selection
predicate `r.includes('Objective archived')`; the detail cell
is unpinned. The presenter emits `<td>archived</td>` and
`<td>reactivated</td>` as the third cell
(`web-app/app/presenters/project-score-history.ts:200-206,
:219-225`). Must land before Task 14 (honest assertions
before the refactor behind them).

**Files:**
- Modify: `tests/presenter-project-score-history.test.ts:225,
  :260`
- Modify: `TODO.md` (the bullet at `:374-377`)

**Interfaces:** none.

- [ ] **Step 1: Assert the tagged forms**

At `:225` replace

```ts
        assert.ok(row.includes('archived'));
```

with

```ts
        assert.ok(row.includes('<td>archived</td>'));
```

At `:260` replace

```ts
        assert.ok(row.includes('reactivated'));
```

with

```ts
        assert.ok(row.includes('<td>reactivated</td>'));
```

- [ ] **Step 2: Run the test — expected green**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/presenter-project-score-history.test.ts
```

Expected: all pass. Red means the presenter no longer emits
the tagged cell — report, do not weaken.

- [ ] **Step 3: Remove the TODO bullet**

Delete from `TODO.md`:

```
- `tests/presenter-project-score-history.test.ts:224,:259`
  assert substrings the row-selection predicate already
  implies, leaving the detail cell unpinned — assert
  `<td>archived</td>`
```

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add tests/presenter-project-score-history.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Pin the archival and reactivation cells by tag

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 5: Pin the versions DESC order strictly (spec item 4)

The fixture's two timestamps are distinct literals, so
equality can never occur; `>=` admits a tie the data cannot
produce.

**Files:**
- Modify: `tests/api-entity-history-routes.test.ts:1027`
- Modify: `TODO.md` (the "Run-six cosmetics" bullet)

**Interfaces:** none.

- [ ] **Step 1: Make the comparison strict**

Replace

```ts
        assert.ok(rows[0]!.at >= rows[1]!.at);
```

with

```ts
        assert.ok(rows[0]!.at > rows[1]!.at);
```

- [ ] **Step 2: Run the test — expected green**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/api-entity-history-routes.test.ts
```

Expected: all pass.

- [ ] **Step 3: Strike the clause from the TODO bullet**

The bullet (as Task 3 left it)

```
- Run-six cosmetics, none load-bearing: `unknown[]`
  returns now provably narrower
  (`api/document-family.ts:438,:445`) and a non-strict
  DESC pin (`tests/api-entity-history-routes.test.ts:1033`)
```

becomes

```
- Run-six cosmetics, none load-bearing: `unknown[]`
  returns now provably narrower
  (`api/document-family.ts:438,:445`)
```

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add tests/api-entity-history-routes.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Pin the versions DESC order strictly

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 6: Restore current/limit in the usage-bar test name (spec item 5)

The scrubber replaced the word `current` with Tony Stark's
identity id in one test NAME, and TEST-PLAN G9 quotes that
name. Every other occurrence of the id in the test file is a
genuine identity id and stays.

**Files:**
- Modify: `tests/presenter-projects-organization.test.ts:398`
- Modify: `TEST-PLAN.md` (the G9 pin; `:4465` at `82dee1d9`,
  shifted by Task 1 — locate by the quoted text)
- Modify: `TODO.md` (the "Two corrupted upstream
  identifiers" bullet at `:1154-1164`)

**Interfaces:** none.

- [ ] **Step 1: Confirm the single site**

```bash
grep -n "XXZruirZyAOoRpNxaDnpSA" \
    tests/presenter-projects-organization.test.ts
grep -n "XXZruirZyAOoRpNxaDnpSA/limit" TEST-PLAN.md
```

Expected: exactly one line each (`:398` and the G9 pin).

- [ ] **Step 2: Restore the word in the test name**

Replace

```ts
    + ' XXZruirZyAOoRpNxaDnpSA/limit values',
```

with

```ts
    + ' current/limit values',
```

- [ ] **Step 3: Move the G9 pin with it**

In `TEST-PLAN.md`'s G9 Pin clause replace

```
       XXZruirZyAOoRpNxaDnpSA/limit values' (decides the
```

with

```
       current/limit values' (decides the
```

- [ ] **Step 4: Run the test**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/presenter-projects-organization.test.ts
```

Expected: all pass (a rename; the assertions are unchanged).

- [ ] **Step 5: Shrink the TODO bullet to its r1 half**

Replace the whole bullet

```
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
```

with

```
- One corrupted upstream identifier, from an old
  id-scrubber — a local variable standing for `r1`
  (`rOEPOcVMQdJiiiMuiiEhlg`, its sibling `r2` beside it)
  in `tests/api-invitations-fence.test.ts`,
  `tests/api-flow-tags.test.ts`,
  `tests/flow-fsm-reduce.test.ts`,
  `tests/flow-zoom-to-fit.test.ts`, and
  `tests/derive-record-instances.test.ts`; quoted by no
  pin, so it renames alone
```

- [ ] **Step 6: Validate and commit**

```bash
./validate
git add tests/presenter-projects-organization.test.ts \
    TEST-PLAN.md TODO.md
git commit -m "$(cat <<'MSG'
Restore current/limit in the usage-bar test name

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 7: Restore r1 across the scrubbed test locals (spec item 6)

In exactly five files every occurrence of
`rOEPOcVMQdJiiiMuiiEhlg` is an identifier standing for `r1`
(its sibling `r2` sits on the next line). The same text is a
genuine id in ~15 OTHER test files — those are not touched. A
rename only: do not re-wrap the lines the scrubber left oddly
wrapped (one concern per commit).

**Files:**
- Modify: `tests/api-invitations-fence.test.ts` (4 sites)
- Modify: `tests/api-flow-tags.test.ts` (18 sites)
- Modify: `tests/flow-fsm-reduce.test.ts` (2 sites)
- Modify: `tests/flow-zoom-to-fit.test.ts` (4 sites)
- Modify: `tests/derive-record-instances.test.ts` (2 sites)
- Modify: `TODO.md` (the bullet Task 6 shrank)

**Interfaces:** none.

- [ ] **Step 1: Measure before — counts and no live r1**

```bash
for f in tests/api-invitations-fence.test.ts \
    tests/api-flow-tags.test.ts tests/flow-fsm-reduce.test.ts \
    tests/flow-zoom-to-fit.test.ts \
    tests/derive-record-instances.test.ts; do
    printf '%s ids=%s r1=%s literals=%s\n' "$f" \
        "$(grep -c 'rOEPOcVMQdJiiiMuiiEhlg' "$f")" \
        "$(grep -c '\br1\b' "$f")" \
        "$(grep -c "'rOEPOcVMQdJiiiMuiiEhlg'" "$f")"
done
```

Expected: ids 4 / 18 / 2 / 4 / 2; `r1=0` and `literals=0` in
every file. Any other numbers: stop and read the file — a
literal or a live `r1` makes the blind rename destructive.

- [ ] **Step 2: Rename the identifier in the five files**

```bash
perl -pi -e 's/\brOEPOcVMQdJiiiMuiiEhlg\b/r1/g' \
    tests/api-invitations-fence.test.ts \
    tests/api-flow-tags.test.ts \
    tests/flow-fsm-reduce.test.ts \
    tests/flow-zoom-to-fit.test.ts \
    tests/derive-record-instances.test.ts
```

- [ ] **Step 3: Measure after**

```bash
grep -c "rOEPOcVMQdJiiiMuiiEhlg" tests/api-invitations-fence.test.ts \
    tests/api-flow-tags.test.ts tests/flow-fsm-reduce.test.ts \
    tests/flow-zoom-to-fit.test.ts \
    tests/derive-record-instances.test.ts
grep -c "\br1\b" tests/api-invitations-fence.test.ts \
    tests/api-flow-tags.test.ts tests/flow-fsm-reduce.test.ts \
    tests/flow-zoom-to-fit.test.ts \
    tests/derive-record-instances.test.ts
git diff --stat
```

Expected: 0 remaining in each; r1 counts 4 / 18 / 2 / 4 / 2;
the diff touches exactly those five files.

- [ ] **Step 4: Run the five files**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/api-invitations-fence.test.ts \
    tests/api-flow-tags.test.ts tests/flow-fsm-reduce.test.ts \
    tests/flow-zoom-to-fit.test.ts \
    tests/derive-record-instances.test.ts
```

Expected: all pass.

- [ ] **Step 5: Remove the TODO bullet**

Delete the bullet Task 6 left:

```
- One corrupted upstream identifier, from an old
  id-scrubber — a local variable standing for `r1`
  (`rOEPOcVMQdJiiiMuiiEhlg`, its sibling `r2` beside it)
  in `tests/api-invitations-fence.test.ts`,
  `tests/api-flow-tags.test.ts`,
  `tests/flow-fsm-reduce.test.ts`,
  `tests/flow-zoom-to-fit.test.ts`, and
  `tests/derive-record-instances.test.ts`; quoted by no
  pin, so it renames alone
```

- [ ] **Step 6: Validate and commit**

```bash
./validate
git add tests/api-invitations-fence.test.ts \
    tests/api-flow-tags.test.ts tests/flow-fsm-reduce.test.ts \
    tests/flow-zoom-to-fit.test.ts \
    tests/derive-record-instances.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Restore r1 across the scrubbed test locals

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 8: Name the unseated-grant locals after Stark (spec item 7)

Three names, not two: `gOrganization`, `gAdmin`, and
`gAdminToken` (`tests/api-authentication-token.test.ts:1092,
:1093, :1179-1183, :1186, :1192`) carry the retired Section-G
prefix. They become `starkOrganization`, `starkAdmin`,
`starkAdminToken`. Nine lines in one test body; no pin quotes
them.

**Files:**
- Modify: `tests/api-authentication-token.test.ts`
- Modify: `TODO.md` (the bullet at `:1165-1170`)

**Interfaces:** none.

- [ ] **Step 1: Measure before**

```bash
grep -n "\bgOrganization\b\|\bgAdmin\b\|\bgAdminToken\b" \
    tests/api-authentication-token.test.ts
grep -c "stark" tests/api-authentication-token.test.ts
```

Expected: nine lines (`:1092, :1093, :1179, :1180, :1181,
:1182, :1183, :1186, :1192`); the second count is a baseline.

- [ ] **Step 2: Rename, longest name first**

```bash
perl -pi -e 's/\bgAdminToken\b/starkAdminToken/g;' \
    -e 's/\bgAdmin\b/starkAdmin/g;' \
    -e 's/\bgOrganization\b/starkOrganization/g' \
    tests/api-authentication-token.test.ts
```

- [ ] **Step 3: Measure after**

```bash
grep -n "\bgOrganization\b\|\bgAdmin\b\|\bgAdminToken\b" \
    tests/api-authentication-token.test.ts ; echo "(empty)"
grep -n "starkOrganization\|starkAdmin\b\|starkAdminToken" \
    tests/api-authentication-token.test.ts
awk 'length > 78 { print FILENAME ":" FNR ": " length }' \
    tests/api-authentication-token.test.ts
```

Expected: no old names; nine new-name lines; no line over 78.

- [ ] **Step 4: Run the file**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/api-authentication-token.test.ts
```

Expected: all pass.

- [ ] **Step 5: Remove the TODO bullet**

Delete:

```
- Two locals named for a retired section slice —
  `gOrganization` and `gAdmin`
  (`tests/api-authentication-token.test.ts:1092-1093`)
  carry the old Section-G prefix; Commandment III says
  they read `starkOrganization` and `starkAdmin`. Quoted
  by no pin, so they rename alone
```

- [ ] **Step 6: Validate and commit**

```bash
./validate
git add tests/api-authentication-token.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Name the unseated-grant locals after Stark

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 9: Point the locked-members comment at F62 (spec item 8)

F51 is the space-while-dragging case; locked members is F62
(`TEST-PLAN.md:3534`). One token. The comment's "manual" claim
stays — F62's exploratory clause still covers the toast guard.

**Files:**
- Modify: `tests/flow-designer-presenter.test.ts:352`
- Modify: `TODO.md` (the bullet at `:1171-1174`)

**Interfaces:** none.

- [ ] **Step 1: Confirm the case numbers**

```bash
grep -n "^- \[ \] \*\*F51\*\*\|^- \[ \] \*\*F62\*\*" TEST-PLAN.md
grep -n "TEST-PLAN F51" tests/flow-designer-presenter.test.ts
```

Expected: F51 begins "Begin dragging a node"; F62 begins "Lock
the flow via the designer-header Locked switch"; one comment
line names F51.

- [ ] **Step 2: Fix the token**

Replace

```ts
// manual (TEST-PLAN F51). The presenter's
```

with

```ts
// manual (TEST-PLAN F62). The presenter's
```

- [ ] **Step 3: Remove the TODO bullet**

Delete:

```
- A stale manual-coverage pointer —
  `tests/flow-designer-presenter.test.ts:352` points its
  comment at "TEST-PLAN F51"; the locked-members case is
  F62
```

- [ ] **Step 4: Validate and commit**

```bash
./validate
git add tests/flow-designer-presenter.test.ts TODO.md
git commit -m "$(cat <<'MSG'
Point the locked-members comment at F62

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 10: Clear the add-identity dialog on open (spec item 9, identities)

The `#add-identity-btn` open handler resets only
`pendingIdentityId`; neither submit path clears an input, and
the dialog is static markup, so cancel, Escape, and a
successful submit all greet the next session with last time's
text. Clear every input the dialog owns on open — one place
covering all three. Pin: Layer 2, a browser test that types,
cancels, reopens, and reads every field.

**Files:**
- Create: `tests/browser/dialogs.test.ts`
- Modify: `web-app/identities/index.ts:150-158` (the open
  handler) and a new function beside `bindAddIdentityDialog`
- Modify: `TODO.md` (the bullet at `:319-321`)

**Interfaces:**
- Produces: `tests/browser/dialogs.test.ts` with the helpers
  `openDialog(page, id)`, `cancelDialog(page, id)`,
  `fillFields(fields)`, `fieldValues(fields)` — Task 11 adds
  the members test to this file using the same four.

- [ ] **Step 1: Write the failing browser test**

Create `tests/browser/dialogs.test.ts`:

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { useBrowser, withAdminPage, type Page } from
    './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();

// The add dialogs are static markup: a cancelled or escaped
// session leaves last time's text in the inputs unless the
// page clears them on open. Type, cancel, reopen, then read
// every field the dialog owns.

const ADD_IDENTITY_FIELDS = [
    '#id-name', '#id-email', '#id-phone', '#id-bio',
    '#svc-secret',
];

async function openDialog(
    page: Page, id: string,
): Promise<void> {
    await page.click(`[data-dialog-open="${id}"]`);
    await page.waitFor(`#${id}-dialog[open]`);
}

async function cancelDialog(
    page: Page, id: string,
): Promise<void> {
    await page.click(`[data-dialog-cancel="${id}"]`);
    await page.until(
        `!document.querySelector('#${id}-dialog[open]')`,
        `${id} dialog closed`,
    );
}

// Page-side expressions: set every field to a marker, then
// read every field back as an array.
function fillFields(fields: readonly string[]): string {
    const sets = fields.map(f =>
        `document.querySelector(${JSON.stringify(f)})`
        + `.value = 'stale';`,
    ).join(' ');
    return `(() => { ${sets} return true; })()`;
}

function fieldValues(fields: readonly string[]): string {
    const reads = fields.map(f =>
        `document.querySelector(${JSON.stringify(f)}).value`,
    ).join(', ');
    return `[${reads}]`;
}

test('the add-identity dialog reopens with every field empty',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.navigate(
            registryUrl(origin.baseUrl, 'identities'),
        );
        await page.ready('identities');
        await openDialog(page, 'add-identity');
        await page.evaluate(fillFields(ADD_IDENTITY_FIELDS));
        await cancelDialog(page, 'add-identity');
        await openDialog(page, 'add-identity');
        const values = await page.evaluate<string[]>(
            fieldValues(ADD_IDENTITY_FIELDS),
        );
        assert.deepEqual(
            values, ADD_IDENTITY_FIELDS.map(() => ''),
        );
    });
});
```

- [ ] **Step 2: Run Layer 2 — expected RED on this test**

```bash
./test-browser
```

Expected: every other browser file green; `dialogs.test.ts`
fails at `deepEqual` with five `'stale'` values. If Chrome
cannot launch, stop and report — this task cannot be verified
without it.

- [ ] **Step 3: Clear the fields on open**

In `web-app/identities/index.ts` replace the open handler

```ts
    $required('#add-identity-btn', document)
        .addEventListener(
            'click',
            () => { pendingIdentityId = null; },
            { signal },
        );
}
```

with

```ts
    $required('#add-identity-btn', document)
        .addEventListener(
            'click',
            () => {
                pendingIdentityId = null;
                clearAddIdentityFields();
            },
            { signal },
        );
}

// The dialog's inputs are static markup, so a cancelled,
// escaped, or submitted session would greet the next one with
// last time's text. Open is the one path all three share.
function clearAddIdentityFields(): void {
    $input('#id-name', document)!.value = '';
    $input('#id-email', document)!.value = '';
    $input('#id-phone', document)!.value = '';
    $textarea('#id-bio', document)!.value = '';
    $input('#svc-secret', document)!.value = '';
}
```

(`$input` and `$textarea` are already imported at the top of
the file; the `!` is the file's own voice for its static
markup — see `submitPersonForm`.)

- [ ] **Step 4: Run Layer 2 — expected GREEN**

```bash
./test-browser
```

Expected: all browser files pass, `dialogs.test.ts` included.

- [ ] **Step 5: Remove the TODO bullet**

Delete:

```
- The add-identity dialog never clears its fields —
  AA-Obj's stale-state sibling —
  `web-app/identities/index.ts:213-281`
```

- [ ] **Step 6: Validate and commit**

```bash
./validate
git add tests/browser/dialogs.test.ts web-app/identities/index.ts \
    TODO.md
git commit -m "$(cat <<'MSG'
Clear the add-identity dialog on open

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 11: Clear the add-member dialog on open (spec item 9, members)

The exact sibling: `web-app/members/index.ts:262-267` resets
only `pendingMemberId` on open, and neither `submitHumanForm`
nor `submitAIForm` clears an input. The invite dialog beside
it (`:353`, `input.value = ''`) is the one that already
clears. No TODO bullet names this site — the spec extends
item 9 to it by name.

**Files:**
- Modify: `tests/browser/dialogs.test.ts` (from Task 10)
- Modify: `web-app/members/index.ts:262-267` and a new
  function beside `bindAddMemberDialog`

**Interfaces:**
- Consumes: `openDialog`, `cancelDialog`, `fillFields`,
  `fieldValues` from Task 10's test file.

- [ ] **Step 1: Add the failing members test**

In `tests/browser/dialogs.test.ts`, after
`ADD_IDENTITY_FIELDS` add:

```ts
const ADD_MEMBER_FIELDS = [
    '#hw-name', '#hw-email', '#hw-title', '#hw-phone',
    '#hw-bio', '#ai-name', '#ai-description',
    '#ai-skill-focus',
];
```

and append at the end of the file:

```ts
test('the add-member dialog reopens with every field empty',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.navigate(
            registryUrl(origin.baseUrl, 'members'),
        );
        await page.ready('members');
        await openDialog(page, 'add-member');
        await page.evaluate(fillFields(ADD_MEMBER_FIELDS));
        await cancelDialog(page, 'add-member');
        await openDialog(page, 'add-member');
        const values = await page.evaluate<string[]>(
            fieldValues(ADD_MEMBER_FIELDS),
        );
        assert.deepEqual(
            values, ADD_MEMBER_FIELDS.map(() => ''),
        );
    });
});
```

(The AI form's inputs sit in a `hidden` `<div>` while Human
is selected; `.value` is readable and writable regardless, so
the test exercises both kinds' fields in one pass.)

- [ ] **Step 2: Run Layer 2 — expected RED on the new test**

```bash
./test-browser
```

Expected: the identities test passes; the members test fails
at `deepEqual` with eight `'stale'` values.

- [ ] **Step 3: Clear the fields on open**

In `web-app/members/index.ts` replace the open handler at the
end of `bindAddMemberDialog`

```ts
    $required('#add-member-btn', document)
        .addEventListener(
            'click',
            () => { pendingMemberId = null; },
            { signal },
        );
}
```

with

```ts
    $required('#add-member-btn', document)
        .addEventListener(
            'click',
            () => {
                pendingMemberId = null;
                clearAddMemberFields();
            },
            { signal },
        );
}

// The dialog's inputs are static markup, so a cancelled,
// escaped, or submitted session would greet the next one with
// last time's text. Open is the one path all three share.
function clearAddMemberFields(): void {
    $input('#hw-name', document)!.value = '';
    $input('#hw-email', document)!.value = '';
    $input('#hw-title', document)!.value = '';
    $input('#hw-phone', document)!.value = '';
    $textarea('#hw-bio', document)!.value = '';
    $input('#ai-name', document)!.value = '';
    $textarea('#ai-description', document)!.value = '';
    $textarea('#ai-skill-focus', document)!.value = '';
}
```

(`$input` and `$textarea` are already imported; the two
`<select>`s — `#hw-department`, `#ai-model` — carry no typed
text and are not cleared.)

- [ ] **Step 4: Run Layer 2 — expected GREEN**

```bash
./test-browser
```

Expected: all browser files pass.

- [ ] **Step 5: Validate and commit**

```bash
./validate
git add tests/browser/dialogs.test.ts web-app/members/index.ts
git commit -m "$(cat <<'MSG'
Clear the add-member dialog on open

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 12: Subscribe the flow stats page to flow changes (spec item 10)

`web-app/flows/stats.ts` never subscribes; its `loadInto`
runs once and the page is stale until navigation. Move the
load into a `load(host)` function, hoist the hover/click
`AbortController` to module scope so each load aborts the
last, and after the first load subscribe with
`subscribeFlowChanges(() => { void load(host); })` — the shape
of `web-app/records/detail.ts:106-110`. A bell re-renders from
the server; the selected path and pinned node reset with it —
the page has no edit mode to protect. Pin: Layer 1 in the
shape of `tests/ideas-empty-subscribe.test.ts`.

**Files:**
- Create: `tests/flow-stats-subscribe.test.ts`
- Modify: `web-app/flows/stats.ts:1-20` (imports), `:93-143`
  (init / load / the controller)
- Modify: `TODO.md` (the bullet at `:322-323`)

**Interfaces:**
- Consumes: `subscribeFlowChanges(fn: () => void): () => void`
  from `web-app/app/adapters/index.ts` (re-exported from
  `flow-mutations.ts:59`); `getFlowStats(ctx, flowId, nowMs)`
  unchanged.
- Produces: nothing new is exported; `init(params)` keeps its
  signature.

- [ ] **Step 1: Write the failing test**

Create `tests/flow-stats-subscribe.test.ts`:

```ts
import './hmac-test-key.ts';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
    type FlowWithGraph,
} from '../api/types.ts';

const CHANNEL_NAME = 'fusion-angle:data';
const MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';
const FLOW_NAME = 'Stats flow';
const RENAMED = 'Stats flow, renamed in another tab';

// The stats page has no edit mode, so the only flow change it
// can ever see is another tab's: it must hear the cross-tab
// fusion-angle:data bell and re-read the server. Stubs land
// before any web-app import — the module graph reads
// theme/session state at load.

function makeHostStub(): {
    id: string;
    innerHTML: string;
    nameEl: { textContent: string };
    addEventListener: () => void;
    querySelector: (selector: string) => unknown;
} {
    const nameEl = { textContent: '' };
    // renderCard requires the card slot on every render and
    // only toggles its hidden class while nothing is pinned.
    const cardEl = {
        innerHTML: '',
        classList: { add: () => {}, remove: () => {} },
    };
    return {
        id: 'flow-stats',
        innerHTML: '',
        nameEl,
        addEventListener: () => {},
        querySelector: (selector: string) => {
            if (selector === '.flow-stats-flow-name') {
                return nameEl;
            }
            if (selector === '#flow-stats-card') {
                return cardEl;
            }
            return null;
        },
    };
}

test(
    'the flow stats page re-reads the flow on the'
    + ' cross-tab bell',
    async () => {
        const g = globalThis as Record<
            string, unknown
        >;
        const host = makeHostStub();
        const storage = new Map<string, string>();
        g['localStorage'] = {
            getItem: (k: string) =>
                storage.get(k) ?? null,
            setItem: (k: string, v: string) => {
                storage.set(k, v);
            },
            removeItem: (k: string) => {
                storage.delete(k);
            },
        };
        g['window'] = {
            matchMedia: () => ({
                matches: false,
                addEventListener: () => {},
                removeEventListener: () => {},
            }),
            addEventListener: () => {},
        };
        g['MutationObserver'] = class {
            observe(): void {}
        };
        g['document'] = {
            addEventListener: () => {},
            createElement: () => ({
                className: '',
                setAttribute: () => {},
            }),
            querySelector: (sel: string) =>
                sel === '#flow-stats' ? host : null,
        };
        try {
            await import('./in-page-facade.ts');
            const { initAdapter, putSessionToken } =
                await import(
                    '../web-app/app/adapters/init.ts'
                );
            const db = memoryDbAdapter();
            await seedAdminSchema(db);
            await seedHumanMember(
                db, MEMBER_ID, 'Demo Test',
            );
            const hasSchema = await initAdapter(
                () => db,
            );
            assert.equal(hasSchema, true);
            putSessionToken(
                await organizationToken(),
            );
            const {
                createRequestContext,
                organizationItem,
            } = await import(
                '../web-app/app/adapters/shared.ts'
            );
            const { postFlowCreation } = await import(
                '../web-app/app/adapters/flow-mutations.ts'
            );
            const ctx = createRequestContext(
                db, await organizationToken(),
            );
            const flowId = generateIdentifier();
            await postFlowCreation(ctx, {
                flowId,
                linkId: generateIdentifier(),
                projectId: generateIdentifier(),
                name: FLOW_NAME,
            });
            const { init } = await import(
                '../web-app/flows/stats.ts'
            );
            await init({ flowId });
            assert.equal(
                host.nameEl.textContent, FLOW_NAME,
                'precondition: the first load names'
                + ' the flow',
            );
            // Another tab renames the flow. The raw
            // document PUT is the wire putFlow drives —
            // the same graph back, a new name and trio —
            // minus the same-tab notify, so only the
            // BroadcastChannel below can wake this page.
            const { body: current, etag } =
                await ctx.GETWithEtag<FlowWithGraph>(
                    organizationItem(
                        ctx, 'flows', flowId,
                    ),
                );
            await ctx.PUT(
                organizationItem(ctx, 'flows', flowId),
                {
                    name: RENAMED,
                    is_locked: false,
                    is_auto_layout: false,
                    is_auto_fit: false,
                    lock_timeout: DEFAULT_LOCK_TIMEOUT,
                    state: 'updated',
                    state_at: nowUtc(),
                    state_event_id: generateIdentifier(),
                    graph: current.graph,
                    graphDelta: {
                        nodes: [],
                        edges: [],
                        deletions: [],
                        memberEvents: [],
                        attributeEvents: [],
                    },
                    revivals: [],
                },
                [['if-match', '"' + etag + '"']],
            );
            for (let i = 0; i < 25; i++) {
                await new Promise(
                    r => setImmediate(r),
                );
            }
            assert.equal(
                host.nameEl.textContent, FLOW_NAME,
                'the raw PUT alone must not wake'
                + ' the page',
            );
            const poster = new BroadcastChannel(
                CHANNEL_NAME,
            );
            poster.postMessage({ kind: 'full' });
            // BroadcastChannel delivery and the re-run
            // load's fetch/render pipeline are
            // asynchronous; drain generously.
            for (let i = 0; i < 25; i++) {
                await new Promise(
                    r => setImmediate(r),
                );
            }
            poster.close();
            assert.equal(
                host.nameEl.textContent, RENAMED,
                'the stats page must re-read the flow'
                + ' on the cross-tab bell',
            );
        } finally {
            delete g['localStorage'];
            delete g['window'];
            delete g['MutationObserver'];
            delete g['document'];
        }
    },
);
```

- [ ] **Step 2: Run it — expected RED at the final assertion**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/flow-stats-subscribe.test.ts
```

Expected: fails with `'Stats flow' !== 'Stats flow, renamed in
another tab'` — the page never re-reads. Two other outcomes
mean the TEST is wrong, not the product: a throw before the
precondition (a load-time read the stubs do not serve — add
the missing stub beside the existing ones, mirroring
`tests/ideas-empty-subscribe.test.ts`, and name it in the
report) or a non-2xx from the raw PUT (read its error body;
the body above mirrors `validateFlowDocumentBody`'s key set
at `api/validators.ts:1568-1572` and the isolation test's
flow PUT at `tests/api-organization-isolation.test.ts:
396-416`).

- [ ] **Step 3: Import the subscription**

In `web-app/flows/stats.ts` replace

```ts
import {
    sessionContext,
    getFlowStats,
} from '../app/adapters/index.ts';
```

with

```ts
import {
    sessionContext,
    getFlowStats,
    subscribeFlowChanges,
} from '../app/adapters/index.ts';
```

- [ ] **Step 4: Split init into init + load, hoist the controller**

Replace the head of `init` — from `export async function
init(` through the line `const { signal } = ctrl;` — with:

```ts
// The page's identity, set once by init and read by every
// load — a bell re-runs load(host) for the same flow.
let flowId = '';
let projectId: string | undefined;

// The hover/click listeners of the CURRENT render; each load
// aborts the last so a re-render never doubles them.
let cardListeners: AbortController | null = null;

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const id = params?.flowId;
    if (!id) {
        navigateTo('flows');
        return;
    }
    flowId = id;
    projectId = params?.projectId;
    const host = $required(
        '#flow-stats', document,
    );

    await load(host);
    // Cross-tab flow edits ring the same flowChanges bell
    // the designer trusts. This page has no edit mode to
    // protect, so a re-load from the server is the whole
    // response — the selected path and pinned node reset
    // with it.
    subscribeFlowChanges(() => {
        void load(host);
    });
}

async function load(host: HTMLElement): Promise<void> {
    await loadInto({
        container: host,
        skeleton: buildSkeleton('detail', 1),
        fetch: () => getFlowStats(
            sessionContext(), flowId, Date.now(),
        ),
        onData: ({ model, graph }) => {
            const viewBox = boundingViewBox(
                graph.nodes,
                STATS_VIEW_PADDING_PX,
            );
            const presenter =
                new FlowStatsPresenter(
                    model, viewBox,
                );
            presenter.renderShell(host);

            // Presenter is deliberately name-agnostic;
            // page module writes the graph's own values
            // so the header reflects the live flow name.
            const nameEl = $(
                '.flow-stats-flow-name', host,
            );
            if (nameEl) {
                nameEl.textContent = graph.name;
            }

            const ui: FlowStatsUi = {
                selectedPathIndex: 0,
                pinnedNodeId: null,
                hoveredNodeId: null,
            };
            presenter.renderUpdate(host, ui);

            cardListeners?.abort();
            cardListeners = new AbortController();
            const { signal } = cardListeners;
```

Everything after `const { signal } = ctrl;` in the old body
stays byte-identical (the three `host.addEventListener`
calls, `stepPathSelection`, the back button's `flowId` /
`projectId` reads now resolve to the module-level bindings)
through the closing `});` of `loadInto` and the function's
`}`.

- [ ] **Step 5: Run the test — expected GREEN**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/flow-stats-subscribe.test.ts
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/presenter-flow-stats.test.ts \
    tests/adapters-flow-stats.test.ts
```

Expected: all pass.

- [ ] **Step 6: Remove the TODO bullet**

Delete:

```
- `flows/stats.ts` wires no change subscription; the
  stats page stays stale until navigation
```

- [ ] **Step 7: Validate and commit**

```bash
./validate
git add tests/flow-stats-subscribe.test.ts web-app/flows/stats.ts \
    TODO.md
git commit -m "$(cat <<'MSG'
Subscribe the flow stats page to flow changes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 13: Hide the create button on empty lists (spec item 11)

`web-app/ideas/index.ts:64-71` and `web-app/records/index.ts:
63-71` `?.remove()` the header create button on empty; both
buttons live in static markup, so a re-init after the first
cross-tab write leaves the populated list without its CTA.
`onEmpty` adds `.hidden` (`web-app/app/styles/utilities.css:
108`, the app's idiom); the populated path removes it. Two
sites, fixed in place — projects and flows never removed
theirs. Pin: the ideas test's DOM stub serves a
`#create-idea-btn` stub; hidden after the empty render,
visible after the bell's re-init. Records stays unpinned, as
TODO's "untested by design" bullet already records. Requires
Task 2 (same test file).

**Files:**
- Modify: `tests/ideas-empty-subscribe.test.ts` (a button
  stub, two assertions)
- Modify: `web-app/ideas/index.ts:64-71`, `:93-100`
  (`onIdeasLoaded`)
- Modify: `web-app/records/index.ts:63-71`, `:89-97`
  (`onRecordsLoaded`)
- Modify: `TODO.md` (the bullet at `:324-328`)

**Interfaces:** none.

- [ ] **Step 1: Serve a button stub and assert both states**

In `tests/ideas-empty-subscribe.test.ts`, after
`makeListStub()` add:

```ts
function makeCreateButtonStub(): {
    classList: {
        add: (c: string) => void;
        remove: (c: string) => void;
        contains: (c: string) => boolean;
    };
    addEventListener: () => void;
    remove: () => void;
} {
    const classes = new Set<string>();
    return {
        classList: {
            add: (c: string) => { classes.add(c); },
            remove: (c: string) => { classes.delete(c); },
            contains: (c: string) => classes.has(c),
        },
        addEventListener: () => {},
        remove: () => {},
    };
}
```

(The `remove` member exists ONLY so the red run fails at the
assertion rather than at a missing method; Step 4 deletes it.)

In the test body, after `const listStub = makeListStub();`
add `const createButton = makeCreateButtonStub();`, and change
the document stub's `querySelector` to

```ts
            querySelector: (sel: string) => {
                if (sel === '#ideas-list') return listStub;
                if (sel === '#create-idea-btn') {
                    return createButton;
                }
                return null;
            },
```

After the `'precondition: empty state rendered'` assertion
add:

```ts
            assert.ok(
                createButton.classList.contains('hidden'),
                'the empty render hides the header'
                + ' create button',
            );
```

After the final `'the empty page must re-init on the first
cross-tab bell'` assertion add:

```ts
            assert.ok(
                !createButton.classList.contains('hidden'),
                'the populated re-init shows the header'
                + ' create button again',
            );
```

- [ ] **Step 2: Run it — expected RED at the first new assertion**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/ideas-empty-subscribe.test.ts
```

Expected: fails with `the empty render hides the header create
button` (master calls `remove()`, never `classList.add`).

- [ ] **Step 3: Hide, don't remove — both lists**

In `web-app/ideas/index.ts` replace

```ts
            onEmpty: () => {
                $(
                    '#create-idea-btn', document,
                )?.remove();
                subscribeOnce(
                    subscribeIdeaChanges, init,
                );
            },
```

with

```ts
            onEmpty: () => {
                $(
                    '#create-idea-btn', document,
                )?.classList.add('hidden');
                subscribeOnce(
                    subscribeIdeaChanges, init,
                );
            },
```

and at the top of `onIdeasLoaded`, before
`ideaState = buildInitialIdeaListState(ideas);`, add:

```ts
    // The button is static markup: the empty render hides it
    // (onEmpty) and a populated one shows it again, so the
    // empty→populated re-init keeps its CTA.
    $('#create-idea-btn', document)
        ?.classList.remove('hidden');
```

In `web-app/records/index.ts` replace

```ts
            onEmpty: () => {
                $(
                    '#create-record-btn',
                    document,
                )?.remove();
                subscribeOnce(
                    subscribeRecordChanges, init,
                );
            },
```

with

```ts
            onEmpty: () => {
                $(
                    '#create-record-btn',
                    document,
                )?.classList.add('hidden');
                subscribeOnce(
                    subscribeRecordChanges, init,
                );
            },
```

and at the top of `onRecordsLoaded`, before
`recordState = buildInitialRecordListState(records);`, add:

```ts
    // The button is static markup: the empty render hides it
    // (onEmpty) and a populated one shows it again, so the
    // empty→populated re-init keeps its CTA.
    $('#create-record-btn', document)
        ?.classList.remove('hidden');
```

- [ ] **Step 4: Drop the stub's scaffolding `remove`**

In `makeCreateButtonStub` delete the `remove: () => void;`
type member and the `remove: () => {},` line — nothing calls
it now, and a dead stub is what Task 3 just removed.

- [ ] **Step 5: Run the test — expected GREEN**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/ideas-empty-subscribe.test.ts
```

Expected: 1 pass.

- [ ] **Step 6: Remove the TODO bullet**

Delete:

```
- The empty-state `onEmpty` removes the header create
  button irreversibly; a live empty→populated re-init
  (run-six Task 9) leaves the list without its header
  CTA — hide, don't remove —
  `web-app/ideas/index.ts`, `web-app/records/index.ts`
```

- [ ] **Step 7: Validate and commit**

```bash
./validate
git add tests/ideas-empty-subscribe.test.ts web-app/ideas/index.ts \
    web-app/records/index.ts TODO.md
git commit -m "$(cat <<'MSG'
Hide the create button on empty lists

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 14: Collapse the four definition lookups into one (spec item 12)

`web-app/app/presenters/project-score-history.ts` resolves-
or-throws in four byte-identical ten-line blocks (`:140`,
`:161`, `:190`, `:209`). A private `#definitionAt(objectiveId,
at)` returns the definition or throws the same message; each
arm becomes one call. Net −30 / +8. The presenter test drives
all four arms and stays green unchanged — Task 4 made its
assertions honest first. A refactor: no test changes.

**Files:**
- Modify: `web-app/app/presenters/project-score-history.ts:
  130-230`
- Modify: `TODO.md` (the bullet at `:366-369`)

**Interfaces:**
- Produces: `#definitionAt(objectiveId: ObjectiveId, at:
  string): { name: string; description: string }` — private
  to `ProjectScoreHistoryPresenter`.

- [ ] **Step 1: Confirm the four copies are byte-identical**

```bash
grep -n "objective definition missing" \
    web-app/app/presenters/project-score-history.ts
```

Expected: four lines (`:145`, `:166`, `:195`, `:214`).

- [ ] **Step 2: Add the helper**

After the `#row(e: DatedEvent): SafeHtml { … }` method (the
last method of the class, before its closing `}`), add:

```ts

    #definitionAt(
        objectiveId: ObjectiveId,
        at: string,
    ): { name: string; description: string } {
        const def = this.#resolver(objectiveId, at);
        if (!def) {
            throw new Error(
                `objective definition missing `
                + `for ${objectiveId} at ${at}`,
            );
        }
        return def;
    }
```

- [ ] **Step 3: Replace each arm's block with one call**

In each of the four arms (`'baseline'`, `'actual'`,
`'archival'`, `'reactivation'`) replace

```ts
                const def = this.#resolver(
                    e.objectiveId, e.at,
                );
                if (!def) {
                    throw new Error(
                        `objective definition missing `
                        + `for ${e.objectiveId} at `
                        + `${e.at}`,
                    );
                }
```

with

```ts
                const def = this.#definitionAt(
                    e.objectiveId, e.at,
                );
```

- [ ] **Step 4: Measure the diff and run the presenter test**

```bash
git diff --stat web-app/app/presenters/project-score-history.ts
grep -c "objective definition missing" \
    web-app/app/presenters/project-score-history.ts
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/presenter-project-score-history.test.ts
```

Expected: about 8 insertions and 30 deletions; the message
appears once; all tests pass with no test file changed.

- [ ] **Step 5: Remove the TODO bullet**

Delete:

```
- The resolve-and-throw block in
  `web-app/app/presenters/project-score-history.ts` is four
  identical 11-line copies (:139, :161, :182, :201) — a
  `#definitionAt(objectiveId, at)` helper collapses each
```

- [ ] **Step 6: Validate and commit**

```bash
./validate
git add web-app/app/presenters/project-score-history.ts TODO.md
git commit -m "$(cat <<'MSG'
Collapse the four definition lookups into one

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 15: Stack the aggregates row on narrow viewports (spec item 13)

`web-app/app/styles/components-metrics.css:80-82` gives the
dashboard aggregates row `140px 110px 1fr`; with the 0.8em gap
the fixed columns need ~276px, so under `responsive.css`'s
767px rule the sparkline's `1fr` track collapses to zero on
narrow phones. In that block the row becomes
`minmax(0, 1fr) 110px` with the sparkline spanning the full
row beneath — label and gauge on one line, sparkline below.
Pin: Layer 2, `tests/browser/viewport.test.ts` at 320px — the
dashboard's `.score-row-sparkline` has a bounding width
greater than zero. Red on master at that width; if it is not,
the width is wrong, not the pin.

**Files:**
- Modify: `tests/browser/viewport.test.ts` (one test)
- Modify: `web-app/app/styles/responsive.css:18-27` (the
  767px block)
- Modify: `TODO.md` (a clause of the "run-four remaining
  seams" bullet at `:238-248`)

**Interfaces:** none.

- [ ] **Step 1: Write the failing browser test**

In `tests/browser/viewport.test.ts`, after
`const MOBILE = { width: 375, height: 800 };` add:

```ts
const NARROW = { width: 320, height: 800 };
```

and append at the end of the file:

```ts
test('a narrow phone still gets a sparkline track',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.setViewport(
            NARROW.width, NARROW.height, true,
        );
        await page.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await page.ready('dashboard');
        await page.waitFor('.score-row-sparkline');
        const track = await page.rect('.score-row-sparkline');
        assert.ok(
            track.width > 0,
            `sparkline track collapsed to ${track.width}px`,
        );
    });
});
```

- [ ] **Step 2: Run Layer 2 — expected RED on the new test**

```bash
./test-browser
```

Expected: the new test fails with `sparkline track collapsed
to 0px`. If it PASSES at 320px, lower `NARROW.width` to 304
(the TODO bullet's measured width) and re-run; record the
width that goes red. Do not proceed on a green red-run.

- [ ] **Step 3: Stack the row under 768px**

In `web-app/app/styles/responsive.css`, inside the
`@media (max-width: 767px) {` block, after
`    .objective-aggregates-card { width: auto; }` add:

```css
    /* The aggregates row's two fixed columns outgrow a
        narrow phone; put label and gauge on one line and
        the sparkline full-width beneath. */
    .objective-aggregates-card .score-row {
        grid-template-columns: minmax(0, 1fr) 110px;
    }
    .objective-aggregates-card .score-row-sparkline {
        grid-column: 1 / -1;
    }
```

(Equal specificity to the base rule at `components-metrics.
css:80-82`; `responsive.css` loads later, so it wins by order
without `!important`.)

- [ ] **Step 4: Run Layer 2 — expected GREEN**

```bash
./test-browser
```

Expected: all browser files pass; `viewport.test.ts` has two
passing tests.

- [ ] **Step 5: Strike the clause from the TODO bullet**

In the bullet beginning `- The run-four remediation's remaining
seams —` delete the clause

```
the
  Objectives sparkline track collapses at 304px
  (`web-app/app/styles/components-metrics.css:80-82`);
```

so the bullet opens
`- The run-four remediation's remaining seams — archived
records in the flow-header dropdown …` (re-wrap only the
lines the deletion touches).

- [ ] **Step 6: Validate and commit**

```bash
./validate
git add tests/browser/viewport.test.ts \
    web-app/app/styles/responsive.css TODO.md
git commit -m "$(cat <<'MSG'
Stack the aggregates row on narrow viewports

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 16: Keep archived records out of the binding list (spec item 14)

`renderBindingSlot` (`web-app/flows/detail.ts:1423-1455`)
sorts every record and filters none; `RecordEntity` carries
`state`. Keep `state !== 'archived'` — and the record currently
bound, whatever its state, so the `<select>` keeps showing the
truth and a change event cannot silently unbind it. The
predicate is an exported pure function beside the presenter
helpers in `flow-designer-view.ts`. Pin: Layer 1 — active
listed, archived dropped, bound-archived kept.

**Files:**
- Modify: `tests/presenter-misc.test.ts` (imports; one test)
- Modify: `web-app/app/presenters/flow-designer-view.ts`
  (imports; one exported function at the end)
- Modify: `web-app/app/presenters/index.ts:98-102` (barrel
  export)
- Modify: `web-app/flows/detail.ts:60-64` (import),
  `:1431-1433` (the filter)
- Modify: `TODO.md` (a clause of the "run-four remaining
  seams" bullet)

**Interfaces:**
- Produces: `bindableRecords(records: readonly RecordEntity[],
  boundRecordId: RecordId | null): RecordEntity[]` exported
  from `web-app/app/presenters/flow-designer-view.ts` and
  re-exported by `web-app/app/presenters/index.ts`.

- [ ] **Step 1: Write the failing test**

In `tests/presenter-misc.test.ts` add `bindableRecords` to the
existing import from `flow-designer-view.ts`:

```ts
import {
    bindableRecords,
    buildFlowNameHeader,
    buildNodePanel,
    buildEdgePanel,
    buildToolbar,
} from
    '../web-app/app/presenters/flow-designer-view.ts';
```

and add `RecordEntity` to the type import from
`../api/types.ts`:

```ts
import type {
    GraphNode, GraphEdge, RecordEntity,
} from '../api/types.ts';
```

Append at the end of the file:

```ts
test(
    'bindableRecords drops archived records but keeps'
    + ' the one currently bound',
    () => {
        const record = (
            id: string, state: string,
        ): RecordEntity => ({
            id,
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            name: 'Record ' + id,
            description: '',
            position: 0,
            state,
        });
        const active = record(
            'rbfHGatkwQzGZJVXKJEeyw', 'active',
        );
        const archived = record(
            'dCnpryxCNwuTnCrBBDIMOw', 'archived',
        );
        const boundArchived = record(
            'aEsGMmBEFaVdWihhHXwCbw', 'archived',
        );
        assert.deepEqual(
            bindableRecords(
                [active, archived, boundArchived],
                boundArchived.id,
            ).map(r => r.id),
            [active.id, boundArchived.id],
        );
        assert.deepEqual(
            bindableRecords([active, archived], null)
                .map(r => r.id),
            [active.id],
        );
    },
);
```

- [ ] **Step 2: Run it — expected RED (no such export)**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/presenter-misc.test.ts
```

Expected: the file fails to load — `bindableRecords` is not
exported.

- [ ] **Step 3: Add the predicate**

In `web-app/app/presenters/flow-designer-view.ts` add after
the existing `import type { GraphNode, … } from
'../adapters/index.ts';` block:

```ts
import type {
    RecordEntity,
    RecordId,
} from '../../../api/types.ts';
```

and append at the end of the file:

```ts

// The records a flow's binding <select> offers: every live
// record, plus the record currently bound whatever its
// state, so the control keeps showing the truth and a change
// event cannot silently unbind an archived record.
export function bindableRecords(
    records: readonly RecordEntity[],
    boundRecordId: RecordId | null,
): RecordEntity[] {
    return records.filter(
        r => r.state !== 'archived'
            || r.id === boundRecordId,
    );
}
```

- [ ] **Step 4: Export it through the barrel**

In `web-app/app/presenters/index.ts`, after the
`FlowDesignerPresenter` export block, add:

```ts
export {
    bindableRecords,
} from './flow-designer-view.ts';
```

- [ ] **Step 5: Filter where the list is built**

In `web-app/flows/detail.ts` extend the presenters import:

```ts
import {
    FlowDesignerPresenter,
    bindableRecords,
    buildInitialFlowSnapshot,
    type FlowSnapshot,
} from '../app/presenters/index.ts';
```

and in `renderBindingSlot` replace

```ts
    const sorted = [...records].toSorted(
        (a, b) => a.name.localeCompare(b.name),
    );
```

with

```ts
    const sorted = bindableRecords(
        records, boundRecordId,
    ).toSorted(
        (a, b) => a.name.localeCompare(b.name),
    );
```

- [ ] **Step 6: Run the test — expected GREEN**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/presenter-misc.test.ts
```

Expected: all pass.

- [ ] **Step 7: Strike the clause from the TODO bullet**

In the "run-four remaining seams" bullet delete

```
archived records in the flow-header dropdown
  (`web-app/flows/detail.ts:1391-1402`,
  `renderBindingSlot`);
```

(re-wrap only the lines the deletion touches).

- [ ] **Step 8: Validate and commit**

```bash
./validate
git add tests/presenter-misc.test.ts \
    web-app/app/presenters/flow-designer-view.ts \
    web-app/app/presenters/index.ts web-app/flows/detail.ts TODO.md
git commit -m "$(cat <<'MSG'
Keep archived records out of the binding list

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 17: Render record Edit and Archive for admins only (spec item 15)

`record-detail.ts:495-500` renders `#record-edit-btn` for
everyone; Archive beside it (`:517-528`) is gated on state
alone. The API keeps every record-type mutation admin-only by
absence (`api/authorization.ts:126-131`), so a member's Edit
or Archive ends in 403 at Save. `RecordDetailView` gains
`roles: readonly string[]`; both buttons render only when
`roles.includes('admin')` — the test `projectInstanceFields`
already applies (`:94`) — and the page passes `heldRoles()`
as it already does for instances. Pin: `pageFor()` gains the
field; an admin sees both buttons, a member neither.

**Files:**
- Modify: `tests/presenter-record-detail.test.ts:9-32`
  (`pageFor`), `:38`, `:54` (its two callers), one new test
- Modify: `web-app/app/presenters/record-detail.ts:436-447`
  (the view), `:493-500` (the actions), a new private method
- Modify: `web-app/records/detail.ts:209-214`, `:234-239`
- Modify: `TODO.md` (a clause of the "run-four remaining
  seams" bullet)

**Interfaces:**
- Produces: `RecordDetailView.roles: readonly string[]`
  (required). `tsc` names every constructor — the page's two
  `composeView` calls and the test's `pageFor`.

- [ ] **Step 1: Write the failing test**

In `tests/presenter-record-detail.test.ts` change `pageFor`'s
signature and view:

```ts
function pageFor(
    state: RecordState,
    roles: readonly string[],
): string {
```

and add `roles,` after the `instances: { … },` member of the
view literal:

```ts
        instances: {
            instances: [],
            editing: null,
        },
        roles,
    }).buildPage().toString();
```

Update the two existing callers: `pageFor('active')` becomes
`pageFor('active', ['admin'])` and `pageFor('archived')`
becomes `pageFor('archived', ['admin'])`.

Append at the end of the file:

```ts
test(
    'Edit and Archive render for an admin and for'
    + ' nobody else',
    () => {
        const admin = pageFor('active', ['admin']);
        assert.match(admin, /id="record-edit-btn"/);
        assert.match(admin, /id="record-archive-btn"/);
        const member = pageFor('active', ['member']);
        assert.doesNotMatch(
            member, /id="record-edit-btn"/,
        );
        assert.doesNotMatch(
            member, /id="record-archive-btn"/,
        );
    },
);
```

- [ ] **Step 2: Run it — expected RED**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/presenter-record-detail.test.ts
```

Expected: the new test fails at the first `doesNotMatch` —
a member still sees Edit. (`node --strip-types` does not
type-check, so the extra `roles` field is inert until the
view carries it.)

- [ ] **Step 3: Carry the roles on the view**

In `web-app/app/presenters/record-detail.ts` extend the
interface:

```ts
export interface RecordDetailView {
    readonly record: RecordModel;
    readonly attributes:
        readonly RecordAttribute[];
    readonly boundFlows: readonly {
        id: string;
        name: string;
    }[];
    readonly workOrders:
        readonly WorkOrder[];
    readonly instances: InstancesSectionView;
    // The caller's project roles. Record-type mutation
    // is admin-only by absence at the API, so Edit and
    // Archive render for an admin alone.
    readonly roles: readonly string[];
}
```

- [ ] **Step 4: Gate both buttons in one place**

Replace the actions block in `buildPage`

```ts
                <div class="flex gap-2">
                    ${this.#buildArchiveButton()}
                    <button
                        id="record-edit-btn"
                        class="btn btn-primary">
                        ${iconEdit(ICON_SIZE.base, '')}
                        Edit
                    </button>
                </div>
```

with

```ts
                <div class="flex gap-2">
                    ${this.#buildAdminActions()}
                </div>
```

and add, directly above `#buildArchiveButton()`:

```ts
    // A member's Edit or Archive would end in 403 at Save —
    // the API keeps record-type mutation admin-only by
    // absence — so neither renders for anyone else.
    #buildAdminActions(): SafeHtml {
        if (!this.#view.roles.includes('admin')) {
            return trusted('');
        }
        return html`${this.#buildArchiveButton()}
                    <button
                        id="record-edit-btn"
                        class="btn btn-primary">
                        ${iconEdit(ICON_SIZE.base, '')}
                        Edit
                    </button>`;
    }

```

(`#buildArchiveButton` keeps its own state gate — an archived
record offers no Archive to anyone.)

- [ ] **Step 5: Pass the held roles from the page**

In `web-app/records/detail.ts` the fresh-load `composeView`
call becomes

```ts
            currentView = composeView({
                record: loaded.record,
                attributes: loaded.attributes,
                boundFlows: loaded.flows,
                workOrders: loaded.workOrders,
                roles: heldRoles(),
            });
```

and the re-render call in `render()` becomes

```ts
    currentView = composeView({
        record: currentView.record,
        attributes: currentView.attributes,
        boundFlows: currentView.boundFlows,
        workOrders: currentView.workOrders,
        roles: currentView.roles,
    });
```

- [ ] **Step 6: Run the test and both tsc projects — expected GREEN**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/presenter-record-detail.test.ts
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p web-app/app/tsconfig.json
```

Expected: all pass; `tsc` names no other `RecordDetailView`
constructor (the hazard: the only one outside the page is
`pageFor()`).

- [ ] **Step 7: Strike the clause from the TODO bullet**

In the "run-four remaining seams" bullet delete

```
Edit rendered for members on
  record detail
  (`web-app/app/presenters/record-detail.ts:495-500`);
```

(re-wrap only the lines the deletion touches).

- [ ] **Step 8: Validate and commit**

```bash
./validate
git add tests/presenter-record-detail.test.ts \
    web-app/app/presenters/record-detail.ts \
    web-app/records/detail.ts TODO.md
git commit -m "$(cat <<'MSG'
Render record Edit and Archive for admins only

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 18: Probe record existence on the binding PUT (spec item 16)

The flow↔record route (`api/routes.ts:5532-5541`) calls
`postFlowRecordDocumentOp` (`:2561-2584`), which appends
without reading `body.record_id`. Mirror the sibling
`postWorkOrderBindingOp`'s instance probe (`:2433-2445`):
inside the transaction, before `appendMessagePair`, derive
the record head in the caller's organization; absent →
`EntityNotFoundError('records', id)` (404) — never
`missedReadError`, which would 403 a foreign id and create an
existence oracle. The op gains `organization`; its two callers
pass it. Pin: Layer 1 — a PUT naming an absent record is 404
and appends nothing; an existing record still binds.

Two hazards ride with it (spec § Hazards): the seed's binding
writes must land AFTER its record writes, and
`tests/api-organization-isolation.test.ts:512-522` PUTs a
binding without asserting its status.

**Files:**
- Create: `tests/api-flow-record-binding.test.ts`
- Modify: `tests/api-organization-isolation.test.ts:512-522`
- Modify: `api/routes.ts:2555-2584` (the op), `:5538-5541`
  (the route)
- Modify: `api/mock-data.ts:106-118` (import),
  `:955-969` (the binding writes)
- Modify: `TODO.md` (a clause of the "run-four remaining
  seams" bullet)

**Interfaces:**
- Produces: `postFlowRecordDocumentOp(db, id, body, _actor,
  organization: Id, messagePair?)` — the `organization`
  parameter is new, positioned as in
  `postWorkOrderBindingOp(db, workOrderId, body, _actor,
  organization, messagePair?)`.
- Consumes: `flowRecordOrganizationFor(join): Id` from
  `api/mock-data/seed-message-pairs.ts:1072-1078` (exported;
  pass 1 already uses it for the same rows).

- [ ] **Step 1: Write the failing API test**

Create `tests/api-flow-record-binding.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// PUT organizations/:id/flows/:id/records/:frid — bind a flow
// to a record. The record must exist in the caller's
// organization: a miss is 404 (EntityNotFoundError — never
// missedReadError's 403, which would be an existence oracle)
// and appends nothing.

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const FLOW_ID = generateIdentifier();
const RECORD_ID = generateIdentifier();
const RECORD_MISSING = generateIdentifier();
const FR_ID = generateIdentifier();
const FR_MISSING = generateIdentifier();

const BINDINGS =
    '/organizations/' + ORGANIZATION
    + '/flows/' + FLOW_ID + '/records/';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

async function messagePairCount(
    db: MemoryDbAdapter,
): Promise<number> {
    return (await db.messagePairs.getAll()).length;
}

async function seedFlow(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST',
        '/organizations/' + ORGANIZATION + '/flows/',
        token,
        {
            id: FLOW_ID,
            flow: {
                name: 'Bind Flow',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: DEFAULT_LOCK_TIMEOUT,
            },
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: generateIdentifier(),
                flow_id: FLOW_ID,
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: AT,
            graphDelta: {
                nodes: [],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [],
            },
        },
    ));
    assert.equal(res.status, 201);
}

async function seedRecord(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'PUT',
        '/organizations/' + ORGANIZATION
            + '/record-types/' + RECORD_ID,
        token,
        {
            name: 'Bind Record',
            description: '',
            position: 1,
            state: 'active',
        },
    ));
    assert.equal(res.status, 201);
}

async function seededDb(): Promise<{
    db: MemoryDbAdapter;
    token: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION,
    );
    await seedFlow(db, token);
    await seedRecord(db, token);
    return { db, token };
}

test('binding an absent record → 404 and appends nothing',
async () => {
    const { db, token } = await seededDb();
    const before = await messagePairCount(db);
    const res = await handleRequest(db, req(
        'PUT', BINDINGS + FR_MISSING, token,
        {
            flow_id: FLOW_ID,
            record_id: RECORD_MISSING,
            at: AT,
        },
    ));
    assert.equal(res.status, 404);
    const body = await res.json() as { error: string };
    assert.equal(
        body.error, 'Not found: records/' + RECORD_MISSING,
    );
    assert.equal(await messagePairCount(db), before);
});

test('binding an existing record still 201s and reads back',
async () => {
    const { db, token } = await seededDb();
    const res = await handleRequest(db, req(
        'PUT', BINDINGS + FR_ID, token,
        { flow_id: FLOW_ID, record_id: RECORD_ID, at: AT },
    ));
    assert.equal(res.status, 201);
    const read = await handleRequest(db, req(
        'GET', BINDINGS + FR_ID, token,
    ));
    assert.equal(read.status, 200);
    const bound = await read.json() as { record_id: string };
    assert.equal(bound.record_id, RECORD_ID);
});
```

- [ ] **Step 2: Assert the isolation test's binding status**

In `tests/api-organization-isolation.test.ts` the unasserted
binding PUT

```ts
    await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/flows/' + ids.flow
            + '/records/' + ids.flowRecord,
        await organizationToken(identity, organization),
        {
            flow_id: ids.flow, record_id: ids.record,
            at: T8_AT,
        },
    ));
```

becomes

```ts
    const bindingWrite = await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/flows/' + ids.flow
            + '/records/' + ids.flowRecord,
        await organizationToken(identity, organization),
        {
            flow_id: ids.flow, record_id: ids.record,
            at: T8_AT,
        },
    ));
    assert.equal(bindingWrite.status, 201);
```

(`ids.record` is seeded through the record-types PUT at
`:443-455` in the same fixture, so the probe finds it.)

- [ ] **Step 3: Run both — expected RED on the 404 test only**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/api-flow-record-binding.test.ts \
    tests/api-organization-isolation.test.ts
```

Expected: `binding an absent record → 404` fails with
`201 !== 404`; the existing-record test and the isolation
file pass.

- [ ] **Step 4: Probe inside the op**

In `api/routes.ts` replace the whole op

```ts
export async function postFlowRecordDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<FlowRecordEntity> {
    const entity = flowRecordEntityOf({
        uriId: id,
        messagePairId: id,
        method: 'PUT',
        body: withoutId(body),
    });
    return db.transaction(
        // Phase Final Task 2: flow_records ROW half stripped.
        MESSAGE_TABLES,
        async (view) => {
            if (messagePair !== undefined) {
                await appendMessagePair(view, messagePair);
            }
            return entity;
        },
    );
}
```

with

```ts
export async function postFlowRecordDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    organization: Id,
    messagePair?: MessagePair,
): Promise<FlowRecordEntity> {
    const entity = flowRecordEntityOf({
        uriId: id,
        messagePairId: id,
        method: 'PUT',
        body: withoutId(body),
    });
    const recordsPrefix = recordTypesUriPrefix(organization);
    return db.transaction(
        // Phase Final Task 2: flow_records ROW half stripped.
        MESSAGE_TABLES,
        async (view) => {
            // Record miss is EntityNotFoundError (404) —
            // never missedReadError (would 403 foreign and
            // create an existence oracle; W1 / W7), the
            // work-order binding's instance-probe posture.
            const recordHead = deriveDocumentsAt(
                await view.messagePairs.getAllAtAddress(
                    recordsPrefix, entity.record_id,
                ),
                recordsPrefix,
            ).get(entity.record_id);
            if (recordHead === undefined) {
                throw new EntityNotFoundError(
                    'records', entity.record_id,
                );
            }
            if (messagePair !== undefined) {
                await appendMessagePair(view, messagePair);
            }
            return entity;
        },
    );
}
```

In the comment block directly above the op, append one
sentence to its last paragraph: `organization` is the
verified token claim the record probe reads in.
(`recordTypesUriPrefix`, `deriveDocumentsAt`, and
`EntityNotFoundError` are already imported at `:161`, `:179`,
`:2`.)

- [ ] **Step 5: Pass the organization from the route**

Replace

```ts
        put: (db, p, body, actor, messagePair) =>
            postFlowRecordDocumentOp(
                db, param(p, 2), body, actor, messagePair,
            ),
```

with

```ts
        put: (db, p, body, actor, messagePair, organization) =>
            postFlowRecordDocumentOp(
                db, param(p, 2), body, actor,
                requireOrganization(organization), messagePair,
            ),
```

- [ ] **Step 6: Pass it from the seed, and sequence the seed**

In `api/mock-data.ts` add `flowRecordOrganizationFor,` to the
import list that ends `} from './mock-data/seed-message-
pairs.ts';` (alphabetical placement is not the file's rule —
append it after `WO01_COMPLETE_EVENT_ID,`).

Then cut the whole `...mockFlowRecords.map(r => … ),` spread
(the last element of the `await Promise.all([` that ends at
`:969`) out of that array, and insert after that `]);`:

```ts

    // Bindings probe their record inside the write gate
    // (postFlowRecordDocumentOp), so the records above must
    // have landed first — a second wave, not a spread into
    // the first.
    await Promise.all(
        mockFlowRecords.map(r =>
            postFlowRecordDocumentOp(
                adapter,
                r.id,
                flowRecordJoinSeedBody(r),
                SYSTEM_MEMBER_ID,
                flowRecordOrganizationFor(r),
                requireMessagePair(
                    messagePairs,
                    seedMessagePairKey(
                        'flows/:id/records/:frid', r.id,
                    ),
                ),
            ),
        ),
    );
```

- [ ] **Step 7: Run the pins — expected GREEN, counts unchanged**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/api-flow-record-binding.test.ts \
    tests/api-organization-isolation.test.ts \
    tests/mock-data-pairs.test.ts tests/mock-data-valid.test.ts \
    tests/adapters-flow-records.test.ts
```

Expected: all pass; `EXPECTED_MESSAGE_PAIR_COUNT = 1453`
(`tests/mock-data-pairs.test.ts:158`) and the `92` actuals
(`tests/mock-data-valid.test.ts:336`) are untouched and
green. A red seed pin means the probe rejected a seed write —
fix the ordering or the organization, never the pin.

- [ ] **Step 8: Strike the clause from the TODO bullet**

In the "run-four remaining seams" bullet delete

```
the binding PUT not probing record existence
  (`api/routes.ts:5583-5586`);
```

so the bullet now reads
`- The run-four remediation's remaining seams — R12 without a
positive subject; stale G9 / R6 / R7 notes` (Task 26 rewrites
that residue).

- [ ] **Step 9: Validate and commit**

```bash
./validate
git add tests/api-flow-record-binding.test.ts \
    tests/api-organization-isolation.test.ts api/routes.ts \
    api/mock-data.ts TODO.md
git commit -m "$(cat <<'MSG'
Probe record existence on the binding PUT

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 19: Prune the unseated seed entries (spec item 17)

`api/mock-data.ts:208` and
`api/mock-data/seed-hash-preimage.ts:175` still map
`dtmZgnDBlVcoyjxKzlaKgA`, the deleted slice seeder's
'g-unseated' identity. The mapped credential id appears
nowhere else; the one test naming the identity
(`tests/api-authentication-token.test.ts:1064`) mints its
own. The seed pins prove the deletion inert.

**Files:**
- Modify: `api/mock-data.ts:208`
- Modify: `api/mock-data/seed-hash-preimage.ts:175`
- Modify: `TODO.md` (the bullet at `:1175-1180`)

**Interfaces:** none.

- [ ] **Step 1: Measure before**

```bash
grep -rn "dtmZgnDBlVcoyjxKzlaKgA\|bOMGBKTGNCuZxtrUYLAkMQ" \
    api/ web-app/ shared/ server/ tests/
```

Expected: exactly three lines — the two map entries and the
test's own `const UNSEATED`.

- [ ] **Step 2: Delete both lines**

In `api/mock-data.ts` delete

```ts
    'dtmZgnDBlVcoyjxKzlaKgA': 'bOMGBKTGNCuZxtrUYLAkMQ',
```

In `api/mock-data/seed-hash-preimage.ts` delete

```ts
    'dtmZgnDBlVcoyjxKzlaKgA': 'g-unseated',
```

- [ ] **Step 3: Run the pins**

```bash
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/mock-data-pairs.test.ts \
    tests/mock-data-valid.test.ts \
    tests/api-authentication-token.test.ts tests/pg-seed.test.ts
```

Expected: all pass; 1453 pairs, 92 actuals, 12 printed
sign-ins, unchanged.

- [ ] **Step 4: Remove the TODO bullet**

Delete:

```
- Two dormant seed map entries still carry the deleted
  slice seeder's identity `dtmZgnDBlVcoyjxKzlaKgA`
  ('g-unseated') — `api/mock-data.ts:204`
  (`SEED_PASSWORD_CREDENTIAL_BY_IDENTITY`) and
  `api/mock-data/seed-hash-preimage.ts:175`. Pruning
  them was out of the three-layers spec's scope
```

- [ ] **Step 5: Validate and commit**

```bash
./validate
git add api/mock-data.ts api/mock-data/seed-hash-preimage.ts TODO.md
git commit -m "$(cat <<'MSG'
Prune the unseated seed entries

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 20: Narrow the version snapshot rows (spec item 18)

`versionSnapshotsAt` (`api/document-family.ts:442, :449`)
declares `unknown[]`; every element is a spread `object` plus
`etag`, `at`, `member_id`. Narrow to
`Record<string, unknown>[]`, and the re-declaration at
`api/invitations-domain.ts:882` with it, or the wrapper
undoes it. Stop there: the true element type waits on
`entityOf`'s `=> object`, and `document-family.ts:692` is the
same shape and not asked for.

**Files:**
- Modify: `api/document-family.ts:442`, `:449`
- Modify: `api/invitations-domain.ts:882`
- Modify: `TODO.md` (the "Run-six cosmetics" bullet)

**Interfaces:**
- Produces: `versionSnapshotsAt(...): Promise<Record<string,
  unknown>[]>`; `invitationVersionSnapshots(...):
  Promise<Record<string, unknown>[]>`.

- [ ] **Step 1: Narrow the return and the local**

In `api/document-family.ts` replace

```ts
    toEntity: (document: DerivedDocument) => object,
): Promise<unknown[]> {
```

with

```ts
    toEntity: (document: DerivedDocument) => object,
): Promise<Record<string, unknown>[]> {
```

and

```ts
    const snapshots: unknown[] = [];
```

with

```ts
    const snapshots: Record<string, unknown>[] = [];
```

- [ ] **Step 2: Narrow the wrapper**

In `api/invitations-domain.ts` replace

```ts
async function invitationVersionSnapshots(
    db: DbAdapter,
    id: Id,
): Promise<unknown[]> {
```

with

```ts
async function invitationVersionSnapshots(
    db: DbAdapter,
    id: Id,
): Promise<Record<string, unknown>[]> {
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p tsconfig.json
grep -n "unknown\[\]" api/document-family.ts api/invitations-domain.ts
```

Expected: clean; the one remaining `unknown[]` is
`document-family.ts:692` (`const rows: unknown[]`), which
stays.

- [ ] **Step 4: Remove the TODO bullet**

Delete the bullet as Task 5 left it:

```
- Run-six cosmetics, none load-bearing: `unknown[]`
  returns now provably narrower
  (`api/document-family.ts:438,:445`)
```

- [ ] **Step 5: Validate and commit**

```bash
./validate
git add api/document-family.ts api/invitations-domain.ts TODO.md
git commit -m "$(cat <<'MSG'
Narrow the version snapshot rows

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 21: Drop the unreachable FK_SPECIAL map (spec item 19)

`web-app/app/schema-svg.ts:99-109` keeps a map of `_id`
columns whose target table the name convention cannot reach,
and `fkTarget` (`:212-213`) consults it. The generator draws
its tables from `DbStores` (`api/db.ts:255-257`), which has
one store, `messagePairs`; none of the map's four keys is a
message-pair column, so the lookup never hits. Pin:
`generate-schema-svg --check` inside `./validate` — SCHEMA.svg
is byte-identical.

**Files:**
- Modify: `web-app/app/schema-svg.ts:99-109`, `:212-213`
- Modify: `TODO.md` (a clause of critical-path item 9's
  Merged list, `:134-137`)

**Interfaces:** none.

- [ ] **Step 1: Confirm the two sites**

```bash
grep -n "FK_SPECIAL" web-app/app/schema-svg.ts
sed -n '255,257p' api/db.ts
```

Expected: `:104` (the map) and `:212` (the lookup); `DbStores`
has only `messagePairs`.

- [ ] **Step 2: Delete the map and its comment**

Delete these eleven lines (the comment and the map):

```ts
// _id columns whose target table the name convention cannot
// reach: attribute_id points at record_attributes (the column name
// predates Records); state_event_id points at states;
// from_node_id / to_node_id point at flow_nodes (the from_/to_
// prefix hides the noun the convention would pluralize).
const FK_SPECIAL: Record<string, string> = {
    attribute_id: 'record_attributes',
    state_event_id: 'states',
    from_node_id: 'flow_nodes',
    to_node_id: 'flow_nodes',
};

```

(including the blank line that follows, so one blank line
separates the surrounding blocks).

- [ ] **Step 3: Delete the lookup**

In `fkTarget` delete

```ts
    const special = FK_SPECIAL[col];
    if (special) return special;
```

so the function body reads

```ts
    if (col === 'id') {
        const t = BRAND_TABLE[type];
        return t && t !== table ? t : null;
    }
    if (!col.endsWith('_id')) return null;
    const target = col.slice(0, -3) + 's';
    return tables.has(target) ? target : null;
```

- [ ] **Step 4: Prove SCHEMA.svg unchanged**

```bash
./generate-schema-svg --check
git status --short SCHEMA.svg
```

Expected: the check passes and SCHEMA.svg is not modified.

- [ ] **Step 5: Strike the clause from item 9's Merged list**

In `TODO.md` critical-path item 9 delete

```
the dead
   `FK_SPECIAL` map
   (`web-app/app/schema-svg.ts:100-110` — remove the
   comment at `schema-svg.ts:100-110` when done);
```

so `(`api/flow-graph-diff.ts:16-26`);` is followed directly
by `` `callerOrganizationIds`, zero callers `` (re-wrap only
the lines the deletion touches).

- [ ] **Step 6: Validate and commit**

```bash
./validate
git add web-app/app/schema-svg.ts TODO.md
git commit -m "$(cat <<'MSG'
Drop the unreachable FK_SPECIAL map

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 22: Drop the callerless organization-ids alias (spec item 20)

`api/request-auth.ts:189-197` keeps an adapter-shaped alias
with zero callers. Delete it with its comment, and the
`DbAdapter` type import at `:1`, which has no other use.
Pin: `tsc`.

**Files:**
- Modify: `api/request-auth.ts:1`, `:189-198`
- Modify: `TODO.md` (a clause of critical-path item 9's
  Merged list, `:138-140`)

**Interfaces:** none (the alias had no callers).

- [ ] **Step 1: Confirm zero callers and the lone import use**

```bash
grep -rn "callerOrganizationIds\b" api/ web-app/ shared/ server/ tests/
grep -n "DbAdapter" api/request-auth.ts
```

Expected: only the definition and its own comment at
`request-auth.ts:189-196`; `DbAdapter` appears at `:1`
(import), `:190` (comment), `:193` (parameter) and nowhere
else.

- [ ] **Step 2: Delete the alias and the import**

Delete

```ts
// Adapter-shaped alias retained for callers that still pass
// a DbAdapter — the claim set is authoritative; the adapter
// is unused. Prefer callerOrganizationIdsFromClaims.
export async function callerOrganizationIds(
    _adapter: DbAdapter,
    principal: Principal,
): Promise<Set<Id>> {
    return callerOrganizationIdsFromClaims(principal);
}

```

(with its trailing blank line) and the first line of the file

```ts
import type { DbAdapter } from './db.ts';
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p web-app/app/tsconfig.json
```

Expected: clean.

- [ ] **Step 4: Strike the clause from item 9's Merged list**

Delete

```
`callerOrganizationIds`, zero callers
   (`api/request-auth.ts:189-197` — remove the comment
   at `request-auth.ts:189-191` when done);
```

(re-wrap only the lines the deletion touches).

- [ ] **Step 5: Validate and commit**

```bash
./validate
git add api/request-auth.ts TODO.md
git commit -m "$(cat <<'MSG'
Drop the callerless organization-ids alias

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 23: Call the type history walk by its own name (spec item 21)

`api/derive-record-types.ts:185-197` is a thin alias of
`deriveRecordTypeStateHistory` — same signature — kept so call
sites "keep compiling". Every call site is a test. Point them
at the real name; delete the alias and its comment. Pin: the
same tests, green under the name they now call. Only the
imported name changes, never an assertion.

**Files:**
- Modify: `tests/drift-records.test.ts:39`, `:884`, `:1125`
- Modify: `tests/drift-states.test.ts:30`, `:173`
- Modify: `tests/adapters-records.test.ts:2`, `:260`, `:352`
- Modify: `tests/api-record-document.test.ts:2`, `:139`
  (comment), `:165`, `:222`, `:285`, `:325`
- Modify: `api/derive-record-types.ts:185-197`
- Modify: `TODO.md` (a clause of critical-path item 9's
  Merged list, `:141-144`)

**Interfaces:**
- Consumes: `deriveRecordTypeStateHistory(db, organization,
  id): Promise<StateEntity[]>` (`derive-record-types.ts:160`).

- [ ] **Step 1: Measure before**

```bash
grep -rn "deriveRecordStateHistory\b" api/ tests/ | wc -l
grep -rln "deriveRecordStateHistory\b" tests/
```

Expected: 16 lines across the alias's two mentions in
`api/derive-record-types.ts` and the four test files.

- [ ] **Step 2: Rename every use in the four test files**

```bash
perl -pi -e 's/\bderiveRecordStateHistory\b/deriveRecordTypeStateHistory/g' \
    tests/drift-records.test.ts tests/drift-states.test.ts \
    tests/adapters-records.test.ts tests/api-record-document.test.ts
```

Then re-wrap the one import that the longer name pushes past
78 characters, `tests/drift-records.test.ts:39`:

```ts
import { deriveRecordTypeStateHistory } from
    '../api/derive-record-types.ts';
```

- [ ] **Step 3: Delete the alias**

In `api/derive-record-types.ts` delete

```ts

// Flat-window history helper kept as a thin alias of the
// nested type history walk (same prefix, same reduction).
// Call sites that still name deriveRecordStateHistory
// (adapters, drift pins) keep compiling; wire history is
// RECORD_TYPE_VERSIONS_PATTERN only after Task 23.
export async function deriveRecordStateHistory(
    db: DbAdapter,
    organization: Id,
    recordId: Id,
): Promise<StateEntity[]> {
    return deriveRecordTypeStateHistory(
        db, organization, recordId,
    );
}
```

(the preceding blank line goes with it; the file still ends
with one newline).

- [ ] **Step 4: Measure after and run the four files**

```bash
grep -rn "deriveRecordStateHistory\b" api/ tests/ ; echo "(empty)"
awk 'length > 78 { print FILENAME ":" FNR }' \
    tests/drift-records.test.ts tests/drift-states.test.ts \
    tests/adapters-records.test.ts tests/api-record-document.test.ts
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/drift-records.test.ts tests/drift-states.test.ts \
    tests/adapters-records.test.ts tests/api-record-document.test.ts
```

Expected: no remaining mention; no long lines; all pass.

- [ ] **Step 5: Strike the clause from item 9's Merged list**

Delete

```
the
   test-only `deriveRecordStateHistory` alias
   (`api/derive-record-types.ts:185-189` — remove the
   comment at `derive-record-types.ts:185-189` when
   done);
```

(re-wrap only the lines the deletion touches).

- [ ] **Step 6: Validate and commit**

```bash
./validate
git add tests/drift-records.test.ts tests/drift-states.test.ts \
    tests/adapters-records.test.ts tests/api-record-document.test.ts \
    api/derive-record-types.ts TODO.md
git commit -m "$(cat <<'MSG'
Call the type history walk by its own name

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 24: Drop the flow stats description stub (spec item 22)

`web-app/app/presenters/flow-stats.ts:417` is a stub returning
`''`; `renderShell` (`:224-230`) writes it into
`<p class="flow-stats-flow-desc">` (`:95-96`), and nothing
ever fills that slot — the page fills only the name, and
neither `FlowGraph` nor `FlowEntity` carries a description.
Delete the stub, the `descEl` block, the empty `<p>`, and its
CSS rule. `#flowName` stays: the page does fill it, and the
comment at `:414-415` shrinks to that one stub. Pin: `tsc`
and `tests/presenter-flow-stats.test.ts`, which renders the
shell and names no description.

**Files:**
- Modify: `web-app/app/presenters/flow-stats.ts:95-96`,
  `:213-216`, `:224-230`, `:414-417`
- Modify: `web-app/app/styles/pages-flow-stats.css:70-74`
- Modify: `TODO.md` (a clause of critical-path item 9's
  Merged list, `:144-147`)

**Interfaces:** none.

- [ ] **Step 1: Confirm nothing else names the slot**

```bash
grep -rn "flowDesc\|flow-stats-flow-desc" web-app/ tests/
```

Expected: only the presenter's four sites and the CSS rule.

- [ ] **Step 2: Delete the empty paragraph from the shell**

In `buildShell` delete the two lines

```ts
        <p class="flow-stats-flow-desc"
        ></p>
```

so the title block holds only the `<h1>`.

- [ ] **Step 3: Delete the descEl block, say "it" not "these"**

In `renderShell` replace

```ts
        // The aggregate is deliberately
        // flow-name-agnostic; the page module
        // sets these from the FlowGraph it
        // already holds (Task 18).
        const nameEl = $(
            '.flow-stats-flow-name', container,
        );
        if (nameEl) {
            nameEl.textContent =
                this.#flowName();
        }
        const descEl = $(
            '.flow-stats-flow-desc', container,
        );
        if (descEl) {
            descEl.textContent =
                this.#flowDesc();
        }
    }
```

with

```ts
        // The aggregate is deliberately
        // flow-name-agnostic; the page module
        // sets it from the FlowGraph it
        // already holds (Task 18).
        const nameEl = $(
            '.flow-stats-flow-name', container,
        );
        if (nameEl) {
            nameEl.textContent =
                this.#flowName();
        }
    }
```

- [ ] **Step 4: Shrink the stub comment, delete the stub**

Replace

```ts
    // Stubs — page module fills these from
    // the FlowGraph it already holds (Task 18).
    #flowName(): string { return ''; }
    #flowDesc(): string { return ''; }
}
```

with

```ts
    // Stub — the page module fills the name from
    // the FlowGraph it already holds (Task 18).
    #flowName(): string { return ''; }
}
```

- [ ] **Step 5: Delete the CSS rule**

In `web-app/app/styles/pages-flow-stats.css` delete

```css
.flow-stats-flow-desc {
    margin: 0;
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
}
```

- [ ] **Step 6: Type-check and run the pins**

```bash
grep -rn "flowDesc\|flow-stats-flow-desc" web-app/ tests/ ; echo "(empty)"
npx tsc --noEmit -p web-app/app/tsconfig.json
TZ=UTC node --strip-types --import ./tests/hmac-test-key.ts \
    --test tests/presenter-flow-stats.test.ts \
    tests/flow-stats-subscribe.test.ts
```

Expected: no mention remains; `tsc` clean; both files pass
(Task 12's host stub answers `null` for the description
selector already, and now is never asked).

- [ ] **Step 7: Strike the clause from item 9's Merged list**

Delete

```
the `#flowDesc` stub
   (`web-app/app/presenters/flow-stats.ts:414-417` —
   remove the comment at `flow-stats.ts:414-415` when
   done);
```

(re-wrap only the lines the deletion touches).

- [ ] **Step 8: Validate and commit**

```bash
./validate
git add web-app/app/presenters/flow-stats.ts \
    web-app/app/styles/pages-flow-stats.css TODO.md
git commit -m "$(cat <<'MSG'
Drop the flow stats description stub

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

### Task 25: Pin the toast on an incomplete idea submit (spec item 23) — STRUCK

No commit. The work the spec asks for is already in the tree
(see "Measured against the spec"): commit `b705122a`, an
ancestor of `82dee1d9`, rewrote TEST-PLAN D6/D7 to the toast
and named three live tests. Verify, then move on:

- [ ] **Step 1: Confirm the pin is real and complete**

```bash
git merge-base --is-ancestor b705122a HEAD && echo ancestor
sed -n '/\*\*D6\*\*/,/\*\*D8\*\*/p' TEST-PLAN.md | head -40
grep -n "ideaCreateDraftIsComplete requires title,\|keeps submit clickable\|enables submit and" \
    tests/presenter-idea.test.ts
```

Expected: `ancestor`; D6 says "an error toast reads … The
button stays clickable (no `disabled` attribute — validation
is post-click)" and D7 says "there is no disabled→enabled
transition"; all three named tests print.

If any of the three greps is silent, the pin names a phantom
test — STOP and report; that is a doc lie this plan did not
foresee, and it needs the orchestrator's call (write the test
or correct the name), not a silent fix.

- [ ] **Step 2: Nothing to commit**

The "Validation voices" bullet correction that the spec tied
to this item lands in Task 26 unchanged.

---

### Task 26: Correct the Later-work bullets this sweep read (spec item 24)

Docs only; lands last. Six bullets stay and each said
something false; one is folded into critical-path item 6,
whose `hasUndoHistory` clause gains a sentence. Every edit
below is against the TODO.md the preceding tasks left.

**Files:**
- Modify: `TODO.md`

**Interfaces:** none.

- [ ] **Step 1: Re-verify the two measured claims**

```bash
sed -n '320,330p' tests/pg-seed.test.ts
grep -n "toGeneralInfoDraft" tests/presenter-projects-organization.test.ts
grep -n "hasUndoHistory" api/routes.ts api/api.ts ; echo "(empty = read by no route)"
```

Expected: the reveal test asserts 12 tab-bearing lines; the
edit-form test calls `toGeneralInfoDraft`; no route reads
`hasUndoHistory`.

- [ ] **Step 2: Stale-history sweep**

Replace

```
- Stale-history comment cleanup as one pass — about 35
  code and 32 test comments describe a past state as
  present; the enumeration is the run-four
  remediation's Evidence
```

with

```
- Stale-history comment cleanup as one pass — about 35
  code and 32 test comments describe a past state as
  present. The run-four remediation's Evidence
  (`docs/superpowers/specs/`
  `2026-08-23-test-plan-run-four-remediation-design.md:911-932`)
  lists provenance, not comments, and the reproductions
  that might have were scratchpad, never committed —
  the pass re-derives its enumeration by reading. The
  seven "remove the comment at … when done" pointers
  under `## Critical path` are that path's property,
  not stale
```

- [ ] **Step 3: Fold the undo bullet into critical-path item 6**

Delete the bullet

```
- Undo at the stack bottom returns 201 — `api/derive-flows.ts`
  computes `hasUndoHistory` as `pairs > 1`, so the first undo
  past the bottom is accepted instead of refused. Named by
  the 2026-08-29 three-layers audit; observed in the F
  undo/redo cases. Oracle: a Layer 1 test in
  `tests/flow-operations.test.ts` asserting the bottom-of-stack
  undo is refused.
```

and in critical-path item 6 replace

```
   `hasUndoHistory` as `pairs > 1`
   (`api/derive-flows.ts:108`), rotation only on the
```

with

```
   `hasUndoHistory` as `pairs > 1`
   (`api/derive-flows.ts:108` — the client's
   approximation, read by no route; the undo route
   walks the stack itself and its bottom-of-stack 201
   is the documented no-op, `api/types.ts:1043-1051`,
   which TEST-PLAN F36/F45 call PASS — the brainstorm
   decides whether that stays), rotation only on the
```

- [ ] **Step 4: Run-four seams — the residue Tasks 15-18 left**

Replace the bullet (as Task 18 left it)

```
- The run-four remediation's remaining seams — R12
  without a positive subject; stale G9 / R6 / R7 notes
```

(whatever its exact wrapping) with

```
- The run-four remediation's remaining seams — R6 and
  R7, whose "toy" clauses need a Layer 3 observation
  before any rewrite. G9's staleness was the corrupted
  test name, restored by the small-items sweep; R12's
  note is accurate and its gap is the Unpinned entry
```

- [ ] **Step 5: Validation voices — the design call alone**

Replace

```
- Idea-create toasts an incomplete submit; convert
  still sets `btn.disabled` — two forms, one
  directory, opposite validation voices
  (`web-app/ideas/create.ts:124`,
  `web-app/ideas/convert.ts:356`;
  `docs/superpowers/test-plan-mitigations/`
  `2026-08-26-d-d6.md`)
```

with

```
- Idea-create toasts an incomplete submit; convert
  still sets `btn.disabled` — two forms, one
  directory, opposite validation voices
  (`web-app/ideas/create.ts:124`,
  `web-app/ideas/convert.ts:356`). A design call, not
  a defect: TEST-PLAN D6/D7 pin the toast, and the
  2026-08-26 D6 stub files the voice question as its
  separate finding
```

- [ ] **Step 6: A3 — twelve lines since the zero-membership seed**

Replace

```
  - The mock-data reveal's 11 printed lines carry
    `demo@example.com` and `sarah.chen@company.com` by
    name, not merely a count of 11 (A3) — Layer 1,
```

with

```
  - The mock-data reveal's 12 printed lines carry
    `demo@example.com` and `sarah.chen@company.com` by
    name, not merely a count of 12 (A3) — Layer 1,
```

- [ ] **Step 7: G10 — the draft is exercised, the prefill is not**

Replace

```
  - The Organization edit form's prefill — the two inputs
    carrying the current Name and Domain as `value`
    attributes (G10) — Layer 1,
    `tests/presenter-projects-organization.test.ts`;
    nothing anywhere exercises `toGeneralInfoDraft`
    (`web-app/app/adapters/admin.ts:58`)
```

with

```
  - The Organization edit form's prefill — the two inputs
    carrying the current Name and Domain as `value`
    attributes (G10) — Layer 1,
    `tests/presenter-projects-organization.test.ts`,
    whose edit-form test already calls
    `toGeneralInfoDraft` (`web-app/app/adapters/admin.ts:58`)
    and asserts no `value=`
```

- [ ] **Step 8: Read the whole Later-work section once**

```bash
sed -n '/^## Later work/,/^## Sequencing/p' TODO.md | \
    grep -n "formRExtras\|redirectToLogin\|G/V5\|compose up\|(B24)\|(D25)\|(D26)\|(R21)\|disconnect()\|non-strict DESC\|unknown\[\]\|current/limit\|rOEPOcVMQdJiiiMuiiEhlg\|gOrganization\|F51\|never clears\|stats.ts\|hide, don't remove\|definitionAt\|by comment, not assertion\|<td>archived\|sparkline track\|flow-header dropdown\|Edit rendered\|probing record\|g-unseated\|Undo at the stack"
```

Expected: no output — every bullet this sweep shipped or
struck is gone, and the six corrections read as written
above.

- [ ] **Step 9: Validate and commit**

```bash
./validate
git add TODO.md
git commit -m "$(cat <<'MSG'
Correct the Later-work bullets this sweep read

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Py4caoTuGeQzLxAbKqJMYS
MSG
)"
```

---

## Completion checklist (whole plan)

- [ ] 25 commits on `2026-09-01-small-items-sweep` after the
  spec commit, in the order above (Task 25 struck), each
  subject ≈50 chars with the two trailer lines.
- [ ] `git log --oneline master..HEAD` shows one concern per
  commit; no commit both renames and changes content.
- [ ] `./validate` green on every commit (`git rebase master`
  first if master moved; amend until every commit is green).
- [ ] `./test-all` green at the tip — Layer 1 plus
  `./test-browser` with `dialogs.test.ts` (2 tests) and
  `viewport.test.ts` (2 tests) passing. If Chrome cannot
  launch, report exactly that; do not fast-forward on an
  unrun Layer 2.
- [ ] `grep -rn "rOEPOcVMQdJiiiMuiiEhlg" tests/` finds only
  string literals (no identifier sites in the five files).
- [ ] `grep -rn "FK_SPECIAL\|callerOrganizationIds\b\|deriveRecordStateHistory\b\|flowDesc" api/ web-app/ tests/`
  is empty.
- [ ] `EXPECTED_MESSAGE_PAIR_COUNT = 1453` and the `92`
  actuals pin are byte-identical to master.
- [ ] TODO.md: every bullet a task's "Remove the TODO bullet"
  or "Strike the clause" step names is gone; the six corrections
  of Task 26 are present; `## Critical path` item 9's Merged
  list is four clauses shorter and item 6's `hasUndoHistory`
  clause carries its sentence.
- [ ] TEST-PLAN.md: D26 and B24 name their tests (Task 1);
  the G9 pin reads `current/limit` (Task 6); nothing else in
  the file changed.
- [ ] Land: from the main checkout, `git merge --ff-only
  2026-09-01-small-items-sweep`, then `git worktree remove
  .worktrees/2026-09-01-small-items-sweep && git branch -d
  2026-09-01-small-items-sweep` (AGENTS.md § Worktrees).

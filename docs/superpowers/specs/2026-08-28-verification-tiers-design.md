# Verification tiers: one contract, four tiers, one rule

Date: 2026-08-28. Status: approved in conversation; one
pass. Supersedes the run-remediation cycle that began at
`f8d5133c` (2026-08-19) and replaces TODO.md item 5.

## Problem

Since `f8d5133c` the repository has run a dozen
TEST-PLAN.md browser regressions in nine days and shipped
373 commits in response — 64 to TEST-PLAN.md itself, 71
spec, plan, and stub files. The browser layer is 400
cases executed by fourteen LLM hunters driving one shared
Chrome over CDP in parallel. The run never converged:
FAIL counts went 67 → 35 → 5 → 9 → … → 22 → 39 → 57. The
2026-08-28 assessment (this spec's origin) found:

1. **None of the 13 driven FAILs in the last run is a
   product defect.** Every product covenant behind them
   is pinned green in `tests/` — the plan did not know
   it. Only 22 of 371 case lines cite a test file.
2. **A hidden tab makes rendering-dependent assertions
   unobservable.** A hidden document skips "update the
   rendering": CSS transitions freeze at their start
   value, `transitionend` never fires, timers throttle,
   `mouseMoved` lands seconds late. The 08-28 hidden-tab
   spec scoped this to gestures; V2 (toast detach) and I9
   (sidebar width) came from hunters the protocol forbids
   from activating their tab.
3. **A gesture abandoned on `TimeoutError` poisons the
   page.** The canvas wrap keeps pointer capture, so
   every later click on that page is redirected and
   scores as a product FAIL (AA28–AA40, F16–F67). Two
   gesture hunters activate their tabs against each
   other; the 08-28 spec's own Risks section predicted
   it.
4. **A harness-driven product change regressed the
   product.** `ee6bcba2` replaced HTML5 drag-and-drop
   with pointer capture because CDP cannot drive a
   `drop`. With capture, the `click` that follows
   `pointerup` targets the card, not the handle, so
   `onCardClick`'s `.drag-handle` exclusion no longer
   matches and a drag release navigates to detail
   (`web-app/app/drag-reorder.ts:147-189`,
   `web-app/projects/index.ts:241-262`, and the same
   path in ideas, records, workbox). No pin says "a
   handle click does not navigate". The run filed it as
   DRIFT.
5. **The regression contract is a workaround
   catalogue.** Every harness quirk became a drive note:
   `activate_tab`, `drain_events`, `mac-approve`, a
   1.19× screenshot scale, 14-second list waits, "the
   first click only focuses". Each note makes the next
   run less reliable, and the notes interact.
6. **Two fixture hazards in `tests/`.** 112 `req()`
   helpers pin one `TEST_OPERATION_ID`; `appendMessagePair`
   dedupes on `request_hash`, so a byte-identical second
   request is dropped and a test can pass against
   unfixed code (TODO.md names one that did). Twenty-eight
   tests each hand-roll `globalThis.document` /
   `window` / `localStorage` stubs because `state.ts`
   reads them at module evaluation.

The Office of Verification names the browser run: a
test that fails intermittently is a false prophet.

## Goals

- One rule: a browser observation becomes a product
  change only after a red test at the lowest tier that
  can express it. The ruling is not evidence; the red
  test is.
- Tier 0 (pure logic, `./test`) stays the gate and gets
  its two fixture hazards fixed.
- Tier 1 (wiring decisions) is named as the idiom:
  glue dispatches, decisions decide, decisions get
  pinned. One shared stub preamble replaces twenty-eight.
- Tier 2 (`./test-browser`): deterministic, serial,
  headless Chrome over CDP on Node's built-in
  `WebSocket`, against an in-process origin on the memory
  backend, one browser context per test. No new
  dependency. Seeded with E11.
- Tier 3 (exploration): TEST-PLAN.md becomes the index
  of covenants plus a serial, one-visible-tab exploration
  protocol whose findings enter only as red tests.
- The parallel apparatus — fourteen tenants, aliases,
  the slice seed, the 48-subagent item — is removed.

## Non-goals

- Playwright, Puppeteer, jsdom, happy-dom, or any new
  dependency. Chrome's protocol and Node's `WebSocket`
  are the primitives; the adapter is the divorce point.
- Browser tests inside `./validate`. It stays Chrome-free
  and Postgres-free.
- Changing product behavior beyond the E11 regression.
- Rewriting `./measure` beyond consuming the extracted
  client.
- Editing dated specs, plans, or mitigation stubs.

## Design

### 0. The rule

A hunter's (or a human's) browser observation is recorded
as a mitigation stub with one new mandatory field —
`Reproduced by: tests/… (red at SHA)` — and no product
commit lands without it. The tier is the lowest that can
express the covenant: a reducer or presenter pin (Tier 0),
a decision pin (Tier 1), or a CDP test (Tier 2).

### 1. Tier 0 — pure logic

Unchanged in kind. Two fixture corrections:

- **Fresh operation ids.** `apiRequest` already mints a
  fresh identifier when `operationId` is omitted. Every
  `req()` helper stops passing `TEST_OPERATION_ID`. A
  test that deliberately replays a request passes an
  explicit id and says so. `TEST_OPERATION_ID` remains
  for below-gate pair fixtures, its comment naming that
  as its only use. Any test that turns red under fresh
  ids is either a replay test (give it its id) or a
  false green (a finding — fix the code, never the
  test).
- **One stub preamble.** `tests/browser-globals.ts`
  installs the superset the twenty-eight tests install
  today: `localStorage`, `sessionStorage`, `window`
  (`matchMedia`, `addEventListener`), `document`
  (`addEventListener`), and the element constructors
  (`HTMLInputElement`, `HTMLTextAreaElement`,
  `HTMLSelectElement`, `SVGElement`). Imported first,
  it evaluates before every later static import, so the
  dynamic `await import(…)` workaround goes away. A
  test with a genuinely unique need keeps that one
  stub local.

### 2. Tier 1 — wiring decisions

The codebase's idiom is already right and is now the
rule: `reduceDesignerShortcut`, `isDesignerEditableTarget`,
`nextCanvasTabIndex`, `pointerIsShift`, `followTranslateY`,
`computeDropIndex`. Event glue dispatches; a pure
function decides; the decision is pinned. Glue that owns
browser semantics — pointer capture, focus, layout — is
Tier 2's, because no fake DOM models them (a fake DOM
passes E11).

### 3. Tier 2 — `./test-browser`

**Client.** `web-app/app/measure.ts` already holds a
zero-dependency CDP client (`CdpClient` on the global
`WebSocket`), Chrome launch (`--headless=new
--remote-debugging-port=0`), port discovery, `pollUntil`,
`evaluateJson`, `waitForSelector`, `clickSelector`, and a
UI `login`. They move to two Node-only modules beside
measure, excluded from the browser `tsconfig` as measure
is:

- `web-app/app/cdp-client.ts` — transport and launch.
  `CdpClient.connect(url)`, `send(method, params,
  sessionId?)`, `on(event, listener)`, `close()`;
  `launchChrome(userDataDir, windowSize)` returning the
  browser WebSocket URL and a `kill`; `pollUntil`;
  `evaluateJson`; `waitForSelector`; `clickSelector`;
  `pageNavigate`; `chromeBinary`; `killProcessTree`.
  Flat sessions: `Target.attachToTarget` with
  `flatten: true`; responses route by id, events by
  `sessionId`.
- `web-app/app/browser-drive.ts` — product-aware:
  `login(session, baseUrl, email, password)`,
  `waitPageReady`, `harvestReady`.

`measure.ts` imports both; its behavior is unchanged
(`./measure --help` and `--visualize` prove the module
loads; the ceremony is unchanged in kind).

**Bundle.** The client bundling steps of `build`
(compose, `app.js`, `theme-init.js`, `root-redirect.js`,
styles, page CSS, fonts, `index.html`, favicons) move to
`build-lib`, a sourced Bash library exposing
`bundle_client DEST`. `build` sources it and keeps the
clean-tree gate, `server.mjs`, and the ZIP.
`test-browser` sources it and bundles into `$TMPDIR` on
any tree. `build-lib` joins the 78-character lint list.

**Origin.** `tests/browser/fixtures.ts` starts, per test,
an in-process origin: `memoryDbAdapter()`,
`postMockDataLoad` with the test hasher (returning the
seeded credentials, so `demo@example.com`'s minted
password is known), `listenHttp({ adapter, staticRoot:
FUSION_ANGLE_STATIC_ROOT, port: 0 })`. The origin is
`http://127.0.0.1:<port>` — the host `./measure` already
logs into, so the `Secure` refresh cookie is accepted.
Setup and lookups use the in-process `db` and `api/`
verbs; the UI is driven only for what the test asserts.

**Isolation.** One Chrome per test file (module
`before` / `after`). One browser context per test
(`Target.createBrowserContext` → `Target.createTarget`
→ `Target.attachToTarget`), so cookies, `localStorage`,
and `sessionStorage` never leak between tests; two-jar
tests open two contexts against one origin. Files run
with `--test-concurrency=1`; the active target is the
only one, so rendering runs, transitions advance, and
`mouseMoved` lands at once. Viewport via
`Emulation.setDeviceMetricsOverride` (1280×800 default,
`deviceScaleFactor: 1`, so `getBoundingClientRect` is
the input coordinate space — there is no screenshot
scale). Reduced motion via `Emulation.setEmulatedMedia`.

**Conventions.** Gestures are `Input.dispatchMouseEvent`
/ `Input.dispatchKeyEvent` — the compositor path, which
is what reproduces pointer-capture click retargeting.
Waits are conditions on DOM state (`pollUntil` over
`evaluateJson`), never sleeps; every wait has a timeout.
Assertions read DOM and computed style through
`Runtime.evaluate`; wire assertions read `Network`
events on the session. A test asserts a covenant, not a
TEST-PLAN case number; the index (§4) maps cases to
tests.

**Runner.** `./test-browser` refuses without Chrome
(`CHROME` or the macOS default), bundles to `$TMPDIR`,
exports `FUSION_ANGLE_STATIC_ROOT`, runs
`node --strip-types --import ./tests/hmac-test-key.ts
--test --test-concurrency=1 tests/browser/*.test.ts`,
and removes the bundle on exit. `./test` keeps its
non-recursive glob (`tests/browser/` is excluded the way
`tests/tz/` is). `./crank` runs it after
`./test-postgres`. `./validate` does not.

**First test, and the fix.** `tests/browser/
list-reorder.test.ts`: a compositor drag on a project
card's `.drag-handle` reorders the list, persists across
reload, and leaves `location` on the list; a plain click
on the handle does not navigate. Red today. The fix is
in the module that owns the capture: `drag-reorder.ts`
sets a one-shot flag on `pointerup` of an active drag
and a capture-phase `click` listener on the container
consumes exactly one click (`preventDefault`,
`stopImmediatePropagation`); `pointerdown` clears the
flag so a click that never arrives cannot eat a later
one. All five reorderable lists inherit it.

**Initial suite** (the residue only a browser can see):

| File | Covenants |
|---|---|
| `sign-in` | the auth page signs the seeded admin in over the loopback origin; a wrong password stays with the inline error |
| `list-reorder` | pointer-capture reorder; no click-through; keyboard reorder |
| `canvas-gestures` | port drag adds node + auto-edge; shift-connect commits an edge and hides the ghost; body drag moves; marquee selects |
| `canvas-pan` | Space toggles `flow-pan-cursor`; second Space clears; drag pans `viewBox`; Space under Auto-Fit toasts |
| `canvas-keyboard` | Tab from the SVG enters the ring; `aria-current`; Enter opens the panel |
| `sidebar` | collapse and expand transition width 16rem ↔ 4rem, labels hide and return |
| `toasts` | close detaches inside the fade; auto-dismiss; newest first; cap five |
| `viewport` | ≤767px hides the desktop sidebar and shows the drawer |
| `reduced-motion` | emulated `prefers-reduced-motion` neutralizes the page transition |
| `two-jars` | two contexts, two identities, one origin; sign-out in one does not touch the other until its next mint |

Everything else in the old plan is Tier 0 / Tier 1 or
exploratory.

### 4. Tier 3 — exploration, and TEST-PLAN.md

TEST-PLAN.md is rewritten as the **index of covenants**:
one line per case — id, the covenant in a phrase, and
its pin: `tests/<file>.test.ts` (Tier 0/1),
`tests/browser/<file>.test.ts` (Tier 2), or
`exploratory`. Drive notes, alias tables, hunter
prompts, credential maps, the parallel DAG, the
per-section `tenant / parallel / global_lock / depends`
fields, and the summary arithmetic are removed; the
knowledge that was product-true moved into Tier 2 test
code, and the rest was harness.

The **exploration protocol** replaces the parallel
protocol: one explorer, serial, one visible tab, the
`--mock-data` origin from `./crank`; the explorer reads
the index and drives what is marked exploratory or what
the operator names; a finding is recorded as a stub with
`Reproduced by` (§0). The stub template keeps its
fields and gains that one. Sub-agent hunters are not a
gate and never run in parallel against one Chrome.

### 5. Retire the parallel apparatus

- `api/test-plan-slices.ts` (3,833 lines) and its
  twelve `tests/slices-*.test.ts` /
  `tests/test-plan-slices.test.ts` pins are deleted.
  `tests/api-authentication-token.test.ts` re-bases its
  fixture on the mock seed; `tests/pg-seed.test.ts`
  drops the slice mode cases;
  `tests/api-transition-legacy-cut.test.ts` drops the
  named exception.
- `--test-plan-slices` leaves `postgres-seed`, `crank`,
  `server/seed.ts` (mode, reveal formatter), and
  `server/postgres-seed.ts`. `crank` becomes
  `--mock-data|--bootstrap port`.
- TODO.md item 5 leaves the critical path (this spec is
  its ship); items 6–12 renumber and the Sequencing
  lines follow. Item 9's slice-seeder bullets die with
  the module.

### 6. Documents

AGENTS.md: the command list (`build-lib` is not a
command; `test-browser` is; `crank` and `postgres-seed`
lose the slice flag), Gates (`./test-browser` needs
Chrome; `./crank` runs it), the router row for
TEST-PLAN.md ("index of covenants, exploration"), and
the Subagents section's hunter language. README.md's
table row. AUDIT.md's three TEST-PLAN sentences.
SCHEMA.md line 94. TODO.md as in §5.

## File structure

| File | Responsibility |
|---|---|
| `web-app/app/cdp-client.ts` | CDP transport, Chrome launch, waits |
| `web-app/app/browser-drive.ts` | UI login, page-ready |
| `web-app/app/measure.ts` | consumes both; unchanged ceremony |
| `web-app/app/tsconfig.json` | excludes the two new Node-only modules |
| `build-lib` | `bundle_client DEST` |
| `build` | sources `build-lib`; clean gate, `server.mjs`, ZIP |
| `test-browser` | Chrome gate, bundle, run `tests/browser/` |
| `crank` | runs `./test-browser`; loses the slice flag |
| `validate` | lints `build-lib`, `test-browser` |
| `tests/browser/fixtures.ts` | origin, Chrome, contexts, login, input |
| `tests/browser/*.test.ts` | the initial suite (§3) |
| `tests/browser-globals.ts` | the one stub preamble |
| `tests/http-fixtures.ts` | `TEST_OPERATION_ID` scoped to below-gate use |
| `tests/*.test.ts` | `req()` helpers mint fresh ids; preambles import the globals |
| `web-app/app/drag-reorder.ts` | one-shot click suppression after a captured drag |
| `TEST-PLAN.md` | index of covenants; exploration protocol; stub template |
| `AGENTS.md`, `README.md`, `AUDIT.md`, `SCHEMA.md`, `TODO.md` | §6 |
| deleted | `api/test-plan-slices.ts`, `tests/slices-*.test.ts`, `tests/test-plan-slices.test.ts` |

## Success criteria

- `./validate` green after every commit; `./test-browser`
  green at the end of the pass on this machine.
- `tests/browser/list-reorder.test.ts` is red before the
  `drag-reorder.ts` change and green after; no list
  navigates on drag release or handle click.
- Every `req()` helper mints fresh ids; every
  deliberate replay names its id; any false green
  revealed is fixed in code and recorded in the plan.
- No `tests/*.test.ts` assigns `globalThis.document`,
  `window`, or `localStorage` itself.
- `./measure --help` runs; `measure.ts` imports the
  two new modules and defines no CDP transport of its
  own.
- TEST-PLAN.md: every case line carries a pin or
  `exploratory`; no drive notes; no alias table; no
  hunter prompt. `grep -c '\.localhost' TEST-PLAN.md`
  is 0 — no per-hunter alias survives.
- `api/test-plan-slices.ts` is gone; `./crank --help`
  and `./postgres-seed --help` show two seed modes.
- TODO.md's critical path has eleven items and the
  Sequencing lines resolve.

## Risks

- **Headless input fidelity.** `--headless=new` runs the
  full renderer; `Input.dispatchMouseEvent` follows the
  compositor path. If a gesture proves undriveable
  headless, the test records why and the case stays
  `exploratory` — the product is not changed to suit
  the driver.
- **Secure cookie on loopback.** `./measure` logs into
  `http://127.0.0.1` today; if a Chrome update refuses,
  the fixture switches to `http://localhost`.
- **Fresh ids reveal false greens.** Intended. Each is a
  finding; none is silenced by pinning an id.
- **The index mapping is judgment.** Each case's pin is
  cited by test name, spot-checked against the test's
  assertions, and a case with no honest pin is marked
  `exploratory` rather than pointed at a neighbor.

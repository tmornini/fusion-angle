# Fusion Angle — Test Plan

> **Encoding:** `- [ ]` = pending (not yet executed). Run outcomes are recorded as words in the Summary (PASS / FAIL / BLOCKED / DEFERRED / DRIFT), not by flipping the checkbox. Optional inline annotation: `- [FAIL]` with a note for a failed case.

## The walk

Three layers verify this product. Two are gates. The third
is exploration, and nothing rides on its result.

| Layer | Command | Runs | Standing |
|---|---|---|---|
| 1 | `./validate` | AT1–AT3: the one `deno check`, `./test` in two TZ passes, the lints, the two drift gates. Chrome-free, Postgres-free | Gate: every commit |
| 2 | `./test-all` | Layer 1, then `./test-browser` (AT5) | Gate: the operator's, before `./build`, a deploy, or a walk; `./crank` enforces it for the walk |
| 3 | "run the test plan" | `./crank --mock-data 8080` — Layer 1, AT4 `./test-postgres`, AT5 — then one explorer walks A4 through SV | Exploration; nothing rides on its result |

**A browser observation changes product only through a red
test at Layer 1 or Layer 2.** The walk finds; the test
proves. A product commit may cite a mitigation stub only
when that stub's `Reproduced by` names a red test. The
ruling is not evidence; the red test is.

### Invocation

Use a fresh local Postgres via Docker. Do not set
`POSTGRES_URL`, `JWT_HMAC_SIGNING_KEY`, or
`HTTP_SERVER_PORT` by hand — `./crank` mints them for its
children and never prints them.

The walk runs in the checkout under test. If another
checkout holds 8080, crank on a free port; every
`localhost:8080` below reads as that port.

The browser layer is the **browser-use** plugin (MCP
`browser-use`, or CLI `browser-use`). If that plugin is not
connected and the CLI is not on PATH, **refuse the run.** Do
not fall back to Claude-in-Chrome, chrome-devtools MCP, or
source-only workarounds. Canvas gestures, the CSS viewport,
skeletons, reduced-motion, and the two-jar SV cases need a
compositor mouse and a real CSS viewport.

One macOS approval sheet appears per browser-use daemon
connection. Answer it, or run `browser-use mac-approve`
first. A 45-second silence fails the walk before it starts,
not mid-walk.

### The master's steps

1. **A1** `./build` from a clean tree, then **A2** inventory
   the artifact.
2. **A3** `./crank --mock-data 8080`. Crank runs Layer 1,
   `./test-postgres` (AT4), and `./test-browser` (AT5)
   before it serves. Red anywhere aborts the walk — no
   explorer is dispatched. Read the seed reveal from stdout;
   it is shown once. A3 **is** SV1.
3. Dispatch one explorer with the prompt below. A1–A3
   are the master's — they run before the origin exists;
   A4 onward are the explorer's.
4. Receive one line per case. Write the summary
   (`## Summary Format`) and one stub per FAIL cluster.
5. Run **K8** (wipe and reseed — the explorer has returned),
   then **J1–J3**.

The master does not drive the product and does not patch.

### The explorer prompt

Copy this verbatim, substituting the seed reveal's sign-ins.

```
Go to Medium Church!

Then read AGENTS.md at
/Users/tmornini/code/fusion-angle/AGENTS.md in full.

You are the explorer for the Fusion Angle TEST-PLAN walk.

Origin: http://localhost:8080
Admin: {admin_username} / {admin_password}
{the seed reveal's other sign-ins}

Read TEST-PLAN.md from `## The walk` to the end. Every
case from **A4** through the end of `## SV` is yours, in
document order. A1–A3 are the master's. Skip K8
(the master runs it after you return) and J (the
master's teardown).

Refuse if browser-use is not available. Do not fall back
to Claude-in-Chrome or chrome-devtools MCP.

Setup, once: clear this origin's cookies with
`Storage.clearDataForOrigin` (`storageTypes: 'cookies'`);
set `Emulation.setDeviceMetricsOverride` to 1280×800 with
`deviceScaleFactor: 1` (I10–I15 set ≤767 and restore);
open one tab and `activate_tab` it. That tab stays
visible for the whole walk. Leave Chrome out of
fullscreen: `Browser.getWindowForTarget` then
`Browser.setWindowBounds` with `windowState`
"normal" and `top` at least 80 so the page sits
below the macOS menu bar. A focusing click at the
top-left of a fullscreen or flush window is the
Apple menu; the next click opens About This Mac.
Open a second tab of the same context only where a
same-jar case needs one (SV8, SV8b, SV9); open a
second browser context — a separate cookie jar —
where a case needs a second identity (SV6, SV7,
SV10), recording BLOCKED with the reason named if
the driver offers no multi-context support; activate
whichever tab you are driving; confirm
`document.visibilityState === 'visible'` before
every gesture and every timing assertion.

Drive with compositor mouse and CDP key events. Never
`js()` fetch the API — the bearer is memory-only; read
the network log. Sign-ins are throttled to 5 per 60 s
per client: pace them, and a 429 inside that window is
the product working, not a FAIL.

Do not patch. Do not re-seed. Do not retry the plan.

Return one line per case:
ID PASS|FAIL|BLOCKED|DEFERRED|DRIFT — one-line note.
```

### Driving notes

These are product-true. A case that needs one names it; do
not repeat the note in every case.

- The canvas `<svg>` is replaced on every commit — query it
  fresh before each gesture.
- There is no `dblclick` listener: send two pointerdowns on
  one element id inside `DBLCLICK_MS` (400).
- Chords carry the browser's `key`; Shift uppercases it.
- `.focus()` selects the way Tab does; `.click()` selects
  nothing.
- F56: no canvas click before Space.
- List-row drags are pointer capture on `.drag-handle`.
- Probe for the skeleton before fetches settle.
- Reduced motion is `Emulation.setEmulatedMedia`.
- Downloads are intercepted at `URL.createObjectURL`;
  uploads are built with `DataTransfer`.
- List pages wait on the card count — never screenshot
  early.
- Authentication is throttled to five hits per 60 seconds
  per client, counting `authorize` and `token` together.
- The first click after a reload only focuses the window
  (TODO.md). The focusing click is the viewport center,
  never the top-left brand — that is the Apple menu when
  Chrome is fullscreen or flush with the menu bar, and
  the next click opens About This Mac. Then click the
  intended control once.
- Shift-drag (AA32/F19): if the compositor does not
  deliver Shift on pointer-up, the FSM emits add-node
  instead of add-edge. Record BLOCKED naming that; do
  not FAIL. Layer 1 and Layer 2 pins decide add-edge.
- B21: the access JWT is memory-only. There is no
  public `putSessionToken` on the production bundle.
  If the in-memory token cannot be replaced without
  `js()` of the API, record BLOCKED. The Layer 1 pin
  decides cookie refresh.
- WB16: snapshot Performance *before* inbox
  navigation. A transition POST dropped by navigation
  is BLOCKED, not FAIL. The Layer 1 pins decide the
  instance-shape body and If-Match.
- Canvas `viewBox`: read `svg.getAttribute('viewBox')`,
  never `clientWidth` / `clientHeight`. 1102×549 is the
  wrap's pixel size, not a camera value.
- F29 empty-canvas click: close the properties panel
  first. An open panel's close restores the F14 saved
  viewBox — that is not this case.

### Scoring

| Outcome | Meaning |
|---|---|
| PASS | the PASS line was observed |
| FAIL | the PASS line could not be observed as driven — a finding, not a verdict |
| BLOCKED | a step could not be performed for a named reason outside the product (driver or environment); the reason is the note |
| DEFERRED | a prerequisite case did not produce what this case needs |
| DRIFT | passes in substance; the document or the UI text disagrees — the document changes |

Nothing blocks on any outcome. BLOCKED is allowed for a
driver limit: with no gate riding on the walk, an honest
BLOCKED costs nothing and a dishonest FAIL costs a day. A
durable limit earns the case a one-line driving note, added
by the master.

## Summary

| Section | Tests |
|---|--:|
| AT. Automated Test Suite | 5 |
| A. Build & Setup | 5 |
| AA. Data Entry Workflow | 46 |
| B. Entry Pages | 31 |
| C. Core: Dashboard | 7 |
| D. Core: Ideas Workflow | 38 |
| E. Core: Projects | 12 |
| F. Tools | 80 |
| F2. Workbox | 31 |
| FS. Flow Statistics | 9 |
| G. Admin Pages | 38 |
| H. Reference & System | 2 |
| I. Cross-Cutting Concerns | 30 |
| K. Objectives & Scoring | 30 |
| R. Records | 25 |
| J. Teardown | 3 |
| SV. Server (Deno + Postgres) | 9 |
| **Total** | **401** |

A3 **is** SV1 — counted once, in A. The explorer
skips SV1. F is 80 (F1–F75 plus F37a, F37b, F38a,
F38b, F57a).

### Combined Totals (CLI + Browser)

The per-section table above counts 401 distinct
TEST-PLAN cases (A3 is SV1; not counted twice). The
CLI count is the most recent `./validate` (AT2)
report — the main `tests/*.test.ts` suite plus the
`tests/tz/*.test.ts` timezone suite; AT2 without
`POSTGRES_URL` skips the seven `pg-*.test.ts` /
`schema-lifecycle.test.ts` stubs, and after AT4 those
seven run. The number grows as tests land in either
glob and is not pinned here. Update the case count
when a case is added or removed.

The five outcomes are defined once, in `## The walk`'s
`### Scoring`. `pending` is the sixth and is not an
outcome: it is the default `- [ ]`, not yet executed.

---

## AT. Automated Test Suite

AT1–AT3 are Layer 1, the one `./validate` crank runs
first. AT5 is Layer 2's browser suite. AT4 is crank's
`./test-postgres`, run after postgres is up. Layer 3
runs all five through `./crank`; the walk never invokes
them separately. Abort on any AT red.

- [ ] **AT1** Run `deno check --frozen api shared server
  tests web-app`. PASS: exits 0; no diagnostics emitted.
  Pin: exploratory — the command is its own witness
- [ ] **AT2** Run `./test` (delegates to `TZ=UTC deno test --frozen --parallel --no-check --sanitize-ops --sanitize-resources tests/*.test.ts` for the main `Deno.test` suite, written against `@std/assert`, then `TZ=Pacific/Honolulu deno test --frozen --parallel --no-check --sanitize-ops --sanitize-resources tests/tz/*.test.ts` for the timezone suite; both carry the named permissions and three preloads — the HMAC key, the `localStorage` stub, the `sessionStorage` stub). PASS: exits 0; both suites report `ok | N passed | 0 failed`, today `ok | 3489 passed | 0 failed | 7 ignored` for the main suite and `ok | 8 passed | 0 failed` for the timezone suite.
  Pin: exploratory — the command is its own witness
- [ ] **AT3** Run `./validate`. PASS: exits 0 (composes AT1's `deno check --frozen api shared server tests web-app` and AT2 plus the 78-char awk lint over `api/`, `web-app/`, `tests/`, `shared/`, `server/` `*.ts|html|css` with `compose.ts` exempt, and the root scripts `build`, `serve`, `crank`, `test`, `test-postgres`, `validate`, `generate-schema-svg`, `generate-api-documentation`, `measure`, `postgres-wipe`, `postgres-lib`, and `postgres-seed`, plus `deno.json`; the org-abbreviation identifier lint over `api/`, `web-app/`, `tests/`, `shared/` `*.ts|html|css` with `compose.ts` exempt — reject `org` camel/Pascal/ORG_ identifier forms in favor of `organization`; then the `generate-schema-svg --check` SCHEMA.svg-drift gate; then the `generate-api-documentation --check` API.svg/room-drift gate). Any long-line violation prints `FILE:LINE: N chars` to stderr and fails the script; any org-abbreviation hit prints `FILE:LINE:` and fails.
  Pin: exploratory — the command is its own witness
- [ ] **AT4** Crank sets `POSTGRES_URL` and
  runs `./test-postgres` after postgres is
  up and before `./build --no-zip`. The
  suite creates and drops its own
  `fusion_test_*` schema. PASS: exits 0,
  `ok | 52 passed | 0 failed` across the
  seven files. `./validate` stays
  Postgres-free.
  Pin: exploratory — the command is its own witness
- [ ] **AT5** Crank runs `./test-browser` after AT4 and
  before `./build --no-zip`. It bundles the client with
  `deno bundle` into `$TMPDIR` and runs `TZ=UTC deno
  test --frozen --no-check --sanitize-resources
  --allow-env --allow-read --allow-write --allow-net
  --allow-run --preload ./tests/hmac-test-key.ts
  --preload ./tests/local-storage-stub.ts
  tests/browser/*.test.ts`, `Deno.test` suites against
  `@std/assert`, serially against an in-process origin
  on the memory backend, one Chrome browser context per
  test. The ops sanitizer stays off: `useBrowser()` opens
  one CDP WebSocket per file in `Deno.test.beforeAll`,
  so its pending receive always crosses a test boundary.
  Needs Chrome (`CHROME` or `CHROME_DEBUG_URL`). PASS:
  exits 0, `fail 0`. `./test-all` runs AT1–AT3 then AT5.
  Pin: exploratory — the command is its own witness

---

## A. Build & Setup

- [ ] **A1** Run `./build` from a clean working directory. PASS: exits 0, prints no errors, creates `~/Desktop/fusion-angle-${SHA}.zip`.
  Pin: exploratory — the exit code and the ZIP
       file appearing on disk
- [ ] **A2** Unzip the A1 ZIP (or run `./build --no-zip /tmp/fusion-test/`). PASS: the temp dir contains the `fusion-angle` executable and `site/` with `assets/app.js`, `assets/styles.css`, `assets/` (*.woff2 fonts), 18 page directories (`api-documentation`, `auth`, `billing`, `dashboard`, `design-system`, `flows`, `ideas`, `identities`, `identity-providers`, `identity-tokens`, `invitations`, `landing`, `members`, `not-found`, `organization`, `projects`, `records`, `workbox`) with 29 HTML page files (including `api-documentation/index.html`, `flows/stats.html`, `records/detail.html`, `identities/index.html`, `identities/detail.html`, `identity-providers/index.html`, `identity-tokens/index.html`, and `invitations/index.html`), plus root `index.html`. Verb/status rooms under `api-documentation/` are generated, not PAGE_REGISTRY pages — do not count them as the 29.
  The 29 are the `PAGE_REGISTRY` HTML files; do
  **not** count root `index.html` inside the 29
  (it stays the separate "plus root `index.html`");
  do **not** count verb/status rooms.
  Pin: tests/page-registry.test.ts 'PAGE_REGISTRY is 29
       HTML page files including the api-documentation
       index'; exploratory — that a real `./build` run
       actually emits those 29 files (the eight named
       above included) into `site/`, the 18
       directories, the `fusion-angle` executable,
       `site/assets/app.js`, `site/assets/styles.css`,
       the fonts, and the generated verb/status rooms
- [ ] **A3** `./crank --mock-data 8080`. Crank
  validates, mints secrets, starts postgres
  only, runs `./test-postgres`, `./build
  --no-zip` into a temp dir, wipes, seeds, and
  listens. Empty is the wipe step, not a human
  prerequisite. Secrets never print (seed's
  one-shot stdout is the only reveal). PASS:
  process listens; seed stdout prints `Save
  your demo sign-ins — shown once; copy them
  now.` plus one `username<TAB>password` line
  per seeded human (including
  `demo@example.com` and
  `sarah.chen@company.com`); listen stdout has
  no passwords; seed does not travel over
  HTTP. A3 is SV1.
  Pin: tests/pg-seed.test.ts 'mock-data seed
       prints every human sign-in'; exploratory
       — the live process listening, the
       stdout/HTTP boundary, and that
       `demo@example.com` and
       `sarah.chen@company.com` are specifically
       among the 11 printed lines (the test
       counts lines, not names)
- [ ] **A4** Open `http://localhost:8080/` in the test browser with site data deleted and no `refresh_token` cookie. PASS: unsigned root hops to `landing/index.html` (one hop from the blank root document). Does not open `auth/` and does not open `snapshots/`. Landing remains the public marketing page; it is now also the unsigned root target.
  Pin: tests/apex-destination.test.ts 'a dead session
       hops to landing'; tests/root-redirect.test.ts
       'apex hops via the destination helper';
       exploratory — the live single-hop navigation
- [ ] **A5** Open DevTools Console on that load. PASS: no 501; no JSON parse crash. An anonymous `POST /api/authentication/token` refresh 401 is acceptable.
  Pin: tests/apex-destination.test.ts
       'probeRefreshSession treats 401 as unsigned';
       exploratory — the DevTools console shows no
       501 or uncaught error

---

## AA. Data Entry Workflow

Sign in as `demo@example.com` (Tony Stark), the seed
reveal's admin credential. Stark Industries is the
active organization throughout — AA never switches to
the second organization.

- [ ] **AA3** Verify bootstrap data exists: user "Tony
  Stark", organization "Stark Industries" (domain
  `acmecorp.com`). `OrganizationEntity` has no plan
  field — its quota fields are `seats`,
  `projects_limit`, `ideas_limit`.
  Pin: exploratory — the live sign-in and the rendered
       organization name/domain

### AA2. Create Members

- [ ] **AA4** Navigate to Members (sidebar). Click "+
  Add Member". PASS: dialog opens with a Kind toggle
  (Human / AI, Human selected by default), a Human form
  below showing Name, Email, Title, Department, Phone,
  Bio, and an AI form (hidden by default) with Name, a
  Model pulldown (grouped by provider, no default
  selection), Description, and a Skill Focus textarea —
  no Auth Token field or security warning.
  Pin: exploratory — the live dialog affordance
       (`bindAddMemberDialog` in
       web-app/members/index.ts carries no CLI or
       browser test)
- [ ] **AA5** Sarah Chen (`sarah.chen@company.com`,
  Title: Project Lead, Department: Operations) is
  already seated on Stark — do not Create her again; a
  second "Sarah Chen" would leave two same-named rows
  for every later section to trip over. Instead, with
  Human selected, fill the form for a new person, e.g.
  "Jordan Rivera" (`jordan.rivera@company.com`, Title:
  QA Lead, Department: Quality), and click Create.
  PASS: toast confirms creation; the person writes as
  `PUT /identities/:id` plus PII and a seat at Stark
  Industries (`PUT
  organizations/:id/members/:identity-id`) and appears
  in the seat-derived roster alongside Sarah Chen.
  Pin: tests/adapters-members.test.ts
       'postHumanMemberCreation persists identity PII
       and a seat' (decides the identity + PII + seat
       write this Create triggers); exploratory — the
       live toast and roster append
- [ ] **AA6** The mock seed already holds all 10
  humans — Sarah Chen, Mike Thompson, Jessica Park,
  David Martinez, Emily Rodriguez, Alex Kim, Marcus
  Johnson, David Kim, Lisa Wang, James Miller. Do not
  Create any of them. PASS: Stark Members shows the six
  seated there (Sarah Chen, Jessica Park, Emily
  Rodriguez, Marcus Johnson, Lisa Wang, plus Tony Stark
  from AA3) alongside Jordan Rivera from AA5; the other
  five sit on the second organization, out of view — do
  not switch there to check them.
  Pin: exploratory — the live seat-derived roster
       membership (no test pins the 10-human /
       6-on-Stark split as a single assertion)
- [ ] **AA7** Reload the Members page. PASS: the roster
  is seat-derived — the seeded humans and Jordan Rivera
  (AA5) all re-render with their seats.
  Pin: exploratory — the live post-reload re-render
- [ ] **AA7a** Click "+ Add Member", switch the Kind
  toggle to AI. PASS: the Human form hides and the AI
  form appears; the AIs group already holds Claude Opus
  4.8, Claude Sonnet 4.6, GPT-5.5, and Grok 4.3 (agents
  are global, not seated) — do not Create any of them.
  Fill Name "Ops Assistant", pick Model "Claude Haiku
  4.5", fill Description and Skill Focus. PASS: Create
  is blocked until a Model is chosen; once chosen, click
  Create → toast confirms and the AI is written as a
  message-plane AI agent document (`PUT
  /ai-agents/:id`); it appears in the AIs group beside
  the four seeded agents.
  Pin: tests/adapters-ai-members.test.ts
       'postAIMemberCreation writes PUT /ai-agents/:id'
       (decides the AI-agent write this Create
       triggers); exploratory — the live Kind toggle,
       the disabled-until-Model-chosen gate, and the
       AIs-group append

### AA3. Member Detail & Organization

- [ ] **AA8** On Members, click the current user's
  (Tony Stark's) row. PASS: navigates to
  `member-detail` for that human. Read mode shows
  avatar, name, title • department subtitle, Personal
  Information card (Name, Email, Phone, Title,
  Department, Bio), Working Styles card, and Strengths
  card.
  Pin: tests/presenter-member-detail.test.ts
       'HumanMemberDetailPresenter renders the name,
       title, department, and personal-info card'
       (decides the read-mode card renders name, title,
       department, email, and a strength);
       exploratory — the live avatar and Working
       Styles card
- [ ] **AA8a** From the Members list, click a seeded AI
  member's row (e.g. Claude Sonnet 4.6). PASS:
  navigates to `member-detail` for that AI. Read mode
  shows the AI identity card (Name, Model as "{name} —
  {provider}", Description) and a Skill Focus row;
  there is no Auth Token row.
  Pin: tests/presenter-member-detail.test.ts
       'AIMemberDetailPresenter renders the model name,
       provider, and skill focus' (decides the Skill
       Focus text and the Model row's provider half
       render, and confirms no "Auth Token" text
       appears; the fixture's AI member name is
       'Claude Opus 4.8', identical to
       `firstProviderModel().name`, so this same
       assertion's model-NAME half passes from the
       identity's own Name heading alone and decides
       nothing about the Model row's name);
       exploratory — the live Name heading and
       Description text
- [ ] **AA9** Open the current user's own detail — the
  seeded admin, who carries three strengths (Strategic
  Planning, Data Analysis, Stakeholder Management);
  never an AA5/AA7a-added member, which starts with
  none. Click Edit, change Phone and Bio, toggle Data
  Analysis off and Agile Methods on (`.strength-chip`
  buttons with `data-strength`, toggled by click — not
  checkboxes), click Save. PASS: toast "Member saved"
  appears and the page returns to read mode showing the
  edits — no navigation. Read mode renders
  `#member-strengths .pill-tag-strength` spans (three,
  with no `data-strength`); `.strength-chip` is
  edit-only. Reload the page. PASS: edited Phone, Bio,
  and the three strengths persist.
  Pin: tests/api-human-members.test.ts 'a strengths PUT
       replaces the list — the toggled-on id persists'
       (decides that toggling Data Analysis off and
       Agile Methods on in one save leaves exactly
       [Strategic Planning, Stakeholder Management,
       Agile Methods] on the next GET); exploratory —
       the live toast, read-mode return, the Phone/Bio
       edit (a separate `PUT identities/:id/pii` this
       test never calls), and reload persistence
- [ ] **AA9a** From "Ops Assistant" (AA7a)'s member
  detail, click Edit, change Description and Skill
  Focus, and pick a different Model from the pulldown
  (grouped by provider, current model pre-selected),
  click Save. PASS: toast "AI member saved" fires and
  the page returns to read mode showing the edits — no
  navigation. Reload; the edited Description, Skill
  Focus, and Model persist. There is no Auth Token
  field.
  Pin: tests/adapters-ai-members.test.ts 'putAIMember
       updates the agent document' (decides a Skill
       Focus edit persists via a fresh read; the
       fixture's description is `''` before and after,
       so this same call decides nothing about
       Description, and Model is not asserted here
       either); exploratory — the live toast, read-mode
       return, the Description and Model edits, and
       reload persistence
- [ ] **AA10** Navigate to Organization. Click the
  page-level Edit button (a single button at the page
  header, not per-card), change Domain (e.g.
  `acmecorp.io`), click Save. PASS: success toast
  "Organization saved" appears.
  Pin: tests/presenter-projects-organization.test.ts
       'OrganizationPresenter.buildPage renders the org
       name, domain, and an Edit action' (decides the
       read view's Edit affordance,
       `data-org-action="edit"`);
       tests/presenter-projects-organization.test.ts
       'OrganizationEditPresenter.buildPage renders
       editable name/domain inputs and Save/Cancel
       actions' (decides the edit form's domain input,
       `data-org-field="domain"`, and Save action);
       tests/adapters-organizations.test.ts
       'putOrganization then getOrganization
       round-trips' (decides the write persists via a
       fresh read); exploratory — the live toast
- [ ] **AA11** Navigate away, return to Organization.
  PASS: edited Domain persists with saved value, card
  is back in read mode.
  Pin: tests/adapters-organizations.test.ts
       'putOrganization then getOrganization
       round-trips'; exploratory — the live
       navigate-away/return read-mode render
- [ ] **AA-Obj** On the Organization page, locate the
  Objectives box. Four active objectives already sit in
  position order — "Lower expenses", "Increase
  incomes", "Raise customer NPS", "Improve employee
  morale". Do not Add — a fifth would put K1's "4
  seeded active objectives" premise (K runs later in
  this same walk) out of true. PASS: all four appear in
  the active list in that order.
  Pin: tests/mock-data-objectives.test.ts 'seeds every
       objective seed plus the org-2 objective' (pins
       the seeded count at exactly
       `OBJECTIVE_SEEDS.length`, 4);
       tests/presenter-organization-objectives.test.ts
       'renders active section with each active
       objective' (renders each objective's name and
       id); exploratory — the live position-ordered
       placement

### AA4. Create Ideas

- [ ] **AA12** Navigate to Ideas. Open the seeded
  "AI-Powered Customer Segmentation" — do not Create a
  duplicate; all 11 mock idea titles already exist (6
  on Stark, 5 on the second organization). PASS: the
  idea is on the list.
  Pin: exploratory — the live list render (no test
       pins a single named idea's presence on the
       rendered list)
- [ ] **AA13** On that idea's detail page, click
  "Edit". Verify title and text fields (problem,
  solution, outcome) are editable. Change the Proposed
  Solution text, click "Save". PASS: toast confirms
  save, all fields persist. Reload; PASS: the edit
  survives.
  Pin: tests/adapters-ideas.test.ts 'putIdea persists
       changes' (decides a field edit persists via a
       fresh read); exploratory — the live toast, edit
       form, and reload persistence
- [ ] **AA14** Stark's Ideas list already shows its 6
  mock titles — AI-Powered Customer Segmentation,
  Predictive Maintenance System, Smart Inventory
  Optimization, AI-Powered Customer Support Chatbot,
  Sustainability Dashboard for Operations, Real-time
  Inventory Tracking System. Do not Create duplicates.
  Do not claim 11 titles on one page — the other 5 sit
  on the second organization; do not switch here to
  check them. PASS: those six titles are present.
  Pin: exploratory — the live list render (no test
       pins this exact six-title set as a single
       assertion)

### AA5. Submit Ideas for Review

- [ ] **AA15** Of Stark's six ideas, four are already
  `in_review` (AI-Powered Customer Segmentation,
  AI-Powered Customer Support Chatbot, Sustainability
  Dashboard for Operations, Real-time Inventory
  Tracking System) and two are still `active`
  (Predictive Maintenance System, Smart Inventory
  Optimization) — do not submit the four already in
  review. Navigate to Predictive Maintenance System's
  idea detail (status: active). Click "Submit for
  Review". PASS: status changes to "In Review", button
  disappears.
  Pin: tests/presenter-idea.test.ts
       'Idea.canBeSubmittedForReview gates on both
       lifecycle and readiness' (decides an `active`,
       ready idea may submit); tests/adapters-ideas.test.ts
       'postIdeaStateChange records a state event
       without changing non-lifecycle entity fields on
       GET' (decides the transition lands and other
       fields survive it); exploratory — the live
       button click and disappearance
- [ ] **AA16** Smart Inventory Optimization, Stark's
  other `active` idea, is seeded with an empty Expected
  Outcome, so it is `incomplete`: its detail page shows
  an "Incomplete" pill next to the Active badge and
  renders no Submit for Review button yet (Edit is
  still present). Click "Edit", fill in Expected
  Outcome (any non-empty text), click "Save". PASS: the
  Incomplete pill is gone and a Submit for Review
  button now appears. Click it. PASS: it transitions
  from active to in_review, button disappears.
  Pin: tests/presenter-idea.test.ts
       'IdeaPresenter.buildCard renders the Incomplete
       pill only for active ideas missing a required
       field' (decides the Incomplete pill renders for
       an `active` idea with `expected_outcome: ''` —
       Smart Inventory Optimization's exact seeded
       shape); tests/presenter-idea.test.ts
       'Idea.canBeSubmittedForReview gates on both
       lifecycle and readiness' (decides no Submit
       button renders while incomplete, and one does
       once every field, including Expected Outcome,
       is filled); tests/adapters-ideas.test.ts 'putIdea
       persists changes' (decides the Expected Outcome
       edit itself persists via a fresh read — the same
       merge-patch mechanism AA13/AA38 use on other
       fields); tests/adapters-ideas.test.ts
       'postIdeaStateChange records a state event
       without changing non-lifecycle entity fields on
       GET' (decides the transition lands and other
       fields survive it); exploratory — the live
       Incomplete pill's disappearance, the Edit form,
       and the button's appearance/disappearance
- [ ] **AA17** Navigate to Ideas list and filter by
  "In Review" status badge. PASS: the six Stark titles
  now in_review — the four originally seeded plus
  Predictive Maintenance System and Smart Inventory
  Optimization if AA15/AA16 held.
  Pin: tests/presenter-idea.test.ts
       'IdeaListPresenter.renderList in a filtered
       view keeps only matching ideas and omits the
       grip' (decides a status filter keeps only
       matching-state ideas); exploratory — the live
       badge click and the exact six-title membership

### AA7. Approve Ideas & Convert to Projects

- [ ] **AA18** On Ideas list, filter by "In Review".
  Click AI-Powered Customer Support Chatbot (already
  `in_review`, and its title never collides with an
  existing project name — unlike AI-Powered Customer
  Segmentation, Predictive Maintenance System, or Smart
  Inventory Optimization, which are already seeded
  project titles too). PASS: navigates to idea detail
  with Send Back / Approve buttons in the header next
  to Edit.
  Pin: exploratory — the live header action buttons on
       an in_review idea
- [ ] **AA19** Click "Approve". PASS: idea status
  changes to approved, confirmation shown.
  Pin: tests/adapters-ideas.test.ts
       'postIdeaStateChange records a state event
       without changing non-lifecycle entity fields on
       GET' (decides an in_review→approved transition
       lands and other fields survive it); exploratory
       — the live confirmation
- [ ] **AA20** Approve a second idea, Sustainability
  Dashboard for Operations (also already `in_review`,
  also collision-free with any project name), the same
  way. PASS: idea status changes to approved,
  confirmation shown; Stark now has two approved ideas
  if AA19 held.
  Pin: tests/adapters-ideas.test.ts
       'postIdeaStateChange records a state event
       without changing non-lifecycle entity fields on
       GET'; exploratory — the live confirmation
- [ ] **AA21** Navigate to the approved AI-Powered
  Customer Support Chatbot idea. Click "Convert". PASS:
  Convert is visible because the idea is approved;
  conversion form loads with 4 required fields (Project
  Name, Time with a "days" input suffix, Cost, Success
  Criteria) — there is no Impact field — plus a Scores
  box holding one required baseline slider per active
  objective (4, matching AA-Obj).
  Pin: tests/presenter-idea.test.ts
       'IdeaPresenter.buildCard exposes a Convert
       affordance only for approved ideas' (decides
       Convert renders for `approved` and not for other
       states); tests/presenter-idea.test.ts
       'conversionRequiredCount adds active objectives
       to the static field count' (decides the static
       4-field count off `REQUIRED_FIELDS.length`,
       independent of objectives);
       tests/presenter-idea.test.ts
       'IdeaConversionPresenter renders one baseline
       row per active objective' (decides one slider
       row per active objective); exploratory — the
       live field layout and the absence of an Impact
       field
- [ ] **AA22** Fill the 4 required fields, then drag
  only the "Lower expenses" and "Increase incomes"
  baseline sliders off their pending position — leave
  "Raise customer NPS" and "Improve employee morale"
  untouched. PASS: Create Project stays disabled (two
  objectives remain unscored).
  Pin: exploratory — the live partial drag and the
       disabled button (no test exercises 2+ active
       objectives with only some baselined; see
       Unpinned but pinnable)
- [ ] **AA22a** Inspect the Scores box: every baseline
  slider reads as pending, not zero, until dragged — a
  pending slider is dimmed (~50% opacity) with an
  em-dash "—" in muted text (unscored is genuine
  absence — no score row is written — not a measured
  0); a dragged slider shows full opacity, a signed
  value, and a green check by the label. PASS: "Raise
  customer NPS" and "Improve employee morale" (AA22's
  untouched pair) still read pending while "Lower
  expenses" and "Increase incomes" read scored. Drag
  the remaining two sliders. PASS: Create Project
  enables now that every objective is scored; click it
  — PASS: navigates to project detail for the new
  project (the baselines commit atomically with project
  creation).
  Pin: tests/presenter-idea.test.ts
       'IdeaConversionPresenter enables Create once
       every field and baseline is set' (decides
       `data-ready="true"` and "Ready to Create
       Project" render once every field and every
       objective's baseline in a multi-objective draft
       is set); tests/adapters-ideas.test.ts
       'postIdeaConversion commits project, idea, two
       state events, and N baseline rows in one atomic
       batch' (decides the project, the idea's
       `promoted` state, and both baseline scores land
       together — this case's "baselines commit
       atomically with project creation" clause);
       exploratory — the live pending/scored styling
       contrast, the drag, and the navigation to
       project detail
- [ ] **AA23** On the newly converted project (state
  `submitted`), click "Edit". Change Status to
  `under_review` and change the description, click
  "Save". PASS: both edits persist. (Impact is no
  longer a directly-editable field — it is derived
  read-only from the objective baseline scores.)
  Pin: tests/adapters-ideas.test.ts 'postIdeaConversion
       commits project, idea, two state events, and N
       baseline rows in one atomic batch' (decides a
       converted project's first state event is
       `submitted` — this case's opening premise);
       tests/adapters-projects.test.ts
       'putProjectFields merges the camel patch onto
       the stored row, keeping untouched columns'
       (decides a description edit persists via a
       fresh read); exploratory — the live
       status-select edit and Save
- [ ] **AA24** Navigate to Projects list. PASS: the
  seeded 16 projects are present, plus the project
  converted in AA22a (17 total) if that Create held.
  Pin: tests/adapters-ideas.test.ts 'postIdeaConversion
       commits project, idea, two state events, and N
       baseline rows in one atomic batch' (decides
       AA22a's conversion writes a real project row —
       not the list's exact 17-total count);
       exploratory — the live list count

### AA8. Score and Approve Projects

- [ ] **AA24a** From the Projects list, click into
  Market Sentiment Analyzer (`PIfhHMLQQxTxKFDdabXbOw`),
  the only Stark `submitted` project — not a K26
  `under_review` title (Workforce Capacity Forecasting,
  Predictive Maintenance System, Employee Training
  Assistant), and not AA22a's freshly converted
  project. Click Edit, change Status to `under_review`,
  Save. PASS: toast confirms. The objectives section's
  baseline sliders are now editable INLINE (no Score
  button, no modal) — this project was seeded
  `submitted` with no baselines. Move each baseline
  slider off its initial value and click Save; Approve
  enables only once every objective is scored. Click
  Approve; confirm. PASS: status flips to `approved`;
  the action bar re-renders with `Archive` / `View
  history`, and the per-objective actual sliders become
  editable. The project is now eligible for the New
  Flow gate in AA25. (Without approving, a project
  stays hidden behind the `Approve to add flows` info
  badge.)
  Pin: tests/adapters-project-publish.test.ts
       'postProjectApproval moves state to approved'
       (decides the write itself lands `approved`);
       tests/presenter-project-action-bar.test.ts
       'under_review with no scores: Approve disabled'
       and 'under_review with full scoring: Approve
       enabled' (decide the Approve gate: disabled
       while any objective is unscored, enabled once
       every objective is scored);
       tests/presenter-project-action-bar.test.ts
       'approved project: Archive shown' (decides the
       re-rendered bar shows Archive once approved);
       tests/presenter-project-objectives.test.ts
       'baseline sliders enabled while under_review'
       (decides the objectives section's baseline
       sliders are not disabled while under_review);
       exploratory — the live Edit-to-under_review
       step, the no-Score-button/no-modal rendering,
       View history, and the confirm dialogs

### AA9. Create Flows

- [ ] **AA25** Navigate to Projects. Click into Sales
  Pipeline Modernization (approved, seeded with the
  Lead-to-Close flow). PASS: a "Flows" section lists
  Lead-to-Close (not "No flows yet") and a "New Flow"
  button. Click into Market Sentiment Analyzer
  (approved by AA24a, no flows yet). PASS: the Flows
  section shows a "No flows yet" empty state and a "New
  Flow" button. Click into Smart Inventory Optimization
  (`sent_back`, not approved — view only, do not
  Approve or Archive it: K's audit reserves it). PASS:
  an info badge reads "Approve to add flows" in place
  of the button, and empty state reads "Flow creation
  limited to approved projects only".
  Pin: tests/presenter-projects-organization.test.ts
       'ProjectDetailPresenter renders a flow card with
       the flow name and node/edge counts' (decides the
       populated Flows section renders a flow's name
       and counts); tests/presenter-projects-organization.test.ts
       'ProjectDetailPresenter offers a New Flow button
       for approved projects and a gating message
       otherwise' (decides "New Flow" renders and
       "Approve to add flows" does not for `approved`,
       and "Approve to add flows" renders for a
       non-approved state); exploratory — the live "No
       flows yet" copy and the exact "Flow creation
       limited to..." string
- [ ] **AA26** On Market Sentiment Analyzer's detail
  page (from AA25), click "New Flow". PASS: a "New
  Flow" dialog opens with a Flow Name input and
  Create/Cancel buttons. Enter a name (e.g. "Sentiment
  Review") and click Create — AA27–AA35 need this
  flow's Create+Archive graph to drive, and minting it
  here is free (the walk's database is discarded at J).
  PASS: navigates to the flow designer page. The SVG
  canvas shows two nodes: "Create" (start, top-left
  with green border) and "Archive" (end, bottom-right
  with red 3-px border) connected by no edges. Toolbar
  shows Undo, Redo, Zoom −/+, Copy Mermaid, Export ZIP,
  and Delete (trash icon); the header above the canvas
  hosts the Locked, Auto Layout, and Auto Fit switches.
  Changes auto-save (no explicit Save button).
  Pin: tests/api-flows-create-relations.test.ts
       'postFlowCreation: message-plane graph equals
       the default graph' (decides the freshly created
       flow's graph has exactly 2 nodes and 0 edges,
       with one `isCreate` node named "Create" and one
       `isArchive` node named "Archive"); exploratory —
       the live dialog, the border colors, and the
       toolbar/header chrome
- [ ] **AA27** Drag the port circle on the start node
  into empty canvas past 20 pixels. PASS: during the
  drag a ghost "New State" card follows the cursor
  along with a faint bezier preview. On release, a new
  node appears at the drop position with a blue border,
  auto-connected from the start by an edge with a
  default name. The start node is also draggable by its
  body. Drive the port-drag with compositor mouse.
  Pin: tests/flow-operations.test.ts
       'performAddNodeAtPosition: returns node, edge,
       selectId and centers on the point' (decides the
       new node is centered on the drop point and
       auto-connected from the dragged node);
       tests/flow-fsm-scenarios.test.ts 'port drag
       far-drop emits add-node (AA27/AA31/F15)' (decides
       a far port-drag emits exactly one add-node,
       auto-connected from the dragged node, and zero
       add-edge actions); tests/flow-fsm-scenarios.test.ts
       'port drag close-drop (under 20px) emits no
       add-node (AA27 negative)' (decides the "past 20
       pixels" threshold — a close drop emits neither
       add-node nor add-edge); exploratory — the live
       ghost card, bezier preview, and blue border
- [ ] **AA28** Double-click the new blue-bordered node.
  PASS: properties panel appears with a "State
  Properties" title and close button on the right, then
  a `<fieldset>` labeled "Members" containing two
  groups — HUMANS and AIs — each with a labeled
  checkbox per member (no checkbox ticked yet), then a
  Name input, a Task Instructions textarea, an empty
  Attributes list, and an outgoing-transitions list
  (reads "None" until an edge exists). The node gets a
  gold glow selection effect on the canvas. Drive the
  double-click with compositor mouse.
  Pin: tests/flow-fsm-scenarios.test.ts 'double-click
       node opens panel; second tap within window flips
       open=true (AA28/F13)' (decides two pointerdowns
       within the dblclick window on one node emit
       exactly one open-panel action with open=true —
       that the double-click itself opens the panel);
       tests/presenter-misc.test.ts 'buildNodePanel for
       a regular node lists the member checkboxes
       grouped Humans / AIs' (decides the State
       Properties title, the Members fieldset, and the
       HUMANS/AIs group labels); tests/presenter-misc.test.ts
       'buildNodePanel renders outgoing transitions by
       name and falls back to None when empty' (decides
       the None fallback for a node with no outgoing
       edge yet); exploratory — the gold glow selection
       effect and that no checkbox is pre-ticked on a
       brand-new node
- [ ] **AA29** Edit the state name in the properties
  panel to "Data Capture". PASS: the node label updates
  on the canvas immediately (auto-saves via 800ms
  debounce).
  Pin: tests/flow-designer-actions.test.ts
       'applyUpdateNode patches matching id' (decides a
       name patch lands on the matching node);
       tests/adapters-flow-mutations.test.ts 'putFlow
       persists every FlowSaveShape field' (decides a
       flow save survives a fresh read, checked here by
       the flow's own name and node/edge counts — not a
       node's own name, which no test asserts
       post-reread; see Unpinned but pinnable);
       exploratory — the live immediate canvas-label
       update and the 800ms debounce timing
- [ ] **AA30** Double-click the edge between start and
  "Data Capture". PASS: no properties panel opens — the
  outgoing edge from Create is intentionally not
  interactive. The edge has no name label visible on
  the canvas, just a plain blue arrow.
  Pin: exploratory — no CLI or browser test exercises
       this double-click specifically
- [ ] **AA31** Drag from "Data Capture"'s port into
  empty canvas past 20 pixels to create a new middle
  node; rename it "Review" via its properties panel.
  Rename the new edge "submit". Drive the port-drag
  with compositor mouse.
  Pin: tests/flow-operations.test.ts
       'performAddNodeAtPosition: returns node, edge,
       selectId and centers on the point';
       tests/flow-fsm-scenarios.test.ts 'port drag
       far-drop emits add-node (AA27/AA31/F15)' (decides
       the same far-drop add-node/auto-connect
       mechanism for this second port-drag);
       tests/flow-designer-actions.test.ts
       'applyUpdateNode patches matching id' (decides
       the "Review" node-rename mechanics);
       tests/flow-designer-actions.test.ts
       'applyUpdateEdge patches matching id' (decides
       the "submit" edge-rename mechanics — a name
       patch lands on the matching edge only);
       exploratory — the live port-drag
- [ ] **AA32** Hold Shift and drag from "Review" onto
  "Data Capture". PASS: during the drag the preview
  redraws as a dashed-orange curved bezier because a
  forward path "Data Capture" → "Review" already
  exists, and the reachability check recognises the
  release would close a loop. Release to create the
  cycle edge; rename it "needs revision". Hold Shift
  and drag from "Review" onto "Archive". PASS: preview
  is a solid-blue curved bezier (no return path).
  Release to create the edge; rename it "approve".
  Drive the shift-drag with compositor mouse. If Shift
  is not observed (release still port-add-node),
  record BLOCKED naming that — an honest BLOCKED
  costs nothing. Do not FAIL the compositor.
  Pin: tests/flow-cycle-edges.test.ts 'a back-edge to
       an ancestor is a cycle edge' (decides
       "Review"→"Data Capture" classifies as a cycle
       edge given the existing forward path);
       tests/flow-fsm-scenarios.test.ts 'shift-drag
       from port onto different node emits add-edge
       (AA32/F19)' (decides a shift-drag onto another
       node emits exactly one add-edge and zero
       add-node actions); tests/flow-operations.test.ts
       'performAddEdge: success returns the new edge
       and persists it' (decides a forward edge, e.g.
       "Review"→"Archive", is added and persisted);
       tests/flow-designer-actions.test.ts
       'applyUpdateEdge patches matching id' (decides
       the "needs revision" and "approve" edge-rename
       mechanics); exploratory — the live
       dashed-orange vs. solid-blue preview rendering
- [ ] **AA33** In the flow header, set the "Record:"
  dropdown to "Customer Profile" (Stark's seeded record
  type, already bound to Customer Onboarding and
  Lead-to-Close). Then in the "Data Capture" properties
  panel, open the "Attributes" fieldset. Click the
  "+ Add Attribute…" dropdown. PASS: the picker lists
  available record attributes pre-defined in the bound
  Record. Select an attribute (e.g. "Company Name").
  PASS: the attribute appears in the attributes list
  with mode (Editable / Read-only) and required toggles
  plus a remove control.
  Pin: tests/adapters-flow-records.test.ts
       'putFlowRecord then getRecordForFlow round-trips
       the binding' (decides the Record: dropdown's
       binding persists); tests/flow-operations.test.ts
       'performAddAttributeRef: appends a ref to the
       single selected node' (decides the
       attribute-ref write); exploratory — the picker
       rendering and the mode/required-toggle UI only
- [ ] **AA34** Add more attributes to "Data Capture":
  select 2–3 attributes from the picker, each with a
  distinct mode (Editable / Read-only) and required
  toggle. PASS: all attributes appear in the list with
  correct mode (Editable / Read-only) and toggle state.
  Pin: tests/flow-operations.test.ts
       'performAddAttributeRef: appends a ref to the
       single selected node';
       tests/flow-designer-actions.test.ts
       'applyUpdateAttributeMode updates the one ref'
       (decides a mode toggle lands on the matching
       attribute ref); tests/flow-designer-actions.test.ts
       'applyUpdateAttributeRequired flips the flag'
       (decides a required toggle lands on the matching
       attribute ref); exploratory — the live rendering
       of distinct mode/toggle state across multiple
       attributes
- [ ] **AA35** Wait for auto-save (800ms debounce).
  Navigate away and back. PASS: all nodes, edges, and
  attributes persist.
  Pin: tests/adapters-flow-mutations.test.ts 'putFlow
       persists every FlowSaveShape field' (decides the
       node/edge counts and the edge id survive a
       save+reread — this fixture's nodes carry
       `attributes: []`, so it decides nothing about
       attribute refs); tests/flow-graph-relations.test.ts
       'an added attribute is current with its payload'
       (decides an added attribute ref's full payload —
       attributeId, mode, isRequired — is current);
       exploratory — the live 800ms debounce and the
       navigate-away/back cycle

### AA10. Verify Dashboard

- [ ] **AA36** Navigate to Dashboard. PASS: gauge cards
  (Time, Cost, Impact) render aggregated values
  computed from Stark's `approved` projects only.
  AA22a's converted project does NOT appear — AA23
  left it `under_review` and nothing later re-approves
  it; AA24a's newly approved Market Sentiment Analyzer
  does, if that held.
  Pin: tests/adapters-dashboard.test.ts
       'getDashboardGauges returns the three sibling
       gauges'; tests/adapters-dashboard.test.ts
       'getDashboardGauges sums approved projects only'
       (decides which projects feed Time/Cost —
       `approved` only, exactly why AA22a's project is
       excluded); exploratory — the live rendered
       values
- [ ] **AA37** Header stats reflect data counts (ideas,
  projects, flows). PASS: counts are ≥ Stark's seeded
  totals plus this walk's mutations — Ideas ≥ 6,
  Projects ≥ 17, Flows ≥ 5.
  Pin: tests/adapters-dashboard.test.ts
       'getDashboardStats labels Ideas, Projects,
       Flows'; tests/adapters-dashboard.test.ts
       'getDashboardStats counts seeded entities'
       (decides the three counts reflect live
       idea/project/flow rows); exploratory — the live
       floor comparison

### AA11. Edit & Verify Cycle

- [ ] **AA38** Edit the seeded "AI-Powered Customer
  Segmentation" idea (AA12/AA13's subject): change
  title. Save, navigate to ideas list, return to
  detail. PASS: changed title persists.
  Pin: tests/adapters-ideas.test.ts 'putIdea persists
       changes'; exploratory — the live
       navigate-away/return cycle
- [ ] **AA39** Edit the project converted in AA22a:
  change description. Save, navigate away, return.
  PASS: changed description persists.
  Pin: tests/adapters-projects.test.ts
       'putProjectFields merges the camel patch onto
       the stored row, keeping untouched columns';
       exploratory — the live navigate-away/return
       cycle
- [ ] **AA40** Edit flow: navigate to the "Sentiment
  Review" flow designer (AA26), rename the "Review"
  state (auto-saves). Navigate away, return. PASS:
  changed state name persists.
  Pin: tests/flow-designer-actions.test.ts
       'applyUpdateNode patches matching id' (decides a
       name patch lands on the matching node — the
       reducer mechanics behind this rename, not the
       flow's OWN name editor, which
       `applyUpdateFlowName` covers and this case never
       touches); tests/adapters-flow-mutations.test.ts
       'putFlow persists every FlowSaveShape field'
       (decides a flow save survives a fresh read,
       checked here by node/edge counts — no test
       asserts a node's own name after a save+reread;
       see Unpinned but pinnable); exploratory — the
       live navigate-away/return cycle
- [ ] **AA41** Edit human member: navigate to Jordan
  Rivera's (AA5) detail page, click Edit, change phone
  number, Save. Navigate away, return. PASS: changed
  phone persists.
  Pin: tests/members-detail-reduce.test.ts 'a changed
       field returns the full four-field patch'
       (decides an edited field produces a PII patch
       carrying the new value); exploratory — the live
       navigate-away/return cycle
- [ ] **AA42** Edit organization: click the page-level
  Edit button, change Domain in the overview card.
  Save, navigate away, return. PASS: changed Domain
  persists.
  Pin: tests/adapters-organizations.test.ts
       'putOrganization then getOrganization
       round-trips'; exploratory — the live
       navigate-away/return cycle

---

## B. Entry Pages

### Apex (`/`)

- [ ] **B0** With site data deleted and no
  `refresh_token` cookie, open `/`. PASS: lands on
  `landing/index.html` (one hop from the blank root
  document). Does not open `auth/` and does not open
  `snapshots/`.
  Pin: tests/apex-destination.test.ts 'a dead session
       hops to landing'; tests/root-redirect.test.ts
       'apex hops via the destination helper';
       exploratory — the live single-hop navigation
- [ ] **B0b** After signing in, open `/` in the same
  cookie jar. PASS: lands on `dashboard/index.html`.
  Landing (`/landing/index.html`) still stays until
  a click (B1).
  Pin: tests/apex-destination.test.ts 'a live session
       hops to dashboard'; exploratory — the live
       single-hop navigation in the same cookie jar

### Landing Page (`landing/`)

- [ ] **B1** Page renders with marketing hero content, feature sections, and call-to-action buttons, and stays. Wait ~3 seconds. PASS: still on `landing/index.html`. No hop to dashboard.
  Pin: tests/landing-stay.test.ts 'landing does not
       shove to dashboard'; exploratory — the rendered
       hero/feature/CTA content and the live
       3-second stay
- [ ] **B2** "Start Free Trial" (hero CTA) and "Get Started" (navbar CTA) are present and navigate to `auth/index.html`. PASS: buttons exist with correct target.
  Pin: exploratory — the live buttons and their
       navigation target
- [ ] **B3** "Sign In" button is present and navigates to `auth/index.html`. PASS: button exists with correct target.
  Pin: exploratory — the live button and its
       navigation target

### Auth Page (`auth/`)

> Note: the demo auto-login is RETIRED. Gated pages require the sign-in the origin's reveal provides. Cases below that "navigate to `dashboard`" assume a valid sign-in.

- [ ] **B4** Page loads in **Sign In** mode by default. PASS: title is "Welcome back", submit button reads "Sign in" with an SVG arrow icon (matching the Sign Up button's "Create account" affordance per B10).
  Pin: exploratory — the default rendered title,
       button text, and icon
- [ ] **B5** On desktop (≥1024px), left panel shows branded marketing stats (10K+ Active Users, 98% Satisfaction, 50+ Integrations). PASS: two-column layout visible.
  Pin: exploratory — the live two-column layout and
       stat copy
- [ ] **B6** Submit with empty fields. PASS: "Email is required" error appears below email input; input gets error styling.
  Pin: exploratory — the live validation;
       `validateEmail` in `web-app/auth/index.ts` is
       unexported and carries no CLI test today
- [ ] **B7** Enter `notanemail` in email, leave password empty. PASS: "Please enter a valid email address" error on email.
  Pin: exploratory — the live validation
- [ ] **B8** Enter `test@example.com`, password `123`. PASS: "Password must be at least 6 characters" error on password.
  Pin: exploratory — the live validation
- [ ] **B9** Enter the seeded admin credentials (`demo@example.com` + the password revealed at seed time), click "Sign in". PASS: button shows spinner briefly, then navigates to `dashboard/index.html`. Auto-login is retired, so an unseeded credential is rejected with "Invalid email or password.".
  Pin: tests/browser/sign-in.test.ts 'sign-in lands on
       the dashboard as the seeded admin';
       tests/browser/sign-in.test.ts 'a wrong password
       stays on auth with the inline error' (asserts a
       non-empty inline error and no navigation, not
       the literal "Invalid email or password." text);
       exploratory — the spinner and the exact
       rejection text
- [ ] **B10** Click the "Sign up" button (positioned next to the static "Don't have an account?" label — the label is not itself the toggle; the adjacent button is). PASS: switches to Sign Up mode — title changes to "Get started", "Company name (optional)" field appears, submit reads "Create account" with an SVG arrow icon (not a literal "→" character).
  Pin: exploratory — the live mode toggle
- [ ] **B11** Fill valid email + password (≥6 chars) in Sign Up mode, click the "Create account" submit control (SVG arrow icon, not a literal "→"). PASS: toast "Sign-up is coming soon — sign in with a seeded account." appears, the form flips to **Sign In** mode (title "Welcome back"), and NO navigation occurs — the demo no longer mock-establishes a session (real sign-up is SP-6 — see `TODO.md`; minting a bare mock with no refresh token would bounce on reload and could admit anyone to the seeded admin's data).
  Pin: exploratory — the live toast, mode flip, and
       absence of navigation

### Auth Validation Edge Cases

- [ ] **B12** In Sign In mode, enter valid email, valid password, then clear email and submit. PASS: email error reappears.
  Pin: exploratory — the live re-validation
- [ ] **B13** Toggle between Sign In and Sign Up modes multiple times. PASS: form resets cleanly each time, no layout glitches.
  Pin: exploratory — the live form reset and layout
- [ ] **B14** Footer shows "By continuing, you agree to our Terms of Service and Privacy Policy." PASS: text is visible.
  Pin: exploratory — the rendered footer text

### Auth Session & Redirect

- [ ] **B15** With no session (Sign out, or a profile with no `refresh_token` cookie), open `dashboard/index.html` directly. PASS: bounced to `auth/index.html?return=dashboard` (the Sign In page), not the dashboard.
  Pin: tests/auth-redirect-login.test.ts 'a gated
       page still carries return' (decides the
       `auth?return=dashboard` shape produced by
       `redirectToLogin()`, the function both
       `bootAuthGate` branches call when they
       bounce); tests/browser/two-jars.test.ts 'two
       contexts hold two identities on one origin'
       (a fresh context with no cookie navigates
       straight to `dashboard` and lands on
       `/auth/`); exploratory — that an explicit
       sign-out, not only a never-signed-in context,
       reaches the identical bounce
- [ ] **B16** From the B15 bounce, sign in with the seeded admin credentials. PASS: lands on `dashboard/index.html` — the `?return=` target, not a generic default.
  Pin: tests/page-registry.test.ts 'dashboard is gated
       and landing is public'; tests/auth-redirect-url.test.ts
       'a known gated page with no params decodes
       plainly' (proven on `members`, the same code
       path `dashboard` takes); exploratory — the live
       sign-in landing on the decoded target
- [ ] **B17** With no session, open `flows/detail.html?flowId=<id>` directly. PASS: bounced to `auth` with the flow preserved in `?return=`; after signing in, lands back on that exact flow with `flowId` intact.
  Pin: tests/auth-redirect-login.test.ts 'a gated page
       still carries return'; tests/auth-redirect-url.test.ts
       'a page with nested params round-trips the wire'
       (round-trips `flow-detail` with a `flowId`
       param intact); exploratory — the live bounce and
       the post-sign-in landing on the exact flow
- [ ] **B18** After signing in on the dashboard, reload (Cmd-R). PASS: stays authenticated on the dashboard — no bounce to `auth` (boot cookie-refreshes via `POST /api/authentication/token` with `grant_type=refresh` and `credentials: 'same-origin'`).
  Pin: tests/browser/two-jars.test.ts 'two tabs share
       the cookie; sign-out in one bounces the other'
       (a brand-new tab of the same context — no
       in-memory state, only the shared cookie —
       loads `dashboard` directly and lands
       authenticated with the painted chip:
       `bootAuthGate`'s cookie-session branch,
       live); tests/api-authentication-token.test.ts
       'refresh grant rotates from the Cookie, not
       the body' (the server side of the same grant);
       exploratory — a literal reload specifically,
       as opposed to a brand-new tab
- [ ] **B19** With no session, open each public page in turn — `landing/`, `auth/`, `not-found/`, `design-system/`. PASS: each renders normally with NO redirect to `auth`.
  Pin: tests/page-registry.test.ts 'public pages are
       auth-exempt only' (decides `landing`, `auth`,
       `not-found`, and `design-system` all carry
       `requiresAuth: false`); exploratory — the live
       render of each with no redirect
- [ ] **B20** After signing in, close the tab, then reopen `dashboard/index.html` in a new tab in the **same** cookie jar. PASS: still authenticated — no bounce (the HttpOnly `refresh_token` cookie is shared by the jar; boot cookie-refreshes).
  Pin: tests/browser/two-jars.test.ts 'two tabs share
       the cookie; sign-out in one bounces the other'
       — the same pin as SV8, which this case
       duplicates almost exactly; exploratory — the
       live open and the painted chip in tab B (same
       as SV8)
- [ ] **B21** Silent refresh: after signing in, replace the in-memory access token with an expired JWT (keep the live `refresh_token` cookie), then navigate to `members/`. PASS: the page loads with no bounce and no error card — the dead access token was cookie-refreshed transparently. The production bundle does not export `putSessionToken`; the access JWT is memory-only by design. If the token cannot be replaced without `js()` of the API, record BLOCKED naming that — an honest BLOCKED costs nothing.
  Pin: tests/adapters-refresh-mutex.test.ts 'two
       concurrent 401s cause one refresh POST' (a dead
       access token against `members` under a cookie
       session transparently refreshes and the
       original call still succeeds); exploratory —
       the live page load with no bounce or error card
- [ ] **B22** Dead refresh: clear the `refresh_token` cookie and drop the in-memory access token, then open `dashboard/`. PASS: bounced once to `auth?return=dashboard` — no retry loop, no console error storm.
  Pin: tests/adapters-refresh-mutex.test.ts
       'cookie-session recover after a failed facade
       refresh does not POST again' (exactly one
       refresh POST, then a terminal
       `UnauthorizedError` — no retry loop);
       tests/auth-redirect-login.test.ts 'a gated
       page still carries return' (decides the
       `auth?return=dashboard` bounce shape
       `redirectToLogin()` produces, the function
       `bootAuthGate` calls on a dead refresh);
       exploratory — the live single bounce and the
       absence of a console error storm

### Sidebar Sign-out

- [ ] **B23** On any gated page (e.g. dashboard), click "Sign out" in the sidebar. PASS: the `refresh_token` cookie is cleared (`Set-Cookie` `Max-Age=0`), a revocation row is recorded, and the page navigates to `auth`; pressing Back to the protected page bounces again to `auth?return=`.
  Pin: tests/api-identity-token-revocations-self.test.ts
       'logout-everywhere success clears the refresh
       cookie' (the self-revoke PUT sign-out triggers
       201s and clears `refresh_token` with
       `Max-Age=0`, `HttpOnly`, `Path`, `SameSite`);
       tests/adapters-session-logout.test.ts 'logout
       revokes this identity and clears credentials'
       (decides a revocation row lands for the
       signed-out identity); exploratory — the live
       navigation to `auth` and the Back-bounce
- [ ] **B24** Open the app in two tabs (both signed in). Click "Sign out" in tab A, then trigger a fetch in tab B (navigate within it). PASS: tab B's next request 401s against the shared revocation ledger and bounces to `auth` — eventual cross-tab convergence, no corruption.
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

### Zero-membership landing (org gate)

> Setup for B25–B29: these exercise the boot/login org gate that lands a ZERO-membership identity on its pending invitations (accepting one grants the first membership and unblocks every org-scoped route). The mock seed provides that identity: Riley Okafor, `riley.okafor@example.net` — login-capable (its `username<TAB>password` line prints on crank stdout with the other demo sign-ins), holder of ZERO membership rows, with one seeded PENDING invitation from Stark Industries. Sign in as Riley with the stdout credentials to enter the zero-membership state. Do NOT accept (or decline) the pending invitation while B25–B29 are in flight — accepting grants the first membership and breaks B26/B29 on the same pass — and leave it pending for the rest of the walk (G43, V8). `getOrganizations` is fenced to the derived membership ledger, so an identity that truly reaches no org lands here regardless of how it got there.

- [ ] **B25** From the zero-membership state, click "Sign out", then sign in again with that member's credentials. PASS: the `refresh_token` cookie is cleared (`Set-Cookie` `Max-Age=0`) — sign-out is not org-fenced; a zero-membership identity must still revoke. Lands directly on `invitations/index.html` — NOT the `?return=` target and NOT the dashboard "Something went wrong" card; no flash of the dashboard shell (the auth-page short-circuit decides before the first navigation). Sidebar renders the member chip from token claims with NO org switcher. Navigating Back after sign-out does not boot into the account.
  Pin: tests/api-identity-token-revocations-self.test.ts
       'org-less self-revoke PUT 201s and clears the
       refresh cookie' (a zero-reachable-org identity's
       self-revoke 201s, clears `refresh_token` with
       `Max-Age=0`, and records a revocation row —
       sign-out is not org-fenced); tests/session-holder.test.ts
       'an empty reachable set has none' (decides
       `sessionHasReachableOrganization()` is false for
       that identity — the auth-page predicate that
       short-circuits a fresh sign-in straight to
       `invitations` before the return target ever
       loads); exploratory — the live landing, the chip
       with no switcher, and the Back-navigation guard
- [ ] **B26** From the zero-membership state while signed in, open `dashboard/index.html` (or any org-gated page) directly and reload (Cmd-R). PASS: redirected to `invitations/index.html` by the boot org gate — no dashboard error card, no retry loop (the returning-user path, not just fresh login).
  Pin: tests/boot-organization-gate.test.ts
       'invitations page keeps an empty organization
       list' (its `resolveOrganizationGate([],
       'dashboard')` assertion — the boot gate's
       bounce-to-invitations branch); exploratory —
       the live reload and the absence of an error
       card or retry loop
- [ ] **B27** As the zero-membership identity, land on `invitations/index.html`. PASS: the page renders and STAYS — no redirect loop (the gate's self-guard exempts the invitations page); it shows the seeded pending invitation card — Stark Industries, an "Invited by Tony Stark · {date}" sub-line, a Pending state badge, and Accept / Decline buttons. Click neither — B29 still needs the zero-membership state.
  Pin: tests/boot-organization-gate.test.ts
       'invitations page keeps an empty organization
       list' (its `resolveOrganizationGate([],
       'invitations')` assertion returns the empty
       list itself, not `null` — the self-guard);
       tests/mock-data-unaffiliated-identity.test.ts
       'the invitee view carries the org name and the
       inviting admin (TEST-PLAN B27 card)' (decides
       the seeded pending row this card renders);
       tests/presenter-invitation-list.test.ts 'a
       pending invitation shows the org, inviter, and
       Accept / Decline' (decides the card's shape);
       exploratory — the live stay and the rendered
       seeded card
- [ ] **B28** Sign in as an untouched seeded member (any non-Riley credential from crank stdout, e.g. the demo admin), then load a gated page. PASS: lands on the `?return=` target / dashboard as before — the org gate does not fire for an identity that reaches an org (B16/B18 unaffected by the new gate). After PASS, sign back in as Riley for B29.
  Pin: exploratory — the live landing on the target;
       no test exercises `resolveOrganizationGate`
       with a non-empty organization list against a
       page other than `invitations`, so nothing
       today decides that the gate passes a
       non-empty-org identity through on an ordinary
       gated page like `dashboard` (the only cited
       assertion for a non-empty list uses
       `invitations` as the page, so it cannot tell
       "fires for any page" from "fires only for
       invitations" apart)
- [ ] **B29** As the zero-membership identity, open `design-system/`. PASS: renders normally with NO redirect to invitations — the org gate guards auth-gated pages; public pages degrade to the unscoped sidebar (B19). After PASS, sign back in as the demo admin before section C.
  Pin: tests/page-registry.test.ts 'public pages are
       auth-exempt only' (`design-system` carries
       `requiresAuth: false`, so `bootApp` never runs
       the org gate on it); exploratory — the live
       render with no redirect

---

## C. Core: Dashboard

- [ ] **C1** Navigate to `dashboard/`. PASS: page loads with sidebar, header, and main content area.
  Pin: tests/browser/sidebar.test.ts 'collapse and
       expand transition the sidebar width';
       tests/browser/sign-in.test.ts 'sign-in lands
       on the dashboard as the seeded admin';
       exploratory — the header and main content
       area rendering
- [ ] **C2** Sidebar shows flat navigation
  links in this order: Dashboard,
  Organization, Ideas, Projects, Records,
  Flows, Workbox, Members, Identities, Billing,
  API, Design System. PASS: all 12 links
  present, in order, and styled. Source of
  truth: `PAGE_REGISTRY` (entries with
  `inSidebarNav: true`) in
  `web-app/app/page-registry.ts`.
  (Teams, People, Roles, Crews, Company,
  Activity Feed, and Profile sidebar entries
  have been retired — the current user's
  detail is reachable via the sidebar account/
  member chip (the old header greeting that also
  linked to it has been removed); humans and AIs
  both live on the Members page.)
  Pin: exploratory — the rendered order and
       styling of the 12 links
- [ ] **C3** Header shows search bar, company
  stats as structured tiles (org name as a
  `header-stat-label`, then per-stat value +
  Ideas / Projects / Flows labels separated by
  `header-stat-divider` dividers — the counts track
  the current working data and change as you create
  or convert, so don't assert exact numbers),
  and theme toggle. PASS: elements visible and
  styled. The old "Good {morning/afternoon/
  evening}, {name}" greeting and the top-bar org
  `<select>` have both been REMOVED; the top bar
  shows neither. (The org switcher moved to the
  sidebar footer — see G36; the pending-invitations
  bell may appear at the top bar — see V3.)
  Pin: exploratory — the rendered header and the
       absence of the retired greeting and select
- [ ] **C4** Dashboard renders 4 surfaces in order: three
  visually-equivalent arc-gauge cards (Time and Cost are
  ratio arc-gauges — dual concentric semicircles: outer
  baseline track + inner actual fill; Impact is a bipolar
  arc — left/right split from a center apex; all three
  share the same card chrome) and, below the grid, an
  Objectives box one gauge column wide
  (`.objective-aggregates-card`,
  `calc((100% - 2 * var(--space-6)) / 3)`; full width
  only under 768px; card title "Objectives"). Sign in as
  the demo admin (`demo@example.com`, Tony Stark) with
  Stark Industries active — surfaces carry seeded scores,
  not zeros. PASS: all 4 render with baseline and current
  values; the Time and Cost cards each show dual
  concentric ratio arcs and the Impact card shows a
  bipolar arc; the Objectives box shows one row per
  objective, each with a small bipolar arc gauge and a
  sparkline trendline. A `—` Impact or a `data-empty` row
  is a FAIL.
  Pin: tests/adapters-dashboard.test.ts
       'getDashboardGauges returns the three sibling
       gauges'; tests/adapters-dashboard.test.ts
       'getDashboardGauges marks Time and Cost as
       ratio'; tests/adapters-dashboard.test.ts
       'getDashboardGauges marks Impact as bipolar';
       tests/presenter-dashboard-objective-aggregates.test.ts
       'renders one row per active objective';
       tests/presenter-dashboard-objective-aggregates.test.ts
       'row renders the small bipolar gauge SVG';
       tests/presenter-dashboard-objective-aggregates.test.ts
       'row renders colored segments and dots';
       tests/presenter-dashboard-objective-aggregates.test.ts
       'heading reads "Objectives"';
       tests/objectives-card-width.test.ts 'the
       Objectives card is one gauge column wide';
       tests/objectives-card-width.test.ts 'the
       Objectives card is full-width under 768px';
       exploratory — the visual order/layout of the 4
       surfaces and the painted dual-concentric and
       bipolar arcs
- [ ] **C5** Sidebar navigation links all function correctly. PASS: clicking a sidebar link navigates to the expected page.
  Pin: exploratory — each link's live navigation
- [ ] **C6** Scroll the page. PASS: sidebar stays fixed, main content scrolls independently.
  Pin: exploratory — the sidebar's fixed position
       while the main content scrolls
- [ ] **C7** Check that seed data populates all 4 dashboard
  surfaces (three arc-gauge cards + Objectives box). PASS:
  no "No data" empty states on a fresh mock-data load.
  NOTE: the mock seed now spans TWO orgs (Stark Industries + Wayne
  Enterprises; the demo admin belongs to both) and the
  dashboard is scoped to the ACTIVE org, so its header and
  gauges show that org's portion — not global totals. Counts
  are tolerant lower bounds, not equalities (the seed
  grows): for active-org Stark expect ~6 ideas, ~16
  projects, ~4 flows, 4 objectives, plus the roster (~6
  humans — 5 single-org seeded members + Tony Stark, the
  both-org admin; the System member authors seed events but
  is excluded from the roster — and ~4 AIs; AA5 and AA7a
  each add one before C runs).
  Global raw mock totals are larger (~11 ideas, ~17
  projects, ~5 flows across both orgs). A `—` Impact or a
  `data-empty` row is a FAIL.
  Pin: tests/adapters-dashboard-mock-seed.test.ts 'mock
       seed produces portfolio Impact baseline +50';
       tests/adapters-dashboard-mock-seed.test.ts 'mock
       seed produces per-objective baseline means';
       exploratory — the tile counts against the stated
       bounds and the absence of any "No data" empty
       state on the other surfaces

---

## D. Core: Ideas Workflow

Every case below assumes the active organization is
Stark Industries, except where a case names a switch
to Wayne Enterprises: D16 switches out and back on
its own; D20 switches out and D24 switches back,
covering the D20–D24 run between them.

### Ideas List (`ideas/`)

- [ ] **D1** Navigate to `ideas/`. PASS: list shows
  the active org's ideas as cards (≥ 6 for Stark on
  the mock seed — the list is org-scoped, so this is
  a tolerant lower bound, not the global 11; note the
  org-scoped reads can take 5–8s to paint, so wait
  for the cards before asserting empty), each with a
  drag-handle grip, title, status badge, and (for
  approved ideas) a Convert button. Ideas represent
  the problem-and-proposed-solution shape and do not
  carry time/cost/impact estimates; those fields live
  on projects created by conversion.
  Pin: tests/presenter-idea.test.ts
       'IdeaListPresenter.renderList renders one card
       per idea in position order with a grip in the
       all view' (decides one card per idea, position
       order, and the grip in the unfiltered view);
       tests/presenter-idea.test.ts
       'IdeaPresenter.buildCard renders the title,
       state badge, and card data attributes' (decides
       each card's title and status badge render);
       tests/presenter-idea.test.ts
       'IdeaPresenter.buildCard exposes a Convert
       affordance only for approved ideas' (decides
       the Convert button on approved cards);
       exploratory — the live ≥ 6 count and the
       5–8s paint timing
- [ ] **D2** Each idea row shows a lifecycle status
  badge (Active, In Review, Approved, Promoted, Sent
  Back, or Archived); an active idea missing a
  required field also shows a single "Incomplete"
  readiness pill (warning tone) derived from
  required-field presence — ready ideas and
  non-active ideas show no pill. PASS: the status
  badge always renders, and the Incomplete pill
  appears only on active, not-ready ideas — an
  invariant true of every row regardless of which
  ideas happen to be `active` at this point in the
  walk.
  Pin: tests/presenter-idea.test.ts
       'IdeaPresenter.buildCard renders the Incomplete
       pill only for active ideas missing a required
       field' (decides the pill's exact condition: it
       renders for an active+incomplete idea and not
       for a ready or non-active one);
       tests/presenter-idea.test.ts
       'IdeaPresenter.buildCard renders the title,
       state badge, and card data attributes' (decides
       the badge always renders); exploratory — the
       live rendering across whichever ideas are
       `active` when the explorer reaches this case
- [ ] **D3** Click an idea row/title. PASS: navigates
  to `ideas/detail.html?ideaId=<id>` (idea-detail)
  with the correct `ideaId` parameter.
  Pin: tests/presenter-idea.test.ts
       'IdeaPresenter.buildCard renders the title,
       state badge, and card data attributes' (decides
       the card's `data-idea-card` id attribute the
       click handler reads); exploratory — the live
       click and navigation
- [ ] **D4** "New Idea" or "Create Idea" button is
  visible. PASS: clicking it navigates to
  `ideas/create.html`.
  Pin: exploratory — the live button and navigation
       (no CLI or browser test exercises
       `web-app/ideas/index.ts`'s page-level click
       handler)

### Idea Create Form (`ideas/create.html`)

- [ ] **D5** Page loads showing a single-page form
  with six conversationally-labeled fields: "Give
  your idea a clear title" (Title), "What problem
  does this solve?" (Problem Statement), "Who will
  benefit from this?" (Target Users), "How would you
  solve this?" (Proposed Solution), "What outcome do
  you expect?" (Expected Outcome), "How would you
  measure success?" (Success Metrics). Parentheticals
  are conceptual field names (draft keys: title,
  problemStatement, targetUsers, proposedSolution,
  expectedOutcome, successMetrics), not DOM field
  ids; the prompt is the visible label. DOM ids for
  selectors:
  `idea-create-field-title|problem|target|solution
  |outcome|metrics`. PASS: all six fields visible.
  Pin: tests/presenter-idea.test.ts
       'IdeaCreatePresenter.render enables submit and
       echoes draft values into the form fields'
       (decides all six fields exist and render — a
       filled draft's title, problem, target users,
       solution, outcome, and metrics values all
       appear in the output); exploratory — the six
       specific conversational prompt strings and
       their DOM ids (no test asserts the individual
       labels)
- [ ] **D6** With any required field empty, click
  "Submit Idea". PASS: an error toast reads
  "Title, problem, solution, and outcome are
  required"; the page does not navigate. The
  button stays clickable (no `disabled`
  attribute — validation is post-click).
  Pin: tests/presenter-idea.test.ts
       'ideaCreateDraftIsComplete requires title,
       problem, solution, and outcome' (decides
       exactly which four fields gate the click
       handler's toast); tests/presenter-idea.test.ts
       'IdeaCreatePresenter.render keeps submit
       clickable while the draft is empty' (decides
       the button carries no `disabled` attribute);
       exploratory — the live toast text and the
       no-navigation outcome
- [ ] **D7** Fill in all required fields (Title,
  Problem Statement, Proposed Solution,
  Expected Outcome). PASS: the button stays
  clickable (there is no disabled→enabled
  transition). Submit itself is D8.
  Pin: tests/presenter-idea.test.ts
       'IdeaCreatePresenter.render enables submit and
       echoes draft values into the form fields'
       (decides the button still carries no
       `disabled` attribute once every field is
       filled — the other half of the no-transition
       claim); exploratory — the live typing and
       field echo
- [ ] **D8** Click "Submit Idea". This creates a new,
  `active` Stark idea — D18 submits it for review.
  PASS: navigates to `ideas/index.html`, where the
  new idea now appears on the list.
  Pin: tests/adapters-ideas.test.ts
       'postIdeaCreation persists via GET and records
       the initial state event' (decides the create
       call the click handler makes persists the idea
       and its opening state event — the data-layer
       reason it can appear on the list); exploratory
       — the live click, navigation, and the idea's
       appearance in the rendered list (the created
       idea's `active` state is a production-source
       fact, `web-app/ideas/create.ts:164`, not
       something this test's own 'active' literal can
       decide)
- [ ] **D9** Navigate to `ideas/create.html` again —
  D8 left you on the list, not the create form. Click
  "Cancel". PASS: navigates to `ideas/` list.
  Pin: exploratory — the live click and navigation
       (no CLI or browser test exercises this page's
       click handler)

### Idea Detail (`ideas/detail.html?ideaId=<id>`)

- [ ] **D10** Navigate to
  `ideas/detail.html?ideaId=<id>` (a real identifier
  from the Ideas list). PASS: page loads with idea
  title, status badge, and "Submitted by [name] @
  [date/time]" in the header.
  Pin: tests/presenter-idea.test.ts
       'IdeaPresenter carries submitter name and
       submitted timestamp verbatim' (decides the
       submitter name and timestamp the header line
       reads from); exploratory — the live title,
       status badge, and "Submitted by … @ …" header
       layout itself (renderShell/renderUpdate walk a
       real DOM tree and stay outside this file's
       coverage by its own header comment)
- [ ] **D11** Page displays one card: Problem & Solution (Problem Statement,
  Target Users, Proposed Solution, Expected Outcome, Success Metrics).
  PASS: every field the idea carries is rendered;
  an empty optional field (Target Users or Success
  Metrics, on some seeded ideas) shows an em dash
  rather than blank space. No Details or Estimates
  cards.
  Pin: exploratory — the live card layout
       (`buildProblemSolutionReadonlyCard` in
       web-app/app/presenters/idea.ts renders through
       renderUpdate's DOM slots; this section's own
       test file excludes those methods from its
       coverage by choice, not because Layer 1 cannot
       reach them — `makeRecordingContainer` in
       tests/presenter-project-detail-impact.test.ts
       renders an equivalent DOM-slot shell under
       `deno test`, so this is a Layer 1 gap, not a
       Layer 2 one)
- [ ] **D12** Click "Edit" button. PASS: text fields become editable inputs/textareas, Save and Cancel buttons appear, Edit button hides.
  Pin: exploratory — the live edit-mode toggle (the
       page's `handleIdeaActions` click switch has no
       CLI or browser test)
- [ ] **D13** Modify a field (e.g. Problem Statement or Expected Outcome), click "Save". PASS: toast "Idea saved" appears, page returns to view mode with updated data.
  Pin: tests/presenter-idea.test.ts
       'ideaPatchFromDraft maps camelCase draft to
       snake_case entity columns' (decides the edited
       field lands in the write payload the Save
       button builds); tests/adapters-ideas.test.ts
       'putIdea persists changes' (decides the write
       persists via a fresh read); exploratory — the
       live toast and the return to view mode

### Idea Detail — Edit & Actions

- [ ] **D14** Click "Edit", then "Cancel". PASS: returns to view mode with original data unchanged.
  Pin: exploratory — the live edit/cancel toggle
       (`cancel` resets to the read view without
       calling any write adapter; no CLI or browser
       test exercises the page's click handler)
- [ ] **D15** For an idea in "in_review"
  status: clicking the card navigates to
  `ideas/detail.html` with Send Back /
  Approve buttons in the header next to Edit.
  Pin: tests/presenter-idea.test.ts
       'IdeaPresenter state predicates reflect the
       wrapped idea state' (decides `isReviewable()`
       is true for `in_review`, the gate the header
       actions slot renders Send Back / Approve
       from); exploratory — the live click,
       navigation, and the rendered button pair
       itself
- [ ] **D16** Convert is on the list card
  (`data-idea-convert`) and on detail
  (`#idea-convert-btn`). Select Wayne
  Enterprises in the sidebar footer
  `.org-switcher` (G36) and open Automated
  Report Generation (`WurwPqXxGtLhRAoCEcPzfQ`),
  Wayne's `approved` idea — Wayne is untouched
  by AA, so this is still its only convertible
  idea. PASS: both Convert controls are
  visible; one click (list or detail) navigates
  to `ideas/convert.html`. That click does
  **not** promote (D24 does). Then select Stark
  Industries in `.org-switcher` before D17–D19.
  Pin: tests/presenter-idea.test.ts
       'IdeaPresenter.buildCard exposes a Convert
       affordance only for approved ideas' (decides
       Convert renders for an `approved` idea and
       not for others — `isConvertible()` is a plain
       equality against `approved`, so this
       generalizes); exploratory — the live
       org-switcher navigation and the detail-page
       Convert button
- [ ] **D17** Navigate to
  `ideas/detail.html?ideaId=999` (non-existent).
  PASS: page handles gracefully — shows error state,
  no unhandled JS exception.
  Pin: tests/api.test.ts 'GET
       organizations/:id/ideas/:id throws on
       missing' (decides the underlying fetch this
       page makes rejects for a nonexistent id);
       tests/loading-states.test.ts 'a rejecting
       fetch renders the error state and calls
       neither hook' (decides the shared `loadInto`
       helper this page's `init()` calls — see
       `web-app/ideas/detail.ts`'s `fetch: () =>
       getIdea(...)` — shows an error state with a
       "Try Again" retry control and fires neither
       hook when its fetch rejects); exploratory —
       the live rendering of that error state on this
       specific page

### Idea Detail — Submit for Review

- [ ] **D18** Navigate to the idea created in D8 —
  still `active` (nothing between D8 and here
  changes its lifecycle state). PASS: "Submit for
  Review" button is visible in the header area.
  Pin: tests/presenter-idea.test.ts
       'Idea.canBeSubmittedForReview gates on both
       lifecycle and readiness' (decides an
       `active`, ready idea shows the button, and
       every other state/readiness combination does
       not); exploratory — the live button placement
- [ ] **D19** Click "Submit for Review". PASS:
  toast "Submitted for review", navigates to
  the ideas list, and the idea's status badge
  there now reads "In Review". The toast is
  still visible on the ideas list after
  navigation (it survives `navigateTo`).
  Pin: tests/adapters-ideas.test.ts
       'postIdeaStateChange records a state event
       without changing non-lifecycle entity fields
       on GET' (decides the transition lands and
       every other field survives it);
       tests/toast-pending.test.ts 'showToast writes
       a pending session payload' and
       'replayPendingToast restores the toast once'
       (together decide the write-then-replay-once
       mechanism `navigateTo` relies on for a toast
       to survive it — the mechanism only, since
       these tests supply their own message string,
       not evidence that production still shows
       exactly "Submitted for review"); exploratory —
       the live toast text and the badge update on
       the list

### Idea Detail — Sent Back Re-Submit

- [ ] **D20** Navigate to an idea with status
  "sent_back" (after a reviewer sends it
  back). Switch to Wayne Enterprises in
  `.org-switcher` (G36) — Stark carries no
  `sent_back` idea; Wayne's leftover is
  Employee Training Assistant
  (`IjrYiSuRyjkQaqiRLhadAg`). PASS: "Submit
  for Review" button is visible, allowing
  re-submission.
  Pin: tests/presenter-idea.test.ts
       'Idea.canBeSubmittedForReview gates on both
       lifecycle and readiness' (decides a
       `sent_back`, ready idea shows the button);
       exploratory — the live org-switch and button
       placement
- [ ] **D21** Click "Edit", modify a field,
  click "Save". PASS: idea updates. Click
  "Submit for Review". PASS: navigates to
  the ideas list with the idea now "In
  Review". Stay on Wayne for D22.
  Pin: tests/presenter-idea.test.ts
       'ideaPatchFromDraft maps camelCase draft to
       snake_case entity columns';
       tests/adapters-ideas.test.ts 'putIdea
       persists changes' (together decide the Edit +
       Save write); tests/adapters-ideas.test.ts
       'postIdeaStateChange records a state event
       without changing non-lifecycle entity fields
       on GET' (decides the Submit for Review
       transition); exploratory — the live toasts
       and navigation

### Idea Convert (`ideas/convert.html`)

- [ ] **D22** Stay on Wayne Enterprises after
  D21. Navigate to
  `ideas/convert.html?ideaId=<id>` for
  Automated Report Generation
  (`WurwPqXxGtLhRAoCEcPzfQ`) — D16 verified
  this leftover. PASS: page loads with
  conversion form showing 4 required fields:
  Project Name, Time (label "Time", unit
  "days" as the input suffix; field key
  `time-days`), Cost, Success Criteria (it
  maps to the project description). There is
  no Impact field. A Scores box renders one
  required baseline slider per active
  objective — 1 on Wayne (its one demo
  objective). Sticky sidebar shows the idea
  summary (Title, Problem Statement, Target
  Users, Proposed Solution, Expected Outcome,
  Success Metrics). Source of truth:
  `REQUIRED_FIELDS` in
  `web-app/app/presenters/idea-conversion.ts`.
  Pin: tests/presenter-idea.test.ts
       'buildInitialConversionDraft seeds the
       project name from the idea title and leaves
       the rest blank' (decides the draft's base
       fields are project-name/time-days/cost/
       success-criteria); tests/presenter-idea.test.ts
       'conversionRequiredCount adds active
       objectives to the static field count' (decides
       the static count is exactly 4, off
       `REQUIRED_FIELDS.length` — the reason no
       fifth, Impact, field exists);
       tests/presenter-idea.test.ts
       'IdeaConversionPresenter renders one baseline
       row per active objective' (decides one
       slider per active objective, generalizing to
       Wayne's one); exploratory — the live sticky
       sidebar summary and the field labels/layout
- [ ] **D23** Project Name auto-prefills from the
  idea title, so the bar starts 1/N — not 0/N
  — with the other required fields empty.
  N = 4 + one per active objective: 1/5 on
  Wayne (4 fields + its 1 objective).
  "Create Project" stays disabled until every
  remaining required field and every baseline
  is set. Fill fields and drag baseline
  sliders one at a time. PASS: the bar
  increments with each required field AND
  each baseline, checkmarks appear next to
  completed items, and the button enables
  only when all required fields AND all
  baselines are set. Success Criteria is
  required — filling it advances the bar.
  Pin: tests/presenter-idea.test.ts
       'buildInitialConversionDraft seeds the
       project name from the idea title and leaves
       the rest blank' (decides the 1/N starting
       point); tests/presenter-idea.test.ts
       'conversionRequiredCount adds active
       objectives to the static field count' (decides
       N = 4 + one per active objective, tested at
       0/2/5 objectives); tests/presenter-idea.test.ts
       'conversion progress counts every required
       field including success-criteria' (decides
       Success Criteria advances the completed
       count); tests/presenter-idea.test.ts
       'IdeaConversionPresenter.render shows the
       idea summary and a disabled Create button
       until required fields are complete' (decides
       the button stays disabled short of every
       field); exploratory — the live checkmarks and
       the baseline-slider half of the gate on
       Wayne's single objective
- [ ] **D24** Fill every required field and
  baseline (the progress bar reaches its max,
  5/5 on Wayne), click "Create Project" —
  this is the Automated Report Generation
  conversion D16 opened and D22–D23 filled
  out. PASS: navigates to project detail page
  for the newly created project. The source
  idea's lifecycle state becomes `promoted`
  (list badge label **Promoted**, not
  "Approved") — convert is a promotion, not a
  re-approve. Then select Stark Industries in
  `.org-switcher` before D25 onward.
  Pin: tests/adapters-ideas.test.ts
       'postIdeaConversion commits project, idea,
       two state events, and N baseline rows in one
       atomic batch' (decides the project is
       written, the idea's last state event is
       `promoted`, and every baseline lands
       together); tests/presenter-idea.test.ts
       'IdeaConversionPresenter enables Create once
       every field and baseline is set' (decides the
       button enables only once every field and
       baseline is set); exploratory — the live
       navigation to project detail and the
       Promoted-not-Approved badge label

### Idea Status Filtering (`ideas/index.html`)

- [ ] **D25** Navigate to `ideas/index.html`. PASS:
  a badge renders for each of
  active/in_review/sent_back/approved that is
  present among Stark's ideas — promoted and
  archived ideas never get a filter badge, no
  matter how many exist.
  Pin: tests/presenter-idea.test.ts
       'IdeaListPresenter.renderBadges renders one
       badge per present state' (decides exactly one
       badge renders per present status from the
       four candidates — active/in_review/sent_back/
       approved — proven here with two present, two
       absent); tests/presenter-idea.test.ts
       'IdeaListPresenter.renderBadges omits promoted
       and archived even when those ideas exist'
       (decides promoted and archived never become
       filter badges); tests/list-choreography.test.ts
       'buildStateFilterBadges omits groups outside
       order' (decides the shared helper honors
       `order` as the candidate list, not as a
       prefix); exploratory — the live current status
       mix
- [ ] **D26** Click a status badge. PASS: list filters to show only ideas with that status, badge is highlighted (`aria-pressed="true"`), others are dimmed (`data-dimmed="true"`); badges carry label + icon only (no per-badge count).
  Pin: tests/presenter-idea.test.ts
       'applyIdeaFilterToggle sets, replaces, and
       clears the status filter' (decides the filter
       state a badge click sets);
       tests/presenter-idea.test.ts
       'IdeaListPresenter.renderList in a filtered
       view keeps only matching ideas and omits the
       grip' (decides the list narrows to the
       matching status); tests/presenter-idea.test.ts
       'IdeaPresenter.buildStateBadge marks the badge
       dimmed when isActive is false' (decides
       `data-dimmed="true"` on the non-selected
       badge — half of D26's dimming clause);
       exploratory — the live `aria-pressed`
       highlight on the selected badge (the same test
       builds the selected/`isActive: true` case and
       checks only `data-dimmed="false"` on it, never
       `aria-pressed`)
- [ ] **D27** Click the same badge again. PASS: filter clears, all ideas shown, all badges at full opacity.
  Pin: tests/presenter-idea.test.ts
       'applyIdeaFilterToggle sets, replaces, and
       clears the status filter' (decides a second
       click on the same status clears back to the
       all filter); tests/presenter-idea.test.ts
       'IdeaListPresenter.renderList renders one card
       per idea in position order with a grip in the
       all view' (decides every idea shows once
       unfiltered); tests/presenter-idea.test.ts
       'IdeaPresenter.buildStateBadge marks the badge
       dimmed when isActive is false' (decides the
       neutral, no-filter case renders
       `data-dimmed="false"` — D27's full-opacity
       clause); exploratory — the live full-opacity
       styling
- [ ] **D28** Click a different badge. PASS: filter switches to the new status.
  Pin: tests/presenter-idea.test.ts
       'applyIdeaFilterToggle sets, replaces, and
       clears the status filter' (decides a click on
       a different status replaces, rather than
       toggles off, the filter); exploratory — the
       live badge-highlight switch

### Idea Detail — Approval Actions

- [ ] **D29** Navigate to
  `ideas/detail.html?ideaId=<id>` for an in_review
  idea (entity ids are identifiers, not sequential
  integers — copy a real id from the Ideas list).
  PASS: page loads with idea details and Send Back /
  Approve buttons in the header next to Edit.
  Pin: tests/presenter-idea.test.ts
       'IdeaPresenter state predicates reflect the
       wrapped idea state' (decides `isReviewable()`
       is true for `in_review`); exploratory — the
       live page load and the rendered button pair
- [ ] **D30** Click "Approve". PASS: success toast,
  navigates to ideas list, idea status is now
  "approved". The success toast (`Idea approved
  successfully`) is visible on the list the same
  way. This is a Stark `approved` idea distinct
  from Wayne's D16/D24 Convert subject and from
  Sustainability Dashboard for Operations
  (AA20's leftover).
  Pin: tests/adapters-ideas.test.ts
       'postIdeaStateChange records a state event
       without changing non-lifecycle entity fields
       on GET' (decides the in_review→approved
       transition lands and every other field
       survives it); tests/toast-pending.test.ts
       'showToast writes a pending session payload'
       and 'replayPendingToast restores the toast
       once' (together decide the write-then-replay-
       once mechanism the toast's list-page survival
       depends on — the second test's own fixture
       even reuses this case's exact string, "Idea
       approved successfully", but that only proves
       the mechanism replays whatever string it is
       given, not that production still emits this
       one — that stays exploratory); exploratory —
       the live toast text and navigation
- [ ] **D31** Click "Send Back" on a DIFFERENT
  in_review idea than D30's — D30 already moved its
  idea to `approved`, and Send Back needs
  `in_review`. PASS: confirm dialog opens. Confirm.
  PASS: idea status changes to "sent_back", navigates
  to ideas list.
  Pin: tests/adapters-ideas.test.ts
       'postIdeaStateChange records a state event
       without changing non-lifecycle entity fields
       on GET' (decides the transition lands);
       exploratory — the live confirm dialog
- [ ] **D32** Navigate to idea detail for a non-in_review idea. PASS: no Send Back / Approve buttons are shown.
  Pin: tests/presenter-idea.test.ts
       'IdeaPresenter state predicates reflect the
       wrapped idea state' (decides `isReviewable()`
       is false for `active`; a plain equality
       against `in_review`, so every other state is
       false by construction); exploratory — the
       live absence of the buttons for a state other
       than the one tested
- [ ] **D32a** On an in_review idea, click "Edit". PASS: the header shows only Cancel / Save — no Send Back, Approve, Submit, or Convert. Click Cancel: the read header (Send Back / Approve / Edit) returns.
  Pin: exploratory — `IdeaEditPresenter`'s action
       buttons are unconditionally Cancel/Save (no
       CLI test renders them), and no test composes
       the read-header's button set for `in_review`
       specifically

### Ideas Workflow Integration

- [ ] **D33** After creating an idea and converting it to a project, navigate back to `ideas/`. PASS: the ideas list still loads correctly with seed data.
  Pin: tests/presenter-idea.test.ts
       'IdeaListPresenter.renderList renders one card
       per idea in position order with a grip in the
       all view' (decides the list still renders one
       card per remaining idea); exploratory — the
       live round trip through create and convert
- [ ] **D34** Navigate from ideas list → idea convert → back button. PASS: navigates to ideas list.
  Pin: exploratory — the live back-button navigation
       (`#convert-back-to-ideas`'s click handler
       carries no CLI or browser test)
- [ ] **D35** Navigate to
  `ideas/convert.html?ideaId=999` (non-existent).
  PASS: page handles gracefully — shows empty/error
  state, no unhandled JS exception.
  Pin: tests/api.test.ts 'GET
       organizations/:id/ideas/:id throws on
       missing' (decides the underlying fetch this
       page makes rejects for a nonexistent id);
       exploratory — the live "Failed to load idea
       for conversion." error-state rendering and
       its Try Again button

### Ideas List — Drag-reorder

- [ ] **D36** On `ideas/index.html`, press and hold
  the `.drag-handle` on an idea row then drag it
  upward past another row's midpoint. Drive with
  compositor mouse: `pointerdown` on `.drag-handle`
  (pointer capture), `pointermove`, `pointerup` —
  not HTML5 `drop`. PASS: during the drag a
  hysteresis indicator appears at the target drop
  position, the dragged row follows the pointer,
  and on release the ideas list reorders in place.
  Reload the page — new order persists.
  Pin: tests/drag-reorder.test.ts 'dropIndex returns
       slot when cursor below midpoint without
       hysteresis' (decides the drop-slot
       resolution); tests/drag-reorder.test.ts
       'computeNewPosition inserts midway between
       neighbors' (decides the persisted position
       lands between its new neighbors);
       tests/drag-reorder.test.ts 'followTranslateY
       writes translateY of the pointer delta'
       (decides the dragged row follows the pointer
       by the transform math); exploratory — the
       live hysteresis-indicator rendering and the
       reload-persistence observation (no browser
       test drags an idea row —
       tests/browser/list-reorder.test.ts drags
       `[data-project-card]`, the projects list, a
       different page)
- [ ] **D37** During a drag, hover slowly across the
  midpoint of a neighbouring row. Drive with two
  or more `pointermove` samples across the
  midpoint. PASS: the drop indicator line only
  flips to the new target once the pointer crosses
  the hysteresis threshold, not on the first pixel
  over the midpoint.
  Pin: tests/drag-reorder.test.ts 'dropIndex
       respects hysteresis when lastIdx === current
       slot'; tests/drag-reorder.test.ts 'dropIndex
       respects hysteresis when lastIdx === next
       slot' (together decide the 8px hysteresis
       band on both sides of the midpoint);
       exploratory — the live drop-indicator line's
       visual flip

---

## E. Core: Projects

### Projects List (`projects/`)

- [ ] **E1** Navigate to `projects/`. PASS: list shows the active org's projects (≈16 for Stark on the mock seed — the list is org-scoped, so this is a tolerant lower bound, not the old fixed 6) with title, status, and progress. Each project card shows three metrics (time, cost, impact). Em-dash ("—") substitutes for the entire metric when its **baseline (denominator) is missing**; a zero current value over a non-zero baseline renders as `0d / 213d`, `$0k / $120k`, or `0 / 85 pts` — not em-dash. Em-dash signals "no baseline to compare against," not "zero current value." When the current is missing but the baseline is present, the half-em-dash form (e.g. `— / 46 pts`) renders the absent current side only — distinct from full em-dash (both absent) and from `0d / 213d` (zero current over present baseline).
  Pin: tests/presenter-projects-organization.test.ts
       'ProjectPresenter.buildCard renders title,
       status label and timeline progress';
       exploratory — the org-scoped card count, the
       paint-timing wait, and the metric grid's
       em-dash / half-em-dash rendering
- [ ] **E2** Click a status filter badge (e.g. "Approved"). PASS: project list filters to show only projects with that status. Click the same badge again. PASS: full list returns.
  Pin: tests/presenter-misc.test.ts 'toggleStatusFilter
       from all moves to filtered on the clicked
       status'; tests/presenter-misc.test.ts
       'toggleStatusFilter clears back to all when
       the active status is clicked again';
       tests/list-choreography.test.ts
       'filteredSortedList filters, sorts, then
       renders'; tests/list-choreography.test.ts
       'filteredSortedList renders all when the
       filter is all'; exploratory — the live badge
       click and its visual active state
- [ ] **E3** Click a project row. PASS: navigates to `projects/detail.html?projectId=<id>`.
  Pin: exploratory — the live click and navigation

### Project Detail (`projects/detail.html?projectId=<id>`)

- [ ] **E4** Page loads with project summary
  card (description, dates, progress bar) and
  baseline vs. current metrics. PASS: all cards
  render with data. Baseline/current metrics
  show em dash when values are zero or missing.
  Pin: tests/presenter-projects-organization.test.ts
       'ProjectDetailPresenter renders a read view
       with title, description and summary/metrics
       sections'; exploratory — the dates and
       progress bar rendering, and the em-dash rule
       for the Time, Cost, and Impact metrics
- [ ] **E5** Sidebar shows the Flows section
  (Team card has been retired with the team
  data model). PASS: no Team card on the
  project sidebar.
  Pin: exploratory — the absence of a Team card
- [ ] **E6** Flows section shows linked flows with
  node/edge counts. For approved projects, a "New
  Flow" button is visible. For non-approved
  projects, an info badge "Approve to add flows"
  appears instead and empty state reads "Flow
  creation limited to approved projects only".
  PASS: correct UI for project status.
  Pin: tests/presenter-projects-organization.test.ts
       'ProjectDetailPresenter offers a New Flow
       button for approved projects and a gating
       message otherwise';
       tests/presenter-projects-organization.test.ts
       'ProjectDetailPresenter renders a flow card
       with the flow name and node/edge counts';
       exploratory — the zero-flows empty-state
       copy actually painting
- [ ] **E7** On an approved project, click "New
  Flow" button. PASS: a "New Flow" dialog opens
  with a Flow Name input and Create/Cancel
  buttons. Enter a name and click Create. PASS: a
  new flow is created and the browser navigates to
  the flow designer page. The new flow is
  associated with the current project.
  Pin: tests/adapters-flow-mutations.test.ts
       'postFlowCreation creates flow plus link';
       exploratory — the dialog's fields and the
       live navigation to the flow designer

### Project Detail — Edit Mode

- [ ] **E8** Click "Edit" button on project detail. PASS: fields become editable inputs/textareas, Save and Cancel buttons appear.
  Pin: tests/presenter-projects-organization.test.ts
       'ProjectDetailEditPresenter renders an
       editable title input, state select and
       Save/Cancel actions'; exploratory — the live
       click swapping read mode for edit mode
- [ ] **E9** Modify a field, click "Save". PASS: project saves successfully, returns to view mode with updated data.
  Pin: tests/adapters-projects.test.ts 'putProject
       updates an existing project';
       tests/projects-detail-reduce.test.ts
       'reduceProjectSave lands in read mode with
       the fresh description and Edit, not Save';
       exploratory — the live click-Save interaction
- [ ] **E10** Click "Edit", then "Cancel". PASS: returns to view mode with original data unchanged.
  Pin: exploratory — the live click-Cancel
       interaction restoring the original data
- [ ] **E10a** On a project whose state shows action-bar buttons (`submitted` → Approve / Decline / Send back, or `approved` → Archive / View history), click "Edit". PASS: those action-bar buttons are hidden; only the State select, editable fields, and Cancel / Save remain. Click Cancel: the action-bar buttons reappear.
  Observable: `#project-review-actions` /
  `#project-lifecycle-actions` carry `hidden`
  while the inner `.action-bar` keeps its own
  `display:flex`. The objectives section and
  flows sidebar stay visible in edit mode.
  Pin: exploratory — the action-bar buttons hiding
       on Edit and reappearing on Cancel

### Projects List — Drag-reorder

- [ ] **E11** On `projects/index.html`, press and hold
  the `.drag-handle` on a project card then drag it
  to a new position. Drive with compositor mouse:
  `pointerdown` on `.drag-handle` (pointer capture),
  `pointermove`, `pointerup` — not HTML5 `drop`.
  PASS: drop indicator appears, card follows the
  pointer, and on release the projects list
  reorders. Reload the page — new order persists.
  Pin: tests/browser/list-reorder.test.ts 'a
       captured drag reorders, persists, and stays
       put'; exploratory — the drop indicator's
       appearance and the card visually following
       the pointer mid-drag

---

## F. Tools

Sign in as `demo@example.com` (Tony Stark); Stark
Industries is the active organization throughout. F's
working flow is the seeded "Layout Test: Proposal Review
Cycle" — a long branching graph with back-edges, no
members on any node, and no Record bound. Every
structural edit below (add, delete, move, rename, lock,
undo) happens there unless a case names another flow.
Customer Onboarding is read-only to F except where a case
names it, and those cases restore what they touch: FS and
F2 read its four seeded nodes and its two two-member
nodes later in the walk.

The canvas cases lean on `## The walk`'s
`### Driving notes` — read that list once before F1
rather than looking for the reminders here.

### Flow List (`flows/`)

- [ ] **F1** Navigate to `flows/`. PASS: the page lists
  flow cards, each with the flow name, a project-name
  badge, and state/transition counts. At least the four
  seeded Stark flows appear — Customer Onboarding, Fusion
  Angle Flow, Lead-to-Close, and Layout Test: Proposal
  Review Cycle — plus whatever AA26 and E7 minted earlier
  in the walk.
  Pin: tests/presenter-misc.test.ts 'FlowPresenter
       renders the flow name and a data-flow-card hook';
       tests/presenter-misc.test.ts 'FlowPresenter shows
       a project badge only when a project name is
       supplied' (decides the badge renders only for a
       flow whose project name resolves);
       tests/presenter-misc.test.ts 'FlowPresenter
       pluralizes states and transitions for counts other
       than one' (decides the "N states / N transitions"
       line); tests/adapters-flow-queries.test.ts
       'getFlowsWithProjectNames includes node and edge
       counts in the summary' (decides the counts the
       card renders are the flow's own node and edge
       counts); exploratory — the live card list
- [ ] **F2** Flow-list search. RETIRED / N/A: `flows/` has
  no search input (never shipped on the list page). Do not
  assert a filter control. PASS vacuously; re-open only if
  a flow-list search UI is added later.
  Pin: exploratory — confirming the list page renders no
       search input
- [ ] **F3** Click a flow card. PASS: navigates
  to `flows/detail.html?flowId=<id>`.
  Pin: tests/presenter-misc.test.ts 'FlowPresenter
       renders the flow name and a data-flow-card hook'
       (decides the card carries the
       `data-flow-card="<id>"` hook the list's click
       handler reads); exploratory — the live click and
       the resulting URL

### Flow Import

(Mermaid parse/serialize round-trip is covered by
`tests/mermaid.test.ts` and ZIP read/write by
`tests/zip-guards.test.ts` — the cases below verify the import
dialog, the file-upload affordance, and that the imported flow
opens and renders.)

- [ ] **F4** Click "Import Flow" on the flows list page.
  PASS: the import dialog opens with a Project selector
  (`#import-project`) and a "Choose File" button; the file
  input itself is hidden and triggered by that button.
  Pin: exploratory — the import dialog's markup carries
       no CLI or browser test
- [ ] **F5** Choose a project from the dropdown, click
  "Choose File", and select a `.mmd` file — hand-write a
  two-line `stateDiagram-v2` (`[*] --> Draft`,
  `Draft --> [*]`) if you have none. Selecting the file
  imports it directly, with no separate confirm button.
  PASS: a flow is created, a "Flow imported" toast
  confirms, and the browser lands on the designer for the
  imported flow.
  Pin: tests/adapters-flow-export.test.ts
       'postFlowFromMermaid creates a flow with a
       message-plane graph from simple .mmd' (decides a
       `.mmd` import writes a flow whose message-plane
       graph carries a start node, a complete node, and at
       least one auto-wired edge); exploratory — the live
       file picker, the toast, and the navigation
- [ ] **F6** Repeat with a `.zip`. Take one first: open
  **Customer Onboarding** and click Export ZIP (F42's
  gesture) — it is the flow that carries attribute refs;
  Layout Test carries none, so an archive of Layout Test
  cannot show this case's attributes. Return to `flows/`
  and choose that archive. Because the archive names a flow
  and a project that both still exist, the dialog replaces
  "Choose File" with **Overwrite** and **Create New** —
  there is no direct import for this shape. Click
  **Overwrite**: it re-PUTs the same flow id with the same
  graph, so Customer Onboarding is unchanged and no
  duplicate row appears on `flows/`. PASS: a "Flow
  overwritten" toast fires, the designer opens on that
  flow, and it renders with nodes, edges, and attributes.
  NOTE: the export ZIP
  carries graph + positions (`flow.mmd` / `flow.json` /
  `sidecar.json`) only — it does **not** rebind
  `flow_records`, so the designer's Record control may read
  **(none)** until the operator rebinds it; that is scope,
  not a failed import.
  Pin: tests/api-flows-save-relations.test.ts
       'PUT /organizations/:id/flows/:id ROUND-TRIP:
       message-plane graph equals the intended saved graph'
       (decides all three thirds of this PASS on the path
       Overwrite actually walks — `handleOverwrite` calls
       the same `putFlow` this test calls: after the PUT
       the message-plane graph carries the intended nodes,
       the intended edge, each node's `memberIds`, and each
       attribute ref's `attributeId`, `mode` and
       `isRequired`); exploratory — the Overwrite /
       Create New resolution dialog, and the
       `getFlowZip` -> `getBackupFromZip` parse that feeds
       the PUT: no test carries members or attribute refs
       through a real archive. (The sibling
       `postFlowFromBackup round-trip preserves node
       members AND attributes` is NOT cited here: it
       exercises the POST-to-create path Create New takes,
       from an in-memory backup literal, so it stays green
       however Overwrite breaks.)

### Flow Designer (`flows/detail.html?flowId=...`)

- [ ] **F7** Open the Layout Test: Proposal Review Cycle
  designer. PASS: the page wears the standard sidebar +
  top-bar layout — left sidebar with the global nav, top
  bar with search / organization stats / theme toggle and
  no greeting — with the designer occupying the remaining
  content area. The toolbar runs vertically along the left
  edge of the canvas (inside the content area, not the
  global sidebar): Undo/Redo, Zoom −/+, Copy Mermaid,
  Export ZIP, and Delete (trash), top to bottom. The header
  above the canvas hosts the Back button, a Stats button,
  and three switches (Locked, Auto Layout, Auto Fit). The
  SVG canvas sits to the right of the toolbar with a
  dot-grid background. With Auto Fit on, the view-changing
  controls — Zoom −/+, wheel zoom, and Space (pan mode) —
  refuse with an error toast "Disable Auto-Fit to change
  the view" rather than silently absorbing; a node drag is
  not refused, the camera simply re-fits at gesture end.
  Changes auto-save (no Save button).
  Pin: tests/presenter-misc.test.ts 'buildToolbar leaves
       undo, redo, and delete enabled when their actions
       are available' (decides the toolbar carries the
       copy-mermaid and export-zip actions with nothing
       disabled when every action is available);
       tests/flow-fsm-reduce.test.ts 'wheel with autofit
       shows toast and does not zoom' (decides wheel zoom
       under Auto Fit leaves the zoom at 1.0);
       tests/flow-fsm-reduce.test.ts 'space-toggle from
       off with autofit shows toast and stays off';
       exploratory — the page chrome, the toolbar's
       vertical order, the header switches, and the dot
       grid
- [ ] **F8** Nodes render by kind: the start node has a
  green border with its name centred in the card and no
  subtitle; standard nodes have a blue border and an
  attribute-count subtitle; the complete node has a red
  3-px border with its name centred and no subtitle.
  Pin: tests/flow-graph-locked.test.ts 'an unlocked canvas
       keeps per-type strokes' (decides that the success,
       primary, and error strokes each appear on an
       unlocked canvas and that no accent-text stroke
       does); exploratory — which kind wears which colour.
       That test renders all three kinds into one blob and
       asks only that each colour appear *somewhere*, so a
       regression swapping green and red survives it. Also
       exploratory: the 3-px width, the centred label, and
       the attribute-count subtitle
- [ ] **F9** On Layout Test — whose "revise" and "back to
  draft" edges close loops — edges render by class:
  forward edges are solid blue lines with arrow markers
  and named labels. Cycle edges, those that close a loop
  because a return path from target back to source already
  exists in the graph, are dashed orange with a warning
  arrow. Sibling transitions between nodes that have no
  return path render solid blue even when they share a
  level.
  Pin: tests/flow-cycle-edges.test.ts 'a back-edge to an
       ancestor is a cycle edge' (decides the back-edge
       classification the dashed-orange paint follows);
       tests/flow-cycle-edges.test.ts 'a diamond with no
       back-edge has no cycle edges' (decides that
       same-level siblings are NOT cycle edges);
       tests/flow-cycle-edges.test.ts 'a linear flow has no
       cycle edges'; exploratory — the painted dashed
       orange, the warning arrowhead, and the edge labels
- [ ] **F10** Connection ports (small circles) are visible
  on every middle node while the flow is unlocked. Create
  and Archive show a port only when they have no connected
  edges yet — per `canShowPort` in
  `web-app/app/flow-graph.ts`, a port renders when not
  locked AND (not a start/complete node OR that special
  node has no connections); on Layout Test both are already
  wired, so neither shows one. When the flow is locked, no
  node shows a port. Each port sits on the longest open
  perimeter gap of its node, not always the right side.
  Hover a port. PASS: the cursor becomes a crosshair and
  the browser tooltip reads "Click and drag to create a new
  node attached here. Hold Shift to connect to an existing
  node instead."
  Pin: exploratory — `canShowPort` and the port's `<title>`
       carry no CLI or browser test; the browser suite only
       drags a port that is already rendered
- [ ] **F11** Click a node. PASS: the node gets the gold
  glow selection effect. Double-click it — the mechanics
  are in `### Driving notes`, and every later double-click
  in F uses the same drive. PASS: the
  properties panel appears with the "State Properties"
  title and a close button on the right (regular nodes only
  — Create/Archive show their own kind title), then a
  Members fieldset (HUMANS / AIs checkbox groups), the
  state name, a Task Instructions textarea, the attributes
  list, and the outgoing transitions.
  Pin: tests/flow-fsm-scenarios.test.ts 'double-click node
       opens panel; second tap within window flips
       open=true (AA28/F13)' (decides two pointerdowns on
       one node inside the window emit exactly one
       open-panel action with open=true);
       tests/presenter-misc.test.ts 'buildNodePanel for a
       regular node lists the member checkboxes grouped
       Humans / AIs' (decides the "State Properties" title,
       the `#prop-node-members` fieldset, and the HUMANS /
       AIs group labels); tests/presenter-misc.test.ts
       'buildNodePanel renders outgoing transitions by name
       and falls back to None when empty'; exploratory —
       the gold glow and the Task Instructions textarea
- [ ] **F12** Panning needs pan mode: turn Auto Fit off,
  focus `svg.flow-canvas`, tap Space (F47's drive), drag a
  node near the right edge of the canvas, then tap Space
  again — in pan mode a pointerdown on a node pans instead
  of selecting. Now double-click that node. PASS: the
  properties panel
  slides out from the toolbar edge over ~200 ms and the
  canvas re-centres so the node sits at the visual centre
  of the canvas region the panel does not cover.
  Pin: tests/flow-designer-actions.test.ts
       'applyPanToRevealSelected centers a node, else null'
       (decides that the pan tracks the selected node —
       moving the node 100 to the right moves the viewBox
       origin by 100 — and that no selection means no pan);
       exploratory — the ~200 ms slide and the
       panel-aware half of the re-centre. This case turns
       Auto Fit OFF, and `reconcileFitFromDom` — the only
       caller of `withFitToBox` on the panel-open path —
       returns at once when Auto Fit is off, so the
       `fitBoxToCanvas` panel-offset tests describe a
       camera path this case disables; the path it does
       take, `#panToRevealSelected`, passes the real
       `PANEL_WIDTH_PX` while the test above passes 0
- [ ] **F13** While the panel is open, double-click a
  *different* node (F11's drive). PASS: panel content
  retargets to the
  new node and the canvas re-centres on it.
  Pin: tests/flow-fsm-scenarios.test.ts 'double-click n1
       then double-click n2 retargets panel and selection
       to n2 (F13 retarget)' (decides the selection
       collapses to the second node and the last open-panel
       action is open=true);
       tests/flow-fsm-scenarios.test.ts 'second click
       beyond DBLCLICK window does not open panel (F13
       negative)' (decides that a real double-click window
       exists — a second press far enough out opens no
       panel; the test brackets the window with its own
       literals rather than reading `DBLCLICK_MS`);
       tests/flow-designer-actions.test.ts
       'applyPanToRevealSelected centers a node, else
       null'; exploratory — the live retarget paint
- [ ] **F14** Turn Auto Fit on, then double-click a node.
  PASS: the panel opens and the canvas re-fits to the
  panel-aware visible region — no toast, no blocking.
  Close the panel. Turn Auto Fit off. Click Zoom in
  once, then read `svg.getAttribute('viewBox')` — that
  is the distinctive pre-open camera. Double-click the
  node. PASS: the panel opens and the canvas pans to
  keep the node visible. Close the panel. PASS: the
  viewBox attribute equals the post-zoom pre-open
  value. Turning Auto Fit off does not un-fit: without
  the zoom step there is no distinctive camera to
  restore.
  Pin: tests/flow-designer-actions.test.ts
       'applyPanelTransition saves the viewBox on open'
       (decides both halves: under Auto Fit the panel
       transition returns null — no pan, no save — and with
       Auto Fit off a just-opened panel returns
       `shouldPanToReveal: true` with
       `savedViewBox.kind === 'saved'`);
       tests/flow-designer-actions.test.ts
       'applyPanelTransition restores the viewBox on
       close' (decides close writes the saved x/y/w/h
       back and clears the save); tests/flow-zoom-to-fit.test.ts
       'fitBoxToCanvas with
       panel offset centers content in the right visible
       region (panel is on the left)' (decides the Auto Fit
       re-fit is panel-aware); exploratory — the live
       zoom-then-open-then-close restore
- [ ] **F15** Drag from a middle node's port into empty
  canvas past 20 pixels, without holding Shift. PASS:
  during the drag a faint bezier preview plus a "New State"
  ghost card track the cursor. On release a new middle node
  is created at the drop position and auto-connected from
  the source node with a default edge name.
  Pin: tests/flow-fsm-scenarios.test.ts 'port drag far-drop
       emits add-node (AA27/AA31/F15)' (decides a far
       port-drag emits exactly one add-node, from the
       dragged node at the drop point, and zero add-edge
       actions); tests/flow-fsm-scenarios.test.ts 'port
       drag close-drop (under 20px) emits no add-node (AA27
       negative)' (decides the 20-pixel threshold);
       tests/flow-operations.test.ts
       'performAddNodeAtPosition: returns node, edge,
       selectId and centers on the point' (decides the new
       node lands centred on the drop point with an edge
       from the source); tests/browser/canvas-gestures.test.ts
       'a port drag onto empty canvas adds a node and its
       edge' (decides the same through a real compositor
       drag: one more node and one more edge); exploratory
       — the ghost card and the bezier preview
- [ ] **F16** Drag a standard node to a new
  position. PASS: the node's `transform`
  follows the pointer **during** the drag
  (rAF). Layout Test's Auto Layout starts ON —
  the drop may snap (F17). For a resting free
  placement see F34 (toggle Auto Layout off
  first; F18's first toggle is that off).
  Pin: tests/flow-fsm-scenarios.test.ts 'drag node emits
       move-nodes with delta matching cumulative pointer
       travel (F16/F17)' (decides the committed position is
       the start position plus the whole pointer travel);
       tests/flow-designer-actions.test.ts 'applyDragPreview
       applies offset to dragging nodes' (decides the
       in-flight preview offsets the dragged node by the
       pointer delta); tests/browser/canvas-gestures.test.ts
       'a body drag moves the node and persists its
       position' (decides a real compositor body drag
       changes the node's stored positionX/positionY);
       exploratory — the per-frame rAF paint
- [ ] **F17** Drag the start node by its body. PASS: it
  moves freely like any standard node — start and complete
  nodes are both draggable. With Auto Layout on the drop
  re-lays out: Create returns to the head of the first
  column and Archive to the foot of the last. Layout Test's
  Create is already wired, so it shows no port (F10); the
  start-port drag is AA27's case, not this one.
  Pin: tests/flow-fsm-scenarios.test.ts 'drag start node
       also emits move-nodes (F17)' (decides a body drag on
       the start node commits a move like any other node);
       tests/adapters-flow-queries.test.ts 'the Layout Test
       flow keeps the ruled covenant: Create min x, Archive
       max x, inside the y range' (decides where the
       re-layout puts Create and Archive on this very
       flow); exploratory — the live drop and its snap
- [ ] **F18** Toggle the Auto Layout header
  switch twice (the seed starts ON — the first
  toggle turns it off and moves nothing). PASS:
  all nodes reposition by rank from start — one
  column per rank (one row per rank when the
  graph is taller than wide), others by graph
  depth. Create heads the first column and
  Archive ends the last — never above or below
  a column-mate; the covenant is the columns,
  not the corners. Create min x, Archive max x.
  The explorer measures laid-out node positions on
  `svg.flow-canvas` (`data-node-id` plus the
  node's x/y or transform) after the second
  Auto Layout toggle, not screenshot y. Layout Test is a
  wide fan, not a serpentine: to see the wrap, open
  Customer Onboarding or Lead-to-Close, whose long chains
  do wrap — Create leads the top row and Archive ends the
  last, bottom-left on an even row count. Return to Layout
  Test afterwards, and change nothing on either.
  Pin: tests/adapters-flow-queries.test.ts 'the Layout Test
       flow keeps the ruled covenant: Create min x, Archive
       max x, inside the y range' (decides exactly this
       flow's laid-out Create/Archive extremes and that
       neither is pinned to a corner);
       tests/flow-layout.test.ts 'computeLayout: a long
       chain wraps to more rows rather than overflowing the
       canvas width' (decides the serpentine wrap);
       tests/flow-layout.test.ts 'computeLayout: a wrapped
       chain keeps Create leftmost past an orphan';
       tests/flow-designer-actions.test.ts 'applyAutoLayout
       positions every node'; exploratory — the live toggle
       and the first toggle moving nothing
- [ ] **F19** Hold Shift and drag from a middle node's
  port over another middle node it has no edge to yet,
  then release. (F19–F23 each need a free pair: a
  duplicate edge, an edge into Create, and an edge out of
  Archive are all refused.) PASS: during the drag the
  preview re-draws from a ghosted grey straight line
  (when the cursor is over empty canvas) into a
  curved bezier with an arrowhead the moment the
  cursor enters a valid target node. On release
  over the target, a new edge is created with a
  default name. No "New State" ghost card is
  shown while Shift is held.
  Pin: tests/flow-fsm-scenarios.test.ts 'shift-drag from
       port onto different node emits add-edge (AA32/F19)'
       (decides a shift-drag onto another node emits
       exactly one add-edge from source to target and zero
       add-node actions); tests/flow-fsm-scenarios.test.ts
       'shift-drag onto same source node emits nothing (no
       self-loop) (F19 self)'; tests/flow-operations.test.ts
       'performAddEdge: success returns the new edge and
       persists it'; tests/browser/canvas-gestures.test.ts
       'a shift drag from a port onto a node commits an
       edge' (decides the same through a real compositor
       drag: one more edge, no new node); exploratory — the
       grey-line-to-bezier preview transition
- [ ] **F20** Shift-drag forward (earlier node →
  later node). PASS: the curved preview is solid
  blue while over the target. The committed edge
  matches the preview exactly.
  Pin: tests/flow-layout.test.ts 'wouldBeCycle: forward
       edge in DAG is fine' (decides a forward edge is not
       flagged as a loop, which is what keeps the preview
       and the committed edge blue);
       tests/flow-operations.test.ts 'performAddEdge:
       success returns the new edge and persists it';
       exploratory — the preview's painted colour and its
       match to the committed edge
- [ ] **F21** Shift-drag backward (later node →
  earlier node). PASS: the curved preview is
  dashed orange with a warning arrow while over
  the target — the reachability check recognises
  that target → … → source already exists. The
  committed cycle edge matches the preview.
  Pin: tests/flow-layout.test.ts 'wouldBeCycle: backward
       edge creates cycle' (decides the reachability check
       flags the backward edge before it is committed);
       tests/flow-cycle-edges.test.ts 'a back-edge to an
       ancestor is a cycle edge' (decides the committed
       edge is classified as a cycle, which is what dashes
       and colours it); exploratory — the painted
       dashed-orange preview
- [ ] **F22** Shift-drag and release in empty
  canvas (no node under cursor). PASS: the grey
  straight-line preview disappears and nothing
  happens — no edge, no new node.
  Pin: tests/flow-fsm-scenarios.test.ts 'shift-drag
       released over empty canvas emits nothing (F22)'
       (decides the release emits zero add-edge and zero
       add-node actions and returns connect to idle);
       exploratory — the preview vanishing
- [ ] **F23** Begin a plain drag from a port (no
  Shift). While the mouse remains stationary,
  press and hold Shift. PASS: without any mouse
  movement the ghost "New State" card disappears
  and the preview collapses to the grey line (or
  curved bezier if the cursor is already over a
  target). Release Shift — the ghost card
  returns. Release the mouse with Shift held to
  create an edge, or without Shift to create a
  node.
  Pin: tests/flow-fsm-scenarios.test.ts 'plain port-drag
       then shift-key toggles connect.isShift (F23)'
       (decides a bare shift-key input flips the in-flight
       connect gesture's `isShift` with no pointer move);
       tests/flow-interactions-shift.test.ts 'pointerIsShift
       is true when the window tracks Shift even if the
       pointer event reports false' (decides the held key
       is honoured when the pointer event does not carry
       it); exploratory — the ghost card appearing and
       disappearing
- [ ] **F24** Double-click a node, edit its name in
  the properties panel. PASS: the node label
  updates on the SVG canvas immediately (changes
  auto-save after 800ms debounce).
  Pin: tests/flow-designer-actions.test.ts
       'applyUpdateNode patches matching id' (decides a
       name patch lands on that node and no other);
       tests/flow-designer-presenter.test.ts
       'withNodeNamed(id, name) renames that node even when
       the selection has moved to another' (decides the
       debounced flush is bound to its target rather than
       to whatever is selected when it fires); exploratory
       — the immediate canvas repaint and the 800 ms
       debounce
- [ ] **F25** On Customer Onboarding, double-click the
  **Review** node — the seed binds Review to Company Name,
  Contact Email, and Reviewer Notes, so seven of Customer
  Profile's ten attributes are still free. (Data Capture
  has only one free, and Layout Test binds no Record at
  all, which disables the picker outright.) In the
  "Attributes" fieldset, click the "+ Add Attribute…"
  dropdown. PASS: the picker lists the record attributes
  this node does not already reference. Select one, e.g.
  Industry. PASS: the attribute appears in the attributes
  list with mode (Editable / Read-only) and required
  toggles plus a remove control. Remove it again before
  moving on — FS and F2 read this flow later.
  Pin: tests/flow-operations.test.ts
       'performAddAttributeRef: appends a ref to the single
       selected node' (decides the picked attribute is
       appended to the selected node and persisted);
       tests/flow-operations.test.ts
       'performRemoveAttributeRef: removes the ref from the
       single selected node' (decides the tidy-up removes
       it again); exploratory — the picker listing only
       unreferenced attributes and the mode / Required
       toggle rendering
- [ ] **F26** Back on Layout Test — do not rename
  Customer Onboarding's seeded transitions, which F2 and
  FS read by name — click an edge to select it (gold
  glow). Double-click the edge (F11's drive). PASS: panel
  shows
  transition name, from/to state names. Edit the name.
  PASS: label updates on the canvas.
  Pin: tests/flow-fsm-scenarios.test.ts 'edge double-click
       selects edge and opens panel (F26)' (decides two
       edge pointerdowns inside the window select that edge
       and emit exactly one open-panel with open=true);
       tests/flow-fsm-scenarios.test.ts 'single edge click
       selects but does not open panel (F26 single)';
       tests/presenter-misc.test.ts 'buildEdgePanel shows
       the transition name plus resolved From and To node
       names' (decides the panel's title and its from/to
       rows); tests/flow-designer-actions.test.ts
       'applyUpdateEdge patches matching id' (decides the
       rename lands on that edge only); exploratory — the
       gold glow and the live label repaint
- [ ] **F27** Select a non-Create / non-Archive node on
  Layout Test — a Panel node is a safe pick — and click the
  Delete (trash) button in the toolbar. PASS: the node and
  all connected edges are removed.
  Pin: tests/flow-operations.test.ts
       'performDeleteSelectedNodes: removes the selected
       intermediate node' (decides the node leaves the
       persisted graph); tests/flow-designer-actions.test.ts
       'applyDeleteNodes removes nodes and orphan edges'
       (decides the connected edges go with it);
       tests/flow-operations.test.ts
       'performDeleteSelectedNodes: keeps start/end when
       the selection mixes them with an intermediate';
       exploratory — the toolbar click and the canvas
       repaint
- [ ] **F28** Select an edge, click the Delete
  (trash) button in toolbar. PASS: edge is
  removed from the canvas.
  Pin: tests/flow-operations.test.ts
       'performDeleteSelectedEdge: removes the selected
       edge' (decides the selected edge leaves the
       persisted graph); tests/flow-operations.test.ts
       'performDeleteSelectedEdge: a node selection is a
       no-op'; exploratory — the toolbar click and the
       canvas repaint
- [ ] **F29** Close the properties panel if it is
  open (empty-canvas click with a panel open
  restores the F14 saved viewBox — that is not
  this case). Turn Auto Fit ON first — the seed
  loads with it on but F14 left it off. Click Zoom
  in (icon-only buttons; `title` /
  `aria-label` "Zoom in" / "Zoom out") — an
  error toast "Disable Auto-Fit to change the
  view" appears and `viewBox` stands. Toggle
  Auto Fit OFF. Click Zoom in,
  then Zoom out, querying the canvas fresh after
  each click per `### Driving notes`. PASS:
  `viewBox` width and height
  shrink then restore (zoom steps ±0.1,
  clamped 0.25–2.0). Click the empty canvas
  once — `svg.getAttribute('viewBox')` keeps the
  zoomed value (never the wrap's client size).
  Toggle Auto Fit ON — the canvas re-fits to
  all nodes.
  Pin: tests/flow-designer-presenter.test.ts 'withZoomedIn
       steps +0.1 scaling the viewBox about its center;
       withZoomedOut reverses it' (decides one step of each
       button: zoom 1.0 → 1.1 with the viewBox scaled about
       its own centre, then back to 1.0 at the original
       width); tests/flow-zoom-to-fit.test.ts
       'fitBoxToCanvas clamps zoom to MAX_ZOOM for tiny
       content with panel offset' (decides the upper clamp
       through the shared `MAX_ZOOM`); exploratory — the
       0.25 LOWER clamp, which no cited test asserts; the
       Auto-Fit refusal toast on the zoom BUTTONS (only the
       wheel path carries a test); tests/flow-fsm-reduce.test.ts
       'empty canvas click keeps a zoomed viewBox'
       (decides pointer-down + pointer-up on empty
       canvas leaves viewBox and zoom untouched)
- [ ] **F30** Edit a node name via the properties
  panel, wait 1 second for auto-save. Navigate
  away and return to the designer. PASS: all
  nodes, edges, and attributes persist.
  Positions persist only when Auto Layout is
  off — F18's second toggle left it on, so turn
  it off first to check that, and wait for the
  flow PUT before leaving. With Auto Layout on,
  boot re-lays-out to the current canvas, so a
  1-row snake may wrap to 2×2 on return —
  that is not a fail.
  Pin: tests/adapters-flow-mutations.test.ts 'putFlow
       persists every FlowSaveShape field' (decides a save
       survives a fresh read — the flow's own name and its
       node and edge counts);
       tests/flow-graph-relations.test.ts 'an added
       attribute is current with its payload' (decides an
       attribute ref's attributeId, mode, and isRequired
       are current on reassembly);
       tests/adapters-flow-queries.test.ts 'getFlowGraph
       lays out an auto-layout flow whose stored positions
       are placeholders' (decides the re-layout-on-load
       this case must not read as a fail); exploratory —
       the 800 ms debounce and the navigate-away/back cycle
- [ ] **F31** Navigate to
  `flows/detail.html?flowId=nonexistent`. PASS:
  page handles gracefully — shows error state,
  no unhandled JS exception.
  Pin: tests/loading-states.test.ts 'a rejecting fetch
       renders the error state and calls neither hook'
       (decides the designer's own `loadInto` renders the
       error state — with its Try Again affordance — and
       calls no data hook when the bundle fetch rejects,
       which a missing flow id makes it do); exploratory —
       the live console staying clean

### Flow Designer — Undo/Redo

(Undo is undo-as-replay: the server resolves the restore target
by replaying the flow's own document-message-pair history against
its own undo operation-message-pair history — a stack+pointer, so
a second consecutive undo goes FURTHER back rather than
oscillating, and a save after an undo-undo truncates the abandoned
branch. Redo is client-only, an in-memory stack
(`web-app/app/flow-history.ts`) cleared by `recordFlowMutation()`
on every committed content edit. `flow_versions` routes were
RETIRED and the table is DELETED; undo walks the flow's own
document-message-pair history only. The cases below verify the
toolbar buttons, the keyboard shortcuts, the disabled states, and
that the canvas re-renders after each step.)

- [ ] **F32** Return to Layout Test — F31 left the browser
  on an error page. Add a state with F15's port-drag and
  wait for the node count to rise — F19–F31 have saved since
  F15, and undo steps back exactly one save. Then click
  the Undo toolbar button. PASS: that state and its
  connecting edge are removed. Redo button
  becomes enabled.
  Pin: tests/api-flows-undo-redo-relations.test.ts
       'ADD-THEN-UNDO deletes the added node: pair graph
       omits it (working-not-target is a deletion)'
       (decides the added node leaves the message-plane
       graph on undo); tests/flow-operations.test.ts
       'performUndo: restores the previous save (one step
       back), and stages a redo entry' (decides the redo
       stack gains exactly one entry — what enables the
       button); tests/flow-history.test.ts 'canRedoFlowEdits
       is true iff redo stack is non-empty'; exploratory —
       the toolbar click and the button's live enabled
       state
- [ ] **F33** Click the Redo toolbar button. PASS:
  the state and edge reappear.
  Pin: tests/flow-operations.test.ts 'performRedo:
       re-applies the popped version, snapshots the current
       state, and marks undo available' (decides the popped
       version's graph is written back and read back from
       the message plane);
       tests/api-flows-undo-redo-relations.test.ts 'REDO
       round-trip: redo re-applies the delete after an undo
       revived it (X tombstoned again)'; exploratory — the
       toolbar click and the canvas repaint
- [ ] **F34** Ensure Auto Layout is **off** — F18's second
  toggle left it on, but F30 already turned it off, so
  check the switch rather than toggling blind; a blind
  toggle turns it back on and the restore below then
  re-flows instead (F37b). Then move a node and press Cmd+Z
  (Mac) or Ctrl+Z. PASS: node returns
  to its previous position, pixel-identical (see F37b for
  the auto-layout exception to this promise).
  Pin: tests/flows-detail-shortcuts.test.ts 'Cmd+z is undo'
       (decides the chord resolves to the undo action);
       tests/flow-undo-cursor.test.ts 'undo cursor: a
       single undo restores the previous save (one step
       back)' (decides the restore target is the save
       immediately before the head, not the head itself);
       exploratory — that the restored coordinates are
       pixel-identical; no test asserts node positions
       across an undo
- [ ] **F35** Toolbar Delete (`data-action="delete-selected"`)
  on a non-Create / non-Archive node, same as F27.
  Wait until that node is gone, then Undo. Do
  not use Backspace unless F38's `aria-current`
  is already true. PASS: the state and all
  its connected edges are restored.
  Pin: tests/api-flows-undo-redo-relations.test.ts
       'DELETE-THEN-UNDO revives the deleted node and its
       edge: pair graph includes them, latest state is
       'restored'' (decides that after the undo BOTH the
       node and the edge deleted alongside it are back in
       the message-plane graph, their tombstones
       superseded); tests/flow-operations.test.ts
       'performUndo: restores the previous save (one step
       back), and stages a redo entry'; exploratory — the
       toolbar drive and the canvas repaint
- [ ] **F36** Undo and Redo buttons are disabled
  when their respective stacks are empty.
  Re-open the flow — a fresh load stages no redo,
  and F32–F35 have filled the stack otherwise.
  PASS: the Redo button renders disabled. (Undo
  may stay enabled at exhaustion —
  `hasUndoHistory` is `pairs > 1`
  (`api/derive-flows.ts`) — and the click is a
  graceful server no-op.)
  Pin: tests/presenter-misc.test.ts 'buildToolbar disables
       undo, redo, and delete buttons when their actions
       are unavailable' (decides the `disabled` attribute
       renders on `data-action="undo"` and
       `data-action="redo"`); tests/flow-history.test.ts
       'canRedoFlowEdits is true iff redo stack is
       non-empty' (decides redo's enablement rule);
       tests/flow-undo-cursor.test.ts 'undo cursor: undo at
       exhaustion (nothing before genesis) is a graceful
       no-op — 204, no document pair, no graph change'
       (decides the exhausted click leaves the graph
       untouched); exploratory — the live button states
- [ ] **F37** Perform an action, undo, then perform
  a new action; let the new action's
  `PUT /api/organizations/:id/flows/:id` land —
  a panel rename saves `SAVE_DELAY_MS` = 800 ms
  after the last keystroke; do not click the
  canvas or another node before the PUT. PASS:
  the redo stack is cleared (redo button
  disabled).
  Pin: tests/flow-history.test.ts 'recordFlowMutation sets
       hasUndoHistory and leaves redo stack empty (F37)'
       (decides a committed content edit leaves the redo
       stack empty); tests/flow-history.test.ts
       'canRedoFlowEdits is true iff redo stack is
       non-empty' (decides the empty stack is what disables
       the button); exploratory — the 800 ms save and the
       live button state
- [ ] **F37a** Open the same flow in two tabs of the same
  jar. In tab A, edit
  a node name and let auto-save complete. In tab B (which
  still shows the pre-edit head), click Undo immediately.
  PASS: nothing looks wrong — no error toast, no stuck
  spinner, no console error surfaces to the user. Under the
  hood the stale-basis undo collides with tab A's save (HTTP
  412) and the client silently retries with a freshly
  resolved target against the new head — the 412-retry is
  invisible to the tester by design.
  Pin: tests/flow-undo-cursor.test.ts 'undo cursor: a 412
       on attempt 1 is absorbed — attempt 2 succeeds with
       no client-side baseline refetch' (decides the client
       absorbs the 412 and the second attempt lands without
       refetching a baseline); exploratory — the two live
       tabs and the absence of any user-visible error
- [ ] **F37b** Toggle Auto Layout back on if F34 turned it
  off, then add a node via F15's plain port-drag (no
  Shift). Wait until the node count rises by one, then
  Undo. PASS: the canvas restores to the pre-edit graph.
  Now make ANY new edit (e.g. rename a node). PASS: node
  positions may re-flow to the auto-layout orientation on
  this next edit — expected, not a regression: the
  server-resolved restore is canvas-less, and auto-layout
  re-computes positions on its own next content change.
  Pixel-identical restores are promised only for
  non-auto-layout (manually-positioned) flows, per F34.
  Pin: tests/api-flows-undo-redo-relations.test.ts
       'ADD-THEN-UNDO deletes the added node: pair graph
       omits it (working-not-target is a deletion)' (decides
       the added node is gone after the undo);
       tests/adapters-flow-queries.test.ts 'getFlowGraph
       lays out an auto-layout flow whose stored positions
       are placeholders' (decides an auto-layout flow's
       positions are recomputed rather than read back
       verbatim); exploratory — the re-flow landing on the
       next edit rather than on the undo

### Flow Designer — Keyboard Shortcuts

- [ ] **F38** Focus a `.flow-node` (Tab through
  chrome, or `js()` `.focus()` on the node) —
  do not Tab from document start expecting the
  first node. Tab through chrome lands on
  `svg.flow-canvas`, then the first `.flow-edge`
  or `.flow-node` in DOM order (the renderer emits
  every edge before every node) — that is PASS, not
  a skip. Wait for `aria-current="true"` before
  Delete / Backspace (F38) or Enter (F38b) / Space
  (F57a). Assert `aria-current="true"`; it
  also takes the selection (glow), panel closed.
  Press Delete or Backspace. PASS: the focused
  node is deleted; focus lands on `<body>`.
  Pin: tests/flow-canvas-tab.test.ts 'Tab from the canvas
       SVG enters the first item' (decides the very step
       this case's drive note describes:
       `nextCanvasTabIndex(4, -1, false) === 0`, and index
       -1 is exactly "focus is on the SVG, not an item");
       tests/flow-fsm-reduce.test.ts 'canvas-focus on an
       unselected node single-selects it with
       request-update and no open-panel' (decides the focus
       takes the selection without opening the panel);
       tests/flows-detail-shortcuts.test.ts 'Delete with
       canvas focus deletes' (decides the Delete chord
       resolves to the delete action when no editable
       target holds focus); tests/flow-operations.test.ts
       'performDeleteSelectedNodes: removes the selected
       intermediate node' (decides the delete lands);
       tests/browser/canvas-keyboard.test.ts 'Tab from the
       canvas enters the ring and marks the node' (decides
       Tab from the canvas reaches a node and marks exactly
       one `aria-current="true"`); exploratory — focus
       landing on `<body>` after the delete, and
       **Backspace**: `reduceDesignerShortcut` handles
       Delete and Backspace in one branch but only Delete
       is asserted
- [ ] **F38a** Focus a remaining `.flow-node`
  first (same chrome-first drive as F38).
  Next Tab moves to the next node or
  edge; from the last item it wraps to the first
  (DOM order) and never leaves the canvas.
  Selection follows the focus. With the panel
  open the camera pans to reveal the selection,
  zoom unchanged. Tab across a marquee-selected
  group keeps the group selected only while
  focus lands on one of its members — Tab
  order is DOM order (render order, not
  selection order), so the first tab onto a
  non-member collapses the selection to that
  node. PASS: focus and selection stay paired
  through every re-render.
  Pin: tests/flow-canvas-tab.test.ts 'Tab from the last
       canvas item wraps to the first';
       tests/flow-canvas-tab.test.ts 'Tab walks forward
       inside the ring'; tests/flow-canvas-tab.test.ts 'Tab
       outside the canvas ring is a no-op' (together decide
       the ring walks forward, wraps, and never leaves the
       canvas); tests/flow-fsm-reduce.test.ts 'canvas-focus
       collapses a foreign multi-selection to the focused
       node' (decides the marquee group collapses on the
       first non-member focus);
       tests/flows-detail-canvas-focus.test.ts 'a focusin
       outside a restore still promotes the focused node to
       the selection' (decides selection follows focus);
       tests/flow-designer-actions.test.ts
       'applyPanToRevealSelected centers a node, else null'
       (decides the pan-to-reveal, viewBox width and so
       zoom untouched); exploratory — the pairing surviving
       every live re-render
- [ ] **F38b** Tab to a node, press Enter — its
  panel opens and the node keeps focus through
  the re-render; Escape closes the panel and
  focus stays on the node. A mouse click
  selects without keeping focus. PASS:
  keyboard focus survives open and close.
  Pin: tests/flow-fsm-reduce.test.ts 'canvas-key-activate
       on a node single-selects it, opens the panel, and
       requests an update' (decides Enter on the focused
       node opens its panel);
       tests/flows-detail-shortcuts.test.ts 'Escape closes
       only an open panel' (decides Escape resolves to the
       close action only while a panel is open);
       tests/flows-detail-canvas-focus.test.ts
       'restoreCanvasFocus focuses the matching id once
       with preventScroll' (decides the rebuilt canvas
       re-focuses that same id, once);
       tests/browser/canvas-keyboard.test.ts 'Tab from the
       canvas enters the ring and marks the node' (decides
       Enter on a Tab-focused node renders
       `#prop-node-name` with exactly one node
       `aria-current="true"`); exploratory — focus staying
       on the node after Escape
- [ ] **F39** With Undo enabled, press Cmd+Z /
  Ctrl+Z — it matches the Undo toolbar button.
  Without a node click in between, press
  Cmd+Shift+Z / Ctrl+Shift+Z (the Shift-uppercased key is
  in `### Driving notes`) — it matches Redo. PASS:
  keyboard shortcuts match toolbar button
  behavior.
  Pin: tests/flows-detail-shortcuts.test.ts 'Cmd+z is
       undo'; tests/flows-detail-shortcuts.test.ts
       'Cmd+Shift+Z arrives as key Z and is redo';
       tests/flows-detail-shortcuts.test.ts 'Ctrl+Shift+z
       is redo' (the three decide that both chords resolve
       to the same 'undo' and 'redo' actions the toolbar
       buttons dispatch, including the Shift-uppercased
       key); exploratory — the live canvas result matching
       the buttons'

### Flow Designer — Additional Coverage

- [ ] **F40** Seed starts unlocked. First toggle of
  the Locked switch in the designer header locks:
  ports gone, `svg.flow-canvas` has
  `flow-canvas-locked`, node `<rect>` and
  edge vis-path `stroke` attributes are
  `hsl(var(--accent-text))`. Do not look for a
  CSS keyword `gold`. PASS: connection ports
  disappear from all middle nodes, the Delete
  toolbar button becomes disabled, and opening a
  properties panel shows panel controls as
  read-only (inputs `disabled`, every checkbox in
  the Members fieldset also `disabled` and
  unresponsive to clicks). Auto Layout remains
  enabled because it only repositions nodes
  without changing structure. Visual confirmation:
  locked strokes apply regardless of type (Create,
  Archive, Regular); edges use the same stroke
  (cycles remain dashed); edge-label backgrounds
  gain the same stroke; the dot-grid background
  renders unchanged from its unlocked appearance.
  Untoggle Locked: ports return, the Delete
  button re-enables, panel controls become
  editable, the Members checkboxes become
  interactive again, and per-type colors return
  (Create green, Archive red, Regular blue,
  Cycle amber).
  Pin: tests/flow-graph-locked.test.ts 'a locked canvas
       paints node and edge strokes as accent-text, not
       type colors' (decides `flow-canvas-locked` on the
       svg, the accent-text stroke, and that no per-type
       stroke survives); tests/flow-graph-locked.test.ts
       'an unlocked canvas keeps per-type strokes' (decides
       the untoggle restores them);
       tests/presenter-misc.test.ts 'buildNodePanel
       disables inputs when the flow is locked' (decides
       `#prop-node-name` and every `data-member-id`
       checkbox carry `disabled`);
       tests/flow-operations.test.ts
       'performDeleteSelectedNodes: locked flow fails'
       (decides a locked flow refuses the delete);
       exploratory — the per-type colours the untoggle
       restores (the locked tests decide only that the
       three tokens are present or absent as a set, never
       which kind wears which, and "Cycle amber" — the
       `WARN` token — is asserted nowhere); the ports
       disappearing; the Delete button's own disabled
       attribute; the edge-label backgrounds; and the dot
       grid
- [ ] **F41** With a non-trivial flow loaded,
  click "Copy Mermaid" in the toolbar. PASS: a
  visible success toast "Mermaid copied to
  clipboard" confirms the copy (toasts sit on
  `document.body`, outside `#page-root`), and
  the clipboard holds Mermaid flowchart syntax
  for the current graph.
  Pin: tests/mermaid.test.ts 'generateMermaid emits
       flowchart LR header' (decides what the clipboard
       receives is flowchart syntax);
       tests/mermaid.test.ts 'generateMermaid emits labeled
       edges' (decides the named transitions ride along);
       tests/flow-detail-toast-overflow.test.ts
       'flow-detail html/body do not clip fixed toasts'
       (decides this page does not clip the toast this case
       must see); exploratory — the clipboard write and the
       toast's own text
- [ ] **F42** Turn Auto Layout **off** on Layout Test first
  (F37b left it on): `postFlowFromBackup` copies
  `is_auto_layout` verbatim, and all four seeded flows ship
  it ON, so F44's preserved-position check is only
  observable from an archive taken with the flag off. Then
  click "Export ZIP" in the toolbar. PASS: a `.zip` file
  downloads. Unzip the archive — it contains `flow.mmd` (Mermaid
  source), `flow.json` (graph with node positions), `sidecar.json`,
  and a human-readable `flow.txt`.
  Pin: tests/adapters-flow-export.test.ts 'zip sidecar
       mermaid ids stay injective' (decides the archive
       this button writes carries a readable `sidecar.json`
       entry whose mermaid ids do not collide);
       tests/adapters-flow-export.test.ts 'zip mermaid path
       reads sidecar.json positions and begin edges'
       (decides the same archive's `flow.mmd` and
       `sidecar.json` both read back — the import path
       parses them straight out of `getFlowZip`'s output);
       tests/adapters-refresh-mutex.test.ts
       'cookie refresh re-scopes the session to the
       dead token org' (decides a cookie refresh
       exchanges the flat successor onto the dead
       token's org before `getFlowZip` reads
       `activeOrganization`); exploratory — the
       download itself, `flow.json` and `flow.txt`,
       and the four-entry manifest as a set
- [ ] **F43** On `flows/index.html` click "Import Flow", choose a
  project, click "Choose File", and select a `.mmd` file taken
  from a known flow — unzip F42's archive and use its
  `flow.mmd` — selecting the file imports it
  directly (no separate submit/confirm button; same shape as F5).
  PASS: the imported flow opens in the designer and renders
  nodes and edges. Do **not** look for attributes: mermaid
  is topology only, so a `.mmd` import carries no attribute
  refs on any node and their absence is the product working.
  Pin: tests/adapters-flow-export.test.ts 'flowchart mmd
       with begin round-trips through postFlowFromMermaid'
       (decides that `generateMermaid`'s own flowchart
       output — which is exactly what `flow.mmd` is —
       imports back with its edges intact:
       `assert.deepEqual(names, ['begin', 'submit'])`);
       tests/mermaid.test.ts 'mermaid drops node task
       instructions' (`assert.ok(!text.includes('SECRET
       INSTRUCTIONS'))` — decides that per-node payload
       beyond topology does not survive `generateMermaid`;
       attributes are a step further out still, absent from
       the format entirely, which is a source fact no test
       states); exploratory — the dialog drive, the
       designer opening on the import, and the absence of
       attribute rows
- [ ] **F44** Repeat F43 with F42's `.zip` archive — the one
  taken with Auto Layout off; an archive of any seeded flow
  as shipped carries `is_auto_layout: true` and the import
  copies that verbatim, so the imported flow would re-lay
  out and this case would read as a fail on healthy
  product. Because the
  archive names a flow and a project that both still exist,
  click **Create New** in the resolution dialog (F6's
  shape). PASS: the imported flow renders with node
  positions preserved, its Auto Layout switch off.
  Pin: tests/adapters-flow-export.test.ts 'zip Create New
       keeps begin edges and sidecar positions with Auto
       Layout off' (decides the Create New path yields
       `isAutoLayout === false` and every node's exported
       positionX/positionY verbatim); exploratory — the
       resolution dialog drive
- [ ] **F45** Return to Layout Test — F43 and F44 left
  the designer on an imported flow. The 11-step walk is
  required, not
  optional. Rename 11 nodes one at a time; after
  each name, wait for that flow's `PUT /api/
  organizations/:id/flows/:id` in the network log
  (the save fires `SAVE_DELAY_MS` = 800 ms after
  the last keystroke) before selecting the next
  node. Then click Undo 11 times. After each Undo
  click, wait for the **canvas name/graph to
  change**, not merely HTTP 201 (exhaustion 201
  with no canvas change is F36). PASS: every one
  of the 11 renames reverts in order — undo walks
  the flow's own full document-message-pair
  history (`FLOW_VERSION_CAP` and `flow_versions`
  are retired; there is no 10-edit bound). A
  further Undo that answers 201 with no canvas
  change, Undo still enabled, is F36 exhaustion
  (graceful server no-op), not a missed step.
  Pin: tests/flow-undo-cursor.test.ts 'undo cursor: eleven
       saves walk eleven undos — N10 back to genesis, no
       cap' (decides eleven saves are reachable by eleven
       undos, each landing on the preceding name, with the
       twelfth reaching genesis — the no-cap covenant);
       exploratory — the live rename drive and the
       per-undo canvas change
- [ ] **F46** Edit a flow (rename a state), let
  auto-save complete. Navigate away from the
  designer to `flows/index.html`. Re-open the
  same flow. Click Undo. PASS: after the list
  round-trip, Undo must revert the rename the
  same way (wait for the canvas name/graph to
  change, not merely HTTP 201). The undo history
  survived navigation because it is the flow's
  own message-pair history, persisted to the
  schema, not held in memory. Unlike before
  Phase 14, this persistence has no 10-edit
  bound (see F45). Graph and name are undo
  content; Locked, Auto Layout, and Auto Fit
  are guards that undo never flips and never
  counts. Opening a flow writes nothing.
  Pin: tests/flow-undo-cursor.test.ts 'undo after lock
       toggles reverts name not lock' (decides an undo
       across lock toggles reverts the flow name and leaves
       isLocked alone); tests/flow-undo-cursor.test.ts
       'undo cursor: a flag-only pair is not a step'
       (decides a flag-only save is skipped by the cursor
       and its flag value is carried forward, never
       restored); tests/flow-designer-open.test.ts 'opening
       a flow does not append pairs' (decides opening
       writes nothing); exploratory — the
       navigate-away/back round-trip and the live canvas
       revert

### Flow Designer — Flow Tags (API-only, no UI this phase)

(No manual browser case — Step 0 (Phase 14 Task 9) elected
API-ONLY: no designer affordance lands this phase. The
automated suite (`tests/api-flow-tags.test.ts`,
`tests/api-organization-isolation.test.ts`'s "nested
flows/:id/tags" fence case) is the sole coverage: PUT/GET/
DELETE lifecycle, Response-ID pinning survives further flow
saves, marked delete, member-tier authorization, two-tag
concurrency, and the org fence. A designer "tag current" action is tracked in
`TODO.md`.)

### Space Toggle (Pan Mode)

Pan mode is a toggle with no on-screen label: read it as the
`flow-pan-cursor` class on `.flow-canvas-wrap`, and set it as
each case requires before driving. F51–F53 need it OFF, or the
gesture pans instead of dragging, marquee-ing, or connecting.

- [ ] **F47** Toggle Auto-Fit **off** before
  F47–F49 pan (F29 left it on). After
  touching Auto-Fit (or any header switch), do
  **not** leave focus on that `button`: Space
  would activate it. Focus `svg.flow-canvas`
  (`tabindex="0"`) per `### Driving notes`, then
  send Space. PASS: a
  primary-colored outline appears around the
  canvas; the cursor becomes `grab` over canvas,
  nodes, and edges.
  Pin: tests/flow-fsm-reduce.test.ts 'space-toggle from off
       enables pan mode and emits cursor-on action'
       (decides Space with Auto Fit off sets `isPanMode`
       true and emits set-pan-cursor on);
       tests/flow-graph-locked.test.ts 'the canvas svg is a
       tab stop for Space pan' (decides the canvas carries
       `tabindex="0"` so it can take the focus this case
       needs); tests/browser/canvas-pan.test.ts 'Space
       toggles pan mode and a drag pans the viewBox'
       (decides a real Space keypress puts
       `flow-pan-cursor` on the canvas wrap); exploratory —
       the primary-coloured outline
- [ ] **F48** With pan mode on, tap the spacebar a second time.
  PASS: the outline disappears and the cursor returns to its
  default state.
  Pin: tests/flow-fsm-reduce.test.ts 'space-toggle from on
       disables pan mode and emits cursor-off action'
       (decides the second Space clears `isPanMode` and
       emits set-pan-cursor off);
       tests/browser/canvas-pan.test.ts 'Space toggles pan
       mode and a drag pans the viewBox' (its closing step
       decides the wrap loses `flow-pan-cursor` on the
       second Space); exploratory — the outline
       disappearing
- [ ] **F49** With pan mode on, drag the canvas, release, then
  drag again. PASS: both drags pan the viewport — pan mode
  persists across multiple drags until toggled off.
  Pin: tests/browser/canvas-pan.test.ts 'Space toggles pan
       mode and a drag pans the viewBox' (decides the first
       drag changes the canvas `viewBox` while pan mode is
       on); exploratory — the SECOND drag; no test drives
       two pans inside one pan-mode session
- [ ] **F50** Hold the spacebar down for two seconds without
  releasing. The first Space `keydown` must have
  `repeat: false`; hold may auto-repeat after that.
  PASS: pan mode toggles on exactly once; browser
  auto-repeat does not chatter the toggle.
  Pin: exploratory — the interaction layer's
       `if (ke.repeat) return` guard carries no CLI or
       browser test, and the FSM never sees the repeats
- [ ] **F51** Begin dragging a node — require an
  in-flight `dragging` gesture. While the drag is
  in flight, tap the spacebar. PASS: the drag
  completes unchanged; pan mode state is unchanged
  when the drag ends. Space mid-gesture must not
  toggle pan.
  Pin: tests/flow-fsm-reduce.test.ts 'space-toggle while
       dragging is ignored' (decides the reducer returns
       the identical state object and zero actions while a
       drag is in flight); exploratory — the live mid-drag
       keypress
- [ ] **F52** Begin a marquee selection on empty
  canvas — require an in-flight marquee. While the
  marquee is in flight, tap the spacebar. PASS:
  the marquee continues; pan mode state is
  unchanged when pointer-up resolves. Space
  mid-gesture must not toggle pan.
  Pin: tests/flow-fsm-reduce.test.ts 'space-toggle while
       marquee selecting is ignored' (decides the reducer
       returns the identical state object and zero actions
       while a marquee is in flight);
       tests/flow-fsm-scenarios.test.ts 'marquee drag
       covers two nodes → selection contains both
       (marquee)' (decides the marquee still resolves its
       selection at pointer-up); exploratory — the live
       mid-marquee keypress
- [ ] **F53** The flow must be unlocked (ports
  visible); do not start from a locked canvas.
  Shift-drag from a node port to begin a connect
  gesture. While connecting, tap the spacebar.
  PASS: the connect gesture continues; pan mode
  state is unchanged at pointer-up. Space
  mid-gesture must not toggle pan.
  Pin: tests/flow-fsm-reduce.test.ts 'space-toggle while
       connecting is ignored' (decides the reducer returns
       the identical state object and zero actions while a
       connect gesture is in flight); exploratory — the
       live mid-connect keypress
- [ ] **F54** With pan mode on and a pan drag in flight, tap the
  spacebar mid-drag. PASS: the pan drag continues; pan mode
  state is unchanged until the drag ends.
  Pin: tests/flow-fsm-reduce.test.ts 'space-toggle while
       panning is ignored' (decides the reducer returns the
       identical state object and zero actions while a pan
       is in flight); exploratory — the live mid-pan
       keypress
- [ ] **F55** Pan must be
  off first (F48 if pan is on), and Auto-Fit must
  be on — toggle it **on** if F47–F49
  turned it off. After touching the Auto-Fit
  button, move focus off it: focus
  `svg.flow-canvas` (`tabindex="0"`) per
  `### Driving notes`. If F29 just
  toasted the same Auto-Fit message, wait out
  `WHEEL_TOAST_COOLDOWN_MS` (2000) before the
  Space that must toast again. Then send Space
  once. PASS: an error
  toast appears ("Disable Auto-Fit to change
  the view"); pan stays off.
  Pin: tests/flow-fsm-reduce.test.ts 'space-toggle from off
       with autofit shows toast and stays off' (decides
       `isPanMode` stays false and an error-tone toast
       action is emitted); tests/browser/canvas-pan.test.ts
       'Space under Auto-Fit toasts and does not enter pan'
       (decides the real toast text appears and the wrap
       never gains `flow-pan-cursor`); exploratory — the
       2000 ms cooldown
- [ ] **F56** Pan mode cannot be entered while Auto Fit is
  on — that is the covenant F55 just proved — so build the
  starting state in this order: Auto Fit **off**, focus
  `svg.flow-canvas`, Space (pan **on**), Auto Fit **on**,
  and only then tap Space again. F55 leaves Auto Fit on and
  pan off, so skipping the first two steps gets the
  Auto-Fit toast and pan never turns on. Focus the canvas
  per `### Driving notes` (its F56 entry is this case's own
  trap: a canvas click starts a pan gesture, Space is then
  ignored by `isGestureActive`, and a leftover Auto-Fit
  toast reads like a fail). Send Space with no in-flight
  gesture. PASS:
  pan mode turns off cleanly with no toast —
  exiting pan mode is always permitted.
  Pin: tests/flow-fsm-reduce.test.ts 'space-toggle from on
       with autofit still toggles off' (decides `isPanMode`
       goes false and set-pan-cursor off fires even under
       Auto Fit); tests/flow-fsm-reduce.test.ts
       'space-toggle off under autofit still
       request-updates' (decides no show-toast action is
       emitted on that path);
       tests/flow-fsm-reduce.test.ts 'space-toggle while
       panning is ignored' (decides the very trap this case
       names — a pan gesture in flight swallows the Space);
       exploratory — the live focus drive
- [ ] **F57** Open a regular node's panel first — F56 left
  the focus on the canvas, and `#prop-node-name` exists
  only while a regular-node panel is open. Focus that input
  (not a node) and tap the spacebar. PASS: a literal
  space character is inserted into the input;
  pan mode state is unchanged.
  Pin: tests/flow-fsm-reduce.test.ts 'space-toggle while
       form-focused is ignored' (decides the reducer
       returns the identical state object and zero actions
       when a form field holds focus);
       tests/flows-detail-shortcuts.test.ts 'texty inputs,
       textarea, and select are editable targets' (decides
       a text input is the editable target that suppresses
       the canvas chord); exploratory — the space character
       landing in the input
- [ ] **F57a** Tab to a node, tap Space. PASS: the
  node's panel opens (Space activates the
  focused item); pan mode stays off.
  Pin: tests/flow-fsm-reduce.test.ts 'canvas-key-activate
       on a node single-selects it, opens the panel, and
       requests an update' (decides the activation path
       Space shares with Enter selects the node and emits
       open-panel:true); exploratory — pan mode staying
       off, which rests on the interaction layer's
       `defaultPrevented` guard and carries no test

### Members Selector (Node Panel)

- [ ] **F58** Open a regular-node properties panel on
  Layout Test. PASS:
  the Members fieldset is the first body block, with a
  "Members" legend, a HUMANS group containing one
  labeled `<input type="checkbox" data-member-id="<id>">`
  per active human (alphabetized by full name), and an
  AIs group containing one checkbox per AI member
  (alphabetized by name). When the checkbox list overflows
  the panel height, the fieldset scrolls inside its own
  region.
  Pin: tests/presenter-misc.test.ts 'buildNodePanel for a
       regular node lists the member checkboxes grouped
       Humans / AIs' (decides the `#prop-node-members`
       fieldset, the HUMANS and AIs group labels, and one
       `data-member-id` / `data-ai-member-id` checkbox per
       member, each carrying its name); exploratory — the
       `<legend>Members</legend>` text, which that test
       does not assert; the alphabetical order; the
       fieldset's position as the first body block; and the
       overflow scroll
- [ ] **F59** Tick one human checkbox. Reload the page
  and reopen the same node panel. PASS: that human
  checkbox is still ticked, and the flow's own
  `GET /api/organizations/:id/flows/:id` in the network
  log carries `memberIds: [<humanId>]` on that node. AI
  checkboxes are display-only (`data-ai-member-id`): they
  reflect stored `agentIds` and never write. The seed puts
  `agentIds` on Lead-to-Close alone, so Layout Test has no
  stored list to preserve here — that half of the covenant
  is a Layer 1 assertion, not a walk observation.
  Pin: tests/flow-designer-actions.test.ts
       'applyUpdateNode patches memberIds' (decides the
       tick patches memberIds on that node and leaves its
       siblings empty); tests/flow-graph-relations.test.ts
       'an added member with no later removal is current'
       (decides the added member is current on reassembly);
       tests/flow-designer-presenter.test.ts
       'buildFlowSaveShape keeps stored agentIds and person
       memberIds' (decides the save keeps stored agentIds
       while writing the human memberIds); exploratory —
       the reload-and-reopen round trip
- [ ] **F60** Untick the human checkbox. Reload the page
  and reopen the panel. PASS: the checkbox is unticked and
  the flow GET no longer carries that id in `memberIds`.
  Pin: tests/flow-graph-relations.test.ts 'a later removal
       drops the member' (decides the untick's removal
       event wins over the earlier add on reassembly);
       tests/adapters-flow-save-events.test.ts 'remove a
       member emits one removed event' (decides the save
       delta carries exactly one removed member event);
       tests/flow-designer-presenter.test.ts
       'buildFlowSaveShape keeps stored agentIds and person
       memberIds'; exploratory — the reload-and-reopen
       round trip
- [ ] **F61** Untick all human checkboxes so `memberIds`
  is `[]`. Reload the page. PASS: every human checkbox
  in the panel is unticked. The node now displays the
  danger badge per F73 if no humans remain.
  Pin: tests/presenter-misc.test.ts 'buildNodePanel marks
       currently assigned member checkboxes as checked'
       (decides the ticked state is drawn from `memberIds`,
       so an empty list ticks none);
       tests/flow-graph-hazard.test.ts 'zero members on a
       regular node renders danger' (decides the emptied
       node earns the danger level); exploratory — the
       reload round trip
- [ ] **F62** Lock the flow via the designer-header Locked switch.
  Open a regular-node panel. PASS: every checkbox in the
  Members fieldset is rendered with the `disabled`
  attribute; clicking does nothing. Untoggle Locked before
  moving on.
  Pin: tests/presenter-misc.test.ts 'buildNodePanel
       disables inputs when the flow is locked' (decides
       every `data-member-id` checkbox carries `disabled`);
       exploratory — the click doing nothing
- [ ] **F63** Open a Start-node panel. PASS: the header
  shows the "Create" title and close button — no
  Members fieldset (Create nodes never assign members).
  Pin: tests/presenter-misc.test.ts 'buildNodePanel renders
       the start node with its display label, not its
       stored name' (decides the start node's panel renders
       its own name and NOT the "State Properties" heading
       — and it is that heading's branch that carries the
       Members fieldset); exploratory — the close button
- [ ] **F64** Open an End-node panel. PASS: the header
  shows the "Archive" title and close button — no
  Members fieldset.
  Pin: exploratory — the sibling test 'buildNodePanel
       renders the complete node as Archive' asserts only
       that the string "Archive" appears somewhere in the
       output, which the regular-node branch satisfies from
       its own name input; nothing decides the Archive
       panel's shape
- [ ] **F65** Open an edge panel. PASS: the header shows
  "Transition Properties" title and close button — no
  Members fieldset.
  Pin: tests/presenter-misc.test.ts 'buildEdgePanel shows
       the transition name plus resolved From and To node
       names' (decides the panel renders "Transition
       Properties" plus the from and to names); exploratory
       — the close button and the absent fieldset
- [ ] **F66** MOOT (Phase Final). The `flow_versions` table
  is DELETED; there is nothing to inspect. Member
  assignment is captured only in the flow's own
  document-message-pair history (`message_pairs`) — F67
  confirms a `memberIds` change is still undoable through
  it. Record PASS (MOOT). Do not score DRIFT: the
  document already names the deleted table.
  Pin: tests/api-flows-versions-retired.test.ts 'pair-chain
       GET flow versions; table-backed vid 404' (decides
       the retired route 404s rather than serving a version
       row); exploratory — nothing left to drive
- [ ] **F67** Tick one checkbox in the Members fieldset,
  then wait for the `memberIds` PUT (`SAVE_DELAY_MS`
  800 ms) before Cmd+Z (Mac) / Ctrl+Z (Win/Linux).
  PASS: the panel stays open on that node and the
  checkbox unticks — `memberIds` changes are undoable
  like name changes.
  Pin: tests/api-flows-undo-redo-relations.test.ts 'MEMBER
       add + undo: the member is gone after undo' (decides
       the undo drops the added member from the
       message-plane graph); tests/flow-operations.test.ts
       'performUndo: keeps the panel open on a surviving
       node and restores memberIds' (decides `isPanelOpen`
       stays true, the selection stays on that node, and
       its memberIds revert);
       tests/flows-detail-shortcuts.test.ts 'a Members
       checkbox is not an editable target' (decides the
       chord is not suppressed by the just-clicked
       checkbox); exploratory — the live checkbox repaint

### Attribute Editor (Node Panel)

- [ ] **F68** On Customer Onboarding, double-click the
  **Review** node. In the
  "Attributes" fieldset, click the "+ Add Attribute…"
  dropdown. PASS: the picker lists the Customer Profile
  attributes Review does not already reference, sorted
  alphabetically — Annual Revenue, Company Logo, Contact
  Phone, Founded On, Industry, Number of Employees,
  Supporting Documents — loaded
  via `getRecordAttributesByRecord` from the nested
  `record-types/:id/attributes` collection on the message
  plane.
  (Regression for the captured-presenter bug in the
  attribute-picker handler: this exact click used to do
  nothing because the handler closed over a presenter
  captured at init time, which had no selection.)
  Pin: tests/adapters-flow-records.test.ts
       'getRecordForFlow returns the bound record id, or
       null if unbound' (decides which record the designer
       resolves for this flow);
       tests/adapters-record-attributes.test.ts
       'getRecordAttributesByRecord returns only the
       attributes for the given recordId' (decides the
       picker's source list is that record's own
       attributes); exploratory — the unreferenced-only
       filter and the click landing on the current
       presenter
- [ ] **F69** Continuing from F68, select **Industry**
  from the picker. PASS: the row "Industry" appears
  in the list with mode (Editable / Read-only) and
  required toggles. The dropdown remains available so
  additional attributes can be added.
  Pin: tests/flow-operations.test.ts
       'performAddAttributeRef: appends a ref to the single
       selected node' (decides the picked attribute is
       appended to that node and persisted);
       tests/flow-designer-actions.test.ts
       'applyAddAttributeRef appends to the matching node'
       (decides only the selected node gains the ref);
       exploratory — the row's mode and Required controls
       and the dropdown staying available
- [ ] **F70** Continuing from F69, click the remove ("×")
  control on the "Industry" attribute row. PASS: the row
  disappears from the attributes list, leaving Review as
  the seed had it.
  Pin: tests/flow-operations.test.ts
       'performRemoveAttributeRef: removes the ref from the
       single selected node' (decides the ref leaves the
       persisted node); tests/adapters-flow-save-events.test.ts
       'remove an attribute emits one removed event';
       tests/flow-graph-relations.test.ts 'a later removal
       drops the attribute' (decides the removal is current
       on reassembly); exploratory — the "×" control and
       the row disappearing
- [ ] **F71** Lock Customer Onboarding via the
  designer-header Locked switch.
  Reopen Review's panel and click the disabled
  "+ Add Attribute…" dropdown in the Attributes
  fieldset. PASS: nothing happens — no panel change,
  no toast, no attribute row appended (a disabled
  `<select>` does not fire `change`). Untoggle Locked
  before moving on; FS and F2 read this flow later.
  Pin: tests/flow-operations.test.ts
       'performAddAttributeRef: locked flow fails' (decides
       that even were a change to fire, a locked flow
       appends nothing); exploratory — the `<select>`'s own
       `disabled` attribute, which no test asserts, and the
       absent toast
- [ ] **F72** Reopen Review's panel. Tick one unticked
  human in the Members fieldset, then click the
  "+ Add Attribute…" dropdown in the same panel. PASS:
  the dropdown remains functional and lists Review's
  unreferenced record attributes. Untick that human
  again so Review returns to its two seeded members.
  (Regression: a `memberIds` commit
  replaces the presenter, so a click handler that
  captured a stale presenter would have acted on the
  pre-commit snapshot — this case proves the handler
  reads the current presenter at click time.)
  Pin: tests/flow-designer-presenter.test.ts 'a presenter
       built from withInteractionState reports the selected
       node, and the source presenter remains unchanged'
       (decides a commit yields a NEW presenter carrying
       the selection while the stale one is left untouched
       — the seam this regression rides);
       tests/flow-designer-actions.test.ts 'applyUpdateNode
       patches memberIds' (decides the tick and untick);
       exploratory — the picker still working after the
       member commit
- [ ] **F73 — Hazard severity rendering.** Back on Layout
  Test, on a regular
  (non-start, non-complete) node, vary the member count
  and outgoing-edge count and confirm the bottom-left
  badge:
    - **0 members** → red no-entry sign (`iconNoEntry`,
      `.flow-node-danger`). Hover → tooltip
      "Members required".
    - **0 outgoing edges** (regardless of member count) →
      red no-entry sign, tooltip "Dead end (no outgoing edges)"
      when `memberIds.length > 0`.
    - **1 member AND ≥1 outgoing edge** → yellow triangle
      (`iconAlertTriangle`, `.flow-node-warning`). Hover →
      tooltip "Single member assigned (no backup)".
    - **≥2 members AND ≥1 outgoing edge** → no badge.
  Confirm the start node and the complete node never
  display a badge regardless of state.
  Pin: tests/flow-graph-hazard.test.ts 'zero members on a
       regular node renders danger';
       tests/flow-graph-hazard.test.ts 'one member with no
       outgoing edges (dead-end) renders danger (precedence
       over warning)'; tests/flow-graph-hazard.test.ts 'one
       member on a regular node with outgoing edges renders
       warning'; tests/flow-graph-hazard.test.ts 'two or
       more members with outgoing edges renders no hazard';
       tests/flow-graph-hazard.test.ts 'a start node never
       renders hazard regardless of member count';
       tests/flow-graph-hazard.test.ts 'a complete node
       never renders hazard regardless of member count';
       tests/flow-graph-hazard.test.ts 'multiple members
       but no outgoing edges still renders danger (dead-end
       takes precedence)' (decides the "regardless of
       member count" half of the dead-end rung, which the
       one-member test alone does not reach:
       `shouldShowMemberHazard(buildNode('n1', ['hw_1',
       'hw_2', 'hw_3']), []) === 'danger'`) — the seven
       together decide every rung of the precedence ladder
       this case walks; exploratory — the painted icons,
       their bottom-left slot, and the hover tooltips
- [ ] **F74** With the Properties panel closed,
  confirm the flow canvas fills the content area
  to the right of the global sidebar (panel-aware
  fit honors `PANEL_WIDTH_PX`). Open the panel,
  pan the canvas (Auto Fit off and pan mode on, per
  F47), then close the panel via the X.
  PASS: pan/zoom/auto-fit/panel-toggle interactions
  read the *content-area* clientWidth, not the
  full viewport — the global sidebar does not
  steal canvas space.
  Pin: tests/flow-zoom-to-fit.test.ts 'fitBoxToCanvas with
       panelOffsetPx=0 reproduces today's full-canvas
       centered fit' (decides the panel-closed fit centres
       on the whole canvas width);
       tests/flow-zoom-to-fit.test.ts 'fitBoxToCanvas panel
       offset shifts content pixel position from
       full-canvas center to right-visible center (panel on
       left)' (decides the panel-open fit excludes the
       panel strip and nothing else);
       tests/flow-detail-toast-overflow.test.ts
       'flow-detail page-root clips the designer, not the
       viewport' (decides the designer is bounded by the
       content area, not the viewport); exploratory — the
       live content-area measurement
- [ ] **F75** Open the seeded "Layout Test: Proposal Review
  Cycle" with Auto Fit on — its layout routes edges beyond
  the node bounding box, its long back-edges arcing above
  the top row and dipping well below the bottom row. PASS:
  the whole graph, including the edge curves and waypoints
  that bow past the outermost nodes, sits inside the canvas
  with margin; nothing clips at any edge (the prior bug
  sliced the bottom routing). Then toggle Auto Fit off then
  on, add then delete an edge, and undo. PASS: every re-fit
  re-frames the full *drawn* content (curves included),
  never just the node rectangles — the camera measures the
  rendered SVG (`.flow-content` `getBBox`), not node
  positions.
  Pin: tests/flow-zoom-to-fit.test.ts 'fitBoxToCanvas
       viewBox contains a box that extends far beyond the
       node cluster' (decides a fitted viewBox contains the
       whole measured box, not merely the node rectangles);
       tests/flow-designer-presenter.test.ts 'withFitToBox
       frames a box that extends far below the nodes
       (edge/waypoint geometry)' (decides the presenter's
       own re-fit covers a deep dip on both top and bottom
       edges); tests/flow-designer-presenter.test.ts
       'withFitToBox re-fits the viewBox but does NOT move
       nodes (viewport op contract)' (decides the re-fit is
       a camera op, never an auto-layout); exploratory —
       the `getBBox` measurement itself and the painted
       margins

---

## F2. Workbox

### Workbox Source Flow

- [ ] **AA-WB-SETUP** Verify Customer Onboarding is
  READY in Create Work Order — its Review node names
  Sarah Chen and Emily Rodriguez. Workbox's Create Work
  Order draws only on flows the mock seed already
  publishes; it does not depend on any AA or F case
  creating one live.
  Pin: tests/mock-flow-readiness.test.ts 'mock admin sees
       Customer Onboarding and Lead-to-Close' (decides
       Customer Onboarding is READY); exploratory — the
       live dropdown listing and the Review node's member
       names

### Workbox Inbox (`workbox/`)

- [ ] **WB1** Navigate to `workbox/`. PASS: page shows
  "Workbox" title, subtitle "Your work order inbox",
  Active/Archive tabs, and a "Create Work Order" button
  (plus icon + label; mobile short label "Create").
  Pin: exploratory — the live page chrome; the shell text
       carries no CLI or browser test
- [ ] **WB2** With no work orders, the Active tab shows
  an empty state with mail icon and "No Active Work
  Orders Yet" message. The mock seed has active work
  orders, so verify against an org with none, or by
  component source.
  Pin: tests/workbox-inbox.test.ts 'buildInboxItems
       returns an empty array in active mode with no work
       orders' (decides the data is empty; the rendered
       empty-state copy itself, `emptyStateFor` in
       web-app/workbox/index.ts, carries no test);
       exploratory — the live empty-state render
- [ ] **WB3** Click the Archive tab. PASS: tab switches
  to show the archive list — the mock seed carries
  ≥ 129 completed work orders (of ≥ 145 seeded total:
  `buildWorkOrders()` seeds Customer Onboarding and
  Layout Test work orders, and `buildLeadToCloseWorkload()`
  — a second, easily-missed source — seeds 100 more for
  Lead-to-Close; all 145 are stamped into Stark and the
  inbox is org-scoped, so all land in this one list).
  Pin: exploratory — the live tab switch and list render;
       the seeded completed count (129 of 145: Customer
       Onboarding 33/39, Layout Test 5/6, Lead-to-Close
       91/100 — computed from `buildWorkOrders()` +
       `buildLeadToCloseWorkload()` and each work order's
       own embedded `flow_graph`'s `isArchive` node, the
       same test `curNode.isArchive` in
       web-app/app/presenters/workbox-inbox.ts applies
       live) carries no CLI test pinning these numbers

### Workbox — Create Work Order

- [ ] **WB4** Click "+ Create Work Order". PASS: a
  dropdown opens with up to two labeled sections — READY
  (clickable rows, one per publishable flow) includes at
  least Customer Onboarding and Lead-to-Close. It may
  hold more by now: E7, earlier in this walk,
  unconditionally creates a flow whose bare start+complete
  graph has zero non-exempt nodes, so
  `validateFlowForCreation` reports it `ready` with zero
  problems — a live third READY row — and F's own Flow
  Designer edits may add further flows still. NOT READY
  includes Fusion Angle Flow and Layout Test: Proposal
  Review Cycle — disabled rows for any flow with
  zero-member or dead-end nodes, each carrying a red
  no-entry icon and a subtitle "1 node needs attention"
  or "N nodes need attention". Their exact problem counts
  (16 and 15 in the untouched seed) may also have drifted:
  F's Flow Designer cases (F19, F32–F39) edit Layout
  Test's own graph earlier in this walk. Hover a NOT
  READY row. PASS: cursor stays default (no `pointer`),
  `aria-disabled="true"` is present, no `data-flow-id`
  attribute.
  Pin: tests/mock-flow-readiness.test.ts 'mock admin sees
       Customer Onboarding and Lead-to-Close' (decides the
       untouched seed's exact READY pair and NOT READY
       problem counts — a fact about the seed alone, not
       a live guarantee once E7 and F have run);
       exploratory — the live dropdown's exact contents
       by the time F2 is reached, the NOT-READY subtitle
       text and its node-count wording (the adapter test
       pins `problemCount`; whether the page glue's
       subtitle string reflects that exact number live is
       unverified by any test), `aria-disabled="true"`,
       the no-entry icon, and the hover cursor
- [ ] **WB4a** Click a `NOT READY` row. PASS: nothing
  happens — the dropdown stays open, no navigation occurs
  (the click handler ignores rows without
  `data-flow-id`).
  Pin: exploratory — the live no-op click; the handler's
       `data-flow-id` guard carries no CLI or browser
       test
- [ ] **WB5** Click Customer Onboarding from the READY
  section. PASS: work order is created, browser navigates
  to the action screen at the first post-start state
  ("Data Capture"). Display ID (8-char hex) is visible in
  the header.
  Pin: tests/adapters-work-orders.test.ts
       'postWorkOrderCreation seeds work order, flow
       link, and three state events in one call' (decides
       creation lands the work order at the flow's
       post-start node, not the Create node itself);
       exploratory — the live click, navigation, and
       Display ID render
- [ ] **WB5a** Click the Data Capture → Review `submit`
  edge to select it, then click the Delete (trash)
  toolbar button — F28's own gesture. Reload Workbox and
  open Create Work Order. PASS: the subject sits in
  `NOT READY` with subtitle "1 node needs attention".
  Restore the edge the same way (or via Undo), reload.
  PASS: the subject returns to `READY`.
  Pin: tests/adapters-flow-publish.test.ts
       'validateFlowForCreation flags dead_end on a
       non-End node with zero outgoing edges' (decides
       the dead-end detection this edge removal
       exercises); exploratory — the live edge-select +
       delete gesture and the reload/dropdown re-check
- [ ] **WB5b — Server-side gate.** No manual browser
  verification is needed — the production IIFE bundle
  does not expose `postWorkOrderCreation` on the console,
  so a DevTools-driven check is not available against the
  deployed build. This case PASSES by virtue of automated
  coverage alone.
  Pin: tests/adapters-flow-publish.test.ts
       'validateFlowForCreation reports ready when every
       regular node has a member and an outgoing edge';
       tests/adapters-flow-publish.test.ts
       'getFlowsForCreation partitions ready and notReady
       flows'

### Workbox — Action Screen (`workbox/detail.html`)

- [ ] **WB6** The action screen shows: back button
  (icon-only), flow name, display ID, current state
  badge, and dynamically rendered attributes matching the
  current node's attribute references from the flow
  graph.
  Pin: tests/presenter-workbox-detail.test.ts
       'WorkboxDetailPresenter exposes id, display id,
       and flow name from the work order';
       tests/presenter-workbox-detail.test.ts
       'renderableAttributes are the current node refs
       and buildPage renders a labeled input per required
       attribute with a marker'; exploratory — the live
       back button and state badge
- [ ] **WB7** Attribute types render correctly: text
  inputs, selects, number inputs, date inputs,
  checkboxes, and radio buttons as appropriate for each
  attribute type in the flow definition.
  Pin: tests/presenter-workbox-detail.test.ts
       'buildAttributeInputHtml renders a text input
       carrying the attribute id';
       tests/presenter-workbox-detail.test.ts
       'buildAttributeInputHtml renders a number input for
       the number attribute type';
       tests/presenter-workbox-detail.test.ts
       'buildAttributeInputHtml renders a date input for
       the date attribute type';
       tests/presenter-workbox-detail.test.ts
       'buildAttributeInputHtml renders a select with one
       option per choice plus a placeholder';
       tests/presenter-workbox-detail.test.ts
       'buildAttributeInputHtml renders a radio group with
       one collectable input per option';
       tests/presenter-workbox-detail.test.ts
       'buildAttributeInputHtml renders a bare checkbox
       input for the checkbox type'
- [ ] **WB8** Transition buttons appear below the
  attributes, one per outgoing edge from the current
  node, labeled with the edge name.
  Pin: tests/presenter-workbox-detail.test.ts 'buildPage
       renders one transition button per outgoing edge
       and a release button when the work order is not
       complete'
- [ ] **WB9** A "Release Work Order" button is visible,
  separate from transition buttons.
  Pin: tests/presenter-workbox-detail.test.ts 'buildPage
       renders one transition button per outgoing edge
       and a release button when the work order is not
       complete' (the same test decides both)
- [ ] **WB10** A collapsible History section shows all
  transitions with from/to state names, user name, and
  relative timestamp.
  Pin: tests/presenter-workbox-detail.test.ts 'buildPage
       shows a single Created -> Triage history row for a
       freshly created work order';
       tests/presenter-workbox-detail.test.ts 'buildPage
       history lists transitions newest first with their
       attribute values'; exploratory — the collapsible
       interaction and the relative-timestamp formatting
       live
- [ ] **WB10a — Bind picker on an unbound WO.** Open an
  unbound work order on a flow that has a record-type
  join and at least one instance. PASS: header shows an
  Unbound badge; a "Bind instance" button is visible;
  clicking it opens the bind-instance dialog listing
  instances for the flow's record type (rows use
  `data-instance-pick`, never `data-attribute-id`);
  picking an instance PUTs `work-orders/:id/binding`
  (201), the dialog closes, and the screen re-presents
  with a bound Instance badge and pre-filled values from
  the instance head.
  Pin: tests/presenter-workbox-detail.test.ts 'buildPage
       unbound disables fields, shows bind prompt and
       picker button';
       tests/presenter-workbox-detail.test.ts 'buildPage
       pre-fills inputs from instance values and shows a
       bound badge'; tests/api-work-order-binding.test.ts
       'fresh bind → 201; detail + list embed; unbound
       omits keys'; exploratory — the live dialog
       open/close and the click-to-pick gesture
- [ ] **WB10b — Disabled fields + bind prompt.** On an
  unbound work order with current-node attribute refs.
  PASS: every attribute input is disabled/readonly with
  title "Bind an instance before editing values"; the
  bind button from WB10a is the path to enable editing.
  Pin: tests/presenter-workbox-detail.test.ts
       'buildAttributeInputHtml force-disables with bind
       prompt title when unbound';
       tests/presenter-workbox-detail.test.ts 'buildPage
       unbound disables fields, shows bind prompt and
       picker button'

### Workbox — Transitions

- [ ] **WB11** Bind an instance, fill Company Name and
  Contact Email, click `submit` → Review. PASS: transition
  POSTs `work-orders/:id/transition` (201), work order
  moves to the next state, browser navigates back to the
  inbox. The work order appears in the Active tab
  (unclaimed).
  Pin: tests/api-work-order-transition-instance.test.ts
       'value-bearing fresh If-Match → 204; head advances'
       (its own assertion checks `res.status === 201`,
       despite the test's stale name); exploratory — the
       live form fill and the navigation back to the inbox
- [ ] **WB16** Read the network log across WB11's bind
  and transition (never `js()` fetch — the bearer is
  memory-only, per the explorer prompt). Snapshot
  Performance *before* the inbox navigation lands;
  a later `getEntries()` after navigation is not
  this case. If the transition POST is missing from
  the buffer because navigation dropped it, record
  BLOCKED naming that — an honest BLOCKED costs
  nothing. PASS: the
  binding PUT lands at `work-orders/:id/binding` with
  `{instance_id, record_type_id}` (201); the transition
  POST is `work-orders/:id/transition` (201) whose body
  is the **instance shape** (`targetState`, `instance_id`,
  `record_type_id`, `set`/`clear` delta, `release`,
  `transitionAt` — no `fieldValues` bag) and carries a
  strong `If-Match` against the instance etag; a pure move
  omits `set`/`clear`/`instance_id`/`record_type_id` and
  sends no `If-Match`; a sibling instance revision pair
  advances the head when the transition was value-bearing.
  Derived WO history is `(at, id)` DESC (index 0 =
  current) with one non-claim event per transition
  (`entity_id` = work-order id, `state` = target node id,
  `member_id` = actor, `at` = RFC-3339 Zulu). Live form
  values come from the instance head, not a history fold.
  Pin: tests/api-work-order-binding.test.ts 'fresh bind →
       201; detail + list embed; unbound omits keys';
       tests/api-work-order-transition-instance.test.ts
       'value-bearing fresh If-Match → 204; head advances'
       (its own assertion checks
       `instancePairCount === before + 1` — decides the
       sibling revision pair advancing the head);
       tests/api-work-order-transition-instance.test.ts
       'pure move WITH If-Match → 400' (decides a pure
       move sending an If-Match is rejected, so a
       succeeding one sent none);
       tests/api-work-order-transition-instance.test.ts
       'pure move carrying instance_id → 400';
       tests/api-work-order-transition-instance.test.ts
       'pure move carrying record_type_id → 400' (both
       decide a pure move must omit them);
       tests/api-work-order-history.test.ts 'GET
       organizations/:id/work-orders/:id/history returns
       200 DESC rows; row[0] is current; transition
       carries field_values; claim rows carry []';
       exploratory — the live network-log read itself
- [ ] **WB12** Click the work order row in the Active
  tab. PASS: work order PUTs `work-orders/:id/claim`
  (201) and the browser navigates to the action screen
  showing the new state's attributes.
  Pin: tests/api-work-order-claim.test.ts 'a fresh claim
       appends one claimed event'; exploratory — the live
       navigation and rendered attributes
- [ ] **WB13** Click "Release Work Order". PASS: a single
  click DELETEs `work-orders/:id/claim` (204),
  soft-releases the active claim, and the browser
  navigates to the inbox, where the work order reappears
  in the Active tab.
  Pin: tests/api-work-order-release.test.ts 'release of a
       live claim is 204 and the claim history shows
       claim_released'; exploratory — the live navigation
       back to the inbox and the reappearance in Active
- [ ] **WB13a — Claim → unclaim → reclaim.** From the
  Active tab, click the same work order again (claim).
  PASS: action screen opens under the caller's claim.
  Click "Release Work Order" (unclaim via DELETE claim).
  PASS: back on the Active tab unclaimed. Click the row a
  third time (reclaim). PASS: claim succeeds again; the
  message plane carries the sequence
  `claimed` → `claim_released` → `claimed` under the
  `(at, id)` order for this work order's `entity_id`
  (inspect via `GET work-orders/:id/history` or the
  matching operation message pairs).
  Pin: tests/api-work-order-claim.test.ts 'a released
       claim allows a fresh claim' (decides exactly this
       claim→release→reclaim sequence and its event
       ordering); exploratory — the live three-click UI
       sequence
- [ ] **WB19** Subject: the bound Active WO from
  WB11–WB13 (still Active; WB14 archives it). Skipping
  because "WO already archived" is FAIL. After
  transitioning a work order through at least two states,
  read the derived history (`GET work-orders/:id/history`
  or the matching pairs in `message_pairs`) for this work
  order's id. PASS: rows are `(at, id)` DESC (index 0 =
  current); each non-claim event has the immutable shape
  `{id, entity_id, state, member_id, at, field_values}`,
  with `state` carrying the target node's identifier.
  Live values live on the instance head; history
  `field_values` may be empty for new-shape transitions.
  Pin: tests/api-work-order-history.test.ts 'GET
       organizations/:id/work-orders/:id/history returns
       200 DESC rows; row[0] is current; transition
       carries field_values; claim rows carry []';
       tests/derive-work-order-lifecycle-for.test.ts
       'workOrderHistoryFor: folds field_values onto
       transition events, [] on claim/birth/release, DESC
       current-first'; exploratory — that no app code path
       ever mutates an existing pair (an architectural
       invariant, not a single assertion)
- [ ] **WB19a — Two-tab 412 on the action screen.**
  Subject: the same bound Active WO from WB11–WB13;
  skipping because "WO already archived" is FAIL. Bind a
  work order to an instance. Open the action screen in
  two tabs. In tab 2, change an instance value via the
  records detail instance editor (or a second transition)
  so the head etag advances. In tab 1, edit a value and
  transition. PASS: tab 1 receives 412, re-GETs the
  instance, re-presents the action screen with a conflict
  notice and a warning toast ("This instance changed
  underneath you — values refreshed; re-apply your
  edit"), and does **not** auto-retry the transition.
  Pin: tests/api-work-order-transition-instance.test.ts
       'value-bearing stale If-Match → 412' (decides the
       server 412 when a transition's held etag is
       stale); exploratory — the live re-GET, the
       conflict notice, and the absence of auto-retry (no
       CLI or browser test exercises workbox/detail.ts's
       client-side 412 recovery; `WorkboxDetailPresenter`'s
       `conflictNotice` rendering carries no test either)
- [ ] **WB19b — Direct instance PATCH vs transition 412
  convergence.** Subject: the same bound Active WO from
  WB11–WB13; skipping because "WO already archived" is
  FAIL. With a bound WO open on the action screen, PATCH
  the same instance from the record detail UI (save) so
  the head advances; then attempt a value-bearing
  transition on the stale action screen. PASS: same 412
  recovery shape as WB19a. Conversely, after a successful
  **value-bearing** transition (set/clear + If-Match —
  Review fills Reviewer Notes), a stale instance Save on
  record detail 412s and recovers — drive the converse as
  a plain instance Save from record detail, never as a WO
  transition: Review has two outgoing edges, and its
  `approve` edge archives the WO — exactly the transition
  WB14 still needs to drive later (value-bearing, with
  Reviewer Notes), so do not pre-empt it here. A
  **pure move** (no set/clear, no If-Match) does not
  advance the instance etag; a Save with the held etag is
  201, not a FAIL.
  Pin: tests/adapters-work-orders.test.ts
       'postWorkOrderTransition 412s when the snapshot etag
       is stale against a concurrent PATCH' (decides the
       forward direction: an instance PATCH advances the
       etag, so a stale-etag transition afterward 412s);
       tests/api-work-order-transition-instance.test.ts
       'value-bearing transition then stale instance PATCH
       is 412' (the converse direction);
       tests/api-work-order-transition-instance.test.ts
       'pure move does not advance instance etag; held
       If-Match PATCH is 201';
       tests/presenter-record-instances.test.ts 'edit form
       surfaces 412 conflict notice' (record detail's own
       conflict-notice render); exploratory — the live
       re-present and warning toast on the workbox action
       screen specifically

### Workbox — Completion

- [ ] **WB14** Transition a work order to the completion
  (Archive) node (its `isArchive` is true) — on Review
  fill Reviewer Notes and click `approve`. PASS: work
  order moves to the Archive tab. It no longer appears in
  Active.
  Pin: tests/workbox-inbox.test.ts 'buildInboxItems shows
       a finished work order in archived mode and hides
       it from active'; exploratory — the live transition
       and tab move
- [ ] **WB15** Click a completed work order in the
  Archive tab. PASS: action screen shows read-only view
  with history but no attributes or transition buttons.
  Pin: tests/presenter-workbox-detail.test.ts 'buildPage
       on a complete work order hides the attributes
       card, transition buttons, and release button';
       exploratory — the live read-only render

### Workbox — Data Integrity

- [ ] **WB17** Navigate away from the action screen and
  return. PASS: all data persists correctly across page
  navigation.
  Pin: exploratory — page-navigation data persistence has
       no CLI or browser test

### Workbox — Concurrency & Integrity

- [ ] **WB18** Open the same unclaimed work order in two
  browser tabs. In tab 1, click the row to claim it. In
  tab 2, attempt the same. PASS: tab 2 either navigates to
  a read-only/already-claimed view or the claim is
  rejected — and the message plane carries at most one
  live `'claimed'` event for this work order's `entity_id`
  under the `(at, id)` reduction (a stale prior claim is
  superseded by a `'claim_expired'` event, never
  overwritten in place). Inspect via `message_pairs` or
  derived `GET work-orders/:id/history` (DESC; claim rows
  carry `field_values: []`).
  Pin: tests/api-work-order-claim.test.ts 'a live claim by
       another member is a 409';
       tests/api-work-order-claim.test.ts 'two-actor
       contention: exactly one claimed event lands and
       exactly one request gets the byte-exact 409 body —
       never which actor wins';
       tests/api-work-order-claim.test.ts 'an expired claim
       is superseded atomically' (the general
       never-overwritten-in-place invariant, though this
       specific live two-tab drive is unlikely to trigger
       an actual expiry); exploratory — tab 2's rendered
       read-only/already-claimed view specifically

### Workbox — All-See-All Visibility

Every authenticated user sees every active and archived
work order regardless of node assignment. There is no
per-user visibility filter.

- [ ] **WB20** As the demo user, navigate to `workbox/`.
  Active tab. PASS: every active (non-completed) work
  order is listed, claimed or not — a claim does not hide
  the row; the row names its claimant (`claimedByName`
  badge). Listed regardless of the current node's
  `memberIds` — including nodes assigned only to AI
  members and nodes with zero members (which carry the
  danger badge in the designer but are still visible in
  the inbox).
  Pin: tests/workbox-inbox.test.ts 'buildInboxItems
       surfaces a claimed, unfinished work order as an
       active item naming its claimant';
       tests/workbox-inbox.test.ts 'buildInboxItems
       surfaces an unclaimed, in-progress work order as an
       active item'; exploratory — the live rendering for
       AI-only-member and zero-member nodes specifically
       (no fixture in tests/workbox-inbox.test.ts uses
       either)
- [ ] **WB21** Switch to the Archive tab. PASS: every
  completed work order is listed regardless of which
  member(s) the final transition referenced.
  Pin: tests/workbox-inbox.test.ts 'buildInboxItems shows
       a finished work order in archived mode and hides
       it from active'; exploratory — that the member(s)
       the final transition referenced do not affect
       Archive-tab visibility (no fixture varies this)
- [ ] **WB22** Inspect
  `web-app/app/presenters/workbox-inbox.ts`. PASS:
  `buildInboxItems` takes
  `(workOrders, transitions, claims, memberMap, mode)`
  with no scope parameter. The presenter exports nothing
  related to per-user visibility — the workbox shows all
  work orders to all users by construction.
  Pin: exploratory — confirmed directly by reading
       `buildInboxItems`'s exported signature (five
       parameters, no scope parameter); a function
       signature is not something a `node:test` assertion
       decides

---

## FS. Flow Statistics

**Mock-data blast radius:** the mock seed adds ~38 work
orders to "Customer Onboarding" and ~6 to a second flow,
plus their flow-work-order join rows and transition
chains — Workbox cases (WB1–WB22) and dashboard counts
elsewhere in the walk are lower bounds, not equalities,
because of this.

Hover/click on SVG `<g>` is compositor-mouse
driveable on this page (no pointer-capture
FSM, unlike `flows/detail`).

### Flow Statistics Page (`flows/stats.html`)

- [ ] **FS1** From `flows/index`, click a flow card's chart
  icon → lands on `flows/stats.html?flowId=<id>`. The page
  renders the heat-tinted SVG canvas, a path stepper, and a
  legend gradient bar. No left toolbar, no slide-in props
  panel, no connection ports, no marquee. The cursor over a
  node is `pointer` (clicking is allowed); no port-drag
  affordance appears.
  Pin: tests/navigation.test.ts 'buildPageUrl appends
       flowId param for flow-stats';
       tests/presenter-flow-stats.test.ts 'emits an
       svg with role=img and no editor affordances';
       tests/presenter-flow-stats.test.ts 'buildLegend:
       structure, end labels, no linear-gradient';
       tests/presenter-flow-stats.test.ts
       'buildStepperBar idx 0: path label, 75%, prev
       disabled'; exploratory — the left toolbar,
       props panel, and marquee absent from the page
       shell, and the pointer cursor over a node
- [ ] **FS2** From `flows/detail`, click the Stats button in
  the header → same stats page. The "Designer" / back button
  returns to `flows/detail.html?flowId=<id>` (and preserves
  `projectId` if set).
  Pin: exploratory — the live Stats/back navigation
       and the preserved `projectId`
- [ ] **FS3** Node tints span the ramp on the flagship flow
  ("Customer Onboarding"): Data Capture is yellow/red (hot),
  Review is warm, Create/Archive carry the cool (or no-data)
  tint. Node faces show the em-dash on Create and Archive and
  a value like `8.5m` / `2.1d` on regular nodes.
  Pin: tests/presenter-flow-stats.test.ts 'each node
       carries style="--heat-t:..." and no data-heat';
       tests/presenter-flow-stats.test.ts 'regular
       nodes show avg-sojourn face; special nodes show
       —'; exploratory — the painted color ramp
       (yellow/red hot, warm, cool/no-data)
- [ ] **FS4** Hover a node → a read-only stat card pops near
  it with: % of flow time, avg/median/p90 durations, visits /
  distinct WOs / Here now, ~N/wk throughput, loop-back rate, clan
  size + active producers, top producer (name + % of clan avg
  + % of node's work, with "(not in current clan)" iff
  applicable). For a branch node, `next` shows the per-edge
  split. The card has NO inputs and NO Save button.
  Mouse-out → card hides. Review's card subtitle names
  the two reviewers.
  Pin: tests/presenter-flow-stats.test.ts 'rich card
       renders all stat blocks for a regular node';
       tests/presenter-flow-stats.test.ts 'top producer
       not in clan is flagged'; exploratory — the live
       hover/mouse-out interaction, and the card's lack
       of inputs and a Save button
- [ ] **FS5** Click a node → the card pins (stays open on
  mouse-out). Click empty canvas → unpins. Click another
  node → re-pins to it.
  Pin: exploratory — the live click-to-pin,
       click-to-unpin, and re-pin interactions
- [ ] **FS6 — Hazard severity rendering on the stats
  canvas.** The stats renderer reads `n.memberHazard`
  emitted by `flow-stats-aggregate.ts`: `danger` for a
  zero-member node or a dead end (no outgoing edges,
  which takes precedence over a bare headcount),
  `warning` for exactly one member with an outgoing
  edge, and no badge for two or more members or for a
  Create/Archive node. On "Customer Onboarding" in the
  mock seed, Data Capture and Review each carry two
  members with an outgoing edge. Confirm: none of the
  four nodes (Create, Data Capture, Review, Archive)
  shows a hazard triangle. Zero-member danger, dead-end
  danger, and single-member warning are the CLI
  covenants in `tests/flow-stats-aggregate.test.ts` and
  `tests/flow-graph-hazard.test.ts`; this flow does not
  exhibit those shapes, and that is not a FAIL.
  Pin: tests/flow-stats-aggregate.test.ts 'memberHazard
       is danger on zero-member regular nodes (per
       shouldShowMemberHazard)';
       tests/flow-stats-aggregate.test.ts 'memberHazard
       is warning on single-member regular nodes with
       outgoing edges';
       tests/flow-stats-aggregate.test.ts 'memberHazard
       is null on multi-member regular nodes with
       outgoing edges';
       tests/flow-graph-hazard.test.ts 'one member with
       no outgoing edges (dead-end) renders danger
       (precedence over warning)';
       tests/flow-graph-hazard.test.ts 'a start node
       never renders hazard regardless of member count';
       tests/flow-graph-hazard.test.ts 'a complete node
       never renders hazard regardless of member count';
       tests/presenter-flow-stats.test.ts 'warning
       hazard glyph appears when memberHazard is
       warning';
       tests/presenter-flow-stats.test.ts 'danger
       hazard glyph appears when memberHazard is
       danger'; exploratory — the absence of any
       triangle glyph on the four painted nodes
- [ ] **FS7** On the flagship flow ("Customer Onboarding"),
  the path stepper reads `Path 1 of M · X% of N work
  orders` with prev/next controls. Clicking next advances;
  the selected path's nodes + edges get an accent stroke and
  off-path elements dim to ~30% opacity. The highlight does
  NOT pulse or animate (deliberately distinct from the
  editor's selection glow). At the last visible path, next is
  disabled (or, if there's a rest bucket, advances to
  "+N rarer paths, combined Z%" which highlights nothing).
  Pin: tests/presenter-flow-stats.test.ts
       'buildStepperBar idx 0: path label, 75%, prev
       disabled'; tests/presenter-flow-stats.test.ts
       'buildStepperBar idx 1: prev not disabled';
       tests/presenter-flow-stats.test.ts
       'buildStepperBar idx 2: rest entry, next
       disabled'; tests/presenter-flow-stats.test.ts
       'highlight set marks on-path and dims off-path
       nodes/edges'; tests/presenter-flow-stats.test.ts
       'emits an svg with role=img and no editor
       affordances'; exploratory — the live click
       advancing the stepper, the accent stroke's
       painted appearance, and the dimmed opacity's
       painted value
- [ ] **FS8** Dark-mode toggle persists across navigation to
  the stats page; the heat tints and the card remain legible
  in both themes. The face number text contrasts adequately
  at all heat levels.
  Pin: exploratory — the painted contrast of tints
       and card text in both themes, and that the
       theme choice itself persists across
       navigation to the stats page; a similarly-
       named existing test does not decide the
       persistence — it stubs `matchMedia` to
       `matches: true` and never distinguishes the
       theme module's own `'system'`-default
       fallback (which independently computes
       'dark' from that same stub) from an actual
       hydration of the stored value, so it stays
       green even with hydration deleted entirely
- [ ] **FS9** Data-shape regression: heat fractions sum to
  ~100% across non-special nodes on the flagship flow. WIP
  counts in the card match the WOs currently sitting in each
  node (cross-check against the Workbox). Direct navigation
  to `flows/stats.html` with no `flowId` redirects to
  `flows/index.html`.
  Pin: tests/flow-stats-aggregate.test.ts 'attributes
       sojourns and computes heatPct + heatT';
       exploratory — the cross-check of the card's
       WIP count against the Workbox, and the redirect
       when `flowId` is absent

---

## G. Admin Pages

### Organization (`organization/index.html`)

- [ ] **G9** Navigate to `organization/index.html`. PASS:
  page wears the standard sidebar + top-bar layout. Shows
  the page header "Organization" with an Edit button, then
  an Overview card holding the org identity (read-only
  Organization Name and Domain) above a four-cell stat grid
  (Active People, Projects, Ideas, Next Billing — no health
  badge), then the Objectives box, then the Usage Overview
  card with progress bars. There is no separate General
  Information card — the read-only Name/Domain live in the
  Overview card and Edit lives in the page header — and no
  longer a Security & Administration card; Members and
  Billing are reached from the sidebar. (Overview/usage
  values are placeholders — verify the page renders
  without error; numeric accuracy arrives when wired to
  live tables.)
  Pin: tests/presenter-projects-organization.test.ts
       'OrganizationPresenter.buildPage renders the org
       name, domain, and an Edit action' (decides the
       Overview card's Name/Domain and the header Edit
       action);
       tests/presenter-projects-organization.test.ts
       'OrganizationPresenter.buildPage renders overview
       stats and usage bars with
       XXZruirZyAOoRpNxaDnpSA/limit values' (decides the
       Active People stat cell and a "current / limit"
       Usage Overview bar; "Projects" and "Ideas" each
       render twice — a stat cell AND a usage-bar label —
       so this same assertion is satisfied by the usage
       bars alone and decides nothing about the
       Projects/Ideas stat CELLS specifically); exploratory
       — the sidebar + top-bar layout, the Objectives box
       placement, the Projects/Ideas stat cells distinct
       from their usage-bar labels, and the Next Billing
       cell (no test asserts it)
- [ ] **G10** In the page header, click Edit.
  PASS: page header swaps Edit for Save/Cancel; the
  Overview card's identity region switches the read-only
  Name/Domain to two inputs prefilled with the current
  Organization Name and Domain.
  (There is no health score — the retired 92/"excellent"
  badge has been removed.)
  V8 (Sent invitations + Revoke) and V9 (admin-only)
  run in the invitation walk after V5, beside V7.
  Pin: tests/presenter-projects-organization.test.ts
       'OrganizationEditPresenter.buildPage renders
       editable name/domain inputs and Save/Cancel
       actions' (decides the edit form's Name/Domain
       inputs and Save/Cancel actions exist, and that no
       Edit action renders while editing; the test never
       asserts a `value=` attribute, so it decides
       nothing about the inputs being PREFILLED — see
       Unpinned but pinnable); exploratory — the live
       header Edit→Save/Cancel swap and the prefilled
       values themselves

### Members list (`members/index.html`)

> **Session role.** G11–G14 and V* Invite cases run as
> an **org admin** (Tony Stark after mock seed). The
> Members list fills names via `fillHumanMemberPii` —
> nested `GET identities/:id/pii` (self or admin). A
> non-admin Ideas list must paint without
> `GET /identities` or `GET /identity-pii`
> (`getMemberMap` is seats + `/ai-agents`; a missing
> name may read `MEMBER_WITHOUT_PII_NAME`). Invite
> **grant** stays admin-gated in `grantInvitation`.

- [ ] **G11** Navigate to `members/index.html` (reachable
  via the "Members" sidebar entry). PASS: page header reads
  "Members" with a static subtitle "Manage humans and AIs
  in your organization" (no count display — header text is
  static, populated counts live in the sidebar header and
  the table grouping). A `+ Add Member` button
  on the right opens the kind-picker dialog. Below the
  header sit a search input and three filter chips (All /
  Humans / AIs, with All pressed by default). The list
  table groups members under YOU (the signed-in human),
  then HUMANS, then AIs, each group showing avatar/name,
  title (humans) or the model name (AIs), and department
  (humans only). The YOU group is a third header, not a
  row inside HUMANS.
  Pin: tests/presenter-members.test.ts 'ManagedMembersPresenter
       renders three sections with YOU above
       HUMANS above AIs' (decides the YOU/HUMANS/AIs
       group order); tests/presenter-members.test.ts
       'YOU section contains only the current member'
       (decides the YOU block excludes other humans);
       tests/presenter-members.test.ts 'HUMANS section
       excludes the current member' (decides the HUMANS
       block itself excludes the signed-in human —
       together with the prior pin, the "third header,
       not a row inside HUMANS" claim);
       tests/adapters-members-union.test.ts
       'fillHumanMemberProfile copies identity title
       and department onto list rows' (decides the
       list row's title badge and department come
       from GET identities/:id, not the empty seat
       profile); exploratory — the live page header
       text, the Add Member button, the search input,
       and the filter chips
- [ ] **G12** Click the sidebar member chip (lower-left:
  name/avatar in the sidebar footer). PASS: navigates to
  the current human member's `member-detail` page
  (`?memberId=<id>`). (The old header greeting that also
  linked to the profile has been removed — the sidebar
  member chip is now the only "click → profile"
  affordance. Source: `web-app/app/sidebar-member.ts`.)
  Pin: tests/browser/sign-in.test.ts 'sign-in lands on
       the dashboard as the seeded admin' (decides the
       chip renders the signed-in member's name —
       `#sidebar-member-name` reads "Tony Stark");
       tests/browser/two-jars.test.ts 'two contexts hold
       two identities on one origin' (decides the chip
       renders the correct name per signed-in identity
       across two contexts); exploratory — the live chip
       click and navigation to `member-detail` (the
       click handler itself, in
       `web-app/app/sidebar-member.ts`, carries no CLI
       or browser test — only its rendered name is
       pinned above)
- [ ] **G13** Type in the search input. PASS: filters the
  list in real-time — human members match on name, email,
  title, or department; AI members match on name or
  description (not provider/model). Click the Humans
  filter chip. PASS: only the YOU and HUMANS groups are
  visible (the AIs group is hidden — `#buildSelfSection`
  only hides itself under kind=ai, not kind=human). Click
  AIs. PASS: only the AIs group is visible. Click
  All. PASS: all three groups return.
  Pin: tests/presenter-members.test.ts 'search filter
       applies to all three sections' (decides a search
       term narrows YOU/HUMANS/AIs alike);
       tests/presenter-members.test.ts 'kind=human filter
       hides AIs but keeps YOU';
       tests/presenter-members.test.ts 'kind=ai filter
       hides YOU and HUMANS' (together decide the
       Humans/AIs/All chip behavior — the second test is
       also why the corrected Humans-chip PASS line above
       names YOU explicitly); exploratory — the live
       keystroke-by-keystroke filtering and the
       name/email/title/department match fields (Layer-1
       pinnable via `HumanMember.matchesSearch`; see
       Unpinned but pinnable)
- [ ] **G43** Navigate to `identities/index.html` (or
  click "Identities" in the sidebar). PASS: the header
  reads "Identities" with an "Add Identity" button
  (`#add-identity-btn`); `#identity-list` renders one
  `.card[data-identity-id]` per identity — a person row
  shows an initials avatar + name + email sub-line + a
  "Person" badge; a service row shows a shield avatar
  plus "Service account" + "—" (agents are not
  identities), then a "Service" badge. The nested PII
  fence (viaMembership, need-to-know) hides Wayne-only
  members from Stark admin Tony: the list renders 7
  named person rows (Emily Rodriguez, Sarah Chen, Lisa
  Wang, Marcus Johnson, Tony Stark, Jessica Park, and
  Riley Okafor — the zero-membership identity is a
  genuine ORPHAN, and the viaMembership fence hides only
  identities that belong to a DIFFERENT org, so an
  orphan's PII is visible), plus an 8th, Jordan Rivera,
  if AA5's create held; 5 "Identity
  without PII" person rows (the Wayne-only members:
  David Martinez, Alex Kim, Mike Thompson, David Kim,
  James Miller); and 1 service row (the system service
  identity). `getIdentityRoster` GETs identities only —
  AA7a's "Ops Assistant" is an `ai-agents/:id` document,
  not an identity row, so it does not appear on this
  list either. An empty roster renders "No identities
  yet." Source: `web-app/identities/index.ts`,
  `web-app/app/presenters/identity-list.ts`
  (`IdentityRosterPresenter`).
  Pin: tests/presenter-identity-list.test.ts 'person row
       shows name, email, and Person badge';
       tests/presenter-identity-list.test.ts 'renders an
       empty state when no identities';
       tests/presenter-identity-list.test.ts 'unnamed
       service redacts to a label, not the id' (decides
       the "Service account" label —
       `UNNAMED_SERVICE_NAME` — for the unnamed system
       service row); tests/presenter-identity-list.test.ts
       'erased person falls back to the named constant'
       (decides the "Identity without PII" label —
       `IDENTITY_WITHOUT_PII_NAME` — the same fallback
       the 5 Wayne-only rows render);
       tests/api-organization-isolation.test.ts 'flat
       identity-pii is 404; nested foreign GET 403s'
       (decides the exact fence: an admin scoped to one
       org reading a foreign-org-only identity's PII gets 403
       "belongs to a different organization" — the
       mechanism behind the 5 "Identity without PII"
       rows); exploratory — the live named-row census
       (no test pins the mock seed's exact named/hidden/
       service split as a single assertion) and the
       shield-avatar/service-badge styling
- [ ] **G14** Return to `members/index.html` (G43 left
  the explorer on Identities). Click `+ Add Member`. PASS:
  dialog opens with the Kind toggle defaulting to Human,
  the Human form visible, and the AI form hidden. Switch
  the toggle to AI. PASS: the Human form hides, the AI
  form appears
  with a Model pulldown and a Skill Focus textarea; no
  Auth Token field or security warning. Create Human
  writes `PUT /identities/:id` plus PII and `PUT`s a
  seat at the active organization so the person appears
  in the seat-derived roster. "Invite member" (V1) still
  grants a pending invitation for an EXISTING identity.
  Pin: tests/adapters-members.test.ts
       'postHumanMemberCreation persists identity PII and
       a seat' (decides the identity + PII + seat write
       Create Human triggers); exploratory — the live
       dialog Kind-toggle default and the AI-form
       hide/show (`bindAddMemberDialog` in
       web-app/members/index.ts carries no CLI or
       browser test)
- [ ] **G14a** With Kind=AI selected, leave the Model
  pulldown on its placeholder and click Create. PASS: a
  toast "Model is required" fires and no POST happens.
  Pick a Model, fill the other AI fields, click Create.
  PASS: toast confirms and the AI is written as a
  message-plane AI agent document (`PUT /ai-agents/:id`);
  it appears in the AIs group (agents are global, not
  seated).
  Pin: tests/adapters-ai-members.test.ts
       'postAIMemberCreation writes PUT /ai-agents/:id'
       (decides the AI-agent write this Create
       triggers); exploratory — the live "Model is
       required" toast and the no-POST-until-chosen gate

### Membership invitations (V) — Members "Invite member"

> "Add Member" seats a new person at the active
> organization (AA5/G14). Invite is the path that seats
> an EXISTING identity in this org. An admin invites by
> email → a pending invitation; the invitee reads it on
> `invitations/` (reached via the top-bar bell) and Accepts
> (writes a seat in the invitation's org) or
> Declines; an admin can Revoke an outstanding one from the
> Organization page. DEFERRED: email delivery (see
> `TODO.md`).
> Sources:
> `web-app/members/index.ts` (`handleInviteSubmit`),
> `web-app/app/adapters/invitations.ts`,
> `api/invitations-domain.ts` (`grantInvitation` /
> `acceptInvitation` / `declineInvitation`
> / `revokeInvitation`), `web-app/invitations/`,
> `web-app/app/invitations-indicator.ts`.

- [ ] **V1 — Invite by email grants a pending
  invitation** On `members/index.html` as Tony Stark
  (Stark's admin), click `+ Invite member` (`#invite-
  member-btn`, mail icon). PASS: the `invite-member`
  dialog opens with a single Email input (`#invite-
  email`), helper text "Invite an existing person to
  this organization", a Cancel and a "Send invitation"
  submit (`#invite-member-submit`). Enter the email of an
  EXISTING identity who is NOT yet a member of the
  inviting org: `david.martinez@company.com` (Wayne-
  only). This grant is invitation A. Click "Send
  invitation". PASS: an "Invitation sent" toast fires,
  the dialog closes, and the email field is cleared. The
  grant is idempotent — sending the same email again
  while still pending returns the same pending invitation
  (no duplicate, no error). Source: `handleInviteSubmit`,
  `postInvitationGrant`, `grantInvitation`.
  Pin: tests/adapters-invitations.test.ts 'grant by email
       appends a pending invitation';
       tests/adapters-invitations.test.ts 'grant stamps the
       org from the verified token' (decides the invitation
       lands in Stark, the org Tony's token is scoped to);
       tests/adapters-invitations.test.ts 'granting the
       same email twice is idempotent'; exploratory — the
       live dialog affordance, the "Invitation sent" toast,
       and the field-clear/dialog-close behavior
- [ ] **V2 — Invite rejects empty / unknown /
  already-member** Open the Invite dialog. Submit with
  the Email blank → an "Email is required" toast and no
  POST. Submit an email that matches NO identity (e.g.
  `nobody@company.com`) → an inline email-field error "No
  identity found for that email." (the adapter maps the
  404 to a 'no-identity' outcome — no toast). Submit the
  email of someone ALREADY a member of Stark (e.g.
  `sarah.chen@company.com`) → an inline email-field
  error "Already a member of this organization." (the
  409 maps to an 'already-member' outcome). The "Failed
  to invite: …" toast fires only on an unexpected server
  fault. In all three the dialog stays usable and no
  pending invitation is created. Leftover: does not
  consume invitation A (V1). Source:
  `setInviteEmailError` in `web-app/members/index.ts`;
  `grantInvitation` guards in `api/invitations-domain.ts`.
  Pin: tests/adapters-invitations.test.ts 'grant by unknown
       email returns no-identity';
       tests/adapters-invitations.test.ts 'grant for an
       existing member returns already-member'; exploratory
       — the live toast/inline-error text mapping
       (`setInviteEmailError` carries no CLI or browser
       test) and the dialog staying open in all three cases
- [ ] **V6 — Org fence: a pending invite is invisible
  until accepted** While the V1 invitation is still
  PENDING (before V4), confirm the org fence holds: the
  invitee is NOT in the inviting org's Members roster
  (the roster derives from seats, and no seat exists
  yet), and the inviting org is NOT reachable by the
  invitee — it does not appear in their sidebar org
  `<select>` and boot will not scope a token to it (a
  pending invitation grants no seat). Do not Accept — V4
  owns the accepted half. PASS: pending ⇒ not in roster,
  not reachable. Source: the org fence
  (`resolveOwningOrganization` via `writeAuthorizerFor`),
  `acceptInvitation`.
  Pin: tests/api-invitations-fence.test.ts 'a pending
       invite writes no membership';
       tests/api-invitations-fence.test.ts 'a pending
       invitee is absent from the roster'; exploratory —
       the live sidebar org `<select>` reachability check
- [ ] **V3 — Top-bar pending-invitations bell →
  invitations page** As the V1 invitee (David Martinez,
  signed in with ≥1 pending invitation), confirm the top
  bar shows a bell (`#invitations-bell`) with a count
  badge (`#invitations-badge`) equal to the number of
  pending invitations. PASS: the bell is VISIBLE only
  when pending ≥ 1 — an identity with zero pending
  invitations shows NO bell (the host carries `hidden`;
  it is never an empty bell). Click the bell. PASS:
  navigates to `invitations/index.html`. The read is
  identity-scoped (the invitation facade fences by the
  verified caller), so the bell works even for a member
  with no admin role. Source:
  `web-app/app/invitations-indicator.ts`
  (`mutateInvitationsBell`), `component-top-bar.html`.
  The wire path is `identities/:id/invitations/` (never
  a root `/api/invitations`).
  Pin: tests/adapters-invitations.test.ts 'the invitee
       reads their own pending invitation' (decides the
       identity-scoped read the bell's count derives
       from); tests/api-invitations-fence.test.ts 'a
       role-less invitee may read their invitations'
       (decides the read succeeds with no admin role);
       exploratory — the live bell/badge visibility and
       count rendering, and the click navigation
       (`web-app/app/invitations-indicator.ts` carries
       no CLI or browser test)
- [ ] **V4 — Accept writes a seat; invitee becomes
  multi-org** On `invitations/index.html` (page header
  "Invitations", subtitle "Organizations inviting you to
  join"), confirm `#invitations-list` shows one card per
  PENDING invitation — org name, an "Invited by {name} ·
  {date}" sub-line, a state badge, and Accept / Decline
  buttons. Click Accept on the V1 invitation. PASS: an
  "Invitation accepted" toast fires and the row leaves
  the pending list. A REAL seat is now written in the
  INVITATION's org (Stark), so David Martinez becomes
  multi-org: reload any sidebar-layout page and the
  sidebar footer now shows the org `<select>` (G36)
  listing both Wayne and Stark. Accept is idempotent — a
  re-accept is a 204 no-op, no duplicate seat. Source:
  `postInvitationAcceptance`, `acceptInvitation` (atomic
  seat document message pair + invitations/:id/
  acceptance operation message pair via
  `appendMessagePair`).
  Pin: tests/presenter-invitation-list.test.ts 'a pending
       invitation shows the org, inviter, and Accept /
       Decline' (decides the pending card's org name,
       inviter name, Pending state badge, and Accept/
       Decline buttons); tests/adapters-invitations.test.ts
       'accept writes
       a membership in the invitation org' (decides the
       seat lands in the invitation's org, making the
       invitee multi-org);
       tests/api-invitation-nests.test.ts 'PUT from
       accepted is a no-op' (decides re-accept is a 204
       no-op with no duplicate);
       tests/adapters-organization-session-exchange.test.ts
       'shouldShowOrganizationSwitcher only at two or
       more orgs' (decides the sidebar `<select>`
       mechanism a second seat triggers); exploratory —
       the live "Invitation accepted" toast, the row
       leaving the pending list, and the reload showing
       the `<select>`
- [ ] **V5 — Decline appends declined, writes no seat**
  Grant invitation B first (V4 consumed A). On
  `members/index.html` as Tony Stark, Invite member with
  a fresh EXISTING identity who is not a member of
  Stark: `alex.kim@company.com` (Wayne-only). PASS:
  "Invitation sent" toast. Sign in as Alex Kim. On
  `invitations/` click Decline. PASS: an "Invitation
  declined" toast fires, the row leaves the pending
  list, and NO seat is written (Stark does NOT appear in
  the sidebar switcher and stays unreachable). With no
  pending invitations remaining, the list shows the
  empty state "No invitations." and the top-bar bell
  disappears (V3). Decline is idempotent (re-decline →
  204). Source: `postInvitationDecline`,
  `declineInvitation`.
  Pin: tests/adapters-invitations.test.ts 'decline records
       declined and writes no membership';
       tests/api-invitations-fence.test.ts 'decline: replay
       of fixed body is a no-op (two events total)'
       (decides re-decline is idempotent, 204, no extra
       event); tests/presenter-invitation-list.test.ts 'an
       empty invitee list shows the empty state' (decides
       the "No invitations." copy); exploratory — the live
       "Invitation sent"/"Invitation declined" toasts and
       the sidebar switcher staying absent for the declined
       org
- [ ] **V8 — Organization "Sent invitations" section +
  Revoke (admin)** Grant invitation C (V4 consumed A; V5
  declined B). On
  `members/index.html` as Tony Stark, Invite member:
  `mike.thompson@company.com` (Wayne-only). PASS:
  "Invitation sent" toast. Then on
  `organization/index.html` confirm a "Sent
  invitations" section (`#sent-invitations-box`, h2
  "Sent invitations") appears below the cards, listing
  one row per PENDING org invitation (`#sent-
  invitations-list`) — each row shows the invitee EMAIL,
  an "Invited {date}" sub-line, a state badge, and a
  Revoke button.
  TWO rows are pending here: invitation C and the SEEDED
  pending invitation to `riley.okafor@example.net`
  (present from boot — B25–B29's fixture; do NOT revoke
  it).
  PASS: the section is VISIBLE only when
  the admin read succeeds (it boots hidden and reveals on
  success). Click Revoke on C. PASS: an "Invitation
  revoked" toast fires and the row leaves the pending
  list (a 'revoked' event supersedes the pending; the
  invitation row persists as audit, and the invitee's
  pending list — V3/V4 — no longer shows it).
  Riley's seeded row remains pending after C is revoked,
  so the live empty state is not reachable on this walk;
  tests/presenter-invitation-list.test.ts 'an empty sent
  list shows the empty state' alone decides the "No
  outstanding invitations." copy.
  Revoke is idempotent (re-revoke → 204).
  Source: `web-app/organization/index.ts`
  (`renderSentInvitations` / `onSentInvitationClick`),
  `SentInvitationsPresenter`, `revokeInvitation`.
  Pin: tests/adapters-invitations.test.ts 'sent invitations
       list the active org pending only';
       tests/adapters-invitations.test.ts 'revoke records
       revoked (admin only)';
       tests/api-invitations-fence.test.ts 'revoke: replay
       of fixed body is a no-op (two events total)'
       (decides re-revoke is idempotent, 204, no extra
       event); tests/presenter-invitation-list.test.ts 'a
       sent invitation shows the invitee email and Revoke';
       tests/presenter-invitation-list.test.ts 'an empty
       sent list shows the empty state' (decides the "No
       outstanding invitations." copy); exploratory — the
       live "Invitation sent"/"Invitation revoked" toasts,
       the section's hidden-until-success reveal, and the
       "Invited {date}" sub-line and state badge on a sent
       row (claimed by nothing today; see Unpinned but
       pinnable)
- [ ] **V7 — Authz: non-admin grant/revoke rejected;
  invitee may still read & accept** Sign in as a
  non-admin Stark member (e.g. Sarah Chen,
  `sarah.chen@company.com`, stdout password). Open the
  Invite dialog (`#invite-member-btn`) and submit a
  grant. Read the 403 from the **network log** on this
  load — never `js()` `fetch` (the bearer is
  memory-only). PASS: the grant POST is rejected with
  "forbidden: POST /organizations/<orgId>/invitations/
  requires a role this principal lacks" (403). The
  Organization page's Sent-invitations admin read fails
  and the section stays hidden (V9), so no Revoke is
  offered. YET the SAME identity, when it is the INVITEE
  elsewhere, CAN read its own invitations (the bell +
  `invitations/` work — the read is identity-scoped, not
  admin-gated) and CAN Accept/Decline its own invitation,
  as V4/V5 already showed for David Martinez and Alex
  Kim, neither an admin anywhere. PASS: grant/revoke
  require admin; read/accept/decline require only being
  the invitee. Source: the absent `MEMBER_VERBS` row for
  the org invitation nest (`api/authorization.ts`) and
  `authorizeRequest` (`api/request-auth.ts`), which 403s
  before any handler; the invitee read/accept/decline
  paths ride the identity nest.
  Pin: tests/api-invitations-fence.test.ts 'a non-admin is
       forbidden from granting' (decides the exact 403
       body: "forbidden: POST /organizations/…
       /invitations/ requires a role this principal
       lacks"); tests/api-invitations-fence.test.ts 'a
       non-admin is forbidden from revoking' (decides the
       same shape for PUT revoke);
       tests/api-invitations-fence.test.ts 'a role-less
       invitee may read their invitations';
       tests/adapters-invitations.test.ts 'accept writes a
       membership in the invitation org' (decides a
       non-admin invitee can accept);
       tests/adapters-invitations.test.ts 'decline records
       declined and writes no membership' (decides a
       role-less invitee can decline); exploratory — the
       live grant-dialog submission as a non-admin and the
       Organization page's hidden Sent-invitations section
- [ ] **V9 — Sent-invitations section is admin-only**
  Sign in as a non-admin Stark member (e.g. Sarah Chen)
  and open `organization/index.html`. PASS: the admin
  Sent-invitations read fails (403 "forbidden: listing
  sent invitations requires an admin role") and the
  section stays HIDDEN — the read rejects before the
  reveal line, so the box never un-hides, and no Revoke
  affordance is offered to a non-admin. (Pairs with V7's
  grant/revoke 403s.) Source: `sentInvitations` admin
  guard in `api/invitations-domain.ts`.
  Pin: exploratory — the admin-only Sent-invitations
       read and the section staying hidden (no CLI or
       browser test drives `getOrganizationInvitations`
       with a non-admin caller; see Unpinned but
       pinnable)

### Member detail — Human (`members/detail.html?memberId=<hw_*>`)

- [ ] **G19** Sign back in as Tony Stark
  (`demo@example.com`) — V7/V9 left a non-admin session,
  and `MEMBER_VERBS` grants a member no route this
  subsection through G26 needs (no row for `/identities`,
  `/identities/:id`, `/identities/:id/pii`,
  `/identities/:id/tokens` GET, `/identities/:id/
  providers`, `/identities/:id/registration`, or `PUT
  /ai-agents/:id`); a 403 here is a real fault the page
  re-throws rather than the AI-fallback path. From
  `members/index.html`, click any human
  member's row. PASS: navigates to `member-detail`. Read
  mode shows avatar (initials), name,
  title • department subtitle, Personal Information card
  (Name, Email, Phone, Title, Department,
  Bio), Working Styles card (4-axis dimensions surfaced
  under presentation labels Mover / Shaker / Prover /
  Maker, backed by data keys `driver` / `analytical` /
  `expressive` / `amiable`), and Strengths card.
  Pin: tests/presenter-member-detail.test.ts
       'HumanMemberDetailPresenter renders the name,
       title, department, and personal-info card'
       (decides the read-mode card renders name,
       department, email, and a strength; blanking the
       fixture's `title` leaves this same test green
       because `/Engineer/` is also satisfied by the
       department "Engineering", so title itself is not
       decided here); exploratory — the live avatar,
       the title field, and the Working Styles card
- [ ] **G20** Click Edit. PASS: header swaps Edit for
  Cancel/Save; Personal Information card switches to
  inputs (Name text, Email email-input, Phone
  text, Title text, Department select, Bio textarea);
  Strengths card switches to a tag picker. Working
  Styles card stays read-only.
  Pin: tests/presenter-member-detail.test.ts
       'HumanMemberDetailEditPresenter renders no State
       select' (decides the edit-mode Save action
       renders and no State field/select or "Active"
       option appears); exploratory — the live header
       Edit→Cancel/Save swap, the six Personal
       Information input types, and the Strengths
       tag-picker rendering
- [ ] **G21** On any **seeded** human member's row (not
  Jordan Rivera — AA5's Add-Member form writes
  `strengths: []` with no strengths field on the dialog,
  so she starts with nothing to toggle off), edit Phone
  and Bio, toggle one strength on and one off, click
  Save. PASS: toast "Member saved"
  appears. PASS: the page returns to read mode showing
  the edits. Reload; all edits persist.
  Pin: tests/api-human-members.test.ts 'a strengths PUT
       replaces the list — the toggled-on id persists'
       (decides toggling one strength off and another on
       in one save leaves exactly the new set on the
       next GET); exploratory — the live toast,
       read-mode return, the Phone/Bio edit (a separate
       `PUT identities/:id/pii` this test never calls),
       and reload persistence
- [ ] **G22** Click Edit, change a field, press `Escape`.
  PASS: edits discarded, view returns to read mode.
  Pin: exploratory — the live Escape-to-discard toggle
       (`web-app/members/detail.ts`'s keydown handler
       carries no CLI or browser test)
- [ ] **G23** Click Edit, change a text field, press
  `Enter` while focused on the input. PASS: save fires
  (toast "Member saved") and the page returns to read
  mode.
  Pin: exploratory — the live Enter-triggers-save
       keydown handler, the toast, and the read-mode
       return (`web-app/members/detail.ts`'s keydown
       handling carries no CLI or browser test)
- [ ] **G23a** From `member-detail`, click the back
  button. PASS: returns to `members/index.html`.
  Pin: exploratory — the live back-button navigation
       (`member-detail`'s back-button click handler
       carries no CLI or browser test)

### Member detail — AI (`members/detail.html?memberId=<ai_*>`)

- [ ] **G24** From `members/index.html`, click any AI
  member's row. PASS: navigates to `member-detail`. Read
  mode shows the AI Member card (Name, Model as
  "{name} — {provider}", Description, Skill Focus);
  there is no Auth Token section.
  Pin: tests/presenter-member-detail.test.ts
       'AIMemberDetailPresenter renders the model name,
       provider, and skill focus' (decides the Skill
       Focus text and the Model row's provider half
       render, and confirms no "Auth Token" text
       appears; the fixture's AI member name is
       'Claude Opus 4.8', identical to
       `firstProviderModel().name`, so this same
       assertion's model-NAME half passes from the
       identity's own Name heading alone and decides
       nothing about the Model row's name);
       exploratory — the live avatar and Description
       text
- [ ] **G24a** Click Edit. PASS: identity fields become
  inputs (Name text, Model pulldown grouped by provider
  with the current model pre-selected, Description
  textarea, Skill Focus textarea); there is no Auth
  Token field.
  Change Description and Skill Focus, click Save. PASS:
  toast "AI member saved"; the page returns to read mode
  showing the edits; reload and they persist.
  Pin: tests/presenter-member-detail.test.ts
       'AIMemberDetailEditPresenter renders no State
       select' (decides the edit-mode Model select with
       optgroups and the current model pre-selected
       renders, alongside Save, with no State select);
       tests/adapters-ai-members.test.ts 'putAIMember
       updates the agent document' (decides a Skill
       Focus edit persists via a fresh read; the
       fixture's description is `''` before and after,
       so this same call decides nothing about
       Description); exploratory — the live toast,
       read-mode return, and the Description reload
       persistence
- [ ] **G24b** Click Edit again, pick a different Model
  from the pulldown, click Save. PASS: toast "AI member
  saved"; the page returns to read mode showing the new
  model; reload and it persists as
  "{name} — {provider}".
  Pin: exploratory — the live Model pulldown selection,
       the toast, the read-mode return, and the
       "{name} — {provider}" reload rendering.
       `tests/adapters-ai-members.test.ts`'s `'putAIMember
       updates the agent document'` cannot stand in for
       this case: its own draft never changes `model`
       (`aiDraft()` and `seedAIMember`'s `aiDetail()`
       both fix it to `firstProviderModel().id` in both
       the seed and the update call), so it decides
       nothing about this case's entire PASS line — a
       Model change persisting. See Unpinned but
       pinnable

### Identities (list & detail) (`identities/`, `identities/detail.html`)

- [ ] **G44** Navigate to `identities/index.html`. Click
  "Add Identity". PASS: the `add-identity` dialog opens
  with a Kind toggle (Person checked by default /
  Service). With Person selected, the person form
  (`#add-identity-person-form`) shows Name/Email/Phone/
  Bio inputs; fill Name + Email, click "Create"
  (`#add-identity-submit`) → two sequential requests
  (POST `identities` `{id, kind}`, then PUT
  `identities/:id/pii` carrying the PII fields), an
  "Identity added" toast, the dialog closes, and the new
  person appears in the roster (name + email); a
  second-hop failure toasts a partial-state message
  naming the PII-less identity rather than a blanket
  create failure. Re-open the dialog and click the
  "Service" radio → the person form hides and the
  service form (`#svc-secret`, "Client Secret") shows;
  enter a secret, Create → a "Service identity added"
  toast, the dialog closes, and a new "Service"-badged
  row appears. Submitting Person with an empty Name or
  Email shows "Name and email are required" and keeps
  the dialog open. Source: `web-app/identities/index.ts`
  (`handleAddIdentitySubmit` / `submitPersonForm` /
  `submitServiceForm`).
  Pin: tests/adapters-identity-creation.test.ts
       'postIdentityCreation mints a person identity with
       PII' (decides the two-sequential-request person
       create — POST identities then PUT identities/:id
       /pii — lands both the kind and the PII);
       tests/api-identities-create.test.ts 'a bad PUT
       identities/:id/pii after a good create leaves the
       identity standing PII-less — the torn-state
       acceptance the intake decomposition names' (decides
       the underlying torn-state mechanism this case's
       "rather than a blanket create failure" clause
       relies on: a failed second-hop PII write leaves the
       identity surviving, standing PII-less);
       tests/adapters-identity-creation.test.ts
       'postIdentityCreation mints a service identity
       with a hashed client_secret' (decides the Service
       path's credential sub-object is hashed, never the
       plaintext secret); exploratory — the live dialog
       Kind toggle, the "Identity added"/"Service
       identity added" toasts, the roster append, the
       specific toast text and the
       `IdentityPiiIntakeFailedError` class the
       second-hop failure raises (see Unpinned but
       pinnable), and the "Name and email are required"
       validation
- [ ] **G45** From the roster, click a person row
  (`.card[data-identity-id]`). PASS: navigates to
  `identities/detail.html?identityId=<id>`, which
  renders the back button (`#identity-back-btn`), the
  name + a kind badge + the id, a "Personal Information"
  card (Name/Email/Phone/Bio — each empty field rendered
  as "—" via `DISPLAY_ABSENT`), a "Connections" card
  (Identity Providers / Tokens buttons), and — for a
  person — an "Erase PII" button
  (`#identity-erase-btn`). A service identity instead
  shows a "Credentials" card and NO erase button (only
  persons carry erasable PII). Source:
  `web-app/identities/index.ts` (`onListClick`),
  `web-app/identities/detail.ts`,
  `web-app/app/presenters/identity-detail.ts`.
  Pin: tests/presenter-identity-detail.test.ts 'person
       detail renders id, Person badge, and personal-info
       fields' (decides the back button, the Personal
       Information card, and the Providers/Tokens links for
       a person); tests/presenter-identity-detail.test.ts
       'named service detail shows its name and Service
       badge, never the secret' (decides a service instead
       shows a Credentials card, no Personal Information
       card, and never the secret); exploratory — the live
       click-through navigation and the erase button's
       presence for a person versus its absence for a
       service (neither test asserts `#identity-erase-btn`
       directly)
- [ ] **G46** On Jessica Park's identity detail (any
  Stark-visible person row other than the signed-in admin
  works, but never Sarah Chen — R21 and SV6/SV7/SV10
  sign in as `sarah.chen@company.com` later in the walk,
  and login resolves that email to her identity by
  scanning the live `identity_pii` rows
  (`identityByEmail`, `api/authentication.ts`); erasing
  her PII would remove that row and strand all three
  later cases unable to sign her in), click "Erase PII"
  (`#identity-erase-btn`) to open the native `<dialog
  id="confirm-erase-dialog">` (`role="alertdialog"`,
  title "Erase personal information?", body "The identity
  itself survives; only its personal information is
  erased."); confirm via the
  `data-action="confirm-erase"` button. PASS:
  `deleteIdentityPii` runs, a "Personal information
  erased" toast appears, and the view re-renders in
  place — the name becomes "Identity without PII"
  (`IDENTITY_WITHOUT_PII_NAME`) and Email/Phone/Bio all
  read "—" (`DISPLAY_ABSENT`); the identity row still
  exists in the roster (erasure splices `identity_pii`
  only, leaving the identity and every `member_id`
  reference intact). The surviving pair at the address is
  the bodyless DELETE tombstone (head). Erased name
  remains in superseded pairs; derived reads and login
  show none. Cancel/Escape
  (`data-dialog-cancel="confirm-erase"`) leaves the PII
  unchanged. Source: `web-app/identities/detail.ts`
  (`performErase` → `deleteIdentityPii`). Drive the
  native `<dialog>` directly — no `window.confirm` stub
  needed.
  Pin: tests/adapters-identities.test.ts 'getMemberPii is
       present, then erased after delete';
       tests/adapters-identities.test.ts 'erasing PII keeps
       identity and person kind' (together decide the erase
       call blanks PII while the identity and its kind
       survive); tests/presenter-identity-detail.test.ts
       'erased person shows IDENTITY_WITHOUT_PII_NAME and
       the absent marker for the blanked fields' (decides
       the name fallback and that AT LEAST ONE "—" absent
       marker renders; `assert.match(out, /—/)` proves one
       such marker exists, not that Email, Phone, AND Bio
       each individually show one); exploratory — the live
       native `<dialog>` confirm/cancel interaction, the
       toast, the in-place re-render, and whether
       Email/Phone/Bio each independently read "—"
- [ ] **G47** On the system service identity's detail
  page (admin session), a "Client registration" card
  renders before Credentials showing "Not registered."
  and a "Register client" button
  (`data-identity-action="registration"`). Click it →
  the `client-registration-dialog` opens; fill Grant
  types `client_credentials`, Audience `fusion-angle`,
  JWKS `{"keys":[]}`, leave Status Active, Save
  (`#client-registration-submit`) → "Client registration
  saved" toast, dialog closes, the card shows an
  `active` pill (`data-tone="success"`) plus Grant
  types / Redirect URIs / Audience / JWKS fields, and
  the button reads "Manage registration". Re-open,
  change JWKS, Save → the card reflects the new JWKS
  (rotate = same PUT-overwrite). Re-open, set Status
  Disabled, Save → `disabled` pill
  (`data-tone="warning"`). Re-open → a "Deregister"
  button (`#client-registration-deregister`, hidden
  while unregistered) is visible; click it → "Client
  registration removed" toast and the card returns to
  "Not registered." Empty Grant types / Audience / JWKS
  shows "Grant types, audience, and JWKS are required"
  and keeps the dialog open. Cancel
  (`data-dialog-cancel="client-registration"`) discards
  edits. Source: `web-app/identities/detail.ts`
  (`saveRegistration` / `deregisterClient`),
  `web-app/app/presenters/identity-detail.ts`
  (`buildRegistrationCard`). Wire:
  PUT|GET|DELETE `identities/:id/registration` (admin
  realm; kind gate 404/400).
  Pin: tests/adapters-client-registration.test.ts 'an
       unregistered service reads as registered: false';
       tests/adapters-client-registration.test.ts 'put then
       get round-trips through the camelCase domain shape';
       tests/adapters-client-registration.test.ts 'delete
       deregisters back to registered: false' (together
       decide the PUT/GET/DELETE round trip);
       tests/presenter-identity-detail.test.ts 'a service
       identity renders an unregistered registration card';
       tests/presenter-identity-detail.test.ts 'a
       registered service renders status tone and fields';
       exploratory — the live dialog fill/save/re-open
       cycle, the toasts, the Disabled warning-tone pill,
       and the "Grant types, audience, and JWKS are
       required" validation

### Identity tokens & providers (`identity-tokens/`, `identity-providers/`)

- [ ] **G25** Open `identities/`, click an identity,
  then its "Tokens" link
  (`data-identity-link="tokens"`). PASS: the page title
  is "Tokens" with muted subtitle "Refresh-token chains
  for this identity"; the page renders one card per
  chain, each showing the chain id, the event jti,
  `parent: —` for a root event (or the parent jti for a
  rotated one), an `issued`/`rotated`/`revoked` badge,
  and a LOCAL-time stamp; an identity with no tokens
  shows "No tokens." The presenter consumes the
  adapter's camelCase `TokenEvent` domain shape (`jti`,
  `parentJti`, `action`, `at`) — a snake_case storage
  leak would render `parent: undefined` instead of
  `parent: —`. A non-canonical `identityId` (any value
  that is not a 22-character identifier) 400s at the
  route gate; an absent one bounces to `identities/`.
  Source: `GET identities/:id/tokens` via
  `web-app/app/adapters/identity-tokens.ts` (`TokenEvent`),
  `web-app/app/presenters/identity-tokens.ts`.
  Pin: tests/presenter-identity-tokens.test.ts 'renders a
       card per chain with each jti event' (decides the
       chain id, jti, and issued/rotated badges render;
       deleting the fixture's `parentJti` from the rotated
       event leaves all five assertions green, since
       `assert.match(out, /jmvogLnzTmiQlAkVvDHrvQ/)` is
       already satisfied by the FIRST event's own jti —
       confirmed by mutating a scratch copy — so this test
       decides nothing about the `parent: {jti}`
       rendering); tests/presenter-identity-tokens.test.ts
       'renders an empty state when no chains' (decides "No
       tokens."); tests/adapters-identity-roster.test.ts
       'getTokenChainsFor groups one identity\'s tokens'
       (decides tokens group by chain id and each chain's
       event count — the mechanism behind multiple chains,
       and not the `parentJti` field either); exploratory —
       the live page title/subtitle, the local-time stamp,
       the `parent: {jti}` vs `parent: —` rendering itself
       (see Unpinned but pinnable), and the
       non-canonical/absent identityId route-gate behavior
- [ ] **G26** From the same detail, click its
  "Providers" link (`data-identity-link="providers"`).
  PASS: the page title is "Identity Providers" with
  muted subtitle "External sign-in links for this
  identity"; the page renders one card per link/unlink
  event (provider name + the `providerSubject` + a
  `linked`/`unlinked` badge + local-time stamp), or "No
  linked providers." for an identity with none (the
  seeded Tony Stark logs in by password, so its
  providers list is empty). The presenter consumes the
  adapter's camelCase `ProviderEvent` shape (`provider`,
  `providerSubject`, `action`, `at`). Source: `GET
  identities/:id/providers` via
  `web-app/app/adapters/identity-providers.ts`
  (`ProviderEvent`),
  `web-app/app/presenters/identity-providers.ts`.
  Pin: tests/presenter-identity-providers.test.ts 'renders
       a row per provider event' (decides the provider and
       providerSubject render, and that an `unlinked` badge
       renders; `assert.match(out, /linked/)` is satisfied
       by the SAME "unlinked" string as a substring, so
       this test alone does not independently decide that a
       plain `linked` badge — distinct from `unlinked` —
       renders too);
       tests/presenter-identity-providers.test.ts 'renders
       an empty state when no events' (decides "No linked
       providers."); tests/adapters-identity-roster.test.ts
       'getProviderEvents returns one identity\'s link log'
       (decides events are scoped to the target identity —
       the mechanism behind Tony's empty list); exploratory
       — the live page title/subtitle, the local-time stamp
       rendering, and a `linked` badge distinct from
       `unlinked` (see Unpinned but pinnable)

### Sidebar org-switcher

- [ ] **G36 — Sidebar org-switcher (multi-org user)**
  The mock seed gives Tony Stark two organizations
  (Stark, Wayne). Sign in as Tony. The SIDEBAR FOOTER
  (not the top bar) shows an inline native org
  `<select>` (`.org-switcher`, inside
  `#sidebar-org-switcher` /
  `#mobile-sidebar-org-switcher`) next to the member
  chip — it appears ONLY because the user can reach ≥2
  orgs (`shouldShowOrganizationSwitcher`). PASS: the
  select lists "Stark Industries" and "Wayne
  Enterprises" with Stark active, alongside a "Set as
  default" control (`.org-set-default`); the plain
  org-name text line in the chip is cleared so the org is
  not named twice. Note the Members and Ideas lists for
  Stark. Select "Wayne Enterprises" → the page does a
  FULL reload and re-scopes: Members shows Wayne's
  roster and Ideas shows Wayne's ideas (org-fenced —
  Stark's rows are no longer visible). Reload the page
  again WITHOUT changing the select → the selection
  persists (Wayne stays active; the choice is stored
  under `fusion-angle:active-organization-id` and boot
  re-exchanges a scoped token from it). A single-org
  seeded user, by contrast, sees NO `<select>` in the
  sidebar — just the org name as PLAIN TEXT in the
  chip. The top bar shows neither the switcher nor a
  greeting; its only org-aware affordance is the
  pending-invitations bell (V3). Source of truth:
  `web-app/app/organization-switcher.ts`,
  `web-app/app/sidebar-member.ts`,
  `web-app/app/adapters/organization-session.ts`,
  `web-app/app/app-boot.ts::scopeBootToActiveOrganization`.
  Pin: tests/adapters-organization-session-exchange.test.ts
       'shouldShowOrganizationSwitcher only at two or
       more orgs' (decides the ≥2-orgs visibility gate);
       tests/organization-switcher.test.ts
       'organizationSwitcherHtml renders a set-as-default
       control' (decides the "Set as default" control
       renders); tests/organization-switcher.test.ts
       'organizationSwitcherHtml renders an option per
       org'; tests/organization-switcher.test.ts
       'organizationSwitcherHtml is empty below two
       orgs' (together decide the rendered `<select>`'s
       options and its absence below two orgs);
       tests/sp6-organization-switch-e2e.test.ts
       'switching the active org re-scopes members and
       ideas' (decides Members/Ideas re-scope on switch
       and org-1 rows are fenced from org-2);
       tests/adapters-organization-session-exchange.test.ts
       'resolveActiveOrganization prefers a reachable
       persisted choice' (decides the persisted-choice-
       wins mechanism behind the reload-persistence
       clause); exploratory — the live full-page reload,
       the plain-text-vs-select rendering for a
       single-org user, and the top bar carrying neither
       switcher nor greeting
- [ ] **G41** Person and agent writes land on the message
  plane. On a human detail page, click Edit, change
  Title or Bio, and Save. PASS: `PUT /identities/:id`
  (and PII when contact fields change) persists the
  profile; reload shows the new values. On an AI
  detail page, change Description or Skill Focus and
  Save. PASS: `PUT /ai-agents/:id` persists; reload
  shows the new values. No composing POST writes
  three pairs.
  Pin: tests/adapters-members.test.ts 'putHumanMember
       updates the identity profile' (decides a Title
       edit persists via `PUT identities/:id`);
       tests/members-detail-reduce.test.ts 'a changed
       field returns the full four-field patch' (decides
       a changed PII field — the fixture changes `name`,
       and `humanMemberPiiPatchIfDirty` ORs all four
       fields, so a Bio edit takes the same path — fires
       the full PII PUT);
       tests/members-detail-reduce.test.ts 'an unchanged
       draft returns undefined — a detail-only save
       omits the PUT identities/:id/pii call' (decides a
       Title-only save omits the PII PUT);
       tests/adapters-ai-members.test.ts 'putAIMember
       updates the agent document' (decides a Skill
       Focus edit persists via `PUT ai-agents/:id`);
       exploratory — the live reload showing the new
       values (no test asserts the absence of a 3-pair
       composing POST)

### Billing (`billing/`) — STUB

Billing is a placeholder page. `init()` is empty and
the body is hand-written static HTML. These tests
verify the page loads and the sidebar nav link
works; functional billing is tracked in `TODO.md`.

- [ ] **G42** Click "Billing" in the sidebar. PASS:
  browser navigates to `billing/index.html`. The page
  renders without console errors. Sidebar highlights
  the Billing link as active. No runtime JS errors
  from the empty `init()`.
  Pin: exploratory — the live navigation, the console
       staying clear, and the sidebar active-link
       highlight (the stub page carries no CLI or
       browser test)

### Organization Edit Cycle

- [ ] **G38** On `organization/index.html`, click
  Edit in the page header. Modify the
  Domain to a new value. Click Cancel. PASS: card
  returns to read mode, Domain shows the original
  (unmodified) value, no toast fires.
  Pin: exploratory — the live Edit→Cancel discard toggle
       (`web-app/organization/index.ts`'s click handler
       carries no CLI or browser test)
- [ ] **G39** Click Edit again. Modify Domain.
  Press `Escape`. PASS: card returns to read mode,
  Domain shows the original value (Escape behaves
  identically to Cancel; same code path as the
  Member Detail edit cycle).
  Pin: exploratory — the live Escape-to-discard toggle
       (mirrors G22's keydown handling; no CLI or
       browser test)
- [ ] **G40** Click Edit. Modify both Organization
  Name and Domain. Click Save. PASS: toast
  "Organization saved" fires at top-center,
  card returns to read mode showing the new
  values. Reload the page. PASS: new values
  persist (round-tripped through
  `PUT /organizations/<id>`). Inspect the
  `organizations/:id` document message pairs on the message
  plane (`message_pairs`): the latest head
  body carries the updated `name` and `domain`
  alongside the unchanged `seats`,
  `projects_limit`, `ideas_limit`, and
  `next_billing` fields (no `organizations` entity
  store remains after Phase Final).
  Pin: tests/adapters-organizations.test.ts
       'putOrganization then getOrganization
       round-trips' (decides a Name edit persists via a
       fresh read; this fixture never varies `domain`,
       so it decides nothing about Domain specifically);
       tests/drift-organizations.test.ts 'leg 4: PUT
       /organizations/:id then wire + derive agree on
       the updated entity' (decides the Domain half too
       — its `updatedFields` carries `domain`, and its
       `assert.deepEqual(stored, expected)` fails if any
       field, Domain included, does not round-trip — and
       decides the message-plane head body carries every
       field with `id` last); exploratory — the live
       toast and read-mode return

---

## H. Reference & System

- [ ] **H1** Navigate to `design-system/`. PASS: component gallery renders showing buttons, badges, cards, form elements, toasts, and other UI components from the design system.
  Pin: tests/design-system-render.test.ts
       'design-system render is byte-stable';
       exploratory — the browser-painted gallery
- [ ] **H2** Navigate to `not-found/`. PASS: 404 page renders with a message and a link back to the dashboard or landing page.
  Pin: exploratory — the rendered 404 message and link

---

## I. Cross-Cutting Concerns

### Theme

- [ ] **I1** Click the theme toggle (sun/moon icon) in the header, select "Dark". PASS: page switches to dark theme — background darkens, text lightens, CSS custom properties update.
  Pin: exploratory — the live toggle click and the
       dark-theme repaint
- [ ] **I2** Navigate to another page. PASS: dark theme persists across navigation.
  Pin: exploratory — the live cross-page persistence
       and repaint; a similarly-named existing test
       does not decide this — it stubs `matchMedia`
       to `matches: true` and never distinguishes the
       module's own `'system'`-default fallback
       (which independently computes 'dark' from that
       same stub) from an actual hydration of the
       stored value, so it stays green even with
       hydration deleted entirely
- [ ] **I3** Select "Light" theme. PASS: page returns to light theme.
  Pin: exploratory — the live toggle click and the
       light-theme repaint
- [ ] **I4** Select "System" theme. PASS: theme follows OS preference (matches `prefers-color-scheme`).
  Pin: tests/state-theme-icon.test.ts 'a
       prefers-color-scheme change event applies
       data-theme while preference is system';
       exploratory — the live System selection and
       the OS-preference match
- [ ] **I5** Reload the page. PASS: theme choice persists (stored in `localStorage` key `fusion-angle:theme`).
  Pin: tests/fusion-angle-identifiers.test.ts
       'storage keys use the fusion-angle prefix'
       (decides the exact key name
       `fusion-angle:theme`); exploratory — the live
       reload persistence; a similarly-named existing
       test does not decide the hydration itself — see
       I2's Pin for the confound
- [ ] **I6** Open the app in a second browser
  tab. Change theme in the first tab. PASS:
  second tab updates to the new theme without
  manual reload (cross-tab sync via
  StorageEvent), including the sun / moon /
  system toggle icon — not only `data-theme`
  on `<html>`. An OS `prefers-color-scheme`
  change while preference is System fires the
  `MediaQueryList` `change` event and updates
  `data-theme` without reload; the toggle
  glyph stays the system icon. CDP
  `Emulation.setEmulatedMedia` that mutates
  `matches` without `change` is not this case
  — after emulate, dispatch
  `new MediaQueryListEvent('change', {
  matches: mq.matches })` on
  `window.matchMedia('(prefers-color-scheme:
  dark)')` (one interned list per query), or
  use a real OS toggle.
  Pin: tests/state-theme-icon.test.ts 'a cross-tab
       theme storage event repaints the toggle icon'
       (a synthetic `storage` event repaints both the
       desktop and mobile toggle icons, not only
       `data-theme`); tests/state-theme-icon.test.ts
       'a prefers-color-scheme change event applies
       data-theme while preference is system';
       tests/state-theme-icon.test.ts 'a
       MediaQueryList change on a later matchMedia
       call applies data-theme while preference is
       system' (a listener registered at init still
       fires from a MediaQueryList obtained by a later
       `matchMedia()` call — the interned-list
       precondition this case's CDP workaround
       depends on); exploratory — the live second tab
       and the dispatched `MediaQueryListEvent`

### Sidebar

- [ ] **I7** Click the sidebar collapse button. PASS: sidebar collapses to icon-only view, main content area expands.
  Pin: tests/browser/sidebar.test.ts 'collapse and
       expand transition the sidebar width' (its
       collapse half: width to 64px, the
       `sidebar-collapsed` class, nav-text hidden);
       exploratory — the main content area expanding
- [ ] **I8** Navigate to another page. PASS:
  collapsed state persists (stored in
  `localStorage` key
  `fusion-angle:sidebar-collapsed`).
  Pin: tests/fusion-angle-identifiers.test.ts
       'storage keys use the fusion-angle prefix'
       (decides the exact key name); exploratory —
       the live cross-page persistence; `initState`
       hydrating a valid stored sidebar-collapsed
       value carries no CLI test today — only the
       corrupt-value rejection is (a sibling test in
       `tests/state-init.test.ts`)
- [ ] **I9** Click the expand button. PASS: sidebar returns to full width with labels.
  Pin: tests/browser/sidebar.test.ts 'collapse and
       expand transition the sidebar width' (its
       expand half: width back to 256px, nav-text
       visible again); exploratory — the live click
       and paint of the expand

### Mobile Responsive

Set a real CSS viewport ≤767px for I10–I15
(browser-use device metrics / CDP
`Emulation.setDeviceMetricsOverride`). Do
not source-verify in lieu of the live
layout.

- [ ] **I10 — Mobile breakpoint** Set CSS
  viewport ≤767px. PASS: desktop `.sidebar`
  is not visible; `.mobile-header` is
  visible (`display: flex`). Restore ≥768px.
  PASS: sidebar visible, mobile header
  hidden.
  Pin: tests/browser/viewport.test.ts 'below 768px
       the drawer replaces the desktop sidebar'
       (checks both elements at ≤767px, but after
       restoring to ≥768px re-checks only
       `#desktop-sidebar`, not that `.mobile-header`
       hides again); exploratory — that
       `.mobile-header`'s computed `display` is
       specifically `flex` rather than merely
       visible, and that it goes hidden again after
       the restore
- [ ] **I11** Tap/click the hamburger menu. PASS: mobile sidebar sheet slides in from the left with navigation links.
  Pin: exploratory — the live drawer slide-in;
       `initMobileDrawer` carries no CLI or browser
       test today
- [ ] **I12** Tap/click the backdrop or a nav link. PASS: mobile sidebar closes.
  Pin: exploratory — the live backdrop/nav-link close
- [ ] **I13** Tap a navigation link in the mobile sidebar. PASS: navigates to the target page and mobile sidebar closes. (Note: the drawer closes implicitly via page navigation — the next page loads in default-hidden state. No explicit close-on-link-click handler is required; navigation is the close trigger.)
  Pin: exploratory — the live navigation and the
       drawer's default-hidden state on the next page
- [ ] **I14** Open the mobile sidebar, press `Escape`. PASS: sidebar closes.
  Pin: exploratory — the live Escape-close
- [ ] **I15** Open the mobile sidebar, press `Tab` repeatedly. PASS: focus cycles through focusable elements inside the sidebar without escaping to the page behind it. `Shift+Tab` at the first element wraps to the last.
  Pin: exploratory — the live focus cycle and wrap;
       no focus-trap test exists today

### Command Palette

- [ ] **I16** Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux). PASS: command palette overlay appears with search input focused.
  Pin: exploratory — the live keybinding, overlay,
       and input focus
- [ ] **I17** Type a search term (e.g. "ideas"). PASS: filtered results appear. Select a result — navigates to the corresponding page.
  Pin: tests/command-palette-search.test.ts
       'searchItems matches title case-insensitively'
       (decides the filtering a typed term drives);
       exploratory — the live open, the typed search,
       and the result-click navigation
- [ ] **I18** Press `Escape`. PASS: command palette closes.
  Pin: exploratory — the live Escape-close
- [ ] **I19** Open command palette, type a search term. Use `Down Arrow` and `Up Arrow` to navigate results. PASS: active result highlight moves with arrow keys. Press `Enter`. PASS: navigates to the highlighted result.
  Pin: exploratory — the live arrow-key highlight and
       Enter navigation; the palette's keyboard-index
       logic is unexported DOM glue with no CLI test
       today
- [ ] **I20** Open command palette with an empty search field. PASS: results list shows up to 12 items from the combined index, grouped by category (Ideas, Projects, Members, Pages) with category headers — when the dataset is sparse enough for multiple categories to fit in 12 items, multiple groups appear; otherwise a single group is shown. Type a multi-category term (e.g. "a", which matches across Pages / Ideas / Projects / Members) that matches across groups. PASS: results regroup under multiple category headers. Type a term that matches no results. PASS: result list is empty or shows a no-results message.
  Pin: tests/command-palette-search.test.ts
       'searchItems empty query caps at default
       count' (an empty query over 50 items returns
       exactly 12); tests/command-palette-search.test.ts
       'searchItems no match returns empty';
       exploratory — the live category grouping,
       headers, and the regroup across categories

### Loading States

- [ ] **I21** Navigate to a data-dependent page
  with mock data loaded; do not `wait_for_load`
  first (see Driving notes). PASS: loading
  skeleton (card-grid, card-list, or detail
  pattern) appears, then content replaces it.
  Pin: exploratory — the live pre-settlement
       skeleton; `loadInto` is tested only after its
       fetch settles (empty, data, or error), never
       during the pending skeleton itself
- [ ] **I22** If an error occurs inside a `loadInto()` fetch path (e.g. a data-dependent page hits a thrown adapter error after the database initialized successfully), the error state with "Try Again" retry button is shown. PASS: clicking retry re-attempts data loading. The explorer has no way to force this fault live; if none occurs naturally, record BLOCKED naming that reason — an honest BLOCKED costs nothing.
  Pin: tests/loading-states.test.ts 'a rejecting
       fetch renders the error state and calls
       neither hook' (a rejected fetch renders a
       "Try Again" control and calls neither
       `onEmpty` nor `onData`); exploratory — the
       live retry click re-attempting the load

### Toasts

- [ ] **I23** Trigger a toast (e.g. save an idea). PASS: toast appears at top-center of the viewport (fixed to `top: var(--space-4); left: 50%; translateX(-50%)`), auto-dismisses after ~6 seconds with fade-out. (Toast position was migrated from bottom-right to top-center.)
  Pin: exploratory — the live position, the
       ~6-second auto-dismiss, and the fade
- [ ] **I24** While a toast is visible, click its close button (×). PASS: toast dismisses immediately without waiting for auto-dismiss timer.
  Pin: tests/browser/toasts.test.ts 'the close button
       detaches a toast inside its fade' (the toast
       detaches within 1.5s of the close click, well
       inside the 6s auto-dismiss window); exploratory
       — the live fade-out visual
- [ ] **I25** Trigger multiple toasts in rapid succession (e.g. save an idea repeatedly). PASS: toasts stack visibly with the *newest at the top*, older ones flowing downward (`prepend` ordering, not `appendChild`). Up to 5 visible. When a 6th toast arrives, the *oldest* — at the bottom of the stack — is removed.
  Pin: tests/browser/toasts.test.ts 'the stack caps
       at five toasts' (decides the cap only — every
       toast in the test carries identical text, so
       it cannot decide which one is evicted or that
       new ones render on top); exploratory — the
       newest-on-top ordering and that the toast
       removed is specifically the oldest

### General

- [ ] **I26** Confirm Snapshots is gone: sidebar
  has no Snapshots item; `snapshots/` is not a
  PAGE_REGISTRY page (unsigned load is the
  not-found page, not a restore UI). Historical
  I26 (download → wipe → upload) retired with
  the snapshots page.
  Pin: tests/page-registry.test.ts 'sidebar has no
       Snapshots item'; tests/page-registry.test.ts
       'PAGE_REGISTRY has no snapshots page';
       tests/page-registry.test.ts 'retired snapshots
       is a missing page' (an unsigned `snapshots/`
       load resolves as the not-found page);
       exploratory — the live sidebar and the live
       not-found render
- [ ] **I27** Check DevTools Console after navigating through 5+ different pages. PASS: no unhandled JavaScript errors (warnings and info messages from browser extensions are acceptable).
  Pin: exploratory — the live DevTools console across
       5+ navigations

### Sidebar Cross-Tab Sync

- [ ] **I28** Open the app in two tabs. In tab 1 collapse the
  sidebar. PASS: tab 2 reflects the collapsed state without manual
  reload (cross-tab sync via StorageEvent on
  `fusion-angle:sidebar-collapsed`).
  Pin: exploratory — the live cross-tab sync; only
       the `STORAGE_KEY_THEME` branch of `state.ts`'s
       shared storage-event listener is tested (a
       sibling test in `tests/state-theme-icon.test.ts`)
       — its `STORAGE_KEY_SIDEBAR` sibling branch
       carries no CLI test today

### Accessibility

- [ ] **I29 — Skip link & `<main>` landmark**
  From a fresh load of any sidebar-layout
  page, press `Tab` once. PASS: the first
  focusable element is a "Skip to main
  content" link (visually hidden until
  focused via the `.skip-link` translateY
  rule in `base.css`); pressing `Enter`
  moves focus past the sidebar and top-bar
  into the page body. Then confirm via
  `js()` that the content wrapper is a
  `<main id="main-content">` landmark (not
  a bare `<div class="page-content">`) and
  that the composed shell
  (`web-app/app/components-layout.html`)
  contains exactly one `<main>`. Guards
  WCAG 2.4.1 Bypass Blocks (Level A).
  Pin: exploratory — the live tab order, the focus
       move on Enter, and the single `<main>` landmark
- [ ] **I30 — Reduced-motion view-transition
  guard** Emulate `prefers-reduced-motion:
  reduce` (see Driving notes). PASS: the
  `@media (prefers-reduced-motion: reduce)`
  rule in `base.css` sets
  `::view-transition-group(*)` /
  `::view-transition-old/new(*)` and the
  named `::view-transition-old/new(page-content)`
  to `animation: none` (the named rule
  otherwise beats `*`). Navigating does
  not play `fade-in-up`'s `translateY`
  slide (`utilities.css`). The universal
  `*, *::before, *::after` reset does NOT
  reach view-transition pseudo-elements.
  Guards WCAG 2.3.3 Animation from
  Interactions (AAA).
  Pin: tests/base-css-motion.test.ts 'reduced motion
       names page-content view transitions so
       fade-in-up cannot win' (decides the block
       names the `page-content` pair with
       `animation: none`; it does not check for the
       `::view-transition-group(*)` or wildcard
       `::view-transition-old/new(*)` selectors this
       case's PASS line also names); exploratory —
       the live navigation not playing the slide, and
       that the wildcard selectors themselves carry
       `animation: none`. A neighboring browser test
       clamps a different CSS mechanism (the
       universal `transition-duration` reset on
       `#desktop-sidebar`), not the named
       view-transition override this case guards, so
       that test is not cited here

---

## K. Objectives & Scoring

Select Stark Industries in the sidebar `.org-switcher`
before K1: G36 leaves another organization active and
G40 renames it, so no leftover name identifies it. Every
case below assumes the active organization is Stark
Industries. K8 is the master's: it wipes and reseeds after
the explorer returns (`## The walk` step 5), not in
document order with the rest of this section.

### K1–K6 — Organization Objectives box

- [ ] **K1** Open Organization page; confirm Objectives
  box renders between the Overview and Usage cards with
  4 seeded active objectives in position order. PASS if
  all 4 names display.
  Pin: tests/mock-data-objectives.test.ts 'seeds every
       objective seed plus the org-2 objective' (pins the
       seeded count at exactly `OBJECTIVE_SEEDS.length`,
       4); tests/presenter-organization-objectives.test.ts
       'renders active section with each active
       objective' (renders each objective's name and id);
       exploratory — the live position-ordered placement
       between Overview and Usage
- [ ] **K2** Click `+ Add objective`; confirm modal
  opens. Enter name "Test Objective" and description
  "Test desc"; click Add. PASS if the new objective
  appears at the bottom of the active list.
  Pin: tests/presenter-organization-objectives.test.ts
       'renders add-objective affordance';
       tests/drag-reorder.test.ts 'nextPosition appends one
       POSITION_GAP past the last integer entry' (decides a
       new objective's position lands after every existing
       one); tests/adapters-objectives.test.ts
       'postObjectiveCreation writes via GET the objective
       and its first revision through POST /objectives';
       exploratory — the live modal and the visual
       bottom-of-list placement
- [ ] **K3** Click `Edit` on "Lower expenses"; confirm
  modal opens pre-filled. Change the name to "Cut costs";
  click Save. PASS if the list re-renders with the new
  name. K30 and K7 later confirm this rename resolves
  temporally.
  Pin: exploratory — the live modal, pre-fill, and
       re-render; `postObjectiveRevision` in
       web-app/app/adapters/objectives.ts (the write this
       Save triggers) carries no test today
- [ ] **K4** Click `Archive` on "Test Objective" (K2);
  confirm dialog opens. Confirm. PASS if the objective
  moves from active to the Archived sub-section, with
  strikethrough.
  Pin: tests/adapters-objectives.test.ts
       'postObjectiveArchival PUTs the document with an
       archived trio and the current position';
       tests/presenter-organization-objectives.test.ts
       'renders archived section under active' (its own
       assertions are unscoped `.includes()` calls that
       confirm an "Archived" section and the objective's
       name both render, not their relative order);
       exploratory — the live confirm dialog, the
       strikethrough style, and the Archived
       sub-section's position under Active
- [ ] **K5** Click `Reactivate` on "Test Objective"; PASS
  if it returns to the active list.
  Pin: tests/adapters-objectives.test.ts
       'getObjectiveLifecycleEvents streams dated
       transitions oldest-first' (drives
       postObjectiveReactivation and confirms the
       lifecycle records it); exploratory — the live
       return to the active list
- [ ] **K6** Drag "Test Objective" to a new position.
  Drive with compositor mouse: `pointerdown` on
  `.drag-handle` (pointer capture), `pointermove`,
  `pointerup` — not HTML5 `drop`. PASS if the new
  position persists across a page reload.
  Pin: tests/adapters-objectives.test.ts 'computeNewPosition
       + putObjectivePosition wedge an item into the
       middle without renumbering anyone';
       tests/adapters-objectives.test.ts
       'putObjectivePosition preserves adjacent
       fractional values across sequential reorders';
       exploratory — the live compositor-mouse drag and
       the reload-persistence observation (no browser
       test drags an objective row;
       tests/browser/list-reorder.test.ts drags projects,
       a different list)
- [ ] **K8** Empty state: stop the A3 process.
  `./postgres-wipe --postgres local` then
  `./postgres-seed --postgres local --bootstrap` then
  start `./fusion-angle serve`. Sign in with the stdout
  admin credential. Open Organization. PASS: the empty-state
  copy "No objectives yet. Add one to get started."
  renders (bootstrap seeds org 1 with no objectives).
  Restore the mock garden by stopping again,
  `./postgres-wipe --postgres local`, then
  `./postgres-seed --postgres local --mock-data`, then
  start. This is the one case that seeds `--bootstrap`
  rather than `--mock-data`; do not skip it. `crank`
  mints `POSTGRES_URL`/`JWT_HMAC_SIGNING_KEY` and never
  prints them, so this manual restart needs them already
  set in the master's own shell (e.g. from a prior
  `./serve` session) — a pre-existing limitation of this
  case, not one this audit can resolve.
  Pin: tests/presenter-organization-objectives.test.ts
       'empty state when no objectives'; exploratory —
       the live wipe/bootstrap/restore ceremony

### K9–K18 — Project detail: inline scoring + Approve

The Score and Log-measurement MODALS are retired.
Baseline and actual scores are edited INLINE in
`#project-objectives-section`: each
`.project-objective-row` carries EITHER a
`.baseline-slider` (before approval) OR an
`.actual-slider` (once approved) — mutually exclusive,
selected by project state — with one shared `Save`
(`data-action="save-objectives"`) button that enables
only when a slider moves off its `data-initial-value`. A
project converted through the UI arrives at `submitted`
ALREADY baseline-scored (convert requires a baseline per
active objective), so exercising the
unscored-then-score-then-approve path needs a project
seeded directly, never converted.

Subject: Smart Inventory Optimization
(`OXxlaOFaAWfVofOqOHeTrQ`), seeded `sent_back` — the
only unreserved Stark project still carrying an unscored
objective. The sole seeded `submitted` project, Market
Sentiment Analyzer, is not available here: AA24a's
surviving text drives it all the way to `approved`
earlier in this same document-order walk. K26's three
`under_review` titles (Workforce Capacity Forecasting,
Predictive Maintenance System, Employee Training
Assistant) are reserved — do not Approve or Archive
them; K18 below only reads one, and does not save.
Smart Inventory Optimization's "Lower expenses" baseline
is already seeded; "Increase incomes", "Raise customer
NPS", and "Improve employee morale" are not.

- [ ] **K9** Open Smart Inventory Optimization. PASS if
  the header actions slot shows Edit
  (`#project-edit-btn` in `.project-actions-slot`), the
  review action bar (`#project-review-actions` /
  `.action-bar`) shows Approve / Decline / Send back and
  no View history, and the objective rows' baseline
  sliders are editable inline.
  Pin: tests/presenter-project-action-bar.test.ts
       'sent_back project: Score button hidden, other
       review actions shown' (decides only the Score
       button's absence and Approve's presence on
       `sent_back` — Decline and Send back are pinned for
       `submitted` in that file's sibling test, not for
       `sent_back` itself); exploratory —
       Decline/Send-back's presence and View history's
       absence on `sent_back` specifically (the nearest
       real decider, 'lifecycle actions empty on
       under_review', tests a different state —
       `under_review`, not `sent_back` — and a different
       presenter method, `buildLifecycleActions`); the live
       header actions slot and the inline sliders on a
       `sent_back` project (the presenter's
       editable-baseline branch is exercised only for
       `under_review` in
       tests/presenter-project-objectives.test.ts;
       `sent_back` shares the same code but carries no
       direct test)
- [ ] **K10** Transition status to `under_review` via the
  edit form (resubmitting after being sent back). PASS if
  the baseline sliders remain editable inline — there is
  NO Score button and NO modal.
  Pin: tests/presenter-project-objectives.test.ts
       'baseline sliders enabled while under_review';
       exploratory — the live edit-form transition and
       the absent Score button/modal specifically at
       `under_review` (only `submitted` and `sent_back`
       have a direct Score-button-hidden test)
- [ ] **K11** With every objective but "Cut costs"
  (K3's rename) still unscored — Increase incomes, Raise
  customer NPS, Improve employee morale, and Test
  Objective if K2's creation and K5's reactivation both
  held — the `Approve` button is disabled with a tooltip
  prefixed "Set a baseline score before approving:"
  followed by the comma-joined names of every
  still-unscored objective. The convert-time gating
  STILL HOLDS even though the modal is gone.
  Pin: tests/adapters-project-publish.test.ts 'validator:
       not ready when objectives unscored' (decides the
       gate itself returns `ready: false` while any active
       objective lacks a baseline);
       tests/presenter-project-action-bar.test.ts
       'under_review with no scores: Approve disabled'
       (decides the rendered `disabled` attribute follows
       from `ready: false`);
       tests/presenter-project-action-bar.test.ts 'Approve
       tooltip enumerates unscored objective names'
       (decides the exact tooltip prefix and comma-joined
       format — proven there with two names, not however
       many are live here); exploratory — the live
       enumeration's exact membership
- [ ] **K12** Inspect the objective rows; PASS if
  "Cut costs" (K3's rename of "Lower expenses") shows
  its seeded baseline value and every other active
  objective — Increase incomes, Raise customer NPS,
  Improve employee morale, and Test Objective if it is
  still active — shows an inline slider at its unset
  position (no modal opens).
  Pin: tests/presenter-project-objectives.test.ts
       'renders one row per active objective'; exploratory
       — the live seeded-vs-unset row states and the row
       count (four or five, depending on K5)
- [ ] **K13** Drag the "Increase incomes" and "Raise
  customer NPS" sliders to non-zero values — send "Raise
  customer NPS" to the far left (−100); Save. PASS if the
  shared `Save` button enables (dirty-tracked), the rows
  show the saved baselines including the signed −100, and
  Approve is **still** disabled because at least "Improve
  employee morale" (and Test Objective, if K2/K5 left it
  active) remains unscored.
  Pin: tests/presenter-project-objectives.test.ts
       'renders Save button when any slider is editable'
       (decides the button is present in the markup, not
       that it dynamically enables on drag — that is
       exploratory); tests/validators-objectives.test.ts
       'validateBaselineScoreEntity accepts -100 and
       +100' (decides −100 is a legal, persistable signed
       score); tests/adapters-project-publish.test.ts
       'validator: not ready when objectives unscored'
       (decides the gate returns `ready: false` while any
       active objective lacks a baseline);
       tests/presenter-project-action-bar.test.ts
       'under_review with no scores: Approve disabled'
       (decides the rendered `disabled` attribute follows
       from `ready: false`); exploratory — the live drag,
       the dirty-tracked enable, and the signed −100
       display on this screen (its post-save persistence
       is K14's; its history-modal rendering is K17's)
- [ ] **K14** After save, PASS if the moved sliders'
  `Save` button disables again (each slider's
  `data-initial-value` resets to the saved value) and
  saved values persist on re-render.
  Pin: exploratory — dirty-tracking has no CLI or browser
       test; only the presenter's initial render is tested
       (tests/presenter-project-objectives.test.ts), never
       a save-then-rerender cycle
- [ ] **K15** Drag every still-unscored slider —
  "Improve employee morale", and Test Objective if K2's
  creation and K5's reactivation both held; Save. PASS if
  the Approve button enables now that every active
  objective has a baseline.
  Pin: tests/adapters-project-publish.test.ts
       'validator: ready when all scored' (decides the
       gate itself: ready once every active objective
       carries a baseline, independent of count);
       tests/presenter-project-action-bar.test.ts
       'under_review with full scoring: Approve enabled'
       (decides the button renders enabled once the gate
       says ready — fed `{ready: true}` directly, so it
       does not itself decide the gate); exploratory — the
       live drag and the enable transition
- [ ] **K16** Click Approve; confirm dialog opens.
  Confirm. PASS if status flips to `approved` and the
  action bar re-renders with `Archive` / `View history`;
  the row `.actual-slider`s become editable inline.
  Pin: tests/adapters-project-publish.test.ts
       'postProjectApproval moves state to approved'
       (decides the write itself lands `approved`);
       tests/presenter-project-objectives.test.ts
       'baseline slider hidden after approval' (decides
       the slider swap this transition produces);
       exploratory — the live confirm dialog and the
       `View history` button (`data-action="view-history"`
       in web-app/app/presenters/project-action-bar.ts
       carries no test today)
- [ ] **K17** Negative-score path: recall K13's −100 for
  "Raise customer NPS". PASS if the row still shows the
  saved value as a signed −100, and View history (K30)
  lists it with the negative-score tone.
  Pin: tests/presenter-project-score-history.test.ts
       'negative score TD carries data-tone="error"';
       exploratory — the live persistence of the signed
       value on the objectives screen itself
- [ ] **K18** "No-payload" save: open Workforce Capacity
  Forecasting (K26's reserved trio; read-only here — do
  not drag any slider) with no slider moved off its
  `data-initial-value`. PASS if the `Save` button stays
  disabled and no new baseline-score pairs are written
  under `projects/.../objective-baseline-scores` (pair
  count unchanged via console).
  Pin: exploratory — the no-payload guard has no CLI or
       browser test; `postProjectBaselineScoring` is
       tested only with a non-empty payload
       (tests/adapters-project-scoring.test.ts)

### K19–K23 — Inline actual measurement + Archive

- [ ] **K19** Open Smart Inventory Optimization (now
  `approved`, K16). PASS if the objective rows'
  `.actual-slider`s are editable inline (there is no Log
  measurement modal), pre-filled from each objective's
  baseline (none has an actual yet — the seed scores
  actuals only for projects it seeds `approved` or
  `archived`, and this one was seeded `sent_back`).
  Pin: tests/presenter-project-objectives.test.ts
       'actual sliders enabled while approved for
       baseline-scored objectives'; exploratory — the
       live prefill from the baseline specifically
- [ ] **K20** Drag the "Cut costs" actual slider (K3's
  rename of "Lower expenses"); click `Save`. PASS if the
  row's actual value updates (persisted via
  `postProjectActualMeasurement`) and the Save button
  re-disables. This mints the FIRST live score event for
  this objective since K3's rename — K30 reads it back.
  Pin: tests/adapters-project-scoring.test.ts
       'postProjectActualMeasurement appends via GET
       scores'; exploratory — the live drag and the
       re-disable
- [ ] **K21** Re-render the page; PASS if the moved
  actual slider pre-fills with its latest actual value.
  Then score every remaining unscored actual slider and
  Save so every active objective carries an actual (K22
  needs full actual coverage to enable Archive).
  Pin: tests/adapters-project-publish.test.ts
       'archival validator: not ready when actuals
       missing' (decides full-actual coverage gates
       Archive — the reason this step scores the rest,
       not the PASS line itself); exploratory — the live
       re-render prefill onto the slider's `value`
       attribute specifically ('shows latest actual with
       sign' does not decide this: its assertion,
       `html.includes('−10') || html.includes('-10')`,
       is unscoped over the whole blob — the U+2212 form
       renders only in `.slider-value`/the gauge tooltip,
       never in the ASCII `value="${actValue}"` attribute
       the slider itself uses, and the ASCII form is a
       tautology against the static `min="-100"` every
       slider carries regardless of any data; mutation-
       checked)
- [ ] **K22** The terminal action is `Archive`, not
  "Complete", and the terminal state is `archived`, not
  `completed` — there is no `completed` value in
  `PROJECT_STATES`. Click Archive; PASS if a confirmation
  dialog opens.
  Pin: tests/presenter-project-action-bar.test.ts
       'approved with full actuals: Archive enabled';
       exploratory — the live confirmation dialog
- [ ] **K23** Confirm the archive. PASS if status flips
  to `archived` and the action bar reflects the archived
  project.
  Pin: tests/adapters-project-publish.test.ts
       'postProjectArchival moves state to archived';
       exploratory — the live action-bar reflect

### K24–K26 — Projects list Projected Impact column

- [ ] **K24** Open Projects list; PASS if the Projected
  Impact column renders a value for each row — Employee
  Training Assistant (zero baselines, still reserved for
  K26) shows "—"; scored projects show a signed value.
  NOTE: the column header carries no visible text label
  (the "Projected Impact" name is not rendered in the
  header row), so identify the column by its
  position/content, not header text.
  Pin: tests/presenter-projects-list-column.test.ts
       'projected impact column renders for each
       project'; tests/presenter-projects-list-column.test.ts
       'missing score renders absent and sorts last';
       exploratory — the live header's absent text label
- [ ] **K25** Sort by Projected Impact descending; PASS
  if rows re-order accordingly (most-positive first).
  Pin: tests/presenter-projects-list-column.test.ts
       'applyProjectSortToggle orders by projected impact
       descending with no-score last'; exploratory — the
       live sort-control click and re-order
- [ ] **K26** Filter to `under_review` status + sort by
  Projected Impact descending. Three seeded `under_review`
  mock projects, high first: Workforce Capacity
  Forecasting, Predictive Maintenance System, Employee
  Training Assistant. PASS if those three rows render,
  ranked high first — the "review queue ranked by impact"
  workflow we designed.
  Pin: tests/presenter-projects-list-column.test.ts
       'applyProjectSortToggle orders by projected impact
       descending with no-score last' (decides the
       descending-with-absent-last ordering mechanism);
       exploratory — the live filter-to-`under_review`,
       and that these three seeded projects rank in this
       order (a seed-data fact, not a product covenant a
       unit test should pin)

### K27–K29 — Dashboard Impact + Aggregates

- [ ] **K27** Open dashboard; PASS if four surfaces
  render: three arc-gauge cards sharing one card shell
  (Time and Cost are ratio arc-gauges; Impact is a
  bipolar arc) and an Objectives box (below the grid, one
  gauge column wide; card title "Objectives").
  Pin: tests/adapters-dashboard.test.ts
       'getDashboardGauges returns the three sibling
       gauges'; tests/adapters-dashboard.test.ts
       'getDashboardGauges marks Time and Cost as ratio';
       tests/adapters-dashboard.test.ts
       'getDashboardGauges marks Impact as bipolar';
       tests/presenter-dashboard-objective-aggregates.test.ts
       'card chassis matches Time/Cost/Impact pattern';
       tests/presenter-dashboard-objective-aggregates.test.ts
       'heading reads "Objectives"';
       tests/objectives-card-width.test.ts 'the
       Objectives card is one gauge column wide';
       exploratory — the live grid placement below the
       three gauge cards
- [ ] **K28** Inspect the Impact gauge. PASS if:
  - The arc has muted background visible at all values
  - For a net-positive portfolio (the mock seed's Stark
    Impact baseline is positive), value arcs sweep right
    and use green tones
  - For a net-negative portfolio, value arcs sweep left
    and use red tones
  - The "actual" tick is visually distinct from the
    baseline area (thinner / different opacity)
  Pin: tests/adapters-dashboard-mock-seed.test.ts 'mock
       seed produces portfolio Impact baseline +50'
       (establishes the live portfolio is net-positive,
       so only the right-sweep/green half is observable
       live); tests/presenter-misc.test.ts 'GaugePresenter
       bipolar at positive draws the RIGHT half only'
       (a scoped SVG path-`d` regex — decides the sweep
       direction only); tests/presenter-misc.test.ts
       'GaugePresenter bipolar at negative draws the LEFT
       half only' (same scoping, the net-negative half a
       healthy live seed cannot show); exploratory — the
       always-visible muted track, the actual-tick's
       visual distinctness, AND the green-for-positive /
       red-for-negative tone binding itself ('GaugePresenter
       bipolar declares the red-amber-green tri-gradient
       stops' only asserts that all three stop-colors
       appear somewhere in a blob rendering both halves —
       swapping which side gets which color leaves it
       green; mutation-tested)
- [ ] **K29** By this point Smart Inventory Optimization
  is `archived` (K23) and its Save button is gone — use
  Market Sentiment Analyzer instead (approved by AA24a
  earlier in this walk, baseline-scored, no actual yet).
  From another tab (same cookie jar), drag one of its
  actual sliders and Save. PASS if the Objectives box
  updates within ~1 second (BroadcastChannel
  `fusion-angle:data` + `subscribeProjectScoreChanges`);
  the three arc-gauge cards refresh only on full page
  load.
  Pin: exploratory — `subscribeProjectScoreChanges` /
       `notifyProjectScoreChange` in
       web-app/app/adapters/project-scoring.ts carry no
       CLI or browser test

### K30 + K7 — Project history modal & temporal name resolution

K7 runs last, after K30, so it can name the SAME rename
K30 only describes.

- [ ] **K30** Open Smart Inventory Optimization's View
  history modal (archived since K23 — View history stays
  available once archived). PASS if:
  - Events render in chronological order
  - Each row shows date, event kind, objective name (as
    it was at the event's moment), and detail
  - The seed's original "Lower expenses" baseline (dated
    before K3's rename) still displays "Lower expenses";
    K20's live actual (dated after K3's rename) displays
    "Cut costs"
  - Baseline revisions appear as their own event rows
    (not collapsed)
  Pin: tests/presenter-project-score-history.test.ts
       'merges all four streams chronologically';
       tests/presenter-project-score-history.test.ts
       'resolves historical objective name at each event'
       (decides the presenter places each score under the
       name correct for its own timestamp, GIVEN a
       resolver — the production resolver is inline,
       unexported glue in web-app/projects/detail.ts and
       carries no test of its own); exploratory — the
       live pre-/post-rename split on this specific
       project
- [ ] **K7** Reopen Smart Inventory Optimization's
  history modal (same as K30). PASS if events dated
  before K3's edit display the OLD objective name
  ("Lower expenses"), not "Cut costs" — decided directly,
  since K3 already ran earlier in this same document-order
  walk (no cross-agent wait). If K3's rename did not land
  (e.g., K3 itself FAILed as driven), mark K7 DEFERRED —
  its prerequisite did not produce what this case needs.
  Pin: tests/presenter-project-score-history.test.ts
       'resolves historical objective name at each event';
       exploratory — the live confirmation against K3's
       own edit

---

## R. Records

- [ ] **R1** Sidebar shows a Records entry; click navigates
  to `records/`. PASS: under the active org (Stark, org 1)
  the list renders Customer Profile; Project Brief is
  seeded under org 2 and is correctly hidden here.
  Pin: exploratory — the sidebar entry, the live
       navigation, and the org-scoped list contents
- [ ] **R2** Click "Add Record" (desktop) / "New Record"
  (mobile) → navigates to a create page
  (`records/create.html`) with Name and Description
  fields (not a dialog). Type values, click "Create Record".
  PASS: new Record appears at the bottom of the list and the
  app navigates to its detail page.
  Pin: tests/adapters-records.test.ts 'postRecordChange
       create writes the row and the initial state
       event'; exploratory — the create page's fields,
       the live navigation, and the new card's position
       at the bottom of the list
- [ ] **R3** Open Customer Profile detail. PASS: read mode
  shows name + description + attribute table sorted by
  sort_order + Bound flows (Customer Onboarding, Lead-to-
  Close) + Work orders using this Record list.
  Pin: tests/adapters-record-attributes.test.ts
       'getRecordAttributesByRecord returns rows in
       sortOrder ascending';
       tests/adapters-flow-records.test.ts
       'getFlowSummariesForRecord returns id and name
       for every flow bound to a record';
       tests/adapters-flow-records.test.ts
       'getWorkOrdersForRecord walks flow_records →
       flow_work_orders → work_orders correctly for a
       record bound to multiple flows';
       tests/mock-data-records.test.ts 'at least one
       seeded Record is bound to multiple flows via
       flow_records'; exploratory — the rendered
       read-mode layout
- [ ] **R4** Click Edit. PASS: edit mode renders name input,
  description textarea, and one editable row per attribute
  with name input, type picker, options textarea (for
  select-typed), and constraint editor.
  Pin: exploratory — the whole edit-mode form;
       `RecordDetailEditPresenter` carries no CLI test
       today
- [ ] **R5** Type a name into the pending-attribute input,
  then click "+ Add Attribute". PASS: a row is appended with
  default type `text`; an empty-name click is a no-op.
  Pin: exploratory — the live add-attribute interaction
       and the empty-name no-op
- [ ] **R6** Change a text attribute to `select`. PASS: the
  options textarea appears; the constraint picker offers
  only kinds applicable to `select` (i.e. nothing in the
  toy).
  Pin: exploratory — the live type-change reveal and
       the constraint picker's filtered options
- [ ] **R6a** Add an attribute and change its type to
  `radio`. PASS: the type picker offers `radio` alongside
  text/number/select/date/checkbox, and selecting it
  reveals the same "Options (one per line)" textarea that
  `select` shows; `checkbox` and the scalar types show no
  options field.
  Pin: exploratory — the type picker's live options and
       the textarea reveal
- [ ] **R6b** Give a `select` or `radio` attribute zero
  options and click Save. PASS: the save is rejected — a
  "Failed to save Record" toast appears and the editor
  stays open, because the API validator requires at least
  one option for choice fields (the gate, not merely a
  disabled button). Add one or more options and Save;
  PASS: it persists and read mode shows the attribute's
  type.
  Pin: tests/validators.test.ts
       'validateRecordAttributeEntity rejects a select
       with zero options'; tests/validators.test.ts
       'validateRecordAttributeEntity rejects a radio
       with zero options'; exploratory — the toast text,
       the editor staying open, and the live persisted
       save
- [ ] **R7** Add a `regex` constraint on a text attribute,
  set the pattern. PASS: constraint row appears with the
  pattern editable; the picker no longer offers `regex`
  for that attribute (toy implementation may always offer
  it — accept).
  Pin: exploratory — the constraint editor's row and
       the picker's post-add filtering
- [ ] **R8** Open record edit. PASS: each
  `.record-attribute-edit-row` has no
  `.drag-handle`. Attribute drag-reorder is
  later work (TODO.md), not a driver limit.
  Do not score BLOCKED. Do not attempt a
  synthetic DataTransfer here.
  Pin: exploratory — the absence of a drag-handle on
       each attribute row
- [ ] **R9** Remove an attribute via its trash button.
  PASS: row removed from the editor; not persisted until
  Save.
  Pin: exploratory — the live remove interaction and
       the unsaved-editor state
- [ ] **R10** Click Save. PASS: returns to read mode; the
  list reflects the new attribute set and constraint
  summaries.
  Pin: tests/adapters-records.test.ts 'postRecordChange
       edit replaces removed attributes with new ones';
       tests/adapters-records.test.ts 'putRecord
       overwrites an existing row'; exploratory — the
       live return to read mode and the rendered
       constraint summaries
- [ ] **R10a** Save a Record edit and watch the toast.
  PASS: exactly one "Record saved" toast appears — never
  a stack — and re-entrant saves are guarded (clicking
  Save repeatedly does not fire multiple saves or stack
  toasts). NOTE: the original 5-stacked-toast defect
  needed a slow save to open the race; the multi-attribute
  write is now a single batched table write, so the window
  is effectively closed and exercising the race
  deterministically may require artificially throttling
  storage.
  Pin: exploratory — the live toast count and the
       re-entrant-save guard
- [ ] **R11** Open a flow (Customer Onboarding). PASS: flow
  header shows `Record: Customer Profile` dropdown
  selected.
  Pin: tests/adapters-flow-records.test.ts 'putFlowRecord
       then getRecordForFlow round-trips the binding';
       exploratory — the painted header dropdown and its
       selection
- [ ] **R12** Open the Data Capture node panel. PASS: each
  ref row shows attribute name + Editable/Read-only picker
  + Required checkbox + remove (×) button; picker dropdown
  lists unreferenced attributes only.
  Pin: exploratory — the whole node-panel ref-row
       rendering; `buildAttributeRefRow` carries no CLI
       test today
- [ ] **R13** From workbox, open the gate-violation work
  order (`#gate0001`, `eOlNZpGQfmCdpSFWXGkzFQ`) at Data
  Capture, unbound. PASS: current node is Data Capture;
  the action screen shows Company Name and Contact Email
  inputs (fillable path); empty submit is blocked — the
  page-module empty-required pre-check toasts "Please fill
  all required attributes" before the POST. The typed
  gate (`validateRecordTransition` on CURRENT-node refs)
  is the durable covenant; CLI pins it; constraint
  failures still surface via
  `WorkboxDetailPresenter.buildViolations` banner. Only
  WO01 (`a7c3e1f9`) is instance-bound — do not bind
  `#gate0001` here (the seeded Customer Profile instance,
  Acme, already has values set), or the empty-submit toast
  can no longer be observed.
  Pin: tests/adapters-record-transitions.test.ts
       'validateRecordTransition returns a required
       violation when the CURRENT node has a required
       attribute with no stored value';
       tests/presenter-workbox-detail.test.ts
       'buildViolations names each failed attribute,
       phrasing range bounds by attribute type';
       tests/mock-data-records.test.ts 'the
       gate-violation work order has a current node
       with at least one required attribute with a
       null stored value'; exploratory — the action
       screen's rendered inputs and the pre-check
       toast text
- [ ] **R14** Fill Company Name + Contact Email, click
  submit. PASS: transition succeeds; work order advances
  to Review (does NOT demand Reviewer Notes — that is
  current-node only when leaving Review). The work order
  is still `#gate0001`; if it is still unbound, bind the
  seeded Customer Profile instance (Acme) via the bind
  picker — an existing instance, never a minted one.
  Pin: tests/adapters-record-transitions.test.ts
       'validateRecordTransition does not require
       TARGET-node attributes when the current node is
       clean'; exploratory — the live fill, submit, and
       bind-picker interactions
- [ ] **R14a** When a node references a `radio`-typed
  Record attribute, the workbox work-order detail renders
  it as a radio group — one `<input type="radio">` per
  option, all sharing the attribute name so only one is
  selectable — rather than a dropdown; selecting an option
  and transitioning records that value. NOTE: seeded mock
  data predates `radio`, so add a radio attribute,
  reference it Editable on a working node, and create a
  work order to exercise this.
  Pin: tests/presenter-workbox-detail.test.ts
       'buildAttributeInputHtml renders a radio group
       with one collectable input per option';
       exploratory — the live selection and the
       transition that records the value
- [ ] **R15** Open the R2-created Record's detail
  page — never Customer Profile (R16–R20 read it).
  Click Archive; confirm in the house dialog
  (`data-dialog-open="confirm-archive"`). PASS: a
  "Record archived" toast appears, the header badge
  reads Archived, and the Archive button is gone. On
  `records/` the card reads Archived, an Archived
  chip appears beside Active, and toggling the
  Active chip hides the card. There are no numeric
  counts on the chips.
  Pin: tests/presenter-record-detail.test.ts 'an
       archived record hides Archive and reads
       Archived'; tests/adapters-records.test.ts
       'postRecordStateChange records a new event
       without changing non-lifecycle entity fields
       on GET'; exploratory — the toast, the
       records/ card and chip rendering, and the
       chip's live toggle
- [ ] **R16** Open Customer Profile detail. PASS: an
  Instances section lists the seeded instances (id +
  readable values) — at least one seeded instance
  (Company Name "Acme Corp") — with a "New instance"
  control. The empty "No instances yet" state is a
  real UI branch the CLI pin below decides; Customer
  Profile is never empty on this seed, so the
  explorer will not see it live.
  Pin: tests/presenter-record-instances.test.ts
       'empty instances section shows empty state';
       tests/presenter-record-instances.test.ts
       'list renders instance id and projected
       values'; exploratory — the live section's
       rendering on Customer Profile
- [ ] **R17** Click "New instance". PASS: an identifier is
  minted, PATCH creates an empty instance (201, etag
  consumed; the adapter is `putRecordInstance`, the wire
  verb is PATCH), and the section enters edit mode with
  writable attribute inputs (readable non-writable
  attributes render read-only; unreadable omitted).
  Pin: tests/adapters-record-instances.test.ts 'instance
       create → list → patch → 412 → retry → delete →
       history'; tests/presenter-record-instances.test.ts
       'edit form: writable input, readonly text,
       unreadable omitted' (the writable/readonly
       halves); tests/presenter-record-instances.test.ts
       'projectInstanceFields drops unreadable and
       marks write vs read' (the omission itself — the
       edit-form test's own "unreadable omitted"
       assertion never supplies an unreadable field, so
       it cannot fail); exploratory — the live click
       and the minted identifier
- [ ] **R18** Fill a writable field and click Save. PASS:
  `patchRecordInstance` succeeds with the held etag; the
  section returns to list mode and the new value appears.
  Pin: tests/adapters-record-instances.test.ts 'instance
       create → list → patch → 412 → retry → delete →
       history'; exploratory — the live return to list
       mode and the rendered new value
- [ ] **R19** Concurrent-tab 412 recovery: open the same
  instance editor in two tabs; save a different value in
  tab B; then save in tab A. PASS: tab A surfaces "This
  instance changed underneath you — values refreshed;
  re-apply your edit", re-GETs fresh values + etag, and
  stays in edit so the operator can re-apply.
  Pin: tests/adapters-record-instances.test.ts 'instance
       create → list → patch → 412 → retry → delete →
       history'; tests/presenter-record-instances.test.ts
       'edit form surfaces 412 conflict notice' (decides
       that a supplied notice renders with warning tone
       while staying in edit — the test hardcodes its
       own literal rather than importing
       `INSTANCE_CONFLICT_NOTICE`, so it does not decide
       the exact wording); exploratory — the live
       two-tab race, the re-apply flow, and the notice's
       exact production text
- [ ] **R20** Click Delete on an instance; confirm in the
  house dialog (`data-dialog-open` /
  `confirm-delete-instance`). PASS: instance disappears
  from the list; reopening the address is not available
  (spent id).
  Pin: tests/adapters-record-instances.test.ts 'instance
       create → list → patch → 412 → retry → delete →
       history'; exploratory — the live confirm dialog
       and the list's removal
- [ ] **R21** ACL projection (member vs admin). The New
  instance form's per-attribute access
  (`data-access="writable"` / `"readonly"` / omitted)
  follows each attribute's `read_roles`/`write_roles`,
  with admin bypassing both. Default half (Customer
  Profile, Stark — every attribute keeps the default
  `['member','admin']` ACL): as the demo admin, click New
  instance on Customer Profile — every field renders
  `data-access="writable"`; sign in as Sarah Chen
  (`sarah.chen@company.com`, a Stark member) and open New
  instance — every field still renders
  `data-access="writable"`. Restricted half (Project
  Brief, Wayne — the seed sets Priority to
  `read_roles: ['admin']` / `write_roles: ['admin']` and
  Approved to `write_roles: ['admin']`): as the demo
  admin switched to Wayne Enterprises, click New instance
  on Project Brief — every field, Priority and Approved
  included, renders `data-access="writable"` (admin
  bypass); sign in as Mike Thompson
  (`mike.thompson@company.com`, a Wayne-only member) and
  open New instance on Project Brief — Approved renders
  `data-access="readonly"`, Priority is ABSENT from the
  form, and Project Name / Description stay writable.
  Setting an ACL remains `PUT …/attributes/:id` only — no
  UI reaches it; the seed, not the walk, produced the
  restricted state (TODO.md names the ACL-editing UI).
  Pin: tests/presenter-record-instances.test.ts
       'projectInstanceFields drops unreadable and
       marks write vs read';
       tests/presenter-record-instances.test.ts
       'projectInstanceFields: admin bypasses ACL';
       tests/mock-data-records.test.ts 'Project Brief
       Priority and Approved carry the restricted seed
       ACLs; the rest keep the default' (decides the
       seeded ACL world this case walks);
       tests/adapters-record-attributes.test.ts
       'getRecordAttributesByRecord maps storage rows
       to the camelCase domain shape'; exploratory —
       the live four-way comparison across the two
       record types and the two sign-ins

## J. Teardown

J1–J3 are the master's: `## The walk` step 5 runs
them after K8, once the explorer has returned.

- [ ] **J1** Stop the `./crank` process started
  in A3 via the harness-native task stop (not
  `kill`). PASS: process terminates; the trap
  stopped `./serve`. Sandbox EPERM on `kill`
  is FAIL if the harness stop itself fails;
  do not score BLOCKED.
  Pin: exploratory — the live process actually
       terminating under the harness stop
- [ ] **J2** After J1 PASS, verify crank's temp
  bundle is gone (trap `rm -rf`). PASS:
  directory removed. DEFERRED only if crank
  is still up.
  Pin: exploratory — the temp directory's
       absence on disk after teardown
- [ ] **J3** Verify the ZIP file remains on
  `~/Desktop` for archival. PASS:
  `fusion-angle-${SHA}.zip` exists.
  Pin: exploratory — the ZIP file's presence on disk

## SV. Server (Deno + Postgres)

This is the default origin, not a second ceremony —
A3 **is** SV1, on the same crank process every other
section already walked. B15 / B18 / B19 / B23 pin the
same cookie-session covenants on this process.

Operator prerequisites:

- A3 is crank; the explorer skips SV1 and does not
  re-seed.
- Credentials print once on **stdout**, never HTTP.

Named residual: the backend emits
`pg_notify('fusion_events', …)` inside the write
transaction. There is no LISTEN and no SSE client. A
second browser context looking stale until it
navigates is **PASS**, not FAIL. BroadcastChannel is
origin-scoped and reaches other tabs of the same
cookie jar (see SV8b) but not other browser contexts.
Do not file **SV10** as a regression.

### Browser against the real server

- [ ] **SV1** Satisfied by A3 — do not re-run.
  PASS if A3 passed (listen + stdout seed reveal).
  Pin: tests/pg-seed.test.ts 'mock-data seed
       prints every human sign-in' (the same event
       A3 cites); exploratory — confirming A3
       already passed
- [ ] **SV2** Open `http://localhost:8080/auth/index.html`
  (or follow the unsigned root hop to landing,
  then Sign In). Sign in as `demo@example.com`
  with the stdout password. PASS: the dashboard
  loads from this Deno origin — pages and API are
  one process.
  Pin: tests/browser/sign-in.test.ts 'sign-in
       lands on the dashboard as the seeded
       admin'; exploratory — the one-process
       nature of pages plus API sharing this origin
- [ ] **SV3** After SV2, inspect DevTools. PASS:
  Application → Cookies shows `refresh_token` as
  HttpOnly, `Path=/api/authentication`,
  `SameSite=Strict`, `Secure` (always, including
  `http://localhost` and `http://127.0.0.1`);
  `localStorage` has no `fusion-angle:authorization`
  key and no `refresh_token`; the sign-in token
  response JSON has `access_token` and no
  `refresh_token`. Access is memory-only; refresh
  is the cookie.
  Pin: tests/api-authentication-token.test.ts 'token
       JSON has no refresh_token; Set-Cookie is
       HttpOnly'; exploratory — the `Secure`
       attribute over plain `http://`, and the
       DevTools `localStorage` inspection
- [ ] **SV4** On the signed-in dashboard, reload
  (Cmd-R). PASS: stays authenticated — no bounce
  to `auth`. Boot cookie-refreshes via
  `POST /api/authentication/token`
  (`grant_type=refresh`, `credentials: 'same-origin'`).
  Pin: tests/api-authentication-token.test.ts
       'refresh grant rotates from the Cookie, not
       the body'; exploratory — the live reload
       staying authenticated; `bootAuthGate`'s
       cookie-session branch carries no CLI test
       today

### Two identities, one database, one origin

Both SV6 and SV7 need two identities signed in at
once, not two tabs of one identity — the browser-use
plugin's two browser **contexts** (two cookie jars,
one Chrome) are how the walk now gets that. If the
driver offers no multi-context support, record
BLOCKED naming that reason; an honest BLOCKED costs
nothing.

- [ ] **SV6** Two browser contexts against the one
  crank origin (two cookie jars, one Chrome, one
  Postgres). In context A, sign in as
  `demo@example.com`. In context B, sign in as
  `sarah.chen@company.com` (stdout password; Sarah
  is Stark, same organization as the admin). PASS:
  both dashboards load; the sidebar member chips
  name different people; one Postgres, two
  sessions.
  Pin: tests/browser/two-jars.test.ts 'two contexts
       hold two identities on one origin';
       exploratory — the live two-context sign-in
       and the painted chip names
- [ ] **SV7** Continuing SV6's two contexts: in
  context A, create an idea with a unique title
  (Ideas → Create Idea → required fields → Submit
  Idea). In context B, navigate to `ideas/` (or
  reload if already there). PASS: Sarah's list
  includes A's new idea — two identities, one
  database.
  Pin: tests/browser/two-jars.test.ts 'two contexts
       hold two identities on one origin';
       exploratory — the live UI-driven create, as
       opposed to the pin's direct write

### Two tabs share the refresh cookie

Same origin, same browser context — one cookie jar,
two tabs — is ordinary explorer driving; no BLOCKED
applies here.

- [ ] **SV8** Same signed-in session, two tabs of
  the one browser context (they share its cookie).
  In tab A, stay signed in. Open
  `dashboard/index.html` in a new tab B of that
  context. PASS: tab B stays authenticated with no
  second sign-in — both tabs share the
  `refresh_token` cookie; boot cookie-refreshes.
  Pin: tests/browser/two-jars.test.ts 'two tabs
       share the cookie; sign-out in one bounces
       the other'; exploratory — the live open and
       the painted chip in tab B
- [ ] **SV8b** Two tabs of the one browser context,
  both on `ideas/`. Create an idea in tab A. PASS:
  tab B's list gains the card without a reload
  (BroadcastChannel `fusion-angle:data`).
  Pin: exploratory — the mock seed's ideas list is
       never empty, so this walks
       `onIdeasLoaded`'s populated-list subscription
       (`web-app/ideas/index.ts`'s direct
       `subscribeIdeaChanges` call), not the
       empty-list re-init branch
       tests/ideas-empty-subscribe.test.ts 'an empty
       initial ideas load still subscribes to
       cross-tab changes' decides; neither branch's
       test covers the other
- [ ] **SV9** In tab A, click Sign out. In tab B,
  navigate (sidebar click or reload). PASS: tab B
  lands on `auth` — logout cleared the shared
  cookie (`Set-Cookie` `Max-Age=0`); boot refresh
  cannot mint. (An already-painted tab B may still
  hold a live access token in memory until that
  navigation — that is the access-TTL covenant, not
  a failed cookie clear.)
  Pin: tests/browser/two-jars.test.ts 'two tabs
       share the cookie; sign-out in one bounces
       the other'; exploratory — the live
       in-memory-access-token nuance before
       navigation

### Named residual — stale-until-navigation

This residual is a **cross-jar** fact, not a
cross-tab one: SV8b just proved two tabs of one jar
DO refresh live via BroadcastChannel. Demonstrating
staleness needs two separate identities (two browser
contexts, as SV6/SV7 set up) — one jar's tabs cannot
show it. If the driver offers no multi-context
support, record BLOCKED naming that reason rather
than a case that would read as a FAIL.

- [ ] **SV10** Context B (Sarah Chen, from SV6/SV7)
  is still signed in and already sitting on
  `ideas/` — do not reload it. Context A was signed
  out in SV9; re-sign it as `demo@example.com`
  first (or open two fresh contexts if neither
  survived). In context A, create a distinctly
  titled idea. PASS / named
  residual: B's open list does not gain the new
  card until B navigates or reloads. There is no
  LISTEN and no SSE client; BroadcastChannel
  crosses tabs of one cookie jar (SV8b) but not
  separate browser contexts. A second context
  looking stale until navigation is **not FAIL**.
  After B navigates or reloads, the card from this
  write is present (same pin as SV7).
  Pin: exploratory — the pre-navigation staleness
       and the post-navigation appearance; no CLI
       or browser test decides the staleness
       itself, and this case's two-context setup is
       reused from SV6, not independently pinned
       here

---

## Summary Format

The run produces a single conversational summary in the
following format. This is the contract `## The walk`
references. The doc itself is NOT mutated by the run.

```
# Test Plan Run — <ISO-8601 timestamp, Zulu>

Build SHA: <git rev-parse --short HEAD>  (clean | dirty: N files)

## Automated (AT)
- AT1 tsc: PASS (0 diagnostics)
- AT2 ./test: PASS (N/N, 0 fail, Xs)
- AT3 ./validate: PASS (lint clean)
- AT4 ./test-postgres: PASS (0 fail)
- AT5 ./test-browser: PASS (0 fail)

## Manual Browser Regression
Total: <N> cases — PASS X · FAIL Y · BLOCKED Z · DEFERRED D · DRIFT R

| Section | Cases | Pass | Fail | Blocked | Deferred | Drift |
|---------|------:|-----:|-----:|--------:|---------:|------:|
| AT | 5 | | | | | |
| A | 5 | | | | | |
| AA | 46 | | | | | |
| B | 31 | | | | | |
| C | 7 | | | | | |
| D | 38 | | | | | |
| E | 12 | | | | | |
| F | 80 | | | | | |
| F2 | 31 | | | | | |
| FS | 9 | | | | | |
| G | 38 | | | | | |
| H | 2 | | | | | |
| I | 30 | | | | | |
| K | 29 (skip K8) | | | | | |
| R | 25 | | | | | |
| SV | 9 (A3=SV1) | | | | | |
| K8 | 1 | | | | | |
| J | 3 | | | | | |

## BLOCKED detail
- <case ID>: <the reason outside the product> | (none)

## FAIL detail
(none) | <case ID>: <one-line symptom>

Mitigation specs:
- <path> | (none)

## Drift Candidates
| Case | Symptom | Likely cause |
|------|---------|--------------|
(none) | ... | ...
```

The summary reports counts. FAIL rows become stubs; there
is no arithmetic to satisfy and no run is "fully green".
`BLOCKED` names a driver or environment limit; `DRIFT`
names a document that must change. Neither is a
regression, and neither blocks.

### Mitigation specs

After the walk, one markdown file per FAIL cluster under
`docs/superpowers/test-plan-mitigations/`. Product design
specs stay in `docs/superpowers/specs/`. Do not create the
directory until the first cluster exists. The master lists
paths in the summary. Dated stubs stay frozen. Implementing
those specs is tracked in `TODO.md`.

File name:
`YYYY-MM-DD-{section}-{first-case}.md`

```
# TEST-PLAN mitigation — {section}

- Section: {id}
- Cases: {comma-separated ids}
- Pin: {the case's Pin clause, copied}
- Expected: {from the case PASS line}
- Observed: {explorer note}
- Suspected layer:
  UI | adapter | API | seed | driver | doc
- Reproduced by:
  tests/{file}.test.ts '{test name}' red at {SHA}
  | not reproduced — {driver or environment reason}
  | doc — {the DRIFT correction}
```

**A product commit may cite a stub only when
`Reproduced by` names a red test.** The test sits at the
lowest layer that can express the covenant — a reducer,
presenter, or adapter pin at Layer 1, a CDP test at
Layer 2.

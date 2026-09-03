# TEST-PLAN Zero-FAIL Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Narrow FAIL so the walk can score zero FAILs
honestly — protocol in TEST-PLAN.md, case-text DRIFT, and
Layer 2 characterization pins for AA9 and WB11.

**Architecture:** Document commits first (scoring table,
explorer prompt, compositor driving notes, then the
case-text cluster). Then two Layer 2 characterization
tests. Green closes the walk FAIL and adds a driving
note. Red is a product bug: fix red→green in that task
before any recode that would hide it. Dated 2026-09-02
stubs stay frozen. The operator's next walk is the later
closing checkpoint, not a criterion of these commits.

**Tech Stack:** Deno 2.9.6, TypeScript strict,
`@std/assert`, CDP via `tests/browser/fixtures.ts`.
Layer 1 `./validate`. Layer 2 `./test-browser` (Chrome).

**Sources:** spec
`docs/superpowers/specs/2026-09-02-test-plan-zero-fails-design.md`
(commit `75c8ddf1`). Second 09-02 walk on build
`e4753f4`. Does not reopen
`2026-09-02-test-plan-remediation.md`.

---

## File structure

| File | Role |
|---|---|
| `TEST-PLAN.md` | scoring, prompt, driving notes, case text |
| `tests/browser/member-strengths.test.ts` | AA9 Layer 2 pin |
| `tests/browser/workbox-transition.test.ts` | WB11 Layer 2 pin |
| `TODO.md` | close the maybe-product leftovers |
| `docs/superpowers/specs/2026-09-02-test-plan-zero-fails-design.md` | spec (already committed) |
| `docs/superpowers/plans/2026-09-02-test-plan-zero-fails.md` | this plan |

Never edit `docs/superpowers/test-plan-mitigations/2026-09-02-*.md`.
Never edit `FLOW-CANVAS.md` or `AGENTS.md`.

---

## Global constraints

- Work in `.worktrees/2026-09-02-test-plan-zero-fails`
  on branch `2026-09-02-test-plan-zero-fails`. Never
  commit on master. Never `-D`. Never force-push.
- One concern per commit. Subject ≈50 chars,
  present-tense imperative. Trailer exactly:
  `Co-Authored-By: Grok 4.6 <noreply@x.ai>`
- Product changes land ONLY behind a red test at
  Layer 1 (`./validate`) or Layer 2 (`./test-browser`).
  AA9 and WB11 are the only tasks that may write
  product. The other fifteen FAILs are document or
  driver.
- `./validate` green before every TypeScript commit.
  Markdown-only commits skip it.
- Voice: 78-char max in linted files (`.md` exempt),
  4-space indent, no inline styles, no `org` identifier.
- Characterization pins of existing behavior that are
  already green are not a TDD violation. Watch the new
  test: green → driving note, no product. Red → product
  bug; fix red→green in that task, then the note.
- Layer 2: `./test-browser` (bundles client, needs
  Chrome). Do not add a runner. The script always runs
  `tests/browser/*.test.ts`.
- Commandments: Reliability, Uniformity, Clarity.
  Abominations to refuse: Unbidden Helper Code, Test
  Weakening, Premature Generalization, Internal Defense
  in the new tests.
- Patterns: `withAdminPage` + `registryUrl` + compositor
  `page.click`; `assert`/`assertEquals` from
  `@std/assert`; no `js()` of the API.

---

### Task 1: Commit this plan

**Files:**
- Create: `docs/superpowers/plans/2026-09-02-test-plan-zero-fails.md`

- [ ] **Step 1: Commit the plan as written**

```bash
git add docs/superpowers/plans/2026-09-02-test-plan-zero-fails.md
git commit -m "Plan TEST-PLAN scoring for zero FAILs"
```

No `./validate` needed: markdown only.

---

### Task 2: Protocol — scoring, prompt, driving notes

**Files:**
- Modify: `TEST-PLAN.md` explorer prompt (~118),
  Driving notes (~124–179), Scoring (~181–193)

Doc only. No case-text edits. This commit is the
protocol change.

- [ ] **Step 1: Replace the FAIL and BLOCKED rows**

In `### Scoring` (~181–189), replace the table with:

```
| Outcome | Meaning |
|---|---|
| PASS | the PASS line was observed |
| FAIL | the step was driven and the product disagreed with the PASS line, and no green Layer 1/2 pin already decides that observation — a finding, not a verdict |
| BLOCKED | a step could not be performed (driver or environment), or the compositor did not deliver the gesture a green pin already decides; the reason is the note |
| DEFERRED | a prerequisite case did not produce what this case needs |
| DRIFT | passes in substance; the document or the UI text disagrees — the document changes |
```

Keep the paragraph that begins "Nothing blocks on any
outcome" (~195–199). After the table and before
"Walk-specific:", insert:

```
A case whose `Pin:` names a Layer 1 or Layer 2 test
for the unobserved half scores BLOCKED or DEFERRED,
never FAIL. FAIL is only for an *exploratory* half
the explorer actually drove, or for a pin that is
itself red. The walk still gates nothing; this rule
exists so FAIL can reach zero without lying.
```

Replace the Walk-specific paragraph (~191–193) with:

```
Walk-specific: F23 scores BLOCKED like AA32 when
Shift is missing on pointer-up. AA33/AA34 score
DEFERRED on AA32 when stray nodes block targeting.
F12's double-click miss after a pan-drag, F17
off-canvas body-drag, F37b port-drag (hidden tab
or otherwise), D36/D37/K6 list-drag, K13–K15
slider-drag: BLOCKED when the gesture was not
delivered. Layer 1/2 pins decide the math.
F70 without an Industry row: DEFERRED on F69.
K14/K15 when K13 did not dirty a slider: DEFERRED
on K13.
R21 Wayne halves not driven: BLOCKED naming
throttle or time, not FAIL. The Stark default-ACL
half may still PASS.
R16 leftover `Walk Co B`: PASS (the instance is
present). Missing Instances section: FAIL of the
exploratory half (no Layer 1 pin renders the live
Customer Profile list).
```

- [ ] **Step 2: Insert the explorer-prompt sentence**

In `### The explorer prompt`, after the line
`Do not patch. Do not re-seed. Do not retry the plan.`
(~118) and before `Return one line per case:`, insert
this paragraph inside the verbatim fence:

```
Score from ### Scoring. FAIL only when you drove the
step and the product disagreed, and the disagree is
not already decided by a green Pin. A missed
compositor gesture, a hidden tab, a missing
prerequisite, or a green pin for the unobserved half
is BLOCKED or DEFERRED — never FAIL. DRIFT when the
product matches a pin and the document is wrong.
```

- [ ] **Step 3: Add compositor and leftover driving notes**

Keep every existing Driving notes bullet (Shift, F37b,
B21, WB16, first-click-after-reload, canvas svg,
dblclick, F29, …). After the F29 bullet (~177–179),
append:

```
- Compositor gestures (double-click as two
  pointerdowns on one element id inside
  `DBLCLICK_MS`, body-drag, port-drag, `.drag-handle`
  pointer capture, `input[type=range]` drag): if the
  driver does not deliver the gesture, record BLOCKED
  naming that. Do not FAIL. Layer 1 and Layer 2 pins
  decide the covenant. E11 (projects list-drag)
  PASSed on the second 09-02 walk — the driver *can*
  drag lists; a miss on D36 or K6 is still BLOCKED
  this walk, not a missing product.
- F12: after the pan-mode node drag, Space toggles
  pan off (Layer 2 pin). The double-click half
  retargets the same node id; landing on Archive or
  missing `#prop-node-name` is BLOCKED targeting, not
  FAIL. Create/Archive panels have no
  `#prop-node-name`.
- F17: F12/F14 leave Auto Fit off and the camera
  elsewhere. Create is min-x. If Create's
  `transform` is outside the viewBox, Auto Fit on or
  pan until it is inside, then drag. Dragging an
  off-canvas node is BLOCKED, not FAIL.
- F57a: Enter opens the focused node's panel; Space
  toggles pan. Do not score F57a FAIL for Space
  toggling pan — that is F12's covenant.
- D32a: assert `.idea-actions-slot` only. Buttons
  inside a closed `dialog` (including
  `data-idea-action="send-back-confirm"`) are not the
  header.
- K13: drag `.baseline-slider` *inside* the
  `.project-objective-row` whose name cell is the
  objective. Do not query a bare
  `input[type=range]` — at 1280×800 the rows are a
  140/110/1fr grid; identical y means the same
  element was hit twice.
- F70: if the Industry row is not in the open
  panel, DEFERRED on F69.
- R14: bind `#gate0001` to any existing Customer
  Profile instance in the picker (never mint). The
  label may read `Walk Co B` after WB19a. R13's
  open claimed the WO; bind while claimed by the
  current member is expected.
- R16: PASS if the Instances section lists at least
  one instance with id + readable values. `Acme Corp`
  and `Walk Co B` are both this walk's instance.
- R21: four identity/org halves. Auth is 5 per 60 s.
  If Wayne halves are not driven, BLOCKED, not FAIL.
```

Do not add AA9 or WB11 notes yet — those wait on the
Layer 2 pins (Tasks 4 and 5).

- [ ] **Step 4: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Narrow FAIL to driven product disagreement"
```

---

### Task 3: Case-text cluster

**Files:**
- Modify: `TEST-PLAN.md` D32a (~2046), F17 (~2592),
  F57a (~3509), F70 (~3695), WB19a (~4174), K13
  (~6060), R14 (~6510), R16 (~6557), R21 (~6624)

Doc only. One scoring-and-text concern.

- [ ] **Step 1: Rewrite F57a to Enter-opens**

Replace the F57a case (~3509–3518) with:

```
- [ ] **F57a** Tab to a regular node (not Create or
  Archive — those panels have no `#prop-node-name`).
  Tap Enter. PASS: the node's panel opens
  (`#prop-node-name` exists); pan mode stays off.
  Space on a focused node toggles pan and does not
  open the panel — that is F12, not this case.
  Pin: tests/browser/canvas-keyboard.test.ts
       'Tab from the canvas enters the ring and
       marks the node' (drives Tab then Enter and
       waits for `#prop-node-name`);
       tests/flow-fsm-reduce.test.ts
       'canvas-key-activate on a node single-selects
       it, opens the panel, and requests an update'
       (decides Enter's activation path);
       tests/browser/canvas-pan.test.ts
       'Space on a focused node toggles pan off
       and does not open the panel (F12)'
```

- [ ] **Step 2: Name D32a's slot**

Replace the D32a case (~2046–2051) with:

```
- [ ] **D32a** On an in_review idea, click "Edit".
  PASS: `.idea-actions-slot` contains only Cancel /
  Save — no Send Back, Approve, Submit, or Convert
  *in that slot*. Buttons inside a closed
  `<dialog>` in `.idea-dialogs-slot` (including
  `data-idea-action="send-back-confirm"`) are the
  confirm dialog, not the header. Click Cancel: the
  read header (Send Back / Approve / Edit in
  `.idea-actions-slot`) returns.
  Pin: exploratory — no CLI test renders
       `.idea-actions-slot`; `IdeaEditPresenter`'s
       action buttons are unconditionally Cancel/Save,
       and no test composes the read-header's button
       set for `in_review` specifically
```

- [ ] **Step 3: F17 off-canvas, F70 DEFERRED, K13 row**

Replace F17's opening (~2592–2598) so the first
sentences read:

```
- [ ] **F17** Drag the start node by its body. If
  Create is off-canvas, Auto Fit on or pan until its
  `transform` is inside the viewBox, then drag.
  Off-canvas drag is BLOCKED. PASS: it
  moves freely like any standard node — start and complete
  nodes are both draggable. With Auto Layout on the drop
  re-lays out: Create returns to the head of the first
  column and Archive to the foot of the last. Layout Test's
  Create is already wired, so it shows no port (F10); the
  start-port drag is AA27's case, not this one.
```

Keep F17's existing Pin block (~2599–2606).

Replace F70's opening (~3695–3698) so it reads:

```
- [ ] **F70** Continuing from F69, click the remove ("×")
  control on the "Industry" attribute row. If the
  Industry row is absent, DEFERRED on F69. PASS: the row
  disappears from the attributes list, leaving Review as
  the seed had it.
```

Keep F70's existing Pin block (~3699–3707).

Replace K13's opening (~6060–6067) so it reads:

```
- [ ] **K13** Drag the "Increase incomes" and "Raise
  customer NPS" sliders to non-zero values — send "Raise
  customer NPS" to the far left (−100); Save. Drive
  each slider as `.project-objective-row` (name cell
  matches) → `.baseline-slider`. A bare
  `input[type=range]` selector is the first row twice.
  PASS if the
  shared `Save` button enables (dirty-tracked), the rows
  show the saved baselines including the signed −100, and
  Approve is **still** disabled because at least "Improve
  employee morale" (and Test Objective, if K2/K5 left it
  active) remains unscored.
```

Keep K13's existing Pin block (~6068–6085).

- [ ] **Step 4: R14, R16, WB19a, R21**

Replace R14 (~6510–6524) with:

```
- [ ] **R14** Bind `#gate0001` to an existing Customer
  Profile instance in the picker (label may be Acme Corp
  or Walk Co B after WB19a) — never mint a new one —
  then fill Company Name + Contact Email and
  click submit. PASS: transition succeeds; work order
  advances to Review (does NOT demand Reviewer Notes —
  that is current-node only when leaving Review). A
  value-bearing transition while still unbound is
  refused with 400 (`ValidationError` →
  `HTTP_BAD_REQUEST`), not 409; 409 is rebind. R13's
  open claimed the WO; bind while claimed by the
  current member is expected.
  Pin: tests/adapters-record-transitions.test.ts
       'validateRecordTransition does not require
       TARGET-node attributes when the current node is
       clean'; exploratory — the live fill, submit, and
       bind-picker interactions
```

Replace R16's PASS/hygiene sentences (~6557–6566) with:

```
- [ ] **R16** Open Customer Profile detail. PASS: an
  Instances section lists at least one
  instance (id + readable values) and a "New instance"
  control. The genesis Company Name is "Acme Corp";
  WB19a may have renamed it to "Walk Co B". Either
  name is this walk's instance, not a missing seed.
  The empty "No instances yet" state is a
  real UI branch the CLI pin below decides; Customer
  Profile is never empty on this seed, so the
  explorer will not see it live.
```

Keep R16's existing Pin block (~6567–6572).

In WB19a (~4174–4191), delete the restore instruction.
The PASS line still ends at "does **not** auto-retry
the transition." Remove these six lines:

```
  After PASS, restore the mutated instance's
  Company Name to "Acme Corp" (and any other
  field this case changed). WB19a overwrites
  the only seeded Customer Profile instance;
  R14's bind picker and R16's instance list
  read that value.
```

Keep WB19a's Pin block. WB19a now ends at the 412
recovery PASS line, then Pin.

In R21, after the Mike Thompson / Project Brief
sentence (~6644–6646) and before "Setting an ACL
remains" (~6647), insert:

```
  If the Wayne halves are not driven, BLOCKED
  naming throttle or time. Do not FAIL a half
  that was not opened.
```

- [ ] **Step 5: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Align walk cases to zero-FAIL scoring"
```

---

### Task 4: AA9 Layer 2 characterization

**Files:**
- Create: `tests/browser/member-strengths.test.ts`
- Modify: `TEST-PLAN.md` AA9 Pin (~477–485) and
  Driving notes (append)
- Product only if the new test is red:
  `web-app/members/detail.ts`,
  `web-app/app/presenters/human-member-detail.ts`

The API pin `'a strengths PUT replaces the list — the
toggled-on id persists'` never clicks `.strength-chip`.
This test does. Seeded admin
`XXZruirZyAOoRpNxaDnpSA` (demo@example.com) carries
Strategic Planning, Data Analysis, Stakeholder
Management. `onClick` toggles `state.draft.strengths`
and `rerender()`s; `humanMemberPatchFromDraft` includes
`strengths`. Save toasts "Member saved" and returns to
read mode (`#member-strengths .pill-tag-strength`, no
`.strength-chip`).

Do not write product code against the stub. The stub
says `not reproduced`.

- [ ] **Step 1: Write the characterization test**

Create `tests/browser/member-strengths.test.ts`:

```typescript
import { assertEquals } from '@std/assert';
import {
    useBrowser, withAdminPage, type Page,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const ADMIN_MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';
const STRENGTHS =
    '#member-strengths .pill-tag-strength';
const NAMES = `[...document.querySelectorAll('${
    STRENGTHS
}')].map(el => (el.textContent ?? '')`
    + `.replace(/\\s+/g, ' ').trim())`;
const EXPECTED = [
    'Strategic Planning',
    'Stakeholder Management',
    'Agile Methods',
];

async function openAdminDetail(
    page: Page, baseUrl: string,
): Promise<void> {
    await page.navigate(registryUrl(
        baseUrl,
        'member-detail',
        `memberId=${ADMIN_MEMBER_ID}`,
    ));
    await page.ready('member-detail');
    await page.waitFor('#member-edit-btn');
}

Deno.test(
    'chip toggles persist on save and reload (AA9)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openAdminDetail(
                    page, origin.baseUrl,
                );
                await page.click('#member-edit-btn');
                await page.waitFor(
                    '[data-strength="Data Analysis"]',
                );
                await page.click(
                    '[data-strength="Data Analysis"]',
                );
                await page.until(
                    `!document.querySelector(`
                    + `'[data-strength="Data Analysis"]')`
                    + `.classList.contains('btn-primary')`,
                    'Data Analysis off',
                );
                await page.click(
                    '[data-strength="Agile Methods"]',
                );
                await page.until(
                    `document.querySelector(`
                    + `'[data-strength="Agile Methods"]')`
                    + `.classList.contains('btn-primary')`,
                    'Agile Methods on',
                );
                await page.click('#member-save-btn');
                await page.until(
                    `[...document.querySelectorAll(`
                    + `'.toast')].some(t => t.textContent`
                    + `.includes('Member saved'))`,
                    'Member saved toast',
                );
                await page.until(
                    `document.querySelector(`
                    + `'.strength-chip') === null`,
                    'read mode',
                );
                assertEquals(
                    await page.evaluate<string[]>(
                        NAMES,
                    ),
                    EXPECTED,
                );
                await openAdminDetail(
                    page, origin.baseUrl,
                );
                assertEquals(
                    await page.evaluate<string[]>(
                        NAMES,
                    ),
                    EXPECTED,
                );
            },
        );
    },
);
```

- [ ] **Step 2: Run Layer 2 and watch the named test**

```bash
./test-browser
```

Expected: the file is picked up (`tests/browser/*.test.ts`).
Find `chip toggles persist on save and reload (AA9)` in
the report.

- If it **PASSES**: the walk FAIL was a chip-click miss.
  Go to Step 3 (no product).
- If it **FAILS**: it is a product bug. Fix
  `web-app/members/detail.ts` /
  `web-app/app/presenters/human-member-detail.ts`
  red→green (do not weaken the test). Re-run
  `./test-browser` until the named test PASSES, then
  `./validate`. Commit the product fix as its own
  commit (`Fix AA9 strength-chip save`) before Step 3.

- [ ] **Step 3: Driving note and Pin, then commit**

Append to Driving notes:

```
- AA9: click `.strength-chip` buttons with
  `data-strength`. Layer 2 pin
  tests/browser/member-strengths.test.ts
  'chip toggles persist on save and reload (AA9)'
  decides the save. If the chips do not toggle,
  record BLOCKED naming that. Do not FAIL.
```

Replace AA9's Pin (~477–485) with:

```
  Pin: tests/api-human-members.test.ts 'a strengths PUT
       replaces the list — the toggled-on id persists'
       (decides that toggling Data Analysis off and
       Agile Methods on in one save leaves exactly
       [Strategic Planning, Stakeholder Management,
       Agile Methods] on the next GET);
       tests/browser/member-strengths.test.ts
       'chip toggles persist on save and reload (AA9)'
       (decides Edit → toggle Data Analysis off and
       Agile Methods on → Save → reload leaves
       Strategic Planning, Stakeholder Management,
       Agile Methods);
       exploratory — the Phone/Bio edit (a separate
       `PUT identities/:id/pii` this test never calls)
```

```bash
./validate
git add tests/browser/member-strengths.test.ts TEST-PLAN.md
git commit -m "Pin AA9 strength-chip save in CDP"
```

If Step 2 produced a product commit, this commit is
still the pin + note only.

---

### Task 5: WB11 Layer 2 characterization

**Files:**
- Create: `tests/browser/workbox-transition.test.ts`
- Modify: `TEST-PLAN.md` WB11 Pin (~4070–4074) and
  Driving notes (append)
- Product only if the new test is red:
  `web-app/workbox/detail.ts`

On success `web-app/workbox/detail.ts` toasts
"Transition complete" (`persistPending` + `paintToast`)
and `navigateTo('workbox')`. The inbox page replays the
pending toast. Staying on `workbox/detail.html` means
submit did not succeed or navigation did not run. The
API pin checks 201, not the inbox.

Create a fresh Customer Onboarding WO (READY row
`data-flow-id="esKujtyQFYUJaVSXWwavzA"`) so the action
screen is unbound Data Capture. Bind the first
`[data-instance-pick]`, set Company Name
(`#wo-attr-CPJmMPXRaBIiNdGBofUPVg`) and Contact Email
(`#wo-attr-oeqelDVElwxHYWkWRVTCYw`), click submit
(`data-edge-id="JZJrLAteZStrqAvzZiamtA"`).

Do not write product code against the stub.

- [ ] **Step 1: Write the characterization test**

Create `tests/browser/workbox-transition.test.ts`:

```typescript
import { assert } from '@std/assert';
import {
    useBrowser, withAdminPage, type Page,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const ONBOARDING_FLOW_ID =
    'esKujtyQFYUJaVSXWwavzA';
const SUBMIT_EDGE_ID =
    'JZJrLAteZStrqAvzZiamtA';
const COMPANY_NAME_ID =
    'CPJmMPXRaBIiNdGBofUPVg';
const CONTACT_EMAIL_ID =
    'oeqelDVElwxHYWkWRVTCYw';

async function createOnboardingWorkOrder(
    page: Page, baseUrl: string,
): Promise<void> {
    await page.navigate(
        registryUrl(baseUrl, 'workbox'),
    );
    await page.ready('workbox');
    await page.click('#create-work-order-btn');
    const readyItem =
        `[data-flow-id="${ONBOARDING_FLOW_ID}"]`;
    await page.until(
        `document.querySelector(${
            JSON.stringify(readyItem)
        })?.checkVisibility() === true`,
        'READY Customer Onboarding',
    );
    await page.click(readyItem);
    await page.until(
        `location.pathname.endsWith(`
        + `'/workbox/detail.html')`,
        'action screen',
    );
    await page.ready('workbox-detail');
}

async function bindFirstInstance(
    page: Page,
): Promise<void> {
    await page.click(
        '[data-dialog-open="bind-instance"]',
    );
    await page.waitFor(
        '#bind-instance-dialog[open]',
    );
    await page.waitFor('[data-instance-pick]');
    await page.click('[data-instance-pick]');
    await page.until(
        `document.querySelector(`
        + `'[data-binding="bound"]') !== null`,
        'bound badge',
    );
}

async function fillRequired(
    page: Page,
): Promise<void> {
    const company =
        `#wo-attr-${COMPANY_NAME_ID}`;
    const email =
        `#wo-attr-${CONTACT_EMAIL_ID}`;
    await page.until(
        `document.querySelector(${
            JSON.stringify(company)
        })?.disabled === false`,
        'Company Name enabled',
    );
    await page.evaluate(
        `document.querySelector(${
            JSON.stringify(company)
        }).value = 'Acme Corp';`
        + `document.querySelector(${
            JSON.stringify(email)
        }).value = 'ops@acme.example';`,
    );
}

Deno.test(
    'bind, fill, and submit navigates to the inbox'
    + ' (WB11)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await createOnboardingWorkOrder(
                    page, origin.baseUrl,
                );
                await bindFirstInstance(page);
                await fillRequired(page);
                await page.click(
                    `[data-edge-id="${SUBMIT_EDGE_ID}"]`,
                );
                await page.until(
                    `location.pathname.endsWith(`
                    + `'/workbox/index.html')`,
                    'inbox',
                );
                await page.ready('workbox');
                assert(
                    await page.until<boolean>(
                        `[...document.querySelectorAll(`
                        + `'.toast')].some(t =>`
                        + ` t.textContent.includes(`
                        + `'Transition complete'))`,
                        'Transition complete toast',
                    ),
                );
            },
        );
    },
);
```

- [ ] **Step 2: Run Layer 2 and watch the named test**

```bash
./test-browser
```

Find `bind, fill, and submit navigates to the inbox
(WB11)` in the report.

- If it **PASSES**: the walk FAIL was a bind/fill/submit
  miss. Go to Step 3 (no product).
- If it **FAILS**: it is a product bug. Fix
  `web-app/workbox/detail.ts` red→green (do not weaken
  the test). Re-run `./test-browser` until the named
  test PASSES, then `./validate`. Commit the product
  fix as its own commit
  (`Fix WB11 inbox navigation after submit`) before
  Step 3.

- [ ] **Step 3: Driving note and Pin, then commit**

Append to Driving notes:

```
- WB11: create or open an unbound Data Capture WO,
  bind, fill, submit. Layer 2 pin
  tests/browser/workbox-transition.test.ts
  'bind, fill, and submit navigates to the inbox
  (WB11)' decides the inbox navigation. If bind
  cannot be driven, record BLOCKED. Do not FAIL.
```

Replace WB11's Pin (~4070–4074) with:

```
  Pin: tests/api-work-order-transition-instance.test.ts
       'value-bearing fresh If-Match → 204; head advances'
       (its own assertion checks `res.status === 201`,
       despite the test's stale name);
       tests/browser/workbox-transition.test.ts
       'bind, fill, and submit navigates to the inbox
       (WB11)' (decides bind → fill Company Name and
       Contact Email → submit lands on
       `/workbox/index.html` with the Transition
       complete toast);
       exploratory — the live keystroke fill
```

```bash
./validate
git add tests/browser/workbox-transition.test.ts TEST-PLAN.md
git commit -m "Pin WB11 inbox navigation in CDP"
```

---

### Task 6: TODO.md triage

**Files:**
- Modify: `TODO.md` Later work (~183)

Doc only. Do not append a novel. Do not drop the
first-walk compositor leftovers (F23/AA32, AA33/AA34,
F37b, R12, F26/F28/F14) — those already name green
pins. Do not drop the ideas-list Layer 2 leftover
(D36/D37/K6 at ~588); the spec leaves that optional.

- [ ] **Step 1: Add the AA9/WB11 close bullet**

Insert after the F26/F28/F14 bullet (~209–212) and
before "Toast pause on hover and focus":

```
- 2026-09-02 second walk AA9/WB11: Layer 2
  characterization pins close the only maybe-product
  FAILs. Green pins (or a product fix behind a red
  one) decide them; compositor leftovers stay
  BLOCKED — TEST-PLAN.md Driving notes;
  tests/browser/member-strengths.test.ts
  'chip toggles persist on save and reload (AA9)';
  tests/browser/workbox-transition.test.ts
  'bind, fill, and submit navigates to the inbox
  (WB11)'
```

If Task 4 or 5 landed a product fix, the bullet still
holds: the pin (or the fix behind it) closed the FAIL.

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "Close the second-walk maybe-product FAILs"
```

---

## Closing checkpoint (not this plan)

The operator runs one walk after these commits land
and `./test-all` is green. FAIL = 0 is the success
criterion of *that* walk. BLOCKED, DEFERRED, and
DRIFT may be non-zero. Do not run the walk as a
task here.

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| FAIL ≠ unobserved PASS; pin rule | 2 |
| Explorer prompt insert | 2 |
| Compositor generalization + leftovers | 2 |
| Walk-specific F12/F17/F37b/D36/K13/F70/R21/R16 | 2 |
| F57a Enter-opens | 3 |
| D32a `.idea-actions-slot` | 3 |
| F17 off-canvas BLOCKED | 3 |
| F70 DEFERRED on F69 | 3 |
| K13 row-scoped slider | 3 |
| R14 any existing instance; claimed expected | 3 |
| R16 accepts Walk Co B | 3 |
| WB19a does not restore | 3 |
| R21 Wayne undriven BLOCKED | 3 |
| AA9 Layer 2 pin (product only if red) | 4 |
| WB11 Layer 2 pin (product only if red) | 5 |
| TODO.md close bullet | 6 |
| Dated stubs byte-identical | global |
| FLOW-CANVAS.md / AGENTS.md unchanged | global |
| No second seed instance | 3 (R14/R16/WB19a) |
| Next walk is later, not these commits | closing |

## Self-review

- No TBD/TODO/placeholder steps. Every replacement is
  the text to write. Both Layer 2 files are complete.
- Types and names: `memberId` (not `id`) on
  member-detail; workbox-detail uses `id`; toast
  replay via `persistPending` / `replayPendingToast`.
- AA9/WB11 driving notes are not in Task 2 — they
  wait on the pins, as the spec's commit sequence
  requires.
- Task 4 and Task 5 each name the red-path product
  commit so a green pin cannot hide a real bug.

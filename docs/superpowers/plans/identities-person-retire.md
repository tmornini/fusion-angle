# Identities person-retire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** The identities page's add dialog offers only a
service create, `postIdentityCreation` narrows to
services, and the docs name "organization admin" and
"operator", with no server change.

**Architecture:** One concern per commit, in the spec's
§6 order. A Layer 2 browser case goes red first
(Task 2), and the page change turns it green (Task 3).
The roster and creation tests drop their dependence on
the person branch (Tasks 4 and 5) before the client
type narrows (Task 6), because a `kind: 'person'` call
fails `deno check` once it does. Tasks 7 to 11 are
vocabulary and record. Task 12 runs the spec's §7
oracle.

**Tech Stack:** Deno 2.9.6, TypeScript under
`deno.json` (`strict`, `noUnusedLocals`,
`noUnusedParameters`, `noUncheckedIndexedAccess`),
`@std/assert`, Chrome over CDP for `tests/browser/`.

**Spec:**
`docs/superpowers/specs/identities-person-retire-design.md`
(committed at `9a9355f1`). Executors read the spec and
this plan. Do not reopen the spec's eight decisions.

## Execution ground

- Worktree:
  `/Users/tmornini/code/fusion-angle/.worktrees/identities-person-retire`,
  branch `identities-person-retire`, based on
  `next-release` at `d4ef5913`. Every command below
  runs from this directory.
- Spec commit 1 ("Add the spec") has landed as
  `9a9355f1`. This plan rides its own commit after it.
  Tasks are numbered 2 to 11 to match spec §6 commits 2
  to 11. Task 12 is the oracle and commits nothing.
- The owner lands the branch. No task, implementer,
  reviewer, or controller rebases, merges, lands,
  pushes, or force-pushes. Nobody commits on
  `next-release` or `master`. Nobody creates a
  worktree. No Agent dispatch passes `isolation`.
- Never run `./deploy`, `./bin/build`, `./bin/measure`,
  `./bin/postgres-seed`, or `./bin/postgres-wipe`.
- Before any `deno` or `./test`:
  `export DENO_DIR="$TMPDIR/deno-dir"`. A fresh
  `DENO_DIR` downloads from `jsr.io` and npm on first
  use; under the Claude Code sandbox, declare those
  hosts (`jsr.io`, `registry.npmjs.org`,
  `*.npmjs.org`) on the Bash call. If a download is
  refused, report the refusal. Do not work around it.
- `./test browser` needs Chrome (default
  `/Applications/Google Chrome.app`, or `CHROME` /
  `CHROME_DEBUG_URL`). If it cannot run, report
  BLOCKED with its output. Never skip it, and never
  call a Layer 2 step done without it.
- Layer 1 is `./test validate`. Run it on the dirty
  tree before `git commit`: on a clean HEAD it may
  SHA-skip, and that skip proves nothing about the
  edit.

## Global Constraints

- Every commit is green at Layer 1 (`./test validate`).
- Only Task 2's commit is red, and only at Layer 2,
  and only in its new case.
- The branch tip is green at Layer 2
  (`./test validate browser`) before hand-off.
- The server does not change. The only edit under
  `api/` is the comment at `api/routes.ts:3524`
  (Task 9). Nothing under `server/` or `shared/`
  changes.
- Commit subject: about 50 characters, present-tense
  imperative, exactly as the task names it. Its only
  body is the trailer
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Lines are 78 characters at most in every file
  `./test lint` lints (code and scripts, not `.md`).
  Indent is 4 spaces. No inline styles.
- Rewritten tests keep every assertion. A test is
  deleted only where the spec says its covenant went
  with the code (Task 5, two named tests).
- "grant" is a verb. In prose, a person is an
  "organization admin" or the "operator", never a bare
  "admin". The role string `admin` and the membership
  type `'admin'` stay.
- The dialog keeps the label "Add Identity" and every
  `add-identity-*` id (spec decision 6).
- `postIdentityCreation` keeps its name and its three
  parameters (spec decision 5).

## Review Focus

These five input classes or failure modes are the most
likely to bite a person, and no task's tests exercise
them. The spec fixes the test set (§4), so the plan adds
no test for them: adding one would be Unbidden Helper
Code against an approved spec. Each line is instead a
check for the reviewer of the task that owns the code
(Task 3 unless noted).

1. **Whitespace-only secret.** A secret of spaces must
   toast "A client secret is required" and keep the
   dialog open. The `.trim()` before the `=== ''` check
   must survive the merge into
   `handleAddIdentitySubmit`.
2. **Retry after a landed create.** A second Create in
   the same dialog session must reuse the minted id, so
   the server answers 409 and no second identity
   appears. `pendingIdentityId` must still reset only
   on the `#add-identity-btn` click.
3. **Enter in `#svc-secret`.** Enter must submit, since
   `onDialogKeydown` matches `input.input` and
   `#svc-secret` is the only such input left.
4. **Toast and close order on success.** "Service
   identity added", then the dialog closes, then
   `refresh` runs. A failure must report through
   `reportFault` with "Failed to add identity" and keep
   the dialog open. No swallowed error.
5. **The created service not in the roster** (Task 10
   owns the record). `GET identities/` omits services
   until G47's line. G44 must say so, so that a walker
   does not file it as a new bug.

---

## Dispatch and review protocol

The controller follows
superpowers:subagent-driven-development. Per task, it
dispatches the implementer named in the task, using the
task's own **Dispatch prompt**, and pastes the task's
full section below that prompt. Then one reviewer reads
the commit: a `planner` for every task. It uses the
**Review prompt** below with the task number filled in.
A failed review returns to a fresh implementer of the
same type, with the reviewer's findings. The fix is
amended into the task's commit
(`git commit --amend --no-edit`) while that commit is
still the branch tip, and Layer 1 is rerun.

After Task 11, and before Task 12, an `architect`
reviews the whole branch with the **Branch review
prompt** below. A fix it requires lands as its own
one-concern commit with its own Layer 1 run, then the
architect re-reviews that commit.

### Review prompt (planner, after each task)

```
Go to Medium Church!

Review Task <N> of
docs/superpowers/plans/identities-person-retire.md,
committed as HEAD in the worktree
/Users/tmornini/code/fusion-angle/.worktrees/identities-person-retire
(branch identities-person-retire). Work only in that
worktree. Create no worktree, pass no isolation, and
never rebase, merge, push, force-push, or commit. Never
run ./deploy, ./bin/build, ./bin/measure, seed, or
wipe. Before any deno or ./test, run
export DENO_DIR="$TMPDIR/deno-dir".

Read the spec,
docs/superpowers/specs/identities-person-retire-design.md,
then the plan's Global Constraints, Review Focus, and
Task <N>. Run `git show HEAD`. Judge it on three
counts:
1. Spec compliance. The diff does exactly what Task <N>
   names, nothing more and nothing less. The subject
   line matches the task character for character, and
   the only body is the Co-Authored-By trailer.
2. Doctrine. Name every violation of the commandments
   and abominations that Task <N> lists.
3. Proof. Rerun the task's proving command and report
   its summary line. For a test task, confirm every
   assertion the task says it keeps is still present.

Codebase brief: 78-char max lines in files ./test lint
lints (code and scripts, not .md); 4-space indent; no
inline styles (CSS custom properties + classes per
DESIGN-SYSTEM.md); present-tense imperative commit
subjects with the Co-Authored-By trailer; RequestContext
is the first argument to client verbs; validators at
the gate, not downstream; snake_case storage, camelCase
domain; HTTP-verb adapter naming
(getNoun/putNoun/deleteNoun/postNounOperation); no
untyped any from external boundaries; "grant" is a
verb; prose names a person "organization admin" or
"operator", never bare "admin".

Report APPROVED, or a numbered list of findings, each
with file:line and the fix.
```

### Branch review prompt (architect, after Task 11)

```
Go to Medium Church!

Review the whole branch identities-person-retire in the
worktree
/Users/tmornini/code/fusion-angle/.worktrees/identities-person-retire:
`git log --oneline d4ef5913..HEAD` and
`git diff d4ef5913..HEAD`. Work only in that worktree.
Create no worktree, pass no isolation, and never
rebase, merge, push, force-push, or commit. Never run
./deploy, ./bin/build, ./bin/measure, seed, or wipe.
Before any deno or ./test, run
export DENO_DIR="$TMPDIR/deno-dir".

Read
docs/superpowers/specs/identities-person-retire-design.md
and docs/superpowers/plans/identities-person-retire.md
in full. Judge the following:
- Every spec section (§1 to §5) is implemented, in §6
  order, one concern per commit.
- The server's covenant is untouched:
  `git diff d4ef5913 -- api server shared` shows only
  the comment at api/routes.ts:3524.
- No deleted test outside the two that spec §4 names.
  No rewritten test lost an assertion: compare
  `git show d4ef5913:<file>` with HEAD for
  tests/adapters-identity-roster.test.ts and
  tests/adapters-identity-creation.test.ts.
- The Review Focus five, read against
  web-app/identities/index.ts at HEAD.
- Doctrine: Reliability, Uniformity, Clarity,
  Simplicity; Test Weakening, Unbidden Helper Code,
  Obscurity, Swallowed Failures.
- Run `./test validate browser` and report its summary.
  If Chrome cannot run, report BLOCKED with the output.

Codebase brief: 78-char max lines in files ./test lint
lints (code and scripts, not .md); 4-space indent; no
inline styles; present-tense imperative commit subjects
with the Co-Authored-By trailer; RequestContext is the
first argument to client verbs; validators at the gate;
"grant" is a verb; prose names a person "organization
admin" or "operator", never bare "admin".

Report APPROVED, or a numbered list of findings, each
with file:line, the severity, and the fix.
```

---

### Task 2: Pin a dialog without a person half

**Agent:** `planner`

**Commit subject:** `Pin a dialog without a person half`

**Files:**
- Modify: `tests/browser/dialogs.test.ts:14-17`, the
  `ADD_IDENTITY_FIELDS` constant
- Modify: `tests/browser/dialogs.test.ts`, which gains
  one `Deno.test` after
  `'the add-identity dialog reopens with every field empty'`

**Interfaces:**
- Consumes: `useBrowser`, `withAdminPage`, `Page`
  (`tests/browser/fixtures.ts`), `registryUrl`
  (`web-app/app/browser-drive.ts`), and this file's own
  `openDialog(page, id)`.
- Produces: the browser test named
  `'the add-identity dialog opens on the service form'`.
  Task 10's G44 pin cites this exact name.

**Dispatch prompt:**

```
Go to Medium Church!

You implement Task 2 of
docs/superpowers/plans/identities-person-retire.md in
the worktree
/Users/tmornini/code/fusion-angle/.worktrees/identities-person-retire
(branch identities-person-retire). Work only there.
Create no worktree, pass no isolation, and never
rebase, merge, push, or force-push. Never run ./deploy,
./bin/build, ./bin/measure, seed, or wipe. Before any
deno or ./test, run export DENO_DIR="$TMPDIR/deno-dir".
Read spec §1 and §4
(docs/superpowers/specs/identities-person-retire-design.md),
then do exactly the steps of Task 2, pasted below.

This task adds a browser case that must be RED at
Layer 2 now. Task 3 turns it green. Do not touch
web-app/. Write only the code the task holds.

Codebase brief: 78-char max lines in files ./test lint
lints (code and scripts, not .md); 4-space indent; no
inline styles; present-tense imperative commit subject,
with only the Co-Authored-By trailer as body;
RequestContext is the first argument to client verbs;
validators at the gate, not downstream; "grant" is a
verb; prose names a person "organization admin" or
"operator", never bare "admin".

Commandments touched: Reliability (the case must fail
for the right reason), Uniformity (match this file's
openDialog and evaluate idiom), Clarity.
Abominations risked: Unbidden Helper Code (no new
helper, fixture, or extra assertion beyond the three);
Test Weakening (the reopen case keeps #svc-secret and
its empty-value assertion).

Report: the commit SHA; the ./test validate summary;
the ./test browser summary; and the exact failure
lines for the new case.
```

- [ ] **Step 1: Narrow `ADD_IDENTITY_FIELDS`**

Replace:

```ts
const ADD_IDENTITY_FIELDS = [
    '#id-name', '#id-email', '#id-phone', '#id-bio',
    '#svc-secret',
];
```

with:

```ts
const ADD_IDENTITY_FIELDS = ['#svc-secret'];
```

- [ ] **Step 2: Add the new case**

Insert after the closing `});` of
`'the add-identity dialog reopens with every field empty'`
(before
`Deno.test('the add-member dialog reopens …`), with
one blank line on each side:

```ts
Deno.test('the add-identity dialog opens on the service form',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.navigate(
            registryUrl(origin.baseUrl, 'identities'),
        );
        await page.ready('identities');
        await openDialog(page, 'add-identity');
        assertEquals(
            await page.evaluate<boolean>(
                `document.querySelector(`
                + `'#add-identity-dialog`
                + ` input[name="identity-kind"]') === null`,
            ),
            true,
        );
        assertEquals(
            await page.evaluate<boolean>(
                `document.querySelector(`
                + `'#add-identity-person-form') === null`,
            ),
            true,
        );
        assertEquals(
            await page.evaluate<boolean>(
                `document.querySelector('#svc-secret')`
                + `.checkVisibility()`,
            ),
            true,
        );
    });
});
```

`assertEquals` is already this file's only import from
`@std/assert`. Add no import.

- [ ] **Step 3: Layer 1 stays green**

Run: `export DENO_DIR="$TMPDIR/deno-dir" && ./test validate`
Expected: exit 0. Layer 1 does not run
`tests/browser/`, and the file still type-checks.

- [ ] **Step 4: Layer 2 is red in the new case only**

Run:

```bash
mkdir -p "$TMPDIR/identities-person-retire"
./test browser 2>&1 \
    | tee "$TMPDIR/identities-person-retire/task2-red.log" \
    | tail -40
```

Expected: a non-zero exit. The summary shows
`FAILED | … | 1 failed`. The one failure is
`the add-identity dialog opens on the service form`,
on its first assertion (`actual: false`,
`expected: true`): the Kind radios still exist. Every
other case passes, including
`the add-identity dialog reopens with every field empty`.
If anything else fails, stop and report it. If Chrome
cannot launch, report BLOCKED with the output.

- [ ] **Step 5: Commit**

```bash
git add tests/browser/dialogs.test.ts
git commit -F - <<'EOF'
Pin a dialog without a person half

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

The controller copies the red log's failing-case lines
into its task ledger. Task 12 cites them.

---

### Task 3: Drop the person half from the identities dialog

**Agent:** `planner`

**Commit subject:**
`Drop the person half from the identities dialog`

**Files:**
- Modify: `web-app/identities/index.html:48-131`
- Modify: `web-app/identities/index.ts` (imports,
  mint-once comment, `bindAddIdentityDialog`,
  `clearAddIdentityFields`, `onKindRadioChange`,
  `selectedKind`, `handleAddIdentitySubmit`,
  `submitPersonForm`, `submitServiceForm`)

**Interfaces:**
- Consumes: `postIdentityCreation(ctx, id, spec)` from
  `client/index.ts`, called here only with
  `{ kind: 'service', secret }`. That shape is the one
  Task 6 narrows the type to.
- Produces: no `IdentityPiiIntakeFailedError` reference
  and no `kind: 'person'` call anywhere under `web-app/`.
  Task 6 relies on this.

**Dispatch prompt:**

```
Go to Medium Church!

You implement Task 3 of
docs/superpowers/plans/identities-person-retire.md in
the worktree
/Users/tmornini/code/fusion-angle/.worktrees/identities-person-retire
(branch identities-person-retire). Work only there.
Create no worktree, pass no isolation, and never
rebase, merge, push, or force-push. Never run ./deploy,
./bin/build, ./bin/measure, seed, or wipe. Before any
deno or ./test, run export DENO_DIR="$TMPDIR/deno-dir".
Read spec §1 and §4
(docs/superpowers/specs/identities-person-retire-design.md),
then do exactly the steps of Task 3, pasted below.

This task turns Task 2's red browser case green. Touch
only web-app/identities/index.html and
web-app/identities/index.ts. client/ narrows in Task 6,
not here.

Codebase brief: 78-char max lines in files ./test lint
lints (code and scripts, not .md); 4-space indent; no
inline styles (CSS custom properties + classes per
DESIGN-SYSTEM.md); present-tense imperative commit
subject, with only the Co-Authored-By trailer as body;
RequestContext is the first argument to client verbs;
validators at the gate, not downstream; no untyped any
from external boundaries; "grant" is a verb; prose
names a person "organization admin" or "operator",
never bare "admin". deno.json sets noUnusedLocals, so
an import left unused fails ./test validate.

Commandments touched: Reliability, Simplicity, Clarity,
Uniformity.
Abominations risked: Unbidden Helper Code (no new
function, no rename beyond the merge the task names);
Swallowed Failures (the reportFault path stays);
Obscurity (comments must stay true).

Report: the commit SHA; the ./test validate browser
summary; and confirmation that the new dialog case now
passes.
```

- [ ] **Step 1: Drop the toggle and person form from the HTML**

In `web-app/identities/index.html`, delete everything
from `<fieldset` (line 48, `id="add-identity-kind-toggle"`)
through the `</div>` that closes
`id="add-identity-person-form"` (line 127), plus the
blank line after it. Then change the service form's
class line from:

```html
                class="flex flex-col gap-3 hidden"
```

to:

```html
                class="flex flex-col gap-3"
```

The dialog body then reads exactly:

```html
        <div
            class="flex flex-col gap-3 py-4
                dialog-scroll"
        >
            <div
                id="add-identity-service-form"
                class="flex flex-col gap-3"
            >
                <div>
                    <label
                        class="label mb-1 block"
                        for="svc-secret"
                    >Client Secret</label>
                    <input
                        class="input"
                        id="svc-secret"
                        placeholder="Enter a client
                            secret"
                    />
                    <p class="text-xs text-muted mt-1">
                        Required. Shown only here and
                        not recoverable — store it now.
                    </p>
                </div>
            </div>
        </div>
```

The header, the footer, and every other id and line are
unchanged.

- [ ] **Step 2: Trim the imports in `index.ts`**

Replace:

```ts
import {
    $, $$, $input, $required, $textarea,
    populateIcons,
} from '../app/dom.ts';
```

with:

```ts
import {
    $, $input, $required,
    populateIcons,
} from '../app/dom.ts';
```

Delete the line:

```ts
import { trimStrings } from '../app/format.ts';
```

In the `../../client/index.ts` import, delete the line:

```ts
    IdentityPiiIntakeFailedError,
```

- [ ] **Step 3: Rewrite the mint-once comment**

Replace:

```ts
// Mint-once discipline (Phase 10 Task 2): the Add Identity
// dialog mints its entity id ONCE per dialog session and reuses
// it across retries — a retry after a partial (second-hop PII
// PUT) failure re-submits against the SAME identity rather than
// minting a fresh one and orphaning the first. Reset whenever
// the dialog opens (bindAddIdentityDialog), so a later session
// never reuses a stale id from an abandoned earlier one.
```

with:

```ts
// Mint-once discipline (Phase 10 Task 2): the Add Identity
// dialog mints its entity id ONCE per dialog session and reuses
// it across retries, so a retry of a create that already landed
// answers 409 rather than minting a second identity. Reset
// whenever the dialog opens (bindAddIdentityDialog), so a later
// session never reuses a stale id from an abandoned earlier one.
```

- [ ] **Step 4: Drop the kind-toggle listener**

In `bindAddIdentityDialog`, delete:

```ts
    $$(
        '#add-identity-kind-toggle input', document,
    ).forEach(input => {
        input.addEventListener(
            'change', onKindRadioChange,
            { signal },
        );
    });
```

Everything else in `bindAddIdentityDialog` stays: the
submit listener, the keydown listener, and the reset on
`#add-identity-btn`.

- [ ] **Step 5: Clear only the secret**

Replace:

```ts
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

with:

```ts
// The dialog's input is static markup, so a cancelled,
// escaped, or submitted session would greet the next one with
// last time's text. Open is the one path all three share.
function clearAddIdentityFields(): void {
    $input('#svc-secret', document)!.value = '';
}
```

- [ ] **Step 6: Delete `onKindRadioChange` and `selectedKind`**

Delete the whole `function onKindRadioChange(e: Event)`
(its 18 lines and the blank line after it). Delete the
whole `function selectedKind()` (its 11 lines and the
blank line after it). `onDialogKeydown`, between them,
stays unchanged.

- [ ] **Step 7: Make `handleAddIdentitySubmit` send the service form**

Replace everything from
`async function handleAddIdentitySubmit(` to the end of
the file (the dispatcher, `submitPersonForm`, and
`submitServiceForm`) with:

```ts
async function handleAddIdentitySubmit(
): Promise<void> {
    const secret = $input(
        '#svc-secret', document,
    )!.value.trim();
    if (secret === '') {
        showToast(
            'A client secret is required', 'error',
        );
        return;
    }
    const id = currentIdentityId();
    const ctx = sessionContext();
    try {
        await postIdentityCreation(
            ctx,
            id,
            { kind: 'service', secret },
        );
    } catch (err) {
        reportFault(
            ctx, 'Failed to add identity', err,
        );
        return;
    }
    showToast('Service identity added', 'success');
    closeDialog('add-identity');
    void refresh(ctx);
}
```

The file ends with that `}` and a single newline. The
body is `submitServiceForm`'s body, byte for byte. The
spec keeps the name `handleAddIdentitySubmit`, and a
one-line wrapper around `submitServiceForm` would be
indirection with no second caller.

- [ ] **Step 8: Confirm the page holds no person half**

Run:

```bash
grep -n "IdentityPiiIntakeFailedError\|identity-kind\|add-identity-person-form\|id-name\|id-email\|id-phone\|id-bio\|trimStrings\|\$textarea\|\$\$" \
    web-app/identities/index.ts web-app/identities/index.html
```

Expected: no output.

- [ ] **Step 9: Layer 2 is green**

Run: `./test validate browser`
Expected: exit 0. Layer 1 passes, then the browser
summary shows `ok | … | 0 failed`, including
`the add-identity dialog opens on the service form` and
`the add-identity dialog reopens with every field empty`.
If Chrome cannot launch, report BLOCKED with the
output.

- [ ] **Step 10: Commit**

```bash
git add web-app/identities/index.html web-app/identities/index.ts
git commit -F - <<'EOF'
Drop the person half from the identities dialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Mint the roster tests' orphan by a direct POST

**Agent:** `planner`

**Commit subject:**
`Mint the roster tests' orphan by a direct POST`

**Files:**
- Modify: `tests/adapters-identity-roster.test.ts:1-15`
  (imports), `:44-70`
  (`'getIdentityRoster omits a membership-less person'`),
  and `:118-147`
  (`'an admin cannot erase a membership-less person'`)

**Interfaces:**
- Consumes: `ctx.POST(path, body)` and
  `ctx.PUT(path, body)` on the `RequestContext` that
  `inPageContext` returns.
- Produces: no `IdentityPiiIntakeFailedError` reference
  and no `kind: 'person'` call to
  `postIdentityCreation` in this file. Task 6 relies on
  this.

**Dispatch prompt:**

```
Go to Medium Church!

You implement Task 4 of
docs/superpowers/plans/identities-person-retire.md in
the worktree
/Users/tmornini/code/fusion-angle/.worktrees/identities-person-retire
(branch identities-person-retire). Work only there.
Create no worktree, pass no isolation, and never
rebase, merge, push, or force-push. Never run ./deploy,
./bin/build, ./bin/measure, seed, or wipe. Before any
deno or ./test, run export DENO_DIR="$TMPDIR/deno-dir".
Read spec §4
(docs/superpowers/specs/identities-person-retire-design.md),
then do exactly the steps of Task 4, pasted below.

The covenant of these two tests does not change: an
orphan person is omitted from the roster, and an
organization admin's PII PUT and DELETE on it answer
403 with the outside-organization body. Only how the
orphan is minted changes. Keep every assertion, and
keep both test names as they are (other docs cite
them).

Codebase brief: 78-char max lines in files ./test lint
lints (code and scripts, not .md); 4-space indent;
present-tense imperative commit subject, with only the
Co-Authored-By trailer as body; RequestContext is the
first argument to client verbs; validators at the gate,
not downstream; "grant" is a verb; prose names a person
"organization admin" or "operator", never bare "admin".
deno.json sets noUnusedLocals, so an import left unused
fails ./test validate.

Commandments touched: Reliability, Logic (the rewritten
precondition must be the same state the old one made).
Abominations risked: Test Weakening (no assertion
dropped, no status or body loosened, no expectation
rewritten to fit).

Report: the commit SHA; the ./test validate summary;
and a before/after count of assert* calls in the two
rewritten tests.
```

- [ ] **Step 1: Count the assertions before**

Run:

```bash
awk '/omits a membership-less person/,/^}\);/' \
    tests/adapters-identity-roster.test.ts | grep -c "assert"
awk '/cannot erase a membership-less person/,/^}\);/' \
    tests/adapters-identity-roster.test.ts | grep -c "assert"
```

Record both numbers.

- [ ] **Step 2: Trim the imports**

Replace:

```ts
import {
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
```

with:

```ts
import {
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
```

and replace:

```ts
import {
    getIdentityRoster,
    IdentityPiiIntakeFailedError,
    postIdentityCreation,
} from '../client/identities.ts';
```

with:

```ts
import {
    getIdentityRoster,
    postIdentityCreation,
} from '../client/identities.ts';
```

`postIdentityCreation` stays, because the two service
cases use it.

- [ ] **Step 3: Rewrite the omission case**

Replace the whole
`Deno.test('getIdentityRoster omits a membership-less person', …)`
with:

```ts
Deno.test('getIdentityRoster omits a membership-less person',
async () => {
    const { ctx } = await setup();
    await ctx.POST('identities/', { id: PERSON, kind: 'person' });
    const err = await assertRejects(
        () => ctx.PUT('identities/' + PERSON + '/pii', {
            name: 'Ada', email: 'ada@x.io',
            phone: '555', bio: 'builds',
        }),
        RequestError,
    );
    assertStrictEquals(err.status, 403);
    assertStrictEquals(
        err.message,
        outside('PUT', '/identities/' + PERSON + '/pii')
            + ' ()',
    );
    const roster = await getIdentityRoster(ctx);
    assertEquals(
        roster.find((row) => row.id === PERSON),
        undefined,
    );
});
```

The old `assertInstanceOf(cause, RequestError)` is now
the `RequestError` class argument to `assertRejects`.
It is the same check on the same error, which the old
code reached through `err.cause`.

- [ ] **Step 4: Rewrite the erase case**

Replace the whole
`Deno.test('an admin cannot erase a membership-less person', …)`
with:

```ts
Deno.test('an admin cannot erase a membership-less person',
async () => {
    const { ctx } = await setup();
    await ctx.POST('identities/', { id: PERSON, kind: 'person' });
    await assertRejects(
        () => ctx.PUT('identities/' + PERSON + '/pii', {
            name: 'Ada', email: 'ada@x.io',
            phone: '555', bio: 'builds',
        }),
        RequestError,
    );
    const err = await assertRejects(
        () => ctx.DELETE('identities/' + PERSON + '/pii'),
        RequestError,
    );
    assertStrictEquals(err.status, 403);
    assertStrictEquals(
        err.message,
        outside(
            'DELETE', '/identities/' + PERSON + '/pii',
        ) + ' ()',
    );
    const roster = await getIdentityRoster(ctx);
    assertEquals(
        roster.find((row) => row.id === PERSON),
        undefined,
    );
});
```

The first `assertRejects` stands where the old
`assertRejects(…, IdentityPiiIntakeFailedError)` stood.
Both say that the bare identity landed and its PII PUT
was refused.

- [ ] **Step 5: Count the assertions after**

Rerun the two `awk … | grep -c "assert"` commands from
Step 1.
Expected: the omission case's count drops by exactly 1,
the folded `assertInstanceOf`; its check now lives in
`assertRejects`'s class argument. The erase case's
count is unchanged.

- [ ] **Step 6: Layer 1 is green**

Run: `./test validate`
Expected: exit 0. Both rewritten tests pass.

- [ ] **Step 7: Commit**

```bash
git add tests/adapters-identity-roster.test.ts
git commit -F - <<'EOF'
Mint the roster tests' orphan by a direct POST

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Drop the person-branch creation tests

**Agent:** `planner`

**Commit subject:** `Drop the person-branch creation tests`

**Files:**
- Modify: `tests/adapters-identity-creation.test.ts`
  (imports `:1-24`; delete the tests at `:45-72` and
  `:107-138`)

**Interfaces:**
- Consumes: nothing new.
- Produces: no `IdentityPiiIntakeFailedError` reference
  and no `kind: 'person'` call to
  `postIdentityCreation` in this file. Task 6 relies on
  this.

**Dispatch prompt:**

```
Go to Medium Church!

You implement Task 5 of
docs/superpowers/plans/identities-person-retire.md in
the worktree
/Users/tmornini/code/fusion-angle/.worktrees/identities-person-retire
(branch identities-person-retire). Work only there.
Create no worktree, pass no isolation, and never
rebase, merge, push, or force-push. Never run ./deploy,
./bin/build, ./bin/measure, seed, or wipe. Before any
deno or ./test, run export DENO_DIR="$TMPDIR/deno-dir".
Read spec §2 and §4
(docs/superpowers/specs/identities-person-retire-design.md),
then do exactly the steps of Task 5, pasted below.

The spec deletes exactly two tests, because they pinned
the client verb's person branch, which Task 6 removes.
Their server twins stay in
tests/api-identities-create.test.ts. Do not touch that
file. Delete nothing else. The two service tests stay
byte for byte.

Codebase brief: 78-char max lines in files ./test lint
lints (code and scripts, not .md); 4-space indent;
present-tense imperative commit subject, with only the
Co-Authored-By trailer as body; RequestContext is the
first argument to client verbs; validators at the gate,
not downstream; "grant" is a verb; prose names a person
"organization admin" or "operator", never bare "admin".
deno.json sets noUnusedLocals, so an import left unused
fails ./test validate.

Commandments touched: Reliability.
Abominations risked: Test Weakening (only the two named
tests go; the service cases keep every line).

Report: the commit SHA; the ./test validate summary;
and the Deno.test names left in the file.
```

- [ ] **Step 1: Delete the two person-branch tests**

Delete the whole test that begins:

```ts
Deno.test('postIdentityCreation stores the person and'
    + ' the admin PII hop is forbidden', async () => {
```

through its closing `});`, and the blank line after it.
Delete the whole test that begins:

```ts
Deno.test('a resent postIdentityCreation is 409 and leaves'
    + ' the first identity', async () => {
```

through its closing `});`, and the blank line after it.

- [ ] **Step 2: Drop the imports only they used**

Replace:

```ts
import {
    assert,
    assertInstanceOf,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
```

with:

```ts
import {
    assert,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
```

Replace:

```ts
import {
    IdentityPiiIntakeFailedError,
    postIdentityCreation,
} from '../client/identities.ts';
import { storedPutBodyText } from './http-fixtures.ts';
```

with:

```ts
import {
    postIdentityCreation,
} from '../client/identities.ts';
```

Everything else stays: `outside`, `setup`, the
`Phase Final Task 2` comment, `deriveIdentityPii`,
`deriveCredentialsFor`, `DEV_TOKEN`, `RequestError`,
and `verifyPassword`.

- [ ] **Step 3: Confirm what is left**

Run:

```bash
grep -n "^Deno.test" -A1 tests/adapters-identity-creation.test.ts
grep -n "IdentityPiiIntakeFailedError\|kind: 'person'" \
    tests/adapters-identity-creation.test.ts
```

Expected: the first command lists exactly
`'postIdentityCreation mints a service identity'` and
`'a second service creation for the same id is 409'`.
The second prints nothing.

- [ ] **Step 4: Confirm the server twins stand**

Run:
`git diff HEAD -- tests/api-identities-create.test.ts`
Expected: no output.

- [ ] **Step 5: Layer 1 is green**

Run: `./test validate`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/adapters-identity-creation.test.ts
git commit -F - <<'EOF'
Drop the person-branch creation tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Narrow identity creation to services

**Agent:** `planner`

**Commit subject:** `Narrow identity creation to services`

**Files:**
- Modify: `client/identities.ts:270-350`
  (`IdentityCreationSpec`,
  `IdentityPiiIntakeFailedError`, and the
  `postIdentityCreation` comment and body)

**Interfaces:**
- Consumes: Tasks 3, 4, and 5 leave no
  `kind: 'person'` caller and no
  `IdentityPiiIntakeFailedError` reference.
- Produces:
  `type IdentityCreationSpec = { readonly kind: 'service'; readonly secret: string }`;
  `postIdentityCreation(ctx: RequestContext, id: Id, spec: IdentityCreationSpec): Promise<void>`.
  `IdentityPiiIntakeFailedError` no longer exists.

**Dispatch prompt:**

```
Go to Medium Church!

You implement Task 6 of
docs/superpowers/plans/identities-person-retire.md in
the worktree
/Users/tmornini/code/fusion-angle/.worktrees/identities-person-retire
(branch identities-person-retire). Work only there.
Create no worktree, pass no isolation, and never
rebase, merge, push, or force-push. Never run ./deploy,
./bin/build, ./bin/measure, seed, or wipe. Before any
deno or ./test, run export DENO_DIR="$TMPDIR/deno-dir".
Read spec §2 and the Decisions
(docs/superpowers/specs/identities-person-retire-design.md),
then do exactly the steps of Task 6, pasted below.

postIdentityCreation keeps its name and its three
parameters. The wire body of a service create does not
change. The server does not change. Touch only
client/identities.ts.

Codebase brief: 78-char max lines in files ./test lint
lints (code and scripts, not .md); 4-space indent;
present-tense imperative commit subject, with only the
Co-Authored-By trailer as body; RequestContext is the
first argument to client verbs; a client verb is named
for its HTTP verb (getNoun/putNoun/deleteNoun/
postNounOperation); validators at the gate, not
downstream; snake_case storage, camelCase domain; no
untyped any from external boundaries; "grant" is a
verb; prose names a person "organization admin" or
"operator", never bare "admin". deno.json sets
noUnusedLocals.

Commandments touched: Simplicity, Uniformity, Clarity,
Idempotency (the deterministic credential id).
Abominations risked: Unbidden Helper Code (no new type,
error class, guard, or option); Internal Defense (no
runtime kind check: the type is the gate); Obscurity
(the comments must state only what is still true).

Report: the commit SHA; the ./test validate summary;
and the output of the Step 3 greps.
```

- [ ] **Step 1: Narrow the spec type and delete the error class**

Replace everything from the comment line
`// A person identity carries PII; a service identity`
through the closing `}` of
`class IdentityPiiIntakeFailedError` (and the blank line
after it) with:

```ts
// A service identity carries a hashed client_secret
// credential and no PII. The kind mirrors
// IdentityEntity.kind.
export type IdentityCreationSpec = {
    readonly kind: 'service';
    readonly secret: string;
};

```

- [ ] **Step 2: Narrow the verb**

Replace everything from the comment line
`// Mint an identity by client-minted id + named POST`
through the closing `}` of
`export async function postIdentityCreation` with:

```ts
// Mint a service identity by client-minted id + named POST
// (Commandment VII — no server INSERT). The identity stores
// carry no organization_id, so creation rides the GLOBAL
// spine, OFF the org facade. The identity and its hashed
// client_secret credential land in one POST /identities
// statement; the secret is hashed on the server write.
export async function postIdentityCreation(
    ctx: RequestContext,
    id: Id,
    spec: IdentityCreationSpec,
): Promise<void> {
    // The credential id derives from the identity id, so a
    // resent create names the same rows and answers 409.
    await ctx.POST('identities/', {
        id,
        kind: 'service',
        credential: {
            id: `${id}-client-secret`,
            identity_id: id,
            kind: 'client_secret',
            status: 'set',
            secret: spec.secret,
            at: nowUtc(),
        },
    });
    identityChanges.notify();
}
```

The POST body is the old service branch's body, byte
for byte. `IdentityPiiEntity` and `nowUtc` stay
imported: `IdentityPiiEntity` is still used by the PII
read near line 128, and `nowUtc` by the body above.

- [ ] **Step 3: Confirm the person branch is gone**

Run:

```bash
grep -rn "kind: 'person'" client/identities.ts
grep -rn "IdentityPiiIntakeFailedError" client web-app tests
```

Expected: both print nothing.

- [ ] **Step 4: Layer 1 is green**

Run: `./test validate`
Expected: exit 0. `deno check` now rejects any
`kind: 'person'` argument to `postIdentityCreation`,
and this commit leaves none.

- [ ] **Step 5: Commit**

```bash
git add client/identities.ts
git commit -F - <<'EOF'
Narrow identity creation to services

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Define organization admin and operator

**Agent:** `coder`

**Commit subject:** `Define organization admin and operator`

**Files:**
- Modify: `ARCHITECTURE.md`, `## Tenancy`. One new
  paragraph goes between the paragraph that ends
  `not on the very next request.` and the paragraph
  that begins `A foreign id under the caller's own`.

**Interfaces:**
- Produces: the defined terms "organization admin" and
  "operator", which Task 8's voice rule and Task 9's
  rewrites rely on.

**Dispatch prompt:**

```
Go to Medium Church!

You implement Task 7 of
docs/superpowers/plans/identities-person-retire.md in
the worktree
/Users/tmornini/code/fusion-angle/.worktrees/identities-person-retire
(branch identities-person-retire). Work only there.
Create no worktree, pass no isolation, and never
rebase, merge, push, or force-push. Never run ./deploy,
./bin/build, ./bin/measure, seed, or wipe. Before any
deno or ./test, run export DENO_DIR="$TMPDIR/deno-dir".
Read spec §3
(docs/superpowers/specs/identities-person-retire-design.md),
then do exactly the steps of Task 7, pasted below.
Insert the paragraph exactly as written. Edit nothing
else in ARCHITECTURE.md: Task 9 owns the "/ admin tier"
phrase.

Codebase brief: 4-space indent in code; .md files are
not linted, but wrap prose near 60 characters like
the surrounding text; present-tense imperative commit
subject, with only the Co-Authored-By trailer as body;
"grant" is a verb; prose names a person "organization
admin" or "operator", never bare "admin"; the role
string admin and the membership type 'admin' stay.

Commandments touched: Uniformity (call a thing a
thing), Clarity.
Abominations risked: Unbidden Helper Code (no sweep of
other "admin" prose; that is a later line);
Obscurity.

Report: the commit SHA and the ./test validate summary.
```

- [ ] **Step 1: Insert the definitions**

After the line `not on the very next request.` and its
following blank line, insert this paragraph and one
blank line after it:

```markdown
Two names for people. An **organization admin** is an
identity holding an accepted membership of
`type: 'admin'` in one organization. At mint that
membership is the claim `admin:<organization-id>`; at
the gate, `projectClaimRolesForOrganization`
(`api/authorization.ts:22`) projects it to the role
`admin` for the claim organization only.
`ROUTE_POLICY`'s `/` rows grant that role every verb,
and the identity fence confines it to co-members. It
reaches no other organization. The **operator** is
whoever holds `POSTGRES_URL` and
`JWT_HMAC_SIGNING_KEY` and runs `./deploy`, the seed,
and the wipe. The operator is not an identity, holds
no token, and never acts over HTTP. Every organization
today comes from the operator's seed.
```

- [ ] **Step 2: Check the anchors are true**

Run:

```bash
sed -n 22p api/authorization.ts
grep -n "pathPrefix: '/', roles: \['admin'\]" api/authorization.ts
```

Expected: line 22 is
`export function projectClaimRolesForOrganization(`,
and five `/` rows print (GET, PUT, POST, DELETE,
PATCH).

- [ ] **Step 3: Layer 1 is green**

Run: `./test validate`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add ARCHITECTURE.md
git commit -F - <<'EOF'
Define organization admin and operator

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Name the people in prose

**Agent:** `coder`

**Commit subject:** `Name the people in prose`

**Files:**
- Modify: `AGENTS.md`, `## Subagents`, the
  **Voice rules.** bullet, after the `grant` sentence
  (lines 209 to 211)

**Interfaces:**
- Consumes: Task 7's definitions in `ARCHITECTURE.md`.
- Produces: the voice rule that every later subagent
  brief carries.

**Dispatch prompt:**

```
Go to Medium Church!

You implement Task 8 of
docs/superpowers/plans/identities-person-retire.md in
the worktree
/Users/tmornini/code/fusion-angle/.worktrees/identities-person-retire
(branch identities-person-retire). Work only there.
Create no worktree, pass no isolation, and never
rebase, merge, push, or force-push. Never run ./deploy,
./bin/build, ./bin/measure, seed, or wipe. Before any
deno or ./test, run export DENO_DIR="$TMPDIR/deno-dir".
Read spec §3 and Decision 7
(docs/superpowers/specs/identities-person-retire-design.md),
then do exactly the steps of Task 8, pasted below. Edit
nothing else in AGENTS.md.

Codebase brief: .md files are not linted, but match
the bullet's existing indent and wrap; present-tense
imperative commit subject, with only the Co-Authored-By
trailer as body; "grant" is a verb; prose names a
person "organization admin" or "operator", never bare
"admin".

Commandments touched: Uniformity, Clarity.
Abominations risked: Unbidden Helper Code (no other
AGENTS.md edits).

Report: the commit SHA and the ./test validate summary.
```

- [ ] **Step 1: Add the rule beside `grant`'s**

Replace:

```markdown
  `grant` is a verb; the noun stays only for RFC 6749
  `grant_type` / `invalid_grant`, RFC 7591 `grant_types`,
  Postgres `GRANT`, and the OAuth adapter's internals.
```

with:

```markdown
  `grant` is a verb; the noun stays only for RFC 6749
  `grant_type` / `invalid_grant`, RFC 7591 `grant_types`,
  Postgres `GRANT`, and the OAuth adapter's internals.
  Prose names a person "organization admin" or
  "operator" (ARCHITECTURE.md `## Tenancy`), never bare
  "admin"; the role string `admin` and the membership
  type `'admin'` stay.
```

- [ ] **Step 2: Layer 1 is green**

Run: `./test validate`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -F - <<'EOF'
Name the people in prose

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Rewrite the root-tier phrases

**Agent:** `coder`

**Commit subject:** `Rewrite the root-tier phrases`

**Files:**
- Modify: `ARCHITECTURE.md`, `## Tenancy`, the paragraph
  that holds "The `/` admin tier stays"
- Modify: `api/routes.ts:3522-3528`, the comment above
  the identities `post:` handler
- Modify: `tests/api-organization-isolation.test.ts:1265-1269`,
  the comment above
  `'nested credentials are admin-only (member denied)'`

**Interfaces:**
- Consumes: Task 7's definitions.
- Produces: `grep -rn "admin tier" ARCHITECTURE.md api tests`
  prints nothing (oracle item 5).

**Dispatch prompt:**

```
Go to Medium Church!

You implement Task 9 of
docs/superpowers/plans/identities-person-retire.md in
the worktree
/Users/tmornini/code/fusion-angle/.worktrees/identities-person-retire
(branch identities-person-retire). Work only there.
Create no worktree, pass no isolation, and never
rebase, merge, push, or force-push. Never run ./deploy,
./bin/build, ./bin/measure, seed, or wipe. Before any
deno or ./test, run export DENO_DIR="$TMPDIR/deno-dir".
Read spec §3
(docs/superpowers/specs/identities-person-retire-design.md),
then do exactly the steps of Task 9, pasted below.

These are comment and prose edits only. No code line
changes. The api/routes.ts comment is the only edit
under api/ on this whole branch, so change nothing else
there. Test names stay as they are.

Codebase brief: 78-char max lines in files ./test lint
lints (code and scripts, not .md: api/routes.ts and the
test file are linted); 4-space indent; present-tense
imperative commit subject, with only the Co-Authored-By
trailer as body; "grant" is a verb; prose names a
person "organization admin" or "operator", never bare
"admin".

Commandments touched: Uniformity, Clarity.
Abominations risked: Unbidden Helper Code (rewrite only
the three phrases' sentences; the wider sweep is a
later line); Obscurity.

Report: the commit SHA, the ./test validate summary,
and the Step 4 grep output.
```

- [ ] **Step 1: ARCHITECTURE.md**

Replace:

```markdown
outside this organization`. Self stays self. The `/`
admin tier stays and reaches co-members only. Path
`:organization-id` on an org-nested route must equal the
claim org else 403. A membership name's organization
half must equal the path's (403). Its identity half
must equal the path's (404).
```

with:

```markdown
outside this organization`. Self stays self. The
organization admin's `/` rows stay and reach co-members
only. Path `:organization-id` on an org-nested route
must equal the claim org else 403. A membership name's
organization half must equal the path's (403). Its
identity half must equal the path's (404).
```

- [ ] **Step 2: `api/routes.ts`**

Replace:

```ts
        // Admin-only — POST /identities has no member-tier
        // entry, so it falls to the root admin tier in
        // ROUTE_POLICY. The identity and, for a service, its
        // client_secret credential are declared geneses in one
        // statement, so a resent create answers 409 and stores
        // nothing. A person's PII enters later via PUT
        // identities/:id/pii.
```

with:

```ts
        // Organization admin only — POST /identities has no
        // member-tier entry, so it falls to the organization
        // admin's `/` rows in ROUTE_POLICY. The identity and,
        // for a service, its client_secret credential are
        // declared geneses in one statement, so a resent
        // create answers 409 and stores nothing. A person's
        // PII enters later via PUT identities/:id/pii.
```

- [ ] **Step 3: `tests/api-organization-isolation.test.ts`**

Replace:

```ts
// identity-credentials stays ADMIN-ONLY after nesting: the
// /identities surface carries no member-tier entry, so the
// nested credentials route falls to the root admin tier. Admin
// reads it; a plain member is denied, exactly as the flat
// /identity-credentials route was.
```

with:

```ts
// identity-credentials stays ADMIN-ONLY after nesting: the
// /identities surface carries no member-tier entry, so the
// nested credentials route falls to the organization admin's
// `/` rows. An organization admin reads it; a plain member is
// denied, exactly as the flat /identity-credentials route was.
```

- [ ] **Step 4: Confirm the phrase is gone and the server diff is the comment**

Run:

```bash
grep -rn "admin tier" ARCHITECTURE.md api tests
git diff d4ef5913 --stat -- api server shared
```

Expected: the grep prints nothing. The stat names only
`api/routes.ts`, with `7 insertions(+), 7 deletions(-)`.

- [ ] **Step 5: Layer 1 is green**

Run: `./test validate`
Expected: exit 0. Lint passes, since every new line is
at most 78 characters.

- [ ] **Step 6: Commit**

```bash
git add ARCHITECTURE.md api/routes.ts \
    tests/api-organization-isolation.test.ts
git commit -F - <<'EOF'
Rewrite the root-tier phrases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Retarget G44 to the service-only dialog

**Agent:** `coder`

**Commit subject:** `Retarget G44 to the service-only dialog`

**Files:**
- Modify: `TEST-PLAN.md:5828-5877`, the whole G44 item
- Modify: `TODO.md:2240-2243`, the "Unpinned but
  pinnable" G44 entry

**Interfaces:**
- Consumes: Task 2's browser test name,
  `'the add-identity dialog opens on the service form'`;
  the surviving
  `'postIdentityCreation mints a service identity with a hashed client_secret'`.
- Produces: `grep -rn IdentityPiiIntakeFailedError TODO.md TEST-PLAN.md`
  prints nothing (oracle item 2, second half).

**Dispatch prompt:**

```
Go to Medium Church!

You implement Task 10 of
docs/superpowers/plans/identities-person-retire.md in
the worktree
/Users/tmornini/code/fusion-angle/.worktrees/identities-person-retire
(branch identities-person-retire). Work only there.
Create no worktree, pass no isolation, and never
rebase, merge, push, or force-push. Never run ./deploy,
./bin/build, ./bin/measure, seed, or wipe. Before any
deno or ./test, run export DENO_DIR="$TMPDIR/deno-dir".
Read spec §5 "### G44"
(docs/superpowers/specs/identities-person-retire-design.md),
then do exactly the steps of Task 10, pasted below.
Edit no other G-case and no other TODO.md entry.

Codebase brief: .md files are not linted, but keep the
G-case's two-space hanging indent and the Pin: block's
seven-space continuation; present-tense imperative
commit subject, with only the Co-Authored-By trailer as
body; "grant" is a verb; prose names a person
"organization admin" or "operator", never bare "admin".

Commandments touched: Clarity, Uniformity.
Abominations risked: Unbidden Helper Code (no new
G-case and no new Unpinned entry).

Report: the commit SHA, the ./test validate summary,
and the Step 3 grep output.
```

- [ ] **Step 1: Replace G44**

Replace the whole G44 item, from the line
`- [ ] **G44** Navigate to `identities/index.html`. Click`
through the line `       validation` that ends it
(just before `- [ ] **G45**`), with:

```markdown
- [ ] **G44** Navigate to `identities/index.html`. Click
  "Add Identity". PASS: the `add-identity` dialog opens
  on the service form (`#svc-secret`, "Client Secret"),
  with no Kind toggle and no person form. Click "Create"
  (`#add-identity-submit`) with the secret empty → "A
  client secret is required" and the dialog stays open.
  Enter a secret, Create → a "Service identity added"
  toast and the dialog closes. The roster append fails
  until G47's line lands: `GET identities/` omits
  services, so the new service is not listed (see G47).
  Source: `web-app/identities/index.ts`
  (`handleAddIdentitySubmit`).
  Pin: tests/browser/dialogs.test.ts 'the add-identity
       dialog opens on the service form' (decides no
       Kind toggle, no person form, and a visible
       `#svc-secret`);
       tests/adapters-identity-creation.test.ts
       'postIdentityCreation mints a service identity
       with a hashed client_secret' (decides the
       credential sub-object is hashed, never the
       plaintext secret); exploratory — the toast text
```

- [ ] **Step 2: Drop the Unpinned entry**

In `TODO.md`, delete these four lines:

```markdown
  - The second-hop `IdentityPiiIntakeFailedError` toast
    and the error class itself (G44) — Layer 1; `grep -rn
    IdentityPiiIntakeFailedError tests/` is empty, though
    the torn-state mechanism it wraps is pinned
```

- [ ] **Step 3: Confirm**

Run:

```bash
grep -rn "IdentityPiiIntakeFailedError" TODO.md TEST-PLAN.md
grep -n "add-identity-person-form\|Kind toggle (Person" TEST-PLAN.md
```

Expected: both print nothing.

- [ ] **Step 4: Layer 1 is green**

Run: `./test validate`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add TEST-PLAN.md TODO.md
git commit -F - <<'EOF'
Retarget G44 to the service-only dialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 11: File the person-create follow-up lines

**Agent:** `coder`

**Commit subject:** `File the person-create follow-up lines`

**Files:**
- Modify: `TODO.md`, `## Later work`. Its two-line
  "Re-aim the identities page's person create" bullet
  is replaced by three bullets.

**Interfaces:**
- Produces: TODO.md no longer holds the re-aim line,
  and holds the three lines spec §5 names.

**Dispatch prompt:**

```
Go to Medium Church!

You implement Task 11 of
docs/superpowers/plans/identities-person-retire.md in
the worktree
/Users/tmornini/code/fusion-angle/.worktrees/identities-person-retire
(branch identities-person-retire). Work only there.
Create no worktree, pass no isolation, and never
rebase, merge, push, or force-push. Never run ./deploy,
./bin/build, ./bin/measure, seed, or wipe. Before any
deno or ./test, run export DENO_DIR="$TMPDIR/deno-dir".
Read spec §5 "### TODO.md"
(docs/superpowers/specs/identities-person-retire-design.md),
then do exactly the steps of Task 11, pasted below.
Touch no other TODO.md line, including ## Sequencing.

Codebase brief: .md files are not linted, but keep the
bullet style of ## Later work; present-tense imperative
commit subject, with only the Co-Authored-By trailer as
body; "grant" is a verb (the noun stays only for
RFC 6749 grant_type / invalid_grant, RFC 7591
grant_types, Postgres GRANT, and the OAuth adapter's
internals); prose names a person "organization admin"
or "operator", never bare "admin".

Commandments touched: Clarity.
Abominations risked: Unbidden Helper Code (three lines,
no more).

Report: the commit SHA and the ./test validate summary.
```

- [ ] **Step 1: Replace the re-aim line**

Replace:

```markdown
- Re-aim the identities page's person create onto
  the memberships statement (G44's person half).
```

with:

```markdown
- A person identity is created only by its person.
  Retire the members statement's identity and PII
  geneses and `POST identities/`'s `kind: 'person'`,
  with SP-6 and item 5; SP-6 decides the route and the
  status. Until then an organization admin's
  `POST identities/` with a person body mints an
  orphan no view lists.
- Remove the never-verified `client_secret`: the
  credential kind, the seed row, the dialog field, and
  the service's Credentials card. OAuth's
  `client_credentials` `grant_type` with
  `private_key_jwt` covers the need. Before the
  service-identity rule (G47).
- Rewrite bare prose "admin" in the living docs as
  "organization admin" or "operator".
```

The second bullet writes the spec's
"`client_credentials` grant" as
"`client_credentials` `grant_type`". The noun "grant"
is reserved for RFC 6749's `grant_type`, and this is
that parameter's value.

- [ ] **Step 2: Confirm**

Run:

```bash
grep -n "Re-aim the identities page" TODO.md
grep -n "created only by its person\|never-verified\|Rewrite bare prose" TODO.md
```

Expected: the first prints nothing. The second prints
three lines, all inside `## Later work`, which sits
above `## Sequencing`.

- [ ] **Step 3: Layer 1 is green**

Run: `./test validate`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add TODO.md
git commit -F - <<'EOF'
File the person-create follow-up lines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Branch review (architect)

Run the **Branch review prompt** above. Every finding
is fixed, as its own commit with Layer 1 green, before
Task 12.

---

### Task 12: Run the §7 oracle

**Agent:** `coder` (verification only; commits nothing)

**Dispatch prompt:**

```
Go to Medium Church!

You run Task 12 of
docs/superpowers/plans/identities-person-retire.md in
the worktree
/Users/tmornini/code/fusion-angle/.worktrees/identities-person-retire
(branch identities-person-retire). Work only there.
Create no worktree, pass no isolation, and never
rebase, merge, push, force-push, edit, or commit. Never
run ./deploy, ./bin/build, ./bin/measure, seed, or
wipe. Before any deno or ./test, run
export DENO_DIR="$TMPDIR/deno-dir".
Read spec §7
(docs/superpowers/specs/identities-person-retire-design.md),
then run each step of Task 12, pasted below, and report
each command's output verbatim with PASS or FAIL. If
Chrome cannot launch, report BLOCKED with the output.
Never mark a step PASS without its output.

Codebase brief: present-tense imperative commit
subjects with only the Co-Authored-By trailer; "grant"
is a verb; prose names a person "organization admin" or
"operator", never bare "admin".

Commandments touched: Reliability, Clarity (say what is
true).
Abominations risked: Swallowed Failures (report every
red; do not retry until it is green).
```

- [ ] **Step 1: Clean tree on the tip**

Run: `git status --short && git log --oneline d4ef5913..HEAD`
Expected: no status output. The log lists, newest
first: the ten task commits (Tasks 11 down to 2, plus
any branch-review fix commits), the plan commit, and
`9a9355f1 Add the identities person-retire spec`.

- [ ] **Step 2: Oracle 1 — Layer 2 green on the tip; red was recorded**

Run: `./test validate browser`
Expected: exit 0, with the browser summary
`ok | … | 0 failed`.
Then run:

```bash
grep -n "opens on the service form" \
    "$TMPDIR/identities-person-retire/task2-red.log"
```

Expected: the case's `FAILED` line from Task 2. The
controller's ledger also holds it.

- [ ] **Step 3: Oracle 2**

Run:

```bash
grep -rn "IdentityPiiIntakeFailedError\|identity-kind\|add-identity-person-form" client web-app
grep -rn IdentityPiiIntakeFailedError tests TODO.md TEST-PLAN.md
```

Expected: both print nothing.

- [ ] **Step 4: Oracle 3**

Run: `grep -rn "kind: 'person'" client/identities.ts`
Expected: no output.

- [ ] **Step 5: Oracle 4**

Run: `git diff d4ef5913 -- api server shared`
Expected: exactly one hunk, in `api/routes.ts`, near
line 3522: the seven-line comment from Task 9 Step 2,
with no code line.

- [ ] **Step 6: Oracle 5**

Run: `grep -rn "admin tier" ARCHITECTURE.md api tests`
Expected: no output.

The controller then reports the oracle results to the
owner and stops. The owner lands the branch.

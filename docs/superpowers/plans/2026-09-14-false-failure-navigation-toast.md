# False-failure navigation toast — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this spec's worktree (AGENTS.md
> § Worktrees).

> **For the dispatching orchestrator (AGENTS.md § Subagents):**
> every subagent prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then push down: the 78-char lint on
> code/scripts (not `.md`), 4-space indent, no inline styles,
> the `org` identifier ban (spell `organization`),
> present-tense-imperative ~50-char commit subjects with the
> mandated trailer, TDD at Layer 1 (red before green in every
> commit that changes behavior), the Sin of Test Weakening,
> the Sin of Unbidden Helper Code (each task's diff is its
> story — nothing more), and the patterns under "Context an
> implementer must know". Subagents work in this worktree
> and never create their own — never pass the Agent tool
> `isolation`. One worker at a time.

**Goal:** Stop a successful Add Member from toasting a
generic abort / Failed-to-fetch error, and stop the same
false failure on any in-flight fetch that a full-page
navigation aborts.

**Architecture:** Two product commits. First, the global
error floor ignores `AbortError` and any fault after
`pagehide` (Decision 1) — defense for every page that
navigates. Second, Members stays on the page after a
successful human or AI create (Decision 2), matching
Identities minus the redundant extra refresh. Layer 2
pins AA5's live toast, no-reload, and roster append.

**Tech Stack:** Deno 2.9.6, TypeScript strict under
`deno.json`, `Deno.test` + `@std/assert`, Chrome CDP
under `./test browser`. No new dependencies.

**Spec:**
`docs/superpowers/specs/2026-09-14-false-failure-navigation-toast-design.md`

**Worktree:**
`.worktrees/2026-09-14-false-failure-navigation-toast`
on branch `2026-09-14-false-failure-navigation-toast`,
based on master `2b68e4c2`.

## Global Constraints

- Lint: 78-char max line on code and scripts (NOT `.md`);
  4-space indent; trailing newline; no trailing whitespace.
- Identifier ban: no camelCase `org` abbreviation.
  Spell `organization`.
- Commits: one concern each; subject ≈50 chars,
  present-tense imperative, no body prose; end every
  commit message with exactly:

  ```
  Co-Authored-By: Grok 4.6 <noreply@x.ai>
  ```

- `./test validate` must be green before every commit.
  Under a sandbox that cannot write
  `~/Library/Caches/deno`:
  `export DENO_DIR="$TMPDIR/deno-dir"` first. Layer 2
  (`./test browser`) is NOT in `./test validate`. Task 2
  must run `./test browser` before its commit. If Chrome
  cannot launch, say so and do NOT claim Layer 2 green.
- Red before green: every behavior change runs its new
  test and shows the failure BEFORE the product edit.
- Scope: only the files each task names. No N+1 refresh
  rewrite, no identities extra-refresh cleanup, no
  `persistPending` change, no wrapping of every
  `() => void refresh()`, no TEST-PLAN AA5 "Quality"
  department edit, no AA4 Kind-toggle pin.
- Subagents work in this worktree. Never pass
  `isolation`. Never `./deploy --render`.

## Context an implementer must know

- `initErrorSurfacing`
  (`web-app/app/error-helpers.ts`) is the floor under
  uncaught errors and unhandled rejections. Today it
  toasts every one. Fire-and-forget `() => void refresh()`
  subscribers rely on it.
- `showToast` writes `fusion-angle:pending-toast` and
  `replayPendingToast` restores it on the next page.
  Last write wins. Not toasting the abort is enough
  (Decision 4).
- `postHumanMemberCreation` PUTs identity, PII, then
  seat, then `humanMemberChanges.notify()`. The Members
  page already `subscribeHumanMemberChanges(() => void
  refresh())`. Notify refreshes this tab. A second
  `void refresh()` is identities' redundancy; do not
  copy it (Decision 2).
- `navigateTo` is `window.location.href = …`
  (`web-app/app/adapters/location.ts`). Same-page
  navigation still reloads.
- `tests/browser/fixtures.ts` `stays(page, expr, ms)`
  is the bounded negative assertion. A reload flips a
  `window` marker; an error toast flips
  `.toast-error` count.
- Department "Quality" is not a `<select>` option.
  The Layer 2 test uses Operations.
- AA4 in TEST-PLAN is "dialog opens". AA5 is the
  create. The reported bug is AA5.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `web-app/app/error-helpers.ts` | Predicate + floor | 1 |
| `tests/error-helpers.test.ts` | Layer 1 pin | 1 |
| `web-app/members/index.ts` | Stay after create | 2 |
| `tests/browser/member-create.test.ts` | Layer 2 AA5 pin | 2 |
| `TEST-PLAN.md` | AA5 pin names the test | 2 |

---

### Task 1: Ignore aborted faults at the error floor

**Files:**
- Modify: `tests/error-helpers.test.ts`
- Modify: `web-app/app/error-helpers.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/error-helpers.test.ts` (keep the
existing `extractErrorMessage` loop). Import the new
names from `../web-app/app/error-helpers.ts` only —
the api sibling has no abort floor.

```ts
import {
    extractErrorMessage as webExtract,
    isAbortFault,
    shouldSurfaceFault,
} from '../web-app/app/error-helpers.ts';
```

Add these four tests after the existing loop:

```ts
Deno.test('isAbortFault is true for AbortError', () => {
    assertStrictEquals(
        isAbortFault(
            new DOMException(
                'The operation was aborted.',
                'AbortError',
            ),
        ),
        true,
    );
});

Deno.test(
    'isAbortFault is true for an Error named AbortError',
    () => {
        const err = new Error('The user aborted a request');
        err.name = 'AbortError';
        assertStrictEquals(isAbortFault(err), true);
    },
);

Deno.test(
    'isAbortFault is false for Failed to fetch',
    () => {
        assertStrictEquals(
            isAbortFault(new TypeError('Failed to fetch')),
            false,
        );
    },
);

Deno.test(
    'shouldSurfaceFault hides abort and unload faults',
    () => {
        const abort = new DOMException(
            'The operation was aborted.',
            'AbortError',
        );
        const fetchErr = new TypeError('Failed to fetch');
        const boom = new Error('boom');
        assertStrictEquals(
            shouldSurfaceFault(abort, false), false,
        );
        assertStrictEquals(
            shouldSurfaceFault(fetchErr, false), true,
        );
        assertStrictEquals(
            shouldSurfaceFault(fetchErr, true), false,
        );
        assertStrictEquals(
            shouldSurfaceFault(boom, false), true,
        );
        assertStrictEquals(
            shouldSurfaceFault(boom, true), false,
        );
    },
);
```

- [ ] **Step 2: Run the tests and watch them fail**

`./test` always runs the whole memory glob; it does
not take a path. Target the file:

```bash
JWT_HMAC_SIGNING_KEY="${JWT_HMAC_SIGNING_KEY:-test-hmac-signing-key}" \
TZ=UTC deno test --frozen --parallel --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write --allow-net \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    tests/error-helpers.test.ts
```

Expected: FAIL — `isAbortFault` / `shouldSurfaceFault`
are not exported (or not defined).

- [ ] **Step 3: Implement the predicate and wire the floor**

In `web-app/app/error-helpers.ts`, add after
`extractErrorMessage`:

```ts
// Navigation abort is teardown, not a fault. Name,
// not message: "Failed to fetch" is a live TypeError
// until pagehide latches.
export function isAbortFault(err: unknown): boolean {
    return typeof err === 'object'
        && err !== null
        && 'name' in err
        && err.name === 'AbortError';
}

export function shouldSurfaceFault(
    err: unknown,
    pageUnloading: boolean,
): boolean {
    if (pageUnloading) return false;
    return !isAbortFault(err);
}
```

Replace `initErrorSurfacing` with:

```ts
export function initErrorSurfacing(): void {
    let unloading = false;
    window.addEventListener('pagehide', () => {
        unloading = true;
    });
    window.addEventListener('error', (event) => {
        const fault = event.error ?? event.message;
        if (!shouldSurfaceFault(fault, unloading)) {
            return;
        }
        log.error('uncaught error', 'core', fault);
        showToast(extractErrorMessage(fault), 'error');
    });
    window.addEventListener(
        'unhandledrejection',
        (event) => {
            if (!shouldSurfaceFault(
                event.reason, unloading,
            )) {
                return;
            }
            log.error(
                'unhandled rejection', 'core',
                event.reason,
            );
            showToast(
                extractErrorMessage(event.reason),
                'error',
            );
        },
    );
}
```

Keep the existing comment above `initErrorSurfacing`.
Add one sentence: aborted fetches and `pagehide`
teardown do not toast.

Do not change `reportFault`. Do not change `toast.ts`.

- [ ] **Step 4: Run the tests and watch them pass**

Same command as Step 2. Expected: PASS.

Then:

```bash
./test validate
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/error-helpers.test.ts \
    web-app/app/error-helpers.ts
git commit -m "$(cat <<'MSG'
Ignore aborted faults during page unload

Co-Authored-By: Grok 4.6 <noreply@x.ai>
MSG
)"
```

Subject is 42 characters.

---

### Task 2: Stay on Members after a successful create

**Files:**
- Create: `tests/browser/member-create.test.ts`
- Modify: `web-app/members/index.ts` (the two
  `navigateTo('members')` calls after successful
  create — currently after `closeDialog('add-member')`
  in `submitHumanForm` and `submitAIForm`)
- Modify: `TEST-PLAN.md` (AA5 pin only)

Depends on Task 1 (the error floor is already quiet
on abort; this task removes the reload that caused
it).

- [ ] **Step 1: Write the failing Layer 2 test**

Create `tests/browser/member-create.test.ts`:

```ts
import { assertEquals, assertStrictEquals } from
    '@std/assert';
import {
    useBrowser, withAdminPage, stays, type Page,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const STAY_MS = 1500;
const MARKER = 'window.__faStay === true';
const ERROR_TOASTS =
    'document.querySelectorAll(".toast-error").length';
const JORDAN = 'Jordan Rivera';
const JORDAN_EMAIL = 'jordan.rivera@company.com';

async function openAddMember(
    page: Page, baseUrl: string,
): Promise<void> {
    await page.navigate(
        registryUrl(baseUrl, 'members'),
    );
    await page.ready('members');
    await page.click(
        '[data-dialog-open="add-member"]',
    );
    await page.waitFor('#add-member-dialog[open]');
}

Deno.test(
    'adding a human member toasts success and stays (AA5)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openAddMember(
                    page, origin.baseUrl,
                );
                await page.evaluate(`(() => {
                    window.__faStay = true;
                    document.querySelector('#hw-name')
                        .value = ${JSON.stringify(JORDAN)};
                    document.querySelector('#hw-email')
                        .value = ${
                            JSON.stringify(JORDAN_EMAIL)
                        };
                    document.querySelector('#hw-title')
                        .value = 'QA Lead';
                    document.querySelector(
                        '#hw-department',
                    ).value = 'Operations';
                    return true;
                })()`);
                await page.click('#add-member-submit');
                await page.until(
                    `[...document.querySelectorAll(`
                    + `'.toast')].some(t => t.textContent`
                    + `.includes('Member added'))`,
                    'Member added toast',
                );
                await page.until(
                    `!document.querySelector(`
                    + `'#add-member-dialog[open]')`,
                    'dialog closed',
                );
                await page.until(
                    `document.body.textContent.includes(`
                    + `${JSON.stringify(JORDAN)})`,
                    'roster shows Jordan Rivera',
                );
                await stays(page, MARKER, STAY_MS);
                await stays(page, ERROR_TOASTS, STAY_MS);
                assertStrictEquals(
                    await page.evaluate<number>(
                        ERROR_TOASTS,
                    ),
                    0,
                );
                assertEquals(
                    await page.evaluate<boolean>(MARKER),
                    true,
                );
            },
        );
    },
);
```

Do not add an AI-create browser test. The human path
is AA5; the AI `navigateTo` drops in the same commit
because it is the same two lines.

- [ ] **Step 2: Run the test and watch it fail**

`./test browser` bundles the client then runs
`tests/browser/*.test.ts`. It does not take a
path. The bundle is the point: a targeted
`deno test` without `FUSION_ANGLE_STATIC_ROOT`
is a false fail.

```bash
./test browser
```

Expected: FAIL. Today's `navigateTo('members')`
reloads the page, so `window.__faStay` is gone
(`stays(MARKER)` throws). An error toast may also
appear; do not weaken the test if only one of the
two fails.

If Chrome cannot launch, stop and report BLOCKED.
Do not skip to the product edit.

- [ ] **Step 3: Drop both self-navigations**

In `web-app/members/index.ts` `submitHumanForm`,
after a successful create, keep:

```ts
    showToast('Member added', 'success');
    closeDialog('add-member');
```

Delete the next line, `navigateTo('members');`.

In `submitAIForm`, keep:

```ts
    showToast('AI member added', 'success');
    closeDialog('add-member');
```

Delete the next line, `navigateTo('members');`.

Do not add `void refresh(...)`. Notify already
starts `refresh()`. Do not reset `pendingMemberId`
here — open already does. Leave `navigateTo` in
`onMemberListClick` (row → detail). Leave
`members/detail.ts` Remove's `navigateTo('members')`
(Decision 3).

If `navigateTo` is now unused in this file, it is
not: `onMemberListClick` still imports and calls
it. Do not remove the import.

- [ ] **Step 4: Run the Layer 2 suite and watch it pass**

```bash
./test browser
```

Expected: PASS, including the new file and the
existing Members dialog/toast tests
(`tests/browser/dialogs.test.ts`,
`tests/browser/toasts.test.ts`).

Then:

```bash
./test validate
```

Expected: exit 0. `./test validate` does not run
Layer 2; the `./test browser` run above is the
evidence. Put it in the task report.

- [ ] **Step 5: Point TEST-PLAN AA5 at the new pin**

In `TEST-PLAN.md`, the AA5 pin currently reads
(wrap preserved):

```
  Pin: tests/adapters-members.test.ts
       'postHumanMemberCreation persists identity PII
       and a seat' (decides the identity + PII + seat
       write this Create triggers); exploratory — the
       live toast and roster append
```

Replace with:

```
  Pin: tests/adapters-members.test.ts
       'postHumanMemberCreation persists identity PII
       and a seat' (decides the identity + PII + seat
       write this Create triggers);
       tests/browser/member-create.test.ts
       'adding a human member toasts success and
       stays (AA5)' (the live toast, no-reload, and
       roster append)
```

Do not edit AA4. Do not change the "Quality"
example. Do not add a mitigation stub.

- [ ] **Step 6: Commit**

```bash
git add tests/browser/member-create.test.ts \
    web-app/members/index.ts TEST-PLAN.md
git commit -m "$(cat <<'MSG'
Stay on Members after adding a member

Co-Authored-By: Grok 4.6 <noreply@x.ai>
MSG
)"
```

Subject is 41 characters.

`./test validate` does not run the browser file.
Task 2's `./test browser` run is the Layer 2
evidence; put it in the task report.

---

## Dispatch notes

Task 1 is mechanical (predicate + four tests).
Task 2 is integration (Chrome, Members page). Use
the capable model for Task 2.

After Task 2, dispatch the final code reviewer
across both commits, then
`superpowers:finishing-a-development-branch`.
Fast-forward only. Never merge. Never `-D`.

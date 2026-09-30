# I21 members skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this plan's worktree (AGENTS.md §
> Worktrees).

**Goal:** Observe the members skeleton while its fetch
is still pending, at the lowest layer that paints it.
Then let that test's colour decide whether any product
change follows.

**Architecture:** `loadInto`
(`web-app/app/loading-states.ts`) paints the skeleton
synchronously, before it awaits `fetch`. The members
boot (`web-app/members/index.ts` `init`) calls
`loadInto` with `buildSkeleton('table', 5)`, whose outer
`div` carries `.skeleton-card`, before any await of its
own. So the skeleton is painted inside `loadInto`, and
the test belongs at Layer 1, not Layer 2. It is a
members-boot test with the in-page facade over a
`BackedDbAdapter` whose latency hook holds every client
verb. That hook is the Layer 1 twin of the walk's
`Fetch.enable` pause.

**Tech Stack:** Deno 2.9.6, TypeScript strict,
`Deno.test` + `@std/assert`, the in-page facade
(`tests/in-page-facade.ts`).

**Spec:** no design doc. The spec is the frozen stub
`docs/superpowers/test-plan-mitigations/2026-09-29-I-I21.md`
(committed to master by Task 0), plus TEST-PLAN I21.

**Worktree:** `.worktrees/2026-09-29-i21-members-skeleton`
on branch `2026-09-29-i21-members-skeleton`, base
`a6af68a6`. Task 0 rebases it onto master.

---

## What planning found — read before executing

At `a6af68a6` the test in Task 2 passes. It was
dry-run in planning and deleted afterwards:
`ok | 1 passed | 0 failed (41ms)`, with both sanitizers
on, `deno check` clean, and no line over 78. A
`loadInto`-only probe with a deferred fetch also
passed. Neither form of the Layer 1 test the stub asks
for is red. **This plan therefore lands a pin, not a
fix.** No product commit follows. The stub's
`Reproduced by` stays `not reproduced`: the only edit a
29 Sep stub may take is naming a red test, and none
exists.

Why the walk saw nothing, traced from source at
`a6af68a6`:

- The five GETs the walk held (organization, members,
  ideas, projects, flows) come from two places:
  - The top-bar strip sent four of them:
    `mutateHeaderInfo` → `getOrganization` +
    `getDashboardStats` (ideas, projects, flows). It
    runs in `bootApp`'s sidebar branch.
  - The members page sent the fifth, its own roster
    read (`getMembers` →
    `organizations/{id}/members/`). `getMembers` has no
    boot-time caller, and `loadInto` sends it only after
    it has painted the skeleton.
- `bootApp` runs three branches at once: sidebar
  chrome, palette, and page. The page branch first
  imports its code-split chunk (`bin/build-lib`:
  `deno bundle --code-splitting`).
- TEST-PLAN I21 says to query "on the first
  `Fetch.requestPaused`". The walk listed the
  organization GET first: the strip's read, sent while
  the members chunk may still be loading and before any
  members code has run.

This makes the walk's zero a probe-timing question, not
a proven product miss. Changing I21's probe step is a
TEST-PLAN edit outside this plan and outside the drift
plan's list. Task 5 files it as an owner call.

## Global Constraints

- Work only in this worktree. Task 0 is the one master
  commit pair, shared by all four 29 Sep plans. Never
  `-D`. Never force-push. Never merge; rebase onto
  master, then `git merge --ff-only`.
- One concern per commit. Subject ≈50 chars,
  present-tense imperative, no body. Trailer: the
  mandated `Co-Authored-By: Claude Opus 5.5
  <noreply@anthropic.com>`, plus any `Claude-Session:`
  line the executing harness mandates.
- A product change lands ONLY in the commit that turns
  a test watched red at Layer 1 or Layer 2 green. This
  plan expects no product change.
- Dated stubs stay frozen. Never edit
  `2026-09-29-I-I21.md` unless a test named in it has
  been seen red. Never edit an older stub.
- Do not weaken a green test. `tests/loading-states.test.ts`
  stays as it is.
- Under the Claude Code sandbox, before any `deno`,
  `./test`, or `./bin/*`:
  `export DENO_DIR="$TMPDIR/deno-dir"`.
- Voice: 78-char max in `.ts` under `api/ web-app/
  tests/ shared/ server/`; 4-space indent; no `org`
  identifier abbreviation. Stubs land before any
  `web-app` import, matching
  `tests/ideas-empty-reinit-error.test.ts`.
- Type check: `deno check` sees `setImmediate` only
  when a `node:` import is in the checked graph
  (AGENTS.md § One type universe). A standalone check
  of the new file does not have one, so drain with
  `setTimeout(r, 0)`.
- Commandments in play: Reliability, since a loading
  page must show it is loading. Logic: a test that
  cannot be red decides nothing, which is why Step 3
  proves this one can fail. Clarity: say "not
  reproduced" rather than invent a defect.
- Abominations to refuse: inventing a product change
  without a red test; Test Weakening; Unbidden Helper
  Code (no shared DOM-stub fixture, only this one
  test's stubs).
- Layer 1, one file:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write --allow-net \
    --allow-run=deno,./bin/serve,./deploy,sh,./test,./bin/postgres-wipe,./bin/postgres-seed \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    tests/members-pending-skeleton.test.ts
```

- Layer 1, the gate: `./test validate`. Baseline at
  `a6af68a6`: `./test` prints
  `ok | 3622 passed | 0 failed | 8 ignored`, then
  `ok | 8 passed | 0 failed`. With this pin:
  `ok | 3623 passed | 0 failed | 8 ignored`.

## Review Focus

1. **A roster read that rejects.** The skeleton gives
   way to the error state and "Try Again". Pinned by
   `tests/loading-states.test.ts` 'a rejecting fetch
   renders the error state and calls neither hook'.
2. **A roster read that never settles.** `loadInto` has
   no timeout, so the skeleton stays indefinitely. That
   is out of scope here. It bears on the Office of
   Failure's "every I/O call shall have a timeout", and
   is not filed by this plan.
3. **The ideas page, I21's other named target.** It
   passes its own skeleton through the same `loadInto`.
   Not driven here; the walk probed members.
4. **A pin that cannot fail.** Step 3 removes the
   skeleton paint and watches the test go red before
   restoring it.
5. **The first paused request not being the page's.**
   Filed as an owner call by Task 5. See "What planning
   found".

---

## File structure

| File | Role |
|---|---|
| `tests/members-pending-skeleton.test.ts` | new: the members boot under a held read |
| `TODO.md` | drop I21 from "Unpinned but pinnable"; drop the tracking sub-bullet; file the probe-timing owner call |
| `TEST-PLAN.md` | I21 Pin clause names the new pin |

---

### Task 0: Record the stubs and the tracking on master (shared)

All four 29 Sep plans carry this task verbatim. Whichever
plan executes first does Steps 2 and 3. The others find
both commits on master and only do Step 4.

- [ ] **Step 1: Check what master already has**

```bash
cd /Users/tmornini/code/fusion-angle
git status --short docs/superpowers/test-plan-mitigations/
grep -n "The 29 Sep walk's mitigations" TODO.md
```

If the three `2026-09-29-*.md` stubs print as `??`, do
Step 2. If `grep` prints nothing, do Step 3. Otherwise
go to Step 4.

- [ ] **Step 2: Commit the three stubs, docs-only, on
  master**

Read each stub first and commit it byte-for-byte as the
walk left it. Its Observed, Expected, and Pin lines
never change.

```bash
cd /Users/tmornini/code/fusion-angle
git add \
    docs/superpowers/test-plan-mitigations/2026-09-29-F-F29.md \
    docs/superpowers/test-plan-mitigations/2026-09-29-I-I21.md \
    docs/superpowers/test-plan-mitigations/2026-09-29-K-K17.md
git commit -F - <<'EOF'
Record 29 Sep TEST-PLAN FAIL stubs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 3: Track the four plans in TODO.md, on
  master**

In `TODO.md`, `## Critical functionality path`, replace:

```
  rewrite honest. G9's staleness was the corrupted test
  name, restored by the small-items sweep

## Later work
```

with:

```
  rewrite honest. G9's staleness was the corrupted test
  name, restored by the small-items sweep
- The 29 Sep walk's mitigations — one plan and
  worktree each, the plan on its branch as
  `docs/superpowers/plans/<slug>.md`; a sub-bullet
  leaves when its branch lands, and the last one out
  takes this line with it
  - F29, `2026-09-29-f29-zoomed-viewbox` — deleting
    the open panel's node or edge leaves the panel open
    behind an empty selection, so the next empty-canvas
    click restores the viewBox the panel saved on open
    (`docs/superpowers/test-plan-mitigations/2026-09-29-F-F29.md`).
    Oracle: `tests/browser/canvas-pan.test.ts` 'An
    empty-canvas click after deleting the open edge
    keeps the zoomed viewBox (F29)' green
  - I21, `2026-09-29-i21-members-skeleton` — the
    members skeleton the walk did not see while its
    organization GETs were paused
    (`docs/superpowers/test-plan-mitigations/2026-09-29-I-I21.md`).
    Oracle: `tests/members-pending-skeleton.test.ts`
    'members paints the table skeleton while its GETs
    are held (I21)' lands, red or green
  - K17, `2026-09-29-k17-signed-objective-score` — an
    approved objectives row reads "—" where its saved
    −100 baseline belongs
    (`docs/superpowers/test-plan-mitigations/2026-09-29-K-K17.md`).
    Oracle: `tests/presenter-project-objectives.test.ts`
    'approved row with no actual reads its signed
    baseline (K17)' green
  - TEST-PLAN drift, `2026-09-29-walk-drift` — AT2,
    AT4, A2, F9, F21, G36, and K26 still describe
    behavior the walk did not see. Oracle: each case
    reads as the 29 Sep walk and the re-count saw

## Later work
```

```bash
cd /Users/tmornini/code/fusion-angle
git add TODO.md
git commit -F - <<'EOF'
Track the 29 Sep walk mitigations in TODO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Markdown only: no `./test validate`.

- [ ] **Step 4: Rebase this worktree onto master**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-09-29-i21-members-skeleton
git rebase master
ls docs/superpowers/test-plan-mitigations/2026-09-29-I-I21.md
```

Expected: the rebase succeeds and `ls` prints the path.

---

### Task 1: Commit this plan

**Files:**
- Create: `docs/superpowers/plans/2026-09-29-i21-members-skeleton.md`

- [x] **Step 1: Commit the plan as written**, subject
  `Plan the I21 members-skeleton mitigation`. Done in
  the planning session. Markdown only.

---

### Task 2: Pin the members skeleton while its GETs are held

**Files:**
- Create: `tests/members-pending-skeleton.test.ts`

**Interfaces:**
- Consumes: `BackedDbAdapter(backend, latency, open,
  notify)` (`api/db-backed.ts`). Every client verb
  awaits `latency` before its simulated hop
  (`api/latency.ts`). Also `MemoryStorageBackend`
  (`api/backend-memory.ts`); `initAdapter`,
  `putSessionToken` (`web-app/app/adapters/init.ts`);
  `init` (`web-app/members/index.ts`);
  `seedAdminSchema`, `seedHumanMember`, and
  `organizationToken` from the test fixtures
- Produces: the test named
  `'members paints the table skeleton while its GETs
  are held (I21)'`, which Tasks 4 and 5 cite by name

- [ ] **Step 1: Write the test**

Create `tests/members-pending-skeleton.test.ts`:

```ts
import { assert, assertStrictEquals } from '@std/assert';
import './hmac-test-key.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { MemoryStorageBackend } from
    '../api/backend-memory.ts';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';

const MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';
const MEMBER_NAME = 'Demo Test';
const SKELETON_CARD = 'skeleton-card';
const DRAIN_TURNS = 5;

// The walk (I21) holds every /api/organizations/* GET and
// reads #member-list. Here the hold is the adapter's
// latency hook, which every client verb awaits before its
// simulated network hop: the members boot runs up to its
// pending read and stops there. Stubs land before any
// web-app import — the module graph reads theme and
// session state at load.

type ElementStub = {
    innerHTML: string;
    id: string;
    addEventListener: () => void;
    querySelector: () => null;
    querySelectorAll: () => never[];
};

function makeElementStub(selector: string): ElementStub {
    return {
        innerHTML: '',
        id: selector.slice(1),
        addEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
    };
}

function makeStorage(): {
    getItem: (k: string) => string | null;
    setItem: (k: string, v: string) => void;
    removeItem: (k: string) => void;
} {
    const storage = new Map<string, string>();
    return {
        getItem: (k) => storage.get(k) ?? null,
        setItem: (k, v) => { storage.set(k, v); },
        removeItem: (k) => { storage.delete(k); },
    };
}

async function drain(): Promise<void> {
    for (let i = 0; i < DRAIN_TURNS; i += 1) {
        await new Promise((r) => setTimeout(r, 0));
    }
}

Deno.test(
    'members paints the table skeleton while its'
    + ' GETs are held (I21)',
    () => withLocalStorageAsync(makeStorage(), async () => {
        const g = globalThis as Record<string, unknown>;
        const elements = new Map<string, ElementStub>();
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
            querySelector: (selector: string) => {
                const known = elements.get(selector);
                if (known !== undefined) return known;
                const made = makeElementStub(selector);
                elements.set(selector, made);
                return made;
            },
            querySelectorAll: () => [],
        };
        const gate = { held: Promise.resolve() };
        let release = (): void => {};
        try {
            await import('./in-page-facade.ts');
            const { initAdapter, putSessionToken } =
                await import(
                    '../web-app/app/adapters/init.ts'
                );
            const db = new BackedDbAdapter(
                new MemoryStorageBackend(),
                () => gate.held,
                async () => {},
                () => {},
            );
            await seedAdminSchema(db);
            await seedHumanMember(db, MEMBER_ID, MEMBER_NAME);
            assertStrictEquals(
                await initAdapter(() => db), true,
            );
            putSessionToken(await organizationToken());
            const { init } = await import(
                '../web-app/members/index.ts'
            );
            gate.held = new Promise<void>((resolve) => {
                release = resolve;
            });
            const booted = init();
            await drain();
            const list = elements.get('#member-list');
            assert(list, '#member-list was never read');
            assert(
                list.innerHTML.includes(SKELETON_CARD),
                'no skeleton while the GETs are held',
            );
            release();
            await booted;
            assert(
                list.innerHTML.includes(MEMBER_NAME),
                'the settled list names the member',
            );
            assert(
                !list.innerHTML.includes(SKELETON_CARD),
                'the settled list still shows a skeleton',
            );
        } finally {
            release();
            const { deleteNotificationChannel } =
                await import(
                    '../web-app/app/adapters/broadcast-channel.ts'
                );
            deleteNotificationChannel();
            delete g['window'];
            delete g['MutationObserver'];
            delete g['document'];
        }
    }),
);
```

- [ ] **Step 2: Run it and record its colour**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-09-29-i21-members-skeleton
export DENO_DIR="$TMPDIR/deno-dir"
git rev-parse --short HEAD
deno check --frozen tests/members-pending-skeleton.test.ts
```

Then run the Layer 1 one-file command from Global
Constraints.

Expected, as seen in planning at `a6af68a6`:

```
members paints the table skeleton while its GETs are held (I21) ... ok
ok | 1 passed | 0 failed
```

- **Green (expected):** this is a pin. Continue to
  Step 3. The stub stays frozen and no product task
  follows.
- **Red:** master has moved and broken the covenant.
  Stop. Save the output and the SHA, and leave the file
  uncommitted. The fix site is whatever the red output
  names, and that needs its own plan. Report back
  rather than improvise a product change.

- [ ] **Step 3: Prove the pin can fail, then restore**

A test that cannot be red decides nothing. In
`web-app/app/loading-states.ts`, inside `loadInto`,
delete the line:

```ts
    setHtml(cfg.container, cfg.skeleton);
```

Run the Layer 1 one-file command. Expected: the test
fails with

```
error: AssertionError: no skeleton while the GETs are held
FAILED | 0 passed | 1 failed
```

The sanitizer may add a leaking-ops note for the boot
the failed assertion abandoned. The assertion line is
what matters.

Restore the line and confirm the tree is clean except
for the new test:

```bash
git checkout -- web-app/app/loading-states.ts
git status --short
```

Expected: only `?? tests/members-pending-skeleton.test.ts`.

- [ ] **Step 4: Run the gate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate 2>&1 | tail -6
```

Expected: exit 0; `ok | 3623 passed | 0 failed |
8 ignored` (one more than the baseline), then
`ok | 8 passed | 0 failed`.

- [ ] **Step 5: Commit the pin**

```bash
git add tests/members-pending-skeleton.test.ts
git commit -F - <<'EOF'
Pin the members skeleton while GETs are held

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Retire I21 from "Unpinned but pinnable"

**Files:**
- Modify: `TODO.md`, `## Later work` → "Unpinned but
  pinnable" (lines 1247-1251 at `a6af68a6`)

- [ ] **Step 1: Remove the now-pinned sub-bullet**

Remove:

```
  - The loading skeleton before a fetch settles (I21) —
    the walk pauses `Fetch` on `/api/organizations/*`
    so the pending skeleton is observable; a Layer 1
    pin can still read `innerHTML` between calling
    `loadInto` and awaiting it
```

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -F - <<'EOF'
Drop the pinned I21 skeleton from TODO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Name the I21 pin in TEST-PLAN

**Files:**
- Modify: `TEST-PLAN.md`, the I21 Pin clause only
  (lines 6011-6014 at `a6af68a6`). The case's probe
  step stays as written; see Task 5.

- [ ] **Step 1: Edit the Pin clause**

Replace:

```
  Pin: exploratory — the live pre-settlement
       skeleton; `loadInto` is tested only after its
       fetch settles (empty, data, or error), never
       during the pending skeleton itself
```

with:

```
  Pin: tests/members-pending-skeleton.test.ts 'members
       paints the table skeleton while its GETs are held
       (I21)' (decides that the members boot paints
       `.skeleton-card` into `#member-list` before its
       first read settles, and that the settled roster
       replaces it); exploratory — the live Fetch-paused
       skeleton
```

- [ ] **Step 2: Commit**

```bash
git add TEST-PLAN.md
git commit -F - <<'EOF'
Name the I21 skeleton pin in TEST-PLAN

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Markdown only: no `./test validate`.

---

### Task 5: Retire the I21 tracking; file the owner call

**Files:**
- Modify: `TODO.md`, `## Critical functionality path`

- [ ] **Step 1: Drop the I21 tracking sub-bullet**

Remove these lines, which Task 0 added:

```
  - I21, `2026-09-29-i21-members-skeleton` — the
    members skeleton the walk did not see while its
    organization GETs were paused
    (`docs/superpowers/test-plan-mitigations/2026-09-29-I-I21.md`).
    Oracle: `tests/members-pending-skeleton.test.ts`
    'members paints the table skeleton while its GETs
    are held (I21)' lands, red or green
```

If it is the last sub-bullet under "The 29 Sep walk's
mitigations", remove that parent bullet's five lines
too.

```bash
git add TODO.md
git commit -F - <<'EOF'
Drop the landed I21 item from TODO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 2: File the probe-timing owner call**

Insert this bullet directly above `## Later work`,
after the last bullet of `## Critical functionality
path`, with one blank line before the heading:

```
- I21's walk probe reads the page at the first paused
  `/api/organizations/*` request, and on 29 Sep that
  request was not the page's. The five GETs the walk
  held are the top-bar strip's four — organization,
  ideas, projects, flows (`web-app/app/header-info.ts`,
  sent from `bootApp`'s sidebar branch) — and the
  members page's own roster read, which `loadInto`
  sends only after it has painted the skeleton. At the
  strip's organization GET the page branch may still be
  importing its code-split chunk, so no page code has
  run. `tests/members-pending-skeleton.test.ts` shows
  the skeleton painted once `init` runs. Owner call:
  have I21 poll for the skeleton while the pause holds,
  or rule the pre-import blank container a product gap.
  Oracle: TEST-PLAN I21's probe step and its
  `### Driving notes` twin
```

```bash
git add TODO.md
git commit -F - <<'EOF'
File the I21 probe-timing owner call in TODO

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Land

- [ ] **Step 1: Rebase and gate**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/2026-09-29-i21-members-skeleton
git rebase master
export DENO_DIR="$TMPDIR/deno-dir"
./test validate 2>&1 | tail -6
```

`TODO.md` and `TEST-PLAN.md` may conflict with a sibling
29 Sep plan that landed first. Keep every sibling's
lines and drop only this plan's own. Amend until every
commit is green.

Expected: exit 0.

- [ ] **Step 2: Fast-forward master and clean up**

```bash
cd /Users/tmornini/code/fusion-angle
git merge --ff-only 2026-09-29-i21-members-skeleton
git worktree remove .worktrees/2026-09-29-i21-members-skeleton
git branch -d 2026-09-29-i21-members-skeleton
```

If `--ff-only` refuses, return to Step 1. Never `-D`.

---

## Out of scope

- Any product change. None is licensed while the pin is
  green.
- Rewriting I21's probe step or its driving note. That
  is TEST-PLAN text, filed by Task 5 as the owner's
  call.
- A Layer 2 test. The skeleton is painted inside
  `loadInto`, so Layer 1 expresses it.
- No walk, no `./deploy`, no `./deploy --render`.

# Walk Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this worktree. Do not create one. Do
> not land. Do not rebase. Do not merge, force-push, or
> delete a branch. The plan is a dependency graph:
> dispatch by the graph, not by the numbering. One
> worker. Subagents work here and never pass the Agent
> tool `isolation`.

> **For the dispatching orchestrator:** every subagent
> prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then push down: the 78-char
> lint on code and scripts (not `.md`), 4-space indent,
> spell `organization` (never the org abbreviation as
> an identifier), present-tense-imperative ~50-char
> commit subjects, the trailer below, Author stays
> Tom Mornini (do not pass `--author`), the
> commandments and abominations each task names, and
> the patterns under Context: RequestContext first, a
> client verb returns an `HttpMessage` or keeps one, a
> write from a held message latches on it, SafeHtml
> from presenters, snake_case storage / camelCase
> domain, HTTP-verb naming, validators at the gate, no
> untyped `any`. Subagents never run `./deploy`,
> `./bin/measure`, or `./test browser`. Master owns
> 8080. Pass no model override. **coder** implements.
> **planner** reviews. Fresh reviewer each time. A
> small fix round is a coder; re-review with fresh
> reviewers. One concern per commit. A fix of this
> task's unpushed tip may `git commit --amend` only
> while that commit is still the tip and still one
> concern. Never amend any other commit. Never rebase.

**Goal:** Close the walk gaps that this branch still
has.

**Architecture:** Two camera commits and one switch
URL, then a document pass. F21, K17, A2, and K26 are
already recorded here. No new dependencies.

**Tech Stack:** Deno 2.9.6, TypeScript strict under
`deno.json`, `Deno.test` + `@std/assert`. No new
dependencies.

**Worktree:** `.worktrees/membership-and-versions`,
branch `membership-and-versions`, HEAD `77094cae`
when this plan was written. Cites are at that HEAD. A
cite that moved is re-found by the quoted text. A
cite whose text is gone is a stop. This plan is the
spec. There is no design doc.

**Ledger:** `ledger-store` stays `fbc78952`. Before
task 1, run:

```bash
git -C \
/Users/tmornini/code/fusion-angle/.worktrees/ledger-store \
    log -1 --format=%h
```

If that is not `fbc78952`, stop. Do not rebase.

**Subagents:** prompts start with `Go to Medium Church!`.

---

## Already satisfied — do not re-implement

- **K17.** `web-app/app/presenters/project-objectives.ts`
  already sets `actualReadout` to `formatSigned(actValue)`
  when actual or baseline is defined, else the em dash.
  `tests/presenter-project-objectives.test.ts` already
  has `approved row with no actual reads its signed
  baseline (K17)`, asserting the slider readout is
  U+2212 + `100`. The Oct 3 em dash was the pre-fix
  presenter. The live input handler in
  `web-app/projects/detail.ts` writes an ASCII sign
  only on an input event. Do not change it. The value
  attribute stays ASCII. `shows none yet when no
  actuals` stays. The history pin stays. Task 5 only
  runs that test.
- **F21.** `TEST-PLAN.md` already says the committed
  Transition follows the depth-first back-edge rule
  and need not match the dashed preview (recorded
  29 Sep). `findCycleEdgeIds` in
  `web-app/app/flow-cycle-edges.ts` stays. Do not
  weaken `tests/flow-cycle-edges.test.ts` `a back-edge
  to an ancestor is a cycle edge` (only id `back`) or
  `the DFS roots at the start node` (only `e3`),
  `tests/flow-layout.test.ts` `wouldBeCycle`, or F9.
  A classifier that dashes every edge on a cycle
  fails those pins. No product task.
- **A2.** `TEST-PLAN.md` already describes
  content-hashed `assets/app.<hash>.js` and
  `assets/styles.<hash>.css`. Do not pin a hash. No
  edit.
- **K26.** `TEST-PLAN.md` already says four
  `under_review` rows: the three seeded titles plus
  AA23's converted project, whose impact slot varies
  by walk. No edit.
- **Empty-selection door.** `flows/detail.ts` already
  has `closePanel()` for the delete handlers. Do not
  redo it. Do not route `handleAddNodeAtPosition`
  through it. Do not edit `flows/detail.ts` in this
  plan. `withPanelOpen`'s public signature stays
  `(open: boolean)`.

## Out of scope

Do not implement, document, or copy any of these:

- AA7a blocked (native model menu never painted).
  AA9a deferred on that.
- WB16 blocked (inbox navigation dropped the
  transition POST out of the buffer; the pin still
  decides the body).
- I22 blocked (no `loadInto` fault).
- The ideas-list `BroadcastChannel` bell.
- The records-list subscribe.
- `ledger-store`. Deploy, measure, Task 44, landing
  this branch.
- The five master stubs
  `docs/superpowers/test-plan-mitigations/2026-10-03-*.md`.
  They are not in this tree. Do not copy them. Do not
  cite them as files to edit.
- `./test browser`. The browser pin stays unrun.

## Global Constraints

- 78-char lines on code and scripts. 4-space indent.
  Spell `organization` in new identifiers and new
  prose. Do not rename existing selectors such as
  `.org-switcher`.
- Commit subject: one line, present-tense imperative,
  about 50 characters. No prose body. Trailer exactly:

  `Co-Authored-By: Grok 4.7 <noreply@x.ai>`

- Export `DENO_DIR="$TMPDIR/deno-dir"` before `deno`
  and before `./test`. That export is an agent
  accommodation. Do not bake it into a repo script.
- `./test postgres` needs `127.0.0.1:5432` free. It
  names its own compose project. If the port is
  taken, stop. Do not touch another stack.
- Green pins listed in the self-check stay, except
  the `applyPanelTransition` call signature and the
  two action tests that must pass the new argument.
- Do not weaken a green assertion to make a run pass.
- A continued shell word in a fenced command starts
  at column 0. An indented continuation would glue
  spaces into the token.

## Graph

Task 1 commits this plan. It runs only after the
owner picks an execution mode. The writer of this
file does not commit.

After task 1, tasks 2, 3, 4, and 5 are independent.
One worker, so they run one at a time, in this
order: 2, then 3, then 4, then 5. Task 6 runs after
tasks 2, 3, and 4, and after task 5 in this serial
order. A failed task stops the worker. Do not start
the next task.

Each product task: failing test, watch it fail for
the reason named here, minimal fix, watch green,
`./test validate`, one commit. Then a
spec-compliance review, then a code-quality review,
each a fresh planner, before the next task.

```text
Task 1 (commit this plan)
  ├─ Task 2  D16 switch URL          coder
  ├─ Task 3  recapture on open       coder
  ├─ Task 4  MIN_ZOOM clamp          coder
  └─ Task 5  confirm K17             coder
        │
        └── Task 6  TEST-PLAN drift  coder
            waits on 2, 3, and 4
```

---

## Task 1: Commit this plan

**Files:**
- `docs/superpowers/plans/2026-10-03-walk-a6af68a6-fixes.md`

**Agent:** the executing worker, after the owner
picks a mode. Not during planning.

**Doctrine:** Office of the Commit. One concern:
the plan file only.

- [ ] **Step 1: Confirm the tree**

```bash
git status --short
git rev-parse --short HEAD
```

Expected: HEAD `77094cae`, and the only dirty or
untracked path is this plan file. Anything else is
a stop. Do not stash, do not revert.

- [ ] **Step 2: Commit only the plan**

```bash
git add docs/superpowers/plans/2026-10-03-walk-a6af68a6-fixes.md
git commit -m "$(cat <<'EOF'
Plan the walk fixes as a graph

Co-Authored-By: Grok 4.7 <noreply@x.ai>
EOF
)"
git status --short
```

Expected: clean tree. Subject is that one line.

- [ ] **Step 3: Reviews**

Fresh planner, spec-compliance: the commit contains
only this file. Fresh planner, code-quality: the
graph, the five tasks, and the self-check are the
ones in this file. Prompt starts with
`Go to Medium Church!`.

---

## Task 2: Leave convert when the organization switches

**Files:**
- Modify: `web-app/app/organization-switcher.ts`
- Modify: `tests/organization-switcher.test.ts`

**Agent:** coder

**Doctrine:** Reliability (a successful switch must
not paint a failure card), Idempotency (a URL that
does not change still reloads, and boot still
re-scopes), Simplicity (one URL rule).

**Abominations:** swallowed errors (a failed
`putPreference` still toasts and returns), weakening
D35, retargeting every page.

**Do not edit** `web-app/ideas/convert.ts`. A direct
load of `ideas/convert.html?ideaId=999` still shows
`Failed to load idea for conversion.` and Try Again.
Idea detail stays on its URL.

- [ ] **Step 1: Write the failing tests**

Keep the three existing `organizationSwitcherHtml`
tests. Add the import and these tests. 4-space
indent.

```ts
import {
    organizationSwitcherHtml,
    urlAfterOrganizationSwitch,
} from '../web-app/app/organization-switcher.ts';
```

```ts
Deno.test(
    'a switch off convert leaves the ideas'
    + ' index (D16)',
    () => {
        assertStrictEquals(
            urlAfterOrganizationSwitch(
                'http://local/ideas/convert.html'
                + '?ideaId=WurwPqXxGtLhRAoCEcPzfQ'
                + '#stay',
            ),
            '/ideas/index.html',
        );
    },
);

Deno.test(
    'a switch on the ideas index keeps its query',
    () => {
        assertStrictEquals(
            urlAfterOrganizationSwitch(
                'http://local/ideas/index.html?x=1',
            ),
            '/ideas/index.html?x=1',
        );
    },
);

Deno.test(
    'a switch on idea detail keeps the id'
    + ' (D35 stays put)',
    () => {
        assertStrictEquals(
            urlAfterOrganizationSwitch(
                'http://local/ideas/detail.html'
                + '?ideaId=999',
            ),
            '/ideas/detail.html?ideaId=999',
        );
    },
);
```

`assertStrictEquals` is already imported.

- [ ] **Step 2: Watch the red**

The `--allow-run` value is split so the plan stays
inside 78 columns. The second fragment starts at
column 0 on purpose.

```bash
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write \
    --allow-net \
    --allow-run=deno,./bin/serve,./deploy,sh,\
./test,./bin/postgres-wipe,./bin/postgres-seed \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    tests/organization-switcher.test.ts
```

Expected FAIL: the module does not export
`urlAfterOrganizationSwitch`, so the file fails to
load. If the three new tests already pass, stop.

- [ ] **Step 3: Implement**

Export this pure function. Place it immediately
above `switchToOrganization`.

```ts
export function urlAfterOrganizationSwitch(
    href: string,
): string {
    const url = new URL(href, 'http://local');
    if (url.pathname.endsWith(
        '/ideas/convert.html',
    )) {
        url.pathname = url.pathname.replace(
            /convert\.html$/,
            'index.html',
        );
        url.search = '';
        url.hash = '';
    }
    return url.pathname + url.search + url.hash;
}
```

After a successful `putPreference`, replace
`location.reload()` with this. The failure toast
and its `return` stay above it, untouched.

```ts
    const next = urlAfterOrganizationSwitch(
        location.href,
    );
    const here = location.pathname
        + location.search
        + location.hash;
    if (next !== here) {
        location.assign(next);
        return;
    }
    location.reload();
```

Replace the comment above `switchToOrganization`
so it does not claim every success is a reload of
the same URL:

```ts
// Persist the chosen organization and re-scope.
// Boot re-exchanges a scoped token from the
// persisted id, so no mixed view survives. A
// convert URL leaves for the ideas index; every
// other URL reloads. Move only after a confirmed
// persist — a false return means the id never
// landed, so leaving would keep the prior one.
```

No other page rule. No edit to `convert.ts`.

- [ ] **Step 4: Watch the green**

Re-run the Step 2 command. Expected: PASS, including
the three existing html tests.

- [ ] **Step 5: Validate**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web-app/app/organization-switcher.ts \
    tests/organization-switcher.test.ts
git commit -m "$(cat <<'EOF'
Leave convert when the organization switches

Co-Authored-By: Grok 4.7 <noreply@x.ai>
EOF
)"
```

- [ ] **Step 7: Reviews**

Fresh planner, spec-compliance: only the convert
path changes; detail and the ideas index keep query
and hash; a failed persist does not navigate;
`convert.ts` is untouched. Fresh planner,
code-quality. Both prompts start with
`Go to Medium Church!`.

---

## Task 3: Recapture the camera when the panel opens

**Files:**
- Modify: `web-app/app/flow-designer-actions.ts`
- Modify: `web-app/app/presenters/flow-designer.ts`
- Modify: `tests/flow-designer-actions.test.ts`
- Modify: `tests/flow-designer-presenter.test.ts`

**Agent:** coder

**Doctrine:** Reliability. The open transition must
save the live viewBox, including when a stale save
is still stored. A close while the panel is already
shut must not restore that stale save.

**Abominations:** Test Weakening, rewriting the
reducer, running the browser suite, editing
`withCanvasSize`.

**Bug, at this HEAD.** `applyPanelTransition` treats
`savedViewBox.kind === 'saved'` as already open.
`withPanelOpen` copies `isPanelOpen` to the new
value, then `#handlePanelTransition`. Closing under
Auto Fit returns null before the save is cleared, so
`isPanelOpen` becomes false while the save remains.
`handleAddNodeAtPosition` writes `isPanelOpen: false`
without `withPanelOpen`, same leftover. The next
`withPanelOpen(true)` hits `panelStaysOpen` and does
not recapture. `withPanelOpen(false)` while already
closed hits `panelJustClosed` and restores the stale
box.

Oct 3 F14: after Zoom in, the viewBox was about
`-1921.714…`, `2156.428×1300.966`. Close restored
about `-3421.187…`, `2826.138×1705`. Oct 3 F29: an
empty-canvas click set `-455 -274.5 910 549`, the
load camera from `withCanvasSize(910, 549)` at zoom
1. The reducer test `empty canvas click keeps a
zoomed viewBox` stays green and must not be edited.

**Callers the grep found.** Update these. Do not
edit the mention-only hits (`TEST-PLAN.md`,
`TODO.md`, `docs/superpowers/plans/2026-09-02-test-plan-remediation.md`,
`docs/superpowers/plans/2026-09-29-f29-zoomed-viewbox.md`,
`docs/superpowers/test-plan-mitigations/2026-08-30-F-F14.md`).

- Definition:
  `web-app/app/flow-designer-actions.ts` (the export).
- Caller:
  `web-app/app/presenters/flow-designer.ts`
  `#handlePanelTransition`. Its only caller is
  `withPanelOpen`.
- Callers:
  `tests/flow-designer-actions.test.ts`, both
  `Deno.test` blocks named below (four call
  expressions).

`flows/detail.ts` calls `withPanelOpen`. That
signature does not change. Do not edit that file.

**Do not edit:** `tests/browser/canvas-pan.test.ts`
`Zoom-in viewBox survives panel open and close`;
`tests/flow-designer-presenter.test.ts`
`withZoomedIn steps +0.1…` and `withCanvasSize keeps
a non-auto-fit presenter's zoom`; `withCanvasSize`;
the empty-canvas reducer test. Do not run
`./test browser`.

- [ ] **Step 1: Write the failing presenter tests**

Append to `tests/flow-designer-presenter.test.ts`.
Use the file's `buildInitialFlowSnapshot`,
`emptyGraph`, `FlowDesignerPresenter`, and
`buildFlowHistorySnapshot`. `emptyGraph` is already
`is_auto_fit: false`. `assertEquals` is already
imported. Assert against fresh literals, not the
object stored on the snapshot: the presenter mutates
`viewBox` in place, and a self-compare cannot fail.

```ts
Deno.test(
    'opening the panel replaces a stale saved'
    + ' viewBox (F14)',
    () => {
        const base = buildInitialFlowSnapshot(
            emptyGraph, 800, 600, [], [], [],
        );
        const snap = {
            ...base,
            isAutoFit: false,
            isPanelOpen: false,
            savedViewBox: {
                kind: 'saved' as const,
                x: -3421,
                y: -887,
                w: 2826,
                h: 1705,
            },
            interaction: {
                ...base.interaction,
                viewBox: {
                    x: -1921,
                    y: -650,
                    w: 2156,
                    h: 1301,
                },
                zoom: 1.1,
            },
        };
        const opened = new FlowDesignerPresenter(
            snap, 800, 600,
            buildFlowHistorySnapshot(false),
        ).withPanelOpen(true);
        assertEquals(opened.savedViewBox, {
            kind: 'saved',
            x: -1921,
            y: -650,
            w: 2156,
            h: 1301,
        });
        const closed = new FlowDesignerPresenter(
            opened, 800, 600,
            buildFlowHistorySnapshot(false),
        ).withPanelOpen(false);
        assertEquals(closed.interaction.viewBox, {
            x: -1921,
            y: -650,
            w: 2156,
            h: 1301,
        });
        assertEquals(closed.savedViewBox, {
            kind: 'none',
        });
    },
);

Deno.test(
    'a close while the panel is already shut'
    + ' keeps the live viewBox (F29)',
    () => {
        const base = buildInitialFlowSnapshot(
            emptyGraph, 800, 600, [], [], [],
        );
        const snap = {
            ...base,
            isAutoFit: false,
            isPanelOpen: false,
            savedViewBox: {
                kind: 'saved' as const,
                x: -3421,
                y: -887,
                w: 2826,
                h: 1705,
            },
            interaction: {
                ...base.interaction,
                viewBox: {
                    x: -1921,
                    y: -650,
                    w: 2156,
                    h: 1301,
                },
                zoom: 1.1,
            },
        };
        const closed = new FlowDesignerPresenter(
            snap, 800, 600,
            buildFlowHistorySnapshot(false),
        ).withPanelOpen(false);
        assertEquals(closed.interaction.viewBox, {
            x: -1921,
            y: -650,
            w: 2156,
            h: 1301,
        });
        assertEquals(closed.savedViewBox, {
            kind: 'saved',
            x: -3421,
            y: -887,
            w: 2826,
            h: 1705,
        });
    },
);
```

Do not change the two `applyPanelTransition` tests
in this step. They still match today's four-argument
signature, so this step still typechecks at the
test boundary Deno uses with `--no-check` on the
test command. The signature change lands with the
fix, in the same commit.

- [ ] **Step 2: Watch the red**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write \
    --allow-net \
    --allow-run=deno,./bin/serve,./deploy,sh,\
./test,./bin/postgres-wipe,./bin/postgres-seed \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    --filter "stale saved viewBox|already shut" \
    tests/flow-designer-presenter.test.ts
```

Expected FAIL, for this reason and no other:

- F14: `savedViewBox` is still the stale save
  (`x: -3421`, `w: 2826`), because `kind === 'saved'`
  is treated as already open.
- F29: `interaction.viewBox` becomes that stale box,
  because a close while already shut still restores.

If either test passes, or fails for another reason
(throw, missing field, constructor type under the
test runtime), stop. Do not edit the assertion.

- [ ] **Step 3: Change the signature and the predicates**

In `web-app/app/flow-designer-actions.ts`, replace
`panelJustOpened`, `panelJustClosed`,
`panelStaysOpen`, and `applyPanelTransition` with
the following. Auto Fit still returns null first.
The three return bodies keep today's fields.
`panelStaysOpen` still sets `shouldPanToReveal`
true. That flag is not the bug. Do not flip it.

```ts
function panelJustOpened(
    isPanelOpen: boolean,
    wasOpen: boolean,
): boolean {
    return isPanelOpen && !wasOpen;
}

function panelJustClosed(
    isPanelOpen: boolean,
    wasOpen: boolean,
    savedViewBox: SavedViewBox,
): savedViewBox is SavedViewBoxOpen {
    return !isPanelOpen && wasOpen
        && savedViewBox.kind === 'saved';
}

function panelStaysOpen(
    isPanelOpen: boolean,
    wasOpen: boolean,
): boolean {
    return isPanelOpen && wasOpen;
}

export function applyPanelTransition(
    isAutoFit: boolean,
    wasOpen: boolean,
    isPanelOpen: boolean,
    savedViewBox: SavedViewBox,
    viewBox: ViewBox,
): PanelTransitionResult | null {
    if (isAutoFit) return null;
    if (panelJustOpened(isPanelOpen, wasOpen)) {
        return {
            savedViewBox: {
                kind: 'saved',
                x: viewBox.x,
                y: viewBox.y,
                w: viewBox.w,
                h: viewBox.h,
            },
            viewBox,
            shouldPanToReveal: true,
        };
    }
    if (panelJustClosed(
        isPanelOpen, wasOpen, savedViewBox,
    )) {
        return {
            savedViewBox: { kind: 'none' },
            viewBox: {
                x: savedViewBox.x,
                y: savedViewBox.y,
                w: savedViewBox.w,
                h: savedViewBox.h,
            },
            shouldPanToReveal: false,
        };
    }
    if (panelStaysOpen(isPanelOpen, wasOpen)) {
        return {
            savedViewBox,
            viewBox,
            shouldPanToReveal: true,
        };
    }
    return null;
}
```

Just-opened saves the current numbers and replaces
any stale save. Just-closed restores the saved
numbers and sets kind `none`. Stays-open keeps the
existing save and the current viewBox. Already shut
(`isPanelOpen` false and `wasOpen` false) returns
null, so a stale save is left in place and the live
viewBox is not overwritten.

- [ ] **Step 4: Thread `wasOpen` through the presenter**

Replace `withPanelOpen`:

```ts
    withPanelOpen(open: boolean): FlowSnapshot {
        const wasOpen = this.#snapshot.isPanelOpen;
        const next: FlowSnapshot = {
            ...this.#snapshot,
            isPanelOpen: open,
        };
        return this.#handlePanelTransition(
            next, wasOpen,
        );
    }
```

Replace `#handlePanelTransition`. The viewBox copy
and the pan stay as they are. Only `wasOpen` is new.

```ts
    #handlePanelTransition(
        snap: FlowSnapshot,
        wasOpen: boolean,
    ): FlowSnapshot {
        const result = applyPanelTransition(
            snap.isAutoFit,
            wasOpen,
            snap.isPanelOpen,
            snap.savedViewBox,
            snap.interaction.viewBox,
        );
        if (!result) return snap;
        const next: FlowSnapshot = {
            ...snap,
            savedViewBox: result.savedViewBox,
        };
        const vb = next.interaction.viewBox;
        vb.x = result.viewBox.x;
        vb.y = result.viewBox.y;
        vb.w = result.viewBox.w;
        vb.h = result.viewBox.h;
        if (result.shouldPanToReveal) {
            this.#panToRevealSelected(next);
        }
        return next;
    }
```

- [ ] **Step 5: Update the two action tests**

Replace the bodies so the calls take `wasOpen`.
Keep the names and the assertions.

```ts
Deno.test(
    'applyPanelTransition saves the viewBox on open',
    () => {
        const vb = { x: 5, y: 6, w: 800, h: 600 };
        // autoFit short-circuits to null.
        assertStrictEquals(
            applyPanelTransition(
                true, false, true,
                { kind: 'none' }, vb,
            ),
            null,
        );
        // Panel just opened → save + request a pan.
        const opened = applyPanelTransition(
            false, false, true,
            { kind: 'none' }, vb,
        );
        assert(opened !== null);
        assertStrictEquals(
            opened!.shouldPanToReveal, true,
        );
        assertStrictEquals(
            opened!.savedViewBox.kind, 'saved',
        );
    },
);

Deno.test(
    'applyPanelTransition restores the viewBox'
    + ' on close',
    () => {
        const pre = { x: 5, y: 6, w: 800, h: 600 };
        const opened = applyPanelTransition(
            false, false, true,
            { kind: 'none' }, pre,
        );
        assert(opened !== null);
        const panned = {
            x: 50, y: 60, w: 800, h: 600,
        };
        const closed = applyPanelTransition(
            false, true, false,
            opened!.savedViewBox, panned,
        );
        assert(closed !== null);
        assertStrictEquals(
            closed!.savedViewBox.kind, 'none',
        );
        assertEquals(closed!.viewBox, pre);
        assertStrictEquals(
            closed!.shouldPanToReveal, false,
        );
    },
);
```

Auto-fit: `(true, false, true, { kind: 'none' }, vb)`
is still null. Just opened:
`(false, false, true, { kind: 'none' }, vb)` still
saves. Close:
`(false, true, false, opened.savedViewBox, panned)`
still restores `pre`.

- [ ] **Step 6: Watch the green**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write \
    --allow-net \
    --allow-run=deno,./bin/serve,./deploy,sh,\
./test,./bin/postgres-wipe,./bin/postgres-seed \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    tests/flow-designer-presenter.test.ts \
    tests/flow-designer-actions.test.ts
```

Expected: PASS, including the two new tests and
both `applyPanelTransition` tests. A green got by
editing an assertion is a stop. Revert that edit.

- [ ] **Step 7: Validate and commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add web-app/app/flow-designer-actions.ts \
    web-app/app/presenters/flow-designer.ts \
    tests/flow-designer-actions.test.ts \
    tests/flow-designer-presenter.test.ts
git commit -m "$(cat <<'EOF'
Recapture the camera when the panel opens

Co-Authored-By: Grok 4.7 <noreply@x.ai>
EOF
)"
```

Expected: `./test validate` exits 0 before the
commit. If it fails, do not commit.

- [ ] **Step 8: Reviews**

Fresh planner, spec-compliance: `wasOpen` is the
second argument; every grep caller above is
updated; mention-only files are untouched;
`flows/detail.ts` is untouched; the named green
pins are untouched. Fresh planner, code-quality:
the branch bodies were not rewritten beyond the
predicate change. Both prompts start with
`Go to Medium Church!`.

---

## Task 4: Clamp a fitted camera to the minimum zoom

**Files:**
- Modify: `web-app/app/flow-interactions.ts`
- Modify: `tests/flow-zoom-to-fit.test.ts`

**Agent:** coder

**Doctrine:** Reliability. A fit that would sit
under the minimum zoom must land on that minimum,
so a later zoom-out clamp returns the same width
and height.

**Decision (owner, Oct 4): the minimum zoom wins.**
A fit always lands inside `0.25`–`2.0`. Content
wider or taller than `canvas / 0.25` is cropped
about the box center. While the raw box span fits
inside `canvas / 0.25`, the clamp eats only the
`ZOOM_TO_FIT_PADDING_PX` (`70`) padding and the
viewBox still contains the box. Past that span, no
canvas-aspect viewBox at zoom `0.25` can contain
the box, whatever the clamp formula. So a
containment assert belongs on the walk test, not on
the huge-box test. The first draft of this task
paired a `20000` box with containment asserts. That
draft was never committed. It is replaced here,
not weakened.

**Abominations:** changing `withCanvasSize`,
weakening `fitBoxToCanvas viewBox contains a box
that extends far beyond the node cluster`, editing
the MAX_ZOOM test, adding a containment assert to
the huge-box test, building the walk test's
zoomed viewBoxes by hand instead of through
`zoomIn` and `zoomOut`.

`MIN_ZOOM` is `0.25`. `MAX_ZOOM` is `2.0`.
`ZOOM_STEP` is `0.1`. All three already exist in
`flow-interactions.ts`. Today `fitBoxToCanvas`
clamps only when `zoom > MAX_ZOOM`.
`applyButtonZoom` clamps every button step to
`[MIN_ZOOM, MAX_ZOOM]` and rescales the viewBox by
`prevZoom / nextZoom`, so a fit under `0.25` can
never be returned to once you zoom in.

Oct 3 (F29): Auto Fit off kept a fitted viewBox
about `3644.39×2198.65` (zoom about `0.2497` on a
`910×549` wrap). Zoom in shrank it. Zoom out
clamped to `0.25` and landed `3640×2196`
(`910/0.25` by `549/0.25`), not the fitted camera.
PASS text for that walk requires width and height
to shrink, then restore, inside `0.25`–`2.0`.

Measured at `a937df40` (numbers the steps below
rely on):

- Walk box `{0, 0, 2000, 2060}` on `910×549`,
  panel offset `0`, is height-bound. Today the fit
  is zoom `0.24954…`, viewBox
  `{-823.32, -70, 3646.63, 2200}`. Zoom in lands
  `0.3495…`. Zoom out clamps to `0.25` and lands
  `3639.9999999999995×2196`, off the fit by
  `-6.63` and `-4`.
- With the clamp, the same fit is zoom `0.25`,
  viewBox `{-820, -68, 3640, 2196}`, which contains
  `0..2000` by `0..2060`. Zoom in lands `0.35` at
  `2600×1568.57…`. Zoom out lands `0.25` at
  `3639.9999999999995×2196`, within `5e-13` of the
  fit. Hence the `1e-9` tolerance, not strict
  equality: `0.35 - 0.1` is `0.24999999999999997`
  and the zoom-out clamp rounds it back to `0.25`.
- Huge box `0..20000` both axes on `1200×800`,
  offset `0`. Today: zoom `0.0397…`, viewBox
  `{-5105, -70, 30210, 20140}`. With the clamp:
  zoom `0.25`, viewBox `{7600, 8400, 4800, 3200}`,
  center `(10000, 10000)`.

- [ ] **Step 1: Write the failing tests**

Widen the `flow-interactions.ts` import at the top
of `tests/flow-zoom-to-fit.test.ts` to:

```ts
import {
    buildInteractionState,
    fitBoxToCanvas,
    nodeBoundsBox,
    zoomIn,
    zoomOut,
} from '../web-app/app/flow-interactions.ts';
```

`assert` and `assertStrictEquals` are already
imported. `CANVAS_W` is `1200`. `CANVAS_H` is
`800`.

Insert both tests, in this order, immediately
after `fitBoxToCanvas clamps zoom to MAX_ZOOM for
tiny content with panel offset`. Do not edit that
test. Do not edit `fitBoxToCanvas viewBox contains
a box that extends far beyond the node cluster`.

```ts
Deno.test(
    'fitBoxToCanvas clamps zoom to MIN_ZOOM for'
    + ' a huge box',
    () => {
        const box = {
            minX: 0,
            minY: 0,
            maxX: 20000,
            maxY: 20000,
        };
        const r = fitBoxToCanvas(
            box, CANVAS_W, CANVAS_H, 0,
        );
        assert(
            Math.abs(r.zoom - 0.25) < 1e-9,
            'zoom lands on MIN_ZOOM',
        );
        assertStrictEquals(
            r.viewBox.w, CANVAS_W / 0.25,
        );
        assertStrictEquals(
            r.viewBox.h, CANVAS_H / 0.25,
        );
        assert(
            Math.abs(
                r.viewBox.x + r.viewBox.w / 2
                - (box.minX + box.maxX) / 2,
            ) < 0.001,
            'viewBox centers on the box (x)',
        );
        assert(
            Math.abs(
                r.viewBox.y + r.viewBox.h / 2
                - (box.minY + box.maxY) / 2,
            ) < 0.001,
            'viewBox centers on the box (y)',
        );
    },
);

// Oct 3 walk (F29): Auto Fit off, a fit just under
// MIN_ZOOM. Zoom in, then out, must restore it.
Deno.test(
    'a fit just under MIN_ZOOM restores after'
    + ' zoom in and out',
    () => {
        const wrapW = 910;
        const wrapH = 549;
        const box = {
            minX: 0,
            minY: 0,
            maxX: 2000,
            maxY: 2060,
        };
        const fit = fitBoxToCanvas(
            box, wrapW, wrapH, 0,
        );
        const vb = fit.viewBox;
        assert(
            vb.y <= box.minY,
            'fit covers box top',
        );
        assert(
            vb.y + vb.h >= box.maxY,
            'fit covers box bottom',
        );
        assert(
            vb.x <= box.minX,
            'fit covers box left',
        );
        assert(
            vb.x + vb.w >= box.maxX,
            'fit covers box right',
        );
        const fitted = {
            ...buildInteractionState(vb.w, vb.h),
            zoom: fit.zoom,
            viewBox: { ...vb },
        };
        const zoomedIn = zoomIn(fitted);
        assert(
            zoomedIn.viewBox.w < vb.w
                && zoomedIn.viewBox.h < vb.h,
            'zoom in shrinks the camera',
        );
        const restored = zoomOut(zoomedIn);
        assert(
            Math.abs(restored.viewBox.w - vb.w)
                < 1e-9,
            'zoom out restores the fitted width',
        );
        assert(
            Math.abs(restored.viewBox.h - vb.h)
                < 1e-9,
            'zoom out restores the fitted height',
        );
        assert(
            restored.zoom >= 0.25
                && restored.zoom <= 2.0,
            'restored zoom sits inside 0.25..2.0',
        );
        assert(
            Math.abs(fit.zoom - 0.25) < 1e-9,
            'fit lands on MIN_ZOOM',
        );
    },
);
```

The restore asserts come before `fit lands on
MIN_ZOOM` on purpose: the red then names the walk
symptom, not the mechanism.

- [ ] **Step 2: Watch the red**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write \
    --allow-net \
    --allow-run=deno,./bin/serve,./deploy,sh,\
./test,./bin/postgres-wipe,./bin/postgres-seed \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    --filter "MIN_ZOOM" \
    tests/flow-zoom-to-fit.test.ts
```

Expected: 2 tests run, 2 FAIL.

- `fitBoxToCanvas clamps zoom to MIN_ZOOM for a
  huge box` fails on `zoom lands on MIN_ZOOM`
  (zoom about `0.0397`).
- `a fit just under MIN_ZOOM restores after zoom in
  and out` fails on `zoom out restores the fitted
  width` (`3639.9999999999995` against
  `3646.63…`). Its four containment asserts and
  `zoom in shrinks the camera` pass before it.

If either test passes, fails on a different
assert, or the file fails to load, stop.

- [ ] **Step 3: Clamp after the MAX_ZOOM clamp**

In `fitBoxToCanvas`, the `zoom > MAX_ZOOM` block
sets `vbW` and `vbH`, then the function returns.
The `x` and `y` formulas already run after that
block, so they use the clamped size. Add the same
shape for `MIN_ZOOM` immediately after the
`MAX_ZOOM` block and before the `return`:

```ts
    if (zoom < MIN_ZOOM) {
        zoom = MIN_ZOOM;
        vbW = canvasW / MIN_ZOOM;
        vbH = canvasH / MIN_ZOOM;
    }
```

Do not change the `x` or `y` formulas. Do not
change `withCanvasSize`.

- [ ] **Step 4: Watch the green**

Re-run the Step 2 command.

Expected: 2 tests run, 2 pass. The huge box lands
`{7600, 8400, 4800, 3200}`. The walk fit lands
`{-820, -68, 3640, 2196}` and the round trip
returns to it within `1e-9`.

If either fails, stop. Do not loosen a tolerance,
reorder, or delete an assert. Do not commit.
Report the failing assert and its numbers.

- [ ] **Step 5: Validate and commit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add web-app/app/flow-interactions.ts \
    tests/flow-zoom-to-fit.test.ts
git commit -m "$(cat <<'EOF'
Clamp a fitted camera to the minimum zoom

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

This trailer is the owner's Oct 4 choice for this
commit. It replaces the Global Constraints trailer
for Task 4 only.

- [ ] **Step 6: Reviews**

Fresh planner, spec-compliance, then a different
fresh planner, code-quality. Prompts start with
`Go to Medium Church!`. Reviewers check:

- The MAX_ZOOM test and the far-beyond contains
  test are untouched.
- The huge-box test carries no containment assert.
- The walk test drives `zoomIn` and `zoomOut` on a
  state built from the fit, and asserts the fit
  contains the raw box.
- The product diff is the five-line clamp and
  nothing else.

---

## Task 5: Confirm K17

**Files:** none.

**Agent:** coder

**Doctrine:** Office of Verification. The covenant
is already written. Do not add a test. Do not edit.

- [ ] **Step 1: Run the existing test**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write \
    --allow-net \
    --allow-run=deno,./bin/serve,./deploy,sh,\
./test,./bin/postgres-wipe,./bin/postgres-seed \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    --filter "/signed baseline \\(K17\\)/" \
    tests/presenter-project-objectives.test.ts
```

Expected: PASS for `approved row with no actual
reads its signed baseline (K17)`, printed as
`ok | 1 passed | 0 failed | 11 filtered out`. The
readout pin is U+2212 + `100`. `deno test` reads a
`--filter` as a substring unless it is wrapped in
`/…/`, so an unwrapped `\(` matches a literal
backslash. A run that reports `0 passed` selected
nothing: treat it as red.

- [ ] **Step 2: Stop on red**

If it fails, stop. Do not change the presenter, the
page input handler, or the test. Report the
failure. Do not commit.

- [ ] **Step 3: No commit when it passes**

```bash
git status --short
```

Expected: clean. No commit. Fresh planner confirms
the diff is empty and the named test passed. A
second fresh planner confirms no product file
changed. Prompts start with
`Go to Medium Church!`.

---

## Task 6: Record the walk document drift

**Files:**
- Modify: `TEST-PLAN.md` only

**Agent:** coder

**Doctrine:** Clarity. The walk document matches
this worktree. Counts come from commands run after
tasks 2, 3, and 4, not from memory.

**Abominations:** pasting a stale pass count,
inventing a reason when an ignored count and the
file list disagree, editing a product file in this
commit, pinning an asset hash, weakening F21.

Do not paste these stale counts into `TEST-PLAN.md`
or into the commit message: the old main-suite
total, the old postgres total, or any count copied
from `ledger-store` or from an older walk note.
Read the command output and transcribe it.

- [ ] **Step 1: Re-count, before any edit**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test
./test postgres
```

Both must exit 0. Save the printed `ok | …` lines.
`./test` prints the main suite and the timezone
suite. `./test postgres` prints its own line.

If either command fails, or `5432` is not free,
stop. Do not edit `TEST-PLAN.md`. Do not invent a
count.

`bin/test-postgres` runs these eleven files, in
this order:

- `tests/pg-acceptance.test.ts`
- `tests/pg-races.test.ts`
- `tests/pg-message-plane.test.ts`
- `tests/pg-boot.test.ts`
- `tests/pg-seed.test.ts`
- `tests/pg-explain.test.ts`
- `tests/pg-identifier-order.test.ts`
- `tests/pg-standalone-read.test.ts`
- `tests/schema-lifecycle.test.ts`
- `tests/pg-ledger-store.test.ts`
- `tests/pg-ledger-seed.test.ts`

- [ ] **Step 2: Replace the AT2 and AT4 censuses**

Edit only the dated ok-clauses and the file
census. Do not rewrap the rest of the AT2
checkbox. Do not change AT1, AT3, or AT5.

In the AT2 checkbox, replace the `on 29 Sep`
main-suite ok-clause and the timezone ok-clause
with the lines `./test` printed. Date the sentence
with the day you ran the command.

Replace the census that says one ignored test in
each of seven `pg-*.test.ts` files plus
`schema-lifecycle.test.ts`. Name the eleven files
above. Keep the statement that the ignored tests
are the live-Postgres placeholders AT4 runs, once
that file list is what AT4 runs.

In the Combined Totals paragraph (the one that
repeats that seven-file census), name the same
eleven files and the ignored count `./test`
printed. Leave the sentence that the number grows
and is not pinned.

In the AT4 checkbox, replace the eight-file /
seven-`pg-*.test.ts` census with the eleven names,
and replace the dated ok-clause with the line
`./test postgres` printed.

If a printed ignored count is not one ignored test
per file, write the printed count and the eleven
filenames. Do not invent a reason. Do not force
the words "one per file" against the output.

- [ ] **Step 3: FS3, cool teal**

Replace `Review is warm` in the FS3 case body.
Data Capture at heat `0.76` stays yellow/red.
Review at heat `0.24` is cool teal.
`pages-flow-stats.css` mixes `--heat-stop-low`
toward `--heat-stop-mid` across heat-t `0..0.5`
(`seg1 = heat-t/0.5`). `0.24` is 48% of that
segment. Create and Archive at heat `0` stay cool
or no-data. Keep the em-dash / `8.5m` / `2.1d`
sentence.

Do not change the heat-t pin sentence: the
citation `each node carries style="--heat-t:..."
and no data-heat` stays byte for byte. In the
exploratory color list on that pin, replace the
word `warm` with `cool teal` so the pin does not
still demand warm. Change no other pin text.

- [ ] **Step 4: F75, edges sit inside the nodes**

Replace the sentences that say the layout routes
edges beyond the node box and that curves bow past
the outermost nodes. This seed's edges sit inside
the node boxes and do not arc past the outermost
nodes.

Keep both PASS obligations: Auto Fit frames the
whole drawn graph with margin, and nothing clips.
Keep the re-fit covenant: Auto Fit off then on,
add, delete, and undo; every re-fit re-frames the
full drawn content, measured by `.flow-content`
`getBBox`, not by node positions.

Leave the Pin paragraph unchanged, including
`fitBoxToCanvas viewBox contains a box that
extends far beyond the node cluster` and the two
`withFitToBox` citations.

- [ ] **Step 5: G36, Wayne shows and Stark is gone**

Replace `Stark's rows are no longer visible` so
the PASS says all of the following, and no less:

- Wayne's ideas and Wayne's humans show.
- Stark's humans and Stark's ideas are gone.
- AI rows stay, because the catalog is global.
  Agents are global, not seated (G14a already
  says so). Do not edit G14a.
- The switch paints no `Something went wrong`
  card.

Leave the select, Set as default, chip, reload
persistence, and single-organization plain text
as they are. Leave the `.org-switcher` selector
names as they are.

- [ ] **Step 6: V1, quote the full helper**

The `members/index.html` helper is:

```text
Invite an existing person to this
organization by email. They decide
whether to accept or decline.
```

The case today quotes only `Invite an existing
person to this organization`. Quote the full
helper as one string, with single spaces:

```text
Invite an existing person to this organization
by email. They decide whether to accept or
decline.
```

The toast stays only `Invitation sent`. Do not
change `web-app/members/index.ts`. Do not add the
helper's second sentence to the toast.

- [ ] **Step 7: Validate and commit**

No product file is in this commit. `./test
validate` still runs, because TEST-PLAN path
citations are checked.

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
git add TEST-PLAN.md
git commit -m "$(cat <<'EOF'
Record the walk document drift

Co-Authored-By: Grok 4.7 <noreply@x.ai>
EOF
)"
```

Expected: validate exits 0, and `git show --stat`
names only `TEST-PLAN.md`.

- [ ] **Step 8: Reviews**

Fresh planner, spec-compliance: the eleven
filenames, the transcribed ok-lines, FS3, F75,
G36, and V1 match the steps above, and F21, A2,
and K26 were not rewritten. Fresh planner,
code-quality: no product diff. Prompts start with
`Go to Medium Church!`.

---

## Self-check

The implementer ticks these before calling the
plan done. A gap is a stop, not a silent skip.

- [ ] D16 has task 2.
- [ ] F14 has task 3.
- [ ] F29 empty click has task 3.
- [ ] F29 zoom inverse has task 4.
- [ ] FS3, F75, G36, V1, AT2, and AT4 have task 6.
- [ ] F21 is named as already done. No product
      task. The back-edge pins stay.
- [ ] K17 is named as already done. Task 5 only
      runs the existing test and does not commit.
- [ ] A2 is named as already done. No hash pin.
- [ ] K26 is named as already done. No edit.
- [ ] Blocked and excluded work is named and not
      tasked: AA7a, AA9a, WB16, I22, the ideas-list
      bell, the records-list subscribe,
      `ledger-store`, deploy, measure, Task 44,
      landing, the master `2026-10-03` mitigation
      stubs, and `./test browser`.
- [ ] These green pins are not edited, except the
      `applyPanelTransition` parameter list and the
      two action tests that pass `wasOpen`:
      K17 signed-baseline, `shows none yet when no
      actuals`, the history pin, the ASCII value
      attribute, F21 back-edge and DFS-root and
      `wouldBeCycle` and F9, A2's `<hash>` wording,
      K26's four `under_review` rows,
      `flows/detail.ts` `closePanel`,
      `empty canvas click keeps a zoomed viewBox`,
      `Zoom-in viewBox survives panel open and
      close`, `withZoomedIn steps +0.1…`,
      `withCanvasSize keeps a non-auto-fit
      presenter's zoom`, the MAX_ZOOM clamp test,
      and `fitBoxToCanvas viewBox contains a box
      that extends far beyond the node cluster`.
- [ ] D35's error card stays. `convert.ts` is not
      edited. A switch on idea detail keeps
      `ideaId`. The new detail test says
      `(D35 stays put)`.

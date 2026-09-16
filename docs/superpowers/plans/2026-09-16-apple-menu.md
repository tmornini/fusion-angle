# Apple-menu walk clicks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** TEST-PLAN names every walk case whose
driven click can open the macOS Apple menu, and a
Layer 1 pin keeps those selectors in the document.

**Architecture:** No product change. Broaden the
existing driving note, put the selector on each
named case, pin the document, and extend the
TODO.md first-click item.

**Tech Stack:** Markdown, Deno.test against
`@std/assert`.

**Spec:**
`docs/superpowers/specs/2026-09-16-apple-menu-design.md`

---

### Task 1: Failing pin

**Files:**
- Create: `tests/test-plan-apple-menu.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { assert } from '@std/assert';

const src = Deno.readTextFileSync('TEST-PLAN.md');

function caseBlock(id: string): string {
    const start = src.indexOf('**' + id + '**');
    assert(start >= 0, id + ' missing');
    const next = src.indexOf('\n- [ ] **', start + 1);
    return next < 0 ? src.slice(start) : src.slice(
        start,
        next,
    );
}

Deno.test('I7 I9 I28 name #sidebar-toggle', () => {
    for (const id of ['I7', 'I9', 'I28']) {
        assert(
            caseBlock(id).includes('#sidebar-toggle'),
            id + ' must name #sidebar-toggle',
        );
    }
});

Deno.test('I11 I14 I15 name #mobile-sidebar-open',
() => {
    for (const id of ['I11', 'I14', 'I15']) {
        assert(
            caseBlock(id).includes(
                '#mobile-sidebar-open',
            ),
            id + ' must name #mobile-sidebar-open',
        );
    }
});

Deno.test('B2 B3 and C5 name the Apple-menu miss',
() => {
    assert(caseBlock('B2').includes('.navbar-logo'));
    assert(caseBlock('B3').includes('.navbar-logo'));
    assert(
        caseBlock('C5').includes('#sidebar-toggle'),
    );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./test tests/test-plan-apple-menu.test.ts`
(or `deno test --frozen --no-check` on that file
with the suite's preloads if `./test` requires
them). Expected: FAIL, I7 does not contain
`#sidebar-toggle`.

### Task 2: Name the cases

**Files:**
- Modify: `TEST-PLAN.md` (setup, driving notes,
  B2, B3, C5, I7, I9, I11, I14, I15, I28)
- Modify: `TODO.md` (the first-click item)

- [ ] **Step 3: Setup — confirm bounds after set**

After `top` at least 80, add: confirm
`windowState` is `normal` and `top` ≥ 80 before
the first gesture. Keep the Apple-menu sentence.

- [ ] **Step 4: Broaden the driving note**

Replace the focusing-click bullet so it also
names `#sidebar-toggle`, `#mobile-sidebar-open`,
`.navbar-logo`, `#mobile-menu-toggle`, selector
clicks (not screenshot-xy on the corner), and
that the brand is collapse not home. Keep the
post-reload focusing click at viewport center.

- [ ] **Step 5: Per-case selectors**

On each case body (not only the Pin), name the
control:

- I7, I9, I28: `#sidebar-toggle` by selector
- I11, I14, I15: `#mobile-sidebar-open` by
  selector
- B2, B3: the CTA, not `.navbar-logo`
- C5: `.sidebar-nav-item`, not `#sidebar-toggle`

- [ ] **Step 6: TODO.md**

The existing first-click item lists those cases
and the selector-not-screenshot-xy rule.

- [ ] **Step 7: Run the pin green, then
  `./test validate`**

Expected: the new tests pass; Layer 1 green.

- [ ] **Step 8: Commit**

```bash
git add tests/test-plan-apple-menu.test.ts \
    TEST-PLAN.md TODO.md
git commit -m "Name Apple-menu selectors in walk cases"
```

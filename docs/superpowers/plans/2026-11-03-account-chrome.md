# Account chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

> **For the dispatching orchestrator:** this session
> does not implement. A later session executes. Every
> subagent prompt starts with the literal phrase
> `Go to Medium Church!`, then the voice rules, the
> commandments and abominations named below, and the
> AGENTS.md Subagents patterns. Per task, serial:
> implementer (`coder`) → spec-compliance reviewer
> (`planner`) → quality reviewer (`planner`). After
> the last task, `architect` reviews the range against
> the spec. A reviewer's finding is fixed by a fresh
> `coder` that amends that task's own commit. A
> finding that the spec is wrong is STOP. Paste the
> full task text into the implementer prompt. Do not
> tell a subagent to read this file. Do not land, merge,
> rebase, push, or delete the branch. Do not create a
> worktree. Do not pass isolation. One worker. Do not
> run `./deploy`, `./bin/build`, `./bin/measure`,
> `./bin/develop`, seed, or wipe. Do not touch the
> server on port 8080.

**Goal:** Keep the identity chip in both sidebars and
point it at the session identity, move Sign out to the
end of both headers, move the current-organization
control into the organization box and the mobile
header, and put the default-organization menu only on
the session identity's own identity page.

**Architecture:** The switcher stays a `<select
class="org-switcher">` that reloads through
`switchToOrganization`. The sidebars stop hosting it.
`mutateHeaderInfo` paints the same control into
`#header-stats` and `#mobile-header-organization`.
The default menu is a different select,
`#default-organization`, rendered by
`defaultOrganizationSelectHtml` and committed by
`commitDefaultOrganization`. It calls
`putIdentityDefaultOrganization` and never writes
`ACTIVE_ORGANIZATION_ID` or reloads. The identity
presenter appends that HTML to the card stack only
when the page supplies it.

**Tech Stack:** Deno 2.9.8, `Deno.test`, `@std/assert`,
SafeHtml, the existing client verbs. Gate is `./test`
and `./test validate`. Never pytest, node, or npm.
Lint skips `.md` and lints `*.ts`, `*.html`, and
`*.css` at 78 characters. Four-space indent. No inline
styles.

**Spec:**
`docs/superpowers/specs/2026-11-03-account-chrome-design.md`
at `9d26e62fe`. The spec is the oracle. Do not edit it.

**Worktree:**
`/Users/tmornini/code/fusion-angle/.worktrees/account-chrome`
on branch `account-chrome`. Every command below is
run from that directory.

**Voice:** spell the noun "organization".
RequestContext is the first argument of a client verb.
SafeHtml from presenters. snake_case on the wire,
camelCase in the domain. `class="org-switcher"` and
`class="org-set-default"` are existing class strings;
do not invent a new `org` identifier. No new route.
No control that clears a default. Do not edit
`TEST-PLAN.md`, `TODO.md`, or `API.md`.

**Commandments this plan leans on:** I Reliability,
III Uniformity, V Clarity, VII Idempotency (the
default write is PUT), VIII Simplicity.

**Abominations this plan risks:** unbidden helpers,
premature generalization, test weakening, a greedy
catch, a swallowed write failure, and a second
organization menu that reloads.

## File map

- Modify: `web-app/app/organization-switcher.ts` —
  select only; wire every `.org-switcher`; no default
  button.
- Modify: `web-app/app/styles/components-organization-switcher.css`
  — drop the default-button and sidebar rules; zero
  the select's left margin in the headers.
- Modify: `web-app/app/sidebar-member.ts` — names and
  the identity-detail chip only.
- Modify: `web-app/app/component-sidebar.html` —
  chip only.
- Modify: `web-app/app/component-mobile-sidebar.html`
  — chip only.
- Modify: `web-app/app/header-info.ts` — organization
  control plus the stat tiles.
- Modify: `web-app/app/component-mobile-header.html` —
  organization host, then search, then Sign out.
- Modify: `web-app/app/component-top-bar.html` — Sign
  out after the invitations bell.
- Modify: `web-app/app/layout.ts` — pass the boot
  organization list to the header; Sign out comment.
- Modify: `web-app/app/styles/layout.css` — hide stat
  tiles below 1024px; hide an empty mobile host.
- Create: `web-app/app/default-organization-field.ts`
  — select HTML, read, and commit.
- Modify: `web-app/app/presenters/identity-detail.ts`
  — append the field to the card stack.
- Modify: `web-app/identities/detail.ts` — read, paint,
  and commit on the session identity's page.
- Modify: `tests/organization-switcher.test.ts`
- Create: `tests/sidebar-member.test.ts`
- Create: `tests/header-organization.test.ts`
- Create: `tests/account-chrome-placement.test.ts`
- Create: `tests/default-organization-field.test.ts`
- Modify: `tests/presenter-identity-detail.test.ts`
- Create: `tests/identity-detail-default-organization.test.ts`

Do not change `switchToOrganization`,
`urlAfterOrganizationSwitch`, `initSignOut`'s body,
`postSessionLogout`, or the client default-organization
verbs. `getIdentityDefaultOrganization` already maps
a 404 to `null`. That null is an unset default.

## Gates

Focused red/green run. Replace `FILE`.

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/account-chrome
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write --allow-net \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    --preload ./tests/worker-name-prefix.ts \
    FILE
```

Commit gate, every task, after the focused file is
green:

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/account-chrome
export DENO_DIR="$TMPDIR/deno-dir"
./test validate
```

Expected: exit 0. Do not run `./test browser`.

Commit shape, every task. No prose body. Author stays
the configured user. Do not pass `--author`.

```bash
git commit -F - <<'MSG'
SUBJECT

Co-Authored-By: Grok 4.7 <noreply@xAI>
Co-authored-by: Tom Mornini <tmornini@users.noreply.github.com>
MSG
```

## Sequence

1. Task 1 — the switcher no longer sets a default.
2. Task 2 — the chip opens identity-detail.
3. Task 3 — pure current-organization HTML.
4. Task 4 — that control moves into the headers.
5. Task 5 — Sign out moves to both headers.
6. Task 6 — stat tiles hide below 1024px.
7. Task 7 — default-organization select HTML.
8. Task 8 — failed reads omit the field.
9. Task 9 — a change writes without switching.
10. Task 10 — the field mounts on identity detail.

---

### Task 1: Drop set-as-default from the switcher

**Files:**
- Modify: `tests/organization-switcher.test.ts`
- Modify: `web-app/app/organization-switcher.ts`
- Modify: `web-app/app/styles/components-organization-switcher.css`

- [ ] **Step 1: Write the failing test**

Replace the test named
`organizationSwitcherHtml renders a set-as-default control`
with these two tests. Leave the option, empty-below-two,
and `urlAfterOrganizationSwitch` tests as they are.

```typescript
Deno.test(
    'organizationSwitcherHtml renders the switcher',
    () => {
        const out = organizationSwitcherHtml(TWO)
            .toString();
        assertMatch(out, /class="org-switcher"/);
        assertMatch(
            out,
            /aria-label="Switch organization"/,
        );
        assertStrictEquals(
            out.includes('org-set-default'),
            false,
        );
        assertStrictEquals(
            out.includes('Set as default'),
            false,
        );
        assertStrictEquals(
            out.includes('org-switcher-group'),
            false,
        );
    },
);

Deno.test(
    'the switcher module does not set a default',
    () => {
        const src = Deno.readTextFileSync(
            'web-app/app/organization-switcher.ts',
        );
        assertStrictEquals(
            src.includes('org-set-default'),
            false,
        );
        assertStrictEquals(
            src.includes('Set as default'),
            false,
        );
        assertStrictEquals(
            src.includes(
                'putIdentityDefaultOrganization',
            ),
            false,
        );
        assertMatch(src, /\$\$\('\.org-switcher'/);
        const css = Deno.readTextFileSync(
            'web-app/app/styles/'
            + 'components-organization-switcher.css',
        );
        assertStrictEquals(
            css.includes('org-set-default'),
            false,
        );
        assertStrictEquals(
            css.includes('org-switcher-group'),
            false,
        );
    },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run the focused gate with
`FILE=tests/organization-switcher.test.ts`.

Expected: FAIL. `org-set-default` is still in the
HTML, so `includes('org-set-default')` is true.

- [ ] **Step 3: Write the minimal implementation**

Replace the imports, the comment, and
`organizationSwitcherHtml`. Delete
`setActiveOrganizationAsDefault`. Replace
`wireOrganizationSwitcher`. Do not edit
`switchToOrganization` or
`urlAfterOrganizationSwitch`.

```typescript
import { html, type SafeHtml } from './safe-html.ts';
import { $$ } from './dom.ts';
import {
    shouldShowOrganizationSwitcher,
    ACTIVE_ORGANIZATION_ID,
} from '../../client/organization-session.ts';
import { putPreference } from './adapters/preferences.ts';
import { showToast } from './toast.ts';

interface OrganizationOption {
    readonly id: string;
    readonly name: string;
}

// The current-organization select. Empty unless there
// are two or more reachable organizations. The active
// organization is selected after render in
// wireOrganizationSwitcher, so options carry no
// selected attribute. This menu switches and reloads.
// It does not set the default organization.
export function organizationSwitcherHtml(
    organizations: readonly OrganizationOption[],
): SafeHtml {
    if (!shouldShowOrganizationSwitcher(
        organizations,
    )) {
        return html``;
    }
    const options = organizations.map(
        organization => html`<option value="${
            organization.id
        }">${organization.name}</option>`,
    );
    return html`<select
        class="org-switcher"
        aria-label="Switch organization">${
        options
    }</select>`;
}
```

```typescript
// Select the active organization and wire every
// .org-switcher. A change reloads through
// switchToOrganization.
export function wireOrganizationSwitcher(
    activeOrganizationId: string,
): void {
    for (const el of $$('.org-switcher', document)) {
        if (!(el instanceof HTMLSelectElement)) {
            continue;
        }
        el.value = activeOrganizationId;
        el.addEventListener('change', () => {
            switchToOrganization(el.value);
        });
    }
}
```

In
`web-app/app/styles/components-organization-switcher.css`,
delete the `.org-switcher-group` rule, every
`.org-set-default` rule, and the
`.sidebar-org-switcher .org-switcher-group` rule.
Leave `.org-switcher`, its focus rule, and the three
`.sidebar-org-switcher` rules that do not mention
`org-switcher-group`.

- [ ] **Step 4: Run the test to verify it passes**

Run the focused gate with
`FILE=tests/organization-switcher.test.ts`.

Expected: PASS, including the option, empty-below-two,
and convert-redirect tests.

- [ ] **Step 5: Run the commit gate**

Run `./test validate` as in Gates.

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/organization-switcher.test.ts \
    web-app/app/organization-switcher.ts \
    web-app/app/styles/components-organization-switcher.css
git commit -F - <<'MSG'
Drop the switcher's set-as-default control

Co-Authored-By: Grok 4.7 <noreply@xAI>
Co-authored-by: Tom Mornini <tmornini@users.noreply.github.com>
MSG
```

---

### Task 2: Send the chip to identity-detail

**Files:**
- Create: `tests/sidebar-member.test.ts`
- Modify: `web-app/app/sidebar-member.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { assertMatch, assertStrictEquals } from
    '@std/assert';
import {
    sidebarMemberNavigation,
} from '../web-app/app/sidebar-member.ts';

const SESSION_IDENTITY = 'pnXmXrxOWayANgDLdCjuBw';

Deno.test(
    'the identity chip opens identity-detail',
    () => {
        const [page, params] =
            sidebarMemberNavigation(SESSION_IDENTITY);
        assertStrictEquals(page, 'identity-detail');
        assertStrictEquals(
            params.identityId,
            SESSION_IDENTITY,
        );
        assertStrictEquals(
            Object.hasOwn(params, 'memberId'),
            false,
        );
    },
);

Deno.test(
    'the chip no longer opens member-detail',
    () => {
        const src = Deno.readTextFileSync(
            'web-app/app/sidebar-member.ts',
        );
        assertStrictEquals(
            src.includes('member-detail'),
            false,
        );
        assertMatch(src, /identity-detail/);
        assertMatch(src, /sidebarMemberNavigation/);
    },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run the focused gate with
`FILE=tests/sidebar-member.test.ts`.

Expected: FAIL. The module does not export
`sidebarMemberNavigation`.

- [ ] **Step 3: Write the minimal implementation**

Add this function after the id constants in
`web-app/app/sidebar-member.ts`. Replace the chip
click. Do not yet remove the organization line or
the switcher host.

```typescript
export function sidebarMemberNavigation(
    identityId: string,
): readonly [string, { identityId: string }] {
    return [
        'identity-detail',
        { identityId },
    ];
}
```

Replace the chip loop:

```typescript
    const [page, params] = sidebarMemberNavigation(
        sidebarMember.id,
    );
    const chips = $$('.sidebar-member', document);
    for (const chip of chips) {
        chip.addEventListener('click', () => {
            navigateTo(page, params);
        });
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run the focused gate with
`FILE=tests/sidebar-member.test.ts`.

Expected: PASS.

- [ ] **Step 5: Run the commit gate**

Run `./test validate` as in Gates.

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/sidebar-member.test.ts \
    web-app/app/sidebar-member.ts
git commit -F - <<'MSG'
Send the identity chip to identity-detail

Co-Authored-By: Grok 4.7 <noreply@xAI>
Co-authored-by: Tom Mornini <tmornini@users.noreply.github.com>
MSG
```

---

### Task 3: Render the current-organization control

**Files:**
- Create: `tests/header-organization.test.ts`
- Modify: `web-app/app/header-info.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { assert, assertMatch, assertStrictEquals } from
    '@std/assert';
import {
    currentOrganizationControlHtml,
    headerStatsHtml,
} from '../web-app/app/header-info.ts';

const STARK = {
    id: 'AjdvjuECVZEgZoFajaIEkg',
    name: 'Stark',
};
const WAYNE = {
    id: 'BBjWJsjYIDkTRKIIPrzWRw',
    name: 'Wayne',
};

Deno.test(
    'two organizations render the switcher',
    () => {
        const out = currentOrganizationControlHtml(
            [STARK, WAYNE],
        ).toString();
        assertMatch(out, /class="org-switcher"/);
        assertMatch(
            out,
            /aria-label="Switch organization"/,
        );
        assertMatch(
            out,
            /value="AjdvjuECVZEgZoFajaIEkg"/,
        );
        assertMatch(
            out,
            /value="BBjWJsjYIDkTRKIIPrzWRw"/,
        );
        assertStrictEquals(
            out.includes('header-stat-label'),
            false,
        );
        assertStrictEquals(
            out.includes('org-set-default'),
            false,
        );
    },
);

Deno.test(
    'one organization renders the name as text',
    () => {
        const out = currentOrganizationControlHtml(
            [STARK],
        ).toString();
        assertMatch(
            out,
            /class="header-stat-label">Stark</,
        );
        assertStrictEquals(
            out.includes('<select'),
            false,
        );
    },
);

Deno.test(
    'no organization renders an empty control',
    () => {
        assertStrictEquals(
            currentOrganizationControlHtml([])
                .toString(),
            '',
        );
    },
);

Deno.test(
    'stat tiles follow the organization control',
    () => {
        const out = headerStatsHtml(
            currentOrganizationControlHtml(
                [STARK, WAYNE],
            ),
            [{ value: 3, label: 'Ideas' }],
        ).toString();
        const selectAt = out.indexOf('org-switcher');
        const tileAt = out.indexOf(
            'header-stat-item',
        );
        assert(selectAt >= 0);
        assert(tileAt > selectAt);
        assertMatch(out, />3</);
        assertMatch(out, /Ideas/);
        assertMatch(out, /header-stat-divider/);
    },
);

Deno.test(
    'one organization keeps the name and the tiles',
    () => {
        const out = headerStatsHtml(
            currentOrganizationControlHtml([STARK]),
            [{ value: 1, label: 'Members' }],
        ).toString();
        assertMatch(out, />Stark</);
        assertMatch(out, /header-stat-item/);
        assertStrictEquals(
            out.includes('<select'),
            false,
        );
    },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run the focused gate with
`FILE=tests/header-organization.test.ts`.

Expected: FAIL. `header-info.ts` does not export
`currentOrganizationControlHtml`.

- [ ] **Step 3: Write the minimal implementation**

Add these imports and functions to
`web-app/app/header-info.ts`. Do not change
`mutateHeaderInfo` in this task.

```typescript
import { html, type SafeHtml } from './safe-html.ts';
import {
    shouldShowOrganizationSwitcher,
} from '../../client/organization-session.ts';
import {
    organizationSwitcherHtml,
} from './organization-switcher.ts';
```

`header-info.ts` already imports `html` inside
`mutateHeaderInfo`. Add the top-level `html` import
and delete the in-function `html` import when you add
the functions, so the name is not imported twice.
Keep the in-function `setHtml` import until Task 4.

```typescript
interface HeaderStat {
    readonly value: string | number;
    readonly label: string;
}

export function currentOrganizationControlHtml(
    organizations: readonly {
        readonly id: string;
        readonly name: string;
    }[],
): SafeHtml {
    if (shouldShowOrganizationSwitcher(
        organizations,
    )) {
        return organizationSwitcherHtml(organizations);
    }
    const only = organizations[0];
    if (only === undefined) return html``;
    return html`<span class="header-stat-label">${
        only.name
    }</span>`;
}

export function headerStatsHtml(
    control: SafeHtml,
    stats: readonly HeaderStat[],
): SafeHtml {
    const tiles = stats.map(stat => html`<div
class="header-stat-divider"></div>
<div class="header-stat-item">
<span class="header-stat-value">${
stat.value}</span>
<span class="header-stat-label">${
stat.label}</span></div>`);
    return html`${control}${tiles}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run the focused gate with
`FILE=tests/header-organization.test.ts`.

Expected: PASS.

- [ ] **Step 5: Run the commit gate**

Run `./test validate` as in Gates.

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/header-organization.test.ts \
    web-app/app/header-info.ts
git commit -F - <<'MSG'
Render the current-organization control

Co-Authored-By: Grok 4.7 <noreply@xAI>
Co-authored-by: Tom Mornini <tmornini@users.noreply.github.com>
MSG
```

---

### Task 4: Host the control in both headers

**Files:**
- Create: `tests/account-chrome-placement.test.ts`
- Modify: `web-app/app/header-info.ts`
- Modify: `web-app/app/sidebar-member.ts`
- Modify: `web-app/app/layout.ts`
- Modify: `web-app/app/component-sidebar.html`
- Modify: `web-app/app/component-mobile-sidebar.html`
- Modify: `web-app/app/component-mobile-header.html`
- Modify: `web-app/app/styles/layout.css`
- Modify: `web-app/app/styles/components-organization-switcher.css`

The Sign out buttons stay in the sidebars until
Task 5. This task removes the organization line and
both switcher hosts only.

- [ ] **Step 1: Write the failing test**

```typescript
import { assert, assertMatch, assertStrictEquals } from
    '@std/assert';

function read(path: string): string {
    return Deno.readTextFileSync(path);
}

function at(src: string, needle: string): number {
    const found = src.indexOf(needle);
    assert(
        found >= 0,
        'missing ' + needle,
    );
    return found;
}

Deno.test(
    'sidebars keep the chip and drop the organization',
    () => {
        const desktop = read(
            'web-app/app/component-sidebar.html',
        );
        const mobile = read(
            'web-app/app/component-mobile-sidebar.html',
        );
        assertMatch(desktop, /id="sidebar-member-name"/);
        assertMatch(
            mobile,
            /id="mobile-sidebar-member-name"/,
        );
        assertMatch(desktop, /class="sidebar-member"/);
        assertMatch(mobile, /class="sidebar-member"/);
        for (const src of [desktop, mobile]) {
            assertStrictEquals(
                src.includes('sidebar-member-org'),
                false,
            );
            assertStrictEquals(
                src.includes('sidebar-org-switcher'),
                false,
            );
            assertStrictEquals(
                src.includes('org-switcher'),
                false,
            );
        }
        assertMatch(desktop, /data-signout/);
        assertMatch(mobile, /data-signout/);
    },
);

Deno.test(
    'the mobile header hosts the organization control',
    () => {
        const mobile = read(
            'web-app/app/component-mobile-header.html',
        );
        const title = at(
            mobile, 'mobile-header-title',
        );
        const organization = at(
            mobile, 'mobile-header-organization',
        );
        const search = at(
            mobile, 'mobile-search-toggle',
        );
        assert(title < organization);
        assert(organization < search);
    },
);

Deno.test(
    'the chip no longer loads the organization menu',
    () => {
        const src = read(
            'web-app/app/sidebar-member.ts',
        );
        assertStrictEquals(
            src.includes('organizationSwitcherHtml'),
            false,
        );
        assertStrictEquals(
            src.includes('wireOrganizationSwitcher'),
            false,
        );
        assertStrictEquals(
            src.includes('sidebar-member-org'),
            false,
        );
        assertStrictEquals(
            src.includes('getOrganizations'),
            false,
        );
        assertMatch(src, /sidebarMemberNavigation/);
    },
);

Deno.test(
    'the header paints and wires the organization',
    () => {
        const src = read('web-app/app/header-info.ts');
        assertMatch(src, /headerStatsHtml/);
        assertMatch(
            src, /currentOrganizationControlHtml/,
        );
        assertMatch(
            src, /#mobile-header-organization/,
        );
        assertMatch(src, /wireOrganizationSwitcher/);
        const layout = read('web-app/app/layout.ts');
        assertMatch(
            layout,
            /mutateHeaderInfo\(bootOrganizations\)/,
        );
        assertMatch(
            layout,
            /sessionIsOrganizationScoped\(\)/,
        );
        assertStrictEquals(
            layout.includes(
                'mutateSidebarMember(bootOrganizations)',
            ),
            false,
        );
    },
);

Deno.test(
    'a collapsed sidebar still hides the chip name',
    () => {
        const css = read(
            'web-app/app/styles/layout.css',
        );
        assertMatch(
            css,
            new RegExp(
                '\\.sidebar-collapsed'
                + ' \\.sidebar-member'
                + ' \\.flex-fill'
                + ' \\{ display: none; \\}',
            ),
        );
    },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run the focused gate with
`FILE=tests/account-chrome-placement.test.ts`.

Expected: FAIL. `sidebar-member-org` is still in
`component-sidebar.html`, so the first test fails.

- [ ] **Step 3: Write the minimal implementation**

Replace `web-app/app/sidebar-member.ts` with:

```typescript
import { $, $$ } from './dom.ts';
import { navigateTo } from './navigation.ts';

const SIDEBAR_MEMBER_NAME_IDS = [
    'sidebar-member-name',
    'mobile-sidebar-member-name',
] as const;

export function sidebarMemberNavigation(
    identityId: string,
): readonly [string, { identityId: string }] {
    return [
        'identity-detail',
        { identityId },
    ];
}

export async function mutateSidebarMember(
): Promise<void> {
    const { sessionContext } = await import(
        './client.ts'
    );
    const identity = sessionContext().identity;
    for (const id of SIDEBAR_MEMBER_NAME_IDS) {
        const el = $(`#${id}`, document);
        if (el) el.textContent = identity.name;
    }
    const [page, params] = sidebarMemberNavigation(
        identity.id,
    );
    const chips = $$('.sidebar-member', document);
    for (const chip of chips) {
        chip.addEventListener('click', () => {
            navigateTo(page, params);
        });
    }
}
```

In `web-app/app/component-sidebar.html`, replace the
footer's name block, organization line, and switcher
host with the name only. Leave the Sign out button.

```html
                        <div class="flex-fill">
                            <p
                                class="text-sm
                                    font-medium
                                    truncate"
                                id="sidebar-member-name"
                            ></p>
                        </div>
                    </div>
                    <button
```

In `web-app/app/component-mobile-sidebar.html`, the
same cut. Leave the Sign out button.

```html
                                <div
                                    class="flex-fill"
                                >
                                    <p
                                        class="text-sm
                                            font-medium
                                            truncate"
                                        id="mobile-sidebar-member-name"
                                    ></p>
                                </div>
                            </div>
                            <button
```

In `web-app/app/component-mobile-header.html`, insert
the host between the title and `.header-actions`:

```html
                    <span
                        class="mobile-header-title"
                    >Fusion Angle</span>
                    <div
                        id="mobile-header-organization"
                    ></div>
                    <div class="header-actions">
```

Replace `web-app/app/header-info.ts` with:

```typescript
import { $ } from './dom.ts';
import {
    html, setHtml, type SafeHtml,
} from './safe-html.ts';
import {
    shouldShowOrganizationSwitcher,
} from '../../client/organization-session.ts';
import {
    organizationSwitcherHtml,
    wireOrganizationSwitcher,
} from './organization-switcher.ts';
import type {
    OrganizationEntity,
} from '../../shared/types.ts';
import type { HttpMessage } from
    '../../shared/http-message/http-message.ts';

interface HeaderStat {
    readonly value: string | number;
    readonly label: string;
}

export function currentOrganizationControlHtml(
    organizations: readonly {
        readonly id: string;
        readonly name: string;
    }[],
): SafeHtml {
    if (shouldShowOrganizationSwitcher(
        organizations,
    )) {
        return organizationSwitcherHtml(organizations);
    }
    const only = organizations[0];
    if (only === undefined) return html``;
    return html`<span class="header-stat-label">${
        only.name
    }</span>`;
}

export function headerStatsHtml(
    control: SafeHtml,
    stats: readonly HeaderStat[],
): SafeHtml {
    const tiles = stats.map(stat => html`<div
class="header-stat-divider"></div>
<div class="header-stat-item">
<span class="header-stat-value">${
stat.value}</span>
<span class="header-stat-label">${
stat.label}</span></div>`);
    return html`${control}${tiles}`;
}

function organizationOptions(
    messages: readonly HttpMessage<
        OrganizationEntity
    >[],
): { id: string; name: string }[] {
    return messages.map(message => {
        const organization = message.body().toValue();
        return {
            id: organization.id,
            name: organization.name,
        };
    });
}

// A null boot list is the degraded edge: the header
// fetches. An array, including an empty one, is the
// boot's list and is not fetched again.
async function loadOrganizationOptions(
    bootOrganizations:
        readonly HttpMessage<OrganizationEntity>[]
        | null,
): Promise<readonly {
    id: string;
    name: string;
}[]> {
    if (bootOrganizations !== null) {
        return organizationOptions(bootOrganizations);
    }
    const { sessionContext } = await import(
        './client.ts'
    );
    const { getOrganizations } = await import(
        '../../client/organizations.ts'
    );
    return organizationOptions(
        await getOrganizations(sessionContext()),
    );
}

async function loadHeaderStats(
): Promise<readonly HeaderStat[]> {
    const { sessionContext } = await import(
        './client.ts'
    );
    const { getDashboardStats } = await import(
        './dashboard.ts'
    );
    return getDashboardStats(sessionContext());
}

// Two or more organizations: the select replaces the
// name and the stat tiles follow it. One organization:
// the name stays text. None: the control is empty.
// The mobile header gets the same control and no
// tiles. An unscoped session never calls this, so
// #header-stats stays empty and .header-info:empty
// keeps hiding it.
export async function mutateHeaderInfo(
    bootOrganizations:
        readonly HttpMessage<OrganizationEntity>[]
        | null = null,
): Promise<void> {
    const { sessionContext } = await import(
        './client.ts'
    );
    const identity = sessionContext().identity;
    const [organizations, stats] = await Promise.all([
        loadOrganizationOptions(bootOrganizations),
        loadHeaderStats(),
    ]);
    const control = currentOrganizationControlHtml(
        organizations,
    );
    const statsEl = $('#header-stats', document);
    if (statsEl) {
        setHtml(
            statsEl,
            headerStatsHtml(control, stats),
        );
    }
    const mobileEl = $(
        '#mobile-header-organization',
        document,
    );
    if (mobileEl) setHtml(mobileEl, control);
    if (shouldShowOrganizationSwitcher(
        organizations,
    )) {
        wireOrganizationSwitcher(
            identity.organization ?? '',
        );
    }
}
```

In `web-app/app/layout.ts`, stop passing the boot list
to the chip and pass it to the header. Replace the
comment and the widget list:

```typescript
    // The identity-scoped widgets — the member chip
    // name and the invitations bell — render for any
    // logged-in visitor, even a zero-membership
    // identity on its invitations page. The header
    // strip is organization-scoped, so it joins only
    // for a scoped session. On an auth-exempt page
    // with no logged-in visitor the holder is the
    // anonymous seed, so we skip every read rather
    // than fire one that 401s 'anonymous principal'
    // or throws 'no active organization'.
    if (getClient().sessionIsAuthenticated()) {
        // Each widget settles independently. A denial
        // of the header's organization reads must not
        // suppress the invitations bell. allSettled
        // keeps one widget's denial from suppressing
        // the others; rejections are logged, never
        // swallowed.
        const widgets: Array<Promise<void>> = [
            mutateSidebarMember(),
            mutateInvitationsBell(),
        ];
        if (getClient().sessionIsOrganizationScoped()) {
            widgets.push(
                mutateHeaderInfo(bootOrganizations),
            );
        }
```

Leave the `Promise.allSettled` loop that follows
unchanged.

In `web-app/app/styles/layout.css`, after the
`.mobile-header-title` rule, add:

```css
#mobile-header-organization:empty {
    display: none;
}
```

Replace
`web-app/app/styles/components-organization-switcher.css`
with:

```css
/* Current-organization menu: a native select, shown
    only when the caller can reach two or more
    organizations. */
.org-switcher {
    margin-left: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    background-color: hsl(var(--secondary));
    color: hsl(var(--foreground));
    font: inherit;
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
}

.org-switcher:focus-visible {
    outline: 2px solid hsl(var(--ring, var(--border)));
    outline-offset: 2px;
}

#header-stats .org-switcher,
#mobile-header-organization .org-switcher {
    margin-left: 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run the focused gate with
`FILE=tests/account-chrome-placement.test.ts`.
Then run it again with
`FILE=tests/header-organization.test.ts` and
`FILE=tests/sidebar-member.test.ts`.

Expected: PASS for all three.

- [ ] **Step 5: Run the commit gate**

Run `./test validate` as in Gates.

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/account-chrome-placement.test.ts \
    web-app/app/header-info.ts \
    web-app/app/sidebar-member.ts \
    web-app/app/layout.ts \
    web-app/app/component-sidebar.html \
    web-app/app/component-mobile-sidebar.html \
    web-app/app/component-mobile-header.html \
    web-app/app/styles/layout.css \
    web-app/app/styles/components-organization-switcher.css
git commit -F - <<'MSG'
Host the organization control in headers

Co-Authored-By: Grok 4.7 <noreply@xAI>
Co-authored-by: Tom Mornini <tmornini@users.noreply.github.com>
MSG
```

---

### Task 5: Put Sign out last in both headers

**Files:**
- Modify: `tests/account-chrome-placement.test.ts`
- Modify: `web-app/app/component-top-bar.html`
- Modify: `web-app/app/component-mobile-header.html`
- Modify: `web-app/app/component-sidebar.html`
- Modify: `web-app/app/component-mobile-sidebar.html`
- Modify: `web-app/app/layout.ts`
- Modify: `web-app/app/styles/layout.css`

Do not change the body of `initSignOut`. It already
calls `postSessionLogout(sessionContext())`, logs a
failed revoke, and calls `navigateTo('auth')` in
`finally`.

- [ ] **Step 1: Write the failing test**

Append these tests to
`tests/account-chrome-placement.test.ts`.

```typescript
function count(src: string, needle: string): number {
    return src.split(needle).length - 1;
}

Deno.test(
    'Sign out is the last control in both headers',
    () => {
        const top = read(
            'web-app/app/component-top-bar.html',
        );
        const mobile = read(
            'web-app/app/component-mobile-header.html',
        );
        assertStrictEquals(count(top, 'data-signout'), 1);
        assertStrictEquals(
            count(mobile, 'data-signout'), 1,
        );
        assertMatch(top, />Sign out</);
        assertMatch(mobile, />Sign out</);
        assert(
            at(top, 'invitations-bell')
            < at(top, 'data-signout'),
        );
        assert(
            at(mobile, 'mobile-sidebar-open')
            < at(mobile, 'mobile-header-title'),
        );
        assert(
            at(mobile, 'mobile-header-title')
            < at(mobile, 'mobile-header-organization'),
        );
        assert(
            at(mobile, 'mobile-header-organization')
            < at(mobile, 'mobile-search-toggle'),
        );
        assert(
            at(mobile, 'mobile-search-toggle')
            < at(mobile, 'data-signout'),
        );
    },
);

Deno.test(
    'Sign out leaves both sidebars',
    () => {
        const desktop = read(
            'web-app/app/component-sidebar.html',
        );
        const mobile = read(
            'web-app/app/'
            + 'component-mobile-sidebar.html',
        );
        assertStrictEquals(
            count(desktop, 'data-signout'), 0,
        );
        assertStrictEquals(
            count(mobile, 'data-signout'), 0,
        );
        assertStrictEquals(
            desktop.includes('sidebar-signout'),
            false,
        );
        assertStrictEquals(
            mobile.includes('sidebar-signout'),
            false,
        );
        const css = read(
            'web-app/app/styles/layout.css',
        );
        assertStrictEquals(
            css.includes('sidebar-signout'),
            false,
        );
    },
);

Deno.test(
    'Sign out still revokes and then opens auth',
    () => {
        const src = read('web-app/app/layout.ts');
        assertMatch(
            src,
            /postSessionLogout\(sessionContext\(\)\)/,
        );
        assertMatch(
            src,
            /log\.warn\('sign-out revoke failed'/,
        );
        assertMatch(src, /finally \{/);
        assertMatch(src, /navigateTo\('auth'\)/);
        assertMatch(src, /\$\$\('\[data-signout\]'/);
    },
);
```

The first test of this file, from Task 4, still
expects `data-signout` in both sidebars. Change
those two `assertMatch(..., /data-signout/)` lines
to:

```typescript
        assertStrictEquals(
            desktop.includes('data-signout'),
            false,
        );
        assertStrictEquals(
            mobile.includes('data-signout'),
            false,
        );
```

- [ ] **Step 2: Run the test to verify it fails**

Run the focused gate with
`FILE=tests/account-chrome-placement.test.ts`.

Expected: FAIL. `component-top-bar.html` has no
`data-signout`.

- [ ] **Step 3: Write the minimal implementation**

In `web-app/app/component-top-bar.html`, make this
the last child of `.header-actions`, after the
invitations bell:

```html
                        <button
                            type="button"
                            class="btn btn-ghost
                                btn-sm"
                            data-signout
                        >Sign out</button>
```

In `web-app/app/component-mobile-header.html`, make
the same button the last child of `.header-actions`,
after `#mobile-search-toggle`.

Delete the Sign out `<button ... data-signout>`
element from `web-app/app/component-sidebar.html` and
from `web-app/app/component-mobile-sidebar.html`,
including its svg. The footer in each file ends with
the `.sidebar-member` chip.

In `web-app/app/styles/layout.css`, delete:

```css
.sidebar-collapsed .sidebar-signout-text { display: none; }
.sidebar-collapsed .sidebar-signout { justify-content: center; }
```

and:

```css
/* Sidebar sign-out link */
.sidebar-signout {
    justify-content: flex-start;
    color: hsl(var(--muted-foreground));
}
```

Replace the `initSignOut` comment in
`web-app/app/layout.ts`. Leave the function body
character for character.

```typescript
// Bind every [data-signout] control. The desktop top
// bar and the mobile header each carry one, last in
// .header-actions. The server revoke is best-effort:
// postSessionLogout always scrubs the local session
// in its finally, so we navigate to the login page
// regardless — a failed revoke is logged, never a
// reason to strand the user.
```

- [ ] **Step 4: Run the test to verify it passes**

Run the focused gate with
`FILE=tests/account-chrome-placement.test.ts`.

Expected: PASS.

- [ ] **Step 5: Run the commit gate**

Run `./test validate` as in Gates.

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/account-chrome-placement.test.ts \
    web-app/app/component-top-bar.html \
    web-app/app/component-mobile-header.html \
    web-app/app/component-sidebar.html \
    web-app/app/component-mobile-sidebar.html \
    web-app/app/layout.ts \
    web-app/app/styles/layout.css
git commit -F - <<'MSG'
Put Sign out last in both headers

Co-Authored-By: Grok 4.7 <noreply@xAI>
Co-authored-by: Tom Mornini <tmornini@users.noreply.github.com>
MSG
```

---

### Task 6: Hide stat tiles below 1024px

**Files:**
- Modify: `tests/account-chrome-placement.test.ts`
- Modify: `web-app/app/styles/layout.css`
- Read only: `web-app/app/styles/responsive.css`
- Read only: `web-app/app/component-top-bar.html`

- [ ] **Step 1: Write the failing test**

Append:

```typescript
Deno.test(
    'stat tiles hide below 1024 and the organization stays',
    () => {
        const css = read(
            'web-app/app/styles/layout.css',
        );
        assertStrictEquals(
            css.includes(
                '#header-stats { display: none; }',
            ),
            false,
        );
        assertMatch(
            css,
            new RegExp(
                '@media \\(max-width: 1023px\\)'
                + ' \\{\\s*'
                + '#header-stats \\.header-stat-item,'
                + '\\s*'
                + '#header-stats'
                + ' \\.header-stat-divider'
                + ' \\{\\s*'
                + 'display: none;\\s*\\}',
            ),
        );
        assertMatch(
            css,
            new RegExp(
                '\\.top-header'
                + ' \\{ display: none !important; \\}',
            ),
        );
        assertMatch(
            css,
            new RegExp(
                '@media \\(min-width: 768px\\)'
                + ' \\{\\s*'
                + '\\.mobile-header'
                + ' \\{ display: none !important; \\}',
            ),
        );
        const responsive = read(
            'web-app/app/styles/responsive.css',
        );
        assertMatch(
            responsive,
            new RegExp(
                '@media \\(max-width: 767px\\)'
                + ' \\{\\s*'
                + '\\.hidden-mobile'
                + ' \\{ display: none !important; \\}',
            ),
        );
        const top = read(
            'web-app/app/component-top-bar.html',
        );
        assertMatch(top, /id="header-stats"/);
        assertMatch(top, /hidden-mobile/);
    },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run the focused gate with
`FILE=tests/account-chrome-placement.test.ts`.

Expected: FAIL. `layout.css` still contains
`#header-stats { display: none; }`.

- [ ] **Step 3: Write the minimal implementation**

In `web-app/app/styles/layout.css`, replace:

```css
@media (max-width: 1023px) {
    #header-stats { display: none; }
}
```

with:

```css
@media (max-width: 1023px) {
    #header-stats .header-stat-item,
    #header-stats .header-stat-divider {
        display: none;
    }
}
```

Do not edit `responsive.css` or the 767px block.
`.hidden-mobile` on `#header-stats` stays, so the
desktop strip stays hidden below 768px. The top bar
stays `display: none` below 768px. The mobile header
stays `display: none` from 768px up. The organization
name is a `.header-stat-label` that is not inside
`.header-stat-item`, so this rule does not hide it.
The select is not a stat tile, so it stays too.

- [ ] **Step 4: Run the test to verify it passes**

Run the focused gate with
`FILE=tests/account-chrome-placement.test.ts`.

Expected: PASS.

- [ ] **Step 5: Run the commit gate**

Run `./test validate` as in Gates.

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/account-chrome-placement.test.ts \
    web-app/app/styles/layout.css
git commit -F - <<'MSG'
Hide stat tiles below 1024 pixels

Co-Authored-By: Grok 4.7 <noreply@xAI>
Co-authored-by: Tom Mornini <tmornini@users.noreply.github.com>
MSG
```

---

### Task 7: Render the default-organization select

**Files:**
- Create: `tests/default-organization-field.test.ts`
- Create: `web-app/app/default-organization-field.ts`

The placeholder label is `Choose a default organization`.
Its value is empty. It is not an organization. It is
present both when a default is stored and when it is
not. The stored organization is selected when there
is one. The placeholder is selected when the stored
id is null. Below two organizations the HTML is empty.
The select's class is `input`, never `org-switcher`.

- [ ] **Step 1: Write the failing test**

```typescript
import { assertMatch, assertNotMatch,
    assertStrictEquals } from '@std/assert';
import {
    defaultOrganizationSelectHtml,
} from '../web-app/app/default-organization-field.ts';

const STARK = {
    id: 'AjdvjuECVZEgZoFajaIEkg',
    name: 'Stark',
};
const WAYNE = {
    id: 'BBjWJsjYIDkTRKIIPrzWRw',
    name: 'Wayne',
};
const TWO = [STARK, WAYNE];

Deno.test(
    'the default select lists each organization',
    () => {
        const out = defaultOrganizationSelectHtml(
            TWO,
            WAYNE.id,
        ).toString();
        assertMatch(out, /class="card p-6"/);
        assertMatch(out, />Default organization</);
        assertMatch(
            out,
            /id="default-organization"/,
        );
        assertMatch(
            out,
            /aria-label="Default organization"/,
        );
        assertMatch(out, /class="input"/);
        assertMatch(
            out,
            /data-previous="BBjWJsjYIDkTRKIIPrzWRw"/,
        );
        assertMatch(
            out,
            /value="AjdvjuECVZEgZoFajaIEkg">Stark/,
        );
        assertMatch(
            out,
            /value="BBjWJsjYIDkTRKIIPrzWRw" selected/,
        );
        assertMatch(
            out,
            /value="">Choose a default organization/,
        );
        assertNotMatch(out, /value="" selected/);
        assertStrictEquals(
            out.includes('org-switcher'),
            false,
        );
    },
);

Deno.test(
    'a null default selects the placeholder',
    () => {
        const out = defaultOrganizationSelectHtml(
            TWO,
            null,
        ).toString();
        assertMatch(out, /data-previous=""/);
        assertMatch(out, /value="" selected/);
        assertMatch(
            out,
            /Choose a default organization/,
        );
        assertNotMatch(
            out,
            /value="AjdvjuECVZEgZoFajaIEkg" selected/,
        );
        assertNotMatch(
            out,
            /value="BBjWJsjYIDkTRKIIPrzWRw" selected/,
        );
    },
);

Deno.test(
    'the default select is empty below two organizations',
    () => {
        assertStrictEquals(
            defaultOrganizationSelectHtml([STARK], null)
                .toString(),
            '',
        );
        assertStrictEquals(
            defaultOrganizationSelectHtml([], null)
                .toString(),
            '',
        );
    },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run the focused gate with
`FILE=tests/default-organization-field.test.ts`.

Expected: FAIL. The module does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `web-app/app/default-organization-field.ts`:

```typescript
import { html, type SafeHtml } from './safe-html.ts';

const PLACEHOLDER = 'Choose a default organization';

interface OrganizationChoice {
    readonly id: string;
    readonly name: string;
}

export function defaultOrganizationSelectHtml(
    organizations: readonly OrganizationChoice[],
    storedId: string | null,
): SafeHtml {
    if (organizations.length < 2) return html``;
    const placeholder = storedId === null
        ? html`<option value="" selected>${
            PLACEHOLDER
        }</option>`
        : html`<option value="">${
            PLACEHOLDER
        }</option>`;
    const options = organizations.map(organization =>
        organization.id === storedId
            ? html`<option value="${
                organization.id
            }" selected>${
                organization.name
            }</option>`
            : html`<option value="${
                organization.id
            }">${organization.name}</option>`,
    );
    return html`<div class="card p-6">
<h3 class="${
    'font-display font-semibold mb-4'
}">Default organization</h3>
<select
    id="default-organization"
    class="input"
    aria-label="Default organization"
    data-previous="${storedId ?? ''}"
>${placeholder}${options}</select>
</div>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run the focused gate with
`FILE=tests/default-organization-field.test.ts`.

Expected: PASS.

- [ ] **Step 5: Run the commit gate**

Run `./test validate` as in Gates.

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/default-organization-field.test.ts \
    web-app/app/default-organization-field.ts
git commit -F - <<'MSG'
Render the default-organization select

Co-Authored-By: Grok 4.7 <noreply@xAI>
Co-authored-by: Tom Mornini <tmornini@users.noreply.github.com>
MSG
```

---

### Task 8: Omit the field when a read fails

**Files:**
- Modify: `tests/default-organization-field.test.ts`
- Modify: `web-app/app/default-organization-field.ts`

`getIdentityDefaultOrganization` returns `null` on
404 and throws otherwise. This task's reader treats
a resolved `null` as the placeholder and a throw as
"omit the field". It does not call the client. The
page passes the client in Task 10.

- [ ] **Step 1: Write the failing test**

Replace the import with:

```typescript
import {
    defaultOrganizationSelectHtml,
    readDefaultOrganizationField,
} from '../web-app/app/default-organization-field.ts';
```

Append:

```typescript
const PAGE = 'pnXmXrxOWayANgDLdCjuBw';
const OTHER = 'syWUUcdBSbBgMwBiCrgbDw';

Deno.test(
    'another identity gets no default field',
    async () => {
        let calls = 0;
        const out = await readDefaultOrganizationField(
            OTHER,
            PAGE,
            () => {
                calls += 1;
                return Promise.resolve(TWO);
            },
            () => {
                calls += 1;
                return Promise.resolve(STARK.id);
            },
            () => {
                calls += 1;
            },
        );
        assertStrictEquals(out.toString(), '');
        assertStrictEquals(calls, 0);
    },
);

Deno.test(
    'a failed organization read omits the field',
    async () => {
        const seen: unknown[] = [];
        let storedCalls = 0;
        const out = await readDefaultOrganizationField(
            PAGE,
            PAGE,
            () => Promise.reject(
                new Error('organizations failed'),
            ),
            () => {
                storedCalls += 1;
                return Promise.resolve(null);
            },
            err => {
                seen.push(err);
            },
        );
        assertStrictEquals(out.toString(), '');
        assertStrictEquals(storedCalls, 0);
        assertStrictEquals(seen.length, 1);
        const organizationErr = seen[0];
        if (!(organizationErr instanceof Error)) {
            throw new Error('expected an Error');
        }
        assertStrictEquals(
            organizationErr.message,
            'organizations failed',
        );
    },
);

Deno.test(
    'a failed default read omits the field',
    async () => {
        const seen: unknown[] = [];
        const out = await readDefaultOrganizationField(
            PAGE,
            PAGE,
            () => Promise.resolve(TWO),
            () => Promise.reject(
                new Error('default failed'),
            ),
            err => {
                seen.push(err);
            },
        );
        assertStrictEquals(out.toString(), '');
        assertStrictEquals(seen.length, 1);
        const defaultErr = seen[0];
        if (!(defaultErr instanceof Error)) {
            throw new Error('expected an Error');
        }
        assertStrictEquals(
            defaultErr.message,
            'default failed',
        );
    },
);

Deno.test(
    'a null stored default is the placeholder',
    async () => {
        const out = await readDefaultOrganizationField(
            PAGE,
            PAGE,
            () => Promise.resolve(TWO),
            () => Promise.resolve(null),
            () => {
                throw new Error('warn was called');
            },
        );
        assertMatch(out.toString(), /value="" selected/);
    },
);

Deno.test(
    'a stored id is selected for the session identity',
    async () => {
        const out = await readDefaultOrganizationField(
            PAGE,
            PAGE,
            () => Promise.resolve(TWO),
            () => Promise.resolve(STARK.id),
            () => {
                throw new Error('warn was called');
            },
        );
        assertMatch(
            out.toString(),
            /value="AjdvjuECVZEgZoFajaIEkg" selected/,
        );
    },
);

Deno.test(
    'one organization omits the default field',
    async () => {
        const out = await readDefaultOrganizationField(
            PAGE,
            PAGE,
            () => Promise.resolve([STARK]),
            () => Promise.resolve(null),
            () => {
                throw new Error('warn was called');
            },
        );
        assertStrictEquals(out.toString(), '');
    },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run the focused gate with
`FILE=tests/default-organization-field.test.ts`.

Expected: FAIL. The module does not export
`readDefaultOrganizationField`.

- [ ] **Step 3: Write the minimal implementation**

Append to `web-app/app/default-organization-field.ts`:

```typescript
// Only the session identity's own page gets a field.
// readStored resolves null when the default was never
// set, which is how the client maps that 404. A throw
// from either read omits the field and warns.
export async function readDefaultOrganizationField(
    pageIdentityId: string,
    sessionIdentityId: string,
    readOrganizations: () => Promise<
        readonly OrganizationChoice[]
    >,
    readStored: () => Promise<string | null>,
    warn: (err: unknown) => void,
): Promise<SafeHtml> {
    if (pageIdentityId !== sessionIdentityId) {
        return html``;
    }
    let organizations: readonly OrganizationChoice[];
    try {
        organizations = await readOrganizations();
    } catch (err) {
        warn(err);
        return html``;
    }
    let storedId: string | null;
    try {
        storedId = await readStored();
    } catch (err) {
        warn(err);
        return html``;
    }
    return defaultOrganizationSelectHtml(
        organizations,
        storedId,
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run the focused gate with
`FILE=tests/default-organization-field.test.ts`.

Expected: PASS, including the Task 7 tests.

- [ ] **Step 5: Run the commit gate**

Run `./test validate` as in Gates.

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/default-organization-field.test.ts \
    web-app/app/default-organization-field.ts
git commit -F - <<'MSG'
Omit the default field when a read fails

Co-Authored-By: Grok 4.7 <noreply@xAI>
Co-authored-by: Tom Mornini <tmornini@users.noreply.github.com>
MSG
```

---

### Task 9: Write the default without switching

**Files:**
- Modify: `tests/default-organization-field.test.ts`
- Modify: `web-app/app/default-organization-field.ts`

A change to an organization id calls the injected
`put` with that id. Success keeps the new value,
stores it on `data-previous`, and toasts
`Set as your default organization.` Failure puts the
select back to `data-previous` and toasts
`Could not set the default organization.` A change
to the empty placeholder writes nothing, toasts
nothing, and puts the select back. The function does
not read or write `ACTIVE_ORGANIZATION_ID` and does
not reload.

- [ ] **Step 1: Write the failing test**

Add `commitDefaultOrganization` to the import. Append:

```typescript
import {
    ACTIVE_ORGANIZATION_ID,
} from '../client/organization-session.ts';

interface FakeSelect {
    value: string;
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
}

function fakeSelect(
    value: string,
    previous: string,
): FakeSelect & { readonly attrs: Map<string, string> } {
    const attrs = new Map<string, string>([
        ['data-previous', previous],
    ]);
    return {
        value,
        attrs,
        getAttribute(name: string): string | null {
            return attrs.get(name) ?? null;
        },
        setAttribute(name: string, next: string): void {
            attrs.set(name, next);
        },
    };
}

Deno.test(
    'a default change writes and keeps the value',
    async () => {
        const select = fakeSelect(WAYNE.id, STARK.id);
        const puts: string[] = [];
        const toasts: string[] = [];
        localStorage.setItem(
            ACTIVE_ORGANIZATION_ID, 'KEEP',
        );
        await commitDefaultOrganization(
            select,
            async organization => {
                puts.push(organization);
            },
            (message, tone) => {
                toasts.push(tone + ':' + message);
            },
        );
        assertStrictEquals(puts.join(','), WAYNE.id);
        assertStrictEquals(select.value, WAYNE.id);
        assertStrictEquals(
            `${select.getAttribute('data-previous')}`,
            WAYNE.id,
        );
        assertStrictEquals(
            toasts.join('|'),
            'success:Set as your default organization.',
        );
        assertStrictEquals(
            localStorage.getItem(
                ACTIVE_ORGANIZATION_ID,
            ),
            'KEEP',
        );
    },
);

Deno.test(
    'a failed default write restores and toasts',
    async () => {
        const select = fakeSelect(WAYNE.id, STARK.id);
        const toasts: string[] = [];
        await commitDefaultOrganization(
            select,
            () => Promise.reject(new Error('put failed')),
            (message, tone) => {
                toasts.push(tone + ':' + message);
            },
        );
        assertStrictEquals(select.value, STARK.id);
        assertStrictEquals(
            `${select.getAttribute('data-previous')}`,
            STARK.id,
        );
        assertStrictEquals(
            toasts.join('|'),
            'error:Could not set the default organization.',
        );
    },
);

Deno.test(
    'the placeholder does not write',
    async () => {
        const select = fakeSelect('', STARK.id);
        let puts = 0;
        let toasts = 0;
        await commitDefaultOrganization(
            select,
            () => {
                puts += 1;
                return Promise.resolve();
            },
            () => {
                toasts += 1;
            },
        );
        assertStrictEquals(puts, 0);
        assertStrictEquals(toasts, 0);
        assertStrictEquals(select.value, STARK.id);
        assertStrictEquals(
            `${select.getAttribute('data-previous')}`,
            STARK.id,
        );
    },
);

Deno.test(
    'the default field does not switch or reload',
    () => {
        const src = Deno.readTextFileSync(
            'web-app/app/default-organization-field.ts',
        );
        assertStrictEquals(
            src.includes('ACTIVE_ORGANIZATION_ID'),
            false,
        );
        assertStrictEquals(
            src.includes('putPreference'),
            false,
        );
        assertStrictEquals(
            src.includes('reload'),
            false,
        );
        assertStrictEquals(
            src.includes('location'),
            false,
        );
    },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run the focused gate with
`FILE=tests/default-organization-field.test.ts`.

Expected: FAIL. The module does not export
`commitDefaultOrganization`.

- [ ] **Step 3: Write the minimal implementation**

Append to `web-app/app/default-organization-field.ts`.
Do not import `ACTIVE_ORGANIZATION_ID`,
`putPreference`, or anything that names `location`
or `reload`.

```typescript
export interface DefaultOrganizationSelect {
    value: string;
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
}

const SUCCESS_TOAST =
    'Set as your default organization.';
const FAILURE_TOAST =
    'Could not set the default organization.';

export async function commitDefaultOrganization(
    select: DefaultOrganizationSelect,
    put: (organization: string) => Promise<void>,
    toast: (
        message: string,
        tone: 'success' | 'error',
    ) => void,
): Promise<void> {
    const previous = select.getAttribute(
        'data-previous',
    ) ?? '';
    const next = select.value;
    if (next === '') {
        select.value = previous;
        return;
    }
    try {
        await put(next);
    } catch {
        select.value = previous;
        toast(FAILURE_TOAST, 'error');
        return;
    }
    select.setAttribute('data-previous', next);
    toast(SUCCESS_TOAST, 'success');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run the focused gate with
`FILE=tests/default-organization-field.test.ts`.

Expected: PASS.

- [ ] **Step 5: Run the commit gate**

Run `./test validate` as in Gates.

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/default-organization-field.test.ts \
    web-app/app/default-organization-field.ts
git commit -F - <<'MSG'
Write the default without switching

Co-Authored-By: Grok 4.7 <noreply@xAI>
Co-authored-by: Tom Mornini <tmornini@users.noreply.github.com>
MSG
```

---

### Task 10: Mount the field on identity detail

**Files:**
- Modify: `tests/presenter-identity-detail.test.ts`
- Create: `tests/identity-detail-default-organization.test.ts`
- Modify: `web-app/app/presenters/identity-detail.ts`
- Modify: `web-app/identities/detail.ts`

The page calls `readDefaultOrganizationField` with
`getOrganizations` and `getIdentityDefaultOrganization`.
A warning uses `log.warn` and the message
`default organization field omitted`. A change calls
`commitDefaultOrganization` with
`putIdentityDefaultOrganization(sessionContext(), organization)`.
`refresh` reads the field again. The listener is on
the page container, so a replaced select still
commits. The field is not a `.org-switcher`, so
`wireOrganizationSwitcher` does not bind it.

- [ ] **Step 1: Write the failing test**

In `tests/presenter-identity-detail.test.ts`, replace
the presenter import and add the SafeHtml import:

```typescript
import {
    IdentityDetailPresenter,
    type IdentityDetailView,
} from '../web-app/app/presenters/identity-detail.ts';
import { html, type SafeHtml } from
    '../web-app/app/safe-html.ts';
```

Change `personPresenter` to take an optional field:

```typescript
function personPresenter(
    defaultOrganization?: SafeHtml,
) {
    const view: IdentityDetailView = {
        identity: new Identity({
            id: 'pnXmXrxOWayANgDLdCjuBw', kind: 'person',
        }),
        pii: {
            erased: false,
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            phone: '555-0100',
            bio: 'First programmer.',
            message: responseMessage<IdentityPiiEntity>({
                id: 'pnXmXrxOWayANgDLdCjuBw',
                name: 'Ada Lovelace',
                email: 'ada@example.com',
                phone: '555-0100',
                bio: 'First programmer.',
            }),
        },
        service: { named: false },
        registration: { registered: false as const },
    };
    if (defaultOrganization === undefined) {
        return new IdentityDetailPresenter(view);
    }
    return new IdentityDetailPresenter({
        ...view,
        defaultOrganization,
    });
}
```

Append:

```typescript
Deno.test(
    'the card stack omits an absent default field',
    () => {
        const rec = makeRecordingContainer();
        personPresenter().renderShell(rec.container);
        const out = rec.allHtml();
        assertMatch(out, /Personal Information/);
        assertStrictEquals(
            out.includes('default-organization'),
            false,
        );
    },
);

Deno.test(
    'an empty default field is left out of the cards',
    () => {
        const rec = makeRecordingContainer();
        personPresenter(html``)
            .renderShell(rec.container);
        assertStrictEquals(
            rec.allHtml().includes(
                'default-organization',
            ),
            false,
        );
    },
);

Deno.test(
    'the card stack appends the default field',
    () => {
        const rec = makeRecordingContainer();
        personPresenter(html`<select
            id="default-organization"
        ></select>`).renderShell(rec.container);
        const out = rec.allHtml();
        const links = out.indexOf('Connections');
        const field = out.indexOf(
            'default-organization',
        );
        assert(links >= 0);
        assert(field > links);
    },
);

Deno.test(
    'a service card stack keeps the default field',
    () => {
        const rec = makeRecordingContainer();
        new IdentityDetailPresenter({
            identity: new Identity({
                id: 'syWUUcdBSbBgMwBiCrgbDw',
                kind: 'service',
            }),
            pii: { erased: true },
            service: { named: false },
            registration: {
                registered: false as const,
            },
            defaultOrganization: html`<select
                id="default-organization"
            ></select>`,
        }).renderShell(rec.container);
        const out = rec.allHtml();
        assertMatch(out, /Client registration/);
        assertMatch(
            out, /id="default-organization"/,
        );
    },
);
```

Add `assert` to the `@std/assert` import if it is
not already there.

Create
`tests/identity-detail-default-organization.test.ts`:

```typescript
import { assertMatch, assertStrictEquals } from
    '@std/assert';

Deno.test(
    'identity detail reads and commits the default',
    () => {
        const src = Deno.readTextFileSync(
            'web-app/identities/detail.ts',
        );
        assertMatch(
            src, /readDefaultOrganizationField/,
        );
        assertMatch(src, /getOrganizations\(ctx\)/);
        assertMatch(
            src, /getIdentityDefaultOrganization\(ctx\)/,
        );
        assertMatch(
            src,
            /log\.warn\(\s*'default organization field omitted'/,
        );
        assertMatch(src, /commitDefaultOrganization/);
        assertMatch(
            src,
            new RegExp(
                'putIdentityDefaultOrganization\\('
                + '\\s*sessionContext\\(\\),'
                + '\\s*organization,?\\s*\\)',
            ),
        );
        assertMatch(
            src, /defaultOrganizationHtml\(currentId\)/,
        );
        assertStrictEquals(
            src.includes('ACTIVE_ORGANIZATION_ID'),
            false,
        );
        assertStrictEquals(
            src.includes('reload'),
            false,
        );
        assertStrictEquals(
            src.includes('org-switcher'),
            false,
        );
    },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run the focused gate with
`FILE='tests/presenter-identity-detail.test.ts tests/identity-detail-default-organization.test.ts'`.

Expected: FAIL. The presenter ignores
`defaultOrganization`, so the append test does not
find the id after `Connections`. The page source does
not mention `readDefaultOrganizationField`.

- [ ] **Step 3: Write the minimal implementation**

In `web-app/app/presenters/identity-detail.ts`, add
`defaultOrganization` to the view:

```typescript
export interface IdentityDetailView {
    readonly identity: Identity;
    readonly pii: MemberPii;
    readonly service: ServiceFacet;
    readonly registration: ClientRegistration;
    readonly defaultOrganization?: SafeHtml;
}
```

`SafeHtml` is already imported in that file. Add:

```typescript
function identityCardsHtml(
    view: IdentityDetailView,
): SafeHtml {
    const cards = view.identity.isPerson()
        ? html`${buildPersonalInfoCard(view)}${
            buildLinksCard(view)}`
        : html`${buildRegistrationCard(view)}${
            buildLinksCard(view)}`;
    const field = view.defaultOrganization;
    if (
        field === undefined
        || field.toString() === ''
    ) return cards;
    return html`${cards}${field}`;
}
```

In `renderUpdate`, replace the `.identity-cards-slot`
`mutateSlot` call's third argument with
`identityCardsHtml(this.#view)`.

In `web-app/identities/detail.ts`, extend the client
import and add:

```typescript
import {
    getIdentity,
    getMemberPii,
    getServiceFacet,
    deleteIdentityPii,
    getClientRegistration,
    putClientRegistration,
    deleteClientRegistration,
    subscribeIdentityChanges,
    getOrganizations,
    getIdentityDefaultOrganization,
    putIdentityDefaultOrganization,
    type ServiceFacet,
    type ClientRegistration,
} from '../../client/index.ts';
import {
    commitDefaultOrganization,
    readDefaultOrganizationField,
} from '../app/default-organization-field.ts';
```

Add this function above `init`:

```typescript
async function defaultOrganizationHtml(
    pageIdentityId: string,
) {
    const ctx = sessionContext();
    return readDefaultOrganizationField(
        pageIdentityId,
        ctx.identity.id,
        async () => {
            const messages = await getOrganizations(ctx);
            return messages.map(message => {
                const organization =
                    message.body().toValue();
                return {
                    id: organization.id,
                    name: organization.name,
                };
            });
        },
        () => getIdentityDefaultOrganization(ctx),
        err => {
            log.warn(
                'default organization field omitted',
                'identities',
                err,
            );
        },
    );
}
```

Replace the `onData` callback:

```typescript
        onData: async loaded => {
            lastLoaded = loaded;
            new IdentityDetailPresenter({
                ...buildView(loaded),
                defaultOrganization:
                    await defaultOrganizationHtml(
                        loaded.identity.idForLink(),
                    ),
            }).renderShell(container);
            bindListeners(container);
            subscribeIdentityChanges(
                () => void refresh(),
            );
        },
```

Replace the body of `refresh` after the guard:

```typescript
    const loaded = await loadIdentity(currentId);
    lastLoaded = loaded;
    new IdentityDetailPresenter({
        ...buildView(loaded),
        defaultOrganization:
            await defaultOrganizationHtml(currentId),
    }).renderUpdate(pageContainer);
```

At the end of `bindListeners`, before the function
closes, add:

```typescript
    container.addEventListener(
        'change',
        event => {
            const target = event.target;
            if (!(
                target instanceof HTMLSelectElement
            )) return;
            if (target.id !== 'default-organization') {
                return;
            }
            void commitDefaultOrganization(
                target,
                organization =>
                    putIdentityDefaultOrganization(
                        sessionContext(),
                        organization,
                    ),
                (message, tone) => {
                    showToast(message, tone);
                },
            );
        },
        { signal },
    );
```

Do not call `wireOrganizationSwitcher` from this
page. Do not write `ACTIVE_ORGANIZATION_ID`. Do not
call `location.reload` or `navigateTo` from the
change listener.

- [ ] **Step 4: Run the test to verify it passes**

Run the focused gate with
`FILE='tests/presenter-identity-detail.test.ts tests/identity-detail-default-organization.test.ts tests/default-organization-field.test.ts'`.

Expected: PASS.

- [ ] **Step 5: Run the commit gate**

Run `./test validate` as in Gates.

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/presenter-identity-detail.test.ts \
    tests/identity-detail-default-organization.test.ts \
    web-app/app/presenters/identity-detail.ts \
    web-app/identities/detail.ts
git commit -F - <<'MSG'
Mount the default field on identity

Co-Authored-By: Grok 4.7 <noreply@xAI>
Co-authored-by: Tom Mornini <tmornini@users.noreply.github.com>
MSG
```

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| Chip stays in both sidebars and shows the session name | 4 |
| Chip opens identity-detail for `ctx.identity.id` | 2, 4 |
| Member-detail navigation from the chip goes away | 2 |
| Organization line removed from both sidebars | 4 |
| Both organization menus leave the sidebars | 4 |
| Sign out leaves the sidebars | 5 |
| Collapsed sidebar still shows the avatar and hides the name | 4 |
| Sign out is the last control in both `.header-actions` | 5 |
| Label is "Sign out" | 5 |
| Revoke, log a failed revoke, then `navigateTo('auth')` | 5 |
| Switcher select has accessible name "Switch organization" | 1, 3 |
| Switcher is empty below two organizations | 1, 3 |
| Switcher no longer renders `.org-set-default` | 1 |
| `wireOrganizationSwitcher` wires every `.org-switcher` and does not look for `.org-set-default` | 1, 4 |
| Change still reloads through `switchToOrganization`, including the convert redirect | 1 (function untouched; existing tests stay) |
| Desktop host is `#header-stats`; select replaces the name; tiles follow | 3, 4 |
| One organization shows the name as text | 3, 4 |
| No organization scope leaves the strip empty | 4 (`sessionIsOrganizationScoped` gate; `:empty` rule already hides it) |
| Below 1024px, stat tiles hide and the organization control does not | 6 |
| The `max-width: 1023px` rule that hides all of `#header-stats` goes away | 6 |
| From 768px up the desktop control is visible; below 768px the top bar is hidden | 6 |
| Mobile order: menu, title, organization, search, Sign out | 4, 5 |
| Mobile uses the same one-organization and many-organization rules | 4 |
| Only one header is visible at a time | 6 |
| Default field only when the loaded identity is the session identity and there are two or more organizations | 7, 8, 10 |
| Another identity's page has no field | 8, 10 |
| Accessible name "Default organization" | 7 |
| Stored id selected; null stored id selects the empty placeholder | 7, 8 |
| Placeholder is not an organization and does not write | 7, 9 |
| A written default is not cleared | 9 (placeholder restores; no clear control) |
| Change calls `putIdentityDefaultOrganization` and does not switch or reload | 9, 10 |
| Success toast "Set as your default organization." and the value stays | 9 |
| Failure restores the previous value and toasts "Could not set the default organization." | 9 |
| Organizations from `getOrganizations`; stored default from `getIdentityDefaultOrganization` | 10 |
| 404 is an unset default (client returns null; reader treats null as the placeholder) | 8, 10 |
| Any other failure of either read omits the field, logs a warning, and the rest of the page still renders | 8, 10 |
| Browser `[data-signout]` and `#sidebar-member-name` stay valid | 4, 5 |
| Stat tiles, invitations bell, and search are not redesigned | 3 copies the existing tile markup; 5 only appends Sign out |

Non-goals checked: no new route, no clear control,
the default menu is not shown for someone else's
identity, reachable organizations and switch
persistence are unchanged (`switchToOrganization`
and `ACTIVE_ORGANIZATION_ID` stay the switch path),
and Sign out, the organization line, and both menus
are not put back in the sidebar footer.

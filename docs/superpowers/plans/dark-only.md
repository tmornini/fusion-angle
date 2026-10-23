# Dark Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make today's `data-theme="dark"` appearance the app's only
appearance, and delete light mode, system mode, the toggle, and every
trace of them.

**Architecture:** First flatten the CSS so that the dark values ARE
the base values: one unconditioned `:root` palette, with each dark
component override folded into its owning rule. The app is then dark
whatever the toggle says. Then remove the toggle UI, the theme state,
the stored preference, and the theme pre-paint. Then rename the three
files whose names went wrong, one rename-only commit each. Docs come
last.

**Tech Stack:** Plain CSS concatenated by `bin/build-lib`, TypeScript
under Deno 2.9.x (`deno check`, `deno test`, `deno bundle`), and
`Deno.test` + `@std/assert`.

**Spec:** `docs/superpowers/specs/dark-only-design.md`. Executors read
the spec before their task.

## Global Constraints

- Work in `/Users/tmornini/code/fusion-angle/.worktrees/dark-only`
  (branch `dark-only`). Never create another worktree. Never pass
  `isolation`. Never run `./deploy --render`.
- Sandbox: `export DENO_DIR="$TMPDIR/deno-dir"` before any `deno`,
  `./test`, or `./deploy`.
- Every commit is green under `./test validate`. A test edit rides in
  the commit whose product change needs it. `deno check` covers
  `tests/`, so a test importing a removed symbol is red at once.
- `deno.json` sets `noUnusedLocals: true`. Every removal also drops
  the imports it leaves unused, in sources and tests alike.
- One concern per commit. The subject is one present-tense
  imperative line of about 50 chars, with no body beyond the
  trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- A rename never shares a commit with a content change to the
  renamed file. Referrers' path updates ride in the rename commit,
  because the commit is not green without them. `git diff --cached
  -M --stat` must show `R100`.
- 78-char lines in linted files (code, CSS, scripts; not `.md`).
  4-space indent. No inline styles.
- No dark color changes beyond the deviations listed in Task 24
  (the spec's three contests plus three this plan found: the
  design-system do/don't card borders, the now-animating shimmer,
  and a mouse-focused select's glow).
- No code reads, writes, or clears `fusion-angle:theme`. Write no
  migration code and no "no theme vestiges" guard test.
- The favicon (`web-app/assets/favicon.svg`, with its
  `prefers-color-scheme`) and its test stay. `iconMonitor` stays.
  `measure-viz.ts`'s `data-mode` stays.
- Historical `docs/superpowers/` specs, plans, and mitigations stay
  untouched.
- Line numbers below were read at `cb904245`. Earlier tasks shift
  them, so anchor every edit on the quoted text.

Single-file test command (the `./test` preloads), shown here as
`<test>`:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write --allow-net \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    --preload ./tests/worker-name-prefix.ts \
    <files>
```

## Review Focus

No layer-1 or layer-2 test pins any of these. The spec and Tom rule
out new guard tests, so each one is checked by hand in Task 24.

1. **Reload with the sidebar collapsed.** Collapse it, reload: the
   page paints collapsed, with no expand-then-collapse flash, on
   all four page shells. This covers Tasks 12 and 20: a wrong
   bundle name or `<script src>` would pass every gate.
2. **A browser holding `fusion-angle:theme=light`, or an OS in
   light mode.** The app paints dark, logs no error, and shows no
   toast. Only the favicon follows the OS.
3. **Cross-tab sidebar sync.** Collapsing in tab 1 still collapses
   tab 2, now that the theme branch of the storage listener is
   gone (Task 13).
4. **The workbox "create work order" dropdown.** It opens and
   closes on outside click after the `initDropdown`
   move and the `closeAllDropdowns` deletion (Tasks 11 and 19).
5. **Header layout without the toggle.** `.header-actions` keeps
   its spacing and alignment on desktop and mobile widths.

---

## Phase 1: Flatten the CSS (the app is dark at every step)

S = `web-app/app/styles`. Verified in recon: `dark-mode.css`
reassigns all 59 properties that `light-mode.css` sets. Its one extra
property, `--background-subtle`, is read by nothing and is dropped.

### Task 1: Fix the color scheme to dark — `coder`

**Files:** Modify `S/base.css:16`, `S/dark-mode.css:4`

- [ ] In `base.css`, change `color-scheme: light;` on `html` to
  `color-scheme: dark;`.
- [ ] In `dark-mode.css`, delete `color-scheme: dark;`.
- [ ] Run `./test validate`. Expected: green.
- [ ] Commit: `Fix the color scheme to dark`

### Task 2: Give the palette its dark values — `planner`

**Files:** Modify `S/light-mode.css:1-112`, `S/dark-mode.css:1-91`

- [ ] In `light-mode.css`, replace every custom-property value with
  its counterpart in `dark-mode.css:5-90`. Keep the property order
  and grouping. Do not add `--background-subtle`.
- [ ] Rewrite the comments that state light-only facts:
  - `:1` → `/* Semantic HSL assignments. */`
  - `:34-36`: change the accent contrast figure to the dark value.
  - `:49-53`: rewrite the Status Success comment for the dark
    values, and drop "(mirrors dark mode's idiom)".
  - `:85`: drop "(alias of palette)", since `--primary-soft` is no
    longer an alias.
  - Keep the heat-ramp stop-position comment (`:107-108`).

  Recompute every ratio with the WCAG 2.x relative-luminance
  formula. Expected values from recon: accent-text on accent-soft
  8.76:1; foreground on `--success` 7.11:1; on `--success-hover`
  5.78:1; white on `--success` 2.20:1 (fails). Write the figures you
  compute. If one differs from recon, it wins, and you report it.
- [ ] In `dark-mode.css`, delete the header comment and the whole
  `[data-theme="dark"] { … }` palette block. The component overrides
  from `:93` stay for now.
- [ ] Verify: every property in `light-mode.css` equals its value in
  `git show HEAD:web-app/app/styles/dark-mode.css`. Diff the
  name→value pairs and expect only `--background-subtle` as a
  difference. Then run `./test validate`.
- [ ] Commit: `Give the palette its dark values`

### Task 3: Stop inverting the brand mark — `coder`

**Files:** Modify `S/components-brand.css:2,8-14` and
`tests/fusion-angle-mark.test.ts:35-45,76-87`

- [ ] In `components-brand.css`, delete both
  `html:not([data-theme="dark"])` rules (`:8-14`). The comment opens
  on `:1` and closes on `:2` ("Light theme … inverts to ink. */").
  Replace both lines with one closed line:
  `/* Product mark: white-on-transparent PNG. */`. An unclosed
  comment would swallow the `.brand-mark` rule and the next file's
  first rule in the concatenated bundle.
- [ ] In the test file, delete the test "brand CSS inverts the mark
  in light theme" (`:35-45`, with its trailing blank line). Also
  delete "auth branding does not invert the mark" (`:76-87`, with
  its leading blank line), so the file ends at the `});` on `:75`.
  Keep the favicon test (`:46-60`). The imports all stay in use.
  These covenants died with light mode, so the tests are deleted,
  not rewritten.
- [ ] Run `<test> tests/fusion-angle-mark.test.ts`, then
  `./test validate`.
- [ ] Commit: `Stop inverting the brand mark`

### Task 4: Make the dark skeleton shimmer the base — `coder`

Known deviation. Today's dark rule uses the `background:` shorthand
at 0,2,0, which resets `background-size` to `auto` and beats
`.skeleton-shimmer`'s `background-size: 200% 100%`. The keyframes'
percentage `background-position` therefore moves nothing, so today's
dark shimmer is static. After this fold it animates as designed.
**Tom confirms or overrides.** To override, also delete the
`animation` declaration from `.skeleton-shimmer` and the
`@keyframes skeleton-shimmer` block in this commit.

**Files:** Modify `S/components-feedback.css:45,54-59`

- [ ] At `:45` (`.skeleton-shimmer` gradient), change `/ 0.08` to
  `/ 0.12`.
- [ ] Delete the `[data-theme="dark"] .skeleton-shimmer` rule
  (`:54-59`) and the blank line after it.
- [ ] Run `./test validate`.
- [ ] Commit: `Make the dark skeleton shimmer the base`

### Task 5: Drop dark overrides the palette already gives — `planner`

Under the dark palette these overrides compute the same value as
their base rule (`--muted` = gray-700, `--background` = gray-900,
`--card` = gray-800, `--border` = gray-700). Deleting them changes
nothing visible.

**Files:** Modify `S/dark-mode.css`

- [ ] Before deleting, confirm that each declaration equals what the
  base rule computes under the Task 2 palette:
  - the `[data-theme="dark"] .table tbody tr:hover` block
  - the `[data-theme="dark"] .progress` block
  - the `[data-theme="dark"] .flow-toolbar`, `.flow-canvas-wrap`,
    and `.flow-props-panel` blocks, including the mobile
    `border-bottom` rules matched at `pages-flow-detail.css:311`
    and `:327`

  If any differs, fold it as in Task 6 instead, and say so.
- [ ] Delete those blocks and their comments ("Tables: subtle hover
  row", "Progress bar: visible track", "Flow designer: dark
  surfaces").
- [ ] Run `./test validate`.
- [ ] Commit: `Drop dark overrides the palette already gives`

### Task 6: Fold dark surface values into their rules — `planner`

Each value becomes the owning rule's own property value, never a
second rule.

Contest 4, found in recon: under `.card`, `.ds-do-card` and
`.ds-dont-card` (`S/pages-design-system.css:137-150`, 0,1,0) set a
success or error `border-color` at 0.3 alpha. Today's
`[data-theme="dark"] .card` (0,2,0) hides it. After the card fold
those borders show on the design-system page. This plan lets them
show, by the badges' reasoning. **Tom confirms or overrides.** To
override, delete the two `border-color` declarations
(`pages-design-system.css:139-140,146-147`) in this commit.

In `dark-mode.css`, each block is named by its selector. Task 2
removed lines 1–91, so the old line numbers are gone.

**Files:** Modify `S/components-dialog.css:79,112`,
`S/command-palette.css:8`, `S/components-cards.css:126,141`,
`S/components-menus.css:14,16,55`, `S/components-controls.css:8,25`,
`S/dark-mode.css`

- [ ] Backdrops: `dialog.dialog::backdrop` (`dialog:79`),
  `.sheet-backdrop` (`dialog:112`), and `.command-palette-backdrop`
  (`command-palette:8`) go from `/ 0.5` to `/ 0.7`. Delete the
  `[data-theme="dark"] dialog.dialog::backdrop, … .sheet-backdrop,
  … .command-palette-backdrop` block.
- [ ] Cards: in `.card` (`cards:126`) and `.card-flat` (`cards:141`),
  change `border: 1px solid hsl(var(--border));` to
  `border: 1px solid hsl(var(--border-strong));`. `--border-strong`
  is gray-600 in the palette, exactly the dark override's value.
  Delete the `[data-theme="dark"] .card, [data-theme="dark"]
  .card-flat` block, with its "Cards: stronger border" comment and
  the "Component dark-mode overrides" comment above it.
- [ ] Dropdown: in `.dropdown-content` (`menus:14`), change `--border`
  to `--border-strong`. At `menus:16`, change
  `box-shadow: var(--shadow-lg);` to the override's literal
  `box-shadow: 0 8px 24px hsl(0 0% 0% / 0.4);`. Delete the
  `[data-theme="dark"] .dropdown-content` block.
- [ ] Tooltip: `menus:55` goes from
  `background-color: hsl(var(--foreground));` to
  `background-color: hsl(var(--gray-200));`. Its color (`:56`)
  already computes gray-900. Delete the
  `[data-theme="dark"] .tooltip` block.
- [ ] Switch: the `.switch` track (`controls:8`) becomes
  `hsl(var(--gray-600))`, and `.switch-thumb` (`controls:25`)
  becomes `hsl(var(--gray-300))`. `.switch[aria-checked="true"]`
  (`:15`, 0,2,0, later) still wins. Delete the
  `[data-theme="dark"] .switch` and `.switch-thumb` blocks.
- [ ] Run `./test validate`.
- [ ] Commit: `Fold dark surface values into their rules`

### Task 7: Fold the dark input focus glow — `planner`

Specificity contest 2: `.input-error` keeps its red focus glow.

**Files:** Modify `S/components-inputs.css:24,56`, `S/dark-mode.css`

- [ ] In `.input:focus` (`:24`) and `.textarea:focus` (`:56`), change
  the glow alpha from `/ 0.2` to `/ 0.3`.
- [ ] Delete the `[data-theme="dark"] .input:focus-visible,
  [data-theme="dark"] .textarea:focus-visible` block and its
  comment.
- [ ] Confirm the contest resolves with no extra edit:
  `.input-error:focus` (`:28`) and `.input:focus` (`:21`) are both
  0,2,0, and `:28` comes later, so the red glow wins.
  `.textarea.input-error` keeps the ring glow, because
  `.textarea:focus` comes after `:28`. That is today's dark behavior
  and a pre-existing quirk, out of scope.
- [ ] Run `./test validate`.
- [ ] Commit: `Fold the dark input focus glow`

Known sub-pixel deviation: the dark rule was `:focus-visible`, and the
fold lands on `:focus`. A mouse-focused `select.input` now glows at
0.3 instead of 0.2. Folding into `:focus-visible` would take a second
rule, which would beat `.input-error:focus` and undo contest 2.

### Task 8: Fold the dark hero glow — `planner`

Specificity contest 3: a disabled `.btn-hero` does not glow.

**Files:** Modify `S/components-buttons.css:157,162`, `S/dark-mode.css`

- [ ] At `:157` (`.btn-hero`), change `/ 0.3` to `/ 0.2`. At `:162`
  (`.btn-hero:hover`), change `/ 0.4` to `/ 0.3`.
- [ ] Delete the `[data-theme="dark"] .btn-hero` and
  `.btn-hero:hover` blocks and their comment.
- [ ] Confirm `.btn-hero:disabled` (`:164`, 0,2,0) comes after
  `.btn-hero:hover` (`:159`), so `box-shadow: none` wins.
- [ ] Run `./test validate`.
- [ ] Commit: `Fold the dark hero glow`

### Task 9: Let badge tone borders show — `planner`

Specificity contest 1.

**Files:** Modify `S/components-badges.css:41,112`, `S/dark-mode.css`

- [ ] In `.badge` (`:41`), change `border: 1px solid transparent;` to
  `border: 1px solid hsl(var(--border) / 0.5);`.
- [ ] In `.status-badge` (`:112`), change `border: 1px solid;` to
  `border: 1px solid hsl(var(--border) / 0.5);`.
- [ ] Confirm that the tone variants come later at equal specificity
  (`.badge-*` at `:49-87`, `.status-badge-*` at `:115-134`), so
  their `border-color` wins. `.badge-secondary`,
  `.badge-destructive`, and a bare `.badge` keep the neutral edge.
- [ ] Delete the `[data-theme="dark"] .badge` and `.status-badge`
  blocks and their comment. The file is now empty.
- [ ] Run `./test validate`.
- [ ] Commit: `Let badge tone borders show`

### Task 10: Delete the emptied dark stylesheet — `coder`

**Files:** Delete `S/dark-mode.css`. Modify `bin/build-lib:76`, then
`S/tokens.css:1,41,45,63,153` and `web-app/app/flow-graph.ts:45`.

- [ ] Confirm `dark-mode.css` holds nothing but whitespace, then
  `git rm` it.
- [ ] In `bin/build-lib`, delete the line
  `web-app/app/styles/dark-mode.css \` from the `cat` list.
- [ ] Verify: `grep -rn 'data-theme\|\.dark\b' web-app/app/styles/`
  finds nothing, then `./test validate`.
- [ ] Commit: `Delete the emptied dark stylesheet`
- [ ] Second commit. Reword four `tokens.css` comments:
  - `:1` → `/* Design tokens. */`
  - `:41` → `/* Accent base (yellow) */`
  - `:45` → `/* Destructive foreground (white) */`
  - `:63` → `/* Shadows (base) */`
  - `:153` → `/* Gradients */`

  Run `./test validate`. Commit:
  `Drop theme wording from the tokens`
- [ ] Third commit. In `web-app/app/flow-graph.ts:45`, change
  "in CSS — theme-reactive, no raw hex." to "in CSS — token-driven,
  no raw hex.", reflowed to 78. Run `./test validate`. Commit:
  `Drop theme wording from the canvas palette`

---

## Phase 2: Remove the toggle and the theme code

Order constraints:
- Task 11 comes before Task 19, because it strips the module down to
  `initDropdown`.
- Task 11 comes before Tasks 13 and 14. `theme-toggle.ts` imports
  `persistThemePreference` and `mutateThemeToggleIcon` from
  `state.ts`, and `isStoredTheme` and `StoredTheme` from
  preferences.
- Task 12 comes before Tasks 14 and 16 (`theme-init.ts` imports
  `getStoredTheme` and `media-query`).
- Task 13 comes before Tasks 14, 15, and 16 (`state.ts` imports all
  three).
- Task 16 comes before Task 17.

### Task 11: Remove the theme toggle from both headers — `coder`

`initThemeAndDropdowns` (`theme-toggle.ts:115`) wires ONLY the two
theme dropdowns and the `[data-theme-set]` buttons. The workbox
dropdown calls `initDropdown` itself (`web-app/workbox/index.ts:405`),
so `layout.ts` gets no replacement call. No CSS targets the toggle
ids. `.dropdown*` and `.header-actions` stay.

**Files:** Modify `web-app/app/component-top-bar.html:71-187`,
`web-app/app/component-mobile-header.html:53-169`,
`web-app/app/theme-toggle.ts`, `web-app/app/layout.ts:11-14,98,100`

- [ ] In `component-top-bar.html`, delete the theme
  `<div class="dropdown">` from its open tag through its closing
  `</div>` (`:71-187`). The `</div>` at `:188` closes
  `.header-actions` and stays. The invitations button stays.
- [ ] In `component-mobile-header.html`, delete `:53-169` the same
  way. `:170` closes `.header-actions`. `#mobile-search-toggle`
  stays.
- [ ] In `theme-toggle.ts`, delete the state and preferences imports
  (`:1-8`), the `showToast` and `log` imports (`:10-11`), and the
  `mutateThemeToggleIcon` re-export (`:12-13`). Also delete `:68-147`:
  `THEME_NOT_SAVED_MESSAGE`, `applyAndPersistTheme`,
  `closeAllDropdowns`, and `initThemeAndDropdowns`. What remains is
  `import { $, $$ } from './dom.ts';` plus `initDropdown`
  (`:15-67`), byte for byte.
- [ ] In `layout.ts`, delete the theme-toggle import (`:11-14`) and
  the calls `initThemeAndDropdowns();` (`:98`) and
  `mutateThemeToggleIcon();` (`:100`).
- [ ] Verify: `grep -rn "theme-dropdown\|data-theme-set" web-app/`
  finds nothing. Then `./test validate`.
- [ ] Commit: `Remove the theme toggle from both headers`

### Task 12: Restrict the pre-paint script to the sidebar — `coder`

Reliability: the `applySidebarCollapsed` IIFE must survive
byte-identical.

**Files:** Modify `web-app/app/theme-init.ts`

- [ ] Delete the `applyTheme` IIFE (`:18-30`) and the media-query
  import (`:14-16`).
- [ ] Rewrite the preferences import (`:10-13`) as
  `import { getStoredSidebarCollapsed } from
  './adapters/preferences.ts';` on one line (70 chars).
- [ ] Rewrite the header comment (`:1-8`): it reads the persisted
  sidebar-collapsed preference from localStorage and applies it to
  `documentElement`, so the page paints in the correct state. Keep
  the CSP rationale. Do not name the file, so Task 20's rename
  needs no edit.
- [ ] Leave `applySidebarCollapsed` (`:32-38`) untouched.
- [ ] Run `./test validate`.
- [ ] Commit: `Restrict the pre-paint script to the sidebar`

### Task 13: Drop theme state and its listeners — `coder`

**Files:** Modify `web-app/app/state.ts`. Delete
`tests/state-theme-icon.test.ts`. Modify
`tests/state-init.test.ts:8,16-21,22-47,49-67` and five comment-only
test files.

**Interfaces — Produces:** `state.ts` exports exactly
`collapseSidebar`, `initState`, `initListeners`, and
`type AppState`, where `interface AppState { isSidebarCollapsed:
boolean; }`.

- [ ] `state.ts` imports become exactly these:
  - `putPreference`, `getStoredSidebarCollapsed`,
    `BOOL_STRING_TRUE`, and `BOOL_STRING_FALSE` from preferences
  - `subscribeStorageEvent`
  - `STORAGE_KEY_SIDEBAR` alone

  Delete the media-query (`:10-13`), icons (`:21-27`), and safe-html
  (`:28-30`) imports.
- [ ] `AppState` holds only `isSidebarCollapsed`, and its initial
  value is `{ isSidebarCollapsed: false }`. In the comment at
  `:45-48`, "preferences" becomes "preference".
- [ ] Delete these: `DARK_QUERY` (`:37-38`), `THEME_TOGGLE_IDS`
  (`:40-43`), `computeTheme` (`:60-67`), `getThemeIcon` (`:69-80`),
  `mutateThemeToggleIcon` (`:82-94`), `applyResolvedTheme`
  (`:96-109`), and `persistThemePreference` with its comment
  (`:111-126`).
- [ ] `initState` sets only `isSidebarCollapsed`. In `initListeners`,
  delete the `subscribeMediaQuery` block (`:162-169`) and the theme
  storage branch (`:172-180`). Keep the sidebar branch (`:181-200`).
- [ ] `git rm tests/state-theme-icon.test.ts`. All three of its tests
  are theme-only.
- [ ] In `tests/state-init.test.ts`:
  - Drop `computeTheme` from the import (`:8`).
  - Delete "initState hydrates the persisted theme preference"
    (`:22-47`) and "initState throws on a corrupt stored theme"
    (`:49-67`).
  - In the comment `:16-21`, keep the purity sentences (`:16-19`).
    Replace the computeTheme sentence with "initState() hydrates the
    persisted sidebar preference at boot."
  - Leave `STORAGE_KEY_THEME`, `isStoredTheme`, and
    `assertStrictEquals` for Task 14.
- [ ] Remove "theme" from five test comments:
  - `ideas-empty-subscribe.test.ts:25`, `flow-stats-subscribe.test.ts:27`
    and `ideas-empty-reinit-error.test.ts:20`: `theme/session state`
    → `session state`
  - `adapters-subscribe-silent.test.ts:18`: `reads theme/session` →
    `reads session`
  - `members-pending-skeleton.test.ts:22-23`: `reads theme and` /
    `session state at load.` → `reads session` / `state at load.`
- [ ] Verify: `grep -n "theme\|Theme" web-app/app/state.ts` finds
  nothing. Then run `<test> tests/state-init.test.ts` and
  `./test validate`.
- [ ] Commit: `Drop theme state and its listeners`

### Task 14: Drop the stored theme preference — `coder`

**Files:** Modify `web-app/app/adapters/preferences.ts`,
`web-app/app/storage-keys.ts:5`, `tests/state-init.test.ts`,
`tests/fusion-angle-identifiers.test.ts:5,33-36`

- [ ] In `preferences.ts`:
  - The import (`:2-5`) becomes
    `import { STORAGE_KEY_SIDEBAR } from '../storage-keys.ts';`.
  - Delete `StoredTheme` (`:13`), `isStoredTheme` (`:18-24`),
    `getStoredTheme` (`:31-40`), `export type { StoredTheme };`
    (`:94`), and their export entries (`:99`, `:101`).
  - Reword `:26-30` to: "The validated sidebar reader — ONE truth
    for the pre-paint script and state.ts … Absence reads as the
    documented default: expanded sidebar." Name no file.
  - At `:59-62`, change "theme and sidebar state are observable
    fallbacks" to "sidebar state is an observable fallback".
- [ ] In `storage-keys.ts`, delete `STORAGE_KEY_THEME` (`:5`) and the
  blank line after it.
- [ ] In `tests/state-init.test.ts`:
  - Delete the `STORAGE_KEY_THEME` import, the `isStoredTheme`
    import, and the test "isStoredTheme accepts the three themes
    only".
  - Drop `assertStrictEquals` from line 1, which leaves
    `assertThrows` alone.
  - In "corrupt stored sidebar", `getItem` becomes
    `(k: string) =>` / `    k === STORAGE_KEY_SIDEBAR ? 'maybe' :
    null,`. Delete the `g` cast, the `g.window = { matchMedia … }`
    stub, `try {`, and `} finally { delete g.window; }`.
  - Move `assertThrows(() => initState(), Error, 'corrupt stored
    sidebar')` up one indent level as the body, byte-identical
    otherwise. Nothing is weakened: `initState` never touches
    `window`, and the assertion is unchanged.
- [ ] In `tests/fusion-angle-identifiers.test.ts`, delete the
  `STORAGE_KEY_THEME,` import (`:5`) and its assert block
  (`:33-36`). The other five pins stay.
- [ ] Verify:
  `grep -rn "STORAGE_KEY_THEME\|StoredTheme\|fusion-angle:theme"
  web-app tests` finds nothing. Then run `<test>
  tests/state-init.test.ts tests/fusion-angle-identifiers.test.ts`
  (one test in state-init passes) and `./test validate`.
- [ ] Commit: `Drop the stored theme preference`

### Task 15: Delete the sun and moon icons — `coder`

**Files:** Modify `web-app/app/icons.ts:234-261`

- [ ] Delete `iconSun`, `iconMoon`, and the blank lines between and
  after them. `iconMonitor` (`:262`) stays.
- [ ] Verify: `grep -rn "iconSun\|iconMoon" web-app tests` finds
  nothing. Then `./test validate`.
  `tests/fusion-angle-display.test.ts` needs ≥ 60 path hits and has
  144.
- [ ] Commit: `Delete the sun and moon icons`

### Task 16: Delete the media-query adapter — `coder`

**Files:** Delete `web-app/app/adapters/media-query.ts`. Modify
`client/event-listener.ts:2-4`.

- [ ] `git rm web-app/app/adapters/media-query.ts`.
- [ ] In `client/event-listener.ts:2-4`, change the comment's
  "(broadcast-channel, media-query, storage-event)" to
  "(broadcast-channel, storage-event)", reflowed to 78.
- [ ] Verify: `grep -rn "media-query\|matchMedia" web-app client`
  finds nothing. Then `./test validate`.
- [ ] Commit: `Delete the media-query adapter`

### Task 17: Drop dead matchMedia test stubs — `coder`

After Task 16, no product code calls `window.matchMedia`. These test
window stubs carry a `matchMedia` member that only the theme code
read.

**Files:** Modify these 26 files, each `tests/<name>.test.ts:<line>`:
presenter-idea:83, members-detail-reduce:35,
ideas-empty-subscribe:110, presenter-service-member-detail:20,
presenter-project-detail-impact:22, flows-detail-shortcuts:16,
presenter-member-detail:33, flow-stats-subscribe:97,
flows-detail-canvas-focus:26, presenter-projects-list-column:14,
presenter-project-score-history:13, presenter-identity-tokens:11,
adapters-subscribe-silent:25, presenter-projects-organization:24,
presenter-identity-list:13, presenter-barrel:10,
presenter-identity-detail:22, projects-detail-reduce:17,
ideas-empty-reinit-error:87, presenter-members:54,
members-pending-skeleton:69, presenter-identity-providers:11,
adapters-dashboard-scoring-dedupe:71, presenter-project-patch:17,
presenter-invitation-list:31, adapters-organization-dedupe:66

- [ ] Re-run `grep -rn --exclude-dir=browser "matchMedia" tests/`
  and work from its output, since Task 13 shifted some lines.
  `tests/browser/reduced-motion.test.ts:28` is a real Chrome
  `prefers-reduced-motion` query, not a stub. It stays.
- [ ] In each stub, delete only the `matchMedia` member, including
  any multi-line `({ matches, addEventListener,
  removeEventListener })` body. The rest of each window stub stays,
  because other code reads it.
- [ ] Verify: `grep -rn --exclude-dir=browser "matchMedia" tests/`
  finds nothing. Then `./test validate`.
- [ ] Commit: `Drop dead matchMedia test stubs`

---

## Phase 3: Renames (each commit is rename-only)

### Task 18: Rename the light-mode stylesheet to palette — `coder`

Palette home: `S/palette.css`. Task 2 rewrote `light-mode.css` in
place, and this pure rename keeps "never move and change in one
commit" with history that `--follow` can trace. The `cat` slot stays
after `fonts.css` and before `base.css`. A semantic-role file also
stays apart from `tokens.css`'s primitive scales.

**Files:** Rename `S/light-mode.css` → `S/palette.css`. Modify
`bin/build-lib:75`.

- [ ] `git mv web-app/app/styles/light-mode.css
  web-app/app/styles/palette.css`.
- [ ] In `bin/build-lib`, change `light-mode.css` in the `cat` list
  to `palette.css`, in the same slot.
- [ ] Verify: `git diff --cached -M --stat` shows `R100`. Then
  `./test validate`.
- [ ] Commit: `Rename the light-mode stylesheet to palette`

### Task 19: Rename the toggle module for dropdowns — `coder`

**Files:** Rename `web-app/app/theme-toggle.ts` →
`web-app/app/dropdown.ts`. Modify `web-app/workbox/index.ts:22`.

**Interfaces — Produces:** `initDropdown` exported from
`web-app/app/dropdown.ts`, with its signature unchanged.

- [ ] `git mv web-app/app/theme-toggle.ts web-app/app/dropdown.ts`.
  The file's content is not touched.
- [ ] In `web-app/workbox/index.ts:22`, the import becomes
  `import { initDropdown } from '../app/dropdown.ts';`. Line 237
  must not move: `TODO.md:1057` cites it.
- [ ] Verify: `git diff --cached -M --stat` shows `R100` plus the
  one-line workbox change. Then `./test validate`.
- [ ] Commit: `Rename the toggle module for dropdowns`

### Task 20: Rename the pre-paint script for the sidebar — `coder`

**Files:** Rename `web-app/app/theme-init.ts` →
`web-app/app/sidebar-restore.ts`. Modify `bin/build-lib:54,55,57`
and the `<script>` tags at `web-app/app/components-layout.html:33`,
`web-app/auth/index.html:33`, `web-app/landing/index.html:33`,
`web-app/not-found/index.html:29`.

- [ ] `git mv web-app/app/theme-init.ts
  web-app/app/sidebar-restore.ts`. The content is untouched.
- [ ] In `bin/build-lib`:
  - `:54` → `-o "$dest/assets/sidebar-restore.js" \`
  - `:55` → `web-app/app/sidebar-restore.ts`
  - `:57` → `emitted "Bundle created" "$dest/assets/sidebar-restore.js"`
- [ ] In all four HTML files, change `../assets/theme-init.js` to
  `../assets/sidebar-restore.js`.
- [ ] Verify:
  - `git diff --cached -M --stat` shows `R100`.
  - `./test validate`.
  - After the commit, `./bin/build --no-zip "$TMPDIR/fa-dark/"`.
    Then check that `"$TMPDIR/fa-dark/assets/sidebar-restore.js"`
    exists.
  - `grep -rn "theme-init" web-app bin` finds nothing.
- [ ] Commit: `Rename the pre-paint script for the sidebar`

---

## Phase 4: Living docs (one commit per doc concern)

### Task 21: Describe the dark palette in the docs — `coder`

Four commits.

- [ ] **DESIGN-SYSTEM.md:**
  - `:26`: "Theme HSL lives in `light-mode.css` and `dark-mode.css`."
    → "Palette HSL lives in `palette.css`, under one `:root`."
  - `:97-102`, heat-ramp table:
    `| Token | Position | Value |`, with the dark values only:
    - low 0% `210 60% 60%`
    - mid 50% `145 50% 55%`
    - high 75% `48 80% 60%`
    - peak 100% `0 65% 60%`

    Keep the column padding aligned.
  - `:110-112`: delete "dark mode follows automatically, ". The
    sentence then reads "…single number, and there is *no* color
    math in TypeScript."
  - `:171-184`, cascade list: item 3 becomes `palette.css`, and
    item 4 (`dark-mode.css`) is deleted. Renumber, and "Those ten"
    becomes "Those nine". The list must equal the `cat` list in
    `bin/build-lib`, not including the `pages-*.css` loop.
  - `:195` table row "| Theme HSL | `light-mode.css` /
    `dark-mode.css` |" → "| Palette HSL | `palette.css` |".
  - Survivors that stay: `outline-light` (`:40`) and
    "light-dismisses" (`:55`).
  - Verify: `grep -niE "theme|dark[ -]mode|light[ -]mode|\|
    *(Light|Dark) *\|" DESIGN-SYSTEM.md` finds nothing.
  - Commit: `Describe the one dark palette in the design system`
- [ ] **README.md:72:** "CSS custom properties with light/dark theme
  support" → "CSS custom properties for one dark palette". Leave
  "~70 inline SVG icons" (`:71`): 67 remain. Verify that
  `grep -niE "theme|light|dark" README.md` finds nothing. Commit:
  `Drop light/dark theme support from the README`
- [ ] **ARCHITECTURE.md:55-56:** "theme, sidebar, log level, active
  organization id" → "sidebar, log level, active organization id",
  reflowed. Verify that `grep -ni theme ARCHITECTURE.md` finds
  nothing. Commit: `Drop theme from the stored UI preferences`
- [ ] **TODO.md:**
  - C3 (`:1932-1936`) becomes:

    ```
      - The header's search bar and stats tiles, and the
        retired greeting and org `<select>` being truly
        absent from the live DOM (C3) — Layer 2;
        `mutateHeaderInfo` mutates `document` directly and
        has no pure-function seam
    ```
  - FS8 (`:2239-2241`) becomes:

    ```
      - The painted contrast of tints and card text
        (FS8) — Layer 2, reading computed contrast
    ```
  - Delete the bullets "The live dark/light repaint … (I1, I3)"
    (`:2303-2306`) and "The theme choice actually persisting … (I2,
    I5, FS8)" (`:2307-2313`).
  - I8/I28 (`:2314-2320`) becomes:

    ```
      - `initState` hydrating a VALID stored
        `fusion-angle:sidebar-collapsed` value, and the
        sidebar storage-event listener (I8, I28) — Layer 1,
        `tests/state-init.test.ts` (only the corrupt-value
        rejection is tested) and a synthetic `storage`
        event for `STORAGE_KEY_SIDEBAR` after `initListeners`
    ```
  - Re-check that `:1057`'s `web-app/workbox/index.ts:237` still
    points at the right line.
  - Verify that `grep -niE "theme|dark mode|dark/light|matchMedia|
    \bI[1-5]\b" TODO.md` finds nothing.
  - Commit: `Retire the theme items from TODO`

### Task 22: Retire the theme cases from the test plan — `coder`

Two commits.

- [ ] **The `### Theme` section:**
  - Delete from `### Theme` (`:6271`) through the blank line before
    `### Sidebar` (`:6339`). That covers I1–I5 and I6 (cross-tab/OS).
  - Do NOT renumber I7–I30: `tests/test-plan-apple-menu.test.ts`
    parses I-blocks by ID, and TODO cites them. The gap stays
    silent.
  - In the same commit, update the counts:
    - `:465` `| I. Cross-Cutting Concerns | 30 |` → `24`
    - `:470` `| **Total** | **405** |` → `**399**`
    - `:478` "counts 405 distinct" → `399`
    - `:7779` `| I | 30 |` → `| I | 24 |`

    Leave `:7763`'s `<N>` template field. The other pre-existing
    count mismatches (F2, G, K, R) are out of scope.
  - Verify: `grep -nE "\*\*I[1-6]\*\*|### Theme|\b405\b" TEST-PLAN.md`
    finds nothing, and the I section has 24 `^- \[ \] \*\*I[0-9]`
    lines. Then `./test validate`.
  - Commit: `Retire the theme cases from the test plan`
- [ ] **Header cases, FS8, and the I28 pin.** Anchor on text, since
  lines shifted by about 68.
  - C3 (about `:1742-1749`): "Header shows search bar, company stats
    as structured tiles (…), and theme toggle. PASS:" → "Header
    shows search bar and company stats as structured tiles (…).
    PASS:", reflowed.
  - F7 (about `:2765`): "top bar with search / organization stats /
    theme toggle and no greeting" → "top bar with search /
    organization stats and no greeting", reflowed.
  - FS8 (the whole case, about `:5084-5098`) becomes:

    ```
    - [ ] **FS8** On the stats page the heat tints and the card
      remain legible. The face number text contrasts adequately
      at all heat levels.
      Pin: exploratory — the painted contrast of tints
           and card text
    ```
  - I28 pin (about `:6553-6557`): replace the `STORAGE_KEY_THEME`
    text with:

    ```
      Pin: exploratory — the live cross-tab sync;
           `state.ts`'s storage-event listener carries no
           CLI test today
    ```
  - Verify that `grep -niE "theme|dark-mode|both themes|matchMedia|
    STORAGE_KEY_THEME|prefers-color-scheme|state-theme-icon"
    TEST-PLAN.md` finds nothing.
  - Commit: `Drop the theme toggle from test-plan cases`

---

## Phase 5: Verify

### Task 23: Sweep for theme vestiges — `planner`

- [ ] Run the spec's sweep:

  ```bash
  grep -rniE "theme|dark[ -]mode|light[ -]mode|light/dark|\
  prefers-color-scheme|color-scheme: light|\| *(Light|Dark) *\|" \
      web-app bin tests client shared server *.md
  ```

  The expected survivors, each reviewed:
  - the `GaugeTheme` / gauge `theme:` field, including
    `tests/presenter-misc.test.ts:75,105`
  - `web-app/assets/favicon.svg` and its test in
    `fusion-angle-mark.test.ts`
  - the `theme=dark` cookie fixtures in
    `tests/message-plane.test.ts`
  - `color-scheme: dark` in `base.css`
- [ ] Every other hit gets a fix in a single-concern commit, or a
  written justification in the task report.
- [ ] Also run `grep -rn "data-theme\|\.dark\b\|matchMedia" web-app
  client shared tests`. The only expected hit is
  `tests/browser/reduced-motion.test.ts:28`, the real
  `prefers-reduced-motion` query.
- [ ] No commit unless a fix is needed.

### Task 24: Layer 2 and visual parity — `planner`

- [ ] In the dark-only worktree, run `./test validate browser`.
  Expected: green. Paste the summary line.
- [ ] Baseline, from the next-release worktree
  `/Users/tmornini/code/fusion-angle/.worktrees/next-release` (clean
  tree, `930f43cd` or later):
  - Before each of the two deploys, confirm that 127.0.0.1:8080 and
    :5432 are free (`lsof -nP -iTCP:8080 -iTCP:5432 -sTCP:LISTEN`
    prints nothing). Another worktree's walk stack may hold them.
    If either is held, stop and report to the conductor; do not
    take another worktree's stack down.
  - `export DENO_DIR="$TMPDIR/deno-dir"; ./deploy --local 8080
    --postgres mock-data`.
  - Select Dark in the header toggle.
  - Capture desktop and mobile-width screenshots of landing, auth,
    dashboard, ideas, flows (list, designer, stats), workbox,
    members, the design-system page, and not-found.
  - Also capture an open dialog, a dropdown, a tooltip, the command
    palette, a badge row, an `.input-error` field focused, and a
    disabled hero button hovered.
  - Stop the stack (Ctrl-C; the trap runs compose down).
- [ ] Candidate: the same deploy and captures from the dark-only
  worktree, with no toggle to touch.
- [ ] Compare the pairs. Every pair must match except these expected
  deviations:
  - badges show tone borders
  - a focused `.input-error` glows red
  - a hovered disabled hero button does not glow
  - the `.ds-do-card` / `.ds-dont-card` borders show (unless Tom
    overrode Task 6)
  - the skeleton shimmer animates (unless Tom overrode Task 4)
  - a mouse-focused `select.input` glows at 0.3 rather than 0.2
    (Task 7), below what the eye can tell apart
  - no theme toggle in either header

  Any other difference is a bug: report it with both screenshots.
- [ ] Walk the five Review Focus items on the candidate and score
  each PASS or FAIL. For item 2, set
  `localStorage['fusion-angle:theme']='light'` in DevTools, and
  separately emulate `prefers-color-scheme: light`.
- [ ] No commit. Report the results to the conductor, who hands
  over for landing:
  - rebase onto `next-release`
  - `./test validate browser`
  - `git merge --ff-only dark-only` from the next-release worktree
  - the `test-plan-walk-2026-10-22` worktree stays untouched

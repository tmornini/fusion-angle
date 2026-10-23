# Dark Only

Branch and worktree `dark-only`, cut from `next-release`.

## Intent

Dark is the product. Light mode, the "system" mode, and the
switch that chooses among them are dead weight. Remove them and
every trace of them, so that today's dark appearance is simply
how the app looks — not a mode, not a default, not a value that
anything selects.

## Goals

- Every page renders exactly as it does today under
  `data-theme="dark"`: same colors, borders, shadows, backdrops,
  skeleton shimmer, brand mark, flow designer surfaces — except
  the three deliberate changes under "Specificity contests".
- One palette, unconditioned: no `[data-theme]` selector, no
  `data-theme` attribute, no `.dark` class, no
  `prefers-color-scheme` query in the app's CSS or code.
- No theme UI: the header and mobile-header toggle buttons and
  their Light / Dark / System dropdowns are gone.
- No theme code: stored preference, validator, resolver, OS
  listener, cross-tab theme sync, toggle icon, "theme not saved"
  toast — all gone.
- The repo's living docs describe a dark-only product.

## Non-goals

- Changing any dark color. This is a flattening, not a redesign.
- Touching historical specs, plans, and mitigations under
  `docs/superpowers/` — they are records of what was true then.
- The favicon (see "Calls made" below).
- `measure-viz.ts`'s `data-mode` buttons — an unrelated
  measurement-chart control.

## Anti-goals

- A light-mode fallback surviving anywhere — e.g. dark values
  layered as overrides on top of light ones, so that deleting a
  file or an attribute would quietly bring light back. The
  dark values must BE the base values.
- Breaking the pre-paint restore of the collapsed sidebar, which
  today shares a script with the theme.
- Any code that reads, writes, or clears `fusion-angle:theme`.
  Browsers that hold a stored value keep it; nothing looks at it.
  (Tom's decision.)

## Current state (on `next-release`, 930f43cd)

| Where | What |
|---|---|
| `web-app/app/component-top-bar.html` | `#theme-toggle` button + `#theme-dropdown` (three `data-theme-set` items) |
| `web-app/app/component-mobile-header.html` | `#mobile-theme-toggle` + `#mobile-theme-dropdown` |
| `web-app/app/theme-toggle.ts` | `initThemeAndDropdowns`, `applyAndPersistTheme`, the not-saved toast — and the generic `initDropdown`, which `web-app/workbox/index.ts` also imports |
| `web-app/app/state.ts` | `AppState.theme`, `computeTheme`, `getThemeIcon`, `mutateThemeToggleIcon`, `applyResolvedTheme`, `persistThemePreference`, the `prefers-color-scheme` subscription, the theme branch of the storage-event listener |
| `web-app/app/layout.ts` | calls `initThemeAndDropdowns()` and `mutateThemeToggleIcon()` |
| `web-app/app/adapters/preferences.ts` | `StoredTheme`, `isStoredTheme`, `getStoredTheme`, theme wording in comments |
| `web-app/app/adapters/media-query.ts` | used only by the theme code (`state.ts`, `theme-init.ts`) |
| `web-app/app/storage-keys.ts` | `STORAGE_KEY_THEME` |
| `web-app/app/icons.ts` | `iconSun`, `iconMoon` — theme-only; `iconMonitor` is also used by the member presenters and stays |
| `web-app/app/theme-init.ts` | pre-paint IIFEs: theme (sets `data-theme` + `.dark`) and sidebar-collapsed |
| `web-app/{app/components-layout,auth/index,landing/index,not-found/index}.html` | `<script src="../assets/theme-init.js">` |
| `bin/build-lib` | bundles `theme-init.ts` → `assets/theme-init.js`; concatenates `light-mode.css` then `dark-mode.css` |
| `web-app/app/styles/light-mode.css` | `:root` semantic HSL (light values) |
| `web-app/app/styles/dark-mode.css` | `[data-theme="dark"]` semantic HSL overrides, `color-scheme: dark`, `--background-subtle` (dark-only), and component overrides: backdrop alpha 0.7, card/dropdown borders, table hover, input focus glow, dropdown shadow, tooltip inversion, progress/switch tracks, badge borders, flow toolbar/canvas/props surfaces, hero-button glow |
| `web-app/app/styles/base.css` | `color-scheme: light` on `html` |
| `web-app/app/styles/components-brand.css` | `html:not([data-theme="dark"])` mark inversion (two rules) |
| `web-app/app/styles/components-feedback.css` | `[data-theme="dark"] .skeleton-shimmer` |
| `web-app/app/styles/tokens.css` | "theme-neutral" / "both themes" comments |
| `tests/state-theme-icon.test.ts` | theme-only file |
| `tests/state-init.test.ts` | theme hydration, corrupt-theme, `isStoredTheme` tests; the corrupt-sidebar test stubs `STORAGE_KEY_THEME` and `matchMedia` |
| `tests/fusion-angle-identifiers.test.ts` | pins `STORAGE_KEY_THEME` |
| `tests/fusion-angle-mark.test.ts` | "brand CSS inverts the mark in light theme", "auth branding does not invert the mark" |
| five test files | comments saying the module graph reads "theme/session" state at load |
| `DESIGN-SYSTEM.md` | load order and file table name both mode files; the heat-ramp table's "Light" / "Dark" columns (~97–102); line 111 "dark mode follows automatically" |
| `README.md:72`, `ARCHITECTURE.md:55` | "light/dark theme support"; "theme, sidebar" preferences |
| `TODO.md` | C3 (theme toggle in header), FS8 ("both themes"), I1–I5 open-verification bullets, the I8/I28 bullet that names `state-theme-icon.test.ts` as its model |
| `TEST-PLAN.md` | `### Theme` I1–I5 + the cross-tab/OS case; FS8; header cases at ~1749 and ~2765 that list the theme toggle; the ~6554 note |

## Shape of the result

**CSS.** The semantic palette lives in one file under `:root`,
holding exactly the values `dark-mode.css` assigns today
(verified: `dark-mode.css` reassigns every custom property
`light-mode.css` sets; no light value survives). It adds
`--background-subtle`, which nothing reads — that token is
dropped. `color-scheme: dark` sits on
`html` in `base.css`. Each component override moves INTO its
component's own rule as that rule's property value — not as a
second, later rule. Where today's `[data-theme="dark"]` prefix
was winning a specificity contest against a more specific
variant, a plain fold flips the winner; those cases are listed
under "Specificity contests" below and resolved there. The brand mark carries no `filter` rules; the
skeleton-shimmer gradient is the dark one. `light-mode.css` and
`dark-mode.css` no longer exist.

**Pre-paint script.** Restores the collapsed sidebar only, and
is named for that.

**Header.** Neither header carries a theme control; nothing
replaces it.

**State.** `AppState` holds `isSidebarCollapsed` alone;
`initListeners` listens for the sidebar storage event alone.

**Dropdown helper.** `initDropdown` lives in a module named for
dropdowns, since the theme module it lived in is gone.

## Specificity contests

Today's dark overrides carry an extra attribute selector
(specificity 0,2,0), so they beat single-class variants. Three
places depend on that:

- **Badge borders.** `[data-theme="dark"] .badge` and
  `.status-badge` set `hsl(var(--border) / 0.5)`, overriding every
  tone variant's `border-color` (`components-badges.css`
  `.badge-primary/-success/-warning/-error/-info/-default/-outline`,
  `.status-badge-*`). In dark today every badge has the same
  neutral border. RESOLUTION (Tom's decision, chosen from a
  side-by-side render): let the tone borders show. The neutral
  `hsl(var(--border) / 0.5)` folds into the base `.badge` and
  `.status-badge` rules, so badges with no tone border of their
  own (`.badge-secondary`, `.badge-destructive`, a bare `.badge`)
  keep today's neutral edge, and every tone variant's
  `border-color` now wins.
- **`.input-error` focus glow.** The dark `.input:focus-visible`
  ring glow beats `.input-error:focus`'s destructive glow today.
  Claude's call: an error input keeps its red focus glow — the
  variant exists to signal the error, and the dark rule was
  hiding it by accident — the same reasoning as the badges.
- **Disabled hero button.** `[data-theme="dark"] .btn-hero:hover`
  beats `.btn-hero:disabled`, so a disabled hero button still
  glows on hover. Claude's call: a disabled button does not glow.

## Constraints

- AGENTS.md commit discipline: one concern per commit, ~50-char
  imperative subject, `Co-Authored-By` trailer; never rename and
  change content in one commit; every commit green under
  `./test validate`.
- Order the commits so the app works at every step: e.g. flatten
  the palette first (the app is then dark whatever the toggle
  says), then remove the toggle UI and code, then rename files
  whose names became wrong, then docs.
- 78-char lint, 4-space indent, no inline styles.
- Layer 2 (`./test validate browser`) before landing.
- Lands on `next-release`, not `master`: rebase onto
  `next-release` and `git merge --ff-only dark-only` from the
  `next-release` worktree (AGENTS.md's recipe, with
  `next-release` in `master`'s place). The
  `test-plan-walk-2026-10-22` worktree sits at its own commit
  and is untouched by the landing.

## Verification

- `./test validate` green on every commit; `./test validate
  browser` green before landing.
- A sweep that finds nothing under `web-app/`, `bin/`, `tests/`,
  and the living docs:
  `grep -rniE "theme|dark[ -]mode|light[ -]mode|light/dark|prefers-color-scheme|color-scheme: light|\| *(Light|Dark) *\|"`
  — expected survivors only: the unrelated `GaugeTheme` /
  gauge `theme:` field (a gauge's tone), `flow-graph.ts`'s
  "theme-reactive" comment if still accurate, the favicon and
  its test, the `theme=dark` cookie fixtures in
  `tests/message-plane.test.ts` (HTTP header test data), and
  `color-scheme: dark`. The builder reviews each survivor.
- Visual parity: `./deploy --local 8080 --postgres mock-data`,
  then compare landing, auth, dashboard, ideas, flows (list,
  designer, stats), workbox, members, not-found, and an open
  dialog / dropdown / tooltip / command palette against the same
  pages on `next-release` with dark selected. They must match.

## Calls made (Claude's, not Tom's)

- **Favicon stays.** `web-app/assets/favicon.svg` inverts the
  white mark under `prefers-color-scheme: light`. That follows
  the *browser's tab strip*, which the app does not paint; dropping
  it would make the mark invisible on light tab strips. The
  `fusion-angle-mark` favicon test stays with it.
- **`iconMonitor` stays** (member presenters use it); `iconSun`
  and `iconMoon` go.
- **`media-query.ts` goes** — no caller survives.
- **Mark tests:** the two theme-conditioned brand-CSS tests are
  deleted, not rewritten — the covenant they pinned (invert in
  light) no longer exists.
- **TEST-PLAN:** the `### Theme` section and its cases are
  removed; header cases drop "theme toggle" from their lists;
  FS8 keeps its contrast check, dark only. TODO bullets that
  exist only for theme verification are removed; the I8/I28
  bullet is reworded to stand on its own.
- **No new guard test** for "no theme vestiges" — the sweep is a
  one-time verification, not a standing covenant.

## Left to the builder

- The name and home of the flattened palette file (e.g. folding
  into `tokens.css`, or a single `palette.css`), and of the
  renamed pre-paint and dropdown modules — keeping the bundle
  and build references in step.
- Exact commit boundaries within the constraints above.
- Rewording of comments that mention themes.

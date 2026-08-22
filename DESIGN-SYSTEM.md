# Design System

This file is the visual contract. Token values live in
`web-app/app/styles/tokens.css` and render at
`/design-system/`. This file does not restate the scale
tables.

## Tokens

Colors are `hsl(var(--token))` — never hex. Semantic
roles:

- **primary** / **primary-foreground** — brand actions
- **secondary** / **secondary-foreground** — quieter
  chrome
- **muted** / **muted-foreground** — de-emphasis
- **accent** / **accent-foreground** — gold highlight
- **destructive** / **destructive-foreground** — delete
- **success**, **warning**, **error**, **info** — each
  with `-soft`, `-border`, `-text` (and `-foreground`
  where a solid fill carries type)
- **danger** — solid escalation above warning
- **background** / **foreground** / **card** /
  **border** / **input** / **ring**

Theme HSL lives in `light-mode.css` and `dark-mode.css`.

## Variants

`data-tone` / `data-level` on a base class. The TS enum
and the CSS attribute selector share one source of
truth. Tones: `primary`, `success`, `warning`, `error`,
`info`, `muted`. Levels: `normal`, `warning`, `danger`.
`toneFor*` returns tone; `levelFor*` returns level.

## Components

Buttons: `btn-primary`, `secondary`, `outline`, `ghost`,
`destructive`, `success`, `accent`, `hero`,
`outline-hero`, `outline-light`, `outline-error`,
`.link`. Cards: `.card`, `.card-flat`. Badges:
`.status-badge-success`, `.status-badge-warning`,
`.status-badge-error`.

**Dialog pattern.** Native `<dialog>` driven by `openDialog(id)`
/ `closeDialog(id)` from `dialog.ts`. The element is
`id="{id}-dialog"` with `class="dialog"` (and `aria-labelledby`
to its title); `openDialog` calls `showModal()` — the platform
supplies the top-layer focus trap, the `::backdrop`, and Escape
(the `cancel` event) — and `closeDialog` calls `close()`. No
backdrop div, no `hidden`/`aria-hidden`. Open and cancel
controls carry `data-dialog-open="{id}"` /
`data-dialog-cancel="{id}"`; each page routes its clicks through
`handleDialogClick(target, e)` (from `dialog.ts`), which opens,
closes, and light-dismisses by those attributes — one voice
across every dialog. Submit/confirm stay page-specific (a
`#{id}-submit` listener or a `data-*-action`).

**Tab pattern.** Use `initTabs('[data-tab]', '.tab-panel',
'active')` from `dialog.ts` — the third arg is the
active-state class. Tab buttons use `data-tab="{name}"`
attribute, panels use `id="tab-{name}"`.

When groups exist, use native `<optgroup label>` —
introducing case: AI-member model picker
`buildModelOptgroups`. Org switcher: sidebar footer
`.org-switcher` only when ≥2 orgs; CSS in
`components-organization-switcher.css`. Invitations
bell: `.icon-badge-host` / `.icon-count-badge`;
renders only when pending > 0.

## Heat ramp

A fixed-scale 4-stop ramp used by `flows/stats.html` to visualize a
node's share of trailing-90-day flow time. Stop positions are
*non-uniform* — the top quarter of the value range compresses
yellow → red, making a "bottleneck zone" visually salient:

| Token              | Position | Light          | Dark           |
|--------------------|----------|----------------|----------------|
| `--heat-stop-low`  | 0%       | `210 85% 55%`  | `210 60% 60%`  |
| `--heat-stop-mid`  | 50%      | `145 65% 50%`  | `145 50% 55%`  |
| `--heat-stop-high` | 75%      | `48 95% 55%`   | `48 80% 60%`   |
| `--heat-stop-peak` | 100%     | `0 80% 55%`    | `0 65% 60%`    |

**Mechanism.** Each node carries `style="--heat-t:${t}"` (a number in
`[0, 1]` — the raw share of flow time). The fill is computed in CSS by
three chained `color-mix(in oklch, ...)` invocations, one per ramp
segment, with each segment's mix fraction expressed as
`clamp(0%, calc((var(--heat-t) - <lo>) / <span> * 100%), 100%)` so
the segment activates over its t-range and saturates outside it.
Result: the palette stays in design tokens, the per-element data is a
single number, dark mode follows automatically, and there is *no*
color math in TypeScript.

**Legend.** A plain CSS `linear-gradient(to right, ...)` referencing
the same four tokens at the same four positions; end labels read `0%`
and `100%`. The exact percentage for each node is always available in
its hover stat card.

**Accessibility.** Blue / green / yellow / red is a classic
colorblind-tricky palette, but on this page color is never the sole
information channel: every node carries its avg-sojourn duration on
its face, and the hover card carries the exact percentage. The
gradient is decoration over data; the data path is colorblind-safe.

## Flow designer visuals

Canvas contract: [FLOW-CANVAS.md](FLOW-CANVAS.md).
Colors: grid on `hsl(var(--background))`; Regular
`hsl(var(--primary))`, Create `hsl(var(--success))`,
Archive `hsl(var(--error))`; forward edges primary,
cycle warning plus dashes; selection `--accent`;
locked `hsl(var(--accent-text))`.

## Iconography

Inline SVG in `web-app/app/icons.ts` (`SafeHtml`).
Stroke 2px; color inherits. `ICON_SIZE` extends
`--text-*` (adds `5xl` / `6xl`). `2xs` 10, `xs` 12,
`sm` 14, `base` 16, `lg` 18, `xl` 20, `2xl` 24,
`3xl` 28, `4xl` 32, `5xl` 40, `6xl` 48.

## Responsive breakpoints

Named: `sm` 640px, `md` 768px, `lg` 1024px, `xl`
1280px. `layout.css` shows and hides chrome;
`responsive.css` carries grid-column, visibility, and
reduced-motion.

## Motion and elevation

`--shadow-xs` … `--shadow-xl`. Durations: `instant`,
`fast`, `normal`, `slow`. Easing: `--ease-default`,
`--ease-in`, `--ease-out`.

## Content

Missing or zero: em-dash (`—`), never `0h` / `$0k` /
blank (`value ? formatted : '—'`). Plural: ternary
`${count} ${count === 1 ? 'item' : 'items'}`, never
`item(s)`. Error: "Unable to save. Please check your
connection and try again." Empty: "No projects yet.
Create your first project to get started."

## CSS architecture

Source lives in `web-app/app/styles/`. No raw style
strings except dynamic per-element values via CSS
custom properties. Colors stay in tokens. Page widths:
`.entity`, `.overview`, `.workspace`.

Cascade (`./build`; alpha within globs):

1. `tokens.css`
2. `fonts.css`
3. `light-mode.css`
4. `dark-mode.css`
5. `base.css`
6. `components-*.css`
7. `layout.css`
8. `utilities.css`
9. `responsive.css`
10. `command-palette.css`

Those ten are `assets/styles.css`. Then
`pages-*.css` per `cssBundles` on `page-registry.ts`;
compose fills `{{PAGE_CSS_LINKS}}`.

| Pattern | File |
|---------|------|
| 3+ pages, component | `components-X.css` |
| One page | `pages-X.css` |
| Single-property | `utilities.css` |
| Reset / html | `base.css` |
| Token | `tokens.css` |
| Theme HSL | `light-mode.css` / `dark-mode.css` |
| Shell | `layout.css` |
| Mobile override | `responsive.css` |

Below three pages, keep it in `pages-X.css` or
duplicate; promote at the third. New
`pages-NAME.css` or `components-NAME.css`: one-line
role header; pages also list `cssBundles`. File
rules: 78-char max; no hex; no `style="..."` except
dynamic custom properties; split past ~600 lines.

## How we got here

Tokens first, then variants on `data-tone` and
`data-level`, then per-page CSS bundles.

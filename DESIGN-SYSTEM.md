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
- **soft-foreground** — between muted-foreground and
  foreground (`.text-soft`); the status history's subject
- **background** / **foreground** / **card** /
  **border** / **input** / **ring**

Palette HSL lives in `palette.css`, under one `:root`.

**Type scale.** `--text-*` in `tokens.css`, each with a
`.text-*` class in `base.css`: `2xs` 11, `xs` 12, `xsm` 13,
`sm` 14, `base` 16, `lg` 18, `xl` 20, `2xl` 24, `3xl` 30,
`4xl` 36. `xsm` is the status history's line.

**Flow canvas chrome.** Two size tokens in `tokens.css`, beside
the `--width-*` group, hold the box the flow designer and the
flow stats page share, so their canvases measure the same
wherever the designer's header keeps its natural height:

- `--height-flow-header: calc(7.5rem + 1px)` — 121 px at a
  16 px root. The designer's header is padding 2 × 1rem, three
  1.5rem switches, two 0.5rem gaps, and a 1 px rule, in
  `border-box`: 32 + 72 + 16 + 1. That is the designer's
  natural height and its `min-height`, not a cap: below about
  860 px a long flow name wraps and grows the designer's
  header, so there the two canvases are not promised equal.
  The stats header takes the token as its fixed `height` from
  md up, and as its `min-height` on phones.
- `--width-flow-tools: 3rem` — the designer's tool column: a
  2.5rem icon button plus 2 × 0.25rem padding. The stats gutter
  takes the same width.

Pin: tests/browser/flow-canvas-box.test.ts 'the designer header,
tool column, and canvas keep their size'; same file, 'the stats
canvas measures what the designer canvas measures'.

## Variants

`data-tone` / `data-level` on a base class. The TS enum
and the CSS attribute selector share one source of
truth. Tones: `primary`, `success`, `warning`, `error`,
`info`, `muted`. Levels: `normal`, `warning`, `danger`.
`toneFor*` returns tone; `levelFor*` returns level.

## Components

Buttons: `btn-primary`, `secondary`, `outline`, `ghost`,
`destructive`, `success`, `hero`,
`outline-error`, `.link`. Cards:
`.card`, `.card-flat`, and `.status-card[data-tone]`,
which tints with the gauge card's recipe (soft fill,
0.4-alpha border).

**Displayed id.** Every id a page shows renders through
`idLabel(thing, id)` (`presenters/id-label.ts`) as a
`<code class="displayed-id">`. The markup holds the
whole id, for copy, search, and screen readers; CSS
alone clips it with an ellipsis. The clip needs room
to shrink: the id is a nowrap inline-block, so its full
width sets the min-content of every grid track and flex
item around it. Give each one that holds an id
`min-w-0`, as the workbox inbox columns and label spans
do, or the page widens instead.

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

**Segmented control.** A `role="group"` of
`btn btn-secondary btn-sm` buttons. Each carries
`aria-pressed`; one is `true`. No inline style. The
button classes are `.btn`, `.btn-secondary`, and
`.btn-sm` in `components-buttons.css`. The group
itself is utility layout (`flex items-center gap-2`);
`pages-members.css` and `pages-organization.css` add
no class for it. Two pages use it, under the
three-page line, so it stays off `components-*.css`.
Its users: the members kind filter
(`data-kind-chip`: All, Humans, AIs) and the members
state selector (`data-membership-state`: Members,
Former members). Organization sent-invitation filters
are `stateBadge` chips (`data-invitation-state`:
Pending, Declined, Revoked) on the sent card.

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

| Token              | Position | Value          |
|--------------------|----------|----------------|
| `--heat-stop-low`  | 0%       | `210 60% 60%`  |
| `--heat-stop-mid`  | 50%      | `145 50% 55%`  |
| `--heat-stop-high` | 75%      | `48 80% 60%`   |
| `--heat-stop-peak` | 100%     | `0 65% 60%`    |

**Mechanism.** Each node carries `style="--heat-t:${t}"` (a number in
`[0, 1]` — the raw share of flow time). `--heat` is computed in CSS by
three chained `color-mix(in oklch, ...)` invocations, one per ramp
segment, with each segment's mix fraction expressed as
`clamp(0%, calc((var(--heat-t) - <lo>) / <span> * 100%), 100%)` so
the segment activates over its t-range and saturates outside it.
A regular node wears the heat as its border (`stroke: var(--heat)`,
2 px, the designer's normal stroke), and its fill is the heat at
22 % in `--background` (`color-mix(in oklch, var(--heat) 22%,
hsl(var(--background)))`). The name is `--foreground`, 13 px
semibold; the second line, the average sojourn, is `--gray-300`
at `--text-2xs` (11 px). Create and Archive hold no time, so they
wear no heat: the designer's success and error borders on the plain
canvas, and a name alone. The palette stays in design tokens, the
per-element data is a single number, and there is *no* color math in
TypeScript.

Contrast, measured in Chrome: the worst case is yellow at t 0.75,
8.70:1 for the name and 6.18:1 for the second line. (`--muted-
foreground` would give 3.75:1 and fail.)

Pin: tests/browser/flow-stats-paint.test.ts 'node text holds 4.5:1
across the ramp' (the stroke is 2 px and both texts hold 4.5:1 at
every eighth of the ramp); tests/presenter-flow-stats.test.ts 'the
renderer emits no paint' (the markup carries only `--heat-t` and
class names; every paint property lives in `pages-flow-stats.css`).

**Legend.** The legend sits in the header bar, beside the path
stepper, between end labels `0%` and `100%`, captioned `share of
flow time`. The ramp is a plain CSS `linear-gradient(to right, ...)`
referencing the same four tokens at the same four positions. Below
`xl` (1280 px) the caption is visually hidden, still heard by
assistive technology, and the ramp narrows; see FLOW-CANVAS.md
`## Stats variant`. The exact percentage for each node is always
available in its hover stat card.

Pin: tests/presenter-flow-stats.test.ts 'the bar's legend: end
labels, caption, no inline gradient'; tests/browser/flow-stats.test.ts
'the bar's caption is seen at xl and only heard below it'.

**Accessibility.** Blue / green / yellow / red is a classic
colorblind-tricky palette, but on this page color is never the sole
information channel: every regular node carries its avg-sojourn duration on
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
3. `palette.css`
4. `base.css`
5. `components-*.css`
6. `layout.css`
7. `utilities.css`
8. `responsive.css`
9. `command-palette.css`

Those nine are `assets/styles.css`. Then
`pages-*.css` per `cssBundles` on `page-registry.ts`;
compose fills `{{PAGE_CSS_LINKS}}`.

| Pattern | File |
|---------|------|
| 3+ pages, component | `components-X.css` |
| One page | `pages-X.css` |
| Single-property | `utilities.css` |
| Reset / html | `base.css` |
| Token | `tokens.css` |
| Palette HSL | `palette.css` |
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

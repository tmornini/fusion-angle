# Fusion AI Design System

A production-ready design system for enterprise applications
prioritizing clarity, trust, focus, and calm decision-making.

## 1. Brand & Visual Foundation

### Primary Colors

Reference values only — never inline the hex, use the
matching token from `tokens.css`:

- **Primary Blue**: `hsl(217 36% 46%)`
- **Primary Yellow**: `hsl(48 98% 55%)`

### Blue Scale
| Token | HSL | Usage |
|-------|-----|-------|
| `blue-50` | `217 30% 97%` | Light backgrounds |
| `blue-100` | `217 30% 94%` | Secondary backgrounds |
| `blue-200` | `217 30% 88%` | Borders, dividers |
| `blue-300` | `217 32% 75%` | Disabled states |
| `blue-400` | `217 34% 60%` | Icons, accents |
| `blue-500` | `217 36% 46%` | **Primary brand** |
| `blue-600` | `217 38% 38%` | Hover states |
| `blue-700` | `217 40% 30%` | Active states |
| `blue-800` | `217 42% 22%` | Headlines |
| `blue-900` | `217 45% 15%` | **Primary text** |

### Neutral Grays (Blue-tinted)
All grays are derived from blue tones for brand cohesion.
**Never use pure black (#000)**.

## 2. Typography System

### Font Families
- **Display**: IBM Plex Sans (headlines, titles)
- **Body**: Inter (body text, UI elements)
- **Mono**: IBM Plex Mono (code, data)

### Type Scale
| Size | Value | Line Height | Usage |
|------|-------|-------------|-------|
| `2xs` | 11px | 16px | Metadata, timestamps |
| `xs` | 12px | 18px | Labels, helper text |
| `sm` | 14px | 20px | Body text (dense) |
| `base` | 16px | 24px | Body text (default) |
| `lg` | 18px | 28px | Card titles, subheadings |
| `xl` | 20px | 30px | Section headers |
| `2xl` | 24px | 32px | Page subtitles |
| `3xl` | 30px | 36px | Page titles |
| `4xl` | 36px | 40px | Hero headers |

### Font Weights
- `400` - Regular (body text)
- `500` - Medium (labels, buttons)
- `600` - Semibold (headings, emphasis)
- `700` - Bold (primary headlines)

## 3. Semantic Colors

### Status Colors (WCAG AA Compliant)

| Status | Background | Border | Text | Usage |
|--------|------------|--------|------|-------|
| Success | `success-soft` | `success-border` | `success-text` | Approved |
| Warning | `warning-soft` | `warning-border` | `warning-text` | Pending  |
| Error | `error-soft` | `error-border` | `error-text` | Rejected, failed |
| Info | `info-soft` | `info-border` | `info-text` | Informational |

### Contrast Ratios

Measured from the shipped light-mode tokens (WCAG 2.x
relative luminance); every pair clears the 4.5:1 AA floor.

- Primary text on white: **15.91:1** ✓
- Muted text on white: **6.06:1** ✓
- Button text on primary: **5.35:1** ✓
- Success button text on `success`: **5.88:1**
  (hover **4.62:1**) ✓
- Status text on soft bg: **4.87:1+** (success 4.87,
  warning 5.32, error 6.19, info 8.93) ✓

### Variants via `[data-tone]` and `[data-level]`

Components apply semantic variants through `data-*` attributes
on a base class rather than distinct class names. Presenters
emit the attribute value; the attribute selectors in the
`components-*.css` files bind it to the matching token set.
The TypeScript enum returned by `toneFor*()` / `levelFor*()`
helpers and the CSS selectors share a single source of truth.

```html
<div class="icon-box" data-tone="success">…</div>
<div class="progress-bar" data-level="warning"
     style="--progress-fill:60%">…</div>
```

**`[data-tone]` values**: `primary`, `success`, `warning`,
`error`, `info`, `muted`.
Applied to: `.pill`, `.icon-box`, `.icon-box-lg`,
`.legend-dot`, `.btn-outline`, `.gauge-card`, `.ds-soft-btn`,
`.ds-soft-row`, `.spark-tip-change`, and
`.score-history-table td` (score cells, via `toneForScore`).

**`[data-level]` values**: `normal`, `warning`, `danger`.
Applied to: `.progress-bar` fill regions.

**Exception — the credential-reveal panel.** The snapshots-
page demo-credentials panel (`.credential-reveal`,
`presenters/credential-reveal.ts` + `pages-snapshots.css`) carries a
`data-tone="warning"` attribute for semantics, but its
warning border color is applied by the `.credential-reveal`
class itself (`border: 1px solid hsl(var(--warning))`), NOT
by a `[data-tone]` selector binding — `.credential-reveal`
is not in the applied-to list above. The monospace
`.credential-reveal-box` (one credential per line) and the
copy-all button complete the one-time, post-wipe reveal.

Helper naming: `toneFor*(status)` returns a `[data-tone]`
value, `levelFor*(value)` returns a `[data-level]` value.
Replaces the older `styleFor*` pattern that returned
inline-style strings.

## 4. Spacing System (8pt Grid)

| Token | Value | Pixels |
|-------|-------|--------|
| `space-1` | 0.25rem | 4px |
| `space-2` | 0.5rem | 8px |
| `space-3` | 0.75rem | 12px |
| `space-4` | 1rem | 16px |
| `space-6` | 1.5rem | 24px |
| `space-8` | 2rem | 32px |
| `space-12` | 3rem | 48px |
| `space-16` | 4rem | 64px |

### Usage Guidelines
- **Component padding**: `space-3` to `space-6`
- **Section margins**: `space-6` to `space-12`
- **Page padding**: `space-4` (mobile) to `space-8` (desktop)
- **Card gaps**: `space-4` to `space-6`

## 5. Component Guidelines

### Buttons

#### Variants
| Variant | Usage | Example |
|---------|-------|---------|
| `default` | Primary actions | "Create Project" |
| `secondary` | Secondary actions | "Cancel", "Back" |
| `outline` | Tertiary actions | "View Details" |
| `ghost` | Minimal UI, icons | Icon buttons |
| `destructive` | Dangerous actions | "Delete" |
| `success` | Positive actions | "Approve" |
| `soft-*` | Subtle emphasis | Status filters |

#### Sizes
| Size | Height | Usage |
|------|--------|-------|
| `xs` | 28px | Dense tables, inline |
| `sm` | 32px | Secondary, compact |
| `default` | 40px | Standard |
| `lg` | 44px | Primary CTAs |
| `xl` | 48px | Hero sections |

### Cards

```html
<!-- Standard card -->
<div class="card p-6">
  Content
</div>

<!-- Flat card (no hover effect) -->
<div class="card-flat p-4">
  Content
</div>
```

### Status Badges

```html
<span class="status-badge-success">Approved</span>
<span class="status-badge-warning">Pending</span>
<span class="status-badge-error">Rejected</span>
```

### Pending-invitations indicator

The top-bar bell with a count badge, signalling that the
caller has invitations awaiting a response. Styled in
`components-badges.css`:

- `.icon-badge-host` — a `position: relative` anchor placed
  on the icon button so the badge can be positioned against
  it.
- `.icon-count-badge` — a small pill at the button's
  top-right corner: `background: hsl(var(--primary))`,
  `color: hsl(var(--primary-foreground))`, and a 2px
  `hsl(var(--card))` border so it reads cleanly over the
  button. Carries the pending count.

```html
<button class="btn-ghost icon-badge-host">
  <!-- bell SVG -->
  <span class="icon-count-badge">3</span>
</button>
```

The bell renders **only** when the caller has one or more
pending invitations; the badge shows that count. There is no
empty bell — the affordance is honest, present exactly when
there is something to act on.

### Command Palette

Cmd+K (or Ctrl+K) overlay for quick navigation and search.
Implemented in `web-app/app/command-palette.ts`.

- Full keyboard navigation (arrow keys, Enter to select, Escape to close)
- Searches across pages, ideas, projects, and members
- Renders categorized results with icons
- Focuses the search input on open; restores focus on close

### Heat ramp (flow-stats)

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

### Flow Designer

SVG workflow canvas in `web-app/app/flow-graph.ts`
with interactions in `flow-interactions.ts` and
presenter in `presenters/flow-designer.ts`.

**Canvas**: Dot grid pattern, 24px cell size, on
`hsl(var(--background))`.

**Nodes**: 160×64 px rounded rectangles, 10 px corner
radius. Three types, all rendered with the unified
`flow-node` class but stroked per type: Regular uses
`hsl(var(--primary))`, Create `hsl(var(--success))`, and
Archive `hsl(var(--error))`:

| Type    | Port             | Draggable |
|---------|------------------|-----------|
| Create  | When unconnected | Yes       |
| Archive | When unconnected | Yes       |
| Regular | Right side       | Yes       |

A Create or Archive node shows a port only while it has no
connections (`canShowPort`); a connected special node hides it.

**Edges**: Cubic bezier curves between node
perimeters, rendered with the unified `flow-edge` class.

| Type    | Dash    |
|---------|---------|
| Forward | Solid   |
| Cycle   | Dashed  |

Forward edges stroke `hsl(var(--primary))`; cycle edges
add a warning-color stroke and CSS dashes. Each edge
references a pre-colored arrowhead marker chosen by type:
`#flow-arrow` (primary fill) or `#flow-arrow-warn` (warning
fill), so each head matches its own line.

Edge classification at render time uses DFS
back-edge detection in `removeCycles`: during a
depth-first traversal from the start node, any edge
whose target is currently on the DFS stack is a
back-edge and renders as a cycle. During a shift-drag
to create a new edge, the separate `wouldBeCycle`
helper uses reachability (`isReachable`) to preview
whether the prospective edge would close a loop.

Labels render at the bezier midpoint in a pill with
`--color-card-bg` background. Bidirectional pairs
are separated with a perpendicular offset.

**Selection**: `--accent` gold glow filter on the
selected node, and the same glow filter on the selected
edge (edge stroke stays at the base 2 px).

**Locked**: When a flow is locked, all node rectangles,
edge paths, and edge-label backgrounds re-stroke in
`hsl(var(--accent-text))` (theme-adapted gold). The dot
grid renders in its default unlocked colors. The unified
primary stroke is restored when unlocked.

**Constraints**:
- No duplicate edges (same direction between a pair)
- Start node: one outgoing edge, no incoming
- Complete node: no outgoing edges, multiple incoming
  allowed from different nodes
- Bidirectional pairs separated with perpendicular
  offset

**Properties panel header**: The node panel's
`.flow-props-header` carries the "State Properties" title
on the left and the close button on the right. Member
assignment lives below it in a `.member-select-fieldset`
(legend "Members") with two `.member-group` blocks —
HUMANS and AIs — of checkboxes, not a `<select>`.

### Form Controls

`<select class="input">` with flat `<option>`
children is the standard pattern for dropdowns
across the app (project status, profile
department, filter selectors, etc.).

When a select has semantically distinct option
groups, use native `<optgroup label="...">` rather
than disabled-option separators or custom dropdown
components. The AI-member model picker
(`buildModelOptgroups`, grouping models by provider)
is the introducing case — `<optgroup>` is the
codebase's standard for grouped selects from this
point forward. Browser default styling (bold-italic
group labels) is fine; no override needed.

The sidebar org-switcher `<select>` is the documented
exception to the `.input` select standard: it is a
compact control styled by `.org-switcher`
(`components-org-switcher.css`), not `.input`. It was
re-homed from the old top-bar greeting into the sidebar
footer.

### Sidebar org switcher

The native `<select>` (`.org-switcher`) by which a member
chooses the active org, paired with a quiet "Set as
default" button (`.org-set-default`). The two sit in an
`.org-switcher-group` cluster. CSS in
`components-org-switcher.css`.

The switcher renders **only** when the member can reach two
or more orgs; a single-org member sees plain org text
instead — no control where there is no choice.

In the sidebar footer the cluster wraps in
`.sidebar-org-switcher`, which restyles the inline
`.org-switcher-group` to stack vertically: the `<select>`
goes full-width over the quiet "Set as default" button.
When the sidebar is collapsed (`.sidebar-collapsed`) the
whole `.sidebar-org-switcher` is hidden.

```html
<div class="sidebar-org-switcher">
  <span class="org-switcher-group">
    <select class="org-switcher"><!-- orgs --></select>
    <button class="org-set-default">Set as default</button>
  </span>
</div>
```

### Dark Mode

CSS custom properties on `:root` define light theme values.
The `[data-theme="dark"]` selector overrides them for dark
mode. Toggle is persisted to `localStorage` and respects
`prefers-color-scheme` for initial detection.

```css
:root { --background: var(--gray-50); }
[data-theme="dark"] { --background: var(--gray-900); }
```

## 6. Interaction States

### State Guidelines
| State | Visual Change |
|-------|---------------|
| Default | Base styling |
| Hover | Slight bg change, cursor pointer |
| Focus | 2px ring, ring-offset-2 |
| Active | Darker bg, pressed effect |
| Disabled | 50% opacity, no pointer |
| Error | Red border, error text |

### Focus Management
- All interactive elements must have visible focus states
- Use `focus-visible` for keyboard-only focus
- Ring color matches primary brand

## 7. Elevation & Shadows

| Level | Token | Usage |
|-------|-------|-------|
| 0 | `shadow-xs` | Subtle separation |
| 1 | `shadow-sm` | Cards, inputs |
| 2 | `shadow-md` | Dropdowns, hover |
| 3 | `shadow-lg` | Modals, popovers |
| 4 | `shadow-xl` | Dialogs, overlays |

## 8. Motion Guidelines

### Duration Scale
| Token | Value | Usage |
|-------|-------|-------|
| `instant` | 50ms | Toggle states |
| `fast` | 150ms | Hover, focus |
| `normal` | 200ms | Transitions |
| `slow` | 300ms | Modals, drawers |

### Easing
- **Default**: `cubic-bezier(0.4, 0, 0.2, 1)` - Most transitions
- **Ease-in**: `cubic-bezier(0.4, 0, 1, 1)` - Accelerate
- **Ease-out**: `cubic-bezier(0, 0, 0.2, 1)` - Decelerate

### Motion Principles
1. Motion should be subtle and purposeful
2. Avoid decorative animations
3. Use motion to show cause and effect
4. Respect reduced-motion preferences

## 9. Iconography

### Style Guide
- **Library**: Inline SVG functions in `web-app/app/icons.ts`
  (line-based, each returns a `SafeHtml` value)
- **Stroke width**: 2px
- **Color**: Inherit from parent or use `text-muted`

### Icon Sizing
Sizes are a named tier scale — `ICON_SIZE` in `icons.ts` —
sharing the tier names of the `--text-*` typography tokens.
The `IconFn` size argument is typed `IconSize`, so a call
passing an off-scale pixel value fails the type-check.

| Tier | Size | Typical use |
|--------|------|------------------------------------|
| `2xs` | 10px | Smallest inline markers |
| `xs` | 12px | Small labels and metadata |
| `sm` | 14px | Inline chips and status |
| `base` | 16px | Inline text and buttons (default) |
| `lg` | 18px | Emphasised inline icons |
| `xl` | 20px | Nav, cards, toolbar actions |
| `2xl` | 24px | Feature and section icons |
| `3xl` | 28px | Prominent standalone icons |
| `4xl` | 32px | Large state icons |
| `5xl` | 40px | Avatar and brand marks |
| `6xl` | 48px | Empty states and full-page errors |

## 10. Content Guidelines

### Tone
- Clear and direct
- Professional but approachable
- No jargon for business users
- Action-oriented

### Data Formatting
- **Missing/zero values**: Display `—` (em-dash) instead of
  `0h`, `$0k`, or blank. Use the guard pattern:
  `value ? formatted : '—'`
- **Singular/plural**: Use ternary grammar —
  `${count} ${count === 1 ? 'item' : 'items'}` — never
  parenthetical `item(s)` form
- **Section headers (h3)**: Always include `font-display`
  class on section header h3 tags to use the display
  typeface (IBM Plex Sans)

### Error Messages
**Do:**
- "Unable to save. Please check your connection and try again."

**Don't:**
- "Error 500: Internal server error"

### Empty States
**Do:**
- "No projects yet. Create your first project to get started."

**Don't:**
- "No data"

## 11. Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| `sm` | 640px | Large phones |
| `md` | 768px | Tablets |
| `lg` | 1024px | Small laptops |
| `xl` | 1280px | Desktops |

### Layout Rules
- **Mobile**: Single column, full-width cards
- **Tablet**: Two columns, collapsible sidebar
- **Desktop**: Three columns, fixed sidebar

## 12. CSS Architecture

Source lives in `web-app/app/styles/`. Single source of truth —
no inline styles (CSP forbids `unsafe-inline`).

### Cascade order

The build cascade is locked in `./build`. Each file group loads
in this order, and within glob groups, alphabetical order
applies:

1. `tokens.css` — design tokens (CSS custom properties)
2. `fonts.css` — `@font-face` declarations
3. `light-mode.css` — light theme HSL assignments
4. `dark-mode.css` — dark theme overrides
5. `base.css` — global resets, view transitions
6. `components-*.css` — reusable component families
   (avatar, badges, brand, buttons, cards, controls,
   dialog, feedback, inputs, layout-helpers, menus,
   metrics, org-switcher, page-placeholder, tables, tabs,
   toast)
7. `layout.css` — sidebar, header, main-content shell
8. `utilities.css` — single-property primitives plus
   container widths
9. `responsive.css` — mobile breakpoint overrides
   (uses `!important` to win against earlier files)
10. `command-palette.css` — search overlay

These 10 groups concatenate into `assets/styles.css`, the
shared bundle every page loads.

11. `pages-*.css` — page-scoped styles (NOT in the shared
    bundle; each file emits its own per-page bundle)

### Per-page bundles

Each page's `PageEntry` in `web-app/app/page-registry.ts`
optionally declares which per-page bundles it loads:

```typescript
'flow-stats': {
    // ...
    cssBundles: ['pages-flow-stats'],
},
```

Multiple pages can share one bundle — `idea-detail`,
`idea-create`, and `idea-convert` all declare
`['pages-ideas']`.

At compose time, `compose.ts` reads `cssBundles` and replaces
the `{{PAGE_CSS_LINKS}}` placeholder in the page's HTML
with one `<link rel="stylesheet" href="../assets/pages-X.css"
/>` tag per bundle. Pages without `cssBundles` get the
placeholder removed entirely (no stray whitespace).

At build time, every `pages-*.css` file emits its own minified
bundle via the `pages-*.css` glob in `./build`.

### Browser parallel-loading

All modern browsers fetch `<link rel="stylesheet">` tags in
parallel. HTTP/1.1 opens ~6 connections per origin; HTTP/2+
multiplexes a single connection. Total page wait equals
`max(file_load_times)`, not the sum. Splitting the monolith
into shared + per-page bundles is a strict byte win because
each page downloads less total CSS, all parallel-loaded.

Caveat: very small files (under ~5KB) cost more per-request
overhead than they save. Our per-page bundles range from
~0.1 KB to ~9.6 KB — well above that threshold for the larger
bundles, and the smaller ones still amortize via HTTP/2
multiplexing.

### When to add to which file

| Pattern type                          | Target                    |
|---------------------------------------|---------------------------|
| Used by 3+ pages, component-shaped    | `components-X.css`        |
| Used by one page, page-shaped         | `pages-X.css`             |
| Single-property reusable              | `utilities.css`           |
| Global reset, body/html, transitions  | `base.css`                |
| Design token                          | `tokens.css`              |
| Theme HSL assignment                  | `light-mode.css` / `dark-mode.css` |
| Sidebar/header/main shell             | `layout.css`              |
| Mobile-only override                  | `responsive.css` (`!important`) |

Below the 3-page threshold, keep selectors in a
`pages-X.css` file, or duplicate. At the third instance,
promote to `components-X.css`.

### Adding a new page-scoped CSS file

1. Create `web-app/app/styles/pages-NAME.css` with a one-line
   role header comment (e.g.,
   `/* Inbox: tray, item card, sort affordances. */`).
2. Add `cssBundles: ['pages-NAME']` to every matching entry in
   `web-app/app/page-registry.ts`.
3. Build emits the per-page bundle automatically via the
   `pages-*.css` glob in `./build`.

### Adding a new component family

1. Create `web-app/app/styles/components-NAME.css` with a
   role header.
2. Build picks it up via the `components-*.css` glob; loads
   alphabetically among other components.
3. No `cssBundles` change — components ship in the shared
   bundle for every page.

### File-level rules

- Each file leads with a one-line role header comment.
- 78-char max per line in CSS files (enforced by `./validate`).
- No raw hex colors — `hsl(var(--token))` only.
- No `style="..."` inline strings except dynamic per-element
  values via CSS custom properties (see § 5 Component
  Guidelines for the pattern).
- Files under ~600 lines. If a file grows past that, split by
  sub-family.

## 13. Do's and Don'ts

### Do
- ✅ Use semantic color tokens, not raw hex values
- ✅ Maintain consistent spacing with the 8pt grid
- ✅ Ensure all interactive elements have focus states
- ✅ Use the proper typography scale for hierarchy
- ✅ Test contrast ratios for accessibility

### Don't
- ❌ Use pure black (#000) for text
- ❌ Create custom colors outside the system
- ❌ Use decorative animations
- ❌ Skip focus states on interactive elements
- ❌ Mix typography scales inconsistently

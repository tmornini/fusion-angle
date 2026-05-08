# Fusion AI Design System

A production-ready design system for enterprise applications prioritizing clarity, trust, focus, and calm decision-making.

## 1. Brand & Visual Foundation

### Primary Colors
- **Primary Blue**: `#4B6CA1` → `hsl(217, 36%, 46%)`
- **Primary Yellow**: `#FDD31D` → `hsl(48, 98%, 55%)`

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
All grays are derived from blue tones for brand cohesion. **Never use pure black (#000)**.

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
| Success | `success-soft` | `success-border` | `success-text` | Approved, complete |
| Warning | `warning-soft` | `warning-border` | `warning-text` | Under review, pending |
| Error | `error-soft` | `error-border` | `error-text` | Rejected, failed |
| Info | `info-soft` | `info-border` | `info-text` | Informational |

### Contrast Ratios
- Primary text on white: **8.5:1** ✓
- Muted text on white: **5.2:1** ✓
- Button text on primary: **6.8:1** ✓
- Status text on soft bg: **5.1:1+** ✓

### Variants via `[data-tone]` and `[data-level]`

Components apply semantic variants through `data-*` attributes on a base class rather than distinct class names. Presenters emit the attribute value; the attribute selectors in `components.css` bind it to the matching token set. The TypeScript enum returned by `toneFor*()` / `levelFor*()` helpers and the CSS selectors share a single source of truth.

```html
<div class="icon-box" data-tone="success">…</div>
<div class="progress-bar" data-level="warning" style="--progress-fill:60%">…</div>
```

**`[data-tone]` values**: `primary`, `success`, `warning`, `error`, `info`, `muted`.
Applied to: `.pill`, `.icon-box`, `.status-dot`, `.legend-dot`, `.btn-outline`, `.action-card`, `.stat-cell`.

**`[data-level]` values**: `normal`, `warning`, `danger`.
Applied to: `.progress-bar`, `.gauge` fill regions.

Helper naming: `toneFor*(status)` returns a `[data-tone]` value, `levelFor*(value)` returns a `[data-level]` value. Replaces the older `styleFor*` pattern that returned inline-style strings.

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

### Metric Widgets

```html
<div class="metric-widget">
  <span class="metric-widget-label">Revenue</span>
  <span class="metric-widget-value">$45,000</span>
  <span class="metric-widget-trend-up">+12%</span>
</div>
```

### Command Palette

Cmd+K (or Ctrl+K) overlay for quick navigation and search. Implemented in `web-app/app/command-palette.ts`.

- Full keyboard navigation (arrow keys, Enter to select, Escape to close)
- Searches across pages, ideas, and projects
- Renders categorized results with icons
- Focus trap while open

### Charts

`build*` functions in `web-app/app/charts.ts` return `SafeHtml` for inline SVG charts. All charts use design system colors and respond to dark mode.

| Type | Function | Usage |
|------|----------|-------|
| Bar | `buildBarChart()` | Comparisons, category breakdowns |
| Line | `buildLineChart()` | Trends over time |
| Donut | `buildDonutChart()` | Proportions, status distribution |
| Area | `buildAreaChart()` | Volume trends |

### Flow Designer

SVG workflow canvas in `web-app/app/flow-graph.ts`
with interactions in `flow-interactions.ts` and
presenter in `presenters/flow-designer.ts`.

**Canvas**: Dot grid pattern, 24px cell size, on
`--color-surface` background.

**Nodes**: 160×64 px rounded rectangles, 10 px corner
radius. Three types:

| Type | Border | Port | Draggable |
|------|--------|------|-----------|
| Start (New) | Green `#16a34a`, 2.5 px | None | No |
| Complete | Red `#b91c1c`, 3 px | None | Yes |
| Regular | Blue `#4B6CA1`, 2 px | Right side | Yes |

**Edges**: Cubic bezier curves between node
perimeters.

| Type | Stroke | Arrow | Dash |
|------|--------|-------|------|
| Forward | Blue `#4B6CA1` | Blue | Solid |
| Cycle | Amber `#d97706` | Amber | `6 3` |

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

**Selection**: `--accent` gold glow filter on
selected node, thicker stroke (3 px) on selected edge.

**Locked**: When a flow is locked, all node rectangles,
edge paths, and edge-label backgrounds re-stroke in
`--accent-text` (theme-adapted gold). The dot grid
renders in its default unlocked colors. Per-type
border colors (Start green, Complete red, Regular
blue, Cycle amber-dashed) are visually overridden by
the locked-state stroke and restored when unlocked.

**Constraints**:
- No duplicate edges (same direction between a pair)
- Start node: one outgoing edge, no incoming
- Complete node: no outgoing edges, multiple incoming
  allowed from different nodes
- Bidirectional pairs separated with perpendicular
  offset

**Properties panel header**: Regular nodes display
the panel with a Crew `<select>` centered in the
header (no "State Properties" title) and the close
button on the right, via the
`.flow-props-header-with-crew` modifier on
`.flow-props-header`. Start/End/Edge panels keep
the original 2-column flex layout with their title
on the left. The Crew `<select>` uses
`<optgroup label="Users">` and
`<optgroup label="Models">` to group its options.

### Form Controls

`<select class="input">` with flat `<option>`
children is the standard pattern for dropdowns
across the app (project status, profile
department, filter selectors, etc.).

When a select has semantically distinct option
groups, use native `<optgroup label="...">` rather
than disabled-option separators or custom dropdown
components. The Crew dropdown on flow node panels
is the introducing case — `<optgroup>` is the
codebase's standard for grouped selects from this
point forward (Commandment III: one codebase, one
voice). Browser default styling (bold-italic group
labels) is fine; no override needed.

### Dark Mode

CSS custom properties on `:root` define light theme values. The `[data-theme="dark"]` selector overrides them for dark mode. Toggle is persisted to `localStorage` and respects `prefers-color-scheme` for initial detection.

```css
:root { --bg-primary: hsl(0 0% 100%); }
[data-theme="dark"] { --bg-primary: hsl(217 45% 10%); }
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
- **Bounce**: `cubic-bezier(0.34, 1.56, 0.64, 1)` - Success feedback

### Motion Principles
1. Motion should be subtle and purposeful
2. Avoid decorative animations
3. Use motion to show cause and effect
4. Respect reduced-motion preferences

## 9. Iconography

### Style Guide
- **Library**: Inline SVG functions in `web-app/app/icons.ts` (line-based, each returns a `SafeHtml` value)
- **Default size**: 16px (inline), 20px (buttons), 24px (standalone)
- **Stroke width**: 2px
- **Color**: Inherit from parent or use `text-muted-foreground`

### Icon Sizing
| Context | Size |
|---------|------|
| Inline text | 16px |
| Buttons | 16px |
| Cards | 20px |
| Feature icons | 24px |
| Empty states | 48px |

## 10. Content Guidelines

### Tone
- Clear and direct
- Professional but approachable
- No jargon for business users
- Action-oriented

### Data Formatting
- **Missing/zero values**: Display `—` (em-dash) instead of `0h`, `$0k`, or blank. Use the guard pattern: `value ? formatted : '—'`
- **Singular/plural**: Use ternary grammar — `${count} ${count === 1 ? 'item' : 'items'}` — never parenthetical `item(s)` form
- **Breadcrumb links**: Always use `class="hover-link"` for breadcrumb navigation links (not `text-primary`)
- **Section headers (h3)**: Always include `font-display` class on section header h3 tags to use the display typeface (IBM Plex Sans)

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

## 12. Do's and Don'ts

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


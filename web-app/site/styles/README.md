# CSS Modules

CSS split into cascade-ordered modules. The build concatenates these files (in order) into a single `style.css` for distribution. For development, `../style.css` uses `@import` directives.

## Cascade Order

Order matters for correct specificity. Files must be concatenated in this sequence:

| # | File | Purpose |
|---|------|---------|
| 1 | `fonts.css` | `@font-face` declarations (IBM Plex Sans, Inter, IBM Plex Mono) |
| 2 | `tokens.css` | `:root` custom properties — colors, spacing, radii, shadows |
| 3 | `dark-mode.css` | `[data-theme="dark"]` overrides |
| 4 | `base.css` | Reset, typography base, focus/selection styles |
| 5 | `components.css` | Buttons, inputs, cards, badges, tables, tabs, dialogs, tooltips, toasts, etc. |
| 6 | `layout.css` | Dashboard grid, sidebar, header, named grid classes (`.gauge-grid`, `.detail-grid`, etc.) |
| 7 | `utilities.css` | Utility classes (`.flex`, `.hidden`, `.text-muted`) and animations |
| 8 | `responsive.css` | Media queries and `prefers-reduced-motion` |
| 9 | `pages.css` | Page-specific styles (landing, auth, onboarding, etc.) |
| 10 | `command-palette.css` | Command palette overlay styles |

## Design Tokens

All colors, spacing, and shadows are defined as CSS custom properties in `tokens.css` (light mode) with dark overrides in `dark-mode.css`. See `DESIGN-SYSTEM.md` for the full specification.

# GOALS

Transform this React SPA into a dependency-free static application.

## Objective

All routes defined in `App.tsx` and all components, styles, and assets they transitively depend on must be converted to vanilla HTML, CSS, and TypeScript. Everything else must be eliminated, including dynamic code that gets stranded.

The transformed application should look and behave as nearly identically to the current version as is reasonable, except where the current version does not currently behave correctly.

## Architecture

### Entry Point

A single `index.html` at the root serves as the sole entry point for the entire application.

### Routing

Hash-based client-side routing (`window.location.hash`). A small router function maps hash fragments to page-render functions. Navigation uses `<a href="#/dashboard">` style links. This works on both HTTP servers and `file://` (double-click).

### Source Organization

- Per-page TypeScript modules in folders named for the page
- CSS and TypeScript code referenced by more than a single page consolidated into shared `site/style.css` and `site/script.ts` files
- All required font files included

### Dark Mode

CSS custom properties with a `data-theme` attribute on `<html>`. All colors defined as custom properties in `:root` (light) and `[data-theme="dark"]` (dark). Toggle persists to `localStorage`. This replaces `next-themes`.

### UI Components

Reimplement the shadcn/Radix component library natively, prioritized by tier:

- **Reimplement natively**: Button, Card, Badge, Input, Select, Tabs, Dialog/Modal, Sheet (mobile sidebar), Tooltip, DropdownMenu, Table
- **Simplify with native HTML**: Accordion via `<details>`/`<summary>`, Toast/Sonner via a simple notification div with fade animation
- **Drop if unused**: Carousel, Calendar, Drawer (if Sheet covers it), Command palette

This is the largest piece of work.

### Charts

Replace Recharts with hand-rolled SVG rendering functions for bar, line, donut, and area charts.

### Mock Data

All mock data functions must be `async` and return `Promise`s, matching the signature of the eventual HTTP API calls they will replace. Mock functions return hardcoded data directly — no `fetch`, no network calls. This ensures the app works on `file://`.

```ts
async function getIdeas(): Promise<Idea[]> {
  return [/* mock data */]
}
```

When the real API is wired in, only the function body changes.

## Dependencies

All runtime browser dependencies (React, React Router, Radix, TanStack Query, Recharts, next-themes, etc.) must be eliminated. Build-time tools (TypeScript compiler, bundler/minifier) are acceptable as devDependencies.

## Build

An executable bash script (`build`) that:

- Compiles TypeScript (no source maps)
- Bundles and aggressively minifies all TypeScript into a single JavaScript file
- Creates a distribution ZIP file
  - Named: `fusion-ai-YYYYMMDDTHHMMSSZ.zip` (ISO 8601 basic format, no hyphens or colons)
  - Includes every file in place as required to deliver the app both via HTTP server and by double-clicking `index.html`, using relative paths

## Code Quality

The final code should be concise yet easily readable by using function calls to provide readability, particularly in non-trivial conditional statements or any code blocks that build up data structures, and have impeccably consistent naming throughout the code base, which is to say call a thing a thing, including a function that creates a thing.

## When Finished

Update CLAUDE.md to detail the newly streamlined system.

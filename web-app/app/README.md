# App Source

**Parent:** [web-app](../README.md)

All TypeScript and CSS source code for the application. Static assets (fonts, favicon) are in `../assets/`.

## Files

| File | Purpose |
|------|---------|
| `core.ts` | Page dispatch, navigation helpers, toast notifications, sidebar/mobile behavior, skeleton rendering |
| `icons.ts` | ~100 SVG icon functions and `icons` lookup map (re-exported from `core.ts`) |
| `state.ts` | AppState interface, theme persistence, mobile detection, pub-sub (`subscribe`/`setState`) |
| `dom.ts` | querySelector wrappers ($, $$) |
| `toast.ts` | showToast() auto-dismiss notifications |
| `config.ts` | edgeStatusConfig mapping |
| `safe-html.ts` | SafeHtml class, html tagged template, trusted(), setHtml() |
| `loading-states.ts` | Loading skeletons, error states, empty states, withLoadingState() |
| [`adapters/`](adapters/README.md) | ~45 adapter functions split into domain modules with barrel re-export (`adapters/index.ts`) |
| [`styles/`](styles/README.md) | CSS modules in cascade order: fonts, tokens, dark-mode, base, components, layout, utilities, responsive, pages, command-palette |
| `charts.ts` | SVG chart rendering functions (bar, line, donut, area) |
| `command-palette.ts` | Cmd+K search overlay with keyboard navigation and result rendering |
| `compose.ts` | Build-time script that assembles `components-layout.html` with `component-*.html` files and each page's `index.html` to produce composed standalone pages. Exits with error if any page is missing. |
| `components-layout.html` | Layout skeleton with component placeholders |
| `component-*.html` | UI components (sidebar, top-bar, mobile-header, mobile-sidebar) |
| `tsconfig.json` | TypeScript compiler configuration |

## Adapter Modules (`adapters/`)

Domain-specific adapter functions organized by module:

| Module | Exports |
|--------|---------|
| `helpers.ts` | `buildUserMap`, `userName`, `parseJson`, `getEdgeDataByIdeaId`, `buildDefaultEdgeData`, `getEdgeDataWithConfidence` |
| `shared.ts` | `getTimeOfDay`, `getCurrentUser` |
| `dashboard.ts` | `getDashboardGauges`, `getDashboardStats` |
| `ideas.ts` | `getIdeas`, `getIdeaDetail`, `getReviewQueue`, `getIdeaForConversion`, `getIdeaForApproval`, `getEdgeForApproval`, `getIdea`, `putIdea` |
| `projects.ts` | `getProjects`, `getProjectById`, `getProjectForEngineering`, `putProject`, `putMilestone` |
| `teams.ts` | `getTeamMembers`, `getManagedUsers` |
| `edges.ts` | `getIdeaForEdge`, `getEdgeList`, `putEdgeData` |
| `tools.ts` | `getCrunchColumns`, `getFlows`, `getFlow`, `putFlow`, `putFlowStep` |
| `admin.ts` | `getAccount`, `getProfile`, `getCompanySettings`, `getActivityFeed` |
| `snapshots.ts` | `deleteSchema`, `createSchema`, `loadMockData`, `importSnapshot`, `exportSnapshot`, `hasData` |
| `index.ts` | Barrel re-export of all modules |

All page modules import from `'../../app/adapters'` — with `moduleResolution: "bundler"`, this resolves to `adapters/index.ts` automatically.

## Build-Time Composition

`compose.ts` reads `components-layout.html`, injects `component-*.html` files, then for each sidebar-layout page:

1. Substitutes `<!-- COMPONENT_* -->` placeholders with component content
2. Substitutes `<!-- PAGE_CONTENT -->` with the page's HTML content
3. Writes the composed file to the build output directory

This produces 20 composed pages. The remaining 7 standalone pages are copied directly.

## Key Exports from `core.ts`

- **Icons** — `iconSparkles(size, cssClass)`, `iconPlus()`, etc. (~100 functions, defined in `icons.ts`, each returns `SafeHtml`)
- **Navigation** — `navigateTo(page, params?)` constructs relative URLs
- **State** — pub-sub for theme, mobile detection, auth, sidebar state (defined in `state.ts`)
- **Toast** — `showToast(message, type)` with auto-dismiss
- **Page dispatch** — reads `data-page` attribute on `DOMContentLoaded` to call the correct module's `init()`

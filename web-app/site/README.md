# Site Infrastructure

Shared code and assets used by all pages in the application.

## Files

| File | Purpose |
|------|---------|
| `script.ts` | Page dispatch, navigation helpers, toast notifications, sidebar/mobile behavior, skeleton rendering |
| `icons.ts` | ~100 SVG icon functions and `icons` lookup map (re-exported from `script.ts`) |
| `state.ts` | AppState interface, theme persistence, mobile detection, pub-sub (`subscribe`/`setState`) |
| `data/` | ~28 async adapter functions split into domain modules with barrel re-export (`data/index.ts`) |
| `styles/` | CSS modules in cascade order: fonts, tokens, dark-mode, base, components, layout, utilities, responsive, pages, command-palette |
| `style.css` | `@import` barrel for dev; build bundles and minifies via esbuild into a single file |
| `charts.ts` | SVG chart rendering functions (bar, line, donut, area) |
| `command-palette.ts` | Cmd+K search overlay with keyboard navigation and result rendering |
| `compose.ts` | Build-time script that merges `layout.html` with each page's `index.html` to produce composed standalone pages. Exits with error if any page is missing. |
| `layout.html` | Shared dashboard layout template (sidebar, header, search, notifications, theme toggle) |
| `tsconfig.json` | TypeScript compiler configuration |
| `favicon.ico` | Application favicon |
| `fonts/` | Self-hosted woff2 font files (IBM Plex Sans, Inter, IBM Plex Mono) |

## Data Modules (`data/`)

Domain-specific adapter functions organized by module:

| Module | Exports |
|--------|---------|
| `helpers.ts` | `groupBy`, `buildUserMap`, `parseJson`, `getEdgeDataByIdeaId`, `createDefaultEdgeData`, `getEdgeDataWithConfidence` |
| `shared.ts` | `getCurrentUser`, `getNotifications` |
| `dashboard.ts` | `getDashboardGauges`, `getDashboardQuickActions`, `getDashboardStats` |
| `ideas.ts` | `getIdeas`, `getReviewQueue`, `getIdeaForScoring`, `getIdeaScore`, `getIdeaForConversion`, `getIdeaForApproval`, `getEdgeForApproval` |
| `projects.ts` | `getProjects`, `getProjectById`, `getProjectForEngineering`, `getClarificationsByProjectId` |
| `teams.ts` | `getTeamMembers`, `getManagedUsers` |
| `edges.ts` | `getIdeaForEdge`, `getEdgeList` |
| `tools.ts` | `getCrunchColumns`, `getFlow` |
| `admin.ts` | `getAccount`, `getProfile`, `getCompanySettings`, `getActivityFeed`, `getNotificationCategories` |
| `index.ts` | Barrel re-export of all modules |

All page modules import from `'../../site/data'` — with `moduleResolution: "bundler"`, this resolves to `data/index.ts` automatically.

## Build-Time Composition

`compose.ts` reads `layout.html` and each dashboard page's `index.html`, then:

1. Finds the `<!-- PAGE_CONTENT -->` placeholder in the layout
2. Inserts the page's HTML content
3. Writes the composed file to the build output directory

This produces 19 composed pages. The remaining 8 standalone pages are copied directly.

## Key Exports from `script.ts`

- **Icons** — `iconSparkles(size, cssClass)`, `iconPlus()`, etc. (~100 functions, defined in `icons.ts`)
- **Navigation** — `navigateTo(page, params?)` constructs relative URLs
- **State** — pub-sub for theme, mobile detection, auth, sidebar state (defined in `state.ts`)
- **Toast** — `showToast(message, type)` with auto-dismiss
- **Page dispatch** — reads `data-page` attribute on `DOMContentLoaded` to call the correct module's `init()`

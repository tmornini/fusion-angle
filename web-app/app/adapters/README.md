# Data Adapter Layer

**Parent:** [app](../README.md)

Async adapter functions that call `GET()`/`PUT()` from the API layer and convert normalized DB rows into the denormalized shapes that page modules expect.

## Organization

Domain modules with a barrel re-export (`index.ts`). All page modules import from `'../../app/adapters'` — with `moduleResolution: "bundler"`, this resolves to `adapters/index.ts` automatically.

| Module | Domain |
|--------|--------|
| `helpers.ts` | Shared utilities: `groupBy`, `buildUserMap`, `parseJson`, `getEdgeDataByIdeaId`, `buildDefaultEdgeData`, `getEdgeDataWithConfidence` |
| `shared.ts` | Cross-cutting: `getCurrentUser` |
| `dashboard.ts` | Dashboard gauges, stats, quick actions |
| `ideas.ts` | Idea listing, review queue, scoring, conversion, approval, write operations (`putIdea`, `getIdea`) |
| `projects.ts` | Project listing, detail, engineering requirements, write operations (`putProject`, `putMilestone`) |
| `teams.ts` | Team members, managed users |
| `edges.ts` | Edge definitions, edge list |
| `tools.ts` | Crunch columns, Flow process data |
| `admin.ts` | Account, profile, company settings, activity |
| `snapshots.ts` | Snapshot lifecycle: `deleteSchema`, `createSchema`, `loadMockData`, `importSnapshot`, `exportSnapshot`, `hasData` |

## Conventions

- Each function is `async` and returns a typed interface (defined in the same module)
- DB row types are imported from `api/types.ts` (snake_case); adapter functions convert to camelCase interfaces
- `buildUserMap()` creates a `Map<Id, User>` for resolving user IDs to display names
- `toBool(val)` from `api/types.ts` normalizes localStorage int (0/1) vs JSON boolean

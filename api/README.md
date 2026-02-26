# API Layer

REST-style in-process API backed by localStorage. Provides `GET(resource)` and `PUT(resource, body)` routing for all application data.

## Files

| File | Purpose |
|------|---------|
| `api.ts` | `GET()`/`PUT()` URL routing, `initApi()` entry point |
| `types.ts` | Row types (snake_case) matching schema, `snakeToCamel` and `toBool` utilities |
| `db.ts` | `DbAdapter` interface with `EntityStore<T>`, `SingletonStore<T>`, and schema lifecycle methods |
| `db-localstorage.ts` | localStorage implementation with JSON serialization |
| `seed.ts` | Mock data seeding for first-load population |

## Architecture

The `DbAdapter` interface defines typed stores for every entity:

- **`EntityStore<T>`** — `getAll()`, `getById(id)`, `put(entity)`, `delete(id)` for multi-row tables
- **`SingletonStore<T>`** — `get()`, `put(entity)` for single-row config tables (account, company settings)

Lifecycle methods on `DbAdapter` manage the schema and data:

- **`hasSchema()`** — returns `true` if any `fusion-ai:*` table key exists in storage
- **`createSchema()`** — creates empty arrays for any missing table keys (idempotent)
- **`wipeAllData()`** — removes all table keys from storage
- **`importSnapshot(json)`** / **`exportSnapshot()`** — full database import/export (import always writes all 22 keys)

The localStorage implementation (`db-localstorage.ts`) persists each table as a `fusion-ai:tableName` key containing a JSON array of row objects, so data survives page navigations. Works on both HTTP and `file:///` protocols.

## URL Routing

`GET()` and `PUT()` parse URL-style resource paths:

| Pattern | Example | Description |
|---------|---------|-------------|
| `/{collection}` | `GET("users")` | List all entities |
| `/{collection}/{id}` | `GET("ideas/abc")` | Single entity by ID |
| `/{parent}/{id}/{child}` | `GET("ideas/abc/scores")` | Nested resources |
| `/{collection}` | `PUT("users", body)` | Create or update entity |

## Database Tables (22)

users, ideas, idea_scores, projects, project_team, milestones, project_tasks, discussions, project_versions, edges, edge_outcomes, edge_metrics, activities, notifications, clarifications, crunch_columns, processes, process_steps, company_settings, notification_categories, notification_prefs, account_config. See `SCHEMA.md` for full column definitions.

## Migration to Another Database

The `DbAdapter` interface is designed for easy migration to Postgres or other backends:

1. Implement the `DbAdapter` interface for the new database
2. Swap the import in `web-app/site/script.ts` from `db-localstorage` to the new implementation
3. All pages continue working unchanged — they only call `GET()`/`PUT()` through `data/`

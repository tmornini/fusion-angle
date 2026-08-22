# Deno Postgres Driver — Design (outline)

Date: 2026-08-21
Status: outline (authored beside the roadmap on
2026-08-21; optional; re-validated against the tree and
brainstormed to full depth before its implementation
plan). Spec only; no implementation lives here.

This scroll is Spec 6 of
[the Deno migration roadmap](2026-08-21-deno-migration-roadmap-design.md)
and follows
[Spec 5, Test idiom](2026-08-21-deno-test-idiom-design.md).

## The Goal

`jsr:@db/postgres` replaces `npm:postgres@3.4.9` behind
`api/postgres-client.ts`. The last `npm:` specifier and
the last `node:net`/`node:tls` compat leave the product
process; the environment allowlist shrinks to what the
new driver reads. Nothing above `SqlClient` notices.

## Context

- `SqlClient` is four methods: `query` (tagged
  template), `begin(fn, options?)` — nested `begin`
  inside a transaction becomes a savepoint — `unsafe`,
  and `end`. `connectPostgres(url, { statementTimeoutMs,
  acquireTimeoutMs })` sets `max: POOL_MAX`, mutes
  `onnotice`, maps the acquire timeout to
  `connect_timeout` seconds, and sets
  `statement_timeout` as a connection parameter.
- `api/backend-postgres.ts` reads BYTEA through
  `latin1OfBytea`, which accepts a `Buffer` or a plain
  `Uint8Array`; advisory locks are
  `pg_advisory_xact_lock` inside `begin`; writes
  `pg_notify`. `api/errors-postgres.ts` maps SQLSTATE
  codes from the driver's error shape
  (`isUndefinedTable` and kin).
- Tests: `backend-postgres.test.ts` fakes `SqlClient`
  (driver-free); `errors-postgres.test.ts` pins the
  mapping; the five `pg-*` files run live through
  `connectPostgres`.
- postgres.js reads 22 `PG*` names from the environment
  (roadmap § The Environment Contract).
- `jsr.io` is unreachable from the Claude sandbox; every
  probe of `@db/postgres` runs outside it.

## The Decisions

1. **The adapter absorbs the driver.** `Pool(config,
   POOL_MAX, true)`; `query` → `queryObject<T>` with the
   tagged template; `begin` → `createTransaction(name,
   { isolation_level })` with `begin`/`commit`/
   `rollback`, and a nested `begin` → `savepoint`;
   `unsafe` → `queryArray(text)`; `end` → `pool.end()`.
2. **Timeouts** — `statement_timeout` as a connection
   option if the driver passes startup options,
   otherwise `SET statement_timeout` on acquire; the
   acquire timeout as a race around `pool.connect()`.
3. **Notices** are muted as today; the mechanism is
   verified first.
4. **Errors** — `errors-postgres.ts` maps the new
   driver's `PostgresError.fields.code` to the same
   predicates; `errors-postgres.test.ts` gains the new
   shape beside the old.
5. **BYTEA** arrives as `Uint8Array`; the `Buffer`
   duck-typing branch in `latin1OfBytea` is deleted.
6. **The environment allowlist** shrinks to the
   driver's reads, measured by compiling and booting
   with a scoped `--allow-env` until no `NotCapable`
   names a variable.
7. **`postgres-lib`'s wipe** (already the operator tool
   from Spec 2) and `tests/pg-*` move with the adapter.

## Decisions Deferred to This Spec's Brainstorm

- Whether to do this at all. The driver is pre-1.0;
  postgres.js is mature and already insulated. The
  roadmap marks this spec optional; the measurements
  after Spec 5 decide.
- The `@db/postgres` version to pin, and its TLS
  posture for the Render internal URL (none needed).

## The Gates

- `./test-postgres` against the compose Postgres — the
  acceptance, races, boot, seed, and explain suites.
- `./validate`.
- `./measure` full ceremony; `--check` against the
  committed budgets, and the phase mix compared with the
  last postgres.js record.
- The compose smoke and the binary's boot gates under
  the shrunken allowlist.

## Risks

- Prepared-statement and pipelining differences change
  latency; `./measure` is the arbiter.
- Transaction and savepoint semantics differ in detail
  (`pg-races.test.ts` is the covenant).

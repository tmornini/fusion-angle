# Ledger probes

The scripts behind the figures TODO.md items 0 to 3 call
"measured", recovered from the sessions that ran them.
Postgres probes ran on Postgres 18.6 in Docker; Deno probes
on Deno 2.9.6. Each script is as it ran, except that the
Deno probes' imports now point into this tree instead of a
retired worktree, and the two drivers read their URL from
`FA_PROBE_POSTGRES_URL` instead of a literal.

None of these gates anything. `./test validate` neither
lints nor type-checks this directory. The ledger sweep in
TODO.md's `## Later work` is their successor.

## succession/ (2026-09-21)

`setup.sql` builds the succession index, the root row, the
PII policy, and an api view; the timing scripts pipe into a
container named `fa-rethink-probe` as the `postgres`
superuser.

- `p1.sql` — item 3: the owner writes `/definition/` (now
  `/migrations/`) through the table while the policy
  refuses it to the api.
- `p3-load.sql`, `p3-time.sh` — item 1: 200 documents at
  10, 250, and 2,500 versions; today's `DISTINCT ON`
  against the skip walk, owner on the bare table and a
  member of `fa_api` through the fence.
- `p4-load.sql`, `p4-time.sh` — item 1: the shapes where
  the walk loses, 10,000 documents of one version among
  them, and the break-even.
- `p5.sql` — item 2: the whole fence on the table itself
  with two roles and no api view.

## fence/ (2026-09-19 to 2026-09-20)

Roles here are the probe's own (`ledger_owner`,
`ledger_app`, `fa_api_gate`), not the plan's names. The
drivers expect logins `api_login` and `owner_login` on the
probe container, members of the roles the SQL creates.

- `probe.sql`, `probe.out` — item 2: `RETURNING` needs
  SELECT on the returned columns; a plain view leaks a
  hidden row through a failing cast; column grants against
  a definer function.
- `ab.sql`, `shape.sql` — item 0: the statement shapes: a
  composed write in one INSERT with the bell, a blind PUT
  whose head is a CTE, the same PUT landing nothing, a
  stale latch refused by the index.
- `q2setup.sql`, `q.sql`, `leak2.sql`, `cost.sql`,
  `variants.sql` — item 2: 262,000 rows; the row policy
  against the barrier view and the plain view on the head
  read; the leak a plain view allows.
- `least.sql`, `asapi.sql`, `defaults.sql` — item 2: what a
  fresh role can do, and the four revokes only a superuser
  can make.
- `prefix.sql` — item 2: prefixed roles, a host login joined
  by membership, a role created twice, roles surviving the
  schema drop and seen from another database.
- `roles.sql` — physical erasure: the eraser's delete-only
  view and the archiver's view.
- `runner.sql`, `refence.sql` — item 3: two runners on one
  migration, and a failed step rolling back the fence and
  the document.
- `seedtx.sql`, `seeddriver.ts` — item 0: the seed as one
  transaction, batched, rolling back its DDL.
- `driver.ts`, `loads.ts` — item 2: postgres.js with
  `fetch_types: false`.

## mock-data/ (2026-09-19)

Run from the repository root under the memory backend.

- `list-size-probe.ts` to `list-size-probe-4.ts` — item 1:
  a part's cost, the list growth, and the gzipped shapes.
- `instance-probe.ts` — item 1: instance revisions storing
  `{}` as their response body.
- `versions.ts` — item 2: the mock ledger's version depth
  per document.

## serve/ (2026-09-18, 2026-09-22)

- `serve-probe.ts` — item 0: `Deno.serve` keeps a `date` it
  is given, and how it orders and cases header lines.
- `serve-probe-2.ts` — cachability: whether `Deno.serve`
  compresses and what that does to a strong ETag.
- `chunked-framing.ts` — the store spec: a chunked request
  reaches the handler de-chunked with its
  `transfer-encoding` line and no `content-length`.

## Figures whose script did not survive

Stated in TODO.md as measured; re-measure when the statement
exists.

- item 0: the `clock_timestamp()` ties inside one statement
  and the step-back stamping a successor before its
  predecessor
- item 2: a grant only the creator or a superuser may make;
  `fa_owner` owning what a session creates after `SET
  ROLE`; the image's `POSTGRES_USER` as a superuser
- item 3: the privilege functions under revoked catalog
  reads; a head read after a column added by hand; `CREATE
  INDEX CONCURRENTLY` inside a transaction
- item 6: `pg_dump` against the archiver's view
- physical erasure: a check-option view refusing another
  path

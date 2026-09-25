# The rehearsal transaction

- Date: 2026-09-24
- Status: awaiting review, pre-plan
- Worktree: `.worktrees/ledger-store`
- Base: `ledger-store` at `2790a9a5`
- Ships: the seed's rehearsal as one transaction on
  its scratch memory backend, which the ops' own
  transactions and reads re-enter
- Defers: the one-rehearsal test harness, decided on
  this spec's numbers
- Witness: `measurements/probes/seed/` on Deno 2.9.6,
  and Postgres 18.6 for the Postgres seed

## Problem

The rehearsal opens no transaction (the ledger seed
plan's Interpretation (C),
`docs/superpowers/plans/2026-09-23-ledger-seed.md:183-200`).
Each of its statements therefore takes the scratch
memory backend's bare path
(`api/backend-memory.ts:140-150`): the serializer
admits it alone, copies the whole table, applies it,
and adopts the copy. A statement inside a transaction
takes the other path (`:136-139`): it applies on the
open buffer at once, and the next statement's hashing
overlaps with it at `classifyStatement`'s await.

Measured on this branch (the seed's ledger, medians):
the rehearsal's statements replayed serialized take
1,072 ms against 146 ms inside one transaction, the
base's pass-2 shape. A memory seed went from 692 ms
to 1,398 ms. `./test` went from 36.57 s to 62.51 s,
+25.94 s a run, paid by every run in every cycle. The
Postgres seed rehearses on memory too: its rehearsal
is about 1.25 s of a 1.45 s seed with the test
hasher, and its landing about 155 ms.

Interpretation (C) had two reasons. First,
`postInstanceCreateOp` opens its own
`backend.transaction` (`api/routes.ts:3880-3883`);
inside an outer memory transaction that call waits on
the serializer the outer transaction holds
(`api/store-serializer.ts`), forever. Second,
AGENTS.md: a transaction body awaits only row ops
(`AGENTS.md:388-397`). That invariant guards a pooled
connection, advisory locks, and the serializer's other
users. The scratch has none: one user, the rehearsal,
for one run, then discarded.

## Axiom

The serializer orders a memory instance's users. The
scratch has one.

## Decisions

1. **The rehearsal is one scratch transaction.**
   `rehearse` (`api/ledger-seed.ts:230-244`) calls
   `ensureTable` first, as today, so the scratch root
   exists before the transaction copies the table.
   It then opens one readwrite `transaction` on the
   scratch and runs the ops inside it. The open
   handle is a field of `RehearsalBackend`, set for
   the run and cleared in a `finally`. A bare
   `executeLedger`, one that arrives with no
   transaction, applies on the open handle, the path
   a transaction's statements take today, so the
   rehearsal's statements overlap as the base's
   pass 2 did.

2. **The ops' transactions and reads re-enter.**
   `RehearsalBackend.transaction` and `read`
   (`api/ledger-seed.ts:157-166`) run their body on
   the open handle instead of reaching the scratch.
   This is the adapter's own rule one level down: a
   nested `readTransaction` re-enters the open client
   (`api/db-backed.ts:169-171`), and `ambientRunner`
   ignores the declared mode because the open
   transaction's mode is fixed (`api/db.ts:219-223`).
   `postInstanceCreateOp`'s transaction re-enters and
   never reaches the serializer. A readonly request
   joins the readwrite handle; the rehearsal does not
   enforce read-only mode, and the live path does.
   `read` must re-enter: the scratch's `read` serves
   its committed rows (`api/backend-memory.ts:72-80`),
   and during the run every row sits in the open
   buffer, so a read on the scratch would see the
   root alone and every head read would miss.

3. **Three calls throw while the run is open.**
   `ensureTable`, `seedTransaction`, and
   `postSchemaCreation` take the serializer
   (`api/backend-memory.ts:102-128`, `:234-236`).
   Made during the run, each would queue behind the
   open transaction it can never outlive.
   `RehearsalBackend` throws for each while the
   handle is set, an error naming the method: a crash
   in place of a hang. `hasSchema` and `deleteSchema`
   touch no serializer and keep delegating.

4. **The verdict is unchanged.** A matched, stale, or
   refused row throws as today
   (`api/ledger-seed.ts:184-204`), before `runWrite`
   can retry. The scratch's `refuseNextSuccessions`
   still bites: `#apply` consumes the counter on both
   paths (`api/backend-memory.ts:159-163`).

5. **The product memory backend is untouched.** Its
   serializer and copy-then-adopt stay for every
   other user: the product adapter
   (`api/db-memory.ts:17`) and 37 construction sites
   in `tests/`. `rehearse(scratch, run)` keeps its
   signature, and both callers stand
   (`api/mock-data.ts:409-410`, `:1216-1217`).
   Interpretation (C) is superseded by this spec, by
   citation; the seed spec and plan are not
   rewritten.

6. **The carve-out is written where the invariant
   is.** `AGENTS.md:388-397` gains one sentence after
   "re-enters the same tx.": "The seed's rehearsal is
   the one exception: it holds a transaction on its
   scratch memory backend for its whole run, on an
   instance nothing else uses, so the ops' validators
   and hashes run inside it."

7. **Measurement closes the bullet.** A committed
   probe records the oracle's numbers
   (## Measurement). The last commit removes the
   rehearsal-serialization bullet from TODO.md
   (`:2811-2834`) and replaces the one-rehearsal
   bullet's "waits on" sentence (`:2871-2874`) with
   the measured numbers, leaving its build decision
   to the operator.

8. **Carried in, and not reopened.** The seed spec's
   decisions stand: the landing is one transaction
   beneath the adapter, the packer and its depths,
   the verdict, no `request-id` line. The loader's
   waves and order stand (the seed plan's
   Interpretation (F)), and so does the seed's shape:
   1,455 mock-data rows landed as three statements of
   1,451, 2, and 2, and bootstrap's 9, all pinned.

## Found on the base

1. **The instance chain runs alone.**
   `postInstanceChainIn` is awaited by itself between
   waves (`api/mock-data.ts:1052-1054`), so the
   instance create's transaction never runs beside
   another op.

2. **Memory stamps never tie.** `nowUtc` appends a
   same-millisecond sequence counter, so every mint
   is strictly later than the last
   (`api/types.ts:373-381`). Concurrent statements
   cannot tie on `response_at`, and head selection
   stays a total order.

3. **Nothing in the run calls the guarded three.**
   `rehearse` alone calls `ensureTable`
   (`api/ledger-seed.ts:241`), before the run. No op
   calls `ensureTable`, `seedTransaction`, or
   `postSchemaCreation`.

4. **No code comment says the rehearsal opens no
   transaction.** The sentence lives in the seed
   plan's (C) and the TODO bullet. The plan greps
   again before its last task.

5. **The Postgres seed carries the rehearsal.** The
   verb rehearses on memory and lands on Postgres
   (`server/seed.ts:170-198`,
   `api/mock-data.ts:427-433`), so this change speeds
   the Postgres seed too. Its landing is untouched.

6. **The seed probe records around a bare backend.**
   `measurements/probes/seed/landing.ts` wraps
   `executeLedger` on a `MemoryStorageBackend`, the
   shape before `RehearsalBackend`, and times the
   landing. This spec adds a probe beside it rather
   than changing it.

## Out of scope

- The one-rehearsal test harness. Its bullet waits on
  this spec's numbers.
- The product memory backend's whole-table copy per
  bare statement (`api/backend-memory.ts:144`), a cost
  every test write outside a transaction pays.
  Unmeasured; its own bullet if it matters.
- The intermittent `--parallel` failures the seed
  cycle observed. Their own note.
- The Postgres landing, `packSeedBatches`, `depthsOf`,
  and the seed verb.

## Sequence

1. **Root.** `ensureTable` on the scratch: its own
   root, unrecorded, as today.
2. **Open.** One readwrite transaction on the scratch.
   The handle is held.
3. **Run.** The ops. Every statement applies on the
   handle and is recorded; every `transaction` and
   `read` re-enters it.
4. **Close.** The handle clears in `finally`. The
   scratch adopts or discards its buffer and is
   itself discarded.
5. **Return.** The recorded statements go to the
   landing, unchanged from today.

## 1. The open transaction

`RehearsalBackend` gains one field, the open handle,
`undefined` outside a run. `rehearse` becomes:
`ensureTable`; then `scratch.transaction('readwrite',
…)` whose body sets the handle, awaits `run(db)`, and
clears the handle in `finally`; then return the
statements.

`executeLedger(attempt, rows, now, tx)` chooses its
handle explicitly: the `tx` it was given when the
caller holds one, which is an op inside its own
transaction, the re-entered handle, the same buffer;
and the open handle when it was given none. It hands
the chosen handle to the scratch's `executeLedger`,
which takes the `ledgerBuffer` path
(`api/backend-memory.ts:136-139`) and applies at
once. The verdict and the recording follow as today.

Outside a run, `read`, `transaction`, and a bare
`executeLedger` have no handle and throw: nothing
calls them then, and a call is a bug.

## 2. Re-entry

Every row op the adapter makes funnels into three
backend methods. `backendRunner` sends a standalone
read to `backend.read` and a standalone write to
`backend.transaction` (`api/db.ts:212-217`);
`readTransaction` calls
`backend.transaction('readonly', …)`
(`api/db-backed.ts:159-166`); a view inside an open
transaction uses `ambientRunner(tx)`; and a statement
goes to `executeLedger`. `RehearsalBackend.read` and
`.transaction` run their body on the open handle, and
`executeLedger` applies on it, so during the run no
path reaches the scratch's serializer but the three
guarded calls.

## 3. The guards

While the handle is set, `ensureTable`,
`seedTransaction`, and `postSchemaCreation` throw an
`Error` whose message names the method and the open
rehearsal. Outside a run they delegate as today, so
`rehearse`'s own `ensureTable` call, and the tests
that prepare a scratch before rehearsing on it, stand.

## 4. What the overlap changes, and what it cannot

Inside one buffer, each statement awaits
`classifyStatement` against the heads as they stood
when it began, then checks duplicates and succession
synchronously and pushes its rows
(`api/backend-memory.ts:164-227`). Two statements in
one wave that both succeed one head would both
classify against it; the second to resume finds the
succession key claimed and is refused, and the seed
fails, where serialized they would both have landed.
The waves were built so no wave holds two writers of
one document, and the shape pins prove it: a hidden
dependency turns them red, and then the wave changes,
never the pin. Stamps keep their order across waves
(Found 2). The recorded `supersedes` are what the
landing checks, so a rehearsal that records a wrong
predecessor fails the landing, never a reader.

## Error and wire

The seed answers no request. A matched, stale, or
refused row throws the messages it throws today, and
the target is untouched. A throw inside the run
propagates out of the scratch transaction, which
adopts nothing; the scratch is discarded either way.
The guards throw before they queue. Nothing prints a
credential, and nothing new is logged.

## Testing

Layer 1, against the memory backend, in
`tests/ledger-seed.test.ts`. `./test postgres` is
unchanged, since the landing is, and stays green.

Standing pins, which pass unchanged:

- The rehearsal records each statement and
  predecessor (`tests/ledger-seed.test.ts:313-335`).
- A matched row fails the rehearsal (`:337-351`), and
  a refused row fails it (`:353-363`), the latter
  through the scratch's `refuseNextSuccessions`
  before `rehearse` opens.
- The instance chain rehearses its PATCH create as
  one statement and each value-bearing transition as
  one latched statement
  (`tests/mock-data-instance-chain.test.ts`).
- The shape: 1,455 rows, three statements, 1,416
  operation ids, bootstrap's 9
  (`tests/mock-data-pairs.test.ts`,
  `tests/ledger-seed.test.ts`).
- Every seeded test, which rehearses the whole
  dataset: a read that missed the open buffer would
  record no chain.

New pins:

- A wave of concurrent writes records every
  statement with its predecessor: several genesis
  PUTs to distinct names in one `Promise.all`, then
  their successors in one `Promise.all`. Each
  statement is recorded once, each successor's
  `supersedes` names its genesis, and landing them
  lands the geneses at depth 1 and the successors at
  depth 2.
- A write inside an op's own transaction is
  recorded: a `run` that opens
  `db.backend.transaction('readwrite', …)` and writes
  through `clientOn(tx)` records the statement and
  completes.
- The scratch's schema calls are refused while the
  rehearsal is open: inside `run`, `ensureTable`,
  `seedTransaction`, and `postSchemaCreation` on the
  adapter's backend each reject with the named
  error, and the rehearsal itself completes.

The oracle is measured, not pinned (## Measurement).

## Measurement

A probe, `measurements/probes/seed/rehearsal.ts`, run
at the base `2790a9a5` and at the head, named in the
README's `## seed/`:

- the replay: the recorded statements re-executed one
  by one through the rehearsal's path over a fresh
  scratch, medians of seven, against the 146 ms the
  ledger measured inside one transaction;
- the rehearsal alone: `rehearseMockData` with the
  test hasher, medians of seven;
- the memory seed: `postMockDataLoad` on a fresh
  memory adapter, rehearsal and landing, medians of
  seven;
- the Postgres seed: the same against a Postgres
  adapter when `FA_PROBE_POSTGRES_URL` is set, on a
  fresh schema per run, medians of three.

And `./test`, three runs each at base and head, the
seed cycle's protocol, medians.

The bullet's oracle: the rehearsal's replay near the
concurrent 146 ms, a memory seed at or under the
base's 692 ms, and `./test` and the Postgres seed
re-measured. The plan's last task reports the
numbers; the numbers, not this spec, say whether the
oracle is met.

## Docs that change when this ships

- `AGENTS.md:388-397`: the carve-out sentence
  (Decision 6).
- `TODO.md`: the rehearsal-serialization bullet
  leaves; the one-rehearsal bullet carries the
  numbers (Decision 7).
- `measurements/probes/README.md`, `## seed/`: the new
  probe.
- `api/ledger-seed.ts`: the comment blocks on
  `RehearsalBackend` and `rehearse` say the
  rehearsal is one scratch transaction.

## For the next brainstorms

The one-rehearsal harness reads this spec's numbers:
build it only if a per-seed rehearsal is still a cost
worth a cache. The product memory backend's
per-statement table copy is unmeasured and stays
where it is.

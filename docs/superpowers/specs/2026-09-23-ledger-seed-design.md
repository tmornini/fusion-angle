# The ledger seed

- Date: 2026-09-23
- Status: awaiting review, pre-plan
- Worktree: `.worktrees/ledger-seed`
- Base: `message-plane` at `93943c58`
- Ships: the seed as one transaction beneath the
  adapter, rehearsed through the live ops and landed
  by depth in batches of the one statement
- Defers: items 1, 2, and 3, and credential lines in
  seed pairs
- Witness: `measurements/probes/seed/` on Postgres
  18.6 and Deno 2.9.6

## Problem

A seed commits four times. `ensureTable` commits the
DDL and the root (`server/postgres-seed.ts:87`)
before the emptiness check runs. The dataset commits
in one transaction (`api/mock-data.ts:380-385`), the
credentials in a second (`:304-344`), and the marker
after both (`:400`). A seed that fails after the
dataset commits leaves pairs and no marker. The seed
then refuses the database as non-empty
(`server/seed.ts:100-123`), and boot refuses it for
want of a marker (`server/postgres-gate.ts:47-73`,
`server/boot.ts:106`). Only a wipe recovers it.

The root's operation id is minted inside
`ensureTable` (`mintRootBind`,
`api/ledger-root.ts:22-24`), and no seed pair
carries it. Every other seed pair carries an id of
its own: `formSeedMessagePair` mints one per pair
(`api/mock-data/seed-message-pairs.ts:1992-1993`).
The live request that creates a flow threads one id
through its operation, document, and join rows; the
seed gives them three.

The seed drives the live ops, one statement per
operation, inside the transaction. Where it writes
around them, it writes what no live request writes,
or skips a law the live handler enforces. The WO01
instance chain lands its genesis as "the inner PUT a
public PATCH create would store"
(`seed-message-pairs.ts:2256-2258`) without the
PATCH pair beside it. It lands each value-bearing
transition as two statements, its revision without
the `If-Match` the live op latches
(`seed-message-pairs.ts:2220-2225`;
`api/routes.ts:2468-2515`). It injects each pair's
`requestAt` as the stamp
(`api/mock-data.ts:951-981`), which the memory
backend honors (`api/backend-memory.ts:60-65`) and
Postgres ignores (`api/backend-postgres.ts:116`).
Two direct writes skip a law their live handler
enforces: the default organization's membership
check (`api/organization-requests.ts:118-126`) and
the invitation's duplicate-grant check
(`api/invitations-domain.ts:488-501`).

The comment on the returned plaintexts names PBKDF2
and a column that is not there
(`api/mock-data.ts:163-166`, `:173-176`).

## Axiom

The seed is what the app would have written. The
app's own ops form every row, on a scratch backend,
before the transaction opens. One transaction lands
those rows through the one statement, by depth.
Either every row lands with the predecessor the
rehearsal gave it, or nothing exists afterwards,
not even the table.

## Decisions

1. **A batch is half the parameters, counted
   exactly.** Rows per statement are

   ```text
   R = floor((65535 - 1) / 2 / 14) = 2340
   ```

   65,535 is the bind limit Postgres allows one
   statement. 1 is the leading bind, the attempt
   class (`api/ledger-statement-sql.ts:22`). 14 is
   the binds per row (store spec §5). Each is a
   named constant, and none is picked by hand. A
   batch of 2,340 rows binds 32,761 parameters. The
   half stays, as the store spec and TODO item 0 set
   it. Only its arithmetic changes: the written
   formula, `floor(65535 / 2 / n)`, drops the
   leading bind. The ceiling,
   `floor((65535 - 1) / 14)` = 4,681, is refused.

   Measured on Postgres 18.6, tmpfs, the compose
   shape: a full batch of 2,340 rows ran in 226 to
   244 ms over four runs
   (`measurements/probes/seed/landing.ts full`). The
   seed's client sets a 30 s statement timeout
   (`server/postgres-gate.ts:10`,
   `server/postgres-seed.ts:71-77`).

2. **One operation id per simulated operation.**
   Every row an operation writes carries the one id
   its live request would carry. The root carries
   the seed run's id, minted once per seed. The root
   is the one row the app never writes. One id for
   the whole run is refused: it records the seed,
   not the operations the seed stands for. Today's
   per-pair mints are refused.

   No reader decides this. The flow undo
   (`api/derive-flows.ts:292-319`) and the
   PATCH-revision join (`api/api.ts:303-321`) are the
   only code that relates pairs by operation id.
   Neither changes under either choice: the seed
   writes no pair under `/undo`, and every seeded
   flow has one document pair
   (`api/mock-data/flows.ts:26-31`).

3. **Seed pairs present no credentials.** `secret`
   is zero bytes on every seed row. A live write
   stores its `authorization` line in `secret`. A
   seed pair identical to the app's would need a
   bearer per requester, minted by a simulated login
   whose own pairs land too, and the seed runs
   without the signing key
   (`tests/pg-seed.test.ts:433`). This is a named
   departure from Axiom, beside the closed one: seed
   pairs carry no `request-id` line.

4. **The marker is the transaction's last
   statement.** `schema_marker` stays until item 3.
   Its table is in the DDL the transaction runs, and
   its row is the last statement before commit. A
   committed marker, a committed root, and a
   committed seed are one fact, so the database the
   base can strand cannot occur. Boot's gate is
   unchanged. Retiring the marker here is refused:
   item 3 owns it.

5. **A re-created document lands by depth.** A chain
   `PUT`, `DELETE`, `PUT` is an ordinary chain of
   three. The DELETE lands at depth 2. The PUT lands
   at depth 3, supersedes the DELETE, and stores 201
   under the message plane's §8. The gate's head
   read skips a DELETE head
   (`documentHeadMessagePairId`,
   `api/api.ts:806-814`), which is the message
   plane's second defect found on the base. The seed
   never passes that read. The statement's head read
   takes a DELETE head
   (`api/ledger-statement-sql.ts:71`). A re-created
   document whose response has no body matches the
   DELETE's empty body, classifies `matched`, and
   fails the seed. Today's seed deletes nothing.

6. **The plaintext comment says what is true.** Both
   comments become

   ```text
   // The seeded sign-ins, returned so the operator
   // sees each password once. The seed never stores a
   // plaintext: each password's hash lands in its
   // identities/:id/credentials/:cid document, and the
   // plaintexts live only in this return value.
   ```

   It names no algorithm. The verb installs scrypt
   (`server/postgres-seed.ts:65`), and the tests
   inject PBKDF2 (`tests/mock-seed.ts:24-51`).

7. **The seed rehearses through the live ops.**
   Before the transaction opens, every simulated
   operation runs through its live op on a scratch
   memory backend, which records the rows each
   statement carries (§2). Every validator the app
   runs, and every law it reads the ledger to
   enforce, runs. Forming rows from the formers and
   the validators alone is refused: six reads shape
   or refuse rows (§2), and nothing would make them.
   Checking those laws again over the formed rows is
   refused: it states each law twice.

8. **Each simulated operation is one call to its live
   op or handler.** `writeSeedPair`
   (`api/mock-data.ts:136-149`) retires. The instance
   chain's genesis drives the PATCH create (public
   PUT is 405, and PATCH creates,
   `api/routes.ts:3288-3290`). Its
   review and complete transitions drive the
   organization-scoped value-bearing transition op,
   which lands its POST and its latched revision as
   one statement (`api/routes.ts:2468-2515`). The
   default organizations drive
   `putIdentityDefaultOrganization`
   (`api/organization-requests.ts:96`), the
   invitation drives `postOrganizationInvitationGrant`
   (`api/invitations-domain.ts:300`), and the two
   organization documents drive their route's PUT
   (`api/routes.ts:5725-5745`). The pass-1 instance
   former (`seed-message-pairs.ts:2226-2438`) retires
   with them.

9. **Carried in, and not reopened.** The store's
   decisions and the message plane's Decisions 1 to 7
   stand. The statement keeps 14 parameters per row,
   and the api, the seed, and `migrate` share its one
   INSERT text. One transaction on the client beneath
   the adapter holds the DDL, the root, and every
   pair. `DbAdapter` gains no transaction method. A
   failed seed leaves nothing, not even the table.
   Every row is formed, every credential hashed, and
   every salt minted before the transaction opens.
   The root's salts are 16 zero bytes, and its
   `operation_id` is the seed's. A batch lands whole.
   A matched or stale row inserts nothing, and a
   shortfall fails the seed. Chains land by depth.
   Seed pairs keep a request, in canonical form,
   until item 1. Seed pairs and the root carry no
   `request-id` line. The message plane's §8 status
   rule applies to seed PUTs.

## Found on the base

1. **Four commits, and a database both doors
   refuse.** Stated in Problem. §4 and §6 replace
   them with one.
2. **The root's operation id names no operation.**
   `mintRootBind` mints a fresh id per
   `ensureTable`. Decision 2 gives the root the seed
   run's.
3. **An injected stamp splits the backends.** The
   instance chain's stamps are its authored instants
   on memory and the clock on Postgres. The landing
   injects none (§4).
4. **Operation ids name pairs, not operations.**
   Measured: 1,450 ids over 1,453 mock-data pairs,
   1,447 of them on one pair each
   (`measurements/probes/seed/shape.ts`).
5. **The instance chain and two direct writes are
   not what the app writes.** Stated in Problem.
   Decision 8 closes them.
6. **A default-organization PUT cannot move a set
   default.** Reproduced on memory
   (`measurements/probes/seed/repoint.ts`): a PUT
   naming a first organization answers 201, a PUT
   naming a second answers 200, and a GET still
   answers the first. The route stores a 204 with no
   body (`api/routes.ts:3439-3441`), its state in the
   request. The statement's sameness test compares
   response bodies (store spec §5), so the second
   PUT is `matched` and lands nothing. The binding
   PUT stores the same shape (`:3225-3227`) and is
   not affected: a rebind to another instance answers
   409 before the statement (`:2522-2524`), so a
   matched binding is a true resend. The seed sets
   each default once and never meets this. It is not
   fixed here.

## Out of scope

Items 1, 2, and 3. Emptying seed requests, which
item 1 does. Retiring `schema_marker`, which item 3
does. Credential lines in seed pairs (Decision 3).
The default-organization defect (Found on the base,
6). The gate's DELETE-head defect, which the message
plane fixes and the seed never passes. The ops
themselves: the seed calls them as the routes do.
The driver's multi-row helper, which TODO item 0
measured on a table of its own: the seed binds the
one INSERT text.

## Sequence

1. **Hash.** Mint and hash every seeded password.
2. **Form.** Pass 1 forms each simulated
   operation's input and mints its operation id. The
   seed run's id is minted here, for the root.
3. **Rehearse.** Pass 2 drives each operation
   through its live op on a scratch memory backend,
   which records every statement's rows and each
   row's `supersedes`. A row that does not land
   fails the seed here, before any DDL.
4. **Plan.** Each recorded statement takes a depth.
   Statements pack whole into batches of at most R
   rows, by depth.
5. **Land.** One transaction: the DDL, the root and
   every batch through the statement, then the
   marker. Every row must land with the rehearsal's
   `supersedes`.
6. **Reveal.** After commit, print the credentials.

## 1. Formation

Every seeded password is minted and hashed first,
because the credential documents embed the hashes.
The verb hashes one at a time
(`serialPasswordHasher`, `server/seed.ts:133-154`).
Pass 1 then forms each simulated operation's input:
its body, the pairs its op takes, and its operation
id. Every pair one
operation forms carries that id (Decision 2).
`formSeedMessagePair` and the other formers take the
id from the operation and mint none.

The seed run's id is minted once, here. It is the
root's `operation_id` and `operation-id`, and no
simulated operation carries it.

## 2. The rehearsal

A fresh `MemoryStorageBackend` under a
`BackedDbAdapter`, with its own root from
`ensureTable`. Pass 2 runs on it as it runs today,
in today's order (`api/mock-data.ts:404-1137`,
`:1213-1252`, and the credential ops at
`:304-344`), with Decision 8's calls in place of
the direct writes. The client keeps `openClient`'s
verdict (`api/db-backed.ts:125-155`): a matched,
stale, or refused row throws, and the target has
not been touched.

The ops read what they read on the live path,
against the rehearsal's own rows:

- flow creation's head diff
  (`api/routes.ts:1466-1485`);
- the flow graph's live-agent law (`:1519`, called
  at `:1540`);
- the flow-record binding's record probe
  (`:2696-2708`);
- the value-bearing transition's instance head and
  latch (`:2468-2515`);
- the default organization's membership check
  (`api/organization-requests.ts:118-126`);
- the invitation's duplicate-grant check
  (`api/invitations-domain.ts:488-501`).

Each execution of the statement is recorded: its
rows, exactly the binds the handler formed, salts
included, and each row's `supersedes` from the
answer. The rehearsal's stamps, digests, bells, and
root are discarded.

Measured on the base: 703 to 725 ms for mock data,
1,418 recorded statements holding 1,453 rows
(`measurements/probes/seed/landing.ts`).

## 3. Depth and batches

A recorded statement's depth is one more than the
greatest depth among the statements that recorded
the rows its rows supersede. The nil uuid counts as
depth 0. A chain's k-th version therefore lands at
depth k, and an operation lands at the depth of its
deepest row.

A recorded statement is never split. It is what one
live request writes, and a creating POST supersedes
the root only because its sibling genesis lands
beside it, invisible to its head read. Measured on
the base: twelve POST rows share a name with a
document, and one, the invitation's POST at
`/invitations/`, holds the same body as its document
(`shape.ts`). Landed after its document, it would
read that document as its head and classify
`matched`.

Batches take depth 1, then depth 2, and so on.
Within a depth, statements keep rehearsal order and
pack whole into batches of at most R rows. A
recorded statement longer than R fails the seed
before the transaction opens. None exists.

Measured on the base: 1,451 rows at depth 1 and one
each at depths 2 and 3, the WO01 instance chain.
With the root, mock data is three statements of
1,452, 1, and 1 rows. Bootstrap is 8 rows, one
statement. The margin changes neither count
(`shape.ts`).

## 4. The transaction

The seed opens `backend.transaction` on the client
beneath the adapter (`api/backend-postgres.ts:75-88`)
and runs, in order:

1. `POSTGRES_SCHEMA`, the DDL, `schema_marker`'s
   table included (`api/schema-postgres.ts:268`).
2. Each batch, as one execution of the statement
   with attempt `composed`. The root is the first
   row of the first batch: `rootBind` with the seed
   run's id (`api/ledger-root.ts:26-60`).
3. `INSERT INTO schema_marker ("only") VALUES
   (true)`.

Every answered row must be `land`, and its
`supersedes` must equal the rehearsal's. A
difference, a refusal, or an error throws, and the
transaction rolls back the DDL with the rows.

The attempt is `composed` because `$1` governs every
row of a statement. Under `genesis`, every row
supersedes the nil uuid
(`api/ledger-statement-sql.ts:97-102`), so a
version-2 row would meet its own genesis in the
succession index. `composed`, `blind`, and
`in-order` are one class in the SQL. `composed`
names a statement of several rows (`attemptFor`,
`api/message-pair.ts:727-743`).

The landing injects no stamp. Each backend stamps by
its own clock, and depth orders every chain. On
Postgres, each landed row notifies `fusion_events`
with the payload its op formed, delivered at
commit.

Measured on Postgres 18.6
(`measurements/probes/seed/landing.ts`), the real
mock-data seed, rehearsed and landed:

| Mode, runs | Rows per statement | Statement times | Transaction |
|---|---|---|---:|
| commit, 4 | 1,452 / 1 / 1 | 151–159 / 3 / 2 ms | 167–178 ms |
| `full`, 4 | 2,340 / 1 / 1 | 226–244 / 3–4 / 2 ms | 243–263 ms |
| `fail`, 3 | 1,452 / 1 / 1, the last refused | 150–153 / 3 ms | 167–169 ms, no table afterwards |

No row failed to land, and no `supersedes` differed
from the rehearsal's.

The memory backend lands through the same steps.
Its transaction copies the table into a buffer and
adopts the buffer when the body resolves
(`api/backend-memory.ts:82-95`). Today it throws
`MissingTableError` when there is no table. The
seed's transaction opens on an absent table, and its
DDL step creates the table in the buffer. A throw
adopts nothing, the table stays absent, and
`hasSchema` answers false (`:210-212`). The tests and
the browser fixture seed through this pipeline.

## 5. Operation ids

Each simulated operation has one id, minted in pass
1, carried by every row its op writes:

- the flow creation's operation, document, and join;
- the record write's operation, document, and every
  attribute;
- the objective creation's operation, document, and
  revision;
- the invitation's POST and document;
- each value-bearing transition's POST and revision;
- the instance's PATCH and the PUT it creates.

The mints at `seed-message-pairs.ts:1992-1993`,
`:2100`, and `:2147` take the operation's id. The
root carries the seed run's.

## 6. The seed verb

`ensureTable` leaves the verb
(`server/postgres-seed.ts:87`). The DDL runs inside
the transaction. `isDatabaseEmpty`
(`server/seed.ts:100-123`) answers true when
`fa_message_pairs` does not exist. Its exception for
a root-only table (`:103`) retires: the root lands
in the seed's transaction now. The legacy-table
check stays ahead of the seed
(`server/postgres-seed.ts:80`). The credentials
print after commit, as today
(`server/seed.ts:196-200`).

`ensureTable` and `postSchemaCreation` stay on both
backends for the tests. No production path calls
them on Postgres.

## 7. The comments

The plaintext comment takes Decision 6's text. The
comments that describe today's order change with it:
`api/mock-data.ts:182-201`, `:364-378`, and
`:1143-1179` say the credentials land after the
entity seed commits and the marker stamps after
both.

## Error and wire

The seed answers no request. The verb prints
`database is not empty; refuse to seed` when
`fa_message_pairs` exists (`SEED_NONEMPTY`,
`server/seed.ts:23-24`), and `seed failed` for any
fault off its allowlist (`server/seed.ts:31-45`). A
failed rehearsal leaves the target untouched. A
failed landing leaves no table. Neither prints a
credential.

## Testing

Layer 1, against the memory backend, in
`tests/ledger-seed.test.ts`. `./test postgres`,
against Postgres 18.6, in
`tests/pg-ledger-seed.test.ts`, ignored when
`POSTGRES_URL` is unset.

Layer 1 pins:

- Every rehearsed row lands with the rehearsal's
  `supersedes`. Mock data lands in three statements
  and bootstrap in one.
- The rows of one simulated operation share one id.
  The flow creation's three rows share one. The root
  carries the run's id, and no other row does.
- No seed row has a `request-id` line, and every
  seed row's `secret` is zero bytes.
- The instance chain lands its PATCH create as one
  statement, and each value-bearing transition as
  one statement whose revision is latched.
- A synthetic chain `PUT`, `DELETE`, `PUT` lands at
  depths 1, 2, and 3. The re-created PUT supersedes
  the DELETE and stores 201.
- The packer never splits a statement. It is a pure
  function of the recorded statements, their
  depths, and the row limit, tested with a small
  limit.
- A matched row in the rehearsal fails the seed, and
  the target has no table.
- A landing that fails leaves no table, `hasSchema`
  answers false, and a second seed then succeeds.

`./test postgres` pins:

- A landing whose last batch fails leaves neither
  `fa_message_pairs` nor `schema_marker`.
- After a seed, the marker exists and the root
  exists.
- The verb refuses a database whose
  `fa_message_pairs` exists, and creates nothing
  before that check.
- A landed seed row's digests match the TypeScript
  twin.

Pins that change because the covenant changes, each
named in the plan:

- the source-order pin that `ensureTable` follows
  the legacy check (`tests/pg-seed.test.ts:195-207`);
- the emptiness queries (`:155-193`);
- the seed phase (`tests/seed-phase.test.ts:15`);
- the op-invocation count
  (`tests/mock-data-pairs.test.ts:71`);
- the instance chain
  (`tests/mock-data-instance-chain.test.ts`).

Every seeded test now rehearses and then lands. The
plan measures `./test` before and after.

Docs that change when this ships: `SCHEMA.md`,
"What the DDL buys you" item 7 (`:60-63`), and
"Operator tools" (`:123-128`), which say the seed
stamps the marker last and a failed seed reads as
empty.

## For the next brainstorms

The message plane's tip moved while this spec was
written, from `93943c58` to `4e5044a8`, which adds
its plan. Its spec is unchanged. The plan keeps the
formers' `operationId` parameter for the seed.

Item 1 inherits:

- Emptying seed requests. The seed lands whatever
  its ops write, so item 1's change to the ops is
  the seed's.

Item 2 inherits:

- The seed's transaction, where its role switches
  go. TODO item 0 measured DDL, role switches, and
  batches rolling back together.

Item 3 inherits:

- `schema_marker`, now the seed transaction's last
  statement (Decision 4).
- The root's operation id, the seed run's
  (Decision 2).

Later work inherits:

- Credential lines in seed pairs (Decision 3).
- The default-organization PUT that cannot move a
  set default (Found on the base, 6).

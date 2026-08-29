# Test plan: three layers, one serial walk

Date: 2026-08-29. Status: brainstormed in conversation; awaiting
review. Supersedes §4 (the index of covenants) and §5 (retire the
parallel apparatus) of
`2026-08-28-verification-tiers-design.md`. That spec's Phase A
(`./test-browser`) shipped and stands; its Phase B (stub
preamble, fresh operation ids) stands as a separate plan.

## Problem

The parallel TEST-PLAN.md run — fourteen LLM hunters driving one
shared Chrome from one client address — reports the apparatus,
not the product. FAIL cases per run: 8 (08-25), 4 (08-26),
47 (08-27), 66 (08-28), 45 (08-29). Of the eighteen stubs filed
on 08-28 and 08-29, none is a confirmed product regression. The
08-28 tiers spec diagnosed the same loop; only its Tier 2 phase
shipped, so the retired protocol ran twice more by the book.

Three mechanisms:

1. **A background tab neither renders nor receives focus.**
   `mouseMoved` lands seconds late; CSS transitions freeze
   (I9: `.sidebar { transition: width … }`); `transitionend`
   never fires (V2: the toast's 2 s removal fallback); timers
   throttle (F26: the 800 ms `SAVE_DELAY_MS` asserted at
   500 ms); focus events are deferred (F38, R12, every Tab
   case). `tests/browser/fixtures.ts` calls `Page.bringToFront`
   and `Emulation.setFocusEmulationEnabled` for exactly this
   reason; hunters' tabs get neither. Two gesture hunters
   activating hide each other; every other hunter is forbidden
   to activate at all.
2. **Fourteen sign-ins from one address.** `server/throttle.ts`
   allows five auth hits per 60 s per client, counting both
   `authorize` and `token`; the third sign-in inside any minute
   is a 429. F2 lost 28 cases to it on 08-29; B25 on 08-27. It
   is intermittent only because LLM start latency staggers the
   hunters.
3. **The scoring rule forbids BLOCKED for a driver limit**, so
   every instrument failure is scored FAIL — "real regression;
   investigate" — and becomes a stub, a spec, a plan, and
   product commits. The `Suspected layer` field flips for the
   same case from one day to the next.

The run had two jobs. As a regression gate it never converged.
As discovery it found five real bugs on 08-25 (B13, AA-Obj,
SV8b, K30, WB5a — all fixed with pins that afternoon), then
buried the next findings under sixty artifacts. Discovery yield
fell as parallelism rose.

## Goals

- Three named verification layers, each a command or a
  protocol, each with a stated standing: Layer 1 `./validate`
  (gate), Layer 2 `./test-all` (gate), Layer 3 the serial walk
  (exploration, never a gate).
- One explorer, one visible tab, document order, on a fresh
  `--mock-data` origin. No parallelism anywhere.
- A browser observation changes product only through a red
  test at Layer 1 or 2: every stub carries `Reproduced by`.
- TEST-PLAN.md stays one document: the contract, the walk, the
  scoring, the stub, and the 400 cases — each case ending in a
  `Pin:` clause naming its Layer 1/2 test or `exploratory`.
- The slice seed, the seeder, its tests, the alias table, the
  hunter prompt, and the parallel DAG are gone.
- `./validate` green after every commit; `./test-all` green on
  the operator's machine.

## Non-goals

- Writing the tests the audit finds missing. The audit's output
  is the mapping and a gap list in TODO.md.
- Product changes. Two product seams the rewrite names — the
  Undo-at-stack-bottom 201 (`api/derive-flows.ts`, TODO item 7)
  and the first post-reload click that only focuses — go to
  TODO.md, not to code.
- Playwright, Puppeteer, or any new dependency.
- Editing dated specs, plans, or mitigation stubs.
- Tiers Phase B, `./measure`, and AUDIT.md's procedure beyond
  its three TEST-PLAN sentences.
- Running the first walk. It is the plan's closing checkpoint,
  operator-run, not a criterion this spec can verify.

## Design

### 1. Three layers

| Layer | Command | Runs | Standing |
|---|---|---|---|
| 1 | `./validate` | AT1–AT3: both `tsc` projects, `./test` (`tests/*.test.ts`, `tests/tz/*.test.ts`), the lints, the two drift gates. Chrome-free, Postgres-free | Gate: every commit |
| 2 | `./test-all` | Layer 1, then `./test-browser` (AT5) | Gate: the operator's, before `./build`, a deploy, or a walk; `./crank` enforces it for the walk |
| 3 | "run the test plan" | `./crank --mock-data 8080` — Layer 1, AT4 `./test-postgres`, AT5 — then one explorer walks every case | Exploration; nothing rides on its result |

`./test-all` is a root Bash script: `set -euo pipefail`, `cd` to
the root, `./validate`, then `./test-browser`. Chrome absence is
`./test-browser`'s own refusal. It joins `./validate`'s
78-column lint list and AGENTS.md's command block. `./validate`
stays Chrome-free; `./crank` is unchanged apart from losing the
slice mode.

TEST-PLAN.md's `## AT` gains **AT5**: `./test-browser`, run by
crank after AT4; needs Chrome; PASS exits 0 with `fail 0`. The
section's preface names the three layers and which AT each
belongs to.

### 2. The serial walk

Replaces `### How to invoke`, `### Sub-agent invocation
contract`, `### Scope`, `### Protocol`, `#### Browser-use
driving`, `#### Serial single-tester mode`, and `### Execution
Order` (~600 lines) with one `## The walk` section (~150 lines).

Master:

1. A1 `./build`, A2 inventory.
2. A3 `./crank --mock-data 8080`. Red anywhere aborts; no
   explorer. Read the seed reveal from stdout. A3 is SV1.
3. Dispatch one explorer with the prompt below.
4. Receive one line per case. Write the summary and one stub
   per FAIL cluster (§3).
5. K8 (wipe and reseed; the explorer has returned), then J1–J3.

The master does not drive the product and does not patch.

Explorer prompt — the plan copies it verbatim:

```
Go to Medium Church!

Then read AGENTS.md at
/Users/tmornini/code/fusion-angle/AGENTS.md in full.

You are the explorer for the Fusion Angle TEST-PLAN walk.

Origin: http://localhost:8080
Admin: {admin_username} / {admin_password}
{the seed reveal's other sign-ins}

Read TEST-PLAN.md from `## The walk` to the end. Every
case from `## AA` through `## SV` is yours, in document
order. Skip K8 (the master runs it after you return) and
J (the master's teardown).

Refuse if browser-use is not available. Do not fall back
to Claude-in-Chrome or chrome-devtools MCP.

Setup, once: clear this origin's cookies with
`Storage.clearDataForOrigin` (`storageTypes: 'cookies'`);
set `Emulation.setDeviceMetricsOverride` to 1280×800 with
`deviceScaleFactor: 1` (I10–I15 set ≤767 and restore);
open one tab and `activate_tab` it. That tab stays
visible for the whole walk. Open a second tab only where
a case needs one (SV6–SV10, cross-tab cases); activate
whichever tab you are driving; confirm
`document.visibilityState === 'visible'` before every
gesture and every timing assertion.

Drive with compositor mouse and CDP key events. Never
`js()` fetch the API — the bearer is memory-only; read
the network log. Sign-ins are throttled to 5 per 60 s
per client: pace them, and a 429 inside that window is
the product working, not a FAIL.

Do not patch. Do not re-seed. Do not retry the plan.

Return one line per case:
ID PASS|FAIL|BLOCKED|DEFERRED|DRIFT — one-line note.
```

Product-true driving notes survive as a short list inside
`## The walk` or beside the case they serve (§4). Everything
that existed because of hidden tabs or fourteen hunters is
deleted: `activate_tab` before each gesture and its
measurement; stolen-tab paint; aliases and why-aliases; two
jars on aliases; fourteen macOS sheets (one line remains: one
sheet per daemon connection — answer it or run `browser-use
mac-approve`); the 1.19× screenshot scale (`deviceScaleFactor:
1` makes element rects the input space, as
`tests/browser/fixtures.ts` does); the `drain_events` ring
discipline (WB16 keeps "read the network log" only); the
14-hunter DAG.

### 3. Scoring and the stub

| Outcome | Meaning |
|---|---|
| PASS | the PASS line was observed |
| FAIL | the PASS line could not be observed as driven — a finding, not a verdict |
| BLOCKED | a step could not be performed for a named reason outside the product (driver or environment); the reason is the note |
| DEFERRED | a prerequisite case did not produce what this case needs |
| DRIFT | passes in substance; document or UI text disagrees — the document changes |

Nothing blocks on any outcome. BLOCKED is allowed for driver
limits again: with no gate riding on the walk, an honest
BLOCKED costs nothing and a dishonest FAIL costs a day. A
durable limit earns the case a one-line driving note, added by
the master.

Summary Format: `Mode:` leaves; the table gains DEFERRED and
DRIFT columns; the "fully green run" arithmetic leaves — the
summary reports counts, and FAIL rows become stubs.
`## BLOCKED detail` lists every BLOCKED with its reason.

Stub — one per FAIL cluster at
`docs/superpowers/test-plan-mitigations/YYYY-MM-DD-{section}-{first-case}.md`;
dated stubs stay frozen:

```
# TEST-PLAN mitigation — {section}

- Section: {id}
- Cases: {comma-separated ids}
- Pin: {the case's Pin clause, copied}
- Expected: {from the case PASS line}
- Observed: {explorer note}
- Suspected layer:
  UI | adapter | API | seed | driver | doc
- Reproduced by:
  tests/{file}.test.ts '{test name}' red at {SHA}
  | not reproduced — {driver or environment reason}
  | doc — {the DRIFT correction}
```

The rule, stated in the stub section and in AGENTS.md's Gates:
**a product commit may cite a stub only when `Reproduced by`
names a red test.** The test sits at the lowest layer that can
express the covenant — a reducer, presenter, or adapter pin at
Layer 1, a CDP test at Layer 2. The ruling is not evidence; the
red test is.

### 4. The case index

**Headers.** The 17 section headers lose `tenant`, `parallel`,
`global_lock`, and `depends`. Document order is the order; K8
and J are the master's, said once in `## The walk`.

**Variants.** The 64 `Serial:` and 59 `Parallel:` markers
collapse to one text per case: the variant that exercises the
product (usually create/act), on the mock tenant's names
(`demo@example.com`, Stark, Wayne, the seeded humans). When
both variants exercise the product equally, the shorter
survives. Where a later case counted the untouched seed, the
count becomes `≥ seeded N` — the exact count is a Layer 1
covenant, not a walk assertion. `Serial: N/A` cases (AA27–AA35,
the empty Create+Archive graph) become driveable: AA26 mints
the flow on the mock tenant; the walk's database is discarded
at J.

**`Pin:` clause.** Every case body ends with one:

```
Pin: tests/flow-operations.test.ts
     'performAddNodeAtPosition: returns node, edge'
Pin: tests/browser/canvas-gestures.test.ts
     'a port drag onto empty canvas adds a node and its edge'
Pin: exploratory — the gold glow's appearance
Pin: tests/api-human-members.test.ts 'PUT replaces the
     strengths list'; exploratory — the chip toggles
```

A test name, not only a file; several pins joined by `;`; the
unpinned remainder named after `exploratory —`. `./validate`
gains one check: every `tests/…test.ts` path cited in
TEST-PLAN.md exists — paths, not names; names are the audit's
judgment, paths are what rot.

**Drive notes.** Product-true notes move beside the cases they
serve or into the walk's short list: the canvas `<svg>` is
replaced on every commit (query fresh); no `dblclick` listener
— two pointerdowns on one id inside `DBLCLICK_MS` (400); chords
carry the browser's `key` (Shift uppercases); `.focus()` selects
like Tab while `.click()` selects nothing; F56 — no canvas click
before Space; list-row drags are pointer capture on
`.drag-handle`; skeleton probe before fetches settle;
reduced-motion via `Emulation.setEmulatedMedia`; downloads via
`URL.createObjectURL` interception, uploads via `DataTransfer`;
list pages wait on the card count, never an early screenshot;
the auth throttle. "First post-reload click only focuses" stays
as a note and is filed in TODO.md as the product seam it is.

**Audit.** One auditor subagent per section (`Go to Medium
Church!`, then AGENTS.md's push-down), given: the section's
case lines; the inventory (`ls tests/*.test.ts
tests/tz/*.test.ts tests/browser/*.test.ts` and each file's
`test('…'` names); and the rule of evidence — a pin is valid
only if the auditor opened the test and can quote the assertion
that decides the case's PASS line; anything else is
`exploratory`. The auditor returns the section's case lines
rewritten (variants merged, header fields dropped, `Pin:`
added, drive notes placed) plus a list of unpinned-but-pinnable
covenants naming the lowest layer that could express each. One
refuter subagent per section re-opens every cited test and
rejects a pin whose quoted assertion does not decide the PASS
line; a rejected pin becomes `exploratory`. The master commits
one section at a time. The gap lists consolidate into one
TODO.md `## Later work` bullet per covenant.

### 5. Retiring the parallel apparatus

| File | Change |
|---|---|
| `crank` | `--mock-data\|--bootstrap port`; usage; mode dispatch |
| `postgres-seed` | same |
| `server/seed.ts` | drop the slice mode and the TSV section reveal |
| `server/postgres-seed.ts` | drop the mode |
| `api/test-plan-slices.ts` | deleted (3,833 lines) |
| `tests/slices-*.test.ts` (11), `tests/test-plan-slices.test.ts` | deleted |
| `tests/api-authentication-token.test.ts` | re-base the fixture on the mock seed |
| `tests/pg-seed.test.ts` | drop the slice-mode cases |
| `tests/api-transition-legacy-cut.test.ts` | drop the named exception |

The three re-based tests keep every assertion they make today
about the product; only their fixture changes. A test that
turns red under the mock seed is a finding, not a reason to
weaken it.

### 6. Documents

- **AGENTS.md** (276 lines against a 300-line ceiling; edits
  replace parallel language rather than append): the command
  block (`./test-all`;
  `./crank` and `./postgres-seed` show two modes); Gates (the
  three layers, `./test-all`, the red-test rule in one
  sentence); the router row for TEST-PLAN.md ("three layers;
  the serial walk"); Subagents (hunter language becomes explorer
  and auditor; the doctrine is unchanged).
- **README.md** row; **SCHEMA.md:94**; **AUDIT.md**'s three
  TEST-PLAN sentences.
- **TODO.md**: item 6 (48 subagents) leaves the critical path;
  7–13 renumber and the `## Sequencing` lines follow; the GPU
  bullet's "no `./test-browser` run has happened anywhere yet"
  is corrected to the fact (green runs on 2026-08-28; the
  oracle — green on two machines — is unchanged); the
  hunter tab-leak bullets under Later work are deleted; the
  audit's gap list and the two product seams join Later work.

## File structure

| File | Responsibility |
|---|---|
| `test-all` | Layer 2: `./validate` then `./test-browser` |
| `validate` | lints `test-all`; TEST-PLAN pin-path check |
| `TEST-PLAN.md` | three layers; the walk; scoring; stub; 400 cases with `Pin:` |
| `crank`, `postgres-seed`, `server/seed.ts`, `server/postgres-seed.ts` | two seed modes |
| `tests/api-authentication-token.test.ts`, `tests/pg-seed.test.ts`, `tests/api-transition-legacy-cut.test.ts` | fixtures off the slice seed |
| deleted | `api/test-plan-slices.ts`, twelve slice tests |
| `AGENTS.md`, `README.md`, `SCHEMA.md`, `AUDIT.md`, `TODO.md` | §6 |

## Commit sequence

One concern per commit; `./validate` green after each.

1. Add `./test-all`; lint it; AGENTS.md command line.
2. TEST-PLAN.md: replace the parallel protocol with the three
   layers, the walk, scoring, and the stub template; add AT5.
   No case edits. **This commit ends the parallel run.**
3. `crank`, `postgres-seed`, `server/seed.ts`,
   `server/postgres-seed.ts` drop the slice mode; SCHEMA.md:94;
   AGENTS.md command lines.
4. Re-base the three borrowing tests.
5. Delete the seeder and its twelve tests.
6. `./validate` pin-path check.
7. README, AUDIT.md, TODO.md (item 6, renumbering, the stale
   note, the tab-leak bullets).
8–24. One commit per section from the audit: variants merged,
   headers dropped, `Pin:` added, drive notes placed. Between
   commit 2 and the last of these, a walk reads a case's
   `Serial:` variant; a case with none reads as written.
25. TODO.md: the gap list and the two product seams.

Then the closing checkpoint: the operator runs one walk under
the new protocol; its summary and any stubs are the first
artifacts of Layer 3.

## Success criteria

- `./validate` green after every commit; `./test-all` green on
  the operator's machine.
- `grep -c '\.localhost' TEST-PLAN.md` is 0; no `hunter`,
  `activate_tab`, `tenant:`, `parallel:`, `global_lock:`,
  `depends:`, `Serial:`, or `Parallel:` remains.
- Every `- [ ] **ID**` case carries a `Pin:` clause; every
  cited path exists (the validate check proves it).
- `api/test-plan-slices.ts` is gone; nothing imports it;
  `./crank --help` and `./postgres-seed --help` show two modes.
- The stub template carries `Reproduced by`; AGENTS.md's Gates
  states the red-test rule.
- TODO.md's critical path has twelve items and the Sequencing
  lines resolve; the gap list is in Later work.
- Dated specs, plans, and stubs are byte-identical.

## Risks

- **A pin cited for a neighboring covenant.** The refuter pass
  and the quote-the-assertion rule; a case with no honest pin
  is `exploratory`, never pointed at a neighbor.
- **`≥ seeded N` hiding a count regression.** Exact counts are
  Layer 1 covenants (the derive tests); the walk observes
  presence.
- **B's sign-in density against the throttle.** The pacing
  rule; a 429 inside the window matters only where a case
  asserts the throttle itself.
- **Audit cost.** Seventeen auditors and seventeen refuters — a
  day or two of fan-out. Chosen knowingly; it is the last time
  the mapping is done by hand. After this it grows one red test
  at a time.
- **The explorer's context.** The Medium scroll, AGENTS.md, and
  roughly 3,300 lines of TEST-PLAN.md in one session. It fits;
  if a future section grows past it, the walk splits by section
  in sequence, never in parallel.
- **One browser-use daemon, one sheet.** Answer it or run
  `mac-approve`; a 45 s silence fails the walk before it
  starts, not mid-walk.

# Root docs rewrite: derive from the ledger

## Problem

Nine root `.md` files hold 485 KB / 10,279 lines. They
narrate the migration instead of describing the
system. "RETIRED" appears 47 times in API.md; ten of
its 35 POST entries describe routes that 404; two
agent session ids leaked into its prose. SCHEMA.md
has 185 commits against 7 for
`api/schema-postgres.ts` — it caches the migration,
not the schema. AGENTS.md (838 lines, ~9k tokens)
loads on every agent turn and exceeds Codex's 32 KiB
AGENTS.md cap. Code comments cite headings that no
longer exist (`SCHEMA.md SP-1`, `SCHEMA.md § Orphan
stores`); AUDIT.md cites an ARCHITECTURE.md heading
that does not exist.

The docs are a derived cache of two ledgers — git
(what changed) and the code (what is). What the
ledger remembers, the cache only re-remembers.

## Goals

- Every root doc keeps only what neither ledger shows
  in ten seconds of `ls`, `grep`, or `git log`: the
  why, the capability a newbie will not notice, the
  invariant that bites, the pointer.
- Every fact names its source of truth by path.
- AGENTS.md is a thin router (~180 lines).
- SCHEMA.md is a capability map of the one table.
- One history paragraph per doc, five lines or fewer:
  no phase or task numbers, no session ids. One
  test-pinned "Do not resurrect" list in
  ARCHITECTURE.md.
- `./validate` gates root doc line counts, with room
  to breathe.
- Every heading a code comment cites survives
  verbatim, or the comment is re-pointed in the same
  commit.
- TEST-PLAN.md machinery is untouched: `##` section
  names and their four-field headers, every case line,
  the hunter prompt, Protocol, the DAG edges, Known
  MCP limitations, Execution Order, Summary, and
  Summary Format.

## Non-goals

- Rewriting `docs/superpowers/` specs and plans. They
  are dated history.
- Changing code behavior. Only comments that cite doc
  headings change.
- Renaming or merging doc files. The set stays at ten:
  nine docs plus the one-line `CLAUDE.md` stub.
- Generating ARCHITECTURE or SCHEMA prose. The
  generated artifacts (`SCHEMA.svg`,
  `/api-documentation/`) exist; the prose points at
  them.
- Touching TEST-PLAN.md case bodies, including the
  `≥ N` doc debt Protocol names.

## Principles

1. Derive from the ledger. A line survives only if
   `ls`, `grep`, or `git log` cannot answer it fast.
2. Anchor, do not restate. Cite `api/…`, `routes[]`,
   `tests/…`. Never paraphrase a table, a DDL, or a
   test list.
3. Happy path first. Purpose, then substance, then
   `## How we got here` last.
4. Headings are addresses. Named headings only; no
   numbered sections.
5. One voice. One writer, serial, Full scroll.
6. Office of Format: 78-char lines, four-space
   indent, final newline.

## Doc set and budgets

Target is what the rewrite aims at. Gate is the
`./validate` ceiling: target × 1.5, rounded up to the
nearest 50, so a 1% growth never breaks a build.

| doc               |   now | target | gate   |
|-------------------|------:|-------:|-------:|
| AGENTS.md         |   838 |   ~180 |    300 |
| README.md         |    90 |    ~70 |    150 |
| ARCHITECTURE.md   | 1,077 |   ~280 |    450 |
| SCHEMA.md         |   360 |   ~110 |    200 |
| API.md            | 3,667 |   ~260 |    400 |
| DESIGN-SYSTEM.md  |   726 |   ~200 |    300 |
| FLOW-CANVAS.md    |   217 |   ~150 |    250 |
| AUDIT.md          |   289 |   ~220 |    350 |
| TEST-PLAN.md      | 3,016 | ~2,860 | exempt |

Prose docs (all but TEST-PLAN.md): 7,263 → ~1,470
lines. `CLAUDE.md` stays one line and is not gated.

## Size gate

In `./validate`, beside the 78-char awk: a table of
`FILE MAX` pairs (the gate column above), `wc -l` per
file, and a failure line `FILE: N lines (max M)` on
any excess. TEST-PLAN.md is exempt for the same reason
it is exempt from the width lint: cases grow. The
table lives in `validate` itself, like the lint; a
budget change is a one-line diff in that script.

## Shape of every doc

1. One paragraph: what this doc is for and what it
   deliberately does not repeat.
2. The substance — capabilities, invariants, rules —
   each with its code anchor.
3. `## How we got here` — the history paragraph.

## Per-doc maps

### AGENTS.md (~180)

Keeps: the intro naming the `CLAUDE.md` stub; the
fenced command block minus dead options, with the
sandbox `TMPDIR=/tmp/claude` line and the env-var
line; `## Gates` (what `./validate` composes, clean
tree for build and measure, the orchestration abort
rule); `## Commit`, `## Worktrees`, `## Subagents`
near-verbatim — `Go to Medium Church!`, the
Full/Medium scroll policy, and the push-down list are
machinery; `## Where things live` (one line per
top-level directory, then "run `ls`"); `## Invariants
that bite`, each two to four lines with an anchor,
including `### Transaction bodies await only row ops`
word for word (twelve code citations); `## Read next`,
a pointer table into the other docs.

Drops: Validate-semantics prose; the Measurement
section (to six lines, `./measure --help`, and the
three spec paths); Key Layers (to ARCHITECTURE.md);
UI detail (to DESIGN-SYSTEM.md); Project Structure
prose; the test-file inventory (`ls tests/`); all
RETIRED narrative.

History: a Claude-only file that every migration
phase appended pins to; now a cross-tool router behind
the `CLAUDE.md` stub.

### README.md (~70)

Keeps: the product sentence; the module list (the one
user-vocabulary description of the product); getting
started; a one-table doc map; the Church install and
the `claude --effort max 'Go to Church!'` line.

Drops: the A1–A6 sentence; the duplicated postgres.js
paragraph.

### ARCHITECTURE.md (~280)

Keeps, as named headings: `## One origin, one ZIP`
(artifact; `server/boot.ts` env contract: required
env never logged, 413, no DDL, no argv,
`schema_marker` refusal, one mint process);
`## Layers` (`api/`, `shared/` one-way, `web-app/`,
`server/`; the two composition roots); `## The
request vessel` (`IncomingContext` →
`AuthenticatedContext` → `RequestContext`, each field
set once; bearer never in the vessel; handlers
transport-free); `## Tenancy` (org from the VERIFIED
claim, never the path; flat token →
`identityDefaultOrganization`: SET default if a live
seat, else PRIMARY, else 403; roles are claims; the
NAMED ≤15-minute covenant; `writeAuthorizerFor` 403
before genesis; foreign 403 / absent 404; path org
must equal claim org); `## Identity, seats,
invitations` (tenant root; seat = identity↔org plus
`type`; roster = seats plus ai-agents; the system
member constant; the invitation alphabet; accept
writes the seat stamped with the invitation's org in
one transaction; two nests over one prefix);
`## Derivation` (every family is a fold over pairs at
an address, `api/derive-*.ts`; the view-accepting
convention as five rules; the one named whole-plane
scan); `## Flow graph` (body-resident graph; sidecars;
frozen `flow_graph`; server-side undo replay; the
route as the single divorce point); `## Records`
(type, attribute, instance; binding; constraints and
the two enforcement sites; the transition gate;
RESTRICT rules; 405 / PATCH / If-Match); `## Work
orders` (claim alphabet, claim-expiry
materialization, all-see-all visibility — moved here
from FLOW-CANVAS.md); `## Conventions` (page module;
presenter read/edit split with `PageState`; imports;
naming; adapters: ctx-first, void mutations plus
notify channels, the named non-void exceptions);
`## Known residuals` (the live list; AUDIT.md points
here); `## Do not resurrect` (about twelve lines,
each `surface — pinned by tests/…`: the `states`
table and the event-append address, flat `/records`
and `/record-attributes`, `flows/:id/versions`
writes, flat member POSTs, org-scoped decorator
stores, the token, clients, and identity_providers
tables, role grants, bulk history routes, redo).

Drops: the decorator era; Phase 14, 15, and Final
as-built; the three deviations; the wire-silent
claim; Gate 6 re-homes; the addressability election;
the exit residual; storage-tier detail (to
SCHEMA.md); A1–A6 disposal text.

History: row plane, then dual-write, then the pair
plane; decorators replaced by claim projection plus
the write authorizer; six deploy blockers disposed.

### SCHEMA.md (~110)

Keeps: `## The one table` (a pair is request plus
response wire bytes; columns are addressing
metadata; writes only, no GET rows; the table is
named once and anchored to `TABLE_NAMES`); `## What
the DDL buys you` — ten capabilities, each with its
anchor: `message_body` plus the GIN index →
`getAllWhereBody`; `COLLATE "C"` plus the six-digit
CHECK → lexical order is chronological → the
`(at, id)` total order; `pairs_address` → head and
history for free; `pairs_version` plus the sha256
chain → ETag / If-Match and tamper-evident lineage;
`pairs_replay` → idempotent replay; the CHECK
constraints → Postgres as the storage-edge
validator; `schema_marker` stamped last; tenancy
rides `uri_collection`; `operation_id` groups one
client operation; `requester_identity_id` is
authorship; the `pg_notify` hook; the memory backend
with the same semantics. `## Document bodies`
(native nested JSON, native booleans, the
`serializeValue` NOT-NULL gate, the stored graph
shape as a pinned contract). `## Timestamps`,
`## Secrets`, `## PII erasure — the one hard delete`
as named headings: the latter two are the targets for
the dead `SP-1` and `§ Orphan stores` citations.
`## State alphabets` is one pointer:
`grep -n '_STATES = ' api/types.ts`. `## Operator
tools`: seed and wipe semantics in eight lines.

Drops: everything else — the derived-family
walkthroughs, the history read map (routes and
API.md), the retired-table narrative.

History: tables came and went; the ledger was always
there; now it is the schema.

### API.md (~260)

Keeps: `## Dispatch order` (six steps, compressed);
`## Bearer-exempt set` (pointer); `## Wire contract`
(response rebuilt from the stored row; the four
headers; one status-ladder table for 200, 201, 204,
400, 404, 405, 409, 412, 428; replay returns the
original; If-Match as the sole conflict mechanism;
409 versus 412 named); `## Two PUT classes` plus
instance PATCH; `## Compositions worth knowing` —
six entries of ten lines or fewer: idea conversion
(3+N pairs, one transaction), flow undo, work-order
transition with its instance revision, work-order
binding, invitation accept, token grant dispatch
(grant and 401 classes, PKCE); `## Why composition is
store-level`; `## Seed pair formation` (1448 / 8
absolute).

Drops: the URI catalog (`/api-documentation/`, 141
rooms, is the catalog); the ten retired POST entries
and every phase aside; shadow-ledger sections 5.5
through 5.20; both leaked session ids.

History: a catalog and a migration instrument — the
actual-versus-doctrinal decomposition proved each
POST composable before the tables went; post-Final
every write is a pair append and the instrument
retired with its subject.

### DESIGN-SYSTEM.md (~200)

Keeps: `## Tokens` (`hsl(var(--token))`, no hex; the
semantic-role lines only; values live in
`styles/tokens.css` and render at `/design-system/`);
`## Variants` (`data-tone` / `data-level`);
`## Components` (button class vocabulary, cards,
badges, the dialog and tab patterns moved from
AGENTS.md, the `<optgroup>` rule, the org switcher,
the invitations bell); `## Heat ramp` whole; `## Flow
designer visuals` short; `## Iconography` (named —
`icons.ts` cites it); `## Responsive breakpoints`
(named — `web-app/auth/index.ts` cites it); `## Motion
and elevation` (names only); `## Content` (em-dash,
plural grammar, error and empty-state voice); `## CSS
architecture` (cascade order, per-page bundles, the
where-to-add table, file rules).

Drops: the four scale tables; the type, spacing, and
contrast tables; Do's and Don'ts; the
parallel-loading essay.

### FLOW-CANVAS.md (~150)

Same substance under headings: Layers; The FSM seam;
Gesture rendering; Camera rules (the MUST NOTs);
Special nodes; Members and attributes; Hazards (one
predicate, three call sites); Publish gate; Stats
variant. Claim expiry and workbox visibility move to
ARCHITECTURE.md § Work orders.

### AUDIT.md (~220)

The runbook, the hunter prompt, and both schemas stay
verbatim; repetition trimmed; the dead `§ Server-tier
deploy blockers` citation re-pointed to
ARCHITECTURE.md § Known residuals.

### TEST-PLAN.md (~2,860)

Out: `### Historical note (not the scheduler)`,
`#### Six-phase parallel protocol`, `#### Entity
mutation domain scoping`, `### Retired pages`.
`### Scope` to about eight lines. Two wording
touches inside machinery, named here because they
are machinery: "Phase 5 teardown's J1" becomes
"teardown's J1"; "No Phase-1 UI rebuild" becomes "No
UI rebuild". Nothing else.

## Citation rule

The commit that deletes or renames a heading
re-points every code comment that cites it, in the
same commit. Known re-points:

- `api/routes.ts` `SCHEMA.md SP-1` → `SCHEMA.md
  § Secrets` (SCHEMA.md commit).
- `tests/api-pii-hard-delete.test.ts` `SCHEMA.md
  § Orphan stores` → `SCHEMA.md § PII erasure`
  (SCHEMA.md commit).
- `web-app/auth/index.ts` `AGENTS.md § Mobile
  Responsiveness` → `DESIGN-SYSTEM.md § Responsive
  breakpoints` (AGENTS.md commit).
- `web-app/app/icons.ts` `DESIGN-SYSTEM.md § 9` →
  `DESIGN-SYSTEM.md § Iconography` (DESIGN-SYSTEM.md
  commit).
- AUDIT.md `§ Server-tier deploy blockers` →
  `ARCHITECTURE.md § Known residuals` (AUDIT.md
  commit).

Before every commit:
`grep -rhoE '[A-Z-]+\.md § [^.;)]+' api web-app tests`
and every hit must match a live heading.

## Execution order

One doc per commit, `./validate` green, subject about
fifty characters, present-tense imperative:

1. SCHEMA.md — the exemplar; sets the voice.
2. AGENTS.md — the per-turn win; lands `## Read next`.
3. ARCHITECTURE.md — creates `§ Known residuals`,
   `§ Do not resurrect`, `§ Work orders`.
4. API.md. 5. DESIGN-SYSTEM.md. 6. FLOW-CANVAS.md.
7. README.md. 8. AUDIT.md.
9. TEST-PLAN.md — last, rebased over whatever the
   test-plan remediation has landed. The regions are
   disjoint (front matter versus case bodies).
10. The size gate in `validate`, with the gate column
    above. Last, because adding it first reds every
    commit until the end.

If the `message_pairs` table rename
(`2026-08-22-rename-pairs-to-message-pairs-design.md`)
lands before step 1, SCHEMA.md uses the new name.
Either way the doc names the table once.

One writer, serial, Full scroll. No subagent fan-out:
nine parallel writers are nine voices.

## Verification

Per commit: `./validate` green (the width lint and
the live-name test cover the new text); `wc -l` at or
under the target; the citation grep above.

Final state: `grep -cE 'RETIRED|Phase (Final|[0-9]+)'`
over the root docs is zero outside TEST-PLAN.md's
untouched case bodies; no session id remains; every
cross-doc link resolves to a live heading.

## Risks

A fact only the old prose held is lost. The old text
stays in git; the history paragraph and the "Do not
resurrect" list carry the hazards that recur. AUDIT.md
hunters treat the docs as contracts of record; a
thinner contract means fewer kills-by-contract — the
code becomes the contract, where it belongs.

The remediation plan under `docs/superpowers/plans/`
still says "update `CLAUDE.md` pins"; that means
AGENTS.md now. Dated plans are not edited.

## Alternatives rejected

- Delete all archaeology with no history paragraph.
  Rejected: a newcomer needs five lines of
  orientation.
- Gate only AGENTS.md. Rejected: the other docs regrow
  the same way.
- One subagent per doc in parallel. Rejected: nine
  voices.
- Fold FLOW-CANVAS.md into ARCHITECTURE.md. Rejected:
  stable addresses; it is the canvas contract.
- Add the size gate first. Rejected: every commit
  between would fail `./validate`.

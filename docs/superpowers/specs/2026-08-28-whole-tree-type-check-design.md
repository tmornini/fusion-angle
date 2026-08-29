# Whole-tree type check: two universes, one option set

Date: 2026-08-28. Status: approved in conversation;
one pass. Closes TODO.md critical-path item 1.

Sections 1 and 2 were approved in the design
conversation; section 3 was presented and this plan
session takes it, including the covenant pin.

## Problem

`./validate` runs one
`tsc --noEmit -p web-app/app/tsconfig.json`. Its
`include` roots are `web-app/`, `api/`, `shared/`.
`server/` and `tests/` sit outside them; seven
Node-only modules sit in `exclude` (`compose.ts`,
`generate-schema-svg.ts`,
`generate-api-documentation.ts`, `measure.ts`,
`measure-viz.ts`, `cdp-client.ts`,
`browser-drive.ts`). So hundreds of `.ts` files are
never checked. Everything runs under
`node --strip-types`, which ERASES annotations
instead of checking them — the trees that boot the
server and assert every covenant learn their type
errors at runtime.

A probe of the whole tree under today's seventeen
compiler options plus `types: ["node"]` reports 699
diagnostics at `8cad9e86` (re-measured 699 at
`afb16a4f`, 196 files). The families and their
idioms are the contract, not the counts.

tsserver today has no root config, so an excluded
tool such as `measure.ts` lands in an *inferred*
project: phantom `node:fs`, unresolved `process`.
Pages outside `web-app/app/` (`web-app/flows/**`
and the other page directories) also open under
that inferred project.

## Goals

- Every `.ts` file under `api/`, `server/`,
  `shared/`, `tests/`, and `web-app/` type-checks
  in `./validate`.
- One copy of the compiler options.
- Two universes: a Node+DOM superset at the repo
  root (the editor's catch-all), and a pure browser
  subset at `web-app/app/tsconfig.json` with
  `types: []`.
- `@types/node` is the one new cost, types-only,
  exact-pinned like its three siblings.
- `erasableSyntaxOnly` and `verbatimModuleSyntax`
  enforce at `tsc` what `--strip-types` requires
  at runtime.
- Membership by rule: a new directory anywhere in
  the five roots is in. The browser `exclude` list
  is the single registry of Node-only modules; a
  Node-only module not on it fails the browser
  project on its `node:` imports (loud).
- Green `./validate` at every commit. Root
  diagnostics are not in the gate until they are
  zero.

## Non-goals

- Moving or renaming the browser config (three
  live references; the in-flight verification-tiers
  plan edits it by path). Follow-on in TODO.md.
- A DOM-free server universe (`api/` is isomorphic
  and names `lib.dom`-only WebCrypto/Fetch types,
  and tests import presenters). Follow-on in
  TODO.md.
- Moving Node-only modules out of `web-app/app/`
  into a top-level tools directory. Follow-on in
  TODO.md; after the tiers plan.
- `tsc -b` / project references (nothing is
  emitted).
- `engines` in `package.json` (the Dockerfile is
  the pin).
- Any Deno-path change.

## Design

### Two universes, one option set

**`tsconfig.json` (new, repo root) — the superset.**
Holds the one copy of the compiler options: today's
seventeen, plus `verbatimModuleSyntax: true`,
`erasableSyntaxOnly: true`, `types: ["node"]`,
`lib: ["ES2024", "DOM", "DOM.Iterable"]`. `include`
is the five directories — `api`, `server`,
`shared`, `tests`, `web-app` (`**/*.ts` each). No
`exclude`. A new directory anywhere in the tree is
in by rule.

**`web-app/app/tsconfig.json` (edited) — the pure
subset.** Becomes `"extends": "../../tsconfig.json"`
with exactly one override, `"types": []`, and keeps
its own `include` and its `exclude` list — which is
now the single registry of Node-only modules. The
only failure mode of that list is loud: a Node-only
module not on it fails this project on its `node:`
imports. Seventeen duplicated options become zero.

`extends` in tsconfig is single-inheritance of
*options*, while `include`/`exclude` stay local to
each file — so the subset config can remove
capability (`types: []`) while re-declaring its own
membership. TypeScript 6 defaults `types` to `[]`,
so that override is documentation rather than
defense: it states the purity the browser project
relies on, in the file a reader will open.

**`package.json`:** `"@types/node": "24.13.3"`,
exact like its three siblings; the lockfile
follows. It ships into the Dockerfile's `npm ci`
as types only.

**`./validate`:** two lines where there is one —
`tsc --noEmit -p tsconfig.json` (the wide gate,
everything reachable) then the existing browser
line (the narrow gate, purity). Measured cost:
1.4 s → ~4.2 s.

**Editor projects, measured with `tsserver`:**

Today (only `web-app/app/tsconfig.json`):
`app/page.ts` is in the app project (`process`
unresolved); `app/tool.ts` (excluded) and
`other/page.ts` are inferred — phantom `node:fs`.

Today plus `@types/node` merely installed: all
three unchanged; excluded tools stay inferred.

After this item (root + `extends`): `app/page.ts`
stays pure in the app project; `app/tool.ts` and
`other/page.ts` open under the root — no
diagnostics.

tsserver's project selection is two-step: nearest
`tsconfig.json` up the tree, then — if that
config's `include`/`exclude` rejects the file —
continue to ancestors before falling back to an
inferred project. A root superset config therefore
acts as the editor's catch-all. This item cures
the seven tools' editor diagnostics as a side
effect. Moving the tools (TODO.md later work) is
about structure, not editor correctness.

Pages outside `web-app/app/` still open under the
superset, where `process` resolves; their purity
lives in the gate (the browser project still
includes them via `"../**/*.ts"`), not in the
editor's nearest-config walk.

**Measured properties:** root reports the same
error set as the probe (699 at `8cad9e86`; 0 after
the families); the browser project with `types: []`
still cannot see `process` (a planted `leak.ts`
fails TS2591); both flags add 0 errors to either
project; `@types/node` 24 and 26 agree. Pin 24.13.3.

### Remediation: 699 → 0, one family per commit

The numbers are a snapshot. The plan re-measures at
its start. Order runs from least judgment to most,
so each family sees a truer diagnostic set:

1. **Instrument** (two commits): `@types/node`
   24.13.3 in `package.json`; then the root
   `tsconfig.json` + the browser `extends`. Root is
   red at this point but *not yet in* `./validate`,
   so every commit stays green.
2. **Dead code** (TS6133 + TS6192, ~346): delete
   unused imports, locals, and whole import lines.
   One rule for the judgment call: if the unused
   value is an *observation* of the subject (a
   response, a derived head) and the test's title
   claims it, add the assertion the title promises;
   otherwise delete.
3. **Stale `@ts-expect-error`** (TS2578, 31):
   delete the directive. An error that then
   surfaces on the next line belongs to its own
   family below.
4. **Undefined names** (TS2304, 2): `seedSeat`
   (`tests/adapters-admin.test.ts:142`), `sarah`
   (`tests/adapters-invitations.test.ts:815`). Add
   the import/definition so the line executes; what
   happens next is a finding (rule below). After
   family 2, `seedSeat` may have left with unused
   `seedMembership` — re-measure; do not resurrect
   the dead helper to satisfy the snapshot.
5. **Fixture drift** (~205: TS2345, TS2741, TS2322,
   TS2353, TS2739, and TS2339 except the
   `spawnSync`/`measure.ts` sites): complete each
   literal to the entity's true shape through the
   shared builders in `tests/*-fixtures.ts`. Never
   `as Entity`, never `Partial<Entity>`, never
   widening the production type to fit the test.
6. **Arity** (TS2554, 48): pass the real argument,
   or drop the extra. If the callee ignored it on
   that path nothing changes; if it read
   `undefined`, finding.
7. **Absence, not `undefined`** (TS2379 33 +
   TS2375 1 + `server/boot.ts:122`): conditional
   spread where an optional *parameter* becomes an
   optional *property*; never widen the property to
   `| undefined` — `exactOptionalPropertyTypes` is
   the Church's "absence is the absence of the row"
   at the type level. Most sites are test-local
   `req()` helpers.
8. **DOM stubs** (TS2740, 25, paired with
   directives from 3): a stub is typed by one cast
   at its construction — `as unknown as Document`
   — never by a directive.
9. **Narrowing and the singletons** (~12):
   `unknown` bodies narrowed through the wire
   decoders (`tests/api-objective-document.test.ts:429-431`),
   index guards (`tests/drift-states.test.ts:533`),
   `'code' in e` for the `Error` cast
   (`tests/pg-boot.test.ts:144`), the two
   impossible literal comparisons
   (`tests/api-entity-history-routes.test.ts:313`,
   `tests/api-work-order-history.test.ts:322` —
   dead branches, findings), the duplicated `id`
   key (`tests/presenter-flow-stats.test.ts:16`),
   export/import `HumanMember` from the module that
   actually exports it, and `spawnSync` with
   `encoding: 'utf8'` in the crank/serve CLI tests
   so `stdout`/`stderr` are `string` and a `stamp`
   field is named on the return type.
10. **`web-app/app/measure.ts`** (the remaining
    TS2339 after family 2 deletes unused `sleep`):
    narrow the offender union on `reason` before
    reading `medianReadyMs`. Do not widen
    `BudgetOffender`.
11. **Flip the gate:** `./validate` gains the root
    line; then the documentation below.

**The finding rule.** When a completed fixture, a
supplied argument, or a newly executing line turns
a test red, the test was green for the wrong
reason. Per the Office of Verification there are
two exits — fix the code to the covenant the test
names, or delete the test because its covenant was
wrong — and this item takes them in place, each as
its own commit with the red test as evidence. A
finding whose fix is not confined to the test's
subject pauses the item for its own brainstorm
(the ratchet); it is not papered over to reach
green.

**Fan-out.** Families 2, 5, 6, 7 are large and
file-partitionable: the master runs
`tsc -p tsconfig.json`, splits one family's
diagnostics by file across Medium-Church
subagents (each briefed with the family's idiom
and the finding rule), then validates and commits
the family. Families never interleave within a
commit.

**Sequencing with the verification-tiers plan.**
This item lands at that plan's next pause, before
Task 12 (`tests/browser-globals.ts`) and Task 13
(the `req()` helpers), so those tasks inherit
families 8 and 7's idioms and typed sites instead
of creating new untyped ones. Do not interleave
file-by-file with that plan. Starting from the
pause after Task 4 (client bundle extracted) is
the preferred pause: new `tests/browser/` files
then enter already under the gate.

### Documentation, in the flip commit or its neighbors

One concern each:

- `./validate` gains the root line ahead of the
  browser line — same commit as the AGENTS.md
  **Gates** paragraph, which stops saying
  "composes `tsc --noEmit`" and names the two
  projects: `-p tsconfig.json` (everything, Node +
  DOM) then `-p web-app/app/tsconfig.json` (the
  browser subset, `types: []`).
- AGENTS.md **Invariants that bite** gets a ~10-line
  entry, *Two type universes*: the root is the
  superset and the editor's catch-all; the browser
  config is the pure subset; a Node-only module
  goes on the browser `exclude` list and nowhere
  else; `erasableSyntaxOnly` and
  `verbatimModuleSyntax` are what `--strip-types`
  requires at runtime, enforced at `tsc`. The
  existing `noUncheckedIndexedAccess` entry's
  "tsconfig enables this" stays true.
- `TEST-PLAN.md` AT1 names both commands (a
  one-line edit; the tiers plan's Task 19 rewrites
  the document later and inherits it).
- Stale comments that say "excluded from tsc (no
  `@types/node`)" become false at the flip. Per the
  Office of Commentary the *why* survives
  ("Node APIs; on the browser exclude list") and
  the false clause goes. The plan re-greps at
  execution. Known at design time:
  `browser-drive.ts:3-4`, `cdp-client.ts:2-3`,
  `generate-api-documentation.ts:6-8`,
  `measure-viz.ts:4`, `measure.ts:3`,
  `server/http-server.ts:3`, `server/boot.ts:5`,
  `server/scrypt-hash.ts:2-3`.
- `api/document-family.ts:47` and `api/routes.ts:338`
  stay: their claim (type-only imports are erased)
  remains true and is now `tsc`-guaranteed.
- `package-lock.json` follows
  `npm install --save-dev --save-exact @types/node@24.13.3`.
- TODO.md at the close: item 1 out, "Thirteen" →
  "Twelve", 2–13 renumber, the Sequencing arrows
  shift by one, and the later-work bullet about
  moving the browser config drops its
  "the critical-path item" reference.

### Verification

- **Artifact identity.** esbuild reads the nearest
  `tsconfig.json`: `server/boot.ts` will now find
  the root config, and the browser entries will
  follow `extends`. `./build --no-zip` at the
  commit before the configs and at the flip; `cmp`
  on `server.mjs`, `assets/app.js`,
  `assets/theme-init.js`, `assets/root-redirect.js`.
  Expected byte-identical (`verbatimModuleSyntax`
  only alters elision of unused imports, which
  `noUnusedLocals` forbids); any difference is
  explained before the commit lands, or the commit
  is wrong.
- **Green at every commit.** `./validate` after
  each family; root diagnostics counted down per
  task in the plan.
- **One covenant pin,**
  `tests/tsconfig-covenants.test.ts` (~1 s): via
  `tsc --showConfig`, the resolved browser config
  has `types: []` and the root has
  `types: ["node"]`, both carry both flags; and
  behaviorally, a one-file config extending the
  browser project rejects `process` with TS2591 —
  purity is the covenant whose failure is silent,
  so it gets the behavioral pin.
- **Editor projects,** measured, recorded above.

### The close

The item leaves TODO.md by the Close protocol in
the flip commit's neighbor: remove the bullet,
renumber, shift Sequencing, drop the stale
later-work clause. No KNOWN seam, no AUDIT.md `m`
change.

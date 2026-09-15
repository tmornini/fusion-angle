# Retire the trio: state rides the head

- Date: 2026-09-15
- Status: proposed
- Worktree: `.worktrees/retire-the-trio`
- Base: master at `ab1f0cea`
- Ships: the last of Decision 7's lifecycle trio out of ideas,
  projects, objectives, and record-types: the server-side walk
  that re-derives a state the head body already holds, the
  discriminant and helpers named for it, the two create-body
  fields that outlived it, the seed rows typed for it, the
  client wrappers that carried it, and every comment, test name,
  and dead parameter that narrates it. A pure refactor. No page,
  presenter, or CSS changes; no wire byte changes but one, named
  in decision 2.
- Supersedes: the direction of TODO.md item 7. State stays in
  the document body and is read from the head; it does not move
  into event pairs.
- Leaves as-is: flows and work-orders (about to be replaced),
  identities and ai-agents (already stateless), members and
  invitations.

## Problem

Decision 7 folded the retired states document into every document
PUT as three fields: `state`, `state_at`, `state_event_id`. For
ideas, projects, objectives, and record-types the last two have
already left the wire. Each PUT body carries `state` alone; each
GET row stamps `state` alone. What has not left is everything
built to serve the three.

- Every GET for the four families walks the document's full
  history. `documentLifecycleEvents` in `api/derive-documents.ts`
  finds no `state_event_id`, so it synthesizes one event per PUT
  pair from that pair's own `(response_at, id)`, and
  `currentLifecycleEvent` sorts by the same key to pick "current".
  `deriveDocumentsAt` already chose the head by that key. The
  walk's answer is always the head body's `state`. The clock-skew
  tests pass because the server stamps `at`, not because the walk
  guards anything; their fixtures never build the skew they name.
- Every live document PUT reads the document's history a second
  time (`resolveStreamedTrioWriteBody`) to walk the chain with an
  arrival-last sentinel and compute a write response that
  `successBody` already computes from the request body alone.
- `DocumentFamilyWiring.lifecycle` is `'trio' | 'stateless'`, and
  every `entityOf` takes a `current` event it reads one field of.
- POST objectives and POST record-types still carry
  `initialStateEventId` and `initialStateAt`, validated then
  discarded by `objectiveDocumentBodyOf` and
  `recordDocumentBodyOf`. The client mints both on every create.
- The seed's per-entity rows (`ideaStateEvents`,
  `projectStateEvents`, `recordStateEvents`) are `StateEntity[]`
  with five fields, of which three are read.
- The client carries `IdeaStateDetail`, `ProjectStateDetail`,
  `ObjectiveStateDetail`, and `RecordStateDetail`, each `{ state }`,
  the survivors of a round-trip contract that once needed three
  fields for a PUT that no longer exists.
- Four `derive*StateHistory` functions and the unrouted
  `deriveIdea(s)` and `deriveProject(s)` have no product caller;
  only tests call them. `api/derive-objectives.ts` is one of them
  and nothing else.
- Thirty product files and forty-five test files name the
  trio in comments, names, or dead parameters. API.md, SCHEMA.md,
  ARCHITECTURE.md, and AGENTS.md do not.

## Decisions

1. State stays in the document body. PUT stores it; GET reads it
   from the head. There are no lifecycle event pairs for these
   families. TODO.md item 7 is rewritten to say so.
2. The two create bodies drop `initialStateEventId` and
   `initialStateAt`. A body carrying either now 400s as an
   unexpected key. This is the one wire change; our client and
   the seed are the only callers.
3. The six unrouted derives go, and with them the tests that
   exist only to exercise the walk. A test whose covenant is gone
   is deleted, never weakened.
4. `lifecycle` is renamed for all five families. Flows' wiring row
   takes the new literal and its `entityOf` shim loses an unused
   parameter. `api/derive-flows.ts` and flows' validator, client,
   seed, and tests are untouched.
5. The work lands layer by layer, each concern its own commit,
   every commit green.
6. No wire byte of any GET, versions list, version get, or write
   response changes. Idea and project seed pair bodies are
   byte-identical before and after. The drift suites are the
   witness.

## Vocabulary

| Was | Becomes |
|---|---|
| `lifecycle: 'trio'` | `lifecycle: 'state'` |
| `entityOf(document, organization, current)` | two arguments |
| `STREAM_TRIO_FAMILIES` + `STREAM_STATELESS_FAMILIES` | `STREAM_FAMILIES` |
| `trioDocumentFromBody` | `documentFromBody` |
| `trioCurrentFromBody`, `stateFromDocument` | retired |
| `resolveStreamedTrioWriteBody` and helpers | retired |
| `*StateDetail` (four) | the bare `*State` |
| `*StateDetailFromRow(row)` | `*StateOf(row)` |
| `getObjectiveStateDetails` | `getObjectiveStates` |
| `ideaStateEvents: StateEntity[]` | `ideaGenesis: SeedGenesis[]` |
| `ideaSeedBody(idea, event, i)` | `ideaSeedBody(idea, state, i)` |

The word "trio" survives only where flows' body still carries
three fields, and in seed mnemonics such as `mem-trio-1` that
name a group of three members, not a lifecycle.

## The read path

`api/document-family.ts`

- `lifecycle: 'state' | 'stateless'`. `entityOf(document,
  organization)`. A `'state'` family's `entityOf` reads `state`
  from the head body with `pickString`, as `stateFromDocument`
  did on the versions path.
- `derivedDocumentEntity` reads `messageStore(db).getDocumentHead`.
  `null` is a miss. For a `'state'` family a head whose body
  `state` is `DELETED_STATE` is a miss. Both misses take the
  existing `throwDocumentMiss` ladder, so 403 and 404 are
  unchanged. No history read, no walk.
- `documentCollectionGetHandler` reads
  `db.messagePairs.getCollectionHeadPairs`, the live PUT heads in
  the seam's `(response_at, id)` order, the same order the
  retired `getCollection` read gave. Each head decodes with
  `requestBodyOf`; a `'state'` head whose body says `deleted` is
  skipped; each survivor maps through `entityOf`. The all-pairs
  `getCollectionPairs` read and the `deriveDocumentsAt` fold go
  from this handler.
- `serveDocumentRevision` and `versionSnapshotsAt`'s callers pass
  two arguments. `documentVersionListHandler` keeps its flows
  branch on `wiring.family === 'flows'` alone.
- `documentStateHistoryHandler` and `documentStateHistoryAt` stay;
  they serve flows' versions list.

`api/derive-documents.ts`

- `documentLifecycleEvents` keeps only its `state_event_id`
  branch. It is flows' event walk over bodies whose validator
  guarantees that key; a body without it is a contract breach and
  `pickString` throws. The `afterDelete` state and the
  consecutive-equal-state dedupe go with the synthesized branch.
- `DELETED_STATE`, `stateHistoryFrom`, `currentLifecycleEvent`,
  and `currentDocumentState` stay for flows. Their comments stop
  naming ideas, projects, records, objectives, or members.

`api/derive-ideas.ts` keeps `ideaEntityOf`, now reading `state`
from the body, plus `ideaSubmissionEntityOf` and
`deriveIdeaSubmissions`. `deriveIdeas`, `deriveIdea`,
`deriveIdeaStateHistory`, and the two fetch helpers go.

`api/derive-projects.ts` keeps `projectEntityOf`. The rest goes.

`api/derive-objectives.ts` is deleted.

`api/derive-record-types.ts`: `recordTypeEntityOf(document,
organization)` reads `state` from the body.
`deriveRecordTypeCollection` reads `getCollectionHeadPairs`;
`deriveRecordTypeEntity` reads `getDocumentHead`; both apply the
same `deleted`-head miss. `deriveRecordTypeStateHistory` and the
two fetch helpers go. `requireRecordTypeExists` is unchanged.

`api/routes.ts`: the five wiring rows take `'state'`;
`objectiveDocumentEntityOf`, `workOrderDocumentEntityOf`,
`identityDocumentEntityOf`, `aiAgentDocumentEntityOf`, and the
flows shim drop the third parameter;
`WRITE_RESPONSE_SPECS[RECORD_TYPE_DETAIL_PATTERN].put` passes two
arguments to `recordTypeEntityOf`.

## The write response

`resolveStreamedTrioWriteBody`, `streamedTrioWriteBody`,
`streamedTrioEntityOf`, `trioCurrentFromBody`,
`INCOMING_MESSAGE_PAIR_AT`, and `INCOMING_MESSAGE_PAIR_ID` are
deleted from `api/document-family.ts`. In `api/api.ts` the
`streamedTrioBody` binding goes and `responseBody` is
`spec.successBody?.(…)` for a PUT with a body, as it already is
for every other write.

Parity: `successBody` returns `wiring.entityOf(documentFromBody(id,
raw), organization)`. The chain walk's "current" was the incoming
body's own `state` in every case, because the sentinel put the
incoming pair last and the walk's dedupe never changes which state
is last. The two functions produced the same object, key for key.
The record-types special case inside the streamed path is already
covered by that route's own `WRITE_RESPONSE_SPECS` entry.

`STREAM_FAMILIES` is `ideas`, `projects`, `objectives`,
`identities`, `ai-agents`; their two arms in
`documentWriteResponseSpec` were the same call once `current`
went. Flows keeps its `flowStoredEntityOf` arm.

## The create bodies

`api/validators.ts`

- `OBJECTIVE_CREATE_KEYS` is `id`, `objective`, `revisionId`,
  `revision`, `initialState`. `ObjectiveCreateBody` and
  `validateObjectiveCreateBody` lose the two fields and their
  checks.
- `RECORD_WRITE_CREATE_KEYS` is `kind`, `id`, `record`,
  `attributes`, `initialState`. `RecordWriteCreateBody` and the
  create arm of `validateRecordWriteBody` lose the same two.
- `FLOW_CREATE_KEYS` and the work-order create body are untouched.

`api/routes.ts`: `formRecordWriteMessagePairs` keeps its
`validateRecordDocumentBody(documentBody)` call, the document gate
the synthesized pair passes through as a live PUT would; only the
comment that justified it by the event id goes.

`api/derive-states.ts`: `bodyNamesStateEvent` keeps its
`initialStateEventId` line; flows' create body still carries it.

`web-app/app/adapters/objectives.ts`: `postObjectiveCreation`
stops sending the two keys. `web-app/app/adapters/records.ts`: the
create arm of `postRecordChange` stops minting an identifier and a
timestamp for them.

`api/mock-data/seed-message-pairs.ts`: `objectiveSeedBody` and
`recordSeedBody` stop emitting the two keys.

`web-app/app/generate-api-documentation.ts`: the two sample
bodies shrink, and `./bin/generate-api-documentation` regenerates
`web-app/api-documentation/` in the same commit so the
`--check` gate stays green.

Pins that hold: `EXPECTED_MESSAGE_PAIR_COUNT` (1453) and the
request-hash uniqueness test, since every create body still
carries its own fresh `id`.

## The seed

```ts
interface SeedGenesis<S extends string> {
    readonly entityId: Id;
    readonly state: S;
    readonly memberId: Id;
}
```

`ideaGenesis: readonly SeedGenesis<IdeaState>[]`,
`projectGenesis: readonly SeedGenesis<ProjectState>[]`, and
`recordGenesis: readonly SeedGenesis<RecordState>[]` replace the
three `StateEntity[]` arrays. Each row drops `id` and `at`, the
two fields nothing reads once the create bodies shrink.

Consumers: pass one in `seed-message-pairs.ts` (the three
invocation loops), pass two in `api/mock-data.ts` (the three
by-id maps that drive the below-facade ops), and
`buildScoreSeedProjects`. Builders: `ideaSeedBody(idea, state,
index)`, `projectSeedBody(project, state, organization)`,
`recordSeedBody(record, index, state, attributes)`. The phantom
`Omit<…, 'state_at' | 'state_event_id'>` keys on their parameters
go; the entity types never had them.

Bytes: idea and project pair bodies are identical before and
after. Record and objective create bodies lose exactly the two
keys of decision 2.

Untouched: `flowStateEvents`, `buildWorkOrderStateEvents`, and
`SEED_HASH_PREIMAGE`, which has no product or test consumer.

## The client

`api/types.ts`: the four `*StateDetail` interfaces go. `Idea`,
`Project`, and `RecordModel` take `(entity, state)` with the
bare narrowed alphabet type.

Adapters: `ideaStateOf`, `projectStateOf`, `objectiveStateOf`, and
`recordStateOf` each return `assert*State(row.state, '<family> '
+ row.id)`, so narrowing stays at the adapter edge where the wire
arrives. `putProjectFields(ctx, id, patch, state)`,
`putProjectPosition(ctx, id, position, state)`, and
`putObjectivePosition(ctx, id, position, state)` take the bare
state. `getObjectiveStates(ctx)` returns `Map<ObjectiveId,
ObjectiveState>`.

Pages: `web-app/projects/detail.ts` carries `detail: ProjectState`
in `PageState` and `ProjectDetailData`; `web-app/projects/index.ts`
passes `project.stateValue()`; `web-app/organization/index.ts`
holds a `states` map. `postIdeaStateChange` and
`postRecordStateChange` keep their destructure of `state` off the
entity; only their comments change.

Every PUT and POST body the client sends is byte-identical, except
the two create keys.

## Tests

One rule per category; the plan applies it file by file.

- **Walk tests go.** The five clock-skew tests
  (`drift-ideas`, `drift-projects`, `drift-objectives`,
  `drift-records`, `drift-states` case 7d); the two
  authorship-on-resend tests (`drift-ideas`, `drift-projects`);
  the history-count assertions in the state-unchanged-edit tests
  (`api-idea-document`, `api-project-document`), whose GET
  assertions stay; the objectives history test in
  `derive-objectives`; the per-family history subset test in
  `derive-states-union`; the DELETE-skip walk test in
  `api-record-document`, which pins the synthesized branch with
  record bodies. Constants that existed for them
  (`IDEAID_GENESIS`, `IDEAID_SKEWED`,
  `EV_DRIFT_AUTHORSHIP_CAVEAT`, and siblings) go too.
- **Derive-parity tests retarget.** Tests comparing GET wire to
  `deriveIdea(s)` or `deriveProject(s)` compare to the stored
  PUT response body, the oracle `drift-ideas` already reads
  through `storedPutBodyText`. The three tests in
  `derive-ideas.test.ts` and the one in `derive-projects.test.ts`
  aim at `documentGetHandler` and
  `documentCollectionGetHandler`, or go where a drift test
  already pins the same covenant.
- **Seed-oracle tests retarget.** Where a test read a seeded
  entity's state through a history derive (`mock-data-valid`,
  `shadow-ledger-invariants`, `api-idea-conversion`,
  `api-ideas-create`, `adapters-*`, `mock-data-*`), it reads the
  head's `state` through GET. The mixed-family oracle in
  `drift-states.test.ts` loses its four family legs and keeps
  flows, work-orders, and invitations.
- **Helpers and names.** Every test helper that still takes a
  dead `_stateAt`, `_stateEventId`, `_ev`, or `_at` parameter
  drops it: nineteen files, `ideaDocument` and `wireIdeaGet`
  among them. `makeStateDetail` and every `{ state }` fixture
  become the bare state. Test names naming the trio are renamed. The synthetic
  wiring in `document-family.test.ts` takes `'state'`; its
  stateless tests keep their DELETE-head coverage and lose the
  sentence about a walk they no longer skip.
- **No new tests** unless a deletion leaves a covenant with no
  pin; the plan checks each deleted test for a surviving pin. The
  head reads are exercised on both backends by the drift suites
  and the Postgres acceptance suite.

## Comments and docs

The Office of Commentary's first remedy is deletion. Comments
that narrate the walk, Decision 7's trio, genesis-wins-under-skew,
the member-id caveat, the camelCase mint, or the states log
describe a mechanism that is gone. They go. Where a reader needs
one sentence, it is: state rides the document body; a head whose
state is `deleted` is a tombstone.

Files in flows, work-orders, invitations, and members territory
keep their comments, `api/derive-flows.ts` included.
`api/derive-objective-revisions.ts` belongs to objectives and is
in scope.

TODO.md: item 7 is rewritten to record the decision taken here
and what closed; its sequencing line `7 → 10` and the preamble's
"skew tests folded into item 7" are updated to match. Two lines
under later work carry the observations outside this scope: the
stale `state_event_id → 'states'` arrow in `schema-svg.ts`, and
`memberParentOf` reading a current event for leftover `/members/`
parents.

TEST-PLAN.md: the K4 pin takes the renamed
`postObjectiveArchival` test.

## Sequence

One worktree. Every commit is green on `./test validate`.
`./test postgres` at step 3 and at the end. `./test validate
browser` before the fast-forward. Subjects are ≈50 characters,
present-tense imperative; the plan may split a step further but
never merges two.

1. This spec, then the plan.
2. `entityOf` reads `state` from the head body; the third
   parameter goes from the interface, the seven wiring rows,
   `recordTypeEntityOf`, and the three family mappers behind
   them; the walk still runs for the DELETED filter.
3. The generic handlers and the record-types derive read heads:
   `getDocumentHead` and `getCollectionHeadPairs` replace the
   history and all-pairs reads; the DELETED filter reads the head
   body.
4. `'trio'` becomes `'state'` across the five rows, the synthetic
   test wiring, and the versions handler's flows test.
5. The synthesized-event branch of `documentLifecycleEvents`
   goes, with the DELETE-skip test.
6. Tests that used the unrouted derives retarget to GET or the
   stored PUT response.
7. The six unrouted derives and `derive-objectives.ts` go, with
   the walk tests and their constants.
8. The streamed write body goes; api.ts uses `successBody`.
9. The two stream sets merge; `documentFromBody` is named.
10. The objectives create body drops its two keys: validator,
    client, seed, documentation sample, regenerated docs.
11. The record-types create body likewise.
12. Seed rows shrink to `SeedGenesis`; builders take a state.
13. The client wrappers go; constructors and PUT helpers take the
    bare state; pages follow.
14. Test helpers drop the dead parameters; test names and the
    TEST-PLAN pin follow.
15. Comments, one commit per layer: api, web-app, seed.
16. TODO.md item 7, its cross-references, and the two later-work
    lines.

## Testing

A pure refactor has the existing suites as its net. The
covenants this spec relies on and where each is pinned:

- GET wire equals the stored PUT response body, per family
  and per collection: the drift suites.
- A `deleted` head 404s and is absent from its collection: the
  live-write tests in `drift-projects` and `drift-records`.
- Collection order is oldest live head first: `drift-ideas`,
  `drift-objectives`.
- Write response equals GET: `document-family.test.ts`'s
  successBody literals and the drift suites' stored-response
  comparisons.
- The seam's head reads on both backends: `store-acceptance.ts`
  under `./test` and `./test postgres`.
- No UI change: `./test validate browser`, then one Layer 3 walk
  through the TEST-PLAN sections for ideas, projects, objectives,
  and record-types: create, edit, transition, reorder, archive and
  reactivate, and delete where a route exists. A walk finding
  changes product only through a red test.

This spec makes no performance claim. The dropped history reads
are a consequence, not a goal; `./bin/measure` before and after is
the way to a number if one is wanted.

## Out of scope

- Flows, work-orders, identities, ai-agents, members, invitations,
  and their validators, derives, seeds, clients, and tests.
- The stale arrow in `schema-svg.ts` and `memberParentOf`; both
  recorded in TODO.md.
- `SEED_HASH_PREIMAGE` entries for the retired event ids.
- TODO.md's later-work line on the member detail page's redundant
  GET trio; members are not in scope.
- Any change to what the seam promises or which reads it offers.

## Environment notes for the executor

- `export DENO_DIR="$TMPDIR/deno-dir"` before any `deno` command,
  `./test`, or `./bin/generate-api-documentation` in the sandbox.
- `./test postgres` starts its own compose project and needs the
  Docker socket.
- Every subagent prompt begins with `Go to Medium Church!` and
  names the commandments and abominations the task risks:
  Uniformity, Simplicity, and Clarity throughout; the Sin of Test
  Weakening at steps 5 through 7 and 14; the Sin of Internal
  Defense at step 3 (trust the validated head body; no second
  check of `state` downstream).

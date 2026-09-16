# Retire the Trio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Retire the server-side lifecycle walk, the `'trio'`
discriminant, the two create-body event keys, the seed's
per-entity state rows, and the client's `*StateDetail`
wrappers from ideas, projects, objectives, and record-types,
so state rides the document body and is read from the head.

**Architecture:** A pure refactor landed as twenty-one tasks and twenty-five small
commits on the `retire-the-trio` branch. The commits form a
dependency graph, not a line: independent tasks run in
parallel lanes, each lane a feeder worktree branched from
the branch tip, and the orchestrator lands each lane by
rebase and fast-forward, validating at every landing. No
wire byte of any GET, versions list, or write response
changes; the two create bodies lose two keys each.

**Tech Stack:** Deno 2.9.6, `Deno.test` with `@std/assert`,
git worktrees.

**Spec:**
`docs/superpowers/specs/2026-09-15-retire-the-trio-design.md`

## Global Constraints

- 78-character lines in every `.ts` file, script, and
  `deno.json`; `./test lint` enforces it. Not `.md`.
- Four-space indent. No inline styles.
- `deno.json` sets `noUnusedLocals` and `noUnusedParameters`:
  an orphaned local or a parameter left unused fails `deno
  check`. Every task deletes what it orphans in the same
  commit. An underscore prefix silences the parameter check,
  which is how the dead `_stateAt` parameters survived.
- `noUncheckedIndexedAccess`: index access is `T | undefined`.
- The `org` identifier is banned under `api/`, `web-app/`,
  `tests/`, `shared/`; write `organization`.
- Commit subject: one line, ≈50 characters, present-tense
  imperative, then a blank line and the trailer
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
  One concern per commit. Never rename and change content in
  one commit.
- Every commit is green on `./test validate`.
- `export DENO_DIR="$TMPDIR/deno-dir"` before any `deno`
  command, `./test`, `./bin/generate-api-documentation`, or
  `./deploy` in the sandbox.
- `./test postgres` runs only from the orchestrator, only at
  the two checkpoints below, never from a lane.
- No lane runs `./deploy --render`. Master owns port 8080.
- Every subagent prompt begins with the literal phrase
  `Go to Medium Church!`.
- The word `trio` survives only in flows' territory (its
  body still carries three fields) and in seed mnemonics such
  as `mem-trio-1`.
- Pins that hold throughout: `EXPECTED_MESSAGE_PAIR_COUNT`
  (1453), the request-hash uniqueness test, and every test in
  `tests/api-trio-dropped.test.ts`.

---

## Premises the code corrects

The spec was written against the code; five facts the plan
found change how tasks are cut. Executors read these first.

1. **Live GETs for the stream families never reach the
   generic handlers.** `api/api.ts:1499-1516` streams the
   stored PUT head (`streamStoredDocumentGet`) and the
   collection (`streamStoredCollectionGet`) for ideas,
   projects, objectives, identities, and ai-agents before
   `matched.get` runs. Flows' entity GET is `deriveFlow`
   (`api/routes.ts:4651`). So `derivedDocumentEntity` and
   `documentCollectionGetHandler` serve live traffic only
   for work-orders' collection (`api/routes.ts:4761`) and
   identities/ai-agents' routed handlers, plus the tests.
   A state-`deleted` idea or project GETs 200 on the wire
   and stays in its list (`tests/drift-ideas.test.ts:497`,
   `tests/drift-projects.test.ts:451`). The spec's testing
   bullet "a `deleted` head 404s and is absent from its
   collection: drift-projects" is therefore the handler's
   covenant, not the wire's; record-types' derive does 404
   (`tests/drift-records.test.ts:874`). Task 7 preserves the
   handler's tombstone rule exactly and changes no live byte.
2. **Four product rows carry `lifecycle: 'trio'`**, not
   five: ideas, projects, flows, objectives
   (`api/routes.ts:368, 380, 401, 494`). Record-types have
   no wiring row. Two test files build synthetic `'trio'`
   wirings (`tests/document-family.test.ts:326`,
   `tests/drift-objectives.test.ts:110`).
3. **Spec step 5 cannot precede steps 7 and 8.** With the
   synthesized branch gone, `documentLifecycleEvents` throws
   inside `pickString` on any body without `state_event_id`.
   The streamed write body walks idea bodies on every live
   PUT, and the unrouted derives walk them under test. The
   branch goes last (Task 18), after the derives (Task 11)
   and the streamed body (Task 14).
4. **`formDocumentMessagePairFor` carries `db` only for the
   chain walk.** With `noUnusedParameters` on, retiring the
   walk forces the parameter out in the same commit: twenty-
   two call sites in `api/routes.ts`, one in
   `api/invitations-domain.ts:649`, one in
   `tests/api-instances-patch.test.ts:1074`.
5. **`withLifecycleTrio` and `withLifecycleTrios`**
   (`web-app/app/adapters/shared.ts:96-114`) are identity
   pass-throughs named for the trio, called from six adapter
   reads. The spec's promise that `trio` survives only in
   flows and mnemonics cannot hold while they exist. Task 5
   inlines them.

---

## Execution model: lanes

The spec says "one worktree"; that is the landing branch,
`retire-the-trio`, checked out at
`.worktrees/retire-the-trio`. Parallel subagents cannot share
it: two agents editing one tree see each other's half-edits
in `./test`. Each task therefore runs in its own **lane**, a
feeder worktree the orchestrator creates from the current
tip and removes after landing. A subagent never creates a
worktree and never passes the Agent tool `isolation`; the
orchestrator creates the lane and names its directory in the
prompt. One worker per worktree holds.

### Orchestrator: open a lane

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/retire-the-trio
git worktree add ../retire-the-trio-t07 -b retire-the-trio-t07
```

### Subagent: work in the lane

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/retire-the-trio-t07
export DENO_DIR="$TMPDIR/deno-dir"
# edit, then:
./test validate
git add -A && git commit -m 'Read document heads in the generic GET handlers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

A lane with two commits validates before each commit. The
lane reports its commit subjects and the `./test validate`
tail. It never rebases onto the landing branch itself; the
orchestrator does that at landing so the lane's tree is
clean and at a commit boundary.

### Orchestrator: land a lane

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/retire-the-trio-t07
export DENO_DIR="$TMPDIR/deno-dir"
git rebase --exec './test validate' retire-the-trio
cd /Users/tmornini/code/fusion-angle/.worktrees/retire-the-trio
git merge --ff-only retire-the-trio-t07
git worktree remove ../retire-the-trio-t07
git branch -d retire-the-trio-t07
```

`--exec` re-validates every rebased commit on the moved tip,
so "every commit green" is checked, not assumed. If the lane
was branched from the current tip, the rebase is a no-op and
each commit's stamp in `most-recently-validated-sha` already
matches; `./test validate` prints `already validated` and
returns. A rebase conflict means two lanes edited one hunk;
the orchestrator resolves it by re-applying the later lane's
intent, never by taking one side blindly.

### Concurrency notes

- `DENO_DIR` is shared across lanes; Deno's cache locks are
  fine with that. `--frozen` writes no lockfile.
- `most-recently-validated-sha` lives in the git common dir
  and is shared. A lane's stamp never matches another lane's
  HEAD, so no false skip is possible.
- `./test` binds ephemeral ports. A lane that fails on
  `EADDRINUSE` reruns once.
- `./test postgres` starts one Docker compose project; two
  concurrent runs collide. Orchestrator only.
- Two lanes may edit one file in distinct hunks; the graph
  below names the files each task touches so the orchestrator
  can predict the rebase. Same-hunk overlaps are dependencies
  in the graph.

### Subagent prompt template

Every dispatch is this prompt with the task pasted in:

```
Go to Medium Church!

You execute Task N of docs/superpowers/plans/
2026-09-15-retire-the-trio.md in the worktree
/Users/tmornini/code/fusion-angle/.worktrees/retire-the-trio-tNN
(run every command from there; do not cd to the parent
repository or to .worktrees/retire-the-trio). Read the
plan's "Global Constraints", "Premises the code corrects",
and "Shared test patterns" sections, then your task, then
the spec at docs/superpowers/specs/2026-09-15-retire-the-trio-design.md.

Voice rules: 78-char max line in .ts files and scripts,
4-space indent, present-tense imperative commit subject
≈50 chars, Co-Authored-By trailer, one concern per commit.
Patterns to match: RequestContext first argument on adapter
methods, snake_case wire / camelCase domain, validators at
the gate not downstream, no untyped any.

Commandments this task touches: Uniformity, Simplicity,
Clarity. Abominations this task risks: <from the task>.

Before committing: export DENO_DIR="$TMPDIR/deno-dir" and
run ./test validate; it must be green. Commit with the
subject the task names. Do not rebase, do not push, do not
run ./test postgres or ./deploy. Report: the commit
subject(s), the last ten lines of ./test validate, and
anything the task said to report.
```

---

## Dependency graph

### Tasks and edges

| Task | Commit subject | Depends on | Files (product / tests) |
|---|---|---|---|
| T1 | Read state from the head body in every entityOf | — | document-family.ts, derive-ideas.ts, derive-projects.ts, derive-record-types.ts, routes.ts, api.ts / api-idea-document, api-project-document, api-record-types-write, drift-objectives |
| T2 | Retarget idea and project derive tests to GET; Delete the ideas and projects walk tests | — | — / drift-ideas, drift-projects, derive-ideas, derive-projects |
| T3a | Read seeded state through GET in the adapter tests | — | — / adapters-ideas, adapters-projects, adapters-records, api-idea-conversion, api-ideas-create |
| T3b | Read seeded state through GET in the mock-data tests | — | — / mock-data-valid, mock-data-objectives, mock-data-two-organizations, shadow-ledger-invariants, drift-phase15-cores-parity, document-family.test |
| T3c | Drop the four state legs from the states oracles | — | — / drift-states, derive-states-union, derive-objectives.test |
| T4 | Drop the two event keys from objective creation | — | validators.ts, adapters/objectives.ts, seed-message-pairs.ts, generate-api-documentation.ts, api-documentation/ / api-objectives-create, api-nested-stream, drift-objectives, mock-data-pairs |
| T5 | Inline the pass-through lifecycle helpers | — | adapters/shared.ts, ideas.ts, projects.ts, objectives.ts |
| T6 | Retarget the document-op tests to the versions list | T1 | — / api-idea-document, api-project-document, api-record-document, drift-records |
| T7 | Read document heads in the generic GET handlers | T1 | derive-documents.ts, document-family.ts, derive-record-types.ts |
| T8 | Drop the two event keys from record-type creation | T4 | validators.ts, routes.ts, adapters/records.ts, seed-message-pairs.ts, generate-api-documentation.ts, api-documentation/ / api-records-write, api-write-authorizer, api-record-types-composed-op, drift-records, shadow-ledger-invariants, validators-records |
| T9 | Take the bare state through the client | T5 | types.ts, adapters ideas/projects/objectives/records, projects/detail.ts, projects/index.ts, organization/index.ts / presenter-idea, presenter-project-detail-impact, presenter-projects-list-column, command-palette-search, presenter-projects-organization, project-view-derived, presenter-project-patch, projects-detail-reduce, presenter-record-detail, adapters-projects, adapters-objectives |
| T10 | Rename the lifecycle literal trio to state | T7 | document-family.ts, routes.ts / document-family.test, drift-objectives |
| T11 | Delete the six unrouted document derives | T1, T2, T3a, T3b, T3c, T6, T8 | derive-ideas.ts, derive-projects.ts, derive-objectives.ts, derive-record-types.ts |
| T12 | Seed ideas, projects, and records from genesis rows | T8 | seed-message-pairs.ts, mock-data.ts, mock-data/ideas.ts, projects.ts, records.ts |
| T13 | Drop the dead lifecycle parameters from test helpers; Rename the tests that still name the trio; Rename derive-objectives.test.ts to api-objective-versions.test.ts | T2, T3c, T6, T8, T9, T11 | TEST-PLAN.md / nineteen helper files, the rename table |
| T14 | Form write responses from successBody alone | T1 | document-family.ts, api.ts, routes.ts, invitations-domain.ts / api-instances-patch |
| T16 | Describe the seed's genesis rows truthfully | T12 | seed-message-pairs.ts, mock-data.ts |
| T17 | Merge the stream family sets | T14, T10 | document-family.ts |
| T18 | Keep only the event-id branch of the lifecycle walk | T7, T11, T14 | derive-documents.ts / api-record-document |
| T19 | Drop the trio narration from api comments | T4, T8, T11, T13, T17, T18 | twelve api files |
| T20 | Drop the trio narration from web-app comments | T4, T8, T9 | eleven web-app files |
| T21 | Record the trio's retirement in TODO | — (land last) | TODO.md |

T15 is folded into T14 (premise 4).

### The graph

```
W1   T1        T2   T3a  T3b  T3c        T4        T5
     |\  \                                |         |
     | \  \-------------------.           |         |
W2   T6 T7 T14                 \          T8        T9
     |  |  |                    \         | \       |
W3   |  T10 |     T11 <--(T2,T3a,T3b,T3c,T6,T8)   T12
     |  |  \ \     |                       |        |
W4   |  |   \ T17 T18 <--(T7,T14)   T13 <-(T9)     T16
     |  |    \  |  |                 |
W5   T19 <--(T4,T8,T11,T13,T17,T18)  T20 <--(T4,T8,T9)   T21
```

### Wave schedule

| Wave | Lanes (parallel) | Orchestrator after landing |
|---|---|---|
| 1 | T1, T2, T3a, T3b, T3c, T4, T5 | — |
| 2 | T6, T7, T8, T9, T14 | `./test postgres` after T7 lands (spec step 3) |
| 3 | T10, T11, T12, T17 | — |
| 4 | T13, T16, T18 | — |
| 5 | T19, T20, T21 | `./test postgres`; `./test validate browser`; the Layer 3 walk; `git merge --ff-only retire-the-trio` from master |

Landing order inside a wave follows lane completion, with
one rule: when two finished lanes touch one file, land the
one with the smaller task number first, then rebase the
other. Known same-file, distinct-hunk pairs: T7/T14
(document-family.ts), T10/T17 (document-family.ts), T4/T8
(validators.ts, generate-api-documentation.ts,
seed-message-pairs.ts; T8 waits for T4 for that reason),
T6/T8 (drift-records), T3b/T8 (shadow-ledger-invariants),
T3a/T9 (adapters-projects), T1/T3b (document-family.test).

---

## Shared test patterns

### Running one file

`./test` runs the whole memory suite (about ten seconds).
For a tight loop on one file:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check --sanitize-ops \
    --sanitize-resources --allow-env --allow-read \
    --allow-write --allow-net \
    --allow-run=deno,./bin/serve,./deploy,sh,./test,./bin/postgres-wipe,./bin/postgres-seed \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    tests/<file>.test.ts
```

`--no-check` means type errors surface only under `./test
validate`; run it before every commit.

### Reading through the generic handlers

Where a test read an entity through `deriveIdea`,
`deriveIdeas`, `deriveProject`, `deriveProjects`, or
`deriveRecordTypeEntity`'s history walk, it now reads
through the handler the spec names. The wiring rows are
registered when `api/routes.ts` evaluates; every file that
imports an op from `routes.ts` already has them.

```ts
import type { DbAdapter } from '../api/db.ts';
import type { Id } from '../api/types.ts';
import {
    documentCollectionGetHandler,
    documentFamilyWiring,
    documentGetHandler,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';

const READER: Id = 'XXZruirZyAOoRpNxaDnpSA';

function wiringOf(family: string): DocumentFamilyWiring {
    const wiring = documentFamilyWiring(family);
    if (wiring === undefined) {
        throw new Error('no wiring registered for ' + family);
    }
    return wiring;
}

function getDocument(
    db: DbAdapter, family: string, organization: Id, id: Id,
): Promise<unknown> {
    return documentGetHandler(wiringOf(family))(
        db, [organization, id], READER, organization, [],
    );
}

async function getCollection(
    db: DbAdapter, family: string, organization: Id,
): Promise<{ id: Id; state: string }[]> {
    const rows = await documentCollectionGetHandler(
        wiringOf(family),
    )(db, [organization], READER, organization, []);
    return rows as { id: Id; state: string }[];
}
```

`GetHandler` is `(adapter, params, actor, organization,
roles)` (`api/routes.ts:591`). A missing or tombstoned
document rejects with `EntityNotFoundError` from
`api/db.ts` for the caller's own organization.

### Reading the versions list

Where a test counted lifecycle events through a
`derive*StateHistory`, the surviving covenant is the
versions list: one row per PUT, newest first, each row the
entity plus `etag`, `at`, `member_id`. `member_id` is the
requester of that PUT, so authorship-by-arrival is
pinnable; authorship-by-first-event is not, because that
covenant was the walk's.

```ts
async function versionsOf(
    db: MemoryDbAdapter, token: string,
    family: string, id: string,
): Promise<{ state: string; member_id: string }[]> {
    const res = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/' + family
            + '/' + id + '/versions/',
        token,
    ));
    assertStrictEquals(res.status, 200);
    return await res.json() as {
        state: string; member_id: string;
    }[];
}
```

Record-types' versions route is
`/organizations/:id/record-types/:id/versions/`.

### Disposition rules

Every derive call in a test takes exactly one of these:

- **Trim.** The derive leg duplicates a wire assertion the
  test already makes. Delete the leg and the import.
- **Retarget.** The covenant survives on the wire or in a
  handler. Replace the derive with the handler read, a
  `handleRequest` GET, `storedPutBodyText`, or the versions
  list. Never weaken: the replacement asserts the same value.
- **Delete.** The covenant was the walk's own: event dedupe
  (`events.length === 1` after a same-state edit), first-
  arrival authorship on a resend, genesis-wins-under-skew,
  synthesized-event shapes. Delete the whole test and every
  constant only it used. A test whose covenant is gone is
  deleted, never weakened.

A test that mixes a surviving assertion with a walk
assertion keeps the survivor and loses the other; its name
changes to describe what remains.

---

## Wave 1

### Task 1: entityOf reads state from the head body

**Files:**
- Modify: `api/document-family.ts:112-151` (interface),
  `:239-279` (`derivedDocumentEntity`), `:489-524`
  (`serveDocumentRevision`), `:539-543` (delete
  `stateFromDocument`), `:545-588` (versions list),
  `:621-700` (collection), `:729-734` (delete the two
  sentinel constants), `:758-776` (delete
  `trioCurrentFromBody`), `:778-876` (the streamed
  functions), `:905-956` (`successBody`)
- Modify: `api/derive-ideas.ts:63-81`, `:155-173`, `:196-206`
- Modify: `api/derive-projects.ts:48-68`, `:142-160`,
  `:185-195`
- Modify: `api/derive-record-types.ts:44-58`, `:113-131`,
  `:156-168`
- Modify: `api/routes.ts:366-376` (ideas row), `:378-389`
  (projects row), `:398-407` (flows row), `:427-441`
  (work-orders), `:464-500` (objectives), `:503-512`
  (identities), `:544-552` (ai-agents), `:3062-3078`
  (record-types put spec), `:3439-3446` (streamed call),
  `:5114-5122`, `:5150-5158` (versions routes)
- Modify: `api/api.ts:922-933`
- Test: `tests/api-idea-document.test.ts:359-369`,
  `tests/api-project-document.test.ts:259-270`,
  `tests/api-record-types-write.test.ts:428-440`,
  `tests/drift-objectives.test.ts:114-121`

**Interfaces:**
- Produces: `DocumentFamilyWiring.entityOf: (document:
  DerivedDocument, organization: Id) => object`;
  `ideaEntityOf(document, organization): IdeaEntity`;
  `projectEntityOf(document, organization): ProjectEntity`;
  `recordTypeEntityOf(document, organization):
  RecordTypeWireRow`; `resolveStreamedTrioWriteBody(
  routePattern, params, body, organization): unknown |
  undefined` (sync; T14 deletes it).

Abominations this task risks: Internal Defense (do not add
a second `state` check where the body was validated at the
gate), Unbidden Helper Code.

- [ ] **Step 1: Change the interface**

In `api/document-family.ts` replace lines 140-150 with:

```ts
    // Head-pair body -> wire entity (id + organization_id
    // stamped by the caller). A 'trio' family's mapper reads
    // `state` from the body like every other field.
    readonly entityOf: (
        document: DerivedDocument,
        organization: Id,
    ) => object;
```

- [ ] **Step 2: Run the check to see it fail**

Run: `./test check`
Expected: FAIL with "Expected 2 arguments, but got 3" at the
seven callers and "Type '(document, organization, current)
=> …' is not assignable" at the wiring rows.

- [ ] **Step 3: Drop `current` from the four read sites**

`derivedDocumentEntity` (lines 259-278) becomes:

```ts
    if (wiring.lifecycle === 'trio') {
        const messagePairs = documentMessagePairsAt(
            stored, prefix,
        ).filter((messagePair) => messagePair.name === id);
        const history = stateHistoryFrom(
            documentLifecycleEvents(messagePairs), id,
        );
        if (currentDocumentState(history) === DELETED_STATE) {
            throw await throwDocumentMiss(
                wiring, db, organization, id,
            );
        }
    }
    return wiring.entityOf(document, organization);
```

`serveDocumentRevision` (lines 517-523) becomes a single
`return wiring.entityOf(document, organization);`. Delete
`stateFromDocument` (539-543).

`documentVersionListHandler`'s mapper (574-579) becomes
`(document) => wiring.entityOf(document, org),`.

`documentCollectionGetHandler`'s loop (663-689) becomes:

```ts
        for (const [id, document] of documents) {
            if (wiring.lifecycle === 'trio') {
                const history = stateHistoryFrom(
                    documentLifecycleEvents(
                        messagePairsById.get(id) ?? [],
                    ),
                    id,
                );
                if (
                    currentDocumentState(history)
                        === DELETED_STATE
                ) continue;
            }
            byId.set(
                id,
                wiring.entityOf(document, organizationId),
            );
        }
```

Remove `currentLifecycleEvent` from the import list.

- [ ] **Step 4: Reduce the streamed write path**

The chain walk in `streamedTrioEntityOf` existed to compute
`current`; with `noUnusedLocals` it cannot stay computed and
unused. Delete `INCOMING_MESSAGE_PAIR_AT`,
`INCOMING_MESSAGE_PAIR_ID`, and `trioCurrentFromBody`.
Replace lines 778-876 with:

```ts
export function streamedTrioEntityOf(
    id: Id,
    body: Record<string, unknown>,
    organization: Id,
    entityOf: DocumentFamilyWiring['entityOf'],
): unknown {
    return entityOf(
        trioDocumentFromBody(id, withoutId(body)),
        organization,
    );
}

function streamedTrioWriteBody(
    wiring: DocumentFamilyWiring,
    id: Id,
    body: Record<string, unknown>,
    organization: Id,
): unknown {
    const raw = withoutId(body);
    wiring.validateDocument(raw);
    return streamedTrioEntityOf(
        id, raw, organization, wiring.entityOf,
    );
}

// Live G1 write body. Undefined means the caller uses
// successBody.
export function resolveStreamedTrioWriteBody(
    routePattern: string,
    params: string[],
    body: Record<string, unknown> | undefined,
    organization: Id | undefined,
): unknown | undefined {
    if (body === undefined) return undefined;
    if (routePattern === RECORD_TYPE_DETAIL_PATTERN) {
        const organizationId = param(params, 0);
        const id = param(params, 1);
        validateRecordDocumentBody(withoutId(body));
        return streamedTrioEntityOf(
            id, body, organizationId, recordTypeEntityOf,
        );
    }
    const family = idFamilyOf(routePattern);
    if (
        family === undefined
        || !STREAM_TRIO_FAMILIES.has(family)
    ) {
        return undefined;
    }
    const wiring = documentFamilyWiring(family);
    if (wiring === undefined) return undefined;
    return streamedTrioWriteBody(
        wiring,
        entityIdParam(wiring, params),
        body,
        organization ?? '',
    );
}
```

`recordTypesUriPrefix` is now unused in this file; remove it
from the import. In `successBody` (925-931) drop the
`trioCurrentFromBody(...)` argument.

Update the two callers. `api/api.ts:926-933`:

```ts
                    : await resolveStreamedTrioWriteBody(
                        routePattern,
                        params,
                        body,
                        organization,
                    );
```

`api/routes.ts:3439-3446`:

```ts
        const streamed = resolveStreamedTrioWriteBody(
            input.routePattern,
            [...input.params],
            input.body,
            input.organization,
        );
```

- [ ] **Step 5: The three family mappers read the body**

`api/derive-ideas.ts:63-81`:

```ts
export function ideaEntityOf(
    document: DerivedDocument,
    organization: Id,
): IdeaEntity {
    const body = document.body;
    return {
        id: document.name,
        organization_id: organization,
        title: pickString(body, 'title'),
        position: pickNumber(body, 'position'),
        problem_statement: pickString(body, 'problem_statement'),
        target_users: pickString(body, 'target_users'),
        proposed_solution: pickString(body, 'proposed_solution'),
        expected_outcome: pickString(body, 'expected_outcome'),
        success_metrics: pickString(body, 'success_metrics'),
        state: pickString(body, 'state'),
    };
}
```

In `deriveIdeas` (155-173) delete the two comment lines and
`const current = currentLifecycleEvent(history)!;`, and call
`ideaEntityOf(document, organization)`. Same in `deriveIdea`
(205-206). Remove `currentLifecycleEvent` from the import.
Rewrite the comment above `ideaEntityOf` (53-62) to:

```ts
// The derived entity: the head document's body plus
// organization_id stamped from the derivation's OWN
// organization parameter — never the body's own value. A
// create body omits organization_id, and the prefix scanned
// here already IS that organization, so the stamp is
// unconditional.
```

Mirror all of it in `api/derive-projects.ts` (`projectEntityOf`
reads `state: pickString(body, 'state')`; comments 38-47;
`deriveProjects` 153-159; `deriveProject` 194-195) and in
`api/derive-record-types.ts` (`recordTypeEntityOf` 44-58;
comment 26-27 becomes `// Wire row for a live record-type
document.`; `deriveRecordTypeCollection` 124-130;
`deriveRecordTypeEntity` 165-168).

- [ ] **Step 6: The seven wiring rows and the record-types callers**

`api/routes.ts`. Ideas row: delete the two comment lines and
write `entityOf: ideaEntityOf,`. Projects row:
`entityOf: projectEntityOf,`. Flows row:

```ts
    entityOf: (document, organization) =>
        flowEntityOf(document, organization),
```

`workOrderDocumentEntityOf`, `identityDocumentEntityOf`,
`aiAgentDocumentEntityOf`: delete the `_current?` parameter.
`objectiveDocumentEntityOf`:

```ts
function objectiveDocumentEntityOf(
    document: DerivedDocument,
    organization: Id,
): ObjectiveEntity {
    return {
        id: document.name,
        organization_id: organization,
        position: pickNumber(document.body, 'position'),
        state: pickString(document.body, 'state'),
    };
}
```

and its row `entityOf: objectiveDocumentEntityOf,`. Rewrite
the sentences in the objectives comment (458-463, 488-491)
that say `current` is required; state is read from the head
body.

`WRITE_RESPONSE_SPECS[RECORD_TYPE_DETAIL_PATTERN].put`
(3072-3081): drop the third argument. Versions routes
(5116-5122, 5152-5158): drop the third argument. If
`pickString` is then unused in `api/routes.ts`, remove the
import; it is used elsewhere in the file, so expect to keep
it.

- [ ] **Step 7: Fix the four test call sites**

`tests/api-idea-document.test.ts:359-369`: delete the
`{ state: 'active' },` argument. Same at
`tests/api-project-document.test.ts:259` and
`tests/api-record-types-write.test.ts:428`.
`tests/drift-objectives.test.ts:114-121`:

```ts
    entityOf: (document, organization) => ({
        id: document.name,
        organization_id: organization,
        position: pickNumber(document.body, 'position'),
        state: pickString(document.body, 'state'),
    }),
```

adding `pickString` to that file's `validators.ts` import.
Then `grep -n "entityOf:" tests/*.ts` and fix any other
three-parameter lambda.

- [ ] **Step 8: Validate and commit**

Run: `./test validate`
Expected: green.

```bash
git add -A
git commit -m 'Read state from the head body in every entityOf

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

### Task 2: Retarget the idea and project derive tests

**Files:**
- Test: `tests/drift-ideas.test.ts`, `tests/drift-projects.test.ts`,
  `tests/derive-ideas.test.ts`, `tests/derive-projects.test.ts`

Two commits. Abominations this task risks: Test Weakening.

- [ ] **Step 1: Add the handler helpers to `derive-ideas.test.ts`**

Replace the `derive-ideas.ts` import (lines 11-15) with the
document-family import from "Shared test patterns", and add
`wiringOf`, `getDocument`, and `getCollection` verbatim.
`postIdeaDocumentOp` is reached through `handleRequest`, so
the wiring rows are registered.

- [ ] **Step 2: Retarget each test in `derive-ideas.test.ts`**

| Line | Test | Disposition |
|---|---|---|
| 72 | `'a created idea derives'` | Retarget: `assertEquals(await getDocument(db, 'ideas', STARK_ORGANIZATION, ideaId), {...})`; name `'a created idea reads through the handler'` |
| 97 | `'an edited idea derives the edit body'` | Retarget the title read to `getDocument`; delete the `history.length === 1` assertion; name `'an edited idea reads the edit body'` |
| 121 | `'a deleted idea disappears from the list and 404s by id'` | Retarget: `getCollection(...).some(...)` is false; `assertRejects(() => getDocument(...), EntityNotFoundError)` |
| 149 | `'a later deleted PUT tombs the idea'` | Retarget list and by-id as above; delete the `['active','deleted']` history assertion |
| 184 | `'ordering is oldest live head (at, id)'` | Retarget to `getCollection` |
| 204 | `'the synthesized genesis equals the actual states genesis row field-for-field'` | Delete |

- [ ] **Step 3: `derive-projects.test.ts`**

Test at 81, `'a later deleted PUT tombs the project'`:
retarget `deriveProjects` (98) to `getCollection(db,
'projects', …)`; delete the history assertion (107) and the
`deriveProjectStateHistory` import; add the helpers.

- [ ] **Step 4: `drift-ideas.test.ts` retargets**

Add `wiringOf` and `getDocument` (the file already imports
from `document-family.ts` or `routes.ts`; check and extend).

| Line | Test | Disposition |
|---|---|---|
| 150 | seeded collection | Trim: delete the `deriveIdeas` call and its `length > 0` |
| 177 | per-idea GET | Retarget: parse the GET text you already compared and assert `title` and `position` against the seed; delete `deriveIdea` |
| 207 | foreign-org 404 | Trim the derive leg; name `'a foreign-org idea id 404s on GET'` |
| 438 | live-write lifecycle | Retarget 503 to `assertRejects(() => getDocument(db, 'ideas', 'AjdvjuECVZEgZoFajaIEkg', ideaId), EntityNotFoundError)`; delete 511-516 (history length); name `'live-write lifecycle: create + edit + transition + delete'` |
| 520 | live approve then convert | Retarget 577-583: GET the idea and assert `state === 'promoted'`; name `'live approve then convert: the idea reads promoted'` |

Remove the three derive imports once nothing uses them.

- [ ] **Step 5: `drift-projects.test.ts` retargets**

| Line | Test | Disposition |
|---|---|---|
| 161 | seeded collection | Trim the `deriveProjects` leg; name `'seeded GET /projects wire equals stored live PUT bodies'` |
| 188 | per-project GET | Retarget as ideas 177; name `'per-project GET wire equals the stored PUT body'` |
| 220 | foreign-org | Trim; name `'a foreign-org project id 404s on GET'` |
| 372 | live-write case | 427: replace the pre-delete `deriveProject` comparison with `getDocument` deep-equal to the GET JSON; 458: `assertRejects(() => getDocument(...), EntityNotFoundError)`; delete 471-477 |
| 479 | live conversion | 530: `getDocument` deep-equals the GET JSON; 546: retarget to the versions list, one row with `state === 'submitted'` |

- [ ] **Step 6: Validate and commit the retarget**

Run: `./test validate`. Expected: green.

```bash
git add -A
git commit -m 'Retarget idea and project derive tests to GET

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

- [ ] **Step 7: Delete the walk tests and their constants**

`tests/drift-ideas.test.ts`: delete the test at 312
(authorship on resend) with `MEMBER_B` (38),
`IDEA_DRIFT_AUTHORSHIP_CAVEAT` (39),
`EV_DRIFT_AUTHORSHIP_CAVEAT` (40); delete the test at 602
(clock skew) with its comment 597-601, `IDEAID_GENESIS`
(52), `IDEAID_SKEWED` (53). `tests/drift-projects.test.ts`:
delete 322 with `MEMBER_B` (42),
`PROJECT_DRIFT_AUTHORSHIP_CAVEAT` (43),
`EV_DRIFT_AUTHORSHIP_CAVEAT` (44); delete 560 with 556-559,
`PROJECTID_GENESIS` (57), `PROJECTID_SKEWED` (58). Grep each
constant before deleting; a second reference means keep it.

- [ ] **Step 8: Validate and commit**

```bash
./test validate
git add -A
git commit -m 'Delete the ideas and projects walk tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

### Task 3a: Seeded state through GET in the adapter tests

**Files:**
- Test: `tests/adapters-ideas.test.ts`,
  `tests/adapters-projects.test.ts`,
  `tests/adapters-records.test.ts`,
  `tests/api-idea-conversion.test.ts`,
  `tests/api-ideas-create.test.ts`

Abominations this task risks: Test Weakening.

- [ ] **Step 1: `adapters-ideas.test.ts`**

| Line | Test | Disposition |
|---|---|---|
| 230 | `postIdeaCreation … records the initial state event` | Retarget 250-257: `getIdeaEntity(ctx, id)` and `assertStrictEquals(row.state, 'active')` (keep if already asserted; then trim); name `'postIdeaCreation persists via GET with the initial state'` |
| 261 | `postIdeaStateChange records a state event …` | Retarget 288-295 to `getIdeaEntity(...).state === 'approved'`; name `'postIdeaStateChange changes state without changing entity fields on GET'` |
| 299 | `postIdeaConversion commits …` | 350-355: GET the idea, `state === 'promoted'`; 357-363: `getProjectEntity(ctx, projectId).state === 'submitted'`; name `'postIdeaConversion commits project, idea, and N baseline rows in one atomic batch'` |

Remove both derive imports.

- [ ] **Step 2: `adapters-projects.test.ts:353`**

Delete 385-391 (the GET at 384 already asserts `'archived'`);
name `'postProjectStateChange changes state without changing
entity fields on GET'`. Remove the import at 7.

- [ ] **Step 3: `adapters-records.test.ts`**

230: retarget 264-267 to `getRecord(ctx, id)` and
`state === 'archived'`; rename likewise. 334 (`'state events
for records land in the unified states log'`): delete; the
states log is gone and 230 pins the transition. Remove the
import at 7.

- [ ] **Step 4: `api-idea-conversion.test.ts:183-189`**

Replace with a `handleRequest` GET of
`/organizations/AjdvjuECVZEgZoFajaIEkg/projects/pnXmXrxOWayANgDLdCjuBw`
asserting `state === 'submitted'`, then the versions list
(pattern above) asserting one row whose `member_id` is
`'XXZruirZyAOoRpNxaDnpSA'`. Remove the import at 7; rename
the test to say "two documents" instead of "two events".

- [ ] **Step 5: `api-ideas-create.test.ts:180-186`**

Delete the dynamic import and the `events.length` assertion;
keep the three-pair count; name `'a byte-identical resend of
a genesis PUT converges: one idea, one pair'`.

- [ ] **Step 6: Validate and commit**

```bash
./test validate
git add -A
git commit -m 'Read seeded state through GET in the adapter tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

### Task 3b: Seeded state through GET in the mock-data tests

**Files:**
- Test: `tests/mock-data-valid.test.ts`,
  `tests/mock-data-objectives.test.ts`,
  `tests/mock-data-two-organizations.test.ts`,
  `tests/shadow-ledger-invariants.test.ts`,
  `tests/drift-phase15-cores-parity.test.ts`,
  `tests/document-family.test.ts:234`

Abominations this task risks: Test Weakening.

- [ ] **Step 1: Add the handler helpers to each file that needs them**

`wiringOf`, `getDocument`, `getCollection` from "Shared test
patterns". Files that reach `routes.ts` only through
`mock-seed.ts` must `import '../api/routes.ts';` for the
registration side effect; say so in a one-line comment.

- [ ] **Step 2: `mock-data-valid.test.ts`**

| Line | Test | Disposition |
|---|---|---|
| 127 | non-empty derived lifecycle states | Delete |
| 170 | derived ideas per org | Retarget `deriveIdeas` to `getCollection(db, 'ideas', organization)`; keep the `state` and validator assertions |
| 200 | idea submissions | Retarget the 217 smoke read to `getDocument` |
| 224, 258, 280, 337 | projects | Retarget `deriveProjects` to `getCollection(db, 'projects', organization)` |

Remove the four derive imports. Test names drop "derived".

- [ ] **Step 3: `mock-data-objectives.test.ts:138`,
  `mock-data-two-organizations.test.ts:257, 262, 479`**

Retarget to `getCollection`; remove the imports.

- [ ] **Step 4: `shadow-ledger-invariants.test.ts:477-483`**

Replace the history read with `getDocument(db, 'ideas',
STARK_ORGANIZATION, idea.id)` cast to `{ state:
string }`, asserting `state === parsed.body.state`. Name
`'a seeded idea's create-pair request reproduces its GET
state'`.

- [ ] **Step 5: `drift-phase15-cores-parity.test.ts`**

397: the test needs one sample event id from a seeded idea.
With no synthesized events, the id the visibility three-way
resolves is the idea's head pair id: `(await
messageStore(db).getDocumentHead(prefix, ideaId))!.id`. If
`stateEventVisibilityFor` classifies a document pair id as
`'orphan'`, the sample was walk-only: delete the idea leg
and keep the other tiers, and say so in the report. 820-829:
retarget the four `deriveIdeas`/`deriveProjects` calls to
`getCollection`.

- [ ] **Step 6: `document-family.test.ts:234`**

```ts
    assertEquals(
        got,
        JSON.parse(await storedPutBodyText(
            db, '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
            'gZsGVjTnvrgHQLzbKnQckg',
        )),
    );
```

adding `storedPutBodyText` to the `http-fixtures.ts` import
and removing the `deriveIdea` import at 51.

- [ ] **Step 7: Validate and commit**

```bash
./test validate
git add -A
git commit -m 'Read seeded state through GET in the mock-data tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

### Task 3c: Drop the four state legs from the states oracles

**Files:**
- Test: `tests/drift-states.test.ts`,
  `tests/derive-states-union.test.ts`,
  `tests/derive-objectives.test.ts`

Abominations this task risks: Test Weakening.

- [ ] **Step 1: `drift-states.test.ts` oracle**

`entityHistory` (163-192) keeps flows, work-orders, and
invitations:

```ts
async function entityHistory(
    db: DbAdapter, organization: Id, entityId: Id,
): Promise<StateEntity[]> {
    const [flowRows, workOrderRows, invitationRows] =
        await Promise.all([
            deriveFlowStateHistory(db, organization, entityId),
            workOrderLifecycleStatesFor(
                db, organization, entityId,
            ),
            deriveInvitationStates(db).then((rows) =>
                rows.filter((r) => r.entity_id === entityId)),
        ]);
    return [...flowRows, ...workOrderRows, ...invitationRows]
        .sort((a, b) =>
            a.at < b.at ? -1 : a.at > b.at ? 1
                : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
```

Remove the four derive imports (25, 27, 29, 33).
`CASE_2_FAMILY_ENTITY_IDS` (407-453) keeps `flow` and
`work-order`; the case 2 test name becomes `'case 2: GET
<family>/:id/history parity — one entity per family (flow,
work-order) + the (at, id) DESC order'`; delete the direct
`deriveObjectiveStateHistory` call at 547 and its two
assertions. Delete case 7d (1442-1477) with
`DRIFT_STATES_RECORD_SKEW_1` (77).

- [ ] **Step 2: Classify the remaining oracle call sites**

The oracle is called at 463, 691, 730, 743, 762, 777, 791,
812, 838, 896, 949, 963, 973, 1002, 1190, 1228, 1267, 1285,
1330, 1343, 1417, 1433, 1526. For each, read the enclosing
test: if the entity is a flow, work-order, or invitation,
keep; if it is an idea, project, record-type, or objective,
the assertion is of the walk: delete the test and the
constants only it uses. The loop near 405 that counts
`objSeen` and siblings drops the four in-scope counters.
Report the list of deleted test names.

- [ ] **Step 3: `derive-states-union.test.ts:651`**

Delete the idea leg (656) and the objective leg (663) and
the imports at 21 and 23. The ai-agents, work-order, and
flow legs stay.

- [ ] **Step 4: `derive-objectives.test.ts`**

Delete the test at 46 and the import at 7. The versions
test at 80 stays; Task 13 renames the file.

- [ ] **Step 5: Validate and commit**

```bash
./test validate
git add -A
git commit -m 'Drop the four state legs from the states oracles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

### Task 4: Drop the two event keys from objective creation

**Files:**
- Modify: `api/validators.ts:3388-3458`
- Modify: `web-app/app/adapters/objectives.ts:318-339`
- Modify: `api/mock-data/seed-message-pairs.ts:1254-1288`
- Modify: `web-app/app/generate-api-documentation.ts:522-523`
- Regenerate: `web-app/api-documentation/`
- Test: `tests/api-objectives-create.test.ts:36-42, 55`,
  `tests/api-nested-stream.test.ts:461-462`,
  `tests/drift-objectives.test.ts:198-218`,
  `tests/mock-data-pairs.test.ts:483`

**Interfaces:**
- Produces: `ObjectiveCreateBody { id, objective, revisionId,
  revision, initialState }`; `OBJECTIVE_CREATE_KEYS` of five.

Abominations this task risks: Default Values (do not default
the missing keys anywhere), Test Weakening.

- [ ] **Step 1: Write the failing validator test**

In `tests/validators.test.ts`, beside the existing objective
create tests (grep `validateObjectiveCreateBody`), add:

```ts
Deno.test(
    'validateObjectiveCreateBody rejects initialStateEventId'
    + ' as an unexpected key',
    () => {
        assertThrows(
            () => validateObjectiveCreateBody({
                id: 'sVWUntTCtQYFCpONjkzAKg',
                objective: { position: 1 },
                revisionId: 'YHvbnJSZHECuziaHXcsKpw',
                revision: {},
                initialState: 'active',
                initialStateEventId: 'XufQcWIKhZshfJYOVNeUSw',
            }),
            Error, 'unexpected key',
        );
    },
);
```

Match the error phrase `assertOnlyKeys` actually throws
(grep it). This is the one new test decision 2 warrants: the
key set shrank and nothing else pins the rejection.

- [ ] **Step 2: Run it to see it fail**

Run the single-file command on `tests/validators.test.ts`.
Expected: FAIL, the body is accepted.

- [ ] **Step 3: The validator**

`api/validators.ts`:

```ts
export interface ObjectiveCreateBody {
    readonly id: string;
    readonly objective: Record<string, unknown>;
    readonly revisionId: string;
    readonly revision: Record<string, unknown>;
    readonly initialState: ObjectiveState;
}

const OBJECTIVE_CREATE_KEYS: readonly string[] = [
    'id', 'objective', 'revisionId', 'revision',
    'initialState',
];
```

In `validateObjectiveCreateBody` delete the
`initialStateEventId` and `initialStateAt` blocks and return
`{ id, objective, revisionId, revision, initialState }`.
Rewrite the comment above it (3403-3415): the body is the
objective row plus its first revision and the initial
state; the state folds onto the document pair via
`objectiveDocumentBodyOf`.

- [ ] **Step 4: Client, seed, documentation**

`web-app/app/adapters/objectives.ts:337-338`: delete the two
lines; `at` and `generateIdentifier` stay in use. Rewrite
the comment 318-320 to drop "Genesis trio mints".
`api/mock-data/seed-message-pairs.ts:1283-1286`: delete;
rewrite the comment 1254-1260 to name the initial state,
not a trio. `web-app/app/generate-api-documentation.ts:522-523`:
delete. Then:

```bash
./bin/generate-api-documentation
./test api-docs
```

- [ ] **Step 5: Tests that send the keys**

`tests/api-objectives-create.test.ts`: delete `genesisTrio`
(36-42) and write `initialState: 'active',` at 55; if
`generateIdentifier` is then unused, remove it.
`tests/api-nested-stream.test.ts:461-462`: delete.
`tests/drift-objectives.test.ts:215-216`: delete; the `at`
parameter stays in use by `revision.at`.
`tests/mock-data-pairs.test.ts:483`: read the test; it pins
the document pair body (`{position, state}`), which is
unchanged. If it also pins the POST operation body's key
set, retarget to the five keys. Run `./test` and fix any
other create-body pin it reveals.

- [ ] **Step 6: Validate and commit**

```bash
./test validate
git add -A
git commit -m 'Drop the two event keys from objective creation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

### Task 5: Inline the pass-through lifecycle helpers

**Files:**
- Modify: `web-app/app/adapters/shared.ts:70-75, 96-114`
- Modify: `web-app/app/adapters/ideas.ts:19-20, 60-80`
- Modify: `web-app/app/adapters/projects.ts:20-21, 56-64,
  235-243`
- Modify: `web-app/app/adapters/objectives.ts:16-17, 42-62`

Abominations this task risks: Unbidden Helper Code (add
nothing in their place).

- [ ] **Step 1: Inline the six reads**

Each `return withLifecycleTrios(ctx, 'ideas', await
ctx.GET<…>(…))` becomes `return ctx.GET<…>(…)`; each
`withLifecycleTrio` likewise. Example, `ideas.ts:60-67`:

```ts
export async function getIdeaEntities(
    ctx: RequestContext,
): Promise<IdeaEntity[]> {
    return ctx.GET<IdeaEntity[]>(
        organizationCollection(ctx, 'ideas'),
    );
}
```

Remove the two names from each file's `shared.ts` import.

- [ ] **Step 2: Delete the helpers**

In `shared.ts` delete `TrioRow` and its comment (70-75) and
`withLifecycleTrio` / `withLifecycleTrios` (96-114).

- [ ] **Step 3: Validate and commit**

```bash
./test validate
git add -A
git commit -m 'Inline the pass-through lifecycle helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

---

## Wave 2

### Task 6: Retarget the document-op tests to the versions list

Depends on T1.

**Files:**
- Test: `tests/api-idea-document.test.ts`,
  `tests/api-project-document.test.ts`,
  `tests/api-record-document.test.ts`,
  `tests/drift-records.test.ts`

Abominations this task risks: Test Weakening.

- [ ] **Step 1: Add `versionsOf` to the three document files**

From "Shared test patterns". Also add a `getWire` helper
returning the parsed `handleRequest` GET JSON for a family
and id.

- [ ] **Step 2: `api-idea-document.test.ts`**

| Line | Test | Disposition |
|---|---|---|
| 87 | new state writes wire entity and one event | Retarget 112-116: `versionsOf(db, token, 'ideas', id)` has length 1, `[0].state === 'active'`, `[0].member_id === 'XXZruirZyAOoRpNxaDnpSA'`; name `'a document PUT with a new state writes wire entity and one version, authored by the actor'` |
| 119 | state-unchanged edit | Delete 133-135 only |
| 146 | byte-identical resend | Delete the events lines; keep the three-pair count; name `'a byte-identical resend converges: one pair'` |
| 257 | same-state edit by a DIFFERENT member never reattributes | Delete |
| 344 | stored PUT equals ideaEntityOf | Replace both `deriveIdea` reads with `getWire(db, token, 'ideas', id)` |

Remove the two derive imports.

- [ ] **Step 3: `api-project-document.test.ts`**

Mirror: 81, 115 (delete 129-131), 142, 209 (delete), 244
(replace both `deriveProject` reads). Remove imports 3-4.

- [ ] **Step 4: `api-record-document.test.ts`**

| Line | Test | Disposition |
|---|---|---|
| 141 | genesis returns entity, one event by the actor | Retarget 172-176 to `versionsOf(db, token, 'record-types', id)`: one row, `state === 'active'`, `member_id` the actor; rename "one version" |
| 195 | echoed trio writes NO new event, replaying member_id | Delete |
| 237 | fresh trio posts a transition by the actor | Retarget 292-300: two rows, states `['archived', 'active']`, both `member_id` the actor; name `'postRecordDocumentOp with a new state writes a second version authored by the actor'` |
| 309 | byte-identical resend | Delete the events lines; keep the pair count |

Leave the test at 391 and its helper; Task 18 takes them.
Remove the import at 7.

- [ ] **Step 5: `drift-records.test.ts`**

693: delete 889-892 (`derivedHistory`); name `'live-write
chain: create, edit, RESTRICT 409, echoed state, archive,
delete, physical DELETE'`. 1095: delete the test and its
comment 1087-1094. Remove the import at 44.

- [ ] **Step 6: Validate and commit**

```bash
./test validate
git add -A
git commit -m 'Retarget the document-op tests to the versions list

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

### Task 7: Read document heads in the generic GET handlers

Depends on T1. The orchestrator runs `./test postgres` after
landing this task.

**Files:**
- Modify: `api/derive-documents.ts` (add two exports after
  `DELETED_STATE`)
- Modify: `api/document-family.ts:17-28` (imports),
  `:230-279` (`derivedDocumentEntity`), `:614-700`
  (collection handler)
- Modify: `api/derive-record-types.ts:60-75` (delete
  `fetchRecordTypeMessagePairs`), `:94-169`

**Interfaces:**
- Produces: `headDocumentOf(head: MessagePairEntity):
  DerivedDocument`; `documentIsTombstone(document:
  DerivedDocument): boolean`, both from
  `api/derive-documents.ts`.
- Consumes: `messageStore(db).getDocumentHead(path, name):
  Promise<MessagePairEntity | null>` (null for absent or a
  DELETE head); `db.messagePairs.getCollectionHeadPairs(path)`
  (live PUT heads, `(response_at, id)` ascending).

Abominations this task risks: Internal Defense (the head
body passed the gate; read `state` once, never re-validate),
Premature Optimization (this is a consequence of the design,
not a goal; no timing claims).

- [ ] **Step 1: The two helpers**

`api/derive-documents.ts`, after `DELETED_STATE` (line 155)
and the `DerivedDocument` interface:

```ts
// The head pair as the document a family mapper reads.
export function headDocumentOf(
    head: MessagePairEntity,
): DerivedDocument {
    return {
        name: head.name,
        messagePairId: head.id,
        method: head.method,
        body: requestBodyOf(head.request),
    };
}

// A head whose body says `deleted` is a tombstone: absent
// from GET and from its collection.
export function documentIsTombstone(
    document: DerivedDocument,
): boolean {
    return pickString(document.body, 'state') === DELETED_STATE;
}
```

- [ ] **Step 2: `derivedDocumentEntity`**

```ts
// The generic per-id read: the live PUT head at this
// document. No head is a miss. For a 'trio' family a head
// whose body says `deleted` is a miss too. Both take the
// throwDocumentMiss ladder, so 403 and 404 are unchanged.
async function derivedDocumentEntity(
    wiring: DocumentFamilyWiring,
    db: DbAdapter,
    organization: Id,
    id: Id,
): Promise<unknown> {
    const prefix = canonicalPath(
        organization, '/' + wiring.family + '/',
    );
    const head = await messageStore(db).getDocumentHead(
        prefix, id,
    );
    if (head === null) {
        throw await throwDocumentMiss(
            wiring, db, organization, id,
        );
    }
    const document = headDocumentOf(head);
    if (
        wiring.lifecycle === 'trio'
        && documentIsTombstone(document)
    ) {
        throw await throwDocumentMiss(
            wiring, db, organization, id,
        );
    }
    return wiring.entityOf(document, organization);
}
```

- [ ] **Step 3: `documentCollectionGetHandler`**

```ts
export function documentCollectionGetHandler(
    wiring: DocumentFamilyWiring,
): GetHandler {
    return async (db, _params, _actor, organization) => {
        const organizationId = requireOrganization(
            organization,
        );
        const prefix = canonicalPath(
            organizationId, '/' + wiring.family + '/',
        );
        const heads =
            await db.messagePairs.getCollectionHeadPairs(
                prefix,
            );
        // Oldest live head (response_at, id) first. A 'trio'
        // tombstone is omitted.
        const rows: unknown[] = [];
        for (const head of heads) {
            const document = headDocumentOf(head);
            if (
                wiring.lifecycle === 'trio'
                && documentIsTombstone(document)
            ) continue;
            rows.push(wiring.entityOf(document, organizationId));
        }
        return rows;
    };
}
```

Keep the comment block above it (614-620); it is still true.

- [ ] **Step 4: Imports in `document-family.ts`**

From `derive-documents.ts` import `documentMessagePairsAt`,
`documentLifecycleEvents`, `stateHistoryFrom`,
`requestBodyOf`, `headDocumentOf`, `documentIsTombstone`,
`type DerivedDocument`. `deriveDocumentsAt`,
`currentDocumentState`, `DELETED_STATE`, and
`DocumentMessagePair` leave. `liveHeadId` stays
(`liveGlobalDocumentIds`).

- [ ] **Step 5: `derive-record-types.ts`**

Delete `fetchRecordTypeMessagePairs` (60-75). Replace 94-169:

```ts
export async function deriveRecordTypeCollection(
    db: DbAdapter,
    organization: Id,
): Promise<RecordTypeWireRow[]> {
    const prefix = recordTypesUriPrefix(organization);
    const heads = await db.messagePairs.getCollectionHeadPairs(
        prefix,
    );
    const rows: RecordTypeWireRow[] = [];
    for (const head of heads) {
        const document = headDocumentOf(head);
        if (documentIsTombstone(document)) continue;
        rows.push(recordTypeEntityOf(document, organization));
    }
    return rows;
}

export async function deriveRecordTypeEntity(
    db: DbAdapter,
    organization: Id,
    id: Id,
): Promise<RecordTypeWireRow> {
    const prefix = recordTypesUriPrefix(organization);
    const head = await messageStore(db).getDocumentHead(
        prefix, id,
    );
    if (head === null) {
        throw await missedReadError(
            db, id, organization, RECORD_TYPES_TABLE,
        );
    }
    const document = headDocumentOf(head);
    if (documentIsTombstone(document)) {
        throw await missedReadError(
            db, id, organization, RECORD_TYPES_TABLE,
        );
    }
    return recordTypeEntityOf(document, organization);
}
```

Fix the import list: `deriveDocumentsAt`,
`currentDocumentState`, `DELETED_STATE`, `liveHeadId` leave;
`headDocumentOf`, `documentIsTombstone` arrive.
`documentMessagePairsAt`, `documentLifecycleEvents`,
`stateHistoryFrom`, `DocumentMessagePair`, and
`fetchRecordTypeDocumentMessagePairs` stay until Task 11.
Rewrite the module comment (19-22): "Org-nested record-types
derive surface: head reads, the same primitives as
document-family."

- [ ] **Step 6: Validate and commit**

Run `./test validate`. The retargeted handler tests (T2,
T3b) and `tests/drift-records.test.ts` are the witnesses;
`tests/document-family.test.ts`'s stateless tests still
pass because a DELETE head is `null` from `getDocumentHead`.

```bash
git add -A
git commit -m 'Read document heads in the generic GET handlers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

Report to the orchestrator: run `./test postgres` after
landing.

### Task 8: Drop the two event keys from record-type creation

Depends on T4 (shared files).

**Files:**
- Modify: `api/validators.ts:3094-3103, 3121-3126, 3165-3204`
- Modify: `api/routes.ts:869-876`
- Modify: `web-app/app/adapters/records.ts:266-277`
- Modify: `api/mock-data/seed-message-pairs.ts:1241-1243`
- Modify: `web-app/app/generate-api-documentation.ts:434-435`
- Regenerate: `web-app/api-documentation/`
- Test: `tests/api-records-write.test.ts` (eleven sites plus
  128 and 513), `tests/api-write-authorizer.test.ts:182-184`,
  `tests/api-record-types-composed-op.test.ts:135-136`,
  `tests/drift-records.test.ts:324-346`,
  `tests/shadow-ledger-invariants.test.ts:200-218`,
  `tests/validators-records.test.ts:339-380, 387-440, 447-467`

**Interfaces:**
- Produces: `RecordWriteCreateBody { kind: 'create', id,
  record, attributes, initialState }`.

Abominations this task risks: Default Values, Test Weakening.

- [ ] **Step 1: Write the failing validator test**

In `tests/validators-records.test.ts`, replace the test at
447 (`'validateRecordWriteBody create rejects a missing
initialStateEventId'`) with:

```ts
Deno.test(
    'validateRecordWriteBody create rejects'
    + ' initialStateEventId as an unexpected key',
    () => {
        assertThrows(
            () => validateRecordWriteBody({
                kind: 'create',
                id: 'rbfHGatkwQzGZJVXKJEeyw',
                record: {
                    organization_id: 'AjdvjuECVZEgZoFajaIEkg',
                    name: 'R', description: '',
                    position: 1,
                },
                attributes: [],
                initialState: 'active',
                initialStateEventId: 'XufQcWIKhZshfJYOVNeUSw',
            }),
            Error, 'unexpected key',
        );
    },
);
```

Match `assertOnlyKeys`'s phrase. Run the file: FAIL.

- [ ] **Step 2: The validator**

```ts
export interface RecordWriteCreateBody {
    readonly kind: 'create';
    readonly id: RecordId;
    readonly record:
        RecordEntityFields & { organization_id: string };
    readonly attributes: readonly RecordAttributeEntity[];
    readonly initialState: RecordState;
}

const RECORD_WRITE_CREATE_KEYS:
    readonly string[] = [
    'kind', 'id', 'record',
    'attributes', 'initialState',
];
```

In the create arm delete the two picks and return `{ kind:
'create', id, record, attributes, initialState }`. Rewrite
the comment at 3128-3130 (the key order remark) if it still
names the trio. `validateTimestampField` stays in use by
flows.

- [ ] **Step 3: Routes, client, seed, documentation**

`api/routes.ts:870-875`: replace the six comment lines with
`// The document gate the synthesized pair passes, as a live
PUT would.` and keep the call. Rewrite 801-805 ("plus the
lifecycle trio. Create maps the trio from initialState*")
to say the body carries `state`, mapped from `initialState`
on create and echoed on edit.

`web-app/app/adapters/records.ts:266-277`:

```ts
    if (change.kind === 'create') {
        await ctx.POST(recordTypesPath(ctx), {
            kind: 'create',
            id,
            record,
            attributes,
            initialState: change.initialState,
        });
    } else {
```

Remove `generateIdentifier` and `nowUtc` imports if nothing
else in the file uses them.

`api/mock-data/seed-message-pairs.ts:1242-1243`: delete.
`event` stays a parameter (its `state` is read) until Task
12. `web-app/app/generate-api-documentation.ts:434-435`:
delete. Then `./bin/generate-api-documentation` and
`./test api-docs`.

- [ ] **Step 4: Tests**

`tests/api-records-write.test.ts`: delete the two key lines
at each of 57-58, 102-103, 145-146, 215-216, 282-283,
358-359, 398-399, 450-451, 478-479, 573-574; delete the test
at 513 (`'… threads caller initialStateAt to the initial
state event'`); at 128 retarget 175 (`events.length === 1,
'edit must not emit a state event'`) to a GET of the
record-type asserting `state === 'active'` with the message
`'edit must not change state'`, and remove the import at 15.
`tests/api-write-authorizer.test.ts:182-184`: delete the two
keys. `tests/api-record-types-composed-op.test.ts:135-136`:
delete. `tests/drift-records.test.ts:324-346`: `createRecordBody`
loses `stateEventId` and `stateAt` and their two body lines;
drop the two arguments at each call. `tests/shadow-ledger-invariants.test.ts:200-218`:
same. `tests/validators-records.test.ts`: delete 366-367 and
377-380 (the `eventId` local then goes), 414-415, 438-439.
Run `./test`; fix any other create-body pin it reveals.

- [ ] **Step 5: Validate and commit**

```bash
./test validate
git add -A
git commit -m 'Drop the two event keys from record-type creation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

### Task 9: Take the bare state through the client

Depends on T5.

**Files:**
- Modify: `api/types.ts:1360-1369, 1383-1389, 1475-1497,
  1606-1626`
- Modify: `web-app/app/adapters/ideas.ts:14, 136-146, 164-167,
  178-181, 205-207`
- Modify: `web-app/app/adapters/projects.ts:4, 51, 67-100,
  312-342`
- Modify: `web-app/app/adapters/objectives.ts:6, 65-91,
  400-411`
- Modify: `web-app/app/adapters/records.ts:7, 109-135,
  175-177`
- Modify: `web-app/projects/detail.ts:33, 61, 87, 94,
  126-133, 162`
- Modify: `web-app/projects/index.ts:187-193`
- Modify: `web-app/organization/index.ts:36, 133-135,
  141-148, 186-201`
- Test: `tests/presenter-idea.test.ts:11, 124-130, 137, 149,
  250`, `tests/adapters-projects.test.ts:220-222, 230, 243,
  258, 283, 312, 329-331, 403-405`,
  `tests/adapters-objectives.test.ts:26, 384-387, 421-427,
  531-552`, `tests/presenter-project-detail-impact.test.ts:84-86`,
  `tests/presenter-projects-list-column.test.ts:37-39`,
  `tests/command-palette-search.test.ts:31-33, 52-54`,
  `tests/presenter-projects-organization.test.ts:106-108`,
  `tests/project-view-derived.test.ts:21-23`,
  `tests/presenter-project-patch.test.ts:36-38`,
  `tests/projects-detail-reduce.test.ts:85-95`,
  `tests/presenter-record-detail.test.ts:29`

**Interfaces:**
- Produces: `new Idea(entity: IdeaEntity, state: IdeaState)`,
  `new Project(entity, state: ProjectState)`,
  `new RecordModel(entity, state: RecordState)`;
  `projectStateOf(row: ProjectEntity): ProjectState`,
  `objectiveStateOf(row: ObjectiveEntity): ObjectiveState`
  (exported), `ideaStateOf`, `recordStateOf` (file-local);
  `getObjectiveStates(ctx): Promise<Map<ObjectiveId,
  ObjectiveState>>`; `putProjectFields(ctx, id, patch, state:
  ProjectState)`, `putProjectPosition(ctx, id, position,
  state: ProjectState)`, `putObjectivePosition(ctx, id,
  position, state: ObjectiveState)`.
- Every PUT and POST body the client sends is byte-identical.

Abominations this task risks: Foreign Tongues (narrowing
stays at the adapter edge where the wire arrives), Unbidden
Helper Code.

- [ ] **Step 1: Types**

`api/types.ts`: delete the four `*StateDetail` interfaces
and their comments. Constructors:

```ts
    constructor(
        entity: IdeaEntity,
        state: IdeaState,
    ) {
        ...
        this.#state = state;
```

Same for `Project` (`ProjectState`) and `RecordModel`
(`RecordState`).

- [ ] **Step 2: Adapters**

`ideas.ts`:

```ts
// Domain state rides the IdeaEntity GET row; narrow it once,
// at the wire.
function ideaStateOf(row: IdeaEntity): IdeaState {
    return assertIdeaState(row.state, 'idea ' + row.id);
}
```

and every `ideaStateDetailFromRow(row).state` becomes
`ideaStateOf(row)`, every `new Idea(row,
ideaStateDetailFromRow(row))` becomes `new Idea(row,
ideaStateOf(row))`. Drop the `IdeaStateDetail` import.

`projects.ts`: `export function projectStateOf(row:
ProjectEntity): ProjectState`; the same substitutions; the
export list at 47-54 drops `type ProjectStateDetail`;

```ts
export async function putProjectFields(
    ctx: RequestContext,
    id: string,
    patch: ProjectFieldsPatch,
    state: ProjectState,
): Promise<void> {
    const fields = await projectRowFields(ctx, id);
    await putProject(ctx, id, {
        ...fields,
        title: patch.title,
        description: patch.description,
        start_date: patch.startDate,
        target_end_date: patch.targetEndDate,
        estimated_cost: patch.estimatedCost,
        state,
    });
}

export async function putProjectPosition(
    ctx: RequestContext,
    id: string,
    position: number,
    state: ProjectState,
): Promise<void> {
    const fields = await projectRowFields(ctx, id);
    await putProject(ctx, id, {
        ...fields,
        position,
        state,
    });
}
```

`objectives.ts`: `export function objectiveStateOf(row:
ObjectiveEntity): ObjectiveState`;

```ts
// One bulk state read from GET rows: drag-reorder echoes
// each id's current state.
export async function getObjectiveStates(
    ctx: RequestContext,
): Promise<Map<ObjectiveId, ObjectiveState>> {
    const rows = await getObjectives(ctx);
    const out = new Map<ObjectiveId, ObjectiveState>();
    for (const row of rows) {
        out.set(row.id, objectiveStateOf(row));
    }
    return out;
}
```

and `putObjectivePosition(ctx, id, position, state:
ObjectiveState)` sending `{ position, state }`. Import
`ObjectiveState`; drop `ObjectiveStateDetail`.

`records.ts`: `function recordStateOf(row: RecordEntity):
RecordState`; `new RecordModel(row, recordStateOf(row))`.

- [ ] **Step 3: Pages**

`web-app/projects/detail.ts`: import `projectStateOf` and
`ProjectState` instead of `projectStateDetailFromRow` and
`ProjectStateDetail`; `detail: ProjectState` in both
`PageState` arms and in `ProjectDetailData`; `const detail =
projectStateOf(entity);`; `new Project(entity, detail)`; the
`putProjectFields(ctx, projectId, fields, detail)` call
stands. Rewrite the comment at 126-128 to "state is read off
the GET row by `projectStateOf`".

`web-app/projects/index.ts:187-193`:

```ts
            await putProjectPosition(
                sessionContext(), id,
                newPosition,
                project.stateValue(),
            );
```

`web-app/organization/index.ts`: import `getObjectiveStates`;
the data field becomes `states: Awaited<ReturnType<typeof
getObjectiveStates>>;`; `fetchObjectivesData` reads
`getObjectiveStates(ctx)` into `states`; the drag handler:

```ts
    const states = data.states;
    initDragReorder(
        activeList,
        '[data-objective-id]',
        'data-objective-id',
        async (id, newPosition) => {
            const dragCtx = sessionContext();
            const state = states.get(id);
            if (state === undefined) {
                throw new Error(
                    'no state for objective ' + id,
                );
            }
            await putObjectivePosition(
                dragCtx, id, newPosition, state,
            );
        },
    );
```

Rewrite the comment at 141-142 ("One bulk trio read").

- [ ] **Step 4: Tests**

`tests/presenter-idea.test.ts`: delete `makeStateDetail` and
the `IdeaStateDetail` import; `new Idea(makeIdeaEntity(
overrides), state)`; `new Idea(entity, state)`; at 250 `new
Idea(..., 'active')`. `tests/adapters-projects.test.ts`:
`const STATE: ProjectState = 'approved';`; `{ ...entity,
...TRIO }` becomes `{ ...entity, state: STATE }`; `new
Project(..., STATE)`; `putProjectFields(..., STATE)`;
`putProjectPosition(..., STATE)`. `tests/adapters-objectives.test.ts`:
`getObjectiveStates`, `states.get(o3)!`; the literal at
539-541 becomes `'active'`; name the test at 531
`'putObjectivePosition echoes the supplied state verbatim'`.
The eight `{ state: … }` literals in the presenter and view
tests become the bare string; `projects-detail-reduce.test.ts:85`
becomes `const detail: ProjectState = 'approved';`.

- [ ] **Step 5: Validate and commit**

```bash
./test validate
git add -A
git commit -m 'Take the bare state through the client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

### Task 14: Form write responses from successBody alone

Depends on T1. Same file as T7 in distinct hunks.

**Files:**
- Modify: `api/document-family.ts:1-42` (imports), the three
  streamed functions from Task 1 step 4
- Modify: `api/api.ts:55-61, 922-953`
- Modify: `api/routes.ts:286-296, 3405-3450` and the
  twenty-two `formDocumentMessagePairFor(db, {` call sites
- Modify: `api/invitations-domain.ts:649`
- Test: `tests/api-instances-patch.test.ts:1074`

**Interfaces:**
- Produces: `formDocumentMessagePairFor(input:
  DocumentMessagePairFormInput): Promise<MessagePair>`.

Abominations this task risks: Swallowed Failures (do not
wrap the call sites in try), Cleverness.

- [ ] **Step 1: Delete the streamed functions**

In `document-family.ts` delete `streamedTrioEntityOf`,
`streamedTrioWriteBody`, `resolveStreamedTrioWriteBody`, and
the comment above the last. Remove the now-unused imports:
`validateRecordDocumentBody`, `RECORD_TYPE_DETAIL_PATTERN`,
`recordTypeEntityOf`. `idFamilyOf` stays (api.ts uses it);
`STREAM_TRIO_FAMILIES` stays until Task 17. Rewrite the
comment at 900-904 ("Live writes prefer
resolveStreamedTrioWriteBody") to: G1 families emit
`wiring.entityOf` over the incoming body, the same object
GET derives from the head.

- [ ] **Step 2: `api/api.ts`**

Remove `resolveStreamedTrioWriteBody` from the import. Delete
the `streamedTrioBody` binding (922-933). The `responseBody`
field becomes:

```ts
                responseBody: method === 'PUT'
                    && body === undefined
                    ? undefined
                    : spec.successBody?.(
                        params, body, actor,
                        organization,
                    ),
```

- [ ] **Step 3: `api/routes.ts`**

Remove the import at 294. `formDocumentMessagePairFor` loses
its `db` parameter and its comment lines 3417-3419; the
else-branch becomes:

```ts
        const spec = resolveWriteResponseSpec(input.routePattern);
        responseStatus = spec.status;
        responseBody = spec.successBody?.(
            [...input.params], input.body,
            input.requesterIdentityId, input.organization,
        );
```

Then every `formDocumentMessagePairFor(db, {` becomes
`formDocumentMessagePairFor({` (twenty-two sites; `grep -n
"formDocumentMessagePairFor(" api/routes.ts`). Do the same
at `api/invitations-domain.ts:649` and
`tests/api-instances-patch.test.ts:1074`. Where a caller's
own `db` parameter is now unused, `deno check` says so;
follow the error: if the function has other `db` uses keep
it, otherwise remove the parameter and its arguments.

- [ ] **Step 4: Validate and commit**

The witnesses are `tests/document-family.test.ts`'s
successBody literals and the drift suites' stored-response
comparisons (`storedPutBodyText` equals GET).

```bash
./test validate
git add -A
git commit -m 'Form write responses from successBody alone

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

---

## Wave 3

### Task 10: Rename the lifecycle literal trio to state

Depends on T7.

**Files:**
- Modify: `api/document-family.ts:117-123` and every
  `=== 'trio'`; `:545-565` (versions list branch)
- Modify: `api/routes.ts:368, 380, 401, 494`
- Test: `tests/document-family.test.ts:326, 780-794, 875`,
  `tests/drift-objectives.test.ts:110`

Abominations this task risks: Obscurity (the comment must
say what `'state'` means now).

- [ ] **Step 1: The interface**

```ts
    // A 'state' family carries domain `state` in every
    // document body; a head whose state is `deleted` is a
    // tombstone. A 'stateless' family carries entity fields
    // only; its lifecycle, if any, lives in operation-path
    // event pairs, never the document.
    readonly lifecycle: 'state' | 'stateless';
```

Replace every `wiring.lifecycle === 'trio'` with `'state'`.
The versions-list handler's condition (553-556) becomes
`if (wiring.family === 'flows') {`.

- [ ] **Step 2: Rows and tests**

The four rows in `routes.ts` take `lifecycle: 'state',`.
`tests/document-family.test.ts:326` and
`tests/drift-objectives.test.ts:110` take `'state'`. Rewrite
the section comment at `tests/document-family.test.ts:780-794`:
the synthetic `'stateless'` registration proves a
`'stateless'` body needs no `state` key and a DELETE head is
its only tombstone. Rename the test at 875 to `'stateless
lifecycle: documentCollectionGetHandler derives a stateless
body'` and 861 to `'stateless lifecycle: a stateless
document PUT derives through documentGetHandler with no
throw'`. Then `grep -rn "'trio'" api tests web-app` must
return nothing.

- [ ] **Step 3: Validate and commit**

```bash
./test validate
git add -A
git commit -m 'Rename the lifecycle literal trio to state

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

### Task 11: Delete the six unrouted document derives

Depends on T1, T2, T3a, T3b, T3c, T6, T8.

**Files:**
- Modify: `api/derive-ideas.ts` (delete `deriveIdeas`,
  `deriveIdea`, `deriveIdeaStateHistory`,
  `fetchIdeaMessagePairs`, `fetchIdeaDocumentMessagePairs`,
  `IDEAS_TABLE`, the walk comment 83-92)
- Modify: `api/derive-projects.ts` (delete `deriveProjects`,
  `deriveProject`, `deriveProjectStateHistory`, both fetch
  helpers, `PROJECTS_TABLE`, the walk comment 70-79)
- Delete: `api/derive-objectives.ts`
- Modify: `api/derive-record-types.ts` (delete
  `deriveRecordTypeStateHistory`,
  `fetchRecordTypeDocumentMessagePairs`)

Abominations this task risks: Test Weakening (no test may
be edited here; if one still imports a derive, a Wave 1 or
Wave 2 task missed it and this task reports it).

- [ ] **Step 1: Confirm nothing imports them**

```bash
grep -rn "deriveIdeas\|deriveIdea\b\|deriveIdeaStateHistory\|deriveProjects\|deriveProject\b\|deriveProjectStateHistory\|deriveObjectiveStateHistory\|deriveRecordTypeStateHistory\|derive-objectives" api server web-app tests
```

Expected: only the definitions. Anything else: stop and
report.

- [ ] **Step 2: Delete**

`api/derive-ideas.ts` keeps `ideaEntityOf`,
`ideaSubmissionEntityOf`, `deriveIdeaSubmissions`,
`ideasUriPrefix` only if something still calls it (it will
not; delete it), `submissionsUriPrefix`. Its imports shrink
to what those use (`pickString`, `pickNumber`,
`validateIdeaSubmissionEntity`, `canonicalPath`,
`withoutId`, `deriveDocumentsAt`, `byIdAscending`,
`DerivedDocument`; `missedReadError`, `messageStore`,
`liveHeadId`, `StateEntity` leave). Rewrite the module
comment 30-36. `api/derive-projects.ts` keeps
`projectEntityOf` and its imports (`pickString`,
`pickNumber`, `DerivedDocument`). `git rm
api/derive-objectives.ts`. `api/derive-record-types.ts`
keeps `RecordTypeWireRow`, `recordTypesUriPrefix`,
`recordTypeEntityOf`, `deriveRecordTypeCollection`,
`deriveRecordTypeEntity`, `requireRecordTypeExists`; the
walk imports leave.

- [ ] **Step 3: Validate and commit**

```bash
./test validate
git add -A
git commit -m 'Delete the six unrouted document derives

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

### Task 12: Seed ideas, projects, and records from genesis rows

Depends on T8.

**Files:**
- Modify: `api/mock-data/seed-message-pairs.ts:119, 233-250,
  318-335, 482-500, 712-732, 752-772, 785-791, 827-840,
  1207-1244, 1417-1438, 1576-1586, 1628-1638, 1813-1820,
  1833, 1855, 1868, 1895`
- Modify: `api/mock-data.ts:81-84, 524-535, 580-593, 653-655,
  904, 942-943`
- Modify: `api/mock-data/ideas.ts:10-16`,
  `api/mock-data/projects.ts:12-18`,
  `api/mock-data/records.ts:29-35`

**Interfaces:**
- Produces, from `seed-message-pairs.ts`:

```ts
export interface SeedGenesis<S extends string> {
    readonly entityId: Id;
    readonly state: S;
    readonly memberId: Id;
}
export const ideaGenesis: readonly SeedGenesis<IdeaState>[];
export const projectGenesis:
    readonly SeedGenesis<ProjectState>[];
export const recordGenesis:
    readonly SeedGenesis<RecordState>[];
export function ideaSeedBody(
    idea: Omit<IdeaEntity, 'organization_id' | 'state'>,
    state: IdeaState,
    index: number,
): Record<string, unknown>;
export function projectSeedBody(
    project: Omit<ProjectEntity, 'organization_id' | 'state'>,
    state: ProjectState,
    organization: Id,
): Record<string, unknown>;
export function recordSeedBody(
    r: Omit<RecordEntity, 'organization_id' | 'state'>,
    index: number,
    state: RecordState,
    attributes: readonly Omit<
        RecordAttributeEntity, 'organization_id'
    >[],
): Record<string, unknown>;
```

- Bytes: idea and project pair bodies identical before and
  after (`tests/mock-data-pairs.test.ts` and the drift suites
  witness); `EXPECTED_MESSAGE_PAIR_COUNT` unchanged.

Abominations this task risks: Default Values, Magical Values
(the ids and states are the seed's own literals; keep them
literal).

- [ ] **Step 1: Rows**

Each `ideaStateEvents` entry `{ id, entity_id, state,
member_id, at }` becomes `{ entityId, state, memberId }`
with the same three values; the `daysFromNow(...)` `at`
values go. Same for projects (the org-2 row keeps its
comment) and records. Import `IdeaState`, `ProjectState`,
`RecordState` from `'../types.ts'`. `StateEntity` stays for
`flowStateEvents`. Rewrite the three row comments: "One
genesis row per seeded idea: its initial state and the
member credited with creating it."

- [ ] **Step 2: Builders**

`ideaSeedBody(idea, state, index)` writes `state` directly;
`projectSeedBody(project, state, organization)` likewise;
`recordSeedBody(r, index, state, attributes)` writes
`initialState: state`. The `Omit` lists drop `'state_at' |
'state_event_id'` here, in `ProjectSeedFields`, and in the
three `api/mock-data/*.ts` builders. `buildScoreSeedProjects`
reads `projectGenesisById.get(project.id)!.state`; rewrite
its comment 819-826.

- [ ] **Step 3: Consumers**

`buildMockDataInvocations`: the three maps key on
`entityId`; each loop reads `genesis.memberId` for
`requesterIdentityId` and passes `genesis.state` to the
builder; the flow-record join at 1895 reads `.memberId`.
`api/mock-data.ts`: the three imports rename; the three maps
and loops mirror pass 1. Rewrite the comments at 516-523,
569-579, 645-655 (Task 16 sweeps what this task does not
falsify).

- [ ] **Step 4: Validate and commit**

```bash
./test validate
git add -A
git commit -m 'Seed ideas, projects, and records from genesis rows

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

### Task 17: Merge the stream family sets

Depends on T14 and T10.

**Files:**
- Modify: `api/document-family.ts:711-725, 766-776, 905-956`

Abominations this task risks: Premature Generalization (one
set, one arm; nothing configurable).

- [ ] **Step 1: One set, one name, one arm**

```ts
// Stream families: the stored PUT body is the family's own
// entityOf over the incoming body — the same object GET
// reads from the head. Flows keeps flowStoredEntityOf.
const STREAM_FAMILIES: ReadonlySet<string> = new Set([
    'ideas',
    'projects',
    'objectives',
    'identities',
    'ai-agents',
]);
```

`trioDocumentFromBody` becomes `documentFromBody`. In
`documentWriteResponseSpec` delete the `streamTrio` and
`streamStateless` bindings; `successBody`:

```ts
            if (STREAM_FAMILIES.has(wiring.family)) {
                return wiring.entityOf(
                    documentFromBody(id, raw),
                    organization ?? '',
                );
            }
            if (wiring.family === 'flows') {
                return flowStoredEntityOf(
                    documentFromBody(id, raw),
                    organization ?? '',
                );
            }
```

Rewrite the comment block 878-904 to drop "G1 trio".

- [ ] **Step 2: Validate and commit**

```bash
./test validate
git add -A
git commit -m 'Merge the stream family sets

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

---

## Wave 4

### Task 13: Dead parameters, names, the TEST-PLAN pin, one rename

Depends on T2, T3c, T6, T8, T9, T11. Three commits.

**Files:**
- Test: the nineteen helper files below;
  `tests/test-fixtures.ts:35`; the rename table's files;
  `TEST-PLAN.md:6038-6039`
- Rename: `tests/derive-objectives.test.ts` →
  `tests/api-objective-versions.test.ts`

Abominations this task risks: Test Weakening (a dropped
parameter changes no assertion), moving and changing in one
commit.

- [ ] **Step 1: Drop the dead parameters**

For each helper, delete the parameter and the matching
argument at every call site in that file (all are
file-local). Where a call passed a constant only that
argument used, delete the constant too.

| File | Helper (line) | Parameters to drop |
|---|---|---|
| api-nested-stream.test.ts | `ideaDocument` (76) | `_ev` |
| api-write-authorizer.test.ts | `ideaDocument` (40) | `_stateEventId` |
| api-entity-history-routes.test.ts | `ideaBody` (86), `projectBody` (368), `recordBody` (515), `objectiveBody` (951) | `_stateAt`, `_stateEventId` |
| api-objective-history.test.ts | `objectiveBody` (41) | `_stateAt`, `_stateEventId` |
| adapters-objectives.test.ts | `objectiveDoc` (49) | `_eventId`, `_at` |
| drift-projects.test.ts | `projectDocument` (74), `wireProjectGet` (121) | `_stateAt`, `_stateEventId` |
| adapters-work-orders.test.ts | `seedRelease` (262) | `_releaseAt` |
| drift-ideas.test.ts | `ideaDocument` (76), `wireIdeaGet` (119) | `_stateAt`, `_stateEventId` |
| drift-objectives.test.ts | `wireObjectiveGet` (164) | `_stateAt`, `_stateEventId` |
| drift-records.test.ts | `editRecordBody` (348) | `_stateAt`, `_stateEventId` |
| store-acceptance.ts | `ideaDocument` (46), `projectDocument` (62) | `_stateEventId` |
| api-record-types-write.test.ts | `typeBody` (75) | `_stateAt?`, `_stateEventId?` (twelve calls; `description` shifts left) |
| derive-states-union.test.ts | `createAiMember` (229) | `_initialState`, `_initialStateEventId`, `_initialStateAt` |
| api-ideas-create.test.ts | `ideaGenesisBody` (61) | `_ideaId`, `_at` |
| api-write-status.test.ts | `ideaDocument` (24) | `_stateEventId` |
| derive-projects.test.ts | `projectDocument` (40) | `_stateAt`, `_stateEventId` |
| drift-states.test.ts | `ideaDocument` (206) | `_stateEventId`, `_at` |
| api-record-document.test.ts | `recordDocument` (72) | `_stateAt`, `_stateEventId` |
| pg-races.test.ts | `ideaDocument` (94) | `_stateEventId` |

Line numbers are pre-Wave-1; grep by helper name. Also
`tests/test-fixtures.ts:35`: the `Omit` list drops
`'state_at' | 'state_event_id'`. Validate; commit `Drop the
dead lifecycle parameters from test helpers`.

- [ ] **Step 2: Rename the surviving tests**

| File:line | New name |
|---|---|
| api-record-document:92 | `'validateRecordDocumentBody accepts entity fields plus state, organization_id omitted'` |
| api-record-document:127 | `'validateRecordDocumentBody rejects a body without state'` |
| api-objective-document:84 | `'validateObjectiveDocumentBody accepts the entity field plus state and an optional organization_id'` |
| api-objective-document:133 | `'validateObjectiveDocumentBody rejects a body missing state'` |
| api-objective-document:176 | `'PUT organizations/:id/objectives/:id without state is 400'` |
| api-idea-document:212, api-project-document:167 | `'the pair request body carries domain state; GET carries no event fields'` |
| api-record-types-write:173 | `'… body echoes entity; GET sees state'` |
| api-record-types-read:158 | `'… (at, id) first, state embedded, member token'` |
| adapters-objectives:496 | `'postObjectiveArchival PUTs the document with the archived state and the current position'` |
| mock-data-pairs:387 | `'… its body carrying the entity plus state (no id or organization_id key)'` |
| mock-data-pairs:483 | `'… body carrying position plus state and no organization_id key'` |
| drift-objectives:1068 | `… state families exclude only state='deleted'` |
| derive-objectives:80 | `'GET organizations/:id/objectives/:id/versions carries the objective rows (DESC current-first)'` |

Then `grep -rn "trio" tests/*.ts tests/browser/*.ts` must show
only flows, work-orders, record-attributes, members, and
`mem-trio` lines. `TEST-PLAN.md:6038-6039` takes the new K4
name. Validate; commit `Rename the tests that still name the
trio`.

- [ ] **Step 3: Rename the file**

```bash
git mv tests/derive-objectives.test.ts \
    tests/api-objective-versions.test.ts
./test validate
git commit -m 'Rename derive-objectives.test.ts to api-objective-versions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

Content unchanged in this commit. `./test lint` checks that
every `tests/…` path TEST-PLAN.md cites exists; grep
TEST-PLAN.md for the old name first and, if cited, change the
citation in the rename commit (a path, not content).

### Task 16: Describe the seed's genesis rows truthfully

Depends on T12.

**Files:**
- Modify: `api/mock-data/seed-message-pairs.ts` comment lines
  the explorer counted (234, 318, 447, 482, 705, 707, 745,
  825, 925, 1255, 1257, 1409 pre-Wave-1) and any Task 12 left
- Modify: `api/mock-data.ts:516, 569`

Abominations this task risks: Obscurity (a rewritten comment
explains why, never what).

- [ ] **Step 1: Sweep**

`grep -n "trio\|Decision 7\|states log\|genesis event\|state event" api/mock-data/seed-message-pairs.ts api/mock-data.ts`.
For each line in ideas, projects, records, or objectives
territory: delete it, or where the reader needs one
sentence, write "state rides the document body". Lines in
flows, work-orders, or member territory stay. `mem-trio`
mnemonics stay.

- [ ] **Step 2: Validate and commit**

```bash
./test validate
git add -A
git commit -m "Describe the seed's genesis rows truthfully

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 18: Keep only the event-id branch of the lifecycle walk

Depends on T7, T11, T14.

**Files:**
- Modify: `api/derive-documents.ts:146-232, 255-265`
- Test: `tests/api-record-document.test.ts:340-420`

Abominations this task risks: Internal Defense (no fallback
for a body without `state_event_id`; flows' validator
guarantees the key, and `pickString` throwing is the
contract breach surfacing).

- [ ] **Step 1: Delete the DELETE-skip test first**

`tests/api-record-document.test.ts`: delete the test at 391,
`storedMessagePairAt` (355-388), the section comment
(340-353), and the `documentLifecycleEvents` import (20). Run
the file: green (nothing else used them).

- [ ] **Step 2: The walk**

```ts
// Flows' lifecycle walk. One event per distinct
// state_event_id in arrival order: a later PUT resending the
// same event id is an echo, not a new event. The validator
// guarantees the key on every flow document body; a DELETE
// pair carries no body and is skipped.
export function documentLifecycleEvents(
    messagePairs: readonly DocumentMessagePair[],
): DocumentLifecycleEvent[] {
    const seen = new Set<Id>();
    const events: DocumentLifecycleEvent[] = [];
    for (const messagePair of messagePairs) {
        if (messagePair.method === DELETE_METHOD) continue;
        const stateEventId = pickString(
            messagePair.body, 'state_event_id',
        );
        if (seen.has(stateEventId)) continue;
        seen.add(stateEventId);
        events.push({
            stateEventId,
            state: pickString(messagePair.body, 'state'),
            stateAt: pickString(messagePair.body, 'state_at'),
            memberId: messagePair.requesterIdentityId,
            etag: messagePair.id,
        });
    }
    return events;
}
```

Rewrite the comment above `DELETED_STATE` (146-154) to
"Flows' document body carries state, state_at, and
state_event_id; every other document family carries state
alone." Rewrite `currentLifecycleEvent`'s comment (255-265)
to drop "ideas, projects, records, objectives, members".
Rewrite `DocumentMessagePair`'s comment (47-54) to drop
"derive-ideas.ts's state trio".

- [ ] **Step 3: Validate and commit**

`tests/derive-flows.test.ts` and `tests/drift-flows.test.ts`
are the witnesses.

```bash
./test validate
git add -A
git commit -m 'Keep only the event-id branch of the lifecycle walk

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

---

## Wave 5

### Task 19: Drop the trio narration from api comments

Depends on T4, T8, T11, T13, T17, T18.

**Files:**
- Modify: `api/routes.ts`, `api/document-family.ts`,
  `api/validators.ts`, `api/derive-states.ts:40-46, 506,
  747, 788, 907-908, 1873`, `api/derive-documents.ts`,
  `api/derive-projects.ts`, `api/derive-ideas.ts`,
  `api/derive-record-types.ts`, `api/types.ts:1323`,
  `api/api.ts:677, 2257-2260`,
  `api/derive-objective-revisions.ts:32`

Out of scope, untouched: `api/derive-flows.ts`,
`api/work-order-claims.ts`, `api/derive-project-flows.ts`,
`api/derive-invitations.ts`, `api/derive-flow-work-orders.ts`,
`api/derive-flow-records.ts`, `api/mock-data/scores.ts:102`
(a score-distribution skew).

Abominations this task risks: Obscurity; Unbidden Helper
Code (comments only, no code).

- [ ] **Step 1: Sweep**

```bash
grep -n "trio\|Decision 7\|genesis-wins\|skew\|MEMBER_ID CAVEAT\|camelCase mint\|states log\|states-document\|lifecycle-current\|chain-walk\|chain walk" api/*.ts
```

For each line in the in-scope files: delete the sentence, or
where the reader needs one, write "state rides the document
body; a head whose state is `deleted` is a tombstone". In
`api/derive-states.ts` and `api/validators.ts` a line that
names flows, work-orders, members, or invitations stays; a
line that lists the four families among them loses those
four. The `api/api.ts:2257-2260` block becomes: "Stream
families read the stored head. Work-orders assemble
(binding). Flows stay on derive for hasUndoHistory."

- [ ] **Step 2: Validate and commit**

```bash
./test validate
git add -A
git commit -m 'Drop the trio narration from api comments

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

### Task 20: Drop the trio narration from web-app comments

Depends on T4, T8, T9.

**Files:**
- Modify: `web-app/app/adapters/ideas.ts`, `projects.ts`,
  `objectives.ts`, `records.ts`, `project-scoring.ts:182-183,
  275-276`, `dashboard.ts:70-71, 207`,
  `web-app/records/index.ts:144`, `web-app/records/detail.ts:1077`,
  `web-app/projects/detail.ts`, `web-app/organization/index.ts`,
  `web-app/ideas/convert.ts:601`

Out of scope: `flow-mutations.ts`, `flow-export.ts`,
`presenters/workbox-inbox.ts`.

- [ ] **Step 1: Sweep with the Task 19 grep over `web-app`**

Same rule. "Lifecycle state rides the project GET row trio"
becomes "State rides the project GET row".

- [ ] **Step 2: Validate and commit**

```bash
./test validate
git add -A
git commit -m 'Drop the trio narration from web-app comments

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>'
```

### Task 21: Record the trio's retirement in TODO

Lands last.

**Files:**
- Modify: `TODO.md:14-16, 122-150, 1382-1383`, two lines
  under `## Later work`

- [ ] **Step 1: Item 7**

Replace lines 122-150 with:

```
7. Lifecycle out of the document body — closed the other
   way by `docs/superpowers/specs/2026-09-15-retire-the-trio-design.md`:
   state stays in the document body, PUT stores it, GET
   reads it from the head, and ideas, projects,
   objectives, and record-types have no lifecycle event
   pairs. What closed: the server-side history walk over
   those four families, the `'trio'` discriminant, the
   two create-body event keys, the seed's per-entity
   state rows, the client's four `*StateDetail`
   wrappers, and the clock-skew and authorship-on-resend
   tests whose fixtures never built the skew they named.
   Flows keep their event walk and their three body
   fields until item 10 rewrites them.
```

Line 16: "and the skew tests folded into item 7" becomes
"and the skew tests, which went with item 7's trio". Lines
1382-1383: "7 → 10 (the flow rewrite lands on the stateless
shape once)" becomes "7 closed; 10 retires flows' event walk
with the rewrite".

- [ ] **Step 2: Two later-work lines**

Under `## Later work`, in the section's own bullet style:

```
- The schema drawing still carries a `state_event_id`
  arrow toward a `states` table that no longer exists.
  Oracle: `./test schema` green with the arrow gone.
- `/members/` parents left on the document plane are
  still resolved through a current lifecycle event
  (`api/derive-states.ts`, the C4 leftover near
  `deriveMemberStates RETIRED`). Oracle: the parent
  resolves from the head body alone.
```

Before writing, locate each: `grep -rn "state_event_id"
web-app/app/schema-svg.ts web-app/app/generate-schema-svg.ts`
and `grep -n "members/" api/derive-states.ts`. Cite the
`file:line` found. If a grep finds nothing, write the line
with the nearest true citation and report that the spec's
name for it did not match.

- [ ] **Step 3: Commit**

```bash
./test lint
git add -A
git commit -m "Record the trio's retirement in TODO

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Orchestrator checkpoints

After T7 lands, and after Wave 5:

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/retire-the-trio
export DENO_DIR="$TMPDIR/deno-dir"
./test postgres
```

After Wave 5, before the fast-forward:

```bash
./test validate browser
./deploy --local 8080 --postgres mock-data
```

then one Layer 3 walk through the TEST-PLAN sections for
ideas, projects, objectives, and record-types: create, edit,
transition, reorder, archive and reactivate, and delete
where a route exists. A walk finding changes product only
through a red test.

Then, from the main checkout:

```bash
cd /Users/tmornini/code/fusion-angle
git merge --ff-only retire-the-trio
git worktree remove .worktrees/retire-the-trio
git branch -d retire-the-trio
```

## Self-review

- Spec coverage: read path (T1, T7, T10, T18), write
  response (T14, T17), create bodies (T4, T8), seed (T12,
  T16), client (T5, T9), tests (T2, T3a-c, T6, T13),
  comments (T19, T20), TODO and TEST-PLAN (T21, T13). Every
  vocabulary row has a task: `'state'` T10; two-argument
  `entityOf` T1; `STREAM_FAMILIES` T17; `documentFromBody`
  T17; `trioCurrentFromBody` and `stateFromDocument` T1;
  the streamed helpers T1 and T14; `*State` T9;
  `*StateOf` T9; `getObjectiveStates` T9; `ideaGenesis` T12;
  `ideaSeedBody(idea, state, i)` T12.
- Spec step order changed once, with the reason in premise
  3. No step was merged; one (step 8) absorbed a parameter
  drop the compiler forces.
- Type consistency: `headDocumentOf` and `documentIsTombstone`
  (T7) are the names T18's comments assume;
  `getObjectiveStates` (T9) is the name T13's rename table
  assumes; `STATE` in `adapters-projects` (T9) is the name
  T13's helper table leaves alone.
- The one new test per create body (T4, T8 step 1) is the
  deletion-leaves-no-pin case the spec allows.

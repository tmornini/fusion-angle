# Retire the /states/ Write Address — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Per CLAUDE.md, every dispatched subagent prompt
> MUST begin with the literal phrase `Go to Medium Church!`,
> then the voice rules and the task text.

**Goal:** Retire `PUT /states/:id` entirely — objectives and
members convert to lifecycle-trio document families, work-order
unclaim becomes `POST work-orders/:id/release`, the 861 seeded
trace pairs reshape 1:1 into transition-op pairs, then the
route, derive source, response specs, and client funnel are
deleted so nothing recognizes, writes, or seeds `/states/`.

**Architecture:** Four stages (spec §8), each leaving
`./validate` green; the address dies only in stage 4. The
derived states log is the parity oracle throughout: pair
shapes change, derived events (ids, states, ats, authors) must
not — except the deliberate objective genesis additions.
`GET /states`, `GET /entity-states/:id/history`, and
`GET /states/:id/field-values` survive unchanged.

**Tech Stack:** Vanilla TypeScript (ES2024, strict,
`noUncheckedIndexedAccess`), zero runtime deps, `node:test`
via `./validate` / `./test`.

**Source of truth:**
`docs/superpowers/specs/2026-07-10-retire-states-address-design.md`
(approved, verified against f3fa3789; code at HEAD c639fe85 is
byte-identical — the only commit since is the spec itself).

## Global Constraints

- 78-char max line length on all `.ts`, `.html`, `.css`
  (except `compose.ts`) and repo-root `.md` files; 4-space
  indent; no trailing whitespace; final newline.
- No inline styles; no raw hex colors (no UI work is expected,
  but the rule binds any incidental touch).
- snake_case storage/wire document fields
  (`state`, `state_at`, `state_event_id`); camelCase op bodies
  (`releaseEventId`, `releaseAt`, `initialStateEventId`).
- Validators at the gate, never downstream. RequestContext is
  the first argument to adapter methods. Presenters emit
  SafeHtml (untouched here).
- One concern per commit; subject ≈50 chars, present-tense
  imperative, no body; trailer lines exactly:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  the Claude-Session line the harness mandates.
- Never move/rename and change content in one commit. Linear
  history. No worktrees — work in the main checkout.
- `./validate` green at every stage boundary. Tests are never
  weakened: each assertion either retires WITH its subject or
  is re-pinned to the new contract.
- Retired covenants get their comments REWRITTEN, never left
  stale (spec §2/§3): both decisions are settled and
  user-approved — do not relitigate them.

## Spec drift flags (verified against HEAD, carry these — do
## not silently adapt back to the spec's figures)

1. **Trace count is 861, not 860.** 212 hand-authored
   (`buildWorkOrderStateEvents()`, api/mock-data/work-orders.ts:798)
   + 649 generated (`buildLeadToCloseWorkload().stateEvents`)
   = 861. The seeded `states/:id` total of 862 = 861 traces
   + 1 mock-plane system-member genesis. Bootstrap's genesis
   pair lives in its own 14-pair pool, NOT in the 862. The
   spec's §6 landing zones survive (traces reshape 1:1):
   mock ≈ 1506, bootstrap ≈ 13. The stale "211 … = 860"
   comments live at api/mock-data/seed-message-pairs.ts:94 and
   :1652, tests/mock-data-pairs.test.ts:117, and
   tests/drift-states.test.ts:234 — all rewritten in stage 4.
2. **Objectives writes are NOT admin-only today.**
   `MEMBER_VERBS['/objectives']` is `['GET','PUT','POST']`
   (api/authorization.ts:118-149), so after retirement,
   objective lifecycle writes remain member-tier reachable via
   `PUT objectives/:id` — the spec §1 claim "the objectives
   surface already gate non-GET to admin" is false. This plan
   changes ONLY `MEMBER_VERBS['/states']` (PUT drops), exactly
   as the spec directs. Member lifecycle writes DO become
   admin-only (`/members` is GET-only at member tier). Surface
   this to the user at review; tightening objectives is a
   separate decision this plan does not take.
3. **In-flight fixtures are three 2-event + two 3-event**
   (WO30-32 two events; WO33-34 three), not "four 2-event".
   Zero seeded claim events is confirmed. No plan impact — the
   creation-gate mismatch rationale stands either way.
4. `memberDocumentBodyOf` lives in **api/routes.ts:1662**, not
   validators.ts. `scanForRetiredKeys` lives in
   **web-app/app/adapters/snapshots.ts**, not api/db.ts (and
   needs no change — its `'states'` entries are Phase-Final
   table residue, verified).
5. **Bootstrap's genesis event id is the literal
   `'bootstrap-system-active'`** (constant
   `bootstrapSystemStateEventId`,
   api/mock-data/seed-message-pairs.ts:1166) — only the mock
   seed uses the `seed-member-…-active` pattern.
6. **Spec-unnamed sites stage 4 must also touch:**
   `ORGANIZATION_NESTED_FIRST_SEGMENTS` contains `'states'`
   (api/message-pair.ts:135-137); `tests/api.test.ts:73-94`
   pins the 409 immutability contract on the address; and five
   test files carry FREEZE/R2 covenant comment copies
   (tests/api-member-documents.test.ts:32-39,
   tests/api-identity-document.test.ts:23-31,
   tests/api-objective-document.test.ts:22-32,
   tests/drift-states.test.ts:315-317,
   tests/drift-objectives.test.ts:558-559) that get the same
   rewrite discipline as the three production comments the
   spec names.
7. **No `s.variant` exists** in the member adapters — each
   adapter knows its own kind; `'human'`/`'ai'` are supplied
   literally per adapter (spec §3's "s.variant supplies type"
   has no code referent).
8. **No invitation op-seed precedent exists** (spec §5's
   implied example). The op-shaped seed formation path is
   net-new: `formSeedPair` infers PUT whenever `idParams` is
   set, so Task 12 extends `MockDataInvocation` with an
   `op: true` discriminator.
9. **The client member domain objects hold only a bare
   `MemberState`** — no `stateAt`/`stateEventId` accessors
   exist on `HumanMember`/`AIMember` (api/types.ts:665-731).
   The trio-echo requires widening the member state reads and
   the domain classes (Task 7); the spec's "it holds the
   loaded member" is the target state, not the current one.
10. **Create op bodies KEEP `initialState*` on the wire.**
    Spec §3's "move initialState* off the op body into the
    members/:id document pair body" is implemented as: the
    validated create body still carries the trio (that is how
    the route learns it), the route folds it into the
    members/:id document pair via `memberDocumentBodyOf`, and
    the DERIVE source flips from the op-body echo
    (`deriveMemberGenesis`) to the document trio
    (`deriveMemberStates`). This keeps
    `organizationHasOpBornEvent`'s ai/human-members op-born
    arm (api/derive-states.ts:738-766) and the
    drift-phase15 member-genesis visibility pins working
    unchanged, and it keeps the seed bodies
    (`humanMemberSeedBody`/`aiMemberSeedBody`, which already
    carry `initialState*`) untouched.

## The parity oracle harness

Capture the derived states log before stage 1 and diff after
every stage. Field-level equality, not a count.

- [ ] **Step 0.1: Write the oracle script** (scratch only —
  never committed; keep it OUTSIDE the repo):

Write to
`/private/tmp/claude-501/-Users-tmornini-code-fusion-ai/`
`c2137457-c5ff-4247-b0b1-3affaf95e4ea/scratchpad/`
`states-oracle.mjs`:

```js
// Derived-states parity oracle. Usage:
//   node --experimental-strip-types states-oracle.mjs out.json
// Run from the repo root.
import { writeFileSync } from 'node:fs';
import { MemoryDbAdapter } from './api/db-memory.ts';
import { postMockDataLoad } from './api/mock-data.ts';
import {
    deriveStates,
} from './api/derive-states.ts';

const STARK = '1';
const WAYNE = '2';
const db = new MemoryDbAdapter();
await postMockDataLoad(db);
const rows = [
    ...(await deriveStates(db, STARK)),
    ...(await deriveStates(db, WAYNE)),
];
rows.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
writeFileSync(process.argv[2], JSON.stringify(rows, null, 1));
console.log(rows.length, 'derived rows ->', process.argv[2]);
```

NOTE: confirm the two seeded organization ids before first
run — `grep -n "STARK_ORGANIZATION\|ORGANIZATION_TWO" \
api/mock-data/seed-constants.ts` — and substitute the real id
literals for `'1'`/`'2'`. If `deriveStates` double-fences
global member rows differently per org, dedupe by id when
diffing (the sort + JSON diff makes duplicates obvious).

- [ ] **Step 0.2: Capture the baseline**

Run (from the repo root):
```bash
node --experimental-strip-types \
  "$SCRATCH/states-oracle.mjs" "$SCRATCH/oracle-baseline.json"
```
Expected: a row count > 800 printed, file written.

After EACH stage boundary, re-run into `oracle-stageN.json`
and diff against baseline:
```bash
diff "$SCRATCH/oracle-baseline.json" "$SCRATCH/oracle-stage1.json"
```
Expected per stage:
- Stage 1: exactly 5 added rows (the objective genesis events:
  ids `seed-objective-<id>-active` × 5), nothing else.
- Stage 2: no further delta.
- Stage 3: no further delta.
- Stage 4: no further delta.
Any other delta is a parity failure: STOP, fix before
committing the stage's final commit.

---

# Stage 1 — Objectives → trio family (spec §2)

### Task 1: Objective validators + body builders widen

**Files:**
- Modify: `api/types.ts` (~line 291, beside
  `assertMemberState`)
- Modify: `api/validators.ts:2145-2196`
  (`validateObjectiveDocumentBody`), `:3144-3191`
  (`validateObjectiveCreateBody`), imports at `:61-65`
- Modify: `api/routes.ts:1508-1530` (`objectiveDocumentBodyOf`)
- Test: `tests/api-objective-document.test.ts`

**Interfaces:**
- Consumes: `OBJECTIVE_STATES` / `ObjectiveState`
  (api/types.ts:126-140), `validateTimestampField`,
  `assertOnlyKeys`, `pickString`, `pickNumber` (validators.ts),
  `recordDocumentBodyOf` as the fold mirror
  (api/routes.ts:893-920).
- Produces: `assertObjectiveState(value, label): ObjectiveState`
  (api/types.ts); `ObjectiveDocumentBody` gains
  `readonly state: ObjectiveState; readonly state_at: string;
  readonly state_event_id: string`; `ObjectiveCreateBody` gains
  `readonly initialState: ObjectiveState;
  readonly initialStateEventId: string;
  readonly initialStateAt: string`;
  `objectiveDocumentBodyOf(createBody)` returns the entity
  fields PLUS `state`/`state_at`/`state_event_id`. Tasks 2-4
  and the seed plane rely on these exact names.

- [ ] **Step 1.1: Rewrite the test file's covenant header and
  add failing trio tests**

`tests/api-objective-document.test.ts` — replace the header
comment at lines 22-32 (the R2 covenant copy) with the new
contract, and add tests. New header comment:

```ts
// Objectives are the FIFTH lifecycle-trio family (states-
// address retirement): PUT /objectives/:id carries the
// entity's own field ({position}) PLUS the lifecycle trio
// (state/state_at/state_event_id), exactly as ideas/projects/
// records/flows do. The absence-as-active covenant (R2) and
// the genesis dilemma are RETIRED — every objective now has
// an explicit genesis event minted at create, and archive/
// reactivate ride this SAME document address. The states/:id
// event-append path for objectives is dead.
```

Add (adapting the file's existing helper idiom — reuse its
own `req`/token/db setup verbatim):

```ts
test('PUT objectives/:id accepts the lifecycle trio and'
+ ' echoes the entity fields', async () => {
    // arrange: seeded db + org token, as the sibling tests do
    const res = await handleRequest(db, req(
        'PUT', '/objectives/obj-trio-1', token, {
            position: 7,
            state: 'active',
            state_at: nowUtc(),
            state_event_id: 'obj-trio-1-ev1',
        },
    ));
    assert.equal(res.status, 200);
    // response body stays byte-shaped {id, organization_id,
    // position} — documentWriteResponseSpec spreads doc.entity
    // only; the trio is never echoed (the ideas precedent).
});

test('PUT objectives/:id without the trio is 400', async () => {
    const res = await handleRequest(db, req(
        'PUT', '/objectives/obj-trio-2', token,
        { position: 1 },
    ));
    assert.equal(res.status, 400);
});

test('PUT objectives/:id rejects a state outside the'
+ ' objective alphabet', async () => {
    const res = await handleRequest(db, req(
        'PUT', '/objectives/obj-trio-3', token, {
            position: 1,
            state: 'deleted',
            state_at: nowUtc(),
            state_event_id: 'obj-trio-3-ev1',
        },
    ));
    assert.equal(res.status, 400);
});
```

Also update this file's EXISTING body-shape tests: any case
that PUTs `{position}` alone and expects 200 now expects 400
(missing trio) — re-pin each to send the trio. Keep the
`organization_id`-tolerated assertions as they are (the
`assertOnlyKeys` tolerance list is unchanged).

- [ ] **Step 1.2: Run the test to verify it fails**

```bash
node --test --strip-types tests/api-objective-document.test.ts
```
Expected: FAIL — trio keys rejected ("unexpected key" 400s)
and missing-trio case gets 200.

- [ ] **Step 1.3: Add `assertObjectiveState` to api/types.ts**

Beside `assertMemberState` (api/types.ts:291), mirroring
`assertIdeaState` (api/types.ts:270) byte-for-byte in shape:

```ts
export function assertObjectiveState(
    value: string,
    label: string,
): ObjectiveState {
    if (
        (OBJECTIVE_STATES as readonly string[]).includes(value)
    ) {
        return value as ObjectiveState;
    }
    throw new Error(
        label + ' has unknown objective state: ' + value,
    );
}
```

FIRST read `assertIdeaState`'s actual body at api/types.ts:270
and copy ITS exact error-construction idiom (it may throw
`ValidationError` or use a different message shape — match it
exactly; the snippet above is the shape, the existing sibling
is the authority). Note: `OBJECTIVE_STATES` is
`['active', 'archived']` — it deliberately has NO `'deleted'`
member; objectives/:id has no DELETE route and this plan adds
none, so the trio walk's DELETED filter simply never fires.

- [ ] **Step 1.4: Widen `validateObjectiveDocumentBody`**

api/validators.ts:2145-2196 — mirror
`validateIdeaDocumentBody` (validators.ts:1319-1386). Import
`assertObjectiveState` in the types import block (~line 61-65).
Rewrite the comment block at :2158-2163 (the R2 covenant copy)
— new comment names the retirement:

```ts
// The HTTP-body gate for PUT /objectives/:id: entity field
// plus the lifecycle trio — the fifth trio family (states-
// address retirement). The old absence-as-active covenant
// (R2) and the genesis dilemma are RETIRED: genesis is an
// explicit event minted at create, archive/reactivate ride
// this SAME address, and no states/:id pair ever carries an
// objective lifecycle again.
const OBJECTIVE_DOCUMENT_BODY_KEYS: readonly string[] = [
    'position',
    'state', 'state_at', 'state_event_id',
];

export interface ObjectiveDocumentBody {
    readonly entity:
        Omit<ObjectiveEntity, 'id' | 'organization_id'>;
    readonly state: ObjectiveState;
    readonly state_at: string;
    readonly state_event_id: string;
}

export function validateObjectiveDocumentBody(
    body: Record<string, unknown>,
): ObjectiveDocumentBody {
    assertOnlyKeys(
        body, OBJECTIVE_DOCUMENT_BODY_KEYS, 'Objective',
        ['organization_id'],
    );
    const state = assertObjectiveState(
        pickString(body, 'state'),
        'ObjectiveDocumentBody.state',
    );
    const stateEventId = pickString(body, 'state_event_id');
    if (stateEventId === '') {
        throw new ValidationError(
            'ObjectiveDocumentBody.state_event_id must be'
            + ' non-empty',
        );
    }
    return {
        entity: {
            position: pickNumber(body, 'position'),
        },
        state,
        state_at: validateTimestampField(
            body, 'state_at', 'ObjectiveDocumentBody.state_at',
        ),
        state_event_id: stateEventId,
    };
}
```

KEEP the `assertOnlyKeys` label `'Objective'` exactly as it is
today — the label appears in wire 400 bytes (the members
LABEL MANDATE precedent, validators.ts:774-814); changing it
would silently change 400 bodies.

- [ ] **Step 1.5: Widen `validateObjectiveCreateBody`**

api/validators.ts:3144-3191 — add the three keys and fields,
mirroring `validateRecordWriteBody`'s create arm
(validators.ts:2825-2941):

```ts
const OBJECTIVE_CREATE_KEYS: readonly string[] = [
    'id', 'objective', 'revisionId', 'revision',
    'initialState', 'initialStateEventId', 'initialStateAt',
];
```

Interface gains:
```ts
    readonly initialState: ObjectiveState;
    readonly initialStateEventId: string;
    readonly initialStateAt: string;
```

Function body gains (before the return, mirroring the record
create validator):
```ts
    const initialState = assertObjectiveState(
        pickString(body, 'initialState'),
        'ObjectiveCreateBody.initialState',
    );
    const initialStateEventId = pickString(
        body, 'initialStateEventId',
    );
    if (initialStateEventId === '') {
        throw new ValidationError(
            'ObjectiveCreateBody.initialStateEventId'
            + ' must be non-empty',
        );
    }
    const initialStateAt = validateTimestampField(
        body, 'initialStateAt', 'ObjectiveCreateBody',
    );
    return {
        id, objective, revisionId, revision,
        initialState, initialStateEventId, initialStateAt,
    };
```

- [ ] **Step 1.6: Fold the trio in `objectiveDocumentBodyOf`**

api/routes.ts:1508-1530 — mirror `recordDocumentBodyOf`
(routes.ts:893-920). Rewrite its comment too (it currently
says "the live client's PUT body is {position} alone"):

```ts
// The wire body a live PUT objectives/:id would carry for
// this SAME write: the entity field (organization_id
// STRIPPED — the org rides the address) plus the lifecycle
// trio mapped from the create body's initialState* — the
// recordDocumentBodyOf shape, so a synthesized document pair
// is byte-indistinguishable from what a live PUT would have
// stored for the identical write.
export function objectiveDocumentBodyOf(
    createBody: ObjectiveCreateBody,
): Record<string, unknown> {
    const {
        organization_id: _organizationId, ...entity
    } = createBody.objective;
    return {
        ...entity,
        state: createBody.initialState,
        state_at: createBody.initialStateAt,
        state_event_id: createBody.initialStateEventId,
    };
}
```

`objectiveRevisionBodyOf` is untouched.

- [ ] **Step 1.7: Run the suite — expect stage-local failures
  only**

```bash
node --test --strip-types tests/api-objective-document.test.ts
```
Expected: PASS. Then `./test`. Expected: failures ONLY in
files that seed or PUT objectives without the trio
(seed pass 1 calls `validateObjectiveCreateBody` at
api/mock-data/seed-message-pairs.ts:1874/1907 — the seed now
throws until Task 4; adapters tests until Task 3). Record the
exact failing list; every one of them must be green by the end
of Task 4 and RED here for a reason this task explains.
If the seed throws, Tasks 1-4 land as ONE `./validate` run at
the stage boundary — commit each task locally as you go
(commits may be red mid-stage; the STAGE boundary is green —
CLAUDE.md's "commit completed, tested work" is satisfied by
the stage; do not push mid-stage).

- [ ] **Step 1.8: Commit**

```bash
git add api/types.ts api/validators.ts api/routes.ts \
  tests/api-objective-document.test.ts
git commit -m "widen objective bodies with lifecycle trio"
```

### Task 2: Wiring flip + derive-objectives module + union

**Files:**
- Modify: `api/routes.ts:441-475` (OBJECTIVES_WIRING block)
- Create: `api/derive-objectives.ts`
- Modify: `api/derive-states.ts:33-97` (header comment),
  `:2065-2091` (`trioFamiliesFor`), `:2122-2137` ("WHY SIX,
  NOT SEVEN"), `:2210-2238` (`deriveStatesFor`)
- Test: `tests/derive-objectives.test.ts` (new)

**Interfaces:**
- Consumes: `documentPairsAt`, `documentLifecycleEvents`,
  `stateHistoryFrom` (api/derive-documents.ts:97-249),
  `canonicalUriPrefix` (api/message-pair.ts:143-157).
- Produces: `deriveObjectiveStateHistory(db, organization, id):
  Promise<StateEntity[]>` — the fifth `trioFamiliesFor` entry
  and a new `deriveStatesFor` union member. `deriveStates`
  needs NO edit (it consumes `trioFamiliesFor` via
  `deriveTrioFamilyStates`).

- [ ] **Step 2.1: Write the failing derive test**

Create `tests/derive-objectives.test.ts`. Copy the helper
block (db seeding, `organizationToken()`, `req()`) from
`tests/derive-document-state-head-for.test.ts` — same import
style, same setup idiom. Tests:

```ts
test('deriveObjectiveStateHistory returns the trio walk in'
+ ' (state_at, id) order with echo dedup', async () => {
    const db = await seededDb();
    const token = await organizationToken();
    const id = 'obj-derive-1';
    const genesisAt = nowUtc();
    await handleRequest(db, req(
        'PUT', '/objectives/' + id, token, {
            position: 1, state: 'active',
            state_at: genesisAt, state_event_id: id + '-ev1',
        },
    ));
    const archiveAt = nowUtc();
    await handleRequest(db, req(
        'PUT', '/objectives/' + id, token, {
            position: 1, state: 'archived',
            state_at: archiveAt, state_event_id: id + '-ev2',
        },
    ));
    // a byte-identical echo of ev2 (drag-reorder style
    // re-put) must NOT mint a third event
    await handleRequest(db, req(
        'PUT', '/objectives/' + id, token, {
            position: 2, state: 'archived',
            state_at: archiveAt, state_event_id: id + '-ev2',
        },
    ));
    const history = await deriveObjectiveStateHistory(
        db, STARK_ORGANIZATION, id,
    );
    assert.deepEqual(
        history.map((r) => [r.id, r.state]),
        [[id + '-ev1', 'active'], [id + '-ev2', 'archived']],
    );
});

test('GET /entity-states/:id/history carries the objective'
+ ' trio rows (deriveStatesFor union)', async () => {
    // PUT genesis as above, then:
    const res = await handleRequest(db, req(
        'GET', '/entity-states/' + id + '/history', token,
    ));
    assert.equal(res.status, 200);
    const rows = JSON.parse(await res.text());
    assert.equal(rows.length, 2);
});
```

Use the real seeded org id constant the helper file uses —
read it there, don't invent one.

- [ ] **Step 2.2: Run to verify it fails**

```bash
node --test --strip-types tests/derive-objectives.test.ts
```
Expected: FAIL — `deriveObjectiveStateHistory` does not exist.

- [ ] **Step 2.3: Create `api/derive-objectives.ts`**

Mirror `api/derive-ideas.ts`'s `fetchIdeaPairs` +
`deriveIdeaStateHistory` shape (derive-ideas.ts:521-639),
reduced to the one export this plan needs (do NOT build
`deriveObjectives`/`deriveObjective` entity readers — the
generic document handlers already serve objectives; unbidden
helpers are a sin):

```ts
import type { DbAdapter } from './db.ts';
import type { Id, StateEntity } from './types.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import {
    documentPairsAt,
    documentLifecycleEvents,
    stateHistoryFrom,
} from './derive-documents.ts';

// Objectives' own reshaping of the generic message-plane
// reduction (derive-documents.ts): the fifth trio family
// (states-address retirement). One prefix scan per
// derivation; the trio walk, its (state_at, id) ordering,
// and echo dedup are the shared derive-documents.ts cores —
// never rebuilt here (the derive-ideas.ts shape).

function objectivesUriPrefix(organization: Id): string {
    return canonicalUriPrefix(organization, '/objectives/');
}

// One row per pair whose state_event_id is NEW — the document
// sequence IS the history, (state_at, id) ascending. Returns
// every event regardless of current lifecycle state; there is
// no objectives DELETE route, so the DELETED filter upstream
// never fires for this family.
export async function deriveObjectiveStateHistory(
    db: DbAdapter,
    organization: Id,
    objectiveId: Id,
): Promise<StateEntity[]> {
    const prefix = objectivesUriPrefix(organization);
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    const pairs = documentPairsAt(
        requests, responses, prefix,
    ).filter((pair) => pair.uriId === objectiveId);
    return stateHistoryFrom(
        documentLifecycleEvents(pairs), objectiveId,
    );
}
```

- [ ] **Step 2.4: Register the fifth trio family + widen the
  `deriveStatesFor` union**

api/derive-states.ts:
1. Import `deriveObjectiveStateHistory` beside the other four
   trio imports (top of file, ~:12-30).
2. `trioFamiliesFor` (:2065-2091) gains:
```ts
        {
            prefix: canonicalUriPrefix(
                organization, '/objectives/',
            ),
            stateHistory: deriveObjectiveStateHistory,
        },
```
3. `deriveStatesFor` (:2210-2238): add `objectiveRows` to the
   destructure, `deriveObjectiveStateHistory(db, organization,
   entityId)` to the `Promise.all`, and `...objectiveRows` to
   the merged array — in the trio-family group, after
   `flowRows`.
4. Rewrite the header comment block (:33-97): source (b)
   becomes "the FIVE trio families" and names objectives; the
   "Objectives need no seventh source" paragraph is REPLACED:
```ts
// Objectives joined the trio families at the states-address
// retirement: genesis is an explicit event minted at create,
// archive/reactivate ride PUT objectives/:id — the old
// absence-as-active covenant (R2) and the genesis dilemma are
// retired with the address that forced them.
```
5. Rewrite "WHY SIX, NOT SEVEN" (:2122-2137): the union is
   still six SOURCES (source (b) simply carries five families
   now) — retitle the comment "THE SIX-SOURCE UNION" and drop
   the objectives-need-no-source rationale, keeping the
   identical-content/differing-content crash-loud invariant
   paragraph verbatim.

- [ ] **Step 2.5: Flip the wiring + rewrite the OBJECTIVES
  covenant comment**

api/routes.ts:441-475 — set `lifecycle: 'trio'` and REPLACE
the whole comment block (it is the genesis-dilemma/R2
covenant; never leave it stale):

```ts
// The objectives wiring row — the seventh family, now the
// FIFTH 'trio' one (states-address retirement). Its three
// old 'stateless' rationales are all RETIRED with the
// states/:id address that anchored them: the wire body DOES
// grow the trio (the zero-delta covenant died with the
// address), genesis IS an explicit minted event (the seed
// re-baselined its pins — no 911 pin survives), and
// absence-as-active (R2) is retired — a fresh objective now
// carries a genesis event like every other trio family.
// notFoundTable is 'objectives' — its storage table name
// matches its family name, like ideas/projects/flows/records
// (work-orders/record-attributes are the two whose names
// diverge).
```

The wiring row itself changes ONE field:
```ts
const OBJECTIVES_WIRING: DocumentFamilyWiring = {
    family: 'objectives',
    lifecycle: 'trio',
    notFoundTable: 'objectives',
    validateDocument: validateObjectiveDocumentBody,
    documentOp: postObjectiveDocumentOp,
    entityOf: objectiveDocumentEntityOf,
};
```

`postObjectiveDocumentOp` needs NO change (byte-identical in
shape to `postIdeaDocumentOp` — verified). The related
'stateless' cross-references in the MEMBERS_WIRING comment
(routes.ts:548-583, "NOT objectives' absence-as-active
covenant …") are rewritten in Stage 2 Task 5 — leave them for
that commit (one concern per commit).

- [ ] **Step 2.6: Run the new tests**

```bash
node --test --strip-types tests/derive-objectives.test.ts
```
Expected: PASS (seeding may still be red repo-wide until
Task 4 — this file's own helpers seed through the gate, which
now requires the trio the Task 1 validators admit).

- [ ] **Step 2.7: Commit**

```bash
git add api/routes.ts api/derive-objectives.ts \
  api/derive-states.ts tests/derive-objectives.test.ts
git commit -m "flip objectives to trio with derive module"
```

### Task 3: Objective client adapters repoint

**Files:**
- Modify: `api/types.ts` (beside `IdeaStateDetail`,
  ~:1371-1375): add `ObjectiveStateDetail`
- Modify: `web-app/app/adapters/state-events.ts` (beside
  `getIdeaStateDetail(s)`, :286-340)
- Modify: `web-app/app/adapters/objectives.ts:222-301`
- Test: `tests/adapters-objectives.test.ts`,
  `tests/adapters-state-events.test.ts` (only if it pins the
  objectives readers — check first)

**Interfaces:**
- Consumes: `deriveObjectiveStateHistory` transitively via the
  surviving `GET /states` / `GET /entity-states/:id/history`
  reads; `assertObjectiveState` (Task 1);
  `generateCryptoSafeBase62`, `nowUtc` (existing imports).
- Produces: `getObjective(ctx, id): Promise<ObjectiveEntity>`;
  `getObjectiveStateDetails(ctx):
  Promise<Map<Id, ObjectiveStateDetail>>`;
  `postObjectiveCreation` widened create body;
  `postObjectiveArchival`/`postObjectiveReactivation` PUT
  `objectives/:id`; `putObjectivePosition(ctx, id, position,
  stateDetail)` echoes the trio. The organization page
  (`web-app/organization/index.ts`) is the only caller — its
  call sites update in this same task.

- [ ] **Step 3.1: Re-pin the adapter tests first**

`tests/adapters-objectives.test.ts` — the case at :162-173
seeds an archived objective via `ctx.PUT('states/e1', …)`;
re-pin it to seed via `PUT objectives/:id` carrying
`state: 'archived'` + fresh `state_at`/`state_event_id`. Add
new cases:

```ts
test('postObjectiveArchival PUTs the document with an'
+ ' archived trio and the current position', async () => {
    // arrange with the file's existing fake-ctx idiom; record
    // calls; assert ONE GET objectives/:id then ONE PUT
    // objectives/:id whose body is {position: <echoed>,
    // state: 'archived', state_at: <RFC-3339>,
    // state_event_id: <non-empty>}
});

test('putObjectivePosition echoes the supplied trio'
+ ' verbatim', async () => {
    // assert body {position, state, state_at,
    // state_event_id} with the caller-supplied detail values
});
```

Run: `node --test --strip-types tests/adapters-objectives.test.ts`
Expected: FAIL (old funnel still in place).

- [ ] **Step 3.2: Add `ObjectiveStateDetail` + the reads**

api/types.ts, beside `IdeaStateDetail`:
```ts
export interface ObjectiveStateDetail {
    readonly state: ObjectiveState;
    readonly stateAt: string;
    readonly stateEventId: string;
}
```

web-app/app/adapters/state-events.ts, beside
`getIdeaStateDetails` (:317-340), same shape:
```ts
// Bulk objective trio read — the getIdeaStateDetails shape.
// Consumed by the organization page so archive/reactivate
// and drag-reorder can echo each objective's current trio
// without minting a fresh event.
export async function getObjectiveStateDetails(
    ctx: RequestContext,
): Promise<Map<Id, ObjectiveStateDetail>> {
    const [events, rows] = await Promise.all([
        ctx.GET<StateEntity[]>('states'),
        ctx.GET<ObjectiveEntity[]>('objectives'),
    ]);
    const ids = new Set<Id>(rows.map(r => r.id));
    const inScope = events.filter(ev => ids.has(ev.entity_id));
    const latest = latestByKey(inScope, ev => ev.entity_id);
    const out = new Map<Id, ObjectiveStateDetail>();
    for (const [id, ev] of latest) {
        out.set(id, {
            state: assertObjectiveState(
                ev.state, 'objective ' + id,
            ),
            stateAt: ev.at,
            stateEventId: ev.id,
        });
    }
    return out;
}
```

- [ ] **Step 3.3: Repoint the objectives adapters**

web-app/app/adapters/objectives.ts — drop the
`postStateEvent` import; add `getObjective`; rewrite the four
writers:

```ts
export async function getObjective(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<ObjectiveEntity> {
    return ctx.GET<ObjectiveEntity>(`objectives/${id}`);
}
```

`postObjectiveCreation` — mint the initial trio into the
create body (spec §2: `'active'`,
`generateCryptoSafeBase62()`, `nowUtc()`):
```ts
    await ctx.POST('objectives', {
        id,
        objective: {
            position,
        },
        revisionId,
        revision: { /* unchanged */ },
        initialState: 'active',
        initialStateEventId: generateCryptoSafeBase62(),
        initialStateAt: at,
    });
```

Archival/reactivation — the get-then-put shape (the accepted
race the spec names):
```ts
// Read-then-put: position is echoed from the current head;
// the trio is minted fresh. The get-then-put race against a
// concurrent drag-reorder is ACCEPTED (spec §2) — objectives
// concurrency is 'simple' and the page is admin-facing.
export async function postObjectiveArchival(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<void> {
    const current = await getObjective(ctx, id);
    await ctx.PUT(`objectives/${id}`, {
        position: current.position,
        state: 'archived',
        state_at: nowUtc(),
        state_event_id: generateCryptoSafeBase62(),
    });
    notifyObjectiveChange();
}
```
`postObjectiveReactivation` is identical with
`state: 'active'`.

`putObjectivePosition` — gains a trio parameter (the caller
holds the loaded detail; the adapter never re-reads):
```ts
export async function putObjectivePosition(
    ctx: RequestContext,
    id: ObjectiveId,
    position: number,
    stateDetail: ObjectiveStateDetail,
): Promise<void> {
    await ctx.PUT(`objectives/${id}`, {
        position,
        state: stateDetail.state,
        state_at: stateDetail.stateAt,
        state_event_id: stateDetail.stateEventId,
    });
    notifyObjectiveChange();
}
```

- [ ] **Step 3.4: Update the organization page call sites**

`web-app/organization/index.ts` — the page currently calls
`postObjectiveArchival(ctx, id)` (:336) with only a DOM-read
id: unchanged signature, no edit needed there. Find every
`putObjectivePosition` call (grep the page) and thread the
trio from a `getObjectiveStateDetails` map loaded with the
page's objectives (load it beside the existing
`getObjectives`/`getArchivedObjectiveIds` reads and pass the
entry through the drag-reorder handler). If the page reorders
several objectives in one gesture, look up each id's detail
from the same map — one bulk read per load, no per-drag GET.

- [ ] **Step 3.5: Run adapter tests**

```bash
node --test --strip-types tests/adapters-objectives.test.ts
```
Expected: PASS.

- [ ] **Step 3.6: Commit**

```bash
git add api/types.ts web-app/app/adapters/state-events.ts \
  web-app/app/adapters/objectives.ts \
  web-app/organization/index.ts tests/adapters-objectives.test.ts
git commit -m "repoint objective lifecycle to document PUTs"
```

### Task 4: Objective seeds gain the genesis trio + stage-1
### test re-pins

**Files:**
- Modify: `api/mock-data/seed-message-pairs.ts:1111-1149`
  (`objectiveSeedBody`)
- Modify: `tests/drift-objectives.test.ts` (archive legs +
  R2 comment), `tests/drift-states.test.ts` (case 2 + 7c),
  `tests/mock-data-objectives.test.ts`,
  `tests/mock-data-pairs.test.ts` (accounting comment only)

**Interfaces:**
- Consumes: Task 1's widened `validateObjectiveCreateBody` /
  `objectiveDocumentBodyOf` — the seed's 1+1+1 invocations
  (seed-message-pairs.ts:1850-1927) flow the trio through the
  SAME shared builders automatically once the seed body
  carries `initialState*`.
- Produces: 5 deterministic genesis rows in the derived log:
  ids `seed-objective-<objectiveId>-active`, at
  `MOCK_SEED_TIMESTAMP`, author = each create invocation's own
  `requesterIdentityId` (the revision author for the 4 Stark
  seeds; `SYSTEM_MEMBER_ID` for org-2).

- [ ] **Step 4.1: Widen `objectiveSeedBody`**

```ts
    return {
        id: seed.id,
        objective: {
            organization_id: organization,
            position: seed.position,
        },
        revisionId: `${seed.id}:${MOCK_SEED_TIMESTAMP}`,
        revision: { /* unchanged */ },
        initialState: 'active',
        initialStateEventId:
            `seed-objective-${seed.id}-active`,
        initialStateAt: MOCK_SEED_TIMESTAMP,
    };
```

The id pattern mirrors `humanMemberSeedBody`'s
`seed-member-${id}-${state}` precedent. Pair COUNT is
unchanged (1514) — the trio rides existing bodies; only bytes
change. Update `objectiveSeedBody`'s comment to name the
genesis trio.

- [ ] **Step 4.2: Re-pin the stage-1 test blast radius**

Each assertion re-pins or retires with its subject — never
weakens:

1. `tests/drift-objectives.test.ts:558-591` — the ARCHIVE leg
   PUTs `/states/:objectiveId-archived`; re-point to
   `PUT /objectives/:id` with an archived trio. Rewrite the
   :558-559 comment ("stateless election, Author gate 3") to
   the trio contract. The ARCHIVED-INCLUSION PIN (:904-953)
   re-points the same way — the pinned BEHAVIOR (archived
   objectives stay in the collection) is unchanged.
2. `tests/drift-states.test.ts:315-317` — case 2's
   "absence IS active … EMPTY history" assertion INVERTS:
   re-pin to expect exactly one genesis row per seeded
   objective (`seed-objective-<id>-active`). Case 7c
   (:1118-1159) re-points its archive/reactivate writes to
   `PUT objectives/:id`.
3. `tests/mock-data-objectives.test.ts:105-113` — the
   zero-archived pin still holds (all seeds genesis
   `'active'`); re-verify, update any comment that says
   objectives have no states rows.
4. `tests/mock-data-pairs.test.ts:41-134` — update ONLY the
   accounting comment's objectives line (bodies now carry the
   trio); `EXPECTED_PAIR_COUNT` stays 1514.

- [ ] **Step 4.3: Stage boundary — full validate + oracle**

```bash
./validate
```
Expected: green. Then run the oracle
(`states-oracle.mjs` → `oracle-stage1.json`) and diff against
baseline. Expected: exactly the 5 genesis additions.

- [ ] **Step 4.4: Commit**

```bash
git add api/mock-data/seed-message-pairs.ts tests/
git commit -m "seed objective genesis trio, re-pin oracles"
```

---

# Stage 2 — Members → trio family (spec §3)

### Task 5: Member document/edit validators + wiring flip +
### route arms

**Files:**
- Modify: `api/validators.ts:774-814`
  (`validateMemberDocumentBody`), `:3894-3950` (both edit
  validators)
- Modify: `api/routes.ts:548-583` (MEMBERS_WIRING + FREEZE
  comment), `:1656-1666` (`memberDocumentBodyOf`),
  `:3053-3092` (ai create arm), `:3102-3161` (ai edit arm),
  `:3179-3231` (human create arm), `:3245-3314` (human edit
  arm)
- Test: `tests/api-member-documents.test.ts`

**Interfaces:**
- Consumes: `assertMemberState` (api/types.ts:291),
  `MemberState` (no `'deleted'` member — the trio walk's
  DELETED filter can never hide a member; verified).
- Produces: `MemberDocumentBody` gains
  `state`/`state_at`/`state_event_id` (snake_case document
  fields); `memberDocumentBodyOf(type, trio)` where `trio` is
  `{ state: MemberState; stateAt: string;
  stateEventId: string }`; `HumanMemberEditBody` /
  `AIMemberEditBody` gain `state`/`stateAt`/`stateEventId`
  (camelCase op fields). Create bodies KEEP `initialState*`
  (drift flag 10). Tasks 6-8 rely on these names.

- [ ] **Step 5.1: Re-pin the document-body tests first**

`tests/api-member-documents.test.ts` — rewrite the :32-39
FREEZE covenant header:

```ts
// Members are a lifecycle-trio family (states-address
// retirement): PUT /members/:id carries {type} plus the trio
// (state/state_at/state_event_id). The old FREEZE-at-genesis
// refutation is RETIRED — its premise (a competing states/:id
// log) died with the address; documentLifecycleEvents' echo
// dedup by state_event_id is what keeps a re-put from minting
// a phantom transition.
```

Re-pin body-shape cases: `{type}` alone now 400s; the widened
body 200s; a state outside
`['active','pending','archived']` 400s. Keep the LABEL
MANDATE assertions untouched — the `assertOnlyKeys` label
stays `'MemberEntity'` so existing 400 bytes hold for the
still-rejected keys.

Run: `node --test --strip-types tests/api-member-documents.test.ts`
Expected: FAIL.

- [ ] **Step 5.2: Widen `validateMemberDocumentBody`**

api/validators.ts:774-814 — keys become:
```ts
const MEMBER_DOCUMENT_BODY_KEYS: readonly string[] = [
    'type',
    'state', 'state_at', 'state_event_id',
];
```
Interface gains the trio (types: `MemberState`, `string`,
`string`); body gains, after the `type` field:
```ts
    const state = assertMemberState(
        pickString(body, 'state'),
        'MemberEntity.state',
    );
    const stateEventId = pickString(body, 'state_event_id');
    if (stateEventId === '') {
        throw new ValidationError(
            'MemberEntity.state_event_id must be non-empty',
        );
    }
```
and returns `{ entity: { type }, state, state_at:
validateTimestampField(body, 'state_at',
'MemberEntity.state_at'), state_event_id: stateEventId }`.
Rewrite the validator's LABEL-MANDATE comment paragraph to
note the trio widening while keeping the label rationale.

- [ ] **Step 5.3: Widen both edit validators**

api/validators.ts:3894-3950 — both `AIMemberEditBody` and
`HumanMemberEditBody` gain:
```ts
    readonly state: MemberState;
    readonly stateAt: string;
    readonly stateEventId: string;
```
keys arrays gain `'state', 'stateAt', 'stateEventId'`; bodies
validate via `assertMemberState` + `validateTimestampField` +
non-empty `stateEventId`, mirroring Step 5.2 but camelCase.
Rewrite each "NO state event" comment: the edit body now
ECHOES the current trio verbatim; a byte-identical echoed
members/:id body folds by message_hash (the memberDocument
fold, api/message-pair.ts:470-483), so an echo never mints a
phantom transition.

- [ ] **Step 5.4: `memberDocumentBodyOf` gains trio params;
  all four route arms thread it**

api/routes.ts:1656-1666:
```ts
// The wire body a live PUT members/:id would carry for this
// SAME write: `type` plus the lifecycle trio. The member kind
// is a server-supplied fact the caller pins; the trio is the
// caller's own — initialState* mapped on create, the echoed
// (or freshly minted) trio on edit/state-change. The ONE
// builder all ai/human create/edit sites share.
export function memberDocumentBodyOf(
    type: MemberKind,
    trio: {
        readonly state: MemberState;
        readonly stateAt: string;
        readonly stateEventId: string;
    },
): Record<string, unknown> {
    return {
        type,
        state: trio.state,
        state_at: trio.stateAt,
        state_event_id: trio.stateEventId,
    };
}
```

Four call sites (grep `memberDocumentBodyOf(` in routes.ts —
create ×2, edit ×2), plus the two seed-plane sites Task 8
handles:

- ai create arm (:3053-3092): `const b =
  validateAIMemberCreateBody(body);` already exists — change
  `memberDocumentBodyOf('ai')` to:
```ts
                const memberBody = memberDocumentBodyOf('ai', {
                    state: b.initialState,
                    stateAt: b.initialStateAt,
                    stateEventId: b.initialStateEventId,
                });
```
- human create arm (:3179-3231): same with
  `validateHumanMemberCreateBody`'s result.
- ai edit arm (:3102-3161): the gate-check discard becomes a
  binding — `const e = validateAIMemberEditBody(body);` then:
```ts
                const memberBody = memberDocumentBodyOf('ai', {
                    state: e.state,
                    stateAt: e.stateAt,
                    stateEventId: e.stateEventId,
                });
```
- human edit arm (:3245-3314): same with
  `validateHumanMemberEditBody`.

Update each arm's "Gate-check only (result discarded)"
comment where the result is now bound.

- [ ] **Step 5.5: Flip MEMBERS_WIRING + rewrite the FREEZE
  comment**

api/routes.ts:548-583 — `lifecycle: 'trio'`; REPLACE the
comment block:

```ts
// The members wiring row — the ninth family, a 'trio' one
// since the states-address retirement. The old FREEZE-at-
// genesis refutation is RETIRED: its premise — a competing
// states/:id log receiving archive/reactivate events the
// document plane could never see — died with the address.
// Every lifecycle write now rides THIS document address:
// create folds initialState* into the members/:id pair, a
// state change PUTs a fresh trio, a detail edit echoes the
// current trio byte-identically and FOLDS by message_hash
// (appendMessagePair's dedup skip) instead of appending;
// documentLifecycleEvents' first-occurrence-wins dedup by
// state_event_id resolves any echo that does land. Global
// plane: no organization stamping (the members directory row
// carries no organization_id) — see documentWriteResponseSpec's
// registration-first consult (document-family.ts).
```

Also rewrite the two cross-references that cite the old
posture: the "NOT objectives' absence-as-active covenant"
sentence inside this same block region (routes.ts:562-563)
disappears with the rewrite above, and the objectives
cross-reference at routes.ts:508-509 (the ideas-region comment
naming member families' shared-log-WITH-genesis) is updated to
say both families now carry document trios.

- [ ] **Step 5.6: Run the member document tests**

```bash
node --test --strip-types tests/api-member-documents.test.ts
```
Expected: PASS. Repo-wide `./test` red is expected in member
adapters/seeds until Tasks 7-8 — record the failing list, same
discipline as Step 1.7.

- [ ] **Step 5.7: Commit**

```bash
git add api/validators.ts api/routes.ts \
  tests/api-member-documents.test.ts
git commit -m "widen member documents with lifecycle trio"
```

### Task 6: `deriveMemberStates` replaces `deriveMemberGenesis`

**Files:**
- Modify: `api/derive-states.ts:1677-1725` (the reader),
  `:2172-2189` + `:2210-2238` (both union slots), header
  comment source (c)
- Test: `tests/drift-phase15-cores-parity.test.ts` (member
  genesis visibility — verify unchanged),
  `tests/drift-states.test.ts` case 7b

**Interfaces:**
- Consumes: `documentPairsAt`, `documentLifecycleEvents`,
  `stateHistoryFrom` (derive-documents.ts);
  `canonicalUriPrefix(undefined, '/members/')` (the global
  prefix — organization undefined always returns the flat
  prefix; verified against message-pair.ts:143-157).
- Produces: `deriveMemberStates(db): Promise<StateEntity[]>` —
  global-plane, whole-roster, same union slot as the reader it
  replaces. Do NOT bend the per-org `trioFamiliesFor`
  machinery to fit (spec §3).

- [ ] **Step 6.1: Extend drift-states case 7b to fail first**

`tests/drift-states.test.ts:1053-1114` (AI member
archive/reactivate) — re-point the writes from
`PUT /states/:id` to `PUT /members/:id` carrying
`{type: 'ai', state, state_at, state_event_id}`. The derived
assertions (same event ids/ats/states/authors surface via
`GET /entity-states/:id/history`) stay IDENTICAL — that is the
parity contract.

Run: `node --test --strip-types tests/drift-states.test.ts`
Expected: the re-pointed case FAILS (document trio not yet
derived).

- [ ] **Step 6.2: Replace the reader**

api/derive-states.ts:1677-1725 — delete `AI_MEMBERS_PREFIX` /
`HUMAN_MEMBERS_PREFIX` consts and `deriveMemberGenesis`;
same slot gains:

```ts
const MEMBERS_DOCUMENT_PREFIX =
    canonicalUriPrefix(undefined, '/members/');

// The members-trio derivation (states-address retirement):
// REPLACES deriveMemberGenesis in the same global-plane union
// slot. Genesis and every later state change ride the
// members/:id document trio now — the create op folds
// initialState* into that document pair, so the op-body echo
// this replaced reader used to scan is no longer a derive
// source (it remains on the op body for the op-born
// visibility scan alone). Global-scoped like the reader it
// replaces — the per-org trioFamiliesFor machinery is NOT
// bent to fit (members are organizationNested: false).
export async function deriveMemberStates(
    db: DbAdapter,
): Promise<StateEntity[]> {
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            const [requests, responses] = await Promise.all([
                view.requests.getAllWhere(
                    'uri_prefix', MEMBERS_DOCUMENT_PREFIX,
                ),
                view.responses.getAllWhere(
                    'uri_prefix', MEMBERS_DOCUMENT_PREFIX,
                ),
            ]);
            const pairs = documentPairsAt(
                requests, responses, MEMBERS_DOCUMENT_PREFIX,
            );
            const byMember = Map.groupBy(
                pairs, (pair) => pair.uriId,
            );
            const rows: StateEntity[] = [];
            for (const [memberId, memberPairs] of byMember) {
                rows.push(...stateHistoryFrom(
                    documentLifecycleEvents(memberPairs),
                    memberId,
                ));
            }
            return rows.sort(byIdAscending);
        },
    );
}
```

Note the indexed `getAllWhere` reads — the replaced reader's
whole-plane `getAll()` is NOT reproduced (the members prefix
is one indexed read; match `workOrderClaimSourcesFor`'s
indexed-read posture).

Both union slots swap the name: `deriveStates` (:2172-2189)
and `deriveStatesFor` (:2210-2238) call `deriveMemberStates`
where they called `deriveMemberGenesis` (rename
`memberGenesisRows` → `memberStateRows`). Header comment
source (c) becomes:
```ts
//   (c) deriveMemberStates — the members/:id document trio
//       (genesis at create + every later change; the
//       states-address retirement's replacement for the old
//       create-op genesis echo).
```

- [ ] **Step 6.3: Verify parity + visibility pins**

```bash
node --test --strip-types tests/drift-states.test.ts \
  tests/drift-phase15-cores-parity.test.ts
```
Expected: case 7b PASSES; the phase15 member-genesis
visibility pins PASS UNCHANGED (op bodies still carry
`initialStateEventId` — drift flag 10). Any phase15 red here
means the create-op body lost the trio somewhere — fix the
route arm, not the test.

- [ ] **Step 6.4: Commit**

```bash
git add api/derive-states.ts tests/drift-states.test.ts
git commit -m "derive member states from document trios"
```

### Task 7: Member client adapters — trio echo + state-change
### repoint

**Files:**
- Modify: `api/types.ts:665-731` (`HumanMember`), the `AIMember`
  class beside it, and add `MemberStateDetail` beside
  `IdeaStateDetail`
- Modify: `web-app/app/adapters/state-events.ts:491-531`
  (`getMemberState` / `getMemberStates`)
- Modify: `web-app/app/adapters/members.ts` (:82-121 map
  builder, :213-236 `putHumanMember`, :274-281 state change)
- Modify: `web-app/app/adapters/ai-members.ts` (:119-166)
- Modify: `web-app/members/detail.ts:466-567` (both save
  paths)
- Test: `tests/adapters-members.test.ts`,
  `tests/adapters-ai-members.test.ts`,
  `tests/adapters-members-union.test.ts`

**Interfaces:**
- Consumes: `deriveMemberStates` transitively via `GET /states`
  / `GET /entity-states/:id/history`; Task 5's widened edit
  bodies.
- Produces: `MemberStateDetail { state, stateAt,
  stateEventId }` (api/types.ts); `getMemberStateDetail(ctx,
  memberId)` and `getMemberStateDetails(ctx)` (state-events.ts,
  widened siblings — keep the bare `getMemberState(s)` ONLY if
  other callers still need them; grep first, retire if
  zero-caller); `HumanMember`/`AIMember` constructors take
  `MemberStateDetail` and expose `stateValue()`,
  `stateAtValue()`, `stateEventIdValue()` (the Idea accessor
  precedent, api/types.ts:1459-1471);
  `putHumanMember(ctx, id, detail, stateEcho, pii?)`,
  `putAIMember(ctx, id, input, stateEcho)`;
  `postHumanMemberStateChange` / `postAIMemberStateChange` PUT
  `members/:id` with a fresh trio.

- [ ] **Step 7.1: Re-pin the adapter tests first**

`tests/adapters-members.test.ts` /
`tests/adapters-ai-members.test.ts` — the state-change tests
assert `postStateEvent`-shaped writes; re-pin to assert ONE
`PUT members/:id` whose body is
`{type: 'human'|'ai', state, state_at, state_event_id}` with a
fresh id/at. Comments at adapters-members.test.ts:92,
adapters-ai-members.test.ts:120,
adapters-members-union.test.ts:161/324 that cite
"PUT /states/:id as the wire-reachable archive path" are
rewritten to name `PUT members/:id`. Edit-path tests re-pin to
the widened edit body (echoed trio present).

Run both files. Expected: FAIL.

- [ ] **Step 7.2: Widen the reads + domain classes**

api/types.ts — add beside `IdeaStateDetail`:
```ts
export interface MemberStateDetail {
    readonly state: MemberState;
    readonly stateAt: string;
    readonly stateEventId: string;
}
```
`HumanMember` (:665-731) and `AIMember`: constructor's
`state: MemberState` param becomes
`state: MemberStateDetail`; store `#state`, `#stateAt`,
`#stateEventId`; add accessors mirroring `Idea`
(api/types.ts:1459-1471):
```ts
    stateAtValue(): string {
        return this.#stateAt;
    }

    stateEventIdValue(): string {
        return this.#stateEventId;
    }
```

web-app/app/adapters/state-events.ts — widen
`getMemberState` → `getMemberStateDetail` and
`getMemberStates` → `getMemberStateDetails`, mirroring the
`getIdeaStateDetail(s)` shape (:286-340) with
`assertMemberState`. Grep every `getMemberState(` /
`getMemberStates(` caller (members.ts:123-140 map loader,
members-union.ts, workbox, dashboard …): callers that only
need the bare state read `.state` off the detail; if NO caller
needs the bare readers afterward, delete them (zero-caller
code retires with its subject) — otherwise keep both, with the
bare one delegating.

- [ ] **Step 7.3: Repoint the write adapters**

members.ts:
```ts
export async function putHumanMember(
    ctx: RequestContext,
    id: string,
    detail: Omit<HumanMemberEntity, 'id'>,
    stateEcho: MemberStateDetail,
    pii?: Omit<IdentityPiiEntity, 'id'>,
): Promise<void> {
    await ctx.POST(`human-members/${id}`, {
        detail: detail as unknown as
            Record<string, unknown>,
        state: stateEcho.state,
        stateAt: stateEcho.stateAt,
        stateEventId: stateEcho.stateEventId,
    });
    if (pii !== undefined) {
        await ctx.PUT(`identities/${id}/pii`, { ...pii });
    }
    humanMemberChanges.notify();
}

// A state change is an honest document write: PUT members/:id
// with a FRESH trio — the postIdeaStateChange composition,
// pointed at the members document address. Save stays
// decomposed (Phase 10 Task 2): detail, PII, and state remain
// independent writes.
export async function postHumanMemberStateChange(
    ctx: RequestContext,
    id: string,
    state: MemberState,
): Promise<void> {
    await ctx.PUT(`members/${id}`, {
        type: 'human',
        state,
        state_at: nowUtc(),
        state_event_id: generateCryptoSafeBase62(),
    });
    humanMemberChanges.notify();
}
```
ai-members.ts mirrors byte-parallel (`putAIMember` gains
`stateEcho`; `postAIMemberStateChange` PUTs with
`type: 'ai'`). Drop the `postStateEvent` imports from both.
`postHumanMemberCreation` / `postAIMemberCreation` are
UNCHANGED (create bodies keep `initialState*` — drift
flag 10).

- [ ] **Step 7.4: Thread the echo through the save paths**

web-app/members/detail.ts — `saveHumanMember` (:466-514):
```ts
        await putHumanMember(
            ctx, memberId, nextDetail, {
                state: s.member.stateValue(),
                stateAt: s.member.stateAtValue(),
                stateEventId: s.member.stateEventIdValue(),
            }, piiPatch,
        );
        if (stateChanged) {
            await postHumanMemberStateChange(
                ctx, memberId, s.draft.state,
            );
        }
```
`saveAIMember` (:516-567) mirrors. The map builders
(members.ts:82-121 and the ai/union siblings) construct the
domain objects from `getMemberStateDetails` entries instead of
bare states — update `buildHumanMemberMap`'s `stateMap`
parameter type and its call sites.

- [ ] **Step 7.5: Run the member adapter tests + validate**

```bash
node --test --strip-types tests/adapters-members.test.ts \
  tests/adapters-ai-members.test.ts \
  tests/adapters-members-union.test.ts
```
Expected: PASS.

- [ ] **Step 7.6: Commit**

```bash
git add api/types.ts web-app/app/adapters/ \
  web-app/members/detail.ts tests/
git commit -m "echo member trio on edits, PUT state changes"
```

### Task 8: System-member seed fold + stage-2 pins

**Files:**
- Modify: `api/mock-data/seed-message-pairs.ts` (:484-502
  `memberStateEvents` DELETE, :1710-1719 its invocation loop
  DELETE, :2319-2329 `systemMemberPair` body, :2372-2395
  `systemStateEventPair` DELETE, member-bundle
  `memberDocumentBodyOf` call sites)
- Modify: `api/mock-data.ts` (:414-422 mock system-member op,
  :784-789 genesis append DELETE, :1189-1199 bootstrap
  system-member op, :1245-1250 bootstrap genesis append
  DELETE)
- Modify: `tests/mock-data-pairs.test.ts` (1514→1513 + comment;
  bootstrap 14→13 + comment + the `/states/` sub-assertion at
  :977-981), `tests/api-identity-document.test.ts:23-31`
  (stale FREEZE echo comment)

**Interfaces:**
- Consumes: Task 5's `memberDocumentBodyOf(type, trio)`.
- Produces: the system member's members/:id pair carries the
  trio in BOTH seed paths; both bare genesis `states/:id`
  pairs are gone. Mock pin 1513; bootstrap pin 13. Derived log
  UNCHANGED (same event ids/ats/states/authors — the genesis
  event id `seed-member-<SYSTEM>-active` and
  `'bootstrap-system-active'` now ride the document trio).

- [ ] **Step 8.1: Fold the mock seed**

seed-message-pairs.ts — every seed-plane
`memberDocumentBodyOf(` call site (grep; the system-member
pair at :2319-2329 plus the per-member create bundles) passes
the trio it already knows:
- per-member bundles: from the seed body's own
  `initialState*` values (`seed-member-${id}-${state}`,
  `MOCK_SEED_TIMESTAMP`);
- the system member (both paths):
```ts
            body: memberDocumentBodyOf('system', {
                state: 'active',
                stateAt: MOCK_SEED_TIMESTAMP,
                stateEventId:
                    `seed-member-${SYSTEM_MEMBER_ID}-active`,
            }),
```
- bootstrap's `systemMemberPair`: trio
  `{state: 'active', stateAt: systemStateEventAt,
  stateEventId: bootstrapSystemStateEventId}` — HOIST the
  `const systemStateEventAt = nowUtc();` mint (currently at
  the dead pair's formation, :2372) ABOVE the
  `systemMemberPair` formation so the `at` survives; then
  DELETE `systemStateEventPair` and its append
  (api/mock-data.ts:1245-1250). Keep the
  `bootstrapSystemStateEventId` constant (:1166) — it now
  names the document-trio event.
- DELETE `memberStateEvents` (:484-502), its invocation loop
  (:1710-1719), and its pass-2 append
  (api/mock-data.ts:784-789 — the `memberStateEvents.map`
  entry ONLY; `mockStateEvents.map` stays until stage 4).
- api/mock-data.ts:414-422 and :1189-1199: the
  `postMemberDocumentOp(adapter, SYSTEM_MEMBER_ID,
  memberDocumentBodyOf('system', {...}), …)` calls pass the
  same trios as their pass-1 pair formations —
  byte-identical bodies or `requirePair` hash lookups break.

- [ ] **Step 8.2: Re-pin the counts**

tests/mock-data-pairs.test.ts — `EXPECTED_PAIR_COUNT`
1514→1513; rewrite the accounting comment's "+ 1 system-member
genesis pair" term (folded into the members/:id trio).
Bootstrap: 14→13 at :975-976; delete the
`uri_prefix === '/states/'` sub-assertion (:977-981) and
re-pin it as: the system member's `members/:id` pair body
carries `state_event_id: 'bootstrap-system-active'`. Update
the 13-term narration comment. Rewrite
tests/api-identity-document.test.ts:23-31's FREEZE-echo
comment (identities/:id itself gains NO trio — only the
premise sentence changes).

- [ ] **Step 8.3: Stage boundary — validate + oracle**

```bash
./validate
```
Expected: green. Oracle diff vs stage 1: NO further delta
(the two genesis events keep their ids/ats/authors — only
their carrying pairs changed).

- [ ] **Step 8.4: Commit**

```bash
git add api/mock-data.ts api/mock-data/seed-message-pairs.ts \
  tests/
git commit -m "fold system-member genesis into members trio"
```

---

# Stage 3 — Work-order release op (spec §4)

### Task 9: Release op — validator, route, specs, pair wiring

**Files:**
- Modify: `api/validators.ts` (beside
  `validateWorkOrderClaimBody`, :3852-3892)
- Modify: `api/routes.ts` (op beside `postWorkOrderClaimOp`
  :1984-2075; route beside the claim route :4183-4290;
  `WRITE_RESPONSE_SPECS` :2558-2617)
- Modify: `api/message-pair.ts:578-624`
  (`PAIR_WIRED_ROUTE_PATTERNS`)
- Test: `tests/api-work-order-release.test.ts` (new)

**Interfaces:**
- Consumes: `workOrderDocumentHeadFor` (the 404/org fence) and
  `EntityNotFoundError`; `claim_released` ALREADY exists in
  the closed `CLAIM_STATES` vocabulary
  (api/work-order-claims.ts) — invent nothing. The claim-
  history readers (`latestClaimEvent`, `isExpiredAsOf`,
  `priorClaimCandidates`) are Task 10's replay consumers, not
  the gate's.
- Produces: `WorkOrderReleaseBody { releaseEventId: string;
  releaseAt: string }` + `validateWorkOrderReleaseBody`;
  `postWorkOrderReleaseOp(db, workOrderId, body, actor,
  organization, pair?)`; route
  `POST work-orders/:id/release` → 204;
  `WRITE_RESPONSE_SPECS['work-orders/:id/release'] =
  { status: 204 }`; `PAIR_WIRED_ROUTE_PATTERNS` entry (the
  pair-coverage exit test
  `tests/pair-write-coverage.test.ts:56-75` fails mechanically
  without it — that is the enforcement, not a task).

- [ ] **Step 9.1: Write the failing gate tests**

Create `tests/api-work-order-release.test.ts` mirroring
`tests/api-work-order-claim.test.ts`'s helper idiom
(db/token/req/claim setup — copy its top block). Cases:

```ts
test('release of a live claim is 204 and the claim history'
+ ' shows claim_released', async () => {
    // claim via POST work-orders/:id/claim (the file's own
    // claim helper), then:
    const res = await handleRequest(db, req(
        'POST', `/work-orders/${woId}/release`, token, {
            releaseEventId: 'rel-ev-1',
            releaseAt: nowUtc(),
        },
    ));
    assert.equal(res.status, 204);
    // GET /entity-states/:id/history: latest claim-vocabulary
    // event is {id: 'rel-ev-1', state: 'claim_released',
    // member_id: <releasing actor>, at: <releaseAt>}
});

test('release with no live claim is an idempotent 204'
+ ' no-op (no claim_released event derives)', async () => {
    const res = await handleRequest(db, req(
        'POST', `/work-orders/${woId}/release`, token, {
            releaseEventId: 'rel-ev-2',
            releaseAt: nowUtc(),
        },
    ));
    assert.equal(res.status, 204);
    // history carries NO event with id 'rel-ev-2'
});

test('release of another member\'s live claim succeeds'
+ ' (member-tier, today\'s open-release posture)', async () => {
    // claim as member A, release as member B (mint a second
    // member-tier token the way the claim file's foreign-actor
    // case does); assert 204 and a claim_released row authored
    // by B in the derived history.
    assert.equal(res.status, 204);
});

test('release body validation: empty id and bad timestamp'
+ ' are 400', async () => {
    for (const body of [
        { releaseEventId: '', releaseAt: nowUtc() },
        { releaseEventId: 'rel-bad', releaseAt: 'not-a-time' },
        { releaseEventId: 'rel-bad' },
    ]) {
        const res = await handleRequest(db, req(
            'POST', `/work-orders/${woId}/release`, token, body,
        ));
        assert.equal(res.status, 400);
    }
});

test('release of an unknown work order is 404', async () => {
    const res = await handleRequest(db, req(
        'POST', '/work-orders/no-such-wo/release', token, {
            releaseEventId: 'rel-ev-x',
            releaseAt: nowUtc(),
        },
    ));
    assert.equal(res.status, 404);
});
```

Run: `node --test --strip-types \
tests/api-work-order-release.test.ts`
Expected: FAIL (route 404s — no entry yet).

- [ ] **Step 9.2: Add the validator**

api/validators.ts, directly beside
`validateWorkOrderClaimBody`:

```ts
const WORK_ORDER_RELEASE_KEYS: readonly string[] = [
    'releaseEventId', 'releaseAt',
];

export interface WorkOrderReleaseBody {
    readonly releaseEventId: string;
    readonly releaseAt: string;
}

// Gate for POST /work-orders/:id/release. The caller mints
// the event id and timestamp (the claim-body precedent);
// authorship is server-derived (actor) — never supplied by
// the caller. A single terminal event, so no expire pair.
export function validateWorkOrderReleaseBody(
    body: Record<string, unknown>,
): WorkOrderReleaseBody {
    assertOnlyKeys(
        body, WORK_ORDER_RELEASE_KEYS, 'WorkOrderReleaseBody',
    );
    const releaseEventId = pickString(body, 'releaseEventId');
    if (releaseEventId === '') {
        throw new ValidationError(
            'WorkOrderReleaseBody.releaseEventId'
            + ' must be non-empty',
        );
    }
    const releaseAt = validateTimestampField(
        body, 'releaseAt', 'WorkOrderReleaseBody',
    );
    return { releaseEventId, releaseAt };
}
```

- [ ] **Step 9.3: Add `postWorkOrderReleaseOp`**

api/routes.ts, directly beside `postWorkOrderClaimOp`
(:1984-2075) — its single-transaction shape and its
pair-on-every-exit rule, with ONE deliberate divergence the
comment must own: claim's in-transaction read-decide exists to
pick between 409 / no-op / act, but release has NO 409 branch
and appends its pair on both remaining branches, so a gate
decision would change nothing observable — the live-or-not
decision is made ONCE, at derive time, by `applyReleasePair`
(Task 10), from the same (at, id)-ordered history:

```ts
// Release a work order's claim — the claim op's single-
// transaction, pair-on-every-exit shape. Unlike claim, no
// gate decision exists here: release has no 409 branch, and
// the pair appends whether or not a live claim exists (a
// wired route must never resolve a pair the transaction
// never stored), so deciding liveness at the gate would
// change nothing observable. The decision is made ONCE, at
// derive time (applyReleasePair): a live unexpired claim as
// of releaseAt derives the claim_released event; otherwise
// the pair derives zero events — the idempotent no-op. 204
// either way. The head read below is the 404 existence and
// org fence, nothing more. Release stays open to any org
// member (today's unclaim posture; the UI shows Unclaim only
// when claimed).
export async function postWorkOrderReleaseOp(
    db: DbAdapter,
    workOrderId: Id,
    body: Record<string, unknown>,
    _actor: Id,
    organization: Id,
    pair?: MessagePair,
): Promise<void> {
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            validateWorkOrderReleaseBody(body);
            const wo = await workOrderDocumentHeadFor(
                view, organization, workOrderId,
            );
            if (wo === null) {
                throw new EntityNotFoundError(
                    'work_orders', workOrderId,
                );
            }
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}
```

NOTE the deliberate shape: unlike claim, release has NO
foreign-claim 409 and NO branch that skips the append — the
live-or-not decision is REPLAYED at derive time
(Task 10's `applyReleasePair`), deterministically, from the
same (at, id)-ordered history the gate would read. The gate
itself only guards existence (404) and body validity (400).
This keeps the op idempotent (a resend folds by message_hash)
and keeps gate and derive from ever disagreeing. The head
read stays even though `lockTimeout` is only consumed at
replay: it IS the 404 existence fence.

- [ ] **Step 9.4: Wire the route + specs + pair set**

routes.ts, beside the claim route (:4269-4280):
```ts
    // Member-tier POST — /work-orders carries POST in
    // MEMBER_VERBS. See postWorkOrderReleaseOp for the
    // transaction shape.
    route('work-orders/:id/release', {
        post: (db, p, body, actor, pair, organization) =>
            postWorkOrderReleaseOp(
                db, param(p, 0), body, actor,
                requireOrganization(organization), pair,
            ),
    }),
```
`WRITE_RESPONSE_SPECS` (:2558-2617):
```ts
    'work-orders/:id/release': { status: 204 },
```
api/message-pair.ts `PAIR_WIRED_ROUTE_PATTERNS` (:578-624):
add `'work-orders/:id/release',` directly after
`'work-orders/:id/transition',`. NEVER add it to
`DOCUMENT_CLASS_ROUTE_PATTERNS` — it is an operation address
(uriId always '').

- [ ] **Step 9.5: Run the gate tests**

```bash
node --test --strip-types tests/api-work-order-release.test.ts \
  tests/pair-write-coverage.test.ts
```
Expected: the 404/400/204-status cases PASS; the
history-derivation assertions still FAIL (no derive leg yet —
Task 10). pair-write-coverage PASSES (entry added). If you
prefer strictly green commits, mark the two history assertions
with the failing-test-first comment and land Tasks 9+10 as two
commits in one validate window (stage boundary is the green
gate).

- [ ] **Step 9.6: Commit**

```bash
git add api/validators.ts api/routes.ts api/message-pair.ts \
  tests/api-work-order-release.test.ts
git commit -m "add work-order release op and route"
```

### Task 10: Release derive legs

**Files:**
- Modify: `api/derive-states.ts` — `:947-969` (patterns),
  `:582-647` (`bodyNamesStateEvent`), `:653-833`
  (`organizationHasOpBornEvent`), `:1161-1306`
  (`applyClaimPair` region + `WorkOrderAction` +
  `replayWorkOrderOperations`), `:1318-1426`
  (`deriveWorkOrderLifecycle`), `:1475-1548`
  (`workOrderClaimSourcesFor`)
- Test: `tests/derive-work-order-lifecycle-for.test.ts`,
  `tests/derive-states-work-orders.test.ts`

**Interfaces:**
- Consumes: Task 9's route (tests drive it end-to-end) and
  body shape `{releaseEventId, releaseAt}`.
- Produces: `WORK_ORDER_RELEASE_PATTERN`; a `'release'`
  `WorkOrderAction` variant + `applyReleasePair`; release
  prefix maps/reads in `deriveWorkOrderLifecycle` and
  `workOrderClaimSourcesFor`; `'release'` in the op-born probe
  loop + `releaseEventId` in `bodyNamesStateEvent`.
  `stateEventVisibilityFor` and `workOrderLifecycleStatesFor`
  need NO direct edits (they compose the above — verified).

- [ ] **Step 10.1: Extend the derive tests to fail first**

`tests/derive-work-order-lifecycle-for.test.ts` — the
standalone-unclaim cases (:316-375, :385-438) prove the split
via `PUT /states/:id`; re-point them to
`POST work-orders/:id/release` (same derived expectations:
a `claim_released` row with the release body's id/at and the
releasing actor as author; a later reclaim sees the release).
Add one release-composition case to
`tests/derive-states-work-orders.test.ts`: claim → release →
reclaim through the ops; assert the (at, id)-ordered history
is `claimed, claim_released, claimed`, and a release POSTed
with NO live claim derives zero events.

Run both. Expected: FAIL.

- [ ] **Step 10.2: Pattern + body-name legs**

derive-states.ts:947-969, beside the claim pattern:
```ts
const WORK_ORDER_RELEASE_PATTERN =
    /^\/organizations\/[^/]+\/work-orders\/([^/]+)\/release\/$/;
```
`bodyNamesStateEvent` (:582-596) gains, beside
`transitionEventId`:
```ts
    if (body['releaseEventId'] === eventId) return true;
```
`organizationHasOpBornEvent`'s probe loop (:800):
```ts
        for (const sub of [
            'claim', 'transition', 'release',
        ] as const) {
```

- [ ] **Step 10.3: The replay leg**

Beside `applyTransitionPair` (:1214-1244) add — mirroring
`applyClaimPair`'s wall-clock-free decision idiom
(:1161-1208: `priorClaimCandidates` + `latestClaimEvent` +
`isExpiredAsOf` against the OP's own timestamp, never
`Date.now()`):

```ts
// Replays postWorkOrderReleaseOp's own decision from the pair
// body: a live unexpired claim as of releaseAt → the
// claim_released event; otherwise zero events (the gate's
// idempotent no-op — its pair still exists, and derives
// nothing). Deciding here, not at the gate, keeps gate and
// derive from ever disagreeing about liveness.
function applyReleasePair(
    replayed: StateEntity[],
    entityPairs: readonly DocumentPair[],
    statesAddressEvents: readonly StateEntity[],
    release: OperationPair,
    workOrderId: Id,
): void {
    const releaseEventId = pickString(
        release.body, 'releaseEventId',
    );
    const releaseAt = pickString(release.body, 'releaseAt');
    const lockTimeout = lockTimeoutAsOf(
        entityPairs, release.at,
    );
    const prior = latestClaimEvent(
        priorClaimCandidates(
            replayed, statesAddressEvents, release,
        ),
        workOrderId,
    );
    const priorLive = prior !== null
        && prior.state === 'claimed'
        && !isExpiredAsOf(releaseAt, prior.at, lockTimeout);
    if (!priorLive) return;
    replayed.push({
        id: releaseEventId,
        entity_id: workOrderId,
        state: 'claim_released',
        member_id: release.requesterIdentityId,
        at: releaseAt,
    });
}
```

`WorkOrderAction` (:1246-1256) gains
`| { readonly kind: 'release'; readonly pair: OperationPair }`;
`replayWorkOrderOperations` gains a `releasePairs` parameter
(after `claimPairs`, before `transitionPairs` — keep the
work-order-op reading order claim/release/transition
everywhere), maps them into the actions array, and dispatches:
```ts
        } else if (action.kind === 'release') {
            applyReleasePair(
                events, entityPairs, statesAddressEvents,
                action.pair, workOrderId,
            );
        } else {
```

- [ ] **Step 10.4: Thread the source reads**

`deriveWorkOrderLifecycle` (:1318-1426): a
`releasePrefixByWorkOrder` map built in the same request scan
(mirror the claim match block verbatim with
`WORK_ORDER_RELEASE_PATTERN`); its keys join the
`workOrderIds` set; per work order, `releasePairs` reads via
`operationPairsAt` exactly as claim does; thread into
`replayWorkOrderOperations`.
`workOrderClaimSourcesFor` (:1475-1548): a `releasePrefix`
read mirroring the claim/transition prefix reads
(`'/work-orders/' + workOrderId + '/release/'`); thread its
`operationPairsAt` result through. That transitively updates
`workOrderClaimHistoryFor` and `workOrderLifecycleStatesFor`.

- [ ] **Step 10.5: Run + commit**

```bash
node --test --strip-types \
  tests/derive-work-order-lifecycle-for.test.ts \
  tests/derive-states-work-orders.test.ts \
  tests/api-work-order-release.test.ts \
  tests/drift-phase14-cores-parity.test.ts
```
Expected: ALL PASS (the phase14 pre-tx/in-tx parity pins for
`workOrderClaimHistoryFor` must stay green — the release read
must be view-safe like its siblings).

```bash
git add api/derive-states.ts tests/
git commit -m "replay release ops in work-order lifecycle"
```

### Task 11: Client unclaim repoint + stage-3 pins

**Files:**
- Modify: `web-app/app/adapters/work-orders-deletions.ts`
  (whole file, 25 lines)
- Modify: `tests/adapters-work-orders.test.ts:746-761`,
  `tests/api-work-order-claim.test.ts:202-243`,
  `tests/drift-work-orders.test.ts` (Leg 8, :1434-1443),
  `tests/drift-states.test.ts` (cases 4b/4c/4d),
  `tests/workbox-inbox.test.ts:300` (comment),
  `tests/api-work-order-document.test.ts:28-35` (comment)

**Interfaces:**
- Consumes: Task 9's route; the claim adapter's mint idiom
  (work-orders-mutations.ts:327-342).
- Produces: `deleteWorkOrderClaim` posts the release op. The
  name and signature stay (`delete` prefix preserves
  caller-facing continuity — the file's own documented
  posture). This CLOSES the standalone-unclaim TOCTOU the old
  bare event-append tolerated; the transition op's own
  client-decided implicit release is UNTOUCHED (spec §4 names
  only unclaim).

- [ ] **Step 11.1: Re-pin the adapter test first**

tests/adapters-work-orders.test.ts:746-761 — assert ONE
`POST work-orders/:id/release` with
`{releaseEventId: <non-empty>, releaseAt: <RFC-3339>}`.
Run; expect FAIL.

- [ ] **Step 11.2: Repoint the adapter**

```ts
import type { RequestContext } from './shared.ts';
import {
    generateCryptoSafeBase62,
} from '../../../shared/crypto-safe-base62.ts';
import { nowUtc } from './shared.ts';
import {
    notifyWorkOrderChanges,
} from './work-orders-mutations.ts';

// Releases the live claim via the named release op — the
// caller's intent is "stop the claim". The read-decide-append
// lives server-side (postWorkOrderReleaseOp), closing the
// old funnel's decide-client-side race; the `delete` prefix
// preserves caller-facing continuity (the user action is
// "release the work order").
export async function deleteWorkOrderClaim(
    ctx: RequestContext,
    workOrderId: string,
): Promise<void> {
    await ctx.POST(`work-orders/${workOrderId}/release`, {
        releaseEventId: generateCryptoSafeBase62(),
        releaseAt: nowUtc(),
    });
    notifyWorkOrderChanges();
}
```
(Resolve the two import paths against the file's existing
neighbors — `generateCryptoSafeBase62`/`nowUtc` are imported
throughout `web-app/app/adapters/`; copy an existing import
line, do not guess.)

- [ ] **Step 11.3: Re-pin the drift oracles' unclaim legs**

- drift-work-orders.test.ts Leg 8 (:1434-1443): the bare
  `PUT /states/:id` unclaim becomes
  `POST work-orders/:id/release`; the surrounding
  replay-vs-derive parity assertion (:1445-1456) is PRESERVED
  as-is.
- drift-states.test.ts 4b (:468-611), 4c (:612-662),
  4d (:663-779): every release/unclaim `PUT /states/:id`
  becomes the release op; derived expectations unchanged
  (same event ids/ats/authors — the test mints them).
- Comment-only rewrites: workbox-inbox.test.ts:300 and
  api-work-order-document.test.ts:28-35 now name the release
  op as the unclaim path.

- [ ] **Step 11.4: Stage boundary — validate + oracle**

```bash
./validate
```
Expected: green. Oracle diff vs stage 2: NO delta (no seeded
release ops exist; live-path shape changes only).

- [ ] **Step 11.5: Commit**

```bash
git add web-app/app/adapters/work-orders-deletions.ts tests/
git commit -m "repoint unclaim to the release op"
```

---

# Stage 4 — Address deletion (spec §5/§6)

Order inside the stage: seeds first (12), then the server
surface (13), then the derive plane (14), then test
re-baselines (15), then the snapshot bump (16), then docs
(17-21). Commits 12-16 may be individually red on `./test`
mid-stage (each deletes half of a coupled surface); the stage
boundary after Task 16 is the green gate. Do not push
mid-stage.

### Task 12: Seed reshape — traces become transition op pairs

**Files:**
- Modify: `api/mock-data/seed-message-pairs.ts` —
  `:1245-1265` (`MockDataInvocation`), `:1990-2073`
  (`formSeedPair`/`documentSeedResponse`), `:1651-1676` (the
  trace loop), `:932-947` (`stateEventSeedBody` DELETE),
  `:521-564` (`mockStateFieldValues` fold), the :94 stale
  count comment
- Modify: `api/mock-data.ts` — `:654` region, `:772-804`,
  `:900-905` (pass-2 drive sites)
- Modify: `api/routes.ts:2858-2874`
  (`WRITE_RESPONSE_SPECS['states/:id/field-values/:fvid']`
  DELETE)
- Test: `tests/mock-data-pairs.test.ts` (counts land in
  Task 15; this task keeps the suite compiling)

**Interfaces:**
- Consumes: `postWorkOrderTransitionOp`
  (api/routes.ts:2086-2107) — never called from the seed
  plane today; `validateWorkOrderTransitionBody` becomes the
  gate every seeded trace passes.
- Produces: `MockDataInvocation` gains `readonly op?: true`
  (an op-shaped POST that also carries `idParams`);
  861 invocations at `'work-orders/:id/transition'` keyed
  `seedPairKey('work-orders/:id/transition', event.id)`;
  WO01's Review/Complete transition bodies carry the 7 folded
  field values; the 7 leaf invocations and their response
  spec die.

- [ ] **Step 12.1: Break the PUT/POST binary in the seed
  former**

seed-message-pairs.ts:1245-1265 — `MockDataInvocation` gains:
```ts
    // An operation-shaped POST at an id-carrying pattern
    // (work-orders/:id/transition): idParams fill the :id
    // slots for the ADDRESS (uriId stays '' — messageAddress
    // keys on the LAST segment), but the method is POST and
    // the response is the op's own {status: 204} spec.
    readonly op?: true;
```
formSeedPair (:1990-2073):
```ts
    const method = inv.op === true || idParams === undefined
        ? 'POST'
        : 'PUT';
    const response =
        inv.op === true || idParams === undefined
            ? { status: 204, body: undefined }
            : documentSeedResponse(
                inv, routeSegments, pathSegments,
            );
```
Update the two comments this touches (the idParams-presence
framing in the interface comment, and the "Every bare
collection-POST family" note). `messageAddress` needs NO
change (verified: `'transition'` last segment → uriId '').

- [ ] **Step 12.2: Reshape the 861 trace invocations 1:1**

Replace the loop at :1651-1676 (and rewrite its stale
"211 … = 860" comment — the real count is 212 + 649 = 861):

```ts
    // States-address retirement: every trace event (212 hand-
    // authored + 649 generated = 861) reshapes 1:1 into a
    // work-orders/:id/transition op-shaped pair — the LIVE op
    // shape, nothing invented: transitionEventId = the event's
    // own id, transitionAt = its at, targetState = its node
    // state, requester = the event's OWN member. NOT creation
    // ops: the creation gate's exact-3 'claimed'-slot
    // semantics do not match historical traces (zero seeded
    // claim events; the in-flight fixtures are 2- and
    // 3-event). WO01's Review/Complete events carry the folded
    // field values (mockStateFieldValues below).
    const traceEvents = [
        ...workOrderStateEvents,
        ...leadToCloseWorkload.stateEvents,
    ];
    for (const event of traceEvents) {
        invocations.push({
            key: seedPairKey(
                'work-orders/:id/transition', event.id,
            ),
            routePattern: 'work-orders/:id/transition',
            idParams: [event.entity_id],
            op: true,
            organization: STARK_ORGANIZATION,
            requesterIdentityId: event.member_id,
            body: transitionSeedBody(event),
        });
    }
```

with, beside the deleted `stateEventSeedBody` (:932-947):

```ts
// The live POST work-orders/:id/transition body this SAME
// historical event would have carried: 1:1 field mapping, no
// invention. fieldValues is empty except WO01's Review (6)
// and Complete (1) events, which carry the folded old leaf
// values; release is null — traces never released claims
// (zero seeded claim events).
export function transitionSeedBody(
    event: StateEntity,
): Record<string, unknown> {
    return {
        transitionEventId: event.id,
        targetState: event.state,
        fieldValues: seedFieldValuesFor(event.id),
        release: null,
        transitionAt: event.at,
    };
}

function seedFieldValuesFor(
    stateEventId: Id,
): Record<string, unknown>[] {
    return mockStateFieldValues
        .filter((fv) => fv.state_event_id === stateEventId)
        .map((fv) => ({
            id: fv.id,
            fields: {
                state_event_id: fv.state_event_id,
                attribute_id: fv.attribute_id,
                value: fv.value,
            },
        }));
}
```

CHECK the `fields` shape against
`validateStateFieldValueEntity` (what the transition
validator applies per row, validators.ts:3673-3752) and
against the OLD leaf pair bodies before writing — the fold
target is "byte-what-the-live-op-would-store"; the
`state_event_id === transitionEventId` pin (:3742-3752) holds
by construction here. Delete the 7 leaf invocations (grep
`'states/:id/field-values/:fvid'` in this file) and
`stateEventSeedBody`. KEEP `mockStateFieldValues` itself —
it now feeds the fold (update its :521 comment).

- [ ] **Step 12.3: Drive pass 2 through the transition op**

api/mock-data.ts — replace the two `appendMessagePair` trace
sites (:772-789 `mockStateEvents.map`, :900-905
`leadToCloseData.stateEvents.map`) and the leaf site
(:790-804) with op-driven calls mirroring the
`postWorkOrderDocumentOp` precedent (:747-757):

```ts
        ...mockStateEvents.map(r =>
            postWorkOrderTransitionOp(
                adapter,
                r.entity_id,
                transitionSeedBody(r),
                r.member_id,
                requirePair(
                    pairs,
                    seedPairKey(
                        'work-orders/:id/transition', r.id,
                    ),
                ),
            ),
        ),
```
(and the identical shape for `leadToCloseData.stateEvents`).
Import `postWorkOrderTransitionOp` and `transitionSeedBody`;
drop the now-unused `mockStateFieldValues` append block and
its import if unused here. Every seeded trace now passes
`validateWorkOrderTransitionBody` — a real gate the bare
appends bypassed.

- [ ] **Step 12.4: Delete the leaf response spec**

api/routes.ts:2858-2874 — delete the
`'states/:id/field-values/:fvid'` entry AND its
SEED-FORMATION CONSTRAINT comment (its stated reason to
survive — seed re-formation — died in Step 12.2).

- [ ] **Step 12.5: Sanity-run the reshape**

```bash
node --test --strip-types tests/mock-data-pairs.test.ts \
  tests/drift-state-field-values.test.ts
```
Expected: mock-data-pairs count FAILS (1513 → re-pinned in
Task 15 at the measured value; expected ≈1506);
drift-state-field-values PASSES UNCHANGED — it already reads
the transition fold only, and is the proof the fold
generalizes (spec §7's field-values live-path check:
WO01's Review event returns its 6 values).

- [ ] **Step 12.6: Commit**

```bash
git add api/mock-data.ts api/mock-data/seed-message-pairs.ts \
  api/routes.ts
git commit -m "reshape seed traces into transition op pairs"
```

### Task 13: Delete the route, fence, funnel, and policy verb

**Files:**
- Modify: `api/routes.ts:4898-4949` (route entry),
  `:2578-2585` (`WRITE_RESPONSE_SPECS['states/:id']`)
- Modify: `api/api.ts:441-479` (pre-dispatch states fence)
- Modify: `api/authorization.ts:140`
  (`MEMBER_VERBS['/states']`)
- Modify: `api/message-pair.ts:135-137`
  (`ORGANIZATION_NESTED_FIRST_SEGMENTS`), `:578-587`
  (`PAIR_WIRED_ROUTE_PATTERNS` `'states/:id'`)
- Modify: `web-app/app/adapters/state-events.ts:27-43`
  (`postStateEvent`)
- Modify: `api/validators.ts` (`validateStateBody`, ~:2447)

**Interfaces:**
- Consumes: zero callers everywhere — stages 1-3 repointed
  all four production `postStateEvent` callers; verify with
  `grep -rn "postStateEvent" web-app/ api/` (test-file hits
  are Task 15's).
- Produces: every verb on `/states/:id` is a router 404 (the
  route entry is GONE, so the documented
  405-because-PUT-survives case disappears);
  `GET /states` keeps matching (its own `route('states', …)`
  entry survives untouched).

- [ ] **Step 13.1: Delete in dependency order**

1. routes.ts: delete the whole `route('states/:id', { put … })`
   entry (:4912-4949) AND the retirement comment above it that
   says "PUT survives" (:4944-4947 region) — the surviving
   `route('states', …)` GET (:4898-4907) and
   `route('states/:id/field-values', …)` (:4328-4335) stay.
2. routes.ts: delete `WRITE_RESPONSE_SPECS['states/:id']`
   (:2578-2585).
3. api.ts: delete the `if (method === 'PUT' && routePattern
   === 'states/:id')` fence block (:449-479's states arm) and
   its THE STATE OWNERSHIP WRITE FENCE comment; keep the
   Region B try/catch shell and its other guards — rewrite
   the Region B header comment's "three UNCONDITIONAL write
   guards" count to match what remains.
4. authorization.ts:140: `'/states': ['GET', 'PUT']` →
   `'/states': ['GET']`.
5. message-pair.ts: remove `'states/:id'` from
   `PAIR_WIRED_ROUTE_PATTERNS`. Do NOT touch
   `ORGANIZATION_NESTED_FIRST_SEGMENTS` yet — the derive arms
   Task 14 deletes still call
   `canonicalUriPrefix(organization, '/states/')`, and
   removing `'states'` from that set here would silently
   flip their prefix to un-nested mid-stage. It moves in
   Task 14.
6. state-events.ts: delete `postStateEvent` (the read helpers
   below it all survive). Also delete `buildStateEventOp` if
   present — grep first; SCHEMA.md names it, the funnel owns
   it.
7. validators.ts: delete `validateStateBody` + its
   `STATE_BODY_KEYS` (both consumers died in 1-2); grep
   `validateStateBody` to confirm zero remaining imports.
   If `LedgerImmutabilityError` (thrown only by the deleted
   route body) has no other thrower, delete the class and its
   HTTP-409 mapping arm in api.ts — grep
   `LedgerImmutabilityError` first; if invitations or another
   family throws it, leave it.

- [ ] **Step 13.2: Type-check to find stragglers**

```bash
npx tsc --noEmit -p web-app/app/tsconfig.json
```
Expected: errors ONLY in tests (Task 15's list). Any
production-file error is a caller stages 1-3 missed — fix it
by repointing, never by resurrecting the funnel.

- [ ] **Step 13.3: Commit**

```bash
git add api/ web-app/app/adapters/state-events.ts
git commit -m "delete the states/:id route, fence, and funnel"
```

### Task 14: Derive-plane retirement

**Files:**
- Modify: `api/derive-states.ts` — `:121-122` (pattern),
  `:130-163` (`eventPairStatesFrom`), `:173-187`
  (`deriveEventPairStates`), `:210-256`
  (`stateEventFieldsEqual` + `stateEventCollisionFromPairs`),
  `:846-903` (`stateEventVisibilityFor` tier (i)),
  `:1161-1306` (replay signatures), `:1318-1426`
  (`deriveWorkOrderLifecycle` states arm), `:1475-1548`
  (`workOrderClaimSourcesFor` states arm), `:2172-2238`
  (both unions), `:2271-2320` (`documentStateHeadFor` states
  arm), `:33-97` (header)
- Modify: `api/derive-state-field-values.ts:47-48`
  (leaf pattern), `:115-128` (`leafFieldValueCandidates`),
  `:138-159` (`stateFieldValuesFrom` union)

**Interfaces:**
- Consumes: nothing new — pure deletion and re-anchoring.
- Produces: `deriveStates` is a FIVE-source union (trio
  families, members trio, work-order replay, flow graph,
  invitations); `deriveStatesFor` loses `eventPairRows`;
  `stateEventVisibilityFor` is op-born + trio only (tiers
  (ii)/(iii) survive verbatim); the work-order replay loses
  its `statesAddressEvents` parameter end-to-end;
  `stateFieldValuesFrom` is single-source (transition fold);
  `documentStateHeadFor` walks document history only.

- [ ] **Step 14.1: Delete the source functions**

derive-states.ts: delete `STATES_ADDRESS_PATTERN`,
`eventPairStatesFrom`, `deriveEventPairStates`,
`stateEventFieldsEqual`, `stateEventCollisionFromPairs`
(:121-256 region — keep unrelated neighbors). Delete
`stateEventVisibilityFor`'s tier (i) block (:864-890, the
`STATES_ADDRESS_PATTERN` loop) and renumber its tier comments
— (ii)/(iii) survive byte-identical.

- [ ] **Step 14.2: Strip the states arm from the replay
  plumbing**

- `priorClaimCandidates` / `applyClaimPair` /
  `applyReleasePair` / `replayWorkOrderOperations`: remove the
  `statesAddressEvents` parameter everywhere (it is now always
  `[]` — dead). Update `deriveWorkOrderLifecycle` (drop the
  `statesAddressByWorkOrder` grouping and its
  `eventPairStatesFrom` call) and `workOrderClaimSourcesFor`
  (drop the `statesPrefix` read; `WorkOrderClaimSources`
  loses `statesAddressEvents`; `workOrderClaimHistoryFor`
  returns `replayed` sorted, no union).
- `documentStateHeadFor` (:2271-2320): delete the
  `statesPrefix` read and the merge — the head is the
  document history's latest alone. (Decision recorded: the
  helper SURVIVES with its states arm deleted; the one test
  premised on a standalone states/:id event retires —
  Task 15. The four drift-phase14 genesis-echo pins keep
  their oracle.)

- [ ] **Step 14.3: Re-anchor the unions + header**

- `deriveStates` (:2172-2189): remove `deriveEventPairStates`
  from the sources array.
- `deriveStatesFor` (:2210-2238): remove `eventPairRows` from
  destructure, call list, and merge.
- Header comment (:33-97): source (a) is deleted — renumber
  to a FIVE-source union: trio families (five), members trio,
  work-order replay, flow-graph sidecars, invitations. Note
  in one sentence that the states/:id address is retired and
  nothing recognizes it.

- [ ] **Step 14.4: Single-source the field values**

derive-state-field-values.ts: delete
`FIELD_VALUES_LEAF_ADDRESS_PATTERN` +
`leafFieldValueCandidates`; `stateFieldValuesFrom` (:138-159)
keeps only `transitionFieldValueCandidates`; rewrite its
two-source union comment to name the single fold source.

- [ ] **Step 14.4b: Retire the `'states'` prefix fallback**

api/message-pair.ts:135-137 — with every
`canonicalUriPrefix(…, '/states/')` caller now deleted
(verify: `grep -rn "'/states/'" api/ web-app/` → zero
production hits), remove `'states'` from
`ORGANIZATION_NESTED_FIRST_SEGMENTS`. If the set becomes
empty, keep the empty set and rewrite its comment — removing
the fallback MECHANISM is scope creep.

- [ ] **Step 14.5: Compile check + commit**

```bash
npx tsc --noEmit -p web-app/app/tsconfig.json
```
Expected: test-file errors only.

```bash
git add api/derive-states.ts api/derive-state-field-values.ts
git commit -m "retire the states-address derive sources"
```

### Task 15: Test re-baselines and retirements

**Files:**
- Delete: `tests/derive-state-event-collision.test.ts`
- Modify: `tests/api-states-ownership-fence.test.ts` (retire
  to a re-pin block), `tests/api.test.ts:73-94`,
  `tests/derive-states-events.test.ts`,
  `tests/derive-states-union.test.ts:388-392`,
  `tests/derive-document-state-head-for.test.ts:114-144`,
  `tests/store-parent-scoped-flowgraph-fence.test.ts`,
  `tests/api-organization-isolation.test.ts`,
  `tests/shadow-ledger-invariants.test.ts:200-261`,
  `tests/api-fence-redaction.test.ts:62-66`,
  `tests/api-actor-from-token.test.ts`,
  `tests/drift-identities.test.ts:85-87`,
  `tests/drift-roster.test.ts:76`,
  `tests/adapters-state-events.test.ts`,
  `tests/mock-data-pairs.test.ts`,
  `tests/drift-states.test.ts:230-261`,
  `tests/drift-work-orders.test.ts` (residual comments),
  `tests/mock-data-fingerprint.test.ts` (verify only)

**Interfaces:**
- Consumes: everything above. Produces: `./test` green.

- [ ] **Step 15.1: The retirement re-pin (the
  stealth-weakening trap)**

Replace `tests/api-states-ownership-fence.test.ts`'s content
with a compact retirement-pin file (keep the filename — the
Phase 15 re-pin precedent at :564-639 lives here; its own
header warns that a fence-404 masquerading as router-404 is a
regression). Pin, through `handleRequest` with a valid
member-tier token:
```ts
// States-address retirement: every verb on /states/:id is a
// ROUTER 404 — the route entry is deleted, so the old
// 405-because-PUT-survives case is gone. These pins are
// against a VALID token and an OWN-ORG entity id in the body,
// so a passing 404 can only be the router's (the ownership
// fence that once produced look-alike 404s is deleted).
for (const method of ['GET', 'PUT', 'POST', 'DELETE']) {
    test(`${method} /states/:id is a router 404`, ...);
}
// Surviving reads still match:
test('GET /states is 200', ...);
test('GET /states/:id/field-values is 200', ...);
test('GET /entity-states/:id/history is 200', ...);
// The §4 write-intent coverage re-homed in stages 1-3:
// member archive → PUT members/:id (api-member-documents),
// objective archive → PUT objectives/:id
// (api-objective-document), unclaim → POST release
// (api-work-order-release). Cross-org WRITE forgery is now
// impossible by construction — no address accepts a body
// naming a foreign entity_id; the per-family write-ownership
// fence pins live in api-write-ownership-fence.test.ts.
```
Replace `tests/api.test.ts:73-94`'s 409 pin with a 404 pin on
the same address (`PUT` twice → both 404; the immutability
contract retired with `stateEventCollisionFromPairs` — the
document plane's own idempotency/collision behavior is pinned
by its family tests).

- [ ] **Step 15.2: Retire and re-point the derive tests**

- `git rm tests/derive-state-event-collision.test.ts`
  (subject deleted).
- `tests/derive-states-events.test.ts`: `deriveEventPairStates`
  is its named subject — retire the file
  (`git rm`) unless it also covers surviving helpers; if
  mixed, keep only the surviving-helper cases.
- `tests/derive-states-union.test.ts:388-392`: the union leg
  that PUT `/states/:id` — replace with a members-trio or
  objectives-trio leg proving the same union property.
- `tests/derive-document-state-head-for.test.ts`: delete the
  standalone-states-event test (:114-144); the other three
  survive (the helper survives, states arm gone).
- `tests/store-parent-scoped-flowgraph-fence.test.ts`: its
  states/:id re-pin legs re-point to a surviving write
  address per its own NAMED re-pin idiom.
- `tests/api-organization-isolation.test.ts`: seeds that PUT
  `/states/se…` re-point to the address each entity now
  carries (member trio / objective trio / transition op); the
  nested `states/:id/field-values` READ fence tests (:967-1004)
  keep working (route survives) — re-verify.
- `tests/shadow-ledger-invariants.test.ts:200-261`: the
  event-append leg re-points to a trio PUT.
- `tests/api-fence-redaction.test.ts:62-66`: Region-B fault
  coverage re-points to a SURVIVING guarded region (the
  entity-states history fence); the redaction contract, not
  the address, is the subject.
- `tests/api-actor-from-token.test.ts`: re-point its
  states/:id write (if live, :31 region) to `PUT members/:id`
  — actor-stamping is the subject.
- `tests/adapters-state-events.test.ts`: drop `postStateEvent`
  cases; read-helper pins survive.
- Comment-only rewrites: drift-identities.test.ts:85-87,
  drift-roster.test.ts:76 (the "generic member-tier-reachable
  PUT /states/:id" escape-hatch language names the release op
  / trio PUTs now).

- [ ] **Step 15.3: Re-derive the pins empirically**

```bash
./test 2>&1 | grep -E "expected|actual" | head -30
node --experimental-strip-types \
  "$SCRATCH/states-oracle.mjs" "$SCRATCH/oracle-stage4.json"
diff "$SCRATCH/oracle-stage1.json" "$SCRATCH/oracle-stage4.json"
```
- `EXPECTED_PAIR_COUNT`: set to the MEASURED value (expected
  1506 = 1513 − 861 traces − 7 leaves + 861 transitions);
  rewrite the accounting comment (212-hand-authored, 861
  traces as transition ops, field values folded, genesis in
  the members trio).
- Bootstrap stays 13 (no stage-4 bootstrap change).
- `tests/drift-states.test.ts:230-261`: rewrite the stale
  "911" narration; keep `assert.ok(seenIds.size > 800)` if it
  passes (the oracle diff proves the derived rows are
  IDENTICAL to stage 1, so it must).
- `tests/mock-data-fingerprint.test.ts`: verify untouched
  (clients sentinel only).
- Oracle: byte-identical to stage 1. This is spec §7's parity
  gate — field-level equality, not a count.

- [ ] **Step 15.4: Full validate + commit**

```bash
./validate
```
Expected: GREEN — this is the stage-4 code gate.

```bash
git add tests/
git commit -m "re-pin oracles for the retired states address"
```

### Task 16: Snapshot schema version 3→4

**Files:**
- Modify: `api/db.ts:321` (`SNAPSHOT_SCHEMA_VERSION`)
- Test: the existing snapshot version-gate tests (grep
  `SNAPSHOT_SCHEMA_VERSION` in tests/ — the v2-reject /
  round-trip suites)

- [ ] **Step 16.1: Bump + re-pin**

```ts
export const SNAPSHOT_SCHEMA_VERSION = 4;
```
Add one comment line beside it in the existing bump-history
voice: the 3→4 bump retires the states write address (a pre-
retirement v3 export still carries `states/:id` pairs no
derive source reads — blanket version reject, verified
sufficient; `scanForRetiredKeys` needs nothing). Update any
test that pins the literal version or round-trips an export.
Run `./validate`. Expected: green.

- [ ] **Step 16.2: Commit**

```bash
git add api/db.ts tests/
git commit -m "bump snapshot schema version for retirement"
```

### Tasks 17-21: Documentation — one commit per file (the
### established retirement idiom)

Each doc task: edit, run `./validate` (repo-root .md files are
line-length linted), commit `update <FILE> for states-address
retirement` (adjust to ≈50 chars). Write in each file's
existing voice; the recon anchors below are the complete edit
list per file.

- [ ] **Task 17: CLAUDE.md**
  - :151-163 — the Phase 15 sentence: drop "bare
    `GET states/:id` is 405 because PUT survives"; all states
    retirements are router 404 now.
  - :327 + :336-338 — pair-count pin (1514→1506, bootstrap 13)
    and the two retired test-file names
    (api-states-ownership-fence re-scoped to retirement pins;
    derive-state-event-collision deleted).
  - :419-430 — snapshot gate: append the 3→4 bump sentence
    (noting this bump is an address retirement, not a
    TABLE_NAMES shrink).
  - :439-454 — the "Lifecycle is append-only" gotcha (the
    single most load-bearing paragraph): surviving surface is
    `GET /states`, `GET /entity-states/:id/history`,
    `GET /states/:id/field-values` ONLY; lifecycle writes are
    document-trio PUTs (ideas/projects/records/flows/
    objectives/members) and named ops (work-order create/
    claim/transition/release, invitations); every verb on
    `/states/:id` is 404; `stateEventCollisionFromPairs` is
    gone.
- [ ] **Task 18: SCHEMA.md**
  - :34-38 version gate 3→4 (mirror the existing bump
    sentences).
  - :79-91 "State and deletion": drop "`states/:id`
    event-append" from the mechanism list (document PUT and
    operation POST cover every family now).
  - :144-146 pin re-baseline (1506/13).
  - :234-268 "State alphabets § Reads": delete the
    `PUT /states/:id` bullet; fix the source-count language
    (five-source union); delete or re-scope the
    `buildStateEventOp` closing paragraph (the funnel is
    gone; only read helpers survive in state-events.ts).
- [ ] **Task 19: ARCHITECTURE.md**
  - :360-369 500-fallback: drop the deleted states fence from
    the parenthetical example.
  - :438-458 state-route surface (heaviest): no
    `PUT states/:id`, no 405 exception, field-values is
    single-source.
  - :491-507 Phase-14 cores: `workOrderClaimHistoryFor` is
    op-pairs only (claim/release/transition);
    `stateFieldValuesForStateEvent` single-source;
    `documentStateHeadFor` document-history only.
  - :523-538 "LedgerImmutabilityError vs the document-plane
    412": RETIRE the section (its two-mechanism premise died);
    replace with a short paragraph naming the surviving
    document-plane 412 mechanism (and drop the 409 if the
    error class was deleted in Task 13).
  - :570-576 SFV RESTRICT deviation: reword away from "leaf
    family" (the whole-plane-scan justification still holds
    against transition bodies).
  - :612-623 as-built pins: new counts + a 3→4 line in the
    existing voice.
  - :642-654 wire covenant: item 1 loses its 405 exception;
    item 4 survives (narrowed to the transition fold).
  - :656-670 successor derives: `resolveOwningOrganization`
    loses its `PUT states/:id` clause;
    `stateEventCollisionFromPairs` line deleted.
- [ ] **Task 20: API-TREE.md**
  - :61 — rewrite the single `/states/` line: GET /states
    derived (five-source union); GET /states/:id → 404;
    everything else on the address 404; field-values GET
    lives (single-source, transition fold); history GET
    lives.
  - :42 — objectives line: `'trio'` lifecycle, genesis at
    create, archive/reactivate via the document PUT.
  - Add a `release` line beside claim/transition (:19-20):
    `POST work-orders/:id/release` — named unclaim op, 204,
    read-decide-append, replayed at derive.
  - :70 — mock-data pin re-baseline.
- [ ] **Task 21: TEST-PLAN.md**
  - :199-221 — Post-Phase-Final paragraph + retired-routes
    list: five-source union; the 405 bullet folds into the
    404 set; add the release op to the write surface.
  - :559 (AA2) + :2685 (L3) — pin re-baselines (1506/13).
  - :1739-1749 (WB16) — ground-up rewrite around the
    transition op body's `fieldValues` (the entry already
    describes Phase-Final-deleted tables).
  - :1756-1775 (WB19) — drop "/ leaf pairs".
  - :2242-2255 (G41) — the alternative-verification clause
    names the `members/:id` document pair.
  - Add a manual case for claim → unclaim → reclaim via the
    release op if WB-series lacks one (check WB18's shape).

---

# Final verification (spec §7)

- [ ] `./validate` green at HEAD.
- [ ] Oracle: `oracle-stage4.json` ≡ `oracle-stage1.json` ≡
  baseline + the 5 objective genesis rows.
- [ ] `grep -rn "states/:id\|'/states/'" api/ web-app/ | grep
  -v "states/:id/field-values\|entity-states"` → only the
  surviving GET routes and comments that describe the
  retirement.
- [ ] `grep -rn "postStateEvent\|stateEventSeedBody\|
  deriveEventPairStates\|stateEventCollisionFromPairs\|
  STATES_ADDRESS_PATTERN\|deriveMemberGenesis" api/ web-app/
  tests/` → zero hits.
- [ ] Browser pass (TEST-PLAN protocol; `TMPDIR=/tmp/claude
  ./serve 8080` under the sandbox): objective archive →
  reactivate round-trip; member state dropdown save (human +
  AI; detail-only save still folds — inspect the pair count
  for the member id); claim → unclaim → reclaim; claim →
  transition-with-release; WO01 Review event's field-values
  view shows 6 values.
- [ ] Wire pins by hand once: `PUT /states/<any>` → 404;
  `POST /work-orders/<id>/release` → 204 on both branches.
- [ ] Notification plane zero-change (spec §1): confirm
  `identityTargetsFor` (api/notifications.ts) still has no
  states arm and the replacement routes post the same generic
  org-scope + actor notifications (K29) — verify by grep +
  the existing notification tests, no code change expected.

# Execution notes

- Commit subjects above are suggestions at the ≈50-char
  discipline; keep one concern per commit and NEVER fold a
  doc edit into a code commit.
- Mid-stage red is tolerated LOCALLY between the numbered
  tasks of one stage (coupled surfaces change in halves);
  every stage boundary runs `./validate` green before the
  next stage begins, and nothing is pushed mid-stage.
- If any parity diff or measured pin disagrees with this
  plan's expected values, the CODE or the PLAN is wrong —
  stop and reconcile against the spec's oracle rule
  (field-identical derived rows, objective genesis excepted);
  never adjust an assertion to make a diff disappear.

